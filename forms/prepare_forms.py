#!/usr/bin/env python3
"""Turn the official DoD PDFs (forms/original/*.pdf) into the browser-fillable blanks shipped in site/forms/.

The DoD PDFs are Adobe LiveCycle (XFA) forms, AES-encrypted with an EMPTY user password and owner permissions that allow
print / fill-forms but not modify.  pdf-lib cannot open encrypted files, so this build step
  1. opens each PDF with the empty user password (no password is bypassed),
  2. drops the encryption, the XFA packet (Adobe-only layer) and the screen-only Reset/Print/Save buttons + JavaScript,
  3. leaves EVERY page-content stream and every AcroForm text/check box untouched (same geometry, same fonts).
It writes site/forms/<name>.pdf and site/forms/fields.json (widget name, type, rect in PDF points, tooltip).
Fidelity is verified by tests/form_fidelity.py (renders the original and the shipped blank and diffs them)."""
import json, hashlib, os, sys, pypdf
from pypdf.generic import NameObject, ArrayObject, DictionaryObject

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', 'site', 'forms')
SRC = {'dd1801': 'dd1801_hybrid_2023-02.pdf', 'dd1801c': 'dd1801c.pdf', 'dd175': 'dd175.pdf', 'dd175-1': 'dd175-1.pdf'}
PUSH = 1 << 16

def qname(a):
    n = []; p = a
    while p is not None:
        if '/T' in p: n.append(str(p['/T']))
        p = p.get('/Parent'); p = p.get_object() if p is not None else None
    return '.'.join(reversed(n))

def build(key, fn):
    r = pypdf.PdfReader(os.path.join(HERE, 'original', fn))
    if r.is_encrypted: assert r.decrypt('') != 0, 'needs a real password'
    w = pypdf.PdfWriter(clone_from=r)
    root = w._root_object
    for k in ('/Perms', '/Names', '/OpenAction', '/AA', '/NeedsRendering', '/Extensions'): root.pop(NameObject(k), None)
    af = root['/AcroForm']; af.pop(NameObject('/XFA'), None); af[NameObject('/NeedAppearances')] = pypdf.generic.BooleanObject(False)
    rows = []; pg = w.pages[0]; keep = ArrayObject(); dead = set()
    for ref in pg['/Annots']:
        a = ref.get_object()
        if a.get('/Subtype') != '/Widget': keep.append(ref); continue
        ft = a.get('/FT') or a['/Parent'].get_object().get('/FT')
        ff = int(a.get('/Ff') or (a['/Parent'].get_object().get('/Ff') if '/Parent' in a else 0) or 0)
        if ft == '/Sig' or (ft == '/Btn' and ff & PUSH): dead.add(qname(a)); continue      # screen-only controls
        a.pop(NameObject('/AA'), None); a.pop(NameObject('/A'), None)
        rc = [round(float(x), 2) for x in a['/Rect']]
        rows.append(dict(n=qname(a), t={'/Tx': 'tx', '/Btn': 'cb'}[ft], r=rc, tu=str(a.get('/TU', '')), ml=int(a['/MaxLen']) if '/MaxLen' in a else 0, ml_=bool(ff & 4096)))
        keep.append(ref)
    pg[NameObject('/Annots')] = keep
    def prune(arr):
        out = ArrayObject()
        for ref in arr:
            o = ref.get_object()
            if '/Kids' in o:
                prune_kids(o)
                if len(o['/Kids']): out.append(ref)
            elif qname(o) not in dead: out.append(ref)
        return out
    def prune_kids(o):
        o[NameObject('/Kids')] = prune(o['/Kids'])
    af[NameObject('/Fields')] = prune(af['/Fields'])
    rows.sort(key=lambda x: (-round((x['r'][1] + x['r'][3]) / 2 / 3), x['r'][0]))
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, key + '.pdf'); w.write(p)
    src = open(os.path.join(HERE, 'original', fn), 'rb').read()
    return dict(widgets=rows, src=fn, sha256=hashlib.sha256(src).hexdigest(), page=[float(pg.mediabox.width), float(pg.mediabox.height)],
                title=str(r.metadata.get('/Title', '')), removed=sorted(dead)), len(open(p, 'rb').read())

if __name__ == '__main__':
    fields = {}
    for k, fn in SRC.items():
        d, n = build(k, fn); fields[k] = d; print(k, len(d['widgets']), 'widgets', n, 'bytes; removed', d['removed'])
    json.dump(fields, open(os.path.join(OUT, 'fields.json'), 'w'), separators=(',', ':'))
