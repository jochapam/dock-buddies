"""Sculpt both characters once in a headless browser, then write buddies_baked.html with the meshes stored inside."""
import base64, gzip, pathlib, re
from playwright.sync_api import sync_playwright
src = pathlib.Path('buddies.html')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 460, 'height': 340})
    pg.on('pageerror', lambda e: print('pageerror:', e))
    pg.goto(src.resolve().as_uri() + '?preview', timeout=900000)
    data = base64.b64decode(pg.evaluate("() => window.exportBaked()"))
    b.close()
gz = gzip.compress(data, 9)
print(f'raw {len(data)/1e6:.1f} MB -> gzipped {len(gz)/1e6:.1f} MB')
html = src.read_text()
html = html.replace('<script>', '<script>window.__BAKED_GZ="' + base64.b64encode(gz).decode() + '";</script><script>', 1)
pathlib.Path('buddies_baked.html').write_text(html)
print('buddies_baked.html', round(len(html) / 1e6, 1), 'MB')
