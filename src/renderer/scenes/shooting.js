'use strict';
/*
 * 별똥별: a clear, moonless night over a forest edge. The Milky Way rises from the horizon on the left, its warm
 * core low down, star clouds and dark dust lanes along it; thousands of faint stars lie behind a few hundred brighter
 * ones in their own colours (blue-white, white, yellow, orange, red), the brightest twinkling, harder near the
 * horizon. A far range of hills stands in the faint airglow, spruces crowd the hill on the right and a few stand on
 * the meadow on the left; mist lies in the valley.
 * Meteors: every few seconds a tiny one flicks across, now and then a longer one with a coloured tint (green,
 * yellow, violet), the brighter ones often leaving a glowing train that lingers, widens and is twisted by the
 * winds aloft; once in a while a slow fireball flares and breaks up, and every few minutes a small shower streams out
 * of one radiant. Each meteor is a hot head and a tapering trail (pre-rendered sprites, laid along its path).
 * On a light page the sky is a star chart's paper: stars and meteors in deep inks, the land in soft grey-blue.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('shooting'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const WHITE = [255, 255, 255];
  const rr = (a, b) => a + (b - a) * RND();

  /* ---------- star colours by spectral class: [dark page], [light page: ink] ---------- */
  const SPEC = [
    { w: 0.1, D: [166, 194, 255], L: [34, 64, 150] }, // B
    { w: 0.22, D: [206, 220, 255], L: [44, 58, 120] }, // A
    { w: 0.22, D: [242, 243, 255], L: [52, 56, 86] }, // F
    { w: 0.2, D: [255, 240, 220], L: [74, 64, 64] }, // G
    { w: 0.18, D: [255, 212, 168], L: [120, 74, 40] }, // K
    { w: 0.08, D: [255, 182, 142], L: [140, 58, 40] }, // M
  ];
  const specOf = (R) => { let r = R(); for (let i = 0; i < SPEC.length; i++) { r -= SPEC[i].w; if (r <= 0) return i; } return 2; };
  /** Meteor tints: [dark], [light]. Sodium yellow, magnesium green, calcium violet, plain white. */
  const TINT = {
    white: [[236, 242, 255], [40, 50, 96]],
    green: [[150, 255, 196], [8, 112, 92]],
    yellow: [[255, 214, 150], [150, 92, 16]],
    violet: [[196, 176, 255], [86, 54, 170]],
    blue: [[170, 206, 255], [30, 76, 170]],
  };

  /* ---------- sprites, made once ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** A star seen through the air: a firm point in a small soft halo. */
  const starSpr = (c, L) => radial(`shStar|${c}|${L}`, 32, L
    ? [[0, rgba(c, 1)], [0.12, rgba(c, 0.85)], [0.26, rgba(c, 0.2)], [0.55, rgba(c, 0.03)], [1, rgba(c, 0)]]
    : [[0, rgba(mix(c, WHITE, 0.65), 1)], [0.1, rgba(c, 0.9)], [0.24, rgba(c, 0.22)], [0.5, rgba(c, 0.045)], [1, rgba(c, 0)]]);
  /** The meteor's head: white-hot, wrapped in its tint. */
  const headSpr = (c, L) => radial(`shHead|${c}|${L}`, 64, L
    ? [[0, rgba(mix(c, [0, 0, 0], 0.3), 1)], [0.08, rgba(c, 0.85)], [0.2, rgba(c, 0.3)], [0.45, rgba(c, 0.06)], [1, rgba(c, 0)]]
    : [[0, 'rgba(255,255,255,1)'], [0.07, rgba(mix(c, WHITE, 0.7), 0.95)], [0.18, rgba(c, 0.42)], [0.42, rgba(c, 0.09)], [1, rgba(c, 0)]]);
  /** A wide soft light (a fireball's glow on the air; the soft dots a train is drawn with). */
  const softSpr = (c, L) => radial(`shSoft|${c}|${L}`, 48, [[0, rgba(c, L ? 0.8 : 1)], [0.3, rgba(c, L ? 0.36 : 0.5)], [0.65, rgba(c, 0.1)], [1, rgba(c, 0)]]);

  /**
   * The trail: a streak laid tail (left) to head (right), thin and faint at the tail, a white-hot thread in a tinted
   * sheath toward the head. Drawn per pixel so it tapers smoothly at any length it is stretched to.
   */
  function streakSpr(c, L) {
    const key = `shStreak|${c}|${L}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const SW = 256, SH = 32, cv = K.mk(SW, SH), x = cv.getContext('2d'), img = x.createImageData(SW, SH), d = img.data;
    const hot = L ? mix(c, [0, 0, 0], 0.25) : mix(c, WHITE, 0.78);
    for (let j = 0; j < SH; j++) {
      const y = ((j + 0.5) / SH) * 2 - 1;
      for (let i = 0; i < SW; i++) {
        const k = (i + 0.5) / SW, taper = 0.1 + 0.9 * k ** 1.4, yy = y / taper;
        const core = Math.exp(-((yy / 0.13) ** 2)), sheath = Math.exp(-((yy / 0.45) ** 2));
        const along = k ** 1.9 * sm(1, 0.985, k); // fades toward the tail; the head sprite covers the very end
        const a = along * (core * 0.95 + sheath * (L ? 0.3 : 0.38));
        if (a < 0.003) continue;
        const f = core / (core + sheath * 0.5 + 1e-6), col = mix(c, hot, f), o = (j * SW + i) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(Math.min(1, a) * 255);
      }
    }
    x.putImageData(img, 0, 0);
    K.cache.set(key, cv);
    return cv;
  }

  /* ---------- the still sky and land ---------- */

  /** Where the Milky Way runs, in scene pixels: s along it from its core on the horizon, d across it. */
  function bandFrame(V, hz) {
    const { W, u } = V;
    const x0 = W * (V.pv ? 0.2 : 0.16), y0 = hz + u * 0.04, ang = -1.02; // rising up and to the right
    const c = Math.cos(ang), s = Math.sin(ang), curv = 0.32 / u;
    return (x, y) => { const dx = x - x0, dy = y - y0, sa = dx * c + dy * s; let da = -dx * s + dy * c; da -= curv * sa * sa * 0.5; return [sa, da]; };
  }

  /**
   * The Milky Way: worked out at a third of the size, a few rows at a time (it is mostly soft light). Leaves the
   * haze (a canvas) and the light per cell (for scattering the faint stars of its star clouds).
   */
  function* milkyJob(V, S, L) {
    const { W, u, pv } = V, hz = S.skyH, f = pv ? 1 : 3, MW = Math.max(8, Math.ceil(W / f)), MH = Math.max(8, Math.ceil(hz / f));
    const frame = bandFrame(V, S.hz), n1 = K.fbm(311, 8, 8, 5), n2 = K.fbm(523, 6, 6, 4), n3 = K.fbm(97, 4, 4, 3);
    const I = new Float32Array(MW * MH), warm = new Float32Array(MW * MH);
    const wid = u * 0.13;
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        const x = (i + 0.5) * f, y = (j + 0.5) * f, [s, d0] = frame(x, y);
        if (s < -u * 0.3) continue;
        const wd = wid * (1 + 0.55 * Math.exp(-((s / (u * 0.22)) ** 2)) + 0.25 * Math.min(1, s / (u * 1.4)));
        const wob = (n3(s / u * 2.2 + 7, 0.5) - 0.5) * wd * 0.6, d = d0 + wob, q = d / wd;
        if (q * q > 9) continue;
        const base = Math.exp(-q * q * 1.6) * sm(-u * 0.3, u * 0.05, s);
        const u1 = (s / u) * 4.5, v1 = (d / u) * 9;
        const cl = n1(u1 + 3.3, v1 + 1.7), clump = sm(0.3, 0.78, cl);
        // the dust lanes: a long rift that wanders along one side of the middle, and smaller dark knots
        const lc = wd * (0.16 + (n2(s / u * 3 + 11, 2.5) - 0.5) * 0.7), lw = wd * (0.16 + 0.14 * n2(s / u * 5 + 2, 7.5));
        const lane = Math.exp(-(((d - lc) / lw) ** 2)) * sm(0.25, 0.65, n2(u1 * 0.9 + 5.1, v1 * 0.6 + 3.9)) * sm(u * 0.02, u * 0.12, s);
        const knot = sm(0.62, 0.8, n2(u1 * 2.1 + 1.2, v1 * 1.8 + 8.4)) * 0.6;
        const core = Math.exp(-((s / (u * 0.2)) ** 2) - q * q * 0.8);
        let v = base * (0.28 + 0.72 * clump) * (1 + 1.3 * core) * (1 - 0.88 * Math.min(1, lane + knot * base));
        I[j * MW + i] = v; warm[j * MW + i] = core;
      }
      if ((j & 7) === 7) yield;
    }
    // the haze: cool white along the band, warmer toward the core
    const cv = K.mk(MW, MH), cx = cv.getContext('2d'), img = cx.createImageData(MW, MH), dd = img.data;
    const cool = L ? [92, 106, 150] : [196, 208, 236], hot = L ? [128, 104, 146] : [255, 222, 186];
    for (let k = 0; k < MW * MH; k++) {
      const v = I[k];
      if (v < 0.004) continue;
      const c = mix(cool, hot, Math.min(1, warm[k] * 1.2)), o = k * 4;
      dd[o] = c[0]; dd[o + 1] = c[1]; dd[o + 2] = c[2]; dd[o + 3] = Math.round(Math.min(1, v * 0.62) * 255);
    }
    cx.putImageData(img, 0, 0);
    yield;
    // its star clouds: faint stars scattered where the band is bright (and not in the lanes)
    const [st, sc] = K.layer(W, hz, S.q), R = K.rng(1999), n = pv ? 70 : Math.round(Math.min(5200, (W * hz) / 1e6 * 3600));
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const x = R() * W, y = R() * hz, v = I[Math.min(MH - 1, (y / f) | 0) * MW + Math.min(MW - 1, (x / f) | 0)];
      if (R() > v * 1.15) continue;
      i++;
      const sp = SPEC[specOf(R)][L ? 'L' : 'D'], a = (L ? 0.16 : 0.12) + R() * (L ? 0.26 : 0.3), r = (pv ? 0.32 : 0.42) + R() * 0.3;
      sc.fillStyle = rgba(sp, a); sc.beginPath(); sc.arc(x, y, r, 0, TAU); sc.fill();
      if ((i & 511) === 511) yield;
    }
    S.milky = cv; S.mwStars = st; S.mwReady = true;
  }

  /** A spruce: a spire of drooping branches, each side on its own, the odd one broken off. */
  function spruce(c, R, x, base, h, w) {
    const tw = Math.max(0.6, w * 0.07);
    c.fillRect(x - tw / 2, base - h * 0.25, tw, h * 0.25 + 2);
    const n = Math.max(6, Math.round(h / 1.9));
    for (let i = 0; i < n; i++) {
      const k = i / n, y = base - h * 0.07 - h * 0.88 * k, env = (1 - k) ** 0.8, th = Math.max(1.1, (h / n) * 2.1);
      for (const sd of [-1, 1]) {
        if (k < 0.8 && R() < 0.07) continue; // a gap where a branch is missing
        const hw = (w / 2) * env * (0.55 + R() * 0.65) + 0.45, droop = th * (0.25 + R() * 0.55) + hw * 0.14, tx = x + sd * hw, ty = y + droop;
        c.beginPath();
        c.moveTo(x, y - th * 0.7);
        c.quadraticCurveTo(x + sd * hw * 0.5, y - th * 0.45, tx, ty); // out along the top to the drooping tip
        c.lineTo(x + sd * hw * (0.68 + R() * 0.12), ty - th * 0.2); // a smaller tip under it
        c.lineTo(x + sd * hw * 0.6, ty + th * 0.12);
        c.quadraticCurveTo(x + sd * hw * 0.3, y + th * 0.25, x, y + th * 0.4); // back under to the trunk
        c.closePath(); c.fill();
      }
    }
    c.lineWidth = Math.max(0.5, tw * 0.8);
    c.beginPath(); c.moveTo(x, base - h * 0.9); c.lineTo(x + (R() - 0.5) * 0.5, base - h * (1.02 + R() * 0.04)); c.stroke();
  }
  /** A broad-leaved tree: a short trunk forking into a rounded, lumpy crown with a leafy edge. */
  function broadleaf(c, R, x, base, h, w) {
    const lean = (R() - 0.5) * w * 0.2, cx = x + lean, cy = base - h * 0.6, rx = w / 2, ry = h * 0.4;
    c.lineWidth = Math.max(0.8, w * 0.07);
    c.beginPath(); c.moveTo(x, base + 1); c.quadraticCurveTo(x, base - h * 0.3, cx, cy + ry * 0.3); c.stroke();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.7; c.lineWidth = Math.max(0.6, w * 0.035); c.beginPath(); c.moveTo(cx, cy + ry * 0.3); c.lineTo(cx + Math.cos(a) * rx * 0.6, cy + Math.sin(a) * ry * 0.6); c.stroke(); }
    for (let i = 0; i < 16; i++) { // the crown's masses
      const a = R() * TAU, d = Math.sqrt(R()) * 0.62, r = rx * (0.22 + R() * 0.16);
      c.beginPath(); c.ellipse(cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry - ry * 0.05, r, r * (0.8 + R() * 0.3), 0, 0, TAU); c.fill();
    }
    for (let i = 0; i < 34; i++) { // its edge, in small clumps of leaves
      const a = R() * TAU, e = 0.78 + R() * 0.2, r = rx * (0.05 + R() * 0.07);
      c.beginPath(); c.arc(cx + Math.cos(a) * e * rx, cy + Math.sin(a) * e * ry * (a < 0 || a > Math.PI ? 1 : 0.8), r, 0, TAU); c.fill();
    }
  }

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(6151), q = bg.dpr || 1;
    const hz = Math.round(H * (pv ? 0.86 : 0.9)); // the meadow's line, lowest point of the land
    const N = 128, X = (i) => -6 + ((W + 12) * i) / N;
    const smooth = (h) => { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) o[i] = (h[Math.max(0, i - 2)] + h[Math.max(0, i - 1)] * 2 + h[i] * 3 + h[Math.min(h.length - 1, i + 1)] * 2 + h[Math.min(h.length - 1, i + 2)]) / 9; return o; };
    const far = smooth(K.ridge(R, N, 0.56)), near = smooth(smooth(K.ridge(R, N, 0.5)));
    // the far range: low, a broad summit right of the middle; the near land: a meadow rising into a wooded hill on the right
    const farY = (i) => { const k = i / N; return hz - u * (0.03 + 0.05 * far[i] + 0.05 * Math.exp(-(((k - 0.62) / 0.16) ** 2))) * (pv ? 0.8 : 1); };
    const nearY = (i) => { const k = i / N; return hz + u * 0.012 - u * (0.012 * near[i] + 0.075 * sm(0.5, 1.02, k) ** 1.3 + 0.012 * Math.exp(-(((k - 0.1) / 0.08) ** 2))); };
    const atN = (x) => nearY(Math.max(0, Math.min(N, Math.round(((x + 6) / (W + 12)) * N))));
    let top = H;
    for (let i = 0; i <= N; i++) top = Math.min(top, farY(i), nearY(i));
    const ly0 = Math.floor(top - u * 0.11), hzTop = Math.round(top), skyH = Math.round(hz + u * 0.02);
    const S = { hz, hzTop, skyH, ly0, land: null, sky: null, s1: null, s2: null, tw: [], q, milky: null, mwStars: null, mwReady: false, atN };
    S.job = (function* () { // drawn a few milliseconds at a time: the land, the sky's glow, the stars, then the Milky Way
      yield* landGen(); yield* starGen(); yield* milkyJob(V, S, L);
    })();
    return S;

    function* landGen() {
      const inkF = L ? [150, 158, 182] : [20, 25, 40], inkN = L ? [70, 76, 96] : [3, 4, 8];
      const [land, lc] = K.layer(W, H - ly0, q);
      lc.translate(0, -ly0);
      const path = (Y) => { const p = new Path2D(); p.moveTo(-6, H + 2); for (let i = 0; i <= N; i++) p.lineTo(X(i), Y(i)); p.lineTo(W + 6, H + 2); p.closePath(); return p; };
      { // the far range: a wash, firm along the crest and thinning into the valley mist
        const p = path(farY), g = lc.createLinearGradient(0, hz - u * 0.11, 0, hz + u * 0.02);
        g.addColorStop(0, rgba(inkF, 1)); g.addColorStop(0.7, rgba(inkF, 0.8)); g.addColorStop(1, rgba(inkF, 0.45));
        lc.fillStyle = g; lc.fill(p);
        lc.save(); lc.clip(p); // a few gullies down its slopes
        for (let i = 2; i < N - 1; i++) {
          if (R() > 0.35) continue;
          const x = X(i), y = farY(i), dh = farY(i + 1) - farY(i - 1), len = u * (0.012 + R() * 0.03), dx = (dh > 0 ? 1 : -1) * len * (0.4 + R() * 0.5);
          lc.strokeStyle = rgba(mix(inkF, inkN, 0.3), 0.35); lc.lineWidth = Math.max(0.6, u * 0.0014);
          lc.beginPath(); lc.moveTo(x, y + 1); lc.quadraticCurveTo(x + dx * 0.3, y + len * 0.5, x + dx, y + len); lc.stroke();
        }
        lc.restore();
        // a fringe of trees along its crest, too far off to be more than a roughness
        lc.fillStyle = rgba(inkF, 1);
        for (let x = 0; x < W; x += Math.max(1, u * (0.002 + R() * 0.003))) {
          if (R() < 0.45) continue;
          const i = Math.round(((x + 6) / (W + 12)) * N), y = farY(i), th = u * (0.003 + R() * 0.005) * (pv ? 1.6 : 1);
          lc.beginPath(); lc.moveTo(x - th * 0.3, y + 1); lc.lineTo(x, y - th); lc.lineTo(x + th * 0.3, y + 1); lc.fill();
        }
      }
      // the near land, in front of the range: it hides it
      const pn = path(nearY);
      lc.save(); lc.globalCompositeOperation = 'destination-out'; lc.fill(pn); lc.restore();
      lc.fillStyle = rgba(inkN, 1); lc.strokeStyle = rgba(inkN, 1); lc.lineCap = 'round';
      lc.fill(pn);
      // trees: a wood up the hill on the right (spruces, the odd broad crown), a few on the meadow, a small stand at the left
      const trees = [];
      for (let row = 0; row < 2; row++) { // the back row stands a little higher up the slope, smaller
        for (let x = W * 0.48 + R() * u * 0.02; x < W + u * 0.03; x += u * (0.008 + R() * 0.014) * (row ? 1 : 0.8)) {
          const k = x / W, dens = sm(0.5, 0.78, k);
          if (R() > 0.2 + dens * 0.8) continue;
          const h = u * (0.026 + R() * 0.04) * (0.6 + 0.55 * sm(0.5, 1, k)) * (row ? 1 : 0.72);
          trees.push([x, h, R() < 0.22 ? 1 : 0, row ? 0 : -u * (0.006 + R() * 0.008)]);
        }
      }
      for (let i = 0; i < (pv ? 2 : 4); i++) trees.push([W * (0.26 + R() * 0.2), u * (0.022 + R() * 0.03), R() < 0.4 ? 1 : 0, 0]);
      for (let i = 0; i < (pv ? 2 : 3); i++) trees.push([W * 0.04 + i * u * (0.02 + R() * 0.014), u * (0.045 + R() * 0.035), 0, 0]);
      trees.push([W * 0.04 + u * 0.03, u * 0.1, 0, 0]); // one tall one in the stand
      trees.sort((a, b) => a[3] - b[3]);
      yield;
      for (let i = 0; i < trees.length; i++) {
        const [x, h0, kind, dy] = trees[i], h = h0 * (pv ? 1.3 : 1), base = atN(x) + u * 0.006 + dy;
        if (kind) broadleaf(lc, R, x, base, h * 0.85, h * (0.6 + R() * 0.25)); else spruce(lc, R, x, base, h, h * (0.34 + R() * 0.12));
        if (!pv && i % 24 === 23) yield;
      }
      // grass along the meadow's edge
      lc.lineWidth = Math.max(0.5, u * 0.0011);
      for (let i = 0; i < (pv ? 40 : 360); i++) {
        const x = R() * W, y = atN(x) + 1, gl = u * (0.004 + R() * 0.012), lean = (R() - 0.4) * gl * 0.8;
        lc.beginPath(); lc.moveTo(x, y + 1); lc.quadraticCurveTo(x + lean * 0.3, y - gl * 0.6, x + lean, y - gl); lc.stroke();
      }
      S.land = land;
    }

    function* starGen() {
      // the sky's own light: the airglow low down, a far town's glow on one spot of the horizon
      const [sky, sc] = K.layer(W, hz + 2, q);
      if (!L) {
        const g = sc.createLinearGradient(0, hz, 0, hz - u * 0.42);
        g.addColorStop(0, 'rgba(126,170,160,0.075)'); g.addColorStop(0.25, 'rgba(110,140,170,0.035)'); g.addColorStop(1, 'rgba(100,120,170,0)');
        sc.fillStyle = g; sc.fillRect(0, 0, W, hz + 2);
        K.glow(sc, W * 0.38, hz, u * 0.32, [[0, 'rgba(255,176,120,0.07)'], [0.4, 'rgba(255,170,120,0.025)'], [1, 'rgba(255,170,120,0)']], 1.8, 0.55);
      } else {
        const g = sc.createLinearGradient(0, hz, 0, hz - u * 0.35);
        g.addColorStop(0, 'rgba(150,160,200,0.10)'); g.addColorStop(1, 'rgba(150,160,200,0)');
        sc.fillStyle = g; sc.fillRect(0, 0, W, hz + 2);
      }

      S.sky = sky;
      yield;
      // the field stars: in two layers that shimmer out of step; the brightest are kept apart to twinkle
      const area = (W * hzTop) / 1e6;
      const atF = (x) => farY(Math.max(0, Math.min(N, Math.round(((x + 6) / (W + 12)) * N))));
      const [s1, c1] = K.layer(W, skyH, q), [s2, c2] = K.layer(W, skyH, q);
      const n = pv ? 46 : Math.round(Math.min(3200, 1700 * area + 120)), tw = S.tw;
      const aMul = L ? 1.05 : 1;
      for (let i = 0; i < n; i++) {
        const m = Math.max(-0.6, 6.8 + Math.log(R() + 1e-9) / 1.08), x = R() * W, y = R() ** 1.12 * skyH;
        const sp = SPEC[specOf(R)], col = sp[L ? 'L' : 'D'], b = 10 ** (-0.4 * (m - 1)), vis = Math.min(1.3, b ** 0.36);
        if (y > Math.min(atN(x), atF(x))) continue;
        const low = 1 - 0.45 * sm(hz * 0.55, hz, y); // dimmer through the thick air near the horizon
        if (m < (pv ? 2.6 : 3.3)) { tw.push({ x, y, s: (pv ? 3.4 : 5.5) + 9 * Math.min(1, b ** 0.5), a: Math.min(1, 0.55 + 0.45 * vis) * low * aMul, spr: starSpr(col, L), ph: R() * TAU, f1: 0.05 + R() * 0.08, f2: 0.11 + R() * 0.13, dep: 0.18 + 0.5 * sm(hz * 0.4, hz, y) }); continue; }
        const c = R() < 0.5 ? c1 : c2, r = ((pv ? 0.3 : 0.42) + 0.75 * Math.min(1, b ** 0.45)) * (pv ? 0.8 : 1), a = Math.min(1, (0.1 + 0.82 * vis) * low * aMul);
        c.fillStyle = rgba(col, a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        if (!pv && i % 700 === 699) yield;
      }
      S.s1 = s1; S.s2 = s2;
    }
  }

  /* ---------- the meteors ---------- */

  const KINDS = { // per kind: speed and trail (of u), frames, peak, width (px), chance of a lasting train
    tiny: { v: [0.03, 0.05], tr: [0.035, 0.08], T: [6, 11], I: [0.3, 0.55], w: 0.75, train: 0 },
    mid: { v: [0.022, 0.036], tr: [0.09, 0.17], T: [12, 20], I: [0.6, 0.82], w: 1.1, train: 0.15 },
    bright: { v: [0.018, 0.028], tr: [0.16, 0.28], T: [18, 28], I: [0.9, 1], w: 1.55, train: 0.6 },
    fireball: { v: [0.007, 0.012], tr: [0.2, 0.32], T: [56, 84], I: [1, 1], w: 3, train: 1 },
  };

  function init(V, S) {
    return { kind: 'shooting', key: S.key, met: [], trains: [], frags: [], show: null, nextTiny: 30 + RND() * 50, nextMid: V.pv ? 9999 : 50 + RND() * 50,
      nextBright: 500 + RND() * 700, nextFire: 2400 + RND() * 2400, nextShower: 3600 + RND() * 3000, sfxAt: -999, mwA: 0 };
  }

  /** A meteor; o may fix its kind, start, angle, tint, speed and trail. */
  function spawn(st, V, S, o) {
    const { W, u } = V, kd = KINDS[o.kind], hz = S.hzTop;
    const ang = o.ang != null ? o.ang : (RND() < 0.5 ? 1 : -1) * rr(0.25, 1.25) + Math.PI / 2 + (RND() < 0.12 ? (RND() - 0.5) * 1.2 : 0);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const v = (o.v || rr(kd.v[0], kd.v[1])) * u, T = Math.round(o.T || rr(kd.T[0], kd.T[1])), run = v * T;
    let x, y;
    if (o.x != null) { x = o.x; y = o.y; } else { // somewhere it will cross the sky, not the land
      for (let k = 0; k < 8; k++) {
        x = rr(W * 0.04, W * 0.96); y = rr(hz * 0.04, hz * 0.7);
        const ex = x + dx * run, ey = y + dy * run;
        if (ey < hz * 0.92 && ex > -u * 0.1 && ex < W + u * 0.1) break;
      }
    }
    const tint = o.tint || (o.kind === 'tiny' ? (RND() < 0.75 ? 'white' : 'blue') : ['white', 'green', 'green', 'yellow', 'violet', 'blue', 'white'][(RND() * 7) | 0]);
    const m = { x0: x, y0: y, dx, dy, v, T, age: 0, kind: o.kind, I: rr(kd.I[0], kd.I[1]) * (o.dim || 1), trMax: (o.tr || rr(kd.tr[0], kd.tr[1])) * u, w: kd.w * (V.pv ? 0.7 : 1),
      tint, ti: 0, flick: RND() * 10, flares: [], breakAt: 2, train: null, end: 0 };
    if (o.kind === 'fireball') { for (let i = 0, n = 2 + ((RND() * 3) | 0); i < n; i++) m.flares.push([rr(0.3, 0.85), rr(0.5, 1.2), rr(0.02, 0.05)]); m.breakAt = rr(0.68, 0.82); m.tint2 = RND() < 0.6 ? 'yellow' : 'white'; }
    if (RND() < (o.train != null ? o.train : kd.train)) m.train = { pts: [], from: rr(0.15, 0.45), to: rr(0.6, 0.95) };
    st.met.push(m);
    return m;
  }

  /** The brightness of a meteor along its flight (0..1 of it): it flares up, peaks late, dies away; bright ones flicker. */
  function curve(m, p) {
    let I = Math.sin(Math.PI * Math.min(1, p) ** 0.75) ** 1.2;
    if (m.kind !== 'tiny') I *= 0.88 + 0.12 * Math.sin(m.age * 1.7 + m.flick) * Math.sin(m.age * 0.9 + m.flick * 2);
    for (const [at, hgt, wd] of m.flares) I += hgt * Math.exp(-(((p - at) / wd) ** 2)) * Math.min(1, p * 4);
    if (p > m.breakAt) I *= Math.max(0, 1 - (p - m.breakAt) / (1 - m.breakAt) * 0.9);
    return I * m.I;
  }

  function sfx(st, bg, t) {
    if (!bg.canvas.classList.contains('bg-layer') || t - st.sfxAt < 240) return; // the real background only, never a pile of them
    st.sfxAt = t;
    if (typeof ambSfx === 'function') ambSfx('meteor');
  }

  /** What the sky does next: tiny ones often, longer ones now and then, a fireball or a shower once in a while. */
  function schedule(st, V, S, bg, t) {
    const pv = V.pv;
    if (--st.nextTiny <= 0) { spawn(st, V, S, { kind: 'tiny' }); st.nextTiny = RND() < 0.2 ? 15 + RND() * 25 : 70 + RND() * 160; }
    if (--st.nextMid <= 0) { spawn(st, V, S, { kind: 'mid' }); st.nextMid = 260 + RND() * 400; if (RND() < 0.35) sfx(st, bg, t); }
    if (pv) return;
    if (--st.nextBright <= 0) { spawn(st, V, S, { kind: 'bright' }); st.nextBright = 900 + RND() * 1100; sfx(st, bg, t); }
    if (--st.nextFire <= 0) { spawn(st, V, S, { kind: 'fireball', tint: RND() < 0.6 ? 'green' : 'white' }); st.nextFire = 3600 + RND() * 3600; st.nextBright = Math.max(st.nextBright, 300); sfx(st, bg, t); }
    if (--st.nextShower <= 0) { // a shower: for half a minute, meteors stream out of one point, the near ones short
      const { W } = V;
      st.show = { x: rr(W * 0.25, W * 0.75), y: rr(-S.hzTop * 0.08, S.hzTop * 0.3), left: 0, n: 7 + ((RND() * 6) | 0), every: 40 + RND() * 40, tint: ['white', 'green', 'yellow', 'blue'][(RND() * 4) | 0], v: rr(0.024, 0.034) };
      st.nextShower = 5400 + RND() * 5400; st.nextBright = Math.max(st.nextBright, 600); st.nextFire = Math.max(st.nextFire, 900);
    }
    const sh = st.show;
    if (sh && --sh.left <= 0) {
      const { u } = V, hz = S.hzTop;
      for (let k = 0; k < 12; k++) {
        const a = RND() * TAU, d0 = u * rr(0.06, 0.5), x = sh.x + Math.cos(a) * d0, y = sh.y + Math.sin(a) * d0;
        if (y < hz * 0.02 || y > hz * 0.75 || x < 0 || x > V.W) continue;
        const near = Math.min(1, d0 / (u * 0.45)), big = RND() < 0.18;
        spawn(st, V, S, { kind: big ? 'bright' : 'mid', x, y, ang: a, tint: sh.tint, v: sh.v * (0.6 + 0.4 * near), tr: (big ? 0.22 : 0.13) * (0.35 + 0.65 * near), T: (big ? 20 : 14) * (0.7 + 0.3 * near), dim: big ? 1 : 0.8, train: big ? 0.5 : 0 });
        if (big || RND() < 0.3) sfx(st, bg, t);
        break;
      }
      sh.left = sh.every * (0.4 + RND() * 1.2);
      if (--sh.n <= 0) st.show = null;
    }
  }

  function streak(ctx, spr, x0, y0, x1, y1, thick, a) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 0.6 || a < 0.006) return;
    ctx.save();
    ctx.translate(x0, y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(spr, 0, -thick / 2, len, thick);
    ctx.restore();
  }

  /**
   * A lasting train: soft dots along the path, patchy (brighter here, thinner there), narrow and bright just after
   * the meteor, then wider, dimmer and duskier as it fades; the winds aloft bend it apart.
   */
  function drawTrain(ctx, tr, L, k7) {
    const q = tr.age / tr.life, a = tr.a * Math.min(1, tr.age / 3 + 0.3) * (1 - q) ** 1.5 * (1 + 1.2 * Math.exp(-tr.age / 7));
    if (a < 0.006) return;
    const base = TINT[tr.tint][L ? 1 : 0];
    const col = L ? mix(base, [96, 96, 128], Math.min(1, q * 1.4)) : q < 0.2 ? mix(mix(base, WHITE, 0.4), [168, 236, 206], q * 5) : mix([168, 236, 206], [176, 150, 184], Math.min(1, (q - 0.2) * 1.6));
    const spr = softSpr(col, L), wd = tr.w * (1 + tr.age * 0.022 * k7), sz = wd * 3.6, step = Math.max(1.3, wd * 0.6), p = tr.pts, n = p.length;
    for (let i = 1; i < n; i++) {
      const x0 = p[i - 1][0], y0 = p[i - 1][1], x1 = p[i][0], y1 = p[i][1], len = Math.hypot(x1 - x0, y1 - y0), m = Math.max(1, Math.ceil(len / step));
      const e = Math.min(1, i / 3, (n - i) / 2.5); // thinner toward its ends
      for (let j = 0; j < m; j++) {
        const f = j / m, b = p[i - 1][2] + (p[i][2] - p[i - 1][2]) * f, z = sz * (0.75 + 0.5 * b);
        ctx.globalAlpha = Math.min(1, a * e * b * 0.5);
        ctx.drawImage(spr, x0 + (x1 - x0) * f - z / 2, y0 + (y1 - y0) * f - z / 2, z, z);
      }
    }
  }

  window.BG_EXT.shooting = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.8, 1.7), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'shooting' || st.key !== S.key) st = bg.st = init(V, S);
    if (S.job) { // the Milky Way is worked out a little at a time (all at once in a preview)
      const t0 = performance.now();
      while (S.job && (pv || performance.now() - t0 < 5)) if (S.job.next().done) S.job = null;
    }
    const k7 = u / 700, add = L ? 'source-over' : 'lighter';
    schedule(st, V, S, bg, t);
    ctx.save(); ctx.translate(0, -V.oy);

    // 1. the sky's glow, the Milky Way (fading in once it is ready), the stars
    if (S.s1) st.stA = Math.min(1, (st.stA || 0) + (pv ? 1 : 0.08));
    if (S.sky) { ctx.globalAlpha = st.stA || 0; ctx.drawImage(S.sky, 0, 0, W, S.hz + 2); ctx.globalAlpha = 1; }
    if (S.mwReady) {
      st.mwA = Math.min(1, st.mwA + (pv ? 1 : 0.025));
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = st.mwA * (L ? 0.55 : 0.5); ctx.drawImage(S.milky, 0, 0, W, S.skyH);
      ctx.globalAlpha = st.mwA * (L ? 0.8 : 0.9); ctx.drawImage(S.mwStars, 0, 0, W, S.skyH);
    }
    const sA = st.stA || 0;
    if (S.s1) {
      ctx.globalAlpha = sA * (0.86 + 0.14 * Math.sin(t * 0.021)); ctx.drawImage(S.s1, 0, 0, W, S.skyH);
      ctx.globalAlpha = sA * (0.86 + 0.14 * Math.sin(t * 0.017 + 2.1)); ctx.drawImage(S.s2, 0, 0, W, S.skyH);
    }
    for (const s of S.tw) { // twinkling: two beats out of step, deeper low in the sky
      const k = (0.5 + 0.5 * Math.sin(t * s.f1 + s.ph)) * (0.5 + 0.5 * Math.sin(t * s.f2 + s.ph * 1.7));
      ctx.globalAlpha = s.a * (1 - s.dep * k) * sA;
      const z = s.s * (1 - 0.18 * s.dep * k);
      ctx.drawImage(s.spr, s.x - z / 2, s.y - z / 2, z, z);
    }
    ctx.globalAlpha = 1;

    // 2. the lasting trains, drifting and widening
    ctx.globalCompositeOperation = add;
    for (let i = st.trains.length - 1; i >= 0; i--) {
      const tr = st.trains[i];
      tr.age++;
      if (tr.age >= tr.life) { st.trains.splice(i, 1); continue; }
      for (const p of tr.pts) { // shear: the wind changes with height (in layers, some thin), so the line bends and kinks apart
        const yy = p[1] / u;
        p[0] += (Math.sin(yy * 13 + tr.ph) * 0.8 + Math.sin(yy * 41 + tr.ph2) * 0.5 + 0.2) * 0.19 * k7;
        p[1] += (Math.sin(p[0] / u * 17 + tr.ph2) * 0.5 + 0.2) * 0.03 * k7;
      }
      drawTrain(ctx, tr, L, k7);
    }

    // 3. the meteors: the trail behind the head, the head, the glow a fireball throws on the air
    for (let i = st.met.length - 1; i >= 0; i--) {
      const m = st.met[i];
      m.age++;
      const p = m.age / m.T, run = Math.min(m.age, m.T) * m.v, hx = m.x0 + m.dx * run, hy = m.y0 + m.dy * run;
      const I = p <= 1 ? curve(m, p) : 0;
      m.ti = p <= 1 ? m.ti + (Math.max(I, m.ti * 0.9) - m.ti) * 0.5 : m.ti * 0.72; // the trail glows on a moment after the head
      if (p > 1 && m.ti < 0.01) {
        if (m.train && m.train.pts.length > 2) {
          const pts = m.train.pts, n = pts.length, raw = pts.map(() => 0.15 + 0.85 * RND() ** 0.7);
          for (let k = 0; k < n; k++) pts[k][2] = (raw[Math.max(0, k - 1)] + raw[k] * 2 + raw[Math.min(n - 1, k + 1)]) / 4; // patchy: brighter knots, thin stretches
          st.trains.push({ pts, age: 0, life: (m.kind === 'fireball' ? rr(260, 380) : rr(100, 200)) * (pv ? 0.6 : 1), a: m.kind === 'fireball' ? 0.3 : 0.22, w: m.w * 0.75, tint: m.tint, ph: RND() * TAU, ph2: RND() * TAU });
        }
        st.met.splice(i, 1); continue;
      }
      if (m.train && p >= m.train.from && p <= m.train.to && m.age % 2 === 0) m.train.pts.push([hx, hy, 0.35 + 0.65 * Math.abs(Math.sin(m.age * 0.37 + m.flick)) ** 0.7]);
      const tint = m.tint2 && p > m.breakAt * 0.85 ? m.tint2 : m.tint, col = TINT[tint][L ? 1 : 0];
      const len = Math.min(run, m.trMax * (p <= 1 ? Math.min(1, 0.4 + p) : 1));
      const tx = hx - m.dx * len, ty = hy - m.dy * len, thick = m.w * 7.5 * (0.7 + 0.3 * Math.min(1, m.ti));
      const sa = L ? 0.75 : 1;
      streak(ctx, streakSpr(col, L), tx, ty, hx, hy, thick, m.ti * sa);
      if (m.kind === 'fireball' || m.kind === 'bright') streak(ctx, streakSpr(col, L), hx - m.dx * len * 0.45, hy - m.dy * len * 0.45, hx, hy, thick * 2.2, m.ti * 0.35 * sa);
      if (I > 0.01) {
        const hs = m.w * (m.kind === 'fireball' ? 9 : 7) * (0.6 + 0.5 * I);
        ctx.globalAlpha = Math.min(1, I * (L ? 0.8 : 1)); ctx.drawImage(headSpr(col, L), hx - hs / 2, hy - hs / 2, hs, hs);
        if (m.kind === 'fireball') {
          const gs = u * 0.2 * Math.min(1.5, I); ctx.globalAlpha = Math.min(1, I * (L ? 0.1 : 0.2)); ctx.drawImage(softSpr(col, L), hx - gs / 2, hy - gs / 2, gs, gs);
          if (p > 0.15 && p < m.breakAt && RND() < 0.6) st.frags.push({ x: hx - m.dx * m.v * RND(), y: hy - m.dy * m.v * RND(), dx: m.dx, dy: m.dy, v: m.v * rr(0.04, 0.18), age: 0, T: rr(6, 16), I: rr(0.2, 0.5), tint: RND() < 0.5 ? m.tint2 : tint, w: m.w * rr(0.18, 0.32), tr: u * 0.008, run: 0 }); // sparks it sheds
        }
      }
      if (m.kind === 'fireball' && !m.broke && p > m.breakAt) { // it breaks up: pieces run on, slower, and burn out
        m.broke = true;
        for (let k = 0, n = 4 + ((RND() * 4) | 0); k < n; k++) {
          const a = Math.atan2(m.dy, m.dx) + (RND() - 0.5) * 0.08, v = m.v * rr(0.55, 0.95);
          st.frags.push({ x: hx, y: hy, dx: Math.cos(a), dy: Math.sin(a), v, age: 0, T: rr(12, 30), I: rr(0.35, 0.8), tint: m.tint2, w: m.w * rr(0.35, 0.6), tr: u * rr(0.02, 0.05), run: 0 });
        }
      }
    }
    for (let i = st.frags.length - 1; i >= 0; i--) {
      const f = st.frags[i];
      f.age++; f.v *= 0.97; f.run += f.v; f.x += f.dx * f.v; f.y += f.dy * f.v;
      const p = f.age / f.T;
      if (p >= 1) { st.frags.splice(i, 1); continue; }
      const I = f.I * (1 - p) ** 1.2 * (0.75 + 0.25 * Math.sin(f.age * 2.3 + i)), col = TINT[f.tint][L ? 1 : 0], len = Math.min(f.run + u * 0.01, f.tr);
      streak(ctx, streakSpr(col, L), f.x - f.dx * len, f.y - f.dy * len, f.x, f.y, f.w * 7, I * (L ? 0.7 : 1));
      const hs = f.w * 7;
      ctx.globalAlpha = Math.min(1, I); ctx.drawImage(headSpr(col, L), f.x - hs / 2, f.y - hs / 2, hs, hs);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 4. mist in the valley, the land in front of it all
    const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#9aa8c8');
    K.mist(ctx, fog, W, S.hz - u * 0.06, u * 0.07, u * 1.7, t * 0.06 * k7, L ? 0.45 : 0.06);
    if (S.land) K.stamp(ctx, S.land, 0, S.ly0, W, H - S.ly0, L ? 0.5 : 0.92);
    ctx.restore();
  };

  /** The picker's still: a bright meteor halfway across, its trail drawn out behind it. */
  window.BG_PV_STILL.shooting = (bg) => {
    const st = bg.st, S = bg.scene;
    if (!st || !S || st.kind !== 'shooting') return 0;
    const V = K.view(bg.w, bg.h, 0.8, 1.7);
    st.met.length = 0;
    spawn(st, V, S, { kind: 'bright', x: V.W * 0.78, y: V.oy + V.H * 0.06, ang: Math.PI * 0.79, T: 22, v: 0.03, tr: 0.55, tint: 'green', train: 0 });
    return 12;
  };
})();
