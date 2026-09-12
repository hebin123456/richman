import Phaser from "phaser";

import { GameRuntime } from "@/game-client/phaser/GameRuntime";
import { BootScene } from "@/game-client/scenes/BootScene";
import { HomeScene } from "@/game-client/scenes/HomeScene";
import { HudScene } from "@/game-client/scenes/HudScene";
import { LobbyScene } from "@/game-client/scenes/LobbyScene";
import { MatchScene } from "@/game-client/scenes/MatchScene";

export function createGame(parent: HTMLDivElement, runtime: GameRuntime) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#07111d",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
    },
    dom: {
      createContainer: true,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [
      new BootScene(runtime),
      new HomeScene(runtime),
      new LobbyScene(runtime),
      new MatchScene(runtime),
      new HudScene(runtime),
    ],
  });
}
