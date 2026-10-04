#!/usr/bin/env bash
# Build the private artifact preview of apps/web: relative asset paths, graph and base map as base64 text,
# "_next" renamed to "next" (the artifact host reserves leading underscores), no legacy polyfill.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.data-cache/artifact-app"
cd "$ROOT/apps/web"
rm -rf out && ARTIFACT=1 NEXT_PUBLIC_GRAPH_B64=1 NEXT_TELEMETRY_DISABLED=1 npx next build
rm -rf "$OUT" && mkdir -p "$OUT/graph"
cp -r out/_next "$OUT/next"
for f in out/graph/*.graph.json.gz; do base64 -w0 "$f" > "$OUT/graph/$(basename "$f" .json.gz).b64.txt"; done
cp out/graph/london-network.json "$OUT/graph/"
mkdir -p "$OUT/basemap" "$OUT/fonts"
for f in out/basemap/*.pmtiles; do base64 -w0 "$f" > "$OUT/basemap/$(basename "$f" .pmtiles).b64.txt"; done
cp out/fonts/glyphs.json "$OUT/fonts/"
python3 - out/index.html "$OUT/causewayside.html" <<'PY'
import re, sys
html = open(sys.argv[1]).read()
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
head = re.sub(r'<meta charSet="utf-8"/>|<meta name="viewport"[^>]*/>', "", head)
page = re.sub(r'<script src="[^"]*polyfills-[^"]*" noModule=""></script>', "", head + "\n" + body)
open(sys.argv[2], "w").write(page)
PY
cd "$OUT"
rm -f next/static/chunks/polyfills-*.js
grep -rl "/_next/" causewayside.html next | xargs sed -i 's#/_next/#/next/#g'
echo "preview in $OUT"
