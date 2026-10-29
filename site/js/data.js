/* Data layer: FAA cycle selection + lazy per-state airport loading + search. */
(function (root) {
  'use strict';
  const D = { manifest: null, cycle: null, loaded: {}, airports: {}, static: null, mode: 'auto' };
  const KIND = { 'PU-A': 'Public airport', 'PU-G': 'Public gliderport', 'PU-H': 'Public heliport', 'PU-S': 'Public seaplane base',
    'MIL-A': 'Military airport', 'MIL-H': 'Military heliport', 'PR-H': 'Private heliport', 'PR-A': 'Private airport' };
  D.kindLabel = k => KIND[k] || k;

  D.pickCycle = function (now, mode) {
    const cs = D.manifest.cycles;
    if (mode && mode !== 'auto') { const c = cs.find(c => c.tpp === mode); if (c) return c; }
    const t = new Date(now || Date.now());
    let hit = cs.find(c => t >= new Date(c.from) && t < new Date(c.to));
    if (hit) return hit;
    return t < new Date(cs[0].from) ? cs[0] : cs[cs.length - 1];
  };
  D.cycleStatus = function (c, now) {
    const t = new Date(now || Date.now());
    if (t < new Date(c.from)) return { state: 'future', text: 'NOT YET EFFECTIVE' };
    if (t >= new Date(c.to)) return { state: 'expired', text: 'EXPIRED' };
    return { state: 'current', text: 'CURRENT' };
  };
  D.init = async function (mode, now) {
    D.manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' }).catch(() => fetch('data/manifest.json'))).json();
    D.static = await (await fetch('data/static.json')).json();
    D.mode = mode || 'auto';
    D.cycle = D.pickCycle(now, D.mode);
    D.loaded = {}; D.airports = {};
    return D.cycle;
  };
  D.loadState = async function (st) {
    if (D.loaded[st]) return D.loaded[st];
    const ent = D.cycle.states[st]; if (!ent) throw new Error('No data for state ' + st);
    const doc = await (await fetch(ent.url)).json();
    for (const id in doc.a) { const a = doc.a[id]; a.id = id; a.st = st; D.airports[id] = a; }
    D.loaded[st] = doc; return doc;
  };
  D.ap = id => D.airports[String(id || '').trim().toUpperCase()] || null;
  D.acft = d => (D.static.acft.find(a => a.design === d) || null);
  D.device = d => (D.static.devices.find(x => x.device === d) || null);
  D.resolve = function (q) {      // typed text -> airport id (accepts TUS for KTUS)
    q = String(q || '').trim().toUpperCase(); if (!q) return null;
    if (D.airports[q]) return q; if (D.airports['K' + q]) return 'K' + q; return null;
  };
  D.search = function (q, limit) {
    q = String(q || '').trim().toUpperCase(); if (!q) return [];
    const out = [];
    for (const id in D.airports) {
      const a = D.airports[id], n = a.n.toUpperCase(), c = a.c.toUpperCase(); let sc = 99;
      if (id === q || id === 'K' + q) sc = 0; else if (id.startsWith(q) || ('K' + q.slice(0, 3) === id.slice(0, 4) && id.startsWith('K' + q))) sc = 1;
      else if (n.startsWith(q)) sc = 2; else if (n.includes(q)) sc = 3; else if (c.includes(q)) sc = 4; else continue;
      out.push([sc, id]);
    }
    out.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1]));
    return out.slice(0, limit || 8).map(x => D.airports[x[1]]);
  };
  root.AMRData = D;
})(window);
