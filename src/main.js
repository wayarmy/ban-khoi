import * as THREE from 'three';
import { buildWorld, makeWoodBlock, mats, ISLAND, HALF } from './world.js';
import { loadCharacter } from './character.js';
import { Particles, numberSprite, tween, wait, ease, updateTweens } from './fx.js';
import { initAudio, speak, sfx } from './audio.js';
import { glyphCells, QUEST_ORDER, GLYPH_W, GLYPH_H } from './glyphs.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 320);
const TARGET = new THREE.Vector3(0, 1, 0);
const view = { yaw: 0, pitch: THREE.MathUtils.degToRad(50), yawV: 0, zoom: 1 };
const PITCH_MIN = THREE.MathUtils.degToRad(18), PITCH_MAX = THREE.MathUtils.degToRad(80);
let camShake = 0, zoneK = 0;
const wallC = new THREE.Vector3();

// ---------------------------------------------------------------- quests
// 36 quests (1-9, 0, A-Z) spread over the island: easy numbers near the start, letters further out.
const QUEST_R = 14;                                     // how close the hero must be to build
function questPositions(n) {
  const cells = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i || j) cells.push([i, j]);
  cells.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || a[0] - b[0] || a[1] - b[1]);
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return cells.slice(0, n).map(([i, j]) => [i * 40 + rnd() * 8, j * 40 + rnd() * 8]);
}
const pos = questPositions(QUEST_ORDER.length);
const doneSet = new Set(JSON.parse(localStorage.getItem('khoi.done') || '[]'));
const quests = QUEST_ORDER.map((g, i) => ({
  id: g, glyph: g, digit: /\d/.test(g), pos: new THREE.Vector3(pos[i][0], 0, pos[i][1]),
  cells: glyphCells(g), next: 0, landed: 0, done: doneSet.has(g), prepared: false,
  group: null, cellPos: [], ghosts: [], pile: [], beam: null, centre: new THREE.Vector3(pos[i][0], 0, pos[i][1] + 2.5),
}));

const world = buildWorld(scene, [[0, 0, 10], ...quests.map(q => [q.pos.x, q.pos.z + 2.5, 19])]);
const fx = new Particles(scene);

// beams of light so every quest can be seen from far away
for (const q of quests) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(.9, .9, 70, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: q.done ? 0x4cff7a : 0xffd23f, transparent: true, opacity: q.done ? .16 : .4, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  beam.position.set(q.centre.x + 12, 35, q.centre.z - 5);
  scene.add(beam); q.beam = beam;
  const padTex = mats.stone.map.clone();
  padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping; padTex.repeat.set(20, 16); padTex.needsUpdate = true;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 16), new THREE.MeshLambertMaterial({ map: padTex }));
  pad.position.set(q.centre.x, .1, q.centre.z); pad.receiveShadow = true;
  scene.add(pad);
}

// ---------------------------------------------------------------- state
let hero, cfg;
let stars = doneSet.size;
let nearQuest = null, spokenFor = null, celebrateUntil = 0, idleInZone = 0;
const joy = { x: 0, y: 0 }, keys = new Set();

function setStars(n) { stars = n; $('stars').innerHTML = '<span style="color:#e0a800">★</span> ' + n; }
setStars(stars);
const nameOf = q => (q.digit ? cfg.digits[+q.glyph] : cfg.letters[q.glyph]);
const fmt = (s, q) => s.replace('{kind}', q.digit ? 'số' : 'chữ').replace('{name}', nameOf(q));

// ---------------------------------------------------------------- camera
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const span = 15;
  camera.userData.dist = Math.max(20, (span / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1.4)));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
function placeCamera() {
  const d = camera.userData.dist * view.zoom * (1 + .3 * zoneK);
  const cp = Math.cos(view.pitch);
  camera.position.set(
    TARGET.x + Math.sin(view.yaw) * cp * d,
    TARGET.y + Math.sin(view.pitch) * d + Math.sin(performance.now() * .04) * camShake * .15,
    TARGET.z + Math.cos(view.yaw) * cp * d);
  camera.lookAt(TARGET);
}

// ---------------------------------------------------------------- building a quest site
function prepare(q) {
  if (q.prepared) return;
  q.prepared = true;
  const g = new THREE.Group();
  g.position.set(q.pos.x, 0, q.pos.z - 4.5);
  g.rotation.x = -0.5;                                   // wall leans back so it reads well from above
  scene.add(g); q.group = g;
  q.cellPos = q.cells.map(([c, r]) => new THREE.Vector3((c - (GLYPH_W - 1) / 2) * 1.4, (GLYPH_H - 1 - r) * 1.4 + .8, 0));
  g.updateMatrixWorld(true);
  const box = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  q.cellPos.forEach((p, i) => {
    if (q.done) {
      const b = makeWoodBlock(mats.gold); b.position.copy(p); b.scale.setScalar(.95); b.userData.block = true; g.add(b);
    } else {
      const gh = new THREE.Mesh(box, mats.ghost); gh.position.copy(p); g.add(gh); q.ghosts.push(gh);
    }
  });
  if (q.done) { q.next = q.landed = q.cells.length; return; }
  // loose blocks lying around the pad, waiting to be picked up
  let rs = q.pos.x * 31 + q.pos.z * 17 + 3;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const pts = [];
  let minD = 2.1;
  for (let tries = 0; pts.length < q.cells.length; tries++) {
    if (tries % 60 === 59) minD *= .9;
    const p = new THREE.Vector3(q.pos.x + (rnd() * 2 - 1) * 8.5, .65, q.pos.z + 0.5 + rnd() * 8);
    if (pts.every(o => o.distanceTo(p) > minD)) pts.push(p);
  }
  pts.forEach((p, i) => {
    const b = makeWoodBlock();
    b.position.set(p.x, 20, p.z);
    b.userData = { home: p, taken: false, phase: rnd() * 6, block: true };
    scene.add(b); q.pile.push(b);
    tween(.7, e => { b.position.y = 20 + (p.y - 20) * e; }, { delay: .02 * i, easing: ease.bounce });
  });
}

function bobPile(t) {
  for (const q of quests) {
    if (!q.prepared || q.done) continue;
    for (const b of q.pile) {
      if (b.userData.taken || b.position.y > 3) continue;
      b.rotation.y = Math.sin(t * 1.5 + b.userData.phase) * .2;
      b.position.y = .65 + Math.sin(t * 2.2 + b.userData.phase) * .08;
    }
  }
}

// ---------------------------------------------------------------- placing blocks
function place(q) {
  if (!q || q.done || !q.prepared || q.next >= q.cells.length) return;
  const hp = hero.holder.position;
  let best = null, bd = 1e9;
  for (const b of q.pile) {
    if (b.userData.taken) continue;
    const d = Math.hypot(b.position.x - hp.x, b.position.z - hp.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return;
  const i = q.next++;
  best.userData.taken = true;
  const b = best, from = b.position.clone();
  q.group.updateMatrixWorld(true);
  const to = q.group.localToWorld(q.cellPos[i].clone());
  sfx.pop(1 + (i % 10));
  if (!hero.state.oneshot && i % 5 === 0) hero.play('nod', { loop: false, speed: 1.4 });
  fx.emit(from, { n: 10, colors: [0xffd23f, 0xffffff, 0xff9ad5], size: .15, up: 3.5, speed: 2.5 });
  const trail = [0xffd23f, 0xfff3b0, 0xffa24c];
  tween(.7, e => {
    b.position.lerpVectors(from, to, e);
    b.position.y += Math.sin(e * Math.PI) * 4;
    b.rotation.y = e * Math.PI * 3;
    b.scale.setScalar(1 + Math.sin(e * Math.PI) * .2);
    if (Math.random() < .7) fx.emit(b.position, { n: 2, colors: trail, size: .11, up: 0, speed: .6, life: .45, gravity: false });
  }, { easing: ease.inOut }).then(() => {
    q.group.attach(b);
    b.position.copy(q.cellPos[i]); b.rotation.set(0, 0, 0); b.scale.setScalar(.95);
    sfx.land();
    fx.emit(to, { n: 12, colors: [0xffffff, 0xffd23f], size: .12, up: 2, speed: 2.2 });
    if (q.ghosts[i]) q.ghosts[i].visible = false;
    if (++q.landed >= q.cells.length) complete(q);
  });
}

async function complete(q) {
  if (q.done) return;
  q.done = true;
  doneSet.add(q.id); localStorage.setItem('khoi.done', JSON.stringify([...doneSet]));
  setStars(doneSet.size);
  sfx.win(); sfx.star();
  camShake = 1; tween(.5, e => camShake = 1 - e);
  celebrateUntil = performance.now() / 1000 + 4;
  hero.play('dance', { loop: true, fade: .2 });
  const bs = $('bigstar'); bs.classList.remove('go'); void bs.offsetWidth; bs.classList.add('go');
  q.beam.material.color.set(0x4cff7a); q.beam.material.opacity = .16;
  const top = new THREE.Vector3(q.pos.x, 12, q.pos.z - 4);
  // the wall turns to gold, with a big floating label
  q.group.traverse(o => { if (o.userData && o.userData.block) o.material = mats.gold; });
  const label = numberSprite(q.glyph);
  label.position.copy(top); label.scale.setScalar(.01); scene.add(label);
  tween(.7, e => label.scale.setScalar(7 * e), { easing: ease.back });
  const colors = [0xff5a7a, 0xffd23f, 0x4cd3ff, 0x7dff7a, 0xb36bff, 0xffffff];
  for (let r = 0; r < 8; r++)
    fx.emit(new THREE.Vector3(q.pos.x + (Math.random() - .5) * 14, 11 + Math.random() * 3, q.pos.z + (Math.random() - .5) * 10),
      { n: 22, colors, size: .22, up: -1, speed: 2.5, life: 2.4 });
  const said = speak('done_' + q.glyph, fmt(cfg.voices.done, q));
  for (let r = 0; r < 4; r++) {
    await wait(380); sfx.firework();
    fx.emit(new THREE.Vector3(q.pos.x + (Math.random() - .5) * 9, 8 + Math.random() * 4, q.pos.z - 3 + (Math.random() - .5) * 3),
      { n: 46, colors, size: .2, up: 0, speed: 5, life: 1.2, gravity: false });
  }
  await said;
  await wait(2500);
  scene.remove(label);
  if (doneSet.size >= quests.length) speak('all', cfg.voices.all);
}

// ---------------------------------------------------------------- input: walking stick
const joyEl = $('joy'), knob = $('knob');
let joyId = null;
function joyMove(ev) {
  const r = joyEl.getBoundingClientRect();
  let dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  joy.x = dx; joy.y = dy;
  knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
}
joyEl.addEventListener('pointerdown', ev => { joyId = ev.pointerId; joyEl.setPointerCapture(ev.pointerId); joyMove(ev); ev.preventDefault(); });
joyEl.addEventListener('pointermove', ev => { if (ev.pointerId === joyId) joyMove(ev); });
const joyEnd = ev => { if (ev.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ' && nearQuest) place(nearQuest); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// "place block" button: hold to keep building
let holdTimer = 0;
const placeBtn = $('place');
placeBtn.addEventListener('pointerdown', ev => {
  placeBtn.setPointerCapture(ev.pointerId);
  const go = () => { idleInZone = 0; place(nearQuest); };
  go(); clearInterval(holdTimer); holdTimer = setInterval(go, 320);
  ev.preventDefault();
});
const stopHold = () => clearInterval(holdTimer);
placeBtn.addEventListener('pointerup', stopHold); placeBtn.addEventListener('pointercancel', stopHold);

// ---------------------------------------------------------------- input: swipe the world around
const ptrs = new Map();
let dragging = false, moved = 0, pinch0 = 0, zoom0 = 1;
canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ptrs.size === 1) { moved = 0; dragging = false; view.yawV = 0; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = view.zoom; dragging = true; }
});
canvas.addEventListener('pointermove', ev => {
  const p = ptrs.get(ev.pointerId); if (!p) return;
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  p.x = ev.clientX; p.y = ev.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    view.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), .5, 1.7);
    return;
  }
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > 14) dragging = true;
  if (dragging) {
    view.yaw -= dx * .008;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * .005, PITCH_MIN, PITCH_MAX);
    view.yawV = THREE.MathUtils.clamp(-dx * .008 * 60, -3, 3);
  }
});
const endPtr = ev => {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.delete(ev.pointerId);
  if (!dragging && ptrs.size === 0 && ev.type === 'pointerup' && nearQuest) place(nearQuest);   // a tap also builds
  if (ptrs.size === 0) setTimeout(() => { dragging = false; }, 0);
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', ev => { view.zoom = THREE.MathUtils.clamp(view.zoom * (1 + ev.deltaY * .001), .5, 1.7); }, { passive: true });

$('replay').addEventListener('click', () => {
  if (!cfg) return;
  hero.play('nod', { loop: false });
  if (nearQuest && !nearQuest.done) speak('intro_' + nearQuest.glyph, fmt(cfg.voices.intro, nearQuest));
  else if (nearQuest) speak('again_' + nearQuest.glyph, fmt(cfg.voices.again, nearQuest));
  else speak('find', cfg.voices.find);
});
$('play').addEventListener('click', async () => {
  $('title').classList.remove('show');
  await initAudio();
  hero.play('greet', { loop: false });
  speak('welcome', cfg.voices.welcome);
});

// ---------------------------------------------------------------- boot
const BASE = import.meta.env.BASE_URL;
(async () => {
  cfg = await (await fetch(BASE + 'levels.json')).json();
  hero = await loadCharacter(scene, BASE);
  const saved = (localStorage.getItem('khoi.pos') || '0,6').split(',').map(Number);
  hero.holder.position.set(saved[0] || 0, 0, Number.isFinite(saved[1]) ? saved[1] : 6);
  TARGET.set(hero.holder.position.x, 1, hero.holder.position.z);
  window.__ready = true;
})();

// ---------------------------------------------------------------- minimap + compass
const mapCtx = $('map').getContext('2d');
function drawMap() {
  const S = 92, k = S / ISLAND, c = S / 2;
  mapCtx.fillStyle = '#4aa84a'; mapCtx.fillRect(0, 0, S, S);
  for (const q of quests) {
    mapCtx.fillStyle = q.done ? '#1d6b2c' : '#ffb400';
    mapCtx.beginPath(); mapCtx.arc(c + q.pos.x * k, c + q.pos.z * k, q.done ? 2 : 3, 0, 7); mapCtx.fill();
  }
  const h = hero.holder.position;
  mapCtx.fillStyle = '#fff'; mapCtx.beginPath(); mapCtx.arc(c + h.x * k, c + h.z * k, 5, 0, 7); mapCtx.fill();
  mapCtx.fillStyle = '#1e90ff'; mapCtx.beginPath(); mapCtx.arc(c + h.x * k, c + h.z * k, 3.4, 0, 7); mapCtx.fill();
}
function updateCompass() {
  const h = hero.holder.position;
  let best = null, bd = 1e9;
  for (const q of quests) { if (q.done) continue; const d = Math.hypot(q.centre.x - h.x, q.centre.z - h.z); if (d < bd) { bd = d; best = q; } }
  const comp = $('compass');
  if (!best || bd < QUEST_R) { comp.style.opacity = .25; return; }
  comp.style.opacity = 1;
  const dx = best.centre.x - h.x, dz = best.centre.z - h.z;
  const fwd = [-Math.sin(view.yaw), -Math.cos(view.yaw)], right = [Math.cos(view.yaw), -Math.sin(view.yaw)];
  const ang = Math.atan2(dx * right[0] + dz * right[1], dx * fwd[0] + dz * fwd[1]);
  $('arrow').style.transform = `rotate(${ang}rad)`;
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let mapT = 0, saveT = 0;
const mv = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  updateTweens(dt);
  fx.update(dt);
  if (hero) {
    // ---- walking
    let jx = joy.x, jy = joy.y;
    if (keys.size) {
      jx += (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      jy += (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    }
    const mag = Math.min(1, Math.hypot(jx, jy));
    const hp = hero.holder.position;
    if (mag > .12) {
      const fwd = [-Math.sin(view.yaw), -Math.cos(view.yaw)], right = [Math.cos(view.yaw), -Math.sin(view.yaw)];
      mv.set(right[0] * jx + fwd[0] * -jy, 0, right[1] * jx + fwd[1] * -jy).normalize();
      const run = mag > .75;
      hp.addScaledVector(mv, (run ? 9 : 4.5) * dt);
      world.collide(hp);
      const want = Math.atan2(mv.x, mv.z);
      let da = want - hero.holder.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
      hero.holder.rotation.y += da * Math.min(1, dt * 12);
      hero.locomote(run ? 'run' : 'walk', 1);
    } else if (t > celebrateUntil) hero.locomote('idle', 1);
    hero.mixer.update(dt);
    TARGET.lerp(mv.set(hp.x, 1.2, hp.z).lerp(wallC, .6 * zoneK), 1 - Math.exp(-6 * dt));
    world.update(dt, hp);

    // ---- which quest is close?
    let near = null;
    for (const q of quests) {
      const d = Math.hypot(hp.x - q.centre.x, hp.z - q.centre.z);
      if (d < 70) prepare(q);
      if (d < QUEST_R) near = q;
    }
    if (near !== nearQuest) {
      nearQuest = near; idleInZone = 0;
      if (near && spokenFor !== near.id) {
        spokenFor = near.id;
        if (near.done) speak('again_' + near.glyph, fmt(cfg.voices.again, near));
        else speak('intro_' + near.glyph, fmt(cfg.voices.intro, near));
      }
      if (!near) spokenFor = null;
    }
    const canBuild = !!nearQuest && !nearQuest.done && nearQuest.next < nearQuest.cells.length;
    // near a quest the camera pulls back and looks between the hero and the wall
    if (nearQuest) wallC.set(nearQuest.pos.x, 3, nearQuest.pos.z - 2);
    zoneK += ((nearQuest ? 1 : 0) - zoneK) * (1 - Math.exp(-2.5 * dt));
    placeBtn.classList.toggle('show', canBuild);
    if (canBuild && mag < .12) {
      idleInZone += dt;
      if (idleInZone > 12) { idleInZone = 0; speak('press', cfg.voices.press); }
    }
    bobPile(t);
    for (const q of quests) q.beam.material.opacity = q.done ? .16 : (q === nearQuest ? .15 : .4);
    mapT += dt; if (mapT > .12) { mapT = 0; drawMap(); updateCompass(); }
    saveT += dt; if (saveT > 3) { saveT = 0; localStorage.setItem('khoi.pos', hp.x.toFixed(1) + ',' + hp.z.toFixed(1)); }
  }
  if (!dragging) { view.yaw += view.yawV * dt; view.yawV *= Math.pow(.04, dt); }
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.__dbg = {
  get state() { const h = hero.holder.position; return { x: h.x, z: h.z, near: nearQuest && nearQuest.id, done: [...doneSet], anim: hero.state.name, trees: world.trees }; },
  teleport(x, z) { hero.holder.position.set(x, 0, z); },
  quests, place: id => place(quests.find(q => q.id === id)), view, get hero() { return hero; }, camera,
  get calls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; },
};
