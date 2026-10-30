#!/usr/bin/env python3
"""Update path on the LIVE site: a local TLS proxy (/tmp/mitm.py, host-resolver-rules map of the live hostname) serves v1.3.0 (files from git ref) until /tmp/liveflag exists, then forwards to the real live site. Let the browser install it and save a v1.3 AZ mission,
then stop intercepting so the real live v1.4.x is served and trigger the browser's update check. Then plan a PA mission on the live site (iPhone viewport).
   python3 live_upgrade_v14.py <live_url> <old_site_dir> [--shots DIR]"""
import sys, os, mimetypes, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
URL = sys.argv[1].rstrip('/') + '/'; OLD = sys.argv[2]; fails = []
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def check(l, ok, x=''):
    print(('ok   ' if ok else 'FAIL ') + l, '' if ok else x); (not ok) and fails.append(l)
def old_handler(route):
    path = route.request.url[len(URL):].split('?')[0] or 'index.html'
    f = os.path.join(OLD, path)
    if os.path.isdir(f): f = os.path.join(f, 'index.html')
    if not os.path.exists(f): return route.fulfill(status=404, body='nf')
    route.fulfill(status=200, body=open(f, 'rb').read(), headers={'content-type': mimetypes.guess_type(f)[0] or 'application/octet-stream', 'cache-control': 'no-store'})
def pick(pg, path, ident):
    el = pg.locator(f'#view-plan [data-b="{path}"]'); el.click(); el.fill(ident)
    pg.wait_for_selector(f'#view-plan [data-b="{path}"] + ul.sug li', timeout=6000)
    pg.locator(f'#view-plan [data-b="{path}"] + ul.sug li').first.dispatch_event('pointerdown'); pg.wait_for_timeout(200)
def hide(pg): pg.evaluate("() => { const s = document.createElement('style'); s.id = 'hx'; s.textContent = 'header.top, nav.tabs, #toast{display:none!important}'; document.head.appendChild(s); }")
def unhide(pg): pg.evaluate("() => { const s = document.getElementById('hx'); s && s.remove(); }")
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox', '--ignore-certificate-errors', '--host-resolver-rules=MAP blkhawkplt.github.io 127.0.0.1:8443'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='allow'); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until='networkidle'); pg.wait_for_timeout(2000); pg.reload(wait_until='networkidle'); pg.wait_for_function('!!navigator.serviceWorker.controller', timeout=20000)
    st = pg.evaluate("async () => ({keys: await caches.keys(), v: (window.AMR_BUILD||{}).version, c: (window.AMR_BUILD||{}).commit, states: Object.keys(__amr.D.loaded)})")
    check(f'installed v1.3.0 from the old files (cache {st["keys"]}, build {st["v"]}/{st["c"]}, states {st["states"]})', st['v'] == '1.3.0' and st['states'] == ['AZ'])
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pg.evaluate("""() => { const m = __amr.S.m; m.name = 'old v1.3 mission'; m.acft = 'UH-60M'; m.device = '78735'; m.dep.id = 'KRYN'; m.d1.id = 'KMZJ'; m.d2.id = 'KTUS'; m.fp.etd = '2145'; m.d1.wx = 'AWOS';
        localStorage.setItem('amr.current.v1', JSON.stringify(m)); localStorage.setItem('amr.missions.v1', JSON.stringify({ 'AZ sim': Object.assign({}, m, { saved: '2026-10-29T00:00:00Z' }) })); }""")
    pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    check('v1.3 mission loaded in the old build', pg.evaluate('[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]') == ['KRYN', 'KMZJ', 'KTUS'])
    open('/tmp/liveflag', 'w').write('1')          # from now on the proxy forwards to the real live site
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    try:
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.4.0' && window.__amr && __amr.S && __amr.S.m", timeout=45000); ok = True
    except Exception as e: ok = False
    if not ok:
        pg.reload(wait_until='networkidle'); pg.wait_for_timeout(3000)
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.4.0'", timeout=20000); print('(needed the manual reload path)')
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m'); pg.wait_for_timeout(1500)
    st = pg.evaluate("async () => ({keys: await caches.keys(), v: AMR_BUILD.version, c: AMR_BUILD.commit, m: __amr.S.m, states: Object.keys(__amr.D.loaded).sort(), n: Object.keys(__amr.D.airports).length, saved: Object.keys(JSON.parse(localStorage.getItem('amr.missions.v1') || '{}'))})")
    check(f'live site upgraded itself 1.3.0 -> {st["v"]} ({st["c"]}) {"(self-upgrade, no reload needed)" if ok else ""}', st['v'] == '1.4.0')
    check('old cache removed, only the new cache remains', len(st['keys']) == 1 and st['c'] in st['keys'][0], str(st['keys']))
    check('saved v1.3 mission + saved mission list survived unchanged', st['m']['dep']['id'] == 'KRYN' and st['m']['d1']['id'] == 'KMZJ' and st['m']['d2']['id'] == 'KTUS' and st['m']['fp']['etd'] == '2145' and st['m']['acft'] == 'UH-60M' and st['saved'] == ['AZ sim'], json.dumps(st['m'])[:200])
    check(f'AZ + PA loaded after the upgrade ({st["states"]}, {st["n"]} airports)', st['states'] == ['AZ', 'PA'] and st['n'] >= 590)
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(500); t = pg.inner_text('#view-scripts')
    check('AZ scripts unchanged after the upgrade (Pinal CTAF + KRYN tower)', 'Pinal Airpark automated weather' in t and 'CTAF ADVISORY' in t.upper() and 'Cleared for Takeoff' in t)
    # ---- a PA mission on the live site
    pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300)
    pick(pg, 'dep.id', 'KMDT'); pick(pg, 'd1.id', 'KTHV'); pick(pg, 'd2.id', 'KPHL'); pg.wait_for_timeout(300)
    check('PA airports resolve on the live site', pg.evaluate('[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]') == ['KMDT', 'KTHV', 'KPHL'] and 'HARRISBURG' in pg.inner_text('#info-dep'))
    if SHOTS:
        hide(pg); el = pg.locator('#view-plan [data-ap="d1"]'); el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_01_plan_KTHV_uncontrolled.png'); unhide(pg)
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(600); t = pg.inner_text('#view-scripts')
    check('live PA scripts: KMDT tower flow, KTHV ASOS + CTAF, KPHL tower', 'Harrisburg Departure' in t and 'York Airport automated' in t and 'York traffic' in t and 'PHILADELPHIA TOWER' in t.upper(), json.dumps({k: (k in t) for k in ('Harrisburg Departure', 'York Airport automated', 'York traffic')}) + ' ' + t[200:700])
    if SHOTS:
        hide(pg)
        for name, title in (('02_scripts_KTHV_asos', 'Destination 1 weather'), ('03_scripts_KTHV_ctaf_inbound', 'CTAF advisory - inbound')):
            el = pg.locator('#view-scripts .script', has=pg.locator(f'h3:text-matches("^{title}", "i")')).first; el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_{name}.png')
        unhide(pg); pg.evaluate('window.scrollTo(0,0)'); pg.screenshot(path=f'{SHOTS}/live_iphone_04_scripts_top_PA.png')
    pg.click('#tabs [data-tab="fp"]'); pg.wait_for_selector('#pdfhost[data-ready="1801"]', timeout=25000); pg.wait_for_timeout(800)
    tx = pg.evaluate("""async () => { const bytes = await __amr.buildPdf('1801', true); const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise, p = await doc.getPage(1), c = await p.getTextContent(); return c.items.map(i => i.str).join(''); }""")
    check('live DD 1801 PDF has KMDT / KTHV', 'KMDT' in tx.replace(' ', '') and 'KTHV' in tx.replace(' ', ''))
    if SHOTS: pg.screenshot(path=f'{SHOTS}/live_iphone_05_dd1801_PA.png')
    check('no page errors', not errs, str(errs))
    b.close()
print('upgrade checks done;', len(fails), 'failures'); sys.exit(1 if fails else 0)
