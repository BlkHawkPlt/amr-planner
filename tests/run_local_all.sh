#!/bin/bash
# Full regression: unit, data-vs-workbook, model-vs-workbook (LibreOffice recalculated), UI end-to-end.
# Needs: node, python3 + openpyxl + playwright (system Chrome), LibreOffice (for compare_workbook.py), and the workbook at $AMR_XLSM (path to the original workbook, which is NOT in the repo)
set -e; cd "$(dirname "$0")"
node unit.js
python3 verify_data_vs_workbook.py
python3 compare_workbook.py --compat
python3 e2e.py                # corrected-formula mode (default)
COMPAT=1 python3 e2e.py       # workbook-bug-compatible mode
