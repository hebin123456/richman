import Phaser from "phaser";

import { BaseScene } from "@/game-client/phaser/BaseScene";
import type { GameRuntime } from "@/game-client/phaser/GameRuntime";
import { formatGameDateLabel, isWeekendDateKey } from "@/lib/game/calendar";
import {
  getEffectiveBankAmount,
  getEffectiveHouseCost,
  getEffectiveItemPrice,
  getEffectiveMortgageValue,
  getEffectivePassStartSalary,
  getEffectiveTilePrice,
  getEffectiveUnmortgageCost,
} from "@/lib/game/economy";
import { getRollTotalUpperBound } from "@/lib/game/dice";
import {
  GOD_DURATION_TURNS,
  getPurchaseHouseBonusByGod,
  isCaishenGodKey,
  isFushenGodKey,
  isShuaishenGodKey,
} from "@/lib/game/gods";
import {
  getItemDefinition,
  REMOTE_DICE_ITEM_KEY,
  type ItemDefinition,
} from "@/lib/game/items";
import { LOTTERY_OPTIONS } from "@/lib/game/lottery";
import { getShopOfferItems } from "@/lib/game/shop";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString("zh-CN")} 元`;
}

function formatMoneyCompact(amount: number) {
  return `${amount.toLocaleString("zh-CN")}元`;
}

const AUTO_POPUP_EVENT_MARKERS = [
  {
    marker: "新闻快报：",
    title: "新闻快报",
    meta: "已自动展示本次新闻屋结果",
  },
  {
    marker: "机会快报：",
    title: "机会卡",
    meta: "已自动展示本次机会卡结果",
  },
  {
    marker: "命运快报：",
    title: "命运卡",
    meta: "已自动展示本次命运卡结果",
  },
  {
    marker: "神明附身快报：",
    title: "神明附身",
    meta: "已自动展示本次神明附身结果",
  },
] as const;

function extractAutoPopupEvent(summary: string) {
  for (const descriptor of AUTO_POPUP_EVENT_MARKERS) {
    const markerIndex = summary.indexOf(descriptor.marker);
    if (markerIndex < 0) {
      continue;
    }

    const body = summary.slice(markerIndex + descriptor.marker.length).trim();
    if (body.length > 0) {
      return {
        title: descriptor.title,
        meta: descriptor.meta,
        body,
      };
    }
  }

  return null;
}

function getPhaseLabel(phase: string) {
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

function getManagedStatusLabel(
  player:
    | {
        isBot?: boolean;
        isManaged?: boolean;
        managedReason?: string | null;
      }
    | null
    | undefined,
) {
  if (!player) {
    return "手动";
  }

  if (player.isBot) {
    return "电脑";
  }

  if (!player.isManaged) {
    return "手动";
  }

  return player.managedReason === "timeout" ? "托管中（超时）" : "托管中（手动）";
}

function isPassiveAutoItem(definition: ItemDefinition) {
  return definition.effectType === "rebound";
}

function isReactionOnlyItem(definition: ItemDefinition) {
  return definition.effectType === "innocence" || definition.effectType === "freePass";
}

function getItemActionButtonLabel(definition: ItemDefinition) {
  if (isPassiveAutoItem(definition)) {
    return "自动";
  }

  if (isReactionOnlyItem(definition)) {
    return "响应";
  }

  if (definition.requiresTarget) {
    return "选目标";
  }

  switch (definition.effectType) {
    case "blessing":
    case "summonMapGod":
      return "请神";
    case "dismissGod":
      return "送神";
    case "vehicle":
      return "使用";
    case "collectFromPlayers":
      return "收钱";
    default:
      return "使用";
  }
}

function getItemActionConfirmLabel(definition: ItemDefinition) {
  switch (definition.effectType) {
    case "blessing":
      return "立即请神";
    case "summonMapGod":
      return "立即拉神";
    case "dismissGod":
      return "立即送神";
    case "vehicle":
      return "立即启用";
    case "collectFromPlayers":
      return "立即收取";
    case "taxAudit":
      return "立即查税";
    case "jailFree":
      return "立即收下";
    case "cashBoost":
      return "立即领取";
    default:
      return "立即使用";
  }
}

function getItemActionHint(definition: ItemDefinition) {
  if (isPassiveAutoItem(definition)) {
    return "这张护身卡会在合适的时机自动消耗并生效。";
  }

  if (isReactionOnlyItem(definition)) {
    return "只有在系统弹出响应提示时，才能决定是否手动使用。";
  }

  if (definition.requiresTarget) {
    return "请选择一名目标玩家。";
  }

  switch (definition.effectType) {
    case "blessing":
      return "确认后会立刻把神明请到自己身上。";
    case "summonMapGod":
      return "确认后会把离你最近的地图神明拉到自己身上；如果场上没有地图神明，也会消耗掉。";
    case "dismissGod":
      return "确认后会立刻清除自己当前的神明效果。";
    case "vehicle":
      return "确认后会立刻启用载具效果。";
    case "wealthRedistribution":
      return "确认后会立刻重算所有存活玩家的现金。";
    default:
      return "确认后会立刻生效。";
  }
}

type HudOverlayPanel = "player" | "properties" | "stocks" | "items" | "events";

function buildBotAssetModalBody(
  players: Array<{
    id: string;
    name: string;
    character: { name: string };
    cash: number;
    totalAssets: number;
    propertyAssetValue: number;
    stockAssetValue: number;
    bankSavings: number;
    bankDebt: number;
    position: number;
    ownedTileIndexes: number[];
    isBankrupt: boolean;
    abductedTurns: number;
    sleepwalkingTurns: number;
    activeGod: { name: string; turnsRemaining: number } | null;
    activeVehicle: { name: string; turnsRemaining: number; diceCount: number } | null;
    isManaged?: boolean;
    managedReason?: string | null;
    ownedProperties: Array<{
      tileIndex: number;
      name: string;
      typeLabel: string;
      buildingLabel: string;
      mortgageLabel: string;
    }>;
  }>,
  expandedPlayerIds: Set<string>,
) {
  if (players.length === 0) {
    return `<div class="phaser-meta-stack"><div>当前没有电脑玩家。</div></div>`;
  }

  return `
    <div class="phaser-bot-assets-grid">
      ${players
        .map((player) => {
          const controlLabel = getManagedStatusLabel(player);
          const godLabel = player.activeGod
            ? `${player.activeGod.name}（剩 ${player.activeGod.turnsRemaining} 天）`
            : "暂无";
          const vehicleLabel = player.activeVehicle
            ? `${player.activeVehicle.name}（最多 ${player.activeVehicle.diceCount} 骰，剩 ${player.activeVehicle.turnsRemaining} 回合）`
            : "步行";
          const statusLabel =
            player.abductedTurns > 0
              ? `被外星人抓走（剩 ${player.abductedTurns} 天）`
              : player.sleepwalkingTurns > 0
              ? `梦游中（剩 ${player.sleepwalkingTurns} 回合）`
              : "清醒";
          const isExpanded = expandedPlayerIds.has(player.id);
          return `
            <section class="phaser-bot-asset-card">
              <div class="phaser-bot-asset-head">
                <div>
                  <div class="phaser-bot-asset-name">${escapeHtml(player.character.name)} - ${escapeHtml(player.name)}</div>
                  <div class="phaser-bot-asset-meta">控制：${escapeHtml(controlLabel)} · ${player.isBankrupt ? "已破产" : "活跃中"}</div>
                </div>
                <div class="phaser-pill">${player.isBankrupt ? "已破产" : "电脑"}</div>
              </div>
              <div class="phaser-bot-asset-stats">
                <div class="phaser-bot-asset-stat">
                  <span>现金</span>
                  <strong>${formatMoney(player.cash)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>总资产</span>
                  <strong>${formatMoney(player.totalAssets)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>地产资产</span>
                  <strong>${formatMoney(player.propertyAssetValue)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>股票资产</span>
                  <strong>${formatMoney(player.stockAssetValue)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>银行存款</span>
                  <strong>${formatMoney(player.bankSavings)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>银行贷款</span>
                  <strong>${formatMoney(player.bankDebt)}</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>持有地产</span>
                  <strong>${player.ownedTileIndexes.length} 处</strong>
                </div>
                <div class="phaser-bot-asset-stat">
                  <span>当前位置</span>
                  <strong>第 ${player.position} 格</strong>
                </div>
              </div>
              ${
                player.ownedProperties.length > 0
                  ? `
                    <div class="phaser-bot-asset-expand-row">
                      <div class="phaser-bot-asset-meta">地产明细：点击后可继续展开查看每块地的状态。</div>
                      <button class="phaser-ghost-button" data-action="toggle-bot-properties" data-player-id="${player.id}">
                        ${isExpanded ? "收起地产" : `展开地产（${player.ownedProperties.length}）`}
                      </button>
                    </div>
                    ${
                      isExpanded
                        ? `
                          <div class="phaser-bot-property-list">
                            ${player.ownedProperties
                              .map(
                                (property) => `
                                  <div class="phaser-bot-property-item">
                                    <div class="phaser-bot-property-title">${escapeHtml(property.name)}</div>
                                    <div class="phaser-bot-property-meta">
                                      ${escapeHtml(property.typeLabel)} · ${escapeHtml(property.buildingLabel)} · ${escapeHtml(property.mortgageLabel)} · 第 ${property.tileIndex} 格
                                    </div>
                                  </div>
                                `,
                              )
                              .join("")}
                          </div>
                        `
                        : ""
                    }
                  `
                  : `<div class="phaser-bot-asset-meta">当前还没有持有任何地产。</div>`
              }
              <div class="phaser-bot-asset-footer">
                <div>状态：${escapeHtml(statusLabel)}</div>
                <div>当前神仙：${escapeHtml(godLabel)}</div>
                <div>当前载具：${escapeHtml(vehicleLabel)}</div>
              </div>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

export class HudScene extends BaseScene {
  private root: Phaser.GameObjects.DOMElement | null = null;

  private activeCompactPanel: HudOverlayPanel | null = null;

  private showBotAssetsModal = false;

  private expandedBotPropertyPlayerIds = new Set<string>();

  private activeItemActionKey: string | null = null;

  private showNavigateHomeConfirm = false;

  private showBankruptcyConfirm = false;

  private activeAutoPopupSequence: number | null = null;

  private lastSeenEventSequence = 0;

  private hasPrimedEventFeed = false;

  constructor(runtime: GameRuntime) {
    super("HudScene", runtime);
  }

  create() {
    const root = document.createElement("div");
    root.className = "phaser-dom-root phaser-hud-root";
    this.root = this.add.dom(0, 0, root).setOrigin(0, 0);

    root.addEventListener("click", this.handleClick);

    this.bindRuntime(() => this.renderScene());
    this.scale.on("resize", this.renderScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      root.removeEventListener("click", this.handleClick);
      this.scale.off("resize", this.renderScene, this);
    });

    this.renderScene();
  }

  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const actionTarget = target.closest<HTMLElement>("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (!action) {
      return;
    }

    switch (action) {
      case "open-panel": {
        const panel = actionTarget.dataset.panel as HudOverlayPanel | undefined;
        if (panel) {
          this.activeCompactPanel = panel;
          this.showBotAssetsModal = false;
          this.showNavigateHomeConfirm = false;
          this.showBankruptcyConfirm = false;
          if (panel !== "properties") {
            this.runtime.focusTile(null);
          }
          this.activeItemActionKey = null;
          this.renderScene();
        }
        return;
      }
      case "close-panel":
        this.activeCompactPanel = null;
        this.showBotAssetsModal = false;
        this.showNavigateHomeConfirm = false;
        this.showBankruptcyConfirm = false;
        this.expandedBotPropertyPlayerIds.clear();
        this.runtime.focusTile(null);
        this.activeItemActionKey = null;
        this.renderScene();
        return;
      case "open-bot-assets":
        this.activeCompactPanel = null;
        this.showBotAssetsModal = true;
        this.showNavigateHomeConfirm = false;
        this.showBankruptcyConfirm = false;
        this.runtime.focusTile(null);
        this.activeItemActionKey = null;
        this.renderScene();
        return;
      case "toggle-bot-properties": {
        const playerId = actionTarget.dataset.playerId ?? "";
        if (!playerId) {
          return;
        }

        if (this.expandedBotPropertyPlayerIds.has(playerId)) {
          this.expandedBotPropertyPlayerIds.delete(playerId);
        } else {
          this.expandedBotPropertyPlayerIds.add(playerId);
        }
        this.renderScene();
        return;
      }
      case "open-item-action": {
        const itemKey = actionTarget.dataset.itemKey ?? "";
        if (!itemKey) {
          return;
        }

        this.activeItemActionKey = itemKey;
        this.showBotAssetsModal = false;
        this.showNavigateHomeConfirm = false;
        this.showBankruptcyConfirm = false;
        this.runtime.focusTile(null);
        this.renderScene();
        return;
      }
      case "focus-tile": {
        const tileIndex = Number(actionTarget.dataset.tileIndex);
        if (Number.isInteger(tileIndex)) {
          this.runtime.focusTile(tileIndex);
        }
        return;
      }
      case "close-item-action":
        this.activeItemActionKey = null;
        this.renderScene();
        return;
      case "request-navigate-home":
        this.showNavigateHomeConfirm = true;
        this.showBankruptcyConfirm = false;
        this.activeItemActionKey = null;
        this.renderScene();
        return;
      case "cancel-navigate-home":
        this.showNavigateHomeConfirm = false;
        this.renderScene();
        return;
      case "confirm-navigate-home":
        this.showNavigateHomeConfirm = false;
        this.renderScene();
        this.runtime.navigateHome();
        return;
      case "cancel-bankruptcy":
        this.showBankruptcyConfirm = false;
        this.renderScene();
        return;
      case "confirm-bankruptcy":
        this.showBankruptcyConfirm = false;
        this.renderScene();
        void this.runtime.performGameAction({ type: "declareBankruptcy" });
        return;
      case "close-news-popup":
        this.activeAutoPopupSequence = null;
        this.renderScene();
        return;
      case "toggle-audio":
        this.runtime.toggleAudio();
        return;
      case "enable-managed":
        void this.runtime.setManagedMode(true);
        return;
      case "disable-managed":
        void this.runtime.setManagedMode(false);
        return;
      case "roll-dice":
        {
          const diceCountRaw = actionTarget.dataset.diceCount;
          const controlledRollTotalRaw = actionTarget.dataset.diceTotal;
          const itemKey = actionTarget.dataset.itemKey;
          void this.runtime.performGameAction({
            type: "rollDice",
            diceCount: diceCountRaw ? Number(diceCountRaw) : undefined,
            controlledRollTotal: controlledRollTotalRaw
              ? Number(controlledRollTotalRaw)
              : undefined,
            itemKey,
          });
        }
        return;
      case "pay-jail":
        void this.runtime.performGameAction({ type: "payJailFine" });
        return;
      case "use-jail-card":
        void this.runtime.performGameAction({ type: "useJailFreeCard" });
        return;
      case "buy-property":
        void this.runtime.performGameAction({ type: "buyProperty" });
        return;
      case "skip-purchase":
        void this.runtime.performGameAction({ type: "skipPurchase" });
        return;
      case "skip-shop":
        void this.runtime.performGameAction({ type: "skipShop" });
        return;
      case "buy-lottery-ticket": {
        const lotteryNumber = Number(actionTarget.dataset.lotteryNumber);
        void this.runtime.performGameAction({ type: "buyLotteryTicket", lotteryNumber });
        return;
      }
      case "skip-lottery":
        void this.runtime.performGameAction({ type: "skipLottery" });
        return;
      case "bank-action": {
        const bankChoice = actionTarget.dataset.bankChoice ?? "";
        void this.runtime.performGameAction({ type: "manageBank", bankChoice });
        return;
      }
      case "skip-bank":
        void this.runtime.performGameAction({ type: "skipBank" });
        return;
      case "cast-magic": {
        const magicKey = actionTarget.dataset.magicKey ?? "";
        const targetPlayerId = actionTarget.dataset.targetPlayerId;
        void this.runtime.performGameAction({ type: "castMagic", magicKey, targetPlayerId });
        return;
      }
      case "skip-magic":
        void this.runtime.performGameAction({ type: "skipMagic" });
        return;
      case "play-amusement": {
        const amusementChoice = actionTarget.dataset.amusementChoice ?? "";
        void this.runtime.performGameAction({ type: "playAmusement", amusementChoice });
        return;
      }
      case "end-turn":
        void this.runtime.performGameAction({ type: "endTurn" });
        return;
      case "declare-bankruptcy":
        this.showBankruptcyConfirm = true;
        this.activeItemActionKey = null;
        this.renderScene();
        return;
      case "build-house": {
        const tileIndex = Number(actionTarget.dataset.tileIndex);
        void this.runtime.performGameAction({ type: "buildHouse", tileIndex });
        return;
      }
      case "toggle-mortgage": {
        const tileIndex = Number(actionTarget.dataset.tileIndex);
        const mortgaged = actionTarget.dataset.mortgaged === "true";
        this.runtime.focusTile(tileIndex);
        void this.runtime.performGameAction({
          type: mortgaged ? "unmortgage" : "mortgage",
          tileIndex,
        });
        return;
      }
      case "trade-stock": {
        const stockSymbol = actionTarget.dataset.stockSymbol ?? "";
        const shares = Number(actionTarget.dataset.shares ?? "0");
        const tradeType = actionTarget.dataset.tradeType === "sell" ? "sellStock" : "buyStock";
        void this.runtime.performGameAction({
          type: tradeType,
          stockSymbol,
          shares,
        });
        return;
      }
      case "buy-item": {
        const itemKey = actionTarget.dataset.itemKey ?? "";
        void this.runtime.performGameAction({
          type: "buyItem",
          itemKey,
        });
        return;
      }
      case "use-item": {
        const itemKey = actionTarget.dataset.itemKey ?? "";
        const targetPlayerId = actionTarget.dataset.targetPlayerId;
        this.activeItemActionKey = null;
        this.renderScene();
        void this.runtime.performGameAction({
          type: "useItem",
          itemKey,
          targetPlayerId,
        });
        return;
      }
      case "decline-reaction":
        void this.runtime.performGameAction({ type: "declineReaction" });
        return;
      default:
        break;
    }
  };

  private renderScene = () => {
    if (!this.root) {
      return;
    }

    this.root.setPosition(0, 0);

    const wrapper = this.root.node as HTMLDivElement;
    const snapshot = this.state.snapshot;
    const game = snapshot?.game;

    if (!snapshot || !game) {
      this.showNavigateHomeConfirm = false;
      this.activeAutoPopupSequence = null;
      this.lastSeenEventSequence = 0;
      this.hasPrimedEventFeed = false;
      wrapper.innerHTML = "";
      return;
    }

    const latestEventSequence = snapshot.recentEvents.at(-1)?.sequence ?? 0;
    if (!this.hasPrimedEventFeed) {
      this.lastSeenEventSequence = latestEventSequence;
      this.hasPrimedEventFeed = true;
    } else if (latestEventSequence < this.lastSeenEventSequence) {
      this.lastSeenEventSequence = latestEventSequence;
      this.activeAutoPopupSequence = null;
    } else if (latestEventSequence > this.lastSeenEventSequence) {
      const newEvents = snapshot.recentEvents.filter(
        (eventItem) => eventItem.sequence > this.lastSeenEventSequence,
      );
      const latestPopupEvent = [...newEvents]
        .reverse()
        .find((eventItem) => extractAutoPopupEvent(eventItem.summary));
      if (latestPopupEvent) {
        this.activeAutoPopupSequence = latestPopupEvent.sequence;
      }
      this.lastSeenEventSequence = latestEventSequence;
    }

    const activeAutoPopupEvent = this.activeAutoPopupSequence
      ? (snapshot.recentEvents.find(
          (eventItem) => eventItem.sequence === this.activeAutoPopupSequence,
        ) ?? null)
      : null;
    if (this.activeAutoPopupSequence && !activeAutoPopupEvent) {
      this.activeAutoPopupSequence = null;
    }
    const activeAutoPopupContent = activeAutoPopupEvent
      ? extractAutoPopupEvent(activeAutoPopupEvent.summary)
      : null;

    const viewer = snapshot.currentPlayer
      ? game.players.find((player) => player.id === snapshot.currentPlayer?.id) ?? null
      : null;
    const viewerOwnsTurn = Boolean(viewer && game.currentPlayerId === viewer.id);
    const isCurrentTurn = Boolean(viewerOwnsTurn && !viewer?.isManaged);
    const viewerIsAbducted = Boolean((viewer?.abductedTurns ?? 0) > 0);
    const viewerIsSleepwalking = Boolean((viewer?.sleepwalkingTurns ?? 0) > 0);
    const canManage = Boolean(
      isCurrentTurn &&
        !viewerIsAbducted &&
        !viewerIsSleepwalking &&
        ["WAITING_FOR_ROLL", "WAITING_FOR_TURN_END", "WAITING_FOR_JAIL_CHOICE"].includes(
          game.phase,
        ),
    );
    const canManageMortgages = Boolean(
      isCurrentTurn &&
        game.phase !== "WAITING_FOR_ITEM_REACTION" &&
        !viewerIsAbducted &&
        (!viewerIsSleepwalking || game.phase === "WAITING_FOR_RECOVERY"),
    );
    const canShop = Boolean(isCurrentTurn && game.phase === "WAITING_FOR_SHOP_DECISION");
    const canLottery = Boolean(
      isCurrentTurn && game.phase === "WAITING_FOR_LOTTERY_DECISION",
    );
    const canBank = Boolean(isCurrentTurn && game.phase === "WAITING_FOR_BANK_DECISION");
    const canMagic = Boolean(isCurrentTurn && game.phase === "WAITING_FOR_MAGIC_DECISION");
    const canAmusement = Boolean(
      isCurrentTurn && game.phase === "WAITING_FOR_AMUSEMENT_DECISION",
    );
    const inflationIndex = game.inflation.index;
    const effectivePassStartSalary = getEffectivePassStartSalary(
      snapshot.settings.passStartSalary,
      inflationIndex,
    );
    const effectiveDeposit300 = getEffectiveBankAmount(300, inflationIndex);
    const effectiveDeposit600 = getEffectiveBankAmount(600, inflationIndex);
    const effectiveBorrowAmount = getEffectiveBankAmount(500, inflationIndex);
    const effectiveRepayAmount = effectiveBorrowAmount + Math.floor(effectiveBorrowAmount * 0.1);
    const displayedRepayAmount =
      viewer && viewer.bankDebt > 0 ? viewer.bankDebt : effectiveRepayAmount;
    const effectivePendingTilePrice = game.pendingTile
      ? getEffectiveTilePrice(game.pendingTile, inflationIndex)
      : 0;
    const basePendingHouseCost =
      game.pendingTile?.type === "property"
        ? getEffectiveHouseCost(game.pendingTile, inflationIndex)
        : 0;
    const viewerActiveGodKey = viewer?.activeGod?.key ?? null;
    const pendingHouseIsFree = isCaishenGodKey(viewerActiveGodKey);
    const pendingHouseBuildsDouble = isFushenGodKey(viewerActiveGodKey);
    const pendingHouseFailsByShuaishen = isShuaishenGodKey(viewerActiveGodKey);
    const pendingPurchaseHouseBonus =
      game.pendingTile?.type === "property" ? getPurchaseHouseBonusByGod(viewerActiveGodKey) : 0;
    const effectivePendingHouseCost =
      game.pendingTile?.type === "property" && pendingHouseIsFree ? 0 : basePendingHouseCost;
    const pendingPropertyState = game.pendingTile
      ? game.properties.find((property) => property.tileIndex === game.pendingTile?.index) ?? null
      : null;
    const canBuildCurrentTile = Boolean(
      viewer &&
        isCurrentTurn &&
        game.phase === "WAITING_FOR_PROPERTY_DECISION" &&
        game.pendingTile?.type === "property" &&
        pendingPropertyState?.ownerPlayerId === viewer.id &&
        !pendingPropertyState.mortgaged &&
        !pendingPropertyState.hasHotel &&
        !pendingHouseFailsByShuaishen &&
        viewer.cash >= effectivePendingHouseCost,
    );
    const ownedProperties = viewer
      ? game.properties.filter((property) => property.ownerPlayerId === viewer.id)
      : [];
    const viewerItems = viewer
      ? game.inventoryItems.filter((item) => item.playerId === viewer.id && item.quantity > 0)
      : [];
    const viewerLotteryTickets = viewer
      ? game.lottery.tickets.filter((ticket) => ticket.playerId === viewer.id)
      : [];
    const viewerTicketSummary =
      viewerLotteryTickets.length > 0
        ? viewerLotteryTickets.map((ticket) => ticket.shortLabel).join("、")
        : "暂无";
    const otherPlayers = viewer
      ? game.players.filter((player) => player.id !== viewer.id && !player.isBankrupt)
      : [];
    const busy = this.state.busy ? "disabled" : "";
    const canBuyLotteryTicket = Boolean(
      viewer && canLottery && viewer.cash >= game.lottery.ticketPrice,
    );
    const canDeposit300 = Boolean(
      viewer && canBank && viewer.cash >= effectiveDeposit300 && viewer.bankDebt === 0,
    );
    const canDeposit600 = Boolean(
      viewer && canBank && viewer.cash >= effectiveDeposit600 && viewer.bankDebt === 0,
    );
    const canWithdrawSavings = Boolean(viewer && canBank && viewer.bankSavings > 0);
    const canBorrowBank = Boolean(viewer && canBank && viewer.bankDebt === 0);
    const canRepayBank = Boolean(viewer && canBank && viewer.bankDebt > 0 && viewer.cash >= viewer.bankDebt);
    const activeGodLabel = viewer?.activeGod
      ? `${viewer.activeGod.name}（剩 ${viewer.activeGod.turnsRemaining} 天）`
      : "暂无";
    const activeGodSummaryMeta = viewer?.activeGod
      ? `剩余 ${viewer.activeGod.turnsRemaining} 天，神明效果当前生效中`
      : "当前没有神明附身";
    const activeStatusLabel = viewerIsAbducted
      ? `被外星人抓走（剩 ${viewer?.abductedTurns ?? 0} 天）`
      : viewerIsSleepwalking
      ? `梦游中（剩 ${viewer?.sleepwalkingTurns ?? 0} 回合）`
      : "清醒";
    const positionStatusValue = viewerIsAbducted ? "从地图上消失中" : `第 ${viewer?.position ?? 0} 格`;
    const positionStatusMeta = viewerIsAbducted
      ? `还需 ${viewer?.abductedTurns ?? 0} 天回到原地 · 出狱卡 ${viewer?.jailFreeCards ?? 0}`
      : `监狱 ${viewer?.inJailTurns ?? 0} 回 · 梦游 ${viewer?.sleepwalkingTurns ?? 0} 回 · 出狱卡 ${viewer?.jailFreeCards ?? 0}`;
    const activeVehicleLabel = viewer?.activeVehicle
      ? `${viewer.activeVehicle.name}（最多 ${viewer.activeVehicle.diceCount} 骰，剩 ${viewer.activeVehicle.turnsRemaining} 回合）`
      : "步行";
    const viewerManagedStatusLabel = getManagedStatusLabel(viewer);
    const viewerMaxDiceCount = viewer?.activeVehicle?.diceCount ?? 1;
    const rollDiceOptions = Array.from({ length: viewerMaxDiceCount }, (_, index) => index + 1);
    const remoteDiceMaxTotal = getRollTotalUpperBound(viewerMaxDiceCount);
    const remoteDiceTotals = Array.from(
      { length: remoteDiceMaxTotal },
      (_, index) => index + 1,
    );
    const currentDateLabel = formatGameDateLabel(game.currentDate);
    const recovery = game.recovery;
    const reaction = game.reaction;
    const focusedTileIndex = this.state.focusedTileIndex;
    const recoveryShortfall =
      viewer && recovery ? Math.max(0, recovery.amountDue - viewer.cash) : 0;
    if (!viewer && this.showNavigateHomeConfirm) {
      this.showNavigateHomeConfirm = false;
    }
    if ((!viewer || !isCurrentTurn || viewer.isBankrupt) && this.showBankruptcyConfirm) {
      this.showBankruptcyConfirm = false;
    }
    const viewerIsReacting = Boolean(
      viewer &&
        reaction &&
        game.phase === "WAITING_FOR_ITEM_REACTION" &&
        reaction.reactingPlayerId === viewer.id,
    );
    const reactionItemDefinitions = reaction
      ? reaction.itemKeys
          .map((itemKey) => getItemDefinition(itemKey))
          .filter((definition): definition is ItemDefinition => Boolean(definition))
      : [];
    const reactionPrompt = reaction
      ? (() => {
          if (reaction.kind === "payment") {
            return `你需要支付 ${formatMoney(reaction.amount ?? 0)} 的${escapeHtml(
              reaction.reason ?? "费用",
            )}。如果不想这次直接免单，可以选择暂时不使用免费卡。`;
          }

          if (reaction.kind === "taxAudit") {
            return `${escapeHtml(reaction.sourcePlayerName ?? "对手")} 对你使用了 ${escapeHtml(
              reaction.sourceItemName,
            )}，准备收取 ${formatMoney(reaction.amount ?? 0)}。你可以决定是否使用免费卡。`;
          }

          if (viewer && reaction.sourcePlayerId === viewer.id) {
            return `${escapeHtml(reaction.sourceItemName)} 被反弹回你自己身上。你可以决定是否使用免罪卡来抵消这次效果。`;
          }

          return `${escapeHtml(reaction.sourcePlayerName ?? "对手")} 对你使用了 ${escapeHtml(
            reaction.sourceItemName,
          )}。你可以决定是否使用免罪卡来抵消这次效果。`;
        })()
      : "";
    let activeItemActionKey = this.activeItemActionKey;
    let activeItemActionDefinition = activeItemActionKey
      ? getItemDefinition(activeItemActionKey)
      : null;
    let activeItemActionInventory =
      activeItemActionKey && viewer
        ? viewerItems.find((item) => item.itemKey === activeItemActionKey) ?? null
        : null;

    if (!activeItemActionDefinition || !activeItemActionInventory) {
      this.activeItemActionKey = null;
      activeItemActionKey = null;
      activeItemActionDefinition = null;
      activeItemActionInventory = null;
    }

    if (viewerIsReacting && this.activeItemActionKey) {
      this.activeItemActionKey = null;
      activeItemActionKey = null;
      activeItemActionDefinition = null;
      activeItemActionInventory = null;
    }

    const shopOffers =
      canShop && game.pendingTile?.type === "shop"
        ? getShopOfferItems({
            gameId: game.id,
            currentPlayerId: game.currentPlayerId,
            turnNumber: game.turnNumber,
            pendingTileIndex: game.pendingTile.index,
            version: game.version,
          })
        : [];
    const stocksEnabled = snapshot.settings.stocksEnabled;
    const stockMarketClosedToday = stocksEnabled && isWeekendDateKey(game.currentDate);
    const canTradeStocks = Boolean(canManage && stocksEnabled && !stockMarketClosedToday);
    const currentTurnPlayer =
      game.players.find((player) => player.id === game.currentPlayerId) ?? null;
    const currentTurnControlLabel = getManagedStatusLabel(currentTurnPlayer);
    const currentTurnStatusLabel =
      currentTurnPlayer && currentTurnPlayer.abductedTurns > 0
        ? ` · 状态：被外星人抓走（剩 ${currentTurnPlayer.abductedTurns} 天）`
        : currentTurnPlayer && currentTurnPlayer.sleepwalkingTurns > 0
        ? ` · 状态：梦游中（剩 ${currentTurnPlayer.sleepwalkingTurns} 回合）`
        : "";
    const showManagedToggle = Boolean(viewer && !viewer.isBot && !viewer.isBankrupt);
    const botPlayers = game.players
      .filter((player) => player.isBot)
      .map((player) => ({
        ...player,
        ownedProperties: game.properties
          .filter((property) => property.ownerPlayerId === player.id)
          .map((property) => {
            const tile = game.board.find((boardTile) => boardTile.index === property.tileIndex);
            const isStandardProperty = tile?.type === "property";
            return {
              tileIndex: property.tileIndex,
              name: tile?.name ?? `地块 ${property.tileIndex}`,
              typeLabel: tile?.type === "railroad" ? "铁路" : "普通地产",
              buildingLabel: isStandardProperty
                ? property.hasHotel
                  ? "酒店"
                  : property.houseCount > 0
                    ? `${property.houseCount} 栋房屋`
                    : "空地"
                : "不可建造",
              mortgageLabel: property.mortgaged ? "已抵押" : "正常",
            };
          })
          .sort((left, right) => left.tileIndex - right.tileIndex),
      }));
    const canUseRemoteDiceNow = Boolean(
      viewer &&
        isCurrentTurn &&
        !viewerIsAbducted &&
        (game.phase === "WAITING_FOR_ROLL" ||
          game.phase === "WAITING_FOR_JAIL_CHOICE"),
    );

    if (!stocksEnabled && this.activeCompactPanel === "stocks") {
      this.activeCompactPanel = null;
    }

    if (botPlayers.length === 0 && this.showBotAssetsModal) {
      this.showBotAssetsModal = false;
      this.expandedBotPropertyPlayerIds.clear();
    }

    const wrapPanel = (title: string, content: string, extraClass = "") => `
      <section class="phaser-panel ${extraClass}">
        <div class="phaser-panel-title">${title}</div>
        ${content}
      </section>
    `;

    const renderRollDiceButtons = (labelSuffix = "") => {
      if (rollDiceOptions.length === 1) {
        return `<button class="phaser-primary-button" data-action="roll-dice" data-dice-count="1" ${busy}>掷 1 骰${labelSuffix}</button>`;
      }

      return `
        <div class="phaser-info-box">
          当前载具最多可掷 ${viewerMaxDiceCount} 个骰子，这一回合可以自行选择保守路线。
        </div>
        <div class="phaser-inline-actions">
          ${rollDiceOptions
            .map(
              (diceCount) => `
                <button
                  class="${diceCount === viewerMaxDiceCount ? "phaser-primary-button" : "phaser-secondary-button"}"
                  data-action="roll-dice"
                  data-dice-count="${diceCount}"
                  ${busy}
                >
                  掷 ${diceCount} 骰${labelSuffix}
                </button>
              `,
            )
            .join("")}
        </div>
      `;
    };

    const playerPanelBody = viewer
      ? `
          <div class="phaser-player-compact">
            <div class="phaser-player-compact-header">
              <div class="phaser-player-compact-title"><strong>${escapeHtml(viewer.character.name)} - ${escapeHtml(viewer.name)}</strong></div>
              <div class="phaser-player-compact-subtitle">神仙：${activeGodLabel} · 状态：${escapeHtml(activeStatusLabel)} · 控制：${escapeHtml(viewerManagedStatusLabel)}</div>
            </div>
            <div class="phaser-player-compact-grid">
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">现金</div>
                <div class="phaser-player-compact-value">${formatMoney(viewer.cash)}</div>
                <div class="phaser-player-compact-meta">总资产 ${formatMoney(viewer.totalAssets)}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">资产构成</div>
                <div class="phaser-player-compact-value">地产 ${formatMoney(viewer.propertyAssetValue)}</div>
                <div class="phaser-player-compact-meta">${stocksEnabled ? `股票 ${formatMoney(viewer.stockAssetValue)}` : "股票系统关闭"}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">银行</div>
                <div class="phaser-player-compact-value">存款 ${formatMoney(viewer.bankSavings)}</div>
                <div class="phaser-player-compact-meta">贷款 ${formatMoney(viewer.bankDebt)} · 次月 1 号自动扣本息</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">位置状态</div>
                <div class="phaser-player-compact-value">${positionStatusValue}</div>
                <div class="phaser-player-compact-meta">${positionStatusMeta}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">当前载具</div>
                <div class="phaser-player-compact-value">${escapeHtml(activeVehicleLabel)}</div>
                <div class="phaser-player-compact-meta">${viewerMaxDiceCount > 1 ? `本回合可选 1 ~ ${viewerMaxDiceCount} 骰` : "默认步行 1 骰"}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">彩票奖池</div>
                <div class="phaser-player-compact-value">${formatMoney(game.lottery.jackpot)}</div>
                <div class="phaser-player-compact-meta">${game.lottery.turnsUntilDraw} 回合后开奖</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">我的彩券</div>
                <div class="phaser-player-compact-value">${escapeHtml(viewerTicketSummary)}</div>
                <div class="phaser-player-compact-meta">${viewerLotteryTickets.length} 张</div>
              </div>
            </div>
          </div>
        `
      : `<div class="phaser-meta-stack"><div>当前为观战模式</div></div>`;

    const playerSummaryBody = viewer
      ? `
          <div class="phaser-player-compact">
            <div class="phaser-top-actions phaser-player-summary-head">
              <div>
                <div class="phaser-player-compact-title"><strong>${escapeHtml(viewer.character.name)} - ${escapeHtml(viewer.name)}</strong></div>
                <div class="phaser-player-compact-subtitle">这里只保留财产摘要，当前状态：${escapeHtml(activeStatusLabel)}。</div>
              </div>
              <button class="phaser-ghost-button" data-action="open-panel" data-panel="player">更多</button>
            </div>
            <div class="phaser-player-compact-grid">
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">现金</div>
                <div class="phaser-player-compact-value">${formatMoney(viewer.cash)}</div>
                <div class="phaser-player-compact-meta">总资产 ${formatMoney(viewer.totalAssets)}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">地产资产</div>
                <div class="phaser-player-compact-value">${formatMoney(viewer.propertyAssetValue)}</div>
                <div class="phaser-player-compact-meta">名下 ${ownedProperties.length} 处，详情看地产弹窗</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">股票资产</div>
                <div class="phaser-player-compact-value">${stocksEnabled ? formatMoney(viewer.stockAssetValue) : "已关闭"}</div>
                <div class="phaser-player-compact-meta">${stocksEnabled ? "买卖请到股票弹窗" : "本局未启用股票系统"}</div>
              </div>
              <div class="phaser-player-compact-card">
                <div class="phaser-player-compact-label">银行资产</div>
                <div class="phaser-player-compact-value">存款 ${formatMoney(viewer.bankSavings)}</div>
                <div class="phaser-player-compact-meta">贷款 ${formatMoney(viewer.bankDebt)} · 可提前还清</div>
              </div>
              <div class="phaser-player-compact-card phaser-player-compact-card-wide">
                <div class="phaser-player-compact-label">神明附身</div>
                <div class="phaser-player-compact-value">${escapeHtml(activeGodLabel)}</div>
                <div class="phaser-player-compact-meta">${escapeHtml(activeGodSummaryMeta)}</div>
              </div>
            </div>
          </div>
        `
      : `<div class="phaser-meta-stack"><div>当前为观战模式</div></div>`;

    const actionsPanelBody = `
      <div class="phaser-button-stack">
        ${
          viewerOwnsTurn && viewer?.isManaged
            ? `<div class="phaser-info-box">你当前处于${escapeHtml(viewerManagedStatusLabel)}，本回合会由系统代打；需要时可在右上角取消。</div>`
            : ""
        }
        ${
          viewerIsAbducted
            ? `<div class="phaser-info-box">你被外星人抓走了，从地图上暂时消失，还需等待 ${viewer?.abductedTurns ?? 0} 天才会回到原地；这段时间也无法收取过路费。</div>`
            : ""
        }
        ${
          viewerIsSleepwalking
            ? `<div class="phaser-info-box">你当前处于梦游状态，还剩 ${viewer?.sleepwalkingTurns ?? 0} 回合。梦游时只能前进和结算，不能买地、建房、使用道具、炒股或收过路费。</div>`
            : ""
        }
        ${
          isCurrentTurn && viewerIsReacting && reaction
            ? `
              <div class="phaser-info-box">${reactionPrompt}</div>
              <div class="phaser-button-stack">
                ${reactionItemDefinitions
                  .map(
                    (definition) => `
                      <button class="phaser-primary-button" data-action="use-item" data-item-key="${definition.key}" ${busy}>
                        使用${escapeHtml(definition.name)}
                      </button>
                    `,
                  )
                  .join("")}
                <button class="phaser-secondary-button" data-action="decline-reaction" ${busy}>这次不用</button>
              </div>
            `
            : ""
        }
        ${
          isCurrentTurn && game.phase === "WAITING_FOR_RECOVERY" && recovery && viewer
            ? `
              <div class="phaser-info-box">
                你当前现金不足，必须先抵押地产才能继续。应支付 ${formatMoney(recovery.amountDue)} 的${escapeHtml(recovery.reason)}，当前现金 ${formatMoney(viewer.cash)}，还差 ${formatMoney(recoveryShortfall)}。
              </div>
            `
            : ""
        }
        ${
          isCurrentTurn && game.phase === "WAITING_FOR_ROLL"
            ? renderRollDiceButtons()
            : ""
        }
        ${
          isCurrentTurn && game.phase === "WAITING_FOR_JAIL_CHOICE"
            ? `
              <div class="phaser-info-box">
                你正在监狱里，还需等待 ${viewer?.inJailTurns ?? 0} 天。这里不能交保释金；如果有玩家踩到监狱，监狱里的人会被立刻放出来。服刑归零后，会直接恢复到本回合掷骰。
              </div>
              ${
                (viewer?.jailFreeCards ?? 0) > 0
                  ? `<button class="phaser-secondary-button" data-action="use-jail-card" ${busy}>使用出狱卡</button>`
                  : ""
              }
              <button class="phaser-secondary-button" data-action="end-turn" ${busy}>${(viewer?.inJailTurns ?? 0) <= 1 ? "服刑结束并继续行动" : "今天先继续服刑"}</button>
            `
            : ""
        }
        ${
          isCurrentTurn && game.phase === "WAITING_FOR_PROPERTY_DECISION"
            ? `
              ${
                game.pendingTile?.type === "property" &&
                pendingPropertyState?.ownerPlayerId === viewer?.id
                  ? `
                    <div class="phaser-info-box">
                      ${
                        pendingHouseFailsByShuaishen
                          ? `已回到自己的地产 ${escapeHtml(game.pendingTile.name)}，但衰神附身时盖屋一定会失败。`
                          : canBuildCurrentTile
                          ? pendingHouseIsFree
                            ? `已回到自己的地产 ${escapeHtml(game.pendingTile.name)}，这次有财神护体，建房免费。`
                            : pendingHouseBuildsDouble
                              ? `已回到自己的地产 ${escapeHtml(game.pendingTile.name)}，这次有福神护体，建房会一次加盖两层。`
                              : `已回到自己的地产 ${escapeHtml(game.pendingTile.name)}，直接点棋盘上的建房入口就能升级。`
                          : `已回到自己的地产 ${escapeHtml(game.pendingTile.name)}，但当前现金不足，暂时无法建房。`
                      }
                    </div>
                    <button class="phaser-secondary-button" data-action="skip-purchase" ${busy}>暂不建房</button>
                  `
                  : `
                    ${
                      game.pendingTile?.type === "property" && pendingPurchaseHouseBonus > 0
                        ? `<div class="phaser-info-box">大福神护体，买下 ${escapeHtml(game.pendingTile.name)} 后会直接免费加盖 1 层房屋。</div>`
                        : ""
                    }
                    <button class="phaser-primary-button" data-action="buy-property" ${busy}>${game.pendingTile?.type === "property" && pendingPurchaseHouseBonus > 0 ? `买下地块并直接盖一层（${formatMoney(effectivePendingTilePrice)}）` : `买下地块（${formatMoney(effectivePendingTilePrice)}）`}</button>
                    <button class="phaser-secondary-button" data-action="skip-purchase" ${busy}>放弃购买</button>
                  `
              }
            `
            : ""
        }
        ${
          canShop
            ? `
              <div class="phaser-info-box">
                你停在道具店，可直接购买道具或离开商店。
              </div>
            `
            : ""
        }
        ${
          canLottery
            ? `
              <div class="phaser-info-box">
                每张彩券 ${formatMoney(game.lottery.ticketPrice)}，${game.lottery.turnsUntilDraw} 回合后开奖，当前奖池 ${formatMoney(game.lottery.jackpot)}。
              </div>
              <div class="phaser-lottery-grid">
                ${LOTTERY_OPTIONS.map(
                  (option) => `
                    <button class="phaser-chip-button phaser-lottery-ticket" data-action="buy-lottery-ticket" data-lottery-number="${option.number}" ${busy} ${canBuyLotteryTicket ? "" : "disabled"}>
                      <span class="phaser-ticket-color-dot is-${option.colorKey}"></span>
                      <span>${option.label}</span>
                    </button>
                  `,
                ).join("")}
              </div>
              <button class="phaser-secondary-button" data-action="skip-lottery" ${busy}>这次先不买</button>
            `
            : ""
        }
        ${
          canBank
            ? `
              <div class="phaser-info-box phaser-bank-note">
                <div class="phaser-bank-note-title">银行业务速览</div>
                <div class="phaser-bank-note-meta">
                  工资 ${formatMoneyCompact(effectivePassStartSalary)} · 监狱固定 3 天 · 借 ${formatMoneyCompact(effectiveBorrowAmount)} / 次月自动还 ${formatMoneyCompact(displayedRepayAmount)}
                </div>
              </div>
              <div class="phaser-bank-action-grid">
                <button class="phaser-chip-button" data-action="bank-action" data-bank-choice="deposit300" ${busy} ${canDeposit300 ? "" : "disabled"}>存 ${formatMoneyCompact(effectiveDeposit300)}</button>
                <button class="phaser-chip-button" data-action="bank-action" data-bank-choice="deposit600" ${busy} ${canDeposit600 ? "" : "disabled"}>存 ${formatMoneyCompact(effectiveDeposit600)}</button>
                <button class="phaser-chip-button" data-action="bank-action" data-bank-choice="withdraw" ${busy} ${canWithdrawSavings ? "" : "disabled"}>取存款</button>
                <button class="phaser-chip-button" data-action="bank-action" data-bank-choice="borrow" ${busy} ${canBorrowBank ? "" : "disabled"}>借 ${formatMoneyCompact(effectiveBorrowAmount)}</button>
                <button class="phaser-chip-button" data-action="bank-action" data-bank-choice="repay" ${busy} ${canRepayBank ? "" : "disabled"}>提前还 ${formatMoneyCompact(displayedRepayAmount)}</button>
              </div>
              <button class="phaser-secondary-button phaser-bank-exit-button" data-action="skip-bank" ${busy}>离开银行</button>
            `
            : ""
        }
        ${
          canMagic
            ? `
              <div class="phaser-info-box">
                只需决定请好神或给别人坏神。好神会在土地公、天使、大小财神、大小福神间随机出现；坏神会在破坏神、大小衰神、大小穷神间随机出现，持续 ${GOD_DURATION_TURNS} 天。
              </div>
              <div class="phaser-button-stack">
                <button class="phaser-chip-button" data-action="cast-magic" data-magic-key="good" ${busy}>
                  请好神（随机）
                </button>
              </div>
              ${
                otherPlayers.length > 0
                  ? `
                    <div class="phaser-meta-stack">
                      <div>给指定玩家坏神：</div>
                      <div class="phaser-inline-actions">
                        ${otherPlayers
                          .map(
                            (player) => `
                              <button class="phaser-chip-button" data-action="cast-magic" data-magic-key="bad" data-target-player-id="${player.id}" ${busy}>
                                ${escapeHtml(player.name)}
                              </button>
                            `,
                          )
                          .join("")}
                      </div>
                    </div>
                  `
                  : ""
              }
              <button class="phaser-secondary-button" data-action="skip-magic" ${busy}>今天先不施法</button>
            `
            : ""
        }
        ${
          canAmusement
            ? `
              <div class="phaser-info-box">
                三个小游戏都能直接拿奖金或道具。
              </div>
              <div class="phaser-button-stack">
                <button class="phaser-chip-button" data-action="play-amusement" data-amusement-choice="balloon" ${busy}>打气球</button>
                <button class="phaser-chip-button" data-action="play-amusement" data-amusement-choice="penguin" ${busy}>企鹅挖宝</button>
                <button class="phaser-chip-button" data-action="play-amusement" data-amusement-choice="treasure" ${busy}>接元宝</button>
              </div>
            `
            : ""
        }
        ${
          isCurrentTurn &&
          viewerIsAbducted &&
          ["WAITING_FOR_TURN_END", "WAITING_FOR_ABDUCTION_RETURN"].includes(game.phase)
            ? `<button class="phaser-primary-button" data-action="end-turn" ${busy}>${game.phase === "WAITING_FOR_ABDUCTION_RETURN" ? "再等一天" : "结束本回合"}</button>`
            : ""
        }
        ${
          isCurrentTurn && game.phase === "WAITING_FOR_TURN_END"
            ? `${viewerIsAbducted ? "" : `<button class="phaser-primary-button" data-action="end-turn" ${busy}>结束回合</button>`}`
            : ""
        }
      </div>
    `;

    const propertiesPanelBody =
      viewer && ownedProperties.length > 0
        ? `
            ${
              isCurrentTurn && game.phase === "WAITING_FOR_RECOVERY" && recovery
                ? `<div class="phaser-info-box">现金不足，先抵押地产。当前需要补足 ${formatMoney(recovery.amountDue)} 的${escapeHtml(recovery.reason)}，还差 ${formatMoney(recoveryShortfall)}。</div>`
                : ""
            }
            ${ownedProperties
              .map((property) => {
                const tile = game.board.find((item) => item.index === property.tileIndex);
                const mortgageValue =
                  tile && "price" in tile
                    ? getEffectiveMortgageValue(tile, inflationIndex)
                    : 0;
                const unmortgageCost =
                  tile && "price" in tile
                    ? getEffectiveUnmortgageCost(tile, inflationIndex)
                    : 0;
                return `
                  <div class="phaser-list-item phaser-clickable-list-item ${focusedTileIndex === property.tileIndex ? "is-selected" : ""}" data-action="focus-tile" data-tile-index="${property.tileIndex}">
                    <div>
                      <div class="phaser-list-title">${escapeHtml(tile?.name ?? `地块 ${property.tileIndex}`)}</div>
                      <div class="phaser-list-meta">
                        ${
                          property.hasHotel
                            ? "酒店"
                            : property.houseCount > 0
                              ? `${property.houseCount} 栋房屋`
                              : "未建设"
                        } - ${property.mortgaged ? "已抵押" : "正常"}
                      </div>
                      <div class="phaser-list-meta">
                        空地价 ${formatMoney(mortgageValue)} · ${
                          property.mortgaged
                            ? `赎回 ${formatMoney(unmortgageCost)}`
                            : `抵押可得 ${formatMoney(mortgageValue)}`
                        } · 点击这条可在棋盘上定位
                      </div>
                    </div>
                    <div class="phaser-inline-actions">
                      <button class="phaser-chip-button" data-action="toggle-mortgage" data-mortgaged="${property.mortgaged}" data-tile-index="${property.tileIndex}" ${busy} ${canManageMortgages ? "" : "disabled"}>
                        ${property.mortgaged ? "赎回" : "抵押"}
                      </button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          `
        : `<div class="phaser-meta-stack"><div>暂时还没有地产。</div></div>`;

    const stocksPanelBody = !stocksEnabled
      ? `<div class="phaser-meta-stack"><div>本局未启用股票系统。</div></div>`
      : `
          ${stockMarketClosedToday ? `<div class="phaser-info-box">今天是周末，股票休市，暂时不能买卖。</div>` : ""}
          <div class="phaser-scroll-region">
            ${game.stocks
              .map((stock) => {
                const holding = viewer
                  ? game.stockHoldings.find(
                      (item) =>
                        item.playerId === viewer.id && item.stockSymbol === stock.symbol,
                    )
                  : null;
                return `
                  <div class="phaser-list-item">
                    <div>
                      <div class="phaser-list-title">${escapeHtml(stock.symbol)} - ${escapeHtml(stock.name)}</div>
                      <div class="phaser-list-meta">
                        价格 ${stock.currentPrice}（${stock.change >= 0 ? "+" : ""}${stock.change}）- 剩余 ${stock.availableShares}
                      </div>
                      ${
                        viewer
                          ? `<div class="phaser-list-meta">持有 ${holding?.shares ?? 0} - 均价 ${holding?.averageCost ?? 0}</div>`
                          : ""
                      }
                    </div>
                    ${
                      viewer
                        ? `
                          <div class="phaser-inline-actions">
                            <button class="phaser-chip-button" data-action="trade-stock" data-trade-type="buy" data-stock-symbol="${stock.symbol}" data-shares="1" ${busy} ${canTradeStocks && stock.availableShares >= 1 ? "" : "disabled"}>买入 1</button>
                            <button class="phaser-chip-button" data-action="trade-stock" data-trade-type="buy" data-stock-symbol="${stock.symbol}" data-shares="5" ${busy} ${canTradeStocks && stock.availableShares >= 5 ? "" : "disabled"}>买入 5</button>
                            <button class="phaser-chip-button" data-action="trade-stock" data-trade-type="sell" data-stock-symbol="${stock.symbol}" data-shares="1" ${busy} ${canTradeStocks && (holding?.shares ?? 0) >= 1 ? "" : "disabled"}>卖出 1</button>
                            <button class="phaser-chip-button" data-action="trade-stock" data-trade-type="sell" data-stock-symbol="${stock.symbol}" data-shares="5" ${busy} ${canTradeStocks && (holding?.shares ?? 0) >= 5 ? "" : "disabled"}>卖出 5</button>
                          </div>
                        `
                        : ""
                    }
                  </div>
                `;
              })
              .join("")}
          </div>
        `;

    const itemsPanelBody = `
      ${
        canShop
          ? `
            <div class="phaser-info-box">
              本次货架随机刷新了 ${shopOffers.length} 件道具，只能从中购买 1 件。
            </div>
            <div class="phaser-scroll-region">
              ${shopOffers
                .map(
                  (item) => `
                    <div class="phaser-list-item">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(item.name)}</div>
                        <div class="phaser-list-meta">${escapeHtml(item.description)}</div>
                      </div>
                      <button class="phaser-primary-button" data-action="buy-item" data-item-key="${item.key}" ${busy}>
                        ${formatMoney(getEffectiveItemPrice(item, inflationIndex))}
                      </button>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <button class="phaser-secondary-button" data-action="skip-shop" ${busy}>离开商店</button>
          `
          : ""
      }
      ${
        viewerItems.length > 0
          ? viewerItems
              .map((item) => {
                const definition = getItemDefinition(item.itemKey);
                if (!definition) {
                  return "";
                }

                if (definition.key === REMOTE_DICE_ITEM_KEY) {
                  return `
                    <div class="phaser-list-item phaser-remote-dice-item">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(definition.name)} x${item.quantity}</div>
                        <div class="phaser-list-meta">${escapeHtml(definition.description)}</div>
                        <div class="phaser-list-meta">
                          当前可指定 1 ~ ${remoteDiceMaxTotal} 点${viewerMaxDiceCount > 1 ? `（载具最多 ${viewerMaxDiceCount} 骰）` : ""}
                        </div>
                      </div>
                      ${
                        canUseRemoteDiceNow
                          ? `
                            <div class="phaser-remote-dice-grid">
                              ${remoteDiceTotals
                                .map(
                                  (total) => `
                                    <button class="phaser-chip-button" data-action="roll-dice" data-item-key="${item.itemKey}" data-dice-total="${total}" ${busy}>
                                      ${total}
                                    </button>
                                  `,
                                )
                                .join("")}
                            </div>
                          `
                          : `<div class="phaser-list-meta">等到掷骰阶段时，可在这里直接指定本次总点数。</div>`
                      }
                    </div>
                  `;
                }

                if (definition.requiresTarget) {
                  return `
                    <div class="phaser-list-item">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(definition.name)} x${item.quantity}</div>
                        <div class="phaser-list-meta">${escapeHtml(definition.description)}</div>
                      </div>
                      <button class="phaser-chip-button" data-action="open-item-action" data-item-key="${item.itemKey}" ${busy} ${canManage ? "" : "disabled"}>
                        ${getItemActionButtonLabel(definition)}
                      </button>
                    </div>
                  `;
                }

                if (isReactionOnlyItem(definition)) {
                  return `
                    <div class="phaser-list-item">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(definition.name)} x${item.quantity}</div>
                        <div class="phaser-list-meta">${escapeHtml(definition.description)}</div>
                      </div>
                      <div class="phaser-pill">响应时使用</div>
                    </div>
                  `;
                }

                if (isPassiveAutoItem(definition)) {
                  return `
                    <div class="phaser-list-item">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(definition.name)} x${item.quantity}</div>
                        <div class="phaser-list-meta">${escapeHtml(definition.description)}</div>
                      </div>
                      <div class="phaser-pill">自动生效</div>
                    </div>
                  `;
                }

                return `
                  <div class="phaser-list-item">
                    <div>
                      <div class="phaser-list-title">${escapeHtml(definition.name)} x${item.quantity}</div>
                      <div class="phaser-list-meta">${escapeHtml(definition.description)}</div>
                    </div>
                    <button class="phaser-chip-button" data-action="open-item-action" data-item-key="${item.itemKey}" ${busy} ${canManage ? "" : "disabled"}>
                      ${getItemActionButtonLabel(definition)}
                    </button>
                  </div>
                `;
              })
              .join("")
          : `<div class="phaser-meta-stack"><div>背包里还没有道具。</div></div>`
      }
    `;

    const eventsPanelBody = `
      <div class="phaser-scroll-region">
        ${snapshot.recentEvents
          .map(
            (item) => `
              <div class="phaser-list-item">
                <div>
                  <div class="phaser-list-title">${escapeHtml(item.summary)}</div>
                  <div class="phaser-list-meta">#${item.sequence}</div>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;

    const panelRegistry: Record<HudOverlayPanel, { title: string; body: string }> = {
      player: { title: "玩家信息", body: playerPanelBody },
      properties: { title: "名下地产", body: propertiesPanelBody },
      stocks: { title: "股票市场", body: stocksPanelBody },
      items: { title: "背包与商店", body: itemsPanelBody },
      events: { title: "事件记录", body: eventsPanelBody },
    };
    const forcedRecoveryPanel: HudOverlayPanel | null =
      isCurrentTurn && game.phase === "WAITING_FOR_RECOVERY" ? "properties" : null;
    const activeDetailPanel = forcedRecoveryPanel ?? this.activeCompactPanel;
    const activePanelForNav = activeDetailPanel ?? this.activeCompactPanel;

    const modalLauncherPanel = wrapPanel(
      "更多窗口",
      `
        <div class="phaser-hud-modal-launch-grid">
          <button class="phaser-chip-button ${activePanelForNav === "properties" ? "is-selected" : ""}" data-action="open-panel" data-panel="properties">地产</button>
          ${stocksEnabled ? `<button class="phaser-chip-button ${activePanelForNav === "stocks" ? "is-selected" : ""}" data-action="open-panel" data-panel="stocks">股票</button>` : ""}
          <button class="phaser-chip-button ${activePanelForNav === "items" ? "is-selected" : ""}" data-action="open-panel" data-panel="items">背包 / 商店</button>
          <button class="phaser-chip-button ${activePanelForNav === "events" ? "is-selected" : ""}" data-action="open-panel" data-panel="events">事件</button>
        </div>
      `,
      "phaser-hud-modal-launch-panel",
    );

    const detailModal = activeDetailPanel
      ? `
          <div class="phaser-hud-modal-shell">
            ${
              forcedRecoveryPanel
                ? ""
                : `<button class="phaser-hud-modal-backdrop" data-action="close-panel" aria-label="关闭面板"></button>`
            }
            <section class="phaser-panel phaser-hud-modal-card">
              <div class="phaser-hud-modal-header">
                <div class="phaser-panel-title">${panelRegistry[activeDetailPanel].title}</div>
                ${
                  forcedRecoveryPanel
                    ? ""
                    : `<button class="phaser-ghost-button" data-action="close-panel">关闭</button>`
                }
              </div>
              <div class="phaser-hud-modal-body">
                ${panelRegistry[activeDetailPanel].body}
              </div>
            </section>
          </div>
        `
      : "";

    const botAssetsModal = this.showBotAssetsModal
      ? `
          <div class="phaser-hud-modal-shell">
            <button class="phaser-hud-modal-backdrop" data-action="close-panel" aria-label="关闭电脑资产弹窗"></button>
            <section class="phaser-panel phaser-hud-modal-card">
              <div class="phaser-hud-modal-header">
                <div>
                  <div class="phaser-panel-title">电脑资产</div>
                  <div class="phaser-list-meta">这里会汇总所有电脑玩家当前的现金、总资产、地产和银行状态。</div>
                </div>
                <button class="phaser-ghost-button" data-action="close-panel">关闭</button>
              </div>
              <div class="phaser-hud-modal-body">
                ${buildBotAssetModalBody(botPlayers, this.expandedBotPropertyPlayerIds)}
              </div>
            </section>
          </div>
        `
      : "";

    const itemActionModal =
      activeItemActionDefinition && activeItemActionInventory
        ? `
            <div class="phaser-hud-modal-shell phaser-item-action-modal-shell">
              <button class="phaser-hud-modal-backdrop" data-action="close-item-action" aria-label="关闭道具操作弹窗"></button>
              <section class="phaser-panel phaser-hud-modal-card phaser-item-action-card">
                <div class="phaser-hud-modal-header">
                  <div>
                    <div class="phaser-panel-title">${escapeHtml(activeItemActionDefinition.name)}</div>
                    <div class="phaser-list-meta">剩余 ${activeItemActionInventory.quantity} 张 · ${escapeHtml(getItemActionHint(activeItemActionDefinition))}</div>
                  </div>
                  <button class="phaser-ghost-button" data-action="close-item-action">关闭</button>
                </div>
                <div class="phaser-hud-modal-body">
                  <div class="phaser-info-box">
                    ${escapeHtml(activeItemActionDefinition.description)}
                  </div>
                  ${
                    activeItemActionDefinition.requiresTarget
                      ? otherPlayers.length > 0
                        ? `
                            <div class="phaser-item-action-target-grid">
                              ${otherPlayers
                                .map(
                                  (player) => `
                                    <button class="phaser-chip-button" data-action="use-item" data-item-key="${activeItemActionInventory.itemKey}" data-target-player-id="${player.id}" ${busy} ${canManage ? "" : "disabled"}>
                                      ${escapeHtml(player.name)}
                                    </button>
                                  `,
                                )
                                .join("")}
                            </div>
                          `
                        : `<div class="phaser-meta-stack"><div>场上暂时没有可指定的目标玩家。</div></div>`
                      : `
                          <div class="phaser-button-stack">
                            <button class="phaser-primary-button" data-action="use-item" data-item-key="${activeItemActionInventory.itemKey}" ${busy} ${canManage ? "" : "disabled"}>
                              ${escapeHtml(getItemActionConfirmLabel(activeItemActionDefinition))}
                            </button>
                            <button class="phaser-secondary-button" data-action="close-item-action">取消</button>
                          </div>
                        `
                  }
                  ${
                    canManage
                      ? ""
                      : `<div class="phaser-list-meta">只能在自己回合的可操作阶段使用道具。</div>`
                  }
                </div>
              </section>
            </div>
          `
        : "";

    const newsEventModal =
      activeAutoPopupEvent && activeAutoPopupContent
        ? `
            <div class="phaser-hud-modal-shell phaser-news-event-shell">
              <button class="phaser-hud-modal-backdrop" data-action="close-news-popup" aria-label="关闭事件快报"></button>
              <section class="phaser-panel phaser-hud-modal-card phaser-news-event-card">
                <div class="phaser-hud-modal-header">
                  <div>
                    <div class="phaser-panel-title">${activeAutoPopupContent.title}</div>
                    <div class="phaser-list-meta">#${activeAutoPopupEvent.sequence} · ${activeAutoPopupContent.meta}</div>
                  </div>
                  <button class="phaser-ghost-button" data-action="close-news-popup">知道了</button>
                </div>
                <div class="phaser-hud-modal-body">
                  <div class="phaser-info-box">${escapeHtml(activeAutoPopupContent.body)}</div>
                  <div class="phaser-list-meta">完整记录也会同步保留在“更多 - 事件”里。</div>
                </div>
              </section>
            </div>
          `
        : "";

    const bankruptcyConfirmModal =
      this.showBankruptcyConfirm && viewer
        ? `
            <div class="phaser-hud-modal-shell phaser-bankruptcy-confirm-shell">
              <button class="phaser-hud-modal-backdrop" data-action="cancel-bankruptcy" aria-label="关闭破产确认"></button>
              <section class="phaser-panel phaser-hud-modal-card phaser-bankruptcy-confirm-card">
                <div class="phaser-hud-modal-header">
                  <div>
                    <div class="phaser-panel-title">确认宣告破产</div>
                    <div class="phaser-list-meta">这是不可撤销操作，确认后会立刻退出当前对局</div>
                  </div>
                  <button class="phaser-ghost-button" data-action="cancel-bankruptcy">再想想</button>
                </div>
                <div class="phaser-hud-modal-body">
                  <div class="phaser-info-box">
                    ${
                      game.phase === "WAITING_FOR_RECOVERY" && recovery
                        ? `你当前还差 ${formatMoney(recoveryShortfall)} 才能补足 ${formatMoney(recovery.amountDue)} 的${escapeHtml(recovery.reason)}。如果继续抵押地产，也许还能保住这局。`
                        : `如果现在确认，${escapeHtml(viewer.name)} 会立刻被判定为破产并失去后续操作资格。`
                    }
                  </div>
                  <div class="phaser-list-meta">
                    只有确定不再继续抵押、赎回或等待翻盘时，再执行这个操作。
                  </div>
                  <div class="phaser-button-stack">
                    <button class="phaser-quiet-danger-button" data-action="confirm-bankruptcy" ${busy}>确认破产</button>
                    <button class="phaser-secondary-button" data-action="cancel-bankruptcy">取消</button>
                  </div>
                </div>
              </section>
            </div>
          `
        : "";

    const navigateHomeConfirmModal =
      this.showNavigateHomeConfirm
        ? `
            <div class="phaser-hud-modal-shell phaser-navigate-home-shell">
              <button class="phaser-hud-modal-backdrop" data-action="cancel-navigate-home" aria-label="关闭返回首页确认"></button>
              <section class="phaser-panel phaser-hud-modal-card phaser-navigate-home-card">
                <div class="phaser-hud-modal-header">
                  <div>
                    <div class="phaser-panel-title">确认回首页</div>
                    <div class="phaser-list-meta">当前对局不会暂停，离开后仍可通过房间链接或房间列表回来</div>
                  </div>
                  <button class="phaser-ghost-button" data-action="cancel-navigate-home">继续留在房间</button>
                </div>
                <div class="phaser-hud-modal-body">
                  <div class="phaser-info-box">
                    你将离开房间 ${escapeHtml(snapshot.code)} 的当前页面并返回首页。其他玩家和电脑仍会继续这局，系统不会自动替你结算本回合。
                  </div>
                  <div class="phaser-list-meta">
                    如果只是想临时离开页面，稍后仍可以重新进入这个房间继续查看或操作。
                  </div>
                  <div class="phaser-button-stack">
                    <button class="phaser-primary-button" data-action="confirm-navigate-home">确认回首页</button>
                    <button class="phaser-secondary-button" data-action="cancel-navigate-home">取消</button>
                  </div>
                </div>
              </section>
            </div>
          `
        : "";

    const sidebarPanels = `
      ${wrapPanel("财产信息", playerSummaryBody)}
      ${wrapPanel("当前操作", actionsPanelBody)}
      ${modalLauncherPanel}
    `;

    wrapper.innerHTML = `
      <div class="phaser-hud-shell">
        <div class="phaser-hud-topbar">
          <div class="phaser-hud-room">
            <div class="phaser-eyebrow">房间 ${snapshot.code}</div>
            <div class="phaser-hud-title">第 ${game.roundNumber} 天 - ${escapeHtml(getPhaseLabel(game.phase))}</div>
            <div class="phaser-hud-meta">当前日期：${escapeHtml(currentDateLabel)} · 整轮天数：第 ${game.roundNumber} 天（所有未破产玩家都行动一轮后才会 +1） · 当前行动玩家：${escapeHtml(currentTurnPlayer?.name ?? "未知玩家")} · 控制：${escapeHtml(currentTurnControlLabel)}${escapeHtml(currentTurnStatusLabel)}${currentTurnPlayer?.activeVehicle ? ` · 载具：${escapeHtml(currentTurnPlayer.activeVehicle.name)}` : ""} · 实时同步：${this.state.connected ? "已连接" : "重连中"}</div>
          </div>
          <div class="phaser-inline-actions">
            ${
              botPlayers.length > 0
                ? `<button class="phaser-ghost-button" data-action="open-bot-assets">电脑资产</button>`
                : ""
            }
            ${
              showManagedToggle
                ? `<button class="phaser-ghost-button" data-action="${viewer?.isManaged ? "disable-managed" : "enable-managed"}" ${busy}>
                    ${viewer?.isManaged ? "取消托管" : "开启托管"}
                  </button>`
                : ""
            }
            <button class="phaser-ghost-button" data-action="request-navigate-home">
              回首页
            </button>
            <button class="phaser-ghost-button" data-action="toggle-audio">
              音效${this.runtime.audio.enabled ? "开启" : "关闭"}
            </button>
          </div>
        </div>

        <aside class="phaser-hud-sidebar">
          ${
            this.state.errorMessage
              ? `<div class="phaser-error">${escapeHtml(this.state.errorMessage)}</div>`
              : ""
          }
          ${sidebarPanels}
          ${
            isCurrentTurn
              ? `
                  <div class="phaser-hud-danger-corner">
                    <button class="phaser-quiet-danger-button" data-action="declare-bankruptcy" ${busy}>宣告破产</button>
                  </div>
                `
              : ""
          }
        </aside>
        ${detailModal}
        ${botAssetsModal}
        ${itemActionModal}
        ${newsEventModal}
        ${navigateHomeConfirmModal}
        ${bankruptcyConfirmModal}
      </div>
    `;
  };
}
