#!/usr/bin/env node
// pnpm deploy:api —— API 一条命令部署（含备份、迁移、内容、双健康门禁）。
//
// 顺序（任一步失败即停，旧容器保持运行）：
//   1 备份      node tools/prod-backup.mjs（解析 BACKUP_OK 与当前镜像 tag）
//   2 拉取      docker compose --profile prod pull api
//   3 一次性容器 迁移 + 种子 + 安全只读检查（新 tag 镜像，不占用 api 容器名、不发布端口）
//   4 切换      docker compose --profile prod up -d api
//   5 门禁      /health 版本核对 → /health/db 要求 status=ok 且 db=connected
//
// 镜像仓库 = 阿里云 ACR 个人版（registry/命名空间经环境变量参数化，未配置即给开通指引后退出，不半跑）。
// 本脚本不持有任何口令：远端 docker/psql 使用服务器 .env 与 docker daemon 既有凭据。
//
// 用法：
//   ACR_REGISTRY=<registry> ACR_NAMESPACE=<命名空间> pnpm deploy:api                 # 真实部署
//   ACR_REGISTRY=<registry> ACR_NAMESPACE=<命名空间> pnpm deploy:api -- --dry-run    # 只打印完整计划
// 演练开关（必须显式传，会打印 WARNING）：--skip-backup / --skip-migrate / --skip-content
// 可选环境变量：
//   DEPLOY_TAG         镜像 tag（默认本地 git 短哈希）
//   SSH_HOST           ssh 别名（默认 fmsrv）
//   REMOTE_DIR         服务器 compose 目录（默认 /opt/family-menu）
//   HEALTH_URL         /health 地址（默认 http://127.0.0.1:3001/health，服务器视角）
//   DB_HEALTH_URL      /health/db 地址（默认 http://127.0.0.1:3001/health/db）
//   HEALTH_TIMEOUT_MS  轮询总时限（默认 120000）
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const SKIP_BACKUP = ARGS.includes('--skip-backup');
const SKIP_MIGRATE = ARGS.includes('--skip-migrate');
const SKIP_CONTENT = ARGS.includes('--skip-content');

function die(msg) {
  console.error(`[deploy:api] FATAL: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[deploy:api] ${msg}`);
}

// ── 1. 前置校验（全部失败即退，不半跑） ──
const registry = process.env.ACR_REGISTRY?.trim();
const namespace = process.env.ACR_NAMESPACE?.trim();
if (!registry || !namespace) {
  console.error('[deploy:api] 未配置 ACR_REGISTRY / ACR_NAMESPACE，拒绝半跑。');
  console.error('');
  console.error('ACR 个人版开通（一次性，产品负责人操作）：');
  console.error('  阿里云控制台 → 搜索「容器镜像服务」→ 开通个人版（免费，需实名）');
  console.error('  → 设置 Registry 登录密码 → 创建命名空间 → 创建镜像仓库 family-menu-api（代码源选「本地仓库」）。');
  console.error('');
  console.error('配置后重新执行（Windows PowerShell：$env:ACR_REGISTRY="..."; $env:ACR_NAMESPACE="..."）：');
  console.error('  ACR_REGISTRY=<registry 地址> ACR_NAMESPACE=<命名空间> pnpm deploy:api');
  process.exit(1);
}

let sha = process.env.DEPLOY_TAG?.trim();
if (!sha) {
  sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}
if (!/^[0-9a-f]{7,40}$/.test(sha)) die(`镜像 tag 异常：${sha}`);

let fileVersion = 'unknown';
try {
  fileVersion = readFileSync(path.join(REPO_ROOT, 'VERSION'), 'utf8').trim() || 'unknown';
} catch {
  die('仓库根 VERSION 文件读取失败（镜像内 /health 将显示 unknown，禁止部署）');
}
const expectedVersion = `${fileVersion}+${sha}`;
const host = process.env.SSH_HOST?.trim() || 'fmsrv';
const remoteDir = process.env.REMOTE_DIR?.trim() || '/opt/family-menu';
const healthUrl = process.env.HEALTH_URL?.trim() || 'http://127.0.0.1:3001/health';
const dbHealthUrl = process.env.DB_HEALTH_URL?.trim() || 'http://127.0.0.1:3001/health/db';
const healthTimeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 120000);
const image = `${registry}/${namespace}/family-menu-api:${sha}`;

// 一次性容器内命令：PATH 同时指到根与 apps/api 的 pnpm .bin（prisma 只在后者），再进 apps/api 执行三件事。
const oneOffInnerParts = ['export PATH=/app/node_modules/.bin:/app/apps/api/node_modules/.bin:$PATH; cd apps/api'];
if (!SKIP_MIGRATE) oneOffInnerParts.push('prisma migrate deploy');
if (!SKIP_CONTENT) oneOffInnerParts.push('prisma db seed', 'tsx scripts/check-safety.ts');
const oneOffInner = oneOffInnerParts.join(' && ');
const hasOneOffWork = !SKIP_MIGRATE || !SKIP_CONTENT;
const oneOffRemote = `set -eu
cd ${remoteDir}
API_TAG=${sha} docker compose --profile prod run --rm --no-deps api sh -c '${oneOffInner}'
`;
const pullRemote = `set -eu
cd ${remoteDir}
API_TAG=${sha} docker compose --profile prod pull api
`;
const upRemote = `set -eu
cd ${remoteDir}
API_TAG=${sha} docker compose --profile prod up -d api
`;

step(`镜像        : ${image}`);
step(`期望 /health: ${expectedVersion}`);
step(`备份        : ${SKIP_BACKUP ? '跳过（--skip-backup）' : 'node tools/prod-backup.mjs'}`);
step(`迁移        : ${SKIP_MIGRATE ? '跳过（--skip-migrate）' : 'prisma migrate deploy'}`);
step(`内容/安全   : ${SKIP_CONTENT ? '跳过（--skip-content）' : 'prisma db seed + check-safety.ts'}`);

for (const [flag, enabled] of [
  ['--skip-backup', SKIP_BACKUP],
  ['--skip-migrate', SKIP_MIGRATE],
  ['--skip-content', SKIP_CONTENT],
]) {
  if (enabled) console.warn(`[deploy:api] WARNING: 已显式传 ${flag}，仅限演练；生产发布必须三件事全跑。`);
}

// 只有在备份成功或已知当前镜像时才能给出精确回滚 tag。
let previousTag = 'unknown';
let backupPath = 'skipped';
function rollbackHint() {
  return previousTag === 'unknown'
    ? 'pnpm rollback:api（无参数运行可列出服务器最近镜像 tag，再带 --to）'
    : `pnpm rollback:api -- --to ${previousTag}`;
}

if (DRY_RUN) {
  step('--dry-run：完整计划如下，未执行任何 ssh / docker。');
  console.log('  1) 备份        : node tools/prod-backup.mjs');
  console.log('  2) 拉取镜像    : ssh ' + host + ' bash -s <<\'REMOTE\'');
  console.log(pullRemote.replace(/^/gm, '       '));
  console.log('  3) 一次性容器  : ssh ' + host + ' bash -s <<\'REMOTE\'');
  console.log(oneOffRemote.replace(/^/gm, '       '));
  console.log('  4) 切换容器    : ssh ' + host + ' bash -s <<\'REMOTE\'');
  console.log(upRemote.replace(/^/gm, '       '));
  console.log(`  5) 健康门禁    : 服务器本地轮询 ${healthUrl}（version=${expectedVersion}）`);
  console.log(`                   服务器本地轮询 ${dbHealthUrl}（status=ok 且 db=connected）`);
  console.log(`  失败回滚命令   : ${rollbackHint()}（previousTag 来自备份 manifest）`);
  process.exit(0);
}

function runRemote(script, label) {
  try {
    execSync(`ssh ${host} bash -s`, {
      input: script,
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: 600000,
    });
  } catch {
    die(`${label}失败，已中止（旧容器保持运行）。回滚：${rollbackHint()}`);
  }
}

// ── 2. 备份（先于任何变更） ──
if (SKIP_BACKUP) {
  step('跳过备份（--skip-backup）WARNING：生产发布禁止跳过。');
} else {
  step('先备份生产库（失败则不做任何变更）…');
  let out = '';
  try {
    out = execSync(`"${process.execPath}" tools/prod-backup.mjs`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000,
    });
  } catch (e) {
    console.error(String(e.stdout || ''));
    console.error(String(e.stderr || ''));
    die('备份失败，未做任何变更（未拉镜像、未跑迁移、未重启）。');
  }
  console.log(out);
  const ok = out.match(/^BACKUP_OK (.+)$/m);
  if (!ok) die('备份输出缺少 BACKUP_OK，按失败处理（未做任何变更）。');
  backupPath = ok[1].trim();
  const prev = out.match(/^BACKUP_PREV_TAG=(.+)$/m);
  if (prev) previousTag = prev[1].trim();
  step(`备份完成 ${backupPath}；当前镜像 tag=${previousTag}`);
}

// ── 3. 拉取新镜像 ──
step(`拉取镜像（ssh ${host}）…`);
runRemote(pullRemote, '拉取镜像');

// ── 4. 一次性容器：迁移 → 种子 → 安全只读检查 ──
if (hasOneOffWork) {
  step('一次性容器执行迁移/内容/安全（失败则不切换 api 容器）…');
  runRemote(oneOffRemote, '迁移/内容/安全');
} else {
  step('一次性容器步骤被全部跳过（--skip-migrate --skip-content）。');
}

// ── 5. 切换 api 容器 ──
step(`切换 api 容器（ssh ${host}）…`);
runRemote(upRemote, '切换 api 容器');

// ── 6. 健康门禁（服务器本地 curl，公网 /health 由 Caddy 路由给 H5） ──
function pollJson(url, accept, label) {
  return new Promise((resolve) => {
    const deadline = Date.now() + healthTimeoutMs;
    let last = null;
    const tick = () => {
      if (Date.now() >= deadline) return resolve(null);
      try {
        const out = execSync(`ssh ${host} "curl -s --max-time 5 ${url}"`, {
          encoding: 'utf8',
          timeout: 15000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        last = JSON.parse(out);
        if (accept(last)) return resolve(last);
      } catch {
        /* 未就绪，继续 */
      }
      if (last) step(`${label} 未就绪（${JSON.stringify(last)}），继续等待…`);
      else step(`${label} 暂不可达，继续等待…`);
      setTimeout(tick, 3000);
    };
    tick();
  });
}

step(`轮询（服务器本地）${healthUrl}（上限 ${healthTimeoutMs / 1000}s）…`);
const body = await pollJson(healthUrl, (b) => b?.status === 'ok', '/health');
if (!body) die(`/health 在 ${healthTimeoutMs / 1000}s 内未恢复 ok。回滚：${rollbackHint()}`);
if (body.version !== expectedVersion) {
  console.error(`[deploy:api] FATAL: commit 不一致：远端 version=${body.version}，期望 ${expectedVersion}`);
  console.error('[deploy:api] 排查：镜像是否以 --build-arg GIT_COMMIT 注入本次短哈希；compose 是否指向本次 tag。');
  die(`版本门禁失败。回滚：${rollbackHint()}`);
}
step(`/health ok version=${body.version}`);

step(`轮询（服务器本地）${dbHealthUrl}（要求 status=ok 且 db=connected）…`);
const dbBody = await pollJson(dbHealthUrl, (b) => b?.status === 'ok' && b?.db === 'connected', '/health/db');
if (!dbBody) die(`/health/db 未达 status=ok/db=connected。回滚：${rollbackHint()}`);
step(`/health/db ok db=${dbBody.db}`);

console.log(`[deploy:api] DEPLOY_OK：/health version=${body.version}，/health/db=${dbBody.status}/${dbBody.db}。`);
console.log(`BACKUP_PATH=${backupPath}`);
console.log(`API_TAG=${sha}`);
console.log(`PREV_TAG=${previousTag}`);
console.log(`HEALTH_VERSION=${body.version}`);
console.log(`ROLLBACK_CMD=pnpm rollback:api -- --to ${previousTag}`);
