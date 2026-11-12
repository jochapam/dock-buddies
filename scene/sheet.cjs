// Lays labelled stills out on one contact sheet (3 across, on the scene's cream), drawn in a headless page so it needs
// nothing beyond Playwright. Used by stills.cjs and play.cjs.
const { chromium } = require('playwright'); const fs = require('fs');
async function contactSheet(out, files) {
  if (!files.length) return;
  const cols = Math.min(files.length, 3), rows = Math.ceil(files.length / cols);
  const imgs = files.map(([f, label]) => ({ src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), label }));
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 470 * cols, height: 350 * rows } });
  const d = await pg.evaluate(async ({ imgs, cols, rows }) => {
    const c = document.createElement('canvas'); c.width = 470 * cols; c.height = 350 * rows; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    for (const [i, { src, label }] of imgs.entries()) {
      const im = new Image(); im.src = src; await im.decode();
      const x = (i % cols) * 470, y = Math.floor(i / cols) * 350;
      g.fillStyle = '#f3ece2'; g.fillRect(x, y, 460, 340); g.drawImage(im, x, y, 460, 340);
      g.fillStyle = '#3c3228'; g.font = '12px sans-serif'; g.fillText(label, x + 8, y + 16);
    }
    return c.toDataURL('image/png');
  }, { imgs, cols, rows });
  await b.close();
  fs.writeFileSync(out, Buffer.from(d.split(',')[1], 'base64'));
}
module.exports = { contactSheet };
