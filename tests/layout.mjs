// Снимки вёрстки на трёх размерах окна: карта с панелью, окно города, обмен, меню. Печатает, сколько содержимого не влезло.
// Запуск: node tests/layout.mjs . <папка для картинок>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const repo = process.argv[2], out = process.argv[3];
const T = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' };
const server = http.createServer((req, res) => { const f = path.join(repo, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--mute-audio'] });
for (const [w, h] of [[1440, 900], [1280, 760], [1920, 1080]]) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
  page.on('pageerror', e => console.log('ERR', String(e).slice(0, 300)));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('delyozh_guide_seen', '1'); localStorage.setItem('delyozh_tips', 'all'); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => {
    window.curtain = async () => {}; window.ask = async () => 0;
    genMap({ players: [{ name: 'Красные', fac: 'kach', kind: 'human', hero: 3 }, { name: 'Жёлтые', fac: 'rynok', kind: 'bot' }] }); startPlaying();
    document.querySelectorAll('.ov').forEach(e => { e.hidden = true; });
    const p = G.players[0]; p.heat = 45; p.res.gold = 12000;
    const t = myTowns(0)[0], hh = G.heroes[0]; hh.arts.push('chain', 'phone', 'tape');
    Object.assign(t.built, { dw2: true, adm1: true, gym: true, up1: true, market: true }); t.avail[FACTIONS[t.fac].units[1]] = 9;
    const h2 = makeHero(0, t.fac, hh.x + 1, hh.y); h2.army[0] = { u: 'gop', n: 5 }; G.heroes.push(h2);
    const jh = makeHero(0, t.fac, 0, 0); jh.lvl = 4; jail().push({ hero: jh, captor: 1, at: myTowns(1)[0].id, day: 1 });
    p.offerWeek = weekNo(); p.offers = jobOffers(p); p.jobs = []; jobTake(p, p.offers[0].id); p.jobs[0].until = G.day + 2;
    selectHero(hh); refresh();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `${out}/map-${w}.png` });
  // бой с героями на поле с обеих сторон
  await page.evaluate(() => {
    const hh = G.heroes[0], foe = myHeroes(1)[0] || G.heroes.find(x => x.owner === 1); hh.lvl = 5; foe.lvl = 3;
    runBattle({ a: { army: hh.army.map(x => x && { ...x }), hero: hh, owner: 0 }, d: { army: [{ u: 'chop', n: 8 }, { u: 'buh', n: 4 }, { u: 'babka', n: 12 }, null, null], hero: foe, owner: 1 }, title: 'Красные против Жёлтые', arena: 'street' });
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const st = B.stacks.find(s => s.hero && s.side === 1); const { cs, ox, oy } = battleGeom(); UI.bh = { cx: st.x, cy: st.y, fx: st.x + 0.5, fy: st.y + 0.5 }; document.getElementById('bInfo').innerHTML = hoverInfo(st.x, st.y); });
  await page.screenshot({ path: `${out}/battle-${w}.png` });
  await page.evaluate(() => { if (B) endBattle(0); document.querySelectorAll('.ov').forEach(e => { e.hidden = true; }); });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { const t = myTowns(0)[0]; openTown(t, heroAt(t.x, t.y)); });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${out}/town-${w}.png` });
  const m = await page.evaluate(() => [...document.querySelectorAll('#townBox .tcol')].map(c => [c.scrollHeight, c.clientHeight]));
  await page.evaluate(() => { document.querySelector('[data-tab="jobs"]').click(); });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `${out}/town-jobs-${w}.png` });
  await page.evaluate(() => { document.querySelector('[data-tab="build"]').click(); });
  console.log(w, 'колонки города (высота содержимого / видно):', JSON.stringify(m), 'панель:', await page.evaluate(() => { const s = document.getElementById('sScroll'); return [s.scrollHeight, s.clientHeight]; }));
  await page.evaluate(() => { closeTown(); const hs = myHeroes(0); openExchange(hs[0], hs[1]); });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/exch-${w}.png` });
  await page.evaluate(() => { document.getElementById('xClose').click(); document.getElementById('menu').hidden = false; renderMenu(); });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/menu-${w}.png` });
  await page.close();
}
await browser.close(); server.close();
