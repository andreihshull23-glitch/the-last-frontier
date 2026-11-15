// Synthesized music: a small step sequencer playing oscillators and noise, so the
// game ships no audio files. Four original pieces:
//   deck    Mercy Deck between runs: slow, warm, a soft arpeggio under the neon.
//   run     districts and the Descent: a dark pulse that grows drums as a fight builds.
//   hollow  the Hollow: a drone, scattered chimes, a heartbeat when things come close.
//   boss    a floor boss or a chapter's target: fast, full drums, a lead line.
// `intensity` (0..1) adds layers; switching pieces waits for the next bar and crossfades.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chords are MIDI notes; the first is the root. Patterns are 16 steps per bar.
const TRACKS = {
  deck: {
    bpm: 86,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]],   // Am7  Fmaj7  Dm7  Em7
    pad: 0.07, padCut: 900,
    bass: { steps: [0, 8], oct: -24, gain: 0.1, len: 1.3 },
    arp: { steps: [0, 3, 6, 8, 10, 13], order: [0, 2, 3, 1, 2, 3], oct: 12, gain: 0.03, type: 'triangle', len: 0.22 },
    hats: { from: 0, steps: [4, 12], gain: 0.012 },
  },
  run: {
    bpm: 108,
    chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],   // Dm  Bb  Gm  A
    pad: 0.045, padCut: 700,
    bass: { steps: [0, 2, 4, 6, 8, 10, 12, 14], octs: [0, 0, 12, 0, 0, 12, 0, 12], oct: -24, gain: 0.11, len: 0.18, cut: [380, 1500] },
    arp: { from: 0.35, steps: [0, 3, 6, 9, 12, 14], order: [0, 1, 2, 1, 2, 0], oct: 12, gain: 0.026, type: 'square', len: 0.09 },
    kick: { from: 0.3, steps: [0, 8], full: [0, 4, 8, 12], fullFrom: 0.6, gain: 0.32 },
    snare: { from: 0.6, steps: [4, 12], gain: 0.11 },
    hats: { from: 0.45, steps: [2, 6, 10, 14], full: [0, 2, 4, 6, 8, 10, 12, 14], fullFrom: 0.75, gain: 0.02 },
  },
  hollow: {
    bpm: 68,
    chords: [[49, 52, 56, 61], [48, 52, 55, 60], [49, 53, 56, 60], [47, 51, 54, 59]],
    pad: 0.06, padCut: 520, padDetune: 22,
    bells: { steps: [0, 7, 11], scale: [61, 64, 66, 68, 71, 73], gain: 0.035 },
    kick: { from: 0.35, steps: [0, 3], gain: 0.22, soft: true },
  },
  boss: {
    bpm: 132,
    chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]],   // Em  C  D  B
    pad: 0.04, padCut: 1200,
    bass: { steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], octs: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12], oct: -24, gain: 0.1, len: 0.1, cut: [600, 2200] },
    lead: { steps: [0, 3, 6, 8, 10, 12, 14], notes: [[0, 7, 12, 10, 7, 5, 3], [0, 4, 7, 12, 11, 7, 4], [2, 5, 9, 7, 5, 2, 0], [3, 6, 10, 15, 13, 10, 6]], oct: 12, gain: 0.045, len: 0.16 },
    kick: { from: 0, steps: [0, 4, 8, 12], gain: 0.36 },
    snare: { from: 0, steps: [4, 12], gain: 0.13 },
    hats: { from: 0, steps: [0, 2, 4, 6, 8, 10, 12, 14], full: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], fullFrom: 0.5, gain: 0.02 },
  },
};

export function createMusic(ctx, out, noise) {
  const bus = ctx.createGain();
  bus.gain.value = 0.8;
  bus.connect(out);
  // a dotted-eighth echo gives the arpeggios their space
  const delay = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain(), dl = ctx.createBiquadFilter();
  dl.type = 'lowpass'; dl.frequency.value = 2400;
  fb.gain.value = 0.38; wet.gain.value = 0.32;
  delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(wet); wet.connect(bus);

  const voices = { current: null };   // { name, gain, bar, step, next }
  let want = null, intensity = 0, timer = null, pick = 1;
  const rand = () => { pick = (pick * 16807) % 2147483647; return pick / 2147483647; };

  function voiceGain() { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); return g; }

  function osc(dest, type, f, t, len, gain, { attack = 0.01, release = 0.12, detune = 0, cut = null, cutEnd = null, send = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, len - release));
    g.gain.linearRampToValueAtTime(0, t + len);
    let node = o;
    if (cut) {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass'; f2.Q.value = 4;
      f2.frequency.setValueAtTime(cut, t);
      if (cutEnd) f2.frequency.exponentialRampToValueAtTime(cutEnd, t + len);
      o.connect(f2); node = f2;
    }
    node.connect(g); g.connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(delay); }
    o.start(t); o.stop(t + len + 0.05);
  }
  function hit(dest, t, kind, gain) {
    if (kind === 'kick' || kind === 'softkick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(kind === 'softkick' ? 90 : 150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'softkick' ? 0.5 : 0.32));
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.55);
      return;
    }
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7500; }
    else { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; }
    const len = kind === 'hat' ? 0.045 : 0.16;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.2, len + 0.02);
    if (kind === 'snare') osc(dest, 'triangle', 190, t, 0.09, gain * 0.6, { attack: 0.002, release: 0.08 });
  }
  const has = (layer, step) => layer && intensity >= (layer.from ?? 0) && (layer.full && intensity >= layer.fullFrom ? layer.full : layer.steps).includes(step);

  /** Play one sixteenth of a piece at time t. */
  function step(v, t) {
    const tr = TRACKS[v.name], sixteenth = 60 / tr.bpm / 4, bar = sixteenth * 16;
    const chord = tr.chords[v.bar % tr.chords.length], root = chord[0];
    const dest = v.gain, s = v.step;
    if (s === 0 && tr.pad) {
      const open = tr.padCut * (1 + intensity * 0.8);
      for (const n of chord) for (const d of [-(tr.padDetune || 9), tr.padDetune || 9]) {
        osc(dest, 'sawtooth', midi(n), t, bar * 1.02, tr.pad / chord.length, { attack: bar * 0.3, release: bar * 0.35, detune: d, cut: open, cutEnd: open * 0.7 });
      }
    }
    if (tr.bass && tr.bass.steps.includes(s)) {
      const i = tr.bass.steps.indexOf(s), up = tr.bass.octs ? tr.bass.octs[i % tr.bass.octs.length] : 0;
      const [c0, c1] = tr.bass.cut || [500, 500];
      const len = tr.bass.len;
      osc(dest, 'sawtooth', midi(root + tr.bass.oct + up), t, len, tr.bass.gain, { attack: 0.005, release: 0.05, cut: c0 + (c1 - c0) * intensity, cutEnd: 160 });
    }
    if (tr.arp && intensity >= (tr.arp.from ?? 0) && tr.arp.steps.includes(s)) {
      const i = tr.arp.steps.indexOf(s), n = chord[tr.arp.order[i % tr.arp.order.length] % chord.length] + tr.arp.oct;
      osc(dest, tr.arp.type, midi(n), t, tr.arp.len, tr.arp.gain * (0.7 + intensity * 0.5), { attack: 0.004, release: 0.06, send: 0.6 });
    }
    if (tr.lead && tr.lead.steps.includes(s)) {
      const i = tr.lead.steps.indexOf(s), line = tr.lead.notes[v.bar % tr.lead.notes.length];
      osc(dest, 'sawtooth', midi(root + tr.lead.oct + line[i % line.length]), t, tr.lead.len, tr.lead.gain, { attack: 0.01, release: 0.05, cut: 2600, cutEnd: 1200, send: 0.35 });
    }
    if (tr.bells && tr.bells.steps.includes(s) && rand() < 0.7) {
      const n = tr.bells.scale[Math.floor(rand() * tr.bells.scale.length)];
      osc(dest, 'sine', midi(n + 12), t, 2.4, tr.bells.gain, { attack: 0.004, release: 2.2, send: 0.9 });
    }
    if (has(tr.kick, s)) hit(dest, t, tr.kick.soft ? 'softkick' : 'kick', tr.kick.gain);
    if (has(tr.snare, s)) hit(dest, t, 'snare', tr.snare.gain);
    if (has(tr.hats, s)) hit(dest, t, 'hat', tr.hats.gain * (0.6 + intensity * 0.6));
  }

  function tick() {
    const ahead = ctx.currentTime + 0.18;
    const v = voices.current;
    if (!v) {
      if (want) { voices.current = { name: want, gain: voiceGain(), bar: 0, step: 0, next: ctx.currentTime + 0.05 }; voices.current.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.6); }
      return;
    }
    while (v.next < ahead) {
      // a change of piece waits for the end of a bar, then crossfades
      if (v.step === 0 && want !== v.name) {
        const old = v.gain;
        old.gain.setTargetAtTime(0, v.next, 0.5);
        setTimeout(() => old.disconnect(), 4000);
        if (!want) { voices.current = null; return; }
        v.name = want; v.gain = voiceGain(); v.bar = 0;
        v.gain.gain.setTargetAtTime(1, v.next, 0.5);
      }
      step(v, v.next);
      v.next += 60 / TRACKS[v.name].bpm / 4;
      v.step = (v.step + 1) % 16;
      if (v.step === 0) v.bar++;
    }
  }

  return {
    /** Which piece should play (null for silence), and how hard. */
    set(name, level = 0) {
      want = name && TRACKS[name] ? name : null;
      intensity += (Math.max(0, Math.min(1, level)) - intensity) * 0.35;
      if (!timer && want) timer = setInterval(tick, 50);
    },
    setVolume(v) { bus.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.8, ctx.currentTime, 0.1); },
    stop() { want = null; },
    /** Schedule `seconds` of a piece from now, all at once (for tests with an OfflineAudioContext). */
    prerender(name, level, seconds) {
      intensity = level;
      const v = { name, gain: voiceGain(), bar: 0, step: 0, next: ctx.currentTime };
      v.gain.gain.value = 1;
      while (v.next < ctx.currentTime + seconds) {
        step(v, v.next);
        v.next += 60 / TRACKS[name].bpm / 4;
        v.step = (v.step + 1) % 16;
        if (v.step === 0) v.bar++;
      }
    },
  };
}
