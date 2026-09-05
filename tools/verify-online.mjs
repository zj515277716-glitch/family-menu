// 验证线上产物包含本次修复（扫全部 JS chunk）
const BASE = 'https://menu.jijingkongjian.xin';
const chunks = ['app.6088dc77', '267.8b323a9f', '279.f81b4543', '364.4961c4d8', '51.6088dc77', '600.5c8473e1', '636.df5ad164', '705.2f58a306', '847.c305e775', '898.c4cce164'];
const needles = [
  ['HUAN_YI_PI', '换一批'],
  ['PLANDATEKEY', 'planDateKey'],
  ['BEICAI_SHUNXU', '备菜顺序'],
];
let hits = {};
for (const c of chunks) {
  const res = await fetch(BASE + '/js/' + c + '.js');
  const text = await res.text();
  const found = needles.map(([n, s]) => text.includes(s) ? n : null).filter(Boolean);
  console.log('JS/' + c + ' HTTP=' + res.status + ' hits=' + (found.join(',') || 'none'));
  for (const n of found) hits[n] = (hits[n] || 0) + 1;
}
console.log('TOTAL ' + JSON.stringify(hits));
