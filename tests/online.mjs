// Автотест игры по сети: поднимает сервер комнат, два браузера (как два разных компьютера) создают комнату,
// садятся, начинают партию с ботом и играют по очереди. Проверяет, что ход переходит между компьютерами
// и что у обоих в итоге одна и та же партия. Запуск: npm run test:online
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(repo, process.env.TEST_ROOT || '.');
const DAYS = Number(process.env.TEST_DAYS || 12), port = 18000 + Math.floor(Math.random() * 2000);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'delyozh-'));
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(p => p && fs.existsSync(p));
const srv = spawn(process.execPath, [path.join(repo, 'server', 'server.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATIC_DIR: root, DATA_DIR: data }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const url = `http://127.0.0.1:${port}/`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 300000, args: ['--no-sandbox', '--mute-audio'] });
const errors = [];
async function client(name) {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${String(e && e.stack || e)}`));
  // 403 и 409 — ожидаемые отказы сервера: тест нарочно пробует то, что гостю нельзя
  page.on('console', m => { if (m.type() === 'error' && !/status of 40[39]/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load' });
  // окна и шторки отвечают сами, паузы выключены; свой ход играет ИИ из игры
  await page.evaluate(n => {
    SPEED = 0; NET.name = n; window.AUTOBATTLE = true;
    window.ask = async (t, h, b) => (t.includes('уровень') ? rnd(0, 2) : 0);
    window.curtain = async () => {}; window.openTown = async () => {}; window.openExchange = async () => {};
    window.__turns = 0; window.__stop = false;
    window.__auto = async days => {
      while (!window.__stop) {
        if (G && G.over) break;
        if (G && G.day > days) break;
        if (G && NET.auth && NET.mine.has(G.cur) && !BUSY && !BOTTING && !B && NET.introTurn === G.turnNo) { await aiPlay(curP()); window.__turns++; await endTurn(); }
        await new Promise(r => setTimeout(r, 30));
      }
    };
  }, name);
  return page;
}
const wait = async (page, fn, what, ms = 20000) => { try { await page.waitForFunction(fn, { timeout: ms }); } catch (e) { throw new Error(`не дождались: ${what}`); } };
let failed = false;
try {
  const A = await client('Вася'), Bp = await client('Петя');
  // Вася создаёт открытую комнату: два человека и злой бот
  await A.evaluate(async () => { seats[0].kind = 'human'; seats[1].kind = 'human'; seats[2].kind = 'bot'; seats[2].diff = 2; seats[3].kind = seats[4].kind = seats[5].kind = 'off'; await netCreate(true); });
  const code = await A.evaluate(() => NET.code);
  // Петя видит комнату в списке открытых, входит и садится
  const listed = await Bp.evaluate(async () => { await netList(); return (NET.list || []).map(r => r.code); });
  if (!listed.includes(code)) throw new Error('комнаты нет в списке открытых');
  await Bp.evaluate(async c => { await netJoin(c); }, code);
  const denied = await Bp.evaluate(async () => { try { await netReq('POST', `api/rooms/${NET.code}/op`, { cid: NET.cid, op: 'kind', seat: 2, kind: 'off' }); return false; } catch (e) { return true; } });
  if (!denied) throw new Error('гость смог поменять чужое место');
  await Bp.evaluate(async () => { await netOp('claim', { seat: 1 }); await netOp('set', { seat: 1, fac: 'neform', hero: 1, seatName: 'Петины' }); });
  await wait(A, () => NET.room && NET.room.seats[1].owner === 'other' && NET.room.seats[1].name === 'Петины' && !document.getElementById('newBtn').disabled, 'Вася видит, что Петя сел');
  // чужой не может начать и не может прислать снимок
  const noStart = await Bp.evaluate(async () => { try { await netReq('POST', `api/rooms/${NET.code}/start`, { cid: NET.cid, snap: '{}' }); return false; } catch (e) { return true; } });
  if (!noStart) throw new Error('гость смог начать партию');
  await A.evaluate(() => { document.getElementById('newBtn').click(); });
  await wait(Bp, () => !!G && document.getElementById('menu').hidden, 'Петя получил партию');
  A.evaluate(d => window.__auto(d), DAYS); Bp.evaluate(d => window.__auto(d), DAYS);
  await A.waitForFunction(d => G && (G.over || G.day > d), { timeout: 120000 }, DAYS);
  await Bp.waitForFunction(d => G && (G.over || G.day > d), { timeout: 60000 }, DAYS);
  await new Promise(r => setTimeout(r, 1500));
  const st = p => p.evaluate(() => ({ day: G.day, cur: G.cur, over: G.over, turnNo: G.turnNo, turns: window.__turns, sv: NET.sv, auth: NET.auth, mine: [...NET.mine], heroes: G.heroes.length, objs: G.objs.length, gold: G.players.map(x => x.res.gold).join(','), alive: G.players.map(x => +x.alive).join(''), seenMe: viewP().name }));
  const a = await st(A), b = await st(Bp);
  console.log('Вася:', JSON.stringify(a)); console.log('Петя:', JSON.stringify(b));
  for (const k of ['day', 'cur', 'over', 'turnNo', 'heroes', 'objs', 'gold', 'alive']) if (a[k] !== b[k]) errors.push(`партии разошлись: ${k} — ${a[k]} у Васи, ${b[k]} у Пети`);
  if (!a.over && (a.turns < 3 || b.turns < 3)) errors.push(`мало сыграно ходов: Вася ${a.turns}, Петя ${b.turns}`);
  if (a.auth && b.auth) errors.push('право хода сразу у обоих');
  if (a.seenMe === b.seenMe) errors.push('оба смотрят глазами одной бригады');
  // Петя перезагружает страницу по ссылке и возвращается в ту же партию
  await Bp.goto(url + '?room=' + code, { waitUntil: 'load' });
  await wait(Bp, () => !!G && NET.on && document.getElementById('menu').hidden, 'Петя вернулся в партию после перезагрузки');
  const back = await Bp.evaluate(() => ({ day: G.day, mine: [...NET.mine] }));
  if (back.day !== a.day || back.mine.join() !== b.mine.join()) errors.push('после перезагрузки партия или место не те: ' + JSON.stringify(back));
} catch (e) { errors.push(String(e && e.message || e)); }
finally { await browser.close(); srv.kill(); fs.rmSync(data, { recursive: true, force: true }); }
if (errors.length) { failed = true; console.log('✗ Игра по сети'); errors.slice(0, 8).forEach(e => console.log('    ' + e.split('\n').slice(0, 4).join('\n    '))); }
else console.log('✓ Игра по сети: комната, список, права, партия на двух компьютерах с ботом, возврат по ссылке');
process.exit(failed ? 1 : 0);
