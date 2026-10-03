// tests/e2e/lib/env-token.mjs
// 本地联调用：取 Playwright 要输入的家庭口令。
// 来源优先级：进程环境 FM_ACCESS_TOKEN / ACCESS_TOKEN → 根 .env 的 ACCESS_TOKEN（本机文件，不入库）。
// 口令只进内存用于填表，绝不打印、绝不写任何文件。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

export function loadLocalToken() {
  const fromEnv = process.env.FM_ACCESS_TOKEN || process.env.ACCESS_TOKEN
  if (fromEnv) return fromEnv
  const envFile = join(root, '.env')
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^ACCESS_TOKEN=(.*)$/m)
    if (m && m[1].trim()) return m[1].trim()
  }
  return null
}

export function requireLocalToken() {
  const t = loadLocalToken()
  if (!t) {
    console.error('FAIL: 未找到本地联调口令（根 .env 的 ACCESS_TOKEN 或 FM_ACCESS_TOKEN）')
    process.exit(2)
  }
  return t
}
