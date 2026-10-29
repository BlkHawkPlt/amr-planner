#!/usr/bin/env python3
"""Refresh the app's FAA data when a new 28-day cycle has been posted.

For the current cycle and the next one (the app ships both, so it keeps working across the changeover), check whether the FAA
has posted BOTH the NASR 28-day subscription CSVs and the d-TPP metafile. Cycles that are posted but not yet in site/data are
downloaded, built (data/build_data.py) and merged into site/data/manifest.json. Cycles that have expired are dropped.

  python3 refresh.py [--force] [--states AZ,NM | ALL] [--now 2026-11-01T00:00:00Z] [--dry-run]

Writes `changed=true|false` (and `cycles=...`) to $GITHUB_OUTPUT when run in GitHub Actions.  Exit 0 = ok (changed or not).
Settings come from data/config.json (states / preload / filter); --states overrides.
"""
import argparse, datetime as dt, json, os, shutil, subprocess, sys, urllib.request, urllib.error, glob
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(HERE, '..', 'site', 'data')
ANCHOR = dt.date(2026, 10, 29)            # a known NASR effective date (= d-TPP cycle 2611); all others are multiples of 28 days away

def cycle_for(start):
    """start: NASR effective date (a date on the 28-day grid) -> dict(nasr, tpp, from, to)"""
    assert (start - ANCHOR).days % 28 == 0
    jan1 = dt.date(start.year, 1, 1)
    first = ANCHOR + dt.timedelta(days=28 * -((ANCHOR - jan1).days // 28))       # first grid date on/after Jan 1
    n = (start - first).days // 28 + 1
    f = lambda d: d.strftime('%Y-%m-%dT09:01Z')
    return dict(nasr=start.isoformat(), tpp=f'{start.year % 100:02d}{n:02d}', **{'from': f(start), 'to': f(start + dt.timedelta(days=28))})

def cycles_around(now):
    d = now.date(); k = (d - ANCHOR).days // 28
    cur = ANCHOR + dt.timedelta(days=28 * k)
    if now < dt.datetime.combine(cur, dt.time(9, 1), tzinfo=dt.timezone.utc): cur -= dt.timedelta(days=28)
    return [cycle_for(cur), cycle_for(cur + dt.timedelta(days=28))]

def posted(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-64'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status in (200, 206)
    except urllib.error.HTTPError as e:
        if e.code in (404, 403): return False
        raise

def urls(c):
    d = dt.date.fromisoformat(c['nasr']); tag = f"{d.day:02d}_{d.strftime('%b')}_{d.year}"
    return [f'https://nfdc.faa.gov/webContent/28DaySub/extra/{tag}_{k}_CSV.zip' for k in ('APT', 'FRQ', 'DP', 'AWOS')] + [f"https://aeronav.faa.gov/d-tpp/{c['tpp']}/xml_data/d-TPP_Metafile.xml"]

SCHEMA = 3        # bump when build_data.py output changes shape; forces already-shipped cycles to be rebuilt

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--force', action='store_true'); ap.add_argument('--states'); ap.add_argument('--now'); ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, 'config.json')))
    states = a.states.split(',') if a.states and a.states.upper() != 'ALL' else (['ALL'] if a.states else cfg['states'])
    allst = states == ['ALL'] or states == 'ALL'
    now = dt.datetime.fromisoformat(a.now.replace('Z', '+00:00')) if a.now else dt.datetime.now(dt.timezone.utc)
    mpath = os.path.join(SITE, 'manifest.json')
    old = json.load(open(mpath)) if os.path.exists(mpath) else dict(cycles=[], filter=cfg['filter'])
    have = {c['tpp']: c for c in old['cycles']}
    stale = old.get('schema', 1) != SCHEMA
    want = cycles_around(now); print('now', now.isoformat(), '-> current/next cycles', [c['tpp'] for c in want])
    built = {}
    for c in want:
        have_it = c['tpp'] in have
        want_states = None if allst else states
        if have_it and not a.force and not stale:
            same = allst and len(have[c['tpp']]['states']) > 20 or (not allst and set(states) <= set(have[c['tpp']]['states']))
            if same: print(c['tpp'], 'already shipped'); continue
        ok = all(posted(u) for u in urls(c))
        if not ok: print(c['tpp'], 'not (fully) posted by the FAA yet -> skip'); continue
        print(c['tpp'], 'posted; building' + (' (dry run)' if a.dry_run else ''))
        if a.dry_run: built[c['tpp']] = None; continue
        raw = os.path.join(HERE, 'raw', c['nasr']); out = os.path.join(HERE, 'out', c['tpp'])
        subprocess.check_call([sys.executable, os.path.join(HERE, 'fetch_data.py'), '--nasr', c['nasr'], '--tpp', c['tpp']])
        shutil.rmtree(out, ignore_errors=True)
        subprocess.check_call([sys.executable, os.path.join(HERE, 'build_data.py'), '--raw', raw, '--tpp-cycle', c['tpp'], '--states', 'ALL' if allst else ','.join(states), '--filter', cfg['filter'], '--out', out] + (['--cifp', os.path.join(raw, 'FAACIFP18')] if os.path.exists(os.path.join(raw, 'FAACIFP18')) else []))
        built[c['tpp']] = (c, out)
    if a.dry_run or (not built):
        changed = bool(built)
    else: changed = True
    # drop expired cycles from the old manifest; merge freshly built ones
    keep = {t: c for t, c in have.items() if dt.datetime.fromisoformat(c['to'].replace('Z', '+00:00')) > now and t in [w['tpp'] for w in want]}
    dropped = [t for t in have if t not in keep and t not in built]
    if not keep and not built: keep = dict(have); dropped = []; print('keeping expired cycles: nothing newer is available yet')
    if dropped: changed = True; print('dropping expired/unknown cycles', dropped)
    if not a.dry_run:
        pre = set(cfg.get('preload', []))
        for t, (c, out) in built.items():
            dst = os.path.join(SITE, t); shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
            man = json.load(open(os.path.join(out, 'manifest.json')))
            ent = {}
            for s, info in sorted(man['states'].items()):
                shutil.copy(os.path.join(out, 'states', f'{s}.json'), os.path.join(dst, f'{s}.json'))
                ent[s] = dict(url=f'data/{t}/{s}.json', airports=info['airports'], pre=(s in pre) if allst else True)
            entry = dict(tpp=t, nasr=c['nasr'], **{'from': c['from'], 'to': c['to']}, states=ent)
            if allst and os.path.exists(os.path.join(out, 'index.json')): shutil.copy(os.path.join(out, 'index.json'), os.path.join(dst, 'index.json')); entry['index'] = f'data/{t}/index.json'
            keep[t] = entry
        for d in glob.glob(os.path.join(SITE, '[0-9][0-9][0-9][0-9]')):
            if os.path.basename(d) not in keep: shutil.rmtree(d); print('removed', d)
        new = dict(cycles=sorted(keep.values(), key=lambda c: c['from']), filter=cfg['filter'], schema=SCHEMA)
        if changed or stale: changed = True; json.dump(new, open(mpath, 'w'), indent=1); open(mpath, 'a').write('\n')
    print('changed =', changed, '| manifest cycles:', [c for c in sorted(keep)] )
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f: f.write(f'changed={"true" if changed else "false"}\ncycles={",".join(sorted(keep))}\n')

if __name__ == '__main__': main()
