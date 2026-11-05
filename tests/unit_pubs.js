// v1.6 unit tests: AMR Publications (IFR Enroute Low charts, d-TPP volumes + approach plates, textual ODPs), nationwide samples, blank-ID robustness.   node unit_pubs.js
const fs = require('fs'), L = require('./forms_lib.js'), M = L.M;
let n = 0, f = 0;
const ok = (l, c, x) => { n++; if (!c) { f++; console.log('FAIL', l, x === undefined ? '' : String(x).slice(0, 400)); } };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' != ' + JSON.stringify(b));
const man = JSON.parse(fs.readFileSync(L.SITE + '/data/manifest.json'));
const ALL = Object.keys(man.cycles.find(c => c.tpp === man.cycles[0].tpp).states);
const env = L.loadEnv('current', ALL);
const cyc = (() => { const c = man.cycles.find(x => new Date() >= new Date(x.from) && new Date() < new Date(x.to)) || man.cycles[0]; return c.tpp; })();
ALL.forEach(st => { Object.keys(JSON.parse(fs.readFileSync(`${L.SITE}/data/${cyc}/${st}.json`)).a).forEach(id => { if (env.data[id]) { env.data[id].id = id; env.data[id].st = st; } }); });
function mission(dep, d1, d2, alt, tweak) {
  const m = L.sampleMission(env); m.dep.id = dep; m.d1.id = d1; m.d2.id = d2; m.alt2 = { id: alt || '', time: '' }; m.amr.ela = ''; m.amr.iap = ''; m.amr.sect = '';
  [m.dep, m.d1, m.d2].forEach(x => { x.apr = ''; x.rwy = ''; x.sid = ''; x.trans = ''; x.star = ''; x.wx = 'AUTO'; }); if (tweak) tweak(m); return m;
}
ok('manifest schema >= 7', man.schema >= 7, man.schema);
ok('every state in the manifest loads', ALL.length >= 55, ALL.length);

// ---- ELA (IFR Enroute Low) from the FAA chart-footprint field 'el'
const all = Object.values(env.data), conus = all.filter(a => !/^(AK|HI|PR|VI|GU|AS|MP|UM|XX)$/.test(a.st || '') && a.p);
const noEl = ALL.filter(st => !/^(AK|HI|PR|VI|GU|AS|MP|UM|XX)$/.test(st)).reduce((t, st) => { const d = JSON.parse(fs.readFileSync(`${L.SITE}/data/${cyc}/${st}.json`)).a; return t + Object.values(d).filter(a => !(a.el && a.el.length)).length; }, 0);
eq('every continental-US airport lies inside at least one IFR Enroute Low chart footprint', noEl, 0);
eq('KRYN -> KMZJ -> KTUS = L-5', M.ela(mission('KRYN', 'KMZJ', 'KTUS'), env).list, ['L-5']);
ok('KMDT sits on L-29 / L-34', ['L-29', 'L-34'].every(c => env.ap('KMDT').el.includes(c)));
eq('KMDT -> KLNS (one chart covers both)', M.ela(mission('KMDT', 'KLNS', 'KMDT'), env).list.length, 1);
eq('KMDT -> KTHV -> KPHL needs a single chart (L-34 covers KPHL)', M.ela(mission('KMDT', 'KTHV', 'KPHL'), env).list, ['L-34']);
eq('cross-country KJFK -> KORD -> KDEN = L-34, L-28, L-10', M.ela(mission('KJFK', 'KORD', 'KDEN'), env).list, ['L-34', 'L-28', 'L-10']);
eq('the alternate counts: KRYN -> KMZJ -> KTUS + alt KGCN adds L-8', M.ela(mission('KRYN', 'KMZJ', 'KTUS', 'KGCN'), env).list, ['L-5', 'L-8']);
ok('Alaska uses its own AK L- charts', /^AK L-\d/.test(M.ela(mission('PANC', 'PAFA', 'PANC'), env).list[0]), JSON.stringify(M.ela(mission('PANC', 'PAFA', 'PANC'), env).list));
eq('Hawaii: no L-chart footprint -> empty + reported as missing (no guessing)', [M.ela(mission('PHNL', 'PHOG', 'PHNL'), env).text, M.ela(mission('PHNL', 'PHOG', 'PHNL'), env).missing], ['', ['PHNL', 'PHOG']]);
{ const e = M.ela(mission('KMDT', 'KLNS', 'KMDT'), env); ok('the list is minimal: no chart is listed when another chosen chart already covers every airport', e.list.every(c => Object.keys(e.per).some(id => e.per[id].includes(c) && !e.list.filter(x => x !== c).some(x => e.per[id].includes(x))))); }
// ---- AMR output: auto + override
{
  const m = mission('KRYN', 'KMZJ', 'KTUS'); let o = M.amr(m, env);
  eq('AMR ELA auto', [o.ela, o.elaOverride], ['L-5', false]);
  m.amr.ela = 'L-4, L-5'; o = M.amr(m, env); eq('AMR ELA override wins', [o.ela, o.elaOverride, o.elaAuto], ['L-4, L-5', true, 'L-5']);
  m.amr.ela = '   '; eq('blank (spaces) = auto again', M.amr(m, env).ela, 'L-5');
}
// ---- plates
{
  let m = mission('KRYN', 'KMZJ', 'KTUS'); eq('no approach picked -> the volume only', M.plates(m, env).text, 'SW-4');
  m = mission('KRYN', 'KRYN', 'KTUS', 'KGCN', x => { x.d1.apr = 'ILS OR LOC RWY 06R'; x.d2.apr = 'ILS OR LOC RWY 12'; });
  ok('KRYN has "ILS OR LOC RWY 06R" and KTUS has "ILS OR LOC RWY 12"', env.ap('KRYN').i.includes('ILS OR LOC RWY 06R') && env.ap('KTUS').i.includes('ILS OR LOC RWY 12'));
  eq('volume + the Plan\'s chosen plates, grouped (KGCN alt shares SW-4: volume only)', M.plates(m, env).text, 'SW-4: ILS OR LOC RWY 06R (KRYN), ILS OR LOC RWY 12 (KTUS)');
  eq('an alternate in another volume adds its volume only', M.plates(mission('KRYN', 'KRYN', 'KTUS', 'KMDT', x => { x.d1.apr = 'ILS OR LOC RWY 06R'; }), env).text, 'SW-4: ILS OR LOC RWY 06R (KRYN) \u2022 NE-4');
  const o = M.amr(m, env); eq('AMR IAP = auto', [o.iap, o.iapOverride], [M.plates(m, env).text, false]);
  m.amr.iap = 'SW-4 only'; eq('AMR IAP override', M.amr(m, env).iap, 'SW-4 only');
  m = mission('KMDT', 'KLNS', 'KMDT', '', x => { x.d1.apr = env.ap('KLNS').i[0]; x.d2.apr = env.ap('KMDT').i[0]; });
  eq('KMDT -> KLNS: one NE-4 group with both plates (dep = KMDT is the same airport as dest 2)', M.plates(m, env).vols, ['NE-4']);
  m = mission('KMDT', 'KTHV', 'KPHL'); eq('KMDT -> KTHV -> KPHL one volume', M.plates(m, env).vols, ['NE-4']);
  m = mission('KJFK', 'KORD', 'KDEN'); eq('KJFK -> KORD -> KDEN volumes in route order', M.plates(m, env).vols, ['NE-2', 'EC-3', 'SW-1']);
  const w = mission('KRYN', 'KMZJ', 'KTUS'); w.d1.apr = 'ILS OR LOC RWY 12'; eq('old AMR cell (workbook) is still available as iapLegacy', M.amr(w, env).iapLegacy, 'SW-4');
}
// ---- textual ODP (d-TPP Takeoff Minimums section) in the existing SID list
{
  const a = env.ap('KMUI'); eq('KMUI SID list (graphic DP only)', a.d, ['COPTER MUIR FOUR']);
  ok('KMUI also carries the textual ODP lines (rwy 7, rwy 25 and the two helipads)', a.o && a.o.length === 4 && /Rwy 7, climb on heading 070/.test(a.o[0]), JSON.stringify(a.o));
  const withO = all.filter(x => x.o && x.o.length); ok('>= 1000 airports have a textual ODP', withO.length >= 1000, withO.length);
  ok('every ODP line is short plain text', withO.every(x => x.o.length <= 8 && x.o.every(l => typeof l === 'string' && l.length <= 420 && !/DEPARTURE PROCEDURE:/i.test(l))));
  const m = mission('KMUI', 'KRDG', 'KLNS', '', x => { x.dep.sid = M.ODP_TXT; }); const c = M.calls(m, env);
  ok('scripts say "via the published obstacle departure procedure"', /via the published obstacle departure procedure, then as filed/.test(JSON.stringify(c)), '');
  const m2 = mission('KMUI', 'KRDG', 'KLNS', '', x => { x.dep.sid = 'COPTER MUIR FOUR'; }); ok('a real SID still scripts as before', /COPTER MUIR FOUR/.test(JSON.stringify(M.calls(m2, env))) && !/obstacle departure/.test(JSON.stringify(M.calls(m2, env))));
}
// ---- nationwide samples (every output builds; no exceptions; facilities resolve)
const SAMPLES = [['KJFK', 'KLGA', 'KEWR'], ['KORD', 'KMDW', 'KMKE'], ['KDEN', 'KAPA', 'KCOS'], ['KSEA', 'KBFI', 'KPDX'], ['PANC', 'PAFA', 'PANC'], ['PHNL', 'PHOG', 'PHNL'], ['KLAX', 'KSAN', 'KLAS'], ['KMIA', 'KFLL', 'KTPA'], ['KDFW', 'KIAH', 'KSAT'], ['KBOS', 'KPVD', 'KBDL'], ['TJSJ', 'TJSJ', 'TJSJ'], ['PGUM', 'PGUM', 'PGUM']];
SAMPLES.forEach(r => {
  const lbl = r.join('>'); let m; try {
    m = mission(...r); r.forEach(id => ok(lbl + ' ' + id + ' is in the data', !!env.ap(id)));
    const a = M.amr(m, env), c = M.calls(m, env), d = M.dd1801(m, env), d2 = M.dd1801C(m, env), w = M.dd1751(m, env);
    ok(lbl + ' AMR/scripts/DD 1801/1801-C/175-1 build', a && c && d && d2 && w);
    ok(lbl + ' AMR names every airfield', a.I1.includes(r[0]) && a.I2.includes(r[1]) && a.I3.includes(r[2]), a.I1 + a.I2 + a.I3);
    ok(lbl + ' has a d-TPP volume', M.plates(m, env).vols.length >= 1, M.plates(m, env).text);
  } catch (e) { ok(lbl + ' threw ' + e.stack.split('\n').slice(0, 3).join(' | '), false); }
});
// rural fields whose first contact after departure is Center (no approach control): nationwide sample
{
  const cand = Object.keys(env.data).filter(id => ['MT', 'WY', 'NV', 'ND', 'NM', 'ID', 'SD'].includes(env.data[id].st) && env.data[id].k === 'PU-A');
  const cen = cand.filter(id => { const h = M.handoff(mission(id, 'KDEN', 'KDEN'), 'dep', env, 'dep'); return h && h.fac && h.fac.kind === 'C'; });
  ok('there are rural fields that hand off to a Center provider', cen.length > 50, cen.length + ' of ' + cand.length);
  const id = cen.find(i => env.data[i].st === 'MT') || cen[0], m = mission(id, 'KBIL', 'KGTF'); let e1 = true, c;
  try { c = M.calls(m, env); M.dd1801(m, env); M.amr(m, env); M.ela(m, env); } catch (e) { e1 = e.message; }
  ok('Center-provider field ' + id + ' (' + env.data[id].st + ') builds every output', e1 === true, e1);
  ok('its first call goes to a Center', /Center/.test(JSON.stringify(c)), id);
  console.log('Center-provider sample:', id, env.data[id].n, env.data[id].st);
}
// ---- blank airports (first run before a state is chosen)
{
  const m = mission('', '', ''); let e = null; try { M.amr(m, env); M.calls(m, env); M.dd1801(m, env); M.dd1801C(m, env); M.dd1751(m, env); M.ela(m, env); M.plates(m, env); M.sectionals(m, env); M.flight(m, env); } catch (x) { e = x.stack.split('\n').slice(0, 3).join(' | '); }
  ok('a mission with blank airports builds every output without throwing', e === null, e);
  eq('blank airports -> empty publications', [M.amr(m, env).ela, M.amr(m, env).iap, M.amr(m, env).sect], ['', '', '']);
}
console.log(`unit_pubs: ${n - f}/${n} passed`); process.exit(f ? 1 : 0);
