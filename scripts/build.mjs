// Сборка: копирует игру в dist/, вписывает номер версии и добавляет ?v=… к скриптам,
// чтобы браузеры не держали старый код после выкладки.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

function gitVersion() {
  try { return execSync('git describe --tags --always --dirty', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'dev'; }
}
const version = (process.env.VERSION || gitVersion()).replace(/[^\w.+-]/g, '');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, 'js'), path.join(dist, 'js'), { recursive: true });
fs.cpSync(path.join(root, 'server', 'server.mjs'), path.join(dist, 'server', 'server.mjs'));
if (fs.existsSync(path.join(root, 'assets'))) fs.cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

const verFile = path.join(dist, 'js', 'version.js');
fs.writeFileSync(verFile, fs.readFileSync(verFile, 'utf8').replace("const VERSION = 'dev'", `const VERSION = '${version}'`));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(<script src="js\/[\w.-]+\.js)"/g, `$1?v=${version}"`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ version, built: new Date().toISOString() }) + '\n');

console.log(`dist/ собран, версия ${version}`);
