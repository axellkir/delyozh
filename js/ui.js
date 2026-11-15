'use strict';
// Отрисовка карты и боя, мышь и клавиатура, боковая панель, миникарта.

const TS = 48;
const UI = { sel: null, plan: null, cam: { x: 0, y: 0 }, hover: null, keys: {}, mouse: null };
const cv = $('cv'), ctx = cv.getContext('2d');
let VW = 800, VH = 600, DPR = 1, terr = null;
function resize() {
  DPR = window.devicePixelRatio || 1; VW = innerWidth - 300; VH = innerHeight;
  cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
}
addEventListener('resize', resize); resize();

// ---------- подложка карты (рисуется один раз) ----------
function prerender() {
  terr = document.createElement('canvas'); terr.width = MW * TS; terr.height = MH * TS;
  const g = terr.getContext('2d'), msk = G.map === 'msk';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = tileAt(x, y), X = x * TS, Y = y * TS, h = hash2(x, y, 5);
    // на карте Москвы реки и дороги рисуются плавными линиями поверх земли (см. ниже), кроме брусчатки Кремля
    const soft = msk && (t === T.WATER || (t === T.ROAD && Math.hypot(x + 0.5 - MCX, y + 0.5 - MCY) > 4.2));
    const fill = soft ? '#7b7464' : ['#7b7464', '#4c4c54', '#3f7a36', '#2f6fb0', '#8f8f88', '#a52a2a', '#1e4524'][t];
    g.fillStyle = fill; g.fillRect(X, Y, TS, TS);
    if (soft) continue;
    if (t === T.GROUND) { for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + hash2(x * 7 + i, y, 9) * 0.1})`; g.fillRect(X + hash2(x, y * 3 + i, 1) * TS, Y + hash2(x + i, y, 2) * TS, 3, 3); } }
    if (t === T.ROAD) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(X, Y, TS, 2); if (h < 0.15) { g.fillStyle = '#3a3a40'; g.beginPath(); g.ellipse(X + 24, Y + 28, 9, 5, 0, 0, 7); g.fill(); } }
    if (t === T.PARK || t === T.FOREST) { g.font = '30px serif'; if (h < 0.7) g.fillText(t === T.FOREST ? '🌲' : h < 0.35 ? '🌳' : '🌲', X + 24 + (h - 0.35) * 14, Y + 24); }
    if (t === T.WATER) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + 8, Y + 18); g.quadraticCurveTo(X + 16, Y + 12, X + 24, Y + 18); g.moveTo(X + 22, Y + 34); g.quadraticCurveTo(X + 30, Y + 28, X + 38, Y + 34); g.stroke(); }
    if (t === T.BLOCK) {
      g.fillStyle = '#6e6e68'; g.fillRect(X + 3, Y + 3, TS - 6, 6);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { g.fillStyle = hash2(x * 5 + c, y * 7 + r, 3) < 0.3 ? '#ffe27a' : '#2b3340'; g.fillRect(X + 6 + c * 10, Y + 12 + r * 7, 6, 4); }
    }
    if (t === T.WALL) { g.fillStyle = '#7a1a1a'; for (let i = 0; i < 4; i++) g.fillRect(X + 2 + i * 12, Y, 7, 8); g.strokeStyle = '#5a1010'; g.strokeRect(X + 0.5, Y + 0.5, TS - 1, TS - 1); }
  }
  if (msk) paintMoscow(g);
  g.font = '40px serif'; g.fillText('⭐', (MCX) * TS, (MCY - 3) * TS + 24);
}
// Плавные реки и дороги по клеткам: соседние клетки одного типа соединяются толстой линией со скруглёнными концами
function paintMoscow(g) {
  const link = (t, col, w, dash) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (tileAt(x, y) !== t || (t === T.ROAD && Math.hypot(x + 0.5 - MCX, y + 0.5 - MCY) <= 4.2)) continue;
      const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
      g.moveTo(cx, cy); g.lineTo(cx + 0.01, cy);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        if (tileAt(x + dx, y + dy) !== t) continue;
        if (dx && dy && (tileAt(x + dx, y) === t || tileAt(x, y + dy) === t)) continue; // угол уже соединён через соседа
        g.moveTo(cx, cy); g.lineTo(cx + dx * TS, cy + dy * TS);
      }
    }
    g.stroke(); g.setLineDash([]);
  };
  link(T.WATER, '#1c4f84', TS * 1.04); link(T.WATER, '#2f7fc4', TS * 0.84); link(T.WATER, 'rgba(255,255,255,.16)', 3, [14, 22]);
  link(T.ROAD, '#26262c', TS * 0.66); link(T.ROAD, '#54545e', TS * 0.52); link(T.ROAD, '#e6cf74', 2, [9, 13]);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const L of mskLabels()) {
    g.save(); g.translate(L.x * TS, L.y * TS); g.rotate(L.ang);
    g.font = L.kind === 'road' ? 'bold 14px "Trebuchet MS", sans-serif' : 'italic bold 15px Georgia, serif';
    g.lineWidth = 4; g.strokeStyle = 'rgba(18,14,24,.8)'; g.strokeText(L.text, 0, 0);
    g.fillStyle = L.kind === 'road' ? '#f3e9c8' : L.kind === 'park' ? '#d6f2c4' : '#cfe6ff'; g.fillText(L.text, 0, 0);
    g.restore();
  }
  if (MAP_ART) { const img = new Image(); img.onload = () => { if (terr) terr.getContext('2d').drawImage(img, 0, 0, terr.width, terr.height); }; img.src = 'assets/map/moscow.jpg'; }
}
// Скачать подложку карты картинкой — как основу для художника или нейросети
function exportMapPng() {
  if (!terr) return;
  terr.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `delyozh-map-${MW}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
}

// ---------- камера ----------
function clampCam() { UI.cam.x = clamp(UI.cam.x, -VW / 3, MW * TS - VW * 2 / 3); UI.cam.y = clamp(UI.cam.y, -VH / 3, MH * TS - VH * 2 / 3); }
function centerOn(x, y) { UI.cam.x = x * TS + TS / 2 - VW / 2; UI.cam.y = y * TS + TS / 2 - VH / 2; clampCam(); }
function follow(h) { const sx = h.x * TS - UI.cam.x, sy = h.y * TS - UI.cam.y; if (sx < 120 || sy < 120 || sx > VW - 160 || sy > VH - 160) centerOn(h.x, h.y); }
function selectHero(h) { UI.sel = h ? h.id : null; UI.plan = null; if (h) centerOn(h.x, h.y); refresh(); }
const selHero = () => (UI.sel ? heroById(UI.sel) : null);
const seen = (x, y) => viewP().seen[y * MW + x];
const locked = () => BUSY || BOTTING || netWatching();

let toastT = null;
// во время хода бота мелкие сообщения его героев людям не показываем; force — показать всё равно
function toast(t, force) { if (BOTTING && !force && !B) return; const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, 2200); }

// ---------- карта ----------
const sizeWord = n => (n < 5 ? 'Несколько' : n < 10 ? 'Группа' : n < 20 ? 'Толпа' : n < 50 ? 'Банда' : 'Орда');
function objLabel(o) {
  if (o.t === 'town') return `${o.name} — ${o.owner >= 0 ? G.players[o.owner].name : 'ничей'}`;
  if (o.t === 'mine') return `${mineOf(o).name}: +${mineOf(o).amt}${RES_ICON[MINE[o.kind].res]} в день — ${o.owner >= 0 ? G.players[o.owner].name : 'ничей'}`;
  if (o.t === 'pile') return `${RES_NAME[o.res]}: ${o.amt}`;
  if (o.t === 'chest') return `${o.nm || 'Общак'} — бабло или опыт`;
  if (o.t === 'art') return `${o.nm ? o.nm + ' · ' : ''}${ARTS[o.art].name}: ${ARTS[o.art].desc}`;
  if (o.t === 'bonus') return `${bonusOf(o).name}${UI.sel && o.seen.includes(UI.sel) ? ' (уже были)' : ''}`;
  if (o.t === 'mob') { const n = armyCount(o.army), s = o.army.find(Boolean); return `${o.boss ? 'Кремлёвский полк' : sizeWord(n) + ': ' + UNITS[s.u].name.toLowerCase()} (${n < 5 ? '1–4' : n < 10 ? '5–9' : n < 20 ? '10–19' : n < 50 ? '20–49' : '50+'})`; }
  return '';
}
// подпись под точкой на карте
function mapTag(c, text, x, y, big) {
  c.font = big ? 'bold 14px "Trebuchet MS", sans-serif' : 'bold 11px "Trebuchet MS", sans-serif';
  c.lineWidth = 3; c.strokeStyle = 'rgba(18,14,24,.9)'; c.strokeText(text, x, y); c.fillStyle = big ? '#ffd21a' : '#fff'; c.fillText(text, x, y);
}
function drawMap() {
  const c = ctx, cam = UI.cam;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, VW, VH);
  if (!terr) return;
  c.drawImage(terr, cam.x * 1, cam.y * 1, VW, VH, 0, 0, VW, VH);
  c.setTransform(DPR, 0, 0, DPR, -cam.x * DPR, -cam.y * DPR);
  const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS)), x1 = Math.min(MW - 1, Math.ceil((cam.x + VW) / TS)), y1 = Math.min(MH - 1, Math.ceil((cam.y + VH) / TS));
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const now = performance.now();
  for (const o of G.objs) {
    if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1 || !seen(o.x, o.y)) continue;
    const X = o.x * TS + TS / 2, Y = o.y * TS + TS / 2;
    if (o.t === 'town') {
      c.fillStyle = o.owner >= 0 ? pcol(o.owner) : '#ddd'; c.fillRect(X - 26, Y - 30, 52, 8);
      c.font = '44px serif'; c.fillText('🏢', X - 6, Y + 2); c.font = '24px serif'; c.fillText(FACTIONS[o.fac].em, X + 16, Y + 12);
      if (o.dist) mapTag(c, o.name, X, Y + 30, true);
      continue;
    }
    if (o.t === 'mine' || o.t === 'town') { c.fillStyle = o.owner >= 0 ? pcol(o.owner) : '#eee'; c.fillRect(X + 8, Y - 22, 12, 9); c.fillStyle = '#222'; c.fillRect(X + 7, Y - 22, 2, 22); }
    let em = '?';
    if (o.nm && seen(o.x, o.y)) mapTag(c, o.lb || o.nm.split(':')[0], X, Y + 25);
    if (o.t === 'mine') em = mineOf(o).em; else if (o.t === 'pile') em = RES_ICON[o.res]; else if (o.t === 'chest') em = o.em || '📦';
    else if (o.t === 'art') { em = ARTS[o.art].em; c.fillStyle = `rgba(255,220,60,${0.25 + 0.15 * Math.sin(now / 300)})`; c.beginPath(); c.arc(X, Y, 20, 0, 7); c.fill(); }
    else if (o.t === 'bonus') em = bonusOf(o).em;
    else if (o.t === 'mob') { em = UNITS[o.army.find(Boolean).u].em; c.fillStyle = 'rgba(200,30,30,.35)'; c.beginPath(); c.arc(X, Y, 21, 0, 7); c.fill(); if (drawSprite(c, o.army.find(Boolean).u, X, Y - 1, o.boss ? 48 : 40, o.id)) continue; }
    c.font = (o.t === 'mob' && o.boss ? 46 : 32) + 'px serif'; c.fillText(em, X, Y + 2);
  }
  // путь
  const h = selHero();
  if (UI.plan && h) {
    let first = true;
    for (const st of UI.plan.path) {
      const ok = st.c <= h.mp + 0.01;
      c.fillStyle = ok ? '#4f4' : '#f54'; c.beginPath(); c.arc(st.x * TS + TS / 2, st.y * TS + TS / 2, first ? 5 : 4, 0, 7); c.fill(); first = false;
    }
    const lx = UI.plan.tx * TS + TS / 2, ly = UI.plan.ty * TS + TS / 2;
    c.font = '26px serif'; c.fillText(UI.plan.action ? (UI.plan.action.kind === 'meet' ? '🤝' : '⚔️') : '❌', lx, ly);
  }
  // герои
  for (const o of G.heroes) {
    if (!seen(o.x, o.y)) continue;
    const X = o.x * TS + TS / 2, Y = o.y * TS + TS / 2, inTown = !!townAt(o.x, o.y), dx = inTown ? 14 : 0, dy = inTown ? 12 : 0;
    if (o.id === UI.sel) { c.strokeStyle = '#ffd21a'; c.lineWidth = 3; c.beginPath(); c.arc(X + dx, Y + dy, 21 + Math.sin(now / 180) * 2, 0, 7); c.stroke(); }
    c.fillStyle = pcol(o.owner); c.beginPath(); c.arc(X + dx, Y + dy, 17, 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
    c.font = '26px serif'; c.fillText(o.em, X + dx, Y + dy + 1);
  }
  // туман
  c.fillStyle = '#000';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!seen(x, y)) c.fillRect(x * TS - 0.5, y * TS - 0.5, TS + 1, TS + 1);
  // подсказка
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (UI.hover && inMap(UI.hover.x, UI.hover.y) && seen(UI.hover.x, UI.hover.y)) {
    const o = objAt(UI.hover.x, UI.hover.y), hh = heroAt(UI.hover.x, UI.hover.y);
    let txt = hh ? `${hh.name} (${G.players[hh.owner].name}) · ур. ${hh.lvl} · ${armyText(hh.army)}` : o ? objLabel(o) : '';
    if (UI.plan && UI.plan.tx === UI.hover.x && UI.plan.ty === UI.hover.y && h) { const last = UI.plan.path[UI.plan.path.length - 1]; const need = last ? last.c : 0; txt += (txt ? ' · ' : '') + (need <= h.mp + 0.01 ? 'дойдём сегодня — кликни ещё раз' : `дней пути: ${Math.ceil((need - h.mp) / heroMaxMp(h)) + 1}`); }
    if (txt) { c.font = 'bold 15px sans-serif'; const w = c.measureText(txt).width + 20, mx = clamp(UI.mouse.x + 16, 0, VW - w), my = clamp(UI.mouse.y + 18, 0, VH - 30); c.fillStyle = 'rgba(0,0,0,.85)'; c.fillRect(mx, my, w, 26); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(txt, mx + 10, my + 14); }
  }
}

// ---------- бой ----------
function battleGeom() { const cs = Math.min((VW - 40) / BW, (VH - 190) / BH, 92); return { cs, ox: (VW - cs * BW) / 2, oy: 56 + (VH - 190 - cs * BH) / 2 }; }
function drawBattle() {
  const c = ctx, { cs, ox, oy } = battleGeom(), now = performance.now();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#2a2530'; c.fillRect(0, 0, VW, VH);
  c.fillStyle = '#4a4a50'; c.fillRect(ox, oy, cs * BW, cs * BH);
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1;
  for (let x = 0; x <= BW; x++) { c.beginPath(); c.moveTo(ox + x * cs, oy); c.lineTo(ox + x * cs, oy + cs * BH); c.stroke(); }
  for (let y = 0; y <= BH; y++) { c.beginPath(); c.moveTo(ox, oy + y * cs); c.lineTo(ox + cs * BW, oy + y * cs); c.stroke(); }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const s = B.active, human = s && B.wait && !B.busy && humanSide(s);
  if (human) {
    const R = reach(s);
    c.fillStyle = 'rgba(120,255,120,.18)';
    for (const k of R.keys()) { const [x, y] = k.split(',').map(Number); c.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2); }
    if (UI.bh) {
      const t = stackAt(UI.bh.cx, UI.bh.cy);
      c.lineWidth = 3; c.strokeStyle = t && t.side !== s.side ? '#f44' : '#fff';
      c.strokeRect(ox + UI.bh.cx * cs + 2, oy + UI.bh.cy * cs + 2, cs - 4, cs - 4);
      if (t && t.side !== s.side && !canShoot(s) && !B.spell) { const p = attackCell(s, t, UI.bh.fx, UI.bh.fy); if (p && p.length) { const e = p[p.length - 1]; c.strokeStyle = '#ff0'; c.strokeRect(ox + e.x * cs + 6, oy + e.y * cs + 6, cs - 12, cs - 12); } }
    }
  }
  c.font = Math.round(cs * 0.6) + 'px serif';
  for (const k of B.obst) { const [x, y] = k.split(',').map(Number); c.fillText(OBST[(x * 3 + y) % OBST.length], ox + x * cs + cs / 2, oy + y * cs + cs / 2); }
  for (const st of B.stacks) {
    if (!alive(st)) continue;
    st.px += (st.x - st.px) * 0.35; st.py += (st.y - st.py) * 0.35;
    const X = ox + st.px * cs + cs / 2, Y = oy + st.py * cs + cs / 2, own = B.sides[st.side].owner;
    if (st === s) { c.strokeStyle = '#ffd21a'; c.lineWidth = 4; c.beginPath(); c.arc(X, Y, cs * 0.44 + Math.sin(now / 150) * 2, 0, 7); c.stroke(); }
    c.fillStyle = own >= 0 ? pcol(own) : '#8a8a8a'; c.globalAlpha = 0.55; c.beginPath(); c.arc(X, Y, cs * 0.4, 0, 7); c.fill(); c.globalAlpha = 1;
    c.save(); c.translate(X, Y); if (st.side === 1) c.scale(-1, 1);
    if (!drawSprite(c, st.u, 0, -cs * 0.04, Math.floor(cs * 0.8 / 16) * 16 || 16, st.id)) { c.font = Math.round(cs * 0.58) + 'px serif'; c.fillText(UNITS[st.u].em, 0, 2); } c.restore();
    if (st.flash > 0) { c.fillStyle = `rgba(255,40,40,${st.flash * 0.5})`; c.beginPath(); c.arc(X, Y, cs * 0.4, 0, 7); c.fill(); st.flash = Math.max(0, st.flash - 0.05); }
    if (st.defd) { c.font = Math.round(cs * 0.25) + 'px serif'; c.fillText('🛡️', X - cs * 0.32, Y - cs * 0.3); }
    const label = String(st.n); c.font = `bold ${Math.round(cs * 0.22)}px sans-serif`;
    const w = c.measureText(label).width + 8; c.fillStyle = own >= 0 ? pcol(own) : '#666'; c.fillRect(X + cs * 0.42 - w, Y + cs * 0.22, w, cs * 0.26); c.fillStyle = '#000'; c.fillText(label, X + cs * 0.42 - w / 2, Y + cs * 0.36);
  }
  for (const f of B.fx) {
    f.t += 1 / 60;
    if (f.shot) { const q = Math.min(1, f.t / 0.25), X = ox + (f.fx0 + (f.x - f.fx0) * q) * cs + cs / 2, Y = oy + (f.fy0 + (f.y - f.fy0) * q) * cs + cs / 2 - Math.sin(q * Math.PI) * cs; c.font = Math.round(cs * 0.3) + 'px serif'; c.fillText('💥', X, Y); continue; }
    c.globalAlpha = Math.max(0, 1 - f.t / 1.2); c.font = `bold ${Math.round(cs * 0.28)}px sans-serif`; c.fillStyle = '#000'; c.fillText(f.text, ox + f.x * cs + cs / 2 + 2, oy + f.y * cs - f.t * 40 + 2); c.fillStyle = f.col; c.fillText(f.text, ox + f.x * cs + cs / 2, oy + f.y * cs - f.t * 40); c.globalAlpha = 1;
  }
  B.fx = B.fx.filter(f => f.t < (f.shot ? 0.3 : 1.2));
  // очередь ходов
  const q = [s, ...B.queue.filter(alive)].filter(Boolean).slice(0, 10);
  q.forEach((st, i) => { const X = 20 + i * 46, Y = VH - 120; c.fillStyle = B.sides[st.side].owner >= 0 ? pcol(B.sides[st.side].owner) : '#777'; c.fillRect(X, Y, 40, 40); if (!drawSprite(c, st.u, X + 20, Y + 20, 32, 0)) { c.font = '26px serif'; c.fillStyle = '#000'; c.fillText(UNITS[st.u].em, X + 20, Y + 21); } if (i === 0) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(X, Y, 40, 40); } });
}

// ---------- ввод ----------
function cellFromMouse(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener('mousemove', e => {
  UI.mouse = cellFromMouse(e);
  if (B) { const { cs, ox, oy } = battleGeom(), fx = (UI.mouse.x - ox) / cs, fy = (UI.mouse.y - oy) / cs; UI.bh = fx >= 0 && fy >= 0 && fx < BW && fy < BH ? { cx: Math.floor(fx), cy: Math.floor(fy), fx, fy } : null; $('bInfo').textContent = UI.bh ? hoverInfo(UI.bh.cx, UI.bh.cy) : ''; return; }
  UI.hover = { x: Math.floor((UI.mouse.x + UI.cam.x) / TS), y: Math.floor((UI.mouse.y + UI.cam.y) / TS) };
});
cv.addEventListener('mousedown', e => {
  audioInit();
  if (B) { if (UI.bh && e.button === 0) battleClickCell(UI.bh.cx, UI.bh.cy, UI.bh.fx, UI.bh.fy); return; }
  if (locked() || !G || G.over || e.button !== 0) return;
  const m = cellFromMouse(e), tx = Math.floor((m.x + UI.cam.x) / TS), ty = Math.floor((m.y + UI.cam.y) / TS);
  mapClick(tx, ty);
});
// правый клик — проложить путь куда угодно, в том числе к своему герою для обмена
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (B || locked() || !G || G.over) return;
  const h = selHero(), m = cellFromMouse(e), tx = Math.floor((m.x + UI.cam.x) / TS), ty = Math.floor((m.y + UI.cam.y) / TS);
  if (!h || !inMap(tx, ty) || !seen(tx, ty)) return;
  const plan = findPath(h, tx, ty);
  if (plan) { UI.plan = plan; sfx('click'); } else toast('Туда не пройти');
});
function mapClick(tx, ty) {
  if (!inMap(tx, ty)) return;
  const p = curP(), hh = heroAt(tx, ty), h = selHero(), t = townAt(tx, ty);
  if (hh && hh.owner === p.id && (!h || hh !== h) && !(h && UI.plan && UI.plan.tx === tx && UI.plan.ty === ty)) { selectHero(hh); return; }
  if (h && hh === h) { if (t) openTown(t, h); return; }
  if (!h) { if (t && t.owner === p.id) openTown(t, null); return; }
  if (!seen(tx, ty)) { toast('Туда ещё никто не ходил'); return; }
  if (UI.plan && UI.plan.tx === tx && UI.plan.ty === ty) { moveHero(h, UI.plan); return; }
  const plan = findPath(h, tx, ty);
  if (!plan) { toast('Туда не пройти'); UI.plan = null; return; }
  UI.plan = plan; sfx('click'); refresh();
}
addEventListener('keydown', e => {
  audioInit();
  if (e.target.tagName === 'INPUT') return;
  UI.keys[e.code] = true;
  if (B) { if (e.code === 'KeyW') battleWait(); if (e.code === 'KeyD') battleDefend(); if (e.code === 'KeyC') toggleSpells(); if (e.code === 'KeyA') battleAuto(); return; }
  if (e.code === 'KeyM') { musicOn = !musicOn; toast(musicOn ? 'Музыка вкл' : 'Музыка выкл'); }
  if (!G || anyOverlay() || locked()) return;
  if (e.code === 'Enter') { e.preventDefault(); endTurn(); }
  if (e.code === 'Space') { e.preventDefault(); continuePath(); }
  if (e.code === 'KeyH') { const hs = myHeroes(G.cur); if (hs.length) { const i = hs.findIndex(x => x.id === UI.sel); selectHero(hs[(i + 1) % hs.length]); } }
});
addEventListener('keyup', e => { UI.keys[e.code] = false; });
function continuePath() {
  const h = selHero(); if (!h || locked()) return;
  if (UI.plan) { moveHero(h, UI.plan); return; }
  if (h.dest) { const plan = findPath(h, h.dest.x, h.dest.y); if (plan) moveHero(h, plan); else { h.dest = null; toast('Путь закрыт'); } }
  else toast('Выберите, куда идти');
}
const anyOverlay = () => ['modal', 'town', 'exch', 'curtain', 'menu'].some(id => !$(id).hidden);

// ---------- панель ----------
function refresh() {
  if (!G) return;
  const watch = BOTTING || netWatching(), p = watch ? viewP() : curP(), inc = dailyIncome(p.id);
  $('pName').textContent = `${FACTIONS[p.fac].em} ${p.name}`; $('pName').style.color = p.col;
  $('pDay').innerHTML = watch ? `<b style="color:${curP().col}">${isBot(G.cur) ? '🤖' : '🌐'} Ходит: ${curP().name}…</b>` : `Неделя ${weekNo()}, день ${dayOfWeek()} · всего дней: ${G.day}`;
  $('endBtn').disabled = watch;
  netBox(); netDirty();
  $('pRes').innerHTML = RES.map(r => `<div>${RES_ICON[r]} ${p.res[r]}<small>+${inc[r]}/день</small></div>`).join('');
  $('heroList').innerHTML = myHeroes(p.id).map(h => `<div class="li ${h.id === UI.sel ? 'on' : ''}" data-h="${h.id}"><span class="em">${h.em}</span><span>${h.name}<br><small>ур. ${h.lvl}</small></span><span class="mpb"><i style="width:${Math.round(100 * h.mp / heroMaxMp(h))}%"></i></span></div>`).join('') || '<small>Героев нет — наймите в городе</small>';
  $('townList').innerHTML = myTowns(p.id).map(t => `<div class="li" data-t="${t.id}"><span class="em">🏢</span><span>${t.name}<br><small>${t.builtDay === G.day ? 'сегодня уже строили' : 'можно строить'}</small></span></div>`).join('') || '<small>Городов нет! Захватите любой за 7 дней</small>';
  document.querySelectorAll('[data-h]').forEach(el => el.onclick = () => { if (!locked()) selectHero(heroById(+el.dataset.h)); });
  document.querySelectorAll('[data-t]').forEach(el => el.onclick = () => { if (!locked()) { const t = G.objs.find(o => o.id === +el.dataset.t); openTown(t, heroAt(t.x, t.y)); } });
  const h = selHero();
  if (h) {
    const s = heroStats(h), nx = xpFor(h.lvl + 1), px = xpFor(h.lvl);
    $('hCard').innerHTML = `<div style="display:flex;gap:10px;align-items:center"><span style="font-size:42px">${h.em}</span><div><b style="font-size:17px">${h.name}</b><br><small>${FACTIONS[h.fac].name} · уровень ${h.lvl}${SPECS[h.spec] ? `<br>★ ${SPECS[h.spec].name}: ${SPECS[h.spec].desc}` : ''}</small></div></div>
      <div class="stats"><div>⚔️${s.att}<small>атака</small></div><div>🛡️${s.def}<small>защита</small></div><div>😎${s.pow}<small>понты</small></div><div>💧${h.mana}<small>из ${maxMana(h)}</small></div></div>
      <small>Ход: ${Math.floor(h.mp)} / ${heroMaxMp(h)}</small><div class="bar"><i style="width:${100 * h.mp / heroMaxMp(h)}%;background:#6f6"></i></div>
      <small>Опыт: ${h.xp} / ${nx}</small><div class="bar"><i style="width:${100 * (h.xp - px) / (nx - px)}%;background:#fc3"></i></div>
      <div class="slots">${h.army.map(a => `<div class="slot" title="${a ? UNITS[a.u].name : ''}">${a ? unitIcon(a.u, 40) + `<b>${a.n}</b>` : ''}</div>`).join('')}</div>
      <div class="arts">${h.arts.map(a => `<span title="${ARTS[a].name}: ${ARTS[a].desc}">${ARTS[a].em}</span>`).join('') || '<small>Артефактов нет</small>'}</div>
      ${G.heroes.filter(o => o.owner === h.owner && o !== h && Math.max(Math.abs(o.x - h.x), Math.abs(o.y - h.y)) <= 1).map(o => `<button class="sec" data-ex="${o.id}" style="margin-top:6px">🤝 Обмен с ${o.name}</button>`).join('')}`;
    document.querySelectorAll('[data-ex]').forEach(el => el.onclick = () => { if (!locked()) openExchange(h, heroById(+el.dataset.ex)); });
  } else $('hCard').innerHTML = '<small>Выберите героя</small>';
  $('goBtn').disabled = watch || !h || (!h.dest && !UI.plan);
}
$('endBtn').onclick = () => { if (!locked()) endTurn(); };
$('goBtn').onclick = () => continuePath();

// ---------- миникарта ----------
const mini = $('mini'), mc = mini.getContext('2d');
function drawMini() {
  const k = mini.width / MW, p = viewP();
  mc.fillStyle = '#000'; mc.fillRect(0, 0, mini.width, mini.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { if (!p.seen[y * MW + x]) continue; mc.fillStyle = ['#7b7464', '#55555e', '#3f7a36', '#2f6fb0', '#9a9a92', '#a52a2a', '#1e4524'][tileAt(x, y)]; mc.fillRect(x * k, y * k, k, k); }
  for (const o of G.objs) if ((o.t === 'town' || o.t === 'mine') && p.seen[o.y * MW + o.x]) { mc.fillStyle = o.owner >= 0 ? pcol(o.owner) : '#fff'; const s = o.t === 'town' ? 3 : 2; mc.fillRect(o.x * k - s, o.y * k - s, k + s * 2, k + s * 2); }
  for (const h of G.heroes) if (p.seen[h.y * MW + h.x]) { mc.fillStyle = pcol(h.owner); mc.beginPath(); mc.arc(h.x * k + k / 2, h.y * k + k / 2, 3, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.stroke(); }
  mc.strokeStyle = '#fff'; mc.lineWidth = 1; mc.strokeRect(UI.cam.x / TS * k, UI.cam.y / TS * k, VW / TS * k, VH / TS * k);
}
mini.addEventListener('mousedown', e => { const r = mini.getBoundingClientRect(); centerOn(Math.floor((e.clientX - r.left) / r.width * MW), Math.floor((e.clientY - r.top) / r.height * MH)); });

// ---------- цикл ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (G && !B && !anyOverlay()) {
    const sp = 700 * dt, k = UI.keys;
    if (k.ArrowLeft || k.KeyA) UI.cam.x -= sp; if (k.ArrowRight || k.KeyD) UI.cam.x += sp;
    if (k.ArrowUp || k.KeyW) UI.cam.y -= sp; if (k.ArrowDown || k.KeyS) UI.cam.y += sp;
    clampCam();
  }
  if (B) drawBattle(); else if (G) { drawMap(); drawMini(); }
  musicTick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
