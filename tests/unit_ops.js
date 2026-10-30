// v1.3 unit tests: towered vs uncontrolled, AWOS/ASOS broadcast wording, clearance modes, CTAF calls, hand-off by direction, saved-mission migration.
// Full missions: KRYN->KMZJ(Pinal Airpark)->KTUS, KMZJ south (KTUS) and north (KCGZ / KPHX), P08, and a towered->towered mission.   node unit_ops.js
const L = require('./forms_lib.js'), M = L.M;
let n = 0, f = 0;
const ok = (l, c, x) => { n++; if (!c) { f++; console.log('FAIL', l, x === undefined ? '' : String(x).slice(0, 400)); } };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' != ' + JSON.stringify(b));
const env = L.loadEnv(), env10 = L.loadEnv('other');
function mission(dep, d1, d2, tweak) {
  const m = L.sampleMission(env); m.dep.id = dep; m.d1.id = d1; m.d2.id = d2;
  [m.dep, m.d1, m.d2].forEach(x => { x.apr = ''; x.rwy = ''; x.sid = ''; x.trans = ''; x.star = ''; x.wx = 'AUTO'; });
  m.alt2 = { id: '', time: '' }; if (tweak) tweak(m); return m;
}
const P = (m, e) => { const c = M.calls(m, e || env); c.P = c.plain; return c; };

// ---- data: every airport carries control data; towered ones have a tower frequency; hand-off candidates exist
const A = Object.values(env.data);
ok('every airport has control data (t) and hand-off data (h)', A.every(a => a.t && a.h), A.filter(a => !(a.t && a.h)).length);
ok('both cycles carry it', Object.values(env10.data).every(a => a.t && a.h));
ok('towered airports in data have a tower frequency', A.filter(a => a.t.tw).every(a => a.g && a.g.T && a.g.T.length), A.filter(a => a.t.tw && !(a.g && a.g.T && a.g.T.length)).map(a => a.id).join());
ok('every towered airport carries an airspace class', A.filter(a => a.t.tw).every(a => /^[BCDEG]?$/.test(a.t.cl)));
ok('uncontrolled airports mostly list a CTAF or UNICOM', A.filter(a => !a.t.tw && a.k !== 'H').length > 0 && A.filter(a => !a.t.tw && a.g && ((a.g.F && a.g.F.length) || (a.g.U && a.g.U.length))).length > 20);
ok('part-time towers are flagged with hours', A.filter(a => a.t.tw && a.t.pt).every(a => a.t.hr), '');
ok('every airport has at least one weather-source answer (ATIS/AWOS/ASOS)', A.every(a => ['ATIS', 'AWOS', 'ASOS'].includes(M.wxSource({ wx: 'AUTO' }, a).src)));

// ---- ctlOf
const ctl = (id, ov) => M.ctlOf({ id, ctl: ov || 'AUTO' }, env.ap(id));
ok('KTUS towered Class C', ctl('KTUS').towered && ctl('KTUS').cls === 'C' && /Towered/.test(ctl('KTUS').text));
ok('KRYN towered, part-time flagged', ctl('KRYN').towered && ctl('KRYN').part && /0600-2000/.test(ctl('KRYN').hrs), JSON.stringify(ctl('KRYN')));
ok('KMZJ (Pinal Airpark) uncontrolled with CTAF 123.05', !ctl('KMZJ').towered && ctl('KMZJ').adv.v === '123.05' && /CTAF 123.05/.test(ctl('KMZJ').text), ctl('KMZJ').text);
ok('KMZJ has a clearance phone from FAA data (Tucson Approach)', ctl('KMZJ').cd.some(e => /TUCSON/.test(e.fac) && /^520-/.test(e.ph)), JSON.stringify(ctl('KMZJ').cd));
ok('override: force KTUS uncontrolled / KMZJ towered', !ctl('KTUS', 'CTAF').towered && ctl('KMZJ', 'TWR').towered && !ctl('KTUS', 'CTAF').auto);
ok('unknown airport defaults to towered (manual override available)', M.ctlOf({ id: 'ZZZZ' }, null).towered === true && M.ctlOf({ id: 'ZZZZ', ctl: 'CTAF' }, null).towered === false);

// ---- hand-off facility by direction
const ho = (m, k, mode) => M.handoff(m, k, env, mode || 'dep');
{
  const s = mission('KMZJ', 'KTUS', 'KRYN'), nn = mission('KMZJ', 'KCGZ', 'KPHX'), n2 = mission('KMZJ', 'KPHX', 'KCGZ');
  const hs = ho(s, 'dep'), hn = ho(nn, 'dep'), h2 = ho(n2, 'dep');
  ok('KMZJ south toward KTUS -> Tucson Approach', hs.fac.kind === 'T' && hs.fac.call === 'Tucson' && !hs.towered && hs.course > 90 && hs.course < 200, JSON.stringify([hs.fac.name, hs.course, hs.why]));
  ok('KMZJ north toward KCGZ -> Albuquerque Center', hn.fac.kind === 'C' && /Albuquerque/.test(hn.fac.name) && hn.course > 270, JSON.stringify([hn.fac.name, hn.course, hn.why]));
  ok('KMZJ north toward KPHX -> Albuquerque Center', h2.fac.kind === 'C' && /Albuquerque/.test(h2.fac.name), h2.fac.name);
  ok('hand-off explains why and lists candidates incl. the Center', hs.why.length > 20 && hs.cands.length >= 2 && hs.cands.some(c => c.kind === 'C') && hs.cands.some(c => c.kind === 'T'), JSON.stringify(hs.cands.map(c => c.name)));
  ok('hand-off facility has a frequency', hs.fac.f.txt && hn.fac.f.txt, hs.fac.f.txt + ' | ' + hn.fac.f.txt);
  // override
  const ov = mission('KMZJ', 'KTUS', 'KRYN', m => { m.dep.ho = hn.fac.id; });
  eq('override picks the chosen candidate even against the course', ho(ov, 'dep').fac.id, hn.fac.id);
  ok('override reported as manual', !ho(ov, 'dep').auto && /manually/.test(ho(ov, 'dep').why));
  const bad = mission('KMZJ', 'KTUS', 'KRYN', m => { m.dep.ho = 'NOPE'; });
  eq('unknown override falls back to auto', ho(bad, 'dep').fac.id, hs.fac.id);
  // P08 (Coolidge): NASR names Albuquerque Center as its provider in both directions
  const p1 = mission('P08', 'KTUS', 'KRYN'), p2 = mission('P08', 'KCGZ', 'KPHX');
  ok('P08 provider from NASR (both directions)', /Albuquerque/.test(ho(p1, 'dep').fac.name) && /Albuquerque/.test(ho(p2, 'dep').fac.name) && /lists/.test(ho(p1, 'dep').why), ho(p1, 'dep').why);
  // towered -> towered
  const tt = mission('KTUS', 'KRYN', 'KDMA');
  ok('towered departure: KTUS departs to its own approach control', ho(tt, 'dep').towered && ho(tt, 'dep').fac.call === 'Tucson');
  // arrival into KMZJ from the east/south uses Tucson
  const arr = M.handoff(mission('KRYN', 'KMZJ', 'KTUS'), 'd1', env, 'arr');
  ok('arrival at KMZJ from KRYN served by Tucson Approach', arr.fac.call === 'Tucson' && arr.course > 90 && arr.course < 270, JSON.stringify([arr.fac.name, arr.course]));
}

// ---- full mission KRYN -> KMZJ -> KTUS
{
  const m = mission('KRYN', 'KMZJ', 'KTUS', m => { m.d1.apr = ''; });
  const c = P(m), g = c.P;
  ok('KRYN departure is towered: ATIS/clearance/ground/tower flow unchanged', c.ctl.dep.towered && /Clearance delivery/.test(c.title.cd) && /Ryan Ground/.test(c.hdr.taxi) && /Ryan Tower/.test(c.hdr.takeoff) && /Cleared for Takeoff/.test(g.takeoff) && /Hover Taxi/.test(g.taxi), JSON.stringify(c.title));
  ok('KRYN weather is ATIS with info letter', /Information/.test(g.depWx) && /133.35/.test(c.hdr.depWx));
  ok('Pinal AWOS broadcast: airport name, automated weather, Zulu time from the plan, no info letter / runway in use', /^Pinal Airpark automated weather, \d{4}Z, wind 120 at 10, visibility /.test(g.d1Wx) && !/Information|info letter/i.test(g.d1Wx) && /altimeter 29\.94/.test(g.d1Wx), g.d1Wx);
  ok('AWOS broadcast notes the repeat after the altimeter, with no RWY in use', /altimeter 29\.94\.\s+\(repeats/.test(g.d1Wx) && !/Runway|RWY/.test(g.d1Wx));
  const z = /(\d{4})Z/.exec(g.d1Wx)[1]; eq('broadcast time = destination ETA from the plan', z, M.hhmm(M.flight(m, env).eta1));
  ok('KMZJ arrival: no tower call, CTAF advisory calls instead', g.d1Tower === '' && /Pinal Airpark traffic/.test(g.d1Ctaf1) && /Pinal Airpark traffic/.test(g.d1Ctaf2) && /clear of RWY/.test(g.d1Ctaf3) && /CTAF 123.05/.test(c.hdr.d1Ctaf1), g.d1Ctaf1);
  ok('inbound position report uses the direction from the previous point', /miles south/.test(g.d1Ctaf1) || /miles (southeast|southwest|east|west)/.test(g.d1Ctaf1), g.d1Ctaf1);
  ok('KTUS (towered) keeps tower calls, no CTAF calls', c.ctl.d2.towered && /TUCSON TOWER/.test(g.d2Tower) && !g.d2Ctaf1 && /Contact Tucson Tower/.test(g.d2ContactTwr));
  ok('d1 cancel IFR mentions CTAF and a phone fallback', /CTAF 123\.05/.test(g.d1Cancel) && /by phone/.test(g.d1Cancel));
  ok('KMZJ departure from KRYN: Tucson handoff, Pinal approach facility = Tucson Approach', /Tucson Approach/.test(g.missed1));
}

// ---- uncontrolled departure KMZJ south: phone / GCO / airborne pickup
{
  const mk = (cdm, ex) => mission('KMZJ', 'KTUS', 'KRYN', m => { m.dep.cdm = cdm; if (ex) ex(m); });
  const ph = P(mk('PHONE')), g = ph.P;
  ok('uncontrolled departure: title = clearance by phone, phone from FAA data', ph.title.cd === 'Clearance by phone' && /520-829-6121/.test(ph.hdr.cd) && /Tucson Approach/.test(ph.hdr.cd) && /^Call Tucson Approach on 520-829-6121/.test(g.cd), ph.hdr.cd + ' | ' + g.cd);
  ok('phone clearance text carries void time / NLT / squawk / freq', /Clearance void if not off by/.test(g.cd) && /Squawk/.test(g.cd) && /Departure frequency 119\.40/.test(g.cd), g.cd);
  ok('no taxi / takeoff clearance: CTAF advisory calls only', /^Pinal Airpark traffic/.test(g.taxi) && /^Pinal Airpark traffic/.test(g.takeoff) && !/Cleared for Takeoff|Hover Taxi/.test(g.taxi + g.takeoff) && /no taxi clearance/.test(ph.hdr.taxi) && /no takeoff clearance/.test(ph.hdr.takeoff) && /123\.05/.test(ph.hdr.taxi), g.taxi + ' / ' + g.takeoff);
  ok('takeoff advisory announces the departure direction toward the next point (southeast)', /departing to the southeast/.test(g.takeoff), g.takeoff);
  ok('first call after departure is made by the pilot to Tucson Approach', /^Tucson Approach, Army Copter 78730, airborne from Pinal Airpark/.test(g.handoff1) && /you call Tucson Approach/i.test(ph.hdr.handoff1), g.handoff1);
  ok('phone override replaces the FAA number', /555-0100/.test(P(mk('PHONE', m => { m.dep.cdPh = '555-0100'; })).P.cd));
  const gc = P(mk('GCO')), gg = gc.P;
  ok('GCO clearance: radio via GCO, no GCO frequency in FAA data -> blank + hint', gc.title.cd === 'Clearance by GCO (radio)' && /^On the GCO ______/.test(gg.cd) && /enter it on the Plan tab/.test(gc.hdr.cd), gg.cd + ' | ' + gc.hdr.cd);
  ok('GCO frequency from the Plan fills the script', /^On the GCO 122\.7 /.test(P(mk('GCO', m => { m.dep.gcoF = '122.7'; })).P.cd) && /GCO 122\.7/.test(P(mk('GCO', m => { m.dep.gcoF = '122.7'; })).hdr.cd));
  const ap = P(mk('AIR')), ag = ap.P;
  ok('airborne pickup: clearance given after departure, no void/NLT, first call skipped', ap.title.cd === 'Clearance - airborne pickup' && !/void/i.test(ag.cd) && ag.handoff1 === '', ag.cd);
  ok('same plan, towered departure ignores the uncontrolled clearance method', P(mission('KRYN', 'KMZJ', 'KTUS', m => { m.dep.cdm = 'GCO'; })).title.cd === 'Clearance delivery (ATC)');
  ok('forcing KMZJ towered (manual) restores the tower flow with blanks', /Clearance delivery/.test(P(mk('GCO', m => { m.dep.ctl = 'TWR'; })).title.cd) && /Cleared for Takeoff/.test(P(mk('GCO', m => { m.dep.ctl = 'TWR'; })).P.takeoff));
  ok('forcing KRYN uncontrolled (tower closed) gives CTAF calls', /Ryan traffic|Ryan Field traffic|Ryan Fld traffic/.test(P(mission('KRYN', 'KTUS', 'KDMA', m => { m.dep.ctl = 'CTAF'; })).P.takeoff));
}

// ---- KMZJ north (KCGZ) : center first, then approach
{
  const c = P(mission('KMZJ', 'KCGZ', 'KPHX')), g = c.P;
  ok('north departure: first call to Albuquerque Center', /^Albuquerque Center, Army Copter 78730, airborne/.test(g.handoff1) && /Albuquerque Center/.test(g.depCtl) && /125\.40/.test(g.handoff1), g.handoff1);
  ok('north departure: takeoff direction northwest', /departing to the northwest/.test(g.takeoff), g.takeoff);
  ok('KCGZ and KPHX flow stays consistent (CTAF or tower as the data says)', c.ctl.d1.towered === !!env.ap('KCGZ').t.tw && c.ctl.d2.towered === !!env.ap('KPHX').t.tw);
  const so = P(mission('KMZJ', 'KTUS', 'KRYN')).P;
  ok('south vs north: different first facility', /Tucson Approach/.test(so.handoff1) && /Albuquerque Center/.test(g.handoff1));
}

// ---- towered -> towered
{
  const c = P(mission('KTUS', 'KRYN', 'KDMA')), g = c.P;
  ok('towered->towered: all tower calls, no CTAF anywhere', c.ctl.dep.towered && c.ctl.d1.towered && !g.d1Ctaf1 && !g.d2Ctaf1 && /Cleared for Takeoff/.test(g.takeoff) && /Tucson Departure/.test(g.handoff1) && /Ryan/.test(g.d1Tower));
  ok('towered->towered: hand-off chain has frequencies', /on \d{3}\.\d+/.test(g.handoff1) && /on \d{3}\.\d+/.test(g.handoff2), g.handoff1 + ' | ' + g.handoff2);
  const cp = P(mission('KTUS', 'KPHX', 'KFFZ')).P;
  ok('TUS->PHX: Center step then Phoenix Approach', /Albuquerque Center/.test(cp.contact) && /Phoenix Approach/.test(cp.toApp1), cp.contact + ' | ' + cp.toApp1);
}

// ---- migration
{
  const r = M.migrate({ acft: 'TH-67', device: 'GOLD 2' });
  ok('TH-67 -> UH-72, GOLD 2 -> tail 78724', r.m.acft === 'UH-72' && r.m.device === '78724' && r.notes.length === 2, JSON.stringify(r));
  const r2 = M.migrate({ acft: 'UH-72', device: 'BLUE 3' });
  ok('TH-67 device tail not carried over', r2.m.device === '78724' && /TH-67/.test(r2.notes[0]));
  eq('UH-60A -> UH-60L', M.migrate({ acft: 'UH-60A' }).m.acft, 'UH-60L');
  ok('UH-60M kept, colour device converted', (() => { const x = M.migrate({ acft: 'UH-60M', device: 'RED 2' }); return x.m.acft === 'UH-60M' && x.m.device === '78730'; })());
  ok('f175 -> fp still works and a new-format mission is untouched', M.migrate({ f175: { etd: '2100' } }).m.fp.etd === '2100' && M.migrate({ acft: 'UH-72', device: '78730' }).notes.length === 0);
  ok('no colour labels or TH-67 left in the data', !env.static.devices.some(d => /[A-Z]{3,}/.test(d.device)) && env.static.acft.map(a => a.design).join() === 'UH-72,UH-60L,UH-60M' && !JSON.stringify(env.static).includes('TH-67'));
  ok('serial number from tail / typed serial', M.serNum({ device: '78730' }, env) === 'R-78730' && M.serNum({ device: '87-24650' }, env) === '87-24650' && M.serNum({ device: '' }, env) === '99-12345');
  const d = M.defaultMission('2026-10-28'); ok('defaults: KRYN is not forced, tail 78724, control AUTO', d.device === '78724' && d.dep.ctl === 'AUTO' && d.dep.cdm === 'PHONE' && d.dep.ho === 'AUTO' && d.dep.id === '02AZ');
}

console.log(n + ' v1.3 checks, ' + f + ' failures'); process.exit(f ? 1 : 0);
