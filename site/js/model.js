/* AMR planner - pure model: default mission, calculations and all generated text.
 * Ported from the formulas in the AMR_Template workbook (Cheat Sheet / Calls / AMR / DD 175 / 175-1 / Grade Sheet).
 * No DOM access here so it can be unit-tested in node (see tests/).
 * env = { ap(id)->airport|null, acft(design)->row|null, device(name)->row|null, compat:boolean }
 */
(function (root) {
  'use strict';
  const M = {};
  const s = v => (v == null ? '' : typeof v === 'number' ? String(Math.round(v * 1e9) / 1e9) : String(v));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const pad = (n, w) => String(Math.trunc(n)).padStart(w, '0');
  M.s = s; M.num = num;

  /* ---------- defaults ---------- */
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  M.isoDate = isoDate;
  M.WX_SRC = ['ATIS', 'ASOS', 'AWOS'];                       // Calls!A4:A6  (listWX)
  M.CD_LIST = ['ATC', 'RELAY'];                              // Calls!C4:C5  (listCD)
  M.CLR_TYPES = ['NON RNAV Pub Rte', 'NON RNAV  Unpub RTE', 'RNAV within TAA', 'RNAV outside TAA', 'RNAV No TAA',
                 'Vector Non RNAV', 'Vector RNAV w/in TAA', 'Vector RNAV no TAA'];   // Calls!G4:G11 (listAPR_Type)
  M.CT_LIST = ['BKN', 'OVC', 'VV'];
  M.NAV_LIST = ['Conventional Ground based', 'Space based'];

  M.defaultMission = function (today) {
    const t = new Date(today || Date.now()); t.setDate(t.getDate() + 1);       // workbook: =TODAY()+1
    return {
      v: 1, name: '', date: isoDate(t), acft: 'UH-72', device: 'GOLD 2',
      dep: { id: '02AZ', wind: '090', ws: '10', vis: '1 FG', ct: 'OVC', ceil: '002', temp: '18', dp: '17', altim: '29.92',
             wx: 'ATIS', apr: '', rwy: '', sid: '', trans: '', cd: 'ATC', maint: '020', exp: '040', min: '10' },
      d1: { id: 'KTUS', wind: '120', ws: '10', vis: '1 HZ', ct: 'OVC', ceil: '006', temp: '18', dp: '17', altim: '29.94',
            wx: 'ASOS', apr: '', rwy: '', star: '', tvis: '', tcl: '', ac: 'NON RNAV Pub Rte' },
      d2: { id: 'KRYN', wind: '150', ws: '10', vis: '2 -RA', ct: 'OVC', ceil: '006', temp: '18', dp: '18', altim: '29.93',
            wx: 'ATIS', apr: '', rwy: '', star: '', tvis: '', tcl: '', ac: 'RNAV No TAA' },
      noAlt: false, alt2: { id: '', time: '' },
      amr: { purpose: 'pick-up', who: 'the Sergeant Major of the Army', nav1: 'Conventional Ground based', nav2: 'Space based',
             missionTxt: '', specialTxt: '', intent: 'Accomplish the mission safely, to standard, on time and IAW applicable regulations, while complying with special instructions.  Complete INST APART during mission.',
             pax: { name: 'none', rank: '', org: '' },
             crew: [ { name: '', rank: '', role: 'PC' }, { name: '', rank: '', role: 'PI' }, { name: '', rank: '', role: 'IP', org: '' } ],
             unit: '', wb: '', ela: '', sect: '',
             remarks: 'All times published are Zulu unless stated otherwise.  (Use local time as Zulu)\nSee DD175-1 Remarks for NOTAM information' },
      f175: { etd: '1930', tas: '110', alt1: '040', alt2: '040', rules: 'I', route1: '', route2: '', termRoute: '',
              v1: '', x1: '', w1: '', v2: '', x2: '', w2: '', v3: '', x3: '', w3: '', hold: '10', fob: '3+00' },
      f1751: { briefTime: '1900', init: '', flimsy: '', watch: '', climbLayer: 'SFC-050',
               fl: '040', space: 'NO IMPACT', cloudsFL: 'YES', obsc: 'NO', obscType: '', minCeil: '', cloudTops: '110', frz: '100',
               tstm: 'NONE', turb: 'LIGHT', turbWhere: 'IN CLEAR', icing: 'NONE', precip: 'NONE', notams: '',
               brief: 'X', rscBriefed: 'NOT AVAILABLE', pmsv: '306.5', attach: 'YES',
               v1a: '', v1b: '', v2a: '', v2b: '', t1a: '', t1b: '', t2a: '', t2b: '', recvName: '', bmnt: '', sr: '', ss: '', eent: '' }
    };
  };

  /* ---------- small helpers ---------- */
  M.fToC = c => Math.round((num(c) * 1.8 + 32) * 100) / 100;
  M.rwyNum = r => /^\d+$/.test(s(r));
  // "RWY 06R"-style runway in an approach title (null if none, e.g. VOR-A)
  M.aprRwy = a => { const m = /RWY\s+0*(\d+[LRC]?)\b/i.exec(s(a)); return m ? m[1].toUpperCase() : null; };
  M.nm = (a, b) => { // great-circle nm between two [lat,lon]
    const R = 3440.065, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  M.hhmm = min => { min = ((Math.floor(min + 1e-6) % 1440) + 1440) % 1440; return pad(min / 60, 2) + pad(min % 60, 2); };
  M.hplusmm = min => pad(Math.floor(min + 1e-6) / 60, 2) + '+' + pad(Math.floor(min + 1e-6) % 60, 2);
  M.parseHHMM = t => { const d = s(t).replace(/\D/g, '').padStart(4, '0').slice(-4); return (+d.slice(0, 2)) * 60 + (+d.slice(2)); };
  const roundUp = x => (x < 0 ? -Math.ceil(-x - 1e-9) : Math.ceil(x - 1e-9));
  M.roundUp = roundUp;

  /* ---------- derived values ---------- */
  M.serNum = (m, env) => {                                         // AMR!C14
    if (!m.device) return '99-12345';
    const d = env.device(m.device); return d ? 'R-' + d.n : '99-12345';
  };
  M.last5 = ser => s(ser).slice(-5);
  M.aname = (x, env) => { const a = env.ap(x.id); return a ? a.n : s(x.id); };

  // Is the "Landing and Departing RWY" sentence added?  (Calls!B4 etc.: IF(RIGHT(APR,2)<>RWY, ...))
  M.landingSentence = (apr, rwy, env) => {
    rwy = s(rwy);
    if (env && env.compat) {                       // exact workbook behaviour: a numeric runway never equals the text "06"
      const r2 = s(apr).slice(-2);
      const differs = M.rwyNum(rwy) ? true : r2.toLowerCase() !== rwy.toLowerCase();
      return differs ? 'Landing and Departing RWY ' + rwy + '.' : '';
    }
    if (!rwy) return '';
    const ar = M.aprRwy(apr);
    return (ar && ar === rwy.toUpperCase()) ? '' : 'Landing and Departing RWY ' + rwy + '.';
  };

  /* ---------- weather validation tips (Directions sheet + Cheat Sheet notes) ---------- */
  const OBS = ['BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'PY', 'PO', 'SQ', 'FC', 'SS', 'DS'];
  const PRE = ['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'];
  M.parseVis = v => {
    v = s(v).trim(); const m = /^(\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?)/.exec(v);
    if (!m) return { sm: null, reason: v };
    let sm = 0; m[1].split(/\s+/).forEach(p => { if (p.includes('/')) { const [a, b] = p.split('/'); sm += (+a) / (+b); } else sm += +p; });
    return { sm, reason: v.slice(m[0].length).trim() };
  };
  M.validReason = r => {
    if (!r) return false;
    return r.toUpperCase().split(/\s+/).every(t => { t = t.replace(/^[-+]/, ''); t = t.replace(/^(SH|TS|FZ|BL|DR|MI|BC|PR)/, ''); return t.length >= 2 && t.match(/.{1,2}/g).every(p => PRE.includes(p) || OBS.includes(p) || p === 'RA'); });
  };
  M.validateWx = (w, elev) => {
    const out = [], add = (level, msg) => out.push({ level, msg });
    if (s(w.wind) !== '' && !/^(VRB|\d{3})$/.test(s(w.wind))) add('warn', 'Wind direction should be 3 digits (e.g. 090) or VRB.');
    if (s(w.wind) !== '' && /^\d{3}$/.test(s(w.wind)) && +w.wind > 360) add('warn', 'Wind direction is over 360.');
    if (s(w.ws) !== '' && !/^\d{1,3}(G\d{2,3})?$/.test(s(w.ws))) add('warn', 'Wind speed: knots, e.g. 10 or 15G25.');
    const v = M.parseVis(w.vis);
    if (s(w.vis) !== '') {
      if (v.sm == null) add('warn', 'Visibility should start with a number in statute miles (e.g. 1, 1/2, 2 -RA).');
      else {
        if (v.sm < 7 && !v.reason) add('warn', 'Visibility below 7 needs a reason (BR, FG, HZ, RA, -RA …).');
        else if (v.reason && !M.validReason(v.reason)) add('warn', 'Unrecognised weather code "' + v.reason + '" - see the WX codes reference.');
        if (v.sm >= 3) add('tip', 'Workbook tip: visibility should be below 3 for an IMC training scenario.');
      }
    }
    if (s(w.ceil) !== '' && !/^\d{3}$/.test(s(w.ceil))) add('warn', 'Ceiling altitude is 3 digits in hundreds of feet AGL (e.g. 006).');
    if (s(w.ceil) !== '' && !s(w.ct)) add('warn', 'Pick a ceiling type (BKN / OVC / VV).');
    if (s(w.temp) !== '' && s(w.dp) !== '' && num(w.dp) > num(w.temp)) add('warn', 'Dew point is higher than temperature.');
    if (s(w.altim) !== '') {
      if (!/^\d\d\.\d\d$/.test(s(w.altim))) add('warn', 'Altimeter format 29.92.');
      else { if (+w.altim < 28 || +w.altim > 31) add('warn', 'Altimeter outside 28.00-31.00.'); if (/0$/.test(s(w.altim))) add('tip', 'Workbook tip: don\'t use altimeter settings that end in "0".'); }
    }
    return out;
  };

  /* ---------- Calls sheet + Grade Sheet text ---------- */
  M.calls = function (m, env) {
    const ser = M.serNum(m, env), sn = M.last5(ser);
    const D = m.dep, A = m.d1, B = m.d2, DN = M.aname(D, env), AN = M.aname(A, env), BN = M.aname(B, env);
    const ls = (x) => M.landingSentence(x.apr, x.rwy, env);
    const out = { sn, ser };
    out.depWx = {
      ATIS: DN + ' Airport Info ______, ______Z.  Wind ' + D.wind + ' @ ' + D.ws + '. Vis ' + D.vis + ', Ceiling ' + D.ceil + ' ' + D.ct + '. Temp ' + D.temp + ' / DP ' + D.dp + '. Altimeter ' + D.altim + '  ' + D.apr + ' in use. ' + ls(D) + ' Advise on initial contact you have _____.',
      ASOS: DN + ' Airport Automated Observation _______Z.  Wind ' + D.wind + ' @ ' + D.ws + '. VIS ' + D.vis + '. Sky Condition ' + D.ct + ' Ceiling ' + D.ceil + ' Temp ' + D.temp + 'C / DP ' + D.dp + 'C. Altimeter ' + D.altim,
      AWOS: DN + ' Airport Automated Weather Observation _______Z.  Wind ' + D.wind + '@' + D.ws + ' VIS ' + D.vis + '. Sky Condition ' + D.ct + ' Ceiling ' + D.ceil + ' Temp ' + D.temp + 'C / DP ' + D.dp + 'C.  Altimeter ' + D.altim
    };
    out.depCd = {
      ATC: 'Army Copter ' + sn + ' Cleared to ' + AN + ' Airport ' + (D.sid === '' ? ' as filed.' : ' via ' + D.sid + ' departure, ' + D.trans + '_Transition, then as filed.') +
           ' Climb and Maintain ' + D.maint + '_,' + (D.exp === '' ? '' : ' Expect ' + D.exp + ', ' + D.min + ' minutes after departure. ') + (D.sid === '' ? '. Dept Freq ______.  SQK _______.' : ' SQK ___________ .'),
      RELAY: 'ATC clears Army Copter ' + sn + ' to depart ' + DN + ' to ' + AN + ' as filed. Maintain ' + D.maint + (D.exp === '' ? '' : ' Expect ' + D.exp + ', ' + D.min + ' minutes after departure') +
             '. Dept Freq ______.  SQK _______.  Clearance Void if not off by__________,.  If not off by_______advise ____________NLT ________of intentions.  Time________ and ______(qtr).'
    };
    out.d1Wx = {
      ATIS: AN + ' Airport Info ______, ______Z.  Wind ' + A.wind + ' @ ' + A.ws + '. Vis ' + A.vis + ', Ceiling ' + A.ceil + ' ' + A.ct + '. Temp ' + A.temp + ' / DP ' + A.dp + '. Altimeter ' + A.altim + ', ' + A.apr + ' in use.  ' + ls(A) + ' Advise on initial contact you have _____.',
      ASOS: AN + ' Airport Automated Observation _______Z.  Wind ' + A.wind + ' @ ' + A.ws + '. VIS ' + A.vis + '. Sky Condition ' + A.ct + ' Ceiling ' + A.ceil + ' Temp ' + A.temp + 'C / DP ' + A.dp + 'C.  Altimeter ' + A.altim,
      AWOS: AN + ' Airport Automated Weather Observation _______Z.  Wind ' + A.wind + ' @ ' + A.ws + ' VIS ' + A.vis + '. Sky Condition ' + A.ct + ' Ceiling ' + A.ceil + ' Temp ' + A.temp + 'C / DP ' + A.dp + 'C.  Altimeter ' + A.altim
    };
    out.d2Wx = {
      ATIS: BN + ' Airport Info ______, ______Z.  Wind ' + B.wind + ' @ ' + B.ws + '. Vis ' + B.vis + ', Ceiling ' + B.ceil + ' ' + B.ct + '. Temp ' + B.temp + ' / DP ' + B.dp + '. Altimeter ' + B.altim + ',  ' + B.apr + ' in use. ' + ls(B) + ' Advise on initial contact you have _____.',
      ASOS: BN + ' Airport Automated Observation _______Z.  Wind ' + B.wind + ' @ ' + B.ws + '. VIS ' + B.vis + '. Sky Condition ' + B.ct + ' Ceiling ' + B.ceil + ' Temp ' + B.temp + 'C / DP ' + B.dp + 'C. Altimeter ' + B.altim,
      AWOS: BN + ' Airport Automated Weather Observation _______Z.  Wind ' + B.wind + ' @ ' + B.ws + ' VIS ' + B.vis + '. Sky Condition ' + B.ct + ' Ceiling ' + B.ceil + ' Temp ' + B.temp + 'C / DP ' + B.dp + 'C.  Altimeter ' + B.altim
    };
    const ac1 = {
      'NON RNAV Pub Rte': 'Army Copter ' + sn + ' Cleared ' + A.apr + ' approach.        (And possibly ONLY at Towered Airfields), Circle To Runway ________.',
      'NON RNAV  Unpub RTE': 'Army Copter ' + sn + ', Cross ______at or above________.  Cleared ' + A.apr + ' approach.',
      'RNAV within TAA': 'Army Copter ' + sn + ' Cleared ' + A.apr + ' approach.',
      'RNAV outside TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until entering the TAA.  Cleared ' + A.apr + ' approach.',
      'RNAV No TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until ______ (IAF). Cleared ' + A.apr + ' approach.',
      'Vector Non RNAV': 'Army Copter ' + sn + ',______ miles from________.  Turn L/R, Heading_____.  Maintaing______until established on the (LOC, Final APP Course).  Cleared ' + A.apr + ' approach.',
      'Vector RNAV w/in TAA': 'Army Copter ' + sn + ',_____ miles from ______(IAF).  Cleared ' + A.apr + ' approach.',
      'Vector RNAV no TAA': 'Army Copter ' + sn + ',______ Miles from _____(IAF).  Cleared Direct_______(IAF).  Cross________(IAF) at or above_______.  Cleared ' + A.apr + ' approach.'
    };
    const ac2 = {
      'NON RNAV Pub Rte': 'Army Copter ' + sn + ', Cleared ' + B.apr + ' approach.',
      'NON RNAV  Unpub RTE': 'Army Copter ' + sn + ', Cross ______at or above________.  Cleared ' + B.apr + ' approach.',
      'RNAV within TAA': 'Army Copter ' + sn + ', Cleared  ' + B.apr + ' approach.',
      'RNAV outside TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until entering the TAA.  Cleared ' + B.apr + ' approach.',
      'RNAV No TAA': 'Army Copter ' + sn + ', Cleared Direct _____(IAF).  Maintain at or above______until ______ (IAF). Cleared ' + B.apr + ' approach.',
      'Vector Non RNAV': 'Army Copter ' + sn + ', __ miles from________.  Turn L/R, Heading_____.  Maintain______until established on the (LOC, Final APP Coiurse). Cleared ' + B.apr + ' approach.',
      'Vector RNAV w/in TAA': 'Army Copter ' + sn + ', __ miles from ______(IAF).  Cleared ' + B.apr + ' approach.',
      'Vector RNAV no TAA': 'Army Copter ' + sn + ', __ Miles from _____(IAF).  Cleared Direct_______(IAF).  Cross________(IAF) at or above_______.  Cleared ' + B.apr + ' approach.'
    };
    out.d1Clr = ac1; out.d2Clr = ac2;
    // Grade Sheet ---------------------------------------------------------------------------
    const g = out.grade = {};
    g.depWx = out.depWx[D.wx] || '';
    g.cd = out.depCd[D.cd] || '';
    g.taxi = 'Army Copter ' + sn + ', RWY _____' + D.rwy + ', Hover Taxi via _________.';
    g.takeoff = 'Army Copter ' + sn + ', RWY ' + D.rwy + ' (MIL ATC: Wind ' + D.wind + ' @ ' + D.ws + ' ) Cleared for Takeoff.';
    g.handoff1 = 'Army Copter ' + sn + ', CONTACT DEPARTURE ';
    g.depCtl = 'Army Copter ' + sn + ', ____________ Dep ,  RADAR CONTACT, Climb and Maintain _______, _________ altimeter is ____________.';
    g.contact = 'Army Copter ' + sn + ' CONTACT ___________ (APP/CTR) ON _________';
    g.d1Wx = out.d1Wx[A.wx] || '';
    g.d1Info = 'Army Copter ' + sn + ', Expect ' + A.apr + ' approach.  Wind ' + A.wind + ' @ ' + A.ws + ' Ceiling ' + A.ceil + ' ' + A.ct + ' Vis ' + A.vis + ' Altimeter ' + A.altim + '.';
    g.d1Clr = ac1[A.ac] || '';
    g.d1Cross = 'Army Copter ' + sn + ', Cross ______ at or above ________, Cleared ' + A.apr + ' Approach';
    g.d1Cancel = 'Army Copter ' + sn + ', Report cancellation of IFR this freq or with FSS(Name if known).  Change to advisory freq approved.';
    g.d1Tower = 'Contact Tower on ________(freq).  (Then when on Tower:) Army Copter ' + sn + ', ' + AN + ' Tower,  RWY ' + A.rwy + ' (MIL ATC: Wind ' + A.wind + ' @ ' + A.ws + ' ), Cleared to Land.';
    g.missed1 = 'Army Copter ' + sn + ', CONTACT ______________ APP CON ON ______.';
    g.missed2 = 'Army Copter ' + sn + ', _______________ App, RADAR Contact, Climb and Maintain ________, Say Intentions';
    g.missed3 = 'Army Copter ' + sn + ', I Have your Request, EXPECT FURTHER CLEARANCE ________.';
    g.toD2 = 'Army Copter ' + sn + ', Cleared to ' + BN + ' Airport, (VIA or DIRECT)  ________________(routing), Maintain 4000.';
    g.handoff2 = 'Army Copter ' + sn + ', CONTACT _________________ on __________ ';
    g.d2Wx = out.d2Wx[B.wx] || '';
    g.d2Info = 'Army Copter ' + sn + ', Expect ' + B.apr + ' approach.  Wind ' + B.wind + ' @ ' + B.ws + ' Ceiling ' + B.ceil + ' ' + B.ct + ' Vis ' + B.vis + ' Altimeter ' + B.altim + '.';
    g.d2Clr = ac2[B.ac] || '';
    g.d2Cross = 'Army Copter ' + sn + ', Cross __(fix)__ at or above __(alt)__, Cleared ' + B.apr + ' Approach';
    g.d2Cancel = g.d1Cancel.replace('Army Copter ' + sn + ', ', 'Army Copter ' + sn + ', ');
    g.d2ContactTwr = 'Army Copter ' + sn + ', Contact Tower on ___________(freq).';
    g.d2Tower = 'Army Copter ' + sn + ', ' + BN + ' TOWER, RWY ' + B.rwy + ' (MIL: WIND ' + B.wind + ' @ ' + B.ws + ') CLEARED TO LAND';
    g.simTemp = 'Temperature in Fahrenheit for SIM setup = ' + s(M.fToC(D.temp)) + '*';
    g.cockpit = 'COCKPIT # __' + m.device + '__';
    return out;
  };

  /* ---------- AMR page ---------- */
  M.amr = function (m, env) {
    const ac = env.acft(m.acft) || {}, A = m.amr, F = m.f175;
    const nmid = x => M.aname(x, env) + ' (' + x.id + ')';
    const I1 = nmid(m.dep), I2 = nmid(m.d1), I3 = nmid(m.d2);
    const etd = s(F.etd).replace(/\D/g, '').padStart(4, '0').slice(-4);
    const hold = s(F.hold);
    const o = {};
    o.mission = A.missionTxt || ('Depart ' + I1 + ' NLT ' + etd + ' in order to ' + A.purpose + ' ' + A.who + ' at ' + I2 + ' then proceed to ' + I3 + ' to refuel and remain over night for follow-on missions.');
    o.special = A.specialTxt || ('Allow ' + hold + ' minutes on the ground at ' + I2 + '.  If weather prevents landing at ' + I2 + ' continue to ' + I3 + ' for the follow-on mission anyway.  Conduct the first leg of flight using ' + A.nav1 + ' navigation and the second leg of flight using ' + A.nav2 + ' navigation.');
    o.intent = A.intent;
    o.aircraft = m.acft;
    o.design = s(ac.mil) + ' / ' + s(ac.td);
    o.serial = M.serNum(m, env);
    o.gw = s(ac.gw);
    o.fuel = s(ac.fob) + ' ' + s(ac.unit) + ' approx. (3+00) hours';
    o.wb = A.wb; o.unit = A.unit;
    o.hover = s(ac.hover) + ' TQ'; o.climb = s(ac.climb) + ' TQ';
    o.cruise = s(ac.cr90) + ' TQ @ 90kts, ' + s(ac.cr110) + ' TQ @ 110kts';
    o.burn = s(ac.burn) + ' / ' + s(ac.unit) + ' Per Hour';
    o.tas = s(F.tas) + ' KIAS (increase 1 KIAS per 1000 feet MSL)';
    o.pax = A.pax;
    o.crew = A.crew.map((c, i) => ({ name: c.name, rank: c.rank, role: c.role, org: (i < 2) ? s(A.unit) + ' (' + c.role + ')' : s(c.org) }));
    o.remarks = A.remarks;
    const a1 = env.ap(m.d1.id), a2 = env.ap(m.d2.id), v1 = a1 && a1.v || '', v2 = a2 && a2.v || '';
    o.iap = v1 === v2 ? v1 : v1 + ' , ' + v2;
    o.ela = A.ela; o.sect = A.sect;
    o.I1 = I1; o.I2 = I2; o.I3 = I3;
    return o;
  };

  /* ---------- DD 175 ---------- */
  M.dd175 = function (m, env) {
    const ac = env.acft(m.acft) || {}, F = m.f175, burn = num(ac.burn);
    const alt1 = num(F.alt1), alt2 = num(F.alt2);
    const tas1 = num(F.tas) + alt1 * 0.1, tas2 = num(F.tas) + alt2 * 0.1;      // C5 = ACFT_SPEED + VALUE(I5)*0.1
    const d1 = num(F.v1) + num(F.x1), d2 = num(F.v2) + num(F.x2), d3 = num(F.v3) + num(F.x3);
    const ete1 = (d1 / tas1 * 60 + num(F.w1)), ete2 = (d2 / tas2 * 60 + num(F.w2)), ete3 = (d3 / tas2 * 60 + num(F.w3));
    const etd1 = M.parseHHMM(F.etd), hold = num(F.hold);
    const etd2 = etd1 + Math.floor(ete1 + 1e-6) + hold;                      // G14 = G12 + S12 + HoldTime  (S12 is shown truncated to the minute)
    const q16 = (roundUp(d1) / tas1 + (num(F.w1) + 30) / 60) * burn;
    const r16 = (roundUp(d2) / tas2 + (num(F.w2) + 30) / 60) * burn;
    const s16 = ((roundUp(d1) / tas1 + (num(F.w1) + 30 + hold) / 60) + d3 / tas2 + num(F.w3) / 60) * burn;
    const unit = s(ac.unit);
    const noAlt = !!m.noAlt;
    const alt2on = !!(m.alt2 && m.alt2.id);
    const ser = M.serNum(m, env), A = m.amr;
    const dev = env.device(m.device) || {};
    const wxVoid = M.hhmm(M.parseHHMM(m.f1751.briefTime) + 90);
    const r = {
      date: m.date, callsign: 'R' + M.last5(ser), design: s(ac.mil) + ' / ' + s(ac.td),
      leg1: { rules: F.rules, tas: Math.round(tas1 * 100) / 100, dep: m.dep.id, etd: M.hhmm(etd1), alt: F.alt1, route: s(F.route1) + '  ' + m.d1.id, to: m.d1.id, ete: M.hplusmm(ete1) },
      mid: { k: '\u00AE  ' + m.d1.id, l: 'D 0+' + F.hold + '  ' + m.d2.id },
      leg2: { rules: F.rules, tas: Math.round(tas2 * 100) / 100, dep: m.d1.id, etd: M.hhmm(etd2), alt: F.alt2, route: s(F.termRoute) !== '' ? F.termRoute : F.route2, to: m.d2.id, ete: M.hplusmm(ete2),
              remarks: (m.alt2 && m.alt2.id) ? '(' + m.alt2.id + '   ' + m.alt2.time + ')' : '' },
      remarksLine: 'REMARKS           ' + m.d2.id + ' -S, R',
      fuelTxt: ['1st Leg   ' + unit + ', REQ and 30 min. Res.', '2nd Leg   ' + unit + ', REQ: incls, 30 min Res.', '1st Leg and to Alt. ' + unit + ', REQ, inclds. Holding and 30 min. Res.'],
      fuel: [Math.round(q16), Math.round(r16), Math.round(s16)], unit,
      fob: F.fob, alt: noAlt ? '' : m.d2.id, eteAlt: noAlt ? '' : M.hplusmm(ete3),
      weather: wxVoid + ' / ' + s(m.f1751.init), wb: A.wb, serialUnit: 'R-' + s(dev.n || '12345') + ' / ' + s(A.unit),
      eteMin: ete1, ete2Min: ete2, etd1, etd2, eta1: etd1 + Math.floor(ete1 + 1e-6), eta2: etd2 + Math.floor(ete2 + 1e-6)
    };
    const people = [];
    const c = A.crew;
    if (c[0].name) people.push({ duty: 'PILOT IN COMMAND', name: c[0].name, rank: c[0].rank, org: s(A.unit) });
    else people.push({ duty: 'PILOT IN COMMAND', name: '', rank: '', org: '' });
    if (c[1].name) people.push({ duty: 'PI', name: c[1].name, rank: c[1].rank, org: s(A.unit) });
    if (c[2].name) people.push({ duty: 'OR', name: c[2].name, rank: c[2].rank, org: s(c[2].org) });
    if (A.pax && A.pax.name && A.pax.name !== 'none') people.push({ duty: 'OR', name: A.pax.name, rank: A.pax.rank, org: A.pax.org });
    r.people = people;
    return r;
  };

  /* ---------- DD 175-1 ---------- */
  M.dd1751 = function (m, env) {
    const D = m.dep, A = m.d1, B = m.d2, F = m.f1751, ac = env.acft(m.acft) || {}, ser = M.serNum(m, env);
    const dd = M.dd175(m, env), aD = env.ap(D.id) || {}, aA = env.ap(A.id) || {}, aB = env.ap(B.id) || {};
    const depElev = num(aD.e);
    const pa = (alt, elev) => Math.round((29.92 - num(alt)) * 1000 + elev);
    const PA = pa(D.altim, depElev), T = num(D.temp);
    const DA = env.compat ? roundUp(PA + (120 * T + (PA / 1000 * 2 - 15))) : roundUp(PA + 120 * (T - (15 - 2 * PA / 1000)));   // workbook has misplaced parenthesis
    const o = {
      date: m.date, acft: s(ac.mil) + ' / ' + M.last5(ser), dep: D.id + '/' + M.hhmm(dd.etd1), rwyTemp: D.temp, dew: D.dp, tempDev: 'N/A',
      pa: PA, da: DA, sfcWind: D.wind + ' / ' + D.ws, climbWinds: D.wind + ' / ' + D.ws, climbLayer: F.climbLayer,
      remarks13: 'T/O WX: ' + D.id + ': ' + D.wind + ' / ' + D.ws + '  ' + D.vis + ' ' + D.ct + ' ' + D.ceil + ' ALTSG ' + D.altim,
      flWinds: F.fl + '    ' + D.wind + '/' + D.ws + '   /    ' + D.temp
    };
    // minimum ceiling default: lowest reported ceiling among the three airports
    const cs = [D, A, B].filter(x => /^\d{3}$/.test(s(x.ceil))).map(x => +x.ceil);
    o.minCeil = F.minCeil || (cs.length ? pad(Math.min.apply(null, cs), 3) + ' ENR' : '');
    // Part III rows - same row logic as the workbook (A35/A37/A39/A41)
    const mk = (id, kind, x, tempo) => {
      const dest = !tempo;
      return { id: tempo ? 'TEMPO' : id, label: tempo ? '-------/-------' : (id === A.id || id === B.id ? 'DEST/-------' : 'DEST/ALTN'),
               wind: tempo ? '' : x.wind + '/' + x.ws, vis: tempo ? x.tvis : x.vis, cloud: tempo ? x.tcl : x.ct + ' ' + x.ceil,
               altim: tempo ? '' : x.altim, temp: tempo ? '' : x.temp };
    };
    const rows = [];
    const r1 = mk(A.id, 0, A, false); rows.push(r1);
    let a37 = s(A.tvis) !== '' ? 'TEMPO' : B.id;
    if (a37 === 'TEMPO') {
      rows.push(mk(A.id, 0, A, true));
      rows.push(mk(B.id, 0, B, false));
      if (s(B.tvis) !== '') rows.push(mk(B.id, 0, B, true));
    } else {
      rows.push(mk(B.id, 0, B, false));
      if (s(B.tvis) !== '') rows.push(mk(B.id, 0, B, true));
    }
    const win = (c, dflt) => dflt;
    rows.forEach((r, i) => {
      const isB = r.id === B.id || (r.id === 'TEMPO' && rows[i - 1] && rows[i - 1].id === B.id);
      const eta = isB ? dd.eta2 : dd.eta1;
      const usr = isB ? [F.v2a, F.v2b] : [F.v1a, F.v1b];
      const tusr = isB ? [F.t2a, F.t2b] : [F.t1a, F.t1b];
      if (r.id === 'TEMPO') { r.from = tusr[0] || M.hhmm(eta - 15); r.to = tusr[1] || M.hhmm(eta + 15); }
      else { r.from = usr[0] || M.hhmm(eta - 60); r.to = usr[1] || M.hhmm(eta + 60); }
      if (r.id !== 'TEMPO') {
        const x = r.id === B.id ? B : A, ap2 = r.id === B.id ? aB : aA;
        r.pa = pa(x.altim, env.compat && r.id === A.id ? depElev : num(ap2.e));          // workbook uses the DEPARTURE elevation for dest 1 (bug)
      } else r.pa = '';
    });
    o.part3 = rows;
    o.wxVoid = M.hhmm(M.parseHHMM(F.briefTime) + 90);
    o.briefTime = F.briefTime;
    return o;
  };

  /* ---------- alternate advisory (1-2-3 style, 2000-3 at ETA +/-1 hr) ---------- */
  M.altAdvice = function (m, env) {
    const check = (x) => {
      const out = []; const v = M.parseVis(x.vis), c = /^\d{3}$/.test(s(x.ceil)) ? +x.ceil * 100 : null;
      const tv = s(x.tvis) ? M.parseVis(x.tvis) : null;
      let ok = true;
      if (c != null && c < 2000) { ok = false; out.push('ceiling ' + c + ' ft < 2000'); }
      if (v.sm != null && v.sm < 3) { ok = false; out.push('vis ' + s(x.vis) + ' < 3'); }
      if (tv && tv.sm != null && tv.sm < 3) { ok = false; out.push('TEMPO vis < 3'); }
      return { ok, why: out };
    };
    return { d1: check(m.d1), d2: check(m.d2) };
  };

  /* ---------- sun times (NOAA approximation), minutes UTC ---------- */
  M.sun = function (isoDate, lat, lon) {
    const rad = Math.PI / 180, d = new Date(isoDate + 'T12:00:00Z');
    const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (n - 1);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const at = zen => {
      const c = (Math.cos(zen * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
      if (c > 1 || c < -1) return null; const ha = Math.acos(c) / rad;
      return [720 - 4 * (lon + ha) - eqt, 720 - 4 * (lon - ha) - eqt];
    };
    const sr = at(90.833), ct = at(96);
    if (!sr || !ct) return null;
    const f = x => M.hhmm(((x % 1440) + 1440) % 1440) + 'Z';
    return { bmnt: f(ct[0]), sr: f(sr[0]), ss: f(sr[1]), eent: f(ct[1]) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M; else root.AMRModel = M;
})(typeof window !== 'undefined' ? window : globalThis);
