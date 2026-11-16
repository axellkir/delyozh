'use strict';
// ДЕЛЁЖ — пошаговая стратегия на 2–6 бригад (люди и боты) за одним компьютером. Москва, 90-е.
// Здесь только данные: бригады, отряды, артефакты, здания, понты (заклинания), события недели.

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = id => document.getElementById(id);

const RES = ['gold', 'fuel', 'brick'];
const RES_GEN = { gold: 'бабла', fuel: 'бензина', brick: 'кирпича' }; // «+600 бабла в день»
const RES_NAME = { gold: 'Бабло', fuel: 'Бензин', brick: 'Кирпич' };
const PCOL = ['#e8343c', '#f5c42c', '#2fb8ea', '#4cc552', '#b97cf5', '#f08a2c'];
const PCOL_NAME = ['Красные', 'Жёлтые', 'Синие', 'Зелёные', 'Фиолетовые', 'Рыжие'];
const MAX_PLAYERS = 6;
// true — вместо нарисованной кодом подложки карты «Москва 90-х» берётся картинка assets/map/moscow.jpg (см. docs/MAP-ART.md)
const MAP_ART = false;

// Отряды. att/def — атака/защита, dmg — урон одного бойца, hp — здоровье одного, spd — скорость (клеток за ход в бою),
// grow — прирост в неделю, cost — цена найма. Флаги: shots (стрелок), fly (перелетает), noRet (без ответки), twice (бьёт дважды)
// Особенности: swarm (толпой), finish (добивает), charge (разбег), slow (замедляет), curse (сглаз), guard (отвечает всегда),
// stun (может лишить хода), pierce (бьёт насквозь), rage (злость), splash (по площади), dodge (уворот от выстрелов), heal (лечит своих), stink (вонь)
const UNITS = {
  // Качалка: сила и наглость
  shpana: { name: 'Шпана', tier: 1, att: 4, def: 2, dmg: [1, 3], hp: 6, spd: 5, grow: 14, cost: { gold: 50 }, swarm: true, note: 'толпой: +15% за каждый свой отряд рядом с целью' },
  gop: { name: 'Гопник', tier: 2, att: 6, def: 4, dmg: [2, 4], hp: 13, spd: 5, grow: 9, cost: { gold: 110 }, finish: true, note: 'добивает: +40% по тем, кто уже не может ответить' },
  boxer: { name: 'Боксёр', tier: 3, att: 9, def: 6, dmg: [4, 7], hp: 26, spd: 6, grow: 6, cost: { gold: 290 }, twice: true, note: 'бьёт двойкой' },
  byk: { name: 'Бык', tier: 4, att: 12, def: 12, dmg: [10, 16], hp: 75, spd: 4, grow: 3, cost: { gold: 680, fuel: 1 }, charge: true, note: 'разбег: +8% урона за каждую клетку пути' },
  champ: { name: 'Чемпион на «бэхе»', tier: 5, att: 17, def: 13, dmg: [26, 40], hp: 170, spd: 9, grow: 1, cost: { gold: 2200, fuel: 2 }, noRet: true, charge: true, note: 'таран без ответки, с разбега ещё больнее' },
  // Рынок: стрелки и толстые
  chelnok: { name: 'Челнок', tier: 1, att: 3, def: 2, dmg: [1, 2], hp: 7, spd: 4, grow: 12, cost: { gold: 65 }, shots: 6, slow: true, note: 'баулы под ноги: цель замедляется' },
  babka: { name: 'Бабка с тележкой', tier: 2, att: 5, def: 8, dmg: [2, 3], hp: 17, spd: 4, grow: 9, cost: { gold: 100 }, curse: true, note: 'сглаз: цель теряет 3 атаки до конца боя' },
  chop: { name: 'Охранник ЧОП', tier: 3, att: 8, def: 11, dmg: [4, 6], hp: 32, spd: 5, grow: 6, cost: { gold: 300 }, guard: true, note: 'отвечает на каждый удар' },
  buh: { name: 'Бухгалтер', tier: 4, att: 12, def: 8, dmg: [8, 14], hp: 48, spd: 5, grow: 3, cost: { gold: 720, fuel: 1 }, shots: 10, stun: true, note: 'проверка: 25%, что цель пропустит ход' },
  fura: { name: 'Фура «Таможня»', tier: 5, att: 15, def: 19, dmg: [24, 34], hp: 220, spd: 6, grow: 1, cost: { gold: 2200, fuel: 2 }, pierce: true, note: 'давит: достаётся и тому, кто стоит за целью' },
  // Неформалы: быстрые и прыгучие
  punk: { name: 'Панк', tier: 1, att: 5, def: 1, dmg: [2, 3], hp: 6, spd: 6, grow: 14, cost: { gold: 50 }, rage: true, note: 'злость: чем их меньше, тем больнее бьют' },
  metal: { name: 'Металлист', tier: 2, att: 6, def: 4, dmg: [2, 5], hp: 12, spd: 5, grow: 9, cost: { gold: 120 }, shots: 8, splash: true, note: 'звуковая волна задевает соседей цели' },
  biker: { name: 'Байкер', tier: 3, att: 10, def: 6, dmg: [5, 8], hp: 28, spd: 9, grow: 5, cost: { gold: 320 }, noRet: true, charge: true, note: 'наезд без ответки, с разбега ещё больнее' },
  raver: { name: 'Рейвер', tier: 4, att: 11, def: 9, dmg: [8, 13], hp: 52, spd: 8, grow: 3, cost: { gold: 700, fuel: 1 }, fly: true, dodge: true, note: 'перепрыгивает; уворачивается от выстрелов' },
  ekstra: { name: 'Экстрасенс', tier: 5, att: 15, def: 14, dmg: [20, 30], hp: 150, spd: 7, grow: 1, cost: { gold: 2200, fuel: 2 }, shots: 12, fly: true, heal: true, note: 'каждый ход лечит самый побитый свой отряд' },
  // Нейтралы с улиц
  rat: { name: 'Крысы', tier: 1, att: 2, def: 2, dmg: [1, 2], hp: 4, spd: 7, grow: 0, cost: { gold: 0 }, swarm: true, note: 'толпой: сильнее, когда цель окружена' },
  dog: { name: 'Бродячие собаки', tier: 2, att: 5, def: 3, dmg: [2, 4], hp: 11, spd: 8, grow: 0, cost: { gold: 0 }, charge: true, note: 'разбег: +8% урона за каждую клетку пути' },
  bomzh: { name: 'Бомжи', tier: 2, att: 4, def: 7, dmg: [2, 3], hp: 16, spd: 3, grow: 0, cost: { gold: 0 }, stink: true, note: 'вонь: в рукопашной по ним бьют слабее' },
  patrol: { name: 'Патруль', tier: 3, att: 9, def: 9, dmg: [4, 6], hp: 30, spd: 5, grow: 0, cost: { gold: 0 }, shots: 6 },
  omon: { name: 'Спецназ', tier: 4, att: 14, def: 14, dmg: [10, 15], hp: 80, spd: 6, grow: 0, cost: { gold: 0 }, guard: true, note: 'отвечает на каждый удар' },
};

const FACTIONS = {
  kach: { name: 'КАЧАЛКА', club: { name: 'Ринг', stat: 'att', text: 'постоял на ринге: +1 к атаке' }, town: 'Качалка «Олимп»', units: ['shpana', 'gop', 'boxer', 'byk', 'champ'], desc: 'Сила и наглость. Лучший ближний бой.',
    heroes: [{ name: 'Вован Бицепс', spec: 'att' }, { name: 'Толян Штанга', spec: 'def' }, { name: 'Серый', spec: 'xp' }, { name: 'Кабан', spec: 'army' }] },
  rynok: { name: 'РЫНОК', club: { name: 'Чайхана', stat: 'def', text: 'перетёр с нужными людьми: +1 к защите' }, town: 'Рынок «Черкизон»', units: ['chelnok', 'babka', 'chop', 'buh', 'fura'], desc: 'Стрелки и толстокожие. Деньги любят счёт.',
    heroes: [{ name: 'Ашот Барахолкин', spec: 'gold' }, { name: 'Тётя Зина', spec: 'pow' }, { name: 'Михалыч', spec: 'def' }, { name: 'Жора Обменник', spec: 'mp' }] },
  neform: { name: 'НЕФОРМАЛЫ', club: { name: 'Репетиционная база', stat: 'pow', text: 'отыграл концерт: +1 к понтам' }, town: 'Подвал «Вечный рок»', units: ['punk', 'metal', 'biker', 'raver', 'ekstra'], desc: 'Быстрые, прыгучие, непредсказуемые.',
    heroes: [{ name: 'Кот Шаман', spec: 'pow' }, { name: 'Ржавый', spec: 'mp' }, { name: 'Лиса', spec: 'spd' }, { name: 'Дед Металл', spec: 'att' }] },
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

// Навыки, из которых герой выбирает при каждом новом уровне (три случайных на выбор)
const PERKS = {
  att: { name: 'Атака +1', ic: 'i_att' }, def: { name: 'Защита +1', ic: 'i_def' }, pow: { name: 'Понты +1', ic: 'i_pow' },
  mp: { name: 'Ход на карте +10', ic: 'i_spd' }, gold: { name: '+150 бабла в день', ic: 'r_gold' }, mana: { name: 'Запас понтов +5', ic: 'i_mana' },
  luck: { name: 'Фарт: +4% к шансу', ic: 'i_star' }, lead: { name: 'Кураж: отряды ходят второй раз и за полотряда', ic: 'i_flag' },
};
// Коронный номер героя: раз за бой, 10 понтов. target — на кого: ally (свой отряд), enemy (чужой), all (сразу)
const ULT_COST = 10;
const HERO_ULT = {
  'Вован Бицепс': { id: 'u_pump', name: 'Накачка', target: 'ally', desc: () => 'Свой отряд: +5 к атаке до конца боя' },
  'Толян Штанга': { id: 'u_wall', name: 'Стенка', target: 'all', desc: () => 'Все свои: +4 к защите до конца боя' },
  'Серый': { id: 'u_talk', name: 'По понятиям', target: 'enemy', desc: () => 'Вражеский отряд пропускает ход и теряет 3 атаки' },
  'Кабан': { id: 'u_call', name: 'Подтянуть пацанов', target: 'all', desc: p => `На поле выходит шпана: ${6 + 4 * p} бойцов` },
  'Ашот Барахолкин': { id: 'u_bribe', name: 'Взятка', target: 'enemy', desc: () => 'Вражеский отряд до конца боя не отвечает на удары и теряет 3 атаки' },
  'Тётя Зина': { id: 'u_scandal', name: 'Скандал', target: 'all', desc: () => 'Все враги: −2 атаки до конца боя и замедление' },
  'Михалыч': { id: 'u_moon', name: 'Самогон', target: 'ally', desc: () => 'Свой отряд полностью встаёт на ноги' },
  'Жора Обменник': { id: 'u_rate', name: 'Курс рухнул', target: 'enemy', desc: () => 'Вражеский отряд теряет четверть бойцов' },
  'Кот Шаман': { id: 'u_hex', name: 'Порча', target: 'all', desc: p => `Урон всем врагам: ${10 + 8 * p}` },
  'Ржавый': { id: 'u_rev', name: 'Рёв мотора', target: 'all', desc: () => 'Все свои: +3 к скорости на ближайший ход' },
  'Лиса': { id: 'u_wind', name: 'Второе дыхание', target: 'ally', desc: () => 'Свой отряд сразу ходит ещё раз' },
  'Дед Металл': { id: 'u_solo', name: 'Соло', target: 'enemy', desc: p => `Урон цели и всем рядом с ней: ${14 + 9 * p}` },
};
// Сложность партии: стартовая казна, сила местных и как быстро они растут каждую неделю
const GAME_DIFF = [
  { name: 'Лёгкая', gold: 7000, mobs: 0.8, grow: 0.05, desc: 'Больше денег на старте, местные слабее и почти не растут' },
  { name: 'Обычная', gold: 5000, mobs: 1, grow: 0.1, desc: 'Местные каждую неделю прибавляют 10%' },
  { name: 'Жёсткая', gold: 3500, mobs: 1.35, grow: 0.16, desc: 'Денег мало, местные сильнее на треть и растут на 16% в неделю' },
];

// Заказы авторитетов: по понедельникам каждой бригаде предлагают три дела, взять можно два. Не успел к сроку — авторитет недоволен.
const BOSSES = ['Палыч с Рижского', 'Седой', 'Лёва Бриллиант', 'Дядя Миша', 'Гоша Портфель'];
const JOB_MAX = 2, JOB_DAYS = 7, JOB_FAIL_HEAT = 10;
const JOB_ICON = { clear: 'i_att', grab: 'i_flag', deliver: 'fura', hit: 'i_skull', tribute: 'chest' };

// Победа по Ключу от Кремля: бригада, чей герой продержит ключ столько дней подряд, забирает Москву
const KEY_DAYS = 7;

// Дела недели: у каждой бригады раз в неделю — своя история с выбором. Последствия только для неё самой.
// opts: [подпись, can(p) — доступно ли, fx(p) → текст итога]; bot(p) — что выберет бот
const DEALS = [
  { id: 'tax', ic: 'i_warn', title: 'Налоговая', text: p => `Пришли из налоговой. Хотят пятую часть кассы — ${Math.floor(p.res.gold / 5)} бабла.`,
    opts: [['Заплатить', null, p => { p.res.gold -= Math.floor(p.res.gold / 5); addHeat(p.id, -10); return 'Заплатили. Розыск чуть остыл.'; }],
      ['Спрятать кассу', null, p => { if (Math.random() < 0.5) return 'Пронесло: ничего не нашли.'; const f = Math.floor(p.res.gold * 0.4); p.res.gold -= f; addHeat(p.id, 10); return `Нашли! Изъяли ${f} бабла, бригадой заинтересовались.`; }]],
    bot: p => (p.res.gold > 6000 ? 0 : 1) },
  { id: 'pyramid', ic: 'r_gold', title: 'Финансовая пирамида', text: () => 'Знакомый зовёт вложиться в пирамиду: через неделю обещают вернуть вдвое. Половина таких пирамид лопается.',
    opts: [['Вложить 3000', p => p.res.gold >= 3000, p => { p.res.gold -= 3000; p.pyramid = { amt: 3000, week: weekNo() + 1 }; return 'Деньги ушли. Ждём неделю.'; }],
      ['Вложить половину кассы', p => p.res.gold >= 2000, p => { const a = Math.floor(p.res.gold / 2); p.res.gold -= a; p.pyramid = { amt: a, week: weekNo() + 1 }; return `Вложили ${a}. Ждём неделю.`; }],
      ['Не вестись', null, () => 'Сами знаем, чем это кончается.']],
    bot: () => 2, ok: p => !p.pyramid },
  { id: 'putsch', ic: 'whitehouse', title: 'Путч', text: () => 'У Белого дома стоят танки. Город замер. Чью сторону держим?',
    opts: [['Помочь защитникам: 1500', p => p.res.gold >= 1500, p => { p.res.gold -= 1500; myHeroes(p.id).forEach(h => h.pow++); return 'Бригаду запомнили: все герои +1 к понтам.'; }],
      ['Помочь военным: 3 бензина', p => p.res.fuel >= 3, p => { p.res.fuel -= 3; myHeroes(p.id).forEach(h => h.att++); addHeat(p.id, 10); return 'Пацаны набрались опыта: все герои +1 к атаке. Но засветились.'; }],
      ['Переждать', null, () => 'Отсиделись по домам.']],
    bot: p => (p.res.gold >= 4000 ? 0 : 2), once: true },
  { id: 'voucher', ic: 'b_xp', title: 'Ваучеры', text: () => 'Население меняет ваучеры на водку. Можно скупить пачку и обменять на акции завода.',
    opts: [['Скупить на 2500', p => p.res.gold >= 2500, p => { p.res.gold -= 2500; p.bonusInc = (p.bonusInc || 0) + 250; return 'Теперь вы акционеры: +250 бабла в день до конца партии.'; }],
      ['Не связываться', null, () => 'Бумажки и бумажки.']],
    bot: p => (p.res.gold >= 5000 ? 0 : 1) },
  { id: 'star', ic: 'amp', title: 'Гастроли', text: () => 'В район едет звезда эстрады. Можно устроить концерт и пригласить нужных людей.',
    opts: [['Устроить концерт: 1500', p => p.res.gold >= 1500, async p => { p.res.gold -= 1500; addHeat(p.id, -5); for (const h of myHeroes(p.id)) await giveXp(h, 600); return 'Концерт прошёл на ура: все герои +600 опыта.'; }],
      ['Не до песен', null, () => 'Звезда уехала в соседний район.']],
    bot: p => (p.res.gold >= 4000 ? 0 : 1) },
  { id: 'truck', ic: 'fura', title: 'Фура с Польши', text: () => 'Челноки просят провести фуру через МКАД мимо гаишников. Платят товаром.',
    opts: [['Провести: сильнейший герой стоит сегодня', p => myHeroes(p.id).length > 0, p => { const h = myHeroes(p.id).sort((a, b) => armyValue(b.army) - armyValue(a.army))[0]; h.mp = 0; p.res.fuel += 5; p.res.brick += 5; addHeat(p.id, 5); return `${h.name} весь день катался с фурой: +5 бензина и +5 кирпича.`; }],
      ['Отказать', null, () => 'Пусть сами разбираются.']],
    bot: () => 0 },
  { id: 'dembel', ic: 'i_human', title: 'Дембеля', text: () => 'Вернулись ребята из армии. Ищут работу, на всё согласны.',
    opts: [['Взять: 900', p => p.res.gold >= 900 && myTowns(p.id).length > 0, p => { p.res.gold -= 900; const t = myTowns(p.id)[0], u = townUnit(t, 1); if (!addUnits(t.garrison, u, 7)) { const h = myHeroes(p.id)[0]; if (h && addUnits(h.army, u, 7)) return `${UNITS[u].name} ×7 — в отряд к ${h.name}.`; p.res.gold += 900; return 'Ставить некуда — ребята ушли.'; } return `${UNITS[u].name} ×7 — в гарнизон ${t.name}.`; }],
      ['Не брать', null, () => 'Пошли к соседям.']],
    bot: p => (p.res.gold >= 2500 ? 0 : 1) },
  { id: 'press', ic: 'i_news', title: 'Журналист', text: () => 'Журналист из «Московского комсомольца» копает под бригаду.',
    opts: [['Дать интервью: 1000', p => p.res.gold >= 1000, p => { p.res.gold -= 1000; addHeat(p.id, -20); return 'Вышла статья про честный бизнес. Розыск заметно остыл.'; }],
      ['Припугнуть', null, p => { addHeat(p.id, 15); myHeroes(p.id).forEach(h => h.pow++); return 'Больше не пишет. Герои +1 к понтам, но бригадой заинтересовались.'; }],
      ['Не обращать внимания', null, p => { if (Math.random() < 0.5) { addHeat(p.id, 15); return 'Статья вышла. Розыск вырос.'; } return 'Статью не напечатали.'; }]],
    bot: p => ((p.heat || 0) > 30 && p.res.gold >= 2000 ? 0 : 2) },
];

// Сложность ботов. income — множитель дохода, edge — во сколько раз бот должен быть сильнее, чтобы лезть в драку «на глаз»,
// sim — прикидывает бой заранее, keep — какую долю армии готов сохранить после драки, slack — как часто ленится,
// peace — до какого дня не трогает чужие бригады (местных бьёт сразу).
const DIFF = [
  { name: 'Лёгкий', income: 0.75, edge: 2, sim: false, keep: 0.7, spells: false, slack: 0.3, heroes: 1, peace: 22, desc: 'Доход −25%, без понтов, ленится, три недели никого не трогает' },
  { name: 'Обычный', income: 1, edge: 1.5, sim: true, keep: 0.55, spells: true, slack: 0, heroes: 2, peace: 15, desc: 'Играет по тем же правилам, что и вы' },
  { name: 'Злой', income: 1.25, edge: 1.3, sim: true, keep: 0.35, spells: true, slack: 0, heroes: 3, peace: 10, desc: 'Доход +25%, смелее лезет в драку, держит трёх героев' },
];
const BOT_LINES = {
  town: ['Слышь, это теперь наш район.', 'Город сменил крышу. Вопросы?', 'Было ваше — стало наше.'],
  mine: ['Ларёк теперь платит нам.', 'Точку переоформили.', 'С этой точки вам больше не капает.'],
  kill: ['Ваш пацан не вывез.', 'Передайте своим: так будет с каждым.', 'Стрелку вы проиграли.'],
};

const ARTS = {
  chain: { name: 'Золотая цепь', desc: '+2 к атаке', att: 2 },
  jacket: { name: 'Малиновый пиджак', desc: '+2 к защите', def: 2 },
  leather: { name: 'Кожанка', desc: '+1 к атаке и защите', att: 1, def: 1 },
  phone: { name: 'Мобила-кирпич', desc: '+25 к ходу на карте', mp: 25 },
  suit: { name: 'Костюм «Абибас»', desc: '+1 к скорости всех отрядов', spd: 1 },
  tape: { name: 'Кассета с боевиком', desc: '+3 к атаке', att: 3 },
  pager: { name: 'Пейджер', desc: '+2 к понтам', pow: 2 },
  watch: { name: 'Котлы с Арбата', desc: '+400 бабла в день', gold: 400 },
  bat: { name: 'Бита', desc: '+2 к атаке, +1 к защите', att: 2, def: 1 },
  key: { name: 'Ключ от Кремля', desc: '+4 ко всему, +1000 бабла в день', att: 4, def: 4, pow: 4, gold: 1000 },
};
const ART_POOL = ['chain', 'jacket', 'leather', 'phone', 'suit', 'tape', 'pager', 'watch', 'bat'];

// Здания города. req — что нужно построить раньше
// Улучшенные бойцы: появляются в городе после постройки «улучшения» нужного уровня. Сильнее, быстрее и дороже обычных.
const UPG_NAMES = { shpana: 'Хулиганы', gop: 'Правильный пацан', boxer: 'Кандидат в мастера', byk: 'Бык в коже', champ: 'Чемпион на «мерине»', chelnok: 'Оптовик', babka: 'Бабка-старожил', chop: 'Начальник охраны', buh: 'Главбух', fura: 'Фура с «крышей»', punk: 'Панк-ветеран', metal: 'Трэшер', biker: 'Ночной волк', raver: 'Диджей', ekstra: 'Целитель из телевизора' };
for (const u in UPG_NAMES) {
  const U = UNITS[u];
  UNITS[u + '2'] = { ...U, name: UPG_NAMES[u], base: u, att: U.att + 2, def: U.def + 2, dmg: [Math.ceil(U.dmg[0] * 1.2), Math.ceil(U.dmg[1] * 1.25)], hp: Math.ceil(U.hp * 1.2), spd: U.spd + 1, ...(U.shots && { shots: U.shots + 4 }), cost: { ...U.cost, gold: Math.round(U.cost.gold * 1.35 / 5) * 5 } };
}

// Здания города. req — что нужно построить раньше (одно здание или список), tier — открывает найм отрядов этого уровня,
// up — улучшает отряды этого уровня. Строить можно одно здание в день.
const BUILDINGS = [
  { id: 'dw1', name: 'Подворотня', tier: 1, cost: { gold: 0 }, desc: 'Нанимать отряды 1 уровня' },
  { id: 'dw2', name: 'Двор', tier: 2, cost: { gold: 1000, brick: 3 }, req: 'dw1', desc: 'Нанимать отряды 2 уровня' },
  { id: 'dw3', name: 'Секция', tier: 3, cost: { gold: 2500, brick: 5 }, req: ['dw2', 'adm1'], desc: 'Нанимать отряды 3 уровня' },
  { id: 'dw4', name: 'Офис', tier: 4, cost: { gold: 4500, brick: 8, fuel: 4 }, req: ['dw3', 'market'], desc: 'Нанимать отряды 4 уровня' },
  { id: 'dw5', name: 'Особняк', tier: 5, cost: { gold: 9000, brick: 14, fuel: 10 }, req: ['dw4', 'adm2', 'fence'], desc: 'Нанимать отряды 5 уровня' },
  { id: 'up1', name: 'Турники', up: 1, cost: { gold: 800, brick: 2 }, req: ['dw1', 'gym'], desc: 'Улучшает отряды 1 уровня' },
  { id: 'up2', name: 'Гаражи', up: 2, cost: { gold: 1500, brick: 3 }, req: ['dw2', 'gym'], desc: 'Улучшает отряды 2 уровня' },
  { id: 'up3', name: 'Спортзал', up: 3, cost: { gold: 2500, brick: 5, fuel: 2 }, req: ['dw3', 'up2'], desc: 'Улучшает отряды 3 уровня' },
  { id: 'up4', name: 'Свой этаж', up: 4, cost: { gold: 4000, brick: 8, fuel: 4 }, req: ['dw4', 'up3'], desc: 'Улучшает отряды 4 уровня' },
  { id: 'up5', name: 'Коттедж', up: 5, cost: { gold: 7000, brick: 10, fuel: 8 }, req: ['dw5', 'up4'], desc: 'Улучшает отряды 5 уровня' },
  { id: 'adm1', name: 'Управа', cost: { gold: 2000 }, desc: '+500 бабла в день' },
  { id: 'adm2', name: 'Мэрия', cost: { gold: 5000, brick: 5 }, req: ['adm1', 'market'], desc: 'Ещё +1000 бабла в день' },
  { id: 'market', name: 'Барахолка', cost: { gold: 1500, brick: 2 }, desc: 'Обмен бабла на бензин и кирпич' },
  { id: 'fence', name: 'Забор с колючкой', cost: { gold: 2000, brick: 5 }, desc: 'Защитники +3 к защите, в бою — стена с воротами' },
  { id: 'gym', name: 'Качалка', cost: { gold: 1500, brick: 3 }, desc: 'Прирост отрядов 1–2 уровня +50%' },
  { id: 'bank', name: 'Общак', cost: { gold: 3000, brick: 4 }, req: 'adm1', desc: 'По понедельникам +5% к казне, но не больше 2000' },
  { id: 'garage', name: 'Автосервис', cost: { gold: 2000, brick: 4, fuel: 2 }, req: 'market', desc: 'Герой, начавший день в городе, получает +20 к ходу' },
  { id: 'club', name: 'Клуб', cost: { gold: 2500, brick: 4 }, req: 'dw3', desc: 'Каждый свой герой один раз получает здесь +1 к характеристике' },
];
const BLD = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const TOWN_INCOME = 500;
const HERO_COST = 2500, MAX_HEROES = 4, MAX_SLOTS = 5, TRADE_BUY = 300, TRADE_SELL = 100;
// Розыск: копится за наглость (0–100), каждый день остывает. С HEAT_WARN — ориентировка, с HEAT_RAID в понедельник приезжает ОМОН
const HEAT_WARN = 40, HEAT_RAID = 60, HEAT_COOL = 3;
const HEAT = { mob: 1, hero: 12, town: 10, townOwned: 20, mine: 6, roof: 4 };

// Понты — заклинания героя. Один раз за раунд боя, стоят «понты» (ману)
const SPELLS = [
  { id: 'naezd', name: 'Наезд', cost: 5, target: 'enemy', desc: p => `Урон отряду врага: ${12 + 10 * p}` },
  { id: 'krysha', name: 'Крыша', cost: 4, target: 'ally', desc: () => 'Свой отряд: +6 к защите до конца боя' },
  { id: 'voda', name: 'Заряженная вода', cost: 6, target: 'ally', desc: p => `Лечит свой отряд на ${20 + 10 * p} и поднимает павших` },
  { id: 'strelka', name: 'Забить стрелку', cost: 12, target: 'all', desc: p => `Урон всем врагам: ${6 + 5 * p}` },
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
  att: { name: 'Подвальная качалка', text: 'Позанимались с железом: +1 к атаке.' },
  def: { name: 'Секция самбо', text: 'Научились падать: +1 к защите.' },
  pow: { name: 'Видеосалон', text: 'Насмотрелись боевиков: +1 к понтам.' },
  xp: { name: 'Библиотека', text: 'Почитали «Как стать богатым»: +1000 опыта.' },
  mp: { name: 'Шаурма', text: 'Перекусили шаурмой: +40 к ходу сегодня.' },
};
const MINE = {
  gold: { name: 'Ларёк', res: 'gold', amt: 600 },
  fuel: { name: 'Бензоколонка', res: 'fuel', amt: 2 },
  brick: { name: 'Стройка', res: 'brick', amt: 2 },
};
