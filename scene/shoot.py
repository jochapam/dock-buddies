"""Render frames of buddies.html with headless Chromium. usage: shoot.py t1 t2 ... | --video seconds fps"""
import sys, os, base64, pathlib
from playwright.sync_api import sync_playwright

W, H = 460, 340
url = pathlib.Path('buddies.html').resolve().as_uri() + '?preview' + os.environ.get('Q', '')
args = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=float(os.environ.get('SCALE', '2')))
    pg.on('console', lambda m: print('console:', m.text))
    pg.on('pageerror', lambda e: print('pageerror:', e))
    pg.goto(url, timeout=600000); pg.wait_for_timeout(500)
    def grab(t, path):
        data = pg.evaluate(f"() => {{ renderAt({t}); return document.getElementById('c').toDataURL('image/png'); }}")
        open(path, 'wb').write(base64.b64decode(data.split(',')[1]))
    if args and args[0] == '--video':
        secs, fps = float(args[1]), int(args[2]); os.makedirs('frames', exist_ok=True)
        a = int(args[3]) if len(args) > 3 else 0; z = int(args[4]) if len(args) > 4 else int(secs * fps)
        for i in range(a, min(z, int(secs * fps))):
            if os.path.exists(f'frames/{i:04d}.png'): continue
            grab(i / fps, f'frames/{i:04d}.png')
    else:
        for t in args:
            grab(float(t), f'shot_{t}.png')
    b.close()
