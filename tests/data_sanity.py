#!/usr/bin/env python3
"""Workbook-free sanity checks on the shipped data (site/data). Used by CI before every deploy.
   python3 data_sanity.py [--now ISO]    exit 1 on failure"""
import json, os, sys, datetime, gzip, re
STATES50 = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
KINDS = ('PU-A', 'PU-H', 'PU-G', 'PU-U', 'MIL-A', 'MIL-H', 'PR-H')
ids = {}
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
fails = []
def need(c, msg):
    if not c: fails.append(msg)
now = datetime.datetime.now(datetime.timezone.utc)
if '--now' in sys.argv: now = datetime.datetime.fromisoformat(sys.argv[sys.argv.index('--now') + 1].replace('Z', '+00:00'))
man = json.load(open(f'{SITE}/data/manifest.json'))
cycles = man['cycles']; need(cycles, 'manifest has no cycles')
P = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
for c in cycles:
    need(P(c['to']) - P(c['from']) == datetime.timedelta(days=28), f"cycle {c['tpp']} is not 28 days long")
    need(c['states'], f"cycle {c['tpp']} has no states")
for a, b in zip(cycles, cycles[1:]): need(P(a['to']) == P(b['from']), f"cycles {a['tpp']} -> {b['tpp']} not contiguous")
cur = [c for c in cycles if P(c['from']) <= now < P(c['to'])]
need(len(cur) == 1, f"no manifest cycle is effective now ({now:%Y-%m-%d}); have {[c['tpp'] for c in cycles]}")
st = json.load(open(f'{SITE}/data/static.json')); need([a['design'] for a in st['acft']] == ['UH-72', 'UH-60L', 'UH-60M'] and len(st['devices']) >= 20 and 'TH-67' not in json.dumps(st), 'static.json: aircraft must be UH-72 / UH-60L / UH-60M and tail numbers only')
tot = 0
for c in cycles:
    for s, ent in c['states'].items():
        p = f"{SITE}/{ent['url']}"; need(os.path.exists(p), f'missing {p}')
        if not os.path.exists(p): continue
        doc = json.load(open(p)); a = doc['a']; tot += len(a)
        need(doc['state'] == s and doc['cycle']['tpp'] == c['tpp'], f'{p}: state/cycle header mismatch')
        need(len(a) == ent['airports'], f'{p}: manifest says {ent["airports"]} airports, file has {len(a)}')
        for i, d in a.items():
            if not (d.get('n') and 'e' in d and 'k' in d): need(False, f'{p}: {i} missing n/e/k'); break
        # v1.5: VFR sectional (NASR APT_BASE.CHART_NAME) per airport - a refresh that loses the field must fail the build
        MINOR = s in ('XX', 'GU', 'AS', 'MP', 'VI', 'UM', 'PR', 'HI')
        need(sum(1 for d in a.values() if d.get('sc')) >= (0.5 if MINOR else 0.9) * len(a) or s == 'XX', f'{s} {c["tpp"]}: too few airports carry a sectional (sc)')
        # v1.6 nationwide: ELA footprint field + textual ODP field + the usual shape checks
        if s in STATES50 + ['DC']:
            need(all(d.get('el') for d in a.values() if d.get('p') and s != 'AK'), f'{s} {c["tpp"]}: continental airports without an IFR Enroute Low chart (el): ' + ','.join(i for i, d in a.items() if d.get('p') and not d.get('el'))[:120]) if s != 'HI' else None
        need(all(isinstance(d.get('el', []), list) and all(re.match(r'^(AK )?L-\d+$', x) for x in d.get('el', [])) for d in a.values()), f'{s} {c["tpp"]}: malformed el')
        need(all(isinstance(d.get('o', []), list) and len(d.get('o', [])) <= 8 and all(isinstance(x, str) and 0 < len(x) <= 420 for x in d.get('o', [])) for d in a.values()), f'{s} {c["tpp"]}: malformed o (textual ODP)')
        need(all(re.match(r'^[A-Z0-9]{2,5}$', i) for i in a), f'{s} {c["tpp"]}: odd airport ids')
        need(all(d['k'] in KINDS for d in a.values()), f'{s} {c["tpp"]}: unexpected facility kinds')
        need(all(isinstance(d.get('p'), list) and len(d['p']) == 2 for d in a.values() if 'p' in d), f'{s} {c["tpp"]}: bad coordinates')
        ids.setdefault(c['tpp'], {})[s] = sorted(a)
        need(os.path.getsize(p) < 1_500_000, f'{p}: state file over 1.5 MB raw')
        need(all(d['sc'] == d['sc'].upper() and d['sc'].strip() == d['sc'] for d in a.values() if 'sc' in d), f'{s} {c["tpp"]}: sectional names must be trimmed upper case')
        if s == 'AZ':
            need(all(a.get(i, {}).get('sc') == 'PHOENIX' for i in ('KRYN', 'KMZJ', 'KTUS', 'KPHX')), f'AZ {c["tpp"]}: KRYN/KMZJ/KTUS/KPHX must be on the PHOENIX sectional')
            need(len(a) >= 150, f'AZ has only {len(a)} airports')
            for i in ('KTUS', 'KPHX', 'KRYN', 'KDMA', 'KFLG'):
                d = a.get(i); need(d is not None, f'AZ {c["tpp"]}: {i} missing')
                if d: need(d.get('r') and d.get('i'), f'AZ {c["tpp"]}: {i} has no runways/approaches')
            need(any('APP' in x[1] for x in a['KTUS'].get('f', [])) if 'KTUS' in a else False, 'KTUS has no approach frequency')
            need(any('ILS' in x for x in a['KTUS'].get('i', [])) if 'KTUS' in a else False, 'KTUS has no ILS approach')
            need(a['KTUS']['e'] in range(2500, 2800) if 'KTUS' in a else False, 'KTUS elevation implausible')
            # v2 data: facility names/frequencies ('g') and AWOS/ASOS ('w')
            need(sum(1 for d in a.values() if d.get('w')) >= 30, f'AZ {c["tpp"]}: fewer than 30 airports with AWOS/ASOS data')
            need(sum(1 for d in a.values() if d.get('g')) >= 60, f'AZ {c["tpp"]}: fewer than 60 airports with facility data')
            g = a.get('KTUS', {}).get('g', {}); need(g.get('tc') and g.get('T') and g.get('G') and g.get('C') and g.get('A'), f'AZ {c["tpp"]}: KTUS facility data incomplete {list(g)}')
            pr = a.get('KTUS', {}).get('pr', {}).get('ILS OR LOC RWY 12', {}); need(pr.get('iaf') and pr.get('faf') and pr.get('cross', {}).get('alt') and pr.get('ma'), f'AZ {c["tpp"]}: KTUS ILS 12 CIFP data missing {pr}')
            need(sum(len(d.get('pr', {})) for d in a.values()) >= 60, f'AZ {c["tpp"]}: fewer than 60 approaches with CIFP details')
            w = a.get('KIWA', {}).get('w'); need(w and 'AWOS' in (w.get('t') or '') and w.get('p'), f'AZ {c["tpp"]}: KIWA AWOS entry missing {w}')
            for i, d in a.items():
                if d.get('w'): need(set(d['w']) <= {'t', 'p', 'p2', 'f'}, f'{i}: unexpected AWOS keys {list(d["w"])}')
        if s == 'PA':
            need(all(a.get(i, {}).get('sc') == 'NEW YORK' for i in ('KMUI', 'KRDG', 'KLNS')), f'PA {c["tpp"]}: KMUI/KRDG/KLNS must be on the NEW YORK sectional')
            need(len(a) >= 390, f'PA {c["tpp"]} has only {len(a)} airports')
            for i in ('KPIT', 'KPHL', 'KMDT', 'KABE', 'KAVP', 'KERI', 'KTHV', 'KFIG', 'KMUI'):
                d = a.get(i); need(d is not None, f'PA {c["tpp"]}: {i} missing')
                if d: need(d.get('r') and d.get('i') and d.get('t') and d.get('h'), f'PA {c["tpp"]}: {i} has no runways/approaches/control data')
            need(all(d['k'] in ('PU-A', 'PU-H', 'PU-G', 'PU-U', 'MIL-A', 'MIL-H', 'PR-H') for d in a.values()), f'PA {c["tpp"]}: unexpected facility kinds (filter policy)')
            need(a.get('KPIT', {}).get('t', {}).get('cl') == 'B' and a.get('KMDT', {}).get('t', {}).get('tw') == 1 and not a.get('KTHV', {}).get('t', {}).get('tw'), f'PA {c["tpp"]}: tower data wrong for KPIT/KMDT/KTHV')
            need(sum(len(d.get('pr', {})) for d in a.values()) >= 100, f'PA {c["tpp"]}: fewer than 100 approaches with CIFP details')
# nationwide completeness + the ID index
for c in cycles:
    miss = [x for x in STATES50 + ['DC', 'PR', 'VI', 'GU', 'AS', 'MP'] if x not in c['states']]; need(not miss, f"cycle {c['tpp']}: states missing from the manifest: {miss}")
    need(sum(e['airports'] for e in c['states'].values()) >= 9500, f"cycle {c['tpp']}: fewer than 9,500 airports nationwide")
    need(all(c['states'][x]['airports'] >= 2 for x in c['states']), f"cycle {c['tpp']}: a state has fewer than 2 airports")
    ix = f"{SITE}/{c.get('index', 'missing')}"; need(os.path.exists(ix), f"cycle {c['tpp']}: ID index {ix} missing")
    if os.path.exists(ix):
        idx = json.load(open(ix)); need(idx == ids.get(c['tpp']), f"cycle {c['tpp']}: ids.json does not match the state files")
        need(len(gzip.compress(open(ix, 'rb').read())) < 60_000, f"cycle {c['tpp']}: ids.json over 60 kB gzip")
    need(sum(e['gz'] for e in c['states'].values()) < 3_000_000, f"cycle {c['tpp']}: all states over 3 MB gzip")
    mui = json.load(open(f"{SITE}/data/{c['tpp']}/PA.json"))['a'].get('KMUI', {}); need(mui.get('o') and 'COPTER MUIR FOUR' in mui.get('d', []), f"cycle {c['tpp']}: KMUI should have a textual ODP next to its graphic DP")
    need(sum(1 for st in c['states'] for d in json.load(open(f"{SITE}/{c['states'][st]['url']}"))['a'].values() if d.get('o')) >= 1000, f"cycle {c['tpp']}: fewer than 1,000 textual ODPs")
tot_mb = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(f'{SITE}/data') for f in fs) / 1e6; need(tot_mb < 200, f'site/data is {tot_mb:.0f} MB (Pages limit 1 GB; keep far below)')
print(f"data sanity ({tot_mb:.1f} MB): {len(cycles)} cycles {[c['tpp'] for c in cycles]}, current={cur[0]['tpp'] if cur else None}, {tot} airport records, {len(fails)} failures")
for f in fails: print('  FAIL', f)
sys.exit(1 if fails else 0)
