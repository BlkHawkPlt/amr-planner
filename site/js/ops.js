/* Control / airspace / first-contact logic for the Scripts (needs scripts.js).
 *  M.ctlOf(x, a)            towered vs uncontrolled (NASR tower data, class airspace, CTAF/UNICOM), with the Plan override x.ctl
 *  M.handoff(m, k, env, mode)  which approach control / Center takes the first call after departing airport k (mode 'dep', toward the next
 *                            destination) or serves an arrival at k (mode 'arr', toward where the flight came from)
 *  Rule (see README): 1) the facility NASR lists as the airport's approach/departure provider; 2) else, for a field with none listed, the terminal
 *  approach control whose service area reaches the field (a facility serving an airport within 15 nm) IF the course to the next point is within 90 deg of
 *  the bearing to that facility; 3) else the responsible ARTCC (Center). The Plan can override with any candidate.
 */
(function (root) {
  'use strict';
  const M = root.AMRModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const s = M.s;
  const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  M.bearing = (p, q) => { const la1 = rad(p[0]), la2 = rad(q[0]), dl = rad(q[1] - p[1]); const y = Math.sin(dl) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl); return (deg(Math.atan2(y, x)) + 360) % 360; };
  M.angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  M.compass = b => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((b % 360) + 360) % 360 / 45) % 8];
  M.CTL_CHOICES = [['AUTO', 'Auto (from FAA data)'], ['TWR', 'Towered (operating control tower)'], ['CTAF', 'Uncontrolled (CTAF / UNICOM)']];
  M.CDM_LIST = [['PHONE', 'Phone (clearance delivery / controlling facility)'], ['GCO', 'GCO (ground comm. outlet, over the radio)'], ['AIR', 'Airborne pickup (clearance after departure)']];
  const CLS = { B: 'Class B', C: 'Class C', D: 'Class D', E: 'Class E (surface area)', G: 'Class G (uncontrolled surface; Class E above)' };

  M.ctlOf = function (x, a) {
    const choice = s(x && x.ctl) || 'AUTO', t = a && a.t, g = (a && a.g) || {};
    const dataTw = t ? !!t.tw : !!g.tc, known = !!a;
    const towered = choice === 'TWR' ? true : choice === 'CTAF' ? false : (known ? dataTw : true);
    const auto = choice === 'AUTO';
    const ctaf = M.fset(g.F), uni = M.fset(g.U), adv = ctaf.all.length ? ctaf : uni;          // advisory frequency for the self-announce calls
    const cl = t && t.cl ? t.cl : (towered ? '' : 'G');
    const pt = !!(t && t.pt);
    let txt;
    if (towered) txt = (known && dataTw ? 'Towered' : 'Towered (set manually)') + (t && t.hr ? ' - tower ' + t.hr : '') + (pt ? ' (part-time: when the tower is closed it is uncontrolled - set Uncontrolled)' : '') + (cl ? ' • ' + CLS[cl] : '');
    else txt = (known && !dataTw ? 'No operating control tower in FAA data' : 'Treated as uncontrolled (set manually)') + ' • ' + (CLS[cl] || CLS.G) + (t && t.ch ? ' (' + t.ch + ')' : '') + ' • ' +
      (ctaf.txt ? 'CTAF ' + ctaf.txt : '') + (ctaf.txt && uni.txt && uni.txt !== ctaf.txt ? ' • ' : '') + (uni.txt && uni.txt !== ctaf.txt ? 'UNICOM ' + uni.txt : '') + (!ctaf.txt && !uni.txt ? 'no CTAF/UNICOM listed (use 122.9 MULTICOM)' : '');
    return { towered, auto, known, choice, part: pt, hrs: s(t && t.hr), cls: cl, clsHrs: s(t && t.ch), ctaf, uni, adv, text: txt,
             cd: (t && t.cd) || [], gco: (t && t.gco) || null };
  };

  /* ---------- facilities ---------- */
  const ucall = c => M.title(s(c).replace(/\s+(ARTCC|CNTR|CENTER|TRACON|APCH|APPROACH)\s*$/i, ''));
  const term = (id, call, fs, extra) => Object.assign({ kind: 'T', id, call: ucall(call), name: ucall(call) + ' Approach', dep: ucall(call) + ' Departure', f: fs }, extra || {});
  const ctr = (id, call, fs, extra) => Object.assign({ kind: 'C', id, call: ucall(call), name: ucall(call) + ' Center', dep: ucall(call) + ' Center', f: fs }, extra || {});
  M.facLabel = c => c.name + (c.f && c.f.txt ? ' ' + c.f.txt : '');

  M.handoff = function (m, k, env, mode) {
    mode = mode || 'dep';
    const x = m[k], a = env.ap(x.id), ctl = M.ctlOf(x, a), h = (a && a.h) || {}, g = (a && a.g) || {};
    const other = mode === 'dep' ? (k === 'dep' ? m.d1 : k === 'd1' ? m.d2 : null) : (k === 'd1' ? m.dep : k === 'd2' ? m.d1 : null);
    const oa = other && env.ap(other.id);
    const course = a && a.p && oa && oa.p ? M.bearing(a.p, oa.p) : null;
    const cands = [], seen = new Set();
    const add = o => { if (!o) return null; const key = o.kind + ':' + s(o.call).toUpperCase(); if (seen.has(key)) { const e = cands.find(c => c.kind + ':' + s(c.call).toUpperCase() === key); if (e && o.b != null && e.b == null) { e.b = o.b; e.d = o.d; e.n = o.n; } return e; } seen.add(key); cands.push(o); return o; };
    // data written by older builds: approach/departure + center rows of the airport itself
    const own = (() => {                                       // the approach control listed for the airport (FRQ 'A/D' rows / g.A)
      const ad = (a && a.f || []).filter(r => r[0] === 'A/D'), call = g.ac || (ad[0] && ad[0][1].replace(/\s+APP\/DEP.*$|\s+APP.*$|\s+DEP.*$/i, '')) || '';
      const fs = M.fset(g.A && g.A.length ? g.A : ad.map(r => r[2])); return call && fs.all.length ? term('A:' + s(call).toUpperCase(), call, fs) : null;
    })();
    let ownCtr = null;
    { const c = a && (a.f || []).filter(r => r[0] === 'CNTR'); if (c && c.length) ownCtr = ctr('C:' + s(c[0][1]).toUpperCase(), c[0][1].replace(/\s*CNTR.*$/i, ''), M.fset(c.map(r => r[2]))); }
    const hc = (h.c || []).map(e => term(e.id, e.call, M.fset(e.f), { b: e.b, d: e.d, n: e.n, via: e.via }));
    const hz = h.z ? ctr(h.z.id, h.z.call, M.fset(h.z.f || []), { via: h.z.via, dz: h.z.d }) : null;
    // 1. the provider NASR lists for this airport
    let pri = null;
    if (h.p) {
      if (h.p.k === 'C') pri = hz && hz.f.all.length ? hz : (ownCtr || (hz ? hz : ctr(h.p.id, h.p.call, M.fset([]))));
      else pri = hc.find(e => e.id === h.p.id) || (own && ucall(own.call).toUpperCase() === ucall(h.p.call).toUpperCase() ? own : null) || own || hc[0] || null;
    }
    if (pri) add(pri);
    if (own && !pri) add(own);
    hc.forEach(add);
    if (ownCtr) add(ownCtr);
    if (hz) add(hz);
    const out = { cands, course, towered: ctl.towered, mode, other: other && other.id, fac: null, why: '', auto: true, pri: !!pri };
    const ov = s(x.ho) && s(x.ho) !== 'AUTO' ? cands.find(c => c.id === s(x.ho)) : null;
    let pick = null;
    if (ov) { pick = ov; out.why = 'set manually'; out.auto = false; }
    else if (pri) { pick = pri; out.why = 'FAA (NASR) lists ' + M.facLabel(pri) + ' as the approach/departure provider for ' + s(x.id); }
    else if (own && ctl.towered) { pick = own; out.why = 'approach/departure control of the tower in FAA data'; }
    else {
      const terms = cands.filter(c => c.kind === 'T');
      const tw = terms.filter(c => c.b != null);
      const cen = cands.find(c => c.kind === 'C');
      if (course == null) { pick = terms[0] || cen || null; out.why = 'no course available (next point not in data): nearest ' + (pick ? pick.kind === 'C' ? 'Center' : 'approach control' : 'facility'); }
      else {
        const ahead = tw.find(c => M.angDiff(course, c.b) <= 90);
        if (ahead) { pick = ahead; out.why = (mode === 'dep' ? 'course ' : 'arriving from ') + Math.round(course) + '\u00B0 (' + M.compass(course) + ') is toward ' + ahead.name + "'s area (bearing " + ahead.b + '\u00B0, ' + ahead.d + ' nm) - no approach/departure provider is listed for ' + s(x.id); }
        else if (cen) { pick = cen; out.why = (mode === 'dep' ? 'course ' : 'arriving from ') + Math.round(course) + '\u00B0 (' + M.compass(course) + ') leads away from ' + (tw[0] ? tw[0].name + ' (bearing ' + tw[0].b + '\u00B0)' : 'any approach control') + ' - responsible Center' + (cen.via && cen.dz ? ' (frequency listed for ' + cen.via + ', ' + cen.dz + ' nm away)' : ''); }
        else { pick = terms[0] || null; out.why = 'no Center in data: nearest approach control'; }
      }
    }
    out.fac = pick;
    out.center = cands.find(c => c.kind === 'C') || null;
    return out;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
