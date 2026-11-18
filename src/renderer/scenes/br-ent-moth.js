'use strict';
/*
 * 백룸 — the Deathmoth (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * Five ways it shows itself (bg.st.entityNow = 'moth:<name>'; a random pick never repeats the last one):
 *   tube    its shadow sweeps the ceiling first; then it batters a tube (the tube stutters, dust sifts down through the
 *           light, its shadow huge on the carpet and the walls), clings to the diffuser a while, and flaps off into the dark.
 *   swarm   a far tube smothered by them: crawling over the diffuser, circling under it, the light strobing through their
 *           wings, their shadows writhing on the walls and the carpet; then the light gives out and only their eyes are left.
 *   wall    a huge one flat on the wallpaper by a doorway, its wings folded like a stain. It opens them slowly, and the
 *           eyespots on its hind wings are a face looking at us (the pupils move); it shivers, and bursts off over our heads.
 *   pass    it comes down the hall at us, rising, and passes close overhead: wings across the top of the picture, the
 *           dust off them raining through the light in front of the lens.
 *   shadow  a light stutters; only its giant shadow crawls across the ceiling and down a wall, opens its wings (light
 *           shows through the eyespots) and is gone with the next stutter. Nothing casts it.
 *
 * The moth is painted once per light / dark mode, pixel by pixel (dusty scales, radial streaks, veins, banding, frayed
 * margins with chequered fringes, eyespots with bloodshot whites, worn translucent patches), as four wing pieces and a
 * furred body, then mapped through the camera in 3D every frame: each wing bends at mid-span, so a beat foreshortens
 * it in perspective. The painting is spread over frames (a few ms at a time).
 */
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const VARS = ['tube', 'swarm', 'wall', 'pass', 'shadow'];
  let last = null;

  // ---- the sprites ------------------------------------------------------------------------------------------------
  // A wing's frame: WW px = its length (one span), the hinge at (0, HR), s outward along x, t (backward) down.
  const WW = 224, T0 = 0.26, T1 = 0.92, WH = Math.round(WW * (T0 + T1)), HR = Math.round(WW * T0), UM = 112;
  const BW = 72, BK = 0.3, BH = 208, BPX = BW / BK; // the body: BK spans wide, BPX px per span, the head at the top
  const SW = 256; // the shadow: one half of it (the midline at x = 0), on the wings' frame
  // outlines in span units (s, t): a hooked fore wing, a scalloped hind wing with a short tail
  const FORE = [0, -0.03, 0.2, -0.1, 0.45, -0.16, 0.7, -0.2, 0.88, -0.235, 0.985, -0.226, 1.0, -0.17, 0.955, -0.1, 0.905, -0.02, 0.885, 0.08,
    0.862, 0.2, 0.8, 0.31, 0.7, 0.4, 0.55, 0.415, 0.38, 0.355, 0.2, 0.245, 0.08, 0.125, 0.01, 0.05];
  const HIND = [0, 0.04, 0.22, 0.07, 0.45, 0.115, 0.62, 0.17, 0.745, 0.265, 0.805, 0.39, 0.785, 0.52, 0.725, 0.63, 0.63, 0.725, 0.565, 0.8,
    0.505, 0.9, 0.45, 0.835, 0.36, 0.785, 0.22, 0.685, 0.11, 0.535, 0.04, 0.36, 0.0, 0.18];
  const WING = {
    fore: { pts: FORE, eyes: [[0.6, 0.055, 0.062, 0.056]], oc: [], root: 0.02,
      veins: [[0.975, -0.2], [0.94, -0.12], [0.9, -0.035], [0.882, 0.06], [0.86, 0.17], [0.805, 0.29], [0.7, 0.385], [0.52, 0.405]], cell: [[0.4, -0.05], [0.42, 0.16]],
      bite: [[0.935, -0.07, 0.024], [0.83, 0.265, 0.03], [0.62, 0.41, 0.02], [0.3, 0.3, 0.012]], hole: [[0.7, 0.2, 0.011]] },
    hind: { pts: HIND, eyes: [[0.335, 0.425, 0.17, 0.155]], oc: [[0.66, 0.27, 0.026], [0.715, 0.39, 0.03], [0.7, 0.51, 0.029], [0.645, 0.615, 0.028], [0.575, 0.7, 0.025]], root: 0.12,
      veins: [[0.6, 0.165], [0.74, 0.27], [0.795, 0.39], [0.775, 0.52], [0.715, 0.63], [0.62, 0.725], [0.5, 0.88], [0.32, 0.765], [0.16, 0.6]], cell: [[0.3, 0.2], [0.3, 0.36]],
      bite: [[0.795, 0.465, 0.03], [0.665, 0.69, 0.024], [0.2, 0.67, 0.016]], hole: [[0.58, 0.36, 0.012], [0.5, 0.6, 0.008]] },
  };
  const can = (w, h, rd) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', rd ? { willReadFrequently: true } : undefined)]; };
  /** A smooth closed outline through the midpoints of the points (span units → px). */
  function outline(x, pts, ox) {
    const n = pts.length / 2, X = (k) => pts[2 * (k % n)] * WW + (ox || 0), Y = (k) => pts[2 * (k % n) + 1] * WW + HR;
    x.beginPath(); x.moveTo((X(n - 1) + X(0)) / 2, (Y(n - 1) + Y(0)) / 2);
    for (let k = 0; k < n; k++) x.quadraticCurveTo(X(k), Y(k), (X(k) + X(k + 1)) / 2, (Y(k) + Y(k + 1)) / 2);
    x.closePath();
  }
  /** A wavy (or scalloped) line along a quadratic a → b (control c), span units; stroked in col at al. */
  function wavy(x, a, b, c, amp, n, wid, abs, al, col) {
    x.beginPath();
    for (let k = 0; k <= 56; k++) {
      const u = k / 56, v = 1 - u, px = v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], py = v * v * a[1] + 2 * v * u * c[1] + u * u * b[1];
      const tx = 2 * v * (c[0] - a[0]) + 2 * u * (b[0] - c[0]), ty = 2 * v * (c[1] - a[1]) + 2 * u * (b[1] - c[1]), l = Math.hypot(tx, ty) || 1;
      const o = (abs ? Math.abs(Math.sin(u * n * Math.PI)) : Math.sin(u * n * Math.PI)) * amp, X = (px - (ty / l) * o) * WW, Y = (py + (tx / l) * o) * WW + HR;
      if (k) x.lineTo(X, Y); else x.moveTo(X, Y);
    }
    x.lineWidth = wid * WW; x.strokeStyle = `rgba(${col},${al})`; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
  }
  const blob = (x, s, t, rx, ry, al, col) => { x.fillStyle = `rgba(${col},${al})`; x.beginPath(); x.ellipse(s * WW, t * WW + HR, rx * WW, ry * WW, 0, 0, TAU); x.fill(); };
  const seg = (x, s0, t0, s1, t1, wid, al, col) => { x.beginPath(); x.moveTo(s0 * WW, t0 * WW + HR); x.lineTo(s1 * WW, t1 * WW + HR); x.lineWidth = wid * WW; x.strokeStyle = `rgba(${col},${al})`; x.lineCap = 'round'; x.stroke(); };
  const K0 = '255,255,255';
  /** The markings: dark ones on d, pale ones on p (each read back as a mask). */
  const PATTERN = {
    fore(d, p) {
      blob(d, 0.07, 0.06, 0.1, 0.13, 0.55, K0); // the root, dark and furred
      wavy(d, [0.55, -0.18], [0.36, 0.37], [0.5, 0.1], 0, 1, 0.07, false, 0.3, K0); // a median shade
      wavy(d, [0.3, -0.13], [0.2, 0.28], [0.34, 0.08], 0.018, 5, 0.03, false, 1, K0); // the inner line
      wavy(p, [0.34, -0.14], [0.24, 0.3], [0.38, 0.08], 0.018, 5, 0.014, false, 0.8, K0);
      wavy(d, [0.76, -0.2], [0.5, 0.405], [0.67, 0.12], 0.022, 9, 0.03, true, 1, K0); // the outer line, scalloped
      wavy(p, [0.795, -0.19], [0.535, 0.405], [0.71, 0.12], 0.022, 9, 0.013, true, 0.85, K0); // and pale beyond it
      d.fillStyle = `rgba(${K0},0.85)`; d.beginPath(); d.moveTo(0.85 * WW, -0.24 * WW + HR); d.lineTo(1.0 * WW, -0.215 * WW + HR); d.lineTo(0.93 * WW, -0.13 * WW + HR); d.closePath(); d.fill(); // the hook of the tip
      seg(p, 0.965, -0.2, 0.72, -0.065, 0.016, 0.7, K0); // a pale streak in from the tip
      wavy(p, [0.93, -0.15], [0.68, 0.37], [0.86, 0.12], 0.012, 15, 0.008, false, 0.6, K0); // a zigzag near the edge
      wavy(d, [0.985, -0.19], [0.7, 0.4], [0.9, 0.14], 0, 1, 0.04, false, 0.45, K0); // the margin darker
      for (let k = 0; k < 10; k++) { const s = 0.12 + k * 0.085, t = -0.03 - 0.205 * s; seg(d, s, t, s + 0.012, t + 0.04, 0.012, 0.8, K0); } // dashes along the leading edge
      wavy(d, [0.06, 0.13], [0.66, 0.41], [0.3, 0.36], 0.008, 4, 0.05, false, 0.7, K0); // the inner edge dark: brows, over the eyes below
    },
    hind(d, p) {
      blob(d, 0.05, 0.16, 0.09, 0.15, 0.5, K0);
      wavy(d, [0.02, 0.6], [0.47, 0.655], [0.2, 0.78], 0.008, 5, 0.075, false, 1, K0); // a dark curve under the eye (with the other wing: a grin)
      for (let k = 0; k < 8; k++) { // pale wedges along its upper edge: teeth
        const u = 0.06 + k * 0.12, v = 1 - u, s = v * v * 0.02 + 2 * v * u * 0.2 + u * u * 0.47, t = v * v * 0.6 + 2 * v * u * 0.78 + u * u * 0.655 - 0.036;
        p.fillStyle = `rgba(${K0},1)`; p.beginPath(); p.moveTo((s - 0.02) * WW, t * WW + HR); p.lineTo((s + 0.02) * WW, t * WW + HR); p.lineTo((s + 0.003) * WW, (t + 0.058) * WW + HR); p.closePath(); p.fill();
      }
      wavy(d, [0.63, 0.16], [0.42, 0.8], [0.76, 0.5], 0.016, 8, 0.016, true, 0.8, K0); // the outer line
      wavy(p, [0.665, 0.17], [0.45, 0.82], [0.8, 0.5], 0.016, 8, 0.01, true, 0.6, K0);
      wavy(d, [0.745, 0.265], [0.505, 0.9], [0.86, 0.66], 0, 1, 0.075, false, 0.5, K0); // the margin darker
      for (let k = 0; k < 11; k++) seg(p, 0.02, 0.2 + k * 0.035, 0.12 + k * 0.012, 0.42 + k * 0.045, 0.006, 0.45, K0); // long hair along the inner edge
    },
  };
  /** Halvings of a sprite (drawn small without shimmer); .k[i]: the scale of level i. */
  function mip(c) {
    const out = [c]; let s = c;
    while (s.width > 20) { const [h, hx] = can(Math.ceil(s.width / 2), Math.ceil(s.height / 2)); hx.imageSmoothingQuality = 'high'; hx.drawImage(s, 0, 0, h.width, h.height); out.push(h); s = h; }
    out.k = out.map((m) => m.width / c.width);
    return out;
  }
  const tinted = (src, col) => { const [c, x] = can(src.width, src.height); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };

  /** The painting, a few rows at a time (a generator: pump() runs it for a few ms a frame). */
  function* paint(L) {
    const SK = window.SceneKit, O = {}, masks = {};
    const nLo = SK.fbm(31, 8, 8, 3), nFi = SK.fbm(32, 64, 64, 2), nSt = SK.fbm(33, 48, 6, 3), nHr = SK.fbm(34, 96, 12, 2);
    // dusk-brown scales going grey-green in patches; the whites of the eyes, their irises, the blood in them
    const P = L ? { dk: [22, 18, 13], md: [60, 50, 37], pl: [108, 94, 72], sc: [240, 232, 206], ir: [14, 10, 7], fib: [124, 90, 46], bl: [138, 56, 42], cil: [140, 126, 100], dim: 0.5, eye: 0.3 }
      : { dk: [28, 23, 17], md: [110, 100, 82], pl: [180, 168, 142], sc: [234, 224, 194], ir: [14, 11, 7], fib: [160, 120, 66], bl: [150, 62, 46], cil: [186, 174, 146], dim: 0.33, eye: 0.36 };
    for (const name of ['fore', 'hind']) {
      const w = WING[name], R = SK.rng(name === 'fore' ? 5 : 6);
      const [mc, mx] = can(WW, WH, true); mx.fillStyle = '#000'; outline(mx, w.pts); mx.fill();
      mx.globalCompositeOperation = 'destination-out'; // torn: a few bites, a few holes, and the whole margin frayed
      for (const [s, t, r] of w.bite.concat(w.hole)) { mx.beginPath(); mx.arc(s * WW, t * WW + HR, r * WW, 0, TAU); mx.fill(); }
      const n = w.pts.length / 2;
      for (let k = 0; k < 90; k++) {
        const q = R() * n, i = Math.floor(q), f = q - i, a = i % n, b = (i + 1) % n, s = lerp(w.pts[2 * a], w.pts[2 * b], f), t = lerp(w.pts[2 * a + 1], w.pts[2 * b + 1], f);
        if (s < 0.14) continue;
        mx.beginPath(); mx.arc(s * WW + (R() - 0.5) * 4, t * WW + HR + (R() - 0.5) * 4, (0.003 + R() * R() * 0.013) * WW, 0, TAU); mx.fill();
      }
      masks[name] = mc;
      const [bc, bx] = can(WW, WH, true); bx.filter = 'blur(2px)'; bx.drawImage(mc, 0, 0); bx.filter = 'none';
      const [vc, vx] = can(WW, WH, true); vx.strokeStyle = '#fff'; vx.lineCap = 'round';
      for (const [s, t] of w.veins) { // veins from the root, thick at first
        const x0 = 0.03 * WW, y0 = w.root * WW + HR, x1 = s * WW, y1 = t * WW + HR, cx = lerp(x0, x1, 0.5) - (y1 - y0) * 0.09, cy = lerp(y0, y1, 0.5) + (x1 - x0) * 0.09;
        vx.lineWidth = 1.1; vx.beginPath(); vx.moveTo(x0, y0); vx.quadraticCurveTo(cx, cy, x1, y1); vx.stroke();
        vx.lineWidth = 2.3; vx.beginPath(); vx.moveTo(x0, y0); vx.quadraticCurveTo(lerp(x0, cx, 0.55), lerp(y0, cy, 0.55), lerp(lerp(x0, cx, 0.55), lerp(cx, x1, 0.55), 0.55), lerp(lerp(y0, cy, 0.55), lerp(cy, y1, 0.55), 0.55)); vx.stroke();
      }
      vx.lineWidth = 1.4; vx.beginPath(); vx.moveTo(w.cell[0][0] * WW, w.cell[0][1] * WW + HR); vx.lineTo(w.cell[1][0] * WW, w.cell[1][1] * WW + HR); vx.stroke();
      for (let k = 0; k < 7; k++) { const a = R() * TAU, s = 0.5 + R() * 0.35, t = (name === 'fore' ? -0.05 : 0.35) + R() * 0.3; vx.lineWidth = 0.7; vx.beginPath(); vx.moveTo(s * WW, t * WW + HR); vx.lineTo((s + Math.cos(a) * 0.05) * WW, (t + Math.sin(a) * 0.05) * WW + HR); vx.stroke(); } // a few cross-veins
      const [dc, dx] = can(WW, WH, true), [pc, px] = can(WW, WH, true);
      dx.filter = px.filter = 'blur(0.6px)'; PATTERN[name](dx, px); dx.filter = px.filter = 'none';
      void bc; void vc; void dc; void pc;
      yield;
      const M = bx.getImageData(0, 0, WW, WH).data, V = vx.getImageData(0, 0, WW, WH).data, D = dx.getImageData(0, 0, WW, WH).data, Q = px.getImageData(0, 0, WW, WH).data;
      const il = new ImageData(WW, WH), idk = new ImageData(WW, WH), ig = new ImageData(WW, WH), A = il.data, B = idk.data, G = ig.data;
      yield;
      for (let y = 0; y < WH; y++) {
        for (let x = 0; x < WW; x++) {
          const i = (y * WW + x) * 4, bv = M[i + 3] / 255;
          if (bv < 0.05) continue;
          const s = x / WW, t = (y - HR) / WW, r = Math.hypot(s, t), ph = Math.atan2(t, s);
          const lo = nLo(s * 5 + 3, t * 5 + 7), lo2 = nLo(s * 4 + 11, t * 4 + 2), fi = nFi(x * 0.33, y * 0.33), st = nSt(ph * 9 + 20, r * 4.5), hr = nHr(ph * 26 + 40, r * 34);
          const basal = 1 - sm(0.05, 0.24, r);
          let k = 0.5 + (lo - 0.5) * 1.5 + (st - 0.5) * 0.9 + (fi - 0.5) * 0.55 + 0.22 * sm(0.55, 0.7, r) - 0.2 * sm(0.5, 0.25, r); // mottled, streaked along the scales, dusty; pale toward the margin
          k = clamp(k * (1 - 0.42 * basal) + (hr - 0.5) * 0.6 * basal);
          let c0, c1, c2;
          if (k < 0.5) { const q = k * 2; c0 = lerp(P.dk[0], P.md[0], q); c1 = lerp(P.dk[1], P.md[1], q); c2 = lerp(P.dk[2], P.md[2], q); }
          else { const q = (k - 0.5) * 2; c0 = lerp(P.md[0], P.pl[0], q); c1 = lerp(P.md[1], P.pl[1], q); c2 = lerp(P.md[2], P.pl[2], q); }
          const mo = sm(0.56, 0.74, lo2) * 0.4; c0 = lerp(c0, c1 * 0.85, mo); c2 = lerp(c2, c1 * 0.9, mo); // a grey-green bloom
          const pd = D[i + 3] / 255, pp = Q[i + 3] / 255, vv = V[i + 3] / 255;
          c0 = lerp(c0, P.dk[0] * 0.75, pd * 0.88); c1 = lerp(c1, P.dk[1] * 0.75, pd * 0.88); c2 = lerp(c2, P.dk[2] * 0.75, pd * 0.88);
          c0 = lerp(c0, P.pl[0] * 1.1, pp * 0.72); c1 = lerp(c1, P.pl[1] * 1.1, pp * 0.72); c2 = lerp(c2, P.pl[2] * 1.06, pp * 0.72);
          const vq = vv * 0.55; c0 = lerp(c0, P.pl[0] * 0.95, vq); c1 = lerp(c1, P.pl[1] * 0.95, vq); c2 = lerp(c2, P.pl[2] * 0.9, vq); // pale veins, like ribs
          const worn = sm(0.6, 0.75, lo2 * 0.65 + fi * 0.35) * (1 - pd) * (1 - basal);
          let tr = (0.42 + 0.5 * worn) * (1 - 0.88 * vv) * (1 - 0.82 * pd) * (1.08 - 0.62 * k), eye = 0, scl = 0;
          for (const [ex, ey, rx, ry] of w.eyes) {
            const ux = (s - ex) / rx, uy = (t - ey) / ry; let d = Math.hypot(ux, uy);
            if (d > 1.18) continue;
            d += (fi - 0.5) * 0.07;
            const an = Math.atan2(uy, ux);
            if (d > 0.93) { const q = sm(1.18, 0.98, d) * 0.92; c0 = lerp(c0, P.ir[0] * 1.6, q); c1 = lerp(c1, P.ir[1] * 1.6, q); c2 = lerp(c2, P.ir[2] * 1.6, q); tr *= 1 - 0.9 * q; eye = Math.max(eye, q); }
            else if (d > 0.63) { // the white of the eye, shaded toward the iris, veined with blood from the rim
              const lim = sm(0.79, 0.63, d), cap = sm(0.66, 0.8, nSt(an * 8 + 3, d * 9)) * sm(0.95, 0.72, d), sh = 0.9 + 0.16 * fi - 0.12 * (uy > 0 ? 0 : -uy);
              c0 = P.sc[0] * sh; c1 = P.sc[1] * sh; c2 = P.sc[2] * sh;
              c0 = lerp(c0, P.sc[0] * 0.58, lim * 0.75); c1 = lerp(c1, P.sc[1] * 0.56, lim * 0.75); c2 = lerp(c2, P.sc[2] * 0.52, lim * 0.75);
              c0 = lerp(c0, P.bl[0], cap * 0.85); c1 = lerp(c1, P.bl[1], cap * 0.85); c2 = lerp(c2, P.bl[2], cap * 0.85);
              tr = 0.95 - 0.55 * cap; eye = 1; scl = 1 - cap * 0.6;
            } else { // the iris: fibres round a dark centre, a dark ring at its edge
              const fib = 0.5 + 0.5 * Math.sin(an * 23 + fi * 6), q = (0.3 + 0.62 * fib) * sm(0.04, 0.3, d) * (1 - sm(0.5, 0.63, d));
              c0 = lerp(P.ir[0], P.fib[0], q); c1 = lerp(P.ir[1], P.fib[1], q); c2 = lerp(P.ir[2], P.fib[2], q); tr = 0.05; eye = 1;
            }
          }
          for (const [ex, ey, rr] of w.oc) { // the little eyes along the margin
            const d = Math.hypot(s - ex, t - ey) / rr + (fi - 0.5) * 0.15;
            if (d > 1) continue;
            const z = d < 0.42 ? P.ir : d < 0.76 ? P.sc : P.ir, kk = d < 0.42 ? 1 : d < 0.76 ? 0.85 : 1.6;
            c0 = z[0] * kk; c1 = z[1] * kk; c2 = z[2] * kk; tr = d < 0.42 ? 0.05 : d < 0.76 ? 0.85 : 0.1; eye = 1; if (d >= 0.42 && d < 0.76) scl = Math.max(scl, 0.75);
          }
          const z = 1 - sm(0.5, 0.92, bv); // the fringe at the margin: chequered, hairy
          if (z > 0 && !eye) { const chk = Math.sin(ph * 46) + Math.sin(r * 70) > 0, cc = chk ? P.cil : P.dk; c0 = lerp(c0, cc[0], z * 0.8); c1 = lerp(c1, cc[1], z * 0.8); c2 = lerp(c2, cc[2], z * 0.8); }
          let a = sm(0.27, 0.62, bv + (fi - 0.5) * 0.4 + (hr - 0.5) * 0.4 * z);
          a *= eye ? 1 : Math.min(1, 0.9 - 0.36 * worn + 0.12 * Math.max(vv, pd));
          c0 = lerp(c0, P.pl[0], 0.22 * worn); c1 = lerp(c1, P.pl[1], 0.22 * worn); c2 = lerp(c2, P.pl[2], 0.22 * worn);
          A[i] = c0; A[i + 1] = c1; A[i + 2] = c2; A[i + 3] = a * 255;
          const e2 = scl * P.eye; // in the dark the whites of the eyes still catch what light there is
          B[i] = c0 * P.dim + P.sc[0] * e2; B[i + 1] = c1 * P.dim + P.sc[1] * e2; B[i + 2] = c2 * P.dim + P.sc[2] * e2 * 0.95; B[i + 3] = A[i + 3];
          const tq = Math.sqrt(clamp(tr)) * clamp(tr); G[i] = 255; G[i + 1] = 196 + 50 * tq; G[i + 2] = 120 + 90 * tq; G[i + 3] = a * tq * tq * 255; // the light through it: warm where thin, nothing through the veins and the dark
        }
        if ((y & 3) === 3) yield;
      }
      const [cl, xl] = can(WW, WH), [cd, xd] = can(WW, WH), [cg, xg] = can(WW, WH);
      xl.putImageData(il, 0, 0); xd.putImageData(idk, 0, 0); xg.putImageData(ig, 0, 0);
      O[name] = { lit: mip(cl), dark: mip(cd), glow: mip(cg), rim: mip(tinted(cl, L ? 'rgb(255,250,232)' : 'rgb(246,240,200)')), smear: mip(tinted(cl, L ? 'rgb(44,36,26)' : 'rgb(14,12,8)')) };
      yield;
    }
    { // the body: a head of compound eyes, the furred thorax with a skull on it, the banded abdomen
      const P = L ? { head: [44, 36, 26], fur: [76, 64, 47], pale: [108, 94, 68], dark: [34, 27, 19], skull: [228, 216, 184], dim: 0.6 }
        : { head: [52, 44, 32], fur: [106, 92, 70], pale: [132, 116, 86], dark: [46, 37, 27], skull: [214, 198, 158], dim: 0.34 };
      const il = new ImageData(BW, BH), idk = new ImageData(BW, BH), A = il.data, B = idk.data;
      for (let y = 0; y < BH; y++) {
        for (let x = 0; x < BW; x++) {
          const u = (x + 0.5 - BW / 2) / BPX, v = (y + 0.5) / BPX, i = (y * BW + x) * 4;
          let d = 9, part = 0, cv = 0;
          { const dd = Math.hypot(u / 0.056, (v - 0.06) / 0.05); if (dd < d) { d = dd; part = 1; cv = 0.06; } }
          { const dd = Math.hypot(u / 0.1, (v - 0.175) / 0.095); if (dd < d) { d = dd; part = 2; cv = 0.175; } }
          let sg = 0;
          if (v > 0.24 && v < 0.86) {
            const q = clamp((v - 0.25) / 0.6); sg = (q * 7.2) % 1;
            const w = (0.086 * (1 - Math.pow(q, 1.8)) + 0.011) * (0.86 + 0.14 * Math.sin(Math.PI * sg)), dd = Math.max(Math.abs(u) / w, (v - 0.85) / 0.012);
            if (dd < d) { d = dd; part = 3; cv = v; }
          }
          if (d > 1.5) continue;
          const an = Math.atan2(v - cv, u), hr = nHr(an * 14 + part * 20, d * 9 + y * 0.05), fi = nFi(x * 0.6, y * 0.6);
          const dh = d - (hr - 0.35) * 0.5 * (part === 2 ? 1.3 : part === 3 ? 0.95 : 0.45);
          const a = sm(1.1, 0.82, dh);
          if (a <= 0) continue;
          const cyl = Math.sqrt(1 - Math.min(1, d) * Math.min(1, d));
          let c = part === 1 ? P.head : part === 2 ? P.fur : mix3(mix3(P.fur, P.pale, 0.5), mix3(P.fur, P.dark, 0.6), sm(0.3, 0.6, sg + (hr - 0.5) * 0.4));
          if (part === 3 && Math.abs(u) < 0.011) c = P.dark; // a dark stripe down the back
          if (part === 2) { // the skull
            const sk = Math.hypot(u / 0.052, (v - 0.166) / 0.06), so = Math.min(Math.hypot((u - 0.022) / 0.015, (v - 0.156) / 0.018), Math.hypot((u + 0.022) / 0.015, (v - 0.156) / 0.018));
            if (sk < 1) {
              c = P.skull.map((q, k) => lerp(q, P.fur[k], sm(0.75, 1, sk)));
              if (so < 1) c = P.dark;
              else if (Math.hypot(u / 0.008, (v - 0.18) / 0.01) < 1) c = P.dark;
              else if (v > 0.196 && v < 0.212 && Math.abs(u) < 0.03 && Math.sin(u * BPX * 1.25) > 0.2) c = P.dark;
            }
          }
          if (part === 1) { // the eyes, glossy
            const ex = Math.min(Math.hypot((u - 0.04) / 0.027, (v - 0.052) / 0.03), Math.hypot((u + 0.04) / 0.027, (v - 0.052) / 0.03));
            if (ex < 1) { c = [10, 8, 6]; if (Math.min(Math.hypot(u - 0.034, v - 0.042), Math.hypot(u + 0.046, v - 0.042)) < 0.007) c = [200, 196, 180]; }
          }
          const sh = (0.38 + 0.72 * cyl) * (0.8 + 0.4 * hr) * (0.92 + 0.16 * fi);
          A[i] = c[0] * sh; A[i + 1] = c[1] * sh; A[i + 2] = c[2] * sh; A[i + 3] = a * 255;
          B[i] = A[i] * P.dim; B[i + 1] = A[i + 1] * P.dim; B[i + 2] = A[i + 2] * P.dim; B[i + 3] = A[i + 3];
        }
        if ((y & 7) === 7) yield;
      }
      const [cl, xl] = can(BW, BH), [cd, xd] = can(BW, BH);
      xl.putImageData(il, 0, 0); xd.putImageData(idk, 0, 0);
      O.body = { lit: mip(cl), dark: mip(cd), rim: mip(tinted(cl, L ? 'rgb(255,250,232)' : 'rgb(246,240,200)')) };
      yield;
    }
    { // its shadow (one half): the wings spread, the body; softened; lighter where the light comes through the eyespots
      const [c, x] = can(SW + 8, WH), ox = 8 + 0.055 * WW; // (8 px to spare left of the midline, so the blur is whole there)
      x.filter = 'blur(3px)';
      x.drawImage(masks.hind, ox, 0); x.drawImage(masks.fore, ox, 0);
      x.fillStyle = '#000'; x.beginPath();
      x.ellipse(8, HR - 0.115 * WW, 0.07 * WW, 0.06 * WW, 0, 0, TAU); x.ellipse(8, HR, 0.16 * WW, 0.13 * WW, 0, 0, TAU); x.ellipse(8, HR + 0.3 * WW, 0.15 * WW, 0.32 * WW, 0, 0, TAU);
      x.fill(); x.fill(); x.filter = 'none';
      x.globalCompositeOperation = 'destination-out';
      for (const [s, t, r, al] of [[0.43, 0.43, 0.125, 0.72], [0.52, 0.078, 0.058, 0.55]]) {
        const gx = ox + s * WW, gy = t * WW + HR, gr = x.createRadialGradient(gx, gy, 0, gx, gy, r * WW);
        gr.addColorStop(0, `rgba(0,0,0,${al})`); gr.addColorStop(0.6, `rgba(0,0,0,${al * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(gx - r * WW, gy - r * WW, 2 * r * WW, 2 * r * WW);
      }
      const ink = window.BR && window.BR.PAL ? window.BR.PAL.L.ink : '84,66,34';
      O.shadow = mip(L ? tinted(c, `rgb(${ink})`) : c);
      O.masks = masks;
    }
    { // a soft dot (dust close to the lens, the shine in an eye)
      const [c, x] = can(32, 32), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      O.dot = c; O.dotInk = tinted(c, `rgb(${window.BR && window.BR.PAL ? window.BR.PAL.L.ink : '84,66,34'})`);
    }
    return O;
  }
  const SETS = {};
  /** Run the painting for this mode for up to ms; true once it is done. */
  function pump(L, ms) {
    const k = L ? 'L' : 'D', s = SETS[k] || (SETS[k] = { it: paint(L), O: null });
    if (s.O) return true;
    const t0 = performance.now();
    let done = false;
    do { const r = s.it.next(); if (r.done) { s.O = r.value; done = true; break; } } while (performance.now() - t0 < ms);
    const dt = performance.now() - t0; s.tot = (s.tot || 0) + dt; s.max = Math.max(s.max || 0, dt);
    return done;
  }
  const sprites = (L) => { const s = SETS[L ? 'L' : 'D']; return s && s.O; };
  // if the backrooms are up when the app starts, paint it in idle time, before it is first needed
  setTimeout(function idle() {
    try {
      if (typeof S === 'undefined' || !S.settings || S.settings.bgAnim !== 'backrooms') return;
      const L = typeof isLight === 'function' && isLight();
      if (!pump(L, 5)) { if (window.requestIdleCallback) requestIdleCallback(idle, { timeout: 400 }); else setTimeout(idle, 40); }
    } catch (err) { /* not yet */ }
  }, 2500);

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const ad = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dt3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pj = (g, p) => (g.pr(p[0], p[2], p[1]) ? [g.sx, g.sy, g.sz] : null);
  /** Point a moth: F where its head points, N out of its back; R (its right) follows. */
  function orient(m, F, N) { m.F = nrm(F); m.N = nrm(ad(N, m.F, -dt3(N, m.F))); m.R = crs(m.N, m.F); }
  /** In flight: heading (0: away from us along the hall), nose up by pitch, rolled by roll. */
  function fly(m, yaw, pitch, roll) {
    const F = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    let N = ad([0, 1, 0], F, -F[1]); N = nrm(N);
    const R = crs(N, F), cr = Math.cos(roll), sr = Math.sin(roll);
    orient(m, F, ad(N.map((v) => v * cr), R, sr));
  }
  const lvOf = (ch, sc) => { let i = 0; while (i + 1 < ch.length && ch.k[i + 1] >= sc * 0.92) i++; return i; };
  /** The two slices (root half, tip half) of one wing as transforms from its sprite's px to the screen; false if not in view. */
  function wingXf(g, m, part, sd, out, single, near) {
    const sp = m.sp, ps = m.ps[part], cs = Math.cos(ps), sn = Math.sin(ps), B = [-m.F[0], -m.F[1], -m.F[2]];
    let O = ad(ad(m.p, m.F, part ? -0.03 * sp : 0.07 * sp), m.R, sd * 0.055 * sp);
    const N = out.n = single ? 1 : near ? 8 : 2, sw = N === 1 ? WW : WW / N; // close to the lens: more, narrower slices (the perspective is too strong for two)
    for (let k = 0; k < N; k++) {
      const th = N > 2 ? lerp(m.th[part * 2], m.th[part * 2 + 1], k / (N - 1)) : m.th[part * 2 + k], ct = Math.cos(th), st = Math.sin(th);
      const D = [m.R[0] * sd * ct + m.N[0] * st, m.R[1] * sd * ct + m.N[1] * st, m.R[2] * sd * ct + m.N[2] * st];
      const Ds = [D[0] * cs + B[0] * sn, D[1] * cs + B[1] * sn, D[2] * cs + B[2] * sn], Dc = [B[0] * cs - D[0] * sn, B[1] * cs - D[1] * sn, B[2] * cs - D[2] * sn];
      const ub = k * sw, u0 = k ? ub - 1.5 : 0, u1 = k === N - 1 ? WW : ub + sw + 1.5, q = out[k];
      const tl = ad(ad(O, Ds, ((u0 - ub) / WW) * sp), Dc, (-HR / WW) * sp);
      const TL = pj(g, tl), TR = pj(g, ad(tl, Ds, ((u1 - u0) / WW) * sp)), BL = pj(g, ad(tl, Dc, (WH / WW) * sp));
      if (!TL || !TR || !BL) return false;
      q.a = (TR[0] - TL[0]) / (u1 - u0); q.b = (TR[1] - TL[1]) / (u1 - u0); q.c = (BL[0] - TL[0]) / WH; q.d = (BL[1] - TL[1]) / WH;
      q.e = TL[0] - q.a * u0; q.f = TL[1] - q.b * u0; q.u0 = u0; q.u1 = u1; q.sc = Math.max(Math.hypot(q.a, q.b), Math.hypot(q.c, q.d));
      O = ad(O, Ds, (sw / WW) * sp);
    }
    return true;
  }
  /** One wing: each slice worn into what is behind, a rim of light along its top, laid in dark, lit, and the light through it. */
  function wingDraw(g, set, xf, o) {
    const ctx = g.ctx;
    for (let i = 0; i < xf.n; i++) {
      const q = xf[i], lv = lvOf(set.lit, q.sc), k = set.lit.k[lv], sx = q.u0 * k, sw = (q.u1 - q.u0) * k, sh = WH * k;
      const dr = (ch) => ctx.drawImage(ch[lv], sx, 0, sw, sh, q.u0, 0, q.u1 - q.u0, WH);
      if (o.rim > 0.02) { ctx.save(); ctx.translate(0, -o.rp); ctx.transform(q.a, q.b, q.c, q.d, q.e, q.f); ctx.globalAlpha = o.rim * o.op; dr(set.rim); ctx.restore(); }
      ctx.save(); ctx.transform(q.a, q.b, q.c, q.d, q.e, q.f);
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = o.op; dr(set.lit);
      ctx.globalCompositeOperation = 'source-over'; dr(set.dark);
      if (o.lit > 0.02) { ctx.globalAlpha = o.op * o.lit; dr(set.lit); }
      if (o.bl > 0.02) { ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, o.op * o.bl * (g.L ? 0.14 : 0.75)); dr(set.glow); }
      ctx.restore();
    }
  }
  /** The pupils of the eyespots, drawn live: they widen and narrow, and they move. */
  function pupils(g, w, xf, m, o, sd) {
    const ctx = g.ctx;
    if (xf[0].sc * WW * 0.03 < 0.7) return;
    for (const [ex, ey, rx, ry] of w.eyes) {
      const q = xf[Math.min(xf.n - 1, Math.floor(ex * xf.n))]; // the slice the eye is on
      ctx.save(); ctx.transform(q.a, q.b, q.c, q.d, q.e, q.f);
      const r = rx * WW * 0.6, ky = ry / rx, pw = r * (0.14 + 0.42 * m.dil), ph = ky * r * (0.5 + 0.25 * m.dil), cx = ex * WW + m.gz[0] * sd * (r - pw) * 0.75, cy = ey * WW + HR + m.gz[1] * (ky * r - ph) * 0.6;
      ctx.globalAlpha = o.op; ctx.fillStyle = 'rgb(6,5,3)'; ctx.beginPath(); ctx.ellipse(cx, cy, pw, ph, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = o.op * (0.3 + 0.6 * o.lit) * m.shine; ctx.fillStyle = 'rgb(255,252,238)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.34, cy - r * 0.4, r * 0.12, r * 0.085, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  /** The body: a furred billboard along the head-to-tail line (seen end on it is short, not thin). */
  function bodyDraw(g, set, m, o) {
    const ctx = g.ctx, sp = m.sp, H = pj(g, ad(m.p, m.F, 0.175 * sp)), T = pj(g, ad(m.p, m.F, -0.69 * sp)), C = pj(g, m.p);
    if (!H || !T || !C) return;
    const across = ((BK * sp * g.f) / C[2] / BW) * (m.br || 1), dx = T[0] - H[0], dy = T[1] - H[1], along = Math.max(Math.hypot(dx, dy) / BH, across * 0.45);
    const lv = lvOf(set.lit, Math.max(across, along)), k = set.lit.k[lv], dr = (ch) => ctx.drawImage(ch[lv], 0, 0, BW * k, BH * k, -BW / 2, 0, BW, BH);
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    if (o.rim > 0.02) { ctx.save(); ctx.translate(H[0], H[1] - o.rp); ctx.rotate(rot); ctx.scale(across, along); ctx.globalAlpha = o.rim * o.op; dr(set.rim); ctx.restore(); }
    ctx.save(); ctx.translate(H[0], H[1]); ctx.rotate(rot); ctx.scale(across, along);
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = o.op; dr(set.lit);
    ctx.globalCompositeOperation = 'source-over'; dr(set.dark);
    if (o.lit > 0.02) { ctx.globalAlpha = o.op * o.lit; dr(set.lit); }
    ctx.restore();
  }
  /** Six legs: gripping a surface (m.grip) or trailing in flight; each one jerks now and then (m.tw). */
  function legs(g, m, o, col) {
    const ctx = g.ctx, sp = m.sp, C = pj(g, m.p); if (!C) return;
    const s = g.f / C[2], w0 = Math.max(0.8, 0.016 * sp * s), w1 = Math.max(0.55, 0.008 * sp * s), a = new Path2D(), b = new Path2D();
    for (let k = 0; k < 6; k++) {
      const sd = k < 3 ? -1 : 1, n = k % 3, tw = m.tw[k];
      const root = ad(ad(ad(m.p, m.F, (0.06 - n * 0.06) * sp), m.R, sd * 0.03 * sp), m.N, -0.03 * sp);
      let foot, knee;
      if (m.grip) {
        foot = ad(ad(ad(m.p, m.F, (0.22 - n * 0.21 + tw * 0.06) * sp), m.R, sd * (0.16 + 0.05 * n + tw * 0.04) * sp), m.N, (-0.06 + tw * 0.05) * sp);
        knee = ad(ad(mix3(root, foot, 0.42), m.N, 0.06 * sp), m.R, sd * 0.035 * sp);
      } else {
        foot = ad(ad(ad(root, m.F, (-0.15 - 0.06 * n + 0.12 * tw) * sp), m.N, (-0.13 + 0.07 * tw) * sp), m.R, sd * (0.05 + 0.04 * n) * sp);
        knee = ad(ad(mix3(root, foot, 0.5), m.R, sd * 0.07 * sp), m.N, -0.015 * sp);
      }
      const tip = ad(foot, nrm([foot[0] - knee[0], foot[1] - knee[1], foot[2] - knee[2]]), 0.05 * sp);
      const P = [root, knee, foot, tip].map((q) => pj(g, q));
      if (P.some((q) => !q)) continue;
      a.moveTo(P[0][0], P[0][1]); a.lineTo(P[1][0], P[1][1]); a.lineTo(P[2][0], P[2][1]);
      b.moveTo(P[2][0], P[2][1]); b.lineTo(P[3][0], P[3][1]);
      if (w0 > 1.6) for (let q = 1; q < 4; q++) { const x = lerp(P[1][0], P[2][0], q / 4), y = lerp(P[1][1], P[2][1], q / 4), nx = P[2][1] - P[1][1], ny = P[1][0] - P[2][0], l = Math.hypot(nx, ny) || 1; b.moveTo(x, y); b.lineTo(x + (nx / l) * w0 * 1.6 + (P[2][0] - P[1][0]) * 0.06, y + (ny / l) * w0 * 1.6 + (P[2][1] - P[1][1]) * 0.06); } // spines
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.globalAlpha = o.op;
    ctx.lineWidth = w0; ctx.stroke(a); ctx.lineWidth = w1; ctx.stroke(b);
  }
  /** Feathered antennae: a curved shaft, combed with barbs that shorten toward the tip. */
  function antennae(g, m, o, col) {
    const ctx = g.ctx, sp = m.sp, C = pj(g, m.p); if (!C) return;
    const s = g.f / C[2], p = new Path2D(), lw = Math.max(0.6, 0.008 * sp * s), fine = sp * s > 45;
    for (const sd of [-1, 1]) {
      const lift = m.ant[sd > 0 ? 1 : 0], base = ad(ad(ad(m.p, m.F, 0.215 * sp), m.R, sd * 0.022 * sp), m.N, 0.012 * sp);
      const out = 0.45 + 0.35 * lift, d0 = m.fold ? nrm(ad(m.F.map((v) => v * -0.75), m.R, sd * 0.9)) : nrm(ad(ad(m.F.map((v) => v * Math.cos(out)), m.R, sd * Math.sin(out)), m.N, 0.25 + 0.35 * lift));
      const p1 = ad(base, d0, 0.12 * sp), p2 = ad(p1, nrm(ad(ad(d0, m.N, -0.55), m.R, sd * 0.35)), 0.12 * sp);
      const A = pj(g, base), B = pj(g, p1), Cc = pj(g, p2);
      if (!A || !B || !Cc) continue;
      p.moveTo(A[0], A[1]); p.quadraticCurveTo(B[0], B[1], Cc[0], Cc[1]);
      if (fine) {
        for (let k = 1; k < 16; k++) {
          const t = k / 16, v = 1 - t, x = v * v * A[0] + 2 * v * t * B[0] + t * t * Cc[0], y = v * v * A[1] + 2 * v * t * B[1] + t * t * Cc[1];
          const tx = 2 * v * (B[0] - A[0]) + 2 * t * (Cc[0] - B[0]), ty = 2 * v * (B[1] - A[1]) + 2 * t * (Cc[1] - B[1]), l = Math.hypot(tx, ty) || 1;
          const bl = (0.05 * (1 - t) + 0.01) * sp * s * (0.9 + 0.2 * Math.sin(k * 2.1)), ux = tx / l, uy = ty / l;
          p.moveTo(x, y); p.lineTo(x + (-uy * 0.9 + ux * 0.45) * bl, y + (ux * 0.9 + uy * 0.45) * bl);
          p.moveTo(x, y); p.lineTo(x + (uy * 0.9 + ux * 0.45) * bl, y + (-ux * 0.9 + uy * 0.45) * bl);
        }
      }
    }
    ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.globalAlpha = o.op * 0.9; ctx.lineWidth = lw; ctx.stroke(p);
  }
  const XF = [0, 1, 2, 3].map(() => [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({}))), XG = [0, 1, 2, 3].map(() => [{}]);
  function ghost(g, set, q, o) {
    const ctx = g.ctx, lv = lvOf(set.smear, q.sc * 0.5), k = set.smear.k[lv];
    ctx.save(); ctx.transform(q.a, q.b, q.c, q.d, q.e, q.f); ctx.globalAlpha = o.op * (g.L ? 0.13 : 0.22);
    ctx.drawImage(set.smear[lv], 0, 0, WW * k, WH * k, 0, 0, WW, WH); ctx.restore();
  }
  /** A whole moth m ({ p, F, R, N, sp (one wing's length, m), th [4] (wing lift: fore root, fore tip, hind root, hind tip),
   * ps [2] (wings swept back), tw [6], ant [2], gz, dil, shine, grip, fold, br }) with o ({ op, lit, bl (light through it), rim, rp }). */
  function drawMoth(g, O, m, o) {
    const cam = [g.camX, 1.55, g.camZ], below = dt3([cam[0] - m.p[0], cam[1] - m.p[1], cam[2] - m.p[2]], m.N) < 0; // seen from under it?
    const C = pj(g, m.p); if (!C) return false;
    const ny = below ? -m.N[1] : m.N[1]; // the side we see: lit from the tubes above as far as it faces up; facing down, the light comes through it instead
    o.lit *= 0.78 + 0.22 * ny + (ny < 0 ? 0.3 * ny : 0); o.rim *= 0.65 + 0.35 * Math.max(0, ny); o.bl *= Math.max(0.15, -ny);
    const px = (m.sp * g.f) / C[2], single = px < (o.cheap ? 75 : 45);
    o.rp = Math.max(1, Math.min(2.5, px * 0.008)); if (single) o.rim = 0;
    const col = g.L ? 'rgb(30,24,16)' : `rgb(${Math.round(34 + 64 * o.lit)},${Math.round(29 + 56 * o.lit)},${Math.round(21 + 42 * o.lit)})`;
    if (!below) legs(g, m, o, col);
    for (let k = 0; k < 4; k++) if (!wingXf(g, m, k >> 1, k & 1 ? 1 : -1, XF[k], single, C[2] < 1.6)) return false;
    const gh = m.thp && !single && !m.grip && !o.cheap && Math.abs(m.th[0] - m.thp[0]) + Math.abs(m.th[2] - m.thp[2]) > 0.3 ? XG : null; // a smear where the wings just were: they beat too fast for the tape
    if (gh) { const th = m.th; m.th = m.thp; for (let k = 0; k < 4; k++) if (!wingXf(g, m, k >> 1, k & 1 ? 1 : -1, XG[k], true)) { m.th = th; return false; } m.th = th; }
    for (const part of below ? [0, 1] : [1, 0]) {
      const w = part ? WING.hind : WING.fore, set = part ? O.hind : O.fore;
      if (gh) for (const sdk of [0, 1]) ghost(g, set, gh[part * 2 + sdk][0], o);
      for (const sdk of [0, 1]) { wingDraw(g, set, XF[part * 2 + sdk], o); pupils(g, w, XF[part * 2 + sdk], m, o, sdk ? 1 : -1); }
    }
    bodyDraw(g, O.body, m, o);
    antennae(g, m, o, col);
    if (below) legs(g, m, o, col);
    return true;
  }
  /** The moth's shadow on a plane: c its centre there, ax / ay the plane's directions of the moth's right and its tail, sp its span there, open [left, right] (how far each wing is spread). */
  function shadowOn(g, O, c, ax, ay, sp, open, op) {
    if (op < 0.01) return;
    const ctx = g.ctx, sh = O.shadow;
    for (const sd of [-1, 1]) {
      const tl = ad(c, ay, (-HR / WW) * sp), TL = pj(g, tl), TR = pj(g, ad(tl, ax, (sd * SW * sp * Math.max(0.12, open[sd > 0 ? 1 : 0])) / WW)), BL = pj(g, ad(tl, ay, (WH / WW) * sp));
      if (!TL || !TR || !BL) continue;
      const a = (TR[0] - TL[0]) / SW, b = (TR[1] - TL[1]) / SW, cc = (BL[0] - TL[0]) / WH, d = (BL[1] - TL[1]) / WH, lv = lvOf(sh, Math.max(Math.hypot(a, b), Math.hypot(cc, d)) * 1.6), k = sh.k[lv];
      ctx.save(); ctx.transform(a, b, cc, d, TL[0], TL[1]);
      ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.globalAlpha = Math.min(1, op);
      ctx.drawImage(sh[lv], 0, 0, (SW + 8) * k, WH * k, -8, 0, SW + 8, WH); // (the halves overlap over the body)
      ctx.restore();
    }
  }
  /** Clip to a polygon of plan points (false if a corner is behind us). */
  function clipTo(g, pts, holes) {
    const ctx = g.ctx; ctx.beginPath();
    for (const poly of holes ? [pts].concat(holes) : [pts]) for (let i = 0; i < poly.length; i++) { const q = pj(g, poly[i]); if (!q) return false; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.clip('evenodd'); return true;
  }
  /** Its shadow thrown from a tube (lp) onto the hall's carpet (rows up to J) or onto a hall wall (line ed of row J). */
  function castFloor(g, O, BR, m, lp, J, op) {
    const k = Math.min(5, lp[1] / Math.max(0.05, lp[1] - m.p[1])), c = [lp[0] + (m.p[0] - lp[0]) * k, 0.003, lp[2] + (m.p[2] - lp[2]) * k];
    if (Math.abs(c[0]) > 3 || c[2] < g.camZ + 0.6) return;
    const ax = nrm([m.R[0], 0, m.R[2]]), ay = nrm([-m.F[0], 0, -m.F[2]]);
    const ctx = g.ctx; ctx.save();
    if (clipTo(g, [[-1.78, 0, Math.max(g.camZ + 0.5, (J - 1) * BR.C)], [1.78, 0, Math.max(g.camZ + 0.5, (J - 1) * BR.C)], [1.78, 0, (J + 1) * BR.C], [-1.78, 0, (J + 1) * BR.C]]))
      shadowOn(g, O, c, ax, ay, m.sp * k, [Math.abs(Math.cos(m.th[0])), Math.abs(Math.cos(m.th[0]))], op / Math.sqrt(k));
    ctx.restore();
  }
  function castWall(g, O, BR, m, lp, J, ed, op) {
    const C = BR.C, xw = (ed - 0.5) * C, dx = m.p[0] - lp[0];
    if (Math.abs(dx) < 1e-3 || (xw - lp[0]) / dx < 1) return;
    const k = Math.min(4.5, (xw - lp[0]) / dx), c = [xw, lp[1] + (m.p[1] - lp[1]) * k, lp[2] + (m.p[2] - lp[2]) * k];
    if (c[1] < 0.2) return;
    const ty = g.sd(J, ed); if (!ty) return;
    let ax = [0, m.R[1], m.R[2]], ay = [0, -m.F[1], -m.F[2]];
    ax = Math.hypot(ax[1], ax[2]) < 0.2 ? [0, 0, 1] : nrm(ax); ay = Math.hypot(ay[1], ay[2]) < 0.2 ? [0, -1, 0] : nrm(ay);
    const z0 = Math.max(J * C, g.camZ + 0.6), z1 = (J + 1) * C; if (z1 - z0 < 0.2) return;
    const zm = J * C + C / 2, door = ty === 2 ? [[[xw, 0, zm - 0.525], [xw, 2.1, zm - 0.525], [xw, 2.1, zm + 0.525], [xw, 0, zm + 0.525]]] : null;
    const ctx = g.ctx; ctx.save();
    if (clipTo(g, [[xw, 0, z0], [xw, 2.6, z0], [xw, 2.6, z1], [xw, 0, z1]], door))
      shadowOn(g, O, c, ax, ay, m.sp * k, [Math.abs(Math.cos(m.th[0])), Math.abs(Math.cos(m.th[0]))], op / Math.sqrt(k));
    ctx.restore();
  }
  /** Dust off the wings: specks glinting as they tumble down through the light; near the lens, soft out-of-focus discs. */
  function dustDraw(g, O, BR, e, j) {
    const ctx = g.ctx;
    for (const q of e.dust) {
      if (BR.ROW(q.z) !== j || !g.pr(q.x, q.z, q.y)) continue;
      const a = Math.min(1, q.life / 30) * q.a, lt = g.lum(BR.COL(q.x), BR.ROW(q.z)) * g.glob, s = g.f / g.sz, r = q.s * s, tw = 0.5 + 0.5 * Math.sin(q.ph + g.fr * 0.45);
      if (r > 2.4) {
        const R = Math.min(60, r * 2.2);
        ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter'; ctx.globalAlpha = a * (g.L ? 0.16 : 0.1 + 0.16 * lt) * (0.6 + 0.4 * tw);
        ctx.drawImage(g.L ? O.dotInk : O.dot, g.sx - R, g.sy - R, R * 2, R * 2); ctx.globalCompositeOperation = 'source-over';
      } else {
        const rr = Math.max(0.55, Math.min(2.4, r));
        ctx.globalAlpha = 1; ctx.fillStyle = g.L ? `rgba(${g.pal.ink},${0.55 * a})` : `rgba(${g.pal.pale},${(0.15 + 0.7 * lt) * a * (0.35 + 0.65 * tw)})`;
        ctx.fillRect(g.sx - rr, g.sy - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  /** Shed some dust at p. */
  function shed(e, p, n, spread, v) {
    for (let k = 0; k < n && e.dust.length < 150; k++) e.dust.push({ x: p[0] + (Math.random() - 0.5) * spread, y: p[1] + (Math.random() - 0.5) * spread * 0.5, z: p[2] + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * (v || 0.004), vz: (Math.random() - 0.5) * (v || 0.004), vy: -0.002 - Math.random() * 0.004, life: 60 + Math.random() * 70, a: 0.6 + Math.random() * 0.4, s: 0.0025 + Math.random() * 0.003, ph: Math.random() * TAU });
  }
  function dustStep(e) {
    for (const q of e.dust) { q.x += q.vx + Math.sin(q.ph * 0.7 + q.life * 0.11) * 0.0015; q.z += q.vz; q.y += q.vy; q.vx *= 0.97; q.vz *= 0.97; q.vy = Math.max(-0.008, q.vy - 0.00008); q.life--; }
    e.dust = e.dust.filter((q) => q.life > 0 && q.y > 0.02);
  }

  // ---- the moths' bodies in motion -------------------------------------------------------------------------------------
  const HC = 2.6, rnd = (a, b) => a + Math.random() * (b - a);
  function actor(sp) {
    const m = { p: [0, 2, 0], v: [0, 0, 0], sp, th: [0, 0, 0, 0], ps: [0, 0], tw: [0, 0, 0, 0, 0, 0], ant: [0, 0], gz: [0, 0], dil: 0.7, shine: 1, grip: false, fold: false, br: 1,
      fp: Math.random() * TAU, yaw: 0, pitch: 0, roll: 0, op: 1, dart: 0 };
    fly(m, 0, 0, 0);
    return m;
  }
  /** Beat the wings: fore and hind a little apart, the tips lagging the roots (the wing bends); rate per frame, amp, bias (rad). */
  function flap(m, rate, amp, bias) {
    amp *= 0.78; bias *= 0.7; m.thp = m.th.slice(); // (where the wings were a frame ago: drawn as a smear)
    m.fp += rate;
    const c0 = Math.cos(m.fp), c1 = Math.cos(m.fp - 0.5);
    m.th[0] = bias + amp * c0; m.th[1] = m.th[0] + 0.38 * amp * Math.sin(m.fp - 0.9);
    m.th[2] = bias + amp * 0.9 * c1; m.th[3] = m.th[2] + 0.3 * amp * Math.sin(m.fp - 1.4);
  }
  /** Legs and antennae: still, then a jerk. */
  function twitch(m, rate) {
    for (let k = 0; k < 6; k++) m.tw[k] = Math.random() < rate ? rnd(-1, 1) : m.tw[k] * 0.8;
    for (let k = 0; k < 2; k++) m.ant[k] = Math.random() < rate * 0.7 ? rnd(-0.6, 1) : m.ant[k] + (0.4 - m.ant[k]) * 0.02;
  }
  /** Erratic flight toward a point: pulled to it, kicked about, now and then a dart or a dead stop; it faces where it goes. */
  function steer(m, tg, pull, damp, jit, dart) {
    if (m.stop > 0) { m.stop--; m.v[0] *= 0.6; m.v[1] *= 0.6; m.v[2] *= 0.6; } // a dead stop, hanging in the air
    else if (Math.random() < dart * 0.4) m.stop = 5 + ((Math.random() * 8) | 0);
    if (m.dart > 0) m.dart--;
    else if (Math.random() < dart) { m.dart = 3 + ((Math.random() * 5) | 0); const a = rnd(0, TAU), k = rnd(0.03, 0.07); m.v[0] += Math.cos(a) * k; m.v[2] += Math.sin(a) * k; m.v[1] += rnd(-0.03, 0.03); }
    for (let i = 0; i < 3; i++) { m.v[i] += (tg[i] - m.p[i]) * pull + (Math.random() - 0.5) * jit; m.v[i] *= damp; m.p[i] += m.v[i]; }
    const sp = Math.hypot(m.v[0], m.v[2]);
    if (sp > 0.004) { let d = Math.atan2(m.v[0], m.v[2]) - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); m.roll = Math.max(-0.45, Math.min(0.45, m.roll * 0.8 + d * 0.25)); m.yaw += d * 0.18; }
    m.pitch = Math.max(-0.4, Math.min(0.4, m.pitch * 0.85 + Math.atan2(m.v[1], sp + 0.01) * 0.12));
    fly(m, m.yaw, m.pitch, m.roll);
  }
  /** Clinging upside down under a ceiling or a diffuser, head toward yaw. */
  function cling(m, yaw) { orient(m, [Math.sin(yaw), 0, Math.cos(yaw)], [0, -1, 0]); m.grip = true; }
  const lightAt = (g, BR, p) => g.lum(BR.COL(p[0]), BR.ROW(p[2])) * g.glob;
  /** How it is lit: op, its light, the light through it when a tube is behind it (lp: the tube). */
  function look(g, BR, m, lp, k) {
    const lt = lightAt(g, BR, m.p), z = m.p[2] - g.camZ, o = { op: m.op * BR.far(Math.max(0.5, z)), lit: lt, bl: 0, rim: (g.L ? 0.55 : 0.6) * lt };
    if (lp) { const d = Math.hypot(m.p[0] - lp[0], (m.p[1] - lp[1]) * 1.6, m.p[2] - lp[2]); o.bl = lt * (k || 1) * clamp(1.35 - d / 1.1); }
    return o;
  }
  const flickV = (t, k) => ((Math.sin(t * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1 < 0.5 ? 0.1 : 0.85;
  function camLook(e, st, want, rate) { e.look += (want - e.look) * rate; st.look = e.look; }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /** Nothing across the hall between us and z (no wall with a doorway in it: the doorway would hide all but a slot). */
  const openTo = (g, BR, z, y) => { // (with y: a doorway will do if a point that high at z shows under its lintel)
    for (let j = BR.ROW(g.camZ); j < BR.ROW(z); j++) {
      if (g.cr(j, 0) === 0) continue;
      if (y == null || 1.55 + (y - 1.55) * (((j + 1) * BR.C - g.camZ) / (z - g.camZ)) > 1.95) return false;
    }
    return true;
  };
  /** Lit rows of the hall whose tube is between a and b metres ahead, in plain view. */
  function tubesAhead(g, BR, a, b, min) {
    if (g.loose) { a *= 0.8; b *= 1.6; }
    const o = [];
    for (let j = g.j0 + 1; j < g.j0 + 8; j++) { const d = (j + 0.5) * BR.C - g.camZ; if (d >= a && d <= b && g.lum(0, j) > (min || 0.8) && openTo(g, BR, (j + 0.5) * BR.C, HC - 0.15)) o.push(j); }
    return o.length ? BR.pick(o) : null;
  }

  // ---- the five visits: where each can happen, and how it goes, frame by frame (e.t: its own clock) -------------------
  const PLACE = {}, STEP = {};

  /* tube: the shadow first, then it, battering the near tube; it clings to the diffuser, lit through; it leaves into the dark. */
  PLACE.tube = (g, BR) => {
    const J = tubesAhead(g, BR, 2.6, 4.1); if (J == null) return null;
    const side = Math.random() < 0.5 ? -1 : 1, fz = (J + 0.5) * BR.C, m = actor(0.8);
    m.p = [side * 0.5, HC - 0.12, fz + 0.15]; m.op = 0;
    return { J, side, fz, m, opn: g.sd(J, side < 0 ? 0 : 1) !== 1, lp: [0, HC - 0.04, fz], land: 0, nextLand: 34 + rnd(0, 20), lands: 0, hit: 0, hits: 0, x: m.p[0], y: m.p[1], z: m.p[2] };
  };
  STEP.tube = (e, g, st, BR) => {
    const t = e.t, m = e.m, lp = e.lp;
    let lv = 1;
    if (t < 50) { // its shadow, sweeping the ceiling toward the tube and shrinking onto it
      if (t > 20 && t < 30) lv = flickV(t >> 1, 1);
      e.vis = 0.3; m.op = 0;
      if (t === 46) { m.op = 0.2; m.v = [e.side * -0.02, -0.02, 0]; }
    } else if (t < 262) {
      m.op = Math.min(1, m.op + 0.12);
      if (e.land > 0) { // on the diffuser: crawling a step at a time, wings flicking, legs never still
        e.land--;
        if (Math.random() < 0.06) { m.p[0] += rnd(-0.05, 0.05); m.p[2] += rnd(-0.04, 0.04); }
        m.p[0] = Math.max(-0.5, Math.min(0.5, m.p[0])); m.p[2] = Math.max(e.fz - 0.24, Math.min(e.fz + 0.24, m.p[2]));
        const fl = Math.max(0, Math.sin(t * 0.21)) ** 6;
        m.th[0] = m.th[1] = -0.05 + 0.5 * fl; m.th[2] = m.th[3] = -0.04 + 0.42 * fl;
        twitch(m, 0.08);
        lv = 0.55 - 0.25 * fl + (Math.random() < 0.05 ? -0.3 : 0);
        if (e.land === 0) { m.grip = false; m.v = [rnd(-0.02, 0.02), -0.045, rnd(-0.02, 0.02)]; e.nextLand = t + 60 + rnd(0, 40); shed(e, m.p, 10, 0.4); }
        if (Math.random() < 0.15) shed(e, m.p, 1, 0.5, 0.002);
      } else {
        const tg = [Math.sin(t * 0.07) * 0.35, HC - 0.06 + Math.sin(t * 0.11) * 0.05, e.fz + Math.cos(t * 0.05) * 0.3];
        steer(m, tg, 0.006, 0.88, 0.02, 0.04);
        flap(m, 0.95 + Math.random() * 0.3, 1.05, 0.2);
        twitch(m, 0.12);
        if (m.p[1] > HC - 0.075) { // it hits the diffuser
          m.p[1] = HC - 0.075; m.v[1] = -0.035 - Math.random() * 0.02;
          if (Math.abs(m.p[0]) < 0.7 && Math.abs(m.p[2] - e.fz) < 0.4) {
            e.hit = 3; e.hits++; shed(e, m.p, 8, 0.3);
            if (e.hits === 2) { BR.glitch(st, 3); st.flick = BR.DIP.length; }
          }
        }
        if (t >= e.nextLand && t < 220 && m.p[1] > HC - 0.2 && Math.abs(m.p[0]) < 0.55 && Math.abs(m.p[2] - e.fz) < 0.3) { e.land = 40 + ((Math.random() * 30) | 0); e.lands++; cling(m, rnd(-0.6, 0.6) + (Math.random() < 0.5 ? Math.PI : 0)); m.p[1] = HC - 0.035; m.v = [0, 0, 0]; }
        if (e.hit > 0) { e.hit--; lv = e.hit > 1 ? 0.12 : 0.5; }
        if (Math.random() < 0.25) shed(e, m.p, 1, 0.3, 0.003);
      }
      e.vis = 1;
    } else { // away into the dark: a side room (its light goes) or down the hall
      if (m.grip) { m.grip = false; }
      const tg = e.opn ? [e.side * 4.8, 1.9, e.fz + 0.4] : [0.4, 2.0, e.fz + 8];
      steer(m, tg, 0.004, 0.9, 0.012, 0.03); flap(m, 1.0, 1.1, 0.25); twitch(m, 0.1);
      if (Math.random() < 0.2) shed(e, m.p, 1, 0.3);
      m.op *= 0.985;
      if (t > 330) e.done = true;
    }
    e.cl = [[0, e.J, lv]];
    if (t >= 262) { if (e.opn) e.cl.push([e.side, e.J, 0.04]); else e.cl.push([0, e.J + 1, 0.05], [0, e.J + 2, 0.05]); }
    if (t > 40 && t < 300) st.halt = Math.max(st.halt || 0, 45);
    camLook(e, st, t < 300 ? Math.atan2(m.p[0] - g.camX, m.p[2] - g.camZ) * 0.25 : 0, 0.03);
    e.x = m.p[0]; e.y = m.p[1]; e.z = m.p[2];
  };

  /* swarm: a far tube smothered, strobing; the light dies, their eyes are left; then they all come at us. */
  PLACE.swarm = (g, BR) => {
    const J = tubesAhead(g, BR, 3.0, 5.3); if (J == null) return null;
    const fz = (J + 0.5) * BR.C, ms = [];
    for (let k = 0; k < 10; k++) {
      const m = actor(rnd(0.26, 0.38)), crawl = k < 6, a = rnd(0, TAU);
      m.p = [Math.cos(a) * rnd(1.4, 2.4), rnd(0.9, 2.3), fz + Math.sin(a) * rnd(1.2, 1.8)]; m.op = 0;
      Object.assign(m, { crawl, t0: k * 6 + rnd(0, 6), spot: [rnd(-0.48, 0.48), HC - 0.03, fz + rnd(-0.24, 0.24)], on: false, hd: rnd(0, TAU), orb: rnd(0, TAU), orr: rnd(0.4, 0.9), orh: rnd(1.95, 2.4), out: null });
      ms.push(m);
    }
    return { J, fz, ms, lp: [0, HC - 0.04, fz], x: 0, y: HC - 0.1, z: fz };
  };
  STEP.swarm = (e, g, st, BR) => {
    const t = e.t;
    let on = 0, near = 0;
    for (const m of e.ms) {
      if (t < m.t0) continue;
      if (t >= 262) { // at us
        if (!m.out) { m.out = [g.camX + rnd(-1.0, 1.0), rnd(2.0, 2.45), g.camZ + rnd(0.2, 0.6)]; m.grip = false; fly(m, Math.PI, 0, 0); m.v = [0, -0.03, -0.02]; m.op = 1; }
        steer(m, m.out, 0.012, 0.86, 0.02, 0.05); flap(m, 1.1, 1.15, 0.25); twitch(m, 0.15);
        if (m.p[2] < g.camZ + 0.3) m.op = 0;
        if (Math.random() < 0.3) shed(e, m.p, 1, 0.2);
        continue;
      }
      m.op = Math.min(1, m.op + 0.05);
      if (m.crawl && (m.on || Math.hypot(m.p[0] - m.spot[0], m.p[2] - m.spot[2]) < 0.15 && m.p[1] > HC - 0.25)) {
        if (!m.on) { m.on = true; cling(m, m.hd); m.p = m.spot.slice(); }
        if (Math.random() < 0.05) { m.p[0] = Math.max(-0.55, Math.min(0.55, m.p[0] + rnd(-0.06, 0.06))); m.p[2] = Math.max(e.fz - 0.27, Math.min(e.fz + 0.27, m.p[2] + rnd(-0.05, 0.05))); m.hd += rnd(-0.5, 0.5); cling(m, m.hd); }
        const fl = Math.max(0, Math.sin(t * 0.17 + m.orb * 3)) ** 8;
        m.th[0] = m.th[1] = -0.05 + 0.55 * fl; m.th[2] = m.th[3] = -0.04 + 0.45 * fl;
        twitch(m, 0.1); on++; if (fl > 0.3) near++;
      } else if (m.crawl) {
        steer(m, m.spot, 0.01, 0.86, 0.02, 0.03); flap(m, 1.05, 1.1, 0.2); twitch(m, 0.12);
        if (m.p[1] > HC - 0.06) { m.p[1] = HC - 0.06; m.v[1] = -0.02; }
      } else { // circling under the tube, hitting it
        m.orb += rnd(0.06, 0.14);
        steer(m, [Math.cos(m.orb) * m.orr, m.orh + Math.sin(m.orb * 1.7) * 0.15, e.fz + Math.sin(m.orb) * m.orr * 0.6], 0.02, 0.86, 0.025, 0.05);
        flap(m, 1.0 + Math.random() * 0.3, 1.1, 0.22); twitch(m, 0.12);
        if (m.p[1] > HC - 0.06) { m.p[1] = HC - 0.06; m.v[1] = -0.03; shed(e, m.p, 3, 0.2); near += 2; }
        if (Math.hypot(m.p[0], m.p[2] - e.fz) < 0.6) near++;
        if (Math.random() < 0.15) shed(e, m.p, 1, 0.2);
      }
    }
    let lv = Math.max(0.3, 1 - 0.075 * on) * (near ? rnd(0.45, 1) : 1);
    if (Math.random() < 0.04) lv *= 0.2;
    if (t >= 228 && t < 252) lv = flickV(t >> 1, 7) * 0.6;
    if (t >= 252) lv = 0.03;
    if (t === 262) { BR.glitch(st, 4); st.flick = BR.DIP.length; }
    e.cl = [[0, e.J, lv]];
    e.vis = t < 20 ? 0.4 : 1;
    if (t > 30 && t < 300) st.halt = Math.max(st.halt || 0, 45);
    camLook(e, st, 0, 0.03);
    if (t > 320) e.done = true;
  };

  /* wall: a huge one flat on the wallpaper by a doorway; we turn to it; it opens its wings on a face; it bursts at us. */
  PLACE.wall = (g, BR) => {
    const C = BR.C, o = [], [a, b] = g.loose ? [1.3, 4.4] : [1.45, 2.4], need = 1.45;
    for (const ed of [0, 1]) {
      const iv = [], doors = []; // the solid stretches of this wall line (merged across rows where no wall crosses the hall)
      for (let j = g.j0; j <= g.j0 + 3; j++) {
        const ty = g.sd(j, ed), add = (z0, z1) => { const l = iv[iv.length - 1]; if (l && Math.abs(l[1] - z0) < 1e-6 && g.cr(j - 1, 0) === 0) l[1] = z1; else iv.push([z0, z1]); };
        if (ty === 1) add(j * C, j * C + C);
        else if (ty === 2) { add(j * C, j * C + C / 2 - 0.525); add(j * C + C / 2 + 0.525, j * C + C); doors.push(j * C + C / 2 - 0.525, j * C + C / 2 + 0.525); }
      }
      for (const [z0, z1] of iv) for (let zc = z0 + need / 2; zc <= z1 - need / 2 + 1e-6; zc += 0.08) {
        const d = zc - g.camZ; if (d < a || d > b || !openTo(g, BR, zc + 0.75)) continue;
        o.push([ed, zc, z0, z1, doors.some((q) => Math.abs(q - zc) < 1.3)]);
      }
    }
    if (!o.length) return null;
    const dd = o.filter((q) => q[4]), [ed, zc, z0, z1] = BR.pick(dd.length && Math.random() < 0.85 ? dd : o);
    const side = ed ? 1 : -1, xw = (ed - 0.5) * C, m = actor(0.64), tilt = rnd(-0.22, 0.22);
    m.p = [xw - side * 0.035, 1.42, zc];
    orient(m, [0, Math.cos(tilt), Math.sin(tilt)], [-side, 0, 0]);
    Object.assign(m, { grip: true, fold: true, ps: [0.64, 0.44], dil: 1, gz: [0, 0] });
    return { J: BR.ROW(Math.max(z0, zc - 0.75)), JL: BR.ROW(zc), ed, side, xw, zc, z0, z1, m, onWall: true, print: 0, x: m.p[0], y: m.p[1], z: m.p[2] };
  };
  STEP.wall = (e, g, st, BR) => {
    const t = e.t, m = e.m;
    if (e.hold > 0) e.hold--; else { e.tw = (e.tw || 0) + 1; if (t > 90 && t < 170 && Math.random() < 0.05) e.hold = 3 + ((Math.random() * 6) | 0); } // the opening stops and starts
    const tw = e.tw || 0, cam = [g.camX, 1.55, g.camZ];
    let lv = 1;
    if (e.onWall) {
      m.br = 1 + 0.045 * Math.sin(t * 0.09); // breathing
      if (t === 56) m.fold = false;
      twitch(m, t < 50 ? 0.004 : 0.03);
      const u = sm(90, 172, tw); m.ps[0] = lerp(0.64, -0.24, u); m.ps[1] = lerp(0.44, 0.0, u);
      // the pupils: wide and wandering; then they narrow and find us
      const v = nrm([cam[0] - m.p[0], cam[1] - m.p[1], cam[2] - m.p[2]]), gx = Math.max(-1, Math.min(1, dt3(v, m.R) * 1.8)), gy = Math.max(-1, Math.min(1, -dt3(v, m.F) * 1.8));
      if (t < 150) { if (Math.random() < 0.05) e.sac = [rnd(-0.9, 0.9), rnd(-0.7, 0.7)]; const s = e.sac || [0, 0]; m.gz[0] += (s[0] - m.gz[0]) * 0.5; m.gz[1] += (s[1] - m.gz[1]) * 0.5; m.dil = 1; }
      else { m.gz[0] += (gx - m.gz[0]) * 0.6; m.gz[1] += (gy - m.gz[1]) * 0.6; m.dil += (0.3 - m.dil) * 0.35; if (Math.random() < 0.03) m.gz[0] += rnd(-0.3, 0.3); }
      if (t === 151) BR.glitch(st, 2);
      if (t > 186 && t < 204) lv = flickV(t >> 1, 3);
      if (t === 192) BR.glitch(st, 2);
      if (t >= 224) { const k = sm(224, 236, t); m.th[0] = m.th[1] = k * (0.1 + 0.12 * Math.sin(t * 2.6)); m.th[2] = m.th[3] = k * (0.08 + 0.1 * Math.sin(t * 2.6 + 1)); if (Math.random() < 0.3) shed(e, m.p, 1, 0.5, 0.002); } // shivering, warming up
      if (t === 248) { // off the wall, at us
        BR.glitch(st, 4); st.flick = BR.DIP.length;
        e.pm = { p: m.p.slice(), F: m.F, R: m.R, N: m.N, sp: m.sp, th: [0, 0, 0, 0], ps: m.ps.slice() }; e.print = 1;
        shed(e, m.p, 46, 0.9, 0.012);
        e.onWall = false; e.bt = t; m.grip = false; m.fold = false; m.v = [-e.side * 0.05, 0.03, -0.035]; m.yaw = Math.PI; m.dil = 0.12;
      }
    } else {
      steer(m, [g.camX + e.side * 0.2, 2.3, g.camZ + 0.2], 0.03, 0.82, 0.012, 0); // at us, over our heads
      flap(m, 1.25, 1.2, 0.3); twitch(m, 0.2);
      if (Math.random() < 0.6) shed(e, m.p, 1, 0.3, 0.004);
      if (m.p[2] < g.camZ + 0.3) m.op = 0;
      e.print = Math.max(0, e.print - 0.012);
      if (t > 320) e.done = true;
    }
    e.cl = [[0, e.JL, lv]];
    st.halt = Math.max(st.halt || 0, e.zc - g.camZ < 1.95 ? 45 : 0);
    const want = e.onWall ? (t < 14 ? 0 : Math.atan2(e.xw - g.camX, e.zc - g.camZ) * 0.74 + Math.sin(t * 0.13) * 0.008) : 0;
    camLook(e, st, want, e.onWall ? 0.045 : t - e.bt < 9 ? 0.01 : 0.12);
    e.vis = 1; e.x = m.p[0]; e.y = m.p[1]; e.z = m.p[2];
  };

  /* pass: down the hall at us, rising, close over our heads; its dust rains in front of the lens. */
  PLACE.pass = (g, BR) => {
    const m = actor(0.5);
    m.p = [rnd(-0.4, 0.4), 1.85, g.camZ + 11]; m.yaw = Math.PI; fly(m, Math.PI, 0, 0); m.op = 0;
    return { m, x: m.p[0], y: m.p[1], z: m.p[2], gl: false, bump: 0 };
  };
  STEP.pass = (e, g, st, BR) => {
    const t = e.t, m = e.m, C = BR.C;
    if (t < 150) {
      m.op = Math.min(1, m.op + 0.05);
      const dz = Math.max(0.12, 10.6 - 10.4 * Math.pow(Math.min(1, t / 138), 1.25)), jr = BR.ROW(m.p[2]);
      let y = 1.85 + 0.38 * sm(100, 136, t) + Math.sin(t * 0.21) * 0.08;
      if (t > 38 && t < 56) y = HC - 0.02; // up to the tube it is passing, and against it
      steer(m, [Math.sin(t * 0.05) * 0.35, y, g.camZ + dz], 0.024, 0.84, 0.022, 0.045);
      flap(m, 1.0 + Math.random() * 0.35, 1.12, 0.24); twitch(m, 0.12);
      if (m.p[1] > HC - 0.08) { m.p[1] = HC - 0.08; m.v[1] = -0.03; if (!e.bump) { e.bump = 6; e.bj = jr; shed(e, m.p, 12, 0.35); } }
      if (Math.random() < 0.35) shed(e, m.p, 1, 0.3, 0.004);
      if (!e.gl && m.p[2] - g.camZ < 1.25) { e.gl = true; BR.glitch(st, 3); for (let k = 0; k < 40; k++) shed(e, [g.camX + rnd(-0.6, 0.6), rnd(1.7, 2.4), g.camZ + rnd(0.35, 1.3)], 1, 0.1, 0.002); }
      if (m.p[2] < g.camZ + 0.26) m.op = 0;
      e.vis = 1;
    } else { e.vis = 0.4; m.op = 0; if (t > 222) e.done = true; }
    e.cl = [];
    if (e.bump > 0) { e.bump--; e.cl.push([0, e.bj, e.bump > 3 ? 0.1 : 0.55]); }
    if (t > 150 && t < 166) e.cl.push([0, g.j0 + 1, flickV(t >> 1, 5)]);
    camLook(e, st, 0, 0.03);
    e.x = m.p[0]; e.y = m.p[1]; e.z = Math.max(m.p[2], g.camZ + 0.3);
  };

  /* shadow: a light stutters; a giant moth's shadow crawls over the ceiling and down the wall, opens, looks, and is gone. */
  PLACE.shadow = (g, BR) => {
    const C = BR.C, o = [], [a, b] = g.loose ? [2.2, 8] : [2.6, 4.6];
    for (let j = g.j0 + 1; j < g.j0 + 4; j++) { const d = (j + 0.5) * C - g.camZ; if (d < a || d > b || g.lum(0, j) < 0.6 || !openTo(g, BR, (j + 0.6) * C)) continue; for (const ed of [0, 1]) if (g.sd(j, ed)) o.push([j, ed, g.sd(j, ed)]); }
    if (!o.length) return null;
    const so = o.filter((q) => q[2] === 1), [J, ed, ty] = BR.pick(so.length ? so : o), side = ed ? 1 : -1;
    return { J, ed, side, ty, zt: J * C + (ty === 2 ? 2.9 : 1.75), xw: (ed - 0.5) * C, w: 3.15, zc: J * C + 2.25, sp: 1.6, open: 0.5, op: 0, eye: 0, legs: [0, 1, 2, 3, 4, 5].map((k) => ({ ph: k * 1.05 })), x: 0, y: HC, z: J * C + 2 };
  };
  STEP.shadow = (e, g, st, BR) => {
    const t = e.t;
    let lv = 1;
    if (t < 16) { lv = flickV(t >> 1, 9); if ((lv < 0.5 && t > 5) || t > 9) e.op = 1; }
    else if (t < 150) { // crawling: surging, stopping
      const su = 0.3 + 0.7 * Math.max(0, Math.sin(t * 0.15)) ** 2;
      e.w = Math.max(-1.15, e.w - 0.068 * su); e.zc += (e.zt - e.zc) * 0.02 * su;
      for (const L of e.legs) L.ph += 0.15 * (0.3 + su);
      e.open = 0.5 + 0.06 * Math.sin(t * 0.3) * su;
    } else if (t < 196) {
      e.open = lerp(0.5, 1.06, sm(150, 166, t)) - 0.05 * sm(166, 175, t) + (t > 178 && Math.random() < 0.05 ? rnd(-0.05, 0.05) : 0);
      e.eye = sm(156, 172, t) * (0.75 + 0.25 * Math.sin(t * 0.4));
    } else {
      if (t === 196) BR.glitch(st, 3);
      lv = flickV(t >> 1, 11); if (t > 200 && lv < 0.5) e.op = 0;
      if (t > 214) { e.op = 0; e.done = true; }
    }
    e.cl = [[0, e.J, lv], [0, e.J + 1, t < 16 || t >= 196 ? Math.max(0.2, lv) : 1]];
    e.vis = e.op; st.halt = Math.max(st.halt || 0, t < 200 ? 45 : 0);
    camLook(e, st, t > 30 && t < 200 ? e.side * 0.12 : 0, 0.02);
    e.x = e.w > 0 ? e.xw - e.side * e.w : e.xw; e.y = e.w > 0 ? HC : HC + e.w; e.z = e.zc;
  };

  // ---- where each is drawn: in its row / column slot (draw), on a wall right after that wall (wall), on the ceiling (ceil) ----
  const DRAW = {}, WALL = {}, CEIL = {};
  const lightRow = (g, BR, j) => g.lum(0, j) * g.glob;
  DRAW.tube = (e, g, j, c, BR, O) => {
    const m = e.m;
    if (c === 0 && j === e.J && m.op > 0.05) castFloor(g, O, BR, m, e.lp, e.J, (g.L ? 0.55 : 0.8) * m.op * lightRow(g, BR, e.J));
    if (m.op > 0.02 && j === BR.ROW(m.p[2]) && c === BR.COL(m.p[0])) drawMoth(g, O, m, look(g, BR, m, e.lp, m.grip ? 2 : 1.15));
    if (c === 0) dustDraw(g, O, BR, e, j);
  };
  WALL.tube = (e, g, j, ed, BR, O) => { if (j === e.J && (ed === 0 || ed === 1) && e.m.op > 0.05) castWall(g, O, BR, e.m, e.lp, e.J, ed, (g.L ? 0.5 : 0.75) * e.m.op * lightRow(g, BR, e.J)); };
  CEIL.tube = (e, g, BR, O) => { // first only its shadow, fluttering over the tiles toward the tube and shrinking onto it
    const t = e.t; if (t >= 52) return;
    const u = sm(0, 50, t), sd = e.side, k = lerp(2.6, 1, u * u), fl = Math.abs(Math.cos(t * 0.62));
    const x = lerp(-sd * 2.9, e.m.p[0], u) + Math.sin(t * 0.37) * 0.15 * (1 - u), z = lerp(e.fz + 1.5, e.m.p[2], u) + Math.sin(t * 0.23) * 0.25 * (1 - u);
    shadowOn(g, O, [x, HC - 0.003, z], [0, 0, -sd], [-sd, 0, 0], 0.72 * k, [fl, fl], (g.L ? 0.55 : 0.95) * sm(0, 8, t) * (1 - sm(46, 52, t)) / Math.sqrt(k) * 1.4);
  };

  const dist2 = (g, m) => (m.p[0] - g.camX) ** 2 + (m.p[1] - 1.55) ** 2 + (m.p[2] - g.camZ) ** 2;
  DRAW.swarm = (e, g, j, c, BR, O) => {
    if (c === 0 && j === e.J) { // their shadows on the carpet, thrown huge from the tube
      const lt = lightRow(g, BR, e.J); let n = 0;
      if (lt > 0.08) for (const m of e.ms) if (m.op > 0.1 && !m.out && n < 3 && (!m.crawl || n < 1)) { castFloor(g, O, BR, m, e.lp, e.J, (g.L ? 0.42 : 0.65) * m.op * lt); n++; }
    }
    let any = false;
    for (const m of e.ms) if (m.op > 0.02 && BR.ROW(m.p[2]) === j && BR.COL(m.p[0]) === c) { any = true; break; }
    if (any) {
      const here = e.ms.filter((m) => m.op > 0.02 && BR.ROW(m.p[2]) === j && BR.COL(m.p[0]) === c).sort((a, b) => dist2(g, b) - dist2(g, a));
      for (const m of here) { const o = look(g, BR, m, e.lp, 1.25); o.cheap = !m.out; drawMoth(g, O, m, o); }
    }
    if (c === 0) dustDraw(g, O, BR, e, j);
  };
  WALL.swarm = (e, g, j, ed, BR, O) => {
    if (j !== e.J || (ed !== 0 && ed !== 1)) return;
    const lt = lightRow(g, BR, e.J); if (lt < 0.08) return;
    let n = 0;
    for (const m of e.ms) if (!m.crawl && m.op > 0.1 && !m.out && n++ < 2) castWall(g, O, BR, m, e.lp, e.J, ed, (g.L ? 0.45 : 0.7) * m.op * lt);
  };

  /** Lay a dust print of a pose (pale, where it sat). */
  function printDraw(g, O, pm, al) {
    const ctx = g.ctx;
    for (let k = 0; k < 4; k++) {
      if (!wingXf(g, pm, k >> 1, k & 1 ? 1 : -1, XF[k], true)) return;
      const q = XF[k][0], set = (k >> 1) ? O.hind : O.fore, lv = lvOf(set.smear, q.sc * 0.5), s = set.smear.k[lv]; // a moth-shaped damp stain where it sat
      ctx.save(); ctx.transform(q.a, q.b, q.c, q.d, q.e, q.f); ctx.globalAlpha = al; ctx.drawImage(set.smear[lv], 0, 0, WW * s, WH * s, 0, 0, WW, WH); ctx.restore();
    }
  }
  WALL.wall = (e, g, j, ed, BR, O) => {
    if (j !== e.J || ed !== e.ed || (!e.onWall && e.print <= 0)) return;
    const z0 = Math.max(e.z0, g.camZ + 0.35), z1 = e.z1, x = e.xw;
    const ctx = g.ctx; ctx.save();
    if (z1 - z0 > 0.1 && clipTo(g, [[x, 0, z0], [x, HC, z0], [x, HC, z1], [x, 0, z1]])) {
      if (e.onWall) drawMoth(g, O, e.m, look(g, BR, e.m, null));
      else printDraw(g, O, e.pm, e.print * (g.L ? 0.28 : 0.4));
    }
    ctx.restore();
  };
  DRAW.wall = (e, g, j, c, BR, O) => {
    const m = e.m;
    if (!e.onWall && m.op > 0.02 && j === BR.ROW(m.p[2]) && c === BR.COL(m.p[0])) drawMoth(g, O, m, look(g, BR, m, null));
    if (c === 0) dustDraw(g, O, BR, e, j);
  };

  DRAW.pass = (e, g, j, c, BR, O) => {
    const m = e.m;
    if (m.op > 0.02) {
      const jr = BR.ROW(m.p[2]), lp = [0, HC - 0.04, (jr + 0.5) * BR.C];
      if (c === 0 && j === jr && m.p[2] - g.camZ > 1) castFloor(g, O, BR, m, lp, jr, (g.L ? 0.5 : 0.75) * m.op * lightRow(g, BR, jr));
      if (j === jr && c === BR.COL(m.p[0])) drawMoth(g, O, m, look(g, BR, m, lp, 0.9));
    }
    if (c === 0) dustDraw(g, O, BR, e, j);
  };

  /** The shadow visit: the ceiling and the wall unfolded into one surface (w: metres from the corner, on the ceiling > 0, down the wall < 0). */
  const surf = (e, w, z, wall) => (wall ? [e.xw - e.side * 0.004, HC + w, z] : [e.xw - e.side * w, HC - 0.003, z]);
  function bigShadow(e, g, BR, O, wall) {
    const C = BR.C, ctx = g.ctx, lt = lightRow(g, BR, e.J), op = e.op * (g.L ? 0.62 : 0.95) * (0.3 + 0.7 * lt);
    if (op < 0.01) return;
    ctx.save();
    const z0 = Math.max(g.camZ + 0.45, wall ? e.J * C : e.J * C - 1.2), z1 = (e.J + 1) * C + (wall ? 0 : 1.2), x = e.xw;
    const zm = e.J * C + C / 2, door = e.ty === 2 ? [[[x, 0, zm - 0.525], [x, 2.1, zm - 0.525], [x, 2.1, zm + 0.525], [x, 0, zm + 0.525]]] : null;
    const ok = wall ? clipTo(g, [[x, 0, z0], [x, HC, z0], [x, HC, z1], [x, 0, z1]], door) : clipTo(g, [[x, HC, z0], [x, HC, z1], [-x, HC, z1], [-x, HC, z0]]);
    if (ok) {
      const c = surf(e, e.w, e.zc, wall), ay = wall ? [0, 1, 0] : [-e.side, 0, 0], ax = [0, 0, 1], sp = e.sp;
      shadowOn(g, O, c, ax, ay, sp, [e.open, e.open], op);
      const lg = new Path2D(); let s = 0;
      for (let k = 0; k < 6; k++) { // its legs, reaching and pulling
        const sd = k < 3 ? -1 : 1, n = k % 3, ph = e.legs[k].ph + (sd > 0 ? Math.PI : 0), r = Math.sin(ph);
        const P = [[e.w + (-0.03 + 0.05 * n) * sp, e.zc + sd * 0.04 * sp], [e.w + (-0.16 + 0.17 * n + 0.04 * r) * sp, e.zc + sd * (0.2 + 0.08 * n) * sp], [e.w + (-0.36 + 0.3 * n + 0.1 * r) * sp, e.zc + sd * (0.3 + 0.12 * n) * sp * (1 + 0.12 * Math.cos(ph))]];
        const Q = P.map(([w, z]) => pj(g, surf(e, w, z, wall)));
        if (Q.some((q) => !q)) continue;
        s = g.f / Q[0][2];
        lg.moveTo(Q[0][0], Q[0][1]); lg.lineTo(Q[1][0], Q[1][1]); lg.lineTo(Q[2][0], Q[2][1]);
      }
      if (s) {
        ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.strokeStyle = g.L ? `rgb(${g.pal.ink})` : '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = op * 0.3; ctx.lineWidth = 0.07 * sp * s; ctx.stroke(lg); ctx.globalAlpha = op * 0.55; ctx.lineWidth = 0.03 * sp * s; ctx.stroke(lg);
      }
      if (wall && e.eye > 0.01) for (const sd of [-1, 1]) { // the light coming through where its eyes are
        const q = pj(g, ad(ad(c, ax, sd * 0.485 * sp * e.open), ay, 0.43 * sp)); if (!q) continue;
        const R = (0.13 * sp * g.f) / q[2];
        ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter'; ctx.globalAlpha = e.eye * op * (g.L ? 0.55 : 0.45);
        ctx.drawImage(O.dot, q[0] - R * 1.3, q[1] - R * 1.3, R * 2.6, R * 2.6);
        ctx.globalAlpha = e.eye * op * (g.L ? 0.7 : 0.75); ctx.drawImage(O.dot, q[0] - R * 0.35, q[1] - R * 0.35, R * 0.7, R * 0.7);
        ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.fillStyle = g.L ? `rgb(${g.pal.ink})` : '#000'; ctx.globalAlpha = e.eye * op * 0.9; // a pupil in the light
        ctx.beginPath(); ctx.ellipse(q[0], q[1], R * 0.09, R * 0.3, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  CEIL.shadow = (e, g, BR, O) => { if (e.w > -0.9 * e.sp) bigShadow(e, g, BR, O, false); };
  WALL.shadow = (e, g, j, ed, BR, O) => { if (j === e.J && ed === e.ed && e.w < 1.1 * e.sp) bigShadow(e, g, BR, O, true); };
  DRAW.shadow = () => {};

  // ---- the hook ---------------------------------------------------------------------------------------------------------
  (window.BR_ENT = window.BR_ENT || {}).moth = {
    place(g, v, BR) {
      pump(g.L, 4);
      const list = v && VARS.includes(v) ? [v] : shuffle(VARS.filter((k) => k !== last));
      for (const k of list) {
        const e = PLACE[k](g, BR);
        if (e) { Object.assign(e, { v: k, own: true, t: 0, vis: 0, life: 1e9, dust: [], look: null, cl: null, tt: 0 }); last = k; return e; }
      }
      return null;
    },
    step(e, g, st, BR) {
      if (!pump(g.L, 4)) { e.vis = 0; e.life = e.age + 30; return; } // still painting it
      if (e.look == null) e.look = st.look || 0;
      const T = window.BR_MOTH; T.e = e;
      if (T.seek != null) { while (e.t < T.seek && !e.done) { STEP[e.v](e, g, st, BR); e.t++; dustStep(e); } T.seek = null; } // (the test hook: jump ahead, then hold still)
      if (T.freeze && e.t > 0) { st.look = e.look; st.halt = Math.max(st.halt || 0, 45); e.life = e.age + 30; return; }
      STEP[e.v](e, g, st, BR);
      e.t++; dustStep(e);
      e.life = e.done ? 0 : e.age + 30;
    },
    draw(e, g, j, c, BR) { const O = sprites(g.L); if (O && e.t > 0) { const t0 = performance.now(); DRAW[e.v](e, g, j, c, BR, O); TM.ms += performance.now() - t0; } },
    wall(e, g, j, ed, BR) { const O = sprites(g.L); if (O && e.t > 0 && WALL[e.v]) { const t0 = performance.now(); WALL[e.v](e, g, j, ed, BR, O); TM.ms += performance.now() - t0; } },
    ceil(e, g, BR) { const O = sprites(g.L); TM.n++; if (O && e.t > 0 && CEIL[e.v]) { const t0 = performance.now(); CEIL[e.v](e, g, BR, O); TM.ms += performance.now() - t0; } },
  };
  const TM = { ms: 0, n: 0 }; // what drawing it costs (ms over n frames)
  window.BR_MOTH = { pump, sprites, SETS, TM }; // (for the test hook)
})();
