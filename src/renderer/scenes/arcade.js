'use strict';
/*
 * 레트로 오락실: a dim arcade at night. Two rows of upright cabinets line an aisle that runs back to a neon sign on
 * the far wall. Every screen runs its own attract mode (pixel patterns rolling under scanlines) in slowly cycling
 * colours and throws its light on the carpet in front of it and on the cabinets beside it. The carpet's
 * glow-in-the-dark print shows faintly, dust hangs in the light, and now and then one screen celebrates a new high
 * score. Once in a long while the sign stutters and buzzes back on. On a light page the lights are up: the
 * cabinets are inked in slate, the screens and the sign are laid on in deeper colours, nothing is added as light.
 *
 * The room is a pinhole view down the aisle (x across, y up, z away, metres). Cabinets, their art and the carpet
 * are painted once; the screens are holes in the cabinet layer, drawn per frame underneath it, so nearer cabinets
 * hide farther screens and the bezel shades each screen's edge.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('arcade'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const EYE = 1.5, A = 1.25, D = 0.86, Z0 = 1.9, PITCH = 0.8, CW = 0.74, N = 8, ZB = Z0 + (N - 1) * PITCH + CW + 0.34;
  const NEON = [[255, 70, 196], [70, 214, 255], [172, 112, 255], [255, 168, 64], [104, 250, 160], [255, 92, 120]];
  const NEON_L = [[196, 34, 138], [12, 130, 184], [116, 62, 206], [190, 104, 10], [18, 140, 82], [196, 40, 66]];
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const WHITE = [255, 255, 255];
  const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  // the sign speaks the app's language: [word, font]
  const SIGN = {
    ko: ['오락실', FONT],
    en: ['ARCADE', '"Segoe UI", "Helvetica Neue", Arial, sans-serif'],
    ja: ['ゲームセンター', '"Yu Gothic", "Hiragino Sans", Meiryo, sans-serif'],
    zh: ['街机厅', '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif'],
  };
  const lang = () => (window.I18N && SIGN[window.I18N.lang] ? window.I18N.lang : 'ko');
  // the cabinets' faces: [dark page, light page]
  const TONE = {
    D: { base: '#06050b', kick: '#08070e', coin: '#0e0c17', edge: '#181421', panel: '#1b1728', bezel: '#0c0a14', mq: '#120f1b', capTop: '#0c0a13', capBot: '#040308', glass: '#020205', trim: [70, 60, 96] },
    L: { base: '#353a4a', kick: '#2c3040', coin: '#474d61', edge: '#5b6278', panel: '#687088', bezel: '#3b4053', mq: '#4c5267', capTop: '#3c4153', capBot: '#2a2e3b', glass: '#22252f', trim: [120, 128, 150] },
  };

  /* ---------- the screens' pictures: pixel patterns, two texels a row (the second dimmed: scanlines) ---------- */

  const TW = 36, LR = 96, WIN = 24; // texture width, rows in one period, rows on screen at once
  const PATS = ['stars', 'maze', 'racer', 'title'];
  const SPEED = { stars: 0.22, maze: 0.07, racer: 0.42, title: 0.025, hiscore: 0, hiscoreB: 0, noise: 2.6 };
  function texture(kind) {
    const key = `arcTex|${kind}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const R = K.rng(97 + kind.length * 131 + kind.charCodeAt(0) * 7), lo = K.mk(TW, LR), x = lo.getContext('2d');
    const px = (cx, cy, w, h, col) => { x.fillStyle = col; x.fillRect(cx, cy, w, h); };
    const C = (c, m = 1) => `rgb(${(c[0] * m) | 0},${(c[1] * m) | 0},${(c[2] * m) | 0})`;
    if (kind === 'stars') { // a shooter's attract mode: stars rolling down, formations of little diamonds
      px(0, 0, TW, LR, 'rgb(4,6,18)');
      for (let i = 0; i < 70; i++) px((R() * TW) | 0, (R() * LR) | 0, 1, 1, C(R() < 0.3 ? [150, 180, 255] : WHITE, 0.25 + R() * 0.6));
      for (let y = 4; y < LR; y += 16) {
        const c = NEON[(y >> 4) % 6], off = (y >> 4) % 2 ? 4 : 0;
        for (let k = 0; k < 4; k++) { const x0 = 3 + off + k * 8; px(x0 + 1, y, 1, 3, C(c)); px(x0, y + 1, 3, 1, C(c)); px(x0 - 1, y + 2, 1, 1, C(c, 0.6)); px(x0 + 3, y + 2, 1, 1, C(c, 0.6)); }
      }
      for (let i = 0; i < 8; i++) px((R() * TW) | 0, (R() * LR) | 0, 1, 2, 'rgb(255,230,120)');
    } else if (kind === 'maze') { // a maze with dots in its corridors and two runners
      px(0, 0, TW, LR, 'rgb(3,3,13)');
      for (let gy = 0; gy < LR; gy += 6) for (let gx = 0; gx < TW; gx += 6) {
        if (R() < 0.42) px(gx, gy, 7, 1, 'rgb(206,72,226)');
        if (R() < 0.42) px(gx, gy, 1, 7, 'rgb(206,72,226)');
        if (R() < 0.75) px(gx + 3, gy + 3, 1, 1, 'rgb(255,220,150)');
      }
      px(15, 27, 2, 2, 'rgb(255,240,90)'); px(27, 63, 2, 2, 'rgb(90,255,220)'); px(9, 81, 2, 2, 'rgb(255,110,130)');
    } else if (kind === 'racer') { // a top-down road: kerbs, a dashed line, a few cars
      px(0, 0, TW, LR, 'rgb(5,15,10)');
      for (let i = 0; i < 40; i++) px((R() * TW) | 0, (R() * LR) | 0, 1, 1, 'rgb(28,70,40)');
      px(8, 0, 20, LR, 'rgb(24,24,36)');
      for (let y = 0; y < LR; y += 4) { const col = (y >> 2) % 2 ? 'rgb(220,50,64)' : 'rgb(226,226,232)'; px(7, y, 1, 4, col); px(28, y, 1, 4, col); }
      for (let y = 0; y < LR; y += 8) px(17, y, 2, 4, 'rgb(240,210,90)');
      for (let k = 0; k < 4; k++) { const cx = R() < 0.5 ? 10 + ((R() * 3) | 0) : 21 + ((R() * 3) | 0), cy = k * 24 + ((R() * 14) | 0); px(cx, cy, 5, 7, C(NEON[(k + 1) % 6])); px(cx + 1, cy + 1, 3, 2, 'rgb(20,24,40)'); }
    } else if (kind === 'title') { // a title card: a mirrored pixel emblem, a line of "text", a blinking prompt
      px(0, 0, TW, LR, 'rgb(7,4,18)');
      for (let b = 0; b < LR; b += 24) {
        const c0 = NEON[(b / 24) % 6], c1 = NEON[(b / 24 + 2) % 6];
        for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 7; gx++) if (R() < 0.5) { const col = C(gy < 4 ? c0 : c1); px(11 + gx, b + 3 + gy, 1, 1, col); px(24 - gx, b + 3 + gy, 1, 1, col); }
        for (let k = 0; k < 6; k++) if (R() < 0.8) px(6 + k * 4, b + 15, 3, 2, C([230, 230, 240], 0.8));
        px(10, b + 19, 16, 1, C(c1, 0.8));
      }
    } else if (kind === 'hiscore' || kind === 'hiscoreB') { // the score table; B has its top line blanked (it blinks)
      px(0, 0, TW, LR, 'rgb(6,4,14)');
      px(6, 2, 24, 2, 'rgb(255,214,90)');
      for (let r = 0; r < 5; r++) {
        if (kind === 'hiscoreB' && r === 0) continue;
        const y = 7 + Math.round(r * 3.4), col = r === 0 ? [255, 236, 150] : NEON[(r + 1) % 6];
        for (let k = 0; k < 3; k++) px(4 + k * 3, y, 2, 2, C(col));
        for (let k = 0; k < 6; k++) px(16 + k * 3, y, 2, 2, C(col, 0.85));
      }
    } else { // noise: a set that has lost its signal
      for (let j = 0; j < LR; j++) for (let i = 0; i < TW; i++) { const v = (20 + R() * 80) | 0; px(i, j, 1, 1, `rgb(${v},${v},${v + 8})`); }
      px(0, 30, TW, 5, 'rgba(255,255,255,0.18)');
    }
    // expand: each row twice, the second dimmed, and the first screenful again at the end so a scroll can wrap
    const src = x.getImageData(0, 0, TW, LR).data, HH = (LR + WIN) * 2, out = K.mk(TW, HH), ox = out.getContext('2d'), img = ox.createImageData(TW, HH), d = img.data;
    for (let r = 0; r < LR + WIN; r++) {
      const sr = r % LR;
      for (let i = 0; i < TW; i++) {
        const s = (sr * TW + i) * 4;
        for (let h2 = 0; h2 < 2; h2++) { const o = ((r * 2 + h2) * TW + i) * 4, m = h2 ? 0.36 : 1; d[o] = src[s] * m; d[o + 1] = src[s + 1] * m; d[o + 2] = src[s + 2] * m; d[o + 3] = 255; }
      }
    }
    ox.putImageData(img, 0, 0);
    K.cache.set(key, out);
    return out;
  }

  /* ---------- sprites ---------- */

  function glowSpr(i, L) {
    const key = `arcGlow|${i}|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = (L ? NEON_L : NEON)[i], S = 64, cv = K.mk(S, S), x = cv.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(c, 1)); g.addColorStop(0.28, rgba(c, 0.55)); g.addColorStop(0.62, rgba(c, 0.15)); g.addColorStop(1, rgba(c, 0));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    K.cache.set(key, cv);
    return cv;
  }

  /** Marquee art, original and abstract: sunset bands, a ringed planet, waves, a pixel emblem, chevrons, a bolt. */
  function marquee(n, L) {
    const key = `arcMq|${n}|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const MW = 64, MH = 16, cv = K.mk(MW, MH), x = cv.getContext('2d'), R = K.rng(311 + n * 17), pal = L ? NEON_L : NEON;
    const dim = (c, m) => (L ? mix(c, [96, 100, 116], 0.25) : mix(c, [0, 0, 0], m));
    const col = (c, m = 0.42) => rgb(dim(c, m));
    if (n === 0) {
      const g = x.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, col([60, 20, 90], 0.3)); g.addColorStop(0.55, col(pal[0])); g.addColorStop(1, col(pal[3]));
      x.fillStyle = g; x.fillRect(0, 0, MW, MH);
      x.fillStyle = col([255, 214, 120], 0.3); x.beginPath(); x.arc(46, 12, 8, Math.PI, 0); x.fill();
      x.fillStyle = col(pal[0], 0.5); for (let y = 6; y < 12; y += 2) x.fillRect(36, y, 20, 1);
    } else if (n === 1) {
      x.fillStyle = col([16, 22, 70], 0.2); x.fillRect(0, 0, MW, MH);
      for (let i = 0; i < 18; i++) { x.fillStyle = col(WHITE, 0.4 + R() * 0.4); x.fillRect((R() * MW) | 0, (R() * MH) | 0, 1, 1); }
      x.fillStyle = col(pal[1], 0.35); x.beginPath(); x.arc(18, 8, 5, 0, TAU); x.fill();
      x.strokeStyle = col(pal[3], 0.35); x.lineWidth = 1.2; x.beginPath(); x.ellipse(18, 8, 10, 2.6, -0.25, 0, TAU); x.stroke();
      x.fillStyle = col(pal[2], 0.3); x.fillRect(34, 6, 24, 2); x.fillRect(34, 10, 16, 1);
    } else if (n === 2) {
      x.fillStyle = col([70, 30, 120], 0.35); x.fillRect(0, 0, MW, MH);
      x.lineWidth = 1.4;
      for (const [k, c] of [[0, pal[1]], [1, pal[4]]]) { x.strokeStyle = col(c, 0.3); x.beginPath(); for (let i = 0; i <= MW; i += 2) x.lineTo(i, 8 + k * 3 + Math.sin(i * 0.25 + k * 1.8) * 3); x.stroke(); }
    } else if (n === 3) {
      x.fillStyle = col(pal[5], 0.5); x.fillRect(0, 0, MW, MH);
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 6; gx++) if (R() < 0.55) { x.fillStyle = col([255, 220, 90], 0.35); x.fillRect(20 + gx * 2, 3 + gy * 2, 2, 2); x.fillRect(42 - gx * 2, 3 + gy * 2, 2, 2); }
    } else if (n === 4) {
      x.fillStyle = col([6, 20, 12], 0.2); x.fillRect(0, 0, MW, MH);
      x.strokeStyle = col(pal[4], 0.35); x.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const x0 = 8 + i * 10; x.beginPath(); x.moveTo(x0, 3); x.lineTo(x0 + 5, 8); x.lineTo(x0, 13); x.stroke(); }
    } else {
      x.fillStyle = col(pal[1], 0.6); x.fillRect(0, 0, MW, MH);
      x.fillStyle = col(pal[2], 0.45); for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 8, MH); x.lineTo(i * 8 + 4, MH); x.lineTo(i * 8 + 10, 0); x.lineTo(i * 8 + 6, 0); x.fill(); }
      x.fillStyle = col([255, 220, 80], 0.3); x.beginPath(); x.moveTo(30, 1); x.lineTo(24, 9); x.lineTo(31, 8); x.lineTo(27, 15); x.lineTo(38, 6); x.lineTo(31, 7); x.lineTo(35, 1); x.closePath(); x.fill();
    }
    K.cache.set(key, cv);
    return cv;
  }

  /**
   * The neon sign: a joystick in one tube, the word (오락실, or ARCADE / ゲームセンター / 街机厅 in the app's language) in another, a line under it. Tubes are built from strokes:
   * a wide faint aura, the coloured glass, a hot core (no shadowBlur). The joystick is its own sprite: it is the part
   * that stutters.
   */
  function signSprite(fs, L, q) {
    const lg = lang(), [word, font] = SIGN[lg], key = `arcSign|${lg}|${Math.round(fs * 10)}|${L ? 'L' : 'D'}|${q}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const m = K.mk(4, 4).getContext('2d');
    m.font = `400 ${fs}px ${font}`;
    const ww = m.measureText(word).width, ic = fs * 0.95, gap = fs * 0.45, pad = fs * 0.7, w = pad * 2 + ic + gap + ww, h = pad * 2 + fs * 1.45;
    const mkc = () => { const c = K.mk(w * q, h * q), x = c.getContext('2d'); x.scale(q, q); x.lineCap = 'round'; x.lineJoin = 'round'; return [c, x]; };
    const [wc, wx] = mkc(), [icn, ix] = mkc();
    const pink = L ? NEON_L[0] : NEON[0], cyan = L ? NEON_L[1] : NEON[1], vio = L ? NEON_L[2] : NEON[2];
    const aura = L ? [[0.42, 0.018], [0.27, 0.03], [0.16, 0.05]] : [[0.62, 0.028], [0.38, 0.05], [0.2, 0.11], [0.11, 0.3]];
    const tube = (x, col, path) => { // path(x) traces the tube's centre line
      for (const [k, a] of aura) { x.strokeStyle = rgba(col, a); x.lineWidth = fs * k; path(x); x.stroke(); }
      x.strokeStyle = rgba(L ? col : mix(col, WHITE, 0.1), L ? 0.9 : 0.85); x.lineWidth = fs * 0.075; path(x); x.stroke();
      x.strokeStyle = L ? 'rgba(255,255,255,0.45)' : rgba(mix(col, WHITE, 0.72), 0.95); x.lineWidth = fs * 0.03; path(x); x.stroke();
    };
    // the joystick: a base, the stick, the ball, one button
    const bx = pad + ic / 2, by = pad + fs * 1.22;
    tube(ix, cyan, (x) => { x.beginPath(); x.roundRect(bx - ic * 0.48, by - fs * 0.24, ic * 0.96, fs * 0.24, fs * 0.08); });
    tube(ix, cyan, (x) => { x.beginPath(); x.moveTo(bx - fs * 0.04, by - fs * 0.26); x.lineTo(bx - fs * 0.16, by - fs * 0.78); });
    tube(ix, cyan, (x) => { x.beginPath(); x.arc(bx - fs * 0.19, by - fs * 0.94, fs * 0.17, 0, TAU); });
    tube(ix, cyan, (x) => { x.beginPath(); x.arc(bx + ic * 0.3, by - fs * 0.37, fs * 0.08, 0, TAU); });
    // the word: aura strokes around the glyphs, the glyphs filled hot, a coloured edge
    const tx = pad + ic + gap, ty = pad + fs * 0.62;
    wx.font = `400 ${fs}px ${font}`; wx.textBaseline = 'middle';
    for (const [k, a] of aura) { wx.strokeStyle = rgba(pink, a); wx.lineWidth = fs * k; wx.strokeText(word, tx, ty); }
    wx.fillStyle = L ? rgba(pink, 0.92) : rgba(mix(pink, WHITE, 0.62), 0.95); wx.fillText(word, tx, ty);
    wx.strokeStyle = rgba(pink, L ? 0.7 : 0.75); wx.lineWidth = fs * 0.03; wx.strokeText(word, tx, ty);
    tube(wx, vio, (x) => { x.beginPath(); x.moveTo(tx + fs * 0.05, pad + fs * 1.3); x.lineTo(tx + ww - fs * 0.25, pad + fs * 1.3); x.lineTo(tx + ww - fs * 0.42, pad + fs * 1.16); });
    const sp = { word: wc, icon: icn, w, h };
    K.cache.set(key, sp);
    return sp;
  }

  /* ---------- the still scenery ---------- */

  function build(bg, V) {
    const { W, H, pv } = V, L = K.light(), R = K.rng(1984), q = bg.dpr || 1, T = TONE[L ? 'L' : 'D'], pal = L ? NEON_L : NEON;
    const k = pv ? Math.min(W * 0.3, H * 0.62) : Math.min(W * 0.26, H * 0.5); // the near cabinets' side panels run out of the picture (their feet may too)
    const f = k * Z0, cx = W * 0.53, hy = H * 0.4;
    const P = (x, y, z) => [cx + (f * x) / z, hy - (f * (y - EYE)) / z];
    const lw = (v) => Math.max(pv ? 0.4 : 0.6, v);
    const poly = (c, pts) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
    const toPath = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
    // a planar quad given as at(u, v) cut into n affine slices: [a, b, c, d, e, f, u0, du] maps the unit square onto each
    const slicesOf = (at, n) => {
      const out = [];
      for (let j = 0; j < n; j++) { const u0 = j / n, u1 = (j + 1) / n, p = at(u0, 0), r = at(u1, 0), b = at(u0, 1); out.push([r[0] - p[0], r[1] - p[1], b[0] - p[0], b[1] - p[1], p[0], p[1], u0, u1 - u0]); }
      return out;
    };

    /* the carpet: a glow-in-the-dark print of rings, squiggles, sparkles, triangles and zigzags, lying in perspective */
    const [carpet, cc] = K.layer(W, H, q);
    const zNear = (f * EYE) / (H + 6 - hy), nM = pv ? 80 : 300;
    cc.lineCap = 'round'; cc.lineJoin = 'round';
    if (L) { // with the lights up the carpet itself shows: a dusky violet pile under its print
      const [ax, ay] = P(-A - 0.4, 0, ZB), [bx] = P(A + 0.4, 0, ZB), [cx2, cy2] = P(A + 0.4, 0, zNear), [dx] = P(-A - 0.4, 0, zNear);
      const g = cc.createLinearGradient(0, ay, 0, cy2); g.addColorStop(0, 'rgba(92,84,128,0.1)'); g.addColorStop(1, 'rgba(92,84,128,0.2)');
      cc.fillStyle = g; poly(cc, [[ax, ay], [bx, ay], [cx2, cy2], [dx, cy2]]); cc.fill();
    }
    for (let m = 0; m < nM; m++) {
      const z = zNear + R() * (ZB - zNear), x = (R() * 2 - 1) * (A + 0.02), [px, py] = P(x, 0, z), sx = f / z, kind = (R() * 6) | 0, rot = R() * TAU, sz = 0.75 + R() * 0.35;
      const fade = 1 - 0.65 * ((z - zNear) / (ZB - zNear)), c = pal[(R() * 6) | 0];
      cc.save(); cc.translate(px, py); cc.scale(sx * sz, (sx * sz * EYE) / z); cc.rotate(rot);
      cc.strokeStyle = cc.fillStyle = rgba(c, ((L ? 0.42 : 0.5) * fade).toFixed(3));
      const lw0 = Math.max(0.007, (pv ? 0.5 : 0.7) / sx);
      cc.beginPath();
      if (kind === 0) cc.arc(0, 0, 0.06 + R() * 0.03, 0, TAU);
      else if (kind === 1) { cc.moveTo(-0.12, 0); cc.bezierCurveTo(-0.06, -0.09, 0, 0.09, 0.06, 0); cc.bezierCurveTo(0.09, -0.05, 0.12, -0.03, 0.14, 0.02); }
      else if (kind === 2) { const r = 0.06; cc.moveTo(0, -r); cc.lineTo(r * 0.22, -r * 0.22); cc.lineTo(r, 0); cc.lineTo(r * 0.22, r * 0.22); cc.lineTo(0, r); cc.lineTo(-r * 0.22, r * 0.22); cc.lineTo(-r, 0); cc.lineTo(-r * 0.22, -r * 0.22); cc.closePath(); cc.fill(); cc.beginPath(); }
      else if (kind === 3) { const r = 0.07; cc.moveTo(0, -r); cc.lineTo(r * 0.87, r * 0.5); cc.lineTo(-r * 0.87, r * 0.5); cc.closePath(); }
      else if (kind === 4) { cc.moveTo(-0.12, 0.02); cc.lineTo(-0.06, -0.04); cc.lineTo(0, 0.02); cc.lineTo(0.06, -0.04); cc.lineTo(0.12, 0.02); }
      else for (let j = 0; j < 3; j++) { const a = j * 2.1, r = 0.014; cc.moveTo(Math.cos(a) * 0.05 + r, Math.sin(a) * 0.05); cc.arc(Math.cos(a) * 0.05, Math.sin(a) * 0.05, r, 0, TAU); }
      cc.lineWidth = lw0 * 3.2; cc.globalAlpha = 0.22; cc.stroke(); // the print glows a little past its lines
      cc.lineWidth = lw0; cc.globalAlpha = 1; cc.stroke();
      cc.restore();
    }
    { // the carpet nearest the eye lies in the cabinets' shadow: it thins toward the bottom
      const g = cc.createLinearGradient(0, hy, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      cc.save(); cc.globalCompositeOperation = 'destination-out'; cc.fillStyle = g; cc.fillRect(0, hy, W, H - hy); cc.restore();
    }
    { // where the carpet meets the far wall
      const [x0, y0] = P(-A - 0.2, 0, ZB), [x1] = P(A + 0.2, 0, ZB);
      const g = cc.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, rgba(pal[0], 0)); g.addColorStop(0.5, rgba(pal[0], L ? 0.22 : 0.3)); g.addColorStop(1, rgba(pal[0], 0));
      cc.fillStyle = g; cc.fillRect(x0, y0 - lw(f / ZB * 0.012), x1 - x0, lw(f / ZB * 0.012));
    }

    /* the cabinets, far to near in each row; each screen is cut out of the layer with a soft edge (the bezel's shade) */
    const [cab, c] = K.layer(W, H, q);
    const screens = [];
    for (const s of [-1, 1]) for (let i = N - 1; i >= 0; i--) {
      const z0 = Z0 + i * PITCH, z1 = z0 + CW, top = 1.76 + R() * 0.1, mq = top - 0.3, X = (d) => s * (A + d), at = (d, y, z) => P(X(d), y, z);
      const near = 1 - i / N, mid = (z0 + z1) / 2, sc0 = f / mid; // near: 1 for the closest; sc0: pixels a metre here
      // the profile, from the floor at the front round to the back: kick, coin door, control panel, bezel, marquee, top
      const pr = [[0.05, 0], [0.05, 0.1], [0, 0.12], [0, 0.8], [-0.19, 0.86], [-0.22, 0.91], [0.04, 0.99], [0.3, mq - 0.02], [0.11, mq + 0.02], [0.1, top - 0.05], [0.14, top], [D, top], [D, 0]];
      const strip = (j) => { const [d1, y1] = pr[j], [d2, y2] = pr[(j + 1) % pr.length]; return [at(d1, y1, z0), at(d2, y2, z0), at(d2, y2, z1), at(d1, y1, z1)]; };
      c.fillStyle = T.base;
      for (let j = 0; j < pr.length; j++) { poly(c, strip(j)); c.fill(); }
      for (const [j, tone] of [[0, T.kick], [2, T.coin], [4, T.edge], [5, T.panel], [6, T.bezel], [8, T.mq]]) { poly(c, strip(j)); c.fillStyle = tone; c.fill(); }
      // the light of its own screen on the panel and the bezel
      const [gx, gy] = at(0.17, 1.2, mid);
      c.save(); poly(c, strip(5)); c.clip();
      K.glow(c, gx, gy, sc0 * 0.75, [[0, L ? 'rgba(220,230,255,0.16)' : 'rgba(120,150,255,0.13)'], [1, 'rgba(120,150,255,0)']]);
      c.restore();
      // coin door: an outline and two lit slots
      const cd = (u, y) => at(0, y, s > 0 ? z1 - u * CW : z0 + u * CW);
      c.strokeStyle = L ? '#5e6479' : '#1d1828'; c.lineWidth = lw(sc0 * 0.008);
      poly(c, [cd(0.3, 0.68), cd(0.7, 0.68), cd(0.7, 0.3), cd(0.3, 0.3)]); c.stroke();
      c.fillStyle = L ? '#c04a3a' : '#a33a2a';
      for (const u0 of [0.38, 0.56]) { poly(c, [cd(u0, 0.6), cd(u0 + 0.06, 0.6), cd(u0 + 0.06, 0.56), cd(u0, 0.56)]); c.fill(); }
      // control panel: a joystick and three buttons, if they are large enough to see
      if (sc0 * 0.02 > 0.6) {
        const pz = (u) => (s > 0 ? z1 - u * CW : z0 + u * CW), pt = (u, tt, up) => at(-0.22 + 0.26 * tt, 0.91 + 0.08 * tt + up, pz(u));
        const [jx, jy] = pt(0.3, 0.45, 0), [kx, ky] = pt(0.3, 0.45, 0.07);
        c.strokeStyle = L ? '#262a36' : '#030206'; c.lineWidth = lw(sc0 * 0.012); c.beginPath(); c.moveTo(jx, jy); c.lineTo(kx, ky); c.stroke();
        c.fillStyle = rgb(L ? pal[5] : mix(pal[5], [0, 0, 0], 0.45)); c.beginPath(); c.ellipse(kx, ky, sc0 * 0.022, sc0 * 0.018, 0, 0, TAU); c.fill();
        for (const [u, ci] of [[0.55, 1], [0.66, 3], [0.77, 4]]) { const [bx2, by2] = pt(u, 0.5, 0.005); c.fillStyle = rgb(L ? pal[ci] : mix(pal[ci], [0, 0, 0], 0.5)); c.beginPath(); c.ellipse(bx2, by2, sc0 * 0.016, sc0 * 0.008, 0, 0, TAU); c.fill(); }
      }
      // the marquee, lit from inside
      const art = marquee((i * 2 + (s > 0 ? 1 : 0) + 3) % 6, L), mt = top - 0.07, mb = mq + 0.04;
      const mAt = (u, v) => at(0.1 + 0.01 * v, mt - (mt - mb) * v, s > 0 ? z1 - 0.03 - u * (CW - 0.06) : z0 + 0.03 + u * (CW - 0.06));
      const mw = Math.abs(mAt(1, 0)[0] - mAt(0, 0)[0]);
      for (const sl of slicesOf(mAt, Math.max(1, Math.min(6, Math.round(mw / 10))))) {
        c.save(); c.transform(sl[0], sl[1], sl[2], sl[3], sl[4], sl[5]); c.drawImage(art, sl[6] * art.width, 0, sl[7] * art.width, art.height, 0, 0, 1.04, 1); c.restore();
      }
      // the near side panel: shaded, two bands of side art, the moulding along its front edge catching the light
      const cap = toPath(pr.map(([d, y]) => at(d, y, z0)));
      const [, yT] = at(0, top, z0), [, yB] = at(0, 0, z0), g = c.createLinearGradient(0, yT, 0, yB);
      g.addColorStop(0, T.capTop); g.addColorStop(1, T.capBot);
      c.fillStyle = g; c.fill(cap);
      c.save(); c.clip(cap);
      const sa = pal[(i + (s > 0 ? 3 : 0)) % 6];
      for (const [o, wd, m] of [[0, 0.12, L ? 0.55 : 0.8], [0.19, 0.035, L ? 0.45 : 0.74]]) {
        poly(c, [[-0.3, 0.22 + o], [D + 0.3, 1.02 + o], [D + 0.3, 1.02 + o + wd], [-0.3, 0.22 + o + wd]].map(([d, y]) => at(d, y, z0)));
        c.fillStyle = rgb(mix(sa, L ? [70, 76, 92] : [6, 5, 12], m)); c.fill();
      }
      c.restore();
      c.beginPath();
      for (let j = 1; j <= 10; j++) { const [x, y] = at(pr[j][0], pr[j][1], z0); if (j === 1) c.moveTo(x, y); else c.lineTo(x, y); }
      c.strokeStyle = rgb(mix(T.trim, sa, 0.22)); c.lineWidth = lw(sc0 * 0.012 * (0.6 + 0.4 * near)); c.stroke();
      // the screen: a dark glass rim, then the hole, soft at its edge
      const bz = (tt) => [0.04 + 0.26 * tt, 0.99 + (mq - 0.02 - 0.99) * tt], [dB, yb] = bz(0.12), [dT, yt] = bz(0.9);
      const zu = (uu) => (s > 0 ? z1 - 0.07 - uu * (CW - 0.14) : z0 + 0.07 + uu * (CW - 0.14));
      const sAt = (uu, v) => at(dT + (dB - dT) * v, yt + (yb - yt) * v, zu(uu));
      const rimAt = (uu, v) => sAt(-0.06 + uu * 1.12, -0.07 + v * 1.14);
      poly(c, [rimAt(0, 0), rimAt(1, 0), rimAt(1, 1), rimAt(0, 1)]); c.fillStyle = T.glass; c.fill();
      const corners = [sAt(0, 0), sAt(1, 0), sAt(1, 1), sAt(0, 1)], path = toPath(corners);
      const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), scx = (x0 + x1) / 2, scy = (y0 + y1) / 2;
      c.save(); c.clip(path); c.globalCompositeOperation = 'destination-out';
      c.translate(scx, scy); c.scale(Math.max(1, (x1 - x0) / 2), Math.max(1, (y1 - y0) / 2));
      const hg = c.createRadialGradient(0, 0, 0, 0, 0, 1.25);
      hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.6, 'rgba(0,0,0,0.94)'); hg.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = hg; c.fillRect(-1.3, -1.3, 2.6, 2.6);
      c.restore();
      const [fx, fy] = P(s * (A - 0.6), 0, mid), frx = sc0 * 0.85;
      screens.push({ s, i, path, slices: slicesOf(sAt, Math.max(1, Math.min(8, Math.round((x1 - x0) / 12)))), x: scx, y: scy, w: x1 - x0, h: y1 - y0,
        spill: [fx, fy, frx, (frx * EYE) / mid * 1.1], home: (i * 2 + (s > 0 ? 1 : 0)) % 6, broken: s > 0 && i === 4 });
    }

    { // the near side panels melt into the room's dark toward the walls (no hard block behind the text), the feet into the floor
      const xl1 = cx - k * (A + D), xl0 = cx - k * (A - 0.1), xr0 = cx + k * (A - 0.1), xr1 = cx + k * (A + D), o = (x) => Math.max(0, Math.min(1, x / W));
      const g = c.createLinearGradient(0, 0, W, 0), stops = [[o(xl1), 0.8], [o(xl1 * 0.55 + xl0 * 0.45), 0.4], [o(xl0), 0], [o(xr0), 0], [o(xr1 * 0.55 + xr0 * 0.45), 0.4], [o(xr1), 0.8]];
      if (o(xl1) > 0) g.addColorStop(0, 'rgba(0,0,0,0.85)');
      for (const [p, a] of stops) g.addColorStop(p, `rgba(0,0,0,${a})`);
      if (o(xr1) < 1) g.addColorStop(1, 'rgba(0,0,0,0.85)');
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = g; c.fillRect(0, 0, W, H);
      const v = c.createLinearGradient(0, H * 0.7, 0, H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.6, 'rgba(0,0,0,0.35)'); v.addColorStop(1, 'rgba(0,0,0,0.9)');
      c.fillStyle = v; c.fillRect(0, H * 0.7, W, H * 0.3 + 2); c.restore();
    }

    /* the sign on the far wall, its light on the wall */
    const fs = Math.max(pv ? 4 : 9, (f / ZB) * 0.5), sign = signSprite(fs, L, q), [sgx, sgy] = P(0, 2.55, ZB);
    const lights = screens.map((sc) => [sc.x, sc.y + sc.h * 0.8, Math.max(sc.w, sc.h) * 1.7]);
    lights.push([sgx, sgy, sign.w * 0.75]);
    return { carpet, cab, screens, sign, sgx, sgy, lights, hy, f, cx, lang: lang() };
  }

  /* ---------- the display ---------- */

  const FLICK = [1, 0.32, 0.3, 0.86, 0.28, 0.26, 0.27, 0.62, 1, 0.42, 0.95, 1, 1, 0.55, 1]; // a tube losing its arc and catching again

  const moteSpr = (L) => {
    const key = `arcMote|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(8, 8), x = c.getContext('2d'), g = x.createRadialGradient(4, 4, 0, 4, 4, 4), col = L ? [98, 90, 78] : [255, 238, 214];
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.45, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 8, 8);
    K.cache.set(key, c);
    return c;
  };

  /** A mote of dust somewhere in one light's reach (the larger lights take more of them). */
  function mote(m, S, first) {
    let li = 0;
    for (let n = 0; n < 3; n++) { const j = (RND() * S.lights.length) | 0; if (n === 0 || S.lights[j][2] > S.lights[li][2]) li = j; }
    const [lx, ly, lr] = S.lights[li], a = RND() * TAU, d = Math.sqrt(RND()) * lr * 0.85;
    m.li = li; m.x = lx + Math.cos(a) * d; m.y = ly + Math.sin(a) * d * 0.8; m.vx = 0; m.vy = 0; m.ph = RND() * TAU; m.r = 0.8 + RND() * 1.1;
    m.life = 260 + RND() * 520; m.age = first ? RND() * m.life : 0;
    return m;
  }

  function init(S, V, key) {
    const scr = S.screens.map((sc) => ({ pat: sc.broken ? 'noise' : PATS[(RND() * PATS.length) | 0], row: RND() * LR, h: sc.home + RND() * 0.6, dh: 0.0007 + RND() * 0.0008, next: 200 + RND() * 1400, blank: 0, b: 1 }));
    const motes = Array.from({ length: V.pv ? 8 : 36 }, () => mote({}, S, true));
    return { kind: 'arcade', key, scr, motes, sparks: [], hs: null, hsWait: V.pv ? 1e9 : 600 + RND() * 900, sigWait: 500 + RND() * 1200, sig: null };
  }

  window.BG_EXT.arcade = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.42, 1.7), { W, H, pv } = V, L = K.light();
    if (bg.scene && bg.scene.lang && bg.scene.lang !== lang()) bg.scene = null; // the language changed: the sign is rebuilt
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'arcade' || st.key !== S.key) st = bg.st = init(S, V, S.key);
    const dpr = bg.dpr || 1, oy = V.oy, add = L ? 'source-over' : 'lighter', pal = L ? NEON_L : NEON;
    const colOf = (e) => { const hh = ((e.h % 6) + 6) % 6, i0 = Math.floor(hh), kk = hh - i0; return [i0, (i0 + 1) % 6, kk * kk * (3 - 2 * kk)]; };
    const glowAt = (e, x, y, rw, rh, a) => { // the screen's current colour: two cached glows cross-faded
      if (a < 0.004) return;
      const [i0, i1, kk] = colOf(e);
      if (kk < 0.98) { ctx.globalAlpha = a * (1 - kk); ctx.drawImage(glowSpr(i0, L), x - rw, y - rh, rw * 2, rh * 2); }
      if (kk > 0.02) { ctx.globalAlpha = a * kk; ctx.drawImage(glowSpr(i1, L), x - rw, y - rh, rw * 2, rh * 2); }
    };
    ctx.save(); ctx.translate(0, -oy);

    // the screens' state: colours drifting, attract modes changing over with a blink, now and then a high score
    if (!st.hs && --st.hsWait <= 0) {
      const cand = S.screens.map((sc, j) => j).filter((j) => S.screens[j].i < 3 && !S.screens[j].broken);
      st.hs = { j: cand[(RND() * cand.length) | 0], age: 0, life: 130 };
      st.hsWait = 1100 + RND() * 1500; // every forty seconds to a minute and a half
    }
    const hs = st.hs;
    for (let j = 0; j < S.screens.length; j++) {
      const e = st.scr[j], sc = S.screens[j];
      e.row += SPEED[e.pat];
      let b = sc.broken ? 0.32 + 0.06 * Math.sin(t * 0.31) : 0.8 + 0.04 * Math.sin(t * 0.045 + j * 1.3);
      if (!sc.broken) {
        e.h += e.dh;
        if (--e.next <= 0) { e.blank = 9; e.next = 600 + RND() * 1300; }
        if (e.blank > 0) { b *= 0.3 + 0.7 * Math.abs(e.blank - 4.5) / 4.5; if (--e.blank === 4) { let p = e.pat; while (p === e.pat) p = PATS[(RND() * PATS.length) | 0]; e.pat = p; e.row = RND() * LR; } }
      }
      e.hsE = 0;
      if (hs && hs.j === j) {
        const env = Math.sin(Math.PI * Math.min(1, hs.age / hs.life));
        e.hsE = env; e.h += 0.03; b *= 1 + 0.55 * env;
      }
      e.b = b;
    }
    if (hs && ++hs.age >= hs.life) st.hs = null;

    // 1. the far wall: the sign's light on it, then the sign (the joystick stutters now and then; the word rarely)
    if (!st.sig && !pv && --st.sigWait <= 0) { st.sig = { i: 0, part: RND() < 0.75 ? 0 : 1 }; st.sigWait = 900 + RND() * 1800; }
    let aIcon = 1, aWord = 1;
    if (st.sig) { const v = FLICK[st.sig.i]; if (st.sig.part === 0) aIcon = v; else aWord = 0.55 + 0.45 * v; if (++st.sig.i >= FLICK.length) st.sig = null; }
    const buzz = 0.985 + 0.015 * Math.sin(t * 2.3), sp = S.sign, sAll = (aWord * 0.75 + aIcon * 0.25) * buzz;
    ctx.globalCompositeOperation = add;
    ctx.globalAlpha = (L ? 0.05 : 0.11) * sAll; ctx.drawImage(glowSpr(0, L), S.sgx - sp.w * 0.95, S.sgy - sp.w * 0.5, sp.w * 1.9, sp.w * 1.0);
    ctx.globalAlpha = (L ? 0.82 : 0.78) * aWord * buzz; ctx.drawImage(sp.word, S.sgx - sp.w / 2, S.sgy - sp.h / 2, sp.w, sp.h);
    ctx.globalAlpha = (L ? 0.82 : 0.78) * aIcon * buzz; ctx.drawImage(sp.icon, S.sgx - sp.w / 2, S.sgy - sp.h / 2, sp.w, sp.h);

    // 2. the carpet, and the screens' light lying on it
    ctx.globalAlpha = L ? 0.55 : 0.5; ctx.drawImage(S.carpet, 0, 0, W, H);
    for (let j = 0; j < S.screens.length; j++) { const e = st.scr[j], [x, y, rx, ry] = S.screens[j].spill; glowAt(e, x, y, rx * (1 + 0.25 * e.hsE), ry * (1 + 0.25 * e.hsE), (L ? 0.07 : 0.16) * e.b); }
    ctx.globalCompositeOperation = 'source-over';

    // 3. the screens, under the cabinets (each shows through its hole in the cabinet layer)
    for (let j = 0; j < S.screens.length; j++) {
      const sc = S.screens[j], e = st.scr[j];
      ctx.globalAlpha = 1; ctx.fillStyle = L ? '#2a2e3a' : '#04050d'; ctx.fill(sc.path);
      const pat = e.pat === 'hiscore' || e.hsE > 0 ? ((t >> 3) & 1 ? 'hiscoreB' : 'hiscore') : e.pat, tex = texture(pat), sy = SPEED[pat] ? (Math.floor(e.row) % LR) * 2 : 0;
      // slices drawn opaque and overlapping (drawing a pixel twice changes nothing: no seams), then dimmed
      for (const sl of sc.slices) { ctx.setTransform(dpr * sl[0], dpr * sl[1], dpr * sl[2], dpr * sl[3], dpr * sl[4], dpr * (sl[5] - oy)); ctx.drawImage(tex, sl[6] * TW, sy, Math.min(sl[7] * 1.25, 1 - sl[6]) * TW, WIN * 2, 0, 0, Math.min(1.25, (1 - sl[6]) / sl[7]), 1); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, -dpr * oy);
      const dim = 1 - Math.min(1, e.b * (L ? 0.62 : 0.86));
      if (dim > 0.01) { ctx.globalAlpha = dim; ctx.fill(sc.path); }
      const [i0, i1, kk] = colOf(e);
      ctx.globalCompositeOperation = add; ctx.globalAlpha = (L ? 0.1 : 0.2) * e.b; ctx.fillStyle = rgb(mix(pal[i0], pal[i1], kk)); ctx.fill(sc.path);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // 4. the cabinets: they hide the light and the screens behind them
    K.put(ctx, S.cab, W, H, L ? 0.5 : 0.9);

    // 5. each screen's glow on its bezel and the cabinets beside it
    ctx.globalCompositeOperation = add;
    for (let j = 0; j < S.screens.length; j++) { const sc = S.screens[j], e = st.scr[j], r = Math.max(sc.w, sc.h); glowAt(e, sc.x, sc.y, r * 1.15, r * 0.95, (L ? 0.05 : 0.13) * e.b); }

    // 6. a high score: sparks of colour leap off the screen
    if (hs && hs.age < hs.life * 0.75 && hs.age % 3 === 0 && st.sparks.length < 28) {
      const sc = S.screens[hs.j], v = Math.max(sc.w, sc.h) * 0.012;
      for (let n = 0; n < 2; n++) st.sparks.push({ x: sc.x + (RND() - 0.5) * sc.w * 0.8, y: sc.y + (RND() - 0.5) * sc.h * 0.6, vx: (RND() - 0.5) * v * 3, vy: -v * (1 + RND() * 2), life: 26 + RND() * 16, age: 0, c: (RND() * 6) | 0, s: Math.max(1, sc.w * 0.025) });
    }
    for (let i = st.sparks.length - 1; i >= 0; i--) {
      const p = st.sparks[i];
      p.age++; p.x += p.vx; p.y += p.vy; p.vy += 0.02;
      if (p.age >= p.life) { st.sparks.splice(i, 1); continue; }
      ctx.globalAlpha = (L ? 0.5 : 0.55) * (1 - p.age / p.life); ctx.fillStyle = rgb(pal[p.c]); ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }

    // 7. dust hanging in the light: seen only where a screen or the sign lights it
    const ms = moteSpr(L);
    const lit = S.lights, bAt = (k2) => (k2 < st.scr.length ? st.scr[k2].b : sAll);
    for (const m of st.motes) {
      if (++m.age >= m.life) mote(m, S, false);
      m.vx = m.vx * 0.98 + (RND() - 0.5) * 0.01; m.vy = m.vy * 0.98 + (RND() - 0.5) * 0.008 + 0.0005;
      m.x += m.vx + Math.sin(t * 0.013 + m.ph) * 0.04; m.y += m.vy;
      const [lx, ly, lr] = lit[m.li], dd = Math.hypot(m.x - lx, (m.y - ly) / 0.8) / lr;
      if (dd >= 1) { mote(m, S, false); continue; }
      let a = (1 - dd) * bAt(m.li) * Math.sin((Math.PI * m.age) / m.life); // it drifts into the light and out again
      a = a * (L ? 0.4 : 0.8) * (0.65 + 0.35 * Math.sin(t * 0.05 + m.ph * 3));
      if (a < 0.015) continue;
      const r = Math.max(1, m.r * 2.2 * V.z); ctx.globalAlpha = Math.min(1, a); ctx.drawImage(ms, m.x - r / 2, m.y - r / 2, r, r);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.restore();
  };
})();
