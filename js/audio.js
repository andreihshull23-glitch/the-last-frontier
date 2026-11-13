// Synthesized sound: every effect is built from noise and oscillators, so the
// game ships no audio files. Gunshots feed a short feedback delay for a canyon echo.

const MUTE_KEY = 'lf.muted';

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let echoSend = null;
  let noise = null;
  let muted = readMuted();
  const amb = { wind: null, windGain: null, drone: null, droneGain: null, filter: null };

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.75;
    master.connect(ctx.destination);

    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1500;
    echoSend = ctx.createGain();
    echoSend.gain.value = 0.4;
    echoSend.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(master);

    noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Ambience: wind through a slowly wandering low-pass, plus a drone that rises at night.
    amb.wind = ctx.createBufferSource();
    amb.wind.buffer = noise;
    amb.wind.loop = true;
    amb.filter = ctx.createBiquadFilter();
    amb.filter.type = 'lowpass';
    amb.filter.frequency.value = 420;
    amb.windGain = ctx.createGain();
    amb.windGain.gain.value = 0;
    amb.wind.connect(amb.filter);
    amb.filter.connect(amb.windGain);
    amb.windGain.connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(amb.filter.frequency);
    lfo.start();
    amb.wind.start();
    amb.droneGain = ctx.createGain();
    amb.droneGain.gain.value = 0;
    amb.droneGain.connect(master);
    for (const f of [55, 82.4, 110.6]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(amb.droneGain);
      o.start();
    }
  }

  function burst({ freq = 1000, q = 1, type = 'bandpass', dur = 0.2, gain = 0.5, attack = 0.002, echo = 0, when = 0, sweepTo }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send);
      send.connect(echoSend);
    }
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  function tone({ type = 'sine', freq = 440, to, dur = 0.2, gain = 0.2, attack = 0.005, when = 0, echo = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send);
      send.connect(echoSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    precise: (v) => {
      burst({ freq: 1500, q: 0.7, dur: 0.24, gain: 0.85 * v, echo: 0.7 });
      tone({ freq: 150, to: 42, dur: 0.17, gain: 0.75 * v });
    },
    fan: (v) => {
      burst({ freq: 1800, q: 0.8, dur: 0.12, gain: 0.55 * v, echo: 0.45 });
      tone({ freq: 130, to: 48, dur: 0.1, gain: 0.45 * v });
    },
    shotgun: (v) => {
      burst({ freq: 850, q: 0.5, dur: 0.32, gain: 0.8 * v, echo: 0.55 * v });
      tone({ freq: 105, to: 38, dur: 0.22, gain: 0.55 * v });
    },
    rifle: (v) => {
      burst({ freq: 2700, q: 1.2, dur: 0.18, gain: 0.7 * v, echo: 0.9 * v });
      tone({ freq: 180, to: 60, dur: 0.1, gain: 0.3 * v });
    },
    pistol: (v) => burst({ freq: 2000, q: 1, dur: 0.12, gain: 0.45 * v, echo: 0.4 * v }),
    revolver: (v) => {
      burst({ freq: 1300, q: 0.8, dur: 0.18, gain: 0.6 * v, echo: 0.6 * v });
      tone({ freq: 140, to: 50, dur: 0.12, gain: 0.4 * v });
    },
    echoShot: (v) => burst({ freq: 2400, q: 3, dur: 0.22, gain: 0.3 * v, echo: 1.2 }),
    hit: (v) => burst({ freq: 380, q: 1.5, dur: 0.07, gain: 0.5 * v }),
    kill: (v) => {
      burst({ freq: 260, q: 1, dur: 0.16, gain: 0.5 * v });
      tone({ type: 'triangle', freq: 220, to: 110, dur: 0.18, gain: 0.12 * v });
    },
    hurt: () => {
      tone({ type: 'sawtooth', freq: 120, to: 60, dur: 0.2, gain: 0.22 });
      burst({ freq: 600, q: 0.8, dur: 0.12, gain: 0.4 });
    },
    dodge: () => burst({ freq: 700, sweepTo: 2200, q: 1.2, dur: 0.2, gain: 0.22 }),
    graze: () => burst({ freq: 3000, sweepTo: 1200, q: 4, dur: 0.12, gain: 0.15 }),
    reload: () => {
      tone({ type: 'square', freq: 2400, dur: 0.012, gain: 0.06 });
      tone({ type: 'square', freq: 1300, dur: 0.02, gain: 0.05, when: 0.03 });
    },
    dry: () => tone({ type: 'square', freq: 1800, dur: 0.012, gain: 0.07 }),
    loot: () => {
      tone({ freq: 660, dur: 0.1, gain: 0.13 });
      tone({ freq: 990, dur: 0.14, gain: 0.13, when: 0.08 });
    },
    alert: (v) => tone({ type: 'triangle', freq: 520, to: 790, dur: 0.12, gain: 0.12 * v }),
    flare: () => {
      burst({ freq: 900, sweepTo: 3200, q: 0.8, dur: 0.7, gain: 0.3 });
      burst({ freq: 400, q: 0.6, dur: 0.3, gain: 0.35, when: 0.7, echo: 0.8 });
    },
    bell: () => {
      tone({ freq: 880, dur: 1.5, gain: 0.16, attack: 0.002, echo: 0.3 });
      tone({ freq: 1318, dur: 1.1, gain: 0.07, attack: 0.002 });
    },
    extracted: () => [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.6, gain: 0.13, when: i * 0.12, echo: 0.3 })),
    death: () => {
      tone({ type: 'sawtooth', freq: 220, to: 50, dur: 1.8, gain: 0.16 });
      burst({ freq: 300, q: 0.5, dur: 0.9, gain: 0.3, echo: 0.6 });
    },
    clang: () => {
      tone({ type: 'square', freq: 190, to: 165, dur: 0.28, gain: 0.1 });
      burst({ freq: 3300, q: 3, dur: 0.2, gain: 0.32, echo: 0.6 });
    },
    echo: () => {
      tone({ freq: 220, dur: 2.4, gain: 0.07, attack: 0.9 });
      tone({ freq: 223.6, dur: 2.4, gain: 0.07, attack: 0.9 });
    },
    heal: () => tone({ freq: 440, to: 660, dur: 0.3, gain: 0.07 }),
    night: () => tone({ freq: 73.4, dur: 3.5, gain: 0.12, attack: 1.2 }),
    howl: () => tone({ type: 'triangle', freq: 330, to: 520, dur: 1.2, gain: 0.05, attack: 0.4, echo: 1 }),
    rifleShot: (v) => {
      burst({ freq: 2300, q: 0.9, dur: 0.3, gain: 0.9 * v, echo: 1.0 });
      tone({ freq: 190, to: 46, dur: 0.2, gain: 0.7 * v });
    },
    shotgunShot: (v) => {
      burst({ freq: 700, q: 0.4, dur: 0.42, gain: 1.0 * v, echo: 0.7 });
      tone({ freq: 95, to: 32, dur: 0.3, gain: 0.85 * v });
    },
    explosion: (v) => {
      burst({ freq: 240, q: 0.3, type: 'lowpass', dur: 0.9, gain: 1.0 * v, echo: 0.9 * v });
      tone({ freq: 70, to: 24, dur: 0.7, gain: 0.9 * v });
      burst({ freq: 2200, q: 0.6, dur: 0.14, gain: 0.5 * v });
    },
    fuse: (v) => burst({ freq: 5200, q: 2, dur: 0.35, gain: 0.12 * v }),
    throw: () => burst({ freq: 500, sweepTo: 1500, q: 1.4, dur: 0.16, gain: 0.16 }),
    swap: () => {
      tone({ type: 'square', freq: 900, dur: 0.02, gain: 0.05 });
      tone({ type: 'square', freq: 1500, dur: 0.02, gain: 0.05, when: 0.05 });
    },
    charge: (v) => tone({ type: 'sawtooth', freq: 90, to: 160, dur: 0.5, gain: 0.16 * v }),
    wake: (v) => tone({ type: 'triangle', freq: 700, to: 300, dur: 0.5, gain: 0.07 * v, echo: 1 }),
    boss: () => { tone({ type: 'sawtooth', freq: 70, to: 55, dur: 1.2, gain: 0.2, attack: 0.1 }); tone({ type: 'sawtooth', freq: 105, to: 82, dur: 1.2, gain: 0.12, attack: 0.1 }); },
    target: () => { tone({ type: 'triangle', freq: 1320, dur: 0.12, gain: 0.12 }); burst({ freq: 3000, q: 3, dur: 0.08, gain: 0.2 }); },
    step: (v) => burst({ freq: 260, q: 0.9, type: 'lowpass', dur: 0.07, gain: 0.1 * v }),
    door: () => burst({ freq: 300, q: 2, dur: 0.14, gain: 0.12 }),
    chapter: () => [392, 523.3, 659.3].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.9, gain: 0.1, when: i * 0.16, echo: 0.4 })),
    ui: () => tone({ type: 'triangle', freq: 620, dur: 0.05, gain: 0.05 }),
    cash: () => {
      tone({ type: 'triangle', freq: 1046, dur: 0.08, gain: 0.08 });
      tone({ type: 'triangle', freq: 1568, dur: 0.16, gain: 0.08, when: 0.06 });
    },
  };

  return {
    unlock,
    play(name, volume = 1) {
      if (!ctx || muted || volume <= 0.01) return;
      SOUNDS[name]?.(Math.min(1, volume));
    },
    setAmbience({ on = false, night = 0, hollow = false } = {}) {
      if (!ctx) return;
      const t = ctx.currentTime;
      amb.windGain.gain.setTargetAtTime(on ? 0.05 + (hollow ? 0.02 : 0) : 0.015, t, 0.8);
      amb.droneGain.gain.setTargetAtTime(on ? night * 0.035 + (hollow ? 0.03 : 0) : 0, t, 1.2);
    },
    get muted() {
      return muted;
    },
    setMuted(on) {
      if (Boolean(on) !== muted) this.toggleMute();
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // preference only
      }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.75, ctx.currentTime, 0.05);
      return muted;
    },
  };
}
