// Проверка: в игре не должно быть эмодзи — всё рисуется своими пиксельными значками (js/icons.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FF}\u{25A0}-\u{25FF}\u{231A}\u{231B}\u{203C}\u{2049}\u{FE0F}]/u;
const files = ['index.html', ...fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f)];
let bad = 0;
for (const f of files) fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
  if (RE.test(line)) { bad++; console.log(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`); }
});
if (bad) { console.log(`\nНайдено строк с эмодзи: ${bad}. Нарисуйте значок в js/icons.js и вставьте его через ico().`); process.exit(1); }
console.log('Эмодзи нет.');
