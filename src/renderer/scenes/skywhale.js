'use strict';
/*
 * 하늘 고래: dawn over a sea of cloud, seen from above it. Banks of cumulus lie one behind another to the horizon,
 * heaped into domes with troughs between, lit by a low sun on the right (bright crests, cool hollows) and drifting at
 * their own pace; a few islands of cloud and a veil of cirrus float higher up, and the last stars fade. Now and then
 * a humpback swims across: far off behind a bank, half sunk in the clouds, or huge and close up in the open sky. The
 * tail stock bends and the flukes pitch as it beats, the head nods against the stroke, the long pale flippers sweep
 * like slow wings; sometimes a calf keeps above its mother's back. It blows a spout of mist, sheds wisps when its back
 * comes up out of the clouds, churns them where it swims low, and once in a long while rises right out of them and
 * dives back in. A few small birds and motes of light give the scale.
 * The cloud textures and the whale's parts are drawn once, per pixel and lit (a few rows at a time between frames),
 * then moved with transforms. On a light page it is a pastel day: the clouds' sunlit sides are the page itself and
 * their shade a soft blue, and nearer shapes hide farther ones.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('skywhale'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const rr = (a, b) => a + (b - a) * RND();

  /* ---------- work done a little at a time: textures and sprites are made between frames ---------- */

  const QUEUE = [];
  function pump(ms) {
    const t0 = performance.now();
    while (QUEUE.length && performance.now() - t0 < ms) { const j = QUEUE[0]; if (j.gen.next().done) { j.gen = null; QUEUE.shift(); } }
  }
  function finish(j) {
    if (!j.gen) return;
    while (!j.gen.next().done);
    j.gen = null;
    const i = QUEUE.indexOf(j);
    if (i >= 0) QUEUE.splice(i, 1);
  }

  /* ---------- clouds: billows lit like soft balls, laid back to front ---------- */

  const CLOUD = {
    D: { shade: [70, 70, 128], mid: [190, 152, 186], lit: [255, 198, 172], hi: [255, 230, 212], haze: [146, 132, 180] },
    L: { shade: [126, 146, 200], haze: [184, 196, 228] },
  };
  const LX = 0.42, LY = -0.6, LZ = 0.68, WRAPL = 0.35; // the low sun: up and to the right, a little toward us
  const S_BODY = 0.12; // how lit the mass deep inside a bank is

  function* noiseField(TW, TH, seed, wrap) {
    const px = wrap ? 16 : 8, f = K.fbm(seed, px, 4, 4), N = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) N[y * TW + x] = f((x / TW) * px, (y / TH) * 4);
      if ((y & 31) === 31) yield;
    }
    return { TW, TH, wrap, A: new Float32Array(TW * TH), S: new Float32Array(TW * TH), N };
  }

  /**
   * One billow over the field: a frayed disc lit like a ball of cloud (its lower part melting into what lies under
   * it). How lit it is comes partly from its own round, partly from how high it stands: crests catch the sun, hollows don't.
   */
  function billow(F, b) {
    const { TW, TH, A, S, N, wrap } = F, r = b.r, ir = 1 / r;
    const x0 = Math.floor(b.x - r * 1.2), x1 = Math.ceil(b.x + r * 1.2);
    const y0 = Math.max(0, Math.floor(b.y - r * 1.2)), y1 = Math.min(TH - 1, Math.ceil(b.y + r * 1.2));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - b.y) * ir, melt = dy > 0 ? 1 - b.melt * sm(0, 0.9, dy) : 1;
      if (melt < 0.004) continue;
      const row = y * TW, low = dy > 0 ? 1 - 0.5 * sm(0, 1, dy) : 1;
      for (let xi = x0; xi <= x1; xi++) {
        let x = xi;
        if (wrap) { x %= TW; if (x < 0) x += TW; } else if (x < 0 || x >= TW) continue;
        const dx = (xi + 0.5 - b.x) * ir, q2 = dx * dx + dy * dy;
        if (q2 >= 1.44) continue;
        const k = row + x, n = N[k], qn = Math.sqrt(q2) + (n - 0.5) * b.fz;
        if (qn >= 1) continue;
        const a = (qn <= 0.7 ? 1 : sm(1, 0.7, qn)) * melt;
        if (a < 0.004) continue;
        const nz = q2 < 1 ? Math.sqrt(1 - q2) : 0, ld = dx * LX + dy * LY;
        let lam = (ld + nz * LZ + WRAPL) / (1 + WRAPL);
        if (lam < 0) lam = 0;
        const e = 1 - nz, rim = e * e * (ld > 0 ? 1 : 0.35) * (dy < 0.1 ? 1 : 0.3); // the edge toward the sun glows
        let s = (0.04 + 0.44 * lam + 0.38 * b.lit + 0.4 * rim * (0.4 + 0.6 * b.lit) + b.tone + (n - 0.5) * 0.22) * low;
        if (s < 0) s = 0; else if (s > 1.25) s = 1.25;
        const ia = 1 - a;
        A[k] = A[k] * ia + a; S[k] = S[k] * ia + s * a;
      }
    }
  }
  /** A billow with smaller ones boiling up along its top (they melt into it below). */
  function* heap(F, R, b) {
    billow(F, b);
    for (let k = 0; k < b.subs; k++) {
      const ang = -Math.PI * (0.12 + 0.76 * R()), rs = b.r * (0.22 + R() * 0.16), d = b.r - rs * (0.45 + R() * 0.3);
      billow(F, { x: b.x + Math.cos(ang) * d, y: b.y + Math.sin(ang) * d, r: rs, melt: 1, fz: 0.46, tone: 0.03 + (R() - 0.5) * 0.08, lit: Math.min(1, b.lit + 0.08) });
    }
    yield;
  }
  /** Coverage and light packed into bytes: kept for the session, so a light / dark switch only colours it again. */
  function compact(F) {
    const n = F.TW * F.TH, a = new Uint8Array(n), s = new Uint8Array(n);
    for (let k = 0; k < n; k++) { const al = F.A[k]; a[k] = Math.round(al * 255); s[k] = al > 0.004 ? Math.min(255, Math.round((F.S[k] / al / 1.25) * 255)) : 0; }
    return { TW: F.TW, TH: F.TH, a, s };
  }

  /** The banks, far to near: texture size, seed, how much of the sky's haze lies over them. */
  const BANKS = [{ tw: 768, th: 192, seed: 11, haze: 0.5 }, { tw: 896, th: 208, seed: 23, haze: 0.32 }, { tw: 1024, th: 256, seed: 37, haze: 0.15 }, { tw: 1280, th: 320, seed: 53, haze: 0.03 }];
  /**
   * A bank, one tile wide (it repeats): heaps of cloud (a big dome, shoulders lower down its flanks and in front),
   * small billows in the troughs between them, over a shaded mass that runs on down.
   */
  function* bankGen(i) {
    const o = BANKS[i], R = K.rng(o.seed), F = yield* noiseField(o.tw, o.th, o.seed, true), { TW, TH } = F, wav = K.fbm(o.seed + 5, 6, 1, 3);
    for (let x = 0; x < TW; x++) {
      const yb = TH * (0.62 + (wav((x / TW) * 6, 0.5) - 0.5) * 0.08);
      for (let y = Math.max(0, Math.floor(yb - TH * 0.08)); y < TH; y++) {
        const k = y * TW + x, a = sm(yb - TH * 0.07, yb + TH * 0.04, y);
        if (a <= 0) continue;
        const s = S_BODY + ((F.N[k] - 0.5) * 0.14 + 0.06 * (1 - sm(yb, yb + TH * 0.14, y))) * (1 - sm(TH * 0.74, TH * 0.9, y));
        F.A[k] = a; F.S[k] = s * a;
      }
      if ((x & 127) === 127) yield;
    }
    const list = [], lit = (b) => 1 - sm(TH * 0.03, TH * 0.5, b.y - b.r);
    const mk = (x, y, r, subs, fz) => { const b = { x, y, r, subs, fz, melt: 0.85, tone: (R() - 0.5) * 0.1 }; b.lit = lit(b); list.push(b); };
    for (let x = R() * TH * 0.4, end = x + TW; x < end;) {
      const R0 = TH * (0.24 + 0.16 * R()), top = TH * Math.max(0.04 + 0.12 * R(), 0.03 + (0.21 * R0) / TH), cx = x + R0;
      mk(cx, top + R0, R0, 3 + ((R() * 3) | 0), 0.4);
      for (let k = 0, n = 3 + ((R() * 3) | 0); k < n; k++) {
        const side = k % 2 ? 1 : -1, r = R0 * (0.38 + 0.3 * R()), d = R0 * (0.5 + 0.65 * R());
        mk(cx + side * d, top + R0 + R0 * (0.12 + 0.45 * R()), r, 1 + ((R() * 3) | 0), 0.42);
      }
      x = cx + R0 * (1.1 + R());
    }
    for (let x = R() * 40; x < TW + 40; x += TH * (0.12 + 0.1 * R())) mk(x, TH * (0.52 + 0.1 * R()), TH * (0.1 + 0.07 * R()), (R() * 2) | 0, 0.44);
    list.sort((a, b) => a.y + a.r * 0.5 - (b.y + b.r * 0.5)); // the lower on the page, the nearer: drawn later
    for (const b of list) yield* heap(F, R, b);
    for (let y = Math.floor(TH * 0.84); y < TH; y++) { // the last rows: only the mass, so the bank can be carried on below in one colour
      const k0 = sm(TH * 0.84, TH * 0.95, y);
      for (let x = 0; x < TW; x++) { const k = y * TW + x; F.A[k] += (1 - F.A[k]) * k0; F.S[k] += (S_BODY * F.A[k] - F.S[k]) * k0; }
    }
    return compact(F);
  }
  /** An island of cloud in the open sky: a dome of billows on a flat, shaded underside. */
  function* islandGen(v) {
    const seed = 101 + v * 17, R = K.rng(seed), F = yield* noiseField(448, 192, seed, false), { TW, TH } = F, base = TH * 0.7;
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const ex = (x - TW / 2) / (TW * 0.4), e = 1 - ex * ex;
        if (e <= 0) continue;
        const k = y * TW + x, n = F.N[k], top = base - TH * 0.15 * Math.sqrt(e), bot = base + TH * 0.05 * e + (n - 0.5) * TH * 0.06;
        const a = sm(top - 6, top + 10, y) * sm(bot + 4, bot - 8, y) * sm(0, 0.25, e);
        if (a <= 0.004) continue;
        F.A[k] = a; F.S[k] = (0.12 + 0.1 * (1 - sm(top, bot, y)) + (n - 0.5) * 0.12) * a;
      }
      if ((y & 63) === 63) yield;
    }
    const list = [], n = 5 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const f = (i + 0.3 + R() * 0.4) / n, dome = 1 - ((f - 0.5) / 0.55) ** 2, r = TH * (0.1 + 0.19 * dome * (0.75 + R() * 0.45));
      list.push({ x: TW * (0.14 + 0.72 * f), y: base - r * (0.3 + 0.25 * dome), r, melt: 0.9, fz: 0.4, tone: (R() - 0.5) * 0.1, lit: 0.55 + 0.45 * dome, subs: 2 + ((R() * 2) | 0) });
    }
    list.sort((a, b) => b.r - a.r); // the big middle ones stand behind
    for (let i = 0; i < 4; i++) { const r = TH * (0.07 + R() * 0.04); list.push({ x: TW * (0.22 + 0.56 * R()), y: base - r * 0.2, r, melt: 1, fz: 0.44, tone: -0.02, lit: 0.3, subs: 1 }); }
    for (const b of list) yield* heap(F, R, b);
    return compact(F);
  }

  /**
   * A light field in colour. Dark page: the shade, the lit side and the glow of the edges in the dawn's colours,
   * hazier for the far banks. Light page: only the shade, in a soft blue; the lit side is the page (the mask hides
   * what is behind it). base / baseA: the colour of the mass deep down, to carry a bank on below its texture.
   */
  function paint(F, L, haze) {
    const { TW, TH, a: FA, s: FS } = F, P = CLOUD[L ? 'L' : 'D'];
    const col = K.mk(TW, TH), cx = col.getContext('2d'), img = cx.createImageData(TW, TH), d = img.data;
    const mask = L ? K.mk(TW, TH) : col, mcx = L ? mask.getContext('2d') : null, mimg = L ? mcx.createImageData(TW, TH) : null, md = L ? mimg.data : null;
    const lut = new Float32Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const s = (i / 255) * 1.25;
      let c, a = 1;
      if (L) { c = mix(P.shade, P.haze, haze); a = (0.07 + 0.93 * (1 - Math.min(1, s)) ** 1.3) * (1 - haze * 0.35); }
      else { c = s < 0.5 ? mix(P.shade, P.mid, s / 0.5) : s < 1 ? mix(P.mid, P.lit, (s - 0.5) / 0.5) : mix(P.lit, P.hi, (s - 1) / 0.25); c = mix(c, P.haze, haze * (0.7 + 0.3 * (1 - Math.min(1, s)))); }
      lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = a;
    }
    for (let k = 0; k < TW * TH; k++) {
      const a = FA[k];
      if (!a) continue;
      const li = FS[k] * 4, o = k * 4;
      d[o] = lut[li]; d[o + 1] = lut[li + 1]; d[o + 2] = lut[li + 2]; d[o + 3] = Math.round(a * lut[li + 3]);
      if (md) { md[o] = md[o + 1] = md[o + 2] = 255; md[o + 3] = a; }
    }
    cx.putImageData(img, 0, 0);
    if (mcx) mcx.putImageData(mimg, 0, 0);
    const bi = Math.round((S_BODY / 1.25) * 255) * 4;
    return { col, mask, w: TW, h: TH, base: [lut[bi], lut[bi + 1], lut[bi + 2]], baseA: lut[bi + 3] };
  }
  const FIELDS = new Map();
  /** A bank ('b') or island ('i') texture in this light, or null while its field is still being made. */
  function cloudTex(kind, i, L) {
    const key = `sw${kind}${i}${L ? 'L' : 'D'}`;
    let T = K.cache.get(key);
    if (T) return T;
    let j = FIELDS.get(kind + i);
    if (!j) { j = { ready: false, F: null }; j.gen = (function* () { j.F = yield* (kind === 'b' ? bankGen(i) : islandGen(i)); j.ready = true; })(); FIELDS.set(kind + i, j); QUEUE.push(j); }
    if (!j.ready) return null;
    T = paint(j.F, L, kind === 'b' ? BANKS[i].haze : 0.24);
    K.cache.set(key, T);
    return T;
  }
  /** A copy halved until it is not much bigger than it is drawn (the picker's small preview would shimmer otherwise). */
  function fit(T, wpx) {
    if (wpx >= T.w * 0.55 || T.w < 96) return T;
    if (!T.half) {
      const half = (cv) => { const c = K.mk(cv.width / 2, cv.height / 2); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); return c; };
      const col = half(T.col);
      T.half = { col, mask: T.mask === T.col ? col : half(T.mask), w: col.width, h: col.height, base: T.base, baseA: T.baseA };
    }
    return fit(T.half, wpx);
  }
  /** A puff of mist: noise in a soft round envelope (white; tinted by K.tint). */
  function puffTex() {
    const key = 'swPuff';
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 96, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(203, 4, 4, 4);
    for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const dx = ((k + 0.5) / N) * 2 - 1, dy = ((j + 0.5) / N) * 2 - 1, r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const al = Math.max(0, Math.min(1, (f((k / N) * 4, (j / N) * 4) - 0.22) / 0.45)) * (1 - r2) ** 1.6;
      const o = (j * N + k) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(al * 255);
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }
  /** A mote of light: a small core in a soft halo. */
  function moteTex(L) {
    const key = `swMote${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(24, 24), x = c.getContext('2d'), g = x.createRadialGradient(12, 12, 0, 12, 12, 12), m = L ? '196,146,64' : '255,236,206';
    g.addColorStop(0, `rgba(${m},1)`); g.addColorStop(0.2, `rgba(${m},0.75)`); g.addColorStop(0.5, `rgba(${m},0.16)`); g.addColorStop(1, `rgba(${m},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 24, 24);
    K.cache.set(key, c);
    return c;
  }

  /* ---------- the whale's shape: units of its length, snout at 0, the root of the flukes at 1, y down ---------- */

  const PROFILE = [ // x, back, belly
    [-0.006, 0.003, 0.003], [0.004, -0.005, 0.011], [0.018, -0.015, 0.024], [0.04, -0.027, 0.04], [0.075, -0.041, 0.059],
    [0.12, -0.055, 0.077], [0.17, -0.067, 0.092], [0.22, -0.078, 0.103], [0.28, -0.087, 0.11], [0.35, -0.094, 0.112],
    [0.43, -0.097, 0.107], [0.5, -0.096, 0.097], [0.57, -0.091, 0.083], [0.64, -0.082, 0.068], [0.71, -0.069, 0.053],
    [0.78, -0.054, 0.039], [0.84, -0.041, 0.028], [0.89, -0.031, 0.02], [0.94, -0.022, 0.0135], [0.98, -0.016, 0.0095],
    [1.0, -0.0135, 0.008], [1.04, -0.012, 0.007],
  ];
  /** A smooth curve through one column of the profile (cubic Hermite, slopes from the neighbours). */
  function curve(P, col) {
    const m = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; return (b[col] - a[col]) / (b[0] - a[0]); };
    return (x) => {
      if (x <= P[0][0]) return P[0][col];
      if (x >= P[P.length - 1][0]) return P[P.length - 1][col];
      let j = 0;
      while (P[j + 1][0] < x) j++;
      const h = P[j + 1][0] - P[j][0], k = (x - P[j][0]) / h, k2 = k * k, k3 = k2 * k;
      return (2 * k3 - 3 * k2 + 1) * P[j][col] + (k3 - 2 * k2 + k) * h * m(j) + (3 * k2 - 2 * k3) * P[j + 1][col] + (k3 - k2) * h * m(j + 1);
    };
  }
  const backY = curve(PROFILE, 1), bellyY = curve(PROFILE, 2), axisY = (x) => (backY(x) + bellyY(x)) / 2;
  /** What the back carries: the blowhole's guard, a low hump, knuckles toward the tail (all part of the body's round). */
  function hump(x) {
    let h = 0.002 * Math.exp(-(((x - 0.168) / 0.01) ** 2));
    if (x > 0.56 && x < 0.76) h += 0.0045 * Math.sin((Math.PI * (x - 0.56)) / 0.2);
    if (x > 0.74 && x < 0.92) h += 0.0016 * Math.sin(((x - 0.74) / 0.18) * 5 * Math.PI) ** 2;
    return h;
  }
  /** The small, low dorsal fin on the hump, its trailing edge hooked: a thin blade. */
  function fin(x) {
    if (x > 0.6 && x <= 0.682) return 0.02 * sm(0.6, 0.682, x) ** 1.15;
    if (x > 0.682 && x < 0.71) return 0.02 * (1 - (x - 0.682) / 0.028) ** 1.8;
    return 0;
  }
  // the tail stock ends in a round cap about the flukes' pivot, so they can turn on it without a gap
  const RC = (bellyY(1) - backY(1)) / 2, YC1 = axisY(1), capH = (x) => Math.sqrt(Math.max(0, RC * RC - (x - 1) ** 2));
  const topB = (x) => (x <= 1 ? backY(x) - hump(x) : YC1 - capH(x)), botB = (x) => (x <= 1 ? bellyY(x) : YC1 + capH(x));
  const MC = 0.19; // the corner of the mouth
  /** The mouth line: back from the snout, arched a little, turning down at the corner under the eye. */
  function mouthY(x) {
    const t = backY(x), b = bellyY(x), k = Math.min(1, x / MC);
    return t + (b - t) * (0.38 + 0.1 * k) - 0.0045 * Math.sin(Math.PI * k) + 0.007 * sm(0.16, 0.2, x);
  }
  /** The top of the throat grooves: just under the lip, then sloping back to the navel. */
  function grooveTop(x) {
    if (x < 0.008 || x > 0.53) return NaN;
    if (x <= MC) return mouthY(x) + 0.005;
    const a = mouthY(MC) + 0.005, b = bellyY(0.53) - 0.003;
    return a + (b - a) * sm(MC, 0.53, x) ** 0.85;
  }
  const EYE = [0.207, mouthY(MC) - 0.012];
  const KNOBS = (() => { // the knobs on the head: two staggered rows on the snout, a few along the chin
    const k = [];
    for (let i = 0; i < 9; i++) { const x = 0.018 + i * 0.017; k.push([x, backY(x) + 0.0055 + (i % 2) * 0.0065]); }
    for (let i = 0; i < 5; i++) { const x = 0.012 + i * 0.013; k.push([x, bellyY(x) - 0.0065 - (i % 2) * 0.004]); }
    return k;
  })();
  const KR = 0.0034;
  const J2 = [0.835, axisY(0.835)], J3 = [1, YC1]; // the tail stock turns about J2, the flukes about J3
  const SEAM = [0.805, 0.865]; // where the body's two pieces fade into each other
  const FLIP_N = [0.252, 0.064], FLIP_F = [0.262, 0.05], FLEN = 0.31, FSY0 = 0.78, SE0 = 0.15; // flippers: roots, length, how squashed we see them; the flukes too

  /** The whale's colours (0..1): back and belly, the eye; the light of the sky, the low sun, the clouds below, the rim; the haze. */
  const WPAL = {
    D: { dor: [0.33, 0.37, 0.53], ven: [0.74, 0.74, 0.86], eye: [0.06, 0.06, 0.1], sky: [0.64, 0.68, 0.94], key: [1, 0.87, 0.8], bnc: [0.96, 0.8, 0.76], rim: [1, 0.8, 0.66], haze: [0.58, 0.53, 0.71] },
    L: { dor: [0.36, 0.43, 0.6], ven: [0.82, 0.85, 0.93], eye: [0.16, 0.18, 0.26], sky: [0.96, 0.97, 1], key: [1, 0.98, 0.95], bnc: [0.98, 0.95, 0.95], rim: [1, 0.98, 0.96], haze: [0.84, 0.87, 0.95] },
  };
  /** Light a surface point: albedo (r, g, b), normal (unit), into out[o..o+2] as bytes, hazed by fog. */
  function shade(P, ar, ag, ab, nx, ny, nz, fog, out, o) {
    const up = -ny, sky = 0.5 + 0.5 * up, bn = ny > 0 ? ny : 0, fr = 1 - (nz > 0 ? nz : 0), rim = fr * fr * (0.4 + 0.6 * fr);
    let key = 0.5 * up + 0.866 * nz;
    if (key < 0) key = 0;
    const rT = rim * sm(-0.2, 0.7, up) * 0.75, rB = rim * sm(-0.1, 0.8, -up) * 0.26, f1 = 1 - fog;
    const c0 = ar * (P.sky[0] * sky * 0.5 + P.key[0] * key * 0.62 + P.bnc[0] * bn * 0.42) + P.rim[0] * rT + P.bnc[0] * rB;
    const c1 = ag * (P.sky[1] * sky * 0.5 + P.key[1] * key * 0.62 + P.bnc[1] * bn * 0.42) + P.rim[1] * rT + P.bnc[1] * rB;
    const c2 = ab * (P.sky[2] * sky * 0.5 + P.key[2] * key * 0.62 + P.bnc[2] * bn * 0.42) + P.rim[2] * rT + P.bnc[2] * rB;
    out[o] = (c0 * f1 + P.haze[0] * fog) * 255; out[o + 1] = (c1 * f1 + P.haze[1] * fog) * 255; out[o + 2] = (c2 * f1 + P.haze[2] * fog) * 255;
  }
  /** A sprite placed in the whale's own units: { cv, x, y, w, h } (sc: its pixels per unit). */
  const piece = (cv, ox, oy, sc) => ({ cv, x: -ox / sc, y: -oy / sc, w: cv.width / sc, h: cv.height / sc });
  /** Pixels into a canvas. */
  function canvasOf(W, H, data) { const c = K.mk(W, H), x = c.getContext('2d'), im = x.createImageData(W, H); im.data.set(data); x.putImageData(im, 0, 0); return c; }

  /**
   * The body, lit per pixel, cut in two where the tail stock bends: the front piece fades out across the seam and the
   * tail piece fades in so that, laid one over the other at strength a, they add up to exactly a (no seam, no dip).
   */
  function* bodyJob(Lpx, fog, a, L, set) {
    const P = WPAL[L ? 'L' : 'D'], X0 = -0.012, X1 = 1 + RC + 0.004, Y0 = -0.13, Y1 = 0.124, pad = 2;
    const BW = Math.ceil((X1 - X0) * Lpx) + pad * 2, BH = Math.ceil((Y1 - Y0) * Lpx) + pad * 2, ox = pad - X0 * Lpx, oy = pad - Y0 * Lpx;
    const cTop = new Float32Array(BW), cBot = new Float32Array(BW), cIT = new Float32Array(BW), cIB = new Float32Array(BW), cYc = new Float32Array(BW), cHv = new Float32Array(BW);
    const cYp = new Float32Array(BW), cHp = new Float32Array(BW), cMou = new Float32Array(BW), cGu = new Float32Array(BW), cBnd = new Float32Array(BW);
    const e = 0.75 / Lpx, topF = (x) => topB(x) - fin(x);
    for (let i = 0; i < BW; i++) {
      const x = (i + 0.5 - ox) / Lpx, t = topB(x), b = botB(x);
      const sT = (topF(x + e) - topF(x - e)) / (2 * e), sB = (botB(x + e) - botB(x - e)) / (2 * e);
      cTop[i] = topF(x); cBot[i] = b; cIT[i] = 1 / Math.sqrt(1 + sT * sT); cIB[i] = 1 / Math.sqrt(1 + sB * sB);
      cYc[i] = (t + b) / 2; cHv[i] = Math.max(1e-4, (b - t) / 2);
      cYp[i] = (topB(x + e) + botB(x + e) - topB(x - e) - botB(x - e)) / (4 * e);
      cHp[i] = Math.max(-8, Math.min(8, (botB(x + e) - topB(x + e) - (botB(x - e) - topB(x - e))) / (4 * e)));
      cMou[i] = x > 0.002 && x < 0.205 ? mouthY(x) : NaN;
      cGu[i] = grooveTop(x);
      cBnd[i] = 0.32 + 0.25 * sm(0.25, 0.62, x) - 0.1 * sm(0.75, 0.95, x); // where the dark back gives way to the pale belly
    }
    const d = new Uint8ClampedArray(BW * BH * 4), mot = K.fbm(907, 10, 3, 3), mot2 = K.fbm(331, 6, 2, 3);
    const aa = 1 / (1 + fog * 1.6); // far whales have softer edges
    const nG = Math.max(4, Math.min(12, Math.round((0.1 * Lpx) / 7))), gVis = sm(4, 6.5, (0.1 * Lpx) / nG); // grooves only while they stay several pixels apart
    const mw = Math.max(1.1, 0.0026 * Lpx), erx = 0.0064, ery = 0.0046, glint = Lpx > 260;
    for (let j = 0; j < BH; j++) {
      const y = (j + 0.5 - oy) / Lpx;
      for (let i = 0; i < BW; i++) {
        const dT = (y - cTop[i]) * cIT[i] * Lpx;
        let cov = Math.min(dT, (cBot[i] - y) * cIB[i] * Lpx) * aa + 0.5;
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        const x = (i + 0.5 - ox) / Lpx;
        let s = (y - cYc[i]) / cHv[i], fn = false;
        if (s < -1) { fn = true; s = -1; } else if (s > 1) s = 1;
        let nx = -0.95 * (s * cYp[i] + cHp[i]), ny = 0.95 * s, nz = Math.sqrt(1 - s * s);
        if (fn) { nx = 0.05; ny = -0.55; nz = 0.83; } // the fin: a blade turned to us
        const n1 = mot((x + 0.012) * 10, (y + 0.13) * 11.5), n2 = mot2(x * 6, (y + 0.13) * 7);
        let pale = fn ? 0 : sm(cBnd[i] - 0.13, cBnd[i] + 0.13, s + (n2 - 0.5) * 0.55), dark = 0.9 + 0.2 * n1;
        const gu = cGu[i];
        if (gu === gu && y > gu) { // the throat grooves, chin to navel: pale pleats, fine dark lines between them
          const g = (y - gu) / Math.max(1e-4, cBot[i] - gu);
          pale = Math.max(pale, 0.92 * sm(0, 0.12, g));
          if (gVis > 0) { // soft ripples, not hairlines: they must survive being turned and scaled
            const ph = TAU * g * nG, fade = gVis * sm(0.012, 0.06, x) * (1 - sm(0.45, 0.53, x)) * sm(0.02, 0.12, g);
            dark *= 1 - 0.13 * (0.5 + 0.5 * Math.cos(ph)) * fade;
            ny -= 0.16 * Math.sin(ph) * fade;
          }
        }
        if (x < 0.17) for (const [kx, ky] of KNOBS) { // knobs: small bumps
          const ddx = (x - kx) / KR, ddy = (y - ky) / KR, q = ddx * ddx + ddy * ddy;
          if (q < 1) { const wq = 1 - q; nx += ddx * wq * 0.6; ny += ddy * wq * 0.6; dark *= 1 - 0.08 * wq; }
        }
        const my = cMou[i];
        if (my === my) { // the mouth line, a lit lip under it
          const dm = ((y - my) * Lpx) / mw, f = sm(0.002, 0.014, x) * (1 - sm(0.19, 0.205, x));
          dark *= 1 - 0.45 * Math.exp(-dm * dm) * f;
          if (dm > 0) ny -= 0.22 * Math.exp(-(((dm - 2) / 1.2) ** 2)) * f;
        }
        let ar = P.dor[0] + (P.ven[0] - P.dor[0]) * pale, ag = P.dor[1] + (P.ven[1] - P.dor[1]) * pale, ab = P.dor[2] + (P.ven[2] - P.dor[2]) * pale;
        const de = Math.hypot((x - EYE[0]) / erx, (y - EYE[1]) / ery);
        if (de < 1.8) { // the eye: dark, in a soft fold of skin
          const ek = 1 - sm(0.7, 1, de);
          ar += (P.eye[0] - ar) * ek; ag += (P.eye[1] - ag) * ek; ab += (P.eye[2] - ab) * ek;
          ny -= 0.25 * Math.exp(-(((de - 1.4) / 0.18) ** 2));
          if (glint) { const gd = Math.hypot((x - EYE[0] + erx * 0.3) / (erx * 0.28), (y - EYE[1] + ery * 0.35) / (ery * 0.28)); if (gd < 1) { const gk = (1 - gd) * 0.45; ar += (0.9 - ar) * gk; ag += (0.9 - ag) * gk; ab += (0.95 - ab) * gk; } }
        }
        const nl = 1 / Math.hypot(nx, ny, nz), o = (j * BW + i) * 4;
        shade(P, ar * dark, ag * dark, ab * dark, nx * nl, ny * nl, nz * nl, fog, d, o);
        if (fn) { const rf = Math.exp(-dT / 1.6) * 0.5; d[o] += (P.rim[0] * 255 - d[o]) * rf; d[o + 1] += (P.rim[1] * 255 - d[o + 1]) * rf; d[o + 2] += (P.rim[2] * 255 - d[o + 2]) * rf; } // the fin's lit edge
        d[o + 3] = cov * 255;
      }
      if ((j & 15) === 15) yield;
    }
    // the two pieces: the front one fades out across the seam (c), the tail one fades in as (1 - c) / (1 - a c)
    const iS0 = Math.max(0, Math.floor(ox + SEAM[0] * Lpx)), iS1 = Math.min(BW, Math.ceil(ox + SEAM[1] * Lpx) + 1);
    const front = new Uint8ClampedArray(iS1 * BH * 4), tail = new Uint8ClampedArray((BW - iS0) * BH * 4);
    for (let i = 0; i < BW; i++) {
      const c = 1 - sm(SEAM[0], SEAM[1], (i + 0.5 - ox) / Lpx), b = (1 - c) / (1 - a * c);
      for (let j = 0; j < BH; j++) {
        const o = (j * BW + i) * 4;
        if (!d[o + 3]) continue;
        if (i < iS1) { const p = (j * iS1 + i) * 4; front[p] = d[o]; front[p + 1] = d[o + 1]; front[p + 2] = d[o + 2]; front[p + 3] = d[o + 3] * c; }
        if (i >= iS0) { const p = (j * (BW - iS0) + i - iS0) * 4; tail[p] = d[o]; tail[p + 1] = d[o + 1]; tail[p + 2] = d[o + 2]; tail[p + 3] = d[o + 3] * b; }
      }
      if ((i & 255) === 255) yield;
    }
    set.front = piece(canvasOf(iS1, BH, front), ox, oy, Lpx);
    set.tail = piece(canvasOf(BW - iS0, BH, tail), ox - iS0, oy, Lpx);
  }

  /** The flukes as seen from a little above: plan view (a broad crescent, swept tips, a small notch), the span squashed by SE0; the far lobe in shade. */
  function* flukeJob(Lpx, fog, L, set) {
    const P = WPAL[L ? 'L' : 'D'], U0 = -0.012, U1 = 0.13, V0 = -0.172, V1 = 0.172, pad = 2, sv = Lpx * SE0;
    const FW = Math.ceil((U1 - U0) * Lpx) + pad * 2, FH = Math.ceil((V1 - V0) * sv) + pad * 2, ox = pad - U0 * Lpx, oy = pad - V0 * sv;
    const d = new Uint8ClampedArray(FW * FH * 4), mot = K.fbm(613, 6, 4, 3), aa = 1 / (1 + fog * 1.6), SPAN = 0.165, TIP = 0.104;
    for (let j = 0; j < FH; j++) {
      const v = (j + 0.5 - oy) / sv, av = Math.abs(v), t = Math.min(1, av / SPAN);
      const uL = TIP * t ** 1.6, uT = 0.08 + 0.024 * t + 0.014 * Math.sin(Math.PI * t) - 0.009 * Math.exp(-((av / 0.008) ** 2)) + 0.0012 * Math.sin(av * 150) * sm(0.02, 0.06, av);
      const tip = Math.max(0, Math.min(1, (SPAN - av) * sv * aa + 0.5));
      for (let i = 0; i < FW; i++) {
        const u = (i + 0.5 - ox) / Lpx, cov = Math.max(0, Math.min(1, Math.min(u - uL, uT - u) * Lpx * aa + 0.5)) * tip;
        if (cov <= 0.002) continue;
        const o = (j * FW + i) * 4, n1 = mot(((u - U0) / 0.148) * 6, ((v - V0) / 0.344) * 4);
        const lead = 1 - sm(0, 0.02, u - uL), trail = 1 - sm(0, 0.014, uT - u), k0 = (0.88 + 0.24 * n1) * (v < 0 ? 0.82 : 1) * (1 + 0.14 * trail);
        const nx = -0.35 * lead, ny = -0.86 + 0.3 * lead, nz = 0.5 + 0.2 * lead, nl = 1 / Math.hypot(nx, ny, nz); // lit by the sky; the rounded leading edge catches it
        shade(P, P.dor[0] * k0, P.dor[1] * k0, P.dor[2] * k0, nx * nl, ny * nl, nz * nl, fog, d, o);
        d[o + 3] = cov * 255;
      }
      if ((j & 31) === 31) yield;
    }
    set.fluke = { cv: canvasOf(FW, FH, d), x: -ox / Lpx, y: (-oy / sv) * SE0, w: FW / Lpx, h: (FH / sv) * SE0 };
  }

  /**
   * A long flipper from above, squashed across by FSY0: knobbed leading edge, swept back, a rounded tip; pale with grey
   * mottling, dark at the root where it grows from the body. The near one also gets a mask whose root fades so that,
   * stamped over the body, flipper and body cross-fade at exactly the whale's strength a.
   */
  function* flipperJob(Lpx, fog, a, L, far, set) {
    const P = WPAL[L ? 'L' : 'D'], lp = Lpx * FLEN, sv = lp * FSY0, U0 = -0.02, U1 = 1.02, V0 = -0.24, V1 = 0.22, pad = 2;
    const FW = Math.ceil((U1 - U0) * lp) + pad * 2, FH = Math.ceil((V1 - V0) * sv) + pad * 2, ox = pad - U0 * lp, oy = pad - V0 * sv;
    const d = new Uint8ClampedArray(FW * FH * 4), m = far ? null : new Uint8ClampedArray(FW * FH * 4), mot = K.fbm(far ? 771 : 557, 8, 3, 3);
    const aa = 1 / (1 + fog * 1.6), dim = far ? 0.6 : 1;
    for (let i = 0; i < FW; i++) {
      const u = (i + 0.5 - ox) / lp;
      if (u < 0 || u > 1.01) continue;
      const wd = u < 0.22 ? 0.17 + 0.1 * sm(0, 0.22, u) : 0.27 * Math.max(0, 1 - (u - 0.22) / 0.78) ** 0.68, bend = -0.07 * u * u;
      const vl = bend + wd * 0.6 + 0.011 * Math.abs(Math.sin(u * Math.PI * 9.5 + 0.6 * Math.sin(u * 7))) ** 0.8 * (0.7 + 0.3 * Math.sin(u * 23)) * sm(0.12, 0.28, u) * (1 - sm(0.85, 0.98, u)), vt = bend - wd * 0.4 + 0.012 * Math.sin(Math.PI * u);
      const f = sm(0, 0.085, u), fe = (f * (1 - a)) / (1 - a * f); // the root: colour f, mask fe
      for (let j = 0; j < FH; j++) {
        const v = (j + 0.5 - oy) / sv, cov = Math.max(0, Math.min(1, Math.min(v - vt, vl - v) * sv * aa + 0.5));
        if (cov <= 0.002) continue;
        const w = (v - vt) / Math.max(1e-4, vl - vt), o = (j * FW + i) * 4, n1 = mot(u * 8, ((v - V0) / 0.46) * 3);
        const pale = sm(0.06, 0.26, u) * (0.68 + 0.32 * sm(0.3, 0.62, n1)), hl = Math.exp(-(((w - 0.8) / 0.12) ** 2)), k0 = (0.86 + 0.14 * sm(0, 0.5, w) - 0.1 * sm(0.6, 1, u) + 0.12 * hl) * dim;
        const ny = -0.45 - 0.22 * hl + 0.25 * sm(0.93, 1, w), nz = Math.sqrt(Math.max(0.05, 1 - ny * ny)); // the rounded leading edge: a lit band, then it turns away
        shade(P, (P.dor[0] + (P.ven[0] - P.dor[0]) * pale) * k0, (P.dor[1] + (P.ven[1] - P.dor[1]) * pale) * k0, (P.dor[2] + (P.ven[2] - P.dor[2]) * pale) * k0, 0, ny, nz, fog, d, o);
        d[o + 3] = cov * f * 255;
        if (m) { m[o] = m[o + 1] = m[o + 2] = 255; m[o + 3] = cov * (u < 0.085 ? fe : 1) * 255; }
      }
      if ((i & 63) === 63) yield;
    }
    const sc = lp / FLEN; // pixels per whale length (the squash across is undone when it is drawn)
    const p = { cv: canvasOf(FW, FH, d), x: -ox / sc, y: (-oy / sv) * FLEN * FSY0, w: FW / sc, h: (FH / sv) * FLEN * FSY0 };
    if (far) set.flipF = p; else { set.flipN = p; set.flipNm = { ...p, cv: canvasOf(FW, FH, m) }; }
  }
  function* whaleJob(Lpx, fog, a, L, set) {
    yield* bodyJob(Lpx, fog, a, L, set);
    yield* flukeJob(Lpx, fog, L, set);
    yield* flipperJob(Lpx, fog, a, L, false, set);
    yield* flipperJob(Lpx, Math.min(1, fog + 0.08), a, L, true, set);
    set.ready = true;
  }
  /** A whale's sprites (made between frames, or at once when wanted now). */
  function need(st, Lpx, fog, a, L) {
    const key = `${Lpx}|${fog}|${a}|${L ? 'L' : 'D'}`;
    let s = st.spr.get(key);
    if (!s) { s = { ready: false, owner: st }; s.gen = whaleJob(Lpx, fog, a, L, s); st.spr.set(key, s); QUEUE.push(s); }
    return s;
  }

  /* ---------- the whale on the stage ---------- */

  /** Stamp a sprite: hide what is behind it (by its mask), then show it at its strength. */
  function stamp(ctx, mask, p, a) {
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.drawImage(mask.cv, p.x, p.y, p.w, p.h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.drawImage(p.cv, p.x, p.y, p.w, p.h);
  }
  const img = (ctx, p) => ctx.drawImage(p.cv, p.x, p.y, p.w, p.h);
  const turn = (ctx, J, a) => { ctx.translate(J[0], J[1]); ctx.rotate(a); ctx.translate(-J[0], -J[1]); };
  /** A point of the whale's body (its own units) on the stage. */
  function at(wh, bx, by) {
    const sx = (wh.dir > 0 ? -1 : 1) * bx * wh.Lc, sy = by * wh.Lc, c = Math.cos(wh.ang), s = Math.sin(wh.ang);
    return [wh.x + sx * c - sy * s, wh.y + sx * s + sy * c];
  }
  /**
   * The whale: the tail stock bends and the flukes pitch hardest and latest, the head nods against the stroke and the
   * body heaves a little; the flippers sweep slowly and twist (squashed a little more or less). Every part hides
   * what is behind it; the body's two pieces first hide, then show, so their seam adds up exactly.
   */
  function drawWhale(ctx, wh, set, alpha) {
    const ph = wh.ph, th2 = 0.09 * Math.sin(ph - 0.6), th3 = 0.26 * Math.sin(ph - 1.7);
    ctx.save();
    ctx.translate(wh.x, wh.y + Math.sin(ph + 0.4) * wh.Lc * 0.006);
    ctx.rotate(wh.ang);
    ctx.scale(wh.dir > 0 ? -wh.Lc : wh.Lc, wh.Lc);
    ctx.rotate(-0.012 * Math.sin(ph - 0.2));
    ctx.save(); // the far flipper, behind the body: only what hangs below the belly shows
    ctx.translate(FLIP_F[0], FLIP_F[1]); ctx.rotate(0.62 + 0.16 * Math.sin(wh.fph + 0.5)); ctx.scale(0.86, 0.78 + 0.2 * Math.sin(wh.fph + 1.3));
    stamp(ctx, set.flipF, set.flipF, alpha);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
    img(ctx, set.front);
    ctx.save();
    turn(ctx, J2, th2);
    img(ctx, set.tail); img(ctx, set.tail); // twice: where the seam fades both, little is left of what is behind
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    img(ctx, set.tail);
    ctx.translate(J3[0], J3[1]); ctx.transform(Math.cos(th3), Math.sin(th3), 0, 1 + 0.1 * Math.sin(ph - 1.2), 0, 0);
    stamp(ctx, set.fluke, set.fluke, alpha);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    img(ctx, set.front);
    ctx.translate(FLIP_N[0], FLIP_N[1]); ctx.rotate(0.8 + 0.16 * Math.sin(wh.fph)); ctx.scale(0.92, 0.85 + 0.2 * Math.sin(wh.fph + 0.9)); // the near flipper, in front
    stamp(ctx, set.flipNm, set.flipN, alpha);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /** Where each kind of pass swims: length (× the stage's short side), haze, strength on a dark / light page. */
  const SLOTS = [
    { L: 0.19, fog: 0.5, a: [0.62, 0.56] },
    { L: 0.36, fog: 0.3, a: [0.66, 0.62] },
    { L: 0.66, fog: 0.14, a: [0.68, 0.68] },
    { L: 1.0, fog: 0.05, a: [0.5, 0.56] },
  ];
  /** The banks on the stage, far to near: where their crests lie, how tall a tile is drawn, its width, how fast it drifts. */
  function banks(V, yh) {
    const { H, u } = V;
    return [
      { crest: yh, hh: 0.13 * H, tw: u * 0.95, sp: 0.016 },
      { crest: yh + 0.065 * H, hh: 0.17 * H, tw: u * 1.3, sp: 0.03 },
      { crest: yh + 0.15 * H, hh: 0.24 * H, tw: u * 1.75, sp: 0.052 },
      { crest: yh + 0.265 * H, hh: 0.34 * H, tw: u * 2.3, sp: 0.085 },
    ];
  }
  const BANK_A = [[0.34, 0.37, 0.4, 0.42], [0.5, 0.55, 0.6, 0.64]];

  function spawn(st, V, S, B, dpr, L, slot, o) {
    const { W, u, pv } = V, sl = SLOTS[slot], q = Math.min(2, dpr), a = sl.a[L ? 1 : 0];
    const Lc = pv ? W * 0.5 : Math.min(W * 0.95, u * sl.L), Lpx = Math.max(24, Math.round(Lc * q)); // drawn at the size it was made
    const dir = o.dir || (RND() < 0.5 ? -1 : 1);
    const wh = { slot, dir, Lc, Lpx, fog: sl.fog, set: need(st, Lpx, sl.fog, a, L), age: 0, ang: 0, x: 0, y: 0,
      ph: RND() * TAU, dph: TAU / (30 * rr(6, 8)), fph: RND() * TAU, dfph: TAU / (30 * rr(11, 15)),
      v: (pv ? W * 0.0009 : Lc * (0.00105 + (0.0006 * (3 - slot)) / 3)) * rr(0.9, 1.1), breach: !!o.breach,
      bobA: rr(0.05, 0.07), bobW: TAU / (30 * rr(32, 46)), bobP: o.bobP ?? RND() * TAU, blowIn: 30 * rr(5, 14), above: true, wakeIn: 20, spout: -1, headUp: false, calf: null };
    if (o.breach) { wh.x = dir > 0 ? W * rr(0.16, 0.36) : W * rr(0.64, 0.84); wh.b0 = 30; wh.bD = 30 * rr(24, 30); wh.bH = Lc * 0.3; wh.v *= 0.85; }
    else if (o.x != null) wh.x = o.x * W;
    else wh.x = dir > 0 ? -0.02 * Lc : W + 0.02 * Lc;
    if (o.calf) {
      const cL = Lc * 0.38, cpx = Math.max(16, Math.round(cL * q)), cf = sl.fog * 0.95;
      wh.calf = { Lc: cL, Lpx: cpx, fog: cf, set: need(st, cpx, cf, a, L), dir, ang: 0, x: 0, y: 0, ph: RND() * TAU, dph: wh.dph * 1.55, fph: RND() * TAU, dfph: wh.dfph * 1.3, w: RND() * TAU };
    }
    if (pv) { finish(wh.set); if (wh.calf) finish(wh.calf.set); }
    st.whales.push(wh);
    return wh;
  }
  /** The swim line: just over the crest of the bank in front of the whale (it dips into it), or high in the open sky. */
  const lineY = (wh, S, B, H, pv) => (wh.slot === 3 ? S.yh - 0.34 * H : B[wh.slot + 1].crest - wh.Lc * (pv ? 0.13 : 0.05)); // in the small preview it rides higher, to be seen

  /** A puff of mist (spout, wisps, churned cloud), drawn with the whales of its slot. */
  function puff(st, slot, x, y, r, o) {
    if (st.puffs.length >= 56) return;
    st.puffs.push({ slot, x, y, r, gr: o.gr ?? 0.6, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 120, age: 0, a: o.a ?? 0.5, drag: o.drag ?? 0.985 });
  }

  function stepWhale(st, wh, S, B, V) {
    const { H } = V, crest = wh.slot < 3 ? B[wh.slot + 1].crest : 1e9, L = wh.Lc;
    wh.age++; wh.ph += wh.dph; wh.fph += wh.dfph;
    let y, dy;
    if (wh.breach) { // rising right out of the clouds, arching over, diving back in
      const p = Math.max(0, Math.min(1, (wh.age - wh.b0) / wh.bD)), base = crest + 0.2 * L;
      y = base - wh.bH * Math.sin(Math.PI * p);
      dy = p > 0 && p < 1 ? (-wh.bH * Math.PI * Math.cos(Math.PI * p)) / wh.bD : 0;
      wh.ang = (wh.dir > 0 ? 1 : -1) * Math.atan((0.65 * dy) / wh.v);
    } else {
      const base = lineY(wh, S, B, H, V.pv), amp = wh.slot === 3 || V.pv ? 0.03 : wh.bobA, w = wh.age * wh.bobW + wh.bobP;
      y = base - L * amp * Math.sin(w);
      dy = -L * amp * wh.bobW * Math.cos(w);
      wh.ang = (wh.dir > 0 ? 1 : -1) * 0.5 * Math.atan(dy / wh.v); // it leans gently into its rise and fall
    }
    wh.x += wh.dir * wh.v; wh.y = y;
    if (wh.calf) { // the calf keeps close above its mother's back, a little ahead, drifting in and out
      const c = wh.calf;
      c.w += 0.006; c.ph += c.dph; c.fph += c.dfph;
      [c.x, c.y] = at(wh, 0.1 + 0.03 * Math.sin(c.w), -0.19 + 0.014 * Math.sin(c.w * 0.7 + 1));
      c.ang = wh.ang + 0.035 * Math.sin(c.w * 1.3);
    }
    // the spout: a bushy column of mist from the blowhole, now and then while it is up in the air
    const [bx, by] = at(wh, 0.168, backY(0.168) - 0.004);
    if (wh.spout < 0 && !wh.breach && by < crest - 0.02 * L && --wh.blowIn <= 0) { wh.spout = 0; wh.blowIn = 30 * rr(20, 40); }
    if (wh.spout >= 0) {
      if (wh.spout % 3 === 0) puff(st, wh.slot, bx + rr(-0.006, 0.006) * L, by, L * rr(0.016, 0.024), { vx: rr(-0.0006, 0.0006) * L, vy: -L * rr(0.0035, 0.0055), gr: rr(2.2, 3.2), life: rr(80, 120), a: 0.55, drag: 0.972 });
      if (++wh.spout > 30) wh.spout = -1;
    }
    if (wh.slot === 3) return;
    // wisps off its back as it comes up out of the clouds; cloud churned where it swims low
    const backTop = at(wh, 0.43, -0.097)[1], belly = at(wh, 0.35, 0.112)[1], above = backTop < crest - 0.004 * L;
    if (above && !wh.above && wh.age > 20) for (let i = 0; i < 6; i++) { const [x, yy] = at(wh, 0.12 + i * 0.11 + rr(-0.03, 0.03), backY(0.12 + i * 0.11) + 0.01); puff(st, wh.slot, x, yy, L * rr(0.04, 0.07), { vx: -wh.dir * wh.v * 0.3, vy: -L * 0.0004, gr: 0.9, life: rr(120, 170), a: 0.42 }); }
    wh.above = above;
    if (belly > crest + 0.01 * L && --wh.wakeIn <= 0) {
      wh.wakeIn = 12 + RND() * 16;
      const [x] = at(wh, rr(0.08, 0.75), 0);
      puff(st, wh.slot, x, crest - L * 0.012, L * rr(0.035, 0.065), { vx: -wh.dir * wh.v * 0.2, vy: -L * 0.0002, gr: 0.8, life: rr(110, 160), a: 0.36 });
    }
    if (wh.breach) { // breaking through the crest on the way up or down: a burst of cloud where it passes
      const up = at(wh, 0.05, 0)[1] < crest;
      if (up !== wh.headUp && wh.age > wh.b0) for (let i = 0; i < 7; i++) { const [x] = at(wh, rr(0, 0.25), 0); puff(st, wh.slot, x + rr(-0.05, 0.05) * L, crest - L * rr(0.01, 0.05), L * rr(0.05, 0.1), { vx: rr(-0.4, 0.4) * wh.v, vy: -L * rr(0.0003, 0.0011), gr: 1.1, life: rr(130, 190), a: 0.42 }); }
      wh.headUp = up;
    }
  }

  /* ---------- the still sky: its light, the low sun, the last stars ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(4421), q = bg.dpr || 1;
    const yh = Math.round(H * 0.6), skyH = Math.round(yh + H * 0.12), [sky, c] = K.layer(W, skyH, q);
    const g = c.createLinearGradient(0, 0, 0, skyH);
    if (L) { g.addColorStop(0, 'rgba(120,172,234,0.22)'); g.addColorStop(0.5, 'rgba(168,202,240,0.12)'); g.addColorStop(0.8, 'rgba(255,212,196,0.14)'); g.addColorStop(1, 'rgba(255,214,196,0.1)'); }
    else { g.addColorStop(0, 'rgba(90,96,176,0.03)'); g.addColorStop(0.45, 'rgba(140,116,178,0.035)'); g.addColorStop(0.8, 'rgba(255,156,138,0.07)'); g.addColorStop(1, 'rgba(255,178,140,0.09)'); }
    c.fillStyle = g; c.fillRect(0, 0, W, skyH);
    const sun = [W * 0.8, yh + H * 0.012];
    K.glow(c, sun[0], sun[1], u * 0.62, L
      ? [[0, 'rgba(255,240,206,0.36)'], [0.28, 'rgba(255,226,196,0.14)'], [1, 'rgba(255,226,196,0)']]
      : [[0, 'rgba(255,214,172,0.2)'], [0.24, 'rgba(255,172,142,0.075)'], [1, 'rgba(255,150,140,0)']], 1, 0.5);
    const tw = [];
    if (!L) {
      const n = Math.round(pv ? 10 : Math.min(240, ((W * H) / 40000) * 7));
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() ** 1.35 * (yh - H * 0.14), fade = Math.max(0, 1 - y / (yh - H * 0.1)) ** 1.2 * (1 - 0.7 * Math.exp(-(((x - sun[0]) / (u * 0.5)) ** 2)));
        c.fillStyle = `rgba(${R() < 0.25 ? '255,226,206' : '222,228,255'},${((0.08 + R() * 0.28) * fade).toFixed(3)})`;
        c.beginPath(); c.arc(x, y, (0.35 + R() * 0.5) * (pv ? 0.6 : 1), 0, TAU); c.fill();
      }
      for (let i = 0; i < (pv ? 2 : 14); i++) tw.push({ x: R() * W * 0.7, y: R() ** 1.6 * (yh - H * 0.25), r: (0.6 + R() * 0.5) * (pv ? 0.6 : 1), a: 0.18 + R() * 0.25, ph: R() * TAU, sp: 0.01 + R() * 0.02 });
    }
    return { yh, sky, skyH, sun, tw, banks: banks(V, yh) };
  }

  function init(V, key, S) {
    const { W, H, u, pv } = V, R = K.rng(77), yh = S.yh;
    const isl = Array.from({ length: pv ? 1 : 4 }, (_, i) => {
      const d = pv ? 0.4 : (i + R() * 0.6) / 4, y = H * 0.2 + (yh - H * 0.2 - H * 0.07) * d; // lower in the sky is farther: smaller and slower
      return { v: i % 3, x: R() * W, y, w: u * (0.55 - 0.3 * d) * (0.8 + R() * 0.4), sp: 0.05 - 0.032 * d };
    });
    const motes = Array.from({ length: pv ? 3 : 16 }, () => ({ x: RND() * W, y: H * (0.12 + RND() * 0.8), vx: (RND() - 0.5) * 0.12, vy: -0.04 - RND() * 0.1, ph: RND() * TAU, sp: 0.012 + RND() * 0.02, r: 0.8 + RND() * 1.2 }));
    return { kind: 'skywhale', key, L: null, whales: [], puffs: [], birds: [], spr: new Map(), pats: {}, seen: {}, isl, motes, age: 0,
      nextIn: pv ? 0 : 60 + RND() * 90, passes: 0, birdIn: 30 * (14 + RND() * 30) };
  }

  /** What comes next: a pass every half minute to a minute or so, at most two at once, the odd one with a calf or a rise. */
  function schedule(st, V, S, B, dpr, L) {
    if (V.pv) {
      if (!st.whales.length) { const dir = RND() < 0.5 ? -1 : 1; spawn(st, V, S, B, dpr, L, 1, st.passes++ ? { dir } : { dir, x: dir > 0 ? 0.7 : 0.3 }); } // the first one already in view
      return;
    }
    if (--st.nextIn > 0) return;
    if (st.whales.length >= 2) { st.nextIn = 60; return; }
    const used = st.whales.map((w) => w.slot), wts = [2.2, 3, 3, 1.4].map((wt, s) => (used.includes(s) || (!st.passes && (s === 0 || s === 3)) ? 0 : wt));
    let r = RND() * wts.reduce((a, b) => a + b, 0), slot = 0;
    while (slot < 3 && (r -= wts[slot]) > 0) slot++;
    if (!wts[slot]) { st.nextIn = 60; return; }
    spawn(st, V, S, B, dpr, L, slot, { breach: st.passes > 0 && (slot === 1 || slot === 2) && RND() < 0.2, calf: slot < 3 && RND() < 0.35 });
    st.passes++;
    st.nextIn = 30 * (22 + RND() * 40);
  }

  /** A bank across the stage: it hides what is behind it, shows at its strength, and its mass carries on down. */
  function bank(ctx, st, i, T, W, H, b, off, alpha, fade) {
    let p = st.pats[i];
    if (!p || p.T !== T) p = st.pats[i] = { T, col: ctx.createPattern(T.col, 'repeat-x'), mask: T.mask === T.col ? null : ctx.createPattern(T.mask, 'repeat-x') };
    const top = b.crest - 0.1 * b.hh, o = ((off % b.tw) + b.tw) % b.tw, cut = top + b.hh - 2;
    const m = new DOMMatrix([b.tw / T.w, 0, 0, b.hh / T.h, -o, top]);
    p.col.setTransform(m); if (p.mask) p.mask.setTransform(m);
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = fade;
    ctx.fillStyle = p.mask || p.col; ctx.fillRect(0, top, W, cut - top);
    ctx.fillStyle = '#000'; ctx.fillRect(0, cut, W, H - cut);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha * fade;
    ctx.fillStyle = p.col; ctx.fillRect(0, top, W, cut - top);
    ctx.globalAlpha = alpha * fade * T.baseA; ctx.fillStyle = rgba(T.base, 1); ctx.fillRect(0, cut, W, H - cut);
    ctx.globalAlpha = 1;
  }

  window.BG_EXT.skywhale = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.6, 1.7), { W, H, u, pv } = V, L = K.light(), dpr = bg.dpr || 1, li = L ? 1 : 0;
    const S = K.scene(bg, V, () => build(bg, V));
    const key = `${W}x${H}@${dpr}`;
    let st = bg.st;
    if (!st || st.kind !== 'skywhale' || st.key !== key) {
      if (st && st.kind === 'skywhale') for (let i = QUEUE.length - 1; i >= 0; i--) if (QUEUE[i].owner === st) QUEUE.splice(i, 1); // sprites nobody will draw
      st = bg.st = init(V, key, S);
    }
    if (st.L !== L) { // light / dark switched: the whales in flight are lit again at once (the other light's sprites are let go)
      st.L = L;
      for (const [k, sp] of st.spr) if (!k.endsWith(L ? 'L' : 'D')) { st.spr.delete(k); const i = QUEUE.indexOf(sp); if (i >= 0) QUEUE.splice(i, 1); }
      for (const wh of st.whales) {
        const a = SLOTS[wh.slot].a[li];
        wh.set = need(st, wh.Lpx, wh.fog, a, L); finish(wh.set);
        if (wh.calf) { wh.calf.set = need(st, wh.calf.Lpx, wh.calf.fog, a, L); finish(wh.calf.set); }
      }
    }
    const B = S.banks, k7 = u / 700, q = Math.min(2, dpr), age = ++st.age;
    pump(5);
    schedule(st, V, S, B, dpr, L);
    const fadeIn = (k) => { if (st.seen[k] == null) st.seen[k] = t; return sm(0, 24, t - st.seen[k]); }; // a texture just made comes in softly

    // the whales move; puffs drift, grow and fade
    for (const wh of st.whales) if (wh.set.ready && (!wh.calf || wh.calf.set.ready)) stepWhale(st, wh, S, B, V);
    st.whales = st.whales.filter((wh) => (wh.breach ? wh.age < wh.b0 + wh.bD + 120 : wh.dir > 0 ? wh.x - wh.Lc * 1.2 < W : wh.x + wh.Lc * 1.2 > 0));
    for (const p of st.puffs) { p.age++; p.x += p.vx - 0.02 * k7; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; }
    st.puffs = st.puffs.filter((p) => p.age < p.life);

    ctx.save(); ctx.translate(0, -V.oy);

    // 1. the sky's light, the low sun, the last stars (a few still twinkling)
    ctx.drawImage(S.sky, 0, 0, W, S.skyH);
    if (S.tw.length) {
      ctx.fillStyle = '#e6eaff';
      for (const s of S.tw) { s.ph += s.sp; ctx.globalAlpha = s.a * (0.4 + 0.6 * Math.sin(s.ph) ** 2); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // 2. a veil of cirrus high up, and islands of cloud in the open sky
    if (age > 3) { // (its texture is made on a later frame than the first, which has enough to do)
      const ci = K.noiseTex('swCirrus', 512, 96, { px: 3, py: 1, oct: 5, lo: 0.5, hi: 0.86, warp: 2.2, env: 'band', envPow: 1.3, seed: 83 });
      K.mist(ctx, L ? ci : K.tint(ci, '#ffd6c6'), W, H * 0.06, H * 0.2, u * 2.6, t * 0.03 * k7, (L ? 0.45 : 0.06) * fadeIn('ci'));
    }
    for (const c of st.isl) {
      c.x -= c.sp * k7;
      if (c.x < -c.w) { c.x = W + RND() * W * 0.3; c.v = (c.v + 1) % 3; }
      const T0 = cloudTex('i', c.v, L);
      if (!T0) continue;
      const T = fit(T0, c.w * q), hh = (c.w * T.h) / T.w, f = fadeIn('i' + c.v);
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = f; ctx.drawImage(T.mask, c.x, c.y - hh * 0.7, c.w, hh);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (L ? 0.62 : 0.3) * f; ctx.drawImage(T.col, c.x, c.y - hh * 0.7, c.w, hh);
    }
    ctx.globalAlpha = 1;

    // 3. the sea of cloud, far to near, with the whales of each depth between its banks
    const wisp = age > 6 ? K.noiseTex('swWisp', 512, 96, { px: 5, py: 1, oct: 5, lo: 0.42, hi: 0.86, warp: 1.8, env: 'band', envPow: 1.2, seed: 61 }) : null, wispC = wisp && (L ? wisp : K.tint(wisp, '#f0dce0'));
    const puffT = st.puffs.length ? puffTex() : null, puffC = puffT && K.tint(puffT, L ? '#8a9ccc' : '#f2dcdc');
    const layer = (s) => {
      for (const wh of st.whales) {
        if (wh.slot !== s || !wh.set.ready || (wh.calf && !wh.calf.set.ready)) continue;
        drawWhale(ctx, wh, wh.set, SLOTS[s].a[li]);
        if (wh.calf) drawWhale(ctx, wh.calf, wh.calf.set, SLOTS[s].a[li]);
      }
      for (const p of st.puffs) {
        if (p.slot !== s) continue;
        const k = p.age / p.life, r = p.r * (1 + p.gr * Math.sqrt(k)), a = p.a * sm(0, 0.12, k) * (1 - k) ** 1.3;
        if (a < 0.004) continue;
        if (L) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = a * 0.75; ctx.drawImage(puffT, p.x - r, p.y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.22; }
        else ctx.globalAlpha = a * 0.5;
        ctx.drawImage(puffC, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 4; i++) {
      const b = B[i], T0 = cloudTex('b', i, L);
      if (T0) bank(ctx, st, i, fit(T0, b.tw * q), W, H + 2, b, t * b.sp * k7 + i * 137, BANK_A[li][i], fadeIn('b' + i));
      if (i === 1 && !L) { ctx.globalCompositeOperation = 'lighter'; K.glow(ctx, S.sun[0], S.sun[1], u * 0.5, [[0, 'rgba(255,196,156,0.08)'], [1, 'rgba(255,196,156,0)']], 1, 0.42); ctx.globalCompositeOperation = 'source-over'; } // the sun behind the far cloud
      if (wisp && (i === 1 || i === 2)) K.mist(ctx, wispC, W, b.crest - H * (i === 1 ? 0.035 : 0.045), H * (i === 1 ? 0.07 : 0.09), u * (i === 1 ? 1.6 : 2), (i === 1 ? 1 : -1) * t * 0.06 * k7 + i * 300, (L ? 0.3 : 0.07) * fadeIn('wi'));
      layer(i);
    }
    layer(3);

    // 4. small birds now and then, far off; motes of light drifting up
    if (!pv && --st.birdIn <= 0) {
      st.birdIn = 30 * (45 + RND() * 70);
      const n = 3 + ((RND() * 5) | 0), dir = RND() < 0.5 ? -1 : 1, s = rr(2.2, 3.6) * Math.max(0.8, k7), y = H * rr(0.14, 0.42);
      st.birds.push({ x: dir > 0 ? -40 : W + 40, y, vx: dir * rr(0.55, 0.85) * Math.max(0.8, k7), dir, list: Array.from({ length: n }, (_, i) => ({ dx: -i * s * rr(3, 5), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * s * rr(1.4, 2.4), ph: RND() * TAU, sp: rr(0.2, 0.26), s: s * rr(0.85, 1.15) })) });
    }
    if (st.birds.length) {
      ctx.strokeStyle = L ? 'rgba(92,100,124,0.55)' : 'rgba(226,212,218,0.45)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const f of st.birds) {
        f.x += f.vx; f.y += Math.sin(t * 0.01 + f.x * 0.003) * 0.05;
        for (const b of f.list) {
          b.ph += b.sp * (Math.sin(t * 0.013 + b.dx) > 0.55 ? 0.25 : 1); // wings beat, then a glide
          const x = f.x + b.dx * f.dir, y = f.y + b.dy, k = Math.sin(b.ph), s = b.s;
          ctx.lineWidth = Math.max(0.7, s * 0.3);
          ctx.beginPath(); ctx.moveTo(x - s, y - k * s * 0.7); ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.3 - k * s * 0.15, x, y); ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.3 - k * s * 0.15, x + s, y - k * s * 0.7); ctx.stroke();
        }
      }
      st.birds = st.birds.filter((f) => (f.dir > 0 ? f.x < W + 200 : f.x > -200));
    }
    const mt = moteTex(L);
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const m of st.motes) {
      m.ph += m.sp; m.x += m.vx + Math.sin(m.ph * 0.4) * 0.05; m.y += m.vy;
      if (m.y < H * 0.08) { m.y = H * (0.7 + RND() * 0.3); m.x = RND() * W; }
      if (m.x < -10) m.x = W + 10; else if (m.x > W + 10) m.x = -10;
      const a = (L ? 0.45 : 0.38) * Math.sin(m.ph) ** 2 * sm(H * 0.08, H * 0.2, m.y), d = m.r * (pv ? 2.5 : 6);
      if (a < 0.01) continue;
      ctx.globalAlpha = a; ctx.drawImage(mt, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.restore();
  };
})();
