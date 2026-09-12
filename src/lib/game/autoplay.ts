import { GamePhase, RoomStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  getEffectiveHouseCost,
  getEffectiveItemPrice,
  getEffectiveMortgageValue,
  getEffectivePassStartSalary,
  getEffectiveTilePrice,
} from "@/lib/game/economy";
import {
  enableManagedModeByTimeout,
  performAutomatedGameAction,
} from "@/lib/game/engine";
import {
  DISMISS_GOD_ITEM_KEY,
  DREAMWALK_ITEM_KEY,
  FREE_PASS_ITEM_KEY,
  INNOCENCE_ITEM_KEY,
  REBOUND_ITEM_KEY,
  SUMMON_MAP_GOD_ITEM_KEY,
  TAX_AUDIT_ITEM_KEY,
  getItemDefinition,
  type ItemDefinition,
} from "@/lib/game/items";
import { isCaishenGodKey, isCurseGodKey, isFushenGodKey, isShuaishenGodKey } from "@/lib/game/gods";
import { getShopOfferItems } from "@/lib/game/shop";
import { loadRoomSnapshot } from "@/lib/game/snapshot";
import type { GameActionRequest, PlayerGameView, RoomSnapshotView } from "@/lib/game/types";
import { normalizeRoomCode } from "@/lib/session/player-session";

const AUTOPLAY_DELAY_RANGES_MS: Partial<Record<GameActionRequest["type"], readonly [number, number]>> = {
  rollDice: [1600, 2400],
  payJailFine: [1300, 1900],
  useJailFreeCard: [1300, 1900],
  declineReaction: [900, 1500],
  buyProperty: [1400, 2200],
  buyItem: [1250, 1950],
  buildHouse: [1500, 2300],
  mortgage: [900, 1500],
  skipPurchase: [1100, 1700],
  skipShop: [1000, 1500],
  skipLottery: [1000, 1500],
  skipBank: [1000, 1500],
  castMagic: [1300, 2100],
  skipMagic: [1000, 1500],
  playAmusement: [1400, 2200],
  useItem: [1350, 2150],
  endTurn: [1200, 1800],
};

const DEFAULT_AUTOPLAY_DELAY_RANGE_MS: readonly [number, number] = [1100, 1700];
const TURN_START_DELAY_RANGE_MS: readonly [number, number] = [1000, 1800];
const DECISION_DELAY_RANGES_MS: Partial<Record<GameActionRequest["type"], readonly [number, number]>> = {
  payJailFine: [500, 900],
  useJailFreeCard: [500, 900],
  declineReaction: [420, 760],
  buyProperty: [650, 1200],
  buyItem: [550, 980],
  buildHouse: [700, 1300],
  mortgage: [450, 800],
  skipPurchase: [450, 850],
  castMagic: [550, 950],
  playAmusement: [450, 850],
  useItem: [600, 1050],
};
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningRooms = new Set<string>();
const pendingRooms = new Set<string>();
const roomTurnMemory = new Map<string, { turnNumber: number; playerId: string }>();

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomBetween(min: number, max: number) {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function getAutoplayDelayMs(
  action: GameActionRequest,
  context: Pick<AutomationContext, "currentPlayerIsBot" | "currentPlayer">,
) {
  const [baseMin, baseMax] =
    AUTOPLAY_DELAY_RANGES_MS[action.type] ?? DEFAULT_AUTOPLAY_DELAY_RANGE_MS;

  let min = baseMin;
  let max = baseMax;

  if (context.currentPlayerIsBot) {
    min += 120;
    max += 260;
  }

  if (context.currentPlayer.activeVehicle) {
    min += 80;
    max += 160;
  }

  return randomBetween(min, max);
}

function isFreshAutoplayTurn(
  roomCode: string,
  context: Pick<AutomationContext, "currentPlayerId" | "snapshot">,
) {
  const turnNumber = context.snapshot.game?.turnNumber ?? 0;
  const previousTurn = roomTurnMemory.get(roomCode);
  roomTurnMemory.set(roomCode, {
    turnNumber,
    playerId: context.currentPlayerId,
  });

  return (
    !previousTurn ||
    previousTurn.turnNumber !== turnNumber ||
    previousTurn.playerId !== context.currentPlayerId
  );
}

function getAutoplayThinkDelayMs(
  action: GameActionRequest,
  context: Pick<AutomationContext, "currentPlayer" | "currentPlayerId" | "currentPlayerIsBot" | "snapshot" | "roomCode">,
) {
  let delayMs = getAutoplayDelayMs(action, context);

  if (isFreshAutoplayTurn(context.roomCode, context)) {
    delayMs += randomBetween(...TURN_START_DELAY_RANGE_MS);
  }

  const decisionDelayRange = DECISION_DELAY_RANGES_MS[action.type];
  if (decisionDelayRange) {
    delayMs += randomBetween(...decisionDelayRange);
  }

  return delayMs;
}

function clearRoomTimer(roomCode: string) {
  const existingTimer = roomTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
    roomTimers.delete(roomCode);
  }
}

function getAutoplayReserveCash(snapshot: RoomSnapshotView) {
  const inflationIndex = snapshot.game?.inflation.index ?? 1;
  const effectiveSalary = getEffectivePassStartSalary(snapshot.settings.passStartSalary, inflationIndex);
  return Math.max(250 * inflationIndex, Math.min(900 * inflationIndex, effectiveSalary * 2));
}

function getInventoryQuantity(snapshot: RoomSnapshotView, playerId: string, itemKey: string) {
  return (
    snapshot.game?.inventoryItems.find(
      (item) => item.playerId === playerId && item.itemKey === itemKey,
    )?.quantity ?? 0
  );
}

function getOtherActivePlayers(snapshot: RoomSnapshotView, playerId: string) {
  return (
    snapshot.game?.players.filter((candidate) => !candidate.isBankrupt && candidate.id !== playerId) ?? []
  );
}

function getNearestMapGod(snapshot: RoomSnapshotView, player: PlayerGameView) {
  const game = snapshot.game;
  if (!game || game.mapGods.length === 0 || game.board.length === 0) {
    return null;
  }

  const boardSize = game.board.length;
  return [...game.mapGods].sort((left, right) => {
    const leftDistance = Math.min(
      Math.abs(left.tileIndex - player.position),
      boardSize - Math.abs(left.tileIndex - player.position),
    );
    const rightDistance = Math.min(
      Math.abs(right.tileIndex - player.position),
      boardSize - Math.abs(right.tileIndex - player.position),
    );
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    const leftForward = (left.tileIndex - player.position + boardSize) % boardSize;
    const rightForward = (right.tileIndex - player.position + boardSize) % boardSize;
    if (leftForward !== rightForward) {
      return leftForward - rightForward;
    }

    return left.tileIndex - right.tileIndex;
  })[0]!;
}

function getThreatScore(player: PlayerGameView) {
  return (
    player.totalAssets * 2 +
    player.cash * 3 +
    player.propertyAssetValue +
    Math.max(0, player.stockAssetValue)
  );
}

function selectBestTarget(
  snapshot: RoomSnapshotView,
  actor: PlayerGameView,
  options?: {
    filter?: (candidate: PlayerGameView) => boolean;
    preferCash?: boolean;
    avoidRebound?: boolean;
    avoidInnocence?: boolean;
    avoidFreePass?: boolean;
  },
) {
  const candidates = getOtherActivePlayers(snapshot, actor.id).filter(
    (candidate) => options?.filter?.(candidate) ?? true,
  );

  const scored = candidates
    .map((candidate) => {
      let score = options?.preferCash
        ? candidate.cash * 5 + candidate.totalAssets
        : getThreatScore(candidate);

      if (candidate.inJailTurns > 0) {
        score -= 5200;
      }
      if (candidate.sleepwalkingTurns > 0) {
        score -= 3800;
      }
      if (options?.avoidRebound && getInventoryQuantity(snapshot, candidate.id, REBOUND_ITEM_KEY) > 0) {
        score -= 4200;
      }
      if (
        options?.avoidInnocence &&
        getInventoryQuantity(snapshot, candidate.id, INNOCENCE_ITEM_KEY) > 0
      ) {
        score -= 3200;
      }
      if (options?.avoidFreePass && getInventoryQuantity(snapshot, candidate.id, FREE_PASS_ITEM_KEY) > 0) {
        score -= 2600;
      }

      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score && scored[0].score > 0 ? scored[0].candidate : null;
}

function getAverageActiveCash(snapshot: RoomSnapshotView) {
  const activePlayers = snapshot.game?.players.filter((player) => !player.isBankrupt) ?? [];
  if (activePlayers.length === 0) {
    return 0;
  }

  return activePlayers.reduce((sum, player) => sum + player.cash, 0) / activePlayers.length;
}

function shouldUseJunFu(snapshot: RoomSnapshotView, player: PlayerGameView) {
  const averageCash = getAverageActiveCash(snapshot);
  return averageCash > 0 && averageCash - player.cash >= 180;
}

function getBestCashBoostItem(snapshot: RoomSnapshotView, player: PlayerGameView) {
  const candidateKeys = ["redPacketCard", "bonusCard"];
  const owned = candidateKeys
    .map((itemKey) => ({
      itemKey,
      definition: getItemDefinition(itemKey),
      quantity: getInventoryQuantity(snapshot, player.id, itemKey),
    }))
    .filter(
      (
        item,
      ): item is {
        itemKey: string;
        definition: ItemDefinition;
        quantity: number;
      } => Boolean(item.definition && item.quantity > 0),
    )
    .sort((left, right) => (right.definition.amount ?? 0) - (left.definition.amount ?? 0));

  return owned[0] ?? null;
}

function chooseReactionAction(
  snapshot: RoomSnapshotView,
  player: PlayerGameView,
  reserveCash: number,
): GameActionRequest {
  const reaction = snapshot.game?.reaction;
  if (!reaction || reaction.reactingPlayerId !== player.id) {
    return { type: "declineReaction" };
  }

  if (reaction.kind === "payment" || reaction.kind === "taxAudit") {
    const freePassCount = getInventoryQuantity(snapshot, player.id, FREE_PASS_ITEM_KEY);
    const amount = reaction.amount ?? 0;
    const shouldUse =
      freePassCount > 0 &&
      (amount >= Math.max(140, Math.floor(reserveCash * 0.8)) ||
        player.cash - amount < Math.max(120, Math.floor(reserveCash * 0.55)));
    return shouldUse
      ? { type: "useItem", itemKey: FREE_PASS_ITEM_KEY }
      : { type: "declineReaction" };
  }

  const innocenceCount = getInventoryQuantity(snapshot, player.id, INNOCENCE_ITEM_KEY);
  if (innocenceCount <= 0) {
    return { type: "declineReaction" };
  }

  const shouldUse =
    reaction.debuffType === "sabotage"
      ? player.jailFreeCards <= 0 || player.totalAssets >= reserveCash * 3
      : player.ownedTileIndexes.length > 0 ||
        player.propertyAssetValue > 0 ||
        player.totalAssets >= reserveCash * 3;

  return shouldUse
    ? { type: "useItem", itemKey: INNOCENCE_ITEM_KEY }
    : { type: "declineReaction" };
}

function chooseAutoplayItemAction(
  snapshot: RoomSnapshotView,
  player: PlayerGameView,
  reserveCash: number,
): GameActionRequest | null {
  const game = snapshot.game;
  if (!game) {
    return null;
  }

  if (game.phase === "WAITING_FOR_JAIL_CHOICE") {
    if (player.inJailTurns > 0 && player.jailFreeCards <= 0 && getInventoryQuantity(snapshot, player.id, "lawyerCard") > 0) {
      return { type: "useItem", itemKey: "lawyerCard" };
    }
    return null;
  }

  if (game.phase !== "WAITING_FOR_ROLL" && game.phase !== "WAITING_FOR_TURN_END") {
    return null;
  }

  const richestTarget = selectBestTarget(snapshot, player, {
    preferCash: true,
    avoidRebound: true,
    avoidInnocence: true,
  });
  const curseTarget = selectBestTarget(snapshot, player, {
    avoidRebound: true,
  });
  const sabotageTarget = selectBestTarget(snapshot, player, {
    avoidRebound: true,
    avoidInnocence: true,
    filter: (candidate) => candidate.inJailTurns <= 0 && !isFushenGodKey(candidate.activeGod?.key),
  });
  const sleepwalkTarget = selectBestTarget(snapshot, player, {
    avoidRebound: true,
    avoidInnocence: true,
    filter: (candidate) =>
      candidate.inJailTurns <= 0 &&
      candidate.sleepwalkingTurns <= 0 &&
      !isFushenGodKey(candidate.activeGod?.key),
  });
  const nearestMapGod = getNearestMapGod(snapshot, player);
  const currentGodIsBad = isCurseGodKey(player.activeGod?.key);

  if (currentGodIsBad && getInventoryQuantity(snapshot, player.id, DISMISS_GOD_ITEM_KEY) > 0) {
    return { type: "useItem", itemKey: DISMISS_GOD_ITEM_KEY };
  }

  if (
    nearestMapGod &&
    !isCurseGodKey(nearestMapGod.key) &&
    getInventoryQuantity(snapshot, player.id, SUMMON_MAP_GOD_ITEM_KEY) > 0 &&
    (!player.activeGod || currentGodIsBad)
  ) {
    return { type: "useItem", itemKey: SUMMON_MAP_GOD_ITEM_KEY };
  }

  if (player.cash < reserveCash * 0.55) {
    if (
      richestTarget &&
      getInventoryQuantity(snapshot, player.id, TAX_AUDIT_ITEM_KEY) > 0 &&
      richestTarget.cash >= 260
    ) {
      return {
        type: "useItem",
        itemKey: TAX_AUDIT_ITEM_KEY,
        targetPlayerId: richestTarget.id,
      };
    }

    if (richestTarget && getInventoryQuantity(snapshot, player.id, "debtCard") > 0 && richestTarget.cash >= 180) {
      return { type: "useItem", itemKey: "debtCard", targetPlayerId: richestTarget.id };
    }

    if (getInventoryQuantity(snapshot, player.id, "rentCard") > 0) {
      const totalCollectable = getOtherActivePlayers(snapshot, player.id).reduce(
        (sum, candidate) => sum + Math.min(candidate.cash, 60),
        0,
      );
      if (totalCollectable >= 120) {
        return { type: "useItem", itemKey: "rentCard" };
      }
    }

    if (getInventoryQuantity(snapshot, player.id, "junFuCard") > 0 && shouldUseJunFu(snapshot, player)) {
      return { type: "useItem", itemKey: "junFuCard" };
    }

    const cashBoost = getBestCashBoostItem(snapshot, player);
    if (cashBoost) {
      return { type: "useItem", itemKey: cashBoost.itemKey };
    }
  }

  if (sabotageTarget && getInventoryQuantity(snapshot, player.id, "trapCard") > 0) {
    return { type: "useItem", itemKey: "trapCard", targetPlayerId: sabotageTarget.id };
  }

  if (sleepwalkTarget && getInventoryQuantity(snapshot, player.id, DREAMWALK_ITEM_KEY) > 0) {
    return { type: "useItem", itemKey: DREAMWALK_ITEM_KEY, targetPlayerId: sleepwalkTarget.id };
  }

  if (
    richestTarget &&
    getInventoryQuantity(snapshot, player.id, TAX_AUDIT_ITEM_KEY) > 0 &&
    richestTarget.cash >= 420
  ) {
    return {
      type: "useItem",
      itemKey: TAX_AUDIT_ITEM_KEY,
      targetPlayerId: richestTarget.id,
    };
  }

  if (richestTarget && getInventoryQuantity(snapshot, player.id, "debtCard") > 0 && richestTarget.cash >= 240) {
    return { type: "useItem", itemKey: "debtCard", targetPlayerId: richestTarget.id };
  }

  if (curseTarget && getInventoryQuantity(snapshot, player.id, "misfortuneCard") > 0) {
    return { type: "useItem", itemKey: "misfortuneCard", targetPlayerId: curseTarget.id };
  }

  if (getInventoryQuantity(snapshot, player.id, "rentCard") > 0) {
    const totalCollectable = getOtherActivePlayers(snapshot, player.id).reduce(
      (sum, candidate) => sum + Math.min(candidate.cash, 60),
      0,
    );
    if (totalCollectable >= 180) {
      return { type: "useItem", itemKey: "rentCard" };
    }
  }

  if (getInventoryQuantity(snapshot, player.id, "junFuCard") > 0 && shouldUseJunFu(snapshot, player)) {
    return { type: "useItem", itemKey: "junFuCard" };
  }

  if (!player.activeGod) {
    if (getInventoryQuantity(snapshot, player.id, "fortuneCard") > 0) {
      return { type: "useItem", itemKey: "fortuneCard" };
    }
    if (getInventoryQuantity(snapshot, player.id, "luckyCard") > 0) {
      return { type: "useItem", itemKey: "luckyCard" };
    }
  }

  if (game.phase === "WAITING_FOR_ROLL" && !player.activeVehicle) {
    if (getInventoryQuantity(snapshot, player.id, "car") > 0) {
      return { type: "useItem", itemKey: "car" };
    }
    if (getInventoryQuantity(snapshot, player.id, "motorcycle") > 0) {
      return { type: "useItem", itemKey: "motorcycle" };
    }
  }

  return null;
}

function scoreShopItem(
  snapshot: RoomSnapshotView,
  player: PlayerGameView,
  reserveCash: number,
  item: ItemDefinition,
) {
  const price = getEffectiveItemPrice(item, snapshot.game?.inflation.index ?? 1);
  const cashAfterPurchase = player.cash - price;
  if (cashAfterPurchase < 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const ownedCount = getInventoryQuantity(snapshot, player.id, item.key);
  const richestOpponentCash = Math.max(
    0,
    ...getOtherActivePlayers(snapshot, player.id).map((candidate) => candidate.cash),
  );
  const nearestMapGod = getNearestMapGod(snapshot, player);

  let score = 20;
  switch (item.key) {
    case "trapCard":
      score = 96;
      break;
    case DREAMWALK_ITEM_KEY:
      score = 92;
      break;
    case "misfortuneCard":
      score = 88;
      break;
    case TAX_AUDIT_ITEM_KEY:
      score = richestOpponentCash >= 300 ? 84 : 66;
      break;
    case "debtCard":
      score = richestOpponentCash >= 180 ? 80 : 60;
      break;
    case REBOUND_ITEM_KEY:
      score = 76;
      break;
    case INNOCENCE_ITEM_KEY:
      score = 74;
      break;
    case FREE_PASS_ITEM_KEY:
      score = 72;
      break;
    case "car":
      score = player.activeVehicle ? 24 : 70;
      break;
    case "motorcycle":
      score = player.activeVehicle ? 20 : 64;
      break;
    case "fortuneCard":
    case "luckyCard":
      score = player.activeGod ? 28 : 62;
      break;
    case SUMMON_MAP_GOD_ITEM_KEY:
      score =
        nearestMapGod && !isCurseGodKey(nearestMapGod.key)
          ? !player.activeGod || isCurseGodKey(player.activeGod.key)
            ? 70
            : 40
          : 18;
      break;
    case DISMISS_GOD_ITEM_KEY:
      score = player.activeGod && isCurseGodKey(player.activeGod.key) ? 76 : 22;
      break;
    case "rentCard":
      score = 64;
      break;
    case "junFuCard":
      score = shouldUseJunFu(snapshot, player) ? 62 : 38;
      break;
    case "redPacketCard":
      score = player.cash < reserveCash ? 58 : 24;
      break;
    case "bonusCard":
      score = player.cash < reserveCash ? 48 : 20;
      break;
    case "lawyerCard":
      score = player.jailFreeCards > 0 ? 26 : 50;
      break;
    case "remoteDice":
      score = 54;
      break;
    default:
      score = 30;
      break;
  }

  score -= ownedCount * 12;

  if (cashAfterPurchase < reserveCash * 0.45) {
    score -= 34;
  } else if (cashAfterPurchase < reserveCash * 0.7) {
    score -= 14;
  }

  return score;
}

function chooseShopPurchaseAction(
  snapshot: RoomSnapshotView,
  player: PlayerGameView,
  reserveCash: number,
): GameActionRequest | null {
  const game = snapshot.game;
  if (!game || game.phase !== "WAITING_FOR_SHOP_DECISION" || game.pendingTile?.type !== "shop") {
    return null;
  }

  const offers = getShopOfferItems({
    gameId: game.id,
    currentPlayerId: game.currentPlayerId,
    turnNumber: game.turnNumber,
    pendingTileIndex: game.pendingTile.index,
    version: game.version,
  });

  const bestOffer = offers
    .map((item) => ({
      item,
      score: scoreShopItem(snapshot, player, reserveCash, item),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestOffer || bestOffer.score < 50) {
    return null;
  }

  return {
    type: "buyItem",
    itemKey: bestOffer.item.key,
  };
}

export function chooseAutoplayAction(snapshot: RoomSnapshotView): GameActionRequest | null {
  if (!snapshot.game) {
    return null;
  }

  const game = snapshot.game;
  if (game.phase === "GAME_OVER") {
    return null;
  }

  const player = game.players.find((item) => item.id === game.currentPlayerId) ?? null;
  if (!player) {
    return null;
  }

  const reserveCash = getAutoplayReserveCash(snapshot);
  const proactiveItemAction = chooseAutoplayItemAction(snapshot, player, reserveCash);

  switch (game.phase) {
    case "WAITING_FOR_ROLL":
      if (proactiveItemAction) {
        return proactiveItemAction;
      }
      return { type: "rollDice" };
    case "WAITING_FOR_JAIL_CHOICE":
      if (proactiveItemAction) {
        return proactiveItemAction;
      }
      if (player.jailFreeCards > 0) {
        return { type: "useJailFreeCard" };
      }
      return { type: "endTurn" };
    case "WAITING_FOR_ABDUCTION_RETURN":
      return { type: "endTurn" };
    case "WAITING_FOR_ITEM_REACTION":
      return chooseReactionAction(snapshot, player, reserveCash);
    case "WAITING_FOR_PROPERTY_DECISION": {
      const pendingTile = game.pendingTile;
      if (!pendingTile) {
        return { type: "skipPurchase" };
      }

      const propertyState =
        game.properties.find((property) => property.tileIndex === pendingTile.index) ?? null;

      if (
        pendingTile.type === "property" &&
        propertyState?.ownerPlayerId === player.id &&
        !propertyState.mortgaged &&
        !propertyState.hasHotel &&
        !isShuaishenGodKey(player.activeGod?.key) &&
        (() => {
          const buildCost = isCaishenGodKey(player.activeGod?.key)
            ? 0
            : getEffectiveHouseCost(pendingTile, game.inflation.index);
          return buildCost === 0 || player.cash - buildCost >= reserveCash;
        })()
      ) {
        return {
          type: "buildHouse",
          tileIndex: pendingTile.index,
        };
      }

      if (
        "price" in pendingTile &&
        !propertyState?.ownerPlayerId &&
        player.cash - getEffectiveTilePrice(pendingTile, game.inflation.index) >= reserveCash
      ) {
        return { type: "buyProperty" };
      }

      return { type: "skipPurchase" };
    }
    case "WAITING_FOR_SHOP_DECISION":
      return chooseShopPurchaseAction(snapshot, player, reserveCash) ?? { type: "skipShop" };
    case "WAITING_FOR_LOTTERY_DECISION":
      return { type: "skipLottery" };
    case "WAITING_FOR_BANK_DECISION":
      return { type: "skipBank" };
    case "WAITING_FOR_MAGIC_DECISION": {
      const target = selectBestTarget(snapshot, player, {
        avoidRebound: true,
        filter: (candidate) => candidate.inJailTurns <= 0,
      });
      return target
        ? { type: "castMagic", magicKey: "bad", targetPlayerId: target.id }
        : { type: "castMagic", magicKey: "good" };
    }
    case "WAITING_FOR_AMUSEMENT_DECISION":
      return { type: "playAmusement", amusementChoice: "balloon" };
    case "WAITING_FOR_RECOVERY": {
      const recovery = game.recovery;
      if (!recovery) {
        return { type: "declareBankruptcy" };
      }

      const unmortgagedOwnedTiles = game.properties
        .filter(
          (property) =>
            property.ownerPlayerId === player.id && !property.mortgaged,
        )
        .map((property) => {
          const tile = game.board.find((boardTile) => boardTile.index === property.tileIndex);
          return tile && "price" in tile
            ? {
                tileIndex: property.tileIndex,
                value: getEffectiveMortgageValue(tile, game.inflation.index),
              }
            : null;
        })
        .filter((item): item is { tileIndex: number; value: number } => Boolean(item));

      if (unmortgagedOwnedTiles.length === 0) {
        return { type: "declareBankruptcy" };
      }

      const shortfall = Math.max(0, recovery.amountDue - player.cash);
      const sortedTiles = [...unmortgagedOwnedTiles].sort((left, right) => left.value - right.value);
      const bestFit =
        sortedTiles.find((item) => item.value >= shortfall) ??
        sortedTiles[sortedTiles.length - 1];

      return { type: "mortgage", tileIndex: bestFit.tileIndex };
    }
    case "WAITING_FOR_TURN_END":
      if (proactiveItemAction) {
        return proactiveItemAction;
      }
      return { type: "endTurn" };
    default:
      return null;
  }
}

interface AutomationContext {
  roomCode: string;
  gameId: string;
  turnSeconds: number;
  currentPlayerId: string;
  currentPlayerToken: string;
  currentPlayer: PlayerGameView;
  currentPlayerIsBot: boolean;
  snapshot: RoomSnapshotView;
}

async function loadAutomationContext(roomCode: string): Promise<AutomationContext | null> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const room = await prisma.room.findUnique({
    where: { code: normalizedRoomCode },
    include: {
      settings: true,
      players: {
        orderBy: { seatOrder: "asc" },
      },
      game: {
        select: {
          id: true,
          phase: true,
          currentPlayerId: true,
        },
      },
    },
  });

  if (
    !room?.settings ||
    !room.game ||
    room.status !== RoomStatus.IN_GAME ||
    room.game.phase === GamePhase.GAME_OVER
  ) {
    return null;
  }

  const currentPlayerRow = room.players.find((player) => player.id === room.game?.currentPlayerId) ?? null;
  if (!currentPlayerRow) {
    return null;
  }

  const snapshot = await loadRoomSnapshot(prisma, room.code, currentPlayerRow.token);
  if (!snapshot?.game) {
    return null;
  }

  const currentPlayer = snapshot.game.players.find(
    (player) => player.id === room.game?.currentPlayerId,
  );
  if (!currentPlayer) {
    return null;
  }

  return {
    roomCode: room.code,
    gameId: room.game.id,
    turnSeconds: room.settings.turnSeconds,
    currentPlayerId: currentPlayerRow.id,
    currentPlayerToken: currentPlayerRow.token,
    currentPlayer,
    currentPlayerIsBot: currentPlayerRow.isBot,
    snapshot,
  };
}

async function handleTimeout(roomCode: string, playerId: string) {
  try {
    const result = await enableManagedModeByTimeout(roomCode, playerId);
    if (result.changed) {
      scheduleRoomAutomation(result.roomCode);
    }
  } catch (error) {
    console.error("[autoplay] timeout automation failed", error);
  }
}

function scheduleHumanTurnTimeout(context: AutomationContext) {
  clearRoomTimer(context.roomCode);
  roomTimers.set(
    context.roomCode,
    setTimeout(() => {
      roomTimers.delete(context.roomCode);
      void handleTimeout(context.roomCode, context.currentPlayerId);
    }, Math.max(1000, context.turnSeconds * 1000)),
  );
}

async function syncRoomAutomation(roomCode: string) {
  if (runningRooms.has(roomCode)) {
    pendingRooms.add(roomCode);
    return;
  }

  runningRooms.add(roomCode);

  try {
    let safetyCounter = 0;
    while (true) {
      safetyCounter += 1;
      if (safetyCounter > 24) {
        console.error("[autoplay] safety limit reached", roomCode);
        return;
      }
      pendingRooms.delete(roomCode);
      clearRoomTimer(roomCode);

      const context = await loadAutomationContext(roomCode);
      if (!context) {
        clearRoomTimer(roomCode);
        roomTurnMemory.delete(roomCode);
        return;
      }

      const autoControlled = context.currentPlayerIsBot || context.currentPlayer.isManaged;
      if (!autoControlled) {
        scheduleHumanTurnTimeout(context);
        return;
      }

      const action = chooseAutoplayAction(context.snapshot);
      if (!action) {
        return;
      }

      await wait(getAutoplayThinkDelayMs(action, context));
      await performAutomatedGameAction(
        context.gameId,
        context.currentPlayerToken,
        action,
      );
      pendingRooms.add(roomCode);
    }
  } catch (error) {
    console.error("[autoplay] room automation failed", error);
  } finally {
    runningRooms.delete(roomCode);
    if (pendingRooms.has(roomCode)) {
      setTimeout(() => {
        void syncRoomAutomation(roomCode);
      }, 0);
    }
  }
}

export function scheduleRoomAutomation(roomCode: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  pendingRooms.add(normalizedRoomCode);
  setTimeout(() => {
    void syncRoomAutomation(normalizedRoomCode);
  }, 0);
}

export async function refreshCurrentTurnHeartbeat(roomCode: string, playerId: string) {
  const context = await loadAutomationContext(roomCode);
  if (!context) {
    clearRoomTimer(normalizeRoomCode(roomCode));
    return;
  }

  const autoControlled = context.currentPlayerIsBot || context.currentPlayer.isManaged;
  if (autoControlled || context.currentPlayerId !== playerId) {
    return;
  }

  scheduleHumanTurnTimeout(context);
}
