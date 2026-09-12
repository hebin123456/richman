import type {
  Game,
  Player,
  PlayerInventoryItem,
  PlayerStockHolding,
  PlayerState,
  Prisma,
  PrismaClient,
  PropertyState,
  Room,
  RoomSettings,
  StockState,
} from "@prisma/client";
import { GamePhase, RoomStatus } from "@prisma/client";

import {
  BOARD_TILES,
  JAIL_INDEX,
  getMonopolyGroupSize,
  getTile,
  isPurchasableTile,
  type BoardTile,
} from "@/lib/game/board";
import {
  calculateMonthlySavingsInterest,
  formatDateKeyFromDate,
  formatGameDateLabel,
  getRoundDateKey,
  getRoundNumberForTurn,
  isFirstDayOfMonth,
  isWeekendDateKey,
  resolveCalendarStartDate,
} from "@/lib/game/calendar";
import {
  createShuffledDeck,
  getCardById,
  type CardDeckType,
  type CardDefinition,
} from "@/lib/game/cards";
import { CHARACTER_PRESETS, getCharacterPreset } from "@/lib/game/characters";
import {
  calculateInflationState,
  calculatePlayerTotalAssets,
  calculatePropertyAssetValue,
  getEffectiveBankAmount,
  getEffectiveHouseCost,
  getEffectiveItemAmount,
  getEffectiveItemPrice,
  getEffectiveLotteryBaseJackpot,
  getEffectiveLotteryTicketPrice,
  getEffectiveMortgageValue,
  getEffectivePassStartSalary,
  getEffectivePropertyRent,
  getEffectiveRailroadRent,
  getEffectiveTaxAmount,
  getEffectiveTilePrice,
  getEffectiveUnmortgageCost,
  resolveBankAutoRepayment,
  scaleMoney,
} from "@/lib/game/economy";
import { isRoomExpired } from "@/lib/game/room-expiration";
import {
  parseReactionContext,
  serializeReactionContext,
  type DebuffReactionContextData,
  type PaymentReactionContextData,
  type ReactionContextData,
  type TaxAuditReactionContextData,
} from "@/lib/game/reaction";
import {
  parseRecoveryContext,
  serializeRecoveryContext,
  type RecoveryContextData,
} from "@/lib/game/recovery";
import {
  FREE_PASS_ITEM_KEY,
  INNOCENCE_ITEM_KEY,
  REBOUND_ITEM_KEY,
  VEHICLE_DURATION_TURNS,
  REMOTE_DICE_ITEM_KEY,
  getItemDefinition,
  getVehicleDefinition,
  getVehicleDefinitionByItemKey,
  ITEM_DEFINITIONS,
  type VehicleKey,
} from "@/lib/game/items";
import {
  buildControlledDiceValues,
  rollDiceValues,
} from "@/lib/game/dice";
import {
  LOTTERY_DRAW_INTERVAL,
  LOTTERY_OPTIONS,
  getLotteryOption,
  parseLotteryTickets,
  resolveLotteryDraw,
  serializeLotteryTickets,
} from "@/lib/game/lottery";
import {
  MAP_GOD_MAX_COUNT,
  MAP_GOD_SPAWN_CHANCE,
  createRandomMapGodSpawn,
  getMapGodSpawnAtTile,
  getNearestMapGodSpawn,
  parseMapGodSpawns,
  serializeMapGodSpawns,
  stepMapGodSpawns,
} from "@/lib/game/map-gods";
import {
  GOD_DURATION_TURNS,
  getGodAttachRewardCount,
  getGodDefinition,
  getPurchaseHouseBonusByGod,
  getRandomBlessingGodKey,
  getRandomCurseGodKey,
  isCaishenGodKey,
  isCurseGodKey,
  isFushenGodKey,
  isShuaishenGodKey,
  type GodKey,
} from "@/lib/game/gods";
import { roomEventBus } from "@/lib/game/event-bus";
import { loadRoomSnapshot } from "@/lib/game/snapshot";
import {
  collapsePropertyToEmptyLot,
  getCollapsiblePropertyTileIndexes,
  getPlayerRepairStructureLevels,
  getPropertyStructureLevels,
  getTopLandlordPlayerIds,
} from "@/lib/game/news-house";
import { isItemInShopOffer } from "@/lib/game/shop";
import { STOCK_DEFINITIONS } from "@/lib/game/stocks";
import {
  applyTravelGodToProperty,
  getAffectedTileIndexesForTravelGod,
  getTraversedTileIndexes,
  isTravelGodKey,
} from "@/lib/game/travel-gods";
import type {
  GameActionRequest,
  ManagedReason,
  RoomListItemView,
  RoomSettingsInput,
} from "@/lib/game/types";
import { prisma } from "@/lib/db";
import {
  createPlayerToken,
  createRoomCode,
  normalizePlayerName,
  normalizeRoomCode,
} from "@/lib/session/player-session";


interface GameContext {
  room: Room;
  settings: RoomSettings;
  players: Player[];
  game: Game;
  playerStates: PlayerState[];
  propertyStates: PropertyState[];
  stockStates: StockState[];
  stockHoldings: PlayerStockHolding[];
  inventoryItems: PlayerInventoryItem[];
}

const ALIEN_ABDUCTION_DURATION_TURNS = 3;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const DEFAULT_ROOM_SETTINGS: RoomSettingsInput = {
  startingCash: 2000,
  passStartSalary: 200,
  maxPlayers: 4,
  jailFine: 100,
  parkingJackpotEnabled: true,
  stocksEnabled: false,
  turnSeconds: 120,
};

const BOT_NAME_PREFIX = "电脑";

class GameEngineError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GameEngineError";
  }
}

export function isGameEngineError(error: unknown): error is GameEngineError {
  return error instanceof GameEngineError;
}

function assertCondition(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) {
    throw new GameEngineError(message, status);
  }
}

function clampRoomSettings(input?: Partial<RoomSettingsInput>) {
  return {
    startingCash: clampNumber(
      input?.startingCash,
      DEFAULT_ROOM_SETTINGS.startingCash,
      500,
      10000,
    ),
    passStartSalary: clampNumber(
      input?.passStartSalary,
      DEFAULT_ROOM_SETTINGS.passStartSalary,
      50,
      2000,
    ),
    maxPlayers: clampNumber(
      input?.maxPlayers,
      DEFAULT_ROOM_SETTINGS.maxPlayers,
      2,
      5,
    ),
    jailFine: clampNumber(
      input?.jailFine,
      DEFAULT_ROOM_SETTINGS.jailFine,
      50,
      1000,
    ),
    parkingJackpotEnabled:
      input?.parkingJackpotEnabled ?? DEFAULT_ROOM_SETTINGS.parkingJackpotEnabled,
    stocksEnabled: input?.stocksEnabled ?? DEFAULT_ROOM_SETTINGS.stocksEnabled,
    turnSeconds: clampNumber(
      input?.turnSeconds,
      DEFAULT_ROOM_SETTINGS.turnSeconds,
      30,
      600,
    ),
  };
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const numericValue = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Math.round(numericValue)));
}

async function nextEventSequence(tx: Prisma.TransactionClient, roomId: string) {
  const latestEvent = await tx.gameEvent.findFirst({
    where: { roomId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  return (latestEvent?.sequence ?? 0) + 1;
}

async function appendEvent(
  tx: Prisma.TransactionClient,
  {
    roomId,
    roomCode,
    gameId,
    actorPlayerId,
    eventType,
    summary,
    payload,
  }: {
    roomId: string;
    roomCode: string;
    gameId?: string | null;
    actorPlayerId?: string | null;
    eventType: string;
    summary: string;
    payload?: unknown;
  },
) {
  const sequence = await nextEventSequence(tx, roomId);
  const event = await tx.gameEvent.create({
    data: {
      roomId,
      gameId: gameId ?? null,
      actorPlayerId: actorPlayerId ?? null,
      sequence,
      eventType,
      summary,
      payload: JSON.stringify(payload ?? {}),
    },
  });

  return {
    event,
    roomCode,
  };
}

function publishEvent(roomCode: string, sequence: number, eventType: string, summary: string) {
  roomEventBus.publish(roomCode, {
    type: "room-updated",
    roomCode,
    sequence,
    eventType,
    summary,
  });
}

export async function purgeExpiredRooms(db: PrismaLike) {
  const rooms = await db.room.findMany({
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (rooms.length === 0) {
    return 0;
  }

  const latestEvents = await db.gameEvent.groupBy({
    by: ["roomId"],
    where: {
      roomId: {
        in: rooms.map((room) => room.id),
      },
    },
    _max: {
      createdAt: true,
    },
  });
  const latestEventMap = new Map(
    latestEvents.map((event) => [event.roomId, event._max.createdAt ?? null]),
  );

  const expiredRoomIds = rooms
    .filter((room) =>
      isRoomExpired({
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        latestEventAt: latestEventMap.get(room.id) ?? null,
      }),
    )
    .map((room) => room.id);

  if (expiredRoomIds.length === 0) {
    return 0;
  }

  const result = await db.room.deleteMany({
    where: {
      id: { in: expiredRoomIds },
    },
  });

  return result.count;
}

async function generateUniqueRoomCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const code = createRoomCode();
    const existingRoom = await tx.room.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!existingRoom) {
      return code;
    }
  }

  throw new GameEngineError("生成房间码失败。", 500);
}

function parseDeck(serializedDeck: string) {
  return JSON.parse(serializedDeck) as string[];
}

function serializeDeck(deck: string[]) {
  return JSON.stringify(deck);
}

function getDeckDisplayName(deck: CardDeckType) {
  return deck === "chance" ? "机会卡" : "命运卡";
}

function formatGodAttachFlash(content: string) {
  return `神明附身快报：${content}`;
}

function formatGodAttachRewardSummary(godName: string | null | undefined, rewards: string[]) {
  if (rewards.length === 0) {
    return "";
  }

  if (rewards.length === 1) {
    return ` ${godName ?? "福神"}刚附身，先送来了一张 ${rewards[0]}。`;
  }

  return ` ${godName ?? "福神"}刚附身，先送来了两张卡：${rewards.join("、")}。`;
}

function getDeckFlashMarker(deck: CardDeckType) {
  return deck === "chance" ? "机会快报：" : "命运快报：";
}

function formatDeckFlash(deck: CardDeckType, content: string) {
  return `${getDeckFlashMarker(deck)}${content}`;
}

function readDeckState(game: Game, deck: CardDeckType) {
  return {
    cardIds: parseDeck(deck === "chance" ? game.chanceDeck : game.communityDeck),
    index: deck === "chance" ? game.chanceIndex : game.communityIndex,
  };
}

function writeDeckState(game: Game, deck: CardDeckType, cardIds: string[], index: number) {
  if (deck === "chance") {
    game.chanceDeck = serializeDeck(cardIds);
    game.chanceIndex = index;
    return;
  }

  game.communityDeck = serializeDeck(cardIds);
  game.communityIndex = index;
}

function drawDeckCard(ctx: GameContext, deck: CardDeckType): CardDefinition {
  let { cardIds, index } = readDeckState(ctx.game, deck);
  if (cardIds.length === 0 || index >= cardIds.length) {
    cardIds = createShuffledDeck(deck);
    index = 0;
  }

  const cardId = cardIds[index] ?? cardIds[0];
  const card = cardId ? getCardById(cardId) : null;
  assertCondition(card, `${getDeckDisplayName(deck)}已损坏，无法继续抽牌。`, 500);

  index += 1;
  if (index >= cardIds.length) {
    writeDeckState(ctx.game, deck, createShuffledDeck(deck), 0);
  } else {
    writeDeckState(ctx.game, deck, cardIds, index);
  }

  return card;
}

function getLotteryTickets(game: Game) {
  return parseLotteryTickets(game.lotteryTickets);
}

function setLotteryTickets(game: Game, tickets: ReturnType<typeof getLotteryTickets>) {
  game.lotteryTickets = serializeLotteryTickets(tickets);
}

function getMapGodSpawns(game: Game) {
  return parseMapGodSpawns(game.mapGodSpawns);
}

function setMapGodSpawns(game: Game, spawns: ReturnType<typeof getMapGodSpawns>) {
  game.mapGodSpawns = serializeMapGodSpawns(spawns);
}

function getRandomItemDefinition() {
  return ITEM_DEFINITIONS[Math.floor(Math.random() * ITEM_DEFINITIONS.length)] ?? ITEM_DEFINITIONS[0];
}

function awardItem(ctx: GameContext, playerId: string, itemKey: string) {
  const inventoryItem = findInventoryItem(ctx, playerId, itemKey);
  inventoryItem.quantity += 1;
  return getItemDefinition(itemKey);
}

function setActiveGod(playerState: PlayerState, godKey: GodKey) {
  playerState.activeGodKey = godKey;
  playerState.godTurns = GOD_DURATION_TURNS;
}

function setActiveGodWithTurns(playerState: PlayerState, godKey: GodKey, turns: number) {
  playerState.activeGodKey = godKey;
  playerState.godTurns = Math.max(1, turns);
}

function clearActiveGod(playerState: PlayerState) {
  playerState.activeGodKey = null;
  playerState.godTurns = 0;
}

function getEffectiveActiveGod(playerState: PlayerState) {
  const god = getGodDefinition(playerState.activeGodKey);
  return god && playerState.godTurns > 0 ? god : null;
}

function getFushenProtection(playerState: PlayerState) {
  const god = getEffectiveActiveGod(playerState);
  return god && isFushenGodKey(god.key) ? god : null;
}

function getBuildHouseCostByGod(playerState: PlayerState, baseCost: number) {
  const god = getEffectiveActiveGod(playerState);
  return god && isCaishenGodKey(god.key) ? 0 : baseCost;
}

function getBuildHouseStepByGod(playerState: PlayerState) {
  const god = getEffectiveActiveGod(playerState);
  return god && isFushenGodKey(god.key) ? 2 : 1;
}

function awardGodAttachRewards(
  ctx: GameContext,
  playerId: string,
  godKey: GodKey,
) {
  const rewardCount = getGodAttachRewardCount(godKey);
  if (rewardCount <= 0) {
    return [];
  }

  return Array.from({ length: rewardCount }, () => {
    const randomItem = getRandomItemDefinition();
    const itemDefinition = awardItem(ctx, playerId, randomItem.key);
    return itemDefinition?.name ?? randomItem.name;
  });
}

function attachGodToPlayer(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  godKey: GodKey,
  turns = GOD_DURATION_TURNS,
) {
  setActiveGodWithTurns(playerState, godKey, turns);
  const god = getGodDefinition(godKey);
  const rewards = awardGodAttachRewards(ctx, player.id, godKey);
  return {
    god,
    rewards,
  };
}

function pullNearestMapGodToPlayer(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
) {
  const spawns = getMapGodSpawns(ctx.game);
  const nearestMapGod = getNearestMapGodSpawn(spawns, playerState.position);
  if (!nearestMapGod) {
    return null;
  }

  setMapGodSpawns(
    ctx.game,
    spawns.filter(
      (spawn) =>
        !(
          spawn.tileIndex === nearestMapGod.tileIndex &&
          spawn.godKey === nearestMapGod.godKey &&
          spawn.turnsRemaining === nearestMapGod.turnsRemaining
        ),
    ),
  );

  const tile = getTile(nearestMapGod.tileIndex);
  return {
    tile,
    ...attachGodToPlayer(ctx, player, playerState, nearestMapGod.godKey),
  };
}

function trySendToJailWithFushenProtection(playerState: PlayerState) {
  const god = getFushenProtection(playerState);
  if (god) {
    return {
      jailed: false,
      god,
    };
  }

  sendToJail(playerState);
  return {
    jailed: true,
    god: null,
  };
}

function setActiveVehicle(playerState: PlayerState, vehicleKey: VehicleKey) {
  playerState.activeVehicleKey = vehicleKey;
  playerState.vehicleTurns = VEHICLE_DURATION_TURNS;
}

function setManagedMode(playerState: PlayerState, reason: ManagedReason) {
  playerState.isManaged = true;
  playerState.managedReason = reason;
}

function clearManagedMode(playerState: PlayerState) {
  playerState.isManaged = false;
  playerState.managedReason = null;
}

function clearActiveVehicle(playerState: PlayerState) {
  playerState.activeVehicleKey = null;
  playerState.vehicleTurns = 0;
}

function getVehicleMaxDiceCount(playerState: PlayerState) {
  const vehicle = getVehicleDefinition(playerState.activeVehicleKey);
  if (!vehicle || playerState.vehicleTurns <= 0) {
    return 1;
  }

  return vehicle.diceCount;
}

function resolveRequestedDiceCount(playerState: PlayerState, requestedDiceCount?: number) {
  const maxDiceCount = getVehicleMaxDiceCount(playerState);
  if (requestedDiceCount === null || requestedDiceCount === undefined) {
    return maxDiceCount;
  }

  assertCondition(
    Number.isInteger(requestedDiceCount) &&
      requestedDiceCount >= 1 &&
      requestedDiceCount <= maxDiceCount,
    `当前最多只能掷 ${maxDiceCount} 个骰子。`,
  );

  return requestedDiceCount;
}

function consumeVehicleTurn(playerState: PlayerState) {
  const vehicle = getVehicleDefinition(playerState.activeVehicleKey);
  if (!vehicle || playerState.vehicleTurns <= 0) {
    clearActiveVehicle(playerState);
    return null;
  }

  playerState.vehicleTurns -= 1;
  if (playerState.vehicleTurns <= 0) {
    clearActiveVehicle(playerState);
    return vehicle;
  }

  return null;
}

function formatDiceRoll(values: number[]) {
  return values.join(" + ");
}

function maybeSpawnMapGod(ctx: GameContext) {
  const spawns = stepMapGodSpawns(getMapGodSpawns(ctx.game));
  let summary = "";
  const shouldSpawn =
    spawns.length < MAP_GOD_MAX_COUNT &&
    (spawns.length === 0 || Math.random() < MAP_GOD_SPAWN_CHANCE);

  if (shouldSpawn) {
    const spawn = createRandomMapGodSpawn(spawns.map((item) => item.tileIndex));
    if (spawn) {
      spawns.push(spawn);
      const god = getGodDefinition(spawn.godKey);
      const tile = getTile(spawn.tileIndex);
      summary = ` 地图上出现了${god?.name ?? "神明"}，停留在 ${tile.name}。`;
    }
  }

  setMapGodSpawns(ctx.game, spawns);
  return summary;
}

function claimMapGodAtCurrentTile(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
) {
  const spawns = getMapGodSpawns(ctx.game);
  const mapGod = getMapGodSpawnAtTile(spawns, playerState.position);
  if (!mapGod) {
    return "";
  }

  setMapGodSpawns(
    ctx.game,
    spawns.filter((spawn) => spawn.tileIndex !== mapGod.tileIndex),
  );
  const { god, rewards } = attachGodToPlayer(ctx, player, playerState, mapGod.godKey);
  const rewardSummary = formatGodAttachRewardSummary(god?.name, rewards);
  if (isCurseGodKey(mapGod.godKey)) {
    return formatGodAttachFlash(
      `${player.name} 在地图上撞见了${god?.name ?? "坏神"}，接下来 ${GOD_DURATION_TURNS} 天会持续倒霉。`,
    );
  }

  return formatGodAttachFlash(
    `${player.name} 在地图上遇见了${god?.name ?? "神明"}，接下来 ${GOD_DURATION_TURNS} 天都会生效。${rewardSummary}`,
  );
}

async function getLobbyRoom(tx: Prisma.TransactionClient, roomCode: string) {
  await purgeExpiredRooms(tx);
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const room = await tx.room.findUnique({
    where: { code: normalizedRoomCode },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
    },
  });

  assertCondition(room && room.settings, "房间不存在。", 404);
  return room;
}

async function hydrateGameContext(
  tx: Prisma.TransactionClient,
  room:
    | (Room & {
        settings: RoomSettings | null;
        players: Player[];
        game:
          | (Game & {
              playerStates: PlayerState[];
              propertyStates: PropertyState[];
              stockStates: StockState[];
              stockHoldings: PlayerStockHolding[];
              inventoryItems: PlayerInventoryItem[];
            })
          | null;
      })
    | null,
): Promise<GameContext> {
  assertCondition(room?.settings && room.game, "对局不存在。", 404);
  const game = room.game;
  game.calendarStartDate = resolveCalendarStartDate(game.calendarStartDate, game.createdAt);

  const missingPropertyTiles = BOARD_TILES.filter(isPurchasableTile).filter(
    (tile) => !game.propertyStates.some((property) => property.tileIndex === tile.index),
  );

  let propertyStates = game.propertyStates;
  if (missingPropertyTiles.length > 0) {
    await tx.propertyState.createMany({
      data: missingPropertyTiles.map((tile) => ({
        gameId: game.id,
        tileIndex: tile.index,
      })),
    });
    propertyStates = await tx.propertyState.findMany({
      where: { gameId: game.id },
      orderBy: { tileIndex: "asc" },
    });
  }

  const missingInventoryItems = room.players.flatMap((player) =>
    ITEM_DEFINITIONS.filter(
      (item) =>
        !game.inventoryItems.some(
          (inventoryItem) =>
            inventoryItem.playerId === player.id && inventoryItem.itemKey === item.key,
        ),
    ).map((item) => ({
      gameId: game.id,
      playerId: player.id,
      itemKey: item.key,
      quantity: 0,
    })),
  );

  let inventoryItems = game.inventoryItems;
  if (missingInventoryItems.length > 0) {
    await tx.playerInventoryItem.createMany({
      data: missingInventoryItems,
    });
    inventoryItems = await tx.playerInventoryItem.findMany({
      where: {
        playerId: {
          in: room.players.map((player) => player.id),
        },
      },
    });
  }

  return {
    room,
    settings: room.settings,
    players: room.players,
    game,
    playerStates: game.playerStates,
    propertyStates,
    stockStates: game.stockStates,
    stockHoldings: game.stockHoldings,
    inventoryItems,
  };
}

async function getGameContext(
  tx: Prisma.TransactionClient,
  gameId: string,
): Promise<GameContext> {
  await purgeExpiredRooms(tx);
  const room = await tx.room.findFirst({
    where: {
      game: {
        id: gameId,
      },
    },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
      game: {
        include: {
          playerStates: true,
          propertyStates: {
            orderBy: {
              tileIndex: "asc",
            },
          },
          stockStates: {
            orderBy: {
              symbol: "asc",
            },
          },
          stockHoldings: true,
          inventoryItems: true,
        },
      },
    },
  });

  return hydrateGameContext(tx, room);
}

async function getGameContextByRoomCode(
  tx: Prisma.TransactionClient,
  roomCode: string,
): Promise<GameContext> {
  await purgeExpiredRooms(tx);
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const room = await tx.room.findUnique({
    where: { code: normalizedRoomCode },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
      game: {
        include: {
          playerStates: true,
          propertyStates: {
            orderBy: { tileIndex: "asc" },
          },
          stockStates: {
            orderBy: { symbol: "asc" },
          },
          stockHoldings: true,
          inventoryItems: true,
        },
      },
    },
  });

  return hydrateGameContext(tx, room);
}

function findPlayerByToken(players: Player[], playerToken: string) {
  return players.find((player) => player.token === playerToken) ?? null;
}

function findPlayerState(ctx: GameContext, playerId: string) {
  const state = ctx.playerStates.find((item) => item.playerId === playerId);
  assertCondition(state, "玩家状态不存在。", 500);
  return state;
}

function findPropertyState(ctx: GameContext, tileIndex: number) {
  const property = ctx.propertyStates.find((item) => item.tileIndex === tileIndex);
  assertCondition(property, "地产状态不存在。", 500);
  return property;
}

function findStockState(ctx: GameContext, symbol: string) {
  const stockState = ctx.stockStates.find((item) => item.symbol === symbol);
  assertCondition(stockState, "股票状态不存在。", 500);
  return stockState;
}

function findStockHolding(ctx: GameContext, playerId: string, symbol: string) {
  const stockState = findStockState(ctx, symbol);
  const holding = ctx.stockHoldings.find(
    (item) => item.playerId === playerId && item.stockStateId === stockState.id,
  );
  assertCondition(holding, "股票持仓不存在。", 500);
  return holding;
}

function findInventoryItem(ctx: GameContext, playerId: string, itemKey: string) {
  const inventoryItem = ctx.inventoryItems.find(
    (item) => item.playerId === playerId && item.itemKey === itemKey,
  );
  assertCondition(inventoryItem, "背包道具不存在。", 500);
  return inventoryItem;
}

function getInventoryItemsByPlayer(ctx: GameContext, playerId: string) {
  return ctx.inventoryItems.filter((item) => item.playerId === playerId && item.quantity > 0);
}

function tryConsumeInventoryItem(ctx: GameContext, playerId: string, itemKey: string) {
  const inventoryItem = findInventoryItem(ctx, playerId, itemKey);
  if (inventoryItem.quantity <= 0) {
    return false;
  }

  inventoryItem.quantity -= 1;
  return true;
}

function getPlayer(ctx: GameContext, playerId: string) {
  const player = ctx.players.find((item) => item.id === playerId);
  assertCondition(player, "玩家不存在。", 500);
  return player;
}

function getCurrentPlayer(ctx: GameContext) {
  return getPlayer(ctx, ctx.game.currentPlayerId);
}


function getActiveStates(ctx: GameContext) {
  return ctx.playerStates.filter((state) => !state.isBankrupt);
}

function isSleepwalking(playerState: PlayerState) {
  return playerState.sleepwalkingTurns > 0;
}

function isAbducted(playerState: PlayerState) {
  return playerState.abductedTurns > 0;
}

function setAbducted(playerState: PlayerState, turns = ALIEN_ABDUCTION_DURATION_TURNS) {
  playerState.abductedTurns = Math.max(1, turns);
}

function stepAbduction(playerState: PlayerState) {
  if (!isAbducted(playerState)) {
    return false;
  }

  playerState.abductedTurns = Math.max(0, playerState.abductedTurns - 1);
  return playerState.abductedTurns === 0;
}

function setSleepwalking(playerState: PlayerState, turns: number) {
  playerState.sleepwalkingTurns = Math.max(1, turns);
}

function stepSleepwalking(playerState: PlayerState) {
  if (!isSleepwalking(playerState)) {
    return false;
  }

  playerState.sleepwalkingTurns = Math.max(0, playerState.sleepwalkingTurns - 1);
  return playerState.sleepwalkingTurns === 0;
}

interface TargetedDebuffResolution {
  targetPlayer: Player;
  targetState: PlayerState;
  summaryPrefix: string;
}

function resolveTargetedDebuffTarget(
  ctx: GameContext,
  actor: Player,
  targetPlayerId: string,
  itemName: string,
  options?: {
    allowRebound?: boolean;
  },
): TargetedDebuffResolution {
  const targetPlayer = getPlayer(ctx, targetPlayerId);
  const targetState = findPlayerState(ctx, targetPlayerId);
  assertCondition(!targetState.isBankrupt, "目标玩家已经破产。");

  const allowRebound = options?.allowRebound ?? true;

  if (allowRebound && tryConsumeInventoryItem(ctx, targetPlayerId, REBOUND_ITEM_KEY)) {
    const reflected = resolveTargetedDebuffTarget(ctx, targetPlayer, actor.id, itemName, {
      allowRebound: false,
    });
    return {
      ...reflected,
      summaryPrefix: `${targetPlayer.name} 的反弹卡生效，${itemName} 被弹回去了。 ${reflected.summaryPrefix}`,
    };
  }

  return {
    targetPlayer,
    targetState,
    summaryPrefix: "",
  };
}

function canUseActiveEffects(playerState: PlayerState) {
  return !isSleepwalking(playerState) && !isAbducted(playerState);
}

function findNextActivePlayer(ctx: GameContext, currentSeatIndex: number) {
  for (let offset = 1; offset <= ctx.players.length; offset += 1) {
    const candidate = ctx.players[(currentSeatIndex + offset) % ctx.players.length];
    const candidateState = findPlayerState(ctx, candidate.id);

    if (!candidateState.isBankrupt) {
      return candidate;
    }
  }

  return null;
}

function getMortgageableProperties(ctx: GameContext, playerId: string) {
  return ctx.propertyStates.filter((property) => {
    if (property.ownerPlayerId !== playerId || property.mortgaged) {
      return false;
    }

    return isPurchasableTile(getTile(property.tileIndex));
  });
}

function getRecoveryContext(game: Game) {
  return parseRecoveryContext(game.recoveryContext);
}

function clearRecoveryContext(game: Game) {
  game.recoveryContext = null;
}

function getReactionContext(game: Game) {
  return parseReactionContext(game.reactionContext);
}

function clearReactionContext(game: Game) {
  game.reactionContext = null;
}

function beginReactionPhase(ctx: GameContext, reaction: ReactionContextData) {
  ctx.game.phase = GamePhase.WAITING_FOR_ITEM_REACTION;
  ctx.game.currentPlayerId = reaction.reactingPlayerId;
  ctx.game.reactionContext = serializeReactionContext(reaction);
}

function restoreTurnAfterReaction(
  ctx: GameContext,
  reaction: DebuffReactionContextData | TaxAuditReactionContextData,
) {
  clearReactionContext(ctx.game);
  ctx.game.currentPlayerId = reaction.turnPlayerId;
  ctx.game.phase = reaction.returnPhase;
}

function beginPaymentReaction(
  ctx: GameContext,
  actor: Player,
  recovery: RecoveryContextData,
): string {
  const reaction: PaymentReactionContextData = {
    kind: "payment",
    reactingPlayerId: actor.id,
    turnPlayerId: actor.id,
    itemKeys: [FREE_PASS_ITEM_KEY],
    recovery,
  };
  beginReactionPhase(ctx, reaction);
  return `${actor.name} 需要支付 ${recovery.amountDue} 元的${recovery.reason}，可以选择是否使用免费卡。`;
}

function beginTaxAuditReaction(
  ctx: GameContext,
  actor: Player,
  targetPlayer: Player,
  amount: number,
  itemName: string,
): string {
  const reaction: TaxAuditReactionContextData = {
    kind: "taxAudit",
    reactingPlayerId: targetPlayer.id,
    turnPlayerId: actor.id,
    itemKeys: [FREE_PASS_ITEM_KEY],
    sourcePlayerId: actor.id,
    sourcePlayerName: actor.name,
    itemName,
    amount,
    returnPhase: ctx.game.phase,
  };
  beginReactionPhase(ctx, reaction);
  return `${actor.name} 使用了 ${itemName}，${targetPlayer.name} 可以选择是否使用免费卡来免除这次查税。`;
}

function beginDebuffReaction(
  ctx: GameContext,
  actor: Player,
  targetPlayer: Player,
  itemName: string,
  debuffType: DebuffReactionContextData["debuffType"],
  sleepwalkingTurns?: number,
): string {
  const reaction: DebuffReactionContextData = {
    kind: "debuff",
    reactingPlayerId: targetPlayer.id,
    turnPlayerId: actor.id,
    itemKeys: [INNOCENCE_ITEM_KEY],
    sourcePlayerId: actor.id,
    sourcePlayerName: actor.name,
    itemName,
    debuffType,
    returnPhase: ctx.game.phase,
    sleepwalkingTurns,
  };
  beginReactionPhase(ctx, reaction);
  return actor.id === targetPlayer.id
    ? `${itemName} 被反弹回 ${targetPlayer.name} 自己身上，${targetPlayer.name} 可以选择是否使用免罪卡来抵消。`
    : `${actor.name} 使用了 ${itemName}，${targetPlayer.name} 可以选择是否使用免罪卡来抵消。`;
}

function getRecoveryCreditorPlayerId(recovery: RecoveryContextData) {
  return recovery.recipientKind === "player" ? recovery.recipientPlayerId : null;
}

function setTurnReadyPhase(ctx: GameContext, playerState: PlayerState) {
  ctx.game.phase =
    playerState.inJailTurns > 0
      ? GamePhase.WAITING_FOR_JAIL_CHOICE
      : isAbducted(playerState)
        ? GamePhase.WAITING_FOR_ABDUCTION_RETURN
      : GamePhase.WAITING_FOR_ROLL;
}

function applyTurnStartSideEffects(ctx: GameContext, playerId: string) {
  const marketSummary = updateStockMarket(ctx);
  const lotterySummary = settleLotteryDrawIfNeeded(ctx);
  const godSummary = applyTurnStartGodEffect(ctx, playerId);
  const mapGodSummary = maybeSpawnMapGod(ctx);
  return `${marketSummary}${lotterySummary}${godSummary}${mapGodSummary}`;
}

function applyRecoveryRecipientPayment(
  ctx: GameContext,
  recovery: RecoveryContextData,
) {
  switch (recovery.recipientKind) {
    case "player": {
      if (!recovery.recipientPlayerId) {
        return;
      }

      const recipientState = findPlayerState(ctx, recovery.recipientPlayerId);
      recipientState.cash += recovery.amountDue;
      return;
    }
    case "tax":
      if (ctx.settings.parkingJackpotEnabled) {
        ctx.settings.parkingJackpot += recovery.amountDue;
      }
      return;
    case "bank":
      return;
  }
}

function completeRecoveryPayment(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  recovery: RecoveryContextData,
) {
  actorState.cash -= recovery.amountDue;
  applyRecoveryRecipientPayment(ctx, recovery);
  if (recovery.clearBankDebtOnSuccess) {
    actorState.bankDebt = 0;
  }

  return continueAfterRecoveredPayment(ctx, actor, actorState, recovery.successSummary, recovery);
}

function continueAfterRecoveredPayment(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  successSummary: string,
  recovery: RecoveryContextData,
) {
  clearRecoveryContext(ctx.game);

  if (recovery.continuation === "postAction") {
    setPostActionPhase(ctx, actorState, ctx.game.rollAgainAvailable);
    return successSummary;
  }

  if (recovery.continuation === "waitForRoll") {
    actorState.inJailTurns = 0;
    ctx.game.rollAgainAvailable = false;
    ctx.game.phase = GamePhase.WAITING_FOR_ROLL;
    return successSummary;
  }

  ctx.game.rollAgainAvailable = false;
  setTurnReadyPhase(ctx, actorState);
  return `${successSummary}${applyTurnStartSideEffects(ctx, actor.id)}`;
}

function completeFreePassPayment(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  recovery: RecoveryContextData,
) {
  clearReactionContext(ctx.game);
  const summary = `${actor.name} 的免费卡生效，免除了 ${recovery.amountDue} 元的${recovery.reason}。`;
  return continueAfterRecoveredPayment(ctx, actor, actorState, summary, recovery);
}

function resolveRecoveryAfterPropertyAction(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
) {
  const recovery = getRecoveryContext(ctx.game);
  if (ctx.game.phase !== GamePhase.WAITING_FOR_RECOVERY || !recovery) {
    return "";
  }

  if (actorState.cash >= recovery.amountDue) {
    return ` ${completeRecoveryPayment(ctx, actor, actorState, recovery)}`;
  }

  if (getMortgageableProperties(ctx, actor.id).length > 0) {
    return ` 还差 ${recovery.amountDue - actorState.cash} 元，需要继续抵押地产。`;
  }

  const creditorPlayerId = getRecoveryCreditorPlayerId(recovery);
  bankruptPlayer(ctx, actor.id, creditorPlayerId);
  const bankruptcySummary = recovery.bankruptcySummary;
  clearRecoveryContext(ctx.game);
  return maybeFinishGame(ctx)
    ? ` ${bankruptcySummary}`
    : ` ${advanceTurn(ctx, bankruptcySummary)}`;
}

function resolveRequiredCashPayment(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  recovery: RecoveryContextData,
  options?: {
    allowFreePass?: boolean;
    skipFreePassReaction?: boolean;
  },
): { status: "completed" | "reaction" | "recovery" | "bankrupt"; summary: string } {
  const freePassItem = options?.allowFreePass
    ? findInventoryItem(ctx, actor.id, FREE_PASS_ITEM_KEY)
    : null;
  if (
    options?.allowFreePass &&
    !options.skipFreePassReaction &&
    (freePassItem?.quantity ?? 0) > 0
  ) {
    return {
      status: "reaction",
      summary: beginPaymentReaction(ctx, actor, recovery),
    };
  }

  if (actorState.cash >= recovery.amountDue) {
    return {
      status: "completed",
      summary: completeRecoveryPayment(ctx, actor, actorState, recovery),
    };
  }

  if (getMortgageableProperties(ctx, actor.id).length === 0) {
    bankruptPlayer(ctx, actor.id, getRecoveryCreditorPlayerId(recovery));
    clearRecoveryContext(ctx.game);
    return {
      status: "bankrupt",
      summary: recovery.bankruptcySummary,
    };
  }

  ctx.game.phase = GamePhase.WAITING_FOR_RECOVERY;
  ctx.game.recoveryContext = serializeRecoveryContext(recovery);

  return {
    status: "recovery",
    summary: `${actor.name} 现金不足，需要先抵押地产来筹集 ${recovery.amountDue} 元的${recovery.reason}。当前还差 ${Math.max(
      0,
      recovery.amountDue - actorState.cash,
    )} 元。`,
  };
}

function assertReactionActor(ctx: GameContext, actor: Player) {
  const reaction = getReactionContext(ctx.game);
  assertCondition(
    ctx.game.phase === GamePhase.WAITING_FOR_ITEM_REACTION && reaction,
    "当前没有等待中的道具响应。",
  );
  assertCondition(reaction.reactingPlayerId === actor.id, "现在轮不到你做出响应。", 409);
  return reaction;
}

function resolveReactionUseItem(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  itemKey: string,
): { status: "completed"; summary: string } {
  const reaction = assertReactionActor(ctx, actor);
  assertCondition(reaction.itemKeys.includes(itemKey as typeof reaction.itemKeys[number]), "该响应不能使用这张卡。");

  const inventoryItem = findInventoryItem(ctx, actor.id, itemKey);
  const itemDefinition = getItemDefinition(itemKey);
  assertCondition(itemDefinition, "未知道具。");
  assertCondition(inventoryItem.quantity > 0, `你没有 ${itemDefinition.name}。`);
  inventoryItem.quantity -= 1;

  if (reaction.kind === "payment") {
    assertCondition(itemKey === FREE_PASS_ITEM_KEY, "当前只能使用免费卡。");
    return {
      status: "completed",
      summary: completeFreePassPayment(ctx, actor, actorState, reaction.recovery),
    };
  }

  if (reaction.kind === "taxAudit") {
    assertCondition(itemKey === FREE_PASS_ITEM_KEY, "当前只能使用免费卡。");
    restoreTurnAfterReaction(ctx, reaction);
    return {
      status: "completed",
      summary: `${actor.name} 的免费卡生效，免除了 ${reaction.sourcePlayerName} 发起的 ${reaction.itemName}。`,
    };
  }

  assertCondition(itemKey === INNOCENCE_ITEM_KEY, "当前只能使用免罪卡。");
  restoreTurnAfterReaction(ctx, reaction);
  return {
    status: "completed",
    summary:
      actor.id === reaction.sourcePlayerId
        ? `${actor.name} 的免罪卡生效，挡下了反弹回来的 ${reaction.itemName}。`
        : `${actor.name} 的免罪卡生效，挡下了 ${reaction.sourcePlayerName} 的 ${reaction.itemName}。`,
  };
}

function resolveReactionDecline(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
): { status: "completed" | "recovery" | "bankrupt"; summary: string } {
  const reaction = assertReactionActor(ctx, actor);

  if (reaction.kind === "payment") {
    clearReactionContext(ctx.game);
    const paymentResult = resolveRequiredCashPayment(ctx, actor, actorState, reaction.recovery, {
      allowFreePass: true,
      skipFreePassReaction: true,
    });
    if (paymentResult.status === "completed") {
      return { status: "completed", summary: paymentResult.summary };
    }
    if (paymentResult.status === "recovery") {
      return { status: "recovery", summary: paymentResult.summary };
    }
    if (paymentResult.status === "bankrupt") {
      return { status: "bankrupt", summary: paymentResult.summary };
    }
    throw new GameEngineError("支付响应流程异常。", 500);
  }

  if (reaction.kind === "taxAudit") {
    const sourceState = findPlayerState(ctx, reaction.sourcePlayerId);
    const collected = Math.min(actorState.cash, reaction.amount);
    actorState.cash -= collected;
    sourceState.cash += collected;
    restoreTurnAfterReaction(ctx, reaction);
    return {
      status: "completed",
      summary: `${actor.name} 没有使用免费卡，${reaction.sourcePlayerName} 的 ${reaction.itemName} 收走了 ${collected} 元。`,
    };
  }

  restoreTurnAfterReaction(ctx, reaction);
  if (reaction.debuffType === "sleepwalk") {
    setSleepwalking(actorState, reaction.sleepwalkingTurns ?? 5);
    return {
      status: "completed",
      summary: `${actor.name} 没有使用免罪卡，进入梦游状态，持续 ${reaction.sleepwalkingTurns ?? 5} 回合。`,
    };
  }

  const jailResult = trySendToJailWithFushenProtection(actorState);
  return {
    status: "completed",
    summary: jailResult.jailed
      ? `${actor.name} 没有使用免罪卡，被直接送进了监狱。`
      : `${actor.name} 没有使用免罪卡，但${jailResult.god?.name ?? "福神"}护体，这次没有坐牢。`,
  };
}

function resolveTurnStartBankDebt(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  currentDate: string,
): { status: "completed" | "reaction" | "recovery" | "bankrupt"; summary: string } {
  if (!isFirstDayOfMonth(currentDate) || actorState.bankDebt <= 0) {
    return { status: "completed", summary: "" };
  }

  const debt = actorState.bankDebt;
  const repayment = resolveBankAutoRepayment(
    actorState.cash,
    actorState.bankSavings,
    actorState.bankDebt,
  );

  actorState.cash = repayment.nextCash;
  actorState.bankSavings = repayment.nextSavings;
  actorState.bankDebt = repayment.remainingDebt;

  const paymentSources = [
    repayment.fromSavings > 0 ? `存款 ${repayment.fromSavings}` : "",
    repayment.fromCash > 0 ? `现金 ${repayment.fromCash}` : "",
  ]
    .filter(Boolean)
    .join(" + ");

  if (repayment.remainingDebt <= 0) {
    return {
      status: "completed",
      summary: ` ${actor.name} 的银行贷款到期，系统自动扣回 ${debt} 元${
        paymentSources ? `（${paymentSources}）` : ""
      }。`,
    };
  }

  const paymentResult = resolveRequiredCashPayment(ctx, actor, actorState, {
    amountDue: repayment.remainingDebt,
    reason: "银行贷款尾款",
    recipientKind: "bank",
    recipientPlayerId: null,
    continuation: "turnStart",
    successSummary: `${actor.name} 补足了银行贷款剩余的 ${repayment.remainingDebt} 元，已自动还清本月贷款。`,
    bankruptcySummary: `${actor.name} 无法补足本月到期的银行贷款，已经破产。`,
    clearBankDebtOnSuccess: true,
  });

  if (paymentResult.status === "recovery") {
    return {
      status: "recovery",
      summary: ` ${actor.name} 的银行贷款到期，系统已先扣除 ${
        repayment.totalPaid
      } 元${paymentSources ? `（${paymentSources}）` : ""}，但还差 ${
        repayment.remainingDebt
      } 元，需要先抵押地产。`,
    };
  }

  if (paymentResult.status === "reaction") {
    return {
      status: "reaction",
      summary: ` ${actor.name} 的银行贷款到期，系统已先扣除 ${
        repayment.totalPaid
      } 元${paymentSources ? `（${paymentSources}）` : ""}。${paymentResult.summary}`,
    };
  }

  if (paymentResult.status === "bankrupt") {
    return paymentResult;
  }

  return {
    status: "completed",
    summary: ` ${actor.name} 的银行贷款到期，系统已先扣除 ${
      repayment.totalPaid
    } 元${paymentSources ? `（${paymentSources}）` : ""}。${paymentResult.summary}`,
  };
}

function countInventoryCards(ctx: GameContext, playerId: string) {
  return getInventoryItemsByPlayer(ctx, playerId).reduce(
    (sum, inventoryItem) => sum + inventoryItem.quantity,
    0,
  );
}

function removeRandomInventoryCards(ctx: GameContext, playerId: string, removeCount: number) {
  const removedNames: string[] = [];
  for (let remaining = Math.max(0, Math.floor(removeCount)); remaining > 0; remaining -= 1) {
    const ownedCards = getInventoryItemsByPlayer(ctx, playerId);
    const totalCards = ownedCards.reduce((sum, inventoryItem) => sum + inventoryItem.quantity, 0);
    if (totalCards <= 0) {
      break;
    }

    let cursor = Math.floor(Math.random() * totalCards);
    let chosenItem = ownedCards[0];
    for (const inventoryItem of ownedCards) {
      cursor -= inventoryItem.quantity;
      if (cursor < 0) {
        chosenItem = inventoryItem;
        break;
      }
    }

    chosenItem.quantity -= 1;
    removedNames.push(getItemDefinition(chosenItem.itemKey)?.name ?? chosenItem.itemKey);
  }

  const removedSummary = new Map<string, number>();
  removedNames.forEach((name) => {
    removedSummary.set(name, (removedSummary.get(name) ?? 0) + 1);
  });

  return {
    removedCount: removedNames.length,
    removedLabel:
      removedNames.length === 0
        ? ""
        : [...removedSummary.entries()]
            .map(([name, count]) => `${name}${count > 1 ? ` x${count}` : ""}`)
            .join("、"),
  };
}

function ensureGameCalendarStartDate(game: Game) {
  const calendarStartDate = resolveCalendarStartDate(game.calendarStartDate, game.createdAt);
  game.calendarStartDate = calendarStartDate;
  return calendarStartDate;
}

function getGameRoundNumber(ctx: GameContext) {
  return getRoundNumberForTurn(
    ctx.game.turnNumber,
    ctx.players.map((player) => ({
      id: player.id,
      seatOrder: player.seatOrder,
      bankruptAtTurn: findPlayerState(ctx, player.id).bankruptAtTurn ?? null,
    })),
  );
}

function getGameCurrentDate(ctx: GameContext) {
  return getRoundDateKey(ensureGameCalendarStartDate(ctx.game), getGameRoundNumber(ctx));
}

function assertStockMarketAvailable(ctx: GameContext) {
  assertCondition(ctx.settings.stocksEnabled, "本局未启用股票系统。");

  const currentDate = getGameCurrentDate(ctx);
  assertCondition(
    !isWeekendDateKey(currentDate),
    `今天是周末（${formatGameDateLabel(currentDate)}），股票休市。`,
  );
}

function settleMonthlyBankInterest(ctx: GameContext, currentDate: string) {
  if (!isFirstDayOfMonth(currentDate)) {
    return "";
  }

  const credited: string[] = [];

  getActiveStates(ctx).forEach((state) => {
    if (state.bankSavings <= 0) {
      return;
    }

    const interest = calculateMonthlySavingsInterest(state.bankSavings);
    if (interest <= 0) {
      return;
    }

    state.bankSavings += interest;
    const player = getPlayer(ctx, state.playerId);
    credited.push(`${player.name} +${interest}`);
  });

  if (credited.length === 0) {
    return ` 日期来到 ${formatGameDateLabel(currentDate)}。银行本月结息，但目前没有玩家存款。`;
  }

  return ` 日期来到 ${formatGameDateLabel(currentDate)}。银行月初结息：${credited.join("，")}。`;
}

function resetTurnMarkers(game: Game) {
  game.lastDiceA = null;
  game.lastDiceB = null;
  game.lastDiceTotal = null;
  game.lastRollValues = "[]";
  game.pendingTileIndex = null;
  game.rollAgainAvailable = false;
  game.consecutiveDoubles = 0;
  clearRecoveryContext(game);
  clearReactionContext(game);
}

function moveBySteps(
  playerState: PlayerState,
  steps: number,
  passStartSalary: number,
) {
  const boardSize = BOARD_TILES.length;
  const traversedTileIndexes = getTraversedTileIndexes(
    playerState.position,
    steps,
    boardSize,
  );
  let nextPosition = playerState.position + steps;
  let passedStart = false;

  while (nextPosition >= boardSize) {
    nextPosition -= boardSize;
    playerState.lapsCompleted += 1;
    passedStart = true;
  }

  while (nextPosition < 0) {
    nextPosition += boardSize;
  }

  if (passedStart) {
    playerState.cash += passStartSalary;
  }

  playerState.position = nextPosition;
  return { passedStart, traversedTileIndexes };
}

function moveToAbsoluteTile(
  playerState: PlayerState,
  tileIndex: number,
  passStartSalary: number,
  collectPassStart = false,
) {
  if (!collectPassStart) {
    playerState.position = tileIndex;
    return { passedStart: false };
  }

  const boardSize = BOARD_TILES.length;
  const steps = (tileIndex - playerState.position + boardSize) % boardSize;
  if (steps <= 0) {
    playerState.position = tileIndex;
    return { passedStart: false };
  }

  const moveResult = moveBySteps(playerState, steps, passStartSalary);
  playerState.position = tileIndex;
  return { passedStart: moveResult.passedStart };
}

function resolveTravelGodEffects(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  traversedTileIndexes: number[],
) {
  const god = getGodDefinition(playerState.activeGodKey);
  if (!god || !isTravelGodKey(god.key)) {
    return { summary: "", bankrupted: false };
  }

  const changes: string[] = [];
  let bankrupted = false;
  const affectedTileIndexes = getAffectedTileIndexesForTravelGod(god.key, traversedTileIndexes);
  affectedTileIndexes.forEach((tileIndex) => {
    if (bankrupted) {
      return;
    }

    const tile = getTile(tileIndex);

    if (god.key === "tudigong") {
      if (!isPurchasableTile(tile)) {
        return;
      }

      const propertyState = findPropertyState(ctx, tile.index);
      if (propertyState.ownerPlayerId === player.id) {
        return;
      }

      const previousOwnerId = propertyState.ownerPlayerId;
      if (previousOwnerId) {
        const previousOwner = getPlayer(ctx, previousOwnerId);
        const toll = calculateRent(ctx, tile, propertyState);
        const paidSuccessfully =
          toll <= 0 ? true : applyMoneyTransfer(ctx, player.id, previousOwnerId, toll);

        if (!paidSuccessfully || playerState.isBankrupt) {
          bankrupted = true;
          changes.push(`${tile.name} 需要先向 ${previousOwner.name} 支付 ${toll} 过路费`);
          return;
        }

        propertyState.ownerPlayerId = player.id;
        changes.push(`${tile.name} 向 ${previousOwner.name} 付过 ${toll} 后被占为己有`);
        return;
      }

      propertyState.ownerPlayerId = player.id;
      changes.push(`${tile.name} 被直接占为己有`);
      return;
    }

    if (tile.type !== "property") {
      return;
    }

    const propertyState = findPropertyState(ctx, tile.index);
    const result = applyTravelGodToProperty(god.key, propertyState);
    if (result.changed) {
      changes.push(`${tile.name}${result.label}`);
    }
  });

  playerState.godTurns = Math.max(0, playerState.godTurns - 1);
  const shouldLeave = playerState.godTurns <= 0;
  if (shouldLeave) {
    playerState.activeGodKey = null;
    playerState.godTurns = 0;
  }

  if (bankrupted) {
    return {
      summary: ` ${god.name}在停下的位置发动效果时，${changes.join("，")}。`,
      bankrupted: true,
    };
  }

  if (changes.length === 0) {
    return {
      summary: shouldLeave
        ? ` ${player.name} 身边的${god.name}这回合没有影响到停下的位置，然后离开了。`
        : ` ${player.name} 身边的${god.name}这回合没有影响到停下的位置。`,
      bankrupted: false,
    };
  }

  if (god.key === "tudigong") {
    return {
      summary: shouldLeave
        ? ` 土地公在停下的位置收地成功：${changes.join("，")}。随后离开了 ${player.name}。`
        : ` 土地公在停下的位置收地成功：${changes.join("，")}。`,
      bankrupted: false,
    };
  }

  return {
    summary: shouldLeave
      ? ` ${god.name}在停下的位置发动了效果：${changes.join("，")}。随后离开了 ${player.name}。`
      : ` ${god.name}在停下的位置发动了效果：${changes.join("，")}。`,
    bankrupted: false,
  };
}

function resolvePassTollByGod(
  playerState: PlayerState,
  baseRent: number,
) {
  const god = getEffectiveActiveGod(playerState);
  if (!god || baseRent <= 0) {
    return {
      rent: baseRent,
      summary: "",
      freeByCaishen: false,
      doubledByQiongshen: false,
    };
  }

  if (isCaishenGodKey(god.key)) {
    return {
      rent: 0,
      summary: `${god.name}护体，免付过路费。`,
      freeByCaishen: true,
      doubledByQiongshen: false,
    };
  }

  if (god.key === "daQiongshen" || god.key === "xiaoQiongshen") {
    return {
      rent: baseRent * 2,
      summary: `${god.name}作祟，过路费翻倍。`,
      freeByCaishen: false,
      doubledByQiongshen: true,
    };
  }

  return {
    rent: baseRent,
    summary: "",
    freeByCaishen: false,
    doubledByQiongshen: false,
  };
}

function distributeCashToOtherPlayers(
  ctx: GameContext,
  playerId: string,
  perPlayerAmount: number,
) {
  const actorState = findPlayerState(ctx, playerId);
  const recipients = getActiveStates(ctx)
    .filter((state) => state.playerId !== playerId)
    .sort((left, right) => {
      const leftPlayer = getPlayer(ctx, left.playerId);
      const rightPlayer = getPlayer(ctx, right.playerId);
      return leftPlayer.seatOrder - rightPlayer.seatOrder;
    });

  if (recipients.length === 0 || perPlayerAmount <= 0 || actorState.cash <= 0) {
    return {
      totalPaid: 0,
      paidPerPlayer: 0,
      recipientCount: recipients.length,
      partial: false,
    };
  }

  const totalRequired = perPlayerAmount * recipients.length;
  const partial = actorState.cash < totalRequired;
  let remainingCash = actorState.cash;

  recipients.forEach((recipientState, index) => {
    const remainingRecipients = recipients.length - index;
    const targetAmount = partial
      ? Math.floor(remainingCash / remainingRecipients)
      : perPlayerAmount;
    const paidAmount = Math.min(remainingCash, Math.max(0, targetAmount));
    recipientState.cash += paidAmount;
    remainingCash -= paidAmount;
  });

  const totalPaid = actorState.cash - remainingCash;
  actorState.cash = remainingCash;

  return {
    totalPaid,
    paidPerPlayer: partial ? Math.floor(totalPaid / recipients.length) : perPlayerAmount,
    recipientCount: recipients.length,
    partial,
  };
}

function collectCashFromOtherPlayers(
  ctx: GameContext,
  collectorPlayerId: string,
  perPlayerAmount: number,
) {
  const collectorState = findPlayerState(ctx, collectorPlayerId);
  const payers = getActiveStates(ctx)
    .filter((state) => state.playerId !== collectorPlayerId)
    .sort((left, right) => {
      const leftPlayer = getPlayer(ctx, left.playerId);
      const rightPlayer = getPlayer(ctx, right.playerId);
      return leftPlayer.seatOrder - rightPlayer.seatOrder;
    });

  if (payers.length === 0 || perPlayerAmount <= 0) {
    return {
      totalCollected: 0,
      payerCount: payers.length,
      partial: false,
    };
  }

  let totalCollected = 0;
  let partial = false;
  payers.forEach((payerState) => {
    const paidAmount = Math.min(payerState.cash, perPlayerAmount);
    if (paidAmount < perPlayerAmount) {
      partial = true;
    }
    payerState.cash -= paidAmount;
    collectorState.cash += paidAmount;
    totalCollected += paidAmount;
  });

  return {
    totalCollected,
    payerCount: payers.length,
    partial,
  };
}

function sendToJail(playerState: PlayerState) {
  playerState.position = JAIL_INDEX;
  playerState.inJailTurns = 3;
}

function releasePlayersFromJail(ctx: GameContext) {
  const releasedPlayers: Player[] = [];

  ctx.players.forEach((player) => {
    const playerState = findPlayerState(ctx, player.id);
    if (playerState.isBankrupt || playerState.inJailTurns <= 0) {
      return;
    }

    playerState.inJailTurns = 0;
    releasedPlayers.push(player);
  });

  return releasedPlayers;
}

function getOwnedPropertiesByPlayer(ctx: GameContext, playerId: string) {
  return ctx.propertyStates.filter((property) => property.ownerPlayerId === playerId);
}

function getPlayerPropertyAssetValue(ctx: GameContext, playerId: string) {
  return getOwnedPropertiesByPlayer(ctx, playerId).reduce(
    (sum, property) =>
      sum +
      calculatePropertyAssetValue(property.tileIndex, property.houseCount, property.hasHotel, 1),
    0,
  );
}

function formatStructureLevelLabel(levels: number) {
  return levels >= 5 ? "酒店" : `${levels} 层房屋`;
}

function countOwnedRailroads(ctx: GameContext, playerId: string) {
  return getOwnedPropertiesByPlayer(ctx, playerId).filter((property) => {
    const tile = getTile(property.tileIndex);
    return tile.type === "railroad";
  }).length;
}

function countGroupOwnership(ctx: GameContext, playerId: string, group: string) {
  return getOwnedPropertiesByPlayer(ctx, playerId).filter((property) => {
    const tile = getTile(property.tileIndex);
    if (tile.type !== "property") {
      return false;
    }
    return tile.group === group;
  }).length;
}

function calculateStockAssetValue(ctx: GameContext, playerId: string) {
  return ctx.stockHoldings
    .filter((holding) => holding.playerId === playerId)
    .reduce((sum, holding) => {
      const stockState = ctx.stockStates.find((item) => item.id === holding.stockStateId);
      return sum + (stockState?.currentPrice ?? 0) * holding.shares;
    }, 0);
}

function getInflationState(ctx: GameContext) {
  const assetBaseTotal = ctx.playerStates.reduce((sum, state) => {
    const propertyAssetValue = getOwnedPropertiesByPlayer(ctx, state.playerId).reduce(
      (propertySum, property) =>
        propertySum +
        calculatePropertyAssetValue(property.tileIndex, property.houseCount, property.hasHotel, 1),
      0,
    );
    const stockAssetValue = calculateStockAssetValue(ctx, state.playerId);
    return (
      sum +
      calculatePlayerTotalAssets(
        state.cash,
        state.bankSavings,
        propertyAssetValue,
        stockAssetValue,
        state.bankDebt,
      )
    );
  }, 0);

  return calculateInflationState(assetBaseTotal, ctx.settings.startingCash, ctx.players.length);
}

function getInflationIndex(ctx: GameContext) {
  return getInflationState(ctx).index;
}

function calculateRent(
  ctx: GameContext,
  tile: BoardTile,
  propertyState: PropertyState,
) {
  if (!propertyState.ownerPlayerId || propertyState.mortgaged) {
    return 0;
  }

  const ownerState = findPlayerState(ctx, propertyState.ownerPlayerId);
  if (ownerState.inJailTurns > 0 || isAbducted(ownerState) || isSleepwalking(ownerState)) {
    return 0;
  }

  const inflationIndex = getInflationIndex(ctx);

  if (tile.type === "railroad") {
    const railroadsOwned = countOwnedRailroads(ctx, propertyState.ownerPlayerId);
    return getEffectiveRailroadRent(railroadsOwned, inflationIndex);
  }

  if (tile.type !== "property") {
    return 0;
  }

  const ownedInGroup = countGroupOwnership(ctx, propertyState.ownerPlayerId, tile.group);
  return getEffectivePropertyRent(
    tile,
    propertyState.houseCount,
    propertyState.hasHotel,
    ownedInGroup,
    inflationIndex,
  );
}

function canManageProperties(phase: GamePhase) {
  return (
    phase === GamePhase.WAITING_FOR_ROLL ||
    phase === GamePhase.WAITING_FOR_TURN_END ||
    phase === GamePhase.WAITING_FOR_JAIL_CHOICE
  );
}

function canManageMortgage(phase: GamePhase) {
  return phase !== GamePhase.GAME_OVER && phase !== GamePhase.WAITING_FOR_ITEM_REACTION;
}

function updateStockMarket(ctx: GameContext) {
  const movers: string[] = [];

  ctx.stockStates.forEach((stock) => {
    stock.previousPrice = stock.currentPrice;

    const randomDelta =
      Math.floor(Math.random() * (stock.volatility * 2 + 1)) - stock.volatility;
    const scarcityBoost = stock.availableShares <= 40 ? 2 : 0;
    const nextPrice = Math.max(20, stock.currentPrice + randomDelta + scarcityBoost);

    stock.currentPrice = nextPrice;

    const change = nextPrice - stock.previousPrice;
    if (change !== 0) {
      movers.push(`${stock.symbol} ${change > 0 ? "+" : ""}${change}`);
    }
  });

  if (movers.length === 0) {
    return " 股市保持平稳。";
  }

  return ` 股市：${movers.join("，")}。`;
}

function maybeFinishGame(ctx: GameContext) {
  const activePlayers = getActiveStates(ctx);
  if (activePlayers.length <= 1) {
    ctx.game.phase = GamePhase.GAME_OVER;
    ctx.game.winnerPlayerId = activePlayers[0]?.playerId ?? null;
    ctx.room.status = RoomStatus.FINISHED;
    return true;
  }

  return false;
}

function bankruptPlayer(
  ctx: GameContext,
  playerId: string,
  creditorPlayerId: string | null,
) {
  const playerState = findPlayerState(ctx, playerId);

  if (playerState.isBankrupt) {
    return;
  }

  if (creditorPlayerId) {
    const creditorState = findPlayerState(ctx, creditorPlayerId);
    creditorState.cash += Math.max(playerState.cash, 0);
  }

  ctx.propertyStates.forEach((property) => {
    if (property.ownerPlayerId !== playerId) {
      return;
    }

    if (creditorPlayerId) {
      property.ownerPlayerId = creditorPlayerId;
    } else {
      property.ownerPlayerId = null;
      property.houseCount = 0;
      property.hasHotel = false;
      property.mortgaged = false;
    }
  });

  playerState.cash = 0;
  playerState.bankSavings = 0;
  playerState.bankDebt = 0;
  clearActiveVehicle(playerState);
  clearManagedMode(playerState);
  playerState.isBankrupt = true;
  playerState.inJailTurns = 0;
  playerState.abductedTurns = 0;
  playerState.bankruptAtTurn = ctx.game.turnNumber;
}

function advanceTurn(ctx: GameContext, summary: string): string {
  if (maybeFinishGame(ctx)) {
    return summary;
  }

  const currentPlayer = getCurrentPlayer(ctx);
  const currentPlayerState = findPlayerState(ctx, currentPlayer.id);
  const currentSeatIndex = ctx.players.findIndex(
    (player) => player.id === currentPlayer.id,
  );
  assertCondition(currentSeatIndex >= 0, "当前行动玩家不存在。", 500);

  const sleepwalkSummary =
    !currentPlayerState.isBankrupt && isSleepwalking(currentPlayerState)
      ? stepSleepwalking(currentPlayerState)
        ? ` ${currentPlayer.name} 从梦游中清醒了。`
        : ` ${currentPlayer.name} 还在梦游，剩余 ${currentPlayerState.sleepwalkingTurns} 回合。`
      : "";

  let nextPlayer = findNextActivePlayer(ctx, currentSeatIndex);

  assertCondition(nextPlayer, "没有可继续行动的玩家。", 500);

  const startedNewRound = nextPlayer.seatOrder <= currentPlayer.seatOrder;
  const currentDate = startedNewRound
    ? getRoundDateKey(ensureGameCalendarStartDate(ctx.game), getGameRoundNumber(ctx) + 1)
    : getGameCurrentDate(ctx);
  const bankSummary = startedNewRound
    ? settleMonthlyBankInterest(ctx, currentDate)
    : "";

  if (startedNewRound && maybeFinishGame(ctx)) {
    return `${summary}${sleepwalkSummary}${bankSummary}`;
  }

  nextPlayer = findNextActivePlayer(ctx, currentSeatIndex);
  assertCondition(nextPlayer, "没有可继续行动的玩家。", 500);

  ctx.game.currentPlayerId = nextPlayer.id;
  ctx.game.turnNumber += 1;
  resetTurnMarkers(ctx.game);
  const nextPlayerState = findPlayerState(ctx, nextPlayer.id);
  setTurnReadyPhase(ctx, nextPlayerState);

  const turnStartDebtResult = resolveTurnStartBankDebt(
    ctx,
    nextPlayer,
    nextPlayerState,
    currentDate,
  );

  if (turnStartDebtResult.status === "recovery") {
    return `${summary}${sleepwalkSummary} 下一位：${nextPlayer.name}。${bankSummary}${turnStartDebtResult.summary}`;
  }

  if (turnStartDebtResult.status === "reaction") {
    return `${summary}${sleepwalkSummary} 下一位：${nextPlayer.name}。${bankSummary}${turnStartDebtResult.summary}`;
  }

  if (turnStartDebtResult.status === "bankrupt") {
    const nextSummary = `${summary}${sleepwalkSummary} 下一位：${nextPlayer.name}。${bankSummary}${turnStartDebtResult.summary}`;
    return maybeFinishGame(ctx) ? nextSummary : advanceTurn(ctx, nextSummary);
  }

  const turnStartEffectsSummary = applyTurnStartSideEffects(ctx, nextPlayer.id);

  return `${summary}${sleepwalkSummary} 下一位：${nextPlayer.name}。${bankSummary}${turnStartDebtResult.summary}${turnStartEffectsSummary}`;
}

function resolveJailTurnEnd(ctx: GameContext, actor: Player, actorState: PlayerState) {
  assertCondition(
    ctx.game.phase === GamePhase.WAITING_FOR_JAIL_CHOICE && actorState.inJailTurns > 0,
    "当前不在监狱服刑中。",
  );

  actorState.inJailTurns = Math.max(0, actorState.inJailTurns - 1);

  if (actorState.inJailTurns === 0) {
    ctx.game.phase = GamePhase.WAITING_FOR_ROLL;
    ctx.game.rollAgainAvailable = false;
    return `${actor.name} 在监狱里待满 3 天，已经被放出来了，这回合可以继续掷骰行动。`;
  }

  return advanceTurn(
    ctx,
    `${actor.name} 在监狱里又过了一天，还需等待 ${actorState.inJailTurns} 天才能离开。`,
  );
}

function resolveAbductionTurnEnd(ctx: GameContext, actor: Player, actorState: PlayerState) {
  assertCondition(
    ctx.game.phase === GamePhase.WAITING_FOR_ABDUCTION_RETURN && isAbducted(actorState),
    "当前不在失踪状态中。",
  );

  const returned = stepAbduction(actorState);
  if (returned) {
    return advanceTurn(
      ctx,
      `${actor.name} 被外星人送了回来，重新出现在 ${getTile(actorState.position).name}。`,
    );
  }

  return advanceTurn(
    ctx,
    `${actor.name} 还被外星人抓着，继续从地图上消失，还需等待 ${actorState.abductedTurns} 天。`,
  );
}

function applyMoneyTransfer(
  ctx: GameContext,
  fromPlayerId: string,
  toPlayerId: string | null,
  amount: number,
) {
  const payer = findPlayerState(ctx, fromPlayerId);

  if (payer.cash >= amount) {
    payer.cash -= amount;

    if (toPlayerId) {
      const receiver = findPlayerState(ctx, toPlayerId);
      receiver.cash += amount;
    } else if (ctx.settings.parkingJackpotEnabled) {
      ctx.settings.parkingJackpot += amount;
    }

    return true;
  }

  bankruptPlayer(ctx, fromPlayerId, toPlayerId);
  maybeFinishGame(ctx);
  return false;
}

function setPostActionPhase(
  ctx: GameContext,
  playerState: PlayerState,
  allowRollAgain: boolean,
) {
  if (ctx.game.phase === GamePhase.GAME_OVER) {
    return;
  }

  if (playerState.isBankrupt) {
    ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
    return;
  }

  if (allowRollAgain && playerState.inJailTurns === 0) {
    ctx.game.phase = GamePhase.WAITING_FOR_ROLL;
    ctx.game.rollAgainAvailable = false;
  } else {
    ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
    ctx.game.rollAgainAvailable = false;
  }
}

function finishPendingStop(ctx: GameContext) {
  ctx.game.pendingTileIndex = null;
  ctx.game.phase = ctx.game.rollAgainAvailable
    ? GamePhase.WAITING_FOR_ROLL
    : GamePhase.WAITING_FOR_TURN_END;
  ctx.game.rollAgainAvailable = false;
}

function applyTurnStartGodEffect(ctx: GameContext, playerId: string) {
  const player = getPlayer(ctx, playerId);
  const playerState = findPlayerState(ctx, playerId);
  const god = getGodDefinition(playerState.activeGodKey);

  if (!god || playerState.godTurns <= 0) {
    playerState.activeGodKey = null;
    playerState.godTurns = 0;
    return "";
  }

  let summary = "";
  switch (god.key) {
    case "tudigong": {
      summary = `${player.name} 得到土地公跟随，这回合只会对停下的位置生效；如果落在可占领地块上，会将它收入名下，但有主时仍要先付过路费。`;
      break;
    }
    case "tianshi":
      summary = `${player.name} 得到天使跟随，这回合只会对停下的位置生效；如果落在有主地产上，会自动加盖一层。`;
      break;
    case "daCaishen":
    case "xiaoCaishen": {
      summary = `${player.name} 得到${god.name}照拂，这回合过路费免费，回到自己的地产时建房也免费。`;
      break;
    }
    case "daFushen":
    case "xiaoFushen": {
      summary =
        god.key === "daFushen"
          ? `${player.name} 得到${god.name}照拂，这回合不会被陷害、坐牢或梦游；若买下空地，会直接盖起 1 层，回到自己的地产时建房效果也会加倍。`
          : `${player.name} 得到${god.name}照拂，这回合不会被陷害、坐牢或梦游，回到自己的地产时建房效果加倍。`;
      break;
    }
    case "daShuaishen":
    case "xiaoShuaishen": {
      const totalCards = countInventoryCards(ctx, player.id);
      const removeCount =
        god.key === "daShuaishen" ? Math.ceil(totalCards / 2) : Math.min(1, totalCards);
      const { removedCount, removedLabel } = removeRandomInventoryCards(
        ctx,
        player.id,
        removeCount,
      );
      if (removedCount === 0) {
        summary = `${player.name} 被${god.name}缠上，但背包里已经没有卡片可掉了；附身期间建房也会失败。`;
      } else {
        summary =
          god.key === "daShuaishen"
            ? `${player.name} 被${god.name}缠上，背包里一半卡片掉光了：${removedLabel}；附身期间建房也会失败。`
            : `${player.name} 被${god.name}缠上，掉了 1 张卡：${removedLabel}；附身期间建房也会失败。`;
      }
      break;
    }
    case "pohuaishen":
      summary = `${player.name} 带着破坏神出发，这回合只会对停下的位置生效；如果落在有主地产上，会自动拆掉一层。`;
      break;
    case "daQiongshen":
    case "xiaoQiongshen": {
      const inflationIndex = getInflationIndex(ctx);
      const perPlayerAmount = getEffectiveItemAmount(
        god.key === "daQiongshen" ? 120 : 60,
        inflationIndex,
      );
      const payout = distributeCashToOtherPlayers(ctx, player.id, perPlayerAmount);
      if (payout.recipientCount === 0) {
        summary = `${player.name} 被${god.name}缠上，但场上没有其他玩家可收钱。`;
      } else if (payout.totalPaid <= 0) {
        summary = `${player.name} 被${god.name}缠上，但手头已经没有现金可分给其他玩家了。`;
      } else if (payout.partial) {
        summary = `${player.name} 被${god.name}缠上，本想给每位玩家 ${perPlayerAmount} 元，结果现金不够，只把手上的 ${payout.totalPaid} 元分给了其他玩家。`;
      } else {
        summary = `${player.name} 被${god.name}缠上，向其他 ${payout.recipientCount} 名玩家每人支付了 ${perPlayerAmount} 元。`;
      }
      break;
    }
  }

  if (isTravelGodKey(god.key)) {
    return summary ? ` ${summary}` : "";
  }

  playerState.godTurns -= 1;
  if (playerState.godTurns <= 0) {
    playerState.activeGodKey = null;
    playerState.godTurns = 0;
    summary += ` ${god.name} 已经离开。`;
  }

  return summary ? ` ${summary}` : "";
}

function resolveFreeCardPoint(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  allowRollAgain: boolean,
) {
  const randomItem = getRandomItemDefinition();
  const itemDefinition = awardItem(ctx, player.id, randomItem.key);
  setPostActionPhase(ctx, playerState, allowRollAgain);
  return `${player.name} 经过免费卡点，免费拿到了一张 ${itemDefinition?.name ?? randomItem.name}。`;
}

function resolveDeckTile(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  allowRollAgain: boolean,
  deck: CardDeckType,
) {
  const card = drawDeckCard(ctx, deck);
  const deckLabel = getDeckDisplayName(deck);
  const inflationIndex = getInflationIndex(ctx);
  const passStartSalary = getEffectivePassStartSalary(ctx.settings.passStartSalary, inflationIndex);
  const formatDeckSummary = (content: string) => formatDeckFlash(deck, content);
  const finalizePayment = (paymentResult: {
    status: "completed" | "reaction" | "recovery" | "bankrupt";
    summary: string;
  }) => {
    const flashSummary = formatDeckSummary(paymentResult.summary);
    if (paymentResult.status === "bankrupt") {
      return maybeFinishGame(ctx) ? flashSummary : advanceTurn(ctx, flashSummary);
    }

    return flashSummary;
  };
  const cardLabel = `${player.name} 抽到${deckLabel}「${card.title}」`;

  switch (card.effect.type) {
    case "collect": {
      const amount = scaleMoney(card.effect.amount, inflationIndex);
      playerState.cash += amount;
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatDeckSummary(`${cardLabel}，从银行领取了 ${amount} 元。`);
    }
    case "pay": {
      const amount = scaleMoney(card.effect.amount, inflationIndex);
      return finalizePayment(
        resolveRequiredCashPayment(
          ctx,
          player,
          playerState,
          {
            amountDue: amount,
            reason: card.title,
            recipientKind: "bank",
            recipientPlayerId: null,
            continuation: "postAction",
            successSummary: `${cardLabel}，向银行支付了 ${amount} 元。`,
            bankruptcySummary: `${cardLabel}后无力支付 ${amount} 元，已经破产。`,
          },
          {
            allowFreePass: true,
          },
        ),
      );
    }
    case "collectFromPlayers": {
      const amount = scaleMoney(card.effect.amount, inflationIndex);
      const collection = collectCashFromOtherPlayers(ctx, player.id, amount);
      setPostActionPhase(ctx, playerState, allowRollAgain);
      if (collection.payerCount === 0) {
        return formatDeckSummary(`${cardLabel}，但场上暂时没有其他玩家可收取。`);
      }
      if (collection.totalCollected <= 0) {
        return formatDeckSummary(`${cardLabel}，但其他玩家手头都没现金，这次没有收到任何钱。`);
      }
      if (collection.partial) {
        return formatDeckSummary(
          `${cardLabel}，原本想向其他 ${collection.payerCount} 名玩家每人收取 ${amount} 元，实际只收到了 ${collection.totalCollected} 元。`,
        );
      }
      return formatDeckSummary(
        `${cardLabel}，向其他 ${collection.payerCount} 名玩家每人收取了 ${amount} 元，共 ${collection.totalCollected} 元。`,
      );
    }
    case "moveAbsolute": {
      const destinationTile = getTile(card.effect.tileIndex);
      const moveResult = moveToAbsoluteTile(
        playerState,
        card.effect.tileIndex,
        passStartSalary,
        card.effect.collectPassStart,
      );
      let summary = `${cardLabel}，前往 ${destinationTile.name}。`;
      if (moveResult.passedStart) {
        summary += ` 途中经过起点，领取了 ${passStartSalary} 元。`;
      }
      summary += ` ${resolveLanding(ctx, player, playerState, allowRollAgain)}`;
      return formatDeckSummary(summary);
    }
    case "moveRelative": {
      const stepLabel =
        card.effect.steps > 0 ? `前进 ${card.effect.steps} 格` : `后退 ${Math.abs(card.effect.steps)} 格`;
      const moveResult = moveBySteps(playerState, card.effect.steps, passStartSalary);
      let summary = `${cardLabel}，${stepLabel}。`;
      if (moveResult.passedStart) {
        summary += ` 途中经过起点，领取了 ${passStartSalary} 元。`;
      }
      summary += ` ${resolveLanding(ctx, player, playerState, allowRollAgain)}`;
      return formatDeckSummary(summary);
    }
    case "goToJail": {
      const jailResult = trySendToJailWithFushenProtection(playerState);
      ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
      ctx.game.rollAgainAvailable = false;
      return formatDeckSummary(
        jailResult.jailed
          ? `${cardLabel}，直接被送进了监狱。`
          : `${cardLabel}，本来要被送进监狱，但${jailResult.god?.name ?? "福神"}护体，这次没有坐牢。`,
      );
    }
    case "jailFree":
      playerState.jailFreeCards += 1;
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatDeckSummary(`${cardLabel}，获得了 1 张出狱卡。`);
    case "randomItem": {
      const rewards = Array.from({ length: Math.max(1, card.effect.count) }, () => {
        const randomItem = getRandomItemDefinition();
        const itemDefinition = awardItem(ctx, player.id, randomItem.key);
        return itemDefinition?.name ?? randomItem.name;
      });
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatDeckSummary(
        rewards.length === 1
          ? `${cardLabel}，随机获得了 1 张道具卡：${rewards[0]}。`
          : `${cardLabel}，随机获得了 ${rewards.length} 张道具卡：${rewards.join("、")}。`,
      );
    }
  }
}

function resolveNewsHouse(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  allowRollAgain: boolean,
) {
  const roll = Math.floor(Math.random() * 10);
  const inflationIndex = getInflationIndex(ctx);
  const formatNewsFlash = (content: string) => `新闻快报：${content}`;
  const finalizeNewsPayment = (paymentResult: {
    status: "completed" | "reaction" | "recovery" | "bankrupt";
    summary: string;
  }) => {
    const flashSummary = formatNewsFlash(paymentResult.summary);
    if (paymentResult.status === "bankrupt") {
      return maybeFinishGame(ctx)
        ? flashSummary
        : advanceTurn(ctx, flashSummary);
    }

    return flashSummary;
  };

  switch (roll) {
    case 0: {
      const reward = scaleMoney(220, inflationIndex);
      playerState.cash += reward;
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatNewsFlash(`${player.name} 登上头条热搜，拿到了 ${reward} 元通告费。`);
    }
    case 1: {
      const penalty = scaleMoney(180, inflationIndex);
      return finalizeNewsPayment(
        resolveRequiredCashPayment(
          ctx,
          player,
          playerState,
          {
            amountDue: penalty,
            reason: "税务罚款",
            recipientKind: "tax",
            recipientPlayerId: null,
            continuation: "postAction",
            successSummary: `${player.name} 遇上税务新闻，缴了 ${penalty} 元罚款。`,
            bankruptcySummary: `${player.name} 遇上税务新闻后无力缴罚，已经破产。`,
          },
          {
            allowFreePass: true,
          },
        ),
      );
    }
    case 2: {
      const randomItem = getRandomItemDefinition();
      const itemDefinition = awardItem(ctx, player.id, randomItem.key);
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatNewsFlash(
        `${player.name} 在新闻屋抽到惊喜赠礼，获得了 ${itemDefinition?.name ?? randomItem.name}。`,
      );
    }
    case 3: {
      const godKey = getRandomBlessingGodKey();
      const { god, rewards } = attachGodToPlayer(ctx, player, playerState, godKey);
      setPostActionPhase(ctx, playerState, allowRollAgain);
      const rewardSummary =
        rewards.length === 0
          ? ""
          : rewards.length === 1
            ? ` ${god?.name ?? "福神"}刚附身，先送来了一张 ${rewards[0]}。`
            : ` ${god?.name ?? "福神"}刚附身，先送来了两张卡：${rewards.join("、")}。`;
      return formatNewsFlash(
        `${player.name} 被报道成幸运人物，${god?.name ?? "神明"}决定跟着你走 ${GOD_DURATION_TURNS} 天。${rewardSummary}`,
      );
    }
    case 4: {
      const reward = scaleMoney(160, inflationIndex);
      const landlordIds = getTopLandlordPlayerIds(
        getActiveStates(ctx).map((state) => ({
          id: state.playerId,
          propertyAssetValue: getPlayerPropertyAssetValue(ctx, state.playerId),
          isBankrupt: state.isBankrupt,
        })),
      );
      setPostActionPhase(ctx, playerState, allowRollAgain);
      if (landlordIds.length === 0) {
        return formatNewsFlash("新闻屋准备发放大地主奖励，但目前场上还没有人凭地产上榜。");
      }

      landlordIds.forEach((playerId) => {
        findPlayerState(ctx, playerId).cash += reward;
      });

      const landlordNames = landlordIds.map((playerId) => getPlayer(ctx, playerId).name).join("、");
      return formatNewsFlash(
        landlordIds.length === 1
          ? `新闻屋颁发大地主奖励，${landlordNames} 领取了 ${reward} 元。`
          : `新闻屋颁发大地主奖励，${landlordNames} 并列成为大地主，各领取了 ${reward} 元。`,
      );
    }
    case 5: {
      const dividend = scaleMoney(100, inflationIndex);
      getActiveStates(ctx).forEach((state) => {
        state.cash += dividend;
      });
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatNewsFlash(`新闻屋播报全民分红，所有在场玩家都领取了 ${dividend} 元。`);
    }
    case 6: {
      const repairLevels = getPlayerRepairStructureLevels(ctx.propertyStates, player.id);
      const repairCostPerLevel = scaleMoney(25, inflationIndex);
      if (repairLevels <= 0) {
        setPostActionPhase(ctx, playerState, allowRollAgain);
        return formatNewsFlash(`${player.name} 遇上台风新闻，但名下暂时没有房屋需要修缮。`);
      }

      const repairCost = repairLevels * repairCostPerLevel;
      return finalizeNewsPayment(
        resolveRequiredCashPayment(ctx, player, playerState, {
          amountDue: repairCost,
          reason: "台风修缮费",
          recipientKind: "bank",
          recipientPlayerId: null,
          continuation: "postAction",
          successSummary: `${player.name} 遭遇台风，需要按每层 ${repairCostPerLevel} 元支付修缮费，共支付了 ${repairCost} 元。`,
          bankruptcySummary: `${player.name} 无法支付台风修缮费，已经破产。`,
        }),
      );
    }
    case 7: {
      const collapsibleTileIndexes = getCollapsiblePropertyTileIndexes(ctx.propertyStates);
      if (collapsibleTileIndexes.length === 0) {
        setPostActionPhase(ctx, playerState, allowRollAgain);
        return formatNewsFlash("新闻屋播报水土流失警报，但场上暂时没有带建筑的地产倒塌。");
      }

      const targetTileIndex =
        collapsibleTileIndexes[Math.floor(Math.random() * collapsibleTileIndexes.length)] ??
        collapsibleTileIndexes[0]!;
      const propertyState = findPropertyState(ctx, targetTileIndex);
      const owner = propertyState.ownerPlayerId
        ? getPlayer(ctx, propertyState.ownerPlayerId)
        : null;
      const structureLevels = getPropertyStructureLevels(propertyState);
      const structureLabel = formatStructureLevelLabel(structureLevels);
      const tile = getTile(targetTileIndex);
      collapsePropertyToEmptyLot(propertyState);
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return formatNewsFlash(
        `新闻屋播报水土流失，${owner?.name ?? "某位玩家"} 的 ${tile.name}${structureLabel} 全部倒塌，直接变回空地。`,
      );
    }
    case 8: {
      setAbducted(playerState);
      ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
      ctx.game.rollAgainAvailable = false;
      return formatNewsFlash(
        `${player.name} 被外星人抓走了，从地图上消失 ${ALIEN_ABDUCTION_DURATION_TURNS} 天，期间无法收过路费，之后会回到 ${getTile(playerState.position).name}。`,
      );
    }
    default: {
      const jailResult = trySendToJailWithFushenProtection(playerState);
      ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
      ctx.game.rollAgainAvailable = false;
      return formatNewsFlash(
        jailResult.jailed
          ? `${player.name} 被新闻屋爆出负面消息，直接送进监狱冷静三天。`
          : `${player.name} 被新闻屋爆出负面消息，本来要进监狱冷静三天，但${jailResult.god?.name ?? "福神"}护体，成功避开了牢狱之灾。`,
      );
    }
  }
}

function manageBank(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  bankChoice: string,
) {
  const inflationIndex = getInflationIndex(ctx);
  switch (bankChoice) {
    case "deposit300":
    case "deposit600": {
      const amount = getEffectiveBankAmount(bankChoice === "deposit600" ? 600 : 300, inflationIndex);
      assertCondition(actorState.bankDebt === 0, "有贷款在身时不能继续存款。");
      assertCondition(actorState.cash >= amount, "现金不足，无法存入这么多。");
      actorState.cash -= amount;
      actorState.bankSavings += amount;
      finishPendingStop(ctx);
      return `${actor.name} 在银行存入了 ${amount} 元。当前存款 ${actorState.bankSavings} 元。`;
    }
    case "withdraw": {
      assertCondition(actorState.bankSavings > 0, "你在银行里没有存款。");
      const principal = actorState.bankSavings;
      actorState.bankSavings = 0;
      actorState.cash += principal;
      finishPendingStop(ctx);
      return `${actor.name} 从银行取出了 ${principal} 元存款。每月 1 号的利息会自动计入银行存款。`;
    }
    case "borrow": {
      assertCondition(actorState.bankDebt === 0, "你已经有一笔贷款尚未还清。");
      const loanPrincipal = getEffectiveBankAmount(500, inflationIndex);
      const loanDebt = loanPrincipal + Math.floor(loanPrincipal * 0.1);
      actorState.cash += loanPrincipal;
      actorState.bankDebt = loanDebt;
      finishPendingStop(ctx);
      return `${actor.name} 在银行贷款 ${loanPrincipal} 元，下个月 1 号会自动扣回 ${loanDebt} 元。`;
    }
    case "repay": {
      assertCondition(actorState.bankDebt > 0, "当前没有需要偿还的贷款。");
      assertCondition(actorState.cash >= actorState.bankDebt, "现金不足，无法还清贷款。");
      const debt = actorState.bankDebt;
      actorState.cash -= debt;
      actorState.bankDebt = 0;
      finishPendingStop(ctx);
      return `${actor.name} 在银行提前还清了 ${debt} 元贷款。`;
    }
    default:
      throw new GameEngineError("未识别的银行操作。");
  }
}

function castMagic(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  magicKey: string,
  targetPlayerId?: string,
) {
  if (magicKey === "good") {
    const godKey = getRandomBlessingGodKey();
    const { god, rewards } = attachGodToPlayer(ctx, actor, actorState, godKey);
    finishPendingStop(ctx);
    const rewardSummary = formatGodAttachRewardSummary(god?.name, rewards);
    return formatGodAttachFlash(
      `${actor.name} 在魔法屋随机请来了${god?.name ?? "好神"}，接下来 ${GOD_DURATION_TURNS} 天都会生效。${rewardSummary}`,
    );
  }

  if (magicKey === "bad" || magicKey === "shuaishen") {
    assertCondition(targetPlayerId, "请选择要挂上坏神的目标。");
    assertCondition(targetPlayerId !== actor.id, "不能把坏神挂在自己身上。");
    const targetPlayer = getPlayer(ctx, targetPlayerId);
    const targetState = findPlayerState(ctx, targetPlayerId);
    assertCondition(!targetState.isBankrupt, "目标玩家已经破产。");
    const godKey = getRandomCurseGodKey();
    const god = getGodDefinition(godKey);
    setActiveGod(targetState, godKey);
    finishPendingStop(ctx);
    return formatGodAttachFlash(
      `${actor.name} 在魔法屋把${god?.name ?? "坏神"}送到了 ${targetPlayer.name} 身上，接下来 ${GOD_DURATION_TURNS} 天都会生效。`,
    );
  }

  throw new GameEngineError("未识别的魔法。");
}

function playAmusementGame(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  amusementChoice: string,
) {
  const inflationIndex = getInflationIndex(ctx);
  switch (amusementChoice) {
    case "balloon": {
      const rewardTable = [80, 120, 180, 220];
      const reward = getEffectiveItemAmount(
        rewardTable[Math.floor(Math.random() * rewardTable.length)] ?? 120,
        inflationIndex,
      );
      actorState.cash += reward;
      finishPendingStop(ctx);
      return `${actor.name} 在游乐场打气球大获全胜，拿到了 ${reward} 元奖金。`;
    }
    case "penguin": {
      if (Math.random() < 0.5) {
        const randomItem = getRandomItemDefinition();
        const itemDefinition = awardItem(ctx, actor.id, randomItem.key);
        finishPendingStop(ctx);
        return `${actor.name} 在企鹅挖宝中挖到了 ${itemDefinition?.name ?? randomItem.name}。`;
      }
      const reward = getEffectiveItemAmount(160, inflationIndex);
      actorState.cash += reward;
      finishPendingStop(ctx);
      return `${actor.name} 在企鹅挖宝中挖到一袋零钱，获得 ${reward} 元。`;
    }
    case "treasure": {
      const rewardTable = [100, 160, 260, 320];
      const reward = getEffectiveItemAmount(
        rewardTable[Math.floor(Math.random() * rewardTable.length)] ?? 160,
        inflationIndex,
      );
      actorState.cash += reward;
      finishPendingStop(ctx);
      return `${actor.name} 在接元宝摊位上手感火热，抱回了 ${reward} 元。`;
    }
    default:
      throw new GameEngineError("未识别的游乐场项目。");
  }
}

function settleLotteryDrawIfNeeded(ctx: GameContext) {
  if (ctx.game.turnNumber < ctx.game.lotteryDrawAtTurn) {
    return "";
  }

  const inflationIndex = getInflationIndex(ctx);
  const winningOption =
    LOTTERY_OPTIONS[Math.floor(Math.random() * LOTTERY_OPTIONS.length)] ?? LOTTERY_OPTIONS[0];
  const activePlayerIds = new Set(
    ctx.playerStates.filter((state) => !state.isBankrupt).map((state) => state.playerId),
  );
  const soldTickets = getLotteryTickets(ctx.game).filter((ticket) => activePlayerIds.has(ticket.playerId));

  ctx.game.lotteryDrawAtTurn = ctx.game.turnNumber + LOTTERY_DRAW_INTERVAL;
  setLotteryTickets(ctx.game, []);

  if (soldTickets.length === 0) {
    return ` 彩票屋开奖：${winningOption.label}，本期无人下注，奖池继续累积到 ${ctx.game.lotteryJackpot} 元。`;
  }

  const drawResult = resolveLotteryDraw(soldTickets, ctx.game.lotteryJackpot, winningOption.number);
  if (drawResult.matchingTickets.length === 0) {
    return ` 彩票屋开奖：${winningOption.label}，无人中奖，${ctx.game.lotteryJackpot} 元奖池继续滚存。`;
  }

  drawResult.payouts.forEach((payout) => {
    const winnerState = findPlayerState(ctx, payout.playerId);
    winnerState.cash += payout.amount;
  });

  ctx.game.lotteryJackpot = getEffectiveLotteryBaseJackpot(inflationIndex) + drawResult.remainder;
  const winnerSummary = drawResult.payouts
    .map((payout) => {
      const winner = getPlayer(ctx, payout.playerId);
      return `${winner.name}${payout.ticketCount > 1 ? `（${payout.ticketCount} 张）` : ""}获得 ${payout.amount} 元`;
    })
    .join("，");

  return ` 彩票屋开奖：${winningOption.label}，${winnerSummary}。新奖池为 ${ctx.game.lotteryJackpot} 元。`;
}

function resolveLanding(
  ctx: GameContext,
  player: Player,
  playerState: PlayerState,
  allowRollAgain: boolean,
): string {
  const tile = getTile(playerState.position);
  const inflationIndex = getInflationIndex(ctx);
  const playerIsSleepwalking = isSleepwalking(playerState);
  const mapGodSummary = claimMapGodAtCurrentTile(ctx, player, playerState);
  const withMapGod = (summary: string) =>
    mapGodSummary.includes("神明附身快报：")
      ? `${summary} ${mapGodSummary}`.trim()
      : `${mapGodSummary}${summary}`;
  ctx.game.pendingTileIndex = null;

  if (tile.type === "start") {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 停在了起点。`);
  }

  if (tile.type === "jail") {
    const releasedPlayers = releasePlayersFromJail(ctx);
    setPostActionPhase(ctx, playerState, allowRollAgain);
    if (releasedPlayers.length === 0) {
      return withMapGod(`${player.name} 来到了监狱。`);
    }

    return withMapGod(
      `${player.name} 来到监狱探监，顺手把 ${releasedPlayers.map((releasedPlayer) => releasedPlayer.name).join("、")} 放了出来。`,
    );
  }

  if (tile.type === "freeParking") {
    let summary = `${player.name} 在免费停车休息。`;
    if (ctx.settings.parkingJackpotEnabled && ctx.settings.parkingJackpot > 0) {
      playerState.cash += ctx.settings.parkingJackpot;
      summary = `${player.name} 从免费停车奖金池领取了 ${ctx.settings.parkingJackpot}。`;
      ctx.settings.parkingJackpot = 0;
    }

    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(summary);
  }

  if (tile.type === "goToJail") {
    const jailResult = trySendToJailWithFushenProtection(playerState);
    ctx.game.phase = GamePhase.WAITING_FOR_TURN_END;
    ctx.game.rollAgainAvailable = false;
    return withMapGod(
      jailResult.jailed
        ? `${player.name} 被直接送进监狱。`
        : `${player.name} 本来要被直接送进监狱，但${jailResult.god?.name ?? "福神"}护体，这次没有坐牢。`,
    );
  }

  if (tile.type === "tax") {
    const taxAmount = getEffectiveTaxAmount(tile, inflationIndex);
    const paymentResult = resolveRequiredCashPayment(ctx, player, playerState, {
      amountDue: taxAmount,
      reason: "税金",
      recipientKind: "tax",
      recipientPlayerId: null,
      continuation: "postAction",
      successSummary: `${player.name} 缴纳了 ${taxAmount} 的税金。`,
      bankruptcySummary: `${player.name} 缴税时破产了。`,
    }, {
      allowFreePass: true,
    });

    if (paymentResult.status === "bankrupt") {
      return advanceTurn(ctx, withMapGod(paymentResult.summary));
    }

    return withMapGod(paymentResult.summary);
  }

  if (playerIsSleepwalking) {
    if (tile.type === "shop") {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，路过了道具店，什么也没买。`);
    }

    if (tile.type === "lottery") {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，路过了彩票屋，没有停下来选号。`);
    }

    if (tile.type === "bank") {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，路过了银行，没有办理业务。`);
    }

    if (tile.type === "magic") {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，迷迷糊糊地路过了魔法屋。`);
    }

    if (tile.type === "amusement") {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，路过了游乐场，没有参加任何项目。`);
    }
  }

  if (tile.type === "shop") {
    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_SHOP_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(`${player.name} 来到了道具店，本次货架会随机刷新，可从中购买一张道具卡。`);
  }

  if (tile.type === "lottery") {
    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_LOTTERY_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(`${player.name} 来到了彩票屋，可以挑选一张彩色数字奖券。`);
  }

  if (tile.type === "bank") {
    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_BANK_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(
      `${player.name} 来到了银行，可以办理存款、取款和贷款。每月 1 号会自动发放 10% 存款利息，贷款也会在次月 1 号自动扣回本息；物价指数只影响罚金、税金和过路费。`,
    );
  }

  if (tile.type === "magic") {
    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_MAGIC_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(`${player.name} 来到了魔法屋，可以随机请好神上身，或给别人挂上坏神。`);
  }

  if (tile.type === "chance") {
    return withMapGod(resolveDeckTile(ctx, player, playerState, allowRollAgain, "chance"));
  }

  if (tile.type === "community") {
    return withMapGod(resolveDeckTile(ctx, player, playerState, allowRollAgain, "community"));
  }

  if (tile.type === "freeCard") {
    return withMapGod(resolveFreeCardPoint(ctx, player, playerState, allowRollAgain));
  }

  if (tile.type === "news") {
    return withMapGod(resolveNewsHouse(ctx, player, playerState, allowRollAgain));
  }

  if (tile.type === "amusement") {
    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_AMUSEMENT_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(`${player.name} 来到了游乐场，可以挑一个小游戏摊位。`);
  }

  const propertyState = findPropertyState(ctx, tile.index);

  if (!propertyState.ownerPlayerId) {
    if (playerIsSleepwalking) {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 正在梦游，路过了 ${tile.name}，没有把它买下来。`);
    }

    ctx.game.pendingTileIndex = tile.index;
    ctx.game.phase = GamePhase.WAITING_FOR_PROPERTY_DECISION;
    ctx.game.rollAgainAvailable = allowRollAgain;
    return withMapGod(
      `${player.name} 停在 ${tile.name}，可以花费 ${getEffectiveTilePrice(tile, inflationIndex)} 买下它。`,
    );
  }

  if (propertyState.ownerPlayerId === player.id) {
    if (playerIsSleepwalking) {
      setPostActionPhase(ctx, playerState, allowRollAgain);
      return withMapGod(`${player.name} 梦游回到了自己的 ${tile.name}，没有停下来建房。`);
    }

    if (
      tile.type === "property" &&
      !propertyState.mortgaged &&
      !propertyState.hasHotel
    ) {
      const buildCost = getBuildHouseCostByGod(
        playerState,
        getEffectiveHouseCost(tile, inflationIndex),
      );
      const activeGod = getEffectiveActiveGod(playerState);
      const buildHint = isCaishenGodKey(activeGod?.key)
        ? `这次由${activeGod?.name ?? "财神"}免单。`
        : isFushenGodKey(activeGod?.key)
          ? `这次会在${activeGod?.name ?? "福神"}加持下一次加盖两层。`
          : "";
      ctx.game.pendingTileIndex = tile.index;
      ctx.game.phase = GamePhase.WAITING_FOR_PROPERTY_DECISION;
      ctx.game.rollAgainAvailable = allowRollAgain;
      return withMapGod(
        `${player.name} 回到了自己的 ${tile.name}，可以${
          buildCost <= 0 ? "免费" : `花费 ${buildCost}`
        }建房或升级。${buildHint}`,
      );
    }

    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 来到了自己的 ${tile.name}。`);
  }

  if (propertyState.mortgaged) {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 来到了 ${tile.name}，但这里当前处于抵押状态。`);
  }

  const rent = calculateRent(ctx, tile, propertyState);
  const rentAdjustment = resolvePassTollByGod(playerState, rent);
  const owner = getPlayer(ctx, propertyState.ownerPlayerId);
  const ownerState = findPlayerState(ctx, owner.id);

  if (ownerState.inJailTurns > 0) {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 来到了 ${owner.name} 的 ${tile.name}，但对方正在监狱里，暂时不能收过路费。`);
  }

  if (isAbducted(ownerState)) {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 来到了 ${owner.name} 的 ${tile.name}，但对方被外星人抓走了，暂时不能收过路费。`);
  }

  if (isSleepwalking(ownerState)) {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(`${player.name} 来到了 ${owner.name} 的 ${tile.name}，但对方正在梦游，当前不收路费。`);
  }

  if (rentAdjustment.freeByCaishen) {
    setPostActionPhase(ctx, playerState, allowRollAgain);
    return withMapGod(
      `${player.name} 经过 ${owner.name} 的 ${tile.name}，${rentAdjustment.summary}`,
    );
  }

  const paidResult = resolveRequiredCashPayment(ctx, player, playerState, {
    amountDue: rentAdjustment.rent,
    reason:
      tile.type === "property" && !propertyState.hasHotel && propertyState.houseCount === 0
        ? `${tile.name} 的空地过路费`
        : `${tile.name} 的租金`,
    recipientKind: "player",
    recipientPlayerId: owner.id,
    continuation: "postAction",
    successSummary:
      tile.type === "property" && !propertyState.hasHotel && propertyState.houseCount === 0
        ? `${player.name} 踩到了 ${owner.name} 的 ${tile.name} 空地，支付了 ${rentAdjustment.rent} 的空地过路费。${rentAdjustment.summary}`
        : `${player.name} 向 ${owner.name} 支付了 ${rentAdjustment.rent} 的租金。${rentAdjustment.summary}`,
    bankruptcySummary: `${player.name} 无法支付 ${tile.name} 的租金，已经破产。`,
  }, {
    allowFreePass: true,
  });

  if (paidResult.status === "bankrupt") {
    return advanceTurn(ctx, withMapGod(paidResult.summary));
  }

  return withMapGod(paidResult.summary);
}

function readShareAmount(action: GameActionRequest) {
  assertCondition(
    typeof action.shares === "number" && Number.isInteger(action.shares) && action.shares > 0,
    "股数必须是正整数。",
  );
  assertCondition(action.shares <= 50, "单次最多只能交易 50 股。");
  return action.shares;
}

function buyItemFromShop(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  itemKey: string,
) {
  const itemDefinition = getItemDefinition(itemKey);
  assertCondition(itemDefinition, "未知道具。");
  assertCondition(
    isItemInShopOffer(itemKey, {
      gameId: ctx.game.id,
      currentPlayerId: ctx.game.currentPlayerId,
      turnNumber: ctx.game.turnNumber,
      pendingTileIndex: ctx.game.pendingTileIndex,
      version: ctx.game.version,
    }),
    "这件道具不在本次商店货架上。",
  );

  const inventoryItem = findInventoryItem(ctx, actor.id, itemKey);
  const itemPrice = getEffectiveItemPrice(itemDefinition, getInflationIndex(ctx));
  assertCondition(actorState.cash >= itemPrice, "现金不足，无法购买该道具。");

  actorState.cash -= itemPrice;
  inventoryItem.quantity += 1;
  finishPendingStop(ctx);

  return `${actor.name} 花费 ${itemPrice} 购买了 ${itemDefinition.name}。`;
}

function buyLotteryTicket(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  lotteryNumber: number,
) {
  const option = getLotteryOption(lotteryNumber);
  assertCondition(option, "未找到对应的彩券号码。");
  const ticketPrice = getEffectiveLotteryTicketPrice(getInflationIndex(ctx));
  assertCondition(actorState.cash >= ticketPrice, "现金不足，买不起这张彩券。");

  const tickets = getLotteryTickets(ctx.game);
  tickets.push({
    playerId: actor.id,
    number: option.number,
    purchasedAtTurn: ctx.game.turnNumber,
  });
  setLotteryTickets(ctx.game, tickets);

  actorState.cash -= ticketPrice;
  ctx.game.lotteryJackpot += ticketPrice;
  finishPendingStop(ctx);

  return `${actor.name} 在彩票屋买下了 ${option.label}，花费 ${ticketPrice} 元。当前奖池来到 ${ctx.game.lotteryJackpot} 元。`;
}

function useInventoryItem(
  ctx: GameContext,
  actor: Player,
  actorState: PlayerState,
  itemKey: string,
  targetPlayerId?: string,
) {
  const itemDefinition = getItemDefinition(itemKey);
  assertCondition(itemDefinition, "未知道具。");

  const inventoryItem = findInventoryItem(ctx, actor.id, itemKey);
  assertCondition(inventoryItem.quantity > 0, `你没有 ${itemDefinition.name}。`);
  const inflationIndex = getInflationIndex(ctx);
  const isPassiveDefenseItem =
    itemDefinition.effectType === "rebound" ||
    itemDefinition.effectType === "innocence" ||
    itemDefinition.effectType === "freePass";

  if (!isPassiveDefenseItem) {
    assertCondition(canUseActiveEffects(actorState), "梦游中只能前进，不能使用道具或管理资产。");
  }

  switch (itemDefinition.effectType) {
    case "cashBoost": {
      const amount = getEffectiveItemAmount(itemDefinition.amount ?? 180, inflationIndex);
      inventoryItem.quantity -= 1;
      actorState.cash += amount;
      return `${actor.name} 使用了 ${itemDefinition.name}，从银行领取了 ${amount} 元。`;
    }
    case "vehicle": {
      const vehicleDefinition = getVehicleDefinitionByItemKey(itemKey);
      assertCondition(vehicleDefinition, "该载具道具配置不存在。", 500);

      inventoryItem.quantity -= 1;
      setActiveVehicle(actorState, vehicleDefinition.key);
      return `${actor.name} 使用了 ${itemDefinition.name}，接下来 ${vehicleDefinition.turns} 回合每次可掷 ${vehicleDefinition.diceCount} 个骰子。`;
    }
    case "remoteDice": {
      throw new GameEngineError("请在掷骰阶段直接选择点数来使用遥控骰子。");
    }
    case "rebound":
    case "innocence":
    case "freePass": {
      throw new GameEngineError(`${itemDefinition.name} 只能在对应的响应阶段手动触发。`);
    }
    case "wealthRedistribution": {
      inventoryItem.quantity -= 1;
      const activeStates = getActiveStates(ctx).sort((left, right) => {
        const leftPlayer = getPlayer(ctx, left.playerId);
        const rightPlayer = getPlayer(ctx, right.playerId);
        return leftPlayer.seatOrder - rightPlayer.seatOrder;
      });
      const totalCash = activeStates.reduce((sum, state) => sum + state.cash, 0);
      const evenShare = Math.floor(totalCash / activeStates.length);
      let remainder = totalCash - evenShare * activeStates.length;

      activeStates.forEach((state) => {
        state.cash = evenShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) {
          remainder -= 1;
        }
      });

      return `${actor.name} 使用了 ${itemDefinition.name}，所有玩家的现金被重新平均分配。`;
    }
    case "collectFromPlayers": {
      const amount = getEffectiveItemAmount(itemDefinition.amount ?? 60, inflationIndex);
      inventoryItem.quantity -= 1;
      let totalCollected = 0;

      getActiveStates(ctx).forEach((state) => {
        if (state.playerId === actor.id) {
          return;
        }

        const collected = Math.min(state.cash, amount);
        state.cash -= collected;
        actorState.cash += collected;
        totalCollected += collected;
      });

      return `${actor.name} 使用了 ${itemDefinition.name}，向其他玩家一共收取了 ${totalCollected} 元。`;
    }
    case "jailFree": {
      const amount = itemDefinition.amount ?? 1;
      inventoryItem.quantity -= 1;
      actorState.jailFreeCards += amount;
      return `${actor.name} 使用了 ${itemDefinition.name}，获得了 ${amount} 张出狱卡。`;
    }
    case "blessing": {
      const godKey = itemDefinition.godKey;
      assertCondition(godKey, "该祝福道具未配置神明。", 500);

      inventoryItem.quantity -= 1;
      const { god, rewards } = attachGodToPlayer(ctx, actor, actorState, godKey, GOD_DURATION_TURNS);
      const rewardSummary = formatGodAttachRewardSummary(god?.name, rewards);
      return formatGodAttachFlash(
        `${actor.name} 使用了 ${itemDefinition.name}，请来了${god?.name ?? "神明"}护体，持续 ${GOD_DURATION_TURNS} 天。${rewardSummary}`,
      );
    }
    case "summonMapGod": {
      inventoryItem.quantity -= 1;
      const pulledGod = pullNearestMapGodToPlayer(ctx, actor, actorState);
      if (!pulledGod) {
        return `${actor.name} 使用了 ${itemDefinition.name}，但场上没有地图神明可拉，这张卡白白消失了。`;
      }

      const rewardSummary = formatGodAttachRewardSummary(pulledGod.god?.name, pulledGod.rewards);
      return formatGodAttachFlash(
        `${actor.name} 使用了 ${itemDefinition.name}，把 ${pulledGod.tile.name} 上最近的${pulledGod.god?.name ?? "神明"}拉到了自己身上。${rewardSummary}`,
      );
    }
    case "dismissGod": {
      const currentGod = getEffectiveActiveGod(actorState);
      assertCondition(currentGod, "你身上没有可送走的神明。");
      inventoryItem.quantity -= 1;
      clearActiveGod(actorState);
      return `${actor.name} 使用了 ${itemDefinition.name}，送走了身上的${currentGod.name}。`;
    }
    case "badGod": {
      const godKey = itemDefinition.godKey;
      assertCondition(godKey, "该坏神道具未配置神明。", 500);
      assertCondition(targetPlayerId, "请选择道具目标。");
      assertCondition(targetPlayerId !== actor.id, "不能对自己使用该道具。");

      inventoryItem.quantity -= 1;
      const resolution = resolveTargetedDebuffTarget(ctx, actor, targetPlayerId, itemDefinition.name, {
        allowRebound: true,
      });

      setActiveGodWithTurns(resolution.targetState, godKey, GOD_DURATION_TURNS);
      const god = getGodDefinition(godKey);
      return formatGodAttachFlash(
        `${actor.name} 使用了 ${itemDefinition.name}。${resolution.summaryPrefix}${god?.name ?? "坏神"}会纠缠 ${resolution.targetPlayer.name} ${GOD_DURATION_TURNS} 天。`,
      );
    }
    case "stealCash": {
      const amount = getEffectiveItemAmount(itemDefinition.amount ?? 180, inflationIndex);
      assertCondition(targetPlayerId, "请选择道具目标。");
      assertCondition(targetPlayerId !== actor.id, "不能对自己使用该道具。");

      const targetPlayer = getPlayer(ctx, targetPlayerId);
      const targetState = findPlayerState(ctx, targetPlayerId);
      assertCondition(!targetState.isBankrupt, "目标玩家已经破产。");

      inventoryItem.quantity -= 1;
      const collected = Math.min(targetState.cash, amount);
      targetState.cash -= collected;
      actorState.cash += collected;
      return `${actor.name} 对 ${targetPlayer.name} 使用了 ${itemDefinition.name}，收回了 ${collected} 元。`;
    }
    case "taxAudit": {
      const rate = itemDefinition.rate ?? 0.1;
      assertCondition(targetPlayerId, "请选择道具目标。");
      assertCondition(targetPlayerId !== actor.id, "不能对自己使用该道具。");

      const targetPlayer = getPlayer(ctx, targetPlayerId);
      const targetState = findPlayerState(ctx, targetPlayerId);
      assertCondition(!targetState.isBankrupt, "目标玩家已经破产。");

      inventoryItem.quantity -= 1;
      const collected = Math.min(targetState.cash, Math.floor(targetState.cash * rate));
      if (collected > 0 && findInventoryItem(ctx, targetPlayerId, FREE_PASS_ITEM_KEY).quantity > 0) {
        return beginTaxAuditReaction(ctx, actor, targetPlayer, collected, itemDefinition.name);
      }

      targetState.cash -= collected;
      actorState.cash += collected;
      return `${actor.name} 对 ${targetPlayer.name} 使用了 ${itemDefinition.name}，收取了 ${collected} 元税款。`;
    }
    case "sleepwalk": {
      const turns = itemDefinition.turns ?? 5;
      assertCondition(targetPlayerId, "请选择道具目标。");
      assertCondition(targetPlayerId !== actor.id, "不能对自己使用该道具。");

      inventoryItem.quantity -= 1;
      const resolution = resolveTargetedDebuffTarget(ctx, actor, targetPlayerId, itemDefinition.name, {
        allowRebound: true,
      });
      const protectingGod = getFushenProtection(resolution.targetState);
      if (protectingGod) {
        return `${actor.name} 使用了 ${itemDefinition.name}。${resolution.summaryPrefix}${resolution.targetPlayer.name} 有${protectingGod.name}护体，这次不会进入梦游。`;
      }
      if (findInventoryItem(ctx, resolution.targetPlayer.id, INNOCENCE_ITEM_KEY).quantity > 0) {
        return `${resolution.summaryPrefix}${beginDebuffReaction(
          ctx,
          actor,
          resolution.targetPlayer,
          itemDefinition.name,
          "sleepwalk",
          turns,
        )}`;
      }

      setSleepwalking(resolution.targetState, turns);
      return `${actor.name} 使用了 ${itemDefinition.name}。${resolution.summaryPrefix}${resolution.targetPlayer.name} 进入梦游状态，持续 ${turns} 回合。`;
    }
    case "sabotage": {
      assertCondition(targetPlayerId, "请选择道具目标。");
      assertCondition(targetPlayerId !== actor.id, "不能对自己使用该道具。");

      inventoryItem.quantity -= 1;
      const resolution = resolveTargetedDebuffTarget(ctx, actor, targetPlayerId, itemDefinition.name, {
        allowRebound: true,
      });
      const protectingGod = getFushenProtection(resolution.targetState);
      if (protectingGod) {
        return `${actor.name} 使用了 ${itemDefinition.name}。${resolution.summaryPrefix}${resolution.targetPlayer.name} 有${protectingGod.name}护体，这次没有被陷害坐牢。`;
      }
      if (findInventoryItem(ctx, resolution.targetPlayer.id, INNOCENCE_ITEM_KEY).quantity > 0) {
        return `${resolution.summaryPrefix}${beginDebuffReaction(
          ctx,
          actor,
          resolution.targetPlayer,
          itemDefinition.name,
          "sabotage",
        )}`;
      }

      const jailResult = trySendToJailWithFushenProtection(resolution.targetState);
      return `${actor.name} 使用了 ${itemDefinition.name}。${resolution.summaryPrefix}${
        jailResult.jailed
          ? `${resolution.targetPlayer.name} 被直接送进了监狱。`
          : `${resolution.targetPlayer.name} 本来要被直接送进监狱，但${jailResult.god?.name ?? "福神"}护体，成功躲开了。`
      }`;
    }
  }
}

async function persistGameContext(tx: Prisma.TransactionClient, ctx: GameContext) {
  await tx.room.update({
    where: { id: ctx.room.id },
    data: {
      status: ctx.room.status,
    },
  });

  await tx.roomSettings.update({
    where: { roomId: ctx.room.id },
    data: {
      parkingJackpot: ctx.settings.parkingJackpot,
    },
  });

  await tx.game.update({
    where: { id: ctx.game.id },
    data: {
      phase: ctx.game.phase,
      version: { increment: 1 },
      turnNumber: ctx.game.turnNumber,
      currentPlayerId: ctx.game.currentPlayerId,
      winnerPlayerId: ctx.game.winnerPlayerId,
      lastDiceA: ctx.game.lastDiceA,
      lastDiceB: ctx.game.lastDiceB,
      lastDiceTotal: ctx.game.lastDiceTotal,
      lastRollValues: ctx.game.lastRollValues,
      consecutiveDoubles: ctx.game.consecutiveDoubles,
      pendingTileIndex: ctx.game.pendingTileIndex,
      rollAgainAvailable: ctx.game.rollAgainAvailable,
      recoveryContext: ctx.game.recoveryContext,
      reactionContext: ctx.game.reactionContext,
      chanceDeck: ctx.game.chanceDeck,
      chanceIndex: ctx.game.chanceIndex,
      communityDeck: ctx.game.communityDeck,
      communityIndex: ctx.game.communityIndex,
      calendarStartDate: ctx.game.calendarStartDate,
      lotteryJackpot: ctx.game.lotteryJackpot,
      lotteryDrawAtTurn: ctx.game.lotteryDrawAtTurn,
      lotteryTickets: ctx.game.lotteryTickets,
      mapGodSpawns: ctx.game.mapGodSpawns,
      logSummary: ctx.game.logSummary,
    },
  });

  await Promise.all(
    ctx.playerStates.map((state) =>
      tx.playerState.update({
        where: { id: state.id },
        data: {
          cash: state.cash,
          position: state.position,
          lapsCompleted: state.lapsCompleted,
          inJailTurns: state.inJailTurns,
          abductedTurns: state.abductedTurns,
          sleepwalkingTurns: state.sleepwalkingTurns,
          jailFreeCards: state.jailFreeCards,
          bankSavings: state.bankSavings,
          bankDebt: state.bankDebt,
          activeGodKey: state.activeGodKey,
          godTurns: state.godTurns,
          activeVehicleKey: state.activeVehicleKey,
          vehicleTurns: state.vehicleTurns,
          isManaged: state.isManaged,
          managedReason: state.managedReason,
          isBankrupt: state.isBankrupt,
          bankruptAtTurn: state.bankruptAtTurn,
        },
      }),
    ),
  );

  await Promise.all(
    ctx.propertyStates.map((state) =>
      tx.propertyState.update({
        where: { id: state.id },
        data: {
          ownerPlayerId: state.ownerPlayerId,
          houseCount: state.houseCount,
          hasHotel: state.hasHotel,
          mortgaged: state.mortgaged,
        },
      }),
    ),
  );

  await Promise.all(
    ctx.stockStates.map((state) =>
      tx.stockState.update({
        where: { id: state.id },
        data: {
          currentPrice: state.currentPrice,
          previousPrice: state.previousPrice,
          availableShares: state.availableShares,
          volatility: state.volatility,
        },
      }),
    ),
  );

  await Promise.all(
    ctx.stockHoldings.map((state) =>
      tx.playerStockHolding.update({
        where: { id: state.id },
        data: {
          shares: state.shares,
          averageCost: state.averageCost,
        },
      }),
    ),
  );

  await Promise.all(
    ctx.inventoryItems.map((state) =>
      tx.playerInventoryItem.update({
        where: { id: state.id },
        data: {
          quantity: state.quantity,
        },
      }),
    ),
  );
}

export async function listJoinableRooms(): Promise<RoomListItemView[]> {
  await purgeExpiredRooms(prisma);
  const rooms = await prisma.room.findMany({
    where: {
      status: RoomStatus.LOBBY,
      settings: {
        isNot: null,
      },
    },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return rooms
    .filter((room) => room.settings && room.players.length > 0)
    .filter((room) => room.players.length < room.settings!.maxPlayers)
    .map((room) => {
      const host = room.players.find((player) => player.isHost) ?? room.players[0];

      return {
        code: room.code,
        hostName: host?.name ?? "未知房主",
        playerCount: room.players.length,
        maxPlayers: room.settings!.maxPlayers,
        takenCharacterIds: room.players.map((player) => player.characterId),
        players: room.players.map((player) => ({
          name: player.name,
          characterName: getCharacterPreset(player.characterId)?.name ?? player.characterId,
          isHost: player.isHost,
        })),
        updatedAt: room.updatedAt.toISOString(),
      };
    })
    .slice(0, 16);
}

function pickAvailableCharacterId(players: Player[]) {
  return (
    CHARACTER_PRESETS.find(
      (character) => !players.some((player) => player.characterId === character.id),
    )?.id ?? null
  );
}

function getNextBotName(players: Player[]) {
  const occupiedIndexes = new Set(
    players
      .filter((player) => player.isBot)
      .map((player) => {
        const matched = player.name.match(/^电脑(\d+)$/);
        return matched ? Number(matched[1]) : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value)),
  );

  let index = 1;
  while (occupiedIndexes.has(index)) {
    index += 1;
  }

  return `${BOT_NAME_PREFIX}${index}`;
}

export async function createRoomWithHost(input: {
  hostName: string;
  characterId: string;
  settings?: Partial<RoomSettingsInput>;
}) {
  await purgeExpiredRooms(prisma);
  const normalizedName = normalizePlayerName(input.hostName);
  assertCondition(normalizedName.length >= 2, "昵称至少需要 2 个字符。");
  assertCondition(input.characterId, "请选择角色。");

  const settings = clampRoomSettings(input.settings);
  const hostToken = createPlayerToken();

  const result = await prisma.$transaction(async (tx) => {
    const roomCode = await generateUniqueRoomCode(tx);
    const room = await tx.room.create({
      data: {
        code: roomCode,
        status: RoomStatus.LOBBY,
        settings: {
          create: {
            ...settings,
          },
        },
        players: {
          create: {
            name: normalizedName,
            token: hostToken,
            seatOrder: 0,
            isHost: true,
            isReady: true,
            lastSeenAt: new Date(),
            characterId: input.characterId,
          },
        },
      },
      include: {
        players: true,
      },
    });

    const hostPlayer = room.players[0];
    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode,
      actorPlayerId: hostPlayer.id,
      eventType: "ROOM_CREATED",
      summary: `${hostPlayer.name} 创建了房间。`,
      payload: {
        settings,
      },
    });

    const snapshot = await loadRoomSnapshot(tx, roomCode, hostToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode,
      token: hostToken,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result;
}

export async function joinRoom(input: {
  roomCode: string;
  playerName: string;
  characterId: string;
}) {
  const normalizedName = normalizePlayerName(input.playerName);
  assertCondition(normalizedName.length >= 2, "昵称至少需要 2 个字符。");
  assertCondition(input.characterId, "请选择角色。");

  const token = createPlayerToken();
  const normalizedRoomCode = normalizeRoomCode(input.roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "对局已经开始。");
    assertCondition(
      room.players.length < room.settings!.maxPlayers,
      "房间人数已满。",
    );
    assertCondition(
      !room.players.some((player) => player.characterId === input.characterId),
      "该角色已被选择。",
    );

    const nextSeatOrder =
      Math.max(...room.players.map((player) => player.seatOrder), -1) + 1;

    const player = await tx.player.create({
      data: {
        roomId: room.id,
        name: normalizedName,
        token,
        seatOrder: nextSeatOrder,
        characterId: input.characterId,
        isReady: false,
        lastSeenAt: new Date(),
      },
    });

    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      actorPlayerId: player.id,
      eventType: "PLAYER_JOINED",
      summary: `${player.name} 加入了房间。`,
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, token);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      token,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result;
}

export async function updateLobbyPlayer(
  roomCode: string,
  playerToken: string,
  input: {
    characterId?: string;
    isReady?: boolean;
  },
) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "对局已经开始。");

    const player = findPlayerByToken(room.players, playerToken);
    assertCondition(player, "玩家令牌无效。", 401);

    if (input.characterId && input.characterId !== player.characterId) {
      assertCondition(
        !room.players.some(
          (otherPlayer) =>
            otherPlayer.id !== player.id && otherPlayer.characterId === input.characterId,
        ),
        "该角色已被选择。",
      );
    }

    const updatedPlayer = await tx.player.update({
      where: { id: player.id },
      data: {
        characterId: input.characterId ?? player.characterId,
        isReady: input.isReady ?? player.isReady,
      },
    });

    const summary =
      input.characterId && input.characterId !== player.characterId
        ? `${player.name} 切换了角色。`
        : updatedPlayer.isReady
          ? `${player.name} 已准备。`
          : `${player.name} 取消了准备。`;

    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      actorPlayerId: player.id,
      eventType: "PLAYER_UPDATED",
      summary,
      payload: input,
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function updateRoomSettings(
  roomCode: string,
  playerToken: string,
  settingsInput: Partial<RoomSettingsInput>,
) {
  const settings = clampRoomSettings(settingsInput);
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "对局开始后不能再修改房规。");

    const player = findPlayerByToken(room.players, playerToken);
    assertCondition(player?.isHost, "只有房主可以修改房规。", 403);
    assertCondition(
      room.players.length <= settings.maxPlayers,
      "当前玩家数量超过了新的房间上限。",
    );

    await tx.roomSettings.update({
      where: { roomId: room.id },
      data: settings,
    });

    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      actorPlayerId: player.id,
      eventType: "SETTINGS_UPDATED",
      summary: `${player.name} 更新了房间规则。`,
      payload: settings,
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function addBotPlayer(roomCode: string, playerToken: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "只有开局前才能加入电脑玩家。");

    const host = findPlayerByToken(room.players, playerToken);
    assertCondition(host?.isHost, "只有房主可以加入电脑玩家。", 403);
    assertCondition(room.players.length < room.settings!.maxPlayers, "房间人数已满。");

    const characterId = pickAvailableCharacterId(room.players);
    assertCondition(characterId, "当前没有可用角色给电脑玩家。");
    const seatOrder = Math.max(...room.players.map((player) => player.seatOrder), -1) + 1;
    const botName = getNextBotName(room.players);
    const botToken = createPlayerToken();

    const bot = await tx.player.create({
      data: {
        roomId: room.id,
        name: botName,
        token: botToken,
        seatOrder,
        isBot: true,
        isReady: true,
        isConnected: true,
        lastSeenAt: new Date(),
        characterId,
      },
    });

    const characterName = getCharacterPreset(characterId)?.name ?? characterId;
    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      actorPlayerId: host.id,
      eventType: "BOT_ADDED",
      summary: `${host.name} 添加了电脑玩家 ${bot.name}，使用角色 ${characterName}。`,
      payload: {
        botPlayerId: bot.id,
        characterId,
      },
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function removeBotPlayer(
  roomCode: string,
  playerToken: string,
  targetPlayerId: string,
) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "只有开局前才能移除电脑玩家。");

    const host = findPlayerByToken(room.players, playerToken);
    assertCondition(host?.isHost, "只有房主可以移除电脑玩家。", 403);

    const bot = room.players.find((player) => player.id === targetPlayerId);
    assertCondition(bot, "要移除的电脑玩家不存在。", 404);
    assertCondition(bot.isBot, "只能移除电脑玩家。");

    await tx.player.delete({
      where: { id: bot.id },
    });

    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      actorPlayerId: host.id,
      eventType: "BOT_REMOVED",
      summary: `${host.name} 移除了电脑玩家 ${bot.name}。`,
      payload: {
        botPlayerId: bot.id,
      },
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function updateManagedMode(
  roomCode: string,
  playerToken: string,
  managed: boolean,
) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const ctx = await getGameContextByRoomCode(tx, normalizedRoomCode);
    assertCondition(ctx.room.status === RoomStatus.IN_GAME, "当前没有进行中的对局。");

    const player = findPlayerByToken(ctx.players, playerToken);
    assertCondition(player, "玩家令牌无效。", 401);
    assertCondition(!player.isBot, "电脑玩家不支持切换托管。");

    const playerState = findPlayerState(ctx, player.id);
    assertCondition(!playerState.isBankrupt, "破产玩家无法切换托管。");

    if (managed) {
      setManagedMode(playerState, "manual");
    } else {
      clearManagedMode(playerState);
    }

    await tx.player.update({
      where: { id: player.id },
      data: {
        isConnected: true,
        lastSeenAt: new Date(),
      },
    });

    await persistGameContext(tx, ctx);

    const summary = managed
      ? `${player.name} 开启了托管。`
      : `${player.name} 取消了托管，恢复手动操作。`;
    const eventInfo = await appendEvent(tx, {
      roomId: ctx.room.id,
      roomCode: ctx.room.code,
      gameId: ctx.game.id,
      actorPlayerId: player.id,
      eventType: managed ? "MANAGED_ENABLED" : "MANAGED_DISABLED",
      summary,
      payload: {
        managed,
      },
    });

    const snapshot = await loadRoomSnapshot(tx, ctx.room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: ctx.room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function recordPlayerHeartbeat(roomCode: string, playerToken: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  return prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    const player = findPlayerByToken(room.players, playerToken);
    assertCondition(player, "玩家令牌无效。", 401);

    await tx.player.update({
      where: { id: player.id },
      data: {
        isConnected: true,
        lastSeenAt: new Date(),
      },
    });

    return {
      roomCode: room.code,
      playerId: player.id,
    };
  });
}

export async function enableManagedModeByTimeout(roomCode: string, playerId: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const ctx = await getGameContextByRoomCode(tx, normalizedRoomCode);
    assertCondition(ctx.room.status === RoomStatus.IN_GAME, "当前没有进行中的对局。");
    assertCondition(ctx.game.phase !== GamePhase.GAME_OVER, "对局已经结束。");

    const player = ctx.players.find((item) => item.id === playerId) ?? null;
    assertCondition(player, "玩家不存在。", 404);
    assertCondition(!player.isBot, "电脑玩家不需要超时托管。");
    assertCondition(ctx.game.currentPlayerId === player.id, "当前玩家已变化，无需超时托管。");

    const playerState = findPlayerState(ctx, player.id);
    if (playerState.isBankrupt || playerState.isManaged) {
      return {
        roomCode: ctx.room.code,
        changed: false,
        gameId: ctx.game.id,
      };
    }

    setManagedMode(playerState, "timeout");

    await tx.player.update({
      where: { id: player.id },
      data: {
        isConnected: false,
      },
    });

    await persistGameContext(tx, ctx);

    const eventInfo = await appendEvent(tx, {
      roomId: ctx.room.id,
      roomCode: ctx.room.code,
      gameId: ctx.game.id,
      actorPlayerId: player.id,
      eventType: "MANAGED_TIMEOUT",
      summary: `${player.name} 超时未操作，已自动进入托管。`,
      payload: {
        managedReason: "timeout",
      },
    });

    const snapshot = await loadRoomSnapshot(tx, ctx.room.code, player.token);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: ctx.room.code,
      changed: true,
      gameId: ctx.game.id,
      eventInfo,
      snapshot,
    };
  });

  if ("eventInfo" in result && result.eventInfo) {
    publishEvent(
      result.roomCode,
      result.eventInfo.event.sequence,
      result.eventInfo.event.eventType,
      result.eventInfo.event.summary,
    );
  }

  return result;
}

export async function startRoomGame(roomCode: string, playerToken: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const result = await prisma.$transaction(async (tx) => {
    const room = await getLobbyRoom(tx, normalizedRoomCode);
    assertCondition(room.status === RoomStatus.LOBBY, "对局已经开始。");

    const host = findPlayerByToken(room.players, playerToken);
    assertCondition(host?.isHost, "只有房主可以开始游戏。", 403);
    assertCondition(room.players.length >= 2, "至少需要 2 名玩家。");
    assertCondition(
      room.players.every((player) => player.isReady),
      "所有玩家都必须准备完成。",
    );

    const chanceDeck = createShuffledDeck("chance");
    const communityDeck = createShuffledDeck("community");
    const initialMapGod = createRandomMapGodSpawn([]);

    const game = await tx.game.create({
      data: {
        roomId: room.id,
        phase: GamePhase.WAITING_FOR_ROLL,
        currentPlayerId: room.players[0].id,
        chanceDeck: serializeDeck(chanceDeck),
        chanceIndex: 0,
        communityDeck: serializeDeck(communityDeck),
        communityIndex: 0,
        calendarStartDate: formatDateKeyFromDate(new Date()),
        lotteryJackpot: getEffectiveLotteryBaseJackpot(1),
        lotteryDrawAtTurn: LOTTERY_DRAW_INTERVAL,
        lotteryTickets: serializeLotteryTickets([]),
        mapGodSpawns: serializeMapGodSpawns(initialMapGod ? [initialMapGod] : []),
        lastRollValues: "[]",
        playerStates: {
          create: room.players.map((player) => ({
            playerId: player.id,
            cash: room.settings!.startingCash,
            position: 0,
            lapsCompleted: 0,
            inJailTurns: 0,
            abductedTurns: 0,
            sleepwalkingTurns: 0,
            jailFreeCards: 0,
            bankSavings: 0,
            bankDebt: 0,
            activeGodKey: null,
            godTurns: 0,
            activeVehicleKey: null,
            vehicleTurns: 0,
            isManaged: false,
            managedReason: null,
          })),
        },
        propertyStates: {
          create: BOARD_TILES.filter(isPurchasableTile).map((tile) => ({
            tileIndex: tile.index,
          })),
        },
      },
    });

    if (room.settings!.stocksEnabled) {
      await tx.stockState.createMany({
        data: STOCK_DEFINITIONS.map((stock) => ({
          gameId: game.id,
          symbol: stock.symbol,
          name: stock.name,
          currentPrice: stock.startingPrice,
          previousPrice: stock.startingPrice,
          availableShares: stock.availableShares,
          volatility: stock.volatility,
        })),
      });

      const stockStates = await tx.stockState.findMany({
        where: { gameId: game.id },
        orderBy: { symbol: "asc" },
      });

      await tx.playerStockHolding.createMany({
        data: room.players.flatMap((player) =>
          stockStates.map((stockState) => ({
            gameId: game.id,
            stockStateId: stockState.id,
            playerId: player.id,
            shares: 0,
            averageCost: 0,
          })),
        ),
      });
    }

    await tx.playerInventoryItem.createMany({
      data: room.players.flatMap((player) =>
        ITEM_DEFINITIONS.map((item) => ({
          gameId: game.id,
          playerId: player.id,
          itemKey: item.key,
          quantity: 0,
        })),
      ),
    });

    await tx.room.update({
      where: { id: room.id },
      data: {
        status: RoomStatus.IN_GAME,
      },
    });

    const eventInfo = await appendEvent(tx, {
      roomId: room.id,
      roomCode: room.code,
      gameId: game.id,
      actorPlayerId: host.id,
      eventType: "GAME_STARTED",
      summary: `${host.name} 开始了游戏。${room.players[0].name} 先手。${
        initialMapGod
          ? ` 地图上出现了${getGodDefinition(initialMapGod.godKey)?.name ?? "神明"}，停在 ${getTile(initialMapGod.tileIndex).name}。`
          : ""
      }`,
    });

    const snapshot = await loadRoomSnapshot(tx, room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

async function performGameActionInternal(
  gameId: string,
  playerToken: string,
  action: GameActionRequest,
  options?: {
    allowManaged?: boolean;
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const ctx = await getGameContext(tx, gameId);
    const actor = findPlayerByToken(ctx.players, playerToken);
    assertCondition(actor, "玩家令牌无效。", 401);
    assertCondition(ctx.room.status === RoomStatus.IN_GAME, "当前没有进行中的对局。");
    assertCondition(ctx.game.phase !== GamePhase.GAME_OVER, "对局已经结束。");
    assertCondition(
      actor.id === ctx.game.currentPlayerId,
      "还没有轮到你行动。",
      409,
    );
    if (typeof action.clientVersion === "number") {
      assertCondition(
        action.clientVersion === ctx.game.version,
        "你的客户端状态已过期，请等待同步后重试。",
        409,
      );
    }

    const actorState = findPlayerState(ctx, actor.id);
    assertCondition(!actorState.isBankrupt, "你已经破产，无法继续行动。", 409);
    assertCondition(
      options?.allowManaged || actor.isBot || !actorState.isManaged,
      "你当前处于托管状态，请先取消托管。",
      409,
    );
    if (isAbducted(actorState)) {
      assertCondition(
        action.type === "endTurn",
        "被外星人抓走时只能等待返回。",
      );
    }

    const previousInflationIndex = getInflationIndex(ctx);
    let summary = "";

    switch (action.type) {
      case "declineReaction": {
        const reactionResult = resolveReactionDecline(ctx, actor, actorState);
        summary = reactionResult.summary;
        if (reactionResult.status === "bankrupt") {
          summary = maybeFinishGame(ctx)
            ? `${summary} 游戏结束。`
            : advanceTurn(ctx, summary);
        }
        break;
      }
      case "rollDice": {
        const inflationIndex = getInflationIndex(ctx);
        const passStartSalary = getEffectivePassStartSalary(ctx.settings.passStartSalary, inflationIndex);
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_ROLL,
          "当前不能掷骰。",
        );

        const remoteDiceUsed = action.itemKey === REMOTE_DICE_ITEM_KEY;
        const maxDiceCount = getVehicleMaxDiceCount(actorState);
        const diceCount = remoteDiceUsed
          ? maxDiceCount
          : resolveRequestedDiceCount(actorState, action.diceCount);
        if (remoteDiceUsed) {
          const remoteDiceItem = findInventoryItem(ctx, actor.id, REMOTE_DICE_ITEM_KEY);
          const remoteDiceDefinition = getItemDefinition(REMOTE_DICE_ITEM_KEY);
          assertCondition(remoteDiceDefinition, "遥控骰子配置不存在。", 500);
          assertCondition(remoteDiceItem.quantity > 0, `你没有 ${remoteDiceDefinition.name}。`);
          remoteDiceItem.quantity -= 1;
        }
        const diceValues = remoteDiceUsed
          ? (() => {
              try {
                return buildControlledDiceValues(
                  maxDiceCount,
                  action.controlledRollTotal ?? Number.NaN,
                );
              } catch (error) {
                throw new GameEngineError(
                  error instanceof Error ? error.message : "遥控骰子的点数无效。",
                );
              }
            })()
          : rollDiceValues(diceCount);
        const diceTotal = diceValues.reduce((sum, value) => sum + value, 0);
        const activeVehicle = getVehicleDefinition(actorState.activeVehicleKey);
        const vehicleLabel = activeVehicle?.name ?? null;

        ctx.game.lastDiceA = diceValues[0] ?? null;
        ctx.game.lastDiceB = diceValues[1] ?? null;
        ctx.game.lastDiceTotal = diceTotal;
        ctx.game.lastRollValues = JSON.stringify(diceValues);
        ctx.game.consecutiveDoubles = 0;
        ctx.game.rollAgainAvailable = false;

        const moveResult = moveBySteps(actorState, diceTotal, passStartSalary);
        summary = remoteDiceUsed
          ? vehicleLabel
            ? `${actor.name} 使用了遥控骰子，骑着${vehicleLabel}指定 ${diceTotal} 点，掷出 ${formatDiceRoll(diceValues)} = ${diceTotal}。 `
            : `${actor.name} 使用了遥控骰子，指定 ${diceTotal} 点，掷出 ${formatDiceRoll(diceValues)} = ${diceTotal}。 `
          : vehicleLabel
            ? `${actor.name} 骑着${vehicleLabel}掷出了 ${formatDiceRoll(diceValues)} = ${diceTotal}。 `
            : `${actor.name} 掷出了 ${formatDiceRoll(diceValues)} = ${diceTotal}。 `;
        const travelGodResult = resolveTravelGodEffects(
          ctx,
          actor,
          actorState,
          moveResult.traversedTileIndexes,
        );
        summary += travelGodResult.summary;
        if (travelGodResult.bankrupted) {
          summary = maybeFinishGame(ctx)
            ? `${summary} ${actor.name} 在土地公收取目的地时破产。`
            : advanceTurn(ctx, `${summary} ${actor.name} 在土地公收取目的地时破产。`);
          break;
        }
        summary += resolveLanding(ctx, actor, actorState, false);
        const expiredVehicle = consumeVehicleTurn(actorState);
        if (expiredVehicle) {
          summary += ` ${expiredVehicle.name}效果结束了。`;
        }
        break;
      }
      case "buyProperty": {
        assertCondition(canUseActiveEffects(actorState), "梦游中不能买地。");
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_PROPERTY_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可购买的地块。",
        );

        const tile = getTile(ctx.game.pendingTileIndex);
        assertCondition(isPurchasableTile(tile), "当前地块不可购买。", 500);
        const purchasePrice = getEffectiveTilePrice(tile, getInflationIndex(ctx));
        const purchaseHouseBonus =
          tile.type === "property" ? getPurchaseHouseBonusByGod(actorState.activeGodKey) : 0;

        const propertyState = findPropertyState(ctx, tile.index);
        assertCondition(!propertyState.ownerPlayerId, "该地块已经有主人了。");
        assertCondition(actorState.cash >= purchasePrice, "现金不足，无法买下该地块。");

        actorState.cash -= purchasePrice;
        propertyState.ownerPlayerId = actor.id;
        if (tile.type === "property" && purchaseHouseBonus > 0) {
          propertyState.houseCount = Math.min(4, propertyState.houseCount + purchaseHouseBonus);
        }
        ctx.game.pendingTileIndex = null;
        ctx.game.phase = ctx.game.rollAgainAvailable
          ? GamePhase.WAITING_FOR_ROLL
          : GamePhase.WAITING_FOR_TURN_END;
        ctx.game.rollAgainAvailable = false;

        summary =
          tile.type === "property" && purchaseHouseBonus > 0
            ? `${actor.name} 花费 ${purchasePrice} 买下了 ${tile.name}，在大福神加持下直接盖起了 1 层房屋。`
            : `${actor.name} 花费 ${purchasePrice} 买下了 ${tile.name}。`;
        break;
      }
      case "skipPurchase": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_PROPERTY_DECISION,
          "当前没有待处理的购买决定。",
        );

        const tile = getTile(ctx.game.pendingTileIndex ?? -1);
        const pendingPropertyState =
          ctx.game.pendingTileIndex !== null
            ? findPropertyState(ctx, ctx.game.pendingTileIndex)
            : null;
        summary =
          tile?.type === "property" &&
          pendingPropertyState?.ownerPlayerId === actor.id
            ? `${actor.name} 放弃在 ${tile.name} 上建房。`
            : `${actor.name} 放弃购买 ${tile?.name ?? "当前地块"}。`;
        ctx.game.pendingTileIndex = null;
        ctx.game.phase = ctx.game.rollAgainAvailable
          ? GamePhase.WAITING_FOR_ROLL
          : GamePhase.WAITING_FOR_TURN_END;
        ctx.game.rollAgainAvailable = false;
        break;
      }
      case "buyItem": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_SHOP_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可购买的商店道具。",
        );
        assertCondition(action.itemKey, "缺少要购买的道具标识。");
        summary = buyItemFromShop(ctx, actor, actorState, action.itemKey);
        break;
      }
      case "skipShop": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_SHOP_DECISION,
          "当前没有可跳过的商店停留。",
        );

        finishPendingStop(ctx);
        summary = `${actor.name} 离开了道具店，没有购买任何道具。`;
        break;
      }
      case "buyLotteryTicket": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_LOTTERY_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可购买的彩券。",
        );
        assertCondition(
          getTile(ctx.game.pendingTileIndex).type === "lottery",
          "当前所在位置不是彩票屋。",
          500,
        );
        assertCondition(
          typeof action.lotteryNumber === "number" && Number.isInteger(action.lotteryNumber),
          "缺少要购买的彩券号码。",
        );
        summary = buyLotteryTicket(ctx, actor, actorState, action.lotteryNumber);
        break;
      }
      case "skipLottery": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_LOTTERY_DECISION,
          "当前没有可跳过的彩票屋停留。",
        );
        finishPendingStop(ctx);
        summary = `${actor.name} 离开了彩票屋，这次没有下注。`;
        break;
      }
      case "manageBank": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_BANK_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可办理的银行业务。",
        );
        assertCondition(getTile(ctx.game.pendingTileIndex).type === "bank", "当前所在位置不是银行。", 500);
        assertCondition(action.bankChoice, "缺少要办理的银行业务。");
        summary = manageBank(ctx, actor, actorState, action.bankChoice);
        break;
      }
      case "skipBank": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_BANK_DECISION,
          "当前没有可跳过的银行停留。",
        );
        finishPendingStop(ctx);
        summary = `${actor.name} 离开了银行，没有办理任何业务。`;
        break;
      }
      case "castMagic": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_MAGIC_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可施放的魔法。",
        );
        assertCondition(getTile(ctx.game.pendingTileIndex).type === "magic", "当前所在位置不是魔法屋。", 500);
        assertCondition(action.magicKey, "缺少要施放的魔法。");
        summary = castMagic(ctx, actor, actorState, action.magicKey, action.targetPlayerId);
        break;
      }
      case "skipMagic": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_MAGIC_DECISION,
          "当前没有可跳过的魔法屋停留。",
        );
        finishPendingStop(ctx);
        summary = `${actor.name} 离开了魔法屋，没有施放任何法术。`;
        break;
      }
      case "playAmusement": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_AMUSEMENT_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前没有可游玩的项目。",
        );
        assertCondition(
          getTile(ctx.game.pendingTileIndex).type === "amusement",
          "当前所在位置不是游乐场。",
          500,
        );
        assertCondition(action.amusementChoice, "缺少要体验的游乐项目。");
        summary = playAmusementGame(ctx, actor, actorState, action.amusementChoice);
        break;
      }
      case "endTurn": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_TURN_END ||
            ctx.game.phase === GamePhase.WAITING_FOR_JAIL_CHOICE ||
            ctx.game.phase === GamePhase.WAITING_FOR_ABDUCTION_RETURN,
          "当前不能结束回合。",
        );
        summary =
          ctx.game.phase === GamePhase.WAITING_FOR_JAIL_CHOICE && actorState.inJailTurns > 0
            ? resolveJailTurnEnd(ctx, actor, actorState)
            : ctx.game.phase === GamePhase.WAITING_FOR_ABDUCTION_RETURN && isAbducted(actorState)
              ? resolveAbductionTurnEnd(ctx, actor, actorState)
            : ctx.game.phase === GamePhase.WAITING_FOR_TURN_END && isAbducted(actorState)
              ? advanceTurn(ctx, `${actor.name} 被外星人抓走后，本回合只能直接结束。`)
            : advanceTurn(ctx, `${actor.name} 结束了回合。`);
        break;
      }
      case "payJailFine": {
        throw new GameEngineError("监狱改为固定关押 3 天，不能支付保释金。");
        break;
      }
      case "useJailFreeCard": {
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_JAIL_CHOICE &&
            actorState.inJailTurns > 0,
          "当前不需要使用出狱卡。",
        );
        assertCondition(actorState.jailFreeCards > 0, "你没有出狱卡。");
        actorState.jailFreeCards -= 1;
        actorState.inJailTurns = 0;
        ctx.game.phase = GamePhase.WAITING_FOR_ROLL;
        summary = `${actor.name} 使用了一张出狱卡，提前离开了监狱。`;
        break;
      }
      case "buildHouse": {
        assertCondition(canUseActiveEffects(actorState), "梦游中不能建房。");
        assertCondition(
          ctx.game.phase === GamePhase.WAITING_FOR_PROPERTY_DECISION &&
            ctx.game.pendingTileIndex !== null,
          "当前不能建房。",
        );
        assertCondition(typeof action.tileIndex === "number", "缺少要建造的地块编号。");
        assertCondition(action.tileIndex === ctx.game.pendingTileIndex, "只能在当前停留的地产上建房。");

        const tile = getTile(action.tileIndex);
        assertCondition(tile.type === "property", "只有普通地产才能升级。");
        const propertyState = findPropertyState(ctx, tile.index);
        const baseHouseCost = getEffectiveHouseCost(tile, getInflationIndex(ctx));
        const houseCost = getBuildHouseCostByGod(actorState, baseHouseCost);
        const buildStep = getBuildHouseStepByGod(actorState);
        const activeGod = getEffectiveActiveGod(actorState);
        assertCondition(!isShuaishenGodKey(activeGod?.key), "衰神附身时，盖屋一定会失败。");

        assertCondition(propertyState.ownerPlayerId === actor.id, "这块地产不属于你。");
        assertCondition(!propertyState.mortgaged, "已抵押的地产不能升级。");
        assertCondition(actorState.cash >= houseCost, "现金不足，无法在这里建房。");

        const currentLevel = propertyState.hasHotel ? 5 : propertyState.houseCount;
        assertCondition(currentLevel < 5, "这块地产已经升到最高级。");

        actorState.cash -= houseCost;
        ctx.game.pendingTileIndex = null;
        ctx.game.phase = ctx.game.rollAgainAvailable
          ? GamePhase.WAITING_FOR_ROLL
          : GamePhase.WAITING_FOR_TURN_END;
        ctx.game.rollAgainAvailable = false;

        if (propertyState.houseCount === 4) {
          propertyState.houseCount = 0;
          propertyState.hasHotel = true;
          summary = `${actor.name} 将 ${tile.name} 升级成了酒店。`;
        } else {
          propertyState.houseCount = Math.min(4, propertyState.houseCount + buildStep);
          if (propertyState.houseCount >= 4 && currentLevel + buildStep >= 5) {
            propertyState.houseCount = 0;
            propertyState.hasHotel = true;
            summary = `${actor.name} 在 ${tile.name} 上一口气连升两层，直接升级成了酒店。`;
          } else if (buildStep > 1) {
            summary = `${actor.name} 在 ${tile.name} 上得到福神加持，一次建成了两栋房屋。`;
          } else {
            summary = `${actor.name} 在 ${tile.name} 上建造了一栋房屋。`;
          }
        }

        if (isCaishenGodKey(activeGod?.key)) {
          summary += ` ${activeGod?.name ?? "财神"}护体，本次建房免费。`;
        } else if (isFushenGodKey(activeGod?.key) && !propertyState.hasHotel) {
          summary += ` ${activeGod?.name ?? "福神"}护体，本次建房效果加倍。`;
        }

        break;
      }
      case "mortgage": {
        assertCondition(
          canUseActiveEffects(actorState) || ctx.game.phase === GamePhase.WAITING_FOR_RECOVERY,
          "梦游中不能管理地产。",
        );
        assertCondition(
          canManageMortgage(ctx.game.phase),
          "当前不能抵押地产。",
        );
        assertCondition(typeof action.tileIndex === "number", "缺少要抵押的地块编号。");

        const tile = getTile(action.tileIndex);
        assertCondition(isPurchasableTile(tile), "这块地不能抵押。");
        const propertyState = findPropertyState(ctx, tile.index);

        assertCondition(propertyState.ownerPlayerId === actor.id, "这块地产不属于你。");
        assertCondition(!propertyState.mortgaged, "这块地产已经被抵押了。");

        propertyState.mortgaged = true;
        const mortgageValue = getEffectiveMortgageValue(tile, getInflationIndex(ctx));
        actorState.cash += mortgageValue;
        summary = `${actor.name} 抵押了 ${tile.name}，按空地价获得 ${mortgageValue}。`;
        summary += resolveRecoveryAfterPropertyAction(ctx, actor, actorState);
        break;
      }
      case "unmortgage": {
        assertCondition(
          canUseActiveEffects(actorState) || ctx.game.phase === GamePhase.WAITING_FOR_RECOVERY,
          "梦游中不能管理地产。",
        );
        assertCondition(
          canManageMortgage(ctx.game.phase),
          "当前不能赎回地产。",
        );
        assertCondition(typeof action.tileIndex === "number", "缺少要赎回的地块编号。");

        const tile = getTile(action.tileIndex);
        assertCondition(isPurchasableTile(tile), "这块地不能赎回。");
        const propertyState = findPropertyState(ctx, tile.index);
        assertCondition(propertyState.ownerPlayerId === actor.id, "这块地产不属于你。");
        assertCondition(propertyState.mortgaged, "这块地产当前没有被抵押。");

        const unmortgageCost = getEffectiveUnmortgageCost(tile, getInflationIndex(ctx));
        assertCondition(actorState.cash >= unmortgageCost, "现金不足，无法赎回该地产。");

        propertyState.mortgaged = false;
        actorState.cash -= unmortgageCost;
        summary = `${actor.name} 花费 ${unmortgageCost} 赎回了 ${tile.name}（含空地价 10% 服务费）。`;
        summary += resolveRecoveryAfterPropertyAction(ctx, actor, actorState);
        break;
      }
      case "buyStock": {
        assertCondition(canUseActiveEffects(actorState), "梦游中不能交易股票。");
        assertStockMarketAvailable(ctx);
        assertCondition(
          canManageProperties(ctx.game.phase),
          "当前不能交易股票。",
        );
        assertCondition(action.stockSymbol, "缺少股票代码。");
        const shares = readShareAmount(action);
        const stockState = findStockState(ctx, action.stockSymbol);
        const holding = findStockHolding(ctx, actor.id, action.stockSymbol);
        const totalCost = stockState.currentPrice * shares;

        assertCondition(
          stockState.availableShares >= shares,
          "市场上剩余股数不足。",
        );
        assertCondition(actorState.cash >= totalCost, "现金不足，无法买入这些股票。");

        const totalExistingCost = holding.averageCost * holding.shares;
        holding.shares += shares;
        holding.averageCost = Math.floor((totalExistingCost + totalCost) / holding.shares);
        stockState.availableShares -= shares;
        actorState.cash -= totalCost;

        summary = `${actor.name} 花费 ${totalCost} 买入了 ${shares} 股 ${stockState.symbol}。`;
        break;
      }
      case "sellStock": {
        assertCondition(canUseActiveEffects(actorState), "梦游中不能交易股票。");
        assertStockMarketAvailable(ctx);
        assertCondition(
          canManageProperties(ctx.game.phase),
          "当前不能交易股票。",
        );
        assertCondition(action.stockSymbol, "缺少股票代码。");
        const shares = readShareAmount(action);
        const stockState = findStockState(ctx, action.stockSymbol);
        const holding = findStockHolding(ctx, actor.id, action.stockSymbol);
        assertCondition(holding.shares >= shares, "你没有这么多可卖出的股票。");

        const proceeds = stockState.currentPrice * shares;
        holding.shares -= shares;
        if (holding.shares === 0) {
          holding.averageCost = 0;
        }
        stockState.availableShares += shares;
        actorState.cash += proceeds;

        summary = `${actor.name} 卖出了 ${shares} 股 ${stockState.symbol}，获得 ${proceeds}。`;
        break;
      }
      case "useItem": {
        assertCondition(action.itemKey, "缺少道具标识。");
        if (ctx.game.phase === GamePhase.WAITING_FOR_ITEM_REACTION) {
          summary = resolveReactionUseItem(ctx, actor, actorState, action.itemKey).summary;
          break;
        }
        assertCondition(canUseActiveEffects(actorState), "梦游中不能使用道具。");
        assertCondition(
          canManageProperties(ctx.game.phase),
          "当前不能使用道具。",
        );
        summary = useInventoryItem(ctx, actor, actorState, action.itemKey, action.targetPlayerId);
        break;
      }
      case "declareBankruptcy": {
        assertCondition(
          ctx.game.phase !== GamePhase.WAITING_FOR_ITEM_REACTION,
          "请先处理当前的道具响应。",
        );
        const recovery = getRecoveryContext(ctx.game);
        bankruptPlayer(ctx, actor.id, recovery ? getRecoveryCreditorPlayerId(recovery) : null);
        clearRecoveryContext(ctx.game);
        summary = maybeFinishGame(ctx)
          ? `${actor.name} 宣告破产。游戏结束。`
          : advanceTurn(ctx, `${actor.name} 宣告破产并退出了对局。`);
        break;
      }
      default:
        throw new GameEngineError("未知操作。");
    }

    const nextInflationState = getInflationState(ctx);
    if (nextInflationState.index !== previousInflationIndex) {
      summary +=
        nextInflationState.index > previousInflationIndex
          ? ` 由于全场资产膨胀，物价指数升至 ${nextInflationState.index}。`
          : ` 全场资产回落，物价指数降至 ${nextInflationState.index}。`;
    }

    ctx.game.chanceDeck = serializeDeck(parseDeck(ctx.game.chanceDeck));
    ctx.game.communityDeck = serializeDeck(parseDeck(ctx.game.communityDeck));
    ctx.game.lotteryTickets = serializeLotteryTickets(getLotteryTickets(ctx.game));
    ctx.game.mapGodSpawns = serializeMapGodSpawns(getMapGodSpawns(ctx.game));
    ctx.game.logSummary = summary;

    await persistGameContext(tx, ctx);

    const eventInfo = await appendEvent(tx, {
      roomId: ctx.room.id,
      roomCode: ctx.room.code,
      gameId: ctx.game.id,
      actorPlayerId: actor.id,
      eventType: action.type,
      summary,
      payload: action,
    });

    const snapshot = await loadRoomSnapshot(tx, ctx.room.code, playerToken);
    assertCondition(snapshot, "房间快照加载失败。", 500);

    return {
      roomCode: ctx.room.code,
      snapshot,
      eventInfo,
    };
  });

  publishEvent(
    result.roomCode,
    result.eventInfo.event.sequence,
    result.eventInfo.event.eventType,
    result.eventInfo.event.summary,
  );

  return result.snapshot;
}

export async function performGameAction(
  gameId: string,
  playerToken: string,
  action: GameActionRequest,
) {
  return performGameActionInternal(gameId, playerToken, action);
}

export async function performAutomatedGameAction(
  gameId: string,
  playerToken: string,
  action: GameActionRequest,
) {
  return performGameActionInternal(gameId, playerToken, action, {
    allowManaged: true,
  });
}



