#!/usr/bin/env python3
"""Pull the aircraft table (Directions!AJ1:AU10) and device table (Directions!AA1:AD34) out of the workbook
into site/data/static.json.  Usage: extract_static.py AMR_Template_AZ.xlsm ../site/data/static.json"""
import sys, json, warnings
warnings.filterwarnings('ignore')
import openpyxl
src, out = sys.argv[1], sys.argv[2]
ws = openpyxl.load_workbook(src, data_only=True, keep_vba=True)['Directions']
def v(c):
    x = ws[c].value
    if isinstance(x, float) and x == int(x): x = int(x)
    return x
acft = []
for r in range(2, 11):
    if ws[f'AJ{r}'].value is None: continue
    acft.append(dict(design=v(f'AJ{r}'), mil=v(f'AK{r}'), td=v(f'AL{r}'), gw=v(f'AM{r}'), burn=v(f'AN{r}'), unit=v(f'AO{r}'),
        fob=round(float(ws[f'AP{r}'].value), 2), cr90=v(f'AQ{r}'), cr110=v(f'AR{r}'), cr120=v(f'AS{r}'), hover=v(f'AT{r}'), climb=v(f'AU{r}')))
dev = []
for r in range(2, 35):
    if ws[f'AA{r}'].value is None: continue
    dev.append(dict(device=v(f'AA{r}'), type=v(f'AB{r}'), n=str(v(f'AC{r}')), pad=v(f'AD{r}')))
json.dump(dict(acft=acft, devices=dev), open(out, 'w'), indent=1)
print(len(acft), 'aircraft,', len(dev), 'devices')
