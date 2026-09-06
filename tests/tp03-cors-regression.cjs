// T-P03 dev API 跨域（CORS）回归（AC1/AC2/AC4，纯测试、零业务逻辑改动）
//
// 断言方式（全部真实 HTTP，禁止 Mock）：
//   - AC1 预检放行：OPTIONS /api/recommend 从 http://127.0.0.1:10086 与 http://localhost:10086
//     → 2xx，且 Access-Control-Allow-Origin（白名单回显请求源）/ Allow-Methods /
//     Allow-Headers / Allow-Credentials: true 全部存在。
//   - AC2-a 鉴权语义不变（跨源）：无令牌跨源 GET /api/family/rules 仍 401，但响应带
//     Access-Control-Allow-Origin 头。
//   - AC2-b 跨源带令牌：带 ACCESS_TOKEN cookie 的跨源 POST /api/recommend → 200
//     （响应带 CORS 头；此调用会产生 Plan/Event，由 tp02-cleanup-test-plans.cjs teardown）。
//   - AC2-c 同源不变：无 Origin 请求（tp01 回归同形态）带令牌 200 / 无令牌 401。
//   - AC2-d 生产不变性：带生产域名 Origin（https://menu.jijingkongjian.xin，不在白名单）
//     的非预检请求不被 CORS 拦截——无令牌仍 401、带令牌 GET 仍 200（仅无 CORS 头）。
// 用法：node tests/tp03-cors-regression.cjs
// 退出码：0=全部 PASS；1=存在 FAIL
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) ENV[m[1]] = m[2];
}
const PORT = ENV.PORT || '3000';
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = ENV.ACCESS_TOKEN || 'family-menu-local-2026';

let pass = 0;
let fail = 0;
function step(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
  if (ok) pass++;
  else fail++;
}

async function call(method, p, { origin, withToken, body, acrm, acrh } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  if (withToken) headers.cookie = `access_token=${TOKEN}`;
  if (acrm) headers['access-control-request-method'] = acrm;
  if (acrh) headers['access-control-request-headers'] = acrh;
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* no body */
  }
  return {
    status: res.status,
    acao: res.headers.get('access-control-allow-origin'),
    acam: res.headers.get('access-control-allow-methods'),
    acac: res.headers.get('access-control-allow-credentials'),
    acacHeaders: res.headers.get('access-control-allow-headers'),
    data,
  };
}

async function assertPreflight(origin) {
  const r = await call('OPTIONS', '/api/recommend', {
    origin,
    acrm: 'POST',
    acrh: 'content-type',
  });
  step(
    `AC1 预检 ${origin}：2xx 放行（不再 401）`,
    r.status >= 200 && r.status < 300,
    `status=${r.status}（基线为 401）`,
  );
  step(
    `AC1 预检 ${origin}：ACAO 白名单回显请求源`,
    r.acao === origin,
    `acao=${r.acao}`,
  );
  step(
    `AC1 预检 ${origin}：ACAM 含 POST`,
    typeof r.acam === 'string' && r.acam.includes('POST'),
    `acam=${r.acam}`,
  );
  step(
    `AC1 预检 ${origin}：ACAH 含 content-type`,
    typeof r.acacHeaders === 'string' && r.acacHeaders.toLowerCase().includes('content-type'),
    `acah=${r.acacHeaders}`,
  );
  step(
    `AC1 预检 ${origin}：ACAC=true（cookie 鉴权）`,
    r.acac === 'true',
    `acac=${r.acac}`,
  );
}

async function main() {
  console.log(`BASE=${BASE}`);

  // ── AC1：两源预检放行 ──
  await assertPreflight('http://127.0.0.1:10086');
  await assertPreflight('http://localhost:10086');

  // ── AC2-a：无令牌跨源真实请求仍 401，但带 CORS 头 ──
  const r401 = await call('GET', '/api/family/rules', {
    origin: 'http://127.0.0.1:10086',
  });
  step(
    'AC2-a 无令牌跨源 GET rules：仍 401（鉴权语义不变）',
    r401.status === 401,
    `status=${r401.status} body=${JSON.stringify(r401.data)}`,
  );
  step(
    'AC2-a 无令牌跨源 GET rules：响应带 ACAO（浏览器可读到 401）',
    r401.acao === 'http://127.0.0.1:10086',
    `acao=${r401.acao}`,
  );

  // ── AC2-b：带令牌跨源推荐请求 200 ──
  const r200 = await call('POST', '/api/recommend', {
    origin: 'http://localhost:10086',
    withToken: true,
    body: { people: 4, timeBudgetMin: 60, mustUse: ['西红柿'] },
  });
  step(
    'AC2-b 带令牌跨源 POST recommend：200 且候选非空',
    r200.status === 200 && Array.isArray(r200.data?.candidates) && r200.data.candidates.length > 0,
    `status=${r200.status} candidates=${r200.data?.candidates?.length ?? '?'} planId=${r200.data?.planId ?? 'undefined'}`,
  );
  step(
    'AC2-b 带令牌跨源 POST recommend：响应带 ACAO',
    r200.acao === 'http://localhost:10086',
    `acao=${r200.acao}`,
  );

  // ── AC2-c：同源行为不变（无 Origin，tp01 回归同形态） ──
  const same200 = await call('GET', '/api/family/rules', { withToken: true });
  step(
    'AC2-c 同源（无 Origin）带令牌 GET rules：200（行为不变）',
    same200.status === 200,
    `status=${same200.status}`,
  );
  const same401 = await call('GET', '/api/family/rules', { withToken: false });
  step(
    'AC2-c 同源（无 Origin）无令牌 GET rules：401（行为不变）',
    same401.status === 401,
    `status=${same401.status}`,
  );

  // ── AC2-d：生产域名 Origin（非白名单）非预检请求不被 CORS 拦截 ──
  const prod401 = await call('GET', '/api/family/rules', {
    origin: 'https://menu.jijingkongjian.xin',
    withToken: false,
  });
  step(
    'AC2-d 生产 Origin 无令牌 GET rules：仍 401（请求未被 CORS 中断）',
    prod401.status === 401 && prod401.acao === null,
    `status=${prod401.status} acao=${prod401.acao}`,
  );
  const prod200 = await call('GET', '/api/family/rules', {
    origin: 'https://menu.jijingkongjian.xin',
    withToken: true,
  });
  step(
    'AC2-d 生产 Origin 带令牌 GET rules：200（同源部署行为不变）',
    prod200.status === 200 && prod200.acao === null,
    `status=${prod200.status} acao=${prod200.acao}`,
  );

  console.log(`\n== 结果: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('T-P03 REGRESSION FAILED:', e.message);
  process.exit(1);
});
