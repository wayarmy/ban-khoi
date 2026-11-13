import * as THREE from 'three';

export const ISLAND = 300;            // island is ISLAND x ISLAND blocks (about 90,000)
export const HALF = ISLAND / 2;

// ---------- original pixel textures drawn in code (no Minecraft assets) ----------
function pixelTex(base, jitter, { border = null, seed = 1, lines = 0, size = 16, tiles = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size * tiles;
  const x = c.getContext('2d');
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const b = new THREE.Color(base);
  for (let tx = 0; tx < tiles; tx++) for (let ty = 0; ty < tiles; ty++) {
    const tone = 1 + (rnd() - .5) * (tiles > 1 ? .22 : 0);      // each block a little different
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      const k = tone * (1 + (rnd() - .5) * jitter);
      x.fillStyle = `rgb(${Math.min(255, b.r * 255 * k) | 0},${Math.min(255, b.g * 255 * k) | 0},${Math.min(255, b.b * 255 * k) | 0})`;
      x.fillRect(tx * size + i, ty * size + j, 1, 1);
    }
    if (lines) { x.fillStyle = '#0003'; for (let j = 3; j < size; j += lines) x.fillRect(tx * size, ty * size + j, size, 1); }
    if (border) { x.strokeStyle = border; x.lineWidth = 1; x.strokeRect(tx * size + .5, ty * size + .5, size - 1, size - 1); }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mat = t => new THREE.MeshLambertMaterial({ map: t });
function repeated(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

export const mats = {
  grassTop: mat(pixelTex('#6cc04a', .35, { seed: 3 })),
  grassSide: mat(pixelTex('#8a6a43', .3, { seed: 5 })),
  dirt: mat(pixelTex('#8a6a43', .3, { seed: 7 })),
  stone: mat(pixelTex('#9aa0a8', .3, { seed: 9 })),
  wood: mat(pixelTex('#c98a4b', .25, { seed: 11, border: '#7a4a1c', lines: 4 })),
  trunk: mat(pixelTex('#7b5230', .3, { seed: 13, lines: 3 })),
  leaf: mat(pixelTex('#3f9a3a', .45, { seed: 15 })),
  gold: mat(pixelTex('#ffc83a', .2, { seed: 17, border: '#b07a00', lines: 4 })),
  cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb8d0 }),
  ghost: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .32 }),
};

export function buildWorld(scene, avoid = []) {
  scene.background = new THREE.Color(0x7ec8ff);
  scene.fog = new THREE.Fog(0x7ec8ff, 60, 170);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb06a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2cc, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // ---- ground: ONE big plane with a repeating block texture (cheap), plus dirt walls ----
  const gtex = repeated(pixelTex('#6cc04a', .35, { seed: 3, tiles: 4 }), ISLAND / 4, ISLAND / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND, ISLAND), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const dtex = mats.dirt.map;
  for (const [rx, rz, ry] of [[0, HALF, 0], [0, -HALF, Math.PI], [HALF, 0, Math.PI / 2], [-HALF, 0, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND, 10), mat(repeated(dtex, ISLAND, 10)));
    w.position.set(rx, -5, rz); w.rotation.y = ry;
    scene.add(w);
  }

  // ---- deterministic random + spatial hash for collisions ----
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const CELL = 4;
  const hash = new Map();
  const hkey = (x, z) => ((Math.floor(x / CELL) + 200) * 1000 + Math.floor(z / CELL) + 200);
  const circles = [];                                    // big round obstacles: hills, ponds
  const blocked = (x, z, pad = 0) => avoid.some(a => Math.hypot(x - a[0], z - a[1]) < a[2] + pad)
    || circles.some(c => Math.hypot(x - c[0], z - c[1]) < c[2] + pad);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const instanced = (mt, list, { shadow = false, colors = null } = {}) => {
    const im = new THREE.InstancedMesh(geo, mt, Math.max(1, list.length));
    list.forEach((q, k) => { m.makeTranslation(q[0], q[1], q[2]); im.setMatrixAt(k, m); if (colors) im.setColorAt(k, col.setScalar(colors[k])); });
    im.count = list.length;
    im.castShadow = shadow; im.receiveShadow = true;
    scene.add(im);
    return im;
  };

  // ---- hills (stepped, stone core with grass skin) ----
  const hillStone = [], hillGrass = [];
  for (let n = 0, tries = 0; n < 14 && tries < 400; tries++) {
    const hr = 4 + ((rnd() * 5) | 0);
    const hx = (rnd() * 2 - 1) * (HALF - 20), hz = (rnd() * 2 - 1) * (HALF - 20);
    if (blocked(hx, hz, hr + 10)) continue;
    circles.push([hx, hz, hr + .6]); n++;
    for (let lv = 0; lv < hr; lv++) {
      const rr = hr - lv;
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
        if (a * a + b * b > rr * rr + 1) continue;
        const edge = lv === hr - 1 || a * a + b * b > (rr - 1) * (rr - 1);
        (edge ? hillGrass : hillStone).push([Math.round(hx) + a, .5 + lv, Math.round(hz) + b]);
      }
    }
  }
  instanced(mats.stone, hillStone); instanced(mats.grassTop, hillGrass);

  // ---- ponds ----
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa7ff, transparent: true, opacity: .85 });
  const water = [];
  for (let n = 0, tries = 0; n < 10 && tries < 400; tries++) {
    const pr = 4 + ((rnd() * 4) | 0);
    const px = (rnd() * 2 - 1) * (HALF - 20), pz = (rnd() * 2 - 1) * (HALF - 20);
    if (blocked(px, pz, pr + 8)) continue;
    circles.push([px, pz, pr + .4]); n++;
    for (let a = -pr; a <= pr; a++) for (let b = -pr; b <= pr; b++) if (a * a + b * b <= pr * pr) water.push([Math.round(px) + a, -.05, Math.round(pz) + b]);
  }
  const wi = instanced(waterMat, water);
  wi.receiveShadow = false;

  // ---- trees: sample the whole island, then build one instanced mesh per 60x60 chunk ----
  const CH = 60, NCH = ISLAND / CH;
  const chunks = Array.from({ length: NCH * NCH }, () => ({ trunk: [], leaf: [], shade: [] }));
  let trees = 0;
  for (let tries = 0; trees < 1100 && tries < 12000; tries++) {
    const x = Math.round((rnd() * 2 - 1) * (HALF - 3)), z = Math.round((rnd() * 2 - 1) * (HALF - 3));
    if (blocked(x, z, 2.5)) continue;
    const near = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.push(...(hash.get(hkey(x + i * CELL, z + j * CELL)) || []));
    if (near.some(t => Math.hypot(t[0] - x, t[1] - z) < 4)) continue;
    const th = 2 + ((rnd() * 3) | 0);
    const k = hkey(x, z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push([x, z, 1.1]);
    const ch = chunks[Math.min(NCH - 1, Math.floor((x + HALF) / CH)) * NCH + Math.min(NCH - 1, Math.floor((z + HALF) / CH))];
    for (let i = 0; i < th; i++) ch.trunk.push([x, .5 + i, z]);
    for (const [y, r] of [[th + .5, 2], [th + 1.5, 1], [th + 2.5, 0]])
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.abs(a) === r && Math.abs(b) === r && r > 1) continue;
        ch.leaf.push([x + a, y, z + b]); ch.shade.push(.82 + rnd() * .3);
      }
    trees++;
  }
  for (const ch of chunks) {
    if (ch.trunk.length) instanced(mats.trunk, ch.trunk);
    if (ch.leaf.length) instanced(mats.leaf, ch.leaf, { colors: ch.shade });
  }

  // ---- flowers ----
  const fcols = [0xff5a7a, 0xffd23f, 0xffffff, 0xb36bff];
  const NF = 900;
  const stems = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, .4, .07), new THREE.MeshLambertMaterial({ color: 0x2e8b3a }), NF);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshLambertMaterial({ color: 0xffffff }), NF);
  for (let i = 0; i < NF; i++) {
    let fx, fz, g = 0;
    do { fx = (rnd() * 2 - 1) * (HALF - 2); fz = (rnd() * 2 - 1) * (HALF - 2); } while (blocked(fx, fz, 0) && g++ < 20);
    m.makeTranslation(fx, .2, fz); stems.setMatrixAt(i, m);
    m.makeTranslation(fx, .46, fz); heads.setMatrixAt(i, m);
    heads.setColorAt(i, col.set(fcols[i % 4]));
  }
  scene.add(stems, heads);

  // ---- clouds drifting over the whole island ----
  const clouds = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const cl = new THREE.Group();
    const parts = 3 + (i % 3);
    for (let k = 0; k < parts; k++) {
      const b = new THREE.Mesh(geo, mats.cloud);
      b.scale.set(3 + (k % 2) * 2, 1.4, 3);
      b.position.set(k * 2.8, (k % 2) * .6, 0);
      cl.add(b);
    }
    cl.position.set((rnd() * 2 - 1) * (HALF + 40), 26 + rnd() * 18, (rnd() * 2 - 1) * (HALF + 40));
    cl.userData.speed = 1 + rnd() * 1.5;
    clouds.add(cl);
  }
  scene.add(clouds);

  // ---- collision: keeps the hero on the island and out of trees, hills and ponds ----
  function collide(p) {
    p.x = THREE.MathUtils.clamp(p.x, -HALF + 2, HALF - 2);
    p.z = THREE.MathUtils.clamp(p.z, -HALF + 2, HALF - 2);
    for (const c of circles) {
      const dx = p.x - c[0], dz = p.z - c[1], d = Math.hypot(dx, dz), r = c[2] + .7;
      if (d < r) { const k = r / Math.max(d, 1e-4); p.x = c[0] + dx * k; p.z = c[1] + dz * k; }
    }
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = hash.get(hkey(p.x + i * CELL, p.z + j * CELL));
      if (!list) continue;
      for (const t of list) {
        const dx = p.x - t[0], dz = p.z - t[1], d = Math.hypot(dx, dz), r = t[2] + .6;
        if (d < r) { const k = r / Math.max(d, 1e-4); p.x = t[0] + dx * k; p.z = t[1] + dz * k; }
      }
    }
  }

  function update(dt, hero) {
    sun.position.set(hero.x - 10, 20, hero.z + 12);
    sun.target.position.copy(hero);
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > HALF + 45) c.position.x = -HALF - 45;
    }
  }
  return { collide, update, trees, circles };
}

export function makeWoodBlock(mt = mats.wood) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mt);
  mesh.castShadow = true;
  return mesh;
}
