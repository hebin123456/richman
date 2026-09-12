export type TabletopCardKind = "CHANCE" | "FATE";

export type TabletopCardPreset = {
  id: string;
  type: TabletopCardKind;
  title: string;
  description: string;
  effectMoney: number;
};

export type TabletopPlayerPreset = {
  seat: number;
  name: string;
  color: string;
};

export const TABLETOP_PLAYER_PRESETS: TabletopPlayerPreset[] = [
  { seat: 1, name: "旅行家 1", color: "#e5e7eb" },
  { seat: 2, name: "旅行家 2", color: "#60a5fa" },
  { seat: 3, name: "旅行家 3", color: "#f59e0b" },
  { seat: 4, name: "旅行家 4", color: "#34d399" },
  { seat: 5, name: "旅行家 5", color: "#f472b6" },
  { seat: 6, name: "旅行家 6", color: "#a78bfa" },
];

export const TABLETOP_CARD_PRESETS: TabletopCardPreset[] = [
  {
    id: "chance-1",
    type: "CHANCE",
    title: "航空公司里程奖励",
    description: "你的环球旅程获得赞助，立刻收入 500。",
    effectMoney: 500,
  },
  {
    id: "chance-2",
    type: "CHANCE",
    title: "免费升级商务舱",
    description: "旅伴请客，节省交通支出，收入 300。",
    effectMoney: 300,
  },
  {
    id: "chance-3",
    type: "CHANCE",
    title: "回到起点",
    description: "导航顺路带你回到起点，并领取 2000。",
    effectMoney: 2000,
  },
  {
    id: "chance-4",
    type: "CHANCE",
    title: "城市联展分红",
    description: "你参与城市推广联展，获得 800 奖金。",
    effectMoney: 800,
  },
  {
    id: "chance-5",
    type: "CHANCE",
    title: "旅馆评价爆红",
    description: "你名下酒店评分飙升，获得 1200。",
    effectMoney: 1200,
  },
  {
    id: "chance-6",
    type: "CHANCE",
    title: "幸运外汇收益",
    description: "汇率波动对你有利，获得 600。",
    effectMoney: 600,
  },
  {
    id: "chance-7",
    type: "CHANCE",
    title: "环球摄影大奖",
    description: "你的旅行摄影入围大奖，收入 1000。",
    effectMoney: 1000,
  },
  {
    id: "chance-8",
    type: "CHANCE",
    title: "好友借住回礼",
    description: "好友借住你的房产，回赠 400。",
    effectMoney: 400,
  },
  {
    id: "fate-1",
    type: "FATE",
    title: "航班延误",
    description: "突发延误导致行程额外开销，支付 300。",
    effectMoney: -300,
  },
  {
    id: "fate-2",
    type: "FATE",
    title: "护照补办",
    description: "旅行证件遗失，补办费用支付 500。",
    effectMoney: -500,
  },
  {
    id: "fate-3",
    type: "FATE",
    title: "城市维护税",
    description: "你在各地的房产进入年度维护期，支付 800。",
    effectMoney: -800,
  },
  {
    id: "fate-4",
    type: "FATE",
    title: "海关抽检",
    description: "行李超重被抽检，额外支付 200。",
    effectMoney: -200,
  },
  {
    id: "fate-5",
    type: "FATE",
    title: "暴雨停航",
    description: "极端天气导致计划延后，支付 600。",
    effectMoney: -600,
  },
  {
    id: "fate-6",
    type: "FATE",
    title: "修缮古迹赞助",
    description: "你参与古迹修缮基金，支付 1000。",
    effectMoney: -1000,
  },
  {
    id: "fate-7",
    type: "FATE",
    title: "跨洲紧急转机",
    description: "临时更换航线，支付 400。",
    effectMoney: -400,
  },
  {
    id: "fate-8",
    type: "FATE",
    title: "银版特别维修",
    description: "银版列车保养费到期，支付 700。",
    effectMoney: -700,
  },
];
