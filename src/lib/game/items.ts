import { GOD_DURATION_TURNS, type GodKey } from "@/lib/game/gods";

export type ItemEffectType =
  | "wealthRedistribution"
  | "sabotage"
  | "sleepwalk"
  | "cashBoost"
  | "vehicle"
  | "remoteDice"
  | "collectFromPlayers"
  | "jailFree"
  | "blessing"
  | "summonMapGod"
  | "dismissGod"
  | "badGod"
  | "stealCash"
  | "taxAudit"
  | "rebound"
  | "innocence"
  | "freePass";

export type VehicleKey = "motorcycle" | "car";

export interface VehicleDefinition {
  key: VehicleKey;
  name: string;
  description: string;
  diceCount: number;
  turns: number;
  itemKey: string;
}

export interface ItemDefinition {
  key: string;
  name: string;
  price: number;
  description: string;
  effectType: ItemEffectType;
  requiresTarget?: boolean;
  vehicleKey?: VehicleKey;
  amount?: number;
  godKey?: GodKey;
  turns?: number;
  rate?: number;
}

export const VEHICLE_DURATION_TURNS = 5;
export const REMOTE_DICE_ITEM_KEY = "remoteDice";
export const DREAMWALK_ITEM_KEY = "sleepwalkCard";
export const REBOUND_ITEM_KEY = "reboundCard";
export const INNOCENCE_ITEM_KEY = "innocenceCard";
export const TAX_AUDIT_ITEM_KEY = "taxAuditCard";
export const FREE_PASS_ITEM_KEY = "freePassCard";
export const SUMMON_MAP_GOD_ITEM_KEY = "summonGodCard";
export const DISMISS_GOD_ITEM_KEY = "dismissGodCard";

export const VEHICLE_DEFINITIONS: VehicleDefinition[] = [
  {
    key: "motorcycle",
    name: "摩托车",
    description: "骑上摩托后，接下来 5 回合每次最多可掷 2 个骰子。",
    diceCount: 2,
    turns: VEHICLE_DURATION_TURNS,
    itemKey: "motorcycle",
  },
  {
    key: "car",
    name: "小汽车",
    description: "开上小汽车后，接下来 5 回合每次最多可掷 3 个骰子。",
    diceCount: 3,
    turns: VEHICLE_DURATION_TURNS,
    itemKey: "car",
  },
];

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  {
    key: "junFuCard",
    name: "均富卡",
    price: 280,
    description: "将所有未破产玩家的现金重新平均分配。",
    effectType: "wealthRedistribution",
  },
  {
    key: "trapCard",
    name: "陷害卡",
    price: 320,
    description: "指定一名对手，直接把他陷害进监狱。可被免罪卡挡下，也可能被反弹卡反弹。",
    effectType: "sabotage",
    requiresTarget: true,
  },
  {
    key: DREAMWALK_ITEM_KEY,
    name: "梦游卡",
    price: 340,
    description: "指定一名对手进入梦游状态 5 回合，期间不能买地、建房、使用资产操作，也无法收过路费。",
    effectType: "sleepwalk",
    requiresTarget: true,
    turns: 5,
  },
  {
    key: "bonusCard",
    name: "分红卡",
    price: 180,
    description: "立刻从银行领取 180 元。",
    effectType: "cashBoost",
    amount: 180,
  },
  {
    key: "redPacketCard",
    name: "红包卡",
    price: 260,
    description: "立刻从银行领取 260 元，补一口现金。",
    effectType: "cashBoost",
    amount: 260,
  },
  {
    key: "rentCard",
    name: "收租卡",
    price: 360,
    description: "立刻向每位其他玩家收取 60 元。",
    effectType: "collectFromPlayers",
    amount: 60,
  },
  {
    key: "lawyerCard",
    name: "律师卡",
    price: 240,
    description: "立刻获得一张出狱卡，留作保命。",
    effectType: "jailFree",
    amount: 1,
  },
  {
    key: "fortuneCard",
    name: "财神卡",
    price: 320,
    description: `立刻请来小财神，接下来 ${GOD_DURATION_TURNS} 天免付过路费，回到自己地产时建房也免费。`,
    effectType: "blessing",
    godKey: "xiaoCaishen",
  },
  {
    key: "luckyCard",
    name: "福神卡",
    price: 300,
    description: `立刻请来小福神，先送 1 张卡，接下来 ${GOD_DURATION_TURNS} 天不会被陷害、坐牢或梦游，建房还会加倍。`,
    effectType: "blessing",
    godKey: "xiaoFushen",
  },
  {
    key: SUMMON_MAP_GOD_ITEM_KEY,
    name: "请神卡",
    price: 320,
    description: "把距离自己最近的地图神明直接拉到身上；如果场上没有地图神明，仍会使用失败并消耗掉。",
    effectType: "summonMapGod",
  },
  {
    key: DISMISS_GOD_ITEM_KEY,
    name: "送神卡",
    price: 260,
    description: "立刻送走自己身上的神明，清除当前神明效果。",
    effectType: "dismissGod",
  },
  {
    key: "misfortuneCard",
    name: "衰神卡",
    price: 340,
    description: "指定一名对手，把小衰神挂到他头上。可能被反弹卡反弹。",
    effectType: "badGod",
    requiresTarget: true,
    godKey: "xiaoShuaishen",
  },
  {
    key: "debtCard",
    name: "讨债卡",
    price: 300,
    description: "指定一名对手，立刻从他那里收回 180 元。",
    effectType: "stealCash",
    requiresTarget: true,
    amount: 180,
  },
  {
    key: TAX_AUDIT_ITEM_KEY,
    name: "查税卡",
    price: 320,
    description: "指定一名对手，强制收取对方当前现金的 10%。可被免费卡免除。",
    effectType: "taxAudit",
    requiresTarget: true,
    rate: 0.1,
  },
  {
    key: REBOUND_ITEM_KEY,
    name: "反弹卡",
    price: 360,
    description: "被别人施加陷害、梦游或坏神等负面状态时自动反弹 1 次。",
    effectType: "rebound",
  },
  {
    key: INNOCENCE_ITEM_KEY,
    name: "免罪卡",
    price: 280,
    description: "被陷害卡或梦游卡针对时，可在响应弹窗里手动选择抵消 1 次。",
    effectType: "innocence",
  },
  {
    key: FREE_PASS_ITEM_KEY,
    name: "免费卡",
    price: 300,
    description: "遇到过路费、查税、税金等付款时，可在响应弹窗里手动选择免单 1 次。",
    effectType: "freePass",
  },
  {
    key: "motorcycle",
    name: "摩托车",
    price: 360,
    description: "使用后持续 5 回合，每回合最多可掷 2 个骰子，并触发摩托冲刺特效。",
    effectType: "vehicle",
    vehicleKey: "motorcycle",
  },
  {
    key: "car",
    name: "小汽车",
    price: 520,
    description: "使用后持续 5 回合，每回合最多可掷 3 个骰子，并触发小汽车加速特效。",
    effectType: "vehicle",
    vehicleKey: "car",
  },
  {
    key: REMOTE_DICE_ITEM_KEY,
    name: "遥控骰子",
    price: 420,
    description: "直接指定本次掷骰总点数。步行可选 1~6，摩托可选 1~12，小汽车可选 1~18。",
    effectType: "remoteDice",
  },
];

export const ITEM_DEFINITION_MAP = Object.fromEntries(
  ITEM_DEFINITIONS.map((item) => [item.key, item]),
) as Record<string, ItemDefinition>;

export function getItemDefinition(itemKey: string) {
  return ITEM_DEFINITION_MAP[itemKey] ?? null;
}

const VEHICLE_DEFINITION_MAP = Object.fromEntries(
  VEHICLE_DEFINITIONS.map((vehicle) => [vehicle.key, vehicle]),
) as Record<VehicleKey, VehicleDefinition>;

export function getVehicleDefinition(vehicleKey?: string | null) {
  if (!vehicleKey) {
    return null;
  }

  return VEHICLE_DEFINITION_MAP[vehicleKey as VehicleKey] ?? null;
}

export function getVehicleDefinitionByItemKey(itemKey: string) {
  const item = getItemDefinition(itemKey);
  if (!item?.vehicleKey) {
    return null;
  }

  return getVehicleDefinition(item.vehicleKey);
}
