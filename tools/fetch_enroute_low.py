#!/usr/bin/env python3
"""Fetch the FAA IFR Enroute LOW altitude chart footprints and write data/enroute_low.json.

Source: FAA Aeronautical Information Services (AIS) open-data ArcGIS feature service "EnrouteStatus", layer 1 "Low"
  https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/EnrouteStatus/FeatureServer/1
(one polygon per IFR Enroute Low chart panel: MAPID_TXT e.g. 'A::IFR::US Low::L-04::L-04', Alaska 'AK Low').  The L-chart layout changes very rarely,
so this is run by hand (not by the 28-day refresh); build_data.py reads the committed data/enroute_low.json and tags every airport with the chart(s)
whose map polygon contains it (airport field 'el').  Insets (area charts: Boston, Wilmington, Juneau, ...) and the Alaska Route Selection chart are skipped.
Hawaii / Pacific (EPHI) and Caribbean (ELCB) enroute charts are not in this layer -> airports there get no 'el' (typed on the Plan).
   python3 tools/fetch_enroute_low.py"""
import json, re, os, urllib.request, urllib.parse, datetime
URL = ('https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/EnrouteStatus/FeatureServer/1/query?'
       + urllib.parse.urlencode(dict(where='1=1', outFields='MAPID_TXT,NAME_TXT,SERIES_TXT', outSR=4326, f='geojson', returnGeometry='true', resultRecordCount=1000, geometryPrecision=4)))
g = json.load(urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'}), timeout=120))
INSET = {'Wilmington', 'Boston', 'Juneau', 'Vancouver', 'Anchorage', 'Fairbanks', 'Nome', 'Route Selection'}
charts = {}
for f in g['features']:
    p = f['properties']; parts = p['MAPID_TXT'].split('::')                      # A :: IFR :: US Low|AK Low :: <chart> :: <panel>
    if p['NAME_TXT'] in INSET: continue
    ak = parts[2].startswith('AK'); ch = parts[3]
    m = re.fullmatch(r'(?:AK )?L-0*(\d+)[NSCEW]?', ch)
    if not m: continue
    label = ('AK ' if ak else '') + 'L-' + m.group(1)
    geo = f['geometry']; polys = [geo['coordinates']] if geo['type'] == 'Polygon' else geo['coordinates']
    for poly in polys:
        ring = [[round(x, 3), round(y, 3)] for x, y in poly[0]]
        charts.setdefault(label, []).append({'panel': p['NAME_TXT'], 'ring': ring})
out = {'source': 'FAA AIS EnrouteStatus FeatureServer layer 1 (Low) - IFR Enroute Low altitude chart map polygons', 'fetched': datetime.date.today().isoformat(),
       'note': 'Footprints of the chart map areas as published by the FAA (adjacent charts overlap); L-6N/L-6S are one chart (L-6); Hawaii/Pacific and Caribbean are not covered', 'charts': charts}
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'enroute_low.json')
json.dump(out, open(path, 'w'), separators=(',', ':')); print(path, os.path.getsize(path), 'bytes;', len(charts), 'charts:', sorted(charts, key=lambda c: (c.startswith('AK'), int(re.search(r'\d+', c).group()))))
