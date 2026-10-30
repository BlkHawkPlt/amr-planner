#!/usr/bin/env python3
"""Update path on the LIVE site: pretend the live origin still serves v1.2.0 (files from git ref), let the browser install it and save a v1.2 mission
(TH-67 + colour device), then stop intercepting so the real live v1.3.0 is served, and trigger the browser's update check.
   PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 python3 live_upgrade_v13.py <live_url> <old_site_dir>"""
import sys, os, mimetypes, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1].rstrip('/') + '/'; OLD = sys.argv[2]; fails = []
def check(l, ok, x=''):
    print(('ok   ' if ok else 'FAIL ') + l, '' if ok else x); (not ok) and fails.append(l)
def old_handler(route):
    path = route.request.url[len(URL):].split('?')[0] or 'index.html'
    f = os.path.join(OLD, path)
    if os.path.isdir(f): f = os.path.join(f, 'index.html')
    if not os.path.exists(f): return route.fulfill(status=404, body='nf')
    route.fulfill(status=200, body=open(f, 'rb').read(), headers={'content-type': mimetypes.guess_type(f)[0] or 'application/octet-stream', 'cache-control': 'no-store'})
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='allow'); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route(URL + '**', old_handler)
    pg.goto(URL, wait_until='networkidle'); pg.wait_for_timeout(2000); pg.reload(wait_until='networkidle'); pg.wait_for_function('!!navigator.serviceWorker.controller', timeout=20000)
    st = pg.evaluate("async () => ({keys: await caches.keys(), v: (window.AMR_BUILD||{}).version, c: (window.AMR_BUILD||{}).commit})")
    check(f'installed v1.2.0 from the old files (cache {st["keys"]}, build {st["v"]}/{st["c"]})', st['v'] == '1.2.0')
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pg.evaluate("""() => { const m = __amr.S.m; m.name = 'old v1.2 mission'; m.acft = 'UH-60A'; m.device = 'GOLD 2'; m.dep.id = 'KRYN'; m.d1.id = 'KMZJ'; m.d2.id = 'KTUS'; m.fp.etd = '2145';
        localStorage.setItem('amr.current.v1', JSON.stringify(m)); }""")
    pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    check('v1.2 mission with UH-60A + GOLD 2 loaded in old build', pg.evaluate('[__amr.S.m.acft, __amr.S.m.device]') == ['UH-60A', 'GOLD 2'], pg.evaluate('[__amr.S.m.acft, __amr.S.m.device]'))
    pg.evaluate("""() => { const m = __amr.S.m; m.acft = 'TH-67'; m.device = 'BLUE 3'; localStorage.setItem('amr.current.v1', JSON.stringify(m)); }""")
    ctx.unroute(URL + '**')                       # from now on the real live site (v1.3.x) answers
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    try:
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.3.0' && window.__amr && __amr.S && __amr.S.m", timeout=45000); ok = True
    except Exception as e: ok = False
    if not ok:                                     # fallback path the app offers: update banner / reload
        pg.reload(wait_until='networkidle'); pg.wait_for_timeout(3000)
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.3.0'", timeout=20000); print('(needed the manual reload path)')
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m'); pg.wait_for_timeout(1500)
    st = pg.evaluate("async () => ({keys: await caches.keys(), v: AMR_BUILD.version, c: AMR_BUILD.commit, m: __amr.S.m, aircraft: [...document.querySelectorAll('[data-b=acft] option')].map(o => o.value)})")
    check(f'live site upgraded itself 1.2.0 -> {st["v"]} ({st["c"]})', st['v'] == '1.3.0')
    check('old cache removed', len(st['keys']) == 1 and 'amr-planner-' + st['c'] in st['keys'][0] or all('1.2' not in k and 'e4fca7a' not in k for k in st['keys']), str(st['keys']))
    check('saved TH-67 / BLUE 3 mission migrated to UH-72 / 78724 and kept its route + ETD', st['m']['acft'] == 'UH-72' and st['m']['device'] == '78724' and st['m']['dep']['id'] == 'KRYN' and st['m']['d1']['id'] == 'KMZJ' and st['m']['fp']['etd'] == '2145', json.dumps([st['m']['acft'], st['m']['device']]))
    check('new fields have defaults (control AUTO, clearance PHONE, hand-off AUTO)', st['m']['dep']['ctl'] == 'AUTO' and st['m']['dep']['cdm'] == 'PHONE' and st['m']['dep']['ho'] == 'AUTO' and st['m']['d1']['ctl'] == 'AUTO')
    check('aircraft list is UH-72 / UH-60L / UH-60M', st['aircraft'] == ['UH-72', 'UH-60L', 'UH-60M'], str(st['aircraft']))
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(500); t = pg.inner_text('#view-scripts')
    check('Scripts show the new CTAF arrival calls at KMZJ and tower flow at KRYN', 'CTAF ADVISORY' in t.upper() and 'Pinal Airpark automated weather' in t and 'Cleared for Takeoff' in t)
    check('no page errors', not errs, str(errs))
    b.close()
print('upgrade checks done;', len(fails), 'failures'); sys.exit(1 if fails else 0)
