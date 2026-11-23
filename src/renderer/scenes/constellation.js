'use strict';
/*
 * 별자리: a deep, clear sky with no horizon. Thousands of faint stars in their own colours lie behind a few
 * hundred brighter ones (the brightest twinkle) and a thin, faint Milky Way runs across. One constellation at a
 * time is picked out of it: its stars (true relative positions and brightness, from a small catalogue of thirteen
 * figures: 오리온, 큰곰, 카시오페이아, 백조, 거문고, 전갈, 사자, 황소, 쌍둥이, 페가수스, 큰개, 독수리, 목동) brighten one
 * by one, brightest first, then a pen of light traces its lines stroke by stroke, each star flaring as the line
 * reaches it, and its name fades in beside it. It holds a while, then lines, name and stars fade, and the next figure
 * appears somewhere else, turned a little as the sky turns. Now and then a satellite crawls across.
 * On a light page it is a star chart: stars as ink dots sized by brightness, the lines and the name in ink.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('constellation'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, RND = Math.random, D2R = Math.PI / 180;
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const WHITE = [255, 255, 255];
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);

  /* ---------- star colours by spectral class (B A F G K M): [dark page], [light page: ink] ---------- */
  const SPEC = [
    { w: 0.1, D: [166, 194, 255], L: [38, 66, 140] },
    { w: 0.22, D: [206, 220, 255], L: [42, 54, 108] },
    { w: 0.22, D: [242, 243, 255], L: [50, 54, 82] },
    { w: 0.2, D: [255, 240, 220], L: [76, 64, 64] },
    { w: 0.18, D: [255, 212, 168], L: [106, 72, 50] },
    { w: 0.08, D: [255, 180, 140], L: [120, 62, 50] },
  ];
  const specOf = (R) => { let r = R(); for (let i = 0; i < SPEC.length; i++) { r -= SPEC[i].w; if (r <= 0) return i; } return 2; };

  /*
   * The figures. Stars: [right ascension (h), declination (°), magnitude, spectral class 0..5]. Lines: strokes
   * through the stars, traced in this order (a stroke starts where the pen already is, or jumps).
   */
  const CONS = [
    { ko: '오리온자리', la: 'ORION', s: {
      bet: [5.919, 7.41, 0.45, 5], rig: [5.242, -8.2, 0.13, 0], bel: [5.419, 6.35, 1.64, 0], min: [5.533, -0.3, 2.23, 0], aln: [5.604, -1.2, 1.69, 0],
      alt: [5.679, -1.94, 1.77, 0], sai: [5.796, -9.67, 2.06, 0], mei: [5.586, 9.93, 3.39, 0], s1: [5.59, -4.84, 4.6, 0], s2: [5.588, -5.39, 4.0, 0], iot: [5.591, -5.91, 2.77, 0],
      p1: [4.907, 10.15, 4.65, 1], p2: [4.844, 8.9, 4.35, 1], p3: [4.831, 6.96, 3.19, 2], p4: [4.853, 5.61, 3.68, 0], p5: [4.904, 2.44, 3.72, 0], p6: [4.976, 1.71, 4.47, 4],
      mu: [6.04, 9.65, 4.12, 1], nu: [6.126, 14.77, 4.42, 0], xi: [6.199, 14.21, 4.48, 0], c1: [5.906, 20.28, 4.39, 3], c2: [6.065, 20.14, 4.63, 0] },
      l: [['bel', 'min', 'aln', 'alt', 'bet', 'mei', 'bel'], ['min', 'rig'], ['alt', 'sai'], ['s1', 's2', 'iot'], ['bel', 'p3'], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], ['bet', 'mu', 'nu', 'c1', 'c2'], ['nu', 'xi']] },
    { ko: '큰곰자리', la: 'URSA MAJOR', s: {
      dub: [11.062, 61.75, 1.79, 4], mer: [11.031, 56.38, 2.37, 1], phe: [11.897, 53.69, 2.44, 1], meg: [12.257, 57.03, 3.31, 1], ali: [12.9, 55.96, 1.77, 1],
      miz: [13.399, 54.93, 2.27, 1], alc: [13.42, 54.99, 4.01, 1], alk: [13.792, 49.31, 1.86, 0], omi: [8.504, 60.72, 3.36, 3], u23: [9.526, 63.06, 3.65, 2],
      ups: [9.85, 59.04, 3.78, 2], the: [9.548, 51.68, 3.17, 2], iot: [8.987, 48.04, 3.14, 1], kap: [9.061, 47.16, 3.6, 1], lam: [10.285, 42.91, 3.45, 1],
      mu: [10.372, 41.5, 3.05, 5], nu: [11.308, 33.09, 3.48, 4], xi: [11.303, 31.53, 3.79, 3], psi: [11.161, 44.5, 3.01, 4], chi: [11.768, 47.78, 3.71, 4] },
      l: [['alk', 'miz', 'ali', 'meg', 'phe', 'mer', 'dub', 'meg'], ['dub', 'u23', 'omi'], ['mer', 'ups', 'u23'], ['ups', 'the', 'iot'], ['the', 'kap'], ['phe', 'chi', 'psi', 'mu'], ['psi', 'lam'], ['chi', 'nu', 'xi']] },
    { ko: '카시오페이아자리', la: 'CASSIOPEIA', s: {
      cap: [0.153, 59.15, 2.27, 2], sch: [0.675, 56.54, 2.24, 4], nav: [0.945, 60.72, 2.15, 0], ruc: [1.43, 60.24, 2.68, 1], seg: [1.907, 63.67, 3.37, 0] },
      l: [['cap', 'sch', 'nav', 'ruc', 'seg']] },
    { ko: '백조자리', la: 'CYGNUS', s: {
      den: [20.691, 45.28, 1.25, 1], sad: [20.37, 40.26, 2.23, 2], alb: [19.512, 27.96, 3.05, 4], gie: [20.77, 33.97, 2.48, 4], del: [19.75, 45.13, 2.87, 0],
      zet: [21.216, 30.23, 3.21, 3], eta: [19.938, 35.08, 3.89, 4], iot: [19.495, 51.73, 3.79, 1], kap: [19.285, 53.37, 3.8, 3] },
      l: [['den', 'sad', 'eta', 'alb'], ['kap', 'iot', 'del', 'sad', 'gie', 'zet']] },
    { ko: '거문고자리', la: 'LYRA', s: {
      veg: [18.616, 38.78, 0.03, 1], eps: [18.739, 39.67, 4.67, 1], zet: [18.746, 37.61, 4.36, 1], del: [18.908, 36.9, 4.3, 5], gam: [18.982, 32.69, 3.24, 0], bet: [18.835, 33.36, 3.52, 0] },
      l: [['veg', 'eps', 'zet', 'veg'], ['zet', 'bet', 'gam', 'del', 'zet']] },
    { ko: '전갈자리', la: 'SCORPIUS', s: {
      ant: [16.49, -26.43, 1.06, 5], sig: [16.353, -25.59, 2.89, 0], tau: [16.598, -28.22, 2.82, 0], bet: [16.091, -19.81, 2.62, 0], del: [16.006, -22.62, 2.29, 0],
      pi: [15.981, -26.11, 2.89, 0], rho: [15.948, -29.21, 3.88, 0], nu: [16.2, -19.46, 4.0, 0], eps: [16.836, -34.29, 2.29, 4], mu: [16.864, -38.05, 3.0, 0],
      zet: [16.91, -42.36, 3.62, 4], eta: [17.203, -43.24, 3.33, 2], the: [17.622, -43.0, 1.86, 2], iot: [17.793, -40.13, 3.0, 2], kap: [17.708, -39.03, 2.41, 0],
      lam: [17.56, -37.1, 1.62, 0], ups: [17.513, -37.3, 2.7, 0] },
      l: [['nu', 'bet', 'del', 'pi', 'rho'], ['del', 'sig', 'ant', 'tau', 'eps', 'mu', 'zet', 'eta', 'the', 'iot', 'kap', 'lam', 'ups']] },
    { ko: '사자자리', la: 'LEO', s: {
      reg: [10.14, 11.97, 1.35, 0], eta: [10.122, 16.76, 3.48, 1], alg: [10.333, 19.84, 2.08, 4], zet: [10.278, 23.42, 3.43, 2], mu: [9.879, 26.01, 3.88, 4],
      eps: [9.764, 23.77, 2.97, 3], zos: [11.235, 20.52, 2.56, 1], che: [11.237, 15.43, 3.33, 1], den: [11.818, 14.57, 2.13, 1] },
      l: [['reg', 'eta', 'alg', 'zet', 'mu', 'eps'], ['alg', 'zos', 'den', 'che', 'reg'], ['zos', 'che']] },
    { ko: '황소자리', la: 'TAURUS', s: {
      ald: [4.599, 16.51, 0.86, 4], eln: [5.438, 28.61, 1.65, 0], zet: [5.628, 21.14, 3.0, 0], th2: [4.478, 15.87, 3.4, 1], gam: [4.33, 15.63, 3.65, 4],
      de1: [4.382, 17.54, 3.76, 4], eps: [4.477, 19.18, 3.53, 4], lam: [4.011, 12.49, 3.47, 0], omi: [3.413, 9.03, 3.6, 3], xi: [3.452, 9.73, 3.7, 0],
      alc: [3.791, 24.11, 2.87, 0], atl: [3.819, 24.05, 3.62, 0], ele: [3.748, 24.11, 3.7, 0], mai: [3.764, 24.37, 3.87, 0], mer: [3.772, 23.95, 4.18, 0],
      tay: [3.753, 24.47, 4.3, 0], ple: [3.82, 24.14, 5.05, 0] },
      l: [['zet', 'ald', 'th2', 'gam', 'de1', 'eps', 'eln'], ['gam', 'lam', 'xi', 'omi']] },
    { ko: '쌍둥이자리', la: 'GEMINI', s: {
      cas: [7.577, 31.89, 1.58, 1], pol: [7.755, 28.03, 1.14, 4], alh: [6.629, 16.4, 1.93, 1], tej: [6.383, 22.51, 2.87, 5], pro: [6.248, 22.51, 3.3, 5],
      meb: [6.732, 25.13, 2.98, 3], was: [7.335, 21.98, 3.53, 2], xi: [6.755, 12.9, 3.35, 2], zet: [7.069, 20.57, 3.9, 3], tau: [7.186, 30.25, 4.4, 4],
      kap: [7.741, 24.4, 3.57, 3], iot: [7.429, 27.8, 3.8, 4], lam: [7.302, 16.54, 3.58, 1], nu: [6.483, 20.21, 4.15, 0] },
      l: [['cas', 'tau', 'meb', 'tej', 'pro'], ['meb', 'nu'], ['tau', 'iot', 'pol', 'kap'], ['pol', 'was', 'zet', 'alh'], ['was', 'lam', 'xi']] },
    { ko: '페가수스자리', la: 'PEGASUS', s: {
      mar: [23.079, 15.21, 2.48, 0], sch: [23.063, 28.08, 2.42, 5], alg: [0.221, 15.18, 2.83, 0], alp: [0.14, 29.09, 2.06, 0], eni: [21.736, 9.88, 2.39, 4],
      hom: [22.691, 10.83, 3.4, 0], bih: [22.17, 6.2, 3.53, 1], mat: [22.717, 30.22, 2.94, 3], pi: [22.166, 33.18, 4.3, 2], mu: [22.833, 24.6, 3.48, 4],
      lam: [22.775, 23.57, 3.95, 3], iot: [22.117, 25.35, 3.76, 2], kap: [21.744, 25.65, 4.13, 2] },
      l: [['mar', 'sch', 'alp', 'alg', 'mar'], ['mar', 'hom', 'bih', 'eni'], ['sch', 'mat', 'pi'], ['sch', 'mu', 'lam', 'iot', 'kap']] },
    { ko: '큰개자리', la: 'CANIS MAJOR', s: {
      sir: [6.752, -16.72, -1.46, 1], mir: [6.378, -17.96, 1.98, 0], adh: [6.977, -28.97, 1.5, 0], wez: [7.14, -26.39, 1.83, 2], alu: [7.402, -29.3, 2.45, 0],
      o2: [7.05, -23.83, 3.0, 0], sig: [7.029, -27.93, 3.47, 5], fur: [6.339, -30.06, 3.02, 0], gam: [7.063, -15.63, 4.1, 0], iot: [6.936, -17.05, 4.4, 0], the: [6.903, -12.04, 4.07, 4] },
      l: [['mir', 'sir', 'iot', 'the'], ['iot', 'gam'], ['sir', 'o2', 'wez', 'alu'], ['wez', 'sig', 'adh', 'fur']] },
    { ko: '독수리자리', la: 'AQUILA', s: {
      alt: [19.846, 8.87, 0.76, 1], tar: [19.771, 10.61, 2.72, 4], als: [19.922, 6.41, 3.71, 3], del: [19.425, 3.11, 3.36, 2], zet: [19.09, 13.86, 2.99, 1],
      the: [20.188, -0.82, 3.24, 0], lam: [19.104, -4.88, 3.43, 0], eta: [19.874, 1.01, 3.87, 3], eps: [18.994, 15.07, 4.02, 4] },
      l: [['tar', 'alt', 'als'], ['alt', 'del', 'lam'], ['del', 'zet', 'eps'], ['del', 'eta', 'the']] },
    { ko: '목동자리', la: 'BOÖTES', s: {
      arc: [14.261, 19.18, -0.05, 4], izr: [14.75, 27.07, 2.37, 4], muf: [13.911, 18.4, 2.68, 3], seg: [14.535, 38.31, 3.04, 1], del: [15.258, 33.31, 3.47, 3],
      nek: [15.032, 40.39, 3.5, 3], rho: [14.531, 30.37, 3.58, 4], zet: [14.686, 13.73, 3.78, 1] },
      l: [['arc', 'izr', 'del', 'nek', 'seg', 'rho', 'arc'], ['arc', 'muf'], ['arc', 'zet']] },
  ];
  const DIPPER = ['alk', 'miz', 'alc', 'ali', 'meg', 'phe', 'mer', 'dub'];

  /* ---------- sprites, made once ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** A field star: a firm point in a small soft halo. */
  const starSpr = (c, L) => radial(`csStar|${c}|${L}`, 48, L
    ? [[0, rgba(c, 1)], [0.1, rgba(c, 0.92)], [0.2, rgba(c, 0.3)], [0.45, rgba(c, 0.05)], [1, rgba(c, 0)]]
    : [[0, rgba(mix(c, WHITE, 0.7), 1)], [0.07, rgba(c, 0.92)], [0.18, rgba(c, 0.26)], [0.42, rgba(c, 0.06)], [1, rgba(c, 0)]]);
  /** A figure's star: a larger, brighter disc of light in a wider glow. */
  const brightSpr = (c, L) => radial(`csBright|${c}|${L}`, 64, L
    ? [[0, rgba(c, 1)], [0.1, rgba(c, 1)], [0.16, rgba(c, 0.55)], [0.3, rgba(c, 0.14)], [0.6, rgba(c, 0.03)], [1, rgba(c, 0)]]
    : [[0, 'rgba(255,255,255,1)'], [0.06, rgba(mix(c, WHITE, 0.55), 1)], [0.13, rgba(c, 0.72)], [0.24, rgba(c, 0.24)], [0.5, rgba(c, 0.06)], [1, rgba(c, 0)]]);
  const softSpr = (c, L) => radial(`csSoft|${c}|${L}`, 48, [[0, rgba(c, L ? 0.75 : 1)], [0.3, rgba(c, L ? 0.3 : 0.45)], [0.65, rgba(c, 0.08)], [1, rgba(c, 0)]]);

  /** The name: Korean over the Latin, letter-spaced, as a sprite drawn once per figure. */
  function labelSpr(c, L, u, dpr) {
    const fs = Math.max(11, Math.round(u * 0.0175)), fam = (typeof getComputedStyle === 'function' && getComputedStyle(document.body).getPropertyValue('--ui-font')) || 'sans-serif';
    const q = Math.min(2, dpr || 1), w = Math.ceil(fs * 14), h = Math.ceil(fs * 2.6), cv = K.mk(w * q, h * q), x = cv.getContext('2d');
    x.scale(q, q); x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const ink = L ? [44, 50, 78] : [218, 226, 252];
    x.font = `500 ${fs}px ${fam}`; if ('letterSpacing' in x) x.letterSpacing = `${(fs * 0.12).toFixed(1)}px`;
    x.fillStyle = rgba(ink, L ? 0.82 : 0.78); x.fillText(c.ko, w / 2, fs * 1.15);
    x.font = `400 ${Math.round(fs * 0.62)}px ${fam}`; if ('letterSpacing' in x) x.letterSpacing = `${(fs * 0.3).toFixed(1)}px`;
    x.fillStyle = rgba(ink, L ? 0.55 : 0.46); x.fillText(c.la, w / 2, fs * 2.2);
    return { cv, w, h };
  }

  /* ---------- the sky ---------- */

  /** A thin Milky Way from upper left to lower right, worked out at a third of the size a few rows at a time. */
  function* milkyJob(V, S, L) {
    const { W, H, u, pv } = V, f = pv ? 1 : 3, MW = Math.max(8, Math.ceil(W / f)), MH = Math.max(8, Math.ceil(H / f));
    const n1 = K.fbm(707, 8, 8, 5), n2 = K.fbm(919, 6, 6, 4), n3 = K.fbm(31, 4, 4, 3);
    const x0 = W * 0.08, y0 = -H * 0.06, ang = Math.atan2(H * 1.05, W * 0.92), c = Math.cos(ang), s = Math.sin(ang), curv = -0.25 / u;
    const I = new Float32Array(MW * MH), wid = u * 0.085;
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        const dx = (i + 0.5) * f - x0, dy = (j + 0.5) * f - y0, sa = dx * c + dy * s;
        let d = -dx * s + dy * c - curv * sa * sa * 0.5;
        const wd = wid * (1 + 0.35 * (n3(sa / u * 1.6 + 2, 0.5) - 0.5) + 0.3 * sm(u * 0.2, u * 1.6, sa));
        d += (n3(sa / u * 2.4 + 9, 3.5) - 0.5) * wd * 0.7;
        const q = d / wd;
        if (q * q > 9) continue;
        const u1 = (sa / u) * 4.2, v1 = (d / u) * 9;
        const clump = sm(0.3, 0.8, n1(u1 + 1.3, v1 + 4.7));
        const lane = Math.exp(-(((d - wd * 0.12) / (wd * 0.2)) ** 2)) * sm(0.3, 0.7, n2(u1 * 0.8 + 2.2, v1 * 0.5 + 6.1));
        I[j * MW + i] = Math.exp(-q * q * 1.5) * (0.3 + 0.7 * clump) * (1 - 0.8 * lane);
      }
      if ((j & 7) === 7) yield;
    }
    const cv = K.mk(MW, MH), cx = cv.getContext('2d'), img = cx.createImageData(MW, MH), dd = img.data, col = L ? [96, 108, 150] : [190, 202, 236];
    for (let k = 0; k < MW * MH; k++) {
      const v = I[k];
      if (v < 0.004) continue;
      const o = k * 4; dd[o] = col[0]; dd[o + 1] = col[1]; dd[o + 2] = col[2]; dd[o + 3] = Math.round(Math.min(1, v * 0.6) * 255);
    }
    cx.putImageData(img, 0, 0);
    yield;
    const [st, sc] = K.layer(W, H, S.q), R = K.rng(4041), n = pv ? 40 : Math.round(Math.min(3600, (W * H) / 1e6 * 2200));
    for (let i = 0, tries = 0; i < n && tries < n * 14; tries++) {
      const x = R() * W, y = R() * H, v = I[Math.min(MH - 1, (y / f) | 0) * MW + Math.min(MW - 1, (x / f) | 0)];
      if (R() > v * 1.2) continue;
      i++;
      const sp = SPEC[specOf(R)][L ? 'L' : 'D'], a = (L ? 0.15 : 0.11) + R() * (L ? 0.24 : 0.28), r = (pv ? 0.3 : 0.4) + R() * 0.28;
      sc.fillStyle = rgba(sp, a); sc.beginPath(); sc.arc(x, y, r, 0, TAU); sc.fill();
      if ((i & 511) === 511) yield;
    }
    S.milky = cv; S.mwStars = st; S.mwReady = true;
  }

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(2718), q = bg.dpr || 1;
    const [s1, c1] = K.layer(W, H, q), [s2, c2] = K.layer(W, H, q);
    const n = pv ? 40 : Math.round(Math.min(3400, 1600 * (W * H) / 1e6 + 120)), tw = [];
    for (let i = 0; i < n; i++) {
      const m = Math.max(-0.4, 6.8 + Math.log(R() + 1e-9) / 1.08), x = R() * W, y = R() * H;
      const col = SPEC[specOf(R)][L ? 'L' : 'D'], b = 10 ** (-0.4 * (m - 1)), vis = Math.min(1.3, b ** 0.36);
      if (m < (pv ? 2.4 : 3.2)) { tw.push({ x, y, s: (pv ? 4 : 7) + 11 * Math.min(1, b ** 0.5), a: Math.min(1, 0.5 + 0.4 * vis) * (L ? 0.9 : 1), spr: starSpr(col, L), ph: R() * TAU, f1: 0.04 + R() * 0.06, f2: 0.09 + R() * 0.11, dep: 0.15 + R() * 0.25 }); continue; }
      const c = R() < 0.5 ? c1 : c2, r = ((pv ? 0.3 : 0.4) + 0.75 * Math.min(1, b ** 0.45)) * (pv ? 0.8 : 1), a = Math.min(1, (0.09 + 0.78 * vis) * (L ? 0.95 : 1));
      c.fillStyle = rgba(col, a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    const S = { s1, s2, tw, q, milky: null, mwStars: null, mwReady: false };
    S.job = milkyJob(V, S, L);
    return S;
  }

  /* ---------- a figure ---------- */

  /**
   * Lay a constellation out on the screen: a tangent-plane view centred on it (east to the left, north up), turned
   * by rot, scaled to a size that suits it. Returns its stars, its strokes as segments and its box.
   */
  function layout(c, V, rot, only) {
    const keys = Object.keys(c.s).filter((k) => !only || only.includes(k));
    let ra0 = 0, de0 = 0, sx = 0, sy = 0;
    const r0 = c.s[keys[0]][0];
    for (const k of keys) { let ra = c.s[k][0]; if (ra - r0 > 12) ra -= 24; if (r0 - ra > 12) ra += 24; sx += ra; sy += c.s[k][1]; }
    ra0 = (sx / keys.length) * 15 * D2R; de0 = (sy / keys.length) * D2R;
    const P = {};
    for (const k of keys) {
      const [rh, dd] = c.s[k], ra = rh * 15 * D2R, de = dd * D2R, dra = ra - ra0;
      const cc = Math.sin(de0) * Math.sin(de) + Math.cos(de0) * Math.cos(de) * Math.cos(dra);
      const xi = (Math.cos(de) * Math.sin(dra)) / cc, et = (Math.cos(de0) * Math.sin(de) - Math.sin(de0) * Math.cos(de) * Math.cos(dra)) / cc;
      const x = -xi, y = -et; // east is to the left with north up
      P[k] = [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const k of keys) { x0 = Math.min(x0, P[k][0]); x1 = Math.max(x1, P[k][0]); y0 = Math.min(y0, P[k][1]); y1 = Math.max(y1, P[k][1]); }
    const ext = Math.max(x1 - x0, y1 - y0) / D2R; // degrees
    const span = V.pv ? Math.min(V.W * 0.62, V.H * 2.6) : V.u * Math.max(0.26, Math.min(0.62, 0.17 + 0.0105 * ext)), sc = span / Math.max(x1 - x0, y1 - y0);
    const stars = keys.map((k) => { const [, , m, sp] = c.s[k]; return { k, x: (P[k][0] - (x0 + x1) / 2) * sc, y: (P[k][1] - (y0 + y1) / 2) * sc, m, sp }; });
    const idx = {}; stars.forEach((s, i) => { idx[s.k] = i; });
    const segs = [];
    for (const line of c.l) for (let i = 1; i < line.length; i++) if (idx[line[i - 1]] != null && idx[line[i]] != null) segs.push([idx[line[i - 1]], idx[line[i]]]);
    return { stars, segs, w: (x1 - x0) * sc, h: (y1 - y0) * sc };
  }

  /** A new figure, away from where the last ones were. */
  function newFigure(st, V, o) {
    const { W, H, u, pv } = V;
    let ci = o && o.ci != null ? o.ci : -1;
    if (ci < 0) { do ci = (RND() * CONS.length) | 0; while (st.recent.includes(ci)); }
    st.recent.push(ci); if (st.recent.length > 5) st.recent.shift();
    const c = CONS[ci], rot = o && o.rot != null ? o.rot : (RND() - 0.5) * 0.7, lay = layout(c, V, rot, o && o.only);
    const lab = pv ? null : labelSpr(c, K.light(), u, st.dpr);
    const m = u * (pv ? 0.08 : 0.07), lh = lab ? lab.h + u * 0.03 : 0;
    let best = null, bd = -1;
    for (let k = 0; k < (o && o.x != null ? 1 : 8); k++) {
      const x = o && o.x != null ? o.x : lay.w / 2 + m + RND() * Math.max(0, W - lay.w - 2 * m), y = o && o.y != null ? o.y : lay.h / 2 + m + RND() * Math.max(0, H - lay.h - 2 * m - lh);
      const d = st.spots.reduce((a, p) => Math.min(a, Math.hypot(p[0] - x, p[1] - y)), 1e9);
      if (d > bd) { bd = d; best = [x, y]; }
    }
    st.spots.push(best); if (st.spots.length > 3) st.spots.shift();
    const [cx, cy] = best, stars = lay.stars.map((s) => ({ ...s, x: s.x + cx, y: s.y + cy, flare: 0, b: 10 ** (-0.4 * s.m) }));
    // brightest first: each star's turn to light up
    stars.slice().sort((a, b) => a.m - b.m).forEach((s, i) => { s.on = 6 + i * (pv ? 2 : 4); });
    // the pen: segment by segment, at a pace that suits the figure's size
    let total = 0;
    const segs = lay.segs.map(([a, b]) => { const len = Math.hypot(stars[b].x - stars[a].x, stars[b].y - stars[a].y); total += len; return { a, b, len }; });
    const v = Math.max(u * 0.0075, total / 190);
    let t = 12 + stars.length * (pv ? 2 : 4) * 0.6;
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i], jump = i > 0 && segs[i - 1].b !== sg.a;
      t += jump ? 10 : 2;
      sg.t0 = t; sg.t1 = t + Math.max(7, sg.len / v); t = sg.t1;
    }
    const traced = t, hold = pv ? 9999 : 190 + RND() * 90;
    const labY = cy + lay.h / 2 + u * 0.02 > H - lh ? cy - lay.h / 2 - u * 0.02 - (lab ? lab.h : 0) : cy + lay.h / 2 + u * 0.022;
    return { c, stars, segs, age: 0, traced, fadeAt: traced + hold, end: traced + hold + 100, lab, lx: Math.max(u * 0.02, Math.min(W - u * 0.02, cx)), ly: labY, cx, cy, next: false };
  }

  function init(V, S) {
    return { kind: 'constellation', key: S.key, figs: [], recent: [], spots: [], wait: V.pv ? 1 : 40, sat: null, satIn: 900 + RND() * 1500, mwA: 0, dpr: 1 };
  }

  /** One figure: its lines as far as the pen has got, the pen's light, the stars, the name. */
  function drawFigure(ctx, f, V, L, ink, t) {
    const { u, pv } = V, age = f.age;
    const fadeL = age < f.fadeAt ? 1 : Math.max(0, 1 - (age - f.fadeAt) / 55), fadeS = age < f.fadeAt ? 1 : Math.max(0, 1 - (age - f.fadeAt - 15) / 80);
    const gap = (s) => (pv ? 1.6 : 4.5) + 3.2 * Math.min(1, s.b ** 0.32);
    // the lines
    const path = new Path2D();
    let pen = null;
    for (const sg of f.segs) {
      if (age < sg.t0) break;
      const A = f.stars[sg.a], B = f.stars[sg.b], k = Math.min(1, (age - sg.t0) / (sg.t1 - sg.t0)), e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
      const dx = (B.x - A.x) / sg.len, dy = (B.y - A.y) / sg.len, ga = gap(A), gb = gap(B), run = Math.max(0, sg.len - ga - gb);
      if (run <= 0) continue;
      const x0 = A.x + dx * ga, y0 = A.y + dy * ga, x1 = x0 + dx * run * e, y1 = y0 + dy * run * e;
      path.moveTo(x0, y0); path.lineTo(x1, y1);
      if (k < 1) pen = [x1, y1];
      else if (!sg.hit) { sg.hit = true; B.flare = 1; }
    }
    if (fadeL > 0) {
      ctx.lineCap = 'round';
      if (!L) { ctx.strokeStyle = rgba(ink, 1); ctx.globalAlpha = 0.07 * fadeL; ctx.lineWidth = pv ? 1.6 : 3.4; ctx.stroke(path); }
      ctx.strokeStyle = rgba(ink, 1); ctx.globalAlpha = (L ? 0.55 : 0.52) * fadeL; ctx.lineWidth = pv ? 0.6 : L ? 1 : 0.95; ctx.stroke(path);
      if (pen) { const z = pv ? 8 : u * 0.03; ctx.globalAlpha = (L ? 0.5 : 0.8) * fadeL; ctx.drawImage(softSpr(L ? ink : mix(ink, WHITE, 0.5), L), pen[0] - z / 2, pen[1] - z / 2, z, z); }
    }
    // the stars: they brighten in turn, flare as the line reaches them, twinkle a little
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const s of f.stars) {
      const on = sm(s.on, s.on + 22, age) * fadeS;
      if (on <= 0.004) continue;
      s.flare *= 0.93;
      const tw = 1 - 0.12 * (0.5 + 0.5 * Math.sin(t * 0.09 + s.x * 0.05)) * (0.5 + 0.5 * Math.sin(t * 0.17 + s.y * 0.07));
      const col = SPEC[s.sp][L ? 'L' : 'D'], z = ((pv ? 5 : 13) + (pv ? 9 : 30) * Math.min(1.25, s.b ** 0.4)) * (1 + 0.3 * s.flare);
      ctx.globalAlpha = Math.min(1, on * (0.68 + 0.32 * Math.min(1, s.b ** 0.25)) * tw);
      ctx.drawImage(brightSpr(col, L), s.x - z / 2, s.y - z / 2, z, z);
      if (s.flare > 0.02) { const g = z * 2.4; ctx.globalAlpha = s.flare * on * (L ? 0.25 : 0.35); ctx.drawImage(softSpr(L ? ink : mix(ink, WHITE, 0.6), L), s.x - g / 2, s.y - g / 2, g, g); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // the name
    if (f.lab) {
      const la = sm(f.traced * 0.8, f.traced * 0.8 + 45, age) * fadeL;
      if (la > 0.004) { ctx.globalAlpha = la; ctx.drawImage(f.lab.cv, f.lx - f.lab.w / 2, f.ly, f.lab.w, f.lab.h); }
    }
    ctx.globalAlpha = 1;
  }

  window.BG_EXT.constellation = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'constellation' || st.key !== S.key) { st = bg.st = init(V, S); st.dpr = bg.dpr; }
    if (S.job) { const t0 = performance.now(); while (S.job && (pv || performance.now() - t0 < 5)) if (S.job.next().done) S.job = null; }
    const [a0, a1] = accents(), ink = L ? mix(mix(a0, a1, 0.4), [20, 24, 48], 0.45) : mix(mix(a0, a1, 0.4), WHITE, 0.55);

    // 1. the Milky Way and the stars
    if (S.mwReady) {
      st.mwA = Math.min(1, st.mwA + (pv ? 1 : 0.025));
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = st.mwA * (L ? 0.45 : 0.42); ctx.drawImage(S.milky, 0, 0, W, H);
      ctx.globalAlpha = st.mwA * 0.85; ctx.drawImage(S.mwStars, 0, 0, W, H);
    }
    ctx.globalAlpha = 0.86 + 0.14 * Math.sin(t * 0.019); ctx.drawImage(S.s1, 0, 0, W, H);
    ctx.globalAlpha = 0.86 + 0.14 * Math.sin(t * 0.015 + 2.4); ctx.drawImage(S.s2, 0, 0, W, H);
    for (const s of S.tw) {
      const k = (0.5 + 0.5 * Math.sin(t * s.f1 + s.ph)) * (0.5 + 0.5 * Math.sin(t * s.f2 + s.ph * 1.7));
      ctx.globalAlpha = s.a * (1 - s.dep * k);
      ctx.drawImage(s.spr, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // 2. now and then a satellite, steady and slow; some go dark midway as they pass into the earth's shadow
    if (!pv && !st.sat && --st.satIn <= 0) {
      const a = RND() * TAU, v = u * (0.0009 + RND() * 0.0007), x = W / 2 - Math.cos(a) * (W + H) * 0.6, y = H / 2 - Math.sin(a) * (W + H) * 0.6;
      st.sat = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: 0.3 + RND() * 0.25, dark: RND() < 0.45 ? 0.3 + RND() * 0.4 : 2, age: 0, life: ((W + H) * 1.2) / v };
      st.satIn = 1800 + RND() * 2400;
    }
    if (st.sat) {
      const s = st.sat, p = ++s.age / s.life;
      s.x += s.vx; s.y += s.vy;
      if (p >= 1) st.sat = null;
      else {
        const a = s.a * (p < s.dark ? 1 : Math.max(0, 1 - (p - s.dark) * 25)) * (0.92 + 0.08 * Math.sin(s.age * 0.3)), z = 5;
        if (a > 0.01) { ctx.globalAlpha = a; ctx.drawImage(starSpr(L ? [40, 48, 80] : [236, 238, 250], L), s.x - z / 2, s.y - z / 2, z, z); ctx.globalAlpha = 1; }
      }
    }

    // 3. the figures: a new one when the last begins to fade
    if (--st.wait <= 0 && !st.figs.some((f) => f.age < f.fadeAt)) { st.figs.push(newFigure(st, V)); }
    for (let i = st.figs.length - 1; i >= 0; i--) {
      const f = st.figs[i];
      f.age++;
      if (f.age >= f.end) { st.figs.splice(i, 1); continue; }
      if (f.age >= f.fadeAt && !f.next) { f.next = true; st.wait = 30; }
      drawFigure(ctx, f, V, L, ink, t);
    }
  };

  /** The picker's still: the Big Dipper, traced, across the middle of the strip. */
  window.BG_PV_STILL.constellation = (bg) => {
    const st = bg.st;
    if (!st || st.kind !== 'constellation') return 0;
    const V = K.view(bg.w, bg.h, 0.5, 1);
    st.figs.length = 0;
    const f = newFigure(st, V, { ci: 1, only: DIPPER, rot: 0.12, x: V.W * 0.52, y: V.H * 0.5 });
    f.age = Math.round(f.traced) + 30;
    for (const sg of f.segs) sg.hit = true;
    st.figs.push(f);
    return 2;
  };
})();
