import * as THREE from 'three';
import { mulberry, inCity, zoneAt, ZONES } from './worldgen.js';

// Little animals made of blocks (our own design).
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map();
const M = c => { if (!cache.has(c)) cache.set(c, new THREE.MeshLambertMaterial({ color: c })); return cache.get(c); };
const part = (w, h, d, c, x, y, z, parent) => {
  const m = new THREE.Mesh(BOX, M(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; if (parent) parent.add(m); return m;
};

export const KINDS = ['rabbit', 'chick', 'pig', 'sheep'];
export const EMOJI = { rabbit: '🐰', chick: '🐥', pig: '🐷', sheep: '🐑' };
export const SAY = { rabbit: 'thỏ', chick: 'gà con', pig: 'heo', sheep: 'cừu' };
const SPEC = {
  rabbit: { body: 0xf4f0ea, head: 0xf4f0ea, w: .9, h: .8, l: 1.3, hop: true },
  chick:  { body: 0xffe066, head: 0xffe066, w: .8, h: .8, l: .9,  hop: true },
  pig:    { body: 0xffa6c8, head: 0xffa6c8, w: 1,  h: .9, l: 1.5, hop: false },
  sheep:  { body: 0xf8f8f2, head: 0x4a4038, w: 1.2, h: 1,  l: 1.6, hop: false },
};

// A block animal. Faces +z. update(dt, speed) animates legs and hops.
export function makeAnimal(kind = 'rabbit', scale = 1) {
  const s = SPEC[kind], g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const legH = .45, bodyY = legH + s.h / 2;
  const body = part(s.w, s.h, s.l, s.body, 0, bodyY, 0, root);
  const head = new THREE.Group(); head.position.set(0, bodyY + s.h * .35, s.l / 2 + .05); root.add(head);
  const hs = kind === 'sheep' ? .85 : .9;
  part(hs, hs, hs, s.head, 0, hs * .3, .1, head);
  for (const x of [-.22, .22]) { part(.14, .18, .06, 0x1c2330, x, hs * .42, .1 + hs / 2 + .02, head); part(.05, .06, .04, 0xffffff, x - .03, hs * .47, .1 + hs / 2 + .04, head); }
  part(.18, .1, .06, 0xff8fa8, 0, hs * .2, .1 + hs / 2 + .02, head);                               // nose
  if (kind === 'rabbit') { for (const x of [-.2, .2]) { const e = part(.2, .9, .14, 0xf4f0ea, x, hs * .3 + hs / 2 + .4, 0, head); part(.1, .6, .04, 0xffb0c8, 0, 0, .06, e); } part(.3, .3, .3, 0xffffff, 0, bodyY, -s.l / 2 - .1, root); }
  if (kind === 'chick') { part(.3, .15, .3, 0xff9c1a, 0, hs * .15, .1 + hs / 2 + .1, head); part(.12, .3, .12, 0xffb84d, 0, hs * .3 + hs / 2 + .1, 0, head); for (const x of [-1, 1]) part(.12, .5, .6, 0xffd23f, x * (s.w / 2 + .06), bodyY, 0, root); }
  if (kind === 'pig') { part(.4, .3, .15, 0xff8fb3, 0, hs * .12, .1 + hs / 2 + .1, head); for (const x of [-.3, .3]) part(.3, .3, .1, 0xff86b3, x, hs * .3 + hs / 2, 0, head); part(.14, .14, .3, 0xff86b3, 0, bodyY + .1, -s.l / 2 - .15, root); }
  if (kind === 'sheep') { part(s.w + .3, s.h + .3, s.l + .3, 0xffffff, 0, bodyY, 0, root); for (const x of [-.45, .45]) part(.4, .16, .3, 0x4a4038, x, hs * .3 + hs / 2 - .1, 0, head); }
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const lg = new THREE.Group(); lg.position.set(x * s.w * .32, legH, z * s.l * .32); part(.28, legH, .28, kind === 'sheep' ? 0x4a4038 : s.body, 0, -legH / 2, 0, lg); root.add(lg); legs.push(lg);
  }
  g.scale.setScalar(scale);
  let t = Math.random() * 10;
  return {
    g, kind, root, speed: 0,
    update(dt, speed) {
      t += dt * (1 + speed * .6);
      const sp = Math.min(1, speed / 4);
      const sw = Math.sin(t * 10) * .7 * sp;
      legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
      root.position.y = s.hop ? Math.abs(Math.sin(t * 8)) * .45 * sp : Math.abs(Math.sin(t * 10)) * .08 * sp;
      root.rotation.x = s.hop ? -Math.sin(t * 8) * .15 * sp : 0;
      head.rotation.x = Math.sin(t * .8) * .06 * (1 - sp) + (sp ? 0 : Math.max(0, Math.sin(t * .35)) * .25);
    },
  };
}

// ---- wild animals that wander near the hero ----
export class Wildlife {
  constructor(scene, canStand) { this.scene = scene; this.list = []; this.canStand = canStand; this.cool = 0; this.rnd = mulberry(Date.now() & 0xffff); }
  kindsFor(zone) { return zone === 'farm' ? ['chick', 'pig', 'sheep'] : zone === 'meadow' ? KINDS : zone === 'start' ? ['rabbit', 'rabbit', 'chick'] : ['rabbit', 'chick', 'sheep']; }
  update(dt, hx, hz) {
    const zone = zoneAt(hx, hz);
    this.cool -= dt;
    const want = zone === 'city' || zone === 'park' ? 0 : zone === 'meadow' || zone === 'farm' ? 8 : 5;
    if (this.list.length < want && this.cool <= 0) {
      this.cool = .5;
      const a = this.rnd() * Math.PI * 2, d = 25 + this.rnd() * 40, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d;
      if (this.canStand(x, z) && !inCity(x, z, 10)) {
        const ks = this.kindsFor(zoneAt(x, z)), kind = ks[(this.rnd() * ks.length) | 0];
        const an = makeAnimal(kind, 1.5); an.g.position.set(x, 0, z); an.tx = x; an.tz = z; an.wait = this.rnd() * 2; an.fleeing = false; an.id = Math.random();
        this.scene.add(an.g); this.list.push(an);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const an = this.list[i], p = an.g.position;
      if (Math.hypot(p.x - hx, p.z - hz) > 110 || (want === 0 && !an.fleeing)) { this.scene.remove(an.g); this.list.splice(i, 1); continue; }
      an.wait -= dt;
      const dh = Math.hypot(p.x - hx, p.z - hz);
      if (an.fleeing && dh < 18) { const a = Math.atan2(p.z - hz, p.x - hx) + (Math.sin(performance.now() / 700 + an.id * 9) * .6); an.tx = p.x + Math.cos(a) * 12; an.tz = p.z + Math.sin(a) * 12; an.wait = 0; }
      else if (an.wait <= 0 && Math.hypot(an.tx - p.x, an.tz - p.z) < 1) { const a = this.rnd() * 6.28, d = 4 + this.rnd() * 8; an.tx = p.x + Math.cos(a) * d; an.tz = p.z + Math.sin(a) * d; an.wait = 1.5 + this.rnd() * 3; }
      const dx = an.tx - p.x, dz = an.tz - p.z, dist = Math.hypot(dx, dz);
      let sp = 0;
      if (dist > .6 && an.wait <= (an.fleeing ? 99 : 1.4)) {
        sp = an.fleeing ? 5.5 : 1.8;
        const nx = p.x + dx / dist * sp * dt, nz = p.z + dz / dist * sp * dt;
        if (this.canStand(nx, nz)) { p.x = nx; p.z = nz; an.g.rotation.y = Math.atan2(dx, dz); }
        else { an.tx = p.x; an.tz = p.z; }
      }
      an.update(dt, sp);
    }
  }
  nearest(hx, hz, maxD = 16) {
    let best = null, bd = maxD;
    for (const an of this.list) { const d = Math.hypot(an.g.position.x - hx, an.g.position.z - hz); if (d < bd) { bd = d; best = an; } }
    return best;
  }
  take(an) { this.scene.remove(an.g); const i = this.list.indexOf(an); if (i >= 0) this.list.splice(i, 1); }
}

// ---- pets walking behind the hero ----
export class Pets {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(kind, from = null) {
    const an = makeAnimal(kind, 1.3);
    if (from) an.g.position.copy(from);
    this.scene.add(an.g); this.list.push(an); return an;
  }
  update(dt, hero, heading) {
    this.list.forEach((an, i) => {
      const bx = -Math.sin(heading), bz = -Math.cos(heading);
      const tx = hero.x + bx * (3.4 + i * 2.4) + Math.cos(heading) * ((i % 2) ? 1.6 : -1.6), tz = hero.z + bz * (3.4 + i * 2.4) + Math.sin(-heading) * ((i % 2) ? 1.6 : -1.6);
      const p = an.g.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      let sp = 0;
      if (d > .8) { sp = Math.min(11, 2 + d * 1.6); const k = Math.min(1, sp * dt / d); p.x += dx * k; p.z += dz * k; an.g.rotation.y = Math.atan2(dx, dz); }
      if (d > 40) { p.x = tx; p.z = tz; }
      an.update(dt, sp);
    });
  }
}
