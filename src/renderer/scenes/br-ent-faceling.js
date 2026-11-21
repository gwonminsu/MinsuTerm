'use strict';
/*
 * 백룸 — the Faceling (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * People, as far as the clothes go: a short-sleeved office shirt gone grey, a tie, slacks, scuffed shoes; or a child in a
 * faded striped top and shorts with its socks pulled up. Nothing else is right: too tall and too thin, the shoulders
 * rolled forward, the neck far too long and the head carried forward on it, the arms hanging to the knees with fingers
 * half as long again as fingers are, the knees locked back, now and then an elbow bent the wrong way. Where the face
 * should be the skin just carries on, pale and wet, drawn into hollows where the eyes would be, a nose and a mouth
 * pressing faintly up from underneath; once in a while something pushes a whole face out through it, mouth open.
 * They are darker than the rooms; only the skin catches the tubes.
 *
 * Nothing here is drawn with paths. Each pose is rendered once, per pixel, into a sprite: the body is built in its own
 * space from tapered capsules, oriented ellipsoids and swept ellipses, turned to the yaw it is seen from and laid into
 * a depth buffer with its normals (supersampled); folds, seams and creases are a height field over the cloth; the light
 * is the tubes' (from above, falling off toward the floor), a rim from the room behind, ambient occlusion and contact
 * shadows read off the depth buffer, a little fabric grain, the tape's colour. The head is sphere-traced from a distance
 * field (skull, jaw, the features under the skin, ears, hair) at each angle it turns through. Sprites are made a few
 * milliseconds at a time while a visit starts and kept per size and light / dark.
 *
 * The visits (BG.st.entityNow = 'faceling:<v>'), each starting far off or half seen and ending a few metres away:
 * stand, walk, child, crowd, mirror, close (see V below). They move in stop-motion: holds, snaps, skipped frames, a
 * tic; when they jump the tape tears through them and their colour splits; the lights stutter at the moment they come.
 */
(function () {
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sm = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const gs = (v, w) => Math.exp(-(v * v) / (w * w));
  const now = () => performance.now();
  function ih(x, y, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vn(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = ih(ix, iy, s), b = ih(ix + 1, iy, s), c = ih(ix, iy + 1, s), d = ih(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  const fb = (x, y, s) => 0.5 * vn(x, y, s) + 0.3 * vn(x * 2.03 + 5.1, y * 2.03 + 1.7, s + 1) + 0.2 * vn(x * 4.1 + 2.3, y * 4.1 + 7.9, s + 2);
  /** A smooth curve through knots [[y, v], …] (cubic Hermite, flat past the ends). */
  function curve(kn) {
    const n = kn.length;
    return (y) => {
      if (y <= kn[0][0]) return kn[0][1];
      if (y >= kn[n - 1][0]) return kn[n - 1][1];
      let i = 0; while (y > kn[i + 1][0]) i++;
      const p0 = kn[Math.max(0, i - 1)], p1 = kn[i], p2 = kn[i + 1], p3 = kn[Math.min(n - 1, i + 2)], h = p2[0] - p1[0], t = (y - p1[0]) / h;
      const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h, m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  /** An orthonormal frame [e1, e2, e3] with e3 along f and e2 as near to up as it can be. */
  const ori = (f, up) => { const e3 = nrm(f), e1 = nrm(crs(up || [0, 1, 0], e3)); return [e1, crs(e3, e1), e3]; };

  // ---- what they are made of ----------------------------------------------------------------------------------
  // materials: w wrap (light creeping round), ks / sh specular, sn sheen (cloth catching the light at grazing angles),
  // gr grain amount, gx / gy grain scale (per metre)
  const MSH = 1, MPA = 2, MSK = 3, MSO = 4, MBE = 5, MTI = 6, MSC = 7, MSL = 8, MST = 9, MSR = 10, MHA = 11;
  const MAT = [];
  MAT[MSH] = { w: 0.35, ks: 0.015, sh: 6, sn: 0.25, gr: 0.07, gx: 900, gy: 900 }; // shirt
  MAT[MPA] = { w: 0.3, ks: 0.01, sh: 5, sn: 0.35, gr: 0.09, gx: 220, gy: 1400 }; // trousers (a twill running down)
  MAT[MSK] = { w: 0.55, ks: 0.16, sh: 26, sn: 0.05, gr: 0.03, gx: 400, gy: 400 }; // skin
  MAT[MSO] = { w: 0.1, ks: 0.32, sh: 40, sn: 0, gr: 0.05, gx: 300, gy: 300 }; // shoe leather
  MAT[MBE] = { w: 0.15, ks: 0.22, sh: 30, sn: 0, gr: 0.05, gx: 400, gy: 400 }; // belt
  MAT[MTI] = { w: 0.3, ks: 0.06, sh: 12, sn: 0.3, gr: 0.08, gx: 1200, gy: 300 }; // tie
  MAT[MSC] = { w: 0.4, ks: 0.0, sh: 4, sn: 0.4, gr: 0.12, gx: 1600, gy: 300 }; // socks (ribbed)
  MAT[MSL] = { w: 0.1, ks: 0.1, sh: 20, sn: 0, gr: 0.03, gx: 300, gy: 300 }; // soles
  MAT[MST] = { w: 0.4, ks: 0.01, sh: 5, sn: 0.3, gr: 0.08, gx: 700, gy: 700 }; // the child's striped top
  MAT[MSR] = { w: 0.3, ks: 0.01, sh: 5, sn: 0.3, gr: 0.08, gx: 300, gy: 900 }; // shorts
  MAT[MHA] = { w: 0.2, ks: 0.1, sh: 20, sn: 0, gr: 0.2, gx: 3000, gy: 200 }; // hair (body sprites never use it)
  // outfits: albedo (linear) per material, the hair, how the skin sits
  const OUT = [ // (darker than the rooms they stand in; the skin the palest thing about them)
    { [MSH]: [0.075, 0.07, 0.056], [MPA]: [0.014, 0.013, 0.012], [MSK]: [0.58, 0.54, 0.46], [MSO]: [0.016, 0.013, 0.011], [MBE]: [0.03, 0.022, 0.016], [MTI]: [0.07, 0.02, 0.018], [MSC]: [0.02, 0.02, 0.02], [MSL]: [0.02, 0.018, 0.015], hair: [0.03, 0.026, 0.02], cut: 1 },
    { [MSH]: [0.1, 0.095, 0.078], [MPA]: [0.024, 0.02, 0.016], [MSK]: [0.6, 0.55, 0.47], [MSO]: [0.025, 0.018, 0.013], [MBE]: [0.04, 0.028, 0.019], [MTI]: [0.022, 0.028, 0.05], [MSC]: [0.03, 0.028, 0.025], [MSL]: [0.02, 0.018, 0.015], hair: [0.05, 0.046, 0.04], cut: 1 },
    { [MST]: [[0.13, 0.125, 0.1], [0.075, 0.025, 0.021]], [MSR]: [0.012, 0.013, 0.02], [MSK]: [0.6, 0.55, 0.47], [MSO]: [0.02, 0.016, 0.013], [MSC]: [0.3, 0.29, 0.26], [MSL]: [0.04, 0.034, 0.028], hair: [0.022, 0.017, 0.013], cut: 2 },
    { [MSH]: [0.11, 0.084, 0.036], [MPA]: [0.03, 0.022, 0.015], [MSK]: [0.58, 0.53, 0.45], [MSO]: [0.02, 0.015, 0.011], [MBE]: [0.03, 0.022, 0.016], [MTI]: [0.03, 0.03, 0.03], [MSC]: [0.02, 0.02, 0.02], [MSL]: [0.02, 0.018, 0.015], hair: [0.025, 0.02, 0.015], cut: 0 },
    { [MSH]: [0.085, 0.095, 0.11], [MPA]: [0.018, 0.018, 0.022], [MSK]: [0.6, 0.56, 0.48], [MSO]: [0.016, 0.013, 0.011], [MBE]: [0.03, 0.022, 0.016], [MTI]: [0.08, 0.06, 0.02], [MSC]: [0.02, 0.02, 0.02], [MSL]: [0.02, 0.018, 0.015], hair: [0.06, 0.056, 0.05], cut: 1, pin: 1 },
  ];
  // the light: the tubes overhead, a little toward us; per page (dark / light) how it is exposed. Tuned against the scene.
  const LV = nrm([0.12, 0.93, 0.3]);
  const HV = nrm([LV[0], LV[1], LV[2] + 1]);
  const LOOK = {
    D: { key: [1.0, 0.93, 0.74], sky: [0.2, 0.19, 0.15], gnd: [0.055, 0.045, 0.026], rim: [0.75, 0.74, 0.6], E: 1.3, G: 0.78, lift: 0.01, gam: 0.62, face: 1.8 },
    L: { key: [1.18, 1.12, 0.98], sky: [0.12, 0.115, 0.1], gnd: [0.035, 0.03, 0.022], rim: [0.14, 0.14, 0.12], E: 1.35, G: 0.88, lift: 0.0, gam: 0.56, face: 1.45, cloth: 0.3 },
  };
  const GRADE = 0.34; // the tape's colour (as in backrooms.js): washed a third of the way toward a yellow-green grey
  function tone(Lk, r, g, b, o, out) {
    const T = Lk.lut || (Lk.lut = Float32Array.from({ length: 1025 }, (_, i) => Lk.lift + (Lk.G - Lk.lift) * Math.pow(1 - Math.exp(-Lk.E * (i / 256)), Lk.gam)));
    const t = (v) => { v = v * 256; if (v <= 0) return T[0]; if (v >= 1024) return T[1024]; const i = v | 0; return T[i] + (T[i + 1] - T[i]) * (v - i); };
    r = t(r); g = t(g); b = t(b);
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    out[o] = r + (l * 1.02 - r) * GRADE; out[o + 1] = g + (l * 1.05 - g) * GRADE; out[o + 2] = b + (l * 0.8 - b) * GRADE;
  }

  // ---- the rasteriser: primitives in view space laid into a depth buffer of normals ----------------------------
  function mkBuf(x0, x1, y0, y1, k) {
    const W = Math.max(2, Math.ceil((x1 - x0) * k)), H = Math.max(2, Math.ceil((y1 - y0) * k)), n = W * H;
    return { x0, y0, y1, k, W, H, n, Z: new Float32Array(n).fill(-1e9), NX: new Float32Array(n), NY: new Float32Array(n), NZ: new Float32Array(n), T: new Int16Array(n).fill(-1) };
  }
  function rows(b, ya, yb) { return [Math.max(0, Math.floor((b.y1 - yb) * b.k)), Math.min(b.H - 1, Math.ceil((b.y1 - ya) * b.k))]; }
  function cols(b, xa, xb) { return [Math.max(0, Math.floor((xa - b.x0) * b.k)), Math.min(b.W - 1, Math.ceil((xb - b.x0) * b.k))]; }
  /** A tapered capsule from A to B (view space). */
  function rCap(b, id, A, B, ra, rb) {
    const r = Math.max(ra, rb), k = b.k, W = b.W, Z = b.Z;
    let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) { if (B[2] > A[2]) { A = B; ra = rb; } dx = dy = dz = 0; rb = ra; } // pointing straight at us: its near end
    const il2 = l2 >= 1e-9 ? 1 / l2 : 0;
    const [i0, i1] = cols(b, Math.min(A[0], A[0] + dx) - r, Math.max(A[0], A[0] + dx) + r), [j0, j1] = rows(b, Math.min(A[1], A[1] + dy) - r, Math.max(A[1], A[1] + dy) + r);
    for (let j = j0; j <= j1; j++) {
      const ry = b.y1 - (j + 0.5) / k - A[1];
      for (let i = i0; i <= i1; i++) {
        const rx = b.x0 + (i + 0.5) / k - A[0];
        let t = (rx * dx + ry * dy) * il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = rx - dx * t, ey = ry - dy * t, rr = ra + (rb - ra) * t, d2 = ex * ex + ey * ey;
        if (d2 >= rr * rr) continue;
        const h = Math.sqrt(rr * rr - d2), z = A[2] + dz * t + h, o = j * W + i;
        if (z <= Z[o]) continue;
        Z[o] = z; b.NX[o] = ex / rr; b.NY[o] = ey / rr; b.NZ[o] = h / rr; b.T[o] = id;
      }
    }
  }
  /** An ellipsoid: centre C, radii R along the unit axes E = [e1, e2, e3] (view space); exact for our parallel rays. */
  function rEll(b, id, C, R, E) {
    const k = b.k, W = b.W, Z = b.Z;
    const hx = Math.hypot(R[0] * E[0][0], R[1] * E[1][0], R[2] * E[2][0]), hy = Math.hypot(R[0] * E[0][1], R[1] * E[1][1], R[2] * E[2][1]);
    const B0 = E[0][2] / R[0], B1 = E[1][2] / R[1], B2 = E[2][2] / R[2], BB = B0 * B0 + B1 * B1 + B2 * B2;
    const [i0, i1] = cols(b, C[0] - hx, C[0] + hx), [j0, j1] = rows(b, C[1] - hy, C[1] + hy);
    for (let j = j0; j <= j1; j++) {
      const Y = b.y1 - (j + 0.5) / k - C[1];
      for (let i = i0; i <= i1; i++) {
        const X = b.x0 + (i + 0.5) / k - C[0];
        const a0 = (X * E[0][0] + Y * E[0][1] - C[2] * E[0][2]) / R[0], a1 = (X * E[1][0] + Y * E[1][1] - C[2] * E[1][2]) / R[1], a2 = (X * E[2][0] + Y * E[2][1] - C[2] * E[2][2]) / R[2];
        const AB = a0 * B0 + a1 * B1 + a2 * B2, disc = AB * AB - BB * (a0 * a0 + a1 * a1 + a2 * a2 - 1);
        if (disc <= 0) continue;
        const z = (-AB + Math.sqrt(disc)) / BB, o = j * W + i;
        if (z <= Z[o]) continue;
        const q0 = (a0 + B0 * z) / R[0], q1 = (a1 + B1 * z) / R[1], q2 = (a2 + B2 * z) / R[2];
        let nx = q0 * E[0][0] + q1 * E[1][0] + q2 * E[2][0], ny = q0 * E[0][1] + q1 * E[1][1] + q2 * E[2][1], nz = q0 * E[0][2] + q1 * E[1][2] + q2 * E[2][2];
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        Z[o] = z; b.NX[o] = nx; b.NY[o] = ny; b.NZ[o] = nz; b.T[o] = id;
      }
    }
  }
  /** A swept ellipse up the body's own axis: at height y the section is (X / w)² + ((Z - zc) / d)² = 1 in body space,
   * seen turned by the yaw (c, s). prof(y) → [w, d, zc]. */
  function rSwp(b, id, ya, yb, prof, c, s) {
    const k = b.k, W = b.W, Z = b.Z, e = 0.5 / k, [j0, j1] = rows(b, ya, yb);
    for (let j = j0; j <= j1; j++) {
      const y = b.y1 - (j + 0.5) / k;
      if (y < ya || y > yb) continue;
      const P = prof(y), Pa = prof(y + e), Pb = prof(y - e), w = P[0], d = P[1], zc = P[2];
      if (w < 1e-4 || d < 1e-4) continue;
      const wp = (Pa[0] - Pb[0]) / (2 * e), dp = (Pa[1] - Pb[1]) / (2 * e), zp = (Pa[2] - Pb[2]) / (2 * e);
      const iw = 1 / (w * w), id2 = 1 / (d * d), A = s * s * iw + c * c * id2, xc = zc * s, hx = Math.hypot(w * c, d * s);
      const [i0, i1] = cols(b, xc - hx, xc + hx);
      for (let i = i0; i <= i1; i++) {
        const x = b.x0 + (i + 0.5) / k, xs = x * s - zc;
        const Bq = -2 * x * c * s * iw + 2 * c * xs * id2, Cq = x * x * c * c * iw + xs * xs * id2 - 1, disc = Bq * Bq - 4 * A * Cq;
        if (disc <= 0) continue;
        const z = (-Bq + Math.sqrt(disc)) / (2 * A), o = j * W + i;
        if (z <= Z[o]) continue;
        const X = x * c - z * s, Zr = x * s + z * c - zc; // body space, relative to the section's centre
        const gX = X * iw, gZ = Zr * id2, gY = -(X * X * wp) / (w * w * w) - (Zr * zp) * id2 - (Zr * Zr * dp) / (d * d * d);
        let nx = gX * c + gZ * s, ny = gY, nz = -gX * s + gZ * c;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        Z[o] = z; b.NX[o] = nx; b.NY[o] = ny; b.NZ[o] = nz; b.T[o] = id;
      }
    }
  }
  // view: turned by the yaw a about the vertical (a = 0: facing us; π: its back to us; π/2: facing screen right)
  const toV = (P, c, s) => [P[0] * c + P[2] * s, P[1], -P[0] * s + P[2] * c];

  /** Lay a figure (a list of body-space primitives) into a buffer seen at yaw a; k px per metre. Yields now and then. */
  function* raster(fig, a, k, pad) {
    const c = Math.cos(a), s = Math.sin(a);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const ext = (P, r) => { const v = toV(P, c, s); x0 = Math.min(x0, v[0] - r); x1 = Math.max(x1, v[0] + r); y0 = Math.min(y0, v[1] - r); y1 = Math.max(y1, v[1] + r); };
    for (const p of fig.prims) {
      if (p.t === 0) { ext(p.a, Math.max(p.ra, p.rb)); ext(p.b, Math.max(p.ra, p.rb)); }
      else if (p.t === 1) ext(p.c, Math.max(p.r[0], p.r[1], p.r[2]));
      else for (let y = p.ya; y <= p.yb + 1e-6; y += (p.yb - p.ya) / 8) { const P = p.prof(y); ext([0, y, P[2]], Math.max(P[0], P[1])); }
    }
    pad = pad || 0.02;
    const b = mkBuf(x0 - pad, x1 + pad, Math.max(-0.03, y0 - pad), y1 + pad, k);
    b.c = c; b.s = s; b.fig = fig;
    let n = 0;
    for (let id = 0; id < fig.prims.length; id++) {
      const p = fig.prims[id];
      if (p.t === 0) rCap(b, id, toV(p.a, c, s), toV(p.b, c, s), p.ra, p.rb);
      else if (p.t === 1) rEll(b, id, toV(p.c, c, s), p.r, p.E.map((e) => toV(e, c, s)));
      else rSwp(b, id, p.ya, p.yb, p.prof, c, s);
      if ((n += 1) % (k > 300 ? 1 : 3) === 0) yield;
    }
    return b;
  }

  /** Ambient occlusion and the tubes' contact shadows, read off the depth buffer. */
  function* occlusion(b) {
    const { W, H, k, Z, T, NX, NY, NZ } = b, n = W * H, ao = new Float32Array(n), sh = new Float32Array(n);
    const DIRS = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];
    const RAD = [0.018, 0.045, 0.1].map((r) => Math.max(1.2, r * k));
    const lxy = Math.hypot(LV[0], LV[1]), sx = LV[0] / lxy, sy = LV[1] / lxy, rz = LV[2] / lxy, maxS = Math.max(4, 0.28 * k), stp = Math.max(1, maxS / 36);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const o = j * W + i;
        if (T[o] < 0) continue;
        const z0 = Z[o], nz = Math.max(0.3, NZ[o]), tx = -NX[o] / nz, ty = NY[o] / nz; // the tangent plane's slope (per metre, y down in rows)
        let occ = 0, cnt = 0;
        for (let r = 0; r < 3; r++) {
          const R = RAD[r], dm = R / k;
          for (let q = (r & 1); q < 8; q += 1 + (r === 0 ? 1 : 0)) {
            const ii = Math.round(i + DIRS[q][0] * R), jj = Math.round(j + DIRS[q][1] * R);
            cnt++;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            const zs = Z[jj * W + ii];
            if (zs < -1e8) continue;
            const dz = zs - (z0 + (tx * DIRS[q][0] + ty * DIRS[q][1]) * dm) - 0.002;
            if (dz <= 0) continue;
            const sl = dz / dm;
            occ += (sl / Math.sqrt(1 + sl * sl)) / (1 + (dz / 0.12) * (dz / 0.12));
          }
        }
        ao[o] = Math.max(0.12, 1 - (1.25 * occ) / cnt);
        let sd = 0;
        for (let t = 1.5; t < maxS; t += stp) {
          const ii = Math.round(i + sx * t), jj = Math.round(j - sy * t);
          if (ii < 0 || jj < 0 || ii >= W) break;
          const zs = Z[jj * W + ii];
          if (zs < -1e8) continue;
          const over = zs - (z0 + (rz * t) / k) - 0.005;
          if (over > 0) { sd = Math.max(sd, cl(over / 0.025) * (1 - (t / maxS) * 0.5)); if (sd > 0.98) break; }
        }
        sh[o] = 1 - sd * 0.88;
      }
      if ((j + 1) % Math.max(1, Math.round(1600 / W)) === 0) yield;
    }
    return [ao, sh];
  }

  /** Shade every covered sample; returns the colour buffer (display values 0..1, coverage in alpha). */
  function* shade(b, mode, out) {
    const { W, H, k, Z, T, NX, NY, NZ } = b, c = b.c, s = b.s, fig = b.fig, Lk = LOOK[mode];
    const [ao, sh] = yield* occlusion(b);
    const col = new Float32Array(W * H * 4), alb = [0, 0, 0], e = 0.6 / k, hgt = fig.hgt || 1.75;
    for (let j = 0; j < H; j++) {
      const y = b.y1 - (j + 0.5) / k;
      for (let i = 0; i < W; i++) {
        const o = j * W + i, id = T[o];
        if (id < 0) continue;
        const p = fig.prims[id], x = b.x0 + (i + 0.5) / k, z = Z[o];
        let nx = NX[o], ny = NY[o], nz = NZ[o];
        // body space: where on the figure, and the normal there
        const X = x * c - z * s, Zb = x * s + z * c;
        let bx = nx * c - nz * s, by = ny, bz = nx * s + nz * c, cav = 0;
        if (p.h) {
          const h0 = p.h(X, y, Zb, p), gx = (p.h(X + e, y, Zb, p) - h0) / e, gy = (p.h(X, y + e, Zb, p) - h0) / e, gz = (p.h(X, y, Zb + e, p) - h0) / e;
          const gn = gx * bx + gy * by + gz * bz, f = Math.min(1, NZ[o] * 3 + 0.2);
          bx -= (gx - gn * bx) * f; by -= (gy - gn * by) * f; bz -= (gz - gn * bz) * f;
          const l = Math.hypot(bx, by, bz); bx /= l; by /= l; bz /= l;
          nx = bx * c + bz * s; ny = by; nz = -bx * s + bz * c;
          cav = h0;
        }
        const m = p.mf ? p.mf(X, y, Zb, p) : p.m, mt = MAT[m], src = out[m], cm = m === MSK || m === MSC ? 1 : Lk.cloth || 1;
        if (Array.isArray(src[0])) { const st = p.tx ? p.tx(X, y, Zb, p) : 0; alb[0] = mix(src[0][0], src[1][0], st); alb[1] = mix(src[0][1], src[1][1], st); alb[2] = mix(src[0][2], src[1][2], st); }
        else { alb[0] = src[0]; alb[1] = src[1]; alb[2] = src[2]; if (p.tx) { const t = p.tx(X, y, Zb, p); alb[0] *= t; alb[1] *= t; alb[2] *= t; } }
        if (out.pin && m === MSH) { const t = 0.7 + 0.3 * sm(0.75, 0.95, Math.abs(Math.sin((X * 0.9 + Zb * 0.6) * 150))); alb[0] *= t; alb[1] *= t; alb[2] *= t; } // pinstripes
        const gr = (1 + mt.gr * (vn(X * mt.gx + Zb * mt.gx * 0.7, y * mt.gy, m * 13) * 2 - 1) + mt.gr * 0.6 * (fb(X * 30 + Zb * 20, y * 30, m) - 0.5)) * cm;
        const a = ao[o] * (cav < 0 ? 1 - Math.min(0.55, -cav * 90) : 1), sd = sh[o];
        const dl = nx * LV[0] + ny * LV[1] + nz * LV[2], dif = cl((dl + mt.w) / (1 + mt.w));
        const fall = 0.4 + 0.6 * sm(-0.1 * hgt, 1.0 * hgt, y), hemi = 0.5 + 0.5 * ny;
        const fr = cl(1 - nz), rim = fr * fr * fr * cl(0.25 + ny * 0.9) * (0.35 + 0.65 * a) * (0.3 + 0.7 * sm(0.2 * hgt, 0.85 * hgt, y));
        const nh = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), sp = mt.ks * Math.pow(nh, mt.sh) * sd * fall;
        const sn = mt.sn * fr * fr * cl(0.4 + ny) * fall * sd;
        const kd = dif * sd * fall * (0.6 + 0.4 * a);
        const o4 = o * 4;
        const r = alb[0] * gr * ((Lk.gnd[0] + (Lk.sky[0] - Lk.gnd[0]) * hemi) * a + Lk.key[0] * kd) + (Lk.rim[0] * rim + sn * Lk.key[0]) * (0.4 + alb[0]) + sp * Lk.key[0];
        const g = alb[1] * gr * ((Lk.gnd[1] + (Lk.sky[1] - Lk.gnd[1]) * hemi) * a + Lk.key[1] * kd) + (Lk.rim[1] * rim + sn * Lk.key[1]) * (0.4 + alb[1]) + sp * Lk.key[1];
        const bl = alb[2] * gr * ((Lk.gnd[2] + (Lk.sky[2] - Lk.gnd[2]) * hemi) * a + Lk.key[2] * kd) + (Lk.rim[2] * rim + sn * Lk.key[2]) * (0.4 + alb[2]) + sp * Lk.key[2];
        tone(Lk, r, g, bl, o4, col); col[o4 + 3] = 1;
      }
      if ((j + 1) % Math.max(1, Math.round(1600 / W)) === 0) yield;
    }
    return col;
  }
  let UID = 0;
  /** Down to the sprite: average the samples (ss × ss), soften a little sideways (the tape), into a canvas. */
  function* finish(b, col, ss, soft) {
    const W = Math.floor(b.W / ss), H = Math.floor(b.H / ss), n = W * H, pm = new Float32Array(n * 4), q = 1 / (ss * ss), ch = Math.max(1, Math.round(9000 / (W * ss * ss)));
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (i === 0 && j % ch === ch - 1) yield;
      let r = 0, g = 0, bl = 0, a = 0;
      for (let v = 0; v < ss; v++) for (let u = 0; u < ss; u++) { const o = ((j * ss + v) * b.W + i * ss + u) * 4, al = col[o + 3]; r += col[o] * al; g += col[o + 1] * al; bl += col[o + 2] * al; a += al; }
      const o = (j * W + i) * 4; pm[o] = r * q; pm[o + 1] = g * q; pm[o + 2] = bl * q; pm[o + 3] = a * q;
    }
    const cv = mk(W, H), cx = cv.getContext('2d'), im = cx.createImageData(W, H), d = im.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4, oa = i > 0 ? o - 4 : o, ob = i < W - 1 ? o + 4 : o;
      const f = (ch) => pm[o + ch] * (1 - soft * 0.5) + (pm[oa + ch] + pm[ob + ch]) * soft * 0.25;
      const a = f(3);
      if (a < 0.004) continue;
      d[o] = (f(0) / a) * 255; d[o + 1] = (f(1) / a) * 255; d[o + 2] = (f(2) / a) * 255; d[o + 3] = Math.min(1, a) * 255;
    }
    cx.putImageData(im, 0, 0);
    cv.ox = -b.x0 * b.k / ss; cv.oy = b.y1 * b.k / ss; // where the figure's own origin (its feet, on the floor) falls in the sprite
    cv.px = b.k / ss; // px per metre
    cv.uid = ++UID;
    return cv;
  }

  // ---- the people ---------------------------------------------------------------------------------------------
  // Body space: X across (screen right when it faces us), Y up from the floor, Z the way it faces.
  const capP = (a, b, ra, rb, m, o) => Object.assign({ t: 0, a, b, ra, rb, m }, o);
  const ellP = (c, r, E, m, o) => Object.assign({ t: 1, c, r, E: E || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], m }, o);
  const swpP = (ya, yb, prof, m, o) => Object.assign({ t: 2, ya, yb, prof, m }, o);
  const MAN = { // the shape of a man, nearly: tall, the arms and legs too long, the trunk too thin, the shoulders rolled forward
    hgt: 1.9, hipY: 0.955, hx: 0.074, l1: 0.445, l2: 0.455, ank: 0.085, belt: 1.05, bh: 0.038, yoke: 1.385, blade: 1.32, collar: 1.505,
    sh: [0.14, 1.4], shz: 0.034, l3: 0.37, l4: 0.36, sleeve: 0.15, neckR: 0.037, kneeBack: 1, long: 1.45,
    w: curve([[0.82, 0.124], [0.92, 0.133], [1.0, 0.128], [1.05, 0.12], [1.13, 0.11], [1.22, 0.116], [1.31, 0.126], [1.38, 0.134], [1.42, 0.132], [1.45, 0.114], [1.475, 0.084], [1.495, 0.058], [1.515, 0.046]]),
    d: curve([[0.82, 0.08], [0.92, 0.09], [1.05, 0.078], [1.15, 0.072], [1.26, 0.08], [1.36, 0.084], [1.44, 0.076], [1.49, 0.054], [1.515, 0.044]]),
    zc: curve([[0.82, -0.008], [0.92, -0.014], [1.05, 0.0], [1.16, 0.004], [1.28, 0.012], [1.37, 0.026], [1.44, 0.044], [1.515, 0.058]]),
  };
  const KID = { // a child, nearly: thin, the arms too long, the head too big and too heavy for its neck
    hgt: 1.2, hipY: 0.58, hx: 0.056, l1: 0.27, l2: 0.27, ank: 0.06, belt: 0.665, collar: 0.935, sh: [0.11, 0.885], shz: 0.022, l3: 0.235, l4: 0.225, neckR: 0.03, long: 1.35,
    hem: 0.44, sock: 0.29,
    w: curve([[0.49, 0.098], [0.56, 0.106], [0.64, 0.1], [0.72, 0.098], [0.8, 0.106], [0.85, 0.11], [0.875, 0.104], [0.9, 0.088], [0.918, 0.064], [0.94, 0.04]]),
    d: curve([[0.49, 0.064], [0.6, 0.07], [0.7, 0.072], [0.8, 0.068], [0.88, 0.06], [0.94, 0.036]]),
    zc: curve([[0.49, -0.008], [0.6, 0.0], [0.68, 0.012], [0.8, 0.016], [0.88, 0.026], [0.94, 0.034]]),
  };
  // folds, seams and creases: height fields over the cloth (metres; negative: a crease's valley)
  /** The trouser leg (a capsule from the hip or knee down): bunching behind the knee, the break over the shoe, a long drape. */
  function hLeg(X, Y, Z, p) {
    const rx = X - p.a[0], ry = Y - p.a[1], rz = Z - p.a[2], u = rx * p.ux + ry * p.uy + rz * p.uz;
    const px = rx - p.ux * u, pz = rz - p.uz * u, ang = Math.atan2(px * p.sd, pz); // 0 at the front, ±π at the back
    let h = 0;
    if (p.kn != null) { const dk = u - p.kn, A = 0.0045 * gs(dk, 0.07) * (0.25 + 0.75 * sm(0.8, 2.6, Math.abs(ang)) + p.bend * 2) * (0.4 + 0.6 * vn(ang * 2 + p.sd * 5, u * 9, 4)); if (A > 1e-5) h += A * (Math.abs(Math.sin(dk * 58 + ang * ang * 0.45 + p.sd + 1.5 * vn(ang * 3, dk * 20, 2))) - 0.55); }
    if (p.hm != null) { const dh = p.hm - u, A = 0.006 * gs(dh - 0.04, 0.045); if (A > 1e-5) h += A * (Math.abs(Math.sin(dh * 60 + 1.2 * Math.sin(ang * 2 + p.sd))) - 0.55); }
    h += 0.0024 * Math.sin(ang * 2.6 + 3 * vn(u * 4, p.sd * 3, 3) + p.sd) * (1 - gs(ang, 0.3));
    if (p.crease) h += 0.0016 * gs(ang, 0.09); // the pressed crease down the front
    h -= 0.0009 * gs(Math.abs(ang) - 1.57, 0.06); // the side seam
    return h;
  }
  /** The man's shirt (and below the belt, his trousers): yoke, pleat, shoulder blades, blousing over the belt, a side
   * seam, the placket and a pocket in front, pockets and a seam on the seat. */
  function hTorso(X, Y, Z, p) {
    const D = p.D, zc = D.zc(Y), front = Z > zc, ax = Math.abs(X);
    let h = 0;
    if (Y > D.belt + D.bh) {
      if (!front) {
        h += 0.0065 * gs(ax - 0.075, 0.045) * gs(Y - D.blade, 0.07); // shoulder blades
        h -= 0.0028 * gs(X, 0.016) * sm(D.belt, D.belt + 0.12, Y) * (1 - sm(D.yoke - 0.06, D.yoke, Y)); // the spine's groove
        const ys = D.yoke + 0.01 * Math.cos(X * 9);
        h -= 0.0026 * gs(Y - ys, 0.0032); if (Y > ys) h += 0.0008;
        if (Y < ys) h -= 0.0018 * gs(ax - 0.017, 0.0032); // the box pleat
        const dg = sm(D.belt + 0.1, D.blade - 0.02, Y) * (1 - sm(D.blade, D.yoke, Y)) * sm(0.35, 0.75, vn(X * 9 + 3, Y * 6, 8)); // pulled toward the waist from the blades
        if (dg > 0) h += 0.0026 * dg * (Math.abs(Math.sin((ax * 0.8 + Y) * 30 + vn(X * 7, Y * 7, 9) * 3)) - 0.55);
      } else {
        if (D.vee && Y > D.yoke - 0.02) { // at the throat: the hollow at the base of the neck, the collarbones standing out, the shirt's edge lifting
          const vw = vNeck(Y, D), ax2 = Math.abs(X);
          h -= 0.006 * gs(Math.hypot(X, (Y - D.collar + 0.03) * 1.3), 0.014);
          const cy = D.collar - 0.032 + 0.12 * (ax2 - 0.015); // each collarbone, rising a little toward the shoulder
          if (ax2 > 0.012) h += 0.0042 * gs(Y - cy, 0.0065) * sm(0.012, 0.03, ax2);
          h += 0.0018 * gs(X, 0.007) * sm(D.collar - 0.035, D.collar - 0.09, Y); // the breastbone
          h += 0.0022 * gs(ax2 - vw, 0.004) * sm(D.yoke, D.yoke + 0.02, Y);
        }
        h += 0.0016 * gs(X, 0.014) * sm(D.belt + 0.05, D.belt + 0.1, Y); // the placket
        for (let k = 0; k < 5; k++) h += 0.0014 * gs(X, 0.0045) * gs(Y - (D.belt + 0.12 + k * 0.088), 0.0045); // buttons
        const px = X - 0.085; // the breast pocket
        if (Y > 1.22 && Y < 1.33) h -= 0.0012 * (gs(px - 0.045, 0.003) + gs(px + 0.045, 0.003)) * (Math.abs(px) < 0.05 ? 1 : 0);
        if (Math.abs(px) < 0.048) h -= 0.0012 * gs(Y - 1.22, 0.003) - 0.0006 * sm(1.21, 1.24, Y) * (1 - sm(1.3, 1.33, Y));
        h += 0.004 * gs(ax - 0.07, 0.05) * gs(Y - 1.28, 0.06); // the chest under it
      }
      const bl = (1 - sm(D.belt + 0.03, D.belt + 0.15 + 0.05 * vn(X * 11, 1, 6), Y)) * (0.35 + 0.65 * vn(X * 16 + Z * 9, 2, 7)); // blousing, all round, uneven
      if (bl > 0) h += 0.0065 * bl * (Math.abs(Math.sin(Math.atan2(X, Z - zc) * 7 + 2.6 * vn(X * 8, Y * 5, 5) + (Y - D.belt) * 14)) - 0.5);
      h += 0.0042 * gs(Y - (D.belt + D.bh + 0.012 + 0.008 * Math.cos(X * 14)), 0.01); // a sag just over the belt
      h -= 0.0012 * gs(ax - D.w(Y) * 0.98, 0.006) * (1 - gs(Z - zc, 0.04)); // side seams (seen side-on)
      h += 0.0025 * gs(Y - (D.sh[1] - 0.06), 0.03) * gs(ax - 0.15, 0.04); // folds from the armpit
      h += 0.0034 * (Math.abs(Math.sin(X * 44 + 2.4 * vn(X * 6, Y * 3, 12) + (Z > zc ? 0 : 1.7))) - 0.5) * sm(D.belt + 0.12, D.yoke - 0.04, Y) * (1 - sm(D.yoke - 0.04, D.yoke + 0.03, Y)); // the cloth hanging slack off the shoulders
    } else if (Y > D.belt) { // the belt: a raised band, its loops
      h += 0.003 * sm(D.belt, D.belt + 0.004, Y) * (1 - sm(D.belt + D.bh - 0.004, D.belt + D.bh, Y));
      for (const lx of [0.055, 0.14]) h += 0.0022 * gs(ax - lx, 0.007);
      if (front) h += 0.002 * gs(X, 0.03) * gs(Y - D.belt - D.bh / 2, 0.016); // the buckle
    } else { // trousers: the seat's pockets and seam, the fly
      if (!front) {
        h += 0.011 * gs(ax - 0.066, 0.055) * gs(Y - (D.hipY - 0.025), 0.075); // the seat
        h -= 0.003 * gs(Y - (D.hipY - 0.1) - 0.025 * Math.cos(ax * 22), 0.014) * gs(ax - 0.07, 0.05); // where it meets the thigh
        h -= 0.0024 * gs(X, 0.004) * (1 - sm(D.belt - 0.015, D.belt, Y));
        const pk = ax > 0.035 && ax < 0.125 && Y > D.belt - 0.135 && Y < D.belt - 0.03;
        if (pk) h -= 0.0014 * (gs(ax - 0.035, 0.0035) + gs(ax - 0.125, 0.0035) + gs(Y - (D.belt - 0.135), 0.0035) + gs(Y - (D.belt - 0.03), 0.0035));
        h += 0.0035 * gs(Y - (D.belt - 0.03), 0.02); // the waistband
      } else {
        h -= 0.0018 * gs(X - 0.012, 0.003) * sm(D.hipY - 0.06, D.hipY, Y);
        h += 0.0035 * gs(Y - (D.belt - 0.03), 0.02);
        h += 0.003 * (Math.abs(Math.sin(X * 60 + 1.3)) - 0.5) * gs(Y - (D.hipY - 0.04), 0.04) * gs(ax - 0.04, 0.05); // creased at the crotch
      }
    }
    return h;
  }
  const vNeck = (Y, D) => 0.05 * sm(D.yoke + 0.01, D.collar - 0.01, Y); // how wide the shirt hangs open at the throat
  const mTorso = (X, Y, Z, p) => { const D = p.D; if (D.vee && Y > D.yoke && Z > D.zc(Y) && Math.abs(X) < vNeck(Y, D)) return MSK; return Y > D.belt + D.bh ? MSH : Y > D.belt ? MBE : MPA; };
  /** A sleeve: the hem's turned band, folds out of the armpit. */
  function hSleeve(X, Y, Z, p) {
    const rx = X - p.a[0], ry = Y - p.a[1], rz = Z - p.a[2], u = rx * p.ux + ry * p.uy + rz * p.uz, L = p.len;
    let h = 0.0028 * sm(L - 0.026, L - 0.021, u) - 0.002 * gs(u - (L - 0.024), 0.0028);
    if (p.slack) h += 0.0045 * (Math.abs(Math.sin(Math.atan2(rx - p.ux * u, rz - p.uz * u) * 4 + vn(u * 14, p.sd, 6) * 2.5)) - 0.55) * sm(0.03, 0.09, u) - 0.0022 * gs(u - 0.045, 0.004); // hanging in loose folds; the dropped seam
    h += 0.0035 * (Math.abs(Math.sin(u * 52 + (rx * p.sd) * 40 + p.sd)) - 0.5) * sm(0.02, 0.08, u) * (1 - sm(L - 0.05, L - 0.02, u));
    return h;
  }
  /** The child's top: horizontal stripes that follow the body round, ribbing at the neck and cuffs. */
  const txStripe = (X, Y, Z, p) => { const v = Math.sin((Y + 0.006 * Math.cos(X * 18)) * TAU * 17) ; return sm(-0.25, 0.25, v); };
  const txStripeArm = (X, Y, Z, p) => { const rx = X - p.a[0], ry = Y - p.a[1], rz = Z - p.a[2], u = rx * p.ux + ry * p.uy + rz * p.uz; return sm(-0.25, 0.25, Math.sin(u * TAU * 17 + p.sd)); };
  function hKidTop(X, Y, Z, p) {
    const D = p.D; let h = 0.0018 * Math.sin((Y + 0.006 * Math.cos(X * 18)) * TAU * 17) * 0.4;
    h += 0.004 * (1 - sm(D.belt + 0.02, D.belt + 0.1, Y)) * (Math.abs(Math.sin(Math.atan2(X, Z) * 8 + vn(X * 9, Y * 5, 4) * 2)) - 0.55);
    h += 0.0015 * Math.sin(X * 120) * gs(Y - D.collar + 0.012, 0.008);
    return h;
  }
  const mKid = (X, Y, Z, p) => (Y > p.D.belt ? MST : MSR);
  function hShorts(X, Y, Z, p) {
    const rx = X - p.a[0], ry = Y - p.a[1], rz = Z - p.a[2], u = rx * p.ux + ry * p.uy + rz * p.uz;
    return 0.003 * (Math.abs(Math.sin(u * 70 + Math.atan2(rx, rz) * 2 + p.sd)) - 0.55) + 0.0025 * sm(p.len - 0.02, p.len - 0.014, u);
  }
  function hSock(X, Y, Z, p) { return 0.0012 * Math.sin(Math.atan2(X - p.a[0], Z - p.a[2]) * 22) + 0.003 * (Math.abs(Math.sin(Y * 160 + Math.sin(X * 80))) - 0.5) * gs(Y - p.top + 0.08, 0.06); }
  const hCollar = (X, Y, Z, p) => -0.0016 * gs(Y - p.fold, 0.0028) + 0.001 * sm(p.fold, p.fold + 0.004, Y);
  /** Prepare a capsule's axis for the height fields above. */
  function axis(p) { const d = sub(p.b, p.a), l = Math.hypot(d[0], d[1], d[2]) || 1; p.ux = d[0] / l; p.uy = d[1] / l; p.uz = d[2] / l; p.len = l; return p; }
  function ik2(h, t, l1, l2, fwd) { // the knee (or elbow) between h and t, bending toward fwd
    const d = sub(t, h), L = Math.hypot(d[0], d[1], d[2]), Lc = Math.min(L, l1 + l2 - 1e-4), u = scl(d, 1 / (L || 1));
    const a = (l1 * l1 + Lc * Lc - l2 * l2) / (2 * Lc), r = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const side = nrm(sub(fwd, scl(u, fwd[0] * u[0] + fwd[1] * u[1] + fwd[2] * u[2])));
    return add(add(h, scl(u, a)), scl(side, r));
  }

  /**
   * A pose: legs[2] = { hip, knee, ank, pitch, toe (turned out) }, arms[2] = { sh, el, wr, wrong }; root at the floor.
   * Standing: the feet together, the knees locked back further than knees go, the arms hanging, long. wrong: the arm
   * (-1 / 1) whose elbow is bent the wrong way.
   */
  function standPose(D, o) {
    o = o || {};
    const sc = D.hgt / 1.8;
    const legs = [-1, 1].map((d) => {
      const hip = [d * D.hx, D.hipY, -0.004], ank = [d * (D.hx + 0.012 * sc), D.ank, -0.01];
      return { d, hip, ank, knee: ik2(hip, ank, D.l1, D.l2, [0, 0, D.kneeBack ? -1 : 1]), pitch: 0, toe: d * 0.1, bend: 0 };
    });
    return { legs, arms: hangArms(D, 0, 0, o.wrong || 0) };
  }
  function hangArms(D, swing, ph, wrong) {
    return [-1, 1].map((d) => {
      const sh = [d * D.sh[0], D.sh[1], D.shz], a = swing * Math.sin(ph + (d > 0 ? 0 : Math.PI)), sc = D.hgt / 1.8;
      const el = add(sh, [d * 0.018 * sc, -D.l3 * Math.cos(a), D.l3 * Math.sin(a) + 0.012]);
      let wr;
      if (wrong === d) wr = add(el, [d * 0.16 * sc, -D.l4 * 0.92, -0.075]); // the elbow bent the wrong way: the forearm kicked out and back
      else { const b2 = a * 1.25 + 0.08; wr = add(el, [d * 0.006 * sc, -D.l4 * Math.cos(b2), D.l4 * Math.sin(b2)]); }
      return { d, sh, el, wr, wrong: wrong === d };
    });
  }
  /** A hand hanging from the wrist: the palm, four long fingers (two joints each, curling in), the thumb. k: size, L: finger length. */
  function hand(P, wr, el, d, k, L, spread) {
    const down = nrm(sub(wr, el)), E = ori(down, [d, 0, 0]), front = scl(E[0], -d), out = E[1];
    const pc = add(wr, scl(down, 0.046 * k));
    P.push(ellP(pc, [0.039 * k, 0.0135 * k, 0.052 * k], E, MSK));
    for (let f = 0; f < 4; f++) {
      const u = (f - 1.5) / 1.5, base = add(add(pc, scl(down, 0.042 * k)), scl(front, u * 0.026 * k));
      const l1 = (0.05 + 0.012 * (1 - Math.abs(u * 0.8))) * k * L, l2 = (0.046 + 0.01 * (1 - Math.abs(u))) * k * L;
      const d1 = nrm(add(add(down, scl(front, u * (spread || 0.1))), scl(out, -(0.12 + 0.05 * f))));
      const j1 = add(base, scl(d1, l1)), d2 = nrm(add(d1, scl(out, -0.4 - 0.1 * f))), tip = add(j1, scl(d2, l2));
      P.push(capP(base, j1, 0.0102 * k, 0.0086 * k, MSK)); P.push(capP(j1, tip, 0.0086 * k, 0.006 * k, MSK));
    }
    const tb = add(add(pc, scl(front, 0.03 * k)), scl(down, -0.012 * k)), td = nrm(add(add(down, scl(front, 0.45)), scl(out, -0.35)));
    const tj = add(tb, scl(td, 0.045 * k));
    P.push(capP(tb, tj, 0.0115 * k, 0.0092 * k, MSK)); P.push(capP(tj, add(tj, scl(nrm(add(td, scl(out, -0.4))), 0.036 * k * L)), 0.0092 * k, 0.0068 * k, MSK));
  }
  /** A flat thing lying along a slope dz/dy = s (a tie, a collar point): axes across, along, through. */
  const flat = (s) => [[1, 0, 0], nrm([0, 1, s]), nrm([0, -s, 1])];

  /**
   * The walk, in the figure's own space (forward +Z, the floor moving back under it by `stride` a cycle): q 0..1; stance
   * from heel strike to toe off, the heel rolling down, the foot flat, then the heel lifting about the ball; the swing
   * carried forward and lifted. The hip drops to whatever both legs can reach.
   */
  function walkPose(D, q, o) {
    const S = o.stride, qs = o.stance || 0.6, q1 = qs * 0.18, q2 = qs * 0.62, p0 = 0.24, pT = -0.62, aY = D.ank, sc = D.hgt / 1.8;
    const HB = 0.055 * sc, BL = 0.185 * sc, F = 0.03 * sc + S * (q1 + q2) / 2, lift = (o.lift || 0.1) * sc;
    const footAt = (u) => { // ankle [z, y] and pitch at stance time u (0..qs)
      const hf = F - S * u - HB; // where the heel would be if the foot were flat now
      if (u < q1) { const p = p0 * (1 - sm(0, q1, u)); return [hf + HB * Math.cos(p) - aY * Math.sin(p), HB * Math.sin(p) + aY * Math.cos(p), p]; }
      if (u < q2) return [hf + HB, aY, 0];
      const p = pT * sm(q2, qs, u), bx = hf + BL, vx = HB - BL; return [bx + vx * Math.cos(p) - aY * Math.sin(p), vx * Math.sin(p) + aY * Math.cos(p), p];
    };
    const ft = [-1, 1].map((d) => {
      let u = ((q + (d > 0 ? 0 : 0.5)) % 1 + 1) % 1;
      if (u < qs) return footAt(u);
      const w = (u - qs) / (1 - qs), A = footAt(qs), B = footAt(0), sw = sm(0, 1, w);
      return [mix(A[0], B[0], sw), mix(A[1], B[1], sw) + lift * Math.sin(Math.PI * Math.pow(w, 0.8)), mix(A[2], B[2], sm(0.1, 0.95, w))];
    });
    let hipY = D.hipY + 0.008 * sc;
    for (let k = 0; k < 2; k++) { const dz = ft[k][0] - (o.lean || 0), r = (D.l1 + D.l2) * 0.995, dx = 0.016 * sc; hipY = Math.min(hipY, ft[k][1] + Math.sqrt(Math.max(0, r * r - dz * dz - dx * dx))); }
    const bob = hipY - D.hipY;
    const legs = [-1, 1].map((d, k) => {
      const hip = [d * D.hx, hipY, 0], ank = [d * (D.hx + 0.016 * sc), ft[k][1], ft[k][0]];
      const knee = ik2(hip, ank, D.l1, D.l2, [0, 0, 1]);
      const bend = Math.max(0, 1 - Math.hypot(ank[1] - hip[1], ank[2] - hip[2]) / (D.l1 + D.l2));
      return { d, hip, ank, knee, pitch: ft[k][2], toe: d * 0.08, bend };
    });
    const arms = hangArms(D, o.swing || 0, q * TAU, 0).map((a) => ({ ...a, sh: add(a.sh, [0, bob, 0]), el: add(a.el, [0, bob, 0]), wr: add(a.wr, [0, bob, 0]) }));
    return { legs, arms, bob };
  }

  /** The man, posed: a list of body-space primitives, and where his neck meets the collar. */
  function manFig(pose, outfit) {
    const D = MAN, P = [], bob = pose.bob || 0, Ub = (v) => [v[0], v[1] + bob, v[2]];
    const prof = (y) => [D.w(y - bob), D.d(y - bob), D.zc(y - bob)];
    const DD = Object.assign({}, D, { belt: D.belt + bob, yoke: D.yoke + bob, blade: D.blade + bob, hipY: D.hipY + bob, collar: D.collar + bob, w: (y) => D.w(y - bob), zc: (y) => D.zc(y - bob), sh: [D.sh[0], D.sh[1] + bob], vee: 1 });
    P.push(swpP(0.82 + bob, 1.515 + bob, prof, MSH, { mf: mTorso, h: hTorso, D: DD }));
    for (const L of pose.legs) {
      const sd = L.d * 1.7 + 0.3, top = add(L.hip, [0, 0.03, 0]);
      P.push(axis(capP(top, L.knee, 0.068, 0.054, MPA, { h: hLeg, kn: D.l1 + 0.03, sd, bend: L.bend, crease: 1 })));
      const hem = add(L.ank, [0, 0.025, 0]);
      const shin = axis(capP(L.knee, hem, 0.054, 0.049, MPA, { h: hLeg, kn: 0, sd: sd + 1, bend: L.bend, crease: 1 }));
      shin.hm = shin.len; P.push(shin);
      // the shoe: an upper and a sole along the foot (pitched), the toe turned out a little
      const fw = [Math.sin(L.toe), 0, Math.cos(L.toe)], cp = Math.cos(L.pitch), sp = Math.sin(L.pitch), dir = [fw[0] * cp, sp, fw[2] * cp];
      const E = ori(dir, [0, 1, 0]), at = (f, u) => add(L.ank, add(scl(dir, f), scl(E[1], u)));
      P.push(ellP(at(0.062, -0.036), [0.042, 0.043, 0.138], E, MSO));
      P.push(ellP(at(0.067, -0.07), [0.046, 0.013, 0.15], E, MSL));
      P.push(axis(capP(at(-0.005, 0.015), at(-0.02, -0.02), 0.051, 0.054, MPA, { h: hLeg, sd: sd + 2, hm: 0.03 }))); // the hem breaking over it
    }
    for (const A of pose.arms) {
      const d = A.d, sd = d * 1.3 + 0.7;
      const ua = nrm(sub(A.el, A.sh)), sv = add(A.sh, scl(ua, D.sleeve + 0.05));
      P.push(axis(capP(add(A.sh, [-d * 0.008, 0, 0]), sv, 0.033, 0.047, MSH, { h: hSleeve, sd, slack: 1 }))); // the sleeve hanging off the shoulder and open round a thin arm, its seam dropped
      P.push(capP(add(A.sh, [0, -0.05, 0]), A.el, 0.034, 0.028, MSK));
      P.push(ellP(A.el, [0.029, 0.031, 0.028], null, MSK)); // the elbow, all bone
      P.push(capP(A.el, A.wr, 0.03, 0.019, MSK));
      hand(P, A.wr, A.el, d, 1.08, D.long, A.wrong ? 0.32 : 0.12);
    }
    // the neck going into the collar; the collar; in front, its points, the knot and the tie, lying on the chest
    const z5 = D.zc(1.5), fz = (y) => D.zc(y) + D.d(y);
    P.push(capP(Ub([0, 1.45, D.zc(1.45)]), Ub([0, 1.548, z5 + 0.02]), D.neckR + 0.004, D.neckR, MSK));
    P.push(ellP(Ub([0, 1.484, z5 - 0.036]), [0.06, 0.024, 0.034], null, MSH, { h: hCollar, fold: 1.486 + bob })); // the collar, standing loose behind the neck
    for (const d of [-1, 1]) P.push(ellP(Ub([d * 0.058, 1.47, fz(1.47) - 0.012]), [0.032, 0.021, 0.005], ori([d * 0.75, -0.2, 1], [d * 0.9, 1, 0]), MSH)); // its points, splayed open
    P.push(ellP(Ub([0, 1.392, fz(1.392) + 0.004]), [0.015, 0.018, 0.011], null, MTI)); // the knot, pulled loose
    const s1 = (fz(1.38) - fz(1.08)) / 0.3;
    P.push(ellP(Ub([0, 1.24, fz(1.24) + 0.003]), [0.022, 0.15, 0.006], flat(s1), MTI, { h: (X) => 0.0012 * gs(X, 0.005) }));
    P.push(ellP(Ub([0, 1.09, fz(1.09) + 0.005]), [0.03, 0.04, 0.006], flat(s1 * 0.5), MTI));
    return { prims: P, hgt: D.hgt, neck: Ub([0, D.collar - 0.002, z5]), out: OUT[outfit] };
  }
  /** The child: a striped long-sleeved top, shorts, bare knees, socks pulled up, small shoes; the hands hanging out of the cuffs, long. */
  function kidFig(pose) {
    const D = KID, P = [], bob = pose.bob || 0, Ub = (v) => [v[0], v[1] + bob, v[2]];
    const prof = (y) => [D.w(y - bob), D.d(y - bob), D.zc(y - bob)];
    const DD = Object.assign({}, D, { belt: D.belt + bob, collar: D.collar + bob });
    P.push(swpP(0.49 + bob, 0.94 + bob, prof, MST, { mf: mKid, h: hKidTop, tx: txStripe, D: DD }));
    for (const L of pose.legs) {
      const sd = L.d * 1.9 + 0.4, u = nrm(sub(L.knee, L.hip));
      const hemP = add(L.hip, scl(u, (L.hip[1] - D.hem) / Math.max(0.3, -u[1])));
      P.push(axis(capP(add(L.hip, [0, 0.02, 0]), hemP, 0.058, 0.053, MSR, { h: hShorts, sd })));
      P.push(capP(L.hip, L.knee, 0.036, 0.029, MSK));
      P.push(ellP(L.knee, [0.03, 0.03, 0.028], null, MSK));
      P.push(capP(L.knee, L.ank, 0.028, 0.021, MSK));
      const s0 = add(L.ank, scl(nrm(sub(L.knee, L.ank)), (D.sock - D.ank))), sk = capP(L.ank, s0, 0.025, 0.031, MSC, { h: hSock, top: s0[1] + 0.02 });
      P.push(sk); P.push(ellP(s0, [0.032, 0.011, 0.032], ori(sub(L.knee, L.ank), [0, 0, 1]), MSC));
      const fw = [Math.sin(L.toe), 0, Math.cos(L.toe)], cp = Math.cos(L.pitch), sp = Math.sin(L.pitch), dir = [fw[0] * cp, sp, fw[2] * cp];
      const E = ori(dir, [0, 1, 0]), at = (f, v) => add(L.ank, add(scl(dir, f), scl(E[1], v)));
      P.push(ellP(at(0.04, -0.024), [0.032, 0.032, 0.09], E, MSO));
      P.push(ellP(at(0.044, -0.05), [0.035, 0.01, 0.097], E, MSL));
    }
    for (const A of pose.arms) {
      const d = A.d, sd = d * 1.1 + 0.5;
      P.push(ellP(add(A.sh, [-d * 0.012, 0.0, 0]), [0.04, 0.04, 0.044], null, MST, { tx: txStripe }));
      P.push(axis(capP(add(A.sh, [0, -0.01, 0]), A.el, 0.037, 0.032, MST, { tx: txStripeArm, sd, h: hSleeve })));
      const cuff = add(A.wr, scl(nrm(sub(A.wr, A.el)), -0.01));
      P.push(axis(capP(A.el, cuff, 0.032, 0.027, MST, { tx: txStripeArm, sd: sd + 2 })));
      P.push(capP(cuff, A.wr, 0.02, 0.016, MSK));
      hand(P, A.wr, A.el, d, 0.74, D.long, 0.14);
    }
    const z9 = D.zc(0.93);
    P.push(capP(Ub([0, 0.885, D.zc(0.885)]), Ub([0, 0.975, z9 + 0.012]), D.neckR + 0.003, D.neckR, MSK));
    P.push(swpP(0.915 + bob, D.collar + bob, () => [0.042, 0.04, z9], MST, { h: (X) => 0.0012 * Math.sin(X * 300) }));
    return { prims: P, hgt: D.hgt, neck: Ub([0, D.collar - 0.003, z9]), out: OUT[2] };
  }
  /** Render a figure to a sprite (a generator: yields to spread the work). */
  function* renderFig(fig, yaw, B, mode) {
    const ss = B > 150 ? 1 : 2, b = yield* raster(fig, yaw, B * ss);
    const col = yield* shade(b, mode, fig.out);
    const cv = yield* finish(b, col, ss, ss === 1 ? 0.4 : 0.15);
    const n = toV(fig.neck, Math.cos(yaw), Math.sin(yaw));
    cv.nx = cv.ox + n[0] * cv.px; cv.ny = cv.oy - n[1] * cv.px; cv.nz = n[2];
    return cv;
  }

  // ---- the head: a distance field, sphere-traced -----------------------------------------------------------------
  // Head space: origin where the neck meets the collar, y up, z the way the face looks. HQ: the man's and the child's.
  const HQ = [
    { s: 1, hy: 0.25, hz: 0.012, nr: 0.035, pitch: 0.2 }, // the man: the neck far too long, the head carried forward and down
    { s: 0.92, hy: 0.18, hz: 0.01, nr: 0.029, pitch: 0.12, kid: 1 },
  ];
  const sdE = (x, y, z, a, b, c) => { const k0 = Math.sqrt((x * x) / (a * a) + (y * y) / (b * b) + (z * z) / (c * c)), k1 = Math.sqrt((x * x) / (a * a * a * a) + (y * y) / (b * b * b * b) + (z * z) / (c * c * c * c)); return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b, c); };
  const sdS = (x, y, z, r) => Math.sqrt(x * x + y * y + z * z) - r;
  const smin = (a, b, k) => { const h = cl(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };
  const smax = (a, b, k) => -smin(-a, -b, k);
  function sdSeg(x, y, z, ax, ay, az, bx, by, bz, r) { const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az, t = cl((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)); return Math.hypot(px - dx * t, py - dy * t, pz - dz * t) - r; }
  const HL = [ // where the hair starts, by the angle round from the face (0) to the back (π), relative to the skull's centre
    curve([[0, 0.07], [0.45, 0.068], [0.8, 0.05], [1.15, 0.032], [1.45, 0.02], [1.75, 0.0], [2.1, -0.035], [2.6, -0.066], [Math.PI, -0.074]]),
    curve([[0, 0.094], [0.45, 0.09], [0.8, 0.074], [1.2, 0.05], [1.6, 0.03], [2.0, -0.012], [2.5, -0.05], [Math.PI, -0.064]]), // thinning, receding
    curve([[0, 0.012], [0.7, 0.012], [1.2, -0.018], [1.6, -0.03], [2.2, -0.05], [Math.PI, -0.06]]), // the child's bowl cut
  ];
  const LANK = [[1.3, 0.07, 0.08], [1.75, 0.09, 0.05], [2.3, 0.08, 0.06], [-1.4, 0.085, 0.07], [-2.0, 0.07, 0.05], [-2.7, 0.09, 0.04], [0.55, 0.075, 0.12]]; // [angle, length, outward]
  let HM = 0, HA = 1; // at the last evaluation: the material (0 skin, 1 hair, 2 neck) and how far above the hairline
  /** The head's distance field. q: params; tw: the neck's twist (rad); pr: something pressing a face out from behind (0..1). */
  function sdHead(Q, x, y, z, tw, pr, cut) {
    const s = Q.s, X = x, Y = y - Q.hy, Z = z - Q.hz, ax = Math.abs(X);
    // the neck, on the axis it turns about
    const fy = cl(y / Q.hy);
    let dn = Math.max(Math.hypot(x, z) - Q.nr * (1.12 - 0.22 * fy), y < -0.04 ? -0.04 - y : y - (Q.hy - 0.03 * s)) ;
    if (tw && y > 0 && y < Q.hy - 0.05) {
      const f = y / (Q.hy - 0.05), ph = Math.atan2(x, z) - tw * (1 - f);
      dn += 0.0016 * sm(0.6, 2.6, Math.abs(tw)) * Math.sin(ph * 3 + f * 6) * Math.sin(f * Math.PI);
    }
    const coarse = Math.min(dn, sdE(X, Y - 0.005 * s, Z, 0.097 * s, 0.152 * s, 0.13 * s));
    if (coarse > 0.03) { HM = 0; return coarse - 0.015; }
    const st = 1 + 0.12 * pr, kid = Q.kid; // the face drawn long by whatever is pushing
    let d = sdE(X, Y - 0.024 * s, Z + 0.012 * s, 0.073 * s, 0.094 * s, 0.098 * s); // the skull
    d = smin(d, sdE(X, (Y + 0.038 * s) / st, Z - 0.014 * s, 0.059 * s, (kid ? 0.066 : 0.08) * s, 0.075 * s), 0.032 * s); // the face: one long smooth oval
    d = smin(d, sdS(X, Y + (kid ? 0.082 : 0.104) * s * st, Z - 0.044 * s, 0.023 * s), 0.026 * s); // the chin, round
    d = smin(d, sdS(ax - 0.042 * s, Y + 0.06 * s, Z + 0.004 * s, 0.019 * s), 0.03 * s); // the jaw
    if (Z > -0.01) { // nothing on it: the skin carries straight over where the features should be, only pressed faintly from inside
      const ex = ax - 0.03 * s, ey = Y + 0.002 * s;
      d = smax(d, -sdE(ex, ey, Z - (0.0975 - 0.006 * pr) * s, 0.026 * s, 0.019 * s, 0.022 * s), 0.02 * s); // soft hollows where the eyes would be
      if (pr > 0.01) d = smin(d, sdS(ex, ey, Z - (0.058 + 0.026 * pr) * s, 0.021 * s * sm(0, 0.35, pr)), 0.01 * s); // pressed: eyes, round, pushing the skin out
      d = smin(d, sdSeg(X, Y, Z, 0, -0.006 * s, 0.08 * s, 0, -0.04 * s, (0.086 + 0.026 * pr) * s, (0.0065 + 0.005 * pr) * s), (0.032 - 0.016 * pr) * s); // a nose, barely
      if (pr > 0.02) { // a mouth, wide open, stretching the skin into a ring and sinking in the middle
        const my = Y + (0.068 + 0.014 * pr) * s;
        d = smin(d, sdE(X, my, Z - 0.074 * s, (0.028 + 0.014 * pr) * s, (0.013 + 0.028 * pr) * s, (0.01 + 0.012 * pr) * s), 0.011 * s);
        d = smax(d, -sdE(X, my, Z - 0.097 * s, 0.024 * pr * s + 1e-4, 0.032 * pr * s + 1e-4, 0.024 * s), 0.007 * s);
      } else d = smax(d, -sdE(X, Y + 0.066 * s, Z - 0.084 * s, 0.014 * s, 0.002 * s, 0.006 * s), 0.004 * s); // a short shallow crease where a mouth would part
    }
    d = smin(d, sdE(ax - 0.071 * s, Y + 0.006 * s, Z + 0.006 * s, 0.01 * s, 0.028 * s, 0.018 * s), 0.008 * s); // ears
    const dk = smin(d, dn, 0.025 * s);
    HM = dn < d ? 2 : 0;
    if (cut != null) { // the hair: a shell over the skull, from its line up
      const As = Math.atan2(X, Z), A = Math.abs(As);
      const above = Y - HL[cut](A) * s + (cut === 2 ? 0.014 * (vn(As * 40, 1.5, 23) - 0.5) : 0.016 * (vn(As * 7, 0.5, 21) - 0.5) + 0.006 * (vn(As * 30, 2.5, 22) - 0.5));
      const th = cut === 2 ? 0.011 + 0.007 * vn(As * 14, Y * 30, 24) : 0.0012 + 0.0022 * sm(0.0, 0.03, above) * vn(As * 20, Y * 25, 25);
      let dh = sdE(X, Y - 0.024 * s, Z + 0.012 * s, 0.073 * s + th, 0.094 * s + th, 0.098 * s + th);
      if (cut === 2) dh = Math.max(dh, -above); else dh = smax(dh, -above, 0.006);
      if (cut !== 2 && Y > -0.11 * s) for (let k = 0; k < LANK.length; k++) { // a few lank strands hanging loose
        const L = LANK[k], ca = Math.sin(L[0]), cz = Math.cos(L[0]), r0 = 0.078 * s, y0 = (HL[cut](Math.abs(L[0])) + 0.012) * s;
        const bx = ca * r0, bz = cz * r0 - 0.012 * s, tx = bx * (1.06 + L[2]), tz = bz * (1.06 + L[2]), ty = y0 - L[1] * s;
        dh = Math.min(dh, sdSeg(X, Y, Z, bx, y0, bz, tx, ty, tz, 0.0028 * s));
      }
      HA = above;
      if (dh < dk) { HM = 1; return dh; }
    }
    return dk;
  }
  const HPAL = { skin: [0.64, 0.61, 0.54], neck: [0.5, 0.45, 0.38] };
  /**
   * One head turned to th (0: the face toward us, π/2: toward screen right, π: away), its neck twisted tw, pressed pr.
   * Px per metre B; a canvas whose (nx, ny) is where the neck meets the collar.
   */
  function* renderHead(Q, th, tw, pr, B, mode, out) {
    const Lk = LOOK[mode], s = Q.s, k = B * (B < 110 ? 2 : 1), ss = B < 110 ? 2 : 1, c = Math.cos(th), sn = Math.sin(th);
    const fwd = (Q.hy + 0.07 * s) * Math.sin(Q.pitch || 0) + 0.02, ex = sn * fwd;
    const x0 = -0.14 * s + Math.min(0, ex), x1 = 0.14 * s + Math.max(0, ex), y0 = -0.03, y1 = Q.hy + 0.15 * s, W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
    const col = new Float32Array(W * H * 4), z0 = 0.36, pxr = 0.75 / k, cut = out.cut;
    const Lx = LV[0] * c - LV[2] * sn, Ly = LV[1], Lz = LV[0] * sn + LV[2] * c, dx = sn, dz = -c; // into head space
    const hl0 = Math.hypot(Lx - dx, Ly, Lz - dz), HLx = (Lx - dx) / hl0, HLy = Ly / hl0, HLz = (Lz - dz) / hl0; // halfway to us
    const cq = Math.cos(Q.pitch || 0), sq = Math.sin(Q.pitch || 0);
    let LY = 0, LZ = 0; // the point in the head's own (unbent) space
    const f = (px, py, pz) => { LY = py * cq + pz * sq; LZ = -py * sq + pz * cq; return sdHead(Q, px, LY, LZ, tw, pr, cut); };
    for (let j = 0; j < H; j++) {
      const y = y1 - (j + 0.5) / k;
      for (let i = 0; i < W; i++) {
        const x = x0 + (i + 0.5) / k, ox = x * c - z0 * sn, oz = x * sn + z0 * c;
        let t = 0, md = 1e9, mt = 0, hit = false;
        for (let it = 0; it < 72; it++) {
          const dd = f(ox + dx * t, y, oz + dz * t);
          if (dd < md) { md = dd; mt = t; }
          if (dd < 1.5e-4) { hit = true; break; }
          t += Math.max(dd * 0.85, 2e-4);
          if (t > 0.72) break;
        }
        let a = hit ? 1 : cl(1 - md / pxr);
        a *= sm(0.004, 0.028, y); // the neck fading where it goes into the collar
        if (a <= 0.003) continue;
        const px = ox + dx * mt, pz = oz + dz * mt, e = 4e-4;
        const d0 = f(px, y, pz), mat = HM, HA0 = HA, ly = LY, lz = LZ;
        let nx = f(px + e, y, pz) - d0, ny = f(px, y + e, pz) - d0, nz = f(px, y, pz + e) - d0;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        let occ = 0; for (let q = 1; q <= 4; q++) { const h = 0.006 * q; occ += (h - f(px + nx * h, y + ny * h, pz + nz * h)) / h / (q * 0.8); }
        const ao = cl(1 - occ * (mat === 0 && lz - Q.hz > 0.03 && pr < 0.05 ? 0.3 : 0.6));
        let shd = 1, tt = 0.006; for (let q = 0; q < 14 && tt < 0.16; q++) { const h = f(px + Lx * tt, y + Ly * tt, pz + Lz * tt); shd = Math.min(shd, (10 * h) / tt); if (shd < 0.02) break; tt += Math.max(0.004, h); }
        shd = 0.12 + 0.88 * cl(shd);
        const vnz = -nx * sn + nz * c, vny = ny; // the normal, toward us
        const dl = nx * Lx + ny * Ly + nz * Lz, hemi = 0.5 + 0.5 * vny, fr = cl(1 - vnz);
        let r0, g0, b0, w, ks, shn, shv = 0, fill = 0;
        const A = Math.atan2(px, lz - Q.hz);
        if (mat === 1) { // hair: lank strands, stuck together in clumps, running back and down; thin on top, the scalp showing
          const el = ly - Q.hy, hb = out.hair;
          const strand = vn(A * 64 + 2.5 * vn(A * 7, el * 9, 32), el * 7, 31), clump = vn(A * 10 + 3, el * 6, 33);
          let m = (0.72 + 0.28 * sm(0.25, 0.75, vn(A * 140, el * 10, 34))) * sm(0.22, 0.48, clump + 0.25 * (strand - 0.5)); // gaps where it has parted into clumps
          if (cut !== 2) m *= 1 - (cut === 1 ? 0.8 : 0.5) * sm(0.45, 0.75, vn(A * 2.6 + 1, el * 4, 41)) * sm(0.03, 0.08, el); // bald patches over the crown
          else m = 0.7 + 0.3 * m;
          const dens = (cut === 2 ? 1 : sm(-0.002, 0.016, HA0)) * m, sc = 0.78; // a hairline is never a hard edge
          r0 = mix(HPAL.skin[0] * sc, hb[0], dens); g0 = mix(HPAL.skin[1] * sc, hb[1], dens); b0 = mix(HPAL.skin[2] * sc, hb[2], dens); w = 0.25 + 0.3 * (1 - dens); ks = 0.12 * (1 - dens); shn = 20;
          const strandL = 0.7 + 0.3 * strand;
          const tl = Math.hypot(-ny * nx, 1 - ny * ny, -ny * nz) || 1, th2 = ((-ny * nx) * HLx + (1 - ny * ny) * HLy + (-ny * nz) * HLz) / tl, kk = Math.sqrt(Math.max(0, 1 - th2 * th2));
          shv = 0.05 * Math.pow(kk, 12) * strandL * dens * shd * (0.3 + 0.7 * cl(vny)); // greasy
        } else {
          const fz = sm(0.02, 0.07, lz - Q.hz) * (mat === 2 ? sm(Q.hy - 0.07 * s, Q.hy - 0.03 * s, ly) : 1), m2 = mat === 2 ? 0 : 0.55 + 0.45 * fz; // the face: paler, colder, wet
          const bl = (1 + 0.03 * (vn(px * 600, y * 600, 7) - 0.5) + 0.05 * (fb(px * 60 + pz * 40, y * 60, 3) - 0.5)) * Lk.face * (cut !== 2 && HA0 > -0.014 && HA0 < 0.5 ? 1 - 0.35 * sm(-0.014, 0, HA0) : 1);
          r0 = mix(HPAL.neck[0], HPAL.skin[0], m2) * bl; g0 = mix(HPAL.neck[1], HPAL.skin[1], m2) * bl; b0 = mix(HPAL.neck[2], HPAL.skin[2], m2) * bl; w = 0.55 + 0.3 * fz; ks = 0.08 + 0.34 * fz; shn = 30;
          fill = 0.3 * fz * cl(vnz); // the face keeps its pallor all over: no band of light, no hard edge
          shv = 0.05 * fz * Math.pow(Math.max(0, nx * HLx + ny * HLy + nz * HLz), 6) * shd; // the broad sheen of skin that is wet
        }
        const dif = cl((dl + w) / (1 + w)), fall = 0.85 + 0.15 * sm(0, Q.hy, ly);
        const rim = fr * fr * fr * cl(0.3 + vny) * (0.4 + 0.6 * ao);
        const hx = (nx * HLx + ny * HLy + nz * HLz), sp = ks * Math.pow(Math.max(0, hx), shn) * shd * ao + shv;
        const o = (j * W + i) * 4, kd = dif * shd * fall * (0.6 + 0.4 * ao) + fill * (0.5 + 0.5 * ao);
        const vr = r0 * ((Lk.gnd[0] + (Lk.sky[0] - Lk.gnd[0]) * hemi) * ao + Lk.key[0] * kd) + Lk.rim[0] * rim * (0.35 + r0) + sp * Lk.key[0];
        const vg = g0 * ((Lk.gnd[1] + (Lk.sky[1] - Lk.gnd[1]) * hemi) * ao + Lk.key[1] * kd) + Lk.rim[1] * rim * (0.35 + g0) + sp * Lk.key[1];
        const vb = b0 * ((Lk.gnd[2] + (Lk.sky[2] - Lk.gnd[2]) * hemi) * ao + Lk.key[2] * kd) + Lk.rim[2] * rim * (0.35 + b0) + sp * Lk.key[2];
        tone(Lk, vr, vg, vb, o, col); col[o + 3] = a;
      }
      if ((j + 1) % Math.max(1, Math.round(240 / W)) === 0) yield;
    }
    const cv = yield* finish({ W, H, k, x0, y1 }, col, ss, 0.15);
    cv.nx = cv.ox; cv.ny = cv.oy;
    return cv;
  }

  // ---- sprites, made a little at a time and kept -----------------------------------------------------------------
  // Kept: the sprites lately used, up to CAP bytes (the least lately used let go first); a while after the last visit
  // ended, all of them and the canvases the figures were put together in. Letting go empties a canvas, so the memory
  // comes back at once; the next visit makes what it needs again, a few ms a frame, before it shows.
  const CACHE = new Map(), PEND = new Map(), CAP = 28e6, IDLE_MS = 40000;
  let JOBS = [], warned = false, bytes = 0;
  const zap = (c) => { if (c && c.getContext) { c.width = 0; c.height = 0; } };
  const size = (c) => (c && c.getContext ? c.width * c.height * 4 : 0);
  let lastUse = 0, idleT = 0, OWNS = [];
  function dropAll() {
    for (const c of CACHE.values()) zap(c); CACHE.clear(); bytes = 0; JOBS = []; PEND.clear();
    for (const o of OWNS) { zap(o.fc); o.fc = null; o.fck = null; } OWNS = [];
    for (const c of [FC, HC, TC]) zap(c); FC = FX = HC = HX = TC = TX = null;
  }
  function idleCheck() { const t = now() - lastUse; if (t >= IDLE_MS - 20) { idleT = 0; dropAll(); } else idleT = setTimeout(idleCheck, IDLE_MS - t); }
  function touch() { lastUse = now(); if (!idleT) idleT = setTimeout(idleCheck, IDLE_MS); }
  function mem() { let b = 0; for (const c of CACHE.values()) b += size(c); for (const o of OWNS) b += size(o.fc); b += size(FC) + size(HC) + size(TC); return { bytes: b, sprites: CACHE.size, figs: OWNS.length }; }
  /** The sprite under key, or null while it is still being made (it is queued, the lower pri the sooner). */
  function need(key, pri, make) {
    const c = CACHE.get(key);
    if (c) { CACHE.delete(key); CACHE.set(key, c); return c; } // (the newest last)
    const j = PEND.get(key);
    if (!j) { const n = { key, pri, make, gen: null }; PEND.set(key, n); JOBS.push(n); } else if (pri < j.pri) j.pri = pri;
    return null;
  }
  function pump(ms) {
    if (!JOBS.length) return;
    const t0 = now();
    JOBS.sort((a, b) => a.pri - b.pri);
    while (JOBS.length && now() - t0 < ms) {
      const j = JOBS[0];
      try {
        if (!j.gen) j.gen = j.make();
        const r = j.gen.next();
        if (r.done) {
          JOBS.shift(); PEND.delete(j.key); CACHE.set(j.key, r.value); bytes += size(r.value);
          while (CACHE.size > 1 && (bytes > CAP || CACHE.size > 260)) { const k0 = CACHE.keys().next().value, c0 = CACHE.get(k0); bytes -= size(c0); zap(c0); CACHE.delete(k0); }
        }
      } catch (err) { JOBS.shift(); PEND.delete(j.key); if (!warned) { warned = true; console.warn('faceling: a sprite failed', err); } }
    }
  }
  const BKT = (px) => { let B = 40; while (B < px && B < 420) B = Math.round(B * 1.2); return B; };
  const WALK = { // the gaits: a stride a cycle, the share of it on the floor, how high a foot is carried, the arms' swing
    walk: { stride: 1.16, stance: 0.62, lift: 0.085, swing: 0.025, N: 16 },
    mirror: { stride: 0.66, stance: 0.64, lift: 0.06, swing: 0, N: 16 },
    run: { stride: 0.6, stance: 0.42, lift: 0.075, swing: 0.06, N: 8 },
  };
  /** A body sprite: who ('m' the man, 'k' the child), outfit, seen at yaw (degrees), pose (standing, or a gait and frame). */
  function body(F, who, out, yaw, gait, fr, pri, wrong) {
    const key = `b|${who}|${out}|${yaw}|${gait || 's'}${gait ? fr : ''}|${wrong || 0}|${F.B}|${F.mode}`;
    return need(key, pri, () => {
      const D = who === 'k' ? KID : MAN, W = gait && WALK[gait];
      const pose = W ? walkPose(D, fr / W.N, W) : standPose(D, { wrong });
      return renderFig(who === 'k' ? kidFig(pose) : manFig(pose, out), yaw * DEG, F.B, F.mode);
    });
  }
  /** A head turned th degrees (0 to us, 90 screen right, 180 away; in steps of 15°), its neck twisted tw, pressed pr (in quarters). */
  function head(F, who, out, th, tw, pr, pri) {
    const q = Math.round(th / 15) * 15, t = Math.min(180, Math.round(Math.abs(tw) / 45) * 45), p = Math.round(pr * 4) / 4;
    const key = `h|${who}|${out}|${q}|${t}|${p}|${F.B}|${F.mode}`;
    return need(key, pri, () => renderHead(HQ[who === 'k' ? 1 : 0], q * DEG, t * DEG, p, F.B, F.mode, OUT[who === 'k' ? 2 : out]));
  }
  /** The head at any angle in -180..180: the two nearest sprites to blend, mirrored for a turn to the left. */
  function heads(F, who, out, th, tw, pr, pri) {
    const mir = th < 0, a = Math.min(180, Math.abs(th)), q0 = Math.floor(a / 15) * 15, f = (a - q0) / 15, o = [];
    const h0 = head(F, who, out, q0, tw, pr, pri), h1 = f > 0.04 && q0 < 180 ? head(F, who, out, q0 + 15, tw, pr, pri + 0.5) : null;
    if (h0) o.push([h0, 1]); else if (h1) o.push([h1, 1]);
    if (h0 && h1) o.push([h1, f]);
    return o.length ? { list: o, mir } : null;
  }
  /** The face being pressed out (θ = 0): the two nearest pressings blended. */
  function pressHeads(F, who, out, pr, tw) {
    const a = Math.min(1, pr) * 4, q = Math.floor(a), f = a - q, o = [];
    const h0 = head(F, who, out, 0, tw, q / 4, 0), h1 = q < 4 && f > 0.04 ? head(F, who, out, 0, tw, (q + 1) / 4, 0.5) : null;
    if (h0) o.push([h0, 1]);
    if (h0 && h1) o.push([h1, f]);
    return o.length ? { list: o, mir: false } : heads(F, who, out, 0, tw, 0, 0);
  }

  // ---- drawing one of them into the scene ------------------------------------------------------------------------
  let FC = null, FX = null, HC = null, HX = null, TC = null, TX = null, BLOB = null, BUMP = null;
  function surfaces() {
    if (FC) return;
    FC = mk(64, 64); FX = FC.getContext('2d'); HC = mk(64, 64); HX = HC.getContext('2d'); TC = mk(64, 64); TX = TC.getContext('2d');
    BLOB = mk(64, 64); const b = BLOB.getContext('2d'), gr = b.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = gr; b.fillRect(0, 0, 64, 64);
    BUMP = mk(64, 64); const u = BUMP.getContext('2d'); // something under the skin: lit along its top, its shadow under it
    let g2 = u.createRadialGradient(32, 26, 0, 32, 26, 20); g2.addColorStop(0, 'rgba(255,252,236,0.85)'); g2.addColorStop(1, 'rgba(255,252,236,0)'); u.fillStyle = g2; u.fillRect(0, 0, 64, 64);
    g2 = u.createRadialGradient(32, 40, 0, 32, 40, 22); g2.addColorStop(0, 'rgba(0,0,0,0.9)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); u.fillStyle = g2; u.fillRect(0, 0, 64, 64);
  }
  const fit = (cv, w, h) => { if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, Math.ceil(w)); cv.height = Math.max(cv.height, Math.ceil(h)); } };
  /**
   * One figure: I = { x, z, body, hd: heads(), roll, shear, dir (-1: mirrored), lit, bump: [x, y, a] (metres on the face,
   * alpha), cw (shadow width) }. Composed in a small canvas (the body, its light, the head and its light), then worn into
   * the scene and laid in.
   */
  function drawOne(g, BR, I, op) {
    const bd = I.body;
    if (!bd || op <= 0.004) return;
    surfaces();
    const lit = I.lit, ctx = g.ctx, B = bd.px;
    BR.contact(g, I.x, I.z, (I.cw || 0.75) * (I.sc || 1), op * (0.35 + 0.65 * lit));
    if (I.cast && lit > 0.05 && g.pr(I.x, I.z - 1.3, 0)) { // its shadow thrown along the carpet toward us by the tube behind it
      const x1 = g.sx, y1 = g.sy;
      if (g.pr(I.x, I.z + 0.05, 0)) { const s0 = g.f / g.sz, w0 = (I.cw || 0.7) * 0.75 * s0; ctx.globalAlpha = (g.L ? 0.3 : 0.55) * op * lit; ctx.drawImage(BLOB || (surfaces(), BLOB), Math.min(g.sx, x1) - w0 * 0.5, g.sy - 2, Math.abs(x1 - g.sx) + w0, Math.max(3, y1 - g.sy + 2)); ctx.globalAlpha = 1; }
    }
    if (!g.pr(I.x, I.z, 0)) return;
    const sx = g.sx, sy = g.sy, s = g.f / g.sz;
    const pad = Math.ceil(B * 0.32), top = Math.ceil(B * 0.42), W = bd.width + 2 * pad, H = bd.height + top, shr = I.shear || 0;
    const hd = I.hd, q = (v, k) => Math.round((v || 0) * k);
    const key = `${bd.uid}|${hd ? hd.list.map((h) => h[0].uid + ':' + q(h[1], 20)).join(',') + (hd.mir ? 'm' : '') : ''}|${q(shr, 400)}|${q(lit, 40)}|${q(I.hlit, 40)}|${q(I.roll, 200)}|${I.bump ? q(I.bump[0], 2000) + ',' + q(I.bump[1], 2000) + ',' + q(I.bump[2], 20) : ''}|${g.L ? 1 : 0}`;
    const own = I.own || I, FCo = own.fc || (own.fc = mk(W, H), OWNS.push(own), own.fc), FXo = FCo.getContext('2d');
    if (OWNS.length > 24) { const o = OWNS.shift(); if (o !== own) { zap(o.fc); o.fc = null; o.fck = null; } }
    if (own.fck !== key || FCo.width < W || FCo.height < H) { own.fck = key; compose(g, I, bd, FCo, FXo, W, H, pad, top, shr, lit, B); }
    const k = (s / B) * (I.sc || 1), FC = FCo;
    ctx.save(); ctx.translate(sx, sy); ctx.scale((I.dir || 1) * k, k); ctx.translate(-(pad + bd.ox), -(top + bd.oy));
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, op * 1.05); ctx.drawImage(FC, 0, 0, W, H, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = op; ctx.drawImage(FC, 0, 0, W, H, 0, 0, W, H);
    if (I.split > 0) splitFig(g, ctx, FC, W, H, k, I.split, op);
    ctx.restore();
  }
  /** The figure's own canvas: the body (leaning as told), the shadow of its head, its light; the head and its light. */
  function compose(g, I, bd, FC, FX, W, H, pad, top, shr, lit, B) {
    fit(FC, W, H);
    FX.setTransform(1, 0, 0, 1, 0, 0); FX.globalCompositeOperation = 'source-over'; FX.globalAlpha = 1; FX.clearRect(0, 0, W, H);
    FX.setTransform(1, 0, -shr, 1, pad + shr * bd.oy, top); FX.drawImage(bd, 0, 0);
    const ax = pad + bd.nx + shr * (bd.oy - bd.ny), ay = top + bd.ny;
    FX.setTransform(1, 0, 0, 1, 0, 0); FX.globalCompositeOperation = 'source-atop';
    FX.globalAlpha = (g.L ? 0.6 : 0.36) * (0.4 + 0.6 * lit); FX.drawImage(BLOB, ax - B * 0.12, ay - B * 0.05, B * 0.24, B * 0.17); // the head's shadow under the chin
    const dark = g.L ? '34,30,20' : '5,5,3', dim = (1 - lit) * (g.L ? 0.7 : 0.86);
    if (dim > 0.01) { FX.globalAlpha = 1; FX.fillStyle = `rgba(${dark},${dim})`; FX.fillRect(0, 0, W, H); }
    FX.globalCompositeOperation = 'source-over'; FX.globalAlpha = 1;
    const hd = I.hd;
    if (hd) {
      const h0 = hd.list[0][0], hw = h0.width, hh = h0.height;
      fit(HC, hw, hh);
      HX.setTransform(1, 0, 0, 1, 0, 0); HX.globalCompositeOperation = 'source-over'; HX.globalAlpha = 1; HX.clearRect(0, 0, hw, hh);
      for (const [c, a] of hd.list) { HX.globalAlpha = a; HX.drawImage(c, 0, 0); }
      HX.globalCompositeOperation = 'source-atop';
      if (I.bump && I.bump[2] > 0.01) { // something moving under the skin of the face
        const r = B * 0.045; HX.globalAlpha = I.bump[2]; HX.drawImage(BUMP, h0.nx + I.bump[0] * B - r, h0.ny - I.bump[1] * B - r, r * 2, r * 2);
      }
      const hdim = (1 - (I.hlit != null ? Math.max(lit, I.hlit) : lit)) * (g.L ? 0.5 : 0.52);
      if (hdim > 0.01) { HX.globalAlpha = 1; HX.fillStyle = `rgba(${dark},${hdim})`; HX.fillRect(0, 0, hw, hh); }
      HX.globalCompositeOperation = 'source-over'; HX.globalAlpha = 1;
      FX.setTransform(1, 0, 0, 1, ax, ay); if (I.roll) FX.rotate(I.roll); if (hd.mir) FX.scale(-1, 1);
      FX.drawImage(HC, 0, 0, hw, hh, -h0.nx, -h0.ny, hw, hh);
      FX.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  /** The tape losing its grip on it: the colour split off either side, a slice of it torn sideways. */
  function splitFig(g, ctx, FC, W, H, k, n, op) {
    fit(TC, W, H); TX.setTransform(1, 0, 0, 1, 0, 0); TX.globalAlpha = 1;
    const o = (2.5 + n * 1.5) / k;
    for (const [c, dx] of [[g.L ? '200,40,30' : '255,46,36', o], [g.L ? '20,120,170' : '30,200,255', -o]]) {
      TX.globalCompositeOperation = 'copy'; TX.drawImage(FC, 0, 0, W, H, 0, 0, W, H); TX.globalCompositeOperation = 'source-in'; TX.fillStyle = `rgb(${c})`; TX.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter'; ctx.globalAlpha = (g.L ? 0.22 : 0.3) * op; ctx.drawImage(TC, 0, 0, W, H, dx, 0, W, H);
    }
    const sy0 = Math.floor(H * (0.15 + Math.random() * 0.6)), sh = Math.ceil(H * (0.04 + Math.random() * 0.08)), sx = ((Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10)) / k;
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = op; ctx.drawImage(FC, 0, sy0, W, sh, 0, sy0, W, sh);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(FC, 0, sy0, W, sh, sx, sy0, W, sh);
  }

  // ---- where they can be ----------------------------------------------------------------------------------------
  function doorsAhead(g, BR, a, b) { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0; j < g.j0 + 8; j++) { const d = (j + 1) * BR.C - g.camZ; if (d >= a && d <= b && g.cr(j, 0) === 2) o.push(j); } return o; }
  const pickA = (o) => (o.length ? o[(Math.random() * o.length) | 0] : null);
  function hallAhead(g, BR, a, b, ok) { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0 + 1; j < g.j0 + 8; j++) { const d = (j + 0.5) * BR.C - g.camZ; if (d >= a && d <= b && (!ok || ok(j))) o.push(j); } return pickA(o); }
  /** px per metre at a plan point (device pixels: the canvas may be HiDPI). */
  function pxAt(g, x, z) { if (!g.pr(x, z, 1)) return 60; const m = g.ctx.getTransform(); return (g.f / g.sz) * Math.max(1, Math.hypot(m.a, m.b)); }
  const lightAt = (g, BR, x, z) => g.lum(BR.COL(x), BR.ROW(z)) * g.glob;
  /** A tic: now and then, for two or three frames, a small jerk (of the head). */
  const twitch = (e) => { if (e.tw > 0) { e.tw--; return e.twA; } if (Math.random() < 0.011) { e.tw = 2 + ((Math.random() * 2) | 0); e.twA = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.06); } return 0; };
  /** Not ready yet: the visit waits where it is (its age does not advance and nothing shows). */
  function hold(e) { e.age = Math.max(0, e.age - 1); e.tt = Math.max(0, e.tt - 1); e.vis = 0; e.waited = (e.waited || 0) + 1; if (e.waited > 400) e.age = e.life + 1; }

  /** Tear the tape through the figure: a torn strip at its height (BR.glitch), and the figure's colour split for a few frames. */
  function tear(e, g, st, BR, n, x, z, y) {
    BR.glitch(st, n);
    if (g.pr(x, z, y == null ? 1.2 : y)) { st.glY = Math.max(0, Math.min(0.92, g.sy / (2 * g.hy) - 0.04)); st.glH = Math.min(0.12, 0.035 + (g.f / g.sz) * 0.4 / (2 * g.hy)); }
    e.split = Math.max(e.split || 0, n + 1);
  }
  /** A spot in the hall itself, d metres ahead (nothing but doorways between us and it). */
  const hallSpot = (g, d, x) => ({ x: x == null ? (Math.random() - 0.5) * 0.5 : x, z: g.camZ + d });
  /** Snapped motion: a value that only moves every few frames, sometimes skipping, sometimes holding (stop-motion). */
  function snap(e, key, target, every) {
    const s = e.snaps || (e.snaps = {}), o = s[key] || (s[key] = { v: target, n: 0 });
    if (--o.n <= 0) { o.v = target; o.n = every + ((Math.random() * every) | 0) + (Math.random() < 0.12 ? every * 3 : 0); }
    return o.v;
  }
  const bucketAt = (g, x, z, k) => BKT(pxAt(g, x, z) * (k || 1.05));

  /*
   * The visits. Each: place(g, BR) → e (or null), step(e, g, st, BR) (it drives the visit: e.vis, e.cl, its own clock),
   * and figs(e, g, BR) → the figures to draw this frame. Sprites are asked for in step; nothing shows until they are made.
   * Every one of them begins far off, or half seen, and ends close: two to four metres away, a head and more taller than
   * a door's width is wide on the screen.
   */
  const V = {
    /** Far down the hall, under a working light, its back to us; still, except that it sways when we sway. Its head comes
     * round to us in jerks, the body never moving, until it faces us over its own back; tilts, too far. The lights stutter
     * and it is standing just ahead of us, facing us, the head on one side; something pushes a mouth up under the skin. */
    stand: {
      w: 1.2,
      place(g, BR) {
        const J = hallAhead(g, BR, 7.5, 11.5, (j) => g.lum(0, j) > 0.4); if (J == null) return null;
        const x = (Math.random() - 0.5) * 1.0, z = (J + 0.5) * BR.C + 0.3, n = hallSpot(g, 2.9, (Math.random() - 0.5) * 0.4);
        return { J, x, z, n, life: 345, out: Math.random() < 0.6 ? 0 : 1, hdir: Math.random() < 0.5 ? 1 : -1, wrong: Math.random() < 0.5 ? -1 : 1, B: bucketAt(g, x, z, 1.12), Bn: bucketAt(g, n.x, n.z - 0.5) };
      },
      step(e, g, st, BR) {
        const F = e.F, N = { B: e.Bn, mode: F.mode };
        let ok = body(F, 'm', e.out, 180, null, 0, 0) && head(F, 'm', e.out, 180, 0, 0, 1);
        for (let a = 150; a >= 0; a -= 30) head(F, 'm', e.out, a, 180 - a, 0, 2 + (180 - a) / 60);
        const okN = body(N, 'm', e.out, 0, null, 0, 3, e.wrong) && head(N, 'm', e.out, 0, 0, 0, 3.5);
        head(N, 'm', e.out, 0, 0, 0.5, 5); head(N, 'm', e.out, 0, 0, 1, 5.5);
        const a = e.age;
        if (!ok || (a >= 238 && !okN)) return hold(e);
        e.vis = BR.ss(0, 20, a) * (a < 336 ? 1 : 0);
        e.near = a >= 244;
        if (!e.near) {
          const want = BR.ss(80, 200, e.tt), q = Math.round(want * 6) / 6; // the head comes round in sixths, in jerks
          const t = snap(e, 'turn', q, 7);
          if (t !== e.turn) { if (e.turn != null && t > e.turn) { e.jolt = 3; tear(e, g, st, BR, 1, e.x, e.z, 1.7); } e.turn = t; }
          e.roll = (BR.ss(205, 225, e.tt) > 0.5 ? 0.42 : 0) + (BR.ss(225, 232, e.tt) > 0.5 ? 0.3 : 0);
        } else {
          e.turn = 1; e.roll = 0.62 + (a > 300 ? 0.15 : 0);
          if (a === 244) { e.x = e.n.x; e.z = g.camZ + 2.9; st.halt = Math.max(st.halt || 0, 130); st.hd = 0; tear(e, g, st, BR, 3, e.x, e.z, 1.5); }
          e.press = BR.ss(268, 300, e.tt) * (1 - BR.ss(318, 332, e.tt));
        }
        if (e.jolt > 0) e.jolt--;
        if (a === 238 || a === 330) st.flick = BR.DIP.length;
        if (a === 236 || a === 328) tear(e, g, st, BR, 3, e.x, e.z, 1.4);
        e.cl = a > 228 && a < 248 ? [[0, e.J, BR.flick(a, 2)]] : e.near ? [[0, BR.ROW(e.z), a > 296 && a < 304 ? BR.flick(a, 7) : 1]] : null;
      },
      figs(e, g, BR) {
        const lit = lightAt(g, BR, e.x, e.z), tw = twitch(e) * 1.6;
        if (e.near) {
          const N = { B: e.Bn, mode: e.F.mode }, hd = e.press > 0.02 ? pressHeads(N, 'm', e.out, e.press, 0) : heads(N, 'm', e.out, 0, 0, 0, 0);
          return [{ x: e.x, z: e.z, body: body(N, 'm', e.out, 0, null, 0, 0, e.wrong), hd, roll: -e.hdir * e.roll + tw, lit, split: e.split, cast: 1,
            bump: e.press < 0.02 ? [0.02 * Math.sin(e.tt * 0.05), 0.24 + 0.012 * Math.sin(e.tt * 0.031), 0.3] : null }];
        }
        const F = e.F, th = e.hdir * 180 * (1 - e.turn) + (e.jolt ? e.hdir * 12 : 0);
        return [{ x: e.x, z: e.z, body: body(F, 'm', e.out, 180, null, 0, 0), hd: heads(F, 'm', e.out, th, 180 * (1 - e.turn) - 180, 0, 3), roll: e.hdir * e.roll + tw,
          shear: g.yaw * 0.7 + g.bobS * 0.012, lit, split: e.split }];
      },
    },

    /** Across the doorway just ahead, walking: stiff, in jerks, its arms hanging dead, long. Its head snaps round to us and
     * stays on us. In the middle of the doorway it stops, mid-stride, while the light over it stutters; its head goes over
     * to one side; then on, faster, skipping, out of sight. */
    walk: {
      w: 1.1,
      place(g, BR) {
        const J = pickA(doorsAhead(g, BR, 2.6, 4.0)); if (J == null) return null;
        const dir = Math.random() < 0.5 ? 1 : -1, x = -dir * 2.5, z = (J + 1) * BR.C + BR.TH + 0.55;
        return { J, dir, x, x0: x, z, ph: 0, stop: 0, life: 600, out: Math.random() < 0.5 ? 0 : 1, B: bucketAt(g, 0, z - 0.4) };
      },
      step(e, g, st, BR) {
        const F = e.F, W = WALK.walk;
        let ok = true;
        for (let k = 0; k < W.N; k++) ok = !!body(F, 'm', e.out, 90, 'walk', k, k * 0.3) && ok;
        for (const a of [90, 60, 30, 0]) ok = !!head(F, 'm', e.out, a, a - 90, 0, 1 + (90 - a) / 30) && ok;
        if (!ok) return hold(e);
        const xr = e.dir * e.x;
        if (!e.stopped && xr > -0.15) { e.stopped = 1; e.stop = 70; st.halt = Math.max(st.halt || 0, 110); st.hd = 0; tear(e, g, st, BR, 2, e.x, e.z); }
        if (e.stop > 0) { e.stop--; if (e.stop === 46 || e.stop === 20) tear(e, g, st, BR, 1, e.x, e.z, 1.75); }
        else if (!e.hold && e.age % 4 === 0) { // a pose every four frames: stop-motion; now and then one skipped
          const skip = Math.random() < (e.stopped ? 0.3 : 0.12) ? 2 : 1;
          if (Math.random() > 0.07) e.ph += skip * (TAU / W.N);
        }
        const fq = Math.round((e.ph / TAU) * W.N);
        e.fr = ((fq % W.N) + W.N) % W.N;
        e.x = e.x0 + e.dir * ((fq * TAU) / W.N / TAU) * W.stride;
        const want = xr > -1.2 ? (xr > -0.8 ? (xr > -0.45 ? 1 : 0.67) : 0.33) : 0; // the head comes round in three snaps
        if (want !== e.turn) { if (e.turn != null && want > e.turn) tear(e, g, st, BR, 1, e.x, e.z, 1.75); e.turn = want; }
        e.roll = e.stopped && (e.stop < 40 || e.stop === 0) ? 0.5 : 0;
        e.vis = xr < 2.6 ? 1 : 0;
        if (xr > 2.6) e.age = e.life + 1;
        e.cl = [[0, e.J + 1, e.stop > 50 ? BR.flick(e.age, 4) : e.stop > 0 && e.stop < 12 ? BR.flick(e.age, 9) : 1]]; // its room lit, the light stuttering while it stands there
      },
      figs(e, g, BR) {
        const F = e.F, th = 90 - 90 * e.turn;
        return [{ x: e.x, z: e.z, body: body(F, 'm', e.out, 90, 'walk', e.fr, 0), hd: heads(F, 'm', e.out, th, th - 90, 0, 1), dir: e.dir, lit: lightAt(g, BR, e.x, e.z),
          roll: e.dir * (e.roll + 0.06 * e.turn) + twitch(e) * 0.8, split: e.split, cast: 1 }];
      },
    },

    /** A small one at the jamb of a far doorway, leaning out, its head on one side: far too still. At the next flicker it is
     * at a nearer doorway; at the next, at the nearest, half behind the jamb, its head lying on its shoulder. Its head snaps
     * upright; it is off, in quick small steps. */
    child: {
      w: 1,
      place(g, BR) {
        const ds = doorsAhead(g, BR, 2.1, 15), dz = (j) => (j + 1) * BR.C - g.camZ;
        const J0 = ds.find((j) => dz(j) <= 4.0), far = ds.filter((j) => dz(j) >= 5.5), J1 = far[0], J2 = J1 == null ? null : far.find((j) => j > J1 + 1);
        if (J1 == null) return null;
        // the nearest: at the jamb of a doorway close ahead if there is one, else just ahead in the hall (where it will be by then)
        const zn = J0 != null ? (J0 + 1) * BR.C + BR.TH + 0.3 : g.camZ + 3.6;
        const side = Math.random() < 0.5 ? -1 : 1, zs = [J2, J1].filter((j) => j != null).map((j) => (j + 1) * BR.C + BR.TH + 0.3).concat([zn]);
        return { zs, jamb: J0 != null, di: 0, side, x: side * 0.78, z: zs[0], ph: 0, life: 290, dir: -side, Bs: zs.map((z, k) => bucketAt(g, 0, z - (k === zs.length - 1 ? 0.6 : 0.3), 1.06)), B: bucketAt(g, 0, zn - 0.6, 1.06) };
      },
      step(e, g, st, BR) {
        const F = e.F, a = e.age, s = e.side, n = e.zs.length, Fk = (k) => ({ B: e.Bs[k], mode: F.mode });
        let ok = true;
        for (let k = 0; k < n; k++) { ok = !!body(Fk(k), 'k', 2, 0, null, 0, k) && !!head(Fk(k), 'k', 2, 0, 0, 0, k + 0.5) && ok; }
        for (let k = 0; k < WALK.run.N; k++) body(F, 'k', 2, 90, 'run', k, n + k * 0.2);
        head(F, 'k', 2, 90, 0, 0, n + 2);
        if (!ok) return hold(e);
        const T = [0, 80, 150].slice(3 - n); // when it is at each doorway
        for (let k = 1; k < n; k++) {
          if (a === T[k] - 3) st.flick = BR.DIP.length;
          if (a === T[k]) { e.di = k; e.z = k === n - 1 && !e.jamb ? g.camZ + 3.1 : e.zs[k]; tear(e, g, st, BR, 2, e.x, e.z, 0.9); if (k === n - 1) { st.halt = Math.max(st.halt || 0, 120); st.hd = 0; } }
        }
        const tEnd = T[n - 1] + 85;
        if (a < tEnd) { e.x = s * (e.di === n - 1 && !e.jamb ? 0.42 : 0.78 - 0.05 * e.di); e.run = 0; }
        else { if (!e.run) tear(e, g, st, BR, 2, e.x, e.z, 0.9); e.run = 1; if (a % 2 === 0) e.ph += TAU / WALK.run.N; e.x = s * 0.73 - s * 3.0 * BR.ss(tEnd + 2, tEnd + 30, a); }
        e.vis = a < tEnd + 32 ? 1 : 0;
        if (a > tEnd + 34) e.age = e.life + 1;
        e.cl = a > T[1] - 6 && a < T[1] + 2 ? [[0, BR.ROW(e.z), 0.1]] : null;
      },
      figs(e, g, BR) {
        const s = e.side, lit = lightAt(g, BR, e.x, e.z), Fk = { B: e.Bs[e.di], mode: e.F.mode };
        if (!e.run) {
          const tilt = [-0.45, 0.55, -1.05][e.di + 3 - e.zs.length] * s; // nearer each time, and its head further over
          return [{ x: e.x, z: e.z, body: body(Fk, 'k', 2, 0, null, 0, 0), hd: heads(Fk, 'k', 2, 0, 0, 0, 0), roll: tilt + twitch(e) * 0.5, shear: -s * (0.08 + 0.03 * e.di), lit, cw: 0.5, split: e.split, cast: 1 }];
        }
        const fr = Math.round((e.ph / TAU) * WALK.run.N) % WALK.run.N;
        return [{ x: e.x, z: e.z, body: body(e.F, 'k', 2, 90, 'run', fr, 0) || body(Fk, 'k', 2, 0, null, 0, 0), hd: heads(e.F, 'k', 2, 90, 0, 0, 0), dir: e.dir, lit, cw: 0.5, split: e.split }];
      },
    },

    /** A far room full of them, standing in rows, every face toward us; the room dark, then its light comes on. Each time
     * the lights stutter they are all a long way nearer, until they fill the doorway in front of us. At the last, all gone
     * but one, alone, just ahead. */
    crowd: {
      w: 0.9,
      place(g, BR) {
        const J = hallAhead(g, BR, 11, 14.5, (j) => g.lum(0, j) > 0.4 && j >= g.j0 + 2); if (J == null) return null;
        const z0 = J * BR.C, P = [[-1.1, 2.7], [-0.35, 2.85], [0.4, 2.6], [1.15, 2.9], [-0.75, 1.75], [0.05, 1.9], [0.8, 1.7], [-0.32, 0.9], [0.5, 0.85]];
        const CF = [[0, 0, 0, 1.0, 0.12], [1, -1, 0, 1.07, -0.8], [3, 0, 28, 0.94, 0.3], [4, 1, 0, 1.09, 0.02], [3, -1, -32, 1.02, 0.95], null, [4, 0, 34, 0.96, -0.35], [0, 1, 0, 1.04, -0.18], [1, 0, -22, 0.92, 0.6]];
        const f = P.map(([x, z], k) => { const c = CF[k] || [2, 0, 0, 1, -0.5]; return { x: x + (Math.random() - 0.5) * 0.2, z: z0 + z + (Math.random() - 0.5) * 0.2, who: k === 5 ? 'k' : 'm', out: c[0], wrong: c[1], yaw: c[2], sc: c[3], roll0: c[4], roll: c[4], dir: k === 7 ? -1 : 1 }; });
        const front = z0 + 0.85, dz = (front - (g.camZ + 3.4)) / 3;
        const Bs = [0, 1, 2, 3].map((k) => bucketAt(g, 0, front - dz * k - 0.3, 1.1));
        return { J, x: 0, z: z0 + 1.8, f, dz, life: 400, step: 0, Bs, B: Bs[3] };
      },
      step(e, g, st, BR) {
        const F = e.F, Fk = (k) => ({ B: e.Bs[k], mode: F.mode });
        let ok = true;
        for (let k = 1; k < 4; k++) { // three sizes (the first two places share one)
          const need = k <= Math.max(1, e.step + 1);
          let o = true;
          for (const f of e.f) { o = !!body(Fk(k), f.who, f.out, f.yaw, null, 0, k * 3, f.wrong) && o; o = !!head(Fk(k), f.who, f.out, 0, f.yaw, 0, k * 3 + 1) && o; }
          if (need && !o) ok = false;
        }
        if (!ok) return hold(e);
        const a = e.age, T = [120, 200, 280];
        for (let k = 0; k < 3; k++) {
          if (a === T[k] - 3) st.flick = BR.DIP.length;
          if (a === T[k]) { e.step = k + 1; for (const f of e.f) { f.z -= e.dz; f.roll = f.roll0 + (Math.random() - 0.5) * (0.3 + 0.25 * k); } e.z -= e.dz; tear(e, g, st, BR, 2 + k, 0, e.z); if (k === 2) { st.halt = Math.max(st.halt || 0, 150); st.hd = 0; } }
        }
        if (a === 357) st.flick = BR.DIP.length;
        if (a === 360) { const f = e.f.find((q) => q.who === 'm' && Math.abs(q.x) < 0.5 && !q.yaw) || e.f[0]; f.z = g.camZ + 2.5; f.x = 0.1; f.roll = 0.75; e.f = [f]; e.z = f.z; e.x = f.x; tear(e, g, st, BR, 3, f.x, f.z); }
        e.vis = a < 392 ? BR.ss(0, 10, a) : 0;
        const on = a < 40 ? 0.05 : a < 56 ? BR.flick(a, 5) : 1;
        e.cl = [[0, e.J, on], [0, e.J - 1, a < 56 ? 0.5 : 1]];
      },
      figs(e, g, BR) {
        const Fk = { B: e.Bs[Math.max(1, e.step)], mode: e.F.mode };
        return e.f.map((f) => ({ own: f, x: f.x, z: f.z, sc: f.sc, body: body(Fk, f.who, f.out, f.yaw, null, 0, 0, f.wrong), hd: heads(Fk, f.who, f.out, 0, f.yaw, 0, 1), roll: f.roll + twitch(f) * 0.8, dir: f.dir, lit: lightAt(g, BR, f.x, f.z), cw: f.who === 'k' ? 0.5 : 0.7, split: e.split, cast: e.step >= 2 ? 1 : 0 }));
      },
    },

    /** Ahead of us down the hall one of them is walking away, keeping exactly our distance: step for step with us, its feet
     * landing when ours do, its arms dead. We stop (we cannot help it); it stops. Its head comes round to us over its back,
     * in jerks. The lights stutter and it is standing just in front of us, facing us. */
    mirror: {
      w: 1,
      place(g, BR) {
        const side = Math.random() < 0.5 ? -1 : 1, d = 6.4 + Math.random() * 0.8, x = side * (0.15 + Math.random() * 0.3), z = g.camZ + d;
        return { side, x, z, d, life: 520, out: Math.random() < 0.5 ? 0 : 1, yaw: 180, B: bucketAt(g, x, z - 0.3), Bn: BKT(pxAt(g, 0, g.camZ + 2.8) * 1.06) };
      },
      step(e, g, st, BR) {
        const F = e.F, W = WALK.mirror, N = { B: e.Bn, mode: F.mode }, hb = e.side * 180;
        let ok = true;
        for (let k = 0; k < W.N; k++) ok = !!body(F, 'm', e.out, e.yaw, 'mirror', k, k * 0.25) && ok;
        ok = !!body(F, 'm', e.out, e.yaw, null, 0, 0.1) && ok;
        for (let a = 0; a <= 180; a += 30) head(F, 'm', e.out, a, 180, 0, a === 180 ? 0.2 : 4 + (180 - a) / 60);
        const ny = -e.side * 15, okN = body(N, 'm', e.out, ny, null, 0, 6, e.side) && head(N, 'm', e.out, 15, 0, 0, 6.5);
        const a = e.age;
        if (!ok || (e.stopped && a > e.stopped + 140 && !okN)) { if (!e.stopped) e.z = g.camZ + e.d; return hold(e); }
        if (a === 150) { st.halt = Math.max(st.halt || 0, 330); st.hd = 0; } // we stop
        if (!e.stopped && (st.v > 0.0016 || a < 150)) { e.z += st.v; e.q = st.bob / TAU; } else if (!e.stopped) { e.stopped = a; e.t0 = e.tt; }
        if (e.stopped && !e.near) {
          const want = Math.round(BR.ss(e.t0 + 25, e.t0 + 120, e.tt) * 6) / 6, t = snap(e, 'turn', want, 6);
          if (t !== e.turn) { if (e.turn && t > e.turn) tear(e, g, st, BR, 1, e.x, e.z, 1.7); e.turn = t; }
        }
        const tn = e.stopped ? e.stopped + 150 : 1e9;
        if (a === tn - 3) st.flick = BR.DIP.length;
        if (a === tn) { // beside us, in the side doorway (or wherever the side wall is open), a few steps ahead
          e.near = 1; e.x = e.side * 0.3; e.z = g.camZ + 2.8; tear(e, g, st, BR, 3, e.x, e.z);
        }
        const end = tn + 95;
        if (a === end - 3) st.flick = BR.DIP.length;
        e.vis = BR.ss(0, 25, a) * (a < end ? 1 : 0);
        if (a > end + 4) e.age = e.life + 1;
        e.cl = e.stopped && a > tn - 10 && a < tn ? [[e.side, BR.ROW(e.z), BR.flick(a, 3)]] : null;
        e.hb = hb;
      },
      figs(e, g, BR) {
        const F = e.F, lit = lightAt(g, BR, e.x, e.z);
        if (e.near) { const N = { B: e.Bn, mode: F.mode }, ny = -e.side * 15; return [{ x: e.x, z: e.z, body: body(N, 'm', e.out, ny, null, 0, 0, e.side), hd: heads(N, 'm', e.out, ny, 0, 0, 0), lit, roll: e.side * 0.75 + twitch(e) * 1.2, split: e.split, cast: 1 }]; }
        const Nn = WALK.mirror.N, fr = ((Math.round((e.q || 0) * Nn) % Nn) + Nn) % Nn, t = e.turn || 0, th = e.hb * (1 - t);
        const bd = e.stopped ? body(F, 'm', e.out, e.yaw, null, 0, 0) : body(F, 'm', e.out, e.yaw, 'mirror', fr, 0);
        return [{ x: e.x, z: e.z, body: bd, hd: heads(F, 'm', e.out, th, 180 * (1 - t), 0, 0), lit, roll: t * 0.35 * e.side + twitch(e), split: e.split, cast: 1 }];
      },
    },

    /** Just the other side of the doorway right in front of us, half behind the jamb, facing us: we stop. It does not move at
     * all; one arm hangs bent the wrong way. Then the skin of its face is pushed out from behind into a face, a mouth stretched
     * open; it smooths again; and it goes back, in jerks, without a step, into the room as the light there dies. */
    close: {
      w: 0.8,
      place(g, BR) {
        const J = pickA(doorsAhead(g, BR, 1.7, 2.9)); if (J == null) return null;
        const side = Math.random() < 0.5 ? -1 : 1, x = side * 0.6, z = (J + 1) * BR.C + BR.TH + 0.3;
        return { J, side, x, z, z0: z, life: 340, out: Math.random() < 0.5 ? 0 : 1, B: Math.min(301, bucketAt(g, x, z - 0.2)) }; // (drawn a little enlarged when very near)
      },
      step(e, g, st, BR) {
        const F = e.F, yw = -e.side * 12;
        const ok = body(F, 'm', e.out, yw, null, 0, 0, -e.side) && head(F, 'm', e.out, 0, 0, 0, 0.5);
        let pok = true;
        for (const p of [0.25, 0.5, 0.75, 1]) pok = !!head(F, 'm', e.out, 0, 0, p, 0.6 + p * 0.1) && pok;
        if (!pok && e.tt > 104) e.tt--; // the face waits to be pushed out until it can be
        if (e.age < 4) { st.halt = Math.max(st.halt || 0, 330); st.hd = 0; }
        if (!ok) return hold(e);
        const a = e.age;
        if (a === 6) { st.flick = BR.DIP.length; }
        if (a === 9) tear(e, g, st, BR, 3, e.x, e.z);
        e.press = BR.ss(110, 170, e.tt) * (1 - BR.ss(200, 215, e.tt));
        if (a === 112 || a === 200) tear(e, g, st, BR, 2, e.x, e.z, 1.7);
        const back = Math.floor(BR.ss(232, 322, snap(e, 'back', e.tt, 5)) * 9) / 9; // pulled back in jerks, its feet not moving
        if (back !== e.back) { if (e.back != null && back > e.back) e.split = Math.max(e.split || 0, 2); e.back = back; }
        e.z = e.z0 + back * 2.4;
        e.vis = (a > 9 ? 1 : 0) * (1 - BR.ss(306, 330, a));
        e.cl = [[0, e.J + 1, a < 230 ? (a > 96 && a < 104 ? BR.flick(a, 6) : 1) : Math.max(0.05, 1 - BR.ss(230, 290, a) - (a > 262 && a < 270 ? 0.5 : 0))]];
        if (a > 332) e.age = e.life + 1;
      },
      figs(e, g, BR) {
        const F = e.F, hd = e.press > 0.02 ? pressHeads(F, 'm', e.out, e.press, 0) : heads(F, 'm', e.out, 0, 0, 0, 0);
        return [{ x: e.x, z: e.z, body: body(F, 'm', e.out, -e.side * 12, null, 0, 0, -e.side), hd, lit: lightAt(g, BR, e.x, e.z), hlit: e.press, roll: -e.side * 0.32 * (1 - 0.8 * e.press) + twitch(e) * 1.2 * (1 - e.press), split: e.split, cast: 1,
          bump: e.press < 0.02 && e.age > 40 ? [0.025 * Math.sin(e.tt * 0.045), 0.24 + 0.015 * Math.sin(e.tt * 0.027), 0.3] : null }];
      },
    },
  };
  let lastV = '';
  const NAMES = Object.keys(V);

  const facelingOv = {
    place(g, v, BR) {
      let order;
      if (v && V[v]) order = [v];
      else if (v) return undefined;
      else { const pool = NAMES.filter((n) => n !== lastV); order = []; while (pool.length) { let t = 0; for (const n of pool) t += V[n].w; let r = Math.random() * t, i = 0; while (i < pool.length - 1 && (r -= V[pool[i]].w) > 0) i++; order.push(pool[i]); pool.splice(i, 1); } }
      for (const n of order) {
        const e = V[n].place(g, BR);
        if (!e) continue;
        lastV = n; JOBS = []; PEND.clear();
        return Object.assign(e, { v: n, own: true, tt: 0, hold: 0, vis: 0, F: { B: e.B, mode: g.L ? 'L' : 'D' } });
      }
      return null;
    },
    step(e, g, st, BR) {
      if (!e.own || !V[e.v]) return;
      touch();
      const mode = g.L ? 'L' : 'D';
      if (e.F.mode !== mode) e.F = { B: e.F.B, mode };
      BR.tick(e, 0.012);
      if (e.split > 0) e.split--;
      V[e.v].step(e, g, st, BR); // it asks for its sprites first, so the queue knows what comes first
      pump(e.vis > 0 ? (e.v === 'crowd' ? 5 : 3) : 6);
      e.I = e.vis > 0 ? V[e.v].figs(e, g, BR) : null;
      if (e.I) for (const I of e.I) if (!I.own) I.own = e; // (its composed canvas is kept on the visit, or on the figure)
    },
    draw(e, g, j, c, BR) {
      if (!e.own) { const ev = BR.EV.faceling; if (ev && ev.draw) ev.draw(e, g, j, c); return; }
      if (!e.I || !(e.vis > 0)) return;
      const fs = e.I.filter((I) => BR.ROW(I.z) === j && (I.c != null ? I.c : BR.COL(I.x)) === c);
      if (!fs.length) return;
      fs.sort((p, q) => q.z - p.z);
      for (const I of fs) drawOne(g, BR, I, e.vis * BR.far(I.z - g.camZ));
    },
  };

  // (for working on the look outside the app)
  facelingOv._dev = { manFig, kidFig, standPose, walkPose, renderFig, renderHead, HQ, MAN, KID, OUT, CACHE, jobs: () => JOBS, mem, dropAll };
  (window.BR_ENT = window.BR_ENT || {}).faceling = facelingOv;
})();
