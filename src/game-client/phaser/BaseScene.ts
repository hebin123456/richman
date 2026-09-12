import Phaser from "phaser";

import { GameRuntime } from "@/game-client/phaser/GameRuntime";

export abstract class BaseScene extends Phaser.Scene {
  protected readonly runtime: GameRuntime;

  constructor(sceneKey: string, runtime: GameRuntime) {
    super(sceneKey);
    this.runtime = runtime;
  }

  protected get state() {
    return this.runtime.getState();
  }

  protected bindRuntime(onChange: () => void) {
    const unsubscribe = this.runtime.subscribe(() => {
      if (this.scene.isActive()) {
        onChange();
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
    });
  }

  protected clearDisplayList() {
    for (const child of this.children.list.slice()) {
      child.destroy();
    }
  }
}
