/* Data layer: FAA cycle selection + lazy per-state airport loading + search. */
(function (root) {
  'use strict';
  const D = { manifest: null, cycle: null, loaded: {}, airports: {}, static: null, mode: 'auto', stFilter: 'ALL' };   // stFilter: 'ALL' or a 2-letter state that limits search()
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
  D.NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
    MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa',
    MP: 'Northern Mariana Islands', UM: 'U.S. Minor Outlying Islands', XX: 'Other / FAA-listed foreign' };
  D.stName = st => D.NAMES[st] || st;
  D.init = async function (mode, now) {
    D.manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' }).catch(() => fetch('data/manifest.json'))).json();
    D.static = await (await fetch('data/static.json')).json();
    D.mode = mode || 'auto';
    D.cycle = D.pickCycle(now, D.mode);
    D.loaded = {}; D.airports = {}; D.index = null; D.idState = {};
    return D.cycle;
  };
  /* nationwide ID -> state index (about 28 kB gzip): lets an exact ID typed anywhere load just the state it needs */
  D.loadIndex = async function () {
    if (D.index) return D.index;
    const u = D.cycle && D.cycle.index; if (!u) { D.index = {}; return D.index; }
    try { D.index = await (await fetch(u)).json(); } catch (e) { D.index = {}; }
    D.idState = {}; for (const st in D.index) D.index[st].forEach(id => { D.idState[id] = st; });
    return D.index;
  };
  D.stateOf = function (q) {                                   // typed text/ID -> {id, st} from the index (ID, or K+ID for 3-letter US IDs)
    q = String(q || '').trim().toUpperCase(); if (!q) return null;
    if (D.airports[q]) return { id: q, st: D.airports[q].st };
    if (D.airports['K' + q]) return { id: 'K' + q, st: D.airports['K' + q].st };
    if (D.idState[q]) return { id: q, st: D.idState[q] };
    if (D.idState['K' + q]) return { id: 'K' + q, st: D.idState['K' + q] };
    return null;
  };
  D.loadState = async function (st) {
    if (D.loaded[st]) return D.loaded[st];
    const ent = D.cycle.states[st]; if (!ent) throw new Error('No data for state ' + st);
    const doc = await (await fetch(ent.url)).json();
    for (const id in doc.a) { const a = doc.a[id]; a.id = id; a.st = st; D.airports[id] = a; }
    D.loaded[st] = doc; return doc;
  };
  D.loadStates = async function (list) { await Promise.all((list || []).filter(st => D.cycle.states[st]).map(st => D.loadState(st))); return D.loaded; };
  D.unloadState = function (st) { const doc = D.loaded[st]; if (!doc) return; for (const id in doc.a) delete D.airports[id]; delete D.loaded[st]; };
  D.states = () => Object.keys((D.cycle && D.cycle.states) || {}).sort();                // every state shipped in the cycle in use
  D.loadedStates = () => Object.keys(D.loaded).sort();                                    // the ones in memory right now (filter dropdown, search)
  D.loadAll = async function () { await D.loadStates(D.states()); return D.loaded; };   // tests / diagnostics only: every state (about 8 MB in memory)
  /* offline cache (Cache API, shared with the service worker): which states are stored, drop one */
  D.cached = async function (st) {
    try { const ent = D.cycle.states[st]; const keys = await caches.keys(); for (const k of keys) if (k.startsWith('amr-planner-')) { if (await (await caches.open(k)).match(ent.url)) return true; } } catch (e) {}
    return false;
  };
  D.dropState = async function (st) {
    try { const keys = await caches.keys(); for (const k of keys) if (k.startsWith('amr-planner-')) { const c = await caches.open(k); for (const cy of D.manifest.cycles) { const e = cy.states[st]; if (e) await c.delete(e.url); } } } catch (e) {}
  };
  D.ap = id => D.airports[String(id || '').trim().toUpperCase()] || null;
  D.acft = d => (D.static.acft.find(a => a.design === d) || null);
  D.device = d => (D.static.devices.find(x => x.device === d) || null);
  D.resolve = function (q) {      // typed text -> airport id (accepts TUS for KTUS)
    q = String(q || '').trim().toUpperCase(); if (!q) return null;
    if (D.airports[q]) return q; if (D.airports['K' + q]) return 'K' + q; return null;
  };
  D.resolveAsync = async function (q) {                      // like resolve(), but loads the one state that holds the ID if it is not in memory yet
    const hit = D.resolve(q); if (hit) return hit;
    await D.loadIndex(); const r = D.stateOf(q); if (!r) return null;
    await D.loadState(r.st); return D.resolve(r.id);
  };
  D.searchIndex = function (q, limit) {                       // ID matches in states that are not loaded (exact ID first, then prefix) -> [{id, st}]
    q = String(q || '').trim().toUpperCase(); if (q.length < 2 || !D.index) return [];
    const out = [];
    for (const st in D.index) { if (D.loaded[st]) continue; for (const id of D.index[st]) { const sc = (id === q || id === 'K' + q) ? 0 : (id.startsWith(q) || id.startsWith('K' + q)) ? 1 : 9; if (sc < 9) out.push([sc, id, st]); } }
    out.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1]));
    return out.slice(0, limit || 4).map(x => ({ id: x[1], st: x[2] }));
  };
  D.search = function (q, limit) {
    q = String(q || '').trim().toUpperCase(); if (!q) return [];
    const out = [];
    for (const id in D.airports) {
      const a = D.airports[id], n = a.n.toUpperCase(), c = a.c.toUpperCase(); let sc = 99;
      if (D.stFilter && D.stFilter !== 'ALL' && a.st !== D.stFilter) continue;
      if (id === q || id === 'K' + q) sc = 0; else if (id.startsWith(q) || ('K' + q.slice(0, 3) === id.slice(0, 4) && id.startsWith('K' + q))) sc = 1;
      else if (n.startsWith(q)) sc = 2; else if (n.includes(q)) sc = 3; else if (c.includes(q)) sc = 4; else continue;
      out.push([sc, id]);
    }
    out.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1]));
    return out.slice(0, limit || 8).map(x => D.airports[x[1]]);
  };
  root.AMRData = D;
})(window);
