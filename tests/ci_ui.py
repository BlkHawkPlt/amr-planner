#!/usr/bin/env python3
"""Workbook-free UI smoke test in headless Chromium (iPhone viewport). Works against a local server or the live site.
   python3 ci_ui.py [base_url] [--shots DIR]      default http://localhost:8765/
Checks: page loads, no console errors, service worker registers and controls the page, cycle badge == the manifest cycle
effective today, data files load, KTUS -> KRYN -> KDMA picks fill dropdowns, AMR/DD175 render, offline reload works."""
import sys, json, os, re, datetime, urllib.request
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]
BASE = (args[0] if args else 'http://localhost:8765/').rstrip('/') + '/'
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
TAG = 'iphone'
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
fails = []; n = [0]
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, extra if not ok else '')
man = json.loads(urllib.request.urlopen(BASE + 'data/manifest.json').read())
now = datetime.datetime.now(datetime.timezone.utc)
P = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
cur = [c for c in man['cycles'] if P(c['from']) <= now < P(c['to'])]
check('manifest has a cycle effective today', len(cur) == 1)
exp = cur[0]['tpp'] if cur else None

def pick(pg, path, ident):
    el = pg.locator(f'[data-b="{path}"]'); el.click(); el.fill(ident)
    pg.wait_for_selector(f'[data-b="{path}"] + ul.sug li', timeout=4000)
    pg.locator(f'[data-b="{path}"] + ul.sug li').first.dispatch_event('pointerdown'); pg.wait_for_timeout(150)

def suite(pg, TAG):
        # ---- flight-plan tabs: official PDFs filled in the browser, previewed with pdf.js
        def pdf_text(fk):
            return pg.evaluate("""async fk => { const A = __amr; const bytes = await A.buildPdf(fk, true);
              const head = String.fromCharCode(...bytes.slice(0, 5)); const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise, pgx = await doc.getPage(1), tc = await pgx.getTextContent();
              return {head, n: doc.numPages, text: tc.items.map(i => i.str).join(' ')}; }""", fk)
        def dark_pixels():
            return pg.evaluate("""() => { const c = document.querySelector('#pdfc'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i+1] < 90 && d[i+2] < 90) n++; return n; }""")
        def no_hscroll(label):
            w = pg.evaluate('[document.documentElement.scrollWidth, window.innerWidth]'); check(label + ' no horizontal page overflow', w[0] <= w[1] + 1, str(w))
        pg.click('#tabs [data-tab="fp"]'); pg.wait_for_selector('#pdfhost[data-ready="1801"]', timeout=20000)
        check('DD 1801 is the primary flight-plan tab (default sub-tab)', pg.evaluate('__amr.S.sub') == '1801' and 'DD 1801' in pg.inner_text('#tabs [data-tab="fp"]'))
        t = pdf_text('1801'); check('DD 1801 PDF built (1 page, %PDF)', t['head'].startswith('%PDF') and t['n'] == 1, str(t['head']))
        check('DD 1801 PDF carries origin, destination, route', all(x in t['text'].replace(' ', '') for x in ('KTUS', 'KRYN', 'DCT')), t['text'][:300])
        check('DD 1801 preview canvas is drawn', dark_pixels() > 5000, str(dark_pixels()))
        no_hscroll('DD 1801 tab')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_dd1801.png', full_page=False)
        pg.click('[data-fp="1801c"]'); pg.wait_for_function("document.querySelector('#pdfhost').dataset.ready === '1801c'", timeout=20000)
        check('DD 1801-C renders', dark_pixels() > 5000)
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_dd1801c.png', full_page=False)
        check('DD 175 is not in the flight-plan nav by default', pg.locator('[data-fp="175"]').count() == 0 and 'DD 175 ' not in pg.inner_text('#tabs'))
        pg.click('#tabs [data-tab="info"]'); pg.wait_for_timeout(300); pg.check('#legacy175'); pg.click('#tabs [data-tab="fp"]'); pg.wait_for_timeout(300)
        pg.click('[data-fp="175"]'); pg.wait_for_function("document.querySelector('#pdfhost').dataset.ready === '175'", timeout=20000)
        check('legacy DD 175 appears only after enabling it on Info, and renders', dark_pixels() > 5000 and 'legacy' in pg.inner_text('.subnav').lower())
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_dd175_legacy.png', full_page=False)
        pg.click('#tabs [data-tab="info"]'); pg.wait_for_timeout(300); pg.uncheck('#legacy175'); pg.click('#tabs [data-tab="fp"]'); pg.wait_for_timeout(300)
        pg.click('[data-fp="1801"]'); pg.wait_for_function("document.querySelector('#pdfhost').dataset.ready === '1801'", timeout=20000)
        pg.click('#tabs [data-tab="1751"]'); pg.wait_for_function("document.querySelector('#pdfhost') && document.querySelector('#pdfhost').dataset.ready === '1751'", timeout=20000)
        t = pdf_text('1751'); check('DD 175-1 PDF built and contains the departure + destinations', t['n'] == 1 and all(x in t['text'].replace(' ', '') for x in ('KTUS', 'KRYN')), t['text'][:200])
        check('DD 175-1 preview canvas is drawn', dark_pixels() > 5000)
        no_hscroll('DD 175-1 tab')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_dd1751.png', full_page=False)
        # live update: change the departure time on the plan, the 1801 text must follow
        pg.evaluate("__amr.S.m.fp.etd = '2115'"); t = pdf_text('1801'); check('DD 1801 follows the plan (ETD 2115 in item 13)', '2115' in t['text'].replace(' ', ''), t['text'][:200])
        pg.evaluate("__amr.S.m.fp.etd = '1930'")
        # ---- scripts: weather source toggle + facility fill
        pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(400)
        st = pg.inner_text('#view-scripts'); check('scripts name the facilities from FAA data', 'Tucson' in st and 'Approach' in st, st[:200])
        check('scripts show filled values highlighted', pg.locator('#view-scripts .fv').count() > 40, str(pg.locator('#view-scripts .fv').count()))
        check('Scripts has no editable plan controls (Plan tab is the only editor)', pg.locator('#view-scripts select[data-b]').count() == 0 and pg.locator('#view-scripts input[data-b]').count() == 0)
        pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300)
        pg.select_option('#view-plan [data-b="d1.wx"]', 'AWOS'); pg.wait_for_timeout(300)
        pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(500)
        st = pg.inner_text('#view-scripts'); check('AWOS set on PLAN shows on SCRIPTS: "one-minute weather" wording, no info letter for destination 1', 'one-minute weather' in st and 'AWOS' in st)
        check('Plan weather change is the same state Scripts uses', pg.evaluate('__amr.S.m.d1.wx') == 'AWOS')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_scripts_awos_from_plan.png', full_page=True)
        pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300); pg.select_option('#view-plan [data-b="d1.wx"]', 'AUTO'); pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(400); no_hscroll('Scripts tab')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{TAG}_scripts.png', full_page=False)
        pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300)
        check('plan has a weather-source hint', len(pg.inner_text('#wxh-d1')) > 3, pg.inner_text('#wxh-d1'))

with sync_playwright() as p:
    try: b = p.chromium.launch(args=['--no-sandbox'])
    except Exception: b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='allow')
    pg = ctx.new_page(); errs = []; reqs = {}
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: reqs.__setitem__(r.url, r.status))
    pg.goto(BASE); pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
    check('https' if BASE.startswith('https') else 'served over http (local)', True)
    badge = pg.inner_text('#cycBadge'); print('   badge:', badge)
    check('cycle badge shows current cycle', exp and ('cycle ' + exp) in badge, badge)
    check('badge not flagged expired/future', 'expired' not in (pg.get_attribute('#cycBadge', 'class') or '') and 'EXPIRED' not in badge.upper() and 'NOT YET' not in badge.upper())
    check('data files loaded (200 OK)', any(u.endswith('/AZ.json') and s == 200 for u, s in reqs.items()), str({u: s for u, s in reqs.items() if 'data' in u}))
    check('manifest + static loaded', any(u.endswith('data/manifest.json') and s == 200 for u, s in reqs.items()) and any(u.endswith('data/static.json') and s == 200 for u, s in reqs.items()))
    pg.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)', timeout=15000)
    reg = pg.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.map(x=>({scope:x.scope,active:!!x.active})))')
    print('   service workers:', reg)
    check('service worker registered + active', len(reg) == 1 and reg[0]['active'], str(reg))
    check('service worker scope = site root', reg and reg[0]['scope'] == BASE, str(reg))
    mf = pg.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json()).then(j=>({s:j.start_url,sc:j.scope,i:j.icons.length}))")
    check('manifest.webmanifest loads', mf['i'] >= 3, str(mf))
    ic = [pg.evaluate(f"fetch('{BASE}icons/{x}').then(r=>r.status)") for x in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png')]
    check('icons load', ic == [200, 200, 200], str(ic))
    pg.wait_for_timeout(1500)
    for k, ident in (('dep', 'KTUS'), ('d1', 'KRYN'), ('d2', 'KDMA')): pick(pg, f'{k}.id', ident)
    S = pg.evaluate('__amr.S.m'); check('KTUS/KRYN/KDMA picked', (S['dep']['id'], S['d1']['id'], S['d2']['id']) == ('KTUS', 'KRYN', 'KDMA'), str((S['dep']['id'], S['d1']['id'], S['d2']['id'])))
    opts = lambda path: pg.eval_on_selector(f'[data-b="{path}"]', 'e=>Array.from(e.options).map(o=>o.value).filter(v=>v!=="")')
    ktus = pg.evaluate('__amr.D.ap("KTUS")')
    check('KTUS runway list matches data', opts('dep.rwy') == ktus['r'] and len(ktus['r']) >= 2, str(opts('dep.rwy')))
    check('KTUS approach list matches data', opts('dep.apr') == ktus['i'] and any('ILS' in x for x in ktus['i']))
    check('KRYN/KDMA approach lists populated', len(opts('d1.apr')) > 0 and len(opts('d2.apr')) > 0)
    if SHOTS: pg.screenshot(path=f'{SHOTS}/live_iphone_plan.png')
    pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(300)
    t = pg.inner_text('#view-amr'); check('AMR shows the three airports', all(x in t for x in ('(TUS)', '(RYN)', '(DMA)')))
    if SHOTS: pg.screenshot(path=f'{SHOTS}/live_iphone_amr.png', full_page=True)
    suite(pg, 'iphone')
    n_on = len(errs)      # while offline the update check (version.json) cannot reach the network; the browser logs that as a console error - expected
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
    check('offline reload works (served by service worker)', pg.evaluate('!!__amr.D.ap("KTUS")') and ('cycle ' + str(exp)) in pg.inner_text('#cycBadge'))
    ctx.set_offline(False); errs[n_on:] = [e for e in errs[n_on:] if 'ERR_FAILED' not in e and 'ERR_INTERNET_DISCONNECTED' not in e]
    check('no console/page errors', not errs, str(errs[:3]))
    # ---- iPad (portrait) pass over the same tabs
    c2 = b.new_context(viewport={'width': 820, 'height': 1180}, device_scale_factor=2, has_touch=True, is_mobile=True)
    p2 = c2.new_page(); e2 = []
    p2.on('pageerror', lambda e: e2.append(str(e))); p2.on('console', lambda m: e2.append(m.text) if m.type == 'error' else None)
    p2.goto(BASE); p2.wait_for_selector('body[data-ready="1"]', timeout=20000)
    p2.evaluate("""async () => { const m = __amr.S.m; m.dep.id = 'KTUS'; m.d1.id = 'KRYN'; m.d2.id = 'KDMA'; await __amr.D.loadState('AZ'); __amr.setTab('plan'); }""")
    suite(p2, 'ipad')
    check('iPad: no console/page errors', not e2, str(e2[:3]))
    b.close()
print(f'{n[0]} checks, {len(fails)} failures'); [print('  FAIL', f) for f in fails]
sys.exit(1 if fails else 0)
