import * as THREE from 'three';
import { buildWorld, makeWoodBlock, mats } from './world.js';
import { loadCharacter, VARIANTS, thumb } from './blockhero.js';
import { Particles, numberSprite, labelSprite, emojiSprite, letterCard, tween, wait, ease, updateTweens } from './fx.js';
import { initAudio, speak, sfx } from './audio.js';
import { glyphCells, DIGITS, LETTERS } from './glyphs.js';
import { WORDS, LETTER_SAY, DIGIT_SAY } from './vn.js';
import { GLYPH_SITES, WORD_SITES, PRIZE_GLYPHS, TRACKS, FARM, blockedStatic, isWater, inLake, zoneAt, HALF } from './worldgen.js';
import { Wildlife, Pets, EMOJI, SAY } from './animals.js';
import { Race } from './races.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
const TARGET = new V3(0, 1, 0);
const view = { yaw: 0, pitch: THREE.MathUtils.degToRad(50), yawV: 0, zoom: 1 };
const PITCH_MIN = THREE.MathUtils.degToRad(18), PITCH_MAX = THREE.MathUtils.degToRad(80);
let camShake = 0, zoneK = 0;
const wallC = new V3();

// ================================================================ save
const defaults = { done: [], cards: [], prize: 0, pets: [], items: [], equipped: null, veg: { carrot: 0, tomato: 0, cabbage: 0 }, plots: [], losses: 0, pos: [0, 6], feeds: 0, planted: 0 };
let S;
try { S = { ...defaults, ...JSON.parse(localStorage.getItem('khoi.s2') || '{}') }; } catch { S = { ...defaults }; }
if (!S.plots || S.plots.length !== FARM.plots.length) S.plots = FARM.plots.map(() => ({ kind: null, t: 0 }));
const persist = () => localStorage.setItem('khoi.s2', JSON.stringify(S));

// ================================================================ names
const isDigit = g => /\d/.test(g);
const glyphName = g => (isDigit(g) ? DIGIT_SAY[+g] : LETTER_SAY[g]);
const kindOf = g => (isDigit(g) ? 'số' : 'chữ');
let cfg;
const T = (key, o = {}) => (cfg.voices[key] || '').replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

// ================================================================ quests
const mk = o => Object.assign({ prepared: false, group: null, pile: [], ghosts: [], next: 0, landed: 0, cellPos: [], sprites: [] }, o);
const quests = [];
for (const s of GLYPH_SITES) {
  const gc = glyphCells(s.id);
  quests.push(mk({ kind: 'glyph', id: s.id, glyph: s.id, gc, ncell: gc.cells.length, needPrize: PRIZE_GLYPHS.has(s.id), pos: new V3(s.x, 0, s.z) }));
}
WORDS.forEach((w, k) => quests.push(mk({ kind: 'word', id: 'w_' + w.id, word: w, ncell: w.letters.length, needPrize: false, pos: new V3(WORD_SITES[k].x, 0, WORD_SITES[k].z) })));
for (const q of quests) { q.done = S.done.includes(q.id); q.centre = new V3(q.pos.x, 0, q.pos.z + 2.5); }
const unlocked = q => q.kind === 'glyph' || q.word.letters.every(l => S.cards.includes(l));
const missingLetters = q => q.word.letters.filter(l => !S.cards.includes(l));

const world = buildWorld(scene, renderer);
const fx = new Particles(scene);
const wildlife = new Wildlife(scene, (x, z) => !blockedStatic(x, z, 1.5));
const pets = new Pets(scene);

// light beams so every quest can be seen from far away, and a stone pad to build on
const padTex = mats.stone.map.clone(); padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping; padTex.repeat.set(20, 16); padTex.needsUpdate = true;
const padMat = new THREE.MeshLambertMaterial({ map: padTex });
for (const q of quests) {
  q.beam = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 70, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  q.beam.position.set(q.centre.x + 12, 35, q.centre.z - 5);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 16), padMat);
  pad.position.set(q.centre.x, .1, q.centre.z); pad.receiveShadow = true;
  scene.add(q.beam, pad);
}
function refreshBeams() {
  for (const q of quests) q.beam.material.color.set(q.done ? 0x4cff7a : unlocked(q) ? 0xffd23f : 0xff5a8a);
}

// ================================================================ camera
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.userData.dist = Math.max(20, (15 / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1.4)));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
function placeCamera() {
  const d = camera.userData.dist * view.zoom * (1 + .3 * zoneK);
  const cp = Math.cos(view.pitch);
  camera.position.set(TARGET.x + Math.sin(view.yaw) * cp * d,
    TARGET.y + Math.sin(view.pitch) * d + Math.sin(performance.now() * .04) * camShake * .15,
    TARGET.z + Math.cos(view.yaw) * cp * d);
  camera.lookAt(TARGET);
}

// ================================================================ state
let hero, nearQuest = null, spokenFor = null, celebrateUntil = 0, idleInZone = 0;
let buildMode = false, building = false, race = null, auto = null, busyAct = false;
const joy = { x: 0, y: 0 }, keys = new Set();
let ctxNow = null;
const toastEl = $('toast');
function toast(html) { toastEl.innerHTML = html; toastEl.classList.remove('go'); void toastEl.offsetWidth; toastEl.classList.add('go'); }
const heroPos = () => hero.holder.position;
function setStars() { $('stars').innerHTML = '<span style="color:#e0a800">★</span> ' + S.done.length; }

// ================================================================ preparing a quest site
function prepare(q) {
  if (q.prepared) return;
  q.prepared = true;
  const g = new THREE.Group();
  g.position.set(q.pos.x, 0, q.pos.z - 4.5);
  scene.add(g); q.group = g;
  if (q.kind === 'glyph') {
    g.rotation.x = -0.5;                                    // the wall leans back so it reads well from above
    const { cols, c0, r1 } = q.gc;
    q.cellPos = q.gc.cells.map(([c, r]) => new V3((c - c0 - (cols - 1) / 2) * 1.4, (r1 - r) * 1.4 + .8, 0));
  } else {
    const n = q.ncell;
    q.cellPos = q.word.letters.map((_, i) => new V3((i - (n - 1) / 2) * 3.1, 2.1, 0));
    const board = new THREE.Mesh(new THREE.BoxGeometry(n * 3.1 + 1.2, 4.2, .4), mats.plank);
    board.position.set(0, 2.1, -.4); board.castShadow = true; g.add(board);
  }
  g.updateMatrixWorld(true);
  if (q.done) { showDone(q); return; }
  const gh = q.kind === 'glyph' ? new THREE.BoxGeometry(1.3, 1.3, 1.3) : new THREE.BoxGeometry(2.4, 3.1, .15);
  q.cellPos.forEach((p, i) => {
    const m = new THREE.Mesh(gh, (q.needPrize && i === q.ncell - 1) ? new THREE.MeshLambertMaterial({ color: 0xffd23f, transparent: true, opacity: .45 }) : mats.ghost);
    m.position.copy(p); g.add(m); q.ghosts.push(m);
  });
  // loose pieces lying around the pad
  const count = q.kind === 'glyph' ? q.ncell - (q.needPrize ? 1 : 0) : q.ncell;
  let rs = Math.floor(q.pos.x * 31 + q.pos.z * 17) + 3;
  const rnd = () => ((rs = (rs * 16807) % 2147483647 + 2147483647) % 2147483647) / 2147483647;
  const pts = [];
  let minD = q.kind === 'glyph' ? 2.1 : 3.4;
  for (let tries = 0; pts.length < count; tries++) {
    if (tries % 60 === 59) minD *= .9;
    const p = new V3(q.pos.x + (rnd() * 2 - 1) * 8.5, q.kind === 'glyph' ? .65 : 1.5, q.pos.z + .5 + rnd() * 8);
    if (pts.every(o => o.distanceTo(p) > minD)) pts.push(p);
  }
  pts.forEach((p, i) => {
    const b = q.kind === 'glyph' ? makeWoodBlock() : letterCard(q.word.letters[i], (i * 70 + 20) % 360);
    b.position.set(p.x, 20, p.z);
    b.userData = { home: p, taken: false, phase: rnd() * 6, piece: true, idx: i };
    scene.add(b); q.pile.push(b);
    tween(.7, e => { b.position.y = 20 + (p.y - 20) * e; }, { delay: .02 * i, easing: ease.bounce });
  });
}
function showDone(q) {
  const g = q.group;
  if (q.kind === 'glyph') {
    q.cellPos.forEach(p => { const b = makeWoodBlock(mats.gold); b.position.copy(p); b.scale.setScalar(.95); g.add(b); });
    const l = numberSprite(q.glyph); l.position.set(0, (q.gc.rows) * 1.4 + 3.2, 0); l.scale.setScalar(4.2); g.add(l);
  } else {
    q.cellPos.forEach((p, i) => { const c = letterCard(q.word.letters[i], (i * 70 + 20) % 360); c.position.copy(p); g.add(c); });
    const l = labelSprite(q.word.text); l.scale.set(3.4 * l.userData.aspect, 3.4, 1); l.position.set(0, 7.2, 0); g.add(l);
    const e = emojiSprite(q.word.emoji); e.scale.setScalar(3.6); e.position.set(-(q.ncell * 3.1) / 2 - 2.4, 4.4, 0); g.add(e);
  }
}
function bobPile(t) {
  for (const q of quests) {
    if (!q.prepared || q.done) continue;
    for (const b of q.pile) {
      if (b.userData.taken || b.position.y > 3) continue;
      b.rotation.y = Math.sin(t * 1.5 + b.userData.phase) * .2;
      b.position.y = b.userData.home.y + Math.sin(t * 2.2 + b.userData.phase) * .08;
    }
  }
}

// ================================================================ walking by itself (to pick up and place pieces)
function goTo(x, z, stop = 1.5, speed = 13, { live = null, cancel = true, timeout = 9 } = {}) {
  return new Promise(res => { auto = { x, z, stop, speed, res, live, cancel, t: 0, timeout }; });
}
function endAuto(ok) { const a = auto; auto = null; if (a) a.res(ok); }

// ================================================================ building: the hero carries each piece to the wall
function nearestPile(q) {
  const h = heroPos();
  let best = null, bd = 1e9;
  for (const b of q.pile) { if (b.userData.taken) continue; const d = Math.hypot(b.position.x - h.x, b.position.z - h.z); if (d < bd) { bd = d; best = b; } }
  return best;
}
async function buildLoop(q) {
  if (building) return;
  building = true;
  const wv = new V3();
  while (buildMode && q.landed < q.ncell) {
    const i = q.next;
    const prizeCell = q.needPrize && i === q.ncell - 1;
    if (prizeCell && S.prize <= 0) { buildMode = false; speak('needprize', T('needprize')); hero.play('shake', { loop: false }); break; }
    let b;
    if (prizeCell) {
      S.prize--; persist(); updateBag();
      b = makeWoodBlock(mats.gold); b.position.copy(heroPos()).add(new V3(0, 2, 1.5)); scene.add(b); sfx.star();
    } else {
      b = q.kind === 'word' ? q.pile[i] : nearestPile(q);
      if (!b) break;
      b.userData.taken = true;
      const ok = await goTo(b.position.x, b.position.z + 1.2, 1.2, 13);
      if (!ok) { b.userData.taken = false; buildMode = false; break; }
      hero.play('pickup', { loop: false });
      await wait(250);
    }
    q.next++;
    // lift it above the head
    const word = q.kind === 'word';
    const from = b.position.clone();
    hero.holder.updateMatrixWorld(true);
    const to0 = hero.holder.localToWorld(new V3(0, word ? 4.5 : 4.0, .1));
    await tween(.25, e => { b.position.lerpVectors(from, to0, e); b.rotation.set(0, e * Math.PI, 0); b.scale.setScalar(1 - .25 * e); });
    hero.holder.add(b); b.position.set(0, word ? 4.5 : 4.0, .1); b.rotation.set(0, 0, 0); b.scale.setScalar(.75);
    hero.setCarry(true); sfx.pop(1 + (i % 10));
    // run to the wall
    q.group.updateMatrixWorld(true);
    const slot = q.group.localToWorld(q.cellPos[i].clone());
    await goTo(THREE.MathUtils.clamp(slot.x, q.pos.x - 8, q.pos.x + 8), q.pos.z - 4.5 + 4.2, .7, 13, { cancel: false });
    hero.holder.rotation.y = Math.PI;                          // face the wall
    hero.play('place', { loop: false });
    await wait(200);
    // throw it into its place
    b.getWorldPosition(wv);
    const start = wv.clone();
    scene.add(b); b.position.copy(start); b.scale.setScalar(1.05);
    hero.setCarry(false);
    await tween(.5, e => {
      b.position.lerpVectors(start, slot, e); b.position.y += Math.sin(e * Math.PI) * 2.6; b.rotation.y = e * Math.PI * 2;
      if (Math.random() < .6) fx.emit(b.position, { n: 2, colors: [0xffd23f, 0xfff3b0], size: .11, up: 0, speed: .6, life: .4, gravity: false });
    }, { easing: ease.inOut });
    q.group.attach(b);
    b.position.copy(q.cellPos[i]); b.rotation.set(0, 0, 0); b.scale.setScalar(word ? 1 : .95);
    sfx.land(); sfx.pop(1 + (i % 10));
    fx.emit(slot, { n: 12, colors: [0xffffff, 0xffd23f], size: .12, up: 2, speed: 2.4 });
    if (q.ghosts[i]) q.ghosts[i].visible = false;
    q.landed++;
  }
  building = false;
  if (q.landed >= q.ncell) { buildMode = false; complete(q); }
  refreshAct(true);
}

async function complete(q) {
  if (q.done) return;
  q.done = true; S.done.push(q.id);
  let card = null;
  if (q.kind === 'glyph' && !S.cards.includes(q.glyph)) { S.cards.push(q.glyph); card = q.glyph; }
  persist(); setStars(); updateCards(); refreshBeams();
  sfx.win(); sfx.star();
  camShake = 1; tween(.5, e => camShake = 1 - e);
  celebrateUntil = performance.now() / 1000 + 4;
  hero.play('dance', { loop: true, fade: .2 });
  const bs = $('bigstar'); bs.classList.remove('go'); void bs.offsetWidth; bs.classList.add('go');
  q.beam.material.opacity = .16;
  if (q.kind === 'glyph') q.group.children.forEach(o => { if (o.geometry && o.geometry.parameters && o.geometry.parameters.width === 1.3) o.material = mats.gold; });
  const top = new V3(q.pos.x, 12, q.pos.z - 4);
  let label;
  if (q.kind === 'glyph') { label = numberSprite(q.glyph); label.position.copy(top); label.scale.setScalar(.01); scene.add(label); tween(.7, e => label.scale.setScalar(7 * e), { easing: ease.back }); }
  else {
    label = labelSprite(q.word.text); label.position.copy(top); label.scale.setScalar(.01); scene.add(label);
    tween(.7, e => label.scale.set(5.5 * e * label.userData.aspect, 5.5 * e, 1), { easing: ease.back });
    const em = emojiSprite(q.word.emoji); em.position.set(q.pos.x, 21, q.pos.z - 4); em.scale.setScalar(.01); scene.add(em);
    tween(.8, e => em.scale.setScalar(6 * e), { easing: ease.back }); setTimeout(() => scene.remove(em), 5000);
  }
  const colors = [0xff5a7a, 0xffd23f, 0x4cd3ff, 0x7dff7a, 0xb36bff, 0xffffff];
  for (let r = 0; r < 8; r++) fx.emit(new V3(q.pos.x + (Math.random() - .5) * 14, 11 + Math.random() * 3, q.pos.z + (Math.random() - .5) * 10), { n: 22, colors, size: .22, up: -1, speed: 2.5, life: 2.4 });
  const said = q.kind === 'glyph' ? speak('done_' + q.id, T('done', { kind: kindOf(q.glyph), name: glyphName(q.glyph) })) : speak('worddone_' + q.id, T('worddone', { say: q.word.say }));
  for (let r = 0; r < 4; r++) {
    await wait(380); sfx.firework();
    fx.emit(new V3(q.pos.x + (Math.random() - .5) * 9, 8 + Math.random() * 4, q.pos.z - 3 + (Math.random() - .5) * 3), { n: 46, colors, size: .2, up: 0, speed: 5, life: 1.2, gravity: false });
  }
  await said;
  if (card) { toast(`<div>🃏</div><div style="font-size:.5em;font-weight:900;color:#fff;-webkit-text-stroke:8px #5a2d0c;paint-order:stroke fill">${card}</div>`); speak('cardnew', T('cardnew', { name: glyphName(card) })); }
  await wait(2800);
  scene.remove(label);
  if (S.done.length >= quests.length) speak('all', T('all'));
}

// ================================================================ races
function gateOf(tr) { return { x: tr.x, z: tr.z0 - 8 }; }
function startRace(tr) {
  if (race || building) return;
  buildMode = false; endAuto(false);
  $('joy').style.display = 'none'; $('heroBtn').style.display = 'none'; $('act').classList.remove('show'); $('tap').classList.add('show');
  const cd = $('count');
  race = new Race({
    scene, track: tr, hero, losses: S.losses,
    onCount: n => { cd.textContent = n > 0 ? String(n) : '🏁'; cd.classList.remove('show'); void cd.offsetWidth; cd.classList.add('show'); clearTimeout(cd._t); cd._t = setTimeout(() => cd.classList.remove('show'), 1000); if (n > 0) sfx.pop(n); else { sfx.win(); speak('go', T('go')); } if (n === 3) speak('racehello', T('racehello')); },
    onFinish: res => endRace(tr, res),
  });
  hero.play(tr.kind === 'car' ? 'sit' : 'idle', { loop: true });
}
async function endRace(tr, res) {
  $('tap').classList.remove('show');
  const r = race;
  if (res.won) {
    S.prize++; S.losses = 0; persist(); updateBag(); sfx.win(); sfx.star();
    toast('<div>🟨</div>'); hero.play('dance', { loop: true });
    const p = r.you.obj ? r.you.obj.position : heroPos();
    for (let k = 0; k < 6; k++) fx.emit(new V3(p.x + (Math.random() - .5) * 8, 8 + Math.random() * 3, p.z + (Math.random() - .5) * 6), { n: 24, colors: [0xff5a7a, 0xffd23f, 0x4cd3ff, 0x7dff7a], size: .22, up: -1, speed: 2.5, life: 2.2 });
    speak('racewin', T('racewin'));
  } else {
    S.losses++; persist(); speak('racelose', T('racelose')); hero.play('shake', { loop: false });
  }
  await wait(3200);
  r.dispose(); race = null;
  const g = gateOf(tr);
  heroPos().set(g.x, 0, g.z - 4); hero.holder.rotation.y = Math.PI;
  hero.play('idle', { loop: true });
  view.zoom = 1; view.pitch = THREE.MathUtils.degToRad(50);
  $('joy').style.display = ''; $('heroBtn').style.display = '';
}
$('tap').addEventListener('pointerdown', ev => { ev.preventDefault(); if (race) { race.tap(); sfx.pop(2); } });

// ================================================================ farm: garden, kitchen, animals
const VEG = { carrot: { emoji: '🥕', fruit: 0xff8a1f }, tomato: { emoji: '🍅', fruit: 0xe53935 }, cabbage: { emoji: '🥬', fruit: 0x9be36a } };
const VEG_KINDS = Object.keys(VEG);
const GROW_MS = 45000;
const plotGroups = FARM.plots.map(p => {
  const g = new THREE.Group(); g.position.set(p.x, .3, p.z); scene.add(g);
  const crops = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = new THREE.Group(); c.position.set(i * 3, 0, j * 3);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .7), new THREE.MeshLambertMaterial({ color: 0x3fae3f })); leaf.position.y = .45; leaf.castShadow = true;
    const fruit = new THREE.Mesh(new THREE.BoxGeometry(.9, .9, .9), new THREE.MeshLambertMaterial({ color: 0xff8a1f })); fruit.position.y = .5; fruit.castShadow = true;
    c.add(leaf, fruit); c.userData = { leaf, fruit }; g.add(c); crops.push(c);
  }
  g.visible = false; g.userData.crops = crops;
  return g;
});
const plotProgress = i => { const p = S.plots[i]; return p.kind ? Math.min(1, (Date.now() - p.t) / GROW_MS) : -1; };
function updateCrops() {
  S.plots.forEach((p, i) => {
    const g = plotGroups[i], pr = plotProgress(i);
    g.visible = pr >= 0;
    if (pr < 0) return;
    for (const c of g.userData.crops) {
      c.userData.fruit.material.color.set(VEG[p.kind].fruit);
      const s = .25 + .75 * pr;
      c.scale.set(s, s, s);
      c.userData.fruit.visible = pr > .45;
      c.position.y = pr >= 1 ? Math.abs(Math.sin(performance.now() / 300 + c.position.x)) * .15 : 0;
    }
  });
}
const ITEMS = [{ id: 'hat', emoji: '🎩' }, { id: 'crown', emoji: '👑' }, { id: 'glasses', emoji: '🕶️' }, { id: 'bow', emoji: '🎀' }, { id: 'scarf', emoji: '🧣' }, { id: 'balloon', emoji: '🎈' }];
function giveReward(chance = 1) {
  if (Math.random() > chance) return false;
  const free = ITEMS.filter(i => !S.items.includes(i.id));
  const r = Math.random();
  if (free.length && r < .65) {
    const it = free[(Math.random() * free.length) | 0];
    S.items.push(it.id); S.equipped = it.id; hero.equip(it.id);
    toast(`<div>${it.emoji}</div>`); speak('item', T('item')); sfx.star();
  } else { S.prize++; updateBag(); toast('<div>🟨</div>'); sfx.star(); }
  persist(); return true;
}

async function act(c) {
  if (busyAct) return;
  switch (c.k) {
    case 'build': {
      if (buildMode) { buildMode = false; endAuto(false); break; }
      buildMode = true; buildLoop(c.q); break;
    }
    case 'locked': speak('wordlocked', T('wordlocked', { letters: missingLetters(c.q).map(l => LETTER_SAY[l]).join(', ') })); break;
    case 'race': startRace(c.track); break;
    case 'plant': {
      busyAct = true; hero.play('plant', { loop: false }); speak('plant', T('plant')); sfx.pop(3); await wait(1000);
      const kind = VEG_KINDS[(S.planted++) % 3];
      S.plots[c.i] = { kind, t: Date.now() }; persist();
      fx.emit(new V3(FARM.plots[c.i].x, .6, FARM.plots[c.i].z), { n: 18, colors: [0x6b4a2a, 0x3fae3f], size: .18, up: 3, speed: 2.5 });
      busyAct = false; break;
    }
    case 'harvest': {
      busyAct = true; const p = S.plots[c.i]; hero.play('plant', { loop: false }); speak('harvest', T('harvest')); await wait(900);
      S.veg[p.kind]++; S.plots[c.i] = { kind: null, t: 0 }; persist(); updateBag(); sfx.star();
      fx.emit(new V3(FARM.plots[c.i].x, 1.2, FARM.plots[c.i].z), { n: 24, colors: [VEG[p.kind].fruit, 0xffffff, 0xffd23f], size: .2, up: 4, speed: 3 });
      toast(`<div>${VEG[p.kind].emoji}</div>`); busyAct = false; break;
    }
    case 'cook': {
      const have = VEG_KINDS.filter(k => S.veg[k] > 0), total = VEG_KINDS.reduce((a, k) => a + S.veg[k], 0);
      if (total < 2) { speak('noveg', T('noveg')); hero.play('shake', { loop: false }); break; }
      busyAct = true;
      let used = 0; for (const k of [...have, ...have]) { if (used < 2 && S.veg[k] > 0) { S.veg[k]--; used++; } }
      persist(); updateBag();
      hero.play('plant', { loop: false, speed: .55 }); speak('cook', T('cook'));
      const k = FARM.kitchen;
      for (let n = 0; n < 8; n++) { fx.emit(new V3(k.x + 5.8, 5.5, k.z + 1), { n: 6, colors: [0xffffff, 0xdddddd], size: .5, up: 3, speed: .8, life: 1.4, gravity: false }); sfx.pop(2 + (n % 4)); await wait(280); }
      toast('<div>🍲</div>'); sfx.win(); speak('yum', T('yum')); hero.play('eat', { loop: false });
      await wait(1500);
      giveReward(.8);
      busyAct = false; break;
    }
    case 'catch': {
      const an = c.an; if (!wildlife.list.includes(an)) break;
      busyAct = true; an.fleeing = true; speak('catchgo', 'Đuổi theo nào!');
      const ok = await goTo(0, 0, 2.3, 9, { live: () => an.g.position, timeout: 12 });
      if (ok && wildlife.list.includes(an)) {
        wildlife.take(an);
        if (pets.list.length < 6) { pets.add(an.kind, an.g.position); S.pets.push(an.kind); }
        persist(); sfx.win();
        fx.emit(an.g.position.clone().setY(2), { n: 30, colors: [0xff5f95, 0xffffff, 0xffd23f], size: .2, up: 4, speed: 3 });
        toast(`<div>${EMOJI[an.kind]}</div>`); speak('catch', T('catch', { kind: SAY[an.kind] })); hero.play('clap', { loop: false });
        await wait(1600); giveReward(.3);
      } else an.fleeing = false;
      busyAct = false; break;
    }
    case 'feed': {
      if (S.veg.carrot < 1 || !pets.list.length) break;
      S.veg.carrot--; S.feeds++; persist(); updateBag();
      const hp = heroPos();
      const pet = pets.list.slice().sort((a, b) => a.g.position.distanceTo(hp) - b.g.position.distanceTo(hp))[0];
      hero.play('plant', { loop: false }); speak('feed', T('feed')); sfx.star();
      const e = emojiSprite('❤️'); e.position.copy(pet.g.position).add(new V3(0, 3, 0)); e.scale.setScalar(2.4); scene.add(e);
      tween(1.2, k => { e.position.y += .03; e.material.opacity = 1 - k; }).then(() => scene.remove(e));
      fx.emit(pet.g.position.clone().setY(2), { n: 16, colors: [0xff5f95, 0xffb3d1], size: .2, up: 3, speed: 2 });
      if (S.feeds % 3 === 0) { await wait(900); giveReward(1); }
      break;
    }
  }
  refreshAct(true);
}

// ================================================================ which action is on offer right now
function context() {
  if (race || busyAct) return null;
  const h = heroPos();
  for (const tr of Object.values(TRACKS)) { const g = gateOf(tr); if (Math.hypot(h.x - g.x, h.z - g.z) < 16) return { k: 'race', track: tr, icon: '🏁' }; }
  if (nearQuest) {
    const q = nearQuest;
    if (!q.done && unlocked(q)) return { k: 'build', q, icon: buildMode ? '⏸️' : (q.kind === 'word' ? '🃏' : '🧱') };
    if (!q.done) return { k: 'locked', q, icon: '🔒' };
  }
  for (let i = 0; i < FARM.plots.length; i++) {
    const p = FARM.plots[i];
    if (Math.hypot(h.x - p.x, h.z - p.z) < 8) { const pr = plotProgress(i); if (pr < 0) return { k: 'plant', i, icon: '🌱' }; if (pr >= 1) return { k: 'harvest', i, icon: '🧺' }; }
  }
  const k = FARM.kitchen;
  if (Math.hypot(h.x - (k.x + 2), h.z - (k.z + 6)) < 11) return { k: 'cook', icon: '🍳' };
  const an = wildlife.nearest(h.x, h.z, 14);
  if (an && !an.fleeing) return { k: 'catch', an, icon: EMOJI[an.kind] };
  if (pets.list.length && S.veg.carrot > 0) return { k: 'feed', icon: '🥕' };
  return null;
}
const actBtn = $('act');
function refreshAct(force = false) {
  const c = context();
  const key = c ? c.k + (c.i ?? '') + (c.q ? c.q.id : '') + c.icon : '';
  if (!force && ctxNow && ctxNow.key === key) { ctxNow.c = c; return; }
  ctxNow = { key, c };
  actBtn.classList.toggle('show', !!c);
  actBtn.classList.toggle('on', !!c && c.k === 'build' && buildMode);
  if (c) $('actIcon').textContent = c.icon;
}
actBtn.addEventListener('click', () => { const c = context(); if (c) act(c); });

// ================================================================ bag + cards
function updateBag() {
  const parts = [];
  if (S.prize > 0) parts.push(`<span>🟨 ${S.prize}</span>`);
  for (const k of VEG_KINDS) if (S.veg[k] > 0) parts.push(`<span>${VEG[k].emoji} ${S.veg[k]}</span>`);
  $('bag').innerHTML = parts.join('');
}
function updateCards() {
  $('cardsN').textContent = S.cards.length;
  const order = [...DIGITS, ...LETTERS].filter(c => S.cards.includes(c));
  $('cardsGrid').innerHTML = order.map(c => `<div class="card ${isDigit(c) ? 'num' : ''}" data-c="${c}">${c}</div>`).join('') || '<div style="color:#fff;font-size:28px;grid-column:1/-1;text-align:center">🃏 ?</div>';
}
$('cardsBtn').addEventListener('click', () => { updateCards(); $('cards').classList.add('show'); });
$('cardsClose').addEventListener('click', () => $('cards').classList.remove('show'));
$('cardsGrid').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) { sfx.pop(3); speak('card_' + c.dataset.c, glyphName(c.dataset.c)); } });

// ================================================================ input: walking stick
const joyEl = $('joy'), knob = $('knob');
let joyId = null;
function joyMove(ev) {
  const r = joyEl.getBoundingClientRect();
  let dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
}
joyEl.addEventListener('pointerdown', ev => { joyId = ev.pointerId; joyEl.setPointerCapture(ev.pointerId); joyMove(ev); ev.preventDefault(); });
joyEl.addEventListener('pointermove', ev => { if (ev.pointerId === joyId) joyMove(ev); });
const joyEnd = ev => { if (ev.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') { const c = context(); if (c) act(c); } });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// swipe the world around, pinch to zoom
const ptrs = new Map();
let dragging = false, moved = 0, pinch0 = 0, zoom0 = 1;
canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ptrs.size === 1) { moved = 0; dragging = false; view.yawV = 0; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = view.zoom; dragging = true; }
});
canvas.addEventListener('pointermove', ev => {
  const p = ptrs.get(ev.pointerId); if (!p || race) return;
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  p.x = ev.clientX; p.y = ev.clientY;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; view.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), .5, 1.7); return; }
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > 14) dragging = true;
  if (dragging) {
    view.yaw -= dx * .008;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * .005, PITCH_MIN, PITCH_MAX);
    view.yawV = THREE.MathUtils.clamp(-dx * .008 * 60, -3, 3);
  }
});
const endPtr = ev => { if (ptrs.delete(ev.pointerId) && ptrs.size === 0) setTimeout(() => { dragging = false; }, 0); };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', ev => { view.zoom = THREE.MathUtils.clamp(view.zoom * (1 + ev.deltaY * .001), .5, 1.7); }, { passive: true });

$('replay').addEventListener('click', () => {
  if (!cfg) return;
  hero.play('nod', { loop: false });
  const q = nearQuest;
  if (q && !q.done && unlocked(q)) q.kind === 'glyph' ? speak('intro_' + q.id, T('intro', { kind: kindOf(q.glyph), name: glyphName(q.glyph) })) : speak('wordintro', T('wordintro', { say: q.word.say }));
  else if (q && !q.done) speak('wordlocked', T('wordlocked', { letters: missingLetters(q).map(l => LETTER_SAY[l]).join(', ') }));
  else speak('find', T('find'));
});

// ================================================================ reset progress
$('resetBtn').addEventListener('click', () => { $('resetConfirm').style.display = 'grid'; });
$('resetNo').addEventListener('click', () => { $('resetConfirm').style.display = 'none'; });
$('resetYes').addEventListener('click', () => {
  localStorage.removeItem('khoi.s2');
  localStorage.removeItem('khoi.hero');
  location.reload();
});

// ================================================================ choose your friend
let welcomed = false;
$('play').addEventListener('click', async () => {
  $('title').classList.remove('show');
  await initAudio();
  if (!welcomed) { welcomed = true; hero.play('greet', { loop: false }); speak('welcome', T('welcome')); }
});
const picks = new Map();
const urlOf = v => thumb(v).toDataURL();
for (const v of VARIANTS) {
  const b = document.createElement('button');
  b.className = 'pick'; b.setAttribute('aria-label', 'Bạn ' + v.id);
  b.innerHTML = '<img alt="">'; b.firstChild.src = urlOf(v);
  b.addEventListener('click', () => chooseHero(v));
  $('picker').appendChild(b); picks.set(v.id, b);
}
function refreshPicker() {
  for (const [id, b] of picks) b.classList.toggle('sel', id === hero.variant.id);
  $('heroImg').src = urlOf(hero.variant);
}
let swapping = false;
async function chooseHero(v) {
  if (swapping || (hero && hero.variant.id === v.id)) return;
  swapping = true;
  localStorage.setItem('khoi.hero', v.id);
  const old = hero, pos = old.holder.position.clone(), rot = old.holder.rotation.y;
  const nh = await loadCharacter(scene, v);
  nh.holder.position.copy(pos); nh.holder.rotation.y = rot;
  if (S.equipped) nh.equip(S.equipped);
  scene.remove(old.holder);
  hero = nh;
  hero.play('power', { loop: false });
  sfx.star(); fx.emit(pos.clone().setY(2), { n: 24, colors: [0xffd23f, 0xffffff, 0xff9ad5], size: .18, up: 4, speed: 3 });
  refreshPicker();
  swapping = false;
}
$('heroBtn').addEventListener('click', () => $('title').classList.add('show'));

// ================================================================ boot
const BASE = import.meta.env.BASE_URL;
(async () => {
  cfg = await (await fetch(BASE + 'levels.json')).json();
  const savedHero = localStorage.getItem('khoi.hero');
  hero = await loadCharacter(scene, VARIANTS.find(v => v.id === savedHero) || VARIANTS[0]);
  refreshPicker();
  if (S.equipped) hero.equip(S.equipped);
  heroPos().set(S.pos[0], 0, S.pos[1]);
  TARGET.set(S.pos[0], 1, S.pos[1]);
  for (const k of S.pets) pets.add(k, new V3(S.pos[0] - 3, 0, S.pos[1] - 3));
  world.stream(S.pos[0], S.pos[1], 99);
  setStars(); updateBag(); updateCards(); refreshBeams();
  window.__ready = true;
})();

// ================================================================ minimap + compass
const mapCv = $('map'), mapCtx = mapCv.getContext('2d');
const MAP = 92, MAP_R = 240;
const mapImg = mapCtx.createImageData(MAP, MAP);
const hex = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const MC = { grass: hex(0x4aa84a), water: hex(0x3aa7ff), city: hex(0x8c8c92), park: hex(0xe7d6b0), farm: hex(0xb58a55), meadow: hex(0x79c966), out: hex(0x1d5fa8) };
function drawMap() {
  const h = heroPos(), cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const rx = [cy, -sy], fw = [-sy, -cy];
  const d = mapImg.data;
  for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) {
    const ox = (i - MAP / 2 + .5) / (MAP / 2) * MAP_R, oy = (j - MAP / 2 + .5) / (MAP / 2) * MAP_R;
    const wx = h.x + rx[0] * ox + fw[0] * -oy, wz = h.z + rx[1] * ox + fw[1] * -oy;
    let c = MC.grass;
    if (Math.abs(wx) > HALF || Math.abs(wz) > HALF) c = MC.out;
    else if (isWater(wx, wz) || inLake(wx, wz)) c = MC.water;
    else { const z = zoneAt(wx, wz); if (z === 'city') c = MC.city; else if (z === 'park') c = MC.park; else if (z === 'farm') c = MC.farm; else if (z === 'meadow') c = MC.meadow; }
    const k = (j * MAP + i) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
  }
  mapCtx.putImageData(mapImg, 0, 0);
  const dot = (x, z, col, r) => {
    const ddx = x - h.x, ddz = z - h.z, ox = ddx * rx[0] + ddz * rx[1], oy = -(ddx * fw[0] + ddz * fw[1]);
    let px = MAP / 2 + ox / MAP_R * (MAP / 2), py = MAP / 2 + oy / MAP_R * (MAP / 2);
    const inside = Math.abs(px - MAP / 2) < MAP / 2 - 3 && Math.abs(py - MAP / 2) < MAP / 2 - 3;
    if (!inside) { const a = Math.atan2(py - MAP / 2, px - MAP / 2); px = MAP / 2 + Math.cos(a) * (MAP / 2 - 4); py = MAP / 2 + Math.sin(a) * (MAP / 2 - 4); r = 2; }
    mapCtx.fillStyle = col; mapCtx.beginPath(); mapCtx.arc(px, py, r, 0, 7); mapCtx.fill();
  };
  for (const q of quests) dot(q.centre.x, q.centre.z, q.done ? '#1d6b2c' : unlocked(q) ? '#ffb400' : '#d04a6a', q.done ? 2 : 3.2);
  for (const tr of Object.values(TRACKS)) dot(tr.x, tr.z0, '#ffffff', 3.5);
  dot(FARM.kitchen.x, FARM.kitchen.z, '#ff7a00', 3);
  mapCtx.fillStyle = '#fff'; mapCtx.beginPath(); mapCtx.arc(MAP / 2, MAP / 2, 5, 0, 7); mapCtx.fill();
  mapCtx.fillStyle = '#1e90ff'; mapCtx.beginPath(); mapCtx.arc(MAP / 2, MAP / 2, 3.4, 0, 7); mapCtx.fill();
}
function gateNearest() {
  const h = heroPos(); let best = null, bd = 1e9;
  for (const tr of Object.values(TRACKS)) { const g = gateOf(tr), d = Math.hypot(g.x - h.x, g.z - h.z); if (d < bd) { bd = d; best = g; } }
  return best;
}
function compassTarget() {
  const h = heroPos();
  const waiting = quests.find(q => !q.done && q.needPrize && q.prepared && q.next >= q.ncell - 1 && q.landed >= q.ncell - 1);
  if (waiting) return S.prize > 0 ? waiting.centre : gateNearest();
  let best = null, bd = 1e9;
  for (const q of quests) { if (q.done || !unlocked(q)) continue; const d = Math.hypot(q.centre.x - h.x, q.centre.z - h.z); if (d < bd) { bd = d; best = q; } }
  return best ? best.centre : null;
}
function updateCompass() {
  const h = heroPos(), tg = compassTarget(), comp = $('compass');
  if (!tg) { comp.style.opacity = .25; return; }
  const dx = tg.x - h.x, dz = tg.z - h.z, dist = Math.hypot(dx, dz);
  if (dist < 14) { comp.style.opacity = .25; return; }
  comp.style.opacity = 1;
  const fwd = [-Math.sin(view.yaw), -Math.cos(view.yaw)], right = [Math.cos(view.yaw), -Math.sin(view.yaw)];
  $('arrow').style.transform = `rotate(${Math.atan2(dx * right[0] + dz * right[1], dx * fwd[0] + dz * fwd[1])}rad)`;
}

// ================================================================ main loop
const clock = new THREE.Clock();
let hudT = 0, saveT = 0, cropT = 0;
const mv = new V3(), tmpV = new V3();
function frame() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  updateTweens(dt);
  fx.update(dt);
  if (hero) {
    const hp = heroPos();
    let jx = joy.x, jy = joy.y;
    if (keys.size) {
      jx += (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      jy += (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    }
    const mag = Math.min(1, Math.hypot(jx, jy));
    if (race) {
      race.update(dt);
      const f = race.camFocus();
      TARGET.lerp(tmpV.set(f.x - 3, 1.5, f.z), 1 - Math.exp(-6 * dt));
      view.yaw += (-Math.PI / 2 - view.yaw) * (1 - Math.exp(-4 * dt));
      view.pitch += (.5 - view.pitch) * (1 - Math.exp(-4 * dt));
      view.zoom += (1.9 - view.zoom) * (1 - Math.exp(-4 * dt));
    } else {
      const prev = hp.clone();
      let dirx = 0, dirz = 0, spd = 0, moving = false;
      if (auto) {
        if (auto.live) { const lp = auto.live(); auto.x = lp.x; auto.z = lp.z; }
        auto.t += dt;
        const dx = auto.x - hp.x, dz = auto.z - hp.z, dist = Math.hypot(dx, dz);
        if (auto.cancel && mag > .35) endAuto(false);
        else if (dist < auto.stop) endAuto(true);
        else if (auto.t > auto.timeout) { if (!auto.live) { hp.x = auto.x; hp.z = auto.z; } endAuto(true); }
        else { dirx = dx / dist; dirz = dz / dist; spd = auto.speed; moving = true; }
      } else if (mag > .12) {
        const fwd = [-Math.sin(view.yaw), -Math.cos(view.yaw)], right = [Math.cos(view.yaw), -Math.sin(view.yaw)];
        mv.set(right[0] * jx + fwd[0] * -jy, 0, right[1] * jx + fwd[1] * -jy).normalize();
        dirx = mv.x; dirz = mv.z; spd = mag > .75 ? 12 : 5; moving = true;
        if (buildMode && mag > .35) buildMode = false;
      }
      if (moving) {
        hp.x += dirx * spd * dt; hp.z += dirz * spd * dt;
        world.collide(hp, prev);
        let da = Math.atan2(dirx, dirz) - hero.holder.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
        hero.holder.rotation.y += da * Math.min(1, dt * 12);
        hero.locomote(spd > 8 ? 'run' : 'walk', 1);
      } else if (t > celebrateUntil && !hero.state.oneshot && hero.state.name !== 'idle' && !busyAct) hero.locomote('idle', 1);
      TARGET.lerp(tmpV.set(hp.x, 1.2, hp.z).lerp(wallC, .6 * zoneK), 1 - Math.exp(-6 * dt));
    }
    hero.mixer.update(dt);
    world.update(dt, hp.x, hp.z);
    if (!race) { wildlife.update(dt, hp.x, hp.z); pets.update(dt, hp, hero.holder.rotation.y); }

    // which quest site is close
    let near = null;
    for (const q of quests) {
      const d = Math.hypot(hp.x - q.centre.x, hp.z - q.centre.z);
      if (d < 70) prepare(q);
      if (d < 14) near = q;
    }
    if (near !== nearQuest) {
      nearQuest = near; idleInZone = 0;
      if (near && spokenFor !== near.id && !race) {
        spokenFor = near.id;
        if (near.kind === 'glyph') near.done ? speak('again_' + near.id, T('again', { kind: kindOf(near.glyph), name: glyphName(near.glyph) })) : speak('intro_' + near.id, T('intro', { kind: kindOf(near.glyph), name: glyphName(near.glyph) }));
        else if (near.done) speak('worddone_' + near.id, T('worddone', { say: near.word.say }));
        else unlocked(near) ? speak('wordintro', T('wordintro', { say: near.word.say })) : speak('wordlocked', T('wordlocked', { letters: missingLetters(near).map(l => LETTER_SAY[l]).join(', ') }));
      }
      if (!near) spokenFor = null;
      refreshAct(true);
    }
    if (nearQuest) wallC.set(nearQuest.pos.x, 3, nearQuest.pos.z - 2);
    zoneK += ((nearQuest && !race ? 1 : 0) - zoneK) * (1 - Math.exp(-2.5 * dt));
    for (const q of quests) q.beam.material.opacity = q.done ? .16 : (q === nearQuest ? .12 : .4);

    bobPile(t);
    hudT += dt;
    if (hudT > .12) { hudT = 0; drawMap(); updateCompass(); refreshAct(); }
    cropT += dt; if (cropT > .4) { cropT = 0; updateCrops(); }
    saveT += dt; if (saveT > 3) { saveT = 0; S.pos = [+hp.x.toFixed(1), +hp.z.toFixed(1)]; persist(); }
  }
  if (!dragging && !race) { view.yaw += view.yawV * dt; view.yawV *= Math.pow(.04, dt); }
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.__dbg = {
  get state() { const h = heroPos(); return { x: +h.x.toFixed(1), z: +h.z.toFixed(1), near: nearQuest && nearQuest.id, done: S.done, cards: S.cards, prize: S.prize, anim: hero.state.name, chunks: world.chunkCount(), building, buildMode, pets: S.pets.length, veg: S.veg }; },
  teleport(x, z) { heroPos().set(x, 0, z); },
  quests, S, view, camera, get hero() { return hero; }, act: () => { const c = context(); if (c) act(c); return c && c.k; },
  context, chooseHero: id => chooseHero(VARIANTS.find(v => v.id === id)), startRace: k => startRace(TRACKS[k]), get race() { return race; },
  get calls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; }, wildlife, pets, plotProgress,
};
