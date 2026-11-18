'use strict';
/*
 * 가을 단풍길: a lane under an arch of maples at sunset. Two rows of trees lean in and close over the path like a
 * vault, open at the far end to the evening light. Each trunk flares at the roots and forks into limbs that taper and
 * curve up into the crown; the crowns are lobed masses of small five-lobed leaves, lighter on top, in shade underneath,
 * their edges lit where the low sun shines through. Down the lane the trees melt into the warm haze. Dry golden grass
 * and silver-grass plumes line the verges; the path between is a clear lane strewn with fallen leaves,
 * crossed by trunk shadows and patches of light. Leaves come down at every depth, rocking or tumbling as they fall
 * (the paler back shows when one turns over), some settle on the path and lie there a while; now and then a gust
 * sets them spinning and slides the fallen ones along. Faint shafts of light come and go through the canopy.
 * On a light page it is a bright afternoon: the same lane in deeper inks, the light wearing the far trees thin.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('autumn'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const CAM = 1.6, LEAF = 0.12; // eye height and a leaf's size, in metres

  /** Canopy and litter tones, five per palette: from the shade deep in a crown to an edge the low sun shines through. */
  const PAL = {
    D: [
      [[46, 10, 12], [88, 18, 18], [142, 30, 26], [198, 58, 38], [246, 124, 74]], // crimson
      [[56, 18, 8], [106, 36, 14], [170, 70, 24], [222, 118, 42], [255, 182, 96]], // scarlet, orange
      [[58, 28, 8], [112, 60, 14], [180, 104, 26], [234, 146, 40], [255, 188, 84]], // gold, amber
      [[40, 8, 16], [80, 16, 30], [128, 28, 44], [178, 54, 62], [234, 114, 102]], // wine
      [[38, 22, 12], [68, 40, 22], [104, 64, 34], [146, 94, 52], [192, 138, 84]], // brown: dry, on the ground
    ],
    L: [
      [[110, 26, 26], [156, 38, 34], [196, 60, 44], [222, 100, 64], [238, 150, 106]],
      [[124, 48, 16], [172, 74, 26], [210, 108, 40], [230, 146, 70], [242, 186, 122]],
      [[124, 86, 16], [168, 122, 28], [204, 158, 48], [224, 188, 88], [238, 214, 142]],
      [[96, 22, 38], [138, 34, 54], [176, 56, 70], [204, 90, 96], [228, 142, 140]],
      [[90, 60, 38], [124, 86, 54], [156, 114, 74], [184, 144, 100], [210, 178, 136]],
    ],
  };
  /** Falling leaves: [heart, tips] per kind (crimson, scarlet, orange, gold, gold turning red). */
  const FALL = {
    D: [[[214, 60, 40], [150, 24, 26]], [[240, 116, 46], [196, 58, 30]], [[246, 170, 62], [222, 108, 36]], [[246, 208, 104], [212, 148, 44]], [[238, 186, 74], [196, 46, 36]]],
    L: [[[196, 50, 36], [134, 22, 26]], [[222, 98, 34], [176, 48, 24]], [[230, 148, 44], [200, 92, 30]], [[222, 178, 70], [186, 126, 32]], [[220, 164, 56], [176, 38, 30]]],
  };

  /* ---------- the leaf ---------- */

  /** Two maples: a slender, deeply cut leaf and a broader one. Lobe angles are measured from straight up. */
  const SHAPES = [
    { lobes: [[-2.1, 0.62], [-1.08, 0.92], [0, 1], [1.08, 0.92], [2.1, 0.62]], hw: 0.56, p: 1.15, sinus: 0.27, teeth: 0.05, nt: 3, base: 0.5 },
    { lobes: [[-1.98, 0.55], [-1.0, 0.88], [0, 1], [1.0, 0.88], [1.98, 0.55]], hw: 0.56, p: 0.8, sinus: 0.4, teeth: 0.045, nt: 2, base: 0.62 },
  ];
  /** The outline in polar form round the point where the veins meet: five pointed, toothed lobes, a notch for the stalk. */
  function outline(v) {
    const key = 'atOutline' + v;
    if (K.cache.has(key)) return K.cache.get(key);
    const S = SHAPES[v], pts = [], N = 220;
    for (let i = 0; i < N; i++) {
      const phi = -Math.PI + ((i + 0.5) / N) * TAU;
      let r = S.sinus;
      for (const [th, len] of S.lobes) {
        const x = Math.abs(phi - th) / S.hw;
        if (x >= 1) continue;
        let rr = S.sinus + (len - S.sinus) * Math.pow(1 - x, S.p);
        if (x > 0.1 && x < 0.86) { const q = ((x - 0.1) / 0.76) * S.nt; rr += S.teeth * len * Math.pow(1 - 2 * Math.abs(q - Math.floor(q) - 0.5), 3); }
        if (rr > r) r = rr;
      }
      const db = Math.PI - Math.abs(phi); // near straight down the blade dips in to meet the stalk
      if (db < S.base) r *= 0.3 + 0.7 * Math.pow(db / S.base, 0.8);
      pts.push([r * Math.sin(phi), -r * Math.cos(phi)]);
    }
    K.cache.set(key, pts);
    return pts;
  }
  function leafPath(v, s) {
    const p = new Path2D();
    outline(v).forEach(([x, y], i) => (i ? p.lineTo(x * s, y * s) : p.moveTo(x * s, y * s)));
    p.closePath();
    return p;
  }

  /** A canopy leaf (32 px, its middle at the centre): one tone, a little lighter toward its heart, veins faintly darker. */
  function dab(p, k, v, M) {
    const key = `atDab|${p}|${k}|${v}|${M}`;
    let c = K.cache.get(key);
    if (c) return c;
    c = K.mk(32, 32);
    const x = c.getContext('2d'), col = PAL[M][p][k], hi = PAL[M][p][Math.min(4, k + 1)], s = 15.5;
    x.translate(16, 21);
    const g = x.createRadialGradient(0, -3, 0, 0, -3, s);
    g.addColorStop(0, rgb(mix(col, hi, 0.35))); g.addColorStop(1, rgb(col));
    x.fillStyle = g; x.fill(leafPath(v, s));
    x.strokeStyle = rgba(mix(col, [0, 0, 0], 0.4), 0.45); x.lineWidth = 0.8;
    x.beginPath();
    for (const [th, len] of SHAPES[v].lobes) { x.moveTo(0, 0); x.lineTo(Math.sin(th) * len * s * 0.8, -Math.cos(th) * len * s * 0.8); }
    x.stroke();
    K.cache.set(key, c);
    return c;
  }

  /**
   * A mass of foliage (256 px; about 75 px round the centre): a few rounded parts run together, small leaves of one
   * palette packed close inside, thinning out at the edge into single leaves and gaps; shaded underneath, lighter on
   * top. Three shapes per palette, made once and kept.
   */
  function clumpSprite(p, n, M) {
    const key = `atClump|${p}|${n}|${M}`;
    let c = K.cache.get(key);
    if (c) return c;
    const N = 256, R = K.rng(911 + p * 31 + n * 7), pal = PAL[M][p], parts = [], np = 4 + ((R() * 4) | 0);
    for (let i = 0; i < np; i++) { const a = R() * TAU, d = i ? 20 + R() * 38 : 0; parts.push([128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.75, i ? 28 + R() * 26 : 50 + R() * 12]); }
    const nz = K.fbm(77 + p * 13 + n * 5, 4, 4, 3);
    const dens = (x, y) => { let m = -1; for (const [cx, cy, r] of parts) m = Math.max(m, 1 - Math.hypot(x - cx, (y - cy) / 0.85) / r); return m + (nz(x / 64, y / 64) - 0.5) * 0.6; };
    c = K.mk(N, N);
    const x = c.getContext('2d');
    x.fillStyle = rgb(pal[0]); // the shade deep inside
    for (const [cx, cy, r] of parts) { x.beginPath(); x.ellipse(cx, cy, r * 0.6, r * 0.51, 0, 0, TAU); x.fill(); }
    for (let i = 0; i < 5600; i++) {
      const px = 6 + R() * 244, py = 6 + R() * 244, d = dens(px, py), r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R(), r6 = R();
      if (d <= 0 || r1 > d * 3.4) continue; // thinning out toward the edge, into single leaves and gaps
      const up = (128 - py) / 80, q = i / 5600;
      const t = clamp(Math.floor((0.1 + up * 0.24 + q * 0.24 + (r2 - 0.5) * 0.34) * 5), 0, 3);
      const s = (8 + r3 * 7) / 32, rot = r4 * TAU, sx = 0.5 + r5 * 0.5, cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
      x.setTransform(cs * sx, sn * sx, -sn, cs, px, py);
      x.drawImage(dab(r6 < 0.85 ? p : (p + 1) % 4, t, r6 < 0.5 ? 0 : 1, M), -16, -16);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    const g = x.createLinearGradient(0, 50, 0, 206); // light from above, shade beneath (over the leaves only)
    g.addColorStop(0, rgba(pal[3], M === 'L' ? 0.12 : 0.1)); g.addColorStop(0.45, rgba(pal[2], 0)); g.addColorStop(1, rgba(mix(pal[0], [0, 0, 0], 0.3), M === 'L' ? 0.22 : 0.38));
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, N, N);
    K.cache.set(key, c);
    return c;
  }
  /** A tuft of dry grass (64 px, rooted at the bottom middle): tapering blades fanning out and bending over, dark at the root; lit: the tips catch the low sun. */
  function tuftSprite(n, lit, M) {
    const key = `atTuft|${n}|${lit}|${M}`;
    let c = K.cache.get(key);
    if (c) return c;
    c = K.mk(64, 64);
    const x = c.getContext('2d'), R = K.rng(4401 + n * 17 + lit * 5), L = M === 'L';
    const root = L ? [170, 140, 86] : [44, 30, 14], body = L ? [206, 172, 102] : lit ? [150, 110, 48] : [92, 66, 30], tip = L ? [234, 208, 142] : lit ? [244, 204, 124] : [146, 112, 60];
    for (let i = 0, nb = 12 + ((R() * 8) | 0); i < nb; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 1.6, len = 22 + R() * 38, hw = 0.8 + R() * 0.8, bend = (R() - 0.5) * 0.9 + Math.cos(a) * 1.1;
      const x0 = 32 + (R() - 0.5) * 10, y0 = 64, x2 = x0 + Math.cos(a) * len + bend * len * 0.3, y2 = y0 + Math.sin(a) * len + Math.abs(bend) * len * 0.22, x1 = x0 + Math.cos(a) * len * 0.55, y1 = y0 + Math.sin(a) * len * 0.6;
      const g = x.createLinearGradient(x0, y0, x2, y2);
      g.addColorStop(0, rgb(root)); g.addColorStop(0.5, rgb(body)); g.addColorStop(1, rgb(tip));
      x.fillStyle = g;
      x.beginPath(); x.moveTo(x0 - hw, y0); x.quadraticCurveTo(x1 - hw * 0.4, y1, x2, y2); x.quadraticCurveTo(x1 + hw * 0.4, y1, x0 + hw, y0); x.closePath(); x.fill();
    }
    K.cache.set(key, c);
    return c;
  }

  /**
   * A falling leaf (96 px; the blade's middle at (48, 44)): coloured from its heart out to the tips, creased along its
   * veins, a sheen across it, a stalk. The back is the mirror image, paler, its veins standing out light.
   * soft: out of focus (the sharp leaf smeared round a small circle, made once).
   */
  function leafSprite(kind, v, back, M, soft) {
    const key = `atLeaf|${kind}|${v}|${back}|${M}|${soft}`;
    let c = K.cache.get(key);
    if (c) return c;
    c = K.mk(96, 96);
    const x = c.getContext('2d');
    if (soft) {
      const src = leafSprite(kind, v, back, M, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.globalAlpha = 0.2; x.drawImage(src, Math.cos(a) * soft, Math.sin(a) * soft); }
      x.globalAlpha = 0.45; x.drawImage(src, 0, 0);
      K.cache.set(key, c);
      return c;
    }
    const L = M === 'L', s = 44, sh = SHAPES[v], path = leafPath(v, s);
    let [inner, outer] = FALL[M][kind];
    if (back) { inner = mix(inner, L ? [236, 214, 186] : [238, 210, 176], 0.4); outer = mix(outer, L ? [214, 176, 150] : [222, 184, 150], 0.3); }
    x.translate(48, 56);
    if (back) x.scale(-1, 1);
    const stalk = mix(outer, [70, 30, 20], 0.35);
    x.strokeStyle = rgb(stalk); x.lineWidth = 2.4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, 0.08 * s); x.quadraticCurveTo(0.01 * s, 0.38 * s, 0.09 * s, 0.62 * s); x.stroke();
    const g = x.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, rgb(inner)); g.addColorStop(0.5, rgb(mix(inner, outer, 0.55))); g.addColorStop(1, rgb(outer));
    x.fillStyle = g; x.fill(path);
    x.save(); x.clip(path);
    x.fillStyle = back ? 'rgba(255,255,255,0.07)' : 'rgba(40,0,0,0.1)'; // the blade creases along its veins: one side of each a shade darker
    for (const [th] of sh.lobes) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, s * 1.2, th - Math.PI / 2, th - Math.PI / 2 + sh.hw * 0.9); x.closePath(); x.fill(); }
    const gl = x.createLinearGradient(-s, -s, s, s * 0.6); // a sheen from the upper left
    gl.addColorStop(0, back ? 'rgba(255,248,236,0.18)' : 'rgba(255,240,214,0.22)'); gl.addColorStop(0.5, 'rgba(255,240,214,0)'); gl.addColorStop(1, 'rgba(40,0,0,0.12)');
    x.fillStyle = gl; x.fillRect(-s * 1.2, -s * 1.2, s * 2.4, s * 2.4);
    const vein = back ? rgba(mix(inner, [255, 246, 230], 0.5), 0.75) : rgba(mix(outer, [60, 10, 10], 0.35), 0.55);
    x.strokeStyle = vein; x.lineWidth = 1.2;
    x.beginPath();
    for (const [th, len] of sh.lobes) { x.moveTo(0, 0); x.lineTo(Math.sin(th) * len * s * 0.88, -Math.cos(th) * len * s * 0.88); }
    x.stroke();
    x.lineWidth = 0.7; x.globalAlpha = 0.65;
    x.beginPath();
    for (const [th, len] of sh.lobes) {
      for (const at of [0.34, 0.6]) {
        const bx = Math.sin(th) * len * s * at, by = -Math.cos(th) * len * s * at, sl = len * s * 0.2;
        for (const d of [-1, 1]) { const a = th + d * 0.62; x.moveTo(bx, by); x.lineTo(bx + Math.sin(a) * sl, by - Math.cos(a) * sl); }
      }
    }
    x.stroke();
    x.restore();
    x.strokeStyle = rgba(mix(outer, [40, 6, 6], 0.4), L ? 0.6 : 0.45); x.lineWidth = 1; x.stroke(path);
    K.cache.set(key, c);
    return c;
  }

  /** A shaft of light (white): nothing near the sun, strongest some way out where it has come through the leaves, then fading. */
  function rayTex() {
    const key = 'atRay';
    if (K.cache.has(key)) return K.cache.get(key);
    const Wt = 256, Ht = 64, c = K.mk(Wt, Ht), x = c.getContext('2d'), img = x.createImageData(Wt, Ht), d = img.data;
    for (let i = 0; i < Wt; i++) {
      const k = i / Wt, e0 = clamp((k - 0.1) / 0.32, 0, 1), env = e0 * e0 * (3 - 2 * e0) * (1 - k) ** 1.2 * 1.6, wd = 3 + 24 * k;
      for (let j = 0; j < Ht; j++) {
        const o = (j * Wt + i) * 4, dy = (j + 0.5 - Ht / 2) / wd;
        d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * env * Math.exp(-dy * dy));
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }
  function glowTex() {
    const key = 'atGlow';
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,0.5)'); g.addColorStop(0.55, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }

  /* ---------- the trees ---------- */

  /**
   * A maple beside the lane, in world metres. The trunk rises from flaring roots, leaning in a little, and splits into
   * three limbs (sometimes a fourth, lower one) that share its girth; each limb curves up and out toward its part of
   * the crown and forks again, every branch thinner than the one it grew from, until it ends among the leaves.
   * Points are [x, y, z, width]; a branch starts exactly where its parent ends, so the tree holds together in depth.
   * The foliage is lobes (rounded masses) set along the outer branches and at their tips. xc: the middle of the path
   * here. Nothing grows into the hollow of the lane, so the crowns of both rows close over it like a vault.
   */
  function plant(R, X, Z, side, xc) {
    const inn = -side, s = 0.82 + R() * 0.4, HA = 2.15, HB = 4.1, far = Z > 22 ? 1.2 : 1, deep = Z > 22 ? 1 : 2;
    const w0 = (0.22 + R() * 0.2) * s, forkY = (1.6 + R() * 1.0) * s, flare = 0.45 + R() * 0.55;
    const lean = inn * (Z < 4 ? 0.03 + R() * 0.08 : 0.06 + R() * 0.32) + (R() - 0.5) * 0.14, bend = (R() - 0.5) * 0.4;
    const p = [0, 0, 0, 1, 1, 3, 3, 2][(R() * 8) | 0], p2 = R() < 0.5 ? (p + 1) % 4 : (p + 3) % 4;
    const trunk = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      let w = w0 * (1 - 0.3 * t);
      if (t < 0.25) w *= 1 + flare * ((0.25 - t) / 0.25) ** 2; // the roots flaring into the ground
      trunk.push([X + lean * t + bend * Math.sin(Math.PI * t) * 0.5, forkY * t, Z, w]);
    }
    const branches = [], lobes = [];
    const inside = (x, y, m) => ((x - xc) / (HA + m)) ** 2 + (y / (HB + m)) ** 2 < 1;
    const lobe = (x, y, z, r) => {
      for (let k = 0; k < 8 && inside(x, y, r * 0.5); k++) { const ox = (x - xc) / HA, oy = Math.max(0.25, y / HB), ol = Math.hypot(ox, oy); x += (ox / ol) * 0.2; y += (oy / ol) * 0.2; } // up, out of the hollow
      lobes.push({ x, y, z, r: r * far, p: R() < 0.75 ? p : p2, v: (R() * 3) | 0, fl: R() < 0.5 });
    };
    const grow = (from, dir, len, w, depth, tgt) => {
      let [x, y, z] = from, [dx, dy, dz] = dir;
      const pts = [[x, y, z, w]], n = 4, sl = len / n;
      for (let i = 1; i <= n; i++) {
        const tx = tgt[0] - x, ty = tgt[1] - y, tz = tgt[2] - z, tl = Math.hypot(tx, ty, tz) || 1;
        dx += (tx / tl - dx) * 0.28 + (R() - 0.5) * 0.16; dy += (ty / tl - dy) * 0.28 + (R() - 0.5) * 0.1 + 0.03; dz += (tz / tl - dz) * 0.28 + (R() - 0.5) * 0.1;
        let dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
        if (inside(x + dx * sl, y + dy * sl, 0.3)) { // the hollow of the lane ahead: turn up and away from it
          const ox = (x - xc) / HA, oy = Math.max(0.3, y / HB), ol = Math.hypot(ox, oy);
          dx = dx * 0.3 + (ox / ol) * 0.7; dy = dy * 0.3 + (oy / ol) * 0.7; dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        }
        x += dx * sl; y += dy * sl; z += dz * sl;
        pts.push([x, y, z, w * (1 - 0.42 * (i / n))]);
        if ((depth <= 1 && (i === 2 || i === 4)) || (depth === 2 && i >= 3 && R() < 0.75)) lobe(x, y, z, (0.5 + R() * 0.3) * s);
      }
      branches.push(pts);
      if (depth <= 0) { lobe(x, y, z, (0.68 + R() * 0.37) * s); return; }
      const nk = R() < 0.35 ? 3 : 2, we = w * 0.58 * (nk === 2 ? 0.76 : 0.63); // the forks share the girth between them
      for (let j = 0; j < nk; j++) {
        const t2 = [tgt[0] + (R() - 0.5) * 2.4 * s, tgt[1] + (R() - 0.35) * 1.6 * s, tgt[2] + (R() - 0.5) * 2.0 * s];
        const sp = (j - (nk - 1) / 2) * 0.65 + (R() - 0.5) * 0.3, c2 = Math.cos(sp), s2 = Math.sin(sp);
        grow([x, y, z], [dx * c2 - dy * s2, dx * s2 + dy * c2, dz + (R() - 0.5) * 0.4], len * (0.6 + R() * 0.16), we, depth - 1, t2);
      }
    };
    const top = trunk[8], wl = top[3], zr = () => Z + (R() - 0.5) * 0.8;
    grow(top, [inn * 0.5, 0.86, 0], 2.5 * s * far, wl * 0.62, deep, [top[0] + inn * (2.3 + R() * 0.6) * s, forkY + (3.2 + R() * 0.6) * s, zr()]); // arching over the lane
    grow(top, [inn * 0.12, 0.99, 0], 2.3 * s * far, wl * 0.6, deep, [top[0] + inn * (0.5 + R() * 0.5) * s, forkY + (3.8 + R() * 0.6) * s, zr()]); // up
    grow(top, [-inn * 0.5, 0.86, 0], 2.0 * s, wl * 0.5, 1, [top[0] - inn * (1.4 + R() * 0.5) * s, forkY + (2.5 + R() * 0.5) * s, zr()]); // out, away from it
    if (Z < 12 && R() < 0.55) { const b = trunk[6]; grow(b, [inn * 0.7, 0.7, 0], 1.8 * s, b[3] * 0.45, 1, [b[0] + inn * 1.9 * s, b[1] + 1.8 * s, Z]); } // a lower limb leaning over the edge of the path
    lobes.sort((a, b) => b.z + b.y * 0.15 - (a.z + a.y * 0.15)); // the far side of the crown first, then from the top down
    return { X, Z, side, inn, s, w0, trunk, branches, lobes };
  }

  /* ---------- the still scenery ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), M = L ? 'L' : 'D', R = K.rng(1029), q0 = bg.dpr || 1;
    const f = Math.max(W * 0.5, H * 0.62), hy = Math.round(H * 0.54), vx = W * 0.56;
    const pr = (X, Y, Z) => [vx + (f * X) / Z, hy + (f * (CAM - Y)) / Z];
    const Xc = (Z) => 0.15 + 0.4 * Math.sin(Z * 0.07 + 1.1), PW = (Z) => 1.3 + 0.12 * Math.sin(Z * 0.31 + 2);
    const sun = [vx - f * 0.035, hy - f * 0.03];
    const ink = L ? [78, 58, 50] : [16, 10, 10], rim = L ? [236, 186, 120] : [255, 178, 102];
    const haze = L ? [238, 210, 178] : [192, 120, 84], Zh = L ? 30 : 26, Z0 = 2;

    /** A layer over part of the scene, drawn in scene coordinates. */
    const part = (x0, y0, x1, y1) => {
      x0 = Math.floor(clamp(x0, 0, W)); y0 = Math.floor(clamp(y0, 0, H)); x1 = Math.ceil(clamp(x1, x0 + 1, W)); y1 = Math.ceil(clamp(y1, y0 + 1, H));
      const [c, x] = K.layer(x1 - x0, y1 - y0, q0), q = c.width / (x1 - x0);
      x.imageSmoothingQuality = 'high'; // masses of foliage are set at many sizes
      x.translate(-x0, -y0);
      return { c, x, q, x0, y0, w: x1 - x0, h: y1 - y0 };
    };
    /** One small sprite at (px, py), turned by rot, squashed across (sx) and then down (sy), set straight into the layer. */
    const spr = (P, img, px, py, size, rot, sx, sy) => {
      const k = (size / 32) * P.q, cs = Math.cos(rot) * k, sn = Math.sin(rot) * k;
      P.x.setTransform(cs * sx, sn * sx * sy, -sn, cs * sy, P.q * (px - P.x0), P.q * (py - P.y0));
      P.x.drawImage(img, -16, -16);
    };
    const reset = (P) => P.x.setTransform(P.q, 0, 0, P.q, -P.q * P.x0, -P.q * P.y0);

    // the trees: two staggered rows down the lane, thinning out where it opens onto the evening
    const trees = [];
    for (const side of [-1, 1]) {
      let Z = side < 0 ? 2.5 + R() * 0.25 : 3.8 + R() * 0.6;
      while (Z < 46) { trees.push(plant(R, Xc(Z) + side * (PW(Z) + 1.5 + R() * 0.7), Z, side, Xc(Z))); Z += (3.6 + R() * 2) * (1 + Z / 70); }
    }
    // silver grass (억새) in clumps along the verges, its plumes lit from behind
    for (let i = 0, n = pv ? 0 : Math.round(clamp(W / 32, 20, 56)); i < n; i++) {
      const sg = R() < 0.5 ? -1 : 1, Z = 4.5 + R() ** 1.3 * 32;
      trees.push({ reed: true, Z, X: Xc(Z) + sg * (PW(Z) + 0.35 + R() * 3.4), h: 0.85 + R() * 0.6, lean: (R() - 0.35) * 0.5, n: 2 + ((R() * 4) | 0), seed: 1 + ((R() * 1e6) | 0) });
    }
    trees.sort((a, b) => b.Z - a.Z);

    /**
     * A limb, trunk or branch as one smooth shape tapering along its length (world points [x, y, z, width]),
     * rounded where it leaves its parent and where it ends.
     */
    const tube = (c, pts, caps) => {
      const S = pts.map(([x, y, z, w]) => { const [sx, sy] = pr(x, y, z); return [sx, sy, Math.max(pv ? 0.22 : 0.32, ((f / z) * w) / 2)]; });
      const Q = [];
      for (let i = 0; i < S.length - 1; i++) { // through the points on a smooth curve
        const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
        for (let j = 0; j < 3; j++) {
          const t = j / 3, t2 = t * t, t3 = t2 * t;
          Q.push([0, 1, 2].map((m) => 0.5 * (2 * p1[m] + (p2[m] - p0[m]) * t + (2 * p0[m] - 5 * p1[m] + 4 * p2[m] - p3[m]) * t2 + (3 * p1[m] - p0[m] - 3 * p2[m] + p3[m]) * t3)));
        }
      }
      Q.push(S[S.length - 1]);
      const Nn = Q.map((q, i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1; return [-dy / dl, dx / dl]; });
      const body = new Path2D();
      Q.forEach((q, i) => (i ? body.lineTo(q[0] + Nn[i][0] * q[2], q[1] + Nn[i][1] * q[2]) : body.moveTo(q[0] + Nn[i][0] * q[2], q[1] + Nn[i][1] * q[2])));
      for (let i = Q.length - 1; i >= 0; i--) body.lineTo(Q[i][0] - Nn[i][0] * Q[i][2], Q[i][1] - Nn[i][1] * Q[i][2]);
      body.closePath();
      c.fill(body);
      if (caps) { c.beginPath(); for (const q of caps === 'top' ? [Q[Q.length - 1]] : [Q[0], Q[Q.length - 1]]) { c.moveTo(q[0] + q[2], q[1]); c.arc(q[0], q[1], q[2], 0, TAU); } c.fill(); }
      return { body, Q, Nn };
    };

    /** One mass of foliage. */
    const mass = (P, x, y, lr, p, v, fl) => {
      const s = (lr / 75) * P.q;
      P.x.setTransform(fl ? -s : s, 0, 0, s, P.q * (x - P.x0), P.q * (y - P.y0));
      P.x.drawImage(clumpSprite(p, v, M), -128, -128);
    };
    const lobeDraw = (P, lb) => {
      const [x, y] = pr(lb.x, lb.y, lb.z), lr = (f / lb.z) * lb.r, e = lr > 140 ? lr + 240 : lr * 1.75;
      if (x + e < P.x0 || x - e > P.x0 + P.w || y + e < P.y0 || y - e > P.y0 + P.h) return;
      if (lr <= 140) { mass(P, x, y, lr, lb.p, lb.v, lb.fl); return; }
      for (let i = 0, n = Math.min(9, Math.ceil((lr / 120) ** 2 * 1.6)); i < n; i++) { // too big for one mass close up: several smaller ones
        const a = (i / n) * TAU + R(), d = i ? (lr - 100) * Math.sqrt(R()) : 0;
        mass(P, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 105 + R() * 25, lb.p, (lb.v + i) % 3, R() < 0.5);
      }
    };

    const drawTree = (P, T) => {
      const c = P.x, tw = (f / T.Z) * T.w0;
      c.fillStyle = rgb(ink);
      const tr = tube(c, T.trunk, 'top');
      if (tw > 3) { // round: the side toward the lane catches the light, the far side turns into shade; bark runs up it
        const mid = tr.Q.length >> 1, q = tr.Q[mid], nn = tr.Nn[mid], a = [q[0] + nn[0] * q[2], q[1] + nn[1] * q[2]], b = [q[0] - nn[0] * q[2], q[1] - nn[1] * q[2]];
        const [l, r] = a[0] < b[0] ? [a, b] : [b, a], lit = rgba(rim, L ? 0.22 : 0.09), dark = L ? 'rgba(40,24,20,0.24)' : 'rgba(0,0,0,0.28)';
        const sh = c.createLinearGradient(l[0], l[1], r[0], r[1]);
        sh.addColorStop(0, T.inn > 0 ? dark : lit); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, T.inn > 0 ? lit : dark);
        c.fillStyle = sh; c.fill(tr.body);
        if (tw > 7) {
          c.save(); c.clip(tr.body); c.lineCap = 'round';
          for (let j = 0, nb = Math.min(10, Math.round(tw / 4)); j < nb; j++) {
            const o = (R() * 2 - 1) * 0.8, i0 = (R() * tr.Q.length * 0.5) | 0, i1 = Math.min(tr.Q.length - 1, i0 + 4 + ((R() * tr.Q.length * 0.5) | 0));
            c.strokeStyle = rgba(R() < 0.5 ? (L ? mix(ink, [255, 240, 220], 0.25) : mix(ink, [120, 84, 64], 0.35)) : L ? mix(ink, [0, 0, 0], 0.25) : [0, 0, 0], (0.16 + R() * 0.18).toFixed(2));
            c.lineWidth = Math.max(0.5, tw * (0.02 + R() * 0.025));
            c.beginPath();
            for (let i = i0; i <= i1; i++) { const qq = tr.Q[i], n2 = tr.Nn[i], oo = o + Math.sin(i * 0.9 + j) * 0.06; if (i === i0) c.moveTo(qq[0] + n2[0] * qq[2] * oo, qq[1] + n2[1] * qq[2] * oo); else c.lineTo(qq[0] + n2[0] * qq[2] * oo, qq[1] + n2[1] * qq[2] * oo); }
            c.stroke();
          }
          c.restore();
        }
        c.fillStyle = rgb(ink);
      }
      for (const b of T.branches) tube(c, b, true);
      if (tw > 1.5) { // grass round its foot, standing in front of it
        const k = f / T.Z;
        for (let i = 0, n = 4 + ((R() * 4) | 0); i < n; i++) {
          const [x, y] = pr(T.trunk[0][0] + (R() - 0.5) * T.w0 * 3.4, 0, T.Z - 0.12 - R() * 0.35), sz = k * (0.18 + R() * 0.22) * clamp(T.Z / 5, 0.65, 1), kk = (sz / 60) * P.q;
          c.setTransform(R() < 0.5 ? -kk : kk, 0, 0, kk, P.q * (x - P.x0), P.q * (y - P.y0)); c.drawImage(tuftSprite((R() * 4) | 0, T.Z > 11 ? 1 : 0, M), -32, -64);
        }
        reset(P);
      }
      reset(P);
      if (!T.lobes.length) return;
      // the crown, put together on its own first so that it is lit as one: lighter on top, in shade underneath,
      // and where its edge faces the low sun a bright rim (the light coming through the outer leaves)
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, cx = 0, cy = 0;
      for (const lb of T.lobes) {
        const [x, y] = pr(lb.x, lb.y, lb.z), lr = (f / lb.z) * lb.r, e = lr > 140 ? lr + 240 : lr * 1.75;
        x0 = Math.min(x0, x - e); x1 = Math.max(x1, x + e); y0 = Math.min(y0, y - e); y1 = Math.max(y1, y + e); cx += x; cy += y;
      }
      cx /= T.lobes.length; cy /= T.lobes.length;
      const q = P.q, dx0 = clamp(Math.floor((x0 - P.x0) * q), 0, P.c.width), dy0 = clamp(Math.floor((y0 - P.y0) * q), 0, P.c.height);
      const dw = clamp(Math.ceil((x1 - P.x0) * q), 0, P.c.width) - dx0, dh = clamp(Math.ceil((y1 - P.y0) * q), 0, P.c.height) - dy0;
      if (dw < 1 || dh < 1) return;
      const A = P.sa, B = P.sb, pal = PAL[M][T.lobes[0].p];
      A.x.setTransform(1, 0, 0, 1, 0, 0); A.x.clearRect(dx0, dy0, dw, dh);
      for (const lb of T.lobes) lobeDraw(A, lb);
      reset(A);
      const top = Math.max(y0 + (y1 - y0) * 0.15, P.y0), bot = Math.min(y1 - (y1 - y0) * 0.1, P.y0 + P.h), sh = A.x.createLinearGradient(0, top, 0, Math.max(top + 1, bot));
      sh.addColorStop(0, rgba(pal[3], L ? 0.14 : 0.13)); sh.addColorStop(0.45, rgba(pal[2], 0)); sh.addColorStop(1, rgba(mix(pal[0], [0, 0, 0], 0.4), L ? 0.32 : 0.5));
      A.x.globalCompositeOperation = 'source-atop'; A.x.fillStyle = sh; A.x.fillRect(x0, y0, x1 - x0, y1 - y0); A.x.globalCompositeOperation = 'source-over';
      let sdx = sun[0] - cx, sdy = sun[1] - cy;
      const sl = Math.hypot(sdx, sdy) || 1, glowK = Math.exp(-sl / (u * 0.8)), off = clamp((f / T.Z) * 0.025, 0.7, 3) * q;
      sdx /= sl; sdy /= sl;
      B.x.setTransform(1, 0, 0, 1, 0, 0); B.x.clearRect(dx0, dy0, dw, dh);
      B.x.drawImage(A.c, dx0, dy0, dw, dh, dx0, dy0, dw, dh);
      B.x.globalCompositeOperation = 'source-in'; B.x.fillStyle = L ? 'rgb(255,242,214)' : rgb(mix(pal[4], [255, 196, 112], 0.35)); B.x.fillRect(dx0, dy0, dw, dh); B.x.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = L ? 0.5 : 0.1 + 0.42 * glowK;
      c.drawImage(B.c, dx0, dy0, dw, dh, dx0 + (L ? 0 : sdx * off), dy0 + (L ? -off : sdy * off), dw, dh);
      c.globalAlpha = 1;
      c.drawImage(A.c, dx0, dy0, dw, dh, dx0, dy0, dw, dh);
      reset(P);
    };

    /** A clump of silver grass: stalks bowed under their plumes, fine strands hanging from the top, lit from behind. */
    const drawReeds = (P, rd) => {
      const c = P.x, k = f / rd.Z, Q = K.rng(rd.seed), plume = L ? [204, 184, 144] : [236, 212, 166];
      c.lineCap = 'round';
      for (let j = 0; j < rd.n; j++) {
        const x0 = rd.X + (Q() - 0.5) * 0.3, h = rd.h * (0.75 + Q() * 0.35), lean = rd.lean + (Q() - 0.5) * 0.25;
        const [bx, by] = pr(x0, 0, rd.Z), [mx, my] = pr(x0 + lean * 0.3, h * 0.6, rd.Z), [tx, ty] = pr(x0 + lean, h, rd.Z);
        c.strokeStyle = L ? 'rgb(150,124,84)' : 'rgb(100,74,38)'; c.lineWidth = Math.max(0.4, k * 0.011);
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(mx, my, tx, ty); c.stroke();
        const ph = k * h * 0.3, ux = tx - mx, uy = ty - my, ul = Math.hypot(ux, uy) || 1, up = Math.atan2(uy / ul, ux / ul), hang = lean >= 0 ? 1 : -1;
        c.lineWidth = Math.max(0.35, k * 0.006);
        for (let q = 0; q < 11; q++) {
          const t = q / 11, sx = tx - (ux / ul) * ph * t * 0.85, sy = ty - (uy / ul) * ph * t * 0.85, ln = ph * (0.3 + Q() * 0.3) * (1 - t * 0.45);
          const ang = up + hang * (0.5 + Q() * 0.5) + (q % 2 ? 0.25 : -0.15); // the strands spray out to the side it leans to, then droop
          c.strokeStyle = rgba(plume, (0.32 + Q() * 0.3).toFixed(2));
          c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + Math.cos(ang) * ln * 0.55, sy + Math.sin(ang) * ln * 0.55, sx + Math.cos(ang) * ln, sy + Math.sin(ang) * ln + ln * 0.35); c.stroke();
        }
      }
    };

    /** Trees (and grass) in one layer, cut to what they cover, haze laid over each in turn as the next, nearer one goes in. */
    const group = (items) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const grow = (x, y, r) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
      for (const T of items) {
        if (T.reed) { const [bx, by] = pr(T.X, 0, T.Z), k = f / T.Z; grow(bx, by - k * T.h * 0.5, k * (T.h * 0.75 + 0.6)); continue; }
        for (const b of [T.trunk, ...T.branches]) for (const q of b) { const [x, y] = pr(q[0], q[1], q[2]); grow(x, y, (f / q[2]) * q[3] + 3); }
        { const [x, y] = pr(T.trunk[0][0], 0, T.Z - 0.5); grow(x, y, (f / T.Z) * (T.w0 * 2 + 0.5)); } // the grass at its foot
        for (const lb of T.lobes) { const [x, y] = pr(lb.x, lb.y, lb.z), lr = (f / lb.z) * lb.r; grow(x, y, lr > 140 ? lr + 240 : lr * 1.75 + 4); }
      }
      const P = part(x0, y0, x1, y1), scratch = () => { const c = K.mk(P.c.width, P.c.height), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return { c, x, q: P.q, x0: P.x0, y0: P.y0, w: P.w, h: P.h }; };
      P.sa = scratch(); P.sb = scratch(); // where each crown is put together (only while building)
      const fog = (a) => {
        if (a < 0.002) return;
        P.x.globalCompositeOperation = 'source-atop'; P.x.fillStyle = rgba(haze, a.toFixed(3)); P.x.fillRect(P.x0, P.y0, P.w, P.h); P.x.globalCompositeOperation = 'source-over';
      };
      items.forEach((T, i) => { if (T.reed) drawReeds(P, T); else drawTree(P, T); fog(1 - Math.exp(-(T.Z - (i + 1 < items.length ? items[i + 1].Z : Z0)) / Zh)); });
      P.sa = P.sb = null;
      return P;
    };
    const far = group(trees.filter((T) => T.Z > 13)), mid = group(trees.filter((T) => T.Z > 5.5 && T.Z <= 13)), near = group(trees.filter((T) => T.Z <= 5.5));

    // the ground: dry grass on the verges, the path a clear lane of bare earth catching the evening light,
    // fallen leaves, trunk shadows and patches of sun
    const G = part(0, hy - 2, W, H), g = G.x;
    {
      const ZS = [];
      for (let Z = 1.2; Z < 160; Z *= 1.05) ZS.push(Z);
      const edge = (Z, sg, kw) => Xc(Z) + sg * PW(Z) * kw + (sg < 0 ? 0.07 : 0.05) * Math.sin(Z * 0.16 + sg);
      const pathPoly = (kw) => {
        g.beginPath();
        ZS.forEach((Z, i) => { const [x, y] = pr(edge(Z, -1, kw), 0, Z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        for (let i = ZS.length - 1; i >= 0; i--) { const [x, y] = pr(edge(ZS[i], 1, kw), 0, ZS[i]); g.lineTo(x, y); }
        g.closePath();
      };
      const gw = g.createLinearGradient(0, hy, 0, H); // the grass: golden down the lane where the low sun reaches it, browner and darker toward us
      if (L) { gw.addColorStop(0, 'rgba(232,200,128,0)'); gw.addColorStop(0.05, 'rgba(232,200,128,0.36)'); gw.addColorStop(0.18, 'rgba(222,188,116,0.3)'); gw.addColorStop(1, 'rgba(190,150,86,0.24)'); }
      else { gw.addColorStop(0, 'rgba(226,170,92,0)'); gw.addColorStop(0.04, 'rgba(226,170,92,0.32)'); gw.addColorStop(0.14, 'rgba(180,128,58,0.3)'); gw.addColorStop(0.45, 'rgba(118,82,38,0.25)'); gw.addColorStop(1, 'rgba(40,26,12,0.32)'); }
      g.fillStyle = gw; g.fillRect(0, hy - 2, W, H - hy + 2);
      g.save(); g.globalCompositeOperation = 'destination-out'; // the lane cut out of it, a soft edge
      g.globalAlpha = 0.5; pathPoly(1.05); g.fill(); g.globalAlpha = 1; pathPoly(0.98); g.fill(); g.restore();
      const pg = g.createLinearGradient(0, hy, 0, H);
      if (L) { pg.addColorStop(0, 'rgba(236,206,160,0.3)'); pg.addColorStop(0.1, 'rgba(230,200,160,0.14)'); pg.addColorStop(1, 'rgba(226,196,160,0.1)'); }
      else { pg.addColorStop(0, 'rgba(255,204,140,0.42)'); pg.addColorStop(0.06, 'rgba(255,184,120,0.22)'); pg.addColorStop(0.35, 'rgba(200,140,100,0.11)'); pg.addColorStop(1, 'rgba(120,84,60,0.1)'); }
      g.fillStyle = pg;
      for (const kw of [1.02, 0.9, 0.75]) { g.globalAlpha = 0.34; pathPoly(kw); g.fill(); }
      g.globalAlpha = 1;
      const mot = K.noiseTex('atGround', 384, 192, { px: 8, py: 4, oct: 4, lo: 0.35, hi: 0.8, seed: 23 }); // worn, uneven ground
      g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.4; g.drawImage(mot, 0, hy, W, H - hy); g.restore();
      g.lineCap = 'round'; // a low line where the grass begins
      g.strokeStyle = L ? 'rgba(120,92,60,0.08)' : 'rgba(8,5,3,0.11)';
      for (const sg of [-1, 1]) for (let i = 1; i < ZS.length && ZS[i - 1] < 26; i++) {
        const a = pr(edge(ZS[i - 1], sg, 1), 0, ZS[i - 1]), b = pr(edge(ZS[i], sg, 1), 0, ZS[i]);
        g.lineWidth = Math.max(0.8, (f / ZS[i - 1]) * 0.18); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }

      // tufts of grass over the verges, leaning over the edge of the path here and there; the far ones first
      const tufts = [], nT = pv ? 120 : Math.round(clamp(((W * H) / 40000) * 150, 1500, 6000)), nTn = pv ? 40 : Math.round(clamp((W * (H - hy)) / 700, 200, 1200));
      for (let i = 0; i < nT + nTn; i++) {
        const y = i < nT ? hy + (H - hy + 40) ** R() : hy + (H - hy + 40) * (0.3 + R() * 0.7), x = R() * W, r1 = R(), r2 = R(), r3 = R(), r4 = R();
        const Z = (f * CAM) / Math.max(0.5, y - hy), X = ((x - vx) * Z) / f, d = Math.abs(X - Xc(Z)) / PW(Z);
        if (d < 0.96 || r4 > (d < 1.6 ? 1 : 0.8)) continue; // the lane itself stays clear
        const sz = (f / Z) * (0.22 + r1 * 0.24) * clamp(Z / 5, 0.65, 1);
        if (sz >= 1.4) tufts.push([y, x, sz, Z, r2, r3]);
      }
      tufts.sort((a, b) => a[0] - b[0]);
      for (const [y, x, sz, Z, r2, r3] of tufts) {
        const lit = Z > 11 ? 1 : Z > 5.5 ? (r2 < 0.5 ? 1 : 0) : 0, k = (sz / 60) * G.q;
        g.setTransform(r2 < 0.5 ? -k : k, 0, 0, k, G.q * (x - G.x0), G.q * (y - G.y0));
        g.drawImage(tuftSprite((r3 * 4) | 0, lit, M), -32, -64);
      }
      reset(G);

      // fallen leaves: drifted along the edges of the path, a few out on it, scattered over the grass
      const clump = K.fbm(57, 8, 8, 3), nFar = pv ? 120 : Math.round(clamp(((W * H) / 40000) * 110, 1200, 4000)), nNear = pv ? 60 : Math.round(clamp((W * (H - hy)) / 300, 400, 2400));
      for (let i = 0; i < nFar + nNear; i++) {
        const y = i < nFar ? hy + (H - hy + 8) ** R() : hy + (H - hy) * (0.3 + R() * 0.72), x = R() * W, r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R();
        const Z = (f * CAM) / Math.max(0.5, y - hy), X = ((x - vx) * Z) / f, d = Math.abs(X - Xc(Z)) / PW(Z);
        const keep = (d < 0.75 ? 0.22 : d < 1.25 ? 1 : 0.32) * clamp(1.9 * clump(X * 0.35 + 50, Z * 0.22) - 0.45, 0.05, 1.3);
        if (r5 > keep) continue;
        const sz = ((f * LEAF * (pv ? 1.6 : 1)) / Z) * (0.65 + r1 * 0.6);
        if (sz < 0.7) continue;
        const pal = r2 < 0.38 ? 4 : [0, 1, 2, 3, 0, 1][(r2 * 6) | 0], tone = clamp(Math.floor(r3 * (L ? 3 : 2.5) + (L ? 1 : 0.1)), 0, 4);
        spr(G, dab(pal, tone, r4 < 0.6 ? 0 : 1, M), x, y, sz, r4 * TAU * 7, 1, clamp((CAM / Z) * 1.4, 0.18, 0.8));
      }
      reset(G);

      // trunk shadows reaching toward us, and patches of sun come through the canopy: soft-edged, laid on the ground
      const strip = (X, Z1, Lz, w0, w1, passes) => {
        for (const [kw, kl, a] of passes) {
          const l = Lz * kl, xe = X + 0.06 * l, Ze = Z1 - l, we = ((w0 + (w1 - w0) * kl) * kw) / 2, ws = (w0 * kw) / 2;
          g.globalAlpha = a; g.beginPath();
          let pt = pr(X - ws, 0, Z1); g.moveTo(pt[0], pt[1]);
          for (let j = 0; j <= 8; j++) { const b = Math.PI - (j / 8) * Math.PI; pt = pr(xe + Math.cos(b) * we, 0, Math.max(0.8, Ze - Math.sin(b) * we * 1.6)); g.lineTo(pt[0], pt[1]); }
          pt = pr(X + ws, 0, Z1); g.lineTo(pt[0], pt[1]);
          g.closePath(); g.fill();
        }
        g.globalAlpha = 1;
      };
      g.fillStyle = L ? 'rgb(112,94,112)' : 'rgb(6,3,3)';
      for (const T of trees) if (!T.reed && T.Z > 2.4 && T.Z < 40) strip(T.trunk[0][0], T.Z, Math.min(T.Z - 1.3, 4 + R() * 8), T.w0 * 1.1, T.w0 * 2.2, L ? [[1.7, 1, 0.04], [1.15, 0.85, 0.05], [0.7, 0.7, 0.06]] : [[1.7, 1, 0.07], [1.15, 0.85, 0.08], [0.7, 0.7, 0.1]]);
      const soft = L ? glowTex() : K.tint(glowTex(), '#ffce8c');
      if (L) g.globalCompositeOperation = 'destination-out'; // on a light page the sun wears the shade away
      for (let i = 0; i < (pv ? 6 : 34); i++) {
        const Z = 3.5 + R() ** 1.4 * 34, X = Xc(Z) + (R() * 2 - 1) * PW(Z) * 0.9, rx = 0.2 + R() * 0.4, rz = (0.3 + R() * 0.7) * (0.6 + Z / 25), a = R();
        if (Z - rz < 1.6) continue;
        const [x] = pr(X, 0, Z), y0 = pr(X, 0, Z + rz)[1], y1 = pr(X, 0, Z - rz)[1], ex = (f / Z) * rx * 1.6;
        g.globalAlpha = (L ? 0.34 : 0.21) * (0.6 + 0.4 * a);
        g.drawImage(soft, x - ex, y0 - (y1 - y0) * 0.3, ex * 2, (y1 - y0) * 1.6);
      }
      g.globalAlpha = 1;
      const ed = g.createLinearGradient(0, 0, W, 0), ec = L ? '120,96,70' : '6,4,2'; // darker toward the sides
      ed.addColorStop(0, `rgba(${ec},${L ? 0.16 : 0.42})`); ed.addColorStop(0.3, `rgba(${ec},0)`); ed.addColorStop(0.78, `rgba(${ec},0)`); ed.addColorStop(1, `rgba(${ec},${L ? 0.16 : 0.42})`);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = ed; g.fillRect(0, hy - 2, W, H - hy + 2);
      g.globalCompositeOperation = 'source-over';
    }

    // the sky: the sunset's glow at the end of the lane, a warm wash above (built small: it is all soft)
    const sk = K.mk(Math.max(8, W / 4), Math.max(8, H / 4)), sc = sk.getContext('2d');
    sc.scale(sk.width / W, sk.height / H);
    const wy = hy + f * 0.09, wash = sc.createLinearGradient(0, 0, 0, wy), wk = hy / wy;
    if (L) { wash.addColorStop(0, 'rgba(255,226,190,0)'); wash.addColorStop(wk, 'rgba(255,200,140,0.14)'); wash.addColorStop(1, 'rgba(255,200,140,0)'); }
    else { wash.addColorStop(0, 'rgba(150,80,110,0.035)'); wash.addColorStop(wk, 'rgba(255,150,96,0.07)'); wash.addColorStop(1, 'rgba(255,150,96,0)'); }
    sc.fillStyle = wash; sc.fillRect(0, 0, W, wy);
    K.glow(sc, sun[0], sun[1], u * 0.75, L
      ? [[0, 'rgba(255,214,140,0.55)'], [0.1, 'rgba(255,196,124,0.32)'], [0.32, 'rgba(255,180,124,0.12)'], [0.65, 'rgba(250,180,140,0.035)'], [1, 'rgba(250,180,140,0)']]
      : [[0, 'rgba(255,214,150,0.55)'], [0.09, 'rgba(255,186,116,0.3)'], [0.3, 'rgba(250,140,90,0.11)'], [0.62, 'rgba(220,110,90,0.035)'], [1, 'rgba(220,110,90,0)']], 1.35, 0.85);
    K.glow(sc, sun[0], sun[1], u * 0.06, [[0, L ? 'rgba(255,240,200,0.75)' : 'rgba(255,246,222,0.8)'], [1, 'rgba(255,230,180,0)']]);

    const rays = [];
    const RAYS = [-2.45, -1.95, -1.25, -0.7, 0.32]; // into the hollow of the lane, under the arch
    for (let i = 0, n = pv ? 2 : 5; i < n; i++) rays.push({ ang: RAYS[pv ? i * 2 + 1 : i] + (R() - 0.5) * 0.2, len: u * (0.55 + R() * 0.35), w: u * (0.1 + R() * 0.08), a: (L ? 0.28 : 0.26) * (0.75 + R() * 0.5), sp: 0.0025 + R() * 0.0025, ph: (i / n) * TAU + R() });

    return { W, H, u, f, hy, vx, Xc, PW, sun, sky: sk, far, mid, near, ground: G, rays };
  }

  /* ---------- the leaves in the air ---------- */

  function leaf(cls, V, S, scatter) {
    const z = cls === 'far' ? 13 + RND() * 22 : cls === 'mid' ? 3.4 + RND() * 5 : 1.25 + RND() * 1.1, k = S.f / z;
    const X = S.Xc(z) + (RND() * 2 - 1) * (cls === 'near' ? 2.4 : 4.2), gy = S.hy + k * CAM;
    let y = S.hy + k * (CAM - 3.2 - RND() * 4.5); // where it lets go, up in the crowns
    if (cls === 'near') y = -k * LEAF * 2 - RND() * S.H * 0.4;
    if (scatter) y = cls === 'near' ? RND() * S.H : y + RND() * (gy - y) * 0.9;
    const tumble = RND() < 0.45;
    return { cls, z, k, gy, x: S.vx + k * X, y, sz: Math.max(cls === 'far' ? 1.7 : 3, k * LEAF * 1.15 * (V.pv ? 2.2 : 1)),
      kind: (RND() * 5) | 0, v: RND() < 0.6 ? 0 : 1, rot0: RND() * TAU, rot: 0, flip: RND() * TAU, ph: RND() * TAU, tumble,
      sp: 0.03 + RND() * 0.03, sw: 0.12 + RND() * 0.2, vf: 0.006 + RND() * 0.004, fs: (RND() < 0.5 ? -1 : 1) * (0.03 + RND() * 0.05), vr: (RND() - 0.5) * 0.06,
      a: cls === 'far' ? 0.42 + RND() * 0.16 : cls === 'mid' ? 0.6 + RND() * 0.16 : 0.34 + RND() * 0.1, fade: scatter ? 1 : 0, out: 0 };
  }

  function init(V, S) {
    const area = (S.W * S.H) / 40000, pv = V.pv;
    const st = { kind: 'autumn', key: S.key, far: [], mid: [], near: [], fallen: [], gustWait: 360 + RND() * 500, gustT: 1e9, gustLen: 1, gustDir: 1, release: 0 };
    const n = { far: pv ? 4 : clamp(Math.round(area * 0.7), 8, 30), mid: pv ? 3 : clamp(Math.round(area * 0.42), 6, 18), near: pv ? 0 : clamp(Math.round(area * 0.06), 1, 3) };
    for (const cls of ['far', 'mid', 'near']) for (let i = 0; i < n[cls]; i++) st[cls].push(leaf(cls, V, S, true));
    for (let i = 0, m = pv ? 1 : 4; i < m; i++) { // a few lying on the path already
      const z = 3.4 + RND() * 5, k = S.f / z;
      st.fallen.push({ x: S.vx + k * (S.Xc(z) + (RND() * 2 - 1) * S.PW(z) * 0.8), y: S.hy + k * CAM, z, k, sz: k * LEAF * 1.15 * (pv ? 2.2 : 1), rot: RND() * TAU, sq: clamp((CAM / z) * 1.3, 0.2, 0.75), kind: (RND() * 5) | 0, v: RND() < 0.6 ? 0 : 1, back: RND() < 0.3, age: 30 + RND() * 400, life: 900 + RND() * 1400, a: 0.75, mob: RND() });
    }
    return st;
  }

  /**
   * The still scenery. A new size is built only once it has held for a few frames (a window being dragged wider would
   * otherwise rebuild it every frame); until then the old scenery is stretched to fit.
   */
  function scenery(bg, V) {
    const L = K.light(), key = `autumn:${V.W}x${V.H}@${bg.dpr}${L ? 'L' : 'D'}`;
    let S = bg.scene;
    if (S && S.key === key) return S;
    if (S && S.kind === 'autumn' && S.mode === (L ? 'L' : 'D') && S.dpr === bg.dpr && !V.pv && !S.pv) {
      if (bg.atPend !== key) { bg.atPend = key; bg.atWait = 0; }
      if (++bg.atWait < 8) return S;
    }
    S = bg.scene = build(bg, V);
    Object.assign(S, { key, kind: 'autumn', mode: L ? 'L' : 'D', dpr: bg.dpr, pv: V.pv });
    return S;
  }

  window.BG_EXT.autumn = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1.7), L = K.light(), pv = V.pv, M = L ? 'L' : 'D';
    const S = scenery(bg, V), { W, H, u } = S;
    let st = bg.st;
    if (!st || st.kind !== 'autumn' || st.key !== S.key) st = bg.st = init(V, S);
    const k7 = u / 700;

    // the wind: a light breath from the left, and now and then a gust that shakes leaves loose
    if (!pv && --st.gustWait <= 0) { st.gustWait = 650 + RND() * 900; st.gustT = 0; st.gustLen = 130 + RND() * 110; st.gustDir = RND() < 0.75 ? 1 : -1; st.release = 4 + ((RND() * 4) | 0); }
    let gust = 0;
    if (st.gustT < st.gustLen) { gust = Math.sin((Math.PI * st.gustT) / st.gustLen) ** 2; st.gustT++; }
    const wind = 0.0035 + 0.0025 * Math.sin(t * 0.0031) + gust * 0.026 * st.gustDir; // metres a frame
    if (st.release > 0 && gust > 0.3 && RND() < 0.12) { st.release--; const p = leaf('mid', V, S, false); p.extra = true; p.fs *= 1.8; st.mid.push(p); }

    const step = (p, list, i) => {
      if (p.out > 0) { // come to rest among the leaves on the ground: it fades into them
        p.out -= 0.05;
        if (p.out <= 0) { if (p.extra) list.splice(i, 1); else list[i] = leaf(p.cls, V, S, false); return false; }
        return true;
      }
      if (p.fade < 1) p.fade = Math.min(1, p.fade + 0.03);
      p.ph += p.sp * (1 + gust * 1.5);
      let vy, vx;
      if (p.tumble) { // turning over and over: edge-on it slips down faster
        p.flip += p.fs * (1 + gust * 1.2); p.rot += p.vr + wind * 2 + gust * 0.03 * st.gustDir;
        vy = p.vf * (1.35 - 0.7 * Math.abs(Math.cos(p.flip))); vx = Math.sin(p.ph) * p.sw * 0.25 * p.sp;
      } else { // rocking: it swings from side to side, dropping fastest through the middle of each swing
        p.rot = p.rot0 + 0.6 * Math.sin(p.ph) + gust * 0.5 * st.gustDir; p.flip = 0.35 * Math.sin(p.ph * 0.5 + p.rot0);
        vy = p.vf * (0.25 + 1.3 * Math.cos(p.ph) ** 2); vx = Math.cos(p.ph) * p.sw * p.sp;
      }
      p.x += p.k * (wind * (p.cls === 'near' ? 1.3 : 1) + vx); p.y += p.k * vy;
      const m = p.sz * 2;
      if (p.x > W + m) p.x -= W + m * 2; else if (p.x < -m) p.x += W + m * 2;
      if (p.cls !== 'near' && p.y >= p.gy) { // it reaches the ground: on the path it stays a while, elsewhere it joins the litter
        const X = (p.x - S.vx) / p.k;
        if (p.cls === 'mid' && Math.abs(X - S.Xc(p.z)) < S.PW(p.z) * 1.05 && st.fallen.length < (pv ? 2 : 10)) {
          st.fallen.push({ x: p.x, y: p.gy, z: p.z, k: p.k, sz: p.sz, rot: p.rot, sq: clamp((CAM / p.z) * 1.3, 0.2, 0.75), kind: p.kind, v: p.v, back: Math.cos(p.flip) < 0, age: 0, life: 900 + RND() * 1400, a: p.a, mob: RND() });
          if (p.extra) { list.splice(i, 1); return false; }
          list[i] = leaf(p.cls, V, S, false);
          return false;
        }
        p.out = 1;
      }
      if (p.cls === 'near' && p.y > H + m) { list[i] = leaf('near', V, S, false); return false; }
      return true;
    };
    const draw = (p, opaque) => {
      const fl = Math.cos(p.flip), sx = Math.abs(fl) < 0.12 ? (fl < 0 ? -0.12 : 0.12) : fl, d = (p.sz * 96) / 59;
      const a = p.a * p.fade * (p.out > 0 ? p.out : 1) * (0.72 + 0.28 * Math.abs(fl));
      if (a < 0.01) return;
      const img = leafSprite(p.kind, p.v, fl < 0 ? 1 : 0, M, p.cls === 'near' ? 2.2 : 0);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sx, 1);
      if (opaque) K.stamp(ctx, img, -d / 2, (-d * 44) / 96, d, d, a);
      else { ctx.globalAlpha = a; ctx.drawImage(img, -d / 2, (-d * 44) / 96, d, d); }
      ctx.restore();
    };
    const pass = (list, opaque) => { for (let i = list.length - 1; i >= 0; i--) if (step(list[i], list, i)) draw(list[i], opaque); };

    ctx.save(); ctx.translate(0, -V.oy);
    if (W !== V.W || H !== V.H) ctx.scale(V.W / W, V.H / H); // a new size not built yet

    // 1. the sky's glow, breathing very slowly
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 0.004); ctx.drawImage(S.sky, 0, 0, W, H); ctx.globalAlpha = 1;

    // 2. the ground, and the leaves lying on the path (a gust slides them along)
    const G = S.ground;
    K.stamp(ctx, G.c, G.x0, G.y0, G.w, G.h, L ? 0.55 : 0.78);
    for (let i = st.fallen.length - 1; i >= 0; i--) {
      const f = st.fallen[i];
      f.age++;
      if (gust > 0.05 && f.mob > 0.35) { f.x += gust * st.gustDir * f.k * 0.012 * f.mob; f.rot += gust * 0.025 * st.gustDir * f.mob; }
      const a = f.a * Math.min(1, f.age / 12) * Math.min(1, (f.life - f.age) / 90);
      if (f.age >= f.life || f.x < -f.sz * 2 || f.x > W + f.sz * 2) { st.fallen.splice(i, 1); continue; }
      const d = (f.sz * 96) / 59;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1, f.sq); ctx.rotate(f.rot);
      K.stamp(ctx, leafSprite(f.kind, f.v, f.back ? 1 : 0, M, 0), -d / 2, (-d * 44) / 96, d, d, a * (L ? 0.75 : 0.62));
      ctx.restore();
    }

    // 3. down the lane: the far trees in the haze, their leaves, mist lying across the lane
    const F = S.far;
    K.stamp(ctx, F.c, F.x0, F.y0, F.w, F.h, L ? 0.38 : 0.62);
    pass(st.far, false);
    const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#f0c49c');
    K.mist(ctx, fog, W, S.hy - u * 0.05, u * 0.1, u * 1.5, t * 0.05 * k7, L ? 0.5 : 0.075);

    // 4. the middle trees and the leaves among them
    const Mi = S.mid;
    K.stamp(ctx, Mi.c, Mi.x0, Mi.y0, Mi.w, Mi.h, L ? 0.44 : 0.54);
    pass(st.mid, true);

    // 5. the sun's haze, lying over the trees down the lane
    const gl = glowTex(), gr = u * 0.42;
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    ctx.globalAlpha = L ? 0.3 : 0.12; ctx.drawImage(L ? gl : K.tint(gl, '#ffbe82'), S.sun[0] - gr * 1.3, S.sun[1] - gr, gr * 2.6, gr * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 6. the trees beside us
    const N = S.near;
    K.stamp(ctx, N.c, N.x0, N.y0, N.w, N.h, L ? 0.5 : 0.58);

    // 7. shafts of light coming and going through the canopy, in the air between us and the trees
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    const ray = L ? rayTex() : K.tint(rayTex(), '#ffc890');
    for (const r of S.rays) {
      const a = r.a * Math.max(0, Math.sin(t * r.sp + r.ph)) ** 4; // each comes and goes over a minute or so, seldom two at once
      if (a < 0.004) continue;
      ctx.save(); ctx.translate(S.sun[0], S.sun[1]); ctx.rotate(r.ang + 0.02 * Math.sin(t * 0.0021 + r.ph));
      ctx.globalAlpha = a; ctx.drawImage(ray, 0, -r.w / 2, r.len, r.w);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 8. a leaf or two drifting past close to the glass
    pass(st.near, true);
    ctx.restore();
  };
})();
