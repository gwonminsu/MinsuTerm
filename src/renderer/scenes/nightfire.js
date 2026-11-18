'use strict';
/*
 * 밤하늘 불꽃: a quiet night over a bay. Hazy hills and a small harbour town line the far shore (an arched bridge,
 * a few lit windows, a mast blinking on the hill), a tree stands on the near bank. About twice a second a
 * shell climbs from a barge on the water, slows, hangs a moment and blooms: peony, chrysanthemum, willow, ring, palm,
 * crossette, glitter; every ten to fifteen seconds a volley, and rarely a small finale. Live stars are capped: when
 * the sky is full, the farthest, oldest bursts burn out early. Sparks cool from white through their colour
 * to embers under gravity and drag; each burst lights the haze and the water for a moment and leaves a drift of
 * smoke. Far shells bloom small, low and dim, the odd near one large. On a light page it is dusk: the shore is
 * inked, and the bursts are drawn over the page in deeper colours instead of being added as light.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('nightfire'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const HOT = [255, 250, 238], BLACK = [0, 0, 0];
  const pick = (a) => a[(RND() * a.length) | 0];
  const pickW = (o) => { let s = 0; for (const k in o) s += o[k]; let r = RND() * s; for (const k in o) { r -= o[k]; if (r <= 0) return k; } return Object.keys(o)[0]; };

  /** Star colours per palette: [on a dark page], [on a light page (deeper, drawn over it)]. */
  const PAL = {
    gold: [[[255, 204, 118], [255, 172, 76]], [[186, 112, 8], [204, 136, 18]]],
    red: [[[255, 94, 84], [255, 234, 224]], [[206, 34, 40], [222, 92, 36]]],
    blue: [[[120, 166, 255], [226, 236, 255]], [[28, 76, 204], [72, 108, 214]]],
    green: [[[112, 236, 150], [214, 255, 188]], [[12, 140, 72], [92, 150, 24]]],
    purple: [[[198, 128, 255], [255, 176, 236]], [[124, 42, 198], [192, 36, 140]]],
    multi: [[[255, 94, 84], [255, 204, 96], [112, 226, 140], [120, 166, 255], [204, 128, 255]], [[206, 34, 40], [186, 112, 8], [12, 140, 72], [28, 76, 204], [124, 42, 198]]],
    silver: [[[236, 240, 255], [198, 210, 240]], [[66, 76, 110], [96, 104, 134]]],
  };
  const PAL_W = { gold: 16, red: 13, blue: 13, green: 11, purple: 11, multi: 13, silver: 6, accent: 7 };
  const TYPE_W = { peony: 20, chrys: 17, willow: 10, ring: 12, palm: 9, crossette: 9, glitter: 12 };
  function colours(name, L) {
    if (name === 'accent') { const [a0, a1] = fxColors(); return L ? [mix(a0, BLACK, 0.25), mix(a1, BLACK, 0.25)] : [mix(a0, [255, 255, 255], 0.2), mix(a1, [255, 255, 255], 0.35)]; }
    return PAL[name][L ? 1 : 0];
  }

  /* ---------- sprites (made once, cached) ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** A star of the shell: a firm core in a short soft halo. */
  const dot = (c, L) => radial(`nfDot|${c}|${L ? 'L' : 'D'}`, 24, L
    ? [[0, rgba(c, 1)], [0.2, rgba(c, 0.9)], [0.42, rgba(c, 0.2)], [0.75, rgba(c, 0.035)], [1, rgba(c, 0)]]
    : [[0, rgba(mix(c, HOT, 0.55), 1)], [0.2, rgba(c, 0.95)], [0.44, rgba(c, 0.32)], [0.72, rgba(c, 0.07)], [1, rgba(c, 0)]]);
  /** The flash at the heart of a burst. */
  const flashSpr = (c, L) => radial(`nfFlash|${c}|${L ? 'L' : 'D'}`, 64, L
    ? [[0, rgba(c, 0.75)], [0.25, rgba(c, 0.28)], [0.6, rgba(c, 0.06)], [1, rgba(c, 0)]]
    : [[0, rgba(mix(c, HOT, 0.75), 1)], [0.1, rgba(mix(c, HOT, 0.35), 0.62)], [0.32, rgba(c, 0.2)], [0.66, rgba(c, 0.05)], [1, rgba(c, 0)]]);
  /** A wide soft light: what the burst throws on the haze around it. */
  const softSpr = (c) => radial(`nfSoft|${c}`, 64, [[0, rgba(c, 1)], [0.35, rgba(c, 0.5)], [0.7, rgba(c, 0.12)], [1, rgba(c, 0)]]);

  /** A colour's life as a star: white-hot, its colour, then cooling to an ember. Six steps, each a sprite and a stroke style. */
  function ramp(c, L) {
    const key = `nfRamp|${c}|${L ? 'L' : 'D'}`;
    let r = K.cache.get(key);
    if (r) return r;
    const em = L ? [124, 60, 30] : [255, 122, 54];
    const steps = L
      ? [mix(c, BLACK, 0.15), mix(c, BLACK, 0.06), c, mix(c, em, 0.35), mix(c, em, 0.7), em]
      : [mix(c, HOT, 0.85), mix(c, HOT, 0.45), c, mix(c, em, 0.4), mix(c, em, 0.75), mix(em, [170, 46, 24], 0.35)];
    r = { spr: steps.map((s) => dot(s, L)), str: steps.map(rgb), c };
    K.cache.set(key, r);
    return r;
  }

  /** A puff of smoke: noise inside a soft round envelope (white; tinted by K.tint). */
  function smokeTex(i) {
    const key = `nfSmoke${i}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 96, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(71 + i * 13, 4, 4, 4);
    for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const dx = ((k + 0.5) / N) * 2 - 1, dy = ((j + 0.5) / N) * 2 - 1, rr = dx * dx + dy * dy;
      if (rr >= 1) continue;
      const al = Math.max(0, Math.min(1, (f((k / N) * 4, (j / N) * 4) - 0.32) / 0.45)) * (1 - rr) ** 2;
      const o = (j * N + k) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(al * 255);
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }
  const hazeTex = () => K.noiseTex('nfHaze', 512, 160, { px: 5, py: 2, oct: 5, lo: 0.5, hi: 0.9, env: 'band', envPow: 0.7, warp: 1.6, seed: 37 });

  /* ---------- the still scenery ---------- */

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(7741), q = bg.dpr || 1, z = V.z, pv = V.pv;
    const wy = Math.round(H * 0.76); // where the far shore meets the water
    const lw = (v) => Math.max(pv ? 0.5 : 0.7, v);
    const smooth = (h) => { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) o[i] = (h[Math.max(0, i - 2)] + h[Math.max(0, i - 1)] * 2 + h[i] * 3 + h[Math.min(h.length - 1, i + 1)] * 2 + h[Math.min(h.length - 1, i + 2)]) / 9; return o; };

    // the hills: a long hazy range, higher toward the ends, and a lower, darker line of hills in front of it
    const N = 128, X = (i) => -6 + ((W + 12) * i) / N;
    const bh = K.ridge(R, N, 0.55), fh = smooth(K.ridge(R, N, 0.58));
    const envB = (k) => Math.min(1, 0.28 + 0.72 * Math.exp(-(((k - 0.17) / 0.2) ** 2)) + 0.5 * Math.exp(-(((k - 0.88) / 0.16) ** 2)));
    const envF = (k) => 0.35 + 0.65 * Math.exp(-(((k - 0.42) / 0.26) ** 2));
    const backY = (i) => wy - u * (0.03 + 0.13 * envB(i / N) * (0.5 + 0.5 * bh[i]));
    const frontY = (i) => wy - u * (0.012 + 0.045 * envF(i / N) * (0.45 + 0.55 * fh[i]));
    const hillTop = (x) => { const i = Math.max(0, Math.min(N, Math.round(((x + 6) / (W + 12)) * N))); return backY(i); };
    const hy0 = Math.floor(wy - u * 0.19), [hills, hc] = K.layer(W, wy + 2 - hy0, q);
    hc.translate(0, -hy0);
    const ridgePath = (Y) => { const p = new Path2D(); p.moveTo(-6, wy + 2); for (let i = 0; i <= N; i++) p.lineTo(X(i), Y(i)); p.lineTo(W + 6, wy + 2); p.closePath(); return p; };
    const inkB = L ? [128, 134, 156] : [60, 72, 108], inkF = L ? [86, 92, 112] : [26, 31, 47];
    const wash = (Y, ink, top, low, amp) => { // strong along the crest, thinning toward the shore; strokes down the slopes
      const path = ridgePath(Y), g = hc.createLinearGradient(0, wy - amp, 0, wy);
      g.addColorStop(0, rgba(ink, top)); g.addColorStop(0.6, rgba(ink, top * 0.55 + low * 0.45)); g.addColorStop(1, rgba(ink, low));
      hc.save(); hc.globalCompositeOperation = 'destination-out'; hc.fill(path); hc.restore(); // it hides what is behind it
      hc.fillStyle = g; hc.fill(path);
      hc.save(); hc.clip(path); hc.lineCap = 'round';
      for (let i = 2; i < N - 1; i++) {
        if (R() > 0.4) continue;
        const dh = Y(i + 1) - Y(i - 1), x = X(i), y = Y(i), len = amp * (0.1 + R() * 0.25), dx = (dh > 0 ? 1 : -1) * len * (0.4 + R() * 0.6);
        hc.strokeStyle = rgba(ink, (top * (0.25 + R() * 0.35)).toFixed(3)); hc.lineWidth = lw(u * (0.0012 + R() * 0.0016));
        hc.beginPath(); hc.moveTo(x, y + 1); hc.quadraticCurveTo(x + dx * 0.3, y + len * 0.5, x + dx, y + len); hc.stroke();
      }
      hc.restore();
    };
    wash(backY, inkB, 1, 0.3, u * 0.15);
    wash(frontY, inkF, 1, 0.55, u * 0.05);
    hc.fillStyle = rgb(inkF); // trees along the front ridge
    for (let x = 0; x < W; x += Math.max(1.2, u * (0.003 + R() * 0.004))) {
      const i = Math.round(((x + 6) / (W + 12)) * N), y = frontY(i), r = u * (0.0022 + R() * 0.003) * (pv ? 1.4 : 1);
      if (R() < 0.75) { hc.beginPath(); hc.ellipse(x, y + r * 0.2, r, r * (1.1 + R() * 0.5), 0, 0, TAU); hc.fill(); }
    }
    // a radio mast on the high hill at the left, its warning light set per frame
    let mi = Math.round(N * 0.17);
    for (let i = Math.round(N * 0.08); i < Math.round(N * 0.28); i++) if (backY(i) < backY(mi)) mi = i;
    const mx = X(mi), mBase = backY(mi) + u * 0.002, mTop = mBase - u * 0.05;
    hc.strokeStyle = rgb(inkB); hc.lineWidth = lw(u * 0.0016); hc.lineCap = 'round';
    hc.beginPath(); hc.moveTo(mx, mBase); hc.lineTo(mx, mTop); hc.stroke();
    hc.lineWidth = lw(u * 0.0011);
    for (let k = 1; k <= 3; k++) { const y = mBase - (mBase - mTop) * (k / 4), ww = u * 0.006 * (1 - k / 5); hc.beginPath(); hc.moveTo(mx - ww, y); hc.lineTo(mx + ww, y); hc.stroke(); }

    // the far shore: a small harbour town, an arched bridge on the left, trees between the houses
    const ty0 = Math.floor(wy - u * 0.1), [town, tc] = K.layer(W, wy + 2 - ty0, q), [lights, lc] = K.layer(W, wy + 2 - ty0, q);
    tc.translate(0, -ty0); lc.translate(0, -ty0);
    const inkT = L ? '#2c313b' : '#05070b';
    tc.fillStyle = inkT; tc.strokeStyle = inkT; tc.lineCap = 'round';
    tc.fillRect(-4, wy - u * 0.004, W + 8, u * 0.004 + 3); // the embankment
    const winds = [], lamps = [], toggles = [];
    const WARM = L ? [[214, 140, 40], [200, 110, 40]] : [[255, 206, 130], [255, 180, 104]], COOL = L ? [[90, 120, 170]] : [[206, 222, 255]];
    const cs = Math.max(pv ? 0.6 : 1, u * 0.0026);
    const bx0 = W * 0.03, bx1 = W * (pv ? 0.22 : 0.27), deck = wy - u * 0.018;
    { // the bridge: a deck on stone piers, arches cut out beneath, lamps along it
      tc.fillRect(bx0, deck, bx1 - bx0, wy - deck + 1);
      const n = pv ? 4 : 7, span = (bx1 - bx0) / n;
      tc.save(); tc.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n; i++) { tc.beginPath(); tc.ellipse(bx0 + span * (i + 0.5), wy + 0.5, span * 0.38, (wy - deck) * 0.7, 0, Math.PI, 0); tc.fill(); }
      tc.restore();
      tc.fillRect(bx0 - u * 0.006, deck - u * 0.006, u * 0.008, wy - deck + u * 0.006); // the abutment towers
      tc.fillRect(bx1 - u * 0.002, deck - u * 0.006, u * 0.008, wy - deck + u * 0.006);
      for (let i = 0; i <= n * 2; i++) {
        const x = bx0 + ((bx1 - bx0) * i) / (n * 2);
        tc.lineWidth = lw(u * 0.0011); tc.beginPath(); tc.moveTo(x, deck); tc.lineTo(x, deck - u * 0.007); tc.stroke();
        lamps.push([x, deck - u * 0.008, R() < 0.5 ? 0 : 1]);
      }
    }
    // houses and blocks: sparse at the ends, a denser, taller quarter in the middle
    const dens = (k) => 0.18 + 0.82 * Math.exp(-(((k - 0.6) / 0.2) ** 2));
    for (let x = bx1 + u * 0.01; x < W + u * 0.02;) {
      const k = x / W, d = dens(k);
      if (R() > 0.35 + d * 0.65) { // a gap, often with a tree in it
        const gw = u * (0.008 + R() * 0.02);
        if (R() < 0.7) { const tx = x + gw / 2, th = u * (0.008 + R() * 0.012); tc.beginPath(); tc.ellipse(tx, wy - th * 0.6, gw * 0.45, th * 0.6, 0, 0, TAU); tc.fill(); for (let j = 0; j < 3; j++) { tc.beginPath(); tc.arc(tx + (R() - 0.5) * gw * 0.6, wy - th * (0.6 + R() * 0.5), th * (0.3 + R() * 0.25), 0, TAU); tc.fill(); } }
        x += gw;
        continue;
      }
      const bw = u * (0.008 + R() * 0.02 + d * R() * 0.012), tall = R() < 0.14 * d ? R() * 0.05 : 0, hgt = u * (0.007 + R() * 0.026 * d + tall), top = wy - hgt;
      tc.fillRect(x, top, bw, hgt + 1);
      const roof = R();
      if (roof < 0.34) { tc.beginPath(); tc.moveTo(x - bw * 0.06, top + 0.5); tc.lineTo(x + bw * 0.5, top - bw * (0.28 + R() * 0.2)); tc.lineTo(x + bw * 1.06, top + 0.5); tc.closePath(); tc.fill(); }
      else if (roof < 0.5) tc.fillRect(x + bw * (0.15 + R() * 0.4), top - u * 0.004, bw * 0.3, u * 0.004 + 1);
      else if (roof < 0.57 && hgt > u * 0.025) { const ax = x + bw * (0.3 + R() * 0.4); tc.lineWidth = lw(u * 0.001); tc.beginPath(); tc.moveTo(ax, top); tc.lineTo(ax, top - u * (0.01 + R() * 0.012)); tc.stroke(); }
      // windows: a few lit in a grid of dark ones
      const gap = cs * 2, warm = pick(WARM);
      for (let yy = top + gap * 0.7; yy < wy - gap * 0.5; yy += gap) {
        for (let xx = x + cs * 0.7; xx < x + bw - cs * 1.3; xx += gap) {
          const p = R();
          if (p > 0.14) continue;
          const w = { x: xx, y: yy, c: R() < 0.82 ? warm : pick(COOL), a: 0.45 + R() * 0.4 };
          if (p < 0.012 && toggles.length < 6) { w.on = R() < 0.6; w.next = 200 + R() * 900; toggles.push(w); } else winds.push(w);
        }
      }
      x += bw + (R() < 0.55 ? 0 : u * (0.002 + R() * 0.007));
    }
    // lamps along the promenade in front of the town
    for (let x = bx1 + u * 0.03; x < W; x += u * (0.022 + R() * 0.012)) if (dens(x / W) > 0.3) lamps.push([x, wy - u * 0.007, 0]);
    // the lights, baked: windows and lamps (their reflections are drawn per frame)
    for (const w of winds) { lc.fillStyle = rgba(w.c, w.a); lc.fillRect(w.x, w.y, cs, cs); }
    const lampC = L ? [[204, 124, 34], [190, 150, 90]] : [[255, 214, 150], [255, 236, 200]];
    for (const [x, y, k] of lamps) {
      lc.fillStyle = rgba(lampC[k], L ? 0.9 : 0.8); lc.beginPath(); lc.arc(x, y, Math.max(pv ? 0.4 : 0.7, u * 0.0016), 0, TAU); lc.fill();
      if (!L) { const g = lc.createRadialGradient(x, y, 0, x, y, u * 0.008); g.addColorStop(0, rgba(lampC[k], 0.22)); g.addColorStop(1, rgba(lampC[k], 0)); lc.fillStyle = g; lc.fillRect(x - u * 0.008, y - u * 0.008, u * 0.016, u * 0.016); }
    }
    // the town's top edges, which catch the light of a burst
    let rim = null;
    if (!L) {
      const [rc0, rc] = K.layer(W, wy + 2 - ty0, q);
      rc.drawImage(town, 0, 0, W, wy + 2 - ty0);
      rc.globalCompositeOperation = 'destination-out'; rc.drawImage(town, 0, Math.max(1, u * 0.0022), W, wy + 2 - ty0);
      rc.globalCompositeOperation = 'source-in'; rc.fillStyle = '#e8ecff'; rc.fillRect(0, 0, W, wy + 2 - ty0);
      rim = rc0;
    }

    // the near bank in the bottom right: grass along its edge, a broad tree leaning over the water
    const fw = Math.min(W * 0.46, u * 0.62), fx0 = W - fw, fy0 = Math.floor(H - u * 0.4), [fore, fc] = K.layer(fw, H - fy0, q);
    fc.translate(-fx0, -fy0);
    const inkN = L ? '#23272f' : '#020305';
    fc.fillStyle = inkN; fc.strokeStyle = inkN; fc.lineCap = 'round';
    const bank = (k) => { const x = fx0 + fw * k; return [x, H - u * 0.085 * Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) ** 1.6]; };
    fc.beginPath(); fc.moveTo(fx0 - 2, H + 2);
    for (let i = 0; i <= 40; i++) { const [x, y] = bank(i / 40); fc.lineTo(x, y + (i % 3 ? 0 : u * 0.002)); }
    fc.lineTo(W + 2, H + 2); fc.closePath(); fc.fill();
    for (let i = 0; i < (pv ? 30 : 110); i++) { // grass, longer toward the top of the bank
      const k = 0.04 + R() * 0.96, [x, y] = bank(k), gl = u * (0.008 + R() * 0.02) * (0.4 + k), lean = (R() - 0.35) * gl * 0.7;
      fc.lineWidth = lw(u * (0.0012 + R() * 0.001)); fc.beginPath(); fc.moveTo(x, y + 1); fc.quadraticCurveTo(x + lean * 0.3, y - gl * 0.6, x + lean, y - gl); fc.stroke();
    }
    { // the tree: a leaning trunk, limbs reaching left, clouds of small leaves at their ends
      const [tx, ty] = bank(0.8), th = u * 0.2, tips = [];
      const limb = (x, y, len, ang, wid, depth) => {
        let px = x, py = y, a = ang;
        for (let i = 0; i < 4; i++) {
          a += (R() - 0.5) * 0.3;
          const nx = px + Math.cos(a) * (len / 4), ny = py + Math.sin(a) * (len / 4);
          fc.lineWidth = Math.max(0.6, wid * (1 - 0.18 * i)); fc.beginPath(); fc.moveTo(px, py); fc.lineTo(nx, ny); fc.stroke();
          px = nx; py = ny;
        }
        if (depth <= 0) { tips.push([px, py, len]); return; }
        const n = 2 + (R() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) limb(px, py, len * (0.58 + R() * 0.2), a + (i - (n - 1) / 2) * 0.75 + (R() - 0.5) * 0.3, wid * 0.6, depth - 1);
      };
      limb(tx, ty + 2, th * 0.55, -Math.PI / 2 - 0.22, u * 0.011, 2);
      limb(tx - u * 0.01, ty - th * 0.3, th * 0.45, -Math.PI / 2 - 0.9, u * 0.006, 1);
      const leaf = Math.max(pv ? 0.7 : 1, u * 0.0058);
      for (const [lx, ly, len] of tips) {
        const r = len * 0.75, n = pv ? 26 : 90;
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, d = r * Math.sqrt(R()) * (0.6 + 0.4 * Math.abs(Math.sin(a * 2.5 + lx))), x = lx + Math.cos(a) * d, y = ly + Math.sin(a) * d * 0.72 - r * 0.18;
          fc.beginPath(); fc.ellipse(x, y, leaf * (0.8 + R() * 0.6), leaf * (0.4 + R() * 0.25), R() * Math.PI, 0, TAU); fc.fill();
        }
      }
    }

    // the sky: the town's glow on the horizon (dusk on a light page), and the fixed stars above the hills
    const [sky, sc] = K.layer(W, wy, q);
    const hg = sc.createLinearGradient(0, wy, 0, 0);
    if (L) { hg.addColorStop(0, 'rgba(238,146,104,0.28)'); hg.addColorStop(0.2, 'rgba(228,138,146,0.15)'); hg.addColorStop(0.5, 'rgba(170,150,210,0.06)'); hg.addColorStop(1, 'rgba(170,150,210,0)'); }
    else { hg.addColorStop(0, 'rgba(255,178,124,0.085)'); hg.addColorStop(0.16, 'rgba(206,150,168,0.04)'); hg.addColorStop(0.45, 'rgba(120,132,204,0.014)'); hg.addColorStop(1, 'rgba(120,132,204,0)'); }
    sc.fillStyle = hg; sc.fillRect(0, 0, W, wy);
    const twinkle = [];
    if (!L) {
      const n = Math.round(pv ? 26 : Math.min(420, (W * H) / 40000 * 13));
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() ** 1.3 * (wy - u * 0.05);
        if (y > hillTop(x) - u * 0.01) continue;
        const r = (0.35 + R() * 0.55) * (pv ? 0.7 : 1), a = (0.12 + R() * 0.34) * (1 - 0.5 * (y / wy));
        sc.fillStyle = rgba(R() < 0.2 ? [255, 228, 200] : [222, 230, 255], a.toFixed(3)); sc.beginPath(); sc.arc(x, y, r, 0, TAU); sc.fill();
      }
      for (let i = 0; i < (pv ? 5 : 26); i++) {
        const x = R() * W, y = R() ** 1.5 * (wy - u * 0.1);
        if (y > hillTop(x) - u * 0.02) continue;
        twinkle.push({ x, y, r: (0.6 + R() * 0.6) * (pv ? 0.7 : 1), a: 0.25 + R() * 0.35, ph: R() * TAU, sp: 0.015 + R() * 0.03 });
      }
    }
    return { wy, hy0, hills, ty0, town, lights, rim, fore, fx0, fy0, fw, sky, twinkle, toggles, lamps, cs, mast: [mx, mTop] };
  }

  /* ---------- the display ---------- */

  function init(V, key) {
    return { kind: 'nightfire', key, sparks: [], shells: [], bursts: [], smoke: [], queue: [], recent: [],
      wait: V.pv ? 2 : 8, volleyIn: V.pv ? 200 : 240 + RND() * 150, finaleIn: 2400 + RND() * 1800, max: V.pv ? 200 : 560, hazeP: null, hazeM: null };
  }

  /** A shell leaves the water: o may fix its type, palette, x (0..1), distance (dz) and how full it is (dens). */
  function launch(st, V, S, o) {
    const { W, H, u } = V, L = K.light(), wy = S.wy;
    const dz = o.dz != null ? o.dz : 0.5 + 0.75 * RND() ** 1.7; // most shells far off, now and then a near one
    const type = o.type || pickW(TYPE_W);
    let palN = o.pal || pickW(PAL_W);
    if (type === 'willow' && !o.pal) palN = RND() < 0.75 ? 'gold' : 'silver';
    if (type === 'glitter' && !o.pal && RND() < 0.5) palN = RND() < 0.5 ? 'gold' : 'silver';
    if (type === 'palm' && !o.pal && RND() < 0.55) palN = 'gold';
    const sz = u * dz * (V.pv ? 1.55 : 1), R0 = sz * 0.15 * (type === 'willow' ? 1.15 : type === 'palm' ? 1.1 : 1);
    let x = o.x != null ? o.x * W : 0;
    if (o.x == null) { // away from the last few bursts
      let best = -1;
      for (let k = 0; k < 4; k++) {
        const c = W * (0.07 + 0.86 * RND()), d = st.recent.reduce((m, r) => Math.min(m, Math.abs(r - c)), 1e9);
        if (d > best) { best = d; x = c; }
      }
    }
    st.recent.unshift(x); st.recent.length = Math.min(st.recent.length, 4);
    const alt = (V.pv ? 0.8 : 1) * (0.24 + RND() * 0.22) * (0.55 + 0.45 * dz) * H;
    const y = Math.max(wy - alt, V.oy + R0 * 1.05 + H * 0.025);
    const cols = colours(palN, L);
    st.shells.push({ x0: x + (RND() - 0.5) * u * 0.02, y0: wy + u * 0.004, x1: x, y1: y, T: Math.round(20 + (26 * (wy - y)) / H + RND() * 6), pause: 3 + ((RND() * 5) | 0), age: 0, hx: [], hy: [],
      type, cols, alt: o.alt || (palN === 'multi' ? null : colours(pickW(PAL_W), L)), dz, R0, sz, bright: 0.5 + 0.42 * Math.min(1, (dz - 0.5) / 0.75), dens: o.dens || 1, ph: RND() * TAU, multi: palN === 'multi' });
  }

  const STARS = { peony: 90, chrys: 58, willow: 50, ring: 84, palm: 22, crossette: 32, glitter: 56 }; // roughly, per shell

  /**
   * Room for n more stars under the cap: when there is not enough, the farthest and oldest bursts burn out early
   * (over a few frames, not in a blink). Returns the room there is.
   */
  function makeRoom(st, n) {
    let live = 0;
    for (const p of st.sparks) if (!(p.b && p.b.dying)) live++;
    let need = live + n - st.max;
    if (need > 0) {
      const old = st.bursts.filter((b) => !b.dying && b.n > 0).sort((a, c) => c.age * (1.8 - c.dz) - a.age * (1.8 - a.dz));
      for (const b of old) { if (need <= 0) break; b.dying = true; need -= b.n; live -= b.n; }
    }
    return Math.max(0, st.max - live);
  }

  /** The shell opens. */
  function burst(st, V, sh, wy) {
    const L = K.light(), { R0 } = sh, sz = Math.max(V.pv ? 0.55 : 0.75, sh.sz * 0.0019);
    const fill = Math.min(1, (0.3 + 0.7 * sh.dz) * sh.dens), room = makeRoom(st, Math.round(STARS[sh.type] * fill * (V.pv ? 0.7 : 1)));
    const b = { x: sh.x1, y: sh.y1, R: R0, c: sh.cols[0], ph: RND() * TAU, age: 0, bright: sh.bright, dz: sh.dz, dying: false, fade: 1, n0: 0, n: 0, wy };
    st.bursts.push(b);
    const cnt = (n) => Math.max(0, Math.min(Math.round(n * fill * (V.pv ? 0.7 : 1)), room));
    const a0 = sh.bright * (L ? 1.3 : 1), g0 = R0 * 0.00095; // a light page needs more ink than a dark one needs light
    const colOf = (i) => (sh.multi ? sh.cols[i % sh.cols.length] : sh.cols[i % 2 === 0 || sh.cols.length < 2 ? 0 : 1]);
    const add = (x, y, vx, vy, life, dr, g, s, c, a, o) => {
      st.sparks.push({ x, y, vx, vy, age: 0, life: Math.round(life), dr, g, sz: s, r: ramp(c, L), r2: o && o.c2 ? ramp(o.c2, L) : null, cq: o && o.cq || 2,
        a, tr: (o && o.tr) || 0, mode: (o && o.mode) || 0, split: (o && o.split) || 0, hx: o && o.hist ? new Float32Array(8) : null, hy: o && o.hist ? new Float32Array(8) : null, hn: 0, b, ph: RND() * 8 });
      b.n0++;
    };
    const sphere = (n, v, life, dr, g, s, a, o, colFn) => {
      for (let i = 0; i < n; i++) {
        const zz = RND() * 2 - 1, p = RND() * TAU, r = Math.sqrt(1 - zz * zz), sp = v * (0.9 + RND() * 0.2);
        add(b.x, b.y, Math.cos(p) * r * sp, Math.sin(p) * r * sp, life * (0.85 + RND() * 0.3), dr, g, s, colFn ? colFn(i) : colOf(i), a, o);
      }
    };
    const two = sh.alt ? sh.alt[0] : sh.cols[1] || sh.cols[0];
    switch (sh.type) {
      case 'peony': {
        const change = RND() < 0.3, pistil = !change && RND() < 0.35;
        sphere(cnt(76), R0 * 0.07, 56, 0.93, g0, sz, a0 * 0.85, { tr: 1.1, c2: change ? two : null, cq: 0.42 + RND() * 0.1 });
        if (pistil) sphere(cnt(14), R0 * 0.032, 46, 0.93, g0 * 0.8, sz * 0.9, a0 * 0.9, { tr: 1 }, () => two);
        break;
      }
      case 'chrys': {
        const change = RND() < 0.3;
        sphere(cnt(58), R0 * 0.075, 60, 0.935, g0, sz * 0.95, a0 * 0.8, { tr: 3, c2: change ? two : null, cq: 0.5 });
        break;
      }
      case 'willow':
        sphere(cnt(50), R0 * 0.05, 112, 0.95, R0 * 0.0011, sz * 0.9, a0 * 0.72, { hist: 1, mode: 3 });
        break;
      case 'ring': {
        const tilt = (RND() - 0.5) * 1.3, roll = RND() * TAU, n = cnt(48), ca = Math.cos(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + (RND() - 0.5) * 0.04, rx = Math.cos(a), ry = Math.sin(a) * ca, v = R0 * 0.07 * (0.96 + RND() * 0.08);
          add(b.x, b.y, (rx * cr - ry * sr) * v, (rx * sr + ry * cr) * v, 52 * (0.9 + RND() * 0.2), 0.93, g0 * 0.8, sz, sh.cols[0], a0 * 0.9, { tr: 1.4 });
        }
        if (RND() < 0.3) { // a second ring across the first
          const m = cnt(26), c2 = Math.cos(tilt + 1.2);
          for (let i = 0; i < m; i++) { const a = (i / m) * TAU, rx = Math.cos(a) * c2, ry = Math.sin(a), v = R0 * 0.055 * (0.96 + RND() * 0.08); add(b.x, b.y, (rx * cr - ry * sr) * v, (rx * sr + ry * cr) * v, 40 * (0.9 + RND() * 0.2), 0.93, g0 * 0.8, sz * 0.9, two, a0 * 0.85, { tr: 1.4 }); }
        }
        sphere(cnt(10), R0 * 0.022, 44, 0.93, g0 * 0.6, sz * 0.85, a0 * 0.85, null, () => two);
        break;
      }
      case 'palm': {
        const n = Math.max(1, Math.min(cnt(10), 7 + ((RND() * 4) | 0))), off = RND() * TAU;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU + (RND() - 0.5) * 0.3, fo = 0.75 + RND() * 0.25, v = R0 * 0.062 * fo;
          add(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v - R0 * 0.012, 66 * (0.9 + RND() * 0.2), 0.952, R0 * 0.0017, sz * 1.8, colOf(i), a0 * 0.85, { hist: 1, mode: 2 });
        }
        sphere(cnt(12), R0 * 0.028, 34, 0.93, g0, sz * 0.8, a0 * 0.7);
        break;
      }
      case 'crossette': {
        const n = Math.max(1, Math.min(cnt(8), 6 + ((RND() * 3) | 0))), off = RND() * TAU;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU + (RND() - 0.5) * 0.25, v = R0 * 0.064;
          add(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 999, 0.94, g0, sz * 1.4, colOf(i), a0 * 0.9, { tr: 2.6, split: 13 + ((RND() * 4) | 0) });
        }
        break;
      }
      case 'glitter':
        sphere(cnt(56), R0 * 0.066, 62, 0.935, g0 * 1.1, sz * 0.95, a0 * 0.85, { mode: 1 });
        break;
    }
    b.n = b.n0;
    // the smoke it leaves, drifting off with the air
    if (st.smoke.length >= (V.pv ? 4 : 14)) st.smoke.shift();
    st.smoke.push({ x: b.x, y: b.y, r: R0 * (0.85 + RND() * 0.3), age: 0, life: 200 + RND() * 120, a: (0.6 + 0.4 * sh.bright), i: (RND() * 3) | 0, vx: (0.04 + RND() * 0.05) * (V.u / 700), c: sh.cols[0] });
  }

  /**
   * What the display does next: about two shells a second, often a quick pair, now and then a breath of a second or
   * so; every ten to fifteen seconds a volley, and once in a while a small finale.
   */
  function schedule(st, V, S) {
    for (let i = st.queue.length - 1; i >= 0; i--) if (--st.queue[i].at <= 0) { launch(st, V, S, st.queue[i].o); st.queue.splice(i, 1); }
    st.volleyIn--; st.finaleIn--;
    if (st.queue.length || --st.wait > 0) return;
    const pal = () => pickW(PAL_W), q = (at, o) => st.queue.push({ at, o });
    if (!V.pv && st.finaleIn <= 0) { // a small finale: shells of every kind at once, a crackle to close it
      st.finaleIn = 2700 + RND() * 1800; st.volleyIn = Math.max(st.volleyIn, 300); st.wait = 60;
      const n = 9 + ((RND() * 4) | 0);
      for (let i = 0; i < n; i++) q(1 + RND() * 45, { type: pick(['peony', 'chrys', 'ring', 'glitter', 'crossette', 'peony', 'chrys', 'willow']), x: 0.08 + 0.84 * ((i + RND() * 0.8) / n), dz: 0.55 + RND() * 0.5, dens: 0.55 });
      for (let i = 0; i < 3; i++) q(50 + i * 7, { type: 'glitter', pal: RND() < 0.5 ? 'silver' : 'gold', x: 0.25 + RND() * 0.5, dz: 0.8 + RND() * 0.35, dens: 0.7 });
      return;
    }
    if (st.volleyIn <= 0) { // a volley: a run of shells in a pattern
      st.volleyIn = (V.pv ? 260 : 300) + RND() * 150; st.wait = 30 + RND() * 15;
      const kind = pick(['sweep', 'twin', 'fan', 'salvo', 'stack']), type = pick(['ring', 'peony', 'chrys', 'crossette', 'palm', 'willow', 'glitter']), p1 = pal(), p2 = pal(), dz = 0.6 + RND() * 0.35;
      if (kind === 'sweep') { const n = 6 + ((RND() * 3) | 0), rev = RND() < 0.5, gap = 4 + RND() * 3; for (let i = 0; i < n; i++) q(1 + i * gap, { type, pal: i % 2 ? p2 : p1, x: 0.1 + 0.8 * ((rev ? n - 1 - i : i) / (n - 1)), dz, dens: 0.7 }); }
      else if (kind === 'twin') { for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) q(1 + i * 10, { type, pal: i % 2 ? p2 : p1, x: 0.5 + sg * (0.12 + i * 0.09), dz: dz + 0.2 - i * 0.07, dens: 0.65 }); }
      else if (kind === 'fan') { const cx = 0.3 + RND() * 0.4; for (let i = 0; i < 7; i++) q(1 + i * 4, { type, pal: i === 3 ? p2 : p1, x: cx + (i - 3) * 0.06, dz: dz + (i === 3 ? 0.2 : 0), dens: 0.65 }); }
      else if (kind === 'salvo') { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q(1 + i * 13 + RND() * 3, { type: pick(['peony', 'chrys', 'ring', 'glitter']), pal: j === 1 ? p2 : p1, x: 0.15 + 0.7 * ((j + RND() * 0.6) / 2.6), dz: 0.55 + RND() * 0.45, dens: 0.6 }); }
      else { const cx = 0.25 + RND() * 0.5; for (let i = 0; i < 5; i++) q(1 + i * 7, { type: i === 4 ? 'willow' : type, pal: i === 4 ? 'gold' : p1, x: cx + (RND() - 0.5) * 0.08, dz: 0.55 + i * 0.12, dens: 0.7 }); }
      return;
    }
    launch(st, V, S, {});
    const r = RND();
    st.wait = V.pv ? 8 + RND() * 14 : r < 0.25 ? 2 + RND() * 4 : r < 0.33 ? 26 + RND() * 16 : 8 + RND() * 20; // a quick pair, a breath, or the usual beat
  }

  window.BG_EXT.nightfire = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.62, 1.7), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'nightfire' || st.key !== S.key) st = bg.st = init(V, S.key);
    const { wy } = S, k7 = u / 700, add = L ? 'source-over' : 'lighter';
    schedule(st, V, S);
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round';

    // the bursts age: flash, the slower light they leave on the haze, the sparks still burning
    for (const b of st.bursts) { b.age++; if (b.dying) b.fade -= 0.2; b.fl = b.age < 2 ? 0.6 : Math.exp(-(b.age - 1) / 4.5); b.slow = Math.min(1, b.age / 2) * Math.exp(-b.age / 10); }

    // 1. haze lit from inside: drawn first on the empty canvas, then cut to the shape of the haze
    const tex = hazeTex(), hy = H * 0.04, hh = wy - H * 0.04 - u * 0.02, tw = u * 2.4;
    if (!st.hazeM) { st.hazeM = ctx.createPattern(tex, 'repeat-x'); st.hazeP = ctx.createPattern(K.tint(tex, L ? '#b48ea0' : '#a6b0d4'), 'repeat-x'); }
    const off = (t * 0.045 * k7) % tw, mat = new DOMMatrix([tw / tex.width, 0, 0, hh / tex.height, -off, hy]);
    st.hazeM.setTransform(mat); st.hazeP.setTransform(mat);
    let lit = false;
    for (const b of st.bursts) {
      const a = b.slow * b.bright * (L ? 0.28 : 0.4);
      if (a < 0.01) continue;
      const r = b.R * 3.2;
      ctx.globalAlpha = Math.min(1, a); ctx.drawImage(softSpr(b.c), b.x - r, b.y - r, r * 2, r * 2);
      lit = true;
    }
    if (lit) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = st.hazeM; ctx.fillRect(0, hy, W, hh); ctx.globalCompositeOperation = 'source-over'; }

    // 2. the sky: the horizon's glow, the stars (a few twinkling), the haze itself
    ctx.globalAlpha = 1; ctx.drawImage(S.sky, 0, 0, W, wy);
    if (S.twinkle.length) {
      ctx.fillStyle = '#e4eaff';
      for (const s of S.twinkle) { s.ph += s.sp; ctx.globalAlpha = s.a * (0.45 + 0.55 * Math.sin(s.ph) ** 2); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = L ? 0.12 : 0.06; ctx.fillStyle = st.hazeP; ctx.fillRect(0, hy, W, hh);

    // 3. smoke from earlier bursts, drifting; a new burst nearby lights it
    for (let i = st.smoke.length - 1; i >= 0; i--) {
      const s = st.smoke[i];
      s.age++; s.x += s.vx; s.y -= 0.02 * k7;
      if (s.age >= s.life) { st.smoke.splice(i, 1); continue; }
      const q = s.age / s.life, r = s.r * (1 + q * 0.9), a = s.a * Math.min(1, s.age / 30) * (1 - q) ** 1.5;
      let glow = 0, gc = null;
      for (const b of st.bursts) { if (b.slow < 0.02) continue; const d = Math.hypot(b.x - s.x, b.y - s.y), reach = b.R * 2.6 + r; if (d < reach) { const v = b.slow * b.bright * (1 - d / reach); if (v > glow) { glow = v; gc = b.c; } } }
      const tx = smokeTex(s.i);
      ctx.globalAlpha = a * (L ? 0.085 : 0.065); ctx.drawImage(K.tint(tx, L ? '#8a8e9c' : '#8e98b8'), s.x - r, s.y - r, r * 2, r * 2);
      if (glow > 0.02) { ctx.globalCompositeOperation = add; ctx.globalAlpha = Math.min(1, glow * a * (L ? 0.2 : 0.35)); ctx.drawImage(K.tint(tx, rgb(gc)), s.x - r, s.y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.globalAlpha = 1;

    // 4. the hills and the far town; the mast's light; the town's edges lit by a fresh burst
    K.stamp(ctx, S.hills, 0, S.hy0, W, wy + 2 - S.hy0, L ? 0.42 : 0.5);
    const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#a4b0d0');
    K.mist(ctx, fog, W, wy - u * 0.075, u * 0.095, u * 1.6, t * 0.08 * k7, L ? 0.5 : 0.07); // mist lying along the far shore
    const blink = Math.max(0, Math.sin(t * 0.085)) ** 6;
    if (blink > 0.02) { const [mx, my] = S.mast; ctx.globalAlpha = blink * (L ? 0.8 : 0.7); ctx.fillStyle = L ? '#c8322c' : '#ff5a4a'; ctx.beginPath(); ctx.arc(mx, my, Math.max(0.6, u * 0.0022), 0, TAU); ctx.fill(); if (!L) { ctx.globalAlpha = blink * 0.3; K.glow(ctx, mx, my, u * 0.012, [[0, 'rgba(255,90,74,0.6)'], [1, 'rgba(255,90,74,0)']]); } ctx.globalAlpha = 1; }
    K.stamp(ctx, S.town, 0, S.ty0, W, wy + 2 - S.ty0, L ? 0.62 : 0.9);
    ctx.globalAlpha = L ? 0.9 : 0.85; ctx.drawImage(S.lights, 0, S.ty0, W, wy + 2 - S.ty0);
    for (const w of S.toggles) { // a few windows go on and off over the minutes
      if (--w.next <= 0) { w.on = !w.on; w.next = 300 + RND() * 1500; }
      if (w.on) { ctx.globalAlpha = w.a; ctx.fillStyle = rgb(w.c); ctx.fillRect(w.x, w.y, S.cs, S.cs); }
    }
    if (S.rim) {
      let fl = 0;
      for (const b of st.bursts) fl += b.slow * b.bright * Math.max(0, 1 - Math.abs(b.y - wy) / (H * 0.7));
      if (fl > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.5, fl * 0.45); ctx.drawImage(S.rim, 0, S.ty0, W, wy + 2 - S.ty0); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.globalAlpha = 1;

    // 5. the water: the town upside down and wavering, ripples catching the sky, the lights' long reflections
    const th = wy - S.ty0, lq = S.town.width / W, sl = Math.max(2, th / (pv ? 4 : 10));
    if (!st.wg) { // the horizon's glow, lying on the water too
      st.wg = ctx.createLinearGradient(0, wy, 0, H);
      if (L) { st.wg.addColorStop(0, 'rgba(238,146,104,0.15)'); st.wg.addColorStop(0.5, 'rgba(206,146,170,0.06)'); st.wg.addColorStop(1, 'rgba(170,150,210,0.02)'); }
      else { st.wg.addColorStop(0, 'rgba(255,178,124,0.05)'); st.wg.addColorStop(0.4, 'rgba(160,150,190,0.015)'); st.wg.addColorStop(1, 'rgba(120,132,204,0)'); }
    }
    ctx.fillStyle = st.wg; ctx.fillRect(0, wy, W, H - wy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, wy, W, H - wy); ctx.clip();
    ctx.globalAlpha = L ? 0.2 : 0.32;
    for (let y0 = 0; y0 < th; y0 += sl) { // slices from the waterline up, laid from the waterline down, each nudged by the swell
      const sh = Math.min(sl, th - y0), dx = Math.sin(t * 0.05 + y0 * 0.31) * u * 0.0022 * (1 + y0 / th);
      ctx.drawImage(S.town, 0, (th - y0 - sh) * lq, S.town.width, sh * lq, dx, wy + y0 * 0.9, W, sh * 0.9 + 0.5);
    }
    ctx.restore();
    ctx.globalCompositeOperation = add;
    const wh = H - wy, lc = L ? [196, 120, 40] : [255, 206, 140];
    ctx.fillStyle = rgb(lc);
    for (let i = 0; i < S.lamps.length; i++) {
      const [x] = S.lamps[i];
      if (x > S.fx0 + S.fw * 0.3) continue;
      for (let j = 0; j < 3; j++) {
        const y = wy + u * 0.004 + j * u * 0.009, ww = u * (0.002 + 0.0015 * j) * (0.6 + 0.4 * Math.sin(t * 0.09 + i * 1.7 + j * 2.1));
        ctx.globalAlpha = (L ? 0.22 : 0.18) * (1 - j * 0.28); ctx.fillRect(x - ww + Math.sin(t * 0.06 + i + j) * u * 0.0012, y, ww * 2, Math.max(1, u * 0.0016));
      }
    }
    ctx.fillStyle = L ? '#6a7690' : '#c8d2f0';
    for (let i = 0; i < (pv ? 5 : 22); i++) { // the sky's light on the ripples
      const k = (i * 0.618 + 0.13) % 1, y = wy + u * 0.012 + wh * k * 0.95, len = u * (0.012 + 0.03 * (((i * 7) % 5) / 5)) * (0.5 + k);
      const x = ((i * 157.3 + t * 0.05 * k7 * (1 + (i % 3))) % (W + 120)) - 60;
      ctx.globalAlpha = (L ? 0.1 : 0.05) * (0.5 + 0.5 * Math.sin(t * 0.05 + i * 2.3)); ctx.fillRect(x, y, len, Math.max(0.8, u * 0.0014));
    }
    for (const b of st.bursts) { // each burst laid on the water as a broken column of light
      const I = b.bright * (b.fl * 0.8 + 0.55 * b.slow + 0.32 * (b.n / Math.max(1, b.n0)) * Math.max(0, 1 - b.age / 70));
      if (I < 0.012) continue;
      ctx.fillStyle = rgb(b.c);
      const M = pv ? 5 : 18, lh = Math.max(pv ? 0.6 : 1, u * 0.0013);
      for (let j = 0; j < M; j++) {
        const k = (j + 0.5) / M, y = wy + u * 0.004 + wh * k ** 1.3 * 0.97, s1 = Math.sin(t * 0.17 + j * 2.7 + b.ph), s2 = Math.sin(t * 0.23 + j * 1.3 + b.ph * 2);
        const ww = b.R * (0.06 + 0.3 * k) * (0.5 + 0.5 * s1 * s1), x = b.x + Math.sin(t * 0.07 + j * 1.9 + b.ph) * b.R * (0.08 + 0.12 * k);
        ctx.globalAlpha = Math.min(1, I * (L ? 0.4 : 0.5) * (1 - 0.6 * k) * (0.3 + 0.7 * s2 * s2));
        ctx.fillRect(x - ww, y, ww * 2, lh);
        if (j % 3 === 1) { ctx.globalAlpha *= 0.6; ctx.fillRect(x - ww * 2.2 + b.R * 0.1 * s2, y + lh * 1.5, ww * 0.8, lh); ctx.fillRect(x + ww * 1.3, y - lh * 1.2, ww * 0.6, lh); }
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 6. shells climbing: a faint spark that slows, hangs a moment, then opens
    ctx.globalCompositeOperation = add;
    const tail = ramp(L ? [150, 100, 44] : [255, 214, 168], L);
    for (let i = st.shells.length - 1; i >= 0; i--) {
      const sh = st.shells[i];
      sh.age++;
      let x = sh.x1, y = sh.y1, a;
      if (sh.age <= sh.T) {
        const p = sh.age / sh.T, e = 1 - (1 - p) ** 2.2;
        x = sh.x0 + (sh.x1 - sh.x0) * p + Math.sin(sh.age * 0.55 + sh.ph) * u * 0.0007; y = sh.y0 + (sh.y1 - sh.y0) * e;
        a = sh.bright * (0.3 + 0.5 * (1 - p)) * (sh.type === 'palm' ? 1.5 : 1);
        sh.hx.unshift(x); sh.hy.unshift(y); if (sh.hx.length > 6) { sh.hx.length = 6; sh.hy.length = 6; }
        if (sh.age < 5) { const r = u * 0.014 * sh.dz; ctx.globalAlpha = sh.bright * 0.3 * (1 - sh.age / 5); ctx.drawImage(flashSpr(tail.c, L), sh.x0 - r, sh.y0 - r, r * 2, r * 2); } // the mortar's flash on the water
        if (sh.type === 'palm' && sh.age % 2 === 0 && st.sparks.length < st.max) st.sparks.push({ x, y, vx: (RND() - 0.5) * u * 0.0006, vy: u * 0.0004, age: 6, life: 16, dr: 0.9, g: u * 0.00004, sz: Math.max(0.5, sh.sz * 0.0012), r: ramp(PAL.gold[L ? 1 : 0][0], L), r2: null, cq: 2, a: sh.bright * 0.55, tr: 0, mode: 0, split: 0, hx: null, hy: null, hn: 0, b: null, ph: 0 });
      } else if (sh.age <= sh.T + sh.pause) {
        a = sh.bright * 0.12; sh.hx.pop(); sh.hy.pop();
      } else { burst(st, V, sh, wy); st.shells.splice(i, 1); continue; }
      const n = sh.hx.length, lwid = Math.max(pv ? 0.5 : 0.8, u * 0.0016 * sh.dz) * (sh.type === 'palm' ? 1.6 : 1);
      ctx.strokeStyle = tail.str[2]; ctx.lineWidth = lwid;
      for (let j = 1; j < n; j++) { ctx.globalAlpha = a * 0.45 * (1 - j / n); ctx.beginPath(); ctx.moveTo(sh.hx[j - 1], sh.hy[j - 1]); ctx.lineTo(sh.hx[j], sh.hy[j]); ctx.stroke(); }
      const d = lwid * 5;
      ctx.globalAlpha = Math.min(1, a); ctx.drawImage(tail.spr[1], x - d / 2, y - d / 2, d, d);
    }

    // 7. the bursts: the flash at the heart, then every star under gravity and drag, cooling as it goes
    for (const b of st.bursts) {
      if (b.fl < 0.02) continue;
      const r = b.R * 1.15 * (0.7 + 0.3 * Math.min(1, b.age / 3));
      ctx.globalAlpha = Math.min(1, b.fl * b.bright * (L ? 0.3 : 0.45) * (pv ? 0.6 : 1)); ctx.drawImage(flashSpr(b.c, L), b.x - r, b.y - r, r * 2, r * 2);
    }
    const sp = st.sparks, born = [];
    let j = 0, ss = '', sw = 0; // the stroke style and width last set: set again only when they change
    const pen = (style, width) => { if (style !== ss) { ctx.strokeStyle = style; ss = style; } if (width !== sw) { ctx.lineWidth = width; sw = width; } };
    for (let i = 0; i < sp.length; i++) {
      const p = sp[i];
      p.age++;
      p.vx *= p.dr; p.vy = p.vy * p.dr + p.g; p.x += p.vx; p.y += p.vy;
      if (p.split && p.age >= p.split) { // a crossette's star splits four ways
        const v = Math.hypot(p.vx, p.vy) * 0.4 + p.b.R * 0.045, a0 = Math.atan2(p.vy, p.vx);
        for (let k = 0; k < 4; k++) { const a = a0 + Math.PI / 4 + (k * Math.PI) / 2; born.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 2, life: 24 + ((RND() * 6) | 0), dr: 0.91, g: p.g, sz: p.sz * 0.8, r: p.r, r2: null, cq: 2, a: p.a, tr: 3.2, mode: 0, split: 0, hx: null, hy: null, hn: 0, b: p.b, ph: 0 }); }
        if (p.b) { p.b.n0 += 3; p.b.n += 3; } // four in place of one
        const d = p.sz * 9; ctx.globalAlpha = p.a * 0.8; ctx.drawImage(p.r.spr[0], p.x - d / 2, p.y - d / 2, d, d);
        continue;
      }
      const q = p.age / p.life;
      if (q >= 1 || p.y > wy - 1 || (p.b && p.b.fade <= 0)) { if (p.b) p.b.n--; continue; }
      const kk = q < 0.05 ? 0 : q < 0.12 ? 1 : q < 0.58 ? 2 : q < 0.72 ? 3 : q < 0.86 ? 4 : 5;
      const rr = p.r2 && q > p.cq ? p.r2 : p.r;
      let a = p.a * (q < 0.58 ? 1 : ((1 - q) / 0.42) ** 1.3) * (p.b ? p.b.fade : 1);
      if (p.mode === 1 && q > 0.3) { // glitter: the stars strobe, then crackle out
        if (q > 0.68 && RND() < 0.07) { const d = p.sz * 11; ctx.globalAlpha = Math.min(1, p.a * 1.1); ctx.drawImage(rr.spr[0], p.x - d / 2, p.y - d / 2, d, d); if (p.b) p.b.n--; continue; }
        if ((p.age + p.ph) % 5 > 1.6) a *= 0.12;
        const gd = p.sz * 3.2;
        for (let k = 1; k <= 2; k++) { if (RND() < 0.5) continue; ctx.globalAlpha = Math.min(1, p.a * 0.6 * (1 - k / 4)); ctx.drawImage(p.r.spr[0], p.x - p.vx * k * 2.2 + (RND() - 0.5) * gd - gd / 2, p.y - p.vy * k * 2.2 + k * p.sz * 0.8 - gd / 2, gd, gd); }
      } else if (p.mode === 3) a *= 0.8 + 0.2 * Math.sin(p.age * 0.9 + p.ph * 3); // a willow's gold shimmers
      if (p.hx) { // a willow's strand: where it has been, kept every third frame
        if (p.age % 3 === 1) { p.hx.copyWithin(1, 0, 7); p.hy.copyWithin(1, 0, 7); p.hx[0] = p.x; p.hy[0] = p.y; p.hn = Math.min(8, p.hn + 1); }
        if (p.hn > 1 && a > 0.02) {
          pen(rr.str[Math.min(5, kk + 1)], p.sz * 0.8); ctx.globalAlpha = a * 0.32;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); for (let k = 0; k < p.hn; k++) ctx.lineTo(p.hx[k], p.hy[k]); ctx.stroke();
        }
      } else if (p.tr && (Math.abs(p.vx) + Math.abs(p.vy)) * p.tr > 1.2 && a > 0.02) { // a streak while it still moves fast enough to leave one
        pen(rr.str[Math.min(5, kk + 1)], p.sz * 0.85); ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * p.tr, p.y - p.vy * p.tr); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      if (p.mode === 2 && p.age % 3 === 0 && sp.length + born.length < st.max) born.push({ x: p.x, y: p.y, vx: p.vx * 0.2 + (RND() - 0.5) * 0.3 * k7, vy: p.vy * 0.2, age: 8, life: 22, dr: 0.9, g: p.g * 0.6, sz: p.sz * 0.5, r: p.r, r2: null, cq: 2, a: p.a * 0.7, tr: 0, mode: 0, split: 0, hx: null, hy: null, hn: 0, b: null, ph: 0 }); // a palm's frond sheds sparks
      const d = p.sz * 6.5;
      if (a > 0.012) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(rr.spr[kk], p.x - d / 2, p.y - d / 2, d, d); }
      sp[j++] = p;
    }
    sp.length = j;
    for (const p of born) sp.push(p);
    st.bursts = st.bursts.filter((b) => b.n > 0 || b.age < 40);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 8. the near bank and its tree, in front of everything
    K.stamp(ctx, S.fore, S.fx0, S.fy0, S.fw, H - S.fy0, L ? 0.7 : 0.93);
    ctx.restore();
  };
})();
