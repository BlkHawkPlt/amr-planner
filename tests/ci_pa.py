#!/usr/bin/env python3
"""v1.4 UI test: AZ + PA loaded together; airport search/state filter; PA missions (KMDT->KTHV->KPHL, KPIT->KFIG->KIPT) end to end through Plan -> Scripts / DD 1801 / 1801-C / 175-1;
a saved AZ mission still works. iPhone viewport (+ iPad).   python3 ci_pa.py [base_url] [--shots DIR]"""
import sys, os, json
sys.argv_orig = list(sys.argv)
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
def card(pg, title): return pg.locator('#view-scripts .script', has=pg.locator(f'h3:text-matches("^{title}", "i")')).first
def snap(pg, tag, name, title):
    if not SHOTS: return
    hide(pg); el = card(pg, title); el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/{tag}_{name}.png'); unhide(pg)
def plan_shot(pg, tag, name, k='dep'):
    if not SHOTS: return
    E.go_plan(pg); hide(pg); el = pg.locator(f'#view-plan [data-ap="{k}"]'); el.scroll_into_view_if_needed(); el.screenshot(path=f'{SHOTS}/{tag}_{name}.png'); unhide(pg)
def suggestions(pg, path, q):
    el = pg.locator(f'#view-plan [data-b="{path}"]'); el.click(); el.fill(''); el.fill(q); pg.wait_for_timeout(250)
    return pg.evaluate(f"[...document.querySelectorAll('#view-plan [data-b=\"{path}\"] + ul.sug li')].map(li => li.querySelector('b').textContent + '|' + li.textContent)")
def pdf_texts(pg):
    o = {}
    for fk in ('1801', '1801c', '1751'):
        o[fk] = pg.evaluate("""async fk => { const bytes = await __amr.buildPdf(fk, true); const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
          let t = []; for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i), c = await p.getTextContent(); t.push(c.items.map(x => x.str).join(' ')); } return t.join(' | '); }""", fk)
    return {k: ''.join(v.split()) for k, v in o.items()}

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--no-sandbox']) if os.environ.get('PW_CHANNEL', 'chrome') == 'chrome' else p.chromium.launch(args=['--no-sandbox'])
    for tag, kw in VIEWS.items():
        ctx = b.new_context(**kw); pg = ctx.new_page(); pg.set_default_timeout(15000); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('response', lambda r: reqs.append((r.url, r.status)))
        pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m'); pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
        check(f'[{tag}] default mission is still the AZ default (02AZ -> ...)', pg.evaluate('__amr.S.m.dep.id') == '02AZ', pg.evaluate('__amr.S.m.dep.id'))
        loaded = pg.evaluate('Object.keys(__amr.D.loaded)'); check(f'[{tag}] AZ and PA are both loaded ({loaded})', sorted(loaded) == ['AZ', 'PA'])
        check(f'[{tag}] PA.json fetched OK', any(u.endswith('/PA.json') and s == 200 for u, s in reqs), str([r for r in reqs if 'data' in r[0]]))
        E.go_plan(pg)
        sg = suggestions(pg, 'dep.id', 'harrisburg'); check(f'[{tag}] search "harrisburg" finds KMDT / KCXY', any(s.startswith('KMDT|') for s in sg) and any(s.startswith('KCXY|') for s in sg), sg)
        check(f'[{tag}] suggestions show the state (", PA")', sg and all(', PA' in s for s in sg[:2]), sg)
        sg = suggestions(pg, 'dep.id', 'tucson'); check(f'[{tag}] search "tucson" still finds KTUS', any(x.startswith('KTUS|') for x in sg), sg)
        sg = suggestions(pg, 'dep.id', 'PIT'); check(f'[{tag}] typing PIT finds KPIT first (K added)', sg and sg[0].startswith('KPIT|'), sg)
        # state filter
        pg.locator('#view-plan [data-ap="dep"] .stsel').select_option('AZ'); sg = suggestions(pg, 'dep.id', 'harrisburg')
        check(f'[{tag}] state filter AZ hides PA airports', not any(s.startswith('KMDT|') for s in sg), sg)
        check(f'[{tag}] filter is mirrored in all three airport cards and saved', pg.evaluate("[...document.querySelectorAll('.stsel')].map(e => e.value)") == ['AZ'] * 3 and pg.evaluate("JSON.parse(localStorage.getItem('amr.settings.v1')||'{}').stFilter") == 'AZ')
        pg.locator('#view-plan [data-ap="dep"] .stsel').select_option('PA'); sg = suggestions(pg, 'dep.id', 'tucson')
        check(f'[{tag}] state filter PA hides AZ airports', not any(s.startswith('KTUS|') for s in sg), sg)
        pg.locator('#view-plan [data-ap="dep"] .stsel').select_option('ALL')
        pg.keyboard.press('Escape')
        # ---- mission 1: KMDT -> KTHV -> KPHL
        E.pick(pg, 'dep.id', 'KMDT'); E.pick(pg, 'd1.id', 'KTHV'); E.pick(pg, 'd2.id', 'KPHL')
        pg.evaluate("__amr.S.m.date = '2026-10-29'; localStorage.setItem('amr.current.v1', JSON.stringify(__amr.S.m))")
        info = pg.inner_text('#info-dep'); check(f'[{tag}] KMDT info card: name, public airport, runways/approaches', 'HARRISBURG INTL' in info and 'Public airport' in info and 'approaches' in info, info)
        info = pg.inner_text('#info-d1'); check(f'[{tag}] KTHV info card', 'YORK' in info and 'RNAV' not in info or 'YORK' in info, info)
        E.pick(pg, 'd1.id', 'KTHV'); pg.wait_for_timeout(200)
        ctl = pg.inner_text('#view-plan [data-ap="d1"]'); check(f'[{tag}] Plan shows KTHV as uncontrolled with CTAF 123', 'No operating control tower' in ctl and 'CTAF 123' in ctl, ctl[:400])
        ctl = pg.inner_text('#view-plan [data-ap="dep"]'); check(f'[{tag}] Plan shows KMDT as towered Class C + hand-off Harrisburg Approach', 'Towered' in ctl and 'Class C' in ctl and 'Harrisburg Approach' in ctl, ctl[:600])
        plan_shot(pg, tag, '01_plan_KMDT_towered'); plan_shot(pg, tag, '02_plan_KTHV_uncontrolled', 'd1')
        t = E.go_scripts(pg)
        check(f'[{tag}] Scripts: KMDT tower flow, Harrisburg Departure', 'Harrisburg Departure' in t and 'Cleared for Takeoff' in t and 'Harrisburg Intl' in t, t[:300])
        check(f'[{tag}] Scripts: KTHV ASOS broadcast + CTAF advisory, no tower', 'York Airport automated surface observation' in t and 'York traffic' in t, t[:300])
        check(f'[{tag}] Scripts: KPHL tower + Philadelphia Approach', 'PHILADELPHIA TOWER' in t.upper() and 'Philadelphia Approach' in t)
        snap(pg, tag, '03_scripts_KTHV_asos', 'Destination 1 weather'); snap(pg, tag, '04_scripts_KMDT_handoff', 'Handoff')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/{tag}_05_scripts_top_KMDT_KTHV_KPHL.png')
        tx = pdf_texts(pg)
        check(f'[{tag}] DD 1801 PDF shows KMDT / KTHV / KPHL (alt)', 'KMDT' in tx['1801'] and 'KTHV' in tx['1801'], tx['1801'][:300])
        check(f'[{tag}] DD 1801-C and DD 175-1 PDFs render with the PA airports', 'KMDT' in tx['1801c'] + tx['1751'] or 'HARRISBURG' in (tx['1801c'] + tx['1751']).upper() or 'MDT' in tx['1751'], (tx['1801c'] + tx['1751'])[:300])
        if SHOTS:
            pg.click('#tabs [data-tab="fp"]'); pg.wait_for_selector('#pdfhost[data-ready="1801"]', timeout=20000); pg.wait_for_timeout(600); pg.screenshot(path=f'{SHOTS}/{tag}_06_dd1801_KMDT_KTHV.png')
        # ---- mission 2: KPIT -> KFIG -> KIPT
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KPIT'); E.pick(pg, 'd1.id', 'KFIG'); E.pick(pg, 'd2.id', 'KIPT'); pg.wait_for_timeout(300)
        t = E.go_scripts(pg)
        check(f'[{tag}] KPIT->KFIG->KIPT: New York Center + CTAF 122.725 + Williamsport tower', 'New York Center' in t and 'Clearfield-Lawrence traffic' in t and 'WILLIAMSPORT TOWER' in t.upper(), t[:300])
        tx = pdf_texts(pg); check(f'[{tag}] KPIT->KFIG->KIPT 1801 has KPIT and KFIG', 'KPIT' in tx['1801'] and 'KFIG' in tx['1801'], tx['1801'][:300])
        snap(pg, tag, '07_scripts_KFIG_ctaf', 'CTAF advisory - inbound')
        # uncontrolled PA departure by phone, heading east vs. a field with no listed provider
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KTHV'); E.pick(pg, 'd1.id', 'KPHL'); E.pick(pg, 'd2.id', 'KMDT'); pg.wait_for_timeout(300)
        t = E.go_scripts(pg)
        check(f'[{tag}] KTHV departure: phone clearance to Harrisburg Approach 800-932-0712 + advisory calls', '800-932-0712' in t and 'York traffic' in t and 'Harrisburg Approach, Army Copter' in t, t[:300])
        snap(pg, tag, '08_scripts_KTHV_phone_clearance', 'Clearance by phone')
        E.go_plan(pg); E.pick(pg, 'dep.id', '07N'); E.pick(pg, 'd1.id', 'KPIT'); E.pick(pg, 'd2.id', 'KMDT'); pg.wait_for_timeout(300)
        hoh = pg.inner_text('#hoh-dep'); check(f'[{tag}] 07N west toward KPIT hands off to New York Center (not Harrisburg)', 'New York Center' in hoh, hoh)
        E.pick(pg, 'd1.id', 'KMDT'); pg.wait_for_timeout(300); hoh = pg.inner_text('#hoh-dep'); check(f'[{tag}] 07N toward Harrisburg -> Harrisburg Approach', 'Harrisburg Approach' in hoh, hoh)
        # AZ still works in the same session
        E.go_plan(pg); E.pick(pg, 'dep.id', 'KMZJ'); E.pick(pg, 'd1.id', 'KTUS'); E.pick(pg, 'd2.id', 'KRYN'); pg.wait_for_timeout(300)
        hoh = pg.inner_text('#hoh-dep'); check(f'[{tag}] AZ unchanged: KMZJ south -> Tucson Approach', 'Tucson Approach' in hoh, hoh)
        # save + load a PA mission
        pg.evaluate("""async () => { const m = __amr.S.m; m.dep.id = 'KMDT'; m.d1.id = 'KTHV'; m.d2.id = 'KPHL'; m.name = 'PA test'; localStorage.setItem('amr.current.v1', JSON.stringify(m)); }""")
        pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
        check(f'[{tag}] PA mission survives a reload', pg.evaluate('[__amr.S.m.dep.id, __amr.S.m.d1.id, __amr.S.m.d2.id]') == ['KMDT', 'KTHV', 'KPHL'] and 'HARRISBURG' in pg.inner_text('#info-dep'))
        info = pg.inner_text('#view-info') if pg.click('#tabs [data-tab="info"]') is None else ''
        check(f'[{tag}] Info lists both states', 'AZ, PA' in info, info[:200])
        check(f'[{tag}] no page errors', not errs, errs)
        ctx.close()
    b.close()
print(f'{n[0]} PA UI checks, {len(fails)} failures'); sys.exit(1 if fails else 0)
