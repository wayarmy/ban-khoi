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
  const k = 3.4 / (box.max.y - box.min.y);
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
    if (g.animations[0]) actions[name] = mixer.clipAction(g.animations[0]);
  }));

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
