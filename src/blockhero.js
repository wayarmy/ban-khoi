import * as THREE from 'three';

// "Bạn Khối": little critters built from blocks (our own design, not a Minecraft mob).
// Big square head with a smiling pixel face, short body, four stubby legs, tiny arms, one extra on top.
// Moves are drawn in code (no animation files), so every move is smooth and easy to change.

const LEAF = '#38b34a';

// Six friends to choose from. Same body, different colours and little extras.
export const VARIANTS = [
  { id: 'mint',   body: '#7fe3b4', dark: '#5cc896', belly: '#c9f7df', leg: '#4fb98c', cheek: '#ff9db8', acc: 'sprout' },
  { id: 'pink',   body: '#ffa6c8', dark: '#ff86b3', belly: '#fff0f6', leg: '#f06ea0', cheek: '#ff5f95', acc: 'cat' },
  { id: 'yellow', body: '#ffe066', dark: '#ffd23f', belly: '#fff6cc', leg: '#f2b705', cheek: '#ff9db8', acc: 'beak' },
  { id: 'blue',   body: '#7cc7ff', dark: '#5aa9ee', belly: '#e6f4ff', leg: '#3f8fd6', cheek: '#ff9db8', acc: 'antenna' },
  { id: 'orange', body: '#ff9a4d', dark: '#f07d2a', belly: '#fff1e0', leg: '#d9651a', cheek: '#ff7a8a', acc: 'fox' },
  { id: 'purple', body: '#c9a2ff', dark: '#a97bf0', belly: '#f1e6ff', leg: '#8d5fd8', cheek: '#ff9db8', acc: 'star' },
];

const dot = (x, c, px_, py, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(px_, py, w, h); };

function px(draw, base, jitter = .14, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const b = new THREE.Color(base);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const k = 1 + (rnd() - .5) * jitter;
    x.fillStyle = `rgb(${Math.min(255, b.r * 255 * k) | 0},${Math.min(255, b.g * 255 * k) | 0},${Math.min(255, b.b * 255 * k) | 0})`;
    x.fillRect(i, j, 1, 1);
  }
  if (draw) draw(x);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t });
}
const plain = (c, seed) => px(null, c, .16, seed);

// eyes 3x4 px with a shine, rosy cheeks, small smile with a tongue
function drawFace(x, blink, cheek) {
  for (const ex of [2, 11]) {
    if (blink) { dot(x, '#1c2330', ex, 6, 3, 1); continue; }
    dot(x, '#1c2330', ex, 4, 3, 4);
    dot(x, '#ffffff', ex, 4, 1, 1);
    dot(x, '#4a5a78', ex + 2, 7, 1, 1);
  }
  dot(x, cheek, 0, 9, 2, 2); dot(x, cheek, 14, 9, 2, 2);
  dot(x, '#7a2d3d', 5, 10, 1, 1); dot(x, '#7a2d3d', 10, 10, 1, 1);
  dot(x, '#7a2d3d', 6, 11, 4, 1);
  dot(x, '#ff7a93', 7, 12, 2, 1);
}

// small pixel picture for the picker buttons (20 x 20 px, shown big with sharp pixels)
export function thumb(v) {
  const c = document.createElement('canvas'); c.width = c.height = 20;
  const x = c.getContext('2d');
  x.save(); x.translate(2, 4);
  dot(x, v.body, 0, 0, 16, 16);
  dot(x, v.dark, 0, 0, 16, 1);
  dot(x, v.belly, 5, 13, 6, 3);
  drawFace(x, false, v.cheek);
  x.restore();
  switch (v.acc) {
    case 'sprout': dot(x, LEAF, 9, 1, 2, 3); dot(x, LEAF, 6, 1, 3, 1); dot(x, LEAF, 11, 1, 3, 1); break;
    case 'cat': for (const ex of [3, 14]) { dot(x, v.dark, ex, 1, 3, 3); dot(x, '#ffd0e0', ex + 1, 2, 1, 2); } break;
    case 'beak': dot(x, '#ff9c1a', 8, 11, 4, 2); dot(x, '#ffb84d', 9, 2, 1, 2); dot(x, '#ffb84d', 11, 3, 1, 1); dot(x, '#ffb84d', 7, 3, 1, 1); break;
    case 'antenna': dot(x, '#8791a0', 9, 2, 2, 2); dot(x, '#ff4d5e', 8, 0, 4, 2); break;
    case 'fox': for (const ex of [3, 14]) { dot(x, v.dark, ex, 0, 3, 4); dot(x, '#2b1a10', ex + 1, 0, 1, 1); } break;
    case 'star': dot(x, '#ffd23f', 9, 0, 2, 4); dot(x, '#ffd23f', 7, 1, 6, 2); break;
  }
  return c;
}

const CLIP_LEN = { greet: 2, nod: 1.1, clap: 2.2, jump: 1.1, power: 1.7 };
const KNOWN = ['idle', 'walk', 'run', 'greet', 'nod', 'clap', 'dance', 'dance2', 'jump', 'power'];

export async function loadCharacter(scene, variant = VARIANTS[0]) {
  const v = variant;
  const side = plain(v.body, 3), top = plain(v.dark, 5), belly = px(x => { dot(x, v.belly, 3, 4, 10, 9); }, v.body, .12, 9);
  const faceOpen = px(x => drawFace(x, false, v.cheek), v.body, .1, 21);
  const faceBlink = px(x => drawFace(x, true, v.cheek), v.body, .1, 21);
  const legM = plain(v.leg, 7), armM = plain(v.dark, 11), leafM = plain(LEAF, 13);

  const holder = new THREE.Group();
  const root = new THREE.Group();
  holder.add(root);
  holder.scale.setScalar(1.4);               // a bit bigger so a small child sees it well from the game camera
  scene.add(holder);

  const part = (w, h, d, mats, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.y = y; m.castShadow = true; return m;
  };
  const colorM = (c, seed) => plain(c, seed);

  const torso = new THREE.Group(); torso.position.y = .7; root.add(torso);
  torso.add(part(1, 1.1, .8, [side, side, top, top, belly, side], .55));

  const head = new THREE.Group(); head.position.y = 1.1; torso.add(head);
  const headMesh = part(1.5, 1.5, 1.5, [side, side, top, side, faceOpen, side], .75);
  head.add(headMesh);

  // ---- the extra on top, different for each friend ----
  let sprout = null, tail = null;
  const on = (m, x, y, z, rz = 0) => { m.position.set(x, y, z); m.rotation.z = rz; head.add(m); return m; };
  switch (v.acc) {
    case 'sprout': {
      sprout = new THREE.Group(); sprout.position.y = 1.5; head.add(sprout);
      sprout.add(part(.12, .34, .12, leafM, .17));
      for (const s of [-1, 1]) { const leaf = part(.4, .1, .22, leafM, .36); leaf.position.x = s * .22; leaf.rotation.z = -s * .45; sprout.add(leaf); }
      break;
    }
    case 'cat': {
      const ear = colorM(v.dark, 31), inner = colorM('#ffd0e0', 32);
      for (const s of [-1, 1]) {
        on(part(.42, .42, .22, ear), s * .5, 1.7, 0, -s * .12);
        on(part(.2, .24, .05, inner), s * .5, 1.7, .12, -s * .12);
      }
      break;
    }
    case 'beak': {
      on(part(.5, .22, .34, colorM('#ff9c1a', 33)), 0, .74, .88);
      const tuft = colorM('#ffb84d', 34);
      on(part(.1, .3, .1, tuft), 0, 1.65, 0);
      on(part(.1, .24, .1, tuft), .16, 1.62, 0, -.4);
      on(part(.1, .24, .1, tuft), -.16, 1.62, 0, .4);
      break;
    }
    case 'antenna': {
      sprout = new THREE.Group(); sprout.position.y = 1.5; head.add(sprout);
      sprout.add(part(.08, .5, .08, colorM('#8791a0', 35), .25));
      const ball = part(.26, .26, .26, colorM('#ff4d5e', 36), .6); sprout.add(ball);
      break;
    }
    case 'fox': {
      const ear = colorM(v.dark, 37), tip = colorM('#2b1a10', 38);
      for (const s of [-1, 1]) {
        on(part(.4, .3, .22, ear), s * .5, 1.63, 0);
        on(part(.24, .26, .2, ear), s * .5, 1.9, 0);
        on(part(.12, .1, .21, tip), s * .5, 2.05, 0);
      }
      tail = new THREE.Group(); tail.position.set(0, .35, -.4); torso.add(tail);
      const t1 = part(.34, .34, .8, colorM(v.body, 39)); t1.position.set(0, 0, -.4); tail.add(t1);
      const t2 = part(.36, .36, .26, colorM('#fff1e0', 40)); t2.position.set(0, 0, -.9); tail.add(t2);
      break;
    }
    case 'star': {
      sprout = new THREE.Group(); sprout.position.y = 1.62; head.add(sprout);
      const y = colorM('#ffd23f', 41);
      sprout.add(part(.56, .18, .16, y, .25), part(.18, .56, .16, y, .25), part(.26, .26, .2, colorM('#ffe680', 42), .25));
      break;
    }
  }

  const arm = s => { const g = new THREE.Group(); g.position.set(s * .64, .9, 0); g.add(part(.26, .72, .26, armM, -.3)); torso.add(g); return g; };
  const armL = arm(-1), armR = arm(1);
  const leg = (x, z) => { const g = new THREE.Group(); g.position.set(x, .7, z); g.add(part(.5, .7, .5, legM, -.35)); root.add(g); return g; };
  const legFL = leg(-.27, .26), legFR = leg(.27, .26), legBL = leg(-.27, -.26), legBR = leg(.27, -.26);

  // ---------------- pose engine ----------------
  const P = () => ({ legA: 0, bob: 0, hop: 0, sq: 1, pitch: 0, tilt: 0, aL: 0, aR: 0, swing: 0, lean: 0, spinRate: 0, wig: 0, tail: 0 });
  const cur = P();
  const st = { name: 'idle', oneshot: false };
  let t = 0, clock = 0, dur = 0, then = 'idle', speed = 1, spin = 0, blinkT = 3;

  function target(name, tt, k) {
    const p = P();
    const f = speed;
    switch (name) {
      case 'walk': { const w = 9 * f; p.legA = Math.sin(tt * w) * .7; p.bob = Math.abs(Math.sin(tt * w)) * .1; p.swing = Math.sin(tt * w) * .5; p.aL = -.15; p.aR = .15; p.tilt = Math.sin(tt * w) * .05; p.tail = Math.sin(tt * w) * .35; break; }
      case 'run': { const w = 14 * f; p.legA = Math.sin(tt * w) * .95; p.bob = Math.abs(Math.sin(tt * w)) * .16; p.swing = Math.sin(tt * w) * .9; p.lean = .22; p.aL = -.25; p.aR = .25; p.tail = Math.sin(tt * w) * .5; break; }
      case 'greet': { p.aR = 2.5 + Math.sin(tt * 13) * .35; p.aL = -.15; p.tilt = .12; p.hop = Math.max(0, Math.sin(Math.min(1, tt * 2.5) * Math.PI)) * .35; p.tail = Math.sin(tt * 14) * .5; break; }
      case 'nod': { p.pitch = Math.sin(tt * 11) * .32 * (1 - k); p.hop = Math.max(0, Math.sin(k * Math.PI)) * .08; break; }
      case 'clap': { const c = Math.sin(tt * 15); p.aL = -1.35 + c * .22; p.aR = 1.35 - c * .22; p.swing = -1.0; p.hop = Math.abs(Math.sin(tt * 7.5)) * .14; p.tilt = Math.sin(tt * 7.5) * .1; p.tail = Math.sin(tt * 12) * .5; break; }
      case 'dance': { const w = 6.5; p.hop = Math.abs(Math.sin(tt * w)) * .5; p.aL = -(2 + Math.sin(tt * w) * .6); p.aR = 2 + Math.sin(tt * w + Math.PI) * .6; p.tilt = Math.sin(tt * w) * .2; p.wig = Math.sin(tt * w / 2) * .6; p.legA = Math.sin(tt * w) * .35; p.sq = 1 + Math.cos(tt * w * 2) * .05; p.tail = Math.sin(tt * w * 2) * .6; break; }
      case 'dance2': { p.spinRate = 5.5; p.hop = Math.abs(Math.sin(tt * 7)) * .6; p.aL = -2.4; p.aR = 2.4; p.sq = 1 + Math.cos(tt * 14) * .06; break; }
      case 'jump': {
        const air = Math.sin(Math.min(1, Math.max(0, (k - .18) / .72)) * Math.PI);
        p.hop = air * 1.5; p.sq = k < .18 ? 1 - k / .18 * .22 : 1 + air * .14; p.aL = -2.5 * air; p.aR = 2.5 * air; p.legA = air * .4; break;
      }
      case 'power': { p.aL = -2.6; p.aR = 2.6; p.pitch = -.18; p.sq = 1 + Math.sin(tt * 18) * .05; p.hop = Math.max(0, Math.sin(k * Math.PI)) * .25; p.wig = Math.sin(tt * 25) * .08; break; }
      default: {
        p.bob = Math.sin(tt * 2) * .025; p.sq = 1 + Math.sin(tt * 2) * .014;
        p.tilt = Math.sin(tt * 1.3) * .05; p.wig = Math.sin(tt * .9) * .22; p.aL = -.12 - Math.sin(tt * 2) * .03; p.aR = .12 + Math.sin(tt * 2) * .03;
        p.tail = Math.sin(tt * 2.2) * .12;
      }
    }
    return p;
  }

  function play(name, o = {}) {
    const { loop = true, then: th = 'idle', speed: sp = 1 } = o;
    if (!KNOWN.includes(name)) name = 'idle';
    st.name = name; st.oneshot = !loop;
    t = 0; clock = 0; speed = sp; then = th;
    dur = loop ? 0 : (CLIP_LEN[name] || 1.5) / Math.max(.5, sp);
  }
  function locomote(name, sp = 1) {
    if (st.oneshot) return;
    if (st.name !== name) { st.name = name; t = 0; }
    speed = sp;
  }

  function update(dt) {
    t += dt; clock += dt;
    if (st.oneshot && t >= dur) play(then);
    const k = st.oneshot ? Math.min(1, t / dur) : 0;
    const tg = target(st.name, t, k);
    const a = 1 - Math.exp(-(st.oneshot ? 22 : 14) * dt);
    for (const key of Object.keys(cur)) cur[key] += (tg[key] - cur[key]) * a;

    spin += cur.spinRate * dt;
    if (cur.spinRate < .1) spin += (0 - Math.atan2(Math.sin(spin), Math.cos(spin))) * Math.min(1, dt * 8);
    root.rotation.y = spin + cur.wig;
    root.position.y = cur.hop + cur.bob;
    root.scale.set(1 / Math.sqrt(cur.sq), cur.sq, 1 / Math.sqrt(cur.sq));
    root.rotation.x = cur.lean;
    torso.rotation.z = cur.tilt * .5;
    head.rotation.x = cur.pitch;
    head.rotation.z = cur.tilt;
    if (sprout) { sprout.rotation.z = Math.sin(clock * 3) * .12; sprout.rotation.x = Math.sin(clock * 2.3) * .1; }
    if (tail) tail.rotation.y = cur.tail;
    legFL.rotation.x = cur.legA; legBR.rotation.x = cur.legA;
    legFR.rotation.x = -cur.legA; legBL.rotation.x = -cur.legA;
    armL.rotation.z = cur.aL; armR.rotation.z = cur.aR;
    armL.rotation.x = cur.swing; armR.rotation.x = -cur.swing;
    blinkT -= dt;
    if (blinkT < 0) { headMesh.material[4] = faceBlink; if (blinkT < -.12) { headMesh.material[4] = faceOpen; blinkT = 2.5 + Math.random() * 3; } }
  }
  play('idle');

  return { holder, root, mixer: { update }, play, locomote, state: st, has: n => KNOWN.includes(n), variant: v };
}
