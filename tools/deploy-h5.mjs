#!/usr/bin/env node
// pnpm deploy:h5 —— H5 产物部署：本地 build → tar（包根 = dist 内容）→ scp → 远端原位替换 → DEPLOY_OK 校验。
// 收敛自 tools/deploy-h5-remote.sh 的实战流程，两条历史教训写死在流程里：
//   1）tar 包根必须是 dist 内容本身，多套一层目录远端 FATAL（2026-09-15 实锤）；
//   2）Caddy bind mount 绑目录 inode，mv 换目录全站 404 → 只能原位清空 + cp -a 拷入。
// 本脚本不含任何口令；传输走 ssh 别名（默认 fmsrv）下的既有信任链。
//
// 用法：
//   pnpm deploy:h5                          # 构建 + 上传 + 原位替换（原行为不变）
//   pnpm deploy:h5 -- --dry-run             # 本地 build 打包并列出 tar 根条目，不 scp/ssh
//   pnpm deploy:h5 -- --stage               # 构建 + 上传暂存，不替换；打印 STAGED_TAR=<远端路径>
//   pnpm deploy:h5 -- --from-staged <path>  # 跳过构建/上传，只对已暂存 tar 执行原位替换
// 组合约束：
//   --stage 与 --from-staged 互斥；--dry-run 与两者组合时不 scp/ssh（stage 仍可本地打包，dist 已存在则跳过构建）。
// 可选环境变量：
//   SSH_HOST    ssh 别名（默认 fmsrv）
//   REMOTE_DIR  服务器部署目录（默认 /opt/family-menu）
//   REMOTE_TMP  服务器临时目录（默认 /tmp）
import { execSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(REPO_ROOT, 'apps', 'h5', 'dist');
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const STAGE = ARGS.includes('--stage');
const FROM_STAGED_INDEX = ARGS.indexOf('--from-staged');
const FROM_STAGED = FROM_STAGED_INDEX >= 0 ? ARGS[FROM_STAGED_INDEX + 1] : undefined;

function die(msg) {
  console.error(`[deploy:h5] FATAL: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[deploy:h5] ${msg}`);
}

if (FROM_STAGED_INDEX >= 0 && (!FROM_STAGED || FROM_STAGED.startsWith('--'))) {
  die('--from-staged 需要远端 tar 路径，例如 --from-staged /tmp/h5-dist-staged-20261023-120000.tar.gz');
}
if (STAGE && FROM_STAGED_INDEX >= 0) die('--stage 与 --from-staged 不能同时使用');
if (FROM_STAGED && !/^\/[A-Za-z0-9._\-/]+$/.test(FROM_STAGED)) {
  die(`--from-staged 只接受绝对路径且字符安全：${FROM_STAGED}`);
}

const host = process.env.SSH_HOST?.trim() || 'fmsrv';
const remoteDir = process.env.REMOTE_DIR?.trim() || '/opt/family-menu';
const remoteTmp = process.env.REMOTE_TMP?.trim() || '/tmp';

// 远端原位替换例程：备份 → 解包校验 → 原位清空拷入（保 inode）→ DEPLOY_OK。
function remoteReplaceScript(tarRemotePath) {
  return [
    'set -eu',
    'TS=$(date +%Y%m%d-%H%M%S)',
    `cd ${remoteDir}`,
    'echo "=== H5 DEPLOY START $TS ==="',
    '[ -d h5-dist ] && cp -r h5-dist "h5-dist.bak-$TS" && echo "backup: h5-dist.bak-$TS" || echo "no old dir"',
    'mkdir -p h5-dist-new',
    `tar -xzf ${tarRemotePath} -C h5-dist-new`,
    '[ -f h5-dist-new/index.html ] || { echo "FATAL: no index.html in tar"; exit 1; }',
    'mkdir -p h5-dist',
    'find h5-dist -mindepth 1 -delete',
    'cp -a h5-dist-new/. h5-dist/',
    'rm -rf h5-dist-new',
    `rm -f ${tarRemotePath}`,
    'echo "index refs:"',
    'grep -o "app\\.[a-z0-9]*\\.js" h5-dist/index.html | head -2 || true',
    'grep -o "css/app\\.[a-z0-9]*\\.css" h5-dist/index.html | head -1 || true',
    'echo "=== DEPLOY_OK $TS ==="',
  ].join('\n');
}

function runRemoteReplace(tarRemotePath) {
  const remoteScript = remoteReplaceScript(tarRemotePath);
  step(`远端替换（ssh ${host} bash -s）…`);
  let out = '';
  try {
    out = execSync(`ssh ${host} bash -s`, {
      input: remoteScript,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    console.error(String(e.stdout || ''));
    die(`远端替换失败：${e.message}`);
  }
  console.log(out);
  if (!out.includes('DEPLOY_OK')) die('远端输出无 DEPLOY_OK，部署判定失败（回滚：远端 h5-dist.bak-$TS 拷回 h5-dist）');
  step('DEPLOY_OK：H5 产物已替换并校验 index 引用。');
}

// ── --from-staged：跳过构建/打包/上传 ──
if (FROM_STAGED) {
  step(`--from-staged：直接使用远端暂存包 ${FROM_STAGED}（跳过构建与 scp）`);
  if (DRY_RUN) {
    step('--dry-run：将执行远端原位替换例程，未执行任何 ssh。');
    console.log('----- ssh ' + host + ' bash -s <<\'REMOTE\' -----');
    console.log(remoteReplaceScript(FROM_STAGED));
    console.log('----- REMOTE -----');
    process.exit(0);
  }
  runRemoteReplace(FROM_STAGED);
  process.exit(0);
}

// ── 1. 本地构建 ──
if (DRY_RUN && existsSync(path.join(DIST_DIR, 'index.html'))) {
  step('--dry-run：dist 已存在，跳过构建（真实部署会先执行 pnpm --filter @family-menu/h5 build:h5）');
} else {
  step('本地构建：pnpm --filter @family-menu/h5 build:h5 …');
  execSync('pnpm --filter @family-menu/h5 build:h5', { cwd: REPO_ROOT, stdio: 'inherit' });
}
if (!existsSync(path.join(DIST_DIR, 'index.html'))) die(`构建产物缺 index.html：${DIST_DIR}`);

// ── 2. tar 打包（包根 = dist 内容，-C 进入 dist 后打 .） ──
const tarPath = path.join(os.tmpdir(), `h5-dist-${Date.now()}.tar.gz`);
step(`打包（包根 = dist 内容）：tar -czf ${tarPath} -C ${DIST_DIR} .`);
execSync(`tar -czf "${tarPath}" -C "${DIST_DIR}" .`, { stdio: 'inherit' });
if (!statSync(tarPath).size) die('tar 包为空');
step(`tar 大小 ${(statSync(tarPath).size / 1024).toFixed(0)} KB；根条目：`);
const rootEntries = execSync(`tar -tzf "${tarPath}"`, { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((e) => !e.startsWith('./') || e.split('/').length <= 2)
  .slice(0, 12);
console.log(rootEntries.map((e) => `  ${e}`).join('\n'));
if (!rootEntries.some((e) => e.replace(/^\.\//, '').replace(/\/$/, '') === 'index.html')) {
  rmSync(tarPath, { force: true });
  die('tar 根没有 index.html（多套了一层目录的历史坑），已中止');
}

// ── 3. --stage：沿用原上传路径命名，只上传不替换 ──
if (STAGE) {
  const stagedRemotePath = `${remoteTmp}/h5-dist-staged-${Date.now()}.tar.gz`;
  if (DRY_RUN) {
    step(`--dry-run：后续将执行 scp "${tarPath}" ${host}:${stagedRemotePath}`);
    step('--dry-run：只暂存，不替换 h5-dist。未执行任何 scp/ssh。');
    console.log(`STAGED_TAR=${stagedRemotePath}`);
    rmSync(tarPath, { force: true });
    process.exit(0);
  }
  step(`上传暂存：scp → ${host}:${stagedRemotePath}`);
  execSync(`scp "${tarPath}" ${host}:${stagedRemotePath}`, { stdio: 'inherit' });
  rmSync(tarPath, { force: true });
  console.log(`STAGED_TAR=${stagedRemotePath}`);
  step('STAGE_OK：仅上传暂存，未替换 h5-dist。');
  process.exit(0);
}

// ── 4. 原行为：固定临时路径上传 + 原位替换 ──
const remoteTarPath = `${remoteTmp}/h5-dist.tar.gz`;

if (DRY_RUN) {
  step(`--dry-run：后续将执行 scp "${tarPath}" ${host}:${remoteTarPath}`);
  step(`--dry-run：随后 ssh ${host} bash -s 执行远端替换例程（备份 → 解包校验 → 原位清空拷入 → DEPLOY_OK）。未执行任何 scp/ssh。`);
  rmSync(tarPath, { force: true });
  process.exit(0);
}

step(`上传：scp → ${host}:${remoteTarPath}`);
execSync(`scp "${tarPath}" ${host}:${remoteTarPath}`, { stdio: 'inherit' });
rmSync(tarPath, { force: true });

runRemoteReplace(remoteTarPath);
