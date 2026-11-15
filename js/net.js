'use strict';
// Игра по сети. Комната на сервере хранит лобби и последний снимок партии. Партию считает клиент того, чей ход:
// после каждого действия он шлёт снимок, остальные его применяют и смотрят своими глазами (свой туман).
// Когда ход доходит до игрока за другим компьютером, вместе со снимком уходит право хода.
// Ходы ботов считает тот, кто ходил перед ними. В бою за игрока с другого компьютера отбивается ИИ.

const NET = { on: false, code: '', cid: '', name: '', room: null, v: 0, sv: 0, auth: false, mine: new Set(), view: null, introTurn: -1, timer: null, loopId: 0, shown: false, overShown: false, q: Promise.resolve(), list: null };
{
  const rnd16 = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  try { NET.cid = localStorage.getItem('delyozh_cid') || ''; if (!/^[a-f0-9]{32}$/.test(NET.cid)) { NET.cid = rnd16(); localStorage.setItem('delyozh_cid', NET.cid); } NET.name = localStorage.getItem('delyozh_name') || ''; }
  catch (e) { NET.cid = rnd16(); }
}
const netRemote = pid => NET.on && pid >= 0 && !!G && !!G.players[pid] && G.players[pid].kind !== 'bot' && !NET.mine.has(pid); // человек за другим компьютером
const netWatching = () => NET.on && !!G && (!NET.auth || netRemote(G.cur));                                                   // сейчас только смотрим
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
function netApply(snap) {
  const g = JSON.parse(snap), fresh = !G || !NET.shown || G.seed !== g.seed;
  setMap(g.nsec || 3, g.map === 'msk' ? g.size : 0);
  g.tiles = Array.from(g.tiles, Number); g.players.forEach(p => { p.seen = bitsUnpack(p.seen, MW * MH); });
  G = g; reindex(); netMine();
  if (UI.sel && !heroById(UI.sel)) UI.sel = null;
  if (fresh) {
    NET.shown = true; NET.overShown = false; NET.introTurn = -1; UI.sel = null; UI.plan = null;
    prerender(); $('menu').hidden = true;
    const me = viewP(), spot = myHeroes(me.id)[0] || myTowns(me.id)[0]; if (spot) centerOn(spot.x, spot.y);
  }
  if (G.over && !NET.overShown) { NET.overShown = true; showVictory(G.players[G.winner] || G.players[0]); }
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
function netDirty() { if (!NET.on || !NET.auth || !G || NET.timer) return; NET.timer = setTimeout(netFlush, 600); }
function netFlush() {
  NET.timer = null;
  if (!NET.on || !NET.auth || !G) return;
  if (BUSY || B) { NET.timer = setTimeout(netFlush, 400); return; } // посреди перехода или боя снимок не шлём
  if (BOTTING && !G.over) return;                                    // ходы ботов уйдут одним снимком в конце
  if (netRemote(G.cur) && !G.over) return;
  netSend(netPack(), netMeta(), isBot(G.cur) ? null : G.players[G.cur].seat);
}
// ход дошёл до игрока за другим компьютером
function netHandOver() {
  clearTimeout(NET.timer); NET.timer = null;
  const snap = netPack(), meta = netMeta(), seat = G.players[G.cur].seat;
  NET.auth = false;
  netSend(snap, meta, seat);
  refresh();
}

// ---------- комната ----------
async function netCreate(pub) {
  const d = await netReq('POST', 'api/rooms', { cid: NET.cid, name: NET.name, public: !!pub, map: mapKind, seats });
  netEnter(d);
}
async function netJoin(code) {
  const d = await netReq('POST', `api/rooms/${encodeURIComponent(String(code).trim().toUpperCase())}/op`, { cid: NET.cid, op: 'hello', name: NET.name });
  netEnter(d);
}
function netEnter(d) {
  NET.on = true; NET.code = d.code; NET.v = 0; NET.sv = 0; NET.auth = false; NET.shown = false; NET.room = null; NET.mine = new Set(); NET.view = null;
  try { history.replaceState(null, '', '?room=' + d.code); } catch (e) { /* не страшно */ }
  netRoom(d); netLoop();
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
      const d = await netReq('GET', `api/rooms/${NET.code}?cid=${NET.cid}&v=${NET.v}&sv=${NET.sv}&wait=1`);
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
  if (d.snap && d.sv > NET.sv) { NET.sv = d.sv; if (!(NET.auth && G)) netApply(d.snap); } // свой же снимок обратно не применяем
  if (!G) return;
  netMine();
  if (d.auth && !NET.auth && !G.over) { NET.auth = true; netTakeTurn(); }
  else if (!d.auth && NET.auth && NET.sv >= d.sv && !netRemote(G.cur) && d.meta && d.sv > 0 && !NET.timer) { /* сервер ещё не получил наш последний снимок — ждём */ }
  refresh();
}
// право хода перешло к этому компьютеру
async function netTakeTurn() {
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
  genMap({ players, map: R.map });
  NET.shown = true; NET.overShown = false; NET.introTurn = -1; NET.auth = true; netMine();
  const d = await netSend(netPack(), netMeta(), null, true);
  if (!d) { G = null; NET.auth = false; renderMenu(); return; }
  NET.introTurn = G.turnNo;
  startPlaying();
}

// ---------- в игре: кто в комнате ----------
function netBox() {
  const el = $('netBox');
  if (!NET.on || !NET.room || !G) { el.hidden = true; return; }
  const R = NET.room, cur = G.players[G.cur], seat = R.seats[cur.seat];
  const rows = G.players.map(p => { const s = R.seats[p.seat]; return `<span style="color:${p.col};opacity:${p.alive ? 1 : 0.4}">${p.kind === 'bot' ? '🤖' : s && s.online ? '🟢' : '⚪'} ${esc(p.name)}${s && s.owner === 'me' ? ' (вы)' : ''}</span>`; }).join(' · ');
  const stuck = R.host && !G.over && cur.kind !== 'bot' && seat && seat.owner !== 'me' && !seat.online;
  el.hidden = false;
  el.innerHTML = `<h3>🌐 Комната ${R.code}</h3><small>${rows}</small>${stuck ? `<button class="sec" id="netTake" style="margin-top:6px;width:100%">Игрок не в сети — забрать его ход</button>` : ''}`;
  if (stuck) $('netTake').onclick = () => netOp('takeover', { seat: cur.seat });
}
async function netList() { try { NET.list = (await netReq('GET', 'api/rooms')).rooms; } catch (e) { NET.list = null; } if (!NET.on && !$('menu').hidden) renderMenu(); }

addEventListener('load', () => {
  const code = new URLSearchParams(location.search).get('room');
  if (code) netJoin(code).catch(e => { toast(e.message, true); try { history.replaceState(null, '', location.pathname); } catch (x) { /* не страшно */ } });
});
