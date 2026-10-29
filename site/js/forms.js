/* Fills the OFFICIAL DoD PDFs (site/forms/*.pdf, prepared by forms/prepare_forms.py) with pdf-lib.
 * Nothing on the page is redrawn: values go into the form's own AcroForm fields, so every box is exactly where DoD put it.
 *   ops = [{n: <qualified field name>, v: 'text' | true, fs?: font size, c?: 'center'|'left', ml?: multiline}]
 */
(function (root) {
  'use strict';
  const M = root.AMRModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const s = M.s, num = M.num;
  const AF = {};
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const mkIndex = widgets => {
    const byTU = {}, list = widgets;
    list.forEach(w => { const k = norm(w.tu); (byTU[k] = byTU[k] || []).push(w); });
    const find = (tu, nth) => { const a = byTU[norm(tu)]; if (!a || !a[nth || 0]) throw new Error('form field not found: ' + tu + ' #' + (nth || 0)); return a[nth || 0]; };
    const comb = (prefix, from, to) => {                       // "<prefix>, character N" boxes in order
      const re = new RegExp('^' + norm(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ', character (\\d+)$');
      let a = list.map(w => { const m = re.exec(norm(w.tu)); return m ? { n: +m[1], w } : null; }).filter(Boolean);
      if (from != null) a = a.filter(x => x.w.r[1] <= from.top && x.w.r[1] > from.bottom);
      return a.sort((x, y) => x.n - y.n).map(x => x.w);
    };
    const suffix = sfx => { const a = list.filter(w => w.n.endsWith(sfx)); if (a.length !== 1) throw new Error('form field not unique: ' + sfx + ' (' + a.length + ')'); return a[0]; };
    return { find, comb, suffix, list };
  };
  AF.index = mkIndex;
  const up = t => s(t).toUpperCase();

  // ---------------- DD 1801 (one block of boxes, restricted to a y-band for the 3-up 1801-C) ----------------
  function ops1801block(ix, d, band, lines18, o) {
    const ops = []; const C = (p, text, upper) => { const ch = (upper === false ? s(text) : up(text)).split(''); const bx = ix.comb(p, band); bx.forEach((w, i) => { if (ch[i] && ch[i] !== ' ') ops.push({ n: w.n, v: ch[i], c: 'center' }); }); };
    const inBand = (tu, nth) => { const a = ix.list.filter(w => norm(w.tu) === norm(tu) && (!band || (w.r[1] <= band.top && w.r[1] > band.bottom))); return a[nth || 0]; };
    const T = (tu, v, extra) => { const w = inBand(tu, extra && extra.nth); if (w && s(v) !== '') ops.push(Object.assign({ n: w.n, v: s(v), c: 'center' }, extra || {})); };
    if (o.header) {
      d.addressees.slice(0, 3).forEach((a, i) => { const w = ix.find('ADDRESSEE(S), line ' + (i + 1)); if (s(a).trim()) ops.push({ n: w.n, v: up(a), c: 'left' }); });
      C('FILING TIME', d.filing); C('ORIGINATOR', d.originator);
    } else { const w = inBand('ADDRESSEE(S), line 1'); if (w && s(d.addressees[0]).trim()) ops.push({ n: w.n, v: up(d.addressees[0]), c: 'left' }); }
    C('7. AIRCRAFT IDENTIFICATION', d.acid);
    T('8. FLIGHT RULES', up(d.rules)); T('TYPE OF FLIGHT', up(d.type));
    if (o.header) { C('9. NUMBER', d.number); C('TYPE OF AIRCRAFT', d.acType); T('WAKE TURBULENCE CAT.', d.wake); T('10. EQUIPMENT, first part', d.nav, { c: 'left' }); T('10. EQUIPMENT, second part', d.surv, { c: 'left' }); }
    C('13. DEPARTURE AERODROME', d.dep); C('TIME', d.eobt);
    C('15. CRUISING SPEED', d.speed); C('LEVEL', d.level);
    // route: up to N lines of the ROUTE boxes
    const rl = ix.list.filter(w => /^ROUTE, line \d+$/.test(norm(w.tu)) && (!band || (w.r[1] <= band.top && w.r[1] > band.bottom))).sort((a, b) => +/\d+$/.exec(norm(a.tu))[0] - +/\d+$/.exec(norm(b.tu))[0]);
    const rtxt = M.wrap110(up(d.route), 105); rl.forEach((w, i) => { if (rtxt[i]) ops.push({ n: w.n, v: rtxt[i], c: 'left' }); });
    C('16. DESTINATION AERODROME', d.dest); C('TOTAL EET, HR/MIN', d.eet); C('ALTN AERODROME', d.altn); C('2ND ALTN AERODROME', d.altn2);
    lines18.forEach((t, i) => { const w = o.line18 ? inBand(o.line18[i]) : inBand('18. OTHER INFORMATION, line ' + (i + 1)); if (w && s(t) !== '') ops.push({ n: w.n, v: up(t), c: 'left' }); });
    if (o.header) {
      ops.push({ n: ix.find('FUEL/').n, v: d.fuel, c: 'left' }); ops.push({ n: ix.find('POB/').n, v: d.pob, c: 'left' });
      if (s(d.rdo)) ops.push({ n: ix.find('RDO/').n, v: d.rdo, c: 'left' });
      ops.push({ n: ix.find('REMARKS').n, v: d.remarks, c: 'left', ml: true });
      ops.push({ n: ix.find('AIRCRAFT SERIAL NUMBERS AND TYPE OF AIRCRAFT IN FLIGHT').n, v: d.serial, c: 'left', ml: true });
      if (s(d.pic)) ops.push({ n: ix.find('NAME OF PILOT IN COMMAND').n, v: d.pic, c: 'left' });
      if (s(d.home)) ops.push({ n: ix.find('AIRCRAFT HOME STATION OR ORGANIZATION').n, v: d.home, c: 'left', ml: true });
      const cbs = ix.list.filter(w => w.t === 'cb'); // crew list (upper) then passenger manifest (lower); each row: ATTACHED, LOCATED AT:
      const rows = [ix.list.filter(w => norm(w.tu) === 'Enter location')];
      const loc = rows[0].sort((a, b) => b.r[1] - a.r[1]);
      const located = cbs.filter(w => norm(w.tu) === 'LOCATED AT:').sort((a, b) => b.r[1] - a.r[1]);
      [d.crewLoc, d.paxLoc].forEach((on, i) => { if (on && located[i]) { ops.push({ n: located[i].n, v: true }); ops.push({ n: loc[i].n, v: up(d.locAt), c: 'left' }); } });
    } else {
      const fu = ix.list.filter(w => /^19\. SUPPLEMENTARY INFORMATION - FUEL, character \d+$/.test(norm(w.tu)) && (!band || (w.r[1] <= band.top && w.r[1] > band.bottom))).sort((a, b) => a.r[0] - b.r[0]);
      s(d.fuel).split('').forEach((c, i) => { if (fu[i]) ops.push({ n: fu[i].n, v: c, c: 'center' }); });
      const pb = inBand('19. SUPPLEMENTARY INFORMATION - POB'); if (pb) ops.push({ n: pb.n, v: s(d.pob), c: 'left' });
    }
    return ops;
  }
  AF.ops1801 = (widgets, d) => ops1801block(mkIndex(widgets), d, null, d.other, { header: true });
  AF.ops1801C = (widgets, dc) => {
    const ix = mkIndex(widgets);
    const tops = ix.list.filter(w => norm(w.tu) === 'ADDRESSEE(S), line 1').map(w => w.r[3]).sort((a, b) => b - a);   // block tops (3 blocks)
    const ops = [];
    dc.blocks.forEach((b, i) => {
      if (i >= tops.length) return;
      const band = { top: tops[i] + 12, bottom: i + 1 < tops.length ? tops[i + 1] + 12 : -1 };
      const l18 = b.other.length ? [b.otherAll[0] || '', b.other[b.other.length - 1] || ''] : ['', ''];
      const l1 = (b.otherAll.slice(0, 1)[0]) || '';
      ops1801block(ix, b, band, [l1, b.other.length > 1 ? b.other[b.other.length - 1] : ''], { header: false, line18: ['18. OTHER INFORMATION, line 1', '18. OTHER INFORMATION, line 8'] }).forEach(x => ops.push(x));
    });
    return ops;
  };

  // ---------------- DD 175-1 ----------------
  const mmm = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fmtDate = iso => { const [y, m, d] = String(iso).split('-'); return d + '-' + mmm[+m - 1] + '-' + String(y).slice(2); };
  AF.fmtDate = fmtDate;
  const tokens = t => up(t).split(/[^A-Z]+/).filter(Boolean);
  AF.ops1751 = (widgets, m, o, sun) => {
    const ix = mkIndex(widgets), F = m.f1751, ops = [];
    const T = (tu, v, nth, extra) => { if (s(v) !== '') ops.push(Object.assign({ n: ix.find(tu, nth).n, v: s(v), c: 'center' }, extra || {})); };
    const CB = (sfx, on) => { if (on) ops.push({ n: ix.suffix(sfx).n, v: true }); };
    const day = s(m.date).slice(8, 10);
    T('1. DATE', fmtDate(o.date)); T('2. ACFT TYPE/NO.', o.acft); T('3. DEP PT/ETD - Z', o.dep);
    T('4. RWY TEMPERATURE - FAHRENHEIT/CELSIUS', s(o.rwyTemp)); T('5. DEWPOINT - FAHRENHEIT/CELSIUS', s(o.dew)); T('6. TEMP DEV', o.tempDev);
    T('7. PRES ALT - FT', s(o.pa)); T('8. DENSITY ALT - FT', s(o.da));
    T('M', s(o.sfcWind).replace(/\s+/g, ''), 0);                       // 9. SFC WIND: the official M box is only 14 pt wide, so the text is shrunk to fit (about 5 pt)
    T('10. CLIMB WINDS', o.climbWinds + (F.climbLayer ? '   ' + F.climbLayer : ''));
    T('11. LOCAL WEATHER WATCH/WARNING/ADVISORY', F.watch); T('12. RSC/RCR', 'N/A');
    T('13. REMARKS/TAAKEOFF ALTN FCST', o.remarks13, 0, { c: 'left' });
    T('14. FLT LEVEL/WINDS/TEMP', o.flWinds, 0, { c: 'left' }); if (/^(YES|X)$/i.test(s(F.attach))) CB('#subform[7].CheckBox1[0]', true);
    T('15. SPACE WEATHER', 'NA', 0, { c: 'left' });
    const sp = tokens(F.space)[0] === 'MARGINAL' ? 'b' : tokens(F.space)[0] === 'SEVERE' ? 'c' : 'a';
    ['freq', 'gps', 'rad'].forEach(k => CB('fifteen[0].' + k + '[0].' + sp + '[0]', true));
    const sv = (k, d) => s(F[k]) || (sun && sun[d]) || '';
    const sd = x => { const t = s(x).replace(/Z$/i, ''); return t ? day + '/' + t : ''; };
    T('BMNT - Z', sd(sv('bmnt', 'bmnt'))); T('SR - Z', sd(sv('sr', 'sr'))); T('SS - Z', sd(sv('ss', 'ss'))); T('EENT - Z', sd(sv('eent', 'eent')));
    const cf = up(F.cloudsFL); CB('seventeen[0].a[0]', cf === 'YES'); CB('seventeen[0].b[0]', cf === 'NO'); CB('seventeen[0].c[0]', /IN AND OUT/.test(cf));
    const ob = up(F.obsc); CB('eighten[0].b[0]', ob === 'YES'); CB('eighten[0].a[0]', ob === 'NO'); T('18. OBSCURATIONS AT FLT LEVEL RESTRICTING VISIBILITY - TYPE', F.obscType, 0, { c: 'left' });
    T('FT AGL', o.minCeil, 0, { c: 'left' }); T('FT MSL', F.cloudTops, 0, { c: 'left' }); T('FT MSL', F.frz, 1, { c: 'left' });
    // thunderstorms
    const ts = up(F.tstm); CB('twenty2[0].nal[0].a[0]', /NONE/.test(ts)); CB('twenty2[0].nal[0].b[0]', /AREA/.test(ts)); CB('twenty2[0].nal[0].c[0]', /LINE/.test(ts));
    // turbulence (LIGHT/MODERATE/SEVERE/EXTREME x IN CLEAR / IN CLOUD)
    const tb = up(F.turb), tw = /CLOUD/.test(up(F.turbWhere)) ? 'cloud' : 'clear';
    if (/NONE/.test(tb)) CB('twenty3[0].CheckBox1[0]', true);
    else { const k = /LIGHT/.test(tb) ? 'd' : /MOD/.test(tb) ? 'a' : /SEV/.test(tb) ? 'b' : /EXT/.test(tb) ? 'c' : ''; if (k) CB('twenty3[0].' + tw + '[0].' + k + '[0]', true); }
    ops.push({ n: ix.suffix('twenty3[0].TextField2[1]').n, v: s(F.turbLevels) || '050-100', c: 'left' }); ops.push({ n: ix.suffix('twenty3[0].TextField2[2]').n, v: 'ENR', c: 'left' });
    // icing (TRACE/LIGHT/MODERATE/SEVERE x RIME/MIXED/CLEAR)
    const ic = up(F.icing);
    if (/NONE/.test(ic)) CB('twenty4[0].CheckBox1[0]', true);
    else { const lv = /TRACE/.test(ic) ? 'd' : /LIGHT/.test(ic) ? 'a' : /MOD/.test(ic) ? 'b' : /SEV/.test(ic) ? 'c' : '', ty = /MIXED/.test(ic) ? 'mixed' : /CLEAR/.test(ic) ? 'clear' : 'rime'; if (lv) CB('twenty4[0].' + ty + '[0].' + lv + '[0]', true); }
    ops.push({ n: ix.suffix('twenty4[0].TextField2[1]').n, v: s(F.icingLevels) || '100-110', c: 'left' }); ops.push({ n: ix.suffix('twenty4[0].TextField2[2]').n, v: 'ENR', c: 'left' });
    // precipitation
    const pr = up(F.precip);
    if (/NONE/.test(pr)) CB('twenty5[0].CheckBox1[0]', true);
    else {
      const ty = /DRIZZLE/.test(pr) ? 'drizzle' : /RAIN/.test(pr) ? 'rain' : /SNOW/.test(pr) ? 'snow' : /PELLET/.test(pr) ? 'pellet' : '';
      const lv = /FREEZING/.test(pr) ? (ty === 'drizzle' ? 'c' : 'e') : /SHOWER/.test(pr) ? 'c' : /LIGHT/.test(pr) ? 'd' : /MOD/.test(pr) ? 'a' : /HEAVY/.test(pr) ? 'b' : '';
      if (ty && lv) CB('twenty5[0].' + ty + '[0].' + lv + '[0]', true);
    }
    ops.push({ n: ix.suffix('twenty5[0].TextField2[1]').n, v: 'ENR / ALL LOCATIONS', c: 'left', ml: true });
    // part III - aerodrome forecasts (8 rows on the form)
    o.part3.slice(0, 8).forEach((r, i) => {
      const L = i + 1;
      T('26. DEST/ALTN, line ' + L, r.id, 0, { c: 'left' }); T('27. VALID TIME - Z TO', s(r.from).replace(/Z$/, ''), i); T('27. VALID TIME - Z', s(r.to).replace(/Z$/, ''), i);
      T('28. SFC WIND - M', r.wind, i); T('29. VSBY/WEA', r.vis, i, { ml: true }); T('30. CLOUD LAYERS', r.cloud, i, { ml: true, c: 'left' });
      T('31. ALTIMETER - INS', r.altim, i); T('RWY TEMPERATURE - FAHRENHEIT/CELSIUS', r.temp, i); T('PRES ALT - FT', s(r.pa), i);
    });
    // part IV / V
    const rs = up(F.rscBriefed); if (/^YES/.test(rs)) CB('yna[0].a[0]', true); else if (/NOT/.test(rs)) CB('yna[0].b[0]', true);
    T('33. PMSV', F.pmsv); if (/^(YES|X)$/i.test(s(F.attach))) CB('yn[0].a[0]', true); else if (/^NO$/i.test(s(F.attach))) CB('yn[0].b[0]', true);
    T('35. REMARKS', F.notams, 0, { c: 'left', ml: true });
    T('- Z', o.briefTime); T('37. FLIMSY BRIEFING NO.', F.flimsy); T("38. BRIEFER'S INITIALS", F.init); T('39. NAME OF PERSON RECEIVING BRIEFING', F.recvName);
    T('40. VOID TIME - Z', o.wxVoid);
    return ops;
  };

  // ---------------- DD 175 (legacy flight plan) ----------------
  AF.ops175 = (widgets, m, d) => {
    const ix = mkIndex(widgets), ops = []; const T = (tu, v, nth, ex) => { if (s(v) !== '') ops.push(Object.assign({ n: ix.find(tu, nth).n, v: s(v), c: 'center' }, ex || {})); };
    T('DATE', fmtDate(d.date)); T('AIRCRAFT CALL SIGN', d.callsign); T('AIRCRAFT DESG AND TD CODE', d.design);
    const row = (i, L, routeText, to, ete) => {
      T('TYPE OF FLIGHT PLAN', L.rules, i); T('TRUE AIRSPEED', L.tas, i); T('POINT OF DEPARTURE', L.dep, i); T('PROPOSED DEPARTURE TIME (Z)', L.etd, i); T('ALTITUDE', L.alt, i);
      T('ROUTE OF FLIGHT', routeText, i, { c: 'left' }); T('TO', to, i); T('E.T.E.', ete, i);
    };
    row(0, d.leg1, d.leg1.route, d.leg1.to, d.leg1.ete);
    T('ROUTE OF FLIGHT', d.mid.k + '          ' + d.mid.l, 1, { c: 'left' });
    row(2, d.leg2, d.leg2.route, d.leg2.to, d.leg2.ete);
    const fl = i => s(d.fuelTxt[i]).replace(new RegExp('\\s+' + d.unit + ','), ': ' + d.fuel[i] + ' ' + d.unit + ',').replace('.:', ':');      // the workbook prints the fuel statements in the remarks area
    T('REMARKS', [m.d2.id + ' -S, R', fl(0) + '    ' + fl(1), fl(2)].join('\n'), 0, { c: 'left', ml: true }); T('REMARKS continued', d.leg2.remarks, 0, { c: 'left' });
    T('FUEL ON BD', d.fob); T('ALTERNATE AIRFIELD', d.alt); T('E.T.E. TO ALTERNATE', d.eteAlt); T('WEATHER', d.weather); T('WT AND BALANCE', d.wb, 0, { c: 'left' });
    T('AIRCRAFT SERIAL NUMBER, UNIT, AND HOME STATION', d.serialUnit, 0, { c: 'left' });
    ops.push({ n: ix.suffix('#subform[3].CheckBox1[0]').n, v: true });
    d.people.slice(0, 4).forEach((p, i) => {
      if (i > 0) T('DUTY, line ' + (i + 1), p.duty, 0, { c: 'left' });
      T('NAME', p.name, i, { c: 'left' }); T('RANK', p.rank, i); T('ORGANIZATION AND LOCATION', p.org, i, { c: 'left' });
    });
    return ops;
  };

  // ---------------- fill engine (pdf-lib) ----------------
  // PL = PDFLib namespace, bytes = blank PDF, ops from above; opt.flatten bakes the values into the page
  AF.fill = async function (PL, bytes, ops, opt) {
    opt = opt || {};
    const doc = await PL.PDFDocument.load(bytes, { updateMetadata: false }), form = doc.getForm();
    const font = await doc.embedFont(PL.StandardFonts.TimesRoman);
    const seen = {};
    const page = doc.getPage(0), later = [];
    ops.forEach(op => {
      if (op.rect) { later.push(op); return; }
      if (seen[op.n]) return; seen[op.n] = 1;
      if (op.v === true) { form.getCheckBox(op.n).check(); return; }
      const f = form.getTextField(op.n), w = f.acroField.getWidgets()[0].getRectangle(), txt = String(op.v);
      let size = op.fs || 8;
      if (op.ml) {
        f.enableMultiline();
        const lines = [], maxW = w.width - 3;
        txt.split('\n').forEach(par => { let cur = ''; par.split(/\s+/).forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (cur && font.widthOfTextAtSize(t, size) > maxW) { lines.push(cur); cur = wd; } else cur = t; }); lines.push(cur); });
        while (size > 5 && lines.length * size * 1.16 > w.height - 1) { size -= 0.5; }
        f.setText(lines.join('\n'));
      } else {
        const maxW = w.width - 2.5; while (size > 4.5 && font.widthOfTextAtSize(txt, size) > maxW) size -= 0.25;
        f.setText(txt);
      }
      f.acroField.setDefaultAppearance('/TiRo ' + size + ' Tf 0 g');
      f.setAlignment(op.c === 'left' ? PL.TextAlignment.Left : PL.TextAlignment.Center);
    });
    form.updateFieldAppearances(font);
    if (opt.flatten) form.flatten();
    later.forEach(op => {                       // text drawn straight onto the page (no field there)
      const [x0, y0, x1, y1] = op.rect, t = String(op.v); if (!t) return; let sz = 8; while (sz > 5 && font.widthOfTextAtSize(t, sz) > x1 - x0 - 1) sz -= 0.25;
      page.drawText(t, { x: op.c === 'left' ? x0 + 1 : x0 + (x1 - x0 - font.widthOfTextAtSize(t, sz)) / 2, y: y0 + (y1 - y0 - sz * 0.68) / 2, size: sz, font });
    });
    return doc.save({ updateFieldAppearances: false });
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AF; else root.AMRForms = AF;
})(typeof window !== 'undefined' ? window : globalThis);
