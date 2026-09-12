import Phaser from "phaser";

import { BaseScene } from "@/game-client/phaser/BaseScene";
import type { GameRuntime } from "@/game-client/phaser/GameRuntime";
import { getRuntimeView, type RuntimeView } from "@/game-client/state/runtimeStore";
import {
  CHARACTER_PRESETS,
  getCharacterAvatarTextureKey,
  getCharacterPortraitPath,
  getCharacterPortraitTextureKey,
} from "@/lib/game/characters";
import { getTileIconPath, getTileIconTextureKey, type TileType } from "@/lib/game/board";

export class BootScene extends BaseScene {
  private activeView: RuntimeView | null = null;

  private statusText!: Phaser.GameObjects.Text;

  constructor(runtime: GameRuntime) {
    super("BootScene", runtime);
  }

  preload() {
    CHARACTER_PRESETS.forEach((character) => {
      this.load.svg(
        getCharacterAvatarTextureKey(character.id),
        character.avatarPath,
      );
      this.load.svg(
        getCharacterPortraitTextureKey(character.id),
        getCharacterPortraitPath(character.id),
      );
    });

    const iconTypes: TileType[] = [
      "start",
      "railroad",
      "bank",
      "magic",
      "chance",
      "community",
      "news",
      "freeCard",
      "amusement",
      "shop",
      "lottery",
      "tax",
      "jail",
      "freeParking",
      "goToJail",
    ];

    iconTypes.forEach((type) => {
      const iconPath = getTileIconPath(type);
      if (!iconPath) {
        return;
      }

      this.load.svg(getTileIconTextureKey(type), iconPath);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#08101f");
    this.statusText = this.add.text(0, 0, "加载中...", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#f8fafc",
    });
    this.statusText.setDepth(1000);
    this.positionStatusText();

    this.scale.on("resize", this.positionStatusText, this);
    this.bindRuntime(() => this.syncView());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.positionStatusText, this);
    });

    this.syncView();
  }

  private positionStatusText = () => {
    this.statusText.setPosition(28, 22);
    this.statusText.setText(
      this.state.loading
        ? "正在同步游戏状态..."
        : this.state.connected
          ? "实时连接已就绪"
          : "正在准备场景...",
    );
  };

  private syncView() {
    this.positionStatusText();

    const targetView = getRuntimeView(this.state);
    if (targetView === this.activeView) {
      if (targetView === "match" && !this.scene.isActive("HudScene")) {
        this.scene.launch("HudScene");
      }
      return;
    }

    this.scene.stop("HomeScene");
    this.scene.stop("LobbyScene");
    this.scene.stop("MatchScene");
    this.scene.stop("HudScene");

    if (targetView === "home") {
      this.scene.launch("HomeScene");
    } else if (targetView === "lobby") {
      this.scene.launch("LobbyScene");
    } else {
      this.scene.launch("MatchScene");
      this.scene.launch("HudScene");
    }

    this.activeView = targetView;
  }
}
