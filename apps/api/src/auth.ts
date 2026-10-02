// apps/api/src/auth.ts
// T-A2：访问控制。口令只从服务端环境变量 ACCESS_TOKEN 读取（不碰任何 .env 文件、
// 绝不内置默认口令）；常量时间比较；登录接口成功后下发 HttpOnly+Secure+SameSite=Lax
// 长期 cookie；登录限速为进程内计数（不引依赖，禁 Redis/队列）。
// 阶段2 换微信登录时只改本文件，路由契约与 h5 调用方式不变。

import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** 会话 cookie 名（h5 侧 credentials:'include' 同源自动携带，不落任何前端存储） */
export const AUTH_COOKIE_NAME = 'access_token';

/** 长期有效：家人每台设备只输一次口令（主控决定①，2026-10-02） */
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

// ───── 常量时间比较 ─────
// 先取 sha256 归一长度，再 timingSafeEqual：避免长度分歧与逐字节提前返回造成的计时侧信道
export function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a, 'utf8').digest();
  const bh = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ah, bh);
}

/** 服务端口令（请求时读取：测试可按用例覆写；未配置 = 拒绝一切访问） */
function expectedToken(): string | undefined {
  return process.env.ACCESS_TOKEN;
}

/** 当前 cookie 是否通过校验（fail closed） */
export function isAuthenticated(token: string | undefined): boolean {
  const expected = expectedToken();
  return expected !== undefined && token !== undefined && safeEqual(token, expected);
}

// ───── 登录限速（进程内计数）─────
// 策略：同一来源 IP 每 10 分钟最多 10 次失败，限速期间正确口令也拒绝（防在线爆破）。
// 家庭多设备互不影响；计数仅存内存、API 重启即清零——口令为高熵随机串，
// 限速是防御纵深而非唯一防线。生产反向代理解析后 request.ip 为代理地址，等效全局限速，
// 对家庭自用场景可接受（换按设备粒度需受信代理头，另立卡）。
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginFails = new Map<string, { count: number; resetAt: number }>();

/** 清掉过期窗口，防 Map 无限增长 */
function pruneExpired(now: number): void {
  for (const [key, record] of loginFails) {
    if (record.resetAt <= now) loginFails.delete(key);
  }
}

export function isLoginRateLimited(key: string, now: number = Date.now()): boolean {
  pruneExpired(now);
  const record = loginFails.get(key);
  return record !== undefined && record.count >= LOGIN_MAX_FAILS;
}

export function recordLoginFailure(key: string, now: number = Date.now()): void {
  pruneExpired(now);
  const record = loginFails.get(key);
  if (record === undefined) {
    loginFails.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    record.count += 1;
    record.resetAt = now + LOGIN_WINDOW_MS;
  }
}

export function clearLoginFailures(key: string): void {
  loginFails.delete(key);
}

// ───── auth 中间件插槽 ─────
// 阶段2：替换为微信登录（修改本函数即可，路由不变）
export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // /health 探活与 /api/auth/ 登录三件套豁免：登录接口不可能先要求登录态
  if (request.url.startsWith('/health') || request.url.startsWith('/api/auth/')) {
    return;
  }
  if (!isAuthenticated(request.cookies[AUTH_COOKIE_NAME])) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// ───── 登录路由 ─────
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login <- { token }：服务端校验口令 -> 下发 HttpOnly cookie
  app.post('/api/auth/login', async (request, reply) => {
    const key = request.ip;
    if (isLoginRateLimited(key)) {
      return reply.code(429).send({ error: '尝试次数太多，请十分钟后再试' });
    }
    const body = (request.body ?? {}) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    if (!isAuthenticated(token)) {
      recordLoginFailure(key);
      return reply.code(401).send({ error: '口令不正确' });
    }
    clearLoginFailures(key);
    reply.setCookie(AUTH_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return { ok: true };
  });

  // GET /api/auth/me：h5 登录页探测既有登录态。恒 200 不 401——
  // 401 会被 h5 统一封装导回登录页，而登录页正靠这个接口做判断，不能自我循环。
  app.get('/api/auth/me', async (request) => ({
    authenticated: isAuthenticated(request.cookies[AUTH_COOKIE_NAME]),
  }));
}
