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
import type { RoomSettingsInput } from "@/lib/game/types";

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

interface LobbySceneLayout {
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

export class LobbyScene extends BaseScene {
  private root: Phaser.GameObjects.DOMElement | null = null;

  private background!: Phaser.GameObjects.Graphics;

  private stagePanel!: Phaser.GameObjects.Graphics;

  private roomTitle!: Phaser.GameObjects.Text;

  private heroName!: Phaser.GameObjects.Text;

  private heroTitle!: Phaser.GameObjects.Text;

  private heroPiece!: Phaser.GameObjects.Text;

  private heroPortrait!: Phaser.GameObjects.Image;

  private heroQuote!: Phaser.GameObjects.Text;

  private joinName = "玩家03";

  private selectedCharacterId: CharacterId =
    CHARACTER_PRESETS[0]?.id ?? "atubo";

  private settingsDraft: RoomSettingsInput = {
    startingCash: 2000,
    passStartSalary: 200,
    maxPlayers: 4,
    jailFine: 100,
    parkingJackpotEnabled: true,
    stocksEnabled: false,
    turnSeconds: 120,
  };

  constructor(runtime: GameRuntime) {
    super("LobbyScene", runtime);
  }

  create() {
    this.cameras.main.setBackgroundColor("#0b1323");
    this.background = this.add.graphics();
    this.stagePanel = this.add.graphics();
    this.roomTitle = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "38px",
      fontStyle: "bold",
      color: "#f8fafc",
    });
    this.heroName = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "40px",
      fontStyle: "bold",
      color: "#0f172a",
    });
    this.heroTitle = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#334155",
    });
    this.heroPiece = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "136px",
      fontStyle: "bold",
      color: "#ffffff",
    });
    this.heroPiece.setOrigin(0.5, 0.5);
    this.heroPiece.setAlpha(0.28);
    this.heroPortrait = this.add.image(
      0,
      0,
      getCharacterPortraitTextureKey(CHARACTER_PRESETS[0]?.id ?? "atubo"),
    );
    this.heroPortrait.setOrigin(0.5, 0.5);
    this.heroQuote = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#0f172a",
      wordWrap: { width: 360, useAdvancedWrap: true },
      lineSpacing: 10,
    });

    const root = document.createElement("div");
    root.className = "phaser-dom-root phaser-lobby-root";
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

    if (target.name === "joinName") {
      this.joinName = target.value;
      return;
    }

    if (
      target.name === "startingCash" ||
      target.name === "passStartSalary" ||
      target.name === "maxPlayers" ||
      target.name === "jailFine" ||
      target.name === "turnSeconds"
    ) {
      this.settingsDraft = {
        ...this.settingsDraft,
        [target.name]: Number(target.value),
      };
    }
  };

  private handleChange = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name) {
      return;
    }

    if (
      target.name === "parkingJackpotEnabled" ||
      target.name === "stocksEnabled"
    ) {
      const checkbox = target as HTMLInputElement;
      this.settingsDraft = {
        ...this.settingsDraft,
        [target.name]: checkbox.checked,
      };
      return;
    }

    if (target.name === "lobbyCharacterId") {
      this.selectedCharacterId = target.value as CharacterId;
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
    const characterId = actionTarget.dataset.characterId;

    if (action === "back-home") {
      this.runtime.navigateHome();
      return;
    }

    if (action === "pick-character" && characterId) {
      this.selectedCharacterId = characterId as CharacterId;
      this.renderScene();
      return;
    }

    if (action === "toggle-ready") {
      const currentPlayer = this.state.snapshot?.currentPlayer;
      if (currentPlayer) {
        void this.runtime.patchLobby({
          isReady: !currentPlayer.isReady,
        });
      }
      return;
    }

    if (action === "apply-character" && this.selectedCharacterId) {
      void this.runtime.patchLobby({
        characterId: this.selectedCharacterId,
      });
      return;
    }

    if (action === "join-room" && this.selectedCharacterId) {
      void this.runtime.joinCurrentRoom(this.joinName, this.selectedCharacterId);
      return;
    }

    if (action === "save-rules") {
      void this.runtime.saveSettings(this.settingsDraft);
      return;
    }

    if (action === "start-game") {
      void this.runtime.startGame();
      return;
    }

    if (action === "add-bot") {
      void this.runtime.addBotPlayer();
      return;
    }

    if (action === "remove-bot") {
      const playerId = actionTarget.dataset.playerId;
      if (playerId) {
        void this.runtime.removeBotPlayer(playerId);
      }
    }
  };

  private renderScene = () => {
    const snapshot = this.state.snapshot;
    if (snapshot) {
      this.roomTitle.setText(`房间 ${snapshot.code}`);
      this.settingsDraft = {
        startingCash: snapshot.settings.startingCash,
        passStartSalary: snapshot.settings.passStartSalary,
        maxPlayers: snapshot.settings.maxPlayers,
        jailFine: snapshot.settings.jailFine,
        turnSeconds: snapshot.settings.turnSeconds,
        parkingJackpotEnabled: snapshot.settings.parkingJackpotEnabled,
        stocksEnabled: snapshot.settings.stocksEnabled,
      };

      if (
        !snapshot.availableCharacters.some(
          (character) => character.id === this.selectedCharacterId,
        )
      ) {
        this.selectedCharacterId =
          snapshot.currentPlayer?.character.id ??
          snapshot.availableCharacters[0]?.id ??
          this.selectedCharacterId;
      }
    } else {
      this.roomTitle.setText("正在同步房间...");
    }

    this.drawBackdrop();
    this.renderSpotlight();
    this.renderDom();
  };

  private drawBackdrop() {
    const { width, height } = this.scale;
    const layout = this.getLayout();
    this.background.clear();
    this.background.fillGradientStyle(0x0b1323, 0x101b33, 0x0f172a, 0x0b1323, 1);
    this.background.fillRect(0, 0, width, height);
    this.background.fillStyle(0xffffff, 0.05);
    this.background.fillCircle(width * 0.18, height * 0.22, 120);
    this.background.fillCircle(width * 0.82, height * 0.68, 150);
    const titleX = layout.compact
      ? Math.max(24, (width - this.roomTitle.width) * 0.5)
      : layout.titleX;
    this.roomTitle.setPosition(titleX, layout.titleY);
  }

  private renderSpotlight() {
    const layout = this.getLayout();
    const character = this.getPreviewCharacter();
    const content = getCharacterContent(character.id);

    if (layout.compact) {
      this.renderCompactSpotlight(layout, character, content);
      this.root?.setOrigin(0, 0);
      this.root?.setPosition(layout.domX, layout.domY);
      return;
    }

    const innerX = layout.stageX + 20;
    const innerWidth = layout.stageWidth - 40;
    const headerHeight = clamp(layout.stageHeight * 0.2, 92, 110);
    const quoteValue = `"${content.lobbyLine}"`;
    const maxQuoteHeight = clamp(layout.stageHeight * 0.42, 128, 224);
    const quoteFit = fitWrappedText(this.heroQuote, {
      content: quoteValue,
      maxWidth: layout.stageWidth - 80,
      maxHeight: maxQuoteHeight - 30,
      preferredFontSize: 18,
      minFontSize: 12,
      preferredLineSpacing: 10,
      minLineSpacing: 4,
    });
    const quoteHeight = clamp(quoteFit.textHeight + 30, 128, maxQuoteHeight);
    const quoteY = layout.stageY + layout.stageHeight - quoteHeight - 20;
    const portraitWidth = 170;
    const portraitHeight = 236;
    const portraitX = layout.stageX + layout.stageWidth * 0.67;
    const portraitY = layout.stageY + layout.stageHeight * 0.5;
    const portraitKey = getCharacterPortraitTextureKey(character.id);
    const avatarKey = getCharacterAvatarTextureKey(character.id);
    const displayKey = this.textures.exists(portraitKey) ? portraitKey : avatarKey;
    const hasPortrait = this.textures.exists(displayKey);

    this.stagePanel.clear();
    this.stagePanel.fillStyle(0xfffbeb, 0.97);
    this.stagePanel.fillRoundedRect(
      layout.stageX,
      layout.stageY,
      layout.stageWidth,
      layout.stageHeight,
      28,
    );
    this.stagePanel.fillStyle(0x0f172a, 0.05);
    this.stagePanel.fillRoundedRect(innerX, layout.stageY + 20, innerWidth, headerHeight, 24);
    this.stagePanel.fillStyle(0x0f172a, 0.04);
    this.stagePanel.fillRoundedRect(innerX, quoteY, innerWidth, quoteHeight, 24);
    this.stagePanel.fillStyle(0x0f172a, 0.08);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5 + 10,
      portraitY - portraitHeight * 0.5 + 14,
      portraitWidth,
      portraitHeight,
      30,
    );
    this.stagePanel.fillStyle(0xffffff, 0.96);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5,
      portraitY - portraitHeight * 0.5,
      portraitWidth,
      portraitHeight,
      30,
    );
    this.stagePanel.fillStyle(0xf8fafc, 0.94);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.34,
      portraitY + portraitHeight * 0.39,
      portraitWidth * 0.68,
      14,
      8,
    );

    this.heroName.setFontSize(40);
    this.heroName.setText(character.name);
    this.heroName.setPosition(layout.stageX + 30, layout.stageY + 42);

    this.heroTitle.setFontSize(18);
    this.heroTitle.setText(`${character.title} | ${content.tagline}`);
    this.heroTitle.setWordWrapWidth(layout.stageWidth - 72);
    this.heroTitle.setPosition(layout.stageX + 32, layout.stageY + 88);

    if (hasPortrait) {
      this.heroPortrait.setVisible(true);
      this.heroPortrait.setTexture(displayKey);
      this.heroPortrait.setPosition(portraitX, portraitY);
      this.heroPortrait.setDisplaySize(portraitWidth * 0.92, portraitHeight * 0.92);

      this.heroPiece.setFontSize(24);
      this.heroPiece.setColor("#0f172a");
      this.heroPiece.setAlpha(0.78);
      this.heroPiece.setText(`专属棋子 ${character.piece}`);
      this.heroPiece.setPosition(portraitX, portraitY + portraitHeight * 0.44);
    } else {
      this.heroPortrait.setVisible(false);
      this.heroPiece.setFontSize(136);
      this.heroPiece.setColor("#ffffff");
      this.heroPiece.setAlpha(0.28);
      this.heroPiece.setText(character.piece);
      this.heroPiece.setPosition(
        layout.stageX + layout.stageWidth * 0.67,
        layout.stageY + layout.stageHeight * 0.5,
      );
    }

    this.heroQuote.setFontSize(quoteFit.fontSize);
    this.heroQuote.setLineSpacing(quoteFit.lineSpacing);
    this.heroQuote.setWordWrapWidth(layout.stageWidth - 80, true);
    this.heroQuote.setText(quoteValue);
    this.heroQuote.setPosition(layout.stageX + 34, quoteY + 22);

    this.root?.setOrigin(0, 0);
    this.root?.setPosition(layout.domX, layout.domY);
  }

  private renderCompactSpotlight(
    layout: LobbySceneLayout,
    character: CharacterPreset,
    content: ReturnType<typeof getCharacterContent>,
  ) {
    const portraitWidth = 88;
    const portraitHeight = 122;
    const portraitX = layout.stageX + layout.stageWidth - 92;
    const portraitY = layout.stageY + layout.stageHeight * 0.48;
    const quoteWidth = layout.stageWidth - 180;
    const quoteValue = `"${content.lobbyLine}"`;
    const quoteFit = fitWrappedText(this.heroQuote, {
      content: quoteValue,
      maxWidth: quoteWidth,
      maxHeight: Math.max(54, layout.stageHeight - 120),
      preferredFontSize: 14,
      minFontSize: 10,
      preferredLineSpacing: 8,
      minLineSpacing: 3,
    });
    const portraitKey = getCharacterPortraitTextureKey(character.id);
    const avatarKey = getCharacterAvatarTextureKey(character.id);
    const displayKey = this.textures.exists(portraitKey) ? portraitKey : avatarKey;
    const hasPortrait = this.textures.exists(displayKey);

    this.stagePanel.clear();
    this.stagePanel.fillStyle(0xfffbeb, 0.97);
    this.stagePanel.fillRoundedRect(
      layout.stageX,
      layout.stageY,
      layout.stageWidth,
      layout.stageHeight,
      28,
    );
    this.stagePanel.fillStyle(0x0f172a, 0.05);
    this.stagePanel.fillRoundedRect(
      layout.stageX + 20,
      layout.stageY + 18,
      layout.stageWidth - 40,
      56,
      20,
    );
    this.stagePanel.fillStyle(0x0f172a, 0.04);
    this.stagePanel.fillRoundedRect(
      layout.stageX + 20,
      layout.stageY + 84,
      layout.stageWidth - 40,
      layout.stageHeight - 104,
      20,
    );
    this.stagePanel.fillStyle(0x0f172a, 0.08);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5 + 6,
      portraitY - portraitHeight * 0.5 + 8,
      portraitWidth,
      portraitHeight,
      22,
    );
    this.stagePanel.fillStyle(0xffffff, 0.95);
    this.stagePanel.fillRoundedRect(
      portraitX - portraitWidth * 0.5,
      portraitY - portraitHeight * 0.5,
      portraitWidth,
      portraitHeight,
      22,
    );

    this.heroName.setFontSize(30);
    this.heroName.setText(character.name);
    this.heroName.setPosition(layout.stageX + 28, layout.stageY + 30);

    this.heroTitle.setFontSize(15);
    this.heroTitle.setText(`${character.title} | ${content.tagline}`);
    this.heroTitle.setWordWrapWidth(layout.stageWidth - 180);
    this.heroTitle.setPosition(layout.stageX + 30, layout.stageY + 66);

    if (hasPortrait) {
      this.heroPortrait.setVisible(true);
      this.heroPortrait.setTexture(displayKey);
      this.heroPortrait.setPosition(portraitX, portraitY);
      this.heroPortrait.setDisplaySize(portraitWidth * 0.92, portraitHeight * 0.92);

      this.heroPiece.setFontSize(16);
      this.heroPiece.setColor("#0f172a");
      this.heroPiece.setAlpha(0.78);
      this.heroPiece.setText(`棋子 ${character.piece}`);
      this.heroPiece.setPosition(portraitX, portraitY + portraitHeight * 0.42);
    } else {
      this.heroPortrait.setVisible(false);
      this.heroPiece.setFontSize(96);
      this.heroPiece.setColor("#ffffff");
      this.heroPiece.setAlpha(0.28);
      this.heroPiece.setText(character.piece);
      this.heroPiece.setPosition(
        layout.stageX + layout.stageWidth - 130,
        layout.stageY + layout.stageHeight * 0.48,
      );
    }

    this.heroQuote.setFontSize(quoteFit.fontSize);
    this.heroQuote.setLineSpacing(quoteFit.lineSpacing);
    this.heroQuote.setWordWrapWidth(quoteWidth, true);
    this.heroQuote.setText(quoteValue);
    this.heroQuote.setPosition(layout.stageX + 32, layout.stageY + 96);
  }

  private renderDom() {
    if (!this.root) {
      return;
    }

    const layout = this.getLayout();
    const wrapper = this.root.node as HTMLDivElement;
    const state = this.state;
    const snapshot = state.snapshot;
    const maxHeight = Math.max(260, Math.floor(layout.domMaxHeight));

    wrapper.style.width = `${Math.floor(layout.domWidth)}px`;

    if (!snapshot) {
      wrapper.innerHTML = `
        <div class="phaser-ui-screen" style="max-height:${maxHeight}px;">
          <div class="phaser-screen-title">正在同步房间...</div>
          <div class="phaser-screen-copy">
            正在获取房间快照并连接实时同步通道。
          </div>
          ${state.errorMessage ? `<div class="phaser-error">${escapeHtml(state.errorMessage)}</div>` : ""}
        </div>
      `;
      return;
    }

    const currentPlayer = snapshot.currentPlayer;
    const busy = state.busy ? "disabled" : "";
    const occupied = new Set(
      snapshot.players
        .filter((player) => player.id !== currentPlayer?.id)
        .map((player) => player.character.id),
    );
    const canStart =
      snapshot.players.length >= 2 &&
      snapshot.players.every((player) => player.isReady);
    const selectedCharacter = snapshot.availableCharacters.find(
      (character) => character.id === this.selectedCharacterId,
    );
    const characterCanBeApplied = selectedCharacter
      ? !occupied.has(selectedCharacter.id) ||
        selectedCharacter.id === currentPlayer?.character.id
      : false;
    const selectedCharacterMeta = selectedCharacter
      ? `${selectedCharacter.name} · ${selectedCharacter.title} · 专属棋子 ${selectedCharacter.piece}`
      : "请选择角色";
    const canAddBot = Boolean(
      currentPlayer?.isHost && snapshot.players.length < snapshot.settings.maxPlayers,
    );

    wrapper.innerHTML = `
      <div class="phaser-ui-screen" style="max-height:${maxHeight}px;">
        <div class="phaser-top-actions">
          <div>
            <div class="phaser-eyebrow">房间大厅</div>
            <div class="phaser-screen-title">开局前锁定角色</div>
          </div>
          <button class="phaser-ghost-button" data-action="back-home">返回首页</button>
        </div>
        ${state.errorMessage ? `<div class="phaser-error">${escapeHtml(state.errorMessage)}</div>` : ""}
        <div class="phaser-lobby-grid">
          <section class="phaser-panel">
            <div class="phaser-top-actions">
              <div class="phaser-panel-title">玩家列表</div>
              ${
                currentPlayer?.isHost
                  ? `<button class="phaser-secondary-button" data-action="add-bot" ${busy} ${canAddBot ? "" : "disabled"}>加入电脑</button>`
                  : ""
              }
            </div>
            <div class="phaser-list">
              ${snapshot.players
                .map(
                  (player) => {
                    const metaParts = [
                      player.isHost ? "房主" : `座位 ${player.seatOrder + 1}`,
                      player.isBot ? "电脑" : player.isConnected ? "在线" : "离线",
                      player.isManaged
                        ? player.managedReason === "timeout"
                          ? "超时托管"
                          : "手动托管"
                        : null,
                      player.isReady ? "已准备" : "等待中",
                    ].filter(Boolean);
                    return `
                    <div class="phaser-list-item ${player.id === currentPlayer?.id ? "is-selected" : ""}">
                      <div>
                        <div class="phaser-list-title">${escapeHtml(player.character.name)} - ${escapeHtml(player.name)}</div>
                        <div class="phaser-list-meta">${escapeHtml(metaParts.join(" · "))}</div>
                      </div>
                      <div class="phaser-inline-actions">
                        <div class="phaser-pill">${escapeHtml(player.isBot ? "电脑" : player.character.title)}</div>
                        ${
                          currentPlayer?.isHost && player.isBot
                            ? `<button class="phaser-chip-button" data-action="remove-bot" data-player-id="${player.id}" ${busy}>移除</button>`
                            : ""
                        }
                      </div>
                    </div>
                  `;
                  },
                )
                .join("")}
            </div>
          </section>
          <section class="phaser-panel phaser-lobby-compact-panel">
            <div class="phaser-panel-title">角色选择</div>
            ${
              currentPlayer
                ? `
                  <div class="phaser-lobby-form-grid">
                    <label class="phaser-field phaser-field--span-2">
                      <span>锁定角色</span>
                      ${this.renderCharacterSelect(snapshot.availableCharacters, occupied, currentPlayer.character.id)}
                    </label>
                  </div>
                  <div class="phaser-list-meta phaser-lobby-form-meta">
                    ${escapeHtml(selectedCharacterMeta)}
                    ${characterCanBeApplied ? "" : " · 该角色已被其他玩家占用"}
                  </div>
                  <div class="phaser-inline-actions">
                    <button class="phaser-secondary-button" data-action="apply-character" ${busy} ${characterCanBeApplied ? "" : "disabled"}>
                      使用当前角色
                    </button>
                    <button class="phaser-primary-button" data-action="toggle-ready" ${busy}>
                      ${currentPlayer.isReady ? "取消准备" : "准备就绪"}
                    </button>
                  </div>
                `
                : `
                  <div class="phaser-lobby-form-grid">
                    <label class="phaser-field">
                      <span>玩家昵称</span>
                      <input name="joinName" value="${escapeHtml(this.joinName)}" maxlength="16" />
                    </label>
                    <label class="phaser-field">
                      <span>锁定角色</span>
                      ${this.renderCharacterSelect(snapshot.availableCharacters, occupied)}
                    </label>
                  </div>
                  <div class="phaser-list-meta phaser-lobby-form-meta">
                    ${escapeHtml(selectedCharacterMeta)}
                    ${characterCanBeApplied ? "" : " · 该角色已被其他玩家占用"}
                  </div>
                  <button class="phaser-primary-button" data-action="join-room" ${busy} ${characterCanBeApplied ? "" : "disabled"}>
                    加入房间
                  </button>
                `
            }
          </section>
          <section class="phaser-panel">
            <div class="phaser-panel-title">房规设置</div>
            ${
              currentPlayer?.isHost
                ? `
                  <div class="phaser-settings-grid">
                    ${this.renderNumberField("startingCash", "起始资金", this.settingsDraft.startingCash)}
                    ${this.renderNumberField("passStartSalary", "经过起点工资", this.settingsDraft.passStartSalary)}
                    ${this.renderNumberField("maxPlayers", "最大人数", this.settingsDraft.maxPlayers)}
                    ${this.renderNumberField("turnSeconds", "回合时长", this.settingsDraft.turnSeconds)}
                  </div>
                  <div class="phaser-list-meta">
                    监狱固定关押 3 天，不能交保释金；待满后会在当回合继续掷骰。只要有玩家踩到监狱，监狱里的人就会被立即放出来。
                  </div>
                  <label class="phaser-checkbox">
                    <input name="parkingJackpotEnabled" type="checkbox" ${this.settingsDraft.parkingJackpotEnabled ? "checked" : ""} />
                    <span>免费停车奖金池</span>
                  </label>
                  <label class="phaser-checkbox">
                    <input name="stocksEnabled" type="checkbox" ${this.settingsDraft.stocksEnabled ? "checked" : ""} />
                    <span>启用股票系统</span>
                  </label>
                  <div class="phaser-inline-actions">
                    <button class="phaser-secondary-button" data-action="save-rules" ${busy}>保存房规</button>
                    <button class="phaser-primary-button" data-action="start-game" ${busy} ${canStart ? "" : "disabled"}>开始对局</button>
                  </div>
                `
                : `
                  <div class="phaser-meta-stack">
                    <div>起始资金：${snapshot.settings.startingCash}</div>
                    <div>经过起点工资：${snapshot.settings.passStartSalary}</div>
                    <div>最大人数：${snapshot.settings.maxPlayers}</div>
                    <div>监狱：固定 3 天，踩监狱立即放人</div>
                    <div>回合时长：${snapshot.settings.turnSeconds}</div>
                    <div>奖金池：${snapshot.settings.parkingJackpotEnabled ? "开启" : "关闭"}</div>
                    <div>股票系统：${snapshot.settings.stocksEnabled ? "开启" : "关闭"}</div>
                  </div>
                `
            }
          </section>
          <section class="phaser-panel">
            <div class="phaser-panel-title">大厅事件</div>
            <div class="phaser-list phaser-scroll-region">
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
          </section>
        </div>
      </div>
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

  private renderCharacterSelect(
    characters: CharacterPreset[],
    occupied: Set<string>,
    currentCharacterId?: string,
  ) {
    return `
      <select name="lobbyCharacterId" class="phaser-select">
        ${characters
          .map((character) => {
            const isTaken =
              occupied.has(character.id) && character.id !== currentCharacterId;
            return `
              <option
                value="${character.id}"
                ${character.id === this.selectedCharacterId ? "selected" : ""}
                ${isTaken ? "disabled" : ""}
              >
                ${escapeHtml(character.name)} · ${escapeHtml(character.title)}${isTaken ? "（已被占用）" : ""}
              </option>
            `;
          })
          .join("")}
      </select>
    `;
  }

  private getPreviewCharacter(): CharacterPreset {
    const snapshot = this.state.snapshot;
    return (
      snapshot?.availableCharacters.find(
        (character) => character.id === this.selectedCharacterId,
      ) ??
      snapshot?.currentPlayer?.character ??
      CHARACTER_PRESETS[0]
    );
  }

  private getLayout(): LobbySceneLayout {
    const { width, height } = this.scale;
    const paddingX = clamp(width * 0.04, 24, 56);
    const paddingY = clamp(height * 0.04, 24, 42);
    const compact = width < 1360 || height < 820;

    if (compact) {
      const stageWidth = Math.min(width - paddingX * 2, 560);
      const stageHeight = clamp(height * 0.24, 196, 250);
      const stageX = (width - stageWidth) * 0.5;
      const stageY = paddingY + 76;
      const domWidth = width - paddingX * 2;
      const domY = stageY + stageHeight + 18;

      return {
        compact,
        titleX: paddingX,
        titleY: paddingY,
        stageX,
        stageY,
        stageWidth,
        stageHeight,
        domX: paddingX,
        domY,
        domWidth,
        domMaxHeight: height - domY - paddingY,
      };
    }

    const gutter = clamp(width * 0.03, 24, 52);
    const stageWidth = clamp(width * 0.28, 340, 430);
    const stageX = paddingX;
    const stageY = paddingY + 78;
    const stageHeight = clamp(height - stageY - paddingY, 440, 630);
    const domX = stageX + stageWidth + gutter;
    const domWidth = Math.max(460, width - domX - paddingX);

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
