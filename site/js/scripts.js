/* Scripts page text (Calls sheet + Grade Sheet) - every blank that the plan, the AMR inputs or the FAA data can fill is filled.
 * Markers inside the generated strings (plain text is recovered with M.plain):
 *    \u27E6 value \u27E7   a value filled from the plan / FAA data
 *    \u27EA label \u27EB   a blank that nothing in the plan or the FAA data can fill (ATC assigns it live)
 * Also: weather-source detection (ATIS vs ASOS/AWOS one-minute weather) and facility lookups.
 */
(function (root) {
  'use strict';
  const M = root.AMRModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const s = M.s;
  const FV = '\u27E6', FE = '\u27E7', BL = '\u27EA', BE = '\u27EB';
  M.FV = FV; M.FE = FE; M.BL = BL; M.BE = BE;
  M.plain = t => String(t).replace(/\u27EA[^\u27EB]*\u27EB/g, '______').replace(/[\u27E6\u27E7]/g, '');
  M.blanks = t => (String(t).match(/\u27EA[^\u27EB]*\u27EB/g) || []).map(x => x.slice(1, -1));
  const val = (v, label) => (s(v).trim() !== '' ? FV + s(v).trim() + FE : BL + (label || '') + BE);
  const opt = v => (s(v).trim() !== '' ? FV + s(v).trim() + FE : '');
  const title = t => s(t).toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\b(Afb|Ahp|Aaf|Naf|Nas|Mcas|Ang|Arb|Rcag|Atct|Awos|Asos|Ils|Loc|Rnav|Gps|Vor|Dme|Ndb|Ahp)\b/g, x => x.toUpperCase());
  M.title = title;
  const isVhf = f => parseFloat(f) < 225;
  const f2 = f => { const x = s(f); return x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') + (/\.\d$/.test(x.replace(/0+$/, '')) ? '0' : '') : x; };
  M.fq = f2;
  // {v, u, txt}: first VHF + first UHF of a list, e.g. "126.65 / UHF 326.2"
  const fset = list => {
    list = (list || []).map(f2); const v = list.find(isVhf), u = list.find(x => !isVhf(x));
    return { v: v || '', u: u || '', all: list, txt: [v, u ? (v ? 'UHF ' : '') + u : ''].filter(Boolean).join(' / ') };
  };
  M.fset = fset;
  const spoken = fs => fs.v || fs.u || '';

  /* ---------- weather source: ATIS vs ASOS/AWOS one-minute weather ---------- */
  M.wxKind = t => { t = s(t).toUpperCase(); return /^ASOS|^SAWR|^AWSS|^AWOS-A?V?$/.test(t) && /ASOS/.test(t) ? 'ASOS' : (t ? 'AWOS' : ''); };
  // x = {wx: 'AUTO'|'ATIS'|'ASOS'|'AWOS', ...}, a = FAA airport record (may be null)
  M.wxSource = function (x, a) {
    const choice = s(x && x.wx) || 'AUTO', g = (a && a.g) || {}, w = a && a.w;
    const atis = fset(g.I), wk = w ? M.wxKind(w.t) : '';
    let src, auto = choice === 'AUTO', why = '';
    // an "ATIS" frequency that is the same as the AWOS/ASOS radio frequency is just the automated broadcast
    const atisIsAuto = w && w.f && atis.all.includes(f2(w.f));
    if (auto) {
      if (atis.all.length && !atisIsAuto) { src = 'ATIS'; why = 'ATIS frequency ' + atis.txt + ' in FAA data'; }
      else if (w) { src = wk; why = (w.t || wk) + ' listed in FAA data' + (atisIsAuto ? ' (its radio broadcast is on ' + w.f + ')' : ''); }
      else { src = 'ATIS'; why = a ? 'no ATIS or AWOS/ASOS in FAA data - defaulting to ATIS; use the toggle' : 'airport not in data - defaulting to ATIS'; }
    } else { src = choice; why = 'set manually'; }
    const oneMin = src !== 'ATIS';
    const match = w && wk === src;                      // station details only when the family matches
    const type = oneMin ? (match && w.t ? s(w.t).toUpperCase() : src) : 'ATIS';
    const freq = oneMin ? fset(match && w.f ? [w.f] : (atisIsAuto ? g.I : [])) : atis;
    const phone = oneMin && match ? s(w.p) : '';
    return { src, auto, why, oneMin, type, freq, phone, phone2: oneMin && match ? s(w.p2) : '', atis,
             label: oneMin ? type + ' one-minute weather' : 'ATIS',
             tip: oneMin ? 'No ATIS letter - ' + type + ' one-minute weather' + (freq.txt ? ' on ' + freq.txt : '') + (phone ? ', ph ' + phone : '') : 'Info letter assigned live' };
  };

  /* ---------- facilities from FAA data ---------- */
  const shortName = (x, env) => { const a = env.ap(x.id); const n = a ? a.n : s(x.id); return title(n.replace(/\([^)]*\)\s*$/, '').trim()) || s(x.id); };
  // spoken airport name for the broadcast / CTAF text: NASR abbreviations expanded; "Airport" is added only when the name does not already end in a field word
  const ABBR = { Fld: 'Field', Muni: 'Municipal', Intl: 'International', Rgnl: 'Regional', Arpt: 'Airport', Mem: 'Memorial', Cnty: 'County', Co: 'County', Afb: 'AFB', Aaf: 'AAF', Ahp: 'AHP', Nas: 'NAS', Mcas: 'MCAS', Mc: 'Mc' };
  const spokenName = (x, env) => {
    const a = env.ap(x.id); let n = a ? a.n.replace(/\([^)]*\)\s*$/, '').trim() : s(x.id); n = title(n).replace(/\b[A-Za-z]+\b/g, w => ABBR[w] || w);
    const ends = /(airport|airpark|field|airfield|airstrip|heliport|helipad|afb|aaf|ahp|nas|mcas|aerodrome|base|station|strip|pad)$/i.test(n);
    return { bare: n.replace(/\s+Airport$/i, ''), full: ends ? n : n + ' Airport' };
  };
  M.spokenName = spokenName;
  const apW = n => (/(airport|airpark|airfield|airstrip|heliport|aerodrome)$/i.test(n) ? n : n + ' Airport');
  const towerOf = a => { const g = (a && a.g) || {}; return g.tc ? { call: title(g.tc), name: title(g.tc) + ' Tower', hrs: s(g.hr), T: fset(g.T), G: fset(g.G), C: fset(g.C) } : null; };
  const appOf = a => {                                     // approach / departure facility serving the airport
    if (!a) return null; const g = a.g || {}, ad = (a.f || []).filter(r => r[0] === 'A/D');
    const call = g.ac ? title(g.ac) : (ad[0] ? title(ad[0][1].replace(/\s+APP\/DEP.*$|\s+APP.*$|\s+DEP.*$/i, '')) : '');
    const fs = fset(g.A && g.A.length ? g.A : ad.map(r => r[2]));
    return call && fs.all.length ? { call, name: call + ' Approach', dep: call + ' Departure', f: fs } : null;
  };
  const ctrOf = a => {
    const c = a && (a.f || []).filter(r => r[0] === 'CNTR'); if (!c || !c.length) return null;
    const call = title(c[0][1].replace(/\s*CNTR.*$/i, '')); return { call, name: call + ' Center', f: fset(c.map(r => r[2])) };
  };
  const fmtAlt = h => { const n = parseInt(s(h), 10); if (!isFinite(n)) return ''; return n >= 180 ? 'FL' + n : String(n * 100); };
  M.fmtAlt = fmtAlt;
  const altSay = t => { t = s(t).trim(); if (!t) return ''; return /^\d{2,3}$/.test(t) ? fmtAlt(t) : t; };

  /* ---------- Calls + Grade Sheet ---------- */
  M.calls = function (m, env) {
    const ser = M.serNum(m, env), sn = M.last5(ser), CS = 'Army Copter ' + sn;
    const D = m.dep, A = m.d1, B = m.d2, aD = env.ap(D.id), aA = env.ap(A.id), aB = env.ap(B.id);
    const dd = M.flight(m, env), F = m.fp, F1 = m.f1751;
    const sD = shortName(D, env), sA = shortName(A, env), sB = shortName(B, env), DN = sD, AN = sA, BN = sB;
    const o = m.scriptOpts || {}, mins = (v, d) => (String(v == null ? '' : v).trim() === '' || isNaN(+v) ? d : Math.max(0, Math.round(+v))), voidMin = mins(o.voidMin, 30), nltMin = mins(o.nltMin, 30);
    const out = { sn, ser, src: { dep: M.wxSource(D, aD), d1: M.wxSource(A, aA), d2: M.wxSource(B, aB) } };
    const ctlD = M.ctlOf(D, aD), ctlA = M.ctlOf(A, aA), ctlB = M.ctlOf(B, aB);
    const twr = (ctl, a, nm) => { if (!ctl.towered) return null; const t = towerOf(a); if (t) return t; const c = nm.bare; return ctl.choice === 'TWR' ? { call: c, name: c + ' Tower', hrs: ctl.hrs, T: fset([]), G: fset([]), C: fset([]) } : null; };
    const tD = twr(ctlD, aD, spokenName(D, env)), tA = twr(ctlA, aA, spokenName(A, env)), tB = twr(ctlB, aB, spokenName(B, env));
    // first contact after departing D / D1 and the facility serving the arrivals (see ops.js for the rule)
    const HD = M.handoff(m, 'dep', env, 'dep'), H1 = M.handoff(m, 'd1', env, 'dep'), HA = M.handoff(m, 'd1', env, 'arr'), HB = M.handoff(m, 'd2', env, 'arr');
    const asT = f => (f && f.kind === 'T' ? f : null), asC = f => (f && f.kind === 'C' ? f : null);
    const apD = asT(HD.fac), apA = asT(HA.fac), apB = asT(HB.fac);
    const ctrD = asC(HD.fac) || HD.center, ctr = ctrD || HA.center || HB.center;
    const ctrA = asC(HA.fac) || HA.center || ctr, ctrB = asC(HB.fac) || HB.center || ctr;
    const sameCall = (p, q) => !!(p && q && p.kind === q.kind && s(p.call).toUpperCase() === s(q.call).toUpperCase());
    const sameFac = (p, q) => sameCall(p, q) && s(p.f && p.f.txt) === s(q.f && q.f.txt);       // same facility AND same frequency: no new call needed
    const arrF = HA.fac, arrG = HB.fac;                                    // who gives the approach information / clearance at D1 / D2
    const obs = { dep: M.hhmm(M.parseHHMM(F1.briefTime)), d1: M.hhmm(dd.eta1), d2: M.hhmm(dd.eta2) };
    const ls = x => { const t = x.apr ? M.landingSentence(x.apr, x.rwy, env) : ''; return t ? ' ' + FV + t + FE : ''; };
    const inUse = x => (x.apr ? ' ' + FV + x.apr + FE + ' in use.' : (x.rwy ? ' Runway ' + FV + x.rwy + FE + ' in use.' : ''));
    const wxLine = (x, sName, key, a) => {
      const src = out.src[key], wind = 'Wind ' + val(x.wind) + ' @ ' + val(x.ws) + '.', sky = ' Ceiling ' + val(x.ceil) + ' ' + val(x.ct) + '.';
      if (!src.oneMin) {
        return apW(sName) + ' Information ' + BL + 'info letter' + BE + ', ' + FV + obs[key] + 'Z' + FE + '.  ' + wind + ' Vis ' + val(x.vis) + ',' + sky + ' Temp ' + val(x.temp) + ' / DP ' + val(x.dp) +
          '. Altimeter ' + val(x.altim) + '.' + inUse(x) + ls(x) + ' Advise on initial contact you have information ' + BL + 'info letter' + BE + '.';
      }
      // AWOS / ASOS broadcast: no information letter, no runway in use (the field's own broadcast never gives one), starts over after the altimeter
      const nm = spokenName(x, env).full, asos = src.src === 'ASOS';
      const sayT = v => { const t = s(v).trim(); return t === '' ? BL + 'temperature' + BE : FV + (/^-/.test(t) ? 'minus ' + t.slice(1) : t) + FE; };
      const visTxt = s(x.vis).trim() === '' ? BL + 'visibility' + BE : FV + (asos ? s(x.vis).trim() : (s(x.vis).trim().match(/^[\d\s\/]+/) || [s(x.vis).trim()])[0].trim()) + FE;
      const CTW = { BKN: 'broken', OVC: 'overcast', VV: 'vertical visibility' }, ft = h => String(Math.round(parseFloat(h) * 100));
      const sky2 = s(x.ct).trim() === '' ? FV + 'clear below 12,000' + FE : FV + (CTW[s(x.ct).trim()] || s(x.ct)) + ' ' + (s(x.ceil).trim() === '' ? '' : ft(x.ceil)) + FE;
      return nm + ' ' + (asos ? 'automated surface observation' : 'automated weather') + ', ' + FV + obs[key] + 'Z' + FE + ', wind ' + val(x.wind, 'wind') + ' at ' + val(x.ws, 'speed') + ', visibility ' + visTxt + ', sky condition ' + sky2 +
        ', temperature ' + sayT(x.temp) + ', dewpoint ' + sayT(x.dp) + ', altimeter ' + val(x.altim, 'altimeter') + '.  (' + FV + 'repeats' + FE + ')';
    };
    out.depWx = {}; out.d1Wx = {}; out.d2Wx = {};
    ['ATIS', 'ASOS', 'AWOS'].forEach(k => {          // all three variants kept for the "what if" view / tests
      out.depWx[k] = wxLine(Object.assign({}, D), sD, 'dep', aD); out.d1Wx[k] = ''; out.d2Wx[k] = '';
    });
    const sidTxt = x => x.sid ? ' via ' + FV + x.sid + FE + ' departure' + (x.trans ? ', ' + FV + x.trans + FE + ' transition' : '') + ', then as filed.' : ' as filed.';
    const climb = ' Climb and Maintain ' + val(D.maint, 'altitude') + '.' + (D.exp ? ' Expect ' + FV + D.exp + FE + ', ' + val(D.min, 'minutes') + ' minutes after departure.' : '');
    const fD = HD.fac, depF = fD ? fD.f : null;                       // first contact after departure and its frequency
    const dName = f => (f ? (f.kind === 'T' && ctlD.towered ? f.dep : f.name) : '');        // "Tucson Departure" off a towered field, "Tucson Approach" / "Albuquerque Center" otherwise
    const depFreqTxt = depF && depF.txt ? ' Departure frequency ' + FV + depF.txt + FE + '.' : ' Departure frequency ' + BL + 'frequency (none in FAA data)' + BE + '.';
    const sqk = ' Squawk ' + BL + 'ATC-assigned code' + BE + '.';
    const voidT = M.hhmm(dd.etd1 + voidMin), nlt = M.hhmm(dd.etd1 + nltMin);      // both are measured from the ETD
    // clearance at an uncontrolled field: the phone number / GCO the data lists for this airport (Plan can override)
    const cdE = (ctlD.cd.find(e => !e.u) || ctlD.cd[0] || null), cdAlt = ctlD.cd.find(e => e.u) || null;
    const cdFac = cdE ? title(cdE.fac.replace(/\bAPCH\b/, 'Approach').replace(/\bARTCC\b/, 'Center').replace(/^LA /, 'Los Angeles ').replace(/\bCERAP\b/, 'Approach')) : '';
    const cdPh = s(D.cdPh).trim() || (cdE ? cdE.ph : ''), gcoF = s(D.gcoF).trim() || (ctlD.gco ? ctlD.gco.f : '');
    const advise = (!ctlD.towered && cdFac) || (fD && fD.name) || (tD && tD.name) || '';
    const clrBody = 'ATC clears ' + CS + ' to depart ' + DN + ' to ' + AN + sidTxt(D) + ' Maintain ' + val(D.maint, 'altitude') + '.' + (D.exp ? ' Expect ' + FV + D.exp + FE + ', ' + val(D.min) + ' minutes after departure.' : '') +
      depFreqTxt + sqk + ' Clearance void if not off by ' + FV + voidT + 'Z' + FE + '.  If not off by ' + FV + voidT + 'Z' + FE + ' advise ' + val(advise, 'facility') + ' not later than ' + FV + nlt + 'Z' + FE + ' of intentions.  Time ' + BL + 'time check' + BE + ' and ' + BL + 'quarter-minute' + BE + '.';
    out.depCd = {
      ATC: CS + ', Cleared to ' + apW(AN) + sidTxt(D) + climb + depFreqTxt + sqk,
      RELAY: clrBody,
      PHONE: clrBody,
      GCO: clrBody,
      AIR: (fD ? FV + fD.name + FE : BL + 'facility' + BE) + ': ' + CS + ', radar contact ' + BL + 'position' + BE + '.  Cleared to ' + apW(AN) + sidTxt(D) + climb + sqk + '  (Depart ' + FV + sD + FE + ' VFR / as briefed and call ' + (fD ? FV + fD.name + FE : BL + 'facility' + BE) + ' on ' + (depF && depF.txt ? FV + depF.txt + FE : BL + 'frequency' + BE) + ' for the IFR clearance.)'
    };
    const cdMode = ctlD.towered ? D.cd : (s(D.cdm) || 'PHONE');
    out.title = {};
    // weather variants for destinations
    out.d1Wx = { ATIS: wxLine(A, sA, 'd1', aA) }; out.d2Wx = { ATIS: wxLine(B, sB, 'd2', aB) };
    const acTxt = (x, sA_, a, key) => {
      const pr = (a && a.pr && a.pr[x.apr]) || {}, iaf = (pr.iaf && pr.iaf[0]) || '', iaf2 = (pr.iaf && pr.iaf[1]) || iaf, faf = pr.faf || '', ifx = pr.if || '', cr = pr.cross || {}, ia = pr.iafAlt || cr.alt;
      const lab = (v, l) => val(v, l);
      const apr = ' Cleared ' + val(x.apr, 'approach') + ' approach.';
      const miles = BL + 'distance' + BE;
      const T = {
        'NON RNAV Pub Rte': CS + ',' + apr + (x.rwy && M.aprRwy(x.apr) !== x.rwy ? '  Circle to runway ' + FV + x.rwy + FE + '.' : ''),
        'NON RNAV  Unpub RTE': CS + ', Cross ' + lab(cr.fix || ifx || faf, 'fix') + ' at or above ' + lab(cr.alt, 'altitude') + '.' + apr,
        'RNAV within TAA': CS + ',' + apr,
        'RNAV outside TAA': CS + ', Cleared Direct ' + lab(iaf, 'IAF') + ' (IAF).  Maintain at or above ' + lab(ia, 'altitude') + ' until entering the TAA.' + apr,
        'RNAV No TAA': CS + ', Cleared Direct ' + lab(iaf, 'IAF') + ' (IAF).  Maintain at or above ' + lab(ia, 'altitude') + ' until ' + lab(iaf2, 'IAF') + ' (IAF).' + apr,
        'Vector Non RNAV': CS + ', ' + miles + ' miles from ' + lab(faf || ifx, 'fix') + '.  Turn ' + BL + 'left/right' + BE + ', heading ' + BL + 'heading' + BE + '.  Maintain ' + lab(cr.alt, 'altitude') + ' until established on the ' + lab(ifx ? 'final approach course' : '', 'LOC / final approach course') + '.' + apr,
        'Vector RNAV w/in TAA': CS + ', ' + miles + ' miles from ' + lab(iaf, 'IAF') + ' (IAF).' + apr,
        'Vector RNAV no TAA': CS + ', ' + miles + ' miles from ' + lab(iaf, 'IAF') + ' (IAF).  Cleared Direct ' + lab(iaf, 'IAF') + ' (IAF).  Cross ' + lab(iaf, 'IAF') + ' (IAF) at or above ' + lab(ia, 'altitude') + '.' + apr
      };
      return T;
    };
    out.d1Clr = acTxt(A, sA, aA, 'd1'); out.d2Clr = acTxt(B, sB, aB, 'd2');
    // ---- Grade Sheet ----
    const g = out.grade = {}, hdr = out.hdr = {};
    const fr = (fs, who) => (fs && fs.txt ? who + ' - ' + fs.txt : who);
    g.depWx = wxLine(D, sD, 'dep', aD);
    hdr.depWx = out.src.dep.oneMin ? (tD ? '' : '') + out.src.dep.type + ' one-minute weather' + (out.src.dep.freq.txt ? ' - ' + out.src.dep.freq.txt : '') + (out.src.dep.phone ? ' - ph ' + out.src.dep.phone : '')
                                   : 'ATIS' + (out.src.dep.atis.txt ? ' - ' + out.src.dep.atis.txt : '');
    g.cd = out.depCd[cdMode] || '';
    if (ctlD.towered) {
      hdr.cd = D.cd === 'RELAY' ? 'ATC relay (via ' + (advise || 'facility') + ')' : (tD && tD.C.txt ? fr(tD.C, tD.call + ' Clearance Delivery') : (apD ? fr(apD.f, apD.name) : (ctr ? fr(ctr.f, ctr.name) : 'Clearance')));
      out.title.cd = 'Clearance delivery (' + D.cd + ')';
    } else if (cdMode === 'GCO') {
      hdr.cd = 'GCO ' + (gcoF ? gcoF : '(no GCO frequency in FAA data - enter it on the Plan tab)') + ' to ' + (cdFac || (fD && fD.name) || 'the controlling facility') + (cdPh ? ' (phone backup ' + cdPh + ')' : '');
      g.cd = 'On the GCO' + (gcoF ? ' ' + FV + gcoF + FE : ' ' + BL + 'GCO frequency' + BE) + ' (the GCO connects you to ' + val(cdFac || (fD && fD.name), 'facility') + '):  ' + g.cd;
      out.title.cd = 'Clearance by GCO (radio)';
    } else if (cdMode === 'AIR') {
      hdr.cd = 'Airborne pickup - ' + (fD ? fr(fD.f, fD.name) : 'controlling facility');
      out.title.cd = 'Clearance - airborne pickup';
    } else {
      hdr.cd = 'Phone: ' + (cdFac || (fD && fD.name) || 'controlling facility') + ' ' + (cdPh || '(no clearance phone in FAA data - enter it on the Plan tab)') + (cdAlt ? ' • if unable ' + title(cdAlt.fac.replace(/\bAPCH\b/, 'Approach').replace(/\bARTCC\b/, 'Center')) + ' ' + cdAlt.ph : '');
      g.cd = 'Call ' + val(cdFac || (fD && fD.name), 'facility') + ' on ' + val(cdPh, 'phone number') + ' (clearance delivery by phone):  ' + g.cd;
      out.title.cd = 'Clearance by phone';
    }
    const rwyTxt = x => FV + (x.rwy || '') + FE;
    const advD = ctlD.adv.txt ? ctlD.adv.txt : '122.9 (MULTICOM)', spD = spokenName(D, env).bare, spA = spokenName(A, env).bare, spB = spokenName(B, env).bare;
    const courseD = HD.course != null ? HD.course : null, dirD = courseD != null ? M.compass(courseD) : null;
    if (ctlD.towered) {
      g.taxi = CS + ', RWY ' + val(D.rwy, 'runway') + ', Hover Taxi via ' + BL + 'taxi route' + BE + '.';
      hdr.taxi = tD ? fr(tD.G, tD.call + ' Ground') : 'Local / advisory';
      g.takeoff = CS + ', RWY ' + val(D.rwy, 'runway') + ' (MIL ATC: Wind ' + val(D.wind) + ' @ ' + val(D.ws) + ' ) Cleared for Takeoff.';
      hdr.takeoff = tD ? fr(tD.T, tD.name) : 'Local / advisory';
      g.handoff1 = CS + ', Contact ' + (fD ? FV + dName(fD) + FE : 'Departure') + (depF && depF.txt ? ' on ' + FV + spoken(depF) + FE + (depF.v && depF.u ? ' (UHF ' + FV + depF.u + FE + ')' : '') : ' on ' + BL + 'frequency (none in FAA data)' + BE) + '.';
      hdr.handoff1 = tD ? tD.name : 'Departing facility';
      out.title.taxi = 'Taxi'; out.title.takeoff = 'Takeoff'; out.title.handoff1 = 'Handoff';
    } else {                                                           // uncontrolled: no taxi / takeoff clearance, only advisory calls on the CTAF
      g.taxi = FV + spD + FE + ' traffic, ' + CS + ', hover taxiing to RWY ' + val(D.rwy, 'runway') + ', ' + FV + spD + FE + ' traffic.';
      hdr.taxi = 'CTAF ' + advD + ' - self-announce (no taxi clearance)';
      g.takeoff = FV + spD + FE + ' traffic, ' + CS + ', departing RWY ' + val(D.rwy, 'runway') + (dirD ? ', departing to the ' + FV + dirD + FE : ', departing to the ' + BL + 'direction' + BE) + ', ' + FV + spD + FE + ' traffic.';
      hdr.takeoff = 'CTAF ' + advD + ' - self-announce (no takeoff clearance)';
      g.handoff1 = cdMode === 'AIR' ? '' : (fD ? FV + fD.name + FE : BL + 'facility' + BE) + ', ' + CS + ', airborne from ' + FV + sD + FE + ', climbing ' + val(D.maint, 'altitude') + (depF && depF.txt ? ' (on ' + FV + spoken(depF) + FE + ')' : '') + '.';
      hdr.handoff1 = 'You call ' + (fD ? fr(fD.f, fD.name) : 'the departure facility') + ' - no tower to hand you off';
      out.title.taxi = 'CTAF advisory - taxi'; out.title.takeoff = 'CTAF advisory - departure'; out.title.handoff1 = 'First call after departure (pilot)';
    }
    g.depCtl = CS + ', ' + (fD ? FV + dName(fD) + FE : BL + 'facility' + BE) + ', RADAR CONTACT, Climb and Maintain ' + val(D.exp || D.maint, 'altitude') + ', ' + FV + sD + FE + ' altimeter is ' + val(D.altim, 'altimeter') + '.';
    hdr.depCtl = fD ? fr(fD.f, dName(fD)) : 'Departure';
    // next hand-off(s) on the way to D1: terminal -> Center (if one is needed) -> D1's approach control; skipped when the same facility already serves D1
    const toA = arrF && !sameFac(arrF, fD) ? arrF : null;
    let step1 = null, step2 = null;
    if (fD && fD.kind === 'T') { const cen = HD.center && !sameCall(HD.center, toA) && !sameCall(fD, toA) ? HD.center : null; if (toA && cen && toA.kind === 'T') { step1 = cen; step2 = toA; } else step1 = toA; }
    else step1 = toA;
    const fcl = (f, who) => (f && f.f && spoken(f.f) ? FV + spoken(f.f) + FE + (f.f.v && f.f.u ? ' (UHF ' + FV + f.f.u + FE + ')' : '') : BL + 'frequency' + BE);
    g.contact = step1 ? CS + ' Contact ' + FV + step1.name + FE + ' on ' + fcl(step1) + '.' : '';
    hdr.contact = fD ? dName(fD) : 'Departing facility';
    g.toApp1 = step2 ? CS + ', Contact ' + FV + step2.name + FE + ' on ' + fcl(step2) + '.' : '';
    hdr.toApp1 = step1 ? step1.name : 'Center';
    g.d1Wx = wxLine(A, sA, 'd1', aA);
    hdr.d1Wx = out.src.d1.oneMin ? out.src.d1.type + ' one-minute weather' + (out.src.d1.freq.txt ? ' - ' + out.src.d1.freq.txt : '') + (out.src.d1.phone ? ' - ph ' + out.src.d1.phone : '') : 'ATIS' + (out.src.d1.atis.txt ? ' - ' + out.src.d1.atis.txt : '');
    const starTxt = x => x.star ? ' Expect the ' + FV + x.star + FE + ' arrival, then the' : ' Expect';
    g.d1Info = CS + ',' + starTxt(A) + ' ' + val(A.apr, 'approach') + ' approach.  Wind ' + val(A.wind) + ' @ ' + val(A.ws) + ' Ceiling ' + val(A.ceil) + ' ' + val(A.ct) + ' Vis ' + val(A.vis) + ' Altimeter ' + val(A.altim) + '.';
    hdr.d1Info = arrF ? fr(arrF.f, arrF.name) : 'Approach';
    g.d1Clr = out.d1Clr[A.ac] || ''; hdr.d1Clr = hdr.d1Info;
    const pA = (aA && aA.pr && aA.pr[A.apr]) || {}, pB = (aB && aB.pr && aB.pr[B.apr]) || {};
    g.d1Cross = CS + ', Cross ' + val((pA.cross && pA.cross.fix) || pA.if || pA.faf, 'fix') + ' at or above ' + val(pA.cross && pA.cross.alt, 'altitude') + ', Cleared ' + val(A.apr, 'approach') + ' Approach';
    hdr.d1Cross = hdr.d1Info;
    const phoneAdv = (ctl, fac) => !ctl.towered ? '  If you cannot cancel in the air, call ' + val(fac && fac.name, 'facility') + ' by phone after landing.' : '';
    g.d1Cancel = CS + ', Report cancellation of IFR this frequency or with Flight Service.  Change to advisory frequency approved' + (ctlA.adv.txt ? ' (CTAF ' + FV + ctlA.adv.txt + FE + ')' : '') + '.' + phoneAdv(ctlA, arrF);
    hdr.d1Cancel = arrF ? fr(arrF.f, arrF.name) : 'Approach';
    const spAn = spokenName(A, env).bare, spBn = spokenName(B, env).bare;
    const apprTxt = x => x.apr ? FV + x.apr + FE + ' approach' : BL + 'approach' + BE;
    const ctafCalls = (x, ctl, sp, pre, course, fac) => {
      const dir = course != null ? FV + M.compass(course) + FE : BL + 'direction' + BE;
      g[pre + '1'] = FV + sp + FE + ' traffic, ' + CS + ', ' + BL + 'distance' + BE + ' miles ' + dir + ', ' + val(x.maint || x.alt || '', 'altitude') + ', inbound, executing the ' + apprTxt(x) + ' to RWY ' + val(x.rwy, 'runway') + ', ' + FV + sp + FE + ' traffic.';
      g[pre + '2'] = FV + sp + FE + ' traffic, ' + CS + ', ' + apprTxt(x) + ', on final for RWY ' + val(x.rwy, 'runway') + ', ' + BL + 'full stop / touch-and-go' + BE + ', ' + FV + sp + FE + ' traffic.';
      g[pre + '3'] = FV + sp + FE + ' traffic, ' + CS + ', clear of RWY ' + val(x.rwy, 'runway') + ', ' + FV + sp + FE + ' traffic.  (Cancel IFR with ' + val(fac && fac.name, 'facility') + ' by phone / radio if not already done.)';
      hdr[pre + '1'] = hdr[pre + '2'] = hdr[pre + '3'] = 'CTAF ' + (ctl.adv.txt || '122.9 (MULTICOM)') + ' - self-announce (no tower)';
      out.title[pre + '1'] = 'CTAF advisory - inbound position report'; out.title[pre + '2'] = 'CTAF advisory - final'; out.title[pre + '3'] = 'CTAF advisory - clear of runway';
    };
    if (!ctlA.towered) ctafCalls(A, ctlA, spAn, 'd1Ctaf', HA.course, arrF);
    g.d1Tower = !ctlA.towered ? '' : tA
      ? 'Contact ' + FV + tA.name + FE + ' on ' + val(spoken(tA.T) + (tA.T.v && tA.T.u ? ' (UHF ' + tA.T.u + ')' : ''), 'tower frequency') + '.  (Then when on Tower:) ' + CS + ', ' + FV + tA.name + FE + ', RWY ' + val(A.rwy, 'runway') + ' (MIL ATC: Wind ' + val(A.wind) + ' @ ' + val(A.ws) + ' ), Cleared to Land.'
      : '';
    hdr.d1Tower = tA ? fr(tA.T, tA.name) : 'Advisory (CTAF)'; out.title.d1Tower = 'Tower';
    const rwyDep1 = A.rwy;
    const mAppA = arrF || ctrA, mKA = mAppA && mAppA.kind === 'T' ? 'Approach' : 'Center';
    g.missed1 = CS + ', Contact ' + (mAppA ? FV + (mAppA.call) + FE + ' ' + mKA : BL + 'facility' + BE) + ' on ' + (mAppA ? FV + spoken(mAppA.f) + FE + (mAppA.f.v && mAppA.f.u ? ' (UHF ' + FV + mAppA.f.u + FE + ')' : '') : BL + 'frequency (none in FAA data)' + BE) + '.';
    hdr.missed1 = tA ? tA.name : 'Tower / advisory';
    g.missed2 = CS + ', ' + (mAppA ? FV + mAppA.call + FE + ' ' + mKA : BL + 'facility' + BE) + ', RADAR Contact, Climb and Maintain ' + val(pA.maAlt, 'missed-approach altitude') + ', Say Intentions.';
    hdr.missed2 = mAppA ? fr(mAppA.f, mAppA.name) : 'Approach';
    g.missed3 = CS + ', I Have your Request, EXPECT FURTHER CLEARANCE ' + BL + 'EFC time' + BE + '.';
    hdr.missed3 = hdr.missed2;
    if (pA.ma) g.missedPub = 'Published missed approach (' + A.apr + '): ' + pA.ma;
    const rt2 = s(F.termRoute) !== '' ? F.termRoute : (s(F.route2).trim() && !/^direct$/i.test(s(F.route2).trim()) ? F.route2 : '');
    g.toD2 = CS + ', Cleared to ' + apW(BN) + ', ' + (rt2 ? 'via ' + FV + rt2 + FE : 'direct') + ', Maintain ' + val(fmtAlt(F.alt2), 'altitude') + '.';
    hdr.toD2 = arrF ? fr(arrF.f, arrF.name) : (tA ? tA.name : 'Departure');
    const fD1 = H1.fac, dName1 = f => (f ? (f.kind === 'T' && ctlA.towered ? f.dep : f.name) : '');
    g.handoff2 = CS + ', Contact ' + (fD1 ? FV + dName1(fD1) + FE : BL + 'facility' + BE) + ' on ' + (fD1 && spoken(fD1.f) ? FV + spoken(fD1.f) + FE + (fD1.f.v && fD1.f.u ? ' (UHF ' + FV + fD1.f.u + FE + ')' : '') : BL + 'frequency (none in FAA data)' + BE) + '.';
    hdr.handoff2 = tA ? tA.name : (ctlA.towered ? 'Departing facility' : 'You call - no tower to hand you off');
    const toB = arrG && !sameFac(arrG, fD1) ? arrG : null;
    const cenB = fD1 && fD1.kind === 'T' && toB && toB.kind === 'T' && H1.center && !sameCall(H1.center, toB) && !sameCall(fD1, toB) ? H1.center : null;
    const cl2 = (f, pre) => pre + 'Contact ' + FV + f.name + FE + ' on ' + (spoken(f.f) ? FV + spoken(f.f) + FE + (f.f.v && f.f.u ? ' (UHF ' + FV + f.f.u + FE + ')' : '') : BL + 'frequency (none in FAA data)' + BE) + '.';
    g.toApp2 = !toB ? '' : CS + ', ' + (cenB ? cl2(cenB, '').replace(/^Contact/, 'Contact') + '  (Then:) ' + cl2(toB, '') : cl2(toB, '').replace(/^/, ''));
    hdr.toApp2 = cenB ? fD1.name : (fD1 ? fD1.name : 'Center');
    g.d2Wx = wxLine(B, sB, 'd2', aB);
    hdr.d2Wx = out.src.d2.oneMin ? out.src.d2.type + ' one-minute weather' + (out.src.d2.freq.txt ? ' - ' + out.src.d2.freq.txt : '') + (out.src.d2.phone ? ' - ph ' + out.src.d2.phone : '') : 'ATIS' + (out.src.d2.atis.txt ? ' - ' + out.src.d2.atis.txt : '');
    g.d2Info = CS + ',' + starTxt(B) + ' ' + val(B.apr, 'approach') + ' approach.  Wind ' + val(B.wind) + ' @ ' + val(B.ws) + ' Ceiling ' + val(B.ceil) + ' ' + val(B.ct) + ' Vis ' + val(B.vis) + ' Altimeter ' + val(B.altim) + '.';
    hdr.d2Info = arrG ? fr(arrG.f, arrG.name) : 'Approach';
    g.d2Clr = out.d2Clr[B.ac] || ''; hdr.d2Clr = hdr.d2Info;
    g.d2Cross = CS + ', Cross ' + val((pB.cross && pB.cross.fix) || pB.if || pB.faf, 'fix') + ' at or above ' + val(pB.cross && pB.cross.alt, 'altitude') + ', Cleared ' + val(B.apr, 'approach') + ' Approach';
    hdr.d2Cross = hdr.d2Info;
    g.d2Cancel = CS + ', Report cancellation of IFR this frequency or with Flight Service.  Change to advisory frequency approved' + (ctlB.adv.txt ? ' (CTAF ' + FV + ctlB.adv.txt + FE + ')' : '') + '.' + phoneAdv(ctlB, arrG);
    hdr.d2Cancel = hdr.d2Info;
    g.d2ContactTwr = tB ? CS + ', Contact ' + FV + tB.name + FE + ' on ' + val(spoken(tB.T) + (tB.T.v && tB.T.u ? ' (UHF ' + tB.T.u + ')' : ''), 'tower frequency') + '.'
                        : CS + ', Change to advisory frequency approved' + (ctlB.adv.txt ? ' (CTAF ' + FV + ctlB.adv.txt + FE + ')' : '') + '.';
    hdr.d2ContactTwr = hdr.d2Info;
    if (!ctlB.towered) ctafCalls(B, ctlB, spBn, 'd2Ctaf', HB.course, arrG);
    g.d2Tower = !ctlB.towered ? '' : tB ? CS + ', ' + FV + tB.name.toUpperCase() + FE + ', RWY ' + val(B.rwy, 'runway') + ' (MIL: WIND ' + val(B.wind) + ' @ ' + val(B.ws) + ') CLEARED TO LAND'
                   : CS + ', no control tower in FAA data for ' + FV + B.id + FE + ' - self-announce on CTAF' + (aB && aB.g && aB.g.F ? ' ' + FV + fset(aB.g.F).txt + FE : '') + ', RWY ' + val(B.rwy, 'runway') + '.';
    hdr.d2Tower = tB ? fr(tB.T, tB.name) : 'Advisory (CTAF)'; out.title.d2Tower = 'Tower';
    g.simTemp = 'Temperature in Fahrenheit for SIM setup = ' + s(M.fToC(D.temp)) + '*';
    g.cockpit = 'COCKPIT # __' + m.device + '__';
    out.fac = { dep: { tower: tD, app: apD, first: fD }, d1: { tower: tA, app: apA, first: fD1 }, d2: { tower: tB, app: apB }, ctr };
    out.ctl = { dep: ctlD, d1: ctlA, d2: ctlB, cdMode }; out.ho = { dep: HD, d1: H1 };
    // plain-text twins for copy/tests
    out.plain = {}; Object.keys(g).forEach(k => { out.plain[k] = M.plain(g[k]); });
    return out;
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = M; require('./ops.js'); }
})(typeof window !== 'undefined' ? window : globalThis);
