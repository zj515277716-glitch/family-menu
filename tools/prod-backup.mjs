#!/usr/bin/env node
// pnpm backup:prod —— 生产库逻辑备份（pg_dump custom 格式）+ 自检 + manifest + 轮转保留。
//
// 设计要点：
//   1）远端脚本经 `ssh <host> bash -s` + stdin 传入，避免多层引号/变量展开地狱；
//   2）只在远端 `set -a; . ./.env; set +a` 内展开 DATABASE_URL，本地与日志都拿不到明文；
//   3）dump/自检固定用服务器已存在的 postgres:18-alpine 镜像，不拉新镜像；
//   4）manifest 记录当前 API 镜像 tag（回滚目标）、VERSION、库大小、dump 大小；
//   5）只保留最近 KEEP 份 dump+manifest（默认 5）。
//
// 用法：
//   pnpm backup:prod               # 真实备份
//   pnpm backup:prod -- --dry-run  # 只打印计划与远端脚本，不 ssh
// 可选环境变量：
//   SSH_HOST      ssh 别名（默认 fmsrv）
//   REMOTE_DIR    服务器部署目录（默认 /opt/family-menu）
//   BACKUP_KEEP   保留份数（默认 5）
import { execSync } from 'node:child_process';

const DRY_RUN = process.argv.includes('--dry-run');

const host = process.env.SSH_HOST?.trim() || 'fmsrv';
const remoteDir = process.env.REMOTE_DIR?.trim() || '/opt/family-menu';
const keepDumps = Number(process.env.BACKUP_KEEP || 5);
if (!Number.isInteger(keepDumps) || keepDumps < 1) {
  console.error(`[backup:prod] FATAL: BACKUP_KEEP 非法：${process.env.BACKUP_KEEP}`);
  process.exit(1);
}

function die(msg) {
  console.error(`[backup:prod] FATAL: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[backup:prod] ${msg}`);
}

// ── 远端脚本（stdin 传入；$ 变量只在远端展开） ──
const remoteScript = `set -eu
cd ${remoteDir}
set -a; . ./.env; set +a
if [ -z "\${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL 未配置" >&2
  exit 1
fi
mkdir -p backups
TS=$(date +%Y%m%d-%H%M%S)
DUMP="backups/family_menu-\${TS}.dump"
echo "dump start: \$DUMP"
docker run --rm --pull=never -e DATABASE_URL postgres:18-alpine sh -c 'pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges' > "\$DUMP"
if [ ! -s "\$DUMP" ]; then
  echo "FATAL: dump 为空（pg_dump 未产出）" >&2
  rm -f "\$DUMP"
  exit 1
fi
# 自检：同镜像 pg_restore --list 能读出归档目录（只校验可读，不打印内容/不连库）
docker run --rm --pull=never -v "\$PWD/backups:/backups:ro" postgres:18-alpine sh -c "pg_restore --list /backups/family_menu-\${TS}.dump > /dev/null"
DUMP_SIZE=$(du -h "\$DUMP" | cut -f1)
DB_SIZE=$(docker run --rm --pull=never -e DATABASE_URL postgres:18-alpine sh -c 'psql "$DATABASE_URL" -tAc "select pg_size_pretty(pg_database_size(current_database()))"' | tr -d '\\r' | head -1)
API_IMAGE=$(docker inspect family-menu-api --format '{{.Config.Image}}' 2>/dev/null || true)
if [ -z "\$API_IMAGE" ]; then API_IMAGE=unknown; fi
VERSION=$(cat VERSION 2>/dev/null || true)
if [ -z "\$VERSION" ]; then VERSION=unknown; fi
MANIFEST="backups/manifest-\${TS}.txt"
{
  echo "ts=\${TS}"
  echo "dump=\$DUMP"
  echo "dump_size=\$DUMP_SIZE"
  echo "db_size=\$DB_SIZE"
  echo "api_image=\$API_IMAGE"
  echo "version=\$VERSION"
} > "\$MANIFEST"
# 轮转：按 mtime 保留最近 KEEP 份，dump 与同名 manifest 一起删
ls -1t backups/family_menu-*.dump 2>/dev/null | tail -n +${keepDumps + 1} | while IFS= read -r f; do
  stem=$(basename "\$f" .dump)
  ts="\${stem#family_menu-}"
  rm -f "\$f" "backups/manifest-\${ts}.txt"
  echo "pruned: \$f"
done
echo "BACKUP_OK \$DUMP"
echo "BACKUP_PREV_TAG=\${API_IMAGE##*:}"
echo "BACKUP_MANIFEST=\$MANIFEST"
`;

step(`host=${host} remote=${remoteDir} keep=${keepDumps}`);
step('流程：source .env（不回显）→ pg_dump custom → pg_restore --list 自检 → manifest → 轮转');

if (DRY_RUN) {
  step('--dry-run：以下为远端脚本，未执行任何 ssh / docker。');
  console.log('----- ssh ' + host + ' bash -s <<\'REMOTE\' -----');
  console.log(remoteScript);
  console.log('----- REMOTE -----');
  step('计划输出：BACKUP_OK backups/family_menu-<ts>.dump / BACKUP_PREV_TAG=<当前镜像 tag>');
  process.exit(0);
}

let out = '';
try {
  out = execSync(`ssh ${host} bash -s`, {
    input: remoteScript,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 600000,
  });
} catch (e) {
  console.error(String(e.stdout || ''));
  console.error(String(e.stderr || ''));
  die('远端备份失败（未输出 BACKUP_OK）');
}
console.log(out);
const ok = out.match(/^BACKUP_OK (.+)$/m);
if (!ok) die('远端未输出 BACKUP_OK，按失败处理');
const prev = out.match(/^BACKUP_PREV_TAG=(.+)$/m);
step(`BACKUP_OK ${ok[1].trim()}`);
step(`BACKUP_PREV_TAG=${prev ? prev[1].trim() : 'unknown'}`);
