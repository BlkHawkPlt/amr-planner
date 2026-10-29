#!/usr/bin/env python3
"""FAA NASR + d-TPP  ->  compact per-state JSON for the AMR web app.

Usage:
  python3 build_data.py --raw raw/2026-10-01 --tpp-cycle 2610 --states AZ --out out/2610
  python3 build_data.py --raw raw/2026-10-29 --tpp-cycle 2611 --states ALL --out out-all/2611

Inputs (flat dir made by fetch_data.py):
  APT_BASE.csv APT_RWY_END.csv FRQ.csv DP_BASE.csv DP_RTE.csv dtpp.xml  (+ optional AWOS.csv for the weather-station type/phone)

Conventions copied from the AMR workbook (qry_* sheets):
  * airport id   = ICAO_ID if present else FAA LID (ARPT_ID)         e.g. KTUS, P08, 02AZ
  * airport name = "<ARPT_NAME>(<ARPT_ID>)"                           e.g. TUCSON INTL(TUS)
  * runway ends  = leading zeros stripped                             04 -> 4, 06L -> 6L, H1
  * approaches / SIDs / STARs = d-TPP chart names, "CONT.n" pages merged, deleted charts skipped
  * departure/approach freq = terminal APP/DEP + RCAG-served CNTR rows (VHF only)
Facility filter ("training", default): open airports/heliports that are public-use OR military OR
any heliport.  Drops private-use airstrips, ultralight parks, gliderports, seaplane bases,
balloonports.  (--filter all keeps everything open.)
"""
import argparse, collections, csv, datetime, gzip, json, os, re, sys
import xml.etree.ElementTree as ET

ARTCC = {'ZAB':'ALBUQUERQUE','ZAN':'ANCHORAGE','ZAU':'CHICAGO','ZBW':'BOSTON','ZDC':'WASHINGTON','ZDV':'DENVER',
 'ZFW':'FORT WORTH','ZHN':'HONOLULU','ZHU':'HOUSTON','ZID':'INDIANAPOLIS','ZJX':'JACKSONVILLE','ZKC':'KANSAS CITY',
 'ZLA':'LOS ANGELES','ZLC':'SALT LAKE CITY','ZMA':'MIAMI','ZME':'MEMPHIS','ZMP':'MINNEAPOLIS','ZNY':'NEW YORK',
 'ZOA':'OAKLAND','ZOB':'CLEVELAND','ZSE':'SEATTLE','ZTL':'ATLANTA','ZUA':'GUAM','ZSU':'SAN JUAN'}
TERM = ('TRACON','ATCT-TRACON','ATCT-RAPCON','ATCT-RATCF','ATCT-A/C','CERAP','ATCT')
MIL_OWN = ('MA','MN','MR','MF','CG')
SITE = {'A':'airport','H':'heliport','G':'gliderport','U':'ultralight','S':'seaplane','B':'balloonport'}

def rd(path):
    return csv.DictReader(open(path, encoding='utf-8-sig'))

def vhf(f):
    try: x = float(f)
    except Exception: return False
    return 118.0 <= x <= 136.975

def rwy_norm(s):
    s = s.strip()
    m = re.fullmatch(r'0*(\d+[A-Z]?)', s)
    return m.group(1) if m else s

def kind(r):
    mil = r['OWNERSHIP_TYPE_CODE'] in MIL_OWN
    use = 'MIL' if mil else ('PU' if r['FACILITY_USE_CODE'] == 'PU' else 'PR')
    return use + '-' + r['SITE_TYPE_CODE']

def keep(r, flt):
    if r['ARPT_STATUS'] != 'O': return False
    if flt == 'all': return True
    k = kind(r)
    return k.startswith('MIL') or k.startswith('PU') or r['SITE_TYPE_CODE'] == 'H'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    ap.add_argument('--tpp-cycle', required=True)
    ap.add_argument('--nasr-date', help='YYYY-MM-DD (default: from APT_BASE EFF_DATE)')
    ap.add_argument('--states', default='AZ', help='comma list of 2-letter codes, or ALL')
    ap.add_argument('--filter', default='training', choices=['training', 'all'])
    ap.add_argument('--out', required=True)
    ap.add_argument('--cifp', help='path to FAACIFP18 (FAA CIFP, ARINC 424): adds IAF/IF/FAF/crossing altitudes and missed approach text (pr) per approach')
    a = ap.parse_args()
    raw = a.raw
    os.makedirs(os.path.join(a.out, 'states'), exist_ok=True)

    base = [r for r in rd(f'{raw}/APT_BASE.csv')]
    nasr_date = a.nasr_date or base[0]['EFF_DATE'].replace('/', '-')
    want = None if a.states.upper() == 'ALL' else set(s.strip().upper() for s in a.states.split(','))
    sel = [r for r in base if keep(r, a.filter) and (want is None or r['STATE_CODE'] in want)]
    mkid = lambda r: r['ICAO_ID'] or r['ARPT_ID']
    ID = {(r['ARPT_ID'], r['STATE_CODE']): mkid(r) for r in sel}
    ids = [mkid(r) for r in sel]
    dup = [k for k, v in collections.Counter(ids).items() if v > 1]
    assert not dup, f'duplicate airport ids: {dup[:10]}'
    LID2ID = collections.defaultdict(list)       # ARPT_ID -> [(state,id)]
    for (lid, st), i in ID.items(): LID2ID[lid].append((st, i))

    A = {}
    for r in sel:
        i = mkid(r)
        e = r['ELEV']
        try: lat = round(float(r['LAT_DECIMAL']), 4); lon = round(float(r['LONG_DECIMAL']), 4)
        except Exception: lat = lon = None
        A[i] = dict(n=f"{r['ARPT_NAME'].strip()}({r['ARPT_ID']})",
                    e=int(round(float(e))) if e else None,
                    c=f"{r['CITY']}, {r['STATE_CODE']}", k=kind(r), _st=r['STATE_CODE'], _lid=r['ARPT_ID'])
        if lat is not None: A[i]['p'] = [lat, lon]

    # runway ends (file order preserved, de-duplicated)
    for r in rd(f'{raw}/APT_RWY_END.csv'):
        i = ID.get((r['ARPT_ID'], r['STATE_CODE']))
        if not i: continue
        v = rwy_norm(r['RWY_END_ID'])
        L = A[i].setdefault('r', [])
        if v not in L: L.append(v)

    # d-TPP: approaches / SIDs / STARs + SIAP volume
    root = ET.parse(f'{raw}/dtpp.xml').getroot()
    cyc = root.get('cycle')
    assert cyc == a.tpp_cycle, f'dtpp cycle {cyc} != {a.tpp_cycle}'
    def tpp_dt(s):   # "0901Z  10/01/26"
        m = re.match(r'(\d\d)(\d\d)Z\s+(\d\d)/(\d\d)/(\d\d)', s)
        return f'20{m.group(5)}-{m.group(3)}-{m.group(4)}T{m.group(1)}:{m.group(2)}Z'
    tfrom, tto = tpp_dt(root.get('from_edate')), tpp_dt(root.get('to_edate'))
    tgt = {'IAP': 'i', 'DP': 'd', 'ODP': 'd', 'STR': 's'}
    seen_tpp = set(); vols = collections.defaultdict(collections.Counter)
    for st in root:
        for city in st:
            vol = city.get('volume')
            for apt in city:
                lid = apt.get('apt_ident')
                for (s2, i) in LID2ID.get(lid, []):
                    if A[i]['_st'] != st.get('ID') and A[i]['_st'] != s2: continue
                    seen_tpp.add(i)
                    A[i]['v'] = vol; vols[A[i]['_st']][vol] += 1
                    for rec in apt:
                        code = rec.find('chart_code').text
                        k = tgt.get(code)
                        if not k or rec.find('useraction').text == 'D': continue
                        nm = re.sub(r',\s*CONT\.?\s*\d*$', '', rec.find('chart_name').text.strip())
                        L = A[i].setdefault(k, [])
                        if nm not in L: L.append(nm)
    for i, d in A.items():           # airports with no charts inherit the state's most common volume
        if 'v' not in d and vols[d['_st']]: d['v'] = vols[d['_st']].most_common(1)[0][0]

    # SID transitions from NASR DP data
    dpb = list(rd(f'{raw}/DP_BASE.csv'))
    trans = collections.defaultdict(list)   # DP_COMPUTER_CODE -> [names]
    for r in rd(f'{raw}/DP_RTE.csv'):
        if r['ROUTE_PORTION_TYPE'] == 'TRANSITION':
            n = re.sub(r'\s*TRANSITION$', '', r['ROUTE_NAME']).strip()
            if n not in trans[r['DP_COMPUTER_CODE']]: trans[r['DP_COMPUTER_CODE']].append(n)
    for r in dpb:
        pref = f"{r['DP_NAME']} {r['AMENDMENT_NO']}"
        tr = trans.get(r['DP_COMPUTER_CODE'])
        if not tr: continue
        for lid in r['SERVED_ARPT'].split():
            for (s2, i) in LID2ID.get(lid, []):
                for nm in A[i].get('d', []):
                    if nm == pref or nm.startswith(pref + ' '):
                        A[i].setdefault('x', {})[nm] = tr

    # frequencies
    seen = set()
    def addf(i, t, n, f):
        fs = '%.3f' % float(f); k = (i, t, n, fs)
        if k in seen: return
        seen.add(k); A[i].setdefault('f', []).append([t, n, fs])
    for r in rd(f'{raw}/FRQ.csv'):
        i = ID.get((r['SERVICED_FACILITY'], r['SERVICED_STATE']))
        if not i or not vhf(r['FREQ']): continue
        fu, ft, rem = r['FREQ_USE'], r['FACILITY_TYPE'], r['REMARK'].upper()
        if ft in TERM and (fu.startswith('APCH/P') or fu.startswith('DEP/P')):
            call = (r['PRIMARY_APPROACH_RADIO_CALL'] or r['TOWER_OR_COMM_CALL']).strip().upper()
            addf(i, 'A/D', (call + ' APP/DEP').strip(), r['FREQ'])
        elif ft == 'RCAG':
            m = re.search(r"(?:SVC|SERVICE) PR(?:V|VD|VV)D BY ([A-Z.' ]+?) (ARTCC|CERAP|CNTR)", rem)
            if not m: continue
            if m.group(2) == 'CERAP':
                u = re.search(r'USE:([^;]*)', rem)
                if not u or not re.search(r'APCH|DEP', u.group(1)): continue
                addf(i, 'A/D', m.group(1).strip() + ' APP/DEP', r['FREQ'])
            else:
                z = r['ARTCC_OR_FSS_ID']
                addf(i, 'CNTR', ARTCC.get(z, m.group(1).strip()) + ' CNTR', r['FREQ'])


    # ---- richer facility data for the Scripts page (does not touch the workbook-compatible 'f' list) ----
    #  g.tc  tower call sign      g.hr tower hours      g.T tower  g.G ground  g.C clearance delivery  g.I ATIS/D-ATIS
    #  g.U UNICOM   g.F CTAF      g.A approach/departure (VHF then UHF)      g.ac approach radio call
    #  w = {t: 'ASOS'|'AWOS-3PT'.., p: phone, f: radio frequency (when NASR lists one)}
    def fnum(f):
        try: return float(f)
        except Exception: return None
    def fmt(f): return ('%.3f' % float(f)).rstrip('0').rstrip('.') if '.' in ('%.3f' % float(f)) else f
    def fmt2(f):
        x = '%.3f' % float(f)
        return x[:-1] if x.endswith('0') else x          # 118.3 -> 118.30 style trimmed to >=2 decimals
    CAT = [('LCL/P', 'T'), ('LCL/S', 'T'), ('LCL', 'T'), ('GND/P', 'G'), ('GND/S', 'G'), ('CD/P', 'C'), ('CD/S', 'C'), ('D-ATIS', 'I'), ('ATIS', 'I'),
           ('UNICOM', 'U'), ('CTAF', 'F')]
    G = collections.defaultdict(lambda: collections.defaultdict(list))
    ENT = {'ATCT', 'ATCT-TRACON', 'ATCT-A/C', 'ATCT-RAPCON', 'ATCT-RATCF', 'NON-ATCT'}
    for r in rd(f'{raw}/FRQ.csv'):
        i = ID.get((r['SERVICED_FACILITY'], r['SERVICED_STATE']))
        if not i: continue
        fu, ft = r['FREQ_USE'].strip(), r['FACILITY_TYPE']
        fv = fnum(r['FREQ'])
        if fv is None or not (108.0 <= fv <= 400.0): continue
        key = None
        if ft in ENT:
            for pre, k in CAT:
                if fu == pre or (pre in ('LCL/P', 'LCL/S', 'GND/P', 'GND/S', 'CD/P', 'CD/S') and fu == pre): key = k; break
            if fu in ('LCL/P', 'LCL/S', 'GND/P', 'GND/S', 'CD/P', 'CD/S', 'ATIS', 'D-ATIS', 'UNICOM', 'CTAF', 'LCL'):
                pass
            if key and ft != 'NON-ATCT' and r['TOWER_OR_COMM_CALL'] and 'tc' not in G[i]:
                G[i]['tc'] = r['TOWER_OR_COMM_CALL'].strip().upper(); G[i]['hr'] = r['TOWER_HRS'].strip()
        elif ft in TERM or ft in ('TRACON', 'CERAP'):
            if fu.startswith('APCH/P') or fu.startswith('DEP/P'):
                key = 'A'
                call = (r['PRIMARY_APPROACH_RADIO_CALL'] or r['TOWER_OR_COMM_CALL']).strip().upper()
                if call and 'ac' not in G[i]: G[i]['ac'] = call
        elif ft == 'ASOS_AWOS':
            G[i]['_wf'] = r['FREQ']
            continue
        if key:
            f2 = fmt2(r['FREQ'])
            if f2 not in G[i][key]: G[i][key].append(f2)
    WX = {}
    awp = f'{raw}/AWOS.csv'
    if os.path.exists(awp):
        for r in rd(awp):
            i = ID.get((r['ASOS_AWOS_ID'], r['STATE_CODE']))
            if not i or i in WX: continue
            w = {'t': r['ASOS_AWOS_TYPE'].strip()}
            if r['PHONE_NO'].strip(): w['p'] = r['PHONE_NO'].strip()
            if r['SECOND_PHONE_NO'].strip(): w['p2'] = r['SECOND_PHONE_NO'].strip()
            WX[i] = w
    for i, d in G.items():
        wf = d.pop('_wf', None)
        if wf and i in WX: WX[i]['f'] = fmt2(wf)
        elif wf and i not in WX: WX[i] = {'t': 'AWOS', 'f': fmt2(wf)}
        gg = {}
        for k in ('T', 'G', 'C', 'I', 'U', 'F', 'A'):
            v = sorted(d.get(k, []), key=lambda x: (float(x) >= 225.0))      # VHF first, UHF after (stable)
            if v: gg[k] = v
        for k in ('tc', 'hr', 'ac'):
            if d.get(k): gg[k] = d[k]
        if gg: A[i]['g'] = gg
    for i, w in WX.items():
        if i in A:
            if w.get('f') is None and i in G and False: pass
            A[i]['w'] = w

    if a.cifp and os.path.exists(a.cifp):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import cifp as C
        na, nm, nt = C.attach(A, C.parse(a.cifp)); print(f'CIFP: procedure details for {nm} of {nt} approaches at {na} airports')
    # write per-state files
    cyc_info = dict(tpp=cyc, nasr=nasr_date, from_=tfrom, to=tto)
    cyc_info = {'tpp': cyc, 'nasr': nasr_date, 'from': tfrom, 'to': tto}
    by = collections.defaultdict(dict)
    for i, d in A.items():
        st = d.pop('_st') or 'XX'; d.pop('_lid')   # XX = no state code (Marshall Is., Palau, foreign border strips...)
        d['c'] = d['c'].rstrip(', ')
        by[st][i] = dict(sorted(d.items()))
    sizes = {}
    index = []
    for st, ap_ in sorted(by.items()):
        ap_ = dict(sorted(ap_.items()))
        doc = {'state': st, 'cycle': cyc_info, 'filter': a.filter, 'count': len(ap_), 'a': ap_}
        p = os.path.join(a.out, 'states', f'{st}.json')
        s = json.dumps(doc, separators=(',', ':'), ensure_ascii=False)
        open(p, 'w', encoding='utf-8').write(s)
        sizes[st] = (len(s.encode()), len(gzip.compress(s.encode(), 9)), len(ap_))
        for i, d in ap_.items(): index.append([i, d['n'], d['c'], d.get('p', [None, None])[0], d.get('p', [None, None])[1]])
    man = {'cycle': cyc_info, 'filter': a.filter, 'states': {k: dict(airports=v[2], bytes=v[0], gzip=v[1]) for k, v in sizes.items()}}
    json.dump(man, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
    s = json.dumps(index, separators=(',', ':'), ensure_ascii=False)
    open(os.path.join(a.out, 'index.json'), 'w', encoding='utf-8').write(s)
    tot = sum(v[0] for v in sizes.values()); totz = sum(v[1] for v in sizes.values())
    print(f'cycle {cyc} (NASR {nasr_date}) {tfrom} -> {tto}')
    print(f'{len(A)} airports in {len(by)} state files; raw {tot/1e6:.2f} MB, gzip {totz/1e6:.2f} MB; index.json {len(s)/1e6:.2f} MB')
    if len(sizes) <= 5:
        for st, v in sizes.items(): print(f'  {st}: {v[2]} airports, {v[0]/1e3:.0f} kB raw, {v[1]/1e3:.0f} kB gz')

if __name__ == '__main__': main()
