'use strict';
// Обучение: инструкция «Как играть» (несколько страниц с картинками) и короткие подсказки в первый раз —
// на карте, в городе, в бою. Инструкция сама открывается при первом заходе; потом — кнопкой в меню и в панели.

const GUIDE = [
  { ic: ['t_kach', 't_rynok', 't_neform', 'a_key'], title: 'Делёж: Москва, 90-е',
    html: `<p>От двух до шести бригад делят город. Ходят по очереди: за одним компьютером — передавайте мышь, по сети — через комнату в меню.</p>
      <p><b>Как победить:</b> остаться единственной бригадой — захватить чужие города и разбить героев. Или взять в Кремле <b>Ключ</b> и продержать его семь дней подряд.</p>
      <p>Каждая бригада начинает с одним городом и одним героем. Герой водит армию, город приносит бабло и бойцов.</p>` },
  { ic: ['h_Кабан', 'r_gold', 'm_gold', 'i_flag'], title: 'Карта',
    html: `<p><b>Клик по клетке</b> — проложить путь, <b>второй клик</b> — идти. Зелёные точки — дойдём сегодня, красные — в следующие дни. Не дошли — <b>Пробел</b> продолжит путь завтра.</p>
      <p>Подбирайте пачки денег и ресурсы, заходите в места на карте — Макдоналдс, Останкино, Бутырку. <b>Ларьки, бензоколонки и стройки</b> приносят доход каждый день, если в них зайти героем.</p>
      <p>Красный круг под бойцами — местные. Подойдёте вплотную — драка. Наведите курсор, чтобы прикинуть, сколько их.</p>
      <p>Когда походили всеми героями — <b>Конец хода</b> (Enter).</p>` },
  { ic: ['t_kach', 'shpana', 'gop2', 'chest'], title: 'Город',
    html: `<p>Кликните по своему городу в панели справа или зайдите в него героем.</p>
      <p><b>Стройка</b> — одно здание в день. Здания открывают бойцов новых уровней и улучшения, дают доход и бонусы. Что нужно для постройки, написано на плитке.</p>
      <p><b>Найм</b> — новые бойцы приходят по понедельникам. Нанятые встают в гарнизон или к герою; отряды переставляются кликами.</p>
      <p><b>Заказы авторитетов</b> — вкладка в городе. По понедельникам предлагают три дела: разогнать местных, отжать точку, отвезти груз. Сделали к сроку — награда.</p>` },
  { ic: ['byk', 'metal', 'o_barrel', 'i_pow'], title: 'Бой',
    html: `<p>Отряды ходят по очереди — быстрые первыми; очередь видна внизу. Зелёным подсвечено, куда можно дойти. <b>Клик по врагу</b> — подойти и ударить или выстрелить. Наведите на врага — увидите урон заранее.</p>
      <p>У каждого отряда своя особенность: шпана сильнее толпой, бык бьёт с разбега, бабка сглазит. <b>Фарт</b> — удар в полтора раза сильнее, <b>кураж</b> — положил отряд целиком, ходи ещё раз. Бочки с бензином взрываются от выстрела, за машинами можно укрыться.</p>
      <p><b>Герой</b> тоже на поле. Выбьют — бригада до конца боя останется без его бонусов. <b>Понты</b> (C) — заклинания героя, у каждого есть свой коронный номер.</p>` },
  { ic: ['police', 'i_star', 'prison', 'whitehouse'], title: 'Девяностые',
    html: `<p><b>Розыск</b> копится за драки, захваты и крыши. С 60 в понедельник приезжает ОМОН — откупиться можно в городе с Управой или на Петровке.</p>
      <p><b>Крыша</b> — на чужой точке можно оставить смотрящих и делить доход пополам. <b>Плен</b> — разбитого героя держат победители; его можно выкупить.</p>
      <p><b>Дефолт</b> случится один раз на 5–7-й неделе: казна у всех сгорит вчетверо. Слушайте слухи и вовремя переводите бабло в товар.</p>
      <p><b>Дела недели</b> — налоговая, пирамида, путч: выбор с последствиями.</p>` },
  { ic: ['i_play', 'i_next', 'i_meet', 'i_map'], title: 'Управление',
    html: `<table class="keys">
      <tr><td>Клик</td><td>путь, второй клик — идти; клик по своему герою — выбрать</td></tr>
      <tr><td>Правый клик по своему герою</td><td>подойти и обменяться отрядами</td></tr>
      <tr><td>Пробел</td><td>продолжить путь</td></tr><tr><td>Enter</td><td>конец хода</td></tr>
      <tr><td>H</td><td>следующий герой</td></tr><tr><td>WASD, стрелки, миникарта</td><td>двигать карту</td></tr>
      <tr><td>В бою: W / D / C / A</td><td>ждать / оборона / понты / авто-бой</td></tr>
      <tr><td>M</td><td>музыка</td></tr><tr><td>Esc</td><td>закрыть окно</td></tr></table>
      <p>Партия сохраняется в конце каждого хода — «Продолжить» в меню.</p>` },
];
let gPage = 0;
function showGuide(page) { gPage = page || 0; renderGuide(); $('guide').hidden = false; }
function closeGuide() { $('guide').hidden = true; try { localStorage.setItem('delyozh_guide_seen', '1'); } catch (e) { /* не страшно */ } }
function renderGuide() {
  const P = GUIDE[gPage], last = gPage === GUIDE.length - 1;
  $('gBox').innerHTML = `<div class="gpics">${P.ic.map(id => ico(id, 56)).join('')}</div>
    <div class="fun gt">${P.title}</div><div class="gx">${P.html}</div>
    <div class="gnav"><div class="gdots">${GUIDE.map((g, i) => `<span class="${i === gPage ? 'on' : ''}" data-gp="${i}" title="${g.title}"></span>`).join('')}</div>
      <div class="btns"><button class="sec" id="gSkip">Закрыть</button>${gPage ? '<button class="sec" id="gPrev">Назад</button>' : ''}<button id="gNext">${last ? 'Понятно, играем' : 'Дальше'}</button></div></div>`;
  $('gSkip').onclick = closeGuide;
  if ($('gPrev')) $('gPrev').onclick = () => { gPage--; renderGuide(); };
  $('gNext').onclick = () => { if (last) closeGuide(); else { gPage++; renderGuide(); } };
  $('gBox').querySelectorAll('[data-gp]').forEach(el => el.onclick = () => { gPage = +el.dataset.gp; renderGuide(); });
}
addEventListener('keydown', e => {
  if ($('guide').hidden) return;
  if (e.code === 'Escape') closeGuide();
  if (e.code === 'ArrowRight' && gPage < GUIDE.length - 1) { gPage++; renderGuide(); }
  if (e.code === 'ArrowLeft' && gPage > 0) { gPage--; renderGuide(); }
});

// ---------- подсказки в первый раз ----------
const TIPS = {
  map: { title: 'Ваш ход', html: 'Кликните по клетке рядом — появится путь. Кликните ещё раз — герой пойдёт. Зайдите в ларёк или на стройку: они будут приносить доход каждый день. Загляните в город — там стройка, найм и заказы авторитетов. Походили — «Конец хода».' },
  town: { title: 'Город', html: 'Слева — стройка: одно здание в день. Справа — найм: начните с бойцов первого уровня и отдайте их герою. На вкладке «Заказы авторитетов» — дела на неделю.' },
  battle: { title: 'Драка', html: 'Сейчас ходит отряд в жёлтом кольце. Зелёным — куда он дойдёт. Кликните по врагу — ударить; наведите — увидите урон. Не хочется думать — «Авто» (A).' },
};
function tipSeen(id) { try { const s = localStorage.getItem('delyozh_tips') || ''; return s === 'all' || s.split(',').includes(id); } catch (e) { return true; } }
function tipMark(id) { try { const s = localStorage.getItem('delyozh_tips') || ''; if (s !== 'all') localStorage.setItem('delyozh_tips', s ? s + ',' + id : id); } catch (e) { /* не страшно */ } }
// показывает подсказку один раз за всё время; не мешает играть — карточка в углу
function tip(id) {
  if (SPEED === 0 || window.AUTOBATTLE || tipSeen(id) || !TIPS[id]) return;
  tipMark(id);
  const T = TIPS[id];
  $('tip').innerHTML = `<b>${ico('i_star', 14)} ${T.title}</b><p>${T.html}</p><div class="btns"><button class="sm" id="tipOk">Понятно</button><button class="sec sm" id="tipOff">Больше не подсказывать</button></div>`;
  $('tip').hidden = false; $('tip').className = id === 'battle' ? 'inb' : id === 'town' ? 'intown' : '';
  $('tipOk').onclick = () => { $('tip').hidden = true; };
  $('tipOff').onclick = () => { $('tip').hidden = true; try { localStorage.setItem('delyozh_tips', 'all'); } catch (e) { /* не страшно */ } };
}

$('guideBtn').onclick = () => showGuide(0);
$('helpLink').onclick = e => { e.preventDefault(); showGuide(0); };
// первый заход — инструкция открывается сама, поверх меню
try { if (!localStorage.getItem('delyozh_guide_seen') && !new URLSearchParams(location.search).get('room')) showGuide(0); } catch (e) { /* не страшно */ }
