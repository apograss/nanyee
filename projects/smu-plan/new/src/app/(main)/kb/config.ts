export const KB_HERO = {
  kicker: "共建知识库",
  title: "南医校园经验，一起写、持续更新",
  description:
    "登录即可补充和修正，每次编辑都保留版本记录。",
  statLabel: "篇经验",
  panelTitle: "为什么这里适合共建",
  panelDescription:
    "它不是一次性公告栏，而是一份会被不断补充、修正和校对的校园 Wiki。",
  panelItems: [
    {
      icon: "✏️",
      title: "谁都能写",
      description: "登录后直接补充选课、实习、流程等经验。",
    },
    {
      icon: "🕰️",
      title: "版本可溯",
      description: "每次修改留下历史，方便回看和回滚。",
    },
    {
      icon: "🔄",
      title: "鼓励纠错",
      description: "发现问题随时修正，共建不断完善。",
    },
  ],
} as const;

export const KB_COLLAB_HIGHLIGHTS = [
  {
    title: "即时发布",
    description: "登录后即可补充内容，不需要走冗长审核流。",
  },
  {
    title: "版本可追溯",
    description: "每次修改都会保留版本，方便回看差异和核对信息。",
  },
  {
    title: "欢迎纠错补充",
    description: "发现过时信息、遗漏攻略或更优解，都欢迎直接补齐。",
  },
] as const;

export const KB_LIST_SECTION = {
  kicker: "最新更新",
  title: "从真实经验中快速找到答案",
  hint: "选课、实习、校园生活、规章流程，都欢迎继续共建。",
} as const;
