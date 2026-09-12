import { withBasePath } from "@/lib/base-path";

export type TileType =
  | "start"
  | "property"
  | "railroad"
  | "bank"
  | "magic"
  | "chance"
  | "community"
  | "news"
  | "freeCard"
  | "amusement"
  | "shop"
  | "lottery"
  | "tax"
  | "jail"
  | "freeParking"
  | "goToJail";

interface BaseTile<TType extends TileType> {
  index: number;
  name: string;
  type: TType;
  description: string;
}

export type StartTile = BaseTile<"start">;

export type BankTile = BaseTile<"bank">;

export type MagicTile = BaseTile<"magic">;

export type ChanceTile = BaseTile<"chance">;

export type CommunityTile = BaseTile<"community">;

export type NewsTile = BaseTile<"news">;

export type FreeCardTile = BaseTile<"freeCard">;

export type AmusementTile = BaseTile<"amusement">;

export type ShopTile = BaseTile<"shop">;

export type LotteryTile = BaseTile<"lottery">;

export type JailTile = BaseTile<"jail">;

export type FreeParkingTile = BaseTile<"freeParking">;

export type GoToJailTile = BaseTile<"goToJail">;

export interface PropertyTile extends BaseTile<"property"> {
  group: string;
  price: number;
  baseRent: number;
  houseCost: number;
  houseRents: [number, number, number, number];
  hotelRent: number;
}

export interface RailroadTile extends BaseTile<"railroad"> {
  price: number;
}

export interface TaxTile extends BaseTile<"tax"> {
  amount: number;
}

export type BoardTile =
  | StartTile
  | PropertyTile
  | RailroadTile
  | TaxTile
  | BankTile
  | MagicTile
  | ChanceTile
  | CommunityTile
  | NewsTile
  | FreeCardTile
  | AmusementTile
  | ShopTile
  | LotteryTile
  | JailTile
  | FreeParkingTile
  | GoToJailTile;

export const BOARD_TILES: BoardTile[] = [
  { index: 0, name: "起点", type: "start", description: "经过或停在这里都能重新整装出发。" },
  {
    index: 1,
    name: "台北",
    type: "property",
    group: "brown",
    price: 120,
    baseRent: 14,
    houseCost: 60,
    houseRents: [40, 110, 260, 420],
    hotelRent: 580,
    description: "棕色地段，适合前期抢先布局。",
  },
  {
    index: 2,
    name: "高雄",
    type: "property",
    group: "brown",
    price: 140,
    baseRent: 18,
    houseCost: 60,
    houseRents: [55, 140, 320, 480],
    hotelRent: 660,
    description: "与台北组成棕色地段。",
  },
  { index: 3, name: "机会", type: "chance", description: "抽一张机会牌，看看突然冒出来的好机会会把你推向哪里。" },
  { index: 4, name: "所得税", type: "tax", amount: 120, description: "向银行缴纳税金。" },
  {
    index: 5,
    name: "银行",
    type: "bank",
    description: "可办理存款、取款、贷款与还款。",
  },
  {
    index: 6,
    name: "上海",
    type: "property",
    group: "lightBlue",
    price: 180,
    baseRent: 22,
    houseCost: 80,
    houseRents: [70, 180, 420, 620],
    hotelRent: 820,
    description: "浅蓝色地段。",
  },
  {
    index: 7,
    name: "新加坡",
    type: "property",
    group: "lightBlue",
    price: 190,
    baseRent: 24,
    houseCost: 80,
    houseRents: [76, 195, 460, 670],
    hotelRent: 890,
    description: "与上海、香港组成浅蓝色地段。",
  },
  {
    index: 8,
    name: "香港",
    type: "property",
    group: "lightBlue",
    price: 200,
    baseRent: 26,
    houseCost: 80,
    houseRents: [82, 210, 490, 710],
    hotelRent: 940,
    description: "与上海、新加坡组成浅蓝色地段。",
  },
  {
    index: 9,
    name: "命运",
    type: "community",
    description: "抽一张命运牌，生活小事、意外转折和小确幸都可能发生。",
  },
  {
    index: 10,
    name: "罗马",
    type: "property",
    group: "yellow",
    price: 380,
    baseRent: 50,
    houseCost: 180,
    houseRents: [175, 480, 1020, 1320],
    hotelRent: 1660,
    description: "黄色地段，后期收益非常稳定。",
  },
  {
    index: 11,
    name: "东京",
    type: "property",
    group: "pink",
    price: 220,
    baseRent: 28,
    houseCost: 100,
    houseRents: [90, 240, 560, 760],
    hotelRent: 980,
    description: "粉色地段。", 
  },
  {
    index: 12,
    name: "大阪",
    type: "property",
    group: "pink",
    price: 220,
    baseRent: 30,
    houseCost: 100,
    houseRents: [95, 250, 580, 780],
    hotelRent: 1040,
    description: "与东京、横滨组成粉色地段。",
  },
  {
    index: 13,
    name: "横滨",
    type: "property",
    group: "pink",
    price: 240,
    baseRent: 32,
    houseCost: 100,
    houseRents: [100, 270, 610, 830],
    hotelRent: 1090,
    description: "与东京、大阪组成粉色地段。",
  },
  {
    index: 14,
    name: "魔法屋",
    type: "magic",
    description: "随机请来好神，或者把坏神送到别人头上，连天使和破坏神都可能现身。",
  },
  {
    index: 15,
    name: "首尔",
    type: "property",
    group: "orange",
    price: 260,
    baseRent: 34,
    houseCost: 120,
    houseRents: [110, 300, 700, 900],
    hotelRent: 1160,
    description: "橙色地段。",
  },
  {
    index: 16,
    name: "北方铁路",
    type: "railroad",
    price: 220,
    description: "铁路网络会持续带来现金流；若同一玩家同时拥有两条铁路，过路费翻倍。",
  },
  { index: 17, name: "免费停车", type: "freeParking", description: "在这里休息一下。" },
  {
    index: 18,
    name: "釜山",
    type: "property",
    group: "orange",
    price: 260,
    baseRent: 36,
    houseCost: 120,
    houseRents: [115, 310, 720, 920],
    hotelRent: 1180,
    description: "与首尔、曼谷组成橙色地段。",
  },
  {
    index: 19,
    name: "曼谷",
    type: "property",
    group: "orange",
    price: 280,
    baseRent: 38,
    houseCost: 120,
    houseRents: [125, 330, 760, 980],
    hotelRent: 1240,
    description: "与首尔、釜山组成橙色地段。",
  },
  {
    index: 20,
    name: "游乐场",
    type: "amusement",
    description: "挑一个小游戏摊位试试手气，赢点奖金或道具。",
  },
  { index: 21, name: "前往监狱", type: "goToJail", description: "直接前往监狱，不能经过起点。" },
  {
    index: 22,
    name: "巴黎",
    type: "property",
    group: "red",
    price: 320,
    baseRent: 42,
    houseCost: 160,
    houseRents: [140, 380, 860, 1120],
    hotelRent: 1400,
    description: "红色地段。",
  },
  {
    index: 23,
    name: "伦敦",
    type: "property",
    group: "red",
    price: 320,
    baseRent: 44,
    houseCost: 160,
    houseRents: [150, 400, 900, 1180],
    hotelRent: 1460,
    description: "与巴黎、柏林组成红色地段。",
  },
  {
    index: 24,
    name: "柏林",
    type: "property",
    group: "red",
    price: 340,
    baseRent: 46,
    houseCost: 160,
    houseRents: [160, 430, 960, 1240],
    hotelRent: 1520,
    description: "与巴黎、伦敦组成红色地段。",
  },
  {
    index: 25,
    name: "彩票屋",
    type: "lottery",
    description: "挑一张彩色数字奖券，等开奖时冲一把大奖。",
  },
  { index: 26, name: "监狱", type: "jail", description: "固定关押 3 天，待满后会在当回合恢复掷骰；如果有人踩到这里，会立即放出监狱里的人。" },
  {
    index: 27,
    name: "悉尼",
    type: "property",
    group: "yellow",
    price: 400,
    baseRent: 52,
    houseCost: 180,
    houseRents: [185, 500, 1080, 1380],
    hotelRent: 1720,
    description: "与罗马组成黄色终盘地段。",
  },
  {
    index: 28,
    name: "南方铁路",
    type: "railroad",
    price: 240,
    description: "凑齐两条铁路后，双方铁路的过路费都会直接翻倍。",
  },
  {
    index: 29,
    name: "新闻屋",
    type: "news",
    description: "追加一条热点快讯，可能送钱，也可能把你送进麻烦。",
  },
  {
    index: 30,
    name: "道具店",
    type: "shop",
    description: "旅行商人会出售经典支援卡。",
  },
  { index: 31, name: "奢侈税", type: "tax", amount: 180, description: "向银行缴纳奢侈税。" },
  {
    index: 32,
    name: "洛杉矶",
    type: "property",
    group: "darkBlue",
    price: 420,
    baseRent: 55,
    houseCost: 200,
    houseRents: [180, 520, 1100, 1420],
    hotelRent: 1760,
    description: "深蓝色地段。",
  },
  {
    index: 33,
    name: "纽约",
    type: "property",
    group: "darkBlue",
    price: 460,
    baseRent: 60,
    houseCost: 200,
    houseRents: [200, 560, 1200, 1500],
    hotelRent: 1900,
    description: "深蓝色终盘王牌地段。",
  },
];

export const JAIL_INDEX = 26;

export function getTile(tileIndex: number) {
  return BOARD_TILES[tileIndex];
}

export function isPurchasableTile(tile: BoardTile): tile is PropertyTile | RailroadTile {
  return tile.type === "property" || tile.type === "railroad";
}

export function getMonopolyGroupSize(group: string) {
  return BOARD_TILES.filter((tile): tile is PropertyTile => tile.type === "property")
    .filter((tile) => tile.group === group).length;
}

export function getPropertyGroupTiles(group: string) {
  return BOARD_TILES.filter((tile): tile is PropertyTile => tile.type === "property")
    .filter((tile) => tile.group === group);
}

const TILE_ICON_PATHS: Partial<Record<TileType, string>> = {
  start: "/tile-icons/start.svg",
  railroad: "/tile-icons/railroad.svg",
  bank: "/tile-icons/bank.svg",
  magic: "/tile-icons/magic.svg",
  chance: "/tile-icons/chance.svg",
  community: "/tile-icons/community.svg",
  news: "/tile-icons/news.svg",
  freeCard: "/tile-icons/free-card.svg",
  amusement: "/tile-icons/amusement.svg",
  shop: "/tile-icons/shop.svg",
  lottery: "/tile-icons/lottery.svg",
  tax: "/tile-icons/tax.svg",
  jail: "/tile-icons/jail.svg",
  freeParking: "/tile-icons/free-parking.svg",
  goToJail: "/tile-icons/go-to-jail.svg",
};

export function getTileIconPath(type: TileType) {
  const path = TILE_ICON_PATHS[type] ?? null;
  return path ? withBasePath(path) : null;
}

export function getTileIconTextureKey(type: TileType) {
  return `tile-icon-${type}`;
}


