// Bundles three.js + the scene into one self-contained HTML file.
import { build } from 'esbuild';
import { writeFileSync } from 'fs';

const out = await build({ entryPoints: ['src/scene.js'], bundle: true, minify: true, format: 'iife', write: false });
const js = out.outputFiles[0].text;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
writeFileSync('buddies.html', html);
console.log('buddies.html', (html.length / 1024).toFixed(0), 'KB');
