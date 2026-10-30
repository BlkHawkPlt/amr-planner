#!/usr/bin/env python3
"""v1.5 UI test: VFR sectional auto-filled from the route (Plan -> AMR), cross-sectional lists, manual override + clearing it, alternate, saved v1.4 mission without the new data.
iPhone + iPad viewports.   python3 ci_sect.py [base_url] [--shots DIR]"""
import sys, os
args = [a for a in sys.argv[1:] if a.startswith('http')]
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
BASE = (args[0] if args else 'http://localhost:8765/').rstrip('/') + '/'
sys.argv = ['x', BASE]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_sync as E
from playwright.sync_api import sync_playwright
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
fails = []; n = [0]
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, ('' if ok else str(extra)[:300]))
VIEWS = {'iphone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True),
         'ipad': dict(viewport={'width': 820, 'height': 1180}, device_scale_factor=2, has_touch=True, is_mobile=True)}
def hide(pg): pg.evaluate("() => { const s = document.createElement('style'); s.id = 'hx'; s.textContent = 'header.top, nav.tabs, #toast{display:none!important}'; document.head.appendChild(s); }")
def unhide(pg): pg.evaluate("() => { const s = document.getElementById('hx'); s && s.remove(); }")
def amr_text(pg): pg.click('#tabs [data-tab="amr"]'); pg.wait_for_timeout(400); return pg.inner_text('#view-amr')
def sect_row(t):
    import re; m = re.search(r'VFR Sectional:\s*(.*)', t); return m.group(1).strip() if m else None
def hint(pg): return pg.inner_text('#sectHint')
def shot_plan_amr(pg, tag, name):
    if not SHOTS: return
    E.go_plan(pg); hide(pg); el = pg.locator('#view-plan section.card', has=pg.locator('#sectHint')).first; el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/{tag}_{name}_plan_amr_details.png'); unhide(pg)
def shot_amr_pubs(pg, tag, name):
    if not SHOTS: return
    amr_text(pg); hide(pg); el = pg.locator('#view-amr h2:text("Publications")').first; el.scroll_into_view_if_needed(); pg.screenshot(path=f'{SHOTS}/{tag}_{name}_amr_publications.png'); unhide(pg)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox']) if os.environ.get('PW_CHANNEL', 'chrome') == 'chrome' else p.chromium.launch(args=['--no-sandbox'])
    for tag, kw in VIEWS.items():
        ctx = b.new_context(**kw); pg = ctx.new_page(); pg.set_default_timeout(15000); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m'); pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
        E.go_plan(pg)
        E.pick(pg, 'dep.id', 'KRYN'); E.pick(pg, 'd1.id', 'KMZJ'); E.pick(pg, 'd2.id', 'KTUS'); pg.wait_for_timeout(300)
        check(f'[{tag}] Plan hint: PHOENIX for KRYN -> KMZJ -> KTUS', 'PHOENIX' in hint(pg) and 'NEW YORK' not in hint(pg), hint(pg))
        check(f'[{tag}] the sectional field is blank (auto) and its placeholder says so', pg.input_value('#view-plan [data-b="amr.sect"]') == '' and 'auto' in pg.get_attribute('#view-plan [data-b="amr.sect"]', 'placeholder'))
        check(f'[{tag}] airport info card shows the sectional chip', 'PHOENIX sectional' in pg.inner_text('#info-d1'), pg.inner_text('#info-d1'))
        shot_plan_amr(pg, tag, '01_KRYN_KMZJ_KTUS')
        t = amr_text(pg); check(f'[{tag}] AMR Publications: VFR Sectional = PHOENIX', sect_row(t) == 'PHOENIX', sect_row(t)); shot_amr_pubs(pg, tag, '02_KRYN_KMZJ_KTUS')
        # change destination on the Plan -> AMR follows (single source of truth)
        E.go_plan(pg); E.pick(pg, 'd1.id', 'KMDT'); E.pick(pg, 'd2.id', 'KTHV'); pg.wait_for_timeout(300)
        check(f'[{tag}] Plan hint lists every sectional in route order', 'PHOENIX, NEW YORK, WASHINGTON' in hint(pg), hint(pg))
        t = amr_text(pg); check(f'[{tag}] AMR: PHOENIX, NEW YORK, WASHINGTON', sect_row(t) == 'PHOENIX, NEW YORK, WASHINGTON', sect_row(t)); shot_amr_pubs(pg, tag, '03_cross_sectional')
        # alternate
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KMUI'); E.pick(pg, 'd1.id', 'KRDG'); E.pick(pg, 'd2.id', 'KLNS'); pg.wait_for_timeout(300)
        t = amr_text(pg); check(f'[{tag}] KMUI -> KRDG -> KLNS: NEW YORK', sect_row(t) == 'NEW YORK', sect_row(t))
        E.go_plan(pg); E.pick(pg, 'alt2.id', 'KPIT'); pg.wait_for_timeout(300)
        check(f'[{tag}] alternate on the Plan adds its sectional to the hint', 'NEW YORK, DETROIT' in hint(pg), hint(pg))
        t = amr_text(pg); check(f'[{tag}] AMR includes the alternate: NEW YORK, DETROIT', sect_row(t) == 'NEW YORK, DETROIT', sect_row(t))
        E.go_plan(pg); pg.locator('#view-plan [data-b="alt2.id"]').fill(''); pg.locator('#view-plan [data-b="alt2.id"]').blur(); pg.wait_for_timeout(500)
        check(f'[{tag}] clearing the alternate removes its sectional', 'DETROIT' not in hint(pg), hint(pg))
        # manual override
        E.setv(pg, 'amr.sect', 'NEW ORLEANS'); pg.wait_for_timeout(200)
        check(f'[{tag}] hint says the typed entry is used', 'typed entry' in hint(pg), hint(pg))
        t = amr_text(pg); check(f'[{tag}] AMR shows the override', sect_row(t) == 'NEW ORLEANS', sect_row(t))
        E.go_plan(pg); E.pick(pg, 'd2.id', 'KPHL'); pg.wait_for_timeout(200); t = amr_text(pg); check(f'[{tag}] override stays when the route changes', sect_row(t) == 'NEW ORLEANS', sect_row(t))
        E.go_plan(pg); E.setv(pg, 'amr.sect', ''); pg.wait_for_timeout(200)
        t = amr_text(pg); check(f'[{tag}] clearing the override goes back to auto', sect_row(t) == 'NEW YORK, WASHINGTON', sect_row(t))
        # v1.5 taxi wording on the Scripts page: plain ground taxi (towered + CTAF), no hover taxi
        def taxi_card(pg, title):
            return pg.locator('#view-scripts .script', has=pg.locator(f'h3:text-matches("^{title}", "i")')).first
        for dep, ttl, rx, nm in (('KRYN', 'Taxi', 'taxi to RWY', '04_taxi_towered_KRYN'), ('KMZJ', 'CTAF advisory - taxi', 'taxiing to RWY', '05_taxi_ctaf_KMZJ')):
            E.go_plan(pg); E.pick(pg, 'dep.id', dep); E.pick(pg, 'd1.id', 'KTUS'); E.pick(pg, 'd2.id', 'KRYN' if dep != 'KRYN' else 'KMZJ'); pg.wait_for_timeout(300)
            t = E.go_scripts(pg); tc = taxi_card(pg, ttl); txt = tc.inner_text()
            check(f'[{tag}] {dep}: taxi script is "{rx} xx via ..." and has no hover/air taxi', rx in txt and ' via ' in txt and 'hover' not in t.lower() and 'air taxi' not in t.lower(), txt)
            if SHOTS: hide(pg); tc.scroll_into_view_if_needed(); tc.screenshot(path=f'{SHOTS}/{tag}_{nm}.png'); unhide(pg)
        # v1.5 weather-source default: Lancaster lists an ATIS (and an ASOS on the same frequency) -> ATIS by default
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KRDG'); E.pick(pg, 'd1.id', 'KLNS'); E.pick(pg, 'd2.id', 'KMDT'); pg.wait_for_timeout(300)
        wh = pg.inner_text('#wxh-d1'); check(f'[{tag}] Plan: KLNS weather source hint says ATIS 125.675', 'ATIS' in wh and '125.675' in wh, wh)
        check(f'[{tag}] KLNS dropdown stays on Auto (manual override still offered)', pg.locator('#view-plan [data-b="d1.wx"]').input_value() == 'AUTO')
        t = E.go_scripts(pg)
        check(f'[{tag}] Scripts: KLNS (Lancaster) is an ATIS with an info letter, not an ASOS broadcast', 'Lancaster Airport Information' in t and 'Lancaster Airport automated surface observation' not in t, t[:300])
        E.go_plan(pg); pg.select_option('#view-plan [data-b="d1.wx"]', 'ASOS'); t = E.go_scripts(pg)
        check(f'[{tag}] manual ASOS override on KLNS still gives the automated broadcast', 'automated surface observation' in t, t[:300])
        E.go_plan(pg); pg.select_option('#view-plan [data-b="d1.wx"]', 'AUTO')
        # saved mission: reload keeps it; old (v1.4) mission with amr.sect = '' and no data change
        pg.evaluate("() => { const m = JSON.parse(localStorage.getItem('amr.current.v1')); m.dep.id='KRYN'; m.d1.id='KMZJ'; m.d2.id='KTUS'; m.amr.sect=''; localStorage.setItem('amr.current.v1', JSON.stringify(m)); }")
        pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
        t = amr_text(pg); check(f'[{tag}] reloaded v1.4-style mission gets PHOENIX automatically', sect_row(t) == 'PHOENIX', sect_row(t))
        # printable/share text path and the AMR export still render
        check(f'[{tag}] AMR page still has ELA and IAP rows', 'ELA:' in t and 'IAP:' in t)
        check(f'[{tag}] no page errors', not errs, errs)
        ctx.close()
    b.close()
print(f'{n[0]} sectional UI checks, {len(fails)} failures'); sys.exit(1 if fails else 0)
