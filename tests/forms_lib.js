// Node helper: build the filled official PDFs for a mission using the same code the browser runs.
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const M = require(SITE + '/js/model.js'); require(SITE + '/js/scripts.js'); require(SITE + '/js/dd1801.js');
const AF = require(SITE + '/js/forms.js');
const PL = require(SITE + '/vendor/pdf-lib.min.js');
const fields = JSON.parse(fs.readFileSync(SITE + '/forms/fields.json'));
// Cycles come from the shipped manifest (never hard-coded): the daily refresh drops the expired cycle, so there can be one or two.
const MAN = JSON.parse(fs.readFileSync(SITE + '/data/manifest.json'));
function pickCycle(which) {
  const now = new Date(), cs = MAN.cycles.map(c => c.tpp), cur = (MAN.cycles.find(c => now >= new Date(c.from) && now < new Date(c.to)) || MAN.cycles[MAN.cycles.length - 1]).tpp;
  if (!which || which === 'current') return cur;
  if (which === 'other') return cs.find(t => t !== cur) || cur;       // the other shipped cycle (same one if only one is shipped)
  return which;
}
function loadEnv(cycle, states) {      // states: default ['AZ'] (existing suites); the v1.4 PA suite passes ['AZ','PA']
  cycle = pickCycle(cycle);
  const d = {}; (states || ['AZ']).forEach(s => Object.assign(d, JSON.parse(fs.readFileSync(`${SITE}/data/${cycle}/${s}.json`)).a));
  const st = JSON.parse(fs.readFileSync(SITE + '/data/static.json'));
  return { ap: id => d[id] || null, acft: n => st.acft.find(a => a.design === n) || null, device: n => st.devices.find(x => x.device === n) || null, compat: false, data: d, static: st };
}
const blank = k => fs.readFileSync(`${SITE}/forms/${k}.pdf`);
function sunFor(m, env) { const a = env.ap(m.dep.id); return a && a.p ? M.sun(m.date, a.p[0], a.p[1]) : null; }
function opsFor(key, m, env) {
  const W = fields[key].widgets;
  if (key === 'dd1801') return AF.ops1801(W, M.dd1801(m, env));
  if (key === 'dd1801c') return AF.ops1801C(W, M.dd1801C(m, env));
  if (key === 'dd175-1') return AF.ops1751(W, m, M.dd1751(m, env), sunFor(m, env));
  if (key === 'dd175') return AF.ops175(W, m, M.dd175(m, env));
  throw new Error(key);
}
async function build(key, m, env, opt) { const ops = opsFor(key, m, env); return { ops, bytes: await AF.fill(PL, blank(key), ops, opt || {}) }; }
function sampleMission(env) {
  const m = M.defaultMission('2026-10-28'); m.date = '2026-10-29'; m.device = '78730';
  Object.assign(m.dep, { id: 'KRYN', rwy: '6L', apr: '', sid: 'ALMON ONE (OBSTACLE) (RNAV)', wx: 'AUTO' });
  Object.assign(m.d1, { id: 'KTUS', apr: 'ILS OR LOC RWY 12', rwy: '12' });
  Object.assign(m.d2, { id: 'KIWA', apr: 'RNAV (GPS) RWY 4', rwy: '4' });
  Object.assign(m.fp, { v1: '60', v2: '80', v3: '20', route1: 'DIRECT' });
  m.alt2 = { id: 'KDMA', time: '0+25' };
  m.amr.unit = 'C CO 1/14 AVN / KOZR'; m.amr.crew[0].name = 'DOE, JOHN A.'; m.amr.crew[0].rank = 'CW3'; m.amr.crew[1].name = 'ROE, RICHARD'; m.amr.crew[1].rank = '1LT';
  m.amr.pax = { name: 'SMITH, JANE', rank: 'MAJ', org: 'HQ' };
  m.f1751.init = 'EO'; m.f1751.notams = 'KRYN - RWY 6L/24R CLSD\nKTUS - ILS RWY 12 GP OTS';
  return m;
}
module.exports = { M, AF, PL, fields, loadEnv, blank, opsFor, build, sampleMission, SITE };
