/* IFR AMR Planner - UI. Vanilla JS, no build step, no backend. */
(function () {
  'use strict';
  const M = window.AMRModel, D = window.AMRData;
  const BUILD = window.AMR_BUILD || { version: '?', commit: 'dev', built: '' }, VERSION = BUILD.version;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = { cur: 'amr.current.v1', missions: 'amr.missions.v1', settings: 'amr.settings.v1' };
  const S = { m: null, settings: { cycle: 'auto', compat: false, state: 'AZ', legacy175: false }, tab: 'plan', sub: '1801', dirtyPlan: false };
  const env = { ap: id => D.ap(id), acft: d => D.acft(d), device: d => D.device(d), get compat() { return S.settings.compat; } };

  /* ---------- storage ---------- */
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save (storage full or blocked)'); } };
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.map((x, i) => (base[i] && typeof base[i] === 'object') ? merge(base[i], x) : x) : base;
    if (base && typeof base === 'object') { const o = {}; for (const k in base) o[k] = (over && k in over) ? merge(base[k], over[k]) : base[k]; if (over) for (const k in over) if (!(k in o)) o[k] = over[k]; return o; }
    return over === undefined ? base : over;
  }
  // older saves called the flight-plan inputs 'f175' (the DD 175 was the flight plan); the DD 1801 is now the flight plan
  function migrate(o) { o = o || {}; if (o.f175 && !o.fp) o.fp = o.f175; delete o.f175; return o; }
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
      ${F('Weather source', sel(k + '.wx', M.WX_CHOICES), 'full', `<span class="hint" id="wxh-${k}"></span>`)}
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
    <section class="card"><h2>Flight plan <small>DD 1801</small></h2><div class="grid g3">
      ${F('ETD (Z, HHMM)', inp('fp.etd', { attrs: 'inputmode="numeric" maxlength="4"', ph: '1930' }))}
      ${F('Planning TAS (KIAS)', inp('fp.tas', { attrs: 'inputmode="numeric"' }))}
      ${F('Flight rules', sel('fp.rules', ['I', 'V']))}
      ${F('Alt leg 1 (hundreds)', inp('fp.alt1', { attrs: 'inputmode="numeric" maxlength="3"', ph: '040' }))}
      ${F('Alt leg 2 (hundreds)', inp('fp.alt2', { attrs: 'inputmode="numeric" maxlength="3"', ph: '040' }))}
      ${F('Ground time dest 1 (min)', inp('fp.hold', { attrs: 'inputmode="numeric"' }))}
      ${F('Route leg 1', inp('fp.route1', { ph: 'DIRECT' }), 'span2')}${F('Fuel on board', inp('fp.fob'))}
      ${F('Route leg 2', inp('fp.route2', { ph: 'DIRECT' }), 'span2')}${F('Terminal-area delay routing', inp('fp.termRoute'))}
      ${F('Clearance void (min after ETD)', inp('scriptOpts.voidMin', { attrs: 'inputmode="numeric"', ph: '30' }), '', '<span class="hint">Void = ETD + this (relay clearance script)</span>')}${F('NLT advise (min after ETD)', inp('scriptOpts.nltMin', { attrs: 'inputmode="numeric"', ph: '30' }), '', '<span class="hint">NLT = ETD + this</span>')}</div>
      <div class="msg ok" id="timing" style="margin-top:8px"></div>
      <h3>Distances (nm)</h3><div class="grid g3">
      ${F('Leg 1 dist', inp('fp.v1', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc1"></span>')}${F('Leg 1 + (SID/STAR/app)', inp('fp.x1', { attrs: 'inputmode="decimal"' }))}${F('Leg 1 PT/Hold min', inp('fp.w1', { attrs: 'inputmode="decimal"' }))}
      ${F('Leg 2 dist', inp('fp.v2', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc2"></span>')}${F('Leg 2 + (SID/STAR/app)', inp('fp.x2', { attrs: 'inputmode="decimal"' }))}${F('Leg 2 PT/Hold min', inp('fp.w2', { attrs: 'inputmode="decimal"' }))}
      ${F('To ALT dist', inp('fp.v3', { attrs: 'inputmode="decimal"' }), '', '<span class="hint" id="gc3"></span>')}${F('To ALT +', inp('fp.x3', { attrs: 'inputmode="decimal"' }))}${F('ALT PT/Hold min', inp('fp.w3', { attrs: 'inputmode="decimal"' }))}</div>
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
      cnt.textContent = ''; const wh0 = $('#wxh-' + k); if (wh0) wh0.textContent = ''; return;
    }
    cnt.textContent = a.c;
    const wx = M.wxSource(x, a), wh = $('#wxh-' + k);
    if (wh) wh.textContent = (wx.auto ? 'Auto: ' : '') + wx.tip + (wx.auto ? ' (' + wx.why + ')' : '');
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
  function renderTiming() {
    const el = $('#timing'); if (!el) return; const f = M.flight(S.m, env), o = S.m.scriptOpts || {}, mins = v => (String(v == null ? '' : v).trim() === '' || isNaN(+v) ? 30 : Math.max(0, Math.round(+v)));
    el.innerHTML = `ETD <b>${M.hhmm(f.etd1)}Z</b> • leg 1 ETE <b>${M.hplusmm(f.ete1)}</b> → ETA <b>${M.hhmm(f.eta1)}Z</b> • leg 2 ETD <b>${M.hhmm(f.etd2)}Z</b>, ETE <b>${M.hplusmm(f.ete2)}</b>, ETA <b>${M.hhmm(f.eta2)}Z</b> • clearance void <b>${M.hhmm(f.etd1 + mins(o.voidMin))}Z</b>, NLT <b>${M.hhmm(f.etd1 + mins(o.nltMin))}Z</b>`;
  }
  function refreshPlan(only) {
    const ks = only ? [only] : ['dep', 'd1', 'd2'];
    ks.forEach(k => { fillDyn(k); renderInfo(k); renderMsgs(k); });
    renderAlt(); renderSerial(); renderGC(); renderTiming();
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
    if (/^(fp|scriptOpts)\./.test(path)) renderTiming();
    if (/^(dep|d1|d2)\.wx$/.test(path)) renderInfo(k);
    if (S.tab !== 'plan') S.dirtyPlan = true;
    if (S.tab === 'fp' || S.tab === '1751') schedPdf();
  }

  /* ---------- OUTPUT: AMR ---------- */
  const pre = t => esc(t).replace(/\n/g, '<br>');
  function footer() { const c = D.cycle; return `<div class="foot">Generated by IFR AMR Planner v${VERSION} • FAA data cycle ${esc(c.tpp)} (eff ${esc(c.from.slice(0, 10))} to ${esc(c.to.slice(0, 10))}) • Training/planning aid - verify against current FAA publications.</div>`; }
  function barHTML(title) { return `<div class="outbar noprint"><button class="btn pri" data-act="print">Print / Save PDF</button><button class="btn" data-act="share">Share text</button><button class="btn" data-act="goplan">Edit inputs</button></div><div class="fx noprint swipe" style="margin:-4px 0 6px">Swipe sideways to see the whole form on a phone — Print / Save PDF always fits the page.</div>`; }
  function viewAMR() {
    const o = M.amr(S.m, env);
    const kv = (a, b) => `<tr><td class="l">${a}</td><td>${b}</td></tr>`;
    return `${barHTML()}<h1>AIR MISSION REQUEST</h1>
      <p class="sub" style="text-align:center">${esc(S.m.date)} • ${esc(S.m.dep.id)} → ${esc(S.m.d1.id)} → ${esc(S.m.d2.id)}</p>
      <table><tr><th>#</th><th>Airfield</th></tr><tr><td>1</td><td>${esc(o.I1)}</td></tr><tr><td>2</td><td>${esc(o.I2)}</td></tr><tr><td>3</td><td>${esc(o.I3)}</td></tr></table>
      <h2>MISSION</h2><p>${esc(o.mission)}</p><h2>Special Instructions</h2><p>${esc(o.special)}</p><h2>Commanders Intent</h2><p>${esc(o.intent)}</p>
      <h2>Planning Information</h2><table>${kv('Aircraft:', esc(o.aircraft) + ' &nbsp; ' + esc(o.design))}${kv('Serial Number:', esc(o.serial))}${kv('Gross Weight:', esc(o.gw))}${kv('Planning Fuel:', esc(o.fuel))}${kv('Weight &amp; Balance:', esc(o.wb))}${kv('Unit / Station:', esc(o.unit))}</table>
      <h2>Performance Planning</h2><table>${kv('Hover Power:', esc(o.hover))}${kv('Climb Power:', esc(o.climb))}${kv('Cruise Power:', esc(o.cruise))}${kv('Fuel Burn Rate:', esc(o.burn))}${kv('True Airspeed:', esc(S.m.fp.tas) + ' KIAS (increase 1 KIAS per 1000 feet MSL)')}</table>
      <h2>Passengers</h2><p>${esc(o.pax.name)}${o.pax.rank ? ' • ' + esc(o.pax.rank) : ''}${o.pax.org ? ' • ' + esc(o.pax.org) : ''}</p>
      <h2>CREW</h2><table><tr><th>Name</th><th>Rank</th><th>Organization / Station</th></tr>${o.crew.map(c => `<tr><td>${esc(c.name) || '&nbsp;'}</td><td>${esc(c.rank)}</td><td>${esc(c.org)}</td></tr>`).join('')}</table>
      <h2>Remarks</h2><p>${pre(o.remarks)}</p>
      <h2>Publications</h2><table>${kv('ELA:', esc(o.ela))}${kv('VFR Sectional:', esc(o.sect))}${kv('IAP:', esc(o.iap))}</table>${footer()}`;
  }

  /* ---------- OUTPUT: official forms ---------- */
  function fmtDate(iso) { const [y, m, d] = String(iso).split('-'); const mo = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+m - 1]; return `${d}-${mo}-${String(y).slice(2)}`; }

  /* ---------- OFFICIAL FORMS: the DoD PDF is filled with pdf-lib and previewed with pdf.js ---------- */
  const FORMS = {
    '1801': { f: 'dd1801', t: 'DD Form 1801 - DoD International Flight Plan', ed: '1 May 1987', pdf: 'DD1801' },
    '1801c': { f: 'dd1801c', t: 'DD Form 1801-C - Continuation', ed: '21 May 2019', pdf: 'DD1801-C' },
    '175': { f: 'dd175', t: 'DD Form 175 - Military Flight Plan (legacy)', ed: '1 May 1986', pdf: 'DD175' },
    '1751': { f: 'dd175-1', t: 'DD Form 175-1 - Flight Weather Briefing', ed: '1 Oct 2002', pdf: 'DD175-1' }
  };
  const PDF = { zoom: 'fit', tok: 0, cache: {}, task: null, last: null };
  const curForm = () => (S.tab === '1751' ? '1751' : S.sub);
  const pdfLibsOK = () => window.PDFLib && window.pdfjsLib && window.AMRForms;
  async function pdfAsset(url, json) {
    if (PDF.cache[url]) return PDF.cache[url];
    const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
    return (PDF.cache[url] = json ? await r.json() : new Uint8Array(await r.arrayBuffer()));
  }
  const sunNow = () => { const a = D.ap(S.m.dep.id); return a && a.p ? M.sun(S.m.date, a.p[0], a.p[1]) : null; };
  async function buildPdf(fk, flatten) {
    const def = FORMS[fk], AF = window.AMRForms, W = (await pdfAsset('forms/fields.json', true))[def.f].widgets;
    const ops = fk === '1801' ? AF.ops1801(W, M.dd1801(S.m, env)) : fk === '1801c' ? AF.ops1801C(W, M.dd1801C(S.m, env))
      : fk === '175' ? AF.ops175(W, S.m, M.dd175(S.m, env)) : AF.ops1751(W, S.m, M.dd1751(S.m, env), sunNow());
    return AF.fill(window.PDFLib, await pdfAsset('forms/' + def.f + '.pdf'), ops, { flatten });
  }
  async function renderPdf() {
    const host = $('#pdfhost'); if (!host) return;
    const fk = curForm(), tok = ++PDF.tok, st = $('#pdfst');
    try {
      if (!pdfLibsOK()) throw new Error('PDF libraries are not loaded (open the app once online so they are cached)');
      const bytes = await buildPdf(fk, true); if (tok !== PDF.tok) return;
      PDF.last = { fk, bytes };
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      const doc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise, pg = await doc.getPage(1); if (tok !== PDF.tok) return;
      const base = pg.getViewport({ scale: 1 });
      const css = PDF.zoom === 'fit' ? Math.max(280, host.clientWidth - 2) : base.width * (4 / 3) * PDF.zoom;    // 100% = 96 dpi (Letter = 816 CSS px)
      let px = Math.min(window.devicePixelRatio || 1, 3) * css / base.width; const maxPx = 12e6;
      if (base.width * base.height * px * px > maxPx) px = Math.sqrt(maxPx / (base.width * base.height));
      const vp = pg.getViewport({ scale: px }), cv = $('#pdfc');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); cv.style.width = css + 'px'; cv.style.height = (css * base.height / base.width) + 'px';
      if (PDF.task) { try { PDF.task.cancel(); } catch (e) { } }
      PDF.task = pg.render({ canvasContext: cv.getContext('2d'), viewport: vp });
      await PDF.task.promise; if (tok !== PDF.tok) return;
      if (st) st.textContent = `Official ${FORMS[fk].t}, edition ${FORMS[fk].ed}. This is the real DoD form with your data typed into its own fields - box positions are DoD's.`;
      host.dataset.ready = fk;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      if (st) st.innerHTML = `<span style="color:var(--bad)">Could not build the form: ${esc(e.message || e)}</span>`;
      console.error(e);
    }
  }
  let pdfT = null; const schedPdf = () => { clearTimeout(pdfT); pdfT = setTimeout(renderPdf, 180); };
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function pdfAction(a) {
    const fk = curForm(); if (!pdfLibsOK()) { toast('PDF libraries not loaded'); return; }
    try {
      const bytes = await buildPdf(fk, a !== 'save'), url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const name = `${FORMS[fk].pdf}_${M.serNum(S.m, env).replace(/[^A-Za-z0-9-]/g, '')}_${S.m.date}.pdf`;
      if (a === 'save') { const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); toast('Saved fillable PDF'); }
      else if (a === 'open' || isIOS()) { if (!window.open(url, '_blank')) location.href = url; if (a === 'print') toast('Tap Share → Print. Leave scaling at 100% (Letter).'); }
      else {
        const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; fr.src = url; document.body.appendChild(fr);
        fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } setTimeout(() => fr.remove(), 60000); };
        toast('Print dialog: Paper = Letter, Scale = 100% / Actual size (not "Fit")');
      }
    } catch (e) { toast('Could not build PDF: ' + (e.message || e)); console.error(e); }
  }
  function pdfPanel() {
    return `<div class="pdfbar noprint"><button class="btn pri" data-pdf="print">Print (100%)</button><button class="btn" data-pdf="open">Open PDF</button><button class="btn" data-pdf="save">Download fillable PDF</button>
      <span class="zoom"><button class="btn sm" data-zoom="fit">Fit</button><button class="btn sm" data-zoom="1">100%</button><button class="btn sm" data-zoom="1.5">150%</button><button class="btn sm" data-zoom="2">200%</button></span></div>
      <div class="fx noprint" id="pdfst">Building the official form…</div>
      <div class="pdfwrap" id="pdfhost"><canvas id="pdfc" aria-label="Filled official form"></canvas></div>
      <p class="fx noprint">Print the PDF at <b>Letter, 100% / Actual size</b> (never "Fit to page" or "Shrink to fit") so the boxes keep their official size. On iPhone/iPad: Open PDF → Share → Print, and leave scaling at 100%.</p>`;
  }
  const wideOpen = () => (window.innerWidth >= 1000 ? 'open' : '');
  const withCur = (list, cur) => (cur === '' || list.some(x => (Array.isArray(x) ? x[0] : x) === cur)) ? list : list.concat([cur]);
  const chipSet = (path, list) => { const cur = getp(path) || []; return `<div class="chips pick">${list.map(([c, d]) => `<button type="button" class="chipb${cur.includes(c) ? ' on' : ''}" data-chip="${path}" data-c="${esc(c)}" title="${esc(d)}">${esc(c)}</button>`).join('')}</div>`; };

  /* ---------- Flight plan tab: DD 1801 (primary), 1801-C, DD 175 (legacy) ---------- */
  function viewFP() {
    if (S.sub === '175' && !S.settings.legacy175) S.sub = '1801';
    const fk = S.sub, tabs = [['1801', 'DD 1801'], ['1801c', 'DD 1801-C']].concat(S.settings.legacy175 ? [['175', 'DD 175 · legacy']] : []);
    const nav = `<div class="subnav noprint">${tabs.map(([k, l]) => `<button class="${k === fk ? 'on' : ''}" data-fp="${k}">${l}</button>`).join('')}</div>`;
    let top = '';
    if (fk === '1801') top = inputs1801();
    else if (fk === '1801c') top = `<div class="card"><h2>DD Form 1801-C (continuation)</h2><p class="fx" style="margin:0">Block 1 = leg 2 (${esc(S.m.d1.id)} → ${esc(S.m.d2.id)}); block 2 = ${esc(S.m.d2.id)} → second alternate when one is entered on the Plan tab; block 3 stays blank. Items 7, 8, 10, 15, 18 and 19 follow the DD 1801 inputs.</p></div>`;
    else top = `<div class="card"><h2>DD Form 175 - legacy</h2><p class="fx" style="margin:0">The DD 175 (May 1986) is shown only because "Show legacy DD 175" is on in Info. The DD 1801 is the flight plan; its inputs (ETD, TAS, altitude, route, fuel) are on the Plan tab and this form is filled from the same inputs, with its own altitude-adjusted TAS and ETE.</p></div>`;
    return `${nav}${pdfPanel()}${top}${footer()}`;
  }
  function inputs1801() {
    const eq = (D.static && D.static.eq) || { nav: [], sur: [], pbn: [] }, d = M.dd1801(S.m, env), P = 'f1801.';
    const i18 = [['sts', 'STS'], ['nav', 'NAV'], ['com', 'COM'], ['dat', 'DAT'], ['sur', 'SUR'], ['reg', 'REG'], ['eet', 'EET'], ['sel', 'SEL'], ['typ', 'TYP'], ['code', 'CODE'], ['dle', 'DLE'], ['rvr', 'RVR'], ['opr', 'OPR'], ['orgn', 'ORGN'], ['per', 'PER'], ['altn', 'ALTN'], ['ralt', 'RALT'], ['talt', 'TALT'], ['rif', 'RIF'], ['rmk', 'RMK']];
    const warn = M.check1801(S.m, env).map(w => `<div class="msg ${w.level}">${esc(w.msg)}</div>`).join('');
    return `<details class="card inp" ${wideOpen()}><summary class="h2">DD 1801 inputs <small>blank = automatic</small></summary>${warn}
      <div class="grid g4">
      ${F('Item 7 aircraft id', `<input value="${esc(d.acid)}" disabled>`, '', '<span class="hint">from serial / N-number</span>')}
      ${F('Priority', sel(P + 'priority', ['FF', 'SS', 'DD', 'GG', 'KK']))}
      ${F('Item 8 flight rules', sel(P + 'rules', [['I', 'I - IFR'], ['V', 'V - VFR'], ['Y', 'Y - IFR then VFR'], ['Z', 'Z - VFR then IFR']], 'auto (' + d.rules + ')'))}
      ${F('Type of flight', sel(P + 'type', [['M', 'M - military'], ['G', 'G - general aviation'], ['S', 'S - scheduled'], ['N', 'N - non-scheduled'], ['X', 'X - other']]))}
      ${F('Item 9 number', inp(P + 'number', { ph: 'blank', attrs: 'maxlength="2" inputmode="numeric"' }))}
      ${F('Wake category', sel(P + 'wake', [['L', 'L - light'], ['M', 'M - medium'], ['H', 'H - heavy'], ['J', 'J - super']], 'auto (' + d.wake + ')'))}
      ${F('Filing time (DDHHMM)', inp(P + 'filing', { ph: d.filing }))}
      ${F('Originator', inp(P + 'origin', { ph: d.originator || '' }))}
      ${F('Addressee 1', inp(P + 'addr.0', { ph: 'e.g. KZAB' }))}${F('Addressee 2', inp(P + 'addr.1'))}${F('Addressee 3', inp(P + 'addr.2'))}
      ${F('Item 19 POB', inp(P + 'pob', { ph: String(d.pob || ''), attrs: 'inputmode="numeric"' }))}
      ${F('Item 19 RDO', inp(P + 'rdo', { ph: 'blank' }))}${F('Extra remarks', inp(P + 'rmkExtra', { ph: 'appended to RMK' }), 'span2')}
      </div>
      <details open><summary>Item 10 - equipment &amp; surveillance (tap to toggle)</summary>
        <div class="f"><label>Radio / navigation / approach aids</label>${chipSet(P + 'nav', eq.nav)}</div>
        <div class="f"><label>Surveillance (SSR / ADS-B)</label>${chipSet(P + 'surv', eq.sur)}</div>
        <div class="f"><label>PBN capabilities (item 18 PBN/)</label>${chipSet(P + 'pbn', eq.pbn)}</div></details>
      <details><summary>Item 18 - other information (extra entries)</summary><div class="grid g4">${i18.map(([k, l]) => F(l + '/', inp(P + 'i18.' + k, { ph: '' }))).join('')}</div>
        <p class="fx">Generated entries (PBN/, DEP/, DEST/, DOF/ …) are added automatically; anything typed here is added after them.</p></details>
      <div class="grid g2"><div class="f chk"><input type="checkbox" data-b="${P}crewLoc" ${S.m.f1801.crewLoc ? 'checked' : ''} id="cl1"><label for="cl1">Crew list "LOCATED AT" departure</label></div><div class="f chk"><input type="checkbox" data-b="${P}paxLoc" ${S.m.f1801.paxLoc ? 'checked' : ''} id="cl2"><label for="cl2">Passenger manifest "LOCATED AT" departure</label></div></div></details>`;
  }

  /* ---------- DD 175-1 tab: official form + inputs ---------- */
  function viewDD1751() {
    const F1 = S.m.f1751, T = (l, path, ph, cls) => F(l, inp(path, { ph }), cls);
    const lv = ['LIGHT', 'MODERATE', 'SEVERE'];
    const icing = ['NONE', 'TRACE RIME'].concat(['RIME', 'MIXED', 'CLEAR'].flatMap(t => ['LIGHT', 'MODERATE', 'SEVERE'].map(l => `${l} ${t}`)));
    const precip = ['NONE'].concat(['DRIZZLE', 'RAIN', 'SNOW', 'PELLET'].flatMap(t => ['LIGHT', 'MODERATE', 'HEAVY'].map(l => `${l} ${t}`)), ['SHOWERS RAIN', 'SHOWERS SNOW', 'FREEZING DRIZZLE', 'FREEZING RAIN']);
    const S1 = (l, p, list, cls) => F(l, sel('f1751.' + p, withCur(list, F1[p] || '')), cls);
    return `${pdfPanel()}<details class="card inp" ${wideOpen()}><summary class="h2">DD 175-1 inputs</summary><details open><summary>Part I &amp; II</summary><div class="grid g4">
      ${T('Climb layer', 'f1751.climbLayer', 'SFC-050')}${T('11. Watch/warning', 'f1751.watch', '')}${T('14. Flight level', 'f1751.fl', '040')}${S1('15. Space weather', 'space', ['NO IMPACT', 'MARGINAL', 'SEVERE'])}
      ${T('BMNT (Z)', 'f1751.bmnt', 'auto')}${T('SR (Z)', 'f1751.sr', 'auto')}${T('SS (Z)', 'f1751.ss', 'auto')}${T('EENT (Z)', 'f1751.eent', 'auto')}
      ${S1('17. Clouds at FL', 'cloudsFL', ['YES', 'NO', 'IN AND OUT'])}${S1('18. Obscurations', 'obsc', ['NO', 'YES'])}${T('Obscuration type', 'f1751.obscType', '')}${T('19. Min ceiling / loc', 'f1751.minCeil', 'auto')}
      ${T('20. Max cloud tops (MSL)', 'f1751.cloudTops', '110')}${T('21. Min freezing lvl (MSL)', 'f1751.frz', '100')}${S1('22. Thunderstorms', 'tstm', ['NONE', 'AREA', 'LINE'])}${S1('23. Turbulence', 'turb', ['NONE'].concat(lv, 'EXTREME'))}
      ${S1('Turbulence where', 'turbWhere', ['IN CLEAR', 'IN CLOUD'])}${S1('24. Icing', 'icing', icing)}${S1('25. Precipitation', 'precip', precip)}</div></details>
      <details><summary>Part III valid times (blank = ETA ∓ 1 h, TEMPO ± 15 min)</summary><div class="grid g4">
      ${T('Dest 1 from', 'f1751.v1a', 'auto')}${T('Dest 1 to', 'f1751.v1b', 'auto')}${T('Dest 2 from', 'f1751.v2a', 'auto')}${T('Dest 2 to', 'f1751.v2b', 'auto')}</div></details>
      <details open><summary>Part IV &amp; V</summary><div class="grid g4">
      ${S1('32. Briefed RSC/RCR', 'rscBriefed', ['NOT AVAILABLE', 'YES'])}${T('33. PMSV', 'f1751.pmsv', '306.5')}${S1('34. Attachments', 'attach', ['YES', 'NO'])}${T('36. Brief time (Z)', 'f1751.briefTime', '1900')}
      ${T('37. Flimsy no.', 'f1751.flimsy', '')}${T("38. Briefer's initials", 'f1751.init', 'EO')}${T('39. Person briefed', 'f1751.recvName', '', 'span2')}
      <div class="f full"><label>35. Remarks / NOTAMs</label>${area('f1751.notams', 'one per line')}</div></div></details>
      <p class="fx">${env.compat ? 'Workbook-compatible mode: density altitude and Dest-1 pressure altitude use the original workbook formulas.' : 'Density altitude = PA + 120 × (OAT − ISA), ISA = 15 − 2 × PA/1000 (the workbook has a misplaced parenthesis; Info → workbook-compatible mode reproduces it).'} Sun times come from the departure airport position.</p></details>${footer()}`;
  }

  /* ---------- OUTPUT: Scripts (Grade Sheet) ---------- */
  const mark = t => esc(t).replace(/\u27E6/g, '<span class="fv">').replace(/\u27E7/g, '</span>').replace(/\u27EA/g, '<span class="bk">[').replace(/\u27EB/g, ']</span>');
  function viewScripts() {
    const c = M.calls(S.m, env), g = c.grade, m = S.m, h = c.hdr;
    const sc = (title, key, hk) => g[key] === '' || g[key] == null ? '' : `<div class="script"><h3>${esc(title)}<button class="btn sm" data-copy="${esc(M.plain(g[key]))}">Copy</button></h3>${h[hk || key] ? `<div class="facl">${esc(h[hk || key])}</div>` : ''}<p>${mark(g[key])}</p></div>`;
    const left = [...new Set(Object.values(g).flatMap(t => M.blanks(t)))];
    const row = k => {          // read-only: the Plan tab is the single source of truth, nothing here can diverge from it
      const x = m[k], w = c.src[k];
      return `<div class="sctl"><b>${esc(APN[k])} ${esc(x.id)}</b><div class="kv" style="grid-column:1/-1"><b>Weather</b><span>${esc((w.auto ? 'Auto → ' : '') + w.label)}${w.freq && w.freq.txt ? ' • ' + esc(w.freq.txt) : ''}${w.phone ? ' • ph ' + esc(w.phone) : ''}</span>
        <b>Approach</b><span>${esc(x.apr || '—')}</span><b>Runway</b><span>${esc(x.rwy || '—')}</span><b>${k === 'dep' ? 'SID / transition' : 'STAR'}</b><span>${esc(k === 'dep' ? ((x.sid || '—') + (x.trans ? ' / ' + x.trans : '')) : (x.star || '—'))}</span></div></div>`;
    };
    return `<div class="outbar"><button class="btn pri" data-act="print">Print / Save PDF</button><button class="btn" data-act="goplan">Edit inputs</button></div>
      <div class="card noprint"><h2>Plan used for these scripts <button class="btn sm" data-act="goplan">Change on Plan tab</button></h2><div class="sctls">${row('dep')}${row('d1')}${row('d2')}</div>
        <p class="fx" style="margin:6px 0 0"><span class="fv">Blue</span> = filled from your plan, the AMR inputs and FAA data. <span class="bk">[red]</span> = ATC assigns it live, so nothing can fill it${left.length ? ': ' + esc(left.join(', ')) : ''}.</p></div>
      <div class="script"><h3>Grade sheet setup</h3><p>${esc(g.cockpit)}   •   ${esc(g.simTemp)}   •   Date ${esc(fmtDate(m.date))}</p></div>
      <div class="s2"><div>
      <h3 style="margin:4px 0">DEPARTURE - ${esc(m.dep.id)}</h3><div class="fx" style="margin:0 0 6px">${esc(c.src.dep.tip)}</div>
      ${sc('Departure weather (' + c.src.dep.label + ')', 'depWx')}${sc('Clearance delivery (' + m.dep.cd + ')', 'cd')}${sc('Taxi', 'taxi')}${sc('Takeoff', 'takeoff')}${sc('Handoff', 'handoff1')}${sc('Departure control', 'depCtl')}${sc('Handoff', 'contact')}${sc('Handoff to Center', 'toApp1')}
      <h3 style="margin:4px 0">DESTINATION 1 - ${esc(m.d1.id)}</h3><div class="fx" style="margin:0 0 6px">${esc(c.src.d1.tip)}</div>
      ${sc('Destination 1 weather (' + c.src.d1.label + ')', 'd1Wx')}${sc('Approach information', 'd1Info')}${sc('Approach clearance (' + m.d1.ac.replace(/\s+/g, ' ') + ')', 'd1Clr')}${sc('Alternate phrasing - cross fix', 'd1Cross')}${sc('Cancel IFR', 'd1Cancel')}${sc('Tower (or)', 'd1Tower')}
      </div><div>
      <h3 style="margin:4px 0">MISSED APPROACH</h3>
      ${sc('Missed approach - handoff', 'missed1')}${sc('Approach control', 'missed2')}${sc('Hold / expect further clearance', 'missed3')}${sc('Published missed approach (from the procedure)', 'missedPub', 'missed3')}
      <h3 style="margin:4px 0">CLEARANCE TO DESTINATION 2 - ${esc(m.d2.id)}</h3><div class="fx" style="margin:0 0 6px">${esc(c.src.d2.tip)}</div>
      ${sc('Clearance to 2nd destination', 'toD2')}${sc('Handoff', 'handoff2')}${sc('Handoff to Center', 'toApp2')}${sc('Destination 2 weather (' + c.src.d2.label + ')', 'd2Wx')}${sc('Destination 2 approach information', 'd2Info')}${sc('Destination 2 approach clearance (' + m.d2.ac.replace(/\s+/g, ' ') + ')', 'd2Clr')}${sc('Alternate phrasing - cross fix', 'd2Cross')}${sc('Cancel IFR', 'd2Cancel')}${sc('Contact tower', 'd2ContactTwr')}${sc('Destination 2 tower', 'd2Tower')}
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
      <div class="f chk"><input type="checkbox" id="legacy175" ${S.settings.legacy175 ? 'checked' : ''}><label for="legacy175">Show legacy DD 175 (the DD 1801 is the flight plan)</label></div>
      <div class="f chk"><input type="checkbox" id="compat" ${S.settings.compat ? 'checked' : ''}><label for="compat">Workbook-compatible mode (reproduce workbook quirks)</label></div>
      <p class="fx">Off (default): density altitude uses the correct formula, the ATIS "Landing and Departing RWY…" line is dropped when the approach is to the runway in use, and Destination 1's pressure altitude uses Destination 1's elevation. On: the original workbook formulas are reproduced exactly (misplaced-parenthesis density altitude, always adding the landing-RWY sentence for numeric runways, departure elevation for Dest 1).</p>
      <h3>Data on this device</h3><button class="btn danger sm" id="btnWipe">Erase saved missions &amp; settings</button></section>
    <section class="card"><h2>Weather entry tips</h2><ul class="fx" style="color:var(--ink);padding-left:18px;margin:0">
      <li>Airport IDs: all caps, 4-letter ICAO; if the ID has a number drop the K (02AZ, P08).</li><li>Visibility must be below 3 and have a reason (BR, RA, -RA …) for an IMC scenario.</li><li>Don't use altimeter settings that end in "0".</li><li>Ceiling altitude is in hundreds of feet (006 = 600 ft).</li><li>SID transition: pick from the NASR list or type it.</li><li>Select ATC / ASOS / ATIS source and clearance types from the drop-downs.</li></ul>
      <h3>WX codes</h3><table class="ref">${WXREF.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('')}</table></section>
    <section class="card wide"><h2>Official forms</h2>
      <table class="ref"><tr><td><b>DD Form 1801</b></td><td>DoD International Flight Plan - edition 1 May 1987 (primary flight plan)</td></tr>
      <tr><td><b>DD Form 1801-C</b></td><td>Continuation - edition 21 May 2019</td></tr>
      <tr><td><b>DD Form 175</b></td><td>Military Flight Plan - edition 1 May 1986 (legacy; hidden unless enabled below)</td></tr>
      <tr><td><b>DD Form 175-1</b></td><td>Flight Weather Briefing - edition 1 Oct 2002</td></tr></table>
      <p class="fx">The forms are the official DoD PDFs (esd.whs.mil/Directives/forms). Your data is typed into the form's own fields, so every box is where DoD put it; page size is Letter (the DD 175 is Letter landscape). Print at <b>100% / Actual size</b>. To make the PDFs fillable in a browser, the build removes the PDF's encryption (empty user password), its Adobe-only XFA layer and its screen-only Reset/Signature buttons - the printed page itself is untouched (verified by tests/form_fidelity.py). Not an official DoD product; verify the filed plan against current regulations.</p>
      <p class="fx"><b>Approach fixes, crossing altitudes and missed approaches</b> come from the FAA Coded Instrument Flight Procedures (CIFP, ARINC 424-18; not copyrighted). CIFP is provided "as is" with no warranty; under 10 U.S.C. 456 no civil action may be brought against the United States on the basis of the content of a navigational aid prepared or disseminated by the FAA. The FAA is not responsible for products derived from CIFP, and DoD-originated (NGA) procedures are not in it - those scripts keep a blank. Always use the published procedure; report suspected CIFP errors to the FAA (9-AMC-Aerochart@faa.gov, 800-638-8972).</p>
      <p class="fx"><b>Weather source:</b> AWOS/ASOS airports have no ATIS letter. Auto picks ATIS when the FAA data lists an ATIS frequency, otherwise AWOS/ASOS (type, phone and frequency from NASR); override per airport on the Plan or Scripts tab.</p></section>
    <section class="card wide"><h2>App version</h2>
      <div class="kv"><b>Version</b><span id="verTxt">v${esc(BUILD.version)}</span><b>Build</b><span id="verBuild">${esc(BUILD.commit)}${BUILD.built ? ' • ' + esc(BUILD.built) : ''}</span><b>Latest</b><span id="verLatest">checking…</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" id="btnUpd">Check for updates</button><button class="btn" id="btnHard">Force refresh app files</button></div>
      <p class="fx">New releases install themselves: the app reloads when it finds one (your inputs are saved first). If something looks out of date, tap "Force refresh app files" - it clears this app's cached files (not your missions) and reloads.</p></section>
    <section class="card wide"><h2>About</h2><p class="fx">IFR AMR Planner v${VERSION}. Replaces the Cheat Sheet → AMR / DD 1801 / DD 175-1 / Grade Sheet workflow of the Army instrument AMR Excel template. Works offline after the first load; add to the Home Screen from Safari's Share menu. Missions are saved only in this browser (localStorage) - use Missions → Export to back them up. Not covered in v1: DD 1801 / 1801-C, other states, ADS-B/winds-aloft/live weather.</p></section></div>`;
  }

  /* ---------- views ---------- */
  function renderView() {
    const t = S.tab;
    if (t === 'amr') $('#view-amr').innerHTML = viewAMR();
    else if (t === 'fp') { $('#view-fp').innerHTML = viewFP(); renderPdf(); }
    else if (t === '1751') { $('#view-1751').innerHTML = viewDD1751(); renderPdf(); }
    else if (t === 'scripts') $('#view-scripts').innerHTML = viewScripts();
    else if (t === 'info') { $('#view-info').innerHTML = viewInfo(); wireInfo(); }
  }
  function setTab(t) {
    S.tab = t; document.body.dataset.view = t;
    if (t === 'plan' && S.dirtyPlan) { S.dirtyPlan = false; $('#view-plan').innerHTML = planHTML(); afterPlan(); }
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    renderView(); window.scrollTo(0, 0);
  }
  function wireInfo() {
    const cs = $('#cycSel'); cs && cs.addEventListener('change', async () => { S.settings.cycle = cs.value; jset(LS.settings, S.settings); await reloadData(); toast('Using cycle ' + D.cycle.tpp); });
    const bu = $('#btnUpd'); bu && bu.addEventListener('click', async () => { $('#verLatest').textContent = 'checking…'; await checkVersion(true); });
    const bh = $('#btnHard'); bh && bh.addEventListener('click', hardRefresh);
    checkVersion(false);
    const lg = $('#legacy175'); lg && lg.addEventListener('change', () => { S.settings.legacy175 = lg.checked; jset(LS.settings, S.settings); toast(lg.checked ? 'DD 175 (legacy) shown on the DD 1801 tab' : 'DD 175 hidden'); });
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
    S.m = merge(M.defaultMission(), migrate(obj)); jset(LS.cur, S.m);
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
    const o = M.amr(S.m, env), d = M.dd1801(S.m, env), f = M.flight(S.m, env);
    return ['AIR MISSION REQUEST - ' + S.m.date, '', 'MISSION: ' + o.mission, '', 'SPECIAL INSTRUCTIONS: ' + o.special, '', "COMMANDER'S INTENT: " + o.intent, '',
      `AIRCRAFT: ${o.aircraft} ${o.design}  SER: ${o.serial}  GW: ${o.gw}  FUEL: ${o.fuel}`, `TAS: ${o.tas}  HOVER ${o.hover}  CLIMB ${o.climb}  CRUISE ${o.cruise}`, '',
      `DD 1801: ${S.m.dep.id} ETD ${M.hhmm(f.etd1)}Z ${d.level} -> ${S.m.d1.id} ETE ${M.hplusmm(f.ete1)}; ${S.m.d1.id} ETD ${M.hhmm(f.etd2)}Z -> ${S.m.d2.id} ETE ${M.hplusmm(f.ete2)}`,
      'Source: FAA cycle ' + D.cycle.tpp + ' - training/planning only, verify against current FAA publications.'].join('\n');
  }
  async function share() {
    const t = amrText();
    try { if (navigator.share) { await navigator.share({ title: 'AMR ' + (S.m.name || ''), text: t }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(t); toast('Copied AMR text'); } catch (e) { prompt('Copy:', t); }
  }

  const printNow = () => { if (S.tab === 'fp' || S.tab === '1751') pdfAction('print'); else window.print(); };
  /* ---------- global wiring ---------- */
  function wire() {
    document.addEventListener('input', onField); document.addEventListener('change', onField);
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#btnMissions').addEventListener('click', openMissions);
    $('#btnPrint').addEventListener('click', printNow);
    document.addEventListener('click', e => {
      const pa = e.target.closest('[data-pdf]'); if (pa) { pdfAction(pa.dataset.pdf); return; }
      const zb = e.target.closest('[data-zoom]'); if (zb) { PDF.zoom = zb.dataset.zoom === 'fit' ? 'fit' : +zb.dataset.zoom; renderPdf(); return; }
      const fb = e.target.closest('[data-fp]'); if (fb) { S.sub = fb.dataset.fp; renderView(); return; }
      const ch = e.target.closest('[data-chip]'); if (ch) {
        const path = ch.dataset.chip, list = $$(`[data-chip="${path}"]`).map(b => b.dataset.c), cur = new Set(getp(path) || []);
        cur.has(ch.dataset.c) ? cur.delete(ch.dataset.c) : cur.add(ch.dataset.c); setp(path, list.filter(c => cur.has(c))); ch.classList.toggle('on'); save(); schedPdf(); return;
      }
      const a = e.target.closest('[data-act]'); if (a) { if (a.dataset.act === 'print') printNow(); else if (a.dataset.act === 'share') share(); else if (a.dataset.act === 'goplan') setTab('plan'); }
      const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Copied'), () => { }); }
      if (e.target.id === 'btnGC') {
        const p = x => { const a = D.ap(x.id); return a && a.p; }, F1 = S.m.fp, pr = (a, b, f) => { if (p(a) && p(b)) { F1[f] = String(Math.round(M.nm(p(a), p(b)))); const el = $(`[data-b="fp.${f}"]`); el && (el.value = F1[f]); } };
        pr(S.m.dep, S.m.d1, 'v1'); pr(S.m.d1, S.m.d2, 'v2'); pr(S.m.d1, S.m.d2, 'v3'); save(); toast('Distances filled (direct); add procedure miles');
      }
    });
    wireModal();
    window.addEventListener('beforeprint', () => { if (S.tab === 'plan') { /* print the plan as-is */ } });
  }

  /* ---------- updates: a new release must always replace the cached one ---------- */
  let latest = null;
  async function checkVersion(manual) {
    const out = $('#verLatest');
    if (BUILD.commit === 'dev') { if (out) out.textContent = 'development build (no release info)'; return false; }
    try {
      const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json(); latest = j;
      const newer = BUILD.commit !== 'dev' && j.commit !== BUILD.commit;
      if (out) out.textContent = `v${j.version} • ${j.commit}${newer ? ' - NEW (this device has ' + BUILD.commit + ')' : ' - this is the latest'}`;
      if (newer) { $('#updTxt').textContent = `Update available: v${j.version}`; $('#updBar').hidden = false; navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(r => r && r.update()); }
      else if (manual) toast('You have the latest version');
      return newer;
    } catch (e) { if (out) out.textContent = 'offline - could not check'; return false; }
  }
  async function hardRefresh() {       // last resort: drop this app's service worker + cached files (missions live in localStorage and are kept)
    try { jset(LS.cur, S.m); const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); for (const k of await caches.keys()) if (k.startsWith('amr-planner-')) await caches.delete(k); } catch (e) { /* ignore */ }
    location.reload();
  }
  async function applyUpdate() {
    jset(LS.cur, S.m); $('#updTxt').textContent = 'Updating…';
    try {
      const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update();
      await new Promise(r => setTimeout(r, 4000));         // the new worker reloads this page itself when it takes over
    } catch (e) { /* fall through */ }
    hardRefresh();
  }
  function watchUpdates() {
    $('#updBtn').addEventListener('click', applyUpdate);
    if ('serviceWorker' in navigator) {
      const had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {            // a new release took over: reload once (state is saved first)
        const last = +sessionStorage.getItem('amr.rl') || 0;
        if (!had || Date.now() - last < 15000) return;
        sessionStorage.setItem('amr.rl', String(Date.now())); jset(LS.cur, S.m); location.reload();
      });
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(false); });
    setInterval(() => checkVersion(false), 30 * 60 * 1000);
    checkVersion(false);
  }

  /* ---------- boot ---------- */
  async function boot() {
    S.settings = Object.assign(S.settings, jget(LS.settings, {}));
    await D.init(S.settings.cycle);
    await D.loadState(S.settings.state);
    S.m = merge(M.defaultMission(), migrate(jget(LS.cur, null)));
    badge();
    $('#view-plan').innerHTML = planHTML(); afterPlan(); wire();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
    }
    watchUpdates();
    window.__amr = { S, M, D, env, setTab, renderView, PDF, buildPdf, renderPdf };       // handy for tests
    document.body.dataset.ready = '1';
  }
  boot().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#b00;padding:12px">Failed to start: ${esc(e.message)}</pre>`); console.error(e); });
})();
