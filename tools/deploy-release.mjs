#!/usr/bin/env node
// pnpm deploy:release —— 同窗口发布：H5 暂存 → API（备份/迁移/内容/健康）→ H5 原位替换 → 生产冒烟 → 清理冒烟 Plan。
//
// 为什么先暂存 H5：API 的备份/迁移/健康轮询是慢步骤，期间旧 H5 继续服务；
// API 切换成功后才用已上传的 tar 做原位替换，把“API 已升级 / H5 未升级”的窗口压到最小。
//
// 用法：
//   ACR_REGISTRY=<registry> ACR_NAMESPACE=<命名空间> FM_TOKEN=<家庭口令> pnpm deploy:release
//   ACR_REGISTRY=... ACR_NAMESPACE=... FM_TOKEN=... pnpm deploy:release -- --dry-run   # 只打印阶段与命令
// 可选环境变量：
//   FM_BASE_URL       冒烟地址（默认 https://menu.jijingkongjian.xin）
//   DEPLOY_TAG        镜像 tag（默认本地 git 短哈希）
//   SSH_HOST          ssh 别名（默认 fmsrv）
//   REMOTE_DIR        服务器 compose 目录（默认 /opt/family-menu）
//   HEALTH_URL / DB_HEALTH_URL / HEALTH_TIMEOUT_MS 透传给 deploy:api
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

function die(msg) {
  console.error(`[deploy:release] FATAL: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[deploy:release] ${msg}`);
}

// ── 预检（缺任何一项都在启动前 FATAL，不半跑） ──
const registry = process.env.ACR_REGISTRY?.trim();
const namespace = process.env.ACR_NAMESPACE?.trim();
const token = process.env.FM_TOKEN?.trim();
if (!registry || !namespace) {
  die('未配置 ACR_REGISTRY / ACR_NAMESPACE（deploy:api 需要）。');
}
if (!token) {
  die('未配置 FM_TOKEN（生产冒烟登录用；只从环境变量读，不入库、不打印）。');
}

let sha = process.env.DEPLOY_TAG?.trim();
if (!sha) {
  sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}
if (!/^[0-9a-f]{7,40}$/.test(sha)) die(`镜像 tag 异常：${sha}`);

const host = process.env.SSH_HOST?.trim() || 'fmsrv';
const remoteDir = process.env.REMOTE_DIR?.trim() || '/opt/family-menu';
const base = process.env.FM_BASE_URL?.trim() || 'https://menu.jijingkongjian.xin';
const distReady = existsSync(path.join(REPO_ROOT, 'apps', 'h5', 'dist', 'index.html'));

step(`BASE=${base} DEPLOY_TAG=${sha} host=${host}`);
step('阶段：1 H5 暂存 → 2 API（备份/迁移/内容/健康）→ 3 H5 原位替换 → 4 生产冒烟 → 5 清理冒烟 Plan');

// 清理脚本：PLAN_ID 已做 /^[a-z0-9]+$/ 校验，避免注入；DATABASE_URL 只在远端 .env 展开。
function cleanupScript(planId) {
  return [
    'set -eu',
    `cd ${remoteDir}`,
    'set -a; . ./.env; set +a',
    `export PLAN_ID='${planId}'`,
    `docker run --rm --pull=never -e DATABASE_URL -e PLAN_ID postgres:18-alpine sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pid="$PLAN_ID" -c "DELETE FROM \\"Event\\" WHERE \\"planId\\" = :'"'"'pid'"'"'; DELETE FROM \\"Plan\\" WHERE id = :'"'"'pid'"'"';"'`,
    'echo CLEANUP_OK',
  ].join('\n');
}

function rollbackLines(prevTag) {
  return [
    `API 回滚：${prevTag ? `pnpm rollback:api -- --to ${prevTag}` : 'pnpm rollback:api（无参数先列服务器镜像 tag）'}`,
    'H5 回滚：服务器 /opt/family-menu 下最近的 h5-dist.bak-* 原位拷回 h5-dist（保 inode，勿 mv 换目录）',
    '数据恢复：仅数据损坏才用 backups/ 下 dump（覆盖生产库，L3 需另行授权）',
  ];
}

if (DRY_RUN) {
  step('--dry-run：以下为阶段与命令，未执行任何 ssh/scp/子脚本。');
  const stageCmd = 'node tools/deploy-h5.mjs --stage';
  console.log(`  1) H5 暂存        : ${stageCmd}`);
  console.log(`     dist ${distReady ? '已存在；--dry-run 复用，真实发布会重新构建' : '不存在，真实发布会先构建'}`);
  console.log('  2) API 发布       : node tools/deploy-api.mjs（备份 → pull → 迁移/种子/安全 → up → /health + /health/db）');
  console.log('  3) H5 原位替换    : node tools/deploy-h5.mjs --from-staged <STAGED_TAR>');
  console.log(`  4) 生产冒烟       : FM_BASE_URL=${base} node tests/e2e/T-Q15-prod-smoke.mjs`);
  console.log('  5) 清理冒烟 Plan  : ssh ' + host + ' bash -s <<\'REMOTE\'');
  console.log(cleanupScript('<PLAN_ID_FOR_CLEANUP>').replace(/^/gm, '       '));
  console.log('       REMOTE');
  for (const line of rollbackLines('<PREV_TAG>')) console.log(`  ${line}`);
  process.exit(0);
}

let previousTag = '';
let backupPath = '';

function runCapture(cmd, label, extraEnv, showRollback = true) {
  try {
    return execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 900000,
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });
  } catch (e) {
    console.error(String(e.stdout || ''));
    console.error(String(e.stderr || ''));
    if (showRollback) {
      for (const line of rollbackLines(previousTag)) console.error(`[deploy:release] ${line}`);
    }
    die(`${label}失败，已停止。`);
  }
}

// ── 1. H5 暂存 ──
step('阶段 1/5：H5 构建 + 上传暂存（不替换）…');
const stageOut = runCapture(`"${process.execPath}" tools/deploy-h5.mjs --stage`, 'H5 暂存');
console.log(stageOut);
const stagedMatch = stageOut.match(/^STAGED_TAR=(\S+)$/m);
if (!stagedMatch) die('H5 暂存未输出 STAGED_TAR，停止（尚未改动生产）。');
const stagedTar = stagedMatch[1];
step(`STAGED_TAR=${stagedTar}`);

// ── 2. API 发布（内部已含备份/迁移/内容/双健康门禁） ──
step('阶段 2/5：API 发布…');
let apiOut = '';
try {
  apiOut = execSync(`"${process.execPath}" tools/deploy-api.mjs`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 900000,
  });
} catch (e) {
  console.error(String(e.stdout || ''));
  console.error(String(e.stderr || ''));
  const prev = String(e.stdout || '').match(/^PREV_TAG=(.+)$/m);
  if (prev) previousTag = prev[1].trim();
  for (const line of rollbackLines(previousTag)) console.error(`[deploy:release] ${line}`);
  die('API 发布失败（deploy:api 已在其输出中给出精确回滚命令）。');
}
console.log(apiOut);
const backupMatch = apiOut.match(/^BACKUP_PATH=(.+)$/m);
const prevMatch = apiOut.match(/^PREV_TAG=(.+)$/m);
const versionMatch = apiOut.match(/^HEALTH_VERSION=(.+)$/m);
if (backupMatch) backupPath = backupMatch[1].trim();
if (prevMatch) previousTag = prevMatch[1].trim();
const healthVersion = versionMatch ? versionMatch[1].trim() : 'unknown';
if (!/DEPLOY_OK/.test(apiOut)) {
  for (const line of rollbackLines(previousTag)) console.error(`[deploy:release] ${line}`);
  die('deploy:api 未输出 DEPLOY_OK。');
}

// ── 3. H5 原位替换（用已暂存 tar，跳过构建与上传） ──
step('阶段 3/5：H5 原位替换（--from-staged）…');
const h5Out = runCapture(`"${process.execPath}" tools/deploy-h5.mjs --from-staged ${stagedTar}`, 'H5 原位替换');
console.log(h5Out);
if (!/DEPLOY_OK/.test(h5Out)) {
  for (const line of rollbackLines(previousTag)) console.error(`[deploy:release] ${line}`);
  die('H5 原位替换未输出 DEPLOY_OK。');
}

// ── 4. 生产冒烟（口令只经环境变量） ──
step(`阶段 4/5：生产冒烟 ${base} …`);
const smokeOut = runCapture(
  `"${process.execPath}" tests/e2e/T-Q15-prod-smoke.mjs`,
  '生产冒烟',
  { FM_BASE_URL: base, FM_TOKEN: token },
);
console.log(smokeOut);
const planMatch = smokeOut.match(/^PLAN_ID_FOR_CLEANUP=(\S+)$/m);
if (!planMatch) {
  for (const line of rollbackLines(previousTag)) console.error(`[deploy:release] ${line}`);
  die('冒烟未输出 PLAN_ID_FOR_CLEANUP（无法精确清理）。');
}
const planId = planMatch[1].trim();
if (!/^[a-z0-9]+$/.test(planId)) {
  die(`冒烟返回的 Plan id 形态异常，拒绝拼进远端 SQL：${planId}`);
}

// ── 5. 精确清理冒烟产生的 Plan（先删 Event，再删 Plan） ──
step(`阶段 5/5：清理冒烟 Plan ${planId} …`);
let cleanupOut = '';
try {
  cleanupOut = execSync(`ssh ${host} bash -s`, {
    input: cleanupScript(planId),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120000,
  });
} catch (e) {
  console.error(String(e.stdout || ''));
  console.error(String(e.stderr || ''));
  die(`清理失败（发布已成功，冒烟 Plan ${planId} 仍留在生产库；需人工清理）。`);
}
console.log(cleanupOut);
if (!cleanupOut.includes('CLEANUP_OK')) {
  die(`清理未输出 CLEANUP_OK（冒烟 Plan ${planId} 可能仍在生产库）。`);
}

// ── 摘要 ──
console.log('=== RELEASE SUMMARY ===');
console.log(`BACKUP_PATH=${backupPath || 'unknown'}`);
console.log(`API_TAG=${sha}`);
console.log(`HEALTH_VERSION=${healthVersion}`);
console.log('SMOKE=PASS');
console.log('CLEANUP=OK');
for (const line of rollbackLines(previousTag)) console.log(line);
step('RELEASE_OK：同窗口发布完成。');
