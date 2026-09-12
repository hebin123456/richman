export type GodKey =
  | "tudigong"
  | "tianshi"
  | "daCaishen"
  | "xiaoCaishen"
  | "daFushen"
  | "xiaoFushen"
  | "pohuaishen"
  | "daShuaishen"
  | "xiaoShuaishen"
  | "daQiongshen"
  | "xiaoQiongshen";

export type GodAlignment = "good" | "bad";

export interface GodDefinition {
  key: GodKey;
  name: string;
  description: string;
  colorHex: string;
  alignment: GodAlignment;
}

export const GOD_DURATION_TURNS = 5;

export const GOD_DEFINITIONS: GodDefinition[] = [
  {
    key: "tudigong",
    name: "土地公",
    description: "本回合停下时，若落点是可占领地块，就会归你所有；若原本有主，仍需先付该地过路费。",
    colorHex: "#c084fc",
    alignment: "good",
  },
  {
    key: "tianshi",
    name: "天使",
    description: "本回合停下时，若落点是任意有主普通地产，会自动加盖 1 层。",
    colorHex: "#60a5fa",
    alignment: "good",
  },
  {
    key: "daCaishen",
    name: "大财神",
    description: "附身期间免付过路费，回到自己地产时建房免费。",
    colorHex: "#f59e0b",
    alignment: "good",
  },
  {
    key: "xiaoCaishen",
    name: "小财神",
    description: "附身期间免付过路费，回到自己地产时建房免费。",
    colorHex: "#fbbf24",
    alignment: "good",
  },
  {
    key: "daFushen",
    name: "大福神",
    description:
      "刚附身时立刻获得 2 张随机道具卡；附身期间不会被陷害、坐牢或梦游，买下空地时会直接加盖 1 层，回到自己地产时建房效果加倍。",
    colorHex: "#16a34a",
    alignment: "good",
  },
  {
    key: "xiaoFushen",
    name: "小福神",
    description: "刚附身时立刻获得 1 张随机道具卡；附身期间不会被陷害、坐牢或梦游，回到自己地产时建房效果加倍。",
    colorHex: "#22c55e",
    alignment: "good",
  },
  {
    key: "pohuaishen",
    name: "破坏神",
    description: "本回合停下时，若落点是任意有主普通地产，会自动拆掉 1 层。",
    colorHex: "#475569",
    alignment: "bad",
  },
  {
    key: "daShuaishen",
    name: "大衰神",
    description: "回合开始时会丢掉背包中一半的卡片，附身期间建房一定失败。",
    colorHex: "#dc2626",
    alignment: "bad",
  },
  {
    key: "xiaoShuaishen",
    name: "小衰神",
    description: "回合开始时会随机丢掉背包中的 1 张卡片，附身期间建房一定失败。",
    colorHex: "#ef4444",
    alignment: "bad",
  },
  {
    key: "daQiongshen",
    name: "大穷神",
    description: "回合开始时向每位其他玩家派钱较多，并且附身期间过路费翻倍。",
    colorHex: "#7c3aed",
    alignment: "bad",
  },
  {
    key: "xiaoQiongshen",
    name: "小穷神",
    description: "回合开始时向每位其他玩家派钱较少，并且附身期间过路费翻倍。",
    colorHex: "#8b5cf6",
    alignment: "bad",
  },
];

const GOD_MAP = new Map(GOD_DEFINITIONS.map((definition) => [definition.key, definition]));
const LEGACY_GOD_KEY_ALIASES: Record<string, GodKey> = {
  caishen: "xiaoCaishen",
  fushen: "xiaoFushen",
  shuaishen: "xiaoShuaishen",
};
const BLESSING_GOD_KEYS = GOD_DEFINITIONS.filter((definition) => definition.alignment === "good").map(
  (definition) => definition.key,
);
const CURSE_GOD_KEYS = GOD_DEFINITIONS.filter((definition) => definition.alignment === "bad").map(
  (definition) => definition.key,
);

export function normalizeGodKey(key: string | null | undefined): GodKey | null {
  if (!key) {
    return null;
  }

  return GOD_MAP.has(key as GodKey) ? (key as GodKey) : (LEGACY_GOD_KEY_ALIASES[key] ?? null);
}

export function getGodDefinition(key: string | null | undefined) {
  const normalizedKey = normalizeGodKey(key);
  if (!normalizedKey) {
    return null;
  }

  return GOD_MAP.get(normalizedKey) ?? null;
}

function pickRandomGod(keys: GodKey[], random: () => number = Math.random) {
  return keys[Math.floor(random() * keys.length)] ?? null;
}

export function getRandomBlessingGodKey(random: () => number = Math.random): GodKey {
  return pickRandomGod(BLESSING_GOD_KEYS, random) ?? "xiaoCaishen";
}

export function getRandomCurseGodKey(random: () => number = Math.random): GodKey {
  return pickRandomGod(CURSE_GOD_KEYS, random) ?? "xiaoShuaishen";
}

export function isCurseGodKey(key: string | null | undefined) {
  return getGodDefinition(key)?.alignment === "bad";
}

export function isCaishenGodKey(key: string | null | undefined) {
  return key === "daCaishen" || key === "xiaoCaishen";
}

export function isFushenGodKey(key: string | null | undefined) {
  return key === "daFushen" || key === "xiaoFushen";
}

export function isShuaishenGodKey(key: string | null | undefined) {
  return key === "daShuaishen" || key === "xiaoShuaishen";
}

export function getGodAttachRewardCount(key: string | null | undefined) {
  if (key === "daFushen") {
    return 2;
  }

  if (key === "xiaoFushen") {
    return 1;
  }

  return 0;
}

export function getPurchaseHouseBonusByGod(key: string | null | undefined) {
  return key === "daFushen" ? 1 : 0;
}
