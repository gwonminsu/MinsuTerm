'use strict';
/*
 * 백룸 — the hound's look (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * Something that was a person, on all fours: grey, wasted skin over ribs and spine knuckles, arms and legs far too
 * long, elbows and knees folded the wrong way up above its back, long fingers and toes arched like a spider's and
 * clicking on the carpet; its head hangs under a mat of wet hair. It comes into the doorway in bursts and freezes,
 * stops, raises its head in three jerks (a pale face, deep sockets, too many teeth through the parted hair), and when
 * it scrambles off its head stays on us, turned over on its neck.
 *
 * Every part is a sprite baked once per size bucket and mode (a height field: volume from its normals, occlusion in
 * the creases, the tubes overhead as a top light, a cold rim, a darker underside; mottled, veined, waxy skin), spread
 * over the frames before it shows. Each frame the parts are laid out by the rig (hands and feet planted by its own
 * gait, two-bone reach for the wrong-way joints) into a small canvas, shaded there as one body, and worn into the scene.
 */
(function () {
  const TAU = Math.PI * 2;
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ---- noise: a lattice of values, smoothly interpolated; a few octaves of it
  const NT = new Float32Array(65536);
  { let s = 0x2f6b9e35; for (let i = 0; i < NT.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; NT[i] = (s >>> 0) / 4294967296; } }
  function vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, x0 = xi & 255, y0 = (yi & 255) << 8, x1 = (x0 + 1) & 255, y1 = (y0 + 256) & 65280;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += vn(x, y) * a; n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; } return s / n; }

  /*
   * A height field over x0..x1, y0..y1 metres (y up) at R px per metre: h the height (px), e how far inside the
   * outline (px, for soft edges), m the material. Pieces are unions (fleshy where they meet: a smooth max), bumps and
   * dents add to what is there.
   */
  const SKIN = 0, BONE = 1, NAIL = 2, TOOTH = 3, MOUTH = 4, EYEM = 5, PUPIL = 6, SOCKET = 7, HAIR = 8, LIP = 9;
  function field(x0, y0, x1, y1, R) {
    const pad = 3, W = Math.ceil((x1 - x0) * R) + pad * 2, H = Math.ceil((y1 - y0) * R) + pad * 2, n = W * H;
    return { W, H, R, ox: x0 - pad / R, oy: y1 + pad / R, h: new Float32Array(n), e: new Float32Array(n).fill(-50), m: new Uint8Array(n) };
  }
  const PX = (f, x) => (x - f.ox) * f.R, PY = (f, y) => (f.oy - y) * f.R;
  const box = (f, cx, cy, r) => [Math.max(0, Math.floor(cx - r)), Math.min(f.W - 1, Math.ceil(cx + r)), Math.max(0, Math.floor(cy - r)), Math.min(f.H - 1, Math.ceil(cy + r))];
  function comb(f, i, hn, ee, mat, kb) {
    if (ee > f.e[i]) f.e[i] = ee;
    if (hn <= 0) return;
    const ho = f.h[i];
    if (ho <= 0 || kb <= 0) { if (hn > ho) { f.h[i] = hn; f.m[i] = mat; } return; }
    const q = Math.max(kb - Math.abs(ho - hn), 0) / kb;
    if (hn > ho) f.m[i] = mat;
    f.h[i] = Math.max(ho, hn) + q * q * kb * 0.25;
  }
  /** A tapered capsule from (ax, ay) to (bx, by), radii ra, rb; k flattens it, kb (m) how softly it joins. */
  function cap(f, ax, ay, bx, by, ra, rb, mat, k, kb) {
    const R = f.R; ax = PX(f, ax); ay = PY(f, ay); bx = PX(f, bx); by = PY(f, by); ra *= R; rb *= R; k = k || 1; kb = (kb || 0) * R;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6, rm = Math.max(ra, rb) + 2;
    const xa = Math.max(0, Math.floor(Math.min(ax, bx) - rm)), xb = Math.min(f.W - 1, Math.ceil(Math.max(ax, bx) + rm));
    const ya = Math.max(0, Math.floor(Math.min(ay, by) - rm)), yb = Math.min(f.H - 1, Math.ceil(Math.max(ay, by) + rm));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const r = ra + (rb - ra) * t, qx = px - ax - dx * t, qy = py - ay - dy * t, d2 = qx * qx + qy * qy, ee = r - Math.sqrt(d2);
      if (ee < -2) continue;
      comb(f, y * f.W + x, ee > 0 ? Math.sqrt(r * r - d2) * k : 0, ee, mat, kb);
    }
  }
  /** An ellipsoid: centre, radii, turned rot (counter-clockwise), depth k × the smaller radius. */
  function ell(f, cx, cy, rx, ry, rot, mat, k, kb) {
    const R = f.R; cx = PX(f, cx); cy = PY(f, cy); rx *= R; ry *= R; k = k || 1; kb = (kb || 0) * R;
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), rz = Math.min(rx, ry) * k, [xa, xb, ya, yb] = box(f, cx, cy, Math.max(rx, ry) + 2);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x + 0.5 - cx, du = cy - (y + 0.5), lx = (dx * c + du * s) / rx, ly = (-dx * s + du * c) / ry, q = Math.sqrt(lx * lx + ly * ly);
      const gq = Math.sqrt((lx / rx) * (lx / rx) + (ly / ry) * (ly / ry)) / Math.max(q, 1e-6), ee = (1 - q) / Math.max(gq, 1e-6);
      if (ee < -2) continue;
      comb(f, y * f.W + x, q < 1 ? rz * Math.sqrt(1 - q * q) : 0, ee, mat, kb);
    }
  }
  /** Added to the surface already there (inside it only): a bump (ht > 0) or a dent (ht < 0), ht in metres; mat paints its middle. */
  function bump(f, cx, cy, rx, ry, rot, ht, mat) {
    const R = f.R; cx = PX(f, cx); cy = PY(f, cy); rx *= R; ry *= R; ht *= R;
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), [xa, xb, ya, yb] = box(f, cx, cy, Math.max(rx, ry) + 1);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const i = y * f.W + x; if (f.e[i] <= -0.5) continue;
      const dx = x + 0.5 - cx, du = cy - (y + 0.5), lx = (dx * c + du * s) / rx, ly = (-dx * s + du * c) / ry, q2 = lx * lx + ly * ly;
      if (q2 >= 1) continue;
      const w = (1 - q2) * (1 - q2); f.h[i] += ht * w;
      if (mat != null && q2 < 0.55) f.m[i] = mat;
    }
  }
  /** A ridge along a line (a rib, a tendon, a bone under the skin): width w, height ht (metres). */
  function ridge(f, ax, ay, bx, by, w, ht, mat) {
    const R = f.R; ax = PX(f, ax); ay = PY(f, ay); bx = PX(f, bx); by = PY(f, by); w *= R; ht *= R;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6, rm = w * 2.5 + 1;
    const xa = Math.max(0, Math.floor(Math.min(ax, bx) - rm)), xb = Math.min(f.W - 1, Math.ceil(Math.max(ax, bx) + rm));
    const ya = Math.max(0, Math.floor(Math.min(ay, by) - rm)), yb = Math.min(f.H - 1, Math.ceil(Math.max(ay, by) + rm));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const i = y * f.W + x; if (f.e[i] <= 0) continue;
      const px = x + 0.5, py = y + 0.5; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - ax - dx * t, qy = py - ay - dy * t, g = Math.exp(-(qx * qx + qy * qy) / (w * w)) * Math.sin(Math.PI * (0.1 + 0.8 * t));
      f.h[i] += ht * g * cl(f.e[i] / 2);
      if (mat != null && g > 0.5) f.m[i] = mat;
    }
  }
  /** Repaint the material inside the outline: fn(x, y, m) in metres → material. */
  function paint(f, fn) {
    for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) { const i = y * f.W + x; if (f.e[i] > -1) f.m[i] = fn(f.ox + (x + 0.5) / f.R, f.oy - (y + 0.5) / f.R, f.m[i]); }
  }
  function blur(src, W, H, r) {
    const a = new Float32Array(W * H), b = new Float32Array(W * H), k = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) { let s = 0; const o = y * W; for (let x = -r; x <= r; x++) s += src[o + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { a[o + x] = s * k; s += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += a[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { b[y * W + x] = s * k; s += a[Math.min(H - 1, y + r + 1) * W + x] - a[Math.max(0, y - r) * W + x]; } }
    return b;
  }

  /** What each material is: albedo [r, g, b] at (x, y) metres (sd: this sprite's own seed) into o; returns how waxy it is. */
  function albedo(m, x, y, sd, o) {
    if (m === SKIN || m === BONE) {
      const mo = fbm(x * 9 + sd, y * 9 - sd, 3), bl = fbm(x * 3.2 - sd, y * 3.2 + 11, 2), pt = fbm(x * 4.5 + sd * 1.3, y * 4.5 - sd, 2);
      let r = 0.6, g = 0.61, b = 0.52, k = (0.84 + 0.3 * mo) * (0.92 + 0.16 * pt); // pale, grey-green going yellow
      if (m === BONE) { r = 0.66; g = 0.66; b = 0.57; }
      r *= k; g *= k; b *= k;
      const br = ss(0.5, 0.78, bl) * 0.35; r += (0.5 - r) * br; g += (0.55 - g) * br; b += (0.44 - b) * br; // greener where it has gone bad
      if (m === SKIN) { const w = fbm(x * 5 + sd, y * 5 - 3, 2) * 2.5, vr = Math.pow(1 - Math.abs(2 * vn(x * 15 + w, y * 15 - w) - 1), 12) * 0.4; r += (0.42 - r) * vr; g += (0.47 - g) * vr; b += (0.56 - b) * vr; } // veins, faint
      const gr = 0.96 + 0.08 * vn(x * 230 + sd, y * 230);
      o[0] = r * gr; o[1] = g * gr; o[2] = b * gr;
      return m === BONE ? 0.55 : 0.3 + 0.5 * fbm(x * 8 - sd, y * 8 + 4, 2);
    }
    const n = 0.85 + 0.3 * vn(x * 300 + sd, y * 300);
    const C = m === LIP ? [0.36, 0.28, 0.27] : m === NAIL ? [0.4, 0.36, 0.25] : m === TOOTH ? [0.8, 0.76, 0.6] : m === MOUTH ? [0.05, 0.035, 0.03] : m === EYEM ? [0.88, 0.88, 0.8] : m === PUPIL ? [0.02, 0.02, 0.02] : m === SOCKET ? [0.13, 0.12, 0.11] : [0.06, 0.055, 0.05];
    o[0] = C[0] * n; o[1] = C[1] * n; o[2] = C[2] * n;
    return m === TOOTH || m === NAIL ? 0.9 : m === EYEM || m === PUPIL ? 2 : m === HAIR ? 0.9 : 0.15;
  }

  /** Normals, occlusion and albedo of a field, once; lit afterwards from any side. */
  function prep(f, sd) {
    const { W, H, h, e, m, R } = f, n = W * H, hb = blur(h, W, H, Math.max(1, Math.round(0.03 * R))), hs = blur(h, W, H, Math.max(1, Math.round(0.009 * R)));
    const P = { W, H, A: new Float32Array(n), N: new Float32Array(n * 3), C: new Float32Array(n * 3), O: new Float32Array(n), S: new Float32Array(n) }, o = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = cl((e[i] + 0.6) / 1.7); P.A[i] = a; if (a <= 0) continue;
      const hl = h[x > 0 ? i - 1 : i], hr = h[x < W - 1 ? i + 1 : i], hu = h[y > 0 ? i - W : i], hd = h[y < H - 1 ? i + W : i];
      let nx = (hl - hr) * 0.5, ny = (hu - hd) * 0.5, nz = 1; const l = Math.sqrt(nx * nx + ny * ny + 1); nx /= l; ny /= l; nz /= l;
      P.N[i * 3] = nx; P.N[i * 3 + 1] = -ny; P.N[i * 3 + 2] = nz; // stored y up (ny here is the image's, y down)
      P.O[i] = cl(cl((hb[i] - h[i]) / (0.022 * R + 1)) * 0.7 + cl((hs[i] - h[i]) / (0.006 * R + 0.6)) * 0.55);
      P.S[i] = albedo(m[i], f.ox + (x + 0.5) / R, f.oy - (y + 0.5) / R, sd, o);
      P.C[i * 3] = o[0]; P.C[i * 3 + 1] = o[1]; P.C[i * 3 + 2] = o[2];
    }
    return P;
  }

  // per mode: exposure, how strong the cold rim and the waxy sheen are, the ambient, the albedo scale (a light page: a darker body)
  const MODE = {
    D: { ex: 1.08, alb: 1, rim: [0.66, 0.78, 0.92], rimK: 0.6, specK: 0.13, amb: 0.05, bounce: [0.5, 0.42, 0.16] },
    L: { ex: 0.66, alb: 0.6, rim: [0.98, 0.95, 0.86], rimK: 0.45, specK: 0.16, amb: 0.1, bounce: [0.5, 0.42, 0.2] },
  };
  const GR = 0.34; // the tape's colour, as the rooms have it
  /** Light a prepped field from psi (0: from +x, π/2: from above, π: from -x; always a little from the front) into a canvas. */
  function lightUp(P, psi, md) {
    const { W, H, A, N, C, O, S } = P, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), im = cx.createImageData(W, H), d = im.data;
    const cp = Math.cos(psi), sp = Math.sin(psi), Lx = cp * 0.87, Ly = sp * 0.87, Lz = 0.49; // y up, like the normals
    let hx = Lx, hy = Ly, hz = Lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    for (let i = 0, n = W * H; i < n; i++) {
      const a = A[i]; if (a <= 0) continue;
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2], ao = O[i];
      const ndl = nx * Lx + ny * Ly + nz * Lz, wrap = Math.max(0, (ndl + 0.28) / 1.28), fac = nx * cp + ny * sp, under = cl(-fac), top = cl(fac);
      const occ = 1 - 0.9 * ao, lit = (md.amb * (0.3 + 0.7 * top) + 0.95 * Math.pow(Math.max(0, ndl), 1.2) + 0.1 * wrap) * (0.32 + 0.68 * cl(0.55 + fac)) * occ;
      const sp2 = Math.max(0, nx * hx + ny * hy + nz * hz), spec = Math.pow(sp2, 5) * S[i] * md.specK * occ;
      const rim = Math.pow(1 - nz, 5) * top * md.rimK * occ, bo = 0.035 * under * occ;
      for (let c = 0; c < 3; c++) d[i * 4 + c] = 0; // filled below, graded
      let r = C[i * 3] * md.alb * lit + spec * 0.9 + rim * md.rim[0] + bo * md.bounce[0];
      let g = C[i * 3 + 1] * md.alb * lit + spec * 0.92 + rim * md.rim[1] + bo * md.bounce[1];
      let b = C[i * 3 + 2] * md.alb * lit + spec * 0.88 + rim * md.rim[2] + bo * md.bounce[2];
      const l = 0.3 * r + 0.59 * g + 0.11 * b; r += (l * 1.02 - r) * GR; g += (l * 1.05 - g) * GR; b += (l * 0.8 - b) * GR;
      d[i * 4] = Math.min(255, r * md.ex * 255); d[i * 4 + 1] = Math.min(255, g * md.ex * 255); d[i * 4 + 2] = Math.min(255, b * md.ex * 255); d[i * 4 + 3] = a * 255;
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }

  // ---- the parts. Limb bones: a tapered capsule from (0, 0) to (l, 0), its top side (+y) the bony one; baked lit from NV directions.
  const NV = 7;
  const SEG = {
    ua: { l: 0.62, a: 0.05, b: 0.032, w: 0.085, sd: 3, f(F, l) { ell(F, 0.07, 0, 0.11, 0.066, 0, SKIN, 1, 0.03); ell(F, 0.3, -0.012, 0.16, 0.042, 0, SKIN, 0.9, 0.03); ell(F, l - 0.006, 0.004, 0.046, 0.04, 0.2, SKIN, 1.05, 0.02); ridge(F, 0.14, 0.024, l * 0.62, 0.02, 0.008, 0.005); } },
    fa: { l: 0.8, a: 0.04, b: 0.022, w: 0.07, sd: 7, f(F, l) { ell(F, 0.15, -0.006, 0.18, 0.05, 0.02, SKIN, 0.9, 0.03); ridge(F, l * 0.3, -0.012, l * 0.63, -0.005, 0.0045, 0.0055); ridge(F, l * 0.63, -0.005, l * 0.93, -0.008, 0.004, 0.005); ridge(F, l * 0.45, 0.006, l * 0.86, 0.002, 0.0038, 0.004); ridge(F, 0.04, 0.02, l * 0.7, 0.013, 0.008, 0.006); ell(F, l - 0.012, 0.004, 0.026, 0.023, 0, SKIN, 1, 0.012); } },
    th: { l: 0.64, a: 0.064, b: 0.04, w: 0.085, sd: 11, f(F, l) { ell(F, 0.15, -0.006, 0.18, 0.066, 0, SKIN, 1, 0.03); ell(F, l - 0.008, 0.004, 0.05, 0.043, 0.25, SKIN, 1.05, 0.02); ridge(F, 0.18, 0.032, l * 0.7, 0.026, 0.009, 0.005); } },
    sh: { l: 0.78, a: 0.042, b: 0.022, w: 0.07, sd: 13, f(F, l) { ell(F, 0.18, -0.016, 0.17, 0.046, 0.04, SKIN, 0.95, 0.03); ridge(F, 0.05, 0.024, l * 0.85, 0.013, 0.007, 0.008); ridge(F, l * 0.5, -0.013, l * 0.92, -0.01, 0.004, 0.005); ell(F, l - 0.012, 0.002, 0.026, 0.023, 0, SKIN, 1, 0.012); } },
    nk: { l: 0.26, a: 0.032, b: 0.034, w: 0.055, sd: 17, f(F, l) { ridge(F, 0.02, 0.013, l - 0.03, 0.016, 0.005, 0.006); ridge(F, 0.04, -0.015, l - 0.02, -0.011, 0.005, 0.006); for (let x = 0.03, i = 0; x < l; x += 0.042 + 0.02 * vn(i++, 5)) ell(F, x, 0.026, 0.011 + 0.004 * vn(i, 9), 0.009, 0, SKIN, 1.15, 0.008); } },
  };
  function segField(t, R) {
    const s = SEG[t], w = s.w, f = field(-s.a - 0.01, -w, s.l + s.b + 0.01, w, R);
    cap(f, 0, 0, s.l, 0, s.a, s.b, SKIN, 1); s.f(f, s.l);
    for (let i = 0; i < 5; i++) { // the skin lumpy and wasted along it: long soft swellings and hollows, never rings
      const t = 0.12 + 0.76 * vn(i * 7.3 + s.sd, 0.5), r = s.a + (s.b - s.a) * t, y = (vn(i * 3.1, s.sd) - 0.5) * r * 0.8;
      bump(f, t * s.l, y, r * (1.6 + 1.4 * vn(i, s.sd * 2)), r * 0.55, 0.05 * (i - 2), (i % 2 ? -0.22 : 0.28) * r);
    }
    ridge(f, s.l * 0.15, -s.a * 0.35, s.l * 0.8, -s.b * 0.1, 0.004, 0.003);
    return f;
  }

  /** The trunk from the side: hips at (0, 0), shoulders at (0.72, 0); a hunched spine of knuckles, the ribcage heaving (br 0..1). */
  function torsoSide(f, br) {
    const sp = (x) => 0.08 + 0.06 * Math.sin(Math.PI * cl((x + 0.1) / 0.92));
    ell(f, -0.01, 0.01, 0.15, 0.1, 0.12, SKIN, 1, 0.03);
    cap(f, 0.05, 0.035, 0.34, 0.05, 0.068, 0.072, SKIN, 0.9, 0.04); // the waist, wasted to nothing
    ell(f, 0.48, -0.005 - 0.008 * br, 0.27, 0.13 + 0.014 * br, -0.07, SKIN, 0.95, 0.05);
    ell(f, 0.7, 0.02, 0.1, 0.09, 0, SKIN, 1, 0.03);
    ell(f, 0.6, sp(0.6) - 0.025, 0.12, 0.045, -0.3, SKIN, 1.25, 0.02); // the shoulder blade, standing out
    bump(f, 0.62, sp(0.62) - 0.02, 0.07, 0.025, -0.3, 0.012, BONE);
    for (let i = 0, x0 = 0.28; i < 8; i++, x0 += 0.043 + 0.018 * vn(i, 31)) { // ribs, from the spine down and forward round the cage: uneven, under the skin
      const h = 0.005 + 0.006 * vn(i, 33), y0 = sp(x0) - 0.03, x2 = x0 + 0.06 + 0.03 * vn(i, 35), y2 = -0.1 - 0.025 * vn(i, 37) - 0.02 * br + Math.abs(i - 4) * 0.01, xm = x0 + 0.008 + 0.01 * vn(i, 39), ym = (y0 + y2) / 2;
      ridge(f, x0, y0, xm, ym, 0.009, h); ridge(f, xm, ym, x2, y2, 0.009, h * 0.85);
    }
    for (let x = -0.09, i = 0; x < 0.8; x += 0.038 + 0.02 * vn(i++, 41)) ell(f, x, sp(x) + 0.003, 0.012 + 0.007 * vn(i, 43), 0.012, 0, SKIN, 1.25, 0.01); // the spine, knuckle by knuckle, uneven
    ridge(f, -0.1, 0.06, 0.1, 0.075, 0.012, 0.012, BONE); // the hip bone's crest
    bump(f, 0.2, -0.035, 0.11, 0.05, 0, -0.02 * (1 - br * 0.6)); // the belly sucked in under the ribs
    ell(f, 0.3, -0.085, 0.07, 0.022, 0.25, SKIN, 0.55, 0.01); // a fold of skin hanging under them
  }
  /** The chest from in front: shoulders at (±0.2, 0), the back going away behind them. */
  function torsoFront(f) {
    ell(f, 0, 0.08, 0.15, 0.08, 0, SKIN, 0.8, 0.03);
    for (let k = 0; k < 4; k++) ell(f, 0, 0.13 - k * 0.018, 0.015 - k * 0.002, 0.012 - k * 0.002, 0, BONE, 1.3, 0.005);
    ell(f, 0, -0.09, 0.16, 0.18, 0, SKIN, 1, 0.04);
    for (const s of [-1, 1]) {
      ell(f, s * 0.19, 0, 0.075, 0.07, 0, SKIN, 1, 0.03);
      ridge(f, s * 0.03, 0.035, s * 0.17, 0.045, 0.009, 0.012, BONE); // collarbones
      for (let i = 0, y = -0.05; i < 5; i++, y -= 0.03 + 0.015 * vn(i, s + 70)) { const h = 0.004 + 0.005 * vn(i, s + 72); ridge(f, s * 0.02, y, s * 0.09, y - 0.012, 0.009, h); ridge(f, s * 0.09, y - 0.012, s * 0.15, y - 0.045, 0.009, h); }
    }
    ridge(f, 0, 0.02, 0, -0.17, 0.01, 0.008, BONE); // the breastbone
    bump(f, 0, -0.25, 0.1, 0.06, 0, -0.02);
  }
  /** The back of it, crouched: hips at (0, 0), shoulders at (±0.2, 0.5). */
  function torsoBack(f) { // one long wasted back, hips to shoulders, all of a piece
    ell(f, 0, 0.035, 0.15, 0.085, 0, SKIN, 0.9, 0.08);
    cap(f, 0, 0.05, 0, 0.36, 0.125, 0.165, SKIN, 0.95, 0.09);
    ell(f, 0, 0.37, 0.17, 0.14, 0, SKIN, 0.95, 0.09);
    for (const s of [-1, 1]) {
      ell(f, s * 0.19, 0.47, 0.08, 0.068, 0, SKIN, 1, 0.08);
      ell(f, s * 0.095, 0.4, 0.062, 0.1, s * 0.3, SKIN, 1.05, 0.05); bump(f, s * 0.1, 0.43, 0.04, 0.07, s * 0.3, 0.006); // shoulder blades
      for (let i = 0, y = 0.4; i < 4; i++, y -= 0.045 + 0.02 * vn(i, s + 50)) ridge(f, s * 0.05, y, s * (0.13 + 0.03 * vn(i, s + 52)), y - 0.05 - 0.02 * vn(i, s + 54), 0.011, 0.003 + 0.003 * vn(i, s + 56));
      ridge(f, s * 0.03, 0.075, s * 0.14, 0.09, 0.016, 0.005);
      bump(f, s * 0.04, 0.22, 0.03, 0.12, 0, -0.006); // wasted hollows down either side of the spine
    }
    for (let y = 0.03, i = 0; y < 0.55; y += 0.034 + 0.02 * vn(i++, 61)) ell(f, Math.sin(y * 6) * 0.006, y, 0.011 + 0.007 * vn(i, 63), 0.011, 0, SKIN, 1.2, 0.012);
  }
  /** The head hanging, from the side: the neck joint at (0, 0), the face turned down to the floor under its hair. */
  function headSide(f) {
    cap(f, -0.06, 0.03, 0, 0, 0.032, 0.034, SKIN, 1, 0.01);
    ell(f, 0.07, -0.04, 0.11, 0.088, -0.75, SKIN, 1, 0.02);
    ell(f, 0.135, -0.125, 0.058, 0.034, -1.0, SKIN, 0.9, 0.02);
    bump(f, 0.13, -0.085, 0.025, 0.015, -0.7, 0.008, BONE);
    paint(f, (x, y, m) => (y + 0.75 * (x - 0.06) > -0.06 ? HAIR : m));
  }
  /** The face, turned to us: the neck at (0, 0); deep sockets, a wet glint in each, no lips, long teeth (op: the jaw dropped). */
  function face(f, op) {
    cap(f, 0, -0.03, 0, 0.05, 0.034, 0.04, SKIN, 1, 0.01);
    ell(f, 0, 0.155, 0.08, 0.105, 0, SKIN, 1, 0.02);
    cap(f, 0, 0.09, 0, 0.025 - op * 0.035, 0.076, 0.04, SKIN, 0.85, 0.02); // a jaw too wide for the skull
    for (const s of [-1, 1]) {
      ell(f, s * 0.05, 0.12, 0.026, 0.014, s * 0.2, BONE, 1.25, 0.01);
      bump(f, s * 0.047, 0.09, 0.026, 0.024, 0, -0.006);
      ell(f, s * 0.056, 0.078, 0.028, 0.036, s * 0.15, SKIN, 0.85, 0.02); // what flesh is left on the cheeks, sagging
      bump(f, s * 0.033, 0.142, 0.027, 0.021, s * 0.15, -0.024, SOCKET);
      bump(f, s * 0.031, 0.139, 0.012, 0.011, 0, 0.014, EYEM);
      ridge(f, s * 0.012, 0.156, s * 0.052, 0.153, 0.004, 0.005); // the upper lids, heavy
      bump(f, s * 0.009, 0.098, 0.005, 0.004, 0, -0.006, SOCKET); // nostrils
    }
    ridge(f, -0.06, 0.165, 0.06, 0.165, 0.012, 0.012, BONE);
    cap(f, 0, 0.138, 0, 0.104, 0.008, 0.013, SKIN, 0.8, 0.006); // the nose
    const my = 0.064 - op * 0.016, mh = 0.018 + op * 0.028;
    bump(f, 0, my, 0.074, mh, 0, -0.024, MOUTH);
    for (let i = -4; i <= 4; i++) { // long uneven teeth, upper and lower, ear to ear
      const x = i * 0.0155, L = 0.013 + ((i * 7 + 9) % 4) * 0.004;
      bump(f, x, my + mh * 0.55 - L * 0.4, 0.0058, L, 0, 0.012, TOOTH);
      if (op > 0.5) bump(f, x + 0.006, my - mh * 0.6 + L * 0.3, 0.0052, L * 0.8, 0, 0.01, TOOTH);
    }
    // lips, thin, stretched back to the ears over all of it
    for (const [y, c] of [[my + mh + 0.002, 0.008], [my - mh - 0.002, -0.008]]) { ridge(f, -0.078, y - c, -0.03, y, 0.0045, 0.006, LIP); ridge(f, -0.03, y, 0.03, y, 0.0045, 0.006, LIP); ridge(f, 0.03, y, 0.078, y - c, 0.0045, 0.006, LIP); }
    bump(f, 0, my - mh - 0.03, 0.026, 0.016, 0, 0.006); // the chin
    paint(f, (x, y, m) => { const dx = Math.abs(x) - 0.031, dy = y - 0.139; return dx * dx + dy * dy < 0.0032 * 0.0032 ? PUPIL : y > 0.215 ? HAIR : m; });
  }
  /** The back of its head: a skull under matted hair. */
  function headBack(f) { cap(f, 0, -0.03, 0, 0.05, 0.034, 0.04, SKIN, 1, 0.01); ell(f, 0, 0.15, 0.085, 0.105, 0, HAIR, 1, 0.02); }
  /** A hand (or a foot) from the side, the wrist at (0, 0), the carpet at y = -0.05: 'p' planted, its long fingers arched like a spider's; 't' tapping; 'l' lifted, curled. */
  function handSide(f, pose) {
    ell(f, 0.03, -0.012, 0.05, 0.02, -0.15, SKIN, 0.8, 0.012);
    const FG = [[-0.95, 0.2], [-0.42, 0.235], [0.06, 0.245], [0.52, 0.225], [1.05, 0.15]]; // [its angle over the floor, far to near; its length] (the last, the thumb)
    for (let k = 0; k < 5; k++) {
      const [a, L] = FG[k], c = Math.cos(a), s = Math.sin(a) * 0.42, bx = 0.062 + 0.01 * c, by = -0.014 - 0.012 * Math.sin(a);
      let mx = bx + c * L * 0.4, my = by - s * L * 0.4 + 0.03 + 0.008 * ((k * 5) % 3), tx = bx + c * L, ty = -0.05 - s * L;
      if (pose === 't' && (k === 1 || k === 3)) { my += 0.022; ty += 0.032; tx -= c * 0.03; }
      if (pose === 'l') { mx = bx + c * L * 0.3; my = by - 0.04 - s * L * 0.3; tx = bx + c * L * 0.5; ty = by - 0.13 - s * L * 0.4; }
      cap(f, bx, by, mx, my, 0.0105, 0.0085, SKIN, 1, 0.006); cap(f, mx, my, tx, ty, 0.0085, 0.0042, SKIN, 1, 0.004);
      ell(f, mx, my, 0.011, 0.0095, 0, SKIN, 1.05, 0.005); bump(f, tx, ty, 0.006, 0.005, 0, 0.002, NAIL);
    }
  }
  /** A hand seen from in front: the long fingers fanned out round the wrist like legs. */
  function handFront(f) {
    ell(f, 0, -0.012, 0.032, 0.026, 0, SKIN, 0.9, 0.01);
    for (let k = 0; k < 5; k++) {
      const s = (k - 2) / 2, x0 = s * 0.022, x1 = s * 0.075 + (k === 2 ? 0.004 : 0), y1 = 0.032 - Math.abs(s) * 0.012, x2 = s * 0.13, y2 = -0.048;
      cap(f, x0, -0.012, x1, y1, 0.0105, 0.009, SKIN, 1, 0.006); cap(f, x1, y1, x2, y2, 0.009, 0.0045, SKIN, 1, 0.004);
      ell(f, x1, y1, 0.011, 0.01, 0, BONE, 1.1, 0.004); bump(f, x2, y2, 0.007, 0.006, 0, 0.003, NAIL);
    }
  }
  function knob(f) { // a swollen joint, knotted but soft: the bone's ends pushing up under loose, creased skin
    ell(f, 0, 0, 0.036, 0.031, 0.3, SKIN, 1); ell(f, 0.012, 0.011, 0.022, 0.017, 0.4, SKIN, 1.1, 0.014); bump(f, -0.013, 0.004, 0.016, 0.013, 0, 0.006);
    bump(f, 0.002, -0.017, 0.022, 0.0045, 0.25, -0.003); bump(f, -0.006, -0.024, 0.016, 0.004, 0.1, -0.002);
  }

  /** Hair: matted, wet, hanging from a line of roots (the anchor at its top middle). kind 0 from the side, 1 a curtain parted over the face, 2 the back of the head. */
  function hairSpr(R, wm, lm, kind, md, sd) {
    const W = Math.ceil(wm * R) + 6, H = Math.ceil(lm * R) + 6, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), im = cx.createImageData(W, H), d = im.data, half = wm / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - W / 2) / R, v = (y + 0.5 - 3) / R, vv = v - (u / half) * (u / half) * (kind === 0 ? 0.05 : 0.075);
      if (vv < -0.005 || Math.abs(u) > half) continue;
      const t = vv / lm, us = u + (fbm(u * 7 + sd, vv * 2.5, 2) - 0.5) * 0.07 * (0.15 + t) + Math.sin(vv * 13 + u * 9) * 0.004;
      const clump = vn(us * 26 + sd, 1.7), len = lm * (0.45 + 0.55 * vn(us * 34 + sd, 4.2)) * (0.7 + 0.3 * clump);
      let a = (1 - ss(len * 0.55, len, vv)) * (0.45 + 0.55 * clump) * (0.5 + 0.5 * vn(us * 320, vv * 3)) * (1 - ss(half * 0.72, half, Math.abs(u))) * ss(-0.005, 0.012, vv);
      if (kind === 1) { const gw = 0.022 + 0.055 * cl(vv / 0.2), gg = ss(gw * 0.5, gw, Math.abs(us + 0.005)); a *= Math.max(gg, Math.pow(vn(us * 70 + 3, vv * 0.8), 7) * 2.2); }
      if (a <= 0.01) continue;
      const st = Math.pow(vn(us * 150 + sd, vv * 1.3), 5) * (0.35 + Math.exp(-(((vv - 0.04) / 0.05) ** 2))), dk = 0.55 + 0.45 * ss(0, 0.07, vv);
      let r = (0.055 * dk + st * 0.5) * md.alb, g = (0.05 * dk + st * 0.53) * md.alb, b = (0.045 * dk + st * 0.52) * md.alb;
      const l = 0.3 * r + 0.59 * g + 0.11 * b; r += (l * 1.02 - r) * GR; g += (l * 1.05 - g) * GR; b += (l * 0.8 - b) * GR;
      const i = (y * W + x) * 4; d[i] = Math.min(255, r * md.ex * 255); d[i + 1] = Math.min(255, g * md.ex * 255); d[i + 2] = Math.min(255, b * md.ex * 255); d[i + 3] = Math.min(255, a * 1.5 * 255);
    }
    cx.putImageData(im, 0, 0);
    return { c: cv, ax: W / 2, ay: 3 };
  }

  /*
   * The sheets: every part baked for one size (R px per metre) and one mode, a little at a time (a queue of jobs run
   * from step, a few ms a frame). A visit asks for the sizes it will need when it starts; the draw takes the best one ready.
   */
  const SHEETS = new Map();
  let WARM = null; // each new part drawn once, small, as it is baked (so its first real use does not stall a frame)
  const warm = (c) => { if (!WARM) { WARM = document.createElement('canvas'); WARM.width = WARM.height = 4; } WARM.getContext('2d').drawImage(c, 0, 0, 4, 4); return c; };
  const asSpr = (f, c) => ({ c: warm(c), ax: PX(f, 0), ay: PY(f, 0) });
  function sheet(L, R) {
    const key = (L ? 'L' : 'D') + R;
    let S = SHEETS.get(key); if (S) return S;
    if (SHEETS.size >= 5) SHEETS.delete(SHEETS.keys().next().value);
    S = { L, R, q: [], ready: false }; SHEETS.set(key, S);
    const md = MODE[L ? 'L' : 'D'], up = Math.PI / 2;
    const one = (name, mk, sd) => { let f, P; S.q.push(() => { f = mk(); }); S.q.push(() => { P = prep(f, sd); }); S.q.push(() => { S[name] = asSpr(f, lightUp(P, up, md)); f = P = null; }); };
    S.q.push(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); S.blob = c; });
    for (const t of Object.keys(SEG)) {
      let f, P;
      S.q.push(() => { f = segField(t, R); P = prep(f, SEG[t].sd); S[t] = []; });
      for (let v = 0; v < NV; v++) S.q.push(() => { S[t][v] = asSpr(f, lightUp(P, (v / (NV - 1)) * Math.PI, md)); if (v === NV - 1) f = P = null; });
    }
    for (let b = 0; b < 3; b++) one('ts' + b, () => { const f = field(-0.22, -0.26, 0.88, 0.25, R); torsoSide(f, b / 2); return f; }, 3 + b);
    one('tf', () => { const f = field(-0.28, -0.32, 0.28, 0.2, R); torsoFront(f); return f; }, 21);
    one('tb', () => { const f = field(-0.3, -0.1, 0.3, 0.58, R); torsoBack(f); return f; }, 23);
    one('hs', () => { const f = field(-0.1, -0.2, 0.22, 0.1, R); headSide(f); return f; }, 31);
    for (let o = 0; o < 2; o++) { let f, P; S.q.push(() => { f = field(-0.11, -0.05, 0.11, 0.27, R); face(f, o); }); S.q.push(() => { P = prep(f, 33); }); S.q.push(() => { S['fc' + o] = asSpr(f, lightUp(P, up, Object.assign({}, md, { ex: md.ex * 0.8 }))); f = P = null; }); } // the face a shade darker: only its eyes catch the light
    one('hk', () => { const f = field(-0.11, -0.05, 0.11, 0.27, R); headBack(f); return f; }, 35);
    for (const p of ['p', 't', 'l']) one('h' + p, () => { const f = field(-0.06, -0.17, 0.3, 0.07, R); handSide(f, p); return f; }, 41);
    one('hf', () => { const f = field(-0.15, -0.065, 0.15, 0.055, R); handFront(f); return f; }, 43);
    one('kn', () => { const f = field(-0.045, -0.045, 0.045, 0.045, R); knob(f); return f; }, 47);
    S.q.push(() => { S.hS = hairSpr(R, 0.26, 0.34, 0, md, 5); warm(S.hS.c); });
    S.q.push(() => { S.hF = hairSpr(R, 0.24, 0.38, 1, md, 9); warm(S.hF.c); });
    S.q.push(() => { S.hB = hairSpr(R, 0.24, 0.3, 2, md, 13); warm(S.hB.c); });
    return S;
  }
  function work(S, ms) { const t0 = performance.now(); while (S.q.length && performance.now() - t0 < ms) S.q.shift()(); S.ready = !S.q.length; return S.ready; }
  /** The bake sizes, half an octave apart. */
  const bucket = (k) => Math.min(362, Math.max(45, Math.pow(2, Math.ceil(Math.log2(Math.max(1, k)) * 2) / 2))) | 0;

  // ---- putting a body together: a small canvas at the size it is seen, the parts laid in far to near, lit as one, worn into the scene
  let SCR = null, SX = null;
  function begin(S, k, dpr, x0, x1, y0, y1) {
    const W = Math.ceil((x1 - x0) * k) + 4, H = Math.ceil((y1 - y0) * k) + 4;
    if (!SCR) { SCR = document.createElement('canvas'); SX = SCR.getContext('2d'); }
    if (SCR.width < W || SCR.height < H) { SCR.width = Math.max(SCR.width, W); SCR.height = Math.max(SCR.height, H); }
    SX.setTransform(1, 0, 0, 1, 0, 0); SX.globalCompositeOperation = 'source-over'; SX.globalAlpha = 1; SX.clearRect(0, 0, W, H);
    SX.imageSmoothingEnabled = true; SX.imageSmoothingQuality = 'medium';
    return { S, k, dpr, M: k / S.R, ox: 2 - x0 * k, oy: 2 + y1 * k, W, H, eyes: [] };
  }
  /** A limb bone between two points, lit from the side the light comes from. */
  function seg(C, t, ax, ay, bx, by) {
    const set = C.S[t], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6, cs = dx / l, sn = dy / l, ls = l / SEG[t].l;
    let psi = Math.atan2(cs, sn), fl = 1; if (psi < 0) { psi = -psi; fl = -1; }
    const sp = set[Math.round((psi / Math.PI) * (NV - 1))], M = C.M;
    SX.setTransform(cs * M * ls, -sn * M * ls, sn * M * fl, cs * M * fl, C.ox + ax * C.k, C.oy - ay * C.k);
    SX.drawImage(sp.c, -sp.ax, -sp.ay);
  }
  /** A part at (x, y), turned rot, mirrored mx, scaled sc (sx: squashed across, as if turning). */
  function put(C, sp, x, y, rot, mx, sc, sx) {
    const M = C.M * (sc || 1), c = Math.cos(rot || 0), s = Math.sin(rot || 0), m = (mx || 1) * (sx || 1);
    SX.setTransform(c * M * m, -s * M * m, s * M, c * M, C.ox + x * C.k, C.oy - y * C.k);
    SX.drawImage(sp.c, -sp.ax, -sp.ay);
  }
  /** Hair hanging from (x, y): skew trails the tips sideways, sy shortens it, up hangs it the other way (a body upside down). */
  function hang(C, sp, x, y, skew, sy, up, sx, sc) {
    const M = C.M * (sc || 1); SX.setTransform(M * (sx || 1), 0, skew * M * sy, M * sy * (up ? -1 : 1), C.ox + x * C.k, C.oy - y * C.k);
    SX.drawImage(sp.c, -sp.ax, -sp.ay);
  }
  function atop(C, fn) { SX.setTransform(1, 0, 0, 1, 0, 0); SX.globalCompositeOperation = 'source-atop'; fn(); SX.globalCompositeOperation = 'source-over'; SX.globalAlpha = 1; }
  /** Everything laid in so far sinks into shadow (the far side of it). */
  const darken = (C, a) => atop(C, () => { SX.fillStyle = `rgba(0,0,0,${a})`; SX.fillRect(0, 0, C.W, C.H); });
  /** A soft shadow where one part meets another. */
  const occl = (C, x, y, r, a) => atop(C, () => { const R = r * C.k; SX.globalAlpha = a; SX.drawImage(C.S.blob, C.ox + x * C.k - R, C.oy - y * C.k - R, R * 2, R * 2); });
  /** Lit as one body: dark low down where the floor shuts out the light, and darker all over as the tubes die. */
  function finish(C, lit, L, floorY) {
    atop(C, () => {
      const gy = C.oy - (floorY || 0) * C.k, gr = SX.createLinearGradient(0, gy, 0, gy - 0.55 * C.k);
      gr.addColorStop(0, L ? 'rgba(26,20,10,0.3)' : 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      SX.fillStyle = gr; SX.fillRect(0, 0, C.W, C.H);
      const dk = (1 - cl(lit)) * (L ? 0.5 : 0.88);
      if (dk > 0.01) { SX.fillStyle = L ? `rgba(30,24,14,${dk})` : `rgba(2,2,1,${dk})`; SX.fillRect(0, 0, C.W, C.H); }
    });
  }
  /** Into the scene at screen (sx, sy) (where local (0, 0) lands; mx, my mirror it): worn into what is behind it first, then laid in. */
  function blit(C, g, sx, sy, mx, my, op, src) {
    const ctx = g.ctx, im = src || SCR; ctx.save(); ctx.translate(sx, sy); ctx.scale(mx / C.dpr, my / C.dpr);
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = op; ctx.drawImage(im, 0, 0, C.W, C.H, -C.ox, -C.oy, C.W, C.H);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(im, 0, 0, C.W, C.H, -C.ox, -C.oy, C.W, C.H);
    ctx.restore();
  }
  /** Keep what was just put together (a body holding still is not put together again): cc { c, key, C }. */
  function keep(cc, C, key) {
    if (!cc.c) cc.c = document.createElement('canvas');
    if (cc.c.width < C.W || cc.c.height < C.H) { cc.c.width = Math.max(cc.c.width, C.W); cc.c.height = Math.max(cc.c.height, C.H); }
    const x = cc.c.getContext('2d'); x.globalCompositeOperation = 'copy'; x.drawImage(SCR, 0, 0, C.W, C.H, 0, 0, C.W, C.H); x.globalCompositeOperation = 'source-over';
    cc.key = key; cc.C = C;
  }
  const poseKey = (p, k, lit) => JSON.stringify([Math.round(k * 0.5), Math.round(lit * 20), p, Math.random() < 0.02]); // (and now and then anyway)
  /** Eyeshine: the points the body left in C.eyes, catching what light there is. */
  function shine(C, g, sx, sy, mx, my, a) {
    if (a <= 0.02 || !C.eyes.length) return;
    const ctx = g.ctx, q = C.k / C.dpr, r = Math.max(1.5, 0.026 * q);
    ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter';
    for (const [x, y, w] of C.eyes) {
      const px = sx + mx * x * q, py = sy - my * y * q;
      ctx.globalAlpha = Math.min(1, a * w * (g.L ? 0.9 : 0.75)); ctx.drawImage(g.spr.glow, px - r, py - r, r * 2, r * 2);
      ctx.globalAlpha = Math.min(1, a * w); ctx.fillStyle = g.L ? 'rgba(255,250,214,1)' : 'rgba(236,244,206,1)'; ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /** The joint of a two-bone reach from (ax, ay) toward (tx, ty), on the side (px, py) points to. */
  function ik2(ax, ay, tx, ty, l1, l2, px, py) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 1e-6;
    const dm = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d)); dx *= dm / d; dy *= dm / d; d = dm;
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))), b = Math.atan2(dy, dx);
    const x1 = ax + Math.cos(b + a) * l1, y1 = ay + Math.sin(b + a) * l1, x2 = ax + Math.cos(b - a) * l1, y2 = ay + Math.sin(b - a) * l1;
    return (x1 - x2) * px + (y1 - y2) * py > 0 ? [x1, y1] : [x2, y2];
  }
  /** A whole limb: bones t1, t2 from (ax, ay) reaching for (tx, ty), the joint pushed toward (px, py); hand hs at its end. fs < 1: foreshortened. */
  function limb(C, t1, t2, ax, ay, tx, ty, px, py, hs, hrot, hmx, hsc, fs) {
    const l1 = SEG[t1].l * (fs || 1), l2 = SEG[t2].l * (fs || 1), J = ik2(ax, ay, tx, ty, l1, l2, px, py), dl = Math.hypot(tx - J[0], ty - J[1]) || 1;
    const ex = J[0] + ((tx - J[0]) * Math.min(dl, l2)) / dl, ey = J[1] + ((ty - J[1]) * Math.min(dl, l2)) / dl;
    seg(C, t1, ax, ay, J[0], J[1]); seg(C, t2, J[0], J[1], ex, ey); put(C, C.S.kn, J[0], J[1], 0, 1, fs);
    if (hs) put(C, hs, ex, ey, hrot || 0, hmx || 1, hsc);
    return J;
  }
  const rot2 = (u, v, r) => [u * Math.cos(r) - v * Math.sin(r), u * Math.sin(r) + v * Math.cos(r)];
  /** Its face at centre (cx, cy), turned r: the hair parted over it hangs from the crown (up: a body upside down); its eyes noted for the shine. */
  const HK = 1.25; // its head, a little too big for it
  function faceAt(C, cx, cy, r, jaw, lag, a, up, sx) {
    const S = C.S, [ax, ay] = rot2(0, -0.13 * HK, r), [kx, ky] = rot2(0, 0.105 * HK, r), hx = cx + kx, hy = cy + ky;
    SX.globalAlpha = a; put(C, S['fc' + (jaw > 0.5 ? 1 : 0)], cx + ax, cy + ay, r, 1, HK, sx);
    hang(C, S.hF, hx, hy, -lag * 0.6, up ? 1 : Math.min(1, Math.max(0.25, (hy - 0.01) / (0.38 * HK))), up, sx, HK);
    SX.globalAlpha = 1;
    for (const s of [-1, 1]) { const [ex, ey] = rot2(s * 0.031 * HK * (sx || 1), 0.009 * HK, r); C.eyes.push([cx + ex, cy + ey, a]); }
  }

  /*
   * On all fours, from the side, facing +x (local metres, the floor at y = 0). p: fe [4] = [x, lift] (0 / 1 the near / far hand,
   * 2 / 3 the feet), sy / py the height of the shoulders / hips (or sh / hp: [x, y] for a body unfolding), br breath 0..2, look 0..1
   * (the hanging head raised to a face), roll (the face turned over on its neck), tilt, jaw, lag (hair trailing), tap [4], neck (how
   * long it stretches), hd [x, y] (where the head goes), up (the body is upside down: its hair falls the other way), jp [4] joint pushes.
   */
  function sideBody(C, p) {
    const S = C.S, sh = p.sh || [0.32, p.sy], hp = p.hp || [-0.4, p.py];
    const one = (k) => {
      const fore = k < 2, far = k & 1, ox = far ? -0.04 : 0, oy = far ? 0.05 : 0, A = fore ? sh : hp, f = p.fe[k], lift = f[1], jp = p.jp ? p.jp[k] : fore ? [0.3, 1] : [-0.3, 1];
      const hs = lift > 0.025 ? S.hl : p.tap && p.tap[k] ? S.ht : S.hp;
      limb(C, fore ? 'ua' : 'th', fore ? 'fa' : 'sh', A[0] + ox, A[1] + oy, f[0] + ox, 0.065 + lift + oy, jp[0], jp[1], hs, lift > 0.025 ? -0.35 * (fore ? 1 : -1) : 0, fore ? 1 : -1, 1.3);
    };
    const head = () => {
      const n0x = sh[0] + 0.08 * Math.cos(p.ta || 0), n0y = sh[1] + 0.05, lk = p.look, fa = ss(0.3, 0.7, lk);
      const hd = p.hd || [n0x + 0.15 + (0.58 - n0x - 0.15) * lk, n0y - 0.22 + (0.34 - n0y + 0.22) * lk];
      seg(C, 'nk', n0x, n0y, hd[0], hd[1]);
      if (fa < 1) {
        const r = (p.tilt || 0) - 0.5 * lk, [cx, cy] = rot2(0.05, 0.04, r);
        SX.globalAlpha = 1 - fa; put(C, S.hs, hd[0], hd[1], r, 1, HK);
        hang(C, S.hS, hd[0] + cx * HK, hd[1] + cy * HK, -(p.lag || 0) * 0.7, p.up ? 1 : Math.min(1, Math.max(0.2, (hd[1] + cy * HK - 0.01) / (0.34 * HK))), p.up, 1, HK);
        SX.globalAlpha = 1;
      }
      if (fa > 0) { const [cx, cy] = rot2(0, 0.13 * HK, p.tilt || 0); faceAt(C, hd[0] + cx, hd[1] + cy, (p.tilt || 0) + (p.roll || 0), p.jaw || 0, p.lag || 0, fa, p.up); }
    };
    one(3); one(1); darken(C, 0.6);
    const tx = sh[0] - hp[0], ty = sh[1] - hp[1];
    put(C, S['ts' + (p.br || 0)], hp[0], hp[1], Math.atan2(ty, tx), 1, Math.hypot(tx, ty) / 0.72);
    occl(C, sh[0] - 0.02, sh[1] - 0.03, 0.13, 0.5); occl(C, hp[0], hp[1] - 0.03, 0.13, 0.45);
    if (p.look < 0.5) head();
    one(2); one(0);
    if (p.look >= 0.5) head();
  }
  /** On all fours, coming straight at us. p: lf [4] (lifts: 0 / 1 the left / right hand, 2 / 3 the feet), sy, py, sw (sway), jaw, lag, tilt. */
  function frontBody(C, p) {
    const S = C.S;
    for (const s of [-1, 1]) limb(C, 'th', 'sh', s * 0.12, p.py + 0.08, s * 0.3, 0.12 + p.lf[s < 0 ? 2 : 3], s, 0.7, S.hf, 0, 1, 0.75, 0.6);
    darken(C, 0.5);
    put(C, S.tf, p.sw * 0.3, p.sy);
    occl(C, 0, p.sy - 0.25, 0.2, 0.4);
    for (const s of [-1, 1]) limb(C, 'ua', 'fa', s * 0.2 + p.sw * 0.3, p.sy, s * 0.46 + p.sw, 0.05 + p.lf[s < 0 ? 0 : 1], s, 0.8, S.hf, 0, 1, 1, 0.94);
    seg(C, 'nk', p.sw * 0.3, p.sy + 0.06, p.sw * 0.5, p.sy - 0.1);
    faceAt(C, p.sw * 0.5, p.sy - 0.02, p.tilt || 0, p.jaw, p.lag || 0, 1, false);
  }
  /** Crouched with its back to us. p: rock (rad), bob, rise (the head up over its shoulders 0..1), turn (0 the back of its head … 1 its face), jaw, lag, tw (a twitch). */
  function backBody(C, p) {
    const S = C.S, r = p.rock, R = (x, y) => { const [u, v] = rot2(x, y - 0.13, r); return [u, v + 0.13]; };
    const head = (low) => {
      const n = R(0, 0.58), up = low ? -0.12 + p.bob : 0.03 + 0.12 * p.rise, hx = n[0] + Math.sin(r) * 0.02, hy = n[1] + up, t = p.turn, sx = Math.max(0.12, Math.abs(1 - 2 * t));
      if (!low) seg(C, 'nk', n[0], n[1] - 0.06, hx, hy + 0.02);
      if (t < 0.5) { put(C, S.hk, hx, hy, r * 0.6, 1, HK, sx); hang(C, S.hB, hx, hy + 0.21 * HK, -(p.lag || 0) * 0.5, Math.min(1, (hy + 0.2) / (0.3 * HK)), false, sx, HK); }
      else faceAt(C, hx, hy + 0.13 * HK, r * 0.6 + (p.tilt || 0), p.jaw, p.lag || 0, 1, false, sx);
    };
    const J = []; // the joints: elbows up over its shoulders like horns, knees jutting out beside them
    for (const s of [-1, 1]) J.push({ s, sh: R(s * 0.2, 0.6), el: R(s * 0.43, 1.18 + (p.tw && s > 0 ? 0.06 : 0)), hd: R(s * 0.17, 0.2), hp: R(s * 0.12, 0.14), kn: [s * 0.52, 0.84], ft: [s * 0.37, 0.05] });
    if (p.rise < 0.5) head(true);
    for (const q of J) { seg(C, 'fa', q.el[0], q.el[1], q.hd[0], q.hd[1]); seg(C, 'sh', q.hp[0], q.hp[1], q.kn[0], q.kn[1]); seg(C, 'fa', q.kn[0], q.kn[1], q.ft[0], q.ft[1]); put(C, S.kn, q.kn[0], q.kn[1]); put(C, S.hf, q.ft[0], q.ft[1], 0, 1, 0.9); }
    darken(C, 0.35);
    put(C, S.tb, 0, 0.13, r, 1, 1.05);
    occl(C, 0, 0.62, 0.16, 0.45);
    for (const q of J) { seg(C, 'sh', q.sh[0], q.sh[1], q.el[0], q.el[1]); put(C, S.kn, q.el[0], q.el[1]); } // thin, bony, the elbows up like horns
    if (p.rise >= 0.5) head(false);
  }

  /** The tape catching it: its colours split red one way and cyan the other for a frame or two. */
  let TC = null, TX = null;
  function chroma(C, g, sx, sy, mx, my, amt) {
    if (!TC) { TC = document.createElement('canvas'); TX = TC.getContext('2d'); }
    if (TC.width < C.W || TC.height < C.H) { TC.width = Math.max(TC.width, C.W); TC.height = Math.max(TC.height, C.H); }
    const ctx = g.ctx;
    for (const [col, dx] of [['255,46,30', amt], ['30,200,255', -amt]]) {
      TX.globalCompositeOperation = 'source-over'; TX.clearRect(0, 0, C.W, C.H); TX.drawImage(SCR, 0, 0, C.W, C.H, 0, 0, C.W, C.H);
      TX.globalCompositeOperation = 'source-in'; TX.fillStyle = `rgb(${col})`; TX.fillRect(0, 0, C.W, C.H);
      ctx.save(); ctx.translate(sx + dx, sy); ctx.scale(mx / C.dpr, my / C.dpr); ctx.globalCompositeOperation = g.L ? 'multiply' : 'lighter'; ctx.globalAlpha = g.L ? 0.3 : 0.26;
      ctx.drawImage(TC, 0, 0, C.W, C.H, -C.ox, -C.oy, C.W, C.H); ctx.restore();
    }
  }

  // ---- its visits
  const CC = 3.6, TH = 0.14, HC = 2.6, EYE = 1.55, LINTEL = 2.1;
  const one = (a) => a[(Math.random() * a.length) | 0];
  const dprOf = (g) => { const t = g.ctx.getTransform(); return Math.hypot(t.a, t.b) || 1; };
  /** Rows ahead whose distance (from fn(j)) lies in a..b (wider when the test hook has had to wait) and that pass ok. */
  function rows(g, a, b, dist, ok) { if (g.loose) { a *= 0.7; b *= 1.5; } const o = []; for (let j = g.j0; j < g.j0 + 8; j++) { const d = dist(j); if (d >= a && d <= b && (!ok || ok(j))) o.push(j); } return o; }
  /** The bake sizes a visit will want, from far to near; baked a few ms a frame from its step. */
  const want = (e, k0, k1) => { e.need = [...new Set([bucket(k0), bucket(Math.sqrt(k0 * k1)), bucket(k1)])]; };
  function bake(e, g) {
    const t0 = performance.now();
    for (const R of e.need) { const S = sheet(g.L, R); if (S.ready) continue; const left = 6 - (performance.now() - t0); if (left <= 0) break; work(S, left); }
  }
  /** The sheet to draw with at k px per metre: the smallest ready one not much smaller than that, else the biggest ready. */
  function pickS(e, g, k) {
    let best = null;
    for (const R of e.need) { const S = sheet(g.L, R); if (!S.ready) continue; if (!best || (best.R < k * 0.85 ? S.R > best.R : S.R >= k * 0.85 && S.R < best.R)) best = S; }
    return best;
  }
  // the gait: each hand or foot stays where it was put; the one lagging furthest darts ahead (two at once when it runs)
  const REST = [1.0, 1.08, -1.04, -0.96];
  const newFeet = (bx, d) => REST.map((r) => ({ x: bx + d * r, y: 0, t: 0, dur: 4, x0: 0, x1: 0, lift: 0.1, tap: 0 }));
  function stepFeet(H, d, v) {
    let mv = 0;
    for (const f of H.feet) {
      if (f.t > 0) { mv++; f.t = Math.min(1, f.t + 1 / f.dur); const q = f.t * f.t * (3 - 2 * f.t); f.x = f.x0 + (f.x1 - f.x0) * q; f.y = Math.sin(f.t * Math.PI) * f.lift; if (f.t >= 1) { f.t = 0; f.y = 0; f.tap = 3; } }
      else if (f.tap > 0) f.tap--;
      else if (Math.random() < 0.04) f.tap = 2; // the long fingers drumming
    }
    const fast = v > 0.03;
    if (mv >= (fast ? 2 : 1)) return;
    let best = -1, bl = 0.13;
    for (let k = 0; k < 4; k++) {
      const f = H.feet[k]; if (f.t > 0 || (mv && H.feet.some((o, j) => o.t > 0 && (j < 2) === (k < 2)))) continue;
      const lag = (H.bx + d * REST[k] - f.x) * d; if (lag > bl) { bl = lag; best = k; }
    }
    if (best < 0) return;
    const f = H.feet[best]; f.t = 1e-6; f.dur = fast ? 2 + ((Math.random() * 2) | 0) : 3 + ((Math.random() * 3) | 0); f.x0 = f.x;
    f.x1 = H.bx + d * (REST[best] + Math.min(0.45, Math.max(0.05, v * f.dur * 1.8)) + Math.random() * 0.06); f.lift = (best < 2 ? 0.16 : 0.1) + Math.random() * 0.09;
  }
  /** Holds: now and then everything stops for a few frames (then catches up all at once). */
  function held(H, p) { if (H.fz > 0) { H.fz--; return true; } if (Math.random() < p) { H.fz = 2 + ((Math.random() * 6) | 0); return true; } return false; }
  /** The tape tearing as it moves: a torn line, the tracking band, the colours split. */
  function vhs(H, st, BR, n) { BR.glitch(st, n); if (!st.trk && Math.random() < 0.5) st.trk = { y: 250 + Math.random() * 400, hh: 14 + Math.random() * 26, v: 1.2 + Math.random() }; H.split = 2 + ((Math.random() * 2) | 0); }
  /** The pose a side body is drawn in, from the state. */
  const sidePose = (H, d) => ({ fe: H.feet.map((f) => [(f.x - H.bx) * d, f.y]), tap: H.feet.map((f) => f.tap > 0), sy: H.sy, py: H.py, br: H.br, look: H.look, roll: H.roll, tilt: H.tilt, jaw: H.jaw, lag: H.lag, hd: H.hd, up: H.up });
  function breathe(H, fast) { H.bp += fast ? 0.42 : 0.2; H.br = Math.round(1 + Math.sin(H.bp)); }
  /** A side body into the scene: local (0, 0) at plan (bx, z, y); inv: upside down on the ceiling. */
  function drawSide(e, g, H, p, bx, z, y, d, inv, op, lit, eyeA, q) {
    if (!g.pr(bx, z, y)) return null;
    q = q || 1;
    const sx = g.sx, sy = g.sy, dpr = dprOf(g) * q, k = (g.f / g.sz) * dpr, S = pickS(e, g, k); if (!S) return null;
    const cc = H.cc || (H.cc = {}), key = poseKey(p, k, lit) + S.R;
    let C;
    if (cc.key === key) { C = cc.C; C.eyes.length = C.ne; blit(C, g, sx, sy, d, inv ? -1 : 1, op, cc.c); }
    else { C = begin(S, k, dpr, -1.5, 1.55, -0.25, Math.max(inv ? 1.75 : 1.32, p.sh ? p.sh[1] + 0.3 : 0, p.hd ? p.hd[1] + 0.48 : 0)); sideBody(C, p); finish(C, lit, g.L, 0); C.ne = C.eyes.length; keep(cc, C, key); blit(C, g, sx, sy, d, inv ? -1 : 1, op); }
    if (H.split > 0) chroma(C, g, sx, sy, d, inv ? -1 : 1, 2 + H.split);
    shine(C, g, sx, sy, d, inv ? -1 : 1, eyeA);
    return C;
  }
  /** Soft shadows on the carpet: under the body and under each planted hand and foot. */
  function shadows(g, BR, H, z, d, op) {
    BR.contact(g, H.bx, z, 2.1, op * 0.8);
    for (let k = 0; k < 4; k++) {
      const f = H.feet[k]; if (f.y > 0.05 || !g.pr(f.x + d * (k < 2 ? 0.12 : -0.12), z + (k & 1 ? 0.22 : -0.08), 0)) continue;
      const s = g.f / g.sz, w = 0.3 * s, h = w * Math.min(1, EYE / g.sz) * 0.7; g.ctx.globalAlpha = (g.L ? 0.4 : 0.7) * op; g.ctx.drawImage(g.spr.blot, g.sx - w / 2, g.sy - h / 2, w, h); g.ctx.globalAlpha = 1;
    }
  }
  const lum = (g, BR, x, z) => g.lum(BR.COL(x), BR.ROW(z)) * g.glob;

  const V = {
    /** crawl: a low shadow darts across the nearest doorway; then it crawls into it on its wrong-way limbs in bursts and holds,
     * stops, raises its head in three jerks to look at us (the room's tube stuttering), and scrambles off with its head turned over, still on us. */
    crawl: {
      place(g) {
        const js = rows(g, 1.8, 3.6, (j) => (j + 1) * CC - g.camZ, (j) => g.cr(j, 0) === 2); if (!js.length) return null;
        const J = one(js), d = Math.random() < 0.5 ? -1 : 1;
        return { J, dir: d, x: -d * 2.3, z: (J + 1) * CC + TH + 0.9, life: 215 };
      },
      step(e, g, st, BR, H) {
        const a = e.age, d = e.dir;
        e.cl = [[0, e.J + 1, a < 8 || (a > 40 && a < 48) || (a > 134 && a < 142) ? BR.flick(a, 3) : 1]];
        if (a === 1) { H.bx = H.tx = e.x; H.feet = newFeet(e.x, d); }
        if (a === 44) BR.glitch(st, 2);
        if (a < 48) { e.vis = 0; return; }
        if (a < 96) H.tx = -d * (2.3 - 2.15 * ss(48, 95, a));
        else if (a >= 150) { if (a === 150) vhs(H, st, BR, 3); if (!e.hold && !H.fz) H.tx += d * (0.08 + Math.random() * 0.08); }
        if (H.split > 0) H.split--;
        const look = a >= 96 && a < 150;
        if (held(H, look ? 0.02 : 0.08)) { e.vis = 1; return; }
        const x0 = H.bx; H.bx += (H.tx - H.bx) * 0.55;
        const v = (H.bx - x0) * d;
        if (v > 0.12 && Math.random() < 0.3) H.split = 2;
        stepFeet(H, d, v); breathe(H, look);
        const lf = H.feet[0].y + H.feet[1].y, lh = H.feet[2].y + H.feet[3].y;
        H.sy = 0.47 - lf * 0.12 + (H.tw > 0 ? 0.05 : 0); H.py = 0.46 - lh * 0.12;
        H.look = a >= 96 ? Math.floor(ss(98, 114, a) * 3.999) / 3 : 0;
        H.jaw = ss(118, 126, a); H.tilt = (a >= 128 ? 0.22 : 0) + (a >= 140 ? 0.2 : 0) + (H.tw > 0 ? H.twa : 0);
        H.roll = a < 150 ? 0 : a < 152 ? 1.3 : Math.PI * 0.92;
        H.lag += (v * 4 - H.lag) * 0.3;
        if (H.tw > 0) H.tw--; else if (look && Math.random() < 0.04) { H.tw = 2; H.twa = (Math.random() - 0.5) * 0.7; }
        e.vis = a < 205 && H.bx * d < 2.7 ? 1 : 0;
      },
      draw(e, g, j, c, BR, H) {
        if (c !== 0 || j !== BR.ROW(e.z)) return;
        const a = e.age, ctx = g.ctx;
        if (a < 8 && g.pr(-e.dir * 2 + e.dir * 4 * (a / 8), e.z, 0.35)) { // first, something low and quick across the doorway
          const s = g.f / g.sz; ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.globalAlpha = (g.L ? 0.45 : 0.7) * BR.far(g.sz);
          ctx.drawImage(g.spr.blot, g.sx - s * 1.1, g.sy - s * 0.4, s * 2.2, s * 0.75); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        if (!e.vis || !H.feet) return;
        const op = BR.far(e.z - g.camZ), lit = lum(g, BR, H.bx, e.z);
        shadows(g, BR, H, e.z, e.dir, op);
        drawSide(e, g, H, sidePose(H, e.dir), H.bx, e.z, 0, e.dir, false, op, lit, H.look > 0.5 ? 0.6 + 0.4 * (1 - lit) : 0);
      },
    },

    /** ceiling: upside down on the ceiling of the room ahead, limbs hanging with their joints toward the floor; it creeps across
     * from the corner in bursts, stops over the hall, lets its head down on a neck far too long, and turns its face the right way up. */
    ceiling: {
      place(g) {
        const js = rows(g, 3, 6.6, (j) => (j + 0.5) * CC - g.camZ, (j) => { // what hangs from its ceiling must not hide behind a nearer lintel
          for (let i = g.j0; i < j; i++) { const D = (i + 1) * CC - g.camZ; if (g.cr(i, 0) === 2 && D > 0.3 && EYE + ((LINTEL - EYE) * ((j + 0.5) * CC - g.camZ)) / D < HC - 0.5) return false; }
          return true;
        });
        if (!js.length) return null;
        const J = one(js), d = Math.random() < 0.5 ? -1 : 1;
        return { J, dir: d, x: -d * 1.55, z: (J + 0.5) * CC + 0.2, life: 196 };
      },
      step(e, g, st, BR, H) {
        const a = e.age, d = e.dir;
        e.cl = [[0, e.J, a < 10 || (a > 158 && a < 168) ? BR.flick(a, 5) : a >= 182 && a < 190 ? 0.02 : 1]];
        if (a === 1) { H.bx = H.tx = e.x; H.feet = newFeet(e.x, d); H.up = true; }
        if (a === 168) vhs(H, st, BR, 2);
        if (a === 190) BR.glitch(st, 2);
        if (H.split > 0) H.split--;
        e.vis = a >= 4 && a < 190 ? 1 : 0;
        if (a < 4) return;
        if (a < 90) H.tx = -d * (1.55 - 1.35 * ss(10, 88, a));
        const still = a >= 110 && a < 182;
        if (held(H, still ? 0.015 : 0.09)) return;
        const x0 = H.bx; H.bx += (H.tx - H.bx) * 0.5;
        const v = (H.bx - x0) * d;
        stepFeet(H, d, v); breathe(H, still);
        H.sy = 0.36 - (H.feet[0].y + H.feet[1].y) * 0.1; H.py = 0.35 - (H.feet[2].y + H.feet[3].y) * 0.1;
        const drop = Math.floor(ss(112, 132, a) * 4) / 4; // the head let down in jerks, on a neck that keeps going
        H.look = a >= 112 ? 1 : 0; H.hd = [0.58 + drop * 0.05, 0.34 + drop * 0.62];
        H.roll = a < 136 ? 0 : a < 140 ? 1.5 : Math.PI; // then its face turned the right way up
        H.tilt = H.tw > 0 ? H.twa : Math.sin(a * 0.05) * 0.05; H.jaw = ss(146, 152, a); H.lag = v * 3;
        if (H.tw > 0) H.tw--; else if (still && Math.random() < 0.035) { H.tw = 2; H.twa = (Math.random() - 0.5) * 0.6; }
      },
      draw(e, g, j, c, BR, H) {
        if (c !== 0 || j !== BR.ROW(e.z) || !e.vis || !H.feet) return;
        const op = BR.far(e.z - g.camZ), lit = lum(g, BR, H.bx, e.z);
        const p = sidePose(H, e.dir); if (H.look < 0.5) { p.look = 0; p.hd = [0.5, 0.62]; p.tilt = Math.PI - 0.4; }
        drawSide(e, g, H, p, H.bx, e.z, HC, e.dir, true, op, lit, H.look ? 0.4 + 0.6 * (1 - lit) : 0);
      },
    },

    /** charge: far down the hall, it drops its head and comes at us on all fours, impossibly fast, in stop-motion; each room's tube
     * dies as it gets there; it stops close, huge in the dark, eyes lit — and the lights come back on all at once on nothing. */
    charge: {
      place(g) {
        const js = rows(g, 15, 24, (j) => (j + 0.5) * CC - g.camZ); if (!js.length) return null;
        const J = one(js);
        return { J, x: (Math.random() - 0.5) * 0.5, z: (J + 0.5) * CC, life: 200, dead: [] };
      },
      step(e, g, st, BR, H) {
        const a = e.age;
        if (a === 1) { H.ph = 0; H.v = 0; H.lf = [0, 0, 0, 0]; H.sy = 0.5; H.py = 0.48; H.end = 0; H.head = 0; }
        if (H.split > 0) H.split--;
        const dist = e.z - g.camZ;
        if (!H.end) {
          if (a >= 26) H.head = 1; // its head comes up
          if (a >= 44) { // and it comes
            if (a === 44) vhs(H, st, BR, 2);
            H.v = Math.min(0.36, H.v + 0.03);
            if (a % 2 === 0) { e.z -= H.v * 2; H.ph += 1.5; } // moving on every other frame only: stop-motion
            if (Math.random() < 0.08) vhs(H, st, BR, 1);
            const R = BR.ROW(e.z); if (!e.dead.includes(R)) e.dead.push(R, R - 1);
            if (e.z - g.camZ < 3.3) { H.end = a; H.v = 0; BR.glitch(st, 2); }
          }
        } else if (a - H.end === 14) { e.dead = []; e.vis = 0; BR.glitch(st, 3); e.life = a + 30; }
        const lf = (q) => Math.max(0, Math.sin(q)) * 0.24;
        if (a % 2 === 0) H.lf = [lf(H.ph), lf(H.ph + 0.9), lf(H.ph + Math.PI), lf(H.ph + Math.PI + 0.9)];
        if (H.end) H.lf = [0, 0, 0, 0];
        H.sy = 0.5 + (H.v ? Math.sin(H.ph * 2) * 0.035 : 0); H.py = 0.48;
        e.cl = e.dead.map((r) => [0, r, r === BR.ROW(e.z) && H.end ? 0.16 + 0.1 * BR.flick(a, 1) : a % 7 < 2 && r === BR.ROW(e.z) ? BR.flick(a, r) * 0.6 : 0.02]);
        if (!H.end || a - H.end < 14) e.vis = 1;
      },
      draw(e, g, j, c, BR, H) {
        if (c !== 0 || j !== BR.ROW(e.z) || !e.vis || !H.lf) return;
        if (!g.pr(e.x, e.z, 0)) return;
        const op = BR.far(e.z - g.camZ), lit = lum(g, BR, e.x, e.z), sx = g.sx, sy = g.sy, dpr = dprOf(g), k = (g.f / g.sz) * dpr, S = pickS(e, g, k); if (!S) return;
        BR.contact(g, e.x, e.z, 1.3, op);
        const C = begin(S, k, dpr, -0.85, 0.85, -0.2, 1.25);
        frontBody(C, { lf: H.lf, sy: H.sy, py: H.py, sw: Math.sin(H.ph) * 0.03, jaw: H.end || H.v > 0.2 ? 1 : 0, lag: 0, tilt: H.head ? (H.end ? 0.15 : 0) : 0 });
        finish(C, lit, g.L, 0);
        blit(C, g, sx, sy, 1, 1, op);
        if (H.split > 0) chroma(C, g, sx, sy, 1, 1, 2 + H.split);
        shine(C, g, sx, sy, 1, 1, H.head ? 0.5 + 0.5 * (1 - lit) : 0);
      },
    },

    /** pack: the room ahead goes dark; in it, pairs of eyes open one after another, low down, hunched shapes round them; one of them
     * gets up, and up, far taller than a person, its head bent under the ceiling. The tube stutters; when it comes on, the room is empty. */
    pack: {
      place(g) {
        const js = rows(g, 3.6, 6.8, (j) => (j + 0.5) * CC - g.camZ, (j) => j === g.j0 || g.cr(j - 1, 0) === 0); if (!js.length) return null;
        const J = one(js), z0 = (J + 0.5) * CC, m = [];
        const xs = [(Math.random() - 0.5) * 0.5, -1.15, 1.0, 0.1], zs = [-0.7, 0.4, 0.1, 1.2], ts = [96, 30, 50, 66];
        for (let i = 0; i < 4; i++) { const d = i === 3 ? 0 : Math.random() < 0.5 ? -1 : 1; m.push({ x: xs[i], z: z0 + zs[i], d, t0: ts[i] + ((Math.random() * 10) | 0), H: { bx: xs[i], feet: newFeet(xs[i], d || 1), sy: 0.46, py: 0.45, br: 1, bp: Math.random() * 6, look: 0, roll: 0, tilt: 0, jaw: 0, lag: 0, tw: 0, fz: 0 } }); }
        const tall = m[0]; return { J, x: 0, z: z0, life: 214, tall, m: m.sort((p, q) => q.z - p.z) };
      },
      step(e, g, st, BR, H) {
        const a = e.age;
        const fl = a > 160 && a < 200 && (a - 160) % 9 < 2;
        e.cl = [[0, e.J, a < 14 ? BR.flick(a, 2) : a >= 200 ? 1 : fl ? 0.45 : 0.02]];
        if (a === 200) BR.glitch(st, 3);
        e.vis = a >= 14 && a < 200 ? 1 : 0;
        for (const q of e.m) {
          const h = q.H; if (held(h, 0.03)) continue;
          breathe(h, false); if (h.tw > 0) h.tw--; else if (Math.random() < 0.02) { h.tw = 2; h.twa = (Math.random() - 0.5) * 0.5; }
          h.look = q === e.tall ? Math.floor(ss(140, 150, a) * 3) / 3 : a > q.t0 + 30 ? 1 : 0; h.tilt = h.tw > 0 ? h.twa : 0;
        }
        const t = e.tall.H, rise = Math.floor(ss(102, 146, a) * 5) / 4; H.rise = Math.min(1, rise);
        if (a === 102 || a === 124) BR.glitch(st, 1);
        t.rise = H.rise;
      },
      draw(e, g, j, c, BR, H) {
        if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
        const a = e.age, lit = Math.max(0.14, lum(g, BR, 0, e.z));
        for (const q of e.m) {
          const h = q.H, op = BR.far(q.z - g.camZ), eyes = a > q.t0 ? (Math.random() < 0.03 ? 0 : Math.min(1, (a - q.t0) / 4)) : 0;
          BR.contact(g, q.x, q.z, 1.8, op * 0.6);
          if (!q.d) { // the one facing us
            if (!g.pr(q.x, q.z, 0)) continue;
            const sx = g.sx, sy = g.sy, dpr = dprOf(g), k = (g.f / g.sz) * dpr, S = pickS(e, g, k * 0.6); if (!S) continue;
            const p = { lf: [0, 0, 0, 0], sy: 0.46 + (h.br - 1) * 0.01, py: 0.45, sw: 0, jaw: 0, lag: 0, tilt: h.tilt }, cc = h.cc || (h.cc = {}), key = poseKey(p, k, lit) + S.R;
            let C;
            if (cc.key === key) { C = cc.C; blit(C, g, sx, sy, 1, 1, op, cc.c); }
            else { C = begin(S, k * 0.6, dpr * 0.6, -0.85, 0.85, -0.2, 1.25); frontBody(C, p); finish(C, lit, g.L, 0); keep(cc, C, key); blit(C, g, sx, sy, 1, 1, op); }
            shine(C, g, sx, sy, 1, 1, eyes);
            continue;
          }
          const p = sidePose(h, q.d);
          if (q === e.tall && H.rise > 0) { // it stands: the hips go up, the back comes upright, the arms hang to its knees
            const r = H.rise, hx = -0.4 + 0.42 * r, hy = 0.45 + 0.95 * r, ta = r * 1.35, sx2 = hx + Math.cos(ta) * 0.72, sy2 = hy + Math.sin(ta) * 0.72;
            p.hp = [hx, hy]; p.sh = [sx2, sy2]; p.ta = ta;
            p.fe[0] = [sx2 + 0.12 + 0.6 * (1 - r), 0.62 * r]; p.fe[1] = [sx2 + 0.18 + 0.6 * (1 - r), 0.6 * r];
            p.jp = [[1, 0.2 - r], [1, 0.2 - r], [-1, 0.15], [-1, 0.15]]; // the knees bent backwards under it
            p.fe[2] = [p.fe[2][0] + (hx + 0.1 - p.fe[2][0]) * r, 0]; p.fe[3] = [p.fe[3][0] + (hx - 0.08 - p.fe[3][0]) * r, 0];
            p.hd = [sx2 + 0.12 + 0.1 * r, sy2 + 0.05 - 0.12 * r]; p.look = h.look; p.tilt = -0.25 * r;
          }
          drawSide(e, g, h, p, q.x, q.z, 0, q.d, false, op, lit, eyes, q === e.tall || lit > 0.3 ? 1 : 0.6);
        }
      },
    },

    /** eat: crouched in the nearest doorway with its back to us, spine and shoulder blades working, rocking over something on the
     * floor. It stops dead. Its head comes up over its shoulders, and turns, all the way round, to look at us. */
    eat: {
      place(g) {
        const js = rows(g, 2.3, 3.9, (j) => (j + 1) * CC - g.camZ, (j) => g.cr(j, 0) === 2); if (!js.length) return null;
        const J = one(js);
        return { J, x: (Math.random() - 0.5) * 0.3, z: (J + 1) * CC + TH + 0.42, life: 214 };
      },
      step(e, g, st, BR, H) {
        const a = e.age;
        e.cl = [[0, e.J + 1, a < 6 || (a > 182 && a < 194) ? BR.flick(a, 4) : a >= 205 && a < 212 ? 0.02 : 1]];
        if (a === 1) { H.rock = 0; H.bob = 0; H.rise = 0; H.turn = 0; H.jaw = 0; }
        if (a === 158) vhs(H, st, BR, 3);
        if (a === 212) BR.glitch(st, 2);
        if (H.split > 0) H.split--;
        e.vis = a >= 4 && a < 212 ? 1 : 0;
        if (H.tw > 0) H.tw--; else if (a < 110 && Math.random() < 0.03) H.tw = 2;
        if (a < 110) { if (!held(H, 0.06)) { H.rock = Math.sin(a * 0.14) * 0.07; H.bob = -Math.abs(Math.sin(a * 0.45)) * 0.05 - (Math.random() < 0.1 ? 0.03 : 0); } }
        else { H.bob = 0; H.rise = a < 132 ? 0 : a < 140 ? 0.5 : 1; H.turn = a < 150 ? 0 : a < 155 ? 0.3 : a < 160 ? 0.5 : a < 163 ? 0.75 : 1; H.jaw = ss(172, 178, a); H.tilt = a > 186 ? 0.3 : 0; }
      },
      draw(e, g, j, c, BR, H) {
        if (c !== 0 || j !== BR.ROW(e.z) || !e.vis || H.rock == null) return;
        if (!g.pr(e.x, e.z, 0)) return;
        const op = BR.far(e.z - g.camZ), lit = lum(g, BR, e.x, e.z), sx = g.sx, sy = g.sy, dpr = dprOf(g), k = (g.f / g.sz) * dpr, S = pickS(e, g, k); if (!S) return;
        BR.contact(g, e.x, e.z, 1.4, op);
        const C = begin(S, k, dpr, -0.9, 0.9, -0.2, 1.45);
        backBody(C, { rock: H.rock, bob: H.bob, rise: H.rise, turn: H.turn, jaw: H.jaw, lag: 0, tilt: H.tilt, tw: H.tw > 0 });
        finish(C, lit, g.L, 0);
        blit(C, g, sx, sy, 1, 1, op);
        if (H.split > 0) chroma(C, g, sx, sy, 1, 1, 2 + H.split);
        shine(C, g, sx, sy, 1, 1, H.turn > 0.6 ? 0.6 + 0.4 * (1 - lit) : 0);
      },
    },
  };

  const NAMES = Object.keys(V);
  let LASTV = '';
  const STATS = { n: 0, sum: 0, max: 0 };
  (window.BR_ENT = window.BR_ENT || {}).hound = {
    /** Which of its visits, and where (v: one asked for by name; otherwise any that fits, never the same one twice running). */
    place(g, v, BR) {
      const list = v && V[v] ? [v] : NAMES.filter((n) => n !== LASTV).sort(() => Math.random() - 0.5);
      for (const n of list) {
        const e = V[n].place(g, BR); if (!e) continue;
        e.v = n; e.own = true; e.vis = 0;
        e.H = { fz: 0, split: 0, bp: 0, br: 1, look: 0, roll: 0, tilt: 0, jaw: 0, lag: 0, tw: 0, twa: 0, sy: 0.47, py: 0.46, up: false };
        const d0 = Math.max(1, e.z - g.camZ), dpr = dprOf(g), near = n === "charge" ? 3.1 : Math.max(1.8, d0 - 1.3);
        want(e, (g.f / (d0 + 0.6)) * dpr, (g.f / near) * dpr * 1.05);
        LASTV = n; return e;
      }
      return null;
    },
    step(e, g, st, BR) {
      if (!e.own || !V[e.v]) return;
      bake(e, g);
      if (!sheet(g.L, e.need[0]).ready && e.age < 60) { e.age--; e.vis = 0; return; } // nothing shows before its parts are baked
      V[e.v].step(e, g, st, BR, e.H);
      if (e.H.bx != null && e.v !== 'pack') e.x = e.H.bx;
    },
    draw(e, g, j, c, BR) {
      if (!e.own || !V[e.v]) return;
      const t0 = performance.now();
      V[e.v].draw(e, g, j, c, BR, e.H);
      const t = performance.now() - t0;
      if (t > 0.002) { STATS.n++; STATS.sum += t; if (t > STATS.max) STATS.max = t; }
    },
  };
  Object.defineProperty(window.BR_ENT.hound, 'dbg', { value: { stats: STATS, variants: NAMES, sheet, work } }); // for the test harness only
})();
