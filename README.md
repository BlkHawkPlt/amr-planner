# IFR AMR Planner

Static, offline-capable web app (PWA) for planning instrument training missions: pick date / aircraft (UH-72, UH-60L, UH-60M) / tail number, departure +
destination 1 + destination 2, runway / approach / SID / STAR / weather per airport, and it produces the **AMR**, the **DD 1801** (DoD International Flight Plan - the flight plan everywhere in the app; ETE/ETD/ETA are the DD 1801 EET numbers) with **DD 1801-C**; the old **DD 175** is only a hidden legacy option (Info > Show legacy DD 175),
**DD 175-1** and the **Grade Sheet ATC call scripts** (AWOS/ASOS aware, every fillable blank filled from the plan + FAA data). No backend, no accounts; inputs are saved in the browser
(localStorage) and named missions can be saved/loaded. Arizona and Pennsylvania are loaded (v1.4); the data pipeline and loader are built to scale to all states.

**Live:** https://blkhawkplt.github.io/amr-planner/  (open on iPad/iPhone in Safari → Share → *Add to Home Screen*, once, while online)

> Training / planning aid only. Airport, runway, approach, SID/STAR and frequency data come from the FAA NASR 28-day subscription
> and d-TPP metafile. Verify everything against current FAA / DoD flight publications and NOTAMs before flight.

## Layout
    site/                      everything that gets deployed to GitHub Pages
      index.html, css/, js/, icons/, sw.js, manifest.webmanifest   (all paths are relative -> works under /amr-planner/)
      js/model.js              pure logic (formulas, wx validation, flight timing, DD 1801 / 175-1 / AMR; legacy DD 175) - testable in node
      js/scripts.js            Grade Sheet ATC scripts + AWOS/ASOS-vs-ATIS detection + facility lookup
      js/ops.js                towered-vs-uncontrolled (M.ctlOf) and the departure / arrival hand-off facility by direction (M.handoff)
      js/dd1801.js             DD 1801 / 1801-C field values (workbook mapping)
      js/forms.js              fills the OFFICIAL DoD PDFs (site/forms/*.pdf) with pdf-lib; vendor/ = pdf-lib + pdf.js (MIT / Apache-2.0)
      forms/                   (repo root) prepare_forms.py + original/ = the official PDFs as downloaded; site/forms = browser-fillable blanks
      js/data.js               FAA-cycle selection + lazy per-state loader
      js/app.js                UI
      data/manifest.json       cycles + states available; data/<cycle>/<ST>.json = one file per state
      data/static.json         aircraft performance table + device/serial table
    data/                      pipeline (not deployed)
      config.json              states to build ("AZ" or ["AZ","NM"] or "ALL"), service-worker preload list, airport filter
      refresh.py               checks the FAA for a new cycle; if found: fetch -> build -> merge into site/data
      fetch_data.py / build_data.py / ops.py / cifp.py / assemble_site.py / extract_static.py / make_icons.py
                               (ops.py adds per airport t = control tower / airspace class / clearance phones and h = approach-control + Center candidates)
                               (cifp.py reads the FAA CIFP for IAF / crossing altitude / missed-approach text; AWOS.csv gives AWOS/ASOS type + phone)
    tests/
      ci.sh                    what CI runs: unit.js + unit_forms.js + unit_ops.js + form_fidelity.py + data_sanity.py + ci_ui.py (headless Chromium, iPhone + iPad)
      form_fidelity.py         proves the filled PDFs differ from the official blanks only inside the form's fields (max box offset 0.000 pt)
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
**v1.4:** `states` is a list (`["AZ","PA"]`); the app loads every state shipped in the manifest (about 60 kB gzip for AZ + PA per cycle, all preloaded for offline use), so airport IDs and search work across states
and one mission can mix states. Each airport card on the Plan has a small "All states / AZ / PA" search filter (default All states; typing an exact ID always works). The full nationwide picker is still to come.

## Airport filter (`--filter training`, the default)
Open airports that are public-use, or military/Coast Guard owned, or any heliport (incl. private heliports). Private airstrips are dropped; ultralight and glider ports are kept only if public;
seaplane bases (NASR site type C) and balloonports are always dropped (this only started to matter with PA).

## One source of truth, and updates
The **Plan** tab is the only place inputs are edited (weather source, approach, runway, SID/STAR, ETD, void/NLT minutes, ...); AMR, DD 1801, 1801-C, 175-1 and the
Scripts are rendered from that one saved mission, so they cannot disagree (Scripts shows a read-only summary with a "Change on Plan" button).
Void and NLT are ETD + N minutes, default 30 / 30, both editable on the Plan tab.

Releases replace each other by themselves: the deploy stamps the service-worker cache, `js/version.js` and `version.json` with the commit id;
the new worker fills its cache with `cache:'reload'` requests (GitHub Pages' 10-minute HTTP cache cannot leak old files in), deletes old caches and reloads open windows;
the page also compares `version.json` with its own build on launch / when brought to the foreground and shows "Update available - tap to update".
Info shows the version + commit, "Check for updates" and "Force refresh app files" (keeps your missions).

## Towered vs uncontrolled, and the first call after departure (v1.3)
**Control.** Each airport carries `t` (from NASR APT_BASE, ATC_BASE/ATC_SVC/ATC_RMK, CLS_ARSP, FRQ): an operating control tower (ATCT/TWR, hours, part-time flagged), the airspace class, and for
uncontrolled fields the CTAF / UNICOM frequency and the clearance phone numbers NASR lists in the remarks (e.g. KMZJ: Tucson Approach 520-829-6121). The Plan shows it per airport with an override
(Auto / Towered / Uncontrolled). *Part-time towers* are only flagged with their hours - the app cannot know the time of day, so set Uncontrolled yourself for a closed-tower sim.
- **Towered departure:** ATIS -> clearance delivery -> ground -> tower -> departure (unchanged).
- **Uncontrolled departure:** clearance method dropdown (Phone / GCO / Airborne pickup); no taxi or takeoff clearance - the scripts use CTAF advisory calls (taxi, departing + direction), then the pilot calls the facility. NASR has no GCO frequencies, so the GCO frequency is typed on the Plan (blank marker otherwise); the clearance phone can also be overridden.
- **Uncontrolled arrival:** CTAF advisory position report / final / clear-of-runway calls replace the tower calls.
- **AWOS / ASOS broadcast** (departure and destinations): "<Airport name> automated weather (AWOS) or automated surface observation (ASOS), <plan Zulu time>, wind .. at .., visibility .., sky condition .., temperature .., dewpoint .., altimeter .. (repeats)". No runway in use, no information letter.

**How the hand-off facility is chosen** (`M.handoff`, shown on the Plan with the reason, overridable from a dropdown of candidates): 1) the approach/departure provider NASR lists for the airport;
2) else a towered field's own approach control; 3) else the terminal approach control (a facility serving an airport within 15 nm) whose bearing from the airport is within 90 deg of the initial course to the next destination;
4) else the responsible ARTCC (RCAG frequency inferred from the nearest RCAG-listed airport); 5) else the nearest terminal facility. Arrivals use the course toward where the flight came from. Between a terminal facility and a different terminal
facility the script adds a Center step. Known limits: NASR names only one provider per airport (so P08 / Coolidge is Albuquerque Center in both directions), the Center frequency is inferred (not sector-exact), and part-time tower hours are text only.

## Run / test locally
    cd site && python3 -m http.server 8765        # http://localhost:8765/  (service worker needs localhost or https)
    pip install playwright pymupdf && playwright install chromium && tests/ci.sh
    # ci.sh = unit, forms fidelity, data, UI smoke (iPhone+iPad), e2e_sync.py (every Plan input -> Scripts/AMR/1801/1801-C/175-1), upgrade_test.py (old releases -> new)

## Known gaps (v1)
DD 1801 is the 1 May 1987 edition (the current DoD file is a dynamic Adobe-only form of the same edition, so the static 2023 copy is filled); military-only (NGA) approaches are not in FAA CIFP so their fix/altitude blanks stay; no state picker yet; sun times (BMNT/EENT) are a NOAA approximation; great-circle distances are hints;
no NOTAMs or live weather; tested in headless Chromium, not on physical iOS hardware.

## VFR sectional (v1.5)
Each airport carries `sc` = the FAA VFR sectional chart it is on, taken from NASR `APT_BASE.csv` column `CHART_NAME` (e.g. PHOENIX, NEW YORK, WASHINGTON); about 95% of AZ + PA facilities have one.
`M.sectionals(m, env)` lists the charts for departure, destination 1, destination 2 and the alternate in route order, de-duplicated (`PHOENIX, NEW YORK, WASHINGTON`).
The AMR "VFR Sectional:" row (Publications, same place as the workbook's AMR!A41) uses that list; the Plan's AMR details field "VFR sectional" is a manual override - blank = auto.
`refresh.py` SCHEMA 5 forces already-shipped cycles to be rebuilt with the field; `tests/data_sanity.py` fails a refresh that loses it. Tests: `tests/unit_sect.js`, `tests/ci_sect.py`.

## Weather-source default (v1.5)
If the FAA data lists an ATIS / D-ATIS frequency for an airport the default is ATIS (frequency + info letter), even when the field also lists an ASOS/AWOS - Lancaster (KLNS) and Reading (KRDG) list both on the same frequency and are ATIS.
ASOS/AWOS is the default only when the FAA lists no ATIS; a field with neither defaults to ATIS. The ATIS/AWOS/ASOS dropdown on every Plan airport card overrides it.

## Pennsylvania (v1.4)
393 facilities per cycle with the same filter as AZ: 108 public airports, 1 public gliderport, 1 public ultralight park, 4 public heliports, 6 military heliports (Muir AHP / Fort Indiantown Gap, Carlisle Barracks,
Letterkenny, Tobyhanna, Oakdale AHP, North Penn USARC) and 273 private heliports. The first-contact logic is unchanged and data-driven: the provider NASR lists for the airport (Harrisburg, Philadelphia, Pittsburgh,
Allentown, Wilkes-Barre, Buffalo, ... approach controls or New York / Cleveland / Washington Center), else the direction rule. Center frequencies are the nearest RCAG listed within 100 nm (was 80 nm; AZ is unaffected) -
beyond that the Center is named without a frequency. NASR has no GCO frequencies for PA either (type it on the Plan). Military-only approaches that are not in the d-TPP / CIFP are not in the app.
