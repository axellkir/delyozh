'use strict';
// Пиксельные спрайты бойцов 16×16, нарисованные кодом: без файлов картинок и одинаковые на любой системе.
// Люди собираются из одного «манекена» с параметрами (шапка, причёска, одежда, предмет в руке),
// техника и звери рисуются прямоугольниками. У каждого два кадра — бойцы слегка «дышат».
// Если спрайта нет, drawSprite вернёт false.

const SPRITES = {}; // id → { frames: [canvas, canvas], url }
const SPR_INK = '#1a1320';

const sprGrid = () => new Array(256).fill(null);
function sprRect(g, x, y, w, h, c) { if (!c) return; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < 16 && Y < 16) g[Y * 16 + X] = c; } }
function sprShade(hex, k) { const n = parseInt(hex.slice(1).length === 3 ? hex.slice(1).replace(/./g, '$&$&') : hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
// тёмный контур вокруг фигуры — из-за него спрайт читается на любом фоне
function sprOutline(g) {
  const o = g.slice();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (g[y * 16 + x]) continue;
    if ((x > 0 && g[y * 16 + x - 1]) || (x < 15 && g[y * 16 + x + 1]) || (y > 0 && g[(y - 1) * 16 + x]) || (y < 15 && g[(y + 1) * 16 + x])) o[y * 16 + x] = SPR_INK;
  }
  return o;
}
function sprCanvas(g) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  g.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i % 16, (i / 16) | 0, 1, 1); } });
  return c;
}

// ---------- манекен ----------
function sprHuman(o, bob) {
  const g = sprGrid(), d = bob ? 1 : 0, skin = o.skin || '#f2c49b', top = o.top || '#888', pants = o.pants || '#3b3f52', shoe = o.shoe || '#22202a', w = o.fat ? 1 : 0;
  const U = (x, y, ww, hh, c) => sprRect(g, x, y + d, ww, hh, c); // верх тела: на втором кадре опускается на пиксель
  // ноги
  if (o.robe) { sprRect(g, 4, 11, 8, 5, top); sprRect(g, 4, 15, 8, 1, sprShade(top, 0.7)); sprRect(g, 7, 11, 2, 4, sprShade(top, 1.25)); }
  else {
    const leg = o.shorts ? skin : pants;
    sprRect(g, 5, 11, 2, 4, leg); sprRect(g, 9, 11, 2, 4, leg);
    if (o.shorts) { sprRect(g, 5, 11, 6, 1, pants); sprRect(g, 5, 12, 2, 1, pants); sprRect(g, 9, 12, 2, 1, pants); }
    else sprRect(g, 5, 11, 6, 1, pants);
    if (o.coat) sprRect(g, 4, 11, 8, 2, sprShade(top, 0.85));
    if (o.stripe && !o.shorts) { sprRect(g, 5, 12, 1, 3, o.stripe); sprRect(g, 10, 12, 1, 3, o.stripe); }
    sprRect(g, 4, 15, 3, 1, shoe); sprRect(g, 9, 15, 3, 1, shoe);
  }
  // торс, руки
  U(5 - w, 6, 6 + 2 * w, 5, top);
  if (!o.robe && !o.coat) U(5 - w, 10, 6 + 2 * w, 1, sprShade(top, 0.75));
  U(4 - w, 6, 1, 4, o.sleeve || top); U(11 + w, 6, 1, 4, o.sleeve || top);
  U(4 - w, 10, 1, 1, skin); U(11 + w, 10, 1, 1, skin);
  if (o.shirt) { U(7, 6, 2, 3, o.shirt); if (o.tie) U(7, 6, 1, 3, o.tie); }
  if (o.print) { U(7, 8, 2, 1, o.print); U(6, 7, 1, 1, o.print); U(9, 7, 1, 1, o.print); }
  if (o.camo) { U(5, 7, 2, 1, o.camo); U(8, 8, 2, 1, o.camo); U(6, 9, 2, 1, o.camo); }
  if (o.chain) { U(6, 6, 1, 1, '#ffd21a'); U(7, 7, 2, 1, '#ffd21a'); U(9, 6, 1, 1, '#ffd21a'); }
  if (o.badge) U(9, 7, 1, 1, o.badge);
  // голова
  U(6, 2, 4, 4, skin);
  U(7, 4, 1, 1, SPR_INK); U(9, 4, 1, 1, SPR_INK);
  if (o.glasses) U(6, 4, 4, 1, o.glasses);
  if (o.beard) { U(6, 5, 4, 1, o.beard); U(7, 6, 2, 1, o.beard); }
  const hc = o.hatCol || '#333', hr = o.hairCol || '#4a3220';
  switch (o.hair) {
    case 'short': U(6, 1, 4, 2, hr); break;
    case 'mohawk': U(7, 0, 2, 3, hr); break;
    case 'long': U(5, 1, 6, 2, hr); U(5, 3, 1, 5, hr); U(10, 3, 1, 5, hr); break;
    case 'bun': U(6, 1, 4, 2, hr); U(7, 0, 2, 1, hr); break;
    case 'spiky': U(6, 2, 4, 1, hr); U(6, 1, 1, 1, hr); U(8, 1, 2, 1, hr); U(7, 0, 1, 1, hr); U(9, 0, 1, 1, hr); break;
    default: break;
  }
  switch (o.hat) {
    case 'cap': U(6, 1, 4, 2, hc); U(10, 2, 2, 1, hc); break;
    case 'beanie': U(6, 1, 4, 2, hc); U(6, 2, 4, 1, sprShade(hc, 0.8)); break;
    case 'beret': U(5, 1, 6, 1, hc); U(6, 2, 4, 1, hc); break;
    case 'helmet': U(5, 1, 6, 3, hc); U(6, 4, 4, 1, '#7d95a6'); break;
    case 'kerchief': U(5, 1, 6, 2, hc); U(5, 3, 1, 3, hc); U(10, 3, 1, 3, hc); U(7, 1, 1, 1, '#fff'); U(9, 2, 1, 1, '#fff'); break;
    case 'ushanka': U(5, 1, 6, 2, hc); U(5, 3, 1, 3, sprShade(hc, 0.8)); U(10, 3, 1, 3, sprShade(hc, 0.8)); break;
    case 'police': U(5, 1, 6, 1, hc); U(6, 2, 4, 1, o.band || '#c22'); U(10, 2, 1, 1, SPR_INK); break;
    default: break;
  }
  // предмет в руке
  switch (o.item) {
    case 'bat': U(12, 3, 1, 7, '#b98b4a'); U(12, 3, 1, 2, '#e0b872'); break;
    case 'bag': for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) U(11 + i, 10 + j, 1, 1, (i + j) % 2 ? '#e8e8f0' : j % 2 ? '#c8372d' : '#2a5fc0'); break;
    case 'guitar': U(9, 8, 3, 3, '#b3261e'); U(10, 9, 1, 1, '#f2d9a0'); U(12, 7, 1, 1, '#8a5a2a'); U(13, 6, 1, 1, '#8a5a2a'); U(14, 5, 1, 1, '#8a5a2a'); break;
    case 'baton': U(12, 5, 1, 6, '#0e0e14'); break;
    case 'shield': U(11, 5, 4, 7, '#8fa8b8'); U(11, 5, 4, 1, '#c3d3dd'); U(12, 7, 2, 1, '#4f6676'); break;
    case 'orb': U(12, 7, 3, 3, '#6ef0ff'); U(13, 8, 1, 1, '#fff'); U(13, 6, 1, 1, '#b8fbff'); break;
    case 'cart': U(12, 9, 3, 4, '#a8433a'); U(12, 9, 3, 1, '#d0766b'); U(13, 8, 1, 1, '#8ac06a'); sprRect(g, 12, 14, 1, 1, '#222'); sprRect(g, 14, 14, 1, 1, '#222'); break;
    case 'gloves': U(3 - w, 9, 2, 2, '#d2262e'); U(11 + w, 9, 2, 2, '#d2262e'); break;
    case 'bottle': U(12, 8, 1, 3, '#3aa860'); U(12, 7, 1, 1, '#ddd'); break;
    case 'papers': U(11, 8, 3, 3, '#f4f4f4'); U(12, 9, 1, 1, '#8a8fb0'); break;
    default: break;
  }
  return g;
}

// ---------- техника и звери ----------
const SPR_CUSTOM = {
  champ(g, b) { // чёрная «бэха»
    const y = b ? 1 : 0, K = '#1c1c24';
    sprRect(g, 1, 9 - y, 14, 4, K); sprRect(g, 4, 6 - y, 7, 3, K); sprRect(g, 1, 9 - y, 14, 1, '#34343f');
    sprRect(g, 5, 7 - y, 2, 2, '#8cc8e8'); sprRect(g, 8, 7 - y, 2, 2, '#8cc8e8');
    sprRect(g, 14, 10 - y, 1, 1, '#ffe27a'); sprRect(g, 1, 10 - y, 1, 1, '#e33'); sprRect(g, 14, 11 - y, 1, 1, '#9a9aa6');
    sprRect(g, 3, 12, 3, 3, '#0d0d12'); sprRect(g, 4, 13, 1, 1, '#b0b0b8'); sprRect(g, 10, 12, 3, 3, '#0d0d12'); sprRect(g, 11, 13, 1, 1, '#b0b0b8');
  },
  fura(g, b) { // фура
    const y = b ? 1 : 0;
    sprRect(g, 1, 4 - y, 9, 8, '#e8e8e0'); sprRect(g, 1, 7 - y, 9, 1, '#2a6fd0'); sprRect(g, 1, 11 - y, 9, 1, '#b8b8b0');
    sprRect(g, 10, 6 - y, 5, 6, '#c0392b'); sprRect(g, 12, 7 - y, 2, 2, '#8cc8e8'); sprRect(g, 14, 10 - y, 1, 1, '#ffe27a'); sprRect(g, 10, 11 - y, 5, 1, '#8a281e');
    for (const x of [2, 6, 11]) { sprRect(g, x, 12, 3, 3, '#0d0d12'); sprRect(g, x + 1, 13, 1, 1, '#b0b0b8'); }
  },
  biker(g, b) { // байкер на мотоцикле
    const y = b ? 1 : 0, S = '#f2c49b';
    sprRect(g, 1, 11, 4, 4, '#0d0d12'); sprRect(g, 2, 12, 2, 2, '#9a9aa6'); sprRect(g, 11, 11, 4, 4, '#0d0d12'); sprRect(g, 12, 12, 2, 2, '#9a9aa6');
    sprRect(g, 4, 10 - y, 8, 2, '#4a4a55'); sprRect(g, 6, 9 - y, 3, 1, '#c0392b'); sprRect(g, 1, 10 - y, 3, 1, '#c8c8d0');
    sprRect(g, 5, 5 - y, 4, 5, '#19191f'); sprRect(g, 9, 6 - y, 1, 1, '#19191f'); sprRect(g, 10, 7 - y, 2, 1, '#19191f'); sprRect(g, 12, 6 - y, 1, 3, '#c8c8d0');
    sprRect(g, 6, 2 - y, 3, 3, S); sprRect(g, 6, 1 - y, 3, 1, '#c0392b'); sprRect(g, 5, 2 - y, 1, 2, '#c0392b'); sprRect(g, 8, 3 - y, 1, 1, SPR_INK); sprRect(g, 6, 4 - y, 3, 1, '#6b4a2a');
  },
  rat(g, b) {
    const y = b ? 1 : 0, C = '#8a7f78';
    sprRect(g, 4, 10 - y, 7, 3, C); sprRect(g, 5, 9 - y, 5, 1, C); sprRect(g, 10, 9 - y, 3, 3, C); sprRect(g, 13, 11 - y, 1, 1, '#e79ab0');
    sprRect(g, 10, 8 - y, 1, 1, '#e79ab0'); sprRect(g, 12, 10 - y, 1, 1, SPR_INK);
    sprRect(g, 3, 11 - y, 1, 1, '#e79ab0'); sprRect(g, 2, 10 - y, 1, 1, '#e79ab0'); sprRect(g, 1, 10 - y, 1, 1, '#e79ab0');
    sprRect(g, 5, 13 - y, 1, 1, '#5d5550'); sprRect(g, 9, 13 - y, 1, 1, '#5d5550');
  },
  dog(g, b) {
    const y = b ? 1 : 0, C = '#b07a3c';
    sprRect(g, 3, 8, 8, 4, C); sprRect(g, 4, 9, 3, 2, '#8f5f28'); sprRect(g, 10, 5 - y, 4, 4, C); sprRect(g, 10, 4 - y, 2, 1, '#6e4518');
    sprRect(g, 13, 7 - y, 2, 2, '#d1a56e'); sprRect(g, 14, 7 - y, 1, 1, SPR_INK); sprRect(g, 12, 6 - y, 1, 1, SPR_INK);
    sprRect(g, 3, 12, 2, 3, C); sprRect(g, 9, 12, 2, 3, C); sprRect(g, 2, 6 + y, 1, 3, C);
  },
};

const SPR_HUMANS = {
  // Качалка
  shpana: { hair: 'short', hairCol: '#6b4a2a', top: '#3f6fb5', pants: '#5a6072', shoe: '#c8372d' },
  gop: { hat: 'cap', hatCol: '#2b2b33', top: '#17171d', pants: '#17171d', stripe: '#f4f4f4', shoe: '#e8e8e8', item: 'bat' },
  boxer: { hair: 'short', hairCol: '#22201c', top: '#f2c49b', pants: '#c8262e', shorts: true, item: 'gloves', shoe: '#f4f4f4' },
  byk: { fat: true, top: '#8e1b3a', pants: '#18181e', chain: true, shoe: '#0e0e12', skin: '#eab58c' },
  // Рынок
  chelnok: { hat: 'beanie', hatCol: '#d08a2a', top: '#2e8b57', pants: '#4a4a6a', item: 'bag' },
  babka: { hat: 'kerchief', hatCol: '#c8372d', top: '#7a6a8a', coat: true, pants: '#5a4a44', item: 'cart', skin: '#eac9a8' },
  chop: { hat: 'beret', hatCol: '#0e0e14', top: '#252833', pants: '#252833', item: 'baton', badge: '#ffd21a', shoe: '#0e0e12' },
  buh: { hair: 'bun', hairCol: '#8a4a2a', glasses: '#3a2a4a', top: '#8a5a9a', pants: '#3f3f4a', shirt: '#f4f4f4', item: 'papers' },
  // Неформалы
  punk: { hair: 'mohawk', hairCol: '#3fdc4a', top: '#19191f', pants: '#b23a3a', print: '#c8c8d0', shoe: '#0e0e12' },
  metal: { hair: 'long', hairCol: '#15131a', top: '#15131a', print: '#e0e0e0', pants: '#2a3350', item: 'guitar' },
  raver: { hair: 'spiky', hairCol: '#ffe23a', glasses: '#15151a', top: '#b6ff3a', pants: '#ff7a1a', stripe: '#fff', shoe: '#f4f4f4' },
  ekstra: { hair: 'long', hairCol: '#dcdce4', beard: '#dcdce4', robe: true, top: '#5b2d91', item: 'orb' },
  // Улицы
  bomzh: { hat: 'ushanka', hatCol: '#7a6650', beard: '#8a8580', top: '#6b5a3a', pants: '#4a4038', item: 'bottle', shoe: '#333' },
  patrol: { hat: 'police', hatCol: '#5d6b7a', band: '#c8262e', top: '#5d6b7a', pants: '#4a5663', item: 'baton', badge: '#ffd21a' },
  omon: { hat: 'helmet', hatCol: '#15171c', top: '#3f5063', camo: '#2a3642', pants: '#3f5063', item: 'shield', shoe: '#0e0e12' },
};

function buildSprites() {
  const put = (id, make) => {
    const frames = [0, 1].map(b => sprCanvas(sprOutline(make(b))));
    const big = document.createElement('canvas'); big.width = big.height = 64;
    const x = big.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(frames[0], 0, 0, 64, 64);
    SPRITES[id] = { frames, url: big.toDataURL() };
  };
  for (const id in SPR_HUMANS) put(id, b => sprHuman(SPR_HUMANS[id], b));
  for (const id in SPR_CUSTOM) put(id, b => { const g = sprGrid(); SPR_CUSTOM[id](g, b); return g; });
}
try { buildSprites(); } catch (e) { console.warn('Спрайты не собрались', e); }

// Рисует спрайт с центром в (cx, cy). Возвращает false, если такого спрайта нет.
function drawSprite(c, id, cx, cy, size, phase) {
  const s = SPRITES[id]; if (!s) return false;
  const f = s.frames[Math.floor(performance.now() / 420 + (phase || 0)) % 2], sm = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(f, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  c.imageSmoothingEnabled = sm;
  return true;
}
// Значок бойца для HTML
function unitIcon(u, size) { const s = SPRITES[u]; return s ? `<img class="spr" src="${s.url}" width="${size}" height="${size}" alt="">` : ''; }
