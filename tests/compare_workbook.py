#!/usr/bin/env python3
"""Run identical inputs through the ORIGINAL workbook (recalculated by LibreOffice) and the app's model.js, then diff.
   python3 compare_workbook.py [--compat]"""
import re, zipfile, subprocess, os, shutil, json, sys, copy, datetime, warnings
warnings.filterwarnings('ignore')
import openpyxl
HERE = os.path.dirname(os.path.abspath(__file__)); WB = os.environ.get('AMR_XLSM', os.path.join(HERE, '..', 'AMR_Template_AZ.xlsm'))
sys.path.insert(0, HERE)
compat = '--compat' in sys.argv
OUT = os.path.join(HERE, 'wb_run'); shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT + '/out')
import importlib.util
M = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('../site/js/model.js').defaultMission('2026-10-28')))"]))

def mk(**kw):
    m = copy.deepcopy(M)
    for k, v in kw.items():
        if isinstance(v, dict) and isinstance(m.get(k), dict):
            for kk, vv in v.items():
                if isinstance(vv, dict) and isinstance(m[k].get(kk), dict): m[k][kk].update(vv)
                else: m[k][kk] = vv
        else: m[k] = v
    return m
# the workbook still keys devices by colour name; the app uses tail numbers
WB_DEV = {'78724': 'GOLD 2', '78730': 'RED 2'}
SC = {}
SC['S1_KTUS_KRYN_KDMA'] = mk(acft='UH-72', device='78724',
    dep=dict(id='KTUS', wind='090', ws='10', vis='1 FG', ct='OVC', ceil='002', temp='18', dp='17', altim='29.92', wx='ATIS', apr='RNAV (GPS) RWY 04', rwy='4', sid='TUCSON NINE', trans='MESCA', cd='ATC', maint='060', exp='100', min='10'),
    d1=dict(id='KRYN', wind='120', ws='8', vis='1/2 FG', ct='BKN', ceil='004', temp='12', dp='11', altim='29.87', wx='ASOS', apr='ILS OR LOC RWY 06R', rwy='6R', tvis='1/4 FG', tcl='VV 001', ac='RNAV within TAA'),
    d2=dict(id='KDMA', wind='310', ws='14', vis='2 -RA', ct='OVC', ceil='006', temp='20', dp='19', altim='29.93', wx='AWOS', apr='TACAN Y RWY 13', rwy='13', ac='Vector Non RNAV'),
    fp=dict(etd='1930', tas='110', alt1='040', alt2='060', hold='10', v1='18', x1='10', w1='0', v2='45', x2='12', w2='2', v3='30', x3='8', w3='4', fob='3+00'),
    f1751=dict(briefTime='1900', init='EO'), amr=dict(unit='TEST UNIT / KXXX', wb='KXXX / 01 JAN 26'))
SC['S2_02AZ_KPHX_KFLG'] = mk(acft='UH-60M', device='78730',
    dep=dict(id='02AZ', wind='VRB', ws='5', vis='3 BR', ct='BKN', ceil='015', temp='25', dp='15', altim='30.12', wx='AWOS', apr='', rwy='H1', sid='', trans='', cd='RELAY', maint='040', exp='', min='10'),
    d1=dict(id='KPHX', wind='250', ws='12', vis='2 HZ', ct='OVC', ceil='008', temp='30', dp='20', altim='29.81', wx='ATIS', apr='ILS OR LOC RWY 25L', rwy='25L', star='EAGUL SIX (RNAV)', tvis='', tcl='', ac='NON RNAV Pub Rte'),
    d2=dict(id='KFLG', wind='200', ws='20', vis='1 SN', ct='VV', ceil='001', temp='-2', dp='-3', altim='30.05', wx='ATIS', apr='RNAV (GPS) RWY 21', rwy='21', ac='RNAV No TAA', tvis='1/2 FZFG', tcl='VV 000'),
    fp=dict(etd='2245', tas='120', alt1='080', alt2='100', hold='15', v1='80', x1='0', w1='0', v2='110', x2='0', w2='0', v3='60', x3='0', w3='0'),
    f1751=dict(briefTime='2215', init='AB'), noAlt=True)

def colnum(c):
    n = 0
    for ch in c: n = n * 26 + ord(ch) - 64
    return n
def cellxml(ref, v, s=None):
    st = f' s="{s}"' if s else ''
    if v is None or v == '': return f'<c r="{ref}"{st}/>'
    if isinstance(v, (int, float)): return f'<c r="{ref}"{st}><v>{v}</v></c>'
    if isinstance(v, tuple) and v[0] == 'f': return f'<c r="{ref}"{st}><f>{v[1]}</f></c>'
    v = str(v).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<c r="{ref}"{st} t="inlineStr"><is><t xml:space="preserve">{v}</t></is></c>'
def setcell(xml, ref, v):
    pat = re.compile(rf'<c r="{ref}"([^>]*?)(?:/>|>.*?</c>)', re.S)
    m = pat.search(xml)
    if m:
        s = re.search(r' s="(\d+)"', m.group(1)); return xml[:m.start()] + cellxml(ref, v, s.group(1) if s else None) + xml[m.end():]
    r = int(re.search(r'\d+', ref).group()); col = colnum(re.match(r'[A-Z]+', ref).group())
    rm = re.search(rf'(<row r="{r}"[^>]*>)(.*?)(</row>)', xml, re.S)
    if not rm:
        rm2 = re.search(r'(<row r="(\d+)"[^>]*>)', xml)
        # insert a new row before the first row with larger number
        for x in re.finditer(r'<row r="(\d+)"', xml):
            if int(x.group(1)) > r: return xml[:x.start()] + f'<row r="{r}">{cellxml(ref, v)}</row>' + xml[x.start():]
        return xml.replace('</sheetData>', f'<row r="{r}">{cellxml(ref, v)}</row></sheetData>')
    cells = list(re.finditer(r'<c r="([A-Z]+)\d+"[^>]*?(?:/>|>.*?</c>)', rm.group(2), re.S)); pos = len(rm.group(2))
    for c in cells:
        if colnum(c.group(1)) > col: pos = c.start(); break
    inner = rm.group(2)[:pos] + cellxml(ref, v) + rm.group(2)[pos:]
    return xml[:rm.start()] + rm.group(1) + inner + rm.group(3) + xml[rm.end():]
def numish(v):
    try: return int(v) if re.fullmatch(r'-?\d+', str(v)) else float(v)
    except Exception: return v
def hhmm_frac(t):
    t = str(t).zfill(4); return (int(t[:2]) * 60 + int(t[2:])) / 1440
def cells_for(m):
    D, A, B = m['dep'], m['d1'], m['d2']; cs = {}  # (sheetno, ref) -> value
    def put(ref, v, sh=2): cs[(sh, ref)] = v
    put('A4', D['id']); put('A6', D['wind']); put('B6', numish(D['ws'])); put('A8', D['vis']); put('C8', D['apr']); put('A10', D['ct']); put('B10', D['ceil'])
    put('C10', numish(D['rwy'])); put('C12', D['sid']); put('C14', D['trans']); put('A12', numish(D['temp'])); put('B12', numish(D['dp'])); put('A14', float(D['altim']))
    put('E3', D['wx']); put('E6', D['cd']); put('A17', D['maint']); put('B17', D['exp']); put('C17', numish(D['min']))
    put('E10', WB_DEV.get(m['device'], m['device'])); put('E15', m['acft'])
    for k, (base, wxr, acr) in {'d1': (20, 'E19', 'E22'), 'd2': (34, 'E33', 'E36')}.items():
        x = m[k]; o = base
        put(f'A{o}', x['id']); put(f'A{o+2}', x['wind']); put(f'B{o+2}', x['ws']); put(f'A{o+4}', x['vis']); put(f'C{o+2}', x['apr']); put(f'A{o+6}', x['ct']); put(f'B{o+6}', x['ceil'])
        put(f'C{o+4}', numish(x['rwy'])); put(f'C{o+6}', x['star']); put(f'A{o+8}', numish(x['temp'])); put(f'B{o+8}', numish(x['dp'])); put(f'A{o+10}', float(x['altim']))
        put(f'C{o+8}', x.get('tvis', '')); put(f'C{o+10}', x.get('tcl', '')); put(wxr, x['wx']); put(acr, x['ac'])
    put('E25', 'X' if m['noAlt'] else '')
    # AMR
    a = m['amr']; put('B25', numish(m['fp']['tas']), 4); put('C17', a['wb'], 4); put('C18', a['unit'], 4); put('E3', a['purpose'], 4); put('D4', a['who'], 4)
    put('D5', a['nav1'], 4); put('D6', a['nav2'], 4)
    for i, r in enumerate([31, 32, 33]):
        put(f'A{r}', a['crew'][i]['name'], 4); put(f'B{r}', a['crew'][i]['rank'], 4)
    put('C33', a['crew'][2].get('org', ''), 4); put('A28', a['pax']['name'], 4)
    # DD 175
    f = m['fp']; put('G5', hhmm_frac(f['etd']), 8); put('I5', f['alt1'], 8); put('I6', f['alt2'], 8); put('U13', numish(f['hold']), 8)
    for k in ('v', 'x', 'w'):
        for i in (1, 2, 3): put(f'{k.upper()}{4+i}', numish(f[f'{k}{i}']) if f[f'{k}{i}'] != '' else None, 8)
    put('A18', f['fob'], 8)
    # 175-1
    put('A58', numish(m['f1751']['briefTime']), 3); put('Z58', m['f1751']['init'], 3)
    return cs
LISTS = [('listDEP_RWY', 'dep'), ('listDEP_APR', 'dep'), ('listSID', 'dep'), ('listDEST1_RWY', 'd1'), ('listDEST1_APR', 'd1'), ('listDEST1_star', 'd1'), ('listDEST2_RWY', 'd2'), ('listDEST2_APR', 'd2'), ('listDEST2_STAR', 'd2')]
NL = 24
src = zipfile.ZipFile(WB)
names = []
for name, m in SC.items():
    cs = cells_for(m)
    # list probes on Cheat Sheet rows 60..: INDEX(list,n)
    for li, (ln, _) in enumerate(LISTS):
        for n in range(1, NL + 1):
            cs[(2, f'{chr(65 + n // 26 - 1) if n >= 26 else ""}{chr(65 + n % 26)}{70 + li}'.replace('@', ''))] = ('f', f'IFERROR(INDEX({ln},{n}),"")')
    sheets = {}
    for (sh, ref), v in cs.items():
        sheets.setdefault(sh, src.read(f'xl/worksheets/sheet{sh}.xml').decode())
        sheets[sh] = setcell(sheets[sh], ref, v)
    fn = f'{OUT}/{name}.xlsm'
    with zipfile.ZipFile(fn, 'w', zipfile.ZIP_DEFLATED) as z:
        for zi in src.infolist():
            sh = re.fullmatch(r'xl/worksheets/sheet(\d+)\.xml', zi.filename)
            data = sheets[int(sh.group(1))].encode() if sh and int(sh.group(1)) in sheets else src.read(zi.filename)
            if zi.filename == 'xl/workbook.xml': data = data.replace(b'<calcPr calcId="191028"/>', b'<calcPr calcId="191028" fullCalcOnLoad="1"/>')
            z.writestr(zi.filename, data)
    names.append(name)
print('recalculating in LibreOffice ...')
subprocess.run(['soffice', '-env:UserInstallation=file:///tmp/lo_prof', '--headless', '--convert-to', 'xlsx', '--outdir', OUT + '/out'] + [f'{OUT}/{n}.xlsm' for n in names], capture_output=True, timeout=600)
json.dump(SC, open(OUT + '/scenarios.json', 'w'))
app = json.loads(subprocess.check_output(['node', HERE + '/model_eval.js', OUT + '/scenarios.json', '1' if compat else '0']))
SHEET = {'CS': 'Cheat Sheet', 'Calls': 'Calls', 'AMR': 'AMR', 'D175': 'DD 175', 'I1751': '175-1', 'Grade': 'Grade Sheet'}
def norm(v):
    if v is None: return ''
    if isinstance(v, datetime.timedelta): mins = int(round(v.total_seconds() / 60 - 1e-9)); return v
    if isinstance(v, float) and v == int(v): return str(int(v))
    return str(v)
tot = bad = 0; report = []; known = []
def explain(name, key, w, a, m):
    etd = m['fp']['etd']
    if key == 'D175.K13': return 'CHAR(174) (registered-mark) is encoded differently by LibreOffice; same glyph in Excel'
    if key == 'Grade.A10': return 'workbook says "Hover Taxi via"; the app (v1.5) uses the plain ground clearance "taxi to RWY xx via <taxi route>" (wheeled aircraft)'
    if key == 'Grade.N39': return 'workbook typo "Farhenheit" corrected'
    if key == 'Grade.N40': return 'workbook prints the colour device name; the app prints the tail number (v1.3 removed colour labels)'
    if key == 'I1751.Q4' and w == a.rstrip('Z'): return 'app appends the Z shown in the form'
    if key in ('I1751.Q4', 'AMR.A4') and '1930' in str(w) and etd != '1930' and str(w).replace('1930', etd) == str(a).replace('1930', etd) or (key in ('I1751.Q4',) and str(w).replace('1930', etd) + 'Z' == a): return 'workbook hard-codes ETD 1930; app uses the plan ETD'
    if key.startswith('I1751.A') and w == 'DEST/ALTN' and a == '': return 'workbook labels unused forecast rows DEST/ALTN; app leaves unused rows empty'
    if key == 'AMR.A7' and str(w).startswith('Allow 10 minutes') and 'Allow ' + str(m['fp']['hold']) + ' minutes' in str(a): return 'workbook hard-codes 10 minutes on the ground; app uses the ground-time input'
    if key in ('D175.Q16', 'D175.R16', 'D175.S16'):
        try:
            if int(float(w) + 0.5) == float(a): return 'workbook cell is formatted to 0 decimals; app shows the rounded value'
        except Exception: pass
    return None
for name in names:
    wb = openpyxl.load_workbook(f'{OUT}/out/{name}.xlsx', data_only=True)
    # dropdown list comparison
    cs = wb['Cheat Sheet']
    for li, (ln, k) in enumerate(LISTS):
        got = []
        for n in range(1, NL + 1):
            ref = f'{chr(65 + n // 26 - 1) if n >= 26 else ""}{chr(65 + n % 26)}{70 + li}'
            v = cs[ref].value
            if v not in (None, ''): got.append(str(int(v)) if isinstance(v, float) and v == int(v) else str(v))
        a = {'dep': SC[name]['dep']['id'], 'd1': SC[name]['d1']['id'], 'd2': SC[name]['d2']['id']}[k]
        j = json.loads(subprocess.check_output(['node', '-e', f"const d=require('../site/data/2610/AZ.json').a['{a}']||{{}};const f={{listDEP_RWY:'r',listDEST1_RWY:'r',listDEST2_RWY:'r',listDEP_APR:'i',listDEST1_APR:'i',listDEST2_APR:'i',listSID:'d',listDEST1_star:'s',listDEST2_STAR:'s'}}['{ln}'];console.log(JSON.stringify(d[f]||[]))"]))
        tot += 1
        # the workbook sorts each airport's rows alphabetically (data sheets are sorted); app keeps FAA order -> compare as sets, and report order difference
        ok = list(map(str, j)) == got
        if not ok: bad += 1; report.append(f'[{name}] LIST {ln}({a}): workbook={got} app={j}')
    for key, val in app[name].items():
        sh, ref = key.split('.', 1)
        wv = wb[SHEET[sh]][ref].value
        av = val
        if sh in ('D175',) and ref in ('G12', 'G14', 'S12', 'S14', 'E18'):
            if isinstance(wv, datetime.time): wv = f'{wv.hour:02d}{wv.minute:02d}'
            elif isinstance(wv, datetime.datetime): wv = f'{wv.hour:02d}{wv.minute:02d}'
            elif isinstance(wv, datetime.timedelta):
                t = wv.total_seconds(); wv = f'{int(t//3600):02d}+{int((t%3600)//60):02d}'
        if isinstance(wv, float): wv = round(wv, 2); wv = int(wv) if wv == int(wv) else wv
        if isinstance(av, float): av = round(av, 2); av = int(av) if av == int(av) else av
        w, a_ = norm(wv).strip() if isinstance(norm(wv), str) else norm(wv), str(av).strip()
        tot += 1
        if str(w) != a_ and not (str(w) == '' and a_ == ''):
            why = explain(name, key, str(w), a_, SC[name])
            if why: known.append(f'[{name}] {key}: {why}'); continue
            bad += 1; report.append(f'[{name}] {key}\n    workbook: {w!r}\n    app     : {a_!r}')
print(f'compared {tot} values, {bad} UNEXPECTED differences, {len(known)} explained (compat={compat})')
print('\n'.join(report))
print('--- explained deviations (%d) ---' % len(known)); print('\n'.join(known))
