// tools/content-pipeline/test/fetch2dish.spec.ts
// T-C03 AC6①：fetch2dish 转换 CLI 单测（纯函数 + 真实文件 IO 落盘）
// 被测对象：tools/content-pipeline/fetch2dish.mjs（零依赖 Node 原生模块，vitest/esbuild 直接 import）
// 注：网络下载分支（via='download-content-type'）不在此测（禁外网依赖），
//     Content-Type 归一行为经 normalizeImageExt 纯函数真实覆盖；本地文件分支走真实 IO。

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Fetch2DishError,
  buildDishFromFetch,
  buildStepsFromDesc,
  cleanDishName,
  normalizeImageExt,
  placeImages,
  sanitizePathSegment,
} from '../fetch2dish.mjs';

// ───── 测试夹具 ─────

const validFetch = {
  noteId: '6a55c68e000000001c025017',
  sourceSite: 'xiaohongshu',
  sourceUrl: 'https://www.xiaohongshu.com/explore/6a55c68e000000001c025017?xsec_token=ABZM',
  title: '简单家常菜｜暑期易做，好吃又下饭分享菜谱',
  desc: '#简简单单[话题]# #超级下饭[话题]#',
  author: { nickname: '杨momo.。', userId: 'u1' },
  imageUrls: ['http://cdn.example.com/0!nd_dft_wlteh_webp_3'],
  downloadedImages: [
    { index: 0, url: 'http://cdn.example.com/0!nd_dft_wlteh_webp_3', file: 'images/note_0.jpg', bytes: 594340 },
  ],
};

// 真实魔数字节（地面真值，非 mock：按各格式规范构造文件头）
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x9c, 0x11, 0x09, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([0, 0, 0, 0, 0, 0])]);

const tmpBase = path.join(tmpdir(), 'fetch2dish-spec-');
let tmpDirs: string[] = [];

async function makeTmp(): Promise<string> {
  const dir = await mkdtemp(tmpBase);
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

// ───── C-2：扩展名归一（normalizeImageExt）─────

describe('normalizeImageExt（AC4 / C-2 扩展名归一）', () => {
  it('响应 Content-Type 优先：image/webp -> .webp', () => {
    expect(normalizeImageExt({ bytes: null, contentType: 'image/webp', url: 'http://x/a' })).toBe('.webp');
  });

  it('Content-Type 带 charset 参数也能归一：image/jpeg; charset=binary -> .jpg', () => {
    expect(normalizeImageExt({ bytes: null, contentType: 'image/jpeg; charset=binary', url: 'http://x/a' })).toBe('.jpg');
  });

  it('Content-Type 大小写不敏感：IMAGE/PNG -> .png', () => {
    expect(normalizeImageExt({ bytes: null, contentType: 'IMAGE/PNG', url: 'http://x/a' })).toBe('.png');
  });

  it('Content-Type 不可得时按魔数归一（本地文件场景）：RIFF..WEBP -> .webp', () => {
    expect(normalizeImageExt({ bytes: WEBP_BYTES, contentType: null, url: 'http://x/a.jpg' })).toBe('.webp');
  });

  it('魔数归一 JPEG/PNG/GIF', () => {
    expect(normalizeImageExt({ bytes: JPEG_BYTES, contentType: null, url: '' })).toBe('.jpg');
    expect(normalizeImageExt({ bytes: PNG_BYTES, contentType: null, url: '' })).toBe('.png');
    expect(normalizeImageExt({ bytes: GIF_BYTES, contentType: null, url: '' })).toBe('.gif');
  });

  it('C-2 主场景：URL 后缀 .jpg 但内容是 WEBP -> 魔数优先于 URL 后缀，判 .webp', () => {
    expect(normalizeImageExt({ bytes: WEBP_BYTES, contentType: null, url: 'http://x/a.jpg?token=1' })).toBe('.webp');
  });

  it('Content-Type 与魔数都不可得时退 URL 后缀（jpeg 归一为 jpg）', () => {
    expect(normalizeImageExt({ bytes: null, contentType: '', url: 'http://x/a.jpeg?x=1' })).toBe('.jpg');
    expect(normalizeImageExt({ bytes: null, contentType: '', url: 'http://x/b.webp' })).toBe('.webp');
  });

  it('全部不可得时兜底 .jpg', () => {
    expect(normalizeImageExt({ bytes: null, contentType: null, url: 'http://x/a' })).toBe('.jpg');
  });

  it('魔数可判时优先级高于 URL 后缀（但低于有效 Content-Type）', () => {
    // 有有效 Content-Type 时忽略魔数
    expect(normalizeImageExt({ bytes: PNG_BYTES, contentType: 'image/webp', url: 'http://x/a.png' })).toBe('.webp');
  });
});

// ───── AC2：转换规则 ─────

describe('sanitizePathSegment', () => {
  it('只保留安全字符（防路径穿越）', () => {
    expect(sanitizePathSegment('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizePathSegment('6a55c68e000000001c025017')).toBe('6a55c68e000000001c025017');
  });

  it('长度截断 64', () => {
    expect(sanitizePathSegment('a'.repeat(100)).length).toBe(64);
  });
});

describe('cleanDishName', () => {
  it('取「｜」前主名（试采标题）', () => {
    expect(cleanDishName('简单家常菜｜暑期易做，好吃又下饭分享菜谱')).toBe('简单家常菜');
  });

  it('半角 | 同样生效；无分隔符保持原名', () => {
    expect(cleanDishName('番茄炒蛋|十分钟版')).toBe('番茄炒蛋');
    expect(cleanDishName('番茄炒蛋')).toBe('番茄炒蛋');
  });

  it('主名过短（<2 字）时取原标题；超 30 字截断', () => {
    expect(cleanDishName('A｜很长很长的副标题内容')).toBe('A｜很长很长的副标题内容');
    expect(cleanDishName('x'.repeat(40)).length).toBe(30);
  });
});

describe('buildStepsFromDesc', () => {
  it('纯话题标签正文 -> 单个「待人工微调」占位步骤（不虚构内容）', () => {
    const steps = buildStepsFromDesc('#简简单单[话题]# #超级下饭[话题]#');
    expect(steps.length).toBe(1);
    expect(steps[0].order).toBe(1);
    expect(steps[0].text).toContain('待人工微调');
  });

  it('空正文 -> 占位步骤', () => {
    const steps = buildStepsFromDesc('');
    expect(steps.length).toBe(1);
    expect(steps[0].text).toContain('待人工微调');
  });

  it('有句读正文 -> 按句切分编号', () => {
    const steps = buildStepsFromDesc('第一步切菜。第二步热油。第三步下锅炒！');
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(steps[0].text).toContain('切菜');
    expect(steps[2].text).toContain('下锅炒');
  });

  it('步骤最多 20 步', () => {
    const long = Array.from({ length: 30 }, (_, i) => `第${i}步。`).join('');
    expect(buildStepsFromDesc(long).length).toBe(20);
  });
});

describe('buildDishFromFetch（AC2 核心转换）', () => {
  it('正常转换：必填字段齐全，产出 fm-import 输入形状', () => {
    const dish = buildDishFromFetch(validFetch, { firstImageExt: '.webp' });
    expect(dish.name).toBe('简单家常菜');
    expect(dish.mealRole).toBe('MAIN');
    expect(dish.status).toBe('DRAFT');
    expect(dish.origin).toBe('FETCHED'); // 声明值；实际入库以 fm-import --origin FETCHED 授权为准
    expect(dish.ingredients).toEqual([]);
    expect(dish.sourceUrl).toBe(validFetch.sourceUrl); // 与 fetch.json 逐字一致
    expect(dish.sourceSite).toBe('xiaohongshu');
    expect(dish.imageUrl).toBe('/images/dishes/6a55c68e000000001c025017/0.webp'); // R-10：相对路径入库，无环境前缀
    expect(typeof dish.licenseNote).toBe('string');
    expect(dish.licenseNote).toContain('6a55c68e000000001c025017');
  });

  it('R-10 防回归：任何 opts.baseUrl 都不影响产出——imageUrl 恒为相对路径', () => {
    const dish = buildDishFromFetch(validFetch, { baseUrl: 'http://example.com:9999', firstImageExt: '.webp' } as never);
    expect(dish.imageUrl).toBe('/images/dishes/6a55c68e000000001c025017/0.webp');
    expect(String(dish.imageUrl)).not.toMatch(/^https?:\/\//);
  });

  it('firstImageIndex 定制：非 0 首图序号进入相对路径', () => {
    const dish = buildDishFromFetch(validFetch, { firstImageExt: '.png', firstImageIndex: 2 });
    expect(dish.imageUrl).toBe('/images/dishes/6a55c68e000000001c025017/2.png');
  });

  it('steps 生成：纯标签正文落占位步骤', () => {
    const dish = buildDishFromFetch(validFetch, { firstImageExt: '.webp' });
    expect(dish.steps.length).toBe(1);
    expect(dish.steps[0].text).toContain('待人工微调');
  });

  it('无图（firstImageExt=null）时省略 imageUrl 字段', () => {
    const dish = buildDishFromFetch(validFetch, { firstImageExt: null });
    expect('imageUrl' in dish).toBe(false);
  });

  it('缺字段容错：缺 title -> Fetch2DishError(MISSING_FIELDS)', () => {
    const bad = { ...validFetch };
    delete (bad as Record<string, unknown>).title;
    try {
      buildDishFromFetch(bad);
      expect.unreachable('应抛出 MISSING_FIELDS');
    } catch (e) {
      expect(e).toBeInstanceOf(Fetch2DishError);
      expect((e as Fetch2DishError).code).toBe('MISSING_FIELDS');
      expect((e as Error).message).toContain('title');
    }
  });

  it('缺字段容错：一次性收集全部缺失字段（noteId/sourceSite/sourceUrl/title）', () => {
    try {
      buildDishFromFetch({});
      expect.unreachable('应抛出 MISSING_FIELDS');
    } catch (e) {
      expect((e as Fetch2DishError).code).toBe('MISSING_FIELDS');
      const msg = (e as Error).message;
      for (const k of ['noteId', 'sourceSite', 'sourceUrl', 'title']) {
        expect(msg).toContain(k);
      }
    }
  });

  it('缺字段容错：空串/null 字段视为缺失', () => {
    expect(() => buildDishFromFetch({ ...validFetch, title: '   ' })).toThrow(Fetch2DishError);
    expect(() => buildDishFromFetch({ ...validFetch, sourceSite: null })).toThrow(Fetch2DishError);
  });

  it('缺字段容错：非对象输入抛 MISSING_FIELDS', () => {
    expect(() => buildDishFromFetch(null)).toThrow(Fetch2DishError);
  });

  it('noteId 含不安全字符（净化后不一致）-> 拒绝', () => {
    expect(() => buildDishFromFetch({ ...validFetch, noteId: '../evil' })).toThrow(Fetch2DishError);
  });

  it('desc 与图片可缺省（容错口径）：无 desc 无图仍可转换', () => {
    const minimal = {
      noteId: 'note0000000000000000000abc',
      sourceSite: 'xiaohongshu',
      sourceUrl: 'https://www.xiaohongshu.com/explore/note0000000000000000000abc',
      title: '最小可用笔记',
    };
    const dish = buildDishFromFetch(minimal, { firstImageExt: null });
    expect(dish.name).toBe('最小可用笔记');
    expect(dish.steps.length).toBe(1);
    expect(dish.sourceUrl).toBe(minimal.sourceUrl);
  });
});

// ───── AC4：图片落静态目录（真实文件 IO，本地文件分支）─────

describe('placeImages（AC4 落盘，本地文件分支走魔数归一）', () => {
  it('本地 .jpg 文件实为 WEBP 内容 -> 按魔数落盘为 0.webp（C-2 主场景）', async () => {
    const fetchDir = await makeTmp();
    const staticRoot = await makeTmp();
    await mkdir(path.join(fetchDir, 'images'), { recursive: true });
    await writeFile(path.join(fetchDir, 'images', 'note_0.jpg'), WEBP_BYTES);
    await writeFile(path.join(fetchDir, 'images', 'note_1.jpg'), PNG_BYTES);

    const fetchObj = {
      ...validFetch,
      downloadedImages: [
        { index: 0, url: 'http://cdn.example.com/0', file: 'images/note_0.jpg' },
        { index: 1, url: 'http://cdn.example.com/1', file: 'images/note_1.jpg' },
      ],
    };
    const placed = await placeImages(fetchObj, { fetchDir, staticRoot, maxImages: 3 });
    expect(placed.length).toBe(2);
    expect(placed[0].ext).toBe('.webp');
    expect(placed[0].via).toBe('local-magic');
    expect(placed[0].destRel).toBe('dishes/6a55c68e000000001c025017/0.webp');
    expect(placed[1].ext).toBe('.png');

    // 落盘字节与源一致（真实复制非 mock）
    const saved = await readFile(path.join(staticRoot, 'dishes', '6a55c68e000000001c025017', '0.webp'));
    expect(saved.equals(WEBP_BYTES)).toBe(true);
  });

  it('本地文件缺失且无 URL -> 单图失败不中断，placed 为空', async () => {
    const fetchDir = await makeTmp();
    const staticRoot = await makeTmp();
    const fetchObj = {
      ...validFetch,
      downloadedImages: [{ index: 0, url: '', file: 'images/missing.jpg' }],
    };
    const placed = await placeImages(fetchObj, { fetchDir, staticRoot, maxImages: 3 });
    expect(placed.length).toBe(0);
  });

  it('maxImages 截断候选图片', async () => {
    const fetchDir = await makeTmp();
    const staticRoot = await makeTmp();
    await mkdir(path.join(fetchDir, 'images'), { recursive: true });
    await writeFile(path.join(fetchDir, 'images', 'note_0.jpg'), JPEG_BYTES);
    await writeFile(path.join(fetchDir, 'images', 'note_1.jpg'), JPEG_BYTES);
    await writeFile(path.join(fetchDir, 'images', 'note_2.jpg'), JPEG_BYTES);
    const fetchObj = {
      ...validFetch,
      downloadedImages: [
        { index: 0, url: 'http://cdn.example.com/0', file: 'images/note_0.jpg' },
        { index: 1, url: 'http://cdn.example.com/1', file: 'images/note_1.jpg' },
        { index: 2, url: 'http://cdn.example.com/2', file: 'images/note_2.jpg' },
      ],
    };
    const placed = await placeImages(fetchObj, { fetchDir, staticRoot, maxImages: 2 });
    expect(placed.length).toBe(2);
    expect(placed.map((p) => p.index)).toEqual([0, 1]);
  });

  it('缺必填字段时拒绝（与 buildDishFromFetch 同口径）', async () => {
    await expect(placeImages({}, { fetchDir: await makeTmp(), staticRoot: await makeTmp() })).rejects.toThrow(
      Fetch2DishError,
    );
  });
});

// ───── T-P09：--base-url 废弃拦截（空格/等号两种形式同口径显式报错，退出码 1）─────
// parseArgs 在校验 fetch.json 之前就处理 --base-url，故子进程无需真实输入文件；
// process.exit 无法在进程内断言，用 spawnSync 走真实 CLI 入口（非 mock）。

describe('parseArgs --base-url 废弃拦截（R-10 空格形式回归 + T-P09 等号形式补漏）', () => {
  const scriptPath = fileURLToPath(new URL('../fetch2dish.mjs', import.meta.url));

  it('空格形式 --base-url 显式报错退出（既有行为回归）', () => {
    const r = spawnSync(process.execPath, [scriptPath, '--base-url', 'http://example.com:9999'], {
      encoding: 'utf-8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--base-url');
    expect(r.stderr).toContain('已废弃');
  });

  it('等号形式 --base-url=xxx 显式报错退出（T-P09 补，不得静默吞参）', () => {
    const r = spawnSync(process.execPath, [scriptPath, '--base-url=http://example.com:9999'], {
      encoding: 'utf-8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--base-url');
    expect(r.stderr).toContain('已废弃');
  });
});
