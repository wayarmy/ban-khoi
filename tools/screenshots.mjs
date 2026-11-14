// Takes the App Store screenshots: iPhone 6.9" = 1320 x 2868 px (440 x 956 css px at 3x).
// Usage (CI): node tools/screenshots.mjs <outDir>   -- needs `npx vite build` first and playwright installed.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'store/screenshots/iphone-6.9';
fs.mkdirSync(out, { recursive: true });
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await page.evaluate(() => localStorage.clear());
const ev = f => page.evaluate(f);
const wait = ms => page.waitForTimeout(ms);
const until = async (f, ms = 180000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(f)) return true; await wait(500); } console.log('TIMEOUT', f.toString()); return false; };
let n = 0;
const shot = async name => { const f = path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };

// 1. choose your friend
await ev(() => __dbg.chooseHero('orange')); await wait(1500);
await shot('chon-ban');
// 2. explore
await ev(() => document.getElementById('play').click()); await wait(2500);
await ev(() => __dbg.teleport(60, 80)); await wait(4000);
await shot('kham-pha');
// 3. building a number: the hero carries each block
await ev(() => { const q = __dbg.quests.find(q => q.id === '1'); __dbg.teleport(q.centre.x, q.centre.z + 9); });
await wait(5000); await ev(() => __dbg.act());
await until(() => __dbg.quests.find(q => q.id === '1').landed >= 5);
await shot('xep-so');
// 4. finished number
await until(() => __dbg.S.done.includes('1')); await wait(1800);
await shot('xong-so');
// 5. a word from letter cards
await ev(() => { __dbg.S.cards.push('B', 'Ô'); const q = __dbg.quests.find(q => q.id === 'w_bo'); __dbg.teleport(q.centre.x, q.centre.z + 9); });
await wait(5000); await ev(() => __dbg.act());
await until(() => __dbg.S.done.includes('w_bo')); await wait(2500);
await shot('ghep-tu');
// 6. race
await ev(() => __dbg.teleport(-800, -338)); await wait(3500); await ev(() => __dbg.act());
await until(() => __dbg.race && __dbg.race.phase === 'go', 60000);
for (let i = 0; i < 12; i++) { await ev(() => __dbg.race && __dbg.race.tap()); await wait(150); }
await shot('dua-xe');
await until(() => !__dbg.race, 120000); await wait(1000);
// 7. farm: six plots, all ripe
await ev(() => { const k = ['carrot', 'tomato', 'cabbage']; __dbg.S.plots.forEach((p, i) => { p.kind = k[i % 3]; p.t = Date.now() - 90000; }); __dbg.teleport(-620, 682); });
await wait(5000);
await shot('nong-trai');
// 8. the city: fountain plaza and tall buildings
await ev(() => { __dbg.teleport(760, -10); __dbg.view.pitch = .55; __dbg.view.yaw = 0; __dbg.view.zoom = 1.6; }); await wait(5500);
await shot('thanh-pho');
// 9. (temporary) full map check
await ev(() => document.getElementById('mapwrap').click()); await wait(800);
await shot('TEMP-fullmap');

await browser.close(); server.close();
