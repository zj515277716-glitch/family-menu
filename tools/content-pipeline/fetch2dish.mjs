#!/usr/bin/env node
/**
 * fetch2dish.mjs — 试采 fetch.json → fm-import 输入形状 Dish JSON（T-C03）
 *
 * 职责：
 *   1. 读 out/xhs/<noteId>.fetch.json（xhs-fetch.mjs 产物，只读输入）
 *   2. 图片落 API 静态目录：apps/api/static/images/dishes/<noteId>/<i><ext>
 *      扩展名归一（C-2 处置）：新下载按响应 Content-Type；本地已有文件按魔数
 *      （RIFF..WEBP→.webp / FFD8FF→.jpg / 89504E47→.png / GIF8→.gif）；兜底 URL 后缀→.jpg
 *   3. 产出 fm-import 输入形状 JSON（Dish + ingredients），写入 out/xhs/<noteId>.dish.json
 *      - name：标题清洗（取「｜」前主名，截断 30 字）
 *      - steps：从正文 desc 生成初稿（去话题标签后按句切分；无正文时落单个
 *        「待人工微调」占位步骤——不虚构内容，人工微调是质量总闸门）
 *      - ingredients：[]（试采笔记正文不含文字用料；不伪造数据，待人工补齐）
 *      - imageUrl/sourceUrl/sourceSite：回填三新字段；imageUrl=<--base-url>/images/dishes/<noteId>/0<ext>
 *      - status=DRAFT / origin=FETCHED（声明值；实际入库以 fm-import --origin FETCHED 显式授权为准，
 *        不传授权参数时 fm-import 仍强制 LLM_DRAFT——双保险默认路径不削弱）
 *
 * 用法：
 *   node fetch2dish.mjs <fetch.json> [--base-url http://127.0.0.1:3000]
 *        [--static-root apps/api/static/images] [--out <path>] [--max-images 3]
 *        [--redownload] [--meal-role MAIN] [--active-minutes 15] [--total-minutes 30]
 *
 * 退出码：0 成功；1 文件/环境错误；2 fetch.json 缺必填字段（容错停手）
 *
 * 依赖：仅 Node 原生能力（fs/path/fetch），零新增 npm 依赖。
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url)); // tools/content-pipeline
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');          // 仓库根
const DEFAULT_STATIC_ROOT = path.join(REPO_ROOT, 'apps/api/static/images');
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);

/** 带 code 的业务错误（缺字段=MISSING_FIELDS → exit 2） */
export class Fetch2DishError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'Fetch2DishError';
    this.code = code || 'ERROR';
  }
}

// ───── 扩展名归一（AC4 / C-2 处置）─────

const CT_EXT_MAP = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
};

/** 图片魔数 → 扩展名（Content-Type 不可得时的地面真值，如本地已有文件） */
function extFromMagic(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // WEBP：52 49 46 46 ?? ?? ?? ?? 57 45 42 50（RIFF....WEBP）
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  // JPEG：FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  // PNG：89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png';
  // GIF：47 49 46 38（GIF8）
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return '.gif';
  return null;
}

/**
 * 归一图片扩展名。
 * 优先级：响应 Content-Type（AC4 字面要求，新下载场景）→ 文件魔数（本地文件场景）
 *        → URL 后缀 → '.jpg' 兜底。
 * @returns {string} 形如 '.webp' / '.jpg' / '.png' / '.gif'
 */
export function normalizeImageExt({ bytes, contentType, url }) {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  if (CT_EXT_MAP[ct]) return CT_EXT_MAP[ct];
  const byMagic = extFromMagic(bytes);
  if (byMagic) return byMagic;
  const m = String(url || '').match(/\.(jpe?g|png|webp|gif)(?:[?!]|$)/i);
  if (m) return '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
  return '.jpg';
}

// ───── 转换规则（AC2）─────

/** 路径段净化：只留安全字符，防路径穿越（noteId 用作目录名） */
export function sanitizePathSegment(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/** 标题清洗为菜名初稿：取「｜」前主名（全角/半角），压缩空白，截断 30 字 */
export function cleanDishName(title) {
  let t = String(title || '').trim().replace(/\s+/g, ' ');
  const parts = t.split(/[｜|]/);
  const head = (parts[0] || '').trim();
  if (head.length >= 2) t = head;
  if (t.length > 30) t = t.slice(0, 30);
  return t;
}

/** 去小红书话题标签（#xx[话题]#）与链接，压空白 */
function stripTags(desc) {
  return String(desc || '')
    .replace(/#[^#]*?\[话题\]#/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从正文 desc 生成 steps 初稿：
 * - 清洗后有内容：按句读（。！？；;）切分，编号为 steps（最多 20 步）；
 * - 清洗后为空（试采笔记即此类）：落单个「待人工微调」占位步骤，不虚构做法。
 */
export function buildStepsFromDesc(desc) {
  const cleaned = stripTags(desc);
  if (!cleaned) {
    return [{
      order: 1,
      text: '【初稿·待人工微调】原笔记正文仅含话题标签/无文字做法；请依据笔记图片整理用料与步骤后替换本步骤。',
    }];
  }
  const sentences = cleaned
    .split(/(?<=[。！？；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = sentences.length > 0 ? sentences : [cleaned];
  return parts.slice(0, 20).map((text, i) => ({ order: i + 1, text }));
}

/**
 * fetch.json 必填字段校验（缺字段容错：收集后一次性报错）。
 * 必填：noteId / sourceSite / sourceUrl / title；desc 与图片缺省可容忍（占位步骤 / imageUrl 省略）。
 */
function requireFetchFields(fetchObj) {
  const missing = [];
  if (!fetchObj || typeof fetchObj !== 'object') throw new Fetch2DishError('fetch.json 内容不是 JSON 对象', 'MISSING_FIELDS');
  for (const k of ['noteId', 'sourceSite', 'sourceUrl', 'title']) {
    const v = fetchObj[k];
    if (v === undefined || v === null || String(v).trim() === '') missing.push(k);
  }
  if (missing.length > 0) {
    throw new Fetch2DishError(`fetch.json 缺必填字段：${missing.join(', ')}`, 'MISSING_FIELDS');
  }
  const noteId = String(fetchObj.noteId).trim();
  if (sanitizePathSegment(noteId) !== noteId || noteId.length === 0) {
    throw new Fetch2DishError(`noteId 含不安全字符（净化后不一致）：${JSON.stringify(noteId)}`, 'MISSING_FIELDS');
  }
  return noteId;
}

/**
 * 核心转换：fetch.json 对象 → fm-import 输入形状 Dish JSON（纯函数，可单测）。
 * @param fetchObj xhs-fetch.mjs 产物对象
 * @param opts.baseUrl      图片 URL 前缀（默认 http://127.0.0.1:3000）
 * @param opts.firstImageExt 首图归一后扩展名（如 '.webp'；null/undefined → 省略 imageUrl）
 * @param opts.mealRole/cuisine/flavorTags/spicyLevel/splitFlavor/activeMinutes/totalMinutes/equipment 默认字段（可覆盖）
 */
export function buildDishFromFetch(fetchObj, opts = {}) {
  const noteId = requireFetchFields(fetchObj);
  const baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const firstImageExt = opts.firstImageExt || null;
  const firstImageIndex = Number.isInteger(opts.firstImageIndex) && opts.firstImageIndex >= 0 ? opts.firstImageIndex : 0;

  const imageUrl = firstImageExt
    ? `${baseUrl}/images/dishes/${noteId}/${firstImageIndex}${firstImageExt}`
    : undefined;

  const authorNick = (fetchObj.author && fetchObj.author.nickname) || '未知作者';

  return {
    id: `fetch2dish-${noteId}`, // 临时 id 过校验，DB 生成真实 id
    name: cleanDishName(fetchObj.title),
    mealRole: opts.mealRole || 'MAIN',
    cuisine: opts.cuisine || '家常',
    flavorTags: opts.flavorTags || ['家常'],
    spicyLevel: opts.spicyLevel ?? 0,
    splitFlavor: opts.splitFlavor ?? false,
    activeMinutes: opts.activeMinutes ?? 15,
    totalMinutes: opts.totalMinutes ?? 30,
    equipment: opts.equipment || ['wok'],
    steps: buildStepsFromDesc(fetchObj.desc),
    status: 'DRAFT', // 声明值；入库以 fm-import --origin FETCHED 显式授权为准
    origin: 'FETCHED', // 声明值；不传授权参数时 fm-import 仍强制 LLM_DRAFT
    // 三新字段（T-C01）：sourceUrl/sourceSite 与 fetch.json 逐字一致；imageUrl 指向本服务静态目录
    ...(imageUrl ? { imageUrl } : {}),
    sourceUrl: fetchObj.sourceUrl,
    sourceSite: fetchObj.sourceSite,
    licenseNote: `FETCHED 自${fetchObj.sourceSite}笔记 ${noteId}（作者 ${authorNick}）；原帖内容仅作初稿未改编；正文无文字用料，ingredients 留空待人工微调后走 TESTED→PUBLISHED 流程。`,
    ingredients: [], // 试采笔记正文不含文字用料；不伪造数据，人工微调时补齐
  };
}

// ───── 图片落静态目录（AC4）─────

/**
 * 把 fetch.json 对应图片放入 API 静态目录，返回落盘清单。
 * - 本地已有文件（downloadedImages[i].file，相对 fetchDir）：读字节 → 魔数归一扩展名 → 复制；
 * - 本地缺失：按 imageUrls[i] 真实下载（带 UA/Referer）→ 响应 Content-Type 归一扩展名 → 写入；
 * - 单图失败不中断（记录 error）；全部成功与否由调用方按 placed 判断。
 *
 * @returns {Promise<Array<{index,url,destAbs,destRel,bytes,ext,via}>>} via: 'local-magic'|'download-content-type'
 */
export async function placeImages(fetchObj, opts = {}) {
  const noteId = requireFetchFields(fetchObj);
  const fetchDir = opts.fetchDir || path.dirname(opts.fetchJsonPath || '.');
  const staticRoot = opts.staticRoot || DEFAULT_STATIC_ROOT;
  const maxImages = opts.maxImages ?? 3;

  const destDir = path.join(staticRoot, 'dishes', noteId);
  mkdirSync(destDir, { recursive: true });

  // 候选清单：优先 downloadedImages（含本地文件名），否则取 imageUrls 前 N 张
  let candidates = [];
  if (Array.isArray(fetchObj.downloadedImages) && fetchObj.downloadedImages.length > 0) {
    candidates = fetchObj.downloadedImages
      .filter(Boolean)
      .slice(0, maxImages)
      .map((d) => ({ index: d.index, url: d.url, file: d.file || null }));
  } else if (Array.isArray(fetchObj.imageUrls)) {
    candidates = fetchObj.imageUrls.slice(0, maxImages).map((u, i) => ({ index: i, url: u, file: null }));
  }

  const placed = [];
  for (const c of candidates) {
    try {
      let bytes = null;
      let contentType = null;
      let via = '';
      const localPath = c.file ? path.join(fetchDir, c.file) : null;
      if (localPath && existsSync(localPath) && !opts.redownload) {
        bytes = readFileSync(localPath);
        via = 'local-magic'; // C-2 处置：本地文件按魔数归一（试采产物后缀 .jpg 实为 WEBP）
      } else if (c.url) {
        const res = await fetch(c.url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.xiaohongshu.com/' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        bytes = Buffer.from(await res.arrayBuffer());
        contentType = res.headers.get('content-type');
        via = 'download-content-type'; // AC4：新下载按响应 Content-Type 归一
      } else {
        throw new Error('本地文件缺失且无 URL');
      }
      if (!bytes || bytes.length === 0) throw new Error('空字节');
      const ext = normalizeImageExt({ bytes, contentType, url: c.url });
      const destAbs = path.join(destDir, `${c.index}${ext}`);
      if (via === 'local-magic') copyFileSync(localPath, destAbs);
      else writeFileSync(destAbs, bytes);
      placed.push({
        index: c.index,
        url: c.url,
        destAbs,
        destRel: `dishes/${noteId}/${c.index}${ext}`,
        bytes: bytes.length,
        ext,
        via,
      });
    } catch (e) {
      log(`图片[${c.index}] 落盘失败（继续）：`, e.message);
    }
  }
  return placed;
}

// ───── CLI ─────

function parseArgs(argv) {
  const a = {
    fetchJson: null, baseUrl: DEFAULT_BASE_URL, staticRoot: DEFAULT_STATIC_ROOT,
    out: null, maxImages: 3, redownload: false,
    mealRole: 'MAIN', activeMinutes: 15, totalMinutes: 30,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base-url') a.baseUrl = argv[++i];
    else if (k === '--static-root') a.staticRoot = path.resolve(argv[++i]);
    else if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--max-images') a.maxImages = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (k === '--redownload') a.redownload = true;
    else if (k === '--meal-role') a.mealRole = argv[++i];
    else if (k === '--active-minutes') a.activeMinutes = parseInt(argv[++i], 10) || 15;
    else if (k === '--total-minutes') a.totalMinutes = parseInt(argv[++i], 10) || 30;
    else if (!k.startsWith('--') && !a.fetchJson) a.fetchJson = k;
  }
  return a;
}

export async function main(argv) {
  const args = parseArgs(argv);
  if (!args.fetchJson) {
    console.error('用法：node fetch2dish.mjs <fetch.json> [--base-url ...] [--static-root ...] [--out ...] [--max-images 3] [--redownload]');
    process.exit(1);
  }
  if (!existsSync(args.fetchJson)) {
    console.error(`fetch.json 不存在：${args.fetchJson}`);
    process.exit(1);
  }
  let fetchObj;
  try {
    fetchObj = JSON.parse(readFileSync(args.fetchJson, 'utf-8'));
  } catch (e) {
    console.error('fetch.json 解析失败：', e.message);
    process.exit(1);
  }

  const fetchDir = path.dirname(path.resolve(args.fetchJson));

  // 1. 图片落静态目录
  const placed = await placeImages(fetchObj, {
    fetchJsonPath: args.fetchJson,
    fetchDir,
    staticRoot: args.staticRoot,
    maxImages: args.maxImages,
    redownload: args.redownload,
  });
  log(`图片落静态目录：${placed.length} 张`);
  for (const p of placed) log(`  [${p.index}] ${p.destRel} ${p.bytes}B via=${p.via}`);

  // 2. 转换（首图扩展名来自落盘结果；无图则省略 imageUrl）
  let dish;
  try {
    dish = buildDishFromFetch(fetchObj, {
      baseUrl: args.baseUrl,
      firstImageExt: placed.length > 0 ? placed[0].ext : null,
      mealRole: args.mealRole,
      activeMinutes: args.activeMinutes,
      totalMinutes: args.totalMinutes,
    });
  } catch (e) {
    if (e instanceof Fetch2DishError && e.code === 'MISSING_FIELDS') {
      console.error('缺字段容错停手：', e.message);
      process.exit(2);
    }
    throw e;
  }

  // 3. 写产出 JSON（fm-import 输入形状）
  const noteId = String(fetchObj.noteId).trim();
  const outPath = args.out || path.join(fetchDir, `${noteId}.dish.json`);
  writeFileSync(outPath, JSON.stringify(dish, null, 2), 'utf-8');
  log('Dish JSON 已产出：', outPath, Buffer.byteLength(JSON.stringify(dish, null, 2)) + ' bytes');

  const summary = {
    exit: 0,
    noteId,
    dishJson: outPath,
    dishJsonBytes: Buffer.byteLength(JSON.stringify(dish, null, 2)),
    name: dish.name,
    stepsCount: dish.steps.length,
    ingredientsCount: dish.ingredients.length,
    imageUrl: dish.imageUrl || null,
    sourceUrl: dish.sourceUrl,
    sourceSite: dish.sourceSite,
    placedImages: placed.map((p) => ({ index: p.index, destRel: p.destRel, bytes: p.bytes, ext: p.ext, via: p.via })),
    staticRoot: args.staticRoot,
  };
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

/* istanbul ignore next */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error('FATAL:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
