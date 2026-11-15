'use strict';
// ДЕЛЁЖ — пошаговая стратегия на 2–6 бригад (люди и боты) за одним компьютером. Москва, 90-е.
// Здесь только данные: бригады, отряды, артефакты, здания, понты (заклинания), события недели.

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = id => document.getElementById(id);

const RES = ['gold', 'fuel', 'brick'];
const RES_ICON = { gold: '💵', fuel: '⛽', brick: '🧱' };
const RES_NAME = { gold: 'Бабло', fuel: 'Бензин', brick: 'Кирпич' };
const PCOL = ['#e8343c', '#f5c42c', '#2fb8ea', '#4cc552', '#b97cf5', '#f08a2c'];
const PCOL_NAME = ['Красные', 'Жёлтые', 'Синие', 'Зелёные', 'Фиолетовые', 'Рыжие'];
const MAX_PLAYERS = 6;

// Отряды. att/def — атака/защита, dmg — урон одного бойца, hp — здоровье одного, spd — скорость (клеток за ход в бою),
// grow — прирост в неделю, cost — цена найма. Флаги: shots (стрелок), fly (перелетает), noRet (без ответки), twice (бьёт дважды)
const UNITS = {
  // Качалка: сила и наглость
  shpana: { name: 'Шпана', em: '👦', tier: 1, att: 4, def: 2, dmg: [1, 3], hp: 6, spd: 5, grow: 14, cost: { gold: 50 } },
  gop: { name: 'Гопник', em: '🧢', tier: 2, att: 6, def: 4, dmg: [2, 4], hp: 13, spd: 5, grow: 9, cost: { gold: 110 } },
  boxer: { name: 'Боксёр', em: '🥊', tier: 3, att: 9, def: 6, dmg: [4, 7], hp: 26, spd: 6, grow: 6, cost: { gold: 290 }, twice: true, note: 'бьёт двойкой' },
  byk: { name: 'Бык', em: '🐂', tier: 4, att: 12, def: 12, dmg: [10, 16], hp: 75, spd: 4, grow: 3, cost: { gold: 680, fuel: 1 } },
  champ: { name: 'Чемпион на «бэхе»', em: '🚘', tier: 5, att: 17, def: 13, dmg: [26, 40], hp: 170, spd: 9, grow: 1, cost: { gold: 2200, fuel: 2 }, noRet: true, note: 'таран: без ответки' },
  // Рынок: стрелки и толстые
  chelnok: { name: 'Челнок', em: '🧳', tier: 1, att: 3, def: 2, dmg: [1, 2], hp: 7, spd: 4, grow: 12, cost: { gold: 65 }, shots: 6, note: 'кидает баулы' },
  babka: { name: 'Бабка с тележкой', em: '👵', tier: 2, att: 5, def: 8, dmg: [2, 3], hp: 17, spd: 4, grow: 9, cost: { gold: 100 } },
  chop: { name: 'Охранник ЧОП', em: '💂', tier: 3, att: 8, def: 11, dmg: [4, 6], hp: 32, spd: 5, grow: 6, cost: { gold: 300 } },
  buh: { name: 'Бухгалтер', em: '🧮', tier: 4, att: 12, def: 8, dmg: [8, 14], hp: 48, spd: 5, grow: 3, cost: { gold: 720, fuel: 1 }, shots: 10, note: 'налоговая проверка' },
  fura: { name: 'Фура «Таможня»', em: '🚛', tier: 5, att: 15, def: 19, dmg: [24, 34], hp: 220, spd: 6, grow: 1, cost: { gold: 2200, fuel: 2 } },
  // Неформалы: быстрые и прыгучие
  punk: { name: 'Панк', em: '🤘', tier: 1, att: 5, def: 1, dmg: [2, 3], hp: 6, spd: 6, grow: 14, cost: { gold: 50 } },
  metal: { name: 'Металлист', em: '🎸', tier: 2, att: 6, def: 4, dmg: [2, 5], hp: 12, spd: 5, grow: 9, cost: { gold: 120 }, shots: 8, note: 'звуковая волна' },
  biker: { name: 'Байкер', em: '🏍️', tier: 3, att: 10, def: 6, dmg: [5, 8], hp: 28, spd: 9, grow: 5, cost: { gold: 320 }, noRet: true, note: 'наезд: без ответки' },
  raver: { name: 'Рейвер', em: '🕺', tier: 4, att: 11, def: 9, dmg: [8, 13], hp: 52, spd: 8, grow: 3, cost: { gold: 700, fuel: 1 }, fly: true, note: 'перепрыгивает' },
  ekstra: { name: 'Экстрасенс', em: '🔮', tier: 5, att: 15, def: 14, dmg: [20, 30], hp: 150, spd: 7, grow: 1, cost: { gold: 2200, fuel: 2 }, shots: 12, fly: true, note: 'заряжает на расстоянии' },
  // Нейтралы с улиц
  rat: { name: 'Крысы', em: '🐀', tier: 1, att: 2, def: 2, dmg: [1, 2], hp: 4, spd: 7, grow: 0, cost: { gold: 0 } },
  dog: { name: 'Бродячие собаки', em: '🐕', tier: 2, att: 5, def: 3, dmg: [2, 4], hp: 11, spd: 8, grow: 0, cost: { gold: 0 } },
  bomzh: { name: 'Бомжи', em: '🧔', tier: 2, att: 4, def: 7, dmg: [2, 3], hp: 16, spd: 3, grow: 0, cost: { gold: 0 } },
  patrol: { name: 'Патруль', em: '👮', tier: 3, att: 9, def: 9, dmg: [4, 6], hp: 30, spd: 5, grow: 0, cost: { gold: 0 }, shots: 6 },
  omon: { name: 'Спецназ', em: '🪖', tier: 4, att: 14, def: 14, dmg: [10, 15], hp: 80, spd: 6, grow: 0, cost: { gold: 0 } },
};

const FACTIONS = {
  kach: { name: 'КАЧАЛКА', town: 'Качалка «Олимп»', em: '🏋️', units: ['shpana', 'gop', 'boxer', 'byk', 'champ'], desc: 'Сила и наглость. Лучший ближний бой.',
    heroes: [{ name: 'Вован Бицепс', em: '💪', spec: 'att' }, { name: 'Толян Штанга', em: '🏋️', spec: 'def' }, { name: 'Серый', em: '😎', spec: 'xp' }, { name: 'Кабан', em: '🐗', spec: 'army' }] },
  rynok: { name: 'РЫНОК', town: 'Рынок «Черкизон»', em: '🏪', units: ['chelnok', 'babka', 'chop', 'buh', 'fura'], desc: 'Стрелки и толстокожие. Деньги любят счёт.',
    heroes: [{ name: 'Ашот Барахолкин', em: '🧔', spec: 'gold' }, { name: 'Тётя Зина', em: '👩', spec: 'pow' }, { name: 'Михалыч', em: '👴', spec: 'def' }, { name: 'Жора Обменник', em: '🤑', spec: 'mp' }] },
  neform: { name: 'НЕФОРМАЛЫ', town: 'Подвал «Вечный рок»', em: '🎸', units: ['punk', 'metal', 'biker', 'raver', 'ekstra'], desc: 'Быстрые, прыгучие, непредсказуемые.',
    heroes: [{ name: 'Кот Шаман', em: '🐱', spec: 'pow' }, { name: 'Ржавый', em: '🦊', spec: 'mp' }, { name: 'Лиса', em: '🦹', spec: 'spd' }, { name: 'Дед Металл', em: '🧙', spec: 'att' }] },
};
const FAC_IDS = Object.keys(FACTIONS);

// Фишка героя: с чем он приходит в бригаду. Числа прибавляются к характеристикам героя.
const SPECS = {
  att: { name: 'Жим лёжа', desc: '+2 к атаке', att: 2 },
  def: { name: 'Толстая шкура', desc: '+2 к защите', def: 2 },
  pow: { name: 'Третий глаз', desc: '+2 к понтам', pow: 2 },
  gold: { name: 'Торгаш', desc: '+300 бабла в день', gold: 300 },
  mp: { name: 'Знает дворы', desc: '+20 к ходу на карте', mp: 20 },
  spd: { name: 'Шустрая', desc: '+1 к скорости отрядов в бою', spd: 1 },
  xp: { name: 'Авторитет', desc: '+25% опыта', xp: 1.25 },
  army: { name: 'Толпой веселее', desc: 'в начале в полтора раза больше бойцов', army: 1.5 },
};

// Сложность ботов. income — множитель дохода, edge — во сколько раз бот должен быть сильнее, чтобы лезть в драку «на глаз»,
// sim — прикидывает бой заранее, keep — какую долю армии готов сохранить после драки, slack — как часто ленится,
// peace — до какого дня не трогает чужие бригады (местных бьёт сразу).
const DIFF = [
  { name: 'Лёгкий', em: '🐣', income: 0.75, edge: 2, sim: false, keep: 0.7, spells: false, slack: 0.3, heroes: 1, peace: 15, desc: 'Доход −25%, без понтов, ленится, две недели никого не трогает' },
  { name: 'Обычный', em: '🤖', income: 1, edge: 1.5, sim: true, keep: 0.55, spells: true, slack: 0, heroes: 2, peace: 10, desc: 'Играет по тем же правилам, что и вы' },
  { name: 'Злой', em: '😈', income: 1.25, edge: 1.3, sim: true, keep: 0.35, spells: true, slack: 0, heroes: 3, peace: 7, desc: 'Доход +25%, смелее лезет в драку, держит трёх героев' },
];
const BOT_LINES = {
  town: ['Слышь, это теперь наш район.', 'Город сменил крышу. Вопросы?', 'Было ваше — стало наше.'],
  mine: ['Ларёк теперь платит нам.', 'Точку переоформили.', 'С этой точки вам больше не капает.'],
  kill: ['Ваш пацан не вывез.', 'Передайте своим: так будет с каждым.', 'Стрелку вы проиграли.'],
};

const ARTS = {
  chain: { name: 'Золотая цепь', em: '📿', desc: '+2 к атаке', att: 2 },
  jacket: { name: 'Малиновый пиджак', em: '👔', desc: '+2 к защите', def: 2 },
  leather: { name: 'Кожанка', em: '🧥', desc: '+1 к атаке и защите', att: 1, def: 1 },
  phone: { name: 'Мобила-кирпич', em: '📱', desc: '+25 к ходу на карте', mp: 25 },
  suit: { name: 'Костюм «Абибас»', em: '🎽', desc: '+1 к скорости всех отрядов', spd: 1 },
  tape: { name: 'Кассета с боевиком', em: '📼', desc: '+3 к атаке', att: 3 },
  pager: { name: 'Пейджер', em: '📟', desc: '+2 к понтам', pow: 2 },
  watch: { name: 'Котлы с Арбата', em: '⌚', desc: '+400 бабла в день', gold: 400 },
  bat: { name: 'Бита', em: '🏏', desc: '+2 к атаке, +1 к защите', att: 2, def: 1 },
  key: { name: 'Ключ от Кремля', em: '🗝️', desc: '+4 ко всему, +1000 бабла в день', att: 4, def: 4, pow: 4, gold: 1000 },
};
const ART_POOL = ['chain', 'jacket', 'leather', 'phone', 'suit', 'tape', 'pager', 'watch', 'bat'];

// Здания города. req — что нужно построить раньше
const BUILDINGS = [
  { id: 'dw1', name: 'Подворотня', tier: 1, cost: { gold: 0 }, desc: 'Нанимать отряды 1 уровня' },
  { id: 'dw2', name: 'Двор', tier: 2, cost: { gold: 1000, brick: 3 }, req: 'dw1', desc: 'Нанимать отряды 2 уровня' },
  { id: 'dw3', name: 'Секция', tier: 3, cost: { gold: 2000, brick: 5 }, req: 'dw2', desc: 'Нанимать отряды 3 уровня' },
  { id: 'dw4', name: 'Офис', tier: 4, cost: { gold: 4000, brick: 8, fuel: 4 }, req: 'dw3', desc: 'Нанимать отряды 4 уровня' },
  { id: 'dw5', name: 'Особняк', tier: 5, cost: { gold: 8000, brick: 12, fuel: 8 }, req: 'dw4', desc: 'Нанимать отряды 5 уровня' },
  { id: 'adm1', name: 'Управа', cost: { gold: 2000 }, desc: '+500 бабла в день' },
  { id: 'adm2', name: 'Мэрия', cost: { gold: 5000, brick: 5 }, req: 'adm1', desc: 'Ещё +1000 бабла в день' },
  { id: 'market', name: 'Барахолка', cost: { gold: 1500, brick: 2 }, desc: 'Обмен бабла на бензин и кирпич' },
  { id: 'fence', name: 'Забор с колючкой', cost: { gold: 2000, brick: 5 }, desc: 'Защитники города получают +3 к защите' },
  { id: 'gym', name: 'Качалка', cost: { gold: 1500, brick: 3 }, desc: 'Прирост отрядов 1–2 уровня +50%' },
];
const BLD = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const TOWN_INCOME = 500;
const HERO_COST = 2500, MAX_HEROES = 4, MAX_SLOTS = 5, TRADE_BUY = 300, TRADE_SELL = 100;

// Понты — заклинания героя. Один раз за раунд боя, стоят «понты» (ману)
const SPELLS = [
  { id: 'naezd', name: 'Наезд', em: '💢', cost: 5, target: 'enemy', desc: p => `Урон отряду врага: ${12 + 10 * p}` },
  { id: 'krysha', name: 'Крыша', em: '🏠', cost: 4, target: 'ally', desc: () => 'Свой отряд: +6 к защите до конца боя' },
  { id: 'voda', name: 'Заряженная вода', em: '💧', cost: 6, target: 'ally', desc: p => `Лечит свой отряд на ${20 + 10 * p} и поднимает павших` },
  { id: 'strelka', name: 'Забить стрелку', em: '⚡', cost: 12, target: 'all', desc: p => `Урон всем врагам: ${6 + 5 * p}` },
];

// События начала недели — по радио «Европа плюс»
const WEEK_EVENTS = [
  { title: 'Неделя спокойствия', text: 'Ничего не случилось. Подозрительно.', fx: () => {} },
  { title: 'Гуманитарка', text: 'Пришла гуманитарная помощь: каждому +1500 бабла.', fx: g => g.players.forEach(p => p.res.gold += 1500) },
  { title: 'Обвал рубля', text: 'Чёрный вторник! У всех сгорела пятая часть бабла.', fx: g => g.players.forEach(p => p.res.gold = Math.floor(p.res.gold * 0.8)) },
  { title: 'Бензин подешевел', text: 'Каждому +4 бензина.', fx: g => g.players.forEach(p => p.res.fuel += 4) },
  { title: 'Стройка века', text: 'Каждому +5 кирпичей.', fx: g => g.players.forEach(p => p.res.brick += 5) },
  { title: 'Неделя качалки', text: 'Отрядов 1 уровня в городах вдвое больше.', grow1: 2 },
  { title: 'Ваучеризация', text: 'Каждый герой получает 500 опыта.', fx: g => g.heroes.forEach(h => h.xp += 500) },
  { title: 'Крысиный король', text: 'Крысы на карте расплодились вдвое.', fx: g => g.objs.forEach(o => { if (o.t === 'mob') o.army.forEach(s => { if (s && s.u === 'rat') s.n *= 2; }); }) },
];

// Опыт для уровня L (накопительно)
const xpFor = L => 500 * (L - 1) * L / 2;

const BONUS = {
  att: { name: 'Подвальная качалка', em: '🏋️', text: 'Позанимались с железом: +1 к атаке.' },
  def: { name: 'Секция самбо', em: '🥋', text: 'Научились падать: +1 к защите.' },
  pow: { name: 'Видеосалон', em: '📺', text: 'Насмотрелись боевиков: +1 к понтам.' },
  xp: { name: 'Библиотека', em: '📚', text: 'Почитали «Как стать богатым»: +1000 опыта.' },
  mp: { name: 'Шаурма', em: '🌯', text: 'Перекусили шаурмой: +40 к ходу сегодня.' },
};
const MINE = {
  gold: { name: 'Ларёк', em: '🏪', res: 'gold', amt: 600 },
  fuel: { name: 'Бензоколонка', em: '⛽', res: 'fuel', amt: 2 },
  brick: { name: 'Стройка', em: '🏗️', res: 'brick', amt: 2 },
};
