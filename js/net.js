'use strict';
// Игра по сети. Комната на сервере хранит лобби и последний снимок партии. Партию считает клиент того, чей ход:
// после каждого действия он шлёт снимок, остальные его применяют и смотрят своими глазами (свой туман).
// Когда ход доходит до игрока за другим компьютером, вместе со снимком уходит право хода.
// Ходы ботов считает тот, кто ходил перед ними. В бою за игрока с другого компьютера отбивается ИИ.

const NET = { on: false, code: '', cid: '', name: '', room: null, v: 0, sv: 0, bv: 0, simDay: 0, simActive: false, simSent: false, simList: [], simBase: '', merging: false, auth: false, mine: new Set(), view: null, introTurn: -1, timer: null, loopId: 0, shown: false, overShown: false, q: Promise.resolve(), list: null };
{
  const rnd16 = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  try { NET.cid = localStorage.getItem('delyozh_cid') || ''; if (!/^[a-f0-9]{32}$/.test(NET.cid)) { NET.cid = rnd16(); localStorage.setItem('delyozh_cid', NET.cid); } NET.name = localStorage.getItem('delyozh_name') || ''; }
  catch (e) { NET.cid = rnd16(); }
}
const netRemote = pid => NET.on && pid >= 0 && !!G && !!G.players[pid] && G.players[pid].kind !== 'bot' && !NET.mine.has(pid); // человек за другим компьютером
const netWatching = () => NET.on && !!G && (G.sim ? !NET.simActive : !NET.auth || netRemote(G.cur));                         // сейчас только смотрим
function netViewId() { if (NET.mine.has(G.cur)) return G.cur; if (NET.view != null && NET.mine.has(NET.view)) return NET.view; const m = [...NET.mine][0]; return m == null ? G.cur : m; }
const realSleep = ms => new Promise(r => setTimeout(r, ms));

async function netReq(method, url, body) {
  const r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({ error: 'Сервер ответил непонятно' }));
  if (!r.ok) throw new Error(d.error || 'Ошибка ' + r.status);
  return d;
}

// ---------- снимок партии ----------
const bitsPack = a => { let s = ''; for (let i = 0; i < a.length; i += 4) s += ((a[i] ? 8 : 0) | (a[i + 1] ? 4 : 0) | (a[i + 2] ? 2 : 0) | (a[i + 3] ? 1 : 0)).toString(16); return s; };
const bitsUnpack = (s, n) => { const a = new Array(n).fill(0); for (let i = 0; i < n; i++) a[i] = (parseInt(s[i >> 2], 16) >> (3 - (i & 3))) & 1; return a; };
const netPack = () => JSON.stringify({ ...G, tiles: G.tiles.join(''), players: G.players.map(p => ({ ...p, seen: bitsPack(p.seen) })) });
function netUnpack(snap) {
  const g = JSON.parse(snap);
  setMap(g.nsec || 3, g.map === 'msk' ? g.size : 0);
  g.tiles = Array.from(g.tiles, Number); g.players.forEach(p => { p.seen = bitsUnpack(p.seen, MW * MH); });
  return g;
}
function netApply(snap) {
  const g = netUnpack(snap), fresh = !G || !NET.shown || G.seed !== g.seed;
  if (G && !fresh && G.sim && g.sim && NET.simDay === g.day && g.simDay === g.day) return; // свой день одновременных ходов мы уже играем
  G = g; reindex(); netMine();
  if (UI.sel && !heroById(UI.sel)) UI.sel = null;
  if (fresh) {
    NET.shown = true; NET.overShown = false; NET.introTurn = -1; UI.sel = null; UI.plan = null;
    prerender(); $('menu').hidden = true;
    const me = viewP(), spot = myHeroes(me.id)[0] || myTowns(me.id)[0]; if (spot) centerOn(spot.x, spot.y);
  }
  if (G.over && !NET.overShown) { NET.overShown = true; showVictory(G.players[G.winner] || G.players[0]); }
  if (!G.sim) { NET.simActive = false; NET.simDay = 0; }
  else if (!G.over && G.simDay === G.day && NET.simDay !== G.day) simBegin();
}
function netMine() { NET.mine = new Set(G && NET.room ? G.players.filter(p => NET.room.seats[p.seat] && NET.room.seats[p.seat].owner === 'me').map(p => p.id) : []); }
const netMeta = () => ({ day: G.day, cur: G.cur, over: !!G.over, name: curP().name });

// ---------- отправка ----------
function netSend(snap, meta, nextSeat, start) {
  NET.q = NET.q.then(async () => {
    for (let i = 0; i < 6 && NET.on; i++) {
      try { const d = await netReq('POST', `api/rooms/${NET.code}/${start ? 'start' : 'snap'}`, { cid: NET.cid, snap, meta, nextSeat }); NET.sv = Math.max(NET.sv, d.sv); return d; }
      catch (e) {
        if (/не ваш ход|не идёт|уже идёт|хозяин/i.test(e.message)) { NET.auth = false; NET.sv = 0; toast(e.message, true); return null; } // сервер считает иначе — перечитаем партию
        toast('Нет связи с сервером, пробую ещё…', true); await realSleep(1200 * (i + 1));
      }
    }
    return null;
  });
  return NET.q;
}
// партия изменилась: если право хода у нас, скоро отправим снимок
function netDirty() { if (!NET.on || !NET.auth || !G || NET.timer || (G.sim && !G.over)) return; NET.timer = setTimeout(netFlush, 600); }
function netFlush() {
  NET.timer = null;
  if (!NET.on || !NET.auth || !G || (G.sim && !G.over)) return;
  if (BUSY || B) { NET.timer = setTimeout(netFlush, 400); return; } // посреди перехода или боя снимок не шлём
  if (BOTTING && !G.over) return;                                    // ходы ботов уйдут одним снимком в конце
  if (netRemote(G.cur) && !G.over) return;
  const snap = netPack();
  if (snap === NET.last) return; // ничего не изменилось — не шлём: иначе свой же снимок будил бы опрос, а тот — новую отправку
  NET.last = snap;
  netSend(snap, netMeta(), isBot(G.cur) ? null : G.players[G.cur].seat);
}
// ход дошёл до игрока за другим компьютером
function netHandOver() {
  clearTimeout(NET.timer); NET.timer = null;
  const snap = netPack(), meta = netMeta(), seat = G.players[G.cur].seat;
  NET.auth = false; NET.last = snap;
  netSend(snap, meta, seat);
  refresh();
}

// ---------- комната ----------
async function netCreate(pub) {
  const d = await netReq('POST', 'api/rooms', { cid: NET.cid, name: NET.name, public: !!pub, map: mapKind, turns: 'sim', seats });
  netEnter(d);
}
async function netJoin(code) {
  const d = await netReq('POST', `api/rooms/${encodeURIComponent(String(code).trim().toUpperCase())}/op`, { cid: NET.cid, op: 'hello', name: NET.name });
  netEnter(d);
}
function netEnter(d) {
  NET.on = true; NET.code = d.code; NET.v = 0; NET.sv = 0; NET.bv = 0; NET.auth = false; NET.shown = false; NET.room = null; NET.mine = new Set(); NET.view = null;
  try { history.replaceState(null, '', '?room=' + d.code); } catch (e) { /* не страшно */ }
  netRoom(d);
  NET.v = 0; // первый опрос должен ответить сразу и принести партию, если она уже идёт
  netLoop();
}
function netLeave() {
  NET.on = false; NET.code = ''; NET.room = null; NET.auth = false; NET.loopId++; NET.mine = new Set(); clearTimeout(NET.timer); NET.timer = null;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* не страшно */ }
  $('netBox').hidden = true; $('menu').hidden = false; renderMenu();
}
async function netOp(op, extra) {
  try { netRoom(await netReq('POST', `api/rooms/${NET.code}/op`, { cid: NET.cid, op, name: NET.name, ...extra })); }
  catch (e) { toast(e.message, true); }
}
async function netLoop() {
  const id = ++NET.loopId; let fails = 0;
  while (NET.on && id === NET.loopId) {
    try {
      const d = await netReq('GET', `api/rooms/${NET.code}?cid=${NET.cid}&v=${NET.v}&sv=${NET.sv}&bv=${NET.bv}&wait=1`);
      if (id !== NET.loopId) return;
      fails = 0; netRoom(d);
    } catch (e) {
      if (/не найдена/.test(e.message)) { toast('Комната закрыта', true); netLeave(); return; }
      fails++; await realSleep(Math.min(8000, 800 * fails));
    }
  }
}
// пришло состояние комнаты
function netRoom(d) {
  if (!NET.on || d.code !== NET.code) return;
  NET.room = d; NET.v = Math.max(NET.v, d.v);
  if (d.state === 'lobby') { if (!$('menu').hidden) renderMenu(); return; }
  if (d.snap && d.sv > NET.sv) { NET.sv = d.sv; if (!(NET.auth && G)) { if (B && B.mirror) netMirror(null); netApply(d.snap); } } // свой же снимок обратно не применяем
  // зеркало боя — только у тех, кто смотрит: считающему партию возвращается эхо его же боя, и показывать его нельзя
  if (d.bv > NET.bv) { NET.bv = d.bv; if (G && !NET.auth && d.battle !== undefined && !(B && !B.mirror)) netMirror(d.battle); }
  if (d.cmds) for (const c of d.cmds) if (B && !B.mirror && B.cmdWait && B.need >= 0 && G.players[B.sides[B.need].owner].seat === c.seat) { const r = B.cmdWait; B.cmdWait = null; r(c.cmd); }
  if (!G) return;
  netMine();
  if (d.auth && !NET.auth && !G.over) { NET.auth = true; if (B && B.mirror) netMirror(null); netTakeTurn(); }
  // одновременные ходы: хозяин сводит день, когда его сдали все
  if (d.host && G.sim && NET.simSent && NET.simDay === G.day && d.subDay === G.day && !NET.merging && d.subw > 0 && d.subn >= d.subw) simCollect();
  else if (!d.auth && NET.auth && NET.sv >= d.sv && !netRemote(G.cur) && d.meta && d.sv > 0 && !NET.timer) { /* сервер ещё не получил наш последний снимок — ждём */ }
  refresh();
}
// право хода перешло к этому компьютеру
async function netTakeTurn() {
  if (G.simPending) { G.simPending = false; await startDay(); return; } // нам передали партию, чтобы начать общий день
  if (G.sim) return;
  const p = curP();
  if (isBot(p.id) || netRemote(p.id)) { await beginTurn(); return; } // забрали партию посреди чужого хода: довести его до конца
  if (NET.introTurn === G.turnNo) { BOTTING = false; refresh(); return; }
  NET.introTurn = G.turnNo;
  await turnIntro(p);
}
// хозяин начинает партию
async function netStart() {
  const R = NET.room;
  const players = R.seats.map((s, i) => ({ seat: i, kind: s.kind, name: s.name || PCOL_NAME[i], fac: s.fac, hero: s.hero, diff: s.diff, col: PCOL[i] })).filter(p => p.kind !== 'off');
  genMap({ players, map: R.map, diff: gameDiff });
  NET.shown = true; NET.overShown = false; NET.introTurn = -1; NET.auth = true; netMine();
  const d = await netSend(netPack(), netMeta(), null, true);
  if (!d) { G = null; NET.auth = false; renderMenu(); return; }
  NET.introTurn = G.turnNo;
  prerender(); $('menu').hidden = true; refresh();
  await startDay();
}

// ---------- одновременные ходы ----------
// Пока бригады людей далеко друг от друга, день играют все сразу: каждый — на своей копии партии и только за себя.
// В конце дня хозяин комнаты сводит копии (у каждого — его герои, города, казна и то, что он забрал с карты),
// проводит ходы ботов и начинает новый день. Как только бригады сблизились — дни снова идут по очереди.
const SIM_FAR = 12; // ближе этого — «контакт», ходим по очереди. Нападать на людей в общий день всё равно нельзя, так что порог можно держать небольшим
function simOk() {
  if (!NET.on || !NET.room || NET.room.turns !== 'sim' || NET.room.hostSeat < 0) return false;
  const hs = G.players.filter(p => p.alive && p.kind !== 'bot');
  if (hs.length < 2) return false;
  for (const a of hs) for (const b of hs) if (a.id < b.id) {
    const A = myHeroes(a.id), Bs = [...myHeroes(b.id), ...myTowns(b.id)], A2 = [...A, ...myTowns(a.id)], B2 = myHeroes(b.id);
    for (const x of A) for (const y of Bs) if (Math.hypot(x.x - y.x, x.y - y.y) < SIM_FAR) return false;
    for (const x of B2) for (const y of A2) if (Math.hypot(x.x - y.x, x.y - y.y) < SIM_FAR) return false;
  }
  return true;
}
// последний ходивший в день «по очереди» отдаёт партию хозяину комнаты, чтобы тот начал общий день
async function simHandToHost() {
  if (NET.room.host) { await startDay(); return; }
  G.simPending = true;
  clearTimeout(NET.timer); NET.timer = null;
  const snap = netPack(); NET.auth = false;
  netSend(snap, netMeta(), NET.room.hostSeat); refresh();
}
// хозяин (или тот, кто считает партию) решает, каким будет новый день
async function startDay() {
  if (G.over) return;
  if (NET.room && NET.room.host && simOk()) {
    for (const p of G.players) if (p.alive && p.kind !== 'bot') { turnEffects(p); if (p.noTown >= 7) { G.heroes = G.heroes.filter(h => h.owner !== p.id); notify(p.id, 'Неделя без своего города — бригада распалась.'); } }
    G.sim = false; checkWin();
    if (G.over || !simOk()) { if (G.over) { netSend(netPack(), netMeta(), NET.room.hostSeat); refresh(); return; } G.cur = Math.max(0, G.players.findIndex(p => p.alive)); await beginTurn(); return; }
    G.sim = true; G.simDay = G.day; G.simDays = (G.simDays || 0) + 1;
    await netSend(netPack(), netMeta(), NET.room.hostSeat);
    simBegin();
    return;
  }
  G.sim = false;
  let n = G.players.findIndex(p => p.alive); if (n < 0) n = 0;
  if (G.turnNo === 0 || G.players[G.cur] == null || !G.players[G.cur].alive) G.cur = n;
  await beginTurn();
}
// начало общего дня на этом компьютере
function simBegin() {
  NET.simDay = G.day; NET.simBase = netPack(); NET.simSent = !!(NET.room && NET.room.submitted && NET.room.subDay === G.day); NET.merging = false;
  NET.simList = [...NET.mine].filter(id => G.players[id].alive).sort((a, b) => a - b);
  if (NET.simSent) { NET.simActive = false; refresh(); return; }       // день уже сдан (страницу перезагрузили)
  if (!NET.simList.length) { NET.simActive = false; if (NET.mine.size) netSubmit(); refresh(); return; } // выбывшим и зрителям ходить нечем
  NET.simActive = true; G.cur = NET.simList[0]; NET.introTurn = G.turnNo;
  turnIntro(curP());
}
async function simEndTurn() {
  if (BUSY || !NET.simActive) return;
  const i = NET.simList.indexOf(G.cur);
  if (i >= 0 && i < NET.simList.length - 1) { G.cur = NET.simList[i + 1]; await turnIntro(curP()); return; } // ещё одно своё место за этим компьютером
  NET.simActive = false; UI.sel = null; UI.plan = null; refresh();
  await netSubmit();
}
async function netSubmit() {
  NET.simSent = true;
  const data = netPack();
  for (let i = 0; i < 6 && NET.on; i++) {
    try { await netReq('POST', `api/rooms/${NET.code}/submit`, { cid: NET.cid, day: G.day, data }); refresh(); return; }
    catch (e) { toast('Нет связи с сервером, пробую ещё…', true); await realSleep(1200 * (i + 1)); }
  }
}
// хозяин: забрать сданные дни, свести, провести ботов, начать новый день
async function simCollect() {
  if (NET.merging || !G.sim || NET.simDay !== G.day) return; // сводим только день, который сами начали
  NET.merging = true;
  try {
    const d = await netReq('GET', `api/rooms/${NET.code}/subs?cid=${NET.cid}`);
    simMerge(d.subs || {});
    G.sim = false; NET.simActive = false; reindex(); netMine(); UI.sel = null; UI.plan = null;
    checkWin();
    for (const p of G.players) {                      // ходы ботов — после людей
      if (G.over || !p.alive || p.kind !== 'bot') continue;
      G.cur = p.id; BOTTING = true; turnEffects(p); refresh();
      try { await sleep(250); await botTurn(p); } catch (e) { console.error('Ошибка в ходе бота', e); BUSY = false; }
      BOTTING = false;
    }
    if (!G.over) { G.day++; if (dayOfWeek() === 1) newWeek(); G.turnNo = (G.turnNo || 0) + 1; G.cur = Math.max(0, G.players.findIndex(p => p.alive)); }
    NET.merging = false;
    if (G.over) { netSend(netPack(), netMeta(), NET.room.hostSeat); refresh(); return; }
    await startDay();
  } catch (e) { NET.merging = false; console.error('Не удалось свести день', e); toast('Не удалось свести день: ' + e.message, true); }
}
// Свести копии: за основу — партия хозяина после его дня, из каждой чужой копии берём только то, что принадлежит её игрокам
function simMerge(subs) {
  const base = netUnpack(NET.simBase), baseObj = new Map(base.objs.map(o => [o.id, o])), baseHero = new Set(base.heroes.map(h => h.id));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), done = new Set();
  for (const key of Object.keys(subs)) {
    const seat = +key, data = subs[key];
    if (done.has(data) || !NET.room.seats[seat] || NET.room.seats[seat].owner === 'me') continue;
    done.add(data);
    const S = netUnpack(data), pids = G.players.filter(p => subs[p.seat] === data).map(p => p.id), mine = o => pids.includes(o.owner);
    if (S.seed !== G.seed || S.day !== G.day) continue;                       // чужая или устаревшая копия
    const sObj = new Map(S.objs.map(o => [o.id, o])), sHero = new Set(S.heroes.map(h => h.id));
    G.objs = G.objs.filter(o => !baseObj.has(o.id) || sObj.has(o.id));        // что игрок забрал или разбил — исчезает
    for (const o of S.objs) {
      const b = baseObj.get(o.id), i = G.objs.findIndex(x => x.id === o.id);
      if (!b || i < 0) continue;
      const m = G.objs[i];
      if (o.t === 'town' && mine(o) && (pids.includes(b.owner) || m.owner === b.owner)) G.objs[i] = o;           // свой город или взятый первым
      else if (o.t === 'town' && !mine(o) && m.owner === b.owner && !same(o.garrison, b.garrison)) m.garrison = o.garrison; // потрёпанный гарнизон после неудачного штурма
      else if (o.t === 'mine' && mine(o) && o.owner !== b.owner && m.owner === b.owner) G.objs[i] = o;
      else if (o.t === 'mine' && !same(o.roof || null, b.roof || null)) m.roof = o.roof || null;   // поставили или сняли крышу
      else if (o.t === 'bonus' && o.seen.length !== b.seen.length) m.seen = [...new Set([...m.seen, ...o.seen])];
      else if (o.t === 'mob' && !same(o.army, b.army)) m.army = o.army;
    }
    G.heroes = G.heroes.filter(h => !pids.includes(h.owner) && !(isBot(h.owner) && baseHero.has(h.id) && !sHero.has(h.id))).concat(S.heroes.filter(h => pids.includes(h.owner)));
    for (const p of G.players) {
      if (pids.includes(p.id)) { G.players[p.id] = S.players[p.id]; continue; }
      const extra = (S.players[p.id].inbox || []).slice((base.players[p.id].inbox || []).length);       // что этот игрок «сообщил» другим
      if (extra.length) p.inbox = [...(p.inbox || []), ...extra];
    }
    G.jail = (G.jail || []).filter(j => !pids.includes(j.hero.owner)).concat((S.jail || []).filter(j => pids.includes(j.hero.owner))); // пленные — от их хозяина
    G.nextId = Math.max(G.nextId, S.nextId);
  }
}

// ---------- живая защита: бой показывается всем, защитник командует своими отрядами ----------
const netSeatOnline = pid => !!(NET.room && G.players[pid] && NET.room.seats[G.players[pid].seat] && NET.room.seats[G.players[pid].seat].online);
// тот, кто считает бой, рассылает его состояние после каждого действия; data = null — бой кончился
function netBattlePush(end) {
  if (!NET.on || !NET.auth || (G && G.sim) || (!end && (!B || B.quick || B.mirror))) return; // в общий день каждый дерётся у себя, показывать некому
  const data = end ? null : JSON.stringify({
    title: B.title, arena: B.arena, round: B.round, active: B.active ? B.active.id : -1, need: B.need == null ? -1 : B.need, log: B.log,
    sides: B.sides.map(sd => ({ owner: sd.owner, hero: sd.hero ? { name: sd.hero.name, mana: sd.hero.mana, fac: sd.hero.fac } : null, st: sd.st, castRound: sd.castRound, ultUsed: !!sd.ultUsed, fence: sd.fence, remote: !!sd.remote })),
    stacks: B.stacks.map(s => ({ id: s.id, side: s.side, slot: s.slot, u: s.u, n: s.n, n0: s.n0, hp: s.hp, x: s.x, y: s.y, shots: s.shots, ret: s.ret, buff: s.buff, defd: s.defd, waited: s.waited, curse: s.curse, slow: s.slow, stun: s.stun, moved: s.moved })),
    obst: [...B.obst], barrels: [...B.barrels], fences: [...B.fences], queue: B.queue.map(s => s.id),
  });
  NET.q = NET.q.then(() => netReq('POST', `api/rooms/${NET.code}/battle`, { cid: NET.cid, data }).then(d => { NET.bv = Math.max(NET.bv, d.bv); }, () => {}));
}
// у остальных: показать чужой бой; если ход за нашим отрядом — включить управление
function netMirror(data) {
  if (!data) { if (B && B.mirror) { battleUI(false); B = null; } return; }
  const v = JSON.parse(data), old = B && B.mirror ? B : null, pool0 = s => (s.n - 1) * UNITS[s.u].hp + s.hp;
  const stacks = v.stacks.map(s => { const o = old && old.stacks.find(x => x.id === s.id); return { ...s, px: o ? o.px : s.x, py: o ? o.py : s.y, flash: o && pool0(o) > pool0(s) ? 1 : 0, lunge: null, was: o ? pool0(o) : pool0(s) }; });
  const sides = v.sides.map((sd, i) => ({ i, owner: sd.owner, hero: sd.hero, st: sd.st, castRound: sd.castRound, ultUsed: sd.ultUsed, fence: sd.fence, remote: sd.remote, auto: !(sd.remote && NET.mine.has(sd.owner)) }));
  const active = stacks.find(s => s.id === v.active) || null, mine = v.need >= 0 && active && active.side === v.need && NET.mine.has(sides[v.need].owner);
  B = { mirror: true, quick: false, title: v.title, arena: ARENAS[v.arena] ? v.arena : 'yard', parts: old ? old.parts : [], bg: old ? old.bg : null, round: v.round, sides, stacks, obst: new Set(v.obst), barrels: new Set(v.barrels), fences: new Set(v.fences), queue: v.queue.map(id => stacks.find(s => s.id === id)).filter(Boolean), active, log: v.log, fx: old ? old.fx : [], shake: old ? old.shake : 0, spell: null, busy: false, over: false, need: v.need, wait: mine ? () => {} : null };
  for (const s of stacks) if (s.was > pool0(s)) { B.fx.push({ x: s.x, y: s.y, text: `−${s.was - pool0(s)}`, col: '#ff5050', t: 0 }); burst(s.x, s.y, 6, ['#ff5050', '#c8372d', '#f08a2c'], { v: 0.06 }); if (s.n <= 0) { B.shake = 5; s.dead = 1; burst(s.x, s.y, 12, ['#c8c8d0', '#8a8a96'], { v: 0.06, g: -0.001 }); } }
  if (!old) { battleUI(true); sfx('battle'); if (sides.some(sd => sd.remote && NET.mine.has(sd.owner))) toast('На вас напали — отбивайтесь!', true); }
  else if (mine) sfx('turn');
  refreshBattleUI();
}
// защитник отдал команду своему отряду
function netCmd(cmd) {
  if (!B || !B.mirror || !B.wait) return;
  B.wait = null; B.spell = null; $('bSpells').hidden = true; refreshBattleUI();
  netReq('POST', `api/rooms/${NET.code}/cmd`, { cid: NET.cid, cmd }).catch(e => toast(e.message, true));
}

// ---------- в игре: кто в комнате ----------
function netBox() {
  const el = $('netBox');
  if (!NET.on || !NET.room || !G) { el.hidden = true; return; }
  const R = NET.room, cur = G.players[G.cur];
  if (!cur) { el.hidden = true; return; }
  const seat = R.seats[cur.seat];
  const waiting = G.sim && !NET.simActive && !G.over;
  const rows = G.players.map(p => { const s = R.seats[p.seat]; return `<span style="color:${p.col};opacity:${p.alive ? 1 : 0.4}">${p.kind === 'bot' ? ico('i_bot', 14) : `<i class="dot ${s && s.online ? 'on' : ''}"></i>`} ${esc(p.name)}${s && s.owner === 'me' ? ' (вы)' : ''}</span>`; }).join(' · ');
  const stuck = R.host && !G.over && !G.sim && cur.kind !== 'bot' && seat && seat.owner !== 'me' && !seat.online;
  el.hidden = false;
  el.innerHTML = `<h3>Комната ${R.code}</h3><small>${rows}</small>${G.sim && !G.over ? `<br><small>Общий день: сдали ${R.subDay === G.day ? R.subn : 0} из ${R.subw}</small>` : ''}${waiting && R.host && R.subn < R.subw && NET.simSent ? '<button class="sec" id="netGoOn" style="margin-top:6px;width:100%">Не ждать остальных</button>' : ''}${stuck ? `<button class="sec" id="netTake" style="margin-top:6px;width:100%">Игрок не в сети — забрать его ход</button>` : ''}`;
  if (stuck) $('netTake').onclick = () => netOp('takeover', { seat: cur.seat });
  if ($('netGoOn')) $('netGoOn').onclick = () => simCollect();
}
async function netList() { try { NET.list = (await netReq('GET', 'api/rooms')).rooms; } catch (e) { NET.list = null; } if (!NET.on && !$('menu').hidden) renderMenu(); }

addEventListener('load', () => {
  const code = new URLSearchParams(location.search).get('room');
  if (code) netJoin(code).catch(e => { toast(e.message, true); try { history.replaceState(null, '', location.pathname); } catch (x) { /* не страшно */ } });
});
