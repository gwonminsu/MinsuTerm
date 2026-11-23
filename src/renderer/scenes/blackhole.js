'use strict';
/*
 * 블랙홀: a black hole seen almost edge-on, leaning a little. A thin accretion disk of hot plasma streams around
 * it, the inner rings faster than the outer (each ring turns at its own Kepler speed, so the clumps shear into
 * streaks); the side coming toward us is brighter and whiter, the side going away dimmer and redder. Its far side
 * shows twice: once flat behind the shadow, and once bent by the hole into a bright band that wraps over the top
 * of the shadow; a thinner second image wraps under it, a thin photon ring rims it, and the stars behind are pulled
 * into arcs as they drift past. Every half minute or so a clump of gas falls in: it is drawn out into a streak as it
 * spirals down (its far part showing on the band over the top too) and flares at the inner edge.
 * Hot-plasma colours (not the accents). On a light page it is drawn in deeper tones over the page, not inverted.
 *
 * How: each ring of the disk is a white noise texture, turned every frame and squashed into the image it makes
 * (the near half, the far half, the band over the top, the second image) in its own buffer; a colour map made once (temperature, Doppler
 * brightening, the disk's edges) then colours each buffer in one 'source-in' pass.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('blackhole'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2;
  const RIN = 1.2, ROUT = 4.6, NR = 8; // the disk's inner and outer edge, in shadow radii; NR rings, each turning at its own speed
  const COSI = 0.15; // seen nearly edge-on
  const ROLL = -0.16; // the whole system leans a little
  const W0 = 0.02; // the inner edge's angular speed, radians a frame (~10 s a turn); outer rings slower, as r^-1.5
  const SEC0 = 1.012, SECW = 0.12; // the second image: a thin ring just outside the shadow, seen mostly under it
  const ARC0 = 1.07, ARCW = 0.56, ASQ = 0.96, RA1 = ROUT + 0.7; // the far side bent over the shadow: a band from ARC0 to ARC0 + ARCW (the disk out to RA1, where it has faded), nearly round
  const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  /** Where a ring of radius r shows: flat, a thin ellipse (bent out a little near the hole); and, for the far side, in the band over the shadow. */
  const lowF = (r) => r * COSI + 0.16 * Math.sqrt(RIN / r);
  const arcF = (r) => ARC0 + ARCW * Math.pow(Math.max(0, Math.min(1, (r - RIN) / (RA1 - RIN))), 0.6);
  const secF = (r) => SEC0 + SECW * (1 - RIN / r);
  function table(fn) {
    const n = 6000, a = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) a[i] = fn(0.6 + i * 0.001);
    return (r) => { const f = (r - 0.6) * 1000, i = f | 0; return i < 0 ? a[0] : i >= n ? a[n] : a[i] + (a[i + 1] - a[i]) * (f - i); };
  }
  const LOW = table(lowF);

  // the rings: geometric widths (thinner inside, where the speed changes fastest), feathered into each other
  const BD = Array.from({ length: NR + 1 }, (_, i) => RIN * Math.pow(ROUT / RIN, i / NR));
  const FE = BD.map((b, i) => 0.34 * (i < NR ? BD[i + 1] - b : b - BD[i - 1]));
  const RM = Array.from({ length: NR }, (_, i) => Math.sqrt(BD[i] * BD[i + 1]));
  const RMIN = RM.map((_, i) => (i === 0 ? 0.86 : BD[i] - FE[i]));
  const RMAX = RM.map((_, i) => (i === NR - 1 ? ROUT + 0.9 : BD[i + 1] + FE[i + 1]));
  const wgt = (i, r) => (r < RMIN[i] || r > RMAX[i] ? 0 : (i === 0 ? 1 : sm(BD[i] - FE[i], BD[i] + FE[i], r)) * (i === NR - 1 ? 1 : 1 - sm(BD[i + 1] - FE[i + 1], BD[i + 1] + FE[i + 1], r)));
  const OMEGA = RM.map((r) => W0 * Math.pow(RIN / r, 1.5));
  const KN = RM.map((r) => lowF(r) / r), KA = RM.map((r) => arcF(r) / r), KS = RM.map((r) => secF(r) / r); // each ring's squash in each image
  /** How strongly the band over the top shows at the sine of its angle above the disk (it fades where it meets the disk). */
  const arcFade = (sv) => 0.45 + 0.55 * sm(0, 0.45, sv);

  /** Plasma colour by temperature (1 = the inner edge; more where it comes toward us, less where it goes away). */
  const RAMP_D = [[0, [70, 14, 10]], [0.22, [150, 38, 20]], [0.38, [215, 82, 34]], [0.55, [250, 135, 60]], [0.72, [255, 185, 110]], [0.88, [255, 212, 148]], [1.02, [255, 228, 182]], [1.25, [255, 240, 214]], [1.6, [248, 244, 240]]];
  const RAMP_L = [[0, [96, 24, 30]], [0.3, [140, 30, 24]], [0.5, [172, 48, 14]], [0.7, [192, 74, 8]], [0.9, [200, 102, 8]], [1.1, [190, 122, 22]], [1.6, [150, 118, 70]]];
  function ramp(T, L) {
    const R = L ? RAMP_L : RAMP_D;
    if (T <= R[0][0]) return R[0][1];
    for (let i = 1; i < R.length; i++) if (T <= R[i][0]) { const [t0, a] = R[i - 1], [t1, b] = R[i], k = (T - t0) / (t1 - t0); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
    return R[R.length - 1][1];
  }
  /** Doppler factor of the disk at radius r and azimuth with cosine cph (left side, cph < 0, comes toward us). */
  const dop = (r, cph) => { const b = 0.28 * Math.sqrt(RIN / r); return Math.sqrt(1 - b * b) / (1 + b * cph); };

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }

  /* ---------- the build (a generator: spread over frames, ~9 ms at a time) ---------- */

  /** A ring of the disk: white, its alpha the plasma's density, streaked along the orbit. */
  function* ringTex(st, i) {
    const sp = st.S * st.q, R0 = RMIN[i], R1 = RMAX[i], D = Math.ceil(2 * R1 * sp) + 2, h = D / 2;
    const c = K.mk(D, D), img = c.getContext('2d').createImageData(D, D), d = img.data, { f1, f2, f3 } = st;
    for (let py = 0; py < D; py++) {
      const dy = (py + 0.5 - h) / sp;
      if (Math.abs(dy) <= R1) {
        for (let px = 0; px < D; px++) {
          const dx = (px + 0.5 - h) / sp, r = Math.sqrt(dx * dx + dy * dy);
          if (r < R0 || r > R1) continue;
          const wv = wgt(i, r);
          if (wv <= 0) continue;
          const u = Math.atan2(dy, dx) / TAU + 0.5;
          const s1 = sm(0.32, 0.74, f1(u * 8, r * 6.5)), s2 = sm(0.32, 0.84, f2(u * 22, r * 2.4)), s3 = sm(0.2, 0.8, f3(u * 64, r * 22));
          const dn = Math.min(1, (0.12 + 0.46 * s1 + 0.5 * s1 * s2) * (0.6 + 0.65 * s3));
          const k = (py * D + px) * 4;
          d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(255 * wv * dn);
        }
      }
      if (py % 12 === 11) yield;
    }
    c.getContext('2d').putImageData(img, 0, 0);
    st.tex[i] = c;
  }

  /** A buffer for one image of the disk (in the disk's own frame: x right, y down, the hole at ox, oy). */
  function buffer(st, x0, x1, y0, y1) {
    const sp = st.S * st.q, cw = Math.ceil((x1 - x0) * sp), ch = Math.ceil((y1 - y0) * sp);
    const c = K.mk(cw, ch), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    return { c, x, cw, ch, ox: Math.round(-x0 * sp), oy: Math.round(-y0 * sp), map: null };
  }

  /** Its colour map: which radius of the disk each pixel shows, and so its colour and brightness. */
  function* colourMap(st, b, mode) {
    const sp = st.S * st.q, L = st.L, { cw, ch, ox, oy } = b, R1 = ROUT + 0.9;
    const img = new ImageData(cw, ch), d = img.data;
    const ks = mode === 'arc' ? KA : mode === 'sec' ? KS : KN;
    for (let py = 0; py < ch; py++) {
      const Y = (py + 0.5 - oy) / sp;
      for (let px = 0; px < cw; px++) {
        const X = (px + 0.5 - ox) / sp;
        let r, cph, gain = mode === 'near' ? 1.9 : 1, cov = 0; // the near side, across the shadow, a little stronger
        if (mode === 'sec') {
          const rho = Math.sqrt(X * X + (Y / 0.96) ** 2);
          if (rho < SEC0 - 0.006 || rho > SEC0 + SECW * 0.96) continue;
          r = Math.min(R1, RIN / Math.max(0.04, 1 - (Math.max(rho, SEC0) - SEC0) / SECW));
          cph = X / rho;
          gain = 0.95 * (0.22 + 0.78 * sm(-0.3, 0.75, Y / 0.96 / rho)); // under the shadow; over it the band takes over
          for (let i = 0; i < NR; i++) cov += wgt(i, rho / ks[i]);
        } else if (mode === 'arc') {
          if (Y >= 0) continue;
          const rho = Math.sqrt(X * X + (Y / ASQ) ** 2);
          if (rho < ARC0 - 0.01 || rho > ARC0 + ARCW + 0.02) continue;
          const tt = Math.max(0, Math.min(1, (rho - ARC0) / ARCW));
          r = RIN + Math.pow(tt, 1 / 0.6) * (RA1 - RIN);
          cph = X / rho;
          gain = 3.2 * arcFade(-Y / ASQ / rho) * (1 - 0.6 * Math.sqrt(tt)) * (1.25 - 0.25 * Math.abs(cph)); // brightest along its inner rim, fading outward
          for (let i = 0; i < NR; i++) cov += wgt(i, rho / ks[i]);
        } else {
          const fn = LOW;
          if (mode === 'far' ? Y >= 0 : Y <= 0) continue;
          const F = (q) => (X / q) ** 2 + (Y / fn(q)) ** 2; // falls as q grows: find where it crosses 1
          if (F(R1) > 1 || F(0.86) < 1) continue;
          let lo = 0.86, hi = R1;
          for (let n = 0; n < 17; n++) { const m = (lo + hi) * 0.5; if (F(m) > 1) lo = m; else hi = m; }
          r = (lo + hi) * 0.5; cph = X / r;
          for (let i = 0; i < NR; i++) cov += wgt(i, Math.sqrt(X * X + (Y / ks[i]) ** 2)); // the rings, each squashed its own way, overlap a little: even it out
        }
        const g = dop(r, cph);
        const rad = sm(RIN - 0.05, RIN + 0.12, r) * Math.pow(RIN / r, 1.1) * (1 - sm(ROUT - 1.5, ROUT + 0.7, r));
        const a = Math.min(1, rad * Math.pow(g, 2) * (L ? 2.6 : 1.75) * gain / Math.max(0.45, cov)); // on a light page it is drawn as deep colour over the page: it needs more body
        if (a <= 0.002) continue;
        const col = ramp(0.86 * Math.pow(RIN / r, 0.6) * Math.pow(g, 0.8), L), k = (py * cw + px) * 4;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(a * 255);
      }
      if (py % 5 === 4) yield;
    }
    b.map = K.mk(cw, ch); b.map.getContext('2d').putImageData(img, 0, 0);
  }

  /** The thin photon ring at the shadow's edge, brighter on the side the disk comes toward us. */
  function photonRing(st) {
    const sp = st.S * st.q, L = st.L, E = 1.32, D = Math.ceil(2 * E * sp) + 2, h = D / 2;
    const c = K.mk(D, D), x = c.getContext('2d'), img = x.createImageData(D, D), d = img.data;
    const sg = Math.max(0.007, (L ? 0.9 : 0.65) / sp); // at least a pixel wide
    for (let py = 0; py < D; py++) for (let px = 0; px < D; px++) {
      const X = (px + 0.5 - h) / sp, Y = (py + 0.5 - h) / sp, rho = Math.sqrt(X * X + Y * Y);
      if (rho > E || rho < 0.85) continue;
      const core = Math.exp(-(((rho - (L ? 0.986 : 1.004)) / sg) ** 2)), halo = (L ? 0.3 : 0.22) * Math.exp(-(((rho - 1.03) / 0.07) ** 2)); // on a light page a pale highlight just inside the ink's edge
      const side = (1 - 0.5 * (X / rho)) / 1.5, a = Math.min(1, (core + halo) * side);
      if (a < 0.003) continue;
      const m = core / (core + halo + 1e-6), k = (py * D + px) * 4;
      const col = L ? [178 + 77 * m, 98 + 142 * m, 30 + 176 * m] : [255, 168 + 76 * m, 92 + 120 * m];
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(a * 255 * (L ? 0.9 : 1));
    }
    x.putImageData(img, 0, 0);
    return { c, r: D / 2 / sp };
  }

  const STARC = ['236,238,255', '206,220,255', '255,228,196', '40,38,56'];
  function stars(W, H, pv) {
    const n = pv ? 24 : Math.round(W * H * 0.00016);
    return Array.from({ length: n }, () => {
      const m = Math.random() ** 2.4;
      return { x: Math.random() * W, y: Math.random() * H, z: Math.random(), m, s: (pv ? 1.2 : 1.7) + m * (pv ? 1 : 2.6), c: (Math.random() * 3) | 0, ph: Math.random() * TAU };
    });
  }

  function init(w, h, q, L, pv, key, t) {
    const S = pv ? Math.min(h * 0.2, w / 11.5) : Math.max(24, Math.min(Math.min(w, h) * 0.078, w / 11.5, 110));
    const st = {
      key, L, pv, q, S, ready: false, fade: 0,
      cx: pv ? w * 0.5 : w > h * 1.1 ? w * 0.64 : w * 0.5, cy: pv ? h * 0.57 : h * 0.46,
      f1: K.fbm(11, 8, 64, 5), f2: K.fbm(23, 24, 32, 3), f3: K.fbm(37, 64, 128, 2),
      tex: [], ang: RM.map((_, i) => i * 1.7), stars: stars(w, h, pv),
      fall: null, nextFall: t + (pv ? 40 : 200 + Math.random() * 160), flares: [], ringFlash: 0,
    };
    st.far = buffer(st, -(ROUT + 0.9), ROUT + 0.9, -(lowF(ROUT + 0.9) + 0.12), 0.06);
    st.near = buffer(st, -(ROUT + 0.9), ROUT + 0.9, -0.06, lowF(ROUT + 0.9) + 0.12);
    st.arc = buffer(st, -(ARC0 + ARCW + 0.08), ARC0 + ARCW + 0.08, -(ARC0 + ARCW + 0.08), 0.06);
    st.sec = buffer(st, -1.16, 1.16, -1.14, 1.14);
    st.job = (function* () {
      for (let i = 0; i < NR; i++) yield* ringTex(st, i);
      yield* colourMap(st, st.near, 'near');
      yield* colourMap(st, st.far, 'far');
      yield* colourMap(st, st.arc, 'arc');
      yield* colourMap(st, st.sec, 'sec');
      st.ring = photonRing(st);
      // a warm haze about the disk (lit more on the side coming toward us)
      const gw = 7, gh = 4, gq = Math.max(0.5, q * 0.5), g = K.mk(2 * gw * S * gq, 2 * gh * S * gq), gx = g.getContext('2d');
      gx.scale(gq * S, gq * S); gx.translate(gw, gh);
      if (L) K.glow(gx, -0.5, -0.3, 5.5, [[0, 'rgba(176,84,30,0.05)'], [0.5, 'rgba(160,70,30,0.018)'], [1, 'rgba(160,70,30,0)']], 1, 0.5);
      else {
        K.glow(gx, -0.5, -0.2, 6.5, [[0, 'rgba(255,150,80,0.085)'], [0.4, 'rgba(240,110,60,0.032)'], [1, 'rgba(240,110,60,0)']], 1, 0.5);
        K.glow(gx, -0.4, -0.35, 2.7, [[0, 'rgba(255,205,150,0.12)'], [0.5, 'rgba(255,150,80,0.045)'], [1, 'rgba(255,150,80,0)']], 1, 0.78);
      }
      st.glow = { c: g, w: gw, h: gh };
    })();
    // sprites
    const LD = L ? 'L' : 'D';
    st.erase = radial('bhErase', 128, [[0, 'rgba(0,0,0,0.93)'], [0.8, 'rgba(0,0,0,0.93)'], [0.87, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]); // drawn 2.3 S across: the edge at 1.0
    st.shade = L ? radial('bhShadeL2', 128, [[0, 'rgba(60,30,14,0.1)'], [0.52, 'rgba(60,30,14,0.08)'], [0.75, 'rgba(70,36,16,0.03)'], [1, 'rgba(70,36,16,0)']]) : null; // drawn 3.8 S across: a faint shading about the hole
    st.ink = radial(`bhInk${LD}`, 128, L
      ? [[0, 'rgba(8,5,4,0.98)'], [0.45, 'rgba(12,7,5,0.96)'], [0.7, 'rgba(26,14,9,0.88)'], [0.8, 'rgba(46,25,13,0.76)'], [0.855, 'rgba(64,34,16,0.6)'], [0.875, 'rgba(64,34,16,0.16)'], [0.895, 'rgba(64,34,16,0)'], [1, 'rgba(64,34,16,0)']]
      : [[0, 'rgba(1,1,3,0.88)'], [0.8, 'rgba(1,1,3,0.88)'], [0.87, 'rgba(1,1,3,0)'], [1, 'rgba(1,1,3,0)']]);
    st.dot = radial(`bhDot${LD}`, 32, L
      ? [[0, 'rgba(150,64,10,0.95)'], [0.3, 'rgba(168,72,18,0.5)'], [0.65, 'rgba(168,72,18,0.1)'], [1, 'rgba(168,72,18,0)']]
      : [[0, 'rgba(255,250,240,1)'], [0.22, 'rgba(255,218,165,0.75)'], [0.55, 'rgba(255,140,64,0.16)'], [1, 'rgba(255,120,50,0)']]);
    st.flare = radial(`bhFlare${LD}`, 96, L
      ? [[0, 'rgba(160,74,12,0.7)'], [0.25, 'rgba(176,84,20,0.3)'], [0.6, 'rgba(176,84,20,0.06)'], [1, 'rgba(176,84,20,0)']]
      : [[0, 'rgba(255,252,244,1)'], [0.1, 'rgba(255,230,190,0.75)'], [0.3, 'rgba(255,165,85,0.26)'], [0.65, 'rgba(225,95,45,0.06)'], [1, 'rgba(225,95,45,0)']]);
    st.star = L ? [radial('bhStarL', 16, [[0, 'rgba(40,38,56,0.9)'], [0.4, 'rgba(40,38,56,0.35)'], [1, 'rgba(40,38,56,0)']])]
      : STARC.slice(0, 3).map((c, i) => radial(`bhStar${i}`, 16, [[0, `rgba(${c},1)`], [0.3, `rgba(${c},0.55)`], [0.6, `rgba(${c},0.12)`], [1, `rgba(${c},0)`]]));
    return st;
  }

  /* ---------- every frame ---------- */

  /** Turn the rings and lay them into one image of the disk, then colour it. */
  function paint(b, st, mode) {
    const c = b.x;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, b.cw, b.ch);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NR; i++) {
      const T = st.tex[i], hD = T.width / 2, cs = Math.cos(st.ang[i]), sn = Math.sin(st.ang[i]);
      if (mode === 'sec') { const s = KS[i]; c.setTransform(s * cs, -0.96 * s * sn, -s * sn, -0.96 * s * cs, b.ox, b.oy); } // mirrored: the far side, seen under the hole
      else if (mode === 'arc') { const k = KA[i]; c.setTransform(k * cs, ASQ * k * sn, -k * sn, ASQ * k * cs, b.ox, b.oy); } // the far side, seen over the hole
      else { const k = KN[i]; c.setTransform(cs, k * sn, -sn, k * cs, b.ox, b.oy); }
      c.drawImage(T, -hD, -hD);
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in'; c.drawImage(b.map, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }
  function put(ctx, b, q, alpha) {
    if (alpha <= 0.004) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(b.c, -b.ox / q, -b.oy / q, b.cw / q, b.ch / q);
  }

  /** Where a point of the disk (radius r, azimuth ph) shows, in shadow radii: img 0 flat (its far side behind the shadow), img 1 the far side on the band over the top. */
  const place = (r, ph, img) => { const c = Math.cos(ph), s = Math.sin(ph); if (img) { const a = arcF(r); return [a * c, ASQ * a * s]; } return [r * c, LOW(r) * s]; };

  /** Something falling in: a path that spirals down, faster and faster, and ends on the near side in view. */
  function newFall(pv) {
    const big = Math.random() < 0.22, r0 = 3.1 + Math.random() * 1.2, N = Math.round((pv ? 150 : 230) + Math.random() * 90);
    const sweep = (1.05 + Math.random() * 0.55) * TAU, end = Math.PI * (0.58 + Math.random() * 0.3);
    const rs = new Float32Array(N + 1), ps = new Float32Array(N + 1), dw = new Float32Array(N + 1);
    let tot = 0;
    for (let k = 0; k <= N; k++) { rs[k] = RIN + (r0 - RIN) * (1 - Math.pow(k / N, 1.8)); dw[k] = Math.pow(RIN / rs[k], 1.5); tot += dw[k]; }
    let ph = end + sweep;
    for (let k = 0; k <= N; k++) { ph -= (dw[k] / tot) * sweep; ps[k] = ph; }
    return { rs, ps, N, k: 0, end: 0, size: big ? 1.35 : 0.85 + Math.random() * 0.3 };
  }
  /** One frame on: false once it is gone. Reaching the inner edge it flares. */
  function stepFall(st, f) {
    if (f.k < f.N) f.k++; else f.end++;
    if (f.k === f.N && f.end === 1) {
      const [x, y] = place(f.rs[f.N], f.ps[f.N], 0);
      st.flares.push({ x: x * st.S, y: y * st.S, life: 1, size: f.size });
      st.ringFlash = Math.min(1, 0.6 + 0.4 * f.size);
    }
    return f.end < 12;
  }
  /** Its streak: the back pass draws the flat image's far side (the shadow then hides it), the front pass the near side and the band over the top. */
  function drawFall(ctx, st, f, back) {
    const S = st.S, s = f.k / f.N, trail = 3 + 62 * Math.pow(s, 1.5);
    const fade = Math.min(1, f.k / 45) * (f.end ? Math.max(0, 1 - f.end / 12) : 1);
    if (fade <= 0) return;
    const base = (st.L ? 0.5 : 0.6) * fade * (0.3 + 0.7 * s) * Math.min(1.6, dop(f.rs[f.k], Math.cos(f.ps[f.k])) ** 2);
    for (const img of back ? [0] : [0, 1]) {
      let r0 = f.rs[f.k], p0 = f.ps[f.k];
      for (let j = f.k - 1, used = 0; j >= 0 && used < trail; j--, used++) {
        const r1 = f.rs[j], p1 = f.ps[j], n = Math.max(1, Math.ceil(((Math.abs(p1 - p0) * Math.max(r0, r1) + Math.abs(r1 - r0)) * S) / 1.4));
        for (let m = 0; m < n; m++) {
          const age = (used + m / n) / trail;
          if (age >= 1) break;
          const r = r0 + ((r1 - r0) * m) / n, ph = p0 + ((p1 - p0) * m) / n, sn = Math.sin(ph);
          if (img === 0 ? sn < 0 !== back : sn >= 0) continue;
          const [x, y] = place(r, ph, img), sz = S * f.size * 0.17 * (1 - 0.6 * age) * (0.75 + 0.5 * s) * (img ? 0.8 : 1);
          ctx.globalAlpha = Math.min(1, base * (1 - age) ** 1.5 * (img ? arcFade(-sn) : 1));
          ctx.drawImage(st.dot, x * S - sz, y * S - sz, sz * 2, sz * 2);
        }
        r0 = r1; p0 = p1;
      }
    }
  }

  window.BG_EXT.blackhole = function (bg, ctx, w, h, t) {
    const L = K.light(), pv = h < 90, q = Math.max(1, Math.min(2, bg.dpr || 1));
    const key = `${w}x${h}@${q}${L ? 'L' : 'D'}`;
    let st = bg.bh;
    if (!st || st.key !== key) {
      // a resize: the old picture stands in (and the disk keeps turning) until the new one is built
      const prev = st && st.L === L && st.pv === pv ? (st.ready ? st : st.prev) : null;
      st = bg.bh = init(w, h, q, L, pv, key, t);
      if (prev) Object.assign(st, { prev, fade: 1, ang: prev.ang.slice(), fall: prev.fall, nextFall: prev.nextFall });
    }
    if (!st.ready) {
      const t0 = performance.now();
      while (performance.now() - t0 < (pv ? 40 : 9)) if (st.job.next().done) { st.ready = true; st.prev = null; break; }
    }
    const cur = st.ready ? st : st.prev;
    if (cur) render(ctx, cur, w, h, t, bg.dpr || 1);
  };

  function render(ctx, st, w, h, t, dpr) {
    const { L, pv, q } = st;
    st.fade = Math.min(1, st.fade + (pv ? 0.25 : 0.03));
    const { S, cx, cy } = st, fd = st.fade * st.fade, add = L ? 'source-over' : 'lighter';
    for (let i = 0; i < NR; i++) st.ang[i] -= OMEGA[i];
    const breath = 0.92 + 0.08 * Math.sin(t * 0.0071) * Math.sin(t * 0.0023 + 1); // the disk's light swells and settles, slowly

    ctx.save();
    // the stars behind, bent around the hole: each shows twice (outside and, faintly, inside the Einstein ring)
    const thE = 1.75 * S, v = pv ? 0.04 : 0.05;
    ctx.globalCompositeOperation = add;
    for (const s of st.stars) {
      s.x -= v * (0.6 + 0.8 * s.z);
      if (s.x < -12) { s.x += w + 24; s.y = Math.random() * h; }
      const dx = s.x - cx, dy = s.y - cy, b = Math.max(0.5, Math.hypot(dx, dy)), ux = dx / b, uy = dy / b, rt = Math.sqrt(b * b + 4 * thE * thE);
      const al = fd * (L ? 0.12 + 0.36 * s.m : 0.22 + 0.7 * s.m) * (0.82 + 0.18 * Math.sin(s.ph + t * 0.045 * (0.4 + s.z)));
      const spr = st.star[L ? 0 : s.c];
      for (let img = 0; img < 2; img++) {
        const th = img ? (rt - b) / 2 : (b + rt) / 2; // distance of the image from the hole
        if (img && th < 0.98 * S) break; // the inner image is hidden by the shadow
        const tang = Math.min(pv ? 2.5 : 16, th / b), radl = Math.max(0.55, img ? (1 - b / rt) / 2 : (1 + b / rt) / 2), sgn = img ? -1 : 1;
        const x = cx + sgn * ux * th, y = cy + sgn * uy * th, sz = s.s;
        ctx.globalAlpha = Math.min(1, al * (img ? 0.8 : 1));
        if (tang < 1.15) { ctx.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz); continue; }
        if (tang < 5) { // smeared along the ring around the hole (soft: the sprite keeps its glow), and brightened
          const k = Math.min(1, 1 + 0.12 * tang), sw = sz * (1 + 0.6 * (tang - 1)), sh = sz * Math.max(0.7, radl);
          ctx.globalAlpha = Math.min(1, al * k * (img ? 0.8 : 1));
          ctx.setTransform(-uy * dpr, ux * dpr, ux * dpr, uy * dpr, x * dpr, y * dpr);
          ctx.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          continue;
        }
        const an = Math.atan2(sgn * uy, sgn * ux), half = (sz * tang * 0.3) / th, col = STARC[L ? 3 : s.c]; // nearly behind the hole: drawn out into a short arc
        ctx.lineCap = 'round';
        for (const [lw, a] of [[sz * 1.3, 0.16], [sz * 0.7, 0.3], [Math.max(1, sz * 0.32), 0.8]]) {
          ctx.strokeStyle = `rgba(${col},${Math.min(1, al * a * (img ? 0.8 : 1))})`; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(cx, cy, th, an - half, an + half); ctx.stroke();
        }
      }
    }

    ctx.translate(cx, cy); ctx.rotate(ROLL);
    // haze, then the far half of the disk (flat, behind the hole)
    ctx.globalAlpha = fd; ctx.drawImage(st.glow.c, -st.glow.w * S, -st.glow.h * S, st.glow.w * 2 * S, st.glow.h * 2 * S);
    const dk = fd * breath;
    paint(st.far, st, 'far'); put(ctx, st.far, q, dk);
    if (st.fall && !stepFall(st, st.fall)) { st.fall = null; st.nextFall = t + (pv ? 150 : 540 + Math.random() * 900); }
    if (st.fall) drawFall(ctx, st, st.fall, true);
    // the shadow: it hides what is behind it (on a light page a deep ink core that softens at its edge, with a faint shading about it)
    const E = 1.15 * S;
    ctx.globalAlpha = fd;
    if (st.shade) { const E2 = 1.9 * S; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(st.shade, -E2, -E2, E2 * 2, E2 * 2); }
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(st.erase, -E, -E, E * 2, E * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(st.ink, -E, -E, E * 2, E * 2);
    ctx.globalCompositeOperation = add;
    // the far side again, bent by the hole into a band over the top; the second image under it; the photon ring at
    // its edge; then the near half of the disk across its front
    paint(st.arc, st, 'arc'); put(ctx, st.arc, q, dk);
    paint(st.sec, st, 'sec'); put(ctx, st.sec, q, dk);
    const rf = st.ringFlash, ra = fd * (0.82 + 0.1 * Math.sin(t * 0.05) + 0.08 * Math.sin(t * 0.131)) * (1 + 1.4 * rf), R = st.ring.r * S;
    for (let a = ra; a > 0.004; a -= 1) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(st.ring.c, -R, -R, R * 2, R * 2); }
    st.ringFlash *= 0.965;
    paint(st.near, st, 'near'); put(ctx, st.near, q, dk);

    // something falling in, and the flare where it goes
    if (st.fall) drawFall(ctx, st, st.fall, false);
    if (!st.fall && t >= st.nextFall && st.fade >= 1) st.fall = newFall(pv);
    for (let i = st.flares.length - 1; i >= 0; i--) {
      const f = st.flares[i];
      f.life -= 0.02;
      if (f.life <= 0) { st.flares.splice(i, 1); continue; }
      const r = S * f.size * (0.6 + 1.7 * (1 - f.life) ** 0.6), core = Math.max(0, 1 - (1 - f.life) * 4); // a hot core for the first moments, then the glow spreads and fades
      ctx.globalAlpha = Math.min(1, (L ? 0.55 : 0.95) * f.life ** 1.4);
      ctx.drawImage(st.flare, f.x - r, f.y - r, r * 2, r * 2);
      if (core > 0) { const rc = S * f.size * 0.45; ctx.globalAlpha = core * (L ? 0.6 : 1); ctx.drawImage(st.flare, f.x - rc, f.y - rc, rc * 2, rc * 2); }
    }
    ctx.restore();
  }
})();
