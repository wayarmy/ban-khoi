import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Mesh2Motion (CC0) human rig + animation clips. All clips share the same skeleton.
const CLIPS = {
  idle: 'idle-a', greet: 'greeting', clap: 'clapping', dance: 'dance-simple',
  dance2: 'dance-body-roll', jump: 'jump-2', nod: 'head-nod', power: 'power-up',
  walk: 'walk-happy', run: 'jog',
};

export async function loadCharacter(scene, base = '') {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = u => loader.loadAsync(base + u);
  const model = await load('models/human.glb');
  const root = model.scene;

  // normalise height to ~3.4 world units
  const box = new THREE.Box3().setFromObject(root);
  const k = 3.9 / (box.max.y - box.min.y);
  root.scale.setScalar(k);
  root.position.y -= box.min.y * k;
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.color.set(0x3bb8ff);          // bright blue buddy
      if (o.material.map) o.material.map = null;
    }
  });

  const holder = new THREE.Group();
  holder.add(root);
  scene.add(holder);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  await Promise.all(Object.entries(CLIPS).map(async ([name, file]) => {
    const g = await load(`anims/${file}.glb`);
    const clip = g.animations[0];
    // keep bone scale ours (big head): drop the scale tracks from the clip
    if (clip) {
      clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.scale'));
      // legs are shorter now, so the hips must sit lower in every move
      for (const t of clip.tracks) if (/pelvis\.position$/.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= CUTE.leg;
    }
    if (clip) actions[name] = mixer.clipAction(clip);
  }));
  makeCute(root);

  const st = { name: '', oneshot: false };
  let cur = null;
  function play(name, { loop = true, fade = .25, then = 'idle', speed = 1 } = {}) {
    const next = actions[name] || actions.idle;
    if (!next) return;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    next.enabled = true;
    if (cur && cur !== next) next.crossFadeFrom(cur, fade, false);
    next.play();
    cur = next;
    st.name = name; st.oneshot = !loop;
    if (!loop) {
      const onDone = e => {
        if (e.action !== next) return;
        mixer.removeEventListener('finished', onDone);
        if (cur === next) { st.oneshot = false; play(then); }
      };
      mixer.addEventListener('finished', onDone);
    }
  }
  play('idle');

  // walking / idling is chosen every frame; one-shot moves (cheer, wave) are never interrupted
  function locomote(name, speed = 1) {
    if (st.oneshot) return;
    if (st.name !== name) play(name, { speed });
    else if (cur) cur.timeScale = speed;
  }

  return { holder, root, mixer, play, locomote, state: st, has: n => !!actions[n] };
}

// ---------- make the stock mannequin cute ----------
// 1) big head (chibi), 2) colour each body part by its main bone, 3) face + bunny ears made of blocks.
const SKIN = 0xffd3a8, SHIRT = 0xff7a3d, PANTS = 0x2f6bd6, SHOES = 0x7a4a2a;
function partColor(bone) {
  const n = bone.toLowerCase();
  if (/head|neck/.test(n)) return SKIN;
  if (/hand|index|middle|ring|pinky|thumb/.test(n)) return SKIN;
  if (/foot|ball|toe/.test(n)) return SHOES;
  if (/thigh|calf|pelvis/.test(n)) return PANTS;
  return SHIRT;
}
function makeCute(root) {
  const bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const head = bones.head || bones.Head;
  if (head) head.scale.set(CUTE.head * 1.15, CUTE.head * .85, CUTE.head * 1.15);   // wide and round
  for (const n of ['thigh_l', 'thigh_r']) if (bones[n]) bones[n].scale.setScalar(CUTE.leg);
  if (bones.hand_l) bones.hand_l.scale.setScalar(CUTE.hand);
  if (bones.hand_r) bones.hand_r.scale.setScalar(CUTE.hand);

  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const names = o.skeleton.bones.map(b => b.name);
    const cols = new Float32Array(si.count * 3), c = new THREE.Color();
    for (let i = 0; i < si.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      c.set(partColor(names[best] || '')).convertSRGBToLinear();
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    o.material.vertexColors = true;
    o.material.color.set(0xffffff);
    o.material.needsUpdate = true;
  });

  if (!head) return;
  const box = (w, h, d, color, x, y, z, parent = head) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const F = CUTE.face;                                   // face sits on this side of the head
  const cy = CUTE.cy;                                    // head centre height along the bone
  for (const s of [-1, 1]) {
    box(.034, .05, .02, 0x20222b, s * .055, cy + .015, F * .105);              // eye
    box(.012, .014, .01, 0xffffff, s * .055 + s * -.008, cy + .03, F * .117);  // shine
    box(.04, .022, .01, 0xff8fa8, s * .088, cy - .03, F * .104);               // cheek
  }
  box(.05, .012, .01, 0x8a2f3c, 0, cy - .03, F * .108);                         // smile
  // bunny hood
  for (const s of [-1, 1]) {
    const ear = box(.05, .2, .035, 0xffffff, s * .06, cy + .21, -F * .01);
    box(.026, .15, .012, 0xffa6c1, 0, .005, F * .02, ear);
    ear.rotation.z = -s * .12;
  }
  box(.11, .03, .11, 0xffffff, 0, cy + .115, -F * .005);                          // hat band
}
const CUTE = { head: 2.0, hand: 1.5, leg: .66, face: 1, cy: .12 };
