#!/usr/bin/env node
// pnpm rollback:api -- --to <tag> —— 把生产 api 容器切回指定镜像 tag 并做健康核对。
//
// 语义边界（必须让执行者看见）：
//   - 迁移均为加列 + 回填，旧镜像兼容新 schema，切镜像即可回滚代码；
//   - 仅当数据被新版本写坏时，才用 backups/ 下 dump 恢复（覆盖生产库，属 L3，需要产品负责人另行授权）；
//   - 本脚本不执行任何 SQL 写操作，只切镜像 + 读健康。
//
// 用法：
//   pnpm rollback:api -- --to <tag>              # 真实回滚
//   pnpm rollback:api -- --to <tag> --dry-run    # 只打印计划
//   pnpm rollback:api                            # 无 --to：打印用法 + 服务器最近镜像 tag，退出非 0
// 可选环境变量：
//   SSH_HOST         ssh 别名（默认 fmsrv）
//   REMOTE_DIR       服务器 compose 目录（默认 /opt/family-menu）
//   HEALTH_URL       /health 地址（默认 http://127.0.0.1:3001/health，服务器视角）
//   HEALTH_TIMEOUT_MS 轮询总时限（默认 120000）
import { execSync } from 'node:child_process';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');

function die(msg) {
  console.error(`[rollback:api] FATAL: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[rollback:api] ${msg}`);
}

const host = process.env.SSH_HOST?.trim() || 'fmsrv';
const remoteDir = process.env.REMOTE_DIR?.trim() || '/opt/family-menu';
const healthUrl = process.env.HEALTH_URL?.trim() || 'http://127.0.0.1:3001/health';
const healthTimeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 120000);

function argValue(flag) {
  const i = ARGS.indexOf(flag);
  if (i >= 0) return ARGS[i + 1];
  const eq = ARGS.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
}

const to = argValue('--to')?.trim();

if (!to) {
  console.error('用法：pnpm rollback:api -- --to <tag>');
  console.error('  tag 只接受 7–40 位十六进制短/长哈希或 latest。');
  if (DRY_RUN) {
    step('--dry-run：不读取服务器镜像列表。');
    process.exit(1);
  }
  step('读取服务器最近镜像 tag（只读 docker images，不改任何状态）…');
  try {
    const out = execSync(
      `ssh ${host} "docker images --format '{{.Repository}}:{{.Tag}}' | grep '/family-menu-api:' | head -10"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 },
    );
    console.log(out.trim() || '（无匹配镜像）');
  } catch (e) {
    console.error(String(e.stdout || ''));
    console.error(String(e.stderr || ''));
    step('无法读取服务器镜像列表（ssh 不可用或 docker 无输出）。');
  }
  process.exit(1);
}

if (!/^(?:[0-9a-f]{7,40}|latest)$/.test(to)) {
  die(`tag 非法：${to}（只接受 7–40 位十六进制或 latest）`);
}

const registry = process.env.ACR_REGISTRY?.trim();
const namespace = process.env.ACR_NAMESPACE?.trim();
const repoFromEnv = registry && namespace ? `${registry}/${namespace}/family-menu-api` : '';

// 由当前容器镜像推导仓库前缀（避免要求调用方必须配 ACR 变量）；容器不存在时退回环境变量。
const verifyRemote = `set -eu
cd ${remoteDir}
REPO=""
if CUR=$(docker inspect family-menu-api --format '{{.Config.Image}}' 2>/dev/null); then
  REPO="\${CUR%:*}"
fi
if [ -z "\$REPO" ] && [ -n "${repoFromEnv}" ]; then
  REPO="${repoFromEnv}"
fi
if [ -z "\$REPO" ]; then
  echo "FATAL: 无法确定镜像仓库（容器不存在且未配置 ACR_REGISTRY/ACR_NAMESPACE）" >&2
  exit 3
fi
IMAGE="\$REPO:${to}"
if docker image inspect "\$IMAGE" > /dev/null 2>&1; then
  echo "IMAGE_PRESENT \$IMAGE"
else
  echo "IMAGE_MISSING \$IMAGE"
  exit 2
fi
`;
const upRemote = `set -eu
cd ${remoteDir}
API_TAG=${to} docker compose --profile prod up -d api
`;

step(`目标 tag   : ${to}`);
step(`回滚动作   : 校验镜像存在 → API_TAG=${to} compose up -d api → /health status=ok`);
step('迁移口径   : 加列式迁移，旧镜像兼容新 schema；切镜像即可回滚代码。');
step('数据恢复   : 仅数据损坏时用 backups/ 下 dump 恢复（覆盖生产库，L3，需另行授权）。');

if (DRY_RUN) {
  step('--dry-run：以下为计划，未执行任何 ssh / docker。');
  console.log('----- ssh ' + host + ' bash -s（校验镜像） -----');
  console.log(verifyRemote);
  console.log('----- ssh ' + host + ' bash -s（切换镜像） -----');
  console.log(upRemote);
  console.log(`----- 健康核对：服务器本地轮询 ${healthUrl}，打印实际 version -----`);
  process.exit(0);
}

step(`校验镜像存在（ssh ${host}，只读）…`);
let verifyOut = '';
try {
  verifyOut = execSync(`ssh ${host} bash -s`, {
    input: verifyRemote,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });
} catch (e) {
  const stdout = String(e.stdout || '');
  const stderr = String(e.stderr || '');
  console.log(stdout);
  console.error(stderr);
  const missing = stdout.match(/IMAGE_MISSING (\S+)/);
  if (missing) {
    die(`镜像不存在：${missing[1]}。可先在服务器执行 docker pull ${missing[1]} 后再回滚。`);
  }
  die('镜像校验失败（未做任何切换）。');
}
console.log(verifyOut);
const present = verifyOut.match(/IMAGE_PRESENT (\S+)/);
if (!present) die('镜像校验未返回 IMAGE_PRESENT，按失败处理（未做任何切换）。');
step(`镜像存在：${present[1]}`);

step(`切换 api 容器（ssh ${host}）…`);
try {
  execSync(`ssh ${host} bash -s`, {
    input: upRemote,
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 300000,
  });
} catch {
  die(`切换失败；容器可能仍在目标 tag 上，请查看服务器 docker ps 与 compose logs。`);
}

step(`轮询（服务器本地）${healthUrl}（上限 ${healthTimeoutMs / 1000}s）…`);
const deadline = Date.now() + healthTimeoutMs;
let body = null;
while (Date.now() < deadline) {
  try {
    const out = execSync(`ssh ${host} "curl -s --max-time 5 ${healthUrl}"`, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    if (parsed?.status === 'ok') {
      body = parsed;
      break;
    }
  } catch {
    /* 未就绪，继续 */
  }
  step('/health 未就绪，继续等待…');
  await new Promise((r) => setTimeout(r, 3000));
}
if (!body) die(`回滚后 /health 在 ${healthTimeoutMs / 1000}s 内未达 status=ok。`);

step(`ROLLBACK_OK：/health status=${body.status}，实际 version=${body.version ?? 'unknown'}。`);
console.log(`ROLLBACK_TAG=${to}`);
console.log(`HEALTH_VERSION=${body.version ?? 'unknown'}`);
