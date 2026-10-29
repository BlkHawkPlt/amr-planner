#!/usr/bin/env python3
"""Copy built per-state JSON into the deployable site and write site/data/manifest.json.
   assemble_site.py --states AZ --cycles 2610 2611   (expects data/out/<cycle>/)"""
import argparse, json, os, shutil
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, '..', 'site', 'data')
ap = argparse.ArgumentParser(); ap.add_argument('--states', default='AZ'); ap.add_argument('--cycles', nargs='+', required=True)
a = ap.parse_args(); cycles = []
for c in a.cycles:
    m = json.load(open(os.path.join(here, 'out', c, 'manifest.json')))
    os.makedirs(os.path.join(site, c), exist_ok=True); st = {}
    for s in a.states.split(','):
        shutil.copy(os.path.join(here, 'out', c, 'states', f'{s}.json'), os.path.join(site, c, f'{s}.json'))
        st[s] = dict(url=f'data/{c}/{s}.json', airports=m['states'][s]['airports'])
    cycles.append(dict(tpp=c, nasr=m['cycle']['nasr'], **{'from': m['cycle']['from'], 'to': m['cycle']['to']}, states=st))
json.dump(dict(cycles=cycles, filter=m['filter']), open(os.path.join(site, 'manifest.json'), 'w'), indent=1)
print('site data manifest:', [c['tpp'] for c in cycles])
