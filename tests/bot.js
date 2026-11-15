'use strict';
// Автотест: партия без людей у экрана. За «людей» ходит тот же ИИ, что и за ботов (js/ai.js),
// окна и шторки отвечают сами, бои считаются мгновенно. Запуск в консоли: await BOT.run(дней)
window.BOT = (() => {
  const L = { asks: {}, battles: 0, wins: 0, losses: 0, captures: 0, errors: [], maxLvl: 1, eliminated: [] };
  function patch() {
    SPEED = 0; window.AUTOBATTLE = true;
    window.ask = async (t, h, b) => { const k = t.replace(/[0-9]+/g, '#'); L.asks[k] = (L.asks[k] || 0) + 1; return t.includes('уровень') ? rnd(0, 2) : rnd(0, b.length - 1); };
    window.curtain = async () => {};
    window.openTown = async () => {};
    window.openExchange = async () => {};
    const rb = runBattle; window.runBattle = async cfg => { if (cfg.sim) return rb(cfg); L.battles++; const r = await rb(cfg); if (r.winner === 0) L.wins++; else L.losses++; return r; };
    const sg = siege; window.siege = async (h, t) => { const o = t.owner; await sg(h, t); if (t.owner === h.owner && o !== h.owner) L.captures++; };
  }
  async function run(days = 20) {
    patch();
    const t0 = performance.now(), start = G.day;
    try {
      // первый ход может выпасть боту: beginTurn сам проведёт всех ботов до первого человека
      if (isBot(G.cur)) await beginTurn();
      while (!G.over && G.day < start + days) {
        const p = curP();
        if (isBot(p.id)) { L.errors.push('ход бота не был сыгран игрой, день ' + G.day); break; }
        await aiPlay(p);
        G.heroes.forEach(h => { L.maxLvl = Math.max(L.maxLvl, h.lvl); });
        if (BUSY) { L.errors.push('BUSY завис на дне ' + G.day); BUSY = false; }
        if (BOTTING) { L.errors.push('BOTTING завис на дне ' + G.day); BOTTING = false; }
        if (B) { L.errors.push('бой не закрылся, день ' + G.day); break; }
        await endTurn();
      }
    } catch (e) { L.errors.push(String(e && e.stack || e)); }
    L.eliminated = G.players.filter(p => !p.alive).map(p => p.name);
    return { ...L, sims: AI.sims, day: G.day, over: G.over, map: MW, ms: Math.round(performance.now() - t0), players: G.players.map(p => ({ n: p.name, kind: p.kind, diff: p.diff, alive: p.alive, res: p.res, towns: myTowns(p.id).length, heroes: myHeroes(p.id).map(h => `${h.name} ур${h.lvl} ${armyText(h.army)}`) })), objs: G.objs.length, mobsLeft: G.objs.filter(o => o.t === 'mob').length };
  }
  return { run, L };
})();
