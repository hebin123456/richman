export type CardDeckType = "chance" | "community";

export type CardEffect =
  | { type: "collect"; amount: number }
  | { type: "pay"; amount: number }
  | { type: "collectFromPlayers"; amount: number }
  | { type: "moveAbsolute"; tileIndex: number; collectPassStart?: boolean }
  | { type: "moveRelative"; steps: number }
  | { type: "goToJail" }
  | { type: "jailFree" }
  | { type: "randomItem"; count: number };

export interface CardDefinition {
  id: string;
  deck: CardDeckType;
  title: string;
  description: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: CardDefinition[] = [
  {
    id: "chance-start",
    deck: "chance",
    title: "财神眷顾",
    description: "立刻回到起点。",
    effect: { type: "moveAbsolute", tileIndex: 0, collectPassStart: true },
  },
  {
    id: "chance-north-rail",
    deck: "chance",
    title: "快车直达",
    description: "前往北方铁路。",
    effect: { type: "moveAbsolute", tileIndex: 16, collectPassStart: true },
  },
  {
    id: "chance-item-shop",
    deck: "chance",
    title: "旅行采购",
    description: "前往道具店。",
    effect: { type: "moveAbsolute", tileIndex: 30, collectPassStart: true },
  },
  {
    id: "chance-forward-three",
    deck: "chance",
    title: "加速前进",
    description: "前进 3 格。",
    effect: { type: "moveRelative", steps: 3 },
  },
  {
    id: "chance-forward-five",
    deck: "chance",
    title: "顺风加速",
    description: "前进 5 格。",
    effect: { type: "moveRelative", steps: 5 },
  },
  {
    id: "chance-back-two",
    deck: "chance",
    title: "绕了远路",
    description: "后退 2 格。",
    effect: { type: "moveRelative", steps: -2 },
  },
  {
    id: "chance-back-three",
    deck: "chance",
    title: "逆风折返",
    description: "后退 3 格。",
    effect: { type: "moveRelative", steps: -3 },
  },
  {
    id: "chance-dividend",
    deck: "chance",
    title: "股票分红",
    description: "从银行领取 180 元。",
    effect: { type: "collect", amount: 180 },
  },
  {
    id: "chance-project-profit",
    deck: "chance",
    title: "项目尾款",
    description: "从银行领取 260 元。",
    effect: { type: "collect", amount: 260 },
  },
  {
    id: "chance-repairs",
    deck: "chance",
    title: "设备检修",
    description: "向银行支付 120 元。",
    effect: { type: "pay", amount: 120 },
  },
  {
    id: "chance-fine",
    deck: "chance",
    title: "违规罚单",
    description: "向银行支付 180 元。",
    effect: { type: "pay", amount: 180 },
  },
  {
    id: "chance-jail-free",
    deck: "chance",
    title: "免罪金牌",
    description: "获得一张出狱卡。",
    effect: { type: "jailFree" },
  },
  {
    id: "chance-go-jail",
    deck: "chance",
    title: "临时拘留",
    description: "立刻前往监狱。",
    effect: { type: "goToJail" },
  },
  {
    id: "chance-bonus",
    deck: "chance",
    title: "商业庆功",
    description: "从每位玩家处收取 40 元。",
    effect: { type: "collectFromPlayers", amount: 40 },
  },
  {
    id: "chance-random-item",
    deck: "chance",
    title: "神秘包裹",
    description: "随机获得 1 张道具卡。",
    effect: { type: "randomItem", count: 1 },
  },
];

export const COMMUNITY_CARDS: CardDefinition[] = [
  {
    id: "community-start",
    deck: "community",
    title: "回乡探亲",
    description: "回到起点并领取过路费。",
    effect: { type: "moveAbsolute", tileIndex: 0, collectPassStart: true },
  },
  {
    id: "community-bank",
    deck: "community",
    title: "出差调度",
    description: "前往银行。",
    effect: { type: "moveAbsolute", tileIndex: 5, collectPassStart: true },
  },
  {
    id: "community-amusement",
    deck: "community",
    title: "周末出游",
    description: "前往游乐场。",
    effect: { type: "moveAbsolute", tileIndex: 20, collectPassStart: true },
  },
  {
    id: "community-lottery",
    deck: "community",
    title: "试试手气",
    description: "前往彩票屋。",
    effect: { type: "moveAbsolute", tileIndex: 25, collectPassStart: true },
  },
  {
    id: "community-aid",
    deck: "community",
    title: "政府补助",
    description: "从银行领取 120 元。",
    effect: { type: "collect", amount: 120 },
  },
  {
    id: "community-gift",
    deck: "community",
    title: "老友资助",
    description: "从银行领取 180 元。",
    effect: { type: "collect", amount: 180 },
  },
  {
    id: "community-medical",
    deck: "community",
    title: "健康检查",
    description: "向银行支付 80 元。",
    effect: { type: "pay", amount: 80 },
  },
  {
    id: "community-charity",
    deck: "community",
    title: "公益捐款",
    description: "向银行支付 140 元。",
    effect: { type: "pay", amount: 140 },
  },
  {
    id: "community-birthday",
    deck: "community",
    title: "生日快乐",
    description: "从每位玩家处收取 30 元礼金。",
    effect: { type: "collectFromPlayers", amount: 30 },
  },
  {
    id: "community-back-one",
    deck: "community",
    title: "塞车了",
    description: "后退 1 格。",
    effect: { type: "moveRelative", steps: -1 },
  },
  {
    id: "community-forward-two",
    deck: "community",
    title: "换乘捷径",
    description: "前进 2 格。",
    effect: { type: "moveRelative", steps: 2 },
  },
  {
    id: "community-jail-free",
    deck: "community",
    title: "律师函",
    description: "获得一张出狱卡。",
    effect: { type: "jailFree" },
  },
  {
    id: "community-go-jail",
    deck: "community",
    title: "误闯禁区",
    description: "直接前往监狱。",
    effect: { type: "goToJail" },
  },
  {
    id: "community-random-item",
    deck: "community",
    title: "热心邻居",
    description: "随机获得 1 张道具卡。",
    effect: { type: "randomItem", count: 1 },
  },
];

const CARD_MAP = Object.fromEntries(
  [...CHANCE_CARDS, ...COMMUNITY_CARDS].map((card) => [card.id, card]),
) as Record<string, CardDefinition>;

export function getCardById(cardId: string) {
  return CARD_MAP[cardId];
}

export function createShuffledDeck(deck: CardDeckType) {
  const source = deck === "chance" ? CHANCE_CARDS : COMMUNITY_CARDS;
  const ids = source.map((card) => card.id);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  return ids;
}
