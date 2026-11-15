'use strict';
// Пиксельные значки 16×16 для всего, что раньше было эмодзи: города, точки на карте, ресурсы, артефакты, деревья,
// препятствия в бою и герои. Значки заданы «картой символов»: буква — цвет из палитры ниже, точка — пусто.
// Контур дорисовывается сам. Короткие картинки прижимаются к низу клетки, как здания к земле.

const ICON_PAL = {
  k: '#1a1320', w: '#f4f4f4', g: '#c8c8d0', G: '#8a8a96', d: '#4a4a55', D: '#2b2b33',
  r: '#c8372d', R: '#8e1b1b', M: '#8e1b3a', o: '#f08a2c', y: '#ffd21a', Y: '#c79a12',
  b: '#2f7fc4', B: '#1c4f84', c: '#8fdcf5', n: '#4cc552', N: '#2e7d32',
  p: '#8a5a9a', P: '#5b2d91', m: '#e79ab0', t: '#f2c49b', T: '#8a5a2a', u: '#5a3a1a', s: '#d9c7a0',
};
const ICONS = {
  // ---- деревья ----
  tree1: ['.......n', '......nnn', '......nNn', '.....nnnnn', '.....nnNnn', '....nnnnnnn', '....nNnnnNn', '...nnnnnnnnn', '...nnNnnnNnn', '..nnnnnnnnnnn', '..nNnnnNnnnNn', '.......T', '.......T'],
  tree2: ['.....nnnnn', '....nnnnnnn', '...nnnNnnnnn', '..nnnnnnnNnnn', '..nnNnnnnnnnn', '..nnnnnnnnnnn', '..nnnnnNnnnnn', '...nnnnnnnNn', '....nnnnnnn', '......nTn', '.......T', '.......T'],
  // ---- города бригад ----
  t_kach: ['..rrrrrrrrrrrr', '..rRRRRRRRRRRr', '..rwwwwwwwwwwr', '..rwDwDDDDwDwr', '..rwDwDDDDwDwr', '..rwwwwwwwwwwr', '..rrrrrrrrrrrr', '..rcrrcrrrcrrr', '..rcrrcrrrcrrr', '..rrrrrrrrrrrr', '..rrrrrTTrrrrr', '..rrrrrTTrrrrr', '..rrrrrTTrrrrr'],
  t_rynok: ['..rwrwrwrwrwrw', '.rwrwrwrwrwrwrw', '.rwrwrwrwrwrwrw', '.wrwrwrwrwrwrwr', '..d..........d', '..d.yyoonnrr.d', '..d.yyoonnrr.d', '..TTTTTTTTTTTT', '..TuTTTuTTTuTT', '..TTTTTTTTTTTT', '..d..........d', '..d..........d'],
  t_neform: ['..GGGGGGGGGGGG', '..GgGGGGGGGGgG', '..GGnGnGGmGmGG', '..GGnnnGGmmmGG', '..GGGGGGGGGGGG', '..GGDDDDDDDDGG', '..GGDkkkkkkDGG', '..GGDkkyykkDGG', '..GGDkkyykkDGG', '..GGDkkkkkkDGG', '..dddddddddddd', '.dddddddddddddd'],
  // ---- обычные точки ----
  m_gold: ['..bbbbbbbbbbbb', '..bywybywybywb', '..bbbbbbbbbbbb', '..gggggggggggg', '..gcccccccgTTg', '..gcyrnocrgTTg', '..gcccccccgTTg', '..gggggggggTTg', '..gggggggggTTg', '..dddddddddddd'],
  m_fuel: ['.....rrrrrr', '.....rwwwwr', '.....rwddwr..d', '.....rwwwwr.dd', '.....rrrrrr.d', '.....ryyyyr.d', '.....rrrrrrdd', '.....rrrrrr', '.....rrrrrr', '....dddddddd'],
  m_brick: ['..yyyyyyyyyyy', '..y..y....d', '..y.y.....d', '..yy......d', '..y......rrr', '..y......rrr', '..y', '..y...rrrrrr', '..y...rRrrRr', '..y...rrrrrr', '.ddd..rRrrRr', '.ddd..rrrrrr'],
  r_gold: ['...nnnnnnnnnn', '...nNnnwwnnNn', '...nnnwNNwnnn', '...nNnnwwnnNn', '...nnnnnnnnnn', '..nnnnnnnnnn', '..nNnnyynnNn', '..nnnnyynnnn', '..nnnnnnnnnn'],
  r_fuel: ['.....dd', '....rrrrrrr', '...rrrrrrrrr', '...rrRrrrRrr', '...rrrRrRrrr', '...rrrrRrrrr', '...rrrRrRrrr', '...rrRrrrRrr', '...rrrrrrrrr', '...rrrrrrrrr'],
  r_brick: ['......rrrr', '......rRRr', '....rrrr.rrrr', '....rRRr.rRRr', '..rrrr.rrrr.rrrr', '..rRRr.rRRr.rRRr'],
  chest: ['.....dddddd', '....d......d', '...bbbbbbbbbb', '..bbbbbbbbbbbb', '..bbwbbbbbbwbb', '..bbbbyyyybbbb', '..bbbbbbbbbbbb', '..BBBBBBBBBBBB'],
  b_att: ['..DD........DD', '..DD........DD', '.DDDD......DDDD', '.DDDDggggggDDDD', '.DDDDggggggDDDD', '.DDDD......DDDD', '..DD........DD', '..DD........DD'],
  b_def: ['...ww......ww', '..wwww....wwww', '.wwwwww..wwwwww', '.wwgwwwwwwwwgww', '...wwwgwwgwww', '...wwwwggwwww', '...kkkkkkkkkk', '...wwwwwkkwww', '...wwwwwkwwww', '...wwwwwwwwww'],
  b_pow: ['....d......d', '.....d....d', '..TTTTTTTTTTTT', '..TccccccccTyT', '..TcwccccccTdT', '..TccccccccTyT', '..TccccccccTdT', '..TccccccccTTT', '..TTTTTTTTTTTT', '...d........d'],
  b_xp: ['..rrr.bbb.nnn', '..rwr.bwb.nwn', '..rrr.bbb.nnn', '..rrr.bbb.nnn', '..rwr.bwb.nwn', '..rrr.bbb.nnn', '..rrr.bbb.nnn', '.TTTTTTTTTTTTT'],
  b_mp: ['......sssss', '.....snrnsss', '....ssrnrssss', '....sssnrssss', '....wsssssssw', '.....wssssww', '.....wwssww', '......wwww', '......wwww', '.......ww'],
  // ---- артефакты ----
  a_chain: ['....yy....yy', '...y..y..y..y', '...y...yy...y', '...y........y', '....y......y', '.....y....y', '......y..y', '.......yy', '......yYYy', '......yYYy', '.......yy'],
  a_jacket: ['...MMM....MMM', '..MMMMM..MMMMM', '.MMMMMMwwMMMMMM', '.MMMMMMwwMMMMMM', '.MM.MMMwyMMM.MM', '.MM.MMMwwMMM.MM', '.MM.MMMMyMMM.MM', '....MMMMMMMM', '....MMMMyMMM', '....MMMMMMMM'],
  a_leather: ['...DDD....DDD', '..DDDDD..DDDDD', '.DDDDDDggDDDDDD', '.DDDDDDgDDDDDDD', '.DD.DDDgDDDD.DD', '.DD.DDDgDDDD.DD', '.DD.DDDgDDDD.DD', '....DDDgDDDD', '....DDDgDDDD', '....dddddddd'],
  a_phone: ['.........d', '.........d', '....DDDDDD', '....DccccD', '....DccccD', '....DDDDDD', '....DgDgDD', '....DDDDDD', '....DgDgDD', '....DDDDDD', '....DgDgDD', '....DDDDDD'],
  a_suit: ['...bbb....bbb', '..bwbbb..bbbwb', '.bbwbbbbbbbbwbb', '.bbwbbbwwbbbwbb', '.bb.bbbbbbbb.bb', '.bb.bbwbwbwb.bb', '.bb.bbbbbbbb.bb', '....bbbbbbbb', '....bbbbbbbb', '....BBBBBBBB'],
  a_tape: ['.DDDDDDDDDDDDDD', '.DwwwwwwwwwwwwD', '.DwrrwwwwwwwwwD', '.DDDDDDDDDDDDDD', '.DDgggDDDDgggDD', '.DDgDgDDDDgDgDD', '.DDgggDDDDgggDD', '.DDDDDDDDDDDDDD'],
  a_pager: ['...DDDDDDDDDD', '...DnnnnnnnnD', '...DnNnNNnNnD', '...DnnnnnnnnD', '...DDDDDDDDDD', '...DDgDgDgDDD', '...DDDDDDDDDD'],
  a_watch: ['......YYYY', '......YYYY', '.....yyyyyy', '....yywwwwyy', '....ywwkwwwy', '....ywwkkwwy', '....ywwwwwwy', '....yywwwwyy', '.....yyyyyy', '......YYYY', '......YYYY'],
  a_bat: ['............ss', '...........sss', '..........sss', '.........sss', '........sss', '.......sss', '......sss', '.....ss', '....ss', '...TT', '..TT'],
  a_key: ['....yyyy', '...yy..yy', '...y.rr.y', '...y.rr.y', '...yy..yy', '....yyyy', '.....yy', '.....yy', '.....yyyy', '.....yy', '.....yyyy', '.....yy'],
  // ---- знаменитые точки Москвы ----
  stadium: ['....gggggggg', '..gggwwwwwwggg', '.ggwwnnnnnnwwgg', '.gwnnnnwwnnnnwg', '.gwnnnwnnwnnnwg', '.gwnnnnwwnnnnwg', '.ggwwnnnnnnwwgg', '..gggwwwwwwggg', '....gggggggg'],
  stall: ['...bybybybyby', '..bybybybybyby', '..ybybybybybyb', '..d..........d', '..d.rr.nn.oo.d', '..dTTTTTTTTTTd', '..dTTTTTTTTTTd', '..d..........d'],
  disc: ['.....gggggg', '...ggwwccwwgg', '..gwwcccwwwwwg', '..gwccwwwwwmwg', '.gwwcwwDDwwmmwg', '.gwwwwDkkDwwmwg', '.gwmwwDkkDwwwwg', '.gwmmwwDDwwcwwg', '..gwmwwwwwccwg', '..gwwwwwcccwwg', '...ggwwccwwgg', '.....gggggg'],
  radio: ['........d', '.......d', '..DDDDDDDDDDDD', '..DggDrrrrDggD', '..DgDgDwwDgDgD', '..DggDDDDDDggD', '..DgDgDyyDgDgD', '..DggDDDDDDggD', '..DDDDDDDDDDDD'],
  rocket: ['.......ww', '......wwww', '......wrrw', '......wwww', '......wccw', '......wwww', '......wwww', '.....rwwwwr', '....rrwwwwrr', '....r.oyyo.r', '......oyyo', '.......oo'],
  refinery: ['..o', '..oy....d', '..d.....d..ggg', '..d.....d.ggggg', '..d..ggg..ggggg', '..d.ggggg.ggDgg', '..d.ggggg.ggggg', '..d.ggDgg.ggggg', '.dddggggg.ggggg', '.dddddddddddddd'],
  factory: ['...........dd', '..........Gdd', '.........G.dd', '...........rr', '..r..r..r..rr', '.rr.rr.rr..rr', '.rrrrrrrrrrrr', '.rcrrcrrcrrrr', '.rrrrrrrrrrrr', '.rrrrrrDDrrrr', '.rrrrrrDDrrrr'],
  church: ['.......y', '......yyy', '.....yyyyy', '.....yyYyy', '......www', '..y...www...T', '.yyy.wwwww..T.T', '.yYy.wwcww.TTTT', '..w..wwwww..T.T', '.www.wwDww..T.T', '.wwwwwwDwwwTTTT'],
  burger: ['....oooooooo', '...oowoooowoo', '..oooooooooooo', '..nnnnnnnnnnnn', '..RRRRRRRRRRRR', '..yyyyyyyyyyyy', '..oooooooooooo', '...oooooooooo'],
  tower: ['.......r', '.......w', '.......w', '.......g', '......ggg', '......gcg', '......ggg', '.......g', '.......g', '.......g', '......ggg', '......ggg', '.....ggggg', '....ggggggg'],
  msu: ['.......y', '.......s', '.......s', '......sss', '......scs', '.....sssss', '.....scscs', '...s.sssss.s', '..sssscscssss', '..scssssssscs', '..ssssscsssss', '..scsssDssscs'],
  prison: ['.RRRRRRRRRRRRRR', '.RrRRrRRrRRrRRR', '.RRRRRRRRRRRRRR', '.RRkgkgkgkgkRRR', '.RRkgkgkgkgkRRR', '.RRkgkgkgkgkRRR', '.RRkgkgkgkgkRRR', '.RRRRRRRRRRRRRR', '.RrRRrRRDDrRRrR', '.RRRRRRRDDRRRRR'],
  wall: ['.gggggggggggggg', '.gkkgkkkgkgkggg', '.gkggkgkgkkkggg', '.gkkgkkkgkgkggg', '.gggggggggggggg', '.grgrgwwgwgwggg', '.grrrgwggwgwggg', '.grgrgwggwwgggg', '.gggggggggggggg', '.dddddddddddddd'],
  whitehouse: ['.......r', '.......rb', '.......d', '....wwwwwwww', '....wDwDwDww', '....wwwwwwww', '.wwwwwwwwwwwwww', '.wcwcwcwcwcwcww', '.wwwwwwwwwwwwww', '.wcwcwcwcwcwcww', '.wwwwwwwwwwwwww'],
  police: ['.......bb', '....wwwwwwww', '...wwccwwccww', '..wwwwwwwwwwww', '.wbbbbbbbbbbbbw', '.wwwwwwwwwwwwwy', '.wDDwwwwwwwDDww', '..DD.......DD'],
  amp: ['..DDDDDDDDDDDD', '..DggggggggggD', '..DDDDDDDDDDDD', '..DDgggDDgggDD', '..DgDDDggDDDgD', '..DgDkDggDkDgD', '..DgDDDggDDDgD', '..DDgggDDgggDD', '..DDDDDDDDDDDD'],
  train: ['...nnnnnnnnnn', '..nnnnnnnnnnnn', '..nccccnnccccn', '..nccccnnccccn', '..nnnnnnnnnnnn', '..nyyynnnnyyyn', '..nnnnnnnnnnnn', '..nwnnnnnnnnwn', '..rrrrrrrrrrrr', '...dd......dd'],
  wheel: ['.....gggggg', '...gg..g...gg', '..gr...g....bg', '..g.g..g..g..g', '.g...g.g.g....g', '.gggggggggggggg', '.g...g.g.g....g', '..g.g..g..g..g', '..gy...g....ng', '...gg..g...gg', '.....gggggg', '......d..d', '.....d....d'],
  casino: ['..mmmmmmmmmmmm', '..mDDDDDDDDDDm', '..mDrrDrrDrrDm', '..mDDrDDrDDrDm', '..mDDrDDrDDrDm', '..mDDDDDDDDDDm', '..mmmmmmmmmmmm', '..myyyyyyyyyym', '..mmmmmmmmmmmm'],
  mall: ['....cccccccc', '..cccccccccccc', '.ssssssssssssss', '.sDDsDDsDDsDDss', '.sDDsDDsDDsDDss', '.ssssssssssssss', '.sDDsDDsDDsDDss', '.sDDsDDsDDsDDss', '.ssssssssssssss'],
  hotel: ['....rrrrrrrr', '....gggggggg', '....gcgcgcgg', '....gggggggg', '....gcgcgcgg', '....gggggggg', '....gcgcgcgg', '....gggggggg', '....gcgcgcgg', '....gggggggg', '....gggDDggg'],
  // ---- препятствия в бою ----
  o_bin: ['...dddddddddd', '..NNNNNNNNNNNN', '..NnNnNnNnNnNN', '..NnNnNnNnNnNN', '..NnNnNnNnNnNN', '..NnNnNnNnNnNN', '..NNNNNNNNNNNN', '..d..........d'],
  o_barrel: ['....rrrrrrrr', '...rrrrrrrrrr', '...yyyyyyyyyy', '...rrrrrrrrrr', '...rrrkkrrrrr', '...rrrrrrrrrr', '...yyyyyyyyyy', '...rrrrrrrrrr', '....rrrrrrrr'],
  o_crate: ['..TTTTTTTTTTTT', '..TssssssssssT', '..TsTssssssTsT', '..TssTssssTssT', '..TsssTTTTsssT', '..TsssTTTTsssT', '..TssTssssTssT', '..TsTssssssTsT', '..TssssssssssT', '..TTTTTTTTTTTT'],
  o_barrier: ['.rrwwrrwwrrwwrr', '.rwwrrwwrrwwrrw', '.wwrrwwrrwwrrww', '..d..........d', '..d..........d', '.ddd........ddd'],
};
// Герои — тот же манекен, что у бойцов (js/sprites.js), со своей внешностью
const HERO_LOOKS = {
  'Вован Бицепс': { hair: 'short', hairCol: '#22201c', top: '#c8262e', sleeve: '#f2c49b', pants: '#2b2b33', fat: true },
  'Толян Штанга': { hat: 'beanie', hatCol: '#f4f4f4', top: '#2a5fc0', pants: '#2a5fc0', stripe: '#fff', shoe: '#f4f4f4' },
  'Серый': { hair: 'short', hairCol: '#6a6a72', glasses: '#15151a', top: '#19191f', pants: '#3b4a6b', chain: true },
  'Кабан': { fat: true, top: '#4a6b3a', pants: '#2b2b33', chain: true, beard: '#5a3a1a', skin: '#eab58c' },
  'Ашот Барахолкин': { hat: 'cap', hatCol: '#5a4a3a', beard: '#22201c', top: '#8a5a2a', pants: '#3f3f4a', shirt: '#f4f4f4', skin: '#e0a878' },
  'Тётя Зина': { hair: 'bun', hairCol: '#c8372d', top: '#e79ab0', coat: true, pants: '#5a4a44', shirt: '#fff', item: 'bag' },
  'Михалыч': { hat: 'ushanka', hatCol: '#8a7f78', beard: '#c8c8d0', top: '#5d6b4a', pants: '#4a4038' },
  'Жора Обменник': { hair: 'short', hairCol: '#22201c', glasses: '#3a2a4a', top: '#8a8a96', pants: '#8a8a96', shirt: '#f4f4f4', tie: '#c8262e', item: 'papers' },
  'Кот Шаман': { hair: 'long', hairCol: '#5a3a1a', beard: '#5a3a1a', robe: true, top: '#2e8b57', item: 'orb' },
  'Ржавый': { hair: 'mohawk', hairCol: '#f08a2c', top: '#3f6fb5', pants: '#19191f', print: '#fff' },
  'Лиса': { hair: 'long', hairCol: '#f08a2c', top: '#19191f', pants: '#8e1b3a', shoe: '#c8262e' },
  'Дед Металл': { hair: 'long', hairCol: '#c8c8d0', beard: '#c8c8d0', top: '#15131a', print: '#c8262e', pants: '#2a3350', item: 'guitar' },
};

function buildIcons() {
  const big = c => { const b = document.createElement('canvas'); b.width = b.height = 64; const x = b.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 64, 64); return b.toDataURL(); };
  for (const id in ICONS) {
    const rows = ICONS[id], g = sprGrid(), top = Math.max(0, 15 - rows.length); // прижать к низу, оставив строку под контур
    rows.forEach((row, y) => { for (let x = 0; x < Math.min(16, row.length); x++) { const col = ICON_PAL[row[x]]; if (col && top + y < 16) g[(top + y) * 16 + x] = col; } });
    const c = sprCanvas(sprOutline(g));
    SPRITES[id] = { frames: [c, c], url: big(c) };
  }
  for (const name in HERO_LOOKS) {
    const frames = [0, 1].map(b => sprCanvas(sprOutline(sprHuman(HERO_LOOKS[name], b))));
    SPRITES['h_' + name] = { frames, url: big(frames[0]) };
  }
}
try { buildIcons(); } catch (e) { console.warn('Значки не собрались, рисуем эмодзи', e); }

// какой значок у объекта карты
function sprOf(o) {
  if (o.t === 'town') return 't_' + o.fac;
  if (o.t === 'mine') return o.sp || 'm_' + o.kind;
  if (o.t === 'pile') return 'r_' + o.res;
  if (o.t === 'chest') return o.sp || 'chest';
  if (o.t === 'art') return 'a_' + o.art;
  if (o.t === 'bonus') return o.sp || 'b_' + o.kind;
  return '';
}
// значок для HTML: картинка, если есть, иначе запасной текст (эмодзи)
function ico(id, size, fallback) { const s = SPRITES[id]; return s ? `<img class="spr" src="${s.url}" width="${size}" height="${size}" alt="">` : fallback || ''; }
const resIco = (r, size) => ico('r_' + r, size || 18, RES_ICON[r]);
const heroIco = (h, size) => ico('h_' + h.name, size, h.em);
