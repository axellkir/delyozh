// Автотест без окна: открывает игру в Chrome, бот играет партии за всех игроков.
// Падает, если в игре случилась ошибка. Запуск: npm test  (TEST_ROOT=dist — проверить сборку)
import os from 'node:os';
import { spawn } from 'node:child_process';
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

// настоящий сервер: игра и комнаты вместе, как при локальном запуске
const port = 15000 + Math.floor(Math.random() * 2000), data = fs.mkdtempSync(path.join(os.tmpdir(), 'delyozh-'));
const server = spawn(process.execPath, [path.join(repo, 'server', 'server.mjs')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATIC_DIR: root, DATA_DIR: data }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));
const url = `http://127.0.0.1:${port}/`;

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
  // правила крыши и плена — на заранее собранном положении, без случайностей
  {
    const page = await browser.newPage(); const perr = [];
    page.on('pageerror', e => perr.push(String(e && e.stack || e)));
    await page.goto(url, { waitUntil: 'load' });
    await page.addScriptTag({ content: bot });
    const r = await page.evaluate(async () => {
      genMap({ players: [{ name: 'А', fac: 'kach', kind: 'human' }, { name: 'Б', fac: 'rynok', kind: 'human' }] });
      window.ask = async () => 0; window.curtain = async () => {}; SPEED = 0; window.AUTOBATTLE = true;
      const out = {}, m = G.objs.find(o => o.t === 'mine'), res = MINE[m.kind].res, amt = mineOf(m).amt;
      m.owner = 1; const full = dailyIncome(1)[res];
      m.roof = { owner: 0, army: [{ u: 'gop', n: 5 }, null, null, null, null], known: false };
      out.ownerCut = full - dailyIncome(1)[res]; out.roofGain = dailyIncome(0)[res] - 0; out.half = Math.ceil(amt / 2);
      const base0 = (() => { const r0 = m.roof; m.roof = null; const v = dailyIncome(0)[res]; m.roof = r0; return v; })();
      out.roofGain = dailyIncome(0)[res] - base0;
      newWeek(); out.known = m.roof.known; out.told = G.players[1].inbox.some(x => x.includes('смотрящие'));
      // плен: герой А проигрывает бригаде Б, его держат в городе Б; выкуп идёт Б
      const h = myHeroes(0)[0], lvl = h.lvl, t0 = myTowns(0)[0], gold1 = G.players[1].res.gold;
      t0.garrison = [{ u: 'shpana', n: 1 }, null, null, null, null];
      await heroDies(h, 'проверка', 1);
      const j = myJailed(0)[0];
      out.jailed = !!j && j.captor === 1 && !!j.at && myHeroes(0).length === 0; out.alive = G.players[0].alive; out.price = j ? ransomOf(j) : -1; out.wantPrice = 1000 + 500 * lvl;
      G.players[0].res.gold = 100; out.poor = typeof ransom(t0, j) === 'string';
      G.players[0].res.gold = 50000; const back = ransom(t0, j);
      out.back = typeof back === 'object' && myHeroes(0).length === 1 && myJailed(0).length === 0 && back.lvl === lvl && armyCount(back.army) > 0;
      out.paid = G.players[1].res.gold - gold1;
      // взяли город, где держат своего, — он выходит бесплатно
      const h2 = myHeroes(0)[0]; await heroDies(h2, 'проверка', 1); const j2 = myJailed(0)[0], prison = G.objs.find(o => o.id === j2.at);
      prison.owner = 1; for (const x of jail()) if (x.at === prison.id) x.captor = 0; out.free = ransomOf(j2) === 0;
      // розыск: копится, в понедельник назначается облава, взятка снимает
      const P = G.players[0]; P.heat = 0; P.raid = false;
      addHeat(0, 70); out.heat = P.heat; out.stars = heatStars(P);
      P.res.gold = 10; out.noBribe = typeof bribe(0) === 'string';
      newWeek(); out.raidSet = P.raid === true;
      P.res.gold = 99999; const cost = bribeCost(P); out.bribed = bribe(0) === true && P.heat === 0 && P.raid === false && P.res.gold === 99999 - cost;
      addHeat(0, 80); P.raid = true; await raidCheck(P); out.raidDone = P.raid === false && P.heat < 80;
      turnEffects(Object.assign(P, { turnDay: -1 })); out.cools = true;
      // дефолт: казна вчетверо меньше, рынок втрое дороже, случается один раз
      G.def = { week: weekNo(), done: false }; G.players.forEach(x => { x.res.gold = 8000; });
      const buy0 = tradeBuy(); newWeek();
      out.defGold = G.players.map(x => x.res.gold).join(','); out.defTitle = G.week.title; out.buy = [buy0, tradeBuy(), tradeSell()].join(',');
      G.players.forEach(x => { x.res.gold = 8000; }); newWeek(); out.defOnce = G.players.every(x => x.res.gold >= 6000);
      // дела недели: ваучеры дают доход, пирамида либо удваивает, либо сгорает
      window.ask = async () => 0;
      const Q = G.players[0]; Q.res.gold = 10000; Q.alive = true; const inc0 = dailyIncome(0).gold;
      await weekDeal(Q, 'voucher'); out.voucher = Q.res.gold === 7500 && dailyIncome(0).gold - inc0 === 250;
      Q.res.gold = 10000; await weekDeal(Q, 'pyramid'); out.pyrIn = Q.res.gold === 7000 && !!Q.pyramid && Q.pyramid.amt === 3000;
      Q.pyramid.week = weekNo(); out.pyrWin = pyramidResolve(Q, 0.1).includes('6000') && Q.res.gold === 13000;
      Q.pyramid = { amt: 3000, week: weekNo() }; out.pyrLose = pyramidResolve(Q, 0.9).includes('лопнула') && Q.res.gold === 13000;
      // ключ: держали семь дней — победа; потеряли вместе с героем у местных — ключ вернулся в Кремль
      G.over = false; G.objs = G.objs.filter(o => !(o.t === 'art' && o.art === 'key')); reindex();
      const kt = myTowns(0)[0], kh = makeHero(0, 'kach', kt.x, kt.y); kh.army = [{ u: 'gop', n: 5 }, null, null, null, null]; kh.arts.push('key'); G.heroes.push(kh); G.keyHold = null;
      checkWin(); out.keyStart = G.keyHold.owner === 0 && keyState().left === KEY_DAYS && !G.over;
      await heroDies(kh, 'проверка'); out.keyBack = G.objs.some(o => o.t === 'art' && o.art === 'key') && !G.heroes.some(x => x.arts.includes('key'));
      const kh2 = makeHero(0, 'kach', kt.x, kt.y); kh2.army = [{ u: 'gop', n: 5 }, null, null, null, null]; kh2.arts.push('key'); G.heroes.push(kh2);
      G.objs = G.objs.filter(o => !(o.t === 'art' && o.art === 'key')); reindex();
      checkWin(); G.day += KEY_DAYS - 1; checkWin(); out.keyNotYet = !G.over; G.day += 1; checkWin(); out.keyWin = G.over && G.winBy === 'key' && G.winner === 0;
      // заказы: разогнать местных, сдать общак, довезти груз, просрочка
      G.over = false; const J = G.players[0]; J.alive = true; J.jobs = []; J.heat = 0;
      const mob = G.objs.find(o => o.t === 'mob' && !o.boss), g0 = J.res.gold;
      J.offers = [{ id: 't1', type: 'clear', target: mob.id, reward: { gold: 1000 }, boss: 'Седой', days: 7 }, { id: 't2', type: 'tribute', res: 'brick', amt: 5, reward: { gold: 500 }, heat: 25, boss: 'Седой', days: 7 }];
      out.take = jobTake(J, 't1') === true && jobTake(J, 't2') === true && J.jobs.length === 2 && J.jobs[0].until === G.day + 7;
      jobEvent(0, 'mob', mob.id); out.clear = J.res.gold === g0 + 1000 && J.jobs.length === 1;
      J.res.brick = 3; out.tribPoor = typeof jobTribute(J, J.jobs[0]) === 'string';
      J.res.brick = 9; addHeat(0, 40); out.trib = jobTribute(J, J.jobs[0]) === true && J.res.brick === 4 && J.heat === 15 && J.jobs.length === 0;
      const A = G.objs.find(o => o.t === 'mine'), Bo = G.objs.find(o => o.t === 'town' && o !== A), hj = makeHero(0, 'kach', A.x, A.y); hj.army = [{ u: 'gop', n: 3 }, null, null, null, null]; G.heroes.push(hj);
      J.jobs = [{ id: 't3', type: 'deliver', from: A.id, to: Bo.id, target: A.id, stage: 0, carrier: 0, reward: { gold: 700 }, boss: 'Седой', until: G.day + 7 }];
      const g1 = J.res.gold; jobStep(hj); out.pick = J.jobs[0].stage === 1 && J.jobs[0].carrier === hj.id;
      hj.x = Bo.x; hj.y = Bo.y; jobStep(hj); out.deliver = J.jobs.length === 0 && J.res.gold === g1 + 700;
      J.jobs = [{ id: 't4', type: 'tribute', res: 'fuel', amt: 99, reward: { gold: 1 }, boss: 'Седой', until: G.day - 1 }]; J.heat = 0; jobsTick(J); out.late = J.jobs.length === 0 && J.heat === JOB_FAIL_HEAT;
      J.offerWeek = -1; jobsTick(J); out.offers = (J.offers || []).length >= 2;
      // герой на поле: выходит отдельным бойцом, поле без армии не держит, после боя в армию не попадает
      const hb = makeHero(0, 'kach', 0, 0); hb.lvl = 8; hb.army = [{ u: 'rat', n: 1 }, null, null, null, null];
      const rb = await runBattle({ a: { army: hb.army.map(x => x && { ...x }), hero: hb, owner: 0 }, d: { army: [{ u: 'omon', n: 30 }, null, null, null, null], hero: null, owner: -1 }, title: 'проверка', sim: true });
      out.heroLose = rb.winner === 1 && !rb.aArmy.some(x => x && x.u.startsWith('hero_')) && !!UNITS['hero_' + hb.id] && UNITS['hero_' + hb.id].hp === 30 + 12 * 8;
      return out;
    });
    await page.close();
    const bad = [];
    if (!r.take || !r.clear) bad.push(`заказы: взять ${r.take}, разогнать ${r.clear}`);
    if (!r.tribPoor || !r.trib) bad.push(`общак: без ресурсов ${r.tribPoor}, сдали ${r.trib}`);
    if (!r.pick || !r.deliver) bad.push(`груз: забрали ${r.pick}, довезли ${r.deliver}`);
    if (!r.late) bad.push('просроченный заказ не снят или розыск не вырос');
    if (!r.offers) bad.push('по понедельникам нет предложений');
    if (!r.heroLose) bad.push('герой в бою: без армии поле удержал, попал в армию или неверное здоровье');
    if (!r.voucher) bad.push('ваучеры: не списались деньги или не прибавился доход');
    if (!r.pyrIn || !r.pyrWin || !r.pyrLose) bad.push(`пирамида: вклад ${r.pyrIn}, выигрыш ${r.pyrWin}, проигрыш ${r.pyrLose}`);
    if (!r.keyStart) bad.push('ключ: отсчёт не начался');
    if (!r.keyBack) bad.push('ключ не вернулся в Кремль после потери героя');
    if (!r.keyNotYet || !r.keyWin) bad.push(`ключ: рано ${!r.keyNotYet}, победа ${r.keyWin}`);
    if (r.heat !== 70 || r.stars !== 3) bad.push(`розыск считается неверно: ${r.heat}, звёзд ${r.stars}`);
    if (!r.noBribe) bad.push('взятка прошла без денег');
    if (!r.raidSet) bad.push('при розыске 70 облава в понедельник не назначена');
    if (!r.bribed) bad.push('взятка не сняла розыск или списала не ту сумму');
    if (!r.raidDone) bad.push('облава не отработала');
    if (r.defGold !== '2000,2000' || r.defTitle !== 'Дефолт!') bad.push(`дефолт: казна ${r.defGold}, событие «${r.defTitle}»`);
    if (r.buy !== '300,900,300') bad.push(`цены рынка до и после дефолта: ${r.buy}`);
    if (!r.defOnce) bad.push('дефолт случился второй раз');
    if (r.ownerCut !== r.half || r.roofGain !== r.half) bad.push(`крыша делит доход неверно: хозяин теряет ${r.ownerCut}, крыша получает ${r.roofGain}, ждали ${r.half}`);
    if (!r.known || !r.told) bad.push('хозяин не узнал о крыше в понедельник');
    if (!r.jailed) bad.push('проигравший герой не попал в плен в город победителя');
    if (!r.alive) bad.push('бригада с городом распалась, хотя герой всего лишь в плену');
    if (r.price !== r.wantPrice) bad.push(`выкуп ${r.price}, ждали ${r.wantPrice}`);
    if (!r.poor) bad.push('выкуп прошёл без денег');
    if (!r.back) bad.push('после выкупа герой не вернулся с уровнем и отрядом');
    if (r.paid !== r.price) bad.push(`победителю пришло ${r.paid}, ждали ${r.price}`);
    if (!r.free) bad.push('освобождённый герой всё ещё стоит денег');
    bad.push(...perr);
    if (bad.length) { failed++; console.log('✗ Правила: крыша и плен'); bad.forEach(e => console.log('    ' + e.split('\n').slice(0, 3).join('\n    '))); }
    else console.log('✓ Правила: крыша, плен, розыск, дефолт, дела недели, Ключ, заказы авторитетов, герой на поле');
  }
} finally { await browser.close(); server.kill(); fs.rmSync(data, { recursive: true, force: true }); }
if (failed) { console.log(`\nУпало сценариев: ${failed}`); process.exit(1); }
console.log('\nВсе сценарии прошли.');
process.exit(0);
