#!/usr/bin/env python3
"""Download + unpack FAA data for one cycle into data/raw/<nasr-date>/ (flat layout).

  python3 fetch_data.py --nasr 2026-10-29 --tpp 2611
  python3 fetch_data.py --nasr 2026-10-01 --tpp 2610 --from-local ./nasr   # reuse already-downloaded files

NASR  = National Airspace System Resources 28-day subscription (public, free):
        https://nfdc.faa.gov/webContent/28DaySub/extra/<DD>_<Mon>_<YYYY>_<APT|FRQ|DP|AWOS>_CSV.zip
d-TPP = Digital Terminal Procedures metafile:
        https://aeronav.faa.gov/d-tpp/<cycle>/xml_data/d-TPP_Metafile.xml
"""
import argparse, datetime, os, sys, urllib.request, zipfile, io, shutil

def get(url, ua="Mozilla/5.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nasr", required=True, help="NASR effective date YYYY-MM-DD (28-day cycle start)")
    ap.add_argument("--tpp", required=True, help="d-TPP cycle id, e.g. 2611")
    ap.add_argument("--raw", default=os.path.join(os.path.dirname(__file__), "raw"))
    ap.add_argument("--from-local", help="dir with already-extracted APT_CSV/FRQ_CSV/DP_CSV + dtpp.xml")
    a = ap.parse_args()
    out = os.path.join(a.raw, a.nasr); os.makedirs(out, exist_ok=True)
    d = datetime.date.fromisoformat(a.nasr)
    tag = f"{d.day:02d}_{d.strftime('%b')}_{d.year}"
    for k in ("APT", "FRQ", "DP", "AWOS"):
        names = {"APT": ["APT_BASE.csv", "APT_RWY_END.csv"], "FRQ": ["FRQ.csv"], "DP": ["DP_BASE.csv", "DP_RTE.csv"], "AWOS": ["AWOS.csv"]}[k]
        if a.from_local:
            for n in names:
                p = os.path.join(a.from_local, f"{k}_CSV", n)
                if os.path.exists(p): shutil.copy(p, out)
            continue
        z = zipfile.ZipFile(io.BytesIO(get(f"https://nfdc.faa.gov/webContent/28DaySub/extra/{tag}_{k}_CSV.zip")))
        for n in names: open(os.path.join(out, n), "wb").write(z.read(n))
        print("fetched", k, [n for n in names])
    if a.from_local: shutil.copy(os.path.join(a.from_local, "dtpp.xml"), out)
    else: open(os.path.join(out, "dtpp.xml"), "wb").write(get(f"https://aeronav.faa.gov/d-tpp/{a.tpp}/xml_data/d-TPP_Metafile.xml"))
    try:                                   # FAA CIFP (ARINC 424): approach fixes / altitudes / missed approaches (optional)
        cd = f"{d.year % 100:02d}{d.month:02d}{d.day:02d}"
        if a.from_local:
            src = os.path.join(a.from_local, "FAACIFP18")
            if os.path.exists(src): shutil.copy(src, out)
        else:
            z = zipfile.ZipFile(io.BytesIO(get(f"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_{cd}.zip")))
            open(os.path.join(out, "FAACIFP18"), "wb").write(z.read("FAACIFP18")); print("fetched CIFP", cd)
    except Exception as e: print("CIFP not available (" + str(e) + ") - continuing without it")
    print("raw data in", out)

if __name__ == "__main__": main()
