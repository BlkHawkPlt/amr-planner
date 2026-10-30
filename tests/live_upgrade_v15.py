#!/usr/bin/env python3
"""Update path on the LIVE site: a local TLS proxy (/tmp/mitm.py, host-resolver-rules map of the live hostname) serves v1.4.0 (files from git ref) until /tmp/liveflag exists, then forwards to the real live site. Let the browser install it and save a v1.4 PA mission,
then stop intercepting so the real live v1.5.x is served and trigger the browser's update check. Then plan a PA mission on the live site (iPhone viewport).
   python3 live_upgrade_v15.py <live_url> <old_site_dir> [--shots DIR]"""
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
    check(f'installed v1.4.0 from the old files (cache {st["keys"]}, build {st["v"]}/{st["c"]}, states {st["states"]})', st['v'] == '1.4.0' and st['states'] == ['AZ', 'PA'])
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pg.evaluate("""() => { const m = __amr.S.m; m.name = 'old v1.4 mission'; m.acft = 'UH-60M'; m.device = '78735'; m.dep.id = 'KMDT'; m.d1.id = 'KTHV'; m.d2.id = 'KPHL'; m.fp.etd = '2145'; m.amr.sect = '';
        localStorage.setItem('amr.current.v1', JSON.stringify(m)); localStorage.setItem('amr.missions.v1', JSON.stringify({ 'PA sim': Object.assign({}, m, { saved: '2026-10-30T00:00:00Z' }) })); }""")
    pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    check('v1.4 mission loaded in the old build', pg.evaluate('[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]') == ['KMDT', 'KTHV', 'KPHL'])
    pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(400); old_amr = pg.inner_text('#view-amr'); check('old build has no auto sectional (blank row)', 'NEW YORK' not in old_amr)
    open('/tmp/liveflag', 'w').write('1')          # from now on the proxy forwards to the real live site
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    try:
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.5.0' && window.__amr && __amr.S && __amr.S.m", timeout=45000); ok = True
    except Exception as e: ok = False
    if not ok:
        pg.reload(wait_until='networkidle'); pg.wait_for_timeout(3000)
        pg.wait_for_function("window.AMR_BUILD && AMR_BUILD.version === '1.5.0'", timeout=20000); print('(needed the manual reload path)')
    pg.wait_for_function('window.__amr && __amr.S && __amr.S.m'); pg.wait_for_timeout(1500)
    st = pg.evaluate("async () => ({keys: await caches.keys(), v: AMR_BUILD.version, c: AMR_BUILD.commit, m: __amr.S.m, states: Object.keys(__amr.D.loaded).sort(), saved: Object.keys(JSON.parse(localStorage.getItem('amr.missions.v1') || '{}')), sc: __amr.D.ap('KMDT').sc})")
    check(f'live site upgraded itself 1.4.0 -> {st["v"]} ({st["c"]}) {"(self-upgrade, no reload needed)" if ok else ""}', st['v'] == '1.5.0')
    check('old cache removed, only the new cache remains', len(st['keys']) == 1 and st['c'] in st['keys'][0], str(st['keys']))
    check('saved v1.4 mission + saved mission list survived', st['m']['dep']['id'] == 'KMDT' and st['m']['fp']['etd'] == '2145' and st['saved'] == ['PA sim'], json.dumps(st['m'])[:200])
    check('new cycle data carries the sectional field (KMDT = NEW YORK) after the upgrade', st['sc'] == 'NEW YORK', st['sc'])
    pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(500); t = pg.inner_text('#view-amr'); import re
    check('upgraded old mission: AMR VFR Sectional auto = NEW YORK, WASHINGTON', re.search(r'VFR Sectional:\s*NEW YORK, WASHINGTON', t) is not None, t[-300:])
    if SHOTS:
        hide(pg); el = pg.locator('#view-amr h2:text("Publications")').first; el.scroll_into_view_if_needed(); pg.screenshot(path=f'{SHOTS}/live_iphone_02_amr_publications.png'); unhide(pg)
    pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(400)
    check('Plan: sectional hint shows NEW YORK, WASHINGTON', 'NEW YORK, WASHINGTON' in pg.inner_text('#sectHint'), pg.inner_text('#sectHint'))
    if SHOTS:
        hide(pg); el = pg.locator('#view-plan section.card', has=pg.locator('#sectHint')).first; el.scroll_into_view_if_needed()
        el.locator('#sectHint').scroll_into_view_if_needed(); pg.evaluate("window.scrollBy(0, -330)"); pg.screenshot(path=f'{SHOTS}/live_iphone_01_plan_amr_details.png'); unhide(pg)
    # KRYN -> KMZJ -> KTUS
    pick(pg, 'dep.id', 'KRYN'); pick(pg, 'd1.id', 'KMZJ'); pick(pg, 'd2.id', 'KTUS'); pg.wait_for_timeout(300)
    check('live KRYN -> KMZJ -> KTUS hint = PHOENIX', 'sectional for this route: PHOENIX' in pg.inner_text('#sectHint'), pg.inner_text('#sectHint'))
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(600); t = pg.inner_text('#view-scripts')
    check('live: no hover taxi anywhere, plain "taxi to RWY" at KRYN, CTAF taxiing at KMZJ', 'hover' not in t.lower() and 'taxi to RWY' in t and 'Pinal Airpark automated weather' in t, t[:300])
    if SHOTS:
        hide(pg)
        for name, title in (('03_taxi_towered_KRYN', 'Taxi'), ):
            el = pg.locator('#view-scripts .script', has=pg.locator(f'h3:text-matches("^{title}", "i")')).first; el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_{name}.png')
        unhide(pg)
    pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300)
    pick(pg, 'dep.id', 'KMZJ'); pick(pg, 'd1.id', 'KTUS'); pick(pg, 'd2.id', 'KRYN'); pg.wait_for_timeout(300)
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(600)
    if SHOTS:
        hide(pg); el = pg.locator('#view-scripts .script', has=pg.locator('h3:text-matches("^CTAF advisory - taxi", "i")')).first; el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_04_taxi_ctaf_KMZJ.png'); unhide(pg)
    # Lancaster weather source
    pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300); pick(pg, 'dep.id', 'KRDG'); pick(pg, 'd1.id', 'KLNS'); pick(pg, 'd2.id', 'KMDT'); pg.wait_for_timeout(300)
    wh = pg.inner_text('#wxh-d1'); check('live: KLNS weather source = ATIS 125.675', 'ATIS' in wh and '125.675' in wh, wh)
    if SHOTS:
        hide(pg); el = pg.locator('#view-plan [data-ap="d1"]'); el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_05_plan_KLNS_atis.png'); unhide(pg)
    pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(600); t = pg.inner_text('#view-scripts'); check('live: KLNS script = ATIS info letter', 'Lancaster Airport Information' in t and 'Lancaster Airport automated' not in t, t[:200])
    if SHOTS:
        hide(pg); el = pg.locator('#view-scripts .script', has=pg.locator('h3:text-matches("^Destination 1 weather", "i")')).first; el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/live_iphone_06_scripts_KLNS_atis.png'); unhide(pg)
    check('no page errors', not errs, str(errs))
    b.close()
print('upgrade checks done;', len(fails), 'failures'); sys.exit(1 if fails else 0)
