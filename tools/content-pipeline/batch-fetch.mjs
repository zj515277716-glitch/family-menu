#!/usr/bin/env node
/**
 * batch-fetch.mjs — T-C04 批量采集编排（只新增文件，不改 xhs-fetch.mjs/fetch2dish.mjs/import.ts）
 *
 * 按 xhs-fetch.mjs 的 CDP 模式（T-C02 定稿）编排批量采集：
 *   - 复用 127.0.0.1:9222 已登录 Edge 会话（GET /json 枚举 tab，原生 WebSocket CDP 直连页面级 WS）
 *   - 节流 NAV_GAP_MS=5300（每次页面导航 >=5s + 渲染等待）
 *   - 每关键词：搜索（state 空则二次提取）→ 候选按赞数排序去重 → 逐候选开详情 →
 *     提取 note（noteDetailMap 优先，全局 walk 兜底）→ 跳过视频/图片<3 → 下载前 3 张 → 落 <noteId>.fetch.json
 *   - 渲染器卡死自愈：测活失败 → 前台激活 → 跨站导航换渲染进程 → 回目标页（不关页面/不杀进程/不动 cookie）
 *   - 登录失效（/login）立即 exit 2 不重试；整体连续 4 次失败 exit 3（风控/结构变化保护）
 *   - manifest 增量落盘 out/xhs/batch-manifest.json（断点续采，status=ok 跳过）
 *
 * 子命令：
 *   node batch-fetch.mjs --collect --from 0 --to 6   采集关键词[0,6)（跳过已 ok）
 *   node batch-fetch.mjs --convert --from 0 --to 6   对已采条目跑 fetch2dish + import --origin FETCHED
 *   node batch-fetch.mjs --status                    打印 manifest 摘要
 *
 * 退出码：0 完成（单条失败已记 manifest）；1 环境错误；2 登录失效立即停；3 连续失败/恢复失败保护停。
 * 依赖：仅 Node 原生能力（global WebSocket/fetch/fs），零新增 npm 依赖。
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url)); // tools/content-pipeline
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');
const OUT_DIR = path.join(TOOL_DIR, 'out', 'xhs');
const SHOT_DIR = path.join(REPO_ROOT, '.workflow-verify', 'tp-c04');

const CDP_HTTP = 'http://127.0.0.1:9222';
const NAV_GAP_MS = 5300;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MANIFEST_PATH = path.join(OUT_DIR, 'batch-manifest.json');
const MAX_CANDIDATES_PER_KEYWORD = 12; // 每关键词最多试 12 个候选（T-C06：候选池上限 24，6→12 确定性扩大尝试范围）
const MIN_IMAGES = 3;                 // AC2：图片>=3 才收
const MAX_IMAGES_DL = 3;              // 下载前 3 张（与试采口径一致）
const BATCH_CONSEC_FAIL_STOP = 4;     // 整体连续失败保护阈值

const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── 关键词清单（AC1：30 个，家常菜系，荤/素/汤/主食）─────
export const KEYWORDS = [
  // 荤菜 12
  '红烧肉', '可乐鸡翅', '糖醋排骨', '鱼香肉丝', '青椒肉丝', '水煮肉片',
  '宫保鸡丁', '香菇滑鸡', '清蒸鲈鱼', '白灼虾', '回锅肉', '农家小炒肉',
  // 素菜 8
  '番茄炒蛋', '麻婆豆腐', '酸辣土豆丝', '蒜蓉西兰花', '红烧茄子', '蚝油生菜', '地三鲜', '干煸四季豆',
  // 汤羹 5
  '番茄牛腩汤', '冬瓜排骨汤', '紫菜蛋花汤', '玉米排骨汤', '山药鸡汤',
  // 主食 5
  '蛋炒饭', '葱油拌面', '韭菜盒子', '皮蛋瘦肉粥', '葱油饼',
];
const CATEGORY = (i) => (i < 12 ? '荤菜' : i < 20 ? '素菜' : i < 25 ? '汤羹' : '主食');

// ───── manifest ─────
function loadManifest() {
  if (existsSync(MANIFEST_PATH)) {
    try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')); } catch { /* 损坏则重建 */ }
  }
  return { task: 'T-C04', startedAt: new Date().toISOString(), updatedAt: null, items: [] };
}
function saveManifest(m) {
  m.updatedAt = new Date().toISOString();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2), 'utf-8');
}
function ensureItems(m) {
  KEYWORDS.forEach((kw, i) => {
    if (!m.items[i]) {
      m.items[i] = { index: i, category: CATEGORY(i), keyword: kw, status: 'pending', noteId: null, title: null, likedCount: null, imageCount: null, downloadedImages: null, placedImages: null, fetchJson: null, dishId: null, imported: false, error: null, at: null };
    }
  });
  return m;
}

// ───── CDP 最小客户端（页面级 WS，与 xhs-fetch.mjs 同模式）─────
class CdpPage {
  constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); this.evListeners = new Map(); this._bind(); }
  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error('WS connect timeout')), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(new CdpPage(ws)); });
      ws.addEventListener('error', (e) => { clearTimeout(timer); reject(new Error('WS error: ' + (e.message || 'unknown'))); });
    });
  }
  _bind() {
    this.ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); if (msg.error) p.reject(new Error(`CDP ${msg.error.message || 'error'} (code=${msg.error.code})`)); else p.resolve(msg.result); }
      } else if (msg.method) {
        const ls = this.evListeners.get(msg.method);
        if (ls) for (const fn of [...ls]) fn(msg.params);
      }
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  waitEvent(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ls = this.evListeners.get(method);
        if (ls) this.evListeners.set(method, ls.filter((f) => f !== handler));
        reject(new Error('timeout waiting event ' + method));
      }, timeoutMs);
      const handler = (params) => {
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
    await this.send('Page.enable', {}, 10000);
    const loaded = this.waitEvent('Page.loadEventFired', 30000).catch(() => null);
    await this.send('Page.navigate', { url }, 25000);
    await loaded;
    await sleep(NAV_GAP_MS + extraWaitMs); // 节流：导航间隔 >=5s + 渲染等待
  }
  async evalJson(expression, awaitPromise = false, timeoutMs = 45000) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, timeoutMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('evaluate exception: ' + (d.exception?.description || d.text || JSON.stringify(d)).slice(0, 300));
    }
    return r.result ? r.result.value : undefined;
  }
  async currentUrl() { return String(await this.evalJson('location.href')); }
  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' }, 45000);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
  async safeScreenshot(file) { try { return await this.screenshot(file); } catch (e) { log('截图失败（继续）:', e.message); return null; } }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

class CdpBrowser {
  constructor(ws) { this.ws = ws; this.nextId = 100000; this.pending = new Map(); this._bind(); }
  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error('browser ws timeout')), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(new CdpBrowser(ws)); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('browser ws error')); });
    });
  }
  _bind() {
    this.ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== undefined) { const p = this.pending.get(msg.id); if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } }
    });
  }
  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  sendS(method, params, sessionId, timeoutMs = 10000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

// ───── tab 工具（按 id 定位，避免恢复期间 URL 不在 xhs 域导致丢失）─────
async function listPageTabs() {
  const res = await fetch(CDP_HTTP + '/json');
  if (!res.ok) throw new Error('GET /json HTTP ' + res.status);
  return (await res.json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
}
async function pickXhsTab() {
  const pages = (await listPageTabs()).filter((t) => (t.url || '').includes('xiaohongshu.com'));
  if (pages.length === 0) return null;
  return pages.find((t) => t.url.includes('/explore')) || pages[0];
}
async function getTabById(id) {
  return (await listPageTabs()).find((t) => t.id === id) || null;
}
async function pageAliveByTab(tab) {
  let ws = null;
  try {
    ws = await CdpPage.connect(tab.webSocketDebuggerUrl);
    const v = await ws.evalJson('"alive"', false, 8000);
    return v === 'alive';
  } catch { return false; }
  finally { try { ws?.close(); } catch { /* noop */ } }
}

/**
 * 渲染器卡死自愈：activate → 跨站导航换渲染进程 → 测活 → 回目标页（登录校验）。
 * 不关页面、不杀进程、不清 cookie；仅在测活失败时调用。
 * @param {string} tabId 目标 tab id
 * @param {string} targetUrl 恢复后应回到的页面（xhs 页面）
 * @returns {Promise<true|false|'login_invalid'>}
 */
async function recoverRenderer(tabId, targetUrl) {
  log('RECOVER: 渲染器无响应，自愈开始（activate → 跨站导航 → 回目标页）');
  let b = null;
  try {
    const ver = await (await fetch(CDP_HTTP + '/json/version')).json();
    b = await CdpBrowser.connect(ver.webSocketDebuggerUrl);
    try {
      const w = await b.send('Browser.getWindowForTarget', { targetId: tabId });
      if (w.bounds?.windowState === 'minimized') {
        await b.send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } });
        log('RECOVER: 窗口从最小化还原');
        await sleep(2000);
      }
    } catch (e) { log('RECOVER: 窗口状态查询失败（继续）:', e.message); }
    await b.send('Target.activateTarget', { targetId: tabId }).catch(() => {});
    await sleep(2000);
    const sid = await b.send('Target.attachToTarget', { targetId: tabId, flatten: true }).then((r) => r.sessionId);
    try {
      await b.sendS('Page.navigate', { url: 'https://www.baidu.com/' }, sid, 20000);
      log('RECOVER: 跨站导航已发出（强制换渲染进程）');
    } catch (e) { log('RECOVER: 跨站导航失败:', e.message); }
    await sleep(8000);
  } catch (e) {
    log('RECOVER: browser 会话异常:', e.message);
  } finally { try { b?.close(); } catch { /* noop */ } }

  // 按 id 重取 tab 并测活（此刻 URL 可能是 baidu，不能用 URL 过滤）
  const tab2 = await getTabById(tabId);
  if (!tab2 || !(await pageAliveByTab(tab2))) { log('RECOVER: 换渲染进程后仍无响应'); return false; }

  // 回目标页
  const cdp2 = await CdpPage.connect(tab2.webSocketDebuggerUrl);
  try {
    await cdp2.navigateAndWait(targetUrl);
    const url = await cdp2.currentUrl();
    if (url.includes('/login')) return 'login_invalid';
    const ok = await cdp2.evalJson('!!window.__INITIAL_STATE__');
    log('RECOVER: 完成 url=', url.slice(0, 80), 'state=', ok);
    return ok === true;
  } catch (e) {
    log('RECOVER: 回目标页失败:', e.message);
    return false;
  } finally { cdp2.close(); }
}

// ───── 页面端表达式（String.raw 保持正则原样下发）─────
// 主路径：state.search.feeds 是 Vue ref（数据在 _value），元素含 xsecToken/noteCard.type/interactInfo.likedCount
//         → 真实赞数排序 + 视频在候选阶段预过滤（省详情导航）。
// 兜底：DOM section.note-item[data-note-id]，.play-icon 视频预过滤，.like-wrapper 计数提取。
const EXPR_CANDIDATES = String.raw`(function(){
  var out = { ok: true, cands: [], sources: [] };
  try {
    var s = window.__INITIAL_STATE__;
    function parseLikes(x) {
      if (x === undefined || x === null) return 0;
      var t = String(x).trim();
      var m = t.match(/^([\d.]+)\s*万$/); if (m) return Math.round(parseFloat(m[1]) * 10000);
      m = t.match(/^([\d.]+)$/); if (m) return Math.round(parseFloat(m[1]));
      return 0;
    }
    function pushCand(c) {
      if (out.cands.length >= 24) return;
      if (!c.id || !c.token) return;
      if (c.type === 'video') return;
      out.cands.push({ id: c.id, token: c.token, title: c.title || '', likes: c.likes | 0, likesRaw: c.likesRaw || '', href: '', src: c.src });
    }
    // 主路径：state search.feeds（Vue ref → _value/.value）
    var notes = null;
    if (s && s.search && s.search.feeds) {
      var f = s.search.feeds;
      notes = (f._value !== undefined && f._value !== null) ? f._value : (f.value !== undefined ? f.value : null);
    }
    if (Array.isArray(notes)) {
      for (var i = 0; i < notes.length; i++) {
        var e = notes[i]; if (!e || !e.id) continue;
        var card = e.noteCard || e;
        var ii = card.interactInfo || {};
        pushCand({ id: e.id, token: e.xsecToken || e.xsec_token || card.xsec_token || '', type: card.type || e.type || '', title: card.displayTitle || e.displayTitle || '', likes: parseLikes(ii.likedCount), likesRaw: ii.likedCount || '', src: 'state:search' });
      }
      if (out.cands.length) out.sources.push('state:search:' + out.cands.length);
    }
    // 兜底：DOM 卡片（视频预过滤 + 赞计数）
    if (!out.cands.length) {
      var cards = document.querySelectorAll('section.note-item[data-note-id]');
      for (var j = 0; j < cards.length && out.cands.length < 24; j++) {
        var el = cards[j];
        if (el.querySelector('.play-icon')) continue;
        var a = el.querySelector('a.cover[href*="xsec_token"], a.title[href*="xsec_token"], a[href*="xsec_token"]');
        if (!a) continue;
        var href = a.getAttribute('href') || '';
        var m = href.match(/^\/(explore|search_result)\/([0-9a-f]{24})\?/);
        if (!m) continue;
        var token = (href.match(/xsec_token=([^&]+)/) || [])[1] || '';
        if (!token) continue;
        var likeEl = el.querySelector('.like-wrapper .count, .like-wrapper span:last-child');
        var likesRaw = likeEl ? ((likeEl.innerText || likeEl.textContent || '') + '').trim() : '';
        var titleEl = el.querySelector('.title');
        pushCand({ id: m[2], token: token, type: '', title: titleEl ? (titleEl.innerText || '').slice(0, 80) : '', likes: parseLikes(likesRaw), likesRaw: likesRaw, src: 'dom:card' });
      }
      if (out.cands.length) out.sources.push('dom:card:' + out.cands.length);
    }
    out.count = out.cands.length;
  } catch (e) { out.ok = false; out.reason = String(e); }
  return JSON.stringify(out);
})()`;

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
      for (var k = 0; k < ks.length && !found; k++) { var v = o[ks[k]]; if (v && typeof v === 'object') walk(v, depth + 1); }
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
      noteId: n.noteId || noteId, type: n.type || '', title: n.title || n.displayTitle || '', desc: n.desc || '',
      user: { nickname: (n.user && n.user.nickname) || '', userId: (n.user && (n.user.userId || n.user.id)) || '' },
      time: n.time || 0, ipLocation: n.ipLocation || '',
      likedCount: (n.interactInfo && n.interactInfo.likedCount) || '',
      tags: (n.tagList || []).map(function (t) { return t.name; }).slice(0, 20),
      imageUrls: urls
    };
    return JSON.stringify({ ok: true, note: note });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e) }); }
})()`;
}

// ───── 图片下载（与 xhs-fetch.mjs 同策略）─────
function fixImgUrl(u) { return u && u.startsWith('//') ? 'https:' + u : u; }
async function downloadImage(cdp, url, file) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.xiaohongshu.com/' } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) { writeFileSync(file, buf); return { bytes: buf.length, via: 'node-fetch' }; }
    }
  } catch { /* 回退页面内 fetch */ }
  const expr = '(async function(){ try { var r = await fetch(' + JSON.stringify(url) + ', {credentials:"omit"}); '
    + 'if (!r.ok) return JSON.stringify({ok:false,status:r.status}); '
    + 'var b = new Uint8Array(await r.arrayBuffer()); var s=""; var CH=0x8000; '
    + 'for (var i=0;i<b.length;i+=CH){ s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i+CH, b.length))); } '
    + 'return JSON.stringify({ok:true,bytes:b.length,b64:btoa(s)}); } catch(e){ return JSON.stringify({ok:false,reason:String(e)}); } })()';
  const v = JSON.parse(await cdp.evalJson(expr, true));
  if (!v.ok || !v.b64) throw new Error('页面内 fetch 失败');
  const buf = Buffer.from(v.b64, 'base64');
  if (buf.length === 0) throw new Error('空内容');
  writeFileSync(file, buf);
  return { bytes: buf.length, via: 'page-fetch' };
}
function extFromUrl(url) {
  const m = String(url).match(/\.(jpe?g|png|webp)(?:[?!]|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}
function parseLikesNum(x) {
  if (x === undefined || x === null) return 0;
  const t = String(x).trim();
  let m = t.match(/^([\d.]+)\s*万$/); if (m) return Math.round(parseFloat(m[1]) * 10000);
  m = t.match(/^([\d.]+)$/); if (m) return Math.round(parseFloat(m[1]));
  return 0;
}

// ───── --collect ─────
async function cmdCollect(from, to) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const m = ensureItems(loadManifest());
  const usedNoteIds = new Set(m.items.filter((it) => it.noteId).map((it) => it.noteId));

  // 定位 xhs tab（锁定 tabId，全程按 id 重取）。
  // fallback：无 xhs tab 时用 about:blank 空白页导航恢复（不新增/不关闭页面、不动 cookie）。
  let tab0 = await pickXhsTab();
  if (!tab0) {
    const pages = await listPageTabs();
    const blank = pages.find((t) => (t.url || '') === 'about:blank');
    if (!blank) { console.error('未找到 xiaohongshu page tab，且无 about:blank 空白页可复用（9222 未开或无可用 tab）。'); process.exit(1); }
    log('未发现 xhs tab，改用 about:blank 空白页导航恢复（不新增/不关闭页面）');
    let cdp0 = null;
    try {
      cdp0 = await CdpPage.connect(blank.webSocketDebuggerUrl);
      await cdp0.navigateAndWait('https://www.xiaohongshu.com/explore');
      const u0 = await cdp0.currentUrl();
      if (u0.includes('/login')) { console.error('恢复导航后落在 /login → 登录失效，立即停。'); process.exit(2); }
    } catch (e) {
      console.error('about:blank 恢复导航失败:', e.message);
      process.exit(3);
    } finally { try { cdp0?.close(); } catch { /* noop */ } }
    tab0 = await pickXhsTab();
    if (!tab0) { console.error('导航后仍未找到 xiaohongshu tab。'); process.exit(1); }
  }
  const TAB_ID = tab0.id;
  let cdp = null; // 可重连的页面会话

  async function ensureCdp() {
    const t = await getTabById(TAB_ID);
    if (!t) throw new Error('tab 消失');
    cdp = await CdpPage.connect(t.webSocketDebuggerUrl);
    return cdp;
  }

  /**
   * 带自愈的导航：卡死 → 恢复 → 重连 → 重试一次。
   * @returns {Promise<true|'login_invalid'|'recover_fail'>}
   */
  async function safeNav(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!cdp) await ensureCdp();
        await cdp.navigateAndWait(url);
        const u = await cdp.currentUrl();
        if (u.includes('/login')) return 'login_invalid';
        return true;
      } catch (e) {
        log(`导航异常(第${attempt + 1}次): ${e.message}`);
        try { cdp?.close(); } catch { /* noop */ } cdp = null;
        const rec = await recoverRenderer(TAB_ID, url);
        if (rec === 'login_invalid') return 'login_invalid';
        if (rec !== true) return 'recover_fail';
      }
    }
    return 'recover_fail';
  }

  // 启动：测活 + 回 explore + 登录预检
  if (!(await pageAliveByTab(tab0))) {
    const rec = await recoverRenderer(TAB_ID, 'https://www.xiaohongshu.com/explore');
    if (rec === 'login_invalid') { saveManifest(m); console.error('恢复导航后落在 /login → 登录失效，立即停。'); process.exit(2); }
    if (rec !== true) { console.error('渲染器恢复失败 → 停手（exit 3）。'); process.exit(3); }
  }
  const startNav = await safeNav('https://www.xiaohongshu.com/explore');
  if (startNav !== true) { saveManifest(m); console.error('启动导航失败/登录失效:', startNav); process.exit(startNav === 'login_invalid' ? 2 : 3); }
  log('登录态 OK，tabId=', TAB_ID);

  let consecutiveFail = 0;
  let stopped = null;
  try {
    for (let i = from; i < Math.min(to, KEYWORDS.length); i++) {
      const it = m.items[i];
      if (it.status === 'ok') { log(`[${i}] ${it.keyword} 已采过（ok），跳过`); continue; }

      // 搜索
      const searchUrl = 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(it.keyword) + '&source=web_explore_feed';
      const nav1 = await safeNav(searchUrl);
      if (nav1 !== true) { stopped = { reason: nav1, at: i }; break; }

      // 候选提取（state 空则等 2.5s 二次提取）
      let v;
      try { v = JSON.parse(await cdp.evalJson(EXPR_CANDIDATES)); }
      catch (e) { v = { ok: false, cands: [], sources: [], reason: e.message }; }
      const noState = !v.cands || v.cands.length === 0 || !(v.sources || []).some((s) => s.startsWith('state:'));
      if (noState) {
        await sleep(2500);
        try { v = JSON.parse(await cdp.evalJson(EXPR_CANDIDATES)); } catch (e) { v = { ok: false, cands: [], sources: [], reason: e.message }; }
      }
      log(`[${i}] ${it.keyword} 搜索候选: ${v.count || 0} sources=${JSON.stringify(v.sources || [])}`);

      if (!v.ok || !v.cands || v.cands.length === 0) {
        await cdp.safeScreenshot(path.join(SHOT_DIR, `no-cand-${i}-` + Date.now() + '.png'));
        it.status = 'failed'; it.error = 'no_candidates'; it.at = new Date().toISOString();
        saveManifest(m);
        continue;
      }

      // 排序：赞数 desc；关键词内去重
      const seenInKw = new Set();
      const cands = [...v.cands]
        .filter((c) => (seenInKw.has(c.id) ? false : (seenInKw.add(c.id), true)))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, MAX_CANDIDATES_PER_KEYWORD);

      let accepted = false;
      for (const c of cands) {
        if (usedNoteIds.has(c.id)) { log(`[${i}] 候选 ${c.id} 已被其他关键词收录，跳过`); continue; }
        const noteUrl = c.href
          ? (c.href.startsWith('http') ? c.href : 'https://www.xiaohongshu.com' + c.href)
          : 'https://www.xiaohongshu.com/explore/' + c.id + '?xsec_token=' + c.token + '&xsec_source=pc_feed';
        const nav2 = await safeNav(noteUrl);
        if (nav2 === 'login_invalid') { stopped = { reason: 'login_invalid', at: i }; break; }
        if (nav2 !== true) {
          consecutiveFail++;
          if (consecutiveFail >= BATCH_CONSEC_FAIL_STOP) { stopped = { reason: 'consecutive_nav_fail', at: i }; break; }
          continue;
        }

        let note = null;
        for (let retry = 0; retry < 2 && !note; retry++) {
          if (retry > 0) await sleep(3000);
          try {
            const d = JSON.parse(await cdp.evalJson(buildDetailExpr(c.id)));
            if (d.ok) note = d.note; else log(`[${i}] 详情提取失败: ${JSON.stringify(d).slice(0, 160)}`);
          } catch (e) { log(`[${i}] 详情 eval 异常: ${e.message}`); }
        }
        if (!note) {
          consecutiveFail++;
          await cdp.safeScreenshot(path.join(SHOT_DIR, `fail-${i}-${c.id}-` + Date.now() + '.png'));
          if (consecutiveFail >= BATCH_CONSEC_FAIL_STOP) { stopped = { reason: 'consecutive_extract_fail', at: i }; break; }
          continue;
        }
        consecutiveFail = 0;
        if (note.type === 'video') { log(`[${i}] 候选 ${c.id} 为视频笔记，跳过`); continue; }
        if (!note.noteId || !/^[0-9a-f]{24}$/.test(note.noteId)) note.noteId = c.id;
        note.imageUrls = (note.imageUrls || []).map(fixImgUrl);

        if (note.imageUrls.length < MIN_IMAGES) {
          log(`[${i}] 候选 ${note.noteId} 图片 ${note.imageUrls.length} < ${MIN_IMAGES}（type=${note.type}），跳过`);
          continue;
        }

        // 收录：写 fetch.json（形状与 xhs-fetch.mjs 一致）
        // title 兜底：displayTitle 空的笔记取 desc 第一行（截 40 字），再为空用关键词（fetch2dish 要求 title 必填）
        const titleFallback = (note.title && String(note.title).trim())
          || String(note.desc || '').split('\n')[0].trim().slice(0, 40)
          || it.keyword;
        const fetched = {
          noteId: note.noteId,
          sourceSite: 'xiaohongshu',
          sourceUrl: noteUrl,
          fetchedAt: new Date().toISOString(),
          pipelineStage: 'FETCHED_NOT_IMPORTED',
          fetcher: { script: 'batch-fetch.mjs', method: 'cdp-reuse-port-9222', entry: 'search:' + it.keyword, extractor: 'window.__INITIAL_STATE__.noteDetailMap' },
          title: titleFallback,
          desc: note.desc,
          author: note.user,
          imageUrls: note.imageUrls,
          downloadedImages: [],
          noteMeta: { type: note.type, publishTime: note.time ? new Date(note.time).toISOString() : null, ipLocation: note.ipLocation, tags: note.tags, likedCount: note.likedCount || c.likesRaw || '' },
          qualitySignal: null,
        };
        const jsonFile = path.join(OUT_DIR, note.noteId + '.fetch.json');
        writeFileSync(jsonFile, JSON.stringify(fetched, null, 2), 'utf-8');

        // 下载前 N 张（下载非页面导航，间隔 1s 礼貌）
        const dl = [];
        const maxImg = Math.min(MAX_IMAGES_DL, note.imageUrls.length);
        for (let k = 0; k < maxImg; k++) {
          const u = note.imageUrls[k];
          const file = path.join(OUT_DIR, 'images', `${note.noteId}_${k}${extFromUrl(u)}`);
          try {
            const r = await downloadImage(cdp, u, file);
            dl.push({ index: k, url: u, file: 'images/' + path.basename(file), bytes: r.bytes, via: r.via });
          } catch (e) { log(`[${i}] 图片[${k}] 下载失败: ${e.message}`); dl.push({ index: k, url: u, file: null, bytes: 0, error: e.message }); }
          if (k < maxImg - 1) await sleep(1000);
        }
        fetched.downloadedImages = dl.filter((x) => x.file);
        if (fetched.downloadedImages.length === 0) {
          it.status = 'failed'; it.error = 'all_image_downloads_failed'; it.at = new Date().toISOString();
          saveManifest(m);
          continue;
        }
        writeFileSync(jsonFile, JSON.stringify(fetched, null, 2), 'utf-8');
        await cdp.safeScreenshot(path.join(SHOT_DIR, 'note-' + note.noteId + '.png'));

        it.status = 'ok'; it.noteId = note.noteId; it.title = note.title;
        it.likedCount = note.likedCount || c.likesRaw || String(c.likes || '');
        it.likesNum = parseLikesNum(it.likedCount);
        it.imageCount = note.imageUrls.length;
        it.downloadedImages = fetched.downloadedImages.length;
        it.fetchJson = path.relative(REPO_ROOT, jsonFile);
        it.error = null; it.at = new Date().toISOString();
        usedNoteIds.add(note.noteId);
        accepted = true;
        saveManifest(m);
        log(`[${i}] ${it.keyword} 收录: noteId=${note.noteId} 赞=${it.likedCount} 图=${it.imageCount} 已下=${it.downloadedImages}`);
        break;
      }

      if (stopped) break;
      if (!accepted && it.status !== 'failed') {
        it.status = 'failed'; it.error = 'no_qualified_candidate'; it.at = new Date().toISOString();
        saveManifest(m);
        log(`[${i}] ${it.keyword} 无合格候选（赞序前 ${MAX_CANDIDATES_PER_KEYWORD} 均不满足）`);
      }
    }
  } finally {
    saveManifest(m);
    try { cdp?.close(); } catch { /* noop */ }
  }

  if (stopped) {
    console.error('STOP:', JSON.stringify(stopped));
    process.exit(stopped.reason === 'login_invalid' ? 2 : 3);
  }
  const okN = m.items.slice(from, to).filter((x) => x.status === 'ok').length;
  log(`collect 段[${from},${to}) 完成：ok=${okN}`);
  process.exit(0);
}

// ───── --convert ─────
function cmdConvert(from, to) {
  const m = ensureItems(loadManifest());
  let done = 0, fail = 0;
  for (let i = from; i < Math.min(to, m.items.length); i++) {
    const it = m.items[i];
    if (it.status !== 'ok' || it.imported || !it.fetchJson) continue;
    const fetchJsonAbs = path.resolve(REPO_ROOT, it.fetchJson);
    if (!existsSync(fetchJsonAbs)) { it.error = 'fetch_json_missing'; continue; }

    // 1) fetch2dish（图片落 static + 产出 dish.json）
    const r1 = spawnSync('node', [path.join(TOOL_DIR, 'fetch2dish.mjs'), fetchJsonAbs], { cwd: TOOL_DIR, encoding: 'utf8', windowsHide: true });
    if (r1.status !== 0) {
      it.error = 'fetch2dish_exit_' + r1.status + ': ' + String(r1.stderr || '').slice(-200);
      fail++; saveManifest(m); console.error(`[${i}] fetch2dish FAIL exit=${r1.status}`); continue;
    }
    let placed = null, dishPath = null;
    try {
      const s1 = r1.stdout.split('=== SUMMARY ===')[1];
      const sm = JSON.parse(s1);
      placed = sm.placedImages.length;
      dishPath = sm.dishJson;
    } catch (e) { it.error = 'fetch2dish_summary_parse: ' + e.message; fail++; saveManifest(m); continue; }

    // 2) import --origin FETCHED
    const r2 = spawnSync('npx', ['tsx', 'src/cli/import.ts', dishPath, '--origin', 'FETCHED'], { cwd: TOOL_DIR, encoding: 'utf8', windowsHide: true, shell: true });
    if (r2.status !== 0) {
      it.error = 'import_exit_' + r2.status + ': ' + String(r2.stderr || r2.stdout || '').slice(-200);
      fail++; saveManifest(m); console.error(`[${i}] import FAIL exit=${r2.status}`); continue;
    }
    const dm = String(r2.stdout).match(/dishId=([A-Za-z0-9_-]+)/);
    if (!dm) { it.error = 'import_no_dishid: ' + String(r2.stdout).slice(-200); fail++; saveManifest(m); continue; }

    it.placedImages = placed;
    it.dishId = dm[1];
    it.imported = true;
    it.error = null;
    it.at = new Date().toISOString();
    done++;
    saveManifest(m);
    log(`[${i}] ${it.keyword} 入库: dishId=${it.dishId} placed=${placed}`);
  }
  log(`convert 段[${from},${to}) 完成：newly_imported=${done} fail=${fail}`);
  process.exit(fail > 0 && done === 0 ? 1 : 0);
}

// ───── --status ─────
function cmdStatus() {
  const m = ensureItems(loadManifest());
  const ok = m.items.filter((x) => x.status === 'ok');
  const failed = m.items.filter((x) => x.status === 'failed');
  const out = {
    totalKeywords: m.items.length,
    ok: ok.length, imported: m.items.filter((x) => x.imported).length, failed: failed.length, pending: m.items.length - ok.length - failed.length,
    okList: ok.map((x) => ({ i: x.index, kw: x.keyword, noteId: x.noteId, title: x.title, likes: x.likedCount, images: x.imageCount, dl: x.downloadedImages, placed: x.placedImages, dishId: x.dishId })),
    failedList: failed.map((x) => ({ i: x.index, kw: x.keyword, error: x.error })),
  };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}

// ───── main ─────
function parseArgs(argv) {
  const a = { mode: null, from: 0, to: KEYWORDS.length };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--collect') a.mode = 'collect';
    else if (k === '--convert') a.mode = 'convert';
    else if (k === '--status') a.mode = 'status';
    else if (k === '--from') a.from = parseInt(argv[++i], 10) || 0;
    else if (k === '--to') a.to = parseInt(argv[++i], 10) || KEYWORDS.length;
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.mode === 'collect') await cmdCollect(args.from, args.to);
else if (args.mode === 'convert') cmdConvert(args.from, args.to);
else if (args.mode === 'status') cmdStatus();
else { console.error('用法：node batch-fetch.mjs --collect|--convert|--status [--from N] [--to M]'); process.exit(1); }
