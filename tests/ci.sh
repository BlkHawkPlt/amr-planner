#!/bin/bash
# Workbook-free checks run by GitHub Actions before every deploy (and runnable locally):
#   unit tests of the model math / weather validation, sanity checks of the shipped FAA data, and a headless-Chromium UI smoke test
#   + e2e_sync.py (every Plan input -> Scripts/AMR/1801/1801-C/175-1) and upgrade_test.py (old release -> new release)
# Needs: node, python3 with `playwright` (+ a Chromium: `playwright install chromium`).
set -e; cd "$(dirname "$0")"
node unit.js
node unit_forms.js
node unit_ops.js
node unit_pa.js
python3 form_fidelity.py
python3 data_sanity.py
(cd ../site && python3 -m http.server 8799 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/amr_ci_srv.pid)
trap 'kill $(cat /tmp/amr_ci_srv.pid) 2>/dev/null || true' EXIT
sleep 1
python3 ci_ui.py http://127.0.0.1:8799/
python3 ci_pa.py http://127.0.0.1:8799/        # v1.4: AZ + PA together, state filter, PA missions end to end
# Plan -> every output (all Plan inputs, 4 parallel shards) and old-release -> new-release upgrade
pids=(); for i in 1 2 3 4; do python3 -u e2e_sync.py http://127.0.0.1:8799/ --shard $i/4 > /tmp/e2e_sync_$i.txt 2>&1 & pids+=($!); done
rc=0; for p in "${pids[@]}"; do wait $p || rc=1; done
cat /tmp/e2e_sync_*.txt | grep -E "FAIL|shard" || true
[ $rc -eq 0 ] || exit 1
python3 -u upgrade_test.py
