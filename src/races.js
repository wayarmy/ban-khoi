import * as THREE from 'three';
import { makeAnimal, KINDS } from './animals.js';

// Tap-to-run races. The child taps the big button; the faster the taps, the faster the car or the hero runs.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map();
const M = c => { if (!cache.has(c)) cache.set(c, new THREE.MeshLambertMaterial({ color: c })); return cache.get(c); };
const part = (w, h, d, c, x, y, z, parent) => {
  const m = new THREE.Mesh(BOX, M(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; if (parent) parent.add(m); return m;
};

export function makeCar(color) {
  const g = new THREE.Group(), wheels = [];
  part(3, 1.1, 5.6, color, 0, 1.0, 0, g);
  part(2.4, .9, 2.6, 0xfff1d6, 0, 1.9, -.4, g);
  part(2.2, .6, .1, 0x8fd3ff, 0, 1.95, .95, g);
  part(.7, .5, .2, 0xffee88, -.9, 1.1, 2.85, g); part(.7, .5, .2, 0xffee88, .9, 1.1, 2.85, g);
  for (const [x, z] of [[-1.6, 1.8], [1.6, 1.8], [-1.6, -1.8], [1.6, -1.8]]) {
    const w = new THREE.Group(); w.position.set(x, .6, z); part(.5, 1.2, 1.2, 0x20232b, 0, 0, 0, w); g.add(w); wheels.push(w);
  }
  return { g, wheels };
}

const COLORS = [0xe04a5a, 0x3f8fd6, 0xf2b705, 0x7dd36f];

export class Race {
  // opts: { scene, track, hero, losses, onCount(n), onFinish(result) }
  constructor(o) {
    Object.assign(this, o);
    const T = this.track, laneX = i => T.x - (T.lanes - 1) * T.gap / 2 + i * T.gap;
    this.laneX = laneX; this.finishZ = T.z0 + T.len;
    this.playerLane = 1;
    this.phase = 'count'; this.t = 0; this.lastCount = 4; this.tapT = 0;
    this.racers = [];
    const isCar = T.kind === 'car';
    const lanes = [...Array(T.lanes).keys()];
    const others = lanes.filter(i => i !== this.playerLane);
    const animalKinds = KINDS.slice();
    // player
    const p = { player: true, lane: this.playerLane, z: T.z0 + 4, v: 0, done: false, time: 0 };
    if (isCar) { const c = makeCar(COLORS[0]); c.g.scale.setScalar(1.15); p.obj = c.g; p.wheels = c.wheels; this.scene.add(c.g); }
    this.racers.push(p);
    others.forEach((lane, k) => {
      const r = { player: false, lane, z: T.z0 + 4, v: 0, done: false, time: 0, base: 10.4 + k * .75, ph: Math.random() * 6 };
      if (isCar) { const c = makeCar(COLORS[k + 1]); c.g.scale.setScalar(1.15); r.obj = c.g; r.wheels = c.wheels; this.scene.add(c.g); }
      else { const a = makeAnimal(animalKinds[k % animalKinds.length], 2.4); r.obj = a.g; r.anim = a; this.scene.add(a.g); }
      this.racers.push(r);
    });
    for (const r of this.racers) this.place(r);
    this.hero.holder.rotation.y = 0;
  }
  get you() { return this.racers[0]; }
  place(r) {
    const x = this.laneX(r.lane);
    if (r.obj) { r.obj.position.set(x, 0, r.z); r.obj.rotation.y = 0; }
    if (r.player) {
      if (this.track.kind === 'car') { this.hero.holder.position.set(x, .9, r.z - .2); }
      else this.hero.holder.position.set(x, 0, r.z);
    }
  }
  tap() {
    if (this.phase !== 'go' || this.you.done) return;
    const k = 1 + .25 * Math.min(3, this.losses || 0);
    this.you.v = Math.min(21, this.you.v + 3.0 * k);
  }
  update(dt) {
    this.t += dt;
    if (this.phase === 'count') {
      const n = 3 - Math.floor(this.t / 1.0);
      if (n !== this.lastCount) { this.lastCount = n; if (this.onCount) this.onCount(n); }
      if (this.t >= 4) { this.phase = 'go'; this.t = 0; this.hero.play(this.track.kind === 'car' ? 'sit' : 'run', { loop: true }); }
    }
    for (const r of this.racers) {
      if (this.phase === 'go' && !r.done) {
        if (r.player) {
          r.v *= Math.exp(-.8 * dt);
          const lead = Math.max(...this.racers.filter(q => !q.player).map(q => q.z));
          if (lead - r.z > 12) r.v += 2.2 * dt * 8 * (this.losses ? 1 : .6);            // gentle catch-up help
        } else {
          const slow = 1 - .04 * Math.min(4, this.losses || 0);
          r.v = (r.base + 1.3 * Math.sin(this.t * 1.7 + r.ph)) * slow;
        }
        r.z += r.v * dt;
        if (r.z >= this.finishZ) { r.z = this.finishZ; r.done = true; r.time = this.t; r.v *= .5; }
      } else if (r.done) { r.v *= Math.exp(-2 * dt); r.z += r.v * dt; }
      this.place(r);
      if (r.wheels) for (const w of r.wheels) w.rotation.x += r.v * dt * .8;
      if (r.anim) r.anim.update(dt, r.v > .5 ? 4 + r.v * .2 : 0);
      if (r.obj && r.player && this.track.kind === 'car') r.obj.position.y = Math.sin(this.t * 30) * .03 * Math.min(1, r.v / 8);
    }
    if (this.track.kind === 'animal') this.hero.locomote(this.you.v > .5 ? 'run' : 'idle', Math.max(.6, Math.min(1.7, this.you.v / 9)));
    if (this.phase === 'go' && !this.finished) {
      const y = this.you;
      if (y.done || this.racers.every(r => r.done) || this.t > 30) {
        this.finished = true;
        const order = [...this.racers].sort((a, b) => (b.z - a.z) || (a.time - b.time));
        const place = order.indexOf(y) + 1;
        setTimeout(() => this.onFinish && this.onFinish({ won: place === 1, place }), 400);
      }
    }
  }
  camFocus() {
    const y = this.you, lead = Math.max(...this.racers.map(r => r.z));
    return { x: this.laneX(1) + 3, z: (y.z * 2 + lead) / 3 + 6 };
  }
  dispose() {
    for (const r of this.racers) if (!r.player && r.obj) this.scene.remove(r.obj);
    if (this.you.obj) this.scene.remove(this.you.obj);
  }
}
