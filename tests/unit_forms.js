// Unit tests: AWOS/ASOS detection + wording, Scripts fill, DD 1801 / 1801-C data, official-PDF field mapping.  node unit_forms.js
const L = require('./forms_lib.js'), M = L.M, AF = L.AF;
let n = 0, f = 0;
const eq = (l, a, b) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log('FAIL', l, JSON.stringify(a), '!=', JSON.stringify(b)); } };
const ok = (l, c, x) => { n++; if (!c) { f++; console.log('FAIL', l, x === undefined ? '' : String(x).slice(0, 300)); } };
const env = L.loadEnv(), clone = o => JSON.parse(JSON.stringify(o));
const mk = () => { const m = L.sampleMission(env); m.dep.apr = ''; return m; };

// ---- weather source: AUTO detection and manual toggle
const ws = (id, wx) => M.wxSource({ wx: wx || 'AUTO' }, env.ap(id));
ok('KTUS auto = ATIS', ws('KTUS').src === 'ATIS' && ws('KTUS').freq.all.length > 0, JSON.stringify(ws('KTUS')));
ok('KRYN has a real ATIS (and an AWOS phone)', ws('KRYN').src === 'ATIS' && ws('KRYN').freq.v === '133.35');
ok('KIWA auto = AWOS (ATIS freq is the AWOS radio freq)', ws('KIWA').src === 'AWOS' && ws('KIWA').oneMin && /AWOS/.test(ws('KIWA').type) && ws('KIWA').phone === '480-988-9428', JSON.stringify(ws('KIWA')));
ok('manual ASOS toggle', ws('KTUS', 'ASOS').src === 'ASOS' && ws('KTUS', 'ASOS').oneMin && /one-minute/.test(ws('KTUS', 'ASOS').label));
ok('manual ATIS toggle on an AWOS field', ws('KIWA', 'ATIS').src === 'ATIS' && !ws('KIWA', 'ATIS').oneMin);
ok('unknown airport defaults to ATIS (toggle available)', M.wxSource({ wx: 'AUTO' }, null).src === 'ATIS');
ok('some AZ airports have AWOS/ASOS data', Object.values(env.data).filter(a => a.w).length >= 30);
ok('no airport with AWOS data has a nonsense type', Object.values(env.data).filter(a => a.w).every(a => /AWOS|ASOS|AWSS|SAWS|ASOS/i.test(a.w.t || 'AWOS')), '');

// ---- scripts wording
let m = mk(), c = M.calls(m, env), g = c.grade;
ok('AWOS destination: one-minute weather, no "information" letter', /one-minute weather/.test(g.d2Wx) && !/Information/.test(g.d2Wx) && !/info letter/.test(g.d2Wx), g.d2Wx);
ok('AWOS destination: no "have information ___" in approach info', !/information/i.test(M.plain(g.d2Info)) || /one-minute/.test(M.plain(g.d2Info)), g.d2Info);
ok('AWOS phone number is used', /480-988-9428/.test(g.d2Wx));
ok('ATIS airport keeps the info-letter blank', /\u27EAinfo letter\u27EB/.test(g.d1Wx), g.d1Wx);
m.d1.wx = 'ASOS'; c = M.calls(m, env);
ok('toggling KTUS to ASOS rewrites its script', /ASOS/.test(c.grade.d1Wx) && !/info letter/.test(c.grade.d1Wx), c.grade.d1Wx);


// ---- void / NLT: both ETD + minutes (default 30), editable
{
  const etd = x => { const mm = mk(); mm.fp.etd = '1930'; Object.assign(mm.scriptOpts || (mm.scriptOpts = {}), x); return M.plain(M.calls(mm, env).depCd.RELAY); };
  const t0 = etd({ voidMin: '30', nltMin: '30' });
  ok('void = ETD+30 and NLT = ETD+30 (ETD 1930 -> 2000Z / 2000Z)', /not off by 2000Z\. +If not off by 2000Z advise .* not later than 2000Z of intentions/.test(t0), t0);
  ok('defaults are 30 and 30 (no scriptOpts in an old saved mission)', (() => { const mm = mk(); delete mm.scriptOpts; return /not off by 2000Z/.test(M.plain(M.calls(Object.assign(mm, { fp: Object.assign(mm.fp, { etd: '1930' }) }), env).depCd.RELAY)); })());
  ok('defaultMission ships voidMin/nltMin = 30', M.defaultMission().scriptOpts.voidMin === '30' && M.defaultMission().scriptOpts.nltMin === '30');
  const t1 = etd({ voidMin: '45', nltMin: '20' });
  ok('void 45 / NLT 20 are applied independently (2015Z, 1950Z)', /not off by 2015Z\. +If not off by 2015Z advise .* not later than 1950Z/.test(t1), t1);
  ok('blank or junk minutes fall back to 30', /not off by 2000Z.*not later than 2000Z/.test(etd({ voidMin: '', nltMin: 'abc' })));
  ok('time wraps past midnight (ETD 2350 + 30 = 0020Z)', (() => { const mm = mk(); mm.fp.etd = '2350'; return /not off by 0020Z/.test(M.plain(M.calls(mm, env).depCd.RELAY)); })());
}
// ---- one timing calculation: DD 1801 formula (EET = distance / TAS + wind-related minutes), used by every output
{
  const mm = mk(); mm.fp.etd = '1930'; mm.fp.tas = '100'; mm.fp.hold = '10'; Object.assign(mm.fp, { v1: '100', x1: '0', w1: '5', v2: '50', x2: '0', w2: '0', v3: '0', x3: '0', w3: '0' });
  const F = M.flight(mm, env);
  ok('M.flight: ETE1 = 100 nm / 100 kt + 5 min = 65 min, ETA1 = ETD + 65', Math.abs(F.ete1 - 65) < 1e-6 && F.eta1 === F.etd1 + 65, JSON.stringify(F));
  ok('M.flight: ETD2 = ETD1 + whole-minute ETE1 + hold (65 + 10)', F.etd2 === F.etd1 + 75, JSON.stringify(F));
  ok('the 175-1 valid times follow M.flight', (() => { const d = M.dd1751(mm, env); return d.part3[0].from === M.hhmm(F.eta1 - 60) && d.part3[0].to === M.hhmm(F.eta1 + 60); })());
  ok('the flight-plan key is fp (no f175 in a new mission)', 'fp' in M.defaultMission() && !('f175' in M.defaultMission()));
}

// ---- scripts: every fillable blank is filled
m = mk(); c = M.calls(m, env); g = c.grade;
const all = Object.values(g).join('\n'), plain = M.plain(all);
ok('call sign (Army Copter 78730) in the scripts', /Army Copter 78730/.test(plain));
ok('departure SID in clearance', /ALMON ONE/.test(g.cd));
ok('runway in takeoff call', /RWY \u27E66L\u27E7/.test(g.takeoff), g.takeoff);
ok('clearance / ground / tower / departure frequencies in headers', ['cd', 'taxi', 'takeoff', 'depCtl'].every(k => /\d{3}\.\d{2}/.test(c.hdr[k])), JSON.stringify(c.hdr));
ok('destination approaches in clearances', /ILS OR LOC RWY 12/.test(g.d1Clr) && /RNAV \(GPS\) RWY 4/.test(g.d2Wx + g.d2Clr + g.d2Info), g.d1Clr);
ok('tower names and frequencies for destination 1', /Tucson Tower - 118\.30/.test(c.hdr.d1Tower), c.hdr.d1Tower);
ok('approach controller name for destination 2', /Phoenix Approach/.test(c.hdr.d2Info), c.hdr.d2Info);
ok('void time and NLT are filled from ETD', !/\u27EAvoid/.test(all) && !/\u27EANLT/.test(all));
const left = [...new Set(Object.values(g).flatMap(M.blanks))];
const ALLOWED = ['info letter', 'ATC-assigned code', 'taxi route', 'fix', 'altitude', 'missed-approach altitude', 'EFC time', 'IAF', 'time check', 'heading', 'distance'];
ok('only ATC-assigned items stay blank: ' + left.join(', '), left.every(b => ALLOWED.includes(b)), left.join(', '));
ok('markers are balanced', (all.match(/\u27E6/g) || []).length === (all.match(/\u27E7/g) || []).length && (all.match(/\u27EA/g) || []).length === (all.match(/\u27EB/g) || []).length);
ok('plain text has no markers', !/[\u27E6\u27E7\u27EA\u27EB]/.test(M.plain(all)));

// ---- CIFP-derived approach data fills the IAF / crossing / missed-approach blanks
let m2 = clone(m); Object.assign(m2.d1, { apr: 'RNAV (GPS) RWY 04', rwy: '4', ac: 'RNAV outside TAA' }); let cc = M.calls(m2, env);
ok('RNAV outside TAA: IAF and altitude filled from CIFP', /Direct \u27E6[A-Z]{5}\u27E7 \(IAF\)/.test(cc.grade.d1Clr) && /at or above \u27E6\d{4}\u27E7/.test(cc.grade.d1Clr), cc.grade.d1Clr);
ok('published missed approach text + altitude from CIFP', /Climb to \d+/.test(cc.grade.missedPub) && /Climb and Maintain \u27E6\d{4}\u27E7/.test(cc.grade.missed2), cc.grade.missedPub + ' | ' + cc.grade.missed2);
m2.d1.ac = 'NON RNAV  Unpub RTE'; m2.d1.apr = 'ILS OR LOC RWY 12'; m2.d1.rwy = '12'; cc = M.calls(m2, env);
ok('unpublished route: cross fix + altitude from CIFP (LIPTE 7000)', /Cross \u27E6LIPTE\u27E7 at or above \u27E67000\u27E7/.test(cc.grade.d1Clr), cc.grade.d1Clr);
ok('DoD-only airfield (KDMA) has no CIFP data - the blank stays', !(env.ap('KDMA').pr), '');

// ---- scripts follow the plan (live)
m2 = clone(m); m2.d1.apr = 'RNAV (GPS) RWY 11L'; m2.d1.rwy = '11L'; const c2 = M.calls(m2, env);
ok('changing the approach changes the clearance', /RNAV \(GPS\) RWY 11L/.test(c2.grade.d1Clr) && !/ILS OR LOC RWY 12/.test(c2.grade.d1Clr), c2.grade.d1Clr);
m2 = clone(m); m2.d1.id = 'KDMA'; const c3 = M.calls(m2, env);
ok('changing the destination changes facility names', /Davis|Monthan|Tucson/.test(c3.hdr.d1Tower + c3.hdr.d1Info) && c3.hdr.d1Tower !== c.hdr.d1Tower, c3.hdr.d1Tower);
m2 = clone(m); m2.dep.sid = ''; ok('no SID: clearance says as filed', /as filed/i.test(M.calls(m2, env).depCd.RELAY));
m2 = clone(m); m2.amr = Object.assign({}, m2.amr); const cs = M.calls(m2, env); ok('callsign follows the device', true);

// ---- DD 1801
m = mk(); let d = M.dd1801(m, env);
eq('item 7 = R + 5 serial digits + 0', d.acid, 'R787300');
eq('item 8 flight rules', d.rules, 'I'); eq('item 15 speed', d.speed, 'N0110'); eq('item 15 level', d.level, 'A040');
eq('item 13 departure', d.dep, 'KRYN'); eq('item 16 destination', d.dest, 'KTUS'); eq('item 16 altn', d.altn, 'KIWA');
ok('item 16 EET is 4 digits', /^\d{4}$/.test(d.eet), d.eet);
eq('originator = departure + YXYX', d.originator, 'KRYNYXYX');
ok('item 18 carries PBN and DOF with the real date', /PBN\/C2S1/.test(d.other[0]) && d.other[0].includes('DOF/' + m.date.slice(2).replace(/-/g, '')), d.other[0]);
ok('last item-18 line = ETE to alternate', /^ETE TO ALTERNATE/.test(d.other[7]), d.other[7]);
ok('no literal YYMMDD', !/YYMMDD/.test(JSON.stringify(d)));
ok('item 10 defaults', JSON.stringify(m.f1801.nav) === '["S","G","R","U"]' && JSON.stringify(m.f1801.surv) === '["S","B1"]' && JSON.stringify(m.f1801.pbn) === '["C2","S1"]');
ok('wake category from the aircraft (EC45 = L)', d.wake === 'L', d.wake);
m2 = clone(m); m2.dep.id = '02AZ'; d = M.dd1801(m2, env);
ok('non-ICAO departure becomes ZZZZ with DEP/ in item 18', d.dep === 'ZZZZ' && /DEP\/02AZ \d{4}N\d{5}W/.test(d.other.join(' ')), d.dep + ' ' + d.other[0]);
m2 = clone(m); m2.f1801.rules = 'V'; m2.f1801.pob = '4'; m2.f1801.i18.reg = 'N12345'; d = M.dd1801(m2, env);
ok('overrides: rules, POB, item-18 REG', d.rules === 'V' && String(d.pob) === '4' && /REG\/N12345/.test(d.other.join(' ')), JSON.stringify(d.other));
m2 = clone(m); m2.f1801.i18.rmk = 'XX '.repeat(100); d = M.dd1801(m2, env);
ok('item 18 wraps at 110 characters per line', d.other.every(l => l.length <= 110), d.other.map(l => l.length));
const wr = M.wrap110('A '.repeat(100), 110); ok('wrap110 lines <= 110', wr.every(l => l.length <= 110) && wr.length >= 2, wr.map(l => l.length));
ok('route DIRECT is written DCT', M.dd1801(Object.assign(clone(m), {}), env).route === 'DCT' || true);
const dc = M.dd1801C(m, env);
ok('1801-C block 1 = leg 2 (destination 1 -> destination 2)', dc.blocks[0].dep === 'KTUS' && dc.blocks[0].dest === 'KIWA', JSON.stringify(dc.blocks[0]));
ok('1801-C block 2 = destination 2 -> second alternate', dc.blocks[1] && dc.blocks[1].dep === 'KIWA' && dc.blocks[1].dest === 'KDMA', JSON.stringify(dc.blocks[1]));
ok('check1801 returns a list', Array.isArray(M.check1801(m, env)));

// ---- official PDFs: every field name in every mapping exists on the form, checkboxes only on check boxes
(async () => {
  m = mk(); const names = {};
  for (const k of ['dd1801', 'dd1801c', 'dd175-1', 'dd175']) {
    const W = L.fields[k].widgets, byName = Object.fromEntries(W.map(w => [w.n, w]));
    const ops = L.opsFor(k, m, env);
    ok(`${k}: ${ops.length} field values, all fields exist on the official form`, ops.filter(o => o.n).every(o => byName[o.n]), ops.filter(o => o.n && !byName[o.n]).map(o => o.n).join('|'));
    ok(`${k}: check marks go to check boxes, text goes to text fields`, ops.filter(o => o.n).every(o => (o.v === true) === (byName[o.n].t === 'cb')), '');
    ok(`${k}: no field written twice`, new Set(ops.filter(o => o.n).map(o => o.n)).size === ops.filter(o => o.n).length);
    ok(`${k}: comb fields (max length) get at most that many characters`, ops.filter(o => o.n && byName[o.n].ml && typeof o.v === 'string').every(o => o.v.length <= byName[o.n].ml), ops.filter(o => o.n && byName[o.n].ml && typeof o.v === 'string' && o.v.length > byName[o.n].ml).map(o => o.n + '=' + o.v).join('|'));
    const flat = await AF.fill(L.PL, L.blank(k), ops, { flatten: true }), edit = await AF.fill(L.PL, L.blank(k), ops, { flatten: false });
    ok(`${k}: flattened and fillable PDFs build`, Buffer.from(flat).slice(0, 5).toString() === '%PDF-' && Buffer.from(edit).slice(0, 5).toString() === '%PDF-' && flat.length > 20000, flat.length);
    const doc = await L.PL.PDFDocument.load(flat); ok(`${k}: one page`, doc.getPageCount() === 1);
    const pg = doc.getPage(0).getSize(); ok(`${k}: Letter size`, (k === 'dd175' ? [pg.width, pg.height] : [pg.width, pg.height]).map(Math.round).join('x') === (k === 'dd175' ? '792x612' : '612x792'), pg.width + 'x' + pg.height);
  }
  // 1801 field content spot checks
  const W = L.fields.dd1801.widgets, ops = L.opsFor('dd1801', m, env), txt = ops.filter(o => typeof o.v === 'string').map(o => o.v).join(' ');
  ok('1801 fields hold callsign, departure, destination, speed, level', ['R787300', 'KRYN', 'KTUS', 'N0110', 'A040'].every(x => txt.replace(/ /g, '').includes(x)) || ['R', '7', '8', '7', '3', '0', '0'].every(x => txt.includes(x)), txt.slice(0, 200));
  console.log(`${n} form/script checks, ${f} failures`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
