// Sculpting helpers: describe a character as soft shapes (signed distance functions) that melt
// into each other, turn that into one smooth mesh, and give it a flexible "arms" bone.
import * as THREE from 'three';
import { surfaceNets } from 'isosurface';
import { gunzipSync } from 'fflate';

// ---- Baking: sculpt once, store the meshes, and load them instantly next time ----
const SCULPTED = [];            // every mesh sculpted this run, in order (for exporting)
let BAKED = null, bakeIndex = 0;
if (typeof window !== 'undefined' && window.__BAKED_GZ) {
  const bin = atob(window.__BAKED_GZ), raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  BAKED = parseBaked(gunzipSync(raw));
}
function parseBaked(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let o = 0;
  const count = dv.getUint32(o, true); o += 4; const out = [];
  for (let m = 0; m < count; m++) {
    const nV = dv.getUint32(o, true), nI = dv.getUint32(o + 4, true), hasC = dv.getUint32(o + 8, true); o += 12;
    const mn = [0, 1, 2].map(k => dv.getFloat32(o + 4 * k, true)), mx = [0, 1, 2].map(k => dv.getFloat32(o + 12 + 4 * k, true)); o += 24;
    const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), ao = new Float32Array(nV), col = hasC ? new Float32Array(nV * 3) : null;
    for (let i = 0; i < nV * 3; i++) { const k = i % 3; pos[i] = mn[k] + (mx[k] - mn[k]) * dv.getUint16(o, true) / 65535; o += 2; }
    for (let i = 0; i < nV * 3; i++) { nrm[i] = dv.getInt16(o, true) / 32767; o += 2; }
    for (let i = 0; i < nV; i++) ao[i] = dv.getUint8(o++) / 255;
    if (col) for (let i = 0; i < nV * 3; i++) col[i] = dv.getUint8(o++) / 255;
    const idx = new Uint32Array(nI); let prev = 0;
    for (let i = 0; i < nI; i++) { prev += dv.getInt32(o, true); idx[i] = prev; o += 4; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    out.push(g);
  }
  return out;
}
/** Serialise every sculpted mesh (compact: quantised positions/normals, byte colours, delta indices). */
export function exportBaked() {
  let size = 4;
  for (const g of SCULPTED) { const n = g.attributes.position.count; size += 36 + n * 13 + (g.attributes.color ? n * 3 : 0) + g.index.count * 4; }
  const buf = new ArrayBuffer(size), dv = new DataView(buf); let o = 0;
  dv.setUint32(o, SCULPTED.length, true); o += 4;
  for (const g of SCULPTED) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, A = g.attributes.ao.array, C = g.attributes.color ? g.attributes.color.array : null, I = g.index.array, n = P.length / 3;
    dv.setUint32(o, n, true); dv.setUint32(o + 4, I.length, true); dv.setUint32(o + 8, C ? 1 : 0, true); o += 12;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) { const k = i % 3; mn[k] = Math.min(mn[k], P[i]); mx[k] = Math.max(mx[k], P[i]); }
    for (let k = 0; k < 3; k++) { dv.setFloat32(o + 4 * k, mn[k], true); dv.setFloat32(o + 12 + 4 * k, mx[k], true); } o += 24;
    for (let i = 0; i < P.length; i++) { const k = i % 3; dv.setUint16(o, Math.round((P[i] - mn[k]) / ((mx[k] - mn[k]) || 1) * 65535), true); o += 2; }
    for (let i = 0; i < N.length; i++) { dv.setInt16(o, Math.round(Math.max(-1, Math.min(1, N[i])) * 32767), true); o += 2; }
    for (let i = 0; i < n; i++) dv.setUint8(o++, Math.round(A[i] * 255));
    if (C) for (let i = 0; i < C.length; i++) dv.setUint8(o++, Math.round(Math.max(0, Math.min(1, C[i])) * 255));
    let prev = 0; for (let i = 0; i < I.length; i++) { dv.setInt32(o, I[i] - prev, true); prev = I[i]; o += 4; }
  }
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
if (typeof window !== 'undefined') window.exportBaked = exportBaked;

const V = THREE.Vector3;

/** Smooth union: blends two shapes together with a soft fillet of size k. */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Ellipsoid centred at c with radii r, optionally rotated by quaternion q (approximate distance). */
export function ellipsoid(c, r, q = null) {
  const inv = q ? q.clone().invert() : null;
  const p = new V();
  return (x, y, z) => {
    p.set(x - c[0], y - c[1], z - c[2]);
    if (inv) p.applyQuaternion(inv);
    const k0 = Math.hypot(p.x / r[0], p.y / r[1], p.z / r[2]);
    const k1 = Math.hypot(p.x / (r[0] * r[0]), p.y / (r[1] * r[1]), p.z / (r[2] * r[2]));
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  };
}

/** An ellipsoid stretched between two points: thickness rx/rz, extending `extra` past each end. */
export function limb(a, b, rx, rz, extra) {
  const A = new V(...a), B = new V(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), B.clone().sub(A).normalize());
  const mid = A.clone().add(B).multiplyScalar(0.5);
  return ellipsoid([mid.x, mid.y, mid.z], [rx, A.distanceTo(B) / 2 + extra, rz], q);
}

/** A rounded tube (capsule) of radius r and straight length len, standing on `base`, tilted by rotZ, flattened in z. */
export function tube(base, r, len, rotZ, flatZ) {
  const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ)).invert();
  const p = new V();
  return (x, y, z) => {
    p.set(x - base[0], y - base[1], z - base[2]).applyQuaternion(inv);
    p.z /= flatZ;
    const t = Math.min(Math.max(p.y, 0), len);
    return (Math.hypot(p.x, p.y - t, p.z) - r) * flatZ;
  };
}

/** A body of revolution from a side profile [[radius, height], ...], scaled wider (sx) and squashed front-to-back (sz). */
export function lathe(profile, sx, sz) {
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(96);
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  // pre-compute a 2D distance table in (radius, height) so lookups are fast
  const R = 2.2, Y0 = -0.4, Y1 = pts[pts.length - 1].y + 0.6, h = 0.01;
  const nr = Math.ceil(R / h) + 1, ny = Math.ceil((Y1 - Y0) / h) + 1;
  const table = new Float32Array(nr * ny);
  const poly = pts.concat([new THREE.Vector2(0, pts[pts.length - 1].y)]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nr; i++) {
      const px = i * h, py = Y0 + j * h;
      let d = Infinity, s = 1;
      for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
        const a = poly[k], b = poly[m];
        const ex = b.x - a.x, ey = b.y - a.y, wx = px - a.x, wy = py - a.y;
        const t = Math.min(Math.max((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0), 1);
        d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
        const c1 = py >= a.y, c2 = py < b.y, c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      table[j * nr + i] = s * d;
    }
  }
  const scale = Math.min(sx, sz);
  return (x, y, z) => {
    const r = Math.hypot(x / sx, z / sz);
    const fi = r / h, fj = (y - Y0) / h;
    if (fi >= nr - 1 || fj < 0 || fj >= ny - 1) return 1;
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const t00 = table[j * nr + i], t10 = table[j * nr + i + 1], t01 = table[(j + 1) * nr + i], t11 = table[(j + 1) * nr + i + 1];
    return ((t00 * (1 - u) + t10 * u) * (1 - v) + (t01 * (1 - u) + t11 * u) * v) * scale;
  };
}

/**
 * Turn a distance function into one smooth mesh.
 * armWeight(x,y,z) says how much each point follows the arms bone (0 = body, 1 = arm).
 * Adds per-vertex soft shading ("ao") that darkens creases where parts meet.
 */
export function sculpt(sdf, bounds, step, armWeight, colorFn = null) {
  if (BAKED) return BAKED[bakeIndex++];   // already sculpted and stored inside the app
  const [[x0, y0, z0], [x1, y1, z1]] = bounds;
  const dims = [Math.ceil((x1 - x0) / step) + 1, Math.ceil((y1 - y0) / step) + 1, Math.ceil((z1 - z0) / step) + 1];
  const { positions, cells } = surfaceNets(dims, sdf, bounds);

  const n = positions.length;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), ao = new Float32Array(n);
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const col = colorFn ? new Float32Array(n * 3) : null;
  const e = step * 0.5;
  for (let i = 0; i < n; i++) {
    let [x, y, z] = positions[i];
    // normal from the distance field's gradient (smoother than face normals)
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    // nudge the vertex exactly onto the surface
    const d = sdf(x, y, z); x -= gx * d; y -= gy * d; z -= gz * d;
    pos.set([x, y, z], i * 3); nrm.set([gx, gy, gz], i * 3);
    // crease shading: how much nearby surface crowds in along the normal
    let occ = 0, w = 1;
    for (let k = 1; k <= 5; k++) {
      const hgt = 0.045 * k;
      occ += w * Math.max(0, hgt - sdf(x + gx * hgt, y + gy * hgt, z + gz * hgt));
      w *= 0.6;
    }
    ao[i] = Math.min(1, Math.max(0.4, 1 - occ * 5.0));
    if (col) col.set(colorFn(x, y, z), i * 3);
    const aw = armWeight(x, y, z);
    skinIndex.set([0, 1, 0, 0], i * 4); skinWeight.set([1 - aw, aw, 0, 0], i * 4);
  }
  // make triangles face outwards
  const idx = new Uint32Array(cells.length * 3);
  const a = new V(), b = new V(), c = new V(), cr = new V();
  let agree = 0;
  for (let t = 0; t < cells.length; t++) {
    const [i0, i1, i2] = cells[t];
    idx.set([i0, i1, i2], t * 3);
    if (t % 50 === 0) {
      a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
      cr.subVectors(b, a).cross(c.sub(a));
      agree += Math.sign(cr.dot(new V().fromArray(nrm, i0 * 3)));
    }
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  SCULPTED.push(g);
  return g;
}

/** A skinned mesh with a root bone and an "arms" bone at `pivot`; rotate the returned bone to move the arms. */
export function skinnedBody(geometry, material, pivot, parent) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const root = new THREE.Bone();
  const arms = new THREE.Bone();
  arms.position.set(...pivot);
  root.add(arms);
  mesh.add(root);
  parent.add(mesh);
  mesh.updateWorldMatrix(true, true);
  mesh.bind(new THREE.Skeleton([root, arms]));
  return { mesh, armsBone: arms };
}

/**
 * Sculpt a character several times with its arms swung up by 0..maxAngle around `pivot` (about the x axis),
 * and show whichever pose is nearest. build(armsAt) gets a helper that evaluates the arm shapes in that pose.
 */
export function poses(maxAngle, pivot, build, material, parent, count = 9) {
  const meshes = [];
  const p = new V();
  for (let k = 0; k < count; k++) {
    const ang = -maxAngle * k / (count - 1);
    const c = Math.cos(-ang), sn = Math.sin(-ang);
    const armsAt = (arms, x, y, z) => {
      // undo the arm rotation, then measure against the resting arm shapes
      const yy = y - pivot[1], zz = z - pivot[2];
      p.set(x, pivot[1] + yy * c - zz * sn, pivot[2] + yy * sn + zz * c);
      let d = Infinity;
      for (const a of arms) d = Math.min(d, a(p.x, p.y, p.z));
      return d;
    };
    // where a point on the moved arm sat in the resting pose (so painted details travel with the arm)
    const toRest = (x, y, z) => { const yy = y - pivot[1], zz = z - pivot[2]; return [x, pivot[1] + yy * c - zz * sn, pivot[2] + yy * sn + zz * c]; };
    const mesh = new THREE.Mesh(build(armsAt, toRest), material);
    mesh.visible = k === 0;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return {
    meshes,
    show(amount) {
      const k = Math.round(Math.min(Math.max(amount, 0), 1) * (count - 1));
      meshes.forEach((m, i) => (m.visible = i === k));
    },
  };
}

/** A rounded, tapering tube from point a (radius r1) to point b (radius r2) — good for soft limbs. */
export function roundCone(a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** Join a limb to the body: a soft blend only near the joint (anchor), a natural crease everywhere else. */
export function joinAt(bodyD, limbD, x, y, z, anchor, reach, k) {
  const d = Math.hypot(Math.abs(x) - anchor[0], y - anchor[1], z - anchor[2]);
  const kk = k * Math.max(0, 1 - d / reach);
  return kk > 1e-4 ? smin(bodyD, limbD, kk) : Math.min(bodyD, limbD);
}

/**
 * A soft, continuously curving tube through control points (no single elbow): the curve is
 * smoothed and split into many short segments, each a rounded cone, melted together.
 * radii: one radius per control point (interpolated along the curve).
 */
export function softTube(points, radii, segments = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new V(...p)), false, 'centripetal');
  const n = points.length - 1;
  const rAt = (t) => { const f = t * n, i = Math.min(Math.floor(f), n - 1), u = f - i; const s = u * u * (3 - 2 * u); return radii[i] + (radii[i + 1] - radii[i]) * s; };
  const pieces = [];
  for (let k = 0; k < segments; k++) {
    const t0 = k / segments, t1 = (k + 1) / segments;
    const a = curve.getPoint(t0), b = curve.getPoint(t1);
    pieces.push(roundCone([a.x, a.y, a.z], [b.x, b.y, b.z], rAt(t0), rAt(t1)));
  }
  return (x, y, z) => { let d = pieces[0](x, y, z); for (let i = 1; i < pieces.length; i++) d = smin(d, pieces[i](x, y, z), 0.04); return d; };
}
