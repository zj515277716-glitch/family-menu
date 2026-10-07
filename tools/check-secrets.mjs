// check:secrets —— git 跟踪文件的口令泄漏检查（pnpm check:secrets，零依赖）
//
// 检测规则：
//   1. known-token-pattern：本项目口令命名模式（family-menu-local-<数字>），匹配任意年份后缀，
//      防同类命名再次入库。此处写的是模式而非具体口令值（旧值已存在于 git 历史中，
//      是否重写历史不改变该事实，故本脚本不含旧值明文、不构成新泄密面）。
//   2. cred-literal：常见凭据名（token/password/secret/api_key 等）的带引号字面量赋值；
//      值含 test/mock/dummy 等假值词的测试桩不算（如 'test-token'）。
//   3. high-entropy-literal：带引号 ≥24 位高熵串——长 hex（≥32）或大小写/数字三字符集齐全；
//      纯校验和键行（md5/sha/hash/checksum 等）与 cuid/主键形态豁免（非机密）。
//
// 范围与豁免：
//   - 只扫 `git ls-files` 列出的已跟踪文本文件；.env 类文件不入库，天然在扫描之外。
//   - 构建产物目录（dist 等）无口令来源且打包后字符表类常量误报多，豁免（红线本就禁提交产物）。
//   - 行尾含 `secrets:ignore` 注记的行豁免（本脚本自身正则行防自命中用）；
//     真实口令若写在带注记的行上会被漏检，注记只用于正则/样例行，勿滥用。
//
// 退出码：0 = 0 命中；1 = 有命中。命中只打印位置与规则，不打印行内容（避免口令二次泄漏进终端/日志）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const KNOWN_TOKEN_RE = /family-menu-local-\d{4}/;
const CRED_RE = /(?:access_?token|password|passwd|secret|api[_-]?key)\s*[:=]\s*['"]([^'"\s]{8,})['"]/i;
const CRED_FAKE_RE = /test|mock|fake|dummy|sample|example|placeholder|wrong|invalid|expired|changeme|your[_-]?|xxx|<[^>]*>|\$\{/i;
const ENTROPY_CAND_RE = /['"]([A-Za-z0-9+/_=-]{24,})['"]/g;
const HASH_KEY_RE = /(?:md5|sha-?\d{3,4}|sha\d{1,3}|hash|checksum|digest|etag|integrity|dedupkey?)\b"?\s*[:=]/i;

function highEntropy(s) {
  if (s.length < 24) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(s)) return true;
  const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((re) => re.test(s)).length;
  return classes === 3;
}

function matchLine(line) {
  if (KNOWN_TOKEN_RE.test(line)) return 'known-token-pattern';
  let m = CRED_RE.exec(line);
  if (m && !CRED_FAKE_RE.test(m[1])) return 'cred-literal';
  if (!HASH_KEY_RE.test(line)) {
    ENTROPY_CAND_RE.lastIndex = 0;
    while ((m = ENTROPY_CAND_RE.exec(line)) !== null) {
      if (highEntropy(m[1])) return 'high-entropy-literal';
    }
  }
  return null;
}

const SKIP_PATH = /(^|\/)(dist|node_modules|\.taro|coverage)\//;
const SKIP_EXT = /\.(png|jpe?g|webp|gif|ico|bmp|woff2?|ttf|eot|otf|mp3|mp4|mov|pdf|zip|gz|tgz|bz2|7z|sqlite3?|db|wasm)$/i;

let files = [];
try {
  files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
} catch (e) {
  console.error(`check:secrets: 无法获取 git 跟踪文件清单：${e.message}`);
  process.exit(1);
}

let scanned = 0;
const hits = [];
for (const f of files) {
  if (SKIP_PATH.test(f) || SKIP_EXT.test(f)) continue;
  let content;
  try {
    content = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('secrets:ignore')) continue;
    const rule = matchLine(lines[i]);
    if (rule) hits.push({ file: f, line: i + 1, rule });
  }
}

if (hits.length > 0) {
  console.error(`check:secrets: ${hits.length} 处命中（扫描 ${scanned} 个 git 跟踪文本文件）；明细如下（不打印行内容，防二次泄漏）：`);
  for (const h of hits) console.error(`[HIT] ${h.file}:${h.line} [${h.rule}]`);
  process.exit(1);
}
console.log(`check:secrets: 0 命中（扫描 ${scanned} 个 git 跟踪文本文件）`);
process.exit(0);
