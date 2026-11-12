// Plays the scene the way the app does (every frame drawn in order, 30 fps from start-up), runs events and saves stills:
//   node play.cjs out.png "?query" spec.json
// spec.json: { "events": [{ "at": 12, "js": "doActivity('croc')" }], "captures": [{ "at": 13.5, "label": "Up for Greg" }] }
// Use this for anything where Nom stands up: jumping the clock in stills.cjs leaves him half-risen with ragged feet.
// The pair are nudged awake every second: they doze after 10 real minutes without input, and SwiftShader draws far
// slower than real time. Saves out.png.N.png per capture and a contact sheet at out.png.
// Needs Playwright: from scene/, NODE_PATH=$(npm root -g) node play.cjs ...
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { contactSheet } = require('./sheet.cjs');
const [out, q = '', specFile] = process.argv.slice(2); const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 460, height: 340 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file://' + path.resolve(__dirname, '../buddies.html') + q, { timeout: 600000 });
  const shots = await pg.evaluate((spec) => {
    const ev = (spec.events || []).slice().sort((a, b) => a.at - b.at), caps = spec.captures.slice().sort((a, b) => a.at - b.at), shots = [];
    const end = Math.max(...caps.map(c => c.at)) + 0.05;
    for (let f = 0; f / 30 < end; f++) {
      const t = f / 30;
      if (f % 30 === 0) window.nudge();
      while (ev.length && ev[0].at <= t) eval(ev.shift().js);
      renderAt(t);
      while (caps.length && caps[0].at <= t) shots.push([caps.shift().label, document.getElementById('c').toDataURL('image/png')]);
    }
    return shots;
  }, spec);
  await b.close();
  const saved = shots.map(([label, d], i) => { const f = `${out}.${i}.png`; fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); return [f, label]; });
  await contactSheet(out, saved);
  console.log('errors', errs);
})();
