// Dock Buddies 3D — plush bear and bunny, measured from the reference renders, with tufted shell fur.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as S from './sculpt.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

// ---------- palette (sampled from the references) ----------
const C = {
  bear: 0xa4805f, bearEar: 0xd08a3e, cream: 0xefd9bd, belly: 0xd9bd9d,   // lighter, greyer taupe from the turnaround
  alien: 0xee5c9f,
  black: 0x080706, white: 0xf8f6f1, mug: 0xefece6, coffee: 0x1a0f08, tooth: 0xf3c21a,
};

const params = new URLSearchParams(location.search);

// ---------- renderer / camera ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
if ((new URLSearchParams(location.search).get('style') || 'cel') !== 'plush') renderer.toneMappingExposure = 1.08;   // richer colours for the cartoon look

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(14, 1, 0.1, 100);
camera.position.set(-0.45, 3.1, 15.3);
camera.lookAt(-0.45, 1.33, 0);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Soft studio light: warm key from the upper left, gentle fill, warm glow from behind for the fuzzy edges.
// Cartoon-film lighting: warm golden key with soft shadows, cool sky fill, warm bounce from the floor, glowing rim.
const LOOK_SOFT = !params.has('flat');      // soft fuzzy texture + soft shadows (add ?flat for the plain look)
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a5a3c, 1.15));
const key = new THREE.DirectionalLight(0xffd9a6, 3.4);
key.position.set(-4.5, 7, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xb9d4ff, 0.75);
fill.position.set(6, 2, 4);
scene.add(fill);
const back = new THREE.DirectionalLight(0xff9f4a, 4.2);   // low sunset glow from behind
back.position.set(1.5, 2.5, -6);
scene.add(back);
if (LOOK_SOFT) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 14; key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.material.userData.outlineParameters = { visible: false };
  // fade the floor shadow out softly so it never ends in a hard edge at the window border
  floor.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position.xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vP;')
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
               'float fade = 1.0 - smoothstep(0.6, 2.2, length((vP - vec2(-0.3, 0.2)) * vec2(0.8, 1.6)));\n  gl_FragColor = vec4( color, fade * opacity * ( 1.0 - getShadowMask() ) );');
  };
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
}
const RIM = new THREE.Color(0xffb26a);

// ---------- fur ----------
const SHELLS = 24;
const furMaterials = new Map();
const NOISE = `
  float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`;
/** Standard material pushed out along the normal and cut into clumpy strands — one per shell layer. */
function furMaterial(color, shell, furLen, density, occ = 0, root = 0.32) {
  const id = `${color}|${shell}|${furLen}|${density}|${occ}|${root}`;
  if (furMaterials.has(id)) return furMaterials.get(id);
  const t = shell / SHELLS;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShell = { value: t };
    sh.uniforms.uLen = { value: furLen };
    sh.uniforms.uDensity = { value: density };
    sh.uniforms.uRim = { value: RIM };
    sh.uniforms.uOcc = { value: occ };
    sh.uniforms.uRoot = { value: root };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uLen; varying vec3 vFurPos; ${NOISE}`)
      .replace('#include <project_vertex>', `
        vFurPos = position;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec3 nV = normalize(normalMatrix * objectNormal);
        // tufts: neighbouring strands lean together in random directions
        vec3 lean = vec3(vnoise(position * 9.0), vnoise(position * 9.0 + 17.0), vnoise(position * 9.0 + 41.0)) - 0.5;
        vec3 leanV = normalize(normalMatrix * lean);
        mvPosition.xyz += (nV + leanV * 0.6) * uLen * uShell;
        mvPosition.y -= uLen * uShell * uShell * 0.35;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uDensity; uniform vec3 uRim; uniform float uOcc; uniform float uRoot; varying vec3 vFurPos; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = mat3(0.788, -0.270, 0.553, 0.470, 0.853, -0.226, -0.411, 0.447, 0.794) * vFurPos * uDensity;
          vec3 c = floor(q);
          vec3 j = vec3(h13(c + 1.3), h13(c + 2.7), h13(c + 5.1)) - 0.5;
          vec3 f = fract(q) - 0.5 - j * 0.55;
          float h = h13(c);
          float tuft = vnoise(vFurPos * 7.0);                 // patches of longer and shorter fur
          float len = (0.35 + 0.65 * h) * (0.7 + 0.45 * tuft);
          if (uShell > 0.0 && (uShell > len || length(f) > 0.7 * (1.0 - 0.85 * uShell / len))) discard;
          float patchy = vnoise(vFurPos * 3.0);
          diffuseColor.rgb *= (0.88 + 0.12 * h) * (0.9 + 0.2 * patchy) * mix(uRoot, 1.08, pow(uShell, 0.65));
          // soft contact shading on the undersides, so legs, arms and creases read clearly
          diffuseColor.rgb *= mix(1.0, 0.62 + 0.38 * smoothstep(-0.35, 0.45, vFurPos.y), uOcc);
        }`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += uRim * pow(1.0 - abs(normal.z), 2.5) * (0.08 + 0.7 * uShell) * diffuseColor.rgb;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'fur2';
  furMaterials.set(id, m);
  return m;
}
const BEARFUR = { len: 0.042, density: 230, occ: 1 };
const SHORTFUR = { len: 0.022, density: 300, root: 0.7 };
const ALIENFUR = { len: 0.036, density: 250, occ: 1 };
/** A furry piece: the same geometry drawn as a stack of shells. */
// Fur is switched off for now: each piece is one smooth mesh with a soft, velvety plush finish.
const USE_FUR = false;
const plushMaterials = new Map();
// Look: 'plush' (soft matte), 'toon' (flat light bands + ink outlines) or 'cel' (soft light bands, no outlines)
const STYLE = params.get('style') || 'cel';   // soft cel is the chosen look
function bands(values, smooth) {
  const t = new THREE.DataTexture(new Uint8Array(values), values.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter; t.needsUpdate = true; return t;
}
const TOON_BANDS = { toon: bands([95, 175, 255], false), cel: bands([92, 135, 185, 228, 250], true) };
function plushMaterial(color, occ, useAo = false, vertexColors = false, sheenBase = color) {
  if (STYLE !== 'plush') return new THREE.MeshToonMaterial({ color, vertexColors, gradientMap: TOON_BANDS[STYLE] });
  const id = `${color}|${occ}|${useAo}|${vertexColors}|${sheenBase}`;
  if (plushMaterials.has(id)) return plushMaterials.get(id);
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.92, metalness: 0, vertexColors,
    sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheenBase).lerp(new THREE.Color(0xffffff), 0.18),
  });
  if (useAo) m.defines = { USE_CREASE: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOcc = { value: occ };
    sh.uniforms.uRim = { value: RIM };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying float vAo;\n#ifdef USE_CREASE\nattribute float ao;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\n#ifdef USE_CREASE\nvAo = ao;\n#else\nvAo = 1.0;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uOcc; uniform vec3 uRim; varying vec3 vLocal; varying float vAo; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // soft contact shading on the undersides, so legs, arms and creases read clearly
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.38 * smoothstep(-0.35, 0.45, vLocal.y), uOcc);
        diffuseColor.rgb *= vAo;   // darker in the soft folds where arms and legs join the body
        // fine felt grain so it reads as soft fabric, not plastic
        diffuseColor.rgb *= 0.93 + 0.07 * vnoise(vLocal * 70.0) + 0.05 * (vnoise(vLocal * 9.0) - 0.5);`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += uRim * pow(1.0 - abs(normal.z), 2.5) * 0.35 * diffuseColor.rgb;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'plush' + (useAo ? '-crease' : '') + (vertexColors ? '-vc' : '');
  plushMaterials.set(id, m);
  return m;
}
function furry(geom, color, parent, { len, density, occ = 0, root = 0.32 } = BEARFUR) {
  const g = new THREE.Group();
  if (USE_FUR) {
    for (let i = 0; i <= SHELLS; i++) g.add(new THREE.Mesh(geom, furMaterial(color, i, len, density, occ, root)));
  } else {
    g.add(new THREE.Mesh(geom, plushMaterial(color, occ)));
  }
  parent.add(g);
  return g;
}
const SPH = new THREE.SphereGeometry(1, 56, 40);
const ellipsoid = (sx, sy, sz) => SPH.clone().scale(sx, sy, sz);   // scale baked in so fur stays even
function furBlob(color, [x, y, z], [sx, sy, sz], parent, opts, rotZ = 0) {
  const g = furry(ellipsoid(sx, sy, sz), color, parent, opts);
  g.position.set(x, y, z); g.rotation.z = rotZ;
  return g;
}
function furLimb(color, a, b, r, parent, opts) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = furry(new THREE.CapsuleGeometry(r, A.distanceTo(B), 12, 32), color, parent, opts);
  g.position.copy(A).add(B).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return g;
}
/** A smooth body of revolution from a side profile [[radius, height], ...], squashed front-to-back. */
function bodyShape(profile, depth) {
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(72);
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, 80).scale(1, 1, depth);
}


// Soft velvet fuzz for the sculpted bodies: short, dense shells that follow vertex colours and fold shading.
const FUZZ_SHELLS = 22;
const fuzzMaterials = new Map();
function fuzzMaterial(color, shell, len, density, vertexColors) {
  const id = `${color}|${shell}|${len}|${density}|${vertexColors}`;
  if (fuzzMaterials.has(id)) return fuzzMaterials.get(id);
  const t = shell / FUZZ_SHELLS;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, vertexColors });
  m.defines = { USE_CREASE: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uShell: { value: t }, uLen: { value: len }, uDensity: { value: density }, uRim: { value: RIM } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uLen; varying vec3 vFurPos; varying float vAo; attribute float ao; ${NOISE}`)
      .replace('#include <project_vertex>', `
        vFurPos = position; vAo = ao;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec3 nV = normalize(normalMatrix * objectNormal);
        // locks: neighbouring strands lean the same way, and each lock curls gently as it grows
        vec3 lean = vec3(vnoise(position * 5.0), vnoise(position * 5.0 + 17.0), vnoise(position * 5.0 + 41.0)) - 0.5;
        vec3 curl = vec3(vnoise(position * 9.0 + 3.0), vnoise(position * 9.0 + 29.0), vnoise(position * 9.0 + 57.0)) - 0.5;
        vec3 leanV = normalize(normalMatrix * lean), curlV = normalize(normalMatrix * curl);
        mvPosition.xyz += nV * uLen * uShell
                        + leanV * uLen * 0.55 * uShell * uShell
                        + curlV * uLen * 0.25 * sin(uShell * 3.2);
        mvPosition.y -= uLen * uShell * uShell * 0.3;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uDensity; uniform vec3 uRim; varying vec3 vFurPos; varying float vAo; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = mat3(0.788, -0.270, 0.553, 0.470, 0.853, -0.226, -0.411, 0.447, 0.794) * vFurPos * uDensity;
          vec3 c = floor(q);
          vec3 j = vec3(h13(c + 1.3), h13(c + 2.7), h13(c + 5.1)) - 0.5;
          vec3 f = fract(q) - 0.5 - j * 0.5;
          float h = h13(c);
          float len = 0.8 + 0.2 * h;   // even length, so it reads as a tidy shag rather than patchy
          if (uShell > 0.0 && (uShell > len || length(f) > 0.74 * (1.0 - 0.8 * uShell / len))) discard;
          float lock = vnoise(vFurPos * 14.0);      // lighter and darker locks, like the swatches
          diffuseColor.rgb *= vAo * (0.88 + 0.2 * lock) * (0.95 + 0.08 * h) * mix(0.5, 1.12, pow(uShell, 0.7));
        }`)
      .replace('#include <opaque_fragment>', `
        // soft glowing edge, like light caught in the fuzz
        outgoingLight += uRim * pow(1.0 - abs(normal.z), 2.2) * (0.12 + 0.55 * uShell) * diffuseColor.rgb;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'fuzz';
  fuzzMaterials.set(id, m);
  return m;
}
function addFuzz(posesObj, color, len, density, vertexColors) {
  for (const mesh of posesObj.meshes) {
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (!params.has('fur')) continue;   // fur is off unless asked for
    for (let i = 1; i <= FUZZ_SHELLS; i++) mesh.add(new THREE.Mesh(mesh.geometry, fuzzMaterial(color, i, len, density, vertexColors)));
  }
}

// ---------- shiny bits ----------
const gloss = (color, rough = 0.2) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.06 });
const M = { black: gloss(C.black, 0.22), white: gloss(C.white, 0.15), ceramic: gloss(C.mug, 0.3),
            coffee: gloss(C.coffee, 0.04), tooth: gloss(C.tooth, 0.3),
            mouth: new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.85 }) };
function solid(mat, [x, y, z], [sx, sy, sz], parent) {
  const m = new THREE.Mesh(SPH, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
/** A glossy mug with a thick rim, coffee inside and a round loop handle. */
function mug(r, h, parent) {
  const g = new THREE.Group();
  const prof = [[0, -h / 2], [r * 0.88, -h / 2], [r * 0.97, -h / 2 + 0.025], [r, -h / 2 + 0.07], [r, h / 2 - 0.02],
                [r * 0.985, h / 2], [r * 0.9, h / 2], [r * 0.875, h / 2 - 0.05]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M.ceramic));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 48), M.coffee);
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = h / 2 - 0.055;
  g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.27, r * 0.115, 16, 48, Math.PI * 1.3), M.ceramic);
  handle.rotation.z = -Math.PI * 0.65; handle.position.set(r * 0.95, 0.01, 0);
  g.add(handle);
  g.userData.top = new THREE.Object3D(); g.userData.top.position.y = h / 2; g.add(g.userData.top);
  parent.add(g);
  return g;
}
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
function groundShadow(w, d, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.material.userData.outlineParameters = { visible: false };
  m.rotation.x = -Math.PI / 2; m.position.y = 0.005; parent.add(m); return m;
}

// =====================================================================
// Bear (measured from the reference: ~2.9 tall, turned a little towards the bunny)
// =====================================================================
const bear = new THREE.Group();
bear.position.set(0.15, 0, 0);
bear.rotation.y = -0.2;
scene.add(bear);
groundShadow(3.2, 2.6, bear).position.z = 0.35;
const bearBody = new THREE.Group();
bear.add(bearBody);
// One soft body: ears, legs and arms all melt smoothly into it (sculpted as a single surface).
// Proportions measured from the turnaround sheet: a tall soft egg (about 3/4 as wide as tall),
// widest low down, small ears on top, slim arms lying along his sides, small round feet.
const BEAR_PIVOT = [0, 1.46, 0.12];   // the arms swing from the shoulders when he drinks
const BEAR_ARM_LIFT = 0.75;          // how far (radians) the arms swing up to drink
const FUR_LIFT = params.has('fur') ? 0.045 : 0;   // keeps face details sitting on top of the fur
{
  const body = S.lathe([[0, 0], [0.84, 0.0], [1.03, 0.08], [1.13, 0.3], [1.16, 0.6], [1.14, 0.95], [1.09, 1.35],
                        [1.0, 1.75], [0.92, 2.08], [0.79, 2.38], [0.6, 2.6], [0.34, 2.73], [0, 2.77]], 1.08, 0.85);   // the rounder shape you preferred
  // where his front surface is, so the face and belly sit exactly on it
  var bearFrontZ = (x, y) => { for (let z = 1.4; z > 0; z -= 0.004) if (body(x, y, z) < 0) return z; return 0; };
  const ears = [-1, 1].map(s => S.ellipsoid([s * 0.66, 2.55, -0.05], [0.3, 0.3, 0.2]));   // small, sitting on top of the head
  const tail = S.ellipsoid([0, 0.45, -0.96], [0.19, 0.19, 0.16]);                           // little round tail
  // thick, stubby legs ending in round paws that point forward, soles towards us
  const feet = [-1, 1].map(s => {
    const leg = S.roundCone([s * 0.52, 0.42, 0.3], [s * 0.57, 0.33, 0.86], 0.4, 0.36);
    const paw = S.ellipsoid([s * 0.58, 0.32, 0.98], [0.38, 0.33, 0.26]);
    // raised pads on the sole: one big bean and three little toe beans, softly rounded
    const pads = [
      S.ellipsoid([s * 0.58, 0.26, 1.205], [0.165, 0.115, 0.06]),
      S.ellipsoid([s * 0.58 - 0.14, 0.43, 1.18], [0.066, 0.062, 0.045]),
      S.ellipsoid([s * 0.58, 0.47, 1.187], [0.066, 0.062, 0.045]),
      S.ellipsoid([s * 0.58 + 0.14, 0.43, 1.18], [0.066, 0.062, 0.045]),
    ];
    return (x, y, z) => {
      let d = S.smin(leg(x, y, z), paw(x, y, z), 0.1);
      for (const p of pads) d = S.smin(d, p(x, y, z), 0.015);
      return d;
    };
  });      // small round feet
  // slim arms: from the shoulder down along his side, curving forward so the round paw rests on his lower tummy
  // soft arms that curl gradually along their whole length (no single elbow): from the shoulder,
  // down his side, round to the front, ending in a slightly plumper paw beside the mug
  const arms = [-1, 1].map(s => S.softTube(
    [[s * 0.96, 1.46, 0.11], [s * 1.02, 1.28, 0.38], [s * 0.95, 1.1, 0.66], [s * 0.79, 1.0, 0.92], [s * 0.56, 0.99, 1.08]],   // sunk about half-way into his side
    [0.2, 0.22, 0.23, 0.24, 0.25], 14));
  const min2 = (f, x, y, z) => Math.min(f[0](x, y, z), f[1](x, y, z));
  // fur colour, with the round lighter belly patch on his lower tummy (soft edge)
  const fur = new THREE.Color(C.bear), belly = new THREE.Color(C.belly), earC = new THREE.Color(C.bearEar);
  const paint = (x, y, z) => {
    const e = (x / 0.52) ** 2 + ((y - 1.0) / 0.45) ** 2;   // smaller patch, so it reads well when his arms lift
    let t = z > 0.3 ? 1 - Math.min(Math.max((e - 0.9) / 0.1, 0), 1) : 0;
    t *= Math.min(Math.max(1 - body(x, y, z) / 0.03, 0), 1);   // only on the tummy itself, not the arms or feet
    t = t * t * (3 - 2 * t);
    let c = [fur.r + (belly.r - fur.r) * t, fur.g + (belly.g - fur.g) * t, fur.b + (belly.b - fur.b) * t];
    // paw pads on his soles, in the same orange as his inner ears: one big pad and three little toe beans
    if (z > 1.02) {
      const px = Math.abs(x) - 0.58;
      const blob = (cx, cy, rx, ry) => { const e = ((px - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; const v = 1 - Math.min(Math.max((e - 0.8) / 0.2, 0), 1); return v * v * (3 - 2 * v); };
      const p = Math.max(blob(0, 0.26, 0.17, 0.12), blob(-0.14, 0.43, 0.065, 0.06), blob(0, 0.47, 0.065, 0.06), blob(0.14, 0.43, 0.065, 0.06));
      const e3 = [earC.r, earC.g, earC.b];
      c = c.map((v, i) => v + (e3[i] - v) * p);
    }
    return c;
  };
  // Sculpt him with his arms at several heights, so every pose is a clean, properly blended surface.
  var bearPoses = S.poses(BEAR_ARM_LIFT, BEAR_PIVOT, (armsAt, toRest) => {
    const sdf = (x, y, z) => {
      const b = body(x, y, z);
      const rest = S.smin(S.smin(S.smin(b, min2(ears, x, y, z), 0.07), tail(x, y, z), 0.06), min2(feet, x, y, z), 0.14);
      // the arm melts into his body along its whole length (no seam), easing off near the paw so it stays round
      const toPaw = Math.hypot(Math.abs(x) - 0.56, y - 0.99, z - 1.08);
      const k = 0.16 * Math.min(Math.max((toPaw - 0.18) / 0.3, 0), 1);
      const a = armsAt(arms, x, y, z);
      const withArms = k > 1e-4 ? S.smin(b, a, k) : Math.min(b, a);   // melts in at the shoulder only
      return Math.min(rest, withArms);
    };
    return S.sculpt(sdf, [[-1.6, -0.15, -1.15], [1.6, 2.95, 1.65]], 0.028, () => 0, paint);
  }, plushMaterial(0xffffff, 0, true, true, C.bear), bearBody);
  addFuzz(bearPoses, 0xffffff, 0.055, 210, true);
}
// Face, placed on the surface: eyes fairly high and wide, a round cream snout just below.
const fz = (x, y) => bearFrontZ(x, y) + FUR_LIFT;
for (const s of [-1, 1]) furBlob(C.bearEar, [s * 0.64, 2.53, 0.13 + FUR_LIFT], [0.16, 0.16, 0.04], bearBody, SHORTFUR);   // inner ear
furBlob(C.cream, [0, 1.98, fz(0, 1.98) - 0.05], [0.28, 0.26, 0.17], bearBody, SHORTFUR);   // snout
solid(M.black, [0, 2.09, fz(0, 1.98) + 0.1], [0.09, 0.065, 0.05], bearBody);                // nose
{ const m = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8), M.mouth);
  m.position.set(0, 1.97, fz(0, 1.98) + 0.115); m.rotation.x = 0.25; bearBody.add(m); }      // mouth line
const EYE = { x: 0.37, y: 2.15 };
const bearEyes = [-1, 1].map(s => solid(M.black, [s * EYE.x, EYE.y, fz(EYE.x, EYE.y)], [0.065, 0.065, 0.045], bearBody));
// closed eyes are little arcs, as on the expression sheet: ∩ = happy (sipping), ∪ = sleepy (blinking)
function eyeArc(s, happy) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 10, 28, Math.PI), M.black);
  m.position.set(s * EYE.x, EYE.y + (happy ? -0.03 : 0.03), fz(EYE.x, EYE.y) + 0.01);
  m.rotation.set(0, s * 0.42, happy ? 0 : Math.PI);
  m.visible = false; bearBody.add(m); return m;
}
const bearHappy = [-1, 1].map(s => eyeArc(s, true)), bearSleepy = [-1, 1].map(s => eyeArc(s, false));

// The mug rides along with the arms, held between his paws.
const bearArms = new THREE.Group();
bearArms.position.set(...BEAR_PIVOT);
bearBody.add(bearArms);
const BA = (p) => [p[0] - BEAR_PIVOT[0], p[1] - BEAR_PIVOT[1], p[2] - BEAR_PIVOT[2]];
const bearMug = mug(0.25, 0.46, bearArms);
const MUG_TILT = 0.22;   // tipped a little towards us so you can see the coffee
bearMug.position.set(...BA([0, 1.04, 1.24]));

// =====================================================================
// Alien (pink, about half the bear's size: round bean body, paddle ears,
// big flat eyes looking inward, a downward-pointing mouth with two yellow teeth)
// =====================================================================
const alien = new THREE.Group();
alien.position.set(-1.64, 0, 0.75);   // a little gap so it doesn't press into the bear's arm
alien.scale.setScalar(0.85);   // about half his height, ears reaching his eyes
scene.add(alien);
groundShadow(1.8, 1.3, alien).position.z = 0.15;
const alienBody = new THREE.Group();
alien.add(alienBody);
// One soft body: tube ears, feet and arms all melt smoothly into it.
const ALI_PIVOT = [0, 0.84, 0.05];   // the arms swing from here when it drinks
const ALIEN_ARM_LIFT = 0.8;   // enough to bring the mug up to its mouth
{
  const body = S.lathe([[0, 0], [0.52, 0.0], [0.64, 0.08], [0.69, 0.3], [0.7, 0.58], [0.69, 0.8], [0.647, 1.106], [0.55, 1.292], [0.4, 1.439], [0.233, 1.526], [0.071, 1.563], [0, 1.566]], 1, 0.5);   // soft round dome; slim front-to-back, like a cushion
  var alienFrontZ = (x, y) => { for (let z = 1.2; z > 0; z -= 0.003) if (body(x, y, z) < 0) return z; return 0; };
  const ears = [-1, 1].map(s => {
    const th = -s * 0.12;                      // leaning a little outwards
    return S.tube([s * 0.27 - Math.sin(th) * 0.22, 1.32 + Math.cos(th) * 0.22, -0.04], 0.22, 0.74, th, 0.7);
  });
  // Thick stubby legs ending in round paws that point forward (same build as the bear's).
  const feet = [-1, 1].map(s => {
    const leg = S.roundCone([s * 0.31, 0.32, 0.08], [s * 0.35, 0.23, 0.36], 0.26, 0.24);
    const paw = S.ellipsoid([s * 0.35, 0.21, 0.46], [0.27, 0.22, 0.17]);
    return (x, y, z) => S.smin(leg(x, y, z), paw(x, y, z), 0.07);
  });
  // Soft arms that curl gradually round its sides (no elbow), sunk about half-way into the body,
  // ending in round paws that hold the mug.
  const ARM_END = [0.33, 0.46, 0.43];
  const arms = [-1, 1].map(s => S.softTube(
    [[s * 0.5, 0.84, 0.05], [s * 0.54, 0.7, 0.17], [s * 0.5, 0.57, 0.27], [s * 0.42, 0.49, 0.36], [s * ARM_END[0], ARM_END[1], ARM_END[2]]],   // kept inside the body's outline
    [0.12, 0.13, 0.135, 0.14, 0.15], 12));
  const min2 = (f, x, y, z) => Math.min(f[0](x, y, z), f[1](x, y, z));
  var alienPoses = S.poses(ALIEN_ARM_LIFT, ALI_PIVOT, (armsAt) => {
    const sdf = (x, y, z) => {
      const b = body(x, y, z);
      const withFeet = S.smin(S.smin(b, min2(ears, x, y, z), 0.07), min2(feet, x, y, z), 0.09);
      // the arm melts into the body along its whole length, easing off near the paw so it stays round
      const toPaw = Math.hypot(Math.abs(x) - ARM_END[0], y - ARM_END[1], z - ARM_END[2]);
      const k = 0.1 * Math.min(Math.max((toPaw - 0.11) / 0.2, 0), 1);
      const a = armsAt(arms, x, y, z);
      const withArms = k > 1e-4 ? S.smin(b, a, k) : Math.min(b, a);
      return Math.min(withFeet, withArms);
    };
    return S.sculpt(sdf, [[-0.95, -0.15, -0.6], [0.95, 2.55, 0.85]], 0.02, () => 0);
  }, plushMaterial(C.alien, 0, true), alienBody);
  addFuzz(alienPoses, C.alien, 0.045, 230, false);
}

// Eyes: big flat discs that follow the curve of the face, small pupils turned inward.
const EYE_R = 0.218;
const alienEyes = [-1, 1].map(s => {
  const e = new THREE.Group();
  e.position.set(s * 0.275, 1.1, alienFrontZ(0.275, 1.1) - 0.015 + FUR_LIFT * 0.6);   // set into the face
  e.rotation.set(-0.12, s * 0.3, 0, 'YXZ');   // follow the curve of the face
  alienBody.add(e);
  const white = solid(M.white, [0, 0, 0], [EYE_R, EYE_R, 0.055], e);
  const pupil = solid(M.black, [0, 0, 0], [0.048, 0.048, 0.012], e);
  // closed eyes: a little dark arc on the pink, like the bear's (∪ sleepy for blinks, ∩ happy while sipping)
  const arc = (happy) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 28, Math.PI), M.black);
    m.position.set(0, happy ? -0.04 : 0.03, 0.01);
    m.rotation.z = happy ? 0 : Math.PI; m.visible = false; e.add(m); return m;
  };
  return { white, pupil, s, sleepy: arc(false), happy: arc(true) };
});
function placePupil(p, px, py) {
  p.position.set(px, py, 0.055 * Math.sqrt(Math.max(0, 1 - (px * px + py * py) / (EYE_R * EYE_R))) + 0.003);
}

// Mouth: a rounded, downward-pointing black shape tucked right under the eyes.
const mouthOpen = new THREE.Group(); alienBody.add(mouthOpen);
{
  const sh = new THREE.Shape();
  sh.moveTo(-0.125, 0.08);
  sh.quadraticCurveTo(0, 0.1, 0.125, 0.08);
  sh.bezierCurveTo(0.145, 0.0, 0.06, -0.1, 0, -0.1);
  sh.bezierCurveTo(-0.06, -0.1, -0.145, 0.0, -0.125, 0.08);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.014, bevelSegments: 4, curveSegments: 24 });
  const m = new THREE.Mesh(g, M.mouth);
  m.scale.set(0.92, 0.8, 1);   // a little wider
  m.position.set(0, 0.87, alienFrontZ(0, 0.87) - 0.02 + FUR_LIFT * 1.1);
  mouthOpen.add(m);
}
for (const s of [-1, 1]) {
  const t = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.046, 0.02, 3, 0.007), M.tooth);
  t.position.set(s * 0.02, 0.915, alienFrontZ(0, 0.915) + 0.025 + FUR_LIFT * 1.1); mouthOpen.add(t);
}
// Other mouth shapes for its expressions: a closed, contented smile and a small surprised "o".
const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 32, Math.PI), M.mouth);
mouthSmile.rotation.z = Math.PI;                       // curve downward = a smile
mouthSmile.position.set(0, 0.9, alienFrontZ(0, 0.9) + 0.005 + FUR_LIFT * 1.1);
mouthSmile.visible = false; alienBody.add(mouthSmile);
const mouthO = solid(M.mouth, [0, 0.86, alienFrontZ(0, 0.86) + FUR_LIFT * 1.1], [0.045, 0.055, 0.02], alienBody);
mouthO.visible = false;
function setMouth(kind) { mouthOpen.visible = kind === 'open'; mouthSmile.visible = kind === 'smile'; mouthO.visible = kind === 'o'; }


// The mug rides along with the arms.
const alienArms = new THREE.Group();
alienArms.position.set(...ALI_PIVOT);
alienBody.add(alienArms);
const UA = (p) => [p[0] - ALI_PIVOT[0], p[1] - ALI_PIVOT[1], p[2] - ALI_PIVOT[2]];
const alienMug = mug(0.21, 0.42, alienArms);
alienMug.position.set(...UA([0, 0.44, 0.58]));

// =====================================================================
// Steam from the bear's mug
// =====================================================================
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const steam = Array.from({ length: 4 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
  scene.add(s); return s;
});
const tmp = new THREE.Vector3();
function updateSteam(t, strength) {
  bearMug.userData.top.getWorldPosition(tmp);
  steam.forEach((p, i) => {
    const life = (t * 0.45 + i / steam.length) % 1;
    p.position.set(tmp.x + Math.sin(t * 2 + i * 1.7) * 0.05, tmp.y + 0.04 + life * 0.36, tmp.z + 0.05);
    const sc = 0.11 + life * 0.13; p.scale.set(sc, sc, sc);
    p.material.opacity = Math.sin(life * Math.PI) * 0.35 * strength;
  });
}

// =====================================================================
// Animation
// =====================================================================
const smooth = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
/** 0 = resting, 1 = drinking. One sip every `period` seconds, about 3 s long. */
function sip(t, period, offset) {
  if (params.has('rest')) return 0;
  const p = (t + offset) % period, start = period - 3.2;
  if (p < start) return 0;
  const s = p - start;
  if (s < 0.8) return smooth(s / 0.8);
  if (s < 2.4) return 1;
  return 1 - smooth((s - 2.4) / 0.8);
}
// Sips now happen at relaxed, random moments (roughly once a minute each) rather than on a fast fixed beat.
function sipSchedule(seed, first, minGap, maxGap) {
  let r = seed; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const starts = []; let t = first;
  for (let i = 0; i < 4000; i++) { starts.push(t); t += 3.2 + minGap + rand() * (maxGap - minGap); }
  return { starts, span: t };
}
function sipAt(t, sched) {
  if (params.has('rest')) return 0;
  t = t % sched.span;
  const a = sched.starts; let lo = 0, hi = a.length - 1;
  if (t < a[0]) return 0;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= t) lo = m; else hi = m - 1; }
  const s = t - a[lo];
  if (s < 0.8) return smooth(s / 0.8);
  if (s < 2.4) return 1;
  if (s < 3.2) return 1 - smooth((s - 2.4) / 0.8);
  return 0;
}
const BEAR_SIPS = sipSchedule(12345, 8, 45, 100);    // bear: first sip after ~8 s, then every 45-100 s
const ALIEN_SIPS = sipSchedule(67890, 22, 35, 80);   // alien: first sip after ~22 s, then every 35-80 s
// The alien's moods: every so often it shows one for a few seconds, in between sips.
const MOODS = ['curious', 'giggle', 'sleepy', 'curious', 'giggle'];
const MOOD_TIMES = sipSchedule(24680, 14, 12, 28);
function lastStart(t, sched) {
  t = t % sched.span; const a = sched.starts;
  if (t < a[0]) return { i: -1, since: Infinity };
  let lo = 0, hi = a.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= t) lo = m; else hi = m - 1; }
  return { i: lo, since: t - a[lo] };
}
// Nom's eyes follow the mouse: the app sends the pointer position (in window points, from bottom-left).
let mouse = null, mouseMovedAt = -1e9;
window.setMouse = (x, y) => { mouse = { x, y: window.innerHeight - y }; mouseMovedAt = performance.now(); };
if (params.has('mouse')) { const [mx, my] = params.get('mouse').split(',').map(Number); mouse = { x: mx, y: my }; mouseMovedAt = 1e15; }
const watchingMouse = () => mouse && performance.now() - mouseMovedAt < 10000;   // stops after 10 s without movement
const _eyePos = new THREE.Vector3();
function lookAtMouse(white, pupil) {
  camera.updateMatrixWorld();
  white.getWorldPosition(_eyePos).project(camera);
  const ex = (_eyePos.x + 1) / 2 * window.innerWidth, ey = (1 - _eyePos.y) / 2 * window.innerHeight;
  const dx = mouse.x - ex, dy = -(mouse.y - ey), d = Math.hypot(dx, dy) || 1;
  const m = 0.12 * Math.min(1, d / 120);              // pupils centre when the pointer is right in front of the eye
  placePupil(pupil, dx / d * m, dy / d * m);
}
const blinking = (t, period, offset) => !params.has('rest') && ((t + offset) % period) < 0.16;


// =====================================================================
// Director: decides what the buddies are doing (coffee, sleeping, birthday)
// =====================================================================
const BEAR_MUG_HOLD = BA([0, 1.04, 1.24]), BEAR_MUG_FLOOR = BA([0, 0.24, 1.55]);   // mugs go down in front of their feet
const ALIEN_MUG_HOLD = UA([0, 0.44, 0.58]), ALIEN_MUG_FLOOR = UA([0, 0.22, 0.78]);
const D = { sleep: 0, lastT: null, bdayStart: null, thanksStart: null, pendingBday: false, pendingThanks: false, hats: false };
let lastActivityMs = performance.now();
window.playBirthday = () => { D.pendingBday = true; D.hats = true; lastActivityMs = performance.now(); };
window.birthdayThanks = () => { D.pendingThanks = true; lastActivityMs = performance.now(); };
window.setBirthdayDay = (on) => { D.hats = !!on; };
function wantsSleep() {
  if (params.has('sleep')) return true;
  if (params.has('preview') || params.has('rest')) return false;
  const idleMin = (performance.now() - Math.max(lastActivityMs, mouseMovedAt)) / 60000;
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const night = h >= 22 || h < 6.5;
  return idleMin >= (night ? 2 : 10);      // doze off after 10 min without the mouse moving (2 min late at night)
}
function direct(t) {
  const dt = D.lastT === null ? 0 : Math.max(0, Math.min(0.5, t - D.lastT)); D.lastT = t;
  if (D.pendingBday) { D.bdayStart = t; D.pendingBday = false; }
  if (D.pendingThanks) { D.thanksStart = t; D.pendingThanks = false; }
  let bdayT = params.has('bday') ? +params.get('bday') : (D.bdayStart === null ? Infinity : t - D.bdayStart);
  if (bdayT > BDAY_LEN) bdayT = Infinity;
  const thanksT = D.thanksStart === null ? Infinity : t - D.thanksStart;
  const awakeForce = bdayT < BDAY_LEN || thanksT < 4;
  if (params.has('sleep')) D.sleep = Math.min(1, +params.get('sleep') || 1);
  else if (wantsSleep() && !awakeForce) D.sleep = Math.min(1, D.sleep + dt / 7);   // drift off over ~7 s
  else D.sleep = Math.max(0, D.sleep - dt / 2.5);                                   // wake up a bit quicker
  // birthday: cheers (lift mugs) from 1.5 s to 5 s, again 11-13 s
  const pulse = (a, b) => smooth(Math.min((bdayT - a) / 0.6, (b - bdayT) / 0.6));
  const cheer = bdayT < BDAY_LEN ? Math.max(pulse(1.5, 5), pulse(11, 13.5)) : 0;
  const party = bdayT < BDAY_LEN ? smooth(Math.min(bdayT / 0.5, (BDAY_LEN - bdayT) / 1.0)) : 0;
  const thanks = thanksT < 4 ? smooth(Math.min(thanksT / 0.3, (4 - thanksT) / 0.5)) : 0;
  return { sleep: D.sleep, bdayT, cheer, party, thanks, hats: D.hats || params.has('bday') || params.has('hats') };
}
const BDAY_LEN = 22;

// --- Zzz while asleep ---
const zTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 52px "Avenir Next", "Helvetica Neue", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText('z', 32, 34); g.fillStyle = '#6b5fa8'; g.fillText('z', 32, 34);
  return new THREE.CanvasTexture(c);
})();
function makeZs(n) { return Array.from({ length: n }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); return s; }); }
const bearZs = makeZs(3), alienZs = makeZs(3);
const _zp = new THREE.Vector3();
function updateZs(zs, origin, t, amount, size) {
  zs.forEach((z, i) => {
    const life = (t * 0.3 + i / zs.length) % 1;
    z.visible = amount > 0.01;
    z.position.set(origin.x + life * 0.45 * size + Math.sin(t * 1.5 + i) * 0.05, origin.y + life * 0.9 * size, origin.z);
    const sc = (0.12 + life * 0.16) * size; z.scale.set(sc, sc, sc);
    z.material.opacity = Math.sin(life * Math.PI) * amount;
  });
}

// --- Birthday props: party hats and confetti ---
function partyHat(color, stripe, r, h, parent) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 40, 1, true), new THREE.MeshToonMaterial({ color, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide }));
  cone.position.y = h / 2; g.add(cone);
  for (const f of [0.25, 0.55]) {          // two stripes
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * (1 - f) * 1.01, r * 0.07, 8, 40), new THREE.MeshToonMaterial({ color: stripe, gradientMap: TOON_BANDS.cel }));
    band.rotation.x = Math.PI / 2; band.position.y = h * f; g.add(band);
  }
  const pom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 20, 14), new THREE.MeshToonMaterial({ color: stripe, gradientMap: TOON_BANDS.cel }));
  pom.position.y = h; g.add(pom);
  g.visible = false; parent.add(g); return g;
}
const bearHat = partyHat(0x5cc6c9, 0xffd34d, 0.24, 0.48, bearBody);
bearHat.position.set(-0.36, 2.5, 0.3); bearHat.rotation.set(0.15, 0, 0.5);   // jaunty, on the side of his head
const alienHat = partyHat(0xffd34d, 0x5cc6c9, 0.17, 0.36, alienBody);
alienHat.position.set(0, 1.42, 0.08); alienHat.rotation.x = 0.12;
const CONFETTI_COLORS = [0xff6b9a, 0xffd34d, 0x5cc6c9, 0x8f7cf0, 0xff9f45, 0x7bd389];
const confetti = Array.from({ length: 70 }, (_, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], side: THREE.DoubleSide }));
  const r = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  m.userData = { x: -2.7 + r(1) * 4.6, z: 0.6 + r(2) * 1.4, delay: r(3) * 7, speed: 0.45 + r(4) * 0.35, spin: 2 + r(5) * 5, sway: r(6) * 6.28 };
  m.visible = false; scene.add(m); return m;
});
function updateConfetti(bdayT) {
  for (const c of confetti) {
    const u = c.userData, life = bdayT - u.delay;
    const y = 3.6 - life * u.speed;
    c.visible = bdayT < BDAY_LEN && life > 0 && y > 0.02;
    if (!c.visible) continue;
    c.position.set(u.x + Math.sin(life * 2 + u.sway) * 0.15, y, u.z);
    c.rotation.set(life * u.spin, life * u.spin * 0.7, life * 1.3);
  }
}
const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

function pose(t) {
  const W = direct(t);                         // what the director says is happening
  const zz = smooth((W.sleep - 0.45) / 0.55);  // eyes closed / leaning: second half of falling asleep
  const mugDown = smooth(Math.min(1, W.sleep / 0.45));   // first half: put the mugs down
  // Bear: breathes; sips now and then; on birthdays he raises his mug for a toast.
  let bs = params.has('preview') ? sip(t, 9, 4.8) : sipAt(t, BEAR_SIPS);
  bs = Math.max(bs * (1 - mugDown), W.cheer * 0.6);
  const breath = 1 + (0.012 + 0.014 * zz) * Math.sin(t * (1.6 - 0.8 * zz));   // slower, deeper breaths when asleep
  bearBody.scale.set(1 + (breath - 1) * 0.5, breath, 1);
  bearBody.rotation.x = 0.07 * zz;             // head nods forward
  bearBody.rotation.z = -0.025 * zz;
  bearMug.position.set(...lerp3(BEAR_MUG_HOLD, BEAR_MUG_FLOOR, mugDown));
  bearArms.rotation.x = -BEAR_ARM_LIFT * bs;
  bearPoses.show(bs);
  bearMug.rotation.x = (MUG_TILT + BEAR_ARM_LIFT * bs - (0.5 + MUG_TILT) * smooth((bs - 0.6) / 0.4)) * (1 - mugDown);
  const happy = (bs > 0.5 && W.cheer < 0.5) || W.party > 0.5 || W.thanks > 0.5;
  const sleepy = !happy && (zz > 0.5 || blinking(t, 4.7, 1));
  bearEyes.forEach(e => (e.visible = !happy && !sleepy));
  bearHappy.forEach(e => (e.visible = happy));
  bearSleepy.forEach(e => (e.visible = sleepy));
  updateSteam(t, (1 - bs) * (1 - mugDown));
  bearHat.visible = alienHat.visible = W.hats;
  updateConfetti(W.bdayT);
  bearBody.updateMatrixWorld(); alienBody.updateMatrixWorld();
  updateZs(bearZs, bearBody.localToWorld(_zp.set(0.8, 2.05, 0.6)), t, zz, 0.95);
  updateZs(alienZs, alienBody.localToWorld(_zp.set(0.3, 1.45, 0.3)), t + 1.7, zz, 0.75);

  // Alien: sways, hops every 5 s, drinks every 7 s, blinks, glances over at the bear.
  let us = params.has('preview') ? sip(t, 7, 6.3) : sipAt(t, ALIEN_SIPS);
  us = Math.max(us * (1 - mugDown), W.cheer * 0.7);
  alienMug.position.set(...lerp3(ALIEN_MUG_HOLD, ALIEN_MUG_FLOOR, mugDown));
  // how long since its last sip began (for the contented "mmm" afterwards)
  const sinceSip = params.has('preview') ? (((t + 6.3) % 7) >= 3.8 ? ((t + 6.3) % 7) - 3.8 : ((t + 6.3) % 7) + 3.2)
                                         : lastStart(t, ALIEN_SIPS).since;
  const afterSip = !params.has('rest') && sinceSip > 0.5 && sinceSip < 7.5;          // mouth closed from the moment the cup reaches it
  // an occasional mood, never during or just after a sip
  let mood = params.get('expr') || null, moodT = 1.5;
  if (!mood && !params.has('preview') && !params.has('rest')) {
    const m = lastStart(t, MOOD_TIMES);
    if (m.since < 3.6 && us === 0 && !afterSip) { mood = MOODS[m.i % MOODS.length]; moodT = m.since; }
  }
  if (mood === 'content') mood = null;
  if (W.sleep > 0.05) mood = null;
  if (W.party > 0.3 || W.thanks > 0.3) { mood = 'giggle'; moodT = (W.thanks > 0.3 ? t : W.bdayT) % 3.6; }   // giggly on birthdays
  const ease = mood ? smooth(Math.min(moodT / 0.4, (3.6 - moodT) / 0.4)) : 0;   // fade in and out

  const hp = t % 5;
  const hopping = false;   // the little hop is switched off
  alien.position.y = hopping ? Math.sin(Math.PI * hp / 0.45) * 0.12 : 0;
  if (mood === 'giggle') alien.position.y += Math.abs(Math.sin(moodT * 16)) * 0.035 * ease;   // little giggly bounce
  let tilt = params.has('rest') ? 0 : 0.035 * Math.sin(t * 1.3);
  if (mood === 'curious') tilt += 0.14 * ease;                  // head tilt
  if (mood === 'sleepy') tilt += 0.07 * ease * Math.sin(moodT * 1.2);   // slow, dozy sway
  alienBody.rotation.z = tilt * (1 - zz) - 0.17 * zz;   // asleep: leans over onto Barry
  if (D.alienX === undefined) D.alienX = alien.position.x;
  alien.position.x = D.alienX + 0.06 * zz;
  alienArms.rotation.x = -ALIEN_ARM_LIFT * us;
  alienPoses.show(us);
  alienMug.rotation.x = (MUG_TILT + ALIEN_ARM_LIFT * us - (0.4 + MUG_TILT) * smooth((us - 0.6) / 0.4)) * (1 - mugDown);
  alienMug.rotation.z = -alienBody.rotation.z * mugDown;   // the mug on the floor stays upright while Nom leans

  // eyes
  const blink = blinking(t, 3.9, 0.5);
  const gp = t % 13, glance = !params.has('rest') && !mood && gp > 5 && gp < 7;
  const sipping = us > 0.5;
  const mmm = params.get('expr') === 'content' || (!mood && afterSip && sinceSip < 4.8);   // eyes stay happily closed just after a sip
  const happyEyes = zz < 0.5 && ((sipping && W.cheer < 0.5) || mmm || mood === 'giggle');
  const sleepyEyes = zz > 0.5 || mood === 'sleepy' || (blink && !happyEyes);
  const wide = mood === 'curious' ? 1 + 0.15 * ease : 1;
  alienEyes.forEach(({ white, pupil, s, sleepy, happy }) => {
    white.visible = pupil.visible = !happyEyes && !sleepyEyes;
    happy.visible = happyEyes;
    sleepy.visible = sleepyEyes && !happyEyes;
    white.scale.set(EYE_R * wide, EYE_R * wide, 0.055);
    if (watchingMouse() && W.sleep < 0.3) lookAtMouse(white, pupil);          // following your mouse pointer
    else if (mood === 'curious') placePupil(pupil, 0, 0.05);  // looking straight up, wondering
    else if (glance) placePupil(pupil, 0.09, 0.04);
    else placePupil(pupil, -s * 0.06, 0.035);                 // a bright, slightly upward gaze
  });

  // mouth: closed while drinking and for a while after, a small "o" when curious, a smile when giggly or sleepy
  if (zz > 0.3) setMouth('smile');
  else if (mood === 'curious') setMouth('o');
  else if (mood === 'giggle' || mood === 'sleepy' || afterSip || us > 0.3 || params.get('expr') === 'content') setMouth('smile');
  else setMouth('open');
}

// ?solo&turn=<degrees> shows the bear on his own, turned, for checking him against the turnaround sheet
if (params.has('soloalien')) { bear.visible = false; alien.position.set(-0.45, 0, 0); alien.scale.setScalar(1.2); alien.rotation.y = THREE.MathUtils.degToRad(+params.get('turn') || 0); if (params.has('nomug')) alienMug.visible = false; }
if (params.has('solo')) { if (params.has('nomug')) bearMug.visible = false; alien.visible = false; bear.position.x = -0.45; bear.rotation.y = THREE.MathUtils.degToRad(+params.get('turn') || 0); }
const outline = STYLE === 'toon' ? new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.16, 0.11, 0.08] }) : null;
function renderAt(t) { pose(t); (outline || renderer).render(scene, camera); }
window.renderAt = renderAt;

if (!params.has('preview')) {
  const start = performance.now();
  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (now - last < 1000 / 30) return;   // 30 fps keeps it smooth and easy on the battery
    last = now;
    renderAt((now - start) / 1000);
  };
  requestAnimationFrame(loop);
}
