#!/usr/bin/env python3
"""Screenshots of the v1.3 Pinal Airpark (KMZJ) scenarios on a deployed build.  python3 shots_v13.py <base_url> <outdir>"""
import sys, os
sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[2:]
BASE = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
sys.argv = ['x', BASE]
sys.path.insert(0, os.path.dirname(__file__))
import e2e_sync as E
from playwright.sync_api import sync_playwright
VIEWS = {'iphone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True),
         'ipad': dict(viewport={'width': 820, 'height': 1180}, device_scale_factor=2, has_touch=True, is_mobile=True)}
def hide(pg): pg.evaluate("() => { const s = document.createElement('style'); s.id = 'hx'; s.textContent = 'header.top, nav.tabs, #toast{display:none!important}'; document.head.appendChild(s); }")
def unhide(pg): pg.evaluate("() => { const s = document.getElementById('hx'); s && s.remove(); }")
def card(pg, title):
    return pg.locator('#view-scripts .script', has=pg.locator(f'h3:text-matches("^{title}", "i")')).first
def snap(pg, name, title, tag):
    hide(pg); el = card(pg, title); el.scroll_into_view_if_needed(); el.screenshot(path=f'{OUT}/{tag}_{name}.png'); unhide(pg)
def plan_shot(pg, tag, name):
    E.go_plan(pg); hide(pg)
    pg.locator('#view-plan [data-ap="dep"]').scroll_into_view_if_needed()
    pg.locator('#view-plan [data-ap="dep"]').screenshot(path=f'{OUT}/{tag}_{name}.png'); unhide(pg)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
    for tag, kw in VIEWS.items():
        pg = b.new_context(**kw).new_page(); pg.set_default_timeout(10000)
        E.run(pg); E.go_plan(pg)
        E.pick(pg, 'dep.id', 'KMZJ'); E.pick(pg, 'd1.id', 'KTUS'); E.pick(pg, 'd2.id', 'KRYN'); pg.wait_for_timeout(400)
        plan_shot(pg, tag, '01_plan_KMZJ_south')
        E.go_scripts(pg)
        snap(pg, '02_awos_broadcast', 'Departure weather', tag)
        snap(pg, '03_clearance_phone', 'Clearance by phone', tag)
        snap(pg, '04_ctaf_taxi', 'CTAF advisory - taxi', tag); snap(pg, '05_ctaf_departure', 'CTAF advisory - departure', tag)
        snap(pg, '06_handoff_south_tucson', 'First call after departure', tag)
        pg.screenshot(path=f'{OUT}/{tag}_07_scripts_top_south.png')
        E.go_plan(pg); pg.select_option('#view-plan [data-b="dep.cdm"]', 'GCO'); E.setv(pg, 'dep.gcoF', '122.7'); plan_shot(pg, tag, '08_plan_GCO'); E.go_scripts(pg)
        snap(pg, '09_clearance_gco', 'Clearance by GCO', tag)
        E.go_plan(pg); pg.select_option('#view-plan [data-b="dep.cdm"]', 'PHONE'); E.pick(pg, 'd1.id', 'KCGZ'); E.pick(pg, 'd2.id', 'KPHX'); pg.wait_for_timeout(400)
        plan_shot(pg, tag, '10_plan_KMZJ_north'); E.go_scripts(pg)
        snap(pg, '11_handoff_north_center', 'First call after departure', tag)
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KMZJ'); E.pick(pg, 'd1.id', 'KMZJ') if False else None
        # uncontrolled arrival: KRYN -> KMZJ -> KTUS
        E.pick(pg, 'dep.id', 'KRYN'); E.pick(pg, 'd1.id', 'KMZJ'); E.pick(pg, 'd2.id', 'KTUS'); pg.wait_for_timeout(300); E.go_scripts(pg)
        snap(pg, '12_arrival_ctaf_inbound', 'CTAF advisory - inbound', tag); snap(pg, '13_arrival_awos_d1', 'Destination 1 weather', tag)
        pg.close()
    b.close()
print('done')
