#!/usr/bin/env python3
"""End-to-end test in headless Chrome: drive the real UI with KTUS -> KRYN -> KDMA inputs, then compare the dropdown option
lists and every rendered output with values from the ORIGINAL workbook recalculated by LibreOffice (wb_run/out/S1_*.xlsx).
   python3 e2e.py [base_url]       (run compare_workbook.py first to create wb_run/)"""
import sys, json, os, re, datetime, warnings
warnings.filterwarnings('ignore')
import openpyxl
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); SHOTS = os.path.join(HERE, '..', 'screenshots'); os.makedirs(SHOTS, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'
SC = json.load(open(HERE + '/wb_run/scenarios.json'))['S1_KTUS_KRYN_KDMA']
WB = openpyxl.load_workbook(HERE + '/wb_run/out/S1_KTUS_KRYN_KDMA.xlsx', data_only=True)
def w(sheet, ref):
    v = WB[sheet][ref].value
    if isinstance(v, float) and v == int(v): v = int(v)
    return '' if v is None else str(v)
AZ = json.load(open(HERE + '/../site/data/2610/AZ.json'))['a']
fails = []; checks = [0]
COMPAT = os.environ.get('COMPAT') == '1'
def ws(x): return re.sub(r'\s+', ' ', str(x).replace('\xa0', ' ')).strip()
def check(label, got, exp):
    checks[0] += 1
    g, e = ws(got), ws(exp)
    if not COMPAT and 'script' in label and 'Landing and Departing RWY' in e:     # documented, intentional difference (see Info tab)
        e = re.sub(r' Landing and Departing RWY \S+\.', '', e) if re.search(r'RWY \d+[LRC]? in use', e) else e
        e = ws(e); g = ws(re.sub(r' Landing and Departing RWY \S+\.', '', g))
    if g != e:
        fails.append(f'{label}\n   expected: {exp!r}\n   got     : {got!r}')
VIEWS = {'ipad': dict(width=820, height=1180), 'ipad-pro': dict(width=1024, height=1366), 'iphone': dict(width=390, height=844)}

def flat(d, p=''):
    for k, v in d.items():
        if isinstance(v, dict): yield from flat(v, p + k + '.')
        elif isinstance(v, list):
            for i, x in enumerate(v):
                if isinstance(x, dict): yield from flat(x, f'{p}{k}.{i}.')
        else: yield p + k, v

def pick(page, path, ident):
    el = page.locator(f'[data-b="{path}"]'); el.click(); el.fill(ident[1:] if ident.startswith('K') and len(ident) == 4 else ident)  # type without K to exercise the K-prefix search
    page.wait_for_selector(f'[data-b="{path}"] + ul.sug li', timeout=3000)
    page.locator(f'[data-b="{path}"] + ul.sug li').first.dispatch_event('pointerdown'); page.wait_for_timeout(150)

def run(name, vp):
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if name == 'iphone' else 1, has_touch=name != 'ipad-pro', is_mobile=name == 'iphone', service_workers='allow')
        if COMPAT: ctx.add_init_script("if(!localStorage.getItem('amr.settings.v1')) localStorage.setItem('amr.settings.v1', JSON.stringify({compat:true}))")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL); pg.wait_for_selector('body[data-ready="1"]')
        # 1) airports via the searchable pickers (typing "TUS" must find KTUS)
        for k, ident in (('dep', SC['dep']['id']), ('d1', SC['d1']['id']), ('d2', SC['d2']['id'])): pick(pg, f'{k}.id', ident)
        S = pg.evaluate('__amr.S.m')
        check(f'[{name}] picker dep', S['dep']['id'], 'KTUS'); check(f'[{name}] picker d1', S['d1']['id'], 'KRYN'); check(f'[{name}] picker d2', S['d2']['id'], 'KDMA')
        # 2) dropdown option lists must equal the workbook's lists
        def opts(path): return pg.eval_on_selector(f'[data-b="{path}"]', 'e=>Array.from(e.options).map(o=>o.value).filter(v=>v!=="")')
        for k, fld, key in (('dep', 'rwy', 'r'), ('dep', 'apr', 'i'), ('dep', 'sid', 'd'), ('d1', 'rwy', 'r'), ('d1', 'apr', 'i'), ('d1', 'star', 's'), ('d2', 'rwy', 'r'), ('d2', 'apr', 'i'), ('d2', 'star', 's')):
            check(f'[{name}] list {k}.{fld}', opts(f'{k}.{fld}'), AZ[SC[k]['id']].get(key, []))
        # 3) fill everything else from the scenario
        for path, v in flat(SC):
            if path in ('dep.id', 'd1.id', 'd2.id') or path.startswith('amr.pax') and False: continue
            loc = pg.locator(f'[data-b="{path}"]')
            if loc.count() == 0 or v is None: continue
            tag = loc.first.evaluate('e=>e.tagName+":"+(e.type||"")')
            if tag.startswith('SELECT'): loc.first.select_option(value=str(v))
            elif tag.endswith('checkbox'): loc.first.set_checked(bool(v))
            else: loc.first.fill(str(v))
            if path == 'dep.sid': pass
        S = pg.evaluate('__amr.S.m')
        for path, v in flat(SC):
            if path in ('name', 'date', 'noAlt') or path.startswith('amr.crew') and False: continue
            cur = S
            for kk in path.split('.'): cur = cur[int(kk)] if isinstance(cur, list) else cur.get(kk)
            if cur != v and str(cur) != str(v): fails.append(f'[{name}] UI state mismatch at {path}: ui={cur!r} scenario={v!r}')
        # dependent behaviour: choosing an approach auto-selects its runway; ensure the scenario values (set after) survived
        pg.screenshot(path=f'{SHOTS}/{name}_plan_top.png')
        pg.evaluate('window.scrollTo(0, 900)'); pg.screenshot(path=f'{SHOTS}/{name}_plan_mid.png', full_page=False)
        pg.screenshot(path=f'{SHOTS}/{name}_plan_full.png', full_page=True)
        # 4) outputs vs workbook ---------------------------------------------------------------------
        pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(200)
        paras = pg.eval_on_selector_all('#view-amr h2', 'els=>els.map(h=>[h.textContent.trim(), h.nextElementSibling.textContent.trim()])'); P = dict(paras)
        check(f'[{name}] AMR mission = workbook AMR!A4', P['MISSION'], w('AMR', 'A4'))
        check(f'[{name}] AMR special instructions = AMR!A7', P['Special Instructions'], w('AMR', 'A7'))
        txt = pg.inner_text('#view-amr')
        for lab, ref in (('Serial Number:', 'C14'), ('Planning Fuel:', 'C16'), ('Hover Power:', 'C21'), ('Climb Power:', 'C22'), ('Cruise Power:', 'C23'), ('Fuel Burn Rate:', 'C24'), ('IAP:', 'C42'), ('Gross Weight:', 'C15')):
            m = re.search(re.escape(lab) + r'\s*(.*)', txt); check(f'[{name}] AMR {lab} = AMR!{ref}', m.group(1) if m else None, w('AMR', ref))
        check(f'[{name}] AMR aircraft/design', re.search(r'Aircraft:\s*(.*)', txt).group(1).replace('\xa0', ' ').replace('  ', ' '), 'UH-72 ' + w('AMR', 'C13'))
        pg.screenshot(path=f'{SHOTS}/{name}_amr.png', full_page=True)
        pg.click('#tabs [data-tab="175"]'); pg.wait_for_timeout(200)
        vs = pg.eval_on_selector_all('#view-175 .v', 'els=>els.map(e=>e.textContent.trim())')
        exp175 = {'callsign': w('DD 175', 'P2'), 'design': w('DD 175', 'R2')}
        for lab, val in (('callsign', w('DD 175', 'P2')), ('design', w('DD 175', 'R2')), ('TAS leg1', w('DD 175', 'C5')), ('TAS leg2', w('DD 175', 'C6')), ('route/to leg 1', w('DD 175', 'K12')), ('alternate', w('DD 175', 'B18')), ('weather void/init', w('DD 175', 'J18')), ('serial/unit', w('DD 175', 'N18'))):
            check(f'[{name}] DD175 {lab}', ws(val) in [ws(v) for v in vs], True)
        def hhmm(ref):
            v = WB['DD 175'][ref].value; return f'{v.hour:02d}{v.minute:02d}'
        def hm(ref):
            v = WB['DD 175'][ref].value; t = v.total_seconds() if isinstance(v, datetime.timedelta) else v.hour * 3600 + v.minute * 60; return f'{int(t//3600):02d}+{int((t%3600)//60):02d}'
        for lab, val in (('ETD leg1', hhmm('G12')), ('ETD leg2', hhmm('G14')), ('ETE leg1', hm('S12')), ('ETE leg2', hm('S14')), ('ETE to alt', hm('E18')), ('mid L13', w('DD 175', 'L13'))):
            check(f'[{name}] DD175 {lab}', val in vs, True)
        for lab, ref in (('fuel leg1', 'Q16'), ('fuel leg2', 'R16'), ('fuel leg1+alt', 'S16')):
            val = int(float(WB['DD 175'][ref].value) + 0.5); check(f'[{name}] DD175 {lab}', any(v.startswith(str(val) + ' ') for v in vs), True)
        pg.screenshot(path=f'{SHOTS}/{name}_dd175.png', full_page=True)
        pg.click('#tabs [data-tab="1751"]'); pg.wait_for_timeout(200)
        t1751 = pg.inner_text('#view-1751')
        for lab, ref in (('PA', 'AM4'), ('remarks', 'A9'), ('sfc wind', 'A6')):
            check(f'[{name}] 175-1 {lab}', ws(w('175-1', ref)) in ws(t1751), True)
        check(f'[{name}] 175-1 void time', w('175-1', 'A60') + 'Z' in t1751, True)
        pg.screenshot(path=f'{SHOTS}/{name}_dd175-1.png', full_page=True)
        pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(200)
        sc = dict(pg.eval_on_selector_all('#view-scripts .script', 'els=>els.map(e=>{const h=e.querySelector("h3");const p=e.querySelector("p");return h&&p?[h.childNodes[0].textContent.trim(),p.textContent.trim()]:null}).filter(Boolean)'))
        def find(prefix): return next(v for k, v in sc.items() if k.startswith(prefix))
        for lab, pref, ref in (('departure WX (AWOS...)', 'Departure weather', 'A2'), ('clearance delivery', 'Clearance delivery', 'A6'), ('taxi', 'Taxi', 'A10'), ('takeoff', 'Takeoff', 'A13'), ('departure control', 'Departure control', 'A18'),
                               ('dest1 WX', 'Destination 1 weather', 'A23'), ('dest1 approach info', 'Approach information', 'A27'), ('dest1 approach clearance', 'Approach clearance (RNAV within TAA)', 'A30'), ('dest1 tower', 'Tower (or)', 'A37'),
                               ('missed', 'Missed approach - handoff', 'M2'), ('to dest2', 'Clearance to 2nd destination', 'M8'), ('dest2 WX', 'Destination 2 weather', 'M15'), ('dest2 info', 'Destination 2 approach information', 'M19'), ('dest2 clearance', 'Destination 2 approach clearance', 'M22'),
                               ('dest2 tower', 'Destination 2 tower', 'M31')):
            check(f'[{name}] script {lab} = Grade Sheet!{ref}', find(pref), w('Grade Sheet', ref))
        pg.screenshot(path=f'{SHOTS}/{name}_scripts.png', full_page=True)
        pg.click('#tabs [data-tab="info"]'); pg.wait_for_timeout(200); pg.screenshot(path=f'{SHOTS}/{name}_info.png', full_page=True)
        # cycle + disclaimer visible
        check(f'[{name}] cycle badge shown', 'FAA cycle 2610' in pg.inner_text('#cycBadge'), True)
        check(f'[{name}] disclaimer shown', 'verify' in pg.inner_text('#discBar').lower() or 'Verify' in pg.inner_text('#discBar'), True)
        # 5) persistence: reload keeps state
        pg.reload(); pg.wait_for_selector('body[data-ready="1"]')
        check(f'[{name}] persisted after reload', pg.evaluate('__amr.S.m.d2.id + "|" + __amr.S.m.d1.apr'), 'KDMA|' + SC['d1']['apr'])
        # 6) save / load named missions
        pg.click('#btnMissions'); pg.fill('#mName', 'e2e KTUS-KRYN-KDMA'); pg.click('[data-m="save"]'); pg.wait_for_timeout(100)
        pg.click('[data-m="new"]'); pg.wait_for_timeout(300)
        check(f'[{name}] new mission resets', pg.evaluate('__amr.S.m.dep.id'), '02AZ')
        pg.click('#btnMissions'); pg.click('[data-m="load"]'); pg.wait_for_timeout(300)
        check(f'[{name}] named mission loads', pg.evaluate('__amr.S.m.d2.id + "|" + __amr.S.m.d2.apr'), 'KDMA|' + SC['d2']['apr'])
        pg.screenshot(path=f'{SHOTS}/{name}_missions_loaded.png')
        # 7) offline
        pg.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller || true')
        pg.evaluate('navigator.serviceWorker.ready.then(()=>1)'); pg.wait_for_timeout(1500)
        ctx.set_offline(True); pg.reload(); pg.wait_for_selector('body[data-ready="1"]', timeout=8000)
        check(f'[{name}] works offline (cycle badge)', 'FAA cycle' in pg.inner_text('#cycBadge'), True)
        check(f'[{name}] offline airport search', pg.evaluate('__amr.D.search("RYN",3)[0].id'), 'KRYN')
        ctx.set_offline(False)
        if name == 'ipad':
            for t, fn in (('amr', 'AMR'), ('175', 'DD175'), ('1751', 'DD175-1'), ('scripts', 'Scripts')):
                pg.click(f'#tabs [data-tab="{t}"]'); pg.wait_for_timeout(200); pg.pdf(path=f'{SHOTS}/print_{fn}.pdf', format='Letter', print_background=True)
        check(f'[{name}] no JS errors', errs, [])
        b.close()
for n, vp in VIEWS.items(): run(n, vp)
print('mode:', 'workbook-compatible' if COMPAT else 'default (corrected formulas)')
print(f'{checks[0]} checks, {len(fails)} failures'); print('\n'.join(fails))
sys.exit(1 if fails else 0)
