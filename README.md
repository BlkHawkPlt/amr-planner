# IFR AMR Planner

Static, offline-capable web app (PWA) for planning instrument training missions: pick date / aircraft / device, departure +
destination 1 + destination 2, runway / approach / SID / STAR / weather per airport, and it produces the **AMR**, **DD 175**,
**DD 175-1** and the **Grade Sheet ATC call scripts**. No backend, no accounts; inputs are saved in the browser
(localStorage) and named missions can be saved/loaded. Arizona is loaded in v1; the data pipeline and loader are built to scale to all states.

**Live:** https://rcmckaig.github.io/amr-planner/  (open on iPad/iPhone in Safari → Share → *Add to Home Screen*, once, while online)

> Training / planning aid only. Airport, runway, approach, SID/STAR and frequency data come from the FAA NASR 28-day subscription
> and d-TPP metafile. Verify everything against current FAA / DoD flight publications and NOTAMs before flight.

## Layout
    site/                      everything that gets deployed to GitHub Pages
      index.html, css/, js/, icons/, sw.js, manifest.webmanifest   (all paths are relative -> works under /amr-planner/)
      js/model.js              pure logic (formulas, wx validation, DD 175 / 175-1 / AMR / script text) - testable in node
      js/data.js               FAA-cycle selection + lazy per-state loader
      js/app.js                UI
      data/manifest.json       cycles + states available; data/<cycle>/<ST>.json = one file per state
      data/static.json         aircraft performance table + device/serial table
    data/                      pipeline (not deployed)
      config.json              states to build ("AZ" or ["AZ","NM"] or "ALL"), service-worker preload list, airport filter
      refresh.py               checks the FAA for a new cycle; if found: fetch -> build -> merge into site/data
      fetch_data.py / build_data.py / assemble_site.py / extract_static.py / make_icons.py
    tests/
      ci.sh                    what CI runs: unit.js + data_sanity.py + ci_ui.py (headless Chromium, iPhone viewport)
      compare_workbook.py, e2e.py, verify_data_vs_workbook.py, run_local_all.sh
                               local-only regression against the original Excel workbook (the workbook is NOT in this repo; set AMR_XLSM)
    .github/workflows/
      pages.yml                test -> deploy `site/` to GitHub Pages (on push to main / manual / called by refresh)
      refresh.yml              daily: new FAA cycle posted? -> rebuild, test, commit, redeploy

## Automatic 28-day refresh
`refresh.yml` runs daily (09:17 UTC) and on demand (*Actions → Refresh FAA data → Run workflow*, optional `force` / `states`).
`data/refresh.py` computes the current and next 28-day cycles, and only when the FAA has posted **both** the NASR CSVs and the
d-TPP metafile for a cycle that is not yet in `site/data` does it download, build, and merge it (expired cycles are dropped).
Then the tests run; if they pass the new data is committed to `main` and Pages is redeployed; if they fail nothing is committed or deployed.
The app ships the current and next cycle and picks by today's date (0901Z changeover); a red badge shows if the data is expired.

Manual refresh: `python3 data/refresh.py --force` (needs network), then `tests/ci.sh`.

## Turning on more states
Edit `data/config.json` (`"states": ["AZ","NM"]` or `"ALL"`) and run *Refresh FAA data* with `force`. With `ALL` the build is about
2 MB raw / 0.46 MB gzip per cycle (59 state/territory files, `XX` = airports with no state code) plus a cross-state search index.
Only the `preload` states are cached up front for offline use; others are cached when first opened.
The v1 UI loads one state (`settings.state`, default AZ); a state picker and cross-state search are the next UI step.

## Airport filter (`--filter training`, the default)
Open airports that are public-use, or military/Coast Guard owned, or any heliport (incl. private heliports). Private airstrips,
ultralight and glider ports are dropped unless public.

## Run / test locally
    cd site && python3 -m http.server 8765        # http://localhost:8765/  (service worker needs localhost or https)
    pip install playwright && playwright install chromium && tests/ci.sh

## Known gaps (v1)
DD 1801 / 1801-C not built; no state picker yet; sun times (BMNT/EENT) are a NOAA approximation; great-circle distances are hints;
no NOTAMs or live weather; tested in headless Chromium, not on physical iOS hardware.
