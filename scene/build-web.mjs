// Builds the web app (for phones and tablets: open it in Safari, then Share > Add to Home Screen) into ../site/.
// The scene is the same as the Mac app's; the meshes are a separate file so the page itself stays small,
// and ../web/ holds the page, the controls (shell.js), the offline cache (sw.js) and the icons.
//   node build-web.mjs            (GitHub Actions runs this and publishes ../site/ on GitHub Pages)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'fs';

const version = readFileSync('../VERSION', 'utf8').trim();
const out = '../site';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/icons', { recursive: true });

await build({ entryPoints: ['src/scene.js'], bundle: true, minify: true, format: 'iife', outfile: out + '/scene.js' });
writeFileSync(out + '/meshes.bin', Buffer.from(readFileSync('baked-meshes.b64', 'utf8').trim(), 'base64'));   // gzipped, decoded by sculpt.js
for (const f of ['index.html', 'sw.js', 'shell.js', 'manifest.webmanifest'])
  writeFileSync(`${out}/${f}`, readFileSync('../web/' + f, 'utf8').replaceAll('%VERSION%', version));
cpSync('../web/icons', out + '/icons', { recursive: true });
writeFileSync(out + '/.nojekyll', '');
console.log(`site/ for ${version}:`, ['scene.js', 'meshes.bin'].map(f => `${f} ${(readFileSync(`${out}/${f}`).length / 1e6).toFixed(1)} MB`).join(', '));
