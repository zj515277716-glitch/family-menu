#!/usr/bin/env node
// pnpm deploy:api —— API 一条命令部署：远端 docker compose pull + up -d，轮询 /health 并核对 commit。
// 镜像仓库 = 阿里云 ACR 个人版（registry/命名空间经环境变量参数化，未配置即给开通指引后退出，不半跑）。
// 本脚本不持有任何口令：远端 pull 使用服务器 docker daemon 已登录的 ACR 凭据；凭据注入归 CI/ Secrets（b 卡）。
//
// 用法：
//   ACR_REGISTRY=<registry> ACR_NAMESPACE=<命名空间> pnpm deploy:api              # 真实部署
//   ACR_REGISTRY=<registry> ACR_NAMESPACE=<命名空间> pnpm deploy:api -- --dry-run # 只打印计划，不执行
// 可选环境变量：
//   DEPLOY_TAG   镜像 tag（默认本地 git 短哈希）
//   SSH_HOST     ssh 别名（默认 fmsrv）
//   REMOTE_DIR   服务器 compose 目录（默认 /opt/family-menu）
//   HEALTH_URL   /health 地址（默认 http://127.0.0.1:3001/health，服务器视角；公网 /health 是 H5 页不能用）
//   HEALTH_TIMEOUT_MS 轮询总时限（默认 120000）
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

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
if (!/^[0-9a-f]{7,40}$/.test(sha)) die(`git 短哈希异常：${sha}`);

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
const healthTimeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 120000);
const image = `${registry}/${namespace}/family-menu-api:${sha}`;
// API_TAG 经环境插值进 compose 的 image 行（服务器 compose 已参数化，T-Q04b2）
const remoteCmd = `cd ${remoteDir} && API_TAG=${sha} docker compose pull api && API_TAG=${sha} docker compose up -d api`;

step(`镜像        : ${image}`);
step(`期望 /health: ${expectedVersion}`);
step(`远端命令    : ssh ${host} "${remoteCmd}"`);

if (DRY_RUN) {
  step('--dry-run：以上为部署计划，未执行任何 ssh / 部署操作。');
  process.exit(0);
}

// ── 2. 远端拉取并重启（一条命令） ──
step(`执行远端部署（ssh ${host}）…`);
execSync(`ssh ${host} "${remoteCmd}"`, { stdio: 'inherit' });

// ── 3. 轮询 /health 直到 healthy ──
// 探测在服务器本地执行（ssh + curl）：公网域名的 /health 由 Caddy 路由给 H5（API 不暴露公网是安全现状），
// 本机 fetch 公网会拿到 H5 页导致误判。HEALTH_URL 默认即服务器视角的容器映射端口。
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
    body = JSON.parse(out);
    break;
  } catch {
    step('/health 暂不可达，继续等待…');
  }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!body) die(`/health 在 ${healthTimeoutMs / 1000}s 内未恢复 healthy，部署判定失败（回滚：远端恢复 compose 备份后 up -d）`);
if (body.status !== 'ok') die(`/health status=${body.status}，部署判定失败`);
if (body.version !== expectedVersion) {
  console.error(`[deploy:api] FATAL: commit 不一致：远端 version=${body.version}，期望 ${expectedVersion}`);
  console.error('[deploy:api] 排查：镜像是否以 --build-arg GIT_COMMIT 注入本次短哈希；compose 是否指向本次 tag。');
  process.exit(1);
}
step(`DEPLOY_OK：/health version=${body.version} 与本地提交 ${sha} 一致。`);
