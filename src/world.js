import * as THREE from 'three';
import {
  HALF, CH, ZONES, TRACKS, FARM, RIVERS, LAKES, CITY_BLOCKS, WORD_BLOCKS, PLAZA_BLOCK, KEEP_CLEAR,
  riverCenter, bridgeAt, mulberry, hash2, vnoise, isWater, inCity, inLake, outside,
  staticCircles, staticRects, blockedStatic,
} from './worldgen.js';

export { HALF };
export const ISLAND = HALF * 2;

// ---------- original pixel textures drawn in code (no Minecraft assets) ----------
export function pixelTex(base, jitter, { border = null, seed = 1, lines = 0, size = 16, tiles = 1, draw = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size * tiles;
  const x = c.getContext('2d');
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const b = new THREE.Color(base);
  for (let tx = 0; tx < tiles; tx++) for (let ty = 0; ty < tiles; ty++) {
    const tone = 1 + (rnd() - .5) * (tiles > 1 ? .22 : 0);
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      const k = tone * (1 + (rnd() - .5) * jitter);
      x.fillStyle = `rgb(${Math.min(255, b.r * 255 * k) | 0},${Math.min(255, b.g * 255 * k) | 0},${Math.min(255, b.b * 255 * k) | 0})`;
      x.fillRect(tx * size + i, ty * size + j, 1, 1);
    }
    if (lines) { x.fillStyle = '#0003'; for (let j = 3; j < size; j += lines) x.fillRect(tx * size, ty * size + j, size, 1); }
    if (border) { x.strokeStyle = border; x.lineWidth = 1; x.strokeRect(tx * size + .5, ty * size + .5, size - 1, size - 1); }
  }
  if (draw) draw(x);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mat = t => new THREE.MeshLambertMaterial({ map: t });
function repeated(tex, rx, ry) {
  const t = tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return t;
}
const solid = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

export const mats = {
  grassTop: mat(pixelTex('#6cc04a', .35, { seed: 3 })),
  dirt: mat(pixelTex('#8a6a43', .3, { seed: 7 })),
  stone: mat(pixelTex('#9aa0a8', .3, { seed: 9 })),
  wood: mat(pixelTex('#c98a4b', .25, { seed: 11, border: '#7a4a1c', lines: 4 })),
  plank: mat(pixelTex('#b9824a', .25, { seed: 12, lines: 3 })),
  trunk: mat(pixelTex('#7b5230', .3, { seed: 13, lines: 3 })),
  leaf: mat(pixelTex('#3f9a3a', .45, { seed: 15 })),
  gold: mat(pixelTex('#ffc83a', .2, { seed: 17, border: '#b07a00', lines: 4 })),
  cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb8d0 }),
  ghost: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .32 }),
  water: new THREE.MeshLambertMaterial({ color: 0x3aa7ff, transparent: true, opacity: .85, emissive: 0x0a3f6e }),
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (w, h, d, m, x, y, z, parent = null, shadow = true) => {
  const o = new THREE.Mesh(BOX, m); o.scale.set(w, h, d); o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true; if (parent) parent.add(o); return o;
};

export function makeWoodBlock(mt = mats.wood) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mt);
  mesh.castShadow = true;
  return mesh;
}

// ============================================================ the world
export function buildWorld(scene, renderer) {
  scene.background = new THREE.Color(0x7ec8ff);
  scene.fog = new THREE.Fog(0x7ec8ff, 55, 150);
  renderer.localClippingEnabled = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb06a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2cc, 2.0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // ---- sea around the island + the island ground (both follow the hero, so they are tiny) ----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), solid(0x2b8fe0, { emissive: 0x0b3a66 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.4; scene.add(sea);
  const GS = 640;
  const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), HALF), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), HALF), new THREE.Plane(new THREE.Vector3(0, 0, -1), HALF)];
  const gtex = repeated(pixelTex('#6cc04a', .35, { seed: 3, tiles: 4 }), GS / 4, GS / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), new THREE.MeshLambertMaterial({ map: gtex, clippingPlanes: clip }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const dirtWall = [[0, HALF, 0], [0, -HALF, Math.PI], [HALF, 0, Math.PI / 2], [-HALF, 0, -Math.PI / 2]];
  for (const [wx, wz, ry] of dirtWall) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND, 12), mat(repeated(mats.dirt.map, ISLAND, 12)));
    w.position.set(wx, -6, wz); w.rotation.y = ry; scene.add(w);
  }

  // ---- rivers: one wavy strip each, plus bridges ----
  for (const r of RIVERS) {
    const pos = [], idx = [];
    const n = Math.ceil(ISLAND / 3);
    for (let k = 0; k <= n; k++) {
      const u = -HALF + k * 3, c = riverCenter(r, u);
      for (const side of [-1, 1]) {
        const v = c + side * r.w / 2;
        pos.push(r.axis === 'z' ? v : u, 0.06, r.axis === 'z' ? u : v);
      }
      if (k < n) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.water); m.material.side = THREE.DoubleSide; scene.add(m);

    for (let ub = bridgeAt(r, -HALF + 60); ub < HALF - 60; ub += r.every) {
      const c = riverCenter(r, ub), slope = r.amp / r.wl * Math.cos(ub / r.wl + r.ph);
      const g2 = new THREE.Group();
      g2.position.set(r.axis === 'z' ? c : ub, 0, r.axis === 'z' ? ub : c);
      g2.rotation.y = r.axis === 'z' ? Math.atan(slope) : -Math.atan(slope);
      const L = r.w + 9;
      const lx = r.axis === 'z' ? L : 8, lz = r.axis === 'z' ? 8 : L;
      box(lx, .7, lz, mats.plank, 0, .35, 0, g2);
      for (const s of [-1, 1]) {
        const rx = r.axis === 'z' ? 0 : s * 3.7, rz = r.axis === 'z' ? s * 3.7 : 0;
        box(r.axis === 'z' ? L : .5, .5, r.axis === 'z' ? .5 : L, mats.wood, rx, 1.5, rz, g2);
        for (let q = -1; q <= 1; q += .5) box(.6, 1.6, .6, mats.trunk, r.axis === 'z' ? q * L * .46 : rx, 1, r.axis === 'z' ? rz : q * L * .46, g2);
      }
      scene.add(g2);
    }
  }

  // ---- lakes ----
  for (const l of LAKES) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(l.r, 40), mats.water);
    m.rotation.x = -Math.PI / 2; m.position.set(l.x, .06, l.z); scene.add(m);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(l.r + 2.5, 40), solid(0xe8d9a0));
    sand.rotation.x = -Math.PI / 2; sand.position.set(l.x, .04, l.z); scene.add(sand);
  }

  // =========================================================== the city
  const animated = [];
  buildCity(scene, animated);
  buildPark(scene, animated);
  buildFarm(scene);
  buildTrack(scene, TRACKS.car, 0x3b3f4a);
  buildTrack(scene, TRACKS.animal, 0xb98a55);

  // ---- clouds that follow the hero loosely ----
  const clouds = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const cl = new THREE.Group(), parts = 3 + (i % 3);
    for (let k = 0; k < parts; k++) box(3 + (k % 2) * 2, 1.4, 3, mats.cloud, k * 2.8, (k % 2) * .6, 0, cl, false);
    const rr = mulberry(i + 7);
    cl.position.set((rr() * 2 - 1) * 230, 26 + rr() * 18, (rr() * 2 - 1) * 230);
    cl.userData.speed = 1 + rr() * 1.5;
    clouds.add(cl);
  }
  scene.add(clouds);

  // ============================================== chunks: trees, rocks, hills, flowers
  const chunks = new Map();
  const ckey = (cx, cz) => cx + ',' + cz;
  const flowerCols = [0xff5a7a, 0xffd23f, 0xffffff, 0xb36bff];
  const mtx = new THREE.Matrix4(), col = new THREE.Color();

  function clearAt(x, z, pad = 0) {
    if (outside(x, z, 6) || isWater(x, z) || inLake(x, z, 4 + pad)) return false;
    if (inCity(x, z, 8)) return false;
    for (const k of KEEP_CLEAR) if (Math.hypot(x - k.x, z - k.z) < k.r + pad) return false;
    for (const t of Object.values(TRACKS)) if (Math.abs(x - t.x) < 30 && z > t.z0 - 25 && z < t.z0 + t.len + 25) return false;
    for (const f of [FARM.kitchen, FARM.barn, ...FARM.plots]) if (Math.hypot(x - f.x, z - f.z) < 16 + pad) return false;
    // keep near the river banks free so bridges are easy to find
    for (const r of RIVERS) { const u = r.axis === 'z' ? z : x, v = r.axis === 'z' ? x : z; if (Math.abs(v - riverCenter(r, u)) < r.w / 2 + 4) return false; }
    return true;
  }

  function buildChunk(cx, cz) {
    const rnd = mulberry(cx * 7919 + cz * 104729 + 13);
    const x0 = cx * CH, z0 = cz * CH;
    const objs = [], meshes = [];
    const trunk = [], leaf = [], leafShade = [], stone = [], grassTop = [];
    const forest = vnoise((x0 + 4000) / 260, (z0 + 4000) / 260, 3);
    const dens = forest > .56 ? 3.2 : forest > .42 ? 1.1 : .35;
    const startFade = Math.hypot(x0 + CH / 2, z0 + CH / 2) < 150 ? .35 : 1;
    const nTrees = Math.round(26 * dens * startFade * (.7 + rnd() * .6));
    const placed = [];
    for (let t = 0, tries = 0; t < nTrees && tries < nTrees * 6; tries++) {
      const x = Math.round(x0 + rnd() * CH), z = Math.round(z0 + rnd() * CH);
      if (!clearAt(x, z, 2)) continue;
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 4)) continue;
      placed.push([x, z]); t++;
      const th = 2 + ((rnd() * 3) | 0);
      for (let i = 0; i < th; i++) trunk.push([x, .5 + i, z]);
      for (const [y, r] of [[th + .5, 2], [th + 1.5, 1], [th + 2.5, 0]])
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
          if (Math.abs(a) === r && Math.abs(b) === r && r > 1) continue;
          leaf.push([x + a, y, z + b]); leafShade.push(.8 + rnd() * .35);
        }
      objs.push({ x, z, r: 1.7 });
    }
    // rocks
    for (let t = 0; t < 3; t++) {
      const x = Math.round(x0 + rnd() * CH), z = Math.round(z0 + rnd() * CH);
      if (rnd() > .6 || !clearAt(x, z, 3)) continue;
      stone.push([x, .5, z]); if (rnd() > .4) stone.push([x + 1, .5, z]); if (rnd() > .6) stone.push([x, 1.5, z]);
      objs.push({ x: x + .4, z, r: 1.6 });
    }
    // hill
    if (rnd() < .2) {
      const hr = 4 + ((rnd() * 5) | 0), hx = Math.round(x0 + hr + 3 + rnd() * (CH - 2 * hr - 6)), hz = Math.round(z0 + hr + 3 + rnd() * (CH - 2 * hr - 6));
      if (clearAt(hx, hz, hr + 6)) {
        for (let lv = 0; lv < hr; lv++) {
          const rr = hr - lv;
          for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
            if (a * a + b * b > rr * rr + 1) continue;
            (lv === hr - 1 || a * a + b * b > (rr - 1) * (rr - 1) ? grassTop : stone).push([hx + a, .5 + lv, hz + b]);
          }
        }
        objs.push({ x: hx, z: hz, r: hr + .8 });
      }
    }
    const inst = (m, list, shade) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(BOX, m, list.length);
      list.forEach((q, k) => { mtx.makeTranslation(q[0], q[1], q[2]); im.setMatrixAt(k, mtx); if (shade) im.setColorAt(k, col.setScalar(shade[k])); });
      im.castShadow = true; im.receiveShadow = true; scene.add(im); meshes.push(im);
    };
    inst(mats.trunk, trunk); inst(mats.leaf, leaf, leafShade); inst(mats.stone, stone); inst(mats.grassTop, grassTop);
    // flowers: stem + head in one instanced mesh
    const nf = 30, fl = new THREE.InstancedMesh(BOX, solid(0xffffff), nf * 2);
    let fi = 0;
    for (let i = 0; i < nf; i++) {
      const x = x0 + rnd() * CH, z = z0 + rnd() * CH;
      if (!clearAt(x, z, 0) || (hash2(Math.floor(x), Math.floor(z)) > .8)) { continue; }
      mtx.compose(new THREE.Vector3(x, .2, z), new THREE.Quaternion(), new THREE.Vector3(.07, .4, .07)); fl.setMatrixAt(fi, mtx); fl.setColorAt(fi++, col.set(0x2e8b3a));
      mtx.compose(new THREE.Vector3(x, .46, z), new THREE.Quaternion(), new THREE.Vector3(.2, .2, .2)); fl.setMatrixAt(fi, mtx); fl.setColorAt(fi++, col.set(flowerCols[i % 4]));
    }
    fl.count = fi; scene.add(fl); meshes.push(fl);
    chunks.set(ckey(cx, cz), { objs, meshes, cx, cz });
  }
  function dropChunk(c) { for (const m of c.meshes) { scene.remove(m); m.dispose(); } chunks.delete(ckey(c.cx, c.cz)); }

  const R = 2;
  function streamChunks(hx, hz, budget = 2) {
    const ccx = Math.floor(hx / CH), ccz = Math.floor(hz / CH);
    const need = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const cx = ccx + i, cz = ccz + j;
      if (Math.abs(cx * CH) > HALF + CH || Math.abs(cz * CH) > HALF + CH) continue;
      if (!chunks.has(ckey(cx, cz))) need.push([cx, cz, Math.abs(i) + Math.abs(j)]);
    }
    need.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of need.slice(0, budget)) buildChunk(cx, cz);
    for (const c of [...chunks.values()]) if (Math.abs(c.cx - ccx) > R + 1 || Math.abs(c.cz - ccz) > R + 1) dropChunk(c);
  }

  // ---------------- collision ----------------
  function collide(p, prev) {
    if (blockedStatic(p.x, p.z, 0.8)) {
      if (!blockedStatic(p.x, prev.z, 0.8)) p.z = prev.z;
      else if (!blockedStatic(prev.x, p.z, 0.8)) p.x = prev.x;
      else { p.x = prev.x; p.z = prev.z; }
    }
    const push = (cx, cz, r) => {
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), rr = r + .7;
      if (d < rr) { const k = rr / Math.max(d, 1e-4); p.x = cx + dx * k; p.z = cz + dz * k; }
    };
    for (const c of staticCircles) if (Math.abs(p.x - c.x) < 30 && Math.abs(p.z - c.z) < 30) push(c.x, c.z, c.r);
    const ccx = Math.floor(p.x / CH), ccz = Math.floor(p.z / CH);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = chunks.get(ckey(ccx + i, ccz + j));
      if (c) for (const o of c.objs) if (Math.abs(p.x - o.x) < 12 && Math.abs(p.z - o.z) < 12) push(o.x, o.z, o.r);
    }
  }

  let t = 0;
  function update(dt, hx, hz) {
    t += dt;
    sun.position.set(hx - 12, 24, hz + 14); sun.target.position.set(hx, 0, hz);
    ground.position.set(Math.round(hx / 4) * 4, 0, Math.round(hz / 4) * 4);
    sea.position.set(hx, -.4, hz);
    streamChunks(hx, hz);
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x - hx > 240) c.position.x -= 480; else if (c.position.x - hx < -240) c.position.x += 480;
      if (c.position.z - hz > 240) c.position.z -= 480; else if (c.position.z - hz < -240) c.position.z += 480;
    }
    for (const a of animated) a(dt, t);
  }
  streamChunks(0, 6, 99);
  return { update, collide, stream: streamChunks, chunkCount: () => chunks.size };
}

// ============================================================ city
function facadeMat(color, seed) {
  return mat(pixelTex(color, .1, { seed, draw: x => {
    for (const [wx, wy] of [[2, 2], [9, 2], [2, 9], [9, 9]]) { x.fillStyle = '#35507a'; x.fillRect(wx, wy, 5, 5); x.fillStyle = '#bfe6ff'; x.fillRect(wx, wy, 5, 1); x.fillRect(wx, wy, 1, 5); }
  } }));
}
function buildCity(scene, animated) {
  const C = ZONES.city;
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2, C.hd * 2), mat(repeated(pixelTex('#9a9aa0', .2, { seed: 21 }), C.hw * 2 / 2, C.hd * 2 / 2)));
  pave.rotation.x = -Math.PI / 2; pave.position.set(C.x, .03, C.z); pave.receiveShadow = true; scene.add(pave);
  const roadTex = pixelTex('#6a6d78', .12, { seed: 23, draw: x => { x.fillStyle = '#ffd23f'; for (let j = 2; j < 10; j++) x.fillRect(7, j, 2, 1); } });
  for (let k = 0; k <= 6; k++) {
    const off = -240 + k * 80;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(12, C.hd * 2), mat(repeated(roadTex, 1, C.hd * 2 / 16)));
    v.rotation.x = -Math.PI / 2; v.position.set(C.x + off, .05, C.z); scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(12, C.hw * 2), mat(repeated(roadTex, 1, C.hw * 2 / 16)));
    h.rotation.x = -Math.PI / 2; h.rotation.z = Math.PI / 2; h.position.set(C.x, .052, C.z + off); scene.add(h);
  }
  // buildings = shells of 4x4x4 window cubes (5 colours -> 5 draw calls)
  const colors = ['#e8b4a0', '#a8c8f0', '#f5e08a', '#b8e0b0', '#d4b0e8'];
  const lists = colors.map(() => []);
  const rnd = mulberry(77);
  const reserved = new Set(WORD_BLOCKS.map(([i, j]) => i + ',' + j));
  reserved.add(PLAZA_BLOCK.i + ',' + PLAZA_BLOCK.j);
  for (const b of CITY_BLOCKS) {
    if (reserved.has(b.i + ',' + b.j)) continue;
    for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (rnd() < .3) continue;
      const w = 12 + 4 * ((rnd() * 2) | 0), d = 12 + 4 * ((rnd() * 2) | 0), floors = 2 + ((rnd() * 7) | 0);
      const cx = b.x + qx * 17, cz = b.z + qz * 17, ci = (rnd() * colors.length) | 0;
      const nx = w / 4, nz = d / 4;
      for (let f = 0; f < floors; f++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const shell = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
        if (!shell && f < floors - 1) continue;
        lists[ci].push([cx - w / 2 + 2 + i * 4, 2 + f * 4, cz - d / 2 + 2 + j * 4]);
      }
      staticRects.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    }
  }
  const m4 = new THREE.Matrix4(), cube = new THREE.BoxGeometry(4, 4, 4);
  colors.forEach((c, i) => {
    if (!lists[i].length) return;
    const im = new THREE.InstancedMesh(cube, facadeMat(c, 40 + i), lists[i].length);
    lists[i].forEach((q, k) => { m4.makeTranslation(q[0], q[1], q[2]); im.setMatrixAt(k, m4); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  });
  // plaza fountain
  const P = PLAZA_BLOCK;
  for (let a = 0; a < 20; a++) box(2, 1.2, 2, mats.stone, P.x + Math.cos(a / 20 * Math.PI * 2) * 9, .6, P.z + Math.sin(a / 20 * Math.PI * 2) * 9, scene);
  const w = new THREE.Mesh(new THREE.CircleGeometry(8.2, 24), mats.water); w.rotation.x = -Math.PI / 2; w.position.set(P.x, .9, P.z); scene.add(w);
  box(2, 5, 2, mats.stone, P.x, 2.5, P.z, scene); box(4, 1, 4, mats.stone, P.x, 5.4, P.z, scene);
  staticCircles.push({ x: P.x, z: P.z, r: 10.5 });
}

// ============================================================ amusement park
function buildPark(scene, animated) {
  const Z = ZONES.park;
  const pave = new THREE.Mesh(new THREE.CircleGeometry(Z.r - 20, 48), solid(0xe7d6b0));
  pave.rotation.x = -Math.PI / 2; pave.position.set(Z.x, .03, Z.z); pave.receiveShadow = true; scene.add(pave);
  const cols = [0xff5a7a, 0xffd23f, 0x4cd3ff, 0x7dff7a, 0xb36bff, 0xff9a4d];
  const cm = cols.map(c => solid(c));

  // ferris wheel
  const fx = Z.x - 40, fz = Z.z + 50;
  const wheel = new THREE.Group(); wheel.position.set(fx, 17, fz); scene.add(wheel);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const spoke = box(.5, 14, .5, mats.stone, Math.cos(a) * 7, Math.sin(a) * 7, 0, wheel); spoke.rotation.z = a - Math.PI / 2;
    const gon = new THREE.Group(); gon.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0); gon.userData.keep = true; wheel.add(gon);
    box(3, 2.4, 3, cm[i % 6], 0, -1.4, 0, gon); box(3.4, .4, 3.4, mats.stone, 0, .2, 0, gon);
  }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box(1.2, 1.2, 1.2, mats.stone, Math.cos(a) * 14, Math.sin(a) * 14, 0, wheel); }
  box(1.6, 17, 1.6, mats.trunk, fx - 7, 8, fz + 3, scene); box(1.6, 17, 1.6, mats.trunk, fx + 7, 8, fz + 3, scene);
  box(1.6, 17, 1.6, mats.trunk, fx - 7, 8, fz - 3, scene); box(1.6, 17, 1.6, mats.trunk, fx + 7, 8, fz - 3, scene);
  staticCircles.push({ x: fx, z: fz, r: 9 });
  animated.push((dt) => { wheel.rotation.z -= dt * .25; wheel.children.forEach(c => { if (c.userData.keep) c.rotation.z = -wheel.rotation.z; }); });

  // carousel
  const kx = Z.x + 45, kz = Z.z + 35;
  const car = new THREE.Group(); car.position.set(kx, 0, kz); scene.add(car);
  box(13, 1, 13, mats.stone, 0, .5, 0, car);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, px = Math.cos(a) * 4.5, pz = Math.sin(a) * 4.5;
    box(.4, 5, .4, mats.plank, px, 3.5, pz, car); box(1.6, 1.4, 2.2, cm[i % 6], px, 2.2, pz, car);
  }
  box(14, .8, 14, solid(0xff5a7a), kx - kx, 6.4, 0, car); box(9, .8, 9, solid(0xffd23f), 0, 7.2, 0, car); box(4, .8, 4, solid(0xff5a7a), 0, 8, 0, car);
  staticCircles.push({ x: kx, z: kz, r: 7.5 });
  animated.push((dt) => { car.rotation.y += dt * .6; });

  // slide with stairs
  const sx = Z.x + 10, sz = Z.z - 40;
  for (let i = 0; i < 7; i++) box(5, 1, 3, cm[i % 6], sx, .5 + i, sz + i * 1.2, scene);
  const ramp = box(5, .6, 14, solid(0xffd23f), sx, 4.4, sz + 15, scene); ramp.rotation.x = .55;
  staticRects.push({ x0: sx - 3, z0: sz - 2, x1: sx + 3, z1: sz + 11 });

  // flags
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, x = Z.x + Math.cos(a) * 92, z = Z.z + Math.sin(a) * 92;
    box(.4, 6, .4, mats.trunk, x, 3, z, scene); box(2, 1.4, .2, cm[i % 6], x + 1, 5.4, z, scene);
  }
}

// ============================================================ farm
function buildFarm(scene) {
  const dirt = solid(0x6b4a2a), wood = mats.plank;
  for (const p of FARM.plots) {
    box(10, .3, 10, dirt, p.x, .15, p.z, scene, false);
    for (let i = -4; i <= 4; i += 4) box(10.4, .5, .4, wood, p.x, .3, p.z + i * 1.25, scene, false);
  }
  const k = FARM.kitchen;                                   // kitchen hut with a stove
  box(11, 5, 9, mats.wood, k.x, 2.5, k.z, scene); box(12, 1, 10, solid(0xc0392b), k.x, 5.5, k.z, scene); box(9, 1, 8, solid(0xc0392b), k.x, 6.4, k.z, scene);
  box(3, 3.4, .5, solid(0x40302a), k.x, 1.7, k.z + 4.7, scene); box(2, 2, 2, mats.stone, k.x + 5.8, 1, k.z + 1, scene); box(1, 3, 1, mats.stone, k.x + 5.8, 3.5, k.z + 1, scene);
  staticRects.push({ x0: k.x - 5.8, z0: k.z - 4.6, x1: k.x + 5.8, z1: k.z + 4.6 });
  const b = FARM.barn;                                      // barn
  box(18, 8, 12, solid(0xb83a30), b.x, 4, b.z, scene); box(19, 1, 13, solid(0x8a2a22), b.x, 8.4, b.z, scene); box(15, 1, 10, solid(0x8a2a22), b.x, 9.4, b.z, scene);
  box(5, 6, .5, solid(0xfff1d6), b.x, 3, b.z + 6.2, scene);
  staticRects.push({ x0: b.x - 9, z0: b.z - 6, x1: b.x + 9, z1: b.z + 6 });
  const fz0 = 646, fz1 = 770, fx0 = -500, fx1 = -350;
  for (let x = fx0; x <= fx1; x += 3) for (const z of [fz0, fz1]) box(.5, 1.6, .5, wood, x, .8, z, scene);
  for (let z = fz0; z <= fz1; z += 3) for (const x of [fx0, fx1]) box(.5, 1.6, .5, wood, x, .8, z, scene);
  box(150, .35, .3, wood, (fx0 + fx1) / 2, 1.2, fz0, scene); box(150, .35, .3, wood, (fx0 + fx1) / 2, 1.2, fz1, scene);
  box(.3, .35, 124, wood, fx0, 1.2, (fz0 + fz1) / 2, scene); box(.3, .35, 124, wood, fx1, 1.2, (fz0 + fz1) / 2, scene);
}

// ============================================================ race tracks
function buildTrack(scene, T, color) {
  const w = T.lanes * T.gap + 4, cx = T.x, cz = T.z0 + T.len / 2;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(w, T.len + 16), solid(color)); road.rotation.x = -Math.PI / 2; road.position.set(cx, .06, cz); road.receiveShadow = true; scene.add(road);
  const white = solid(0xffffff);
  for (let l = 1; l < T.lanes; l++) for (let z = T.z0; z < T.z0 + T.len; z += 6) box(.3, .05, 3, white, cx - w / 2 + 2 + l * T.gap, .09, z + 1.5, scene, false);
  const line = (z, n) => { for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) box(w / n, .06, 1.2, (i + j) % 2 ? solid(0x111111) : white, cx - w / 2 + (i + .5) * w / n, .1, z + j * 1.2, scene, false); };
  line(T.z0, 8); line(T.z0 + T.len, 8);
  for (const s of [-1, 1]) {
    for (let z = T.z0 - 4; z <= T.z0 + T.len + 4; z += 6) { box(.6, 1.4, .6, mats.plank, cx + s * (w / 2 + 1), .7, z, scene); }
    box(.4, .4, T.len + 12, mats.plank, cx + s * (w / 2 + 1), 1.2, cz, scene);
    box(.5, 9, .5, mats.trunk, cx + s * (w / 2 + 1), 4.5, T.z0, scene, true);
    for (let i = 0; i < 5; i++) box(3, 1.2 + i * .9, 5, mats.plank, cx + s * (w / 2 + 6 + i * 3), .6 + i * .45, cz + (i % 2) * 6, scene);
  }
  box(w + 4, 1.4, .8, solid(0xff5a7a), cx, 9.2, T.z0, scene);                           // start arch
  box(10, 1.2, .5, white, cx, 9.2, T.z0 + .5, scene);
}
