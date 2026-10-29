/* IFR AMR Planner - UI. Vanilla JS, no build step, no backend. */
(function () {
  'use strict';
  const M = window.AMRModel, D = window.AMRData;
  const VERSION = '1.0.0';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = { cur: 'amr.current.v1', missions: 'amr.missions.v1', settings: 'amr.settings.v1' };
  const S = { m: null, settings: { cycle: 'auto', compat: false, state: 'AZ' }, tab: 'plan' };
  const env = { ap: id => D.ap(id), acft: d => D.acft(d), device: d => D.device(d), get compat() { return S.settings.compat; } };

  /* ---------- storage ---------- */
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save (storage full or blocked)'); } };
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.map((x, i) => (base[i] && typeof base[i] === 'object') ? merge(base[i], x) : x) : base;
    if (base && typeof base === 'object') { const o = {}; for (const k in base) o[k] = (over && k in over) ? merge(base[k], over[k]) : base[k]; if (over) for (const k in over) if (!(k in o)) o[k] = over[k]; return o; }
    return over === undefined ? base : over;
  }
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => jset(LS.cur, S.m), 150); }
  function getp(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), S.m); }
  function setp(path, v) { const ks = path.split('.'); let o = S.m; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2400); }

  /* ---------- helpers for the form ---------- */
  const optList = (list, val, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + list.map(x => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  const F = (label, body, cls, hint) => `<div class="f ${cls || ''}"><label>${label}</label>${body}${hint || ''}</div>`;
  const inp = (path, o) => { o = o || {}; return `<input data-b="${path}" value="${esc(getp(path))}" ${o.attrs || ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off" autocorrect="off" spellcheck="false">`; };
  const sel = (path, list, blank, extra) => `<select data-b="${path}" ${extra || ''}>${optList(list, getp(path), blank)}</select>`;
  const area = (path, ph) => `<textarea data-b="${path}" placeholder="${esc(ph || '')}">${esc(getp(path))}</textarea>`;
  const num = v => M.num(v);

  /* ---------- PLAN view ---------- */
  const APN = { dep: 'Departure', d1: 'Destination 1', d2: 'Destination 2' };
  function airportCard(k) {
    const dep = k === 'dep';
    const wx = `
      <h3>Weather</h3><div class="grid g4">
      ${F('Wind dir', inp(k + '.wind', { attrs: 'inputmode="numeric" maxlength="3"', ph: '090' }))}
      ${F('Speed (kt)', inp(k + '.ws', { attrs: 'inputmode="numeric" maxlength="6"', ph: '10' }))}
      ${F('Visibility + reason', inp(k + '.vis', { ph: '1 FG' }), 'span2')}
      ${F('Ceiling type', sel(k + '.ct', M.CT_LIST, '(none)'))}
      ${F('Ceiling alt (hundreds)', inp(k + '.ceil', { attrs: 'inputmode="numeric" maxlength="3"', ph: '006' }))}
      ${F('Temp °C', inp(k + '.temp', { attrs: 'inputmode="text"', ph: '18' }), '', `<span class="hint" data-fx="${k}.temp"></span>`)}
      ${F('Dew pt °C', inp(k + '.dp', { attrs: 'inputmode="text"', ph: '17' }), '', `<span class="hint" data-fx="${k}.dp"></span>`)}
      ${F('Altimeter', inp(k + '.altim', { attrs: 'inputmode="decimal" maxlength="5"', ph: '29.92' }))}
      </div><div class="msgs" id="msg-${k}"></div>`;
    const ops = `<h3>Procedures</h3><div class="grid g2">
      ${F('Weather source', sel(k + '.wx', M.WX_SRC))}
      ${F('Approach in use', `<select data-b="${k}.apr" data-dyn="apr"></select>`)}
      ${F('Runway in use', `<select data-b="${k}.rwy" data-dyn="rwy"></select>`)}
      ${dep ? F('SID / DP (if required)', `<select data-b="dep.sid" data-dyn="sid"></select>`) : F('STAR (if used)', `<select data-b="${k}.star" data-dyn="star"></select>`)}
      ${dep ? F('Transition', `<input data-b="dep.trans" value="${esc(S.m.dep.trans)}" list="dl-trans" placeholder="type or pick" autocomplete="off"><datalist id="dl-trans"></datalist>`) : F('TEMPO visibility', inp(k + '.tvis', { ph: '1/2 FG' }))}
      ${dep ? '' : F('TEMPO cloud layer', inp(k + '.tcl', { ph: 'BKN 003' }))}
      </div>`;
    const clr = dep ? `<h3>Clearance &amp; climb-out</h3><div class="grid g2">
      ${F('Clearance type', sel('dep.cd', M.CD_LIST))}
      ${F('Maintain (alt)', inp('dep.maint', { attrs: 'inputmode="numeric"', ph: '020' }))}
      ${F('Expect (alt)', inp('dep.exp', { attrs: 'inputmode="numeric"', ph: '040' }))}
      ${F('Min after dep', inp('dep.min', { attrs: 'inputmode="numeric"', ph: '10' }))}</div>`
      : `<h3>Approach clearance</h3><div class="grid">${F('Clearance type', sel(k + '.ac', M.CLR_TYPES.map(x => [x, x.replace(/\s+/g, ' ')])), 'full')}</div>`;
    return `<section class="card" data-ap="${k}"><h2>${APN[k]}<small id="cnt-${k}"></small></h2>
      <div class="grid"><div class="f full"><label>Airport (ID, name or city)</label><input data-b="${k}.id" data-pick="${k}" value="${esc(S.m[k].id)}" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="e.g. KTUS, RYN, Tucson"><ul class="sug" hidden></ul></div></div>
      <div class="apinfo" id="info-${k}"></div>${wx}${ops}${clr}</section>`;
  }
  function planHTML() {
    const dev = D.static.devices, ac = D.static.acft;
    return `<div class="cards">
    <section class="card"><h2>Mission</h2><div class="grid g2">
      ${F('Date', `<input type="date" data-b="date" value="${esc(S.m.date)}">`)}
      ${F('Aircraft type', sel('acft', ac.map(a => [a.design, `${a.design} (${a.mil})`])))}
      ${F('Device / aircraft', `<select data-b="device">${optList(dev.map(d => [d.device, `${d.device} - ${d.type} ${d.n}`]), S.m.device)}</select>`, 'span2', '<span class="hint" id="serialHint"></span>')}
      ${F('Mission name (for saving)', inp('name', { ph: 'e.g. Wed IFR sim #3' }), 'span2')}
    </div></section>
    ${airportCard('dep')}${airportCard('d1')}${airportCard('d2')}
    <section class="card"><h2>Alternate <small>1-2-3 style check is advisory</small></h2>
      <div class="f chk"><input type="checkbox" id="noAlt" data-b="noAlt" ${S.m.noAlt ? 'checked' : ''}><label for="noAlt">NO 1st ALT NEEDED</label></div>
      <div class="msgs" id="altMsg"></div>
      <h3>Destination 2 alternate (if needed)</h3><div class="grid g2">
      <div class="f"><label>Alt airport</label><input data-b="alt2.id" data-pick="alt2" value="${esc(S.m.alt2.id)}" autocapitalize="characters" autocomplete="off" placeholder="ID"><ul class="sug" hidden></ul></div>
      ${F('Time to 2nd alt', inp('alt2.time', { ph: '0+25' }))}</div>
      <p class="fx">Like the workbook, the alternate for Destination 1 is Destination 2 unless "NO 1st ALT NEEDED" is checked.</p></section>
    <section class="card"><h2>AMR details</h2><div class="grid g2">
      ${F('In order to… (purpose)', inp('amr.purpose'))}${F('…who / what', inp('amr.who'))}
      ${F('Leg 1 navigation', sel('amr.nav1', M.NAV_LIST))}${F('Leg 2 navigation', sel('amr.nav2', M.NAV_LIST))}
      ${F('Unit / station', inp('amr.unit', { ph: 'e.g. UNIT / KXXX' }), 'span2')}
      ${F('Weight &amp; balance', inp('amr.wb', { ph: 'KTUS / 28 OCT 26' }))}${F('ELA', inp('amr.ela', { ph: 'L-4, L-5' }))}
      ${F('VFR sectional', inp('amr.sect', { ph: 'PHOENIX' }), 'span2')}</div>
      <h3>Crew &amp; passengers</h3><div class="grid g3">
      ${[0, 1, 2].map(i => F(['PC', 'PI', 'IP / other'][i] + ' name', inp(`amr.crew.${i}.name`)) + F('Rank', inp(`amr.crew.${i}.rank`)) + (i === 2 ? F('Org / station', inp('amr.crew.2.org')) : '<div></div>')).join('')}
      ${F('Passenger(s)', inp('amr.pax.name'))}${F('Rank', inp('amr.pax.rank'))}${F('Org', inp('amr.pax.org'))}</div>
      <h3>Text (leave override blank to use the generated text)</h3><div class="grid">
      ${F('Mission statement override', area('amr.missionTxt', 'Blank = generated from airports, ETD, purpose'), 'full')}
      ${F('Special instructions override', area('amr.specialTxt', 'Blank = generated'), 'full')}
      ${F("Commander's intent", area('amr.intent'), 'full')}${F('Remarks', area('amr.remarks'), 'full')}</div></section>
    <section class="card"><h2>DD 175 flight plan</h2><div class="grid g3">
      ${F('ETD (Z, HHMM)', inp('f175.etd', { attrs: 'inputmode="numeric" maxlength="4"', ph: '1930' }))}
      ${F('Planning TAS (KIAS)', inp('f175.tas', { attrs: 'inputmode="numeric"' }))}
      ${F('Flight rules', sel('f175.rules', ['I', 'V']))}
      ${F('Alt leg 1 (hundreds)', inp('f175.alt1', { attrs: 'inputmode="numeric" maxlength="3"', ph: '040' }))}
      ${F('Alt leg 2 (hundreds)', inp('f175.alt2', { attrs: 'inputmode="numeric" maxlength="3"', ph: '040' }))}
      ${F('Ground time dest 1 (min)', inp('f175.hold', { attrs: 'inputmode="numeric"' }))}
      ${F('Route leg 1', inp('f175.route1', { ph: 'DIRECT' }), 'span2')}${F('Fuel on board', inp('f175.fob'))}
      ${F('Route leg 2', inp('f175.route2', { ph: 'DIRECT' }), 'span2')}${F('Terminal-area delay routing', inp('f175.termRoute'))}</div>
      <h3>Distances (nm)</h3><div class="grid g3">
      ${F('Leg 1 dist', inp('f175.v1', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc1"></span>')}${F('Leg 1 + (SID/STAR/app)', inp('f175.x1', { attrs: 'inputmode="decimal"' }))}${F('Leg 1 PT/Hold min', inp('f175.w1', { attrs: 'inputmode="decimal"' }))}
      ${F('Leg 2 dist', inp('f175.v2', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc2"></span>')}${F('Leg 2 + (SID/STAR/app)', inp('f175.x2', { attrs: 'inputmode="decimal"' }))}${F('Leg 2 PT/Hold min', inp('f175.w2', { attrs: 'inputmode="decimal"' }))}
      ${F('To ALT dist', inp('f175.v3', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc3"></span>')}${F('To ALT +', inp('f175.x3', { attrs: 'inputmode="decimal"' }))}${F('ALT PT/Hold min', inp('f175.w3', { attrs: 'inputmode="decimal"' }))}</div>
      <p class="fx"><button class="btn sm" id="btnGC">Fill distances from airport positions</button> great-circle nm - add procedure miles yourself.</p></section>
    <section class="card"><h2>DD 175-1 weather brief</h2><div class="grid g2">
      ${F('WX briefed time (Z)', inp('f1751.briefTime', { attrs: 'inputmode="numeric" maxlength="4"' }))}
      ${F("Forecaster's initials", inp('f1751.init'))}
      ${F('Flimsy briefing no.', inp('f1751.flimsy'))}${F('Local WX watch/warning/advisory', inp('f1751.watch'))}
      ${F('NOTAMs (one per line)', area('f1751.notams', 'KTUS - ILS RWY 11L out of service'), 'full')}</div>
      <p class="fx">Void time = briefed time + 1+30. Other 175-1 blocks can be edited right on the 175-1 page.</p></section>
    </div>`;
  }

  /* ---------- dependent controls ---------- */
  function fillDyn(k, keepChoice) {
    const x = S.m[k], a = D.ap(x.id), set = (name, list, blank) => {
      const el = $(`[data-b="${k}.${name}"]`); if (!el) return;
      const cur = x[name];
      el.innerHTML = optList(list || [], list && list.includes(cur) ? cur : '', blank);
      if (!(list || []).includes(cur) && cur !== '') { x[name] = ''; }
    };
    set('apr', a && a.i, a ? '— select approach —' : '— pick an airport —');
    set('rwy', a && a.r, a ? '— select runway —' : '— pick an airport —');
    if (k === 'dep') { set('sid', a && a.d, '— none (as filed) —'); const dl = $('#dl-trans'); const tr = (a && a.x && a.x[x.sid]) || []; dl.innerHTML = tr.map(t => `<option value="${esc(t)}">`).join(''); if (!x.sid) x.trans = ''; $('[data-b="dep.trans"]').value = x.trans; }
    else set('star', a && a.s, '— none —');
  }
  const FREQ_ORDER = { 'A/D': 0, 'CNTR': 1 };
  function freqText(a) {
    if (!a || !a.f) return '';
    const g = {}; a.f.forEach(([t, n, f]) => { (g[n] = g[n] || []).push(f); });
    return Object.keys(g).map(n => `${n}: ${g[n].join(' / ')}`).join(' • ');
  }
  function renderInfo(k) {
    const x = S.m[k], a = D.ap(x.id), el = $('#info-' + k), cnt = $('#cnt-' + k);
    if (!a) {
      el.innerHTML = x.id ? `<span style="color:var(--bad)"><b>${esc(x.id)}</b> not found in the ${S.settings.state} data.</span> Type an FAA/ICAO ID (drop the K only for IDs with numbers - e.g. 02AZ, P08, KTUS).` : 'Pick an airport.';
      cnt.textContent = ''; return;
    }
    cnt.textContent = a.c;
    el.innerHTML = `<b>${esc(a.n)}</b> &nbsp;elev <b>${a.e == null ? '?' : a.e} ft</b><div class="chips"><span class="chip k">${esc(D.kindLabel(a.k))}</span><span class="chip">${esc(a.v || 'no SIAP vol')}</span><span class="chip">${(a.r || []).length} rwy ends</span><span class="chip">${(a.i || []).length} approaches</span><span class="chip">${(a.d || []).length} SIDs</span><span class="chip">${(a.s || []).length} STARs</span></div>${a.f ? `<div class="freq">${esc(freqText(a))}</div>` : '<div class="freq">No approach/departure/center frequencies in data.</div>'}`;
  }
  function renderMsgs(k) {
    const x = S.m[k], a = D.ap(x.id), msgs = M.validateWx(x, a && a.e);
    $('#msg-' + k).innerHTML = msgs.map(m => `<div class="msg ${m.level}">${esc(m.msg)}</div>`).join('');
    ['temp', 'dp'].forEach(f => { const el = $(`[data-fx="${k}.${f}"]`); if (el) el.textContent = String(x[f]).trim() !== '' ? `${M.fToC(x[f])} °F` : ''; });
    $$(`[data-ap="${k}"] input[data-b]`).forEach(i => i.classList.remove('bad'));
    msgs.filter(m => m.level === 'warn').forEach(m => {
      const map = { wind: /Wind direction/, ws: /Wind speed/, vis: /Visibility|weather code/, ceil: /Ceiling alt/, dp: /Dew/, altim: /Altimeter/ };
      for (const f in map) if (map[f].test(m.msg)) { const el = $(`[data-b="${k}.${f}"]`); el && el.classList.add('bad'); }
    });
  }
  function renderAlt() {
    const adv = M.altAdvice(S.m, env), el = $('#altMsg'); if (!el) return;
    const one = (lbl, r) => `<div class="msg ${r.ok ? 'ok' : 'warn'}">${lbl}: ${r.ok ? 'forecast at/above 2000-3 - alternate likely not required' : 'below 2000-3 (' + r.why.join(', ') + ') - alternate required'}</div>`;
    el.innerHTML = one('Destination 1', adv.d1) + one('Destination 2', adv.d2) + (S.m.noAlt && !adv.d1.ok ? '<div class="msg bad">"NO 1st ALT NEEDED" is checked but Destination 1 is below 2000-3 - verify against AR 95-1 / FAA alternate rules.</div>' : '');
  }
  function renderSerial() {
    const el = $('#serialHint'); if (!el) return; const ser = M.serNum(S.m, env), d = D.device(S.m.device);
    el.textContent = `Serial / N-number: ${ser}${d ? ' • pad ' + d.pad : ''}${d && S.m.acft && d.type !== 'ANY' && d.type !== S.m.acft ? ' • (device normally ' + d.type + ')' : ''}`;
  }
  function renderGC() {
    const p = x => { const a = D.ap(x.id); return a && a.p; };
    const d = (a, b) => (p(a) && p(b)) ? Math.round(M.nm(p(a), p(b))) + ' nm direct' : '';
    $('#gc1') && ($('#gc1').textContent = d(S.m.dep, S.m.d1)); $('#gc2') && ($('#gc2').textContent = d(S.m.d1, S.m.d2)); $('#gc3') && ($('#gc3').textContent = d(S.m.d1, S.m.d2));
  }
  function refreshPlan(only) {
    const ks = only ? [only] : ['dep', 'd1', 'd2'];
    ks.forEach(k => { fillDyn(k); renderInfo(k); renderMsgs(k); });
    renderAlt(); renderSerial(); renderGC();
  }

  /* ---------- picker ---------- */
  function wirePickers(root) {
    $$('[data-pick]', root).forEach(inpEl => {
      const ul = inpEl.parentElement.querySelector('.sug'), path = inpEl.dataset.b; let hl = -1, items = [];
      const show = () => {
        items = D.search(inpEl.value, 8); hl = -1;
        if (!items.length || document.activeElement !== inpEl) { ul.hidden = true; return; }
        ul.innerHTML = items.map((a, i) => `<li data-i="${i}"><b>${esc(a.id)}</b> ${esc(a.n)}<small>${esc(a.c)} • ${esc(D.kindLabel(a.k))} • ${a.e == null ? '?' : a.e} ft</small></li>`).join(''); ul.hidden = false;
      };
      const choose = a => { inpEl.value = a.id; ul.hidden = true; commitAirport(path, a.id, inpEl.dataset.pick); };
      inpEl.addEventListener('input', e => { e.stopPropagation(); show(); });
      inpEl.addEventListener('focus', () => { inpEl.select(); show(); });
      inpEl.addEventListener('keydown', e => {
        const lis = $$('li', ul);
        if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, lis.length - 1); } else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); }
        else if (e.key === 'Enter') { e.preventDefault(); const a = items[hl >= 0 ? hl : 0]; if (a) choose(a); else { commitFree(); } return; } else if (e.key === 'Escape') { ul.hidden = true; return; } else return;
        e.preventDefault(); lis.forEach((l, i) => l.classList.toggle('hl', i === hl));
      });
      ul.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(items[+li.dataset.i]); } });
      const commitFree = () => { ul.hidden = true; const id = D.resolve(inpEl.value); if (id) { inpEl.value = id; commitAirport(path, id, inpEl.dataset.pick); } else if (inpEl.value.trim() === '' || true) { commitAirport(path, inpEl.value.trim().toUpperCase(), inpEl.dataset.pick); } };
      inpEl.addEventListener('blur', () => setTimeout(commitFree, 120));
    });
  }
  function commitAirport(path, id, k) {
    if (getp(path) === id) { if (k !== 'alt2') renderInfo(k); return; }
    setp(path, id); save();
    if (k !== 'alt2') { const x = S.m[k]; x.apr = ''; x.rwy = ''; if (k === 'dep') { x.sid = ''; x.trans = ''; } else x.star = ''; refreshPlan(k); renderGC(); }
    renderAlt(); renderGC(); if (S.tab !== 'plan') renderView();
  }

  /* ---------- generic input handler ---------- */
  function onField(e) {
    const el = e.target; const path = el.dataset && el.dataset.b; if (!path || el.dataset.pick) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    setp(path, v); save();
    const k = path.split('.')[0];
    if (/^(dep|d1|d2)\./.test(path)) {
      const fld = path.split('.')[1];
      if (fld === 'apr' && v) {                       // auto-pick the runway named in the approach, like a pilot would
        const r = M.aprRwy(v), a = D.ap(S.m[k].id);
        if (r && a && a.r && a.r.includes(r)) { S.m[k].rwy = r; const re = $(`[data-b="${k}.rwy"]`); if (re) re.value = r; }
      }
      if (fld === 'sid') { fillDyn(k); }
      renderMsgs(k);
    }
    if (path === 'device') { const d = D.device(v); if (d && d.type !== 'ANY' && D.acft(d.type)) { S.m.acft = d.type; const ae = $('[data-b="acft"]'); if (ae) ae.value = d.type; } renderSerial(); }
    if (path === 'acft') renderSerial();
    if (/^(d1|d2)\./.test(path) || path === 'noAlt') renderAlt();
    if (path === 'name') $('#missionLabel').textContent = v || 'New mission';
  }

  /* ---------- OUTPUT: AMR ---------- */
  const pre = t => esc(t).replace(/\n/g, '<br>');
  function footer() { const c = D.cycle; return `<div class="foot">Generated by IFR AMR Planner v${VERSION} • FAA data cycle ${esc(c.tpp)} (eff ${esc(c.from.slice(0, 10))} to ${esc(c.to.slice(0, 10))}) • Training/planning aid - verify against current FAA publications.</div>`; }
  function barHTML(title) { return `<div class="outbar noprint"><button class="btn pri" data-act="print">Print / Save PDF</button><button class="btn" data-act="share">Share text</button><button class="btn" data-act="goplan">Edit inputs</button></div><div class="fx noprint swipe" style="margin:-4px 0 6px">Swipe sideways to see the whole form on a phone — Print / Save PDF always fits the page.</div>`; }
  function viewAMR() {
    const o = M.amr(S.m, env), dd = M.dd175(S.m, env);
    const kv = (a, b) => `<tr><td class="l">${a}</td><td>${b}</td></tr>`;
    return `${barHTML()}<h1>AIR MISSION REQUEST</h1>
      <p class="sub" style="text-align:center">${esc(S.m.date)} • ${esc(S.m.dep.id)} → ${esc(S.m.d1.id)} → ${esc(S.m.d2.id)}</p>
      <table><tr><th>#</th><th>Airfield</th></tr><tr><td>1</td><td>${esc(o.I1)}</td></tr><tr><td>2</td><td>${esc(o.I2)}</td></tr><tr><td>3</td><td>${esc(o.I3)}</td></tr></table>
      <h2>MISSION</h2><p>${esc(o.mission)}</p><h2>Special Instructions</h2><p>${esc(o.special)}</p><h2>Commanders Intent</h2><p>${esc(o.intent)}</p>
      <h2>Planning Information</h2><table>${kv('Aircraft:', esc(o.aircraft) + ' &nbsp; ' + esc(o.design))}${kv('Serial Number:', esc(o.serial))}${kv('Gross Weight:', esc(o.gw))}${kv('Planning Fuel:', esc(o.fuel))}${kv('Weight &amp; Balance:', esc(o.wb))}${kv('Unit / Station:', esc(o.unit))}</table>
      <h2>Performance Planning</h2><table>${kv('Hover Power:', esc(o.hover))}${kv('Climb Power:', esc(o.climb))}${kv('Cruise Power:', esc(o.cruise))}${kv('Fuel Burn Rate:', esc(o.burn))}${kv('True Airspeed:', esc(S.m.f175.tas) + ' KIAS (increase 1 KIAS per 1000 feet MSL)')}</table>
      <h2>Passengers</h2><p>${esc(o.pax.name)}${o.pax.rank ? ' • ' + esc(o.pax.rank) : ''}${o.pax.org ? ' • ' + esc(o.pax.org) : ''}</p>
      <h2>CREW</h2><table><tr><th>Name</th><th>Rank</th><th>Organization / Station</th></tr>${o.crew.map(c => `<tr><td>${esc(c.name) || '&nbsp;'}</td><td>${esc(c.rank)}</td><td>${esc(c.org)}</td></tr>`).join('')}</table>
      <h2>Remarks</h2><p>${pre(o.remarks)}</p>
      <h2>Publications</h2><table>${kv('ELA:', esc(o.ela))}${kv('VFR Sectional:', esc(o.sect))}${kv('IAP:', esc(o.iap))}</table>${footer()}`;
  }

  /* ---------- OUTPUT: DD 175 ---------- */
  function viewDD175() {
    const d = M.dd175(S.m, env), A = S.m.amr, T = M.s;
    const people = d.people.slice(); while (people.length < 4) people.push({ duty: '', name: '', rank: '', org: '' });
    const fuelRow = i => `<td colspan="3"><span class="fh">${esc(d.fuelTxt[i])}</span><span class="v">${d.fuel[i]} ${esc(d.unit)}</span></td>`;
    return `${barHTML()}<div class="scroll-x"><div class="minw"><table class="dd">
      <tr><td colspan="6" class="sub" style="font-size:8px;line-height:1.2">PRIVACY ACT STATEMENT — AUTHORITY: 10 USC 8012 and EO 9397. PRINCIPAL PURPOSE: To aid in accurate identification of personnel participating in the filed flight. ROUTINE USES: To provide data required to process flight plans with appropriate air traffic service authorities. A file is retained by the agency processing the flight plan. DISCLOSURE: Voluntary; however, failure to provide the SSN could result in denial of flight plan processing.</td>
        <td colspan="2"><span class="fh">DATE</span><span class="v">${esc(fmtDate(d.date))}</span></td><td colspan="3"><span class="fh">AIRCRAFT CALL SIGN</span><span class="v">${esc(d.callsign)}</span></td><td colspan="2"><span class="fh">AIRCRAFT DESG AND TD CODE</span><span class="v">${esc(d.design)}</span></td></tr>
      <tr><th>TYPE FLT PLAN</th><th>TRUE AIRSPEED</th><th colspan="2">POINT OF DEPARTURE</th><th colspan="2">PROPOSED DEPARTURE TIME (Z)</th><th>ALTITUDE</th><th colspan="4">ROUTE OF FLIGHT</th><th>TO</th><th>ETE</th></tr>
      ${legRow(d.leg1)}
      <tr><td colspan="7"></td><td colspan="4" class="v">${esc(d.mid.k)}</td><td colspan="2" class="v">${esc(d.mid.l)}</td></tr>
      ${legRow(d.leg2)}
      <tr><td colspan="6"><span class="fh">REMARKS</span><span class="v">${esc(d.remarksLine)}</span></td><td colspan="1" class="v">${esc(d.leg2.remarks)}</td>${fuelRow(0)}${fuelRow(1)}</tr>
      <tr><td colspan="7"><span class="fh">&nbsp;</span></td>${fuelRow(2)}<td colspan="3"></td></tr>
      <tr><td colspan="4"><span class="fh">RANK AND HONOR CODE</span>&nbsp;</td><td colspan="9"></td></tr>
      <tr><td colspan="2"><span class="fh">FUEL ON BD</span><span class="v">${esc(d.fob)}</span></td><td colspan="2"><span class="fh">ALTN AIRFIELD</span><span class="v">${esc(d.alt)}</span></td><td colspan="2"><span class="fh">ETE TO ALTN</span><span class="v">${esc(d.eteAlt)}</span></td><td colspan="2"><span class="fh">NOTAMS</span>&nbsp;</td><td colspan="2"><span class="fh">WEATHER (VOID / INITIALS)</span><span class="v">${esc(d.weather)}</span></td><td colspan="1"><span class="fh">WT AND BAL</span><span class="v">${esc(d.wb)}</span></td><td colspan="2"><span class="fh">A/C SERIAL, UNIT, HOME STA</span><span class="v">${esc(d.serialUnit)}</span></td></tr>
      <tr><td colspan="4"><span class="fh">SIGNATURE OF APPROVAL AUTHORITY</span><br>&nbsp;</td><td colspan="5"><span class="fh">CREW / PASSENGER LIST</span> <b>X</b> ATTACHED &nbsp; SEE PSGR</td><td colspan="2"><span class="fh">ACTUAL DEP TIME (Z)</span>&nbsp;</td><td colspan="2"><span class="fh">BASE OPERATIONS USE</span>&nbsp;</td></tr>
      <tr><th colspan="2">DUTY</th><th colspan="5">NAME AND INITIALS</th><th>RANK</th><th>SSN</th><th colspan="4">ORGANIZATION AND LOCATION</th></tr>
      ${people.slice(0, 4).map(p => `<tr><td colspan="2" class="v">${esc(p.duty)}</td><td colspan="5" class="v">${esc(p.name)}&nbsp;</td><td class="v">${esc(p.rank)}</td><td>&nbsp;</td><td colspan="4" class="v">${esc(p.org)}</td></tr>`).join('')}
      <tr><td colspan="13" class="sub">DD Form 175, MAY 86 — Previous editions are obsolete. — MILITARY FLIGHT PLAN (planning copy generated by IFR AMR Planner; transcribe to the official form)</td></tr></table></div></div>
      <p class="fx noprint" style="margin-top:8px">ETE = ((dist ÷ TAS) × 60 + PT/Hold min) truncated to the minute; TAS = planning TAS + 1 kt per 1000 ft (altitude ÷ 10). ETD leg 2 = ETD + ETE leg 1 + ground time. Fuel = (dist ÷ TAS + (hold + 30 min reserve) ÷ 60) × burn rate.</p>${footer()}`;
    function legRow(L) { return `<tr><td class="v" style="text-align:center">${esc(L.rules)}</td><td class="v">${esc(L.tas)}</td><td colspan="2" class="v">${esc(L.dep)}</td><td colspan="2" class="v">${esc(L.etd)}</td><td class="v">${esc(L.alt)}</td><td colspan="4" class="v">${esc(L.route)}</td><td class="v">${esc(L.to)}</td><td class="v">${esc(L.ete)}</td></tr>`; }
  }
  function fmtDate(iso) { const [y, m, d] = String(iso).split('-'); const mo = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+m - 1]; return `${d}-${mo}-${String(y).slice(2)}`; }

  /* ---------- OUTPUT: DD 175-1 ---------- */
  const ed = (path, w) => `<input class="edit" data-b="${path}" value="${esc(getp(path))}" ${w ? `style="width:${w}"` : ''} autocomplete="off">`;
  function viewDD1751() {
    const o = M.dd1751(S.m, env), F1 = S.m.f1751, a = D.ap(S.m.dep.id);
    const sun = a && a.p ? M.sun(S.m.date, a.p[0], a.p[1]) : null;
    const v = (k, d) => F1[k] || (sun && sun[d]) || '';
    const rowsHTML = o.part3.map(r => `<tr><td class="v">${esc(r.id)}<span class="fh">${esc(r.label)}</span></td><td class="v">${esc(r.from)}Z – ${esc(r.to)}Z</td><td class="v">${esc(r.wind)}</td><td class="v">${esc(r.vis)}</td><td class="v">${esc(r.cloud)}</td><td class="v">${esc(r.altim)}</td><td class="v">${esc(r.temp)}</td><td class="v">${esc(r.pa)}</td></tr>`).join('');
    return `${barHTML()}<h1 style="font-size:18px">FLIGHT WEATHER BRIEFING</h1><div class="scroll-x"><div class="minw">
      <h2>PART I - TAKEOFF DATA</h2><table class="dd"><tr><th>1. Date</th><th>2. Acft type/no.</th><th>3. Dep pt/ETD</th><th>4. Rwy temp (C)</th><th>5. Dewpoint (C)</th><th>6. Temp dev</th><th>7. Pres alt (ft)</th><th>8. Density alt (ft)</th></tr>
      <tr><td class="v">${esc(fmtDate(o.date))}</td><td class="v">${esc(o.acft)}</td><td class="v">${esc(o.dep)}Z</td><td class="v">${esc(o.rwyTemp)}</td><td class="v">${esc(o.dew)}</td><td class="v">${esc(o.tempDev)}</td><td class="v">${esc(o.pa)}</td><td class="v">${esc(o.da)}</td></tr></table>
      <table class="dd"><tr><th>9. Sfc wind (M)</th><th>10. Climb winds</th><th>Layer</th><th colspan="2">11. Local WX watch/warning/advisory</th><th>12. RSC/RCR</th></tr>
      <tr><td class="v">${esc(o.sfcWind)}</td><td class="v">${esc(o.climbWinds)}</td><td>${ed('f1751.climbLayer')}</td><td colspan="2">${ed('f1751.watch')}</td><td class="v">N/A</td></tr>
      <tr><td colspan="6"><span class="fh">13. REMARKS</span><span class="v">${esc(o.remarks13)}</span></td></tr></table>
      <h2>PART II - ENROUTE &amp; MISSION DATA</h2><table class="dd">
      <tr><td colspan="2"><span class="fh">14. Flt level / winds / temp</span><span class="v">${esc(o.flWinds)}</span> &nbsp;SEE ATTACHED</td><td colspan="2"><span class="fh">15. Space weather (FREQ / GPS / RAD)</span>${ed('f1751.space')}</td><td colspan="3"><span class="fh">16. Solar/lunar (Z at ${esc(S.m.dep.id)})</span>BMNT ${ed('f1751.bmnt', '70px').replace('value="' + esc(F1.bmnt) + '"', 'value="' + esc(v('bmnt', 'bmnt')) + '"')} SR ${ed('f1751.sr', '70px').replace('value="' + esc(F1.sr) + '"', 'value="' + esc(v('sr', 'sr')) + '"')} SS ${ed('f1751.ss', '70px').replace('value="' + esc(F1.ss) + '"', 'value="' + esc(v('ss', 'ss')) + '"')} EENT ${ed('f1751.eent', '70px').replace('value="' + esc(F1.eent) + '"', 'value="' + esc(v('eent', 'eent')) + '"')}</td></tr>
      <tr><td><span class="fh">17. Clouds at flt level</span>${ed('f1751.cloudsFL')}</td><td colspan="2"><span class="fh">18. Obscurations restricting vis</span>${ed('f1751.obsc')}</td><td><span class="fh">Type</span>${ed('f1751.obscType')}</td><td><span class="fh">19. Min ceiling - location</span><span class="v">${esc(o.minCeil)}</span></td><td><span class="fh">20. Max cloud tops (FT AGL)</span>${ed('f1751.cloudTops')}</td><td><span class="fh">21. Min freezing lvl (FT AGL)</span>${ed('f1751.frz')}</td></tr>
      <tr><td><span class="fh">22. Thunderstorms</span>${ed('f1751.tstm')}</td><td colspan="2"><span class="fh">23. Turbulence</span>${ed('f1751.turb')}</td><td><span class="fh">in clear / cloud</span>${ed('f1751.turbWhere')}</td><td><span class="fh">24. Icing</span>${ed('f1751.icing')}</td><td colspan="2"><span class="fh">25. Precipitation</span>${ed('f1751.precip')}</td></tr></table>
      <h2>PART III - AERODROME FORECASTS</h2><table class="dd"><tr><th>26. Dest / altn</th><th>27. Valid time (default ETA −1/+1 h; TEMPO ±15 min)</th><th>28. Sfc wind</th><th>29. Vsby/WX</th><th>30. Cloud layers</th><th>31. Altimeter</th><th>Rwy temp C</th><th>Pres alt ft</th></tr>${rowsHTML}</table>
      <h2>PART IV - COMMENTS/REMARKS</h2><table class="dd"><tr><td colspan="4"><span class="fh">32. Briefed RSC/RCR</span>${ed('f1751.rscBriefed')}</td><td colspan="2"><span class="fh">33. PMSV</span>${ed('f1751.pmsv')}</td><td colspan="2"><span class="fh">34. Attachments</span>${ed('f1751.attach')}</td></tr>
      <tr><td colspan="8"><span class="fh">35. REMARKS — NOTAMS</span>${pre(F1.notams) || '&nbsp;'}</td></tr></table>
      <h2>PART V - BRIEFING RECORD</h2><table class="dd"><tr><td><span class="fh">36. WX briefed time</span><span class="v">${esc(o.briefTime)}Z</span></td><td><span class="fh">37. Flimsy briefing no.</span>${ed('f1751.flimsy')}</td><td><span class="fh">38. Forecaster's initials</span>${ed('f1751.init')}</td><td colspan="2"><span class="fh">39. Name of person receiving briefing</span>${ed('f1751.recvName')}</td></tr>
      <tr><td><span class="fh">40. Void time</span><span class="v">${esc(o.wxVoid)}Z</span></td><td colspan="2"><span class="fh">41. Extended to/initials</span>&nbsp;</td><td><span class="fh">42. WX rebrief time/initials</span>&nbsp;</td><td><span class="fh">43. WX debrief time/initials</span>&nbsp;</td></tr>
      <tr><td colspan="5" class="sub">DD FORM 175-1, OCT 2002 — PREVIOUS EDITION MAY BE USED. (Planning copy; transcribe to the official form / obtain the official weather brief.)</td></tr></table></div></div>
      <p class="fx noprint">${env.compat ? 'Workbook-compatible mode: density altitude and Dest-1 pressure altitude use the original workbook formulas.' : 'Density altitude = PA + 120 × (OAT − ISA) with ISA = 15 − 2 × PA/1000. (The old workbook has a misplaced parenthesis; turn on workbook-compatible mode on the Info tab to reproduce it.)'} Sun times are computed from the departure airport position; edit any value to override.</p>${footer()}`;
  }

  /* ---------- OUTPUT: Scripts (Grade Sheet) ---------- */
  function viewScripts() {
    const c = M.calls(S.m, env), g = c.grade, m = S.m;
    const sc = (title, text, alt) => `<div class="script"><h3>${esc(title)}<button class="btn sm" data-copy="${esc(text)}">Copy</button></h3><p>${esc(text)}</p></div>${alt ? `<div class="alt">${alt}</div>` : ''}`;
    const fr = k => { const a = D.ap(m[k].id); return a ? `<div class="script"><h3>${esc(APN[k])} - ${esc(m[k].id)}</h3><p>${esc(freqText(a)) || 'No A/D or CNTR frequencies in data'}</p></div>` : ''; };
    return `<div class="outbar"><button class="btn pri" data-act="print">Print / Save PDF</button><button class="btn" data-act="goplan">Edit inputs</button></div>
      <div class="script"><h3>Grade sheet setup</h3><p>${esc(g.cockpit)}   •   ${esc(g.simTemp)}   •   Date ${esc(fmtDate(m.date))}</p></div>
      <div class="s2"><div>
      <h3 style="margin:4px 0">DEPARTURE</h3>
      ${sc('Departure weather (' + m.dep.wx + ')', g.depWx)}${sc('Clearance delivery (' + m.dep.cd + ')', g.cd)}${sc('Taxi', g.taxi)}${sc('Takeoff', g.takeoff)}${sc('Handoff', g.handoff1)}${sc('Departure control', g.depCtl)}${sc('Handoff', g.contact)}
      <h3 style="margin:4px 0">DESTINATION 1 - ${esc(m.d1.id)}</h3>
      ${sc('Destination 1 weather (' + m.d1.wx + ')', g.d1Wx)}${sc('Approach information', g.d1Info)}${sc('Approach clearance (' + m.d1.ac.replace(/\s+/g, ' ') + ')', g.d1Clr)}${sc('Alternate phrasing - cross fix', g.d1Cross)}${sc('Cancel IFR', g.d1Cancel)}${sc('Tower (or)', g.d1Tower)}
      </div><div>
      <h3 style="margin:4px 0">MISSED APPROACH</h3>
      ${sc('Missed approach - handoff', g.missed1)}${sc('Approach control', g.missed2)}${sc('Hold / expect further clearance', g.missed3)}
      <h3 style="margin:4px 0">CLEARANCE TO DESTINATION 2 - ${esc(m.d2.id)}</h3>
      ${sc('Clearance to 2nd destination', g.toD2)}${sc('Handoff', g.handoff2)}${sc('Destination 2 weather (' + m.d2.wx + ')', g.d2Wx)}${sc('Destination 2 approach information', g.d2Info)}${sc('Destination 2 approach clearance (' + m.d2.ac.replace(/\s+/g, ' ') + ')', g.d2Clr)}${sc('Alternate phrasing - cross fix', g.d2Cross)}${sc('Cancel IFR', g.d1Cancel)}${sc('Contact tower', g.d2ContactTwr)}${sc('Destination 2 tower', g.d2Tower)}
      <h3 style="margin:4px 0">FREQUENCIES (from FAA data)</h3>${fr('dep')}${fr('d1')}${fr('d2')}
      </div></div>${footer()}`;
  }

  /* ---------- INFO ---------- */
  const WXREF = [['Precipitation', 'DZ drizzle • RA rain • SN snow • SG snow grains • IC ice crystals • PL ice pellets • GR hail • GS small hail/snow pellets • UP unknown precip'],
    ['Obscurations', 'BR mist • FG fog • FU smoke • VA volcanic ash • DU widespread dust • SA sand • HZ haze • PY spray'],
    ['Other', 'PO dust/sand whirls • SQ squall • FC funnel cloud/tornado/waterspout • SS sandstorm • DS duststorm'],
    ['Intensity', '− light • (none) moderate • + heavy']];
  function viewInfo() {
    const c = D.cycle, st = D.cycleStatus(c);
    const cyc = D.manifest.cycles;
    return `<div class="cards"><section class="card wide"><h2>FAA data</h2>
      <div class="kv"><b>Cycle in use</b><span>${esc(c.tpp)} - ${esc(c.from.slice(0, 10))} 0901Z to ${esc(c.to.slice(0, 10))} 0901Z <b style="color:${st.state === 'current' ? 'var(--ok)' : 'var(--bad)'}">${st.text}</b></span>
      <b>NASR cycle</b><span>${esc(c.nasr)}</span><b>States loaded</b><span>${Object.keys(D.loaded).join(', ')} (${Object.keys(D.airports).length} airports)</span><b>Filter</b><span>public-use + military airports/heliports + private heliports (no private airstrips, ultralights, gliderports or seaplane bases)</span></div>
      <div class="grid g2" style="margin-top:8px">${F('Data cycle', `<select id="cycSel"><option value="auto"${S.settings.cycle === 'auto' ? ' selected' : ''}>Automatic (by today's date)</option>${cyc.map(x => `<option value="${x.tpp}"${S.settings.cycle === x.tpp ? ' selected' : ''}>${x.tpp} (${x.from.slice(0, 10)} → ${x.to.slice(0, 10)})</option>`).join('')}</select>`)}</div>
      <div class="msg warn" style="margin-top:8px"><b>For training and planning only.</b> Airport data, runways, approaches, SIDs, STARs and frequencies come from the FAA NASR subscription and d-TPP metafile and are <b>not</b> a substitute for current FAA / DoD flight publications (IFR Supplement, charts, NOTAMs). Verify everything against current publications before flight.</div></section>
    <section class="card"><h2>Settings</h2>
      <div class="f chk"><input type="checkbox" id="compat" ${S.settings.compat ? 'checked' : ''}><label for="compat">Workbook-compatible mode (reproduce workbook quirks)</label></div>
      <p class="fx">Off (default): density altitude uses the correct formula, the ATIS "Landing and Departing RWY…" line is dropped when the approach is to the runway in use, and Destination 1's pressure altitude uses Destination 1's elevation. On: the original workbook formulas are reproduced exactly (misplaced-parenthesis density altitude, always adding the landing-RWY sentence for numeric runways, departure elevation for Dest 1).</p>
      <h3>Data on this device</h3><button class="btn danger sm" id="btnWipe">Erase saved missions &amp; settings</button></section>
    <section class="card"><h2>Weather entry tips</h2><ul class="fx" style="color:var(--ink);padding-left:18px;margin:0">
      <li>Airport IDs: all caps, 4-letter ICAO; if the ID has a number drop the K (02AZ, P08).</li><li>Visibility must be below 3 and have a reason (BR, RA, -RA …) for an IMC scenario.</li><li>Don't use altimeter settings that end in "0".</li><li>Ceiling altitude is in hundreds of feet (006 = 600 ft).</li><li>SID transition: pick from the NASR list or type it.</li><li>Select ATC / ASOS / ATIS source and clearance types from the drop-downs.</li></ul>
      <h3>WX codes</h3><table class="ref">${WXREF.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('')}</table></section>
    <section class="card wide"><h2>About</h2><p class="fx">IFR AMR Planner v${VERSION}. Replaces the Cheat Sheet → AMR / DD 175 / DD 175-1 / Grade Sheet workflow of the Army instrument AMR Excel template. Works offline after the first load; add to the Home Screen from Safari's Share menu. Missions are saved only in this browser (localStorage) - use Missions → Export to back them up. Not covered in v1: DD 1801 / 1801-C, other states, ADS-B/winds-aloft/live weather.</p></section></div>`;
  }

  /* ---------- views ---------- */
  function renderView() {
    const t = S.tab;
    if (t === 'amr') $('#view-amr').innerHTML = viewAMR();
    else if (t === '175') $('#view-175').innerHTML = viewDD175();
    else if (t === '1751') $('#view-1751').innerHTML = viewDD1751();
    else if (t === 'scripts') $('#view-scripts').innerHTML = viewScripts();
    else if (t === 'info') { $('#view-info').innerHTML = viewInfo(); wireInfo(); }
  }
  function setTab(t) {
    S.tab = t; document.body.dataset.view = t;
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    renderView(); window.scrollTo(0, 0);
  }
  function wireInfo() {
    const cs = $('#cycSel'); cs && cs.addEventListener('change', async () => { S.settings.cycle = cs.value; jset(LS.settings, S.settings); await reloadData(); toast('Using cycle ' + D.cycle.tpp); });
    const cp = $('#compat'); cp && cp.addEventListener('change', () => { S.settings.compat = cp.checked; jset(LS.settings, S.settings); toast(cp.checked ? 'Workbook-compatible mode ON' : 'Workbook-compatible mode OFF'); });
    const bw = $('#btnWipe'); bw && bw.addEventListener('click', () => { if (confirm('Erase all saved missions and settings on this device?')) { Object.values(LS).forEach(k => localStorage.removeItem(k)); location.reload(); } });
  }
  async function reloadData() {
    await D.init(S.settings.cycle); await D.loadState(S.settings.state); badge(); $('#view-plan').innerHTML = planHTML(); afterPlan(); renderView();
  }
  function badge() {
    const c = D.cycle, st = D.cycleStatus(c), el = $('#cycBadge');
    el.className = 'cyc ' + st.state; el.textContent = `FAA cycle ${c.tpp} • ${st.state === 'current' ? 'eff ' + fmtDate(c.from.slice(0, 10)) + ' – ' + fmtDate(c.to.slice(0, 10)) : st.text}`;
    el.title = `NASR ${c.nasr}; d-TPP ${c.tpp} effective ${c.from} to ${c.to}. Training/planning only - verify against current FAA publications.`;
  }
  function afterPlan() { wirePickers($('#view-plan')); refreshPlan(); $('#missionLabel').textContent = S.m.name || 'New mission'; }

  /* ---------- missions modal ---------- */
  const missions = () => jget(LS.missions, {});
  function openMissions() {
    const ms = missions(), names = Object.keys(ms).sort((a, b) => (ms[b].saved || '').localeCompare(ms[a].saved || ''));
    const m = $('#modal');
    m.innerHTML = `<div class="box"><h2 style="margin:0 0 8px">Missions <button class="btn sm" style="float:right" data-m="close">Close</button></h2>
      <div class="grid g2"><div class="f full"><label>Save current mission as</label><input id="mName" value="${esc(S.m.name || '')}" placeholder="Mission name"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button class="btn pri" data-m="save">Save</button><button class="btn" data-m="new">New mission</button><button class="btn" data-m="example">KTUS→KRYN→KDMA example</button></div>
      <h3 style="font-size:13px;color:var(--mut);text-transform:uppercase">Saved (${names.length})</h3>
      ${names.map(n => `<div class="mrow"><span><b>${esc(n)}</b><small>${esc(ms[n].dep.id)} → ${esc(ms[n].d1.id)} → ${esc(ms[n].d2.id)} • ${esc(ms[n].date)}</small></span><button class="btn sm" data-m="load" data-n="${esc(n)}">Load</button><button class="btn sm" data-m="dup" data-n="${esc(n)}">Copy</button><button class="btn sm danger" data-m="del" data-n="${esc(n)}">✕</button></div>`).join('') || '<p class="fx">No saved missions yet.</p>'}
      <h3 style="font-size:13px;color:var(--mut);text-transform:uppercase">Backup</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-m="export">Export all (.json)</button><label class="btn" style="display:inline-block">Import<input type="file" id="impFile" accept=".json,application/json" hidden></label></div></div>`;
    m.hidden = false;
  }
  async function loadMission(obj) {
    S.m = merge(M.defaultMission(), obj); jset(LS.cur, S.m);
    await ensureStates(); $('#view-plan').innerHTML = planHTML(); afterPlan(); renderView();
  }
  async function ensureStates() {   // lazy-load the state of every airport on the mission (v1: AZ only)
    for (const k of ['dep', 'd1', 'd2']) { /* all v1 airports are in the single bundled state; hook for per-state lazy loading */ }
    await D.loadState(S.settings.state);
  }
  function wireModal() {
    const m = $('#modal');
    m.addEventListener('click', async e => {
      if (e.target === m) { m.hidden = true; return; }
      const b = e.target.closest('[data-m]'); if (!b) return; const a = b.dataset.m, n = b.dataset.n, ms = missions();
      if (a === 'close') m.hidden = true;
      else if (a === 'save') { const name = $('#mName').value.trim(); if (!name) { toast('Give the mission a name'); return; } S.m.name = name; ms[name] = Object.assign({}, S.m, { saved: new Date().toISOString() }); jset(LS.missions, ms); jset(LS.cur, S.m); $('#missionLabel').textContent = name; const nb = $('[data-b="name"]'); nb && (nb.value = name); toast('Saved "' + name + '"'); openMissions(); }
      else if (a === 'load') { await loadMission(ms[n]); m.hidden = true; toast('Loaded "' + n + '"'); }
      else if (a === 'dup') { let nn = n + ' copy'; while (ms[nn]) nn += '+'; ms[nn] = Object.assign({}, ms[n], { name: nn, saved: new Date().toISOString() }); jset(LS.missions, ms); openMissions(); }
      else if (a === 'del') { if (confirm('Delete "' + n + '"?')) { delete ms[n]; jset(LS.missions, ms); openMissions(); } }
      else if (a === 'new') { await loadMission(M.defaultMission()); m.hidden = true; toast('New mission'); }
      else if (a === 'example') { const d = M.defaultMission(); d.name = 'KTUS-KRYN-KDMA example'; d.dep.id = 'KTUS'; d.d1.id = 'KRYN'; d.d2.id = 'KDMA'; d.dep.apr = ''; await loadMission(d); m.hidden = true; toast('Example loaded'); }
      else if (a === 'export') { const blob = new Blob([JSON.stringify({ app: 'amr-planner', version: 1, current: S.m, missions: ms }, null, 1)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'amr-missions-' + M.isoDate(new Date()) + '.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }
    });
    m.addEventListener('change', async e => {
      if (e.target.id !== 'impFile' || !e.target.files[0]) return;
      try { const j = JSON.parse(await e.target.files[0].text()); const ms = missions(); let n = 0; Object.entries(j.missions || {}).forEach(([k, v]) => { ms[k] = v; n++; }); if (j.dep && j.d1) { ms[j.name || 'Imported mission'] = j; n++; } jset(LS.missions, ms); toast(n + ' mission(s) imported'); openMissions(); } catch (err) { toast('Import failed: not a mission file'); }
    });
  }

  /* ---------- share ---------- */
  function amrText() {
    const o = M.amr(S.m, env), d = M.dd175(S.m, env);
    return ['AIR MISSION REQUEST - ' + S.m.date, '', 'MISSION: ' + o.mission, '', 'SPECIAL INSTRUCTIONS: ' + o.special, '', "COMMANDER'S INTENT: " + o.intent, '',
      `AIRCRAFT: ${o.aircraft} ${o.design}  SER: ${o.serial}  GW: ${o.gw}  FUEL: ${o.fuel}`, `TAS: ${o.tas}  HOVER ${o.hover}  CLIMB ${o.climb}  CRUISE ${o.cruise}`, '',
      `DD175: ${d.leg1.dep} ETD ${d.leg1.etd}Z ${d.leg1.alt} -> ${d.leg1.to} ETE ${d.leg1.ete}; ${d.leg2.dep} ETD ${d.leg2.etd}Z -> ${d.leg2.to} ETE ${d.leg2.ete}`,
      'Source: FAA cycle ' + D.cycle.tpp + ' - training/planning only, verify against current FAA publications.'].join('\n');
  }
  async function share() {
    const t = amrText();
    try { if (navigator.share) { await navigator.share({ title: 'AMR ' + (S.m.name || ''), text: t }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(t); toast('Copied AMR text'); } catch (e) { prompt('Copy:', t); }
  }

  /* ---------- global wiring ---------- */
  function wire() {
    document.addEventListener('input', onField); document.addEventListener('change', onField);
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#btnMissions').addEventListener('click', openMissions);
    $('#btnPrint').addEventListener('click', () => window.print());
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (a) { if (a.dataset.act === 'print') window.print(); else if (a.dataset.act === 'share') share(); else if (a.dataset.act === 'goplan') setTab('plan'); }
      const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Copied'), () => { }); }
      if (e.target.id === 'btnGC') {
        const p = x => { const a = D.ap(x.id); return a && a.p; }, F1 = S.m.f175, pr = (a, b, f) => { if (p(a) && p(b)) { F1[f] = String(Math.round(M.nm(p(a), p(b)))); const el = $(`[data-b="f175.${f}"]`); el && (el.value = F1[f]); } };
        pr(S.m.dep, S.m.d1, 'v1'); pr(S.m.d1, S.m.d2, 'v2'); pr(S.m.d1, S.m.d2, 'v3'); save(); toast('Distances filled (direct); add procedure miles');
      }
    });
    wireModal();
    window.addEventListener('beforeprint', () => { if (S.tab === 'plan') { /* print the plan as-is */ } });
  }

  /* ---------- boot ---------- */
  async function boot() {
    S.settings = Object.assign(S.settings, jget(LS.settings, {}));
    await D.init(S.settings.cycle);
    await D.loadState(S.settings.state);
    S.m = merge(M.defaultMission(), jget(LS.cur, null) || {});
    badge();
    $('#view-plan').innerHTML = planHTML(); afterPlan(); wire();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
    window.__amr = { S, M, D, env, setTab, renderView };       // handy for tests
    document.body.dataset.ready = '1';
  }
  boot().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#b00;padding:12px">Failed to start: ${esc(e.message)}</pre>`); console.error(e); });
})();
