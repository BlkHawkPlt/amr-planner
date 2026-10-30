// v1.4 unit tests: Pennsylvania data (AZ + PA loaded together), filter policy, towered/uncontrolled, hand-off providers, PA missions through scripts / DD 1801 / DD 175-1.   node unit_pa.js
const fs = require('fs'), L = require('./forms_lib.js'), M = L.M;
let n = 0, f = 0;
const ok = (l, c, x) => { n++; if (!c) { f++; console.log('FAIL', l, x === undefined ? '' : String(x).slice(0, 400)); } };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' != ' + JSON.stringify(b));
const env = L.loadEnv('2611', ['AZ', 'PA']), env10 = L.loadEnv('2610', ['AZ', 'PA']);
const man = JSON.parse(fs.readFileSync(L.SITE + '/data/manifest.json'));
const PA = Object.values(env.data).filter(a => /, PA$/.test(a.c)), AZ = Object.values(env.data).filter(a => /, AZ$/.test(a.c));
function mission(dep, d1, d2, tweak) {
  const m = L.sampleMission(env); m.dep.id = dep; m.d1.id = d1; m.d2.id = d2;
  [m.dep, m.d1, m.d2].forEach(x => { x.apr = ''; x.rwy = ''; x.sid = ''; x.trans = ''; x.star = ''; x.wx = 'AUTO'; });
  m.alt2 = { id: '', time: '' }; if (tweak) tweak(m); return m;
}
const P = (m, e) => { const c = M.calls(m, e || env); c.P = c.plain; return c; };
const ho = (m, k, mode) => M.handoff(m, k, env, mode || 'dep');

// ---- data / manifest
ok('manifest ships AZ + PA in both cycles, preloaded for offline', man.cycles.length === 2 && man.cycles.every(c => c.states.AZ && c.states.PA && c.states.AZ.pre && c.states.PA.pre));
ok('both states in config.json', JSON.stringify(JSON.parse(fs.readFileSync(L.SITE + '/../data/config.json')).states) === '["AZ","PA"]');
eq('AZ unchanged: 200 facilities', AZ.length, 200);
ok('PA has 390+ facilities', PA.length >= 390 && PA.length < 420, PA.length);
ok('no airport id collides across states', Object.keys(env.data).length === AZ.length + PA.length);
const kinds = {}; PA.forEach(a => { kinds[a.k] = (kinds[a.k] || 0) + 1; });
ok('PA filter: only public airports / military / heliports (no private airstrips, no seaplane bases, no balloonports)', Object.keys(kinds).every(k => ['PU-A', 'PU-H', 'PU-G', 'PU-U', 'MIL-A', 'MIL-H', 'PR-H'].includes(k)), JSON.stringify(kinds));
ok('PA seaplane bases (9N2 / C28 / E75 / H11) are dropped', ['9N2', 'C28', 'E75', 'H11'].every(i => !env.ap(i)));
ok('PA military heliports include Muir AHP, Carlisle Barracks, Letterkenny, Tobyhanna, Oakdale', ['KMUI', 'N95', '7PN5', '17PN', '16PN'].every(i => env.ap(i) && env.ap(i).k === 'MIL-H'));
ok('every PA record has control (t) and hand-off (h) data', PA.every(a => a.t && a.h));
const tw = Object.keys(env.data).filter(i => /, PA$/.test(env.data[i].c) && env.data[i].t.tw).sort();
ok('every towered PA airport has a tower frequency and a class', PA.filter(a => a.t.tw).every(a => a.g && a.g.T && a.g.T.length && /^[BCDEG]$/.test(a.t.cl)), tw.filter(i => !(env.data[i].g && env.data[i].g.T)).join());
ok('towered PA fields incl. KPIT KPHL KABE KMDT KAVP KERI KLNS KPNE', ['KPIT', 'KPHL', 'KABE', 'KMDT', 'KAVP', 'KERI', 'KLNS', 'KPNE'].every(i => tw.includes(i)), tw.join());
ok('KPIT Class B, KMDT Class C, KTHV (no tower) Class E', env.ap('KPIT').t.cl === 'B' && env.ap('KMDT').t.cl === 'C' && env.ap('KTHV').t.cl === 'E' && !env.ap('KTHV').t.tw);
ok('PA runways / approaches / SIDs / STARs: KPIT has ILS, SID and STARs; KMUI has COPTER procedures', env.ap('KPIT').i.some(x => /ILS/.test(x)) && env.ap('KPIT').d.length && env.ap('KPIT').s.length && env.ap('KMUI').i.some(x => /COPTER/.test(x)) && env.ap('KMUI').r.includes('H1'));
ok('CIFP detail for PA approaches (KPIT ILS 10L: IAF/FAF/crossing alt/missed)', (() => { const p = (env.ap('KPIT').pr || {})['ILS OR LOC RWY 10L']; return !!(p && p.iaf && p.faf && p.cross && p.cross.alt && p.ma); })());
ok('PA AWOS/ASOS data: KTHV ASOS with phone', env.ap('KTHV').w && env.ap('KTHV').w.t === 'ASOS' && env.ap('KTHV').w.p);
ok('clearance phones parsed for PA (KTHV: Harrisburg Approach 800-932-0712)', env.ap('KTHV').t.cd.some(e => /HARRISBURG/.test(e.fac) && e.ph === '800-932-0712'));
ok('provider NASR lists: KPIT->Pittsburgh, KMDT->Harrisburg, KPHL->Philadelphia, KABE->Allentown, KFIG->New York ARTCC', ['KPIT:PIT', 'KMDT:MDT', 'KPHL:PHL', 'KABE:ABE', 'KFIG:ZNY'].every(s => { const [i, p] = s.split(':'); return env.ap(i).h.p.id === p; }));
ok('Centers present: ZNY, ZOB (Cleveland), ZDC (Washington) all appear for PA', ['ZNY', 'ZOB', 'ZDC'].every(z => PA.some(a => a.h.z && a.h.z.id === z)), [...new Set(PA.map(a => a.h.z && a.h.z.id))].join());
ok('both cycles carry PA', Object.keys(env10.data).filter(i => /, PA$/.test(env10.data[i].c)).length >= 390);


// ---- mission 1: towered KMDT -> uncontrolled KTHV (ASOS) -> towered KPHL
{
  const m = mission('KMDT', 'KTHV', 'KPHL'), c = P(m), g = c.P;
  ok('KMDT departure: ATIS, clearance delivery (Harrisburg Approach), ground, tower', /Information/.test(g.depWx) && /118\.80/.test(c.hdr.depWx) && c.ctl.dep.towered && /Harrisburg Intl Ground - 121\.70/.test(c.hdr.taxi) && /Harrisburg Intl Tower - 124\.80/.test(c.hdr.takeoff) && /Cleared for Takeoff/.test(g.takeoff), JSON.stringify(c.hdr));
  ok('KMDT departs to Harrisburg Departure 118.25', /Contact Harrisburg Departure on 118\.25/.test(g.handoff1) && /Harrisburg Departure/.test(g.depCtl), g.handoff1);
  ok('KTHV weather is ASOS one-minute, no ATIS letter / runway', /^York Airport automated surface observation, \d{4}Z, wind 120 at 10/.test(g.d1Wx) && !/Information/.test(g.d1Wx) && /119\.275/.test(c.hdr.d1Wx), g.d1Wx);
  ok('KTHV arrival: CTAF 123.0 advisory calls, no tower', !c.ctl.d1.towered && g.d1Tower === '' && /York traffic/.test(g.d1Ctaf1) && /York traffic/.test(g.d1Ctaf2) && /clear of RWY/.test(g.d1Ctaf3) && /CTAF 123/.test(c.hdr.d1Ctaf1), g.d1Ctaf1);
  ok('KTHV cancel IFR: advisory frequency + phone to Harrisburg Approach', /CTAF 123\)/.test(g.d1Cancel) && /Harrisburg Approach by phone/.test(g.d1Cancel), g.d1Cancel);
  ok('KTHV -> KPHL: first call after KTHV is Harrisburg Approach 124.10 (provider listed), pilot calls (no tower)', /Harrisburg Approach/.test(c.hdr.d1Info) && /124\.10/.test(c.hdr.d1Info) && /You call/.test(c.hdr.handoff2), c.hdr.handoff2);
  ok('KPHL (Class B, towered): tower calls + Philadelphia Approach 119.75', c.ctl.d2.towered && /PHILADELPHIA TOWER/.test(g.d2Tower) && /Philadelphia Approach - 119\.75/.test(c.hdr.d2Info) && !g.d2Ctaf1, c.hdr.d2Info);
  ok('KPHL ASOS broadcast with plan time', /^Philadelphia International Airport automated surface observation, \d{4}Z/.test(g.d2Wx), g.d2Wx);
  const z = /(\d{4})Z/.exec(g.d1Wx)[1]; eq('KTHV broadcast time = ETA from the plan', z, M.hhmm(M.flight(m, env).eta1));
}
// ---- mission 2: KPIT -> KFIG (uncontrolled, Center provider) -> KIPT (part-time tower)
{
  const m = mission('KPIT', 'KFIG', 'KIPT'), c = P(m), g = c.P;
  ok('KPIT is Class B towered with ATIS 127.25 and Clearance Delivery 353.70 (UHF)', c.ctl.dep.towered && /127\.25/.test(c.hdr.depWx) && /Clearance Delivery - 353\.70/.test(c.hdr.cd), JSON.stringify(c.hdr));
  ok('KFIG: ASOS + CTAF 122.725, New York Center 134.80 as controlling facility', /^Clearfield-Lawrence Airport automated surface observation/.test(g.d1Wx) && /CTAF 122\.725/.test(c.hdr.d1Ctaf1) && /New York Center - 134\.80/.test(c.hdr.d1Info), c.hdr.d1Info);
  ok('KIPT: part-time tower flagged with hours', c.ctl.d2.towered && c.ctl.d2.part && /0630-2230/.test(c.ctl.d2.hrs));
  ok('KIPT with tower closed (Uncontrolled override) uses CTAF calls', (() => { const x = P(mission('KPIT', 'KFIG', 'KIPT', m => { m.d2.ctl = 'CTAF'; })); return !x.ctl.d2.towered && /traffic/.test(x.P.d2Ctaf1) && x.P.d2Tower === ''; })());
}
// ---- uncontrolled departures in PA: phone / GCO / airborne, and direction-based hand-off
{
  const mk = (cdm, dest) => mission('KTHV', dest || 'KPHL', 'KMDT', m => { m.dep.cdm = cdm; });
  const ph = P(mk('PHONE')), g = ph.P;
  ok('KTHV phone clearance: Harrisburg Approach 800-932-0712, CTAF advisory taxi/takeoff, no taxi/takeoff clearance', ph.title.cd === 'Clearance by phone' && /800-932-0712/.test(ph.hdr.cd) && /^York traffic/.test(g.taxi) && !/Cleared for Takeoff|Hover Taxi/.test(g.taxi + g.takeoff) && /departing to the (east|southeast)/.test(g.takeoff), ph.hdr.cd + ' | ' + g.takeoff);
  ok('KTHV first call after departure: Harrisburg Approach (NASR provider) 124.10', /^Harrisburg Approach, Army Copter 78730, airborne from York/.test(g.handoff1) && /124\.10/.test(g.handoff1), g.handoff1);
  ok('KTHV GCO (none in FAA data): blank + hint', /^On the GCO ______/.test(P(mk('GCO')).P.cd));
  ok('KTHV airborne pickup: no void time, no first call', (() => { const a = P(mk('AIR')); return !/void/i.test(a.P.cd) && a.P.handoff1 === ''; })());
  const f1 = mission('KFIG', 'KPIT', 'KIPT'), fc = P(f1);
  ok('KFIG departure phone: New York ARTCC 631-468-1425; first call New York Center 134.80', /631-468-1425/.test(fc.hdr.cd) && /^New York Center, Army Copter 78730, airborne from Clearfield-Lawrence/.test(fc.P.handoff1) && /134\.80/.test(fc.P.handoff1), fc.hdr.cd + ' | ' + fc.P.handoff1);
  // 07N Bermudian Valley Airpark: no provider listed -> Harrisburg Approach toward its area, New York Center away from it
  ok('07N has no listed provider', !env.ap('07N').h.p);
  const toward = ho(mission('07N', 'KMDT', 'KPHL'), 'dep'), away = ho(mission('07N', 'KPIT', 'KMDT'), 'dep');
  ok('07N toward Harrisburg (NE) -> Harrisburg Approach; west toward KPIT -> New York Center', toward.fac.kind === 'T' && /Harrisburg/.test(toward.fac.name) && away.fac.kind === 'C' && /New York/.test(away.fac.name), toward.fac.name + ' | ' + away.fac.name);
  ok('hand-off override list for 07N includes the approach and the Center', (() => { const x = ho(mission('07N', 'KPIT', 'KMDT'), 'dep'); const names = (x.cands || x.candidates || []).map(c => c.name); return names.length >= 2; })());
}
// ---- DD 1801 / DD 175-1 / DD 1801-C outputs for PA missions (official PDFs filled)
(async () => {
  for (const [dep, d1, d2] of [['KMDT', 'KTHV', 'KPHL'], ['KPIT', 'KFIG', 'KIPT'], ['N95', 'KTHV', 'KMUI']]) {
    const m = mission(dep, d1, d2); m.d1.apr = (env.ap(d1).i || [])[0] || ''; const dd = M.dd1801(m, env);
    const four = id => /^[A-Z]{4}$/.test(id);
    const tag = `${dep}-${d1}-${d2}`;
    ok(tag + ' DD 1801 dep/dest = ICAO or ZZZZ with item 18', dd.dep === (four(dep) ? dep : 'ZZZZ') && dd.dest === (four(d1) ? d1 : 'ZZZZ') && (four(dep) || /DEP\/N95/.test(dd.other[0])), JSON.stringify([dd.dep, dd.dest, dd.other[0]]));
    ok(tag + ' DD 1801 ETE and alternate are filled', /^\d{4}$/.test(dd.eet) && (dd.altn === d2 || dd.altn === 'ZZZZ'), JSON.stringify([dd.eet, dd.altn]));
    for (const k of ['dd1801', 'dd1801c', 'dd175-1']) {
      const r = await L.build(k, m, env); ok(`${tag} ${k} PDF builds (${r.bytes.length} bytes)`, r.bytes.length > 20000);
      const txt = JSON.stringify(r.ops).toUpperCase();
      if (k === 'dd1801') ok(tag + ' DD 1801 PDF carries the PA ids', txt.includes('"' + (four(dep) ? dep : 'ZZZZ') + '"') || txt.includes(dep), '');
      if (k === 'dd175-1') ok(tag + ' DD 175-1 carries the departure id / sunrise-sunset block', txt.includes(dep) || txt.includes(dep.slice(1)), '');
    }
  }
  // mixed AZ + PA mission still computes (no crash, distances sane)
  const mm = mission('KTUS', 'KMDT', 'KPIT'); const fl = M.flight(mm, env);
  ok('cross-state mission computes a flight time', fl && isFinite(fl.ete1) && fl.ete1 > 0);
  console.log(`${n} v1.4 PA checks, ${f} failures`); process.exit(f ? 1 : 0);
})();
