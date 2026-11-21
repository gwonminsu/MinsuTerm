'use strict';
/*
 * 백룸 — the Smiler (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * Only ever seen in the dark, and nothing of it but what the dark lets through: two eyes that are not a pair and a
 * grin far wider than any head, with far too many teeth. Everything is painted once, pixel by pixel, and kept:
 * rows of teeth (old ivory gone yellow-brown at the gums, stains, dead grey ones, broken ones, a wet streak down
 * each, a second row of fangs further in), wet scalloped gums, and two different eyes (a jaundiced, veined white with
 * a raw pink corner, a pale fibrous iris, a hard catchlight). A mouth is built from those for each state of it
 * (how far it has spread, how far the jaw has dropped): the teeth are laid along the curve of the grin slice by
 * slice, crowding together toward the corners, with strings of spit between the jaws that stretch and snap. The
 * room it stands in really goes dark (worn away to the page on a dark theme, a deep shade on a light one), and the
 * dark round it is deeper still; a faint cold glow bleeds from the eyes and teeth into it.
 *
 * It moves like stop-motion: the grin widens in jerks, held, snapped on; its own clock stops and catches up; one eye
 * twitches and squeezes; the tape tears at its key moments. Every visit ends on it close and big (2-4 m off).
 *
 * Five ways it is met (BG.st.entityNow = 'smiler:<v>'), never the same twice running:
 *   hall     the tubes die toward us one by one, down to the room in front of us; in the dark one eye opens, then the
 *            other; they wander, find us, the pupils shrink (never the same size); the grin spreads in jerks past any
 *            face; twice the tube over it tries to come back and it is not there, and when the tube gives up it is
 *            nearer (5.6 m, then 3.5 m); the jaw unhinges, rows of fangs behind the teeth, spit snapping; it snaps
 *            shut, the lights stutter, and it is gone
 *   door     a side room we can see into goes dark as we come up to it (or, with none in sight, the room beyond the
 *            doorway ahead); the eyes hang up under its ceiling and the grin opens down by the floor, far apart,
 *            sliding along to keep us in sight, the grin dragging after; then the grin jerks up to the eyes and the
 *            whole face lurches out at us, swelling, jaw dropping; the light comes back on nothing
 *   closer   each time the lights stutter it is a room nearer (13, 9.6, 6.6, 3.7 m), its grin wider, its head at
 *            another angle; at the last its pupils blow wide and black and the jaw drops; then every light snaps on,
 *            too bright, and it is gone
 *   swarm    a far room goes dark and fills with them, eyes opening one after another faster and faster, grins
 *            spreading; the lights stutter and the whole of it is in the room in front of us; every head ticks to the
 *            same angle at once, every eye widens at once, and they all shut at once
 *   ceiling  under a dead tube a grin opens upside down in the ceiling tiles, eyes below it; it slides toward us over
 *            the tiles in jerks, each tube it passes under dying, peeling down off the ceiling until it hangs facing
 *            us 3 m off, and the jaw drops open, upward
 * (window.SM_PROBE = true: its draw / step times, every 30 frames, as console.warn 'PROBE smiler ...'.)
 */
(function () {
  const ENT = (window.BR_ENT = window.BR_ENT || {});
  const TAU = Math.PI * 2;
  const VARS = ['hall', 'door', 'closer', 'swarm', 'ceiling'];
  let lastV = '';

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const h2 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, s) => { // smooth value noise
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), sx = xi + s * 31;
    const a = h2(sx, yi), b = h2(sx + 1, yi), c = h2(sx, yi + 1), d = h2(sx + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rng = (s) => { let x = (Math.imul(s | 0, 2654435761) >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // ================================================================ the paint, made once
  const B = {}; // teeth rows, eye whites, irises, glow, dark

  /** A row of teeth, TW x TH px: the gums along the top (the roots go in at row GR), the tips below. o: n teeth, fangs (all
   * pointed: a row further in), dark (how much light reaches it), flip (gums at the bottom: the lower jaw). */
  const TW = 760, TH = 84, GR = 12;
  function* teethRow(seed, o) { // (it yields now and then: made a slice at a time in idle moments)
    const W = TW, H = TH, N = o.n, n4 = W * H, R = new Float32Array(n4), G = new Float32Array(n4), Bc = new Float32Array(n4), A = new Float32Array(n4);
    const spc = W / N, T = [], dk = o.dark || 1;
    for (let k = 0; k < N; k++) {
      const r = (q) => h2(seed * 31 + q * 7, k * 3 + 1);
      const fang = !!o.fangs || ((k % 10 === 3 || k % 10 === 8) && r(1) < 0.6);
      if (!fang && r(13) < 0.05) continue; // one gone
      T.push({ cx: (k + 0.5) * spc + (r(2) - 0.5) * spc * 0.4, hw: spc * 0.5 * (0.98 + r(3) * 0.4) * (fang ? 0.9 : 1), root: GR - 4 + r(4) * 5,
        len: (H - GR - 1) * (o.fangs ? 0.7 + 0.3 * r(5) : fang ? 0.9 + 0.1 * r(5) : 0.56 + 0.32 * r(5)), lean: (r(6) - 0.5) * (o.fangs ? 0.34 : 0.3),
        point: fang ? 1 : r(7) < 0.14 ? 0.55 : 0, broken: !fang && r(8) < 0.13 ? 0.42 + r(9) * 0.35 : 0, bs: (r(10) - 0.5) * 1.6,
        dead: r(11) < 0.11, back: r(12) < 0.28, stain: r(14), tone: r(15) });
    }
    T.sort((a, b) => (a.back ? 0 : 1) - (b.back ? 0 : 1)); // the ones set back first: their neighbours overlap them
    for (const t of T) {
      yield;
      const ext = t.hw * 1.12 + Math.abs(t.lean) * t.len, x0 = Math.max(0, Math.floor(t.cx - ext)), x1 = Math.min(W - 1, Math.ceil(t.cx + ext));
      const y0 = Math.max(0, Math.floor(t.root)), y1 = Math.min(H - 1, Math.ceil(t.root + t.len + 1));
      for (let py = y0; py <= y1; py++) {
        const v = (py + 0.5 - t.root) / t.len;
        if (v < 0 || v > 1.03) continue;
        let wv = v < 0.12 ? 0.8 + 1.65 * v : 1; // narrower at the neck
        if (t.point) wv *= 1 - (t.point === 1 ? 0.9 : 0.55) * Math.pow(clamp((v - 0.3) / 0.7, 0, 1), 1.25);
        else if (v > 0.8) wv *= Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.8) / 0.23, 2)));
        if (wv <= 0.02) continue;
        const rootK = clamp(1 - v / 0.32, 0, 1), tipK = clamp((v - 0.8) / 0.2, 0, 1), lc = t.cx + t.lean * (py - t.root), ao = clamp((py + 0.5 - t.root) / 5, 0.3, 1);
        for (let px = x0; px <= x1; px++) {
          const u = (px + 0.5 - lc) / t.hw;
          if (t.broken && v > t.broken + t.bs * u * 0.12) continue;
          const ins = wv - Math.abs(u);
          if (ins <= -0.1) continue;
          const cov = clamp(0.5 + ins / 0.2, 0, 1), nx = clamp(u / wv, -1, 1), nz = Math.sqrt(1 - nx * nx);
          const lam = 0.28 + 0.72 * clamp(nz * 0.82 - nx * 0.2 + 0.12, 0, 1), gap = clamp((Math.abs(nx) - 0.6) / 0.4, 0, 1);
          const n1 = vnoise(px / 4.5, py / 10, seed + t.tone * 5), n2 = vnoise(px / 1.7, py / 2.4, seed + 37), st = n1 * (0.3 + 0.7 * t.stain);
          let r = 230, g = 216, b = 178; // old ivory, yellow-brown toward the gum, stained
          r -= 22 * rootK + 50 * st * (0.3 + rootK); g -= 36 * rootK + 64 * st * (0.35 + rootK); b -= 70 * rootK + 92 * st * (0.4 + rootK);
          if (t.dead) { r = r * 0.6 + 34; g = g * 0.58 + 30; b = b * 0.6 + 26; }
          r += (148 - r) * tipK * 0.5; g += (156 - g) * tipK * 0.5; b += (152 - b) * tipK * 0.5; // the tip, thin enough to see through
          const band = 0.975 + 0.025 * Math.sin(v * 33 + n1 * 5), pit = t.stain > 0.66 && v < 0.3 && n2 > 0.7 ? 0.42 : 1;
          const sh = lam * (1 - 0.72 * gap) * band * pit * (t.back ? 0.6 : 1) * dk * ao;
          r *= sh; g *= sh; b *= sh;
          const spec = Math.exp(-Math.pow((nx + 0.4) / 0.13, 2)) * (0.4 + 0.6 * (1 - rootK)) * (0.65 + 0.35 * n2) * (t.back ? 0.5 : 1) * dk; // wet
          r += 92 * spec; g += 90 * spec; b += 84 * spec;
          if (vnoise(px / 1.3, py / 11, seed + 99) > 0.87) { r *= 0.66; g *= 0.64; b *= 0.62; } // hairline cracks
          const i = py * W + px;
          R[i] = R[i] * (1 - cov) + r * cov; G[i] = G[i] * (1 - cov) + g * cov; Bc[i] = Bc[i] * (1 - cov) + b * cov; A[i] = A[i] + (1 - A[i]) * cov;
        }
      }
    }
    for (let px = 0; px < W; px++) { // the gums over the roots: scalloped over each tooth, swollen down between them, wet
      if (!(px & 63)) yield;
      let bump = 0;
      for (const t of T) { const q = (px + 0.5 - t.cx) / t.hw; if (q > -1 && q < 1) bump = Math.max(bump, 1 - q * q); }
      const marg = GR + 5 - 7.5 * Math.sqrt(bump) + (vnoise(px / 9, 0, seed + 3) - 0.5) * 3;
      for (let py = 0; py <= Math.min(H - 1, marg + 1); py++) {
        const cov = clamp(marg + 0.5 - py, 0, 1), n = vnoise(px / 3.2, py / 2.2, seed + 7), nn = vnoise(px / 11, py / 6, seed + 9), dp = clamp(py / Math.max(1, marg), 0, 1);
        let r = 30 + 46 * dp + 22 * nn, g = 6 + 12 * dp + 6 * nn, b = 8 + 11 * dp + 6 * nn;
        const wet = n > 0.78 ? (n - 0.78) * 3.4 : 0;
        r = (r + 96 * wet) * dk; g = (g + 76 * wet) * dk; b = (b + 72 * wet) * dk;
        const i = py * W + px;
        R[i] = R[i] * (1 - cov) + r * cov; G[i] = G[i] * (1 - cov) + g * cov; Bc[i] = Bc[i] * (1 - cov) + b * cov; A[i] = A[i] + (1 - A[i]) * cov;
      }
    }
    const c = mk(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) { const sy = o.flip ? H - 1 - py : py; for (let px = 0; px < W; px++) { const i = sy * W + px, q = (py * W + px) * 4; d[q] = R[i]; d[q + 1] = G[i]; d[q + 2] = Bc[i]; d[q + 3] = A[i] * 255; } }
    x.putImageData(img, 0, 0);
    return c;
  }

  // ---- the eyes: EW x EH px, the eye's centre at (ECX, ECY), ERW px from the centre to a corner
  const EW = 168, EH = 104, ECX = 84, ECY = 54, ERW = 72;
  const EYES = [ // not a pair: one rounder and paler, one narrower under a heavier lid, yellower, the pupil off true
    { seed: 5, round: 0.7, lid: 0.95, inner: 1, slant: 1, ri: 0.27, bias: 0, tint: [244, 238, 216], iris: [170, 178, 154], vein: '160,24,30' },
    { seed: 9, droop: true, round: 0.58, lid: 1.1, inner: -1, slant: -1.5, ri: 0.25, bias: 0.12, tint: [238, 226, 188], iris: [184, 166, 116], vein: '170,30,26' },
  ];
  function* sclera(E) {
    const c = mk(EW, EH), x = c.getContext('2d'), img = x.createImageData(EW, EH), d = img.data;
    for (let py = 0; py < EH; py++) for (let px = 0; px < EW; px++) {
      if (!px && !(py & 15)) yield;
      const u = (px + 0.5 - ECX) / ERW, v = (py + 0.5 - ECY) / (ERW * 0.62), rr = u * u + v * v;
      const n = vnoise(px / 6, py / 6, E.seed), n2 = vnoise(px / 2.2, py / 2.2, E.seed + 5), sh = 1 - 0.5 * Math.pow(Math.min(1.4, rr), 1.3), cor = Math.pow(Math.min(1, Math.abs(u)), 3);
      let r = E.tint[0] - 10 * n + 14 * cor, g = E.tint[1] - 16 * n - 46 * cor, b = E.tint[2] - 26 * n - 64 * cor; // raw and red toward the corners
      const ic = Math.exp(-Math.pow((u - E.inner * 0.96) / 0.11, 2) - Math.pow(v / 0.5, 2)); // the inner corner: a wet pink knot of flesh
      r = r * (1 - ic) + 190 * ic; g = g * (1 - ic) + 76 * ic; b = b * (1 - ic) + 84 * ic;
      const cap = n2 > 0.68 ? (n2 - 0.68) * 2.4 : 0;
      r *= sh; g = (g - 70 * cap) * sh; b = (b - 60 * cap) * sh;
      const o = (py * EW + px) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const R = rng(E.seed * 7 + 3); x.lineCap = 'round';
    const vein = (px, py, ang, w, n, depth) => { // red threads from the corners in, branching
      for (let s = 0; s < n; s++) {
        const nx = px + Math.cos(ang) * 3.2, ny = py + Math.sin(ang) * 3.2, k = 1 - s / n;
        x.strokeStyle = `rgba(${E.vein},${0.18 + 0.5 * k})`; x.lineWidth = Math.max(0.4, w * k);
        x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        px = nx; py = ny; ang += (R() - 0.5) * 0.7;
        if (depth < 2 && R() < 0.13) vein(px, py, ang + (R() < 0.5 ? -0.8 : 0.8), w * k * 0.7, ((n - s) * 0.6) | 0, depth + 1);
      }
    };
    for (let k = 0; k < 24; k++) { const side = k % 2 ? 1 : -1; vein(ECX + side * ERW * 0.98, ECY + (R() - 0.5) * 26, (side > 0 ? Math.PI : 0) + (R() - 0.5) * 0.9, 1.6 + R() * 1.2, 7 + ((R() * 9) | 0), 0); }
    return c;
  }
  function* iris(E) {
    const S = 64, c = mk(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, Rr = S / 2;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      if (!px && !(py & 31)) yield;
      const dx = px + 0.5 - Rr, dy = py + 0.5 - Rr, r = Math.hypot(dx, dy) / Rr;
      if (r > 1) continue;
      const q = (Math.atan2(dy, dx) / TAU + 0.5) * 60, i0 = Math.floor(q) % 60, fr = q - Math.floor(q), fib = h2(E.seed, i0) * (1 - fr) + h2(E.seed, (i0 + 1) % 60) * fr;
      const f2 = vnoise(r * 8, q * 0.6, E.seed + 2);
      let k = 0.62 + 0.5 * fib * (0.55 + 0.45 * f2);
      k *= 1 - 0.75 * sm(0.74, 1, r); // the dark ring at its edge
      k *= 1 + 0.18 * Math.exp(-Math.pow((r - 0.42) / 0.08, 2)); // the collarette
      if (r < 0.3) k *= 0.7;
      const o = (py * S + px) * 4; d[o] = E.iris[0] * k; d[o + 1] = E.iris[1] * k; d[o + 2] = E.iris[2] * k; d[o + 3] = 255 * clamp((1 - r) / 0.05, 0, 1);
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function lidPath(x, o, E) { // the lids, open o: the upper arching high and heavy, the lower flatter; the inner corner lower
    const w = ERW, h = ERW * E.round * o, s = E.inner, xi = ECX + s * w, xo = ECX - s * w, yi = ECY + 3, yo = ECY - 2 * E.slant;
    x.beginPath(); x.moveTo(xo, yo);
    x.bezierCurveTo(ECX - s * w * 0.55, ECY - h * 1.32 * E.lid, ECX + s * w * 0.35, ECY - h * 1.2, xi, yi);
    x.bezierCurveTo(ECX + s * w * 0.4, ECY + h * 0.78, ECX - s * w * 0.5, ECY + h * 0.86, xo, yo);
    x.closePath();
  }

  /** Everything above, as one job that can stop anywhere and go on later. */
  function* baseJob() {
    B.up = yield* teethRow(11, { n: 36 });
    B.lo = yield* teethRow(23, { n: 34, flip: true });
    B.inU = yield* teethRow(37, { n: 30, fangs: true, dark: 0.72 });
    B.inL = yield* teethRow(41, { n: 28, fangs: true, dark: 0.66, flip: true });
    const scl = [], ir = [];
    for (const E of EYES) { scl.push(yield* sclera(E)); ir.push(yield* iris(E)); }
    const gl = mk(64, 64), x = gl.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); // a cold glow
    g.addColorStop(0, 'rgba(226,240,232,0.6)'); g.addColorStop(0.22, 'rgba(214,232,224,0.3)'); g.addColorStop(0.55, 'rgba(200,220,214,0.08)'); g.addColorStop(1, 'rgba(200,220,214,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const dk = mk(128, 128), y = dk.getContext('2d'), g2 = y.createRadialGradient(64, 64, 0, 64, 64, 64); // the dark round it
    for (const [o, al] of [[0, 1], [0.35, 0.92], [0.6, 0.6], [0.8, 0.25], [1, 0]]) g2.addColorStop(o, `rgba(10,7,3,${al})`);
    y.fillStyle = g2; y.fillRect(0, 0, 128, 128);
    B.scl = scl; B.iris = ir; B.glow = gl; B.dark = dk; B.done = true;
  }
  let job = null;
  /** Go on with the base for up to ms milliseconds; true once everything is made. */
  function warmBase(ms) {
    if (B.done) return true;
    if (!job) job = baseJob();
    const t0 = performance.now();
    do { if (job.next().done) return true; } while (performance.now() - t0 < ms);
    return false;
  }
  const base = () => warmBase(1e9);
  const later = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(() => f(null), 120);
  setTimeout(function idle() { // in the background, a few ms at a time (if the backrooms are what is up)
    try { if (typeof S === 'undefined' || !S.settings || S.settings.bgAnim !== 'backrooms') return; } catch (err) { return; }
    later((dl) => { if (!warmBase(Math.max(2, Math.min(5, dl && dl.timeRemaining ? dl.timeRemaining() - 1 : 5)))) setTimeout(idle, 60); });
  }, 4000);

  // ---- memory: the eyes and mouths are let go when a visit ends; the base (teeth, whites, irises) a while after that.
  // Letting go empties the canvases (the memory comes back at once, not when the collector gets to it); the next visit
  // bakes the base again, a few ms a frame, and does not show until it is done.
  const IDLE_MS = 40000;
  const zap = (c) => { if (c && c.getContext) { c.width = 0; c.height = 0; } };
  const zapAll = (M) => { for (const v of M.values()) zap(v && v.c ? v.c : v); M.clear(); };
  let lastUse = 0, idleT = 0;
  function dropBase() {
    for (const k of Object.keys(B)) { const v = B[k]; if (Array.isArray(v)) v.forEach((q) => zap(q && q.c ? q.c : q)); else if (v && typeof v === 'object') zap(v.c || v); delete B[k]; }
    job = null;
  }
  function idleCheck() { const t = performance.now() - lastUse; if (t >= IDLE_MS - 20) { idleT = 0; zapAll(EYE_C); zapAll(MOUTH[0]); zapAll(MOUTH[1]); dropBase(); } else idleT = setTimeout(idleCheck, IDLE_MS - t); }
  function touch() { lastUse = performance.now(); if (!idleT) idleT = setTimeout(idleCheck, IDLE_MS); }
  function mem() {
    let b = 0; const c = (v) => { const q = v && v.c ? v.c : v; if (q && q.getContext) b += q.width * q.height * 4; };
    for (const k of Object.keys(B)) { const v = B[k]; if (Array.isArray(v)) v.forEach(c); else if (v && typeof v === 'object') c(v); }
    for (const M of [EYE_C, MOUTH[0], MOUTH[1]]) for (const v of M.values()) c(v);
    return { bytes: b, eyes: EYE_C.size, mouths: MOUTH[0].size + MOUTH[1].size, base: !!B.done };
  }

  // ---- an eye in one state, baked (lids open o, pupil pup 0 pinprick .. 1 blown, looking lx, ly), kept a while
  const EYE_C = new Map();
  function eyeSprite(i, o, pup, lx, ly) {
    const oq = Math.round(clamp(o, 0, 1.15) * 8), pq = Math.round(clamp(pup, 0, 1) * 6), lxq = Math.round(clamp(lx, -1, 1) * 2), lyq = Math.round(clamp(ly, -1, 1));
    const key = (((i * 10 + oq) * 10 + pq) * 5 + lxq + 2) * 3 + lyq + 1;
    let c = EYE_C.get(key);
    if (c) { EYE_C.delete(key); EYE_C.set(key, c); return c; }
    base();
    const E = EYES[i], oo = oq / 8, x = (c = mk(EW, EH)).getContext('2d');
    if (oq === 0) { // shut: only the crease
      x.beginPath(); x.moveTo(ECX - ERW, ECY - 2 * E.slant); x.quadraticCurveTo(ECX, ECY + ERW * 0.12, ECX + ERW, ECY + 3);
      x.strokeStyle = 'rgba(40,12,10,0.55)'; x.lineWidth = 2.4; x.stroke();
    } else {
      lidPath(x, oo, E); x.save(); x.clip();
      x.drawImage(B.scl[i], 0, 0);
      const ri = ERW * E.ri, ix = ECX + (lxq / 2 + E.bias) * ERW * 0.42, iy = ECY + lyq * ERW * 0.14 + ERW * 0.05;
      x.drawImage(B.iris[i], ix - ri, iy - ri, ri * 2, ri * 2);
      const pr = ri * (0.13 + 0.62 * (pq / 6)), pg = x.createRadialGradient(ix, iy, 0, ix, iy, pr * 1.3);
      pg.addColorStop(0, 'rgba(2,1,1,1)'); pg.addColorStop(0.75, 'rgba(4,2,2,1)'); pg.addColorStop(1, 'rgba(10,4,4,0)');
      x.fillStyle = pg; x.beginPath(); x.arc(ix, iy, pr * 1.3, 0, TAU); x.fill();
      const top = ECY - ERW * E.round * oo * E.lid, lg = x.createLinearGradient(0, top, 0, top + ERW * 0.5); // the lid's shadow over the top of it
      lg.addColorStop(0, 'rgba(34,8,6,0.8)'); lg.addColorStop(1, 'rgba(34,8,6,0)'); x.fillStyle = lg; x.fillRect(0, 0, EW, EH);
      const bt = ECY + ERW * E.round * oo * 0.62, bg = x.createLinearGradient(0, bt, 0, bt - ERW * 0.22);
      bg.addColorStop(0, 'rgba(60,14,12,0.55)'); bg.addColorStop(1, 'rgba(60,14,12,0)'); x.fillStyle = bg; x.fillRect(0, 0, EW, EH);
      if (E.droop) { const by = ECY + ERW * E.round * oo * 0.62, rg = x.createLinearGradient(0, by + 2, 0, by - ERW * 0.16); rg.addColorStop(0, 'rgba(150,30,32,0.95)'); rg.addColorStop(0.5, 'rgba(176,58,56,0.55)'); rg.addColorStop(1, 'rgba(176,58,56,0)'); x.fillStyle = rg; x.fillRect(0, 0, EW, EH); }
      x.fillStyle = 'rgba(255,255,250,0.96)'; x.beginPath(); x.ellipse(ix - ri * 0.36, iy - ri * 0.4, ri * 0.17, ri * 0.12, -0.5, 0, TAU); x.fill(); // wet: a hard catchlight
      x.fillStyle = 'rgba(255,255,250,0.5)'; x.beginPath(); x.arc(ix + ri * 0.42, iy + ri * 0.36, ri * 0.07, 0, TAU); x.fill();
      x.restore();
      lidPath(x, oo, E); x.strokeStyle = 'rgba(6,2,1,0.32)'; x.lineWidth = 6; x.stroke(); x.strokeStyle = 'rgba(30,8,6,0.5)'; x.lineWidth = 1.8; x.stroke(); // the rims: shadowed, wet
      x.strokeStyle = 'rgba(150,60,54,0.3)'; x.lineWidth = 0.8; x.stroke();
      x.beginPath(); x.moveTo(ECX + E.inner * ERW * 0.8, ECY + ERW * E.round * oo * 0.42); x.quadraticCurveTo(ECX, ECY + ERW * E.round * oo * 0.78, ECX - E.inner * ERW * 0.75, ECY + ERW * E.round * oo * 0.3);
      x.strokeStyle = 'rgba(255,246,236,0.45)'; x.lineWidth = 1.2; x.stroke(); // the wet line along the lower lid
    }
    EYE_C.set(key, c); if (EYE_C.size > 140) { const k0 = EYE_C.keys().next().value; zap(EYE_C.get(k0)); EYE_C.delete(k0); }
    return c;
  }

  // ---- the mouth in one state (sp: how far it has spread, 1 a wide grin, 1.5 past all reason; open: the jaw dropped), in face units
  const TU = 0.135, TL = 0.115, GU = 0.03, GL = 0.026;
  const SZ = (t) => 0.3 + 0.7 * Math.pow(Math.max(0, 1 - t * t), 0.42); // the teeth smaller toward the corners
  const geo = (sp, open) => { const a = Math.min(sp, 1), b = Math.max(0, sp - 1); return { sp, open, hw: 0.12 + 0.48 * a + 0.5 * b, cl: 0.025 + 0.2 * a + 0.17 * b }; };
  const yU = (G, t) => -G.cl * (0.8 * t * t + 0.2 * Math.pow(t, 6)); // the upper gum line, the corners hooked up
  const dj = (G, t) => 0.55 * G.open * Math.pow(Math.max(0, 1 - t * t), 0.72) * (1 + 0.3 * t); // the jaw dropping, more on one side
  const yLt = (G, t) => yU(G, t) + TU * SZ(t) * 0.8 + dj(G, t);
  const yLg = (G, t) => yLt(G, t) + TL * SZ(t);
  const srcT = (t) => 0.5 + 0.5 * (0.45 * t + 0.55 * (2 / Math.PI) * Math.asin(clamp(t, -1, 1))); // crowding toward the corners
  const STR = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ t: (h2(k, 71) - 0.5) * 1.3, brk: 0.45 + h2(k, 72) * 0.7, dx: (h2(k, 73) - 0.5) * 0.16, th: 0.45 + h2(k, 74) * 0.55 }));
  const MOUTH = [new Map(), new Map()], MLIM = [30, 48], MSC = [256, 100], MSL = [46, 30];
  function mouthSprite(sp, open, tier) {
    const spq = Math.round(clamp(sp, 0, 1.6) * 16), oq = Math.round(clamp(open, 0, 1) * 8), key = spq * 16 + oq, M = MOUTH[tier];
    let m = M.get(key);
    if (m) { M.delete(key); M.set(key, m); return m; }
    m = buildMouth(geo(spq / 16, oq / 8), tier);
    M.set(key, m); if (M.size > MLIM[tier]) { const k0 = M.keys().next().value; zap(M.get(k0).c); M.delete(k0); }
    return m;
  }
  function buildMouth(G, tier) {
    base();
    const S = MSC[tier], K = MSL[tier], hw = G.hw, tipX = hw + 0.035 + 0.05 * G.sp, tipY = yU(G, 1) - 0.03 - 0.05 * G.sp;
    const lump = (t, k) => (vnoise(t * 9 + 20, k, 77) - 0.5) * 0.014; // the gums swollen, uneven
    const top = (t) => yU(G, t) - GU * SZ(t) + lump(t, 1), bot = (t) => yLg(G, t) + GL * SZ(t) + lump(t, 2);
    let yMax = 0; for (let k = 0; k <= 20; k++) { const t = -1 + k / 10; yMax = Math.max(yMax, bot(t)); }
    const x0 = -tipX - 0.04, y0 = tipY - 0.05 - GU, x1 = tipX + 0.04, y1 = yMax + 0.07;
    const c = mk((x1 - x0) * S, (y1 - y0) * S), x = c.getContext('2d');
    x.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
    const out = new Path2D(); out.moveTo(-tipX, tipY);
    for (let k = 0; k <= 48; k++) { const t = -1 + k / 24; out.lineTo(hw * t, top(t)); }
    out.lineTo(tipX, tipY);
    for (let k = 48; k >= 0; k--) { const t = -1 + k / 24; out.lineTo(hw * t, bot(t)); }
    out.closePath();
    const fl = x.createLinearGradient(0, y0, 0, y1); fl.addColorStop(0, 'rgb(52,10,12)'); fl.addColorStop(0.45, 'rgb(10,2,2)'); fl.addColorStop(1, 'rgb(40,8,9)'); // wet flesh, black down the throat
    x.fillStyle = fl; x.fill(out);
    x.save(); x.clip(out);
    const gy = yU(G, 0) + TU * 0.8 + dj(G, 0) * 0.5, ev = Math.max(0.15, dj(G, 0) / hw);
    const dark = (r, a) => { x.save(); x.translate(0, gy); x.scale(1, ev); const th = x.createRadialGradient(0, 0, 0, 0, 0, hw * r); th.addColorStop(0, `rgba(0,0,0,${a})`); th.addColorStop(0.6, `rgba(1,0,0,${a * 0.8})`); th.addColorStop(1, 'rgba(8,1,1,0)'); x.fillStyle = th; x.fillRect(-hw, -hw, hw * 2, hw * 2); x.restore(); };
    const row = (img, xk, yf, lenK, up) => { // a row of teeth laid along a curve, slice by slice, each slice turned square to it
      const SW = img.width, SH = img.height;
      for (let k = 0; k < K; k++) {
        const t0 = -1 + (2 * k) / K, t1 = t0 + 2 / K, tm = (t0 + t1) / 2, xa = hw * xk * t0, xb = hw * xk * t1, ya = yf(t0), yb = yf(t1);
        const sc = (lenK * SZ(tm)) / (TH - GR - 2), ang = Math.atan2(yb - ya, xb - xa) * 0.55, s0 = srcT(t0) * SW, s1 = srcT(t1) * SW, dw = (xb - xa) * 1.1;
        x.save(); x.translate((xa + xb) / 2, yf(tm)); x.rotate(ang);
        x.drawImage(img, s0, 0, s1 - s0, SH, -dw / 2, up ? -(SH - GR) * sc : -GR * sc, dw, SH * sc);
        x.restore();
      }
    };
    if (G.open > 0.04) { // further in, row after row of fangs going down into the dark
      dark(1, 0.95);
      row(B.inU, 0.6, (t) => yU(G, t * 0.6) + 0.07 + dj(G, t * 0.6) * 0.12, TU * 1.15, false);
      row(B.inL, 0.6, (t) => yLg(G, t * 0.6) - 0.07 - dj(G, t * 0.6) * 0.12, TL * 1.1, true);
      dark(0.75, 0.55);
      row(B.inU, 0.82, (t) => yU(G, t * 0.82) + 0.035, TU * 1.45, false);
      row(B.inL, 0.82, (t) => yLg(G, t * 0.82) - 0.035, TL * 1.35, true);
      x.lineCap = 'round';
      for (const s of STR) { // strings of spit between the jaws, stretching, snapping
        const ta = s.t, tb = clamp(s.t + s.dx, -0.95, 0.95), xa = hw * ta, ya = yU(G, ta) + TU * SZ(ta) * 0.68, xb = hw * tb, yb = yLt(G, tb) + TL * SZ(tb) * 0.25;
        if (G.open < s.brk) {
          const sag = 0.012 + 0.06 * G.open, lw = 0.0085 * s.th * (1.25 - (0.75 * G.open) / s.brk);
          x.beginPath(); x.moveTo(xa, ya); x.quadraticCurveTo((xa + xb) / 2 + s.dx * 0.4, (ya + yb) / 2 + sag, xb, yb);
          x.strokeStyle = 'rgba(206,196,166,0.45)'; x.lineWidth = lw; x.stroke();
          x.strokeStyle = 'rgba(255,252,236,0.62)'; x.lineWidth = lw * 0.35; x.stroke();
        } else {
          const l = 0.025 + 0.05 * s.th + 0.06 * (G.open - s.brk);
          x.beginPath(); x.moveTo(xa, ya); x.quadraticCurveTo(xa + 0.006, ya + l * 0.6, xa + 0.004, ya + l);
          x.strokeStyle = 'rgba(214,204,174,0.5)'; x.lineWidth = 0.0055 * s.th; x.stroke();
          x.fillStyle = 'rgba(236,230,206,0.62)'; x.beginPath(); x.ellipse(xa + 0.004, ya + l, 0.005 * s.th + 0.002, 0.007 * s.th + 0.002, 0, 0, TAU); x.fill();
          x.beginPath(); x.moveTo(xb, yb); x.lineTo(xb - 0.003, yb - 0.012 * s.th); x.stroke();
        }
      }
    }
    const band = (fa, fb, c0, c1) => { // gums
      x.beginPath();
      for (let k = 0; k <= 48; k++) { const t = -1 + k / 24; x.lineTo(hw * t, fa(t)); }
      for (let k = 48; k >= 0; k--) { const t = -1 + k / 24; x.lineTo(hw * t, fb(t)); }
      x.closePath(); const gr = x.createLinearGradient(0, fa(0), 0, fb(0)); gr.addColorStop(0, c0); gr.addColorStop(1, c1); x.fillStyle = gr; x.fill();
    };
    band((t) => top(t) - 0.006, (t) => yU(G, t) + 0.018 * SZ(t), 'rgb(14,3,3)', 'rgb(72,18,22)');
    band((t) => yLg(G, t) - 0.018 * SZ(t), (t) => bot(t) + 0.006, 'rgb(66,16,20)', 'rgb(12,2,3)');
    row(B.up, 1, (t) => yU(G, t), TU, false);
    row(B.lo, 1, (t) => yLg(G, t), TL, true);
    const R = rng(tier * 7 + Math.round(G.sp * 16) * 3 + 1); // wet glints on the gums
    for (let k = 0; k < 26; k++) {
      const t = R() * 2 - 1, up = R() < 0.6, y = up ? yU(G, t) - GU * SZ(t) * (0.2 + 0.5 * R()) : yLg(G, t) + GL * SZ(t) * (0.2 + 0.5 * R());
      x.fillStyle = `rgba(255,214,200,${0.18 + 0.3 * R()})`; x.beginPath(); x.ellipse(hw * t, y, 0.004 + 0.008 * R(), 0.0025, Math.atan(-2 * G.cl * t / hw) * 0.6, 0, TAU); x.fill();
    }
    x.restore();
    x.globalCompositeOperation = 'destination-out'; // its edge going soft into the dark: no lips, nothing round it
    for (const [w, a] of [[0.036, 0.2], [0.022, 0.3], [0.01, 0.45]]) { x.strokeStyle = `rgba(0,0,0,${a})`; x.lineWidth = w; x.stroke(out); }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; // the corners going off into the dark
    const fd = x.createLinearGradient(0, 0, c.width, 0);
    for (const [o, a] of [[0, 0.2], [0.12, 0.72], [0.3, 1], [0.7, 1], [0.88, 0.72], [1, 0.2]]) fd.addColorStop(o, `rgba(0,0,0,${a})`);
    x.fillStyle = fd; x.fillRect(0, 0, c.width, c.height);
    return { c, x0, y0, w: x1 - x0, h: y1 - y0, hw };
  }

  // ================================================================ the face, drawn
  const EYE_P = [{ i: 0, x: -0.215, y: -0.37, k: 0.84, rot: 0.13 }, { i: 1, x: 0.255, y: -0.53, k: 1.2, rot: -0.2 }];
  const EHW = 0.172; // an eye's half width (face units)
  const newFace = () => ({ eL: 0, eR: 0, pup: 1, pR: null, lx: 0, ly: 0, sp: 0, open: 0, tilt: 0, tw: 0, twI: 0, twX: 0, twY: 0, dk: 1 });
  /** A face (parts: 1 the eyes, 2 the grin) under the screen basis A (px per face unit along its right u and its down v,
   * origin at the middle of the upper gum line), at strength op. */
  function face(g, A, f, op, parts) {
    if (op < 0.01) return;
    const ctx = g.ctx, L = g.L, G = geo(f.sp, f.open), eyes = parts & 1 && (f.eL > 0.02 || f.eR > 0.02), mouth = parts & 2 && f.sp > 0.03, lite = parts & 4; // lite: one of many (the swarm)
    if (!eyes && !mouth) return;
    ctx.save(); ctx.transform(A.ux, A.uy, A.vx, A.vy, A.x, A.y);
    let bx0 = -0.62, bx1 = 0.66, by0 = -0.98, by1 = 0.05; // the dark round it, deeper than the room's
    if (mouth) { bx0 = Math.min(bx0, -G.hw - 0.45); bx1 = Math.max(bx1, G.hw + 0.45); by1 = 0.55 + 0.55 * f.open; if (!eyes) by0 = -G.cl - 0.42; }
    ctx.globalCompositeOperation = L ? 'source-over' : 'destination-out'; ctx.globalAlpha = (L ? 0.95 : 0.9) * op * f.dk;
    ctx.drawImage(B.dark, bx0, by0, bx1 - bx0, by1 - by0);
    if (eyes && A.s > 110 && !lite) { ctx.globalAlpha = (L ? 0.7 : 0.8) * op * f.dk; for (const E of EYE_P) ctx.drawImage(B.dark, E.x - 0.3 * E.k, E.y - 0.2 * E.k, 0.6 * E.k, 0.4 * E.k); }
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; // a faint cold glow bleeding into it
    if (eyes && A.s > 70 && !lite) for (const E of EYE_P) { const o = E.i ? f.eR : f.eL; if (o < 0.03) continue; ctx.globalAlpha = (L ? 0.3 : 0.6) * op * Math.min(1, o); ctx.drawImage(B.glow, E.x - 0.6 * E.k, E.y - 0.4 * E.k, 1.2 * E.k, 0.8 * E.k); }
    else if (eyes) { ctx.globalAlpha = (L ? 0.3 : 0.6) * op * Math.min(1, Math.max(f.eL, f.eR)); ctx.drawImage(B.glow, -0.75, -0.95, 1.5, 0.95); }
    if (mouth) { ctx.globalAlpha = (L ? 0.14 : 0.26) * op * Math.min(1, f.sp); ctx.drawImage(B.glow, -G.hw * 1.25, -G.cl - 0.18, G.hw * 2.5, G.cl + 0.5 + 0.5 * f.open); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = op;
    if (mouth) {
      const m = mouthSprite(f.sp, f.open, A.s * G.hw > 70 ? 0 : 1), kx = G.hw / m.hw;
      ctx.drawImage(m.c, m.x0 * kx, m.y0, m.w * kx, m.h);
    }
    if (eyes) for (const E of EYE_P) {
      const o = E.i ? f.eR : f.eL; if (o < 0.03) continue;
      const tw = f.tw > 0 && f.twI === E.i, sc = (EHW * E.k) / ERW;
      const spr = eyeSprite(E.i, tw ? o * 0.45 : o, E.i ? (f.pR != null ? f.pR : Math.min(1, f.pup * 0.45 + 0.42)) : f.pup, f.lx, f.ly);
      ctx.save(); ctx.translate(E.x + (tw ? f.twX : 0), E.y + (tw ? f.twY : 0)); ctx.rotate(E.rot + (tw ? f.twX * 3 : 0));
      ctx.drawImage(spr, -ECX * sc, -ECY * sc, EW * sc, EH * sc);
      if (!L && A.s > 90 && !lite) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 * op; ctx.drawImage(spr, -ECX * sc * 1.14, -ECY * sc * 1.2, EW * sc * 1.14, EH * sc * 1.2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = op; }
      ctx.restore();
    }
    ctx.restore();
  }
  /** Now and then one eye jumps and squeezes for a few frames. */
  function twitch(f, p) {
    if (f.tw > 0) { f.tw--; f.twX = (Math.random() - 0.5) * 0.03; f.twY = (Math.random() - 0.5) * 0.02; }
    else if (Math.random() < (p || 0.03)) { f.tw = 2 + ((Math.random() * 3) | 0); f.twI = Math.random() < 0.6 ? 1 : 0; }
  }

  /** The screen basis of a face standing up at (x, z), y (m), K metres a face unit, turned tilt, upside down if flip. */
  function bb(g, x, z, y, K, tilt, flip, mir) {
    if (!g.pr(x, z, y)) return null;
    const s = (g.f / g.sz) * K, k = flip ? -s : s, c = Math.cos(tilt || 0), n = Math.sin(tilt || 0), m = mir ? -1 : 1;
    return { x: g.sx, y: g.sy, ux: k * c * m, uy: k * n * m, vx: -k * n, vy: k * c, s, sz: g.sz };
  }
  /** The screen basis of a face lying in a plane hung from the ceiling, th (rad) down from it: upside down as we look up
   * at it (its right running to our left, its chin toward us and up). */
  function plane(g, x, z, y, K, th, tilt) {
    if (!g.pr(x, z, y)) return null;
    const ox = g.sx, oy = g.sy, sz = g.sz, h = 0.25;
    if (!g.pr(x - h, z, y)) return null;
    const ux = ((g.sx - ox) / h) * K, uy = ((g.sy - oy) / h) * K;
    if (!g.pr(x, z - Math.cos(th) * h, y + Math.sin(th) * h)) return null;
    const vx = ((g.sx - ox) / h) * K, vy = ((g.sy - oy) / h) * K, c = Math.cos(tilt), n = Math.sin(tilt);
    return { x: ox, y: oy, ux: ux * c + vx * n, uy: uy * c + vy * n, vx: vx * c - ux * n, vy: vy * c - uy * n, s: Math.hypot(ux, uy), sz };
  }

  // ---- a room gone dark: its surfaces worn away to the page (a dark theme) or shaded deep (a light one), deepening
  // toward its far end, a little of it spilling out onto the floor and ceiling in front of it
  const PX = new Float64Array(8), PY = new Float64Array(8);
  const crs = (o, a, b) => (PX[a] - PX[o]) * (PY[b] - PY[o]) - (PY[a] - PY[o]) * (PX[b] - PX[o]);
  function hull(g, x0, x1, z0, z1, y0, y1) {
    const zmin = g.camZ + 0.32 + Math.max(Math.abs(x0 - g.camX), Math.abs(x1 - g.camX)) * 0.17;
    if (z1 <= zmin + 0.05) return false;
    if (z0 < zmin) z0 = zmin;
    let n = 0;
    for (let k = 0; k < 8; k++) if (g.pr(k & 1 ? x1 : x0, k & 4 ? z1 : z0, k & 2 ? y1 : y0)) { PX[n] = g.sx; PY[n] = g.sy; n++; }
    if (n < 3) return false;
    const idx = []; for (let k = 0; k < n; k++) idx.push(k);
    idx.sort((a, b) => PX[a] - PX[b] || PY[a] - PY[b]);
    const H = [];
    for (const i of idx) { while (H.length >= 2 && crs(H[H.length - 2], H[H.length - 1], i) <= 0) H.pop(); H.push(i); }
    for (let k = idx.length - 2, lo = H.length + 1; k >= 0; k--) { const i = idx[k]; while (H.length >= lo && crs(H[H.length - 2], H[H.length - 1], i) <= 0) H.pop(); H.push(i); }
    H.pop();
    const ctx = g.ctx; ctx.beginPath(); ctx.moveTo(PX[H[0]], PY[H[0]]);
    for (let k = 1; k < H.length; k++) ctx.lineTo(PX[H[k]], PY[H[k]]);
    ctx.closePath();
    return true;
  }
  /** Cut a hole out of the path being built: an opening (four corners in the plan, x z y), left alone if any is behind us. */
  function hole(g, pts) {
    const ctx = g.ctx; let n = 0;
    for (const [x, z, y] of pts) { if (!g.pr(x, z, y)) return; PX[n] = g.sx; PY[n] = g.sy; n++; }
    ctx.moveTo(PX[0], PY[0]); for (let k = 1; k < n; k++) ctx.lineTo(PX[k], PY[k]); ctx.closePath();
  }
  const STEPS = [[-0.85, 0.2, 0.32], [-0.3, 0.3, 0.45], [0.45, 0.36, 0.55], [1.5, 0.45, 0.66]], STEPS_F = [[-0.3, 0.44, 0.62], [1.2, 0.6, 0.78]];
  /** A room gone dark (a of the way): its own walls, floor and ceiling, not what is seen through its openings (another
   * room's dark is its own business, and whatever stands beyond must not be worn away with it). */
  function roomDark(g, i, j, a, BR) {
    if (a < 0.02) return;
    const C = BR.C, HC = BR.HC, LN = BR.LINTEL, ctx = g.ctx, L = g.L, x0 = (i - 0.5) * C, x1 = (i + 0.5) * C, z0 = j * C, z1 = z0 + C;
    ctx.globalCompositeOperation = L ? 'source-over' : 'destination-out';
    const farR = z0 - g.camZ > 8.5;
    for (const [d, aD, aL] of farR ? STEPS_F : STEPS) {
      const al = L ? aL : aD;
      if (i === 0) {
        if (!hull(g, x0 - 0.02, x1 + 0.02, z0 + d, z1 + 0.02, -0.02, HC + 0.02)) continue;
        const zm = Math.max(z0 + Math.max(0, d), g.camZ + 0.32 + 1.8 * 0.17 + Math.abs(g.camX) * 0.17), fw = g.cr(j, 0);
        if (fw === 0) hole(g, [[x0, z1, 0], [x1, z1, 0], [x1, z1, HC], [x0, z1, HC]]);
        else if (fw === 2) hole(g, [[-0.85, z1, 0], [0.85, z1, 0], [0.85, z1, LN], [-0.85, z1, LN]]);
        for (const [e, xw] of [[0, x0], [1, x1]]) {
          const sw = g.sd(j, e);
          if (sw === 0 && z1 > zm + 0.05) hole(g, [[xw, zm, 0], [xw, z1, 0], [xw, z1, HC], [xw, zm, HC]]);
          else if (sw === 2) { const za = Math.max(zm, z0 + C / 2 - 0.525), zb = z0 + C / 2 + 0.525; if (zb > za + 0.05) hole(g, [[xw, za, 0], [xw, zb, 0], [xw, zb, LN], [xw, za, LN]]); }
        }
        ctx.fillStyle = L ? `rgba(8,5,2,${al * a})` : `rgba(0,0,0,${al * a})`; ctx.fill('evenodd');
      } else {
        const dd = Math.max(d, -0.3); // (a side room's dark only just spills out into the hall)
        if (!hull(g, i > 0 ? x0 + dd : x0, i > 0 ? x1 : x1 - dd, z0 + Math.max(0, dd) * 0.5, z1, -0.02, HC + 0.02)) continue;
        ctx.fillStyle = L ? `rgba(8,5,2,${al * a})` : `rgba(0,0,0,${al * a})`; ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ================================================================ where it can be, and what it does
  const C = () => window.BR.C;
  function rows(g, a, b, ok, at) { // rows ahead whose point (at: along the row, 0.5 its middle) is a..b m off
    if (g.loose) { a *= 0.75; b *= 1.5; }
    const o = [];
    for (let j = g.j0 + 1; j < g.j0 + 8; j++) { const d = (j + (at == null ? 0.5 : at)) * C() - g.camZ; if (d >= a && d <= b && (!ok || ok(j))) o.push(j); }
    return o;
  }
  /** Mouth sprites a visit will want soon, made ahead while it is still dark (two a frame). */
  function warm(e) {
    if (!warmBase(4)) return;
    for (let n = 0; n < 2 && e.warm && e.warm.length; n++) { const [sp, op, tier] = e.warm.shift(); mouthSprite(sp, op, tier); }
  }
  /** Stop-motion: progress x (0..1) held, then snapped on, in n jerks. */
  const jk = (x, n) => Math.floor(x * n + 1e-6) / n;
  const lerp = (a, b, t) => a + (b - a) * t;
  const steps = (to, n, open, on, tier) => { const o = []; for (let k = 1; k <= n; k++) o.push([(to * k) / n, 0, tier]); for (let k = 1; k <= on; k++) o.push([to, (open * k) / on, tier]); return o; };

  const V = {};

  // ---- hall: the tubes die toward us one by one; in the dark it opens; each time the tube over it tries to come back it
  // is gone, and when the tube gives up it is nearer; the jaw unhinges; it snaps shut; the lights stutter back on nothing
  V.hall = {
    place(g, BR) {
      const o = rows(g, 7, 9.8); if (!o.length) return null;
      const J = pick(o), jN = Math.min(J, BR.ROW(g.camZ + 3.3));
      return { J, jN, x: (Math.random() - 0.5) * 0.5, z: (J + 0.5) * BR.C + 0.3, y: 1.5, dir: Math.random() < 0.5 ? -1 : 1, life: 252, f: newFace(),
        warm: steps(1, 5, 0, 0, 0).concat(steps(1.48, 1, 0, 0, 0), [[1.24, 0, 0], [1.36, 0, 0]], steps(1.48, 1, 1, 3, 0)) };
    },
    step(e, g, st, BR) {
      const a = e.age, T = e.tt, f = e.f, jr = BR.ROW(e.z);
      e.cl = [];
      for (let j = e.J + 2, k = 0; j >= e.jN; j--, k++) { // the dark coming toward us, a tube at a time
        const t0 = k * 13;
        let v = a < t0 ? 1 : a < t0 + 12 ? BR.flick(a, k + 3) : 0;
        if (j === jr && ((a >= 136 && a < 145) || (a >= 166 && a < 176))) v = BR.flick(a, 11) > 0.5 ? 1 : 0.4; // the tube over it tries to come back
        if (a >= 224) v = a < 234 ? BR.flick(a + 1, k + 7) : 1;
        e.cl.push([0, j, v]);
      }
      if (a === 145) { e.z = g.camZ + 5.6; e.x = -e.x * 0.5 + (Math.random() - 0.5) * 0.3; BR.glitch(st, 3); } // when it gives up: nearer
      if (a === 176) { e.z = g.camZ + 3.45; e.x = -e.x * 0.5 + (Math.random() - 0.5) * 0.2; BR.glitch(st, 4); }
      const lit = (a >= 136 && a < 145) || (a >= 166 && a < 176) ? BR.flick(a, 11) > 0.5 : false; // in that light there is nothing there
      e.vis = a < 62 || a >= 222 || lit ? 0 : 1;
      f.eL = sm(64, 66, a) * (a >= 120 && a < 123 ? 0.05 : 1);
      f.eR = sm(79, 80, a) * (a > 126 && a < 136 ? 0.5 : 1); // the other opens late, and droops
      f.pup = 1 - 0.9 * sm(97, 99, a);
      const wd = 1 - sm(95, 96, a); // its eyes wander, then find us
      f.lx = wd * Math.sin(Math.floor(a / 7) * 1.7) * 0.95; f.ly = wd * (Math.cos(Math.floor(a / 9) * 2.3) * 0.7 - 0.3);
      f.sp = jk(sm(102, 166, T), 5) + 0.48 * jk(sm(178, 212, T), 4); // the grin spreading in jerks, then on past any face
      f.open = jk(sm(186, 200, T), 3) * (1 - sm(213, 214, a));
      f.tilt = jk(sm(150, 212, T), 5) * 0.5 * e.dir + Math.sin(T * 0.03) * 0.025;
      e.y = 1.36 + Math.sin(T * 0.018) * 0.07;
      if (a === 213) BR.glitch(st, 4); // the snap shut
      if (a === 222) st.flick = BR.DIP.length;
      twitch(f);
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
      const A = bb(g, e.x, e.z, e.y, 1.15, e.f.tilt); if (A) face(g, A, e.f, e.vis * BR.far(A.sz), 3);
    },
  };

  // ---- door: a side room goes dark as we come up to it; the eyes hang up under its ceiling, the grin opens down by the
  // floor, apart, both sliding along to keep us in sight (the grin dragging after); then the grin jerks up to the eyes and
  // the whole face lurches out at us, jaw dropping
  V.door = {
    place(g, BR) {
      const Cc = BR.C, clear = (j) => { for (let i = g.j0; i < j; i++) if (g.cr(i, 0) !== 0) return false; return true; }; // nothing across the hall between us and it
      const o = [];
      for (const j of rows(g, 3.2, 7.2, clear)) for (const s of [-1, 1]) { const ty = g.sd(j, s < 0 ? 0 : 1); if (ty === 0 || (ty === 2 && (j + 0.5) * Cc - g.camZ <= 6)) o.push([j, s, ty]); }
      const w = steps(1.1, 5, 0, 0, 0).concat(steps(1.45, 1, 0, 0, 0), steps(1.45, 1, 1, 3, 0));
      let e;
      if (o.length) { // a side room we can see into
        const op = o.filter((q) => q[2] === 0), [J, side, ty] = pick(op.length ? op : o);
        e = { J, side, ty, life: 230, f: newFace(), fm: newFace(), warm: w };
        if (ty === 0) Object.assign(e, { xf: Cc / 2 + 1.1, zcE: J * Cc + 0.62 * Cc, zcM: J * Cc + 0.4 * Cc, yE: 2.36, yM0: 0.6, K: 1.25 });
        else Object.assign(e, { xf: Cc / 2 + 0.5, zcE: (J + 0.5) * Cc + 0.1, zcM: (J + 0.5) * Cc - 0.15, yE: 1.92, yM0: 0.62, K: 1.0 });
      } else { // else the doorway ahead of us, the room beyond it gone dark
        const f = rows(g, 3.4, 6.6, (j) => g.cr(j - 1, 0) === 2, 0);
        if (!f.length) return null;
        const J = pick(f), x = (Math.random() - 0.5) * 0.3;
        e = { J, side: 0, ty: 3, life: 230, f: newFace(), fm: newFace(), warm: w, xf: x, zcE: J * Cc + 0.55, zcM: J * Cc + 1.0, yE: 2.03, yM0: 0.5, K: 1.05 };
      }
      e.x = e.side ? e.side * e.xf : e.xf; e.z = e.zE = e.zcE; e.zM = e.zcM; e.yM = e.yM0;
      return e;
    },
    step(e, g, st, BR) {
      const a = e.age, T = e.tt, s = e.side, f = e.f, m = e.fm;
      if (s) {
        const cx = g.camX * s, t = (e.xf - cx) / (BR.C / 2 - cx); // keep each part on the line from us through the opening
        const tE = g.camZ + (e.zcE - g.camZ) * t, tM = g.camZ + (e.zcM - g.camZ) * t;
        if (a <= 1) { e.zE = tE; e.zM = tM; }
        if (!e.hold) { e.zE += (tE - e.zE) * 0.3; e.zM += (tM - e.zM) * 0.05; } // the eyes keep us in sight; the grin drags after them
        e.x = s * e.xf;
      } else if (!e.hold) e.xE = Math.sin(T * 0.021) * 0.12; // in the doorway: swaying, a little out of step with itself
      e.z = e.zE;
      if (!e.end && (e.zcE - g.camZ < 1.5 || a >= 212)) e.end = a; // passed it, or done
      const end = e.end || 1e9, b = a - end, J = e.J, rm = a < 16 ? BR.flick(a, 5) : b < 0 ? 0 : b < 10 ? BR.flick(a, 2) : 1;
      e.cl = s ? [[s, J, rm], [s, J + 1, b < 0 ? 0.35 : 1], [s, J - 1, b < 0 ? 0.65 : 1], [0, J, b < 0 ? 0.8 : 1]] : [[0, J, rm], [0, J + 1, b < 0 ? 0.2 : 1], [0, J - 1, b < 0 ? 0.7 : 1]];
      e.life = Math.min(230, end + 14);
      e.vis = a < 22 || b >= 0 ? 0 : 1;
      f.eL = sm(26, 27, a); f.eR = sm(31, 32, a);
      f.pup = 1 - 0.9 * sm(50, 52, a);
      const wd = 1 - sm(48, 49, a); f.lx = wd * (0.9 * -(s || 1) + Math.sin(Math.floor(a / 6) * 2.1) * 0.25); f.ly = wd * -0.7;
      f.tilt = -(s || 1) * jk(sm(80, 186, T), 4) * 0.34 + Math.sin(T * 0.04) * 0.03; // the head cocking as we come
      m.sp = jk(sm(60, 140, T), 5) * 1.1 + jk(sm(150, 190, T), 3) * 0.35;
      m.open = a < 194 ? jk(sm(160, 176, T), 3) * 0.55 : 0.55 + 0.45 * jk(sm(199, 206, a), 2);
      m.tilt = (s || 1) * jk(sm(100, 190, T), 3) * 0.24 + Math.sin(T * 0.031 + 1) * 0.04;
      const up = jk(sm(194, 197, a), 3); // the grin jerks up to the eyes; the whole face lurches out at us
      e.yM = lerp(e.yM0, e.yE - 0.46 * e.K, up); e.lur = jk(sm(198, 201, a), 2);
      if (a === 194) BR.glitch(st, 4);
      if (e.end === a) { st.flick = BR.DIP.length; BR.glitch(st, 3); }
      twitch(f, 0.04);
    },
    draw(e, g, j, c, BR) {
      const s = e.side, lur = e.lur || 0, K = e.K * (1 + 0.38 * lur), f = e.f, m = e.fm;
      const zE = s ? e.zE : lerp(e.zE, e.J * BR.C - 0.5, lur), x = s ? s * lerp(e.xf, BR.C / 2 + 0.25, lur) : e.xf + (e.xE || 0);
      if (s ? c !== s || j !== e.J : c !== 0 || j !== BR.ROW(zE)) return;
      if (e.yM >= e.yE - 0.46 * e.K - 0.01) { // one face now
        f.sp = m.sp; f.open = m.open;
        const A = bb(g, x, zE, e.yE - 0.46 * K, K, f.tilt * 0.5); if (A) face(g, A, f, e.vis * BR.far(A.sz), 3);
        return;
      }
      const M = bb(g, s ? x : e.xf - (e.xE || 0) * 0.6, lerp(e.zM, zE, (e.yM - e.yM0) / Math.max(0.1, e.yE - 0.46 * e.K - e.yM0)), e.yM, K, m.tilt);
      if (M) face(g, M, m, e.vis * BR.far(M.sz), 2);
      const A = bb(g, x, zE, e.yE - 0.46 * K, K, f.tilt); if (A) face(g, A, f, e.vis * BR.far(A.sz), 1);
    },
  };

  // ---- closer: each stutter it is a room nearer, its grin wider, its head at another angle; at the last the pupils blow
  // wide and black and the jaw drops; then every light snaps on, too bright, and it is gone
  const CD = [13, 9.6, 6.6, 3.7], CSP = [0.6, 0.94, 1.22, 1.5], CTL = [0.12, -0.3, 0.44, -0.24], CSL = 56, CT0 = 12;
  V.closer = {
    place(g, BR) {
      const w = [];
      for (let k = 0; k < 4; k++) { w.push([lerp(k ? CSP[k - 1] : 0, CSP[k], 1 / 3), 0, 0], [lerp(k ? CSP[k - 1] : 0, CSP[k], 2 / 3), 0, 0], [CSP[k], 0, 0]); }
      w.push([1.22, 0.32 / 3, 0], [1.22, 0.64 / 3, 0], [1.22, 0.32, 0], [1.5, 1 / 3, 0], [1.5, 2 / 3, 0], [1.5, 1, 0]);
      return { stage: -1, x: 0, z: g.camZ + CD[0], life: CT0 + 4 * CSL + 20, f: newFace(), sp0: 0, warm: w };
    },
    step(e, g, st, BR) {
      const a = e.age, f = e.f, end = CT0 + 4 * CSL, k = a < CT0 ? -1 : Math.min(3, ((a - CT0) / CSL) | 0), b = a - CT0 - Math.max(0, k) * CSL;
      if (k >= 0 && k !== e.stage && a < end) { e.sp0 = f.sp; e.stage = k; e.z = g.camZ + CD[k]; e.x = (k % 2 ? 1 : -1) * (0.1 + Math.random() * 0.2); st.flick = BR.DIP.length; BR.glitch(st, 2 + k); }
      if (a < end && !e.hold) e.z -= 0.005; // and between, creeping
      const jr = BR.ROW(e.z);
      if (a < CT0) e.cl = [[0, BR.ROW(g.camZ + CD[0]), BR.flick(a, 4)]];
      else if (a < end) e.cl = [[0, jr + 1, 0.45], [0, jr, 0], [0, jr - 1, k === 3 ? 0.3 : 0.6]];
      else { e.cl = []; for (let j = g.j0; j <= g.j0 + 5; j++) e.cl.push([0, j, a < end + 9 ? 1.3 : 1]); } // every light on, too bright
      e.vis = k < 0 || a >= end ? 0 : b < 7 ? 0 : 1;
      f.eL = sm(6, 7, b); f.eR = sm(9, 10, b);
      f.pup = k === 3 ? 0.1 + 0.9 * jk(sm(24, 27, b), 2) : 0.1; // at the last the pupils blow wide, black
      f.lx = 0; f.ly = 0;
      f.sp = lerp(e.sp0, CSP[Math.max(0, k)], jk(sm(9, 30, b), 3));
      f.open = k === 2 ? 0.32 * jk(sm(24, 40, b), 3) : k === 3 ? jk(sm(12, 30, b), 3) : 0;
      f.tilt = CTL[Math.max(0, k)] + (Math.random() < 0.06 ? (Math.random() - 0.5) * 0.15 : 0);
      if (a === end) BR.glitch(st, 5);
      twitch(f, 0.05);
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
      const A = bb(g, e.x, e.z, 1.5 + Math.sin(e.tt * 0.02) * 0.05, 1.15, e.f.tilt); if (A) face(g, A, e.f, e.vis * BR.far(A.sz), 3);
    },
  };

  // ---- swarm: a far dark room fills with eyes and grins opening one after another, faster and faster; the lights stutter
  // and the whole of it is in the room in front of us; every head ticks over at once, every eye widens at once, and they
  // all shut at once
  const SWSP = [1, 1.19, 1.38];
  V.swarm = {
    place(g, BR) {
      const o = rows(g, 7.2, 10.5); if (!o.length) return null;
      const J = pick(o), Cc = BR.C, faces = [], cells = [];
      for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 4; cx++) cells.push([cx, cy]);
      cells.sort(() => Math.random() - 0.5);
      const n = 10 + ((Math.random() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const [cx, cy] = cells[k], dz = Math.random();
        faces.push({ x: -1.5 + (cx + 0.2 + Math.random() * 0.6) * 0.75, y: 0.45 + (cy + 0.15 + Math.random() * 0.7) * 0.6, dz, z: J * Cc + 0.5 + dz * 2.6, K: 0.6 + Math.random() * 0.28,
          t0: 34 + 104 * (1 - Math.pow(1 - k / n, 1.8)) + Math.random() * 5, dR: 1 + Math.random() * 5, spM: pick(SWSP), om: Math.random() < 0.45 ? pick([0.5, 0.75]) : 0,
          tilt0: (Math.random() - 0.5) * 0.7, flip: Math.random() < 0.14, mir: Math.random() < 0.5, lx0: Math.random() * 2 - 1, ly0: Math.random() * 2 - 1, f: newFace() });
      }
      for (let k = 0; k < 6; k++) faces.push({ eyesOnly: true, x: (Math.random() - 0.5) * 1.6, y: 0.6 + Math.random() * 1.4, z: (J + 1) * Cc + 0.6 + Math.random() * 2.4, K: 0.42 + Math.random() * 0.15,
        t0: 60 + Math.random() * 90, dR: Math.random() * 4, tilt0: (Math.random() - 0.5) * 0.5, flip: false, lx0: 0, ly0: 0, f: newFace() });
      faces.sort((p, q) => q.z - p.z);
      const w = [];
      for (const s of SWSP) for (let q = 1; q <= 4; q++) w.push([(s * q) / 4, 0, 1]);
      for (const s of SWSP) for (const om of [0.5, 0.75]) for (let q = 1; q <= 2; q++) w.push([s, (om * q) / 2, 1]);
      for (const s of SWSP) { w.push([s, 0, 0]); for (const om of [0.5, 0.75]) w.push([s, om, 0]); }
      return { J, x: 0, z: (J + 0.5) * Cc, faces, life: 248, warm: w };
    },
    step(e, g, st, BR) {
      const a = e.age, T = e.tt, J = e.J;
      if (a === 148) { // the stutter: and it is all in the room in front of us
        st.flick = BR.DIP.length; BR.glitch(st, 5);
        const z0 = g.camZ + 2.7;
        e.jN = Math.min(J, BR.ROW(z0));
        for (const F of e.faces) if (!F.eyesOnly) { F.z = z0 + F.dz * 2.1; F.x *= 0.9; }
        e.faces.sort((p, q) => q.z - p.z);
      }
      const out = a < 230 ? 0 : a < 240 ? BR.flick(a, 3) : 1;
      e.cl = [[0, J + 2, a < 230 ? 0.25 : 1], [0, J + 1, a < 8 ? BR.flick(a, 6) : out], [0, J, a < 14 ? 1 : a < 28 ? BR.flick(a, 9) : out]];
      if (e.jN != null) for (let j = e.jN; j < J; j++) e.cl.push([0, j, a < 156 ? BR.flick(a, j & 7) : out]);
      else e.cl.push([0, J - 1, 0.7]);
      e.vis = a >= 30 && a < 230 && !(a >= 148 && a < 154) ? 1 : 0;
      const shut = 1 - sm(218, 219, a), wide = 1 + 0.14 * sm(201, 202, a); // every eye widens at once; every one shuts at once
      const sync = (a >= 166 ? 0.36 : 0) - (a >= 182 ? 0.62 : 0) + (a >= 198 ? 0.5 : 0); // every head ticks over at once
      for (const F of e.faces) {
        const t = (a < 148 ? a : T) - F.t0, f = F.f;
        f.eL = sm(0, 2, t) * shut * wide; f.eR = sm(F.dR, F.dR + 2, t) * shut * wide;
        f.pup = 1 - 0.88 * jk(sm(8, 12, t), 2); const wd = 1 - sm(9, 10, t); f.lx = F.lx0 * wd; f.ly = F.ly0 * wd;
        if (!F.eyesOnly) { f.sp = jk(sm(8, 56, t), 4) * F.spM * (1 - sm(218, 220, a)); f.open = jk(sm(50, 70, t), 2) * F.om * (1 - sm(216, 218, a)); }
        f.tilt = F.tilt0 + sync;
        twitch(f, 0.012);
      }
      if (a === 218) { BR.glitch(st, 4); st.flick = BR.DIP.length; }
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || !e.vis) return;
      for (const F of e.faces) {
        if (BR.ROW(F.z) !== j || (F.f.eL < 0.02 && F.f.eR < 0.02 && F.f.sp < 0.03) || (F.eyesOnly && e.jN != null)) continue;
        const A = bb(g, F.x, F.z, F.y, F.K, F.f.tilt, F.flip, F.mir); if (A) face(g, A, F.f, e.vis * BR.far(A.sz), F.eyesOnly ? 5 : 7);
      }
    },
  };

  // ---- ceiling: under a dead tube a grin opens upside down in the tiles, the eyes below it; it slides toward us over the
  // tiles in jerks, each tube it passes under dying, peeling down off the ceiling until it hangs facing us; the jaw drops open, upward
  V.ceiling = {
    place(g, BR) {
      let zw = 1e9; for (let j = g.j0; j < g.j0 + 8; j++) if (g.cr(j, 0) !== 0) { zw = (j + 1) * BR.C; break; } // the first lintel across the hall
      let z0 = Math.min(g.camZ + 8.6, zw - 0.4), over = false;
      if (z0 - g.camZ < 4.6) { z0 = g.camZ + 6.8; over = true; } // a lintel too near: it opens beyond it and comes over it
      const J = BR.ROW(z0);
      return { J, over, x: (Math.random() - 0.5) * 0.6, z: z0, z0, th: 0.16, life: 250, f: newFace(), dark: {}, warm: steps(0.9, 3, 0, 0, 0).concat(steps(1.4, 1, 0, 0, 0), [[1.15, 0, 0]], steps(1.4, 1, 1, 3, 0)) };
    },
    step(e, g, st, BR) {
      const a = e.age, T = e.tt, f = e.f, J = e.J, sl = jk(sm(80, 196, T), 7);
      e.z = lerp(e.z0, g.camZ + 2.9, sl); // sliding toward us in jerks
      e.th = 0.16 + 1.1 * jk(sm(92, 204, T), 6); // and peeling down off the ceiling until it hangs facing us
      const jr = BR.ROW(e.z);
      if (e.dark[jr] == null) e.dark[jr] = a; // each tube it slides under dies
      const back = a >= 226;
      e.cl = [[0, J + 1, back ? 1 : 0.5]];
      for (let j = Math.min(jr, J); j <= J; j++) { const t = a - (e.dark[j] == null ? a : e.dark[j]); e.cl.push([0, j, back ? (a < 236 ? BR.flick(a, j & 7) : 1) : t < 12 ? BR.flick(a, (j & 7) + 2) : 0]); }
      if (jr > g.j0 && !back) e.cl.push([0, jr - 1, 0.6]);
      e.vis = a < 22 || a >= 224 ? 0 : 1;
      f.sp = jk(sm(24, 76, T), 3) * 0.9 + jk(sm(110, 200, T), 2) * 0.5;
      f.eL = sm(62, 63, a); f.eR = sm(68, 69, a);
      f.pup = 1 - 0.9 * sm(150, 152, a);
      const wd = 1 - sm(148, 149, a); f.lx = wd * Math.sin(Math.floor(a / 8) * 1.9) * 0.9; f.ly = wd * 0.7;
      f.open = jk(sm(196, 210, T), 3) * (1 - sm(216, 217, a));
      f.tilt = jk(sm(150, 212, T), 4) * 0.4 + Math.sin(T * 0.027) * 0.03;
      if (a === 216) BR.glitch(st, 4);
      if (a === 224) st.flick = BR.DIP.length;
      twitch(f);
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== (e.over ? g.j0 : BR.ROW(e.z)) || !e.vis) return;
      const K = 1.12, yc = BR.HC - 0.03 - (0.32 + 0.5 * e.f.open) * K * Math.sin(e.th);
      const A = plane(g, e.x, e.z, yc, K, e.th, e.f.tilt); if (A) face(g, A, e.f, e.vis * BR.far(A.sz), 3);
    },
  };

  // ================================================================ the hook
  const probe = { n: 0, d: 0, s: 0, mx: 0, cur: 0 }; // (window.SM_PROBE: timings, for the test harness)
  ENT.smiler = {
    mem, // (for the test harness)
    place(g, v, BR) {
      const want = v && V[v] ? [v] : VARS.filter((x) => x !== lastV).sort(() => Math.random() - 0.5);
      for (const k of want) {
        const e = V[k].place(g, BR);
        if (e) { e.own = true; e.v = k; e.tt = 0; if (e.x == null) e.x = 0; lastV = k; return e; }
      }
      return null;
    },
    step(e, g, st, BR) {
      if (!e.own || !V[e.v]) return;
      const t0 = window.SM_PROBE ? performance.now() : 0;
      if (window.SM_PROBE && e.age > 1) { probe.n++; probe.d += probe.cur; probe.mx = Math.max(probe.mx, probe.cur); probe.cur = 0; if (probe.n >= 30) { console.warn(`PROBE smiler ${e.v} age ${e.age} draw avg ${(probe.d / probe.n).toFixed(3)} max ${probe.mx.toFixed(2)} step avg ${(probe.s / probe.n).toFixed(3)} max ${probe.smx.toFixed(2)} mouths ${MOUTH[0].size}/${MOUTH[1].size} eyes ${EYE_C.size}`); probe.n = probe.d = probe.s = probe.mx = probe.smx = 0; } }
      touch();
      if (!B.done && !warmBase(5)) { e.age--; e.vis = 0; return; } // (its paint first, a few ms a frame: nothing shows until it is made)
      BR.tick(e, 0.025); // its own clock: now and then it stops, then catches up all at once
      warm(e);
      V[e.v].step(e, g, st, BR);
      if (e.age >= e.life) { zapAll(MOUTH[0]); zapAll(MOUTH[1]); zapAll(EYE_C); } // let them go until next time
      if (window.SM_PROBE) { const dt = performance.now() - t0; probe.s += dt; probe.smx = Math.max(probe.smx || 0, dt); }
    },
    draw(e, g, j, c, BR) {
      if (!e.own || !V[e.v]) return;
      const t0 = window.SM_PROBE ? performance.now() : 0;
      if (e.cl) for (const q of e.cl) if (q[0] === c && q[1] === j && q[2] < 0.97) roomDark(g, c, j, 1 - q[2], BR);
      if (e.vis) { base(); V[e.v].draw(e, g, j, c, BR); }
      if (window.SM_PROBE) probe.cur += performance.now() - t0;
    },
  };
})();
