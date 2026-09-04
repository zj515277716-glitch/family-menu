// PG 便攜版获取：阿里云 maven 镜像下载 zonky binaries jar（zip）→ tar 解 zip → tar 解 txz（临时脚本）
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, statSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const JAR_URL = 'https://maven.aliyun.com/repository/central/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/17.5.0/embedded-postgres-binaries-windows-amd64-17.5.0.jar';
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

function sh(cmd, args, opts = {}) {
  console.log('>', cmd, args.join(' '));
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// 1. 下载 jar（zip 格式，内含 txz）
if (!existsSync('.pg/zonky.jar') || statSync('.pg/zonky.jar').size < 20_000_000) {
  const res = await fetch(JAR_URL);
  if (!res.ok || !res.body) { console.error('HTTP', res.status); process.exit(1); }
  await pipeline(Readable.fromWeb(res.body), createWriteStream('.pg/zonky.jar'));
}
console.log('jar bytes =', statSync('.pg/zonky.jar').size);

// 2. 解 jar（bsdtar 支持 zip）
if (!existsSync('.pg/txz/postgres-windows-x86_64.txz')) {
  rmSync('.pg/txz', { recursive: true, force: true });
  mkdirSync('.pg/txz', { recursive: true });
  sh(TAR, ['-xf', 'zonky.jar', '-C', 'txz'], { cwd: '.pg' });
}
console.log('txz dir:', readdirSync('.pg/txz'));

// 3. 解 txz（xz）→ pgsql/
if (!existsSync('.pg/pgsql/bin/initdb.exe')) {
  const txz = readdirSync('.pg/txz').find(f => f.endsWith('.txz'));
  if (!txz) { console.error('no txz found'); process.exit(1); }
  sh(TAR, ['-xJf', `txz/${txz}`], { cwd: '.pg' });
}
console.log('initdb exists:', existsSync('.pg/pgsql/bin/initdb.exe'));
console.log('postgres exists:', existsSync('.pg/pgsql/bin/postgres.exe'));
