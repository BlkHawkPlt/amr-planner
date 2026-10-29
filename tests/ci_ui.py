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
    pg.click('#tabs [data-tab="175"]'); pg.wait_for_timeout(300)
    t = pg.inner_text('#view-175'); check('DD 175 shows route', 'KTUS' in t and 'KDMA' in t and 'KRYN' in t, t[:200])
    if SHOTS: pg.screenshot(path=f'{SHOTS}/live_iphone_dd175.png', full_page=True)
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
    check('offline reload works (served by service worker)', pg.evaluate('!!__amr.D.ap("KTUS")') and ('cycle ' + str(exp)) in pg.inner_text('#cycBadge'))
    ctx.set_offline(False)
    check('no console/page errors', not errs, str(errs[:3]))
    b.close()
print(f'{n[0]} checks, {len(fails)} failures'); [print('  FAIL', f) for f in fails]
sys.exit(1 if fails else 0)
