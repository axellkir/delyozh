'use strict';
// Карта: симметричная Москва, поделённая на секторы — Кремль в центре, Садовое кольцо, МКАД, у каждой бригады свой район.
// Секторов столько же, сколько бригад (но не меньше трёх); чем их больше, тем шире МКАД, чтобы районы не сжимались.

let NSEC = 3, MR = 20, MW = 44, MH = 44, MCX = 22, MCY = 22;
const KREMLIN_R = 4.4;
// радиус «как на карте для троих» → настоящий радиус на этой карте
const sr = r => (r <= KREMLIN_R ? r : KREMLIN_R + (r - KREMLIN_R) * (MR - KREMLIN_R) / (20 - KREMLIN_R));
// size — сторона карты «Москва 90-х» в клетках; без неё строится симметричная схема на nsec секторов
function setMap(nsec, size) {
  NSEC = clamp(nsec || 3, 3, 6); MR = size ? size / 2 - 4 : [20, 23, 26, 29][NSEC - 3];
  MW = MH = size || 2 * (MR + 2); MCX = MCY = MW / 2;
  OIDX = new Int32Array(MW * MH).fill(-1);
}
const T = { GROUND: 0, ROAD: 1, PARK: 2, WATER: 3, BLOCK: 4, WALL: 5, FOREST: 6 };
const TCOST = [6, 4, 9];
const passT = t => t <= 2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

let G = null;                 // всё состояние партии (сохраняется целиком)
let OIDX = new Int32Array(MW * MH).fill(-1); // индекс объектов по клеткам (не сохраняется)
const isBot = pid => pid >= 0 && !!G && !!G.players[pid] && G.players[pid].kind === 'bot';

const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const tileAt = (x, y) => (inMap(x, y) ? G.tiles[y * MW + x] : T.FOREST);
const objAt = (x, y) => { if (!inMap(x, y)) return null; const i = OIDX[y * MW + x]; return i >= 0 ? G.objs[i] : null; };
const heroAt = (x, y) => G.heroes.find(h => h.x === x && h.y === y) || null;
function reindex() { OIDX.fill(-1); G.objs.forEach((o, i) => { OIDX[o.y * MW + o.x] = i; }); }

// ---------- шум ----------
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// угол главного направления сектора k
const secAng = k => -Math.PI / 2 + k * 2 * Math.PI / NSEC;
// клетка по «местным» координатам сектора: r — расстояние от Кремля и deg — отклонение от оси района в градусах,
// оба заданы как для карты на троих и пересчитываются под текущее число секторов
function secTile(k, r, deg) { const a = secAng(k) + deg * (3 / NSEC) * Math.PI / 180, R = sr(r); return [Math.round(MCX - 0.5 + R * Math.cos(a)), Math.round(MCY - 0.5 + R * Math.sin(a))]; }

function genTerrain(seed) {
  const tiles = new Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const dx = x + 0.5 - MCX, dy = y + 0.5 - MCY, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let rel = 9;
    for (let k = 0; k < NSEC; k++) { let d = a - secAng(k); d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < Math.abs(rel)) rel = d; }
    const lx = r * Math.cos(rel), ly = Math.abs(r * Math.sin(rel)), side = r * Math.sin(Math.PI / NSEC - Math.abs(rel));
    let t = T.GROUND;
    const n1 = vnoise(lx * 0.42, ly * 0.42, seed), n2 = vnoise(lx * 0.3 + 40, ly * 0.3, seed + 7), n3 = vnoise(lx * 0.25, ly * 0.25 + 90, seed + 13);
    if (n1 > 0.64 && r > 5) t = T.BLOCK; else if (n2 > 0.6) t = T.PARK;
    if (n3 > 0.8 && r > sr(11) && r < sr(18.5)) t = T.WATER;
    if (Math.hypot(lx - sr(15.5), ly) < 3.4) t = T.GROUND;        // площадка под свой город
    if (Math.abs(r - sr(9.5)) < 0.62) t = T.ROAD;                   // Садовое кольцо
    if (Math.abs(r - MR) < 0.62) t = T.ROAD;                        // МКАД
    if (ly < 0.62 && r > 3 && r < MR + 0.5) t = T.ROAD;             // радиальный проспект к своему району
    if (side < 0.62 && r > sr(9.5) && r < MR + 0.3) t = T.ROAD;     // дорога по границе секторов
    if (r > MR + 0.8) t = r > MR + 1.6 ? T.FOREST : T.PARK;         // за МКАДом — лес
    if (r >= 3.3 && r < KREMLIN_R && ly >= 0.62) t = T.WALL;        // кремлёвская стена с воротами
    if (r < 3.3) t = T.ROAD;                                        // Красная площадь
    tiles[y * MW + x] = t;
  }
  return tiles;
}

// ---------- нейтральные охранники ----------
const MOB_TABLE = [
  null,
  [['rat', 15, 25], ['punk', 10, 15], ['shpana', 10, 15], ['chelnok', 8, 13]],
  [['dog', 8, 13], ['bomzh', 8, 12], ['gop', 7, 11], ['babka', 7, 11], ['metal', 6, 10]],
  [['patrol', 6, 9], ['boxer', 5, 8], ['chop', 5, 8], ['biker', 4, 7]],
  [['omon', 4, 6], ['byk', 3, 5], ['buh', 3, 5], ['raver', 3, 5]],
];
function mobArmy(level) {
  if (level >= 5) return [{ u: 'omon', n: rnd(9, 11) }, { u: 'patrol', n: rnd(18, 22) }, { u: 'champ', n: 2 }, { u: 'omon', n: rnd(9, 11) }, null];
  const [u, a, b] = pick(MOB_TABLE[level]);
  const n = rnd(a, b), army = [null, null, null, null, null];
  if (level >= 3) { const [u2, a2, b2] = pick(MOB_TABLE[level - 1]); army[2] = { u: u2, n: rnd(a2, b2) }; } // подмога уровнем ниже
  if (n >= 8 && Math.random() < 0.6) { army[0] = { u, n: Math.ceil(n / 2) }; army[1] = { u, n: Math.floor(n / 2) }; } else army[0] = { u, n };
  return army;
}

function genMap(cfg) {
  const seed = rnd(1, 99999), kind = cfg.map === 'ring' ? 'ring' : 'msk', np = cfg.players.length, gd = GAME_DIFF[cfg.diff] ? cfg.diff : 1;
  setMap(Math.max(3, np), kind === 'msk' ? (np <= 3 ? 56 : np === 4 ? 64 : 72) : 0);
  G = { ver: 5, diff: gd, seed, turnNo: 0, map: kind, size: MW, nsec: NSEC, day: 1, cur: 0, view: 0, nextId: 1, tiles: kind === 'msk' ? mskTerrain(seed) : genTerrain(seed), objs: [], heroes: [], players: [], log: [], week: null, over: false };
  cfg.players.forEach((p, i) => G.players.push({ id: i, seat: p.seat == null ? i : p.seat, name: p.name, fac: p.fac, kind: p.kind === 'bot' ? 'bot' : 'human', diff: clamp(p.diff == null ? 1 : p.diff, 0, DIFF.length - 1), col: p.col || PCOL[i], res: { gold: GAME_DIFF[gd].gold, fuel: 5, brick: 10 }, alive: true, seen: new Array(MW * MH).fill(0), inbox: [], tavernDay: 0 }));
  G.view = Math.max(0, G.players.findIndex(p => p.kind !== 'bot'));
  const free = (x, y) => inMap(x, y) && passT(tileAt(x, y)) && !G.objs.some(o => o.x === x && o.y === y);
  const near = (x, y) => { for (let rr = 0; rr <= 3; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (free(x + dx, y + dy)) return [x + dx, y + dy]; return null; };
  const add = (o, x, y) => { const p = near(x, y); if (!p) return null; o.id = G.nextId++; o.x = p[0]; o.y = p[1]; G.objs.push(o); return o; };
  // охранник рядом с ценностью — со стороны Кремля, чтобы к ценности нельзя было подойти, не подравшись
  const guard = (o, level) => {
    if (!o) return;
    const toC = Math.atan2(MCY - 0.5 - o.y, MCX - 0.5 - o.x);
    const cands = DIRS.map(([dx, dy]) => [o.x + dx, o.y + dy, Math.cos(Math.atan2(dy, dx) - toC)]).filter(([x, y]) => free(x, y)).sort((a, b) => b[2] - a[2]);
    if (cands.length) add({ t: 'mob', army: mobArmy(level), lvl: level }, cands[0][0], cands[0][1]);
  };
  if (kind === 'msk') genMoscow(cfg, { free, near, add, guard });
  else for (let k = 0; k < NSEC; k++) {
    const pl = G.players[k], fac = pl ? pl.fac : FAC_IDS[k % 3];
    const S = (r, deg) => secTile(k, r, deg);
    const [tx, ty] = S(15.5, 0);
    const town = add(newTown(fac, pl ? k : -1), tx, ty);
    if (!pl) { town.garrison = mobArmy(3); }
    add({ t: 'mine', kind: 'gold', owner: -1 }, ...S(12.5, 18));
    add({ t: 'mine', kind: 'fuel', owner: -1 }, ...S(13, -20));
    add({ t: 'mine', kind: 'brick', owner: -1 }, ...S(18, 16));
    guard(add({ t: 'mine', kind: 'gold', owner: -1 }, ...S(8, 32)), 2);
    guard(add({ t: 'mine', kind: 'brick', owner: -1 }, ...S(11.5, -40)), 2);
    guard(add({ t: 'mine', kind: 'fuel', owner: -1 }, ...S(17.5, -50)), 2);
    for (const [r, d, res, amt] of [[14, 8, 'gold', 1000], [17.5, -12, 'gold', 750], [11, 10, 'fuel', 3], [16, -28, 'brick', 4], [10, -15, 'gold', 1000], [19, 32, 'brick', 5], [6.5, 20, 'gold', 2000]])
      add({ t: 'pile', res, amt }, ...S(r, d));
    add({ t: 'chest' }, ...S(12, -6));
    guard(add({ t: 'chest' }, ...S(16.5, 32)), 1);
    guard(add({ t: 'chest' }, ...S(6.5, -28)), 3);
    add({ t: 'bonus', kind: 'att', seen: [] }, ...S(14.5, -42));
    add({ t: 'bonus', kind: 'def', seen: [] }, ...S(17, 44));
    guard(add({ t: 'bonus', kind: 'pow', seen: [] }, ...S(7, -40)), 2);
    guard(add({ t: 'bonus', kind: 'xp', seen: [] }, ...S(12.5, 47)), 2);
    add({ t: 'bonus', kind: 'mp', seen: [] }, ...S(11, 26));
    guard(add({ t: 'art', art: ART_POOL[(k * 3 + rnd(0, 8)) % ART_POOL.length] }, ...S(8.5, -8)), 3);
    guard(add({ t: 'art', art: pick(ART_POOL) }, ...S(19, -30)), 2);
    add({ t: 'mob', army: mobArmy(1), lvl: 1 }, ...S(13, 34));
    add({ t: 'mob', army: mobArmy(4), lvl: 4 }, ...S(5.5, 0));
    add({ t: 'mob', army: mobArmy(3), lvl: 3 }, ...S(9.5, 60));
    add({ t: 'mob', army: mobArmy(2), lvl: 2 }, ...S(20, 60));
    // ничейный город на границе секторов
    const nt = add(newTown(FAC_IDS[(k + 1) % 3], -1), ...S(15, 60));
    if (nt) nt.garrison = mobArmy(3);
  }
  // Кремль: ключ, общак и полк охраны
  add({ t: 'art', art: 'key' }, MCX - 1, MCY - 1);
  add({ t: 'pile', res: 'gold', amt: 5000 }, MCX, MCY - 1);
  add({ t: 'pile', res: 'gold', amt: 5000 }, MCX - 1, MCY);
  add({ t: 'mob', army: mobArmy(5), lvl: 5, boss: true }, MCX, MCY);
  // сложность партии: местные и ничьи гарнизоны сильнее или слабее
  { const k = GAME_DIFF[gd].mobs; if (k !== 1) for (const o of G.objs) { const army = o.t === 'mob' ? o.army : o.t === 'town' && o.owner < 0 ? o.garrison : null; if (army) army.forEach(s => { if (s) s.n = Math.max(1, Math.round(s.n * k)); }); } }
  reindex();
  // всё, до чего нельзя дойти от первого города, убираем
  const reach = floodFrom(G.objs.find(o => o.t === 'town').x, G.objs.find(o => o.t === 'town').y);
  G.objs = G.objs.filter(o => reach[o.y * MW + o.x]);
  reindex();
  // герои
  G.players.forEach((p, i) => {
    const town = G.objs.find(o => o.t === 'town' && o.owner === i);
    const h = makeHero(i, p.fac, town.x, town.y, cfg.players[i].hero);
    const u = FACTIONS[p.fac].units, m = (SPECS[h.spec] || {}).army || 1;
    h.army = [{ u: u[0], n: Math.round(16 * m) }, { u: u[1], n: Math.round(6 * m) }, { u: u[0], n: Math.round(8 * m) }, null, null];
    G.heroes.push(h);
  });
  G.players.forEach(p => revealAll(p.id));
}

function newTown(fac, owner) {
  const units = FACTIONS[fac].units, avail = {};
  units.forEach((u, i) => { avail[u] = i === 0 ? UNITS[u].grow : 0; });
  return { t: 'town', fac, owner, name: FACTIONS[fac].town, built: { dw1: true }, avail, garrison: [null, null, null, null, null], builtDay: 0 };
}

// idx — номер героя в списке бригады, если игрок выбрал его в лобби; иначе случайный из ещё не занятых
function makeHero(owner, fac, x, y, idx) {
  const all = FACTIONS[fac].heroes, used = new Set(G.heroes.filter(h => h.fac === fac).map(h => h.name));
  const pool = all.filter(c => !used.has(c.name));
  const c = all[idx] || (pool.length ? pick(pool) : pick(all));
  // в день одновременных ходов героев нанимают сразу на нескольких компьютерах — номера не должны совпасть
  const id = NET.on && G.sim ? 100000 + G.day * 1000 + owner * 50 + myHeroes(owner).length : G.nextId++;
  const h = { id, owner, fac, name: c.name, spec: c.spec, x, y, mp: 90, att: 1, def: 1, pow: 1, mana: 15, lvl: 1, xp: 0, arts: [], army: [null, null, null, null, null], dest: null };
  h.mp = heroMaxMp(h);
  return h;
}

function floodFrom(sx, sy) {
  const seen = new Uint8Array(MW * MH), q = [[sx, sy]]; seen[sy * MW + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny) || seen[ny * MW + nx] || !passT(tileAt(nx, ny))) continue; seen[ny * MW + nx] = 1; q.push([nx, ny]); }
  }
  return seen;
}

// ---------- туман войны ----------
function reveal(pid, x, y, r) {
  const seen = G.players[pid].seen;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r && inMap(x + dx, y + dy)) seen[(y + dy) * MW + x + dx] = 1;
}
function revealAll(pid) {
  for (const h of G.heroes) if (h.owner === pid) reveal(pid, h.x, h.y, 6);
  for (const o of G.objs) if ((o.t === 'town' || o.t === 'mine') && o.owner === pid) reveal(pid, o.x, o.y, o.t === 'town' ? 8 : 3);
}

// ---------- путь героя ----------
const heroMaxMp = h => 90 + ((SPECS[h.spec] || {}).mp || 0) + 10 * ((h.perks || {}).mp || 0) + h.arts.reduce((s, a) => s + (ARTS[a].mp || 0), 0);
function mobZone() {
  const z = new Int32Array(MW * MH).fill(-1);
  for (const o of G.objs) if (o.t === 'mob') for (const [dx, dy] of DIRS) if (inMap(o.x + dx, o.y + dy)) z[(o.y + dy) * MW + o.x + dx] = o.id;
  return z;
}
// может ли герой пройти через клетку дальше (а не только остановиться на ней)
function passThrough(h, x, y, zone) {
  const o = objAt(x, y);
  if (zone[y * MW + x] >= 0) return false;
  if (o && (o.t === 'chest' || o.t === 'bonus' || o.t === 'art')) return false;
  if (o && o.t === 'town' && o.owner !== h.owner) return false;
  return true;
}
function enterable(h, x, y) {
  if (!inMap(x, y) || !passT(tileAt(x, y))) return false;
  const o = objAt(x, y); if (o && o.t === 'mob') return false;
  const oh = heroAt(x, y); if (oh && oh !== h) return false;
  return true;
}
// Дейкстра по клеткам; возвращает путь до (tx,ty) или до соседней клетки, если там враг/свой герой/охрана
function findPath(h, tx, ty) {
  if (!inMap(tx, ty)) return null;
  const zone = mobZone(), N = MW * MH, dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const s = h.y * MW + h.x; dist[s] = 0;
  const open = [s];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    const cx = c % MW, cy = (c / MW) | 0;
    if (c !== s && !passThrough(h, cx, cy, zone)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!enterable(h, nx, ny)) continue;
      if (dx && dy && (!passT(tileAt(cx + dx, cy)) || !passT(tileAt(cx, cy + dy)))) continue;
      const nd = dist[c] + TCOST[tileAt(nx, ny)] * (dx && dy ? 1.41 : 1), ni = ny * MW + nx;
      if (nd < dist[ni]) { if (dist[ni] === Infinity) open.push(ni); dist[ni] = nd; prev[ni] = c; }
    }
  }
  const tgtObj = objAt(tx, ty), tgtHero = heroAt(tx, ty);
  let action = null, end = ty * MW + tx;
  if ((tgtObj && tgtObj.t === 'mob') || (tgtHero && tgtHero !== h)) {
    action = tgtObj && tgtObj.t === 'mob' ? { kind: 'mob', id: tgtObj.id } : { kind: tgtHero.owner === h.owner ? 'meet' : 'hero', id: tgtHero.id };
    end = -1; let best = Infinity;
    for (const [dx, dy] of DIRS) { const nx = tx + dx, ny = ty + dy; if (!inMap(nx, ny)) continue; const i = ny * MW + nx; if (dist[i] < best) { best = dist[i]; end = i; } }
    if (end < 0 || best === Infinity) return null;
  } else if (dist[end] === Infinity) return null;
  const path = [];
  for (let c = end; c !== s && c >= 0; c = prev[c]) path.push({ x: c % MW, y: (c / MW) | 0, c: dist[c] });
  path.reverse();
  return { path, action, tx, ty };
}
