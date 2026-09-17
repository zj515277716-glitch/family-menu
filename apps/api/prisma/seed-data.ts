// apps/api/prisma/seed-data.ts
// 种子数据定义（纯数据，不依赖 PrismaClient）
// 1家庭 + 1规则 + 3禁忌(HARD2/SOFT1) + 28食材(6类) + 13菜品(4角色) + 53菜品食材关联 + 7菜单(4场景) + 23菜单菜品关联
// 数据通过 shared v0.1 zod schema 校验（见 seed.ts validateSeedData / test/seed.spec.ts）
//
// T-P16 AC8：固化 RIBS-MENU 方案1 手工数据（幂等可重放，teardown 重建后恢复方案1 状态）：
//   1) 新增 11 种食材（保留线上 cuid id）
//   2) 新增 3 道 FETCHED 排骨菜（PUBLISHED；2 道排骨汤 mealRole=SOUP 为方案1 纠偏终态；保留 cuid id）
//   3) 土豆烧排骨 status TESTED→PUBLISHED（4 道排骨菜全 PUBLISHED 升格）
//   4) 新增 24 条 FETCHED 菜 DishIngredient（保留 cuid id）
//   5) 新增 3 套 PUBLISHED 套餐 ribs-menu-01/02/03（含完整 prepSequence）+ 10 条 MenuDish

const now = new Date('2026-08-06T00:00:00Z');

// ───── 家庭与规则 ─────

export const family = {
  id: 'seed-family',
  name: '张家四口',
  createdAt: now,
};

export const familyRule = {
  id: 'seed-family-rule',
  familyId: 'seed-family',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker', 'steamer', 'air_fryer'],
  cuisines: ['家常', '湘菜'],
  updatedAt: now,
};

// 硬软分离（DEC-006 文件③7.4）：HARD=过敏/绝对禁忌，SOFT=不喜欢
export const exclusionRules = [
  {
    id: 'seed-excl-peanut',
    familyId: 'seed-family',
    scope: 'TAG' as const,
    targetId: undefined,
    targetTag: '花生',
    severity: 'HARD' as const,
    note: '孩子花生过敏',
  },
  {
    id: 'seed-excl-organ',
    familyId: 'seed-family',
    scope: 'TAG' as const,
    targetId: undefined,
    targetTag: '内脏',
    severity: 'SOFT' as const,
    note: '爸爸不吃内脏',
  },
  {
    id: 'seed-excl-peanut-ing',
    familyId: 'seed-family',
    scope: 'INGREDIENT' as const,
    targetId: 'cmtvnuvxvc2oy5fdrzhpxxe69',
    targetTag: undefined,
    severity: 'HARD' as const,
    note: '孩子花生过敏（食材级：花生米/熟花生米/油炸花生米）',
  },
];

// ───── 食材（覆盖6类：蔬菜/肉类/水产/蛋奶/调料/主食）─────

// 别名原则：覆盖用户日常说法（必消输入按 name+aliases 分层匹配：层 1 精确等值 + 层 2 双向子串唯一命中，命中 ≥2 歧义不猜、未映射原文透传，见 planService.resolveMustUseIds / utils/must-use-matcher.ts）
export const ingredients = [
  // 蔬菜
  { id: 'seed-ing-tomato', name: '番茄', aliases: ['西红柿', '洋柿子'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-potato', name: '土豆', aliases: ['马铃薯', '洋芋'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-greens', name: '青菜', aliases: ['小白菜', '油菜', '上海青', '小青菜'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-broccoli', name: '西兰花', aliases: ['花椰菜', '绿菜花', '西蓝花'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-seaweed', name: '紫菜', aliases: ['海苔'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-cucumber', name: '黄瓜', aliases: ['青瓜'], category: '蔬菜', defaultUnit: 'g' },
  // 肉类
  { id: 'seed-ing-pork', name: '猪肉', aliases: ['瘦肉', '里脊'], category: '肉类', defaultUnit: 'g' },
  { id: 'seed-ing-ribs', name: '排骨', aliases: ['肋排', '猪排骨', '小排', '仔排'], category: '肉类', defaultUnit: 'g' },
  { id: 'seed-ing-beef', name: '牛腩', aliases: ['牛肉'], category: '肉类', defaultUnit: 'g' },
  // 水产
  { id: 'seed-ing-bass', name: '鲈鱼', aliases: ['海鲈鱼'], category: '水产', defaultUnit: '条' },
  { id: 'seed-ing-shrimp', name: '虾仁', aliases: ['虾米', '虾', '明虾', '河虾'], category: '水产', defaultUnit: 'g' },
  // 蛋奶
  { id: 'seed-ing-egg', name: '鸡蛋', aliases: ['土鸡蛋', '蛋'], category: '蛋奶', defaultUnit: '个' },
  // 调料
  { id: 'seed-ing-soysauce', name: '生抽', aliases: ['酱油'], category: '调料', defaultUnit: 'ml' },
  { id: 'seed-ing-salt', name: '盐', aliases: ['食盐', '精盐'], category: '调料', defaultUnit: 'g' },
  { id: 'seed-ing-sugar', name: '白糖', aliases: ['砂糖', '白砂糖'], category: '调料', defaultUnit: 'g' },
  { id: 'seed-ing-cookingwine', name: '料酒', aliases: ['黄酒'], category: '调料', defaultUnit: 'ml' },
  // 主食
  { id: 'seed-ing-rice', name: '大米', aliases: ['白米', '米', '香米'], category: '主食', defaultUnit: 'g' },
  // T-P16 AC8：RIBS-MENU 方案1 手工录入的 11 种食材（保留线上 cuid id，teardown 重建后 id 不变）
  { id: 'cmtvnuvz8n8r9zhvgwa15swtk', name: '冬瓜', aliases: [], category: '蔬菜', defaultUnit: 'g' },
  { id: 'cmtvnuvzdb069ididgzfa9g5e', name: '玉米', aliases: ['甜玉米'], category: '蔬菜', defaultUnit: '根' },
  { id: 'cmtnpn9q2001a0wpgfhmxmg7v', name: '小葱', aliases: [], category: '蔬菜', defaultUnit: 'g' },
  { id: 'cmtnpn9qs002c0wpgan1e1zqz', name: '生姜', aliases: [], category: '蔬菜', defaultUnit: 'g' },
  { id: 'cmtnpn9rk00370wpgnxiz5ptc', name: '胡萝卜', aliases: [], category: '蔬菜', defaultUnit: 'g' },
  { id: 'cmtnpn9rn003d0wpgw6ruwoxs', name: '冰糖', aliases: [], category: '调料', defaultUnit: 'g' },
  { id: 'cmtvnuvxbrcqtje0xdt1yxeum', name: '熟白芝麻', aliases: ['白芝麻'], category: '调料', defaultUnit: 'g' },
  { id: 'cmtvnuvz9shzv52t68ajp2o32', name: '白胡椒粉', aliases: ['胡椒粉'], category: '调料', defaultUnit: 'g' },
  { id: 'cmtvnuvx9lvcxlpftd66qnnjk', name: '醋', aliases: ['香醋', '米醋', '陈醋'], category: '调料', defaultUnit: 'ml' },
  { id: 'cmtnpn9nz00070wpgi5rhpy9i', name: '食用油', aliases: [], category: '调料', defaultUnit: 'ml' },
  { id: 'cmtnpn9q4001e0wpggqs1vffm', name: '清水', aliases: [], category: '调料', defaultUnit: 'ml' },
];

// ───── 菜品（10道：MAIN 6 / SIDE 2 / SOUP 1 / STAPLE 1；PUBLISHED 9 / TESTED 1）─────

export const dishes = [
  {
    id: 'seed-dish-tomato-egg',
    name: '番茄炒蛋',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡', '酸甜'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '番茄切块，鸡蛋打散' },
      { order: 2, text: '热锅下油，炒蛋至半凝固盛出' },
      { order: 3, text: '下番茄翻炒出汁' },
      { order: 4, text: '倒回鸡蛋翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-braised-pork',
    name: '红烧肉',
    mealRole: 'MAIN' as const,
    cuisine: '湘菜',
    flavorTags: ['咸香', '微甜'],
    spicyLevel: 1,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 60,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '猪肉切块焯水去腥' },
      { order: 2, text: '炒糖色，下肉块翻炒上色' },
      { order: 3, text: '加生抽、料酒、水，大火烧开' },
      { order: 4, text: '转小火炖40分钟', parallel: true },
      { order: 5, text: '大火收汁' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-steamed-bass',
    name: '清蒸鲈鱼',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡', '鲜美'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 20,
    equipment: ['steamer'],
    steps: [
      { order: 1, text: '鲈鱼处理干净，划刀' },
      { order: 2, text: '铺姜丝，淋料酒' },
      { order: 3, text: '大火蒸8分钟', parallel: true },
      { order: 4, text: '淋热油激香' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-potato-ribs',
    name: '土豆烧排骨',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['咸香'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 50,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '排骨焯水，土豆切块' },
      { order: 2, text: '炒糖色下排骨上色' },
      { order: 3, text: '加生抽、水炖30分钟', parallel: true },
      { order: 4, text: '下土豆继续炖15分钟' },
    ],
    // T-P16 AC8：方案1 将 4 道排骨菜全部升格 PUBLISHED（原 TESTED）
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-broccoli-shrimp',
    name: '西兰花炒虾仁',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '西兰花掰小朵焯水，虾仁洗净' },
      { order: 2, text: '热锅下油炒虾仁至变色' },
      { order: 3, text: '下西兰花翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-garlic-greens',
    name: '蒜蓉青菜',
    mealRole: 'SIDE' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 8,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '青菜洗净，蒜切末' },
      { order: 2, text: '热锅下油爆香蒜末' },
      { order: 3, text: '下青菜大火快炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-cucumber-salad',
    name: '凉拌黄瓜',
    mealRole: 'SIDE' as const,
    cuisine: '家常',
    flavorTags: ['清爽'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 8,
    equipment: [],
    steps: [
      { order: 1, text: '黄瓜拍碎切段' },
      { order: 2, text: '加盐、生抽、白糖拌匀' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-seaweed-soup',
    name: '紫菜蛋花汤',
    mealRole: 'SOUP' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 10,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '紫菜泡发，鸡蛋打散' },
      { order: 2, text: '水烧开下紫菜' },
      { order: 3, text: '淋蛋液划散，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-beef-stew',
    name: '土豆炖牛腩',
    mealRole: 'MAIN' as const,
    cuisine: '湘菜',
    flavorTags: ['咸香', '微辣'],
    spicyLevel: 2,
    splitFlavor: true,
    activeMinutes: 20,
    totalMinutes: 90,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '牛腩切块焯水，土豆切块' },
      { order: 2, text: '炒糖色下牛腩上色' },
      { order: 3, text: '加生抽、水大火烧开' },
      { order: 4, text: '小火炖1小时', parallel: true },
      { order: 5, text: '下土豆炖20分钟' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-egg-fried-rice',
    name: '蛋炒饭',
    mealRole: 'STAPLE' as const,
    cuisine: '家常',
    flavorTags: ['咸香'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 8,
    totalMinutes: 12,
    equipment: ['wok', 'rice_cooker'],
    steps: [
      { order: 1, text: '隔夜米饭打散，鸡蛋打散' },
      { order: 2, text: '热锅下油炒蛋' },
      { order: 3, text: '下米饭翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  // T-P16 AC8：RIBS-MENU 方案1 抓取入库的 3 道排骨菜（PUBLISHED；保留线上 cuid id 与完整来源字段）
  // 其中 2 道排骨汤 mealRole=SOUP 为方案1 纠偏终态（原入库时误标 MAIN）
  {
    id: 'cmtvk2erk0000nopg3y2tqytq',
    name: '零翻车！保姆级糖醋排骨！新手也能一次成功',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['家常'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 30,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '再也不用外面买！' },
      { order: 2, text: '掌握这个万能糖醋公式 在家做的排骨酸甜入味、色泽红亮，全家都爱吃！' },
      { order: 3, text: '✅万能4321黄金配比（家用汤勺） 4勺清水+3勺陈醋+2勺白糖+1勺生抽 酸甜平衡刚刚好，新手闭眼调不踩雷！' },
      { order: 4, text: '📝超简单步骤 1. 排骨冷水下锅，加姜片料酒焯水，捞出洗净沥干 2. 不放油直接翻炒排骨，炒至表面微微焦黄锁香 3. 倒入调好的糖醋汁，没过排骨，大火烧开转小火焖20分钟 4. 最后大火收汁，翻炒至酱汁浓稠挂壁，撒白芝麻出锅 肉质软嫩不柴，每一块都挂满酱汁 酸甜开胃巨下饭，零厨艺也能轻松拿捏💯 #糖醋排骨教程 #家常菜谱 #新手做饭 #美食教程 #零失败家常菜 #下饭家常菜' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'FETCHED' as const,
    imageUrl: '/images/dishes/6a7447180000000026035e3b/0.webp',
    sourceSite: 'xiaohongshu',
    sourceUrl: 'https://www.xiaohongshu.com/explore/6a7447180000000026035e3b?xsec_token=ABL3VcWMObHDYarHq2xFuxgYfc9_OL4yMB-lhAOb1uQ1M=&xsec_source=pc_feed',
    licenseNote: 'FETCHED 自xiaohongshu笔记 6a7447180000000026035e3b（作者 小情绪dxd）；原帖内容仅作初稿未改编；正文无文字用料，ingredients 留空待人工微调后走 TESTED→PUBLISHED 流程。',
  },
  {
    id: 'cmtvkq3dl00009cpgaeksvumo',
    name: '清热解暑冬瓜排骨汤，汤清肉烂全家爱喝',
    mealRole: 'SOUP' as const,
    cuisine: '家常',
    flavorTags: ['家常'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 30,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '夏天没胃口就喝冬瓜排骨汤！' },
      { order: 2, text: '清热解暑，汤清肉烂👇 很多人炖冬瓜排骨汤，冬瓜和排骨一起下锅，难怪冬瓜炖化了找不到 😩 冬瓜后放，排骨先炖35分钟再下冬瓜，汤清甜、冬瓜不化 🤌 🥣【冬瓜排骨汤｜夏日清补版】 🟢 食材： 排骨 500g（斩小段） 冬瓜 500g（去皮切厚块） 姜 5 片 料酒 1 勺 盐 适量 葱花 🟢 秘诀 ①：焯水撇浮沫 排骨冷水下锅 + 姜片料酒 大火煮开，浮沫出来立刻撇干净 撇到汤面清澈 捞出排骨用温水冲净 ❗浮沫撇干净=汤不腥不浑 🟢 秘诀 ②：冬瓜后放 排骨炖 35分钟后 再下冬瓜 继续炖 15 分钟 ❗冬瓜和排骨一起下=炖化了找不到 🟢 步骤： 1️⃣ 排骨冷水下锅焯水，撇净浮沫 捞出温水冲净 2️⃣ 锅中加足量开水 + 排骨 + 姜片 大火烧开转小火炖 35 分钟 3️⃣ 下冬瓜块，继续炖 15 分钟 4️⃣ 加盐调味，撒葱花出锅 ✅ 这样做出来： • 汤清不腻！' },
      { order: 3, text: '肉香四溢 • 排骨软烂！' },
      { order: 4, text: '一夹脱骨 • 冬瓜清甜！' },
      { order: 5, text: '入口即化 • 夏天喝太舒服了🥣 ❗避坑： 浮沫一定要撇干净，不撇=腥+汤浑 冬瓜后 15 分钟放，一起炖=化没了 只放姜和盐，不加八角桂皮那些 📌 主页有更多家常菜做法，关注我下次找不迷路～' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'FETCHED' as const,
    imageUrl: '/images/dishes/6a351368000000000803feb1/0.webp',
    sourceSite: 'xiaohongshu',
    sourceUrl: 'https://www.xiaohongshu.com/explore/6a351368000000000803feb1?xsec_token=ABOoZLs9Hb4_CS5NMNzz0H-4N63mkMgPtFVi3A7QlTkLo=&xsec_source=pc_feed',
    licenseNote: 'FETCHED 自xiaohongshu笔记 6a351368000000000803feb1（作者 米饭杀手日记）；原帖内容仅作初稿未改编；正文无文字用料，ingredients 留空待人工微调后走 TESTED→PUBLISHED 流程。',
  },
  {
    id: 'cmtvkqlfh000080pggqq7f7p0',
    name: '✔️巨简单、零翻车、超香甜的玉米排骨汤❗️',
    mealRole: 'SOUP' as const,
    cuisine: '家常',
    flavorTags: ['家常'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 30,
    equipment: ['wok'],
    steps: [
      { order: 1, text: 'chao简单的玉米排骨汤，煮出来的汤鲜甜爽口，做法很简单教程如下⬇️ 📣【食材】：排骨、水果玉米、大葱、小葱、姜片 ✅【做法】 1️⃣：排骨冷水下锅，放姜片和大葱，等水煮开后撇去血沫，继续煮个一分钟左右关火，捞出排骨 2️⃣：排骨需要用热水多淘洗几次，洗掉多余的血沫，沥干水分备用 3️⃣：电压锅里加适量热水，放入排骨，姜片和小葱，放入切好的玉米，放盐调味，用压力锅压40分钟就可以了 4️⃣：出锅撒上葱花就ok啦～ -因为家里有小朋友，所以我这压力锅40分钟煮好的排骨比较软烂，骨肉分离的那种，不喜欢这种口感的就减少压力锅压的时间 -没有压力锅的就用普通砂锅，先大火烧开，后转小火慢慢的炖1-1.5小时 -用砂锅煮还需要加山药的，就最后15分钟再加进去，山药不经煮，时间煮太久了会煮化 -玉米要用水果玉米，这样熬出来的汤比较鲜甜～ -盐要早放，肉才能煮入味汤也更好喝 👀刷到就赶紧去做吧～' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'FETCHED' as const,
    imageUrl: '/images/dishes/6825e64e0000000020029573/0.webp',
    sourceSite: 'xiaohongshu',
    sourceUrl: 'https://www.xiaohongshu.com/explore/6825e64e0000000020029573?xsec_token=ABTDrpPe5s38KZ0ESMGELGYybU7HFFgD1LZi61mB0ilKo=&xsec_source=pc_feed',
    licenseNote: 'FETCHED 自xiaohongshu笔记 6825e64e0000000020029573（作者 小刘奥利给给🥤）；原帖内容仅作初稿未改编；正文无文字用料，ingredients 留空待人工微调后走 TESTED→PUBLISHED 流程。',
  },
];

// ───── 菜品-食材关联（DishIngredient）─────

export const dishIngredients = [
  // 番茄炒蛋
  { id: 'seed-di-001', dishId: 'seed-dish-tomato-egg', ingredientId: 'seed-ing-tomato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-002', dishId: 'seed-dish-tomato-egg', ingredientId: 'seed-ing-egg', qty: 3, unit: '个', optional: false },
  // 红烧肉
  { id: 'seed-di-003', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-pork', qty: 300, unit: 'g', optional: false },
  { id: 'seed-di-004', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-005', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-sugar', qty: 10, unit: 'g', optional: false },
  { id: 'seed-di-006', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 清蒸鲈鱼
  { id: 'seed-di-007', dishId: 'seed-dish-steamed-bass', ingredientId: 'seed-ing-bass', qty: 1, unit: '条', optional: false },
  { id: 'seed-di-008', dishId: 'seed-dish-steamed-bass', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 土豆烧排骨
  { id: 'seed-di-009', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-ribs', qty: 400, unit: 'g', optional: false },
  { id: 'seed-di-010', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-potato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-011', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-012', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-sugar', qty: 5, unit: 'g', optional: false },
  // 西兰花炒虾仁
  { id: 'seed-di-013', dishId: 'seed-dish-broccoli-shrimp', ingredientId: 'seed-ing-broccoli', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-014', dishId: 'seed-dish-broccoli-shrimp', ingredientId: 'seed-ing-shrimp', qty: 150, unit: 'g', optional: false },
  // 蒜蓉青菜
  { id: 'seed-di-015', dishId: 'seed-dish-garlic-greens', ingredientId: 'seed-ing-greens', qty: 300, unit: 'g', optional: false },
  // 凉拌黄瓜
  { id: 'seed-di-016', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-cucumber', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-017', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-soysauce', qty: 10, unit: 'ml', optional: false },
  { id: 'seed-di-018', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
  { id: 'seed-di-019', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-sugar', qty: 3, unit: 'g', optional: false },
  // 紫菜蛋花汤
  { id: 'seed-di-020', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-seaweed', qty: 10, unit: 'g', optional: false },
  { id: 'seed-di-021', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-egg', qty: 2, unit: '个', optional: false },
  { id: 'seed-di-022', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
  // 土豆炖牛腩
  { id: 'seed-di-023', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-beef', qty: 300, unit: 'g', optional: false },
  { id: 'seed-di-024', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-potato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-025', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-026', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 蛋炒饭
  { id: 'seed-di-027', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-rice', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-028', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-egg', qty: 2, unit: '个', optional: false },
  { id: 'seed-di-029', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
  // T-P16 AC8：3 道 FETCHED 排骨菜的用料（方案1 人工微调后录入；保留线上 cuid id）
  // 糖醋排骨 cmtvk2erk0000nopg3y2tqytq（8条）
  { id: 'cmtz3tt7dg0lfqk4h1enb556m', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'seed-ing-ribs', qty: 500, unit: 'g', optional: false },
  { id: 'cmtz3tt7ejcwbqleeddnc80fu', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'cmtz3tt7fkqr9m5z42e039e8s', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'seed-ing-cookingwine', qty: 15, unit: 'ml', optional: false },
  { id: 'cmtz3tt7ehi5b7239s9wp94do', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'cmtnpn9rn003d0wpgw6ruwoxs', qty: 30, unit: 'g', optional: false },
  { id: 'cmtz3tt7eihbcln0trgynw0wp', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'cmtvnuvx9lvcxlpftd66qnnjk', qty: 30, unit: 'ml', optional: false },
  { id: 'cmtz3tt7fmsl1q0a74w7o9sq6', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'cmtnpn9nz00070wpgi5rhpy9i', qty: 15, unit: 'ml', optional: false },
  { id: 'cmtz3tt7flos3al91icfmavj6', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'cmtnpn9qs002c0wpgan1e1zqz', qty: 10, unit: 'g', optional: false },
  { id: 'cmtz3tt7gnvw0g06eqxqezad5', dishId: 'cmtvk2erk0000nopg3y2tqytq', ingredientId: 'cmtvnuvxbrcqtje0xdt1yxeum', qty: 5, unit: 'g', optional: true },
  // 冬瓜排骨汤 cmtvkq3dl00009cpgaeksvumo（8条）
  { id: 'cmtz3tt9dvcopnurvctdocmfp', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'seed-ing-ribs', qty: 400, unit: 'g', optional: false },
  { id: 'cmtz3tt9d0u3qndayefr6vrxt', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'cmtvnuvz8n8r9zhvgwa15swtk', qty: 400, unit: 'g', optional: false },
  { id: 'cmtz3tt9e1uwfn70u7852jag7', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'cmtnpn9qs002c0wpgan1e1zqz', qty: 10, unit: 'g', optional: false },
  { id: 'cmtz3tt9e2zx3mzou06rigzet', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'seed-ing-cookingwine', qty: 15, unit: 'ml', optional: false },
  { id: 'cmtz3tt9f3tg8zyhudcuelitn', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'seed-ing-salt', qty: 4, unit: 'g', optional: false },
  { id: 'cmtz3tt9f4njqf6x1usc723ar', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'cmtvnuvz9shzv52t68ajp2o32', qty: 1, unit: 'g', optional: true },
  { id: 'cmtz3tt9f58mjfg27u3ocy57n', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'cmtnpn9q2001a0wpgfhmxmg7v', qty: 10, unit: 'g', optional: true },
  { id: 'cmtz3tt9f6zra00fot54btndj', dishId: 'cmtvkq3dl00009cpgaeksvumo', ingredientId: 'cmtnpn9q4001e0wpggqs1vffm', qty: 1500, unit: 'ml', optional: false },
  // 玉米排骨汤 cmtvkqlfh000080pggqq7f7p0（8条）
  { id: 'cmtz3tt9jgq8mb25c1r7shfn5', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'seed-ing-ribs', qty: 400, unit: 'g', optional: false },
  { id: 'cmtz3tt9jhuni06z2li1qag82', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'cmtvnuvzdb069ididgzfa9g5e', qty: 2, unit: '根', optional: false },
  { id: 'cmtz3tt9kii9j6t0yqfz5jcgw', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'cmtnpn9rk00370wpgnxiz5ptc', qty: 100, unit: 'g', optional: true },
  { id: 'cmtz3tt9kjea8marqs6q2df8p', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'cmtnpn9qs002c0wpgan1e1zqz', qty: 10, unit: 'g', optional: false },
  { id: 'cmtz3tt9kkv9b754mmwex2yyb', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'seed-ing-cookingwine', qty: 15, unit: 'ml', optional: false },
  { id: 'cmtz3tt9klnpkc5vh2zml3tz6', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'seed-ing-salt', qty: 4, unit: 'g', optional: false },
  { id: 'cmtz3tt9lm0bjhzjurww5sf0j', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'cmtnpn9q2001a0wpgfhmxmg7v', qty: 10, unit: 'g', optional: true },
  { id: 'cmtz3tt9lnvkejfvqknh5mrnr', dishId: 'cmtvkqlfh000080pggqq7f7p0', ingredientId: 'cmtnpn9q4001e0wpggqs1vffm', qty: 1500, unit: 'ml', optional: false },
];

// ───── 菜单（4套：WEEKDAY_FAST / WEEKEND / CLEARANCE / BUDGET）─────

export const menus = [
  {
    id: 'seed-menu-weekday',
    name: '工作日快手套餐',
    scene: 'WEEKDAY_FAST' as const,
    serves: 4,
    totalActiveMinutes: 25,
    prepSequence: [
      { minute: 0, action: '烧水' },
      { minute: 3, action: '切番茄打散鸡蛋' },
      { minute: 8, action: '炒番茄炒蛋' },
      { minute: 18, action: '炒青菜' },
      { minute: 22, action: '做紫菜蛋花汤' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'seed-menu-weekend',
    name: '周末丰盛套餐',
    scene: 'WEEKEND' as const,
    serves: 4,
    totalActiveMinutes: 50,
    prepSequence: [
      { minute: 0, action: '红烧肉焯水炒糖色' },
      { minute: 10, action: '炖红烧肉' },
      { minute: 20, action: '蒸鲈鱼' },
      { minute: 30, action: '炒青菜' },
      { minute: 35, action: '炒蛋炒饭' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'seed-menu-clearance',
    name: '清库存套餐',
    scene: 'CLEARANCE' as const,
    serves: 4,
    totalActiveMinutes: 35,
    prepSequence: [
      { minute: 0, action: '排骨焯水切土豆' },
      { minute: 10, action: '炖排骨' },
      { minute: 30, action: '拌黄瓜' },
      { minute: 32, action: '做紫菜蛋花汤' },
    ],
    status: 'DRAFT' as const,
  },
  {
    id: 'seed-menu-budget',
    name: '预算套餐',
    scene: 'BUDGET' as const,
    serves: 4,
    totalActiveMinutes: 20,
    prepSequence: [
      { minute: 0, action: '煮饭' },
      { minute: 5, action: '切番茄打散鸡蛋' },
      { minute: 10, action: '炒番茄炒蛋' },
      { minute: 15, action: '炒饭加做汤' },
    ],
    status: 'PUBLISHED' as const,
  },
  // T-P16 AC8：RIBS-MENU 方案1 人工编排的 3 套 PUBLISHED 排骨套餐（prepSequence 原样固化 DB 现值）
  {
    id: 'ribs-menu-01',
    name: '糖醋排骨套餐',
    scene: 'WEEKDAY_FAST' as const,
    serves: 4,
    totalActiveMinutes: 25,
    prepSequence: [
      { minute: 0, action: '再也不用外面买！' },
      { minute: 4, action: '掌握这个万能糖醋公式 在家做的排骨酸甜入味、色泽红亮，全家都爱吃！' },
      { minute: 8, action: '✅万能4321黄金配比（家用汤勺） 4勺清水+3勺陈醋+2勺白糖+1勺生抽 酸甜平衡刚刚好，新手闭眼调不踩雷！' },
      { minute: 12, action: '📝超简单步骤 1. 排骨冷水下锅，加姜片料酒焯水，捞出洗净沥干 2. 不放油直接翻炒排骨，炒至表面微微焦黄锁香 3. 倒入调好的糖醋汁，没过排骨，大火烧开转小火焖20分钟 4. 最后大火收汁，翻炒至酱汁浓稠挂壁，撒白芝麻出锅 肉质软嫩不柴，每一块都挂满酱汁 酸甜开胃巨下饭，零厨艺也能轻松拿捏💯 #糖醋排骨教程 #家常菜谱 #新手做饭 #美食教程 #零失败家常菜 #下饭家常菜' },
      { minute: 16, action: '青菜洗净，蒜切末' },
      { minute: 18, action: '热锅下油爆香蒜末' },
      { minute: 20, action: '下青菜大火快炒，加盐调味' },
      { minute: 22, action: '紫菜泡发，鸡蛋打散' },
      { minute: 24, action: '水烧开下紫菜' },
      { minute: 26, action: '淋蛋液划散，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'ribs-menu-02',
    name: '土豆烧排骨套餐',
    scene: 'WEEKEND' as const,
    serves: 4,
    totalActiveMinutes: 43,
    prepSequence: [
      { minute: 0, action: '排骨焯水，土豆切块' },
      { minute: 4, action: '炒糖色下排骨上色' },
      { minute: 8, action: '加生抽、水炖30分钟' },
      { minute: 12, action: '下土豆继续炖15分钟' },
      { minute: 16, action: '黄瓜拍碎切段' },
      { minute: 19, action: '加盐、生抽、白糖拌匀' },
      { minute: 22, action: 'chao简单的玉米排骨汤，煮出来的汤鲜甜爽口，做法很简单教程如下⬇️ 📣【食材】：排骨、水果玉米、大葱、小葱、姜片 ✅【做法】 1️⃣：排骨冷水下锅，放姜片和大葱，等水煮开后撇去血沫，继续煮个一分钟左右关火，捞出排骨 2️⃣：排骨需要用热水多淘洗几次，洗掉多余的血沫，沥干水分备用 3️⃣：电压锅里加适量热水，放入排骨，姜片和小葱，放入切好的玉米，放盐调味，用压力锅压40分钟就可以了 4️⃣：出锅撒上葱花就ok啦～ -因为家里有小朋友，所以我这压力锅40分钟煮好的排骨比较软烂，骨肉分离的那种，不喜欢这种口感的就减少压力锅压的时间 -没有压力锅的就用普通砂锅，先大火烧开，后转小火慢慢的炖1-1.5小时 -用砂锅煮还需要加山药的，就最后15分钟再加进去，山药不经煮，时间煮太久了会煮化 -玉米要用水果玉米，这样熬出来的汤比较鲜甜～ -盐要早放，肉才能煮入味汤也更好喝 👀刷到就赶紧去做吧～' },
      { minute: 37, action: '隔夜米饭打散，鸡蛋打散' },
      { minute: 40, action: '热锅下油炒蛋' },
      { minute: 43, action: '下米饭翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'ribs-menu-03',
    name: '西兰花炒虾仁套餐',
    scene: 'WEEKDAY_FAST' as const,
    serves: 4,
    totalActiveMinutes: 30,
    prepSequence: [
      { minute: 0, action: '西兰花掰小朵焯水，虾仁洗净' },
      { minute: 4, action: '热锅下油炒虾仁至变色' },
      { minute: 8, action: '下西兰花翻炒，加盐调味' },
      { minute: 12, action: '青菜洗净，蒜切末' },
      { minute: 14, action: '热锅下油爆香蒜末' },
      { minute: 16, action: '下青菜大火快炒，加盐调味' },
      { minute: 18, action: '夏天没胃口就喝冬瓜排骨汤！' },
      { minute: 21, action: '清热解暑，汤清肉烂👇 很多人炖冬瓜排骨汤，冬瓜和排骨一起下锅，难怪冬瓜炖化了找不到 😩 冬瓜后放，排骨先炖35分钟再下冬瓜，汤清甜、冬瓜不化 🤌 🥣【冬瓜排骨汤｜夏日清补版】 🟢 食材： 排骨 500g（斩小段） 冬瓜 500g（去皮切厚块） 姜 5 片 料酒 1 勺 盐 适量 葱花 🟢 秘诀 ①：焯水撇浮沫 排骨冷水下锅 + 姜片料酒 大火煮开，浮沫出来立刻撇干净 撇到汤面清澈 捞出排骨用温水冲净 ❗浮沫撇干净=汤不腥不浑 🟢 秘诀 ②：冬瓜后放 排骨炖 35分钟后 再下冬瓜 继续炖 15 分钟 ❗冬瓜和排骨一起下=炖化了找不到 🟢 步骤： 1️⃣ 排骨冷水下锅焯水，撇净浮沫 捞出温水冲净 2️⃣ 锅中加足量开水 + 排骨 + 姜片 大火烧开转小火炖 35 分钟 3️⃣ 下冬瓜块，继续炖 15 分钟 4️⃣ 加盐调味，撒葱花出锅 ✅ 这样做出来： • 汤清不腻！' },
      { minute: 24, action: '肉香四溢 • 排骨软烂！' },
      { minute: 27, action: '一夹脱骨 • 冬瓜清甜！' },
      { minute: 30, action: '入口即化 • 夏天喝太舒服了🥣 ❗避坑： 浮沫一定要撇干净，不撇=腥+汤浑 冬瓜后 15 分钟放，一起炖=化没了 只放姜和盐，不加八角桂皮那些 📌 主页有更多家常菜做法，关注我下次找不迷路～' },
    ],
    status: 'PUBLISHED' as const,
  },
];

// ───── 菜单-菜品关联（MenuDish）─────

export const menuDishes = [
  // 工作日快手套餐
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-tomato-egg', sort: 1 },
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-garlic-greens', sort: 2 },
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  // 周末丰盛套餐
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-braised-pork', sort: 1 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-steamed-bass', sort: 2 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-garlic-greens', sort: 3 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-egg-fried-rice', sort: 4 },
  // 清库存套餐
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-potato-ribs', sort: 1 },
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-cucumber-salad', sort: 2 },
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  // 预算套餐
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-tomato-egg', sort: 1 },
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-egg-fried-rice', sort: 2 },
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  // T-P16 AC8：RIBS-MENU 方案1 的 3 套排骨套餐组成
  { menuId: 'ribs-menu-01', dishId: 'cmtvk2erk0000nopg3y2tqytq', sort: 1 },
  { menuId: 'ribs-menu-01', dishId: 'seed-dish-garlic-greens', sort: 2 },
  { menuId: 'ribs-menu-01', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  { menuId: 'ribs-menu-02', dishId: 'seed-dish-potato-ribs', sort: 1 },
  { menuId: 'ribs-menu-02', dishId: 'seed-dish-cucumber-salad', sort: 2 },
  { menuId: 'ribs-menu-02', dishId: 'cmtvkqlfh000080pggqq7f7p0', sort: 3 },
  { menuId: 'ribs-menu-02', dishId: 'seed-dish-egg-fried-rice', sort: 4 },
  { menuId: 'ribs-menu-03', dishId: 'seed-dish-broccoli-shrimp', sort: 1 },
  { menuId: 'ribs-menu-03', dishId: 'seed-dish-garlic-greens', sort: 2 },
  { menuId: 'ribs-menu-03', dishId: 'cmtvkq3dl00009cpgaeksvumo', sort: 3 },
];
