// Sound: WebAudio sound effects + voice.
// Voice order: recorded file /voice/<key>.mp3 (if listed in /voice/manifest.json), else device TTS (vi-VN).
let ctx = null;
let manifest = {};
let current = null;

export async function initAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();
  try {
    const r = await fetch('voice/manifest.json');
    if (r.ok) manifest = await r.json();
  } catch { /* no recorded voice yet */ }
}

function tone(freq, t0, dur, { type = 'sine', vol = .25, slide = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + t0 + .015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + t0);
  o.stop(ctx.currentTime + t0 + dur + .05);
}

const SCALE = [0, 523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319]; // do re mi ... rising per count
export const sfx = {
  pop(k = 1) { tone(SCALE[Math.min(k, 10)] || 600, 0, .18, { type: 'triangle', vol: .3, slide: 1.5 }); },
  land() { tone(180, 0, .12, { type: 'square', vol: .1, slide: .5 }); },
  whoosh() { tone(300, 0, .3, { type: 'sine', vol: .12, slide: 3 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .12, .35, { type: 'triangle', vol: .28 })); },
  star() { [880, 1175, 1568].forEach((f, i) => tone(f, i * .08, .3, { type: 'sine', vol: .2 })); },
  firework() { tone(900, 0, .35, { type: 'sawtooth', vol: .06, slide: .3 }); },
};

export function stopVoice() {
  if (current) { current.pause(); current = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// returns a promise that resolves when speech ends (or after a safe timeout)
export function speak(key, text) {
  stopVoice();
  return new Promise(res => {
    if (manifest[key]) {
      const a = new Audio(manifest[key]);
      current = a;
      a.onended = () => res();
      a.onerror = () => res();
      a.play().catch(() => res());
      return;
    }
    if (!('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN'; u.rate = .85; u.pitch = 1.25;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('vi'));
    if (v) u.voice = v;
    u.onend = () => res();
    u.onerror = () => res();
    speechSynthesis.speak(u);
    setTimeout(res, 5000);
  });
}
