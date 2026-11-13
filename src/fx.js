import * as THREE from 'three';

// ---------- tween ----------
const tweens = [];
export const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  bounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
};
export function tween(dur, fn, { delay = 0, easing = ease.out } = {}) {
  return new Promise(res => tweens.push({ t: -delay, dur, fn, easing, res }));
}
export const wait = ms => tween(ms / 1000, () => {});
export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    w.t += dt;
    if (w.t < 0) continue;
    const k = Math.min(1, w.t / w.dur);
    w.fn(w.easing(k), k);
    if (k >= 1) { tweens.splice(i, 1); w.res(); }
  }
}

// ---------- particles (instanced cubes) ----------
const MAX = 600;
const dummy = new THREE.Object3D();
const col = new THREE.Color();
export class Particles {
  constructor(scene) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, m, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, col.set(0xffffff));
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < MAX; i++) {
      this.p.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), s: 0, max: 1, spin: 0 });
      dummy.scale.setScalar(0); dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.cursor = 0;
  }
  emit(pos, { n = 20, colors = [0xffd23f], speed = 4, up = 3, size = .18, life = .9, spread = 1, gravity = true } = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.p[this.cursor];
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      p.life = p.max = life * (.6 + Math.random() * .6);
      p.pos.copy(pos);
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed * spread;
      p.vel.set(Math.cos(a) * r, up * (.4 + Math.random()), Math.sin(a) * r);
      p.s = size * (.5 + Math.random());
      p.spin = Math.random() * 6;
      p.grav = gravity;
      this.mesh.setColorAt(idx, col.set(colors[(Math.random() * colors.length) | 0]));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.grav) p.vel.y -= 9 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max);
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.spin * (1 - k), p.spin * (1 - k) * .7, 0);
      dummy.scale.setScalar(p.s * Math.min(1, k * 2.2));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      if (p.life <= 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); this.mesh.setMatrixAt(i, dummy.matrix); }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- floating number sprite ----------
export function numberSprite(text, color = '#ffd23f') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.font = '900 190px system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 34; x.strokeStyle = '#5a2d0c'; x.strokeText(text, 128, 138);
  x.fillStyle = color; x.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 10;
  return s;
}

// ---------- wide label (a whole word) and emoji sprites ----------
export function labelSprite(text, color = '#ffd23f') {
  const W = 1024, H = 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let px = 210;
  x.font = `900 ${px}px system-ui, sans-serif`;
  while (x.measureText(text).width > 880 && px > 60) { px -= 10; x.font = `900 ${px}px system-ui, sans-serif`; }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
  const base = 300;                                   // low baseline leaves room for accents above the letters
  x.lineWidth = 40; x.strokeStyle = '#5a2d0c'; x.strokeText(text, W / 2, base);
  x.fillStyle = color; x.fillText(text, W / 2, base);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 10; s.userData.aspect = W / H;
  return s;
}
// Emoji are drawn from bundled Twemoji PNGs (public/emoji/<codepoints>.png) rather than
// a system emoji font: headless/CI browsers often lack a colour-emoji font, which made
// these render as a plain fallback glyph instead of the intended picture.
const emojiImgCache = new Map();
function emojiCodepoints(str) {
  return [...str].map(c => c.codePointAt(0).toString(16)).join('-');
}
function loadEmojiImg(emoji) {
  const key = emojiCodepoints(emoji);
  if (emojiImgCache.has(key)) return emojiImgCache.get(key);
  const img = new Image();
  img.src = `emoji/${key}.png`;
  emojiImgCache.set(key, img);
  return img;
}
export function emojiSprite(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => { x.clearRect(0, 0, 256, 256); x.drawImage(img, 32, 32, 192, 192); tex.needsUpdate = true; };
  const img = loadEmojiImg(emoji);
  if (img.complete && img.naturalWidth) draw(); else img.addEventListener('load', draw, { once: true });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 10;
  return s;
}
// a standing card with a letter on it (for the word quests)
export function letterCard(letter, hue = 40) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 168;
  const x = c.getContext('2d');
  x.fillStyle = `hsl(${hue},90%,94%)`; x.fillRect(0, 0, 128, 168);
  x.strokeStyle = `hsl(${hue},80%,45%)`; x.lineWidth = 10; x.strokeRect(5, 5, 118, 158);
  x.fillStyle = '#3a2a10'; x.font = '900 110px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(letter, 64, 90);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshLambertMaterial({ map: tex }), edge = new THREE.MeshLambertMaterial({ color: new THREE.Color(`hsl(${hue},80%,55%)`) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.9, .35), [edge, edge, edge, edge, face, edge]);
  m.castShadow = true;
  return m;
}
