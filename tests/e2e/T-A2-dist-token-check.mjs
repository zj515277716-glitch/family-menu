// tests/e2e/T-A2-dist-token-check.mjs
// T-A2（AC1/AC4）：口令零暴露检查——h5 源码与生产构建产物均不得含口令/token 常量。
// 期望口令来源：apps/h5/.env.production 的 TARO_APP_ACCESS_TOKEN（构建机本机文件，不入库）；
// 取不到时回退进程环境 FM_A2_CANARY_TOKEN。口令值只用于匹配，绝不打印。
// 顺带核对系统不变量（规则第 7 节）：生产构建产物不含本机地址 127.0.0.1。
// 运行：node tests/e2e/T-A2-dist-token-check.mjs（内部会真实执行一次 h5 生产构建，约 1-3 分钟）
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const srcDir = join(root, 'apps', 'h5', 'src')
const distDir = join(root, 'apps', 'h5', 'dist')

let failed = false
function fail(msg) {
  failed = true
  console.error('FAIL:', msg)
}
function pass(msg) {
  console.log('PASS:', msg)
}

/** 递归列出目录下所有文件 */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** 口令打码：只露前 2 位与长度，證明命中的同时不外泄 */
function mask(s) {
  return `${s.slice(0, 2)}***（长度 ${s.length}）`
}

/** 在目录全部文件中数字面包式匹配 needle，返回命中清单（文件名 + 次数） */
function grepValue(dir, needle) {
  const hits = []
  for (const f of walk(dir)) {
    let text
    try {
      text = readFileSync(f, 'utf8')
    } catch {
      continue // 二进制/不可读文件跳过
    }
    const count = text.split(needle).length - 1
    if (count > 0) hits.push(`${relative(root, f)} ×${count}`)
  }
  return hits
}

function resolveToken() {
  const envFile = join(root, 'apps', 'h5', '.env.production')
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^TARO_APP_ACCESS_TOKEN=(.*)$/m)
    if (m && m[1].trim()) return m[1].trim()
  }
  const canary = process.env.FM_A2_CANARY_TOKEN
  if (canary) return canary
  return null
}

// ───── 1. h5 源码静态检查：不得出现 access_token / ACCESS_TOKEN / access-token 字样 ─────
const TOKEN_LITERAL = /access[_-]?token/i
const srcHits = []
for (const f of walk(srcDir)) {
  const text = readFileSync(f, 'utf8')
  text.split(/\r?\n/).forEach((line, i) => {
    if (TOKEN_LITERAL.test(line)) srcHits.push(`${relative(root, f)}:${i + 1}`)
  })
}
if (srcHits.length > 0) {
  fail(`h5 源码仍含 token 常量引用：${srcHits.join(' , ')}`)
} else {
  pass('h5 源码 grep token 常量 0 命中')
}

// ───── 2. 生产构建（真实构建，读 apps/h5/.env.production 注入） ─────
console.log('… 执行 h5 生产构建（pnpm --filter @family-menu/h5 build:h5），约 1-3 分钟')
const build = spawnSync('pnpm --filter @family-menu/h5 build:h5', {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
})
const buildOut = `${build.stdout ?? ''}${build.stderr ?? ''}`
if (build.error || build.status !== 0) {
  fail('h5 生产构建失败（输出末尾 30 行见下）')
  console.error(buildOut.split('\n').slice(-30).join('\n'))
  process.exit(1)
}
pass('h5 生产构建成功')

// ───── 3. 产物 grep：口令 0 命中；本机地址 0 命中 ─────
const token = resolveToken()
if (!token) {
  fail('无法确定期望口令：apps/h5/.env.production 缺 TARO_APP_ACCESS_TOKEN 且未提供 FM_A2_CANARY_TOKEN')
} else {
  const tokenHits = grepValue(distDir, token)
  if (tokenHits.length > 0) {
    fail(`产物命中口令 ${mask(token)}：${tokenHits.join(' , ')}`)
  } else {
    pass(`产物 grep 口令 ${mask(token)} 0 命中`)
  }
}
const localHits = grepValue(distDir, '127.0.0.1')
if (localHits.length > 0) {
  fail(`产物命中本机地址 127.0.0.1：${localHits.join(' , ')}`)
} else {
  pass('产物 grep 本机地址 127.0.0.1 0 命中')
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
process.exit(failed ? 1 : 0)
