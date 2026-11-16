'use strict';
// Бот на карте: строит, нанимает, водит героев. Играет по тем же правилам и видит только то, что открыл сам.
// Отличия уровней — в таблице DIFF (js/data.js). Этот же код гоняет партии в автотесте (tests/bot.js).

const BUILD_ORDER = ['dw2', 'adm1', 'gym', 'dw3', 'up1', 'market', 'up2', 'dw4', 'adm2', 'fence', 'up3', 'bank', 'club', 'garage', 'dw5', 'up4', 'up5'];
const AI = { sims: 0 };

// что бот отвечает на окна игры вместо человека
function botAnswer(pid, title, buttons) {
  if (title.includes('Облава') && buttons.length > 1) { const c = +((buttons[1].match(/\d+/) || [0])[0]); return G.players[pid].res.gold >= c + 3000 ? 1 : 0; } // откупиться, если не последнее
  if (title.includes('Петровка')) return G.players[pid].res.gold >= 4000 ? 0 : 1;
  if (title.includes('уровень')) { const r = Math.random(); return r < 0.45 ? 0 : r < 0.8 ? 1 : 2; }
  if (title.includes('Общак') || buttons[0].startsWith('Забрать')) return G.players[pid].res.gold < 4000 ? 0 : 1;
  return 0;
}

// ---------- прикидка боя ----------
// Проигрывает бой на копиях армий и героев (ничего не меняя в партии) и говорит, чем он кончится.
async function simBattle(a, d) {
  const cl = s => ({ army: s.army.map(x => x && { ...x }), hero: s.hero ? { ...s.hero, arts: s.hero.arts.slice() } : null, owner: s.owner, fence: !!s.fence });
  const before = armyValue(a.army);
  AI.sims++;
  const r = await runBattle({ a: cl(a), d: cl(d), title: 'прикидка', sim: true });
  return { win: r.winner === 0, keep: before ? armyValue(r.aArmy) / before : 0, army: r.aArmy };
}
// Стоит ли герою h лезть в цепочку драк defs = [{army, hero, fence}]: сначала «на глаз», в спорных случаях — прикидкой
async function worthFight(h, defs, D) {
  // чем дольше тянется партия, тем больше потерь бот готов терпеть — иначе равные бригады стоят друг против друга вечно
  const need = D.keep * clamp(1 - (G.day - 30) / 80, 0.15, 1), edge = 1 + (D.edge - 1) * clamp(1 - (G.day - 30) / 80, 0.2, 1);
  let army = h.army, keep = 1;
  for (const d of defs) {
    const mine = armyValue(army), theirs = armyValue(d.army) * (d.hero ? 1.15 : 1) * (d.fence ? 1.15 : 1);
    if (!theirs) continue;
    const ratio = mine / theirs;
    if (ratio >= edge * 2.5) continue;                   // задавим не глядя
    if (!D.sim) { if (ratio < edge) return false; continue; }
    if (ratio < 0.6) return false;                        // даже не пробуем
    const r = await simBattle({ army, hero: h, owner: h.owner }, { army: d.army, hero: d.hero, owner: d.hero ? d.hero.owner : -1, fence: d.fence });
    if (!r.win) return false;
    keep *= r.keep; army = r.army;
    if (keep < need) return false;
  }
  return true;
}

// ---------- город ----------
function aiTown(p, D) {
  for (const t of myTowns(p.id)) {
    // на рынке докупаем то, чего не хватает до следующей стройки
    const next = BUILD_ORDER.map(id => BLD[id]).find(b => !t.built[b.id] && [].concat(b.req || []).every(r => t.built[r]));
    if (next && t.built.market && t.builtDay !== G.day) for (const r of ['fuel', 'brick']) {
      let guard = 20;
      while (guard-- > 0 && (p.res[r] || 0) < (next.cost[r] || 0) && p.res.gold >= (next.cost.gold || 0) + tradeBuy()) trade(p.id, r, true);
    }
    for (const id of BUILD_ORDER) if (buildState(t, BLD[id]) === 'ok') { build(t, id); break; }
    if (t.built.market && G.def) { // слухи о дефолте: лишнее бабло — в товар; после дефолта товар — обратно в бабло, когда казна пуста
      let guard = 40;
      if (!G.def.done && weekNo() >= G.def.week - 1) while (guard-- > 0 && p.res.gold > 3000) trade(p.id, guard % 2 ? 'fuel' : 'brick', true);
      if (G.def.done) for (const r of ['fuel', 'brick']) while (guard-- > 0 && p.res.gold < 1500 && p.res[r] > 8) trade(p.id, r, false);
    }
    if (t.built.adm1 && (p.heat || 0) >= HEAT_RAID - 5 && p.res.gold >= bribeCost(p) + 2500) bribe(p.id); // не доводить до облавы
    const h = heroAt(t.x, t.y), own = h && h.owner === p.id ? h : null;
    for (const u of FACTIONS[t.fac].units.slice().reverse()) { const n = maxRecruit(t, u); if (n > 0) recruit(t, u, n, own); }
    if (p.res.gold > 2000) upgradeAll(t, own);
    if (own) aiPickup(own, t);
    if (!heroAt(t.x, t.y)) { const j = myJailed(p.id).sort((a, b) => b.hero.lvl - a.hero.lvl)[0]; if (j && p.res.gold >= ransomOf(j) + 2000) ransom(t, j); } // прокачанного героя выгоднее вернуть, чем нанимать нового
    if (!heroAt(t.x, t.y) && myHeroes(p.id).length < D.heroes && p.res.gold >= HERO_COST + 3000) hireHero(t);
    if (!heroAt(t.x, t.y) && !myHeroes(p.id).length && p.res.gold >= HERO_COST) hireHero(t); // без героя бригада не живёт
  }
}

// Герой в своём городе забирает гарнизон. Если места нет — меняет свой самый слабый отряд на более сильный из гарнизона.
function aiPickup(h, t) {
  const val = s => (s ? s.n * UNITS[s.u].hp * (1 + UNITS[s.u].att / 10) : 0);
  for (let guard = 0; guard < 12; guard++) {
    let moved = false;
    const order = t.garrison.map((s, i) => [val(s), i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
    for (const [v, i] of order) {
      const s = t.garrison[i];
      if (addUnits(h.army, s.u, s.n)) { t.garrison[i] = null; moved = true; continue; }
      const weak = h.army.reduce((b, x, k) => (x && (b < 0 || val(x) < val(h.army[b])) ? k : b), -1);
      if (weak >= 0 && val(h.army[weak]) < v) { const tmp = h.army[weak]; h.army[weak] = s; t.garrison[i] = tmp; moved = true; break; }
    }
    if (!moved) break;
  }
}
// сколько силы герой реально унесёт из города: то, что сольётся с его отрядами или встанет на свободное место
function aiGain(h, t) {
  const have = new Set(h.army.filter(Boolean).map(s => s.u)); let free = h.army.filter(s => !s).length, v = 0;
  const all = t.garrison.filter(Boolean).map(s => ({ u: s.u, n: s.n }));
  for (const u of FACTIONS[t.fac].units) { const n = maxRecruit(t, u); if (n > 0) all.push({ u, n }); }
  for (const s of all) { if (!have.has(s.u)) { if (free <= 0) continue; free--; have.add(s.u); } v += s.n * UNITS[s.u].hp * (1 + UNITS[s.u].att / 10); }
  return v;
}

// ---------- цели героя ----------
function townStock(t) { // сколько силы герой заберёт, зайдя в свой город
  let v = armyValue(t.garrison);
  for (const u of FACTIONS[t.fac].units) v += maxRecruit(t, u) * UNITS[u].hp * (1 + UNITS[u].att / 10);
  return v;
}
function aiTargets(h, p, D) {
  const out = [], see = (x, y) => p.seen[y * MW + x], zone = mobZone(), peace = G.day < D.peace;
  const mobById = id => G.objs.find(o => o.id === id);
  for (const o of G.objs) {
    if (!see(o.x, o.y) && o.t !== 'town') continue; // где стоят районы, знает вся Москва; остальное — только разведанное
    let w = 0, defs = [];
    if (o.t === 'pile') w = 3;
    else if (o.t === 'mine' && o.owner !== h.owner) { w = 4; if (o.roof && o.roof.owner !== h.owner) defs = [{ army: o.roof.army }]; }
    else if (o.t === 'mine' && o.roof && o.roof.owner !== h.owner && o.roof.known) { w = 5; defs = [{ army: o.roof.army }]; } // своя точка под чужой крышей
    else if (o.t === 'chest') w = 3;
    else if (o.t === 'art') w = o.art === 'key' ? 9 : 5;
    else if (o.t === 'bonus' && !o.seen.includes(h.id)) w = o.kind === 'mp' ? 0.8 : 2.5;
    else if (o.t === 'mob') { w = 1.5; defs = [{ army: o.army }]; }
    else if (o.t === 'town' && o.owner !== h.owner) {
      if (peace && o.owner >= 0) continue;
      w = see(o.x, o.y) ? 9 : 5;
      const dh = heroAt(o.x, o.y);
      if (dh) defs.push({ army: dh.army, hero: dh, fence: !!o.built.fence });
      defs.push({ army: armyCount(o.garrison) ? o.garrison : militiaOf(o), fence: !!o.built.fence });
    } else if (o.t === 'town' && o.owner === h.owner && (h.x !== o.x || h.y !== o.y)) {
      const mine = armyValue(h.army), threat = G.heroes.some(e => e.owner !== h.owner && see(e.x, e.y) && Math.hypot(e.x - o.x, e.y - o.y) < 9 && !heroAt(o.x, o.y));
      const gain = aiGain(h, o);
      if (threat) w = 8; else if (gain > mine * 0.25) w = Math.min(10, 4 + 4 * gain / Math.max(1, mine));
    }
    if (!w) continue;
    // охрана у клетки: без драки с ней туда не встать
    const zid = zone[o.y * MW + o.x];
    if (o.t !== 'mob' && zid >= 0) { const m = mobById(zid); if (m) defs.unshift({ army: m.army }); }
    out.push({ x: o.x, y: o.y, w, defs, key: 'o' + o.id });
  }
  if (!peace) for (const e of G.heroes) if (e.owner !== h.owner && see(e.x, e.y) && !townAt(e.x, e.y)) out.push({ x: e.x, y: e.y, w: 7, defs: [{ army: e.army, hero: e }], key: 'h' + e.id });
  return out;
}
// ближайшая известная клетка на краю тумана — чтобы разведывать карту
function aiFrontier(h, p) {
  const seenA = p.seen, done = new Uint8Array(MW * MH), q = [[h.x, h.y]]; done[h.y * MW + h.x] = 1;
  for (let qi = 0; qi < q.length && qi < 4000; qi++) {
    const [x, y] = q[qi];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, i = ny * MW + nx;
      if (!inMap(nx, ny) || done[i] || !passT(tileAt(nx, ny))) continue;
      done[i] = 1;
      if (!seenA[i]) return { x, y };
      else q.push([nx, ny]);
    }
  }
  return null;
}

async function aiHero(h, p, D) {
  const rejected = new Set();
  for (let k = 0; k < 14 && heroById(h.id) && h.mp > 4 && !G.over; k++) {
    if (D.slack && Math.random() < D.slack) break; // лёгкий бот ленится
    const far = MR + 6;
    const ts = aiTargets(h, p, D).filter(t => !rejected.has(t.key)).map(t => ({ ...t, d: Math.hypot(t.x - h.x, t.y - h.y) })).filter(t => t.d < far)
      .sort((a, b) => a.d / a.w - b.d / b.w).slice(0, 10);
    const cands = [];
    for (const t of ts) { const pl = findPath(h, t.x, t.y); if (!pl) continue; const c = pl.path.length ? pl.path[pl.path.length - 1].c : 0; cands.push({ t, pl, sc: (c + 6) / t.w }); }
    // разведка — такая же цель, как остальные: иначе герой вечно крутится вокруг дома
    { const f = aiFrontier(h, p); if (f && (f.x !== h.x || f.y !== h.y) && !rejected.has('fr')) { const pl = findPath(h, f.x, f.y); if (pl && pl.path.length) { const end = pl.path[pl.path.length - 1], zid = mobZone()[end.y * MW + end.x], m = zid >= 0 && G.objs.find(o => o.id === zid); cands.push({ t: { key: 'fr', defs: m ? [{ army: m.army }] : [] }, pl, sc: (end.c + 6) / 2.2 }); } } }
    cands.sort((a, b) => a.sc - b.sc);
    let go = null;
    for (const c of cands) {
      if (c.t.defs.length && !(await worthFight(h, c.t.defs, D))) { rejected.add(c.t.key); continue; }
      go = c; break;
    }
    if (!go) {
      const f = aiFrontier(h, p), home = myTowns(p.id)[0];
      const pl = f && (f.x !== h.x || f.y !== h.y) ? findPath(h, f.x, f.y) : home && (h.x !== home.x || h.y !== home.y) ? findPath(h, home.x, home.y) : null;
      if (!pl || !pl.path.length) break;
      // на разведке не лезем в засаду, которую не потянем
      const end = pl.path[pl.path.length - 1], zid = mobZone()[end.y * MW + end.x];
      if (zid >= 0) { const m = G.objs.find(o => o.id === zid); if (m && !(await worthFight(h, [{ army: m.army }], D))) break; }
      const before = h.mp; await moveHero(h, pl);
      if (!heroById(h.id) || h.mp === before) break;
      continue;
    }
    const before = h.mp, bx = h.x, by = h.y;
    await moveHero(h, go.pl);
    { const here = heroById(h.id) && townAt(h.x, h.y); if (here && here.owner === h.owner) { aiTown(p, D); } } // зашёл домой — сразу забрал пополнение
    if (heroById(h.id) && h.mp === before && h.x === bx && h.y === by) rejected.add(go.t.key);
  }
}

// весь ход бригады
async function aiPlay(p) {
  const D = DIFF[p.kind === 'bot' ? p.diff : 1];
  aiTown(p, D);
  // сильные идут первыми: они расчищают дорогу остальным
  const hs = myHeroes(p.id).slice().sort((a, b) => armyValue(b.army) - armyValue(a.army));
  for (const h of hs) { if (G.over) return; if (heroById(h.id)) await aiHero(h, p, D); }
  if (!G.over) aiTown(p, D);
  if (BUSY) BUSY = false;
}
async function botTurn(p) { await aiPlay(p); }
