import Link from "next/link";

import { GameHost } from "@/game-client/phaser/GameHost";

export default function HomePage() {
  return (
    <>
      <GameHost route={{ kind: "home" }} />
      <Link
        href="/tabletop"
        className="fixed bottom-4 right-4 z-50 rounded-[22px] border border-white/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.94),rgba(139,92,246,0.96))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(14,165,233,0.24)] transition hover:brightness-105"
      >
        实体局助手
      </Link>
    </>
  );
}
