// Dock Buddies 3D — plush bear and bunny, measured from the reference renders, with tufted shell fur.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as S from './sculpt.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

// ---------- palette (sampled from the references) ----------
const C = {
  bear: 0xa4805f, bearEar: 0xd08a3e, cream: 0xefd9bd, belly: 0xd9bd9d,   // lighter, greyer taupe from the turnaround
  alien: 0xee5c9f,
  croc: 0x4a6c34, crocBelly: 0xe6d3a6, crocBack: 0x34521f, crocGold: 0xe3a33d, bow: 0x8f5a33,
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
  // how full it is (1 = full): the coffee sinks as they drink, and rises again with a refill
  g.userData.setLevel = (k) => { coffee.position.y = (-h / 2 + 0.05) + (h - 0.105) * k; coffee.scale.setScalar(0.97 + 0.03 * k); };
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

function smooth01(x) { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); }
const smooth = smooth01;

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
// a good-morning stretch: arms out to the sides
// waving hello with his outside arm (two poses to swing between)
const BEAR_WAVE = [[0.9, 1.15, -0.55], [0.9, 0.8, -0.8]].map(([lift, yaw, spread]) => ({ lift, yaw, spread, sx: 0.9, only: 1 }));
const BEAR_STRETCH = [[0.3, 0.25], [0.55, 0.6], [0.8, 0.95], [0.95, 1.25]].map(([lift, yaw]) => ({ lift, yaw, sx: 0.9 }));   // arms out to the sides
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
  const bearBuild = (armsAt, toRest, stretch) => {
    const sdf = (x, y, z) => {
      const b = body(x, y, z);
      const rest = S.smin(S.smin(S.smin(b, min2(ears, x, y, z), 0.07), tail(x, y, z), 0.06), min2(feet, x, y, z), 0.14);
      // the arm melts into his body along its whole length (no seam), easing off near the paw so it stays round
      let k;
      if (stretch && !(stretch.only && (x < 0 ? -1 : 1) !== stretch.only)) {   // arms up and away from the body: melt in only at the shoulder
        const r = toRest(x, y, z), toShoulder = Math.hypot(Math.abs(r[0]) - 0.96, r[1] - 1.46, r[2] - 0.11);
        k = 0.14 * Math.min(Math.max(1 - (toShoulder - 0.2) / 0.3, 0), 1);
      } else {
        const toPaw = Math.hypot(Math.abs(x) - 0.56, y - 0.99, z - 1.08);
        k = 0.16 * Math.min(Math.max((toPaw - 0.18) / 0.3, 0), 1);
      }
      const a = armsAt(arms, x, y, z);
      const withArms = k > 1e-4 ? S.smin(b, a, k) : Math.min(b, a);   // melts in at the shoulder only
      return Math.min(rest, withArms);
    };
    return S.sculpt(sdf, stretch ? [[-2.4, -0.15, -1.15], [2.4, 3.4, 1.65]] : [[-1.6, -0.15, -1.15], [1.6, 2.95, 1.65]], 0.028, () => 0, paint);
  };
  const bearMat = plushMaterial(0xffffff, 0, true, true, C.bear);
  var bearPoses = S.poses(BEAR_ARM_LIFT, BEAR_PIVOT, bearBuild, bearMat, bearBody);
  // the stretch poses are sculpted after everything else (see the end of the characters)
  var makeBearStretch = () => S.poses(0, BEAR_PIVOT, bearBuild, bearMat, bearBody, 0, BEAR_STRETCH);
  var makeBearWave = () => S.poses(0, BEAR_PIVOT, bearBuild, bearMat, bearBody, 0, BEAR_WAVE);
  addFuzz(bearPoses, 0xffffff, 0.055, 210, true);
}
// Face, placed on the surface: eyes fairly high and wide, a round cream snout just below.
const fz = (x, y) => bearFrontZ(x, y) + FUR_LIFT;
for (const s of [-1, 1]) furBlob(C.bearEar, [s * 0.64, 2.53, 0.13 + FUR_LIFT], [0.16, 0.16, 0.04], bearBody, SHORTFUR);   // inner ear
furBlob(C.cream, [0, 1.98, fz(0, 1.98) - 0.05], [0.28, 0.26, 0.17], bearBody, SHORTFUR);   // snout
solid(M.black, [0, 2.09, fz(0, 1.98) + 0.1], [0.09, 0.065, 0.05], bearBody);                // nose
{ const m = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8), M.mouth);
  m.position.set(0, 1.97, fz(0, 1.98) + 0.115); m.rotation.x = 0.25; bearBody.add(m); var bearMouthLine = m; }      // mouth line
const bearYawn = solid(M.mouth, [0, 1.9, fz(0, 1.9) + 0.105], [0.075, 0.1, 0.04], bearBody);   // big round yawn
bearYawn.visible = false;
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
const NOM_WAVE = [[2.0, 0.25], [2.0, 0.75]].map(([lift, spread]) => ({ lift, spread, sx: 0.5, only: -1 }));   // waving with its outside arm
const NOM_STRETCH = [[0.5, 0.2], [1.0, 0.45], [1.4, 0.65], [1.7, 0.8]].map(([lift, spread]) => ({ lift, spread, sx: 0.5 }));   // arms up beside its head
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
  const alienBuild = (armsAt, toRest, stretch) => {
    const sdf = (x, y, z) => {
      const b = body(x, y, z);
      const withFeet = S.smin(S.smin(b, min2(ears, x, y, z), 0.07), min2(feet, x, y, z), 0.09);
      // the arm melts into the body along its whole length, easing off near the paw so it stays round
      let k;
      if (stretch && !(stretch.only && (x < 0 ? -1 : 1) !== stretch.only)) {   // arms up: melt in only at the shoulder
        const r = toRest(x, y, z), toShoulder = Math.hypot(Math.abs(r[0]) - 0.5, r[1] - 0.84, r[2] - 0.05);
        k = 0.09 * Math.min(Math.max(1 - (toShoulder - 0.1) / 0.18, 0), 1);
      } else {
        const toPaw = Math.hypot(Math.abs(x) - ARM_END[0], y - ARM_END[1], z - ARM_END[2]);
        k = 0.1 * Math.min(Math.max((toPaw - 0.11) / 0.2, 0), 1);
      }
      const a = armsAt(arms, x, y, z);
      const withArms = k > 1e-4 ? S.smin(b, a, k) : Math.min(b, a);
      return Math.min(withFeet, withArms);
    };
    return S.sculpt(sdf, stretch ? [[-1.2, -0.15, -0.6], [1.2, 2.55, 0.85]] : [[-0.95, -0.15, -0.6], [0.95, 2.55, 0.85]], 0.02, () => 0);
  };
  const alienMat = plushMaterial(C.alien, 0, true);
  var alienPoses = S.poses(ALIEN_ARM_LIFT, ALI_PIVOT, alienBuild, alienMat, alienBody);
  var makeNomStretch = () => S.poses(0, ALI_PIVOT, alienBuild, alienMat, alienBody, 0, NOM_STRETCH);
  var makeNomWave = () => S.poses(0, ALI_PIVOT, alienBuild, alienMat, alienBody, 0, NOM_WAVE);
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

// Sculpted last, so the stored meshes for everything above stay in the same order.
const bearStretch = makeBearStretch();
bearStretch.meshes.forEach(m => (m.visible = false));

// =====================================================================
// Greg, Nom's plush crocodile (sculpted last too): big grin, cream jaw and belly, spots, a curly tail,
// wonky golden horns and a little bow. Lies across Nom's tummy when hugged, head towards Barry.
// =====================================================================
const croc = new THREE.Group();
alienBody.add(croc);
{
  const body = S.ellipsoid([-0.1, 0.02, 0], [0.37, 0.19, 0.19]);
  const head = S.ellipsoid([0.3, 0.19, 0], [0.27, 0.3, 0.22]);          // big round head
  const snout = S.ellipsoid([0.6, 0.11, 0], [0.31, 0.135, 0.175]);           // bulbous upper jaw
  const jaw = S.ellipsoid([0.52, -0.035, 0], [0.3, 0.075, 0.155]);       // cream lower jaw
  const tailPts = [[-0.4, 0.02, 0], [-0.6, 0.06, 0], [-0.76, 0.16, 0], [-0.84, 0.32, 0], [-0.8, 0.48, 0], [-0.68, 0.56, 0], [-0.56, 0.52, 0], [-0.53, 0.42, 0], [-0.6, 0.37, 0]];
  const tail = S.softTube(tailPts, [0.15, 0.13, 0.11, 0.095, 0.08, 0.068, 0.058, 0.05, 0.042], 10);   // rising into a big curl
  const legs = [[0.12, 1], [0.12, -1], [-0.3, 1], [-0.3, -1]].map(([x, s]) => {
    const leg = S.roundCone([x, -0.06, s * 0.12], [x + 0.03, -0.19, s * 0.15], 0.085, 0.08);
    const foot = S.ellipsoid([x + 0.06, -0.2, s * 0.15], [0.1, 0.055, 0.085]);
    return (X, Y, Z) => S.smin(leg(X, Y, Z), foot(X, Y, Z), 0.03);
  });
  const band = S.softTube([0, 1, 2, 3, 4, 5, 6].map(i => { const a = 0.25 + i * (Math.PI - 0.5) / 6; return [0.2, 0.17 + Math.sin(a) * 0.272, Math.cos(a) * 0.222]; }),
                          [0.045, 0.05, 0.052, 0.052, 0.052, 0.05, 0.045], 8);
  const hornUp = S.softTube([[0.22, 0.4, 0.06], [0.23, 0.56, 0.07], [0.19, 0.7, 0.06], [0.11, 0.78, 0.04]], [0.065, 0.058, 0.046, 0.033], 10);      // tall one, curving back
  const hornBack = S.softTube([[0.17, 0.4, -0.08], [0.06, 0.5, -0.1], [-0.08, 0.53, -0.1], [-0.2, 0.49, -0.08]], [0.062, 0.054, 0.044, 0.032], 10);  // the wonky one, swept back
  const gold = (x, y, z) => Math.min(band(x, y, z), hornUp(x, y, z), hornBack(x, y, z));
  const sdf = (x, y, z) => {
    let d = S.smin(body(x, y, z), head(x, y, z), 0.1);
    d = S.smin(d, snout(x, y, z), 0.08);
    d = S.smin(d, jaw(x, y, z), 0.04);
    d = S.smin(d, tail(x, y, z), 0.08);
    for (const l of legs) d = S.smin(d, l(x, y, z), 0.05);
    return S.smin(d, gold(x, y, z), 0.012);
  };
  const green = new THREE.Color(C.croc), cream = new THREE.Color(C.crocBelly), spotC = new THREE.Color(C.crocBack), goldC = new THREE.Color(C.crocGold);
  const spots = [[-0.02, 0.19, 0.08], [-0.16, 0.2, 0.06], [-0.3, 0.18, 0.07], [-0.09, 0.13, 0.15], [-0.24, 0.12, 0.15], [-0.4, 0.13, 0.12],
                 [0.04, 0.2, -0.06], [-0.2, 0.2, -0.07]];
  const paint = (x, y, z) => {
    if (gold(x, y, z) < 0.012) return [goldC.r, goldC.g, goldC.b];
    let k = 0;
    if (x > 0.3) k = smooth01((0.0 - y) / 0.02);                                   // cream lower jaw
    else if (x > -0.45 && y > -0.13) k = smooth01((-0.06 - y) / 0.03);             // cream stripe along the belly
    if (x < -0.42) k = Math.max(k, smooth01((0.2 - Math.hypot(x + 0.68, y - 0.34)) / 0.03), smooth01((0.0 - y) / 0.03));   // inside the tail curl
    let col = [green.r + (cream.r - green.r) * k, green.g + (cream.g - green.g) * k, green.b + (cream.b - green.b) * k];
    for (const [sx, sy, sz] of spots) if (Math.hypot(x - sx, y - sy, z - sz) < 0.052) col = [spotC.r, spotC.g, spotC.b];
    return col;
  };
  const mesh = new THREE.Mesh(S.sculpt(sdf, [[-1.02, -0.3, -0.32], [0.96, 0.88, 0.32]], 0.014, () => 0, paint), plushMaterial(0xffffff, 0, true, true, C.croc));
  croc.add(mesh);
  // where the near side's surface is, so face details sit right on it
  const side = (x, y) => { for (let z = 0.4; z > -0.1; z -= 0.003) if (sdf(x, y, z) < 0) return z; return 0; };
  // big glossy eyes with a white glint, close together on top of the head
  for (const [ex, ez] of [[0.44, 0.12], [0.43, -0.04]]) {
    const ey = 0.33;
    solid(M.black, [ex, ey, ez], [0.08, 0.085, 0.07], croc);
    solid(M.white, [ex + 0.035, ey + 0.04, ez + 0.06], [0.02, 0.02, 0.01], croc);
  }
  for (const nz of [0.05, -0.04]) solid(M.black, [0.82, 0.205, nz], [0.022, 0.018, 0.02], croc);   // nostrils
  // a wide grin: from the tip of the snout back, rising at the corner of the mouth
  const grinPts = [[0.87, 0.04], [0.77, 0.01], [0.65, 0.0], [0.53, 0.005], [0.42, 0.035], [0.34, 0.09]];
  const curve = new THREE.CatmullRomCurve3(grinPts.map(([x, y]) => new THREE.Vector3(x, y, side(x, y) + 0.004)));
  croc.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.011, 6), M.mouth));
  const toothMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_BANDS.cel });
  for (let i = 0; i < 7; i++) {
    const p = curve.getPoint(0.06 + i * 0.12);
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.045, 10), toothMat);
    tooth.position.set(p.x, p.y - 0.026, side(p.x, p.y - 0.026) + 0.003); tooth.rotation.z = Math.PI; croc.add(tooth);
  }
  // a little brown bow on its chest
  const bowMat = new THREE.MeshToonMaterial({ color: C.bow, gradientMap: TOON_BANDS.cel });
  const bow = new THREE.Group(); bow.position.set(0.2, -0.07, side(0.2, -0.07) + 0.012); bow.rotation.y = 0.25; croc.add(bow);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.013, 8, 20), bowMat); loop.position.set(s * 0.045, 0.008, 0); loop.scale.set(1, 0.7, 1); bow.add(loop);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 6), bowMat); end.position.set(s * 0.024, -0.045, 0); end.rotation.z = s * 0.45; bow.add(end);
  }
  bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), bowMat));
}
croc.visible = false;
const nomStretch = makeNomStretch();          // sculpted after Greg, so the stored order stays the same
nomStretch.meshes.forEach(m => (m.visible = false));
const nomWave = makeNomWave(), bearWave = makeBearWave();   // waving hello (sculpted last)
nomWave.meshes.forEach(m => (m.visible = false)); bearWave.meshes.forEach(m => (m.visible = false));

// =====================================================================
// Coffee pot for refills (plain geometry)
// =====================================================================
const pot = new THREE.Group(); alienArms.add(pot);
{
  const enamel = new THREE.MeshToonMaterial({ color: 0x5cc6c9, gradientMap: TOON_BANDS.cel });
  const prof = [[0, -0.13], [0.11, -0.13], [0.15, -0.08], [0.16, 0.0], [0.14, 0.08], [0.1, 0.12], [0.11, 0.135], [0, 0.135]].map(([x, y]) => new THREE.Vector2(x, y));
  pot.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), enamel));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), M.ceramic); knob.position.y = 0.16; pot.add(knob);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.034, 0.18, 14), enamel);
  spout.position.set(0.18, 0.03, 0); spout.rotation.z = -0.95; pot.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 10, 24, Math.PI * 1.2), enamel);
  handle.position.set(-0.16, 0.0, 0); handle.rotation.z = Math.PI * 0.4; pot.add(handle);
  pot.userData.tip = new THREE.Object3D(); pot.userData.tip.position.set(0.255, 0.09, 0); pot.add(pot.userData.tip);
}
pot.visible = false; pot.scale.setScalar(1.25); pot.position.set(...UA([0, 0.5, 0.62]));   // between its paws
const POT_HOLD = { p: [0.0, 0.6, 0.6], r: [0, 0, 0] }, POT_AWAY = { p: [-0.35, 0.2, -0.55], r: [0, 0.3, 0] };
const stream = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshToonMaterial({ color: 0x5a3418, gradientMap: TOON_BANDS.cel }));
stream.visible = false; scene.add(stream);
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
function pourStream(from, to, t) {        // a stream of coffee arcing from the spout into a mug
  from.getWorldPosition(_s1); to.getWorldPosition(_s2); _s2.y -= 0.02;
  if (_s1.y < _s2.y + 0.05) { stream.visible = false; return; }   // never pour uphill
  // leaves the spout sideways, then falls straight down into the mug
  const wob = 0.008 * Math.sin(t * 30);
  const bend = new THREE.Vector3(_s2.x + wob, _s1.y, _s2.z + wob);
  const curve = new THREE.QuadraticBezierCurve3(_s1.clone(), bend, _s2.clone());
  stream.geometry.dispose();
  stream.geometry = new THREE.TubeGeometry(curve, 16, 0.024, 8, false);
  stream.visible = true;
}

// =====================================================================
// Halloween: a jack-o'-lantern for the last week of October (glowing after dark), and bats on the 31st
// =====================================================================
const pumpkin = new THREE.Group(); scene.add(pumpkin);
pumpkin.position.set(1.18, 0, 1.55); pumpkin.rotation.y = -0.35;
const pumpkinGlow = new THREE.MeshBasicMaterial({ color: 0xffc94a }), pumpkinDark = new THREE.MeshBasicMaterial({ color: 0x3a2410 });
const pumpkinFace = [];
{
  const g = new THREE.SphereGeometry(0.3, 48, 32), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {        // ribbed and a little squashed
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const r = 0.93 + 0.07 * Math.abs(Math.cos(a * 4));
    pos.setXYZ(i, x * r, y * 0.78, z * r);
  }
  g.computeVertexNormals();
  const body = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: 0xf28c28, gradientMap: TOON_BANDS.cel }));
  body.position.y = 0.235; pumpkin.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.11, 10), new THREE.MeshToonMaterial({ color: 0x6b5a2e, gradientMap: TOON_BANDS.cel }));
  stem.position.y = 0.5; stem.rotation.z = 0.25; pumpkin.add(stem);
  const tri = (pts) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const q of pts.slice(1)) sh.lineTo(...q); return new THREE.ShapeGeometry(sh); };
  const parts = [tri([[-0.15, 0.06], [-0.05, 0.06], [-0.1, 0.15]]), tri([[0.05, 0.06], [0.15, 0.06], [0.1, 0.15]]),
                 tri([[-0.03, 0.0], [0.03, 0.0], [0, 0.05]]),
                 tri([[-0.17, -0.04], [0.17, -0.04], [0.12, -0.1], [0.07, -0.07], [0.02, -0.11], [-0.03, -0.07], [-0.08, -0.11], [-0.12, -0.08]])];
  for (const geo of parts) { const m = new THREE.Mesh(geo, pumpkinDark); m.position.set(0, 0.25, 0.288); pumpkin.add(m); pumpkinFace.push(m); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexEarly(), color: 0xffa940, transparent: true, depthWrite: false, opacity: 0 }));
  glow.position.set(0, 0.26, 0.4); glow.scale.set(0.9, 0.7, 1); pumpkin.add(glow); pumpkin.userData.glow = glow;
}
function puffTexEarly() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
pumpkin.visible = false;
const batMat = new THREE.MeshBasicMaterial({ color: 0x2b2233, side: THREE.DoubleSide });
const bats = [0, 1].map(() => {
  const b = new THREE.Group();
  b.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), batMat));
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(s * 0.16, 0.06); sh.lineTo(s * 0.13, -0.01); sh.lineTo(s * 0.1, 0.02); sh.lineTo(s * 0.06, -0.03); sh.lineTo(0, 0);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), batMat); b.add(w); b.userData[s] = w;
  }
  b.visible = false; scene.add(b); return b;
});

// =====================================================================
// Story time: a picture book Barry holds open towards Nom, and little pictures in a speech bubble
// =====================================================================
/** Little drawings for the book's pages and the speech bubble. */
const DOODLES = [
  (g, s) => {   // the moon and stars
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(0, 0, s * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = g.__bg; g.beginPath(); g.arc(s * 0.2, -s * 0.12, s * 0.36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd34d';
    for (const [x, y, r] of [[0.42, -0.35, 0.09], [0.5, 0.28, 0.06], [-0.05, 0.5, 0.05]]) star(g, x * s, y * s, r * s);
  },
  (g, s) => {   // Greg
    g.fillStyle = '#5b8a3c'; g.beginPath(); g.ellipse(-s * 0.08, s * 0.12, s * 0.42, s * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(s * 0.32, -s * 0.02, s * 0.24, s * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#eedfb8'; g.beginPath(); g.ellipse(s * 0.4, s * 0.1, s * 0.2, s * 0.06, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e3a33d'; g.lineWidth = s * 0.07; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.26, -s * 0.18); g.quadraticCurveTo(s * 0.28, -s * 0.42, s * 0.14, -s * 0.48); g.stroke();
    g.beginPath(); g.moveTo(s * 0.18, -s * 0.16); g.quadraticCurveTo(s * 0.02, -s * 0.3, -s * 0.12, -s * 0.26); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(s * 0.38, -s * 0.1, s * 0.05, 0, Math.PI * 2); g.fill();
  },
  (g, s) => {   // a little house with a lit window
    g.fillStyle = '#c98b5a'; g.fillRect(-s * 0.32, -s * 0.05, s * 0.64, s * 0.45);
    g.fillStyle = '#e0605a'; g.beginPath(); g.moveTo(-s * 0.42, -s * 0.03); g.lineTo(0, -s * 0.42); g.lineTo(s * 0.42, -s * 0.03); g.fill();
    g.fillStyle = '#ffd34d'; g.fillRect(-s * 0.2, s * 0.06, s * 0.16, s * 0.14);
    g.fillStyle = '#7a4a2e'; g.fillRect(s * 0.06, s * 0.12, s * 0.14, s * 0.28);
  },
  (g, s) => {   // a heart
    g.fillStyle = '#ff6b9a'; g.beginPath(); g.moveTo(0, s * 0.38);
    g.bezierCurveTo(-s * 0.55, 0, -s * 0.35, -s * 0.48, 0, -s * 0.18);
    g.bezierCurveTo(s * 0.35, -s * 0.48, s * 0.55, 0, 0, s * 0.38); g.fill();
  },
];
function star(g, x, y, r) {
  g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function pageTexture(i) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 256;
  const g = c.getContext('2d'); g.__bg = '#fbf6ea'; g.fillStyle = g.__bg; g.fillRect(0, 0, 192, 256);
  g.save(); g.translate(96, 100); DOODLES[i % DOODLES.length](g, 130); g.restore();
  g.strokeStyle = '#c9bfae'; g.lineWidth = 6; g.lineCap = 'round';      // lines of writing
  for (const [y, w] of [[190, 120], [212, 140], [234, 90]]) { g.beginPath(); g.moveTo(96 - w / 2, y); g.lineTo(96 + w / 2, y); g.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const PAGES = DOODLES.map((_, i) => pageTexture(i)).concat(DOODLES.map((_, i) => pageTexture(i + 2)));
function bubbleTexture(i) {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const g = c.getContext('2d'); g.__bg = '#ffffff';
  g.fillStyle = '#ffffff'; g.strokeStyle = '#d8cdbd'; g.lineWidth = 5;
  g.beginPath(); g.ellipse(80, 72, 70, 60, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(98, 126); g.lineTo(122, 154); g.lineTo(76, 130); g.fill();   // little tail, pointing down to Barry
  g.save(); g.translate(80, 74); DOODLES[i % DOODLES.length](g, 82); g.restore();
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const BUBBLES = DOODLES.map((_, i) => bubbleTexture(i));
const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: BUBBLES[0], transparent: true, depthWrite: false }));
bubble.visible = false; scene.add(bubble);

const book = new THREE.Group();
bearArms.add(book);
book.position.set(...BA([0, 1.13, 1.42]));
book.rotation.y = -0.3;                           // turned a little towards Nom
const toonMat = (color, map = null) => new THREE.MeshToonMaterial({ color, map, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide });
const BOOK_W = 0.5, BOOK_H = 0.64;
function bookHalf(side) {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new RoundedBoxGeometry(BOOK_W + 0.03, BOOK_H + 0.05, 0.03, 2, 0.012), toonMat(0x3f74b8));
  cover.position.set(side * (BOOK_W / 2 + 0.01), 0, -0.02); g.add(cover);
  const block = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W, BOOK_H, 0.03), toonMat(0xf3ecdc));
  block.position.set(side * BOOK_W / 2, 0, 0.0); g.add(block);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_W * 0.96, BOOK_H * 0.96), toonMat(0xffffff, PAGES[0]));
  face.position.set(side * BOOK_W / 2, 0, 0.016); g.add(face);
  g.userData.face = face; book.add(g); return g;
}
const bookL = bookHalf(-1), bookR = bookHalf(1);
const flip = new THREE.Group(); book.add(flip);      // the page being turned, hinged at the spine
const flipFront = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_W * 0.96, BOOK_H * 0.96), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_BANDS.cel, side: THREE.FrontSide }));
const flipBack = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_W * 0.96, BOOK_H * 0.96), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_BANDS.cel, side: THREE.BackSide }));
for (const m of [flipFront, flipBack]) { m.position.x = BOOK_W / 2; flip.add(m); }
flip.position.z = 0.022;
book.visible = false;
const CROC_HUG = { p: [0.04, 0.46, 0.68], r: [0, -0.4, 0.08] };
const CROC_SCALE = 0.76;       // across Nom's tummy, resting on its paws
const CROC_AWAY = { p: [-0.35, 0.2, -0.55], r: [0, 0.3, 0.0] };    // put down behind Nom

// a little "clink!" sparkle for toasts
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.translate(64, 64);
  const star = (r1, r2, n) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  star(58, 16, 4); g.fillStyle = '#ffe36b'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#f2a81d'; g.stroke();
  return new THREE.CanvasTexture(c);
})();
const sparks = [0, 1, 2].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); return sp; });

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
/** the pointer is right by them (just above or beside the window) */
const mouseNear = () => watchingMouse() && performance.now() - mouseMovedAt < 1500 &&
  mouse.x > -90 && mouse.x < window.innerWidth + 90 && mouse.y > -130 && mouse.y < window.innerHeight + 30;
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
const ALIEN_MUG_SIDE = UA([-0.55, 0.22, 0.62]);   // out of the way while Nom cuddles Greg
// Spots on the floor for the mugs, fixed to the characters' places (not their bodies), so a mug stays put
// while they lean and turn.
const bearFloor = new THREE.Object3D(); bearFloor.position.set(0, 0.24, 1.55); bear.add(bearFloor);
const nomFloor = new THREE.Object3D(); alien.add(nomFloor);
const NOM_FLOOR = [0, 0.22, 0.78], NOM_SIDE = [-0.55, 0.22, 0.62];
const D = { sleep: params.has('preview') || params.has('rest') ? 0 : 1,   // they start the day asleep and wake up with a stretch
            lastT: null, bdayStart: null, thanksStart: null, pendingBday: false, pendingThanks: false, hats: false,
            deep: !(params.has('preview') || params.has('rest')), wakeStart: null,
            bMug: params.has('preview') || params.has('rest') ? 0 : 1, nMug: params.has('preview') || params.has('rest') ? 0 : 1,   // mugs on the floor (0 = in hand)
            croc: params.has('preview') || params.has('rest') ? 0 : 1,   // Nom wakes up holding Greg
            pendingAct: null, actStart: null, act: null, pot: 0, waveStart: null, lastWave: -1e9, wasNear: false, barryJoin: false };
// Little things they do now and then while awake (one every 4-8 minutes), in this order.
const ACTS = ['toast', 'croc', 'refill', 'story', 'stretch', 'toast', 'croc', 'refill', 'toast', 'story', 'stretch'];
const ACT_LEN = { toast: 5, croc: 19, stretch: 10, story: 48, refill: 13.5 };
const MUG_MOVE = 1.6;    // seconds to bend down and put a mug on the floor (or pick it up)
const ACT_TIMES = sipSchedule(13579, 150, 240, 480);
window.doActivity = (name) => { if (ACT_LEN[name]) D.pendingAct = name; };
let lastActivityMs = performance.now();
window.playBirthday = () => { D.pendingBday = true; lastActivityMs = performance.now(); };   // hats for the party; all day only on the birthday itself
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

  // waking up: once properly asleep, the moment they wake they have a big stretch and a yawn
  if (D.sleep > 0.95) D.deep = true;
  if (D.deep && D.sleep < 0.9) { D.deep = false; D.wakeStart = t; }
  let wakeT = params.has('wake') ? +params.get('wake') : (D.wakeStart === null ? Infinity : t - D.wakeStart);

  // the occasional activity
  let act = null, actT = Infinity;
  if (params.has('act')) { act = params.get('act'); actT = +(params.get('at') || 0); }
  else {
    if (D.pendingAct) { D.act = D.pendingAct; D.actStart = t; D.pendingAct = null; }
    else if (!params.has('preview') && !params.has('rest') && D.sleep < 0.01 && bdayT === Infinity && wakeT > 8) {
      const a = lastStart(t, ACT_TIMES);
      if (a.since < 0.1 && D.act === null) {
        D.act = ACTS[a.i % ACTS.length]; D.actStart = t;
        if (Math.min(D.bLevel ?? 1, D.nLevel ?? 1) < 0.4) D.act = 'refill';   // running low: time for a top-up
        // in the evening, story time is the favourite (at most once an hour)
        const h = new Date().getHours();
        if ((h >= 19 || h < 5) && (D.lastStory === undefined || t - D.lastStory > 3600)) D.act = 'story';
        if (D.act === 'story') D.lastStory = t;
      }
    }
    if (D.act) { actT = t - D.actStart; act = D.act; if (actT > ACT_LEN[act] || D.sleep > 0.3) { D.act = null; act = null; actT = Infinity; } }
  }
  if (act === 'stretch') { wakeT = actT - MUG_MOVE - 0.2; act = null; }   // the same stretch as on waking, once the mugs are down

  // Nom's crocodile: comes out for a cuddle, and always when Nom is asleep
  const wantCroc = ((act === 'croc' || act === 'story') && actT < ACT_LEN[act] - 2 * MUG_MOVE - 0.4) || D.sleep > 0.5;   // Greg listens to stories too
  // mugs: put down (bending over) before sleeping, stretching or cuddling Greg; picked up again afterwards
  const stretchWindow = wakeT > -MUG_MOVE - 0.5 && wakeT < 5;
  const bearWants = D.sleep > 0.02 || stretchWindow || (act === 'story' && actT < ACT_LEN.story - MUG_MOVE - 0.2)
                  || (act === 'refill' && actT < 11.2);   // Barry sets his mug down next to Nom for a top-up
  const wantPot = act === 'refill' && actT < 9.6;
  const nomWants = bearWants || wantCroc || D.croc > 0 || wantPot || D.pot > 0;
  const step = (v, up) => up ? Math.min(1, v + dt / MUG_MOVE) : Math.max(0, v - dt / MUG_MOVE);
  if (params.has('mug')) D.bMug = D.nMug = +params.get('mug');
  else { D.bMug = step(D.bMug, bearWants); D.nMug = step(D.nMug, nomWants); }
  if (params.has('croc')) { D.nMug = 1; D.croc = +params.get('croc'); }
  else if (wantCroc && D.nMug >= 1) D.croc = Math.min(1, D.croc + dt / 1.6);       // reaches round and brings Greg out
  else if (!wantCroc) D.croc = Math.max(0, D.croc - dt / 1.6);                      // and puts him back
  if (params.has('pot')) { D.pot = +params.get('pot'); D.nMug = 1; }
  else if (wantPot && D.nMug >= 1) D.pot = Math.min(1, (D.pot || 0) + dt / 1.6);       // the coffee pot, fetched the same way
  else if (!wantPot) D.pot = Math.max(0, (D.pot || 0) - dt / 1.6);

  // the stretch: Barry's arms go up 0.8-2 s, stay till 3.8 s, come down by 4.8 s; mugs back up by 6.5 s
  const stretch = wakeT < 6.5 ? smooth(Math.min((wakeT - 0.8) / 1.2, (4.8 - wakeT) / 1.0)) : 0;
  const yawn = wakeT < 6.5 ? smooth(Math.min((wakeT - 1.2) / 0.6, (3.9 - wakeT) / 0.6)) : 0;
  const nomYawn = wakeT < 6.5 ? smooth(Math.min((wakeT - 2.2) / 0.5, (4.4 - wakeT) / 0.5)) : 0;
  const nomStretchAmt = wakeT < 6.5 ? smooth(Math.min((wakeT - 2.0) / 0.7, (4.7 - wakeT) / 0.7)) : 0;

  // the toast: turn towards each other 0-1 s, clink at 1.5 s, a sip together, settle back by 5 s
  // story time: mugs down, the book opens at 2.4 s, a page turns every 5 s, Nom dozes off towards the end,
  // the book closes at 42 s, then mugs back up
  const storyT = act === 'story' ? actT : Infinity;
  const BOOK_ON = 2.0, BOOK_OFF = 43;
  const bookOut = storyT < ACT_LEN.story ? smooth(Math.min((storyT - BOOK_ON) / 0.6, (BOOK_OFF + 0.8 - storyT) / 0.6)) : 0;
  const bookOpen = storyT < ACT_LEN.story ? smooth(Math.min((storyT - BOOK_ON - 0.6) / 0.8, (BOOK_OFF - storyT) / 0.8)) : 0;
  const reading = storyT > 4 && storyT < BOOK_OFF - 1;
  const page = reading ? Math.floor((storyT - 4) / 5) : 0, pageT = reading ? ((storyT - 4) % 5) : 0;
  const doze = storyT < ACT_LEN.story ? smooth(Math.min((storyT - 26) / 8, (BOOK_OFF + 1.5 - storyT) / 1.5)) : 0;

  // refill: mug down (0-1.6 s), fetch the pot (to 3.2 s), pour for Barry (4-6.5 s), then into its own mug (7.5-9.5 s)
  const refillT = act === 'refill' ? actT : Infinity;
  const pourBarry = refillT < 14 ? smooth(Math.min((refillT - 3.6) / 0.6, (6.2 - refillT) / 0.6)) : 0;   // into Barry's mug
  const pourNom = refillT < 14 ? smooth(Math.min((refillT - 6.8) / 0.6, (9.2 - refillT) / 0.6)) : 0;     // then its own
  const holdOut = refillT < 14 ? smooth(Math.min((refillT - 1.6) / 0.8, (10.5 - refillT) / 0.8)) : 0;   // Barry turns to watch

  // waving hello when your pointer comes close (Nom first; Barry joins in if you stay)
  const near = mouseNear();
  // waves as soon as your pointer has been near them for a moment (once per visit, at most every 15 s)
  const idle = !act && D.sleep < 0.05 && D.bMug < 0.05 && D.nMug < 0.05 && wakeT > 3 && bdayT === Infinity;
  if (near) { if (D.nearSince == null) D.nearSince = t; } else { D.nearSince = null; D.wavedThisVisit = false; }
  if (near && idle && !D.wavedThisVisit && t - D.nearSince > 0.25 && t - D.lastWave > 15) {
    D.waveStart = t; D.lastWave = t; D.barryJoin = false; D.wavedThisVisit = true;
  }
  let waveT = params.has('wave') ? +params.get('wave') : (D.waveStart === null ? Infinity : t - D.waveStart);
  if (waveT > 1.2 && waveT < 1.3 && near) D.barryJoin = true;
  const waveN = waveT < 3.2 ? smooth(Math.min(waveT / 0.35, (3.2 - waveT) / 0.35)) : 0;
  const waveB = (D.barryJoin || params.has('wave')) && waveT < 4.2 ? smooth(Math.min((waveT - 1.2) / 0.4, (4.2 - waveT) / 0.4)) : 0;

  const toastT = act === 'toast' ? actT : Infinity;
  const toastTurn = toastT < 5 ? smooth(Math.min(toastT / 1.0, (5 - toastT) / 1.0)) : 0;
  const toastRaise = toastT < 5 ? Math.max(0.5 * smooth(Math.min((toastT - 0.4) / 0.8, (4.2 - toastT) / 0.6)),
                                            smooth(Math.min((toastT - 1.9) / 0.6, (3.6 - toastT) / 0.6))) : 0;
  const clink = toastT < 5 ? Math.max(0, 1 - Math.abs(toastT - 1.6) / 0.35) : 0;
  return { sleep: D.sleep, bdayT, cheer, party, thanks, hats: D.hats || bdayT < BDAY_LEN || thanksT < 4 || params.has('bday') || params.has('hats'),
           stretch, yawn, nomYawn, nomStretch: nomStretchAmt, bMug: D.bMug, nMug: D.nMug, croc: D.croc,
           toastTurn, toastRaise, clink, bookOut, bookOpen, reading, page, pageT, doze,
           pot: D.pot || 0, pourBarry, pourNom, holdOut, waveN, waveB, waveT, dt };
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
const BEAR_BEND = 0.5, BEAR_BEND_AT = new THREE.Vector3(0, 0.05, 0.85);   // Barry bends forward from his feet
const NOM_BEND = 0.38, NOM_BEND_AT = new THREE.Vector3(0, 0.02, 0.4);
const _pv = new THREE.Vector3(), _mq = new THREE.Quaternion(), _aq = new THREE.Quaternion(), _hq = new THREE.Quaternion();
/** Rotate/scale a body about a point (its feet) instead of its origin. */
function pivotAbout(obj, p) {
  _pv.copy(p).multiply(obj.scale).applyEuler(obj.rotation);
  obj.position.set(p.x - _pv.x, p.y - _pv.y, p.z - _pv.z);
}
/** A mug in the hands (hold), or set on its spot on the floor (k = 1). On the way, it rides down
 *  with the hands as they bend over, and lets go at the bottom. */
function placeMug(mug, arms, hold, floorSpot, k) {
  arms.updateMatrixWorld(true);
  floorSpot.getWorldPosition(_pv); arms.worldToLocal(_pv);              // the floor spot, seen from the hands
  floorSpot.getWorldQuaternion(_mq); arms.getWorldQuaternion(_aq); _mq.premultiply(_aq.invert());   // upright on the floor
  const g = k < 0.5 ? smooth(k * 2) : 1;                                // reaches the floor at the bottom of the bend
  mug.position.set(hold[0] + (_pv.x - hold[0]) * g, hold[1] + (_pv.y - hold[1]) * g, hold[2] + (_pv.z - hold[2]) * g);
  _hq.setFromEuler(mug.rotation);
  mug.quaternion.copy(_hq.slerp(_mq, g));
}

function pose(t) {
  const W = direct(t); window.__W = W;          // what the director says is happening
  const zz = smooth((W.sleep - 0.45) / 0.55);  // eyes closed / leaning: second half of falling asleep
  const bearDown = W.bMug, nomDown = W.nMug;   // 0 = mug in hand, 1 = on the floor (in between: bending to put it down / pick it up)
  // Bear: breathes; sips now and then; on birthdays he raises his mug for a toast.
  let bs = params.has('preview') ? sip(t, 9, 4.8) : sipAt(t, BEAR_SIPS);
  bs = Math.max(bs * (1 - bearDown), W.cheer * 0.6, W.toastRaise * 0.8, W.bookOut * 0.35);   // holds the book up a little
  const breath = 1 + (0.012 + 0.014 * zz) * Math.sin(t * (1.6 - 0.8 * zz));   // slower, deeper breaths when asleep
  const tall = 1 + 0.045 * W.stretch;          // stretching up tall
  const bSquash = 1 - 0.09 * Math.sin(Math.PI * W.bMug);   // squashes down a little as he bends over
  bearBody.scale.set((1 + (breath - 1) * 0.5) / Math.sqrt(tall) / Math.sqrt(bSquash), breath * tall * bSquash, 1);
  bearBody.rotation.x = 0.07 * zz - 0.09 * W.stretch + BEAR_BEND * Math.sin(Math.PI * bearDown) ;   // nods asleep, leans back to stretch, bends to reach the floor
  bearBody.rotation.z = -0.025 * zz + 0.05 * W.toastTurn + 0.03 * Math.sin(t * 5) * W.stretch * (1 - W.stretch);
  if (!params.has('solo')) bear.rotation.y = -0.2 - 0.14 * W.toastTurn;    // turns towards Nom for a toast
  pivotAbout(bearBody, BEAR_BEND_AT);
  bearArms.rotation.x = -BEAR_ARM_LIFT * bs;
  bearPoses.show(bs);
  if (W.stretch > 0.06) {                       // arms up in a big Y
    bearPoses.meshes.forEach(m => (m.visible = false));
    bearStretch.showExtra(Math.min(BEAR_STRETCH.length - 1, Math.round(W.stretch * BEAR_STRETCH.length - 0.5)));
  } else bearStretch.meshes.forEach(m => (m.visible = false));
  if (W.waveB > 0.06 && W.stretch <= 0.06) {          // waving hello
    bearPoses.meshes.forEach(m => (m.visible = false));
    bearWave.showExtra(Math.floor(W.waveT * 4) % 2);
  } else bearWave.meshes.forEach(m => (m.visible = false));
  bearMug.rotation.set((MUG_TILT + BEAR_ARM_LIFT * bs - (0.5 + MUG_TILT) * smooth((bs - 0.6) / 0.4)), 0, 0);
  // for a refill, Barry sets his mug down by Nom (and it stays there until he picks it up again)
  if (W.pot > 0 || W.pourBarry > 0) D.bSide = 1; else if (bearDown < 0.02) D.bSide = 0;
  bearFloor.position.set(...lerp3([0, 0.24, 1.55], [-0.48, 0.24, 1.68], D.bSide || 0));
  placeMug(bearMug, bearArms, BEAR_MUG_HOLD, bearFloor, bearDown);
  // reading aloud: little mouth movements in bursts, like words
  const talk = W.reading && W.pageT > 0.9 && W.pageT < 4.4 ? Math.max(0, Math.sin(t * 11)) * (0.5 + 0.5 * Math.sin(t * 2.3)) : 0;
  // coffee level: goes down a little with every sip, back up when Nom pours
  D.bLevel = Math.min(1, Math.max(0.22, (D.bLevel ?? 1) - (bs > 0.9 && W.toastRaise === 0 ? W.dt * 0.05 : 0) + (W.pourBarry > 0.6 ? W.dt * 0.4 : 0)));
  bearMug.userData.setLevel(D.bLevel);
  bearYawn.visible = W.yawn > 0.05 || talk > 0.15; bearMouthLine.visible = !bearYawn.visible;
  const mo = Math.max(W.yawn, 0.32 * talk);
  bearYawn.scale.set(0.075 * (0.6 + 0.4 * mo), 0.1 * mo, 0.04);

  // the book: appears from his lap, opens, and turns its pages
  book.visible = W.bookOut > 0.01;
  if (book.visible) {
    book.scale.setScalar(0.3 + 0.7 * W.bookOut);
    book.rotation.x = BEAR_ARM_LIFT * bs - 0.15;           // kept upright while his arms lift
    const o = W.bookOpen;
    bookL.rotation.y = 0.22 * o; bookR.rotation.y = -0.22 * o - Math.PI * (1 - o);   // closed = right half folded over
    const k = W.page * 2;
    bookL.userData.face.material.map = PAGES[(k + 1) % PAGES.length];
    bookR.userData.face.material.map = PAGES[(k + 2) % PAGES.length];
    const ft = W.reading ? smooth((W.pageT - 4.2) / 0.7) : 0;              // the last 0.8 s of each page: turn it
    flip.visible = ft > 0 && ft < 1;
    flip.rotation.y = -0.22 - (Math.PI - 0.44) * ft;
    flipFront.material.map = PAGES[(k + 2) % PAGES.length]; flipBack.material.map = PAGES[(k + 3) % PAGES.length];
    if (ft >= 1 - 1e-6) bookR.userData.face.material.map = PAGES[(k + 4) % PAGES.length];
    for (const m of [bookL.userData.face.material, bookR.userData.face.material, flipFront.material, flipBack.material]) m.needsUpdate = true;
  }
  // a speech bubble with the picture he's describing
  const bub = W.reading ? smooth(Math.min((W.pageT - 0.9) / 0.4, (4.3 - W.pageT) / 0.4)) : 0;
  bubble.visible = bub > 0.01;
  if (bubble.visible) {
    bubble.material.map = BUBBLES[(W.page + 1) % BUBBLES.length];
    bubble.position.set(-1.25, 2.5, 1.0);               // in the space above Nom, its tail pointing at Barry
    const sz = 0.7 * (0.7 + 0.3 * bub); bubble.scale.set(sz, sz, sz); bubble.material.opacity = bub;
  }
  const happy = (bs > 0.5 && W.cheer < 0.5 && W.bookOut < 0.5 && W.holdOut < 0.5) || W.waveB > 0.5 || W.party > 0.5 || W.thanks > 0.5 || W.yawn > 0.3 || W.stretch > 0.5;
  const sleepy = !happy && (zz > 0.5 || blinking(t, 4.7, 1));
  bearEyes.forEach((e, i) => {
    e.visible = !happy && !sleepy;
    // his eyes follow your pointer too (a small shift on his face)
    let ox = 0, oy = 0;
    if (watchingMouse() && W.sleep < 0.3 && e.visible) {
      camera.updateMatrixWorld(); bearBody.updateMatrixWorld(true);
      bearBody.localToWorld(_eyePos.set((i ? 1 : -1) * EYE.x, EYE.y, fz(EYE.x, EYE.y))).project(camera);
      const ex = (_eyePos.x + 1) / 2 * window.innerWidth, ey = (1 - _eyePos.y) / 2 * window.innerHeight;
      const dx = mouse.x - ex, dy = -(mouse.y - ey), d = Math.hypot(dx, dy) || 1, m = 0.035 * Math.min(1, d / 120);
      ox = dx / d * m; oy = dy / d * m;
    }
    const x = (i ? 1 : -1) * EYE.x + ox, y = EYE.y + oy;
    e.position.set(x, y, fz(Math.abs(x), y));
  });
  bearHappy.forEach(e => (e.visible = happy));
  bearSleepy.forEach(e => (e.visible = sleepy));
  updateSteam(t, (1 - bs) * (1 - bearDown) * (1 + 0.8 * W.holdOut));
  bearHat.visible = alienHat.visible = W.hats;
  // Halloween week: the jack-o'-lantern (lit after dark); bats flit about on the 31st
  const now = new Date(), mon = now.getMonth(), day = now.getDate(), hr = now.getHours();
  const halloween = params.has('halloween') || (mon === 9 && day >= 24);
  pumpkin.visible = halloween;
  if (halloween) {
    const lit = params.has('night') || hr >= 18 || hr < 6;
    const flick = lit ? 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3) : 0;
    pumpkinFace.forEach(f => (f.material = lit ? pumpkinGlow : pumpkinDark));
    pumpkin.userData.glow.material.opacity = 0.55 * flick;
  }
  const batsOut = params.has('halloween') || (mon === 9 && day === 31);
  bats.forEach((b, i) => {
    const cyc = (t * 0.07 + i * 0.5) % 1;                       // a pass every ~14 s, then gone for a while
    b.visible = batsOut && cyc < 0.35;
    if (!b.visible) return;
    const u = cyc / 0.35;
    b.position.set(-2.4 + u * 4.6, 2.3 + 0.35 * Math.sin(u * 9 + i) + i * 0.25, 0.9 + 0.3 * i);
    const flap = Math.sin(t * 22 + i) * 0.7;
    b.userData[-1].rotation.y = flap; b.userData[1].rotation.y = -flap;
  });
  updateConfetti(W.bdayT);
  bearBody.updateMatrixWorld(true); alienBody.updateMatrixWorld(true);
  updateZs(bearZs, bearBody.localToWorld(_zp.set(0.8, 2.05, 0.6)), t, zz, 0.95);
  updateZs(alienZs, alienBody.localToWorld(_zp.set(0.3, 1.45, 0.3)), t + 1.7, Math.max(zz, smooth((W.doze - 0.6) / 0.4)), 0.75);

  // Alien: sways, hops every 5 s, drinks every 7 s, blinks, glances over at the bear.
  let us = params.has('preview') ? sip(t, 7, 6.3) : sipAt(t, ALIEN_SIPS);
  us = Math.max(us * (1 - nomDown), W.cheer * 0.7, W.toastRaise * 0.85, 0.5 * Math.max(W.pourBarry, W.pourNom));   // lifts the pot a little to pour
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
  if (W.sleep > 0.05 || W.nomYawn > 0 || W.croc > 0 || W.toastTurn > 0 || W.bookOut > 0 || W.pot > 0 || W.waveN > 0) mood = null;
  const cuddle = W.croc > 0.95 && W.sleep < 0.3 && W.bookOut < 0.5;     // awake and hugging the crocodile
  const nz = Math.max(zz, W.doze);                   // asleep, or dozing off during the story
  if (W.party > 0.3 || W.thanks > 0.3) { mood = 'giggle'; moodT = (W.thanks > 0.3 ? t : W.bdayT) % 3.6; }   // giggly on birthdays
  const ease = mood ? smooth(Math.min(moodT / 0.4, (3.6 - moodT) / 0.4)) : 0;   // fade in and out

  const hp = t % 5;
  const hopping = false;   // the little hop is switched off
  alien.position.y = (hopping ? Math.sin(Math.PI * hp / 0.45) * 0.12 : 0) + 0.16 * W.pourBarry;   // up on tiptoes to reach Barry's mug
  if (mood === 'giggle') alien.position.y += Math.abs(Math.sin(moodT * 16)) * 0.035 * ease;   // little giggly bounce
  let tilt = params.has('rest') ? 0 : 0.035 * Math.sin(t * 1.3);
  if (mood === 'curious') tilt += 0.14 * ease;                  // head tilt
  if (mood === 'sleepy') tilt += 0.07 * ease * Math.sin(moodT * 1.2);   // slow, dozy sway
  if (cuddle) tilt += 0.09 * Math.sin(t * 2.2);              // rocking the crocodile side to side
  tilt -= 0.07 * W.toastTurn + 0.12 * W.pourBarry;            // leans in for a toast, or to pour for Barry
  if (W.waveN > 0) tilt += 0.05 * Math.sin(W.waveT * 12.5) * W.waveN;   // wiggles as it waves
  alienBody.rotation.z = tilt * (1 - nz) - 0.17 * nz;   // asleep: leans over onto Barry
  if (!params.has('soloalien')) alien.rotation.y = 0.3 * W.toastTurn;
  const nomTall = 1 + 0.06 * W.nomYawn;
  const nSquash = 1 - 0.09 * Math.sin(Math.PI * W.nMug);
  alienBody.scale.set(1 / Math.sqrt(nomTall * nSquash), nomTall * nSquash, 1);
  if (D.alienX === undefined) D.alienX = alien.position.x;
  alien.position.x = D.alienX + 0.06 * nz;
  // bending down for the mug, and turning round to fetch Greg from behind (or put him back)
  const reach = Math.sin(Math.PI * smooth(Math.max(W.croc, W.pot)));
  alienBody.rotation.x = NOM_BEND * Math.sin(Math.PI * nomDown) + 0.12 * reach;
  alienBody.rotation.y = -1.25 * reach;
  pivotAbout(alienBody, NOM_BEND_AT);
  alienArms.rotation.x = -ALIEN_ARM_LIFT * us;
  alienPoses.show(us);
  if (W.nomStretch > 0.06) {                    // arms up for a big yawn
    alienPoses.meshes.forEach(m => (m.visible = false));
    nomStretch.showExtra(Math.min(NOM_STRETCH.length - 1, Math.round(W.nomStretch * NOM_STRETCH.length - 0.5)));
  } else nomStretch.meshes.forEach(m => (m.visible = false));
  if (W.waveN > 0.06 && W.nomStretch <= 0.06) {        // waving hello
    alienPoses.meshes.forEach(m => (m.visible = false));
    nomWave.showExtra(Math.floor(W.waveT * 4) % 2);
  } else nomWave.meshes.forEach(m => (m.visible = false));
  alienMug.rotation.set((MUG_TILT + ALIEN_ARM_LIFT * us - (0.4 + MUG_TILT) * smooth((us - 0.6) / 0.4)), 0, 0);
  nomFloor.position.set(...lerp3(NOM_FLOOR, NOM_SIDE, smooth(Math.max(W.croc * 3, D.crocSide || 0))));
  D.crocSide = W.croc > 0 ? 1 : (nomDown < 0.5 ? 0 : (D.crocSide || 0));   // mug stays to the side until picked up
  // the coffee pot, held in Nom's paws (brought out from behind, like Greg); Nom leans and shuffles
  // so the spout is right over the mug it's filling
  pot.visible = W.pot > 0.5;
  if (pot.visible) {
    const toNom = smooth(W.pourNom);                          // spout turned to the front for its own mug
    pot.rotation.set(0, -Math.PI / 2 * toNom, -1.0 * Math.max(W.pourBarry, W.pourNom));
    const aim = (mug, k, up) => {
      if (k <= 0) return;
      alien.updateMatrixWorld(true); bear.updateMatrixWorld(true);
      const target = mug === bearMug ? bearFloor : nomFloor;     // where that mug is sitting on the floor
      target.getWorldPosition(_s2); _s2.y += 0.24 + up;
      pot.userData.tip.getWorldPosition(_s1);
      alien.worldToLocal(_s2); alien.worldToLocal(_s1);
      alienBody.position.addScaledVector(_s2.sub(_s1), smooth(k));
    };
    aim(bearMug, W.pourBarry, 0.16);
    aim(alienMug, W.pourNom, 0.12);
  }
  alienBody.updateMatrixWorld(true);
  placeMug(alienMug, alienArms, ALIEN_MUG_HOLD, nomFloor, nomDown);

  D.nLevel = Math.min(1, Math.max(0.22, (D.nLevel ?? 1) - (us > 0.9 && W.toastRaise === 0 ? W.dt * 0.06 : 0) + (W.pourNom > 0.6 ? W.dt * 0.4 : 0)));
  alienMug.userData.setLevel(D.nLevel);
  stream.visible = false;
  if (pot.visible) {
    alienBody.updateMatrixWorld(true); bear.updateMatrixWorld(true);
    if (W.pourBarry > 0.6) pourStream(pot.userData.tip, bearMug.userData.top, t);
    if (W.pourNom > 0.6) pourStream(pot.userData.tip, alienMug.userData.top, t);
  }

  // Greg: Nom turns round, picks him up from behind and turns back hugging him (and the reverse to put him away)
  croc.visible = W.croc > 0.001 || params.has('greg');
  if (croc.visible && !params.has('greg')) {
    const k = smooth(Math.min(1, W.croc * 2));        // in Nom's arms by half-way, while Nom is turned round
    croc.position.set(...lerp3(CROC_AWAY.p, CROC_HUG.p, k)); croc.position.y += Math.sin(Math.PI * k) * 0.15;
    croc.rotation.set(...lerp3(CROC_AWAY.r, CROC_HUG.r, k));
    const sq = cuddle ? 1 - 0.05 * Math.max(0, Math.sin(t * 4.4)) : 1;   // a squeeze now and then
    croc.scale.set(CROC_SCALE * sq, CROC_SCALE / sq, CROC_SCALE);
  }

  // clink!
  if (W.clink > 0) {
    bearMug.userData.top.getWorldPosition(_zp); const bx = _zp.x, by = _zp.y, bz = _zp.z;
    alienMug.userData.top.getWorldPosition(_zp);
    const mx = (bx + _zp.x) / 2, my = (by + _zp.y) / 2 + 0.05, mz = Math.max(bz, _zp.z) + 0.1;
    sparks.forEach((sp, i) => {
      sp.visible = true;
      const sz = (i === 0 ? 0.42 : 0.18) * smooth(W.clink * 1.5);
      sp.scale.set(sz, sz, sz);
      sp.position.set(mx + (i === 0 ? 0 : (i === 1 ? -0.28 : 0.3)), my + (i === 0 ? 0 : 0.22 + i * 0.05), mz);
      sp.material.rotation = i * 0.6 + W.clink;
      sp.material.opacity = Math.min(1, W.clink * 2);
    });
  } else sparks.forEach(sp => (sp.visible = false));

  // eyes
  const blink = blinking(t, 3.9, 0.5);
  const gp = t % 13, glance = !params.has('rest') && !mood && gp > 5 && gp < 7;
  const sipping = us > 0.5;
  const mmm = params.get('expr') === 'content' || (!mood && afterSip && sinceSip < 4.8);   // eyes stay happily closed just after a sip
  const happyEyes = nz < 0.5 && (W.waveN > 0.3 || W.pourBarry > 0.5 || (sipping && W.cheer < 0.5) || mmm || mood === 'giggle' || cuddle || W.nomYawn > 0.3 || W.clink > 0.2);
  const sleepyEyes = nz > 0.5 || mood === 'sleepy' || (blink && !happyEyes);
  const wide = mood === 'curious' ? 1 + 0.15 * ease : 1;
  alienEyes.forEach(({ white, pupil, s, sleepy, happy }) => {
    white.visible = pupil.visible = !happyEyes && !sleepyEyes;
    happy.visible = happyEyes;
    sleepy.visible = sleepyEyes && !happyEyes;
    white.scale.set(EYE_R * wide, EYE_R * wide, 0.055);
    if (W.bookOut > 0.5) placePupil(pupil, 0.08, -0.03);                      // looking at the pictures in the book
    else if (W.pourNom > 0.3) placePupil(pupil, 0, -0.1);                      // watching its own mug fill up
    else if (watchingMouse() && W.sleep < 0.3) lookAtMouse(white, pupil);          // following your mouse pointer
    else if (mood === 'curious') placePupil(pupil, 0, 0.05);  // looking straight up, wondering
    else if (glance) placePupil(pupil, 0.09, 0.04);
    else placePupil(pupil, -s * 0.06, 0.035);                 // a bright, slightly upward gaze
  });

  // mouth: closed while drinking and for a while after, a small "o" when curious, a smile when giggly or sleepy
  mouthO.scale.set(0.045 * (1 + 0.6 * W.nomYawn), 0.055 * (1 + 1.3 * W.nomYawn), 0.02);
  if (W.nomYawn > 0.05) setMouth('o');                       // a big yawn
  else if (nz > 0.3 || cuddle || W.bookOut > 0.5) setMouth('smile');
  else if (mood === 'curious') setMouth('o');
  else if (mood === 'giggle' || mood === 'sleepy' || afterSip || us > 0.3 || params.get('expr') === 'content') setMouth('smile');
  else setMouth('open');
}

// ?solo&turn=<degrees> shows the bear on his own, turned, for checking him against the turnaround sheet
if (params.has('soloalien')) { bear.visible = false; alien.position.set(-0.45, 0, 0); alien.scale.setScalar(1.2); alien.rotation.y = THREE.MathUtils.degToRad(+params.get('turn') || 0); if (params.has('nomug')) alienMug.visible = false; }
if (params.has('greg')) { bear.visible = false; alien.visible = false; scene.add(croc); croc.position.set(-0.4, 1.0, 0.8); croc.scale.setScalar(1.75); croc.rotation.y = -0.3; }   // Greg on his own
if (params.has('solo')) { if (params.has('nomug')) bearMug.visible = false; alien.visible = false; bear.position.x = -0.45; bear.rotation.y = THREE.MathUtils.degToRad(+params.get('turn') || 0); }
const outline = STYLE === 'toon' ? new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.16, 0.11, 0.08] }) : null;
function renderAt(t) { pose(t); (outline || renderer).render(scene, camera); }
window.renderAt = renderAt;
window.__params = params;   // (for test stills)
window.__pose = pose; window.__D = D;       // (for stepping through time in tests without drawing)

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
