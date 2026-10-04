import base64, pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
base=pathlib.Path('buddies_baked.html').resolve().as_uri()
shots=[(q.split('|')[0], q.split('|')[1], float(q.split('|')[2])) for q in sys.argv[2:]]
ims=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    errs=[]
    for q,l,t in shots:
        pg=b.new_page(viewport={'width':460,'height':340},device_scale_factor=2); pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(base+q,timeout=600000)
        d=pg.evaluate(f"() => {{ renderAt({t}); return document.getElementById('c').toDataURL('image/png'); }}"); pg.close()
        open('d.png','wb').write(base64.b64decode(d.split(',')[1]))
        im=Image.open('d.png').convert('RGBA'); bg=Image.new('RGBA',im.size,(243,236,226,255)); bg.alpha_composite(im); bg=bg.convert('RGB').resize((460,340))
        ImageDraw.Draw(bg).text((8,6),l,fill=(60,50,40)); ims.append(bg)
    b.close(); print('errors',errs)
n=len(ims); cols=min(n,3); rows=(n+cols-1)//cols
o=Image.new('RGB',(470*cols,350*rows),(255,255,255)); [o.paste(im,((i%cols)*470,(i//cols)*350)) for i,im in enumerate(ims)]; o.save(sys.argv[1])
