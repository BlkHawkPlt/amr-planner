# IFR AMR Planner

A free, offline-capable web app (PWA) for planning instrument training missions **anywhere in the United States** - all 50 states, DC and the territories.
Pick a date, aircraft, departure + destination 1 + destination 2 (+ alternate), and the runway / approach / SID / STAR / weather for each airport, and the app produces the **AMR**, the
**DD 1801 / 1801-C** flight plan, the **DD 175-1** and the **ATC radio scripts** (AWOS/ASOS aware, every blank filled from the plan + FAA data), plus the **Publications**
line of the AMR (IFR Enroute Low charts, VFR sectionals, approach-plate volumes and plates). No account, no backend, no ads, no cost: everything runs in your browser and your
missions stay on your device.

**Live:** https://blkhawkplt.github.io/amr-planner/

> **Not for real-world navigation.** Training and planning aid only. Airport, runway, approach, procedure and frequency data come from the FAA NASR 28-day subscription,
> the d-TPP metafile and the FAA CIFP; chart coverage is approximate. Verify everything against current official FAA / DoD publications and NOTAMs before flight.

## Using it
1. **Open the link** in Safari (iPhone / iPad) or Chrome / Edge (desktop or Android). On first run you are asked **which states you fly in** (see below).
2. **Install it to the Home Screen** (once, while online): iPhone/iPad - Safari -> Share -> *Add to Home Screen*; Android - Chrome menu -> *Install app*; desktop Chrome/Edge - the install icon in the address bar.
   After that it opens full-screen and works offline for every state you picked.
3. **Plan tab** - the only place you edit: date, aircraft, tail number, then type an airport ID (`KJFK`, `JFK`, `KDEN`, `PANC`, `PHNL`, a heliport such as `PA14`, ...) in Departure, Destination 1, Destination 2 and (optionally) Alternate.
   Choose weather source, approach, runway, SID / DP / ODP, STAR, ETD, etc. Anything the FAA data can tell you is filled in; every filled value can be overridden.
4. **AMR / DD 1801 / 1801-C / DD 175-1 / Scripts** tabs are read-only renderings of that one plan, so they cannot disagree. **Print / PDF** makes the filled official forms.
5. **Missions** (top right) saves named missions on this device, exports / imports them as a `.json` backup, and starts a new blank mission. Crew names and unit are blank - type your own.

### Choosing states (offline use)
* **First run:** a picker lists every state and territory with its airport count and download size (1 kB - 110 kB each, about 1.3 MB for all of them). Tick the ones you want offline - or *None*; you can change this at any time.
* **Info tab -> States on this device:** tick to download and keep a state, untick to remove it. *AZ + PA* / *All states* / *None* are shortcuts. A "saved offline" mark shows what is cached.
* **Any airport ID works anywhere.** A small nationwide ID index (28 kB) maps every ID to its state. If you type an ID from a state you did not pick, the suggestion says *"tap to download XX and use it"*; the state is fetched (and cached by the service worker) and the mission works - missions can mix states freely.
* Existing installs keep **AZ + PA** and their saved missions untouched.

### What the app fills in from FAA data (per airport)
Runways, approaches (with IAF / crossing altitude / missed-approach text from CIFP), SIDs / DPs (graphic and **textual obstacle departure procedures**), STARs, towered vs uncontrolled, ATIS / AWOS / ASOS and the default weather source,
CTAF / UNICOM, clearance-delivery phone numbers, the approach control or ARTCC that takes the first call (with an inferred Center frequency), and the VFR sectional.
**Publications** (AMR page, all blank = auto, type to override): *ELA* = the IFR Enroute Low chart(s) covering the departure, destinations and alternate (route order, de-duplicated);
*VFR Sectional* = their sectionals; *IAP* = the d-TPP volume(s) (`SW-4`, `NE-2`, ...) plus the approach plate(s) you chose on the Plan, e.g. `SW-4: ILS OR LOC RWY 06R (KRYN), ILS OR LOC RWY 12 (KTUS)`.

## Nationwide data (v1.6)
`site/data/manifest.json` lists the current and next 28-day cycle; each cycle has **one file per state / territory** (`data/<cycle>/<ST>.json`, 58 files incl. `DC`, `PR`, `VI`, `GU`, `AS`, `MP`, `UM` and `XX` = records with no US state code)
and `ids.json` (ID -> state index, 28 kB gzip). Cycle 2611: **10,754 airports** (4,834 public airports, 316 military airports/heliports, 5,597 heliports, 7 public glider/ultralight fields); 733 have a control tower.
Largest states (gzip): TX 108 kB (864 airports), CA 84 kB, FL 62 kB, AK 47 kB, PA 43 kB; all states together **1.30 MB gzip / 7.8 MB raw per cycle**, two cycles in `site/data` = 16 MB.
GitHub Pages limits (1 GB repo, 1 GB site) are nowhere near: expired cycles are dropped by `refresh.py`, and each refresh adds about 1.3 MB of compressed history to git.
The airport filter is unchanged (below); per airport fields are `n e c k p sc v r i d s x f g w t h pr` as before plus `el` (IFR Enroute Low charts) and `o` (textual ODP lines).

### IFR Enroute Low charts (`el`)
Source: the FAA Aeronautical Information Services ArcGIS service `EnrouteStatus` layer 1 ("Low"), the published footprint polygons of the L-charts (`tools/fetch_enroute_low.py` -> `data/enroute_low.json`, 40 charts; L-6N/S merged into L-6; Alaska as `AK L-n`).
At build time each airport is tested against the polygons (interior charts first). **This is approximate** - footprints overlap and the polygons are generalised - so the AMR names the chart(s) containing the airport and the Plan shows what it used.
Airports outside every footprint (Hawaii, Puerto Rico, territories, foreign `XX` records, 2 Alaska fields) get **no** ELA and the Plan says so instead of guessing; type the chart yourself.

### Textual obstacle departure procedures (`o`)
`data/odp.py` downloads the d-TPP "Takeoff Minimums / (Obstacle) Departure Procedures" section (the `T` PDFs), converts them with `pdftotext` and keeps each airport's `DEPARTURE PROCEDURE:` lines (<= 8 lines, <= 420 characters each; 1,468 airports in 2611).
They appear in the existing **SID / DP / ODP** dropdown on the Plan as *"Obstacle departure procedure (textual, see Takeoff Minimums)"*, next to any graphic DP (KMUI: *COPTER MUIR FOUR* + the textual ODP); the lines are shown under the dropdown and the departure script says "via the published obstacle departure procedure".

## Automatic 28-day refresh
`refresh.yml` runs daily (09:17 UTC) and on demand (*Actions -> Refresh FAA data -> Run workflow*, optional `force` / `states`). `data/refresh.py` computes the current and next 28-day cycles and only when the FAA has posted **both** the NASR CSVs and the
d-TPP metafile for a cycle that is not yet in `site/data` does it download, build **all states** (`data/config.json`: `"states": "ALL"`), and merge it (expired cycles are dropped). The job installs `poppler-utils` (for the ODP text) and has a 2 h limit; a full rebuild of both cycles takes minutes.
Then the tests run; if they pass the new data is committed to `main` and Pages is redeployed; if they fail nothing is committed or deployed. The app picks the cycle by today's date (0901Z changeover); a red badge shows if the data is expired.
Manual refresh: `python3 data/refresh.py --force` (needs network and `pdftotext`), then `tests/ci.sh`. `--states AZ,PA` builds a subset; `--reuse-raw` rebuilds from already downloaded files.

## Tests
`tests/ci.sh` (run before every deploy): `unit*.js` (model math, forms, hand-off logic, PA, sectionals, **unit_pubs.js** = ELA / plates / ODP + nationwide samples), `form_fidelity.py`, **`data_sanity.py`** (every state: shape, kinds, ELA coverage, ODP shape, ID index = state files, size limits),
headless-Chromium UI tests on iPhone + iPad sizes (`ci_ui.py`, AZ + PA suites `ci_pa.py` / `ci_sect.py`, **`ci_pubs.py`** = first-run picker, lazy state download, Publications, ODP, sample missions in NY / IL / CO / WA / AK / HI / FL / CA / MT),
`e2e_sync.py` (every Plan input reaches every output) and `upgrade_test.py` (v1.0 ... v1.5 installs upgrade in place, saved missions survive).
    cd site && python3 -m http.server 8765        # http://localhost:8765/  (service worker needs localhost or https)
    pip install playwright pymupdf && playwright install chromium && tests/ci.sh

## Known gaps
* No ELA for Hawaii / Puerto Rico / territories / foreign `XX` records (no L-chart footprint), and chart coverage elsewhere is approximate (see above).
* Military-only (NGA) approaches are not in the FAA CIFP / d-TPP, so those fix / altitude blanks stay; `XX` records are foreign fields near the border that NASR files without a state.
* Textual ODPs are the `DEPARTURE PROCEDURE:` lines of the T section only (parsed from PDFs); read the full Takeoff Minimums page for climb gradients and notes.
* NASR names one approach / departure provider per airport and has no GCO frequencies; the Center frequency is inferred from the nearest RCAG, not sector-exact. Part-time tower hours are flagged, not evaluated.
* DD 1801 is the 1 May 1987 edition (the current DoD file is a dynamic Adobe-only form of the same edition). No NOTAMs or live weather. Tested in headless Chromium, not on physical iOS hardware.

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
