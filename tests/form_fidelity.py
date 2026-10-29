#!/usr/bin/env python3
"""Fidelity of the shipped forms against the OFFICIAL DoD PDFs (forms/original/*.pdf).
  1. blank fidelity   - the shipped blank (site/forms/*.pdf) renders pixel-identical to the official PDF (minus the removed screen-only buttons)
  2. fill fidelity    - a filled + flattened PDF differs from the blank ONLY inside the form's own fields
  3. box geometry     - every vector line / rectangle of the official page is found in the filled page; max offset is reported (expected 0.000 pt)
  4. text fit         - every word added by the fill lies inside a field rectangle
  5. page size        - MediaBox identical (Letter; DD 175 is Letter landscape)
Run: python3 tests/form_fidelity.py   (needs pymupdf + node)"""
import os, sys, json, subprocess, tempfile, collections
import pymupdf
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); SITE = os.path.join(ROOT, 'site')
SRC = {'dd1801': 'dd1801_hybrid_2023-02.pdf', 'dd1801c': 'dd1801c.pdf', 'dd175': 'dd175.pdf', 'dd175-1': 'dd175-1.pdf'}
fields = json.load(open(os.path.join(SITE, 'forms', 'fields.json')))
fails = []; n = [0]; report = {}
def check(label, ok, extra=''):
    n[0] += 1
    if not ok: fails.append(f'{label} {extra}')
    print(('ok   ' if ok else 'FAIL ') + label, extra)
DPI = 200; Z = DPI / 72
tmp = tempfile.mkdtemp(prefix='fid_')
subprocess.run(['node', os.path.join(HERE, 'make_samples.js'), tmp], check=True, capture_output=True)

def render(page, dpi=DPI):
    return page.get_pixmap(dpi=dpi, alpha=False, annots=True)
def diff_outside(a, b, masks):
    """count differing pixels between two same-size pixmaps outside the mask rects (in PDF points, y-down)"""
    assert (a.width, a.height) == (b.width, b.height)
    sa, sb = a.samples, b.samples; w, h, nch = a.width, a.height, a.n
    m = bytearray(w * h)
    for r in masks:
        x0, y0, x1, y1 = [max(0, int(v * Z) - 2) for v in (r.x0, r.y0)] + [int(r.x1 * Z) + 3, int(r.y1 * Z) + 3]
        for y in range(y0, min(h, y1)):
            m[y * w + x0:y * w + min(w, x1)] = b'\x01' * (min(w, x1) - x0)
    bad = 0
    for y in range(h):
        ra, rb = sa[y * w * nch:(y + 1) * w * nch], sb[y * w * nch:(y + 1) * w * nch]
        if ra == rb: continue
        for x in range(w):
            if not m[y * w + x] and ra[x * nch:(x + 1) * nch] != rb[x * nch:(x + 1) * nch]: bad += 1
    return bad
def widget_rects(page):
    return [w.rect for w in page.widgets()]
def drawings(page):
    out = []
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] == 'l': out.append(('l', it[1].x, it[1].y, it[2].x, it[2].y))
            elif it[0] == 're': out.append(('r', it[1].x0, it[1].y0, it[1].x1, it[1].y1))
            elif it[0] == 'qu': q = it[1].rect; out.append(('r', q.x0, q.y0, q.x1, q.y1))
    return out
def inside(rect, bb, pad=1.5):
    return bb[0] >= rect.x0 - pad and bb[1] >= rect.y0 - pad and bb[2] <= rect.x1 + pad and bb[3] <= rect.y1 + pad

for key, fn in SRC.items():
    print(f'--- {key}')
    orig = pymupdf.open(os.path.join(ROOT, 'forms', 'original', fn))
    if orig.needs_pass: orig.authenticate('')
    blank = pymupdf.open(os.path.join(SITE, 'forms', key + '.pdf'))
    filled = pymupdf.open(os.path.join(tmp, key + '_flat.pdf'))
    po, pb, pf = orig[0], blank[0], filled[0]
    check(f'{key}: MediaBox identical to official', tuple(po.mediabox) == tuple(pb.mediabox) == tuple(pf.mediabox), f'{po.mediabox} {pb.mediabox} {pf.mediabox}')
    check(f'{key}: single page', len(orig) == len(blank) == len(filled) == 1)
    # 1 blank fidelity: mask the removed screen-only widgets (buttons / signature boxes)
    kept = {w.field_name for w in pb.widgets()}
    gone = [w.rect for w in po.widgets() if w.field_name not in kept]
    bad = diff_outside(render(po), render(pb), gone)
    check(f'{key}: shipped blank == official render (pixels differing outside {len(gone)} removed button/signature widgets)', bad == 0, str(bad))
    # 2 fill fidelity
    wr = widget_rects(pb)
    bad = diff_outside(render(pb), render(pf), wr)
    check(f'{key}: filled page differs from blank only inside field rectangles', bad == 0, f'{bad} px outside')
    # 3 geometry
    do, dfl = drawings(po), [d for d in drawings(pf) if not any(inside(r, d[1:], 1.0) for r in wr)]
    do_out = [d for d in do if not any(inside(r, d[1:], 1.0) for r in wr + gone)]
    mx = 0.0
    idx = collections.defaultdict(list)
    for d in dfl: idx[d[0]].append(d)
    for d in do_out:
        best = min((max(abs(a - b) for a, b in zip(d[1:], e[1:])) for e in idx[d[0]]), default=999)
        mx = max(mx, best)
    report[key] = dict(vector_items=len(do_out), max_offset_pt=round(mx, 4))
    check(f'{key}: {len(do_out)} official lines/boxes all found in the filled page, max offset {mx:.4f} pt ({mx * 25.4 / 72:.4f} mm)', mx < 0.01, f'{mx}')
    # 4 text fit
    wb = collections.Counter((w[4], round(w[0], 1), round(w[1], 1)) for w in pb.get_text('words'))
    new = []; mins = 99
    for w in pf.get_text('words'):
        k = (w[4], round(w[0], 1), round(w[1], 1))
        if wb.get(k, 0) > 0: wb[k] -= 1; continue
        new.append(w)
    out = [w for w in new if not any(inside(r, w[:4]) for r in wr)]
    for d in pf.get_text('dict')['blocks']:
        for l in d.get('lines', []):
            for sp in l['spans']:
                if any(sp['text'] == w[4] for w in new): mins = min(mins, sp['size'])
    report[key].update(words_added=len(new), words_outside_fields=len(out), min_font_pt=round(mins, 2) if mins < 99 else None)
    check(f'{key}: all {len(new)} words added by the fill sit inside field rectangles', not out, str([w[4] for w in out][:5]))
print(json.dumps(report, indent=1))
print(f'{n[0]} checks, {len(fails)} failures'); [print('  FAIL', f) for f in fails]
json.dump(report, open(os.path.join(HERE, 'fidelity_report.json'), 'w'), indent=1)
sys.exit(1 if fails else 0)
