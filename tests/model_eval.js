// node model_eval.js scenarios.json compat(0/1)  -> prints {scenario: {key: value}} computed by the app's model
const fs = require('fs'), path = require('path');
const M = require('../site/js/model.js'); require('./legacy_calls.js')(M);
const sc = JSON.parse(fs.readFileSync(process.argv[2])); const compat = process.argv[3] === '1';
const st = JSON.parse(fs.readFileSync(path.join(__dirname, '../site/data/2610/AZ.json'))), st2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../site/data/static.json')));
const airports = st.a; for (const k in airports) airports[k].id = k;
const env = { ap: id => airports[String(id).toUpperCase()] || null, acft: d => st2.acft.find(a => a.design === d) || null, device: d => st2.devices.find(x => x.device === d) || null, compat };
const out = {};
for (const [name, m] of Object.entries(sc)) {
  const o = {}, c = M.calls(m, env), a = M.amr(m, env), d = M.dd175(m, env), p = M.dd1751(m, env), g = c.grade;
  Object.assign(o, {
    'CS.B4': env.ap(m.dep.id).e, 'CS.C4': env.ap(m.dep.id).n, 'CS.B20': env.ap(m.d1.id).e, 'CS.C20': env.ap(m.d1.id).n, 'CS.B34': env.ap(m.d2.id).e, 'CS.C34': env.ap(m.d2.id).n,
    'CS.C5': g.simTemp,
    'Calls.B4': c.depWx.ATIS, 'Calls.B5': c.depWx.ASOS, 'Calls.B6': c.depWx.AWOS, 'Calls.D4': c.depCd.ATC, 'Calls.D5': c.depCd.RELAY,
    'Calls.F4': c.d1Wx.ATIS, 'Calls.F5': c.d1Wx.ASOS, 'Calls.F6': c.d1Wx.AWOS, 'Calls.J4': c.d2Wx.ATIS, 'Calls.J5': c.d2Wx.ASOS, 'Calls.J6': c.d2Wx.AWOS,
    'AMR.A4': a.mission, 'AMR.A7': a.special, 'AMR.C13': a.design, 'AMR.C14': a.serial, 'AMR.C15': +a.gw, 'AMR.C16': a.fuel, 'AMR.C21': a.hover, 'AMR.C22': a.climb, 'AMR.C23': a.cruise, 'AMR.C24': a.burn, 'AMR.C42': a.iap,
    'D175.P2': d.callsign, 'D175.R2': d.design, 'D175.C5': d.leg1.tas, 'D175.C6': d.leg2.tas, 'D175.G12': d.leg1.etd, 'D175.G14': d.leg2.etd, 'D175.S12': d.leg1.ete, 'D175.S14': d.leg2.ete,
    'D175.K12': d.leg1.route, 'D175.K13': d.mid.k, 'D175.L13': d.mid.l, 'D175.A15': d.remarksLine, 'D175.Q16': d.fuel[0], 'D175.R16': d.fuel[1], 'D175.S16': d.fuel[2], 'D175.B18': d.alt, 'D175.E18': d.eteAlt, 'D175.J18': d.weather, 'D175.N18': d.serialUnit,
    'D175.P14': d.leg2.remarks,
    'I1751.G4': p.acft, 'I1751.Q4': p.dep + 'Z', 'I1751.AM4': p.pa, 'I1751.AQ4': p.da, 'I1751.A6': p.sfcWind, 'I1751.A9': p.remarks13, 'I1751.A12': p.flWinds, 'I1751.A60': p.wxVoid,
  });
  const lbl = ['A34', 'A36', 'A38', 'A40'], col = (r, i) => { const x = p.part3[i]; return x ? x : null; };
  for (let i = 0; i < 4; i++) { const x = p.part3[i]; const r = 34 + 2 * i;
    o['I1751.A' + (r + 1)] = x ? x.id : ''; o['I1751.O' + r] = x ? x.wind : ''; o['I1751.T' + r] = x ? x.vis : ''; o['I1751.Z' + r] = x ? x.cloud : ''; o['I1751.AK' + (r + 1)] = x ? x.altim : ''; o['I1751.AO' + (r + 1)] = x ? x.temp : ''; o['I1751.AR' + (r + 1)] = x && x.pa !== '' ? x.pa : ''; o['I1751.A' + r] = x ? x.label : ''; }
  const G = { A2: g.depWx, A6: g.cd, A10: g.taxi, A13: g.takeoff, A16: g.handoff1, A18: g.depCtl, A20: g.contact, A23: g.d1Wx, A27: g.d1Info, A30: g.d1Clr, A32: g.d1Cross, A34: g.d1Cancel, A37: g.d1Tower,
    M2: g.missed1, M3: g.missed2, M5: g.missed3, M8: g.toD2, M12: g.handoff2, M15: g.d2Wx, M19: g.d2Info, M22: g.d2Clr, M24: g.d2Cross, M26: g.d1Cancel, M29: g.d2ContactTwr, M31: g.d2Tower, N39: g.simTemp, N40: g.cockpit };
  for (const k in G) o['Grade.' + k] = G[k];
  // all 8 approach clearance variants
  M.CLR_TYPES.forEach((t, i) => { o['Calls.H' + (4 + i)] = c.d1Clr[t]; o['Calls.L' + (4 + i)] = c.d2Clr[t]; });
  out[name] = o;
}
console.log(JSON.stringify(out));
