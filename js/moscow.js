'use strict';
// Карта «Москва 90-х»: настоящая география, сжатая «рыбьим глазом» — центр растянут, окраины поджаты,
// как на туристических схемах. Все объекты заданы широтой и долготой и пересчитываются в клетки под любой размер карты.
// Реки и леса непроходимы, через реку — только по мостам (там, где её пересекает дорога).

const MSK = { lat0: 55.752, lon0: 37.617, R0: 19, gamma: 0.5 }; // центр — Кремль; R0 — «радиус МКАД» в км
const mskRt = () => MW / 2 - 4.5;                                   // радиус МКАД в клетках
// (широта, долгота) → координаты на карте в клетках (дробные). minR — не ближе стольких клеток к Кремлю
function mskXY(lat, lon, minR) {
  const dx = (lon - MSK.lon0) * 62.6, dy = (MSK.lat0 - lat) * 111.2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  let rt = mskRt() * Math.pow(r / MSK.R0, MSK.gamma);
  if (minR && rt < minR) rt = minR;
  return [MCX + rt * Math.cos(a), MCY + rt * Math.sin(a)];
}
const mskTile = (lat, lon, minR) => { const [x, y] = mskXY(lat, lon, minR); return [Math.floor(x), Math.floor(y)]; };

// МКАД по часовой стрелке с севера
const MSK_MKAD = [[55.911, 37.585], [55.895, 37.67], [55.88, 37.725], [55.83, 37.83], [55.775, 37.843], [55.72, 37.84], [55.69, 37.83], [55.655, 37.84], [55.62, 37.8], [55.59, 37.73], [55.575, 37.66], [55.573, 37.6], [55.59, 37.51], [55.61, 37.49], [55.64, 37.435], [55.685, 37.415], [55.715, 37.385], [55.765, 37.368], [55.81, 37.39], [55.845, 37.395], [55.88, 37.445], [55.905, 37.53]];
const MSK_RIVERS = [
  { name: 'Москва-река', pts: [[55.775, 37.3], [55.785, 37.36], [55.805, 37.41], [55.782, 37.445], [55.765, 37.47], [55.75, 37.5], [55.757, 37.53], [55.752, 37.555], [55.742, 37.572], [55.73, 37.56], [55.72, 37.535], [55.708, 37.55], [55.712, 37.575], [55.728, 37.598], [55.737, 37.602], [55.7445, 37.617], [55.746, 37.64], [55.738, 37.65], [55.727, 37.655], [55.715, 37.65], [55.703, 37.648], [55.692, 37.635], [55.682, 37.655], [55.676, 37.675], [55.666, 37.69], [55.655, 37.705], [55.66, 37.735], [55.648, 37.765], [55.636, 37.79], [55.622, 37.815], [55.6, 37.87], [55.585, 37.93]] },
  { name: 'Яуза', pts: [[55.9, 37.7], [55.87, 37.68], [55.84, 37.662], [55.812, 37.685], [55.795, 37.695], [55.78, 37.702], [55.765, 37.69], [55.756, 37.668], [55.748, 37.648]] },
];
// Шоссе и проспекты: от Садового кольца к МКАДу и дальше
const MSK_ROADS = [
  { name: 'Ленинградка', pts: [[55.77, 37.595], [55.805, 37.515], [55.855, 37.475], [55.892, 37.44], [55.915, 37.41]] },
  { name: 'Волоколамка', pts: [[55.805, 37.515], [55.825, 37.445], [55.835, 37.395], [55.85, 37.36]] },
  { name: 'Дмитровка', pts: [[55.774, 37.6], [55.795, 37.588], [55.84, 37.57], [55.905, 37.54]] },
  { name: 'Алтуфьевка', pts: [[55.84, 37.57], [55.875, 37.59], [55.91, 37.587]] },
  { name: 'пр. Мира', pts: [[55.775, 37.632], [55.822, 37.64], [55.862, 37.695], [55.885, 37.725]] },
  { name: '', pts: [[55.845, 37.665], [55.885, 37.66]] },
  { name: 'Щёлковка', pts: [[55.768, 37.655], [55.795, 37.715], [55.805, 37.76], [55.81, 37.84]] },
  { name: 'ш. Энтузиастов', pts: [[55.752, 37.662], [55.758, 37.75], [55.775, 37.843]] },
  { name: 'Рязанка', pts: [[55.736, 37.666], [55.72, 37.76], [55.7, 37.84], [55.68, 37.89]] },
  { name: 'Варшавка', pts: [[55.728, 37.623], [55.68, 37.62], [55.62, 37.605], [55.575, 37.6], [55.548, 37.585]] },
  { name: 'Каширка', pts: [[55.68, 37.62], [55.65, 37.665], [55.61, 37.705], [55.59, 37.727]] },
  { name: 'Ленинский', pts: [[55.729, 37.607], [55.69, 37.54], [55.66, 37.49], [55.635, 37.445]] },
  { name: 'Боровское ш.', pts: [[55.69, 37.54], [55.668, 37.45], [55.648, 37.395]] },
  { name: 'Кутузовский', pts: [[55.75, 37.585], [55.74, 37.53], [55.725, 37.44], [55.715, 37.385]] },
];
// Парки: широта, долгота, радиус в км
const MSK_PARKS = [['Сокольники', 55.8, 37.675, 1.2], ['Лосиный остров', 55.855, 37.79, 2.4], ['Измайловский парк', 55.772, 37.775, 1.6], ['Кусково', 55.735, 37.81, 1], ['Кузьминки', 55.69, 37.785, 1.3], ['Царицыно', 55.615, 37.68, 1.1], ['Битцевский лес', 55.6, 37.555, 2], ['Коломенское', 55.667, 37.668, 0.8], ['Воробьёвы горы', 55.708, 37.545, 0.8], ['Нескучный сад', 55.722, 37.588, 0.6], ['Фили', 55.745, 37.47, 1], ['Серебряный бор', 55.782, 37.43, 0.9], ['Тимирязевский лес', 55.82, 37.55, 1.2], ['Ботанический сад', 55.842, 37.6, 1.1], ['Тропарёво', 55.64, 37.49, 1]];
// Районы — города на карте. Часть достаётся игрокам, остальные ничьи. bearing — где район относительно Кремля (для подписи)
const MSK_TOWNS = [
  { id: 'tush', name: 'Тушино', lat: 55.835, lon: 37.43 }, { id: 'kopt', name: 'Коптево', lat: 55.832, lon: 37.525 },
  { id: 'medv', name: 'Медведково', lat: 55.885, lon: 37.66 }, { id: 'izm', name: 'Измайлово', lat: 55.79, lon: 37.785 },
  { id: 'lyub', name: 'Люберцы', lat: 55.68, lon: 37.89 }, { id: 'oreh', name: 'Орехово', lat: 55.61, lon: 37.7 },
  { id: 'soln', name: 'Солнцево', lat: 55.648, lon: 37.395 }, { id: 'kunt', name: 'Кунцево', lat: 55.728, lon: 37.425 },
];
const MSK_STARTS = { 2: ['kopt', 'oreh'], 3: ['kopt', 'lyub', 'soln'], 4: ['tush', 'izm', 'oreh', 'soln'], 5: ['tush', 'medv', 'izm', 'oreh', 'soln'], 6: ['tush', 'medv', 'izm', 'lyub', 'oreh', 'soln'] };
// Знаменитые точки. t — тип объекта игры, g — уровень охраны
const MSK_POI = [
  { t: 'mine', kind: 'gold', amt: 900, nm: 'Лужники: вещевой рынок', sp: 'stadium', lat: 55.716, lon: 37.555, g: 3 },
  { t: 'mine', kind: 'gold', amt: 800, nm: 'Черкизон', sp: 'stall', lat: 55.8, lon: 37.745, g: 3 },
  { t: 'mine', kind: 'gold', amt: 600, nm: 'Горбушка', sp: 'disc', lat: 55.741, lon: 37.502, g: 2 },
  { t: 'mine', kind: 'gold', amt: 600, nm: 'Рижский рынок', sp: 'stall', lat: 55.793, lon: 37.636, g: 2 },
  { t: 'mine', kind: 'gold', amt: 700, nm: 'ВДНХ: ярмарка', sp: 'rocket', lat: 55.83, lon: 37.628, g: 2 },
  { t: 'mine', kind: 'gold', amt: 600, nm: 'Митинский радиорынок', sp: 'radio', lat: 55.852, lon: 37.36, g: 2 },
  { t: 'mine', kind: 'fuel', amt: 3, nm: 'Южный порт: авторынок', sp: 'champ', lat: 55.705, lon: 37.69, g: 2 },
  { t: 'mine', kind: 'fuel', amt: 4, nm: 'Капотня: нефтезавод', sp: 'refinery', lat: 55.638, lon: 37.8, g: 3 },
  { t: 'mine', kind: 'brick', amt: 3, nm: 'Стройка храма Христа Спасителя', sp: 'church', lb: 'Стройка храма', lat: 55.7447, lon: 37.6055, g: 2 },
  { t: 'mine', kind: 'brick', amt: 3, nm: 'Завод ЗИЛ', sp: 'factory', lat: 55.7, lon: 37.635, g: 2 },
  { t: 'bonus', kind: 'mp', nm: 'Макдоналдс на Пушкинской', sp: 'burger', lb: 'Макдоналдс', txt: 'Отстояли очередь и взяли биг-мак: +40 к ходу сегодня.', lat: 55.765, lon: 37.605 },
  { t: 'bonus', kind: 'pow', nm: 'Останкино', sp: 'tower', txt: 'Засветились в телевизоре: +1 к понтам.', lat: 55.8197, lon: 37.6117, g: 2 },
  { t: 'bonus', kind: 'xp', nm: 'МГУ', sp: 'msu', txt: 'Послушали лекцию про рыночную экономику: +1000 опыта.', lat: 55.703, lon: 37.53, g: 1 },
  { t: 'bonus', kind: 'att', nm: 'Стадион «Динамо»', sp: 'stadium', txt: 'Помахались с фанатами после матча: +1 к атаке.', lat: 55.791, lon: 37.56, g: 1 },
  { t: 'bonus', kind: 'def', nm: 'Бутырка', sp: 'prison', txt: 'Переночевали в Бутырке и вышли закалёнными: +1 к защите.', lat: 55.784, lon: 37.598 },
  { t: 'bonus', kind: 'pow', nm: 'Стена Цоя на Арбате', sp: 'wall', lb: 'Стена Цоя', txt: 'Постояли у стены Цоя. Перемен требуют наши сердца: +1 к понтам.', lat: 55.7497, lon: 37.592 },
  { t: 'bonus', kind: 'xp', nm: 'Белый дом', sp: 'whitehouse', txt: 'Вспомнили октябрь девяносто третьего: +1000 опыта.', lat: 55.7549, lon: 37.5735, g: 2 },
  { t: 'bonus', kind: 'def', nm: 'Петровка, 38', sp: 'police', txt: 'Договорились с МУРом: +1 к защите.', lat: 55.769, lon: 37.615, g: 2 },
  { t: 'bonus', kind: 'att', nm: 'Тушинский аэродром', sp: 'amp', lb: 'Аэродром', txt: 'Побывали на «Монстрах рока»: +1 к атаке.', lat: 55.818, lon: 37.425 },
  { t: 'bonus', kind: 'mp', nm: 'Три вокзала', sp: 'train', txt: 'Знакомый проводник подбросил: +40 к ходу сегодня.', lat: 55.776, lon: 37.656 },
  { t: 'bonus', kind: 'mp', nm: 'Парк Горького', sp: 'wheel', txt: 'Прокатились на американских горках: +40 к ходу сегодня.', lat: 55.729, lon: 37.601 },
  { t: 'chest', nm: 'Казино «Метелица»', sp: 'casino', lb: '«Метелица»', lat: 55.752, lon: 37.586, g: 2 },
  { t: 'chest', nm: 'ГУМ', sp: 'mall', lat: 55.7546, lon: 37.6215, g: 1 },
  { t: 'chest', nm: 'Гостиница «Севастополь»', sp: 'hotel', lb: '«Севастополь»', lat: 55.65, lon: 37.59, g: 2 },
  { t: 'art', nm: 'Гостиница «Космос»', lb: '«Космос»', lat: 55.822, lon: 37.647, g: 3 },
  { t: 'art', nm: 'Измайловский вернисаж', lb: 'Вернисаж', lat: 55.789, lon: 37.75, g: 3 },
  { t: 'art', nm: 'Дворец в Царицыне', lb: 'Дворец', lat: 55.616, lon: 37.683, g: 3 },
  { t: 'art', nm: 'Поклонная гора', lat: 55.731, lon: 37.507, g: 2 },
];

// ---------- местность ----------
function mskLine(tiles, pts, t, minR) { // прочертить ломаную клетками типа t
  let p = null;
  for (const [lat, lon] of pts) {
    const q = mskXY(lat, lon, minR);
    if (p) { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 4); for (let i = 0; i <= n; i++) { const x = Math.floor(p[0] + (q[0] - p[0]) * i / n), y = Math.floor(p[1] + (q[1] - p[1]) * i / n); if (inMap(x, y)) tiles[y * MW + x] = t; } }
    p = q;
  }
}
function mskInside(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const mskKm = km => mskRt() * Math.pow(km / MSK.R0, MSK.gamma); // расстояние от Кремля в км → в клетках

function mskTerrain(seed) {
  const tiles = new Array(MW * MH).fill(T.FOREST), poly = MSK_MKAD.map(([a, b]) => mskXY(a, b));
  const disc = (cx, cy, r, f) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (inMap(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) f(x, y); };
  // город внутри МКАД: дворы, кварталы панелек
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!mskInside(poly, x + 0.5, y + 0.5)) continue;
    const n1 = vnoise(x * 0.55, y * 0.55, seed), n2 = vnoise(x * 0.3 + 40, y * 0.3, seed + 7);
    tiles[y * MW + x] = n1 > 0.66 ? T.BLOCK : n2 > 0.72 ? T.PARK : T.GROUND;
  }
  // пригороды и всё, что за МКАДом: поляна вокруг
  const outside = [...MSK_TOWNS, ...MSK_POI].filter(p => !mskInside(poly, ...mskXY(p.lat, p.lon)));
  for (const p of outside) disc(...mskXY(p.lat, p.lon), 2.7, (x, y) => { tiles[y * MW + x] = vnoise(x * 0.7, y * 0.7, seed + 3) > 0.74 ? T.BLOCK : T.GROUND; });
  for (const [, lat, lon, km] of MSK_PARKS) {
    const c = mskXY(lat, lon), e = mskXY(lat, lon + km / 62.6), r = Math.max(1.3, Math.hypot(e[0] - c[0], e[1] - c[1]));
    disc(c[0], c[1], r, (x, y) => { tiles[y * MW + x] = T.PARK; });
  }
  for (const r of MSK_RIVERS) mskLine(tiles, r.pts, T.WATER, 5.6);
  // дороги: МКАД, Садовое кольцо, шоссе. Там, где дорога пересекает реку, получается мост
  mskLine(tiles, [...MSK_MKAD, MSK_MKAD[0]], T.ROAD);
  const sad = mskKm(2.4);
  for (let a = 0; a < 720; a++) { const x = Math.floor(MCX + sad * Math.cos(a * Math.PI / 360)), y = Math.floor(MCY + sad * Math.sin(a * Math.PI / 360)); tiles[y * MW + x] = T.ROAD; }
  for (const r of MSK_ROADS) mskLine(tiles, r.pts, T.ROAD, sad);
  // Кремль: площадь, стена, четверо ворот и дороги от них к Садовому
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const dx = x + 0.5 - MCX, dy = y + 0.5 - MCY, r = Math.hypot(dx, dy);
    if (r > sad + 0.5) continue;
    const gate = Math.abs(dx) < 0.62 || Math.abs(dy) < 0.62;
    if (r < 2.85) tiles[y * MW + x] = T.ROAD;
    else if (r < 4.1) tiles[y * MW + x] = gate ? T.ROAD : T.WALL;
    else if (gate) tiles[y * MW + x] = T.ROAD;
    else if (tiles[y * MW + x] === T.BLOCK && r < 5.2) tiles[y * MW + x] = T.GROUND;
  }
  return tiles;
}
// Довести клетку до дорожной сети: если от неё нельзя дойти до Кремля, прокладываем просеку к ближайшей доступной клетке
function mskConnect(x, y) {
  const reach = floodFrom(MCX, MCY);
  if (reach[y * MW + x]) return;
  const prev = new Int32Array(MW * MH).fill(-1), q = [y * MW + x]; prev[q[0]] = q[0];
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % MW, cy = (c / MW) | 0;
    if (reach[c]) { for (let k = c; k !== q[0]; k = prev[k]) if (!passT(G.tiles[k])) G.tiles[k] = G.tiles[k] === T.WATER ? T.ROAD : T.GROUND; if (!passT(G.tiles[q[0]])) G.tiles[q[0]] = T.GROUND; return; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, i = ny * MW + nx; if (inMap(nx, ny) && prev[i] < 0 && G.tiles[i] !== T.WALL) { prev[i] = c; q.push(i); } }
  }
}

// ---------- объекты ----------
// MB — помощники генератора из genMap: free, add, guard
function genMoscow(cfg, MB) {
  const n = cfg.players.length;
  // сначала гарантируем, что до всех районов и точек можно дойти
  for (const p of [...MSK_TOWNS, ...MSK_POI]) { const [x, y] = mskTile(p.lat, p.lon, 6.2); if (inMap(x, y)) { if (!passT(G.tiles[y * MW + x])) G.tiles[y * MW + x] = T.GROUND; mskConnect(x, y); } }
  // районы: кому-то достаются игрокам (в случайном порядке), остальные ничьи
  const starts = (MSK_STARTS[n] || MSK_STARTS[6]).slice().sort(() => Math.random() - 0.5), towns = [];
  MSK_TOWNS.forEach((d, i) => {
    const pi = starts.indexOf(d.id), pl = pi >= 0 ? G.players[pi] : null;
    const t = MB.add(newTown(pl ? pl.fac : FAC_IDS[i % FAC_IDS.length], pl ? pi : -1), ...mskTile(d.lat, d.lon));
    if (!t) return;
    t.name = d.name; t.dist = d.id;
    if (!pl) t.garrison = mobArmy(3);
    towns.push(t);
  });
  // знаменитые точки
  for (const p of MSK_POI) {
    const o = { t: p.t, nm: p.nm };
    if (p.t === 'mine') { o.kind = p.kind; o.amt = p.amt; o.owner = -1; }
    if (p.t === 'bonus') { o.kind = p.kind; o.txt = p.txt; o.seen = []; }
    if (p.t === 'art') o.art = pick(ART_POOL);
    if (p.lb) o.lb = p.lb;
    if (p.sp) o.sp = p.sp;
    const put = MB.add(o, ...mskTile(p.lat, p.lon, 6.2));
    if (put && p.g) MB.guard(put, p.g);
  }
  // вокруг каждого района — свой набор добра: считаем шаги от города и раскладываем по кольцам, чтобы всем досталось поровну
  for (const t of towns) {
    const dist = new Int16Array(MW * MH).fill(-1), q = [t.y * MW + t.x]; dist[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi], cx = c % MW, cy = (c / MW) | 0; if (dist[c] >= 16) continue; for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy, i = ny * MW + nx; if (inMap(nx, ny) && dist[i] < 0 && passT(G.tiles[i])) { dist[i] = dist[c] + 1; q.push(i); } } }
    const lonely = (x, y) => !G.objs.some(o => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 1);
    const place = (o, a, b, lvl) => {
      for (let wide = 0; wide <= 6; wide += 3) {
        const c = []; for (let i = 0; i < dist.length; i++) if (dist[i] >= a && dist[i] <= b + wide && G.tiles[i] !== T.ROAD && lonely(i % MW, (i / MW) | 0)) c.push(i);
        if (!c.length) continue;
        const i = pick(c), put = MB.add(o, i % MW, (i / MW) | 0);
        if (put && lvl) MB.guard(put, lvl);
        return put;
      }
      return null;
    };
    const mine = kind => ({ t: 'mine', kind, owner: -1 }), bonus = kind => ({ t: 'bonus', kind, seen: [] });
    if (t.owner < 0) { place({ t: 'pile', res: 'gold', amt: 1000 }, 2, 4); place({ t: 'pile', res: pick(['fuel', 'brick']), amt: 4 }, 2, 5); place(mine(pick(['gold', 'fuel', 'brick'])), 3, 5, 2); continue; }
    place(mine('gold'), 3, 5); place(mine('fuel'), 3, 6); place(mine('brick'), 4, 7);
    place(mine('gold'), 8, 11, 2); place(mine('brick'), 8, 11, 2); place(mine('fuel'), 9, 12, 2);
    for (const [a, b, res, amt] of [[2, 4, 'gold', 1000], [4, 7, 'gold', 750], [4, 7, 'fuel', 3], [5, 8, 'brick', 4], [6, 9, 'gold', 1000], [7, 10, 'brick', 5], [10, 13, 'gold', 2000]]) place({ t: 'pile', res, amt }, a, b);
    place({ t: 'chest' }, 3, 6); place({ t: 'chest' }, 6, 9, 1); place({ t: 'chest' }, 10, 13, 3);
    place(bonus('att'), 6, 9); place(bonus('def'), 7, 10); place(bonus('mp'), 5, 8);
    place(bonus('pow'), 9, 12, 2); place(bonus('xp'), 9, 12, 2);
    place({ t: 'art', art: pick(ART_POOL) }, 10, 13, 3); place({ t: 'art', art: pick(ART_POOL) }, 8, 11, 2);
    place({ t: 'mob', army: mobArmy(1), lvl: 1 }, 5, 7); place({ t: 'mob', army: mobArmy(2), lvl: 2 }, 9, 12); place({ t: 'mob', army: mobArmy(3), lvl: 3 }, 11, 14);
  }
  // стража у четырёх кремлёвских ворот
  for (const [dx, dy] of [[0, -5.5], [5.5, 0], [0, 5.5], [-5.5, 0]]) MB.add({ t: 'mob', army: mobArmy(4), lvl: 4 }, Math.floor(MCX + dx - (dx > 0 ? 1 : 0)), Math.floor(MCY + dy - (dy > 0 ? 1 : 0)));
}

// Подписи для отрисовки: улицы (с углом наклона), парки, реки
function mskLabels() {
  const out = [];
  for (const r of MSK_ROADS) {
    if (!r.name) continue;
    const k = Math.max(1, Math.floor(r.pts.length / 2)), a = mskXY(...r.pts[k - 1], mskKm(2.4)), b = mskXY(...r.pts[k]);
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    out.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, text: r.name, ang, kind: 'road' });
  }
  for (const [name, lat, lon] of MSK_PARKS) { const [x, y] = mskXY(lat, lon); out.push({ x, y, text: name, ang: 0, kind: 'park' }); }
  { const a = mskXY(55.708, 37.55, 5.6); out.push({ x: a[0], y: a[1] + 0.9, text: 'Москва-река', ang: 0, kind: 'water' }); }
  { const a = mskXY(55.812, 37.685); out.push({ x: a[0] + 1.2, y: a[1], text: 'Яуза', ang: 0, kind: 'water' }); }
  out.push({ x: MCX, y: MCY - mskKm(2.4) - 0.75, text: 'Садовое кольцо', ang: 0, kind: 'road' });
  { const a = mskXY(55.911, 37.585); out.push({ x: a[0], y: a[1] - 0.75, text: 'МКАД', ang: 0, kind: 'road' }); }
  return out;
}
