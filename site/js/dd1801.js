/* DD Form 1801 (DoD International Flight Plan) and 1801-C (continuation) data, mapped exactly like the workbook's
 * 'DD 1801' / 'DD 1801-C' sheets.  Pure data - no DOM, no PDF.  forms.js puts these values into the official PDF fields. */
(function (root) {
  'use strict';
  const M = root.AMRModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const s = M.s, num = M.num, pad = (n, w) => String(Math.trunc(n)).padStart(w, '0');
  const WAKE = { B06: 'L', EC45: 'L', H60: 'M', H64: 'M', H47: 'M' };            // ICAO wake category by type
  M.WAKE = WAKE;
  const is4 = id => /^[A-Z]{4}$/.test(id);
  // ICAO location indicator for items 13/16: anything that is not 4 letters (e.g. 02AZ, P08) is ZZZZ + DEP/ DEST/ ALTN/ RALT in item 18
  M.icao = function (id, env) {
    id = s(id).trim().toUpperCase(); if (!id) return { code: '', extra: '' };
    if (is4(id)) return { code: id, extra: '' };
    const a = env && env.ap ? env.ap(id) : null; let pos = '';
    if (a && a.p) { const f = (v, dd) => { const x = Math.abs(v), d = Math.floor(x), mi = Math.round((x - d) * 60); const dm = mi === 60 ? [d + 1, 0] : [d, mi]; return pad(dm[0], dd) + pad(dm[1], 2); };
      pos = ' ' + f(a.p[0], 2) + (a.p[0] >= 0 ? 'N' : 'S') + f(a.p[1], 3) + (a.p[1] >= 0 ? 'E' : 'W'); }
    return { code: 'ZZZZ', extra: id + pos };
  };
  const hm = min => { min = Math.floor(min + 1e-6); return pad(min / 60, 2) + pad(min % 60, 2); };      // minutes -> HHMM
  const wrap110 = (text, n) => {                                 // word-wrap item 18 at <=110 characters per line
    const out = []; let cur = '';
    s(text).split(/\s+/).filter(Boolean).forEach(w => { if ((cur ? cur.length + 1 : 0) + w.length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) out.push(cur); return out;
  };
  M.wrap110 = wrap110;
  const YYMMDD = iso => s(iso).replace(/-/g, '').slice(2, 8);
  const lvl = h => { const n = num(h); return (n >= 180 ? 'F' : 'A') + pad(n, 3); };

  // one flight-plan block: leg = {dep, dest, altn, altn2 (ids), etdMin, eteMin, alt, route, fuelMin(endurance), eteAltMin}
  function block(m, env, o) {
    const F = m.f175, G = m.f1801, ser = M.serNum(m, env), ac = env.acft(m.acft) || {};
    const dep = M.icao(o.dep, env), dest = M.icao(o.dest, env), alt1 = M.icao(o.altn, env), alt2 = M.icao(o.altn2, env);
    const digits = s(ser).replace(/[^0-9A-Za-z]/g, '').slice(1);                      // R-78724 -> 78724
    const acid = 'R' + (digits.length ? digits.slice(-5).padStart(5, '0') : '') + '0';  // workbook: R + MID(SER,3..7) + (MID(SER,8)="" -> 0)
    const tas = Math.round(num(F.tas));
    const cs = s(F.rules) || 'I';
    const other = [];
    const I = G.i18, add = (k, v) => { v = s(v).trim(); if (v) other.push(k + '/' + v); };
    add('STS', I.sts);
    if (G.nav.includes('R') && G.pbn.length) other.push('PBN/' + G.pbn.join(''));
    add('NAV', I.nav); add('COM', I.com); add('DAT', I.dat); add('SUR', I.sur);
    if (dep.extra) other.push('DEP/' + dep.extra);
    if (dest.extra) other.push('DEST/' + dest.extra);
    other.push('DOF/' + YYMMDD(m.date));
    ['reg', 'eet', 'sel', 'typ', 'code', 'dle', 'rvr', 'opr', 'orgn', 'per'].forEach(k => add(k.toUpperCase(), I[k]));
    if (alt1.extra) other.push('ALTN/' + alt1.extra); else add('ALTN', I.altn);
    if (alt2.extra) other.push('RALT/' + alt2.extra); else add('RALT', I.ralt);
    add('TALT', I.talt); add('RIF', I.rif); add('RMK', I.rmk);
    let lines = wrap110(other.join(' '), 110);
    const eteAlt = o.eteAltMin;
    const altLine = (o.noAlt || eteAlt == null) ? '' : 'ETE TO ALTERNATE = ' + Math.floor(Math.floor(eteAlt + 1e-6) / 60) + ' + ' + (Math.floor(eteAlt + 1e-6) % 60);
    const maxLines = o.maxLines || 8;
    const body = lines.slice(0, altLine ? maxLines - 1 : maxLines);
    while (altLine && body.length < maxLines - 1) body.push('');
    if (altLine) body.push(altLine);
    const warn = [];
    if (lines.length > (altLine ? maxLines - 1 : maxLines)) warn.push('Item 18 is longer than the form allows - shorten the entries.');
    const route = (!s(o.route).trim() || /^direct$/i.test(s(o.route).trim())) ? 'DCT' : s(o.route).trim().replace(/^DIRECT\s+/i, 'DCT ');
    const ac4 = s(ac.mil);
    const pc = (m.amr.crew[0] && m.amr.crew[0].name) || '';
    const named = m.amr.crew.filter(c => s(c.name).trim()).length + ((m.amr.pax && s(m.amr.pax.name).trim() && !/^none$/i.test(s(m.amr.pax.name).trim())) ? 1 : 0);
    const nameHome = s(m.amr.unit);
    return {
      priority: s(G.priority) || 'FF', addressees: G.addr.map(s), originator: s(G.origin).trim().toUpperCase() || (dep.code + 'YXYX'),
      msgType: 'FPL', acid, rules: s(G.rules) || cs, type: s(G.type) || 'M', number: s(G.number), acType: ac4, wake: s(G.wake) || WAKE[ac4] || 'M',
      nav: G.nav.length ? G.nav.join('') : 'N', surv: G.surv.length ? G.surv.join('') : 'N',
      dep: dep.code, eobt: hm(o.etdMin % 1440), speed: 'N' + pad(tas, 4), level: lvl(o.alt), route, dest: dest.code, eet: hm(o.eteMin),
      altn: o.noAlt ? '' : alt1.code, altn2: alt2.code, other: body, otherAll: lines, fuel: s(o.fuelHHMM),
      pob: s(G.pob).trim() || (named > 0 ? String(named) : '3'), rdo: s(G.rdo),
      remarks: ['Wx briefed by (' + s(m.f1751.init) + ')', s(m.d2.id) + ' -S, R'].concat(s(G.rmkExtra).trim() ? [s(G.rmkExtra).trim()] : []).join('\n'),
      serial: s(ser) + ' / ' + s(m.acft), crewLoc: !!G.crewLoc, paxLoc: !!G.paxLoc, locAt: s(m.dep.id), pic: pc, home: nameHome,
      warnings: warn
    };
  }
  M.dd1801 = function (m, env) {
    const F = m.f175, dd = M.dd175(m, env), tas = num(F.tas);
    const d1 = num(F.v1) + num(F.x1), d3 = num(F.v3) + num(F.x3);
    // workbook 'DD 1801'!AN11:  ((dist + extra) / ACFT_SPEED) * 60 + time  (planning TAS, not altitude-adjusted)
    const ete1 = tas ? d1 / tas * 60 + num(F.w1) : 0, eteAlt = tas ? d3 / tas * 60 + num(F.w3) : 0;
    const filing = s(m.f1801.filing).replace(/\D/g, '');
    const etd = dd.etd1; let fil = etd - 120, day = +s(m.date).slice(8, 10) || 1;
    if (fil < 0) { fil += 1440; day = day > 1 ? day - 1 : 28; }
    const b = block(m, env, { dep: m.dep.id, dest: m.d1.id, altn: m.d2.id, altn2: m.alt2 && m.alt2.id, etdMin: etd, eteMin: ete1, alt: F.alt1, route: F.route1, noAlt: !!m.noAlt, eteAltMin: eteAlt,
                              fuelHHMM: hm(M.parseHHMM(s(F.fob).replace('+', ''))) });
    b.filing = filing.length === 6 ? filing : pad(day, 2) + hm(fil);
    b.eteMin = ete1; b.eteAltMin = eteAlt;
    return b;
  };
  // 1801-C: block 1 = leg 2 (Dest 1 -> Dest 2); block 2 = Dest 2 -> 2nd alternate (only if one is given); block 3 left blank (workbook: unfinished scratch)
  M.dd1801C = function (m, env) {
    const F = m.f175, dd = M.dd175(m, env), tas = num(F.tas), d2 = num(F.v2) + num(F.x2);
    const ete2 = tas ? d2 / tas * 60 + num(F.w2) : 0;
    const first = M.dd1801(m, env);
    const endur = M.parseHHMM(s(F.fob).replace('+', ''));                          // 3+00 -> 180 min
    const b1 = block(m, env, { dep: m.d1.id, dest: m.d2.id, altn: '', altn2: '', etdMin: dd.etd2, eteMin: ete2, alt: F.alt2, route: s(F.termRoute) || F.route2, noAlt: true, maxLines: 2,
                               fuelHHMM: hm(Math.max(0, endur - Math.floor(first.eteMin + 1e-6))) });      // workbook AL5/AM5: endurance left after leg 1
    b1.eteMin = ete2; b1.filing = first.filing;
    const blocks = [b1];
    if (m.alt2 && s(m.alt2.id).trim()) {
      const t = M.parseHHMM('0+' + s(m.alt2.time).replace(/\D/g, '')) ;
      const b2 = block(m, env, { dep: m.d2.id, dest: m.alt2.id, altn: '', altn2: '', etdMin: dd.etd2 + Math.floor(ete2 + 1e-6) + 30, eteMin: 0, alt: F.alt2, route: '', noAlt: true, maxLines: 2,
                                 fuelHHMM: hm(Math.max(0, endur - Math.floor(first.eteMin + 1e-6) - Math.floor(ete2 + 1e-6))) });
      const mm = /(\d+)\D+(\d+)/.exec(s(m.alt2.time)); b2.eet = mm ? pad(+mm[1], 2) + pad(+mm[2], 2) : '';
      blocks.push(b2);
    }
    return { blocks, warnings: [] };
  };
  // validation tips shown under the DD 1801 inputs
  M.check1801 = function (m, env) {
    const d = M.dd1801(m, env), G = m.f1801, out = [];
    if (G.nav.includes('G') && !s(G.i18.nav).trim()) out.push({ level: 'tip', msg: 'Item 10 "G" (GNSS): the form note asks for the GNSS augmentation in item 18 NAV/ (e.g. NAV/GPS).' });
    if (G.nav.includes('R') && !G.pbn.length) out.push({ level: 'warn', msg: 'Item 10 "R" (PBN approved) needs at least one PBN/ code in item 18.' });
    if (G.nav.includes('N') && G.nav.length > 1) out.push({ level: 'warn', msg: 'Item 10: "N" (no equipment) cannot be combined with other codes.' });
    if (G.nav.join('').length > 20) out.push({ level: 'warn', msg: 'Item 10 equipment is longer than 20 characters.' });
    if (G.pbn.length > 8) out.push({ level: 'warn', msg: 'PBN/ allows at most 8 codes.' });
    if (!s(m.f1751.init).trim()) out.push({ level: 'tip', msg: 'Remarks: "Wx briefed by ( )" - add the forecaster\'s initials on the 175-1 inputs.' });
    d.warnings.forEach(w => out.push({ level: 'warn', msg: w }));
    return out;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
