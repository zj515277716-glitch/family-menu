// apps/api/test/auth.spec.ts
// T-A2（AC2/AC3）：访问控制回归。
// 覆盖：业务 /api 无 cookie 一律 401；/health 豁免；POST /api/auth/login 口令服务端校验
// （错误 401 不下发 cookie / 正确下发 HttpOnly+Secure+SameSite=Lax 长期 cookie）；
// 同一来源连续口令错误触发进程内限速 429（限速期间正确口令也拒）；
// GET /api/auth/me 探测语义（恒 200，never 401——h5 登录页据此探测，避免 401 触发跳登录死循环）。
// 只测认证层、不依赖数据库：带 cookie 的业务断言走 /images 静态 404（过 authHook 即非 401）。
// 限速按来源 IP 隔离：各用例用不同 remoteAddress 模拟不同设备，互不消耗失败配额。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const TEST_TOKEN = 'a2-test-token-7Qm4xZ9Lt';
const WRONG_TOKEN = 'a2-wrong-token-000000';
// 与 apps/api/src/auth.ts 的进程内限速阈值保持一致（改这里必须同步改那里）
const LOGIN_MAX_FAILS = 10;

let app: FastifyInstance;
let originalToken: string | undefined;

beforeAll(async () => {
  // 保存并覆写 ACCESS_TOKEN：让登录契约在任何环境（含无 .env 的 CI）确定可验
  originalToken = process.env.ACCESS_TOKEN;
  process.env.ACCESS_TOKEN = TEST_TOKEN;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (originalToken === undefined) {
    delete process.env.ACCESS_TOKEN;
  } else {
    process.env.ACCESS_TOKEN = originalToken;
  }
});

/** set-cookie 响应头归一为字符串数组（light-my-request 下可能是 string 或 string[]） */
function setCookieHeaders(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return [raw];
  return [];
}

/** 发起一次登录尝试（token 可为错值；remoteAddress 模拟不同设备） */
function loginAttempt(token: string, remoteAddress: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress,
    payload: { token },
  });
}

describe('T-A2 认证层', () => {
  it('无 cookie 调业务 /api（GET/PUT/POST）一律 401', async () => {
    const cases: { method: 'GET' | 'PUT' | 'POST'; url: string; payload?: unknown }[] = [
      { method: 'GET', url: '/api/family/rules' },
      { method: 'GET', url: '/api/family/exclusions' },
      { method: 'PUT', url: '/api/family/exclusions', payload: [] },
      { method: 'GET', url: '/api/plans' },
      {
        method: 'POST',
        url: '/api/recommend',
        payload: { people: 4, timeBudgetMin: 30, mustUse: [] },
      },
      { method: 'GET', url: '/api/dishes' },
      { method: 'GET', url: '/images/private-dish.png' },
    ];
    for (const c of cases) {
      const res = await app.inject({
        method: c.method,
        url: c.url,
        remoteAddress: '10.2.0.1',
        payload: c.payload,
      });
      expect(res.statusCode, `${c.method} ${c.url} 无 cookie 应 401`).toBe(401);
    }
  });

  it('/health 端点豁免鉴权（DB 不可达也 200 且不回显连接细节）', async () => {
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.2.0.2',
    });
    expect(health.statusCode).toBe(200);
    const db = await app.inject({
      method: 'GET',
      url: '/health/db',
      remoteAddress: '10.2.0.2',
    });
    expect(db.statusCode).toBe(200);
    expect(JSON.stringify(db.json())).not.toContain('postgresql://');
  });
});

describe('T-A2 登录接口 POST /api/auth/login', () => {
  it('口令错误返回 401 且不下发 cookie', async () => {
    const res = await loginAttempt(WRONG_TOKEN, '10.3.0.1');
    expect(res.statusCode).toBe(401);
    expect(setCookieHeaders(res)).toHaveLength(0);
  });

  it('口令正确返回 200，下发 HttpOnly+Secure+SameSite=Lax 长期 cookie', async () => {
    const res = await loginAttempt(TEST_TOKEN, '10.3.0.2');
    expect(res.statusCode).toBe(200);
    const cookies = setCookieHeaders(res);
    expect(cookies.length).toBeGreaterThan(0);
    const cookie = cookies.find((c) => c.startsWith('access_token=')) ?? '';
    expect(cookie).toContain(`access_token=${TEST_TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=\d+/);
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)?.[1] ?? 0);
    // 长期有效：家人每台设备只输一次（主控决定①）
    expect(maxAge).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
  });

  it('带登录 cookie 访问业务接口可通过鉴权层（/images 静态 404 而非 401）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/images/private-dish.png',
      remoteAddress: '10.3.0.3',
      cookies: { access_token: TEST_TOKEN },
    });
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(401);
  });
});

describe('T-A2 探测接口 GET /api/auth/me', () => {
  it('无 cookie / 错误 cookie -> 200 authenticated=false（恒不 401）', async () => {
    const noCookie = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      remoteAddress: '10.4.0.1',
    });
    expect(noCookie.statusCode).toBe(200);
    expect(noCookie.json()).toEqual({ authenticated: false });
    const wrong = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      remoteAddress: '10.4.0.1',
      cookies: { access_token: WRONG_TOKEN },
    });
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json()).toEqual({ authenticated: false });
  });

  it('正确 cookie -> 200 authenticated=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      remoteAddress: '10.4.0.2',
      cookies: { access_token: TEST_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: true });
  });
});

describe('T-A2 登录限速（进程内计数，按来源 IP）', () => {
  it('同一来源连续口令错误达到阈值后 429，限速期间正确口令也被拒；其他来源不受影响', async () => {
    const ip = '10.9.0.1';
    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) {
      const res = await loginAttempt(WRONG_TOKEN, ip);
      statuses.push(res.statusCode);
    }
    expect(
      statuses.every((s) => s === 401),
      `前 ${LOGIN_MAX_FAILS} 次应全部 401，实际：${statuses.join(',')}`,
    ).toBe(true);
    const blocked = await loginAttempt(WRONG_TOKEN, ip);
    expect(blocked.statusCode).toBe(429);
    const blockedEvenIfCorrect = await loginAttempt(TEST_TOKEN, ip);
    expect(blockedEvenIfCorrect.statusCode).toBe(429);
    // 家庭多设备：不同来源互不影响
    const other = await loginAttempt(TEST_TOKEN, '10.9.0.2');
    expect(other.statusCode).toBe(200);
  });
});
