import { withBasePath } from "@/lib/base-path";

export type CharacterId =
  | "atubo"
  | "shalongbasi"
  | "jinbeibei"
  | "qianfuren"
  | "sunxiaomei"
  | "pupu"
  | "tangtang"
  | "robot"
  | "dalaoqian"
  | "lixiaoyao"
  | "zhaolinger"
  | "linyueru"
  | "anu";

export interface CharacterPreset {
  id: CharacterId;
  name: string;
  title: string;
  color: string;
  accent: string;
  avatarPath: string;
  piece: string;
  description: string;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: "atubo",
    name: "阿土伯",
    title: "土地公型玩家",
    color: "bg-amber-100 text-amber-900 border-amber-300",
    accent: "amber",
    avatarPath: getCharacterAvatarPath("atubo"),
    piece: "牛",
    description: "稳扎稳打，最适合一步步把整条街买下来。",
  },
  {
    id: "shalongbasi",
    name: "沙隆巴斯",
    title: "搞怪冒险家",
    color: "bg-lime-100 text-lime-900 border-lime-300",
    accent: "lime",
    avatarPath: getCharacterAvatarPath("shalongbasi"),
    piece: "风",
    description: "到处闯荡的行动派，气氛担当。",
  },
  {
    id: "jinbeibei",
    name: "金贝贝",
    title: "元气大小姐",
    color: "bg-pink-100 text-pink-900 border-pink-300",
    accent: "pink",
    avatarPath: getCharacterAvatarPath("jinbeibei"),
    piece: "星",
    description: "出场就自带财气，适合大胆买地。",
  },
  {
    id: "qianfuren",
    name: "钱夫人",
    title: "贵气投资家",
    color: "bg-violet-100 text-violet-900 border-violet-300",
    accent: "violet",
    avatarPath: getCharacterAvatarPath("qianfuren"),
    piece: "冠",
    description: "精于资产管理，越到后期越有压制力。",
  },
  {
    id: "sunxiaomei",
    name: "孙小美",
    title: "人气幸运星",
    color: "bg-sky-100 text-sky-900 border-sky-300",
    accent: "sky",
    avatarPath: getCharacterAvatarPath("sunxiaomei"),
    piece: "月",
    description: "经典中的经典，轻快可爱又很有辨识度。",
  },
  {
    id: "pupu",
    name: "噗噗",
    title: "福气猪猪",
    color: "bg-rose-100 text-rose-900 border-rose-300",
    accent: "rose",
    avatarPath: getCharacterPortraitPath("pupu"),
    piece: "猪",
    description: "圆滚滚地冲在前面，靠福气和胆量一路闯关。",
  },
  {
    id: "tangtang",
    name: "糖糖",
    title: "甜心财务官",
    color: "bg-pink-100 text-pink-900 border-pink-300",
    accent: "pink",
    avatarPath: getCharacterPortraitPath("tangtang"),
    piece: "糖",
    description: "笑起来像糖果一样甜，出手却很会算账。",
  },
  {
    id: "robot",
    name: "机器人",
    title: "钢铁理财机",
    color: "bg-slate-100 text-slate-900 border-slate-300",
    accent: "slate",
    avatarPath: getCharacterPortraitPath("robot"),
    piece: "械",
    description: "每一步都像经过精密运算，稳定得可怕。",
  },
  {
    id: "dalaoqian",
    name: "大老千",
    title: "诈术牌王",
    color: "bg-orange-100 text-orange-900 border-orange-300",
    accent: "orange",
    avatarPath: getCharacterPortraitPath("dalaoqian"),
    piece: "千",
    description: "牌桌老手，最擅长用气势和套路搅乱节奏。",
  },
  {
    id: "lixiaoyao",
    name: "李逍遥",
    title: "仙剑少侠",
    color: "bg-sky-100 text-sky-900 border-sky-300",
    accent: "sky",
    avatarPath: getCharacterPortraitPath("lixiaoyao"),
    piece: "剑",
    description: "背着长剑闯江湖，走到哪都带着少年意气。",
  },
  {
    id: "zhaolinger",
    name: "赵灵儿",
    title: "水灵圣女",
    color: "bg-cyan-100 text-cyan-900 border-cyan-300",
    accent: "cyan",
    avatarPath: getCharacterPortraitPath("zhaolinger"),
    piece: "灵",
    description: "气质温柔却自带灵气，越看越有主角光环。",
  },
  {
    id: "linyueru",
    name: "林月如",
    title: "红衣侠女",
    color: "bg-red-100 text-red-900 border-red-300",
    accent: "red",
    avatarPath: getCharacterPortraitPath("linyueru"),
    piece: "刃",
    description: "出手利落又带点傲气，遇事从不肯退半步。",
  },
  {
    id: "anu",
    name: "阿奴",
    title: "苗疆灵歌者",
    color: "bg-emerald-100 text-emerald-900 border-emerald-300",
    accent: "emerald",
    avatarPath: getCharacterPortraitPath("anu"),
    piece: "笛",
    description: "爱笑爱闹又机灵，带着苗疆风情闯进牌桌。",
  },
];

export const CHARACTER_MAP = Object.fromEntries(
  CHARACTER_PRESETS.map((character) => [character.id, character]),
) as Record<CharacterId, CharacterPreset>;

export function getCharacterPreset(id: string) {
  return CHARACTER_MAP[id as CharacterId] ?? null;
}

export function getCharacterAvatarTextureKey(id: CharacterId) {
  return `character-avatar-${id}`;
}

export function getCharacterAvatarPath(id: CharacterId) {
  return withBasePath(`/characters/${id}.svg`);
}

export function getCharacterPortraitPath(id: CharacterId) {
  return withBasePath(`/characters/portrait-${id}.svg`);
}

export function getCharacterPortraitTextureKey(id: CharacterId) {
  return `character-portrait-${id}`;
}
