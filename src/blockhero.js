import * as THREE from 'three';

// "Bạn Khối": a little critter built from blocks (our own design, not a Minecraft mob).
// Big square head with a smiling pixel face, short body, four stubby legs, tiny arms, a leaf sprout on top.
// Moves are drawn in code (no animation files), so every move is smooth and easy to change.

const MINT = '#7fe3b4', MINT_D = '#5cc896', BELLY = '#c9f7df', LEG = '#4fb98c', LEAF = '#38b34a';

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
const dot = (x, c, px_, py, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(px_, py, w, h); };

function faceMat(blink = false) {
  return px(x => {
    // big eyes (3 x 4 pixels) with a shine, rosy cheeks, small smile
    for (const ex of [2, 11]) {
      if (blink) { dot(x, '#1c2330', ex, 6, 3, 1); continue; }
      dot(x, '#1c2330', ex, 4, 3, 4);
      dot(x, '#ffffff', ex, 4, 1, 1);
      dot(x, '#4a5a78', ex + 2, 7, 1, 1);
    }
    dot(x, '#ff9db8', 0, 9, 2, 2); dot(x, '#ff9db8', 14, 9, 2, 2);          // cheeks
    dot(x, '#7a2d3d', 5, 10, 1, 1); dot(x, '#7a2d3d', 10, 10, 1, 1);          // smile
    dot(x, '#7a2d3d', 6, 11, 4, 1);
    dot(x, '#ff7a93', 7, 12, 2, 1);                                           // tongue
  }, MINT, .1, 21);
}
const plain = (c, seed) => px(null, c, .16, seed);

const CLIP_LEN = { greet: 2, nod: 1.1, clap: 2.2, jump: 1.1, power: 1.7 };
const KNOWN = ['idle', 'walk', 'run', 'greet', 'nod', 'clap', 'dance', 'dance2', 'jump', 'power'];

export async function loadCharacter(scene) {
  const side = plain(MINT, 3), top = plain(MINT_D, 5), belly = px(x => { dot(x, BELLY, 3, 4, 10, 9); }, MINT, .12, 9);
  const faceOpen = faceMat(false), faceBlink = faceMat(true);
  const legM = plain(LEG, 7), armM = plain(MINT_D, 11), leafM = plain(LEAF, 13);

  const holder = new THREE.Group();
  const root = new THREE.Group();
  holder.add(root);
  holder.scale.setScalar(1.4);               // a bit bigger so a small child sees it well from the game camera
  scene.add(holder);

  const part = (w, h, d, mats, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.y = y; m.castShadow = true; return m;
  };

  // torso: front (+z) shows a lighter belly patch
  const torso = new THREE.Group(); torso.position.y = .7; root.add(torso);
  torso.add(part(1, 1.1, .8, [side, side, top, top, belly, side], .55));

  // head (face on +z)
  const head = new THREE.Group(); head.position.y = 1.1; torso.add(head);
  const headMesh = part(1.5, 1.5, 1.5, [side, side, top, side, faceOpen, side], .75);
  head.add(headMesh);
  // leaf sprout
  const sprout = new THREE.Group(); sprout.position.y = 1.5; head.add(sprout);
  sprout.add(part(.12, .34, .12, leafM, .17));
  for (const s of [-1, 1]) {
    const leaf = part(.4, .1, .22, leafM, .36); leaf.position.x = s * .22; leaf.rotation.z = -s * .45; sprout.add(leaf);
  }

  // arms (tiny) and four legs
  const arm = s => {
    const g = new THREE.Group(); g.position.set(s * .64, .9, 0);
    g.add(part(.26, .72, .26, armM, -.3)); torso.add(g); return g;
  };
  const armL = arm(-1), armR = arm(1);
  const leg = (x, z) => { const g = new THREE.Group(); g.position.set(x, .7, z); g.add(part(.5, .7, .5, legM, -.35)); root.add(g); return g; };
  const legFL = leg(-.27, .26), legFR = leg(.27, .26), legBL = leg(-.27, -.26), legBR = leg(.27, -.26);

  // ---------------- pose engine ----------------
  const P = () => ({ legA: 0, bob: 0, hop: 0, sq: 1, pitch: 0, tilt: 0, aL: 0, aR: 0, swing: 0, lean: 0, spinRate: 0, wig: 0, sway: 0 });
  const cur = P();
  const st = { name: 'idle', oneshot: false };
  let t = 0, clock = 0, dur = 0, then = 'idle', speed = 1, spin = 0, blinkT = 3;

  function target(name, tt, k) {
    const p = P();
    const f = speed;
    switch (name) {
      case 'walk': { const w = 9 * f; p.legA = Math.sin(tt * w) * .7; p.bob = Math.abs(Math.sin(tt * w)) * .1; p.swing = Math.sin(tt * w) * .5; p.aL = -.15; p.aR = .15; p.tilt = Math.sin(tt * w) * .05; break; }
      case 'run': { const w = 14 * f; p.legA = Math.sin(tt * w) * .95; p.bob = Math.abs(Math.sin(tt * w)) * .16; p.swing = Math.sin(tt * w) * .9; p.lean = .22; p.aL = -.25; p.aR = .25; break; }
      case 'greet': { p.aR = 2.5 + Math.sin(tt * 13) * .35; p.aL = -.15; p.tilt = .12; p.hop = Math.max(0, Math.sin(Math.min(1, tt * 2.5) * Math.PI)) * .35; break; }
      case 'nod': { p.pitch = Math.sin(tt * 11) * .32 * (1 - k); p.hop = Math.max(0, Math.sin(k * Math.PI)) * .08; break; }
      case 'clap': { const c = Math.sin(tt * 15); p.aL = -1.35 + c * .22; p.aR = 1.35 - c * .22; p.swing = -1.0; p.hop = Math.abs(Math.sin(tt * 7.5)) * .14; p.tilt = Math.sin(tt * 7.5) * .1; break; }
      case 'dance': { const w = 6.5; p.hop = Math.abs(Math.sin(tt * w)) * .5; p.aL = -(2 + Math.sin(tt * w) * .6); p.aR = 2 + Math.sin(tt * w + Math.PI) * .6; p.tilt = Math.sin(tt * w) * .2; p.wig = Math.sin(tt * w / 2) * .6; p.legA = Math.sin(tt * w) * .35; p.sq = 1 + Math.cos(tt * w * 2) * .05; break; }
      case 'dance2': { p.spinRate = 5.5; p.hop = Math.abs(Math.sin(tt * 7)) * .6; p.aL = -2.4; p.aR = 2.4; p.sq = 1 + Math.cos(tt * 14) * .06; break; }
      case 'jump': {
        const kk = k, air = Math.sin(Math.min(1, Math.max(0, (kk - .18) / .72)) * Math.PI);
        p.hop = air * 1.5; p.sq = kk < .18 ? 1 - kk / .18 * .22 : 1 + air * .14; p.aL = -2.5 * air; p.aR = 2.5 * air; p.legA = air * .4; break;
      }
      case 'power': { p.aL = -2.6; p.aR = 2.6; p.pitch = -.18; p.sq = 1 + Math.sin(tt * 18) * .05; p.hop = Math.max(0, Math.sin(k * Math.PI)) * .25; p.wig = Math.sin(tt * 25) * .08; break; }
      default: { // idle: gentle breathing, look around
        p.bob = Math.sin(tt * 2) * .025; p.sq = 1 + Math.sin(tt * 2) * .014;
        p.tilt = Math.sin(tt * 1.3) * .05; p.wig = Math.sin(tt * .9) * .22; p.aL = -.12 - Math.sin(tt * 2) * .03; p.aR = .12 + Math.sin(tt * 2) * .03;
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
    if (st.oneshot && t >= dur) { play(then); }
    const k = st.oneshot ? Math.min(1, t / dur) : 0;
    const tg = target(st.name, t, k);
    const a = 1 - Math.exp(-(st.oneshot ? 22 : 14) * dt);
    for (const key of Object.keys(cur)) cur[key] += (tg[key] - cur[key]) * a;

    spin += cur.spinRate * dt; if (cur.spinRate < .1) spin += (0 - Math.atan2(Math.sin(spin), Math.cos(spin))) * Math.min(1, dt * 8);
    root.rotation.y = spin + cur.wig;
    root.position.y = cur.hop + cur.bob;
    root.scale.set(1 / Math.sqrt(cur.sq), cur.sq, 1 / Math.sqrt(cur.sq));
    root.rotation.x = cur.lean;
    torso.rotation.z = cur.tilt * .5;
    head.rotation.x = cur.pitch;
    head.rotation.z = cur.tilt;
    sprout.rotation.z = Math.sin(clock * 3) * .12; sprout.rotation.x = Math.sin(clock * 2.3) * .1;
    legFL.rotation.x = cur.legA; legBR.rotation.x = cur.legA;
    legFR.rotation.x = -cur.legA; legBL.rotation.x = -cur.legA;
    armL.rotation.z = cur.aL; armR.rotation.z = cur.aR;
    armL.rotation.x = cur.swing; armR.rotation.x = -cur.swing;
    // blink every few seconds
    blinkT -= dt;
    if (blinkT < 0) { headMesh.material[4] = faceBlink; if (blinkT < -.12) { headMesh.material[4] = faceOpen; blinkT = 2.5 + Math.random() * 3; } }
  }
  play('idle');

  return { holder, root, mixer: { update }, play, locomote, state: st, has: n => KNOWN.includes(n) };
}
