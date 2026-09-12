"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  TABLETOP_CARD_PRESETS,
  TABLETOP_PLAYER_PRESETS,
  type TabletopCardKind,
  type TabletopCardPreset,
} from "@/lib/tabletop-helper/data";

const STORAGE_KEY = "richman.tabletop-helper.v1";
const MONEY_STEPS = [10, 20, 50, 100, 200, 500, 1000] as const;
const panelClass =
  "rounded-[28px] border border-white/80 bg-white/82 p-4 shadow-[0_18px_48px_rgba(59,130,246,0.12)] backdrop-blur lg:p-5";
const primaryButtonClass =
  "rounded-full bg-[linear-gradient(135deg,#f97316,#ec4899)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600";
const secondaryButtonClass =
  "rounded-full border border-sky-200 bg-white/88 px-4 py-2.5 text-sm font-medium text-sky-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400";
const subtleButtonClass =
  "rounded-full border border-slate-200 bg-white/88 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white";

type TabletopPlayer = {
  seat: number;
  name: string;
  color: string;
  money: number;
  isActive: boolean;
};

type TabletopRollRecord = {
  id: string;
  playerSeat: number;
  playerName: string;
  values: number[];
  total: number;
  createdAt: string;
};

type TabletopLogEntry = {
  id: string;
  message: string;
  createdAt: string;
};

type TabletopHelperState = {
  title: string;
  theme: string;
  diceCount: 1 | 2;
  playerCount: number;
  salary: number;
  initialMoney: number;
  currentPlayerSeat: number;
  players: TabletopPlayer[];
  rolls: TabletopRollRecord[];
  logs: TabletopLogEntry[];
};

type DrawnCardState = {
  playerSeat: number;
  playerName: string;
  card: TabletopCardPreset;
  applied: boolean;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomDiceValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function clampPlayerCount(value: number) {
  if (!Number.isFinite(value)) {
    return 4;
  }

  return Math.min(6, Math.max(1, Math.trunc(value)));
}

function toSafeMoney(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function getNextActiveSeat(currentSeat: number, playerCount: number) {
  return currentSeat >= playerCount ? 1 : currentSeat + 1;
}

function pushLog(logs: TabletopLogEntry[], message: string) {
  return [
    { id: createId("log"), message, createdAt: formatTime() },
    ...logs,
  ].slice(0, 18);
}

function createPlayers(initialMoney: number, playerCount: number) {
  return TABLETOP_PLAYER_PRESETS.map((preset) => ({
    seat: preset.seat,
    name: preset.name,
    color: preset.color,
    money: initialMoney,
    isActive: preset.seat <= playerCount,
  }));
}

function createDefaultState(): TabletopHelperState {
  const initialMoney = 20000;
  const playerCount = 4;

  return {
    title: "掌上大富翁实体局助手",
    theme: "银版实体局",
    diceCount: 2,
    playerCount,
    salary: 2000,
    initialMoney,
    currentPlayerSeat: 1,
    players: createPlayers(initialMoney, playerCount),
    rolls: [],
    logs: [
      {
        id: createId("log"),
        message: "实体局助手已准备好，可以开始记账、扔骰子和抽卡。",
        createdAt: formatTime(),
      },
    ],
  };
}

function normalizeStoredState(value: unknown): TabletopHelperState {
  const defaults = createDefaultState();

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const stored = value as Partial<TabletopHelperState>;
  const playerCount = clampPlayerCount(Number(stored.playerCount ?? defaults.playerCount));
  const initialMoney = toSafeMoney(Number(stored.initialMoney ?? defaults.initialMoney), defaults.initialMoney);
  const salary = toSafeMoney(Number(stored.salary ?? defaults.salary), defaults.salary);
  const diceCount = Number(stored.diceCount) === 1 ? 1 : 2;

  const playerBySeat = new Map<number, Partial<TabletopPlayer>>();
  if (Array.isArray(stored.players)) {
    stored.players.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const seat = Math.trunc(Number(item.seat));
      if (seat < 1 || seat > 6) {
        return;
      }

      playerBySeat.set(seat, item);
    });
  }

  const players = TABLETOP_PLAYER_PRESETS.map((preset) => {
    const storedPlayer = playerBySeat.get(preset.seat);
    const rawName =
      storedPlayer && typeof storedPlayer.name === "string"
        ? storedPlayer.name.trim()
        : preset.name;

    return {
      seat: preset.seat,
      name: rawName || preset.name,
      color: preset.color,
      money: toSafeMoney(Number(storedPlayer?.money ?? initialMoney), initialMoney),
      isActive: preset.seat <= playerCount,
    };
  });

  const logs = Array.isArray(stored.logs)
    ? stored.logs
        .filter((item): item is TabletopLogEntry => {
          return Boolean(
            item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.message === "string" &&
              typeof item.createdAt === "string",
          );
        })
        .slice(0, 18)
    : defaults.logs;

  const rolls = Array.isArray(stored.rolls)
    ? stored.rolls
        .filter((item): item is TabletopRollRecord => {
          return Boolean(
            item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.playerSeat === "number" &&
              typeof item.playerName === "string" &&
              Array.isArray(item.values) &&
              typeof item.total === "number" &&
              typeof item.createdAt === "string",
          );
        })
        .slice(0, 8)
    : [];

  const rawCurrentSeat = Math.trunc(Number(stored.currentPlayerSeat ?? defaults.currentPlayerSeat));
  const currentPlayerSeat =
    rawCurrentSeat >= 1 && rawCurrentSeat <= playerCount ? rawCurrentSeat : 1;

  return {
    title:
      typeof stored.title === "string" && stored.title.trim()
        ? stored.title.trim().slice(0, 32)
        : defaults.title,
    theme:
      typeof stored.theme === "string" && stored.theme.trim()
        ? stored.theme.trim().slice(0, 20)
        : defaults.theme,
    diceCount,
    playerCount,
    salary,
    initialMoney,
    currentPlayerSeat,
    players,
    rolls,
    logs,
  };
}

function getCardLabel(type: TabletopCardKind) {
  return type === "CHANCE" ? "机会卡" : "命运卡";
}

function getSignedMoneyLabel(value: number) {
  return `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
}

function getPlayerCardStyle(color: string, isCurrent: boolean) {
  return {
    background: isCurrent
      ? `linear-gradient(135deg, ${color}33 0%, rgba(255,255,255,0.96) 42%, rgba(254,240,138,0.82) 100%)`
      : "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(224,231,255,0.82) 55%, rgba(255,247,237,0.86) 100%)",
    borderColor: isCurrent ? color : "rgba(244,114,182,0.24)",
    boxShadow: isCurrent
      ? `0 18px 40px ${color}30`
      : "0 16px 36px rgba(236,72,153,0.10)",
  };
}

export function TabletopHelper() {
  const [state, setState] = useState<TabletopHelperState>(() => createDefaultState());
  const [isHydrated, setIsHydrated] = useState(false);
  const [drawnCard, setDrawnCard] = useState<DrawnCardState | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setState(normalizeStoredState(JSON.parse(saved)));
        }
      } catch {
        // Keep the in-memory defaults when local storage is unavailable.
      } finally {
        setIsHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isHydrated, state]);

  const activePlayers = useMemo(
    () => state.players.filter((player) => player.isActive).sort((left, right) => left.seat - right.seat),
    [state.players],
  );

  const currentPlayer =
    activePlayers.find((player) => player.seat === state.currentPlayerSeat) ?? activePlayers[0] ?? null;
  const latestRoll = state.rolls[0] ?? null;

  function setCurrentPlayer(seat: number) {
    setState((previous) => {
      const player = previous.players.find((item) => item.seat === seat && item.isActive);
      if (!player) {
        return previous;
      }

      return {
        ...previous,
        currentPlayerSeat: seat,
        logs: pushLog(previous.logs, `当前轮到 ${player.name}。`),
      };
    });
  }

  function updatePlayerName(seat: number, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) {
      return;
    }

    setState((previous) => ({
      ...previous,
      players: previous.players.map((player) =>
        player.seat === seat ? { ...player, name: trimmed.slice(0, 20) } : player,
      ),
    }));
  }

  function updateMoney(seat: number, delta: number) {
    setState((previous) => {
      const player = previous.players.find((item) => item.seat === seat && item.isActive);
      if (!player) {
        return previous;
      }

      return {
        ...previous,
        players: previous.players.map((item) =>
          item.seat === seat
            ? { ...item, money: Math.max(0, item.money + delta) }
            : item,
        ),
        logs: pushLog(
          previous.logs,
          `${player.name} ${delta >= 0 ? "收入" : "支出"} ${formatMoney(Math.abs(delta))}。`,
        ),
      };
    });
  }

  function giveSalary(seat: number) {
    setState((previous) => {
      const player = previous.players.find((item) => item.seat === seat && item.isActive);
      if (!player) {
        return previous;
      }

      return {
        ...previous,
        players: previous.players.map((item) =>
          item.seat === seat
            ? { ...item, money: item.money + previous.salary }
            : item,
        ),
        logs: pushLog(previous.logs, `${player.name} 经过起点，获得 ${formatMoney(previous.salary)}。`),
      };
    });
  }

  function rollDice(seat: number | null = currentPlayer?.seat ?? null) {
    if (seat === null) {
      return;
    }

    setState((previous) => {
      const player = previous.players.find((item) => item.seat === seat && item.isActive);
      if (!player) {
        return previous;
      }

      const values = Array.from({ length: previous.diceCount }, () => randomDiceValue());
      const total = values.reduce((sum, value) => sum + value, 0);
      const roll: TabletopRollRecord = {
        id: createId("roll"),
        playerSeat: player.seat,
        playerName: player.name,
        values,
        total,
        createdAt: formatTime(),
      };

      return {
        ...previous,
        currentPlayerSeat: player.seat,
        rolls: [roll, ...previous.rolls].slice(0, 8),
        logs: pushLog(previous.logs, `${player.name} 掷出 ${values.join(" + ")} = ${total}。`),
      };
    });
  }

  function drawCard(type: TabletopCardKind, seat: number | null = currentPlayer?.seat ?? null) {
    if (seat === null) {
      return;
    }

    const player = activePlayers.find((item) => item.seat === seat);
    if (!player) {
      return;
    }

    const pool = TABLETOP_CARD_PRESETS.filter((card) => card.type === type);
    const nextCard = pool[Math.floor(Math.random() * pool.length)];
    setDrawnCard({
      playerSeat: player.seat,
      playerName: player.name,
      card: nextCard,
      applied: false,
    });
    setState((previous) => ({
      ...previous,
      currentPlayerSeat: player.seat,
    }));
  }

  function applyDrawnCard() {
    if (!drawnCard || drawnCard.applied) {
      return;
    }

    setState((previous) => ({
      ...previous,
      players: previous.players.map((player) =>
        player.seat === drawnCard.playerSeat
          ? {
              ...player,
              money: Math.max(0, player.money + drawnCard.card.effectMoney),
            }
          : player,
      ),
      logs: pushLog(
        previous.logs,
        `${drawnCard.playerName} 抽到${getCardLabel(drawnCard.card.type)}“${drawnCard.card.title}”，金额效果 ${getSignedMoneyLabel(drawnCard.card.effectMoney)}。`,
      ),
    }));
    setDrawnCard((previous) => (previous ? { ...previous, applied: true } : previous));
  }

  function advanceToNextPlayer() {
    setState((previous) => {
      const nextSeat = getNextActiveSeat(previous.currentPlayerSeat, previous.playerCount);
      const nextPlayer = previous.players.find((item) => item.seat === nextSeat && item.isActive);

      return {
        ...previous,
        currentPlayerSeat: nextPlayer?.seat ?? 1,
        logs: pushLog(previous.logs, `回合交给 ${nextPlayer?.name ?? "下一位玩家"}。`),
      };
    });
  }

  function updatePlayerCount(nextPlayerCount: number) {
    const safeCount = clampPlayerCount(nextPlayerCount);

    setState((previous) => ({
      ...previous,
      playerCount: safeCount,
      currentPlayerSeat:
        previous.currentPlayerSeat > safeCount ? 1 : previous.currentPlayerSeat,
      players: previous.players.map((player) => ({
        ...player,
        isActive: player.seat <= safeCount,
      })),
      logs: pushLog(previous.logs, `已切换为 ${safeCount} 人局。`),
    }));
  }

  function resetAllMoney() {
    setState((previous) => ({
      ...previous,
      players: previous.players.map((player) => ({
        ...player,
        money: previous.initialMoney,
      })),
      logs: pushLog(previous.logs, `所有玩家资金已重置为 ${formatMoney(previous.initialMoney)}。`),
    }));
  }

  function restoreDefaults() {
    setState(createDefaultState());
    setDrawnCard(null);
  }

  return (
    <main className="h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#ffffff_0%,#fef3c7_14%,#fde68a_24%,#fbcfe8_46%,#c4b5fd_68%,#93c5fd_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-5 lg:px-6">
        <section
          className={`${panelClass} bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(254,249,195,0.92),rgba(224,231,255,0.92),rgba(252,231,243,0.94))]`}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.28em] text-fuchsia-600 sm:text-sm">
                Tabletop Helper
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {state.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">
                把 `rich` 的实体局主持面板收进了 `richman`。现在可以直接在这里给线下局扔骰子、
                抽机会/命运、记录玩家现金和切换当前轮次，数据会自动保存在当前浏览器。
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-800 sm:text-sm">
                <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 shadow-sm">
                  模式: {state.theme}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 shadow-sm">
                  初始金钱: {formatMoney(state.initialMoney)}
                </span>
                <span className="rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 shadow-sm">
                  骰子数量: {state.diceCount}
                </span>
                <span className="rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 shadow-sm">
                  玩家人数: {state.playerCount} 人
                </span>
                <span className="rounded-full border border-pink-200 bg-white/80 px-3 py-1.5 shadow-sm">
                  起点奖励: +{formatMoney(state.salary)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/" className={secondaryButtonClass}>
                返回掌上大富翁
              </Link>
              <button type="button" onClick={resetAllMoney} className={subtleButtonClass}>
                重置所有资金
              </button>
              <button type="button" onClick={restoreDefaults} className={primaryButtonClass}>
                恢复默认
              </button>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section
            className={`${panelClass} bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(240,249,255,0.88),rgba(254,242,242,0.84),rgba(254,249,195,0.70))]`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-fuchsia-600">
                  主持设置
                </p>
                <h2 className="mt-1.5 text-xl font-semibold text-slate-900">
                  实体局基础参数
                </h2>
              </div>
              <div className="rounded-full border border-white/90 bg-white/75 px-3 py-1.5 text-sm text-slate-700 shadow-sm">
                {isHydrated ? "已自动保存在本机" : "正在载入本地记录"}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <span className="text-sm font-medium text-slate-700">助手标题</span>
                <input
                  type="text"
                  value={state.title}
                  maxLength={32}
                  onChange={(event) =>
                    setState((previous) => ({
                      ...previous,
                      title: event.target.value || "掌上大富翁实体局助手",
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-fuchsia-200 bg-white/90 px-4 py-2.5 text-base font-medium text-slate-900 outline-none transition focus:border-fuchsia-400"
                />
              </label>

              <label className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <span className="text-sm font-medium text-slate-700">主题名称</span>
                <input
                  type="text"
                  value={state.theme}
                  maxLength={20}
                  onChange={(event) =>
                    setState((previous) => ({
                      ...previous,
                      theme: event.target.value || "银版实体局",
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-sky-200 bg-white/90 px-4 py-2.5 text-base font-medium text-slate-900 outline-none transition focus:border-sky-400"
                />
              </label>

              <div className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-700">骰子数量</div>
                <div className="mt-3 flex gap-2">
                  {[1, 2].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() =>
                        setState((previous) => ({
                          ...previous,
                          diceCount: count as 1 | 2,
                          logs: pushLog(previous.logs, `骰子数量切换为 ${count} 颗。`),
                        }))
                      }
                      className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                        state.diceCount === count
                          ? "border-fuchsia-500 bg-fuchsia-500 text-white shadow-sm"
                          : "border-sky-200 bg-white/85 text-slate-700 hover:border-sky-400 hover:bg-sky-50"
                      }`}
                    >
                      {count} 颗骰子
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-700">玩家人数</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => updatePlayerCount(count)}
                      className={`rounded-2xl border px-3 py-2.5 text-sm font-medium transition ${
                        state.playerCount === count
                          ? "border-violet-500 bg-violet-500 text-white shadow-sm"
                          : "border-violet-200 bg-white/85 text-slate-700 hover:border-violet-400 hover:bg-violet-50"
                      }`}
                    >
                      {count} 人
                    </button>
                  ))}
                </div>
              </div>

              <label className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <span className="text-sm font-medium text-slate-700">经过起点奖励</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={state.salary}
                  onChange={(event) =>
                    setState((previous) => ({
                      ...previous,
                      salary: toSafeMoney(Number(event.target.value), previous.salary),
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-amber-200 bg-white/90 px-4 py-2.5 text-base font-medium text-slate-900 outline-none transition focus:border-amber-400"
                />
              </label>

              <label className="rounded-[24px] border border-white/90 bg-white/84 p-4 shadow-sm">
                <span className="text-sm font-medium text-slate-700">初始金钱</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={state.initialMoney}
                  onChange={(event) =>
                    setState((previous) => ({
                      ...previous,
                      initialMoney: toSafeMoney(Number(event.target.value), previous.initialMoney),
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white/90 px-4 py-2.5 text-base font-medium text-slate-900 outline-none transition focus:border-emerald-400"
                />
              </label>
            </div>
          </section>

          <section
            className={`${panelClass} bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(224,231,255,0.88),rgba(252,231,243,0.90))]`}
          >
            <div className="text-sm uppercase tracking-[0.28em] text-sky-600">当前轮次</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {currentPlayer ? currentPlayer.name : "暂无玩家"}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-700">
              手动切到当前玩家后，再按扔骰子或抽卡即可。为了兼容实体局双掷、停留和特别规则，这里不会自动帮你推进到下一位。
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => rollDice()} className={primaryButtonClass}>
                为当前玩家扔骰子
              </button>
              <button type="button" onClick={advanceToNextPlayer} className={secondaryButtonClass}>
                切到下一位
              </button>
              <button type="button" onClick={() => drawCard("CHANCE")} className={secondaryButtonClass}>
                当前玩家抽机会
              </button>
              <button type="button" onClick={() => drawCard("FATE")} className={secondaryButtonClass}>
                当前玩家抽命运
              </button>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/90 bg-white/82 p-4 shadow-sm">
              <div className="text-sm text-sky-600">最近一次掷骰</div>
              {latestRoll ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestRoll.values.map((value, index) => (
                      <div
                        key={`${latestRoll.id}-${index}`}
                        className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[24px] border border-fuchsia-200 bg-[radial-gradient(circle_at_top,#ffffff_0%,#fef3c7_28%,#f9a8d4_68%,#60a5fa_100%)] text-3xl font-bold text-slate-900 shadow-[0_14px_30px_rgba(236,72,153,0.16)]"
                      >
                        {value}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-900">
                    {latestRoll.playerName} 掷出 {latestRoll.values.join(" + ")} = {latestRoll.total}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{latestRoll.createdAt}</div>
                </>
              ) : (
                <div className="mt-3 text-sm text-slate-700">还没有掷骰记录。</div>
              )}
            </div>

            <div className="mt-5 rounded-[24px] border border-white/90 bg-white/82 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-violet-600">操作记录</div>
                <div className="text-xs text-slate-500">最多保留 18 条</div>
              </div>
              <div className="mt-3 space-y-2">
                {state.logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-slate-100 bg-white/92 px-3 py-2.5 text-sm text-slate-700 shadow-sm"
                  >
                    <div className="font-medium text-slate-900">{log.message}</div>
                    <div className="mt-1 text-xs text-slate-500">{log.createdAt}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section
          className={`${panelClass} mt-4 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,249,255,0.88),rgba(255,255,255,0.84))]`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-fuchsia-600">玩家面板</p>
              <h2 className="mt-1.5 text-xl font-semibold text-slate-900">
                线下局现金管理
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-700">
              保留 `rich` 里最常用的主持功能。每位玩家都能单独扔骰子、抽卡、过起点领工资，下面的小额加减按钮适合线下局快速结算。
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activePlayers.map((player) => {
              const isCurrent = currentPlayer?.seat === player.seat;

              return (
                <article
                  key={player.seat}
                  className="rounded-[24px] border p-4 transition"
                  style={getPlayerCardStyle(player.color, isCurrent)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-[0.26em] text-fuchsia-600">
                        Player {player.seat}
                      </div>
                      <input
                        key={`${player.seat}-${player.name}`}
                        type="text"
                        defaultValue={player.name}
                        maxLength={20}
                        onBlur={(event) => {
                          updatePlayerName(player.seat, event.target.value);
                          event.target.value =
                            event.target.value.trim() || player.name;
                        }}
                        className="mt-1.5 w-full rounded-2xl border border-fuchsia-100 bg-white/90 px-3 py-1.5 text-base font-semibold text-slate-900 outline-none transition focus:border-fuchsia-400 focus:bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentPlayer(player.seat)}
                      className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:brightness-95"
                      style={{
                        backgroundColor: isCurrent ? player.color : undefined,
                        color: isCurrent ? "#020617" : undefined,
                      }}
                    >
                      {isCurrent ? "当前玩家" : "设为当前"}
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm text-slate-600">现金余额</div>
                    <div className="mt-1 text-3xl font-bold text-slate-900">
                      {formatMoney(player.money)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => giveSalary(player.seat)}
                      className="rounded-full bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 sm:text-sm"
                    >
                      经过起点 +{formatMoney(state.salary)}
                    </button>
                    <button
                      type="button"
                      onClick={() => rollDice(player.seat)}
                      className="rounded-full bg-[linear-gradient(135deg,#f97316,#ec4899)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 sm:text-sm"
                    >
                      扔骰子
                    </button>
                    <button
                      type="button"
                      onClick={() => drawCard("CHANCE", player.seat)}
                      className="rounded-full border border-sky-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-400 hover:bg-sky-50 sm:text-sm"
                    >
                      机会卡
                    </button>
                    <button
                      type="button"
                      onClick={() => drawCard("FATE", player.seat)}
                      className="rounded-full border border-rose-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 sm:text-sm"
                    >
                      命运卡
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-7 gap-1.5">
                    {MONEY_STEPS.map((step) => (
                      <div key={`${player.seat}-${step}`} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => updateMoney(player.seat, -step)}
                          className="w-full rounded-xl border border-rose-300 bg-rose-100/90 px-1.5 py-1.5 text-[10px] font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-200/80"
                        >
                          -{step}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMoney(player.seat, step)}
                          className="w-full rounded-xl border border-emerald-300 bg-emerald-100/90 px-1.5 py-1.5 text-[10px] font-medium text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-200/80"
                        >
                          +{step}
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {drawnCard ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
            <button
              type="button"
              aria-label="关闭抽卡弹窗"
              onClick={() => setDrawnCard(null)}
              className="absolute inset-0"
            />
            <div className="relative z-10 w-full max-w-2xl rounded-[32px] border border-violet-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(224,231,255,0.92),rgba(252,231,243,0.94),rgba(254,249,195,0.90))] p-5 shadow-[0_28px_90px_rgba(139,92,246,0.24)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm uppercase tracking-[0.28em] text-violet-600">
                    抽卡结果
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {drawnCard.playerName} 抽到一张{getCardLabel(drawnCard.card.type)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    先确认卡面内容，再决定要不要把金额效果记到当前玩家身上。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDrawnCard(null)}
                  className="rounded-full border border-violet-200 bg-white/85 px-4 py-2 text-sm font-medium text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
                >
                  关闭
                </button>
              </div>

              <div className="mt-6 rounded-[28px] border border-white/90 bg-white/90 p-5 shadow-sm">
                <div className="text-sm text-violet-600">
                  {getCardLabel(drawnCard.card.type)} · {drawnCard.playerName}
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {drawnCard.card.title}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {drawnCard.card.description}
                </p>
                <div className="mt-4 text-base font-medium text-slate-900">
                  金额效果:{" "}
                  <span
                    className={
                      drawnCard.card.effectMoney >= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {getSignedMoneyLabel(drawnCard.card.effectMoney)}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyDrawnCard}
                  disabled={drawnCard.applied}
                  className="rounded-full bg-[linear-gradient(135deg,#22c55e,#14b8a6)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {drawnCard.applied ? "金额已应用" : `应用到 ${drawnCard.playerName}`}
                </button>
                <button
                  type="button"
                  onClick={() => drawCard(drawnCard.card.type, drawnCard.playerSeat)}
                  className="rounded-full border border-violet-200 bg-white/80 px-4 py-2.5 text-sm text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
                >
                  再抽一张
                </button>
                <button
                  type="button"
                  onClick={() => setDrawnCard(null)}
                  className={subtleButtonClass}
                >
                  暂时关闭
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
