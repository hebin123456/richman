import Phaser from "phaser";

import { BaseScene } from "@/game-client/phaser/BaseScene";
import type { GameRuntime } from "@/game-client/phaser/GameRuntime";
import {
  CHARACTER_PRESETS,
  getCharacterAvatarTextureKey,
  getCharacterPortraitTextureKey,
  type CharacterId,
  type CharacterPreset,
} from "@/lib/game/characters";
import { fitWrappedText } from "@/game-client/utils/textLayout";
import { getCharacterContent } from "@/lib/game/character-content";
import type { RoomListItemView, RoomSettingsInput } from "@/lib/game/types";

const DEFAULT_SETTINGS: RoomSettingsInput = {
  startingCash: 2000,
  passStartSalary: 200,
  maxPlayers: 4,
  jailFine: 100,
  parkingJackpotEnabled: true,
  stocksEnabled: false,
  turnSeconds: 120,
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface HomeSceneLayout {
  compact: boolean;
  titleX: number;
  titleY: number;
  stageX: number;
  stageY: number;
  stageWidth: number;
  stageHeight: number;
  domX: number;
  domY: number;
  domWidth: number;
  domMaxHeight: number;
}

export class HomeScene extends BaseScene {
  private root: Phaser.GameObjects.DOMElement | null = null;

  private background!: Phaser.GameObjects.Graphics;

  private stagePanel!: Phaser.GameObjects.Graphics;

  private titleText!: Phaser.GameObjects.Text;

  private nameText!: Phaser.GameObjects.Text;

  private roleText!: Phaser.GameObjects.Text;

  private detailText!: Phaser.GameObjects.Text;

  private pieceText!: Phaser.GameObjects.Text;

  private portraitImage!: Phaser.GameObjects.Image;

  private quoteText!: Phaser.GameObjects.Text;

  private createForm = {
    hostName: "房主01",
    characterId: CHARACTER_PRESETS[4]?.id ?? "sunxiaomei",
    settings: { ...DEFAULT_SETTINGS },
  };

  private joinForm = {
    roomCode: "",
    playerName: "玩家02",
    characterId: CHARACTER_PRESETS[0]?.id ?? "atubo",
  };

  private showAdvancedSettings = false;

  private showRulesPanel = false;

  constructor(runtime: GameRuntime) {
    super("HomeScene", runtime);
  }

  create() {
    this.cameras.main.setBackgroundColor("#07111d");
    this.background = this.add.graphics();
    this.stagePanel = this.add.graphics();

    this.titleText = this.add.text(0, 0, "掌上大富翁", {
      fontFamily: "Arial",
      fontSize: "46px",
      fontStyle: "bold",
      color: "#f8fafc",
    });

    this.nameText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "40px",
      fontStyle: "bold",
      color: "#0f172a",
    });

    this.roleText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#334155",
    });

    this.detailText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#334155",
      wordWrap: { width: 220 },
      lineSpacing: 8,
    });

    this.pieceText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "132px",
      fontStyle: "bold",
      color: "#ffffff",
    });
    this.pieceText.setOrigin(0.5, 0.5);
    this.pieceText.setAlpha(0.3);

    this.portraitImage = this.add.image(
      0,
      0,
      getCharacterPortraitTextureKey(CHARACTER_PRESETS[4]?.id ?? "sunxiaomei"),
    );
    this.portraitImage.setOrigin(0.5, 0.5);

    this.quoteText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#0f172a",
      wordWrap: { width: 340, useAdvancedWrap: true },
      lineSpacing: 10,
    });

    const root = document.createElement("div");
    root.className = "phaser-dom-root phaser-home-root";
    this.root = this.add.dom(0, 0, root).setOrigin(0.5, 0.5);

    root.addEventListener("click", this.handleClick);
    root.addEventListener("input", this.handleInput);
    root.addEventListener("change", this.handleChange);

    this.bindRuntime(() => this.renderScene());
    this.scale.on("resize", this.renderScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      root.removeEventListener("click", this.handleClick);
      root.removeEventListener("input", this.handleInput);
      root.removeEventListener("change", this.handleChange);
      this.scale.off("resize", this.renderScene, this);
    });

    this.renderScene();
  }

  private handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.name) {
      return;
    }

    switch (target.name) {
      case "hostName":
        this.createForm.hostName = target.value;
        break;
      case "joinRoomCode":
        this.joinForm.roomCode = target.value.replace(/\D/g, "").slice(0, 4);
        target.value = this.joinForm.roomCode;
        break;
      case "joinName":
        this.joinForm.playerName = target.value;
        break;
      case "startingCash":
      case "passStartSalary":
      case "maxPlayers":
      case "jailFine":
      case "turnSeconds":
        this.createForm.settings = {
          ...this.createForm.settings,
          [target.name]: Number(target.value),
        };
        break;
      default:
        break;
    }
  };

  private handleChange = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name) {
      return;
    }

    if (target.name === "parkingJackpotEnabled") {
      const checkbox = target as HTMLInputElement;
      this.createForm.settings = {
        ...this.createForm.settings,
        parkingJackpotEnabled: checkbox.checked,
      };
      return;
    }

    if (target.name === "createCharacterId") {
      this.createForm.characterId = target.value as CharacterId;
      this.renderScene();
      return;
    }

    if (target.name === "joinCharacterId") {
      this.joinForm.characterId = target.value as CharacterId;
      this.renderScene();
    }
  };

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

    if (action === "pick-create-character" && actionTarget.dataset.characterId) {
      this.createForm.characterId =
        actionTarget.dataset.characterId as CharacterId;
      this.renderScene();
      return;
    }

    if (action === "pick-join-character" && actionTarget.dataset.characterId) {
      this.joinForm.characterId =
        actionTarget.dataset.characterId as CharacterId;
      this.renderScene();
      return;
    }

    if (action === "toggle-jackpot") {
      this.createForm.settings = {
        ...this.createForm.settings,
        parkingJackpotEnabled: !this.createForm.settings.parkingJackpotEnabled,
      };
      this.renderScene();
      return;
    }

    if (action === "toggle-stocks") {
      this.createForm.settings = {
        ...this.createForm.settings,
        stocksEnabled: !this.createForm.settings.stocksEnabled,
      };
      this.renderScene();
      return;
    }

    if (action === "toggle-advanced-settings") {
      this.showAdvancedSettings = !this.showAdvancedSettings;
      this.renderScene();
      return;
    }

    if (action === "toggle-rules") {
      this.showRulesPanel = !this.showRulesPanel;
      this.renderScene();
      return;
    }

    if (action === "create-room") {
      void this.runtime.createRoom({
        hostName: this.createForm.hostName,
        characterId: this.createForm.characterId,
        settings: this.createForm.settings,
      });
      return;
    }

    if (action === "join-room") {
      void this.runtime.joinFromHome({
        roomCode: this.joinForm.roomCode,
        playerName: this.joinForm.playerName,
        characterId: this.joinForm.characterId,
      });
      return;
    }

    if (action === "join-listed-room" && actionTarget.dataset.roomCode) {
      void this.runtime.joinFromHome({
        roomCode: actionTarget.dataset.roomCode,
        playerName: this.joinForm.playerName,
        characterId: this.joinForm.characterId,
      });
      return;
    }

    if (action === "refresh-room-list") {
      void this.runtime.refreshOpenRooms();
    }
  };

  private renderScene = () => {
    this.drawBackdrop();
    this.renderSpotlight();
    this.renderDom();
  };

  private drawBackdrop() {
    const { width, height } = this.scale;
    const layout = this.getLayout();
    this.background.clear();
    this.background.fillGradientStyle(0x07111d, 0x101d34, 0x091525, 0x07111d, 1);
    this.background.fillRect(0, 0, width, height);

    this.background.fillStyle(0xffffff, 0.08);
    this.background.fillCircle(width * 0.12, height * 0.16, 120);
    this.background.fillCircle(width * 0.84, height * 0.28, 150);
    this.background.fillCircle(width * 0.68, height * 0.78, 110);

    const titleX = layout.compact
      ? Math.max(24, (width - this.titleText.width) * 0.5)
      : layout.titleX;
    this.titleText.setPosition(titleX, layout.titleY);
  }

  private renderSpotlight() {
    const layout = this.getLayout();
    const spotlight = this.getSpotlightCharacter();
    const content = getCharacterContent(spotlight.id);
    const innerX = layout.stageX + 20;
    const innerWidth = layout.stageWidth - 40;
    const textColumnWidth = Math.max(164, layout.stageWidth - 176);
    const headerHeight = clamp(layout.stageHeight * 0.19, 86, 104);
    const detailY = layout.stageY + headerHeight + 36;
    const quoteValue = `登场台词\n“${content.lobbyLine}”`;
    const minDetailHeight = layout.compact ? 52 : 72;
    const availableQuoteHeight = Math.max(
      layout.compact ? 116 : 128,
      layout.stageY + layout.stageHeight - 20 - detailY - 16 - minDetailHeight,
    );
    const maxQuoteHeight = clamp(
      availableQuoteHeight,
      layout.compact ? 116 : 128,
      layout.compact ? 172 : 212,
    );
    const quoteFit = fitWrappedText(this.quoteText, {
      content: quoteValue,
      maxWidth: textColumnWidth,
      maxHeight: maxQuoteHeight - (layout.compact ? 28 : 34),
      preferredFontSize: layout.compact ? 16 : 18,
      minFontSize: layout.compact ? 11 : 13,
      preferredLineSpacing: layout.compact ? 8 : 10,
      minLineSpacing: 3,
    });
    const quoteHeight = clamp(
      quoteFit.textHeight + (layout.compact ? 28 : 34),
      layout.compact ? 116 : 128,
      maxQuoteHeight,
    );
    const quoteY = layout.stageY + layout.stageHeight - quoteHeight - 20;
    const detailHeight = Math.max(minDetailHeight, quoteY - detailY - 16);
    const portraitWidth = layout.compact ? 118 : 162;
    const portraitHeight = layout.compact ? 164 : 226;
    const portraitX = layout.stageX + layout.stageWidth * 0.75;
    const portraitY = layout.stageY + layout.stageHeight * 0.55;
    const portraitKey = getCharacterPortraitTextureKey(spotlight.id);
    const avatarKey = getCharacterAvatarTextureKey(spotlight.id);
    const displayKey = this.textures.exists(portraitKey) ? portraitKey : avatarKey;
    const hasPortrait = this.textures.exists(displayKey);

    this.stagePanel.clear();
    this.stagePanel.fillStyle(0xfff7ed, 0.96);
    this.stagePanel.fillRoundedRect(
      layout.stageX,
      layout.stageY,
      layout.stageWidth,
      layout.stageHeight,
      28,
    );
    this.stagePanel.fillStyle(0x0f172a, 0.06);
    this.stagePanel.fillRoundedRect(innerX, layout.stageY + 20, innerWidth, headerHeight, 24);
    this.stagePanel.fillStyle(0x0f172a, 0.045);
    this.stagePanel.fillRoundedRect(innerX, detailY, innerWidth, detailHeight, 24);
    this.stagePanel.fillStyle(0x0f172a, 0.04);
    this.stagePanel.fillRoundedRect(innerX, quoteY, innerWidth, quoteHeight, 24);
    this.stagePanel.fillStyle(0x0f172a, 0.08);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5 + 10,
      portraitY - portraitHeight * 0.5 + 14,
      portraitWidth,
      portraitHeight,
      28,
    );
    this.stagePanel.fillStyle(0xffffff, 0.96);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5,
      portraitY - portraitHeight * 0.5,
      portraitWidth,
      portraitHeight,
      28,
    );
    this.stagePanel.fillStyle(0xf8fafc, 0.92);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.34,
      portraitY + portraitHeight * 0.38,
      portraitWidth * 0.68,
      14,
      8,
    );

    this.nameText.setText(spotlight.name);
    this.nameText.setPosition(layout.stageX + 32, layout.stageY + 42);

    this.roleText.setText(`${spotlight.title} | ${content.tagline}`);
    this.roleText.setWordWrapWidth(layout.stageWidth - 72);
    this.roleText.setPosition(layout.stageX + 34, layout.stageY + 86);

    this.detailText.setWordWrapWidth(textColumnWidth);
    this.detailText.setText(`角色特色\n${spotlight.description}`);
    this.detailText.setPosition(layout.stageX + 34, detailY + 18);

    if (hasPortrait) {
      this.portraitImage.setVisible(true);
      this.portraitImage.setTexture(displayKey);
      this.portraitImage.setPosition(portraitX, portraitY);
      this.portraitImage.setDisplaySize(portraitWidth * 0.92, portraitHeight * 0.92);

      this.pieceText.setFontSize(layout.compact ? 20 : 24);
      this.pieceText.setColor("#0f172a");
      this.pieceText.setAlpha(0.78);
      this.pieceText.setText(`专属棋子 ${spotlight.piece}`);
      this.pieceText.setPosition(portraitX, portraitY + portraitHeight * 0.44);
    } else {
      this.portraitImage.setVisible(false);
      this.pieceText.setFontSize(layout.compact ? 112 : 150);
      this.pieceText.setColor("#ffffff");
      this.pieceText.setAlpha(0.3);
      this.pieceText.setText(spotlight.piece);
      this.pieceText.setPosition(
        layout.stageX + layout.stageWidth * 0.73,
        layout.stageY + layout.stageHeight * 0.57,
      );
    }

    this.quoteText.setFontSize(quoteFit.fontSize);
    this.quoteText.setLineSpacing(quoteFit.lineSpacing);
    this.quoteText.setWordWrapWidth(textColumnWidth, true);
    this.quoteText.setText(quoteValue);
    this.quoteText.setPosition(layout.stageX + 36, quoteY + 24);

    if (layout.compact) {
      this.root?.setOrigin(0.5, 0);
    } else {
      this.root?.setOrigin(0, 0);
    }
    this.root?.setPosition(layout.domX, layout.domY);
  }

  private renderDom() {
    if (!this.root) {
      return;
    }

    const layout = this.getLayout();
    const wrapper = this.root.node as HTMLDivElement;
    const state = this.state;
    const busy = state.busy ? "disabled" : "";
    const maxHeight = Math.max(260, Math.floor(layout.domMaxHeight));
    const createCharacter =
      CHARACTER_PRESETS.find((character) => character.id === this.createForm.characterId) ??
      CHARACTER_PRESETS[0];
    const joinCharacter =
      CHARACTER_PRESETS.find((character) => character.id === this.joinForm.characterId) ??
      CHARACTER_PRESETS[0];
    const errorHtml = state.errorMessage
      ? `<div class="phaser-error">${escapeHtml(state.errorMessage)}</div>`
      : "";
    const existingRoomsHtml = this.renderExistingRoomsSection();
    const rulesModalHtml = this.showRulesPanel ? this.renderRulesModal() : "";

    wrapper.style.width = `${Math.floor(layout.domWidth)}px`;

    wrapper.innerHTML = `
      <div class="phaser-ui-screen" style="max-height:${maxHeight}px;">
        <div class="phaser-home-header-row">
          <div>
            <div class="phaser-eyebrow">掌上大富翁</div>
            <div class="phaser-screen-title">在游戏舞台中创建房间</div>
          </div>
          <button
            class="phaser-ghost-button phaser-home-help-button ${this.showRulesPanel ? "is-open" : ""}"
            data-action="toggle-rules"
            aria-label="查看规则"
            title="查看规则"
          >
            ?
          </button>
        </div>
        <div class="phaser-screen-copy">
          创建房间、挑选经典角色、调整房规，然后直接开始一局掌上大富翁。
        </div>
        <div class="phaser-home-highlights">
          <div class="phaser-pill">经典角色</div>
          <div class="phaser-pill">实时联机</div>
          <div class="phaser-pill">房规自定义</div>
        </div>
        ${errorHtml}
        <div class="phaser-home-grid">
          <section class="phaser-panel phaser-home-form-panel">
            <div class="phaser-panel-title">创建房间</div>
            <div class="phaser-home-form-grid">
              <label class="phaser-field">
                <span>房主昵称</span>
                <input name="hostName" value="${escapeHtml(this.createForm.hostName)}" maxlength="16" />
              </label>
              <label class="phaser-field">
                <span>选择角色</span>
                ${this.renderCharacterSelect("createCharacterId", this.createForm.characterId)}
              </label>
            </div>
            <div class="phaser-list-meta phaser-home-form-meta">
              已选角色：${escapeHtml(createCharacter.name)} · ${escapeHtml(createCharacter.title)} · 专属棋子 ${escapeHtml(createCharacter.piece)}
            </div>
            <div class="phaser-settings-grid">
              ${this.renderNumberField("startingCash", "起始资金", this.createForm.settings.startingCash)}
              ${this.renderNumberField("maxPlayers", "最大人数", this.createForm.settings.maxPlayers)}
            </div>
            <button class="phaser-chip-button" data-action="toggle-advanced-settings" ${busy}>
              ${this.showAdvancedSettings ? "收起高级规则" : "展开高级规则"}
            </button>
            ${
              this.showAdvancedSettings
                ? `
                  <div class="phaser-advanced-stack">
                    <div class="phaser-settings-grid">
                      ${this.renderNumberField("passStartSalary", "经过起点工资", this.createForm.settings.passStartSalary)}
                      ${this.renderNumberField("turnSeconds", "回合时长", this.createForm.settings.turnSeconds)}
                    </div>
                    <div class="phaser-list-meta">
                      监狱规则固定为 3 天，不能保释；待满后会在当回合继续掷骰。如果有人踩到监狱，监狱里的人会被立即放出来。
                    </div>
                    <button class="phaser-chip-button ${this.createForm.settings.parkingJackpotEnabled ? "is-selected" : ""}" data-action="toggle-jackpot" ${busy}>
                      免费停车奖金池：${this.createForm.settings.parkingJackpotEnabled ? "开启" : "关闭"}
                    </button>
                    <button class="phaser-chip-button ${this.createForm.settings.stocksEnabled ? "is-selected" : ""}" data-action="toggle-stocks" ${busy}>
                      股票系统：${this.createForm.settings.stocksEnabled ? "开启" : "关闭（默认）"}
                    </button>
                  </div>
                `
                : ""
            }
            <button class="phaser-primary-button" data-action="create-room" ${busy}>
              ${state.busy ? "创建中..." : "创建房间"}
            </button>
          </section>
          <section class="phaser-panel phaser-home-form-panel">
            <div class="phaser-panel-title">加入房间</div>
            <div class="phaser-home-form-grid">
              <label class="phaser-field">
                <span>4位房间号</span>
                <input name="joinRoomCode" value="${escapeHtml(this.joinForm.roomCode)}" maxlength="4" inputmode="numeric" />
              </label>
              <label class="phaser-field">
                <span>玩家昵称</span>
                <input name="joinName" value="${escapeHtml(this.joinForm.playerName)}" maxlength="16" />
              </label>
              <label class="phaser-field phaser-field--span-2">
                <span>选择角色</span>
                ${this.renderCharacterSelect("joinCharacterId", this.joinForm.characterId)}
              </label>
            </div>
            <div class="phaser-list-meta phaser-home-form-meta">
              将以 ${escapeHtml(joinCharacter.name)} · ${escapeHtml(joinCharacter.title)} 进入房间。
            </div>
            <button class="phaser-secondary-button" data-action="join-room" ${busy}>
              ${state.busy ? "加入中..." : "加入房间"}
            </button>
          </section>
        </div>
        ${existingRoomsHtml}
      </div>
      ${rulesModalHtml}
    `;
  }

  private renderRulesModal() {
    return `
      <div class="phaser-hud-modal-shell phaser-home-rules-modal-shell">
        <button class="phaser-hud-modal-backdrop" data-action="toggle-rules" aria-label="关闭规则弹窗"></button>
        <section class="phaser-panel phaser-hud-modal-card phaser-home-rules-panel phaser-home-rules-modal-card">
          <div class="phaser-hud-modal-header">
            <div>
              <div class="phaser-panel-title">基础规则</div>
              <div class="phaser-list-meta">开局前先看一眼，进房后就能直接开玩。</div>
            </div>
            <button class="phaser-ghost-button" data-action="toggle-rules">关闭</button>
          </div>
          <div class="phaser-hud-modal-body phaser-home-rules-modal-body">
            <div class="phaser-home-rules-grid">
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">轮次与日期</div>
                <div class="phaser-list-meta">
                  单个玩家行动只算自己的出手，不算新的一天；所有未破产玩家都行动一轮后，游戏日期和“第 N 天”才会一起推进 1。
                </div>
              </article>
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">地产与过路费</div>
                <div class="phaser-list-meta">
                  无主地产可以购买；别人的地产要付过路费，空地同样收费；抵押中的地产和坐牢中的地主不收租。
                </div>
              </article>
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">银行与抵押</div>
                <div class="phaser-list-meta">
                  每月 1 号存款自动结息 10%。贷款会在次月 1 号自动扣本息；现金不够时先抵押地产，无房可抵押才会破产。
                </div>
              </article>
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">抵押和赎回</div>
                <div class="phaser-list-meta">
                  抵押按空地价计算，和盖了几栋房子无关；赎回随时可做，但要额外支付空地价 10% 的服务费。
                </div>
              </article>
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">特色系统</div>
                <div class="phaser-list-meta">
                  商店、卡片、神明都会带来随机事件；摩托车和汽车会提升可掷骰子数；股票系统可在开房时决定是否开启。
                </div>
              </article>
              <article class="phaser-home-rule-card">
                <div class="phaser-list-title">胜负条件</div>
                <div class="phaser-list-meta">
                  玩家在关键付款时若无现金且没有可抵押地产，就会破产出局；坚持到最后的玩家获胜。
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  private renderExistingRoomsSection() {
    const state = this.state;
    const loadingText = state.loadingRoomList ? "正在刷新房间列表..." : "刷新列表";
    const roomsContent = state.loadingRoomList
      ? `<div class="phaser-info-box">正在加载可直接加入的房间，请稍候。</div>`
      : state.openRooms.length > 0
        ? `
            <div class="phaser-room-list-grid">
              ${state.openRooms
                .map((room) => this.renderExistingRoomCard(room))
                .join("")}
            </div>
          `
        : `<div class="phaser-meta-stack"><div>当前还没有可直接加入的大厅房间。</div></div>`;

    return `
      <section class="phaser-panel phaser-home-room-list-panel">
        <div class="phaser-top-actions">
          <div>
            <div class="phaser-panel-title">已有房间</div>
            <div class="phaser-list-meta">挑一个还有空位的大厅，直接用右侧昵称和角色加入。</div>
          </div>
          <button class="phaser-chip-button" data-action="refresh-room-list" ${state.busy || state.loadingRoomList ? "disabled" : ""}>
            ${loadingText}
          </button>
        </div>
        ${roomsContent}
      </section>
    `;
  }

  private renderExistingRoomCard(room: RoomListItemView) {
    const state = this.state;
    const selectedCharacterTaken = room.takenCharacterIds.includes(this.joinForm.characterId);
    const canQuickJoin = !selectedCharacterTaken && room.playerCount < room.maxPlayers;
    const playerSummary = room.players
      .map((player) => `${player.characterName}-${player.name}${player.isHost ? "（房主）" : ""}`)
      .join("、");

    return `
      <article class="phaser-room-card">
        <div class="phaser-room-card-head">
          <div>
            <div class="phaser-list-title">房间 ${escapeHtml(room.code)}</div>
            <div class="phaser-list-meta">房主：${escapeHtml(room.hostName)} · 人数 ${room.playerCount}/${room.maxPlayers}</div>
          </div>
          <div class="phaser-pill">${room.playerCount < room.maxPlayers ? "可加入" : "已满"}</div>
        </div>
        <div class="phaser-list-meta">当前玩家：${escapeHtml(playerSummary)}</div>
        <div class="phaser-list-meta">
          ${selectedCharacterTaken ? `当前选择的角色已被该房间占用，请先换角色。` : `将以 ${escapeHtml(this.joinForm.playerName || "玩家")} / ${escapeHtml(CHARACTER_PRESETS.find((character) => character.id === this.joinForm.characterId)?.name ?? "未选角色")} 直接加入。`}
        </div>
        <div class="phaser-inline-actions">
          <button class="phaser-secondary-button" data-action="join-listed-room" data-room-code="${room.code}" ${state.busy || !canQuickJoin ? "disabled" : ""}>
            直接加入
          </button>
        </div>
      </article>
    `;
  }

  private renderCharacterCards(
    mode: "create" | "join",
    selectedId: string,
    compact = false,
  ) {
    return CHARACTER_PRESETS.map((character) => {
      const selectedClass = character.id === selectedId ? "is-selected" : "";
      const compactClass = compact ? "is-compact" : "";
      return `
        <button
          class="phaser-character-card ${selectedClass} ${compactClass}"
          data-action="pick-${mode}-character"
          data-character-id="${character.id}"
        >
          <span class="phaser-character-name">${escapeHtml(character.name)}</span>
          ${compact ? "" : `<span class="phaser-character-meta">${escapeHtml(character.title)}</span>`}
        </button>
      `;
    }).join("");
  }

  private renderCharacterSelect(name: string, selectedId: string) {
    return `
      <select name="${name}" class="phaser-select">
        ${CHARACTER_PRESETS.map(
          (character) => `
            <option value="${character.id}" ${character.id === selectedId ? "selected" : ""}>
              ${escapeHtml(character.name)} · ${escapeHtml(character.title)}
            </option>
          `,
        ).join("")}
      </select>
    `;
  }

  private renderNumberField(name: string, label: string, value: number) {
    return `
      <label class="phaser-field">
        <span>${label}</span>
        <input name="${name}" type="number" value="${value}" />
      </label>
    `;
  }

  private getSpotlightCharacter(): CharacterPreset {
    return (
      CHARACTER_PRESETS.find(
        (character) => character.id === this.createForm.characterId,
      ) ?? CHARACTER_PRESETS[0]
    );
  }

  private getLayout(): HomeSceneLayout {
    const { width, height } = this.scale;
    const paddingX = clamp(width * 0.04, 24, 56);
    const paddingY = clamp(height * 0.04, 24, 42);
    const compact = width < 1320 || height < 780;

    if (compact) {
      const stageWidth = Math.min(width - paddingX * 2, 560);
      const stageHeight = clamp(height * 0.28, 220, 300);
      const stageX = (width - stageWidth) * 0.5;
      const stageY = paddingY + 78;
      const domWidth = Math.min(width - paddingX * 2, 760);
      const domY = stageY + stageHeight + 28;

      return {
        compact,
        titleX: paddingX,
        titleY: paddingY,
        stageX,
        stageY,
        stageWidth,
        stageHeight,
        domX: width * 0.5,
        domY,
        domWidth,
        domMaxHeight: height - domY - paddingY,
      };
    }

    const gutter = clamp(width * 0.03, 24, 56);
    const stageWidth = clamp(width * 0.3, 360, 448);
    const stageX = paddingX;
    const stageY = paddingY + 78;
    const stageHeight = clamp(height * 0.56, 390, 520);
    const domX = stageX + stageWidth + gutter;
    const domWidth = Math.max(400, width - domX - paddingX);

    return {
      compact,
      titleX: paddingX,
      titleY: paddingY,
      stageX,
      stageY,
      stageWidth,
      stageHeight,
      domX,
      domY: stageY,
      domWidth,
      domMaxHeight: height - stageY - paddingY,
    };
  }
}
