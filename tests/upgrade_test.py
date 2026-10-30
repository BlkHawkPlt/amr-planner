#!/usr/bin/env python3
"""An OLD installed release must upgrade itself to the NEW one without the user clearing anything.
For each old release (git ref): serve it (with GitHub-Pages-like Cache-Control: max-age=600), let it install its service worker and save a mission
(d1 weather = AWOS, ETD 2145, in the old release's own storage format), then swap the served site for the NEW build (working tree, stamped like
the deploy does) and let the browser do its update check. Asserts: the open page switches to the new build by itself, old caches are gone, the
saved mission survived, the new build serves the Plan->Scripts AWOS path. Then: a second upgrade (new -> newer) through the
'Update available' banner when the service worker can't update, and through 'Force refresh app files'.
   python3 upgrade_test.py [oldref ...]      default: 80b37a0 (v1.0) 24e0448 (v1.1) 2eda131 (v1.3)"""
import sys, os, subprocess, shutil, threading, json, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
refs = sys.argv[1:] or ['80b37a0', '24e0448', '2eda131']
W = '/tmp/amr_upgrade'; shutil.rmtree(W, ignore_errors=True); os.makedirs(W)
fails = []; n = [0]
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, extra if not ok else '')
sh = lambda c, **k: subprocess.run(c, shell=True, check=True, capture_output=True, text=True, **k).stdout

def build_new(name, sha):
    d = f'{W}/{name}'; shutil.copytree(f'{ROOT}/site', d); sh(f'bash {ROOT}/tools/stamp_release.sh {d} {sha}'); return d
def build_old(ref):
    d = f'{W}/old_{ref}'; os.makedirs(d); sh(f'git -C {ROOT} archive {ref} site | tar -x -C {d} --strip-components=1')
    sh(f"sed -i \"s/^const CACHE = .*/const CACHE = 'amr-planner-old{ref}';/\" {d}/sw.js"); return d

LIVE = f'{W}/live'
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path); rel = os.path.relpath(p, os.getcwd()); return os.path.join(os.path.realpath(LIVE), rel)
    def do_GET(self):
        for h in ('If-Modified-Since', 'If-None-Match'): del self.headers[h]     # test server: mtimes are not reliable between two fake releases; always 200
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'public, max-age=600'); super().end_headers()    # what GitHub Pages sends
    def log_message(self, *a): pass
def swap(d):
    tmp = LIVE + '.tmp'
    if os.path.lexists(tmp): os.remove(tmp)
    os.symlink(d, tmp); os.replace(tmp, LIVE)
os.makedirs(W + '/_empty'); swap(W + '/_empty'); os.chdir(W + '/_empty')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); PORT = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'

NEW = build_new('new', 'newtest01'); NEWER = build_new('newer', 'newtest02')
def state(pg):
    return pg.evaluate("""async () => ({ keys: await caches.keys(), ctrl: !!navigator.serviceWorker.controller, build: window.AMR_BUILD || null,
        cur: JSON.parse(localStorage.getItem('amr.current.v1') || 'null') })""")
def wait_build(pg, sha, t=25000): pg.wait_for_function(f"window.AMR_BUILD && AMR_BUILD.commit === '{sha}' && window.__amr && __amr.S && __amr.S.m && navigator.serviceWorker.controller", timeout=t)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
    for ref in refs:
        print(f'\n=== upgrade from {ref} ===')
        OLD = build_old(ref); swap(OLD)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL, wait_until='networkidle'); pg.wait_for_function('navigator.serviceWorker.controller || false', timeout=15000) if False else None
        pg.wait_for_timeout(1500); pg.reload(wait_until='networkidle'); pg.wait_for_function('!!navigator.serviceWorker.controller', timeout=15000)
        s0 = state(pg); check(f'{ref}: old release installed + controlling, cache {s0["keys"]}', s0['ctrl'] and s0['keys'] == [f'amr-planner-old{ref}'] and (not s0['build'] or ref == '2eda131'))
        # the user's saved mission in the OLD storage format (flight-plan key f175 in the old releases)
        pg.evaluate("""() => { localStorage.setItem('amr.current.v1', JSON.stringify({ date: '2026-10-29', dep: { id: 'KTUS' }, d1: { id: 'KRYN', wx: 'AWOS' }, d2: { id: 'KDMA' }, f175: { etd: '2145', tas: '105' } })); }""")
        pg.reload(wait_until='networkidle'); pg.wait_for_timeout(800)
        # ship the new release; the browser's update check (done at every app launch) finds the new sw.js
        swap(NEW); pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        try: wait_build(pg, 'newtest01'); ok = True
        except Exception as e: ok = False; print('   ', str(e)[:200])
        check(f'{ref}: the OPEN old page switched to the new build by itself', ok)
        if ok:
            s1 = state(pg)
            check(f'{ref}: old caches deleted, only the new cache remains', s1['keys'] == ['amr-planner-newtest01'], str(s1['keys']))
            check(f'{ref}: saved mission survived and migrated (wx AWOS, ETD 2145, TAS 105, flight-plan key now fp)', pg.evaluate("[__amr.S.m.d1.wx, __amr.S.m.fp.etd, __amr.S.m.fp.tas, 'f175' in __amr.S.m]") == ['AWOS', '2145', '105', False])
            pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(500); t = pg.inner_text('#view-scripts')
            check(f'{ref}: Scripts after upgrade use the saved AWOS choice', 'one-minute weather' in t)
            pg.click('#tabs [data-tab="info"]'); pg.wait_for_timeout(300); it = pg.inner_text('#view-info')
            check(f'{ref}: Info tab shows the new version + commit', 'newtest01' in it and 'v1.' in it, it[:300])
            # content really comes from the new build, not a stale HTTP-cached copy
            check(f'{ref}: every shell file in the new cache is the new build', pg.evaluate("""async () => { const c = await caches.open('amr-planner-newtest01'); const r = await c.match('js/version.js'); const a = await c.match('js/app.js'); return (await r.text()).includes('newtest01') && (await a.text()).includes('legacy175'); }"""))
            check(f'{ref}: no page errors', not errs, str(errs))
        ctx.close()

    print('\n=== new -> newer through the "Update available" banner (service worker cannot update) ===')
    swap(NEW); ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pg = ctx.new_page()
    pg.goto(URL, wait_until='networkidle'); pg.wait_for_timeout(1200); pg.reload(wait_until='networkidle'); wait_build(pg, 'newtest01')
    pg.evaluate("__amr.S.m.fp.etd = '2230'; __amr.S.m.scriptOpts.voidMin = '40'; localStorage.setItem('amr.current.v1', JSON.stringify(__amr.S.m))")
    pg.route('**/sw.js', lambda r: r.abort())          # simulate a device whose browser fails to fetch the new worker
    swap(NEWER); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    try: pg.wait_for_selector('#updBar:not([hidden])', timeout=8000); ok = True
    except Exception: ok = False
    check('banner "Update available" appears when a newer release is published', ok and 'Update available' in pg.inner_text('#updBar'))
    if ok:
        pg.click('#updBtn')
        try: wait_build(pg, 'newtest02', 30000); ok = True
        except Exception: ok = False
        check('tapping the banner loads the newer build (and keeps the mission)', ok and pg.evaluate("[__amr.S.m.fp.etd, __amr.S.m.scriptOpts.voidMin]") == ['2230', '40'])
    print('\n=== Info > Check for updates / Force refresh ===')
    swap(NEW)
    pg.unroute('**/sw.js'); pg.goto(URL, wait_until='networkidle'); pg.wait_for_timeout(1000)
    pg.click('#tabs [data-tab="info"]'); pg.wait_for_timeout(300); pg.click('#btnUpd'); pg.wait_for_timeout(1500)
    txt = pg.inner_text('#verLatest'); check('Check for updates reports the published version', 'newtest0' in txt, txt)
    pg.click('#btnHard'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1500)
    check('Force refresh reloads the app with the mission kept', pg.evaluate("!!window.__amr && __amr.S.m.fp.etd") == '2230')
    ctx.close(); b.close()
print(f'\n{n[0]} checks, {len(fails)} failures'); [print('  FAIL', f) for f in fails]; sys.exit(1 if fails else 0)
