'use strict';
// Автотест: бот играет за всех игроков без пауз и диалогов. Запуск в консоли: await BOT.run(дней)
window.BOT = (() => {
  const L = { asks: {}, battles: 0, wins: 0, losses: 0, captures: 0, errors: [], builds: 0, recruits: 0, maxLvl: 1, eliminated: [] };
  function patch() {
    SPEED = 0; window.AUTOBATTLE = true;
    window.ask = async (t, h, b) => { const k = t.replace(/[0-9]+/g, '#'); L.asks[k] = (L.asks[k] || 0) + 1; return t.includes('уровень') ? rnd(0, 2) : rnd(0, b.length - 1); };
    window.curtain = async () => {};
    window.openTown = async () => {};
    window.openExchange = async () => {};
    const rb = runBattle; window.runBattle = async cfg => { L.battles++; const r = await rb(cfg); if (r.winner === 0) L.wins++; else L.losses++; return r; };
    const sg = siege; window.siege = async (h, t) => { const o = t.owner; await sg(h, t); if (t.owner === h.owner && o !== h.owner) L.captures++; };
  }
  const ORDER = ['dw2', 'adm1', 'dw3', 'market', 'dw4', 'adm2', 'gym', 'fence', 'dw5'];
  function townWork(p) {
    for (const t of myTowns(p.id)) {
      for (const b of ORDER) if (buildState(t, BLD[b]) === 'ok') { build(t, b); L.builds++; break; }
      const h = heroAt(t.x, t.y);
      for (const u of FACTIONS[t.fac].units.slice().reverse()) { const n = maxRecruit(t, u); if (n > 0 && recruit(t, u, n, h)) L.recruits++; }
      if (h && h.owner === p.id) t.garrison.forEach((s, i) => { if (s && addUnits(h.army, s.u, s.n)) t.garrison[i] = null; });
      if (myHeroes(p.id).length < 2 && p.res.gold > 6000 && !h) hireHero(t);
    }
  }
  function targets(h) {
    const mine = armyValue(h.army), out = [];
    for (const o of G.objs) {
      let w = 0;
      if (o.t === 'pile') w = 3; else if (o.t === 'mine' && o.owner !== h.owner) w = 4; else if (o.t === 'chest') w = 3; else if (o.t === 'art') w = 5;
      else if (o.t === 'bonus' && !o.seen.includes(h.id)) w = 2;
      else if (o.t === 'mob' && mine > armyValue(o.army) * 1.5) w = 2;
      else if (o.t === 'town' && o.owner !== h.owner && mine > armyValue(o.garrison) * 1.5 && !(heroAt(o.x, o.y) && armyValue(heroAt(o.x, o.y).army) * 1.3 > mine)) w = 8;
      if (w) out.push({ x: o.x, y: o.y, w });
    }
    for (const e of G.heroes) if (e.owner !== h.owner && mine > armyValue(e.army) * 1.4) out.push({ x: e.x, y: e.y, w: 7 });
    return out;
  }
  async function heroWork(h) {
    for (let k = 0; k < 10 && heroById(h.id) && h.mp > 4 && !G.over; k++) {
      const ts = targets(h).map(t => ({ ...t, d: Math.hypot(t.x - h.x, t.y - h.y) })).filter(t => t.d < 22).sort((a, b) => a.d / a.w - b.d / b.w).slice(0, 8);
      let best = null;
      for (const t of ts) { const pl = findPath(h, t.x, t.y); if (!pl) continue; const c = pl.path.length ? pl.path[pl.path.length - 1].c : 0; const sc = c / t.w; if (!best || sc < best.sc) best = { pl, sc }; }
      if (!best) { const t = myTowns(h.owner)[0]; if (t && (h.x !== t.x || h.y !== t.y)) { const pl = findPath(h, t.x, t.y); if (pl) await moveHero(h, pl); } break; }
      const before = h.mp; await moveHero(h, best.pl);
      if (heroById(h.id) && h.mp === before) break;
    }
  }
  async function run(days = 20) {
    patch();
    const t0 = performance.now(), start = G.day;
    try {
      while (!G.over && G.day < start + days) {
        const p = curP();
        townWork(p);
        for (const h of myHeroes(p.id).slice()) await heroWork(h);
        townWork(p);
        G.heroes.forEach(h => { L.maxLvl = Math.max(L.maxLvl, h.lvl); });
        if (BUSY) { L.errors.push('BUSY stuck on day ' + G.day); BUSY = false; }
        await endTurn();
      }
    } catch (e) { L.errors.push(String(e && e.stack || e)); }
    L.eliminated = G.players.filter(p => !p.alive).map(p => p.name);
    return { ...L, day: G.day, over: G.over, ms: Math.round(performance.now() - t0), players: G.players.map(p => ({ n: p.name, alive: p.alive, res: p.res, towns: myTowns(p.id).length, heroes: myHeroes(p.id).map(h => `${h.name} ур${h.lvl} ${armyText(h.army)}`) })), objs: G.objs.length, mobsLeft: G.objs.filter(o => o.t === 'mob').length };
  }
  return { run, L };
})();
