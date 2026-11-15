'use strict';
// Окна: диалоги, шторка между ходами, город, обмен армиями, меню, кнопки боя, победа.

// opt.pid — для какой бригады окно (по умолчанию — чей ход). За бота отвечает он сам, окно не показывается.
function ask(title, html, buttons, opt) {
  const pid = opt && opt.pid != null ? opt.pid : G ? G.cur : -1;
  if (isBot(pid) && !G.over) return Promise.resolve(botAnswer(pid, title, buttons));
  return new Promise(res => {
    $('mTitle').textContent = title; $('mBody').innerHTML = html;
    $('mBtns').innerHTML = buttons.map((b, i) => `<button data-i="${i}" class="${i ? 'sec' : ''}">${b}</button>`).join('');
    $('modal').hidden = false;
    $('mBtns').querySelectorAll('button').forEach(el => el.onclick = () => { sfx('click'); $('modal').hidden = true; res(+el.dataset.i); });
  });
}
function curtain(p) {
  return new Promise(res => {
    $('cName').textContent = `Ход: ${p.name}`; $('cName').style.color = p.col;
    $('cSub').textContent = `${FACTIONS[p.fac].em} ${FACTIONS[p.fac].name} · неделя ${weekNo()}, день ${dayOfWeek()}`;
    $('curtain').hidden = false; sfx('turn'); $('toast').style.opacity = 0;
    $('curtain').onclick = () => { audioInit(); $('curtain').hidden = true; res(); };
  });
}

// ---------- армии ----------
let SLOT = null; // выбранный слот: {key, i}
function armyRow(arr, key, title) {
  return `<div class="army"><h3>${title}</h3><div class="slots">${arr.map((a, i) => `<div class="slot ${SLOT && SLOT.key === key && SLOT.i === i ? 'sel' : ''}" data-ak="${key}" data-ai="${i}" title="${a ? UNITS[a.u].name : 'пусто'}">${a ? UNITS[a.u].em + `<b>${a.n}</b>` : ''}</div>`).join('')}</div></div>`;
}
function bindSlots(root, armies, rerender) {
  root.querySelectorAll('[data-ak]').forEach(el => el.onclick = () => {
    const key = el.dataset.ak, i = +el.dataset.ai, A = armies[key];
    if (!SLOT) { if (A.arr[i]) SLOT = { key, i }; }
    else { const S = armies[SLOT.key]; moveSlot(S.arr, SLOT.i, A.arr, i, S.hero, A.hero); SLOT = null; sfx('click'); }
    rerender();
  });
}

// ---------- город ----------
let townDone = null;
function openTown(t, hero) {
  return new Promise(res => { SLOT = null; townDone = res; $('town').hidden = false; renderTown(t, hero); });
}
function closeTown() { $('town').hidden = true; SLOT = null; refresh(); if (townDone) { const r = townDone; townDone = null; r(); } }
function renderTown(t, hero) {
  hero = hero && heroById(hero.id) && hero.x === t.x && hero.y === t.y ? hero : heroAt(t.x, t.y);
  if (hero && hero.owner !== t.owner) hero = null;
  const p = G.players[t.owner], F = FACTIONS[t.fac], units = F.units;
  const bcard = b => {
    const st = buildState(t, b), label = { built: '✅ построено', req: `нужно: ${b.req && BLD[b.req].name}`, today: 'сегодня уже строили', money: 'не хватает', ok: '' }[st];
    const name = b.tier ? `${b.name}: ${UNITS[units[b.tier - 1]].em}` : b.name;
    return `<div class="bcard ${st === 'built' ? 'built' : ''}"><b>${name}</b><span>${b.desc}</span><span>${st === 'built' ? '' : costText(b.cost)}</span>${st === 'ok' ? `<button data-b="${b.id}">Построить</button>` : `<small>${label}</small>`}</div>`;
  };
  const rcard = (u, i) => {
    const U = UNITS[u], ok = t.built['dw' + (i + 1)], n = t.avail[u] || 0, mx = maxRecruit(t, u);
    return `<div class="rcard ${ok ? '' : 'lock'}"><div class="em">${U.em}</div><b>${U.name}</b><br>⚔️${U.att} 🛡️${U.def} ❤️${U.hp} 💨${U.spd}<br>урон ${U.dmg[0]}–${U.dmg[1]}${U.shots ? ' · стрелок' : ''}${U.fly ? ' · прыгает' : ''}<br><i>${U.note || '&nbsp;'}</i><br>
      цена ${costText(U.cost)}<br>доступно: <b>${ok ? n : '—'}</b><br>${ok ? `<div class="btns" style="justify-content:center;margin-top:4px"><button data-r="${u}" data-n="1" ${mx ? '' : 'disabled'}>+1</button><button data-r="${u}" data-n="${mx}" ${mx ? '' : 'disabled'}>Все (${mx})</button></div>` : ''}</div>`;
  };
  const market = t.built.market ? `<h3>Барахолка</h3><div class="btns">${['fuel', 'brick'].map(r => `<button data-buy="${r}">Купить ${RES_ICON[r]} за ${TRADE_BUY}💵</button><button class="sec" data-sell="${r}">Продать ${RES_ICON[r]} за ${TRADE_SELL}💵</button>`).join('')}</div>` : '';
  $('townBox').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:48px">${F.em}</span><div><div class="fun" style="font-size:30px;color:${p.col}">${t.name}</div><small>${F.name} · ${F.desc}</small></div>
      <div style="margin-left:auto;font-size:18px;font-weight:bold">${RES.map(r => `${RES_ICON[r]} ${p.res[r]}`).join(' &nbsp; ')}</div><button id="tClose">Выйти (Esc)</button></div>
    <h3 style="margin-top:12px">Стройка — одно здание в день</h3><div class="tgrid">${BUILDINGS.map(bcard).join('')}</div>
    <h3>Найм — новые бойцы приходят по понедельникам</h3><div class="rgrid">${units.map(rcard).join('')}</div>
    <div class="row">${armyRow(t.garrison, 'g', 'Гарнизон (охраняет город)')}${hero ? armyRow(hero.army, 'h', `${hero.em} ${hero.name}`) : ''}</div>
    <div class="btns" style="margin:10px 0">${hero ? '<button class="sec" id="allH">Всех к герою</button><button class="sec" id="allG">Всех в гарнизон</button>' : `<button id="hire">Нанять героя за ${HERO_COST}💵</button>`}<small style="align-self:center">Клик по отряду, потом по другому месту — переставить или объединить.</small></div>
    ${market}`;
  const R = () => renderTown(t, hero), box = $('townBox');
  $('tClose').onclick = closeTown;
  box.querySelectorAll('[data-b]').forEach(el => el.onclick = () => { build(t, el.dataset.b); R(); });
  box.querySelectorAll('[data-r]').forEach(el => el.onclick = () => { recruit(t, el.dataset.r, +el.dataset.n, hero); R(); });
  box.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => { if (!trade(t.owner, el.dataset.buy, true)) toast('Не хватает бабла'); R(); });
  box.querySelectorAll('[data-sell]').forEach(el => el.onclick = () => { if (!trade(t.owner, el.dataset.sell, false)) toast('Нечего продавать'); R(); });
  const armies = { g: { arr: t.garrison, hero: false }, h: hero ? { arr: hero.army, hero: true } : null };
  bindSlots(box, armies, R);
  if (hero) {
    $('allH').onclick = () => { t.garrison.forEach((s, i) => { if (s && addUnits(hero.army, s.u, s.n)) t.garrison[i] = null; }); R(); };
    $('allG').onclick = () => { // самый слабый отряд остаётся с героем: без пацанов герой не ходит
      const val = s => UNITS[s.u].hp * s.n;
      const keep = hero.army.reduce((b, s, i) => (s && (b < 0 || val(s) < val(hero.army[b])) ? i : b), -1);
      hero.army.forEach((s, i) => { if (s && i !== keep && addUnits(t.garrison, s.u, s.n)) hero.army[i] = null; }); R();
    };
  } else $('hire').onclick = () => { const r = hireHero(t); if (typeof r === 'string') toast(r); else { selectHero(r); hero = r; } R(); };
}

// ---------- обмен между героями ----------
function openExchange(a, b) {
  return new Promise(res => {
    SLOT = null; $('exch').hidden = false;
    const R = () => {
      $('exchBox').innerHTML = `<div class="fun" style="font-size:28px;color:var(--gold)">🤝 Встреча</div><div class="row">${armyRow(a.army, 'a', `${a.em} ${a.name}`)}${armyRow(b.army, 'b', `${b.em} ${b.name}`)}</div>
        <div class="btns" style="margin-top:12px"><button id="xClose">Готово</button></div>`;
      bindSlots($('exchBox'), { a: { arr: a.army, hero: true }, b: { arr: b.army, hero: true } }, R);
      $('xClose').onclick = () => { $('exch').hidden = true; refresh(); res(); };
    };
    R();
  });
}

// ---------- бой ----------
function battleUI(on) { $('bui').hidden = !on; $('bSpells').hidden = true; if (on) refreshBattleUI(); }
function refreshBattleUI() {
  if (!B || B.quick) return;
  const nm = sd => sd.hero ? `${sd.hero.em} ${sd.hero.name}` : sd.owner >= 0 ? `гарнизон (${G.players[sd.owner].name})` : 'местные';
  const s = B.active, sd = s && B.sides[s.side];
  $('bTop').innerHTML = `${B.title} · раунд ${B.round}<br><span style="font-size:16px"><span style="color:${B.sides[0].owner >= 0 ? PCOL[B.sides[0].owner] : '#aaa'}">${nm(B.sides[0])}</span> ⚔️ <span style="color:${B.sides[1].owner >= 0 ? PCOL[B.sides[1].owner] : '#aaa'}">${nm(B.sides[1])}</span>${s ? ` · ходят: ${UNITS[s.u].em} ${UNITS[s.u].name}` : ''}${B.spell ? ' · выберите цель для «' + B.spell.name + '»' : ''}</span>`;
  $('bLog').innerHTML = B.log.join('<br>');
  const human = s && !sd.auto;
  ['bWait', 'bDef', 'bAuto'].forEach(id => { $(id).disabled = !human; });
  $('bCast').disabled = !(human && sd.hero && canCast(sd) && sd.hero.mana >= 4);
  $('bCast').textContent = `😎 Понты (C)${sd && sd.hero ? ' 💧' + sd.hero.mana : ''}`;
}
function toggleSpells() {
  if (!B || !B.active) return;
  const sd = B.sides[B.active.side];
  if (!$('bSpells').hidden) { $('bSpells').hidden = true; return; }
  if (!sd.hero || sd.auto) return;
  $('bSpells').innerHTML = SPELLS.map(sp => `<button data-sp="${sp.id}" ${sd.hero.mana < sp.cost || !canCast(sd) ? 'disabled' : ''}>${sp.em} ${sp.name} — ${sp.cost}💧<small>${sp.desc(sd.st.pow)}</small></button>`).join('');
  $('bSpells').hidden = false;
  $('bSpells').querySelectorAll('[data-sp]').forEach(el => el.onclick = () => { $('bSpells').hidden = true; chooseSpell(el.dataset.sp); });
}
$('bWait').onclick = () => battleWait();
$('bDef').onclick = () => battleDefend();
$('bCast').onclick = () => toggleSpells();
$('bAuto').onclick = () => battleAuto();

// ---------- лобби ----------
// Шесть мест. На каждом — человек, бот или никого; бригада, стартовый герой, для бота — сложность.
const LOBBY_KEY = 'delyozh_lobby_v1';
const KINDS = [['human', '👤', 'Человек'], ['bot', '🤖', 'Бот'], ['off', '✖', 'Закрыто']];
let seats = PCOL_NAME.map((n, i) => ({ kind: i < 3 ? 'human' : 'off', name: n, fac: FAC_IDS[i % FAC_IDS.length], hero: -1, diff: 1 }));
try {
  const saved = JSON.parse(localStorage.getItem(LOBBY_KEY) || 'null');
  if (Array.isArray(saved)) saved.slice(0, MAX_PLAYERS).forEach((x, i) => { if (x && FACTIONS[x.fac] && KINDS.some(k => k[0] === x.kind)) seats[i] = { kind: x.kind, name: String(x.name || PCOL_NAME[i]).slice(0, 16), fac: x.fac, hero: FACTIONS[x.fac].heroes[x.hero] ? x.hero : -1, diff: DIFF[x.diff] ? x.diff : 1 }; });
} catch (e) { /* настройки лобби не обязательны */ }
const saveLobby = () => { try { localStorage.setItem(LOBBY_KEY, JSON.stringify(seats)); } catch (e) { /* не страшно */ } };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderMenu() {
  const card = (p, i) => {
    const F = FACTIONS[p.fac], hc = F.heroes[p.hero], on = p.kind !== 'off';
    const head = `<div class="phead"><b style="color:${PCOL[i]}">● ${PCOL_NAME[i]}</b><div class="seg">${KINDS.map(([k, em, t]) => `<span class="${p.kind === k ? 'on' : ''}" data-seat="${i}" data-kind="${k}" title="${t}">${em}</span>`).join('')}</div></div>`;
    if (!on) return `<div class="pcard off" style="border-color:${PCOL[i]}">${head}<div class="poff">место закрыто<br><small>нажмите 👤 или 🤖</small></div></div>`;
    return `<div class="pcard" style="border-color:${PCOL[i]}">${head}
      <input data-pn="${i}" value="${esc(p.name)}" maxlength="16" placeholder="Название бригады">
      <div class="seg wide">${FAC_IDS.map(f => `<span class="${p.fac === f ? 'on' : ''}" data-seat="${i}" data-fac="${f}" title="${FACTIONS[f].desc}">${FACTIONS[f].em} ${FACTIONS[f].name[0] + FACTIONS[f].name.slice(1).toLowerCase()}</span>`).join('')}</div>
      <small>${F.desc}</small>
      <div class="seg wide heroes"><span class="${hc ? '' : 'on'}" data-seat="${i}" data-hero="-1" title="Случайный герой">🎲</span>${F.heroes.map((c, k) => `<span class="${p.hero === k ? 'on' : ''}" data-seat="${i}" data-hero="${k}" title="${c.name} — ${SPECS[c.spec].name}: ${SPECS[c.spec].desc}">${c.em}</span>`).join('')}</div>
      <small>${hc ? `<b>${hc.name}</b> · ★ ${SPECS[hc.spec].name}: ${SPECS[hc.spec].desc}` : 'Герой: какой придёт'}</small>
      ${p.kind === 'bot' ? `<div class="seg wide">${DIFF.map((d, k) => `<span class="${p.diff === k ? 'on' : ''}" data-seat="${i}" data-diff="${k}" title="${d.desc}">${d.em} ${d.name}</span>`).join('')}</div><small>${DIFF[p.diff].desc}</small>` : ''}</div>`;
  };
  $('pset').innerHTML = seats.map(card).join('');
  const act = seats.filter(p => p.kind !== 'off'), hum = act.filter(p => p.kind === 'human').length;
  $('lobbyNote').textContent = act.length < 2 ? 'Нужно хотя бы две бригады' : !hum ? 'Нужен хотя бы один человек' : `Бригад: ${act.length} · людей: ${hum}, ботов: ${act.length - hum}${act.length > 3 ? ' · карта больше обычной' : ''}`;
  $('newBtn').disabled = act.length < 2 || !hum;
  document.querySelectorAll('[data-pn]').forEach(el => el.oninput = () => { seats[+el.dataset.pn].name = el.value; saveLobby(); });
  document.querySelectorAll('#pset [data-seat]').forEach(el => el.onclick = () => {
    const p = seats[+el.dataset.seat], d = el.dataset;
    if (d.kind) p.kind = d.kind;
    if (d.fac && d.fac !== p.fac) { p.fac = d.fac; p.hero = -1; }
    if (d.hero) p.hero = +d.hero;
    if (d.diff) p.diff = +d.diff;
    sfx('click'); saveLobby(); renderMenu();
  });
  $('contBtn').disabled = !hasSave();
}
$('newBtn').onclick = () => {
  audioInit();
  if (hasSave() && !confirm('Начать новую игру? Сохранённая партия пропадёт.')) return;
  const players = seats.map((p, i) => ({ ...p, col: PCOL[i], name: p.name.trim() || PCOL_NAME[i] })).filter(p => p.kind !== 'off');
  genMap({ players });
  startPlaying();
};
$('contBtn').onclick = () => { audioInit(); if (loadGame()) startPlaying(); else toast('Сохранение не читается', true); };
$('menuLink').onclick = e => { e.preventDefault(); if (BUSY || BOTTING || B) return; saveGame(); $('menu').hidden = false; renderMenu(); };
function startPlaying() { prerender(); $('menu').hidden = true; refresh(); beginTurn(); }
function showVictory(p) {
  BOTTING = false;
  const bot = p.kind === 'bot', title = bot ? `🤖 ${p.name} забирают Москву` : `🏆 ${p.name} забирают Москву!`;
  const text = bot ? `Людей в городе не осталось — всё поделили боты. День ${G.day}. Реванш?` : `Остальные бригады распались. День ${G.day}. ${FACTIONS[p.fac].em} ${FACTIONS[p.fac].name} — хозяева города.`;
  ask(title, `<div class="fun" style="font-size:22px">${text}</div>`, ['В меню'], { pid: -1 })
    .then(() => { $('menu').hidden = false; renderMenu(); });
}
addEventListener('keydown', e => { if (e.code === 'Escape' && !$('town').hidden) closeTown(); });
renderMenu();
