#!/usr/bin/env python3
"""FAA CIFP (ARINC 424-18) -> approach details used by the Scripts page.
For every instrument approach it extracts, from the published coding:
   iaf   initial approach fixes (transition names + fixes flagged IAF)           -> "cleared direct <IAF>"
   iafAlt altitude at the first IAF
   if    intermediate fix / final approach course fix                            -> "cross <fix> at or above <alt>"
   faf   final approach fix
   cross {fix, alt}  the fix and altitude to use for "cross ... at or above ..."  (IF / FACF)
   ma    plain-English published missed approach, maAlt its (hold / last) altitude
The d-TPP approach title ("ILS OR LOC RWY 12") is matched to the CIFP identifier ("I12", "L12", "R12-Y" ...).
Source: FAA CIFP, https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/ - the FAA asks to be told about errors;
see the notice on the app's Info tab.  Training/planning only."""
import re, collections

def parse(path):
    """-> {airport: {ident6: {'T': {trans: [legs]}, 'F': [legs]}}} ; leg = dict(seq, fix, desc, pt, ad, a1, a2, crs, tn)"""
    P = collections.defaultdict(lambda: collections.defaultdict(lambda: {'T': collections.defaultdict(list), 'F': []}))
    with open(path, encoding='latin-1') as f:
        for l in f:
            if l[4:5] != 'P' or l[12:13] != 'F' or l[38:39] != '0' and l[38:39] != '1': continue
            if l[38:39] != '0': continue                       # primary record only (continuation 0)
            apt = l[6:10].strip(); ident = l[13:19]; rt = l[19:20]
            leg = dict(seq=l[26:29], fix=l[29:34].strip(), desc=l[39:43], pt=l[47:49], ad=l[82:83], a1=l[84:89].strip(), a2=l[89:94].strip(),
                       crs=l[70:74].strip(), tn=l[43:44])
            if not leg['pt'].strip(): continue
            p = P[apt][ident]
            if rt == 'A': p['T'][l[20:25].strip()].append(leg)
            elif rt in 'IRLHSVDNQTXUBPJGWMZCYOEKF' and rt != 'A': p['F'].append(leg)
    return P

def alt(a):
    a = a.strip()
    if not a: return ''
    if a.startswith('FL'): return str(int(a[2:]) * 100) if a[2:].isdigit() else a
    return str(int(a)) if a.isdigit() else a

TYPE = [  # (regex on the d-TPP title, CIFP type letters in priority order)
    (r'^(?:HI-)?ILS\b.*\bOR LOC\b', 'IL'), (r'^(?:HI-)?ILS\b', 'I'), (r'^(?:HI-)?LOC\b.*\bBC\b|^(?:HI-)?LOC BACKCOURSE', 'B'), (r'^(?:HI-)?LOC\b', 'L'), (r'^(?:HI-)?LDA\b', 'X'),
    (r'^RNAV \(RNP\)', 'H'), (r'^RNAV \(GPS\)', 'R'), (r'^GPS\b', 'P'), (r'^GLS\b', 'J'),
    (r'^(?:HI-)?VOR/DME\b', 'DVS'), (r'^(?:HI-)?VOR\b', 'SVD'), (r'^(?:HI-)?TACAN\b', 'T'), (r'^NDB/DME\b', 'QN'), (r'^NDB\b', 'N'), (r'^SDF\b', 'U'), (r'^(?:HI-)?VORTAC\b', 'V')]

def keys(title):
    """candidate CIFP identifiers (6 chars) for a d-TPP title, best first"""
    t = title.upper().strip(); out = []
    typ = next((letters for rx, letters in TYPE if re.search(rx, t)), None)
    if not typ: return out
    m = re.search(r'\bRWY (\d{1,2}[LRC]?)\b', t)
    mult = re.search(r'\b(?:ILS|LOC|LDA|VOR|VOR/DME|TACAN|NDB|RNAV \((?:GPS|RNP)\)|GPS)(?:/DME)? ([XYZ])\b', t)
    suf = mult.group(1) if mult else ''
    if m:
        rw = m.group(1).rjust(2, '0')
        for c in typ: out.append((c + rw + (('-' if len(rw) == 2 else '') + suf if suf else '')).ljust(6))
    else:                                                # circling-only procedure: "RNAV (GPS)-A" -> RNV-A, "VOR/DME-A" -> VDM-A, "VOR-A" -> VOR-A
        m2 = re.search(r'-([A-Z])$', t)
        if m2:
            pre = {'R': 'RNV', 'H': 'RNV', 'V': 'VOR', 'D': 'VDM', 'N': 'NDB', 'P': 'GPS', 'L': 'LOC', 'X': 'LDA', 'T': 'TAC', 'Q': 'NDM', 'B': 'LBC'}
            for c in typ:
                if c in pre: out.append((pre[c] + '-' + m2.group(1)).ljust(6))
    return out

def pr_of(proc, title=''):
    T, F = proc['T'], proc['F']
    if not F and not T: return None
    code = lambda l, i: l['desc'][i:i + 1] if len(l['desc']) > i else ' '
    iaf = []; iafAlt = ''
    for tn, legs in T.items():
        for l in legs:
            if code(l, 3) in 'ACD' and code(l, 3) != ' ' and l['fix'] and l['fix'] not in iaf:
                iaf.append(l['fix']); iafAlt = iafAlt or alt(l['a1'])
        if tn and tn not in iaf and legs and not any(code(l, 3) in 'ACD' and code(l, 3) != ' ' for l in legs): iaf.append(tn); iafAlt = iafAlt or alt(legs[0]['a1'] or next((x['a1'] for x in legs if x['a1']), ''))
    ifx = next((l for L in list(T.values()) + [F] for l in L if code(l, 3) == 'B' and l['fix']), None) or next((l for l in F if code(l, 3) == 'I' and l['fix']), None)
    if ifx is None and F: ifx = next((l for l in F if l['fix'] and l['pt'] in ('IF', 'TF', 'CF')), None)
    faf = next((l for l in F if code(l, 3) in 'FD' and l['fix']), None)
    pr = {}
    if iaf: pr['iaf'] = iaf[:6]
    if iafAlt: pr['iafAlt'] = iafAlt
    if ifx:
        pr['if'] = ifx['fix']; fa = next((l for l in F if l['fix'] == ifx['fix'] and l['a1']), ifx)
        a = alt(fa['a1'] or ifx['a1'])
        if a: pr['cross'] = {'fix': ifx['fix'], 'alt': a}
    if faf: pr['faf'] = faf['fix']
    # missed approach: legs after the MAP (desc position 4 = 'M')
    mi = next((i for i, l in enumerate(F) if code(l, 3) == 'M'), None)
    if mi is not None:
        legs = F[mi + 1:]; parts = []; hold = None; lastalt = ''
        for l in legs:
            a = alt(l['a1']); pt = l['pt']
            if a: lastalt = a
            if pt in ('CA', 'VA', 'FA') and not parts: parts.append('Climb to ' + (a or '(published altitude)') + (' on heading ' + str(round(int(l['crs']) / 10)).zfill(3) if l['crs'].isdigit() else ''))
            elif pt in ('VI', 'CI', 'VM', 'FM') and not parts: parts.append('Climb' + (' on heading ' + str(round(int(l['crs']) / 10)).zfill(3) if l['crs'].isdigit() else ''))
            elif pt in ('HM', 'HA', 'HF'): hold = l; 
            elif pt in ('TF', 'DF', 'CF', 'RF', 'AF', 'IF') and l['fix']:
                parts.append(('then direct ' if pt == 'DF' else 'then to ') + l['fix'] + (' at or above ' + a if a and l['ad'] in '+' else (' ' + a if a else '')))
        if hold: parts.append('hold at ' + hold['fix'] + (' at ' + alt(hold['a1']) if alt(hold['a1']) else ''))
        if parts:
            pr['ma'] = ', '.join(parts) + '.'
            pr['maAlt'] = alt(hold['a1']) if hold and alt(hold['a1']) else lastalt
    return pr or None

def attach(A, P):
    """A = {airport id: record with 'i' approach titles} ; adds rec['pr'][title] when CIFP has the procedure. Returns (airports, matched, total)"""
    n = m = ap = 0
    for i, rec in A.items():
        procs = P.get(i) or P.get(i[1:] if len(i) == 4 and i[0] == 'K' else '#none') or P.get('K' + i)
        titles = rec.get('i') or []
        if not titles: continue
        got = {}
        for t in titles:
            n += 1
            if not procs: continue
            for k in keys(t):
                pr = pr_of(procs[k], t) if k in procs else None
                if pr: got[t] = pr; break
        if got: rec['pr'] = got; ap += 1; m += len(got)
    return ap, m, n
