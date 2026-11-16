'use strict';
// Тактический бой: поле 11×8, отряды ходят по скорости, стрелки стреляют, ответка раз за раунд.

const BW = 11, BH = 8;
let B = null;
// Поле боя зависит от места драки: свой пол и свой хлам, за которым можно укрыться от выстрелов
const ARENAS = {
  street: { name: 'улица', floor: ['#4a4a52', '#45454d'], deco: 'road', obst: ['champ', 'o_barrier', 'o_bin', 'champ'] },
  yard: { name: 'двор', floor: ['#6d6a5c', '#676456'], deco: 'dirt', obst: ['o_bin', 'o_garage', 'o_bench', 'o_crate'] },
  park: { name: 'парк', floor: ['#3f7a36', '#3a7331'], deco: 'grass', obst: ['tree1', 'tree2', 'o_bench', 'tree1'] },
  market: { name: 'рынок', floor: ['#7a6a52', '#74644c'], deco: 'planks', obst: ['stall', 'o_bags', 'o_crate', 'o_bags'] },
  gym: { name: 'качалка', floor: ['#2f4a6b', '#2b4564'], deco: 'mats', obst: ['o_rack', 'b_att', 'o_crate', 'o_rack'] },
  basement: { name: 'подвал', floor: ['#3d3944', '#38343f'], deco: 'concrete', obst: ['amp', 'o_pipe', 'o_crate', 'amp'] },
  kremlin: { name: 'Красная площадь', floor: ['#5c5762', '#56515c'], deco: 'cobble', obst: ['tree1', 'o_barrier', 'tree1', 'o_barrier'] },
};
// town — город, который штурмуют; boss — кремлёвский полк
function arenaAt(x, y, town, boss) {
  if (boss) return 'kremlin';
  if (town) return { kach: 'gym', rynok: 'market', neform: 'basement' }[town.fac] || 'yard';
  const t = tileAt(x, y);
  return t === T.ROAD ? 'street' : t === T.PARK ? 'park' : 'yard';
}
const obstSprite = k => { if (B.barrels.has(k)) return 'o_barrel'; if (B.fences.has(k)) return 'o_fence'; const [x, y] = k.split(',').map(Number), list = ARENAS[B.arena].obst; return list[(x * 3 + y) % list.length]; };
// цель за укрытием, если между ней и стрелком вплотную стоит препятствие (бочка не в счёт): выстрелы вдвое слабее
function covered(a, t) { const k = `${t.x + Math.sign(a.x - t.x)},${t.y + Math.sign(a.y - t.y)}`; return B.obst.has(k) && !B.barrels.has(k); }
// частицы: искры от удара, дым, звёздочки фарта. x, y — в клетках
function burst(x, y, n, cols, o) {
  if (!B || B.quick) return;
  o = o || {};
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (o.v || 0.05) * (0.4 + Math.random()); B.parts.push({ x: x + 0.5 + (Math.random() - 0.5) * 0.3, y: y + 0.5 + (Math.random() - 0.5) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g == null ? 0.004 : o.g, life: 1, d: 0.02 + Math.random() * 0.03, col: cols[i % cols.length] }); }
  if (B.parts.length > 300) B.parts.splice(0, B.parts.length - 300);
}

function runBattle(cfg) {
  return new Promise(resolve => {
    // remote — игрок за другим компьютером и в сети: бой покажется у него, своими отрядами он командует сам (живая защита).
    // За сторону ходит ИИ, если это местные, бот или прикидка боя; понтами ИИ пользуется только у ботов не ниже обычного
    const side = (c, i) => ({ i, hero: c.hero, owner: c.owner, fence: !!c.fence, st: c.hero ? heroStats(c.hero) : { att: 0, def: 0, pow: 0, spd: 0 }, castRound: 0, remote: !cfg.sim && netRemote(c.owner) && netSeatOnline(c.owner), auto: c.owner < 0 || !!cfg.sim || isBot(c.owner) || (netRemote(c.owner) ? !netSeatOnline(c.owner) : !!window.AUTOBATTLE), aiCast: !!c.hero && (cfg.sim ? true : isBot(c.owner) && DIFF[G.players[c.owner].diff].spells), src: c.army });
    const sides = [side(cfg.a, 0), side(cfg.d, 1)];
    // бой без людей не показываем: он считается мгновенно
    const quick = !!cfg.sim || (sides[0].auto && sides[1].auto);
    B = { quick, arena: ARENAS[cfg.arena] ? cfg.arena : 'yard', parts: [], bg: null, need: -1, cmdWait: null, sim: !!cfg.sim, speed0: SPEED, title: cfg.title, sides, stacks: [], obst: new Set(), round: 0, queue: [], active: null, log: [], fx: [], hover: null, spell: null, resolve, over: false, wait: null };
    for (let i = 0; i < 2; i++) {
      const arr = B.sides[i].src.map((s, slot) => s && s.n > 0 ? { slot, u: s.u, n: s.n } : null).filter(Boolean);
      arr.forEach((s, k) => {
        const U = UNITS[s.u];
        B.stacks.push({ id: i * 10 + k, side: i, slot: s.slot, u: s.u, n: s.n, n0: s.n, moved: 0, curse: 0, slow: 0, stun: false, extra: false, kur: 0, lunge: null, hp: U.hp, x: i ? BW - 1 : 0, y: Math.round((k + 0.5) * BH / arr.length - 0.5), px: 0, py: 0, shots: U.shots || 0, ret: 1, buff: 0, defd: false, waited: false, flash: 0 });
      });
    }
    B.stacks.forEach(s => { s.px = s.x; s.py = s.y; });
    // при штурме города с забором поперёк поля стоит забор с воротами посередине: пешим — только через ворота
    B.barrels = new Set(); B.fences = new Set(); B.shake = 0;
    if (cfg.d.fence) for (let y = 0; y < BH; y++) if (y !== 3 && y !== 4) { B.obst.add(`${BW - 3},${y}`); B.fences.add(`${BW - 3},${y}`); }
    for (let k = rnd(5, 8); k > 0; k--) B.obst.add(`${rnd(2, BW - 4)},${rnd(0, BH - 1)}`);
    // одна-две бочки с бензином: выстрел по бочке — взрыв по всем соседним клеткам
    { const loose = [...B.obst].filter(k => !B.fences.has(k)); for (let k = rnd(1, 2); k > 0 && loose.length; k--) B.barrels.add(loose.splice(rnd(0, loose.length - 1), 1)[0]); }
    if (quick) SPEED = 0; else { battleUI(true); sfx('battle'); }
    battleLoop();
  });
}

const alive = s => s.n > 0;
const stackAt = (x, y) => B.stacks.find(s => alive(s) && s.x === x && s.y === y) || null;
const enemiesOf = s => B.stacks.filter(e => alive(e) && e.side !== s.side);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sSpd = s => Math.max(1, UNITS[s.u].spd + B.sides[s.side].st.spd - (s.slow || 0));
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
// moved — сколько клеток отряд пройдёт перед ударом (для прикидки разбега); без него берётся уже пройденное
function dmgRange(a, t, ranged, moved) {
  const U = UNITS[a.u], D = effDef(t);
  let A = U.att + B.sides[a.side].st.att - (a.curse || 0);
  if (!ranged && UNITS[t.u].stink) A -= 3;
  let m = A >= D ? Math.min(3, 1 + 0.05 * (A - D)) : Math.max(0.3, 1 - 0.025 * (D - A));
  if (U.shots && !ranged) m *= 0.5;
  if (ranged && cheb(a, t) > 6) m *= 0.5;
  if (ranged && covered(a, t)) m *= 0.5;
  if (U.swarm) m *= 1 + 0.15 * Math.min(3, B.stacks.filter(e => alive(e) && e !== a && e.side === a.side && cheb(e, t) <= 1).length);
  if (U.finish && !ranged && t.ret <= 0 && !UNITS[t.u].guard) m *= 1.4;
  if (U.charge && !ranged) m *= 1 + 0.08 * Math.min(5, moved == null ? a.moved : moved);
  if (U.rage) m *= 1 + 0.6 * (1 - a.n / a.n0);
  return [Math.max(1, Math.floor(U.dmg[0] * a.n * m)), Math.max(1, Math.floor(U.dmg[1] * a.n * m))];
}
const pool = s => (s.n - 1) * UNITS[s.u].hp + s.hp;
function applyDmg(t, dmg) {
  const H = UNITS[t.u].hp, before = t.n;
  let p = pool(t) - dmg;
  if (p <= 0) { t.n = 0; t.hp = 0; t.dead = 1; burst(t.x, t.y, 12, ['#c8c8d0', '#8a8a96', '#4a4a55'], { v: 0.06, g: -0.001 }); } else { t.n = Math.ceil(p / H); t.hp = p - (t.n - 1) * H; }
  t.flash = 1;
  return before - t.n;
}
function blog(t) { B.log.unshift(t); B.log.length = Math.min(B.log.length, 6); }
const sName = s => UNITS[s.u].name;
function floatText(s, text, col, delay) { B.fx.push({ x: s.x, y: s.y, text, col, t: -(delay || 0) }); }

// main — это собственный удар отряда в его ход (а не ответка): только он даёт кураж и срабатывание особенностей
async function strike(a, t, ranged, main) {
  const U = UNITS[a.u], sd = B.sides[a.side];
  if (ranged) {
    a.shots--; a.atk = 1; B.fx.push({ shot: true, fx0: a.x, fy0: a.y, x: t.x, y: t.y, t: 0 }); sfx('shoot'); await sleep(260);
    if (UNITS[t.u].dodge && Math.random() < 0.3) { floatText(t, 'мимо!', '#9cf'); blog(`${sName(t)} увернулись от выстрела`); await sleep(200); return; }
  } else a.lunge = { dx: Math.sign(t.x - a.x), dy: Math.sign(t.y - a.y), t: 0 };
  const [lo, hi] = dmgRange(a, t, ranged);
  let dmg = Math.round(lo + (hi - lo) * (Math.random() + Math.random()) / 2);
  const crit = Math.random() < Math.min(0.25, 0.07 + 0.02 * sd.st.pow); // фарт: чем больше понтов у героя, тем чаще
  if (crit) dmg = Math.round(dmg * 1.5);
  const k = applyDmg(t, dmg); sfx(k ? 'kill' : 'hit');
  burst(t.x, t.y, crit ? 14 : 6, crit ? ['#ffd21a', '#fff', '#f08a2c'] : ['#ff5050', '#c8372d', '#f08a2c'], { v: crit ? 0.09 : 0.06 });
  floatText(t, `${crit ? 'ФАРТ! ' : ''}−${dmg}${k ? ' · легло ' + k : ''}`, crit ? '#ffd21a' : '#ff5050');
  if (crit || !alive(t)) B.shake = Math.max(B.shake, crit ? 7 : 5);
  blog(`${sName(a)} ${ranged ? 'стреляют в' : 'бьют'} ${sName(t)}: ${dmg} урона${crit ? ' (фарт!)' : ''}${k ? `, полегло ${k}` : ''}`);
  if (main && alive(t)) {
    if (U.curse && !t.curse) { t.curse = 3; burst(t.x, t.y, 8, ['#b97cf5', '#5b2d91'], { v: 0.03, up: 0.02, g: 0 }); floatText(t, 'сглаз: −3 атаки', '#d9a8ff', 0.35); }
    if (U.slow && !t.slow) { t.slow = 2; floatText(t, 'замедлены', '#9cf', 0.35); }
    if (U.stun && Math.random() < 0.25) { t.stun = true; floatText(t, 'проверка!', '#ffcc66', 0.35); }
  }
  const also = (e, part) => { const d = Math.max(1, Math.round(dmg * part)), kk = applyDmg(e, d); floatText(e, `−${d}${kk ? ' · легло ' + kk : ''}`, '#ff9030'); };
  if (main && U.splash) for (const e of enemiesOf(a)) if (e !== t && cheb(e, t) <= 1) also(e, 0.4);
  if (main && U.pierce && !ranged) { const e = stackAt(t.x + Math.sign(t.x - a.x), t.y + Math.sign(t.y - a.y)); if (e && e.side !== a.side) also(e, 0.5); }
  // кураж: положил отряд целиком — ходи ещё раз (раз за раунд)
  if (main && !alive(t) && a.kur !== B.round) { a.kur = B.round; a.extra = true; floatText(a, 'КУРАЖ!', '#7dff7d'); blog(`${sName(a)} на кураже — ходят ещё раз`); }
  await sleep(220);
}
async function melee(a, t) {
  await strike(a, t, false, true);
  if (alive(t) && alive(a) && (t.ret > 0 || UNITS[t.u].guard) && !UNITS[a.u].noRet) { if (!UNITS[t.u].guard) t.ret--; await sleep(120); await strike(t, a, false, false); }
  if (alive(a) && alive(t) && UNITS[a.u].twice) { blog('…и ещё двойкой!'); await strike(a, t, false, true); }
}
async function walk(s, path) {
  for (const c of path) { s.x = c.x; s.y = c.y; s.moved++; sfx('step'); await sleep(UNITS[s.u].fly ? 140 : 75); }
}
// ---------- бочки ----------
const isBarrel = (x, y) => B.barrels.has(`${x},${y}`);
const barrelDmg = () => 20 + 12 * weekNo();
async function explode(x, y) {
  const key = `${x},${y}`; if (!B.barrels.has(key)) return;
  B.barrels.delete(key); B.obst.delete(key); sfx('kill'); B.shake = 12;
  burst(x, y, 34, ['#ffb020', '#ffd21a', '#f08a2c', '#4a4a55'], { v: 0.16, g: 0.002 });
  B.fx.push({ x, y, text: 'БАБАХ!', col: '#ffb020', t: 0 }); blog('Бочка с бензином рванула!');
  const d = barrelDmg();
  for (const e of B.stacks) if (alive(e) && Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= 1) { const k = applyDmg(e, d); floatText(e, `−${d}${k ? ' · легло ' + k : ''}`, '#ffb020', 0.2); }
  await sleep(380);
  for (const [dx, dy] of DIRS) if (isBarrel(x + dx, y + dy)) await explode(x + dx, y + dy); // цепная реакция
}
async function shootBarrel(s, x, y) { s.shots--; s.atk = 1; B.fx.push({ shot: true, fx0: s.x, fy0: s.y, x, y, t: 0 }); sfx('shoot'); await sleep(260); await explode(x, y); }
// экстрасенс заряжает своих: лечит самый побитый отряд и поднимает павших
function healAlly(s) {
  const lost = e => e.n0 * UNITS[e.u].hp - pool(e);
  const t = B.stacks.filter(e => alive(e) && e.side === s.side && e !== s && lost(e) > 0).sort((a, b) => lost(b) - lost(a))[0];
  if (!t) return;
  const H = UNITS[t.u].hp, np = pool(t) + Math.min(lost(t), 10 + 5 * s.n);
  t.n = Math.ceil(np / H); t.hp = np - (t.n - 1) * H; floatText(t, 'зарядили', '#7dff7d'); burst(t.x, t.y, 8, ['#7dff7d', '#4cc552'], { v: 0.02, up: 0.03, g: 0 }); blog(`${sName(s)} заряжают ${sName(t)}`);
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
    if (s.stun) { s.stun = false; B.active = s; refreshBattleUI(); floatText(s, 'пропуск хода', '#ffcc66'); blog(`${sName(s)} разбираются с проверкой и пропускают ход`); await sleep(520); continue; }
    B.active = s; s.moved = 0;
    if (UNITS[s.u].heal) healAlly(s);
    refreshBattleUI();
    if (B.sides[s.side].auto) { await sleep(320); await aiTurn(s); }
    else if (B.sides[s.side].remote) await remoteTurn(s);
    else { netBattlePush(); await new Promise(r => { B.wait = r; }); }
    B.wait = null; B.spell = null; s.slow = 0;
    const done = [0, 1].find(i => !B.stacks.some(x => x.side === i && alive(x)));
    if (done !== undefined) { await sleep(500); endBattle(1 - done); return; }
    if (alive(s) && s.extra) { s.extra = false; B.queue.unshift(s); }
    netBattlePush();
  }
}
// Ход отряда игрока за другим компьютером: ждём его команду. Молчит 45 секунд — дальше за него ходит ИИ.
async function remoteTurn(s) {
  const sd = B.sides[s.side];
  for (let k = 0; k < 4; k++) {
    B.need = s.side; refreshBattleUI(); netBattlePush();
    let timer = null;
    const cmd = await new Promise(res => { B.cmdWait = res; timer = setTimeout(() => res(null), 45000); });
    clearTimeout(timer); if (B) { B.cmdWait = null; B.need = -1; }
    if (!cmd) { sd.remote = false; sd.auto = true; blog('Соперник молчит — за него ходит ИИ'); break; }
    const r = await remoteExec(s, cmd);
    if (r === 'again') continue; // понты не тратят ход отряда
    if (r) return;
    break;
  }
  if (alive(s) && enemiesOf(s).length) await aiTurn(s);
}
// выполнить команду защитника; всё проверяем заново — клиент мог прислать что угодно
async function remoteExec(s, c) {
  const sd = B.sides[s.side], t = c.t == null ? null : B.stacks.find(x => x.id === c.t && alive(x));
  if (c.k === 'auto') { sd.remote = false; sd.auto = true; return false; }
  if (c.k === 'wait') { if (s.waited) return false; s.waited = true; B.queue.push(s); blog(`${sName(s)} ждут`); return true; }
  if (c.k === 'defend') { s.defd = true; blog(`${sName(s)} встают в оборону`); return true; }
  if (c.k === 'move') { const p = reach(s).get(`${c.x},${c.y}`); if (!p || !p.length) return false; await walk(s, p); return true; }
  if (c.k === 'shoot') { if (!t || t.side === s.side || !canShoot(s)) return false; await strike(s, t, true, true); return true; }
  if (c.k === 'barrel') { if (!canShoot(s) || !isBarrel(c.x, c.y)) return false; await shootBarrel(s, c.x, c.y); return true; }
  if (c.k === 'hit') {
    if (!t || t.side === s.side) return false;
    if (cheb(s, t) > 1) { const p = c.at && reach(s).get(`${c.at.x},${c.at.y}`); if (!p || Math.max(Math.abs(c.at.x - t.x), Math.abs(c.at.y - t.y)) !== 1) return false; await walk(s, p); }
    await melee(s, t); return true;
  }
  if (c.k === 'spell') {
    const sp = SPELLS.find(x => x.id === c.id);
    if (!sp || !sd.hero || !canCast(sd) || sd.hero.mana < sp.cost) return false;
    if (sp.target !== 'all' && (!t || (sp.target === 'enemy') !== (t.side !== s.side))) return false;
    await castSpell(sp, sp.target === 'all' ? null : t);
    return alive(s) && enemiesOf(s).length ? 'again' : true;
  }
  return false;
}

function endBattle(winner) {
  B.over = true;
  const out = i => { const arr = [null, null, null, null, null]; B.stacks.filter(s => s.side === i && alive(s)).forEach(s => { arr[s.slot] = { u: s.u, n: s.n }; }); return arr; };
  const r = { winner, aArmy: out(0), dArmy: out(1) };
  const res = B.resolve, quick = B.quick; SPEED = B.speed0;
  if (!quick) { battleUI(false); netBattlePush(true); }
  B = null; if (!quick) sfx(winner === 0 ? 'win' : 'lose');
  res(r);
}

// ---------- ИИ ----------
const worth = u => { const U = UNITS[u]; return U.hp * (U.att + U.def + 4) * (U.shots ? 1.4 : 1); };
function scoreHit(a, t, ranged, moved) { const [lo, hi] = dmgRange(a, t, ranged, moved), d = (lo + hi) / 2; return Math.min(d, pool(t)) / UNITS[t.u].hp * worth(t.u) * (d >= pool(t) ? 1.3 : 1); } // добить отряд ценнее: будет кураж
// выгода от взрыва бочки: чужим больно — плюс, своим — минус
function barrelGain(s, x, y) { let g = 0; for (const e of B.stacks) if (alive(e) && Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= 1) g += (e.side === s.side ? -1.5 : 1) * Math.min(barrelDmg(), pool(e)) / UNITS[e.u].hp * worth(e.u); return g; }
// сколько шагов от клетки до места рядом с врагом в обход препятствий (чужие отряды не в счёт — они сдвинутся)
function distField(side) {
  const d = new Int16Array(BW * BH).fill(999), q = [];
  for (const e of B.stacks) if (alive(e) && e.side !== side) for (const [dx, dy] of DIRS) { const x = e.x + dx, y = e.y + dy; if (!blockedCell(x, y) && d[y * BW + x] === 999) { d[y * BW + x] = 0; q.push([x, y]); } }
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!blockedCell(nx, ny) && d[ny * BW + nx] === 999) { d[ny * BW + nx] = d[y * BW + x] + 1; q.push([nx, ny]); } } }
  return d;
}
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
  if (canShoot(s)) {
    const t = en.reduce((b, e) => (scoreHit(s, e, true) > scoreHit(s, b, true) ? e : b));
    let bar = null; for (const k of B.barrels) { const [x, y] = k.split(',').map(Number), g = barrelGain(s, x, y); if (g > 0 && (!bar || g > bar.g)) bar = { x, y, g }; }
    if (bar && bar.g > scoreHit(s, t, true)) await shootBarrel(s, bar.x, bar.y); else await strike(s, t, true, true);
    return;
  }
  const R = reach(s);
  let best = null;
  for (const e of en) for (const [dx, dy] of DIRS) {
    const k = `${e.x + dx},${e.y + dy}`;
    if (!R.has(k)) continue;
    const sc = scoreHit(s, e, false, R.get(k).length) - R.get(k).length * 0.01;
    if (!best || sc > best.sc) best = { e, k, sc };
  }
  if (best) { await walk(s, R.get(best.k)); await melee(s, best.e); return; }
  // не дотянулись — идём туда, откуда до врага ближе всего по проходимым клеткам (в обход забора и хлама)
  const F = distField(s.side); let mv = null;
  for (const [k, p] of R) { const [x, y] = k.split(',').map(Number), d = F[y * BW + x] + p.length * 0.01; if (!mv || d < mv.d) mv = { p, d }; }
  if (mv && mv.p.length) await walk(s, mv.p);
}

// ---------- действия игрока ----------
async function act(fn) { if (!B || !B.wait || B.busy) return; B.busy = true; const w = B.wait; await fn(); B.busy = false; refreshBattleUI(); w(); }
function battleClickCell(cx, cy, fx, fy) {
  if (!B || !B.wait || B.busy) return;
  const s = B.active, t = stackAt(cx, cy);
  if (B.mirror) { // это показ чужого боя: мы — защитник, наши клики уходят командами тому, кто считает бой
    if (B.spell) { if (!t || (B.spell.target === 'enemy') !== (t.side !== s.side)) { toast('Не туда'); return; } netCmd({ k: 'spell', id: B.spell.id, t: t.id }); return; }
    if (!t && isBarrel(cx, cy)) { if (canShoot(s)) netCmd({ k: 'barrel', x: cx, y: cy }); else toast('Бочку можно только расстрелять издалека'); return; }
    if (t && t.side !== s.side) {
      if (canShoot(s)) { netCmd({ k: 'shoot', t: t.id }); return; }
      const opt = attackCell(s, t, fx, fy);
      if (opt) netCmd({ k: 'hit', t: t.id, at: opt.length ? opt[opt.length - 1] : null }); else toast('Не дотянуться');
      return;
    }
    const p = reach(s).get(`${cx},${cy}`); if (p && p.length) netCmd({ k: 'move', x: cx, y: cy });
    return;
  }
  if (B.spell) { castOn(t); return; }
  if (!t && isBarrel(cx, cy)) { if (canShoot(s)) act(() => shootBarrel(s, cx, cy)); else toast('Бочку можно только расстрелять издалека'); return; }
  if (t && t.side !== s.side) {
    if (canShoot(s)) { act(() => strike(s, t, true, true)); return; }
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
function battleWait() { if (B && B.mirror) { if (B.active && B.active.waited) toast('Ждать можно раз за раунд'); else netCmd({ k: 'wait' }); return; } act(async () => { const s = B.active; if (s.waited) { toast('Ждать можно раз за раунд'); return; } s.waited = true; B.queue.push(s); blog(`${sName(s)} ждут`); }); }
function battleDefend() { if (B && B.mirror) { netCmd({ k: 'defend' }); return; } act(async () => { B.active.defd = true; blog(`${sName(B.active)} встают в оборону`); }); }
function battleAuto() { if (!B) return; if (B.mirror) { netCmd({ k: 'auto' }); return; } const sd = B.sides[B.active.side]; sd.auto = true; toast('Авто-бой: дальше сами'); if (B.wait) { const w = B.wait; B.wait = null; aiTurn(B.active).then(() => { refreshBattleUI(); w(); }); } }
function canCast(sd) { return sd.hero && sd.castRound !== B.round; }
function chooseSpell(id) {
  const s = B.active, sd = B.sides[s.side], sp = SPELLS.find(x => x.id === id), h = sd.hero;
  if (!canCast(sd)) { toast('Понты — раз за раунд'); return; }
  if (h.mana < sp.cost) { toast('Не хватает понтов'); return; }
  if (sp.target === 'all') { if (B.mirror) netCmd({ k: 'spell', id: sp.id }); else castSpell(sp, null); return; }
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
  if (t) burst(t.x, t.y, 10, sp.id === 'naezd' ? ['#ff9030', '#c8372d'] : sp.id === 'krysha' ? ['#6cf', '#2f7fc4'] : ['#7dff7d', '#8fdcf5'], { v: 0.05, up: sp.id === 'naezd' ? 0 : 0.03, g: sp.id === 'naezd' ? 0.004 : 0 });
  else for (const e of enemiesOf(s)) burst(e.x, e.y, 6, ['#ffd21a', '#fff'], { v: 0.07 });
  if (sp.id === 'naezd') { const d = 12 + 10 * p, k = applyDmg(t, d); floatText(t, `−${d}${k ? ' · легло ' + k : ''}`, '#ff9030'); blog(`${sd.hero.name}: «Наезд» на ${sName(t)}: ${d}`); }
  if (sp.id === 'krysha') { t.buff += 6; floatText(t, 'крыша +6', '#6cf'); blog(`${sd.hero.name} дал крышу: ${sName(t)}`); }
  if (sp.id === 'voda') { const H = UNITS[t.u].hp, np = Math.min(t.n0 * H, pool(t) + 20 + 10 * p); t.n = Math.ceil(np / H); t.hp = np - (t.n - 1) * H; floatText(t, 'подлечили', '#6f6'); blog(`${sd.hero.name} зарядил воду для ${sName(t)}`); }
  if (sp.id === 'strelka') { const d = 6 + 5 * p; for (const e of enemiesOf(s)) { const k = applyDmg(e, d); floatText(e, `−${d}${k ? ' · легло ' + k : ''}`, '#ff0'); } blog(`${sd.hero.name} забил стрелку: всем врагам по ${d}`); }
  await sleep(450); B.busy = false;
  const done = [0, 1].find(i => !B.stacks.some(x => x.side === i && alive(x)));
  if (done !== undefined && B.wait) { const w = B.wait; B.wait = null; w(); }
  refreshBattleUI();
}

// подсказка при наведении: сколько урона и сколько ляжет
function hoverInfo(cx, cy) {
  if (!B || !B.active) return '';
  const s = B.active, t = stackAt(cx, cy);
  if (!t && isBarrel(cx, cy)) return `Бочка с бензином: выстрел по ней — взрыв, ${barrelDmg()} урона всем на соседних клетках, своим тоже`;
  if (!t && B.fences.has(`${cx},${cy}`)) return 'Забор с колючкой: пешком — только через ворота посередине';
  if (!t) return '';
  const U = UNITS[t.u];
  let txt = `<b>${U.name} ×${t.n}</b> · ${ico('i_att', 16)}${U.att + B.sides[t.side].st.att - (t.curse || 0)} ${ico('i_def', 16)}${effDef(t)} · ${ico('i_hp', 16)}${t.hp}/${U.hp} · ${ico('i_spd', 16)}${sSpd(t)}${U.shots ? ` · ${ico('i_shot', 16)}${t.shots}` : ''}${U.note ? ' · <i>' + U.note + '</i>' : ''}`;
  if (t.side !== s.side && humanSide(s)) {
    const ranged = canShoot(s), ap = ranged ? null : attackCell(s, t, cx + 0.5, cy + 0.5), [lo, hi] = dmgRange(s, t, ranged, ap ? ap.length : 0), H = U.hp;
    const kill = d => Math.min(t.n, d >= pool(t) ? t.n : t.n - Math.ceil((pool(t) - d) / H));
    txt += `<br>${ranged ? 'выстрел' : 'удар'}: <b>${lo}–${hi}</b> урона, ляжет ${kill(lo)}–${kill(hi)}${ranged && covered(s, t) ? ' · цель за укрытием, урон вдвое меньше' : ''}`;
  }
  return txt;
}
