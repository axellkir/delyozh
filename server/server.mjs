// Сервер комнат «Делёж»: лобби по коду, список открытых комнат, пересылка состояния партии.
// Правил игры не знает. Партию считает клиент того, чей сейчас ход, и присылает снимок; сервер хранит последний
// снимок, следит, что присылает его тот, у кого право хода, и раздаёт остальным. Обновления — долгим опросом
// (обычные HTTP-запросы проходят через любой прокси). Без зависимостей.
//
// Переменные: PORT (8791), HOST (127.0.0.1), DATA_DIR (где хранить комнаты), STATIC_DIR (раздавать и игру — для разработки).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8791), HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(here, 'data'), STATIC = process.env.STATIC_DIR || '';
const FILE = path.join(DATA, 'rooms.json');
const MAX_BODY = 400 * 1024, MAX_ROOMS = 300, POLL_MS = 25000, ONLINE_MS = 45000;
const DAY = 86400000, TTL_LOBBY = DAY, TTL_GAME = 30 * DAY;
const FACS = ['kach', 'rynok', 'neform'], KINDS = ['human', 'bot', 'off'];

const rooms = new Map();   // код → комната
const waiters = new Map(); // код → [{res, timer, cid, sv}]
const created = new Map(); // ip → [время создания комнат]

// ---------- хранение ----------
try { fs.mkdirSync(DATA, { recursive: true }); for (const r of JSON.parse(fs.readFileSync(FILE, 'utf8'))) rooms.set(r.code, r); } catch { /* первый запуск */ }
let saveT = null;
function save() { if (saveT) return; saveT = setTimeout(() => { saveT = null; fs.writeFile(FILE + '.tmp', JSON.stringify([...rooms.values()]), e => { if (!e) fs.rename(FILE + '.tmp', FILE, () => {}); }); }, 1500); }
setInterval(() => { const now = Date.now(); for (const r of rooms.values()) if (now - r.touched > (r.state === 'lobby' ? TTL_LOBBY : TTL_GAME)) { rooms.delete(r.code); save(); } }, 600000).unref();

// ---------- помощники ----------
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const isCid = v => typeof v === 'string' && /^[a-f0-9]{16,64}$/.test(v);
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (;;) { let c = ''; for (const b of crypto.randomBytes(5)) c += A[b % A.length]; if (!rooms.has(c)) return c; } }
const online = (r, cid) => !!cid && Date.now() - (r.seen[cid] || 0) < ONLINE_MS;
function seatIn(s, i) { // привести место из запроса к допустимому виду
  s = s || {};
  return { kind: KINDS.includes(s.kind) ? s.kind : 'off', name: str(s.name, 16) || `Бригада ${i + 1}`, fac: FACS.includes(s.fac) ? s.fac : FACS[i % 3], hero: Number.isInteger(s.hero) && s.hero >= -1 && s.hero < 4 ? s.hero : -1, diff: [0, 1, 2].includes(s.diff) ? s.diff : 1, owner: null };
}
// что видит конкретный клиент: чужие ключи не раскрываем
// sv, bv — какие снимок партии и состояние боя у клиента уже есть
function view(r, cid, sv, bv = 1e15) {
  return {
    code: r.code, v: r.v, state: r.state, public: r.public, map: r.map, host: r.host === cid, hostName: r.names[r.host] || 'Хозяин',
    seats: r.seats.map(s => ({ kind: s.kind, name: s.name, fac: s.fac, hero: s.hero, diff: s.diff, owner: s.owner ? (s.owner === cid ? 'me' : 'other') : null, ownerName: s.owner ? r.names[s.owner] || '' : '', online: online(r, s.owner) })),
    auth: r.auth === cid, authOnline: online(r, r.auth), meta: r.meta, sv: r.sv, snap: r.snap && r.sv > sv ? r.snap : undefined,
    bv: r.bv || 0, battle: (r.bv || 0) > bv ? r.battle || null : undefined,
    // одновременные ходы: сколько мест уже сдали свой день и сдал ли его этот клиент
    subDay: r.subDay || 0, turns: r.turns || 'seq', hostSeat: r.seats.findIndex(s => s.owner === r.host),
    subn: r.seats.filter((s, i) => s.kind === 'human' && s.owner && r.subs && r.subs[i] != null).length,
    subw: r.seats.filter(s => s.kind === 'human' && s.owner).length,
    submitted: r.seats.some(s => s.owner === cid) && r.seats.every((s, i) => s.owner !== cid || (r.subs && r.subs[i] != null)),
  };
}
// ответ на опрос: тому, кто считает партию, заодно отдаём накопившиеся команды защитника
function reply(r, cid, sv, bv) {
  const v = view(r, cid, sv, bv);
  if (r.auth === cid && r.cmds && r.cmds.length) { v.cmds = r.cmds; r.cmds = []; }
  return v;
}
function bump(r) {
  r.v++; r.touched = Date.now(); save();
  const list = waiters.get(r.code) || []; waiters.delete(r.code);
  for (const w of list) { clearTimeout(w.timer); send(w.res, 200, reply(r, w.cid, w.sv, w.bv)); }
}
function send(res, code, obj) { if (res.writableEnded) return; const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); res.end(b); }
const fail = (res, code, msg) => send(res, code, { error: msg });
function body(req) {
  return new Promise((ok, bad) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { bad(new Error('слишком большой запрос')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { bad(new Error('не JSON')); } });
    req.on('error', bad);
  });
}

// ---------- действия в лобби ----------
function lobbyOp(r, cid, b) {
  const host = r.host === cid, s = r.seats[b.seat];
  if (b.name != null) r.names[cid] = str(b.name, 16) || 'Игрок';
  switch (b.op) {
    case 'hello': return null;
    case 'claim': // сесть на свободное место для человека
      if (r.state !== 'lobby') return 'Партия уже идёт';
      if (!s || s.kind !== 'human' || s.owner) return 'Место занято';
      s.owner = cid; s.name = str(b.seatName, 16) || s.name; return null;
    case 'leave':
      if (r.state !== 'lobby') return 'Партия уже идёт';
      if (!s || (s.owner !== cid && !host)) return 'Это не ваше место';
      s.owner = null; return null;
    case 'set': // своё место правит сам игрок; места ботов и пустые — хозяин комнаты
      if (r.state !== 'lobby') return 'Партия уже идёт';
      if (!s || !(s.owner === cid || (host && !s.owner))) return 'Это не ваше место';
      if (b.fac != null && FACS.includes(b.fac)) { if (s.fac !== b.fac) s.hero = -1; s.fac = b.fac; }
      if (Number.isInteger(b.hero) && b.hero >= -1 && b.hero < 4) s.hero = b.hero;
      if (b.seatName != null) s.name = str(b.seatName, 16) || s.name;
      if (host && [0, 1, 2].includes(b.diff)) s.diff = b.diff;
      return null;
    case 'kind':
      if (!host || r.state !== 'lobby' || !s || !KINDS.includes(b.kind)) return 'Это может только хозяин комнаты';
      if (s.kind !== b.kind) { s.kind = b.kind; s.owner = null; } return null;
    case 'map': if (!host || r.state !== 'lobby') return 'Это может только хозяин комнаты'; r.map = b.map === 'ring' ? 'ring' : 'msk'; return null;
    case 'public': if (!host) return 'Это может только хозяин комнаты'; r.public = !!b.public; return null;
    case 'turns': if (!host || r.state !== 'lobby') return 'Это может только хозяин комнаты'; r.turns = b.turns === 'seq' ? 'seq' : 'sim'; return null;
    case 'takeover': // хозяин забирает место отвалившегося игрока и право хода, чтобы партия не встала
      if (!host || r.state !== 'playing' || !s || s.kind !== 'human' || online(r, s.owner)) return 'Забрать можно только место игрока, который не в сети';
      if (r.auth === s.owner) r.auth = cid;
      s.owner = cid; return null;
    default: return 'Неизвестное действие';
  }
}

// ---------- запросы ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // api, rooms, CODE, действие
  if (parts[1] === 'health') return send(res, 200, { ok: true, rooms: rooms.size });
  if (parts[1] !== 'rooms') return fail(res, 404, 'нет такого адреса');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (!parts[2]) {
    if (req.method === 'GET') { // открытые комнаты, ждущие игроков
      const list = [...rooms.values()].filter(r => r.public && r.state === 'lobby' && online(r, r.host)).sort((a, b) => b.touched - a.touched).slice(0, 30)
        .map(r => ({ code: r.code, hostName: r.names[r.host] || 'Хозяин', map: r.map, free: r.seats.filter(s => s.kind === 'human' && !s.owner).length, humans: r.seats.filter(s => s.kind === 'human').length, bots: r.seats.filter(s => s.kind === 'bot').length }));
      return send(res, 200, { rooms: list });
    }
    if (req.method !== 'POST') return fail(res, 405, 'не тот метод');
    const b = await body(req);
    if (!isCid(b.cid)) return fail(res, 400, 'нет ключа клиента');
    const now = Date.now(), mine = (created.get(ip) || []).filter(t => now - t < 3600000);
    if (mine.length >= 30 || rooms.size >= MAX_ROOMS) return fail(res, 429, 'Слишком много комнат, попробуйте позже');
    created.set(ip, [...mine, now]);
    const seats = Array.from({ length: 6 }, (_, i) => seatIn(Array.isArray(b.seats) ? b.seats[i] : null, i));
    const first = seats.find(s => s.kind === 'human'); if (first) first.owner = b.cid;
    const r = { code: newCode(), host: b.cid, created: now, touched: now, public: !!b.public, state: 'lobby', v: 1, map: b.map === 'ring' ? 'ring' : 'msk', turns: b.turns === 'seq' ? 'seq' : 'sim', subs: {}, seats, names: { [b.cid]: str(b.name, 16) || 'Хозяин' }, seen: { [b.cid]: now }, snap: null, sv: 0, auth: b.cid, meta: null };
    rooms.set(r.code, r); save();
    return send(res, 200, view(r, b.cid, 0));
  }

  const r = rooms.get(String(parts[2]).toUpperCase());
  if (!r) return fail(res, 404, 'Комната не найдена');

  if (req.method === 'GET') { // состояние комнаты; с wait=1 ждёт изменений
    const cid = url.searchParams.get('cid'), v = Number(url.searchParams.get('v') || 0), sv = Number(url.searchParams.get('sv') || 0), bv = Number(url.searchParams.get('bv') || 0);
    if (!isCid(cid)) return fail(res, 400, 'нет ключа клиента');
    r.seen[cid] = Date.now();
    if (parts[3] === 'subs') return r.host === cid ? send(res, 200, { subs: r.subs || {} }) : fail(res, 403, 'Это может только хозяин комнаты'); // сданные дни — хозяину, он их сводит
    if (r.v > v || url.searchParams.get('wait') !== '1') return send(res, 200, reply(r, cid, sv, bv));
    const w = { res, cid, sv, bv, timer: setTimeout(() => { const l = waiters.get(r.code) || []; waiters.set(r.code, l.filter(x => x !== w)); send(res, 200, reply(r, cid, sv, bv)); }, POLL_MS) };
    waiters.set(r.code, [...(waiters.get(r.code) || []), w]);
    req.on('close', () => { clearTimeout(w.timer); const l = waiters.get(r.code) || []; waiters.set(r.code, l.filter(x => x !== w)); });
    return undefined;
  }
  if (req.method !== 'POST') return fail(res, 405, 'не тот метод');
  const b = await body(req);
  if (!isCid(b.cid)) return fail(res, 400, 'нет ключа клиента');
  r.seen[b.cid] = Date.now();

  if (parts[3] === 'op') {
    const err = lobbyOp(r, b.cid, b);
    if (err) return fail(res, 409, err);
    bump(r); return send(res, 200, view(r, b.cid, r.sv));
  }
  if (parts[3] === 'battle') { // тот, кто считает партию, показывает остальным идущий бой (или сообщает, что он кончился)
    if (r.auth !== b.cid) return fail(res, 403, 'Сейчас не ваш ход');
    r.battle = typeof b.data === 'string' && b.data.length < 60000 ? b.data : null; r.bv = (r.bv || 0) + 1;
    bump(r); return send(res, 200, { ok: true, bv: r.bv });
  }
  if (parts[3] === 'submit') { // одновременные ходы: игрок сдал свой день
    if (r.state !== 'playing' || typeof b.data !== 'string' || b.data.length < 2) return fail(res, 409, 'Партия не идёт');
    const mine = r.seats.map((x, i) => (x.kind === 'human' && x.owner === b.cid ? i : -1)).filter(i => i >= 0);
    if (!mine.length) return fail(res, 403, 'Вы не в этой партии');
    const day = Number(b.day) || 0;
    if (r.subDay !== day) { r.subs = {}; r.subDay = day; } // сданное за прошлые дни больше не нужно
    for (const i of mine) r.subs[i] = b.data;
    bump(r); return send(res, 200, { ok: true });
  }
  if (parts[3] === 'cmd') { // игрок, на которого напали, командует своими отрядами
    const seat = r.seats.findIndex(x => x.kind === 'human' && x.owner === b.cid);
    if (seat < 0 || r.state !== 'playing' || !b.cmd || typeof b.cmd !== 'object') return fail(res, 403, 'Вы не в этой партии');
    r.cmds = [...(r.cmds || []), { seat, cmd: b.cmd }].slice(-20);
    bump(r); return send(res, 200, { ok: true });
  }
  if (parts[3] === 'start' || parts[3] === 'snap') {
    if (typeof b.snap !== 'string' || b.snap.length < 2) return fail(res, 400, 'нет снимка партии');
    if (parts[3] === 'start') {
      if (r.host !== b.cid) return fail(res, 403, 'Начать может только хозяин комнаты');
      if (r.state !== 'lobby') return fail(res, 409, 'Партия уже идёт');
      if (r.seats.some(s => s.kind === 'human' && !s.owner)) return fail(res, 409, 'Не все места заняты');
      r.state = 'playing'; r.auth = b.cid; r.public = false;
    } else {
      if (r.state !== 'playing') return fail(res, 409, 'Партия не идёт');
      if (r.auth !== b.cid) return fail(res, 403, 'Сейчас не ваш ход');
    }
    r.snap = b.snap; r.sv++; r.cmds = [];
    if (parts[3] === 'start') { r.subs = {}; r.subDay = 0; }
    const m = b.meta || {};
    r.meta = { day: Number(m.day) || 1, cur: Number(m.cur) || 0, over: !!m.over, name: str(m.name, 16) };
    if (r.meta.over) r.state = 'over';
    // право хода переходит к хозяину места следующего игрока; если следующий — бот, остаётся у приславшего
    const next = r.seats[b.nextSeat];
    if (next && next.kind === 'human' && next.owner) r.auth = next.owner;
    bump(r); return send(res, 200, { ok: true, sv: r.sv, v: r.v, auth: r.auth === b.cid });
  }
  return fail(res, 404, 'нет такого действия');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) { api(req, res, url).catch(e => fail(res, 400, String(e.message || e))); return; }
  if (!STATIC) { fail(res, 404, 'здесь только /api'); return; }
  const rel = decodeURIComponent(url.pathname), file = path.join(STATIC, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(STATIC) || rel.startsWith('/server/')) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end('not found'); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
server.listen(PORT, HOST, () => console.log(`ДЕЛЁЖ, сервер комнат: http://${HOST}:${PORT}${STATIC ? ' (с игрой)' : ' (только /api)'}`));
