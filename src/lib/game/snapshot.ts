import type { Prisma, PrismaClient } from "@prisma/client";

import { BOARD_TILES, getTile, isPurchasableTile } from "@/lib/game/board";
import {
  getRoundDateKey,
  getRoundNumberForTurn,
  resolveCalendarStartDate,
} from "@/lib/game/calendar";
import {
  CHARACTER_PRESETS,
  getCharacterPreset,
  type CharacterPreset,
} from "@/lib/game/characters";
import {
  calculateInflationState,
  calculatePlayerTotalAssets,
  calculatePropertyAssetValue,
  getEffectiveLotteryTicketPrice,
} from "@/lib/game/economy";
import { getVehicleDefinition } from "@/lib/game/items";
import { getLotteryOption, parseLotteryTickets } from "@/lib/game/lottery";
import { parseMapGodSpawns, toMapGodView } from "@/lib/game/map-gods";
import { parseReactionContext } from "@/lib/game/reaction";
import { parseRecoveryContext } from "@/lib/game/recovery";
import { getGodDefinition } from "@/lib/game/gods";
import { getStockDefinition } from "@/lib/game/stocks";
import type {
  InflationStateView,
  GodStatusView,
  ItemReactionStateView,
  InventoryItemView,
  LobbyPlayerView,
  LotteryStateView,
  ManagedReason,
  MapGodView,
  PlayerGameView,
  RecoveryStateView,
  RoomSnapshotView,
  StockHoldingView,
  StockView,
  VehicleStatusView,
} from "@/lib/game/types";
import { normalizeRoomCode } from "@/lib/session/player-session";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function fallbackCharacter(): CharacterPreset {
  return CHARACTER_PRESETS[0];
}

function mapLobbyPlayer(player: {
  id: string;
  name: string;
  seatOrder: number;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  isConnected: boolean;
  lastSeenAt: Date | null;
  characterId: string;
  isManaged?: boolean;
  managedReason?: string | null;
}): LobbyPlayerView {
  return {
    id: player.id,
    name: player.name,
    seatOrder: player.seatOrder,
    isHost: player.isHost,
    isReady: player.isReady,
    isBot: player.isBot,
    isConnected: player.isBot ? true : player.isConnected,
    lastSeenAt: player.lastSeenAt?.toISOString() ?? null,
    isManaged: player.isManaged ?? false,
    managedReason: (player.managedReason as ManagedReason | null | undefined) ?? null,
    character: getCharacterPreset(player.characterId) ?? fallbackCharacter(),
  };
}

function parseLastRollValues(serialized: string | null | undefined) {
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value))
      .filter((value) => value >= 1 && value <= 6);
  } catch {
    return [];
  }
}

function translateLegacyNames(value: string) {
  return [
    ["Start", "起点"],
    ["Fate", "命运"],
    ["Chance", "机会"],
    ["Item Shop", "道具店"],
    ["Lottery House", "彩票屋"],
    ["Bank", "银行"],
    ["Magic House", "魔法屋"],
    ["News House", "新闻屋"],
    ["Free Card Point", "免费卡点"],
    ["Amusement Park", "游乐场"],
    ["Jail", "监狱"],
    ["Free Parking", "免费停车"],
    ["Go To Jail", "前往监狱"],
    ["Income Tax", "所得税"],
    ["Luxury Tax", "奢侈税"],
    ["East Rail", "东方铁路"],
    ["North Rail", "北方铁路"],
    ["Power Company", "电力公司"],
    ["Water Works", "自来水厂"],
    ["Taipei", "台北"],
    ["Kaohsiung", "高雄"],
    ["Shanghai", "上海"],
    ["Hong Kong", "香港"],
    ["Tokyo", "东京"],
    ["Osaka", "大阪"],
    ["Seoul", "首尔"],
    ["Busan", "釜山"],
    ["Paris", "巴黎"],
    ["London", "伦敦"],
    ["Los Angeles", "洛杉矶"],
    ["New York", "纽约"],
    ["JunFu Card", "均富卡"],
    ["Trap Card", "陷害卡"],
    ["Dividend Card", "分红卡"],
  ].reduce((text, [from, to]) => text.replaceAll(from, to), value);
}

function localizeLegacyEventSummary(summary: string) {
  let text = translateLegacyNames(summary);

  text = text
    .replace(/([^。.!]+) created the room\./g, "$1 创建了房间。")
    .replace(/([^。.!]+) joined the room\./g, "$1 加入了房间。")
    .replace(/([^。.!]+) changed characters\./g, "$1 切换了角色。")
    .replace(/([^。.!]+) is ready\./g, "$1 已准备。")
    .replace(/([^。.!]+) is no longer ready\./g, "$1 取消了准备。")
    .replace(/([^。.!]+) updated the room rules\./g, "$1 更新了房间规则。")
    .replace(/([^。.!]+) started the game\. ([^。.!]+) goes first\./g, "$1 开始了游戏。$2 先手。")
    .replace(/([^。.!]+) ended the turn\./g, "$1 结束了回合。")
    .replace(/Next up: ([^。.!]+)\./g, "下一位：$1。")
    .replace(/Market held steady\./g, "股市保持平稳。")
    .replace(/Market: /g, "股市：")
    .replace(/rolled doubles (\d+)\/(\d+) and left jail\./g, "掷出双骰 $1/$2，成功出狱。")
    .replace(
      /paid (\d+) to leave jail after the third failed attempt\./g,
      "第三次仍未掷出双骰，支付 $1 后离开监狱。",
    )
    .replace(/rolled (\d+)\/(\d+) in jail but is still locked up\./g, "在监狱中掷出 $1/$2，暂时还不能出狱。")
    .replace(/rolled three doubles in a row and was sent to jail\./g, "连续三次掷出双骰，被直接送进监狱。")
    .replace(/rolled (\d+) \+ (\d+) = (\d+)\./g, "掷出了 $1 + $2 = $3。")
    .replace(/landed on Start\./g, "停在了起点。")
    .replace(/arrived at 监狱\./g, "来到了监狱。")
    .replace(/is resting on 免费停车\./g, "在免费停车休息。")
    .replace(/collected (\d+) from 免费停车\./g, "从免费停车奖金池领取了 $1。")
    .replace(/was sent to jail\./g, "被直接送进监狱。")
    .replace(/went bankrupt while paying tax\./g, "缴税时破产了。")
    .replace(/paid (\d+) in tax\./g, "缴纳了 $1 的税金。")
    .replace(/reached the item shop and may buy a support card\./g, "来到了道具店，可以购买一张道具卡。")
    .replace(/reached the lottery house and may choose a color number ticket\./g, "来到了彩票屋，可以挑选一张彩色数字奖券。")
    .replace(/reached the bank and may manage savings or loans\./g, "来到了银行，可以办理存款和贷款。")
    .replace(/reached the magic house and may invite a god or cast a curse\./g, "来到了魔法屋，可以随机请好神上身，或给别人挂上坏神。")
    .replace(/passed a free card point and received a free card\./g, "经过免费卡点，顺手拿到了一张免费卡。")
    .replace(/entered the amusement park and may pick a mini game\./g, "来到了游乐场，可以挑一个小游戏摊位。")
    .replace(/drew \[([^\]]+)\]\./g, "抽到了【$1】。")
    .replace(/Collected (\d+) from the bank\./g, "从银行领取了 $1。")
    .replace(/went bankrupt paying a card penalty\./g, "因支付卡片罚金而破产。")
    .replace(/Paid (\d+) to the bank\./g, "向银行支付了 $1。")
    .replace(/Collected up to (\d+) from other players\./g, "从其他玩家处共收取了 $1。")
    .replace(/went bankrupt after drawing a card\./g, "抽卡结算后破产了。")
    .replace(/Move to ([^。.!]+)\./g, "前往 $1。")
    .replace(/Move forward (\d+) spaces\./g, "前进 $1 格。")
    .replace(/Move back (\d+) spaces\./g, "后退 $1 格。")
    .replace(/Go directly to jail\./g, "直接前往监狱。")
    .replace(/Gained a jail-free card\./g, "获得了一张出狱卡。")
    .replace(/landed on ([^。.!]+) and may buy it for (\d+)\./g, "停在 $1，可以花费 $2 买下它。")
    .replace(/landed on owned ([^。.!]+)\./g, "来到了 $1。")
    .replace(/could not pay rent on ([^。.!]+) and went bankrupt\./g, "无法支付 $1 的租金，已经破产。")
    .replace(/paid ([^。.!]+) (\d+) in rent\./g, "向 $1 支付了 $2 的租金。")
    .replace(/bought ([^。.!]+) for (\d+)\./g, "花费 $2 买下了 $1。")
    .replace(/skipped buying ([^。.!]+)\./g, "放弃购买 $1。")
    .replace(/left the item shop without buying anything\./g, "离开了道具店，没有购买任何道具。")
    .replace(/left the lottery house without buying a ticket\./g, "离开了彩票屋，这次没有下注。")
    .replace(/left the bank without making any changes\./g, "离开了银行，没有办理任何业务。")
    .replace(/left the magic house without casting anything\./g, "离开了魔法屋，没有施放任何法术。")
    .replace(/paid (\d+) in bail and can roll again\./g, "支付了 $1 的保释金，可以继续掷骰。")
    .replace(/used a jail-free card\./g, "使用了一张出狱卡。")
    .replace(/upgraded ([^。.!]+) to a hotel\./g, "将 $1 升级成了酒店。")
    .replace(/built a house on ([^。.!]+)\./g, "在 $1 上建造了一栋房屋。")
    .replace(/mortgaged ([^。.!]+) for (\d+)\./g, "抵押了 $1，获得 $2。")
    .replace(/paid (\d+) to unmortgage ([^。.!]+)\./g, "花费 $1 赎回了 $2。")
    .replace(/bought (\d+) ([A-Z]+) shares for (\d+)\./g, "花费 $3 买入了 $1 股 $2。")
    .replace(/sold (\d+) ([A-Z]+) shares for (\d+)\./g, "卖出了 $1 股 $2，获得 $3。")
    .replace(/used ([^。.!]+) and collected 180 from the bank\./g, "使用了 $1，从银行领取了 180 元。")
    .replace(/used ([^。.!]+) and equalized everyone'?s cash\./g, "使用了 $1，所有玩家的现金被重新平均分配。")
    .replace(/used ([^。.!]+) on ([^。.!]+)\./g, "对 $2 使用了 $1。")
    .replace(/declared bankruptcy\. Game over\./g, "宣告破产。游戏结束。")
    .replace(/declared bankruptcy and left the game\./g, "宣告破产并退出了对局。");

  return text;
}

export async function loadRoomSnapshot(
  db: PrismaLike,
  roomCode: string,
  playerToken?: string | null,
): Promise<RoomSnapshotView | null> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const room = await db.room.findUnique({
    where: { code: normalizedRoomCode },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
      game: {
        include: {
          playerStates: {
            include: {
              player: true,
            },
          },
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

  if (!room || !room.settings) {
    return null;
  }

  const events = await db.gameEvent.findMany({
    where: {
      roomId: room.id,
    },
    orderBy: {
      sequence: "desc",
    },
    take: 20,
  });

  let lobbyPlayers = room.players.map(mapLobbyPlayer);
  const currentLobbyPlayer = room.players.find((player) => player.token === playerToken);

  let currentPlayer: RoomSnapshotView["currentPlayer"] =
    currentLobbyPlayer ? mapLobbyPlayer(currentLobbyPlayer) : null;

  let game = null;

  if (room.game) {
    const playerStateMap = new Map(
      room.game.playerStates.map((state) => [state.playerId, state]),
    );
    lobbyPlayers = room.players.map((player) =>
      mapLobbyPlayer({
        ...player,
        isManaged: playerStateMap.get(player.id)?.isManaged ?? false,
        managedReason: playerStateMap.get(player.id)?.managedReason ?? null,
      }),
    );
    const propertyStateMap = new Map(
      room.game.propertyStates.map((property) => [property.tileIndex, property]),
    );
    const propertyStates = BOARD_TILES.filter(isPurchasableTile).map((tile) => {
      const property = propertyStateMap.get(tile.index);
      return {
        tileIndex: tile.index,
        ownerPlayerId: property?.ownerPlayerId ?? null,
        houseCount: property?.houseCount ?? 0,
        hasHotel: property?.hasHotel ?? false,
        mortgaged: property?.mortgaged ?? false,
      };
    });

    const stockViews: StockView[] = room.game.stockStates.map((stock) => ({
      symbol: stock.symbol,
      name: getStockDefinition(stock.symbol)?.name ?? stock.name,
      currentPrice: stock.currentPrice,
      previousPrice: stock.previousPrice,
      availableShares: stock.availableShares,
      volatility: stock.volatility,
      change: stock.currentPrice - stock.previousPrice,
    }));

    const stockHoldings: StockHoldingView[] = room.game.stockHoldings.map((holding) => {
      const stock = room.game?.stockStates.find(
        (stockState) => stockState.id === holding.stockStateId,
      );
      const marketValue = (stock?.currentPrice ?? 0) * holding.shares;
      const unrealizedProfit =
        holding.shares > 0
          ? marketValue - holding.averageCost * holding.shares
          : 0;

      return {
        playerId: holding.playerId,
        stockSymbol: stock?.symbol ?? "UNK",
        shares: holding.shares,
        averageCost: holding.averageCost,
        marketValue,
        unrealizedProfit,
      };
    });

    const inventoryItems: InventoryItemView[] = room.game.inventoryItems.map((item) => ({
      playerId: item.playerId,
      itemKey: item.itemKey,
      quantity: item.quantity,
    }));

    const lotteryTickets = parseLotteryTickets(room.game.lotteryTickets).map((ticket) => {
      const option = getLotteryOption(ticket.number);
      return {
        playerId: ticket.playerId,
        number: ticket.number,
        label: option?.label ?? `${ticket.number} 号`,
        shortLabel: option?.shortLabel ?? `${ticket.number}号`,
        colorKey: option?.colorKey ?? "slate",
        colorHex: option?.colorHex ?? "#94a3b8",
      };
    });

    const stockAssetValueByPlayerId = new Map<string, number>();
    stockHoldings.forEach((holding) => {
      stockAssetValueByPlayerId.set(
        holding.playerId,
        (stockAssetValueByPlayerId.get(holding.playerId) ?? 0) + holding.marketValue,
      );
    });

    const basePropertyAssetValueByPlayerId = new Map<string, number>();
    room.game.propertyStates.forEach((property) => {
      if (!property.ownerPlayerId) {
        return;
      }

      basePropertyAssetValueByPlayerId.set(
        property.ownerPlayerId,
        (basePropertyAssetValueByPlayerId.get(property.ownerPlayerId) ?? 0) +
          calculatePropertyAssetValue(
            property.tileIndex,
            property.houseCount,
            property.hasHotel,
            1,
          ),
      );
    });

    const inflationBaseTotal = room.game.playerStates.reduce((sum, state) => {
      const basePropertyAssetValue = basePropertyAssetValueByPlayerId.get(state.playerId) ?? 0;
      const stockAssetValue = stockAssetValueByPlayerId.get(state.playerId) ?? 0;
      return (
        sum +
        calculatePlayerTotalAssets(
          state.cash,
          state.bankSavings,
          basePropertyAssetValue,
          stockAssetValue,
          state.bankDebt,
        )
      );
    }, 0);
    const inflation: InflationStateView = calculateInflationState(
      inflationBaseTotal,
      room.settings.startingCash,
      room.players.length,
    );

    const lottery: LotteryStateView = {
      jackpot: room.game.lotteryJackpot,
      ticketPrice: getEffectiveLotteryTicketPrice(inflation.index),
      drawAtTurn: room.game.lotteryDrawAtTurn,
      turnsUntilDraw: Math.max(1, room.game.lotteryDrawAtTurn - room.game.turnNumber),
      tickets: lotteryTickets,
    };
    const mapGods: MapGodView[] = parseMapGodSpawns(room.game.mapGodSpawns)
      .map((spawn) => toMapGodView(spawn))
      .filter((spawn): spawn is MapGodView => Boolean(spawn));

    const playerViews: PlayerGameView[] = room.game.playerStates
      .slice()
      .sort((left, right) => left.player.seatOrder - right.player.seatOrder)
      .map((state) => {
        const ownedTileIndexes = room.game?.propertyStates
          .filter((property) => property.ownerPlayerId === state.playerId)
          .map((property) => property.tileIndex) ?? [];

        const propertyAssetValue =
          room.game?.propertyStates
            .filter((property) => property.ownerPlayerId === state.playerId)
            .reduce(
              (sum, property) =>
                sum +
                calculatePropertyAssetValue(
                  property.tileIndex,
                  property.houseCount,
                  property.hasHotel,
                  inflation.index,
                ),
              0,
            ) ?? 0;

        const stockAssetValue = stockAssetValueByPlayerId.get(state.playerId) ?? 0;
        const activeGodDefinition =
          state.godTurns > 0 ? getGodDefinition(state.activeGodKey) : null;
        const activeGod: GodStatusView | null = activeGodDefinition
          ? {
              key: activeGodDefinition.key,
              name: activeGodDefinition.name,
              description: activeGodDefinition.description,
              colorHex: activeGodDefinition.colorHex,
              turnsRemaining: state.godTurns,
            }
          : null;
        const activeVehicleDefinition =
          state.vehicleTurns > 0 ? getVehicleDefinition(state.activeVehicleKey) : null;
        const activeVehicle: VehicleStatusView | null = activeVehicleDefinition
          ? {
              key: activeVehicleDefinition.key,
              name: activeVehicleDefinition.name,
              description: activeVehicleDefinition.description,
              diceCount: activeVehicleDefinition.diceCount,
              turnsRemaining: state.vehicleTurns,
            }
          : null;

        return {
          id: state.player.id,
          name: state.player.name,
          seatOrder: state.player.seatOrder,
          isHost: state.player.isHost,
          isReady: state.player.isReady,
          isBot: state.player.isBot,
          isConnected: state.player.isBot ? true : state.player.isConnected,
          lastSeenAt: state.player.lastSeenAt?.toISOString() ?? null,
          isManaged: state.isManaged,
          managedReason: (state.managedReason as ManagedReason | null) ?? null,
          character: getCharacterPreset(state.player.characterId) ?? fallbackCharacter(),
          cash: state.cash,
          position: state.position,
          lapsCompleted: state.lapsCompleted,
          inJailTurns: state.inJailTurns,
          abductedTurns: state.abductedTurns,
          sleepwalkingTurns: state.sleepwalkingTurns,
          jailFreeCards: state.jailFreeCards,
          bankSavings: state.bankSavings,
          bankDebt: state.bankDebt,
          activeGod,
          activeVehicle,
          isBankrupt: state.isBankrupt,
          ownedTileIndexes,
          propertyAssetValue,
          stockAssetValue,
          totalAssets: calculatePlayerTotalAssets(
            state.cash,
            state.bankSavings,
            propertyAssetValue,
            stockAssetValue,
            state.bankDebt,
          ),
        };
      });

    const currentGamePlayer = playerToken
      ? playerViews.find(
          (player) =>
            room.players.find((roomPlayer) => roomPlayer.id === player.id)?.token ===
            playerToken,
        ) ?? null
      : null;

    currentPlayer = currentGamePlayer ?? currentPlayer;

    const roundParticipants = room.players.map((player) => ({
      id: player.id,
      seatOrder: player.seatOrder,
      bankruptAtTurn:
        room.game?.playerStates.find((state) => state.playerId === player.id)?.bankruptAtTurn ??
        null,
    }));
    const roundNumber = getRoundNumberForTurn(room.game.turnNumber, roundParticipants);
    const recoveryContext = parseRecoveryContext(room.game.recoveryContext);
    const recovery: RecoveryStateView | null = recoveryContext
      ? {
          amountDue: recoveryContext.amountDue,
          reason: recoveryContext.reason,
          creditorPlayerId:
            recoveryContext.recipientKind === "player"
              ? recoveryContext.recipientPlayerId
              : null,
          creditorName:
            recoveryContext.recipientKind === "player"
              ? room.players.find(
                  (player) => player.id === recoveryContext.recipientPlayerId,
                )?.name ?? null
              : null,
        }
      : null;
    const reactionContext = parseReactionContext(room.game.reactionContext);
    const reaction: ItemReactionStateView | null = reactionContext
      ? {
          kind: reactionContext.kind,
          reactingPlayerId: reactionContext.reactingPlayerId,
          turnPlayerId: reactionContext.turnPlayerId,
          sourcePlayerId:
            reactionContext.kind === "payment" ? null : reactionContext.sourcePlayerId,
          sourcePlayerName:
            reactionContext.kind === "payment" ? null : reactionContext.sourcePlayerName,
          sourceItemName:
            reactionContext.kind === "payment"
              ? "免费卡"
              : reactionContext.itemName,
          amount:
            reactionContext.kind === "payment"
              ? reactionContext.recovery.amountDue
              : reactionContext.kind === "taxAudit"
                ? reactionContext.amount
                : null,
          reason:
            reactionContext.kind === "payment"
              ? reactionContext.recovery.reason
              : reactionContext.kind === "taxAudit"
                ? "查税"
                : null,
          debuffType: reactionContext.kind === "debuff" ? reactionContext.debuffType : null,
          itemKeys: reactionContext.itemKeys,
        }
      : null;

    game = {
      id: room.game.id,
      phase: room.game.phase,
      version: room.game.version,
      turnNumber: room.game.turnNumber,
      roundNumber,
      currentDate: getRoundDateKey(
        resolveCalendarStartDate(room.game.calendarStartDate, room.game.createdAt),
        roundNumber,
      ),
      currentPlayerId: room.game.currentPlayerId,
      winnerPlayerId: room.game.winnerPlayerId,
      inflation,
      recovery,
      reaction,
      lastRoll: (() => {
        const values = parseLastRollValues(room.game.lastRollValues);
        if (values.length > 0 && room.game.lastDiceTotal) {
          return {
            values,
            total: room.game.lastDiceTotal,
          };
        }

        if (room.game.lastDiceA && room.game.lastDiceTotal) {
          const legacyValues =
            room.game.lastDiceB !== null && room.game.lastDiceB !== undefined
              ? [room.game.lastDiceA, room.game.lastDiceB]
              : [room.game.lastDiceA];
          return {
            values: legacyValues,
            total: room.game.lastDiceTotal,
          };
        }

        return null;
      })(),
      pendingTile:
        room.game.pendingTileIndex !== null && room.game.pendingTileIndex !== undefined
          ? getTile(room.game.pendingTileIndex)
          : null,
      rollAgainAvailable: room.game.rollAgainAvailable,
      board: BOARD_TILES,
      properties: propertyStates,
      stocks: stockViews,
      stockHoldings,
      inventoryItems,
      lottery,
      mapGods,
      players: playerViews,
    };
  }

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    settings: {
      startingCash: room.settings.startingCash,
      passStartSalary: room.settings.passStartSalary,
      maxPlayers: room.settings.maxPlayers,
      jailFine: room.settings.jailFine,
      parkingJackpotEnabled: room.settings.parkingJackpotEnabled,
      stocksEnabled: room.settings.stocksEnabled,
      parkingJackpot: room.settings.parkingJackpot,
      turnSeconds: room.settings.turnSeconds,
    },
    availableCharacters: CHARACTER_PRESETS,
    players: lobbyPlayers,
    currentPlayer,
    game,
    recentEvents: events
      .reverse()
      .map((event) => ({
        id: event.id,
        sequence: event.sequence,
        eventType: event.eventType,
        summary: localizeLegacyEventSummary(event.summary),
        createdAt: event.createdAt.toISOString(),
        actorPlayerId: event.actorPlayerId,
      })),
  };
}
