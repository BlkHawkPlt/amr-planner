"""Textual Obstacle Departure Procedures from the d-TPP 'Takeoff Minimums and (Obstacle) Departure Procedures' volume PDFs (the 'T' section).

The d-TPP metafile lists one `<volume>TO.PDF` per volume (about 46 PDFs, ~15 MB) with a page per airport; there is no machine-readable form, so the PDFs are
converted with `pdftotext -layout` and the 'DEPARTURE PROCEDURE:' block of each airport is kept (lines such as 'Rwy 25, climb on heading 250° to 1800, then
proceed on course.').  Charted SIDs / graphic ODPs come from the d-TPP DP / ODP chart records and are handled elsewhere.
    parse_volume(text) -> {(state, ident): [lines]}        fetch_all(dtpp_xml, outdir) downloads the PDFs"""
import os, re, subprocess, urllib.request

HEAD = re.compile(r"^\s*(?P<name>.+?)\s+\((?P<id>[A-Z0-9]{3,4})\)(?:\s+\(CON.T\))?\s*$")
CITY = re.compile(r",\s*(?P<st>[A-Z]{2})(?:\s+\(CON.T\))?\s*$")
HDG = re.compile(r"^\s*([A-Z][A-Z0-9 ()&/'’,.-]*):\s*$")
JUNK = re.compile(r"^\s*(\d\d [A-Z]{3} \d{4} to \d\d [A-Z]{3} \d{4}|TAKEOFF MINS|\d{5}|[A-Z]{2}-\d+|L\d+)(\s+.*)?$")
START = re.compile(r"^(Rwys?\b|Runways?\b|All\b|[A-Z][\w-]*(?: [\w-]+)? (?:Helipad|Pad|Heliport)\b|Helipad\b|Pad\b|Hel\b)")

def parse_volume(text):
    out = {}; cur = None; in_dp = False
    L = [ln for ln in text.splitlines() if ln.strip()]
    for n, ln in enumerate(L):
        s = ln.strip()
        if 'TAKEOFF MINIMUMS AND (OBSTACLE) DEPARTURE PROCEDURES' in s: continue
        h = HEAD.match(ln)
        if h and not HDG.match(ln) and not START.match(s) and len(ln) - len(ln.lstrip()) < 40:
            prev = L[n - 1].strip() if n else ''; nxt = ' | '.join(x.strip() for x in L[n + 1:n + 4])
            c = CITY.search(prev) or CITY.search(L[n + 1].strip() if n + 1 < len(L) else '')
            if c or "CON'T" in s or 'CON’T' in s or 'TAKEOFF MINIMUMS AND' in nxt or 'DIVERSE VECTOR AREA' in nxt:
                cur = ((c.group('st') if c else (cur[0] if cur else '')), h.group('id')); in_dp = False; continue
        if JUNK.match(ln): continue
        if 'DIVERSE VECTOR AREA' in s: in_dp = False; continue          # DVA pages are a different procedure
        s = re.sub(r"\s+[A-Z][A-Z .'()-]*\([A-Z0-9]{3,4}\)\s+(?:TAKEOFF|DIVERSE|IFR).*$", '', s)       # page-title overlay merged into the row by pdftotext
        s = re.sub(r"\s+[A-Z][A-Z .'-]+, [A-Z]{2} \(CON.T\)$", '', s)
        m = HDG.match(ln)
        if m: in_dp = (m.group(1).strip() == 'DEPARTURE PROCEDURE'); continue
        if re.search(r"CON.T\s*$", s): in_dp = False; continue
        if cur and in_dp:
            R = out.setdefault(cur, [])
            if START.match(s) or not R: R.append(s)
            else: R[-1] += ' ' + s
    return {k: v for k, v in out.items() if v}

def pdftotext(pdf):
    return subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout

def fetch_all(dtpp_xml, outdir, cycle):
    os.makedirs(outdir, exist_ok=True)
    names = sorted(set(re.findall(r'<pdf_name>(\w+TO)\.PDF</pdf_name>', open(dtpp_xml, encoding='utf-8').read())))
    got = 0
    for n in names:
        dst = os.path.join(outdir, n + '.txt')
        try:
            req = urllib.request.Request(f'https://aeronav.faa.gov/d-tpp/{cycle}/{n}.PDF', headers={'User-Agent': 'Mozilla/5.0'})
            pdf = os.path.join(outdir, n + '.PDF'); open(pdf, 'wb').write(urllib.request.urlopen(req, timeout=300).read())
            open(dst, 'w', encoding='utf-8').write(pdftotext(pdf)); os.remove(pdf); got += 1
        except Exception as e: print('T-section PDF', n, 'not available:', e)
    print('fetched T-section volumes', got, 'of', len(names)); return got
