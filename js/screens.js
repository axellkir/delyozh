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
  return new Promise(res => { SLOT = null; townDone = res; $('town').hidden = false; $('toast').style.opacity = 0; renderTown(t, hero); });
}
function closeTown() { $('town').hidden = true; SLOT = null; refresh(); if (townDone) { const r = townDone; townDone = null; r(); } }
// значки зданий хозяйства и защиты
const BICON = { adm1: 'r_gold', adm2: 'whitehouse', market: 'stall', bank: 'chest', garage: 'champ', gym: 'b_att', fence: 'o_fence', club: 'amp' };
function renderTown(t, hero) {
  const keep = [...document.querySelectorAll('#townBox .tcol')].map(c => c.scrollTop);
  hero = hero && heroById(hero.id) && hero.x === t.x && hero.y === t.y ? hero : heroAt(t.x, t.y);
  if (hero && hero.owner !== t.owner) hero = null;
  const p = G.players[t.owner], F = FACTIONS[t.fac], units = F.units, today = t.builtDay === G.day;
  // плитка постройки: значок и имя, одна строка описания, внизу цена с кнопкой — или что мешает
  const tile = id => {
    const b = BLD[id], st = buildState(t, b), need = [].concat(b.req || []).filter(r => !t.built[r]).map(r => BLD[r].name).join(', ');
    const icon = b.tier ? unitIcon(units[b.tier - 1], 24) : b.up ? unitIcon(units[b.up - 1] + '2', 24) : ico(BICON[id] || 'i_ok', 22);
    const name = b.id === 'club' ? F.club.name : b.name;
    const desc = b.tier ? `Найм: ${UNITS[units[b.tier - 1]].name}` : b.up ? `${UNITS[units[b.up - 1]].name} → ${UNITS[units[b.up - 1] + '2'].name}` : b.id === 'club' ? `Герою один раз: ${F.club.text}` : b.desc;
    const foot = st === 'built' ? `${ico('i_ok', 12)} построено`
      : st === 'req' ? `<span class="need" title="нужно: ${need}">нужно: ${need}</span>`
        : `<span class="cost">${costText(b.cost)}</span>${st === 'ok' ? `<button class="sm" data-b="${b.id}">Построить</button>` : `<span class="note">${st === 'today' ? 'завтра' : 'не хватает'}</span>`}`;
    return `<div class="bt ${st === 'built' ? 'built' : st === 'ok' ? 'ok' : st === 'req' ? 'lock' : ''}" title="${name}: ${desc}"><div class="t1">${icon}<span>${name}</span>${st === 'built' ? `<span class="done">${ico('i_ok', 12)} есть</span>` : ''}</div><div class="ds">${desc}</div><div class="ft">${foot}</div></div>`;
  };
  // строка найма: боец, его цифры и особенность, справа — сколько есть и кнопки
  const rrow = (u, i) => {
    const v = townUnit(t, i), U = UNITS[v], ok = t.built['dw' + (i + 1)], n = t.avail[u] || 0, mx = maxRecruit(t, u);
    const act = ok ? `<span>есть: <b>${n}</b> · ${costText(U.cost)}</span><div class="btns"><button class="sm" data-r="${u}" data-n="1" ${mx ? '' : 'disabled'}>+1</button><button class="sm" data-r="${u}" data-n="${mx}" ${mx ? '' : 'disabled'}>Все ${mx}</button></div>`
      : `<span class="need">нужно: ${BLD['dw' + (i + 1)].name}</span>`;
    return `<div class="rr ${ok ? '' : 'lock'}"><span class="ic">${unitIcon(v, 44)}</span><span class="nm">${U.name} <small style="color:#9a8fa0;font-weight:normal">${i + 1} ур.</small></span>
      <span class="st2">${ico('i_att', 12)}${U.att} ${ico('i_def', 12)}${U.def} ${ico('i_hp', 12)}${U.hp} ${ico('i_spd', 12)}${U.spd} · урон ${U.dmg[0]}–${U.dmg[1]}${U.shots ? ` · ${ico('i_shot', 12)}${U.shots}` : ''}</span>
      <span class="tr" title="${U.note || ''}">${U.note || ''}</span><span class="act">${act}</span></div>`;
  };
  const upList = [...t.garrison, ...(hero ? hero.army : [])].map(x => upgradeCost(t, x)).filter(Boolean), upSum = upList.reduce((a, c) => a + c, 0), upMin = upList.length ? Math.min(...upList) : 0;
  const jl = myJailed(t.owner), held = jail().filter(j => j.at === t.id && j.captor === t.owner && j.hero.owner !== t.owner);
  const extra = [
    jl.length ? `<div class="sect"><h3>Наши в неволе</h3>${jl.map((j, k) => `<div class="mrow">${heroIco(j.hero, 24)}<span style="flex:1">${j.hero.name}, ур. ${j.hero.lvl}<br><small style="color:#9a8fa0">${jailPlace(j)}</small></span><button class="sm" data-ran="${k}">${ransomOf(j) ? `Выкупить: ${ransomOf(j)}${resIco('gold', 14)}` : 'Позвать'}</button></div>`).join('')}</div>` : '',
    held.length ? `<div class="sect"><small style="color:#c9bcd2">Здесь держат пленных: ${held.map(j => `${j.hero.name} (${G.players[j.hero.owner].name}), выкуп ${ransomOf(j)}`).join('; ')}. Возьмут город — пленные уйдут.</small></div>` : '',
    (p.heat || 0) >= 10 ? `<div class="sect"><h3>Розыск: ${p.heat} из 100<span>${p.heat >= HEAT_RAID ? 'в понедельник приедет ОМОН' : p.heat >= HEAT_WARN ? 'вышла ориентировка' : ''}</span></h3>${t.built.adm1 ? `<button class="sm" id="bribeBtn" ${p.res.gold >= bribeCost(p) ? '' : 'disabled'}>Занести через Управу: ${bribeCost(p)}${resIco('gold', 14)}</button>` : '<small style="color:#9a8fa0">Откупиться можно в городе с Управой</small>'}</div>` : '',
    t.built.market ? `<div class="sect"><h3>Барахолка<span>${G.def && G.def.done ? 'после дефолта всё втрое дороже' : ''}</span></h3>${['fuel', 'brick'].map(r => `<div class="mrow"><span>${resIco(r, 16)} ${RES_NAME[r]}</span><button class="sm" data-buy="${r}">Купить за ${tradeBuy()}${resIco('gold', 14)}</button><button class="sec sm" data-sell="${r}">Продать за ${tradeSell()}${resIco('gold', 14)}</button></div>`).join('')}</div>` : '',
  ].join('');
  $('townBox').innerHTML = `
    <div class="th">${ico('t_' + t.fac, 48)}<div><div class="nm" style="color:${p.col}">${t.name}</div><small>${F.name} · ${F.desc}</small></div>
      <div class="chips">${RES.map(r => `<span class="chip">${resIco(r, 18)} ${p.res[r]}</span>`).join('')}</div><button id="tClose">Выйти <kbd>Esc</kbd></button></div>
    <div class="tb">
      <div class="tcol">
        <h3>Бойцы<span>${today ? 'сегодня уже строили — следующее здание завтра' : 'одно здание в день'}</span></h3>
        <div class="bgrid">${[1, 2, 3, 4, 5].map(i => tile('dw' + i) + tile('up' + i)).join('')}</div>
        <h3>Хозяйство и защита</h3><div class="bgrid b3">${['adm1', 'adm2', 'market', 'bank', 'garage', 'gym', 'fence', 'club'].map(tile).join('')}</div>
      </div>
      <div class="tcol">
        <h3>Найм<span>новые бойцы приходят по понедельникам</span></h3>
        ${units.map(rrow).join('')}
        <div class="sect">${armyRow(t.garrison, 'g', 'Гарнизон')}</div>
        <div class="sect">${hero ? armyRow(hero.army, 'h', `${heroIco(hero, 18)} ${hero.name}`) : `<h3>Героя в городе нет</h3>`}</div>
        <div class="btns" style="margin-top:8px">${hero ? '<button class="sec sm" id="allH">Всех к герою</button><button class="sec sm" id="allG">Всех в гарнизон</button>' : `<button class="sm" id="hire">Нанять героя: ${HERO_COST}${resIco('gold', 14)}</button>`}${upSum ? `<button class="sm" id="upAll" ${p.res.gold >= upMin ? '' : 'disabled'}>Переобуть в улучшенных: ${upSum}${resIco('gold', 14)}</button>` : ''}</div>
        <small style="color:#9a8fa0;display:block;margin-top:4px">Клик по отряду, потом по другому месту — переставить или объединить.</small>
        ${extra}
      </div>
    </div>`;
  document.querySelectorAll('#townBox .tcol').forEach((c, i) => { c.scrollTop = keep[i] || 0; });
  const R = () => renderTown(t, hero), box = $('townBox');
  $('tClose').onclick = closeTown;
  box.querySelectorAll('[data-ran]').forEach(el => el.onclick = () => { const r = ransom(t, jl[+el.dataset.ran]); if (typeof r === 'string') toast(r, true); else { selectHero(r); hero = r; } R(); });
  if ($('bribeBtn')) $('bribeBtn').onclick = () => { const r = bribe(t.owner); toast(r === true ? 'Розыск снят' : r, true); R(); };
  if ($('upAll')) $('upAll').onclick = () => { if (!upgradeAll(t, hero)) toast('Не хватает бабла'); R(); };
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
      $('exchBox').innerHTML = `<div class="fun" style="font-size:14px;color:var(--gold);margin-bottom:10px">${ico('i_meet', 20)} Встреча</div><small style="color:#9a8fa0;display:block;margin-bottom:8px">Клик по отряду, потом по другому месту — переставить или объединить.</small><div class="row">${armyRow(a.army, 'a', `${heroIco(a, 24)} ${a.name}`)}${armyRow(b.army, 'b', `${heroIco(b, 24)} ${b.name}`)}</div>
        <div class="btns" style="margin-top:12px"><button id="xClose">Готово</button></div>`;
      bindSlots($('exchBox'), { a: { arr: a.army, hero: true }, b: { arr: b.army, hero: true } }, R);
      $('xClose').onclick = () => { $('exch').hidden = true; refresh(); res(); };
    };
    R();
  });
}

// ---------- бой ----------
function battleUI(on) { $('bui').hidden = !on; closeSpells(); if (on) refreshBattleUI(); }
const btnLbl = (icon, text, key) => `${ico(icon, 16)}<span class="lbl">${text}</span><kbd>${key}</kbd>`;
function refreshBattleUI() {
  if (!B || B.quick) return;
  const nm = sd => sd.hero ? `${heroIco(sd.hero, 24)} ${sd.hero.name}` : sd.owner >= 0 ? `гарнизон (${G.players[sd.owner].name})` : 'местные';
  const s = B.active, sd = s && B.sides[s.side];
  $('bTop').innerHTML = `${B.title} · ${ARENAS[B.arena].name} · раунд ${B.round}<br><span style="font-size:10px"><span style="color:${B.sides[0].owner >= 0 ? pcol(B.sides[0].owner) : '#aaa'}">${nm(B.sides[0])}</span> против <span style="color:${B.sides[1].owner >= 0 ? pcol(B.sides[1].owner) : '#aaa'}">${nm(B.sides[1])}</span>${s ? ` · ходят: ${UNITS[s.u].name}` : ''}${B.need >= 0 && !(B.mirror && B.wait) ? ' · ждём соперника' : ''}</span>`;
  $('bLog').innerHTML = B.log.slice(0, 3).map(l => `<div>${l}</div>`).join('');
  // очередь ходов: кто ходит сейчас и следующие
  const col = st => (B.sides[st.side].owner >= 0 ? pcol(B.sides[st.side].owner) : '#777');
  $('bQueue').innerHTML = [s, ...B.queue.filter(alive)].filter(Boolean).slice(0, 14).map((st, i) => `<span class="qi ${i ? '' : 'on'}" style="background:${col(st)}" title="${UNITS[st.u].name} ×${st.n}">${unitIcon(st.u, 32)}<b>${st.n}</b></span>`).join('');
  const human = s && !sd.auto && !(sd.remote && !B.mirror) && (!B.mirror || !!B.wait);
  ['bWait', 'bDef', 'bAuto'].forEach(id => { $(id).disabled = !human; });
  $('bCast').disabled = !(human && sd.hero && canCast(sd) && sd.hero.mana >= 4);
  $('bCast').innerHTML = `${ico('i_pow', 16)}<span class="lbl">Понты</span>${sd && sd.hero ? ` ${ico('i_mana', 14)}${sd.hero.mana}` : ''}<kbd>C</kbd>`;
  $('bCast').classList.toggle('on', !$('bSpells').hidden);
  if (!human && !$('bSpells').hidden) closeSpells();                              // ход ушёл — меню больше не нужно
  if (B.spell && human) $('bInfo').innerHTML = `Выберите ${B.spell.target === 'enemy' ? 'вражеский' : 'свой'} отряд для «${B.spell.name}» · Esc или правый клик — отмена`;
}
function closeSpells() { $('bSpells').hidden = true; $('bCast').classList.remove('on'); }
function cancelSpell() { if (!B) return; B.spell = null; $('bInfo').innerHTML = ''; refreshBattleUI(); }
function toggleSpells() {
  if (!B || !B.active) return;
  if (!$('bSpells').hidden) { closeSpells(); return; }
  const sd = B.sides[B.active.side];
  if (!sd.hero || sd.auto || $('bCast').disabled) return;
  const why = sp => (sp.ult && sd.ultUsed ? 'уже был в этом бою' : !canCast(sd) ? 'в этом раунде уже понтовались' : sd.hero.mana < sp.cost ? 'мало понтов' : '');
  $('bSpells').innerHTML = `<div class="sh"><span>Понты героя · ${ico('i_mana', 12)} ${sd.hero.mana}</span><button id="spClose" title="Закрыть (Esc)">${ico('i_x', 12)}</button></div>`
    + spellList(sd).map(sp => `<button class="sp ${sp.ult ? 'ult' : ''}" data-sp="${sp.id}" ${why(sp) ? 'disabled' : ''}>${ico(sp.ult ? 'i_star' : 's_' + sp.id, 20)}<span>${sp.ult ? 'Коронный: ' : ''}${sp.name}</span><span class="c">${sp.cost}${ico('i_mana', 12)}</span><small>${sp.desc(sd.st.pow)}${why(sp) ? ` · <span class="why">${why(sp)}</span>` : ''}</small></button>`).join('');
  $('bSpells').hidden = false; $('bCast').classList.add('on');
  $('spClose').onclick = closeSpells;
  $('bSpells').querySelectorAll('[data-sp]').forEach(el => el.onclick = () => { closeSpells(); chooseSpell(el.dataset.sp); });
}
$('bWait').onclick = () => battleWait();
$('bDef').onclick = () => battleDefend();
$('bCast').onclick = () => toggleSpells();
$('bAuto').onclick = () => battleAuto();
$('goBtn').innerHTML = `${ico('i_play', 14)} Путь <kbd>␣</kbd>`;
$('endBtn').innerHTML = `${ico('i_next', 16)} Конец хода <kbd>Enter</kbd>`;
$('bWait').innerHTML = btnLbl('i_wait', 'Ждать', 'W');
$('bDef').innerHTML = btnLbl('i_def', 'Оборона', 'D');
$('bAuto').innerHTML = btnLbl('i_bot', 'Авто', 'A');
$('contBtn').innerHTML = `${ico('i_save', 22)} Продолжить`;

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
let mapKind = 'msk', gameDiff = 1;
try { const d = +localStorage.getItem('delyozh_diff'); if (GAME_DIFF[d] && localStorage.getItem('delyozh_diff') != null) gameDiff = d; } catch (e) { /* не страшно */ }
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
      <div class="seg wide heroes ${edit ? '' : 'ro'}"><span class="${hc ? '' : 'on'}" data-seat="${i}" data-hero="-1" title="Случайный герой">${ico('i_dice', 28)}</span>${F.heroes.map((c, k) => `<span class="${p.hero === k ? 'on' : ''}" data-seat="${i}" data-hero="${k}" title="${c.name} — ${SPECS[c.spec].name}: ${SPECS[c.spec].desc}. Коронный номер: ${HERO_ULT[c.name].name}">${ico('p_' + c.name, 32)}</span>`).join('')}</div>
      <small>${hc ? `<b>${hc.name}</b> · ${ico('i_star', 12)} ${SPECS[hc.spec].name}: ${SPECS[hc.spec].desc}<br>Коронный номер «${HERO_ULT[hc.name].name}»: ${HERO_ULT[hc.name].desc(1).toLowerCase()}` : 'Герой: какой придёт'}</small>
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
  $('diffSeg').className = 'seg' + (host ? '' : ' ro');
  $('diffSeg').innerHTML = GAME_DIFF.map((d, k) => `<span class="${gameDiff === k ? 'on' : ''}" data-gd="${k}" title="${d.desc}">${d.name}</span>`).join('');
  $('diffNote').textContent = 'Сложность партии: ' + GAME_DIFF[gameDiff].desc.toLowerCase();
  document.querySelectorAll('[data-gd]').forEach(el => el.onclick = () => { if (!host) return; gameDiff = +el.dataset.gd; try { localStorage.setItem('delyozh_diff', gameDiff); } catch (e) { /* не страшно */ } sfx('click'); renderMenu(); });
  renderNetBar(R);
  $('contBtn').disabled = !hasSave();
}
// Полоса «по сети»: создать комнату, войти по коду, список открытых комнат; в комнате — код и ссылка
function renderNetBar(R) {
  const el = $('netBar');
  if (R) {
    el.innerHTML = `<b>${ico('i_net', 20)} Комната <span class="code">${R.code}</span></b> <button class="sec" id="netCopy">Скопировать ссылку</button>
      ${R.host ? `<label><input type="checkbox" id="netPub" ${R.public ? 'checked' : ''}> видна в списке открытых</label><label title="Пока бригады далеко друг от друга, день играют все сразу; сблизились — по очереди"><input type="checkbox" id="netSim" ${R.turns === 'sim' ? 'checked' : ''}> ходить одновременно, пока далеко</label>` : `<small>хозяин: ${esc(R.hostName)} · ходы: ${R.turns === 'sim' ? 'одновременно, пока бригады далеко' : 'по очереди'}</small>`}
      <button class="sec" id="netOut">Выйти из комнаты</button>`;
    $('netCopy').onclick = () => { const link = location.origin + location.pathname + '?room=' + R.code; (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Ссылка скопирована', true), () => prompt('Ссылка на комнату:', link)); };
    if (R.host) { $('netPub').onchange = e => netOp('public', { public: e.target.checked }); $('netSim').onchange = e => netOp('turns', { turns: e.target.checked ? 'sim' : 'seq' }); }
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
  genMap({ players, map: mapKind, diff: gameDiff });
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
  if (G.winBy === 'key') { ask(`${ico('a_key', 24)} ${p.name} забирают Москву!`, `<div style="font-size:18px">${KEY_DAYS} дней подряд бригада держала Ключ от Кремля. День ${G.day}. ${FACTIONS[p.fac].name} — хозяева города.</div>`, ['В меню'], { pid: -1 }).then(() => { if (NET.on) netLeave(); else { $('menu').hidden = false; renderMenu(); } }); return; }
  const text = bot ? `Людей в городе не осталось — всё поделили боты. День ${G.day}. Реванш?` : `Остальные бригады распались. День ${G.day}. ${FACTIONS[p.fac].name} — хозяева города.`;
  ask(title, `<div style="font-size:18px">${text}</div>`, ['В меню'], { pid: -1 })
    .then(() => { if (NET.on) netLeave(); else { $('menu').hidden = false; renderMenu(); } });
}
addEventListener('keydown', e => { if (e.code === 'Escape' && !$('town').hidden) closeTown(); });
renderMenu();
netList();
