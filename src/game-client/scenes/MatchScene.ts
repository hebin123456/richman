import Phaser from "phaser";

import { BaseScene } from "@/game-client/phaser/BaseScene";
import type { GameRuntime } from "@/game-client/phaser/GameRuntime";
import {
  getBoardLayout,
  getTileAccentColor,
  getTileCoordinate,
} from "@/game-client/utils/boardLayout";
import { fitWrappedText } from "@/game-client/utils/textLayout";
import type {
  EventView,
  GameSnapshotView,
  PlayerGameView,
} from "@/lib/game/types";
import { formatGameDateLabel } from "@/lib/game/calendar";
import {
  getEffectiveHouseCost,
  getEffectivePassStartSalary,
  getEffectivePropertyRent,
  getEffectiveRailroadRent,
  getEffectiveTaxAmount,
  getEffectiveTilePrice,
} from "@/lib/game/economy";
import {
  GOD_DURATION_TURNS,
  isCaishenGodKey,
  isFushenGodKey,
  isShuaishenGodKey,
} from "@/lib/game/gods";
import type { VehicleKey } from "@/lib/game/items";
import {
  getCharacterAvatarTextureKey,
  getCharacterPortraitTextureKey,
} from "@/lib/game/characters";
import { getCharacterContent } from "@/lib/game/character-content";
import {
  BOARD_TILES,
  getTileIconTextureKey,
  type BoardTile,
} from "@/lib/game/board";

const ACCENT_COLORS: Record<string, number> = {
  amber: 0xf59e0b,
  lime: 0x84cc16,
  pink: 0xec4899,
  violet: 0x8b5cf6,
  sky: 0x0ea5e9,
  rose: 0xf43f5e,
  slate: 0x64748b,
  orange: 0xf97316,
  cyan: 0x06b6d4,
  red: 0xef4444,
  emerald: 0x10b981,
};

const DICE_PIP_LAYOUT: Record<number, Array<{ x: number; y: number }>> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.72 },
  ],
  3: [
    { x: 0.28, y: 0.28 },
    { x: 0.5, y: 0.5 },
    { x: 0.72, y: 0.72 },
  ],
  4: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.28 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.72 },
  ],
  5: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.28 },
    { x: 0.5, y: 0.5 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.72 },
  ],
  6: [
    { x: 0.28, y: 0.24 },
    { x: 0.72, y: 0.24 },
    { x: 0.28, y: 0.5 },
    { x: 0.72, y: 0.5 },
    { x: 0.28, y: 0.76 },
    { x: 0.72, y: 0.76 },
  ],
};

interface StructureVisualState {
  level: number;
  hasHotel: boolean;
  ownerPlayerId: string | null;
}

interface PendingTokenMove {
  fromPosition: number;
  toPosition: number;
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString("zh-CN")} 元`;
}

function parseColorHex(colorHex: string) {
  return Phaser.Display.Color.HexStringToColor(colorHex).color;
}

function getPhaseLabel(phase: GameSnapshotView["phase"]) {
  switch (phase) {
    case "WAITING_FOR_ROLL":
      return "等待掷骰";
    case "WAITING_FOR_JAIL_CHOICE":
      return "监狱中";
    case "WAITING_FOR_ABDUCTION_RETURN":
      return "失踪中";
    case "WAITING_FOR_ITEM_REACTION":
      return "道具响应";
    case "WAITING_FOR_PROPERTY_DECISION":
      return "地块决策";
    case "WAITING_FOR_SHOP_DECISION":
      return "商店选择";
    case "WAITING_FOR_LOTTERY_DECISION":
      return "彩票选择";
    case "WAITING_FOR_BANK_DECISION":
      return "银行办理";
    case "WAITING_FOR_MAGIC_DECISION":
      return "魔法施放";
    case "WAITING_FOR_AMUSEMENT_DECISION":
      return "游乐选择";
    case "WAITING_FOR_RECOVERY":
      return "恢复中";
    case "WAITING_FOR_TURN_END":
      return "等待结束回合";
    case "GAME_OVER":
      return "对局结束";
    default:
      return phase;
  }
}

function getTileMetaLabel(tile: BoardTile, inflationIndex: number) {
  if (tile.type === "property" || tile.type === "railroad") {
    return `${getEffectiveTilePrice(tile, inflationIndex)} 元`;
  }

  if (tile.type === "tax") {
    return `-${getEffectiveTaxAmount(tile, inflationIndex)} 元`;
  }

  switch (tile.type) {
    case "start":
      return "起点";
    case "bank":
      return "银行";
    case "magic":
      return "魔法";
    case "chance":
      return "机会";
    case "community":
      return "命运";
    case "news":
      return "新闻";
    case "freeCard":
      return "卡点";
    case "amusement":
      return "游乐";
    case "shop":
      return "商店";
    case "lottery":
      return "乐透";
    case "jail":
      return "监狱";
    case "freeParking":
      return "休息";
    case "goToJail":
      return "入狱";
    default:
      return "";
  }
}

function getTileTypeLabel(tile: BoardTile) {
  switch (tile.type) {
    case "property":
      return "地产";
    case "railroad":
      return "铁路";
    case "bank":
      return "银行";
    case "magic":
      return "魔法屋";
    case "chance":
      return "机会格";
    case "community":
      return "命运格";
    case "news":
      return "新闻屋";
    case "freeCard":
      return "免费卡点";
    case "amusement":
      return "游乐场";
    case "shop":
      return "道具店";
    case "lottery":
      return "彩票屋";
    case "tax":
      return "税务格";
    case "jail":
      return "监狱";
    case "freeParking":
      return "免费停车";
    case "goToJail":
      return "前往监狱";
    case "start":
      return "起点";
    default:
      return "地块";
  }
}

export class MatchScene extends BaseScene {
  private background!: Phaser.GameObjects.Graphics;

  private staticLayer!: Phaser.GameObjects.Container;

  private tokenLayer!: Phaser.GameObjects.Container;

  private inspectionLayer!: Phaser.GameObjects.Container;

  private interactionLayer!: Phaser.GameObjects.Container;

  private effectLayer!: Phaser.GameObjects.Container;

  private movementLayer!: Phaser.GameObjects.Container;

  private overlayLayer!: Phaser.GameObjects.Container;

  private readonly tokenMap = new Map<string, Phaser.GameObjects.Container>();

  private readonly tokenPositions = new Map<string, number>();

  private readonly tokenVehicleStates = new Map<string, VehicleKey | null>();

  private hoveredTileIndex: number | null = null;

  private pinnedTileIndex: number | null = null;

  private initializedRollTracking = false;

  private lastAnimatedRollSequence: number | null = null;

  private initializedStructureTracking = false;

  private readonly previousStructureStates = new Map<number, StructureVisualState>();

  private diceRollTimer: Phaser.Time.TimerEvent | null = null;

  private diceResolveTimer: Phaser.Time.TimerEvent | null = null;

  private diceDismissTimer: Phaser.Time.TimerEvent | null = null;

  private readonly pendingMoveTimers = new Map<string, Phaser.Time.TimerEvent>();

  private readonly pendingTokenMoves = new Map<string, PendingTokenMove>();

  constructor(runtime: GameRuntime) {
    super("MatchScene", runtime);
  }

  create() {
    this.cameras.main.setBackgroundColor("#07111d");
    this.tokenMap.clear();
    this.tokenPositions.clear();
    this.tokenVehicleStates.clear();
    this.background = this.add.graphics();
    this.staticLayer = this.add.container(0, 0);
    this.tokenLayer = this.add.container(0, 0);
    this.inspectionLayer = this.add.container(0, 0);
    this.interactionLayer = this.add.container(0, 0);
    this.effectLayer = this.add.container(0, 0);
    this.movementLayer = this.add.container(0, 0);
    this.overlayLayer = this.add.container(0, 0);

    this.bindRuntime(() => this.renderScene());
    this.scale.on("resize", this.renderScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.renderScene, this);
      this.tokenMap.clear();
      this.tokenPositions.clear();
      this.tokenVehicleStates.clear();
      this.hoveredTileIndex = null;
      this.pinnedTileIndex = null;
      this.initializedStructureTracking = false;
      this.previousStructureStates.clear();
      this.clearDiceCeremony();
      this.clearPendingMoveTimers();
      this.pendingTokenMoves.clear();
    });

    this.renderScene();
  }

  private renderScene = () => {
    const snapshot = this.state.snapshot;
    const game = snapshot?.game;
    const latestEvent = snapshot?.recentEvents.at(-1) ?? null;

    if (!snapshot || !game) {
      return;
    }

    this.drawBackground();
    this.drawBoard(game, snapshot.code, latestEvent?.summary ?? "");
    this.maybePlayDiceCeremony(game, latestEvent);
    this.maybePlayStructureEffects(game, latestEvent);
    this.syncTokens(game, latestEvent);
    this.drawTileInspection(game);
    this.drawOverlays(game);
  };

  private drawBackground() {
    const { width, height } = this.scale;
    this.background.clear();
    this.background.fillGradientStyle(0x07111d, 0x101c34, 0x0b1424, 0x07111d, 1);
    this.background.fillRect(0, 0, width, height);
    this.background.fillStyle(0xffffff, 0.05);
    this.background.fillCircle(width * 0.12, height * 0.18, 110);
    this.background.fillCircle(width * 0.82, height * 0.24, 130);
    this.background.fillCircle(width * 0.68, height * 0.78, 170);
  }

  private drawBoard(game: GameSnapshotView, roomCode: string, latestEvent: string) {
    this.staticLayer.removeAll(true);
    this.interactionLayer.removeAll(true);

    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const compact = this.scale.width < 1100;
    const boardGraphics = this.add.graphics();
    boardGraphics.fillStyle(0xf8ecd9, 0.96);
    boardGraphics.fillRoundedRect(
      layout.originX,
      layout.originY,
      layout.boardWidth,
      layout.boardHeight,
      30,
    );
    boardGraphics.lineStyle(3, 0xd6c3a2, 1);
    boardGraphics.strokeRoundedRect(
      layout.originX,
      layout.originY,
      layout.boardWidth,
      layout.boardHeight,
      30,
    );
    this.staticLayer.add(boardGraphics);

    const ownerById = new Map(game.players.map((player) => [player.id, player]));

    for (const tile of game.board) {
      this.drawTile(tile, layout, ownerById, game);
      this.addTileInteraction(tile, layout, game);
    }

    const centerX = layout.originX + layout.boardWidth * 0.5;
    const centerY = layout.originY + layout.boardHeight * 0.5;
    const currentPlayer =
      game.players.find((player) => player.id === game.currentPlayerId) ??
      game.players[0];
    const diceLabel = game.lastRoll
      ? `${game.lastRoll.values.join(" + ")} = ${game.lastRoll.total}`
      : "等待下一次掷骰";
    const phaseLabel = getPhaseLabel(game.phase);
    const currentContent = currentPlayer
      ? getCharacterContent(currentPlayer.character.id)
      : null;
    const currentAccentColor = currentPlayer
      ? ACCENT_COLORS[currentPlayer.character.accent] ?? 0xf59e0b
      : 0xf59e0b;
    const currentPortraitKey = currentPlayer
      ? getCharacterPortraitTextureKey(currentPlayer.character.id)
      : null;
    const hasCurrentPortrait = currentPortraitKey
      ? this.textures.exists(currentPortraitKey)
      : false;
    const turnHeadline = currentPlayer
      ? `轮到 ${currentPlayer.character.name}`
      : "掌上大富翁棋盘";
    const turnSummary = `${formatGameDateLabel(game.currentDate)} · 第 ${game.roundNumber} 天 · ${phaseLabel}`;
    const inflationSummary = `物价指数 x${game.inflation.index} · 仅影响罚金 / 税金 / 过路费`;
    const turnPlayerLabel = currentPlayer
      ? `${currentPlayer.character.name} · ${currentPlayer.name}`
      : "等待玩家加入";
    const turnQuote = currentContent?.introLine ?? latestEvent ?? "等待下一步操作";
    const centerPanelWidth = Math.min(compact ? 436 : 420, layout.boardWidth * (compact ? 0.6 : 0.5));
    const centerPanelHeight = compact ? 208 : 248;
    const centerPanelX = centerX - centerPanelWidth * 0.5;
    const centerPanelY = centerY - centerPanelHeight * 0.5;
    const innerPanelWidth = centerPanelWidth - 44;
    const portraitWidth = compact ? 76 : 126;
    const portraitHeight = compact ? 102 : 168;
    const portraitX = centerPanelX + centerPanelWidth - (compact ? 58 : 74);
    const portraitY = centerPanelY + centerPanelHeight * (compact ? 0.58 : 0.56);
    const portraitReservedWidth = hasCurrentPortrait ? (compact ? 90 : 146) : 0;
    const contentX = centerPanelX + 32;
    const contentWidth = Math.max(152, centerPanelWidth - 64 - portraitReservedWidth);
    const sectionWidth = Math.min(innerPanelWidth, contentWidth + 22);
    const topSectionY = centerPanelY + 22;
    const topSectionHeight = compact ? 92 : 102;
    const bottomSectionHeight = compact ? 84 : 96;
    const bottomSectionY = centerPanelY + centerPanelHeight - bottomSectionHeight - 22;

    const centerPanel = this.add.graphics();
    centerPanel.fillStyle(0xffffff, 0.72);
    centerPanel.fillRoundedRect(
      centerPanelX,
      centerPanelY,
      centerPanelWidth,
      centerPanelHeight,
      28,
    );
    centerPanel.fillStyle(currentAccentColor, 0.12);
    centerPanel.fillRoundedRect(centerPanelX + 18, centerPanelY + 18, 12, centerPanelHeight - 36, 8);
    centerPanel.fillStyle(0x0f172a, 0.05);
    centerPanel.fillRoundedRect(centerPanelX + 22, topSectionY, sectionWidth, topSectionHeight, 22);
    centerPanel.fillRoundedRect(centerPanelX + 22, bottomSectionY, sectionWidth, bottomSectionHeight, 22);

    if (hasCurrentPortrait) {
      centerPanel.fillStyle(0x0f172a, 0.08);
      centerPanel.fillRoundedRect(
        portraitX - portraitWidth * 0.5 + 8,
        portraitY - portraitHeight * 0.5 + 10,
        portraitWidth,
        portraitHeight,
        compact ? 18 : 22,
      );
      centerPanel.fillStyle(0xffffff, 0.97);
      centerPanel.fillRoundedRect(
        portraitX - portraitWidth * 0.5,
        portraitY - portraitHeight * 0.5,
        portraitWidth,
        portraitHeight,
        compact ? 18 : 22,
      );
      centerPanel.fillStyle(currentAccentColor, 0.18);
      centerPanel.fillRoundedRect(
        portraitX - portraitWidth * 0.24,
        portraitY + portraitHeight * 0.34,
        portraitWidth * 0.48,
        compact ? 9 : 10,
        6,
      );
    }
    this.staticLayer.add(centerPanel);

    if (currentPortraitKey && hasCurrentPortrait) {
      const turnPortrait = this.add.image(portraitX, portraitY, currentPortraitKey);
      turnPortrait.setDisplaySize(portraitWidth * 0.92, portraitHeight * 0.92);
      this.staticLayer.add(turnPortrait);
    }

    const roomLabel = this.add.text(contentX, topSectionY + 12, `房间 ${roomCode}`, {
      fontFamily: "Arial",
      fontSize: compact ? "11px" : "13px",
      color: "#64748b",
    });
    const headlineText = this.add.text(contentX, roomLabel.y + roomLabel.height + 6, "", {
      fontFamily: "Arial",
      fontStyle: "bold",
      color: "#0f172a",
    });
    fitWrappedText(headlineText, {
      content: turnHeadline,
      maxWidth: contentWidth,
      maxHeight: compact ? 30 : 36,
      preferredFontSize: compact ? 20 : 24,
      minFontSize: compact ? 14 : 17,
      preferredLineSpacing: 2,
      minLineSpacing: 0,
    });

    const metaText = this.add.text(contentX, headlineText.y + headlineText.height + 6, "", {
      fontFamily: "Arial",
      color: compact ? "#475569" : "#334155",
    });
    fitWrappedText(metaText, {
      content: `${turnPlayerLabel}\n${turnSummary}\n${inflationSummary}`,
      maxWidth: contentWidth,
      maxHeight: compact ? 54 : 62,
      preferredFontSize: compact ? 11 : 12,
      minFontSize: 9,
      preferredLineSpacing: compact ? 4 : 5,
      minLineSpacing: 1,
    });

    const diceText = this.add.text(contentX, bottomSectionY + 12, "", {
      fontFamily: "Arial",
      color: "#0f172a",
    });
    fitWrappedText(diceText, {
      content: `掷骰：${diceLabel}`,
      maxWidth: contentWidth,
      maxHeight: compact ? 22 : 26,
      preferredFontSize: compact ? 13 : 15,
      minFontSize: compact ? 11 : 12,
      preferredLineSpacing: 1,
      minLineSpacing: 0,
    });

    const quoteText = this.add.text(contentX, diceText.y + diceText.height + 6, "", {
      fontFamily: "Arial",
      color: "#475569",
    });
    fitWrappedText(quoteText, {
      content: turnQuote,
      maxWidth: contentWidth,
      maxHeight: Math.max(compact ? 24 : 32, bottomSectionHeight - 24 - diceText.height - 6),
      preferredFontSize: compact ? 11 : 13,
      minFontSize: compact ? 9 : 10,
      preferredLineSpacing: compact ? 3 : 5,
      minLineSpacing: 1,
    });

    this.staticLayer.add(roomLabel);
    this.staticLayer.add(headlineText);
    this.staticLayer.add(metaText);
    this.staticLayer.add(diceText);
    this.staticLayer.add(quoteText);
  }

  private drawTile(
    tile: BoardTile,
    layout: ReturnType<typeof getBoardLayout>,
    ownerById: Map<string, PlayerGameView>,
    game: GameSnapshotView,
  ) {
    const coordinate = getTileCoordinate(tile.index);
    const bounds = this.getTileBounds(layout, tile.index);
    const x = bounds.x - 4;
    const y = bounds.y - 4;
    const width = bounds.width;
    const height = bounds.height;
    const accent = getTileAccentColor(tile);
    const property = this.state.snapshot?.game?.properties.find(
      (item) => item.tileIndex === tile.index,
    );
    const mapGod = this.findMapGod(game, tile.index);
    const owner = property?.ownerPlayerId
      ? ownerById.get(property.ownerPlayerId)
      : null;
    const ownerColor = owner ? ACCENT_COLORS[owner.character.accent] ?? 0x475569 : accent;
    const baseTileSize = Math.min(width, height);
    const indexFontSize = Phaser.Math.Clamp(Math.round(baseTileSize * 0.085), 8, 9);
    const nameFontSize = Phaser.Math.Clamp(Math.round(baseTileSize * 0.118), 10, 12);
    const metaFontSize = Phaser.Math.Clamp(Math.round(baseTileSize * 0.09), 8, 9);
    const nameWrapWidth = Math.max(42, width - 32 - (owner ? 22 : 0));

    const tileGraphics = this.add.graphics();
    tileGraphics.fillStyle(0xffffff, 0.93);
    tileGraphics.fillRoundedRect(bounds.x, bounds.y, width, height, 18);
    tileGraphics.lineStyle(2, 0xcbd5e1, 1);
    tileGraphics.strokeRoundedRect(bounds.x, bounds.y, width, height, 18);

    if (coordinate.side === "bottom") {
      tileGraphics.fillStyle(accent, 1);
      tileGraphics.fillRoundedRect(x + 10, y + 10, width - 12, 10, 8);
    } else if (coordinate.side === "top") {
      tileGraphics.fillStyle(accent, 1);
      tileGraphics.fillRoundedRect(x + 10, y + height - 6, width - 12, 10, 8);
    } else if (coordinate.side === "left") {
      tileGraphics.fillStyle(accent, 1);
      tileGraphics.fillRoundedRect(x + width - 6, y + 10, 10, height - 12, 8);
    } else {
      tileGraphics.fillStyle(accent, 1);
      tileGraphics.fillRoundedRect(x + 10, y + 10, 10, height - 12, 8);
    }

    if (tile.type === "property" && property?.hasHotel) {
      tileGraphics.lineStyle(3, 0xf59e0b, 0.92);
      tileGraphics.strokeRoundedRect(bounds.x + 4, bounds.y + 4, width - 8, height - 8, 16);
    } else if (tile.type === "property" && (property?.houseCount ?? 0) > 0) {
      tileGraphics.lineStyle(2, ownerColor, 0.58);
      tileGraphics.strokeRoundedRect(bounds.x + 4, bounds.y + 4, width - 8, height - 8, 16);
    }

    if (mapGod) {
      tileGraphics.lineStyle(2, parseColorHex(mapGod.colorHex), 0.72);
      tileGraphics.strokeRoundedRect(bounds.x + 7, bounds.y + 7, width - 14, height - 14, 14);
    }

    this.staticLayer.add(tileGraphics);

    const inflationIndex = this.state.snapshot?.game?.inflation.index ?? 1;
    const meta = getTileMetaLabel(tile, inflationIndex);
    const indexText = this.add.text(x + 16, y + 16, `${tile.index}`.padStart(2, "0"), {
      fontFamily: "Arial",
      fontSize: `${indexFontSize}px`,
      color: "#94a3b8",
    });
    const nameText = this.add.text(x + 16, y + 32, tile.name, {
      fontFamily: "Arial",
      fontSize: `${nameFontSize}px`,
      fontStyle: "bold",
      color: "#0f172a",
      wordWrap: { width: nameWrapWidth },
    });
    const metaText = this.add.text(x + 16, y + height - 30, meta, {
      fontFamily: "Arial",
      fontSize: `${metaFontSize}px`,
      color: "#475569",
    });

    const iconZoneTop = nameText.y + nameText.height + 6;
    const iconZoneBottom = metaText.y - 8;

    this.drawTileFeatureIcon(tile, bounds, accent, iconZoneTop, iconZoneBottom, property);
    this.staticLayer.add(indexText);
    this.staticLayer.add(nameText);
    this.staticLayer.add(metaText);
    this.drawPropertyStructures(tile, bounds, property, ownerColor);

    if (mapGod) {
      this.drawMapGodMarker(bounds, mapGod);
    }

    if (owner) {
      this.drawOwnerBadge(bounds, owner, ownerColor);
    }
  }

  private drawTileFeatureIcon(
    tile: BoardTile,
    bounds: ReturnType<MatchScene["getTileBounds"]>,
    accentColor: number,
    minY: number,
    maxY: number,
    propertyState?: GameSnapshotView["properties"][number] | null,
  ) {
    if (tile.type === "property") {
      this.drawPropertyBadge(bounds, accentColor, minY, maxY, propertyState);
      return;
    }

    const iconKey = getTileIconTextureKey(tile.type);
    if (!this.textures.exists(iconKey)) {
      return;
    }

    const availableHeight = Math.max(0, maxY - minY);
    if (availableHeight < 8) {
      return;
    }

    const iconSize = Phaser.Math.Clamp(
      Math.min(bounds.width * 0.34, availableHeight * 0.8),
      12,
      28,
    );
    const plateWidth = iconSize * 1.84;
    const plateHeight = iconSize * 1.32;
    const minCenterY = minY + plateHeight * 0.5;
    const maxCenterY = maxY - plateHeight * 0.5;

    if (minCenterY > maxCenterY) {
      return;
    }

    const iconX = bounds.x + bounds.width * 0.5;
    const iconY = Phaser.Math.Clamp(bounds.y + bounds.height * 0.62, minCenterY, maxCenterY);
    const plateGlow = this.add.graphics();
    plateGlow.fillStyle(accentColor, 0.12);
    plateGlow.fillRoundedRect(
      iconX - plateWidth * 0.5 - 4,
      iconY - plateHeight * 0.5 - 4,
      plateWidth + 8,
      plateHeight + 8,
      10,
    );
    const plateShadow = this.add.graphics();
    plateShadow.fillStyle(0x0f172a, 0.08);
    plateShadow.fillRoundedRect(
      iconX - plateWidth * 0.5 + 2,
      iconY - plateHeight * 0.5 + 3,
      plateWidth,
      plateHeight,
      8,
    );
    const plate = this.add.graphics();
    plate.fillStyle(0xffffff, 0.95);
    plate.fillRoundedRect(
      iconX - plateWidth * 0.5,
      iconY - plateHeight * 0.5,
      plateWidth,
      plateHeight,
      8,
    );
    plate.lineStyle(2, accentColor, 0.35);
    plate.strokeRoundedRect(
      iconX - plateWidth * 0.5,
      iconY - plateHeight * 0.5,
      plateWidth,
      plateHeight,
      8,
    );
    const icon = this.add.image(iconX, iconY, iconKey);
    icon.setDisplaySize(iconSize * 1.36, iconSize * 1.36);
    this.staticLayer.add([plateGlow, plateShadow, plate, icon]);
  }

  private drawPropertyBadge(
    bounds: ReturnType<MatchScene["getTileBounds"]>,
    accentColor: number,
    minY: number,
    maxY: number,
    propertyState?: GameSnapshotView["properties"][number] | null,
  ) {
    if (propertyState && (propertyState.houseCount > 0 || propertyState.hasHotel)) {
      return;
    }

    const availableHeight = Math.max(0, maxY - minY);
    if (availableHeight < 12) {
      return;
    }

    const badgeWidth = Phaser.Math.Clamp(bounds.width * 0.5, 28, 44);
    const badgeHeight = Phaser.Math.Clamp(Math.min(availableHeight * 0.62, bounds.height * 0.34), 18, 28);
    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = Phaser.Math.Clamp(
      bounds.y + bounds.height * 0.6,
      minY + badgeHeight * 0.5,
      maxY - badgeHeight * 0.5,
    );

    const glow = this.add.graphics();
    glow.fillStyle(accentColor, 0.1);
    glow.fillRoundedRect(
      centerX - badgeWidth * 0.5 - 4,
      centerY - badgeHeight * 0.5 - 4,
      badgeWidth + 8,
      badgeHeight + 8,
      10,
    );

    const plate = this.add.graphics();
    plate.fillStyle(0xffffff, propertyState?.ownerPlayerId ? 0.98 : 0.94);
    plate.fillRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      9,
    );
    plate.lineStyle(2, accentColor, 0.34);
    plate.strokeRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      9,
    );
    plate.fillStyle(accentColor, propertyState?.ownerPlayerId ? 0.22 : 0.14);
    plate.fillRoundedRect(
      centerX - badgeWidth * 0.42,
      centerY - badgeHeight * 0.34,
      badgeWidth * 0.84,
      badgeHeight * 0.68,
      7,
    );

    const iconGraphics = this.add.graphics();
    this.drawHouseIcon(
      iconGraphics,
      centerX,
      centerY - 1,
      Phaser.Math.Clamp(badgeHeight * 0.78, 12, 18),
      accentColor,
    );

    this.staticLayer.add([glow, plate, iconGraphics]);
  }

  private drawOwnerBadge(
    bounds: ReturnType<MatchScene["getTileBounds"]>,
    owner: PlayerGameView,
    ownerColor: number,
  ) {
    const badgeWidth = 24;
    const badgeHeight = 18;
    let centerX = bounds.x + bounds.width - 18;
    let centerY = bounds.y + 18;

    if (bounds.side === "bottom") {
      centerY = bounds.y + bounds.height - 18;
    } else if (bounds.side === "left") {
      centerX = bounds.x + 18;
    }

    const shadow = this.add.graphics();
    shadow.fillStyle(0x0f172a, 0.16);
    shadow.fillRoundedRect(
      centerX - badgeWidth * 0.5 + 2,
      centerY - badgeHeight * 0.5 + 3,
      badgeWidth,
      badgeHeight,
      8,
    );

    const badge = this.add.graphics();
    badge.fillStyle(ownerColor, 1);
    badge.fillRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      8,
    );
    badge.lineStyle(2, 0xffffff, 0.96);
    badge.strokeRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      8,
    );

    const label = this.add
      .text(centerX, centerY - 1, owner.character.piece, {
        fontFamily: "Arial",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.staticLayer.add([shadow, badge, label]);
  }

  private drawHouseIcon(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    size: number,
    accentColor: number,
  ) {
    const roofY = centerY - size * 0.48;
    const bodyY = centerY - size * 0.16;
    const bodyHeight = size * 0.54;
    graphics.fillStyle(0xf8fafc, 0.98);
    graphics.fillRoundedRect(centerX - size * 0.38, bodyY, size * 0.76, bodyHeight, 4);
    graphics.fillStyle(accentColor, 1);
    graphics.fillTriangle(
      centerX - size * 0.48,
      bodyY + size * 0.06,
      centerX,
      roofY,
      centerX + size * 0.48,
      bodyY + size * 0.06,
    );
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillRect(centerX - size * 0.08, bodyY + size * 0.2, size * 0.16, size * 0.22);
    graphics.fillStyle(0xbfdbfe, 1);
    graphics.fillRect(centerX - size * 0.24, bodyY + size * 0.14, size * 0.12, size * 0.12);
    graphics.fillRect(centerX + size * 0.12, bodyY + size * 0.14, size * 0.12, size * 0.12);
  }

  private drawHotelIcon(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    size: number,
    accentColor: number,
  ) {
    graphics.fillStyle(0xfef3c7, 0.98);
    graphics.fillRoundedRect(centerX - size * 0.34, centerY - size * 0.54, size * 0.68, size * 1.04, 6);
    graphics.fillStyle(accentColor, 0.96);
    graphics.fillRoundedRect(centerX - size * 0.28, centerY - size * 0.68, size * 0.56, size * 0.16, 6);
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillRoundedRect(centerX - size * 0.18, centerY - size * 0.82, size * 0.36, size * 0.14, 5);
    graphics.fillStyle(0xffffff, 0.94);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        graphics.fillRect(
          centerX - size * 0.2 + col * size * 0.18,
          centerY - size * 0.32 + row * size * 0.22,
          size * 0.1,
          size * 0.1,
        );
      }
    }
    graphics.fillStyle(0x92400e, 1);
    graphics.fillRoundedRect(centerX - size * 0.09, centerY + size * 0.12, size * 0.18, size * 0.24, 4);
  }

  private drawPropertyStructures(
    tile: BoardTile,
    bounds: ReturnType<MatchScene["getTileBounds"]>,
    propertyState: GameSnapshotView["properties"][number] | null | undefined,
    accentColor: number,
  ) {
    if (
      tile.type !== "property" ||
      !propertyState ||
      (propertyState.houseCount <= 0 && !propertyState.hasHotel)
    ) {
      return;
    }

    const graphics = this.add.graphics();
    const baseY = bounds.y + bounds.height * 0.56;
    const baseWidth = Math.min(bounds.width * 0.54, 42);
    graphics.fillStyle(0x1e293b, 0.12);
    graphics.fillRoundedRect(
      bounds.x + bounds.width * 0.5 - baseWidth * 0.5,
      baseY + 10,
      baseWidth,
      8,
      4,
    );

    if (propertyState.hasHotel) {
      const hotelSize = Phaser.Math.Clamp(Math.min(bounds.width, bounds.height) * 0.38, 20, 30);
      graphics.fillStyle(0xf59e0b, 0.16);
      graphics.fillRoundedRect(
        bounds.x + bounds.width * 0.5 - hotelSize * 0.6,
        baseY - hotelSize * 0.78,
        hotelSize * 1.2,
        hotelSize * 1.36,
        10,
      );
      this.drawHotelIcon(graphics, bounds.x + bounds.width * 0.5, baseY, hotelSize, accentColor);
      this.staticLayer.add(graphics);
      this.staticLayer.add(
        this.add
          .text(bounds.x + bounds.width * 0.5, baseY - hotelSize * 0.6, "酒", {
            fontFamily: "Arial",
            fontSize: `${Math.max(11, Math.round(hotelSize * 0.26))}px`,
            fontStyle: "bold",
            color: "#ffffff",
          })
          .setOrigin(0.5),
      );
      return;
    }

    const houseSize = Phaser.Math.Clamp(Math.min(bounds.width, bounds.height) * 0.24, 12, 19);
    const columns = propertyState.houseCount <= 2 ? propertyState.houseCount : 2;
    const rows = Math.ceil(propertyState.houseCount / 2);
    const spacingX = houseSize + 4;
    const spacingY = houseSize * 0.82 + 4;
    const startX = bounds.x + bounds.width * 0.5 - ((columns - 1) * spacingX) / 2;
    const startY = baseY - ((rows - 1) * spacingY) / 2;

    for (let index = 0; index < propertyState.houseCount; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      this.drawHouseIcon(
        graphics,
        startX + column * spacingX,
        startY + row * spacingY,
        houseSize,
        accentColor,
      );
    }

    this.staticLayer.add(graphics);
  }

  private addTileInteraction(
    tile: BoardTile,
    layout: ReturnType<typeof getBoardLayout>,
    game: GameSnapshotView,
  ) {
    const bounds = this.getTileBounds(layout, tile.index);
    const zone = this.add.zone(bounds.x, bounds.y, bounds.width, bounds.height);
    zone.setOrigin(0, 0);
    zone.setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => {
      if (this.pinnedTileIndex !== null) {
        return;
      }

      if (this.hoveredTileIndex !== tile.index) {
        this.hoveredTileIndex = tile.index;
        this.drawTileInspection(game);
      }
    });
    zone.on("pointerout", () => {
      if (this.pinnedTileIndex !== null) {
        return;
      }

      if (this.hoveredTileIndex === tile.index) {
        this.hoveredTileIndex = null;
        this.drawTileInspection(game);
      }
    });
    zone.on("pointerdown", () => {
      this.pinnedTileIndex =
        this.pinnedTileIndex === tile.index ? null : tile.index;
      this.hoveredTileIndex = tile.index;
      this.drawTileInspection(game);
    });
    this.interactionLayer.add(zone);
  }

  private getTileBounds(
    layout: ReturnType<typeof getBoardLayout>,
    tileIndex: number,
  ) {
    const coordinate = getTileCoordinate(tileIndex);
    return {
      x: layout.originX + coordinate.x * layout.cellWidth + 4,
      y: layout.originY + coordinate.y * layout.cellHeight + 4,
      width: layout.cellWidth - 8,
      height: layout.cellHeight - 8,
      side: coordinate.side,
    };
  }

  private findMapGod(game: GameSnapshotView, tileIndex: number) {
    return game.mapGods.find((item) => item.tileIndex === tileIndex) ?? null;
  }

  private drawMapGodMarker(
    bounds: ReturnType<MatchScene["getTileBounds"]>,
    mapGod: GameSnapshotView["mapGods"][number],
  ) {
    const color = parseColorHex(mapGod.colorHex);
    const horizontal = bounds.side === "top" || bounds.side === "bottom";
    const badgeText = mapGod.name.slice(0, 1);
    const badgeWidth = horizontal ? 34 : 24;
    const badgeHeight = horizontal ? 18 : 24;
    let centerX = bounds.x + bounds.width * 0.5;
    let centerY = bounds.y + bounds.height * 0.5;

    if (bounds.side === "top") {
      centerY = bounds.y + bounds.height - 18;
    } else if (bounds.side === "bottom") {
      centerY = bounds.y + 18;
    } else if (bounds.side === "left") {
      centerX = bounds.x + bounds.width - 18;
    } else {
      centerX = bounds.x + 18;
    }

    const badge = this.add.graphics();
    badge.fillStyle(color, 0.16);
    badge.fillRoundedRect(
      centerX - badgeWidth * 0.5 - 4,
      centerY - badgeHeight * 0.5 - 4,
      badgeWidth + 8,
      badgeHeight + 8,
      10,
    );
    badge.fillStyle(color, 0.94);
    badge.fillRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      9,
    );
    badge.lineStyle(2, 0xffffff, 0.92);
    badge.strokeRoundedRect(
      centerX - badgeWidth * 0.5,
      centerY - badgeHeight * 0.5,
      badgeWidth,
      badgeHeight,
      9,
    );

    const label = this.add
      .text(centerX, centerY - 1, badgeText, {
        fontFamily: "Arial",
        fontSize: horizontal ? "10px" : "11px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.staticLayer.add(badge);
    this.staticLayer.add(label);
  }

  private getActiveTileIndex() {
    return this.state.focusedTileIndex ?? this.pinnedTileIndex ?? this.hoveredTileIndex;
  }

  private getBuildPromptState(game: GameSnapshotView) {
    const viewerId = this.state.snapshot?.currentPlayer?.id;
    if (!viewerId || game.currentPlayerId !== viewerId) {
      return null;
    }

    if (game.phase !== "WAITING_FOR_PROPERTY_DECISION" || game.pendingTile?.type !== "property") {
      return null;
    }

    const viewer = game.players.find((player) => player.id === viewerId) ?? null;
    const propertyState = this.findPropertyState(game, game.pendingTile.index);
    const buildCost = viewer
      ? isCaishenGodKey(viewer.activeGod?.key)
        ? 0
        : getEffectiveHouseCost(game.pendingTile, game.inflation.index)
      : 0;
    if (
      !viewer ||
      !propertyState ||
      propertyState.ownerPlayerId !== viewer.id ||
      propertyState.mortgaged ||
      propertyState.hasHotel ||
      isShuaishenGodKey(viewer.activeGod?.key) ||
      viewer.cash < buildCost
    ) {
      return null;
    }

    return {
      viewer,
      tile: game.pendingTile,
      propertyState,
    };
  }

  private findPropertyState(game: GameSnapshotView, tileIndex: number) {
    return game.properties.find((item) => item.tileIndex === tileIndex) ?? null;
  }

  private countOwnedRailroads(game: GameSnapshotView, ownerPlayerId: string) {
    return game.properties.filter((property) => {
      if (property.ownerPlayerId !== ownerPlayerId) {
        return false;
      }

      return game.board[property.tileIndex]?.type === "railroad";
    }).length;
  }

  private countOwnedGroup(
    game: GameSnapshotView,
    ownerPlayerId: string,
    group: string,
  ) {
    return game.properties.filter((property) => {
      if (property.ownerPlayerId !== ownerPlayerId) {
        return false;
      }

      const boardTile = game.board[property.tileIndex];
      return boardTile?.type === "property" && boardTile.group === group;
    }).length;
  }

  private isOwnerInJail(game: GameSnapshotView, ownerPlayerId?: string | null) {
    if (!ownerPlayerId) {
      return false;
    }

    return (game.players.find((player) => player.id === ownerPlayerId)?.inJailTurns ?? 0) > 0;
  }

  private isOwnerSleepwalking(game: GameSnapshotView, ownerPlayerId?: string | null) {
    if (!ownerPlayerId) {
      return false;
    }

    return (game.players.find((player) => player.id === ownerPlayerId)?.sleepwalkingTurns ?? 0) > 0;
  }

  private calculateDisplayedRent(
    game: GameSnapshotView,
    tile: BoardTile,
    tileState: ReturnType<MatchScene["findPropertyState"]>,
  ) {
    const inflationIndex = game.inflation.index;
    if (tile.type === "railroad") {
      if (!tileState?.ownerPlayerId || tileState.mortgaged) {
        return getEffectiveRailroadRent(1, inflationIndex);
      }

      if (
        this.isOwnerInJail(game, tileState.ownerPlayerId) ||
        this.isOwnerSleepwalking(game, tileState.ownerPlayerId)
      ) {
        return 0;
      }

      const railroadCount = this.countOwnedRailroads(game, tileState.ownerPlayerId);
      return getEffectiveRailroadRent(railroadCount, inflationIndex);
    }

    if (tile.type !== "property") {
      return null;
    }

    if (tileState?.mortgaged) {
      return 0;
    }

    if (
      this.isOwnerInJail(game, tileState?.ownerPlayerId) ||
      this.isOwnerSleepwalking(game, tileState?.ownerPlayerId)
    ) {
      return 0;
    }

    const ownedInGroup = tileState?.ownerPlayerId
      ? this.countOwnedGroup(game, tileState.ownerPlayerId, tile.group)
      : undefined;
    return getEffectivePropertyRent(
      tile,
      tileState?.houseCount ?? 0,
      tileState?.hasHotel ?? false,
      ownedInGroup,
      inflationIndex,
    );
  }

  private getBuildingLevelLabel(
    tile: BoardTile,
    tileState: ReturnType<MatchScene["findPropertyState"]>,
  ) {
    if (tile.type !== "property") {
      return "不可建造";
    }

    if (tileState?.hasHotel) {
      return "酒店";
    }

    if ((tileState?.houseCount ?? 0) > 0) {
      return `${tileState?.houseCount ?? 0} 层`;
    }

    if (!tileState?.ownerPlayerId) {
      return "未购买";
    }

    return "空地";
  }

  private buildTileInfo(game: GameSnapshotView, tile: BoardTile) {
    const snapshot = this.state.snapshot;
    const tileState = this.findPropertyState(game, tile.index);
    const mapGod = this.findMapGod(game, tile.index);
    const owner = tileState?.ownerPlayerId
      ? game.players.find((player) => player.id === tileState.ownerPlayerId) ?? null
      : null;
    const subtitle = `${`${tile.index}`.padStart(2, "0")} 号地块 · ${getTileTypeLabel(tile)}`;
    const lines = [tile.description];

    switch (tile.type) {
      case "property": {
        const inflationIndex = game.inflation.index;
        const rent =
          this.calculateDisplayedRent(game, tile, tileState) ??
          getEffectivePropertyRent(tile, 0, false, undefined, inflationIndex);
        lines.push(`地价：${formatMoney(getEffectiveTilePrice(tile, inflationIndex))}`);
        lines.push(
          tileState?.ownerPlayerId
            ? `当前过路费：${formatMoney(rent)}`
            : `购买后基础过路费：${formatMoney(
                getEffectivePropertyRent(tile, 0, false, undefined, inflationIndex),
              )}`,
        );
        if (owner?.inJailTurns && owner.inJailTurns > 0) {
          lines.push(`业主状态：${owner.name} 正在监狱中，当前不收路费`);
        }
        if (owner?.abductedTurns && owner.abductedTurns > 0) {
          lines.push(`业主状态：${owner.name} 被外星人抓走，当前不收路费`);
        }
        if (owner?.sleepwalkingTurns && owner.sleepwalkingTurns > 0) {
          lines.push(`业主状态：${owner.name} 正在梦游中，当前不收路费`);
        }
        lines.push(`当前状态：${this.getBuildingLevelLabel(tile, tileState)}`);
        lines.push(`建造费用：${formatMoney(getEffectiveHouseCost(tile, inflationIndex))}`);
        lines.push(
          `租金表：${[
            getEffectivePropertyRent(tile, 0, false, undefined, inflationIndex),
            ...tile.houseRents.map((_, houseIndex) =>
              getEffectivePropertyRent(tile, houseIndex + 1, false, undefined, inflationIndex),
            ),
            getEffectivePropertyRent(tile, 0, true, undefined, inflationIndex),
          ]
            .map((amount) => amount.toString())
            .join(" / ")}`,
        );
        break;
      }
      case "railroad": {
        const inflationIndex = game.inflation.index;
        const rent =
          this.calculateDisplayedRent(game, tile, tileState) ??
          getEffectiveRailroadRent(1, inflationIndex);
        const railroadCount = owner
          ? this.countOwnedRailroads(game, owner.id)
          : 0;
        lines.push(`地价：${formatMoney(getEffectiveTilePrice(tile, inflationIndex))}`);
        lines.push(`当前过路费：${formatMoney(rent)}`);
        if (owner?.inJailTurns && owner.inJailTurns > 0) {
          lines.push(`业主状态：${owner.name} 正在监狱中，当前不收路费`);
        }
        if (owner?.abductedTurns && owner.abductedTurns > 0) {
          lines.push(`业主状态：${owner.name} 被外星人抓走，当前不收路费`);
        }
        if (owner?.sleepwalkingTurns && owner.sleepwalkingTurns > 0) {
          lines.push(`业主状态：${owner.name} 正在梦游中，当前不收路费`);
        }
        lines.push(`持有铁路：${owner ? `${railroadCount} 条` : "暂无"}`);
        lines.push(
          `租金表：1 条 ${getEffectiveRailroadRent(1, inflationIndex)} / 2 条 ${getEffectiveRailroadRent(2, inflationIndex)}`,
        );
        lines.push("铁路规则：同一玩家同时拥有两条铁路时，过路费翻倍。");
        lines.push("层数：不可建造");
        break;
      }
      case "tax":
        lines.push(`停留费用：${formatMoney(getEffectiveTaxAmount(tile, game.inflation.index))}`);
        break;
      case "start":
        lines.push(
          `经过奖励：${formatMoney(
            getEffectivePassStartSalary(snapshot?.settings.passStartSalary ?? 0, game.inflation.index),
          )}`,
        );
        break;
      case "bank":
        lines.push("停留效果：可存款、取款、贷款与还款。");
        lines.push("规则：每月 1 号自动发放 10% 存款利息，贷款会在次月 1 号自动扣回本息。");
        lines.push("物价指数只会影响罚金、税金和过路费，银行金额保持固定。");
        break;
      case "magic":
        lines.push("停留效果：随机请来土地公、天使、财神系、福神系，或把破坏神、衰神、穷神挂到别人头上。");
        lines.push("土地公、天使和破坏神都只会对最终停下的位置生效，不会影响沿路经过的地块。");
        lines.push("若土地公落点原本有主，仍然要先付过路费，之后才会把地收走。");
        lines.push(`神仙持续：${GOD_DURATION_TURNS} 天。`);
        break;
      case "chance":
        lines.push("停留效果：抽 1 张机会卡，通常偏向移动、赚钱、拿卡或突发转机。");
        lines.push("有些机会牌会立刻把你送到铁路、道具店或其他格子，并继续结算落点效果。");
        break;
      case "community":
        lines.push("停留效果：抽 1 张命运牌，内容更偏生活事件、补助、罚款与小幅位移。");
        lines.push("如果命运牌把你送到银行、游乐场或彩票屋，也会继续触发对应停留效果。");
        break;
      case "news":
        lines.push("停留效果：触发一条即时新闻事件，可能发通告费、缴罚款、送道具、送好神、被外星人抓走，或直接坐牢。");
        lines.push("地产类新闻还可能奖励大地主、触发台风修缮，或让某块有建筑的地产因水土流失倒塌回空地。");
        break;
      case "freeCard":
        lines.push("停留效果：立刻免费获得一张道具卡。");
        break;
      case "amusement":
        lines.push("停留效果：选择小游戏摊位，赢取现金或道具。");
        break;
      case "shop":
        lines.push("停留效果：商店货架会随机刷新。");
        lines.push("本次可从随机货架里挑选 1 件道具购买。");
        break;
      case "lottery":
        lines.push(`彩券价格：${formatMoney(game.lottery.ticketPrice)}`);
        lines.push(`当前奖池：${formatMoney(game.lottery.jackpot)}`);
        lines.push(`距离开奖：${game.lottery.turnsUntilDraw} 回合`);
        lines.push(
          `已售彩券：${game.lottery.tickets.length > 0 ? game.lottery.tickets.map((ticket) => ticket.shortLabel).join(" / ") : "本期暂时无人下注"}`,
        );
        break;
      case "jail":
        lines.push("关押规则：固定关 3 天，不能交保释金；待满后当回合恢复掷骰。");
        lines.push("特殊规则：只要有玩家踩到监狱，里面所有人都会被立刻放出来。");
        break;
      case "freeParking":
        lines.push(`当前奖金池：${formatMoney(snapshot?.settings.parkingJackpot ?? 0)}`);
        break;
      case "goToJail":
        lines.push("停留效果：直接送进监狱。");
        break;
      default:
        break;
    }

    if (mapGod) {
      lines.push(`地图神明：${mapGod.name}（还会停留 ${mapGod.turnsRemaining} 回合）`);
      lines.push(`神明效果：${mapGod.description}`);
    }

    if (tile.type === "property" || tile.type === "railroad") {
      lines.push(
        `拥有者：${
          owner
            ? `${owner.character.name} - ${owner.name}`
            : "暂无"
        }`,
      );
      lines.push(`状态：${tileState?.mortgaged ? "已抵押" : "正常"}`);
    }

    return { subtitle, lines };
  }

  private drawTileInspection(game: GameSnapshotView) {
    this.inspectionLayer.removeAll(true);

    const activeTileIndex = this.getActiveTileIndex();
    if (activeTileIndex === null) {
      return;
    }

    const tile = game.board[activeTileIndex];
    if (!tile) {
      return;
    }

    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const compact = this.scale.width < 1100;
    const bounds = this.getTileBounds(layout, tile.index);
    const accent = getTileAccentColor(tile);
    const { subtitle, lines } = this.buildTileInfo(game, tile);

    const highlight = this.add.graphics();
    highlight.fillStyle(accent, 0.12);
    highlight.fillRoundedRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4, 20);
    highlight.lineStyle(4, accent, 0.94);
    highlight.strokeRoundedRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4, 20);
    this.inspectionLayer.add(highlight);

    const panelWidth = compact ? 228 : 264;
    const panelPadding = compact ? 14 : 16;
    const contentWidth = panelWidth - panelPadding * 2;
    const maxPanelHeight = Math.min(layout.boardHeight - 20, compact ? 268 : 320);
    const titleText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontStyle: "bold",
      color: "#0f172a",
    });
    const titleFit = fitWrappedText(titleText, {
      content: tile.name,
      maxWidth: contentWidth,
      maxHeight: compact ? 42 : 48,
      preferredFontSize: compact ? 16 : 18,
      minFontSize: compact ? 13 : 14,
      preferredLineSpacing: 2,
      minLineSpacing: 0,
    });
    const subtitleText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      color: "#475569",
    });
    const subtitleFit = fitWrappedText(subtitleText, {
      content: subtitle,
      maxWidth: contentWidth,
      maxHeight: compact ? 24 : 28,
      preferredFontSize: compact ? 10 : 11,
      minFontSize: 9,
      preferredLineSpacing: 2,
      minLineSpacing: 0,
    });
    const footerText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      color: "#64748b",
    });
    const footerFit = fitWrappedText(footerText, {
      content:
        this.state.focusedTileIndex === tile.index
          ? "已从地产列表定位，关闭地产弹窗后会恢复普通查看"
          : this.pinnedTileIndex === tile.index
          ? "已固定，点击同一地块可取消固定"
          : "点击地块可固定详情",
      maxWidth: contentWidth,
      maxHeight: compact ? 24 : 28,
      preferredFontSize: compact ? 10 : 11,
      minFontSize: 9,
      preferredLineSpacing: 2,
      minLineSpacing: 0,
    });
    const bodyText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      color: "#1e293b",
    });
    const bodyMaxHeight = Math.max(
      compact ? 86 : 112,
      maxPanelHeight -
        panelPadding * 2 -
        titleFit.textHeight -
        subtitleFit.textHeight -
        footerFit.textHeight -
        28,
    );
    fitWrappedText(bodyText, {
      content: lines.join("\n"),
      maxWidth: contentWidth,
      maxHeight: bodyMaxHeight,
      preferredFontSize: compact ? 11 : 12,
      minFontSize: compact ? 9 : 10,
      preferredLineSpacing: 5,
      minLineSpacing: 1,
    });

    const panelHeight =
      panelPadding * 2 +
      titleText.height +
      subtitleText.height +
      bodyText.height +
      footerText.height +
      28;

    let panelX = bounds.x;
    let panelY = bounds.y;

    if (bounds.side === "left") {
      panelX = bounds.x + bounds.width + 12;
      panelY = bounds.y + bounds.height * 0.5 - panelHeight * 0.5;
    } else if (bounds.side === "right") {
      panelX = bounds.x - panelWidth - 12;
      panelY = bounds.y + bounds.height * 0.5 - panelHeight * 0.5;
    } else if (bounds.side === "top") {
      panelX = bounds.x + bounds.width * 0.5 - panelWidth * 0.5;
      panelY = bounds.y + bounds.height + 12;
    } else {
      panelX = bounds.x + bounds.width * 0.5 - panelWidth * 0.5;
      panelY = bounds.y - panelHeight - 12;
    }

    panelX = Phaser.Math.Clamp(
      panelX,
      layout.originX + 10,
      layout.originX + layout.boardWidth - panelWidth - 10,
    );
    panelY = Phaser.Math.Clamp(
      panelY,
      layout.originY + 10,
      layout.originY + layout.boardHeight - panelHeight - 10,
    );

    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.97);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 22);
    panel.fillStyle(accent, 0.16);
    panel.fillRoundedRect(panelX + 12, panelY + 12, panelWidth - 24, 12, 8);
    panel.lineStyle(2, accent, 0.4);
    panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 22);

    titleText.setPosition(panelX + panelPadding, panelY + 28);
    subtitleText.setPosition(panelX + panelPadding, titleText.y + titleText.height + 4);
    bodyText.setPosition(panelX + panelPadding, subtitleText.y + subtitleText.height + 12);
    footerText.setPosition(panelX + panelPadding, panelY + panelHeight - panelPadding - footerText.height);

    this.inspectionLayer.add(panel);
    this.inspectionLayer.add(titleText);
    this.inspectionLayer.add(subtitleText);
    this.inspectionLayer.add(bodyText);
    this.inspectionLayer.add(footerText);
  }

  private getStructureLevel(property: GameSnapshotView["properties"][number]) {
    return property.hasHotel ? 5 : property.houseCount;
  }

  private snapshotStructureStates(game: GameSnapshotView) {
    return new Map<number, StructureVisualState>(
      game.properties.map((property) => [
        property.tileIndex,
        {
          level: this.getStructureLevel(property),
          hasHotel: property.hasHotel,
          ownerPlayerId: property.ownerPlayerId,
        },
      ]),
    );
  }

  private maybePlayStructureEffects(game: GameSnapshotView, latestEvent: EventView | null) {
    const currentStates = this.snapshotStructureStates(game);

    if (!this.initializedStructureTracking) {
      this.initializedStructureTracking = true;
      this.previousStructureStates.clear();
      currentStates.forEach((state, tileIndex) => {
        this.previousStructureStates.set(tileIndex, state);
      });
      return;
    }

    const buildEffects: Array<{ tileIndex: number; hotelUpgrade: boolean }> = [];
    const demolitionEffects: Array<{ tileIndex: number; explosive: boolean }> = [];

    currentStates.forEach((state, tileIndex) => {
      const previous = this.previousStructureStates.get(tileIndex) ?? {
        level: 0,
        hasHotel: false,
        ownerPlayerId: null,
      };

      if (state.level > previous.level) {
        buildEffects.push({
          tileIndex,
          hotelUpgrade: state.hasHotel && !previous.hasHotel,
        });
        return;
      }

      if (state.level < previous.level) {
        demolitionEffects.push({
          tileIndex,
          explosive:
            latestEvent?.eventType === "declareBankruptcy" ||
            previous.hasHotel ||
            previous.level >= 4 ||
            state.ownerPlayerId === null ||
            state.ownerPlayerId !== previous.ownerPlayerId,
        });
      }
    });

    this.previousStructureStates.clear();
    currentStates.forEach((state, tileIndex) => {
      this.previousStructureStates.set(tileIndex, state);
    });

    buildEffects
      .sort((left, right) => left.tileIndex - right.tileIndex)
      .forEach((effect, index) => {
        this.time.delayedCall(index * 110, () => {
          this.playConstructionEffect(effect.tileIndex, effect.hotelUpgrade);
        });
      });

    demolitionEffects
      .sort((left, right) => left.tileIndex - right.tileIndex)
      .forEach((effect, index) => {
        this.time.delayedCall(index * 140, () => {
          this.playDemolitionEffect(effect.tileIndex, effect.explosive);
        });
      });
  }

  private playConstructionEffect(tileIndex: number, hotelUpgrade: boolean) {
    this.runtime.audio.play(hotelUpgrade ? "hotel" : "build");

    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const bounds = this.getTileBounds(layout, tileIndex);
    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = bounds.y + bounds.height * 0.5;
    const accentColor = hotelUpgrade ? 0xf59e0b : 0x22c55e;
    const size = Phaser.Math.Clamp(Math.min(bounds.width, bounds.height) * 0.72, 36, 64);

    const glow = this.add.circle(centerX, centerY, size * 0.6, accentColor, 0.22);
    glow.setStrokeStyle(3, accentColor, 0.9);

    const upgradeHalo = hotelUpgrade
      ? this.add.circle(centerX, centerY, size * 0.44, 0x000000, 0).setStrokeStyle(4, 0xfde68a, 0.92)
      : null;

    const upgradeRays = hotelUpgrade ? this.add.graphics() : null;
    if (upgradeRays) {
      upgradeRays.setPosition(centerX, centerY);
      upgradeRays.lineStyle(4, 0xfef08a, 0.9);
      for (let index = 0; index < 8; index += 1) {
        const angle = Phaser.Math.DegToRad(index * 45);
        const innerRadius = size * 0.36;
        const outerRadius = size * 0.66;
        upgradeRays.lineBetween(
          Math.cos(angle) * innerRadius,
          Math.sin(angle) * innerRadius,
          Math.cos(angle) * outerRadius,
          Math.sin(angle) * outerRadius,
        );
      }
    }

    const upgradeCrown = hotelUpgrade ? this.add.graphics() : null;
    if (upgradeCrown) {
      upgradeCrown.setPosition(centerX, centerY - size * 0.54);
      const crownPoints = [
        new Phaser.Math.Vector2(-size * 0.26, size * 0.08),
        new Phaser.Math.Vector2(-size * 0.18, -size * 0.12),
        new Phaser.Math.Vector2(-size * 0.06, size * 0.02),
        new Phaser.Math.Vector2(0, -size * 0.22),
        new Phaser.Math.Vector2(size * 0.06, size * 0.02),
        new Phaser.Math.Vector2(size * 0.18, -size * 0.12),
        new Phaser.Math.Vector2(size * 0.26, size * 0.08),
      ];
      upgradeCrown.fillStyle(0xfde68a, 0.98);
      upgradeCrown.fillPoints(crownPoints, true);
      upgradeCrown.fillRoundedRect(-size * 0.28, size * 0.08, size * 0.56, size * 0.12, 6);
      upgradeCrown.lineStyle(2, 0xffffff, 0.82);
      upgradeCrown.strokePoints(crownPoints, true);
      upgradeCrown.strokeRoundedRect(-size * 0.28, size * 0.08, size * 0.56, size * 0.12, 6);
    }

    const scaffold = this.add.graphics();
    scaffold.lineStyle(3, 0xe2e8f0, 0.96);
    scaffold.strokeRect(centerX - size * 0.38, centerY - size * 0.32, size * 0.76, size * 0.64);
    scaffold.lineBetween(centerX - size * 0.28, centerY - size * 0.32, centerX - size * 0.28, centerY + size * 0.32);
    scaffold.lineBetween(centerX + size * 0.28, centerY - size * 0.32, centerX + size * 0.28, centerY + size * 0.32);
    scaffold.lineBetween(centerX - size * 0.38, centerY, centerX + size * 0.38, centerY);
    scaffold.lineBetween(centerX - size * 0.38, centerY - size * 0.32, centerX + size * 0.38, centerY + size * 0.32);
    scaffold.lineBetween(centerX + size * 0.38, centerY - size * 0.32, centerX - size * 0.38, centerY + size * 0.32);

    const barrier = this.add.graphics();
    const barrierWidth = size * 0.9;
    const barrierHeight = size * 0.18;
    const barrierX = centerX - barrierWidth * 0.5;
    const barrierY = centerY + size * 0.38;
    for (let stripe = 0; stripe < 6; stripe += 1) {
      barrier.fillStyle(stripe % 2 === 0 ? 0xfacc15 : 0x0f172a, 0.96);
      barrier.fillRect(
        barrierX + stripe * (barrierWidth / 6),
        barrierY,
        barrierWidth / 6,
        barrierHeight,
      );
    }
    barrier.lineStyle(2, 0xe2e8f0, 0.9);
    barrier.strokeRoundedRect(barrierX, barrierY, barrierWidth, barrierHeight, 6);

    const bannerText = this.add
      .text(centerX, centerY - size * 0.74, hotelUpgrade ? "酒店升级" : "施工中", {
        fontFamily: "Arial",
        fontSize: `${Math.max(14, Math.round(size * 0.28))}px`,
        fontStyle: "bold",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const particles = Array.from({ length: 4 }, (_, index) => {
      const dust = this.add.circle(
        centerX + (index - 1.5) * (size * 0.16),
        centerY + size * 0.28,
        size * 0.12,
        index % 2 === 0 ? 0xe2e8f0 : accentColor,
        0.42,
      );
      return dust;
    });

    const sparklePieces = hotelUpgrade
      ? Array.from({ length: 6 }, () =>
          this.add.rectangle(centerX, centerY - size * 0.12, size * 0.11, size * 0.11, 0xfef08a, 0.95).setAngle(45),
        )
      : [];

    const effectObjects = [glow, scaffold, barrier, bannerText, ...particles, ...sparklePieces];
    if (upgradeHalo) {
      effectObjects.push(upgradeHalo);
    }
    if (upgradeRays) {
      effectObjects.push(upgradeRays);
    }
    if (upgradeCrown) {
      effectObjects.push(upgradeCrown);
    }
    this.movementLayer.add(effectObjects);

    glow.setScale(0.5);
    scaffold.setScale(0.65);
    scaffold.setAlpha(0);
    barrier.setScale(0.4, 1);
    barrier.setAlpha(0);
    upgradeHalo?.setScale(0.4);
    upgradeHalo?.setAlpha(0);
    upgradeRays?.setScale(0.3);
    upgradeRays?.setAlpha(0);
    upgradeCrown?.setScale(0.3);
    upgradeCrown?.setAlpha(0);
    sparklePieces.forEach((sparkle) => {
      sparkle.setScale(0.25);
      sparkle.setAlpha(0);
    });

    this.tweens.add({
      targets: glow,
      scale: 1.8,
      alpha: 0,
      duration: 760,
      ease: "Quad.easeOut",
      onComplete: () => {
        glow.destroy();
      },
    });

    if (hotelUpgrade) {
      this.cameras.main.shake(180, 0.0016);
    }

    this.tweens.add({
      targets: scaffold,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: "Back.easeOut",
    });

    this.tweens.add({
      targets: barrier,
      scaleX: 1,
      alpha: 1,
      duration: 220,
      ease: "Back.easeOut",
    });

    if (upgradeHalo) {
      this.tweens.add({
        targets: upgradeHalo,
        scale: 1.55,
        alpha: 0,
        duration: 760,
        ease: "Quad.easeOut",
        onComplete: () => {
          upgradeHalo.destroy();
        },
      });
    }

    if (upgradeRays) {
      this.tweens.add({
        targets: upgradeRays,
        scale: 1.05,
        alpha: 0.88,
        duration: 220,
        ease: "Quad.easeOut",
        yoyo: true,
        hold: 320,
        onComplete: () => {
          upgradeRays.destroy();
        },
      });
    }

    if (upgradeCrown) {
      const crownStartY = upgradeCrown.y;
      this.tweens.add({
        targets: upgradeCrown,
        scale: 1,
        alpha: 1,
        y: crownStartY - 14,
        duration: 260,
        ease: "Back.easeOut",
        yoyo: true,
        hold: 280,
        onComplete: () => {
          upgradeCrown.destroy();
        },
      });
    }

    this.tweens.add({
      targets: bannerText,
      alpha: 1,
      y: bannerText.y - 10,
      duration: 200,
      ease: "Quad.easeOut",
      yoyo: true,
      hold: 260,
      onComplete: () => {
        bannerText.destroy();
      },
    });

    particles.forEach((particle, index) => {
      this.tweens.add({
        targets: particle,
        y: particle.y - (hotelUpgrade ? 34 : 24) - index * 2,
        x: particle.x + (index - 1.5) * 8,
        alpha: 0,
        scale: 1.4,
        duration: 380 + index * 60,
        ease: "Quad.easeOut",
        onComplete: () => {
          particle.destroy();
        },
      });
    });

    sparklePieces.forEach((sparkle, index) => {
      const angle = Phaser.Math.DegToRad(-70 + index * 28);
      const distance = size * (0.58 + index * 0.05);
      this.tweens.add({
        targets: sparkle,
        x: centerX + Math.cos(angle) * distance,
        y: centerY - size * 0.12 + Math.sin(angle) * distance * 0.7,
        alpha: 0,
        scale: 1.2,
        angle: sparkle.angle + 90,
        duration: 520 + index * 40,
        ease: "Quad.easeOut",
        onComplete: () => {
          sparkle.destroy();
        },
      });
    });

    this.time.delayedCall(560, () => {
      this.tweens.add({
        targets: [scaffold, barrier],
        alpha: 0,
        y: `-=${hotelUpgrade ? 10 : 6}`,
        duration: 220,
        ease: "Quad.easeOut",
        onComplete: () => {
          scaffold.destroy();
          barrier.destroy();
        },
      });
    });
  }

  private playDemolitionEffect(tileIndex: number, explosive: boolean) {
    this.runtime.audio.play(explosive ? "explode" : "demolish");

    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const bounds = this.getTileBounds(layout, tileIndex);
    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = bounds.y + bounds.height * 0.5;
    const size = Phaser.Math.Clamp(Math.min(bounds.width, bounds.height) * 0.78, 42, 72);
    const blastColor = explosive ? 0xfb923c : 0x94a3b8;
    const smokeColor = explosive ? 0x334155 : 0x64748b;

    const flash = this.add.circle(centerX, centerY, size * 0.22, 0xffffff, explosive ? 0.82 : 0.52);
    const shockwave = this.add.circle(centerX, centerY, size * 0.18, 0x000000, 0);
    shockwave.setStrokeStyle(4, blastColor, 0.94);

    const cracks = this.add.graphics();
    cracks.setPosition(centerX, centerY);
    cracks.lineStyle(3, explosive ? 0x7f1d1d : 0x475569, 0.92);
    cracks.lineBetween(-size * 0.32, -size * 0.06, size * 0.28, size * 0.04);
    cracks.lineBetween(-size * 0.1, -size * 0.3, size * 0.06, size * 0.28);
    cracks.lineBetween(-size * 0.26, size * 0.18, -size * 0.02, -size * 0.04);
    cracks.lineBetween(size * 0.18, -size * 0.18, size * 0.34, size * 0.12);
    cracks.lineBetween(-size * 0.06, size * 0.06, size * 0.22, size * 0.26);

    const bannerText = this.add
      .text(centerX, centerY - size * 0.74, explosive ? "爆破拆除" : "拆除中", {
        fontFamily: "Arial",
        fontSize: `${Math.max(14, Math.round(size * 0.26))}px`,
        fontStyle: "bold",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const smokeClouds = Array.from({ length: 6 }, (_, index) =>
      this.add.circle(
        centerX + (index - 2.5) * (size * 0.08),
        centerY + size * 0.08 + Math.abs(index - 2.5) * 4,
        size * (0.11 + (index % 3) * 0.02),
        smokeColor,
        0.34,
      ),
    );

    const debrisPieces = Array.from({ length: 7 }, () =>
      this.add.rectangle(centerX, centerY, size * 0.12, size * 0.06, blastColor, 0.96),
    );

    const effectObjects = [flash, shockwave, cracks, bannerText, ...smokeClouds, ...debrisPieces];
    this.movementLayer.add(effectObjects);

    shockwave.setScale(0.35);
    shockwave.setAlpha(0);
    cracks.setScale(0.5);
    cracks.setAlpha(0);
    bannerText.setScale(0.84);
    this.cameras.main.shake(explosive ? 220 : 140, explosive ? 0.004 : 0.0018);

    this.tweens.add({
      targets: flash,
      scale: explosive ? 3.1 : 2.1,
      alpha: 0,
      duration: explosive ? 300 : 220,
      ease: "Quad.easeOut",
      onComplete: () => {
        flash.destroy();
      },
    });

    this.tweens.add({
      targets: shockwave,
      scale: explosive ? 2.15 : 1.55,
      alpha: 0,
      duration: explosive ? 460 : 320,
      ease: "Quad.easeOut",
      onComplete: () => {
        shockwave.destroy();
      },
    });

    this.tweens.add({
      targets: cracks,
      scale: 1,
      alpha: 1,
      duration: 140,
      ease: "Back.easeOut",
    });

    this.time.delayedCall(240, () => {
      this.tweens.add({
        targets: cracks,
        alpha: 0,
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => {
          cracks.destroy();
        },
      });
    });

    this.tweens.add({
      targets: bannerText,
      alpha: 1,
      y: bannerText.y - 10,
      duration: 180,
      ease: "Quad.easeOut",
      yoyo: true,
      hold: 260,
      onComplete: () => {
        bannerText.destroy();
      },
    });

    smokeClouds.forEach((cloud, index) => {
      this.tweens.add({
        targets: cloud,
        x: cloud.x + (index - 2.5) * (explosive ? 18 : 10),
        y: cloud.y - (explosive ? 32 : 18) - index * 2,
        alpha: 0,
        scale: explosive ? 1.9 : 1.45,
        duration: 420 + index * 40,
        ease: "Quad.easeOut",
        onComplete: () => {
          cloud.destroy();
        },
      });
    });

    debrisPieces.forEach((piece, index) => {
      const angle = Phaser.Math.DegToRad(-120 + index * 40);
      const distance = size * (explosive ? 0.78 : 0.45) * (0.88 + index * 0.04);
      piece.setAngle(Phaser.Math.Between(-35, 35));
      this.tweens.add({
        targets: piece,
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.22,
        scaleY: 0.22,
        angle: piece.angle + Phaser.Math.Between(-150, 150),
        duration: 380 + index * 35,
        ease: "Cubic.easeOut",
        onComplete: () => {
          piece.destroy();
        },
      });
    });
  }

  private maybePlayDiceCeremony(
    game: GameSnapshotView,
    latestEvent: EventView | null,
  ) {
    const rollSequence =
      latestEvent?.eventType === "rollDice" ? latestEvent.sequence : null;

    if (!this.initializedRollTracking) {
      this.initializedRollTracking = true;
      this.lastAnimatedRollSequence = rollSequence;
      return;
    }

    if (rollSequence === null || !game.lastRoll) {
      return;
    }

    if (rollSequence === this.lastAnimatedRollSequence) {
      return;
    }

    this.lastAnimatedRollSequence = rollSequence;
    this.playDiceCeremony(
      game.lastRoll.values,
      game.lastRoll.total,
    );
  }

  private clearDiceCeremony() {
    this.diceRollTimer?.remove(false);
    this.diceResolveTimer?.remove(false);
    this.diceDismissTimer?.remove(false);
    this.diceRollTimer = null;
    this.diceResolveTimer = null;
    this.diceDismissTimer = null;

    if (!this.effectLayer) {
      return;
    }

    for (const child of this.effectLayer.list) {
      this.tweens.killTweensOf(child);
    }

    this.effectLayer.removeAll(true);
  }

  private getVehicleKeyFromRoll(lastRoll: GameSnapshotView["lastRoll"] | null) {
    if (!lastRoll) {
      return null;
    }

    if (lastRoll.values.length >= 3) {
      return "car" as const;
    }

    if (lastRoll.values.length === 2) {
      return "motorcycle" as const;
    }

    return null;
  }

  private buildVehicleAccessory(vehicleKey: VehicleKey, color: number) {
    const graphics = this.add.graphics();

    if (vehicleKey === "motorcycle") {
      graphics.fillStyle(0x0f172a, 0.16);
      graphics.fillCircle(-9, 9, 4);
      graphics.fillCircle(8, 9, 4);
      graphics.fillStyle(color, 0.98);
      graphics.fillCircle(-9, 9, 3);
      graphics.fillCircle(8, 9, 3);
      graphics.lineStyle(3, color, 1);
      graphics.lineBetween(-8, 8, -1, 1);
      graphics.lineBetween(-1, 1, 5, 1);
      graphics.lineBetween(5, 1, 8, 8);
      graphics.lineBetween(-1, 1, -3, -3);
      graphics.lineBetween(-3, -3, 3, -3);
      graphics.lineBetween(3, -3, 8, 1);
      graphics.lineStyle(2, 0xffffff, 0.92);
      graphics.lineBetween(-1, 1, 1, 7);
      return graphics;
    }

    graphics.fillStyle(color, 0.98);
    graphics.fillRoundedRect(-13, -1, 26, 10, 4);
    graphics.fillRoundedRect(-6, -8, 12, 10, 4);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillRoundedRect(-4, -6, 8, 5, 2);
    graphics.fillStyle(0x0f172a, 0.18);
    graphics.fillCircle(-8, 10, 4.2);
    graphics.fillCircle(8, 10, 4.2);
    graphics.fillStyle(0x0f172a, 0.96);
    graphics.fillCircle(-8, 10, 3);
    graphics.fillCircle(8, 10, 3);
    graphics.fillStyle(0xfef08a, 0.96);
    graphics.fillRect(12, 1, 3, 2.6);
    graphics.fillRect(12, 5, 3, 2.6);
    return graphics;
  }

  private playVehicleTrailEffect(
    vehicleKey: VehicleKey,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
  ) {
    const trail = this.add.graphics();
    trail.lineStyle(vehicleKey === "car" ? 8 : 5, color, vehicleKey === "car" ? 0.16 : 0.22);
    trail.lineBetween(from.x, from.y, to.x, to.y);
    const accent = this.add.graphics();
    accent.lineStyle(2, 0xffffff, 0.3);
    accent.lineBetween(from.x, from.y, to.x, to.y);

    const rider = this.buildVehicleAccessory(vehicleKey, color);
    rider.setPosition(from.x, from.y + (vehicleKey === "car" ? 1 : 0));
    rider.setScale(vehicleKey === "car" ? 0.9 : 0.84);

    this.movementLayer.add([trail, accent, rider]);

    this.tweens.add({
      targets: [trail, accent],
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        trail.destroy();
        accent.destroy();
      },
    });

    this.tweens.add({
      targets: rider,
      x: to.x,
      y: to.y + (vehicleKey === "car" ? 1 : 0),
      alpha: 0,
      duration: vehicleKey === "car" ? 210 : 180,
      ease: "Sine.easeOut",
      onComplete: () => {
        rider.destroy();
      },
    });
  }

  private drawDiceGraphic(
    graphics: Phaser.GameObjects.Graphics,
    size: number,
    value: number,
    accentColor: number,
  ) {
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.98);
    graphics.fillRoundedRect(-size / 2, -size / 2, size, size, size * 0.18);
    graphics.lineStyle(5, accentColor, 1);
    graphics.strokeRoundedRect(-size / 2, -size / 2, size, size, size * 0.18);

    const pipRadius = Math.max(5, Math.floor(size * 0.055));
    const pips = DICE_PIP_LAYOUT[value] ?? DICE_PIP_LAYOUT[1];
    graphics.fillStyle(accentColor, 1);

    for (const pip of pips) {
      graphics.fillCircle(
        -size / 2 + size * pip.x,
        -size / 2 + size * pip.y,
        pipRadius,
      );
    }
  }

  private playDiceCeremony(diceValues: number[], total: number) {
    this.clearDiceCeremony();

    const { width, height } = this.scale;
    const compact = width < 1100;
    const values = diceValues.length > 0 ? diceValues.slice(0, 3) : [1];
    const diceCount = values.length;
    const centerX = width * 0.5;
    const centerY = height * 0.5 - (compact ? 28 : 12);
    const diceSize = compact
      ? diceCount === 1
        ? 104
        : diceCount === 2
          ? 88
          : 74
      : diceCount === 1
        ? 128
        : diceCount === 2
          ? 108
          : 92;
    const gap = compact ? 18 : 24;
    const totalDiceWidth = diceSize * diceCount + gap * Math.max(0, diceCount - 1);
    const accentPalette = [0xf59e0b, 0x38bdf8, 0x8b5cf6];

    const backdrop = this.add.rectangle(
      centerX,
      height * 0.5,
      width,
      height,
      0x020617,
      0,
    );

    const glow = this.add.circle(centerX, centerY, diceSize * 1.08, 0xf59e0b, 0);
    const flash = this.add.circle(centerX, centerY, diceSize * 0.72, 0xffffff, 0);
    const modeTitle =
      diceCount === 3 ? "小汽车加速" : diceCount === 2 ? "摩托冲刺" : "单骰出发";
    const resolveSubtitle =
      diceCount === 3
        ? "小汽车轰鸣推进，本回合冲得更远！"
        : diceCount === 2
          ? "摩托车呼啸而过，准备执行双骰移动"
          : "单骰落定，准备执行移动";

    const titleText = this.add
      .text(centerX, centerY - diceSize - 54, "好运掷骰", {
        fontFamily: "Arial",
        fontSize: compact ? "24px" : "30px",
        fontStyle: "bold",
        color: "#f8fafc",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const subtitleText = this.add
      .text(centerX, centerY + diceSize + 24, "骰子正在翻滚...", {
        fontFamily: "Arial",
        fontSize: compact ? "14px" : "16px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const resultText = this.add
      .text(centerX, centerY + diceSize + 56, "", {
        fontFamily: "Arial",
        fontSize: compact ? "18px" : "22px",
        fontStyle: "bold",
        color: "#fde68a",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const diceEntries = values.map((_, index) => {
      const accentColor = accentPalette[index] ?? 0xf59e0b;
      const glowCircle = this.add.circle(0, 0, diceSize * 0.58, accentColor, 0.14);
      const baseShadow = this.add.ellipse(
        0,
        diceSize * 0.34,
        diceSize * 0.56,
        Math.max(12, diceSize * 0.18),
        0x020617,
        0.12,
      );
      const face = this.add.graphics();
      this.drawDiceGraphic(face, diceSize, 1, accentColor);
      const targetX =
        centerX - totalDiceWidth * 0.5 + diceSize * 0.5 + index * (diceSize + gap);
      const container = this.add.container(targetX, centerY, [glowCircle, baseShadow, face]);
      container.setAlpha(0);
      container.setScale(0.72);
      return { container, glowCircle, face, targetX, accentColor };
    });
    const diceContainers = diceEntries.map((entry) => entry.container);

    this.effectLayer.add([
      backdrop,
      glow,
      flash,
      titleText,
      subtitleText,
      resultText,
      ...diceContainers,
    ]);

    this.tweens.add({
      targets: backdrop,
      alpha: 0.34,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: diceContainers,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [titleText, subtitleText],
      alpha: 1,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.24, to: 0 },
      scale: { from: 0.55, to: 1.9 },
      duration: 520,
      ease: "Quad.easeOut",
    });

    const rollUpdate = () => {
      diceEntries.forEach((entry) => {
        this.drawDiceGraphic(
          entry.face,
          diceSize,
          Phaser.Math.Between(1, 6),
          entry.accentColor,
        );
        entry.container.setPosition(
          entry.targetX + Phaser.Math.Between(-8, 8),
          centerY + Phaser.Math.Between(-10, 10),
        );
        entry.container.setAngle(Phaser.Math.Between(-12, 12));
        entry.glowCircle.setScale(0.9 + Math.random() * 0.35);
      });
    };

    rollUpdate();
    this.diceRollTimer = this.time.addEvent({
      delay: 72,
      repeat: 10,
      callback: rollUpdate,
    });

    this.diceResolveTimer = this.time.delayedCall(860, () => {
      this.diceRollTimer?.remove(false);
      this.diceRollTimer = null;
      this.diceResolveTimer = null;

      diceEntries.forEach((entry, index) => {
        this.drawDiceGraphic(entry.face, diceSize, values[index] ?? 1, entry.accentColor);
      });
      titleText.setText(modeTitle);
      subtitleText.setText(resolveSubtitle);
      resultText.setText(`最终点数 ${values.join(" + ")} = ${total}`);

      this.tweens.add({
        targets: diceContainers,
        x: (_target: Phaser.GameObjects.Container, _key: string, _value: unknown, index: number) =>
          diceEntries[index]?.targetX ?? centerX,
        y: centerY,
        angle: 0,
        duration: 180,
        ease: "Sine.easeOut",
      });
      this.tweens.add({
        targets: diceContainers,
        scale: { from: 1.18, to: 1 },
        duration: 360,
        ease: "Bounce.easeOut",
      });
      this.tweens.add({
        targets: flash,
        alpha: { from: 0.42, to: 0 },
        scale: { from: 0.35, to: 1.95 },
        duration: 520,
        ease: "Quad.easeOut",
      });
      this.tweens.add({
        targets: resultText,
        alpha: 1,
        duration: 150,
        ease: "Sine.easeOut",
      });

      this.diceDismissTimer = this.time.delayedCall(1000, () => {
        this.tweens.add({
          targets: [
            backdrop,
            titleText,
            subtitleText,
            resultText,
            ...diceContainers,
          ],
          alpha: 0,
          duration: 280,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.clearDiceCeremony();
          },
        });
      });
    });
  }

  private clearPendingMoveTimers(playerId?: string) {
    if (playerId) {
      const timer = this.pendingMoveTimers.get(playerId);
      timer?.remove(false);
      this.pendingMoveTimers.delete(playerId);
      return;
    }

    for (const timer of this.pendingMoveTimers.values()) {
      timer.remove(false);
    }
    this.pendingMoveTimers.clear();
  }

  private buildMovementPath(
    previousPosition: number,
    nextPosition: number,
    boardSize: number,
    latestEvent: EventView | null,
  ) {
    const summary = latestEvent?.summary ?? "";
    const forwardDistance = (nextPosition - previousPosition + boardSize) % boardSize;
    const backwardDistance = (previousPosition - nextPosition + boardSize) % boardSize;
    const shouldWarp =
      /前往监狱|直接前往监狱|被直接送进监狱/.test(summary) ||
      (forwardDistance > 8 && backwardDistance > 4);

    if (shouldWarp) {
      return { mode: "warp" as const, steps: [nextPosition] };
    }

    const moveBackward =
      /后退/.test(summary) ||
      (backwardDistance > 0 && backwardDistance <= 3 && forwardDistance > 8);

    const steps: number[] = [];

    if (moveBackward && backwardDistance > 0) {
      for (let step = 1; step <= backwardDistance; step += 1) {
        steps.push((previousPosition - step + boardSize) % boardSize);
      }
      return { mode: "path" as const, steps };
    }

    if (forwardDistance === 0) {
      return { mode: "warp" as const, steps: [nextPosition] };
    }

    if (forwardDistance <= 8) {
      for (let step = 1; step <= forwardDistance; step += 1) {
        steps.push((previousPosition + step) % boardSize);
      }
      return { mode: "path" as const, steps };
    }

    return { mode: "warp" as const, steps: [nextPosition] };
  }

  private playMovementPulse(x: number, y: number, color: number, strong = false) {
    const ring = this.add.circle(x, y, strong ? 16 : 12, color, strong ? 0.22 : 0.16);
    ring.setStrokeStyle(strong ? 3 : 2, color, 0.9);
    this.movementLayer.add(ring);

    this.tweens.add({
      targets: ring,
      scale: strong ? 2.4 : 1.9,
      alpha: 0,
      duration: strong ? 260 : 180,
      ease: "Quad.easeOut",
      onComplete: () => {
        ring.destroy();
      },
    });
  }

  private animateWarpMovement(
    token: Phaser.GameObjects.Container,
    target: { x: number; y: number },
    finalScale: number,
    color: number,
    vehicleKey: VehicleKey | null,
    onComplete?: () => void,
  ) {
    this.playMovementPulse(token.x, token.y, color, true);
    if (vehicleKey) {
      this.playVehicleTrailEffect(
        vehicleKey,
        { x: token.x, y: token.y },
        { x: target.x, y: target.y },
        color,
      );
    }
    this.tweens.add({
      targets: token,
      alpha: 0.18,
      scale: 0.66,
      duration: 160,
      ease: "Quad.easeIn",
      onComplete: () => {
        token.setPosition(target.x, target.y);
        this.playMovementPulse(target.x, target.y, color, true);
        this.tweens.add({
          targets: token,
          alpha: 1,
          scale: finalScale * 1.14,
          duration: 180,
          ease: "Back.easeOut",
          onComplete: () => {
            this.tweens.add({
              targets: token,
              scale: finalScale,
              duration: 120,
              ease: "Quad.easeOut",
              onComplete,
            });
          },
        });
      },
    });
  }

  private animatePathMovement(
    token: Phaser.GameObjects.Container,
    layout: ReturnType<typeof getBoardLayout>,
    path: number[],
    finalStackIndex: number,
    finalScale: number,
    color: number,
    vehicleKey: VehicleKey | null,
    onComplete?: () => void,
  ) {
    const moveStep = (index: number) => {
      if (index >= path.length) {
        token.setScale(finalScale);
        token.setAlpha(1);
        onComplete?.();
        return;
      }

      const tileIndex = path[index];
      const isFinal = index === path.length - 1;
      const target = this.getTokenTarget(
        layout,
        tileIndex,
        isFinal ? finalStackIndex : 0,
      );

      this.playMovementPulse(target.x, target.y, color, isFinal);
      if (vehicleKey) {
        this.playVehicleTrailEffect(
          vehicleKey,
          { x: token.x, y: token.y },
          { x: target.x, y: target.y },
          color,
        );
      }
      this.tweens.add({
        targets: token,
        x: target.x,
        y: target.y,
        duration: isFinal ? 170 : 135,
        ease: "Sine.easeInOut",
        onStart: () => {
          token.setScale(isFinal ? finalScale * 1.16 : Math.max(1, finalScale * 1.08));
        },
        onComplete: () => {
          if (isFinal) {
            this.tweens.add({
              targets: token,
              scale: finalScale,
              duration: 160,
              ease: "Bounce.easeOut",
              onComplete: () => {
                moveStep(index + 1);
              },
            });
            return;
          }
          moveStep(index + 1);
        },
      });
    };

    moveStep(0);
  }

  private animateTokenMovement(
    player: PlayerGameView,
    token: Phaser.GameObjects.Container,
    layout: ReturnType<typeof getBoardLayout>,
    previousPosition: number,
    stackIndex: number,
    latestEvent: EventView | null,
  ) {
    const boardSize = this.state.snapshot?.game?.board.length ?? BOARD_TILES.length;
    const finalScale = player.id === this.state.snapshot?.game?.currentPlayerId ? 1.12 : 1;
    const finalTarget = this.getTokenTarget(layout, player.position, stackIndex);
    const color = ACCENT_COLORS[player.character.accent] ?? 0x475569;
    const vehicleKey =
      latestEvent?.eventType === "rollDice"
        ? this.getVehicleKeyFromRoll(this.state.snapshot?.game?.lastRoll ?? null)
        : player.activeVehicle?.key ?? null;
    const movement = this.buildMovementPath(
      previousPosition,
      player.position,
      boardSize,
      latestEvent,
    );
    const delay = latestEvent?.eventType === "rollDice" ? 1180 : 0;

    this.clearPendingMoveTimers(player.id);
    this.tweens.killTweensOf(token);
    token.setAlpha(1);
    this.pendingTokenMoves.set(player.id, {
      fromPosition: previousPosition,
      toPosition: player.position,
    });

    const completeMovement = () => {
      this.pendingTokenMoves.delete(player.id);
      this.tokenPositions.set(player.id, player.position);
    };

    const startAnimation = () => {
      if (movement.mode === "warp") {
        this.animateWarpMovement(
          token,
          finalTarget,
          finalScale,
          color,
          vehicleKey,
          completeMovement,
        );
        return;
      }

      this.animatePathMovement(
        token,
        layout,
        movement.steps,
        stackIndex,
        finalScale,
        color,
        vehicleKey,
        completeMovement,
      );
    };

    if (delay > 0) {
      const timer = this.time.delayedCall(delay, () => {
        this.pendingMoveTimers.delete(player.id);
        startAnimation();
      });
      this.pendingMoveTimers.set(player.id, timer);
      return;
    }

    startAnimation();
  }

  private syncTokens(game: GameSnapshotView, latestEvent: EventView | null) {
    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const playersByTile = new Map<number, PlayerGameView[]>();
    const visiblePlayers = game.players.filter((player) => player.abductedTurns <= 0);

    for (const player of visiblePlayers) {
      const current = playersByTile.get(player.position) ?? [];
      current.push(player);
      playersByTile.set(player.position, current);
    }

    for (const [playerId, token] of this.tokenMap.entries()) {
      if (!visiblePlayers.some((player) => player.id === playerId)) {
        this.clearPendingMoveTimers(playerId);
        token.destroy();
        this.tokenMap.delete(playerId);
        this.tokenPositions.delete(playerId);
        this.tokenVehicleStates.delete(playerId);
        this.pendingTokenMoves.delete(playerId);
      }
    }

    visiblePlayers.forEach((player) => {
      const activeVehicleKey = player.activeVehicle?.key ?? null;
      if (
        this.tokenMap.has(player.id) &&
        (this.tokenVehicleStates.get(player.id) ?? null) !== activeVehicleKey
      ) {
        this.tokenMap.get(player.id)?.destroy();
        this.tokenMap.delete(player.id);
        this.tokenVehicleStates.delete(player.id);
        this.pendingTokenMoves.delete(player.id);
      }

      const token = this.ensureToken(player);
      const stackIndex =
        playersByTile
          .get(player.position)
          ?.findIndex((candidate) => candidate.id === player.id) ?? 0;
      const target = this.getTokenTarget(layout, player.position, stackIndex);
      const previousPosition = this.tokenPositions.get(player.id);
      const pendingMove = this.pendingTokenMoves.get(player.id);
      const finalScale = player.id === game.currentPlayerId ? 1.12 : 1;

      token.setDepth(player.id === game.currentPlayerId ? 40 : 30);
      if (previousPosition === undefined) {
        token.setPosition(target.x, target.y);
        token.setScale(finalScale);
        token.setAlpha(1);
        this.tokenPositions.set(player.id, player.position);
      } else if (previousPosition !== player.position) {
        if (
          pendingMove &&
          pendingMove.fromPosition === previousPosition &&
          pendingMove.toPosition === player.position
        ) {
          return;
        }
        this.animateTokenMovement(
          player,
          token,
          layout,
          previousPosition,
          stackIndex,
          latestEvent,
        );
      } else {
        token.setPosition(target.x, target.y);
        token.setScale(finalScale);
        token.setAlpha(1);
        this.tokenPositions.set(player.id, player.position);
      }
    });
  }

  private ensureToken(player: PlayerGameView) {
    const existing = this.tokenMap.get(player.id);
    if (existing) {
      return existing;
    }

    const color = ACCENT_COLORS[player.character.accent] ?? 0x475569;
    const shadow = this.add.ellipse(2, 16, 28, 12, 0x020617, 0.22);
    const vehicleKey = player.activeVehicle?.key ?? null;
    const vehicleBase = vehicleKey ? this.buildVehicleAccessory(vehicleKey, color) : null;
    if (vehicleBase) {
      vehicleBase.setPosition(0, 8);
      vehicleBase.setScale(vehicleKey === "car" ? 0.72 : 0.68);
    }
    const frame = this.add.graphics();
    frame.fillStyle(color, 0.16);
    frame.fillRoundedRect(-18, -22, 36, 40, 12);
    frame.fillStyle(0xffffff, 0.98);
    frame.fillRoundedRect(-16, -20, 32, 36, 11);
    frame.lineStyle(2, color, 1);
    frame.strokeRoundedRect(-16, -20, 32, 36, 11);

    const portraitKey = getCharacterPortraitTextureKey(player.character.id);
    const avatarKey = getCharacterAvatarTextureKey(player.character.id);
    const displayKey = this.textures.exists(portraitKey) ? portraitKey : avatarKey;
    const tokenChildren: Phaser.GameObjects.GameObject[] = [shadow];
    if (vehicleBase) {
      tokenChildren.push(vehicleBase);
    }
    tokenChildren.push(frame);

    if (this.textures.exists(displayKey)) {
      const avatar = this.add.image(0, -3, displayKey);
      avatar.setDisplaySize(this.textures.exists(portraitKey) ? 24 : 26, this.textures.exists(portraitKey) ? 30 : 26);
      tokenChildren.push(avatar);
    } else {
      const fallback = this.add.text(-8, -11, player.character.piece, {
        fontFamily: "Arial",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffffff",
      });
      tokenChildren.push(fallback);
    }

    const sheen = this.add.ellipse(-5, -8, 16, 10, 0xffffff, 0.2);
    tokenChildren.push(sheen);

    const badge = this.add.graphics();
    badge.fillStyle(color, 1);
    badge.fillRoundedRect(6, 10, 18, 12, 6);
    badge.lineStyle(2, 0xffffff, 0.96);
    badge.strokeRoundedRect(6, 10, 18, 12, 6);
    const badgeLabel = this.add.text(10, 8, player.character.piece, {
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#ffffff",
    });
    tokenChildren.push(badge, badgeLabel);

    const token = this.add.container(0, 0, tokenChildren);
    this.tokenLayer.add(token);
    this.tokenMap.set(player.id, token);
    this.tokenVehicleStates.set(player.id, vehicleKey);
    return token;
  }

  private getTokenTarget(
    layout: ReturnType<typeof getBoardLayout>,
    tileIndex: number,
    stackIndex: number,
  ) {
    const coordinate = getTileCoordinate(tileIndex);
    const baseX = layout.originX + (coordinate.x + 0.5) * layout.cellWidth;
    const baseY = layout.originY + (coordinate.y + 0.5) * layout.cellHeight;
    const offsets = [
      { x: -18, y: -18 },
      { x: 18, y: -18 },
      { x: -18, y: 18 },
      { x: 18, y: 18 },
      { x: 0, y: 0 },
    ];
    const offset = offsets[stackIndex % offsets.length] ?? { x: 0, y: 0 };

    return {
      x: baseX + offset.x,
      y: baseY + offset.y,
    };
  }

  private drawBuildPrompt(game: GameSnapshotView) {
    const buildState = this.getBuildPromptState(game);
    if (!buildState) {
      return;
    }

    const layout = getBoardLayout(this.scale.width, this.scale.height);
    const bounds = this.getTileBounds(layout, buildState.tile.index);
    const compact = this.scale.width < 1100;
    const buttonWidth = compact ? 126 : 148;
    const buttonHeight = compact ? 42 : 48;
    let buttonX = bounds.x + bounds.width * 0.5;
    let buttonY = bounds.y - 26;

    if (bounds.side === "top") {
      buttonY = bounds.y + bounds.height + 28;
    } else if (bounds.side === "left") {
      buttonX = bounds.x + bounds.width + buttonWidth * 0.42;
      buttonY = bounds.y + bounds.height * 0.5;
    } else if (bounds.side === "right") {
      buttonX = bounds.x - buttonWidth * 0.42;
      buttonY = bounds.y + bounds.height * 0.5;
    }

    buttonX = Phaser.Math.Clamp(
      buttonX,
      layout.originX + buttonWidth * 0.5 + 10,
      layout.originX + layout.boardWidth - buttonWidth * 0.5 - 10,
    );
    buttonY = Phaser.Math.Clamp(
      buttonY,
      layout.originY + buttonHeight * 0.5 + 10,
      layout.originY + layout.boardHeight - buttonHeight * 0.5 - 10,
    );

    const pointer = this.add.graphics();
    pointer.fillStyle(0x22c55e, 0.96);
    pointer.fillTriangle(
      bounds.x + bounds.width * 0.5 - 10,
      bounds.y - 2,
      bounds.x + bounds.width * 0.5 + 10,
      bounds.y - 2,
      bounds.x + bounds.width * 0.5,
      bounds.y - 16,
    );

    const buttonGlow = this.add.graphics();
    buttonGlow.fillStyle(0x22c55e, 0.16);
    buttonGlow.fillRoundedRect(
      buttonX - buttonWidth * 0.5 - 5,
      buttonY - buttonHeight * 0.5 - 5,
      buttonWidth + 10,
      buttonHeight + 10,
      20,
    );

    const buttonBg = this.add.graphics();
    buttonBg.fillStyle(0x16a34a, 0.98);
    buttonBg.fillRoundedRect(
      buttonX - buttonWidth * 0.5,
      buttonY - buttonHeight * 0.5,
      buttonWidth,
      buttonHeight,
      18,
    );
    buttonBg.lineStyle(2, 0xdcfce7, 0.96);
    buttonBg.strokeRoundedRect(
      buttonX - buttonWidth * 0.5,
      buttonY - buttonHeight * 0.5,
      buttonWidth,
      buttonHeight,
      18,
    );

    const title = this.add
      .text(
        buttonX,
        buttonY - 6,
        isFushenGodKey(buildState.viewer.activeGod?.key) ? "建房 x2" : "建房",
        {
        fontFamily: "Arial",
        fontSize: compact ? "16px" : "18px",
        fontStyle: "bold",
        color: "#f8fafc",
        },
      )
      .setOrigin(0.5);
    const buildCostLabel = isCaishenGodKey(buildState.viewer.activeGod?.key)
      ? "免费"
      : `${getEffectiveHouseCost(buildState.tile, this.state.snapshot?.game?.inflation.index ?? 1)} 元${
          isFushenGodKey(buildState.viewer.activeGod?.key) ? " · 福神加倍" : ""
        }`;
    const meta = this.add
      .text(
        buttonX,
        buttonY + 10,
        buildCostLabel,
        {
        fontFamily: "Arial",
        fontSize: compact ? "11px" : "12px",
        color: "#dcfce7",
        },
      )
      .setOrigin(0.5);

    const hitArea = this.add.rectangle(buttonX, buttonY, buttonWidth, buttonHeight, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => {
      if (this.state.busy) {
        return;
      }

      void this.runtime.performGameAction({
        type: "buildHouse",
        tileIndex: buildState.tile.index,
      });
    });
    hitArea.on("pointerover", () => {
      title.setScale(1.04);
      meta.setScale(1.04);
    });
    hitArea.on("pointerout", () => {
      title.setScale(1);
      meta.setScale(1);
    });

    this.tweens.add({
      targets: buttonGlow,
      alpha: 0.32,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.overlayLayer.add([pointer, buttonGlow, buttonBg, title, meta, hitArea]);
  }

  private drawOverlays(game: GameSnapshotView) {
    this.overlayLayer.removeAll(true);

    if (!game.winnerPlayerId) {
      this.drawBuildPrompt(game);
      return;
    }

    const winner =
      game.players.find((player) => player.id === game.winnerPlayerId) ?? null;
    if (!winner) {
      return;
    }

    const { width, height } = this.scale;
    const compact = width < 1100;
    const accentColor = ACCENT_COLORS[winner.character.accent] ?? 0xf59e0b;
    const winnerContent = getCharacterContent(winner.character.id);
    const winnerPortraitKey = getCharacterPortraitTextureKey(winner.character.id);
    const winnerAvatarKey = getCharacterAvatarTextureKey(winner.character.id);
    const portraitKey = this.textures.exists(winnerPortraitKey)
      ? winnerPortraitKey
      : winnerAvatarKey;
    const hasWinnerPortrait = this.textures.exists(portraitKey);
    const cardWidth = Math.min(width * 0.86, compact ? 760 : 920);
    const cardHeight = Math.min(height * 0.74, compact ? 380 : 468);
    const cardX = width * 0.5 - cardWidth * 0.5;
    const cardY = height * 0.5 - cardHeight * 0.5;
    const portraitX = cardX + cardWidth - (compact ? 124 : 196);
    const portraitY = cardY + cardHeight * 0.54;
    const portraitWidth = compact ? 184 : 284;
    const portraitHeight = compact ? 238 : 360;
    const textWidth = cardWidth - (hasWinnerPortrait ? (compact ? 244 : 360) : 80);
    const overlay = this.add.graphics();
    overlay.fillStyle(0x020617, 0.82);
    overlay.fillRect(0, 0, width, height);
    overlay.fillStyle(0xffffff, 0.96);
    overlay.fillRoundedRect(cardX, cardY, cardWidth, cardHeight, 34);
    overlay.fillStyle(accentColor, 0.14);
    overlay.fillRoundedRect(cardX + 20, cardY + 20, 14, cardHeight - 40, 8);
    overlay.fillStyle(0x0f172a, 0.05);
    overlay.fillRoundedRect(cardX + 28, cardY + 26, textWidth, compact ? 94 : 112, 24);
    overlay.fillRoundedRect(cardX + 28, cardY + cardHeight - (compact ? 116 : 138), textWidth, compact ? 88 : 108, 24);
    if (hasWinnerPortrait) {
      overlay.fillStyle(0x0f172a, 0.08);
      overlay.fillRoundedRect(
        portraitX - portraitWidth * 0.5 + 14,
        portraitY - portraitHeight * 0.5 + 18,
        portraitWidth,
        portraitHeight,
        compact ? 24 : 30,
      );
      overlay.fillStyle(0xffffff, 0.98);
      overlay.fillRoundedRect(
        portraitX - portraitWidth * 0.5,
        portraitY - portraitHeight * 0.5,
        portraitWidth,
        portraitHeight,
        compact ? 24 : 30,
      );
      overlay.fillStyle(accentColor, 0.18);
      overlay.fillRoundedRect(
        portraitX - portraitWidth * 0.24,
        portraitY + portraitHeight * 0.38,
        portraitWidth * 0.48,
        compact ? 11 : 13,
        7,
      );
    }
    this.overlayLayer.add(overlay);

    if (hasWinnerPortrait) {
      const winnerPortrait = this.add.image(portraitX, portraitY, portraitKey);
      winnerPortrait.setDisplaySize(portraitWidth * 0.92, portraitHeight * 0.92);
      this.overlayLayer.add(winnerPortrait);
    }

    this.overlayLayer.add(
      this.add.text(cardX + 46, cardY + 42, "胜利", {
        fontFamily: "Arial",
        fontSize: compact ? "30px" : "42px",
        fontStyle: "bold",
        color: "#0f172a",
      }),
    );
    this.overlayLayer.add(
      this.add.text(
        cardX + 46,
        cardY + (compact ? 102 : 128),
        `${winner.character.name} - ${winner.name}`,
        {
          fontFamily: "Arial",
          fontSize: compact ? "24px" : "30px",
          fontStyle: "bold",
          color: "#0f172a",
          wordWrap: { width: textWidth - 12 },
        },
      ),
    );
    this.overlayLayer.add(
      this.add.text(
        cardX + 46,
        cardY + (compact ? 144 : 172),
        winnerContent.victoryLine,
        {
          fontFamily: "Arial",
          fontSize: compact ? "15px" : "18px",
          color: "#334155",
          wordWrap: { width: textWidth - 12 },
          lineSpacing: 8,
        },
      ),
    );
    this.overlayLayer.add(
      this.add.text(
        cardX + 46,
        cardY + cardHeight - (compact ? 96 : 112),
        `总资产 ${formatMoney(winner.totalAssets)}\n现金 ${formatMoney(winner.cash)}  ·  地产 ${formatMoney(winner.propertyAssetValue)}  ·  股票 ${formatMoney(winner.stockAssetValue)}`,
        {
          fontFamily: "Arial",
          fontSize: compact ? "15px" : "18px",
          color: "#334155",
          wordWrap: { width: textWidth - 12 },
          lineSpacing: 10,
        },
      ),
    );
    this.overlayLayer.add(
      this.add.text(
        cardX + 46,
        cardY + cardHeight - (compact ? 142 : 160),
        compact ? "冠军结算" : "冠军结算 · 掌上大富翁冠军",
        {
          fontFamily: "Arial",
          fontSize: compact ? "14px" : "16px",
          fontStyle: "bold",
          color: "#64748b",
        },
      ),
    );
  }
}
