'use strict';
/*
 * 노을: an evening at sea. The sky lies over the page in bands of haze (deep blue overhead, rose, then gold and
 * orange down to the horizon); the sun sinks toward the water, flattening as it nears it, and goes down behind the
 * sea; a headland with a lighthouse (lit once the sun is down) and a few islets stand in ink on the horizon, their
 * reflections under them. Three decks of cloud drift at their own pace: a high mackerel sky, a middle layer and
 * long low bands across the sun. Each was rendered once, per pixel, into a mask of its body and a mask of its lit
 * edges (undersides, thin parts, rims); the body is laid on as a dark belly and the lit edges are coloured every frame
 * from the sun outward, so the light on them follows the sun and the hour: gold, then orange, then pink and red on
 * the high clouds after the low ones have gone grey. A path of glitter runs across the water to the sun. Birds cross now and then, in a loose V or a string. Over some minutes
 * the light goes from golden hour through sunset and the afterglow to the blue hour, the evening star and then the
 * first stars come out, and the light comes back again.
 * On a light page it is a pastel evening: the haze in soft colours over the page, the sun a deep orange disc, the
 * clouds' bellies lavender and their edges gold and rose, stars a few pale points showing through the blue.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('sunset'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  /** A value from keyframes [[p, value], …] (values: numbers or arrays of numbers / arrays). */
  function key(frames, p) {
    if (p <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      if (p <= frames[i][0]) {
        const k = (p - frames[i - 1][0]) / (frames[i][0] - frames[i - 1][0]), a = frames[i - 1][1], b = frames[i][1];
        return typeof a === 'number' ? lerp(a, b, k) : a.map((v, j) => (typeof v === 'number' ? lerp(v, b[j], k) : mixc(v, b[j], k)));
      }
    }
    return frames[frames.length - 1][1];
  }

  /* ---------- the hour: p = 0 golden hour … 0.45 the sun goes down … 0.65 afterglow … 1 blue hour ---------- */

  const PERIOD = 9600; // frames (~5½ minutes at 30 fps)
  function hour(T) {
    const k = (((T % PERIOD) + PERIOD) % PERIOD) / PERIOD, e = (x) => x * x * (3 - 2 * x);
    if (k < 0.08) return 0;
    if (k < 0.56) return e((k - 0.08) / 0.48);
    if (k < 0.7) return 1;
    return 1 - e((k - 0.7) / 0.3);
  }
  const T_OF = (p) => { let best = 0, bd = 9; for (let T = 0; T < PERIOD * 0.56; T += 8) { const d = Math.abs(hour(T) - p); if (d < bd) { bd = d; best = T; } } return best; };

  // the sky's haze, top → horizon: [r, g, b, a] at 0, 0.4, 0.7, 0.88, 1 of the way down
  const SKY = {
    D: [
      [0, [[62, 84, 150, 0.15], [140, 128, 166, 0.11], [252, 188, 124, 0.2], [255, 198, 124, 0.32], [255, 208, 138, 0.44]]],
      [0.3, [[56, 64, 136, 0.18], [164, 110, 156, 0.14], [255, 156, 108, 0.25], [255, 166, 98, 0.4], [255, 188, 118, 0.5]]],
      [0.45, [[48, 50, 126, 0.2], [182, 96, 146, 0.17], [255, 124, 92, 0.31], [255, 122, 66, 0.45], [255, 156, 88, 0.54]]],
      [0.62, [[36, 38, 110, 0.22], [140, 72, 140, 0.16], [228, 96, 106, 0.24], [255, 106, 60, 0.37], [255, 138, 80, 0.44]]],
      [0.82, [[24, 28, 92, 0.24], [66, 48, 118, 0.15], [146, 68, 108, 0.13], [224, 98, 70, 0.22], [244, 128, 80, 0.28]]],
      [1, [[16, 22, 76, 0.26], [38, 38, 104, 0.16], [84, 60, 116, 0.1], [172, 88, 80, 0.13], [212, 118, 80, 0.17]]],
    ],
    L: [
      [0, [[150, 170, 222, 0.13], [205, 190, 218, 0.1], [255, 198, 158, 0.18], [255, 186, 136, 0.29], [255, 180, 126, 0.38]]],
      [0.3, [[140, 150, 216, 0.16], [220, 172, 206, 0.14], [255, 170, 136, 0.24], [255, 158, 108, 0.36], [255, 160, 104, 0.44]]],
      [0.45, [[124, 128, 206, 0.2], [228, 156, 198, 0.18], [255, 144, 126, 0.29], [255, 138, 94, 0.4], [255, 144, 96, 0.46]]],
      [0.62, [[108, 112, 196, 0.25], [196, 136, 202, 0.19], [246, 136, 140, 0.26], [255, 134, 96, 0.35], [255, 146, 106, 0.38]]],
      [0.82, [[88, 98, 184, 0.3], [130, 114, 192, 0.21], [200, 128, 162, 0.18], [245, 146, 116, 0.23], [250, 156, 118, 0.26]]],
      [1, [[76, 88, 174, 0.34], [98, 98, 182, 0.24], [150, 118, 172, 0.15], [230, 148, 128, 0.17], [240, 158, 128, 0.2]]],
    ],
  };
  const SKY_AT = [0, 0.4, 0.7, 0.88, 1];
  // the light on the clouds, from the sun outward: [r, g, b, strength] at 0, 0.3, 0.65, 1 of the way across
  const LIT = {
    D: [
      [0, [[255, 226, 160, 1], [255, 204, 138, 0.8], [244, 180, 148, 0.55], [206, 168, 176, 0.38]]],
      [0.3, [[255, 212, 144, 1], [255, 172, 104, 0.82], [250, 142, 122, 0.56], [210, 132, 152, 0.38]]],
      [0.45, [[255, 182, 104, 1], [255, 132, 84, 0.86], [245, 110, 122, 0.62], [200, 100, 152, 0.42]]],
      [0.62, [[255, 142, 84, 0.92], [250, 102, 94, 0.78], [222, 90, 132, 0.58], [172, 90, 152, 0.36]]],
      [0.82, [[220, 100, 84, 0.42], [190, 80, 102, 0.33], [150, 72, 122, 0.24], [112, 72, 132, 0.15]]],
      [1, [[150, 80, 92, 0.16], [120, 72, 102, 0.11], [92, 64, 112, 0.07], [72, 62, 112, 0.05]]],
    ],
    L: [
      [0, [[246, 182, 84, 0.9], [240, 162, 94, 0.72], [230, 152, 132, 0.5], [200, 160, 182, 0.34]]],
      [0.3, [[240, 152, 62, 0.9], [240, 132, 84, 0.76], [225, 122, 132, 0.55], [190, 130, 172, 0.38]]],
      [0.45, [[236, 122, 52, 0.92], [230, 102, 82, 0.8], [215, 96, 132, 0.6], [170, 100, 172, 0.4]]],
      [0.62, [[230, 102, 62, 0.82], [215, 86, 102, 0.7], [190, 86, 142, 0.5], [150, 96, 166, 0.34]]],
      [0.82, [[200, 100, 92, 0.4], [170, 92, 122, 0.32], [140, 92, 152, 0.24], [120, 100, 162, 0.15]]],
      [1, [[150, 100, 132, 0.15], [130, 100, 152, 0.12], [115, 106, 162, 0.08], [110, 110, 172, 0.05]]],
    ],
  };
  const SUN = { D: [[0, [255, 216, 136]], [0.28, [255, 190, 104]], [0.4, [255, 150, 78]], [0.47, [255, 114, 58]]], L: [[0, [255, 186, 86]], [0.28, [252, 158, 60]], [0.4, [244, 118, 48]], [0.47, [232, 92, 44]]] };
  const sunAlt = (p) => 3.3 - 9.4 * p; // in sun radii: on the horizon at p ≈ 0.35, gone at 0.46
  const glowOf = (p) => (p < 0.42 ? 1 : Math.max(0, 1 - (p - 0.42) / 0.5) ** 1.4); // the glow lingers into the afterglow

  /* ---------- cloud decks: masks rendered once (a few rows per frame), coloured every frame ---------- */

  const DECKS = [ // y0..y1: where the deck lies (of the sky's height); drift in px per frame (at u 700); keep: when it loses the light
    { TW: 1536, TH: 168, seed: 41, px: 9, py: 6, lo: 0.53, hi: 0.7, warp: 1.4, rip: 0.26, cov: 0.44, env: [[0.5, 0.5, 1]], y0: 0.03, y1: 0.37, drift: 0.028, amax: 0.82, d: 3, keep: [0.66, 0.32] },
    { TW: 1536, TH: 168, seed: 77, px: 7, py: 4, lo: 0.51, hi: 0.67, warp: 1.6, rip: 0.12, cov: 0.46, env: [[0.5, 0.42, 1]], y0: 0.33, y1: 0.61, drift: 0.05, amax: 0.9, d: 3, keep: [0.55, 0.25] },
    { TW: 1536, TH: 96, seed: 113, px: 4, py: 4, lo: 0.53, hi: 0.63, warp: 0.9, rip: 0, cov: 0.33, env: [[0.3, 0.13, 1], [0.7, 0.12, 0.9]], y0: 0.66, y1: 0.985, drift: 0.085, amax: 0.96, d: 2, keep: [0.47, 0.14] },
  ];
  const TEX = new Map();

  function* deckGen(o, s) {
    const TW = Math.max(16, Math.round(o.TW * s)), TH = Math.max(8, Math.round(o.TH * s)), A = new Float32Array(TW * TH);
    const f = K.fbm(o.seed, o.px, o.py, s < 0.5 ? 4 : 5), wp = K.fbm(o.seed + 3, Math.max(1, o.px >> 1), o.py, 2), cv = K.fbm(o.seed + 7, 3, 1, 2);
    const rp = o.rip ? K.fbm(o.seed + 5, o.px * 6, o.py * 4, 2) : null;
    for (let y = 0; y < TH; y++) {
      const v = (y + 0.5) / TH;
      let env = 0;
      for (const [c, wd, a] of o.env) env += a * Math.exp(-(((v - c) / wd) ** 2) * 2.2);
      env = Math.min(1, env) * sm(0, 0.16, v) * sm(1, 0.84, v); // nothing at the deck's top and bottom edges
      for (let x = 0; x < TW; x++) {
        let uu = (x / TW) * o.px, vv = v * o.py;
        uu += (wp(uu * 0.5, vv) - 0.5) * o.warp; vv += (wp(uu * 0.5 + 3.7, vv + 1.9) - 0.5) * o.warp * 0.35;
        let n = f(uu, vv);
        if (rp) n += (rp((x / TW) * o.px * 6, v * o.py * 4) - 0.5) * o.rip;
        const cover = sm(o.cov - 0.12, o.cov + 0.12, cv((x / TW) * 3, v));
        A[y * TW + x] = sm(o.lo, o.hi, n) * env * cover;
      }
      if (s < 0.5 ? (y & 7) === 7 : (y & 1) === 1) yield;
    }
    // the masks: the body, and the lit part (the underside, the thin and frayed parts, the edges)
    const mkMask = () => { const c = K.mk(TW, TH), x = c.getContext('2d'); return [c, x, x.createImageData(TW, TH)]; };
    const [dc, dx, di] = mkMask(), [lc, lx, li] = mkMask(), dd = di.data, ld = li.data, d = Math.max(1, Math.round(o.d * Math.max(0.5, s)));
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const k = y * TW + x, a = A[k];
        if (a < 0.004) continue;
        const below = y + d < TH ? A[k + d * TW] : 0, above = y - d >= 0 ? A[k - d * TW] : 0;
        const under = Math.max(0, (a - below) / Math.max(a, 0.08)), top = Math.max(0, (a - above) / Math.max(a, 0.08));
        const lit = Math.min(1, 0.22 + 1.1 * under + 0.45 * (1 - a) + 0.3 * top);
        const o4 = k * 4;
        dd[o4] = dd[o4 + 1] = dd[o4 + 2] = 255; dd[o4 + 3] = Math.round(Math.min(1, a ** 1.1 * o.amax) * 255);
        ld[o4] = ld[o4 + 1] = ld[o4 + 2] = 255; ld[o4 + 3] = Math.round(Math.min(1, a ** 0.8 * lit * o.amax * 1.15) * 255);
      }
      if ((y & 15) === 15) yield;
    }
    dx.putImageData(di, 0, 0); lx.putImageData(li, 0, 0);
    dc.__k = `ssDeck${o.seed}x${s}`; // for K.tint's cache
    return { dens: dc, lit: lc };
  }
  function deck(i, pv) {
    const k = `${i}${pv ? 'p' : ''}`;
    let j = TEX.get(k);
    if (!j) { j = { ready: false, gen: null }; j.gen = (function* () { const r = yield* deckGen(DECKS[i], pv ? 0.25 : 1); j.dens = r.dens; j.lit = r.lit; j.ready = true; })(); TEX.set(k, j); }
    return j;
  }
  function pump(ms, pv) {
    const t0 = performance.now();
    for (let i = 0; i < DECKS.length; i++) {
      const j = deck(i, pv);
      while (!j.ready && (pv || performance.now() - t0 < ms)) j.gen.next();
      if (!j.ready) return;
    }
  }

  /* ---------- sprites ---------- */

  function radial(keyS, size, stops) {
    if (K.cache.has(keyS)) return K.cache.get(keyS);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(keyS, c);
    return c;
  }
  const starSpr = (L) => radial(`ssStar|${L}`, 32, L
    ? [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.85)'], [0.28, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]
    : [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(236,240,255,0.9)'], [0.24, 'rgba(220,228,255,0.22)'], [0.5, 'rgba(220,228,255,0.04)'], [1, 'rgba(220,228,255,0)']]);
  /** A glint on the water: a short soft dash (white; tinted per colour, a few dozen at most over the cycle). */
  function dashSpr(c) {
    const q = c.map((v) => Math.round(v / 12) * 12), k = `ssDash|${q}`;
    if (K.cache.has(k)) return K.cache.get(k);
    const cv = K.mk(48, 6), x = cv.getContext('2d'), g = x.createRadialGradient(24, 3, 0, 24, 3, 24);
    g.addColorStop(0, rgba(q, 1)); g.addColorStop(0.35, rgba(q, 0.6)); g.addColorStop(1, rgba(q, 0));
    x.setTransform(1, 0, 0, 0.125, 0, 2.625); x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    K.cache.set(k, cv);
    return cv;
  }

  /* ---------- the still scenery: headland, islets and their reflections; the water's body ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(5309), q = bg.dpr || 1;
    const wy = Math.round(H * (pv ? 0.7 : 0.74)), xs = W * (pv ? 0.6 : 0.63), rs = Math.max(pv ? 3.2 : 9, u * 0.031);
    const y0 = Math.floor(wy - u * 0.12), lh = H - y0, [land, lc] = K.layer(W, lh, q);
    lc.translate(0, -y0);
    const inkFar = L ? [150, 140, 172] : [44, 36, 62], inkNear = L ? [98, 92, 124] : [10, 9, 20];
    const shape = (x0, x1, hgt, rough, seed, flat) => { // an island's top: rising from the water, a lumpy crest, falling again
      const N = 64, hts = K.ridge(K.rng(seed), N, rough), pts = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N, env = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) ** (flat || 0.55);
        pts.push([x0 + (x1 - x0) * k, wy - hgt * env * (0.72 + 0.28 * hts[i])]);
      }
      return pts;
    };
    const fillShape = (pts, col, a) => { lc.fillStyle = rgba(col, a); lc.beginPath(); lc.moveTo(pts[0][0], wy + 1); for (const [x, y] of pts) lc.lineTo(x, y); lc.lineTo(pts[pts.length - 1][0], wy + 1); lc.closePath(); lc.fill(); };
    // far islands, hazy, low on the horizon
    fillShape(shape(W * 0.18, W * 0.42, u * 0.018, 0.55, 11, 0.4), inkFar, 0.75);
    fillShape(shape(W * 0.8, W * 1.04, u * 0.022, 0.6, 12, 0.5), inkFar, 0.7);
    // the headland on the left, with a lower spur in front, and two islets right of the sun
    const head = shape(-W * 0.16, W * (pv ? 0.26 : 0.22), u * 0.075, 0.5, 13, 0.7); // it runs off the left edge, high
    fillShape(head, inkNear, 1);
    fillShape(shape(W * 0.12, W * 0.3, u * 0.03, 0.6, 14, 0.6), inkNear, 1);
    fillShape(shape(W * 0.735, W * 0.79, u * 0.024, 0.65, 15, 0.7), inkNear, 1);
    fillShape(shape(W * 0.785, W * 0.81, u * 0.012, 0.7, 16, 0.8), inkNear, 1);
    // trees along the headland's crest, too far for more than a roughness
    lc.fillStyle = rgba(inkNear, 1);
    for (let i = 4; i < head.length - 4; i++) {
      const [x, y] = head[i];
      for (let k = 0; k < 3; k++) { const r = u * (0.002 + R() * 0.003) * (pv ? 1.5 : 1); lc.beginPath(); lc.arc(x + (R() - 0.5) * (W * 0.3 / 64), y + r * 0.6, r, 0, TAU); lc.fill(); }
    }
    // a lighthouse on the headland's spur
    const lhx = W * 0.27, lhb = wy - u * 0.01, th = u * 0.026, b0 = u * 0.0042, b1 = u * 0.0027;
    lc.beginPath(); lc.moveTo(lhx - b0, lhb + 2); lc.lineTo(lhx - b1, lhb - th); lc.lineTo(lhx + b1, lhb - th); lc.lineTo(lhx + b0, lhb + 2); lc.closePath(); lc.fill(); // the tapering tower
    lc.fillRect(lhx - b1 * 1.6, lhb - th - u * 0.0012, b1 * 3.2, u * 0.0014); // its gallery
    lc.fillRect(lhx - b1 * 0.55, lhb - th - u * 0.0052, b1 * 0.25, u * 0.0042); lc.fillRect(lhx + b1 * 0.3, lhb - th - u * 0.0052, b1 * 0.25, u * 0.0042); // the lantern's frame
    lc.beginPath(); lc.moveTo(lhx - b1 * 0.85, lhb - th - u * 0.005); lc.lineTo(lhx, lhb - th - u * 0.0085); lc.lineTo(lhx + b1 * 0.85, lhb - th - u * 0.005); lc.closePath(); lc.fill(); // its cap
    // the reflections: the land upside down, shortened and fading into the water
    const [refl, rc] = K.layer(W, lh, q);
    rc.translate(0, -y0);
    rc.save(); rc.translate(0, wy * 1.65 + 1); rc.scale(1, -0.65); rc.drawImage(land, 0, y0, W, lh); rc.restore(); // y' = wy + (wy - y) · 0.65
    rc.globalCompositeOperation = 'destination-in'; // (clears everything outside the water too)
    const fg = rc.createLinearGradient(0, wy, 0, wy + u * 0.06); fg.addColorStop(0, 'rgba(0,0,0,0.75)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    rc.fillStyle = fg; rc.fillRect(0, wy, W, H - wy);
    const stars = [];
    const n = pv ? 14 : 110;
    for (let i = 0; i < n; i++) { const m = R(); stars.push({ x: R() * W, y: R() ** 1.3 * wy * 0.62, th: 0.62 + 0.36 * m, s: (pv ? 3 : 4.5) + (1 - m) * (pv ? 2 : 5), a: 0.35 + 0.55 * (1 - m), ph: R() * TAU, f: 0.05 + R() * 0.08 }); }
    stars.push({ x: xs - W * 0.17, y: wy - (wy * 0.3), th: 0.48, s: pv ? 6 : 13, a: 1, ph: 0, f: 0.02, planet: true }); // the evening star, low in the west
    const swells = Array.from({ length: pv ? 5 : 32 }, (_, i) => ({ k: (i + 0.5 + (R() - 0.5) * 0.6) / (pv ? 5 : 32), x: R() * W, len: 0.08 + R() * 0.3, sp: (R() - 0.5) * 0.12, a: 0.5 + R() * 0.5 }));
    const [scr, scx] = K.layer(W, wy, q);
    return { wy, xs, rs, y0, lh, land, refl, stars, swells, scr, scx, lhx, lhy: lhb - th - u * 0.0031, sq: scr.width / W };
  }

  function init(V, S) {
    return { kind: 'sunset', key: S.key, T: T_OF(0.22), birds: [], flockIn: V.pv ? 9999 : 260 + RND() * 300, ink: null };
  }

  /** A flock comes over: a loose V or a string, flapping out of step, now and then gliding. */
  function flock(st, V, S) {
    const { W, u } = V, dir = RND() < 0.5 ? 1 : -1, n = 3 + ((RND() * 7) | 0), s = u * (0.006 + RND() * 0.006), vee = RND() < 0.55;
    const y = S.wy * (0.22 + RND() * 0.42), v = u * (0.0016 + RND() * 0.001), x0 = dir > 0 ? -u * 0.08 : W + u * 0.08;
    for (let i = 0; i < n; i++) {
      const rank = vee ? Math.ceil(i / 2) : i, side = vee ? (i % 2 ? 1 : -1) : 0.25 * (RND() - 0.5);
      st.birds.push({ x: x0 - dir * rank * s * (vee ? 2.6 : 3.4) - dir * RND() * s, y: y + side * rank * s * (vee ? 1.5 : 1) + (RND() - 0.5) * s * 0.8, v: v * (0.97 + RND() * 0.06), dir, s: s * (0.85 + RND() * 0.3),
        ph: RND() * TAU, fs: 0.24 + RND() * 0.06, glide: 0, bob: RND() * TAU });
    }
  }

  window.BG_EXT.sunset = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.72, 1.7), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'sunset' || st.key !== S.key) { const T = st && st.kind === 'sunset' ? st.T : null; st = bg.st = init(V, S); if (T != null) st.T = T; }
    pump(5, pv);
    st.T++;
    const p = hour(st.T), M = L ? 'L' : 'D', add = L ? 'source-over' : 'lighter', k7 = u / 700;
    const { wy, xs, rs } = S, alt = sunAlt(p), flat = 1 - 0.16 * sm(2.5, 0, alt), sy = wy - alt * rs * flat, glow = glowOf(p);
    const sunC = key(SUN[M], p), gy = Math.max(sy, wy - rs * 0.4); // the glow stays on the horizon once the sun is down
    ctx.save(); ctx.translate(0, -V.oy);

    // 1. the sky's bands of haze
    const sk = key(SKY[M], p), g = ctx.createLinearGradient(0, 0, 0, wy);
    sk.forEach((c, i) => g.addColorStop(SKY_AT[i], rgba(c, c[3])));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, wy);

    // 2. the stars as the light goes: the evening star first, then the brightest
    const starA = sm(0.45, 0.75, p);
    if (starA > 0) {
      ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
      const spr = starSpr(L);
      for (const s of S.stars) {
        const vis = sm(s.th, s.th + 0.08, p) * (s.planet ? 1 : starA) * (1 - 0.6 * sm(0.3, 0.62, s.y / wy));
        if (vis < 0.01) continue;
        const tw = s.planet ? 1 : 0.8 + 0.2 * Math.sin(t * s.f + s.ph);
        ctx.globalAlpha = Math.min(1, vis * s.a * tw * (L ? 0.8 : 1)); ctx.drawImage(spr, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // 3. the sun's glow on the air: a wide warm light, a tighter one, and a long band along the horizon
    if (glow > 0.01) {
      ctx.globalCompositeOperation = add;
      const gc = mixc(sunC, [255, 120, 80], sm(0.3, 0.7, p));
      K.glow(ctx, xs, gy, u * 0.95, [[0, rgba(gc, (L ? 0.2 : 0.2) * glow)], [0.3, rgba(gc, (L ? 0.08 : 0.07) * glow)], [1, rgba(gc, 0)]], 1.4, 0.75);
      K.glow(ctx, xs, gy, u * 0.24, [[0, rgba(mixc(sunC, [255, 255, 240], L ? 0 : 0.25), (L ? 0.3 : 0.42) * glow)], [0.4, rgba(sunC, (L ? 0.1 : 0.13) * glow)], [1, rgba(sunC, 0)]]);
      K.glow(ctx, xs, wy, u * 0.9, [[0, rgba(gc, (L ? 0.2 : 0.22) * glow)], [0.5, rgba(gc, 0.05 * glow)], [1, rgba(gc, 0)]], 1.6, 0.09);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4. the decks of cloud: bodies (the low deck after the sun, so it can cross it), then their lit edges
    const ink = L ? 'rgb(134,126,172)' : 'rgb(22,18,40)', shadeA = (L ? 0.2 : 0.24) + (L ? 0.12 : 0.36) * p;
    const decks = DECKS.map((o, i) => { const j = deck(i, pv); return j.ready ? { o, j, y: o.y0 * wy, hh: (o.y1 - o.y0) * wy } : null; });
    const tile = (d) => d.hh * (d.j.dens.width / d.j.dens.height);
    const off = (d) => t * d.o.drift * k7 * (pv ? 0.4 : 1);
    const shade = (d, k) => { if (d) K.band(ctx, K.tint(d.j.dens, ink), W, d.y, d.hh, tile(d), off(d), shadeA * k); };
    shade(decks[0], 0.62); shade(decks[1], 0.8);
    if (alt > -1.1) { // the sun's disc, flattened near the water, cut off by it
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, wy); ctx.clip();
      ctx.translate(xs, sy); ctx.scale(1, flat);
      const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, rs * 1.25);
      const core = L ? sunC : mixc(sunC, [255, 250, 226], 0.45);
      dg.addColorStop(0, rgba(core, L ? 0.95 : 0.95)); dg.addColorStop(0.62, rgba(mixc(core, sunC, 0.6), L ? 0.92 : 0.9)); dg.addColorStop(0.8, rgba(sunC, L ? 0.85 : 0.8)); dg.addColorStop(0.86, rgba(sunC, 0.25)); dg.addColorStop(1, rgba(sunC, 0));
      ctx.globalCompositeOperation = add; ctx.fillStyle = dg; ctx.fillRect(-rs * 1.3, -rs * 1.3, rs * 2.6, rs * 2.6);
      ctx.restore();
    }
    shade(decks[2], 1);
    // the lit edges, coloured from the sun outward; a nearer deck hides the light on a farther one behind it
    const lit = key(LIT[M], p), sc = S.scx;
    sc.setTransform(S.sq, 0, 0, S.sq, 0, 0); sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, W, wy);
    let any = false;
    for (let i = 0; i < decks.length; i++) {
      const d = decks[i];
      if (!d) continue;
      const [p0, pw] = d.o.keep, a = p < p0 ? 1 : Math.max(0.12, 1 - (p - p0) / pw); // the low deck loses the light first
      if (any) { sc.globalCompositeOperation = 'destination-out'; K.band(sc, d.j.dens, W, d.y, d.hh, tile(d), off(d), 1); sc.globalCompositeOperation = 'source-over'; }
      K.band(sc, d.j.lit, W, d.y, d.hh, tile(d), off(d), a);
      any = true;
    }
    if (any) {
      const lg = sc.createRadialGradient(xs, gy, 0, xs, gy, Math.max(W, wy) * 1.05);
      [0, 0.3, 0.65, 1].forEach((o, i) => lg.addColorStop(o, rgba(lit[i], lit[i][3])));
      sc.globalCompositeOperation = 'source-in'; sc.fillStyle = lg; sc.fillRect(0, 0, W, wy); sc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = add; ctx.globalAlpha = L ? 0.85 : 0.95; ctx.drawImage(S.scr, 0, 0, W, wy);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // 5. the water: its body, darker toward us, the horizon's light lying on it
    if (!st.seaG) {
      st.seaG = ctx.createLinearGradient(0, wy, 0, H);
      if (L) { st.seaG.addColorStop(0, 'rgba(110,120,164,0.14)'); st.seaG.addColorStop(1, 'rgba(70,82,124,0.3)'); }
      else { st.seaG.addColorStop(0, 'rgba(6,8,22,0.22)'); st.seaG.addColorStop(1, 'rgba(4,6,16,0.5)'); }
    }
    ctx.fillStyle = st.seaG; ctx.fillRect(0, wy, W, H - wy);
    const hz = sk[4];
    ctx.globalCompositeOperation = add;
    const rg = ctx.createLinearGradient(0, wy, 0, wy + (H - wy) * 0.8);
    rg.addColorStop(0, rgba(hz, hz[3] * (L ? 0.55 : 0.75))); rg.addColorStop(0.35, rgba(hz, hz[3] * (L ? 0.2 : 0.25))); rg.addColorStop(1, rgba(hz, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, wy, W, H - wy);
    ctx.globalCompositeOperation = 'source-over';
    // the land on the horizon and its reflection
    K.stamp(ctx, S.refl, 0, S.y0, W, S.lh, L ? 0.35 : 0.55);
    K.stamp(ctx, S.land, 0, S.y0, W, S.lh, L ? 0.55 : 0.9);
    // the lighthouse, lit once the sun is down: a slow beat
    const lhOn = sm(0.5, 0.62, p) * (L ? 0.7 : 1);
    if (lhOn > 0.01) { const b = Math.max(0, Math.sin(t * 0.06)) ** 3; ctx.globalCompositeOperation = add; ctx.globalAlpha = lhOn * (0.35 + 0.65 * b); ctx.drawImage(starSpr(false), S.lhx - u * 0.012, S.lhy - u * 0.012, u * 0.024, u * 0.024); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }

    // 6. the sun's path on the water: a column under it, and glints that come and go, wider toward us
    const pathI = (alt > -1.1 ? 1 : Math.max(0, 1 - (p - 0.46) / 0.14)) * (1 - 0.35 * sm(0.36, 0.46, p));
    ctx.globalCompositeOperation = add;
    if (pathI > 0.01) {
      const colG = mixc(sunC, [255, 255, 240], L ? 0 : 0.25), spr = dashSpr(colG), wh = H - wy, rows = pv ? 12 : 54;
      K.glow(ctx, xs, wy + wh * 0.12, rs * 2.2, [[0, rgba(sunC, (L ? 0.25 : 0.28) * pathI)], [1, rgba(sunC, 0)]], 0.7, 2.4);
      for (let j = 0; j < rows; j++) {
        const kq = (j + 0.5) / rows, y = wy + 1.5 + wh * kq ** 1.65, hw = rs * (0.7 + 5.5 * kq ** 1.15) * (0.75 + 0.5 * sm(0.1, 0.4, p));
        for (let i = 0; i < 2; i++) {
          const ss = Math.sin(t * (0.021 + (j % 5) * 0.004) + j * 12.9898 + i * 78.233), sx = ss * Math.abs(ss) ** 0.6; // bunched toward the middle
          const fl = Math.sin(t * (0.09 + (j % 3) * 0.03) + j * 3.7 + i * 1.9);
          if (fl < -0.2) continue;
          const len = rs * (0.3 + 1.5 * kq) * (0.5 + 0.5 * fl), x = xs + sx * hw;
          ctx.globalAlpha = Math.min(1, pathI * (L ? 0.7 : 0.85) * (1 - 0.5 * kq) * (0.3 + 0.7 * fl) * (1 - 0.6 * Math.abs(sx)));
          ctx.drawImage(spr, x - len / 2, y - Math.max(1, u * 0.0016), len, Math.max(2, u * 0.0032));
        }
      }
    }
    // the swell: long faint lines of the sky's light, drifting
    const sw = dashSpr(L ? [120, 120, 160] : mixc(hz, [200, 200, 230], 0.4));
    for (const s of S.swells) {
      s.x += s.sp * k7;
      const y = wy + 2 + (H - wy) * s.k ** 1.5, len = W * s.len * (0.4 + s.k), x = ((s.x % (W + len)) + W + len) % (W + len) - len / 2;
      ctx.globalAlpha = (L ? 0.14 : 0.09) * s.a * (0.6 + 0.4 * Math.sin(t * 0.02 + s.k * 30)); ctx.drawImage(sw, x - len / 2, y - 1, len, Math.max(1.5, u * 0.0022));
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 7. birds crossing
    if (--st.flockIn <= 0 && !st.birds.length) { flock(st, V, S); st.flockIn = 900 + RND() * 1300; }
    if (st.birds.length) {
      ctx.strokeStyle = L ? 'rgba(54,50,74,0.62)' : 'rgba(8,7,16,0.8)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = st.birds.length - 1; i >= 0; i--) {
        const b = st.birds[i];
        b.x += b.v * b.dir; b.bob += 0.05;
        if (b.glide > 0) b.glide--; else if (RND() < 0.004) b.glide = 30 + RND() * 50;
        b.ph += b.glide > 0 ? 0 : b.fs;
        if ((b.dir > 0 && b.x > W + u * 0.1) || (b.dir < 0 && b.x < -u * 0.1)) { st.birds.splice(i, 1); continue; }
        const f = b.glide > 0 ? 0.15 : Math.sin(b.ph), s = b.s, x = b.x, y = b.y + Math.sin(b.bob) * s * 0.3 - f * s * 0.08;
        const tipY = y - s * 0.55 * f + s * 0.1, cy = y - s * (0.3 + 0.12 * f);
        ctx.lineWidth = Math.max(pv ? 0.6 : 1, s * 0.17);
        ctx.beginPath(); ctx.moveTo(x - s, tipY); ctx.quadraticCurveTo(x - s * 0.45, cy, x, y); ctx.quadraticCurveTo(x + s * 0.45, cy, x + s, tipY); ctx.stroke();
      }
    }
    ctx.restore();
  };

  /** The picker's still: the sun half in the sea, the clouds lit. */
  window.BG_PV_STILL.sunset = (bg) => { if (bg.st && bg.st.kind === 'sunset') bg.st.T = T_OF(0.36); return 2; };
})();
