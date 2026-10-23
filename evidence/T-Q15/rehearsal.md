# T-Q15 生产快照预演（2026-10-23）

> 结论：**预演通过**。生产运行版本未变（API `1ef04f3` / H5 `2a2b9c0`）；预演只用只读 dump + 生产机临时容器，结束后容器与隧道均已删除。

## 1. 备份实测

- `node tools/prod-backup.mjs` 真实执行：`BACKUP_OK backups/family_menu-20261023-203450.dump`，manifest 记录 `api_image=...:1ef04f3`；`pg_restore --list` 自检通过；全程未输出 DATABASE_URL 或口令。
- 生产 PG 18.3、库 9.9MB；服务器已有 `postgres:18-alpine`，脚本用 `--pull=never` 不拉新镜像。

## 2. 预演环境

- 生产机临时容器 `fm-rehearsal-pg`（`postgres:18-alpine`，256MB，仅绑 `127.0.0.1:55432`，trust 仅限临时容器），恢复上述 dump；本机经 SSH 隧道连入。
- 恢复后基线：50 道菜；`_prisma_migrations` 6 行，其中 `init` / `rescale_event_type` 各重复 1 行（distinct 4 条，与镜像 `1ef04f3` 的 4 条迁移文件一致，生产 schema 为旧版）；预演后容器已删除，生产服务/生产库未被写入。

## 3. 预演结果

| 步骤 | 结果 |
|---|---|
| `prisma migrate deploy` | 成功应用 2 条（`meal_slots_dayplan`、`family_rule_defaults`）；迁移表行数 6→8、distinct 4→6，failed=0 |
| `prisma db seed` | 成功：1 家庭 + 1 规则 + 3 忌口 + 34 食材 + 19 菜 + 74 用料 + 7 菜单 + 23 关联 |
| `check:safety` | exit 0，失败 0；既有 TAG 死规则 WARN×2（花生/内脏，另有食材级规则覆盖） |
| 不变量 | PUBLISHED 59 道全部通过 HARD 规则；早餐 PUBLISHED 6 道；存量 Plan 107 条保留；FamilyRule 回填 4/0/7 |
| 一次性容器路径 | 用生产镜像 `1ef04f3` 实测：`prisma 7.9.1`、`tsx 4.23.7` 均在 `apps/api/node_modules/.bin`；`check-safety.ts` 容器内 exit 0 |
| 清理 SQL | 临时容器实测：`psql -c` 不支持 `:'pid'` 变量（会语法错），已改为校验后 id 拼 SQL；修正后 DELETE 1/1、`CLEANUP_OK`，残留 0 |

## 4. 本地门禁与冒烟

- 干净库 `family_menu_q15`：migrate deploy + seed 后 `pnpm test` **713 passed / 0 failed**；`pnpm lint`、`pnpm -r exec tsc --noEmit` 全绿。
- T-Q15 冒烟对本地同源生产构建（本地 API + H5 静态代理）：**9/9 PASS**，console error=0、失败请求=0；生成的 Plan 在隔离库清理实测零残留。
- 冒烟实现修正：登录页新旧文案兼容；推荐请求改为页面内同源 `fetch`（`ctx.request` 不携带浏览器 Secure cookie，本地会误报 401）。

## 5. 未做与风险

- 生产发布未执行；API/H5 仍为 `1ef04f3` / `2a2b9c0`。发布必须在 main 上执行（脚本已加分支门禁），且 CI 需先为 main 提交构建镜像。
- main 分支保护仍为 false（GitHub 公开 API）；需产品负责人在 GitHub Settings 开启。
- 生产 `_prisma_migrations` 存在历史重复行（`init` / `rescale_event_type` 各 2 行，均 finished、无 rolled_back）；预演证明不阻断 deploy，清理需 L3 另行授权。
- `apps/h5/.env.production` 仍有未使用的 `TARO_APP_ACCESS_TOKEN` 注入位；当前 dist 未包含该值（已 grep 验证），建议后续卡清理，避免将来被引用后进产物。
