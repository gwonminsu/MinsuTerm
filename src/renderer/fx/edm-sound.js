/*
 * MinsuTerm · EDM typing sound engine.
 *
 *   window.EDM_SOUND.play(ctx, dest, key, { variant, volume })
 *     ctx      an AudioContext (or OfflineAudioContext)
 *     dest     where the mix goes (usually ctx.destination)
 *     key      'key' (every letter, IME input too) | 'space' | 'back' (Backspace) | 'newline' (Shift+Enter) | 'enter'
 *     variant  'a' | 'b' (default: DEFAULT_VARIANT below)
 *     volume   0..1
 *
 * a  melodic techno / afro house, 124 BPM, A minor: Am9 · Fmaj9 · Cmaj9 · Em7
 *    letters = a glassy FM pluck arp over an E pedal · four-on-the-floor, offbeat hats, shakers, congas, a rolling bass, airy pads
 * b  UK garage 2-step / future-bass sparkle, 132 BPM, C major "royal road": Fmaj7 · G7 · Em7 · Am7
 *    letters = synthesized vocal chops (formant vowels, no words) + an FM sparkle · skippy 2-step kick, shuffled hats, warp bass, chord stabs
 *
 * Every key sounds at once: the key's own sound is never quantised. Underneath, a groove locks in on a fixed tempo grid
 * once the typing keeps up (it starts on the key that sets it off), and fades out through a closing filter when the typing stops.
 * Space = a heavy tuned kick · Backspace = a tape stop (a) / filter-swept stutter (b) · Shift+Enter = a one-bar build
 * (riser, accelerating snare roll, an arp or chop roll whose filter opens) · Enter = the drop: kick, sub boom, clap, chord stab,
 * crash and a down-sweep — and right after a build, two bars of the full groove with its own lead.
 *
 * Sounds are rendered once into buffers (drums and notes here in JS, pads and chord stabs on the audio thread with an
 * OfflineAudioContext), so a key costs a handful of nodes. One mix per context: sidechain pump, ping-pong delay, plate,
 * glue compressor, a soft clipper as the limiter (no clipping at any volume). It is taken apart after 15 s of silence.
 */
(() => {
  'use strict';

  const DEFAULT_VARIANT = 'a'; // the owner's pick: 'a' (melodic techno / afro house) or 'b' (UK garage / future bass)

  const TAU = Math.PI * 2;
  const LAT = 0.004; // scheduling headroom for a key's own sound (the app's other themes use 5 ms)
  const SESSION_GAP = 6; // seconds of silence after which typing starts over on the first chord
  const LEVEL = 0.67; // output trim (calibrated against the other themes at the same volume)
  const HOLD = 0.75; // bars the groove keeps going after the last key …
  const FADE = 0.75; // … and bars it takes to fade out through the closing filter
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const len = (sr, s) => Math.max(1, Math.round(sr * s));

  /* ---------- music ---------- */

  const STYLE = {
    a: {
      bpm: 124, swing: 0.54, duck: 0.6, kickGain: 0.59, bassGain: 0.28, topsGain: 1.2, percGain: 0.85, hitGain: 0.45,
      kick: { f0: 230, f1: 55, pt: 0.026, hold: 0.02, decay: 0.085, len: 0.38, drive: 1.35, click: 0.3 },
      kickBig: { f0: 260, f1: 55, pt: 0.032, hold: 0.04, decay: 0.17, len: 0.7, drive: 1.8, click: 0.4 },
      clap: 1250, room: 0.13, snare: 200,
      roots: [33, 29, 36, 28], // A1 · F1 · C2 · E1
      // the hook, one 16-step cell per chord: a melody on the even steps over an E pedal on the odd ones
      // (E is in every chord: the 5th of Am, the maj7 of F, the 3rd of C, the root of Em)
      hook: [
        [69, 76, 72, 76, 81, 76, 79, 76, 72, 76, 81, 76, 84, 76, 83, 76], // Am9
        [65, 76, 69, 76, 79, 76, 72, 76, 69, 76, 72, 76, 81, 76, 79, 76], // Fmaj9
        [67, 76, 72, 76, 74, 76, 79, 76, 72, 76, 79, 76, 84, 76, 83, 76], // Cmaj9
        [71, 76, 67, 76, 74, 76, 79, 76, 71, 76, 79, 76, 83, 76, 81, 76], // Em7
      ],
      pads: [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [55, 60, 64, 67, 71], [55, 59, 62, 64, 67]],
      stabs: [[45, 57, 60, 64, 67, 71], [41, 53, 57, 60, 64, 67], [48, 55, 60, 64, 67, 71], [40, 55, 59, 62, 64, 67]],
      delay: 0.75, fb: 0.5, ir: [2.6, 2.9], riser: 57,
    },
    b: {
      bpm: 132, swing: 0.6, duck: 0.72, kickGain: 0.76, bassGain: 0.29, topsGain: 1.6, percGain: 1, hitGain: 0.5,
      kick: { f0: 300, f1: 57, pt: 0.02, hold: 0.015, decay: 0.075, len: 0.3, drive: 1.5, click: 0.45 },
      kickBig: { f0: 300, f1: 55, pt: 0.028, hold: 0.04, decay: 0.15, len: 0.65, drive: 1.9, click: 0.5 },
      clap: 1450, room: 0.09, snare: 215,
      roots: [29, 31, 28, 33], // F1 · G1 · E1 · A1
      hook: [
        [76, 79, 81, 84, 81, 79, 76, 79, 72, 76, 77, 81, 84, 81, 77, 76], // Fmaj7
        [74, 79, 83, 86, 83, 81, 79, 77, 71, 74, 79, 83, 81, 79, 74, 71], // G7
        [76, 79, 83, 86, 83, 79, 76, 74, 71, 74, 76, 79, 83, 81, 79, 76], // Em7
        [72, 76, 79, 81, 84, 81, 79, 76, 69, 72, 76, 79, 81, 79, 76, 72], // Am7
      ],
      stabs: [[53, 57, 60, 64, 69, 72], [55, 59, 62, 65, 71, 74], [52, 55, 59, 62, 67, 71], [57, 60, 64, 67, 72, 76]],
      delay: 0.5, fb: 0.42, ir: [1.7, 2.0], riser: 60,
    },
  };
  // a: the rolling bass — the three 16ths after each kick, an octave / fifth on the last beat to move into the next bar
  const BASS_A = { 1: [0, 0.7], 2: [0, 1], 3: [0, 0.8], 5: [0, 0.7], 6: [12, 1], 7: [0, 0.8], 9: [0, 0.7], 10: [0, 1], 11: [0, 0.8], 13: [0, 0.7], 14: [7, 1], 15: [12, 0.8] };
  // a: afro-house hand percussion: [sound, gain, pan]
  const CONGA_A = { 3: ['congaHi', 0.3, 0.35], 6: ['congaLo', 0.32, -0.3], 7: ['congaHi', 0.16, 0.35], 10: ['bongo', 0.22, 0.5], 11: ['congaHi', 0.27, 0.35], 14: ['congaLo', 0.3, -0.3] };
  // b: the 2-step bass: [interval, gain, long]
  const BASS_B = { 0: [0, 1, 1], 6: [12, 0.75, 0], 7: [0, 0.7, 0], 10: [0, 1, 1], 13: [7, 0.8, 0], 15: [12, 0.65, 0] };
  const CHOP_VOWELS = [['a', 'e'], ['o', 'a'], ['e', 'i'], ['a', 'o']];

  /* ---------- DSP for the rendered buffers ---------- */

  class BQ { // RBJ biquad
    constructor(sr) { this.sr = sr; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; }
    set(type, f, q = 0.707, db = 0) {
      const w = TAU * clamp(f, 5, this.sr * 0.45) / this.sr;
      const cs = Math.cos(w); const al = Math.sin(w) / (2 * q);
      let b0; let b1; let b2; let a0; let a2; const a1 = -2 * cs;
      if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a2 = 1 - al; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a2 = 1 - al; } else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a2 = 1 - al; } else { const A = Math.pow(10, db / 40); b0 = 1 + al * A; b1 = a1; b2 = 1 - al * A; a0 = 1 + al / A; a2 = 1 - al / A; }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
      return this;
    }
    p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
  }
  class SVF { // TPT state-variable low-pass: stays stable while its cutoff sweeps
    constructor(sr) { this.sr = sr; this.s1 = 0; this.s2 = 0; this.set(1000, 0.7); }
    set(f, q) { const g = Math.tan(Math.PI * clamp(f, 5, this.sr * 0.45) / this.sr); this.a1 = 1 / (1 + g * (g + 1 / q)); this.a2 = g * this.a1; this.a3 = g * this.a2; return this; }
    lp(x) { const v3 = x - this.s2; const v1 = this.a1 * this.s1 + this.a2 * v3; const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3; this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2; return v2; }
  }
  class Saw { // band-limited (polyBLEP) sawtooth
    constructor(sr, f, ph = 0) { this.sr = sr; this.ph = ph; this.dt = f / sr; }
    f(f) { this.dt = f / this.sr; }
    p() {
      const dt = this.dt; let t = this.ph; let y = 2 * t - 1;
      if (t < dt) { t /= dt; y -= t + t - t * t - 1; } else if (t > 1 - dt) { t = (t - 1) / dt; y -= t * t + t + t + 1; }
      this.ph += dt; if (this.ph >= 1) this.ph -= 1;
      return y;
    }
  }
  function peakNorm(chs, target) {
    let m = 0;
    for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > m) m = a; }
    if (m > 0) { const g = target / m; for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g; }
    return chs;
  }
  function fadeOut(chs, sr, s) {
    for (const c of chs) { const n = Math.min(len(sr, s), c.length); const L = c.length; for (let i = 0; i < n; i++) c[L - 1 - i] *= i / n; }
    return chs;
  }

  function genKick(sr, o, seed) {
    const n = len(sr, o.len); const d = new Float32Array(n); const r = rng(seed);
    const hp = new BQ(sr).set('hp', 4000, 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += TAU * (o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.pt)) / sr; // the pitch drops into the tuned body
      const env = t < 0.0005 ? t / 0.0005 : t < o.hold ? 1 : Math.exp(-(t - o.hold) / o.decay);
      let x = Math.sin(ph) * env;
      if (t < 0.03) x += o.click * (hp.p(r() * 2 - 1) * Math.exp(-t / 0.0013) + 0.6 * Math.sin(TAU * 1700 * t) * Math.exp(-t / 0.0035)) * Math.min(1, t / 0.0003); // the beater
      d[i] = Math.tanh(o.drive * x); // saturation: the harmonics that carry the sub on small speakers
    }
    return fadeOut(peakNorm([d], 0.95), sr, 0.015);
  }
  function genClap(sr, seed, f0, room) { // four hand claps a few ms apart, then a short room
    const n = len(sr, 0.55); const L = new Float32Array(n); const R = new Float32Array(n); const r = rng(seed);
    const bp = new BQ(sr).set('bp', f0, 1.1); const hp = new BQ(sr).set('hp', 650, 0.7); const sn = new BQ(sr).set('bp', 3400, 1.4);
    const tl = new BQ(sr).set('bp', 1500, 0.55); const tr = new BQ(sr).set('bp', 1600, 0.55);
    const B = [[0, 0.6], [0.0095, 0.8], [0.0185, 0.72], [0.027, 1]];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 0;
      for (let k = 0; k < 4; k++) if (t >= B[k][0]) env += B[k][1] * Math.exp(-(t - B[k][0]) / (k === 3 ? 0.05 : 0.0032)) * Math.min(1, (t - B[k][0]) / 0.0004);
      const w = r() * 2 - 1;
      const body = Math.tanh(1.4 * (hp.p(bp.p(w)) + sn.p(w) * 0.35) * env);
      const te = t > 0.027 ? Math.exp(-(t - 0.027) / room) * Math.min(1, (t - 0.027) / 0.01) * 0.3 : 0;
      L[i] = body + tl.p(r() * 2 - 1) * te;
      R[i] = body + tr.p(r() * 2 - 1) * te;
    }
    return fadeOut(peakNorm([L, R], 0.9), sr, 0.04);
  }
  function genSnare(sr, seed, f0) {
    const n = len(sr, 0.3); const d = new Float32Array(n); const r = rng(seed);
    const hp = new BQ(sr).set('hp', 1800, 0.7); const bp = new BQ(sr).set('bp', 5200, 0.6);
    let p1 = 0; let p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * (1 + 0.25 * Math.exp(-t / 0.012));
      p1 += TAU * f / sr; p2 += TAU * f * 1.72 / sr;
      const tone = Math.sin(p1) * Math.exp(-t / 0.055) + 0.35 * Math.sin(p2) * Math.exp(-t / 0.03);
      const w = r() * 2 - 1;
      const wires = (hp.p(w) * 0.7 + bp.p(w) * 0.6) * Math.exp(-t / 0.09);
      d[i] = Math.tanh(1.6 * (tone * 0.75 + wires * 1.1)) * Math.min(1, t / 0.0003);
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.03);
  }
  function genRim(sr, seed) {
    const n = len(sr, 0.09); const d = new Float32Array(n); const r = rng(seed); const hp = new BQ(sr).set('hp', 3000, 0.7);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const x = 0.55 * Math.sin(TAU * 490 * t) * Math.exp(-t / 0.012) + Math.sin(TAU * 1720 * t) * Math.exp(-t / 0.0075) + 0.5 * hp.p(r() * 2 - 1) * Math.exp(-t / 0.0018);
      d[i] = Math.tanh(2 * x) * Math.min(1, t / 0.0002);
    }
    return fadeOut(peakNorm([d], 0.85), sr, 0.01);
  }
  const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]; // the six square waves of an 808 cymbal
  function genHat(sr, seed, decay, secs, mul = 1.9) {
    const n = len(sr, secs); const d = new Float32Array(n); const r = rng(seed);
    const bp = new BQ(sr).set('bp', 10000, 0.8); const hp = new BQ(sr).set('hp', 7200, 0.7); const hp2 = new BQ(sr).set('hp', 8500, 0.7);
    const ph = METAL.map(() => r());
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let m = 0;
      for (let k = 0; k < 6; k++) { ph[k] += METAL[k] * mul / sr; if (ph[k] >= 1) ph[k] -= 1; m += ph[k] < 0.5 ? 1 : -1; }
      d[i] = (hp.p(bp.p(m / 6)) * 0.55 + hp2.p(r() * 2 - 1) * 0.6) * Math.min(1, t / 0.0004) * Math.exp(-t / decay);
    }
    return fadeOut(peakNorm([d], 0.85), sr, Math.min(0.02, secs / 4));
  }
  function genShaker(sr, seed, atk, decay, fc) {
    const n = len(sr, 0.14); const d = new Float32Array(n); const r = rng(seed);
    const bp = new BQ(sr).set('bp', fc, 1.3); const hp = new BQ(sr).set('hp', 3500, 0.7);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = hp.p(bp.p(r() * 2 - 1)) * (t < atk ? (t / atk) * (t / atk) : Math.exp(-(t - atk) / decay));
    }
    return fadeOut(peakNorm([d], 0.8), sr, 0.02);
  }
  function genConga(sr, seed, f0, decay) { // a tuned skin: a quick pitch drop, a second mode, the slap of the hand
    const n = len(sr, decay * 5); const d = new Float32Array(n); const r = rng(seed); const bp = new BQ(sr).set('bp', 2400, 1.2);
    let p1 = 0; let p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * (1 + 0.3 * Math.exp(-t / 0.005));
      p1 += TAU * f / sr; p2 += TAU * f * 1.58 / sr;
      const x = Math.sin(p1) * Math.exp(-t / decay) + 0.18 * Math.sin(p2) * Math.exp(-t / (decay * 0.35)) + 0.5 * bp.p(r() * 2 - 1) * Math.exp(-t / 0.0028);
      d[i] = Math.tanh(1.3 * x) * Math.min(1, t / 0.0003);
    }
    return fadeOut(peakNorm([d], 0.85), sr, 0.02);
  }
  function genCrash(sr, seed, secs = 2.6) {
    const n = len(sr, secs); const out = [];
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n); const r = rng(seed + c * 77);
      const hp = new BQ(sr).set('hp', 3800, 0.7); const bp = new BQ(sr).set('bp', 7500, 0.6);
      const ph = METAL.map(() => r()); const dp = METAL.map((fm) => fm * 3.1 / sr);
      const ka = Math.exp(-1 / (sr * 0.12)); const kb = Math.exp(-1 / (sr * 0.9));
      let lp = 0; let k = 0.5; let ea = 0.55; let eb = 0.45;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if ((i & 63) === 0) k = 1 - Math.exp(-TAU * 16000 * Math.pow(5000 / 16000, t / secs) / sr); // it darkens as it rings
        let m = 0;
        for (let j = 0; j < 6; j++) { ph[j] += dp[j]; if (ph[j] >= 1) ph[j] -= 1; m += ph[j] < 0.5 ? 1 : -1; }
        const x = (hp.p(r() * 2 - 1) * 0.7 + bp.p(m / 6) * 0.45) * (t < 0.0015 ? t / 0.0015 : 1) * (ea + eb);
        lp += (x - lp) * k;
        d[i] = lp;
        ea *= ka; eb *= kb;
      }
      out.push(d);
    }
    return fadeOut(peakNorm(out, 0.9), sr, 0.2);
  }
  function genImpact(sr, seed) { // the sub boom under a drop: a falling sine, a thud, a rumble
    const n = len(sr, 2.2); const d = new Float32Array(n); const r = rng(seed);
    const l1 = new BQ(sr).set('lp', 700, 0.7); const l2 = new BQ(sr).set('lp', 150, 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += TAU * (36 + 39 * Math.exp(-t / 0.3)) / sr;
      const w = r() * 2 - 1;
      const x = Math.sin(ph) * Math.min(1, t / 0.003) * Math.exp(-t / 0.65) + l1.p(w) * Math.exp(-t / 0.035) * 0.8 + l2.p(w) * Math.exp(-t / 0.35) * 0.9;
      d[i] = Math.tanh(2 * x);
    }
    return fadeOut(peakNorm([d], 0.95), sr, 0.3);
  }
  function genDown(sr, seed, secs = 1.6) { // a down-sweep of filtered noise, left and right apart
    const n = len(sr, secs); const out = [];
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n); const r = rng(seed + c * 13); const bp = new BQ(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if ((i & 31) === 0) bp.set('bp', Math.max(140, 9500 * Math.pow(160 / 9500, t / 1.4)), 1.4);
        d[i] = bp.p(r() * 2 - 1) * Math.min(1, t / 0.015) * Math.exp(-t / 0.5);
      }
      out.push(d);
    }
    return fadeOut(peakNorm(out, 0.85), sr, 0.15);
  }
  function genRiser(sr, seed, T, root) { // noise sweeping up + four detuned saws climbing two octaves through an opening filter
    const n = len(sr, T); const out = [new Float32Array(n), new Float32Array(n)]; const r = rng(seed);
    const f0 = mtof(root); const DET = [-17, -6, 6, 17];
    const saws = DET.map((c) => new Saw(sr, f0, r()));
    const nf = [new BQ(sr), new BQ(sr)]; const sf = [new SVF(sr), new SVF(sr)];
    let en = 0; let es = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; const k = t / T;
      if ((i & 31) === 0) {
        en = Math.pow(k, 2.3); es = Math.pow(k, 1.8);
        const fn = 320 * Math.pow(12500 / 320, Math.pow(k, 1.35));
        nf[0].set('bp', fn, 1.0); nf[1].set('bp', fn * 1.06, 1.0);
        const fc = 500 * Math.pow(15000 / 500, k); sf[0].set(fc, 1.4); sf[1].set(fc, 1.4);
        const fr = f0 * Math.pow(2, 2 * Math.pow(k, 1.7));
        saws.forEach((s, j) => s.f(fr * Math.pow(2, DET[j] / 1200)));
      }
      const sL = (saws[0].p() + saws[2].p()) * 0.5; const sR = (saws[1].p() + saws[3].p()) * 0.5;
      out[0][i] = nf[0].p(r() * 2 - 1) * 0.75 * en + sf[0].lp(sL) * 0.4 * es;
      out[1][i] = nf[1].p(r() * 2 - 1) * 0.75 * en + sf[1].lp(sR) * 0.4 * es;
    }
    return fadeOut(peakNorm(out, 0.9), sr, 0.012);
  }
  function genDuck(sr, beat) { // the sidechain shape: down in 2.5 ms, a short hold, a smooth swell back by the offbeat
    const atk = 0.0025; const hold = 0.012; const rel = beat * 0.46;
    const n = len(sr, atk + hold + rel); const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = t < atk ? 0.5 - 0.5 * Math.cos(Math.PI * t / atk) : t < atk + hold ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (t - atk - hold) / rel));
    }
    d[n - 1] = 0;
    return [d];
  }
  function genIR(sr, seed, rt, secs) { // a bright plate that darkens as it decays, a few early reflections
    const n = len(sr, secs); const out = []; const pre = 0.012;
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n); const r = rng(seed + c * 31);
      let lp = 0; let k = 0.5; let e2 = 0; let dec = 1; const kd = Math.exp(-6.9 / (rt * sr));
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if (t < pre) continue;
        const tt = t - pre;
        if ((i & 63) === 0) k = 1 - Math.exp(-TAU * 11000 * Math.pow(1300 / 11000, tt / secs) / sr);
        lp += ((r() * 2 - 1) - lp) * k;
        let x = lp * dec * (tt < 0.004 ? tt / 0.004 : 1);
        dec *= kd;
        if (tt < 0.07 && r() < 0.0015) x += (r() - 0.5) * 1.5 * Math.exp(-tt / 0.03);
        d[i] = x; e2 += x * x;
      }
      const g = 1 / Math.sqrt(e2 || 1);
      for (let i = 0; i < n; i++) d[i] *= g;
      out.push(d);
    }
    return fadeOut(out, sr, 0.2);
  }
  function genPluck(sr, m) { // a: a glassy FM pluck (1:3) + a softer 1:2 pair + a saw through a snapping low-pass
    const f = mtof(m); const n = len(sr, 0.8); const d = new Float32Array(n); const r = rng(seedOf('p' + m));
    const idx = Math.min(1, 900 / f); // high notes get less FM: no aliasing up top
    const saw = new Saw(sr, f * Math.pow(2, -6 / 1200), r()); const svf = new SVF(sr); const hp = new BQ(sr).set('hp', 5000, 0.7);
    const f2 = f * Math.pow(2, 7 / 1200);
    const w1 = TAU * f / sr; const w2 = TAU * f2 / sr;
    const k45 = Math.exp(-1 / (sr * 0.045)); const k30 = Math.exp(-1 / (sr * 0.03)); const k70 = Math.exp(-1 / (sr * 0.07)); const k42 = Math.exp(-1 / (sr * 0.42)); const k1 = Math.exp(-1 / (sr * 0.001));
    let e45 = 1; let e30 = 1; let e70 = 1; let e42 = 1; let e1 = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) svf.set(250 + 6500 * Math.exp(-t / 0.055), 1.1);
      const s1 = Math.sin(w1 * i + (2.0 * e45 + 0.18) * idx * Math.sin(3 * w1 * i));
      const s2 = Math.sin(w2 * i + 0.9 * idx * e30 * Math.sin(2 * w2 * i));
      const s3 = svf.lp(saw.p());
      const env = (i < sr * 0.0012 ? t / 0.0012 : 1) * (0.55 * e70 + 0.45 * e42);
      d[i] = (0.5 * s1 + 0.28 * s2 + 0.38 * s3) * env + (i < sr * 0.01 ? hp.p(r() * 2 - 1) * e1 * 0.1 : 0);
      e45 *= k45; e30 *= k30; e70 *= k70; e42 *= k42; e1 *= k1;
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.08);
  }
  // soprano formants [Hz, level, bandwidth Hz]
  const VOWELS = {
    a: [[800, 1, 80], [1150, 0.5, 90], [2900, 0.025, 120], [3900, 0.1, 130], [4950, 0.003, 140]],
    e: [[350, 1, 60], [2000, 0.1, 100], [2800, 0.18, 120], [3600, 0.01, 150], [4950, 0.0016, 200]],
    i: [[270, 1, 60], [2140, 0.25, 90], [2950, 0.05, 100], [3900, 0.05, 120], [4950, 0.006, 120]],
    o: [[450, 1, 70], [800, 0.28, 80], [2830, 0.08, 100], [3800, 0.08, 130], [4950, 0.003, 135]],
  };
  function genChop(sr, m, vi, secs = 0.24) { // b: a chopped "vocal": a glottal saw through moving formants (two vowels), a breath on top
    const f = mtof(m); const n = len(sr, secs); const d = new Float32Array(n); const r = rng(seedOf(`c${m}:${vi}`));
    const [va, vb] = CHOP_VOWELS[vi].map((k) => VOWELS[k]);
    const saw = new Saw(sr, f, r()); const fl = va.map(() => new BQ(sr)); const amp = [0, 0, 0, 0, 0];
    const hp = new BQ(sr).set('hp', 220, 0.7); const br = new BQ(sr).set('bp', 2600, 1.2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) {
        const k = Math.min(1, t / (secs * 0.7)); const s = k * k * (3 - 2 * k);
        for (let j = 0; j < 5; j++) {
          const F = (va[j][0] + (vb[j][0] - va[j][0]) * s) * 1.2; // formants up a little: a pitched-up chop
          const bw = Math.max((va[j][2] + (vb[j][2] - va[j][2]) * s) * 3, f * 0.6);
          fl[j].set('bp', F, F / bw);
          amp[j] = (va[j][1] + (vb[j][1] - va[j][1]) * s) * (j >= 2 ? 3 : 1);
        }
        saw.f(f * Math.pow(2, (-1.0 * Math.exp(-t / 0.02) + 0.06 * Math.sin(TAU * 5.6 * t) * Math.min(1, t / 0.1)) / 12)); // a scoop into the note, a little vibrato
      }
      const src = saw.p() + 0.05 * (r() * 2 - 1);
      let y = 0;
      for (let j = 0; j < 5; j++) y += fl[j].p(src) * amp[j];
      const env = Math.min(1, t / 0.005) * (t > secs * 0.78 ? Math.max(0, (secs - t) / (secs * 0.22)) : 1) * (1 - 0.25 * t / secs);
      d[i] = hp.p(y * env + br.p(r() * 2 - 1) * 0.25 * Math.exp(-t / 0.012)); // and the "h" of the breath before it
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.006);
  }
  function genBell(sr, m) { // b: an FM sparkle (1:3.5, a bell's inharmonic ring)
    const f = mtof(m); const n = len(sr, 0.8); const d = new Float32Array(n); const idx = Math.min(1, 1300 / f);
    let c = 0; let mo = 0; let c4 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      c += TAU * f / sr; mo += TAU * 3.5 * f / sr; c4 += TAU * 4 * f / sr;
      d[i] = (Math.sin(c + (2.6 * Math.exp(-t / 0.09) + 0.3) * idx * Math.sin(mo)) * Math.exp(-t / 0.32) + 0.25 * Math.sin(c4) * Math.exp(-t / 0.12)) * Math.min(1, t / 0.001);
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.05);
  }
  function genBassA(sr, m) { // a: a short, round, rolling bass note
    const f = mtof(m); const n = len(sr, 0.22); const d = new Float32Array(n); const r = rng(seedOf('ba' + m));
    const saw = new Saw(sr, f, r()); const svf = new SVF(sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) svf.set(160 + 1500 * Math.exp(-t / 0.03), 1.8);
      ph += TAU * f / sr;
      const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.1) * (t > 0.17 ? Math.max(0, (0.22 - t) / 0.05) : 1);
      d[i] = Math.tanh(2 * (svf.lp(saw.p()) * 0.8 + 0.7 * Math.sin(ph)) * env);
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.01);
  }
  function genBassB(sr, m, long) { // b: a UKG "organ / warp" bass: a sine with a squarish edge, a little scoop into every note
    const f = mtof(m); const secs = long ? 0.44 : 0.17; const n = len(sr, secs); const d = new Float32Array(n); const svf = new SVF(sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) svf.set(700 + 900 * Math.exp(-t / 0.05), 0.9);
      ph += TAU * f * Math.pow(2, -2 * Math.exp(-t / 0.018) / 12) / sr;
      const s = Math.sin(ph);
      const env = Math.min(1, t / 0.003) * (1 - 0.25 * t / secs) * (t > secs - 0.03 ? Math.max(0, (secs - t) / 0.03) : 1);
      d[i] = Math.tanh(1.6 * (s + svf.lp(0.3 * Math.tanh(3 * s) + 0.18 * Math.sin(2 * ph))) * env);
    }
    return fadeOut(peakNorm([d], 0.9), sr, 0.008);
  }

  /** Chords on the audio thread: detuned saw unisons through a filter, rendered by an OfflineAudioContext (no main-thread work). */
  function renderChord(sr, notes, P, seed) {
    const secs = P.secs; const oc = new OfflineAudioContext(2, len(sr, secs), sr); const r = rng(seed);
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = P.q;
    lp.frequency.setValueAtTime(P.lp0, 0); if (P.lp1) lp.frequency.exponentialRampToValueAtTime(P.lp1, P.lpT);
    const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = P.hp; // mono-safe low end
    const env = oc.createGain();
    env.gain.setValueAtTime(0, 0); env.gain.linearRampToValueAtTime(1, P.atk);
    if (P.hold) { env.gain.setValueAtTime(1, P.hold); env.gain.setTargetAtTime(0, P.hold, P.rel); } else env.gain.setTargetAtTime(0, P.atk, P.rel);
    lp.connect(hp); hp.connect(env); env.connect(oc.destination);
    if (P.lfo) { const l = oc.createOscillator(); l.frequency.value = P.lfo; const ld = oc.createGain(); ld.gain.value = P.lp0 * 0.25; l.connect(ld); ld.connect(lp.frequency); l.start(0); }
    const V = P.det.length; const g = 1 / Math.sqrt(V * notes.length);
    for (const m of notes) {
      const f = mtof(m);
      for (let v = 0; v < V; v++) {
        const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        if (P.scoop) { o.detune.setValueAtTime(P.det[v] - P.scoop, 0); o.detune.linearRampToValueAtTime(P.det[v], 0.07); } else o.detune.value = P.det[v];
        const pn = oc.createStereoPanner(); pn.pan.value = P.pan[v];
        const og = oc.createGain(); og.gain.value = g * (m < 50 ? 0.7 : 1);
        o.connect(og); og.connect(pn); pn.connect(lp);
        o.start(r() / f); // unison voices start out of step, like free-running oscillators
      }
    }
    if (P.air) { // the breath of an airy pad
      const b = oc.createBuffer(1, len(sr, secs), sr); const d = b.getChannelData(0); const rr = rng(seed + 9);
      for (let i = 0; i < d.length; i++) d[i] = rr() * 2 - 1;
      const s = oc.createBufferSource(); s.buffer = b; const ah = oc.createBiquadFilter(); ah.type = 'highpass'; ah.frequency.value = 6000;
      const ag = oc.createGain(); ag.gain.value = P.air; s.connect(ah); ah.connect(ag); ag.connect(hp); s.start(0);
    }
    return oc.startRendering().then((b) => {
      const chs = [b.getChannelData(0), b.getChannelData(1)];
      const n = Math.min(len(sr, 0.05), b.length);
      for (const c of chs) for (let i = 0; i < n; i++) c[c.length - 1 - i] *= i / n;
      peakNorm(chs, 0.85);
      return b;
    });
  }
  const PAD = { secs: 2.7, q: 0.5, lp0: 2300, hp: 180, atk: 0.42, hold: 1.85, rel: 0.18, det: [-24, -11, 0, 11, 24], pan: [-0.8, -0.4, 0, 0.4, 0.8], air: 0.05, lfo: 0.23 };
  const STAB_A = { secs: 1.9, q: 1, lp0: 9000, lp1: 1400, lpT: 0.5, hp: 140, atk: 0.003, rel: 0.38, det: [-30, -18, -8, 0, 8, 18, 30], pan: [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9] };
  const STAB_B = { secs: 0.85, q: 0.7, lp0: 12000, hp: 150, atk: 0.004, hold: 0.24, rel: 0.11, det: [-28, -16, -7, 0, 7, 16, 28], pan: [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9], scoop: 140 };

  /* ---------- the sound library: one buffer per name, rendered on first need ---------- */

  const CACHE = new Map();
  const PENDING = new Map();
  let cacheSr = 0;
  function makeBuffer(ctx, chs) {
    const b = ctx.createBuffer(chs.length, chs[0].length, ctx.sampleRate);
    chs.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  }
  function syncGen(name, sr) {
    const v = name[0]; const st = STYLE[v]; const [kind, a1, a2] = name.slice(2).split(':'); const sd = seedOf(name);
    const beat = 60 / st.bpm;
    switch (kind) {
      case 'kick': return genKick(sr, st.kick, sd);
      case 'kickBig': return genKick(sr, st.kickBig, sd);
      case 'clap1': case 'clap2': return genClap(sr, sd, st.clap * (kind === 'clap2' ? 1.08 : 1), st.room);
      case 'snare': return genSnare(sr, sd, st.snare);
      case 'rim': return genRim(sr, sd);
      case 'hat': return genHat(sr, sd, 0.016, 0.07);
      case 'hat2': return genHat(sr, sd, 0.011, 0.05, 2.05);
      case 'hatOff': return genHat(sr, sd, 0.045, 0.16);
      case 'ohat': return genHat(sr, sd, 0.13, 0.5);
      case 'shaker1': return genShaker(sr, sd, 0.007, 0.03, 6500);
      case 'shaker2': return genShaker(sr, sd, 0.003, 0.02, 8000);
      case 'congaHi': return genConga(sr, sd, 330, 0.09);
      case 'congaLo': return genConga(sr, sd, 220, 0.13);
      case 'bongo': return genConga(sr, sd, 440, 0.07);
      case 'crash': return genCrash(sr, sd);
      case 'impact': return genImpact(sr, sd);
      case 'down': return genDown(sr, sd);
      case 'riser': return genRiser(sr, sd, beat * 4, st.riser);
      case 'duck': return genDuck(sr, beat);
      case 'ir': return genIR(sr, sd, st.ir[0], st.ir[1]);
      case 'pluck': return genPluck(sr, +a1);
      case 'chop': return genChop(sr, +a1, +a2);
      case 'bell': return genBell(sr, +a1);
      case 'bass': return v === 'a' ? genBassA(sr, +a1) : genBassB(sr, +a1, +a2);
      default: return null;
    }
  }
  const isAsync = (name) => /^[ab]\.(pad|stab):/.test(name);
  function asyncGen(name, sr) {
    const v = name[0]; const st = STYLE[v]; const [kind, a1] = name.slice(2).split(':');
    return kind === 'pad' ? renderChord(sr, st.pads[+a1], PAD, seedOf(name)) : renderChord(sr, st.stabs[+a1], v === 'a' ? STAB_A : STAB_B, seedOf(name));
  }
  function checkRate(ctx) {
    if (cacheSr !== ctx.sampleRate) { CACHE.clear(); PENDING.clear(); cacheSr = ctx.sampleRate; }
  }
  /** A buffer by name: rendered now if it is cheap, or started on the audio thread (null until it is there). */
  function get(ctx, name) {
    checkRate(ctx);
    const b = CACHE.get(name);
    if (b) return b;
    if (isAsync(name)) { startAsync(ctx, name); return null; }
    const g0 = DEBUG.times ? performance.now() : 0;
    const chs = syncGen(name, ctx.sampleRate);
    if (DEBUG.times) DEBUG.times.push([name, performance.now() - g0]);
    if (!chs) return null;
    const nb = makeBuffer(ctx, chs);
    CACHE.set(name, nb);
    return nb;
  }
  function startAsync(ctx, name) {
    if (PENDING.has(name) || CACHE.has(name) || typeof OfflineAudioContext === 'undefined') return PENDING.get(name);
    const sr = ctx.sampleRate;
    const p = asyncGen(name, sr).then((b) => { if (cacheSr === sr) CACHE.set(name, b); }).catch(() => {});
    PENDING.set(name, p);
    return p;
  }
  function namesFor(v) { // in the order they are first needed: the groove's first bar, the notes, then the rest
    const st = STYLE[v]; const L = [];
    const add = (...ks) => ks.forEach((k) => L.push(`${v}.${k}`));
    add('duck', 'kick', 'hatOff', 'hat', 'hat2', 'shaker1', 'shaker2');
    if (v === 'a') st.hook.forEach((h) => h.forEach((m) => L.push(`a.pluck:${m}`)));
    else st.hook.forEach((h) => h.forEach((m, i) => L.push(`b.chop:${m}:${i % 4}`, `b.bell:${m + 12}`)));
    add('kickBig', 'clap1', 'clap2', 'snare', 'ir');
    if (v === 'a') {
      st.roots.forEach((r) => [0, 7, 12].forEach((o) => L.push(`a.bass:${r + o}`)));
      add('congaHi', 'congaLo', 'bongo', 'rim', 'ohat');
      for (let c = 0; c < 4; c++) L.push(`a.pad:${c}`, `a.stab:${c}`);
      st.hook.forEach((h) => h.forEach((m) => L.push(`a.pluck:${m + 12}`)));
    } else {
      st.roots.forEach((r) => [0, 7, 12].forEach((o) => L.push(`b.bass:${r + o}:0`, `b.bass:${r + o}:1`)));
      add('rim', 'ohat');
      for (let c = 0; c < 4; c++) L.push(`b.stab:${c}`);
      st.hook.forEach((h) => [0, 2, 4, 6].forEach((i) => L.push(`b.chop:${h[i]}:0`)));
      L.push(`b.chop:${st.hook[0][3]}:2`);
    }
    add('crash', 'impact', 'down', 'riser');
    return [...new Set(L)];
  }
  /** Render everything a variant needs: the chords on the audio thread, the rest in small slices that leave typing alone. */
  function prewarm(ctx, variant = DEFAULT_VARIANT) {
    const v = STYLE[variant] ? variant : DEFAULT_VARIANT;
    checkRate(ctx);
    const todo = namesFor(v).filter((n) => !CACHE.has(n));
    const waits = [];
    return new Promise((resolve) => {
      const slice = () => { // never inside a key press: a few ms at a time, between them
        const t0 = performance.now();
        while (todo.length && performance.now() - t0 < 4) {
          const n = todo.shift();
          if (isAsync(n)) waits.push(startAsync(ctx, n) || Promise.resolve()); else get(ctx, n);
        }
        if (todo.length) setTimeout(slice, 0); else Promise.all(waits).then(() => resolve());
      };
      setTimeout(slice, 0);
    });
  }

  /* ---------- the mix: one per context ---------- */

  let E = null;
  const DEBUG = { noClip: false, mute: [], log: null }; // for offline measurements only
  function curve(fn, n = 4097) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1); c[(n - 1) / 2] = 0; return c; }
  function build(ctx, v) {
    const st = STYLE[v]; const beat = 60 / st.bpm;
    const e = {
      ctx, v, st, beat, s16: beat / 4, bar: beat * 4, swing: (st.swing - 0.5) * 2 * (beat / 4),
      nodes: [], future: [], keys: [], r: rng(20251124), dest: null, vol: -1,
      lastKey: -1e9, lastBack: -1e9, lastNote: null, pat: 0, chBase: 0, chAnchor: null,
      on: false, anchor: 0, step: 0, layer0: 0, fadeAt: 0, until: 0, dropT0: -1, dropT1: -1, impactT: -1, build: null, timer: 0, lastWall: 0,
    };
    const N = (node) => { e.nodes.push(node); return node; };
    const gain = (g, to) => { const n = N(ctx.createGain()); n.gain.value = g; if (to) n.connect(to); return n; };
    // master: glue compressor → soft clipper (the limiter: nothing passes ±0.94) → volume
    e.out = gain(0);
    const clip = N(ctx.createWaveShaper());
    const H = 1.6; const K = 0.6; const C = 0.94;
    clip.curve = curve((x) => { const u = Math.abs(x) * H; const y = u <= K ? u : K + (C - K) * Math.tanh((u - K) / (C - K)); return Math.sign(x) * y; });
    clip.oversample = '4x';
    clip.connect(e.out);
    const pre = gain(1 / H, DEBUG.noClip ? null : clip);
    if (DEBUG.noClip) pre.connect(gain(H, e.out));
    const glue = N(ctx.createDynamicsCompressor());
    glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 2.5; glue.attack.value = 0.012; glue.release.value = 0.16;
    glue.connect(pre);
    e.mix = gain(1, glue);
    e.drum = gain(1, e.mix); // drums: not ducked
    e.fx = gain(1, e.mix); // risers, crashes, sweeps: not ducked
    e.pump = gain(1, e.mix); // everything musical breathes with the kick
    const sc = gain(1); const scs = N(ctx.createWaveShaper());
    scs.curve = curve((x) => (x > 0 ? -st.duck * Math.min(1, x) : 0), 1025);
    sc.connect(scs); scs.connect(e.pump.gain);
    e.sc = sc;
    // ping-pong delay (dotted 8th in a, 8th in b): left, then right, each echo darker
    const dIn = gain(1); dIn.channelCount = 1; dIn.channelCountMode = 'explicit';
    const dl = N(ctx.createDelay(2)); const dr = N(ctx.createDelay(2)); dl.delayTime.value = st.delay * beat; dr.delayTime.value = st.delay * beat;
    const dhp = N(ctx.createBiquadFilter()); dhp.type = 'highpass'; dhp.frequency.value = 320;
    const dlp = N(ctx.createBiquadFilter()); dlp.type = 'lowpass'; dlp.frequency.value = 4800;
    const mg = N(ctx.createChannelMerger(2));
    const x1 = gain(st.fb); const x2 = gain(st.fb);
    dIn.connect(dl); dl.connect(dhp); dhp.connect(dlp); dlp.connect(mg, 0, 0); dlp.connect(x1); x1.connect(dr); dr.connect(mg, 0, 1); dr.connect(x2); x2.connect(dl);
    mg.connect(gain(0.8, e.pump));
    e.dIn = dIn;
    // plate
    const conv = N(ctx.createConvolver()); conv.normalize = false;
    if (CACHE.has(`${v}.ir`)) conv.buffer = CACHE.get(`${v}.ir`);
    else setTimeout(() => { if (E === e) conv.buffer = get(ctx, `${v}.ir`); }, 0); // not inside the first key press
    const vIn = gain(1, conv); const vhp = N(ctx.createBiquadFilter()); vhp.type = 'highpass'; vhp.frequency.value = 250;
    conv.connect(vhp); vhp.connect(gain(0.9, e.pump));
    e.vIn = vIn;
    const group = (to, dly, verb, g = 1) => { const n = gain(g, to); if (dly) n.connect(gain(dly, dIn)); if (verb) n.connect(gain(verb, vIn)); return n; };
    e.G = {
      drum: group(e.drum, 0, 0),
      perc: group(e.drum, 0, 0.14),
      fx: group(e.fx, 0, 0.18),
      lead: group(e.pump, 0.3, 0.22),
      chop: group(e.pump, 0.26, 0.24),
      bell: group(e.pump, 0.34, 0.3),
      stab: group(e.pump, 0.14, 0.34),
    };
    // the groove runs through gates: they hold it open while the typing goes on, then fade it out through a closing low-pass
    const gate = (to, dly, verb) => {
      const hp = N(ctx.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 20;
      const lp = N(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 20000;
      const g = gain(0.0001); const trim = gain(1, to); hp.connect(lp); lp.connect(g); g.connect(trim);
      if (dly) trim.connect(gain(dly, dIn)); if (verb) trim.connect(gain(verb, vIn));
      return { in: hp, hp, lp, g, trim };
    };
    e.gates = { k: gate(e.drum), d: gate(e.drum), p: gate(e.drum, 0, 0.14), b: gate(e.pump), m: gate(e.pump, 0.2, 0.3) };
    for (const k of DEBUG.mute) { if (e.G[k]) e.G[k].gain.value = 0; if (e.gates[k]) e.gates[k].trim.gain.value = 0; }
    return e;
  }
  function teardown(e) {
    clearTimeout(e.timer);
    for (const f of e.future) { try { f.s.stop(0); } catch { /* done */ } }
    for (const n of e.nodes) { try { n.disconnect(); } catch { /* gone */ } }
    e.nodes = []; e.future = [];
    if (E === e) E = null;
  }
  function arm(e) { // taken apart after 15 s of silence
    if (e.timer || (typeof OfflineAudioContext !== 'undefined' && e.ctx instanceof OfflineAudioContext)) return;
    const chk = () => {
      e.timer = 0;
      if (E !== e) return;
      if (performance.now() - e.lastWall > 15000 || e.ctx.state === 'closed') {
        teardown(e);
        setTimeout(() => { if (!E) { CACHE.clear(); PENDING.clear(); } }, 180000); // the sounds (~15 MB) go after 3 more quiet minutes
      } else e.timer = setTimeout(chk, 5000);
    };
    e.timer = setTimeout(chk, 16000);
  }

  /* ---------- playing ---------- */

  function hit(e, name, t, o = {}) {
    const b = get(e.ctx, name);
    if (!b) return null;
    const ctx = e.ctx;
    const s = ctx.createBufferSource(); s.buffer = b;
    if (o.rate) s.playbackRate.value = o.rate;
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    s.connect(g);
    let tail = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.8; tail.connect(f); tail = f; }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; tail.connect(p); tail = p; }
    tail.connect(o.to || e.G.drum);
    const at = Math.max(t, ctx.currentTime);
    s.start(at);
    if (DEBUG.log) DEBUG.log.push([at, name, o.gain ?? 1, s]);
    if (o.len) { g.gain.setValueAtTime(o.gain ?? 1, at + o.len); g.gain.linearRampToValueAtTime(0, at + o.len + 0.03); s.stop(at + o.len + 0.04); }
    if (o.k) e.future.push({ s, t: at, k: o.k });
    return { s, g };
  }
  function duck(e, t, amt = 1, k) {
    const b = get(e.ctx, `${e.v}.duck`);
    const s = e.ctx.createBufferSource(); s.buffer = b;
    let n = s;
    if (amt !== 1) { n = e.ctx.createGain(); n.gain.value = amt; s.connect(n); }
    n.connect(e.sc);
    const at = Math.max(t - 0.002, e.ctx.currentTime);
    s.start(at);
    if (k) e.future.push({ s, t: at, k });
  }
  function cancelFuture(e, from, pred) {
    const keep = [];
    for (const f of e.future) {
      if (f.t > from && (!pred || pred(f))) { try { f.s.stop(0); } catch { /* not started */ } if (DEBUG.log) f.s.cancelled = true; } else keep.push(f);
    }
    e.future = keep;
  }
  const chordAt = (e, t) => (e.chAnchor == null ? 0 : (((e.chBase + Math.floor((t - e.chAnchor) / e.bar + 1e-6)) % 4) + 4) % 4);
  const keysIn = (e, now, secs) => { let n = 0; for (let i = e.keys.length - 1; i >= 0 && now - e.keys[i] <= secs; i--) n++; return n; };
  const running = (e, now) => e.on && now < e.until - 0.02;
  const stepTime = (e, n) => e.anchor + n * e.s16 + (n % 2 ? e.swing : 0);

  // the groove helpers: every hit goes through a gate, and is remembered so a new downbeat can call it off
  const gk = (e, t, gain) => { hit(e, `${e.v}.kick`, t, { gain: gain * e.st.kickGain, to: e.gates.k.in, k: 'kick' }); duck(e, t, 1, 'duck'); };
  const gd = (e, n, t, gain, pan) => hit(e, `${e.v}.${n}`, t, { gain: gain * e.st.topsGain, pan, to: e.gates.d.in, k: 'g' });
  const gp = (e, n, t, gain, pan) => hit(e, `${e.v}.${n}`, t, { gain: gain * e.st.percGain, pan, to: e.gates.p.in, k: 'g' });
  const gb = (e, n, t, gain) => hit(e, `${e.v}.${n}`, t, { gain: gain * e.st.bassGain, to: e.gates.b.in, k: 'g' });
  const gm = (e, n, t, gain, o = {}) => hit(e, `${e.v}.${n}`, t, { gain, to: e.gates.m.in, k: 'g', ...o });

  function patternA(e, x) {
    const { s, bar, n, t, lv, ch, inBuild, inDrop } = x;
    const hv = () => 0.9 + 0.2 * e.r(); // human velocity
    if (!inBuild) {
      if (s % 4 === 0 && !x.first) gk(e, t, 0.95);
      if (lv >= 1 && (s === 4 || s === 12)) gp(e, bar % 2 ? 'clap2' : 'clap1', t, 0.42 * hv());
      if (lv >= 1 && BASS_A[s]) gb(e, `bass:${e.st.roots[ch] + BASS_A[s][0]}`, t, BASS_A[s][1] * hv());
      if (lv >= 2 && s === 0) gm(e, `pad:${ch}`, t, 0.3);
      if (inDrop) gm(e, `pluck:${e.st.hook[ch][n % 16]}`, t, 0.26 * hv(), { pan: n % 2 ? 0.25 : -0.25, len: 0.28 }); // the drop's own lead
    }
    if (s % 4 === 2) gd(e, 'hatOff', t, 0.34 * hv(), 0.12); // the offbeat "tss"
    else if (lv >= 2 && s % 2 === 1) gd(e, 'hat2', t, 0.1 * hv(), -0.15);
    gd(e, s % 2 ? 'shaker2' : 'shaker1', t, [0.22, 0.1, 0.3, 0.13][s % 4] * hv() * (lv >= 1 ? 1 : 0.8), -0.3);
    if (lv >= 2 && !inBuild) {
      if (bar % 4 === 3 && s >= 13) gp(e, ['congaHi', 'bongo', 'congaLo'][s - 13], t, 0.3 * hv(), [0.35, 0.5, -0.3][s - 13]); // a little fill into every 4th bar
      else if (CONGA_A[s]) gp(e, CONGA_A[s][0], t, CONGA_A[s][1] * hv(), CONGA_A[s][2]);
      if (s === 15 && bar % 2) gp(e, 'rim', t, 0.18 * hv(), -0.2);
    }
  }
  function patternB(e, x) {
    const { s, bar, n, t, lv, ch, inBuild, inDrop } = x;
    const hv = () => 0.9 + 0.2 * e.r();
    const skip = bar % 2 === 1 && s === 7 && lv >= 1; // the skippy extra kick of a 2-step
    if (!inBuild) {
      if ((s === 0 || s === 10 || skip) && !x.first) gk(e, t, skip ? 0.7 : 0.95);
      if (lv >= 1 && (s === 4 || s === 12)) { gp(e, 'clap1', t, 0.38 * hv()); gp(e, 'snare', t, 0.2 * hv()); }
      if (lv >= 1 && BASS_B[s]) gb(e, `bass:${e.st.roots[ch] + BASS_B[s][0]}:${BASS_B[s][2]}`, t, BASS_B[s][1] * hv());
      if (lv >= 2 && !inDrop && (s === 3 || s === 11)) gm(e, `stab:${ch}`, t, 0.14, { len: 0.14 }); // a short organ-ish chord stab
      if (inDrop) {
        if (s === 3 || s === 6 || s === 10 || s === 13) gm(e, `stab:${ch}`, t, 0.4, { len: s === 13 ? 0.22 : 0.16 });
        if (s % 4 === 2 || s === 8 || s === 15) gm(e, `chop:${e.st.hook[ch][n % 16]}:${n % 4}`, t, 0.3 * hv(), { pan: n % 2 ? 0.2 : -0.2 });
      }
    }
    if (s % 2 === 1) gd(e, 'hat', t, (s % 4 === 3 ? 0.2 : 0.13) * hv(), 0.15); // shuffled 16ths
    else if (s % 4 === 2) gd(e, 'hat', t, 0.3 * hv(), -0.1);
    if (lv >= 2 && s === 14 && bar % 2 === 0) gd(e, 'ohat', t, 0.2 * hv(), 0.2);
    if (lv >= 1) gd(e, s % 2 ? 'shaker2' : 'shaker1', t, (s % 4 === 2 ? 0.16 : 0.08) * hv(), -0.35);
    if (lv >= 2 && !inBuild && (s === 15 || (s === 7 && !skip))) gp(e, 'rim', t, 0.18 * hv(), 0.25);
  }
  function scheduleStep(e, n, t) {
    const inBuild = !!e.build && t >= e.build.t0 - 1e-4 && t < e.build.t1 - 1e-4;
    const inDrop = t >= e.dropT0 - 1e-4 && t < e.dropT1 - 1e-4;
    const age = (t - e.layer0) / e.bar;
    const lv = inDrop ? 3 : age < 0.999 ? 0 : age < 1.999 ? 1 : 2; // a bar of kick and tops, then bass and claps, then the rest
    const x = { s: n % 16, bar: Math.floor(n / 16), n, t, lv, ch: chordAt(e, t + 0.001), inBuild, inDrop, first: Math.abs(t - e.impactT) < 0.002 };
    if (e.v === 'a') patternA(e, x); else patternB(e, x);
    if (e.build && Math.abs(t - e.build.t1) < 0.002) { // a build that was not dropped: the beat comes back with a crash
      hit(e, `${e.v}.crash`, t, { gain: 0.2, to: e.gates.d.in, k: 'g' });
      hit(e, `${e.v}.clap1`, t, { gain: 0.3, to: e.gates.p.in, k: 'g' });
    }
  }
  function fill(e, until) {
    const now = e.ctx.currentTime;
    for (let guard = 0; guard < 512; guard++) {
      const tn = stepTime(e, e.step);
      if (tn >= until) break;
      if (tn >= now) scheduleStep(e, e.step, tn);
      e.step++;
    }
  }
  /** Keep the groove going for `secs` more, then fade it out through the closing filter. */
  function hold(e, now, secs, fresh) {
    e.fadeAt = Math.max(e.fadeAt, now + secs);
    e.until = e.fadeAt + FADE * e.bar;
    for (const k of ['k', 'd', 'p', 'b', 'm']) {
      const { g, lp } = e.gates[k];
      g.gain.cancelAndHoldAtTime(now);
      if (fresh) g.gain.setValueAtTime(1, now); else g.gain.linearRampToValueAtTime(1, now + 0.02);
      g.gain.setValueAtTime(1, e.fadeAt); g.gain.linearRampToValueAtTime(0.0001, e.until);
      lp.frequency.cancelAndHoldAtTime(now);
      if (fresh) lp.frequency.setValueAtTime(20000, now); else lp.frequency.exponentialRampToValueAtTime(20000, now + 0.02);
      lp.frequency.setValueAtTime(20000, e.fadeAt); lp.frequency.exponentialRampToValueAtTime(260, e.until);
    }
    fill(e, e.until);
  }
  /** A new downbeat at t: what was planned after it is called off. */
  function anchorAt(e, t, now) {
    cancelFuture(e, now);
    e.anchor = t; e.step = 0;
  }
  function startGroove(e, now, t, kicked) {
    e.chBase = chordAt(e, t); e.chAnchor = t; // the chord carries on; its bar starts now
    anchorAt(e, t, now);
    e.on = true; e.layer0 = t; e.fadeAt = 0;
    if (kicked) e.impactT = t; // the space bar already kicked this downbeat
    hold(e, now, HOLD * e.bar, true);
  }
  function groove(e, now, t, kicked = false) {
    if (running(e, now)) { if (keysIn(e, now, 1.5) >= 4) hold(e, now, HOLD * e.bar, false); return; } // slow keys let it fade under them
    if (e.build && now < e.build.t1) return; // a groove does not start in the middle of a build
    if (keysIn(e, now, 1.5) >= 6) startGroove(e, now, t, kicked);
  }

  function lead(e, m, t, energy, step, o = {}) {
    if (e.v === 'a') {
      // brighter and tighter the faster you type; slow notes ring out
      const lp = 3400 + 9000 * Math.pow(energy, 1.3) + (o.bright || 0);
      return hit(e, `a.pluck:${m}`, t, { gain: (0.76 - 0.12 * energy) * (o.gain ?? 1), lp, pan: step % 2 ? 0.22 : -0.22, to: o.to || e.G.lead, len: energy > 0.5 ? 0.32 : 0, k: o.k });
    }
    const c = hit(e, `b.chop:${m}:${step % 4}`, t, { gain: 0.5 * (o.gain ?? 1), pan: step % 2 ? 0.16 : -0.16, to: o.to || e.G.chop, k: o.k, lp: o.lp });
    hit(e, `b.bell:${m + 12}`, t, { gain: (0.1 + 0.1 * energy) * (o.gain ?? 1), pan: step % 2 ? -0.35 : 0.35, to: e.G.bell, k: o.k });
    return c;
  }

  function onKey(e, now, t) {
    e.keys.push(now);
    while (e.keys.length > 64) e.keys.shift();
    const energy = clamp((keysIn(e, now, 1.5) / 1.5 - 2) / 8, 0, 1);
    const ch = chordAt(e, t + 0.04); // a key a hair before the bar line belongs to the new chord
    const step = e.pat++;
    const m = e.st.hook[ch][step % 16];
    lead(e, m, t, energy, step, { bright: e.build && now < e.build.t1 ? 4000 : 0 });
    e.lastNote = m; e.lastStep = step;
    groove(e, now, t);
  }
  function onSpace(e, now, t) {
    let g = 1;
    if (running(e, now)) {
      // the space bar's kick owns the half beat after it (a groove kick due there is called off), and steps back if one just hit
      cancelFuture(e, t - 0.001, (f) => (f.k === 'kick' || f.k === 'duck') && f.t < t + e.beat * 0.5);
      for (const f of e.future) if (f.k === 'kick' && f.t <= t && f.t > t - 0.09) g = 0.6;
    }
    hit(e, `${e.v}.kickBig`, t, { gain: e.st.hitGain * g });
    duck(e, t, 1);
    e.keys.push(now);
    groove(e, now, t, true);
  }
  function onBack(e, now, t) {
    const quick = now - e.lastBack < 0.22; // a held Backspace repeats: keep those small
    e.lastBack = now;
    const ch = chordAt(e, t);
    const m = e.lastNote ?? e.st.hook[ch][0];
    if (e.v === 'a') {
      // tape stop: the last notes dive in pitch and die, echoing
      const notes = quick ? [[m, 0.3]] : [[m, 0.38], [e.st.hook[ch][(e.lastStep ?? 0) % 2 ? 0 : 1], 0.26]];
      for (const [mm, gg] of notes) {
        const h = hit(e, `a.pluck:${mm}`, t, { gain: gg, lp: 7000, to: e.G.lead });
        if (!h) continue;
        const T = quick ? 0.16 : 0.34;
        h.s.playbackRate.setValueAtTime(1, t); h.s.playbackRate.exponentialRampToValueAtTime(0.28, t + T);
        h.g.gain.setValueAtTime(gg, t + T * 0.4); h.g.gain.linearRampToValueAtTime(0, t + T); h.s.stop(t + T + 0.02);
      }
    } else {
      // stutter: the last chop again in 32nds, falling, through a closing filter
      const step = e.lastStep ?? 0; const reps = quick ? 2 : 4;
      const lp = e.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
      lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(700, t + reps * e.s16 / 2);
      lp.connect(e.G.chop);
      for (let i = 0; i < reps; i++) {
        const h = hit(e, `b.chop:${m}:${step % 4}`, t + i * e.s16 / 2, { gain: 0.42 * Math.pow(0.78, i), rate: Math.pow(2, -i / 12), to: lp, len: e.s16 / 2 - 0.006 });
        if (!h) break;
      }
    }
    e.keys.push(now);
    groove(e, now, t);
  }
  function stopBuild(e, now) {
    const b = e.build;
    if (!b) return;
    for (const h of b.nodes) {
      if (!h) continue;
      try { h.g.gain.cancelAndHoldAtTime(now); h.g.gain.linearRampToValueAtTime(0, now + 0.012); h.s.stop(now + 0.03); } catch { /* gone */ }
    }
    if (b.lp) { b.lp.frequency.cancelAndHoldAtTime(now); }
    for (const k of ['d', 'p', 'm']) { const f = e.gates[k].hp.frequency; f.cancelAndHoldAtTime(now); f.exponentialRampToValueAtTime(20, now + 0.012); }
    b.nodes = [];
  }
  function onBuild(e, now, t) {
    stopBuild(e, now);
    const T = e.bar; const b = { t0: t, t1: t + T, nodes: [] };
    const wasOn = running(e, now);
    const ch = chordAt(e, t + 0.01);
    e.build = b;
    b.nodes.push(hit(e, `${e.v}.riser`, t, { gain: 0.36, to: e.G.fx }));
    // the snare roll speeds up: quarters, 8ths, 16ths, 32nds, louder and higher
    for (const u of [0, 4, 6, 8, 9, 10, 11, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5]) {
      const k = u / 16;
      b.nodes.push(hit(e, `${e.v}.snare`, t + u * e.s16, { gain: 0.1 + 0.36 * Math.pow(k, 1.5), rate: 1 + 0.32 * k, to: e.G.perc }));
    }
    // the arp (a) / the chop roll (b) plays itself, through a filter that opens over the bar
    const lp = e.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(350, t); lp.frequency.exponentialRampToValueAtTime(13000, t + T);
    lp.connect(e.v === 'a' ? e.G.lead : e.G.chop);
    b.lp = lp;
    if (e.v === 'a') {
      for (let u = 0; u < 16; u++) {
        const m = e.st.hook[ch][(e.pat + u) % 16] + (u >= 12 ? 12 : 0);
        b.nodes.push(hit(e, `a.pluck:${m}`, t + u * e.s16, { gain: 0.22 + 0.2 * u / 16, pan: u % 2 ? 0.3 : -0.3, to: lp, len: 0.2 }));
      }
    } else {
      const cell = e.st.hook[ch];
      const U = []; for (let u = 0; u < 12; u++) U.push(u); for (let u = 12; u < 16; u += 0.5) U.push(u);
      U.forEach((u, i) => { // climbing the chord a beat at a time
        const m = cell[[0, 2, 4, 6][Math.floor(u / 4)]];
        b.nodes.push(hit(e, `b.chop:${m}:0`, t + u * e.s16, { gain: 0.2 + 0.22 * u / 16, pan: i % 2 ? 0.25 : -0.25, to: lp, len: (u >= 12 ? e.s16 / 2 : e.s16) - 0.008 }));
      });
    }
    if (wasOn) { // the groove keeps its tops through the build (kick and bass drop out) and thins out as it rises
      e.chBase = ch; e.chAnchor = t;
      anchorAt(e, t, now);
      for (const k of ['d', 'p', 'm']) { const f = e.gates[k].hp.frequency; f.cancelAndHoldAtTime(now); f.setValueAtTime(20, t); f.exponentialRampToValueAtTime(1600, t + T); f.setValueAtTime(1600, t + T - 0.001); f.exponentialRampToValueAtTime(20, t + T + 0.01); }
      hold(e, now, T, false);
    }
    e.keys.push(now);
  }
  function impact(e, t) {
    hit(e, `${e.v}.kickBig`, t, { gain: e.st.hitGain * 1.05 });
    duck(e, t, 1.3);
    hit(e, `${e.v}.impact`, t, { gain: 0.5 });
    hit(e, `${e.v}.clap1`, t, { gain: 0.45, to: e.G.perc });
    hit(e, `${e.v}.crash`, t, { gain: 0.3, to: e.G.fx });
    hit(e, `${e.v}.down`, t, { gain: 0.25, to: e.G.fx });
    hit(e, `${e.v}.stab:0`, t, { gain: 0.6, to: e.G.stab });
    if (e.v === 'b') hit(e, `b.chop:${e.st.hook[0][3]}:2`, t, { gain: 0.36, to: e.G.chop }); // a high "hey"
  }
  function onEnter(e, now, t) {
    const built = !!e.build && now < e.build.t1 + 2.5;
    const wasOn = running(e, now);
    stopBuild(e, now); e.build = null;
    impact(e, t);
    e.impactT = t; e.chBase = 0; e.chAnchor = t; e.pat = 0;
    if (built) { // the drop: two bars of everything, its own lead on top
      anchorAt(e, t, now);
      e.on = true; e.dropT0 = t; e.dropT1 = t + 2 * e.bar; e.layer0 = t - 3 * e.bar; e.fadeAt = 0;
      hold(e, now, 2 * e.bar + LAT, !wasOn);
    } else if (wasOn) { // a bar more of the groove under the hit
      anchorAt(e, t, now);
      hold(e, now, e.bar + LAT, false);
    }
  }

  function play(ctx, dest, key = 'key', opts = {}) {
    if (!ctx) return;
    const v = STYLE[opts.variant] ? opts.variant : DEFAULT_VARIANT;
    let e = E;
    if (!e || e.ctx !== ctx || e.v !== v) { if (e) teardown(e); e = E = build(ctx, v); prewarm(ctx, v); }
    const now = ctx.currentTime; const t = now + LAT;
    if (e.dest !== dest) { try { e.out.disconnect(); } catch { /* not yet */ } e.out.connect(dest || ctx.destination); e.dest = dest; }
    const vol = clamp(Number(opts.volume ?? 0.4), 0, 1) * LEVEL;
    if (e.vol < 0) e.out.gain.value = vol; else if (Math.abs(e.vol - vol) > 1e-4) e.out.gain.setTargetAtTime(vol, now, 0.015);
    e.vol = vol;
    e.lastWall = performance.now(); arm(e);
    e.future = e.future.filter((f) => f.t > now - 0.3);
    if (now - e.lastKey > SESSION_GAP && !running(e, now)) { e.chBase = 0; e.chAnchor = t; e.pat = 0; e.keys = []; } // a new start: the first chord, the top of the hook
    e.lastKey = now;
    if (key === 'space') onSpace(e, now, t);
    else if (key === 'back') onBack(e, now, t);
    else if (key === 'newline') onBuild(e, now, t);
    else if (key === 'enter') onEnter(e, now, t);
    else onKey(e, now, t);
  }

  window.EDM_SOUND = {
    play,
    prewarm,
    reset() { if (E) teardown(E); E = null; },
    _clear() { CACHE.clear(); PENDING.clear(); }, // for tests: a cold start
    variants: { a: 'melodic techno / afro house · 124 BPM', b: 'UK garage / future bass · 132 BPM' },
    defaultVariant: DEFAULT_VARIANT,
    _state: () => E, // for tests
    debug: DEBUG,
  };
})();
