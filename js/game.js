'use strict';
// Правила партии: ходы, экономика, движение героев, посещение объектов, захват, найм, сохранение.

let BUSY = false;
let SPEED = 1; // 0 — для автотестов: без пауз
const sleep = ms => (SPEED ? new Promise(r => setTimeout(r, ms * SPEED)) : Promise.resolve());
const curP = () => G.players[G.cur];
const weekNo = () => Math.floor((G.day - 1) / 7) + 1;
const dayOfWeek = () => (G.day - 1) % 7 + 1;
const heroById = id => G.heroes.find(h => h.id === id);
const myTowns = pid => G.objs.filter(o => o.t === 'town' && o.owner === pid);
const myHeroes = pid => G.heroes.filter(h => h.owner === pid);
const townAt = (x, y) => { const o = objAt(x, y); return o && o.t === 'town' ? o : null; };

function heroStats(h) {
  const s = { att: h.att, def: h.def, pow: h.pow, spd: 0, gold: 0 };
  for (const a of h.arts) { const A = ARTS[a]; s.att += A.att || 0; s.def += A.def || 0; s.pow += A.pow || 0; s.spd += A.spd || 0; s.gold += A.gold || 0; }
  return s;
}
const maxMana = h => 10 + 5 * heroStats(h).pow;
const armyCount = a => a.reduce((s, x) => s + (x ? x.n : 0), 0);
const armyValue = a => a.reduce((s, x) => s + (x ? x.n * UNITS[x.u].hp * (1 + UNITS[x.u].att / 10) : 0), 0);
function costText(c) { return RES.filter(r => c[r]).map(r => `${c[r]}${RES_ICON[r]}`).join(' ') || 'бесплатно'; }
function canPay(pid, c, mult = 1) { const r = G.players[pid].res; return RES.every(k => (r[k] || 0) >= (c[k] || 0) * mult); }
function pay(pid, c, mult = 1) { const r = G.players[pid].res; RES.forEach(k => { r[k] -= (c[k] || 0) * mult; }); }
function log(t) { G.log.unshift(`д.${G.day}: ${t}`); G.log.length = Math.min(G.log.length, 40); }

function dailyIncome(pid) {
  const inc = { gold: 0, fuel: 0, brick: 0 };
  for (const t of myTowns(pid)) inc.gold += TOWN_INCOME + (t.built.adm1 ? 500 : 0) + (t.built.adm2 ? 1000 : 0);
  for (const o of G.objs) if (o.t === 'mine' && o.owner === pid) inc[MINE[o.kind].res] += MINE[o.kind].amt;
  for (const h of myHeroes(pid)) inc.gold += heroStats(h).gold;
  return inc;
}

// ---------- ходы ----------
async function beginTurn() {
  const p = curP();
  if (G.day > 1) { const inc = dailyIncome(p.id); RES.forEach(r => p.res[r] += inc[r]); }
  for (const h of myHeroes(p.id)) {
    h.mp = heroMaxMp(h);
    h.mana = Math.min(maxMana(h), h.mana + (townAt(h.x, h.y) ? 99 : 5));
  }
  UI.sel = null; UI.plan = null;
  p.noTown = myTowns(p.id).length ? 0 : (p.noTown || 0) + 1;
  if (p.noTown >= 7) { G.heroes = G.heroes.filter(h => h.owner !== p.id); checkWin(); await ask(`💀 ${p.name}`, 'Неделя без своего города — пацаны разбежались. Бригада распалась.', ['Эх']); if (!G.over) await endTurn(); return; }
  await curtain(p);
  if (p.noTown) await ask('⚠️ Нет своего города!', `Осталось дней, чтобы захватить любой город: ${7 - p.noTown}. Иначе бригада распадётся.`, ['Понял']);
  if (G.week && p.weekSeen !== weekNo()) {
    p.weekSeen = weekNo();
    await ask(`📻 Неделя ${weekNo()}: ${G.week.title}`, G.week.text, ['Понятно']);
  }
  const hs = myHeroes(p.id);
  if (hs.length) selectHero(hs[0]); else { const t = myTowns(p.id)[0]; if (t) centerOn(t.x, t.y); }
  refresh();
}
async function endTurn() {
  if (BUSY || G.over) return;
  BUSY = true;
  let n = G.cur;
  do {
    n = (n + 1) % G.players.length;
    if (n === 0) { G.day++; G.firstDone = true; if (dayOfWeek() === 1) newWeek(); }
  } while (!G.players[n].alive);
  G.cur = n;
  saveGame();
  BUSY = false;
  await beginTurn();
}
function newWeek() {
  const ev = pick(WEEK_EVENTS);
  G.week = { title: ev.title, text: ev.text };
  for (const t of G.objs) if (t.t === 'town') {
    const units = FACTIONS[t.fac].units;
    units.forEach((u, i) => {
      if (!t.built['dw' + (i + 1)]) return;
      let g = UNITS[u].grow;
      if (i < 2 && t.built.gym) g = Math.ceil(g * 1.5);
      if (i === 0 && ev.grow1) g *= ev.grow1;
      t.avail[u] = (t.avail[u] || 0) + g;
    });
  }
  for (const o of G.objs) if (o.t === 'bonus' && o.kind === 'mp') o.seen = [];
  if (ev.fx) ev.fx(G);
}

// ---------- армия ----------
function addUnits(army, u, n) {
  const i = army.findIndex(s => s && s.u === u);
  if (i >= 0) { army[i].n += n; return true; }
  const j = army.findIndex(s => !s);
  if (j >= 0) { army[j] = { u, n }; return true; }
  return false;
}
// перенос/слияние/обмен слотов между двумя армиями; герою нельзя остаться совсем без отрядов
function moveSlot(A, i, B, j, aIsHero, bIsHero) {
  if (A === B && i === j) return;
  const a = A[i], b = B[j];
  if (!a) return;
  if (A !== B && aIsHero && !b && armyCount(A) === a.n) { toast('Герой не может остаться без пацанов'); return; }
  if (b && b.u === a.u) { b.n += a.n; A[i] = null; }
  else { A[i] = b; B[j] = a; }
  if (A !== B && aIsHero && armyCount(A) === 0) { A[i] = a; B[j] = b; toast('Герой не может остаться без пацанов'); }
  if (A !== B && bIsHero && armyCount(B) === 0) { A[i] = a; B[j] = b; }
}

// ---------- движение ----------
async function moveHero(h, plan) {
  if (BUSY || !plan) return;
  BUSY = true;
  let prevC = 0, arrived = plan.path.length === 0;
  for (let k = 0; k < plan.path.length; k++) {
    const st = plan.path[k], cost = st.c - prevC;
    if (h.mp + 0.01 < cost) { toast('Ход кончился. Продолжите завтра'); break; }
    h.mp = Math.max(0, h.mp - cost); prevC = st.c;
    h.x = st.x; h.y = st.y; reveal(h.owner, h.x, h.y, 6);
    sfx('step'); follow(h); refresh();
    await sleep(85);
    const last = k === plan.path.length - 1;
    const stop = await enterTile(h, last, plan.action);
    if (!heroById(h.id) || stop) { arrived = false; break; }
    if (last) arrived = true;
  }
  if (heroById(h.id) && arrived && plan.action) {
    if (h.mp <= 0 && plan.path.length === 0) toast('Нет хода — дерёмся завтра');
    else await doAction(h, plan.action);
  }
  h.dest = heroById(h.id) && !arrived ? { x: plan.tx, y: plan.ty } : null;
  if (!heroById(h.id)) UI.sel = null;
  UI.plan = null;
  checkWin();
  BUSY = false;
  refresh();
}

// что происходит, когда герой ступил на клетку; true — остановиться
async function enterTile(h, last, action) {
  const zone = mobZone(), zid = zone[h.y * MW + h.x];
  if (zid >= 0) {
    const mob = G.objs.find(o => o.id === zid);
    if (!(action && action.kind === 'mob' && action.id === zid)) await ask('Засада!', `Из подворотни выходят: ${armyText(mob.army)}.`, ['В бой']);
    const won = await fightMob(h, mob);
    if (!won) return true;
  }
  const o = objAt(h.x, h.y);
  if (!o) return false;
  const p = G.players[h.owner];
  if (o.t === 'pile') {
    p.res[o.res] += o.amt; sfx('coin'); toast(`+${o.amt} ${RES_ICON[o.res]} ${RES_NAME[o.res]}`);
    removeObj(o); return false;
  }
  if (o.t === 'mine') {
    if (o.owner !== h.owner) { o.owner = h.owner; reveal(h.owner, o.x, o.y, 3); sfx('flag'); toast(`${MINE[o.kind].name} теперь ваш: +${MINE[o.kind].amt} ${RES_ICON[MINE[o.kind].res]} в день`); log(`${p.name} взяли ${MINE[o.kind].name.toLowerCase()}`); }
    return false;
  }
  if (o.t === 'town') {
    if (o.owner === h.owner) { if (last) { BUSY = false; await openTown(o, h); BUSY = true; } return false; }
    await siege(h, o); return true;
  }
  if (o.t === 'chest') {
    const g = rnd(10, 20) * 100, xp = Math.round(g * 0.75);
    const c = await ask('📦 Общак', `Нашли чужой общак. Что делаем?`, [`Забрать ${g}💵`, `Раздать пацанам: +${xp} опыта`]);
    if (c === 0) p.res.gold += g; else await giveXp(h, xp);
    sfx('coin'); removeObj(o); return true;
  }
  if (o.t === 'art') {
    const A = ARTS[o.art];
    h.arts.push(o.art); sfx('level');
    await ask(`${A.em} ${A.name}`, `Нашли: ${A.desc}.`, ['Надеть']);
    log(`${h.name} нашёл ${A.name.toLowerCase()}`); removeObj(o); return true;
  }
  if (o.t === 'bonus') {
    const B = BONUS[o.kind];
    if (o.seen.includes(h.id)) { toast(o.kind === 'mp' ? 'Шаурма кончилась, приходите на следующей неделе' : 'Тут уже были'); return true; }
    o.seen.push(h.id); sfx('level');
    if (o.kind === 'att') h.att++; else if (o.kind === 'def') h.def++; else if (o.kind === 'pow') h.pow++; else if (o.kind === 'mp') h.mp += 40;
    await ask(`${B.em} ${B.name}`, B.text, ['Отлично']);
    if (o.kind === 'xp') await giveXp(h, 1000);
    return true;
  }
  return false;
}
function removeObj(o) { G.objs = G.objs.filter(x => x !== o); reindex(); }
const armyText = a => a.filter(Boolean).map(s => `${UNITS[s.u].em} ${UNITS[s.u].name} ×${s.n}`).join(', ');

async function doAction(h, act) {
  if (act.kind === 'mob') { const mob = G.objs.find(o => o.id === act.id); if (mob) await fightMob(h, mob); }
  else if (act.kind === 'meet') { const o = heroById(act.id); if (o) { BUSY = false; await openExchange(h, o); BUSY = true; } }
  else if (act.kind === 'hero') {
    const o = heroById(act.id); if (!o) return;
    const t = townAt(o.x, o.y);
    if (t) { await siege(h, t); return; }
    await fightHero(h, o, false);
  }
}

// ---------- бои ----------
function xpFromKills(before, after) {
  let xp = 0;
  before.forEach((s, i) => { if (!s) return; const left = after[i] ? after[i].n : 0; xp += (s.n - left) * UNITS[s.u].hp; });
  return xp * 3 + 200;
}
async function fightMob(h, mob) {
  const before = mob.army.map(s => s && { ...s });
  const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: mob.army, hero: null, owner: -1 }, title: 'Разборка с местными' });
  const p = G.players[h.owner];
  if (r.winner === 0) {
    h.army = r.aArmy; removeObj(mob);
    const loot = (mob.lvl || 1) * rnd(3, 6) * 100; p.res.gold += loot;
    await ask('Победа!', `Местные разбежались. В карманах нашлось ${loot}💵.`, ['Дальше']);
    await giveXp(h, xpFromKills(before, r.dArmy));
    return true;
  }
  mob.army = r.dArmy;
  await heroDies(h, 'полегла в подворотне');
  return false;
}
async function fightHero(h, o, inTown) {
  const t = inTown ? townAt(o.x, o.y) : null;
  const bA = h.army.map(s => s && { ...s }), bD = o.army.map(s => s && { ...s });
  const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: o.army, hero: o, owner: o.owner, fence: !!(t && t.built.fence) }, title: `${G.players[h.owner].name} против ${G.players[o.owner].name}` });
  h.army = r.aArmy; o.army = r.dArmy;
  const [win, lose, bL] = r.winner === 0 ? [h, o, bD] : [o, h, bA];
  const arts = lose.arts.slice();
  win.arts.push(...arts);
  await ask('Стрелка окончена', `${win.name} (${G.players[win.owner].name}) победил${arts.length ? ' и забрал: ' + arts.map(a => ARTS[a].em + ' ' + ARTS[a].name).join(', ') : ''}.`, ['Ясно']);
  await heroDies(lose, `проиграл стрелку против ${win.name}`);
  await giveXp(win, xpFromKills(bL, r.winner === 0 ? r.dArmy : r.aArmy) + 500);
  return r.winner === 0;
}
async function siege(h, t) {
  const p = G.players[h.owner];
  const def = heroAt(t.x, t.y);
  if (def && def.owner !== h.owner) { const won = await fightHero(h, def, true); if (!won) return; }
  if (!heroById(h.id)) return;
  const militia = armyCount(t.garrison) === 0;
  if (militia) { t.garrison = [{ u: FACTIONS[t.fac].units[0], n: 6 + 3 * weekNo() }, null, null, null, null]; await ask('Ополчение!', `Город пустой, но за него вышли дворовые: ${armyText(t.garrison)}.`, ['В бой']); }
  {
    const before = t.garrison.map(s => s && { ...s });
    const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: t.garrison, hero: null, owner: t.owner, fence: !!t.built.fence }, title: `Штурм: ${t.name}` });
    h.army = r.aArmy; t.garrison = militia ? [null, null, null, null, null] : r.dArmy;
    if (r.winner !== 0) { await heroDies(h, `полёг под стенами ${t.name}`); return; }
    await giveXp(h, xpFromKills(before, r.dArmy));
  }
  const old = t.owner;
  t.owner = h.owner; t.garrison = [null, null, null, null, null];
  h.x = t.x; h.y = t.y; reveal(h.owner, t.x, t.y, 8);
  sfx('flag'); log(`${p.name} взяли ${t.name}`);
  await ask('🚩 Город наш!', `${t.name} переходит к бригаде «${p.name}».${old >= 0 ? ' Бывшие хозяева в ярости.' : ''}`, ['Заходим']);
  checkWin();
}
async function heroDies(h, why) {
  G.heroes = G.heroes.filter(x => x !== h);
  log(`${h.name} (${G.players[h.owner].name}) ${why}`);
  if (UI.sel === h.id) UI.sel = null;
  checkWin();
}
async function giveXp(h, xp) {
  if (!heroById(h.id) || xp <= 0) return;
  h.xp += Math.round(xp);
  while (h.xp >= xpFor(h.lvl + 1)) {
    h.lvl++; sfx('level');
    const c = await ask(`⭐ ${h.name}: уровень ${h.lvl}!`, 'Авторитет растёт. Что прокачать?', ['⚔️ Атака +1', '🛡️ Защита +1', '😎 Понты +1']);
    if (c === 0) h.att++; else if (c === 1) h.def++; else h.pow++;
    h.mana = maxMana(h);
  }
}
function checkWin() {
  for (const p of G.players) if (p.alive && !myTowns(p.id).length && !myHeroes(p.id).length) {
    p.alive = false; log(`Бригада «${p.name}» распалась`);
    toast(`Бригада «${p.name}» распалась!`);
  }
  const alive = G.players.filter(p => p.alive);
  if (alive.length === 1 && !G.over) { G.over = true; localStorage.removeItem(SAVE_KEY); setTimeout(() => showVictory(alive[0]), 400); }
}

// ---------- город ----------
function buildState(t, b) {
  if (t.built[b.id]) return 'built';
  if (b.req && !t.built[b.req]) return 'req';
  if (t.builtDay === G.day) return 'today';
  if (!canPay(t.owner, b.cost)) return 'money';
  return 'ok';
}
function build(t, id) {
  const b = BLD[id];
  if (buildState(t, b) !== 'ok') return false;
  pay(t.owner, b.cost); t.built[id] = true; t.builtDay = G.day;
  if (b.tier) { const u = FACTIONS[t.fac].units[b.tier - 1]; t.avail[u] = (t.avail[u] || 0) + UNITS[u].grow; }
  sfx('build'); log(`${G.players[t.owner].name}: построили «${b.name}»`); return true;
}
function maxRecruit(t, u) {
  const c = UNITS[u].cost, r = G.players[t.owner].res;
  let n = t.avail[u] || 0;
  for (const k of RES) if (c[k]) n = Math.min(n, Math.floor(r[k] / c[k]));
  return Math.max(0, n);
}
function recruit(t, u, n, hero) {
  n = Math.min(n, maxRecruit(t, u)); if (n <= 0) return false;
  const target = addUnits(t.garrison, u, 0) ? t.garrison : hero && addUnits(hero.army, u, 0) ? hero.army : null;
  if (!target) { toast('Некуда ставить: все пять мест заняты'); return false; }
  addUnits(target, u, n); pay(t.owner, UNITS[u].cost, n); t.avail[u] -= n; sfx('coin'); return true;
}
function hireHero(t) {
  const p = G.players[t.owner];
  if (heroAt(t.x, t.y)) return 'В городе уже стоит герой';
  if (myHeroes(p.id).length >= MAX_HEROES) return `Больше ${MAX_HEROES} героев не прокормить`;
  if (p.res.gold < HERO_COST) return `Нужно ${HERO_COST}💵`;
  p.res.gold -= HERO_COST;
  const h = makeHero(p.id, t.fac, t.x, t.y);
  h.army[0] = { u: FACTIONS[t.fac].units[0], n: 8 }; h.mp = 0;
  G.heroes.push(h); sfx('level'); log(`${p.name} наняли ${h.name}`);
  return h;
}
function trade(pid, res, buy) {
  const r = G.players[pid].res;
  if (buy) { if (r.gold < TRADE_BUY) return false; r.gold -= TRADE_BUY; r[res]++; }
  else { if (r[res] < 1) return false; r[res]--; r.gold += TRADE_SELL; }
  sfx('coin'); return true;
}

// ---------- сохранение ----------
const SAVE_KEY = 'delyozh_save_v1';
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { console.warn('save failed', e); } }
function loadGame() {
  try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; G = JSON.parse(s); reindex(); return true; }
  catch (e) { return false; }
}
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
