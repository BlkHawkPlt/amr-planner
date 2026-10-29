#!/usr/bin/env python3
"""Workbook-free sanity checks on the shipped data (site/data). Used by CI before every deploy.
   python3 data_sanity.py [--now ISO]    exit 1 on failure"""
import json, os, sys, datetime, gzip
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
st = json.load(open(f'{SITE}/data/static.json')); need(len(st['acft']) >= 5 and len(st['devices']) >= 5, 'static.json too small')
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
        if s == 'AZ':
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
print(f"data sanity: {len(cycles)} cycles {[c['tpp'] for c in cycles]}, current={cur[0]['tpp'] if cur else None}, {tot} airport records, {len(fails)} failures")
for f in fails: print('  FAIL', f)
sys.exit(1 if fails else 0)
