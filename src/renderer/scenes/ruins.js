'use strict';
/*
 * 고대 신전 유적: inside a vast, overgrown temple, seen down its nave. Two rows of weathered columns recede to a
 * portal at the far end where the jungle shows through; their drums are fluted, cracked and chipped, moss sits on
 * the ledges and ivy climbs the shafts. Through holes in the broken roof slanting shafts of sun come down, dimming
 * and brightening as clouds pass and creeping with the sun; dust glints in them and their light pools on the floor.
 * A shallow pool in the nave mirrors the portal, a fallen column lies in drums, the toppled head of a colossus rests
 * face up by the pool. Vines and roots hang from the roof and sway; now and then a leaf or a petal comes down through
 * the light, a drop rings the pool, a swallow crosses a beam. On a light page it is noon: the stone is drawn in warm
 * umber inks, the shafts are cut out of the hall's shade and gilded.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('ruins'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const rr = (R, a, b) => a + (b - a) * R();

  /* Inks: [on a dark page], [on a light page]. ink: stone in shadow, lit: stone in the light; *Far: the same at the end of the hall. */
  const PAL = [
    { ink: [6, 6, 9], far: [30, 31, 37], lit: [96, 84, 66], litFar: [60, 60, 62], moss: [16, 26, 15], mossLit: [62, 80, 40],
      leaf: [7, 12, 8], leafLit: [70, 92, 44], root: [12, 10, 9], rootLit: [78, 68, 54], flower: [150, 128, 138],
      sky: [222, 228, 212], sun: [255, 234, 196], dust: [255, 242, 214], water: [7, 10, 14], ripple: [196, 208, 220], jungle: [20, 30, 26] },
    { ink: [74, 63, 50], far: [176, 168, 154], lit: [178, 158, 124], litFar: [206, 198, 182], moss: [72, 98, 50], mossLit: [126, 148, 82],
      leaf: [52, 82, 42], leafLit: [118, 150, 70], root: [96, 80, 62], rootLit: [156, 136, 106], flower: [206, 112, 142],
      sky: [255, 255, 255], sun: [238, 196, 112], dust: [178, 128, 46], water: [112, 146, 150], ripple: [64, 96, 104], jungle: [120, 150, 110] },
  ];

  /* The hall, in world units (about 0.85 m): columns every SP from ZN, the far wall at ZF, the roof at YC. */
  const ZN = 3.4, SP = 2.7, NC = 10, ZF = ZN + (NC - 1) * SP + 1.6, YC = 8.5;
  const SHAFT_TOP = 6.6, CAP = 7.05, ABA = 7.4, ARCH = 8.3;

  /** One-point perspective down the nave: X across, Y up, Z away; the eye at a person's height, a little left of the middle. */
  function camera(W, H) {
    const f = H * 0.95, vx = W * 0.55, vy = H * 0.44, eye = 2, ex = -0.35;
    const sp = Math.max(0.75, Math.min(1.45, W / H / 1.6)); // a wide view spreads the hall, a narrow one draws it in
    return { f, vx, vy, eye, ex, D: 3 * sp, Dw: 6.6 * sp, x: (X, Z) => vx + ((X - ex) * f) / Z, y: (Y, Z) => vy + ((eye - Y) * f) / Z, s: (Z) => f / Z };
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
  const soft = (c) => radial(`ruSoft|${c}`, 64, [[0, rgba(c, 1)], [0.3, rgba(c, 0.62)], [0.62, rgba(c, 0.18)], [1, rgba(c, 0)]]);
  const mote = (c) => radial(`ruMote|${c}`, 24, [[0, rgba(c, 1)], [0.22, rgba(c, 0.85)], [0.5, rgba(c, 0.2)], [1, rgba(c, 0)]]);

  /** A patch of moss or lichen: clumpy noise inside a soft oval, solid toward the middle (white; tinted by K.tint). */
  function mossSpr(i) {
    const key = `ruMoss${i}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 64, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(91 + i * 7, 4, 4, 4), g = K.fbm(97 + i * 7, 8, 8, 2);
    for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const dx = ((k + 0.5) / N) * 2 - 1, dy = ((j + 0.5) / N) * 2 - 1, r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const env = (1 - r2) ** 0.8, n = f((k / N) * 4, (j / N) * 4) * 0.7 + g((k / N) * 8, (j / N) * 8) * 0.3;
      const al = cl01((n - 0.66 + 0.46 * env) / 0.16);
      const o = (j * N + k) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * al * Math.min(1, env * 4));
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }

  /**
   * A shaft of sun (white, alpha only): narrower where it comes through the roof, widening and thinning toward the
   * floor, with streaks along it (the edge of the hole) and a lumpy density (dust). k picks one of a few variants:
   * a shaft crossfades between two of them, so its inside drifts.
   */
  function shaftTex(k) {
    const key = `ruShaft${k}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const SW = 64, SH = 256, c = K.mk(SW, SH), x = c.getContext('2d'), img = x.createImageData(SW, SH), d = img.data;
    const f = K.fbm(301 + k * 17, 5, 2, 3), g = K.fbm(331 + k * 17, 3, 4, 3);
    for (let j = 0; j < SH; j++) {
      const v = (j + 0.5) / SH, half = 0.56 + 0.44 * v;
      const along = Math.min(1, v / 0.1) * (1 - 0.4 * v) * (v > 0.84 ? ((1 - v) / 0.16) ** 1.4 : 1);
      for (let i = 0; i < SW; i++) {
        const s = (((i + 0.5) / SW) * 2 - 1) / half;
        if (s <= -1 || s >= 1) continue;
        const prof = (1 - s * s) ** 1.5, streak = 0.5 + 0.5 * f((s + 1) * 2.5, v * 1.6), dens = 0.55 + 0.45 * g((s + 1) * 1.5, v * 4);
        const o = (j * SW + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * prof * streak * dens * along);
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }

  /** A falling leaf (pointed, with a midrib) or a petal, in one colour; drawn along +x. */
  function leafSpr(kind, col) {
    const key = `ruLeaf${kind}|${col.join(',')}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(48, 24), x = c.getContext('2d');
    x.translate(24, 12); x.fillStyle = rgb(col); x.strokeStyle = rgba(col, 1);
    x.beginPath();
    if (kind === 'petal') { x.moveTo(-14, 0); x.bezierCurveTo(-8, -10, 10, -11, 14, -2); x.quadraticCurveTo(15, 0, 14, 2); x.bezierCurveTo(10, 11, -8, 10, -14, 0); }
    else { x.moveTo(-20, 0); x.bezierCurveTo(-12, -11, 10, -10, 21, 0); x.bezierCurveTo(10, 10, -12, 11, -20, 0); }
    x.fill();
    if (kind !== 'petal') { x.globalCompositeOperation = 'destination-out'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-18, 0); x.quadraticCurveTo(0, -1.5, 19, 0); x.stroke(); }
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }

  /** A swallow seen from below, heading +x; s: half its span; f -1..1, the wings from closed to spread. Fill in the context's style. */
  function swallow(c, x, y, s, f) {
    const k = 0.45 + 0.55 * (f * 0.5 + 0.5), back = 0.22 + 0.3 * (1 - k);
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); // body and the forked tail
    c.moveTo(0.36, 0); c.quadraticCurveTo(0.3, -0.07, 0.12, -0.075); c.quadraticCurveTo(-0.12, -0.07, -0.26, -0.03);
    c.lineTo(-0.62, -0.13); c.lineTo(-0.36, 0); c.lineTo(-0.62, 0.13); c.lineTo(-0.26, 0.03);
    c.quadraticCurveTo(-0.12, 0.07, 0.12, 0.075); c.quadraticCurveTo(0.3, 0.07, 0.36, 0); c.closePath(); c.fill();
    for (const d of [-1, 1]) { // long swept wings: a curved leading edge out to the tip, a straighter trailing edge back
      const tx = -back, ty = d * k, ln = d * 0.05;
      c.beginPath(); c.moveTo(0.14, d * 0.03);
      c.quadraticCurveTo(0.2, ty * 0.55 + ln, tx, ty);
      c.quadraticCurveTo(-0.02, ty * 0.45, -0.12, d * 0.04); c.closePath(); c.fill();
    }
    c.restore();
  }

  /* ---------- the still hall ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), q = bg.dpr || 1, P = PAL[L ? 1 : 0], R = K.rng(9137);
    const C = camera(W, H), { D, Dw, eye, ex } = C;
    const lw = (v) => Math.max(pv ? 0.35 : 0.6, v);
    const fade = (Z) => cl01((Z - 4) / 24) ** 0.8;
    const inkZ = (Z) => mix(P.ink, P.far, fade(Z) * 0.85), litZ = (Z) => mix(P.lit, P.litFar, fade(Z));
    const pt = (X, Y, Z) => [C.x(X, Z), C.y(Y, Z)];
    const poly = (c, ps) => { c.beginPath(); c.moveTo(ps[0][0], ps[0][1]); for (let i = 1; i < ps.length; i++) c.lineTo(ps[i][0], ps[i][1]); c.closePath(); };
    const face = (c, ps, col) => { poly(c, ps); c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.6; c.stroke(); }; // the stroke closes the seams between faces
    const line = (c, a, b) => { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
    /** Moss laid on as a clumpy patch (w × h around x, y), a lighter clump on its top. */
    const moss = (c, x, y, w, h, lit = 0.3) => {
      c.drawImage(K.tint(mossSpr((R() * 3) | 0), rgb(P.moss)), x - w / 2, y - h / 2, w, h);
      if (lit > 0) { c.globalAlpha = lit; c.drawImage(K.tint(mossSpr((R() * 3) | 0), rgb(P.mossLit)), x - w * 0.3, y - h * 0.5, w * 0.5, h * 0.5); c.globalAlpha = 1; }
    };
    const [back, bc] = K.layer(W, H, q), [mid, mc] = K.layer(W, H, q), [front, fc] = K.layer(W, H, q);

    /** A stone block, its visible faces shaded: the light comes from the right and from the roof. */
    function box(c, x0, x1, y0, y1, z0, z1, ink, lit, o) {
      if (y1 < eye) face(c, [pt(x0, y1, z0), pt(x1, y1, z0), pt(x1, y1, z1), pt(x0, y1, z1)], rgb(mix(ink, lit, 0.6)));
      if (y0 > eye) face(c, [pt(x0, y0, z0), pt(x1, y0, z0), pt(x1, y0, z1), pt(x0, y0, z1)], rgb(mix(ink, lit, 0.06)));
      if (x1 < ex) face(c, [pt(x1, y0, z0), pt(x1, y0, z1), pt(x1, y1, z1), pt(x1, y1, z0)], rgb(mix(ink, lit, 0.82)));
      if (x0 > ex) face(c, [pt(x0, y0, z0), pt(x0, y0, z1), pt(x0, y1, z1), pt(x0, y1, z0)], rgb(mix(ink, lit, 0.1)));
      face(c, [pt(x0, y0, z0), pt(x1, y0, z0), pt(x1, y1, z0), pt(x0, y1, z0)], rgb(mix(ink, lit, 0.38)));
      const s = C.s(z0);
      if ((y1 - y0) * s < 5) return;
      // the worn edge: the arris catches the light where it is whole; pits and spalls where it is not
      c.strokeStyle = rgba(mix(ink, lit, 0.85), 0.5); c.lineWidth = lw(s * 0.014);
      for (let X = x0; X < x1 - 0.05;) { const len = 0.15 + R() * 0.5, X2 = Math.min(x1, X + len); if (R() < 0.7) line(c, pt(X, y1, z0), pt(X2, y1, z0)); X = X2 + R() * 0.12; }
      c.fillStyle = rgba(ink, 0.55);
      for (let k = 0, n = Math.round((x1 - x0) * (y1 - y0) * 14); k < n; k++) { const [px, py] = pt(x0 + (x1 - x0) * R(), y0 + (y1 - y0) * R(), z0), pr = s * (0.006 + R() * 0.014); c.beginPath(); c.ellipse(px, py, pr * (1 + R()), pr, R() * 3, 0, TAU); c.fill(); }
      c.strokeStyle = rgba(ink, 0.7); c.lineWidth = lw(s * 0.012);
      if (o && o.joints) for (let X = x0 + o.joints * (0.5 + R() * 0.5); X < x1 - 0.15; X += o.joints * (0.8 + R() * 0.4)) { line(c, pt(X, y0, z0), pt(X, y1, z0)); if (y1 < eye) line(c, pt(X, y1, z0), pt(X, y1, z1)); }
      if (o && o.zj) for (let Z = z0 + o.zj * (0.5 + R() * 0.5); Z < z1 - 0.15; Z += o.zj * (0.8 + R() * 0.4)) { if (y1 < eye) line(c, pt(x0, y1, Z), pt(x1, y1, Z)); const xs = x1 < ex ? x1 : x0 > ex ? x0 : null; if (xs !== null) line(c, pt(xs, y0, Z), pt(xs, y1, Z)); }
    }
    /** Small irregular stones lying about. */
    function rubble(c, X, Z, n, size, spread) {
      for (let i = 0; i < n; i++) {
        const x0 = X + (R() - 0.5) * spread, z0 = Z + (R() - 0.5) * spread * 0.6, s = C.s(z0), r = size * (0.3 + R() * 0.7) * s, [x, y] = pt(x0, 0, z0);
        const ink = inkZ(z0), lit = litZ(z0), pts = [];
        for (let k = 0; k < 6; k++) { const a = Math.PI + (k / 5) * Math.PI, rk = r * (0.7 + R() * 0.5); pts.push([x + Math.cos(a) * rk * 1.3, y + Math.sin(a) * rk * 0.8]); }
        pts.push([x + r * 1.2, y + r * 0.15], [x - r * 1.2, y + r * 0.15]);
        const g = c.createLinearGradient(0, y - r * 0.8, 0, y + r * 0.15); // lit on top, in shadow below
        g.addColorStop(0, rgb(mix(ink, lit, 0.55))); g.addColorStop(0.45, rgb(mix(ink, lit, 0.2))); g.addColorStop(1, rgb(ink));
        c.fillStyle = g; K.rock(c, R, pts, Math.max(0.6, r * 0.25));
        if (r > 14) { c.strokeStyle = rgba(ink, 0.6); c.lineWidth = lw(r * 0.04); c.beginPath(); c.moveTo(x + (R() - 0.5) * r, y - r * 0.6); c.lineTo(x + (R() - 0.5) * r * 0.6, y - r * 0.2); c.lineTo(x + (R() - 0.5) * r, y + r * 0.1); c.stroke(); moss(c, x + (R() - 0.5) * r * 0.8, y - r * 0.6, r * 0.9, r * 0.3, 0.3); }
        c.strokeStyle = rgba(mix(ink, lit, 0.7), 0.7); c.lineWidth = lw(r * 0.12); c.beginPath(); c.moveTo(pts[1][0], pts[1][1] + r * 0.06); for (let k = 2; k < 5; k++) c.lineTo(pts[k][0], pts[k][1] + r * 0.06); c.stroke();
      }
    }
    /** A tuft of grass or small ferns in a crack. */
    function tuft(c, x, y, h, n, col) {
      c.strokeStyle = rgb(col); c.lineCap = 'round';
      for (let i = 0; i < n * 2; i++) {
        const lean = (R() - 0.5) * h * 1.1, hh = h * (0.3 + R() * 0.7);
        c.lineWidth = lw(h * 0.035); c.beginPath(); c.moveTo(x + (R() - 0.5) * h * 0.4, y); c.quadraticCurveTo(x + lean * 0.3, y - hh * 0.6, x + lean, y - hh); c.stroke();
      }
    }
    /** A fern: fronds arching out of a crown, each a rachis with leaflets shrinking to the tip. */
    function fern(c, x, y, len, n, dir, col, colLit) {
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + dir * (0.25 + (i / Math.max(1, n - 1)) * 1.15) + (R() - 0.5) * 0.25, ln = len * (0.65 + R() * 0.45), curl = dir * (0.5 + R() * 0.5);
        let px = x, py = y, a = a0;
        const segs = 16, sl = ln / segs, pts = [];
        for (let k = 0; k <= segs; k++) { pts.push([px, py, a]); a += (curl * 1.2) / segs; px += Math.cos(a) * sl; py += Math.sin(a) * sl; }
        c.strokeStyle = rgb(col); c.lineWidth = lw(len * 0.012); c.beginPath(); pts.forEach(([xx, yy], k) => (k ? c.lineTo(xx, yy) : c.moveTo(xx, yy))); c.stroke();
        for (let k = 2; k < segs; k++) {
          const [xx, yy, aa] = pts[k], pl = len * 0.13 * Math.sin(Math.PI * (k / segs) ** 0.7) * (1 - 0.3 * (k / segs));
          for (const sd of [-1, 1]) {
            const pa = aa + sd * 1.15 + dir * 0.25;
            c.fillStyle = rgb(sd < 0 ? colLit : col);
            c.beginPath(); c.ellipse(xx + Math.cos(pa) * pl * 0.5, yy + Math.sin(pa) * pl * 0.5, pl * 0.5, Math.max(0.5, pl * 0.14), pa, 0, TAU); c.fill();
          }
        }
      }
    }
    /** Ivy climbing a column: a winding stem (hidden round the back) and clusters of small lobed leaves. */
    function ivy(c, cx, r, Y0, Y1, Z, turns, ph) {
      const n = 60, leaf = Math.max(pv ? 0.8 : 1.2, r * 0.13), col = P.leaf, colL = mix(P.leaf, P.leafLit, 0.55);
      let prev = null;
      c.lineCap = 'round';
      for (let i = 0; i <= n; i++) {
        const k = i / n, Yw = Y0 + (Y1 - Y0) * k, th = ph + k * turns * TAU, sx = Math.sin(th), front = Math.cos(th) > -0.1;
        const x = cx + r * 0.96 * sx * (1 - 0.1 * k), y = C.y(Yw, Z) + (Math.cos(th) * r * 0.1);
        if (prev && front) { c.strokeStyle = rgb(col); c.lineWidth = lw(r * 0.035); c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke(); }
        prev = [x, y];
        if (!front || R() > 0.75 - 0.35 * k) continue;
        for (let j = 0; j < 2; j++) {
          const lx = x + (R() - 0.5) * leaf * 2.2, ly = y + (R() - 0.5) * leaf * 1.8, ls = leaf * (0.7 + R() * 0.6) * (1 - 0.35 * k);
          c.fillStyle = rgb(sx > 0.25 && R() < 0.6 ? colL : col);
          c.beginPath();
          for (let lo = 0; lo < 3; lo++) { const a = -Math.PI / 2 + (lo - 1) * 0.95 + (R() - 0.5) * 0.3; c.moveTo(lx, ly); c.ellipse(lx + Math.cos(a) * ls * 0.45, ly + Math.sin(a) * ls * 0.45, ls * 0.48, ls * 0.34, a, 0, TAU); }
          c.fill();
        }
      }
    }
    /** How far the front of a horizontal ring at height Y sits below its sides (above the eye it bows up). */
    const bow = (Y, Z, rw) => C.y(Y, Z - rw) - C.y(Y, Z);

    /** A column: plinth, torus, a fluted shaft of drums with entasis, a flared capital and abacus; or a broken stump. */
    function column(c, Xc, Z, o) {
      const s = C.s(Z), cx = C.x(Xc, Z), r = 0.5 * s, ink = inkZ(Z), lit = litZ(Z), big = r > 5;
      const Y0 = o.buried ? -0.4 : 0.62; // a buried column has no base to show: its foot is under rubble
      if (!o.buried) box(c, Xc - 0.72, Xc + 0.72, 0, 0.4, Z - 0.72, Z + 0.72, ink, lit);
      const ring = (Y0, Y1, rad, col) => { // a short band of turned stone between two heights
        const a = C.y(Y0, Z), b = C.y(Y1, Z), w = rad * s;
        c.fillStyle = col;
        c.beginPath(); c.moveTo(cx - w, b); c.lineTo(cx - w, a); c.quadraticCurveTo(cx, a + 2 * bow(Y0, Z, rad), cx + w, a); c.lineTo(cx + w, b); c.quadraticCurveTo(cx, b + 2 * bow(Y1, Z, rad), cx - w, b); c.closePath(); c.fill();
      };
      const shade = (x0, x1) => { // round stone lit from the right: a faint bounce on the left edge, a crisp rim on the right
        const g = c.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, rgb(mix(ink, lit, 0.22))); g.addColorStop(0.08, rgb(mix(ink, lit, 0.05))); g.addColorStop(0.55, rgb(ink)); g.addColorStop(0.76, rgb(mix(ink, lit, 0.4)));
        g.addColorStop(0.89, rgb(lit)); g.addColorStop(0.95, rgb(mix(ink, lit, 0.7))); g.addColorStop(1, rgb(mix(ink, lit, 0.3)));
        return g;
      };
      if (!o.buried) ring(0.4, 0.62, 0.62, shade(cx - r * 1.24, cx + r * 1.24));
      const top = o.broken || SHAFT_TOP, n = Math.max(6, Math.min(30, Math.round(r))), L0 = [], R0 = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, Yw = Y0 + (top - Y0) * k, kk = Math.max(0, (Yw - 0.62) / (SHAFT_TOP - 0.62));
        const ent = (1 - 0.12 * kk + 0.03 * Math.sin(Math.PI * Math.min(1, kk * 1.3))) * r;
        const y = C.y(Yw, Z);
        L0.push([cx - ent + (big && R() < 0.14 ? r * (0.03 + R() * 0.07) : 0), y]);
        R0.push([cx + ent - (big && R() < 0.14 ? r * (0.03 + R() * 0.07) : 0), y]);
      }
      const path = new Path2D();
      path.moveTo(L0[0][0], L0[0][1]);
      for (const p of L0) path.lineTo(p[0], p[1]);
      if (o.broken) { // a jagged break
        const yt = C.y(top, Z), m = 7;
        for (let j = 1; j < m; j++) path.lineTo(L0[n][0] + ((R0[n][0] - L0[n][0]) * j) / m, yt + (R() - 0.4) * r * 0.55 - Math.sin((j / m) * Math.PI) * r * 0.2 * (R() - 0.3));
      }
      for (let i = n; i >= 0; i--) path.lineTo(R0[i][0], R0[i][1]);
      path.closePath();
      c.fillStyle = shade(cx - r, cx + r); c.fill(path);
      if (big) {
        c.save(); c.clip(path);
        const yb = C.y(Y0, Z), yt = C.y(top, Z);
        // flutes: grooves round the shaft, visible where they face us, darker on the lit side
        const nf = 18, off = R() * TAU;
        for (let j = 0; j < nf; j++) {
          const th = off + (j / nf) * TAU, sx = Math.sin(th);
          if (Math.cos(th) < 0.15) continue;
          const shadeK = cl01((sx + 0.2) * 1.2);
          c.strokeStyle = rgba(ink, (0.25 + 0.5 * shadeK).toFixed(3)); c.lineWidth = lw(r * 0.05 * Math.cos(th));
          c.beginPath(); c.moveTo(cx + r * sx, yb); c.lineTo(cx + r * 0.88 * sx, C.y(SHAFT_TOP, Z)); c.stroke();
          if (sx > 0.1) { c.strokeStyle = rgba(lit, (0.35 * shadeK).toFixed(3)); c.lineWidth = lw(r * 0.03); c.beginPath(); c.moveTo(cx + r * sx - r * 0.06, yb); c.lineTo(cx + r * 0.88 * sx - r * 0.05, C.y(SHAFT_TOP, Z)); c.stroke(); }
        }
        // the joints between drums: rings bowed by the perspective, a chip here and there
        let Yj = 0.62 + rr(R, 0.9, 1.4);
        while (Yj < top - 0.3) {
          const y = C.y(Yj, Z), bw = bow(Yj, Z, 0.5);
          c.strokeStyle = rgba(ink, 0.85); c.lineWidth = lw(r * 0.035);
          c.beginPath(); c.moveTo(cx - r * 1.1, y); c.quadraticCurveTo(cx, y + 2 * bw, cx + r * 1.1, y); c.stroke();
          c.strokeStyle = rgba(lit, 0.4); c.lineWidth = lw(r * 0.022);
          c.beginPath(); c.moveTo(cx + r * 0.2, y + r * 0.05 + bw * 0.9); c.quadraticCurveTo(cx + r * 0.7, y + r * 0.04 + bw * 0.4, cx + r * 1.05, y + r * 0.04); c.stroke();
          if (R() < 0.4) { const sx = (R() < 0.5 ? -1 : 1) * r * (0.5 + R() * 0.4); c.fillStyle = rgb(ink); c.beginPath(); c.moveTo(cx + sx - r * 0.12, y); c.lineTo(cx + sx + r * 0.1, y - r * 0.02); c.lineTo(cx + sx, y + r * 0.13); c.closePath(); c.fill(); }
          Yj += rr(R, 0.9, 1.5);
        }
        // cracks
        for (let k = 0, nk = 1 + ((R() * 2.6) | 0); k < nk; k++) {
          let x = cx + (R() - 0.3) * r * 1.2, y = yt + (yb - yt) * (0.1 + R() * 0.7);
          const pts = [[x, y]];
          for (let j = 0; j < 7; j++) { x += (R() - 0.5) * r * 0.25; y += r * (0.12 + R() * 0.22); pts.push([x, y]); }
          c.strokeStyle = rgba(ink, 0.9); c.lineWidth = lw(r * 0.03); c.beginPath(); pts.forEach(([xx, yy], j) => (j ? c.lineTo(xx, yy) : c.moveTo(xx, yy))); c.stroke();
          c.strokeStyle = rgba(lit, 0.3); c.lineWidth = lw(r * 0.018); c.beginPath(); pts.forEach(([xx, yy], j) => (j ? c.lineTo(xx + r * 0.04, yy) : c.moveTo(xx + r * 0.04, yy))); c.stroke();
        }
        // moss creeping up from the foot and streaking down from the top
        const mossG = c.createLinearGradient(0, yb, 0, yb - r * 2.2);
        mossG.addColorStop(0, rgba(P.moss, 0.85)); mossG.addColorStop(1, rgba(P.moss, 0));
        c.fillStyle = mossG; c.fillRect(cx - r * 1.2, yb - r * 2.2, r * 2.4, r * 2.2);
        c.restore();
      }
      if (o.broken) { // moss and a little fern on the break
        const yt = C.y(top, Z);
        for (let i = 0; i < (big ? 4 : 2); i++) moss(c, cx + (R() - 0.5) * r * 1.3, yt + (R() - 0.1) * r * 0.2, r * (0.6 + R() * 0.6), r * (0.25 + R() * 0.2));
        if (big) fern(c, cx + (R() - 0.5) * r * 0.6, yt - r * 0.05, r * 1.1, 4, R() < 0.5 ? -1 : 1, P.leaf, mix(P.leaf, P.leafLit, 0.5));
        return;
      }
      // the capital: a flared echinus with carved leaves, then the square abacus
      const ya = C.y(SHAFT_TOP, Z), yb2 = C.y(CAP, Z), r0 = r * 0.88, r1 = r * 1.34;
      c.fillStyle = shade(cx - r1, cx + r1);
      c.beginPath(); c.moveTo(cx - r0, ya); c.quadraticCurveTo(cx - r0 * 1.02, (ya + yb2) / 2, cx - r1, yb2); c.lineTo(cx + r1, yb2); c.quadraticCurveTo(cx + r0 * 1.02, (ya + yb2) / 2, cx + r0, ya); c.quadraticCurveTo(cx, ya + 2 * bow(SHAFT_TOP, Z, 0.44), cx - r0, ya); c.closePath(); c.fill();
      if (big) {
        for (let j = -4; j <= 4; j++) { // leaves round the bell
          const k = j / 4.6, x0 = cx + k * r0, x1 = cx + k * r1 * 0.96;
          c.strokeStyle = rgba(k > 0.1 ? lit : ink, k > 0.1 ? 0.45 : 0.7); c.lineWidth = lw(r * 0.04);
          c.beginPath(); c.moveTo(x0, ya + bow(SHAFT_TOP, Z, 0.44) * (1 - k * k)); c.quadraticCurveTo(x0 + (x1 - x0) * 0.2, (ya + yb2) / 2, x1, yb2 + r * 0.05); c.stroke();
        }
        c.strokeStyle = rgba(ink, 0.8); c.lineWidth = lw(r * 0.04); // annulets
        for (const Yr of [SHAFT_TOP - 0.08, SHAFT_TOP - 0.16]) { const y = C.y(Yr, Z); c.beginPath(); c.moveTo(cx - r0, y); c.quadraticCurveTo(cx, y + 2 * bow(Yr, Z, 0.45), cx + r0, y); c.stroke(); }
      }
      box(c, Xc - 0.74, Xc + 0.74, CAP, ABA, Z - 0.74, Z + 0.74, ink, lit);
      if (big) { // moss on the abacus' edge, a few strands hanging from it
        const y = C.y(CAP, Z);
        for (let i = 0; i < 3; i++) moss(c, cx + (R() - 0.5) * r * 2.2, y - r * 0.05, r * (0.5 + R() * 0.5), r * 0.22, 0.3);
        c.strokeStyle = rgb(P.moss); c.lineWidth = lw(r * 0.03);
        for (let i = 0; i < 5; i++) { const x = cx + (R() - 0.5) * r * 2.4, hh = r * (0.2 + R() * 0.6); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + r * 0.05, y + hh * 0.6, x + (R() - 0.5) * r * 0.1, y + hh); c.stroke(); }
      }
    }

    /* the back of the hall: roof, side walls, the far wall and its portal (drawn faint: mostly the page shows) */
    { // the roof: coffers between beams (the holes are broken through it below)
      const Z0 = 2.2, c = bc, ink = inkZ(18), lit = litZ(18);
      c.fillStyle = rgba(ink, 0.6); poly(c, [pt(-Dw, YC, Z0), pt(Dw, YC, Z0), pt(Dw, YC, ZF), pt(-Dw, YC, ZF)]); c.fill();
      for (let i = 0; i < NC; i++) { // transverse beams over each pair of columns, coffer frames between
        const Z = ZN + i * SP;
        if (Z < 9) continue;
        face(c, [pt(-Dw, YC - 0.35, Z - 0.3), pt(Dw, YC - 0.35, Z - 0.3), pt(Dw, YC - 0.35, Z + 0.3), pt(-Dw, YC - 0.35, Z + 0.3)], rgba(ink, 0.95));
        face(c, [pt(-Dw, YC - 0.35, Z - 0.3), pt(Dw, YC - 0.35, Z - 0.3), pt(Dw, YC, Z - 0.3), pt(-Dw, YC, Z - 0.3)], rgba(mix(ink, lit, 0.3), 0.95));
        for (let X = -Dw + 1.1; X < Dw - 0.5; X += 1.32) { // a coffer: a recessed square with a lit inner edge
          const z0 = Z + 0.45, z1 = Z + SP - 0.75;
          if (z1 > ZF) continue;
          c.strokeStyle = rgba(mix(ink, lit, 0.45), 0.55); c.lineWidth = lw(C.s(z0) * 0.03);
          poly(c, [pt(X, YC, z0), pt(X + 1.0, YC, z0), pt(X + 1.0, YC, z1), pt(X, YC, z1)]); c.stroke();
        }
      }
      for (const side of [-1, 1]) face(c, [pt(side * (D - 0.5), YC - 0.4, Z0), pt(side * (D + 0.5), YC - 0.4, Z0), pt(side * (D + 0.5), YC - 0.4, ZF), pt(side * (D - 0.5), YC - 0.4, ZF)], rgba(ink, 0.9)); // beams along the colonnades
    }
    const holes = [ // the broken roof (world X, Z, radius): the shafts come down through these
      { X: 2.06, Z: 8.96, r: 0.95 }, { X: 4.66, Z: 13.86, r: 0.75 }, { X: 1.46, Z: 5.76, r: 0.8 }, { X: 1.46, Z: 19.36, r: 0.75 }, { X: -0.74, Z: 11.86, r: 0.6 },
    ];
    for (const ho of holes) { // ragged holes: the page shows through, a little sky light at the rim
      const pts = [];
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, rk = ho.r * (0.7 + R() * 0.55); pts.push(pt(ho.X + Math.cos(a) * rk * 1.2, YC, ho.Z + Math.sin(a) * rk)); }
      bc.save(); bc.globalCompositeOperation = 'destination-out'; bc.fillStyle = '#000'; K.rock(bc, R, pts, Math.max(1, C.s(ho.Z) * 0.08)); bc.restore();
      const [hx, hy] = pt(ho.X, YC, ho.Z), hr = ho.r * C.s(ho.Z) * 1.6;
      if (!L) { const g = bc.createRadialGradient(hx, hy, 0, hx, hy, hr); g.addColorStop(0, rgba(P.sky, 0.22)); g.addColorStop(1, rgba(P.sky, 0)); bc.fillStyle = g; bc.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); }
      for (let k = 0; k < 7; k++) { const a = R() * TAU, [lx, ly] = pt(ho.X + Math.cos(a) * ho.r * 1.2, YC, ho.Z + Math.sin(a) * ho.r), ls = C.s(ho.Z) * (0.3 + R() * 0.35); bc.drawImage(K.tint(mossSpr((R() * 3) | 0), rgb(P.leaf)), lx - ls / 2, ly - ls * 0.2, ls, ls * 0.4); } // growth round the hole's rim
    }
    { // the side walls: courses of masonry, tall arched windows between the columns
      const c = bc;
      for (const side of [-1, 1]) {
        const X = side * Dw, ink = inkZ(16), lit = litZ(16);
        const g = c.createLinearGradient(C.x(X, 4), 0, C.x(X, ZF), 0);
        g.addColorStop(0, rgba(ink, 0.32)); g.addColorStop(1, rgba(ink, 0.5));
        c.fillStyle = g; poly(c, [pt(X, 0, 2.6), pt(X, YC, 2.6), pt(X, YC, ZF), pt(X, 0, ZF)]); c.fill();
        c.strokeStyle = rgba(ink, 0.55);
        for (let Yk = 0.55; Yk < YC; Yk += 0.62) { c.lineWidth = lw(u * 0.0012); line(c, pt(X, Yk, 3), pt(X, Yk, ZF)); }
        for (let Z = 3.2; Z < ZF; Z += 1.25) { // the joints, staggered course by course
          const s = C.s(Z);
          if (s < 6) break;
          c.lineWidth = lw(s * 0.012);
          for (let Yk = 0.55, row = 0; Yk < YC - 0.6; Yk += 0.62, row++) { const z = Z + (row % 2) * 0.62; if (R() < 0.8) line(c, pt(X, Yk, z), pt(X, Yk + 0.62, z)); }
        }
        for (let i = 1; i < NC; i++) { // windows: light from outside, vines across them
          const Zc = ZN + (i - 0.5) * SP, z0 = Zc - 0.7, z1 = Zc + 0.7, y0 = 1.4, y1 = 4.6;
          if (C.s(Zc) < 4) continue;
          const win = new Path2D(), [ax, ay] = pt(X, y0, z0), [bx, by] = pt(X, y0, z1), [tx, ty] = pt(X, y1, z1), [sx2, sy2] = pt(X, y1, z0), [mx, my] = pt(X, y1 + 0.9, Zc);
          win.moveTo(ax, ay); win.lineTo(bx, by); win.lineTo(tx, ty); win.quadraticCurveTo(2 * mx - (tx + sx2) / 2, 2 * my - (ty + sy2) / 2, sx2, sy2); win.closePath();
          c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(win); c.restore();
          if (!L) { c.fillStyle = rgba(P.sky, 0.07 + R() * 0.05); c.fill(win); }
          c.strokeStyle = rgba(mix(ink, lit, 0.6), 0.6); c.lineWidth = lw(C.s(Zc) * 0.05); c.stroke(win); // the reveal catches the light
          c.strokeStyle = rgb(P.leaf); c.lineWidth = lw(C.s(Zc) * 0.025);
          for (let k = 0; k < 2; k++) { const [vx0, vy0] = pt(X, y1 + 0.3, z0 + R() * 1.4); c.beginPath(); c.moveTo(vx0, vy0); c.quadraticCurveTo(vx0 + (R() - 0.5) * C.s(Zc) * 0.5, vy0 + C.s(Zc) * 1.2, vx0 + (R() - 0.5) * C.s(Zc) * 0.4, vy0 + C.s(Zc) * (1.4 + R() * 1.2)); c.stroke(); }
        }
      }
    }
    // the far wall, its portal open on the jungle; steps up to it
    const pw = 1.9, pTop = 4.3, [pcx] = pt(0, 0, ZF), sF = C.s(ZF);
    {
      const c = bc, ink = inkZ(ZF), lit = litZ(ZF);
      const wall = new Path2D();
      const [a1, a2] = [pt(-Dw, 0, ZF), pt(Dw, YC, ZF)];
      wall.rect(a1[0], a2[1], a2[0] - a1[0], a1[1] - a2[1]);
      const portal = new Path2D(), [p0x, p0y] = pt(-pw, 0, ZF), [p1x] = pt(pw, 0, ZF), pty = C.y(pTop, ZF);
      portal.moveTo(p0x, p0y); portal.lineTo(p0x, pty); portal.arc((p0x + p1x) / 2, pty, (p1x - p0x) / 2, Math.PI, 0); portal.lineTo(p1x, p0y); portal.closePath();
      c.save(); c.clip(wall);
      c.fillStyle = rgba(ink, 0.55); c.fill(wall);
      c.strokeStyle = rgba(ink, 0.7); c.lineWidth = lw(sF * 0.03);
      for (let Yk = 0.55; Yk < YC; Yk += 0.62) line(c, pt(-Dw, Yk, ZF), pt(Dw, Yk, ZF));
      for (let Yk = 0.55, row = 0; Yk < YC; Yk += 0.62, row++) for (let X = -Dw + (row % 2) * 0.6; X < Dw; X += 1.2) if (R() < 0.85) line(c, pt(X, Yk, ZF), pt(X, Yk + 0.62, ZF));
      c.restore();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(portal); c.restore();
      // through the portal: daylight, and the jungle
      c.save(); c.clip(portal);
      const pwx = p1x - p0x, ptop = pty - pwx / 2, ph = p0y - ptop;
      const pcy = C.y(pTop * 0.85, ZF), gr = pw * sF * 2.2, g = c.createRadialGradient(pcx, pcy, 0, pcx, pcy, gr);
      if (!L) { g.addColorStop(0, rgba(P.sky, 0.28)); g.addColorStop(0.55, rgba(P.sky, 0.16)); g.addColorStop(1, rgba(P.sky, 0.06)); c.fillStyle = g; c.fill(portal); }
      // the jungle outside: a far wall of foliage, hazed; trunks; nearer leaves thick at the threshold
      const jfar = K.noiseTex('ruJungleF', 256, 192, { px: 7, py: 5, oct: 5, lo: 0.44, hi: 0.6, warp: 1.4, env: 'up', seed: 71 });
      const jnear = K.noiseTex('ruJungleN', 256, 192, { px: 5, py: 4, oct: 5, lo: 0.47, hi: 0.6, warp: 1.6, env: 'up', seed: 73 });
      c.globalAlpha = L ? 0.4 : 0.55; c.drawImage(K.tint(jfar, rgb(L ? mix(P.jungle, [255, 255, 255], 0.35) : mix(P.jungle, P.sky, 0.3))), p0x - pwx * 0.1, ptop + ph * 0.05, pwx * 1.2, ph * 0.9);
      c.globalAlpha = 1; c.strokeStyle = rgba(P.jungle, L ? 0.55 : 0.8);
      for (const k of [0.16, 0.58, 0.83]) { const x = p0x + pwx * (k + (R() - 0.5) * 0.08), lean = (R() - 0.5) * pwx * 0.12, wd = sF * (0.06 + R() * 0.05), top = ptop + ph * (0.05 + R() * 0.2); for (let j = 0; j < 4; j++) { const y0 = p0y - (p0y - top) * (j / 4), y1 = p0y - (p0y - top) * ((j + 1) / 4); c.lineWidth = lw(wd * (1 - j * 0.22)); c.beginPath(); c.moveTo(x + lean * (j / 4) ** 2, y0); c.lineTo(x + lean * ((j + 1) / 4) ** 2, y1); c.stroke(); } const fy = p0y - (p0y - top) * 0.7; c.lineWidth = lw(wd * 0.4); c.beginPath(); c.moveTo(x + lean * 0.5, fy); c.quadraticCurveTo(x + lean * 0.5 + sF * 0.3, fy - sF * 0.4, x + lean + sF * (0.4 + R() * 0.3), fy - sF * (0.8 + R() * 0.5)); c.stroke(); }
      c.globalAlpha = L ? 0.6 : 0.9; c.drawImage(K.tint(jnear, rgb(P.jungle)), p0x - pwx * 0.15, ptop + ph * 0.35, pwx * 1.3, ph * 0.7);
      c.globalAlpha = 1;
      c.restore();
      c.strokeStyle = rgba(mix(ink, lit, 0.7), 0.75); c.lineWidth = lw(sF * 0.1); c.stroke(portal); // the portal's frame
      for (let k = 0; k < 3; k++) box(c, -pw - 0.6 - k * 0.25, pw + 0.6 + k * 0.25, 0, 0.36 - k * 0.12, ZF - 0.5 - k * 0.45, ZF - k * 0.45, ink, lit); // steps
      // vines down the far wall
      c.strokeStyle = rgba(P.leaf, 0.9);
      for (let i = 0; i < 8; i++) { const [x0, y0] = pt(-Dw + R() * 2 * Dw, YC, ZF); c.lineWidth = lw(sF * 0.04); c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + (R() - 0.5) * sF, y0 + sF * 2, x0 + (R() - 0.5) * sF * 0.6, y0 + sF * (2.5 + R() * 3)); c.stroke(); }
    }

    /* the middle of the hall: the floor, the far colonnades with their architraves, the pool */
    { // the floor: worn flagstones, darker near the eye, catching a sheen from the portal; grass in the gaps
      const c = mc, xs = [], step = 1.25;
      for (let X = -Dw; X <= Dw + 0.01; X += step) xs.push(X);
      const inPool = (X, Z) => X > -2 && X < 2 && Z > 5.9 && Z < 9.8;
      for (let Z = 2.5; Z < ZF; Z += step) {
        const z1 = Math.min(ZF, Z + step), s = C.s(Z), sheen = cl01((Z - 9) / 16) ** 1.2;
        for (let i = 0; i < xs.length - 1; i++) {
          const X = xs[i], Xm = X + step / 2;
          if (inPool(Xm, (Z + z1) / 2)) continue;
          const near = Math.exp(-((Xm - 0.2) ** 2) / 10), base = L ? 0.07 + R() * 0.12 : 0.12 + R() * 0.16;
          const col = mix(inkZ(Z), litZ(Z), sheen * near * 0.85);
          face(c, [pt(X, 0, Z), pt(X + step, 0, Z), pt(X + step, 0, z1), pt(X, 0, z1)], rgba(col, (base * (1 - 0.35 * fade(Z)) + sheen * near * (L ? 0.14 : 0.22)).toFixed(3)));
          if (s > 25 && R() < 0.1) tuft(c, C.x(X + R() * step, Z), C.y(0, Z), s * 0.12, 4, P.moss);
        }
        c.strokeStyle = rgba(inkZ(Z), 0.42); c.lineWidth = lw(s * 0.012);
        for (let i = 0; i < xs.length - 1; i++) if (R() < 0.85 && !inPool(xs[i] + step / 2, Z)) line(c, pt(xs[i], 0, Z), pt(xs[i] + step, 0, Z));
        for (let i = 0; i < xs.length; i++) if (R() < 0.85 && !inPool(xs[i], Z + step / 2)) line(c, pt(xs[i], 0, Z), pt(xs[i], 0, z1));
      }
    }
    const cols = []; // which columns stand, which are broken
    const brokenAt = { 'L2': 4.4, 'R2': 3.2, 'L5': 2.4, 'R7': 5.1, 'L8': 1.6 };
    for (let i = NC - 1; i >= 0; i--) for (const side of [-1, 1]) { const k = (side < 0 ? 'L' : 'R') + i; cols.push({ i, side, Z: ZN + i * SP, X: side * D, broken: brokenAt[k] || 0, ivy: R() < 0.45 }); }
    const drawCol = (c, cc) => {
      column(c, cc.X, cc.Z, { broken: cc.broken });
      if (cc.ivy && C.s(cc.Z) * 0.5 > 5) ivy(c, C.x(cc.X, cc.Z), C.s(cc.Z) * 0.5, 0.5, (cc.broken || SHAFT_TOP) * (0.45 + R() * 0.5), cc.Z, 1.2 + R(), R() * TAU);
      rubble(c, cc.X + (R() - 0.5) * 1.6, cc.Z + (R() - 0.5), 2 + ((R() * 3) | 0), 0.18, 1.4);
    };
    // architraves along each colonnade, broken where a column has fallen
    const architrave = (c, side) => {
      const runs = [];
      let run = null;
      for (let i = 0; i < NC; i++) {
        const cc = cols.find((o) => o.i === i && o.side === side);
        if (!cc.broken) { if (!run) run = [i, i]; else run[1] = i; } else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      for (const [i0, i1] of runs) {
        if (i1 === i0 && i0 < NC - 1) continue;
        const z0 = ZN + i0 * SP - (i0 === 0 ? 0.8 : 0.4), z1 = i1 === NC - 1 ? ZF : ZN + i1 * SP + 0.6, X = side * D, ink = inkZ((z0 + z1) / 2 + 3), lit = litZ((z0 + z1) / 2 + 3);
        box(c, X - 0.76, X + 0.76, ABA, ARCH, z0, z1, ink, lit);
        box(c, X - (side < 0 ? 0.76 : 0.98), X + (side < 0 ? 0.98 : 0.76), ARCH, ARCH + 0.2, z0, z1, ink, lit); // the cornice
        const xf = X - side * 0.76; // the inner face: fasciae, a row of dentils under the cornice
        c.strokeStyle = rgba(side < 0 ? ink : lit, side < 0 ? 0.55 : 0.3);
        for (const Yf of [ABA + 0.3, ABA + 0.55]) { c.lineWidth = lw(C.s(z0) * 0.02); line(c, pt(xf, Yf, z0), pt(xf, Yf, z1)); }
        c.fillStyle = rgba(side < 0 ? mix(ink, lit, 0.3) : ink, 0.9);
        for (let z = z0 + 0.1; z < z1 - 0.1; z += 0.34) { if (C.s(z) < 5) break; face(c, [pt(xf, ARCH - 0.12, z), pt(xf, ARCH - 0.12, z + 0.18), pt(xf, ARCH, z + 0.18), pt(xf, ARCH, z)], c.fillStyle); }
        // a broken end where the run stops
        for (const [ze, d] of [[z0, -1]]) {
          if (i0 === 0) continue;
          const pts = [];
          for (let k = 0; k <= 6; k++) pts.push(pt(X - 0.76 + (1.52 * k) / 6, ARCH - R() * 0.4, ze + d * R() * 0.2));
          c.fillStyle = rgb(ink); pts.push(pt(X + 0.76, ABA, ze), pt(X - 0.76, ABA, ze)); K.rock(c, R, pts, C.s(ze) * 0.05);
        }
        // moss along the soffit's edge, strands of it hanging down
        for (let z = z0 + 0.3; z < z1; z += 0.6 + R() * 1.1) {
          const [mx, my] = pt(xf, ABA, z), s = C.s(z);
          if (s < 4) break;
          moss(c, mx, my + s * 0.02, s * (0.3 + R() * 0.4), s * 0.09, 0.2);
          c.strokeStyle = rgb(P.moss); c.lineWidth = lw(s * 0.018);
          for (let k = 0; k < 3; k++) { if (R() < 0.4) continue; const sx = mx + (R() - 0.5) * s * 0.3, hh = s * (0.1 + R() * 0.45); c.beginPath(); c.moveTo(sx, my); c.quadraticCurveTo(sx + s * 0.02, my + hh * 0.6, sx + (R() - 0.5) * s * 0.05, my + hh); c.stroke(); }
        }
      }
    };
    for (const cc of cols) if (cc.Z > ZN + SP + 0.1) drawCol(mc, cc);
    architrave(mc, -1); architrave(mc, 1);
    // collapsed pieces of architrave on the floor under the gaps
    for (const [X, Z, a] of [[-2.2, ZN + 5 * SP - 0.4, 0.3], [2.4, ZN + 7 * SP + 0.6, -0.25], [-1.9, ZN + 8 * SP, 0.1]]) {
      const ink = inkZ(Z), lit = litZ(Z);
      box(mc, X - 0.55, X + 0.55 + a, 0, 0.5, Z - 0.7, Z + 0.7, ink, lit);
      rubble(mc, X, Z - 0.6, 4, 0.2, 1.6);
    }
    // the pool: a stone curb, still dark water (its reflections are drawn per frame)
    const PX0 = -1.65, PX1 = 1.65, PZ0 = 6.3, PZ1 = 9.4, PY = 0.16;
    {
      const c = mc, ink = inkZ(8), lit = litZ(8);
      box(c, PX0 - 0.3, PX1 + 0.3, 0, 0.28, PZ1, PZ1 + 0.3, ink, lit, { joints: 0.85 });
      c.fillStyle = rgba(P.water, L ? 0.42 : 0.82); poly(c, [pt(PX0, PY, PZ0), pt(PX1, PY, PZ0), pt(PX1, PY, PZ1), pt(PX0, PY, PZ1)]); c.fill();
      box(c, PX0 - 0.3, PX0, 0, 0.28, PZ0, PZ1, ink, lit, { zj: 0.9 });
      box(c, PX1, PX1 + 0.3, 0, 0.28, PZ0, PZ1, ink, lit, { zj: 0.9 });
      box(c, PX0 - 0.3, PX1 + 0.3, 0, 0.28, PZ0 - 0.3, PZ0, mix(ink, P.ink, 0.5), mix(lit, ink, 0.25), { joints: 0.85 });
      for (let i = 0; i < 9; i++) { const X = PX0 - 0.3 + R() * (PX1 - PX0 + 0.6), [mx, my] = pt(X, 0.28, PZ0 - 0.15), s = C.s(PZ0); moss(c, mx, my, s * (0.2 + R() * 0.35), s * (0.06 + R() * 0.05), 0.35); } // moss along the curb
      for (let i = 0; i < 5; i++) { const Z = PZ0 + R() * (PZ1 - PZ0), [mx, my] = pt(R() < 0.5 ? PX0 - 0.15 : PX1 + 0.15, 0.28, Z), s = C.s(Z); moss(c, mx, my, s * (0.12 + R() * 0.2), s * 0.06, 0.3); }
      for (const [X, Z] of [[PX0 - 0.15, PZ0 - 0.1], [PX1 + 0.2, PZ1 + 0.1]]) tuft(c, C.x(X, Z), C.y(0.28, Z), C.s(Z) * 0.28, 6, P.moss);
    }
    const water = new Path2D(); { const ps = [pt(PX0, PY, PZ0), pt(PX1, PY, PZ0), pt(PX1, PY, PZ1), pt(PX0, PY, PZ1)]; water.moveTo(ps[0][0], ps[0][1]); for (const p of ps.slice(1)) water.lineTo(p[0], p[1]); water.closePath(); }

    /* the near hall: the nearest columns, the fallen column, the head of the colossus, ferns */
    for (const cc of cols) if (cc.Z <= ZN + SP + 0.1 && cc.Z > ZN + 0.1) drawCol(fc, cc);
    { // a fallen column, lying in drums
      const c = fc, Z = 5.0, s = C.s(Z), [x0, y0] = pt(-3.7, 0, Z), ink = inkZ(Z), lit = litZ(Z);
      const drums = [[0, 0.95, -0.05], [1.02, 0.85, 0.04], [1.94, 0.7, 0.13]];
      for (const [o, len, ang] of drums) {
        const rad = 0.42 * s, Lx = len * s, x = x0 + o * s, y = y0 - rad * 0.96 + o * s * 0.04, ew = rad * 0.26; // ew: the end seen at a slant
        c.save(); c.translate(x, y); c.rotate(ang);
        const body = [];
        for (let k = 0; k <= 10; k++) body.push([Lx * (k / 10), -rad + (k && k < 10 && R() < 0.35 ? R() * rad * 0.09 : 0)]); // the top, chipped
        for (let k = 1; k < 8; k++) { const a = Math.PI / 2 - (k / 8) * Math.PI; body.push([Lx + Math.cos(a) * ew, -Math.sin(a) * rad]); }
        for (let k = 10; k >= 0; k--) body.push([Lx * (k / 10), rad]);
        for (let k = 1; k < 8; k++) { const a = -Math.PI / 2 + (k / 8) * Math.PI; body.push([-Math.cos(a) * ew * (0.9 + R() * 0.25), -Math.sin(a) * rad]); } // the hidden end: just its rounded outline
        const g = c.createLinearGradient(0, -rad, 0, rad);
        g.addColorStop(0, rgb(mix(ink, lit, 0.7))); g.addColorStop(0.22, rgb(mix(ink, lit, 0.32))); g.addColorStop(0.55, rgb(ink)); g.addColorStop(1, rgb(ink));
        c.fillStyle = g; poly(c, body); c.fill();
        c.save(); poly(c, body); c.clip();
        c.strokeStyle = rgba(ink, 0.45); c.lineWidth = lw(s * 0.01); // flutes along the drum
        for (let k = -3; k <= 3; k++) { const yy = rad * Math.sin((k / 4) * (Math.PI / 2)); c.beginPath(); c.moveTo(-ew, yy); c.lineTo(Lx, yy); c.stroke(); }
        c.restore();
        const end = []; // the end facing us, its rim knocked about
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, j = 1 - (R() < 0.3 ? R() * 0.1 : 0); end.push([Lx + Math.cos(a) * ew * j, Math.sin(a) * rad * j]); }
        c.fillStyle = rgb(mix(ink, lit, 0.3)); poly(c, end); c.fill();
        c.strokeStyle = rgba(ink, 0.35); c.lineWidth = lw(s * 0.008); c.beginPath(); c.ellipse(Lx, 0, ew * 0.6, rad * 0.62, 0, 0, TAU); c.stroke();
        c.fillStyle = rgba(ink, 0.6); c.beginPath(); c.ellipse(Lx, 0, ew * 0.12, rad * 0.09, 0, 0, TAU); c.fill(); // its dowel socket
        for (let k = 0; k < 3; k++) moss(c, Lx * (0.15 + R() * 0.7), -rad * 0.92, s * (0.25 + R() * 0.3), s * 0.08, 0.4);
        c.restore();
      }
      rubble(c, -2.9, 4.6, 6, 0.2, 2.2);
      fern(c, x0 + s * 0.2, y0, s * 0.7, 6, -1, P.leaf, mix(P.leaf, P.leafLit, 0.45));
    }
    { // the head of a fallen colossus, lying on the back of its skull, face to the roof
      const c = fc, Z = 5.0, s = C.s(Z) * 1.12, hy0 = C.y(0, Z), hx0 = Math.min(C.x(1.75, Z), W - s * 1.12), ink = inkZ(Z), lit = litZ(Z);
      const P2 = (uu, vv) => [hx0 + uu * s, hy0 - vv * s];
      const out = [[0.45, 0.0], [0.18, 0.07], [0.03, 0.24], [0.0, 0.45], [0.05, 0.62], [0.14, 0.73], [0.26, 0.8], [0.37, 0.845], [0.43, 0.8], [0.48, 0.84], [0.56, 0.9], [0.6, 0.925], [0.635, 0.875], [0.66, 0.85], [0.69, 0.845], [0.71, 0.865], [0.735, 0.825], [0.76, 0.855], [0.8, 0.805], [0.86, 0.83], [0.9, 0.825], [0.95, 0.75], [0.96, 0.62]];
      const brk = [[1.0, 0.6], [1.04, 0.5], [1.01, 0.42], [1.06, 0.31], [1.03, 0.21], [1.05, 0.12], [0.86, 0.04], [0.62, 0.0]];
      const hp = new Path2D(), Q = out.map(([a, b]) => P2(a, b));
      hp.moveTo((Q[0][0] + Q[1][0]) / 2, (Q[0][1] + Q[1][1]) / 2);
      for (let i = 1; i < Q.length - 1; i++) hp.quadraticCurveTo(Q[i][0], Q[i][1], (Q[i][0] + Q[i + 1][0]) / 2, (Q[i][1] + Q[i + 1][1]) / 2);
      hp.lineTo(...Q[Q.length - 1]);
      for (const [a, b] of brk) hp.lineTo(...P2(a + (R() - 0.5) * 0.015, b));
      hp.closePath();
      const g = c.createLinearGradient(0, hy0 - s * 0.93, 0, hy0);
      g.addColorStop(0, rgb(lit)); g.addColorStop(0.16, rgb(mix(ink, lit, 0.75))); g.addColorStop(0.5, rgb(mix(ink, lit, 0.32))); g.addColorStop(1, rgb(ink));
      c.fillStyle = g; c.fill(hp);
      c.save(); c.clip(hp);
      const cheek = c.createRadialGradient(...P2(0.6, 0.62), 0, ...P2(0.6, 0.62), s * 0.3);
      cheek.addColorStop(0, rgba(lit, 0.38)); cheek.addColorStop(1, rgba(lit, 0)); c.fillStyle = cheek; c.fillRect(hx0, hy0 - s, s * 1.1, s);
      const stroke = (pts, col, wd) => { c.strokeStyle = col; c.lineWidth = lw(s * wd); c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(...P2(a, b)) : c.moveTo(...P2(a, b)))); c.stroke(); };
      const curve = (a, b, cc2, col, wd) => { c.strokeStyle = col; c.lineWidth = lw(s * wd); c.beginPath(); c.moveTo(...P2(...a)); c.quadraticCurveTo(...P2(...b), ...P2(...cc2)); c.stroke(); };
      const hollow = (a, b2, rad, al) => { const [gx, gy] = P2(a, b2), gg = c.createRadialGradient(gx, gy, 0, gx, gy, s * rad); gg.addColorStop(0, rgba(ink, al)); gg.addColorStop(1, rgba(ink, 0)); c.fillStyle = gg; c.fillRect(gx - s * rad, gy - s * rad, s * rad * 2, s * rad * 2); };
      hollow(0.44, 0.75, 0.075, 0.55); hollow(0.66, 0.79, 0.05, 0.45); hollow(0.745, 0.8, 0.035, 0.4); hollow(0.5, 0.43, 0.06, 0.45); hollow(0.9, 0.7, 0.07, 0.35); // eye socket, under the nose, the mouth, the ear, under the chin
      const groove = (a, b2, cc2, wd, al) => { curve(a, b2, cc2, rgba(ink, al), wd); curve([a[0], a[1] - 0.008], [b2[0], b2[1] - 0.008], [cc2[0], cc2[1] - 0.008], rgba(lit, al * 0.45), wd * 0.7); }; // cut into the stone: a dark line, its lower lip catching light
      groove([0.395, 0.745], [0.44, 0.705], [0.485, 0.745], 0.008, 0.75); // the closed lid
      groove([0.37, 0.795], [0.42, 0.765], [0.47, 0.785], 0.006, 0.4); // the brow
      groove([0.625, 0.84], [0.66, 0.79], [0.645, 0.76], 0.007, 0.6); // the wing of the nose
      groove([0.735, 0.822], [0.745, 0.785], [0.725, 0.76], 0.006, 0.6); // the corner of the mouth
      const ear = new Path2D(); ear.moveTo(...P2(0.41, 0.46)); ear.bezierCurveTo(...P2(0.39, 0.38), ...P2(0.5, 0.34), ...P2(0.57, 0.38)); ear.bezierCurveTo(...P2(0.61, 0.42), ...P2(0.56, 0.49), ...P2(0.51, 0.49));
      c.strokeStyle = rgba(ink, 0.6); c.lineWidth = lw(s * 0.008); c.stroke(ear);
      groove([0.45, 0.44], [0.49, 0.39], [0.54, 0.42], 0.006, 0.45);
      curve([0.88, 0.6], [0.72, 0.42], [0.62, 0.33], rgba(ink, 0.3), 0.008); // the jaw's edge
      groove([0.18, 0.77], [0.21, 0.42], [0.2, 0.08], 0.008, 0.55); // a band round the brow, hair in waves behind it
      groove([0.23, 0.79], [0.26, 0.42], [0.25, 0.07], 0.006, 0.45);
      for (let k = 0; k < 5; k++) { const vv = 0.14 + k * 0.12; c.strokeStyle = rgba(ink, 0.35); c.lineWidth = lw(s * 0.006); c.beginPath(); c.moveTo(...P2(0.16, vv)); c.bezierCurveTo(...P2(0.11, vv + 0.04), ...P2(0.07, vv - 0.03), ...P2(0.03, vv + 0.03)); c.stroke(); }
      stroke([[0.3, 0.83], [0.34, 0.66], [0.31, 0.55], [0.36, 0.4], [0.33, 0.25], [0.37, 0.1]], rgba(ink, 0.8), 0.008); // a crack across the face
      stroke([[0.31, 0.83], [0.352, 0.66], [0.322, 0.55], [0.372, 0.4]], rgba(lit, 0.3), 0.004);
      c.restore();
      for (const [a, b, ww] of [[0.1, 0.68, 0.2], [0.27, 0.81, 0.14], [0.03, 0.42, 0.12], [0.58, 0.91, 0.06]]) { const [mx, my] = P2(a, b); moss(c, mx, my, s * ww, s * ww * 0.4, 0.45); } // moss on the crown, the brow, the nose
      fern(c, ...P2(0.08, 0.66), s * 0.32, 4, -1, P.leaf, mix(P.leaf, P.leafLit, 0.5));
      rubble(c, 2.9, 4.7, 4, 0.2, 1.2);
      tuft(c, ...P2(0.5, 0.0), s * 0.14, 7, P.moss);
    }
    { // the nearest column, on the left, ivy over it; ferns at the bottom corners
      const cc = cols.find((o) => o.i === 0 && o.side < 0);
      column(fc, cc.X, cc.Z, { buried: 1 });
      rubble(fc, cc.X + 0.5, 3.0, 11, 0.22, 2.2); // a mound of fallen stone and growth at its foot
      for (let i = 0; i < 6; i++) moss(fc, C.x(cc.X + (R() - 0.2) * 1.8, 3.1), C.y(0.1, 3.1) + R() * u * 0.03, u * (0.07 + R() * 0.09), u * (0.025 + R() * 0.02), 0.25);
      ivy(fc, C.x(cc.X, cc.Z), C.s(cc.Z) * 0.5, 0.4, 5.5, cc.Z, 1.6, 0.6);
      fern(fc, C.x(cc.X + 0.9, 3.2), H + u * 0.01, u * 0.16, 7, 1, P.leaf, mix(P.leaf, P.leafLit, 0.4));
      fern(fc, C.x(cc.X - 0.2, 3.0), H + u * 0.02, u * 0.2, 8, 1, P.leaf, mix(P.leaf, P.leafLit, 0.3));
      fern(fc, W + u * 0.01, H + u * 0.015, u * 0.13, 6, -1, P.leaf, mix(P.leaf, P.leafLit, 0.4));
    }

    // weathering over all of it: blotches and rain streaks darken the stone, a fine grain lightens it
    const blot = K.noiseTex('ruBlot', 256, 256, { px: 6, py: 6, oct: 5, lo: 0.42, hi: 0.82, seed: 61 });
    const streak = K.noiseTex('ruStreak', 256, 256, { px: 26, py: 3, oct: 3, lo: 0.5, hi: 0.86, seed: 62 });
    const grain = K.noiseTex('ruGrain', 128, 128, { px: 16, py: 16, oct: 2, lo: 0.55, hi: 0.95, seed: 63 });
    for (const [c, k] of [[mc, 1], [fc, 1.15]]) {
      c.save(); c.globalCompositeOperation = 'source-atop';
      K.tile(c, K.tint(blot, rgb(P.ink)), 0, 0, W, H, u * 0.42, u * 0.42, 0, 0, 0.28 * k);
      K.tile(c, K.tint(blot, rgb(P.ink)), 0, 0, W, H, u * 0.13, u * 0.13, u * 0.05, u * 0.07, 0.2 * k);
      K.tile(c, K.tint(streak, rgb(P.ink)), 0, 0, W, H, u * 0.55, u * 0.8, u * 0.2, 0, 0.26 * k);
      K.tile(c, K.tint(grain, rgb(P.lit)), 0, 0, W, H, u * 0.1, u * 0.1, 0, 0, 0.1);
      c.restore();
    }

    // the swaying things: vines and roots hanging from the roof and from the architraves
    const vines = [];
    const vine = (x, y, len, s, kind, depth) => vines.push({ x, y, ...vineSprite(len, s, kind, P, q, R), depth, amp: (kind === 'root' ? 0.006 : 0.014) + R() * 0.01, sp: 0.012 + R() * 0.012, ph: R() * TAU });
    const nearN = pv ? 2 : 4;
    for (let i = 0; i < nearN; i++) { const k = (i + 0.3 + R() * 0.4) / nearN, x = W * (0.3 + 0.66 * k); vine(x, -u * 0.02, H * (0.16 + R() * 0.26), u * 0.016, i % 2 ? 'vine' : R() < 0.5 ? 'flower' : 'vine', 1); }
    if (!pv) vine(W * 0.18 + R() * u * 0.05, -u * 0.02, H * 0.3, u * 0.012, 'root', 1);
    for (const ho of holes) { const [hx, hy] = pt(ho.X, YC, ho.Z); if (hy < -u * 0.05) continue; for (let k = 0; k < (pv ? 1 : 2); k++) vine(hx + (R() - 0.5) * ho.r * C.s(ho.Z) * 1.6, hy + C.s(ho.Z) * 0.3, C.s(ho.Z) * (0.8 + R() * 1.8), Math.max(pv ? 1 : 2.4, C.s(ho.Z) * 0.08), k ? 'vine' : 'root', 0); }
    for (const side of [-1, 1]) for (let i = 0; i < (pv ? 1 : 4); i++) {
      const Z = 10.5 + R() * 11, [ax, ay] = pt(side * (D - 0.76), ABA, Z);
      if (ay < -u * 0.05) continue;
      vine(ax, ay, C.s(Z) * (0.8 + R() * 2.2), Math.max(pv ? 1 : 2.4, C.s(Z) * 0.08), R() < 0.3 ? 'flower' : 'vine', 0);
    }

    // where the sun comes in: each shaft from its hole, at a slant, down to the floor
    const shafts = [ // [hole, strength, behind the middle columns?]
      [0, 1, false], [1, 0.75, true], [2, 0.7, false], [3, 0.8, true], [4, 0.55, true],
    ].map(([hi, a, deep], i) => ({ ...holes[hi], a, deep, ph: R() * TAU, v: [i % 3, (i + 1) % 3] }));
    const glints = Array.from({ length: pv ? 6 : 22 }, () => ({ dx: (R() - 0.5) * 1.1, dz: (R() - 0.5) * 0.7, sp: 0.05 + R() * 0.1, ph: R() * TAU, w: 0.05 + R() * 0.1 }));
    const mirror = C.y(0, ZF); // the far wall's foot: the reflections in the pool turn about it
    const pool = { water, x0: PX0, x1: PX1, z0: PZ0, z1: PZ1, y: PY, top: C.y(PY, PZ1), bot: C.y(PY, PZ0) };
    return { back, mid, front, C, shafts, glints, vines, pool, mirror, YC, floorY: (Z) => C.y(0, Z) };
  }

  /** A hanging vine, root or flowering creeper, as a sprite hung from (ox, oy). */
  function vineSprite(len, s, kind, P, q, R) {
    const pad = len * 0.16 + s * 2.4, Wd = pad * 2, Hd = len + s * 2.5, [cv, c] = K.layer(Wd, Hd, q);
    c.translate(pad, s * 0.5);
    const n = 30, pts = [], wav = len * (0.02 + R() * 0.04), ph = R() * TAU, lean = (R() - 0.5) * len * 0.12;
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push([Math.sin(k * 3.4 + ph) * wav * k + lean * k * k, len * k]); }
    const stem = (wd0, wd1, col) => { c.strokeStyle = rgb(col); for (let i = 1; i <= n; i++) { c.lineWidth = Math.max(0.5, wd0 + (wd1 - wd0) * (i / n)); c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); } };
    if (kind === 'root') {
      stem(s * 0.5, s * 0.08, P.root);
      c.strokeStyle = rgba(P.rootLit, 0.55); c.lineWidth = Math.max(0.5, s * 0.12); // the lit side of the root
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + s * 0.16 * (1 - i / n), y) : c.moveTo(x + s * 0.16, y))); c.stroke();
      for (let k = 0; k < 4; k++) { // rootlets
        const i = 6 + ((R() * (n - 10)) | 0), [x, y] = pts[i], d = R() < 0.5 ? -1 : 1, l2 = len * (0.12 + R() * 0.2);
        c.strokeStyle = rgb(P.root); c.lineWidth = Math.max(0.5, s * 0.12); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + d * l2 * 0.4, y + l2 * 0.3, x + d * l2 * 0.25, y + l2); c.stroke();
      }
      return { cv, ox: pad, oy: s * 0.5, w: Wd, h: Hd };
    }
    stem(s * 0.16, s * 0.07, P.leaf);
    const dens = s < 4 ? 0.4 : 0.8;
    for (let i = 2; i < n; i++) {
      if (R() > dens) continue;
      const [x, y] = pts[i], k = i / n, side = i % 2 ? 1 : -1, a = Math.PI / 2 - side * (s < 4 ? 0.35 + R() * 0.4 : 0.75 + R() * 0.6), ls = s * (0.9 + R() * 0.7) * (1 - 0.35 * k), turn = 0.35 + R() * 0.65;
      const bx = x + Math.cos(a) * ls * 0.25, by = y + Math.sin(a) * ls * 0.25; // a short stalk, then the leaf, drooping, some seen edge-on
      c.strokeStyle = rgb(P.leaf); c.lineWidth = Math.max(0.5, s * 0.06); c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke();
      c.save(); c.translate(bx + Math.cos(a) * ls * 0.5, by + Math.sin(a) * ls * 0.5); c.rotate(a); c.scale(1, turn);
      c.fillStyle = rgb(R() < 0.35 ? mix(P.leaf, P.leafLit, 0.5) : P.leaf);
      c.beginPath(); c.moveTo(-ls * 0.5, 0); c.bezierCurveTo(-ls * 0.25, -ls * 0.34, ls * 0.25, -ls * 0.28, ls * 0.6, 0); c.bezierCurveTo(ls * 0.25, ls * 0.28, -ls * 0.25, ls * 0.34, -ls * 0.5, 0); c.fill();
      c.restore();
      if (kind === 'flower' && s >= 4 && R() < 0.18) { // a small five-petalled flower
        const fx = x - side * s * 0.35, fy = y + s * 0.2;
        c.fillStyle = rgb(P.flower);
        for (let p = 0; p < 5; p++) { const pa = (p / 5) * TAU + R() * 0.3; c.beginPath(); c.ellipse(fx + Math.cos(pa) * s * 0.17, fy + Math.sin(pa) * s * 0.17, s * 0.17, s * 0.1, pa, 0, TAU); c.fill(); }
        c.fillStyle = rgb(mix(P.flower, [240, 200, 90], 0.6)); c.beginPath(); c.arc(fx, fy, s * 0.06, 0, TAU); c.fill();
      }
    }
    return { cv, ox: pad, oy: s * 0.5, w: Wd, h: Hd };
  }

  /* ---------- the moving parts ---------- */

  /** A random point inside one of the shafts (where dust is worth putting). */
  function inShaft(S) {
    const sh = S.shafts[(RND() * S.shafts.length) | 0], k = 0.1 + RND() * 0.8, off = (RND() - 0.5) * sh.wb * (0.56 + 0.44 * k) * 0.8;
    const ux = -Math.sin(sh.ang), uy = Math.cos(sh.ang);
    return [sh.x1 + ux * sh.len * k + uy * off, sh.y1 + uy * sh.len * k - ux * off];
  }

  function init(V, S, key) {
    const { W, H, pv } = V;
    const st = { kind: 'ruins', key, motes: [], leaves: [], rings: [], bird: null, birdIn: pv ? 1e9 : 450 + RND() * 600, leafIn: pv ? 120 : 60, dripIn: 200 + RND() * 200, glints: [] };
    const n = pv ? 16 : Math.round(Math.min(110, 46 + (W * H) / 40000 * 1.6));
    for (let i = 0; i < n; i++) st.motes.push({ ...(i % 2 ? (([x, y]) => ({ x, y }))(inShaft(S)) : { x: RND() * W, y: RND() * H * 0.9 }), vx: 0, vy: 0, r: (0.5 + RND() * 0.9) * (pv ? 0.55 : 1), ph: RND() * TAU, sp: 0.03 + RND() * 0.05, a: 0.4 + RND() * 0.6, glint: 0 });
    return st;
  }

  /** Where each shaft is this frame: the sun creeps (its slant), clouds pass (its strength). */
  function aim(S, t) {
    const C = S.C, cloud = 0.55 * Math.sin(t * 0.0021 + 1) + 0.45 * Math.sin(t * 0.0053 + 2.3);
    const dx = -0.36 + 0.035 * Math.sin(t * 0.0006), dz = -0.16 + 0.02 * Math.sin(t * 0.00045 + 1);
    for (const sh of S.shafts) {
      const hx = sh.X + dx * S.YC, hz = sh.Z + dz * S.YC; // where it reaches the floor
      sh.hx = hx; sh.hz = hz;
      sh.x1 = C.x(sh.X, sh.Z); sh.y1 = C.y(S.YC, sh.Z); sh.x2 = C.x(hx, hz); sh.y2 = C.y(0, hz);
      sh.wb = sh.r * 2.6 * C.s(hz);
      sh.len = Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1); sh.ang = Math.atan2(-(sh.x2 - sh.x1), sh.y2 - sh.y1);
      sh.I = sh.a * (0.68 + 0.2 * cloud + 0.12 * Math.sin(t * 0.0037 + sh.ph));
      sh.mix = 0.5 + 0.5 * Math.sin(t * 0.0042 + sh.ph * 2); // between its two inner patterns
      sh.inPool = hx > S.pool.x0 + 0.1 && hx < S.pool.x1 - 0.1 && hz > S.pool.z0 + 0.1 && hz < S.pool.z1 - 0.1;
    }
  }

  /** How strongly the shafts light a point on the screen (dust in the beam). */
  function inBeam(S, x, y) {
    let b = 0;
    for (const sh of S.shafts) {
      const ux = -Math.sin(sh.ang), uy = Math.cos(sh.ang), dx = x - sh.x1, dy = y - sh.y1, along = dx * ux + dy * uy;
      if (along <= 0 || along >= sh.len) continue;
      const k = along / sh.len, hw = sh.wb * 0.5 * (0.56 + 0.44 * k), d = Math.abs(dx * uy - dy * ux);
      if (d < hw) b += (1 - d / hw) ** 1.5 * sh.I * Math.min(1, k * 8) * (1 - 0.4 * k);
    }
    return b;
  }

  function drawShafts(ctx, S, L, P, deep) {
    const tex0 = shaftTex(0), tex1 = shaftTex(1), tex2 = shaftTex(2), texs = [tex0, tex1, tex2];
    for (const sh of S.shafts) {
      if (sh.deep !== deep) continue;
      ctx.save(); ctx.translate(sh.x1, sh.y1); ctx.rotate(sh.ang);
      for (let j = 0; j < 2; j++) {
        const w = j ? sh.mix : 1 - sh.mix, tex = texs[sh.v[j]];
        if (L) {
          ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, sh.I * w * 0.7); ctx.drawImage(tex, -sh.wb / 2, 0, sh.wb, sh.len);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, sh.I * w * 0.42); ctx.drawImage(K.tint(tex, rgb(P.sun)), -sh.wb / 2, 0, sh.wb, sh.len);
        } else {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, sh.I * w * 0.4); ctx.drawImage(K.tint(tex, rgb(P.sun)), -sh.wb / 2, 0, sh.wb, sh.len);
        }
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /** The sun where it lands on the floor (on the water it breaks into glints, drawn with the pool). */
  function drawPatches(ctx, S, L, P) {
    const C = S.C, spr = soft(P.sun);
    S.shafts.forEach((sh, i) => { // a soft pool of light, and inside it the ragged shape of the hole it came through
      const rx = sh.r * 1.5 * C.s(sh.hz), ry = rx * Math.max(0.24, (C.eye / sh.hz) * 1.8), a = sh.I * (sh.inPool ? 0.3 : 1), rag = K.tint(mossSpr(i % 3), rgb(L ? [255, 255, 255] : P.sun));
      if (L) {
        ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, a * 0.3); ctx.drawImage(soft([255, 255, 255]), sh.x2 - rx, sh.y2 - ry, rx * 2, ry * 2);
        ctx.globalAlpha = Math.min(1, a * 0.45); ctx.drawImage(rag, sh.x2 - rx * 0.75, sh.y2 - ry * 0.75, rx * 1.5, ry * 1.5);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 0.3); ctx.drawImage(spr, sh.x2 - rx, sh.y2 - ry, rx * 2, ry * 2);
      } else {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a * 0.2); ctx.drawImage(spr, sh.x2 - rx * 1.2, sh.y2 - ry * 1.2, rx * 2.4, ry * 2.4);
        if (!sh.inPool) { ctx.globalAlpha = Math.min(1, a * 0.16); ctx.drawImage(rag, sh.x2 - rx * 0.75, sh.y2 - ry * 0.75, rx * 1.5, ry * 1.5); }
      }
    });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /** The pool: the hall mirrored in it, wavering; the sun breaking into glints on it; rings where drops and leaves land. */
  function drawPool(ctx, st, S, L, P, t, V) {
    const C = S.C, pl = S.pool, k7 = V.u / 700;
    ctx.save(); ctx.clip(pl.water);
    const back = S.back, lq = back.width / V.W, yM = S.mirror, n = V.pv ? 3 : 9, hh = (pl.bot - pl.top) / n;
    ctx.save(); ctx.translate(0, 2 * yM); ctx.scale(1, -1); // mirrored about the far wall's foot, broken by the ripples, fading toward us
    for (let i = 0; i < n; i++) {
      const yd = pl.top + i * hh, ys0 = 2 * yM - yd - hh - 1, dx = Math.sin(t * 0.045 + i * 1.3) * k7 * (1 + i * 0.5);
      ctx.globalAlpha = (L ? 0.36 : 0.42) * (1 - 0.6 * (i / n));
      ctx.drawImage(back, 0, Math.max(0, ys0 * lq), back.width, (hh + 2) * lq, dx, Math.max(0, ys0), V.W, hh + 2);
    }
    ctx.restore();
    ctx.globalAlpha = L ? 0.12 : 0.22; ctx.fillStyle = rgb(P.water); // dark ripple lines across it
    for (let y = pl.top + 2, i = 0; y < pl.bot; y += Math.max(2, (pl.bot - pl.top) / (V.pv ? 4 : 14)), i++) ctx.fillRect(0, y + Math.sin(t * 0.03 + i) * 0.8, V.W, Math.max(0.6, (y - pl.top) / (pl.bot - pl.top) * 1.6));
    // the sun on the water
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.fillStyle = L ? '#ffffff' : rgb(P.sun);
    for (const sh of S.shafts) {
      if (!sh.inPool || sh.I < 0.05) continue;
      const s = C.s(sh.hz);
      ctx.globalAlpha = Math.min(1, sh.I * (L ? 0.35 : 0.18)); ctx.drawImage(soft(P.sun), sh.x2 - sh.r * s, sh.y2 - sh.r * s * 0.3, sh.r * s * 2, sh.r * s * 0.6);
      for (const g of S.glints) {
        const v = Math.sin(t * g.sp + g.ph);
        if (v < 0.4) continue;
        const X = sh.hx + g.dx * sh.r * 1.4, Z = sh.hz + g.dz * sh.r, x = C.x(X, Z) + Math.sin(t * 0.05 + g.ph) * s * 0.02, y = C.y(pl.y, Z), ww = g.w * s * (0.5 + 0.5 * v);
        ctx.globalAlpha = Math.min(1, sh.I * (L ? 0.9 : 0.7) * (v - 0.4) / 0.6);
        ctx.fillRect(x - ww, y, ww * 2, Math.max(V.pv ? 0.5 : 1, s * 0.006));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // rings
    ctx.strokeStyle = rgb(P.ripple);
    for (const rg of st.rings) {
      const q = rg.age / rg.life, s = C.s(rg.z), x = C.x(rg.x, rg.z), y = C.y(pl.y, rg.z);
      for (let k = 0; k < 2; k++) {
        const r = (rg.r0 + q * rg.r1) * s * (1 - k * 0.35);
        if (r <= 0) continue;
        ctx.globalAlpha = (L ? 0.45 : 0.3) * (1 - q) ** 1.5 * (k ? 0.6 : 1); ctx.lineWidth = Math.max(0.6, s * 0.008);
        ctx.beginPath(); ctx.ellipse(x, y, r, r * (C.eye - pl.y) / rg.z, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  window.BG_EXT.ruins = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.36, 1.6), { W, H, u, pv } = V, L = K.light(), P = PAL[L ? 1 : 0];
    const S = K.scene(bg, V, () => build(bg, V));
    aim(S, t);
    let st = bg.st;
    if (!st || st.kind !== 'ruins' || st.key !== S.key) st = bg.st = init(V, S, S.key);
    const C = S.C, k7 = u / 700, add = L ? 'source-over' : 'lighter';
    ctx.save(); ctx.translate(0, -V.oy);

    // 1. the far hall, the deep shafts in it, a haze lying along its floor
    ctx.globalAlpha = L ? 0.5 : 0.62; ctx.drawImage(S.back, 0, 0, W, H); ctx.globalAlpha = 1; // first on the empty canvas: nothing to hide
    drawShafts(ctx, S, L, P, true);
    const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#b8b0a0');
    K.mist(ctx, fog, W, S.floorY(ZF) - u * 0.07, u * 0.13, u * 1.4, t * 0.06 * k7, L ? 0.55 : 0.07);

    // 2. the colonnades, the floor and the pool
    K.put(ctx, S.mid, W, H, L ? 0.56 : 0.84);
    drawPool(ctx, st, S, L, P, t, V);
    drawPatches(ctx, S, L, P);
    drawShafts(ctx, S, L, P, false);

    // 3. dust in the light: a speck lights up when it drifts into a shaft, and now and then glints
    ctx.globalCompositeOperation = add;
    const ms = mote(P.dust);
    for (const m of st.motes) {
      m.ph += m.sp;
      m.vx = m.vx * 0.97 + (RND() - 0.5) * 0.012 * k7; m.vy = m.vy * 0.97 + (RND() - 0.52) * 0.01 * k7;
      m.x += m.vx + 0.03 * k7 * Math.sin(m.ph * 0.3); m.y += m.vy + 0.015 * k7;
      if (m.x < -4) m.x += W + 8; else if (m.x > W + 4) m.x -= W + 8;
      if (m.y > H * 0.95 || m.y < -4) { [m.x, m.y] = inShaft(S); }
      const b = inBeam(S, m.x, m.y);
      if (b < 0.04) { m.glint = 0; continue; }
      if (!m.glint && b > 0.3 && RND() < 0.004) m.glint = 14;
      let a = m.a * Math.min(1, b * 1.4) * (0.55 + 0.45 * Math.sin(m.ph) ** 2);
      const d = m.r * 5 * Math.max(0.5, k7);
      if (m.glint) { m.glint--; const gk = Math.sin((m.glint / 14) * Math.PI); a = Math.min(1, a + gk * 0.5); const gd = d * (1 + gk * 1.4); ctx.globalAlpha = Math.min(1, a * (L ? 0.9 : 0.75)); ctx.drawImage(ms, m.x - gd / 2, m.y - gd / 2, gd, gd); continue; }
      ctx.globalAlpha = Math.min(1, a * (L ? 0.85 : 0.8)); ctx.drawImage(ms, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 4. vines and roots far in the hall, swaying
    const breeze = 0.7 + 0.3 * Math.sin(t * 0.0031);
    const sway = (v, alpha) => {
      const a = v.amp * breeze * Math.sin(t * v.sp + v.ph) + v.amp * 0.4 * Math.sin(t * v.sp * 2.3 + v.ph * 1.7);
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(a);
      K.stamp(ctx, v.cv, -v.ox, -v.oy, v.w, v.h, alpha);
      ctx.restore();
    };
    for (const v of S.vines) if (!v.depth) sway(v, L ? 0.6 : 0.8);

    // 5. a swallow across the hall now and then
    if (!st.bird && --st.birdIn <= 0) {
      const dir = RND() < 0.5 ? 1 : -1;
      st.bird = { dir, x: dir > 0 ? -u * 0.05 : W + u * 0.05, y: H * (0.12 + RND() * 0.22), vy: (RND() - 0.6) * 0.3 * k7, v: (W + u * 0.1) / (30 * (3.5 + RND() * 2)), ph: 0, flap: 26, s: u * (0.016 + RND() * 0.006) };
    }
    if (st.bird) {
      const b = st.bird;
      b.x += b.dir * b.v; b.y += b.vy;
      let f;
      if (b.flap > 0) { b.flap--; b.ph += 0.75; f = Math.sin(b.ph); b.vy -= 0.006 * k7; if (!b.flap) b.glide = 16 + RND() * 24; }
      else { f = 0.75; b.vy += 0.008 * k7; if (--b.glide <= 0) b.flap = 10 + RND() * 16; }
      b.vy = Math.max(-0.9 * k7, Math.min(0.9 * k7, b.vy));
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.dir, 1);
      ctx.fillStyle = L ? rgba(P.ink, 0.72) : rgba(P.ink, 0.9); swallow(ctx, 0, 0, b.s, f);
      ctx.restore();
      if (b.x < -u * 0.1 || b.x > W + u * 0.1 || b.y < -u * 0.1) { st.bird = null; st.birdIn = 900 + RND() * 1500; }
    }

    // 6. leaves and petals coming down through the light; drops into the pool
    if (--st.leafIn <= 0) {
      st.leafIn = (pv ? 220 : 110) + RND() * (pv ? 260 : 220);
      if (st.leaves.length < (pv ? 2 : 7)) {
        const sh = S.shafts[(RND() * S.shafts.length) | 0], petal = RND() < 0.35;
        st.leaves.push({ X: sh.X + (RND() - 0.5) * 1.6, Y: S.YC - 0.2, Z: sh.Z + (RND() - 0.5) * 1.2, ph: RND() * TAU, rot: RND() * TAU, vr: (RND() - 0.5) * 0.06, v: 0.014 + RND() * 0.01, kind: petal ? 'petal' : 'leaf', size: petal ? 0.09 : 0.13 + RND() * 0.05, land: 0 });
      }
    }
    if (--st.dripIn <= 0) { st.dripIn = (pv ? 200 : 260) + RND() * 320; const pl = S.pool; st.rings.push({ x: pl.x0 + 0.2 + RND() * (pl.x1 - pl.x0 - 0.4), z: pl.z0 + 0.3 + RND() * (pl.z1 - pl.z0 - 0.6), age: 0, life: 120, r0: 0.02, r1: 0.5 }); }
    for (const rg of st.rings) rg.age++;
    st.rings = st.rings.filter((rg) => rg.age < rg.life);
    for (const lf of st.leaves) {
      const pl = S.pool, onWater = lf.X > pl.x0 && lf.X < pl.x1 && lf.Z > pl.z0 && lf.Z < pl.z1, ground = onWater ? pl.y : 0;
      if (!lf.land) {
        lf.ph += 0.035; lf.Y -= lf.v * (0.75 + 0.35 * Math.sin(lf.ph * 2)); lf.X += Math.sin(lf.ph) * 0.012; lf.Z += Math.cos(lf.ph * 0.7) * 0.004; lf.rot += lf.vr + Math.sin(lf.ph) * 0.02;
        if (lf.Y <= ground) { lf.Y = ground; lf.land = 1; if (onWater) st.rings.push({ x: lf.X, z: lf.Z, age: 0, life: 110, r0: 0.05, r1: 0.42 }); }
      } else { lf.land++; if (onWater) lf.X += 0.0015; }
      if (lf.Z < 3) continue;
      const s = C.s(lf.Z), x = C.x(lf.X, lf.Z), y = C.y(lf.Y, lf.Z), sz = lf.size * s, fl = lf.land ? 0.3 : Math.cos(lf.ph * 1.6);
      const al = (lf.land ? Math.max(0, 1 - lf.land / 240) : Math.min(1, (S.YC - lf.Y) / 0.6)) * (L ? 0.75 : 0.85);
      if (al <= 0.01) continue;
      const lit = inBeam(S, x, y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(lf.land ? 0.2 : lf.rot); ctx.scale(1, Math.max(0.15, Math.abs(fl)));
      const base = lf.kind === 'petal' ? P.flower : P.leaf;
      ctx.globalAlpha = al; ctx.drawImage(leafSpr(lf.kind, base), -sz, -sz / 2, sz * 2, sz);
      if (lit > 0.05 && !L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, al * lit * 0.8); ctx.drawImage(leafSpr(lf.kind, lf.kind === 'petal' ? P.flower : P.leafLit), -sz, -sz / 2, sz * 2, sz); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore();
    }
    st.leaves = st.leaves.filter((lf) => !lf.land || lf.land < 240);
    ctx.globalAlpha = 1;

    // 7. the near hall: the nearest columns, the fallen column, the head, ferns; vines hanging in front of it all
    K.put(ctx, S.front, W, H, L ? 0.52 : 0.92);
    for (const v of S.vines) if (v.depth) sway(v, L ? 0.62 : 0.9);
    K.mist(ctx, fog, W, H - u * 0.12, u * 0.16, u * 1.2, -t * 0.09 * k7 + 300, L ? 0.35 : 0.05);
    ctx.restore();
  };
})();
