/* AI World Builder — client-side renderer (Three.js r170).
 *
 * Every world is stored as small JSON "section specs" (see world_core.py). This file turns
 * them into geometry in the browser: a floating island made of a core disk and rings split
 * into 3 or 9 sectors, rendered in one of seven styles over the same data:
 *   2d · pixel (top-down)   voxel · lego · pixel3d (blocks)   3d · anime (smooth terrain)
 * Connected worlds are placed next to the edge they are joined at (bridge / merge) or get a
 * portal. 3D styles can be explored in VR (WebXR) with controller teleport.
 */
import * as THREE from 'three';
import { OrbitControls } from '/static/vendor/three/addons/OrbitControls.js';
import { VRButton } from '/static/vendor/three/addons/VRButton.js';

const TAU = Math.PI * 2;
const H_SCALE = 26;               // terrain height scale (world units)
const OBJ_SIZE = 3.2;             // base object size
const FAMILY = { '2d': 'flat', pixel: 'flat', voxel: 'block', lego: 'block', pixel3d: 'block', '3d': 'smooth', anime: 'smooth' };
const LEGO = ['#c91a09', '#0055bf', '#f2cd37', '#237841', '#ffffff', '#05131d', '#a0a5a9', '#fe8a18', '#582a12',
  '#e4cd9e', '#4b9f4a', '#55a5af', '#c870a0', '#958a73', '#9ba19d', '#0a3463', '#73dca1', '#d67572'];

/* ------------------------------------------------------------------ helpers */
function rng(seed) {                      // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function makeNoise(seed) {                // 2D gradient noise + fbm
  const r = rng(seed), p = new Uint8Array(512), perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h, x, y) => { const a = (h & 7) * TAU / 8; return Math.cos(a) * x + Math.sin(a) * y; };
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  const n = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), A = p[X] + Y, B = p[X + 1] + Y;
    const l1 = g(p[A], x, y) + u * (g(p[B], x - 1, y) - g(p[A], x, y));
    const l2 = g(p[A + 1], x, y - 1) + u * (g(p[B + 1], x - 1, y - 1) - g(p[A + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
  return (x, y, oct = 4) => { let s = 0, a = 1, fr = 1, t = 0; for (let i = 0; i < oct; i++) { s += n(x * fr, y * fr) * a; t += a; a *= 0.5; fr *= 2.03; } return s / t; };
}
const col = (h) => new THREE.Color(h || '#888888');
const mix = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
function nearestLego(c) {
  let best = LEGO[0], bd = 1e9;
  for (const h of LEGO) { const d = col(h); const dd = (d.r - c.r) ** 2 + (d.g - c.g) ** 2 + (d.b - c.b) ** 2; if (dd < bd) { bd = dd; best = h; } }
  return col(best);
}
function posterize(c, lv = 6) { return new THREE.Color(Math.round(c.r * lv) / lv, Math.round(c.g * lv) / lv, Math.round(c.b * lv) / lv); }
function textSprite(text, color = '#ffffff', size = 44, scale = 1) {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  ctx.font = `700 ${size}px Vazirmatn, Tahoma, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40; cv.width = w; cv.height = size + 30;
  ctx.font = `700 ${size}px Vazirmatn, Tahoma, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8,6,16,.62)'; ctx.beginPath(); ctx.roundRect(0, 0, w, cv.height, 18); ctx.fill();
  ctx.fillStyle = color; ctx.direction = 'auto'; ctx.fillText(text, w / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(w / 18 * scale, cv.height / 18 * scale, 1); sp.renderOrder = 10;
  return sp;
}

/* ------------------------------------------------------------- world layout */
class Layout {
  constructor(world) {
    this.w = world; this.N = world.sectors; this.CR = world.core_r; this.RW = world.ring_w;
    this.map = new Map();
    for (const s of world.sections) this.map.set(`${s.ring === 0 ? 0 : s.sector}:${s.ring}`, s);
    this.noise = makeNoise(world.seed || 1);
    this.sections = world.sections;
    for (const s of this.sections) s.c = this.centroid(s.sector, s.ring);
  }
  bounds(sector, ring) {
    if (ring === 0) return { t0: 0, t1: TAU, r0: 0, r1: this.CR };
    const d = TAU / this.N;
    return { t0: sector * d, t1: (sector + 1) * d, r0: this.CR + (ring - 1) * this.RW, r1: this.CR + ring * this.RW };
  }
  toWorld(sector, ring, u, v) {
    const b = this.bounds(sector, ring), t = b.t0 + u * (b.t1 - b.t0), r = b.r0 + v * (b.r1 - b.r0);
    return [Math.cos(t) * r, Math.sin(t) * r];
  }
  centroid(sector, ring) { return ring === 0 ? [0, 0] : this.toWorld(sector, ring, 0.5, 0.5); }
  at(x, z) {
    const r = Math.hypot(x, z);
    if (r < this.CR) return this.map.get('0:0');
    let t = Math.atan2(z, x); if (t < 0) t += TAU;
    const ring = Math.floor((r - this.CR) / this.RW) + 1, sector = Math.min(this.N - 1, Math.floor(t / (TAU / this.N)));
    return this.map.get(`${sector}:${ring}`);
  }
  outer(sector) { let m = 0; for (const s of this.sections) if (s.ring > 0 && s.sector === sector) m = Math.max(m, s.ring); return m; }
  radiusOf(sector) { const o = this.outer(sector); return o ? this.CR + o * this.RW : this.CR; }
  maxRadius() { let m = this.CR; for (let s = 0; s < this.N; s++) m = Math.max(m, this.radiusOf(s)); return m; }
}

/* Terrain height: blended section bases + features + noise, falling off at the void. */
class Terrain {
  constructor(L) {
    this.L = L; this.feats = [];
    for (const s of L.sections) {
      const b = L.bounds(s.sector, s.ring), span = s.ring === 0 ? L.CR : Math.min(L.RW, (b.t1 - b.t0) * (b.r0 + b.r1) / 2);
      for (const f of s.spec.features || []) {
        const [x, z] = L.toWorld(s.sector, s.ring, f.u, f.v);
        this.feats.push({ ...f, x, z, R: Math.max(4, f.size * span * 1.4), sec: s });
      }
    }
  }
  weights(x, z) {
    const out = []; let tot = 0, lim = this.L.RW * 2.6;
    for (const s of this.L.sections) {
      const d = Math.hypot(x - s.c[0], z - s.c[1]); if (d > lim && s.ring > 0) continue;
      const w = 1 / Math.pow(d + 6, 3);
      out.push([s, w]); tot += w;
    }
    return out.map(([s, w]) => [s, w / tot]);
  }
  voidDist(x, z) {
    for (const d of [3, 7, 12, 20, 30]) {
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; if (!this.L.at(x + Math.cos(a) * d, z + Math.sin(a) * d)) return d; }
    }
    return 40;
  }
  sample(x, z) {
    const W = this.weights(x, z); let base = 0, rough = 0, water = 0;
    for (const [s, w] of W) { base += s.spec.height.base * w; rough += s.spec.height.roughness * w; water += (s.spec.water || 0) * w; }
    let h = base * 0.9 + this.L.noise(x * 0.018, z * 0.018, 5) * (0.25 + rough * 0.9) + this.L.noise(x * 0.07, z * 0.07, 2) * rough * 0.12;
    for (const f of this.feats) {
      const d = Math.hypot(x - f.x, z - f.z); if (d > f.R * 2.2) continue;
      const g = Math.exp(-(d * d) / (f.R * f.R * 0.5)), k = f.height;
      switch (f.type) {
        case 'mountain': h += Math.max(0.3, k) * 1.6 * Math.pow(g, 0.8) * (1 + this.L.noise(x * .12, z * .12) * .3); break;
        case 'hill': h += Math.max(.1, k) * 0.6 * g; break;
        case 'plateau': h += Math.max(.2, k) * 0.7 * Math.min(1, g * 2.2); break;
        case 'lake': case 'crater': h -= Math.max(.25, Math.abs(k)) * 0.8 * g; if (f.type === 'crater') h += .35 * Math.exp(-((d - f.R * .8) ** 2) / (f.R * .15) ** 2); break;
        case 'valley': h -= Math.max(.2, Math.abs(k)) * 0.5 * g; break;
        case 'river': {
          const [ix, iz] = this.L.toWorld(f.sec.sector, f.sec.ring, f.u, 0), [ox, oz] = this.L.toWorld(f.sec.sector, f.sec.ring, f.u, 1);
          const vx = ox - ix, vz = oz - iz, t = Math.max(0, Math.min(1, ((x - ix) * vx + (z - iz) * vz) / (vx * vx + vz * vz)));
          const dd = Math.hypot(x - ix - vx * t, z - iz - vz * t); h -= 0.55 * Math.exp(-(dd * dd) / 18); break;
        }
      }
    }
    const vd = this.voidDist(x, z), edge = Math.min(1, vd / 12);
    h = h * (0.35 + 0.65 * edge) - (1 - edge) * 0.15;
    return { h: h * H_SCALE, water: water, vd, W };
  }
  waterY(water) { return water > 0.02 ? (water * 0.55 - 0.05) * H_SCALE : -Infinity; }
  color(s, y, style) {
    let low = new THREE.Color(0), gr = new THREE.Color(0), hi = new THREE.Color(0), snow = 0;
    for (const [sec, w] of s.W) {
      const p = sec.spec.palette; low.add(col(p.low).multiplyScalar(w)); gr.add(col(p.ground).multiplyScalar(w)); hi.add(col(p.high).multiplyScalar(w));
      if (sec.spec.weather === 'snow' || sec.spec.biome === 'snow' || sec.spec.biome === 'tundra') snow += w;
    }
    const t = (y / H_SCALE + 0.2) / 1.3;
    let c = t < 0.35 ? mix(low, gr, t / 0.35) : mix(gr, hi, (t - 0.35) / 0.65);
    if (snow > 0.3 && t > 0.6) c = mix(c, new THREE.Color('#f4f7ff'), (t - 0.6) * 2.5 * snow);
    if (style === 'lego') c = nearestLego(c);
    if (style === 'pixel' || style === 'pixel3d') c = posterize(c, 7);
    return c;
  }
}

/* ------------------------------------------------------------ object models */
// part: [geometryKind, size[x,y,z], offset[x,y,z], colour, main(colour override)]
const C = { trunk: '#7a5230', leaf: '#3f8f3a', pine: '#2c6b3a', rock: '#8a8f96', wall: '#e8dcc0', roof: '#b5452e',
  straw: '#c9a15a', stone: '#9b9b93', white: '#f1efe8', glow: '#ffd36b', sand: '#d9b97a', dark: '#3a3340', water: '#4aa3df' };
const MODELS = {
  tree: [['cyl', [.18, 1.1, .18], [0, .55, 0], C.trunk], ['ico', [.75, .8, .75], [0, 1.5, 0], C.leaf, 1]],
  pine: [['cyl', [.15, .7, .15], [0, .35, 0], C.trunk], ['cone', [.75, 1.1, .75], [0, 1.15, 0], C.pine, 1], ['cone', [.55, .9, .55], [0, 1.75, 0], C.pine, 1]],
  palm: [['cyl', [.12, 2.1, .12], [0, 1.05, 0], '#8b6a43'], ['cone', [1.1, .35, 1.1], [0, 2.15, 0], '#3c9a4c', 1]],
  bush: [['ico', [.55, .42, .55], [0, .3, 0], '#4d8f3f', 1]],
  flower: [['cyl', [.03, .35, .03], [0, .17, 0], '#3f8f3a'], ['ico', [.14, .14, .14], [0, .38, 0], '#ff6fb1', 1]],
  mushroom: [['cyl', [.12, .45, .12], [0, .22, 0], C.white], ['sph', [.42, .25, .42], [0, .48, 0], '#d8333a', 1]],
  cactus: [['cyl', [.2, 1.3, .2], [0, .65, 0], '#3f8f4a', 1], ['cyl', [.12, .5, .12], [.32, .8, 0], '#3f8f4a', 1], ['cyl', [.12, .4, .12], [-.3, .6, 0], '#3f8f4a', 1]],
  rock: [['dod', [.55, .4, .5], [0, .18, 0], C.rock, 1]],
  boulder: [['ico', [1.1, .85, 1], [0, .4, 0], '#7d8288', 1]],
  crystal: [['oct', [.35, 1.2, .35], [0, .9, 0], '#9b6bff', 1], ['oct', [.22, .7, .22], [.35, .5, .1], '#c3a6ff', 1]],
  house: [['box', [1.2, .9, 1], [0, .45, 0], C.wall], ['pyr', [1.05, .7, .9], [0, 1.25, 0], C.roof, 1]],
  hut: [['cyl', [.65, .65, .65], [0, .32, 0], '#a97c4f'], ['cone', [.9, .7, .9], [0, .98, 0], C.straw, 1]],
  tower: [['cyl', [.5, 2.8, .5], [0, 1.4, 0], C.stone, 1], ['cone', [.65, .9, .65], [0, 3.25, 0], C.roof]],
  castle: [['box', [2.2, 1.3, 2.2], [0, .65, 0], C.stone, 1], ['cyl', [.38, 2, .38], [1.1, 1, 1.1], C.stone, 1], ['cyl', [.38, 2, .38], [-1.1, 1, 1.1], C.stone, 1],
    ['cyl', [.38, 2, .38], [1.1, 1, -1.1], C.stone, 1], ['cyl', [.38, 2, .38], [-1.1, 1, -1.1], C.stone, 1], ['cone', [.5, .6, .5], [1.1, 2.3, 1.1], C.roof], ['cone', [.5, .6, .5], [-1.1, 2.3, -1.1], C.roof],
    ['cone', [.5, .6, .5], [1.1, 2.3, -1.1], C.roof], ['cone', [.5, .6, .5], [-1.1, 2.3, 1.1], C.roof]],
  windmill: [['cyl', [.45, 2.2, .45], [0, 1.1, 0], C.white, 1], ['cone', [.55, .5, .55], [0, 2.45, 0], C.roof], ['box', [.08, 2.2, .18], [0, 2.1, .5], '#6b4b2e'], ['box', [2.2, .08, .18], [0, 2.1, .5], '#6b4b2e']],
  lighthouse: [['cyl', [.45, 3, .45], [0, 1.5, 0], C.white, 1], ['cyl', [.47, .4, .47], [0, 1.2, 0], '#d13b3b'], ['cyl', [.47, .4, .47], [0, 2.3, 0], '#d13b3b'], ['sph', [.35, .35, .35], [0, 3.2, 0], C.glow, 0, 1]],
  dome: [['sph', [1.2, 1, 1.2], [0, 0, 0], '#e9eef5', 1]],
  pyramid: [['pyr', [2.4, 1.9, 2.4], [0, .95, 0], C.sand, 1]],
  tent: [['pyr', [1.1, .9, 1.1], [0, .45, 0], '#d9763d', 1]],
  ruin: [['box', [.3, 1.4, .3], [-.5, .7, 0], C.stone, 1], ['box', [.3, .8, .3], [.5, .4, .2], C.stone, 1], ['box', [1.4, .2, .35], [0, 1.45, -.4], C.stone, 1]],
  statue: [['box', [.7, .5, .7], [0, .25, 0], C.stone], ['cyl', [.22, .9, .22], [0, .95, 0], '#c8b26a', 1], ['sph', [.2, .2, .2], [0, 1.55, 0], '#c8b26a', 1]],
  obelisk: [['pyr', [.45, 3, .45], [0, 1.5, 0], '#5d5468', 1]],
  arch: [['box', [.35, 1.8, .35], [-.8, .9, 0], C.stone, 1], ['box', [.35, 1.8, .35], [.8, .9, 0], C.stone, 1], ['box', [2, .35, .4], [0, 1.9, 0], C.stone, 1]],
  well: [['cyl', [.55, .5, .55], [0, .25, 0], C.stone, 1], ['cyl', [.45, .05, .45], [0, .5, 0], C.water], ['pyr', [.75, .4, .75], [0, 1.4, 0], C.roof]],
  lamp: [['cyl', [.05, 1.4, .05], [0, .7, 0], C.dark], ['sph', [.16, .16, .16], [0, 1.45, 0], C.glow, 1, 1]],
  fence: [['box', [1.6, .08, .06], [0, .45, 0], '#8a6a45', 1], ['box', [1.6, .08, .06], [0, .25, 0], '#8a6a45', 1], ['box', [.08, .6, .08], [-.75, .3, 0], '#8a6a45'], ['box', [.08, .6, .08], [.75, .3, 0], '#8a6a45']],
  campfire: [['cone', [.3, .5, .3], [0, .25, 0], '#ff7a1a', 1, 1], ['box', [.7, .1, .12], [0, .05, 0], C.trunk]],
  boat: [['sph', [.9, .3, .4], [0, .05, 0], '#7a5230', 1], ['cyl', [.04, 1.1, .04], [0, .6, 0], C.trunk], ['pyr', [.05, .7, .5], [0, .75, .1], C.white]],
  portal: [['tor', [1.1, 1.1, .25], [0, 1.3, 0], '#b266ff', 1, 1]],
};

function partGeometry(kind, size, family) {
  if (family === 'block') return new THREE.BoxGeometry(size[0] * (kind === 'box' ? 1 : 1.25), size[1], size[2] * (kind === 'box' ? 1 : 1.25));
  switch (kind) {
    case 'cyl': return new THREE.CylinderGeometry(size[0], size[0] * 1.08, size[1], 8);
    case 'cone': return new THREE.ConeGeometry(size[0], size[1], 8);
    case 'pyr': { const g = new THREE.ConeGeometry(size[0] * .75, size[1], 4); g.rotateY(Math.PI / 4); g.scale(1, 1, size[2] / size[0]); return g; }
    case 'ico': { const g = new THREE.IcosahedronGeometry(1, 0); g.scale(size[0], size[1], size[2]); return g; }
    case 'dod': { const g = new THREE.DodecahedronGeometry(1, 0); g.scale(size[0], size[1], size[2]); return g; }
    case 'oct': { const g = new THREE.OctahedronGeometry(1, 0); g.scale(size[0], size[1], size[2]); return g; }
    case 'sph': { const g = new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI / 2); g.scale(size[0], size[1] * 2, size[2]); return g; }
    case 'tor': { const g = new THREE.TorusGeometry(size[0], size[2] * .5, 8, 24); return g; }
    default: return new THREE.BoxGeometry(size[0], size[1], size[2]);
  }
}

/* --------------------------------------------------------------- the engine */
export class WorldEngine {
  constructor(container, opts = {}) {
    this.el = container; this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(50, 1, 0.5, 6000);
    this.ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, -2000, 4000);
    this.camera = this.persp;
    this.dolly = new THREE.Group(); this.dolly.add(this.persp); this.scene.add(this.dolly);
    this.controls = new OrbitControls(this.persp, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.07;
    this.clock = new THREE.Clock();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.ghosts = []; this.selected = new Set(); this.hover = -1; this.animated = [];
    this._buildVoid();
    this._resize = () => this.resize(); addEventListener('resize', this._resize); this.resize();
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', (e) => this._pointer(e, false));
    dom.addEventListener('pointerdown', (e) => { this._down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => { if (this._down && Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) < 6) this._pointer(e, true); });
    this.renderer.setAnimationLoop(() => this._tick());
    this.showSeed();
  }

  /* ---------- background: deep void with stars, nebulae and drifting dust ---------- */
  _buildVoid() {
    this.scene.background = new THREE.Color('#05040b');
    this.scene.fog = new THREE.FogExp2('#0a0716', 0.0009);
    const g = new THREE.BufferGeometry(), n = 4000, pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), r = rng(7);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, t = r() * TAU, rad = 1800 + r() * 1400, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * rad, u * rad, Math.sin(t) * s * rad], i * 3);
      const c = new THREE.Color().setHSL(0.68 + r() * 0.2, 0.6, 0.6 + r() * 0.4); cl.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false, fog: false, transparent: true, opacity: .85 }));
    this.scene.add(this.stars);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); this.glowTex = new THREE.CanvasTexture(cv);
    this.nebulae = new THREE.Group();
    [['#7A00F0', -900, 200, -1400, 1700], ['#ED1908', 1200, -300, -900, 1200], ['#4A0099', 300, 600, 1500, 1800], ['#B266FF', -1300, -500, 800, 1100]].forEach(([c, a, b, d, s]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: c, transparent: true, opacity: .16, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sp.position.set(a, b, d); sp.scale.set(s, s, 1); this.nebulae.add(sp);
    });
    this.scene.add(this.nebulae);
    const dg = new THREE.BufferGeometry(), dn = 500, dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) dp.set([(r() - .5) * 900, (r() - .5) * 500, (r() - .5) * 900], i * 3);
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.4, color: '#c8bae3', transparent: true, opacity: .35, depthWrite: false }));
    this.scene.add(this.dust);
    this.hemi = new THREE.HemisphereLight('#cfd8ff', '#2a1840', 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3e0', 2.2); this.sun.position.set(180, 300, 120);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
  }

  /* empty state: a glowing seed floating in the void */
  showSeed() {
    this.clear(); this.style = 'void'; this._camera3d();
    const seed = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 2), new THREE.MeshStandardMaterial({ color: '#b266ff', emissive: '#7A00F0', emissiveIntensity: 1.6, roughness: .3, flatShading: true }));
    seed.add(core);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 6, .25, 8, 96), new THREE.MeshBasicMaterial({ color: i === 1 ? '#ED1908' : '#B266FF', transparent: true, opacity: .55 }));
      ring.rotation.x = Math.PI / 2 + i * .35; ring.rotation.y = i * .7; seed.add(ring);
      this.animated.push((t) => { ring.rotation.z = t * (0.15 + i * .07); });
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#9B30FF', transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(90, 90, 1); seed.add(halo);
    this.animated.push((t) => { seed.position.y = Math.sin(t * .8) * 3; core.rotation.y = t * .3; });
    this.root.add(seed);
    this.persp.position.set(0, 40, 120); this.controls.target.set(0, 0, 0); this.controls.autoRotate = true; this.controls.autoRotateSpeed = .6;
  }

  clear() {
    this.animated = []; this.ghosts = []; this.selected.clear(); this.portals = [];
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    this.root.clear();
    if (this.vrBtn) { this.vrBtn.remove(); this.vrBtn = null; }
    this.renderer.xr.enabled = false;
  }

  resize() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    const px = this.style === 'pixel' ? 0.3 : this.style === 'pixel3d' ? 0.38 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(px); this.renderer.setSize(w, h);
    this.renderer.domElement.style.imageRendering = (this.style === 'pixel' || this.style === 'pixel3d') ? 'pixelated' : 'auto';
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    const s = this.orthoSize || 200; this.ortho.left = -s * w / h; this.ortho.right = s * w / h; this.ortho.top = s; this.ortho.bottom = -s; this.ortho.updateProjectionMatrix();
  }

  _camera3d() {
    this.camera = this.persp; this.controls.object = this.persp; this.controls.enableRotate = true;
    this.controls.maxPolarAngle = Math.PI * 0.86; this.controls.screenSpacePanning = true;
  }
  _camera2d(R) {
    this.camera = this.ortho; this.controls.object = this.ortho; this.controls.enableRotate = false;
    // keep up = +Y (OrbitControls' frame); the tiny z offset gives a north-up top-down view
    this.orthoSize = R * 1.15; this.ortho.up.set(0, 1, 0); this.ortho.position.set(0, 1500, 1); this.ortho.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0); this.ortho.zoom = 1; this.resize();
  }

  /* ---------- load a world (+ connected worlds) ---------- */
  load(world, connections = [], { editable = false, sectorsInfo = null } = {}) {
    this.clear();
    this.world = world; this.style = world.style; this.family = FAMILY[world.style] || 'smooth';
    this.editable = editable; this.sectorsInfo = sectorsInfo;
    this.resize();
    this.controls.autoRotate = false;
    const main = this._buildWorld(world, world.style);
    this.root.add(main.group);
    this.L = main.L; this.terrain = main.T; this.groundMeshes = main.ground;
    const R = main.L.maxRadius();
    this._lights(R, world.style);
    for (const c of connections) this._connect(main, c);
    if (editable) this._ghosts(main);
    if (this.family === 'flat') this._camera2d(R + 20);
    else {
      this._camera3d();
      const V = R + world.ring_w * (editable ? 1 : 0.3);           // frame the next ring too
      this.persp.position.set(V * 1.05, V * 1.05 + 30, V * 1.6); this.controls.target.set(0, 0, 0);
      this.controls.maxDistance = R * 6 + 300; this.controls.minDistance = 8;
      if (this.opts.vr && navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok && this.world === world) this._vr(); }).catch(() => {});
    }
    this._weather(world);
    this.controls.update();
  }

  _lights(R, style) {
    const s = this.sun.shadow.camera; const k = Math.min(R * 1.3, 700);
    s.left = -k; s.right = k; s.top = k; s.bottom = -k; s.near = 10; s.far = 1600; s.updateProjectionMatrix();
    this.sun.position.set(R * 0.7, R * 1.2 + 200, R * 0.5);
    this.sun.intensity = style === 'anime' ? 2.6 : style === 'lego' ? 2.4 : 2.1;
    this.hemi.intensity = style === 'anime' ? 1.5 : 1.0;
    this.scene.fog.density = this.family === 'flat' ? 0 : Math.max(0.00025, 0.6 / (R * 8 + 600));
  }

  _material(style, opts = {}) {
    const base = { vertexColors: !!opts.vc, color: opts.color || '#ffffff' };
    if (this.family === 'flat' && style !== 'water') return new THREE.MeshBasicMaterial(base);
    if (style === 'anime') { if (!this.toonMap) { const d = new Uint8Array([70, 150, 255]); this.toonMap = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); this.toonMap.minFilter = this.toonMap.magFilter = THREE.NearestFilter; this.toonMap.needsUpdate = true; } return new THREE.MeshToonMaterial({ ...base, gradientMap: this.toonMap }); }
    if (style === 'lego') return new THREE.MeshStandardMaterial({ ...base, roughness: .32, metalness: 0 });
    if (style === 'pixel3d' || style === 'voxel') return new THREE.MeshLambertMaterial({ ...base, flatShading: true });
    return new THREE.MeshStandardMaterial({ ...base, roughness: .92, metalness: 0, flatShading: !!opts.flat });
  }

  _buildWorld(world, style) {
    const L = new Layout(world), T = new Terrain(L), group = new THREE.Group(), ground = [];
    const fam = FAMILY[style];
    group.userData.world = world;
    if (fam === 'block') this._blocks(L, T, group, style, ground);
    else this._smooth(L, T, group, style, ground);
    this._water(L, T, group, style);
    this._objects(L, T, group, style);
    return { L, T, group, ground, style };
  }

  /* smooth terrain (3d / anime / 2d / pixel): one mesh per section, plus the rocky underside */
  _smooth(L, T, group, style, ground) {
    const flat = FAMILY[style] === 'flat', step = flat ? 3 : 2.6;
    const mat = this._material(style, { vc: true, flat: style === '3d' ? false : true });
    const under = this._material(style, { vc: true, flat: true });
    const light = new THREE.Vector3(-0.5, 0.8, -0.3).normalize();
    for (const s of L.sections) {
      const b = L.bounds(s.sector, s.ring), arc = (b.t1 - b.t0) * (b.r0 + b.r1) / 2;
      const nu = Math.max(8, Math.min(220, Math.ceil(arc / step))), nv = Math.max(6, Math.ceil((b.r1 - b.r0) / step));
      const top = [], bot = [], ctop = [], cbot = [], idx = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const t = b.t0 + (b.t1 - b.t0) * i / nu, r = b.r0 + (b.r1 - b.r0) * j / nv;
        const x = Math.cos(t) * r, z = Math.sin(t) * r, sm = T.sample(x, z);
        let y = sm.h, c = T.color(sm, y, style);
        if (flat) {                               // baked hill-shading for top-down styles
          const e = 1.5, hx = T.sample(x + e, z).h - T.sample(x - e, z).h, hz = T.sample(x, z + e).h - T.sample(x, z - e).h;
          const nrm = new THREE.Vector3(-hx, 2 * e, -hz).normalize(); c = c.clone().multiplyScalar(0.55 + 0.6 * Math.max(0, nrm.dot(light)));
          const wy = T.waterY(sm.water); if (y < wy) c = mix(c, col(s.spec.palette.water), .75);
          y = 0;
        }
        top.push(x, y, z); ctop.push(c.r, c.g, c.b);
        const depth = flat ? 0 : Math.min(sm.vd, 34) * 1.5 + 4 + L.noise(x * .09, z * .09) * 6;
        bot.push(x, sm.h - depth * (sm.vd < 4 ? sm.vd / 4 : 1), z);
        const dc = mix(col(s.spec.palette.low), new THREE.Color('#1b1424'), .65); cbot.push(dc.r, dc.g, dc.b);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b2 = a + 1, c2 = a + nu + 1, d = c2 + 1; idx.push(a, b2, c2, b2, d, c2);   // counter-clockwise from above → faces up
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(ctop, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = !flat; m.castShadow = !flat; m.userData.section = s; group.add(m); ground.push(m);
      if (!flat) {
        const gb = new THREE.BufferGeometry(); gb.setAttribute('position', new THREE.Float32BufferAttribute(bot, 3));
        gb.setAttribute('color', new THREE.Float32BufferAttribute(cbot, 3)); gb.setIndex(idx.slice().reverse()); gb.computeVertexNormals();
        group.add(new THREE.Mesh(gb, under));
      }
    }
  }

  /* block styles (voxel / lego / pixel3d): instanced cubes on a square grid */
  _blocks(L, T, group, style, ground) {
    const R = L.maxRadius(), lego = style === 'lego';
    let B = style === 'pixel3d' ? 1.6 : 2.4; B = Math.max(B, R / (style === 'pixel3d' ? 150 : 115));
    const BH = lego ? B * 1.2 : B, cells = [];
    for (let x = -R; x <= R; x += B) for (let z = -R; z <= R; z += B) {
      const cx = x + B / 2, cz = z + B / 2, s = L.at(cx, cz); if (!s) continue;
      const sm = T.sample(cx, cz), top = Math.round(sm.h / BH);
      cells.push({ cx, cz, top, sm, s });
    }
    const key = (x, z) => `${Math.round(x / B)}:${Math.round(z / B)}`, tops = new Map(cells.map(c => [key(c.cx, c.cz), c.top]));
    let count = 0; const list = [];
    for (const c of cells) {
      let minN = c.top;
      for (const [dx, dz] of [[B, 0], [-B, 0], [0, B], [0, -B]]) { const t = tops.get(key(c.cx + dx, c.cz + dz)); minN = Math.min(minN, t === undefined ? c.top - Math.min(8, Math.ceil(c.sm.vd / 3) + 2) : t); }
      const depth = Math.max(1, Math.min(10, c.top - minN + 1));
      for (let k = 0; k < depth; k++) { list.push([c, c.top - k, k === 0]); count++; }
      if (count > 160000) break;
    }
    const geo = new THREE.BoxGeometry(B * 0.999, BH * 0.999, B * 0.999);
    const mesh = new THREE.InstancedMesh(geo, this._material(style), list.length);
    const m4 = new THREE.Matrix4(), cc = new THREE.Color();
    let studs = null, si = 0;
    if (lego) studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(B * .28, B * .28, BH * .22, 10), this._material(style), cells.length);
    list.forEach(([c, lvl, isTop], i) => {
      m4.makeTranslation(c.cx, lvl * BH, c.cz); mesh.setMatrixAt(i, m4);
      const t = T.color(c.sm, lvl * BH, style); cc.copy(isTop ? t : mix(t, new THREE.Color(lego ? '#958a73' : '#5a4636'), lego ? .0 : .55));
      if (lego && !isTop) cc.copy(nearestLego(mix(t, new THREE.Color('#5a4636'), .4)));
      mesh.setColorAt(i, cc);
      if (studs && isTop) { m4.makeTranslation(c.cx, lvl * BH + BH * .6, c.cz); studs.setMatrixAt(si, m4); studs.setColorAt(si, cc); si++; }
    });
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.blocks = true; group.add(mesh); ground.push(mesh);
    if (studs) { studs.count = si; studs.castShadow = true; group.add(studs); }
    this.blockSize = { B, BH };
  }

  _water(L, T, group, style) {
    for (const s of L.sections) {
      if (!(s.spec.water > 0.02)) continue;
      const b = L.bounds(s.sector, s.ring), wy = FAMILY[style] === 'flat' ? 0.05 : T.waterY(s.spec.water);
      if (FAMILY[style] === 'flat') continue;            // already baked into the colours
      const inset = (sector, ring) => { const ok = (sc, rg) => !!L.map.get(`${rg === 0 ? 0 : sc}:${rg}`); return ok(sector, ring + 1) ? 0 : 4; };
      const r1 = b.r1 - (s.ring === 0 ? 4 : inset(s.sector, s.ring));
      const g = new THREE.RingGeometry(Math.max(0.01, b.r0), r1, Math.max(12, Math.ceil((b.t1 - b.t0) * r1 / 4)), 2, b.t0, b.t1 - b.t0);
      g.rotateX(-Math.PI / 2); g.scale(1, 1, -1);
      let c = col(s.spec.palette.water); if (style === 'lego') c = nearestLego(c);
      const m = new THREE.Mesh(g, style === 'anime' || style === 'voxel' || style === 'pixel3d' || style === 'lego'
        ? new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: .78, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: .82, roughness: .15, metalness: .1, side: THREE.DoubleSide }));
      m.position.y = this.blockSize && FAMILY[style] === 'block' ? Math.round(wy / this.blockSize.BH) * this.blockSize.BH + this.blockSize.BH * .3 : wy;
      m.receiveShadow = true; group.add(m);
      this.animated.push((t) => { m.material.opacity = .74 + Math.sin(t * 1.3 + s.sector) * .05; });
    }
  }

  /* objects: one InstancedMesh per model part (fast for thousands of trees/houses) */
  _objects(L, T, group, style) {
    const fam = FAMILY[style], r = rng((L.w.seed || 1) ^ 0x9e37), batches = new Map(), labels = [];
    const place = (s, o, isLandmark) => {
      const n = isLandmark ? 1 : Math.min(40, o.count || 1);
      for (let i = 0; i < n; i++) {
        const gu = (r() + r() + r() - 1.5) / 1.5, gv = (r() + r() + r() - 1.5) / 1.5;
        const u = Math.min(.98, Math.max(.02, o.u + (n > 1 ? gu * (o.spread || .1) : 0))), v = Math.min(.97, Math.max(.03, o.v + (n > 1 ? gv * (o.spread || .1) : 0)));
        const [x, z] = L.toWorld(s.sector, s.ring, u, v), sm = T.sample(x, z);
        const wy = T.waterY(sm.water), onWater = o.type === 'boat';
        if (!onWater && sm.h < wy - 0.3) continue;
        if (onWater && sm.h > wy) continue;
        let y = fam === 'flat' ? 0.4 : onWater ? wy : sm.h;
        if (fam === 'block' && this.blockSize) y = (Math.round(sm.h / this.blockSize.BH) + 0.5) * this.blockSize.BH;
        const sc = OBJ_SIZE * (o.scale || 1) * (0.8 + r() * 0.45) * (isLandmark ? 1.7 : 1);
        const tr = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU), new THREE.Vector3(sc, sc, sc));
        const model = MODELS[o.type] || MODELS.rock;
        model.forEach((p, pi) => {
          const k = `${o.type}:${pi}`; if (!batches.has(k)) batches.set(k, { p, list: [] });
          let c = col(p[4] && o.color ? o.color : p[3]);
          if (style === 'lego') c = nearestLego(c); else if (style === 'pixel' || style === 'pixel3d') c = posterize(c, 6);
          batches.get(k).list.push([tr, c]);
        });
        if (isLandmark && o.name) labels.push([o.name, x, y + sc * 3.2, z]);
      }
    };
    for (const s of L.sections) {
      for (const o of s.spec.objects || []) place(s, o, false);
      if (s.spec.landmark) place(s, s.spec.landmark, true);
    }
    for (const [k, { p, list }] of batches) {
      const [kind, size, off, , , glow] = p, geo = partGeometry(kind, size, fam); geo.translate(off[0], off[1], off[2]);
      const mat = glow && fam !== 'flat' ? new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: p[3], emissiveIntensity: 1.4, roughness: .4 }) : this._material(style, { flat: true });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
      im.castShadow = fam !== 'flat'; im.receiveShadow = fam !== 'flat'; group.add(im);
      if (style === 'anime') {                                    // ink outline (inverted hull)
        const og = partGeometry(kind, size.map(v => v * 1.12), fam); og.translate(off[0], off[1], off[2]);
        const ol = new THREE.InstancedMesh(og, new THREE.MeshBasicMaterial({ color: '#1a1026', side: THREE.BackSide }), list.length);
        list.forEach(([m], i) => ol.setMatrixAt(i, m)); group.add(ol);
      }
      if (glow && fam !== 'flat' && list.length < 60) list.forEach(([m]) => {
        const lp = new THREE.PointLight(p[3], 12, 22, 2); lp.position.setFromMatrixPosition(m); lp.position.y += 3; group.add(lp);
      });
    }
    for (const [name, x, y, z] of labels) { const sp = textSprite(name, '#ffffff', 40); sp.position.set(x, fam === 'flat' ? 5 : y, z); group.add(sp); }
  }

  /* ghost wedges of the next ring per sector: hover + click to choose where to grow */
  _ghosts(main) {
    const L = main.L, info = this.sectorsInfo || {};
    for (let s = 0; s < L.N; s++) {
      const ring = L.outer(s) + 1, b = L.bounds(s, ring), locked = info.maxRing && ring > info.maxRing;
      const g = new THREE.RingGeometry(b.r0 + 1, b.r1 - 1, 32, 1, b.t0 + 0.01, b.t1 - b.t0 - 0.02); g.rotateX(-Math.PI / 2); g.scale(1, 1, -1);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: locked ? '#555066' : '#B266FF', transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false }));
      let y = 0;
      if (FAMILY[this.style] !== 'flat') {
        const ta = (s + .5) * TAU / L.N, rr = b.r0 - 3;           // just inside the current edge
        y = Math.max(0, main.T.sample(Math.cos(ta) * rr, Math.sin(ta) * rr).h) + 2;
      }
      m.position.y = y; m.userData = { sector: s, ring, locked }; m.renderOrder = 5;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: locked ? '#555066' : '#B266FF', transparent: true, opacity: .5 }));
      m.add(edges);
      const [lx, lz] = L.toWorld(s, ring, .5, .5), lab = textSprite(locked ? '🔒' : `${s + 1}`, '#ffffff', 52, .7);
      lab.position.set(lx, y + 6, lz); m.userData.label = lab;
      this.root.add(m); this.root.add(lab); this.ghosts.push(m);
    }
    this._paintGhosts();
  }
  _paintGhosts() {
    for (const g of this.ghosts) {
      const on = this.selected.has(g.userData.sector), hv = this.hover === g.userData.sector;
      g.material.opacity = g.userData.locked ? .06 : on ? .42 : hv ? .24 : .1;
      g.material.color.set(on ? '#ED1908' : g.userData.locked ? '#555066' : '#B266FF');
    }
  }
  setSelection(sectors) { this.selected = new Set(sectors); this._paintGhosts(); }

  _pointer(e, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (this.portals && this.portals.length) {
      const hitP = this.ray.intersectObjects(this.portals, true)[0];
      if (hitP && click) { let o = hitP.object; while (o && !o.userData.portalTo) o = o.parent; if (o && this.opts.onPortal) this.opts.onPortal(o.userData.portalTo); return; }
    }
    if (!this.ghosts.length) return;
    const hit = this.ray.intersectObjects(this.ghosts, false)[0];
    const s = hit ? hit.object.userData.sector : -1;
    if (s !== this.hover) { this.hover = s; this._paintGhosts(); this.renderer.domElement.style.cursor = s >= 0 ? 'pointer' : ''; }
    if (click && hit && this.opts.onSector) this.opts.onSector(s, hit.object.userData);
  }

  /* ---------- connected worlds ---------- */
  _connect(main, c) {
    const L = main.L, Na = L.N, ta = (c.my_sector + .5) * TAU / Na, Ra = L.radiusOf(c.my_sector);
    const other = c.world, edgeA = new THREE.Vector3(Math.cos(ta) * Ra, 0, Math.sin(ta) * Ra);
    const ya = Math.max(0, main.T.sample(Math.cos(ta) * (Ra - 3), Math.sin(ta) * (Ra - 3)).h);
    if (c.level === 'portal' || !other.sections) {
      const p = new THREE.Group(), color = (c.bridge && c.bridge.portal_color) || '#b266ff';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, .9, 12, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 2 }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6.2, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .45, side: THREE.DoubleSide }));
      ring.position.y = disc.position.y = 8; p.add(ring, disc);
      const lab = textSprite('⇄ ' + other.name, '#ffffff', 40); lab.position.y = 19; p.add(lab);
      p.position.copy(edgeA).multiplyScalar((Ra - 5) / Ra); p.position.y = FAMILY[this.style] === 'flat' ? 1 : ya;
      p.lookAt(0, p.position.y, 0); p.userData.portalTo = other.id;
      this.animated.push((t) => { disc.material.opacity = .35 + Math.sin(t * 2) * .15; ring.rotation.z = t * .5; });
      this.root.add(p); this.portals.push(p);
      return;
    }
    const OL = new Layout(other), tb = (c.their_sector + .5) * TAU / OL.N, Rb = OL.radiusOf(c.their_sector);
    const gap = c.level === 'merge' ? 0 : 70, dir = new THREE.Vector3(Math.cos(ta), 0, Math.sin(ta));
    const ob = this._buildWorld(other, FAMILY[other.style] === FAMILY[this.style] || FAMILY[this.style] !== 'flat' ? other.style : this.style);
    ob.group.position.copy(dir.clone().multiplyScalar(Ra + gap + Rb));
    ob.group.rotation.y = tb - ta - Math.PI;
    this.root.add(ob.group);
    const name = textSprite(other.name + (other.owner ? ' · @' + other.owner : ''), '#ffd9ff', 46);
    name.position.copy(ob.group.position); name.position.y = 40; this.root.add(name);
    this.portals.push(ob.group); ob.group.userData.portalTo = other.id;      // click the neighbour to travel there
    if (gap > 0) this._bridge(c.bridge || {}, edgeA, dir, gap, ya, ob, OL, tb, Rb);
  }

  _bridge(spec, edgeA, dir, gap, ya, ob, OL, tb, Rb) {
    const segs = (spec.segments && spec.segments.length ? spec.segments : [{ ground: '#7a6a55', accent: '#b266ff', objects: ['lamp'] }]);
    const yb = Math.max(0, ob.T.sample(Math.cos(tb) * (Rb - 3), Math.sin(tb) * (Rb - 3)).h);
    const flat = FAMILY[this.style] === 'flat', side = new THREE.Vector3(-dir.z, 0, dir.x), n = 24;
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, sg = segs[Math.min(segs.length - 1, Math.floor(t0 * segs.length))];
      const arch = (t) => flat ? 0.2 : ya + (yb - ya) * t + Math.sin(t * Math.PI) * 10;
      const p0 = edgeA.clone().add(dir.clone().multiplyScalar(-4 + t0 * (gap + 8))), p1 = edgeA.clone().add(dir.clone().multiplyScalar(-4 + t1 * (gap + 8)));
      const len = p0.distanceTo(p1), mid = p0.clone().add(p1).multiplyScalar(.5); mid.y = (arch(t0) + arch(t1)) / 2;
      let c = col(sg.ground); if (this.style === 'lego') c = nearestLego(c);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(len + .3, 1.2, 9), this._material(this.style, { color: c }));
      plank.position.copy(mid); plank.lookAt(mid.clone().add(dir)); plank.rotateY(Math.PI / 2);
      plank.rotation.z = Math.atan2(arch(t1) - arch(t0), len); plank.castShadow = plank.receiveShadow = !flat; g.add(plank);
      if (i % 3 === 0) for (const sgn of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 3.5, 6), this._material(this.style, { color: sg.accent }));
        post.position.copy(mid).add(side.clone().multiplyScalar(4.4 * sgn)); post.position.y += 1.8; g.add(post);
        if (!flat && (sg.objects || []).includes('lamp')) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: sg.accent, emissiveIntensity: 2 }));
          bulb.position.copy(post.position); bulb.position.y += 2; g.add(bulb);
        }
      }
    }
    if (spec.name) { const lab = textSprite('⇄ ' + spec.name, '#ffffff', 40); lab.position.copy(edgeA).add(dir.clone().multiplyScalar(gap / 2)); lab.position.y = ya + 22; g.add(lab); }
    this.root.add(g);
  }

  /* ---------- weather particles ---------- */
  _weather(world) {
    const W = {}; for (const s of world.sections) W[s.spec.weather] = (W[s.spec.weather] || 0) + 1;
    const kind = Object.entries(W).sort((a, b) => b[1] - a[1])[0];
    if (!kind || FAMILY[this.style] === 'flat') return;
    if (kind[0] === 'fog') this.scene.fog.density *= 2.4;
    if (kind[0] !== 'rain' && kind[0] !== 'snow') return;
    const R = this.L.maxRadius(), n = 2500, pos = new Float32Array(n * 3), r = rng(3);
    for (let i = 0; i < n; i++) pos.set([(r() - .5) * R * 2, r() * 120, (r() - .5) * R * 2], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: kind[0] === 'snow' ? '#ffffff' : '#9fc4ff', size: kind[0] === 'snow' ? .9 : .5, transparent: true, opacity: .8 }));
    this.root.add(pts);
    const sp = kind[0] === 'snow' ? 6 : 40;
    this.animated.push((t, dt) => { const a = g.attributes.position.array; for (let i = 1; i < a.length; i += 3) { a[i] -= sp * dt; if (a[i] < -10) a[i] = 120; } g.attributes.position.needsUpdate = true; });
  }

  /* ---------- VR (WebXR): stand on the island, teleport with the controller trigger ---------- */
  _vr() {
    this.renderer.xr.enabled = true;
    this.vrBtn = VRButton.createButton(this.renderer);
    this.vrBtn.classList.add('wb-vr'); (this.opts.vrHost || document.body).appendChild(this.vrBtn);
    const startY = Math.max(0, this.terrain.sample(0, 8).h) + 0.2;
    this.renderer.xr.addEventListener('sessionstart', () => { this.dolly.position.set(0, startY, 8); this.persp.position.set(0, 0, 0); });
    this.renderer.xr.addEventListener('sessionend', () => { this.dolly.position.set(0, 0, 0); this.load(this.world, this._lastConnections || [], { editable: this.editable, sectorsInfo: this.sectorsInfo }); });
    const marker = new THREE.Mesh(new THREE.RingGeometry(.6, .9, 24), new THREE.MeshBasicMaterial({ color: '#B266FF' })); marker.rotation.x = -Math.PI / 2; marker.visible = false; this.root.add(marker);
    for (let i = 0; i < 2; i++) {
      const ctl = this.renderer.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#B266FF' }));
      line.scale.z = 60; ctl.add(line); this.dolly.add(ctl);
      ctl.addEventListener('selectend', () => { if (marker.visible) { this.dolly.position.set(marker.position.x, marker.position.y, marker.position.z); } });
      this.animated.push(() => {
        if (!this.renderer.xr.isPresenting) return;
        const m = new THREE.Matrix4().extractRotation(ctl.matrixWorld);
        this.ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld); this.ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
        const hit = this.ray.intersectObjects(this.groundMeshes, false)[0];
        marker.visible = !!hit; if (hit) marker.position.copy(hit.point).add(new THREE.Vector3(0, .1, 0));
      });
    }
  }

  setConnections(c) { this._lastConnections = c; }

  focusSector(s) {
    if (!this.L || FAMILY[this.style] === 'flat') return;
    const ring = this.L.outer(s) + 1, [x, z] = this.L.toWorld(s, ring, .5, .5);
    this.controls.target.set(x * .6, 4, z * .6);
  }

  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  _tick() {
    const dt = Math.min(.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    for (const f of this.animated) f(t, dt);
    this.stars.rotation.y = t * 0.004; this.dust.rotation.y = -t * 0.01; this.nebulae.rotation.y = t * 0.002;
    if (!this.renderer.xr.isPresenting) this.controls.update();
    this.renderer.render(this.scene, this.renderer.xr.isPresenting ? this.persp : this.camera);
  }

  dispose() { this.renderer.setAnimationLoop(null); this.clear(); removeEventListener('resize', this._resize); this.renderer.dispose(); }
}
