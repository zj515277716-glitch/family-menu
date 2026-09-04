// 初始化并启动本机便携版 PostgreSQL（临时脚本）
// 流程：initdb（幂等）→ pg_ctl 启动（端口 54329）→ createdb family_menu → 版本校验
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PG = path.resolve('.pg')
const BIN = path.join(PG, 'bin')
const DATA = path.join(PG, 'data')
const PORT = 54329
const DB = 'family_menu'

function sh(exe, args, opts = {}) {
  const r = execFileSync(exe, args, {
    cwd: PG,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  })
  return (r || '').trim()
}

// pg_ctl start 会拉起常驻的 postgres，若给它接管道，postgres 会持有
// 管道写端导致 execFileSync 永远等不到 EOF——必须用 stdio 'ignore'
function runDetached(exe, args, label) {
  console.log(`\n>>> ${label}: ${path.basename(exe)} ${args.join(' ')}`)
  try {
    execFileSync(exe, args, { cwd: PG, encoding: 'utf8', stdio: 'ignore' })
    return true
  } catch (e) {
    console.error(`FAILED (code ${e.status}): ${e.message}`)
    return false
  }
}

const initdb = path.join(BIN, 'initdb.exe')
const pgctl = path.join(BIN, 'pg_ctl.exe')
const createdb = path.join(BIN, 'createdb.exe')
const psql = path.join(BIN, 'psql.exe')

// 1. initdb（幂等：已有数据目录则跳过）
if (fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
  console.log('== 数据目录已存在（PG_VERSION 存在），跳过 initdb ==')
} else {
  if (
    !runDetached(
      initdb,
      ['-D', DATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'],
      'initdb'
    )
  ) {
    process.exit(1)
  }
}

// 2. 启动（幂等：已在运行则跳过；pg_ctl status 退出码 3 = 未运行，属正常）
let status = ''
try {
  status = sh(pgctl, ['-D', DATA, 'status'])
} catch (e) {
  status = `not-running (exit ${e.status})`
}
console.log('\n== pg_ctl status ==\n' + (status || '(no output)'))
if (status.includes('server is running')) {
  console.log('== 服务器已在运行，跳过启动 ==')
} else {
  if (
    !runDetached(
      pgctl,
      ['-D', DATA, '-o', `-p ${PORT}`, '-l', path.join(PG, 'pg.log'), '-w', 'start'],
      'pg_ctl start'
    )
  ) {
    console.error(fs.readFileSync(path.join(PG, 'pg.log'), 'utf8').slice(-2000))
    process.exit(1)
  }
}

// 3. 建库（幂等）
const exists = sh(psql, [
  '-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', 'postgres',
  '-Atc', `SELECT 1 FROM pg_database WHERE datname='${DB}'`,
])
if (exists === '1') {
  console.log(`== 数据库 ${DB} 已存在，跳过 createdb ==`)
} else {
  if (!runDetached(createdb, ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', DB], 'createdb')) {
    process.exit(1)
  }
}

// 4. 校验
const ver = sh(psql, [
  '-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', DB,
  '-Atc', 'SELECT version()',
])
console.log('\n== 校验 ==\n' + ver)
console.log('\nDONE: PostgreSQL 已就绪 (127.0.0.1:' + PORT + '/' + DB + ')')
