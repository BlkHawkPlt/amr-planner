#!/usr/bin/env python3
"""Compare data/out/2610 AZ.json (built by build_data.py) with the airport tables inside the workbook (qry_* sheets)."""
import json, warnings, collections, sys, os
warnings.filterwarnings('ignore')
import openpyxl
wb = openpyxl.load_workbook(os.environ.get('AMR_XLSM', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'AMR_Template_AZ.xlsm')), read_only=True, data_only=True)
def rows(n, ncol):
    out = []
    for r in wb[n].iter_rows(min_row=2, max_col=ncol, values_only=True):
        if r[0] is None: break
        out.append(r)
    return out
az = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'out', '2610', 'states', 'AZ.json')))['a']
W = {'ARPT': rows('qry_ARPT', 5), 'RWY': rows('qry_RWY', 2), 'APR': rows('qry_APR', 2), 'SID': rows('qry_SID', 2), 'STAR': rows('stars', 2), 'FRQ': rows('qry_DEP_FREQ', 4)}
bad = 0
for r in W['ARPT']:
    if r[0] not in az: continue
    a = az[r[0]]
    if (r[1], r[2], r[3], r[4]) != (a['n'], a['e'], a['c'], a['v']): bad += 1; print('ARPT diff', r, a['n'], a['e'], a['c'], a['v'])
def group(t):
    d = collections.defaultdict(list)
    for r in t: d[r[0]].append(r[1] if len(r) == 2 else tuple(r[1:]))
    return d
rw, ap, sd, st, fq = group(W['RWY']), group(W['APR']), group(W['SID']), group(W['STAR']), group(W['FRQ'])
n = 0
for i, a in az.items():
    n += 1
    for key, d, tr in (('r', rw, str), ('i', ap, str), ('d', sd, str), ('s', st, str)):
        got = [tr(x) for x in d.get(i, [])]; exp = a.get(key, [])
        if got != exp: bad += 1; print('diff', i, key, got, exp)
    got = [(t, nme, f.rstrip('M')) for t, nme, f in fq.get(i, [])]; exp = [tuple(x) for x in a.get('f', [])]
    if got != exp: bad += 1; print('diff freq', i, got, exp)
print(f'checked {n} airports against the workbook tables (name/elev/city/volume, runway ends, approaches, SIDs, STARs, freqs): {bad} differences; workbook ARPT rows={len(W["ARPT"])} (incl. non-AZ), app AZ airports={len(az)}')
sys.exit(1 if bad else 0)
