#!/bin/bash
# tools/stamp_release.sh <site_dir> <sha> : stamps a release (used by the Pages workflow and by tests/upgrade_test.py)
#   sw.js CACHE name, js/version.js commit/built, version.json (never cached by the service worker)
set -e; SITE="$1"; SHA="$2"; NOW=$(date -u +%Y-%m-%dT%H:%MZ)
sed -i "s/^const CACHE = .*/const CACHE = 'amr-planner-${SHA}';/" "$SITE/sw.js"
VER=$(sed -n "s/.*version: '\([^']*\)'.*/\1/p" "$SITE/js/version.js" | head -1)
sed -i "s/commit: '[^']*'/commit: '${SHA}'/; s/built: '[^']*'/built: '${NOW}'/" "$SITE/js/version.js"
printf '{"version":"%s","commit":"%s","built":"%s"}\n' "$VER" "$SHA" "$NOW" > "$SITE/version.json"
grep -n "^const CACHE" "$SITE/sw.js"; cat "$SITE/version.json"
