import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ── Config ───────────────────────────────────────────────────────────────────
const LAT     = 52.3759;   // Hannover Hauptbahnhof
const LNG     = 9.7320;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

// Cache tile responses locally so they are never re-downloaded on page reload
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Renderer / Scene ─────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 600, 2000);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 5000);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
sun.position.set(300, 700, 400);
sun.castShadow = true;
scene.add(sun);

// ── Google Photorealistic 3D Tiles ────────────────────────────────────────────
// ReorientationPlugin positions the tile group so (LAT, LNG, 0) = world origin,
// Y-up, after the root tileset JSON loads. This is the correct approach —
// manually setting group.matrix breaks the internal LOD camera calculations.
let tiles = null;

// Google Cloud quota tracking
// root.json: 10,000 req/day  |  renderer tiles: unlimited/day, 12,000 req/min
const quota = {
  rootDay:     0,
  rendDay:     0,
  rendMin:     0,
  errors:      0,
  _rendWindow: [],
};

function quotaTrackRequest(url) {
  if (!url.includes('tile.googleapis.com')) return;
  const now = Date.now();
  if (url.includes('root.json') || url.includes('/v1/3dtiles/root')) {
    quota.rootDay++;
  } else {
    quota.rendDay++;
    quota._rendWindow.push(now);
    const cutoff = now - 60000;
    while (quota._rendWindow.length && quota._rendWindow[0] < cutoff) quota._rendWindow.shift();
    quota.rendMin = quota._rendWindow.length;
  }
}

if (API_KEY) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

  tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: API_KEY }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new ReorientationPlugin({
    lat: THREE.MathUtils.degToRad(LAT),
    lon: THREE.MathUtils.degToRad(LNG),
  }));

  // No throttle — service worker caches everything after first download.
  tiles.errorTarget = 12;

  tiles.addEventListener('load-tile-set-error', e => { quota.errors++; console.error(e); });
  tiles.manager.onLoad = () => {
    const el = document.getElementById('loading');
    if (el) el.style.opacity = '0';
  };

  // Intercept fetch to track quota usage
  const origFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    if (typeof url === 'string') quotaTrackRequest(url);
    return origFetch(url, opts).then(r => {
      if (!r.ok && typeof url === 'string' && url.includes('googleapis')) quota.errors++;
      return r;
    });
  };

  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  scene.add(tiles.group);
} else {
  document.getElementById('warning').style.display = 'block';
  document.getElementById('loading').style.display  = 'none';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x446633 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

// ── Shared wheel builder ──────────────────────────────────────────────────────
function makeWheels(root, positions, fW, rW) {
  const rubber = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });
  const rimMat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 130 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xccddee, shininess: 180 });
  return positions.map(([x, y, z, front]) => {
    const w = front ? fW : rW;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, w,       28), rubber);
    const rimM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, w + 0.01, 18), rimMat);
    const hub  = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.02, 5),  chrome);
    [tyre, rimM, hub].forEach(m => { m.position.set(x, y, z); m.rotation.z = Math.PI / 2; root.add(m); });
    return tyre;
  });
}

// ── BMW M1 (1978) ─────────────────────────────────────────────────────────────
function buildBMWM1() {
  const root = new THREE.Group();

  const paint   = new THREE.MeshPhongMaterial({ color: 0xff5200, shininess: 130, specular: 0x441100 });
  const blk     = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 });
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 20 });
  const glass   = new THREE.MeshPhongMaterial({ color: 0x111a1f, transparent: true, opacity: 0.75, shininess: 110 });
  const rubber  = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });
  const rimMat  = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 140 });
  const tailLit = new THREE.MeshBasicMaterial({ color: 0xff1a00 });
  const chrome  = new THREE.MeshPhongMaterial({ color: 0xccddee, shininess: 180 });

  // ── Lower body / sill ──
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.20, 4.25), blk);
  sill.position.y = 0.44;

  // Horizontal black stripe around the car (M1 signature)
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 4.26), blk);
  stripeL.position.set(-0.97, 0.63, 0);
  const stripeR = stripeL.clone(); stripeR.position.x = 0.97;
  const stripeF = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.13, 0.04), blk);
  stripeF.position.set(0, 0.63, 2.13);
  const stripeB = stripeF.clone(); stripeB.position.z = -2.13;

  // ── Main body hull ──
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.38, 4.22), paint);
  body.position.y = 0.64;

  // Rear engine deck (higher — M1 wedge rises toward rear)
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 1.3), paint);
  rearDeck.position.set(0, 0.88, -1.3);

  // ── Cabin (low, centered) ──
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.46, 1.92), paint);
  cabin.position.set(0, 0.99, 0.18);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.07, 1.78), paint);
  roof.position.set(0, 1.22, 0.18);

  // ── Front nose (low wedge) ──
  const noseTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.07, 1.55), paint);
  noseTop.position.set(0, 0.74, 1.4);
  noseTop.rotation.x = 0.10;

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.28, 0.12), blk);
  frontBumper.position.set(0, 0.48, 2.15);

  const airDam = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.10, 0.10), blk);
  airDam.position.set(0, 0.34, 2.16);

  // Headlight covers (M1 has flush pop-up covers)
  [-0.58, 0.58].forEach(x => {
    const hlc = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.38), paint);
    hlc.position.set(x, 0.80, 2.13);
    root.add(hlc);
  });

  // ── Rear ──
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.30, 0.12), blk);
  rearBumper.position.set(0, 0.44, -2.17);

  // Wide rectangular tail lights (dark housing + red lens)
  [[-0.60, 0.70, -2.16], [0.60, 0.70, -2.16]].forEach(([x, y, z]) => {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.24, 0.07), darkMat);
    housing.position.set(x, y, z);
    root.add(housing);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.04), tailLit);
    lens.position.set(x, y, z + 0.02);
    root.add(lens);
  });

  // License plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.04), chrome);
  plate.position.set(0, 0.54, -2.17);

  // Dual exhausts (low, flanking the bumper)
  [-0.40, 0.40].forEach(x => {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 10), darkMat);
    ex.position.set(x, 0.30, -2.22);
    ex.rotation.x = Math.PI / 2;
    root.add(ex);
  });

  // ── Louvered rear window — M1's most iconic feature ──
  // 9 horizontal slats angled across the rear engine cover / window opening
  for (let i = 0; i < 9; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.042, 0.22), blk);
    const t = i / 8;
    slat.position.set(0, 0.82 + t * 0.38, -0.52 - t * 0.62);
    slat.rotation.x = 0.42;
    root.add(slat);
  }

  // ── Glass ──
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.50), glass);
  windshield.position.set(0, 1.06, 1.12);
  windshield.rotation.x = 0.52;

  [-1, 1].forEach(s => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.38), glass);
    win.position.set(s * 0.96, 0.99, 0.18);
    win.rotation.y = -s * Math.PI / 2;
    root.add(win);
  });

  // ── Side mirrors (box style, M1) ──
  [-1, 1].forEach(s => {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.26), blk);
    mir.position.set(s * 1.04, 0.98, 0.90);
    root.add(mir);
  });

  // ── Antenna ──
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.30, 6), darkMat);
  ant.position.set(0.28, 1.30, 0.18);
  root.add(ant);

  root.add(sill, stripeL, stripeR, stripeF, stripeB,
           body, rearDeck, cabin, roof,
           noseTop, frontBumper, airDam,
           rearBumper, plate, windshield);

  const wheels = makeWheels(root,
    [[-1.02,0.34,1.38,true],[1.02,0.34,1.38,true],[-1.06,0.34,-1.38,false],[1.06,0.34,-1.38,false]],
    0.24, 0.30);
  return { root, wheels };
}

// ── Ferrari Testarossa (1984) ─────────────────────────────────────────────────
function buildTestarossa() {
  const root  = new THREE.Group();
  const paint  = new THREE.MeshPhongMaterial({ color: 0xcc1100, shininess: 150, specular: 0x440000 });
  const blk    = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 25 });
  const dark   = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 15 });
  const glass  = new THREE.MeshPhongMaterial({ color: 0x0d1820, transparent: true, opacity: 0.72, shininess: 110 });
  const tailLit = new THREE.MeshBasicMaterial({ color: 0xff1a00 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xddeeee, shininess: 180 });

  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.18, 4.50), dark);
  sill.position.y = 0.43;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.97, 0.36, 4.46), paint);
  body.position.y = 0.62;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.44, 1.96), paint);
  cabin.position.set(0, 0.94, 0.10);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.06, 1.78), paint);
  roof.position.set(0, 1.16, 0.10);
  const noseTop = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.08, 1.64), paint);
  noseTop.position.set(0, 0.72, 1.38); noseTop.rotation.x = 0.08;
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.26, 0.12), blk);
  frontBumper.position.set(0, 0.46, 2.18);
  // Side strakes — THE Testarossa signature
  [-1, 1].forEach(s => {
    for (let i = 0; i < 7; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 1.68), blk);
      slat.position.set(s * 0.99, 0.49 + i * 0.062, -0.15);
      root.add(slat);
    }
  });
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.24, 1.36), paint);
  rearDeck.position.set(0, 0.86, -1.33);
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.038, 0.20), dark);
    slat.position.set(0, 0.82 + i * 0.055, -0.55 - i * 0.05); slat.rotation.x = 0.35;
    root.add(slat);
  }
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 0.12), blk);
  rearBumper.position.set(0, 0.42, -2.19);
  // Circular tail lights
  [-0.62, 0.62].forEach(x => {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.40, 0.08), dark);
    pod.position.set(x, 0.70, -2.17); root.add(pod);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 20), tailLit);
    lens.position.set(x, 0.70, -2.14); lens.rotation.x = Math.PI / 2; root.add(lens);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.04), chrome);
  plate.position.set(0, 0.54, -2.20);
  [-0.22, 0.22].forEach(x => {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), dark);
    ex.position.set(x, 0.33, -2.24); ex.rotation.x = Math.PI / 2; root.add(ex);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.48), glass);
  ws.position.set(0, 1.04, 1.10); ws.rotation.x = 0.55;
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 0.40), glass);
    w.position.set(s * 0.97, 0.94, 0.10); w.rotation.y = -s * Math.PI / 2; root.add(w);
  });
  [-1, 1].forEach(s => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.28), blk);
    m.position.set(s * 1.07, 0.97, 0.88); root.add(m);
  });
  root.add(sill, body, cabin, roof, noseTop, frontBumper, rearDeck, rearBumper, plate, ws);
  const wheels = makeWheels(root,
    [[-1.05,0.34,1.40,true],[1.05,0.34,1.40,true],[-1.09,0.34,-1.40,false],[1.09,0.34,-1.40,false]],
    0.26, 0.32);
  return { root, wheels };
}

// ── Porsche 911 Carrera (1973) ────────────────────────────────────────────────
function buildPorsche911() {
  const root  = new THREE.Group();
  const paint  = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, shininess: 125, specular: 0x555555 });
  const blk    = new THREE.MeshPhongMaterial({ color: 0x141414, shininess: 30 });
  const dark   = new THREE.MeshPhongMaterial({ color: 0x1e1e1e, shininess: 18 });
  const glass  = new THREE.MeshPhongMaterial({ color: 0x111a20, transparent: true, opacity: 0.72, shininess: 110 });
  const tailLit = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xddddee, shininess: 180 });
  const hlMat  = new THREE.MeshPhongMaterial({ color: 0xffffee, emissive: 0x333311 });

  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 4.28), dark);
  sill.position.y = 0.43;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.40, 4.24), paint);
  body.position.y = 0.64;
  // Wider rear fenders (classic 911 flares)
  [-0.88, 0.88].forEach(x => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 1.22), paint);
    f.position.set(x, 0.68, -1.30); root.add(f);
  });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.56, 2.10), paint);
  cabin.position.set(0, 1.04, 0.05);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.07, 1.65), paint);
  roof.position.set(0, 1.32, 0.10);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.09, 1.38), paint);
  hood.position.set(0, 0.82, 1.38); hood.rotation.x = 0.14;
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.30, 0.12), blk);
  frontBumper.position.set(0, 0.48, 2.13);
  // Round headlights
  [-0.54, 0.54].forEach(x => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20), blk);
    o.position.set(x, 0.80, 2.12); o.rotation.x = Math.PI / 2; root.add(o);
    const i2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20), hlMat);
    i2.position.set(x, 0.80, 2.14); i2.rotation.x = Math.PI / 2; root.add(i2);
  });
  // Rear engine hump
  const hump = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.26, 1.30), paint);
  hump.position.set(0, 0.90, -1.32);
  // Duck-tail spoiler
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.32), paint);
  tail.position.set(0, 1.04, -1.96); tail.rotation.x = -0.22;
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.28, 0.12), blk);
  rearBumper.position.set(0, 0.44, -2.16);
  // Round tail lights
  [-0.52, 0.52].forEach(x => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 20), dark);
    o.position.set(x, 0.70, -2.14); o.rotation.x = Math.PI / 2; root.add(o);
    const i2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 20), tailLit);
    i2.position.set(x, 0.70, -2.13); i2.rotation.x = Math.PI / 2; root.add(i2);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.04), chrome);
  plate.position.set(0, 0.52, -2.17);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), dark);
  ex.position.set(0, 0.30, -2.21); ex.rotation.x = Math.PI / 2; root.add(ex);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.52), glass);
  ws.position.set(0, 1.10, 1.08); ws.rotation.x = 0.46;
  const rg = new THREE.Mesh(new THREE.PlaneGeometry(1.40, 0.48), glass);
  rg.position.set(0, 1.06, -1.05); rg.rotation.x = -0.42; rg.rotation.y = Math.PI;
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 0.46), glass);
    w.position.set(s * 0.95, 1.04, 0.05); w.rotation.y = -s * Math.PI / 2; root.add(w);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.22), blk);
    m.position.set(s * 0.98, 1.01, 0.88); root.add(m);
  });
  root.add(sill, body, cabin, roof, hood, frontBumper, hump, tail, rearBumper, plate, ws, rg);
  const wheels = makeWheels(root,
    [[-0.98,0.34,1.38,true],[0.98,0.34,1.38,true],[-1.04,0.34,-1.38,false],[1.04,0.34,-1.38,false]],
    0.20, 0.26);
  return { root, wheels };
}

// ── Ford Mustang GT Fastback (1969) ───────────────────────────────────────────
function buildMustang() {
  const root  = new THREE.Group();
  const paint  = new THREE.MeshPhongMaterial({ color: 0x1a3a1a, shininess: 105, specular: 0x112211 });
  const blk    = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 28 });
  const dark   = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 18 });
  const glass  = new THREE.MeshPhongMaterial({ color: 0x121a1e, transparent: true, opacity: 0.72, shininess: 100 });
  const tailLit = new THREE.MeshBasicMaterial({ color: 0xff1a00 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xccddee, shininess: 180 });
  const hlMat  = new THREE.MeshPhongMaterial({ color: 0xffffee, emissive: 0x333311 });

  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.93, 0.22, 4.74), dark);
  sill.position.y = 0.45;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.38, 4.70), paint);
  body.position.y = 0.64;
  // Long hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.09, 2.06), paint);
  hood.position.set(0, 0.82, 1.42); hood.rotation.x = 0.05;
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.66), paint);
  scoop.position.set(0, 0.88, 1.52); root.add(scoop);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.93, 0.32, 0.14), chrome);
  frontBumper.position.set(0, 0.50, 2.37);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.22, 0.08), blk);
  grille.position.set(0, 0.62, 2.37);
  // Stacked rectangular headlights
  [-0.62, 0.62].forEach(x => {
    [0.76, 0.58].forEach(y => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.07), hlMat);
      hl.position.set(x, y, 2.36); root.add(hl);
    });
  });
  // Fastback cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.54, 1.84), paint);
  cabin.position.set(0, 1.02, 0.22);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.07, 1.62), paint);
  roof.position.set(0, 1.30, 0.26);
  // Fastback slope
  const fb = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.10, 0.92), paint);
  fb.position.set(0, 0.98, -1.02); fb.rotation.x = 0.56;
  const trunkLid = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.07, 0.82), paint);
  trunkLid.position.set(0, 0.78, -1.86);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.93, 0.30, 0.14), chrome);
  rearBumper.position.set(0, 0.46, -2.38);
  // Three-bar sequential tail lights
  [-0.60, 0.60].forEach(x => {
    for (let b = 0; b < 3; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.06), tailLit);
      bar.position.set(x + (b - 1) * 0.14, 0.72, -2.37); root.add(bar);
    }
  });
  const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.06), dark);
  rearPanel.position.set(0, 0.72, -2.37); root.add(rearPanel);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.04), chrome);
  plate.position.set(0, 0.56, -2.38);
  [-0.52, 0.52].forEach(x => {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), dark);
    ex.position.set(x, 0.30, -2.43); ex.rotation.x = Math.PI / 2; root.add(ex);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.52), glass);
  ws.position.set(0, 1.08, 1.12); ws.rotation.x = 0.48;
  const rg = new THREE.Mesh(new THREE.PlaneGeometry(1.57, 0.48), glass);
  rg.position.set(0, 1.06, -0.90); rg.rotation.x = -0.50; rg.rotation.y = Math.PI;
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.64, 0.46), glass);
    w.position.set(s * 0.97, 1.02, 0.22); w.rotation.y = -s * Math.PI / 2; root.add(w);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.10, 0.25), dark);
    m.position.set(s * 1.04, 0.99, 0.95); root.add(m);
    // C-pillar scoop
    const cp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.38), dark);
    cp.position.set(s * 0.97, 1.0, -0.78); root.add(cp);
  });
  root.add(sill, body, hood, frontBumper, grille, cabin, roof, fb, trunkLid, rearBumper, plate, ws, rg);
  const wheels = makeWheels(root,
    [[-1.03,0.34,1.55,true],[1.03,0.34,1.55,true],[-1.06,0.34,-1.55,false],[1.06,0.34,-1.55,false]],
    0.24, 0.30);
  return { root, wheels };
}

// ── Lamborghini Countach LP400 (1974) ─────────────────────────────────────────
function buildCountach() {
  const root  = new THREE.Group();
  const paint  = new THREE.MeshPhongMaterial({ color: 0xffcc00, shininess: 155, specular: 0x554400 });
  const blk    = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 25 });
  const dark   = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 15 });
  const glass  = new THREE.MeshPhongMaterial({ color: 0x0d181e, transparent: true, opacity: 0.72, shininess: 112 });
  const tailLit = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xddeeee, shininess: 180 });

  // Very low, extreme wedge
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.16, 4.14), dark);
  sill.position.y = 0.40;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.00, 0.28, 4.10), paint);
  body.position.y = 0.54;
  // Cabin (very low, narrow)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.42, 1.74), paint);
  cabin.position.set(0, 0.80, 0.22);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 1.54), paint);
  roof.position.set(0, 1.00, 0.22);
  // Extreme nose slope
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.08, 1.74), paint);
  nose.position.set(0, 0.60, 1.38); nose.rotation.x = 0.18;
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 0.10), blk);
  frontBumper.position.set(0, 0.40, 2.07);
  // Pop-up headlight covers
  [-0.54, 0.54].forEach(x => {
    const hlc = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.38), paint);
    hlc.position.set(x, 0.68, 2.06); root.add(hlc);
  });
  // NACA ducts
  [-1, 1].forEach(s => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.56), dark);
    d.position.set(s * 1.00, 0.66, -0.28); root.add(d);
  });
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.30, 1.44), paint);
  rearDeck.position.set(0, 0.74, -1.28);
  // Large rear wing
  [-0.65, 0.65].forEach(x => {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.12), dark);
    mount.position.set(x, 0.94, -1.92); root.add(mount);
  });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.06, 0.54), dark);
  wing.position.set(0, 1.14, -1.92); root.add(wing);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.00, 0.24, 0.10), blk);
  rearBumper.position.set(0, 0.38, -2.09);
  // Wide rectangular tail lights
  [-0.56, 0.56].forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.06), tailLit);
    tl.position.set(x, 0.62, -2.08); root.add(tl);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.04), chrome);
  plate.position.set(0, 0.47, -2.09);
  // Quad exhausts
  [-0.30, -0.10, 0.10, 0.30].forEach(x => {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 8), dark);
    ex.position.set(x, 0.32, -2.13); ex.rotation.x = Math.PI / 2; root.add(ex);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.50, 0.44), glass);
  ws.position.set(0, 0.92, 1.05); ws.rotation.x = 0.62;
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.38), glass);
    w.position.set(s * 0.95, 0.80, 0.22); w.rotation.y = -s * Math.PI / 2; root.add(w);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.20), blk);
    m.position.set(s * 1.02, 0.82, 0.80); root.add(m);
  });
  root.add(sill, body, cabin, roof, nose, frontBumper, rearDeck, rearBumper, plate, ws);
  const wheels = makeWheels(root,
    [[-1.07,0.34,1.32,true],[1.07,0.34,1.32,true],[-1.11,0.34,-1.32,false],[1.11,0.34,-1.32,false]],
    0.24, 0.32);
  return { root, wheels };
}

// ── Car registry + selector ────────────────────────────────────────────────────
const CARS = [
  { build: buildBMWM1       },
  { build: buildTestarossa  },
  { build: buildPorsche911  },
  { build: buildMustang     },
  { build: buildCountach    },
];

let carIdx = 0;
let { root: car, wheels } = CARS[0].build();
scene.add(car);

function selectCar(idx) {
  if (idx === carIdx) return;
  scene.remove(car);
  carIdx = idx;
  const built = CARS[idx].build();
  car    = built.root;
  wheels = built.wheels;
  car.position.copy(pos);
  car.rotation.y = yaw;
  scene.add(car);
  document.querySelectorAll('.car-card').forEach((c, i) => c.classList.toggle('active', i === idx));
}

document.querySelectorAll('.car-card').forEach((c, i) => c.addEventListener('click', () => selectCar(i)));

// ── Physics state ─────────────────────────────────────────────────────────────
// ReorientationPlugin fires after root tileset loads. Before that, group.matrix
// is identity and no tiles are in the scene. After it fires, local y=0 = WGS84
// ellipsoid surface; Hannover street level ≈ y+101 m. Car starts at y=200 so
// it's visibly above the city and falls to the tile surface via raycasting.
const pos   = new THREE.Vector3(0, 200, 0);
let   yaw   = 0;    // 0 → facing +Z = North
let   speed = 0;    // m/s
let   yVel  = 0;    // vertical m/s
let   everLanded = false; // becomes true on first ground contact
let   spawnY     = 200;   // hover altitude until first tile contact (curvature-adjusted on teleport)

// ── Coordinate utilities ──────────────────────────────────────────────────────
// Scene axes after ReorientationPlugin: X=West, Y=Up, Z=North
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(THREE.MathUtils.degToRad(LAT));

function posToLatLng(p) {
  return { lat: LAT + p.z / M_PER_DEG_LAT, lng: LNG - p.x / M_PER_DEG_LNG };
}

function latLngToScene(lat, lng) {
  const dx = -(lng - LNG) * M_PER_DEG_LNG;
  const dz =  (lat - LAT) * M_PER_DEG_LAT;
  // Earth curves away from the Hannover tangent plane: y_surface ≈ -(dx²+dz²)/(2R)
  const R_EARTH   = 6_371_000;
  const ySurface  = -(dx * dx + dz * dz) / (2 * R_EARTH);
  return new THREE.Vector3(dx, ySurface + 400, dz); // spawn 400 m above local ground
}

// ── Geocoding (Nominatim / OpenStreetMap — no extra key required) ─────────────
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res  = await fetch(url, { headers: { 'Accept-Language': 'tr,en' } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function reverseGeocode(lat, lng) {
  const url  = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res  = await fetch(url, { headers: { 'Accept-Language': 'tr,en' } });
  const data = await res.json();
  if (!data.address) return null;
  const a    = data.address;
  const road = a.road || a.pedestrian || a.footway || a.cycleway || a.suburb || '';
  const city = a.city || a.town || a.village || a.county || '';
  return [road, city].filter(Boolean).join(', ') || data.display_name;
}

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = new Set();
window.addEventListener('keydown', e => {
  if (document.activeElement?.id === 'searchInput') return;
  keys.add(e.code);
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (document.activeElement?.id === 'searchInput') return;
  keys.delete(e.code);
});

// ── Address search ────────────────────────────────────────────────────────────
const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');

async function doSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  searchBtn.disabled  = true;
  searchStatus.textContent = 'aranıyor…';
  const result = await geocodeAddress(query).catch(() => null);
  searchBtn.disabled = false;
  if (!result) { searchStatus.textContent = '⚠ bulunamadı'; return; }
  searchStatus.textContent = '⏳ yükleniyor…';
  const newPos = latLngToScene(result.lat, result.lng);
  pos.copy(newPos);
  spawnY = newPos.y;
  speed = 0; yVel = 0; everLanded = false;
  searchInput.blur();
}

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

// ── Ground raycasting ─────────────────────────────────────────────────────────
const ray       = new THREE.Raycaster();
ray.far         = 800;
const DOWN      = new THREE.Vector3(0, -1, 0);
const CAST_LIFT = 120;
const WHEEL_R   = 0.34;

function groundY(p) {
  ray.set(new THREE.Vector3(p.x, p.y + CAST_LIFT, p.z), DOWN);
  const targets = tiles ? [tiles.group] : scene.children;
  const hits    = ray.intersectObjects(targets, true);
  return hits.length ? hits[0].point.y : null;
}

// ── Camera ────────────────────────────────────────────────────────────────────
const CAM_DIST  = 9;
const CAM_H     = 2.8;
const camPos    = new THREE.Vector3(0, 202.8, -9);
const camLookAt = new THREE.Vector3();

let camYaw   = 0;  // horizontal orbit offset (radians)
let camPitch = 0;  // vertical pitch offset  (radians, + = higher)

// Pointer lock: click canvas to grab mouse, Esc to release
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camYaw   -= e.movementX * 0.003;
  camPitch  = THREE.MathUtils.clamp(camPitch + e.movementY * 0.003, -0.25, 1.1);
});

// Init camera so first tiles.update() gets a sensible frustum
camera.position.copy(camPos);
camera.lookAt(pos.x, pos.y + 1.2, pos.z);
camera.updateMatrixWorld();

// ── Minimap (Leaflet / OpenStreetMap) ─────────────────────────────────────────
const miniMap   = window.L.map('minimap', { zoomControl: false, attributionControl: false });
window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap);
miniMap.setView([LAT, LNG], 17);

const carDot = window.L.circleMarker([LAT, LNG], {
  radius: 8, color: '#fff', weight: 2, fillColor: '#4488ff', fillOpacity: 1,
}).addTo(miniMap);

let lastMapUpdateMs = 0;

// ── Physics constants ─────────────────────────────────────────────────────────
const GRAVITY = -18;
const MAX_SPD = 28;
const ACCEL   = 10;
const BRAKE   = 22;
const DRAG    = 3.5;
const STEER   = 1.5;

// ── HUD & debug ───────────────────────────────────────────────────────────────
const speedEl   = document.getElementById('speed');
const addressEl = document.getElementById('address');

const dbgStatus = document.getElementById('dbg-status');
const dbgVis    = document.getElementById('dbg-vis');
const barRoot   = document.getElementById('bar-root');
const valRoot   = document.getElementById('val-root');
const barMin    = document.getElementById('bar-min');
const valMin    = document.getElementById('val-min');
const valRend   = document.getElementById('val-rend');
const valErr    = document.getElementById('val-err');

function setBar(fill, val, count, max) {
  const pct = Math.min(count / max * 100, 100);
  fill.style.width = pct + '%';
  fill.style.backgroundColor = pct < 50 ? '#00cc66' : pct < 80 ? '#ffcc00' : '#ff4422';
  val.textContent  = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count;
}

let currentAddress = 'konum belirleniyor…';
let lastRevGeoMs   = 0;
let lastRevGeoPos  = new THREE.Vector3(Infinity, 0, Infinity);

const rateLimitEl      = document.getElementById('ratelimit');
const rateLimitCntEl   = document.getElementById('ratelimit-countdown');
let   rateLimited      = false;

// ── Main loop ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  const fwd   = keys.has('ArrowUp')    || keys.has('KeyW');
  const back  = keys.has('ArrowDown')  || keys.has('KeyS');
  const left  = keys.has('ArrowLeft')  || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');

  // Speed
  if (fwd)       speed += ACCEL * dt;
  else if (back) speed -= BRAKE * dt;
  else           speed -= Math.sign(speed) * Math.min(Math.abs(speed), DRAG * dt);
  speed = THREE.MathUtils.clamp(speed, -MAX_SPD * 0.3, MAX_SPD);

  // Steer
  if (Math.abs(speed) > 0.5) {
    const dir = (left ? 1 : 0) - (right ? 1 : 0);
    yaw += dir * Math.sign(speed) * STEER * (Math.abs(speed) / MAX_SPD) * dt;
  }

  // Move
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  pos.addScaledVector(forward, speed * dt);

  // Gravity + ground snap
  yVel  += GRAVITY * dt;
  pos.y += yVel * dt;

  const gY = groundY(pos);
  if (gY !== null && pos.y < gY + WHEEL_R) {
    pos.y      = gY + WHEEL_R;
    yVel       = 0;
    everLanded = true;
  } else if (!everLanded) {
    // Tiles not yet loaded — hold at curvature-adjusted spawn height
    pos.y = spawnY;
    yVel  = 0;
  }
  // After first landing: let gravity work normally; car may briefly float over
  // unloaded tile gaps but won't teleport back to 200 m

  // Car mesh
  car.position.copy(pos);
  car.rotation.y = yaw;
  wheels.forEach(w => (w.rotation.x += (speed * dt) / WHEEL_R));

  // Camera follow with mouse orbit
  const locked   = document.pointerLockElement === renderer.domElement;
  if (!locked) {
    camYaw   *= Math.exp(-3 * dt);                              // spring back to behind
    camPitch -= (camPitch - 0) * (1 - Math.exp(-3 * dt));
  }
  const totalYaw = yaw + camYaw;
  const hDist    = CAM_DIST * Math.cos(camPitch);
  const desired  = new THREE.Vector3(
    pos.x - Math.sin(totalYaw) * hDist,
    pos.y + CAM_H + CAM_DIST * Math.sin(camPitch),
    pos.z - Math.cos(totalYaw) * hDist,
  );
  camPos.lerp(desired, 1 - Math.exp(-8 * dt));
  camLookAt.set(pos.x, pos.y + 1.2, pos.z);
  camera.position.copy(camPos);
  camera.lookAt(camLookAt);

  // Minimap update (max twice per second)
  const nowMap = Date.now();
  if (nowMap - lastMapUpdateMs > 500) {
    lastMapUpdateMs = nowMap;
    const { lat, lng } = posToLatLng(pos);
    carDot.setLatLng([lat, lng]);
    miniMap.setView([lat, lng], miniMap.getZoom());
  }

  // ── Rate-limit guard ──────────────────────────────────────────────────────
  // Keep rendMin fresh every frame (prune expired entries)
  {
    const nowRl = Date.now();
    while (quota._rendWindow.length && quota._rendWindow[0] < nowRl - 60000) quota._rendWindow.shift();
    quota.rendMin = quota._rendWindow.length;
  }
  if (quota.rendMin >= 10000) rateLimited = true;

  if (rateLimited) {
    if (quota.rendMin < 10000) {
      rateLimited = false;
      if (rateLimitEl) rateLimitEl.style.display = 'none';
    } else {
      speed = 0;
      const secsLeft = quota._rendWindow.length
        ? Math.ceil((quota._rendWindow[0] + 60000 - Date.now()) / 1000)
        : 0;
      if (rateLimitEl)    rateLimitEl.style.display  = 'flex';
      if (rateLimitCntEl) rateLimitCntEl.textContent = `${secsLeft}s`;
    }
  }

  if (tiles) {
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    if (!rateLimited) tiles.update();
  }

  // Reverse geocoding — max once per 5 s, only when moved > 60 m
  const nowMs = Date.now();
  if (nowMs - lastRevGeoMs > 5000 && pos.distanceTo(lastRevGeoPos) > 60) {
    lastRevGeoMs = nowMs;
    lastRevGeoPos.copy(pos);
    const { lat, lng } = posToLatLng(pos);
    reverseGeocode(lat, lng).then(addr => { if (addr) currentAddress = addr; }).catch(() => {});
  }

  // Clear teleport loading status once tiles appear
  if (searchStatus?.textContent === '⏳ yükleniyor…') {
    const vis = tiles ? (tiles.visibleTiles?.size ?? 0) : 0;
    if (everLanded || vis > 0) searchStatus.textContent = '✓ ışınlandı';
  }

  // HUD
  speedEl.textContent = `${Math.round(Math.abs(speed) * 3.6)} km/h`;
  if (addressEl) addressEl.textContent = currentAddress;

  // Debug panel
  {
    const vis      = tiles ? (tiles.visibleTiles?.size ?? 0) : 0;
    const inFlight = tiles ? (tiles.downloadQueue?.jobs ?? 0) : 0;

    let status = '';
    if (!API_KEY)          status = '⚠ API key yok';
    else if (vis === 0)    status = '⏳ bekleniyor…';
    else if (inFlight > 0) status = `⬇ ${inFlight} indiriliyor`;
    else                   status = '✓ yüklendi';

    if (dbgStatus) dbgStatus.textContent = status;
    if (dbgVis)    dbgVis.textContent    = vis;
    if (barRoot && valRoot) setBar(barRoot, valRoot, quota.rootDay, 10000);
    if (barMin  && valMin)  setBar(barMin,  valMin,  quota.rendMin, 12000);
    if (valRend) valRend.textContent = quota.rendDay >= 1000 ? (quota.rendDay/1000).toFixed(1)+'k' : quota.rendDay;
    if (valErr)  valErr.textContent  = quota.errors;
  }

  renderer.render(scene, camera);
}());

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
