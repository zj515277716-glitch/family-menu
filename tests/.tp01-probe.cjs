// T-P01 环境探测（辅助脚本，非 AC 断言）：PG 54329 / API 3000 端口与文件状态
// 用法：node tests/.tp01-probe.cjs ｜ 仅探测，不启动、不写入
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

function probePort(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 2000 });
    s.on('connect', () => { s.destroy(); resolve('OPEN'); });
    s.on('timeout', () => { s.destroy(); resolve('TIMEOUT'); });
    s.on('error', (e) => resolve('CLOSED(' + e.code + ')'));
  });
}

async function main() {
  const pg = await probePort(54329);
  const api = await probePort(3000);
  const root = path.resolve(__dirname, '..');
  const pgVersion = fs.existsSync(path.join(root, '.pg', 'data', 'PG_VERSION'));
  const postmasterPid = fs.existsSync(path.join(root, '.pg', 'data', 'postmaster.pid'));
  const rootEnv = fs.existsSync(path.join(root, '.env'));
  console.log('node=' + process.version);
  console.log('PG_54329=' + pg);
  console.log('API_3000=' + api);
  console.log('PG_DATA_VERSION_FILE=' + pgVersion);
  console.log('PG_DATA_POSTMASTER_PID_FILE=' + postmasterPid);
  console.log('ROOT_ENV=' + rootEnv);
}

main().catch((e) => { console.error('PROBE_FAILED:', e.message); process.exit(1); });
