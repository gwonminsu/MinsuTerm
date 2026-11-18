'use strict';
/*
 * 대나무 숲: a bamboo grove in the morning mist. Culms stand at four depths: a pale wall lost in the haze, thin
 * ones behind, a scatter in the middle distance and a few large ones close by, each swaying out of step with
 * its neighbours. Their nodes are ridged with a pale bloom under each and curve the way rings do above and below
 * the eye; branches arch out from the upper nodes under fans of leaves that tremble on their own. Mist drifts
 * between the depths, soft shafts of sun slant down through the gaps from the top right (motes turning in them),
 * a leaf now and then comes down tumbling, and every half minute or so a gust runs through the grove from one
 * side to the other, shaking a few more loose. On a light page it is a pale morning in ink-wash greens, the mist
 * wearing the far culms away to the page.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('bamboo'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /**
   * The colours. ink: the nearest culms; air: what the far ones fade into; sheen: light on the lit side; bloom:
   * the waxy band under a node; olive: where old culms drift to. fog / alpha per depth: haze wall, far, middle, near.
   */
  function palette(L) {
    return L
      ? { ink: [34, 60, 46], deep: [14, 28, 20], air: [206, 218, 210], sheen: [226, 236, 220], bloom: [244, 248, 242], olive: [96, 98, 54],
        leaf: [36, 74, 50], fall: [[78, 112, 74], [118, 124, 70], [134, 116, 74]], sun: [255, 228, 176],
        fog: [0.8, 0.56, 0.27, 0.05], alpha: [0.2, 0.32, 0.46, 0.56] }
      : { ink: [6, 14, 10], deep: [0, 3, 2], air: [104, 128, 116], sheen: [112, 152, 106], bloom: [150, 172, 160], olive: [30, 33, 14],
        leaf: [8, 22, 13], fall: [[100, 128, 78], [146, 144, 82], [166, 132, 76]], sun: [244, 232, 196],
        fog: [0.78, 0.52, 0.24, 0.03], alpha: [0.34, 0.62, 0.86, 0.93] };
  }

  /* ---------- sprites ---------- */

  /** A shaft of sun: a soft band a little wider below, strongest where it crosses the mist, streaked along its length. */
  function shaftSpr() {
    if (K.cache.has('bmShaft')) return K.cache.get('bmShaft');
    const SW = 64, SH = 256, c = K.mk(SW, SH), x = c.getContext('2d'), img = x.createImageData(SW, SH), d = img.data, f = K.fbm(61, 5, 2, 3);
    for (let j = 0; j < SH; j++) {
      const v = (j + 0.5) / SH, half = 0.62 + 0.38 * v, fall = Math.sin(Math.PI * Math.min(1, v * 1.04)) ** 0.8 * (0.5 + 0.5 * Math.min(1, v * 2.4));
      for (let i = 0; i < SW; i++) {
        const s = (((i + 0.5) / SW) * 2 - 1) / half;
        if (s <= -1 || s >= 1) continue;
        const prof = (1 - s * s) ** 1.6, streak = 0.4 + 0.6 * f((s + 1) * 2.5, v * 1.4);
        const o = (j * SW + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * prof * streak * fall);
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = 'bmShaft';
    K.cache.set('bmShaft', c);
    return c;
  }
  /** How strong the shaft sprite is along its length (v 0..1): the same falloff, for motes and leaves in the beam. */
  const shaftFall = (v) => Math.sin(Math.PI * Math.min(1, v * 1.04)) ** 0.8 * (0.5 + 0.5 * Math.min(1, v * 2.4));

  /** A mote of dust or pollen: a tiny soft point. */
  function moteSpr() {
    if (K.cache.has('bmMote')) return K.cache.get('bmMote');
    const c = K.mk(16, 16), x = c.getContext('2d'), g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,250,232,1)'); g.addColorStop(0.3, 'rgba(255,246,220,0.55)'); g.addColorStop(1, 'rgba(255,246,220,0)');
    x.fillStyle = g; x.fillRect(0, 0, 16, 16);
    K.cache.set('bmMote', c);
    return c;
  }

  /** A bamboo leaf from (x, y) along a: a short stalk, a long blade tapering to a fine point; bend curls the tip. */
  function leaf(c, x, y, a, len, wid, bend, fill, rib, stalk) {
    c.save(); c.translate(x, y); c.rotate(a);
    if (stalk) { c.strokeStyle = stalk; c.lineWidth = Math.max(0.5, wid * 0.32); c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.09, 0); c.stroke(); }
    c.beginPath();
    c.moveTo(len * 0.06, 0);
    c.bezierCurveTo(len * 0.2, -wid * 1.1, len * 0.52, -wid * 0.95 + bend * 0.4, len, bend);
    c.bezierCurveTo(len * 0.55, wid * 0.85 + bend * 0.6, len * 0.22, wid * 1.02, len * 0.06, 0);
    c.closePath();
    c.fillStyle = typeof fill === 'function' ? fill(len) : fill; c.fill();
    if (rib) { c.strokeStyle = rib; c.lineWidth = Math.max(0.45, wid * 0.16); c.beginPath(); c.moveTo(len * 0.08, 0); c.quadraticCurveTo(len * 0.5, bend * 0.3, len * 0.84, bend * 0.76); c.stroke(); }
    c.restore();
  }

  /** A falling leaf (96 × 24, the blade along x); lit: as it looks crossing a shaft of sun. */
  function fallSpr(P, tone, L, lit) {
    const key = `bmFall|${tone}|${L ? 'L' : 'D'}|${lit ? 1 : 0}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(96, 24), x = c.getContext('2d'), base = lit ? mix(P.fall[tone], [255, 248, 214], 0.5) : P.fall[tone];
    const fill = (len) => { const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgb(mix(base, P.deep, 0.25))); g.addColorStop(0.5, rgb(base)); g.addColorStop(1, rgb(mix(base, [255, 255, 255], L ? 0.25 : 0.12))); return g; };
    leaf(x, 4, 12, 0, 88, 8.2, 0, fill, rgba(mix(base, L ? P.deep : [255, 250, 220], 0.3), 0.8), rgb(mix(base, P.deep, 0.3)));
    K.cache.set(key, c);
    return c;
  }

  /**
   * A branch with its leaves, as a sprite: it rises steeply from the node, arches out and bows under fans of
   * leaves hanging from its twigs. The node sits at (ox, oy) in the sprite.
   */
  function spraySprite(R, bl, col, q, fine) {
    const segs = [], leaves = [], tips = [];
    let x = 0, y = 0, a = -1.22 - R() * 0.25;
    const n = 6, sl = bl / n, w0 = Math.max(0.6, bl * 0.016);
    for (let i = 0; i < n; i++) {
      a += 0.21 + R() * 0.08 + (i % 2 ? 0.1 : -0.1); // a bamboo branch zigzags a little at each of its nodes
      const nx = x + Math.cos(a) * sl, ny = y + Math.sin(a) * sl;
      segs.push([x, y, nx, ny, w0 * (1 - (0.55 * i) / n)]);
      if (i >= 1 && R() < 0.88) { // a twig, kinked once, ending in its own fan
        const ta = a + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.45) - 0.15, tl = sl * (0.7 + R() * 0.9);
        const mx = nx + Math.cos(ta) * tl * 0.5, my = ny + Math.sin(ta) * tl * 0.5, tb = ta + (R() - 0.3) * 0.4;
        const tx = mx + Math.cos(tb) * tl * 0.5, ty = my + Math.sin(tb) * tl * 0.5;
        segs.push([nx, ny, mx, my, w0 * 0.5], [mx, my, tx, ty, w0 * 0.4]);
        tips.push([tx, ty, tb, 0.7 + R() * 0.3]);
      }
      x = nx; y = ny;
    }
    tips.push([x, y, a, 1]);
    for (const [tx, ty, ta, k] of tips) {
      const m = 3 + ((R() * 4) | 0);
      for (let j = 0; j < m; j++) {
        let la = ta + (j - (m - 1) / 2) * (0.4 + R() * 0.15) + (R() - 0.5) * 0.3;
        la += (Math.PI / 2 - la) * (0.28 + R() * 0.24); // they hang toward the ground
        const len = bl * (0.3 + R() * 0.15) * k;
        leaves.push([tx, ty, la, len, len * (0.075 + R() * 0.02), len * (0.04 + R() * 0.07) * Math.cos(la), R()]);
      }
    }
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    const grow = (px, py) => { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; };
    for (const s of segs) { grow(s[0], s[1]); grow(s[2], s[3]); }
    for (const [lx, ly, la, len, wid, bend] of leaves) {
      const ca = Math.cos(la), sa = Math.sin(la);
      for (const [u, v] of [[len, bend], [len * 0.4, -wid * 1.2], [len * 0.4, wid * 1.2]]) grow(lx + ca * u - sa * v, ly + sa * u + ca * v);
    }
    const pad = 3, sw = x1 - x0 + pad * 2, sh = y1 - y0 + pad * 2, c = K.mk(sw * q, sh * q), g = c.getContext('2d');
    g.scale(q, q); g.translate(pad - x0, pad - y0);
    g.lineCap = 'round'; g.strokeStyle = rgb(col.branch);
    for (const [ax, ay, bx, by, lw] of segs) { g.lineWidth = lw; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    leaves.sort((p, r) => p[6] - r[6]); // the cluster has depth: the leaves behind a little darker
    for (const [lx, ly, la, len, wid, bend, z] of leaves) {
      const base = mix(col.leaf, col.hi, 0.15 + z * 0.55);
      const fill = fine ? (l) => { const gr = g.createLinearGradient(0, 0, l, 0); gr.addColorStop(0, rgb(mix(base, col.deep, 0.3))); gr.addColorStop(0.55, rgb(base)); gr.addColorStop(1, rgb(mix(base, col.hi, 0.35))); return gr; } : rgb(base);
      leaf(g, lx, ly, la, len, wid, bend, fill, fine ? rgb(mix(base, col.hi, 0.45)) : null, fine ? rgb(col.branch) : null);
    }
    return { c, sw, sh, ox: pad - x0, oy: pad - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  /**
   * A culm in its own coordinates: the foot at (0, 0), growing up (−y) to cm.h1. Shaded as a cylinder lit from
   * the upper right, fibres along it; ridged nodes with a pale bloom under each, the rings curving as they do
   * above and below the eye (hy). fine: the full detail; otherwise plain nodes (thin far culms).
   */
  function paintCulm(c, cm, P, H, hy, fine) {
    const { cw, h0, h1, body } = cm, deep = P.deep, sheen = P.sheen;
    const half = (hh) => cw * 0.5 * (1 - cm.taper * clamp(hh / H, 0, 1.3));
    const shade = (hw, k) => {
      const g = c.createLinearGradient(-hw, 0, hw, 0), b = k ? mix(body, sheen, k) : body;
      g.addColorStop(0, rgb(mix(b, deep, 0.42)));
      g.addColorStop(0.07, rgb(mix(b, deep, 0.12)));
      g.addColorStop(0.14, rgb(mix(b, sheen, 0.1)));
      g.addColorStop(0.32, rgb(mix(b, deep, 0.32)));
      g.addColorStop(0.56, rgb(b));
      g.addColorStop(0.74, rgb(mix(b, sheen, 0.4)));
      g.addColorStop(0.85, rgb(mix(b, sheen, 0.66)));
      g.addColorStop(0.94, rgb(mix(b, sheen, 0.36)));
      g.addColorStop(1, rgb(mix(b, deep, 0.22)));
      return g;
    };
    const wB = half(h0), wT = half(h1), bodyP = new Path2D();
    bodyP.moveTo(-wB, -h0); bodyP.lineTo(-wT, -h1); bodyP.lineTo(wT, -h1); bodyP.lineTo(wB, -h0); bodyP.closePath();
    c.fillStyle = shade((wB + wT) / 2, 0); c.fill(bodyP);
    const ring = (nh, dy, ext) => { // one ring round the culm at height nh, dy below it
      const hw = half(nh) * ext, y = -nh + dy, sag = cw * 0.13 * clamp((cm.y0 - nh - hy) / (H * 0.5), -1, 1);
      c.moveTo(-hw, y); c.quadraticCurveTo(0, y + sag * 2, hw, y);
    };
    const nodes = cm.nodes.filter((nh) => nh > h0 + cw * 0.3 && nh < h1 - cw * 0.3);
    if (!fine) {
      c.lineCap = 'butt';
      c.strokeStyle = rgb(mix(body, deep, 0.5)); c.lineWidth = Math.max(0.6, cw * 0.16);
      c.beginPath(); for (const nh of nodes) ring(nh, cw * 0.06, 1.04); c.stroke();
      c.strokeStyle = rgb(mix(body, sheen, 0.3)); c.lineWidth = Math.max(0.4, cw * 0.08);
      c.beginPath(); for (const nh of nodes) ring(nh, -cw * 0.08, 1); c.stroke();
      return;
    }
    c.save(); c.clip(bodyP);
    // fibres along the culm, light and dark
    const fib = K.noiseTex('bmFibre', 64, 512, { px: 16, py: 3, oct: 3, lo: 0.42, hi: 0.86, seed: 77 });
    const fib2 = K.noiseTex('bmFibre2', 64, 512, { px: 12, py: 3, oct: 3, lo: 0.45, hi: 0.88, seed: 91 });
    c.globalAlpha = 0.12; c.drawImage(K.tint(fib, rgb(sheen)), -wB, -h1, wB * 2, h1 - h0);
    c.globalAlpha = 0.16; c.drawImage(K.tint(fib2, rgb(deep)), -wB, -h1, wB * 2, h1 - h0);
    // lichen on an old culm
    if (cm.age > 0.62) {
      const li = K.tint(K.noiseTex('bmLichen', 64, 1024, { px: 6, py: 96, oct: 4, lo: 0.62, hi: 0.8, seed: 52 }), rgb(L_LICHEN(P)));
      const th = wB * 2 * 16;
      c.globalAlpha = 0.06 + (cm.age - 0.62) * 0.25;
      for (let yy = -h1; yy < -h0; yy += th) c.drawImage(li, -wB, yy, wB * 2, th);
    }
    // each internode a touch different; the young ones higher up a little greener
    const edges = [h0, ...nodes, h1];
    for (let i = 0; i < edges.length - 1; i++) {
      const v = cm.rng(), up = clamp(edges[i] / H, 0, 1);
      c.globalAlpha = 0.04 + v * 0.06;
      c.fillStyle = v < 0.5 ? rgb(deep) : rgb(mix(sheen, [180, 200, 120], up * 0.3));
      c.fillRect(-wB * 1.1, -edges[i + 1], wB * 2.2, edges[i + 1] - edges[i]);
    }
    // the waxy bloom just under each node
    for (const nh of nodes) {
      const y = -nh + cw * 0.1, bh = cw * 0.7, g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, rgba(P.bloom, cm.bloom)); g.addColorStop(0.35, rgba(P.bloom, cm.bloom * 0.45)); g.addColorStop(1, rgba(P.bloom, 0));
      c.globalAlpha = 1; c.fillStyle = g;
      c.beginPath(); ring(nh, cw * 0.1, 1.1); c.lineTo(half(nh) * 1.1, y + bh); c.lineTo(-half(nh) * 1.1, y + bh); c.closePath(); c.fill();
    }
    c.restore();
    // nodes: the sheath scar below, the ridge above, the band between them a little proud of the culm
    c.lineCap = 'butt';
    for (const nh of nodes) {
      const hw = half(nh);
      c.fillStyle = shade(hw * 1.05, 0.1);
      c.beginPath(); ring(nh, -cw * 0.035, 1.05); const y = -nh, sag = cw * 0.13 * clamp((cm.y0 - nh - hy) / (H * 0.5), -1, 1);
      c.lineTo(hw * 1.04, y + cw * 0.07); c.quadraticCurveTo(0, y + cw * 0.07 + sag * 2, -hw * 1.04, y + cw * 0.07); c.closePath(); c.fill();
      c.strokeStyle = rgba(deep, 0.7); c.lineWidth = Math.max(0.5, cw * 0.032); c.beginPath(); ring(nh, cw * 0.085, 1.0); c.stroke(); // the scar
      c.strokeStyle = rgb(mix(body, sheen, 0.6)); c.lineWidth = Math.max(0.5, cw * 0.022); c.beginPath(); ring(nh, -cw * 0.035, 1.04); c.stroke(); // light on the ridge
      c.strokeStyle = rgba(deep, 0.55); c.lineWidth = Math.max(0.5, cw * 0.026); c.beginPath(); ring(nh, cw * 0.02, 1.03); c.stroke(); // its shadow
    }
  }
  const L_LICHEN = (P) => mix(P.air, P.sheen, 0.3);

  /* ---------- the grove (built once per size and mode) ---------- */

  const SWAY = { far: [0.003, 0.008, 70, 90], mid: [0.0038, 0.011, 80, 100], near: [0.0045, 0.014, 95, 115] }; // amplitude, gust (× H), spring period (frames)

  function build(bg, V, ctx) {
    const { W, H, u, pv } = V, L = K.light(), P = palette(L), R = K.rng(8128), D = bg.dpr || 1, q = Math.min(2, D);
    const big = pv ? 2.1 : 1; // the picker preview: fewer, broader culms so they read
    const hy = H * 0.56; // eye level: rings above it curve one way, below it the other
    const PD = H * 0.6; // how far below the screen the culms pivot
    const S = { P, hy, far: [], mid: [], near: [], pts: [], PD };
    const depthBody = (k) => mix(P.ink, P.air, P.fog[k]);
    const sprayCol = (k) => { const lf = mix(P.leaf, P.air, P.fog[k]); return { leaf: lf, hi: mix(lf, P.sheen, L ? 0.42 : 0.38), deep: mix(lf, P.deep, 0.5), branch: mix(depthBody(k), P.sheen, L ? 0.12 : 0.24) }; };

    const culm = (k, x, cw, lean) => {
      const age = R(), fog = P.fog[k];
      let body = mix(depthBody(k), mix(P.olive, P.air, fog), age * 0.42); // the old ones yellower and greyer
      body = mix(body, P.deep, (R() - 0.5) * 0.12);
      const nodes = [];
      for (let nh = -R() * cw * 5; nh < H * 1.3;) { nodes.push(nh); nh += cw * (4.6 + R() * 1.8) * (1 + 0.35 * clamp(nh / H, 0, 1)); }
      const h0 = -cw * 0.5, h1 = H * 1.04 + cw * 2;
      const seed = (R() * 1e9) | 0;
      return { k, x, cw, lean, body, nodes, h0, h1, y0: H - h0, taper: 0.06 + R() * 0.05, age, bloom: (L ? 0.5 : 0.24) * (1 - age * 0.6), sprays: [], rng: K.rng(seed) };
    };
    const dyn = (cm, kind) => {
      const [amp, gk, t0, t1] = SWAY[kind], T = t0 + R() * (t1 - t0), w = TAU / T, z = pv ? 2.5 : 1;
      Object.assign(cm, { amp: amp * H * z * (0.8 + R() * 0.4), gk: gk * H * (0.85 + R() * 0.3), w2: w * w, damp: 2 * 0.28 * w, g: 0, gv: 0,
        f1: TAU / (170 + R() * 90), f2: TAU / (95 + R() * 45), p1: R() * TAU, p2: R() * TAU });
    };
    /**
     * The culm as one sprite. It turns about a point well below the screen: the stretch of trunk we see is stiff,
     * the bending happens up in the canopy. bake: its branches are painted into it (far culms, whose leaves need
     * not stir on their own).
     */
    const sprite = (cm, sq, fade, bake) => {
      const core = (cm.cw * 1.3 + 6) / 2;
      let mL = core, mR = core, mt = cm.h1 + 3;
      if (bake) for (const sp of cm.sprays) { // room for the branches, on the side each one grows to
        const v = sp.v, k = sp.s, slack = sp.reach * 0.16, out = (v.sw - v.ox) * k + slack, back = v.ox * k + slack;
        if (sp.side > 0) { mR = Math.max(mR, out); mL = Math.max(mL, back); } else { mL = Math.max(mL, out); mR = Math.max(mR, back); }
        mt = Math.max(mt, sp.nh + v.oy * k + slack + 2);
      }
      const cx = Math.ceil(mL), sw = cx + Math.ceil(mR), top = Math.ceil(mt), sh = Math.ceil(top - cm.h0 + 4), c = K.mk(sw * sq, sh * sq), g = c.getContext('2d');
      g.scale(sq, sq); g.translate(cx, top);
      const branch = (sp) => { g.save(); g.translate(0, -sp.nh); g.rotate(sp.a0); g.scale(sp.side, 1); g.drawImage(sp.v.c, -sp.v.ox * sp.s, -sp.v.oy * sp.s, sp.v.sw * sp.s, sp.v.sh * sp.s); g.restore(); };
      if (bake) for (const sp of cm.sprays) if (sp.back) branch(sp);
      paintCulm(g, cm, P, H, hy, cm.cw * (pv ? 2 : 1) >= 9);
      if (bake) { for (const sp of cm.sprays) if (!sp.back) branch(sp); cm.sprays = []; }
      if (fade) { // its foot lost in the ground mist
        const fg = g.createLinearGradient(0, -cm.h0, 0, -H * fade[1]);
        fg.addColorStop(0, `rgba(0,0,0,${fade[0]})`); fg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = fg; g.fillRect(-sw, -H * fade[1], sw * 2, H * fade[1] - cm.h0 + 4);
      }
      Object.assign(cm, { spr: c, dx: -cx, dy: -(top + PD), dw: sw, dh: sh, px: cm.x - Math.sin(cm.lean) * PD, py: H + PD, a: cm.lean });
    };
    /** Branches with leaves on the upper nodes, on alternate sides; fewer over the prompt's corner. */
    const attach = (cm, vars, prob, maxN, yLo, yHi) => {
      let side = R() < 0.5 ? -1 : 1;
      for (const nh of cm.nodes) {
        const sy = cm.y0 - nh - cm.cw * 0.5;
        if (sy < yLo || sy > yHi || cm.sprays.length >= maxN) continue;
        if (R() > prob * (cm.x < W * 0.34 ? 0.5 : 1)) { side = -side; continue; }
        const v = vars[(R() * vars.length) | 0], s = 0.82 + R() * 0.34;
        cm.sprays.push({ nh, r: nh + PD, side, v, s, a0: (R() - 0.5) * 0.3, back: R() < 0.4, f: 0.1 + R() * 0.05, p: R() * TAU, amp: 0.012 + R() * 0.01, reach: Math.max(v.sw, v.sh) * s });
        side = -side;
      }
    };
    const spread = (n, x0, x1, gapFrom, gapTo, keep) => { // stratified with jitter; thinner where the light comes through
      const xs = [];
      for (let i = 0; i < n; i++) {
        const x = x0 + ((x1 - x0) * (i + 0.5 + (R() - 0.5) * 0.8)) / n;
        if (x > gapFrom && x < gapTo && R() > keep) continue;
        xs.push(x);
      }
      return xs;
    };

    // the haze wall: many thin culms far off, baked into one layer that leans as a whole
    {
      const [layer, c] = K.layer(W, H, 1);
      const n = Math.round(W / (u * (pv ? 0.1 : 0.026) * big));
      for (const x of spread(n, -u * 0.02, W + u * 0.02, 0, 0, 1)) {
        const cm = culm(0, x, Math.max(pv ? 0.7 : 1.4, u * (0.004 + R() * 0.0035) * big), (R() - 0.5) * 0.05);
        c.save(); c.translate(x, cm.y0); c.rotate(cm.lean); paintCulm(c, cm, P, H, hy, false); c.restore();
      }
      const fg = c.createLinearGradient(0, H * 0.42, 0, H);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.88)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = fg; c.fillRect(0, H * 0.42, W, H * 0.58);
      S.ghost = layer;
      S.ghostDyn = { x: W / 2 }; dyn(S.ghostDyn, 'far'); S.ghostDyn.amp *= 0.5; S.ghostDyn.gk *= 0.45;
    }

    // far culms, thin, each leaning on its own
    {
      const vars = Array.from({ length: 4 }, () => spraySprite(R, u * 0.075 * big, sprayCol(1), 1, false));
      const n = Math.round(W / (u * (pv ? 0.11 : 0.062) * big));
      for (const x of spread(n, -u * 0.02, W + u * 0.02, W * 0.36, W * 0.56, 0.7)) {
        const cm = culm(1, x, Math.max(pv ? 1 : 2.5, u * (0.0085 + R() * 0.005) * big), (R() - 0.5) * 0.06);
        attach(cm, vars, 0.35, 2, -H * 0.05, H * 0.3);
        sprite(cm, 1, [0.75, 0.42], true); dyn(cm, 'far');
        S.far.push(cm);
      }
    }

    // the middle distance: a scatter, some in pairs, fewer in the clearing where the light comes down
    {
      const vars = Array.from({ length: 6 }, () => spraySprite(R, u * 0.12 * big, sprayCol(2), q, !pv));
      const n = pv ? 5 : Math.round(W / (u * 0.17));
      for (const x of spread(n, W * 0.02, W * 0.98, W * 0.33, W * 0.6, 0.35)) {
        const list = [[x, u * (0.019 + R() * 0.009) * big, (R() - 0.5) * 0.07]];
        if (!pv && R() < 0.32) { const cw = u * (0.015 + R() * 0.006), s = R() < 0.5 ? -1 : 1; list.push([x + s * (list[0][1] + cw) * (0.9 + R() * 0.7), cw, list[0][2] + (R() - 0.5) * 0.05]); }
        for (const [cx, cw, lean] of list) {
          const cm = culm(2, cx, cw, lean);
          attach(cm, vars, 0.55, 3, -H * 0.08, H * 0.5);
          sprite(cm, q, [0.5, 0.26]); dyn(cm, 'mid');
          S.mid.push(cm);
        }
      }
      S.mid.sort((a, b) => a.cw - b.cw); // the slimmer ones a little further back
    }

    // close by: one at the left edge, a pair on the right under the sun
    {
      const vars = Array.from({ length: 5 }, () => spraySprite(R, u * 0.19 * (pv ? 1.6 : 1), sprayCol(3), q, true));
      const cwN = u * 0.052 * (pv ? 2 : 1);
      const spots = pv ? [[W * 0.04, cwN, 0.02], [W * 0.86, cwN * 0.9, -0.02]]
        : [[-cwN * 0.3, cwN, 0.022], [W * 0.885, cwN * 0.94, -0.02], [W * 0.885 + cwN * 1.75, cwN * 0.78, 0.012]];
      for (const [x, cw, lean] of spots) {
        const cm = culm(3, x, cw, lean);
        attach(cm, vars, 0.62, 3, -H * 0.12, H * 0.42);
        sprite(cm, q, null); dyn(cm, 'near');
        S.near.push(cm);
      }
    }
    for (const cm of [...S.mid, ...S.near]) for (const s of cm.sprays) S.pts.push([cm, s, cm.k === 3]);

    // shafts of sun from the top right, slanting down to the left
    const fr = pv ? [[0.52, 0.16, 1], [0.78, 0.1, 0.8]] : [[0.5, 0.06, 0.8], [0.62, 0.12, 1], [0.73, 0.045, 0.65], [0.88, 0.09, 0.9]];
    S.rays = fr.map(([fx, fw, k]) => {
      const a = 0.36 + (R() - 0.5) * 0.05;
      return { x: W * (fx + (R() - 0.5) * 0.03), y: -H * 0.04, a, w: u * fw * (pv ? 1.4 : 1) * (0.85 + R() * 0.3), len: (H * 1.2) / Math.cos(a), al: (L ? 0.34 : 0.17) * k,
        s1: TAU / (1500 + R() * 1300), s2: TAU / (700 + R() * 500), s3: TAU / (2600 + R() * 1800), p1: R() * TAU, p2: R() * TAU, m: 1, cx: 0 };
    });
    S.shaft = L ? shaftSpr() : K.tint(shaftSpr(), rgb(P.sun));
    S.warm = L ? K.tint(shaftSpr(), rgb(P.sun)) : null;
    const fog = K.noiseTex('bmFog', 512, 128, { px: 6, py: 2, oct: 5, lo: 0.34, hi: 0.82, env: 'band', envPow: 0.8, warp: 1.3, seed: 23 });
    S.fog = L ? fog : K.tint(fog, '#c0d0c6');
    // the light in the air: the sun through the canopy at the top right; mist lit low down
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    if (L) { sg.addColorStop(0, rgba(P.sun, 0.16)); sg.addColorStop(0.45, rgba(P.sun, 0.05)); sg.addColorStop(1, rgba(P.sun, 0)); }
    else { sg.addColorStop(0, rgba(P.sun, 0.15)); sg.addColorStop(0.4, rgba(mix(P.sun, P.air, 0.4), 0.06)); sg.addColorStop(1, rgba(P.air, 0)); }
    S.sunG = sg; S.sun = [W * 0.86, -H * 0.06, u * 1.05];
    if (!L) {
      const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      lg.addColorStop(0, 'rgba(184,206,194,0.06)'); lg.addColorStop(0.6, 'rgba(184,206,194,0.025)'); lg.addColorStop(1, 'rgba(184,206,194,0)');
      S.lowG = lg; S.low = [W * 0.52, H * 0.84, W * 0.72, u * 0.32];
    }
    S.mote = moteSpr();
    return S;
  }

  function newLeaf(V, from, slot) {
    const { W, u, pv } = V, near = slot != null ? slot : !pv && !from && RND() < 0.28, k = (u / 700) * (pv ? 2 : 1);
    return {
      near, len: u * (near ? 0.042 : 0.026) * (0.85 + RND() * 0.3) * (pv ? 2.2 : 1),
      x: from ? from[0] : W * (-0.05 + RND() * 1.1), y: from ? from[1] : V.oy - u * (0.04 + RND() * 0.08),
      v: (near ? 0.7 : 0.52) * k * (0.8 + RND() * 0.4), rot: RND() * TAU, spin: (RND() - 0.5) * 0.012, flip: RND() * TAU, fs: 0.05 + RND() * 0.06,
      ph: RND() * TAU, sp: 0.022 + RND() * 0.02, sw: (0.35 + RND() * 0.4) * k * (near ? 1.4 : 1), tone: (RND() * 3) | 0, wait: 0, extra: !!from, age: from ? 0 : 99,
    };
  }
  function init(V, S) {
    const { W, H, pv } = V, n = pv ? 1 : 6;
    const leaves = Array.from({ length: n }, (_, i) => { const f = newLeaf(V, null); if (i < (pv ? 1 : 2)) f.y = V.oy + RND() * V.H * 0.6; else f.wait = 60 + RND() * 900; return f; });
    const motes = pv ? [] : Array.from({ length: 12 }, () => ({ x: RND() * W, y: RND() * H, vx: (RND() - 0.5) * 0.06, vy: (RND() - 0.5) * 0.05, ph: RND() * TAU, sp: 0.012 + RND() * 0.012, r: 0.8 + RND() * 0.8 }));
    return { kind: 'bamboo', key: S.key, gust: null, gustIn: 600 + RND() * 600, leaves, motes, drift: RND() * 1000 };
  }

  window.BG_EXT.bamboo = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.38, 1.5), { W, H, u, pv } = V, L = K.light(), D = bg.dpr || 1, oy = V.oy;
    const S = K.scene(bg, V, () => build(bg, V, ctx));
    let st = bg.st;
    if (!st || st.kind !== 'bamboo' || st.key !== S.key) st = bg.st = init(V, S);
    const P = S.P, k7 = u / 700;
    const base = () => ctx.setTransform(D, 0, 0, D, 0, -D * oy);
    const place = (x, y, a, m) => { const c = Math.cos(a) * D, s = Math.sin(a) * D; ctx.setTransform(c * m, s * m, -s, c, D * x, D * (y - oy)); };

    // the wind: a breeze that leans and eases off, and now and then a gust running through the grove from one side
    const B = 0.5 + 0.3 * Math.sin(t * 0.0021 + 0.4) + 0.2 * Math.sin(t * 0.0053 + 2.1);
    if (!pv) {
      if (!st.gust && --st.gustIn <= 0) st.gust = { t0: t, dir: RND() < 0.72 ? 1 : -1, dur: 100 + RND() * 40, speed: W / (55 + RND() * 25), rel: 2 + ((RND() * 3) | 0) };
      else if (st.gust && t - st.gust.t0 > st.gust.dur + W / st.gust.speed + 10) { st.gust = null; st.gustIn = 900 + RND() * 1000; }
    }
    const G = st.gust, gdir = G ? G.dir : 1;
    const gustAt = G ? (x) => { const tau = t - G.t0 - (G.dir > 0 ? x : W - x) / G.speed; return tau > 0 && tau < G.dur ? Math.sin((Math.PI * tau) / G.dur) ** 2 : 0; } : () => 0;

    // a culm sways about its pivot: its own two slow rhythms, the breeze, and a spring that takes the gust
    const sway = (cm) => {
      const e = gustAt(cm.x);
      cm.gv += cm.w2 * (e * gdir * cm.gk - cm.g) - cm.damp * cm.gv; cm.g += cm.gv;
      cm.a = cm.lean + (cm.amp * (0.8 * B + 0.55 * Math.sin(t * cm.f1 + cm.p1) + 0.3 * Math.sin(t * cm.f2 + cm.p2)) + cm.g) / (H + S.PD);
    };
    // On a light page each shape first hides what is behind it (the culms are faint there, and must not show
    // through one another); in the dark they are all but opaque and one pass does.
    const lay = (img, x, y, iw, ih, al) => {
      if (L) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.drawImage(img, x, y, iw, ih); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = al; ctx.drawImage(img, x, y, iw, ih);
    };
    const sprayAt = (cm, s) => [cm.px + Math.sin(cm.a) * s.r, cm.py - Math.cos(cm.a) * s.r];
    const top = oy - 4, bot = oy + h + 4;
    const drawSpray = (cm, s, al) => {
      const a = cm.a, x = cm.px + Math.sin(a) * s.r, y = cm.py - Math.cos(a) * s.r;
      if (y + s.reach < top || y - s.reach > bot) return;
      const e = gustAt(x), v = s.v, k = s.s;
      place(x, y, a + s.a0 + s.amp * Math.sin(t * s.f + s.p) * (0.5 + 1.4 * e) - 0.1 * e * gdir - 0.025 * B, s.side); // leaves trembling, swept downwind in a gust
      lay(v.c, -v.ox * k, -v.oy * k, v.sw * k, v.sh * k, al);
    };
    const grove = (list, al) => {
      ctx.globalCompositeOperation = 'source-over';
      for (const cm of list) {
        sway(cm);
        for (const s of cm.sprays) if (s.back) drawSpray(cm, s, al);
        place(cm.px, cm.py, cm.a, 1); lay(cm.spr, cm.dx, cm.dy, cm.dw, cm.dh, al);
        for (const s of cm.sprays) if (!s.back) drawSpray(cm, s, al);
      }
    };
    const midGust = gustAt(W / 2);
    st.drift += (0.16 + 0.12 * B + midGust * 0.9) * k7 * (pv ? 0.6 : 1);
    const mist = (fy, fh, tw, sp, ph, aD, aL) => { base(); ctx.globalCompositeOperation = 'source-over'; K.mist(ctx, S.fog, W, H * fy, H * fh, u * tw, st.drift * sp + ph, L ? aL : aD); };

    // 1. the light in the air
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    { const [x, y, r] = S.sun; ctx.setTransform(D * r, 0, 0, D * r, D * x, D * (y - oy)); ctx.fillStyle = S.sunG; ctx.fillRect(-1, -1, 2, 2); }
    if (S.lowG) { const [x, y, rx, ry] = S.low; ctx.setTransform(D * rx, 0, 0, D * ry, D * x, D * (y - oy)); ctx.fillStyle = S.lowG; ctx.fillRect(-1, -1, 2, 2); }

    // 2. the haze wall, leaning as one; mist in front of it
    {
      const g = S.ghostDyn, e = gustAt(W / 2);
      g.gv += g.w2 * (e * gdir * g.gk - g.g) - g.damp * g.gv; g.g += g.gv;
      const kk = (g.amp * (0.8 * B + 0.5 * Math.sin(t * g.f1 + g.p1)) + g.g) / H;
      ctx.setTransform(D, 0, -D * kk, D, D * kk * H, -D * oy);
      K.put(ctx, S.ghost, W, H, P.alpha[0]);
    }
    mist(0.2, 0.62, 1.9, 0.45, 120, 0.1, 0.55);

    // 3. far culms; the mist between them and the middle distance
    grove(S.far, P.alpha[1]);
    mist(0.42, 0.56, 1.5, 0.7, 640, 0.11, 0.6);

    // 4. the middle distance
    grove(S.mid, P.alpha[2]);

    // 5. shafts of sun: light added in the dark; on a light page they wear the ink away, warmed a little
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    for (const r of S.rays) {
      r.m = (0.62 + 0.24 * Math.sin(t * r.s1 + r.p1) + 0.14 * Math.sin(t * r.s2 + r.p2)) * (1 + 0.08 * gustAt(r.x - H * 0.3) * Math.sin(t * 0.11 + r.p1));
      r.cx = r.x + Math.sin(t * r.s3 + r.p2) * W * 0.012;
      place(r.cx, r.y, r.a, 1); ctx.globalAlpha = r.al * r.m;
      ctx.drawImage(S.shaft, -r.w / 2, 0, r.w, r.len);
    }
    if (L) {
      ctx.globalCompositeOperation = 'source-over';
      for (const r of S.rays) { place(r.cx, r.y, r.a, 1); ctx.globalAlpha = r.al * r.m * 0.55; ctx.drawImage(S.warm, -r.w / 2, 0, r.w, r.len); }
    }
    const inBeam = (x, y) => {
      let b = 0;
      for (const r of S.rays) {
        const dx = x - r.cx, dy = y - r.y, ca = Math.cos(r.a), sa = Math.sin(r.a), v = (-dx * sa + dy * ca) / r.len;
        if (v <= 0 || v >= 1) continue;
        const s = (dx * ca + dy * sa) / ((r.w / 2) * (0.62 + 0.38 * v));
        if (s > -1 && s < 1) b += (1 - s * s) ** 1.6 * shaftFall(v) * r.m;
      }
      return b;
    };

    // 6. motes turning in the light
    if (!L && st.motes.length) {
      ctx.globalCompositeOperation = 'lighter'; base();
      for (const m of st.motes) {
        m.ph += m.sp;
        m.x += m.vx + Math.sin(m.ph * 0.7) * 0.05 + (0.04 + midGust * 0.5) * k7; m.y += m.vy + Math.cos(m.ph) * 0.04;
        if (m.x > W + 4) m.x = -4; else if (m.x < -4) m.x = W + 4;
        if (m.y > H + 4) m.y = -4; else if (m.y < -4) m.y = H + 4;
        const b = inBeam(m.x, m.y);
        if (b < 0.05) continue;
        ctx.globalAlpha = Math.min(1, b * 0.5 * (0.65 + 0.35 * Math.sin(m.ph * 1.3)));
        ctx.drawImage(S.mote, m.x - m.r * 2, m.y - m.r * 2, m.r * 4, m.r * 4);
      }
    }

    // 7. leaves coming down: tumbling, gliding side to side, catching the light as they cross a shaft
    if (G && G.rel > 0 && S.pts.length && RND() < 0.05) {
      const [cm, s, close] = S.pts[(RND() * S.pts.length) | 0], [x, y] = sprayAt(cm, s);
      if (gustAt(cm.x) > 0.4 && y > oy - u * 0.05) { G.rel--; st.leaves.push(newLeaf(V, [x + s.side * s.v.cx * s.s, y + s.v.cy * s.s], close)); } // a leaf from a near branch stays in front
    }
    const fall = (near) => {
      for (let i = st.leaves.length - 1; i >= 0; i--) {
        const f = st.leaves[i];
        if (f.near !== near) continue;
        if (f.wait > 0) { f.wait--; continue; }
        f.ph += f.sp; f.flip += f.fs; f.rot += f.spin; f.age++;
        const fl = Math.cos(f.flip), e = gustAt(f.x);
        f.y += f.v * (0.55 + 0.85 * (1 - Math.abs(fl))); // edge-on it slips down faster
        f.x += (0.12 + 0.12 * B) * k7 * (near ? 1.4 : 1) + e * gdir * 1.8 * k7 + Math.cos(f.ph) * f.sw;
        if (f.y > oy + h + f.len || f.x < -f.len * 3 || f.x > W + f.len * 3) {
          if (f.extra) { st.leaves.splice(i, 1); continue; }
          Object.assign(f, newLeaf(V, null, near));
          f.wait = pv ? 150 + RND() * 300 : 300 + RND() * 900;
          continue;
        }
        const a = f.rot + 0.5 * Math.sin(f.ph), c = Math.cos(a) * D, s = Math.sin(a) * D;
        const sx = 0.8 + 0.2 * Math.abs(Math.sin(f.ph * 0.5 + 1)), sy = Math.abs(fl) < 0.24 ? (fl < 0 ? -0.24 : 0.24) : fl; // edge-on it still shows its curl
        ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, D * f.x, D * (f.y - oy));
        const al = (near ? (L ? 0.42 : 0.36) : (L ? 0.5 : 0.46)) * (0.72 + 0.28 * Math.abs(fl)) * Math.min(1, f.age / 24);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.drawImage(fallSpr(P, f.tone, L, false), -f.len / 2, -f.len / 8, f.len, f.len / 4);
        if (!L) {
          const b = inBeam(f.x, f.y);
          if (b > 0.03) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.7, b * 0.8) * al; ctx.drawImage(fallSpr(P, f.tone, L, true), -f.len / 2, -f.len / 8, f.len, f.len / 4); }
        }
      }
    };
    fall(false);
    mist(0.64, 0.42, 1.3, 1, 1300, 0.09, 0.48);

    // 8. close by
    grove(S.near, P.alpha[3]);
    fall(true);
    mist(0.84, 0.22, 1.1, 1.35, 2100, 0.055, 0.3);

    ctx.setTransform(D, 0, 0, D, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
})();
