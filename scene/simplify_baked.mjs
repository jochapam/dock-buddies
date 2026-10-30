// Thins out the baked meshes: the sculpts come out of surface nets far denser than a soft plush shape needs.
// Keeps the silhouette, normals, colour borders and crease shading, then orders the triangles for the GPU's
// vertex cache. Reads the uncompressed bake (sculpt.js exportBaked format) on stdin, writes the same format to stdout.
//   node simplify_baked.mjs [ratio=0.25] < raw.bin > thin.bin
// A quarter of the triangles looks identical to the full set in close-ups; a tenth starts to show on Greg's tail.
import { MeshoptSimplifier as S, MeshoptEncoder as E } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'fs';

await S.ready; await E.ready; S.useExperimentalFeatures = true;   // (simplifyWithAttributes)
const ratio = +(process.argv[2] || 0.25);
const raw = new Uint8Array(readFileSync(0)), dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
const count = dv.getUint32(0, true); let o = 4;
const parts = [new Uint8Array(new Uint32Array([count]).buffer)]; let before = 0, after = 0;
for (let m = 0; m < count; m++) {
  const nV = dv.getUint32(o, true), nI = dv.getUint32(o + 4, true), hasC = dv.getUint32(o + 8, true);
  const bounds = raw.slice(o + 12, o + 36), mn = [0, 1, 2].map(k => dv.getFloat32(o + 12 + 4 * k, true)), mx = [0, 1, 2].map(k => dv.getFloat32(o + 24 + 4 * k, true)); o += 36;
  const qp = new Uint16Array(nV * 3), qn = new Int16Array(nV * 3), ao = raw.slice(o + nV * 12, o + nV * 13), col = hasC ? raw.slice(o + nV * 13, o + nV * 16) : null;
  for (let i = 0; i < nV * 3; i++) { qp[i] = dv.getUint16(o + 2 * i, true); qn[i] = dv.getInt16(o + nV * 6 + 2 * i, true); }
  o += nV * (hasC ? 16 : 13);
  const idx = new Uint32Array(nI); let prev = 0;
  for (let i = 0; i < nI; i++) { prev += dv.getInt32(o, true); idx[i] = prev; o += 4; }
  // positions for measuring error; normals, colour and crease shading as attributes so their borders stay put
  const P = new Float32Array(nV * 3), A = new Float32Array(nV * 7);
  for (let i = 0; i < nV * 3; i++) P[i] = mn[i % 3] + (mx[i % 3] - mn[i % 3]) * qp[i] / 65535;
  for (let v = 0; v < nV; v++) {
    for (let k = 0; k < 3; k++) { A[v * 7 + k] = qn[v * 3 + k] / 32767; A[v * 7 + 3 + k] = col ? col[v * 3 + k] / 255 : 0; }
    A[v * 7 + 6] = ao[v] / 255;
  }
  const [thin] = S.simplifyWithAttributes(idx, P, 3, A, 7, [0.5, 0.5, 0.5, 1, 1, 1, 0.5], null, Math.floor(nI * ratio / 3) * 3, 0.02);
  const [remap, n] = E.reorderMesh(thin, true, false);   // rewrites thin in place; remap[old vertex] = new vertex
  const out = new DataView(new ArrayBuffer(36 + n * (hasC ? 16 : 13) + thin.length * 4)), u8 = new Uint8Array(out.buffer);
  out.setUint32(0, n, true); out.setUint32(4, thin.length, true); out.setUint32(8, hasC, true); u8.set(bounds, 12);
  for (let v = 0; v < nV; v++) {
    const w = remap[v]; if (!(w < n)) continue;   // dropped (unused, or past the end of remap)
    for (let k = 0; k < 3; k++) { out.setUint16(36 + (w * 3 + k) * 2, qp[v * 3 + k], true); out.setInt16(36 + n * 6 + (w * 3 + k) * 2, qn[v * 3 + k], true); }
    u8[36 + n * 12 + w] = ao[v];
    if (col) for (let k = 0; k < 3; k++) u8[36 + n * 13 + w * 3 + k] = col[v * 3 + k];
  }
  prev = 0; let p = 36 + n * (hasC ? 16 : 13);
  for (let i = 0; i < thin.length; i++) { out.setInt32(p, thin[i] - prev, true); prev = thin[i]; p += 4; }
  parts.push(u8); before += nI / 3; after += thin.length / 3;
}
writeFileSync(1, Buffer.concat(parts));
console.error(`simplified ${count} meshes: ${(before / 1e6).toFixed(2)}M -> ${(after / 1e6).toFixed(2)}M triangles`);
