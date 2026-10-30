// v1.5 unit tests: VFR sectional (FAA NASR APT_BASE.CHART_NAME -> airport field 'sc'), de-duplicated in route order, auto on the AMR with a manual override.   node unit_sect.js
const fs = require('fs'), L = require('./forms_lib.js'), M = L.M;
let n = 0, f = 0;
const ok = (l, c, x) => { n++; if (!c) { f++; console.log('FAIL', l, x === undefined ? '' : String(x).slice(0, 400)); } };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' != ' + JSON.stringify(b));
const env = L.loadEnv('current', ['AZ', 'PA']);
const man = JSON.parse(fs.readFileSync(L.SITE + '/data/manifest.json'));
function mission(dep, d1, d2, alt, tweak) {
  const m = L.sampleMission(env); m.dep.id = dep; m.d1.id = d1; m.d2.id = d2; m.alt2 = { id: alt || '', time: '' }; m.amr.sect = ''; if (tweak) tweak(m); return m;
}
// ---- data (every cycle shipped carries the field)
ok('manifest schema >= 5 (forces a rebuild of already-shipped cycles)', man.schema >= 5, man.schema);
const sc = id => env.ap(id).sc;
eq('KRYN / KMZJ / KTUS / KDMA / KPHX are on PHOENIX', ['KRYN', 'KMZJ', 'KTUS', 'KDMA', 'KPHX'].map(sc), ['PHOENIX', 'PHOENIX', 'PHOENIX', 'PHOENIX', 'PHOENIX']);
eq('KMUI / KRDG / KLNS are on NEW YORK', ['KMUI', 'KRDG', 'KLNS'].map(sc), ['NEW YORK', 'NEW YORK', 'NEW YORK']);
eq('KMDT NEW YORK, KTHV + KPHL WASHINGTON, KPIT DETROIT', ['KMDT', 'KTHV', 'KPHL', 'KPIT'].map(sc), ['NEW YORK', 'WASHINGTON', 'WASHINGTON', 'DETROIT']);
eq('KGCN is on LAS VEGAS (not Phoenix)', sc('KGCN'), 'LAS VEGAS');
const all = Object.values(env.data), withSc = all.filter(a => a.sc);
ok('>= 90% of the AZ + PA facilities carry a sectional', withSc.length / all.length >= 0.9, withSc.length + '/' + all.length);
ok('every value is an upper-case chart name', withSc.every(a => /^[A-Z][A-Z .-]+$/.test(a.sc)));
const names = [...new Set(withSc.map(a => a.sc))].sort(); console.log('sectionals in AZ + PA data:', names.join(', '));
// ---- route logic
eq('KRYN -> KMZJ -> KTUS = PHOENIX only (deduped)', M.sectionals(mission('KRYN', 'KMZJ', 'KTUS'), env).list, ['PHOENIX']);
eq('KMUI -> KRDG -> KLNS = NEW YORK only', M.sectionals(mission('KMUI', 'KRDG', 'KLNS'), env).list, ['NEW YORK']);
eq('cross-sectional KMDT -> KTHV -> KPHL = NEW YORK, WASHINGTON (route order)', M.sectionals(mission('KMDT', 'KTHV', 'KPHL'), env).list, ['NEW YORK', 'WASHINGTON']);
eq('route order is kept: KTHV -> KMDT -> KPHL = WASHINGTON, NEW YORK', M.sectionals(mission('KTHV', 'KMDT', 'KPHL'), env).list, ['WASHINGTON', 'NEW YORK']);
eq('three sectionals: KPIT -> KMDT -> KPHL', M.sectionals(mission('KPIT', 'KMDT', 'KPHL'), env).list, ['DETROIT', 'NEW YORK', 'WASHINGTON']);
eq('AZ + PA in one mission: KTUS -> KMDT -> KPIT', M.sectionals(mission('KTUS', 'KMDT', 'KPIT'), env).list, ['PHOENIX', 'NEW YORK', 'DETROIT']);
eq('the alternate counts: KRYN -> KMZJ -> KTUS + alt KGCN adds LAS VEGAS', M.sectionals(mission('KRYN', 'KMZJ', 'KTUS', 'KGCN'), env).list, ['PHOENIX', 'LAS VEGAS']);
eq('empty alternate adds nothing', M.sectionals(mission('KRYN', 'KMZJ', 'KTUS', ''), env).list, ['PHOENIX']);
eq('unknown airport id is ignored, no crash', M.sectionals(mission('KRYN', 'XXXX', 'KTUS'), env).list, ['PHOENIX']);
const noSc = Object.keys(env.data).find(i => !env.data[i].sc);
const ms = M.sectionals(mission('KRYN', noSc, 'KTUS'), env); eq('airport with no chart in the FAA data: skipped, reported as missing', [ms.list, ms.missing], [['PHOENIX'], [noSc]]);
eq('text is the list joined with ", "', M.sectionals(mission('KMDT', 'KTHV', 'KPHL'), env).text, 'NEW YORK, WASHINGTON');
// ---- AMR output: auto + override
let o = M.amr(mission('KRYN', 'KMZJ', 'KTUS'), env); eq('AMR auto: PHOENIX', [o.sect, o.sectOverride, o.sectAuto], ['PHOENIX', false, 'PHOENIX']);
o = M.amr(mission('KMDT', 'KTHV', 'KPHL'), env); eq('AMR auto, cross-sectional', o.sect, 'NEW YORK, WASHINGTON');
o = M.amr(mission('KMDT', 'KTHV', 'KPHL', '', m => { m.amr.sect = 'NEW ORLEANS'; }), env); eq('manual override wins, auto still available', [o.sect, o.sectOverride, o.sectAuto], ['NEW ORLEANS', true, 'NEW YORK, WASHINGTON']);
o = M.amr(mission('KMDT', 'KTHV', 'KPHL', '', m => { m.amr.sect = '   '; }), env); eq('whitespace-only override counts as blank (= auto)', o.sect, 'NEW YORK, WASHINGTON');
o = M.amr(mission('KRYN', 'KMZJ', 'KTUS', '', m => { delete m.amr.sect; }), env); eq('old saved mission without amr.sect still works', o.sect, 'PHOENIX');
// Plan change -> AMR (single source of truth)
const m = mission('KRYN', 'KMZJ', 'KTUS'); eq('before', M.amr(m, env).sect, 'PHOENIX'); m.d1.id = 'KMDT'; eq('after changing destination 1 to KMDT', M.amr(m, env).sect, 'PHOENIX, NEW YORK');
// ---- other behaviour untouched
o = M.amr(mission('KRYN', 'KMZJ', 'KTUS'), env); ok('IAP line and ELA unchanged', typeof o.iap === 'string' && o.iap.length > 0 && o.ela === m.amr.ela);
// ---- v1.5 taxi wording: plain ground taxi, never hover / air taxi (towered and uncontrolled, every mission, every output text)
[['KRYN', 'KMZJ', 'KTUS'], ['KMZJ', 'KTUS', 'KRYN'], ['KMDT', 'KTHV', 'KPHL'], ['KTHV', 'KPHL', 'KMDT'], ['KMUI', 'KRDG', 'KLNS']].forEach(r => {
  ['AUTO', 'TWR', 'CTAF'].forEach(ctl => {
    const mm = mission(r[0], r[1], r[2], '', x => { x.dep.ctl = ctl; }), c = M.calls(mm, env), all = JSON.stringify(c.plain || c);
    ok('no hover / air taxi wording: ' + r.join('>') + ' dep=' + ctl, !/hover tax|air[ -]?tax/i.test(all) && !/hover tax|air[ -]?tax/i.test(M.plain(c.taxi || '')));
    const t = M.plain(c.plain.taxi);
    if (c.ctl.dep.towered) ok('towered taxi = "<call sign>, taxi to RWY xx via <taxi route>" (' + r[0] + ')', /^Army Copter \d+, taxi to RWY \S+ via _*taxi route_*\.$|^Army Copter \d+, taxi to RWY \S+ via .+\.$/.test(t), t);
    else ok('CTAF taxi advisory = "<field> traffic, <call sign>, taxiing to RWY xx via <taxi route>, <field> traffic" (' + r[0] + ')', /traffic, Army Copter \d+, taxiing to RWY \S+ via .+, .+ traffic\.$/.test(t), t);
  });
});
console.log(`${n} sectional checks, ${f} failures`); process.exit(f ? 1 : 0);
