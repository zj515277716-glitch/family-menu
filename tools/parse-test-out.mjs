// 解析 PowerShell UTF-16 重定向的 vitest 输出，打印测试汇总行
import { readFileSync } from "node:fs";
const raw = readFileSync(process.argv[2]);
// UTF-16LE：去掉每字符后的 0x00
const utf16 = raw.toString("utf16le");
// 同时按普通 utf8 再解析一次，取包含汇总的行
const lines = (utf16 + "\n" + raw.toString("utf8")).split(String.fromCharCode(10));
const wanted = lines.filter((l) => /Test Files|Tests\s|Duration|passed|failed/i.test(l));
console.log(wanted.join(String.fromCharCode(10)));
