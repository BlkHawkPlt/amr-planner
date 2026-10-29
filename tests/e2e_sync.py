#!/usr/bin/env python3
"""Plan page = single source of truth. Changes EVERY input on the Plan tab, one at a time, and asserts the change shows up on
every output it should: Scripts, AMR, DD 1801, DD 1801-C, DD 175-1 (the real PDFs, text-extracted). Also asserts that every
Plan input is covered (so a new input cannot be added without a test) and that Scripts has no editable controls of its own.
   python3 e2e_sync.py [base_url] [--explore]"""
import sys, json
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if a.startswith('http')]
BASE = (args[0] if args else 'http://localhost:8765/').rstrip('/') + '/'
fails = []; n = [0]
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, extra if not ok else '')

OUT = ['scripts', 'amr', '1801', '1801c', '1751']
def outputs(pg):
    """text of every output, taken from the live state after switching to the tab (as a user would)"""
    o = {}
    for tab, key in (('scripts', 'scripts'), ('amr', 'amr')):
        pg.click(f'#tabs [data-tab="{tab}"]'); pg.wait_for_timeout(250); o[key] = pg.inner_text(f'#view-{tab}')
    for fk in ('1801', '1801c', '1751'):
        o[fk] = pg.evaluate("""async fk => { const bytes = await __amr.buildPdf(fk, true); const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
          let t = []; for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i), c = await p.getTextContent(); t.push(c.items.map(x => x.str).join(' ')); } return t.join(' | '); }""", fk)
    pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(250)
    return o
squash = lambda s: ''.join(s.split())

def pick(pg, path, ident):
    el = pg.locator(f'#view-plan [data-b="{path}"]'); el.click(); el.fill(ident)
    pg.wait_for_selector(f'#view-plan [data-b="{path}"] + ul.sug li', timeout=4000)
    pg.locator(f'#view-plan [data-b="{path}"] + ul.sug li').first.dispatch_event('pointerdown'); pg.wait_for_timeout(200)

def setv(pg, path, v):
    el = pg.locator(f'#view-plan [data-b="{path}"]').first
    tag = el.evaluate('e => e.tagName + ":" + (e.type || "")')
    if tag.startswith('SELECT'): el.select_option(v)
    elif tag.endswith('checkbox'): el.check() if v else el.uncheck()
    else: el.fill(v); el.dispatch_event('input'); el.dispatch_event('change')
    pg.wait_for_timeout(150)

def run(pg):
    """fresh app, KTUS -> KRYN -> KDMA, fixed date; returns (base outputs, plan input paths)"""
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    pick(pg, 'dep.id', 'KTUS'); pick(pg, 'd1.id', 'KRYN'); pick(pg, 'd2.id', 'KDMA')
    pg.evaluate("__amr.S.m.date = '2026-10-29'; __amr.S.m.name = ''; localStorage.setItem('amr.current.v1', JSON.stringify(__amr.S.m))"); pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    base = outputs(pg)
    paths = pg.evaluate("[...document.querySelectorAll('#view-plan [data-b]')].map(e => e.dataset.b)")
    return base, sorted(set(paths))

MARK = 'ZQMARK'
# new value for each Plan input (valid for its field); AIRPORTS are picked through the autocomplete. A value starting with '#' = pick option index.
VAL = {'date': '2026-11-03', 'acft': 'UH-60M', 'device': '78735', 'dep.wind': '270', 'dep.ws': '12', 'dep.vis': '3 HZ', 'dep.ct': 'BKN', 'dep.ceil': '045',
       'dep.temp': '31', 'dep.dp': '09', 'dep.altim': '30.11', 'dep.wx': 'ATIS', 'dep.apr': '#2', 'dep.rwy': '#2', 'dep.sid': '#2', 'dep.trans': MARK, 'dep.cd': 'RELAY',
       'dep.maint': '035', 'dep.exp': '055', 'dep.min': '25',
       'd1.wind': '330', 'd1.ws': '14', 'd1.vis': '4 BR', 'd1.ct': 'BKN', 'd1.ceil': '032', 'd1.temp': '27', 'd1.dp': '11', 'd1.altim': '30.05', 'd1.wx': 'AWOS',
       'd1.apr': '#2', 'd1.rwy': '#2', 'd1.tvis': '1/2 FG', 'd1.tcl': 'BKN 003', 'd1.ac': 'Vector Non RNAV',
       'd2.wind': '210', 'd2.ws': '16', 'd2.vis': '6 HZ', 'd2.ct': 'BKN', 'd2.ceil': '028', 'd2.temp': '29', 'd2.dp': '13', 'd2.altim': '30.02', 'd2.wx': 'ASOS',
       'd2.apr': '#2', 'd2.rwy': '#1', 'd2.tvis': '1 FG', 'd2.tcl': 'OVC 004', 'd2.ac': 'RNAV within TAA',
       'alt2.id': '@KPHX', 'alt2.time': '0+40', 'dep.id': '@KPHX', 'd1.id': '@KFHU', 'd2.id': '@KDVT',
       'fp.etd': '2045', 'fp.tas': '95', 'fp.rules': 'V', 'fp.alt1': '070', 'fp.alt2': '090', 'fp.hold': '20', 'fp.route1': 'V16 ' + MARK, 'fp.fob': '2+15', 'fp.route2': 'V17 ' + MARK,
       'fp.termRoute': 'TERM' + MARK, 'fp.v1': '120', 'fp.x1': '5', 'fp.w1': '7', 'fp.v2': '66', 'fp.x2': '4', 'fp.w2': '3', 'fp.v3': '44', 'fp.x3': '2', 'fp.w3': '1',
       'scriptOpts.voidMin': '45', 'scriptOpts.nltMin': '20', 'f1751.briefTime': '1815', 'f1751.init': 'ZQ', 'f1751.flimsy': 'ZQFL', 'f1751.watch': 'ZQWT', 'f1751.notams': MARK + ' notam',
       'dep.ctl': 'CTAF', 'd1.ctl': 'CTAF', 'd2.ctl': 'CTAF', 'dep.cdm': 'GCO', 'dep.cdPh': '555ZQMARK', 'dep.gcoF': '122.77', 'dep.ho': '#2', 'd1.ho': '#2',
       'noAlt': True, 'amr.nav1': 'Space based', 'amr.nav2': 'Conventional Ground based'}
PRE = {'alt2.time': [('alt2.id', 'KPHX')], 'd1.tcl': [('d1.tvis', '1/2 FG')], 'd2.tcl': [('d2.tvis', '1 FG')], 'scriptOpts.voidMin': [('dep.cd', 'RELAY')], 'scriptOpts.nltMin': [('dep.cd', 'RELAY')],
       'dep.cdm': [('dep.ctl', 'CTAF')], 'dep.cdPh': [('dep.ctl', 'CTAF')], 'dep.gcoF': [('dep.ctl', 'CTAF'), ('dep.cdm', 'GCO')]}
# which outputs MUST change when the input changes (anything not listed may change too, but these are the contract)
EXPECT = {
  'acft': ['amr', '1801', '1751'],
  'alt2.id': ['1801', '1801c'],
  'alt2.time': ['1801c'],
  'amr.crew.0.name': ['amr', '1801', '1801c'],
  'amr.crew.0.rank': ['amr'],
  'amr.crew.1.name': ['amr', '1801', '1801c'],
  'amr.crew.1.rank': ['amr'],
  'amr.crew.2.name': ['amr', '1801', '1801c'],
  'amr.crew.2.org': ['amr'],
  'amr.crew.2.rank': ['amr'],
  'amr.ela': ['amr'],
  'amr.intent': ['amr'],
  'amr.missionTxt': ['amr'],
  'amr.nav1': ['amr'],
  'amr.nav2': ['amr'],
  'amr.pax.name': ['amr', '1801', '1801c'],
  'amr.pax.org': ['amr'],
  'amr.pax.rank': ['amr'],
  'amr.purpose': ['amr'],
  'amr.remarks': ['amr'],
  'amr.sect': ['amr'],
  'amr.specialTxt': ['amr'],
  'amr.unit': ['amr', '1801'],
  'amr.wb': ['amr'],
  'amr.who': ['amr'],
  'd1.ac': ['scripts'],
  'd1.altim': ['scripts', '1751'],
  'd1.apr': ['scripts'],
  'd1.ceil': ['scripts', '1751'],
  'd1.ct': ['scripts', '1751'],
  'd1.dp': ['scripts'],
  'd1.id': ['scripts', 'amr', '1801', '1801c', '1751'],
  'd1.rwy': ['scripts'],
  'd1.tcl': ['1751'],
  'd1.temp': ['scripts', '1751'],
  'd1.tvis': ['1751'],
  'd1.vis': ['scripts', '1751'],
  'd1.wind': ['scripts', '1751'],
  'd1.ws': ['scripts', '1751'],
  'd1.wx': ['scripts'],
  'd2.ac': ['scripts'],
  'd2.altim': ['scripts', '1751'],
  'd2.apr': ['scripts'],
  'd2.ceil': ['scripts', '1751'],
  'd2.ct': ['scripts', '1751'],
  'd2.dp': ['scripts'],
  'd2.id': ['scripts', 'amr', '1801', '1801c', '1751'],
  'd2.rwy': ['scripts'],
  'd2.tcl': ['1751'],
  'd2.temp': ['scripts', '1751'],
  'd2.tvis': ['1751'],
  'd2.vis': ['scripts', '1751'],
  'd2.wind': ['scripts', '1751'],
  'd2.ws': ['scripts', '1751'],
  'd2.wx': ['scripts'],
  'date': ['scripts', 'amr', '1801', '1801c', '1751'],
  'dep.altim': ['scripts', '1751'],
  'dep.apr': ['scripts'],
  'dep.cd': ['scripts'],
  'dep.cdm': ['scripts'],
  'dep.cdPh': ['scripts'],
  'dep.ctl': ['scripts'],
  'dep.gcoF': ['scripts'],
  'dep.ho': ['scripts'],
  'd1.ctl': ['scripts'],
  'd1.ho': ['scripts'],
  'd2.ctl': ['scripts'],
  'dep.ceil': ['scripts', '1751'],
  'dep.ct': ['scripts', '1751'],
  'dep.dp': ['scripts', '1751'],
  'dep.exp': ['scripts'],
  'dep.id': ['scripts', 'amr', '1801', '1751'],
  'dep.maint': ['scripts'],
  'dep.min': ['scripts'],
  'dep.rwy': ['scripts'],
  'dep.sid': ['scripts'],
  'dep.temp': ['scripts', '1751'],
  'dep.trans': ['scripts'],
  'dep.vis': ['scripts', '1751'],
  'dep.wind': ['scripts', '1751'],
  'dep.ws': ['scripts', '1751'],
  'dep.wx': ['scripts'],
  'device': ['scripts', 'amr', '1801', '1801c', '1751'],
  'f1751.briefTime': ['scripts', '1751'],
  'f1751.flimsy': ['1751'],
  'f1751.init': ['1801', '1751'],
  'f1751.notams': ['1751'],
  'f1751.watch': ['1751'],
  'fp.alt1': ['1801'],
  'fp.alt2': ['scripts', '1801c'],
  'fp.etd': ['scripts', 'amr', '1801', '1801c', '1751'],
  'fp.fob': ['1801', '1801c'],
  'fp.hold': ['scripts', 'amr', '1801c', '1751'],
  'fp.route1': ['1801'],
  'fp.route2': ['scripts', '1801c'],
  'fp.rules': ['1801', '1801c'],
  'fp.tas': ['amr', '1801', '1801c'],
  'fp.termRoute': ['scripts', '1801c'],
  'fp.v1': ['scripts', '1801', '1801c', '1751'],
  'fp.v2': ['scripts', '1801c', '1751'],
  'fp.v3': ['1801'],
  'fp.w1': ['scripts', '1801', '1801c', '1751'],
  'fp.w2': ['scripts', '1801c', '1751'],
  'fp.w3': ['1801'],
  'fp.x1': ['scripts', '1801', '1801c', '1751'],
  'fp.x2': ['scripts', '1801c', '1751'],
  'fp.x3': ['1801'],
  'name': [],
  'noAlt': ['1801'],
  'scriptOpts.nltMin': ['scripts'],
  'scriptOpts.voidMin': ['scripts'],
}
NO_OPTIONS = ['d1.star', 'd2.star']      # STAR lists are empty for KRYN/KDMA; covered by the KPHX case below
def apply(pg, path, v):
    """type/select/pick a value on the Plan tab like a user would. returns the value actually set"""
    el = pg.locator(f'#view-plan [data-b="{path}"]').first
    if v is True or v is False: setv(pg, path, v)
    elif isinstance(v, str) and v.startswith('@'): pick(pg, path, v[1:])
    elif isinstance(v, str) and v.startswith('#'):
        old = el.evaluate('e => e.value'); vals = el.evaluate('e => [...e.options].map(o => o.value)'); k = int(v[1:])
        v = vals[k] if len(vals) > k else vals[-1]
        if v == old: v = vals[1] if vals[0] == v else vals[0]
        el.select_option(v); pg.wait_for_timeout(250)
    else: setv(pg, path, v)
    return v
AP = {'dep.id': 'KTUS', 'd1.id': 'KRYN', 'd2.id': 'KDMA'}
def restore(pg, path, old, tag):
    if path in AP: pick(pg, path, AP[path])
    elif tag.endswith('checkbox'): setv(pg, path, old)
    elif tag.startswith('SELECT'): pg.locator(f'#view-plan [data-b="{path}"]').first.select_option(old); pg.wait_for_timeout(200)
    else: setv(pg, path, old)

def run_case(pg, path, base):
    el = pg.locator(f'#view-plan [data-b="{path}"]').first
    tag = el.evaluate('e => e.tagName + ":" + (e.type || "")'); old = el.evaluate('e => e.type === "checkbox" ? e.checked : e.value')
    pre = []
    for pp, pv in PRE.get(path, []):
        e2 = pg.locator(f'#view-plan [data-b="{pp}"]').first; t2 = e2.evaluate('e => e.tagName + ":" + (e.type || "")'); o2 = e2.evaluate('e => e.value')
        pre.append((pp, o2, t2)); apply(pg, pp, '@' + pv if pp == 'alt2.id' else pv)
    if pre: base = outputs(pg)
    v = apply(pg, path, VAL.get(path, MARK))
    new = outputs(pg)
    changed = [k for k in OUT if squash(new[k]) != squash(base[k])]
    restore(pg, path, old, tag)
    for pp, o2, t2 in reversed(pre): restore(pg, pp, o2, t2) if pp != 'alt2.id' else setv(pg, pp, '')
    return v, new, changed

def main(shard, nshard):
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = ctx.new_page(); pg.set_default_timeout(8000); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        base, paths = run(pg)
        if shard == 0:
            check(f'every one of the {len(paths)} Plan inputs has a test (add new inputs to EXPECT)', sorted(set(EXPECT) | set(NO_OPTIONS)) == paths, str(sorted(set(paths) ^ (set(EXPECT) | set(NO_OPTIONS)))))
            check('Scripts has no editable plan controls of its own (Plan is the only editor)', (pg.click('#tabs [data-tab="scripts"]'), pg.wait_for_timeout(300), pg.locator('#view-scripts select[data-b], #view-scripts input[data-b], #view-scripts textarea[data-b]').count())[2] == 0)
            pg.click('#tabs [data-tab="plan"]')
        mine = [x for i, x in enumerate(paths) if i % nshard == shard]
        for path in mine:
            if path in ('dep.id', 'd1.id', 'd2.id'): base, _ = run(pg)
            if path in NO_OPTIONS:
                continue
            v, new, changed = run_case(pg, path, base)
            need = EXPECT[path]
            missing = [k for k in need if k not in changed]
            check(f'Plan "{path}" = {v!r} -> {"/".join(need) or "(no output)"} updated', not missing, f'did NOT change: {missing}')
            if isinstance(v, str) and MARK in v:        # a typed marker must be visible, verbatim, in an output
                tok = squash(MARK).upper(); shown = [k for k in OUT if tok in squash(new[k]).upper()]
                check(f'Plan "{path}" text is visible in {need[0] if need else "-"}', (not need) or (need[0] in shown), f'only in {shown}')
        check('no page errors', not errs, str(errs))
        if shard == 0: specials(pg)
        b.close()

def go_scripts(pg): pg.click('#tabs [data-tab="scripts"]'); pg.wait_for_timeout(450); return pg.inner_text('#view-scripts')
def go_plan(pg): pg.click('#tabs [data-tab="plan"]'); pg.wait_for_timeout(300)
def specials(pg):
    """named scenarios from the bug report + the new features, on a fresh app"""
    base, paths = run(pg)
    t = go_scripts(pg); check('KRYN (has an ATIS) starts as ATIS wording on Scripts', 'info letter' in t or 'Information' in t)
    go_plan(pg); pg.select_option('#view-plan [data-b="d1.wx"]', 'AWOS'); t = go_scripts(pg)
    check('REPORTED BUG: Plan weather ATIS -> AWOS shows on Scripts right away', 'one-minute weather' in t and 'AWOS' in t)
    go_plan(pg); pg.select_option('#view-plan [data-b="d1.wx"]', 'ATIS'); t2 = go_scripts(pg)
    check('... and back to ATIS on Plan switches Scripts back', 'one-minute weather' not in t.replace('AWOS', '', 0) or t != t2)
    # defaults of the new void / NLT fields
    go_plan(pg); check('void and NLT minute fields exist and default to 30', pg.input_value('#view-plan [data-b="scriptOpts.voidMin"]') == '30' and pg.input_value('#view-plan [data-b="scriptOpts.nltMin"]') == '30')
    pg.select_option('#view-plan [data-b="dep.cd"]', 'RELAY'); setv(pg, 'fp.etd', '1930'); t = go_scripts(pg)
    check('relay clearance: void 2000Z, NLT 2000Z at the default 30 min (ETD 1930)', t.count('2000Z') >= 3, str([x for x in t.split('\n') if 'void' in x.lower()][:2]))
    go_plan(pg); setv(pg, 'scriptOpts.voidMin', '45'); setv(pg, 'scriptOpts.nltMin', '20'); t = go_scripts(pg)
    check('void 45 -> 2015Z and NLT 20 -> 1950Z', t.count('2015Z') >= 2 and '1950Z' in t)
    go_plan(pg); setv(pg, 'fp.etd', '2300'); t = go_scripts(pg)
    check('changing ETD moves both (2300: void 2345Z, NLT 2320Z)', '2345Z' in t and '2320Z' in t)
    go_plan(pg); setv(pg, 'scriptOpts.voidMin', ''); setv(pg, 'scriptOpts.nltMin', ''); t = go_scripts(pg)
    check('blank minutes fall back to 30 (2330Z)', t.count('2330Z') >= 3)
    # STAR on an airport that has them
    go_plan(pg); pick(pg, 'd1.id', 'KPHX'); star = pg.locator('#view-plan [data-b="d1.star"]')
    opts = star.evaluate('e => [...e.options].map(o => o.value).filter(Boolean)')
    check('KPHX has STARs to pick from', len(opts) > 0)
    if opts:
        star.select_option(opts[0]); pg.wait_for_timeout(250); t = go_scripts(pg); nm = opts[0].split()[0].upper()
        check(f'STAR "{opts[0]}" chosen on Plan shows in the Scripts', nm in t.upper(), nm)
        go_plan(pg)
    # one mission, DD 1801 is the flight plan everywhere (no DD 175 left in the UI)
    txt = ' '.join(pg.inner_text(f'#view-{v}') for v in ('plan',)) + pg.inner_text('#tabs')
    check('Plan page + nav say DD 1801, never "DD 175 "', 'DD 1801' in txt and not __import__('re').search(r'DD ?175(?!-1)', txt), txt[:200])
    amr = (go_plan(pg), pg.click('#tabs [data-tab="amr"]'), pg.wait_for_timeout(300), pg.inner_text('#view-amr'))[3]
    check('AMR tab: no DD 175 flight-plan text (only the DD 175-1 weather brief is referenced)', not __import__('re').search(r'DD ?175(?!-1)', amr), amr[:300])

    specials_v13(pg)

def specials_v13(pg):
    """v1.3: uncontrolled field (Pinal Airpark KMZJ), clearance method, AWOS broadcast, hand-off by direction, aircraft / tail list, migration"""
    base, paths = run(pg)
    go_plan(pg); pick(pg, 'dep.id', 'KMZJ'); pick(pg, 'd1.id', 'KTUS'); pick(pg, 'd2.id', 'KRYN'); pg.wait_for_timeout(300)
    ctl = pg.inner_text('#ctl-dep'); hoh = pg.inner_text('#hoh-dep')
    check('Plan shows KMZJ as uncontrolled with its CTAF', 'No operating control tower' in ctl and '123.05' in ctl, ctl)
    check('Plan shows the chosen first-contact facility and why (south -> Tucson Approach)', 'Tucson Approach' in hoh and 'course' in hoh, hoh)
    opts = pg.locator('#view-plan [data-b="dep.ho"]').evaluate('e => [...e.options].map(o => o.text)')
    check('first-contact dropdown lists Auto + candidates incl. a Center', opts[0].startswith('Auto') and any('Center' in o for o in opts) and any('Approach' in o for o in opts), str(opts))
    check('every airport card has a visible ATIS/AWOS/ASOS dropdown', all(pg.locator(f'#view-plan [data-b="{k}.wx"]').is_visible() for k in ('dep', 'd1', 'd2')))
    check('departure weather source dropdown offers ATIS / ASOS / AWOS and defaults to Auto -> AWOS for KMZJ', pg.locator('#view-plan [data-b="dep.wx"]').evaluate('e => [...e.options].map(o => o.value).join()') == 'AUTO,ATIS,ASOS,AWOS' and 'AWOS' in pg.inner_text('#wxh-dep'), pg.inner_text('#wxh-dep'))
    check('clearance method controls are visible for an uncontrolled departure; the towered clearance type is hidden', pg.locator('#view-plan [data-b="dep.cdm"]').is_visible() and not pg.locator('#view-plan [data-b="dep.cd"]').is_visible())
    t = go_scripts(pg)
    check('Scripts: Pinal AWOS broadcast wording', 'Pinal Airpark automated weather,' in t and 'Information' not in t.split('DESTINATION 1')[0] and '(repeats)' in t, t[:400])
    check('Scripts: clearance by phone with the FAA number, no taxi/takeoff clearance, CTAF advisories', 'clearance by phone' in t.lower() and '520-829-6121' in t and 'ctaf advisory - taxi' in t.lower() and 'ctaf advisory - departure' in t.lower() and 'Cleared for Takeoff' not in t.split('DESTINATION 1')[0], t[:300])
    check('Scripts: departing toward the southeast hands to Tucson Approach', 'Tucson Approach, Army Copter' in t and 'departing to the southeast' in t)
    go_plan(pg); pg.select_option('#view-plan [data-b="dep.cdm"]', 'GCO'); setv(pg, 'dep.gcoF', '122.7'); t = go_scripts(pg)
    check('GCO mode + frequency from the Plan show in Scripts', 'clearance by gco' in t.lower() and 'On the GCO 122.7' in t)
    go_plan(pg); pg.select_option('#view-plan [data-b="dep.cdm"]', 'AIR'); t = go_scripts(pg)
    check('Airborne pickup mode shows in Scripts', 'airborne pickup' in t.lower())
    go_plan(pg); pg.select_option('#view-plan [data-b="dep.cdm"]', 'PHONE'); pick(pg, 'd1.id', 'KCGZ'); pick(pg, 'd2.id', 'KPHX'); pg.wait_for_timeout(300)
    hoh = pg.inner_text('#hoh-dep'); check('Plan: north toward KCGZ -> Albuquerque Center', 'Albuquerque Center' in hoh, hoh)
    t = go_scripts(pg); check('Scripts: north departure calls Albuquerque Center, takeoff to the northwest', 'Albuquerque Center, Army Copter' in t and 'departing to the northwest' in t)
    go_plan(pg); o = pg.locator('#view-plan [data-b="dep.ho"]').evaluate('e => [...e.options].map(o => [o.value, o.text])'); tus = [v for v, tx in o if v != 'AUTO' and 'Tucson' in tx]
    if tus:
        pg.select_option('#view-plan [data-b="dep.ho"]', tus[0]); t = go_scripts(pg)
        check('override dropdown (Tucson) beats the direction rule', 'Tucson Approach, Army Copter' in t, t[:200])
    else: check('override candidates include Tucson', False, str(o))
    # towered -> towered keeps the tower flow
    go_plan(pg); pick(pg, 'dep.id', 'KTUS'); pick(pg, 'd1.id', 'KRYN'); pick(pg, 'd2.id', 'KDMA'); t = go_scripts(pg)
    check('towered -> towered: Taxi / Takeoff / Tower calls (no CTAF advisories)', 'Cleared for Takeoff' in t and 'ctaf advisory' not in t.lower())
    # aircraft / tails
    go_plan(pg)
    acs = pg.locator('#view-plan [data-b="acft"]').evaluate('e => [...e.options].map(o => o.value).join()')
    dl = pg.evaluate("[...document.querySelectorAll('#dl-dev option')].map(o => o.value)")
    check('aircraft = UH-72 / UH-60L / UH-60M only (no TH-67)', acs == 'UH-72,UH-60L,UH-60M', acs)
    check('device list is plain tail numbers, no colour labels', len(dl) >= 20 and all(x.isdigit() for x in dl), str(dl[:5]))
    # saved mission from v1.2 with removed options migrates
    pg.evaluate("""() => { const m = JSON.parse(localStorage.getItem('amr.current.v1')); m.acft = 'TH-67'; m.device = 'BLUE 3'; localStorage.setItem('amr.current.v1', JSON.stringify(m)); }""")
    pg.reload(wait_until='networkidle'); pg.wait_for_function('window.__amr && __amr.S && __amr.S.m')
    r = pg.evaluate('[__amr.S.m.acft, __amr.S.m.device]'); check('saved TH-67 / BLUE 3 mission migrates to UH-72 / 78724', r == ['UH-72', '78724'], str(r))

if __name__ == '__main__':
    shard, nshard = 0, 1
    if '--shard' in sys.argv: shard, nshard = map(int, sys.argv[sys.argv.index('--shard') + 1].split('/')); shard -= 1
    main(shard, nshard)
    print(f'\n[shard {shard + 1}/{nshard}] {n[0]} checks, {len(fails)} failures'); [print('  FAIL', f) for f in fails]; sys.exit(1 if fails else 0)
