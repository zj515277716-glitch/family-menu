# T-C06-SYNC 验证报告：蚝油菜三件套生产同步（方式 V）

- 执行日期：2026-09-13
- 执行人：主控（生产操作卡，rds-1 先例）
- 任务卡：evidence/T-C06-SYNC-task-2026-09-13.md
- 物证目录：.workflow-verify/tc06sync/（probe-prod.cjs / probe2-prod.cjs / gen-replay.cjs / replay-data.json / replay-prod.cjs / verify-prod.cjs / smoke-prod.cjs）

## 1. 预检（只读探查）

| 探查项 | 结果 |
|---|---|
| 生产 RDS 基线 | Dish=48 / FETCHED=29 / Ingredient=79 / DishIngredient=365 / ExclusionRule=4（与 rds-1 定谳一致，零漂移） |
| 蚝油菜存在性 | id 与同名均不存在（无冲突） |
| 生菜/小米辣 | id 与同名均不存在（需新建） |
| 10 用料名覆盖 | 8 个已存在（生产 id 体系）；**花生米生产 id=cmty25ry8000tp0pg4gh5dz1f**（与本地 cmtvnuvxvc2oy5fdrzhpxxe69 异 id） |
| 生产源码版本 | a5d4fef（PE-1）：含 T-C06 管线代码、**不含 R-2 关卡与 R-9 dishes 路由** |
| 生产管线运行条件 | tools/content-pipeline 无 node_modules/dist → fm-import 不可运行 → 方式 X 否决 |
| 产物与图片 | out/xhs 含蚝油菜产物对；api 容器内 static/images/dishes/6a4a209d…/3 图在位，字节 140120/153824/89836 与 evidence 完全一致 → 图片零传输 |
| 静态链路 | nginx `location ^~ /images/` 反代 api fastifyStatic（cookie 鉴权），无需改动 |

方式定案：**方式 V（本地库直读→生产重放）**，rds-1 ①-5 先例同款；Dish/生菜/小米辣显式本地 id，DI 10 行 ingredientId 按名映射（8 个→生产 id，生菜/小米辣→新建 id）。

## 2. 执行记录

### 2.1 备份先行（AC1）

- `/usr/pgsql-18/bin/pg_dump -Fc` → /opt/backup/fm-full-20260913-tc06sync-pre.dump
- **102355 字节，pg_restore --list 可读（26 TABLE）**；连接串经命令替换传入不回显
- 注：首次用 /usr/bin/pg_dump（13.23）因 server 18.3 版本不匹配失败产出 0 字节文件，已当场删除并改用 PG18 全路径重跑成功

### 2.2 重放（AC2-AC4）

- gen-replay.cjs 本地直读（dish=1/ing=2/di=10 断言通过，NAME_MAP_AUDIT 10 食材名核对吻合）→ replay-data.json → scp → docker cp → 容器内 node 事务重放
- **首跑失败（如实记录）**：`DishIngredient_ingredientId_fkey` 外键违规，事务自动 ROLLBACK **零写入**；根因=replay 脚本映射表只覆盖生菜/小米辣两张、其余 8 行 DI 的本地 ingredientId 未按名翻译即落库。修复=gen 阶段 JOIN 带出 ing_name，replay 按 di.ing_name 查映射（NAME_MAP[di.ing_name] || 保留本地 id）
- 修复后首跑：`REPLAY_OK {"dishTotal":49,"ingTotal":81,"diTotal":375,"oysterDi":10}`（事务内精确计数断言全过，mapped=8 断言过）

### 2.3 幂等（AC5）

- 二次执行同脚本：`REPLAY_OK {"dishTotal":49,"ingTotal":81,"diTotal":375,"oysterDi":10}`——计数零变化（ON CONFLICT (id) DO NOTHING 全 skip）

## 3. 验证结果（verify-prod.cjs 全量输出）

### 3.1 蚝油生菜 Dish（AC2）

17 字段与 evidence/T-C06-verify-2026-09-13.md 逐项一致：id=cmtz3kdhp000070pga77gl5wt / name=蚝油生菜原来不炒更好吃，脆嫩还少油 / mealRole=MAIN / cuisine=家常 / flavorTags=[家常] / spicyLevel=0 / splitFlavor=false / activeMinutes=15 / totalMinutes=30 / equipment=[wok] / **steps=17 步全文一致** / status=DRAFT / origin=FETCHED / imageUrl=/images/dishes/6a4a209d000000002101b02a/0.webp / sourceSite=xiaohongshu / sourceUrl / licenseNote（FETCHED 台账原文）。

### 3.2 新食材（AC3）

- 生菜 cmtz3tf4q31th5sycx87vtkra：aliases=[球生菜,罗马生菜] / category=蔬菜 / defaultUnit=g
- 小米辣 cmtz3tf4zcm7y4dkaypoi9nz9：aliases=[红辣椒] / category=蔬菜 / defaultUnit=g

### 3.3 DishIngredient 10 行（AC4）

| 食材 | 生产 ingredientId | qty/unit/optional | 映射 |
|---|---|---|---|
| 生菜 | cmtz3tf4q31th5sycx87vtkra | 400 g / false | 新建 id |
| 大蒜 | cmtnpn9nu00020wpgn8n46mt7 | 20 g / false | 按名映射 |
| 蚝油 | cmtnpn9q3001c0wpg7dwvqt02 | 30 ml / false | 按名映射 |
| 生抽 | seed-ing-soysauce | 8 ml / false | 按名映射 |
| 玉米淀粉 | cmtnpn9ny00050wpgwtfep6rb | 12 g / false | 按名映射 |
| 清水 | cmtnpn9q4001e0wpggqs1vffm | 125 ml / false | 按名映射 |
| 盐 | seed-ing-salt | 2 g / false | 按名映射 |
| 食用油 | cmtnpn9nz00070wpgi5rhpy9i | 10 ml / false | 按名映射 |
| 小米辣 | cmtz3tf4zcm7y4dkaypoi9nz9 | 10 g / true | 新建 id |
| 花生米 | **cmty25ry8000tp0pg4gh5dz1f** | 10 g / true | 按名映射（生产已有 id） |

qty/unit/optional 与 evidence 逐行一致。

### 3.4 计数与 UAT 零触碰（AC6）

| 表 | 重放前 | 重放后 | 预期 |
|---|---|---|---|
| Dish | 48 | **49** | 49 ✓ |
| Dish FETCHED | 29 | **30** | 30 ✓ |
| Ingredient | 79 | **81** | 81 ✓ |
| DishIngredient | 365 | **375** | 375 ✓ |
| Plan | 83 | **83** | 83 ✓ |
| Event | 136 | **136** | 136 ✓ |
| ExclusionRule | 4 | **4** | 4 ✓（腊肉行未动） |

### 3.5 冒烟（AC7，含披露）

- `/health` → 200 `{"status":"ok"}`；`/health/db` → 200 `{"status":"ok","db":"connected"}`——API 存活 + DB 连通
- **披露**：任务卡 AC7 原文「查询 dishes 返回蚝油菜」在生产不可执行——GET /api/dishes 系 R-9（d19e498）引入，生产源码 a5d4fef 无此路由，实测 404 属版本事实而非故障。蚝油菜数据可达性改由 DB 直查（3.1-3.3）+ health/db 冒烟替代覆盖；R-9 随下次源码同步部署后该端点自然可用

## 4. R-2 关卡差异披露（任务卡 §4 落实）

蚝油菜含花生米（HARD INGREDIENT 过敏原规则命中）：本地入库时 `--allow-allergen-draft` 显式豁免（T-C06 披露在案）；生产 a5d4fef 无 R-2 关卡，本次主控脚本直插不经过 import 关卡，与「管线显式豁免后入库」等价。蚝油菜 status=DRAFT 不进推荐引擎、不对用户可见。R-2 随后续源码同步部署后口径自然对齐。

## 5. AC 自检

1. [✓] 备份先行：fm-full-20260913-tc06sync-pre.dump 102355 字节，pg_restore --list 26 TABLE 可读
2. [✓] Dish 48→49、FETCHED 29→30；蚝油菜 17 字段 + 17 步与 evidence 一致（§3.1）
3. [✓] Ingredient 79→81；生菜/小米辣按 evidence id 与字段落库（§3.2）
4. [✓] DishIngredient 365→375；蚝油菜 DI=10 行；花生米行 ingredientId=cmty25ry8000tp0pg4gh5dz1f、optional=true（§3.3）
5. [✓] 幂等：二次执行计数零变化（§2.3）
6. [✓] UAT 零触碰：Plan=83/Event=136/ExclusionRule=4 前后不变（§3.4）
7. [✓] 冒烟：/health 与 /health/db 均 200；「dishes 端点验证蚝油菜」以 DB 直查+health/db 替代覆盖，404 系 R-9 未部署版本事实已披露（§3.5）

## 6. 边界遵守确认

- 全程零 UPDATE/DELETE/DROP；重放仅 INSERT … ON CONFLICT (id) DO NOTHING；首跑失败自动 ROLLBACK 零残留
- 生产源码/nginx/容器配置零改动；图片零传输（预检验证已在位）
- $env:TEMP\fm-rds.env 未删；本地 PG 54329 未停；9222 CDP 浏览器未动
- 运行时零 LLM API 调用（脚本为纯数据搬运）
