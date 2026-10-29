"""Airspace / control / handoff data for the Scripts (from NASR).  Used by build_data.py.

Adds to each airport record:
  t  = { tw: 1 (operating control tower in NASR ATC data) | 0,  op: tower operator code,  hr: tower hours text,  pt: 1 if part-time (hours != 24),
         cl: surface airspace class 'B'|'C'|'D'|'E'|'G',  ch: airspace hours remark (e.g. 'CLASS D SVC 0600-2000; OTHER TIMES CLASS E'),
         cd: [ {fac, ph, w?: 1 (only when the tower is closed), u?: 1 (if the first choice is unable)} ]   clearance-delivery phone numbers (airport remarks "FOR CD CTC ... AT ...")
         gco: {f, x}   GCO (ground communications outlet) frequency + remark, when NASR lists one }
  h  = { p: {id, k, call}  the approach/departure provider NASR lists for this airport (k: T terminal, A tower/RAPCON, C ARTCC),
         c: [ {id, call, k:'T', b: bearing deg airport->facility anchor, d: nm, f:[freqs], via: airport id the freqs are listed for} ]  terminal facilities whose
            service area reaches the airport (a served airport within 15 nm, or the airport itself),
         z: {id, call, f:[freqs], via, d} responsible ARTCC + the nearest RCAG frequency set (nm = distance to the airport the RCAG is listed for) }
"""
import csv, math, re, collections

ARTCC_CALL = {'ZAB':'ALBUQUERQUE','ZAN':'ANCHORAGE','ZAU':'CHICAGO','ZBW':'BOSTON','ZDC':'WASHINGTON','ZDV':'DENVER','ZFW':'FORT WORTH','ZHN':'HONOLULU',
 'ZHU':'HOUSTON','ZID':'INDIANAPOLIS','ZJX':'JACKSONVILLE','ZKC':'KANSAS CITY','ZLA':'LOS ANGELES','ZLC':'SALT LAKE','ZMA':'MIAMI','ZME':'MEMPHIS',
 'ZMP':'MINNEAPOLIS','ZNY':'NEW YORK','ZOA':'OAKLAND','ZOB':'CLEVELAND','ZSE':'SEATTLE','ZTL':'ATLANTA','ZUA':'GUAM','ZSU':'SAN JUAN'}
TERM = ('TRACON', 'ATCT-TRACON', 'ATCT-RAPCON', 'ATCT-RATCF', 'ATCT-A/C', 'CERAP')
NEAR_NM = 15.0       # a facility's area "reaches" an airport when one of the airports it serves is this close
MAX_ANCHOR_NM = 75.0

def rd(path): return csv.DictReader(open(path, encoding='utf-8-sig'))
def fl(x):
    try: return float(x)
    except Exception: return None
def nm(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1])); dl = lo2 - lo1
    c = math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(dl)
    return math.degrees(math.acos(max(-1, min(1, c)))) * 60
def brg(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1])); dl = lo2 - lo1
    y = math.sin(dl) * math.cos(la2); x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360
def f2(f):
    x = '%.3f' % float(f); return x[:-1] if x.endswith('0') else x
def vhf_first(fs): return sorted(fs, key=lambda x: float(x) >= 225.0)

PH = r'(\d{3}[-. ]\d{3}[-. ]\d{4})'
def parse_cd(text):
    """'FOR CD CTC TUCSON APCH AT 520-829-6121.  IF UNA, CTC PHOENIX APCH AT ...' -> [{fac, ph, w?, u?}]"""
    t = ' '.join(text.upper().split())
    if not re.search(r'\bCD\b|CLNC DEL|CLEARANCE DEL', t): return []
    out = []; closed = bool(re.search(r'WHEN (?:THE )?ATCT (?:IS )?CLSD|ATCT CLSD', t))
    for m in re.finditer(r'CTC\s+([A-Z][A-Z .&/\']*?)\s+(APCH|APPROACH|ARTCC|CERAP|CNTR|TRACON|CD|DEL)\b[^.]*?(?:AT|-|ON)\s*' + PH, t):
        fac = (m.group(1) + ' ' + m.group(2)).strip()
        pre = t[max(0, m.start() - 14):m.start()]
        d = {'fac': fac, 'ph': m.group(3).replace('.', '-').replace(' ', '-')}
        if closed: d['w'] = 1
        if re.search(r'IF UNA(?:BLE)?[ ,A-Z]*$', pre) or (out and re.search(r'IF UNA', t[max(0, m.start() - 40):m.start()])): d['u'] = 1
        out.append(d)
    return out

def attach(A, ID, raw, base_rows):
    """A: {id: record}, ID: {(ARPT_ID, STATE): id}.  base_rows: APT_BASE rows (all airports; for lat/lon + responsible ARTCC)."""
    pos, artcc_of, lid_of = {}, {}, {}
    for r in base_rows:
        la, lo = fl(r['LAT_DECIMAL']), fl(r['LONG_DECIMAL'])
        k = (r['ARPT_ID'], r['STATE_CODE'])
        if la is not None and lo is not None: pos[k] = (la, lo)
        artcc_of[k] = r['RESP_ARTCC_ID']
    rev = {v: k for k, v in ID.items()}

    # ---- tower / airspace class
    atc = {(r['FACILITY_ID'], r['STATE_CODE']): r for r in rd(f'{raw}/ATC_BASE.csv')}
    svc = collections.defaultdict(list)
    for r in rd(f'{raw}/ATC_SVC.csv'): svc[(r['FACILITY_ID'], r['STATE_CODE'])].append(r['CTL_SVC'])
    cls = {(r['ARPT_ID'], r['STATE_CODE']): r for r in rd(f'{raw}/CLS_ARSP.csv')}
    for i, d in A.items():
        k = rev[i]; t = {}
        r = atc.get(k)
        tw = 1 if (r and r['FACILITY_TYPE'] not in ('NON-ATCT', 'TRACON', 'ARTCC', 'CERAP')) else 0
        t['tw'] = tw
        if tw:
            if r['TWR_OPERATOR_CODE']: t['op'] = r['TWR_OPERATOR_CODE']
            hr = r['TWR_HRS'].strip()
            if hr: t['hr'] = hr
            if hr and hr != '24': t['pt'] = 1
        c = cls.get(k); letter = ''
        if c:
            for L in 'BCD':
                if c['CLASS_%s_AIRSPACE' % L] == 'Y': letter = L; break
            if not letter and c['CLASS_E_AIRSPACE'] == 'Y': letter = 'E'
            if c['AIRSPACE_HRS'].strip(): t['ch'] = c['AIRSPACE_HRS'].strip()
        if not letter and tw:
            m = re.search(r'CLASS ([BCDE])', ' '.join(svc.get(k, [])))
            if m: letter = m.group(1)
        t['cl'] = letter or 'G'
        d['t'] = t

    # ---- clearance delivery phones + GCO from the airport / ATC remarks
    rm = collections.defaultdict(list)
    for r in rd(f'{raw}/APT_RMK.csv'):
        if r['TAB_NAME'] in ('AIRPORT',): rm[(r['ARPT_ID'], r['STATE_CODE'])].append(r['REMARK'])
    for r in rd(f'{raw}/ATC_RMK.csv'): rm[(r['FACILITY_ID'], r['STATE_CODE'])].append(r['REMARK'])
    gco = {}
    for r in rd(f'{raw}/FRQ.csv'):
        if 'GCO' in r['FREQ_USE'].upper() or r['REMARK'].upper().startswith('GCO'):
            k = (r['SERVICED_FACILITY'], r['SERVICED_STATE'])
            if k not in gco and fl(r['FREQ']): gco[k] = {'f': f2(r['FREQ']), 'x': r['REMARK'].strip()}
    for i, d in A.items():
        k = rev[i]; cd = []
        for text in rm.get(k, []):
            for e in parse_cd(text):
                if e not in cd: cd.append(e)
            m = re.search(r'GCO[^.]*?FREQ[A-Z]* (\d{3}\.\d{1,3})', text.upper())
            if m and k not in gco: gco[k] = {'f': f2(m.group(1)), 'x': text.strip()}
        if cd: d['t']['cd'] = cd
        if k in gco: d['t']['gco'] = gco[k]

    # ---- terminal facilities: who they serve
    fac = {}
    for r in rd(f'{raw}/FRQ.csv'):
        if r['FACILITY_TYPE'] not in TERM or not (r['FREQ_USE'].startswith('APCH') or r['FREQ_USE'].startswith('DEP')): continue
        fv = fl(r['FREQ']); la, lo = fl(r['LAT_DECIMAL']), fl(r['LONG_DECIMAL'])
        if fv is None or la is None or not (108 <= fv <= 400): continue
        F = fac.setdefault(r['FACILITY'], {'call': collections.Counter(), 'served': {}, 'type': r['FACILITY_TYPE']})
        call = (r['PRIMARY_APPROACH_RADIO_CALL'] or r['TOWER_OR_COMM_CALL']).strip().upper()
        if call: F['call'][call] += 1
        s = F['served'].setdefault((r['SERVICED_FACILITY'], r['SERVICED_STATE']), {'p': (la, lo), 'f': []})
        v = f2(r['FREQ'])
        if v not in s['f']: s['f'].append(v)
    for fid, F in fac.items():
        F['call'] = F['call'].most_common(1)[0][0] if F['call'] else fid
        tow = [s['p'] for k, s in F['served'].items() if atc.get(k) and atc[k]['FACILITY_TYPE'].startswith('ATCT')] or [s['p'] for s in F['served'].values()]
        F['anchor'] = (sum(p[0] for p in tow) / len(tow), sum(p[1] for p in tow) / len(tow))

    # ---- responsible ARTCC frequencies (RCAG rows are listed for the airports they serve)
    rc = collections.defaultdict(list)       # artcc id -> [(pos, [freqs], airport, sectorization)]
    byk = {}
    for r in rd(f'{raw}/FRQ.csv'):
        if r['FACILITY_TYPE'] != 'RCAG': continue
        z = r['ARTCC_OR_FSS_ID']; fv = fl(r['FREQ']); la, lo = fl(r['LAT_DECIMAL']), fl(r['LONG_DECIMAL'])
        if not z or fv is None or la is None or not re.search(r'SVC PR(?:V|VD|VV)D BY|APCH/DEP', r['REMARK'].upper()): continue
        k = (r['SERVICED_FACILITY'], r['SERVICED_STATE'], r['FACILITY'], r['SECTORIZATION'])
        e = byk.setdefault(k, {'z': z, 'p': (la, lo), 'f': [], 'ap': r['SERVICED_FACILITY'], 'sec': r['SECTORIZATION'], 'call': r['PRIMARY_APPROACH_RADIO_CALL'].strip().upper()})
        v = f2(r['FREQ'])
        if v not in e['f']: e['f'].append(v)
    for e in byk.values(): rc[e['z']].append(e)

    for i, d in A.items():
        k = rev[i]; me = pos.get(k); h = {}
        r = atc.get(k)
        if r and r['APCH_P_PROVIDER']:
            h['p'] = {'id': r['APCH_P_PROVIDER'], 'k': r['APCH_P_PROV_TYPE_CD'], 'call': r['PRIMARY_APCH_RADIO_CALL'].strip().upper()}
        if me:
            c = []
            for fid, F in fac.items():
                if (k in F['served']): near, via = 0.0, k
                else:
                    best = min(((nm(me, s['p']), kk) for kk, s in F['served'].items()), default=(1e9, None))
                    near, via = best
                if near > NEAR_NM: continue
                if nm(me, F['anchor']) > MAX_ANCHOR_NM: continue
                fs = vhf_first(F['served'][via]['f'])
                c.append({'id': fid, 'call': F['call'], 'k': 'T', 'b': round(brg(me, F['anchor'])), 'd': round(nm(me, F['anchor'])), 'f': fs, 'via': via[0], 'n': round(near, 1)})
            c.sort(key=lambda e: (e['n'], e['d']))
            if c: h['c'] = c[:4]
            z = artcc_of.get(k)
            if z:
                best = None
                for e in rc.get(z, []):
                    dd = nm(me, e['p']); score = (0 if e['sec'] in ('LOW', '') else 1, dd)
                    if best is None or score < best[0]: best = (score, e, dd)
                zz = {'id': z, 'call': ARTCC_CALL.get(z, z)}
                if best and best[2] <= 80:
                    zz.update({'f': vhf_first(best[1]['f']), 'via': best[1]['ap'], 'd': round(best[2])})
                h['z'] = zz
        if h: d['h'] = h
