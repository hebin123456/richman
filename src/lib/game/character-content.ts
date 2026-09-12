import type { CharacterId } from "@/lib/game/characters";

export interface CharacterAudioProfile {
  introSrc?: string;
  victorySrc?: string;
  baseFrequency: number;
  accentFrequency: number;
}

export interface CharacterContent {
  tagline: string;
  lobbyLine: string;
  introLine: string;
  victoryLine: string;
  palette: {
    frame: string;
    gradient: string;
    glow: string;
    chip: string;
    token: string;
  };
  audio: CharacterAudioProfile;
}

export const CHARACTER_CONTENT: Record<CharacterId, CharacterContent> = {
  atubo: {
    tagline: "稳健地主",
    lobbyLine: "先买一条街，再买一整片。地契最后都会落到我手里。",
    introLine: "阿土伯登场。第一条原则，先把地契握紧。",
    victoryLine: "地契在手，胜利自然水到渠成。",
    palette: {
      frame: "border-amber-300 bg-amber-50/95 text-amber-950",
      gradient:
        "from-amber-100 via-orange-200 to-yellow-300",
      glow: "shadow-[0_0_90px_rgba(251,191,36,0.28)]",
      chip: "bg-amber-500 text-amber-50",
      token: "bg-amber-500 text-amber-50 border-amber-200",
    },
    audio: {
      baseFrequency: 260,
      accentFrequency: 420,
    },
  },
  shalongbasi: {
    tagline: "热闹王者",
    lobbyLine: "输赢先放一边，气势一定要先到位。",
    introLine: "沙隆巴斯登场，整个牌桌都要热闹起来了。",
    victoryLine: "看到没？我认真起来，连运气都得给我捧场。",
    palette: {
      frame: "border-lime-300 bg-lime-50/95 text-lime-950",
      gradient:
        "from-lime-100 via-emerald-200 to-green-300",
      glow: "shadow-[0_0_90px_rgba(132,204,22,0.26)]",
      chip: "bg-lime-600 text-lime-50",
      token: "bg-lime-500 text-lime-50 border-lime-200",
    },
    audio: {
      baseFrequency: 320,
      accentFrequency: 480,
    },
  },
  jinbeibei: {
    tagline: "闪耀富贵",
    lobbyLine: "要买地，当然要买全地图最耀眼的那一块。",
    introLine: "金贝贝来了，今天运气和现金流都站在我这边。",
    victoryLine: "冠军就该配最热烈的掌声，和最亮的烟火。",
    palette: {
      frame: "border-pink-300 bg-pink-50/95 text-pink-950",
      gradient:
        "from-pink-100 via-rose-200 to-fuchsia-300",
      glow: "shadow-[0_0_90px_rgba(244,114,182,0.28)]",
      chip: "bg-pink-600 text-pink-50",
      token: "bg-pink-500 text-pink-50 border-pink-200",
    },
    audio: {
      baseFrequency: 340,
      accentFrequency: 560,
    },
  },
  qianfuren: {
    tagline: "贵气投资家",
    lobbyLine: "资产配置讲究节奏，赢局也是一样。",
    introLine: "钱夫人入局。接下来，就按赢家的逻辑来玩。",
    victoryLine: "收益、地产、股票，每一步都在我的计划里。",
    palette: {
      frame: "border-violet-300 bg-violet-50/95 text-violet-950",
      gradient:
        "from-violet-100 via-fuchsia-200 to-purple-300",
      glow: "shadow-[0_0_90px_rgba(167,139,250,0.28)]",
      chip: "bg-violet-600 text-violet-50",
      token: "bg-violet-500 text-violet-50 border-violet-200",
    },
    audio: {
      baseFrequency: 240,
      accentFrequency: 360,
    },
  },
  sunxiaomei: {
    tagline: "幸运甜心",
    lobbyLine: "幸运星，今天也请继续照着我吧。",
    introLine: "孙小美登场啦，今天把好运也一起带来了。",
    victoryLine: "谢谢大家，这一回合的好运我就先收下了。",
    palette: {
      frame: "border-sky-300 bg-sky-50/95 text-sky-950",
      gradient:
        "from-sky-100 via-cyan-200 to-blue-300",
      glow: "shadow-[0_0_90px_rgba(56,189,248,0.28)]",
      chip: "bg-sky-600 text-sky-50",
      token: "bg-sky-500 text-sky-50 border-sky-200",
    },
    audio: {
      baseFrequency: 300,
      accentFrequency: 520,
    },
  },
  pupu: {
    tagline: "猪猪暴富",
    lobbyLine: "别看我圆，真要冲起来，整条街都得给我让路。",
    introLine: "噗噗摇摇晃晃地登场了，今天要把好运全都拱回家。",
    victoryLine: "哼哼，最先笑到最后的，果然还是本猪猪。",
    palette: {
      frame: "border-rose-300 bg-rose-50/95 text-rose-950",
      gradient: "from-rose-100 via-pink-200 to-fuchsia-300",
      glow: "shadow-[0_0_90px_rgba(251,113,133,0.28)]",
      chip: "bg-rose-500 text-rose-50",
      token: "bg-rose-500 text-rose-50 border-rose-200",
    },
    audio: {
      baseFrequency: 290,
      accentFrequency: 430,
    },
  },
  tangtang: {
    tagline: "甜系赢家",
    lobbyLine: "糖要甜，账要清，冠军当然也要顺手一起拿。",
    introLine: "糖糖登场，空气里都像飘着一层闪闪发亮的糖霜。",
    victoryLine: "甜甜地玩，稳稳地赢，这才是我喜欢的节奏。",
    palette: {
      frame: "border-pink-300 bg-pink-50/95 text-pink-950",
      gradient: "from-pink-100 via-rose-200 to-orange-200",
      glow: "shadow-[0_0_90px_rgba(244,114,182,0.28)]",
      chip: "bg-pink-500 text-pink-50",
      token: "bg-pink-500 text-pink-50 border-pink-200",
    },
    audio: {
      baseFrequency: 330,
      accentFrequency: 580,
    },
  },
  robot: {
    tagline: "精密稳赢",
    lobbyLine: "路径、资产、风险，已计算完成。当前胜率正在上升。",
    introLine: "机器人启动完成。理性、效率、收益，全部进入最佳模式。",
    victoryLine: "结算完毕。本局最优策略，依然属于我。",
    palette: {
      frame: "border-slate-300 bg-slate-50/95 text-slate-950",
      gradient: "from-slate-100 via-cyan-100 to-sky-200",
      glow: "shadow-[0_0_90px_rgba(148,163,184,0.3)]",
      chip: "bg-slate-600 text-slate-50",
      token: "bg-slate-500 text-slate-50 border-slate-200",
    },
    audio: {
      baseFrequency: 210,
      accentFrequency: 320,
    },
  },
  dalaoqian: {
    tagline: "牌桌老手",
    lobbyLine: "会不会玩不重要，关键是要让别人以为我下一手更狠。",
    introLine: "大老千坐上牌桌，连空气都开始变得像赌局。",
    victoryLine: "牌不是我出的，节奏却一直都在我手里。",
    palette: {
      frame: "border-orange-300 bg-orange-50/95 text-orange-950",
      gradient: "from-orange-100 via-amber-200 to-red-300",
      glow: "shadow-[0_0_90px_rgba(249,115,22,0.28)]",
      chip: "bg-orange-600 text-orange-50",
      token: "bg-orange-500 text-orange-50 border-orange-200",
    },
    audio: {
      baseFrequency: 240,
      accentFrequency: 390,
    },
  },
  lixiaoyao: {
    tagline: "少年游侠",
    lobbyLine: "江湖路远，先把这张地图走通，再去看更大的风景。",
    introLine: "李逍遥踏剑而来，牌桌也像忽然有了江湖味。",
    victoryLine: "逍遥天地间，这一局的胜负也一样随心而定。",
    palette: {
      frame: "border-sky-300 bg-sky-50/95 text-sky-950",
      gradient: "from-sky-100 via-blue-200 to-indigo-300",
      glow: "shadow-[0_0_90px_rgba(59,130,246,0.28)]",
      chip: "bg-sky-600 text-sky-50",
      token: "bg-sky-500 text-sky-50 border-sky-200",
    },
    audio: {
      baseFrequency: 270,
      accentFrequency: 470,
    },
  },
  zhaolinger: {
    tagline: "灵岛圣心",
    lobbyLine: "风会告诉我方向，水会把好运悄悄带来。",
    introLine: "赵灵儿现身，温柔的灵光把整个牌桌都照亮了。",
    victoryLine: "若是心愿坚定，连命运都会向你轻轻点头。",
    palette: {
      frame: "border-cyan-300 bg-cyan-50/95 text-cyan-950",
      gradient: "from-cyan-100 via-sky-100 to-teal-200",
      glow: "shadow-[0_0_90px_rgba(34,211,238,0.28)]",
      chip: "bg-cyan-600 text-cyan-50",
      token: "bg-cyan-500 text-cyan-50 border-cyan-200",
    },
    audio: {
      baseFrequency: 250,
      accentFrequency: 410,
    },
  },
  linyueru: {
    tagline: "红衣锋芒",
    lobbyLine: "要赢就正面赢，谁先退缩谁就先输一半。",
    introLine: "林月如登场，连站姿都带着不服输的气势。",
    victoryLine: "说要赢就一定赢，这种事我从来不开玩笑。",
    palette: {
      frame: "border-red-300 bg-red-50/95 text-red-950",
      gradient: "from-red-100 via-rose-200 to-orange-300",
      glow: "shadow-[0_0_90px_rgba(248,113,113,0.28)]",
      chip: "bg-red-600 text-red-50",
      token: "bg-red-500 text-red-50 border-red-200",
    },
    audio: {
      baseFrequency: 300,
      accentFrequency: 460,
    },
  },
  anu: {
    tagline: "灵歌少女",
    lobbyLine: "唱着歌闯关也挺好，反正好运会自己跟过来。",
    introLine: "阿奴轻快地跑进场，牌桌一下就多了几分灵气和笑声。",
    victoryLine: "嘿嘿，这次的好运和热闹，我就先全部带走啦。",
    palette: {
      frame: "border-emerald-300 bg-emerald-50/95 text-emerald-950",
      gradient: "from-emerald-100 via-green-200 to-lime-300",
      glow: "shadow-[0_0_90px_rgba(16,185,129,0.28)]",
      chip: "bg-emerald-600 text-emerald-50",
      token: "bg-emerald-500 text-emerald-50 border-emerald-200",
    },
    audio: {
      baseFrequency: 320,
      accentFrequency: 500,
    },
  },
};

export function getCharacterContent(characterId: CharacterId) {
  return CHARACTER_CONTENT[characterId];
}
