'use strict';
/*
 * 빛나는 버섯 숲: the floor of an old wood at night. Mossy trunks stand back into the mist, a fallen log lies across
 * the middle, a great tree's buttress roots sprawl in from the right and ferns arch over a mound on the left.
 * Mushrooms glow among them in teal, violet and soft gold: slender bells on long stems, umbrella caps with shining
 * gills, tufts of tiny bonnets on the log, brackets stacked up the trunk. Each breathes light at its own pace, and
 * now and then a wave of brightening runs through a cluster. Their light pools on the moss, catches the edges of the
 * roots and the wisps of mist; spores rise from them in lazy spirals, a few fireflies blink far off, and once in a
 * while a moth comes to circle a cluster. On a light page it is a misty morning in the same wood: the silhouettes
 * inked, mist and sunbeams wearing the distance away, the mushrooms in their own colours with a sheen on them.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('mushroom'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random, WHITE = [255, 255, 255];
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  /** g: the glow on a dark page and core its white heart; b / d: the body and its deeper shade by daylight. */
  const HUE = {
    teal: { g: [92, 232, 210], core: [210, 255, 244], b: [52, 160, 148], d: [20, 92, 94] },
    violet: { g: [172, 136, 255], core: [232, 224, 255], b: [138, 100, 208], d: [72, 44, 138] },
    gold: { g: [255, 196, 104], core: [255, 240, 204], b: [212, 150, 52], d: [132, 80, 22] },
  };
  const HUES = ['teal', 'violet', 'gold'];
  const FLY = [206, 255, 128], FLY_CORE = [246, 255, 214];
  /** far, middle, near: how big things are there, how bright their light, their halo, how much light gets into the mist. */
  const DEPTH = [
    { sz: 0.5, lit: 0.5, halo: 0.2, mist: 0.36 },
    { sz: 0.76, lit: 0.78, halo: 0.26, mist: 0.5 },
    { sz: 1, lit: 0.92, halo: 0.3, mist: 0.6 },
  ];

  /* ---------- sprites (made once, cached) ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** The light around a cap: a bright heart melting a long way out. */
  const haloSpr = (c) => radial(`mshHalo|${c}`, 64, [[0, rgba(c, 0.85)], [0.16, rgba(c, 0.4)], [0.42, rgba(c, 0.12)], [0.72, rgba(c, 0.03)], [1, rgba(c, 0)]]);
  /** A spore: a white-hot speck in a little haze of its colour. */
  const sporeSpr = (c, core) => radial(`mshSpore|${c}`, 32, [[0, rgba(core, 1)], [0.12, rgba(core, 0.85)], [0.26, rgba(c, 0.42)], [0.55, rgba(c, 0.08)], [1, rgba(c, 0)]]);
  /** A spore by daylight: a small soft dot. */
  const dotSpr = (c) => radial(`mshDot|${c}`, 16, [[0, rgba(c, 1)], [0.45, rgba(c, 0.8)], [0.8, rgba(c, 0.18)], [1, rgba(c, 0)]]);
  /** A wide soft light. */
  const softSpr = (c) => radial(`mshSoft|${c}`, 128, [[0, rgba(c, 1)], [0.35, rgba(c, 0.5)], [0.7, rgba(c, 0.12)], [1, rgba(c, 0)]]);
  const fogTex = () => K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 });
  /** Wisps of mist for the mushrooms' light to show in (thicker toward the ground). */
  const wispTex = () => K.noiseTex('mshWisp', 512, 160, { px: 5, py: 2, oct: 5, lo: 0.36, hi: 0.86, env: 'up', warp: 1.4, seed: 61 });
  /** Clumps of moss: what light lying on the ground is broken up by. */
  const mossTex = () => K.noiseTex('mshMoss', 128, 128, { px: 20, py: 20, oct: 3, lo: 0.22, hi: 0.82, seed: 23 });

  /* ---------- mushrooms ---------- */

  /** The stem: a quadratic from the foot (0, 0) to the cap, bowed by bend, leaning by lean. */
  function stemPts(m) {
    const tx = Math.sin(m.lean) * m.h, ty = -Math.cos(m.lean) * m.h, cx = tx * 0.5 + m.bend * m.h * 0.3, cy = ty * 0.5;
    m.ctrl = [cx, cy];
    const pts = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10, b = 2 * k * (1 - k), d = k * k; pts.push([b * cx + d * tx, b * cy + d * ty]); }
    return pts;
  }
  function stemPath(m) {
    const P = m.pts, n = P.length - 1, A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, p = P[Math.max(0, i - 1)], q = P[Math.min(n, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
      let w = m.sw * 0.5 * (1 - 0.3 * k);
      if (m.bulb) w *= 1 + m.bulb * Math.max(0, 1 - k / 0.22) ** 2; // a swollen foot
      A.push([P[i][0] - (dy / d) * w, P[i][1] + (dx / d) * w]); B.push([P[i][0] + (dy / d) * w, P[i][1] - (dx / d) * w]);
    }
    const path = new Path2D();
    path.moveTo(A[0][0], A[0][1] + m.sw * 0.6);
    for (const [x, y] of A) path.lineTo(x, y);
    for (let i = n; i >= 0; i--) path.lineTo(B[i][0], B[i][1]);
    path.lineTo(B[0][0], B[0][1] + m.sw * 0.6);
    path.closePath();
    return path;
  }
  /** The cap, in its own frame: the stem top at the origin, up is -y. */
  function capPath(c, m) {
    const { cw, ch } = m, hw = cw / 2;
    c.beginPath();
    if (m.kind === 'umb') { // a broad dome, the rim turned down a little
      const ry = ch * 0.08;
      c.moveTo(-hw, ry);
      c.bezierCurveTo(-hw * 1.03, -ch * 0.55, -hw * 0.56, -ch, 0, -ch);
      c.bezierCurveTo(hw * 0.56, -ch, hw * 1.03, -ch * 0.55, hw, ry);
      c.quadraticCurveTo(0, ry + ch * 0.06, -hw, ry);
    } else if (m.kind === 'btn') { // a young one, still closed
      c.moveTo(-hw, ch * 0.12);
      c.bezierCurveTo(-hw * 1.06, -ch * 0.7, -hw * 0.52, -ch, 0, -ch);
      c.bezierCurveTo(hw * 0.52, -ch, hw * 1.06, -ch * 0.7, hw, ch * 0.12);
      c.quadraticCurveTo(0, ch * 0.34, -hw, ch * 0.12);
    } else { // a bell: the slender ones and the bonnets, sometimes with a little point on top
      const ry = ch * 0.16, pk = m.umbo || 0;
      c.moveTo(-hw, ry);
      c.bezierCurveTo(-hw * 0.96, -ch * 0.25, -hw * (0.46 - pk * 0.16), -ch * (0.92 - pk * 0.08), 0, -ch);
      c.bezierCurveTo(hw * (0.46 - pk * 0.16), -ch * (0.92 - pk * 0.08), hw * 0.96, -ch * 0.25, hw, ry);
      c.quadraticCurveTo(0, ry - ch * 0.2, -hw, ry);
    }
  }
  /** An umbrella's underside, seen from a little below: gills running out from the stem to the rim. */
  function gills(c, m, mode, Hc) {
    const hw = (m.cw / 2) * 0.96, ry = m.ch * 0.08, dy = m.ch * 0.36;
    c.beginPath(); c.moveTo(hw, ry); c.ellipse(0, ry, hw, dy, 0, 0, Math.PI); c.closePath();
    if (mode === 'ink') { c.fill(); return; }
    if (mode === 'lit') {
      const g = c.createRadialGradient(0, ry, 0, 0, ry, hw);
      g.addColorStop(0, rgba(Hc.core, 0.92)); g.addColorStop(0.55, rgba(mix(Hc.g, Hc.core, 0.45), 0.86)); g.addColorStop(1, rgba(Hc.g, 0.66));
      c.fillStyle = g;
    } else c.fillStyle = rgba(mix(Hc.b, WHITE, 0.6), 0.96);
    c.fill();
    c.save(); c.clip();
    if (mode === 'lit') { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = 'rgba(0,0,0,0.42)'; } else c.strokeStyle = rgba(Hc.d, 0.34);
    c.lineWidth = Math.max(0.35, m.cw * 0.012);
    const n = Math.max(9, Math.round(m.cw / 2.1));
    c.beginPath();
    for (let j = 1; j < n; j++) { const a = (j / n) * Math.PI; c.moveTo(0, ry + dy * 0.1); c.lineTo(Math.cos(a) * hw * 1.05, ry + Math.sin(a) * dy * 1.05); }
    c.stroke();
    c.restore();
  }
  /** A bracket on a trunk: the top surface ringed with growth lines, a lip, the pore surface underneath. */
  function shelf(c, m, mode, Hc) {
    const e = m.cw, th = m.ch;
    c.save(); c.scale(m.dir, 1); c.rotate(m.tilt || 0);
    const top = () => { c.beginPath(); c.moveTo(0, -th * 0.95); c.bezierCurveTo(e * 0.3, -th * 1.08, e * 0.8, -th * 0.72, e * 0.98, -th * 0.12); c.bezierCurveTo(e * 1.03, th * 0.1, e * 0.7, th * 0.2, 0, th * 0.12); c.closePath(); };
    const under = () => { c.beginPath(); c.moveTo(e * 0.98, -th * 0.12); c.bezierCurveTo(e * 1.02, th * 0.34, e * 0.55, th * 0.6, 0, th * 0.5); c.lineTo(0, th * 0.12); c.bezierCurveTo(e * 0.7, th * 0.2, e * 1.03, th * 0.1, e * 0.98, -th * 0.12); c.closePath(); };
    if (mode === 'ink') { top(); c.fill(); under(); c.fill(); c.restore(); return; }
    const lit = mode === 'lit';
    top();
    let g = c.createLinearGradient(0, 0, e, 0);
    if (lit) { g.addColorStop(0, rgba(Hc.g, 0.03)); g.addColorStop(0.6, rgba(Hc.g, 0.1)); g.addColorStop(1, rgba(Hc.g, 0.3)); } else { g.addColorStop(0, rgba(Hc.d, 0.96)); g.addColorStop(0.7, rgba(mix(Hc.d, Hc.b, 0.6), 0.96)); g.addColorStop(1, rgba(mix(Hc.b, WHITE, 0.25), 0.96)); }
    c.fillStyle = g; c.fill();
    c.save(); c.clip(); // growth zones
    if (lit) { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = 'rgba(0,0,0,0.35)'; } else c.strokeStyle = rgba(Hc.d, 0.38);
    c.lineWidth = Math.max(0.4, th * 0.06);
    for (const f of [0.84, 0.66, 0.46]) { c.beginPath(); c.ellipse(0, th * 0.05, e * f, th * (0.3 + f * 0.62), 0, -Math.PI / 2, Math.PI / 2); c.stroke(); }
    c.restore();
    under();
    g = c.createLinearGradient(0, 0, e, 0);
    if (lit) { g.addColorStop(0, rgba(Hc.g, 0.3)); g.addColorStop(0.6, rgba(mix(Hc.g, Hc.core, 0.4), 0.72)); g.addColorStop(1, rgba(Hc.core, 0.9)); } else { g.addColorStop(0, rgba(mix(Hc.b, WHITE, 0.45), 0.96)); g.addColorStop(1, rgba(mix(Hc.b, WHITE, 0.7), 0.96)); }
    c.fillStyle = g; c.fill();
    c.strokeStyle = lit ? rgba(Hc.core, 0.75) : rgba(mix(Hc.b, WHITE, 0.55), 0.95); c.lineWidth = Math.max(0.5, th * 0.1); // the rounded lip
    c.beginPath(); c.moveTo(e * 0.3, th * 0.19); c.bezierCurveTo(e * 0.75, th * 0.19, e * 1.03, th * 0.08, e * 0.98, -th * 0.12); c.stroke();
    if (!lit) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = Math.max(0.5, th * 0.09); c.beginPath(); c.moveTo(e * 0.18, -th * 0.86); c.bezierCurveTo(e * 0.45, -th * 0.92, e * 0.7, -th * 0.68, e * 0.8, -th * 0.42); c.stroke(); } // a sheen
    c.restore();
  }
  /** One mushroom at the current origin (its foot): mode 'ink' (the silhouette), 'lit' (its light) or 'body' (by day). */
  function drawMush(c, m, mode) {
    const Hc = HUE[m.hue];
    if (m.kind === 'shelf') return shelf(c, m, mode, Hc);
    const P = m.pts, T = P[P.length - 1], stem = stemPath(m), R = K.rng(m.seed);
    if (mode === 'ink') c.fill(stem);
    else if (mode === 'lit') {
      const g = c.createLinearGradient(0, 0, T[0], T[1]);
      g.addColorStop(0, rgba(Hc.g, 0.02)); g.addColorStop(0.55, rgba(Hc.g, 0.13)); g.addColorStop(1, rgba(Hc.g, 0.34));
      c.fillStyle = g; c.fill(stem);
      if (m.sw > 1.4) { // light running down one flank
        c.strokeStyle = rgba(Hc.core, 0.14); c.lineWidth = Math.max(0.4, m.sw * 0.26);
        c.beginPath(); for (let i = 4; i < P.length; i++) c[i === 4 ? 'moveTo' : 'lineTo'](P[i][0] - m.sw * 0.17, P[i][1]); c.stroke();
      }
    } else {
      const g = c.createLinearGradient(0, 0, T[0], T[1]);
      g.addColorStop(0, rgba(mix(Hc.b, WHITE, 0.38), 0.94)); g.addColorStop(1, rgba(mix(Hc.b, WHITE, 0.72), 0.96));
      c.fillStyle = g; c.fill(stem);
      c.strokeStyle = rgba(Hc.d, 0.3); c.lineWidth = Math.max(0.4, m.sw * 0.14); c.stroke(stem);
    }
    c.save(); c.translate(T[0], T[1]); c.rotate(m.ang); c.transform(1, 0, m.sk, 1, 0, 0);
    if (m.kind === 'umb') gills(c, m, mode, Hc);
    capPath(c, m);
    if (mode === 'ink') { c.fill(); c.restore(); return; }
    const lit = mode === 'lit', hw = m.cw / 2, ch = m.ch, bell = m.kind === 'tall' || m.kind === 'bon';
    let g;
    if (m.kind === 'umb') {
      g = c.createLinearGradient(0, -ch, 0, ch * 0.1);
      if (lit) { g.addColorStop(0, rgba(Hc.g, 0.14)); g.addColorStop(0.7, rgba(Hc.g, 0.4)); g.addColorStop(1, rgba(mix(Hc.g, Hc.core, 0.4), 0.7)); }
      else { g.addColorStop(0, rgba(Hc.d, 0.96)); g.addColorStop(0.6, rgba(Hc.b, 0.96)); g.addColorStop(1, rgba(mix(Hc.b, WHITE, 0.2), 0.96)); }
    } else {
      const ry = bell ? ch * 0.16 : ch * 0.12;
      g = c.createRadialGradient(0, ry, 0, 0, ry, ch * 1.15);
      if (lit) { g.addColorStop(0, rgba(Hc.core, 0.95)); g.addColorStop(0.34, rgba(Hc.g, 0.82)); g.addColorStop(0.8, rgba(Hc.g, 0.4)); g.addColorStop(1, rgba(Hc.g, 0.24)); }
      else { g.addColorStop(0, rgba(mix(Hc.b, WHITE, 0.35), 0.96)); g.addColorStop(0.55, rgba(Hc.b, 0.96)); g.addColorStop(1, rgba(Hc.d, 0.96)); }
    }
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    if (bell && m.cw > 4) { // fine grooves running down from the top: the gills showing through a thin cap
      if (lit) { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = 'rgba(0,0,0,0.24)'; } else c.strokeStyle = rgba(Hc.d, 0.24);
      c.lineWidth = Math.max(0.35, m.cw * 0.035);
      const n = Math.max(5, Math.round(m.cw / 2.4));
      c.beginPath(); for (let j = 1; j < n; j++) { c.moveTo(0, -ch * 0.94); c.lineTo(-hw + (m.cw * j) / n, ch * 0.2); } c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    if (m.kind === 'umb') {
      if (lit) { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = 'rgba(0,0,0,0.14)'; } else c.strokeStyle = rgba(Hc.d, 0.22);
      c.lineWidth = Math.max(0.4, m.cw * 0.03);
      for (const f of [0.48, 0.74]) { c.beginPath(); c.ellipse(0, ch * 0.08, hw * f, ch * (0.2 + f * 0.86), 0, Math.PI, TAU); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
      if (m.spots) { // a few pale scales
        c.fillStyle = lit ? rgba(Hc.core, 0.34) : 'rgba(255,255,255,0.62)';
        for (let i = 0; i < m.spots; i++) { const a = Math.PI * (1.12 + R() * 0.76), f = 0.25 + R() * 0.6; c.beginPath(); c.ellipse(Math.cos(a) * hw * f, ch * 0.05 + Math.sin(a) * ch * f * 0.95, m.cw * (0.022 + R() * 0.02), m.cw * (0.016 + R() * 0.012), 0, 0, TAU); c.fill(); }
      }
    }
    if (!lit) { // a sheen on the upper side, toward the light
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(0.5, m.cw * 0.075);
      c.beginPath(); c.ellipse(-hw * 0.12, -ch * 0.3, hw * 0.62, ch * 0.56, 0, Math.PI * 1.08, Math.PI * 1.46); c.stroke();
    }
    c.restore();
    if (lit) { // the rim, where the light comes through thinnest
      c.strokeStyle = rgba(Hc.core, m.kind === 'umb' ? 0.55 : 0.7); c.lineWidth = Math.max(0.5, m.cw * 0.05);
      const ry = m.kind === 'umb' ? ch * 0.08 : m.kind === 'btn' ? ch * 0.12 : ch * 0.16;
      c.beginPath(); c.moveTo(-hw * 0.98, ry); c.quadraticCurveTo(0, ry + (m.kind === 'umb' ? ch * 0.06 : m.kind === 'btn' ? ch * 0.22 : -ch * 0.2), hw * 0.98, ry); c.stroke();
    } else { capPath(c, m); c.strokeStyle = rgba(Hc.d, 0.5); c.lineWidth = Math.max(0.5, m.cw * 0.035); c.stroke(); }
    c.restore();
  }
  /** Where its sprite sits and where its light comes from, relative to its foot. */
  function prep(m) {
    if (m.kind === 'shelf') {
      const e = m.cw, th = m.ch;
      m.box = m.dir < 0 ? [-e * 1.08 - 3, -th * 1.3 - e * 0.1 - 2, 3, th * 0.8 + e * 0.1 + 2] : [-3, -th * 1.3 - e * 0.1 - 2, e * 1.08 + 3, th * 0.8 + e * 0.1 + 2];
      m.hx = m.dir * e * 0.62; m.hy = th * 0.32; m.hr = e * 1.15;
      boxed(m);
      return;
    }
    m.pts = stemPts(m);
    const T = m.pts[m.pts.length - 1], C = m.ctrl;
    m.ang = Math.atan2(T[0] - C[0], -(T[1] - C[1]));
    const ext = m.cw * 0.62 + m.ch * 0.5 + 2;
    m.box = [Math.min(0, C[0], T[0]) - ext, T[1] - m.ch * 1.25 - m.cw * 0.25 - 2, Math.max(0, C[0], T[0]) + ext, m.sw * (1 + (m.bulb || 0)) + 2];
    const cy = m.kind === 'umb' ? m.ch * 0.16 : -m.ch * 0.38; // the heart of its light: the gills, or inside the bell
    m.hx = T[0] - cy * Math.sin(m.ang); m.hy = T[1] + cy * Math.cos(m.ang);
    m.hr = Math.max(m.cw * 1.7, m.ch * 2.6);
    boxed(m);
  }
  function boxed(m) { const [x0, y0, x1, y1] = m.box; m.bx = x0; m.by = y0; m.bw = x1 - x0; m.bh = y1 - y0; }
  /** Its light as one sprite: the halo round the cap, then the mushroom's own glow over it. */
  function sprite(m, q) {
    const [b0, b1, b2, b3] = m.box, { hx, hy, hr } = m;
    m.bx = Math.min(b0, hx - hr); m.by = Math.min(b1, hy - hr); m.bw = Math.max(b2, hx + hr) - m.bx; m.bh = Math.max(b3, hy + hr) - m.by;
    const c = K.mk(m.bw * q, m.bh * q), x = c.getContext('2d');
    x.scale(c.width / m.bw, c.height / m.bh); x.translate(-m.bx, -m.by); x.lineCap = 'round'; x.lineJoin = 'round';
    x.globalAlpha = m.ha; x.drawImage(haloSpr(HUE[m.hue].g), hx - hr, hy - hr, hr * 2, hr * 2); x.globalAlpha = 1;
    drawMush(x, m, 'lit');
    return c;
  }

  /**
   * Packs canvases into one, in rows, tallest first: a frame then draws from one texture instead of dozens.
   * Each item's owner gets src / sx / sy / sw / sh to draw it with.
   */
  function atlas(items) {
    items.sort((a, b) => b.c.height - a.c.height);
    const maxW = 2048, pad = 3;
    let x = 0, y = 0, rowH = 0, w = 1;
    for (const it of items) {
      if (x + it.c.width > maxW) { x = 0; y += rowH + pad; rowH = 0; }
      it.ax = x; it.ay = y; x += it.c.width + pad; rowH = Math.max(rowH, it.c.height); w = Math.max(w, x);
    }
    const c = K.mk(w, y + rowH), g = c.getContext('2d');
    for (const it of items) { g.drawImage(it.c, it.ax, it.ay); Object.assign(it.o, { src: c, sx: it.ax, sy: it.ay, sw: it.c.width, sh: it.c.height }); }
    return c;
  }

  /** A moth seen from above, heading up: forewings and hindwings opening and closing. */
  function moth(ctx, x, y, s, flap, hd, wing, body) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(hd);
    const k = 0.28 + 0.72 * Math.abs(Math.sin(flap));
    ctx.fillStyle = wing;
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.scale(sd * k, 1);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.16); ctx.quadraticCurveTo(s * 0.55, -s * 0.78, s * 1.15, -s * 0.52); ctx.quadraticCurveTo(s * 1.06, -s * 0.05, s * 0.56, s * 0.12); ctx.quadraticCurveTo(s * 0.26, s * 0.13, 0, s * 0.05); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, s * 0.04); ctx.quadraticCurveTo(s * 0.72, s * 0.04, s * 0.66, s * 0.46); ctx.quadraticCurveTo(s * 0.32, s * 0.64, 0, s * 0.36); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.12, s * 0.42, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = Math.max(0.5, s * 0.045);
    ctx.beginPath(); ctx.moveTo(-s * 0.04, -s * 0.28); ctx.quadraticCurveTo(-s * 0.18, -s * 0.6, -s * 0.34, -s * 0.68); ctx.moveTo(s * 0.04, -s * 0.28); ctx.quadraticCurveTo(s * 0.18, -s * 0.6, s * 0.34, -s * 0.68); ctx.stroke();
    ctx.restore();
  }

  /* ---------- the still scenery ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(52031), dpr = bg.dpr || 1, q = Math.min(2, Math.max(1, dpr));
    const ink = L ? '#25302c' : '#010504';
    const lw = (v) => Math.max(pv ? 0.4 : 0.6, v);
    const ms = pv ? 2.6 : 1; // mushrooms are drawn larger in the small picker preview, so they read there
    const fF = pv ? 0.6 : 0.7, fM = pv ? 0.73 : 0.81, fN = pv ? 0.88 : 0.935; // where the far, middle and near ground lies
    const wv = (x, f, p) => Math.sin((x / u) * f + p);
    const yF = (x) => H * fF + u * (0.016 * wv(x, 1.7, 0.4) + 0.007 * wv(x, 5.3, 1.1) + 0.004 * wv(x, 13.7, 0.3));
    const yM = (x) => H * fM + u * (0.011 * wv(x, 3.1, 2) + 0.005 * wv(x, 9.4, 0.6));
    const yN = (x) => H * fN + u * (0.012 * wv(x, 2.2, 0.4) + 0.005 * wv(x, 8.3, 1.7)) - u * 0.085 * Math.exp(-(((x - W * 0.05) / (u * 0.21)) ** 2)); // a mound at the left
    const [back, bc] = K.layer(W, H, dpr), [mid, mc] = K.layer(W, H, dpr), [near, nc] = K.layer(W, H, dpr);
    for (const c of [bc, mc, nc]) { c.fillStyle = ink; c.strokeStyle = ink; }

    /** Moss along an edge: soft lumps, and on the nearer ground a few hair-fine stalks with their capsules. */
    const moss = (c, Y, x0, x1, lump, hair) => {
      for (let x = x0; x < x1; x += lump * (0.6 + R() * 0.9)) { const r = lump * (0.5 + R() * 0.8); c.beginPath(); c.arc(x, Y(x) + r * 0.55, r, 0, TAU); c.fill(); }
      if (!hair) return;
      c.lineWidth = lw(u * 0.0008);
      for (let x = x0; x < x1; x += hair * (0.4 + R() * 1.6)) {
        const hh = u * (0.004 + R() * 0.008), lean = (R() - 0.5) * hh * 0.7, y = Y(x);
        c.beginPath(); c.moveTo(x, y + 1); c.quadraticCurveTo(x + lean * 0.2, y - hh * 0.6, x + lean, y - hh); c.stroke();
        c.beginPath(); c.ellipse(x + lean, y - hh, lw(u * 0.0011), lw(u * 0.0019), lean / hh, 0, TAU); c.fill();
      }
    };
    const ground = (c, Y, lump, hair) => {
      c.beginPath(); c.moveTo(-6, H + 2);
      for (let x = -6; x <= W + 6; x += 4) c.lineTo(x, Y(x));
      c.lineTo(W + 6, H + 2); c.closePath(); c.fill();
      moss(c, Y, -6, W + 6, lump, hair);
    };
    /** A trunk: wavering edges, tapering, flared at the foot; dead branch stubs with lichen hanging from them. */
    const trunk = (c, x, base, top, w0, o) => {
      const N = 48, lx = [], rx = [], ys = [], p = [R() * 6, R() * 6, R() * 6, R() * 6];
      for (let i = 0; i <= N; i++) {
        const k = i / N, y = base + (top - base) * k, up = base - y;
        const cx = x + o.lean * up + u * 0.006 * o.wob * (Math.sin(k * 5 + p[0]) + 0.4 * Math.sin(k * 13 + p[1]));
        const hw = w0 * 0.5 * (1 - 0.28 * k) * (1 + o.flare * Math.exp(-up / (w0 * 0.9)));
        lx.push(cx - hw * (1 + 0.05 * Math.sin(k * 31 + p[2]))); rx.push(cx + hw * (1 + 0.05 * Math.sin(k * 29 + p[3]))); ys.push(y);
      }
      c.beginPath(); c.moveTo(lx[0], base + u * 0.02);
      for (let i = 0; i <= N; i++) c.lineTo(lx[i], ys[i]);
      for (let i = N; i >= 0; i--) c.lineTo(rx[i], ys[i]);
      c.lineTo(rx[0], base + u * 0.02); c.closePath(); c.fill();
      if (o.moss) for (let i = 0; i < N * 0.16; i++) for (const ex of [lx[i], rx[i]]) { const r = o.moss * (0.5 + R() * 0.8) * (1 - i / (N * 0.2)); if (r > 0.3) { c.beginPath(); c.arc(ex + (R() - 0.5) * r, ys[i], r, 0, TAU); c.fill(); } }
      for (let j = 0; j < (o.stubs || 0); j++) { // dead lower branches, broken off: tapering to a point, a little arched
        const i = Math.round(N * (0.25 + R() * 0.45)), sd = R() < 0.5 ? -1 : 1, sx = sd < 0 ? lx[i] + w0 * 0.12 : rx[i] - w0 * 0.12, sy = ys[i];
        const len = Math.min(u * 0.045, w0 * (0.5 + R() * 0.8) + u * 0.008), a = -Math.PI / 2 + sd * (1.05 + R() * 0.45), ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
        const wd = Math.max(pv ? 0.3 : 0.5, Math.min(w0 * 0.12, u * 0.004)), mx = (sx + ex) / 2, my = (sy + ey) / 2 - len * 0.1, nx = -Math.sin(a) * wd, ny = Math.cos(a) * wd;
        c.beginPath(); c.moveTo(sx + nx * 1.6, sy + ny * 1.6); c.quadraticCurveTo(mx + nx * 0.6, my + ny * 0.6, ex, ey); c.quadraticCurveTo(mx - nx * 0.6, my - ny * 0.6, sx - nx * 1.6, sy - ny * 1.6); c.closePath(); c.fill();
        if (R() < 0.6) { const k = 0.45 + R() * 0.25, tx = sx + (ex - sx) * k, ty = sy + (ey - sy) * k - len * 0.06, ta = a - sd * (0.6 + R() * 0.4); c.lineWidth = lw(wd * 0.5); c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(ta) * len * 0.2, ty + Math.sin(ta) * len * 0.2 - len * 0.03, tx + Math.cos(ta) * len * 0.36, ty + Math.sin(ta) * len * 0.36); c.stroke(); }
        if (o.lichen) for (let s = 0, ns = 2 + R() * 3; s < ns; s++) { // beard lichen hanging in wisps
          const k = 0.2 + R() * 0.7, hx = sx + (ex - sx) * k, hy = sy + (ey - sy) * k - len * 0.05, hl = u * (0.007 + R() * 0.018) * o.lichen, ph = R() * 6;
          c.lineWidth = lw(u * 0.0007); c.beginPath(); c.moveTo(hx, hy);
          for (let z = 1; z <= 8; z++) c.lineTo(hx + Math.sin(z * 1.1 + ph) * u * 0.0016 * (z / 8), hy + (hl * z) / 8);
          c.stroke();
        }
      }
      return { lx, rx, ys, N };
    };
    /** Bark: faint furrows cut down a trunk, closer together toward its edges as they turn away. */
    const furrows = (c, tr, n, a) => {
      c.save(); c.globalCompositeOperation = 'destination-out'; c.strokeStyle = `rgba(0,0,0,${a})`;
      for (let j = 0; j < n; j++) {
        const f = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(0.96, Math.max(0.04, (j + 0.5) / n + (R() - 0.5) * 0.06)));
        const i0 = (R() * tr.N * 0.2) | 0, i1 = Math.min(tr.N, i0 + 10 + ((R() * tr.N * 0.7) | 0));
        c.lineWidth = lw(u * (0.001 + R() * 0.0012));
        c.beginPath();
        for (let i = i0; i <= i1; i++) { const x = tr.lx[i] + (tr.rx[i] - tr.lx[i]) * (f + 0.015 * Math.sin(i * 0.8 + j * 2)); if (i === i0) c.moveTo(x, tr.ys[i]); else c.lineTo(x, tr.ys[i]); }
        c.stroke();
      }
      c.restore();
    };
    /** One frond: an arching stem with narrow leaflets swept toward the tip, longest a third of the way out. */
    const frond = (c, x, y, len, ang, bend, wid, lobed) => {
      const N = 18, sl = len / N, pts = [];
      let px = x, py = y, a = ang;
      for (let i = 0; i <= N; i++) { pts.push([px, py, a]); a += bend / N; px += Math.cos(a) * sl; py += Math.sin(a) * sl; }
      c.lineWidth = lw(wid); c.beginPath(); c.moveTo(x, y); for (const p of pts) c.lineTo(p[0], p[1]); c.stroke();
      for (let i = 2; i < N; i++) {
        const k = i / N, pl = len * 0.2 * Math.sin(Math.PI * Math.min(1, k * 1.12)) ** 0.8 * (1 - 0.3 * k), [qx, qy, qa] = pts[i];
        if (pl < 0.8) continue;
        for (const sd of [-1, 1]) {
          const pa = qa + sd * (1.05 - 0.35 * k), tx = qx + Math.cos(pa) * pl, ty = qy + Math.sin(pa) * pl + pl * 0.14, pw = pl * 0.2;
          const nx = -Math.sin(pa), ny = Math.cos(pa);
          c.beginPath(); c.moveTo(qx, qy);
          if (lobed && pl > 7) { // small lobes along both edges
            const M = 4;
            for (const s2 of [1, -1]) {
              for (let j = 1; j <= M; j++) {
                const t0 = (j - 0.5) / M, t1 = j / M, wb = pw * (1 - t0 * 0.7), wn = pw * (1 - t1 * 0.7) * 0.45;
                c.quadraticCurveTo(qx + (tx - qx) * t0 + nx * wb * s2 * 1.25, qy + (ty - qy) * t0 + ny * wb * s2 * 1.25, qx + (tx - qx) * t1 + nx * wn * s2 * (j === M ? 0 : 1), qy + (ty - qy) * t1 + ny * wn * s2 * (j === M ? 0 : 1));
              }
              if (s2 === 1) c.moveTo(qx, qy);
            }
          } else {
            c.quadraticCurveTo((qx + tx) / 2 + nx * pw, (qy + ty) / 2 + ny * pw, tx, ty);
            c.quadraticCurveTo((qx + tx) / 2 - nx * pw * 0.6, (qy + ty) / 2 - ny * pw * 0.6, qx, qy);
          }
          c.fill();
        }
      }
    };
    const fern = (c, x, y, size, n, spread, lobed) => {
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 0.5, sd = k < 0.5 ? -1 : 1;
        const ang = -Math.PI / 2 + (k - 0.5) * spread + (R() - 0.5) * 0.22;
        const len = size * (0.62 + R() * 0.42) * (1 - 0.28 * Math.abs(k - 0.5));
        frond(c, x + (R() - 0.5) * size * 0.12, y + u * 0.004, len, ang, sd * (0.55 + R() * 0.6), Math.max(0.7, size * 0.011), lobed);
      }
    };
    /** Wood sorrel: three drooping heart-shaped leaflets on a thin stalk. */
    const sorrel = (c, x, y, s) => {
      const tx = x + (R() - 0.5) * s * 0.4, ty = y - s;
      c.lineWidth = lw(s * 0.07); c.beginPath(); c.moveTo(x, y + 1); c.quadraticCurveTo(x, y - s * 0.6, tx, ty); c.stroke();
      for (const a of [-2.4, -Math.PI / 2, -0.74]) {
        const lx = tx + Math.cos(a) * s * 0.3, ly = ty + Math.sin(a) * s * 0.12 + s * 0.08;
        c.beginPath(); c.ellipse(lx, ly, s * 0.3, s * 0.14, a + Math.PI / 2 + (a < -2 ? -0.3 : a > -1 ? 0.3 : 0), 0, TAU); c.fill();
      }
    };

    // far: a wall of thin trunks lost in the mist, the ground between them, a fern or two
    for (let x = -u * 0.02; x < W + u * 0.03; x += u * (0.05 + R() * 0.09)) trunk(bc, x, yF(x) + u * 0.006, -u * 0.03, u * (0.008 + R() * 0.014), { wob: 0.7, flare: 0.5, lean: (R() - 0.5) * 0.04, stubs: pv ? 0 : R() < 0.5 ? 1 : 0, lichen: 0.7 });
    const fade = (c, y0, y1, keep) => { // the trunks thin into the dark as they rise
      c.save(); c.globalCompositeOperation = 'destination-out';
      const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(0,0,0,${1 - keep})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(-10, -10, W + 20, y1 + 10);
      c.restore();
    };
    fade(bc, H * 0.1, H * fF - u * 0.1, 0);
    ground(bc, yF, u * 0.0022, 0);
    for (let i = 0, nf = pv ? 1 : Math.round((W / u) * 4); i < nf; i++) { const x = (W * (i + R())) / nf; fern(bc, x, yF(x), u * (0.03 + R() * 0.03), 5, 2.2, false); }
    for (let x = R() * u * 0.05; x < W; x += u * (0.03 + R() * 0.08)) { // low shrubs: a dome of small leaves, ragged at the edge
      if (R() < 0.45) continue;
      const sw = u * (0.02 + R() * 0.04), sh = sw * (0.4 + R() * 0.4), y0 = yF(x), lf = Math.max(pv ? 0.4 : 0.7, u * 0.0028);
      bc.beginPath(); bc.ellipse(x, y0, sw * 0.42, sh * 0.75, 0, Math.PI, TAU); bc.fill();
      for (let j = 0, nl = pv ? 8 : 34; j < nl; j++) {
        const a = Math.PI + R() * Math.PI, d = 0.75 + R() * 0.32, lx = x + Math.cos(a) * sw * 0.5 * d, ly = y0 + Math.sin(a) * sh * d;
        bc.beginPath(); bc.ellipse(lx, ly, lf * (1 + R() * 0.8), lf * (0.5 + R() * 0.3), a + (R() - 0.5) * 1.2, 0, TAU); bc.fill();
      }
    }

    // middle: three or four trunks, the ground, the fallen log, ferns by it
    const xT = W - u * 0.05;
    const wT = u * 0.11 * (pv ? 1.15 : 1);
    for (let x = W * 0.27 + (R() - 0.5) * u * 0.06; x < xT - wT * 1.5; x += u * (0.42 + R() * 0.2)) {
      const tr = trunk(mc, x, yM(x) + u * 0.012, -u * 0.04, u * (0.03 + R() * 0.02), { wob: 1, flare: 0.75, lean: (R() - 0.5) * 0.03, stubs: pv ? 0 : 2, lichen: 1, moss: u * 0.004 });
      furrows(mc, tr, 5, 0.14);
    }
    fade(mc, H * 0.02, H * fM - u * 0.12, 0.08);
    ground(mc, yM, u * 0.003, pv ? 0 : u * 0.02);
    const lx0 = W * 0.12, lx1 = Math.min(W * 0.5, lx0 + u * 0.9), lr = u * 0.034 * (pv ? 1.3 : 1);
    const lcy = (x) => yM(lx0) + (yM(lx1) - yM(lx0)) * ((x - lx0) / (lx1 - lx0)) - lr * 0.45; // a straight log resting on the ground
    const ltop = (x) => lcy(x) - lr * (1 + 0.05 * wv(x, 40, 1) + 0.03 * wv(x, 97, 2));
    const logPath = new Path2D();
    logPath.moveTo(lx0, lcy(lx0) + lr * 1.5);
    for (let j = 0; j <= 7; j++) logPath.lineTo(lx0 - (R() * 0.7 + (j % 2) * 0.6) * lr * 0.5, lcy(lx0) + lr * (1.4 - 2.4 * (j / 7))); // the broken end, splintered
    logPath.lineTo(lx0 + lr * 0.25, ltop(lx0) - lr * 0.5); logPath.lineTo(lx0 + lr * 0.5, ltop(lx0)); // one long splinter standing up
    for (let x = lx0 + lr * 0.5; x <= lx1; x += 3) logPath.lineTo(x, ltop(x));
    logPath.ellipse(lx1, lcy(lx1), lr * 0.32, lr, 0, -Math.PI / 2, Math.PI / 2); // the other end, rounded off by rot
    logPath.lineTo(lx0, lcy(lx0) + lr * 1.5); logPath.closePath();
    mc.fill(logPath);
    moss(mc, ltop, lx0 + lr * 0.4, lx1, u * 0.0036, pv ? 0 : u * 0.014);
    for (const k of [0.36, 0.68]) { // broken branches
      const x = lx0 + (lx1 - lx0) * k, y = ltop(x) + lr * 0.2, a = -Math.PI / 2 + (k < 0.5 ? -0.55 : 0.45), len = u * (0.035 + R() * 0.03) * (pv ? 1.3 : 1);
      mc.lineWidth = lw(lr * 0.3); mc.beginPath(); mc.moveTo(x, y); mc.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); mc.stroke();
      mc.lineWidth = lw(lr * 0.12); mc.beginPath(); mc.moveTo(x + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7); mc.lineTo(x + Math.cos(a + 0.7) * len * 1.05, y + Math.sin(a + 0.7) * len * 1.05); mc.stroke();
    }
    mc.save(); mc.globalCompositeOperation = 'destination-out'; mc.strokeStyle = 'rgba(0,0,0,0.13)'; // the grain of the bark along the log
    for (let j = 0; j < 5; j++) { const f = -0.75 + j * 0.32 + (R() - 0.5) * 0.1; mc.lineWidth = lw(u * 0.0012); mc.beginPath(); for (let x = lx0 + lr; x < lx1 - lr * 0.3; x += 6) { const y = lcy(x) + lr * f + Math.sin(x * 0.05 + j) * lr * 0.04; if (x === lx0 + lr) mc.moveTo(x, y); else mc.lineTo(x, y); } mc.stroke(); }
    mc.restore();
    fern(mc, lx0 - u * 0.03, yM(lx0 - u * 0.03), u * (pv ? 0.12 : 0.1), 7, 2.4, false);
    for (let i = 0, nf = pv ? 1 : Math.max(2, Math.round((W / u) * 2.2)); i < nf; i++) { const x = lx1 + u * 0.06 + (xT - wT * 2 - lx1 - u * 0.06) * ((i + 0.2 + R() * 0.6) / nf); fern(mc, x, yM(x), u * (0.045 + R() * 0.04), 6, 2.3, false); }
    if (!pv) for (let i = 0; i < 4; i++) { const x = lx0 + (lx1 - lx0) * (0.1 + R() * 0.8); fern(mc, x, yM(x) + lr * 0.4, u * (0.035 + R() * 0.02), 5, 2.4, false); } // low ones in front of the log

    // near: the great tree on the right, its roots, the ground, the mound of ferns at the left
    const big = trunk(nc, xT, yN(xT) + u * 0.01, -u * 0.04, wT, { wob: 1.2, flare: 1.0, lean: 0.02, stubs: pv ? 0 : 1, lichen: 1.2, moss: u * 0.005 });
    furrows(nc, big, 9, 0.16);
    /** A root running along the ground from x0 (thick, rising out of the trunk) to x1 (thin), humped as it goes. */
    const root = (c, x0, x1, wid, lift, ph) => {
      const N = 28, pts = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N, x = x0 + (x1 - x0) * k, wd = wid * (1 - 0.85 * k), hump = 0.5 + 0.5 * Math.sin(k * Math.PI * 1.7 + ph);
        pts.push([x, yN(x) - wd * (0.2 + lift * hump) - wid * 3.2 * (1 - k) ** 3, wd]);
      }
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + pts[0][2] * 3);
      for (const p of pts) c.lineTo(p[0], p[1] - p[2]);
      for (let i = N; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + pts[i][2] * 1.5);
      c.closePath(); c.fill();
      const top = (x) => { const k = Math.max(0, Math.min(1, (x - x0) / (x1 - x0))), i = Math.min(N - 1, Math.floor(k * N)), f = k * N - i; return (pts[i][1] - pts[i][2]) * (1 - f) + (pts[i + 1][1] - pts[i + 1][2]) * f; };
      moss(c, top, Math.min(x0, x1), Math.max(x0, x1), u * 0.0036, 0);
      return top;
    };
    const rx0 = xT - wT * 0.55, rx1 = xT - u * 0.46 * (pv ? 0.8 : 1);
    const topA = root(nc, rx0, rx1, u * 0.022, 1.1, 0.4);
    root(nc, xT - wT * 0.45, xT - u * 0.2, u * 0.015, 0.8, 2.1);
    root(nc, xT + wT * 0.3, W + u * 0.1, u * 0.02, 0.9, 1);
    ground(nc, yN, u * 0.0042, pv ? 0 : u * 0.008);
    fern(nc, W * 0.05 - u * 0.03, yN(W * 0.05 - u * 0.03), u * (pv ? 0.22 : 0.2), pv ? 6 : 9, 2.6, !pv);
    if (!pv) fern(nc, W * 0.05 + u * 0.22, yN(W * 0.05 + u * 0.22), u * 0.12, 6, 2.2, true);
    for (let i = 0, ns = pv ? 0 : Math.round(W / u * 9); i < ns; i++) { const x = R() * W * 0.86; sorrel(nc, x, yN(x) + u * 0.003, u * (0.008 + R() * 0.008)); }

    /* the mushrooms, in clusters: each cluster's light lies on the ground and the mist around it */
    const clusters = [], all = [];
    const cluster = (depth, hue, o = {}) => { const cl = { depth, hue, ms: [], vert: !!o.vert, edge: o.edge || [0, 1], lv: 0 }; clusters.push(cl); return cl; };
    const make = (cl, kind, x, y, f = 1, o = {}) => {
      const z = DEPTH[cl.depth].sz * ms * f * (pv && cl.depth === 2 ? 1.3 : 1), m = { kind, x, y, cl, hue: cl.hue, depth: cl.depth, sk: (R() - 0.5) * 0.24, seed: (R() * 1e9) | 0 };
      if (kind === 'tall') Object.assign(m, { h: u * (0.055 + R() * 0.055) * z, sw: u * (0.0026 + R() * 0.0012) * z, cw: u * (0.013 + R() * 0.008) * z, lean: (R() - 0.5) * 0.36, bend: (R() - 0.5) * 0.6, umbo: R() });
      else if (kind === 'bon') Object.assign(m, { h: u * (0.011 + R() * 0.012) * z, sw: u * (0.0015 + R() * 0.0006) * z, cw: u * (0.0062 + R() * 0.0032) * z, lean: (R() - 0.5) * 0.6, bend: (R() - 0.5) * 0.5, umbo: R() * 0.5 });
      else if (kind === 'umb') Object.assign(m, { h: u * (0.028 + R() * 0.024) * z, sw: u * (0.0064 + R() * 0.003) * z, cw: u * (0.04 + R() * 0.024) * z, lean: (R() - 0.5) * 0.2, bend: (R() - 0.5) * 0.25, bulb: 0.4 + R() * 0.4, spots: R() < 0.5 ? 4 + ((R() * 5) | 0) : 0 });
      else if (kind === 'btn') Object.assign(m, { h: u * (0.008 + R() * 0.008) * z, sw: u * (0.005 + R() * 0.002) * z, cw: u * (0.012 + R() * 0.007) * z, lean: (R() - 0.5) * 0.3, bend: 0, bulb: 0.3 });
      else Object.assign(m, { cw: u * (0.028 + R() * 0.014) * z, dir: -1, tilt: (R() - 0.5) * 0.16 });
      m.ch = m.cw * (kind === 'tall' ? 0.72 + R() * 0.25 : kind === 'bon' ? 0.8 + R() * 0.2 : kind === 'umb' ? 0.26 + R() * 0.12 : kind === 'btn' ? 0.62 + R() * 0.15 : 0.5 + R() * 0.12);
      Object.assign(m, o);
      m.base = DEPTH[cl.depth].lit * (0.85 + R() * 0.3) * (pv ? 1.15 : 1);
      m.ha = DEPTH[cl.depth].halo * (kind === 'bon' ? 0.8 : 1) * (pv ? 0.5 : 1); // in the small preview the halo would blur the cap away
      m.ph = R() * TAU; m.sp = 0.014 + R() * 0.022; m.pb = 0; m.lv = m.base;
      prep(m);
      cl.ms.push(m); all.push(m);
      return m;
    };
    const tuft = (cl, cx, Y, n, spread, f) => { for (let i = 0; i < n; i++) { const x = cx + (R() - 0.5) * spread, d = (x - cx) / spread; make(cl, 'bon', x, Y(x) + u * 0.002, f * (0.85 + R() * 0.5), { lean: d * 0.9 + (R() - 0.5) * 0.2 }); } };

    { // near, left: slender bells on long stems, fanned out over the mound, bonnets at their feet
      const cl = cluster(2, 'teal'), n = pv ? 4 : 7, x0 = Math.max(u * 0.03, W * 0.05);
      for (let i = 0; i < n; i++) { const k = i / (n - 1), x = x0 + u * (0.015 + 0.13 * k) + (R() - 0.5) * u * 0.012; make(cl, 'tall', x, yN(x) + u * 0.003, (0.72 + R() * 0.5) * (pv ? 0.65 : 1), { lean: (k - 0.5) * 0.5 + (R() - 0.5) * 0.14 }); }
      if (!pv) tuft(cl, x0 + u * 0.08, yN, 5, u * 0.1, 1);
    }
    { // near, right: umbrellas and buttons growing out of the long root
      const cl = cluster(2, 'gold'), kinds = pv ? ['umb', 'umb'] : ['btn', 'umb', 'umb', 'btn', 'umb', 'btn'];
      let x = rx0 + (rx1 - rx0) * (pv ? 0.35 : 0.3);
      kinds.forEach((kd, i) => {
        const m = make(cl, kd, x, 0, kd === 'umb' ? (i === 1 ? 1.2 : 0.75 + R() * 0.25) : 0.8 + R() * 0.4);
        m.y = topA(x) + u * 0.003;
        x += (rx1 - rx0) * (kd === 'umb' ? 0.08 : 0.05) * (pv ? 1.8 : 1);
      });
    }
    { // on the great trunk: brackets in a tiered stack up its side
      const cl = cluster(2, 'violet', { vert: true, edge: [1, 0] });
      let y = H * (pv ? 0.68 : 0.63);
      (pv ? [1, 0.8] : [1, 0.86, 0.92, 0.7, 0.55]).forEach((sz) => {
        const k = Math.max(0, Math.min(big.N, Math.round(((big.ys[0] - y) / (big.ys[0] - big.ys[big.N])) * big.N)));
        const m = make(cl, 'shelf', big.lx[k] + u * 0.005, y, sz * (0.9 + R() * 0.2), { dir: -1 });
        y -= m.ch * (1.15 + R() * 0.35);
      });
    }
    if (!pv && W > u * 1.1) { const cl = cluster(2, 'gold'), x = W * 0.42; tuft(cl, x, yN, 6, u * 0.05, 1.2); }
    // middle: bonnets in tufts along the log, a pair of slender ones on its broken end, umbrellas on the ground beyond
    for (const k of pv ? [0.55] : [0.24, 0.52, 0.8]) { const cl = cluster(1, 'teal'), x = lx0 + (lx1 - lx0) * k; tuft(cl, x, ltop, pv ? 4 : 5 + ((R() * 4) | 0), u * 0.055, pv ? 1.2 : 1.25); }
    if (!pv) { const cl = cluster(1, 'violet'); for (let i = 0; i < 3; i++) { const x = lx0 + lr * (0.7 + i * 0.5); make(cl, 'tall', x, ltop(x) + u * 0.002, 0.7 + R() * 0.3, { lean: -0.25 + i * 0.12 }); } }
    {
      const cl = cluster(1, 'teal'), x = Math.max(lx1 + u * 0.12, W * 0.62);
      if (x < xT - wT * 1.8 - u * 0.1) {
        make(cl, 'umb', x, yM(x) + u * 0.003, 1.05);
        if (!pv) { make(cl, 'umb', x + u * 0.04, yM(x + u * 0.04) + u * 0.003, 0.7, { lean: 0.15 }); make(cl, 'btn', x - u * 0.03, yM(x - u * 0.03) + u * 0.003, 0.9); make(cl, 'tall', x + u * 0.07, yM(x + u * 0.07) + u * 0.003, 0.8, { lean: 0.2 }); }
      } else clusters.pop();
    }
    if (!pv) {
      const x = W * 0.8;
      if (x < rx1 - u * 0.02 || W > u * 1.9) { const cl = cluster(1, 'violet'); for (let i = 0; i < 3; i++) { const xx = Math.min(x, rx1 - u * 0.04) + i * u * 0.022; make(cl, 'tall', xx, yM(xx) + u * 0.003, 0.65 + R() * 0.4, { lean: (i - 1) * 0.2 }); } }
    }
    // far: small clusters all along the far ground
    for (let i = 0, nfc = pv ? 2 : Math.max(3, Math.round(W / (u * 0.38))); i < nfc; i++) {
      const cl = cluster(0, HUES[(i + 1) % 3]), cx = (W * (i + 0.3 + R() * 0.4)) / nfc;
      for (let j = 0, nm = 2 + ((R() * 3) | 0); j < nm; j++) { const x = cx + (j - nm / 2) * u * 0.018 * (pv ? 2 : 1), kd = ['tall', 'umb', 'bon', 'btn'][(R() * 4) | 0]; make(cl, kd, x, yF(x) + u * 0.002, kd === 'bon' ? 1.4 : 0.9 + R() * 0.3); }
    }

    // every cluster: its extent, the light it throws on the ground (from the ground's own shape: lit tops of moss
    // and roots, the moss beneath broken up into clumps), and how much of it gets into the mist
    const layers = [back, mid, near], ctxs = [bc, mc, nc];
    clusters.forEach((cl, i) => { cl.ri = i; });
    for (const cl of clusters) {
      const z = DEPTH[cl.depth].sz * ms, xs = cl.ms.map((m) => m.x), ys = cl.ms.map((m) => m.y);
      cl.x0 = Math.min(...xs); cl.x1 = Math.max(...xs); cl.y0 = Math.min(...ys); cl.y1 = Math.max(...ys);
      cl.cx = (cl.x0 + cl.x1) / 2; cl.by = ys.reduce((a, b) => a + b, 0) / ys.length;
      cl.my = cl.ms.reduce((a, m) => a + m.y + m.hy, 0) / cl.ms.length;
      cl.r = Math.max(u * 0.09 * z, (cl.vert ? cl.y1 - cl.y0 : cl.x1 - cl.x0) * 0.62 + u * 0.05 * z);
      cl.mr = cl.r * 1.5; cl.ma = DEPTH[cl.depth].mist;
      for (const m of cl.ms) m.d = cl.vert ? (m.y - cl.y0) / (cl.y1 - cl.y0 || 1) : (m.x - cl.x0) / (cl.x1 - cl.x0 || 1);
      const src = layers[cl.depth], qq = src.width / W, r = cl.r;
      const bx = cl.cx - r * (cl.vert ? 1.2 : 1), by = cl.vert ? cl.by - r : cl.by - r * 0.7, bw = r * (cl.vert ? 2.2 : 2), bh = r * (cl.vert ? 2 : 1.25);
      const [p, pc] = K.layer(bw, bh, dpr), [g, gc] = K.layer(bw, bh, dpr), e = Math.max(1, u * 0.0028 * z);
      pc.drawImage(src, bx * qq, by * qq, bw * qq, bh * qq, 0, 0, bw, bh);
      pc.globalCompositeOperation = 'destination-out'; pc.drawImage(src, bx * qq, by * qq, bw * qq, bh * qq, cl.edge[0] * e, cl.edge[1] * e, bw, bh);
      if (cl.vert) { pc.globalCompositeOperation = 'destination-out'; pc.fillStyle = 'rgba(0,0,0,0.55)'; pc.fillRect(0, 0, bw, bh); } // a bark edge catches less than a mossy top
      gc.drawImage(src, bx * qq, by * qq, bw * qq, bh * qq, 0, 0, bw, bh);
      if (!cl.vert) { gc.globalCompositeOperation = 'destination-in'; gc.fillStyle = gc.createPattern(mossTex(), 'repeat'); gc.fillRect(0, 0, bw, bh); }
      pc.globalCompositeOperation = 'source-over'; pc.globalAlpha = cl.vert ? 0.3 : 0.4; pc.drawImage(g, 0, 0, bw, bh);
      if (!cl.vert) { pc.globalAlpha = 0.22; pc.drawImage(src, bx * qq, by * qq, bw * qq, bh * qq, 0, 0, bw, bh); } // and an even wash under the clumps
      pc.globalAlpha = 1;
      pc.globalCompositeOperation = 'destination-in';
      pc.save(); pc.translate(cl.cx - bx, (cl.vert ? cl.by : cl.by - r * 0.06) - by); pc.scale(cl.vert ? 0.75 : 1, cl.vert ? 0.85 : 0.6);
      const rg = pc.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.3, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.65, 'rgba(0,0,0,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      pc.fillStyle = rg; pc.fillRect(-r * 3, -r * 3, r * 6, r * 6);
      pc.restore();
      pc.globalCompositeOperation = 'source-in'; pc.fillStyle = rgba(L ? HUE[cl.hue].b : HUE[cl.hue].g, 1); pc.fillRect(0, 0, bw, bh);
      cl.pool = { c: p, x: bx, y: by, w: bw, h: bh };
    }
    // their shapes go into the ink (so they hide what is behind them); their light, or their colours by day, into sprites
    const byD = [[], [], []], clD = [[], [], []];
    for (const m of all) {
      const c = ctxs[m.depth];
      c.save(); c.translate(m.x, m.y); drawMush(c, m, 'ink'); c.restore();
      if (!L) m.spr = sprite(m, q); // (by day the bodies are laid into one layer per depth, below)
      byD[m.depth].push(m);
    }
    for (const cl of clusters) { clD[cl.depth].push(cl); cl.ss = softSpr(L ? HUE[cl.hue].b : HUE[cl.hue].g); }
    let col = null;
    if (L) { // by day: the mushrooms of each depth in one layer, set into the picture like the ink
      col = [0, 1, 2].map((d) => {
        if (!byD[d].length) return null;
        const y0 = Math.max(0, Math.floor(Math.min(...byD[d].map((m) => m.y + m.by)) - 2)), hh = H - y0;
        const [lc, x] = K.layer(W, hh, dpr);
        x.translate(0, -y0);
        for (const m of byD[d]) { x.save(); x.translate(m.x, m.y); drawMush(x, m, 'body'); x.restore(); }
        return { c: lc, y: y0, h: hh };
      });
    }

    // in front of everything: a few big fronds leaning in from the bottom left corner
    let front = null, fw = 0, fh = 0;
    if (!pv) {
      fw = Math.min(W * 0.45, u * 0.5); fh = u * 0.34;
      const [fl, fc] = K.layer(fw, fh, dpr);
      fc.translate(0, -(H - fh)); fc.fillStyle = ink; fc.strokeStyle = ink;
      for (const [a, len, bend] of [[-1.18, 0.3, 0.75], [-0.86, 0.24, 0.62], [-1.42, 0.22, 0.5]]) frond(fc, -u * 0.012, H + u * 0.02, u * len, a, bend, u * 0.003, true);
      front = fl;
    }

    const emit = []; // where spores come from: the bigger the cap, the more of them
    for (const m of all) for (let i = 0, n = Math.max(1, Math.min(4, Math.round(m.cw / (u * 0.012 * ms)))); i < n; i++) emit.push(m);
    // foxfire: the rotten wood of the log glows faintly in patches (only by night)
    let fox = null;
    if (!L) {
      const fx0 = lx0 - lr, fy0 = Math.min(ltop(lx0), ltop(lx1)) - lr * 0.8, fw2 = lx1 - lx0 + lr * 2.4, fh2 = lr * 3.4;
      const [fl, fc] = K.layer(fw2, fh2, dpr);
      fc.translate(-fx0, -fy0); fc.fill(logPath);
      fc.globalCompositeOperation = 'destination-in';
      const pat = fc.createPattern(K.noiseTex('mshFox', 256, 64, { px: 22, py: 6, oct: 3, lo: 0.42, hi: 0.86, seed: 77 }), 'repeat');
      pat.setTransform(new DOMMatrix([0.7 * (pv ? 0.4 : 1), 0, 0, 0.7 * (pv ? 0.4 : 1), 0, 0]));
      fc.fillStyle = pat; fc.fillRect(fx0, fy0, fw2, fh2);
      const pg = fc.createLinearGradient(fx0, 0, fx0 + fw2, 0); // in patches along it
      for (let i = 0; i <= 12; i++) pg.addColorStop(i / 12, `rgba(0,0,0,${(0.15 + 0.85 * R() ** 1.5).toFixed(2)})`);
      fc.fillStyle = pg; fc.fillRect(fx0, fy0, fw2, fh2);
      const vg = fc.createLinearGradient(0, fy0, 0, fy0 + fh2); // brightest along its upper side
      vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.45, 'rgba(0,0,0,0.8)'); vg.addColorStop(0.8, 'rgba(0,0,0,0.12)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
      fc.fillStyle = vg; fc.fillRect(fx0, fy0, fw2, fh2);
      fc.globalCompositeOperation = 'source-in'; fc.fillStyle = 'rgb(140,255,196)'; fc.fillRect(fx0, fy0, fw2, fh2);
      fox = { c: fl, x: fx0, y: fy0, w: fw2, h: fh2 };
    }
    // a faint glow over the far ground, the light of countless mushrooms too far off to see, for the trunks to stand against
    const amb = [];
    for (let i = 0, na = Math.max(2, Math.ceil(W / (u * 0.45))); i < na; i++) amb.push({ x: (W * (i + 0.5)) / na + (R() - 0.5) * u * 0.1, y: H * fF - u * 0.04, rx: u * (0.32 + R() * 0.14), ry: u * (0.13 + R() * 0.05), hue: HUES[i % 2 ? 1 : 0], a: 0.5 + R() * 0.3, ss: softSpr(HUE[HUES[i % 2 ? 1 : 0]].g) });
    const items = clusters.map((cl) => ({ c: cl.pool.c, o: cl.pool }));
    if (!L) for (const m of all) items.push({ c: m.spr, o: m });
    if (fox) items.push({ c: fox.c, o: fox });
    atlas(items);
    for (const m of all) m.spr = null;
    for (const cl of clusters) cl.pool.c = null;
    if (fox) fox.c = null;
    const beams = [0.18, 0.43, 0.7].map((fx, i) => ({ x: W * fx + (R() - 0.5) * u * 0.1, w: u * (0.05 + R() * 0.06), a: 0.22 + R() * 0.1, ph: i * 2.1 }));
    return { back, mid, near, front, fw, fh, col, fox, amb, clusters, cl: clD, ms: byD, all, emit, beams, fF, fM, fN, moths: clusters.filter((c) => c.depth > 0 && !c.vert && c.ms.length > 1) };
  }

  /* ---------- what moves ---------- */

  function spawn(st, S, V, pre, from) {
    const { W, H, u, pv } = V;
    let m = from, x, y, d, hue;
    if (!m && RND() < 0.72 && S.emit.length) m = S.emit[(RND() * S.emit.length) | 0];
    if (m) { x = m.x + m.hx + (RND() - 0.5) * m.cw * 0.5; y = m.y + m.hy; d = m.depth; hue = m.hue; }
    else { d = RND() < 0.4 ? 0 : RND() < 0.6 ? 1 : 2; x = RND() * W; y = H * (0.42 + RND() * 0.5); hue = HUES[(RND() * 3) | 0]; }
    const z = [0.45, 0.7, 1][d] * (0.8 + RND() * 0.4), life = 420 + RND() * 600;
    const s = { cx: x, cy: y, a: RND() * TAU, w: (0.014 + RND() * 0.026) * (RND() < 0.5 ? -1 : 1), rr: u * (0.002 + RND() * 0.006) * z, gr: u * (0.000005 + RND() * 0.00001) * z,
      vy: -u * (0.00014 + RND() * 0.00028) * (0.6 + z * 0.6), vx: u * (RND() - 0.5) * 0.00016, r: u * (0.0011 + RND() * 0.0012) * z * (pv ? 2.2 : 1), age: 0, life, hue, z, tw: RND() * TAU };
    if (pre) { const k = RND() * life * 0.85; s.age = k; s.cy += s.vy * k; s.cx += s.vx * k; s.a += s.w * k; s.rr += s.gr * k; }
    s.spr = K.light() ? dotSpr(mix(HUE[hue].b, HUE[hue].d, 0.4)) : sporeSpr(HUE[hue].g, HUE[hue].core);
    st.sp[d].push(s);
  }

  function init(V, S) {
    const { W, H, u, pv } = V;
    const st = { kind: 'mushroom', key: S.key, sp: [[], [], []], wisp: null, beam: null,
      rip: S.clusters.map(() => ({ age: -1, wait: 90 + RND() * (pv ? 260 : 800), dir: 1, len: 70 })),
      cap: pv ? 9 : Math.round(Math.min(70, 20 + ((W * H) / 40000) * 1.2)),
      flySpr: sporeSpr(FLY, FLY_CORE), wm: null,
      ff: Array.from({ length: pv ? 1 : 4 }, () => ({ x: RND() * W, y: H * (S.fF - 0.05 - RND() * 0.2), vx: 0, vy: 0, next: 60 + RND() * 300, on: 0 })),
      bokeh: pv ? [] : Array.from({ length: 2 }, (_, i) => ({ x: RND() * W, y: H * (0.3 + RND() * 0.6), r: u * (0.035 + RND() * 0.035), v: u * (0.00008 + RND() * 0.0001), ph: RND() * TAU, ss: softSpr(HUE[HUES[i]].g) })),
      moth: { state: 'away', timer: pv ? 1e9 : 600 + RND() * 900 } };
    for (let i = 0; i < st.cap; i++) spawn(st, S, V, true);
    return st;
  }

  window.BG_EXT.mushroom = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.85, 1.45), { W, H, u, pv } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'mushroom' || st.key !== S.key) st = bg.st = init(V, S);
    const k7 = u / 700, add = L ? 'source-over' : 'lighter';
    const air = u * (0.00012 * Math.sin(t * 0.0019) + 0.00005 * Math.sin(t * 0.0071 + 1));

    // how bright everything is: each mushroom breathes at its own pace, and now and then a wave of light runs through a cluster
    for (let i = 0; i < S.clusters.length; i++) {
      const r = st.rip[i];
      S.clusters[i].lv = 0;
      if (r.age < 0) { if (--r.wait <= 0) { r.age = 0; r.dir = RND() < 0.5 ? -1 : 1; r.len = 55 + RND() * 45; } }
      else if (++r.age > r.len) { r.age = -1; r.wait = (pv ? 260 : 450) + RND() * (pv ? 400 : 1100); }
    }
    let total = st.sp[0].length + st.sp[1].length + st.sp[2].length;
    for (const m of S.all) {
      const r = st.rip[m.cl.ri];
      let bump = 0;
      if (r.age >= 0) { const pos = -0.3 + (1.6 * r.age) / r.len, d = r.dir > 0 ? m.d : 1 - m.d; bump = Math.exp(-(((d - pos) / 0.17) ** 2)); }
      if (bump > 0.85 && m.pb <= 0.85 && total < st.cap + 14 && RND() < 0.7) { spawn(st, S, V, false, m); total++; } // a puff of spores as the wave passes
      m.pb = bump;
      m.lv = m.base * (0.62 + 0.19 * (1 + Math.sin(t * m.sp + m.ph))) * (1 + 0.45 * bump);
      m.cl.lv += m.lv / m.cl.ms.length;
    }
    if (total < st.cap && RND() < 0.3) spawn(st, S, V, false);

    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round';

    // 1. their light in the mist: drawn first on the empty canvas, then cut to the shape of the wisps
    if (!L) {
      const tex = wispTex(), hy = H * 0.36, hh = H - hy, tw = u * 2.2;
      if (!st.wisp) st.wisp = ctx.createPattern(tex, 'repeat-x');
      for (const a of S.amb) { ctx.globalAlpha = a.a * 0.32; ctx.drawImage(a.ss, a.x - a.rx, a.y - a.ry, a.rx * 2, a.ry * 2); }
      for (const cl of S.clusters) { const r = cl.mr; ctx.globalAlpha = Math.min(1, cl.lv * cl.ma); ctx.drawImage(cl.ss, cl.cx - r, cl.my - r * 0.75, r * 2, r * 1.5); }
      if (!st.wm) st.wm = new DOMMatrix([tw / tex.width, 0, 0, hh / tex.height, 0, hy]);
      st.wm.e = -((t * 0.11 * k7) % tw); st.wisp.setTransform(st.wm);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = st.wisp; ctx.fillRect(0, hy, W, hh);
      ctx.globalCompositeOperation = 'lighter';
      for (const a of S.amb) { ctx.globalAlpha = a.a * 0.07; ctx.drawImage(a.ss, a.x - a.rx, a.y - a.ry, a.rx * 2, a.ry * 2); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    /** One depth's light: the pools on the ground, then each mushroom (by day: soft colour round them, then the bodies). */
    const lights = (d) => {
      ctx.globalCompositeOperation = add;
      for (const cl of S.cl[d]) { const p = cl.pool; ctx.globalAlpha = Math.min(1, cl.lv * (L ? 0.16 : 0.85)); ctx.drawImage(p.src, p.sx, p.sy, p.sw, p.sh, p.x, p.y, p.w, p.h); }
      if (L) {
        for (const cl of S.cl[d]) { if (cl.vert) continue; const r = cl.r * 0.8; ctx.globalAlpha = Math.min(1, cl.lv * 0.16); ctx.drawImage(cl.ss, cl.cx - r, cl.my - r * 0.7, r * 2, r * 1.4); }
        const c = S.col[d];
        if (c) K.stamp(ctx, c.c, 0, c.y, W, c.h, [0.5, 0.72, 0.86][d]);
      } else {
        for (const m of S.ms[d]) { ctx.globalAlpha = Math.min(1, m.lv); ctx.drawImage(m.src, m.sx, m.sy, m.sw, m.sh, m.x + m.bx, m.y + m.by, m.bw, m.bh); }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    };
    /** Spores of one depth rising in slow spirals, carried a little by the air. */
    const spores = (d) => {
      const list = st.sp[d];
      let j = 0;
      ctx.globalCompositeOperation = add;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        s.age++; s.a += s.w; s.cx += s.vx + air; s.cy += s.vy; s.rr += s.gr;
        if (s.age >= s.life || s.cy < V.oy - u * 0.04) continue;
        list[j++] = s;
        const x = s.cx + Math.cos(s.a) * s.rr, y = s.cy + Math.sin(s.a) * s.rr * 0.35;
        const a = Math.min(1, s.age / 50, (s.life - s.age) / 150) * (0.72 + 0.28 * Math.sin(s.age * 0.06 + s.tw));
        if (a <= 0.01) continue;
        const dd = s.r * (L ? 3.4 : 9);
        ctx.globalAlpha = a * (L ? 0.24 + 0.26 * s.z : 0.4 + 0.4 * s.z); ctx.drawImage(s.spr, x - dd / 2, y - dd / 2, dd, dd);
      }
      list.length = j;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    };
    const fog = K.tint(fogTex(), L ? '#ffffff' : '#a6c8c2');

    // 2. the far wood: trunks into the mist, small clusters, a few fireflies blinking among the trunks
    K.put(ctx, S.back, W, H, L ? 0.14 : 0.42);
    if (!L) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of st.ff) {
        f.vx = (f.vx + (RND() - 0.5) * 0.05 * k7) * 0.97; f.vy = (f.vy + (RND() - 0.5) * 0.04 * k7) * 0.97;
        f.x = (f.x + f.vx + W) % W; f.y = Math.max(H * (S.fF - 0.3), Math.min(H * S.fF - u * 0.015, f.y + f.vy));
        if (f.on > 0) {
          f.on--;
          const a = Math.sin(Math.PI * (f.on / 40)) ** 2, dd = u * 0.016 * (pv ? 2 : 1);
          ctx.globalAlpha = a * 0.65; ctx.drawImage(st.flySpr, f.x - dd / 2, f.y - dd / 2, dd, dd);
        } else if (--f.next <= 0) { f.on = 40; f.next = 150 + RND() * 420; }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    lights(0);
    K.mist(ctx, fog, W, H * S.fF - u * 0.13, u * 0.2, u * 1.8, t * 0.12 * k7, L ? 0.6 : 0.12);
    spores(0);

    // 3. the middle: the log and its tufts, the trunks behind; by day, sunbeams slanting through
    K.put(ctx, S.mid, W, H, L ? 0.22 : 0.64);
    if (S.fox) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 + 0.06 * Math.sin(t * 0.011); ctx.drawImage(S.fox.src, S.fox.sx, S.fox.sy, S.fox.sw, S.fox.sh, S.fox.x, S.fox.y, S.fox.w, S.fox.h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    lights(1);
    spores(1);
    if (L && !pv) {
      if (!st.beam) { const g = ctx.createLinearGradient(-1, 0, 1, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); st.beam = g; }
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = st.beam;
      for (const bm of S.beams) { ctx.save(); ctx.translate(bm.x, 0); ctx.rotate(-0.32); ctx.scale(bm.w, 1); ctx.globalAlpha = bm.a * (0.75 + 0.25 * Math.sin(t * 0.005 + bm.ph)); ctx.fillRect(-1, -H * 0.1, 2, H * 1.25); ctx.restore(); }
      ctx.restore();
    }
    K.mist(ctx, fog, W, H * S.fM - u * 0.08, u * 0.15, u * 1.4, -t * 0.17 * k7 + 400, L ? 0.45 : 0.09);

    // 4. near: the great tree, its roots, the mound; a moth now and then; the nearest spores
    K.put(ctx, S.near, W, H, L ? 0.32 : 0.85);
    lights(2);
    const mo = st.moth;
    if (mo.state === 'away') {
      if (--mo.timer <= 0 && S.moths.length) {
        const cl = S.moths[(RND() * S.moths.length) | 0];
        Object.assign(mo, { state: 'in', cl, x: cl.cx < W / 2 ? -u * 0.03 : W + u * 0.03, y: cl.my - u * (0.15 + RND() * 0.15), vx: 0, vy: 0, life: 0, ph: RND() * TAU, stay: 360 + RND() * 360, hd: 0 });
      }
    } else {
      const cl = mo.cl;
      mo.life++;
      let tx, ty;
      if (mo.state === 'out') { tx = mo.ex; ty = mo.ey; }
      else {
        const a = mo.life * 0.045 + mo.ph;
        tx = cl.cx + Math.cos(a) * cl.r * 0.55 + Math.sin(a * 2.3) * cl.r * 0.2; ty = cl.my - cl.r * 0.12 + Math.sin(a * 1.7) * cl.r * 0.28;
        if (mo.state === 'in' && Math.hypot(tx - mo.x, ty - mo.y) < cl.r) mo.state = 'orbit';
        if ((mo.state === 'orbit' && --mo.stay <= 0) || mo.life > 1400) { mo.state = 'out'; mo.ex = (RND() < 0.5 ? -0.15 : 1.15) * W; mo.ey = H * (0.2 + RND() * 0.3); }
      }
      const acc = mo.state === 'out' ? 0.0016 : 0.0011;
      mo.vx = (mo.vx + (tx - mo.x) * acc + (RND() - 0.5) * 0.9 * k7) * 0.9;
      mo.vy = (mo.vy + (ty - mo.y) * acc + (RND() - 0.5) * 0.9 * k7) * 0.9;
      mo.x += mo.vx; mo.y += mo.vy;
      let dh = Math.atan2(mo.vx, -mo.vy) - mo.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); mo.hd += dh * 0.15;
      if (mo.state === 'out' && (mo.x < -u * 0.06 || mo.x > W + u * 0.06)) { mo.state = 'away'; mo.timer = 1200 + RND() * 2400; }
      else {
        const Hc = HUE[cl.hue], near = Math.max(0, 1 - Math.hypot(mo.x - cl.cx, mo.y - cl.my) / (cl.r * 1.2)) * Math.min(1, cl.lv);
        moth(ctx, mo.x, mo.y, u * 0.013, t * 1.7 + mo.ph, mo.hd, L ? 'rgba(118,104,92,0.42)' : rgba(mix(Hc.g, WHITE, 0.55), 0.12 + 0.42 * near), L ? 'rgba(68,60,54,0.6)' : 'rgba(10,12,14,0.7)');
      }
    }
    spores(2);
    if (!L) {
      ctx.globalCompositeOperation = 'lighter';
      for (const o of st.bokeh) {
        o.y -= o.v; o.x += air * 1.5 + Math.sin(t * 0.004 + o.ph) * 0.1 * k7;
        if (o.y < V.oy - o.r) { o.y = H + o.r; o.x = RND() * W; }
        ctx.globalAlpha = 0.04 + 0.02 * Math.sin(t * 0.01 + o.ph); ctx.drawImage(o.ss, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // 5. the fronds in front of it all
    if (S.front) K.stamp(ctx, S.front, 0, H - S.fh, S.fw, S.fh, L ? 0.38 : 0.9);
    ctx.restore();
  };
})();
