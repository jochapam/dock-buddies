// Stills from one page load (Node twin of multi.py, for machines without Python's Playwright):
//   node stills.cjs out.png "?query" "jsSetup|Label|t" ...
// Each shot runs jsSetup in the page, then renderAt(t); the shots are laid out on one contact sheet (out.png),
// and each is also saved full size as out.png.N.png. Renders ../buddies.html (run build-scene.sh first).
// Good for poses where Nom sits; for anything where he stands, use play.cjs (see CLAUDE.md).
// Needs Playwright: from scene/, NODE_PATH=$(npm root -g) node stills.cjs ...
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { contactSheet } = require('./sheet.cjs');
const [out, q = '', ...shots] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 460, height: 340 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('file://' + path.resolve(__dirname, '../buddies.html') + q, { timeout: 600000 });
  const saved = [];
  for (const [i, s] of shots.entries()) {
    const [js, label = '', t = '0'] = s.split('|');
    const d = await pg.evaluate(([js, t]) => { eval(js); renderAt(+t); return document.getElementById('c').toDataURL('image/png'); }, [js, t]);
    const f = `${out}.${i}.png`; fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); saved.push([f, label]);
  }
  await b.close();
  await contactSheet(out, saved);
  console.log('errors', errs);
})();
