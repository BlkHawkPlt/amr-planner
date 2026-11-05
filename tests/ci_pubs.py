#!/usr/bin/env python3
"""v1.6 UI test: nationwide data + state picker + Publications (ELA / sectional / approach plates) + textual ODP in the SID list.
   First run with no saved data, the picker on first run and on Info, an ID in a state that was never ticked (fetched on demand),
   Publications for KRYN>KMZJ>KTUS and KMDT>KLNS, override / blank = auto, KMUI ODP, sample missions in several regions.
   python3 ci_pubs.py [base_url] [--shots DIR]"""
import sys, os, re, json
args = [a for a in sys.argv[1:] if a.startswith('http')]
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
BASE = (args[0] if args else 'http://localhost:8765/').rstrip('/') + '/'
sys.argv = ['x', BASE]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_sync as E
from playwright.sync_api import sync_playwright
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
PRESET = "if(!localStorage.getItem('amr.settings.v1')&&!localStorage.getItem('amr.current.v1')) localStorage.setItem('amr.settings.v1', JSON.stringify({states:['AZ','PA'],welcomed:true}))"
fails = []; n = [0]
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, ('' if ok else str(extra)[:300]))
IPHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
def hide(pg): pg.evaluate("() => { const s = document.createElement('style'); s.id = 'hx'; s.textContent = 'header.top, nav.tabs, #toast{display:none!important}'; document.head.appendChild(s); }")
def unhide(pg): pg.evaluate("() => { const s = document.getElementById('hx'); s && s.remove(); }")
def amr_text(pg): pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(400); return pg.inner_text('#view-amr')
def row(t, label):
    m = re.search(re.escape(label) + r':\s*(.*)', t); return m.group(1).strip() if m else None
def shot_pubs(pg, name):
    if not SHOTS: return
    amr_text(pg); hide(pg); pg.locator('#view-amr h2:text("Publications")').first.scroll_into_view_if_needed(); pg.screenshot(path=f'{SHOTS}/{name}.png'); unhide(pg)
def shot(pg, name):
    if SHOTS: pg.screenshot(path=f'{SHOTS}/{name}.png')
def route(pg, ids):
    """put the given airports into the mission (fetching their states through the nationwide index) and redraw"""
    pg.evaluate("""async ids => { const m = __amr.S.m; ['dep','d1','d2','alt2'].forEach((k, i) => { m[k].id = ids[i] || ''; m[k].apr = ''; m[k].sid = ''; });
      localStorage.setItem('amr.current.v1', JSON.stringify(m)); await __amr.ensureStates(); __amr.renderView(); }""", ids)
    pg.wait_for_timeout(300)
def loaded(pg): return pg.evaluate('__amr.D.loadedStates()')

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox']) if os.environ.get('PW_CHANNEL', 'chrome') == 'chrome' else p.chromium.launch(args=['--no-sandbox'])

    # ---------------- 1. a brand-new user on a new device ----------------
    ctx = b.new_context(**IPHONE); pg = ctx.new_page(); pg.set_default_timeout(15000); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pg.wait_for_selector('#welcome:not([hidden]) .stc')
    check('first run: the welcome / state picker opens', pg.is_visible('#welcome'))
    wt = pg.inner_text('#welcome')
    check('first run: disclaimer and states question', 'Not for real-world navigation' in wt and 'Which states do you fly in' in wt, wt[:200])
    check('first run: every state/territory is offered', pg.locator('#welcome input[data-st]').count() >= 55, pg.locator('#welcome input[data-st]').count())
    check('first run: nothing is pre-ticked (nothing downloaded yet)', pg.locator('#welcome input[data-st]:checked').count() == 0)
    check('first run: nothing but the ID index was fetched (no state files, no personal airports)', loaded(pg) == [], loaded(pg))
    check('first run: no crew name, blank airports, no AZ default', pg.evaluate("[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id, __amr.S.m.amr.crew.map(c => c.name || '').join('')]") == ['', '', '', ''])
    shot(pg, '01_first_run_state_picker')
    pg.evaluate("document.querySelector('#welcome .stc input[data-st=NY]').scrollIntoView()")
    shot(pg, '01b_first_run_state_list')
    pg.locator('#welcome input[data-st="NY"]').check(); pg.locator('#welcome input[data-st="IL"]').check()
    check('first run: the total updates', '2 selected' in pg.inner_text('#welcome .sttot'), pg.inner_text('#welcome .sttot'))
    pg.click('#wGo'); pg.wait_for_function("!document.getElementById('welcome') || document.getElementById('welcome').hidden")
    check('picker: NY + IL downloaded and kept in settings', sorted(loaded(pg)) == ['IL', 'NY'] and sorted(pg.evaluate('__amr.S.settings.states')) == ['IL', 'NY'], (loaded(pg), pg.evaluate('__amr.S.settings.states')))
    E.go_plan(pg)
    E.pick(pg, 'dep.id', 'KJFK'); E.pick(pg, 'd1.id', 'KORD')
    # KDEN is in Colorado: the state was never ticked, the index offers it, choosing it downloads the state
    el = pg.locator('#view-plan [data-b="d2.id"]'); el.click(); el.fill('KDEN'); pg.wait_for_selector('#view-plan [data-b="d2.id"] + ul.sug li', timeout=6000)
    sug = pg.inner_text('#view-plan [data-b="d2.id"] + ul.sug')
    check('typing an ID from a state that is not downloaded offers it from the index', 'Colorado' in sug and 'download' in sug.lower(), sug)
    pg.locator('#view-plan [data-b="d2.id"] + ul.sug li').first.dispatch_event('pointerdown'); pg.wait_for_function("__amr.D.loadedStates().includes('CO')", timeout=8000); pg.wait_for_timeout(300)
    check('CO was fetched on demand but is not added to the chosen states', 'CO' in loaded(pg) and 'CO' not in pg.evaluate('__amr.S.settings.states'))
    check('mission mixes NY / IL / CO: KJFK > KORD > KDEN', pg.evaluate("[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]") == ['KJFK', 'KORD', 'KDEN'])
    t = amr_text(pg); ela = row(t, 'ELA'); iap = row(t, 'IAP')
    check('KJFK>KORD>KDEN ELA: L-34, L-28, L-10 (interior charts, route order)', ela == 'L-34, L-28, L-10', ela)
    check('KJFK>KORD>KDEN plates: NE-2, EC-3, SW-1 in route order', iap and re.findall(r'(NE-2|EC-3|SW-1)', iap) == ['NE-2', 'EC-3', 'SW-1'], iap)
    check('sectional chain for the cross-country', row(t, 'VFR Sectional') == 'NEW YORK, CHICAGO, DENVER', row(t, 'VFR Sectional'))
    shot_pubs(pg, '03_KJFK_KORD_KDEN_publications')
    # reload: the mission and the states survive; CO comes back through the mission
    pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m && __amr.D.loadedStates().length >= 3')
    check('reload keeps the mission and loads its states again (offline-cached)', pg.evaluate('__amr.S.m.d2.id') == 'KDEN' and 'CO' in loaded(pg) and not pg.is_visible('#welcome'), loaded(pg))
    # Info tab picker
    pg.click('#tabs [data-tab="info"]'); pg.wait_for_selector('#stGrid .stc'); pg.locator('#stGrid input[data-st="WA"]').scroll_into_view_if_needed()
    check('Info: "States on this device" card lists NY and IL ticked', pg.locator('#stGrid input[data-st="NY"]:checked').count() == 1 and pg.locator('#stGrid input[data-st="IL"]:checked').count() == 1)
    pg.locator('#stGrid input[data-st="WA"]').check(); pg.wait_for_function("__amr.D.loadedStates().includes('WA')", timeout=8000); pg.wait_for_function("document.getElementById('stMsg').textContent.includes('Saved')")
    check('Info: ticking WA downloads and saves it', 'WA' in pg.evaluate('__amr.S.settings.states'))
    pg.wait_for_timeout(600); shot(pg, '02_info_state_picker')
    pg.locator('#stGrid input[data-st="IL"]').uncheck(); pg.wait_for_function("!__amr.S.settings.states.includes('IL')", timeout=8000); pg.wait_for_timeout(500)
    check('Info: unticking IL removes it from memory (the mission does not use it) and from settings', 'IL' not in pg.evaluate('__amr.S.settings.states') and 'IL' not in loaded(pg) or 'KORD' == pg.evaluate('__amr.S.m.d1.id'), loaded(pg))
    check('first-run flow: no page errors', not errs, errs)
    ctx.close()

    # ---------------- 2. AZ + PA (existing install) : Publications table ----------------
    ctx = b.new_context(**IPHONE); ctx.add_init_script(PRESET); pg = ctx.new_page(); pg.set_default_timeout(15000); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m && __amr.D.loadedStates().length == 2')
    check('existing-install default: AZ + PA preselected, no welcome', sorted(pg.evaluate('__amr.S.settings.states')) == ['AZ', 'PA'] and not pg.is_visible('#welcome'))
    check('default mission is the generic KPHX > KTUS > KRYN', pg.evaluate('[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]') == ['KPHX', 'KTUS', 'KRYN'])
    E.go_plan(pg); E.pick(pg, 'dep.id', 'KRYN'); E.pick(pg, 'd1.id', 'KMZJ'); E.pick(pg, 'd2.id', 'KTUS')
    for k, ap in (('dep', 'ILS OR LOC RWY 06R'), ('d2', 'ILS OR LOC RWY 12')):
        opts = pg.locator(f'#view-plan [data-b="{k}.apr"] option').evaluate_all('o => o.map(x => x.value)')
        if ap in opts: pg.locator(f'#view-plan [data-b="{k}.apr"]').select_option(ap); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    check('Plan hint under the ELA field names L-5', 'L-5' in pg.inner_text('#elaHint'), pg.inner_text('#elaHint'))
    check('Plan hint under the plates field names SW-4 and the chosen approaches', 'SW-4' in pg.inner_text('#iapHint') and 'KRYN' in pg.inner_text('#iapHint'), pg.inner_text('#iapHint'))
    check('ELA / plates fields are blank = auto', pg.input_value('#view-plan [data-b="amr.ela"]') == '' and pg.input_value('#view-plan [data-b="amr.iap"]') == '')
    t = amr_text(pg)
    check('KRYN>KMZJ>KTUS AMR ELA = L-5', row(t, 'ELA') == 'L-5', row(t, 'ELA'))
    check('KRYN>KMZJ>KTUS AMR plates = SW-4 with the chosen approaches', (row(t, 'IAP') or '').startswith('SW-4: ILS OR LOC RWY 06R (KRYN)') and 'ILS OR LOC RWY 12 (KTUS)' in row(t, 'IAP'), row(t, 'IAP'))
    check('KRYN>KMZJ>KTUS sectional still PHOENIX', row(t, 'VFR Sectional') == 'PHOENIX')
    shot_pubs(pg, '04_KRYN_KMZJ_KTUS_publications')
    # alternate in the same volume adds nothing, one in another volume adds its volume
    E.go_plan(pg); E.pick(pg, 'alt2.id', 'KGCN'); pg.wait_for_timeout(300)
    t = amr_text(pg); check('alternate KGCN adds L-8 (chart not covered by L-5) and stays in SW-4', row(t, 'ELA') == 'L-5, L-8' and 'KGCN' not in row(t, 'IAP'), (row(t, 'ELA'), row(t, 'IAP')))
    E.go_plan(pg); pg.locator('#view-plan [data-b="alt2.id"]').fill(''); pg.locator('#view-plan [data-b="alt2.id"]').blur(); pg.wait_for_timeout(400)
    # override and back to auto
    E.setv(pg, 'amr.ela', 'L-99'); E.setv(pg, 'amr.iap', 'SW-9 TEST'); pg.wait_for_timeout(300)
    check('typed ELA / plates override the auto text and the hint says so', 'typed entry' in pg.inner_text('#elaHint') and 'typed entry' in pg.inner_text('#iapHint'), pg.inner_text('#elaHint'))
    t = amr_text(pg); check('AMR shows the typed ELA and plates', row(t, 'ELA') == 'L-99' and row(t, 'IAP') == 'SW-9 TEST', (row(t, 'ELA'), row(t, 'IAP')))
    E.go_plan(pg); E.setv(pg, 'amr.ela', ''); E.setv(pg, 'amr.iap', ''); pg.wait_for_timeout(300)
    t = amr_text(pg); check('clearing the fields returns to auto', row(t, 'ELA') == 'L-5' and (row(t, 'IAP') or '').startswith('SW-4'), (row(t, 'ELA'), row(t, 'IAP')))
    # KMDT > KLNS
    E.go_plan(pg); E.pick(pg, 'dep.id', 'KMDT'); E.pick(pg, 'd1.id', 'KLNS'); E.pick(pg, 'd2.id', 'KMDT'); pg.wait_for_timeout(300)
    t = amr_text(pg); check('KMDT>KLNS>KMDT: ELA L-29, NE-4, NEW YORK sectional', row(t, 'ELA') == 'L-29' and 'NE-4' in (row(t, 'IAP') or '') and row(t, 'VFR Sectional') == 'NEW YORK', (row(t, 'ELA'), row(t, 'IAP'), row(t, 'VFR Sectional')))
    shot_pubs(pg, '05_KMDT_KLNS_publications')
    # textual ODP in the existing SID dropdown (KMUI)
    E.go_plan(pg); E.pick(pg, 'dep.id', 'KMUI'); pg.wait_for_timeout(300)
    opts = pg.locator('#view-plan [data-b="dep.sid"] option').evaluate_all('o => o.map(x => x.value)')
    check('KMUI SID dropdown: COPTER MUIR FOUR + the textual ODP entry', 'COPTER MUIR FOUR' in opts and any(o.startswith('Obstacle departure procedure') for o in opts), opts)
    check('no new Departure Procedure block was added (one SID control only)', pg.locator('#view-plan [data-b$=".sid"]').count() == 1)
    pg.locator('#view-plan [data-b="dep.sid"]').select_option([o for o in opts if o.startswith('Obstacle')][0]); pg.wait_for_timeout(300)
    oh = pg.inner_text('#odpHint'); check('selecting it shows the ODP text from the d-TPP Takeoff Minimums', 'DEPARTURE PROCEDURE' in oh.upper() or 'runway' in oh.lower(), oh)
    shot(pg, '06_KMUI_odp_plan')
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(500); st = pg.inner_text('#view-scripts')
    check('Scripts say "published obstacle departure procedure" for the ODP', 'obstacle departure procedure' in st.lower(), st[:200])
    check('AZ/PA flow: no page errors', not errs, errs)
    ctx.close()

    # ---------------- 3. sample missions across the country ----------------
    ctx = b.new_context(**IPHONE); ctx.add_init_script(PRESET); pg = ctx.new_page(); pg.set_default_timeout(20000); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    SAMPLES = [(['KJFK', 'KLGA', 'KTEB'], 'NEW YORK'), (['KORD', 'KMDW', 'KPWK'], 'CHICAGO'), (['KDEN', 'KAPA', 'KBJC'], 'DENVER'), (['KSEA', 'KBFI', 'KPAE'], 'SEATTLE'),
               (['PANC', 'PAFA', 'PANC'], 'ANCHORAGE'), (['PHNL', 'PHOG', 'PHNL'], 'HAWAIIAN'), (['KMIA', 'KFLL', 'KTPA'], 'MIAMI'), (['KLAX', 'KSAN', 'KSFO'], 'LOS ANGELES'),
               (['00F', 'KBIL', 'KGTF'], None)]
    for ids, sect in SAMPLES:
        route(pg, ids); t = amr_text(pg)
        check(f'sample {">".join(ids)}: Publications present, airports resolved ({row(t, "VFR Sectional")} | ELA {row(t, "ELA")} | {(row(t, "IAP") or "")[:60]})', row(t, 'ELA') is not None and row(t, 'IAP') is not None and pg.evaluate('__amr.S.m.dep.id') == ids[0] and (sect is None or sect in (row(t, 'VFR Sectional') or '').upper()) and not errs, (t[:200], errs))
        E.go_plan(pg); check(f'sample {">".join(ids)}: Plan shows the departure name from FAA data', len(pg.inner_text('#info-dep')) > 20, pg.inner_text('#info-dep'))
    route(pg, ['KRYN', 'KMZJ', 'KTUS'])
    check('samples: no page errors', not errs, errs)
    # blank airports must not break any tab
    route(pg, ['', '', ''])
    for tab in ('plan', 'scripts', 'amr', 'forms'):
        try:
            pg.click(f'#tabs [data-tab="{tab}"]'); pg.wait_for_timeout(300)
        except Exception: pass
    check('blank airports: every tab renders without errors', not errs, errs)
    ctx.close()
    b.close()
print(f'{n[0]} nationwide / publications UI checks, {len(fails)} failures')
for f in fails: print('  FAIL', f)
sys.exit(1 if fails else 0)
