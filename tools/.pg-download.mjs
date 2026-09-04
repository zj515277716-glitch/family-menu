// PostgreSQL 便攜版下载（node fetch 流式，临时脚本）
import { createWriteStream, mkdirSync, existsSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const URL_ = process.argv[2];
const OUT = process.argv[3];
if (!URL_ || !OUT) { console.error('usage: node .pg-download.mjs <url> <out>'); process.exit(2); }

mkdirSync('.pg', { recursive: true });
if (existsSync(OUT) && statSync(OUT).size > 100_000_000) {
  console.log('already downloaded:', statSync(OUT).size, 'bytes'); process.exit(0);
}

console.log('downloading to', OUT);
const res = await fetch(URL_, { redirect: 'follow' });
if (!res.ok || !res.body) { console.error('HTTP', res.status); process.exit(1); }
const total = Number(res.headers.get('content-length') || 0);
console.log('content-length:', total);

let done = 0, lastPct = -10;
const t0 = Date.now();
const counted = new Readable({ async read() {} }); // not used; simpler: manual pump
await pipeline(Readable.fromWeb(res.body), async function* (src) {
  const out = createWriteStream(OUT);
  for await (const chunk of src) {
    done += chunk.length;
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (pct >= lastPct + 10) { lastPct = pct; console.log(`${pct}% ${(done / 1048576).toFixed(0)}MB ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
    if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
  }
  out.end();
  await new Promise(r => out.on('close', r));
});
console.log('DONE bytes=', statSync(OUT).size);
