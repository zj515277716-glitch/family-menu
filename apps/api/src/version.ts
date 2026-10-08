// apps/api/src/version.ts
// 版本口径：仓库根 VERSION 文件为人工可读版本（产品负责人维护），
// GIT_COMMIT 由 Docker build arg 注入（本地 dev 未注入）；/health 展示 <VERSION>+<短哈希>。
// 设计约束：VERSION 读不到兜底 'unknown'，任何路径都不得抛错——compose healthcheck 依赖 /health 恒 200。

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/ 与 dist/ 上溯三级均为仓库根（apps/api/{src,dist} → apps/api → apps → 根），构建前后口径一致
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 组装展示版本：GIT_COMMIT 缺省（本地 dev）只显示文件版本；空文件版本视为 unknown */
export function composeVersion(fileVersion: string, gitCommit?: string): string {
  const base = fileVersion.trim() || 'unknown';
  const commit = (gitCommit ?? '').trim();
  return commit ? `${base}+${commit}` : base;
}

/** VERSION 候选路径：模块位置优先（进程 cwd 可能是 apps/api），退化 process.cwd() 两种深度 */
export function versionFileCandidates(fromDir: string): string[] {
  return [
    path.resolve(fromDir, '../../../VERSION'),
    path.resolve(process.cwd(), 'VERSION'),
    path.resolve(process.cwd(), '../../VERSION'),
  ];
}

/** 找到第一个存在的 VERSION 文件；都不存在返回 null（不抛错） */
export function findVersionFile(fromDir: string = MODULE_DIR): string | null {
  for (const p of versionFileCandidates(fromDir)) {
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      // 候选不存在属预期，继续下一个
    }
  }
  return null;
}

/** 读 VERSION 文件内容（trim）；路径缺失/读取失败/空内容一律 'unknown' */
export function readFileVersion(fromDir: string = MODULE_DIR): string {
  const p = findVersionFile(fromDir);
  if (p === null) return 'unknown';
  try {
    return readFileSync(p, 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** /health 用：文件版本 + GIT_COMMIT 后缀；整体不抛错 */
export function getVersion(): string {
  return composeVersion(readFileVersion(), process.env.GIT_COMMIT);
}
