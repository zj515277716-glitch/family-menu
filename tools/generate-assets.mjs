import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://console.enterprise.trae.cn/api/ide/v1/text_to_image';
const OUTPUT_DIR = 'd:/codex/family-menu/apps/h5/src/assets';

const STYLE_BASE = '扁平插画风格，暖橙(#FF6B35)+奶油白(#FFF8F3)主色调，圆角造型，家庭厨房主题，柔和光影，画面简洁无文字，统一描边粗细(约3px)，平视视角，温馨家庭氛围';

const assets = [
  {
    name: 'asset-common-logo@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：一个圆形餐盘上叠放一双筷子与一把锅铲，简洁标志感，居中构图，橙色为主，留白充足`,
    imageSize: 'square_hd'
  },
  {
    name: 'asset-tonight-hero@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：今晚吃什么主题，一张木质餐桌摆着空碗与冒热气的锅，旁边一个对话气泡里是问号，暖光，家庭厨房背景虚化，横向构图`,
    imageSize: 'landscape_16_9'
  },
  {
    name: 'asset-candidates-empty@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：空状态-无候选页，一只空盘子和一双筷子放桌上，旁边一个放大镜与一个问号气泡，略带疑惑但温和的情绪，暖色调`,
    imageSize: 'landscape_4_3'
  },
  {
    name: 'asset-history-empty@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：空状态-无做饭记录页，一只空盘子和一双筷子，旁边一个日历图标与一个问号气泡，引导感，暖色调`,
    imageSize: 'landscape_4_3'
  },
  {
    name: 'asset-plan-empty@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：空状态-采购清单为空，一个空购物篮与一张清单纸，旁边一个小对勾气泡，暖色调`,
    imageSize: 'landscape_4_3'
  },
  {
    name: 'asset-candidates-lock-success@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：锁定成功反馈，一只手竖起大拇指按在一个带对勾的圆形菜单卡上，简洁庆祝感，暖橙主色`,
    imageSize: 'square'
  },
  {
    name: 'asset-history-feedback-success@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：做饭完成反馈，一个干净的空盘与一双并拢的筷子，上方一个小星星，满足感，暖色调`,
    imageSize: 'square'
  },
  {
    name: 'asset-common-dish-placeholder@2x.png',
    prompt: `${STYLE_BASE} ＋素材专属：菜品占位图(非写实)，扁平插画风格的一个餐盘轮廓内放一双筷子与一个相机图标，明显占位感、不可与真实菜品混淆，居中构图`,
    imageSize: 'square'
  },
];

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let successCount = 0;
let failCount = 0;

// 逐张生成
for (const asset of assets) {
  const url = `${BASE_URL}?prompt=${encodeURIComponent(asset.prompt)}&image_size=${asset.imageSize}`;
  console.log(`\nGenerating ${asset.name}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ERROR: HTTP ${response.status} ${response.statusText}`);
      failCount++;
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(path.join(OUTPUT_DIR, asset.name), buffer);
      console.log(`  OK: ${buffer.length} bytes (${contentType})`);
      successCount++;
    } else if (contentType.includes('application/json')) {
      const json = await response.json();
      console.log(`  JSON response:`, JSON.stringify(json).substring(0, 300));
      failCount++;
    } else {
      const text = await response.text();
      console.log(`  Unexpected content-type: ${contentType}`);
      console.log(`  Response: ${text.substring(0, 300)}`);
      failCount++;
    }
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    failCount++;
  }
}

console.log(`\n=== Done: ${successCount} success, ${failCount} fail ===`);
