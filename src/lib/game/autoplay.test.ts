import { describe, expect, it } from "vitest";

import { chooseAutoplayAction } from "@/lib/game/autoplay";
import { BOARD_TILES } from "@/lib/game/board";
import { CHARACTER_PRESETS } from "@/lib/game/characters";
import { getShopOfferItems } from "@/lib/game/shop";
import type { RoomSnapshotView } from "@/lib/game/types";

const propertyTile = BOARD_TILES.find((tile) => tile.type === "property");
const shopTile = BOARD_TILES.find((tile) => tile.type === "shop");

if (!propertyTile || propertyTile.type !== "property") {
  throw new Error("Missing property tile fixture.");
}

if (!shopTile || shopTile.type !== "shop") {
  throw new Error("Missing shop tile fixture.");
}

function createSnapshot(overrides?: Partial<RoomSnapshotView["game"]>): RoomSnapshotView {
  return {
    id: "room-1",
    code: "1234",
    status: "IN_GAME",
    settings: {
      startingCash: 2000,
      passStartSalary: 200,
      maxPlayers: 4,
      jailFine: 100,
      parkingJackpotEnabled: true,
      stocksEnabled: false,
      parkingJackpot: 0,
      turnSeconds: 120,
    },
    availableCharacters: CHARACTER_PRESETS,
    players: [],
    currentPlayer: null,
    recentEvents: [],
    game: {
      id: "game-1",
      phase: "WAITING_FOR_ROLL",
      version: 1,
      turnNumber: 1,
      roundNumber: 1,
      currentDate: "2026-05-06",
      currentPlayerId: "player-1",
      winnerPlayerId: null,
      inflation: {
        index: 1,
        assetBaseTotal: 2000,
        stepAssetTotal: 6000,
        nextLevelAssetTotal: 6001,
      },
      recovery: null,
      reaction: null,
      lastRoll: null,
      pendingTile: null,
      rollAgainAvailable: false,
      board: BOARD_TILES,
      properties: [],
      stocks: [],
      stockHoldings: [],
      inventoryItems: [],
      lottery: {
        jackpot: 600,
        ticketPrice: 100,
        drawAtTurn: 4,
        turnsUntilDraw: 3,
        tickets: [],
      },
      mapGods: [],
      players: [
        {
          id: "player-1",
          name: "电脑1",
          seatOrder: 0,
          isHost: true,
          isReady: true,
          isBot: true,
          isConnected: true,
          lastSeenAt: null,
          isManaged: false,
          managedReason: null,
          character: CHARACTER_PRESETS[0],
          cash: 2000,
          position: 0,
          lapsCompleted: 0,
          inJailTurns: 0,
          abductedTurns: 0,
          sleepwalkingTurns: 0,
          jailFreeCards: 0,
          bankSavings: 0,
          bankDebt: 0,
          activeGod: null,
          activeVehicle: null,
          isBankrupt: false,
          ownedTileIndexes: [],
          propertyAssetValue: 0,
          stockAssetValue: 0,
          totalAssets: 2000,
        },
      ],
      ...overrides,
    },
  };
}

describe("chooseAutoplayAction", () => {
  it("buys an unowned property when reserve cash remains", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_PROPERTY_DECISION",
      pendingTile: propertyTile,
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: null,
          houseCount: 0,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: propertyTile.price + 500,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "buyProperty" });
  });

  it("skips buying a property when cash reserve would be too low", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_PROPERTY_DECISION",
      pendingTile: propertyTile,
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: null,
          houseCount: 0,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: propertyTile.price + 120,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "skipPurchase" });
  });

  it("builds a house on its own property when affordable", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_PROPERTY_DECISION",
      pendingTile: propertyTile,
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: "player-1",
          houseCount: 0,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: propertyTile.houseCost + 600,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "buildHouse",
      tileIndex: propertyTile.index,
    });
  });

  it("skips building when shuaishen is attached", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_PROPERTY_DECISION",
      pendingTile: propertyTile,
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: "player-1",
          houseCount: 0,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: propertyTile.houseCost + 600,
          activeGod: {
            key: "xiaoShuaishen",
            name: "小衰神",
            description: "建房会失败",
            colorHex: "#ef4444",
            turnsRemaining: 2,
          },
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "skipPurchase" });
  });

  it("respects inflated prices when deciding whether to buy", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_PROPERTY_DECISION",
      inflation: {
        index: 3,
        assetBaseTotal: 18000,
        stepAssetTotal: 6000,
        nextLevelAssetTotal: 18001,
      },
      pendingTile: propertyTile,
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: null,
          houseCount: 0,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: propertyTile.price * 2 + 200,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "skipPurchase" });
  });

  it("uses a jail free card to leave jail early", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_JAIL_CHOICE",
      players: [
        {
          ...createSnapshot().game!.players[0],
          inJailTurns: 2,
          jailFreeCards: 1,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "useJailFreeCard" });
  });

  it("waits out the jail turn when no release option is available", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_JAIL_CHOICE",
      players: [
        {
          ...createSnapshot().game!.players[0],
          inJailTurns: 2,
          jailFreeCards: 0,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "endTurn" });
  });

  it("waits while abducted by aliens", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ABDUCTION_RETURN",
      players: [
        {
          ...createSnapshot().game!.players[0],
          abductedTurns: 2,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "endTurn" });
  });

  it("uses sabotage cards against the strongest opponent before rolling", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ROLL",
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "trapCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: 1800,
          totalAssets: 2400,
        },
        {
          ...createSnapshot().game!.players[0],
          id: "player-2",
          name: "电脑2",
          seatOrder: 1,
          cash: 2600,
          totalAssets: 5200,
          propertyAssetValue: 1800,
        },
        {
          ...createSnapshot().game!.players[0],
          id: "player-3",
          name: "电脑3",
          seatOrder: 2,
          cash: 1200,
          totalAssets: 2600,
          propertyAssetValue: 600,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "trapCard",
      targetPlayerId: "player-2",
    });
  });

  it("uses lawyer card first when trapped in jail without a jail free card", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_JAIL_CHOICE",
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "lawyerCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          inJailTurns: 2,
          jailFreeCards: 0,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "lawyerCard",
    });
  });

  it("uses summon god card when a nearby good map god can be pulled", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ROLL",
      mapGods: [
        {
          tileIndex: 3,
          key: "xiaoFushen",
          name: "小福神",
          description: "测试神明",
          colorHex: "#22c55e",
          turnsRemaining: 3,
        },
      ],
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "summonGodCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          position: 0,
          activeGod: null,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "summonGodCard",
    });
  });

  it("uses dismiss god card when currently attached to a bad god", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ROLL",
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "dismissGodCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          activeGod: {
            key: "xiaoShuaishen",
            name: "小衰神",
            description: "测试坏神",
            colorHex: "#ef4444",
            turnsRemaining: 2,
          },
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "dismissGodCard",
    });
  });

  it("falls back to simple skip actions for optional stops", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_BANK_DECISION",
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "skipBank" });
  });

  it("buys an offered shop item instead of always skipping", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_SHOP_DECISION",
      pendingTile: shopTile,
      turnNumber: 7,
      version: 3,
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: 2200,
        },
      ],
    });
    const offers = getShopOfferItems({
      gameId: snapshot.game!.id,
      currentPlayerId: snapshot.game!.currentPlayerId,
      turnNumber: snapshot.game!.turnNumber,
      pendingTileIndex: snapshot.game!.pendingTile?.index,
      version: snapshot.game!.version,
    });
    const action = chooseAutoplayAction(snapshot);

    expect(action?.type).toBe("buyItem");
    expect(offers.some((offer) => offer.key === action?.itemKey)).toBe(true);
  });

  it("mortgages a property during recovery when cash is insufficient", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_RECOVERY",
      recovery: {
        amountDue: propertyTile.price + 60,
        reason: "租金",
        creditorPlayerId: "player-2",
        creditorName: "电脑2",
      },
      properties: [
        {
          tileIndex: propertyTile.index,
          ownerPlayerId: "player-1",
          houseCount: 3,
          hasHotel: false,
          mortgaged: false,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: 50,
          ownedTileIndexes: [propertyTile.index],
          propertyAssetValue: propertyTile.price,
          totalAssets: 2050,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "mortgage",
      tileIndex: propertyTile.index,
    });
  });

  it("uses free pass manually for expensive payment reactions", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ITEM_REACTION",
      reaction: {
        kind: "payment",
        reactingPlayerId: "player-1",
        turnPlayerId: "player-1",
        sourcePlayerId: null,
        sourcePlayerName: null,
        sourceItemName: "免费卡",
        amount: 480,
        reason: "租金",
        debuffType: null,
        itemKeys: ["freePassCard"],
      },
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "freePassCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: 520,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "freePassCard",
    });
  });

  it("declines free pass for small tax audit reactions", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ITEM_REACTION",
      reaction: {
        kind: "taxAudit",
        reactingPlayerId: "player-1",
        turnPlayerId: "player-2",
        sourcePlayerId: "player-2",
        sourcePlayerName: "电脑2",
        sourceItemName: "查税卡",
        amount: 60,
        reason: "查税",
        debuffType: null,
        itemKeys: ["freePassCard"],
      },
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "freePassCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          cash: 1600,
        },
        {
          ...createSnapshot().game!.players[0],
          id: "player-2",
          name: "电脑2",
          seatOrder: 1,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({ type: "declineReaction" });
  });

  it("uses innocence card manually against sabotage reactions", () => {
    const snapshot = createSnapshot({
      phase: "WAITING_FOR_ITEM_REACTION",
      reaction: {
        kind: "debuff",
        reactingPlayerId: "player-1",
        turnPlayerId: "player-2",
        sourcePlayerId: "player-2",
        sourcePlayerName: "电脑2",
        sourceItemName: "陷害卡",
        amount: null,
        reason: null,
        debuffType: "sabotage",
        itemKeys: ["innocenceCard"],
      },
      inventoryItems: [
        {
          playerId: "player-1",
          itemKey: "innocenceCard",
          quantity: 1,
        },
      ],
      players: [
        {
          ...createSnapshot().game!.players[0],
          jailFreeCards: 0,
        },
        {
          ...createSnapshot().game!.players[0],
          id: "player-2",
          name: "电脑2",
          seatOrder: 1,
        },
      ],
    });

    expect(chooseAutoplayAction(snapshot)).toEqual({
      type: "useItem",
      itemKey: "innocenceCard",
    });
  });
});
