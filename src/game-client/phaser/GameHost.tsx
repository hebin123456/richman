"use client";

import { useEffect, useRef, useState } from "react";

import { GameRuntime } from "@/game-client/phaser/GameRuntime";
import type { ClientRoute } from "@/game-client/state/runtimeStore";

interface GameHostProps {
  route: ClientRoute;
}

export function GameHost({ route }: GameHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtime] = useState(() => new GameRuntime(route));

  useEffect(() => {
    void runtime.setRoute(route);
  }, [route, runtime]);

  useEffect(() => {
    let destroyed = false;
    let gameDestroy: (() => void) | null = null;

    void (async () => {
      if (!containerRef.current) {
        return;
      }

      const { createGame } = await import("@/game-client/phaser/createGame");
      if (destroyed || !containerRef.current) {
        return;
      }

      const game = createGame(containerRef.current, runtime);
      gameDestroy = () => {
        game.destroy(true);
      };

      await runtime.start();
    })();

    return () => {
      destroyed = true;
      runtime.destroy();
      gameDestroy?.();
    };
  }, [runtime]);

  return (
    <main className="game-shell">
      <div ref={containerRef} className="game-canvas-host" />
    </main>
  );
}
