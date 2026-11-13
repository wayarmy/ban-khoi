// Pure world description: sizes, rivers, lakes, zones, quest sites, collision queries.
// Nothing here touches Three.js, so it is cheap to reason about and test.
import { QUEST_ORDER } from './glyphs.js';
import { WORDS } from './vn.js';

export const HALF = 1500;                 // the island is 3000 x 3000 blocks (9,000,000), 100x the old 300 x 300
export const CH = 80;                     // chunk size for trees, rocks, hills, flowers

export function mulberry(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash2 = (x, z, s = 0) => mulberry((x * 73856093) ^ (z * 19349663) ^ (s * 83492791))();
function smooth(t) { return t * t * (3 - 2 * t); }
export function vnoise(x, z, s = 0) {      // smooth value noise in [0,1)
  const xi = Math.floor(x), zi = Math.floor(z), fx = smooth(x - xi), fz = smooth(z - zi);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// ---------------- places ----------------
export const ZONES = {
  start:  { name: 'Đồng cỏ',        x: 0,    z: 0,    r: 190 },
  city:   { name: 'Thành phố Khối', x: 800,  z: 0,    hw: 240, hd: 240 },
  park:   { name: 'Khu vui chơi', x: -800, z: -250, r: 150 },
  farm:   { name: 'Nông trại',      x: -420, z: 700,  r: 140 },
  meadow: { name: 'Đồng thú',       x: 380,  z: -800, r: 170 },
};
export const TRACKS = {
  car:    { kind: 'car',    name: 'Đua xe',  x: -800, z0: -330, len: 100, lanes: 4, gap: 7 },
  animal: { kind: 'animal', name: 'Đua thú', x: 420,  z0: -880, len: 100, lanes: 4, gap: 7 },
};
export const FARM = {
  plots: [[-440, 672], [-420, 672], [-400, 672], [-440, 692], [-420, 692], [-400, 692]].map(([x, z]) => ({ x, z })),
  kitchen: { x: -470, z: 720 },
  barn: { x: -380, z: 740 },
};

// ---------------- rivers (x as a wavy function of z, or z of x) with bridges ----------------
export const RIVERS = [
  { axis: 'z', c0: -330, amp: 110, wl: 130, ph: 0.0, w: 16, every: 170, off: 20 },
  { axis: 'x', c0: 420,  amp: 90,  wl: 150, ph: 1.3, w: 18, every: 190, off: 60 },
  { axis: 'z', c0: 1220, amp: 90,  wl: 160, ph: 2.1, w: 16, every: 180, off: 0 },
];
export const riverCenter = (r, u) => r.c0 + r.amp * Math.sin(u / r.wl + r.ph);
function riverParts(r, x, z) { const u = r.axis === 'z' ? z : x, v = r.axis === 'z' ? x : z; return [u, v - riverCenter(r, u)]; }
export function bridgeAt(r, u) { return Math.round((u - r.off) / r.every) * r.every + r.off; }
export function onBridge(x, z) {
  for (const r of RIVERS) {
    const [u, d] = riverParts(r, x, z);
    if (Math.abs(d) < r.w / 2 + 3 && Math.abs(u - bridgeAt(r, u)) < 4.5) return true;
  }
  return false;
}
export function inRiver(x, z) {
  for (const r of RIVERS) { const [, d] = riverParts(r, x, z); if (Math.abs(d) < r.w / 2) return true; }
  return false;
}
export const isWater = (x, z) => inRiver(x, z) && !onBridge(x, z);
export const outside = (x, z, m = 0) => Math.abs(x) > HALF - m || Math.abs(z) > HALF - m;

// ---------------- zone helpers ----------------
export function inCity(x, z, m = 0) { const c = ZONES.city; return Math.abs(x - c.x) < c.hw + m && Math.abs(z - c.z) < c.hd + m; }
export function zoneAt(x, z) {
  if (inCity(x, z)) return 'city';
  for (const k of ['park', 'farm', 'meadow', 'start']) { const q = ZONES[k]; if (Math.hypot(x - q.x, z - q.z) < q.r) return k; }
  return 'wild';
}
function inTrack(x, z, m = 0) {
  for (const t of Object.values(TRACKS)) if (Math.abs(x - t.x) < t.lanes * t.gap / 2 + 10 + m && z > t.z0 - 20 - m && z < t.z0 + t.len + 20 + m) return true;
  return false;
}

// ---------------- lakes ----------------
export const LAKES = [];
{
  const rnd = mulberry(99);
  for (let i = -5; i < 5; i++) for (let j = -5; j < 5; j++) {
    if (rnd() > .45) { rnd(); rnd(); rnd(); continue; }
    const x = i * 300 + 150 + (rnd() - .5) * 160, z = j * 300 + 150 + (rnd() - .5) * 160, r = 22 + rnd() * 34;
    if (Math.abs(x) > HALF - 90 || Math.abs(z) > HALF - 90) continue;
    if (Math.hypot(x, z) < 260 || inCity(x, z, 70) || inTrack(x, z, 40)) continue;
    if ([ZONES.park, ZONES.farm, ZONES.meadow].some(q => Math.hypot(x - q.x, z - q.z) < q.r + r + 20)) continue;
    let ok = true;
    for (const rv of RIVERS) { const [, d] = riverParts(rv, x, z); if (Math.abs(d) < rv.w / 2 + r + 12) ok = false; }
    if (ok) LAKES.push({ x, z, r });
  }
}
export const inLake = (x, z, m = 0) => LAKES.some(l => Math.hypot(x - l.x, z - l.z) < l.r + m);

// ---------------- quest sites ----------------
const safe = (x, z, m = 22) => !outside(x, z, 40) && !inCity(x, z, 30) && !inTrack(x, z, 30)
  && !inLake(x, z, m + 10) && !RIVERS.some(r => Math.abs(riverParts(r, x, z)[1]) < r.w / 2 + m + 6)
  && ![ZONES.park, ZONES.farm].some(q => Math.hypot(x - q.x, z - q.z) < q.r + 20)
  && Math.hypot(x - ZONES.meadow.x, z - ZONES.meadow.z) > ZONES.meadow.r + 20;

// digits on a ring around the start, then the 29 letters on a spiral further and further out
export const GLYPH_SITES = [];
{
  const rnd = mulberry(5);
  QUEST_ORDER.forEach((g, i) => {
    const digit = i < 10;
    let ang = digit ? (i / 10) * Math.PI * 2 + .3 : i * 2.399963, rad = digit ? 85 + (i % 2) * 40 : 230 + (i - 10) * 36;
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (safe(x, z) && GLYPH_SITES.every(s => Math.hypot(s.x - x, s.z - z) > 70)) { GLYPH_SITES.push({ id: g, x, z }); return; }
      ang += .21; rad += rnd() * 6;
    }
    GLYPH_SITES.push({ id: g, x: Math.cos(ang) * rad, z: Math.sin(ang) * rad });
  });
}
// which quests need a golden prize block (won in a race) for their last cell
export const PRIZE_GLYPHS = new Set(['5', '0', 'Â', 'E', 'H', 'N', 'Ơ', 'S', 'V', 'Y']);

// word sites: reserved blocks in the city (6 x 6 blocks of 80, roads in between)
export const CITY_BLOCKS = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) CITY_BLOCKS.push({ i, j, x: ZONES.city.x - 200 + i * 80, z: ZONES.city.z - 200 + j * 80 });
export const WORD_BLOCKS = [[1, 1], [3, 1], [4, 1], [1, 3], [4, 3], [1, 4], [3, 4], [4, 4], [0, 2], [5, 2], [2, 0], [2, 5], [5, 5]];
export const WORD_SITES = WORDS.map((w, k) => {
  const [i, j] = WORD_BLOCKS[k], b = CITY_BLOCKS.find(c => c.i === i && c.j === j);
  return { id: w.id, x: b.x, z: b.z - 8 };
});
export const PLAZA_BLOCK = CITY_BLOCKS.find(c => c.i === 2 && c.j === 2);

// everything a tree/rock must keep clear of
export const KEEP_CLEAR = [
  { x: 0, z: 6, r: 24 },
  ...GLYPH_SITES.map(s => ({ x: s.x, z: s.z + 2.5, r: 22 })),
  { x: TRACKS.car.x, z: TRACKS.car.z0 + TRACKS.car.len / 2, r: 80 },
  { x: TRACKS.animal.x, z: TRACKS.animal.z0 + TRACKS.animal.len / 2, r: 80 },
  { x: FARM.kitchen.x + 30, z: FARM.kitchen.z - 20, r: 70 },
  { x: ZONES.park.x, z: ZONES.park.z, r: 110 },
];

// ---------------- collision (static circles + rects, filled by the world builder) ----------------
export const staticCircles = [];           // {x,z,r}
export const staticRects = [];             // {x0,z0,x1,z1}
export function blockedStatic(x, z, pad = 0) {
  if (outside(x, z, 3) || isWater(x, z)) return true;
  for (const l of LAKES) if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return true;
  for (const r of staticRects) if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
  return false;
}
