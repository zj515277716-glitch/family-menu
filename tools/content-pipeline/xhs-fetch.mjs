#!/usr/bin/env node
/**
 * xhs-fetch.mjs — 小红书 CDP 采集脚本（T-C02 试采验证）
 *
 * 原理：复用本机 127.0.0.1:9222 已登录 Edge 会话（CDP），不新开登录流程。
 * 流程：GET /json 枚举 tab → 连接 xiaohongshu page 的 webSocketDebuggerUrl
 *      → AC2 登录态验证（导航 explore，URL 不含 /login，截图存证）
 *      → 搜索/发现流提取笔记候选（__INITIAL_STATE__ 优先，DOM 兜底）
 *      → 导航到笔记详情（xsec_token 链接）→ 提取 note（noteDetailMap）
 *      → 落 out/xhs/<noteId>.fetch.json（内部扩展字段格式，不入库）
 *      → 下载图片到 out/xhs/images/（Node fetch 直下，失败走页面内 fetch）
 *      → 详情页截图存证 .workflow-verify/tp-c02/
 *
 * 纪律（AC5/AC8）：不关浏览器、不清 cookie/localStorage、不登出；
 * 页面导航动作间隔 >=5s；登录失效/验证码 → 截图停手；连续 2 次采集失败 → 停手。
 *
 * 依赖：仅 Node 原生能力（global WebSocket / fetch / fs / path），零新增 npm 依赖。
 *
 * 用法：node xhs-fetch.mjs [--keyword 家常菜] [--note-index 0] [--max-images 3] [--url <笔记URL>]
 * 退出码：0 成功；1 环境错误；2 登录失效/需人工处理；3 采集失败（连续 2 次）
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url)); // tools/content-pipeline
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');          // 仓库根
const OUT_DIR = path.join(TOOL_DIR, 'out', 'xhs');
const IMG_DIR = path.join(OUT_DIR, 'images');
const SHOT_DIR = path.join(REPO_ROOT, '.workflow-verify', 'tp-c02');

const CDP_HTTP = 'http://127.0.0.1:9222';
const NAV_GAP_MS = 5300; // AC5：页面导航动作间隔 >=5s（留 300ms 余量）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);

function parseArgs(argv) {
  const a = { keyword: '家常菜', noteIndex: 0, maxImages: 3, url: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--url') a.url = argv[++i];
    else if (k === '--keyword') a.keyword = argv[++i];
    else if (k === '--note-index') a.noteIndex = parseInt(argv[++i], 10) || 0;
    else if (k === '--max-images') a.maxImages = Math.max(1, parseInt(argv[++i], 10) || 1);
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 最小 CDP page 客户端（原生 WebSocket） */
class CdpPage {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map(); this.evListeners = new Map();
    this._bind();
  }

  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error('WS connect timeout: ' + wsUrl)), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(new CdpPage(ws)); });
      ws.addEventListener('error', (e) => { clearTimeout(timer); reject(new Error('WS error: ' + (e.message || 'unknown'))); });
    });
  }

  _bind() {
    this.ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`CDP ${msg.error.message || 'error'} (code=${msg.error.code})`));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        const ls = this.evListeners.get(msg.method);
        if (ls) for (const fn of [...ls]) fn(msg.params);
      }
    });
    this.ws.addEventListener('close', () => {
      for (const p of this.pending.values()) p.reject(new Error('WS closed'));
      this.pending.clear();
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 30000, predicate = null) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ls = this.evListeners.get(method);
        if (ls) this.evListeners.set(method, ls.filter((f) => f !== handler));
        reject(new Error('timeout waiting event ' + method));
      }, timeoutMs);
      const handler = (params) => {
        if (predicate && !predicate(params)) return;
        clearTimeout(timer);
        const ls = this.evListeners.get(method);
        if (ls) this.evListeners.set(method, ls.filter((f) => f !== handler));
        resolve(params);
      };
      if (!this.evListeners.has(method)) this.evListeners.set(method, []);
      this.evListeners.get(method).push(handler);
    });
  }

  async navigateAndWait(url, extraWaitMs = 2500) {
    await this.send('Page.enable');
    const loaded = this.waitEvent('Page.loadEventFired', 30000).catch(() => null); // SPA 重定向可能不触发，超时兜底
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(NAV_GAP_MS + extraWaitMs); // AC5：动作间隔 >=5s + 渲染等待
  }

  async evalJson(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, 45000);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('evaluate exception: ' + (d.exception?.description || d.text || JSON.stringify(d)).slice(0, 400));
    }
    return r.result ? r.result.value : undefined;
  }

  async currentUrl() {
    return String(await this.evalJson('location.href'));
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' }, 45000);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  async safeScreenshot(file) {
    try { return await this.screenshot(file); } catch (e) { log('截图失败（继续流程）:', e.message); return null; }
  }

  close() { try { this.ws.close(); } catch { /* noop */ } }
}

/** 枚举 9222 tab，选 xiaohongshu page（优先 /explore） */
async function pickTab() {
  const res = await fetch(CDP_HTTP + '/json');
  if (!res.ok) throw new Error('GET /json HTTP ' + res.status);
  const tabs = await res.json();
  const pages = tabs.filter((t) => t.type === 'page' && (t.url || '').includes('xiaohongshu.com') && t.webSocketDebuggerUrl);
  if (pages.length === 0) return null;
  return pages.find((t) => t.url.includes('/explore')) || pages[0];
}

/** 页面端：提取笔记候选（state 优先，DOM 兜底）。String.raw 保持正则原样下发。 */
const EXPR_CANDIDATES = String.raw`(function(){
  var out = { ok: true, cands: [], sources: [] };
  try {
    var s = window.__INITIAL_STATE__;
    function pushState(notes, src) {
      if (!Array.isArray(notes)) return;
      for (var i = 0; i < notes.length && out.cands.length < 20; i++) {
        var n = notes[i]; if (!n || !n.id) continue;
        var token = n.xsec_token || (n.noteCard && n.noteCard.xsec_token) || '';
        var card = n.noteCard || n;
        var type = card.type || n.type || '';
        if (type === 'video') continue;
        if (!token) continue;
        out.cands.push({ id: n.id, token: token, title: card.displayTitle || n.displayTitle || '', href: '', src: src });
      }
      if (out.cands.length) out.sources.push(src + ':' + out.cands.length);
    }
    if (s && s.search) pushState(s.search.notes, 'state:search');
    if (!out.cands.length && s && s.homeFeed) pushState(s.homeFeed.notes, 'state:homeFeed');
    if (!out.cands.length && s && s.exploreFeed) pushState(s.exploreFeed.notes, 'state:exploreFeed');
    if (!out.cands.length) {
      var anchors = document.querySelectorAll('a[href*="xsec_token"]');
      for (var j = 0; j < anchors.length && out.cands.length < 20; j++) {
        var href = anchors[j].getAttribute('href') || '';
        var m = href.match(/^\/(explore|search_result)\/([0-9a-f]{24})\?/);
        if (!m) continue;
        if (/type=video/.test(href)) continue;
        var token = (href.match(/xsec_token=([^&]+)/) || [])[1] || '';
        if (!token) continue;
        out.cands.push({ id: m[2], token: token, title: (anchors[j].innerText || '').slice(0, 80), href: href, src: 'dom:' + m[1] });
      }
      if (out.cands.length) out.sources.push('dom:' + out.cands.length);
    }
    out.count = out.cands.length;
  } catch (e) { out.ok = false; out.reason = String(e); }
  return JSON.stringify(out);
})()`;

/** 页面端：提取详情 note。快路径 noteDetailMap（explore 详情），兜底全局递归扫描（搜索弹层等结构） */
function buildDetailExpr(noteId) {
  return String.raw`(function(noteId){
  var out = {};
  try {
    var s = window.__INITIAL_STATE__;
    if (!s) { return JSON.stringify({ ok: false, reason: 'no_initial_state' }); }
    var found = null, visited = 0;
    function isHex24(x) { return typeof x === 'string' && x.length === 24 && /^[0-9a-f]{24}$/.test(x); }
    function looksLikeNote(n) {
      return n && typeof n === 'object' && !Array.isArray(n) && isHex24(n.noteId)
        && typeof n.desc === 'string' && Array.isArray(n.imageList) && n.imageList.length >= 0 && (n.title || n.displayTitle || n.desc);
    }
    function walk(o, depth) {
      if (found || depth > 8 || visited > 40000) return;
      if (!o || typeof o !== 'object') return;
      visited++;
      if (looksLikeNote(o)) { found = o; return; }
      if (Array.isArray(o)) { for (var i = 0; i < o.length && !found; i++) walk(o[i], depth + 1); return; }
      var ks = Object.keys(o);
      for (var k = 0; k < ks.length && !found; k++) {
        var v = o[ks[k]];
        if (v && typeof v === 'object') walk(v, depth + 1);
      }
    }
    if (s.noteDetailMap) {
      var e = s.noteDetailMap[noteId];
      if (!e) { var ks2 = Object.keys(s.noteDetailMap); if (ks2.length) e = s.noteDetailMap[ks2[0]]; }
      if (e && (e.note || e.currentNote)) found = e.note || e.currentNote;
    }
    if (!found) walk(s, 0);
    if (!found) { return JSON.stringify({ ok: false, reason: 'note_not_found_anywhere', visited: visited }); }
    var n = found;
    var urls = [];
    var imgs = n.imageList || [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i] || {};
      var u = im.urlDefault || im.url || '';
      if (!u && Array.isArray(im.infoList)) {
        for (var k = 0; k < im.infoList.length; k++) { if (im.infoList[k] && im.infoList[k].url) u = im.infoList[k].url; }
      }
      if (!u) continue;
      if (u.indexOf('//') === 0) u = 'https:' + u;
      if (u.indexOf('http') !== 0) continue;
      if (urls.indexOf(u) < 0) urls.push(u);
    }
    if (!urls.length) {
      var el = document.querySelectorAll('img[src*="xhscdn"], img[src*="sns-webpic"]');
      for (var m = 0; m < el.length; m++) {
        var su = el[m].src || '';
        if (su.indexOf('http') === 0 && urls.indexOf(su) < 0 && su.indexOf('avatar') < 0) urls.push(su);
      }
    }
    var note = {
      noteId: n.noteId || noteId,
      type: n.type || '',
      title: n.title || n.displayTitle || '',
      desc: n.desc || '',
      user: { nickname: (n.user && n.user.nickname) || '', userId: (n.user && (n.user.userId || n.user.id)) || '' },
      time: n.time || 0,
      ipLocation: n.ipLocation || '',
      likedCount: (n.interactInfo && n.interactInfo.likedCount) || '',
      tags: (n.tagList || []).map(function (t) { return t.name; }).slice(0, 20),
      imageUrls: urls
    };
    return JSON.stringify({ ok: true, note: note, via: visited > 0 && s.noteDetailMap ? 'state' : 'walk' });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e) }); }
})('${noteId}')`;
}

function fixImgUrl(u) {
  if (!u) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return u;
}

/** 下载单图：Node fetch 直下（带 UA/Referer）；失败回退页面内 fetch → base64 */
async function downloadImage(cdp, url, file) {
  // 路径 1：Node 原生 fetch
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.xiaohongshu.com/' } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) { writeFileSync(file, buf); return { bytes: buf.length, via: 'node-fetch' }; }
    }
    log('  node-fetch 非常规响应 status=' + res.status + '，回退页面内 fetch');
  } catch (e) { log('  node-fetch 失败：' + e.message + '，回退页面内 fetch'); }

  // 路径 2：页面上下文 fetch → base64（走浏览器网络栈）
  const expr = '(async function(){ try { var r = await fetch(' + JSON.stringify(url) + ', {credentials:"omit"}); '
    + 'if (!r.ok) return JSON.stringify({ok:false,status:r.status}); '
    + 'var b = new Uint8Array(await r.arrayBuffer()); var s=""; var CH=0x8000; '
    + 'for (var i=0;i<b.length;i+=CH){ s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i+CH, b.length))); } '
    + 'return JSON.stringify({ok:true,bytes:b.length,b64:btoa(s)}); } catch(e){ return JSON.stringify({ok:false,reason:String(e)}); } })()';
  const v = JSON.parse(await cdp.evalJson(expr, true));
  if (!v.ok || !v.b64) throw new Error('页面内 fetch 失败: ' + JSON.stringify(v).slice(0, 200));
  const buf = Buffer.from(v.b64, 'base64');
  if (buf.length === 0) throw new Error('页面内 fetch 空内容');
  writeFileSync(file, buf);
  return { bytes: buf.length, via: 'page-fetch' };
}

function extFromUrlOrType(url, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('png')) return '.png';
  const m = url.match(/\.(jpe?g|png|webp)(?:[?!]|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  // AC1：复用现有会话，找已打开的 xiaohongshu page tab
  const tab = await pickTab();
  if (!tab) {
    console.error('未在 /json 中找到 xiaohongshu page tab（浏览器未开或 tab 已关）。请用任务卡恢复命令重启后重试。');
    process.exit(1);
  }
  log('AC1 选中 tab:', tab.id, tab.url);

  const cdp = await CdpPage.connect(tab.webSocketDebuggerUrl);
  log('WS 已连接（复用现有 page target，未新开实例）');

  // AC2：登录态验证
  await cdp.navigateAndWait('https://www.xiaohongshu.com/explore');
  const urlAfterExplore = await cdp.currentUrl();
  log('explore 导航后 URL:', urlAfterExplore);
  if (urlAfterExplore.includes('/login')) {
    const f = path.join(SHOT_DIR, 'login-invalid-' + Date.now() + '.png');
    await cdp.safeScreenshot(f);
    console.error('AC2 FAIL：登录态失效（跳转 /login）。截图：' + f + '。按 AC8 停手，请用户人工处理。');
    cdp.close();
    process.exit(2);
  }
  const shotExplore = await cdp.screenshot(path.join(SHOT_DIR, 'explore-ok-' + Date.now() + '.png'));
  log('AC2 OK，截图:', shotExplore);

  // 提取候选：优先指定 --url，否则搜索（失败回退发现流）
  let candidates = null;
  let entry = '';
  if (args.url) {
    candidates = [{ id: (args.url.match(/\/(?:explore|search_result)\/([0-9a-f]{24})/) || [])[1] || '', token: (args.url.match(/xsec_token=([^&]+)/) || [])[1] || '', title: '', href: args.url.startsWith('http') ? args.url : 'https://www.xiaohongshu.com' + args.url, src: 'cli:--url' }];
    entry = 'url:' + args.url;
  } else {
    const searchUrl = 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(args.keyword) + '&source=web_explore_feed';
    await cdp.navigateAndWait(searchUrl);
    const v1 = JSON.parse(await cdp.evalJson(EXPR_CANDIDATES));
    log('搜索页候选:', v1.count || 0, 'sources=', JSON.stringify(v1.sources || []));
    if (v1.ok && v1.count > 0) { candidates = v1.cands; entry = 'search:' + args.keyword; }

    if (!candidates || candidates.length === 0) {
      // 回退：发现流
      log('搜索页无候选，回退发现流 /explore');
      await cdp.navigateAndWait('https://www.xiaohongshu.com/explore');
      const v2 = JSON.parse(await cdp.evalJson(EXPR_CANDIDATES));
      log('发现流候选:', v2.count || 0);
      if (v2.ok && v2.count > 0) { candidates = v2.cands; entry = 'explore-feed'; }
    }
  }

  if (!candidates || candidates.length === 0) {
    const f = path.join(SHOT_DIR, 'no-candidate-' + Date.now() + '.png');
    await cdp.safeScreenshot(f);
    console.error('未提取到笔记候选（可能风控/页面结构变化）。截图：' + f);
    cdp.close();
    process.exit(3);
  }

  // AC8：连续 2 次详情提取失败 → 停手
  const attemptStart = Math.max(0, args.noteIndex);
  let note = null; let noteUrlUsed = ''; let failures = 0;
  for (let idx = attemptStart; idx < Math.min(candidates.length, attemptStart + 2) && failures < 2; idx++) {
    const c = candidates[idx];
    const noteUrl = c.href
      ? (c.href.startsWith('http') ? c.href : 'https://www.xiaohongshu.com' + c.href)
      : 'https://www.xiaohongshu.com/explore/' + c.id + '?xsec_token=' + c.token + '&xsec_source=pc_feed';
    log(`尝试候选[${idx}] id=${c.id} title=${JSON.stringify(c.title || '')} src=${c.src}`);
    await cdp.navigateAndWait(noteUrl);
    for (let retry = 0; retry < 2 && !note; retry++) {
      if (retry > 0) await sleep(3000); // 渲染慢时补一次
      const cur = await cdp.currentUrl();
      if (cur.includes('/login')) {
        const f = path.join(SHOT_DIR, 'login-invalid-' + Date.now() + '.png');
        await cdp.safeScreenshot(f);
        console.error('详情页跳转 /login，登录态失效。截图：' + f + '（AC8 停手）');
        cdp.close(); process.exit(2);
      }
      const v = JSON.parse(await cdp.evalJson(buildDetailExpr(c.id)));
      if (v.ok) { note = v.note; noteUrlUsed = cur; break; }
      log('  详情提取失败:', JSON.stringify(v).slice(0, 200));
      const f = path.join(SHOT_DIR, 'note-fail-' + c.id + '-' + Date.now() + '.png');
      await cdp.safeScreenshot(f);
      log('  已留证截图:', f);
      note = null;
    }
    if (!note) { failures++; log(`候选[${idx}] 提取失败（累计失败 ${failures}/2）`); }
  }

  if (!note) {
    console.error(`连续 ${failures} 次采集失败（AC8）→ 停手。截图见 ${SHOT_DIR}`);
    cdp.close();
    process.exit(3);
  }
  if (!note.noteId || !/^[0-9a-f]{24}$/.test(note.noteId)) note.noteId = (noteUrlUsed.match(/\/(?:explore|search_result)\/([0-9a-f]{24})/) || [])[1] || note.noteId;
  log('AC3 提取成功:', JSON.stringify({ noteId: note.noteId, title: note.title, images: note.imageUrls.length, author: note.user.nickname }));

  // 图片 URL 列表兜底
  note.imageUrls = (note.imageUrls || []).map(fixImgUrl);

  // AC3：落 JSON（内部扩展字段格式，不入库）
  const nowIso = new Date().toISOString();
  const fetched = {
    noteId: note.noteId,
    sourceSite: 'xiaohongshu',
    sourceUrl: noteUrlUsed,
    fetchedAt: nowIso,
    pipelineStage: 'FETCHED_NOT_IMPORTED',
    fetcher: { script: 'xhs-fetch.mjs', method: 'cdp-reuse-port-9222', entry: entry, extractor: 'window.__INITIAL_STATE__.noteDetailMap' },
    title: note.title,
    desc: note.desc,
    author: note.user,
    imageUrls: note.imageUrls,
    downloadedImages: [],
    noteMeta: {
      type: note.type,
      publishTime: note.time ? new Date(note.time).toISOString() : null,
      ipLocation: note.ipLocation,
      tags: note.tags,
      likedCount: note.likedCount,
    },
    qualitySignal: null,
  };
  const jsonFile = path.join(OUT_DIR, note.noteId + '.fetch.json');
  writeFileSync(jsonFile, JSON.stringify(fetched, null, 2), 'utf8');
  const jsonBytes = Buffer.byteLength(JSON.stringify(fetched, null, 2));
  log('AC3 JSON 已落盘:', jsonFile, jsonBytes + ' bytes');

  // AC4：下载图片（前 N 张，每张间隔 1s 礼貌处理；下载非页面动作，不占用 5s 导航间隔）
  const dl = [];
  const maxImg = Math.min(args.maxImages, note.imageUrls.length);
  for (let i = 0; i < maxImg; i++) {
    const u = note.imageUrls[i];
    const ext = extFromUrlOrType(u, '');
    const file = path.join(IMG_DIR, `${note.noteId}_${i}${ext}`);
    try {
      const r = await downloadImage(cdp, u, file);
      dl.push({ index: i, url: u, file: 'images/' + path.basename(file), bytes: r.bytes, via: r.via });
      log(`AC4 图片[${i}] 下载成功 ${r.bytes} bytes via ${r.via}`);
    } catch (e) {
      log(`AC4 图片[${i}] 下载失败:`, e.message);
      dl.push({ index: i, url: u, file: null, bytes: 0, error: e.message });
    }
    if (i < maxImg - 1) await sleep(1000);
  }
  fetched.downloadedImages = dl.filter((x) => x.file);
  writeFileSync(jsonFile, JSON.stringify(fetched, null, 2), 'utf8');

  // 详情页截图存证
  const shotNote = await cdp.safeScreenshot(path.join(SHOT_DIR, 'note-' + note.noteId + '.png'));
  log('详情页截图:', shotNote);

  cdp.close();

  const summary = {
    exit: 0,
    ac1_tabId: tab.id,
    ac2_urlAfterExplore: urlAfterExplore,
    ac2_screenshot: shotExplore,
    noteId: note.noteId,
    title: note.title,
    author: note.user.nickname,
    imageUrlsCount: note.imageUrls.length,
    downloadedImages: fetched.downloadedImages.map((x) => ({ file: x.file, bytes: x.bytes, via: x.via })),
    jsonFile: jsonFile,
    jsonBytes: jsonBytes,
    sourceUrl: noteUrlUsed,
    screenshots: { note: shotNote },
  };
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e && e.stack ? e.stack : e);
  process.exit(1);
});
