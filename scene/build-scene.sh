#!/bin/bash
# Rebuilds ../buddies.html from src/ after changing the scene (animation, director, activities…).
# Uses the already-sculpted meshes in baked-meshes.b64, so it takes seconds.
# If you change the characters' SHAPES (sculpt code), re-bake first:  node build.mjs && python3 bake_export.py
# then save the new blob:  python3 -c "import re;open('baked-meshes.b64','w').write(re.search(r'__BAKED_GZ=\"([^\"]+)\"',open('buddies_baked.html').read()).group(1))"
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
node build.mjs
python3 - <<'PY'
blob = open('baked-meshes.b64').read().strip()
html = open('buddies.html').read()
html = html.replace('<script>', '<script>window.__BAKED_GZ="' + blob + '";</script><script>', 1)
open('../buddies.html', 'w').write(html)
print('../buddies.html', round(len(html) / 1e6, 1), 'MB')
PY
rm -f buddies.html
