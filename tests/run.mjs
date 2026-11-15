// Автотест без окна: открывает игру в Chrome, бот играет партии за всех игроков.
// Падает, если в игре случилась ошибка. Запуск: npm test  (TEST_ROOT=dist — проверить сборку)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(repo, process.env.TEST_ROOT || '.');
const DAYS = Number(process.env.TEST_DAYS || 200);
const H = (name, fac, hero) => ({ name, fac, hero, kind: 'human' });
const BOT = (name, fac, diff) => ({ name, fac, kind: 'bot', diff });
const SCENARIOS = [
  { name: 'Москва: 3 человека', players: [H('Красные', 'kach'), H('Жёлтые', 'rynok'), H('Синие', 'neform')] },
  { name: 'Москва: 2 человека', players: [H('Красные', 'neform', 2), H('Жёлтые', 'kach', 3)] },
  { name: 'Москва: 1 человек + 2 бота', players: [H('Красные', 'kach'), BOT('Жёлтые', 'rynok', 1), BOT('Синие', 'neform', 2)] },
  { name: 'Москва: 2 человека + 2 бота', players: [H('Красные', 'kach'), BOT('Жёлтые', 'rynok', 0), H('Синие', 'neform'), BOT('Зелёные', 'kach', 2)] },
  { name: 'Москва: бот ходит первым, 5 бригад', players: [BOT('Красные', 'neform', 1), H('Жёлтые', 'rynok'), BOT('Синие', 'kach', 1), BOT('Зелёные', 'rynok', 2), H('Фиолетовые', 'neform')] },
  { name: 'Москва: 1 человек + 5 ботов', players: [H('Красные', 'kach'), BOT('Жёлтые', 'rynok', 0), BOT('Синие', 'neform', 1), BOT('Зелёные', 'kach', 1), BOT('Фиолетовые', 'rynok', 2), BOT('Рыжие', 'neform', 2)] },
  { name: 'Схема: 3 человека, одна бригада', map: 'ring', players: [H('А', 'rynok', 0), H('Б', 'rynok', 1), H('В', 'rynok', 2)] },
  { name: 'Схема: 1 человек + 5 ботов', map: 'ring', players: [H('Красные', 'kach'), BOT('Жёлтые', 'rynok', 0), BOT('Синие', 'neform', 1), BOT('Зелёные', 'kach', 1), BOT('Фиолетовые', 'rynok', 2), BOT('Рыжие', 'neform', 2)] },
];

function findChrome() {
  const list = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = list.find(p => p && fs.existsSync(p));
  if (!hit) throw new Error('Не найден Chrome. Укажите путь в переменной CHROME_PATH.');
  return hit;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--mute-audio'] });
const bot = fs.readFileSync(path.join(repo, 'tests', 'bot.js'), 'utf8');
let failed = 0;
try {
  for (const sc of SCENARIOS) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.addScriptTag({ content: bot });
    const r = await page.evaluate(async (players, days, map) => {
      genMap({ players, map });
      const gen = { objs: G.objs.length, towns: G.objs.filter(o => o.t === 'town').length, starts: G.players.map(p => { const t = G.objs.find(o => o.t === 'town' && o.owner === p.id); return t ? t.name : '—'; }) };
      const res = await BOT.run(days);
      const saved = (saveGame(), loadGame());
      return { errors: res.errors, day: res.day, over: res.over, ms: res.ms, battles: res.battles, sims: res.sims, map: res.map, captures: res.captures, eliminated: res.eliminated, saved: !!saved || res.over, gen, version: typeof VERSION === 'string' ? VERSION : null };
    }, sc.players, DAYS, sc.map);
    await page.close();
    const errors = [...r.errors, ...pageErrors];
    if (!r.saved) errors.push('сохранение не читается обратно');
    if (r.gen.starts.includes('—')) errors.push('у бригады нет стартового города: ' + r.gen.starts.join(', '));
    if (r.gen.towns < sc.players.length) errors.push('городов меньше, чем бригад');
    if (r.day < 3) errors.push('игра не продвинулась дальше дня ' + r.day);
    const tail = `карта ${r.map}×${r.map}, объектов ${r.gen.objs}, городов ${r.gen.towns}, день ${r.day}, боёв ${r.battles}, прикидок ${r.sims}, захватов ${r.captures}, выбыли: ${r.eliminated.join(', ') || 'никто'}, ${r.ms} мс`;
    if (errors.length) { failed++; console.log(`✗ ${sc.name}: ${tail}`); errors.slice(0, 5).forEach(e => console.log('    ' + e.split('\n').slice(0, 4).join('\n    '))); }
    else console.log(`✓ ${sc.name}: ${r.over ? 'партия доиграна' : `партия не закончилась за ${DAYS} дней (не ошибка)`}, ${tail}`);
  }
} finally { await browser.close(); server.close(); }
if (failed) { console.log(`\nУпало сценариев: ${failed}`); process.exit(1); }
console.log('\nВсе сценарии прошли.');
