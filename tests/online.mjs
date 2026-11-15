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
const SEQ = process.env.TEST_TURNS === 'seq', DAYS = Number(process.env.TEST_DAYS || 12), port = 18000 + Math.floor(Math.random() * 2000);
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
    window.__turns = 0; window.__stop = false; window.__live = 0;
    // живая защита: когда на нас напали и ход за нашим отрядом — три раза встаём в оборону, дальше отдаём ИИ
    setInterval(() => { if (B && B.mirror && B.wait) { window.__live++; netCmd({ k: window.__live % 4 ? 'defend' : 'auto' }); } }, 40);
    window.__auto = async days => {
      while (!window.__stop) {
        if (G && G.over) break;
        if (G && G.day > days) break;
        if (G && (G.sim ? NET.simActive : NET.auth) && NET.mine.has(G.cur) && !BUSY && !BOTTING && !B && NET.introTurn === G.turnNo) { if (G.sim) window.__simTurns = (window.__simTurns || 0) + 1; await aiPlay(curP()); window.__turns++; await endTurn(); }
        await new Promise(r => setTimeout(r, 30));
      }
    };
  }, name);
  return page;
}
const wait = async (page, fn, what, ms = 20000, ...args) => { try { await page.waitForFunction(fn, { timeout: ms }, ...args); } catch (e) { throw new Error(`не дождались: ${what}`); } };
let failed = false;
try {
  const A = await client('Вася'), Bp = await client('Петя');
  globalThis.__A = A; globalThis.__B = Bp;
  // Вася создаёт открытую комнату: два человека и злой бот
  await A.evaluate(async seq => { seats[0].kind = 'human'; seats[1].kind = 'human'; seats[2].kind = 'bot'; seats[2].diff = 2; seats[3].kind = seats[4].kind = seats[5].kind = 'off'; await netCreate(true); if (seq) await netOp('turns', { turns: 'seq' }); }, SEQ);
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
  A.evaluate(d => window.__auto(d), DAYS).catch(() => {}); Bp.evaluate(d => window.__auto(d), DAYS).catch(() => {});
  await A.waitForFunction(d => G && (G.over || G.day > d), { timeout: 120000 }, DAYS);
  await Bp.waitForFunction(d => G && (G.over || G.day > d), { timeout: 60000 }, DAYS);
  await new Promise(r => setTimeout(r, 1500));
  const st = p => p.evaluate(() => ({ day: G.day, cur: G.cur, over: G.over, turnNo: G.turnNo, turns: window.__turns, simTurns: window.__simTurns || 0, simDays: G.simDays || 0, sim: !!G.sim, sv: NET.sv, auth: NET.auth, mine: [...NET.mine], heroes: G.heroes.length, objs: G.objs.length, gold: G.players.map(x => x.res.gold).join(','), alive: G.players.map(x => +x.alive).join(''), seenMe: viewP().name }));
  const a = await st(A), b = await st(Bp);
  console.log('Вася:', JSON.stringify(a)); console.log('Петя:', JSON.stringify(b));
  // в общий день у каждого своя копия, но в его начале (до ходов) они совпадают; «чей ход» там у каждого свой
  for (const k of ['day', 'over', 'turnNo', 'heroes', 'objs', 'gold', 'alive', ...(a.sim ? [] : ['cur'])]) if (a[k] !== b[k]) errors.push(`партии разошлись: ${k} — ${a[k]} у Васи, ${b[k]} у Пети`);
  if (!a.over && (a.turns < 3 || b.turns < 3)) errors.push(`мало сыграно ходов: Вася ${a.turns}, Петя ${b.turns}`);
  if (a.auth && b.auth) errors.push('право хода сразу у обоих');
  if (!SEQ && (!a.simDays || !a.simTurns || !b.simTurns)) errors.push(`одновременных дней не было: дней ${a.simDays}, ходов Васи ${a.simTurns}, Пети ${b.simTurns}`);
  if (SEQ && a.simDays) errors.push('в режиме «по очереди» случился общий день');
  if (a.seenMe === b.seenMe) errors.push('оба смотрят глазами одной бригады');
  // живая защита: тот, у кого ход, нападает на героя соперника; бой должен показаться у соперника, и он должен успеть покомандовать
  // для этой проверки возвращаем партию в режим «по очереди»: хозяин объявляет обычный день со своим ходом
  if (a.sim) {
    await A.evaluate(async () => { G.sim = false; NET.simActive = false; G.cur = [...NET.mine][0]; NET.auth = true; await netSend(netPack(), netMeta(), G.players[G.cur].seat); });
    await wait(Bp, () => G && !G.sim && !NET.simActive, 'Петя вышел из общего дня');
  }
  const authA = await A.evaluate(() => NET.auth && NET.mine.has(G.cur));
  const [X, Y] = authA ? [A, Bp] : [Bp, A];
  const fight = await X.evaluate(async () => {
    const me = [...NET.mine][0], h = myHeroes(me)[0], o = G.heroes.find(q => netRemote(q.owner));
    if (!h || !o || !NET.auth) return null;
    h.army = [{ u: 'byk', n: 3 }, { u: 'gop', n: 10 }, null, null, null]; o.army = [{ u: 'chop', n: 6 }, { u: 'metal', n: 8 }, null, null, null];
    BUSY = true; const won = await fightHero(h, o, false); BUSY = false; checkWin(); refresh();
    return { won, heroes: G.heroes.length };
  });
  if (fight) {
    await wait(Y, n => !B && G.heroes.length === n, 'соперник получил итог боя', 30000, fight.heroes).catch(async () => {
      const dump = p => p.evaluate(() => JSON.stringify({ b: B ? { mirror: !!B.mirror, need: B.need, round: B.round } : null, heroes: G.heroes.length, day: G.day, cur: G.cur, over: G.over, on: NET.on, auth: NET.auth, sv: NET.sv, bv: NET.bv, timer: !!NET.timer, busy: BUSY, botting: BOTTING, sim: !!G.sim, room: NET.room && { sv: NET.room.sv, bv: NET.room.bv, auth: NET.room.auth, state: NET.room.state }, toast: document.getElementById('toast').textContent }));
      errors.push(`итог боя не дошёл до соперника (ждали героев: ${fight.heroes}); нападавший: ${await dump(X)}; защитник: ${await dump(Y)}`);
    });
    const live = await Y.evaluate(() => window.__live);
    console.log(`Живая защита: команд защитника ${live}, победа нападавшего: ${fight.won}`);
    if (!live) errors.push('защитник ни разу не получил управление своими отрядами');
  } else console.log('Живая защита: не нашлось пары героев для проверки');
  // Петя перезагружает страницу по ссылке и возвращается в ту же партию
  await Bp.goto(url + '?room=' + code, { waitUntil: 'load' });
  await wait(Bp, () => !!G && NET.on && document.getElementById('menu').hidden, 'Петя вернулся в партию после перезагрузки');
  const back = await Bp.evaluate(() => ({ day: G.day, mine: [...NET.mine] }));
  if (back.day < a.day || back.mine.join() !== b.mine.join()) errors.push('после перезагрузки партия или место не те: ' + JSON.stringify(back));
} catch (e) {
  errors.push(String(e && e.message || e));
  // что было у обоих в момент сбоя — чтобы понять, где встала партия
  for (const [n, p] of [['Вася', globalThis.__A], ['Петя', globalThis.__B]]) try { if (p) console.log(n, await p.evaluate(() => JSON.stringify(G ? { day: G.day, cur: G.cur, sim: !!G.sim, simDay: G.simDay, pending: !!G.simPending, turnNo: G.turnNo, auth: NET.auth, simActive: NET.simActive, simSent: NET.simSent, netSimDay: NET.simDay, merging: NET.merging, mine: [...NET.mine], busy: BUSY, bot: BOTTING, b: !!B, intro: NET.introTurn, room: NET.room && { host: NET.room.host, auth: NET.room.auth, subn: NET.room.subn, subw: NET.room.subw, hostSeat: NET.room.hostSeat, turns: NET.room.turns, sv: NET.room.sv }, modal: !document.getElementById('modal').hidden, toast: document.getElementById('toast').textContent } : 'нет партии'))); } catch (x) { /* страница уже закрыта */ }
}
finally { await browser.close(); srv.kill(); fs.rmSync(data, { recursive: true, force: true }); }
if (errors.length) { failed = true; console.log('✗ Игра по сети'); errors.slice(0, 8).forEach(e => console.log('    ' + e.split('\n').slice(0, 4).join('\n    '))); }
else console.log(`✓ Игра по сети (${SEQ ? 'ходы по очереди' : 'одновременные ходы'}): комната, список, права, партия на двух компьютерах с ботом, живая защита, возврат по ссылке`);
process.exit(failed ? 1 : 0);
