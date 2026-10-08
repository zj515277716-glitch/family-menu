// apps/api/test/version.spec.ts
// /health 版本口径回归：端点 200 且带 version 字段（compose healthcheck 依赖 /health 恒 200）；
// GIT_COMMIT 注入时拼接短哈希后缀；VERSION 读不到兜底 unknown。不依赖数据库（端点在鉴权豁免名单）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { composeVersion, getVersion, readFileVersion } from '../src/version.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let originalCommit: string | undefined;

beforeAll(async () => {
  originalCommit = process.env.GIT_COMMIT;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (originalCommit === undefined) {
    delete process.env.GIT_COMMIT;
  } else {
    process.env.GIT_COMMIT = originalCommit;
  }
});

describe('/health 版本口径', () => {
  it('返回 200，status=ok，version 存在且含 VERSION 文件值 1.1.0', async () => {
    delete process.env.GIT_COMMIT;
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; version: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.version).toContain('1.1.0');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('注入 GIT_COMMIT 时 version 拼接短哈希后缀', async () => {
    process.env.GIT_COMMIT = 'testabc123';
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { version: string }).version).toBe('1.1.0+testabc123');
  });

  it('composeVersion：无 commit 只显示文件版本；commit 空白被 trim；空文件版本兜底 unknown', () => {
    expect(composeVersion('1.1.0')).toBe('1.1.0');
    expect(composeVersion('1.1.0', undefined)).toBe('1.1.0');
    expect(composeVersion('1.1.0', '  ')).toBe('1.1.0');
    expect(composeVersion('1.1.0', ' abc1234 ')).toBe('1.1.0+abc1234');
    expect(composeVersion('', 'abc1234')).toBe('unknown+abc1234');
    expect(composeVersion('', undefined)).toBe('unknown');
  });

  it('readFileVersion：本仓库读到 1.1.0；无 VERSION 目录兜底 unknown（不抛错）', () => {
    expect(readFileVersion()).toBe('1.1.0');
    // 兜底路径要连 cwd 回退候选一起避开：把进程 cwd 挪进临时深处，使全部候选都落在临时目录内
    const base = mkdtempSync(path.join(os.tmpdir(), 'fm-version-'));
    const deep = path.join(base, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    const prevCwd = process.cwd();
    process.chdir(deep);
    try {
      expect(readFileVersion(deep)).toBe('unknown');
    } finally {
      process.chdir(prevCwd);
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('getVersion：整体不抛错且返回非空字符串', () => {
    expect(typeof getVersion()).toBe('string');
    expect(getVersion().length).toBeGreaterThan(0);
  });
});
