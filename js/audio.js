// Tiny chiptune SFX synth. No audio files; everything is oscillators.
// Muted by default (browsers block autoplay anyway). The HUD toggle enables it.

let ctx = null;
let master = null;
let enabled = false;

function ensure() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

// One square/triangle blip with a pitch sweep.
function tone({ type = 'square', from = 440, to = from, dur = 0.1, vol = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.15, vol = 0.6) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start();
}

const sounds = {
  hover: () => tone({ from: 880, to: 990, dur: 0.04, vol: 0.25 }),
  select: () => { tone({ from: 660, dur: 0.06 }); tone({ from: 990, dur: 0.08, delay: 0.06 }); },
  back: () => tone({ from: 520, to: 260, dur: 0.12, vol: 0.6 }),
  coin: () => { tone({ from: 988, dur: 0.07 }); tone({ from: 1319, dur: 0.25, delay: 0.07 }); },
  start: () => [523, 659, 784, 1047].forEach((f, i) => tone({ from: f, dur: 0.12, delay: i * 0.09 })),
  achievement: () => [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.14, delay: i * 0.07 })),
  power: () => tone({ type: 'triangle', from: 220, to: 1760, dur: 0.35 }),
  shoot: () => tone({ from: 1400, to: 300, dur: 0.07, vol: 0.35 }),
  hit: () => noise(0.08, 0.4),
  die: () => { noise(0.4, 0.7); tone({ from: 300, to: 40, dur: 0.5, vol: 0.6 }); },
  konami: () => [392, 523, 659, 784, 659, 784].forEach((f, i) => tone({ from: f, dur: 0.1, delay: i * 0.08 })),
};

export const sfx = {
  get enabled() { return enabled; },
  setEnabled(on) {
    enabled = Boolean(on);
    if (enabled && !ensure()) enabled = false;
  },
  play(name) {
    if (!enabled || !sounds[name]) return;
    if (!ensure()) return;
    try { sounds[name](); } catch { /* audio is a nicety; never break the page */ }
  },
};
