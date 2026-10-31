// Dock Buddies 3D — plush bear and bunny, measured from the reference renders, with tufted shell fur.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CHATS, SURPRISES, BOOS } from './chats.js';
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
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });   // (test stills read the canvas straight after renderAt, so no need to keep the buffer)
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
  if (window.__WEB) {
    // the web app fills a whole screen: show the dock window's view (half-height t, aspect DOCK) with room above
    // for the chat bubbles (the Mac app draws those above its window), and on a tall phone, more space around it
    const t = Math.tan(THREE.MathUtils.degToRad(7)), DOCK = 460 / 340, a = w / h;
    const H = Math.max(2.6 * t, 2 * t * DOCK / a);             // visible height, in view-tangent units
    const extra = H - 2 * t, below = Math.max(0, extra - 0.6 * t) * 0.4, above = extra - below;
    const half = t + above;                                      // a symmetric frustum tall enough, cropped to its upper part
    camera.fov = 2 * Math.atan(half) * 180 / Math.PI;
    camera.aspect = w / (h * 2 * half / H);
    camera.setViewOffset(w, h * 2 * half / H, 0, 0, w, h);
  }
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
  key.shadow.mapSize.set(512, 512);                           // plenty for a shadow this soft (2048 looked the same and drew 16x the pixels every frame)
  key.shadow.radius = 3.5; key.shadow.blurSamples = 8;         // the same blur width as at 2048 with radius 14
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
  if (STYLE !== 'plush') { const t = new THREE.MeshToonMaterial({ color, vertexColors, gradientMap: TOON_BANDS[STYLE] }); t.userData.plush = true; return t; }
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
  m.userData.plush = true;
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
            mouth: new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.85 }),
            glass: new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
            iced: gloss(0xb57a48, 0.08),
            ice: new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.8 }),
            straw: new THREE.MeshToonMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d');
              for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#ff5f7e'; x.fillRect(0, i * 8, 8, 8); } return new THREE.CanvasTexture(c); })() }),
            lemon: new THREE.MeshToonMaterial({ color: 0xffe14d }) };
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
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M.ceramic); g.add(body);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 48), M.coffee);
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = h / 2 - 0.055;
  g.add(coffee);
  // how full it is (1 = full): the coffee sinks as they drink, and rises again with a refill
  // hot days: the same mug becomes a glass of iced coffee with ice cubes, a straw and a lemon wheel
  const iced = new THREE.Group(); iced.visible = false; g.add(iced);
  const gp = [[0, -h / 2], [r * 0.86, -h / 2], [r * 0.9, -h / 2 + 0.02], [r * 1.0, h / 2], [r * 0.95, h / 2],
              [r * 0.86, -h / 2 + 0.06], [0, -h / 2 + 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(gp, 48), M.glass); glass.renderOrder = 2; iced.add(glass);
  const drinkGeo = new THREE.CylinderGeometry(r * 0.9, r * 0.84, 1, 40); drinkGeo.translate(0, 0.5, 0);
  const drink = new THREE.Mesh(drinkGeo, M.iced); drink.position.y = -h / 2 + 0.06; iced.add(drink);
  const ice = new THREE.Group(); iced.add(ice);
  for (const [x, z, a] of [[-0.3, 0.25, 0.4], [0.32, 0.1, 1.1], [0.0, -0.32, 2.0]]) {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(r * 0.46, r * 0.4, r * 0.46), M.ice);
    cube.position.set(x * r, 0, z * r); cube.rotation.set(0.3, a, 0.2); ice.add(cube);
  }
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.075, r * 0.075, h * 1.05, 12), M.straw);
  straw.position.set(-r * 0.42, h * 0.3, r * 0.1); straw.rotation.set(0.15, 0, 0.32); iced.add(straw);
  const lemon = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, r * 0.1, 24), M.lemon);
  lemon.rotation.set(Math.PI / 2, 0, 0.5); lemon.position.set(r * 0.72, h / 2 - r * 0.05, r * 0.35); iced.add(lemon);
  g.userData.setCold = (on) => { body.visible = coffee.visible = handle.visible = !on; iced.visible = on; };
  // Captain's Day: a fine china teacup and saucer of Earl Grey instead
  const teacup = new THREE.Group(); teacup.visible = false; g.add(teacup);
  const china = gloss(0xfbf8f2, 0.18), goldTrim = gloss(0xd9b04a, 0.25);
  const cp = [[0, -h * 0.12], [r * 0.5, -h * 0.12], [r * 0.56, -h * 0.08], [r * 0.85, h * 0.08], [r * 1.12, h * 0.3], [r * 1.08, h * 0.31],
              [r * 0.82, h * 0.1], [r * 0.5, -h * 0.06], [0, -h * 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
  teacup.add(new THREE.Mesh(new THREE.LatheGeometry(cp, 48), china));
  const cupRim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.03, 8, 48), goldTrim); cupRim.rotation.x = Math.PI / 2; cupRim.position.y = h * 0.305; teacup.add(cupRim);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 0.9, h * 0.06, 48), china); saucer.position.y = -h * 0.15; teacup.add(saucer);
  const saucerRim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.49, r * 0.025, 8, 48), goldTrim); saucerRim.rotation.x = Math.PI / 2; saucerRim.position.y = -h * 0.12; teacup.add(saucerRim);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(1, 40), gloss(0x9a5a22, 0.05)); tea.rotation.x = -Math.PI / 2; teacup.add(tea);
  const cupHandle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.1, r * 0.06, 10, 24, Math.PI * 1.4), china);
  cupHandle.rotation.z = -Math.PI * 0.7; cupHandle.position.set(r * 1.1, h * 0.12, 0); teacup.add(cupHandle);
  g.userData.setTea = (on) => { if (!on) { teacup.visible = false; return; } body.visible = coffee.visible = handle.visible = iced.visible = marsh.visible = false; teacup.visible = true; };
  g.userData.teaLevel = (k) => { const y = -h * 0.06 + (h * 0.33) * Math.max(0.08, k); tea.position.y = y; tea.scale.setScalar(r * (0.5 + 0.58 * Math.max(0.08, k))); };
  g.userData.setLevel = (k) => {
    g.userData.teaLevel(k);
    coffee.position.y = (-h / 2 + 0.05) + (h - 0.105) * k; coffee.scale.setScalar(0.97 + 0.03 * k);
    drink.scale.y = 0.01 + (h - 0.11) * k; ice.position.y = -h / 2 + 0.06 + (h - 0.11) * Math.max(k, 0.25) - r * 0.12;
  };
  const marsh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.24, r * 0.22, 16), new THREE.MeshToonMaterial({ color: 0xfff6ea, gradientMap: TOON_BANDS.cel }));
  marsh.rotation.x = Math.PI / 2; marsh.position.set(r * 0.25, -r * 0.1, r * 0.06); coffee.add(marsh);   // floats on the cocoa
  marsh.visible = false; g.userData.marsh = marsh;
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
// tapping bongos: one paw lifted at a time
const BEAR_TAP = [-1, 1].map(only => ({ lift: 0.3, sx: 0.9, only }));
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
  var makeBearTap = () => S.poses(0, BEAR_PIVOT, bearBuild, bearMat, bearBody, 0, BEAR_TAP);
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
// strumming the ukulele: the arm nearest Barry swings down and up
const NOM_STRUM = [0.05, 0.4].map(lift => ({ lift, sx: 0.5, only: 1 }));
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
  var makeNomStrum = () => S.poses(0, ALI_PIVOT, alienBuild, alienMat, alienBody, 0, NOM_STRUM);
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
const nomStrum = makeNomStrum(), bearTap = makeBearTap();   // playing in the band (sculpted last)
nomStrum.meshes.forEach(m => (m.visible = false)); bearTap.meshes.forEach(m => (m.visible = false));

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
// =====================================================================
// Movie night: a little TV on the floor at the front right, facing them; popcorn in Barry's arms
// =====================================================================
const tv = new THREE.Group(); scene.add(tv);
tv.position.set(1.3, 0, 1.95); tv.rotation.y = -1.3;     // turned towards the two of them (we see the screen side-on)
const tvScreenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
{
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.46, 0.4, 3, 0.07), new THREE.MeshToonMaterial({ color: 0x7fb7a6, gradientMap: TOON_BANDS.cel }));
  shell.position.y = 0.33; tv.add(shell);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), tvScreenMat); scr.position.set(-0.03, 0.34, 0.202); tv.add(scr);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.black); knob.position.set(0.25, 0.4, 0.2); tv.add(knob);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.12, 8), M.black); leg.position.set(s * 0.22, 0.06, 0); tv.add(leg);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), M.black);
    ant.position.set(s * 0.07, 0.68, 0); ant.rotation.z = -s * 0.5; tv.add(ant);
  }
}
const tvGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexEarly(), transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
tvGlow.position.set(-0.03, 0.36, 0.35); tvGlow.scale.set(1.1, 0.8, 1); tv.add(tvGlow);
const tvLight = new THREE.PointLight(0x88aaff, 0, 5, 1.2); tvLight.position.set(0, 0.5, 0.6); tv.add(tvLight);
tv.visible = false;

const popcorn = new THREE.Group(); bearArms.add(popcorn);
popcorn.position.set(...BA([0, 1.0, 1.28]));
{
  const prof = [[0, -0.1], [0.2, -0.1], [0.27, 0.0], [0.3, 0.1], [0.28, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8473c'; g.fillRect(i * 8, 0, 8, 8); }
  const stripes = new THREE.CanvasTexture(c); stripes.colorSpace = THREE.SRGBColorSpace; stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.x = 3;
  popcorn.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshToonMaterial({ map: stripes, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide })));
  const kernelMat = new THREE.MeshToonMaterial({ color: 0xfff1c2, gradientMap: TOON_BANDS.cel });
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 0.2 * Math.sqrt((i + 0.5) / 22);
    const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), kernelMat);
    k.position.set(Math.cos(a) * r, 0.1 + 0.07 * (1 - r / 0.2), Math.sin(a) * r); k.rotation.set(i, i * 2, 0); popcorn.add(k);
  }
}
popcorn.visible = false;
const flyKernel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshToonMaterial({ color: 0xfff1c2, gradientMap: TOON_BANDS.cel }));
flyKernel.visible = false; scene.add(flyKernel);

// =====================================================================
// Jamming along to music: a tambourine for Barry, maracas for Nom, and notes floating up
// =====================================================================
const gold = new THREE.MeshToonMaterial({ color: 0xe3a33d, gradientMap: TOON_BANDS.cel });
const tambourine = new THREE.Group(); bearArms.add(tambourine);
tambourine.position.set(...BA([0, 1.1, 1.3]));
{
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32, 1, true), new THREE.MeshToonMaterial({ color: 0xb5562f, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; tambourine.add(ring);
  const skin = new THREE.Mesh(new THREE.CircleGeometry(0.255, 32), new THREE.MeshToonMaterial({ color: 0xf6ead2, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide }));
  skin.position.z = -0.03; tambourine.add(skin);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, j = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), gold);
    j.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.02); j.rotation.x = Math.PI / 2; tambourine.add(j);
  }
}
tambourine.visible = false;
const maracas = [-1, 1].map(s => {
  const g = new THREE.Group(); alienArms.add(g);
  g.position.set(...UA([s * 0.3, 0.5, 0.5]));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), new THREE.MeshToonMaterial({ color: s < 0 ? 0x5cc6c9 : 0xffd34d, gradientMap: TOON_BANDS.cel }));
  head.position.y = 0.17; head.scale.set(1, 1.15, 1); g.add(head);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 24), new THREE.MeshToonMaterial({ color: 0xff6b9a, gradientMap: TOON_BANDS.cel }));
  band.position.y = 0.17; band.rotation.x = Math.PI / 2; g.add(band);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.16, 10), new THREE.MeshToonMaterial({ color: 0x9a6338, gradientMap: TOON_BANDS.cel }));
  handle.position.y = 0.04; g.add(handle);
  g.rotation.z = -s * 0.25; g.visible = false; return g;
});
const wood = new THREE.MeshToonMaterial({ color: 0xb5733f, gradientMap: TOON_BANDS.cel });
const drumSkin = new THREE.MeshToonMaterial({ color: 0xf6ead2, gradientMap: TOON_BANDS.cel });
const bongos = new THREE.Group(); bearBody.add(bongos);
bongos.position.set(0, 0.84, 1.3); bongos.rotation.x = 0.3;
for (const [x, r] of [[-0.4, 0.17], [0.4, 0.14]]) {          // a big one and a little one, under his paws
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.26, 28), wood); shell.position.x = x; bongos.add(shell);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 28), drumSkin); top.rotation.x = -Math.PI / 2; top.position.set(x, 0.131, 0); bongos.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 28), gold); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.12, 0); bongos.add(rim);
}
{ const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), wood); bongos.add(bridge); }
bongos.visible = false;
const uke = new THREE.Group(); alienBody.add(uke);
uke.position.set(0.2, 0.52, 0.62); uke.rotation.set(0, 0, -0.45);   // body by its strumming paw, neck rising to the left
{
  const bodyMat = new THREE.MeshToonMaterial({ color: 0xd08a4a, gradientMap: TOON_BANDS.cel });
  for (const [x, r] of [[0, 0.15], [-0.17, 0.115]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), bodyMat); b.position.x = x; b.scale.z = 0.32; uke.add(b); }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), M.black); hole.position.set(-0.08, 0.0, 0.05); uke.add(hole);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.03), new THREE.MeshToonMaterial({ color: 0x7a4a2e, gradientMap: TOON_BANDS.cel }));
  neck.position.set(-0.45, 0, 0.02); uke.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.035), neck.material); head.position.set(-0.67, 0.0, 0.02); head.rotation.z = 0.15; uke.add(head);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.015), neck.material); bridge.position.set(0.07, 0, 0.05); uke.add(bridge);
  const strMat = new THREE.MeshBasicMaterial({ color: 0xf3ecdc });
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.004, 0.004), strMat); st.position.set(-0.3, -0.018 + i * 0.012, 0.058); uke.add(st); }
}
uke.visible = false;
const noteTex = ['♪', '♫'].map(ch => {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.font = 'bold 78px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.strokeText(ch, 48, 52); g.fillStyle = '#7a4fc9'; g.fillText(ch, 48, 52);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
});
const notes = Array.from({ length: 6 }, (_, i) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex[i % 2], transparent: true, depthWrite: false, toneMapped: false }));
  sp.visible = false; sp.userData = { born: -1e9, x: 0 }; scene.add(sp); return sp;
});

// =====================================================================
// Little extras: a lamp after dark, hearts when patted, weather things, the festive season
// =====================================================================
const lamp = new THREE.Group(); scene.add(lamp); lamp.position.set(-2.62, 0, 0.35);
const lampShade = new THREE.MeshBasicMaterial({ color: 0xffe2a8, side: THREE.DoubleSide });
{
  const dark = new THREE.MeshToonMaterial({ color: 0x5a4636, gradientMap: TOON_BANDS.cel });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 24), dark); base.position.y = 0.025; lamp.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.9, 10), dark); pole.position.y = 0.5; lamp.add(pole);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 0.24, 28, 1, true), lampShade); shade.position.y = 0.98; lamp.add(shade);
}
const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexEarly(), color: 0xffc27a, transparent: true, depthWrite: false, toneMapped: false }));
lampGlow.position.set(0, 0.9, 0.05); lampGlow.scale.set(1.1, 1.1, 1); lamp.add(lampGlow);
const lampLight = new THREE.PointLight(0xffb066, 0, 4.5, 1.2); lampLight.position.set(0, 0.95, 0.2); lamp.add(lampLight);
lamp.visible = false;

const heartTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.translate(48, 50);
  g.fillStyle = '#ff5f8f'; g.strokeStyle = '#ffffff'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(-46, 0, -28, -38, 0, -14); g.bezierCurveTo(28, -38, 46, 0, 0, 30); g.stroke(); g.fill();
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
})();
const hearts = [0, 1, 2].map(() => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, toneMapped: false })); h.visible = false; scene.add(h); return h; });

// weather: rain behind them, sunglasses on hot days, scarves when it's cold
const rain = Array.from({ length: 46 }, (_, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.2), new THREE.MeshBasicMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.55, depthWrite: false }));
  const r = (k) => { const x = Math.sin(i * 91.7 + k * 37.1) * 43758.5453; return x - Math.floor(x); };
  m.userData = { x: -3 + r(1) * 5.1, z: -1.2 - r(2) * 0.8, speed: 2.4 + r(3) * 0.8, off: r(4) * 3.4 };
  m.rotation.z = 0.12; m.visible = false; scene.add(m); return m;
});
// sunglasses with a chunky coloured frame (so they read as glasses, not big eyes): rounded-square lenses,
// a thick rim with a heavier brow bar, a bridge and arms
const shadeLens = new THREE.MeshPhongMaterial({ color: 0x2c3c4e, shininess: 140, specular: 0x8fa4c4 });
const bearFrameMat = new THREE.MeshPhongMaterial({ color: 0xd8443a, shininess: 70, specular: 0x553333 });
const nomFrameMat = new THREE.MeshPhongMaterial({ color: 0xf3c12e, shininess: 70, specular: 0x554422 });
const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
function roundRect(w, h, rad) {
  const sh = new THREE.Shape(), x = -w / 2, y = -h / 2;
  sh.moveTo(x + rad, y); sh.lineTo(x + w - rad, y); sh.quadraticCurveTo(x + w, y, x + w, y + rad);
  sh.lineTo(x + w, y + h - rad); sh.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  sh.lineTo(x + rad, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - rad);
  sh.lineTo(x, y + rad); sh.quadraticCurveTo(x, y, x + rad, y); return sh;
}
function sunnyLens(r, frameMat) {
  const g = new THREE.Group();
  const w = r * 2.25, h = r * 1.8, t = r * 0.26;
  const outer = roundRect(w, h, r * 0.55);
  const innerW = w - 2 * t, innerH = h - t * 1.6 - t; // heavier brow at the top
  const inner = roundRect(innerW, innerH, r * 0.4);
  const holePath = new THREE.Path(inner.getPoints(12).map(p => new THREE.Vector2(p.x, p.y - t * 0.3)));
  outer.holes.push(holePath);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: r * 0.16, bevelEnabled: true, bevelThickness: r * 0.05, bevelSize: r * 0.05, bevelSegments: 2, curveSegments: 12 }), frameMat);
  frame.position.z = -r * 0.08; g.add(frame);
  const lens = new THREE.Mesh(new THREE.ShapeGeometry(inner, 12), shadeLens); lens.position.set(0, -t * 0.3, 0); g.add(lens);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.2, r * 0.8), glintMat);
  glint.position.set(-r * 0.4, 0, 0.004); glint.rotation.z = -0.6; g.add(glint);
  return g;
}
const bearSunnies = new THREE.Group(); bearBody.add(bearSunnies);
{
  const r = 0.17, y = EYE.y + 0.01;
  for (const sx of [-1, 1]) {
    const lens = sunnyLens(r, bearFrameMat);
    lens.position.set(sx * EYE.x, y, fz(EYE.x, y) + 0.06); lens.rotation.y = sx * 0.42; bearSunnies.add(lens);
    // an arm running back towards his ear
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.42), bearFrameMat);
    arm.position.set(sx * (EYE.x + 0.25), y + 0.07, fz(EYE.x, y) - 0.12); arm.rotation.y = sx * 0.55; bearSunnies.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.024, 8, 20, Math.PI), bearFrameMat);
  bridge.position.set(0, y + 0.03, fz(0, y) + 0.07); bearSunnies.add(bridge);
}
bearSunnies.visible = false;
const nomSunnies = alienEyes.map(({ white }) => {
  const lens = sunnyLens(0.19, nomFrameMat); lens.position.z = 0.07; lens.visible = false; white.parent.add(lens); return lens;
});
const nomBridge = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 20, Math.PI), nomFrameMat);
nomBridge.position.set(0, 1.14, alienFrontZ(0, 1.14) + 0.05); nomBridge.visible = false; alienBody.add(nomBridge);
function scarf(radius, tube, sx, sz, parent, y) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d8343a'; g.fillRect(i * 8, 0, 8, 8); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = THREE.RepeatWrapping; tx.repeat.x = 10;
  const mat = new THREE.MeshToonMaterial({ map: tx, gradientMap: TOON_BANDS.cel });
  const grp = new THREE.Group(); parent.add(grp); grp.position.y = y; grp.scale.set(sx, 1, sz);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 48), mat); ring.rotation.x = Math.PI / 2; grp.add(ring);
  const end = new THREE.Mesh(new RoundedBoxGeometry(tube * 2, radius * 0.7, tube * 1.2, 3, tube * 0.5), mat);
  end.position.set(-radius * 0.45, -radius * 0.3, radius * 0.9); end.rotation.z = 0.15; grp.add(end);
  grp.visible = false; return grp;
}
const bearScarf = scarf(0.98, 0.11, 1.08, 0.87, bearBody, 1.66);
const nomScarf = scarf(0.7, 0.08, 1.0, 0.52, alienBody, 0.66);

// festive: Santa hats, a little tree with twinkling lights, presents on Christmas Day, fireworks at New Year
function santaHat(r, h, parent) {
  const g = new THREE.Group();
  const red = new THREE.MeshToonMaterial({ color: 0xd8343a, gradientMap: TOON_BANDS.cel }), white = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_BANDS.cel });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 32), red); cone.position.y = h / 2; cone.rotation.z = -0.25; g.add(cone);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.24, 10, 32), white); brim.rotation.x = Math.PI / 2; g.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 16, 12), white); pom.position.set(h * 0.24, h * 0.96, 0); g.add(pom);
  g.visible = false; parent.add(g); return g;
}
const bearSanta = santaHat(0.3, 0.55, bearBody); bearSanta.position.set(-0.3, 2.48, 0.3); bearSanta.rotation.set(0.15, 0, 0.45);
const nomSanta = santaHat(0.22, 0.42, alienBody); nomSanta.position.set(0, 1.4, 0.08); nomSanta.rotation.x = 0.12;
const gregSanta = santaHat(0.09, 0.18, croc); gregSanta.position.set(0.44, 0.42, 0.02); gregSanta.rotation.z = -0.3;
// Halloween costumes (the pumpkin week): Barry is a vampire (cape with a tall red-lined collar, little fangs),
// Nom is his bat (flapping wings), and Greg gets a tiny witch's hat
const capeBlack = new THREE.MeshToonMaterial({ color: 0x1c1822, gradientMap: TOON_BANDS.cel, side: THREE.FrontSide });
const capeRed = new THREE.MeshToonMaterial({ color: 0xb3202e, gradientMap: TOON_BANDS.cel, side: THREE.BackSide });
const vampire = new THREE.Group(); bearBody.add(vampire); vampire.visible = false;
{
  const layer = (geo, y) => { for (const m of [capeBlack, capeRed]) { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; vampire.add(mesh); } };
  // the cape hangs round his back from the shoulders to the floor
  layer(new THREE.CylinderGeometry(1.0, 1.42, 1.5, 48, 1, true, Math.PI * 0.4, Math.PI * 1.2), 0.92);
  // and a tall collar behind his head that rises to two points, red inside
  const collarGeo = new THREE.CylinderGeometry(1.12, 0.95, 0.62, 64, 6, true, Math.PI * 0.5, Math.PI);
  { const pos = collarGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const a = Math.atan2(x, z);                                   // 0 = front, ±π = straight behind
      const side = Math.abs(Math.sin(a));                           // 1 at the sides, 0 at the back
      const v = (y + 0.31) / 0.62;                                  // 0 at the neck, 1 at the top edge
      pos.setY(i, -0.31 + v * (0.62 + 0.42 * Math.pow(side, 3) - 0.12 * (1 - side)));   // dips at the back, peaks at the sides
      const flare = 1 + 0.18 * v * v * side; pos.setX(i, x * flare); pos.setZ(i, z * flare);
    }
    collarGeo.computeVertexNormals(); }
  layer(collarGeo, 1.95);
  vampire.scale.set(1.04, 1, 0.88); vampire.position.z = -0.06;
  // the cape's tie round his neck with a gold clasp
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.035, 8, 64), capeBlack.clone()); tie.material.side = THREE.FrontSide;
  tie.rotation.x = Math.PI / 2; tie.position.y = 1.68; tie.scale.set(1, 0.95, 1.02); vampire.add(tie);
  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshToonMaterial({ color: 0xf2c230, gradientMap: TOON_BANDS.cel }));
  clasp.scale.z = 0.5; clasp.position.set(0, 1.66, fz(0, 1.66) / 0.88 + 0.07); vampire.add(clasp);
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshToonMaterial({ color: 0xc0182a, gradientMap: TOON_BANDS.cel }));
  gem.scale.z = 0.6; gem.position.copy(clasp.position); gem.position.z += 0.03; vampire.add(gem);
  const fangMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_BANDS.cel });
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.08, 10), fangMat);
    f.rotation.x = Math.PI; f.position.set(sx * 0.05, 1.885, (fz(0, 1.9) + 0.17) / 0.88); vampire.add(f);
  }
}
const batWings = [-1, 1].map(sx => {
  const sh = new THREE.Shape();
  // a bat wing: a long top edge out to the tip, then scallops back in along the bottom
  sh.moveTo(0, 0.12); sh.quadraticCurveTo(0.35, 0.32, 0.72, 0.2);
  sh.quadraticCurveTo(0.62, 0.05, 0.6, -0.08); sh.quadraticCurveTo(0.5, -0.02, 0.42, -0.12);
  sh.quadraticCurveTo(0.32, -0.05, 0.22, -0.16); sh.quadraticCurveTo(0.12, -0.08, 0, -0.14); sh.lineTo(0, 0.12);
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshToonMaterial({ color: 0x3b2c4d, gradientMap: TOON_BANDS.cel, side: THREE.DoubleSide }));
  wing.scale.x = sx;
  wing.rotation.z = sx * 0.45; wing.scale.multiplyScalar(1.3);
  const pivot = new THREE.Group(); pivot.position.set(sx * 0.4, 1.02, -0.28); pivot.add(wing); pivot.visible = false;
  alienBody.add(pivot); return pivot;
});
const gregWitch = new THREE.Group(); croc.add(gregWitch); gregWitch.visible = false;
{
  const hatMat = new THREE.MeshToonMaterial({ color: 0x2a2238, gradientMap: TOON_BANDS.cel });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 24), hatMat); gregWitch.add(brim);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 20), hatMat); cone.position.y = 0.12; cone.rotation.z = -0.25; gregWitch.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.087, 0.087, 0.03, 20), new THREE.MeshToonMaterial({ color: 0xff8a1f, gradientMap: TOON_BANDS.cel })); band.position.y = 0.02; gregWitch.add(band);
  gregWitch.position.set(0.37, 0.5, 0.02); gregWitch.rotation.z = -0.3; gregWitch.scale.setScalar(1.4);
}
// …and a different costume each day of Halloween week (vampires on the night itself)
const toon = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: TOON_BANDS.cel }, extra || {}));
const COSTUME_DAYS = ['vampire', 'pirate', 'vampire', 'witch', 'mummy', 'traveller', 'captain', 'vampire'];   // 24-31 Oct
function costumeToday(n) {
  if (params.has('costume')) return params.get('costume');
  if (params.has('halloween')) return 'vampire';
  return n.getMonth() === 9 && n.getDate() >= 24 ? COSTUME_DAYS[n.getDate() - 24] : null;
}
const COSTUME = { vampire: [vampire, ...batWings, gregWitch], pirate: [], witch: [], mummy: [], devil: [], ghost: [], traveller: [], captain: [] };
const wear = (name, obj, parent) => { parent.add(obj); obj.visible = false; COSTUME[name].push(obj); return obj; };
function witchHat(r, h, band) {
  const g = new THREE.Group(), hatMat = toon(0x2e2140);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.08, 32), hatMat); g.add(brim);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, h, 32), hatMat); cone.position.set(-h * 0.06, h * 0.5, 0); cone.rotation.z = 0.18; g.add(cone);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.555, r * 0.56, r * 0.18, 32), toon(band)); b.position.y = r * 0.1; g.add(b);
  return g;
}
function tricorn(r) {
  const g = new THREE.Group(), black = toon(0x1d1a20);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.72, r * 0.5, 32), black); crown.position.y = r * 0.25; g.add(crown);
  const turn = new THREE.Group(); turn.rotation.y = -Math.PI / 2; g.add(turn);    // a corner pointing forward
  const brim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.16, 10, 3), black); brim.rotation.x = Math.PI / 2; brim.position.y = r * 0.12; turn.add(brim);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.05, 8, 3), toon(0xf2c230)); trim.rotation.x = Math.PI / 2; trim.position.y = r * 0.28; turn.add(trim);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 16, 12), toon(0xffffff)); skull.scale.z = 0.5; skull.position.set(0, r * 0.3, r * 0.68); g.add(skull);
  for (const a of [-0.7, 0.7]) { const bone = new THREE.Mesh(new THREE.BoxGeometry(r * 0.38, r * 0.05, r * 0.03), toon(0xffffff)); bone.rotation.z = a; bone.position.set(0, r * 0.14, r * 0.7); g.add(bone); }
  return g;
}
function devilTail(pts, w) {
  const g = new THREE.Group(), red = toon(0xc8202c);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, w, 10), red));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 3, w * 5, 4), red); tip.scale.z = 0.35;
  const end = curve.getPoint(1), dir = curve.getTangent(1);
  tip.position.copy(end).addScaledVector(dir, w * 2); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(tip);
  return g;
}
function horn(r, h) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), toon(0xc8202c)); m.geometry.translate(0, h / 2, 0); return m; }
const bandage = toon(0xf0e8d6);
{
  // ---- pirates: a tricorn and an eye patch for Barry; a patch and a gold earring for Nom; a little tricorn for Greg
  // a proper cartoon pirate hat: a big upturned front with gold trim and a skull and crossbones
  function pirateHat(w) {
    const g = new THREE.Group(), black = toon(0x1d1a20), gold = toon(0xf2c230), white = toon(0xffffff);
    const sh = new THREE.Shape();
    sh.moveTo(-w * 0.5, 0); sh.quadraticCurveTo(0, -w * 0.07, w * 0.5, 0);
    sh.quadraticCurveTo(w * 0.6, w * 0.1, w * 0.52, w * 0.2);
    sh.quadraticCurveTo(w * 0.3, w * 0.18, w * 0.17, w * 0.34);
    sh.quadraticCurveTo(0, w * 0.46, -w * 0.17, w * 0.34);
    sh.quadraticCurveTo(-w * 0.3, w * 0.18, -w * 0.52, w * 0.2);
    sh.quadraticCurveTo(-w * 0.6, w * 0.1, -w * 0.5, 0);
    const d = w * 0.22;
    const front = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: w * 0.03, bevelSize: w * 0.025, bevelSegments: 3, curveSegments: 20 }), black);
    front.position.z = -d; g.add(front);
    // the crown behind it
    const crown = new THREE.Mesh(new THREE.SphereGeometry(w * 0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), black);
    crown.scale.set(1, 0.75, 0.8); crown.position.set(0, 0, -d - w * 0.12); g.add(crown);
    const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.5, 0.01], [-0.25, -0.03], [0, -0.04], [0.25, -0.03], [0.5, 0.01]].map(([x, y]) => new THREE.Vector3(x * w, y * w + w * 0.06, w * 0.04))), 24, w * 0.022, 8), gold);
    g.add(trim);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(w * 0.075, 20, 14), white); skull.scale.set(1, 0.95, 0.45); skull.position.set(0, w * 0.2, w * 0.035); g.add(skull);
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(w * 0.075, w * 0.05, w * 0.03, 2, w * 0.012), white); jaw.position.set(0, w * 0.135, w * 0.04); g.add(jaw);
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.CircleGeometry(w * 0.022, 12), black); eye.position.set(sx * w * 0.028, w * 0.2, w * 0.072); g.add(eye); }
    for (const a of [-0.6, 0.6]) { const bone = new THREE.Mesh(new RoundedBoxGeometry(w * 0.26, w * 0.035, w * 0.02, 2, w * 0.015), white); bone.rotation.z = a; bone.position.set(0, w * 0.17, w * 0.025); g.add(bone); }
    return g;
  }
  // a thin strap lying on a surface, through the given (x, y) points
  const strapOn = (pts, surf, r, parent) => wear('pirate', new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, surf(x, y)))), 40, r, 8), toon(0x111114)), parent);
  const hat = wear('pirate', pirateHat(1.35), bearBody); hat.position.set(0, 2.6, 0.46); hat.rotation.set(-0.12, 0, 0.06);
  const patch = wear('pirate', new THREE.Mesh(new THREE.CircleGeometry(0.115, 32), toon(0x111114)), bearBody);
  patch.position.set(EYE.x, EYE.y, fz(EYE.x, EYE.y) + 0.065); patch.rotation.y = 0.42;
  const bearSurf = (x, y) => Math.max(fz(x, y), 0.05) + 0.03;
  strapOn([[EYE.x - 0.06, EYE.y + 0.09], [0.15, 2.35], [-0.05, 2.5]], bearSurf, 0.016, bearBody);   // up across his forehead, under the hat
  strapOn([[EYE.x + 0.1, EYE.y + 0.02], [0.62, 2.2], [0.8, 2.22], [0.92, 2.25]], bearSurf, 0.016, bearBody);   // and round the side of his head
  const nomEye = alienEyes[0];   // the one away from Barry
  const npatch = new THREE.Mesh(new THREE.CircleGeometry(EYE_R * 0.92, 32), toon(0x111114)); npatch.position.z = 0.075; wear('pirate', npatch, nomEye.white.parent);
  const nomSurf = (x, y) => Math.max(alienFrontZ(x, y), 0.05) + 0.035;
  strapOn([[-0.2, 1.27], [-0.1, 1.38], [0.02, 1.47]], nomSurf, 0.014, alienBody);     // up between its ears
  strapOn([[-0.47, 1.14], [-0.58, 1.16], [-0.66, 1.18]], nomSurf, 0.014, alienBody);  // and round the side
  const ghat = wear('pirate', tricorn(0.13), croc); ghat.position.set(0.4, 0.55, 0.02); ghat.rotation.set(0, 0, -0.3); ghat.scale.setScalar(1.5);

  // ---- witches: a witch's hat for Barry, a tiny one perched on Nom's ear, a broom leaning by Nom, and Greg's hat
  const bh = wear('witch', witchHat(0.5, 0.8, 0xff8a1f), bearBody); bh.position.set(-0.06, 2.76, 0.02); bh.rotation.set(0.1, 0, 0.14);
  const nh = wear('witch', witchHat(0.2, 0.34, 0x8fd14f), alienBody); nh.position.set(0.02, 1.52, 0.06); nh.rotation.set(-0.05, 0, 0.12); nh.scale.setScalar(2.0);   // on top of its head, between the ears
  const broom = new THREE.Group(); wear('witch', broom, alien);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 10), toon(0x8a5a33)); stick.position.y = 0.75; broom.add(stick);
  const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 14, 1, true), toon(0xd9a441, { side: THREE.DoubleSide })); bristles.position.y = 0.18; broom.add(bristles);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 20), toon(0x7a3fb0)); tie.rotation.x = Math.PI / 2; tie.position.y = 0.38; broom.add(tie);
  broom.position.set(-0.86, 0, -0.15); broom.rotation.set(0, 0, -0.22);
  const gw = gregWitch.clone(); wear('witch', gw, croc);

  // ---- mummies: bandages wrapped round them both (and Greg)
  const wrapB = (y, tilt, w) => { const rz = fz(0, y) + 0.01; const m = new THREE.Mesh(new THREE.TorusGeometry(1, w, 8, 64), bandage);
    m.rotation.set(Math.PI / 2, tilt, 0); m.scale.set(rz * 1.22, rz, 1); m.position.set(0, y, 0); wear('mummy', m, bearBody); };
  [[0.55, 0.06], [0.95, -0.05], [1.5, 0.07], [1.75, -0.06], [2.38, 0.1]].forEach(([y, tl]) => wrapB(y, tl, 0.05));
  const prof = [[0.3, 0.69], [0.58, 0.7], [1.38, 0.5], [1.48, 0.42]];
  for (const [y, r] of prof) { const rz = alienFrontZ(0, y) + 0.005; const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 8, 64), bandage);
    m.rotation.set(Math.PI / 2, (y * 7 % 2 - 1) * 0.08, 0); m.scale.set(r + 0.01, rz, 1); m.position.y = y; wear('mummy', m, alienBody); }
  const gb = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 40), bandage); gb.rotation.set(0, Math.PI / 2, 0.15); gb.scale.set(0.2, 0.21, 1); gb.position.set(-0.05, 0.03, 0); wear('mummy', gb, croc);

  // ---- ghosts: a white sheet over each of them, with a face hole so you can still see who's under there
  function sheet(rings, hole, parent, open = 0, bump = null, sq = 2) {   // sq > 2 gives a squarer cross-section   // bump: {fx, w} lobes pushed forward over the feet (amount per ring in rings[i][3])   // open: half-angle of a gap left at the front (0 = all the way round)
    const SEG = 120, pos = [], idx = [], col = [];
    const yBot = rings[0][0], yTop = rings[rings.length - 1][0];
    rings.forEach(([y, rx, rz, amt], i) => { for (let j = 0; j <= SEG; j++) { const a = open + j / SEG * (Math.PI * 2 - 2 * open);
      const low = Math.pow(1 - (y - yBot) / (yTop - yBot), 1.6);         // 1 at the hem, 0 at the top
      const fold = 1 + (open ? 0.1 : 0.07) * low * Math.sin(a * 9 + 0.6) + 0.03 * low * Math.sin(a * 17) + (open ? 0.18 * low * low : 0);   // folds; the drape belling out at the floor   // soft folds, deeper towards the hem
      const hem = i === 0 ? 0.07 * Math.sin(a * 7) : 0, flare = i === 0 ? 1.14 : (i === 1 ? 1.04 : 1);   // a wavy, flared hem
      const se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / sq);
      const px = rx * flare * fold * se(Math.sin(a)); let pz = rz * flare * fold * se(Math.cos(a));
      if (bump && amt && pz > 0) pz += amt * Math.cos(a) * (Math.exp(-(((px - bump.fx) / bump.w) ** 2)) + Math.exp(-(((px + bump.fx) / bump.w) ** 2)));
      pos.push(px, y + hem, pz);
      // painted-in shading: darker in the folds and round the sides, so the sheet reads as cloth
      const edge = open ? Math.max(0, 1 - Math.min(Math.abs(a - open), Math.abs(Math.PI * 2 - open - a)) / 0.35) : 0;   // shade into the front opening
      const sh = 1 - 0.3 * low * Math.max(0, -Math.sin(a * 9 + 0.6)) - 0.26 * Math.pow(Math.abs(Math.sin(a)), 3)
                   - 0.22 * (1 - Math.min(1, (y - yBot) / 0.2)) - 0.22 * edge;
      col.push(sh * 0.9, sh * 0.93, sh); } });
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 2, d = a + SEG + 1; idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    // the face hole is cut per pixel, so its edge is a smooth oval
    const mat = toon(0xcdd2de, { side: THREE.DoubleSide, vertexColors: true });   // lit, this comes out near white; darker keeps the shading from clipping
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHole = { value: new THREE.Vector4(...hole) };
      sh.vertexShader = 'varying vec3 vSheet;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSheet = position;');
      sh.fragmentShader = 'uniform vec4 uHole; varying vec3 vSheet;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (vSheet.z > 0.0 && pow(vSheet.x / uHole.z, 2.0) + pow((vSheet.y - uHole.y) / uHole.w, 2.0) < 1.0) discard;')
        // soft shading towards the outline, so the white sheet keeps its shape against a light background
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\ndiffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.05, 0.75, abs(normal.z)));');
    };
    mat.customProgramCacheKey = () => 'sheet' + hole.join(',');
    const m = wear('ghost', new THREE.Mesh(g, mat), parent);
    // a stitched hem round the face hole, lying on the sheet
    const surfZ = (x, y) => { let i = 0; while (i < rings.length - 2 && rings[i + 1][0] < y) i++;
      const [y1, rx1, rz1] = rings[i], [y2, rx2, rz2] = rings[i + 1], u = Math.min(1, Math.max(0, (y - y1) / (y2 - y1)));
      const rx = rx1 + (rx2 - rx1) * u, rz = rz1 + (rz2 - rz1) * u; return rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)); };
    const pts = []; for (let k = 0; k < 64; k++) { const f = k / 64 * Math.PI * 2, x = hole[2] * Math.cos(f), y = hole[1] + hole[3] * Math.sin(f); pts.push(new THREE.Vector3(x, y, surfZ(x, y) + 0.005)); }
    wear('ghost', new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, hole[2] * 0.045, 8, true), toon(0xd3d9e6)), parent);
    return m;
  }
  { const rings = [];   // Barry: a hood-length sheet, from his chest up over his ears
    for (let y = 1.4; y <= 2.55; y += 0.06) { const rz = fz(0, y) + 0.1; rings.push([y, Math.max(rz * 1.22, 0.98 + Math.max(0, y - 1.8) * 0.4), rz]); }
    const [y0, rx0, rz0] = rings[rings.length - 1];
    for (let k = 1; k <= 10; k++) { const f = k / 10 * Math.PI / 2; rings.push([y0 + 0.8 * Math.sin(f), rx0 * Math.cos(f), rz0 * Math.cos(f)]); }
    sheet(rings, [0, 2.07, 0.6, 0.44], bearBody);
    // and the rest of the sheet hangs all the way round him to the floor, over his tummy and tucked over his feet
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const body = []; for (let y = 0.03; y <= 1.62; y += 0.06) {
      const rz = fz(0, y) + 0.1, rx = rz * 1.22 + 0.22 * Math.sin(Math.min(1, y / 1.2) * Math.PI * 0.75) + 0.18 * (1 - ss(0.5, 0.85, y));
      const atFoot = rz * Math.sqrt(Math.max(0, 1 - (0.58 / rx) ** 2));
      body.push([y, rx, rz, Math.max(0, 1.52 - atFoot) * (1 - ss(0.62, 0.85, y))]); }
    sheet(body, [0, -9, 0.1, 0.1], bearBody, 0, { fx: 0.6, w: 0.46 }); }
  { const prof = [[0.6, 0.7], [0.75, 0.69], [0.9, 0.68], [1.15, 0.64], [1.35, 0.62], [1.6, 0.72], [1.9, 0.76], [2.15, 0.74], [2.35, 0.64], [2.5, 0.46], [2.6, 0.25], [2.64, 0]];
    const rings = prof.map(([y, r]) => [y, r + 0.06, (y < 1.45 ? alienFrontZ(0, y) : 0.34) + 0.06]);
    sheet(rings, [0, 1.02, 0.58, 0.3], alienBody);
    // below the hood it hangs all the way round to the floor, tucked over its feet
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const body = []; for (let y = 0.02; y <= 0.7; y += 0.04) {
      const rz = alienFrontZ(0, y) + 0.1, rx = (y < 0.3 ? 0.6 + y * 0.3 : 0.7) + 0.14 + 0.12 * (1 - ss(0.42, 0.6, y));
      const atFoot = rz * Math.sqrt(Math.max(0, 1 - (0.35 / rx) ** 2));
      body.push([y, rx, rz, Math.max(0, 0.74 - atFoot) * (1 - ss(0.4, 0.56, y))]); }
    sheet(body, [0, -9, 0.1, 0.1], alienBody, 0, { fx: 0.36, w: 0.26 }, 3); }
  // ---- time travellers: a very long striped scarf and a fedora for Barry; a fez and a bow tie for Nom (and a tiny fez for Greg)
  const scarfTex = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d');
    const bands = [['#c8902e', 22], ['#7a2f3a', 14], ['#6b4a2e', 10], ['#2f6f6a', 18], ['#e9dcc0', 8], ['#8a5a9a', 12], ['#c8902e', 10],
                   ['#3f5f8a', 16], ['#7a2f3a', 24], ['#e9dcc0', 10], ['#6b8a3a', 14], ['#b5532c', 18], ['#6b4a2e', 12], ['#2f6f6a', 10],
                   ['#c8902e', 16], ['#8a5a9a', 10], ['#e9dcc0', 14], ['#7a2f3a', 8]];
    let y = 0; while (y < 256) for (const [col, h] of bands) { g.fillStyle = col; g.fillRect(0, y, 8, h); y += h; }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
  })();
  const scarfMat = toon(0xffffff, { map: scarfTex, side: THREE.DoubleSide });
  // a flat knitted strip following a path (stripes run along it), with a little fringe at the end
  function scarfStrip(pts, width, parent, stripesPerUnit = 1.6) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const N = 80, pos = [], uv = [], idx = [], L = curve.getLength();
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const ref = Math.abs(tg.y) > 0.45 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(tg, ref).normalize().multiplyScalar(width / 2);
      pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
      uv.push(0, u * L * stripesPerUnit, 1, u * L * stripesPerUnit);
      if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, scarfMat));
    const end = curve.getPointAt(1), tg = curve.getTangentAt(1);
    const ref = Math.abs(tg.y) > 0.45 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(tg, ref).normalize();
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.025, width * 0.025, width * 0.35, 5), toon(0xc8902e));
      f.position.copy(end).addScaledVector(side, (k / 5 - 0.5) * width * 0.9).addScaledVector(tg, width * 0.16);
      f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); grp.add(f);
    }
    return wear('traveller', grp, parent);
  }
  { // Barry's scarf: wrapped round his neck, one end down his front and trailing along the floor, the other over his shoulder
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 12, 64), scarfMat);
    const rc = document.createElement('canvas'); rc.width = 256; rc.height = 8; const rg = rc.getContext('2d');
    rg.translate(0, 8); rg.rotate(-Math.PI / 2); rg.drawImage(scarfTex.image, 0, 0);   // the same stripes, turned to run round the ring
    const st = new THREE.CanvasTexture(rc); st.colorSpace = THREE.SRGBColorSpace; st.wrapS = THREE.RepeatWrapping; st.repeat.set(2.5, 1); st.magFilter = THREE.NearestFilter;
    ring.material = toon(0xffffff, { map: st }); ring.rotation.x = Math.PI / 2; ring.position.y = 1.66; ring.scale.set(0.98 * 1.08, 0.98 * 0.87, 1.3);
    wear('traveller', ring, bearBody);
    const on = (x, y, out) => [x, y, fz(x, y) + out];
    scarfStrip([on(-0.3, 1.62, 0.1), on(-0.4, 1.3, 0.07), on(-0.45, 0.95, 0.06), on(-0.42, 0.62, 0.08), [-0.35, 0.32, 1.45], [-0.15, 0.03, 1.78], [0.35, 0.02, 1.95], [0.75, 0.02, 1.85]], 0.3, bearBody);
    scarfStrip([on(0.55, 1.66, 0.1), [0.98, 1.62, 0.35], [1.12, 1.25, 0.25], [1.2, 0.8, 0.3], [1.26, 0.35, 0.4], [1.3, 0.03, 0.62]], 0.3, bearBody);
  }
  { // Barry's fedora: a pinched crown with a dark band and a wide brim
    const felt = toon(0x6e5440), g = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.64, 0.035, 40), felt); g.add(brim);
    const crownGeo = new THREE.CylinderGeometry(0.33, 0.38, 0.36, 40, 6);
    { const p = crownGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
        if (y > 0.17) p.setY(i, y - 0.09 * Math.exp(-(x * x) / 0.02) - 0.03);                 // the crease along the top
        const pinch = 1 - 0.12 * Math.max(0, (y + 0.18) / 0.36) * Math.max(0, z / 0.38);      // pinched at the front
        p.setX(i, x * pinch); }
      crownGeo.computeVertexNormals(); }
    const crown = new THREE.Mesh(crownGeo, felt); crown.position.y = 0.19; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.39, 0.08, 40), toon(0x2b2220)); band.position.y = 0.06; g.add(band);
    g.position.set(-0.04, 2.74, 0.02); g.rotation.set(0.1, 0, 0.1);
    wear('traveller', g, bearBody);
  }
  function fez(r) {
    const g = new THREE.Group(), red = toon(0xb3202e);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, r * 1.3, 32), red); body.position.y = r * 0.65; g.add(body);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.03, r * 0.03, r * 0.9, 6), toon(0x15121a));
    cord.position.set(r * 0.55, r * 1.05, r * 0.2); cord.rotation.z = -0.5; g.add(cord);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.45, 10), toon(0x15121a));
    tassel.position.set(r * 0.82, r * 0.55, r * 0.25); g.add(tassel);
    return g;
  }
  const nfez = wear('traveller', fez(0.2), alienBody); nfez.position.set(0.02, 1.5, 0.08); nfez.rotation.set(-0.05, 0, -0.12); nfez.scale.setScalar(1.15);
  const gfez = wear('traveller', fez(0.07), croc); gfez.position.set(0.42, 0.56, 0.02); gfez.rotation.z = -0.35; gfez.scale.setScalar(1.6);
  { // Nom's bow tie, under its mouth
    const g = new THREE.Group(), red = toon(0x9b1d2c);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.15, 4), red);
      w.rotation.z = sx * Math.PI / 2; w.rotation.x = Math.PI / 4; w.scale.set(1, 1, 0.45); w.position.x = sx * 0.075; g.add(w); }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), red); knot.scale.z = 0.6; g.add(knot);
    g.position.set(0, 0.73, alienFrontZ(0, 0.73) + 0.05); g.scale.setScalar(1.45); wear('traveller', g, alienBody);
  }
  // ---- Captain's Day: starship uniforms (painted onto their bodies by the shader below), rank pips, a badge, and stars behind them
  const goldPip = gloss(0xe0b84a, 0.25);
  const badge = (scale) => { const g = new THREE.Group();          // a simple white triangle with gold trim and a dark star, straight sides
    const sh = new THREE.Shape(); sh.moveTo(0, 0.075); sh.lineTo(0.058, -0.05); sh.lineTo(-0.058, -0.05); sh.lineTo(0, 0.075);
    const tri = (k, mat, z) => { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 }), mat);
      m.scale.set(k, k, 1); m.position.set(0, 0.006 * (1 - k), z); g.add(m); };
    tri(1.22, goldPip, -0.004);                       // gold trim round the edge
    tri(1.0, gloss(0xf4f2ee, 0.2), 0.004);            // white face
    const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? 0.0095 : 0.024; (i ? st.lineTo : st.moveTo).call(st, Math.cos(a) * rr, Math.sin(a) * rr); }
    const star = new THREE.Mesh(new THREE.ShapeGeometry(st), toon(0x2a2026)); star.position.set(0, -0.006, 0.026); g.add(star);   // a little dark star
    g.scale.setScalar(scale); return g; };
  { const b = wear('captain', badge(1.3), bearBody); b.position.set(0.42, 1.36, fz(0.42, 1.36) + 0.02); b.rotation.y = 0.35;
    for (let k = 0; k < 4; k++) { const pip = wear('captain', new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), goldPip), bearBody);   // four pips on his right collar
      const x = -0.34 - k * 0.075, y = 1.66 - k * 0.012; pip.scale.z = 0.6; pip.position.set(x, y, fz(-x, y) + 0.02); }
    const n = wear('captain', badge(0.75), alienBody); n.position.set(0.27, 0.64, alienFrontZ(0.27, 0.64) + 0.02); n.rotation.y = 0.3;
    for (let k = 0; k < 2; k++) { const pip = wear('captain', new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), goldPip), alienBody);
      const x = -0.2 - k * 0.055; pip.scale.z = 0.6; pip.position.set(x, 0.76, alienFrontZ(-x, 0.76) + 0.015); } }
  { const N = 140, pos = new Float32Array(N * 3), seed = (i) => { const v = Math.sin(i * 127.1) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < N; i++) pos.set([-4 + 8 * seed(i), 0.4 + 3.4 * seed(i + 300), -2.4 - 1.2 * seed(i + 600)], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.07, map: puffTexEarly(), transparent: true, depthWrite: false, opacity: 0.9 }));
    stars.userData.base = pos.slice(); wear('captain', stars, scene); window.__stars = stars; }
  // ---- devils: little red horns and pointy tails
  for (const sx of [-1, 1]) {
    const h = wear('devil', horn(0.075, 0.26), bearBody); h.position.set(sx * 0.3, 2.62, 0.2); h.rotation.set(0.15, 0, -sx * 0.35);
    const nh2 = wear('devil', horn(0.045, 0.15), alienBody); nh2.position.set(sx * 0.11, 1.4, alienFrontZ(0.11, 1.4) - 0.05); nh2.rotation.set(0.4, 0, -sx * 0.3);
  }
  wear('devil', devilTail([[0.7, 0.3, -0.5], [1.25, 0.25, -0.3], [1.55, 0.55, -0.1], [1.5, 0.95, 0.05]], 0.04), bearBody);
  wear('devil', devilTail([[-0.45, 0.25, -0.25], [-0.85, 0.2, -0.15], [-1.0, 0.5, -0.05], [-0.92, 0.8, 0.0]], 0.03), alienBody);
}
// On ghost day Barry and Nom themselves turn pale, in soft shades of ghostly white (Greg stays green).
const GHOST = { value: 0 };
let ghostPatched = false;
function patchGhostly() {
  const skip = new Set([bearMug, alienMug, croc]);
  const walk = (o) => { if (skip.has(o)) return;
    if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.plush && !m.userData.ghostly) {
      m.userData.ghostly = true;
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = (sh, r) => { prev && prev.call(m, sh, r);
        sh.uniforms.uGhost = GHOST;
        sh.fragmentShader = 'uniform float uGhost;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          { float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.85, 0.98) * (0.6 + 0.45 * gl), uGhost); }`);
      };
      m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '-ghostly';
      m.needsUpdate = true;
    }
    o.children.forEach(walk); };
  walk(bearBody); walk(alienBody);
}
// Captain's Day uniforms: a black band across the shoulders and colour below, painted onto the body by height.
const UNIFORM = { on: { value: 0 }, tug: { value: 0 } };
let uniformPatched = false;
// Each arm pose is its own body mesh, so painting by height would put the shoulder band and chest on arms that
// pass through them. Instead the arms (found from the sculpt's own arm shapes) get plain sleeves, with the paws
// (placed by where they sit at rest) left bare. xyz: the resting position; w: 0 on the arm, 1 elsewhere.
function sleeveCoords(mesh) {
  if (mesh.geometry.attributes.uniRest) return;
  const pp = mesh.geometry.attributes.position, n = pp.count, out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    const arm = 1 - smooth01((mesh.userData.armDist(x, y, z) - 0.02) / 0.04);   // soft across the crease where the arm meets the body
    out.set(arm > 0 ? [...mesh.userData.toRest(x, y, z), 1 - arm] : [x, y, z, 1], i * 4);
  }
  mesh.geometry.setAttribute('uniRest', new THREE.BufferAttribute(out, 4));
}
const uniformQueue = [];   // pose meshes still to be given their resting coordinates, one a frame (drinking poses first)
function patchUniforms() {
  for (const [root, first] of [[bearBody, bearPoses.meshes], [alienBody, alienPoses.meshes]])
    for (const o of new Set([...first, ...root.children])) if (o.isMesh && o.userData.armDist) uniformQueue.push(() => sleeveCoords(o));
  const kit = [[bearBody, new THREE.Vector4(1.52, 1.76, 0.42, 0), new THREE.Color(0x80141b), new THREE.Vector4(0.56, 0.99, 1.08, 0.3)],     // Barry: command red
               [alienBody, new THREE.Vector4(0.73, 0.8, 0.3, 1), new THREE.Color(0x1f6f9e), new THREE.Vector4(0.33, 0.46, 0.43, 0.17)]];  // Nom: science blue
  for (const [root, cut, col, paw] of kit) {
    const walk = (o) => { if (o === bearMug || o === alienMug || o === croc) return;
      if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.plush && !m.userData.uniformed) {
        m.userData.uniformed = true;
        const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => { prev && prev.call(m, sh, r);
          Object.assign(sh.uniforms, { uUni: UNIFORM.on, uTug: UNIFORM.tug, uCut: { value: cut }, uCol: { value: col }, uPaw: { value: paw } });
          sh.vertexShader = 'attribute vec4 uniRest; varying vec3 vUni, vRest; varying float vArm;\n' + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvUni = position; vRest = uniRest.xyz; vArm = 1.0 - uniRest.w;');   // (w is 1 where there's no uniRest)
          sh.fragmentShader = 'uniform float uUni, uTug; uniform vec4 uCut; uniform vec3 uCol; uniform vec4 uPaw; varying vec3 vUni, vRest; varying float vArm;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            { float y = vUni.y + uTug;                                                   // a tug pulls the whole top down a touch
              float collar = uCut.y - 0.06 * smoothstep(0.0, 0.5, vUni.z) * (1.0 - abs(vUni.x));   // dips a little at the front
              bool feet = uCut.w < 0.5
                ? (length((vec3(abs(vUni.x), vUni.y, vUni.z) - vec3(0.58, 0.36, 0.62)) / vec3(0.54, 0.46, 0.66)) < 1.05    // his legs and feet stay furry
                   || (abs(vUni.x) > 0.2 && abs(vUni.x) < 0.62 && vUni.y > 0.7 && vUni.y < 1.25 && vUni.z > 0.98))                                    // and so do his paws
                : (vUni.y < 0.45 && vUni.z > 0.28);
              bool arm = vArm > 0.5;                                                        // the arms: all sleeve, down to the paw
              if (arm) feet = length(vec3(abs(vRest.x), vRest.y, vRest.z) - uPaw.xyz) < uPaw.w;
              if (uUni > 0.5 && (y < collar || arm) && (y > uCut.z || arm) && !feet) {
                float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
                vec3 c = y > uCut.x && !arm ? vec3(0.035, 0.032, 0.045) : uCol;   // a black band across the shoulders, colour below
                diffuseColor.rgb = c * (0.85 + 0.2 * gl); } }`);
        };
        m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '-uniform' + (root === bearBody ? 'B' : 'N');
        m.needsUpdate = true;
      }
      o.children.forEach(walk); };
    walk(root);
  }
}
const TUG_TIMES = sipSchedule(17011, 40, 90, 200);   // Barry straightens his tunic now and then
const tree = new THREE.Group(); scene.add(tree); tree.position.set(1.4, 0, 1.45);
const treeLights = [];
{
  const green = new THREE.MeshToonMaterial({ color: 0x2f7d46, gradientMap: TOON_BANDS.cel });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 10), new THREE.MeshToonMaterial({ color: 0x7a4a2e, gradientMap: TOON_BANDS.cel })); trunk.position.y = 0.07; tree.add(trunk);
  for (const [y, r, h] of [[0.32, 0.32, 0.42], [0.56, 0.25, 0.36], [0.78, 0.17, 0.3]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24), green); c.position.y = y; tree.add(c); }
  const cols = [0xff4d4d, 0xffd34d, 0x5cc6c9, 0xff8fd0, 0x9cff7a];
  for (let i = 0; i < 18; i++) {
    const u = i / 18, y = 0.18 + u * 0.72, rad = 0.3 * (1 - u * 0.8) + 0.01, a = i * 2.3;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshBasicMaterial({ color: cols[i % cols.length] }));
    b.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); b.userData.col = new THREE.Color(cols[i % cols.length]); tree.add(b); treeLights.push(b);
  }
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? 0.045 : 0.1; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * rr, Math.sin(a) * rr); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  star.position.set(0, 0.98, 0); tree.add(star);
}
tree.visible = false;
function present(color, ribbon, size, x, z) {
  const g = new THREE.Group(); scene.add(g); g.position.set(x, 0, z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.8, size), new THREE.MeshToonMaterial({ color, gradientMap: TOON_BANDS.cel })); box.position.y = size * 0.4; g.add(box);
  const rib = new THREE.MeshToonMaterial({ color: ribbon, gradientMap: TOON_BANDS.cel });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, size * 0.82, size * 0.16), rib); r1.position.y = size * 0.4; g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.82, size * 1.02), rib); r2.position.y = size * 0.4; g.add(r2);
  const lid = new THREE.Group(); lid.position.y = size * 0.8; g.add(lid);
  const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(size * 0.12, size * 0.04, 40, 6, 2, 3), rib); bow.position.y = size * 0.08; lid.add(bow);
  g.userData.lid = lid; g.visible = false; return g;
}
const gifts = [present(0x3f74b8, 0xffffff, 0.3, 1.0, 1.8), present(0xd8343a, 0xffd34d, 0.24, 1.72, 1.75)];
const fireworks = Array.from({ length: 96 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexEarly(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); sp.visible = false; scene.add(sp); return sp; });

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

// Speech bubbles for their little chats: one spot above Nom, the tail pointing at whoever is talking
const chatTex = new Map();
function chatTexture(who, text) {
  const key = who + text;
  if (chatTex.has(key)) return chatTex.get(key);
  const c = document.createElement('canvas'); c.width = 640; c.height = 300;
  const g = c.getContext('2d');
  g.font = '600 46px ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif';
  // wrap to at most two lines
  const words = text.split(' '), lines = [''];
  for (const w of words) { const tryL = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w; if (g.measureText(tryL).width > 540 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = tryL; }
  const w = Math.min(600, Math.max(...lines.map(l => g.measureText(l).width)) + 70), h = 60 + lines.length * 56;
  const x0 = (640 - w) / 2, y0 = 10;
  g.fillStyle = '#ffffff'; g.strokeStyle = who === 'B' ? '#c79a6e' : '#f08cb8'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(x0, y0, w, h, 40); g.fill(); g.stroke();
  // tail: down-left towards Nom, down-right towards Barry
  const tx = who === 'B' ? x0 + w - 70 : x0 + 90, dir = who === 'B' ? 1 : -1;
  g.beginPath(); g.moveTo(tx - 24, y0 + h - 3); g.lineTo(tx + dir * 48, y0 + h + 52); g.lineTo(tx + 24, y0 + h - 3); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(tx - 24, y0 + h); g.lineTo(tx + dir * 48, y0 + h + 52); g.lineTo(tx + 24, y0 + h); g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(tx - 21, y0 + h - 8, 42, 10);
  g.fillStyle = who === 'B' ? '#5a3b22' : '#7a2453'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 320, y0 + 36 + 28 + i * 56 - (lines.length === 1 ? 6 : 0)));
  const tx2 = new THREE.CanvasTexture(c); tx2.colorSpace = THREE.SRGBColorSpace; tx2.anisotropy = 4;
  chatTex.set(key, tx2); return tx2;
}
const chatBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
chatBubble.visible = false; chatBubble.renderOrder = 10; scene.add(chatBubble);
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

// Transporter sparkles for the 'beam' surprise: gold and ice-blue twinkles with a dark rim, so they show on the cream
const beamSparkTex = ['#ffd75e', '#9fdcff'].map(fill => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.translate(32, 32);
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 7 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(90, 70, 40, 0.75)'; g.stroke();
  g.beginPath(); g.arc(0, 0, 6, 0, 2 * Math.PI); g.fillStyle = '#ffffff'; g.fill();
  return new THREE.CanvasTexture(c);
});
const _beamGlow = new THREE.Color(0.35, 0.6, 0.8);
const beamSparks = Array.from({ length: 22 }, (_, i) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamSparkTex[i % 2], transparent: true, depthWrite: false }));
  sp.visible = false; sp.renderOrder = 2; sp.userData = { seed: i * 137.508 }; scene.add(sp); return sp;
});

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
const ACT_LEN = { toast: 5, croc: 19, stretch: 10, story: 48, refill: 13.5, movie: 62, presents: 15 };
const MUG_MOVE = 1.6;
/** presents are opened once a year (remembered in this Mac's web storage) */
function giftsOpened() { try { return localStorage.getItem('dbGifts') === String(today().getFullYear()) || D.giftHat; } catch { return !!D.giftHat; } }
function markGiftsOpened() { try { localStorage.setItem('dbGifts', String(today().getFullYear())); } catch {} }
const CHAT_TIMES = sipSchedule(97531, 420, 720, 1080);   // a chat every 12-18 minutes (the first after ~7 min)
const SURPRISE_TIMES = sipSchedule(24601, 1500, 2400, 5400);
/** -1..1 sway for whoever is doing a ghost noise right now (0 otherwise). */
function booSway(W, who, t) {
  const c = W.chat; if (!c || c.fx !== 'boo' || c.who !== who || !/o{3,}|BOO|Mwa|Whoo/i.test(c.text)) return 0;
  return Math.sin(t * 4.2) * smooth(Math.min(c.lineT / 0.4, (c.len - c.lineT) / 0.4));
}
const BOO_TIMES = sipSchedule(31337, 90, 180, 360);   // ghost day: a spooky noise every 3-6 minutes   // a hiccup, sneeze or lost Greg every 40-90 minutes
/** how long a line stays up: long enough to read it */
const lineLength = (ln) => ln[1] ? 1.6 + 0.065 * ln[1].length : 1.6;
/** a chat that fits the moment, not one heard recently (time-of-day ones get first go) */
function pickChat() {
  const n = today();
  const c = { hour: n.getHours(), day: n.getDay(), month: n.getMonth(), date: n.getDate(), rain: isRainy(), hot: isHot(), cold: isCold(), costume: costumeToday(n),
              activeMin: D.activeSince == null ? 0 : (performance.now() - D.activeSince) / 60000 };
  D.heard = D.heard || [];
  const fits = CHATS.filter(x => !x.when || x.when(c));
  let fresh = fits.filter(x => !D.heard.includes(x));
  if (!fresh.length) { D.heard = []; fresh = fits; }
  const timely = fresh.filter(x => x.when && Math.random() < 0.6);
  const pool = timely.length ? timely : fresh;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  D.heard.push(pick); return pick;
}    // seconds to bend down and put a mug on the floor (or pick it up)
const ACT_TIMES = sipSchedule(13579, 150, 240, 480);
// Music: the app listens (only if you allow it in Settings) and tells us roughly how loud it is and when the beats land
const MUSIC = { on: false, level: 0, lastBeat: -1e9, bpm: 110, bass: false };
window.setMusic = (on, level, beat, bpm, bass) => {
  MUSIC.on = !!on; MUSIC.level = level || 0; MUSIC.bass = !!bass;
  if (beat) MUSIC.lastBeat = performance.now();
  if (bpm > 40 && bpm < 220) MUSIC.bpm = bpm;
  if (on) lastActivityMs = performance.now();               // music wakes them up and keeps them awake
};
// Pats: the app tells us where you clicked; if it was on one of them, they react
const raycaster = new THREE.Raycaster();
window.pat = (x, y) => {
  camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(x / window.innerWidth * 2 - 1, y / window.innerHeight * 2 - 1), camera);
  const shown = (o) => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
  const hit = raycaster.intersectObjects([bear, alien], true).find(h => h.object.isMesh && shown(h.object) && !(h.object.material && h.object.material.transparent));
  if (!hit) return false;
  let who = 'B';
  for (let a = hit.object; a; a = a.parent) { if (a === croc) { who = 'G'; break; } if (a === alien) { who = 'N'; break; } if (a === bear) break; }
  D.pat = { who, at: performance.now() / 1000 }; lastActivityMs = performance.now();
  return true;
};
// Weather, from the app (Open-Meteo): WMO weather code, temperature in °C, daytime or not
const WEATHER = { known: false, code: 0, temp: 20, day: true };
window.setWeather = (code, temp, day) => { if (code === null) { WEATHER.known = false; return; } WEATHER.known = true; WEATHER.code = code; WEATHER.temp = temp; WEATHER.day = !!day; };
const isRainy = () => (params.has('rain')) || (WEATHER.known && ((WEATHER.code >= 51 && WEATHER.code <= 67) || (WEATHER.code >= 80 && WEATHER.code <= 82) || WEATHER.code >= 95));
const isHot = () => params.has('hot') || (WEATHER.known && WEATHER.temp >= 30 && WEATHER.day);
const isCold = () => params.has('cold') || (WEATHER.known && WEATHER.temp <= 12);
/** today's date, or a pretend one for testing (?date=12-25) */
function today() {
  const n = new Date();
  if (params.has('date')) { const [m, d] = params.get('date').split('-').map(Number); n.setMonth(m - 1, d); }
  if (params.has('hour')) n.setHours(+params.get('hour'), 0);
  return n;
}
const isFestive = (n) => n.getMonth() === 11 || (n.getMonth() === 0 && n.getDate() <= 6);
window.doActivity = (name) => { if (ACT_LEN[name]) D.pendingAct = name; if (name === 'presents') { D.giftScarf = D.giftHat = false; } if (name === 'chat') D.chatNow = true; if (name === 'jam') D.demoJam = performance.now() + 40000; };
let lastActivityMs = performance.now();
// Talking with you (the web app's chat): lines like the scripted chats' [who, words, Barry's face, Nom's face], played as
// soon as they're awake, even in the middle of an activity; lines that arrive while a talk is playing are added to its end.
window.sayLines = (lines, then) => {
  lastActivityMs = performance.now();
  D.pendingTalk = D.pendingTalk ? { lines: D.pendingTalk.lines.concat(lines), then: then || D.pendingTalk.then } : { lines, then };
};
/** what's going on, for the chat: time, costume, weather and what they're up to */
window.sceneState = () => {
  const n = today();
  return { hour: n.getHours(), minute: n.getMinutes(), weekday: n.getDay(), month: n.getMonth() + 1, date: n.getDate(),
    costume: costumeToday(n), festive: isFestive(n), weather: WEATHER.known ? { code: WEATHER.code, temp: Math.round(WEATHER.temp), day: WEATHER.day } : null,
    hot: isHot(), cold: isCold(), rain: isRainy(), activity: D.act, asleep: D.sleep > 0.5 };
};
window.playBirthday = () => { D.pendingBday = true; lastActivityMs = performance.now(); };   // hats for the party; all day only on the birthday itself
window.nudge = () => { lastActivityMs = performance.now(); };   // someone's here (the web app calls this when it's opened)
window.birthdayThanks = () => { D.pendingThanks = true; lastActivityMs = performance.now(); };
window.setBirthdayDay = (on) => { D.hats = !!on; };
function wantsSleep() {
  if (MUSIC.on) return false;
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
    else if (!params.has('preview') && !params.has('rest') && D.sleep < 0.01 && bdayT === Infinity && wakeT > 8 && !MUSIC.on) {
      const a = lastStart(t, ACT_TIMES);
      if (a.since < 0.1 && D.act === null) {
        D.act = ACTS[a.i % ACTS.length]; D.actStart = t;
        if (Math.min(D.bLevel ?? 1, D.nLevel ?? 1) < 0.4) D.act = 'refill';   // running low: time for a top-up
        const td = today();
        if (td.getMonth() === 11 && td.getDate() === 25 && !giftsOpened()) D.act = 'presents';   // Christmas morning!
        // evenings: story time or movie night (taking turns, about once an hour);
        // weekend daytime: a movie now and then (every couple of hours)
        const now = new Date(), h = now.getHours(), wd = now.getDay();
        if ((h >= 19 || h < 5) && t - (D.lastCosy ?? -1e9) > 3600) { D.act = D.cosyFlip ? 'movie' : 'story'; D.cosyFlip = !D.cosyFlip; D.lastCosy = t; }
        else if ((wd === 0 || wd === 6) && h >= 10 && h < 17 && t - (D.lastMovie ?? -1e9) > 7200) D.act = 'movie';
        if (D.act === 'movie') D.lastMovie = t;
      }
    }
    if (D.act) { actT = t - D.actStart; act = D.act; if (actT > ACT_LEN[act] || D.sleep > 0.3) { D.act = null; act = null; actT = Infinity; } }
  }
  if (act === 'stretch') { wakeT = actT - MUG_MOVE - 0.2; act = null; }
  // jamming: whenever music is playing (and nothing else is going on)
  // a jam session on request (from the menu): 40 seconds of play-along to a steady beat
  if (D.demoJam && performance.now() < D.demoJam) {
    MUSIC.on = true; MUSIC.bpm = 112; const p = 60 / 112, nowS = performance.now() / 1000;
    if (Math.floor(nowS / p) !== D.fakeBeat) { D.fakeBeat = Math.floor(nowS / p); MUSIC.lastBeat = performance.now(); }
  } else if (D.demoJam) { D.demoJam = 0; MUSIC.on = false; }
  if (params.has('jam')) { MUSIC.on = true; const p = 60 / 112; if (Math.floor(t / p) !== D.fakeBeat) { D.fakeBeat = Math.floor(t / p); MUSIC.lastBeat = performance.now() - (t % p) * 1000; } }
  const jamming = MUSIC.on && !act && D.sleep < 0.5 && bdayT === Infinity;   // the same stretch as on waking, once the mugs are down

  // Nom's crocodile: comes out for a cuddle, and always when Nom is asleep
  // beaming Greg aboard: Nom's mug goes down while Barry gives the order, then Greg arrives straight in Nom's arms
  const beamChat = D.chat && D.chat.conv.fx === 'beam' ? D.chat : null;
  const beamT = beamChat ? t - beamChat.start - lineLength(beamChat.conv.lines[0]) : -Infinity;   // from the start of Nom's line
  if (beamT >= 0 && D.beamAt == null && D.nMug >= 1) { D.beamAt = t; D.croc = 1; }
  const wantCroc = (beamChat && D.beamAt != null) || (D.pendingAct === 'croc' && D.croc > 0) || (act === 'presents' && actT > 5.5 && actT < ACT_LEN.presents - 2 * MUG_MOVE - 0.4) || ((act === 'croc' || act === 'story' || act === 'movie') && actT < ACT_LEN[act] - 2 * MUG_MOVE - 0.4) || D.sleep > 0.5;   // Greg listens to stories and watches movies too
  // mugs: put down (bending over) before sleeping, stretching or cuddling Greg; picked up again afterwards
  const stretchWindow = wakeT > -MUG_MOVE - 0.5 && wakeT < 5;
  const bearWants = D.sleep > 0.02 || stretchWindow || (act === 'story' && actT < ACT_LEN.story - MUG_MOVE - 0.2)
                  || (act === 'refill' && actT < 11.2)    // Barry sets his mug down next to Nom for a top-up
                  || (act === 'movie' && actT < ACT_LEN.movie - MUG_MOVE - 0.2) || (act === 'presents' && actT < ACT_LEN.presents - MUG_MOVE - 0.2) || jamming || D.jamIn > 0;
  const wantPot = act === 'refill' && actT < 9.6;
  const nomWants = bearWants || beamChat || wantCroc || D.croc > 0 || wantPot || D.pot > 0;
  // instruments come out once the mugs are down, and go away before they're picked up
  D.jamIn = (jamming && D.bMug >= 1 && D.nMug >= 1) ? Math.min(1, (D.jamIn || 0) + dt / 0.6) : Math.max(0, (D.jamIn || 0) - dt / 0.6);
  if (params.has('jam')) D.jamIn = 1;
  // who plays what: bass -> a laid-back groove (bongos + shaker); guitar -> the band (bongos + ukulele)
  // or, every other time, the party set (tambourine + maracas)
  if (D.jamIn > 0 && !D.jamSet) { D.jamSet = MUSIC.bass ? 'groove' : (D.jamFlip ? 'party' : 'band'); D.jamFlip = !D.jamFlip; }
  if (D.jamIn === 0) D.jamSet = null;
  if (params.has('jamset')) D.jamSet = params.get('jamset');
  const step = (v, up) => up ? Math.min(1, v + dt / MUG_MOVE) : Math.max(0, v - dt / MUG_MOVE);
  if (params.has('mug')) D.bMug = D.nMug = +params.get('mug');
  else { D.bMug = step(D.bMug, bearWants); D.nMug = step(D.nMug, nomWants); }
  if (params.has('croc')) { D.nMug = 1; D.croc = +params.get('croc'); }
  else if (wantCroc && D.nMug >= 1) D.croc = Math.min(1, D.croc + dt / 1.6);       // reaches round and brings Greg out
  else if (!wantCroc) D.croc = Math.max(0, D.croc - dt / 1.6);                      // and puts him back
  if (D.croc === 0 && !beamChat) D.beamAt = null;
  // the sparkles build while Barry speaks and die away as Greg appears; Greg fades in over 1.8 s
  const beamIn = D.beamAt != null ? Math.max(0.001, smooth((t - D.beamAt) / 1.8)) : 0;
  const beamSpark = beamChat ? smooth(Math.min(1, (beamT + 1.4) / 1.2)) * (1 - smooth((beamT - 1.2) / 1.0)) : 0;
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
  const storyDoze = storyT < ACT_LEN.story ? smooth(Math.min((storyT - 26) / 8, (BOOK_OFF + 1.5 - storyT) / 1.5)) : 0;

  // movie night: mugs down, Greg and the popcorn come out, the TV comes on at 3.5 s; a scary bit around 30 s
  // (Nom hides behind Greg); Nom nods off near the end; TV off at 55 s, then everything is put away
  const movieT = act === 'movie' ? actT : Infinity;
  const tvOn = movieT < ACT_LEN.movie ? smooth(Math.min((movieT - 3.5) / 0.5, (55 - movieT) / 0.5)) : 0;
  const bowl = movieT < ACT_LEN.movie ? smooth(Math.min((movieT - 2.2) / 0.5, (56.2 - movieT) / 0.5)) : 0;
  const scary = movieT < ACT_LEN.movie ? smooth(Math.min((movieT - 29.5) / 0.4, (36 - movieT) / 0.8)) : 0;
  const movieDoze = movieT < ACT_LEN.movie ? smooth(Math.min((movieT - 43) / 6, (55.5 - movieT) / 1.2)) : 0;
  const watching = movieT < ACT_LEN.movie ? smooth(Math.min((movieT - 3) / 0.8, (55.5 - movieT) / 0.8)) : 0;
  const doze = Math.max(storyDoze, movieDoze);

  // refill: mug down (0-1.6 s), fetch the pot (to 3.2 s), pour for Barry (4-6.5 s), then into its own mug (7.5-9.5 s)
  const refillT = act === 'refill' ? actT : Infinity;
  const pourBarry = refillT < 14 ? smooth(Math.min((refillT - 3.6) / 0.6, (6.2 - refillT) / 0.6)) : 0;   // into Barry's mug
  const pourNom = refillT < 14 ? smooth(Math.min((refillT - 6.8) / 0.6, (9.2 - refillT) / 0.6)) : 0;     // then its own
  const holdOut = refillT < 14 ? smooth(Math.min((refillT - 1.6) / 0.8, (10.5 - refillT) / 0.8)) : 0;   // Barry turns to watch

  // waving hello when your pointer comes close (Nom first; Barry joins in if you stay)
  const near = mouseNear();
  // waves as soon as your pointer has been near them for a moment (once per visit, at most every 15 s)
  const idle = !act && !MUSIC.on && D.sleep < 0.05 && D.bMug < 0.05 && D.nMug < 0.05 && wakeT > 3 && bdayT === Infinity;
  if (near) { if (D.nearSince == null) D.nearSince = t; } else { D.nearSince = null; D.wavedThisVisit = false; }
  if (near && idle && !D.wavedThisVisit && t - D.nearSince > 0.25 && t - D.lastWave > 15) {
    D.waveStart = t; D.lastWave = t; D.barryJoin = false; D.wavedThisVisit = true;
  }
  let waveT = params.has('wave') ? +params.get('wave') : (D.waveStart === null ? Infinity : t - D.waveStart);
  if (waveT > 1.2 && waveT < 1.3 && near) D.barryJoin = true;
  const waveN = waveT < 3.2 ? smooth(Math.min(waveT / 0.35, (3.2 - waveT) / 0.35)) : 0;
  const waveB = (D.barryJoin || params.has('wave')) && waveT < 4.2 ? smooth(Math.min((waveT - 1.2) / 0.4, (4.2 - waveT) / 0.4)) : 0;

  // little chats: about every 15 minutes, when they're not busy with something else
  const nowMs = performance.now();
  if (nowMs - mouseMovedAt > 5 * 60000) D.activeSince = null; else if (D.activeSince == null) D.activeSince = nowMs;
  if (!params.has('preview') && !params.has('rest') && lastStart(t, CHAT_TIMES).since < 0.1) D.chatDueAt = t;
  const freeToChat = !act && !MUSIC.on && D.sleep < 0.05 && bdayT === Infinity && wakeT > 6 && D.bMug < 0.05 && D.nMug < 0.05 && !(waveT < 4.5);
  if (!params.has('preview') && !params.has('rest') && lastStart(t, SURPRISE_TIMES).since < 0.1) D.surpriseDueAt = t;
  if (D.surpriseDueAt != null && t - D.surpriseDueAt < 300 && freeToChat && !D.chat) {
    D.chat = { conv: SURPRISES[Math.floor(Math.random() * SURPRISES.length)], start: t }; D.surpriseDueAt = null;
  }
  if (!params.has('preview') && !params.has('rest') && costumeToday(today()) === 'ghost' && lastStart(t, BOO_TIMES).since < 0.1) D.booDueAt = t;
  if (D.booDueAt != null && t - D.booDueAt < 120 && freeToChat && !D.chat) { D.chat = { conv: BOOS[Math.floor(Math.random() * BOOS.length)], start: t }; D.booDueAt = null; }
  if (params.has('boo')) D.chat = { conv: BOOS[+params.get('boo')], start: t - +(params.get('ct') || 0) };
  if (params.has('surprise')) D.chat = { conv: SURPRISES[+params.get('surprise')], start: t - +(params.get('ct') || 0) };
  if ((D.chatNow || (D.chatDueAt != null && t - D.chatDueAt < 120)) && freeToChat && !D.chat) {
    D.chat = { conv: pickChat(), start: t }; D.chatNow = false; D.chatDueAt = null;
  }
  if (params.has('chat')) D.chat = { conv: CHATS[+params.get('chat')], start: t - +(params.get('ct') || 0) };
  if (D.pendingTalk && D.sleep < 0.1) {                          // you said something: their answer comes first
    if (D.chat && D.chat.conv.talk) { D.chat.conv.lines.push(...D.pendingTalk.lines); D.chat.conv.then = D.pendingTalk.then || D.chat.conv.then; }
    else D.chat = { conv: { lines: D.pendingTalk.lines.slice(), then: D.pendingTalk.then, talk: true }, start: t };
    D.pendingTalk = null;
  }
  let chat = null;
  if (D.chat) {
    if ((act && !D.chat.conv.talk) || D.sleep > 0.1) D.chat = null;   // something else came up
    else {
      let ct = t - D.chat.start;
      for (const ln of D.chat.conv.lines) {
        const len = lineLength(ln);
        if (ct < len) { chat = { who: ln[0], text: ln[1], bFace: ln[2] || 'normal', nFace: ln[3] || 'normal', lineT: ct, len,
                                 fx: D.chat.conv.fx, line: D.chat.conv.lines.indexOf(ln) }; break; }
        ct -= len;
      }
      if (!chat && !params.has('chat') && !params.has('surprise')) { if (D.chat.conv.then) D.pendingAct = D.chat.conv.then; D.chat = null; }
    }
  }

  // presents: Barry's box opens at 2.5 s (a scarf!), Nom's at 5.5 s (a Santa hat for Greg, who comes out to wear it)
  const presentsT = act === 'presents' ? actT : Infinity;
  if (presentsT > 2.5 && presentsT < 100) D.giftScarf = true;
  if (presentsT > 5.5 && presentsT < 100) { D.giftHat = true; markGiftsOpened(); }
  // New Year: party hats from 6 pm on New Year's Eve, fireworks for the first 20 minutes of the year
  const td2 = today();
  const nyeEvening = td2.getMonth() === 11 && td2.getDate() === 31 && td2.getHours() >= 18;
  const midnight = params.has('fireworks') || (td2.getMonth() === 0 && td2.getDate() === 1 && td2.getHours() === 0 && td2.getMinutes() < 20);
  const toastT = act === 'toast' ? actT : Infinity;
  const toastTurn = toastT < 5 ? smooth(Math.min(toastT / 1.0, (5 - toastT) / 1.0)) : 0;
  const toastRaise = toastT < 5 ? Math.max(0.5 * smooth(Math.min((toastT - 0.4) / 0.8, (4.2 - toastT) / 0.6)),
                                            smooth(Math.min((toastT - 1.9) / 0.6, (3.6 - toastT) / 0.6))) : 0;
  const clink = toastT < 5 ? Math.max(0, 1 - Math.abs(toastT - 1.6) / 0.35) : 0;
  return { sleep: D.sleep, bdayT, cheer: Math.max(cheer, midnight && D.sleep < 0.5 ? 0.7 * smooth(Math.sin(t * 0.8) * 2) : 0), party, thanks,
           hats: D.hats || bdayT < BDAY_LEN || thanksT < 4 || params.has('bday') || params.has('hats') || nyeEvening || midnight, presentsT, midnight,
           stretch, yawn, nomYawn, nomStretch: nomStretchAmt, bMug: D.bMug, nMug: D.nMug, croc: D.croc, beamIn, beamSpark,
           toastTurn, toastRaise, clink, bookOut, bookOpen, reading, page, pageT, doze,
           pot: D.pot || 0, pourBarry, pourNom, holdOut, chat, movieT, tvOn, bowl, scary, watching, jamIn: D.jamIn || 0, jamSet: D.jamSet || 'party', waveN, waveB, waveT, dt };
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
  const W = direct(t); window.__W = W;
  // a pat: how long ago, and who
  const patAge = params.has('pat') ? +(params.get('pt') || 0.3) : (D.pat ? performance.now() / 1000 - D.pat.at : 99);
  const patWho = params.has('pat') ? params.get('pat') : (D.pat ? D.pat.who : null);
  const patB = patWho === 'B' && patAge < 1.6, patN = patWho === 'N' && patAge < 1.8, patG = patWho === 'G' && patAge < 1.6;
  const squish = patB ? 0.1 * Math.sin(patAge * 13) * Math.exp(-patAge * 2.6) : 0;
  const now = today(), hour = now.getHours();
  const night = hour >= 18 || hour < 5, dark = hour >= 19 || hour < 6;
  // the beat (when jamming): a quick pulse on each beat, and a slow sway every two beats
  const sinceBeat = params.has('jam') ? (t % (60 / 112)) : (performance.now() - MUSIC.lastBeat) / 1000;
  const beat = Math.exp(-sinceBeat / 0.13) * W.jamIn;
  const sway = Math.sin(Math.PI * sinceBeat / (60 / MUSIC.bpm) + (D.swayFlip ? Math.PI : 0)) * W.jamIn * (D.jamSet === 'groove' ? 0.6 : 1);
  if (sinceBeat < D.lastSinceBeat) D.swayFlip = !D.swayFlip;   // a new beat
  const newBeat = sinceBeat < (D.lastSinceBeat ?? 1e9); D.lastSinceBeat = sinceBeat;
  if (newBeat) D.beatN = (D.beatN || 0) + 1;
  const beatPhase = Math.min(1, sinceBeat / (60 / MUSIC.bpm));          // 0 on the beat, 1 just before the next
  const drums = W.jamIn > 0.01 && W.jamSet !== 'party', strum = W.jamIn > 0.01 && W.jamSet === 'band';          // what the director says is happening
  const zz = smooth((W.sleep - 0.45) / 0.55);  // eyes closed / leaning: second half of falling asleep
  const bearDown = W.bMug, nomDown = W.nMug;   // 0 = mug in hand, 1 = on the floor (in between: bending to put it down / pick it up)
  // Bear: breathes; sips now and then; on birthdays he raises his mug for a toast.
  let bs = params.has('preview') ? sip(t, 9, 4.8) : sipAt(t, BEAR_SIPS);
  const munch = W.bowl > 0.9 && W.watching > 0.9 && W.scary < 0.1 ? smooth(Math.min(((W.movieT + 2) % 7) / 0.5, (1.6 - ((W.movieT + 2) % 7)) / 0.5)) : 0;
  bs = Math.max(bs * (1 - bearDown), W.cheer * 0.6, W.toastRaise * 0.8, W.bookOut * 0.35,
                W.bowl * 0.25 + 0.5 * munch, W.jamSet === 'party' ? W.jamIn * (0.22 + 0.3 * beat) : 0);   // book / popcorn bowl / tambourine held up
  const breath = 1 + (0.012 + 0.014 * zz) * Math.sin(t * (1.6 - 0.8 * zz));   // slower, deeper breaths when asleep
  const tall = 1 + 0.045 * W.stretch;          // stretching up tall
  const bSquash = 1 - 0.09 * Math.sin(Math.PI * W.bMug);   // squashes down a little as he bends over
  bearBody.scale.set((1 + (breath - 1) * 0.5) / Math.sqrt(tall) / Math.sqrt(bSquash) * (1 + squish * 0.6), breath * tall * bSquash * (1 - squish), 1);
  bearBody.rotation.x = 0.07 * zz - 0.09 * W.stretch + BEAR_BEND * Math.sin(Math.PI * bearDown) ;   // nods asleep, leans back to stretch, bends to reach the floor
  bearBody.rotation.x += 0.05 * beat;   // head-bopping to the music
  bearBody.rotation.z = 0.045 * sway - 0.025 * zz + 0.05 * W.toastTurn + 0.03 * Math.sin(t * 5) * W.stretch * (1 - W.stretch);
  bearBody.rotation.z += 0.07 * booSway(W, 'B', t);   // swaying like a ghost while he moans
  if (!params.has('solo')) bear.rotation.y = -0.2 - 0.14 * W.toastTurn + 0.3 * W.watching;    // turns towards Nom for a toast, or to the TV
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
  // bongos: a paw comes down on each beat (left, right, left…); half as often for a bass groove
  const tapHit = W.jamSet === 'groove' ? ((D.beatN || 0) % 2 === 0) : true;
  if (W.jamIn > 0.3 && drums && W.waveB <= 0.06 && (beatPhase > 0.3 || !tapHit)) {
    bearPoses.meshes.forEach(m => (m.visible = false));
    bearTap.showExtra((D.beatN || 0) % 2);
  } else bearTap.meshes.forEach(m => (m.visible = false));
  bearMug.rotation.set((MUG_TILT + BEAR_ARM_LIFT * bs - (0.5 + MUG_TILT) * smooth((bs - 0.6) / 0.4)), 0, 0);
  // for a refill, Barry sets his mug down by Nom (and it stays there until he picks it up again)
  if (W.pot > 0 || W.pourBarry > 0) D.bSide = 1; else if (bearDown < 0.02) D.bSide = 0;
  bearFloor.position.set(...lerp3([0, 0.24, 1.55], [-0.48, 0.24, 1.68], D.bSide || 0));
  placeMug(bearMug, bearArms, BEAR_MUG_HOLD, bearFloor, bearDown);
  // popcorn and tambourine ride in his paws, kept upright
  popcorn.visible = W.bowl > 0.01; popcorn.scale.setScalar(0.4 + 0.6 * W.bowl); popcorn.rotation.x = BEAR_ARM_LIFT * bs - 0.15;
  tambourine.visible = W.jamIn > 0.01 && W.jamSet === 'party'; tambourine.scale.setScalar(0.4 + 0.6 * W.jamIn);
  bongos.visible = drums; bongos.scale.setScalar(0.4 + 0.6 * W.jamIn);
  tambourine.rotation.set(BEAR_ARM_LIFT * bs - 0.25, 0.2, 0.35 * beat * Math.sin(t * 40));
  // reading aloud: little mouth movements in bursts, like words
  const chatting = W.chat && W.chat.who === 'B' && W.chat.text && W.chat.lineT < W.chat.len - 0.5;
  const talk = (W.reading && W.pageT > 0.9 && W.pageT < 4.4) || chatting ? Math.max(0, Math.sin(t * 11)) * (0.5 + 0.5 * Math.sin(t * 2.3)) : 0;
  // coffee level: goes down a little with every sip, back up when Nom pours
  D.bLevel = Math.min(1, Math.max(0.22, (D.bLevel ?? 1) - (bs > 0.9 && W.toastRaise === 0 ? W.dt * 0.05 : 0) + (W.pourBarry > 0.6 ? W.dt * 0.4 : 0)));
  bearMug.userData.setLevel(D.bLevel);
  bearYawn.visible = W.yawn > 0.05 || talk > 0.15; bearMouthLine.visible = !bearYawn.visible;
  const mo = Math.max(W.yawn, 0.32 * talk, 0.45 * W.scary, 0.3 * munch * Math.max(0, Math.sin(t * 14)));
  if (W.scary > 0.3 || munch > 0.3) { bearYawn.visible = true; bearMouthLine.visible = false; }
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
  // chat bubbles: in the app they're drawn natively above the buddies (crisp text); here as a fallback
  const native = window.__sayHandler || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.say);   // (the web app draws them as page bubbles)
  const lineKey = W.chat && W.chat.text && W.chat.lineT < W.chat.len - 0.25 ? W.chat.who + W.chat.text : null;
  if (native && lineKey !== D.saidKey) {
    D.saidKey = lineKey;
    if (lineKey) {
      bearBody.updateMatrixWorld(true); alienBody.updateMatrixWorld(true); camera.updateMatrixWorld();
      const head = W.chat.who === 'B' ? bearBody.localToWorld(_eyePos.set(-0.35, 2.7, 0.4)) : alienBody.localToWorld(_eyePos.set(0.1, window.__WEB ? 2.6 : 1.62, 0.3));   // (web: above his ears, clear of Barry)
      head.project(camera);
      native.postMessage({ show: true, who: W.chat.who, text: W.chat.text,
                           x: (head.x + 1) / 2 * window.innerWidth, y: (head.y + 1) / 2 * window.innerHeight });
    } else native.postMessage({ show: false });
  }
  if (!native && W.chat && W.chat.text) {
    const c = W.chat, a = smooth(Math.min(c.lineT / 0.18, (c.len - c.lineT) / 0.3));
    chatBubble.visible = a > 0.01;
    chatBubble.material.map = chatTexture(c.who, c.text); chatBubble.material.opacity = a;
    const sz = 1.0 * (0.85 + 0.15 * smooth(c.lineT / 0.25));
    chatBubble.scale.set(1.7 * sz, 1.7 * sz * 300 / 640, 1);
    chatBubble.position.set(-1.35, 2.42, 1.2);
  } else chatBubble.visible = false;
  // a speech bubble with the picture he's describing
  const bub = W.reading ? smooth(Math.min((W.pageT - 0.9) / 0.4, (4.3 - W.pageT) / 0.4)) : 0;
  bubble.visible = bub > 0.01;
  if (bubble.visible) {
    bubble.material.map = BUBBLES[(W.page + 1) % BUBBLES.length];
    bubble.position.set(-1.25, 2.5, 1.0);               // in the space above Nom, its tail pointing at Barry
    const sz = 0.7 * (0.7 + 0.3 * bub); bubble.scale.set(sz, sz, sz); bubble.material.opacity = bub;
  }
  const bFace = W.chat ? W.chat.bFace : 'normal';
  const happy = patB || (W.jamIn > 0.5) || (bFace === 'happy' && !chatting) || (bs > 0.5 && W.cheer < 0.5 && W.bookOut < 0.5 && W.holdOut < 0.5) || W.waveB > 0.5 || W.party > 0.5 || W.thanks > 0.5 || W.yawn > 0.3 || W.stretch > 0.5;
  const ls = lastStart(t, BEAR_SIPS);
  const nodding = (hour >= 22 || hour < 2) && !params.has('preview') && !params.has('rest') && ls.i % 3 === 1 && ls.since > 1.0 && ls.since < 2.5;
  if (nodding) bearBody.rotation.x += 0.14 * smooth((ls.since - 1.0) / 0.5);   // dozing off mid-sip…
  if ((hour >= 22 || hour < 2) && ls.i % 3 === 1 && ls.since > 2.5 && ls.since < 2.9) bearBody.rotation.z += 0.05 * Math.sin((ls.since - 2.5) * 40);   // …and jolting awake
  const sleepy = !happy && (zz > 0.5 || nodding || bFace === 'sleepy' || blinking(t, 4.7, 1));
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
    if (bFace === 'wonder') { ox = 0.012 * (i ? 1 : -1); oy = 0.035; }   // gazing upwards
    if (W.watching > 0.5) { ox = 0.03; oy = W.scary > 0.3 ? 0.01 : -0.005; }   // watching the TV
    const x = (i ? 1 : -1) * EYE.x + ox, y = EYE.y + oy;
    e.position.set(x, y, fz(Math.abs(x), y));
  });
  bearHappy.forEach(e => (e.visible = happy));
  bearSleepy.forEach(e => (e.visible = sleepy));
  updateSteam(t, isHot() ? 0 : (1 - bs) * (1 - bearDown) * (1 + 0.8 * W.holdOut));
  bearHat.visible = alienHat.visible = W.hats;
  // cocoa with a marshmallow in the evening, coffee the rest of the day
  M.coffee.color.setHex(night ? 0x6b3f22 : C.coffee);
  const icedDay = isHot();   // a cold drink on a scorcher (no steam)
  bearMug.userData.marsh.visible = alienMug.userData.marsh.visible = night && !icedDay;
  bearMug.userData.setCold(icedDay); alienMug.userData.setCold(icedDay);
  // the lamp after dark
  lamp.visible = dark;
  if (dark) { const fl = 0.95 + 0.05 * Math.sin(t * 3.1); lampLight.intensity = 1.8 * fl; lampGlow.material.opacity = 0.5 * fl; }
  // weather
  const rainy = isRainy(), hot = isHot(), cold = isCold();
  rain.forEach(d => { d.visible = rainy; if (!rainy) return; const u = d.userData, y = 3.4 - ((t * u.speed + u.off) % 3.6); d.position.set(u.x + y * 0.12, y, u.z); });
  bearSunnies.visible = hot && W.sleep < 0.5; nomSunnies.forEach(l => (l.visible = hot && W.sleep < 0.5)); nomBridge.visible = hot && W.sleep < 0.5;
  // the festive season (1 Dec - 6 Jan): Santa hats, the tree, and presents on Christmas Day
  const festive = isFestive(now);
  bearSanta.visible = festive && !W.hats; nomSanta.visible = festive && !W.hats;
  bearScarf.visible = !!(cold || (festive && D.giftScarf));
  bearScarf.scale.setScalar(1); if (W.presentsT < 4) bearScarf.scale.setScalar(Math.max(0.01, smooth((W.presentsT - 2.5) / 0.6)));
  bearScarf.scale.x *= 1.08; bearScarf.scale.z *= 0.87;
  nomScarf.visible = cold;
  gregSanta.visible = !!(festive && (D.giftHat || params.has("gifthat")));
  tree.visible = festive && !tv.visible;
  if (tree.visible) treeLights.forEach((b, i) => b.material.color.copy(b.userData.col).multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7))));
  const xmas = now.getMonth() === 11 && now.getDate() === 25;
  gifts.forEach((g, i) => {
    const openAt = i === 0 ? 2.5 : 5.5, since = isFinite(W.presentsT) ? W.presentsT - openAt : -1;
    g.visible = tree.visible && xmas && (!giftsOpened() || since < 1.2);
    if (!g.visible) return;
    g.userData.lid.position.y = 0.24 + (since > 0 ? since * 1.6 : 0); g.userData.lid.rotation.z = since > 0 ? since * 4 : 0;
    g.scale.setScalar(since > 0.3 ? Math.max(0.01, 1 - (since - 0.3) / 0.6) : 1);
  });
  // hearts for pats
  hearts.forEach((h, i) => {
    const age = patAge - i * 0.18; h.visible = (patB || patN || patG) && age > 0 && age < 1.4;
    if (!h.visible) return;
    const head = patWho === 'B' ? bearBody.localToWorld(_zp.set(0.2 * (i - 1), 2.7, 0.5)) : patWho === 'N' ? alienBody.localToWorld(_zp.set(0.15 * (i - 1), 1.7, 0.3)) : croc.localToWorld(_zp.set(0.3, 0.6, 0.1));
    h.position.set(head.x + 0.12 * Math.sin(age * 5 + i), head.y + age * 0.5, head.z + 0.2);
    const sz = 0.2 * Math.min(1, age / 0.15); h.scale.set(sz, sz, sz); h.material.opacity = Math.min(1, (1.4 - age) / 0.4);
  });
  // New Year fireworks
  fireworks.forEach((f, i) => {
    f.visible = W.midnight;
    if (!f.visible) return;
    const burst = Math.floor(i / 16), period = 2.4, phase = (t + burst * 0.8) % period, n = Math.floor((t + burst * 0.8) / period);
    const r = (k) => { const x = Math.sin((n * 7 + burst) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const a = (i % 16) / 16 * Math.PI * 2, sp = 0.6 + 0.3 * r(3);
    f.position.set(-2.2 + r(1) * 3.6 + Math.cos(a) * sp * phase, 2.3 + r(2) * 0.7 + Math.sin(a) * sp * phase - 0.25 * phase * phase, -2.2);
    f.material.color.setHSL(r(4), 0.9, 0.6); f.material.opacity = Math.max(0, 1 - phase / 1.6);
    const sz = 0.16 * (1 - phase / 2.4); f.scale.set(sz, sz, sz);
  });
  // maracas in Nom's paws, shaken on the beat
  uke.visible = strum; uke.scale.setScalar(1.45 * (0.4 + 0.6 * W.jamIn)); uke.rotation.z = -0.45 + 0.03 * beat;
  maracas.forEach((m, i) => { m.visible = W.jamIn > 0.01 && W.jamSet !== 'band' && (W.jamSet === 'party' || i === 1); m.scale.setScalar(0.4 + 0.6 * W.jamIn); m.rotation.x = 0.5 * beat * Math.sin(t * 36 + i * 2); });
  // musical notes drift up on the beats
  if (newBeat && W.jamIn > 0.5) { const n = notes[(D.noteI = ((D.noteI || 0) + 1) % notes.length)]; n.userData.born = t; n.userData.x = -1.6 + Math.random() * 2.0; }
  notes.forEach(n => {
    const age = t - n.userData.born; n.visible = age >= 0 && age < 2.2 && W.jamIn > 0.01;
    if (!n.visible) return;
    n.position.set(n.userData.x + 0.15 * Math.sin(age * 3), 1.6 + age * 0.55, 1.4);
    const sz = 0.26 * (0.8 + 0.2 * Math.sin(age * 6)); n.scale.set(sz, sz, sz);
    n.material.opacity = Math.min(1, age / 0.2, (2.2 - age) / 0.5);
  });
  // the TV: flickering colours from the movie (a red flash at the scary bit)
  tv.visible = W.tvOn > 0.001 || (W.movieT < ACT_LEN.movie && W.movieT > 2.5 && W.movieT < 57);
  if (tv.visible) {
    const scene_ = Math.floor(t / 1.7), r = (k) => { const x = Math.sin(scene_ * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const col = new THREE.Color().setHSL(0.5 + 0.25 * r(1), 0.6, 0.55 + 0.15 * r(2));
    if (W.scary > 0.2) col.lerp(new THREE.Color(Math.sin(t * 18) > 0 ? 0xff3b2f : 0x220000), W.scary);
    const fl = (0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7)) * W.tvOn;
    tvScreenMat.color.copy(col).multiplyScalar(fl);
    tvGlow.material.color.copy(col); tvGlow.material.opacity = 0.55 * fl;
    tvLight.color.copy(col); tvLight.intensity = 3.0 * fl;
  }
  // a piece of popcorn tossed over to Nom now and then (Nom catches it)
  const tossT = W.bowl > 0.9 && W.watching > 0.9 && W.scary < 0.1 ? ((W.movieT + 5) % 5) : 9;
  flyKernel.visible = tossT < 0.9; D.kernelCatch = tossT > 0.45 && tossT < 1.3;
  if (flyKernel.visible) {
    bearBody.updateMatrixWorld(true); alienBody.updateMatrixWorld(true);
    popcorn.getWorldPosition(_s1); _s1.y += 0.15;
    alienBody.localToWorld(_s2.set(0, 0.9, 0.45));
    const u = tossT / 0.9;
    flyKernel.position.lerpVectors(_s1, _s2, u); flyKernel.position.y += Math.sin(Math.PI * u) * 0.45;
    flyKernel.rotation.set(t * 9, t * 7, 0);
  }
  // Halloween week: the jack-o'-lantern (lit after dark); bats flit about on the 31st
  const mon = now.getMonth(), day = now.getDate(), hr = now.getHours();
  const halloween = params.has('halloween') || (mon === 9 && day >= 24);
  pumpkin.visible = halloween && !tv.visible;
  // a different costume each day of Halloween week
  const costume = costumeToday(now);
  for (const k in COSTUME) COSTUME[k].forEach(o => (o.visible = k === costume));
  if (costume === 'ghost' && !ghostPatched) { patchGhostly(); ghostPatched = true; }
  GHOST.value = costume === 'ghost' ? 1 : 0;
  const captain = costume === 'captain';
  if (captain && !uniformPatched) { patchUniforms(); uniformPatched = true; }
  if (captain && uniformQueue.length) uniformQueue.shift()();
  UNIFORM.on.value = captain ? 1 : 0;
  { const tg = params.has('tug') ? +params.get('tug') : lastStart(t, TUG_TIMES).since;      // the tug: down sharply, then it settles back
    UNIFORM.tug.value = captain && !params.has('rest') || params.has('tug') ? 0.07 * (tg < 0.25 ? smooth(tg / 0.25) : Math.max(0, 1 - (tg - 0.25) / 0.9)) * (tg < 1.15 ? 1 : 0) : 0; }
  bearMug.userData.setTea(captain);
  if (captain && window.__stars) { const st = window.__stars, p = st.geometry.attributes.position, b = st.userData.base;
    for (let i = 0; i < p.count; i++) { let x = b[i * 3] - t * 0.05 * (1 + (i % 3) * 0.4); x = ((x + 4) % 8 + 8) % 8 - 4; p.setX(i, x); }
    p.needsUpdate = true; st.material.opacity = 0.75 + 0.15 * Math.sin(t * 1.7); }
  vampire.children.forEach(c => { if (c.geometry.type === 'ConeGeometry') c.visible = !bearYawn.visible; });   // fangs tuck away for a yawn
  batWings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.35 + 0.18 * Math.sin(t * 2.2)); });
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
  us = Math.max(us * (1 - nomDown), W.cheer * 0.7, W.toastRaise * 0.85, 0.5 * Math.max(W.pourBarry, W.pourNom), W.jamSet !== 'band' ? W.jamIn * (0.15 + (W.jamSet === 'groove' ? 0.25 : 0.45) * beat) : 0);   // lifts the pot a little to pour
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
  if (W.jamIn > 0 || W.sleep > 0.05 || W.nomYawn > 0 || W.croc > 0 || W.toastTurn > 0 || W.bookOut > 0 || W.pot > 0 || W.waveN > 0) mood = null;
  const cuddle = W.croc > 0.95 && W.sleep < 0.3 && W.bookOut < 0.5 && W.watching < 0.5;     // awake and hugging the crocodile
  const nz = Math.max(zz, W.doze);                   // asleep, or dozing off during the story
  if (W.party > 0.3 || W.thanks > 0.3) { mood = 'giggle'; moodT = (W.thanks > 0.3 ? t : W.bdayT) % 3.6; }   // giggly on birthdays
  const nFace = W.chat ? W.chat.nFace : null;
  if (patN && !W.chat) { mood = 'giggle'; moodT = 0.4 + patAge; }
  if (nFace) { mood = { curious: 'curious', wonder: 'curious', giggle: 'giggle', sleepy: 'sleepy', groan: 'sleepy' }[nFace] || null; moodT = 1.5 + (nFace === 'giggle' ? W.chat.lineT % 1.8 : 0); }
  const nomTalking = W.chat && W.chat.who === 'N' && W.chat.text && W.chat.lineT < W.chat.len - 0.5;
  const ease = mood ? smooth(Math.min(moodT / 0.4, (3.6 - moodT) / 0.4)) : 0;   // fade in and out

  const hp = t % 5;
  const hopping = false;   // the little hop is switched off
  alien.position.y = (hopping ? Math.sin(Math.PI * hp / 0.45) * 0.12 : 0) + 0.16 * W.pourBarry;   // up on tiptoes to reach Barry's mug
  if (mood === 'giggle') alien.position.y += Math.abs(Math.sin(moodT * 16)) * 0.035 * ease;   // little giggly bounce
  const fx = W.chat && W.chat.fx;
  if (fx === 'hiccup' && /hic/.test(W.chat.text) && W.chat.lineT < 0.35) alien.position.y += 0.09 * Math.sin(Math.PI * W.chat.lineT / 0.35);   // hic!
  if (patN) alien.position.y += 0.05 * Math.abs(Math.sin(patAge * 9)) * Math.exp(-patAge * 1.5);
  alien.position.y += 0.07 * beat;                                                              // bouncing to the beat
  let tilt = params.has('rest') ? 0 : 0.035 * Math.sin(t * 1.3);
  if (mood === 'curious') tilt += 0.14 * ease;                  // head tilt
  if (mood === 'sleepy') tilt += 0.07 * ease * Math.sin(moodT * 1.2);   // slow, dozy sway
  if (cuddle && W.watching < 0.5) tilt += 0.09 * Math.sin(t * 2.2);
  tilt += 0.06 * sway + 0.03 * Math.sin(t * 34) * W.scary;   // dancing / shivering at the scary bit
  if (nFace === 'groan') tilt += 0.05 * Math.sin(t * 9) * Math.max(0, 1 - W.chat.lineT / 1.2);   // a little head shake              // rocking the crocodile side to side
  tilt -= 0.07 * W.toastTurn + 0.12 * W.pourBarry;            // leans in for a toast, or to pour for Barry
  if (W.waveN > 0) tilt += 0.05 * Math.sin(W.waveT * 12.5) * W.waveN;   // wiggles as it waves
  alienBody.rotation.z = tilt * (1 - nz) - 0.17 * nz;   // asleep: leans over onto Barry
  { const k = booSway(W, 'N', t); alienBody.rotation.z += 0.09 * k; alien.position.y += 0.05 * Math.abs(k); }   // floaty ghost wobble
  if (!params.has('soloalien')) alien.rotation.y = 0.3 * W.toastTurn + 0.35 * W.watching;
  const nomTall = 1 + 0.06 * W.nomYawn;
  const nSquash = 1 - 0.09 * Math.sin(Math.PI * W.nMug);
  alienBody.scale.set(1 / Math.sqrt(nomTall * nSquash), nomTall * nSquash, 1);
  if (D.alienX === undefined) D.alienX = alien.position.x;
  alien.position.x = D.alienX + 0.06 * nz;
  // bending down for the mug, and turning round to fetch Greg from behind (or put him back)
  const reach = Math.sin(Math.PI * smooth(Math.max(W.croc, W.pot)));
  alienBody.rotation.x = NOM_BEND * Math.sin(Math.PI * nomDown) + 0.12 * reach;
  if (fx === 'sneeze' && W.chat.line === 0) alienBody.rotation.x -= 0.14 * smooth(W.chat.lineT / W.chat.len);            // ah… ah…
  if (fx === 'sneeze' && W.chat.line === 1) alienBody.rotation.x += 0.2 * Math.exp(-W.chat.lineT * 4) - 0.14 * Math.exp(-W.chat.lineT * 12);   // ACHOO!
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
  if (W.jamIn > 0.3 && strum && W.waveN <= 0.06) {     // strumming: down on the beat, up on the off-beat
    alienPoses.meshes.forEach(m => (m.visible = false));
    nomStrum.showExtra(beatPhase < 0.5 ? 0 : 1);
  } else nomStrum.meshes.forEach(m => (m.visible = false));
  alienMug.rotation.set((MUG_TILT + ALIEN_ARM_LIFT * us - (0.4 + MUG_TILT) * smooth((us - 0.6) / 0.4)), 0, 0);
  nomFloor.position.set(...lerp3(NOM_FLOOR, NOM_SIDE, smooth(Math.max(W.croc * 3, W.jamSet === 'band' ? W.jamIn * 3 : 0, D.crocSide || 0))));
  D.crocSide = (W.croc > 0 || (W.jamIn > 0 && W.jamSet === 'band')) ? 1 : (nomDown < 0.5 ? 0 : (D.crocSide || 0));   // mug stays to the side until picked up
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
    croc.position.y += 0.36 * W.scary; croc.position.z += 0.1 * W.scary;   // hiding behind Greg
    croc.rotation.set(...lerp3(CROC_AWAY.r, CROC_HUG.r, k));
    const sq = cuddle ? 1 - 0.05 * Math.max(0, Math.sin(t * 4.4)) : 1;   // a squeeze now and then
    if (patG) croc.rotation.z += 0.3 * Math.sin(patAge * 15) * Math.exp(-patAge * 2.5);   // Greg wobbles
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

  // beaming Greg aboard: a shimmer of sparkles over Nom's tummy, and Greg fades in already in its arms
  const _hug = croc.parent.localToWorld(_zp.set(...CROC_HUG.p)).clone();
  beamSparks.forEach((sp, i) => {
    const seed = sp.userData.seed, u = (Math.sin(seed * 12.9898) * 43758.5453) % 1, v = (Math.sin(seed * 78.233) * 24634.6345) % 1;
    const fall = ((t * 0.35 + Math.abs(v)) % 1);                       // drifting down the beam, then round again
    const tw = 0.5 + 0.5 * Math.sin(seed + t * 9);                    // twinkle
    sp.visible = W.beamSpark > 0.02;
    if (!sp.visible) return;
    sp.position.set(_hug.x + 0.62 * u, _hug.y + 0.55 - 0.75 * fall, _hug.z + 0.25 + 0.05 * Math.sin(seed));
    const sz = (0.08 + 0.08 * tw) * W.beamSpark * Math.sin(Math.PI * fall);
    sp.scale.set(sz, sz, sz);
    sp.material.opacity = Math.min(1, W.beamSpark * 1.5) * (0.4 + 0.6 * tw);
    sp.material.rotation = 0.3 * Math.sin(seed + t * 2);
  });
  if (W.beamIn > 0 && W.beamIn < 1) {
    if (!croc.userData.ownMats) {       // Greg's eyes, mouth etc. share materials with Barry and Nom, so he gets his own copies to fade
      const copies = new Map();
      const own = (m) => {
        if (!copies.has(m)) { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
                              if (c.emissive) c.userData.glow = c.emissive.clone(); copies.set(m, c); }
        return copies.get(m);
      };
      croc.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
      croc.userData.ownMats = [...copies.values()];
    }
    croc.visible = true;
  }
  if (croc.userData.ownMats) {
    const fading = W.beamIn > 0 && W.beamIn < 1;
    for (const m of croc.userData.ownMats) {
      if (m.transparent !== fading) { m.transparent = fading; m.needsUpdate = true; }
      m.opacity = fading ? W.beamIn : 1;
      if (m.emissive) m.emissive.copy(m.userData.glow).lerp(_beamGlow, fading ? 0.8 * (1 - W.beamIn) : 0);   // a cool shimmer while he materialises
    }
  }

  // eyes
  const blink = blinking(t, 3.9, 0.5);
  const gp = t % 13, glance = !params.has('rest') && !mood && gp > 5 && gp < 7;
  const sipping = us > 0.5;
  const mmm = params.get('expr') === 'content' || (!mood && afterSip && sinceSip < 4.8);   // eyes stay happily closed just after a sip
  const happyEyes = nz < 0.5 && (W.jamIn > 0.5 || (nFace === 'happy' && !nomTalking) || W.waveN > 0.3 || W.pourBarry > 0.5 || (sipping && W.cheer < 0.5) || mmm || mood === 'giggle' || cuddle || W.nomYawn > 0.3 || W.clink > 0.2);
  const sleepyEyes = nz > 0.5 || mood === 'sleepy' || (blink && !happyEyes);
  const wide = mood === 'curious' ? 1 + 0.15 * ease : 1;
  alienEyes.forEach(({ white, pupil, s, sleepy, happy }) => {
    white.visible = pupil.visible = !happyEyes && !sleepyEyes;
    happy.visible = happyEyes;
    sleepy.visible = sleepyEyes && !happyEyes;
    white.scale.set(EYE_R * wide, EYE_R * wide, 0.055);
    if (fx === 'search' && W.chat.line === 0) placePupil(pupil, 0.11 * Math.sin(t * 4), 0.0);   // looking all around for Greg
    else if (W.scary > 0.3) placePupil(pupil, 0.08, 0.02);                          // peeking over Greg
    else if (W.watching > 0.5) placePupil(pupil, 0.1, -0.03);                  // watching the TV
    else if (W.bookOut > 0.5) placePupil(pupil, 0.08, -0.03);                      // looking at the pictures in the book
    else if (W.pourNom > 0.3) placePupil(pupil, 0, -0.1);                      // watching its own mug fill up
    else if (watchingMouse() && W.sleep < 0.3) lookAtMouse(white, pupil);          // following your mouse pointer
    else if (nFace === 'wonder') placePupil(pupil, -s * 0.02, 0.1);   // gazing up at the big questions
    else if (mood === 'curious') placePupil(pupil, 0, 0.05);  // looking straight up, wondering
    else if (glance) placePupil(pupil, 0.09, 0.04);
    else placePupil(pupil, -s * 0.06, 0.035);                 // a bright, slightly upward gaze
  });

  // mouth: closed while drinking and for a while after, a small "o" when curious, a smile when giggly or sleepy
  mouthO.scale.set(0.045 * (1 + 0.6 * W.nomYawn), 0.055 * (1 + 1.3 * W.nomYawn), 0.02);
  if (W.nomYawn > 0.05) setMouth('o');                       // a big yawn
  else if (nomTalking) setMouth(Math.sin(t * 13) > 0 ? 'o' : 'smile');   // chatting away
  else if (W.jamIn > 0.5) setMouth(beat > 0.4 ? 'open' : 'smile');
  else if (W.scary > 0.3 || D.kernelCatch) setMouth('o');
  else if (nFace === 'o') setMouth('o');
  else if (nFace === 'groan') setMouth('smile');
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
window.__pose = pose; window.__D = D; window.__dbg = { bearScarf, nomScarf };       // (for stepping through time in tests without drawing)

if (!params.has('preview')) {
  const start = performance.now();
  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    // 30 fps keeps it smooth and easy on the battery; 15 while they're fast asleep with nothing else moving (slow breaths, drifting z's)
    const calm = D.sleep > 0.95 && !isRainy() && !fireworks.some(f => f.visible) && !bats.some(b => b.visible);
    if (now - last < 1000 / (calm ? 15 : 30)) return;
    last = now;
    renderAt((now - start) / 1000);
  };
  requestAnimationFrame(loop);
}
