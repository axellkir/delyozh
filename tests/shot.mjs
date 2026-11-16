// Снимки игры без окна — посмотреть глазами, что нарисовалось. Запуск: node tests/shot.mjs <папка для картинок> [число бригад]
// Делает: всю карту целиком, центр и стартовый район в настоящем масштабе.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'shots'), np = Number(process.argv[3] || 3), map = process.argv[4] || 'msk';
fs.mkdirSync(out, { recursive: true });
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(repo, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', e => console.log('ОШИБКА СТРАНИЦЫ:', String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: path.join(out, 'menu.png') });
const facs = ['kach', 'rynok', 'neform'];
const info = await page.evaluate((np, map, facs) => {
  window.curtain = async () => {};
  genMap({ map, players: Array.from({ length: np }, (_, i) => ({ name: PCOL_NAME[i], fac: facs[i % 3], kind: i ? 'bot' : 'human', col: PCOL[i] })) });
  SPEED = 0; startPlaying();
  viewP().seen.fill(1);
  // вся карта одной картинкой, с объектами
  const S = 1400, k = S / terr.width, o = document.createElement('canvas'); o.id = 'whole'; o.width = o.height = S; o.style.cssText = 'position:fixed;left:0;top:0;z-index:999';
  const x = o.getContext('2d'); x.drawImage(terr, 0, 0, S, S); x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const ob of G.objs) {
    const X = (ob.x + .5) * TS * k, Y = (ob.y + .5) * TS * k;
    if (ob.t === 'town') { x.fillStyle = ob.owner >= 0 ? pcol(ob.owner) : '#fff'; x.fillRect(X - 9, Y - 9, 18, 18); x.strokeStyle = '#000'; x.strokeRect(X - 9, Y - 9, 18, 18); x.font = 'bold 13px sans-serif'; x.lineWidth = 3; x.strokeText(ob.name, X, Y + 18); x.fillStyle = '#ffd21a'; x.fillText(ob.name, X, Y + 18); }
    else { x.fillStyle = ob.t === 'mob' ? '#f33' : ob.nm ? '#ff0' : ob.t === 'mine' ? '#0ff' : 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(X, Y, ob.nm ? 5 : 3, 0, 7); x.fill(); }
  }
  document.body.appendChild(o);
  const t = G.objs.find(q => q.t === 'town' && q.owner === 0);
  return { size: MW, objs: G.objs.length, home: [t.x, t.y, t.name], cx: Math.floor(MCX), cy: Math.floor(MCY) };
}, np, map, facs);
console.log(JSON.stringify(info));
// лист со всеми значками и спрайтами
await page.evaluate(() => {
  const ids = Object.keys(SPRITES), sc = 4, cell = 16 * sc + 12, cols = 18, o = document.createElement('canvas'); o.id = 'sheet';
  o.width = cols * cell; o.height = Math.ceil(ids.length / cols) * (cell + 14); o.style.cssText = 'position:fixed;left:0;top:0;z-index:1000;background:#3a3340';
  const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.font = '9px sans-serif';
  ids.forEach((id, i) => { const X = (i % cols) * cell + 6, Y = Math.floor(i / cols) * (cell + 14) + 4; x.fillStyle = ['#7b7464', '#3f7a36', '#4c4c54'][i % 3]; x.fillRect(X - 3, Y - 2, cell - 6, cell - 8); x.drawImage(SPRITES[id].frames[0], X, Y, 16 * sc, 16 * sc); x.fillStyle = '#fff'; x.fillText(id.slice(0, 13), X - 2, Y + 16 * sc + 10); });
  document.body.appendChild(o);
});
await page.screenshot({ path: path.join(out, 'sprites.png'), clip: { x: 0, y: 0, width: 1368, height: 480 } });
// кадры движения: покой, шаг врозь, шаг вместе, удар — у каждого бойца и героя
await page.evaluate(() => {
  document.getElementById('sheet').remove();
  const ids = Object.keys(SPRITES).filter(id => SPRITES[id].walk), sc = 4, w = 16 * sc, cols = 8, o = document.createElement('canvas'); o.id = 'sheet';
  o.width = cols * (w * 4 + 14); o.height = Math.ceil(ids.length / cols) * (w + 16); o.style.cssText = 'position:fixed;left:0;top:0;z-index:1000;background:#3a3340';
  const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.font = '9px sans-serif';
  ids.forEach((id, i) => { const X = (i % cols) * (w * 4 + 14) + 4, Y = Math.floor(i / cols) * (w + 16) + 2, S = SPRITES[id]; x.fillStyle = '#6d6a5c'; x.fillRect(X - 2, Y, w * 4 + 4, w + 2); [S.frames[0], S.walk[0], S.walk[1], S.atk[0]].forEach((f, k) => x.drawImage(f, X + k * w, Y, w, w)); x.fillStyle = '#fff'; x.fillText(id.slice(0, 22), X, Y + w + 11); });
  document.body.appendChild(o);
});
await page.screenshot({ path: path.join(out, 'frames.png'), clip: { x: 0, y: 0, width: 1440, height: 340 } });
await page.evaluate(() => document.getElementById('sheet').remove());
await page.screenshot({ path: path.join(out, 'whole.png'), clip: { x: 0, y: 0, width: 1400, height: 900 } });
await page.setViewport({ width: 1400, height: 1400 });
await page.screenshot({ path: path.join(out, 'whole-full.png'), clip: { x: 0, y: 0, width: 1400, height: 1400 } });
await page.setViewport({ width: 1440, height: 900 });
for (const [name, x, y] of [['center', info.cx - 1, info.cy], ['home', info.home[0], info.home[1]]]) {
  await page.evaluate((x, y) => { const w = document.getElementById('whole'); if (w) w.remove(); document.querySelectorAll('.ov').forEach(e => { e.hidden = true; }); centerOn(x, y); }, x, y);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(out, name + '.png') });
}
// окно города и бой со штурмом (забор, бочки)
await page.evaluate(() => { const t = myTowns(0)[0]; t.built.dw2 = t.built.dw3 = true; t.avail[FACTIONS[t.fac].units[1]] = 9; openTown(t, heroAt(t.x, t.y)); });
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: path.join(out, 'town.png') });
await page.evaluate(() => { closeTown(); SPEED = 1; });
// бои на разных полях: штурм рынка с забором, парк, подвал, Красная площадь
for (const [arena, fence] of [['market', true], ['park', false], ['basement', false], ['kremlin', false], ['street', false], ['gym', true]]) {
  await page.evaluate((arena, fence) => {
    if (B) endBattle(0);
    document.querySelectorAll('.ov').forEach(e => { e.hidden = true; });
    const h = G.heroes[0]; h.army = [{ u: 'gop', n: 14 }, { u: 'metal', n: 9 }, { u: 'byk', n: 4 }, { u: 'ekstra', n: 1 }, { u: 'shpana', n: 30 }];
    runBattle({ a: { army: h.army, hero: h, owner: 0 }, d: { army: [{ u: 'chop', n: 8 }, { u: 'buh', n: 4 }, { u: 'babka', n: 12 }, { u: 'chelnok', n: 20 }, { u: 'fura', n: 1 }], hero: null, owner: -1, fence }, title: 'Проверка поля', arena });
    setTimeout(() => { const t = B.stacks.find(s => s.side === 1); burst(t.x, t.y, 14, ['#ffd21a', '#fff', '#f08a2c'], { v: 0.09 }); floatText(t, 'ФАРТ! −48', '#ffd21a'); }, 450);
  }, arena, fence);
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(out, `arena-${arena}.png`), clip: { x: 0, y: 0, width: 1140, height: 900 } });
}
await browser.close(); server.close();
