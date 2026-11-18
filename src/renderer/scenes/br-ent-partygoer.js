'use strict';
/*
 * 백룸 — the partygoer's look, and the lone balloon's (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * A Partygoer: tall, thin, faceless, in dull yellow leather gone waxy with age, cracked and mottled; a smile painted on,
 * glossy black, far too wide, its corners running round to where ears would be; a paper party hat. It stands among real
 * balloons (latex: the tube mirrored in each, the knot, the neck wrinkled, strings that hang and swing with their own
 * weight), waves in slow jerks and ticks its head from side to side like a metronome. Next time the lights stutter it is
 * a room nearer, its head laid over; when it goes, the balloons go soft and one bursts.
 *
 * Nothing is drawn as flat shapes per frame. When a visit starts, a small 2.5D renderer shades every sprite once, a few
 * milliseconds a frame: round cones and ellipsoids blended into one height field, bumped with leather grain, cracks and
 * mottling, lit per pixel by the tube overhead, a fill from the room we stand in and a rim from the room behind, with a
 * soft shade where one part meets another. The poses are separate renders (the waving arm in six positions, the head in
 * seven tilts), so it moves in true poses and never slides; per frame it costs a dozen drawImages.
 */
(function () {
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

  // ---- textures: tileable, TN x TN, one texel per sprite pixel at 128 px per metre ----
  const TN = 256, TM = 255, TX = { ok: false };
  /** Fractal value noise, stretched to 0..1. */
  function* fbm(seed, cells, oct) {
    const R = rng(seed), lat = [], out = new Float32Array(TN * TN);
    for (let o = 0; o < oct; o++) { const gs = cells << o, a = new Float32Array(gs * gs); for (let i = 0; i < a.length; i++) a[i] = R(); lat.push(a); }
    let lo = 1e9, hi = -1e9;
    for (let y = 0; y < TN; y++) {
      for (let x = 0; x < TN; x++) {
        let v = 0, amp = 1, tot = 0;
        for (let o = 0; o < oct; o++) {
          const gs = cells << o, a = lat[o], fx = (x * gs) / TN, fy = (y * gs) / TN, ix = fx | 0, iy = fy | 0;
          let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
          const x1 = (ix + 1) % gs, r0 = iy * gs, r1 = ((iy + 1) % gs) * gs, p = a[r0 + ix], q = a[r0 + x1], r = a[r1 + ix], s = a[r1 + x1];
          v += amp * (p + (q - p) * tx + (r - p) * ty + (p - q - r + s) * tx * ty); tot += amp; amp *= 0.5;
        }
        v /= tot; out[y * TN + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if ((y & 7) === 7) yield;
    }
    const k = 1 / (hi - lo); for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
    return out;
  }
  /** Cellular noise: F2 - F1 in pixels (0 along the borders between cells), optionally through a warp. */
  function* worley(seed, n, wa, wb, amp) {
    const R = rng(seed), cs = TN / n, px = new Float32Array(n * n), py = new Float32Array(n * n), out = new Float32Array(TN * TN);
    for (let i = 0; i < n * n; i++) { px[i] = (0.1 + 0.8 * R()) * cs; py[i] = (0.1 + 0.8 * R()) * cs; }
    for (let y = 0; y < TN; y++) {
      for (let x = 0; x < TN; x++) {
        let ux = x + 0.5, uy = y + 0.5;
        if (wa) { const k = y * TN + x; ux += (wa[k] - 0.5) * amp; uy += (wb[k] - 0.5) * amp; }
        const cx = Math.floor(ux / cs), cy = Math.floor(uy / cs);
        let f1 = 1e9, f2 = 1e9;
        for (let j = -1; j <= 1; j++) {
          const gy = cy + j, wy = ((gy % n) + n) % n;
          for (let i = -1; i <= 1; i++) {
            const gx = cx + i, q = wy * n + (((gx % n) + n) % n), dx = gx * cs + px[q] - ux, dy = gy * cs + py[q] - uy, d = dx * dx + dy * dy;
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
        }
        out[y * TN + x] = Math.sqrt(f2) - Math.sqrt(f1);
      }
      if ((y & 7) === 7) yield;
    }
    return out;
  }
  /** The leather: B its relief (px), C the deep cracks, G the creases between the pebbles of the grain, F the dry lifted lips beside a crack, M / M2 mottling. */
  function* textures() {
    const mot = yield* fbm(11, 4, 5), mot2 = yield* fbm(12, 8, 3), wa = yield* fbm(13, 8, 2), wb = yield* fbm(14, 8, 2);
    const grn = yield* worley(15, 60, null, null, 0), crk = yield* worley(16, 11, wa, wb, 18);
    const R = rng(17), n = TN * TN, B = new Float32Array(n), C = new Float32Array(n), G = new Float32Array(n), F = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const gr = grn[k], c = crk[k], net = ss(0.4, 0.58, mot2[k]);
      const crack = (1 - ss(0, 1.25, c)) * net, lip = ss(0.8, 1.5, c) * (1 - ss(1.5, 3.4, c)) * net;
      B[k] = 0.16 * ss(0, 2.4, gr) - 1.7 * crack + 0.3 * lip + (mot[k] - 0.5) * 1.1 + (R() - 0.5) * 0.35;
      C[k] = crack; G[k] = 1 - ss(0, 1.3, gr); F[k] = lip;
    }
    Object.assign(TX, { B, C, G, F, M: mot, M2: mot2, ok: true });
  }
  const samp = (T, u, v) => {
    const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y, x0 = x & TM, x1 = (x + 1) & TM, y0 = (y & TM) << 8, y1 = ((y + 1) & TM) << 8;
    const a = T[y0 + x0], b = T[y0 + x1], c = T[y1 + x0], d = T[y1 + x1];
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
  };
  const near = (T, u, v) => T[((Math.floor(v) & TM) << 8) | (Math.floor(u) & TM)];

  // ---- primitives (metres, y up): t 0 a round cone, 1 an ellipsoid, 2 a flat-based cone. z: how far toward us its axis lies.
  // k: how softly it melts into what it overlaps; g: its part (parts shade each other where they meet); m: material.
  const SKIN = 0, HAT = 1, POM = 2, RUB = 3, CLOTH = 4, CAKE = 5;
  let PID = 0;
  const base = (o) => Object.assign({ z: 0, fz: 1, k: 0.02, g: 0, m: SKIN, ao: 0.5, bs: 1, tu: (PID * 97 + 13) & TM, tv: (PID++ * 57 + 91) & TM, lump: 0, tp: 0 }, o);
  /** A trunk lofted through samples, bottom up: [y, centre x, half-width left, half-width right, depth, centre z]. */
  function loft(S, o) {
    let lx = 1e9, hx = -1e9; for (const q of S) { lx = Math.min(lx, q[1] - q[2]); hx = Math.max(hx, q[1] + q[3]); }
    return Object.assign(base(o), { t: 3, S, rm: 0.1, bb: [lx, S[0][0], hx, S[S.length - 1][0]] });
  }
  function cap(ax, ay, bx, by, ra, rb, o) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9, len = Math.sqrt(l2), r = Math.max(ra, rb) + (o && o.kn ? Math.max(...o.kn.map((q) => q[1])) : 0);
    return Object.assign(base(o), { t: 0, ax, ay, dx, dy, il2: 1 / l2, len, nx: -dy / len, ny: dx / len, ra, dr: rb - ra, rm: r,
      bb: [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r] });
  }
  function ell(cx, cy, rx, ry, rz, o) {
    const p = Object.assign(base(o), { t: 1, cx, cy, rx, ry, rz }), R = Math.max(rx * (1 + Math.abs(p.tp) + p.lump * 1.2), ry * (1 + p.lump));
    return Object.assign(p, { c: Math.cos(p.rot || 0), s: Math.sin(p.rot || 0), rm: Math.min(rx, ry), bb: [cx - R, cy - R, cx + R, cy + R] });
  }
  function cone(bx, by, ax, ay, rb, o) {
    const dx = ax - bx, dy = ay - by, len = Math.hypot(dx, dy), k = o && o.cut ? o.cut / len : 1, tx = bx + dx * k, ty = by + dy * k; // (a cut cone ends at cut)
    return Object.assign(base(o), { t: 2, ax: bx, ay: by, ux: dx / len, uy: dy / len, len, rb, rm: rb,
      bb: [Math.min(bx, tx) - rb, Math.min(by, ty) - rb, Math.max(bx, tx) + rb, Math.max(by, ty) + rb] });
  }

  // ---- painted marks, in a surface's own frame: ph round it (0 toward us before any yaw), yy up it (-1 … 1) ----
  /**
   * The face, painted on (sets FP: the mouth, outlined in glossy black; FT: teeth inside it, far too many, uneven; FE: two eye
   * holes in soot, smudged and run). ph round the head (0 to us), yy up it (-1 … 1); pxu / pxx: px per unit of yy / of u.
   */
  let FP = 0, FT = 0, FE = 0;
  function faceMask(ph, yy, pxu, pxx) {
    FP = FT = FE = 0;
    if (ph < -1.5 || ph > 1.5) return;
    const u = Math.sin(ph) / 0.988, uu = u * u, wob = (near(TX.M, ph * 70 + 40, yy * 26 + 90) - 0.5) * 0.035;
    const yc = -0.3 + 0.4 * uu + 0.1 * uu * uu + 0.03 * u, top = yc + 0.11 * (1 - uu) + wob, bot = yc - 0.38 * Math.pow(Math.max(0, 1 - uu), 0.7) + wob * 0.5;
    const din = Math.min(top - yy, yy - bot);
    if (din > -0.06) {
      FP = cl(din * pxu + 0.5);
      const ol = 0.05, mid = bot + (top - bot) * 0.5, gap = 0.022;
      if (din > ol * 0.4) {
        const tw = 0.105, fu = u / tw + 0.5, id = Math.floor(fu), fr = fu - id, hh = ((Math.imul(id + 7, 2654435761) >>> 0) % 1000) / 1000;
        const edge = Math.min(fr, 1 - fr) * tw * pxx * Math.sqrt(Math.max(0.05, 1 - uu)); // px to this tooth's side
        const up = yy > mid, len = (up ? top - ol - mid : mid - bot - ol) * (0.55 + 0.45 * hh), dm = Math.abs(yy - mid);
        FT = cl((din - ol) * pxu + 0.5) * cl(edge - 0.6) * cl((dm - gap) * pxu + 0.5) * cl((len + gap - dm) * pxu + 0.5);
      }
    }
    for (const [ex, ey, r, k] of [[-0.42, 0.24, 0.21, 1], [0.41, 0.28, 0.17, 2]]) { // not a pair: one larger, one higher
      const nz = (near(TX.M, ph * 90 + k * 50, yy * 90 + k * 30) - 0.5) * 0.55, d = Math.hypot((ph - ex) / r, (yy - ey) / (r * 1.3)) + nz;
      let e = ss(1.2, 0.5, d);
      const dx = Math.abs(ph - ex - 0.03 * k) / 0.035, below = ey - r * 0.9 - yy;
      if (below > 0 && below < 0.5 && dx < 1) e = Math.max(e, (1 - dx * dx) * (1 - below / 0.5) * 0.9);
      if (e > FE) FE = e;
    }
  }
  /** "=)" in marker on a balloon. */
  function eqMask(ph, yy, pxu) {
    let m = -1;
    for (const y0 of [0.2, -0.02]) m = Math.max(m, Math.min(0.045 - Math.abs(yy - y0), 0.21 - Math.abs(ph + 0.36)));
    const r = Math.hypot((ph - 0.02) * 1.05, yy - 0.09), an = Math.atan2(yy - 0.09, ph - 0.02);
    if (Math.abs(an) < 1.05) m = Math.max(m, Math.min(0.05 - Math.abs(r - 0.36), (1.05 - Math.abs(an)) * 0.3));
    return cl(m * pxu + 0.5);
  }

  /**
   * Shade a set of primitives into a sprite: { W, H, ox, oy, S, lv: { D: [{ lit, dark }], L: [...] } } (lit: under its
   * tube; dark: the tube out, only the room behind rimming it). A generator: it yields every few rows.
   * spec: W, H (px), ox, oy (where the origin lies, px), S (px per metre), prims; rot / pvx / pvy (all of it turned about a
   * pivot); lx (the tube's side, +: to the right); wy (world height of the origin: grime toward the floor); yaw (marks turned
   * round the head); hsh [x, y, rx, ry] (a head's shadow on the neck); col / gloss (rubber).
   */
  const POOL = {};
  /** A working buffer, kept between renders (one render runs at a time): no fresh megabytes, no collector pause mid-visit. */
  const buf = (name, n, v, T) => { let b = POOL[name]; if (!b || b.length < n) b = POOL[name] = new (T || Float32Array)(Math.ceil(n * 1.15)); const a = b.subarray(0, n); a.fill(v); return a; };
  function* render(spec) {
    const W = spec.W, H = spec.H, ox = spec.ox, oy = spec.oy, S = spec.S, prims = spec.prims, n = W * H, bsc = S / 128;
    const Hh = buf('Hh', n, -1e5), Sd = buf('Sd', n, 1e5), Bm = buf('Bm', n, 0), Cr = buf('Cr', n, 0), Mo = buf('Mo', n, 0), Ms = buf('Ms', n, 0);
    const Gr = buf('Gr', n, 0), Fl = buf('Fl', n, 0), Pt = buf('Pt', n, 0), Tt = buf('Tt', n, 0), Et = buf('Et', n, 0), Oc = buf('Oc', n, 0), Id = buf('Id', n, -1, Int16Array), Xs = buf('Xs', n, 0), Ws = buf('Ws', n, 0);
    const rot = spec.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot), pvx = spec.pvx || 0, pvy = spec.pvy || 0, yaw = spec.yaw || 0;
    const TB = TX.B, TC = TX.C, TG = TX.G, TF = TX.F, TMo = TX.M, TM2 = TX.M2;
    let SD = 0, HG = 0, UU = 0, VV = 0, WW = 0, XX = 0, MX = 0, MY = 0;
    const at = (x, y) => {
      MX = (x + 0.5 - ox) / S; MY = (oy - y - 0.5) / S;
      if (rot) { const dx = MX - pvx, dy = MY - pvy; MX = pvx + dx * ca + dy * sa; MY = pvy - dx * sa + dy * ca; }
    };
    const ev = (p) => {
      if (p.t === 0) {
        const ex0 = MX - p.ax, ey0 = MY - p.ay; let t = (ex0 * p.dx + ey0 * p.dy) * p.il2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ex0 - p.dx * t, ey = ey0 - p.dy * t, d = Math.sqrt(ex * ex + ey * ey);
        let r = p.ra + p.dr * t;
        if (p.kn) for (const q of p.kn) { const u = ((t - q[0]) * p.len) / q[2]; r += q[1] * Math.exp(-u * u); }
        SD = d - r; HG = SD < 0 ? p.z + Math.sqrt(r * r - d * d) * p.fz : p.z - SD * 10;
        const s = (ex * p.nx + ey * p.ny) / r; XX = s < -1 ? -1 : s > 1 ? 1 : s; UU = r * Math.asin(XX); VV = t * p.len; WW = t;
      } else if (p.t === 1) {
        const dx = MX - p.cx, dy = MY - p.cy, lx = dx * p.c + dy * p.s, ly = dy * p.c - dx * p.s, yy = ly / p.ry;
        let rxe = p.rx * Math.max(0.2, 1 + p.tp * Math.max(-1, Math.min(1, yy)));
        if (p.lump) { const an = Math.atan2(ly, lx); rxe *= 1 + p.lump * (0.6 * Math.sin(an * 3 + p.tu) + 0.4 * Math.sin(an * 5 + p.tv)); }
        const xx = lx / rxe, q = xx * xx + yy * yy, gq = Math.hypot(lx / (rxe * rxe), ly / (p.ry * p.ry)); // (distance to the rim, first order: right for long thin ones too)
        SD = q < 4 ? (q - 1) / (2 * gq + 1e-9) : (Math.sqrt(q) - 1) * (rxe < p.ry ? rxe : p.ry);
        HG = q < 1 ? p.z + p.rz * Math.sqrt(1 - q) : p.z - SD * 10;
        let s = xx / Math.sqrt(Math.max(1e-4, 1 - yy * yy)); s = s < -1 ? -1 : s > 1 ? 1 : s;
        XX = s; UU = rxe * Math.asin(s); VV = ly; WW = yy;
      } else if (p.t === 3) {
        const P = p.S, n1 = P.length - 1;
        let i = 0; while (i < n1 - 1 && MY > P[i + 1][0]) i++;
        const A = P[i], B = P[i + 1], f0 = (MY - A[0]) / (B[0] - A[0]), f = f0 < 0 ? 0 : f0 > 1 ? 1 : f0 * f0 * (3 - 2 * f0), L = (j) => A[j] + (B[j] - A[j]) * f;
        const xc = L(1), dx = MX - xc, w = dx < 0 ? L(2) : L(3), u = dx / w, dz = L(4), zc = L(5);
        SD = Math.max((Math.abs(u) - 1) * w, P[0][0] - MY, MY - P[n1][0]);
        HG = SD < 0 ? zc + dz * Math.sqrt(Math.max(0, 1 - u * u)) : zc - SD * 10;
        XX = u < -1 ? -1 : u > 1 ? 1 : u; UU = w * Math.asin(XX); VV = MY; WW = (MY - P[0][0]) / (P[n1][0] - P[0][0]);
      } else {
        const ex = MX - p.ax, ey = MY - p.ay, al = ex * p.ux + ey * p.uy, ac = ey * p.ux - ex * p.uy, t = al / p.len, r = Math.max(1e-4, p.rb * (1 - t));
        let s = ac / r; s = s < -1 ? -1 : s > 1 ? 1 : s;
        SD = Math.max(Math.abs(ac) - r, -0.2 * p.rb * (1 - s * s) - al, al - (p.cut || p.len));
        HG = SD < 0 ? p.z + Math.sqrt(Math.max(0, r * r - ac * ac)) : p.z - SD * 10;
        XX = s; UU = r * Math.asin(s); VV = al; WW = t;
      }
    };
    /** The paint at this pixel, in the frame of the shape it was painted on (pf: cx, cy, rx, ry, taper), turned by yaw. */
    const paintAt = (p) => {
      const f = p.pf, yy = (MY - f[1]) / f[3], cw = Math.sqrt(Math.max(1e-4, 1 - yy * yy)), sx = (MX - f[0]) / (f[2] * (1 + f[4] * yy)) / cw;
      const ph = Math.asin(sx < -1 ? -1 : sx > 1 ? 1 : sx) - yaw;
      if (Math.cos(ph) < -0.05) { FP = FT = FE = 0; return; }
      if (p.paint === 1) faceMask(ph, yy, f[3] * S, f[2] * S); else { FP = eqMask(ph, yy, f[3] * S); FT = FE = 0; }
    };
    const box = (p, m) => {
      let b0 = p.bb[0] - m, b1 = p.bb[1] - m, b2 = p.bb[2] + m, b3 = p.bb[3] + m;
      if (rot) {
        let lx = 1e9, ly = 1e9, hx = -1e9, hy = -1e9;
        for (const [qx, qy] of [[b0, b1], [b2, b1], [b0, b3], [b2, b3]]) {
          const dx = qx - pvx, dy = qy - pvy, wx = pvx + dx * ca - dy * sa, wy = pvy + dx * sa + dy * ca;
          lx = Math.min(lx, wx); hx = Math.max(hx, wx); ly = Math.min(ly, wy); hy = Math.max(hy, wy);
        }
        b0 = lx; b1 = ly; b2 = hx; b3 = hy;
      }
      return [Math.max(0, Math.floor(ox + b0 * S) - 1), Math.max(0, Math.floor(oy - b3 * S) - 1), Math.min(W - 1, Math.ceil(ox + b2 * S) + 1), Math.min(H - 1, Math.ceil(oy - b1 * S) + 1)];
    };
    // 1. the height field: every primitive melted into what is already there
    for (let pi = 0; pi < prims.length; pi++) {
      const p = prims[pi], [x0, y0, x1, y1] = box(p, 0.01), kk = p.k * S, mat = p.m;
      for (let y = y0; y <= y1; y++) {
       if ((y - y0) % 10 === 9) yield; // big shapes: a breath every few rows
       for (let x = x0; x <= x1; x++) {
        at(x, y); ev(p);
        const k = y * W + x, sdp = SD * S;
        if (sdp < Sd[k]) Sd[k] = sdp;
        if (sdp > 2.5) continue;
        const hp = HG * S, tu = UU * 128 + p.tu, tv = VV * 128 + p.tv;
        let bm = 0, cr = 0, mo = 0.5, m2 = 0.5, gr = 0, fl = 0, pt = 0, tt = 0, et = 0;
        if (mat === SKIN) {
          bm = samp(TB, tu, tv) * p.bs; cr = near(TC, tu, tv) * p.bs; gr = near(TG, tu, tv); fl = near(TF, tu, tv) * p.bs; mo = near(TMo, tu * 0.5, tv * 0.5); m2 = near(TM2, tu, tv);
          if (p.fx) bm += p.fx(XX, WW, UU, VV);
          if (p.paint) { paintAt(p); pt = FP; tt = FT; et = FE; bm = bm * (1 - 0.7 * pt) + pt * 0.9 + tt * 0.5 - et * 1.2; }
        } else if (mat === HAT) { bm = (near(TG, tu * 0.7, tv * 0.4) * -0.25 + (near(TMo, tu, tv) - 0.5) * 0.5) ; mo = near(TMo, tu * 3, tv * 3); }
        else if (mat === POM) { bm = (near(TF, tu * 3, tv * 3) + near(TG, tu * 4, tv * 4)) * 1.4; mo = near(TMo, tu * 9, tv * 9); }
        else { mo = near(TMo, tu * 0.6, tv * 0.6); bm = (mo - 0.5) * 0.3; if (p.fx) bm += p.fx(XX, WW, UU, VV); if (p.paint) { paintAt(p); pt = FP; bm += pt * 0.4; } }
        bm *= bsc;
        const a = Hh[k];
        let hb;
        if (Id[k] < 0) hb = 1;
        else if (kk > 0.01) { hb = 0.5 + (0.5 * (hp - a)) / kk; hb = hb < 0 ? 0 : hb > 1 ? 1 : hb; }
        else hb = hp > a ? 1 : 0;
        if (hb <= 0) continue;
        Hh[k] = a + (hp - a) * hb + kk * hb * (1 - hb);
        Bm[k] += (bm - Bm[k]) * hb; Cr[k] += (cr - Cr[k]) * hb; Mo[k] += (mo - Mo[k]) * hb; Ms[k] += (m2 - Ms[k]) * hb; Gr[k] += (gr - Gr[k]) * hb; Fl[k] += (fl - Fl[k]) * hb; Pt[k] += (pt - Pt[k]) * hb; Tt[k] += (tt - Tt[k]) * hb; Et[k] += (et - Et[k]) * hb;
        if (hb >= 0.5) { Id[k] = pi; Xs[k] = XX; Ws[k] = WW; }
       }
      }
      yield;
    }
    // 2. where one part meets another, the nearer one shades the other
    for (let pi = 0; pi < prims.length; pi++) {
      const p = prims[pi]; if (!p.ao) continue;
      const R = p.rm * 0.7 + 0.012, [x0, y0, x1, y1] = box(p, R), top = (p.z + p.rm * 0.6) * S, lim = p.rm * S * 0.6;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (x === x0 && (y - y0) % 14 === 13) yield;
        const k = y * W + x, id = Id[k];
        if (id < 0 || prims[id].g === p.g || Sd[k] > 0.5 || top < Hh[k] - lim) continue;
        at(x, y); ev(p);
        const o = p.ao * Math.exp((-2.4 * Math.max(0, SD)) / R);
        if (o > Oc[k]) Oc[k] = o;
      }
      yield;
    }
    // 3. light
    const Ht = buf('Ht', n, 0);
    for (let k = 0; k < n; k++) Ht[k] = Hh[k] + Bm[k];
    const [Lx, Ly, Lz] = nrm(spec.lx == null ? 0.3 : spec.lx, spec.ly || 0.86, spec.lz || 0.42), [Hx, Hy, Hz] = nrm(Lx, Ly, Lz + 1), [Fx, Fy, Fz] = nrm(0, 0.25, 1), [Gx, Gy, Gz] = nrm(0, 0.25, 2);
    const out = { D: [mk(W, H), mk(W, H)], L: [mk(W, H), mk(W, H)] }, im = [0, 1, 2, 3].map(() => new ImageData(W, H)), dD = im[0].data, dDk = im[1].data, dL = im[2].data, dLk = im[3].data;
    const T = 4 * bsc, hsh = spec.hsh, col = spec.col, gloss = spec.gloss == null ? 1 : spec.gloss, R2 = rng(spec.seed || 5);
    const eD = 0.95, eL = 1.5, out_ = (q) => Id[q] < 0 || Sd[q] > 0.8;
    // a slope from the two sides: where one side jumps (another part in front, or the edge), the other side is trusted
    const pick = (a, b) => (Math.abs(a) > T && Math.abs(b) > T ? (a > 1e8 && b > 1e8 ? 0 : Math.abs(a) < Math.abs(b) ? a : b) : Math.abs(a) > T ? b : Math.abs(b) > T ? a : (a + b) * 0.5);
    for (let y = 0; y < H; y++) {
      const wy = (spec.wy || 0) + (oy - y - 0.5) / S;
      for (let x = 0; x < W; x++) {
        const k = y * W + x, id = Id[k];
        if (id < 0) continue;
        let cov = 0.5 - Sd[k]; if (cov <= 0) continue; if (cov > 1) cov = 1;
        const hc = Ht[k];
        let dl = x > 0 && !out_(k - 1) ? hc - Ht[k - 1] : 1e9, dr = x < W - 1 && !out_(k + 1) ? Ht[k + 1] - hc : 1e9;
        let du = y > 0 && !out_(k - W) ? Ht[k - W] - hc : 1e9, dd = y < H - 1 && !out_(k + W) ? hc - Ht[k + W] : 1e9;
        let gx = pick(dl, dr), gy = pick(du, dd);
        if (Sd[k] > -1.5) { const ax = (x > 0 && out_(k - 1)) ? 1 : (x < W - 1 && out_(k + 1)) ? -1 : 0, ay = (y > 0 && out_(k - W)) ? -1 : (y < H - 1 && out_(k + W)) ? 1 : 0; gx += ax * 2.5; gy += ay * 2.5; } // the edge turns away
        gx = gx > 7 ? 7 : gx < -7 ? -7 : gx; gy = gy > 7 ? 7 : gy < -7 ? -7 : gy;
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1), nx = -gx * il, ny = -gy * il, nz = il;
        const p = prims[id], m = p.m, pt = Pt[k];
        const nl = nx * Lx + ny * Ly + nz * Lz, nh = Math.max(0, nx * Hx + ny * Hy + nz * Hz), nf = Math.max(0, nx * Fx + ny * Fy + nz * Fz), ng = Math.max(0, nx * Gx + ny * Gy + nz * Gz);
        let sh = 1;
        if (hsh) { const q = ((x + 0.5 - ox) / S - hsh[0]) ** 2 / (hsh[2] * hsh[2]) + ((oy - y - 0.5) / S - hsh[1]) ** 2 / (hsh[3] * hsh[3]); sh = 0.4 + 0.6 * ss(0.5, 1.2, q); }
        const ao = (1 - Oc[k]) * (spec.vert ? 0.12 + 0.88 * Math.pow(ss(0.15, 1.95, wy), 1.3) : 1);
        let dif = Math.max(0, (nl + 0.18) / 1.18); dif *= dif * 1.15;
        const rim = Math.pow(1 - nz, 2.4) * (0.3 + 0.7 * Math.max(0, ny + 0.25)) * Math.sqrt(ao) * (spec.rim || 1);
        let lr, lg, lb, kr, kg, kb;
        if (m === RUB) {
          const c0 = col[0], c1 = col[1], c2 = col[2], tr = Math.pow(1 - nz, 1.4) * 0.45 + Math.max(0, -ny) * 0.22;
          const hx = nx - Hx * 0.95, hy = ny - Hy * 0.95, win = Math.exp(-(hx * hx) / 0.012 - (hy * hy) / 0.004) * 1.5 * gloss + Math.exp(-((nx - Gx) ** 2) / 0.006 - ((ny - Gy) ** 2) / 0.006) * 0.35 * gloss;
          const sheen = Math.pow(nh, 8) * 0.14 + Math.pow(1 - nz, 4) * 0.35, lift = (Mo[k] - 0.5) * 0.08;
          const d0 = (dif * 0.9 + nf * 0.15 + 0.08) * ao * sh + lift;
          lr = c0 * d0 + c0 * c0 * tr + win + sheen * 0.95; lg = c1 * d0 + c1 * c1 * tr + win + sheen * 0.88; lb = c2 * d0 + c2 * c2 * tr + win * 0.95 + sheen * 0.6;
          kr = c0 * 0.03 + sheen * 0.3 + win * 0.06; kg = c1 * 0.03 + sheen * 0.27 + win * 0.06; kb = c2 * 0.03 + sheen * 0.18 + win * 0.06;
          if (pt > 0) { const pr = 0.04 * d0 + Math.pow(nh, 40) * 0.5 * gloss, q = pt; lr += (pr - lr) * q; lg += (pr - lg) * q; lb += (pr - lb) * q; kr *= 1 - q; kg *= 1 - q; kb *= 1 - q; }
        } else {
          let ar, ag, ab, wax, spk = 1;
          const mo = Mo[k];
          if (m === SKIN) {
            const cr = Cr[k], gr = Gr[k], fl = Fl[k];
            ar = 0.9; ag = 0.74; ab = 0.28;
            const sn = ss(0.58, 0.66, mo) * 0.6 + Math.exp(-(((mo - 0.58) / 0.016) ** 2)) * 0.55 + ss(0.68, 0.78, Ms[k]) * 0.45; // stains, each with its tide mark
            ar += (0.46 - ar) * sn; ag += (0.33 - ag) * sn; ab += (0.12 - ab) * sn;
            let t = ss(0.55, 0.86, mo) * 0.8; ar += (0.5 - ar) * t; ag += (0.37 - ag) * t; ab += (0.15 - ab) * t;
            t = ss(0.38, 0.1, mo) * 0.55; ar += (0.9 - ar) * t; ag += (0.83 - ag) * t; ab += (0.55 - ab) * t;
            t = ss(0.62, 0.9, Ms[k]) * 0.25; ar += (0.6 - ar) * t; ag += (0.62 - ag) * t; ab += (0.38 - ab) * t;
            t = spec.vert ? ss(0.85, 0.02, wy) * 0.6 : 0; ar += (0.34 - ar) * t; ag += (0.25 - ag) * t; ab += (0.1 - ab) * t;
            t = cr * 0.92; ar += (0.17 - ar) * t; ag += (0.11 - ag) * t; ab += (0.05 - ab) * t;
            t = (p.grime || 0) * (0.55 + 0.45 * mo) * (p.gw ? ss(p.gw[0], p.gw[1], Ws[k]) : 1); ar += (0.28 - ar) * t; ag += (0.2 - ag) * t; ab += (0.08 - ab) * t; // grime where it touches things
            t = 1 + Math.max(-0.45, Math.min(0, Bm[k] / bsc) * 0.16); ar *= t; ag *= t; ab *= t; // dirt in the creases
            const f = (1 + fl * 0.14) * (1 - gr * 0.09) * (R2() < 0.025 ? 0.85 : 1); ar *= f; ag *= f; ab *= f;
            wax = (1 - cr) * (1 - 0.6 * gr) * (0.5 + 0.4 * (1 - mo)) * (spec.wax || 1);
          } else if (m === HAT) {
            const W_ = Ws[k], ph = Math.asin(Xs[k]) + (p.hy || 0), f = W_ * 5.4 + ph * 0.9, fr = f - Math.floor(f), e = Math.min(fr, Math.abs(fr - 0.5), 1 - fr) * (p.len * S) / 5.4;
            const st = fr < 0.5 ? 1 : 0, aa = ss(0, 1.2, e), sA = st ? [0.93, 0.24, 0.55] : [0.13, 0.7, 0.74], sB = st ? [0.13, 0.7, 0.74] : [0.93, 0.24, 0.55];
            ar = sB[0] + (sA[0] - sB[0]) * (0.5 + 0.5 * aa); ag = sB[1] + (sA[1] - sB[1]) * (0.5 + 0.5 * aa); ab = sB[2] + (sA[2] - sB[2]) * (0.5 + 0.5 * aa);
            if (W_ < 0.07) { ar = 0.9; ag = 0.74; ab = 0.32; spk = 2.2; }
            const fade_ = 0.82 + 0.18 * mo; ar *= fade_; ag *= fade_; ab *= fade_; wax = 0.9;
          } else if (m === CLOTH) { const hem = ss(0.06, 0.03, Ws[k] * p.len) * (0.5 + 0.5 * Math.sin(Math.asin(Xs[k]) * 30)); ar = 0.93 - hem * 0.3; ag = 0.8 - hem * 0.3; ab = 0.84 - hem * 0.2; wax = 0.15; }
          else if (m === CAKE) { const ic = ss(0.15, 0.3, Ws[k] + 0.12 * Math.sin(Math.asin(Xs[k]) * 14)); ar = 0.97 - ic * 0.05; ag = 0.94 - ic * 0.5; ab = 0.9 - ic * 0.3; wax = 0.6; }
          else { ar = 1; ag = 0.97; ab = 0.92; wax = 0.5; spk = 1 + (mo > 0.7 ? 6 : 0); }
          const amb = (0.1 + 0.08 * ny) * ao * (spec.amb || 1), key = dif * ao * sh, fill = nf * (spec.fill || 0.24) * ao;
          const sss = m === SKIN ? Math.max(0, 1 - Math.abs(nl - 0.05) * 3) * 0.13 * ao + Math.pow(1 - nz, 1.5) * 0.12 * ao : 0; // (and a felt's fuzz at the edges)
          const spc = (Math.pow(nh, 20) * 0.12 + Math.pow(nh, 80) * 0.18) * wax * spk;
          lr = ar * (key + fill + amb) + sss * ar + spc + rim * 0.45 * 0.95; lg = ag * (0.98 * key + fill + amb * 0.92) + sss * ag * 0.55 + spc * 0.98 + rim * 0.45 * 0.88; lb = ab * (0.88 * key + fill + amb * 0.6) + sss * ab * 0.2 + spc * 0.9 + rim * 0.45 * 0.62;
          kr = ar * (amb * 0.25 + fill * 0.1) + rim * 0.4 * 0.95 + spc * 0.05; kg = ag * (amb * 0.23 + fill * 0.1) + rim * 0.4 * 0.88 + spc * 0.05; kb = ab * (amb * 0.15 + fill * 0.1) + rim * 0.4 * 0.62 + spc * 0.05;
          if (pt > 0) { // glossy black enamel, and teeth in it
            const te = pt * Tt[k], bk = pt - te, sp = Math.pow(nh, 60) * 0.9 + Math.pow(ng, 40) * 0.4 + Math.pow(nh, 8) * 0.06, fr = Math.pow(1 - nz, 3) * 0.3, b = 0.03 * (key + fill + amb);
            lr += (b + sp + fr * 0.95 - lr) * bk; lg += (b * 0.9 + sp + fr * 0.88 - lg) * bk; lb += (b * 0.85 + sp * 0.95 + fr * 0.62 - lb) * bk;
            kr += (fr * 0.5 + sp * 0.04 - kr) * bk; kg += (fr * 0.45 + sp * 0.04 - kg) * bk; kb += (fr * 0.32 + sp * 0.04 - kb) * bk;
            if (te > 0) { const l = key + fill * 1.4 + amb + 0.12, ts = Math.pow(nh, 30) * 0.5 + Math.pow(ng, 20) * 0.25;
              lr += (0.9 * l + ts - lr) * te; lg += (0.84 * l + ts - lg) * te; lb += (0.62 * l + ts * 0.9 - lb) * te; kr += (0.9 * 0.1 + ts * 0.05 - kr) * te; kg += (0.84 * 0.1 - kg) * te; kb += (0.62 * 0.1 - kb) * te; }
          }
          const et = Et[k];
          if (et > 0) { const q = et * 0.96, b = 0.012 * (key + amb); lr += (b - lr) * q; lg += (b - lg) * q; lb += (b - lb) * q; kr *= 1 - q; kg *= 1 - q; kb *= 1 - q; }
        }
        const q = k * 4, a = Math.round(cov * 255), dn = (R2() - 0.5) * 2;
        dD[q] = 255 * (1 - Math.exp(-lr * eD)) + dn; dD[q + 1] = 255 * (1 - Math.exp(-lg * eD)) + dn; dD[q + 2] = 255 * (1 - Math.exp(-lb * eD)) + dn; dD[q + 3] = a;
        dDk[q] = 255 * (1 - Math.exp(-kr * eD)) + dn; dDk[q + 1] = 255 * (1 - Math.exp(-kg * eD)) + dn; dDk[q + 2] = 255 * (1 - Math.exp(-kb * eD)) + dn; dDk[q + 3] = a;
        dL[q] = 255 * (1 - Math.exp(-lr * eL)) + dn; dL[q + 1] = 255 * (1 - Math.exp(-lg * eL)) + dn; dL[q + 2] = 255 * (1 - Math.exp(-lb * eL)) + dn; dL[q + 3] = a;
        dLk[q] = 255 * (1 - Math.exp(-kr * eL * 1.3)) + 18 + dn; dLk[q + 1] = 255 * (1 - Math.exp(-kg * eL * 1.3)) + 13 + dn; dLk[q + 2] = 255 * (1 - Math.exp(-kb * eL * 1.3)) + 6 + dn; dLk[q + 3] = a;
      }
      if ((y & 3) === 3) yield;
    }
    out.D[0].getContext('2d').putImageData(im[0], 0, 0); out.D[1].getContext('2d').putImageData(im[1], 0, 0);
    out.L[0].getContext('2d').putImageData(im[2], 0, 0); out.L[1].getContext('2d').putImageData(im[3], 0, 0);
    return { W, H, ox, oy, S, lv: { D: [{ lit: out.D[0], dark: out.D[1] }], L: [{ lit: out.L[0], dark: out.L[1] }] } };
  }

  // ---- the figure, in metres from between its feet (y up); the arm that moves is on +x, the side the tube is on ----
  const SB = 176, SH = 352; // px per metre: the body; the head and the small things
  const NECK = 2.0;         // the head turns about here
  const TILTS = [-1.25, -0.42, -0.26, -0.13, 0, 0.13, 0.26, 0.42, 1.25];
  const YAWS = [Math.PI, 2.35, 1.55, 0.8]; // the head turned round over its shoulder (then TILTS[4], to us)
  // relief (px at 128 px/m) in a surface's own frame: XX across (-1 … 1), WW along (0 … 1) or up (-1 … 1), UU / VV metres
  // the trunk's skin (UU across, metres from the middle; VV the height): in front a hollow down the breastbone, collarbones, the skin
  // bunched in folds at the waist and hanging in a fold over the belly; behind, the spine and the blades
  const front = (XX, WW, UU, VV) => {
    const ax = Math.abs(UU), sk = 0.5 + 0.5 * Math.cos(((VV - 1.33) * 6.283) / 0.022 + Math.sin(UU * 60));
    return -0.9 * Math.exp(-((UU / 0.012) ** 2)) * ss(1.5, 1.6, VV) * (1 - ss(1.76, 1.8, VV))      // the breastbone
      + 0.7 * Math.exp(-(((VV - 1.77 - ax * 0.22) / 0.007) ** 2)) * ss(0.02, 0.04, ax) * (1 - ss(0.1, 0.13, ax)) // collarbones, rising outward
      - 0.55 * Math.exp(-(((VV - 1.232 - UU * UU * 7) / 0.012) ** 2)) * (1 - ss(0.04, 0.075, ax)) + 0.5 * Math.exp(-(((VV - 1.255 - UU * UU * 5) / 0.02) ** 2)) * (1 - ss(0.05, 0.09, ax)) // the skin hanging over the belly
      - 0.35 * sk * sk * sk * ss(1.32, 1.34, VV) * (1 - ss(1.36, 1.38, VV)) * (0.5 + 0.5 * Math.sin(UU * 47 + 1)); // skin bunched at the waist
  };
  const back_ = (XX, WW, UU, VV) => -1.3 * Math.exp(-((UU / 0.012) ** 2)) + 0.9 * Math.exp(-((UU / 0.005) ** 2)) * ss(0.1, 0.9, Math.cos((VV * 6.283) / 0.03)) * ss(1.3, 1.5, VV)
    + 1.7 * Math.exp(-(((Math.abs(UU) - 0.075) / 0.032) ** 2) - (((VV - 1.68) / 0.06) ** 2));
  const rings = (XX, WW, UU, VV) => { const c = 0.5 + 0.5 * Math.cos((VV * 6.283) / 0.024 + Math.sin(VV * 90) * 1.2); return -0.35 * c * c * c * c * (0.5 + 0.5 * Math.sin(VV * 37 + UU * 80)) * ss(1.86, 1.9, VV); };
  const crease = (len, end, amp) => (XX, WW, UU, VV) => { const d = end ? len - VV : VV, f = Math.exp(-d / 0.03); if (f < 0.02) return 0; const c = 0.5 + 0.5 * Math.cos((d * 6.283) / 0.011); return -amp * f * c * c * c; };
  const sockets = (yaw) => (XX, WW) => { const ph = Math.asin(XX) - yaw; let b = 0.35 * Math.exp(-(ph * ph) / 0.5 - ((WW - 0.28) ** 2) / 0.01); for (const s of [-0.42, 0.41]) b -= 1.3 * Math.exp(-((ph - s) ** 2) / 0.035 - ((WW - 0.24) ** 2) / 0.014); return b; };

  const both = (f, g) => (a, b, c, d) => f(a, b, c, d) + g(a, b, c, d);
  /**
   * An arm from the shoulder (sx, sy) on side d: a1, a2, a3 the upper arm, forearm and hand, each an angle from straight down
   * toward that side. One continuous limb: the elbow and the wrist only knobs under the skin, the skin creased round them and
   * hanging slack under the upper arm; a big hand of long fingers, three joints each, spread or curled.
   */
  function arm(P, d, sx, sy, a1, a2, a3, o) {
    const g = o.g, z = o.z || 0, dv = (a) => [d * Math.sin(a), -Math.cos(a)], curl = o.curl || 0, L1 = o.L1 || 0.47, L2 = o.L2 || 0.48, gr = 0.75;
    const [ux, uy] = dv(a1), ex = sx + ux * L1, ey = sy + uy * L1, [fx, fy] = dv(a2), wx = ex + fx * L2, wy = ey + fy * L2, [hx, hy] = dv(a3);
    P.push(cap(sx, sy, ex, ey, 0.035, 0.021, { g, z, k: 0.045, ao: 0.45, kn: [[1, 0.008, 0.028]], fx: both(crease(L1, 1, 1.3), crease(L1, 0, 0.8)) }));
    const mx = sx + ux * L1 * 0.42, my = sy + uy * L1 * 0.42, sag = uy < -0.6 ? 0.012 : 0.02; // the slack skin under it, hanging
    P.push(ell(mx, my - sag, L1 * 0.3, 0.017, 0.016, { g, z: z - 0.006, rot: Math.atan2(-ux, uy) + Math.PI / 2, k: 0.035, ao: 0.2, tp: 0.15 }));
    P.push(cap(ex, ey, wx, wy, 0.021, 0.0125, { g, z, k: 0.04, ao: 0.35, kn: [[0, 0.008, 0.028], [1, 0.006, 0.014]], fx: crease(L2, 0, 1.2), grime: gr * 0.6, gw: [0.4, 1] }));
    P.push(ell(wx + hx * 0.056, wy + hy * 0.056, 0.032, 0.06, 0.013, { g, z: z + 0.003, rot: Math.atan2(-hx, hy), k: 0.03, grime: gr }));
    const bx0 = wx + hx * 0.106, by0 = wy + hy * 0.106, ax = -hy, ay = hx;
    for (let f = 0; f < 4; f++) { // long fingers, three joints each, apart
      const off = (f - 1.5) * 0.019, len = [0.15, 0.18, 0.172, 0.138][f] * (o.fl || 1), sp = (f - 1.5) * (o.spread || 0.1) + (f === 3 ? 0.05 : 0);
      let x = bx0 + ax * off, y = by0 + ay * off, an = a3 + d * sp;
      [[0.44, 0.0086, 0.0074], [0.32, 0.0074, 0.0062], [0.24, 0.0062, 0.0042]].forEach(([q, r0, r1], k) => {
        if (k) an -= d * curl * (0.55 + 0.1 * f);
        const sh = k ? 1 - 0.3 * Math.max(0, curl) : 1, [vx, vy] = dv(an), nx = x + vx * len * q * sh, ny = y + vy * len * q * sh;
        P.push(cap(x, y, nx, ny, r0, r1, { g, z: z + 0.006, k: 0.004, ao: 0.25, bs: 0.6, kn: [[0, 0.0016, 0.006]], grime: gr }));
        x = nx; y = ny;
      });
    }
    if (o.thumb) {
      const [tx, ty] = dv(a3 - d * (o.palmOut ? 0.95 : 0.25)), b0x = wx + hx * 0.035 - d * 0.02, b0y = wy + hy * 0.035, zt = z + (o.palmOut ? 0.008 : 0.03);
      P.push(cap(b0x, b0y, b0x + tx * 0.055, b0y + ty * 0.055, 0.0105, 0.0082, { g, z: zt, k: 0.006, ao: 0.2, bs: 0.6, grime: gr }));
      P.push(cap(b0x + tx * 0.055, b0y + ty * 0.055, b0x + tx * 0.1, b0y + ty * 0.1, 0.0082, 0.0055, { g, z: zt, k: 0.004, ao: 0.2, bs: 0.6, grime: gr }));
    }
  }
  // the arm on +x, pose by pose: [upper arm, forearm, hand, z, curl, spread, palm to us]; the hanging one is bent the wrong way at the elbow
  const ARM = [[0.13, -0.12, -0.05, 0, 0.35, 0.09, 0], [0.85, 2.35, 2.6, 0.04, 0.15, 0.14, 1],
    ...[0.5, 0.2, -0.12, -0.4].map((t) => [1.22, Math.PI - t, Math.PI - t * 1.35, 0.05, -0.15, 0.24, 1]),                // 2 … 5: waving, the fingers bent back
    [0.62, 2.0, 2.2, 0.07, 0, 0.12, 1], [0.62, 2.12, 2.55, 0.07, 0.55, 0.09, 1], [0.62, 2.25, 2.95, 0.07, 1, 0.07, 1]]; // 6 … 8: beckoning
  // the trunk, bottom up: [y, centre x, half-width left, right, depth, centre z]: an S in the spine, hunched (the shoulders and neck come forward),
  // the left shoulder higher than the right, starved at the waist, the belly hanging, a neck far too long
  const TRUNK = [[1.1, 0, 0.02, 0.02, 0.03, 0], [1.14, 0.002, 0.084, 0.086, 0.058, 0], [1.2, 0.004, 0.1, 0.103, 0.064, 0], [1.27, 0.006, 0.094, 0.097, 0.07, 0.008],
    [1.335, 0.009, 0.07, 0.068, 0.058, 0.004], [1.41, 0.007, 0.068, 0.066, 0.052, 0], [1.49, 0, 0.092, 0.09, 0.062, 0.002], [1.58, -0.006, 0.11, 0.107, 0.07, 0.007],
    [1.67, -0.01, 0.12, 0.118, 0.074, 0.013], [1.735, -0.011, 0.138, 0.152, 0.068, 0.019], [1.775, -0.009, 0.158, 0.15, 0.058, 0.023], [1.805, -0.007, 0.165, 0.1, 0.048, 0.025],
    [1.835, -0.005, 0.125, 0.048, 0.04, 0.027], [1.865, -0.003, 0.048, 0.035, 0.032, 0.03], [1.92, 0, 0.031, 0.03, 0.028, 0.034], [2.09, 0.004, 0.026, 0.026, 0.025, 0.038]];
  function bodyPrims(pose, isBack) {
    PID = 0; const P = [];
    P.push(loft(TRUNK, { g: 0, ao: 0.3, k: 0.05, bs: 0.3, fx: both(isBack ? back_ : front, rings) }));
    for (const d of [-1, 1]) { // legs: long and thin, knock-kneed (the right more), the knees knobs under the skin, long flat feet turned out
      const g = d < 0 ? 1 : 2, kx = d * (d < 0 ? 0.046 : 0.038), ax = d * 0.118, zf = isBack ? -0.05 : 0.05;
      P.push(cap(d * 0.058, 1.22, kx, 0.64, 0.052, 0.031, { g, k: 0.05, ao: 0.15, bs: 0.6, kn: [[1, 0.01, 0.03]], fx: crease(0.58, 1, 0.9) }));
      P.push(cap(kx, 0.64, ax, 0.075, 0.031, 0.017, { g, k: 0.04, ao: 0.3, bs: 0.6, kn: [[0, 0.01, 0.03], [1, 0.007, 0.015]], grime: 0.5, gw: [0.3, 1] }));
      P.push(cap(ax, 0.06, ax + d * 0.075, 0.016, 0.024, 0.017, { g, z: zf * 0.5, fz: 0.55, k: 0.03, ao: 0.3, grime: 0.8 }));
      for (let t = 0; t < 3; t++) { const bx = ax + d * 0.075, by = 0.016 + (t - 1) * 0.008, ex = bx + d * (0.045 - Math.abs(t - 1) * 0.008); P.push(cap(bx, by, ex, by - 0.004 - t * 0.002, 0.0072, 0.0048, { g, z: zf * 0.6, k: 0.004, ao: 0.2, grime: 0.85 })); }
    }
    arm(P, -1, -0.155, 1.795, ARM[0][0], ARM[0][1], ARM[0][2], { g: 3, curl: ARM[0][4], spread: ARM[0][5], thumb: !isBack, L1: 0.48, L2: 0.5 });
    const A = ARM[isBack ? 0 : pose];
    arm(P, 1, 0.148, 1.752, A[0], A[1], A[2], { g: 4, z: A[3], curl: A[4], spread: A[5], palmOut: A[6], thumb: !isBack });
    return P;
  }
  /** The head, the pivot at (0, 0): faceless, the smile painted on (turned yaw round from us), a paper hat askew. */
  function headPrims(yaw) {
    PID = 300; const q = 1.13, P = [], pf = [0, 0.13 * q, 0.1 * q, 0.128 * q, 0.08], hl = 0.17 * Math.cos(yaw);
    P.push(ell(0, 0.13 * q, 0.1 * q, 0.128 * q, 0.1 * q, { g: 5, tp: 0.08, paint: 1, pf, bs: 0.25, fx: sockets(yaw) }));
    P.push(ell(0, 0.052 * q, 0.068 * q, 0.05 * q, 0.08 * q, { g: 5, k: 0.04, bs: 0.25, paint: 1, pf }));
    const bx = 0.008, by = 0.235 * q, ax = bx - Math.sin(hl) * 0.26, ay = by + Math.cos(hl) * 0.26;
    P.push(cone(bx, by, ax, ay, 0.072, { g: 6, m: HAT, z: 0.014, ao: 0.55, hy: yaw }));
    P.push(ell(ax, ay, 0.023, 0.023, 0.023, { g: 7, m: POM, z: 0.02, lump: 0.22, ao: 0.3 }));
    return P;
  }
  /** A little table under a cloth to the floor, a cake of two tiers on it (the candles are lit per frame). */
  const folds = (XX, WW, UU, VV) => Math.sin(UU * 80 + Math.sin(VV * 9) * 2) * 1.3 * ss(0.7, 0.1, VV);
  const cakePrims = () => { PID = 600; return [cone(0, 0, 0, 4, 0.36, { m: CLOTH, cut: 0.74, g: 0, fx: folds, k: 0, ao: 0 }),
    ell(0, 0.8, 0.17, 0.07, 0.17, { m: CAKE, g: 1, ao: 0.45, k: 0.01 }), ell(0, 0.885, 0.115, 0.05, 0.115, { m: CAKE, g: 2, ao: 0.45, k: 0.01 })]; };
  /** A length of neck (0.5 m along +x), drawn stretched and turned where a neck goes where no neck should. */
  const neckPrims = () => { PID = 400; return [cap(0, 0, 0.5, 0, 0.04, 0.036, { g: 0, k: 0.02, fx: rings })]; };
  /** Four long fingers hooked round an edge at x = 0, reaching +x. */
  const gripPrims = () => { PID = 450; const P = []; for (let f = 0; f < 4; f++) { const y = f * 0.021, l = [0.1, 0.12, 0.116, 0.094][f]; P.push(cap(-0.03, y, l * 0.5, y + 0.004, 0.0095, 0.0085, { g: f, k: 0.003, ao: 0.35 }), ell(l * 0.5, y + 0.004, 0.0098, 0.0098, 0.009, { g: f, k: 0.003, ao: 0 }), cap(l * 0.5, y + 0.004, l, y - 0.01, 0.0078, 0.0055, { g: f, k: 0.003, ao: 0.35 })); } return P; };

  // ---- balloons: knot at the origin ----
  const BCOL = [[0.86, 0.1, 0.13], [0.12, 0.3, 0.88], [0.1, 0.62, 0.28], [0.95, 0.32, 0.64], [0.55, 0.22, 0.82]];
  const wrink = (st, Ry) => (XX, WW, UU, VV) => {
    const dy = VV + Ry, db = Math.hypot(UU, dy), th = Math.atan2(UU, dy), c = 0.5 + 0.5 * Math.cos(th * 26 + Math.sin(th * 7) * 2);
    let b = -c * c * Math.exp(-db / (0.016 + st * 0.03)) * (1.2 + st);
    if (st) b += (Math.sin(UU * 38 + VV * 21 + Math.sin(VV * 30)) * 0.9 + Math.sin(UU * -27 + VV * 47) * 0.6 + Math.sin(UU * 70 - VV * 12) * 0.3) * st * 0.9;
    return b;
  };
  function balloonPrims(st, eq) {
    PID = 500 + st * 7; const R = [0.15, 0.148, 0.15][st], Ry = [0.185, 0.165, 0.14][st], cy = 0.028 + Ry * 0.97, tp = [0.09, 0.02, -0.14][st];
    return [ell(0, cy, R, Ry, R * [1, 0.92, 0.72][st], { m: RUB, g: 0, tp, lump: [0, 0.03, 0.075][st], k: 0.012, ao: 0, fx: wrink(st, Ry), paint: eq ? 2 : 0, pf: [0, cy, R, Ry, tp] }),
      cap(0, 0.006, 0, 0.042, 0.0075, 0.017, { m: RUB, g: 0, k: 0.01, ao: 0 }), ell(0, 0.004, 0.012, 0.0065, 0.009, { m: RUB, g: 1, lump: 0.2, ao: 0.4 })];
  }

  // ---- the sprites, shaded a few milliseconds a frame while a visit runs (kept for the next one) ----
  /** A sprite spec sized to its primitives (turned by rot about the origin). */
  function fit(prims, S, rot, extra) {
    let lx = 1e9, ly = 1e9, hx = -1e9, hy = -1e9; const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
    for (const p of prims) for (const [qx, qy] of [[p.bb[0], p.bb[1]], [p.bb[2], p.bb[1]], [p.bb[0], p.bb[3]], [p.bb[2], p.bb[3]]]) {
      const wx = qx * ca - qy * sa, wy = qx * sa + qy * ca; lx = Math.min(lx, wx); hx = Math.max(hx, wx); ly = Math.min(ly, wy); hy = Math.max(hy, wy);
    }
    const m = 3 / S, ox = Math.ceil((m - lx) * S), oy = Math.ceil((hy + m) * S);
    return Object.assign({ W: ox + Math.ceil((hx + m) * S), H: oy + Math.ceil((m - ly) * S), ox, oy, S, prims, rot: rot || 0, pvx: 0, pvy: 0 }, extra);
  }
  const SP = {}, Q = { list: [], cur: null, name: '', ms: 0, n: 0 };
  const BODY = (o) => Object.assign({ wy: 0, vert: 1, ly: 0.97, lz: 0.26, fill: 0.09, amb: 0.7, rim: 1.7, wax: 1.5 }, o); // lit from straight above: the legs go into the dark
  const JOB = (name) => {
    if (name === 'tex') return textures();
    const [kind, a, b] = name.split(':'), i = Number(a), lx = 0.32;
    if (kind === 'body') return render(fit(bodyPrims(i, false), SB, 0, BODY({ lx, hsh: [-0.02, 2.03, 0.075, 0.06], seed: 3 + i })));
    if (kind === 'back') return render(fit(bodyPrims(0, true), SB, 0, BODY({ lx, hsh: [0.02, 2.03, 0.075, 0.06], seed: 31 })));
    if (kind === 'head') return render(fit(headPrims(0), SH, TILTS[i], { lx, seed: 40 + i }));
    if (kind === 'yaw') return render(fit(headPrims(YAWS[i]), SH, 0, { lx, yaw: YAWS[i], seed: 60 + i }));
    if (kind === 'bal') return render(fit(balloonPrims(Number(b), false), SH, 0, { lx: 0.25, col: BCOL[i], gloss: [1, 0.55, 0.22][Number(b)], seed: 70 + i }));
    if (kind === 'eq') return render(fit(balloonPrims(0, true), SH, 0, { lx: 0.25, col: BCOL[0], yaw: [0, 0.65, 1.3, 2.2][i], seed: 90 + i }));
    if (kind === 'neck') return render(fit(neckPrims(), SB, 0, { lx: 0, seed: 95 }));
    if (kind === 'grip') return render(fit(gripPrims(), SH, 0, { lx: 0.2, seed: 96 }));
    if (kind === 'cake') return render(fit(cakePrims(), SH, 0, { lx: 0, seed: 97 }));
    return null;
  };
  /** Ask for sprites, most urgent first (the leather comes before everything). */
  function want(names) {
    if (!SP.tex && Q.name !== 'tex' && !Q.list.includes('tex')) Q.list.unshift('tex');
    const fresh = names.filter((n) => !SP[n] && Q.name !== n);
    Q.list = Q.list.filter((n) => !fresh.includes(n));
    Q.list.splice(Q.list[0] === 'tex' ? 1 : 0, 0, ...fresh);
  }
  /** Shade for at most ms milliseconds. */
  function pump(ms) {
    const t0 = performance.now(), end = t0 + ms;
    while (performance.now() < end) {
      if (!Q.cur) { if (!Q.list.length) break; Q.name = Q.list.shift(); if (SP[Q.name]) continue; Q.cur = JOB(Q.name); if (!Q.cur) { Q.name = ''; continue; } }
      const r = Q.cur.next();
      if (r.done) { SP[Q.name] = r.value || true; Q.cur = null; Q.name = ''; }
    }
    const dt = performance.now() - t0; Q.ms += dt; if (dt > (Q.max || 0)) Q.max = dt;
  }
  const ALL = () => ['tex', 'body:0', 'head:4', 'head:2', 'head:6', 'body:1', 'body:2', 'body:3', 'body:4', 'body:5', 'head:3', 'head:5', 'head:1', 'head:7', 'head:0', 'head:8',
    'back', 'yaw:0', 'yaw:1', 'yaw:2', 'yaw:3', 'body:6', 'body:7', 'body:8', 'neck', 'grip', 'cake', ...[0, 1, 2, 3].map((i) => 'eq:' + i),
    ...[0, 1, 2, 3, 4].map((c) => 'bal:' + c + ':0'), ...[0, 1, 2, 3, 4].flatMap((c) => ['bal:' + c + ':1', 'bal:' + c + ':2'])];

  // ---- laying sprites into the picture ----
  const half = (c) => { const h = mk(Math.ceil(c.width / 2), Math.ceil(c.height / 2)), x = h.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, h.width, h.height); return h; };
  /** The copy of a sprite nearest its size on screen (k: screen px per sprite px), halved as often as needed. */
  function lvl(sp, mode, k) {
    const L = sp.lv[mode]; let i = 0, kk = k * (window.devicePixelRatio || 1);
    while (kk < 0.55 && i < 4) { kk *= 2; i++; if (!L[i]) L[i] = { lit: half(L[i - 1].lit), dark: half(L[i - 1].dark) }; }
    return L[i];
  }
  /**
   * A sprite at screen (x, y) (its origin), s px per metre, mirrored by dir, turned by rot: what is behind it worn away,
   * then laid in at op, lit (0 … 1) blending the lit and the unlit renders (added, so the two always make one whole).
   */
  function put(ctx, sp, mode, s, x, y, dir, rot, op, lit, sx, sy) {
    if (!sp || sp === true || op <= 0.004) return;
    const k = s / sp.S, L = lvl(sp, mode, k), dx = -sp.ox * k, dy = -sp.oy * k, dw = sp.W * k * (sx || 1), dh = sp.H * k * (sy || 1);
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (dir < 0) ctx.scale(-1, 1);
    const ex = dx * (sx || 1), ey = dy * (sy || 1);
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.drawImage(L.lit, ex, ey, dw, dh);
    ctx.globalCompositeOperation = 'lighter';
    if (lit > 0.01) { ctx.globalAlpha = op * Math.min(1, lit); ctx.drawImage(L.lit, ex, ey, dw, dh); }
    if (lit < 0.99) { ctx.globalAlpha = op * (1 - Math.max(0, lit)); ctx.drawImage(L.dark, ex, ey, dw, dh); }
    ctx.restore();
  }
  const SHD = {};
  /** A soft shadow on the carpet under feet (two darker pools, one soft spread). */
  function shadowSpr(L) {
    if (SHD[L]) return SHD[L];
    const c = mk(128, 48), x = c.getContext('2d'), ink = L ? '60,44,18' : '0,0,0';
    for (const [cx, r, a] of [[64, 60, 0.5], [44, 22, 0.75], [84, 22, 0.75]]) { const g = x.createRadialGradient(cx, 24, 0, cx, 24, r); g.addColorStop(0, `rgba(${ink},${a})`); g.addColorStop(1, `rgba(${ink},0)`); x.fillStyle = g; x.fillRect(0, 0, 128, 48); }
    return (SHD[L] = c);
  }
  function shadow(g, BR, x, z, w, op) {
    if (!g.pr(x, z, 0)) return;
    const s = g.f / g.sz, rw = w * s, rh = rw * Math.min(1, BR.EYE / g.sz) * 0.75;
    g.ctx.globalAlpha = (g.L ? 0.42 : 0.7) * op; g.ctx.drawImage(shadowSpr(g.L), g.sx - rw / 2, g.sy - rh / 2, rw, rh); g.ctx.globalAlpha = 1;
  }
  /**
   * One of them standing at (x, z), facing us (or away: back), sc times as tall: the body in pose, the head on top
   * (head: a sprite name; hx / hy / hr move and turn it beyond its own pivot), its shadow, lit by its room.
   */
  function figure(g, BR, o) {
    if (!g.pr(o.x, o.z, 0)) return null;
    const ctx = g.ctx, sc = o.sc || 1, s = (g.f / g.sz) * sc, x = g.sx, y = g.sy, mode = g.L ? 'L' : 'D', op = (o.op == null ? 1 : o.op) * BR.far(g.sz) * (g.L ? 0.97 : 0.95);
    const lit = o.lit != null ? o.lit : cl(g.lum(BR.COL(o.x), BR.ROW(o.z)) * g.glob);
    if (!o.noShadow) shadow(g, BR, o.x, o.z, 0.7 * sc, op * (0.35 + 0.65 * lit));
    const body = SP[o.body] && SP[o.body] !== true ? SP[o.body] : SP['body:0'];
    put(ctx, body, mode, s, x, y, o.dir, 0, op, lit);
    const hd = SP[o.head] && SP[o.head] !== true ? SP[o.head] : SP['head:4'];
    if (!o.noHead) put(ctx, hd, mode, s, x + (o.hx || 0) * s * o.dir, y - (NECK + (o.hy || 0)) * s, o.dir, o.hr || 0, op, lit);
    return { s, x, y, op, lit };
  }

  // ---- strings: a few points hanging under the knot, each pulled by its weight and held to its neighbours ----
  const NS = 7;
  function mkStr(x, y, z, len) { const a = new Float32Array(NS * 6 + 1); a[NS * 6] = len / (NS - 1); for (let i = 0; i < NS; i++) { a[i * 6] = a[i * 6 + 3] = x; a[i * 6 + 1] = a[i * 6 + 4] = y - i * a[NS * 6]; a[i * 6 + 2] = a[i * 6 + 5] = z; } return a; }
  /** One step: held at the top (unless loose), the bottom held too if end is given; wind pushes it sideways a little. */
  function stepStr(a, x, y, z, loose, wind, end) {
    const seg = a[NS * 6];
    for (let i = loose ? 0 : 1; i < NS; i++) {
      const q = i * 6, vx = (a[q] - a[q + 3]) * 0.93, vy = (a[q + 1] - a[q + 4]) * 0.93, vz = (a[q + 2] - a[q + 5]) * 0.93;
      a[q + 3] = a[q]; a[q + 4] = a[q + 1]; a[q + 5] = a[q + 2];
      a[q] += vx + wind * (i / NS); a[q + 1] += vy - 0.0028; a[q + 2] += vz;
    }
    if (!loose) { a[0] = x; a[1] = y; a[2] = z; }
    if (end) { const q = (NS - 1) * 6; a[q] = end[0]; a[q + 1] = end[1]; a[q + 2] = end[2]; }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < NS; i++) {
        const p = (i - 1) * 6, q = i * 6, dx = a[q] - a[p], dy = a[q + 1] - a[p + 1], dz = a[q + 2] - a[p + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        if (d <= seg && end) continue; // a held string may go slack
        const k = (d - seg) / d, fp = i === 1 && !loose ? 0 : end && i === NS - 1 ? 1 : 0.5, fq = 1 - fp;
        a[p] += dx * k * fp; a[p + 1] += dy * k * fp; a[p + 2] += dz * k * fp; a[q] -= dx * k * fq; a[q + 1] -= dy * k * fq; a[q + 2] -= dz * k * fq;
      }
      for (let i = 0; i < NS; i++) if (a[i * 6 + 1] < 0.004) a[i * 6 + 1] = 0.004;
    }
  }
  const SXY = new Float32Array(NS * 2);
  function drawStr(g, a, op, lit) {
    for (let i = 0; i < NS; i++) { if (!g.pr(a[i * 6], a[i * 6 + 2], a[i * 6 + 1])) return; SXY[i * 2] = g.sx; SXY[i * 2 + 1] = g.sy; }
    const ctx = g.ctx, s = g.f / g.sz;
    ctx.beginPath(); ctx.moveTo(SXY[0], SXY[1]);
    for (let i = 1; i < NS - 1; i++) ctx.quadraticCurveTo(SXY[i * 2], SXY[i * 2 + 1], (SXY[i * 2] + SXY[i * 2 + 2]) / 2, (SXY[i * 2 + 1] + SXY[i * 2 + 3]) / 2);
    ctx.lineTo(SXY[NS * 2 - 2], SXY[NS * 2 - 1]);
    ctx.lineWidth = Math.max(0.7, s * 0.004); ctx.lineCap = 'round';
    ctx.strokeStyle = g.L ? `rgba(70,58,36,${0.55 * op})` : `rgba(214,208,182,${(0.12 + 0.3 * lit) * op})`; ctx.stroke();
  }
  /** A balloon (b: x, y = its middle, z, ci, sc), its string first; sp: the sprite name to use instead (the "=)" one). */
  function drawBal(g, BR, b, str, op, name, litO) {
    const sc = b.sc == null ? 1 : b.sc, lit = litO != null ? litO : cl(g.lum(BR.COL(b.x), BR.ROW(b.z)) * g.glob);
    if (str) drawStr(g, str, op * BR.far(Math.max(1, b.z - g.camZ)), lit);
    const ky = b.y - 0.2 * sc;
    if (!g.pr(b.x, b.z, ky)) return;
    const s = (g.f / g.sz) * sc; if (s * 0.3 < 1.2) return;
    const st = sc > 0.85 ? 0 : sc > 0.63 ? 1 : 2, nm = name || `bal:${b.ci % 5}:${st}`, sp = SP[nm] && SP[nm] !== true ? SP[nm] : SP[`bal:${b.ci % 5}:0`];
    put(g.ctx, sp, g.L ? 'L' : 'D', s, g.sx, g.sy, 1, b.tilt || 0, op * BR.far(g.sz) * (g.L ? 0.97 : 0.95), lit);
  }

  /** For checking the sprites by eye: shade all of them now, and lay them out on a sheet. */
  function sheet(mode, bgc) {
    want(ALL()); while (Q.list.length || Q.cur) pump(1000);
    const c = mk(1260, 760), x = c.getContext('2d'); x.fillStyle = bgc || (mode === 'L' ? '#f4efe0' : '#14140f'); x.fillRect(0, 0, c.width, c.height);
    let px = 10;
    for (const n of ['body:0', 'body:2', 'body:5', 'body:8', 'back']) { const sp = SP[n]; x.drawImage(sp.lv[mode][0].lit, px, 10); x.drawImage(sp.lv[mode][0].dark, px, 330); px += sp.W + 6; }
    let hy = 10;
    for (const n of ['head:4', 'head:2', 'head:8', 'yaw:0', 'yaw:2', 'eq:0', 'eq:2', 'bal:0:0', 'bal:1:0', 'bal:3:1', 'bal:4:2', 'grip', 'neck']) {
      const sp = SP[n]; if (px + sp.W > 1250) { px = 10 + 920; hy += 170; }
      x.drawImage(sp.lv[mode][0].lit, px, hy); px += sp.W + 4;
    }
    return c;
  }
  window.__pg = { SP, Q, want, pump, sheet, show(mode) { const c = sheet(mode); c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.appendChild(c); return Q.ms; } };

  // ---- the visits ----
  const PUMP = 3.5; // ms of shading a frame while sprites are still missing
  /** Queue the rest behind what is urgent, so the next visit finds everything ready. */
  const later = (names) => { for (const n of names) if (!SP[n] && Q.name !== n && !Q.list.includes(n)) Q.list.push(n); };
  const doorAt = (g, BR, a, b) => { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0 + 1; j < g.j0 + 8; j++) { const d = (j + 1) * BR.C - g.camZ; if (d >= a && d <= b && g.cr(j, 0) === 2) o.push(j); } return o.length ? o[(Math.random() * o.length) | 0] : null; };
  const hallAt = (g, BR, a, b) => { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0 + 1; j < g.j0 + 8; j++) { const d = (j + 0.5) * BR.C - g.camZ; if (d >= a && d <= b) o.push(j); } return o.length ? o[(Math.random() * o.length) | 0] : null; };
  const BALS = [0, 1, 2, 3, 4].map((c) => 'bal:' + c + ':0');
  const NEED = {
    party: [...BALS, 'body:0', 'head:1', 'head:7', 'head:4', 'body:1', 'body:2', 'body:3', 'body:4', 'body:5', 'head:0', 'head:8'],
    peek: ['head:8', 'head:0', 'grip', 'body:0', 'head:7', 'head:1'],
    room: ['back', 'yaw:0', 'cake', ...BALS, 'yaw:1', 'yaw:2', 'yaw:3', 'head:4', 'body:0', 'head:1', 'head:7', 'head:8'],
    balloon: ['eq:3', 'eq:2', 'eq:1', 'eq:0', 'body:0', 'head:3', 'head:1'],
    invite: ['body:6', 'body:7', 'body:8', 'neck', 'head:8', 'head:4'],
  };
  /** Scraps of a burst balloon: flung out, fluttering down, lying on the carpet. */
  function burst(b, rgb) {
    return Array.from({ length: 8 }, (_, k) => { const a = k * 0.8 + Math.random(), v = 0.02 + Math.random() * 0.025; return { x: b.x, y: b.y, z: b.z, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.01, vz: (Math.random() - 0.5) * 0.03, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, sz: 0.025 + Math.random() * 0.035, c: rgb, f: Math.random() }; });
  }
  function stepScraps(q) { for (const p of q) { if (p.y <= 0.004) { p.y = 0.004; continue; } p.vx *= 0.9; p.vz *= 0.9; p.vy = p.vy * 0.9 - 0.0035; p.x += p.vx; p.y += p.vy; p.z += p.vz; p.r += p.vr; } }
  function drawScraps(g, BR, q, op) {
    const ctx = g.ctx;
    for (const p of q) {
      if (!g.pr(p.x, p.z, p.y)) continue;
      const s = g.f / g.sz, r = Math.max(0.8, p.sz * s), lit = cl(g.lum(BR.COL(p.x), BR.ROW(p.z)) * g.glob), e = g.L ? 1.5 : 0.75, k = 0.2 + 0.8 * lit, fl = 0.55 + 0.45 * Math.abs(Math.cos(p.r));
      const c = p.c.map((v) => Math.round(255 * (1 - Math.exp(-v * k * e * fl))));
      ctx.save(); ctx.translate(g.sx, g.sy); ctx.rotate(p.r); ctx.scale(r, r * (p.y < 0.01 ? 0.35 : 0.5 + 0.5 * Math.abs(Math.sin(p.r * 1.3))));
      ctx.beginPath(); ctx.moveTo(-1, -0.2); ctx.quadraticCurveTo(-0.2, -0.9 - p.f * 0.3, 0.9, -0.4); ctx.quadraticCurveTo(0.5, 0.3, 1, 0.8); ctx.quadraticCurveTo(-0.1, 0.5, -0.8, 0.7); ctx.closePath();
      ctx.fillStyle = `rgba(${c.join(',')},${0.95 * op * BR.far(g.sz)})`; ctx.fill();
      ctx.restore();
    }
  }
  /** Strings for a set of balloons, stepped: held under each knot (free ones fall), a breath of air moving them. */
  function stepStrings(e, list, a) {
    e.str = e.str || list.map((b) => mkStr(b.x, b.y - 0.2 * (b.sc || 1), b.z, b.len || 0.95));
    list.forEach((b, k) => { const sc = b.sc == null ? 1 : b.sc; stepStr(e.str[k], b.x, b.y - 0.2 * sc, b.z, !!b.loose, Math.sin(a * 0.045 + k * 2.1) * 0.0011, b.end || null); const q = e.str[k]; b.tilt = b.fixT != null ? b.fixT : Math.max(-0.3, Math.min(0.3, (q[0] - q[6]) * 2.2)); });
  }

  const V = {
    /** The first way: balloons drift in from the dark and come on toward us against the air; between one flicker and the next it
     * is standing among them, waving in jerks, its head ticking like a metronome; at the next stutter it is a room nearer, its
     * head laid over, the arm hanging a beat before it starts again; when it goes the balloons go soft and one bursts. */
    party: {
      step(e, g, st, BR) {
        const a = e.age;
        // the third time the lights stutter it is right in front of us, arm down, its head going from side to side
        if (a === 228) { st.flick = BR.DIP.length; BR.glitch(st, 3); }
        if (a === 231) { // in front of the next doorway if there is room, else in front of the one after (where a lintel cannot hide its head)
          const side = e.x > 0 ? 1 : -1, z1 = (g.j0 + 1) * BR.C - 0.35; e.x = side * 0.36; e.z = z1 - g.camZ >= 2.6 ? z1 : z1 + BR.C; }
        if (a === 284) { st.flick = BR.DIP.length; BR.glitch(st, 3); }
        e.fig = a >= 82 && a < 286 && !(a >= 228 && a < 231);
        const wv = a < 175 ? ss(86, 110, a) : a < 228 ? ss(199, 216, a) : 0, sw = [0, 1, 2, 3, 2, 1][Math.floor(e.tt / 8) % 6];
        e.pose = wv < 0.2 ? 0 : wv < 0.85 ? 1 : 2 + sw;
        const ph = e.tt % 30; // tick … tock, exactly as long each way, snapping through the middle in one frame
        e.head = a >= 231 ? (e.tt % 16 < 8 ? 7 : 1) : a >= 177 ? 0 : ph < 14 ? 1 : ph === 14 || ph === 29 ? 4 : 7;
        if (e.tw > 0) { e.tw--; e.head = e.twH; } else if (e.fig && Math.random() < 0.02) { e.tw = 2 + ((Math.random() * 3) | 0); e.twH = [0, 8, 1, 7][(Math.random() * 4) | 0]; if (Math.random() < 0.5) BR.glitch(st, 1); } // a twitch
        e.vis = e.fig ? 1 : 0.4 * ss(0, 60, a);
        stepStrings(e, e.bs, a);
        if (a === 262 && e.pop >= 0) { const b = e.bs[e.pop]; b.loose = true; e.scraps = burst(b, BCOL[b.ci % 5]); e.popZ = b.z; }
        if (e.scraps) stepScraps(e.scraps);
      },
      draw(e, g, j, c, BR) {
        if (c !== 0) return;
        const al = ss(0, 30, e.age), dir = e.x > 0 ? -1 : 1, list = e.bs.map((b, k) => [b, k]).filter(([b, k]) => k !== e.pop && BR.ROW(b.z) === j).sort((p, q) => q[0].z - p[0].z);
        let done = !e.fig || BR.ROW(e.z) !== j;
        const fig = () => figure(g, BR, { x: e.x, z: e.z, dir, body: 'body:' + e.pose, head: 'head:' + (dir > 0 ? e.head : 8 - e.head) });
        for (const [b, k] of list) { if (!done && b.z < e.z) { fig(); done = true; } drawBal(g, BR, b, e.str && e.str[k], al); }
        if (!done) fig();
        if (e.scraps && BR.ROW(e.popZ) === j) { const q = e.str && e.str[e.pop]; if (q) drawStr(g, q, 1, cl(g.lum(0, j) * g.glob)); drawScraps(g, BR, e.scraps, 1 - ss(300, 320, e.age)); }
      },
    },

    /** Low down, at the edge of the nearest doorway, the point of a party hat, then a head lying on its side, the grin standing
     * upright; it comes out in jerks, each with a stutter of the light; long fingers hook round the jamb far above it, where no
     * hand of that body could be; then, with a tear in the tape, the whole body leans out sideways a hand's breadth off the
     * floor, much too far, and twitches; on the next flicker it is gone. */
    peek: {
      place(g, BR) {
        const J = doorAt(g, BR, 2.7, 6); if (J == null) return null;
        const side = Math.random() < 0.5 ? -1 : 1;
        return { own: true, v: 'peek', J, side, x: side * 0.98, z: (J + 1) * BR.C + BR.TH + 0.14, life: 250, tt: 0, out: 0, grip: 0 };
      },
      step(e, g, st, BR) {
        const a = e.age, J = e.J;
        BR.tick(e, 0.03);
        // where its neck meets its head (the head lying on its side, the hat first): the hat's point, the crown, half the face, all of it; then too far
        const steps = [[36, 1.27], [58, 1.07], [92, 0.9], [176, 0.3], [187, -0.05], [197, -0.42]];
        let o = 0, jerk = false; for (const [t, v] of steps) { if (a >= t) o = v; if (a === t) jerk = true; }
        if (a >= 214) o = 0;
        e.out = o; e.grip = a >= 118 && a < 214 ? 1 : 0;
        if (jerk) e.stut = 3;
        const st3 = e.stut > 0 ? e.stut-- : 0;
        e.cl = [[0, J + 1, st3 ? 0.5 : 0.04], [0, J, st3 && a > 170 ? 0.3 : 1]];
        if (a === 176) { BR.glitch(st, 4); st.flick = 4; }
        if (e.tw > 0) e.tw--; else if (a > 176 && a < 212 && Math.random() < 0.06) { e.tw = 2; BR.glitch(st, 1); } // twitches
        if (a === 213) { st.flick = BR.DIP.length; BR.glitch(st, 2); }
        e.vis = o > 0 ? 1 : 0;
      },
      draw(e, g, j, c, BR) {
        if (c !== 0 || j !== e.J + 1 || !e.out) return;
        const side = e.side, z = e.z, mode = g.L ? 'L' : 'D', lit = 0.62 + (e.stut > 0 ? 0.3 : 0), jx = side * 0.85;
        const hx = side * e.out, hy = 0.22 + (0.78 - Math.min(0.78, e.out)) * 0.3;
        if (e.out < 0.7) { // leaning out: the body on its side, the neck at hx, the legs behind the wall
          if (!g.pr(hx, z, 0.5)) return;
          const s = (g.f / g.sz) * 1.12, r = -side * (1.42 + (e.tw > 0 ? 0.14 : 0)), sr = Math.sin(r), cr = Math.cos(r), op = BR.far(g.sz);
          const fx = g.sx - 2.06 * s * sr, fy = g.sy + 2.06 * s * cr, px = fx + NECK * s * sr, py = fy - NECK * s * cr;
          put(g.ctx, SP['body:0'], mode, s, fx, fy, 1, r, op, lit);
          put(g.ctx, SP[e.tw > 0 ? 'head:1' : 'head:7'], mode, s, px, py, side, r * side * side, op, lit);
        } else if (g.pr(hx, z, hy)) put(g.ctx, SP[side > 0 ? 'head:8' : 'head:0'], mode, g.f / g.sz, g.sx, g.sy, 1, 0, BR.far(g.sz), lit);
        if (e.grip && g.pr(jx + side * 0.03, BR.TH * 0.5 + (e.J + 1) * BR.C, 1.7)) put(g.ctx, SP.grip, mode, (g.f / g.sz) * 1.35, g.sx, g.sy, -side, 0, BR.far(g.sz), lit + 0.15);
      },
    },

    /** Through a doorway, a room got ready for a party: its tube out, candles lit on a cake, streamers, balloons against the
     * ceiling and on the carpet, and three of them standing with their faces to the far wall. One head turns round to us in
     * jerks, each time the candles gutter; its body never turns. The lights stutter, and when they steady all three are facing us. */
    room: {
      place(g, BR) {
        const J = doorAt(g, BR, 4.5, 8.5); if (J == null) return null;
        const C = BR.C, z0 = (J + 1) * C + BR.TH, zb = (J + 2) * C;
        const figs = [[-1.05, zb - 0.5], [0.1, zb - 0.62], [1.1, zb - 0.45]].map(([x, z]) => ({ x, z }));
        const bs = [[-1.25, 2.3, zb - 1.0, 0], [0.85, 2.33, zb - 1.45, 1], [-0.45, 2.31, z0 + 0.9, 4], [1.2, 0.36, z0 + 1.1, 3, 1.45], [-1.35, 0.36, zb - 1.7, 2, -1.5]]
          .map(([x, y, z, ci, t]) => ({ x, y, z, ci, sc: 1, len: t == null ? 1.1 : 0.7, fixT: t, hx: x, hy: y }));
        return { own: true, v: 'room', J, x: 0, z: z0 + 1.6, z0, zb, life: 330, tt: 0, figs, bs, cake: { x: -0.2, z: z0 + 0.95 }, cand: 0, gut: 0, hd: 'yaw:0', all: false };
      },
      step(e, g, st, BR) {
        const a = e.age;
        BR.tick(e, 0.02);
        const turns = [112, 134, 152, 170];
        if (turns.includes(a)) e.gut = 5;
        e.hd = a < 112 ? 'yaw:0' : a < 134 ? 'yaw:1' : a < 152 ? 'yaw:2' : a < 170 ? 'yaw:3' : 'head:4';
        const fl = 0.82 + 0.18 * Math.sin(a * 0.9) * Math.sin(a * 0.37 + 1);
        e.cand = a < 16 || a >= 300 ? 0 : fl * (e.gut > 0 ? 0.3 : 1) * (Math.random() < 0.04 ? 0.6 : 1);
        if (e.gut > 0) e.gut--;
        e.cl = [[0, e.J + 1, a < 6 ? 1 : a < 14 ? BR.flick(a, 3) : a >= 304 ? 1 : 0.03]];
        if (a === 262) { st.flick = BR.DIP.length; BR.glitch(st, 3); }
        e.all = a >= 266 && a < 300;
        if (a === 266) { const z1 = (g.j0 + 1) * BR.C - 0.35; e.nearZ = Math.min(e.z0 - BR.TH - 0.45, z1 - g.camZ >= 2.6 ? z1 : z1 + BR.C); } // where the one that came out to us stands
        if (a === 300) BR.glitch(st, 2);
        e.vis = a >= 14 && a < 304 ? 1 : 0;
        for (const [k, b] of e.bs.entries()) { if (b.fixT == null) { b.x = b.hx + Math.sin(a * 0.017 + k) * 0.03; b.y = b.hy + Math.sin(a * 0.04 + k * 2) * 0.025; } }
        stepStrings(e, e.bs, a);
        for (const b of e.bs) if (b.fixT != null) b.tilt = b.fixT;
      },
      draw(e, g, j, c, BR) {
        if (c !== 0 || !e.vis) return;
        if (e.all && j === BR.ROW(e.nearZ)) figure(g, BR, { x: 0.12, z: e.nearZ, dir: 1, body: 'body:0', head: e.age & 8 ? 'head:8' : 'head:7' }); // out of the room, in front of us
        if (j !== e.J + 1) return;
        const ctx = g.ctx, mode = g.L ? 'L' : 'D', lit = 0.08 + 0.4 * e.cand, C = BR.C, zc = e.cake.z, xc = e.cake.x;
        // streamers: crepe paper in swags from the corners to the middle, twisted, catching the candlelight on one side
        const cols = [[0.95, 0.3, 0.6], [0.15, 0.72, 0.76], [0.75, 0.85, 0.25], [0.95, 0.3, 0.6]], mid = [0.1, 2.25, (e.z0 + e.zb) / 2];
        [[-1.75, e.zb - 0.05], [1.75, e.zb - 0.05], [-1.75, e.z0 + 0.05], [1.75, e.z0 + 0.05]].forEach(([x0, z0], k) => {
          const n = 14, col = cols[k], ex = g.L ? 1.5 : 0.75, P = [];
          for (let i = 0; i <= n; i++) {
            const t = i / n, x = x0 + (mid[0] - x0) * t, z = z0 + (mid[2] - z0) * t, y = 2.58 + (mid[1] - 2.58) * t - 0.32 * 4 * t * (1 - t) + Math.sin(e.age * 0.05 + k + t * 3) * 0.01;
            if (!g.pr(x, z, y)) return;
            const tw = Math.cos(t * 19 + k * 1.3); P.push(g.sx, g.sy, Math.max(0.4, 0.024 * (g.f / g.sz) * (0.2 + 0.8 * Math.abs(tw))), tw);
          }
          for (const front of [true, false]) { // the two sides of the paper, twisting: one catches the light
            ctx.beginPath();
            for (let i = 0; i < n; i++) { const q = i * 4; if ((P[q + 3] + P[q + 7] > 0) !== front) continue; ctx.moveTo(P[q], P[q + 1] - P[q + 2]); ctx.lineTo(P[q + 4], P[q + 5] - P[q + 6]); ctx.lineTo(P[q + 4], P[q + 5] + P[q + 6]); ctx.lineTo(P[q], P[q + 1] + P[q + 2]); ctx.closePath(); }
            const b = (front ? 1 : 0.55) * (0.25 + 0.75 * (0.15 + 0.85 * e.cand)), cc = col.map((v) => Math.round(255 * (1 - Math.exp(-v * b * ex))));
            ctx.fillStyle = `rgba(${cc.join(',')},0.9)`; ctx.fill();
          }
        });
        // far to near: them, the balloons, the cake
        const items = [];
        e.figs.forEach((f, k) => { if (e.all && k === 1) return; const z = f.z; // (when they all face us, that one has come out to us)
          items.push([z, () => figure(g, BR, { x: f.x, z, dir: k === 1 ? 1 : -1, lit, noShadow: e.cand < 0.05,
            body: e.all ? 'body:0' : 'back', head: e.all ? ['head:1', e.age & 8 ? 'head:7' : 'head:8', 'head:7'][k] : k === 1 ? e.hd : 'yaw:0' })]); });
        e.bs.forEach((b, k) => items.push([b.z, () => drawBal(g, BR, b, e.str && e.str[k], 1, null, 0.12 + 0.55 * e.cand)]));
        items.push([zc, () => { if (g.pr(xc, zc, 0)) put(ctx, SP.cake, mode, g.f / g.sz, g.sx, g.sy, 1, 0, BR.far(g.sz), 0.25 + 0.7 * e.cand); }]);
        items.sort((p, q) => q[0] - p[0]).forEach((it) => it[1]());
        // the candles, and the warm light they throw about the room
        if (e.cand > 0 && g.pr(xc, zc - 0.03, 0.99)) {
          const s = g.f / g.sz, gx = g.sx, gy = g.sy;
          ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter';
          ctx.globalAlpha = (g.L ? 0.1 : 0.16) * e.cand; ctx.drawImage(flameSpr(), gx - 1.6 * s, gy - 1.1 * s, 3.2 * s, 2.2 * s);
          for (let k = 0; k < 5; k++) {
            const x = gx + (k - 2) * 0.034 * s, f = 0.7 + 0.3 * Math.random(), r = Math.max(1.2, 0.03 * s * f);
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = ['rgba(230,140,170,0.9)', 'rgba(140,200,220,0.9)', 'rgba(240,230,150,0.9)'][k % 3];
            ctx.fillRect(x - 0.5, gy, 1, Math.max(1, 0.045 * s));
            ctx.globalCompositeOperation = g.L ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, e.cand * f);
            ctx.drawImage(flameSpr(), x - r * 1.5, gy - r * 2.2, r * 3, r * 3);
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      },
    },

    /** A balloon comes down the hall toward us, slowly, against the air; on it "=)", which turns round to us in jerks. On a flicker
     * something tall is standing under it, holding the string, quite still; its head drops to one side, once. On the next it is
     * gone and the balloon, let go, rises to the ceiling and comes on, turning its face away. */
    balloon: {
      place(g, BR) {
        let J = hallAt(g, BR, 6.5, 8.6); if (J == null) J = hallAt(g, BR, 5, 6.5); if (J == null) return null;
        const side = Math.random() < 0.5 ? -1 : 1;
        return { own: true, v: 'balloon', J, side, x: 0, z: 0, b: { x: side * 0.3, y: 2.0, z: (J + 0.5) * BR.C, ci: 0, sc: 1, len: 1.3 }, life: 330, tt: 0, face: 'eq:3', fig: false, hd: 'head:3' };
      },
      step(e, g, st, BR) {
        const a = e.age, b = e.b;
        BR.tick(e, 0.02);
        const held = a >= 152 && a < 236;
        if (!held) { b.z -= a < 152 ? 0.019 : 0.022; b.y = a < 236 ? 2.0 + ss(0, 150, a) * 0.27 + Math.sin(a * 0.05) * 0.035 : Math.min(2.38, b.y + 0.01); b.x = e.side * 0.3 + Math.sin(a * 0.021) * 0.06; }
        e.face = a < 50 ? 'eq:3' : a < 74 ? 'eq:2' : a < 96 ? 'eq:1' : a < 250 ? 'eq:0' : a < 272 ? 'eq:1' : 'eq:2';
        const turn = a === 50 || a === 74 || a === 96 || a === 250 || a === 272;
        if (a === 150) { st.flick = BR.DIP.length; }
        if (a === 152) { e.fig = true; e.x = b.x + 0.19; e.z = b.z; BR.glitch(st, 3); }
        if (a === 236) { st.flick = BR.DIP.length; BR.glitch(st, 2); e.fig = false; }
        e.hd = a < 196 ? 'head:3' : 'head:1';
        if (a === 196) BR.glitch(st, 1);
        if (turn) e.stut = 3;
        const sr = e.stut > 0 ? e.stut-- : 0;
        e.cl = [[0, BR.ROW(b.z), sr ? 0.35 : 1]];
        b.end = e.fig ? [e.x - 0.19, 0.76, e.z] : null;
        stepStrings(e, [b], a);
        e.vis = 1;
        if (a === 316) st.flick = BR.DIP.length;
      },
      draw(e, g, j, c, BR) {
        if (c !== 0) return;
        const al = ss(0, 25, e.age) * (e.age >= 318 ? 0 : 1);
        if (e.fig && BR.ROW(e.z) === j) figure(g, BR, { x: e.x, z: e.z, dir: 1, body: 'body:0', head: e.hd });
        if (BR.ROW(e.b.z) === j) drawBal(g, BR, e.b, e.str && e.str[0], al, e.face);
      },
    },

    /** In a doorway, too tall for it: the head is behind the wall above the door. It beckons, the same gesture exactly every
     * time, and every time its fingers close the light in its room dips. Then the head comes down, in three jerks, on a neck far
     * too long, and hangs on its side beside its shoulder, smiling, still beckoning. On a flicker it is gone. */
    invite: {
      place(g, BR) {
        const J = doorAt(g, BR, 3.8, 7); if (J == null) return null;
        return { own: true, v: 'invite', J, x: (Math.random() - 0.5) * 0.3, z: (J + 1) * BR.C + BR.TH + 0.32, life: 290, tt: 0, dir: Math.random() < 0.5 ? -1 : 1, pose: 6, drop: 0 };
      },
      step(e, g, st, BR) {
        const a = e.age;
        e.on = a >= 30 && a < 272;
        e.pose = [6, 7, 8, 7][Math.floor(Math.max(0, a - 30) / 7) % 4];
        e.drop = a < 178 ? 0 : a < 186 ? 0.34 : a < 194 ? 0.68 : 1;
        if (a === 178 || a === 186 || a === 194) BR.glitch(st, 2);
        if (a === 272) { st.flick = BR.DIP.length; BR.glitch(st, 3); }
        e.cl = [[0, e.J + 1, a < 22 ? 1 : a < 30 ? BR.flick(a, 5) : e.on && e.pose === 8 ? 0.45 : a >= 178 && a < 198 && (a & 2) ? 0.3 : 1]];
        e.vis = e.on ? 1 : 0;
      },
      draw(e, g, j, c, BR) {
        if (c !== 0 || j !== e.J + 1 || !e.on) return;
        const sc = 1.2, f = figure(g, BR, { x: e.x, z: e.z, dir: e.dir, sc, body: 'body:' + e.pose, head: 'head:4', noHead: e.drop > 0 });
        if (!f || !e.drop) return;
        const mode = g.L ? 'L' : 'D', s = f.s, d = e.dir, px = -0.34 * e.drop, py = 2.06 - (2.06 - 1.4) * e.drop;
        const ax = f.x, ay = f.y - 2.08 * s, bx = f.x + px * d * s, by = f.y - py * s, L = Math.hypot(bx - ax, by - ay);
        put(g.ctx, SP.neck, mode, s, ax, ay, 1, Math.atan2(by - ay, bx - ax), f.op, f.lit, L / (0.5 * s), 1);
        put(g.ctx, SP['head:8'], mode, s, bx, by, d, 0, f.op, f.lit);
      },
    },
  };

  const flameSpr = () => SHD.flame || (SHD.flame = (() => { const c = mk(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.18, 'rgba(255,170,70,0.75)'); gr.addColorStop(0.5, 'rgba(230,110,40,0.18)'); gr.addColorStop(1, 'rgba(200,80,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c; })());

  // ---- the hooks ----
  const ENT = (window.BR_ENT = window.BR_ENT || {}), VN = Object.keys(V);
  let lastV = '';
  ENT.partygoer = {
    /** One of its ways of showing itself (v: asked for by name; else any but the last one). */
    place(g, v, BR) {
      const order = v && V[v] ? [v] : VN.filter((n) => n !== lastV).sort(() => Math.random() - 0.5);
      for (const n of order) {
        const e = n === 'party' ? BR.EV.partygoer.place(g) : V[n].place(g, BR);
        if (e) { e.v = n; lastV = n; want(NEED[n]); later(ALL()); return e; }
      }
      return null;
    },
    step(e, g, st, BR) { pump(PUMP); if (TX.ok) V[e.v || 'party'].step(e, g, st, BR); },
    draw(e, g, j, c, BR) { if (TX.ok) V[e.v || 'party'].draw(e, g, j, c, BR); },
  };
  /** The lone balloon: the same latex, its string hanging and swinging. */
  ENT.balloon = {
    step(e, g, st, BR) { pump(PUMP); if (e.age === 1) { want(BALS); later(ALL()); } if (TX.ok) stepStrings(e, [e.b], e.age); },
    draw(e, g, j, c, BR) { if (c === 0 && TX.ok && j === BR.ROW(e.b.z)) drawBal(g, BR, e.b, e.str && e.str[0], ss(0, 20, e.age) * (1 - ss(285, 300, e.age))); },
  };
})();
