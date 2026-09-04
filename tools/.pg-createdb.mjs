// 建库 family_menu（zonky 精简包无 createdb/psql，用 node pg 驱动替代）
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')

const PORT = 54329
const DB = 'family_menu'
const base = { host: '127.0.0.1', port: PORT, user: 'postgres' }

async function main() {
  // 1. 连 postgres 库检查目标库是否存在
  const c0 = new Client({ ...base, database: 'postgres' })
  await c0.connect()
  const r = await c0.query(
    `SELECT datname FROM pg_database WHERE datname = $1`,
    [DB]
  )
  if (r.rowCount === 0) {
    // CREATE DATABASE 不能在事务/参数化中执行，直接拼接（库名为常量）
    await c0.query(`CREATE DATABASE ${DB}`)
    console.log(`CREATE DATABASE ${DB} -> OK`)
  } else {
    console.log(`数据库 ${DB} 已存在，跳过`)
  }
  await c0.end()

  // 2. 连目标库校验
  const c1 = new Client({ ...base, database: DB })
  await c1.connect()
  const v = await c1.query('SELECT version() AS v, current_database() AS db')
  console.log('version:', v.rows[0].v)
  console.log('database:', v.rows[0].db)
  await c1.end()
  console.log('DONE: family_menu 就绪 (127.0.0.1:' + PORT + ')')
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
