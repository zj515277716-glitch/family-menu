// 把 CRLF/CR 全部转成 LF（Windows 写的脚本要给 Linux bash 用，必须 LF）
// 用法：node make-lf.mjs 源文件 目标文件
import { readFileSync, writeFileSync } from "node:fs";
const [, , srcPath, dstPath] = process.argv;
const raw = readFileSync(srcPath, "utf8");
const cr = String.fromCharCode(13);
const lf = String.fromCharCode(10);
const text = raw.split(cr + lf).join(lf).split(cr).join(lf);
writeFileSync(dstPath, text);
console.log("LF converted: " + dstPath + " bytes=" + Buffer.byteLength(text));
