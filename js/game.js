'use strict';
// Правила партии: ходы, экономика, движение героев, посещение объектов, захват, найм, сохранение.

let BUSY = false;
let BOTTING = false; // сейчас ходит бот: люди смотрят, ввод с карты заблокирован
let SPEED = 1; // 0 — для автотестов и быстрых боёв: без пауз
const sleep = ms => (SPEED && ms > 0 ? new Promise(r => setTimeout(r, ms * SPEED)) : Promise.resolve());
const humans = () => G.players.filter(p => p.kind !== 'bot');
// точка на карте может носить своё имя (Лужники, Останкино…) поверх обычных «ларёк», «видеосалон»
const mineOf = o => ({ ...MINE[o.kind], ...(o.nm && { name: o.nm }), ...(o.amt && { amt: o.amt }) });
const bonusOf = o => ({ ...BONUS[o.kind], ...(o.nm && { name: o.nm }), ...(o.txt && { text: o.txt }) });
const pcol = pid => (G.players[pid] && G.players[pid].col) || PCOL[pid] || '#aaa';
const viewP = () => G.players[NET.on ? netViewId() : G.view == null ? G.cur : G.view]; // чьими глазами показываем карту
// сообщение живому игроку, которое он увидит в начале своего хода
function notify(pid, text) { const p = G.players[pid]; if (!p || p.kind === 'bot' || !p.alive) return; (p.inbox = p.inbox || []).push(`день ${G.day}: ${text}`); }
const botLine = (pid, kind) => (isBot(pid) ? ` <i>«${pick(BOT_LINES[kind])}»</i>` : '');
const curP = () => G.players[G.cur];
const weekNo = () => Math.floor((G.day - 1) / 7) + 1;
const dayOfWeek = () => (G.day - 1) % 7 + 1;
const heroById = id => G.heroes.find(h => h.id === id);
const myTowns = pid => G.objs.filter(o => o.t === 'town' && o.owner === pid);
const myHeroes = pid => G.heroes.filter(h => h.owner === pid);
const townAt = (x, y) => { const o = objAt(x, y); return o && o.t === 'town' ? o : null; };

function heroStats(h) {
  const sp = SPECS[h.spec] || {};
  const pk = h.perks || {};
  const s = { att: h.att + (sp.att || 0), def: h.def + (sp.def || 0), pow: h.pow + (sp.pow || 0), spd: sp.spd || 0, gold: (sp.gold || 0) + 150 * (pk.gold || 0), luck: 0.04 * (pk.luck || 0), lead: !!pk.lead };
  for (const a of h.arts) { const A = ARTS[a]; s.att += A.att || 0; s.def += A.def || 0; s.pow += A.pow || 0; s.spd += A.spd || 0; s.gold += A.gold || 0; }
  return s;
}
const maxMana = h => 10 + 5 * heroStats(h).pow + 5 * ((h.perks || {}).mana || 0);
// какой боец нанимается в городе на уровне i (0–4): улучшенный, если построено улучшение
const townUnit = (t, i) => FACTIONS[t.fac].units[i] + (t.built['up' + (i + 1)] ? '2' : '');
const townVar = (t, u) => townUnit(t, FACTIONS[t.fac].units.indexOf(u));
const armyCount = a => a.reduce((s, x) => s + (x ? x.n : 0), 0);
const armyValue = a => a.reduce((s, x) => s + (x ? x.n * UNITS[x.u].hp * (1 + UNITS[x.u].att / 10) : 0), 0);
function costText(c) { return RES.filter(r => c[r]).map(r => `${c[r]}${resIco(r, 16)}`).join(' ') || 'бесплатно'; } // HTML: со значками ресурсов
function canPay(pid, c, mult = 1) { const r = G.players[pid].res; return RES.every(k => (r[k] || 0) >= (c[k] || 0) * mult); }
function pay(pid, c, mult = 1) { const r = G.players[pid].res; RES.forEach(k => { r[k] -= (c[k] || 0) * mult; }); }
function log(t) { G.log.unshift(`д.${G.day}: ${t}`); G.log.length = Math.min(G.log.length, 40); }

function dailyIncome(pid) {
  const inc = { gold: 0, fuel: 0, brick: 0 };
  for (const t of myTowns(pid)) inc.gold += TOWN_INCOME + (t.built.adm1 ? 500 : 0) + (t.built.adm2 ? 1000 : 0);
  for (const o of G.objs) if (o.t === 'mine') { // точка под чужой крышей: половина хозяину, половина тем, кто крышует
    const amt = mineOf(o).amt, roofed = o.roof && o.roof.owner !== o.owner, cut = Math.ceil(amt / 2);
    if (o.owner === pid) inc[MINE[o.kind].res] += roofed ? amt - cut : amt;
    if (roofed && o.roof.owner === pid) inc[MINE[o.kind].res] += cut;
  }
  for (const h of myHeroes(pid)) inc.gold += heroStats(h).gold;
  inc.gold += G.players[pid].bonusInc || 0; // акции и прочие вложения
  return inc;
}

// ---------- ходы ----------
// Начало дня бригады: доход, запас хода, понты. Начисляется один раз за день, даже если партию открыли заново посреди хода.
function turnEffects(p) {
  if (p.turnDay === G.day) return;
  p.turnDay = G.day;
  const bot = p.kind === 'bot';
  if (G.day > 1) { const inc = dailyIncome(p.id), k = bot ? DIFF[p.diff].income : 1; RES.forEach(r => p.res[r] += Math.round(inc[r] * (r === 'gold' ? k : 1))); }
  for (const h of myHeroes(p.id)) {
    h.mp = heroMaxMp(h);
    h.mana = Math.min(maxMana(h), h.mana + (townAt(h.x, h.y) ? 99 : 5));
    const t = townAt(h.x, h.y); if (t) townPerks(h, t, true);
  }
  p.noTown = myTowns(p.id).length ? 0 : (p.noTown || 0) + 1;
  p.heat = Math.max(0, (p.heat || 0) - HEAT_COOL); // розыск понемногу остывает
  jobsTick(p);
}
// В день одновременных ходов чужие бригады людей не трогаем: каждый считает свой день сам, и драка между ними рассинхронила бы партию
const simPeace = owner => NET.on && !!G.sim && owner >= 0 && !isBot(owner);
async function beginTurn() {
  const p = curP(), bot = isBot(p.id);
  BOTTING = bot;
  turnEffects(p);
  checkWin(); if (G.over) { BOTTING = false; return; } // ключ могли продержать нужное число дней
  UI.sel = null; UI.plan = null;
  if (p.noTown >= 7) {
    G.heroes = G.heroes.filter(h => h.owner !== p.id); checkWin();
    await ask(`${ico('i_skull', 24)} ${p.name}`, 'Неделя без своего города — пацаны разбежались. Бригада распалась.', ['Эх']);
    BOTTING = false;
    if (!G.over) await endTurn(); return;
  }
  // по сети: следующий игрок сидит за другим компьютером — отдаём ему партию и право хода
  if (netRemote(p.id)) { BOTTING = false; refresh(); netHandOver(); return; }
  if (bot) {
    refresh();
    try { await sleep(350); await raidCheck(p); if (!G.over) await weekDeal(p); if (!G.over) await botTurn(p); }
    catch (e) { console.error('Ошибка в ходе бота', e); BUSY = false; }
    BOTTING = false;
    if (!G.over) await endTurn(); else refresh();
    return;
  }
  await turnIntro(p);
}
// Начало хода человека за этим компьютером: шторка, новости, выбор героя
async function turnIntro(p) {
  BOTTING = false; UI.sel = null; UI.plan = null;
  G.view = p.id; NET.view = p.id; NET.introTurn = G.turnNo; refresh();
  if (humans().filter(x => x.alive && !netRemote(x.id)).length > 1) await curtain(p); else { audioInit(); toast(`Ваш ход · неделя ${weekNo()}, день ${dayOfWeek()}`); }
  if (p.inbox && p.inbox.length) { const news = p.inbox.splice(0); await ask(`${ico('i_news', 24)} Пока вас не было`, news.join('<br>'), ['Понятно']); }
  await raidCheck(p);
  if (p.noTown) await ask(`${ico('i_warn', 24)} Нет своего города!`, `Осталось дней, чтобы захватить любой город: ${7 - p.noTown}. Иначе бригада распадётся.`, ['Понял']);
  if (G.week && p.weekSeen !== weekNo()) {
    p.weekSeen = weekNo();
    await ask(`${ico('radio', 24)} Неделя ${weekNo()}: ${G.week.title}`, G.week.text, ['Понятно']);
  }
  await weekDeal(p);
  const hs = myHeroes(p.id);
  if (hs.length) selectHero(hs[0]); else { const t = myTowns(p.id)[0]; if (t) centerOn(t.x, t.y); }
  refresh();
}
async function endTurn() {
  if (BUSY || G.over) return;
  if (NET.on && G.sim) { await simEndTurn(); return; } // одновременные ходы: сдаём свой день
  BUSY = true;
  let n = G.cur, wrapped = false;
  do {
    n = (n + 1) % G.players.length;
    if (n === 0) { G.day++; G.firstDone = true; wrapped = true; if (dayOfWeek() === 1) newWeek(); }
  } while (!G.players[n].alive);
  G.cur = n; G.turnNo = (G.turnNo || 0) + 1;
  if (NET.on && wrapped && simOk()) { BUSY = false; await simHandToHost(); return; } // новый день можно сыграть всем сразу
  if (!NET.on) saveGame();
  BUSY = false;
  await beginTurn();
}
function newWeek() {
  // Дефолт случается один раз, на неделе, которую заранее никто не знает (5–7-я); за две недели начинают ходить слухи
  const D = G.def, w = weekNo(), boom = !!D && !D.done && w >= D.week;
  const ev = boom ? { title: 'Дефолт!', text: 'Рубль рухнул. Казна у всех усохла вчетверо, а на барахолке всё втрое дороже — и покупать, и продавать. Кто держал товар, а не бабло, тот в выигрыше.', fx: g => { g.def.done = true; g.players.forEach(p => { p.res.gold = Math.floor(p.res.gold / 4); }); } } : pick(WEEK_EVENTS);
  if (D && !D.done && !boom && w >= D.week - 2) G.players.forEach(p => notify(p.id, w === D.week - 1 ? 'В обменниках очереди, курс скачет каждый час. Умные люди срочно переводят бабло в бензин и кирпич.' : 'По радио говорят, что с рублём всё в порядке. Обычно это значит, что скоро будет не в порядке.'));
  for (const p of G.players) if (p.alive && (p.heat || 0) >= HEAT_RAID) p.raid = true; // к самым наглым в начале их хода приедет ОМОН
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
  for (const o of G.objs) if (o.t === 'mine' && o.roof && !o.roof.known && o.roof.owner !== o.owner) { o.roof.known = true; if (o.owner >= 0) notify(o.owner, `С точки «${mineOf(o).name}» капает вдвое меньше: там стоят смотрящие бригады «${G.players[o.roof.owner].name}». Снять крышу можно только разборкой.`); }
  // общак: проценты с казны; местные и ничьи гарнизоны подтягивают своих
  for (const p of G.players) if (p.alive && myTowns(p.id).some(t => t.built.bank)) p.res.gold += Math.min(2000, Math.floor(p.res.gold * 0.05));
  const grow = GAME_DIFF[G.diff == null ? 1 : G.diff].grow;
  for (const o of G.objs) {
    const army = o.t === 'mob' && !o.boss ? o.army : o.t === 'town' && o.owner < 0 ? o.garrison : null;
    if (army) army.forEach(s => { if (s) s.n = Math.max(s.n + 1, Math.round(s.n * (1 + grow))); });
  }
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
    h.x = st.x; h.y = st.y; reveal(h.owner, h.x, h.y, 6); jobStep(h);
    // чужого бота показываем только там, где зритель уже бывал, и камеру за ним не таскаем
    const bot = isBot(h.owner), vis = !bot || viewP().seen[h.y * MW + h.x];
    if (vis) sfx('step');
    if (!bot) { follow(h); refresh(); }
    await sleep(bot ? (vis ? 45 : 0) : 85);
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
    if (!(action && action.kind === 'mob' && action.id === zid)) await ask('Засада!', `Из подворотни выходят: ${armyText(mob.army)}.`, ['В бой'], { pid: h.owner });
    const won = await fightMob(h, mob);
    if (!won) return true;
  }
  const o = objAt(h.x, h.y);
  if (!o) return false;
  const p = G.players[h.owner];
  if (o.t === 'pile') {
    p.res[o.res] += o.amt; sfx('coin'); toast(`${RES_NAME[o.res]}: +${o.amt}`); mapFloat(o.x, o.y, `+${o.amt}`, { gold: '#7dff7d', fuel: '#ff8a7a', brick: '#ffb070' }[o.res]);
    removeObj(o); return false;
  }
  if (o.t === 'mine') {
    const M = mineOf(o), take = () => { // забрать точку себе
      if (o.owner >= 0) { notify(o.owner, `${p.name} отжали у вас точку: ${M.name}.${botLine(h.owner, 'mine')}`); addHeat(h.owner, HEAT.mine); }
      o.owner = h.owner; reveal(h.owner, o.x, o.y, 3); sfx('flag'); mapFloat(o.x, o.y, 'наша точка!', pcol(h.owner)); jobEvent(h.owner, 'mine', o.id);
      toast(`${M.name} — теперь ваша точка: +${M.amt} ${RES_GEN[MINE[o.kind].res]} в день`); log(`${p.name} взяли точку: ${M.name}`);
    };
    const back = () => { if (o.roof) { for (const st of o.roof.army) if (st) addUnits(h.army, st.u, st.n); o.roof = null; } }; // смотрящие возвращаются в отряд
    if (o.owner < 0) { take(); return false; }
    if (!last) return false;                                   // мимо чужой точки просто проходим
    const foreign = o.owner !== h.owner;
    if (foreign && simPeace(o.owner)) { toast('Чужую точку сегодня не трогаем: все ходят одновременно', true); return false; }
    if (o.roof && o.roof.owner === h.owner && foreign) {        // здесь стоят наши смотрящие
      const c = await ask(`${ico(sprOf(o), 24)} ${M.name}: ваша крыша`, `Точка бригады «${G.players[o.owner].name}», половина дохода идёт вам. Смотрящие: ${armyText(o.roof.army)}.`, ['Оставить как есть', 'Забрать смотрящих', 'Отжать точку совсем'], { pid: h.owner });
      if (c === 1) { back(); toast('Смотрящие вернулись в отряд'); }
      if (c === 2) { back(); take(); }
      return false;
    }
    if (o.roof && o.roof.owner !== h.owner) {                   // чужие смотрящие: сначала их надо выбить
      if (simPeace(o.roof.owner)) { toast('Смотрящих сегодня не трогаем: все ходят одновременно', true); return false; }
      const R = o.roof, before = R.army.map(x => x && { ...x });
      const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: R.army, hero: null, owner: R.owner }, title: `Разборка со смотрящими: ${M.name}`, arena: arenaAt(o.x, o.y) });
      if (r.winner !== 0) { R.army = r.dArmy; notify(R.owner, `${h.name} (${p.name}) пытался снять вашу крышу с точки «${M.name}» и не вывез.`); await heroDies(h, `не вывез разборку со смотрящими на точке «${M.name}»`, R.owner); return true; }
      h.army = r.aArmy; o.roof = null;
      notify(R.owner, `${p.name} выбили ваших смотрящих с точки «${M.name}».`);
      await ask('Крышу сняли', `Смотрящие бригады «${G.players[R.owner].name}» разбежались. ${foreign ? '' : 'Точка снова приносит полный доход.'}`, ['Дальше'], { pid: h.owner });
      await giveXp(h, xpFromKills(before, r.dArmy));
      if (!heroById(h.id) || !foreign) return false;
    }
    if (!foreign) return false;
    const c = await ask(`${ico(sprOf(o), 24)} Чужая точка: ${M.name}`, `Хозяева — бригада «${G.players[o.owner].name}». Отжать — точка ваша, но хозяева узнают сразу и вернут её, просто придя сюда. Поставить крышу — оставить здесь отряд смотрящих: половина дохода пойдёт вам, хозяева заметят только в понедельник, а чтобы снять крышу, им придётся драться.`, ['Отжать', 'Поставить крышу', 'Не трогать'], { pid: h.owner });
    if (c === 0) take();
    if (c === 1) {
      const idx = h.army.map((x, i) => (x ? i : -1)).filter(i => i >= 0);
      if (idx.length < 2) { toast('Некого оставить: герою нужен хотя бы второй отряд', true); return false; }
      const k = await ask('Кого оставить смотрящими?', 'Отряд останется на точке и будет её держать. Чем он сильнее, тем труднее снять крышу.', idx.map(i => `${unitIcon(h.army[i].u, 20)} ${UNITS[h.army[i].u].name} ×${h.army[i].n}`), { pid: h.owner });
      const i = idx[k] == null ? idx[0] : idx[k];
      o.roof = { owner: h.owner, army: [h.army[i], null, null, null, null], day: G.day, known: false }; h.army[i] = null;
      addHeat(h.owner, HEAT.roof); sfx('flag'); mapFloat(o.x, o.y, 'крыша!', pcol(h.owner)); toast(`${M.name} под вашей крышей: +${Math.ceil(M.amt / 2)} ${RES_GEN[MINE[o.kind].res]} в день`); log(`${p.name} поставили крышу: ${M.name}`);
    }
    return false;
  }
  if (o.t === 'town') {
    if (o.owner === h.owner) { townPerks(h, o, false); if (last && !isBot(h.owner)) { BUSY = false; await openTown(o, h); BUSY = true; } return false; }
    await siege(h, o); return true;
  }
  if (o.t === 'chest') {
    const g = rnd(10, 20) * 100, xp = Math.round(g * 0.75);
    const c = await ask(`${ico(sprOf(o), 24)} ${o.nm || 'Общак'}`, o.nm ? 'Сорвали куш. Что делаем?' : 'Нашли чужой общак. Что делаем?', [`Забрать ${g}${resIco('gold', 16)}`, `Раздать пацанам: +${xp} опыта`], { pid: h.owner });
    if (c === 0) p.res.gold += g; else await giveXp(h, xp);
    sfx('coin'); removeObj(o); return true;
  }
  if (o.t === 'art') {
    const A = ARTS[o.art];
    h.arts.push(o.art); sfx('level');
    await ask(`${ico('a_' + o.art, 24)} ${A.name}`, `${o.nm ? o.nm + '. ' : ''}Нашли: ${A.desc}.`, ['Надеть'], { pid: h.owner });
    log(`${h.name} нашёл ${A.name.toLowerCase()}`); removeObj(o); return true;
  }
  if (o.t === 'bonus') {
    const B = bonusOf(o);
    if (o.sp === 'police' && (p.heat || 0) >= 20) { // Петровка, 38: решить вопрос с розыском
      const c = bribeCost(p, true);
      const a = await ask(`${ico('police', 24)} Петровка, 38`, `На бригаду розыск. Здесь вопрос решается за ${c} бабла — вдвое дешевле, чем через Управу.`, [`Занести ${c}`, 'В другой раз'], { pid: h.owner });
      if (a === 0) { const r = bribe(p.id, true); toast(r === true ? 'Розыск снят' : r, true); }
    }
    if (o.seen.includes(h.id)) { toast(o.kind === 'mp' ? 'Шаурма кончилась, приходите на следующей неделе' : 'Тут уже были'); return true; }
    o.seen.push(h.id); sfx('level');
    if (o.kind === 'att') h.att++; else if (o.kind === 'def') h.def++; else if (o.kind === 'pow') h.pow++; else if (o.kind === 'mp') h.mp += 40;
    await ask(`${ico(sprOf(o), 24)} ${B.name}`, B.text, ['Отлично'], { pid: h.owner });
    if (o.kind === 'xp') await giveXp(h, 1000);
    return true;
  }
  return false;
}
function removeObj(o) { G.objs = G.objs.filter(x => x !== o); reindex(); }
const armyText = a => a.filter(Boolean).map(s => `${UNITS[s.u].name} ×${s.n}`).join(', ');

async function doAction(h, act) {
  if (act.kind === 'mob') { const mob = G.objs.find(o => o.id === act.id); if (mob) await fightMob(h, mob); }
  else if (act.kind === 'meet') { const o = heroById(act.id); if (o && !isBot(h.owner)) { BUSY = false; await openExchange(h, o); BUSY = true; } }
  else if (act.kind === 'hero') {
    const o = heroById(act.id); if (!o) return;
    if (simPeace(o.owner)) { toast('Сегодня все ходят одновременно — чужие бригады не трогаем', true); return; }
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
  const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: mob.army, hero: null, owner: -1 }, title: 'Разборка с местными', arena: arenaAt(mob.x, mob.y, null, mob.boss) });
  const p = G.players[h.owner];
  if (r.winner === 0) {
    h.army = r.aArmy; removeObj(mob); addHeat(h.owner, HEAT.mob); jobEvent(h.owner, 'mob', mob.id);
    const loot = (mob.lvl || 1) * rnd(3, 6) * 100; p.res.gold += loot;
    await ask('Победа!', `Местные разбежались. В карманах нашлось ${loot}${resIco('gold', 16)}.`, ['Дальше'], { pid: h.owner });
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
  // кому показывать окна: человеку, если он участвует (бот напал на человека — зовём его к компьютеру)
  const who = !isBot(h.owner) ? h.owner : o.owner;
  if (isBot(h.owner) && !isBot(o.owner)) {
    centerOn(o.x, o.y);
    await ask(`${ico('i_att', 24)} Наезд!`, `<b style="color:${G.players[o.owner].col}">${G.players[o.owner].name}</b>, к компьютеру! Бот ${h.name} (${G.players[h.owner].name}) напал на героя ${o.name}.<br>У них: ${armyText(h.army)}.`, ['К бою'], { pid: o.owner });
  }
  const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: o.army, hero: o, owner: o.owner, fence: !!(t && t.built.fence) }, title: `${G.players[h.owner].name} против ${G.players[o.owner].name}`, arena: arenaAt(o.x, o.y, t) });
  h.army = r.aArmy; o.army = r.dArmy;
  const [win, lose, bL] = r.winner === 0 ? [h, o, bD] : [o, h, bA];
  const arts = lose.arts.slice();
  win.arts.push(...arts);
  await ask('Стрелка окончена', `${win.name} (${G.players[win.owner].name}) победил${arts.length ? ' и забрал: ' + arts.map(a => ico('a_' + a, 18) + ' ' + ARTS[a].name).join(', ') : ''}.`, ['Ясно'], { pid: who });
  if (lose.owner !== G.cur) notify(lose.owner, `${win.name} (${G.players[win.owner].name}) разбил вашего героя ${lose.name} и взял его в плен.${botLine(win.owner, 'kill')}`);
  else if (win.owner !== G.cur) notify(win.owner, `${lose.name} (${G.players[lose.owner].name}) полез на вашего героя ${win.name} и не вывез.`);
  await heroDies(lose, `проиграл стрелку против ${win.name}`, win.owner);
  if (win === h) addHeat(h.owner, HEAT.hero); // наглеет тот, кто напал и победил
  jobEvent(win.owner, 'beat', lose.owner);
  { const side = win === h ? 0 : 1; if (r.down && r.down[side] && !isBot(win.owner)) toast(`${win.name} выбили в драке, но пацаны дожали. Отлежится.`, true); }
  await giveXp(win, xpFromKills(bL, r.winner === 0 ? r.dArmy : r.aArmy) + 500);
  return r.winner === 0;
}
// Кто выходит за пустой город. За ничейный — немного дворовых; за город бригады — толпа побольше, со второй недели с подмогой
function militiaOf(t) {
  const u = FACTIONS[t.fac].units, w = weekNo();
  if (t.owner < 0) return [{ u: u[0], n: 6 + 3 * w }, null, null, null, null];
  return [{ u: u[0], n: 8 + 5 * w }, w >= 2 ? { u: u[1], n: 3 * w } : null, w >= 4 ? { u: u[2], n: w } : null, null, null];
}
async function siege(h, t) {
  if (simPeace(t.owner) && t.owner !== h.owner) { toast('Сегодня все ходят одновременно — чужие бригады не трогаем', true); return; }
  const p = G.players[h.owner];
  const def = heroAt(t.x, t.y);
  if (def && def.owner !== h.owner) { const won = await fightHero(h, def, true); if (!won) return; }
  if (!heroById(h.id)) return;
  const militia = armyCount(t.garrison) === 0;
  if (militia) { t.garrison = militiaOf(t); await ask('Ополчение!', `Город пустой, но за него вышли дворовые: ${armyText(t.garrison)}.`, ['В бой'], { pid: h.owner }); }
  if (isBot(h.owner) && t.owner >= 0 && !isBot(t.owner)) {
    centerOn(t.x, t.y);
    await ask(`${ico('o_fence', 24)} Штурм!`, `<b style="color:${G.players[t.owner].col}">${G.players[t.owner].name}</b>, к компьютеру! Бот ${h.name} (${G.players[h.owner].name}) штурмует ${t.name}.<br>У них: ${armyText(h.army)}.`, ['Отбиваемся'], { pid: t.owner });
  }
  {
    const before = t.garrison.map(s => s && { ...s });
    const r = await runBattle({ a: { army: h.army, hero: h, owner: h.owner }, d: { army: t.garrison, hero: null, owner: t.owner, fence: !!t.built.fence }, title: `Штурм: ${t.name}`, arena: arenaAt(t.x, t.y, t) });
    h.army = r.aArmy; t.garrison = militia ? [null, null, null, null, null] : r.dArmy;
    if (r.winner !== 0) { if (t.owner >= 0) notify(t.owner, `${h.name} (${p.name}) штурмовал ваш город ${t.name} и полёг под стенами.`); await heroDies(h, `полёг под стенами ${t.name}`, t.owner); return; }
    await giveXp(h, xpFromKills(before, r.dArmy));
  }
  const old = t.owner;
  if (old >= 0) jobEvent(h.owner, 'town', old);
  addHeat(h.owner, old >= 0 ? HEAT.townOwned : HEAT.town);
  if (old >= 0) notify(old, `${p.name} взяли ваш город ${t.name}.${botLine(h.owner, 'town')}`);
  t.owner = h.owner; t.garrison = [null, null, null, null, null];
  for (const j of jail()) if (j.at === t.id) { // свои выходят на свободу (вызвать можно даром), чужие переходят к новым хозяевам города
    const mine = j.hero.owner === h.owner; j.captor = h.owner;
    notify(j.hero.owner, mine ? `Город ${t.name} взят — ${j.hero.name} на свободе. Позовите его в любом своём городе, бесплатно.` : `Героя ${j.hero.name} теперь держит бригада «${p.name}».`);
    if (mine && j.hero.owner === G.cur) toast(`${j.hero.name} освобождён!`, true);
  }
  h.x = t.x; h.y = t.y; reveal(h.owner, t.x, t.y, 8);
  sfx('flag'); log(`${p.name} взяли ${t.name}`);
  if (old >= 0 && isBot(h.owner) && !isBot(old)) await ask(`${ico('i_warn', 24)} Город потерян`, `${t.name} теперь держит бригада «${p.name}».${myTowns(old).length ? '' : ' Своих городов не осталось: есть неделя, чтобы отбить любой.'}`, ['Запомним'], { pid: old });
  else await ask(`${ico('i_flag', 24)} Город наш!`, `${t.name} переходит к бригаде «${p.name}».${old >= 0 ? ' Бывшие хозяева в ярости.' : ''}`, ['Заходим'], { pid: h.owner });
  checkWin();
}
// ---------- дела недели ----------
// пирамида: через неделю либо вдвое, либо всё сгорело. r — для проверки правил
function pyramidResolve(p, r = Math.random()) {
  const P = p.pyramid; if (!P || weekNo() < P.week) return '';
  p.pyramid = null;
  if (r < 0.5) { p.res.gold += P.amt * 2; return `Пирамида заплатила: +${P.amt * 2} бабла.`; }
  return `Пирамида лопнула. ${P.amt} бабла сгорели.`;
}
// раз в неделю (со второй) у бригады своя история; id — показать конкретную (для проверки правил)
async function weekDeal(p, id) {
  if (!id && (weekNo() < 2 || p.dealWeek === weekNo())) return;
  p.dealWeek = weekNo();
  const bot = isBot(p.id), py = pyramidResolve(p);
  if (py) { if (bot) { /* бот молча принимает итог */ } else await ask(`${ico('r_gold', 24)} Пирамида`, py, ['Ясно'], { pid: p.id }); }
  const seen = p.dealsSeen || (p.dealsSeen = []);
  const pool = DEALS.filter(d => (id ? d.id === id : true) && (!d.ok || d.ok(p)) && !(d.once && seen.includes(d.id)));
  const fresh = pool.filter(d => !seen.slice(-3).includes(d.id)), d = id ? pool[0] : pick(fresh.length ? fresh : pool);
  if (!d) return;
  seen.push(d.id);
  const opts = d.opts.filter(o => !o[1] || o[1](p));
  const c = bot ? Math.min(d.bot(p), opts.length - 1) : await ask(`${ico(d.ic, 24)} ${d.title}`, d.text(p), opts.map(o => o[0]), { pid: p.id });
  const o = opts[c] || opts[opts.length - 1], res = await o[2](p);
  if (!bot && res) await ask(d.title, res, ['Ясно'], { pid: p.id });
  refresh();
}

// ---------- заказы авторитетов ----------
const jobsOf = p => p.jobs || (p.jobs = []);
const objById = id => G.objs.find(o => o.id === id) || null;
const placeName = o => (!o ? 'неизвестно где' : o.t === 'town' ? o.name : o.t === 'mine' ? mineOf(o).name : o.t === 'bonus' ? bonusOf(o).name : o.nm || 'точка');
function rewardText(r) { return RES.filter(k => r[k]).map(k => `${r[k]} ${RES_GEN[k]}`).join(' + ') || 'уважение'; }
// что заказали — одной строкой, и подробнее
function jobTitle(j) {
  const o = objById(j.target);
  if (j.type === 'clear') return `Разогнать: ${o ? UNITS[o.army.find(Boolean).u].name.toLowerCase() : 'шпану'}`;
  if (j.type === 'grab') return `Отжать точку: ${placeName(o)}`;
  if (j.type === 'deliver') return `Груз: ${placeName(objById(j.from))} → ${placeName(objById(j.to))}`;
  if (j.type === 'hit') return `Наказать бригаду «${G.players[j.foe].name}»`;
  return `Скинуться на общак: ${j.amt} ${RES_GEN[j.res]}`;
}
function jobText(j) {
  if (j.type === 'clear') return 'Местные мешают делам. Разогнать — и всё.';
  if (j.type === 'grab') return 'Точка должна платить правильным людям. Отжать её.';
  if (j.type === 'deliver') return j.stage ? 'Груз у вашего героя — довезти до места. Разобьют героя — груз вернётся на склад.' : 'Забрать груз (подойти к месту любым героем) и довезти.';
  if (j.type === 'hit') return 'Разбить их героя или взять их город.';
  return 'Сдать в любой момент кнопкой ниже. Авторитет замолвит словечко — розыск упадёт.';
}
// где цель заказа на карте
function jobSpot(j) { const o = objById(j.type === 'deliver' ? (j.stage ? j.to : j.from) : j.target); return o ? { x: o.x, y: o.y } : null; }
// три предложения на неделю; цели — в разумной дали от своего города
function jobOffers(p) {
  const home = myTowns(p.id)[0] || myHeroes(p.id)[0]; if (!home) return [];
  const w = weekNo(), k = 1 + 0.15 * (w - 1), d = o => Math.hypot(o.x - home.x, o.y - home.y), busy = new Set(jobsOf(p).map(j => j.target));
  const R = n => Math.round(n * k / 50) * 50, all = [];
  const mobs = G.objs.filter(o => o.t === 'mob' && !o.boss && d(o) > 4 && d(o) < 26 && !busy.has(o.id));
  if (mobs.length) { const m = pick(mobs); all.push({ type: 'clear', target: m.id, reward: { gold: R(700 * (m.lvl || 1)) } }); }
  const mines = G.objs.filter(o => o.t === 'mine' && o.owner !== p.id && d(o) < 28 && !busy.has(o.id) && !simPeace(o.owner));
  if (mines.length) { const m = pick(mines), r = pick(['fuel', 'brick']); all.push({ type: 'grab', target: m.id, reward: { gold: R(1200), [r]: 3 } }); }
  const spots = G.objs.filter(o => o.t === 'mine' || o.t === 'bonus' || o.t === 'town'), A = pick(spots.filter(o => d(o) >= 4 && d(o) < 16) || []);
  const Bs = A ? spots.filter(o => o !== A && Math.hypot(o.x - A.x, o.y - A.y) >= 10 && Math.hypot(o.x - A.x, o.y - A.y) < 24) : [];
  if (A && Bs.length) { const Bo = pick(Bs); all.push({ type: 'deliver', from: A.id, to: Bo.id, target: A.id, stage: 0, carrier: 0, reward: { gold: R(1300), fuel: 3 } }); }
  const foes = G.players.filter(x => x.alive && x.id !== p.id);
  if (foes.length && w >= 2) { const f = pick(foes); all.push({ type: 'hit', foe: f.id, reward: { gold: R(2500) }, days: 10 }); }
  { const r = pick(['fuel', 'brick']); all.push({ type: 'tribute', res: r, amt: 4 + w, reward: { gold: R(600) }, heat: 25 }); }
  return all.sort(() => Math.random() - 0.5).slice(0, 3).map((j, i) => ({ ...j, id: `${G.day}-${p.id}-${i}`, boss: pick(BOSSES), days: j.days || JOB_DAYS }));
}
function jobTake(p, id) {
  const i = (p.offers || []).findIndex(o => o.id === id); if (i < 0) return 'Предложение уже ушло';
  if (jobsOf(p).length >= JOB_MAX) return `Больше ${JOB_MAX} заказов разом не взять`;
  const j = p.offers.splice(i, 1)[0]; j.until = G.day + j.days; jobsOf(p).push(j);
  return true;
}
function jobDone(p, j) {
  p.jobs = jobsOf(p).filter(x => x !== j);
  RES.forEach(r => { p.res[r] += j.reward[r] || 0; });
  if (j.heat) addHeat(p.id, -j.heat);
  p.jobsDone = (p.jobsDone || 0) + 1;
  const msg = `${j.boss} доволен: «${jobTitle(j)}» — сделано. Награда: ${rewardText(j.reward)}${j.heat ? ', розыск −' + j.heat : ''}.`;
  if (p.id === G.cur && !isBot(p.id) && !netRemote(p.id)) { toast(msg, true); sfx('coin'); } else notify(p.id, msg);
  log(`${p.name} выполнили заказ: ${jobTitle(j)}`);
}
// что-то случилось — проверить, не закрыт ли этим чей-то заказ. kind: mob / mine / beat / town
function jobEvent(pid, kind, id) {
  const p = G.players[pid]; if (!p || !p.jobs) return;
  for (const j of p.jobs.slice()) {
    if ((j.type === 'clear' && kind === 'mob' && j.target === id) || (j.type === 'grab' && kind === 'mine' && j.target === id) || (j.type === 'hit' && (kind === 'beat' || kind === 'town') && j.foe === id)) jobDone(p, j);
  }
}
// герой сделал шаг: подобрать груз или довезти его
function jobStep(h) {
  const p = G.players[h.owner]; if (!p || !p.jobs) return;
  for (const j of p.jobs.slice()) {
    if (j.type !== 'deliver') continue;
    const o = objById(j.stage ? j.to : j.from); if (!o || Math.max(Math.abs(o.x - h.x), Math.abs(o.y - h.y)) > 1) continue;
    if (!j.stage) { j.stage = 1; j.carrier = h.id; if (!isBot(h.owner)) { toast(`${h.name} забрал груз. Везём: ${placeName(objById(j.to))}`, true); mapFloat(h.x, h.y, 'груз взят', '#ffd21a'); } }
    else if (j.carrier === h.id) jobDone(p, j);
  }
}
// в начале дня: просроченные заказы и новые предложения по понедельникам
function jobsTick(p) {
  for (const j of jobsOf(p).slice()) {
    const gone = (j.type === 'clear' || j.type === 'grab') && !objById(j.target) || (j.type === 'hit' && !G.players[j.foe].alive);
    if (gone) { p.jobs = p.jobs.filter(x => x !== j); notify(p.id, `Заказ «${jobTitle(j)}» сорвался: опередили.`); continue; }
    if (G.day > j.until) { p.jobs = p.jobs.filter(x => x !== j); addHeat(p.id, JOB_FAIL_HEAT); notify(p.id, `${j.boss} недоволен: заказ «${jobTitle(j)}» просрочен. Слух прошёл по району — розыск +${JOB_FAIL_HEAT}.`); }
  }
  if (p.offerWeek !== weekNo()) { p.offerWeek = weekNo(); p.offers = jobOffers(p); if (p.offers.length) notify(p.id, `Авторитеты предлагают заказы: ${p.offers.length}. Взять их можно в любом своём городе.`); }
}
function jobTribute(p, j) {
  if ((p.res[j.res] || 0) < j.amt) return `Нужно ${j.amt} ${RES_GEN[j.res]}`;
  p.res[j.res] -= j.amt; jobDone(p, j); return true;
}

// ---------- Ключ от Кремля ----------
// Ключ, потерянный вместе с героем у местных или милиции, возвращается в Кремль
function keyHome() {
  if (G.heroes.some(h => h.arts.includes('key')) || G.objs.some(o => o.t === 'art' && o.art === 'key')) return;
  const cx = Math.floor(MCX) - 1, cy = Math.floor(MCY) - 1;
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy;
    if (inMap(x, y) && passT(tileAt(x, y)) && !objAt(x, y) && !heroAt(x, y)) { G.objs.push({ t: 'art', art: 'key', id: G.nextId++, x, y }); reindex(); return; }
  }
}
// кто держит ключ и сколько дней ещё осталось держать
function keyState() { const h = G.heroes.find(x => x.arts.includes('key')); return h ? { owner: h.owner, left: KEY_DAYS - (G.day - (G.keyHold && G.keyHold.owner === h.owner ? G.keyHold.since : G.day)) } : null; }

// ---------- розыск ----------
// За наглость — драки, захваты, крыши — бригаде копится розыск. Остывает сам, снимается взяткой: в своём городе с Управой
// или вдвое дешевле на Петровке, 38. Кто к понедельнику набрал HEAT_RAID, к тому в начале хода приезжает ОМОН.
function addHeat(pid, n) {
  const p = G.players[pid]; if (!p || !p.alive) return;
  const was = p.heat || 0; p.heat = clamp(was + n, 0, 100);
  if (was < HEAT_WARN && p.heat >= HEAT_WARN) {
    const m = `На бригаду вышла ориентировка. Ещё немного наглости — и в понедельник приедет ОМОН. Откупиться можно в своём городе с Управой${G.map === 'msk' ? ' или вдвое дешевле на Петровке, 38' : ''}.`;
    if (pid === G.cur && !isBot(pid) && !netRemote(pid)) toast(m, true); else notify(pid, m);
  }
}
const heatStars = p => Math.min(5, Math.floor((p.heat || 0) / 20));
const bribeCost = (p, half) => Math.round((p.heat || 0) * (half ? 30 : 60) / 10) * 10;
function bribe(pid, half) {
  const p = G.players[pid], c = bribeCost(p, half);
  if (!c) return 'Вас и так не ищут';
  if (p.res.gold < c) return `Нужно ${c} бабла`;
  p.res.gold -= c; p.heat = 0; p.raid = false; sfx('coin');
  return true;
}
// облава в начале хода: ОМОН приезжает за самым сильным героем бригады
async function raidCheck(p) {
  if (!p.raid || G.over) return;
  p.raid = false;
  const h = myHeroes(p.id).slice().sort((a, b) => armyValue(b.army) - armyValue(a.army))[0], w = weekNo(), k = GAME_DIFF[G.diff == null ? 1 : G.diff].mobs;
  if (!h) { // героев нет — берут кассу
    const fine = Math.floor(p.res.gold * 0.3); p.res.gold -= fine; p.heat = Math.max(0, p.heat - 40);
    await ask(`${ico('police', 24)} Облава!`, `Героев не нашли, зато нашли кассу: изъято ${fine} бабла.`, ['Понятно'], { pid: p.id });
    return;
  }
  const army = [{ u: 'omon', n: Math.round((3 + w + p.heat / 25) * k) }, { u: 'patrol', n: Math.round((6 + 2 * w) * k) }, { u: 'omon', n: Math.round((2 + w) * k) }, null, null];
  const cost = Math.round(bribeCost(p) * 1.5 / 10) * 10;
  if (!isBot(p.id)) centerOn(h.x, h.y);
  const c = await ask(`${ico('police', 24)} Облава!`, `ОМОН приехал за героем ${h.name}: ${armyText(army)}. Можно отбиться — или занести ${cost} бабла, и вас тут не было.`, ['Отбиваться', `Откупиться: ${cost}`], { pid: p.id });
  if (c === 1 && p.res.gold >= cost) { p.res.gold -= cost; p.heat = Math.max(0, p.heat - 50); sfx('coin'); return; }
  const before = army.map(x => x && { ...x });
  const r = await runBattle({ a: { army, hero: null, owner: -1 }, d: { army: h.army, hero: h, owner: h.owner }, title: 'Облава', arena: arenaAt(h.x, h.y, townAt(h.x, h.y)) });
  if (r.winner === 1) {
    h.army = r.dArmy; p.heat = Math.max(0, p.heat - 30);
    await ask('Отбились!', 'ОМОН уехал ни с чем. Розыск поутих.', ['Дальше'], { pid: p.id });
    await giveXp(h, xpFromKills(before, r.aArmy));
  } else {
    p.heat = Math.max(0, p.heat - 40);
    await heroDies(h, 'взят при облаве');
    await ask('Повязали', `${h.name} уехал в Бутырку. Выкупить его можно в своём городе.`, ['Эх'], { pid: p.id });
  }
}

// ---------- плен ----------
// Проигравший герой не пропадает: его забирают в плен победители (держат в своём ближайшем городе) или милиция — в Бутырку.
// Хозяин может выкупить его в любом своём городе; выкуп у бригады идёт ей в казну. Взял город, где держат героя, — освободил.
const jail = () => G.jail || (G.jail = []);
const ransomOf = j => (j.captor === j.hero.owner ? 0 : 1000 + 500 * j.hero.lvl);
const myJailed = pid => jail().filter(j => j.hero.owner === pid);
function jailTown(pid, x, y) { return myTowns(pid).reduce((b, t) => (!b || Math.hypot(t.x - x, t.y - y) < Math.hypot(b.x - x, b.y - y) ? t : b), null); }
const jailPlace = j => { const t = j.at && G.objs.find(o => o.id === j.at); return j.captor === j.hero.owner ? 'на свободе, ждёт вызова' : j.captor >= 0 && t ? `в плену у бригады «${G.players[j.captor].name}», город ${t.name}` : 'в Бутырке'; };
async function heroDies(h, why, captor = -1) {
  G.heroes = G.heroes.filter(x => x !== h);
  log(`${h.name} (${G.players[h.owner].name}) ${why}`);
  if (UI.sel === h.id) UI.sel = null;
  for (const j of jobsOf(G.players[h.owner])) if (j.type === 'deliver' && j.carrier === h.id) { j.stage = 0; j.carrier = 0; notify(h.owner, `Груз по заказу «${jobTitle(j)}» потерян вместе с героем — он снова на складе.`); }
  if (h.arts.includes('key') && !(captor >= 0 && G.heroes.some(x => x.owner === captor && x.arts.includes('key')))) { h.arts = h.arts.filter(a => a !== 'key'); keyHome(); }
  const town = captor >= 0 && captor !== h.owner ? jailTown(captor, h.x, h.y) : null;
  const j = { hero: { ...h, army: [null, null, null, null, null], arts: [], dest: null, mp: 0 }, captor: town ? captor : -1, at: town ? town.id : 0, day: G.day };
  jail().push(j);
  const msg = `${h.name} ${jailPlace(j)}. Выкуп — ${ransomOf(j)} бабла, в любом своём городе.`;
  if (h.owner === G.cur && !isBot(h.owner) && !netRemote(h.owner)) toast(msg, true); else notify(h.owner, msg);
  if (town) notify(captor, `Герой ${h.name} (${G.players[h.owner].name}) у вас в плену, в городе ${town.name}. За него могут заплатить ${ransomOf(j)}.`);
  checkWin();
}
// выкупить героя в своём городе; текст ошибки или сам герой
function ransom(t, j) {
  const p = G.players[t.owner], price = ransomOf(j);
  if (j.hero.owner !== t.owner || !jail().includes(j)) return 'Этого героя здесь не выкупить';
  if (heroAt(t.x, t.y)) return 'В городе уже стоит герой';
  if (myHeroes(p.id).length >= MAX_HEROES) return `Больше ${MAX_HEROES} героев не прокормить`;
  if (j.captor >= 0 && j.captor !== p.id && simPeace(j.captor)) return 'Сегодня все ходят одновременно — с чужой бригадой договоримся завтра';
  if (p.res.gold < price) return `Нужно ${price} бабла`;
  p.res.gold -= price;
  if (j.captor >= 0 && j.captor !== p.id && G.players[j.captor].alive) { G.players[j.captor].res.gold += price; notify(j.captor, `Бригада «${p.name}» выкупила героя ${j.hero.name}: +${price} бабла.`); }
  G.jail = jail().filter(x => x !== j);
  const h = j.hero; h.x = t.x; h.y = t.y; h.mp = 0; h.mana = maxMana(h); h.army = [{ u: townUnit(t, 0), n: 8 }, null, null, null, null];
  G.heroes.push(h); sfx('level'); log(`${p.name} вернули героя ${h.name}`);
  return h;
}
async function giveXp(h, xp) {
  if (!heroById(h.id) || xp <= 0) return;
  h.xp += Math.round(xp * ((SPECS[h.spec] || {}).xp || 1));
  while (h.xp >= xpFor(h.lvl + 1)) {
    h.lvl++; sfx('level');
    // три навыка на выбор: один боевой обязательно, остальные случайные; «кураж» берётся один раз
    const pk = h.perks || (h.perks = {}), pool = Object.keys(PERKS).filter(k => !(k === 'lead' && pk.lead)).sort(() => Math.random() - 0.5);
    const first = pool.find(k => k === 'att' || k === 'def' || k === 'pow'), opts = [first, ...pool.filter(k => k !== first).slice(0, 2)];
    const c = await ask(`${heroIco(h, 28)} ${h.name}: уровень ${h.lvl}!`, 'Авторитет растёт. Чему учимся?', opts.map(k => `${ico(PERKS[k].ic, 16)} ${PERKS[k].name}`), { pid: h.owner });
    const k = opts[c] || opts[0];
    if (k === 'att' || k === 'def' || k === 'pow') h[k]++; else pk[k] = (pk[k] || 0) + 1;
    h.mana = maxMana(h);
  }
}
function checkWin() {
  if (NET.on && G.sim && !NET.merging) return; // в день одновременных ходов итоги подводит хозяин комнаты, когда сведёт все ходы
  for (const p of G.players) if (p.alive && !myTowns(p.id).length && !myHeroes(p.id).length) {
    p.alive = false; log(`Бригада «${p.name}» распалась`);
    G.jail = jail().filter(j => j.hero.owner !== p.id); jail().forEach(j => { if (j.captor === p.id) { j.captor = -1; j.at = 0; } }); // чужих пленных забирает милиция
    for (const o of G.objs) if (o.t === 'mine') { if (o.roof && o.roof.owner === p.id) o.roof = null; if (o.owner === p.id) { o.owner = o.roof ? o.roof.owner : -1; o.roof = null; } }
    G.players.forEach(x => { if (x !== p && x.id !== G.cur) notify(x.id, `Бригада «${p.name}» распалась.`); });
    toast(`Бригада «${p.name}» распалась!`, true);
  }
  const alive = G.players.filter(p => p.alive);
  if (G.over) return;
  // ключ: сменился хозяин — счёт заново; продержали KEY_DAYS дней — победа
  const kh = G.heroes.find(h => h.arts.includes('key')), ko = kh ? kh.owner : -1;
  if (!G.keyHold || G.keyHold.owner !== ko) {
    G.keyHold = { owner: ko, since: G.day };
    if (ko >= 0) G.players.forEach(x => { if (x.id !== ko) notify(x.id, `Ключ от Кремля у бригады «${G.players[ko].name}». Продержат ${KEY_DAYS} дней — Москва их. Отберите ключ: разбейте героя ${kh.name}.`); });
    if (ko >= 0 && ko === G.cur && !isBot(ko)) toast(`Ключ от Кремля ваш! Продержите его ${KEY_DAYS} дней — и Москва ваша.`, true);
  } else if (ko >= 0 && G.players[ko].alive && G.day - G.keyHold.since >= KEY_DAYS) {
    G.over = true; G.winner = ko; G.winBy = 'key';
    if (NET.on) { NET.overShown = true; netDirty(); } else localStorage.removeItem(SAVE_KEY);
    setTimeout(() => showVictory(G.players[ko]), 400);
    return;
  }
  // партия кончается, когда осталась одна бригада — или когда людей не осталось вовсе (тогда Москву забирает сильнейший бот)
  const lastOne = alive.length === 1, noHumans = alive.length > 0 && alive.every(p => p.kind === 'bot');
  if (lastOne || noHumans) {
    const power = p => myTowns(p.id).length * 1e6 + myHeroes(p.id).reduce((s, h) => s + armyValue(h.army), 0);
    const win = alive.slice().sort((a, b) => power(b) - power(a))[0];
    G.over = true; G.winner = win.id;
    if (NET.on) { NET.overShown = true; netDirty(); } else localStorage.removeItem(SAVE_KEY);
    setTimeout(() => showVictory(win), 400);
  }
}

// ---------- город ----------
function buildState(t, b) {
  if (t.built[b.id]) return 'built';
  if ([].concat(b.req || []).some(r => !t.built[r])) return 'req';
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
// u — обычный боец бригады; наймётся он или его улучшенная версия, зависит от построек
function maxRecruit(t, u) {
  const c = UNITS[townVar(t, u)].cost, r = G.players[t.owner].res;
  let n = t.avail[u] || 0;
  for (const k of RES) if (c[k]) n = Math.min(n, Math.floor(r[k] / c[k]));
  return Math.max(0, n);
}
function recruit(t, u, n, hero) {
  n = Math.min(n, maxRecruit(t, u)); if (n <= 0) return false;
  const v = townVar(t, u);
  const target = addUnits(t.garrison, v, 0) ? t.garrison : hero && addUnits(hero.army, v, 0) ? hero.army : null;
  if (!target) { toast('Некуда ставить: все пять мест заняты'); return false; }
  addUnits(target, v, n); pay(t.owner, UNITS[v].cost, n); t.avail[u] -= n; sfx('coin'); return true;
}
// Переобуть отряд: обычных бойцов этой бригады заменить улучшенными за разницу в цене
function upgradeCost(t, s) {
  if (!s || UNITS[s.u].base) return 0;
  const i = FACTIONS[t.fac].units.indexOf(s.u);
  if (i < 0 || !t.built['up' + (i + 1)]) return 0;
  return (UNITS[s.u + '2'].cost.gold - UNITS[s.u].cost.gold) * s.n;
}
function upgradeAll(t, hero) {
  let done = 0;
  for (const army of [t.garrison, hero && hero.army].filter(Boolean)) army.forEach((s, i) => {
    const c = upgradeCost(t, s), p = G.players[t.owner];
    if (!c || p.res.gold < c) return;
    p.res.gold -= c; done++;
    const j = army.findIndex((x, k) => x && k !== i && x.u === s.u + '2');
    if (j >= 0) { army[j].n += s.n; army[i] = null; } else s.u += '2';
  });
  if (done) sfx('level');
  return done;
}
// что герой получает, заходя в свой город или начиная в нём день
function townPerks(h, t, dayStart) {
  if (t.owner !== h.owner) return;
  if (t.built.club && !(t.clubSeen || []).includes(h.id)) {
    const C = FACTIONS[t.fac].club; t.clubSeen = [...(t.clubSeen || []), h.id]; h[C.stat]++;
    if (!isBot(h.owner)) toast(`${h.name} ${C.text}`, true);
  }
  if (dayStart && t.built.garage) h.mp += 20;
}
function hireHero(t) {
  const p = G.players[t.owner];
  if (heroAt(t.x, t.y)) return 'В городе уже стоит герой';
  if (myHeroes(p.id).length >= MAX_HEROES) return `Больше ${MAX_HEROES} героев не прокормить`;
  if (p.res.gold < HERO_COST) return `Нужно ${HERO_COST} бабла`;
  p.res.gold -= HERO_COST;
  const h = makeHero(p.id, t.fac, t.x, t.y);
  h.army[0] = { u: townUnit(t, 0), n: 8 }; h.mp = 0;
  G.heroes.push(h); sfx('level'); log(`${p.name} наняли ${h.name}`);
  return h;
}
// после дефолта на барахолке всё втрое дороже — и покупать, и продавать
const tradeBuy = () => TRADE_BUY * (G.def && G.def.done ? 3 : 1), tradeSell = () => TRADE_SELL * (G.def && G.def.done ? 3 : 1);
function trade(pid, res, buy) {
  const r = G.players[pid].res;
  if (buy) { if (r.gold < tradeBuy()) return false; r.gold -= tradeBuy(); r[res]++; }
  else { if (r[res] < 1) return false; r[res]--; r.gold += tradeSell(); }
  sfx('coin'); return true;
}

// ---------- сохранение ----------
const SAVE_KEY = 'delyozh_save_v1';
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { console.warn('save failed', e); } }
function loadGame() {
  try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; G = JSON.parse(s); setMap(G.nsec || 3, G.map === 'msk' ? G.size : 0); reindex(); return true; }
  catch (e) { return false; }
}
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
