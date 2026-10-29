#!/bin/bash
# Workbook-free checks run by GitHub Actions before every deploy (and runnable locally):
#   unit tests of the model math / weather validation, sanity checks of the shipped FAA data, and a headless-Chromium UI smoke test
# Needs: node, python3 with `playwright` (+ a Chromium: `playwright install chromium`).
set -e; cd "$(dirname "$0")"
node unit.js
node unit_forms.js
python3 form_fidelity.py
python3 data_sanity.py
(cd ../site && python3 -m http.server 8799 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/amr_ci_srv.pid)
trap 'kill $(cat /tmp/amr_ci_srv.pid) 2>/dev/null || true' EXIT
sleep 1
python3 ci_ui.py http://127.0.0.1:8799/
