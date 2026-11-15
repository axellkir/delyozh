'use strict';
// Окна: диалоги, шторка между ходами, город, обмен армиями, меню, кнопки боя, победа.

// opt.pid — для какой бригады окно (по умолчанию — чей ход). За бота отвечает он сам, окно не показывается.
function ask(title, html, buttons, opt) {
  const pid = opt && opt.pid != null ? opt.pid : G ? G.cur : -1;
  if ((isBot(pid) || netRemote(pid)) && !G.over) return Promise.resolve(botAnswer(pid, title, buttons)); // за игрока с другого компьютера окна тоже не показываем
  return new Promise(res => {
    $('mTitle').innerHTML = title; $('mBody').innerHTML = html;
    $('mBtns').innerHTML = buttons.map((b, i) => `<button data-i="${i}" class="${i ? 'sec' : ''}">${b}</button>`).join('');
    $('modal').hidden = false;
    $('mBtns').querySelectorAll('button').forEach(el => el.onclick = () => { sfx('click'); $('modal').hidden = true; res(+el.dataset.i); });
  });
}
function curtain(p) {
  return new Promise(res => {
    $('cName').textContent = `Ход: ${p.name}`; $('cName').style.color = p.col;
    $('cSub').innerHTML = `${ico('t_' + p.fac, 32)} ${FACTIONS[p.fac].name} · неделя ${weekNo()}, день ${dayOfWeek()}`;
    $('curtain').hidden = false; sfx('turn'); $('toast').style.opacity = 0;
    $('curtain').onclick = () => { audioInit(); $('curtain').hidden = true; res(); };
  });
}

// ---------- армии ----------
let SLOT = null; // выбранный слот: {key, i}
function armyRow(arr, key, title) {
  return `<div class="army"><h3>${title}</h3><div class="slots">${arr.map((a, i) => `<div class="slot ${SLOT && SLOT.key === key && SLOT.i === i ? 'sel' : ''}" data-ak="${key}" data-ai="${i}" title="${a ? UNITS[a.u].name : 'пусто'}">${a ? unitIcon(a.u, 40) + `<b>${a.n}</b>` : ''}</div>`).join('')}</div></div>`;
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
    const st = buildState(t, b), label = { built: `${ico('i_ok', 14)} построено`, req: `нужно: ${b.req && BLD[b.req].name}`, today: 'сегодня уже строили', money: 'не хватает', ok: '' }[st];
    const name = b.tier ? `${b.name}: ${unitIcon(units[b.tier - 1], 24)}` : b.name;
    return `<div class="bcard ${st === 'built' ? 'built' : ''}"><b>${name}</b><span>${b.desc}</span><span>${st === 'built' ? '' : costText(b.cost)}</span>${st === 'ok' ? `<button data-b="${b.id}">Построить</button>` : `<small>${label}</small>`}</div>`;
  };
  const rcard = (u, i) => {
    const U = UNITS[u], ok = t.built['dw' + (i + 1)], n = t.avail[u] || 0, mx = maxRecruit(t, u);
    return `<div class="rcard ${ok ? '' : 'lock'}"><div class="em">${unitIcon(u, 64)}</div><b>${U.name}</b><br>${ico('i_att', 16)}${U.att} ${ico('i_def', 16)}${U.def} ${ico('i_hp', 16)}${U.hp} ${ico('i_spd', 16)}${U.spd}<br>урон ${U.dmg[0]}–${U.dmg[1]}${U.shots ? ' · стрелок' : ''}${U.fly ? ' · прыгает' : ''}<br><i>${U.note || '&nbsp;'}</i><br>
      цена ${costText(U.cost)}<br>доступно: <b>${ok ? n : '—'}</b><br>${ok ? `<div class="btns" style="justify-content:center;margin-top:4px"><button data-r="${u}" data-n="1" ${mx ? '' : 'disabled'}>+1</button><button data-r="${u}" data-n="${mx}" ${mx ? '' : 'disabled'}>Все (${mx})</button></div>` : ''}</div>`;
  };
  const market = t.built.market ? `<h3>Барахолка</h3><div class="btns">${['fuel', 'brick'].map(r => `<button data-buy="${r}">Купить ${resIco(r)} за ${TRADE_BUY}${resIco('gold', 16)}</button><button class="sec" data-sell="${r}">Продать ${resIco(r)} за ${TRADE_SELL}${resIco('gold', 16)}</button>`).join('')}</div>` : '';
  $('townBox').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px">${ico('t_' + t.fac, 64)}<div><div class="fun" style="font-size:16px;color:${p.col}">${t.name}</div><small>${F.name} · ${F.desc}</small></div>
      <div style="margin-left:auto;font-size:18px;font-weight:bold">${RES.map(r => `${resIco(r)} ${p.res[r]}`).join(' &nbsp; ')}</div><button id="tClose">Выйти (Esc)</button></div>
    <h3 style="margin-top:12px">Стройка — одно здание в день</h3><div class="tgrid">${BUILDINGS.map(bcard).join('')}</div>
    <h3>Найм — новые бойцы приходят по понедельникам</h3><div class="rgrid">${units.map(rcard).join('')}</div>
    <div class="row">${armyRow(t.garrison, 'g', 'Гарнизон (охраняет город)')}${hero ? armyRow(hero.army, 'h', `${heroIco(hero, 24)} ${hero.name}`) : ''}</div>
    <div class="btns" style="margin:10px 0">${hero ? '<button class="sec" id="allH">Всех к герою</button><button class="sec" id="allG">Всех в гарнизон</button>' : `<button id="hire">Нанять героя за ${HERO_COST}${resIco('gold', 16)}</button>`}<small style="align-self:center">Клик по отряду, потом по другому месту — переставить или объединить.</small></div>
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
      $('exchBox').innerHTML = `<div class="fun" style="font-size:16px;color:var(--gold)">Встреча</div><div class="row">${armyRow(a.army, 'a', `${heroIco(a, 24)} ${a.name}`)}${armyRow(b.army, 'b', `${heroIco(b, 24)} ${b.name}`)}</div>
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
  const nm = sd => sd.hero ? `${heroIco(sd.hero, 24)} ${sd.hero.name}` : sd.owner >= 0 ? `гарнизон (${G.players[sd.owner].name})` : 'местные';
  const s = B.active, sd = s && B.sides[s.side];
  $('bTop').innerHTML = `${B.title} · раунд ${B.round}<br><span style="font-size:10px"><span style="color:${B.sides[0].owner >= 0 ? pcol(B.sides[0].owner) : '#aaa'}">${nm(B.sides[0])}</span> против <span style="color:${B.sides[1].owner >= 0 ? pcol(B.sides[1].owner) : '#aaa'}">${nm(B.sides[1])}</span>${s ? ` · ходят: ${unitIcon(s.u, 20)} ${UNITS[s.u].name}` : ''}${B.spell ? ' · выберите цель для «' + B.spell.name + '»' : ''}${B.need >= 0 && !(B.mirror && B.wait) ? ' · ждём соперника' : ''}</span>`;
  $('bLog').innerHTML = B.log.join('<br>');
  const human = s && !sd.auto && !(sd.remote && !B.mirror) && (!B.mirror || !!B.wait);
  ['bWait', 'bDef', 'bAuto'].forEach(id => { $(id).disabled = !human; });
  $('bCast').disabled = !(human && sd.hero && canCast(sd) && sd.hero.mana >= 4);
  $('bCast').innerHTML = `${ico('i_pow', 16)} Понты (C)${sd && sd.hero ? ` ${ico('i_mana', 16)}${sd.hero.mana}` : ''}`;
}
function toggleSpells() {
  if (!B || !B.active) return;
  const sd = B.sides[B.active.side];
  if (!$('bSpells').hidden) { $('bSpells').hidden = true; return; }
  if (!sd.hero || sd.auto) return;
  $('bSpells').innerHTML = SPELLS.map(sp => `<button data-sp="${sp.id}" ${sd.hero.mana < sp.cost || !canCast(sd) ? 'disabled' : ''}>${ico('s_' + sp.id, 20)} ${sp.name} — ${sp.cost}${ico('i_mana', 14)}<small>${sp.desc(sd.st.pow)}</small></button>`).join('');
  $('bSpells').hidden = false;
  $('bSpells').querySelectorAll('[data-sp]').forEach(el => el.onclick = () => { $('bSpells').hidden = true; chooseSpell(el.dataset.sp); });
}
$('goBtn').innerHTML = `${ico('i_play', 16)} Продолжить путь (Пробел)`;
$('endBtn').innerHTML = `${ico('i_next', 18)} Конец хода (Enter)`;
$('bWait').innerHTML = `${ico('i_wait', 16)} Ждать (W)`;
$('bDef').innerHTML = `${ico('i_def', 16)} Оборона (D)`;
$('bAuto').innerHTML = `${ico('i_bot', 16)} Авто (A)`;
$('contBtn').innerHTML = `${ico('i_save', 22)} Продолжить`;
$('bWait').onclick = () => battleWait();
$('bDef').onclick = () => battleDefend();
$('bCast').onclick = () => toggleSpells();
$('bAuto').onclick = () => battleAuto();

// ---------- лобби ----------
// Шесть мест. На каждом — человек, бот или никого; бригада, стартовый герой, для бота — сложность.
const LOBBY_KEY = 'delyozh_lobby_v1';
const KINDS = [['human', 'i_human', 'Человек'], ['bot', 'i_bot', 'Бот'], ['off', 'i_x', 'Закрыто']];
let seats = PCOL_NAME.map((n, i) => ({ kind: i < 3 ? 'human' : 'off', name: n, fac: FAC_IDS[i % FAC_IDS.length], hero: -1, diff: 1 }));
try {
  const saved = JSON.parse(localStorage.getItem(LOBBY_KEY) || 'null');
  if (Array.isArray(saved)) saved.slice(0, MAX_PLAYERS).forEach((x, i) => { if (x && FACTIONS[x.fac] && KINDS.some(k => k[0] === x.kind)) seats[i] = { kind: x.kind, name: String(x.name || PCOL_NAME[i]).slice(0, 16), fac: x.fac, hero: FACTIONS[x.fac].heroes[x.hero] ? x.hero : -1, diff: DIFF[x.diff] ? x.diff : 1 }; });
} catch (e) { /* настройки лобби не обязательны */ }
const saveLobby = () => { try { localStorage.setItem(LOBBY_KEY, JSON.stringify(seats)); } catch (e) { /* не страшно */ } };
const MAPS = [['msk', 'Москва 90-х', 'Настоящая Москва: река, мосты, шоссе, Лужники, Черкизон, Останкино. У каждого свой район, поровну добра вокруг.'], ['ring', 'Схема', 'Симметричная схема из одинаковых секторов — когда нужен совсем честный расклад.']];
let mapKind = 'msk';
try { if (localStorage.getItem('delyozh_map') === 'ring') mapKind = 'ring'; } catch (e) { /* не страшно */ }
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderMenu() {
  // в сетевой комнате места общие и приходят с сервера; за одним компьютером — свои, из настроек
  const R = NET.on && NET.room && NET.room.state === 'lobby' ? NET.room : null, list = R ? R.seats : seats, host = !R || R.host;
  const card = (p, i) => {
    const F = FACTIONS[p.fac], hc = F.heroes[p.hero], on = p.kind !== 'off';
    const edit = R ? p.owner === 'me' || (host && !p.owner) : true; // кто может менять бригаду и героя на этом месте
    const head = `<div class="phead"><b style="color:${PCOL[i]}"><i class="dot" style="background:${PCOL[i]}"></i>${PCOL_NAME[i]}</b><div class="seg ${host ? '' : 'ro'}">${KINDS.map(([k, em, t]) => `<span class="${p.kind === k ? 'on' : ''}" data-seat="${i}" data-kind="${k}" title="${t}">${ico(em, 18)}</span>`).join('')}</div></div>`;
    if (!on) return `<div class="pcard off" style="border-color:${PCOL[i]}">${head}<div class="poff">место закрыто${host ? `<br><small>нажмите ${ico('i_human', 14)} или ${ico('i_bot', 14)}</small>` : ''}</div></div>`;
    let who = '';
    if (R && p.kind === 'human') who = p.owner === 'me' ? `<small><i class="dot on"></i>это вы${list.filter(x => x.owner === 'me').length > 1 ? ' (ещё одно место за этим компьютером)' : ''} · <a href="#" data-seat="${i}" data-leave="1">встать</a></small>`
      : p.owner ? `<small><i class="dot ${p.online ? 'on' : ''}"></i>${esc(p.ownerName || 'игрок')}${host ? ` · <a href="#" data-seat="${i}" data-leave="1">убрать</a>` : ''}</small>`
        : `<button data-seat="${i}" data-claim="1">Сесть сюда</button>`;
    return `<div class="pcard" style="border-color:${PCOL[i]}">${head}
      <input data-pn="${i}" value="${esc(p.name)}" maxlength="16" placeholder="Название бригады" ${edit ? '' : 'disabled'}>${who}
      <div class="seg wide ${edit ? '' : 'ro'}">${FAC_IDS.map(f => `<span class="${p.fac === f ? 'on' : ''}" data-seat="${i}" data-fac="${f}" title="${FACTIONS[f].desc}">${ico('t_' + f, 18)} ${FACTIONS[f].name[0] + FACTIONS[f].name.slice(1).toLowerCase()}</span>`).join('')}</div>
      <small>${F.desc}</small>
      <div class="seg wide heroes ${edit ? '' : 'ro'}"><span class="${hc ? '' : 'on'}" data-seat="${i}" data-hero="-1" title="Случайный герой">${ico('i_dice', 28)}</span>${F.heroes.map((c, k) => `<span class="${p.hero === k ? 'on' : ''}" data-seat="${i}" data-hero="${k}" title="${c.name} — ${SPECS[c.spec].name}: ${SPECS[c.spec].desc}">${ico('h_' + c.name, 28)}</span>`).join('')}</div>
      <small>${hc ? `<b>${hc.name}</b> · ${ico('i_star', 12)} ${SPECS[hc.spec].name}: ${SPECS[hc.spec].desc}` : 'Герой: какой придёт'}</small>
      ${p.kind === 'bot' ? `<div class="seg wide ${host ? '' : 'ro'}">${DIFF.map((d, k) => `<span class="${p.diff === k ? 'on' : ''}" data-seat="${i}" data-diff="${k}" title="${d.desc}">${ico('d_' + k, 16)} ${d.name}</span>`).join('')}</div><small>${DIFF[p.diff].desc}</small>` : ''}</div>`;
  };
  $('pset').innerHTML = list.map(card).join('');
  const act = list.filter(p => p.kind !== 'off'), hum = act.filter(p => p.kind === 'human').length, free = R ? act.filter(p => p.kind === 'human' && !p.owner).length : 0;
  $('lobbyNote').textContent = act.length < 2 ? 'Нужно хотя бы две бригады' : !hum ? 'Нужен хотя бы один человек'
    : free ? `Ждём игроков: свободных мест ${free}. Отправьте друзьям ссылку или код комнаты.`
      : `Бригад: ${act.length} · людей: ${hum}, ботов: ${act.length - hum}${act.length > 3 ? ' · карта больше обычной' : ''}${R && !host ? ' · ждём, когда хозяин комнаты начнёт' : ''}`;
  $('newBtn').disabled = act.length < 2 || !hum || free > 0 || !host;
  $('newBtn').innerHTML = R ? `${ico('i_play', 22)} Начать партию` : `${ico('i_dice', 22)} Новая игра`;
  $('contBtn').hidden = !!R;
  document.querySelectorAll('[data-pn]').forEach(el => {
    if (R) el.onchange = () => netOp('set', { seat: +el.dataset.pn, seatName: el.value });
    else el.oninput = () => { seats[+el.dataset.pn].name = el.value; saveLobby(); };
  });
  document.querySelectorAll('#pset [data-seat]').forEach(el => el.onclick = e => {
    const i = +el.dataset.seat, d = el.dataset;
    if (el.closest('.ro')) return;
    sfx('click');
    if (R) {
      e.preventDefault();
      if (d.claim) netOp('claim', { seat: i });
      else if (d.leave) netOp('leave', { seat: i });
      else if (d.kind) netOp('kind', { seat: i, kind: d.kind });
      else netOp('set', { seat: i, ...(d.fac && { fac: d.fac }), ...(d.hero && { hero: +d.hero }), ...(d.diff && { diff: +d.diff }) });
      return;
    }
    const p = seats[i];
    if (d.kind) p.kind = d.kind;
    if (d.fac && d.fac !== p.fac) { p.fac = d.fac; p.hero = -1; }
    if (d.hero) p.hero = +d.hero;
    if (d.diff) p.diff = +d.diff;
    saveLobby(); renderMenu();
  });
  const mk = R ? R.map : mapKind;
  $('mapSeg').className = 'seg' + (host ? '' : ' ro');
  $('mapSeg').innerHTML = MAPS.map(([k, t, d]) => `<span class="${mk === k ? 'on' : ''}" data-map="${k}" title="${d}">${ico(k === 'msk' ? 'i_map' : 'i_ring', 18)} ${t}</span>`).join('');
  $('mapNote').textContent = MAPS.find(m => m[0] === mk)[2];
  document.querySelectorAll('[data-map]').forEach(el => el.onclick = () => {
    if (!host) return;
    sfx('click');
    if (R) { netOp('map', { map: el.dataset.map }); return; }
    mapKind = el.dataset.map; try { localStorage.setItem('delyozh_map', mapKind); } catch (e) { /* не страшно */ } renderMenu();
  });
  renderNetBar(R);
  $('contBtn').disabled = !hasSave();
}
// Полоса «по сети»: создать комнату, войти по коду, список открытых комнат; в комнате — код и ссылка
function renderNetBar(R) {
  const el = $('netBar');
  if (R) {
    el.innerHTML = `<b>${ico('i_net', 20)} Комната <span class="code">${R.code}</span></b> <button class="sec" id="netCopy">Скопировать ссылку</button>
      ${R.host ? `<label><input type="checkbox" id="netPub" ${R.public ? 'checked' : ''}> видна в списке открытых</label>` : `<small>хозяин: ${esc(R.hostName)}</small>`}
      <button class="sec" id="netOut">Выйти из комнаты</button>`;
    $('netCopy').onclick = () => { const link = location.origin + location.pathname + '?room=' + R.code; (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Ссылка скопирована', true), () => prompt('Ссылка на комнату:', link)); };
    if (R.host) $('netPub').onchange = e => netOp('public', { public: e.target.checked });
    $('netOut').onclick = () => netLeave();
    return;
  }
  if (NET.list === undefined) NET.list = null;
  const rooms = NET.list || [];
  el.innerHTML = `<b>${ico('i_net', 20)} По сети:</b> <input id="netName" placeholder="Ваше имя" maxlength="16" value="${esc(NET.name)}" style="width:120px">
    <button id="netNew">Создать комнату</button><label><input type="checkbox" id="netNewPub"> открытая</label>
    <span>или код</span> <input id="netCode" maxlength="5" placeholder="ABCDE" style="width:74px;text-transform:uppercase"><button class="sec" id="netGo">Войти</button>
    <button class="sec" id="netRef" title="Обновить список открытых комнат">обновить</button>
    <div id="netRooms">${rooms.length ? rooms.map(r => `<span class="room" data-room="${r.code}">${ico('i_door', 16)} ${esc(r.hostName)} · ${MAPS.find(m => m[0] === r.map)[1]} · свободно мест: ${r.free} из ${r.humans}${r.bots ? ` · ботов: ${r.bots}` : ''}</span>`).join('') : '<small>Открытых комнат сейчас нет. Создайте свою и отправьте друзьям ссылку.</small>'}</div>`;
  const name = () => { NET.name = $('netName').value.trim().slice(0, 16); try { localStorage.setItem('delyozh_name', NET.name); } catch (e) { /* не страшно */ } return NET.name; };
  const go = fn => { audioInit(); if (!name()) { toast('Сначала впишите своё имя', true); $('netName').focus(); return; } fn().catch(e => toast(e.message, true)); };
  $('netName').onchange = name;
  $('netNew').onclick = () => go(() => netCreate($('netNewPub').checked));
  $('netGo').onclick = () => go(() => netJoin($('netCode').value));
  $('netRef').onclick = () => netList();
  el.querySelectorAll('[data-room]').forEach(x => x.onclick = () => go(() => netJoin(x.dataset.room)));
}
$('newBtn').onclick = () => {
  audioInit();
  if (NET.on && NET.room) { netStart(); return; }
  if (hasSave() && !confirm('Начать новую игру? Сохранённая партия пропадёт.')) return;
  const players = seats.map((p, i) => ({ ...p, seat: i, col: PCOL[i], name: p.name.trim() || PCOL_NAME[i] })).filter(p => p.kind !== 'off');
  genMap({ players, map: mapKind });
  startPlaying();
};
$('contBtn').onclick = () => { audioInit(); if (loadGame()) startPlaying(); else toast('Сохранение не читается', true); };
$('menuLink').onclick = e => {
  e.preventDefault();
  if (NET.on) { if (confirm('Выйти из сетевой партии? Вернуться можно по той же ссылке.')) netLeave(); return; }
  if (BUSY || BOTTING || B) return;
  saveGame(); $('menu').hidden = false; renderMenu(); netList();
};
function startPlaying() { prerender(); $('menu').hidden = true; refresh(); beginTurn(); }
function showVictory(p) {
  BOTTING = false;
  const bot = p.kind === 'bot', title = bot ? `${ico('i_bot', 24)} ${p.name} забирают Москву` : `${ico('i_cup', 24)} ${p.name} забирают Москву!`;
  const text = bot ? `Людей в городе не осталось — всё поделили боты. День ${G.day}. Реванш?` : `Остальные бригады распались. День ${G.day}. ${FACTIONS[p.fac].name} — хозяева города.`;
  ask(title, `<div style="font-size:18px">${text}</div>`, ['В меню'], { pid: -1 })
    .then(() => { if (NET.on) netLeave(); else { $('menu').hidden = false; renderMenu(); } });
}
addEventListener('keydown', e => { if (e.code === 'Escape' && !$('town').hidden) closeTown(); });
renderMenu();
netList();
