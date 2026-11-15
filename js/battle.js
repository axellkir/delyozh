'use strict';
// Тактический бой: поле 11×8, отряды ходят по скорости, стрелки стреляют, ответка раз за раунд.

const BW = 11, BH = 8;
let B = null;
const OBST = ['🗑️', '🚗', '🛢️', '📦', '🚧'];

function runBattle(cfg) {
  return new Promise(resolve => {
    // за сторону ходит ИИ, если это местные, бот или прикидка боя; понтами ИИ пользуется только у ботов не ниже обычного
    const side = (c, i) => ({ i, hero: c.hero, owner: c.owner, fence: !!c.fence, st: c.hero ? heroStats(c.hero) : { att: 0, def: 0, pow: 0, spd: 0 }, castRound: 0, auto: c.owner < 0 || !!window.AUTOBATTLE || !!cfg.sim || isBot(c.owner) || netRemote(c.owner), aiCast: !!c.hero && (cfg.sim ? true : isBot(c.owner) && DIFF[G.players[c.owner].diff].spells), src: c.army });
    const sides = [side(cfg.a, 0), side(cfg.d, 1)];
    // бой без людей не показываем: он считается мгновенно
    const quick = !!cfg.sim || (sides[0].auto && sides[1].auto);
    B = { quick, sim: !!cfg.sim, speed0: SPEED, title: cfg.title, sides, stacks: [], obst: new Set(), round: 0, queue: [], active: null, log: [], fx: [], hover: null, spell: null, resolve, over: false, wait: null };
    for (let i = 0; i < 2; i++) {
      const arr = B.sides[i].src.map((s, slot) => s && s.n > 0 ? { slot, u: s.u, n: s.n } : null).filter(Boolean);
      arr.forEach((s, k) => {
        const U = UNITS[s.u];
        B.stacks.push({ id: i * 10 + k, side: i, slot: s.slot, u: s.u, n: s.n, n0: s.n, hp: U.hp, x: i ? BW - 1 : 0, y: Math.round((k + 0.5) * BH / arr.length - 0.5), px: 0, py: 0, shots: U.shots || 0, ret: 1, buff: 0, defd: false, waited: false, flash: 0 });
      });
    }
    B.stacks.forEach(s => { s.px = s.x; s.py = s.y; });
    for (let k = rnd(3, 6); k > 0; k--) B.obst.add(`${rnd(2, BW - 3)},${rnd(0, BH - 1)}`);
    if (quick) SPEED = 0; else { battleUI(true); sfx('battle'); }
    battleLoop();
  });
}

const alive = s => s.n > 0;
const stackAt = (x, y) => B.stacks.find(s => alive(s) && s.x === x && s.y === y) || null;
const enemiesOf = s => B.stacks.filter(e => alive(e) && e.side !== s.side);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sSpd = s => UNITS[s.u].spd + B.sides[s.side].st.spd;
const blockedCell = (x, y) => x < 0 || y < 0 || x >= BW || y >= BH || B.obst.has(`${x},${y}`);
const canShoot = s => s.shots > 0 && !enemiesOf(s).some(e => cheb(e, s) === 1);
const humanSide = s => !B.sides[s.side].auto;

// куда отряд может дойти за ход: Map "x,y" → путь
function reach(s) {
  const res = new Map(), spd = sSpd(s), fly = UNITS[s.u].fly;
  res.set(`${s.x},${s.y}`, []);
  if (fly) {
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= spd && !blockedCell(x, y) && !stackAt(x, y)) res.set(`${x},${y}`, [{ x, y }]);
    return res;
  }
  let front = [{ x: s.x, y: s.y, p: [] }];
  for (let d = 0; d < spd; d++) {
    const nf = [];
    for (const c of front) for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy, k = `${x},${y}`;
      if (res.has(k) || blockedCell(x, y) || stackAt(x, y)) continue;
      const p = c.p.concat([{ x, y }]); res.set(k, p); nf.push({ x, y, p });
    }
    front = nf;
  }
  return res;
}

function effDef(t) {
  const sd = B.sides[t.side];
  let d = UNITS[t.u].def + sd.st.def + t.buff + (sd.fence ? 3 : 0);
  if (t.defd) d = Math.ceil(d * 1.3);
  return d;
}
function dmgRange(a, t, ranged) {
  const U = UNITS[a.u], A = U.att + B.sides[a.side].st.att, D = effDef(t);
  let m = A >= D ? Math.min(3, 1 + 0.05 * (A - D)) : Math.max(0.3, 1 - 0.025 * (D - A));
  if (U.shots && !ranged) m *= 0.5;
  if (ranged && cheb(a, t) > 6) m *= 0.5;
  return [Math.max(1, Math.floor(U.dmg[0] * a.n * m)), Math.max(1, Math.floor(U.dmg[1] * a.n * m))];
}
const pool = s => (s.n - 1) * UNITS[s.u].hp + s.hp;
function applyDmg(t, dmg) {
  const H = UNITS[t.u].hp, before = t.n;
  let p = pool(t) - dmg;
  if (p <= 0) { t.n = 0; t.hp = 0; } else { t.n = Math.ceil(p / H); t.hp = p - (t.n - 1) * H; }
  t.flash = 1;
  return before - t.n;
}
function blog(t) { B.log.unshift(t); B.log.length = Math.min(B.log.length, 6); }
const sName = s => `${UNITS[s.u].em} ${UNITS[s.u].name}`;
function floatText(s, text, col) { B.fx.push({ x: s.x, y: s.y, text, col, t: 0 }); }

async function strike(a, t, ranged) {
  const [lo, hi] = dmgRange(a, t, ranged);
  const dmg = Math.round(lo + (hi - lo) * (Math.random() + Math.random()) / 2);
  if (ranged) { a.shots--; B.fx.push({ shot: true, fx0: a.x, fy0: a.y, x: t.x, y: t.y, em: UNITS[a.u].em, t: 0 }); sfx('shoot'); await sleep(260); }
  const k = applyDmg(t, dmg); sfx(k ? 'kill' : 'hit');
  floatText(t, `−${dmg}${k ? ' 💀' + k : ''}`, '#ff5050');
  blog(`${sName(a)} ${ranged ? 'стреляют в' : 'бьют'} ${sName(t)}: ${dmg} урона${k ? `, полегло ${k}` : ''}`);
  await sleep(220);
}
async function melee(a, t) {
  await strike(a, t, false);
  if (alive(t) && t.ret > 0 && !UNITS[a.u].noRet) { t.ret--; await sleep(120); await strike(t, a, false); }
  if (alive(a) && alive(t) && UNITS[a.u].twice) { blog('…и ещё двойкой!'); await strike(a, t, false); }
}
async function walk(s, path) {
  for (const c of path) { s.x = c.x; s.y = c.y; sfx('step'); await sleep(UNITS[s.u].fly ? 140 : 75); }
}

async function battleLoop() {
  while (!B.over) {
    if (!B.queue.length) {
      B.round++;
      if (B.round > 80) { endBattle(1); return; } // патовая драка: нападавшие расходятся ни с чем
      B.stacks.forEach(s => { s.ret = 1; s.defd = false; s.waited = false; });
      B.queue = B.stacks.filter(alive).sort((a, b) => sSpd(b) - sSpd(a) || a.side - b.side);
      blog(`— Раунд ${B.round} —`);
    }
    const s = B.queue.shift();
    if (!alive(s)) continue;
    B.active = s; refreshBattleUI();
    if (B.sides[s.side].auto) { await sleep(320); await aiTurn(s); }
    else await new Promise(r => { B.wait = r; });
    B.wait = null; B.spell = null;
    const done = [0, 1].find(i => !B.stacks.some(x => x.side === i && alive(x)));
    if (done !== undefined) { await sleep(500); endBattle(1 - done); return; }
  }
}

function endBattle(winner) {
  B.over = true;
  const out = i => { const arr = [null, null, null, null, null]; B.stacks.filter(s => s.side === i && alive(s)).forEach(s => { arr[s.slot] = { u: s.u, n: s.n }; }); return arr; };
  const r = { winner, aArmy: out(0), dArmy: out(1) };
  const res = B.resolve, quick = B.quick; SPEED = B.speed0;
  if (!quick) battleUI(false);
  B = null; if (!quick) sfx(winner === 0 ? 'win' : 'lose');
  res(r);
}

// ---------- ИИ ----------
const worth = u => { const U = UNITS[u]; return U.hp * (U.att + U.def + 4) * (U.shots ? 1.4 : 1); };
function scoreHit(a, t, ranged) { const [lo, hi] = dmgRange(a, t, ranged); return Math.min((lo + hi) / 2, pool(t)) / UNITS[t.u].hp * worth(t.u); }
// ИИ и понты: выбирает самое выгодное из «Наезда», «Стрелки» и «Заряженной воды», если оно того стоит
async function aiCast(s) {
  const sd = B.sides[s.side], h = sd.hero;
  if (!sd.aiCast || !canCast(sd)) return;
  const p = sd.st.pow, en = enemiesOf(s), opts = [];
  const hurt = (t, d) => Math.min(d, pool(t)) / UNITS[t.u].hp * worth(t.u);
  if (h.mana >= 5) { const t = en.reduce((b, e) => (hurt(e, 12 + 10 * p) > hurt(b, 12 + 10 * p) ? e : b)); opts.push({ id: 'naezd', t, v: hurt(t, 12 + 10 * p) / 5 }); }
  if (h.mana >= 12 && en.length >= 3) opts.push({ id: 'strelka', t: null, v: en.reduce((a, e) => a + hurt(e, 6 + 5 * p), 0) / 12 });
  if (h.mana >= 6) for (const t of B.stacks) if (alive(t) && t.side === s.side) { const lost = t.n0 * UNITS[t.u].hp - pool(t), heal = Math.min(lost, 20 + 10 * p); if (heal >= UNITS[t.u].hp) opts.push({ id: 'voda', t, v: heal / UNITS[t.u].hp * worth(t.u) / 6 }); }
  if (!opts.length) return;
  const best = opts.reduce((a, b) => (b.v > a.v ? b : a));
  if (best.v * 5 < worth(s.u) * 0.5) return; // мелочь не стоит понтов
  await castSpell(SPELLS.find(x => x.id === best.id), best.t);
}
async function aiTurn(s) {
  if (enemiesOf(s).length) await aiCast(s);
  const en = enemiesOf(s);
  if (!en.length) return;
  if (canShoot(s)) { const t = en.reduce((b, e) => (scoreHit(s, e, true) > scoreHit(s, b, true) ? e : b)); await strike(s, t, true); return; }
  const R = reach(s);
  let best = null;
  for (const e of en) for (const [dx, dy] of DIRS) {
    const k = `${e.x + dx},${e.y + dy}`;
    if (!R.has(k)) continue;
    const sc = scoreHit(s, e, false) - R.get(k).length * 0.01;
    if (!best || sc > best.sc) best = { e, k, sc };
  }
  if (best) { await walk(s, R.get(best.k)); await melee(s, best.e); return; }
  let mv = null;
  for (const [k, p] of R) { const [x, y] = k.split(',').map(Number); const d = Math.min(...en.map(e => Math.max(Math.abs(e.x - x), Math.abs(e.y - y)))); if (!mv || d < mv.d) mv = { p, d }; }
  if (mv) await walk(s, mv.p);
}

// ---------- действия игрока ----------
async function act(fn) { if (!B || !B.wait || B.busy) return; B.busy = true; const w = B.wait; await fn(); B.busy = false; refreshBattleUI(); w(); }
function battleClickCell(cx, cy, fx, fy) {
  if (!B || !B.wait || B.busy) return;
  const s = B.active, t = stackAt(cx, cy);
  if (B.spell) { castOn(t); return; }
  if (t && t.side !== s.side) {
    if (canShoot(s)) { act(() => strike(s, t, true)); return; }
    const opt = attackCell(s, t, fx, fy);
    if (opt) act(async () => { await walk(s, opt); await melee(s, t); });
    else toast('Не дотянуться');
    return;
  }
  const R = reach(s), p = R.get(`${cx},${cy}`);
  if (p && p.length) act(() => walk(s, p));
}
// клетка для удара: из доступных соседних — ближайшая к курсору
function attackCell(s, t, fx, fy) {
  if (cheb(s, t) === 1) return [];
  const R = reach(s); let best = null;
  for (const [dx, dy] of DIRS) {
    const k = `${t.x + dx},${t.y + dy}`;
    if (!R.has(k)) continue;
    const d = Math.hypot(t.x + 0.5 + dx * 0.5 - fx, t.y + 0.5 + dy * 0.5 - fy);
    if (!best || d < best.d) best = { d, p: R.get(k) };
  }
  return best && best.p;
}
function battleWait() { act(async () => { const s = B.active; if (s.waited) { toast('Ждать можно раз за раунд'); return; } s.waited = true; B.queue.push(s); blog(`${sName(s)} ждут`); }); }
function battleDefend() { act(async () => { B.active.defd = true; blog(`${sName(B.active)} встают в оборону`); }); }
function battleAuto() { if (!B) return; const sd = B.sides[B.active.side]; sd.auto = true; toast('Авто-бой: дальше сами'); if (B.wait) { const w = B.wait; B.wait = null; aiTurn(B.active).then(() => { refreshBattleUI(); w(); }); } }
function canCast(sd) { return sd.hero && sd.castRound !== B.round; }
function chooseSpell(id) {
  const s = B.active, sd = B.sides[s.side], sp = SPELLS.find(x => x.id === id), h = sd.hero;
  if (!canCast(sd)) { toast('Понты — раз за раунд'); return; }
  if (h.mana < sp.cost) { toast('Не хватает понтов'); return; }
  if (sp.target === 'all') { castSpell(sp, null); return; }
  B.spell = sp; toast(sp.target === 'enemy' ? 'Выберите вражеский отряд' : 'Выберите свой отряд');
  refreshBattleUI();
}
function castOn(t) {
  const sp = B.spell, s = B.active;
  if (!t || (sp.target === 'enemy') !== (t.side !== s.side)) { toast('Не туда'); return; }
  castSpell(sp, t);
}
async function castSpell(sp, t) {
  const s = B.active, sd = B.sides[s.side], p = sd.st.pow;
  sd.hero.mana -= sp.cost; sd.castRound = B.round; B.spell = null; B.busy = true; sfx('spell');
  if (sp.id === 'naezd') { const d = 12 + 10 * p, k = applyDmg(t, d); floatText(t, `−${d}${k ? ' 💀' + k : ''}`, '#ff9030'); blog(`${sd.hero.name}: «Наезд» на ${sName(t)}: ${d}`); }
  if (sp.id === 'krysha') { t.buff += 6; floatText(t, '🛡️ +6', '#6cf'); blog(`${sd.hero.name} дал крышу: ${sName(t)}`); }
  if (sp.id === 'voda') { const H = UNITS[t.u].hp, np = Math.min(t.n0 * H, pool(t) + 20 + 10 * p); t.n = Math.ceil(np / H); t.hp = np - (t.n - 1) * H; floatText(t, '💧 лечим', '#6f6'); blog(`${sd.hero.name} зарядил воду для ${sName(t)}`); }
  if (sp.id === 'strelka') { const d = 6 + 5 * p; for (const e of enemiesOf(s)) { const k = applyDmg(e, d); floatText(e, `−${d}${k ? ' 💀' + k : ''}`, '#ff0'); } blog(`${sd.hero.name} забил стрелку: всем врагам по ${d}`); }
  await sleep(450); B.busy = false;
  const done = [0, 1].find(i => !B.stacks.some(x => x.side === i && alive(x)));
  if (done !== undefined && B.wait) { const w = B.wait; B.wait = null; w(); }
  refreshBattleUI();
}

// подсказка при наведении: сколько урона и сколько ляжет
function hoverInfo(cx, cy) {
  if (!B || !B.active) return '';
  const s = B.active, t = stackAt(cx, cy);
  if (!t) return '';
  const U = UNITS[t.u];
  let txt = `${U.em} ${U.name} ×${t.n} · ⚔️${U.att + B.sides[t.side].st.att} 🛡️${effDef(t)} · ❤️${t.hp}/${U.hp} · 💨${sSpd(t)}${U.shots ? ` · 🎯${t.shots}` : ''}${U.note ? ' · ' + U.note : ''}`;
  if (t.side !== s.side && humanSide(s)) {
    const ranged = canShoot(s), [lo, hi] = dmgRange(s, t, ranged), H = U.hp;
    const kill = d => Math.min(t.n, d >= pool(t) ? t.n : t.n - Math.ceil((pool(t) - d) / H));
    txt += ` — ${ranged ? '🎯 выстрел' : '👊 удар'}: ${lo}–${hi} урона, ляжет ${kill(lo)}–${kill(hi)}`;
  }
  return txt;
}
