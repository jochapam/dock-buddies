"""Stills from one page load: python3 multi.py out.png "?query" "jsSetup|Label|t" ...  (scene sculpts only once)"""
import base64, pathlib, sys, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
base = pathlib.Path('buddies_baked.html').resolve().as_uri() + sys.argv[2]
shots = [a.split('|') for a in sys.argv[3:]]
ims = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 460, 'height': 340}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base, timeout=900000)
    for js, label, t in shots:
        d = pg.evaluate(f"() => {{ {js}; renderAt({t}); return document.getElementById('c').toDataURL('image/png'); }}")
        im = Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')
        bg = Image.new('RGBA', im.size, (243, 236, 226, 255)); bg.alpha_composite(im)
        bg = bg.convert('RGB').resize((460, 340)); ImageDraw.Draw(bg).text((8, 6), label, fill=(60, 50, 40)); ims.append(bg)
    b.close(); print('errors', errs)
n = len(ims); cols = min(n, 3); rows = (n + cols - 1) // cols
o = Image.new('RGB', (470 * cols, 350 * rows), (255, 255, 255))
for i, im in enumerate(ims): o.paste(im, ((i % cols) * 470, (i // cols) * 350))
o.save(sys.argv[1])
