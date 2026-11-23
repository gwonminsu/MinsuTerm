'use strict';
/*
 * 도미노: a long domino course laid out on a table, seen from a little above (a fixed camera, real perspective);
 * the theme's background is the table. Ivory tiles with black pips (on a light page, ebony tiles with ivory pips)
 * stand in long lines that sweep across it in curves, and a wave runs down them: each tile tips over its front
 * edge, strikes the next and comes to rest leaning on it, so a fallen line is a row of shingles, pips up. The tiles
 * are rigid bodies (each pivots on its bottom edge; a struck tile is pushed by the whole leaning chain behind it),
 * so the wave runs the way a real one does, at about a third of its speed (some ten tiles a second).
 * Along the way: forks that split the wave in two and lines that join again (the first wave to arrive goes on),
 * rows back and forth across the table, a flight of wooden steps, a loop that crosses its own earlier stretch on a
 * plank bridge (steps up, the plank over the fallen line, steps down), a spiral whose rings are too far apart for a
 * fallen tile to reach the next, ending at a small bell, a diamond field of tiles painted on their backs so the
 * fallen field shows a picture (a heart, a bell, a moon, ...), and runs of growing tiles that end at a desk bell.
 * Lines never come within a tile's reach of one another except where they are meant to meet (a fork, a join, a
 * field), and any tile within reach of a falling tile is struck by it. The course never ends: the camera travels
 * along it, fallen lines drifting out on the left while new ones come in on the right.
 * Heard on the real background: every strike, at its moment, running together into the rattle of a real run, over
 * a soft recording of one; and the bell (see the sound section).
 */
(function () {
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('domino'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, HALF = Math.PI / 2, D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);
  const LV = (() => { const v = [-0.5, 0.8, -0.34], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })(); // toward the lamp: up, left, a little in front

  /* ---------- the tiles and how they fall ---------- */

  // a tile is 1 high, half as wide, a sixth as thick (world units: one tile's height); neighbours stand 0.62 apart
  const TH = 1, TW = 0.5, TT = 0.16, SP = 0.62;
  const G = 18; // gravity, slowed so a line falls about ten tiles a second (a real one: about thirty)
  const SUB = 4, DT = 1 / 30 / SUB;
  const E_HIT = 0.3; // how much a strike bounces
  const SPD = Math.sqrt(G / 5.5); // speeds scale with the square root of gravity
  const L_dy = (t, s) => s.y - t.y; // a strike up or down a step

  function mkTile(x, z, h, o = {}) {
    const s = o.s || 1;
    const t = {
      o: -1, x, z, y: o.y || 0, h, fx: Math.cos(h), fz: Math.sin(h), s, H: TH * s, W: TW * s, T: TT * s, m: s * s * s,
      links: [], back: [], bell: null, st: 0, th: 0, om: 0, sup: null, supL: null, gp: 1, hop: 0, kind: o.kind || 0, col: o.col || 0,
      blk: o.blk || null, br: o.br || 0, j: !!o.j, pips: [1 + ((Math.random() * 6) | 0), (Math.random() * 7) | 0].sort(() => Math.random() - 0.5), spr: null, J: null,
    };
    t.I = (t.m * (t.H * t.H + t.T * t.T)) / 3;
    return t;
  }

  /**
   * Where tile i comes to lean when its support s is tipped by ths: [its angle, d(angle)/d(ths)]. Its top front
   * corner rests on s's back face, or (s lower down, a step) its front face rests on s's top back edge.
   */
  const CT = [0, 0];
  function contact(i, L, ths) {
    const s = L.s, Hi = i.H, Ts = s.T, Hs = s.H, D = L.D, dy = L.dy, c = Math.cos(ths), sn = Math.sin(ths);
    const A = Ts + dy * sn - D * c;
    if (A > -Hi && A < Hi) {
      const q = A / Hi, th = ths - Math.asin(q);
      const qx = Hi * Math.sin(th) - D, qy = Hi * Math.cos(th) - dy;
      if ((qx + Ts * c) * sn + (qy - Ts * sn) * c <= Hs) { CT[0] = th; CT[1] = 1 - (dy * c + D * sn) / (Hi * Math.sqrt(1 - q * q)); return CT; }
    }
    const cx = D - Ts * c + Hs * sn, cy = dy + Ts * sn + Hs * c, r2 = cx * cx + cy * cy;
    if (r2 <= Hi * Hi) { CT[0] = Math.atan2(cx, cy); CT[1] = (cy * (Ts * sn + Hs * c) - cx * (Ts * c - Hs * sn)) / r2; return CT; }
    return null;
  }

  function activate(Wd, t) {
    t.st = 1; t.th = 0; t.om = 0; dropSpr(t);
    const A = Wd.act;
    let k = A.length;
    while (k > 0 && A[k - 1].o > t.o) k--;
    A.splice(k, 0, t);
  }
  function rest(t) { t.st = 2; t.om = 0; dropSpr(t); t.hull = null; }

  /**
   * One slice of time. Every moving tile that leans on another moving one is carried by it (its weight and inertia
   * added to its support's, down the chain), the free ones turn under gravity, and a tile that reaches the next one
   * strikes it (an impulse), leans on it, or comes to rest on the floor, on a fallen tile, or on the bell.
   */
  function step(Wd) {
    const A = Wd.act;
    for (let k = 0; k < A.length; k++) { A[k].tqA = 0; A[k].IA = 0; }
    for (let k = 0; k < A.length; k++) { // leaners come before their supports
      const t = A[k];
      t.tqE = t.m * G * 0.5 * (t.H * Math.sin(t.th) - t.T * Math.cos(t.th)) + t.tqA;
      t.IE = t.I + t.IA;
      const s = t.sup;
      if (s && s.st === 1) { s.tqA += t.gp * t.tqE; s.IA += t.gp * t.gp * t.IE; }
    }
    for (let k = 0; k < A.length; k++) {
      const t = A[k];
      if (t.sup && t.sup.st === 1) continue;
      t.om += (t.tqE / t.IE) * DT; t.th += t.om * DT; t.hop = 0;
    }
    for (let k = A.length - 1; k >= 0; k--) {
      const t = A[k], s = t.sup;
      if (!s || s.st !== 1) continue;
      const c = contact(t, t.supL, s.th);
      if (!c) { t.sup = null; t.supL = null; continue; }
      t.th = c[0]; t.gp = c[1]; t.om = c[1] * s.om; t.hop = s.hop + 1;
    }
    for (let k = 0; k < A.length; k++) {
      const t = A[k];
      if (t.st !== 1 || (t.sup && t.sup.st === 1)) continue;
      let lim = Infinity, best = null, bestG = 0;
      for (const L of t.links) {
        const s = L.s, c = contact(t, L, s.th);
        if (!c || t.th < c[0]) continue;
        const th = c[0], g = c[1];
        if (s.st === 0) { // struck
          activate(Wd, s); s.by = t;
          const u = t.om, j = ((1 + E_HIT) * u) / (1 / t.IE + (g * g) / s.I);
          t.om -= j / t.IE; s.om += (j * g) / s.I;
          Wd.snd.push({ k: 'hit', x: s.x, z: s.z, y: s.y, v: u, s: s.s, sub: Wd.sub, dy: L_dy(t, s) });
          s.fresh = true;
        } else if (s.st === 1 && !s.fresh) {
          const u = t.om - g * s.om;
          if (u > 0) { const Is = s.IE || s.I, j = u / (1 / t.IE + (g * g) / Is); t.om -= j / t.IE; s.om += (j * g) / Is; }
        }
        if (th < lim) { lim = th; best = L; bestG = g; }
      }
      if (best) {
        t.th = lim;
        const s = best.s;
        if (s.st === 2) { t.sup = s; t.supL = best; rest(t); if (t.om > 0.3 * SPD) Wd.snd.push({ k: 'tap', x: t.x, z: t.z, y: t.y, v: t.om, s: t.s, sub: Wd.sub }); }
        else if (s.st === 1 && !s.fresh) { t.sup = s; t.supL = best; t.gp = bestG; }
        continue;
      }
      if (t.bell) {
        const b = t.bell, tb = b.th;
        if (t.th >= tb) {
          t.th = tb;
          if (!b.b.hitK) { b.b.hitK = Wd.K || 1; Wd.snd.push({ k: 'bell', x: b.b.x, z: b.b.z, y: 0, v: t.om, sub: Wd.sub }); }
          if (t.om > 0.4 * SPD) t.om *= -0.22; else { t.leanBell = b.b; rest(t); }
          continue;
        }
      }
      if (t.th >= HALF) {
        t.th = HALF;
        if (t.om > 0.7 * SPD) { Wd.snd.push({ k: 'floor', x: t.x, z: t.z, y: t.y, v: t.om, s: t.s, sub: Wd.sub }); t.om *= -0.16; } else rest(t);
      } else if (t.th < 0 && t.om < 0) { t.th = 0; t.om = 0; }
    }
    for (let k = A.length - 1; k >= 0; k--) {
      const t = A[k];
      t.fresh = false;
      if (t.st === 1 && t.sup && (t.sup.st === 2 || t.hop > 6)) rest(t);
    }
    let n = 0;
    for (let k = 0; k < A.length; k++) if (A[k].st === 1) A[n++] = A[k];
    A.length = n;
  }

  /* ---------- the course ---------- */

  const md = (a) => ((a % TAU) + TAU) % TAU;
  /** The shortest path from one pose to another that never turns tighter than r (circle, line, circle). */
  function dubins(x0, z0, h0, x1, z1, h1, r) {
    const l0x = -Math.sin(h0), l0z = Math.cos(h0), l1x = -Math.sin(h1), l1z = Math.cos(h1);
    let best = null;
    const take = (len, segs) => { if (!best || len < best.len) best = { len, segs }; };
    { // LSL
      const vx = x1 + r * l1x - (x0 + r * l0x), vz = z1 + r * l1z - (z0 + r * l0z), d = Math.hypot(vx, vz), th = Math.atan2(vz, vx);
      const a1 = md(th - h0), a2 = md(h1 - th); take(r * (a1 + a2) + d, [[r, a1], [0, d], [r, a2]]);
    }
    { // RSR
      const vx = x1 - r * l1x - (x0 - r * l0x), vz = z1 - r * l1z - (z0 - r * l0z), d = Math.hypot(vx, vz), th = Math.atan2(vz, vx);
      const a1 = md(h0 - th), a2 = md(th - h1); take(r * (a1 + a2) + d, [[r, -a1], [0, d], [r, -a2]]);
    }
    { // LSR
      const vx = x1 - r * l1x - (x0 + r * l0x), vz = z1 - r * l1z - (z0 + r * l0z), d = Math.hypot(vx, vz);
      if (d >= 2 * r) { const l = Math.sqrt(d * d - 4 * r * r), ps = Math.atan2(vz, vx) + Math.atan2(2 * r, l); const a1 = md(ps - h0), a2 = md(ps - h1); take(r * (a1 + a2) + l, [[r, a1], [0, l], [r, -a2]]); }
    }
    { // RSL
      const vx = x1 + r * l1x - (x0 - r * l0x), vz = z1 + r * l1z - (z0 - r * l0z), d = Math.hypot(vx, vz);
      if (d >= 2 * r) { const l = Math.sqrt(d * d - 4 * r * r), ps = Math.atan2(vz, vx) - Math.atan2(2 * r, l); const a1 = md(h0 - ps), a2 = md(h1 - ps); take(r * (a1 + a2) + l, [[r, -a1], [0, l], [r, a2]]); }
    }
    return best;
  }
  /** Points every ~0.1 along a path of arcs ([r, angle]) and lines ([0, length]). */
  function trace(x, z, h, segs, pts) {
    for (const [r, a] of segs) {
      if (!r) {
        const n = Math.max(1, Math.ceil(a / 0.1)), cx = Math.cos(h), cz = Math.sin(h);
        for (let i = 1; i <= n; i++) pts.push([x + (cx * a * i) / n, z + (cz * a * i) / n]);
        x += cx * a; z += cz * a;
      } else {
        if (Math.abs(a) < 1e-9) continue;
        const sg = a > 0 ? 1 : -1, ox = x - sg * r * Math.sin(h), oz = z + sg * r * Math.cos(h), n = Math.max(1, Math.ceil((Math.abs(a) * r) / 0.1));
        for (let i = 1; i <= n; i++) { const hh = h + (a * i) / n; pts.push([ox + sg * r * Math.sin(hh), oz - sg * r * Math.cos(hh)]); }
        h += a; x = ox + sg * r * Math.sin(h); z = oz - sg * r * Math.cos(h);
      }
    }
    return pts;
  }
  /** n poses along a polyline, evenly spaced, the last one at its end: [x, z, heading]. */
  function walk(pts, n, hEnd) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = (s) => {
      s = clamp(s, 0, L);
      let lo = 1, hi = pts.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
      const a = pts[lo - 1], b = pts[lo], f = (s - cum[lo - 1]) / (cum[lo] - cum[lo - 1] || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    const out = [];
    for (let k = 1; k <= n; k++) {
      const s = (L * k) / n, p = at(s), p0 = at(s - 0.12), p1 = at(s + 0.12);
      out.push([p[0], p[1], k === n && hEnd !== undefined ? hEnd : Math.atan2(p1[1] - p0[1], p1[0] - p0[0])]);
    }
    return out;
  }
  const lenOf = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

  /*
   * Keeping clear. No two tiles stand closer than the taller one's height and a margin (on the ground) unless they
   * are neighbours along the course (within a few strikes of each other, through a fork, a join or a field), so a
   * tile can never fall onto a line it does not belong to; a tile high enough above another (on the bridge) is clear
   * of it. A tile's fall must not reach a prop (a bell, a step) other than its own, and props keep apart. Who strikes
   * whom is then worked out from where the tiles stand: every tile within reach of a falling tile's top is struck.
   */
  const CLEAR = 0.3, HOPS = 8, CELL = 1;
  const gk = (ix, iz) => ix * 4096 + iz + 2048;
  function gridAdd(G, t) { const k = gk(Math.floor(t.x / CELL), Math.floor(t.z / CELL)); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(t); }
  function gridDel(G, t) { const k = gk(Math.floor(t.x / CELL), Math.floor(t.z / CELL)), a = G.get(k); if (!a) return; const i = a.indexOf(t); if (i >= 0) a.splice(i, 1); if (!a.length) G.delete(k); }
  function gridNear(G, x, z, r, f) {
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) { const a = G.get(gk(ix, iz)); if (a) for (const t of a) f(t); }
    }
  }
  const baseX = (t) => t.x - t.fx * t.T * 0.5, baseZ = (t) => t.z - t.fz * t.T * 0.5;
  /** One stands so high above the other that neither can touch it. */
  const apart = (a, b) => a.y >= b.y + b.H + 0.1 || b.y >= a.y + a.H + 0.1;
  /** Does a, falling, reach b? (b's footprint inside the strip a's top sweeps, at a height a's fall passes through) */
  function strikes(a, b) {
    if (b === a || b.y + b.H < a.y + 0.05 || b.y > a.y + a.H) return false;
    const dx = b.x - a.x, dz = b.z - a.z, cf = b.fx * a.fx + b.fz * a.fz, sf = -b.fx * a.fz + b.fz * a.fx;
    const D = dx * a.fx + dz * a.fz, lat = -dx * a.fz + dz * a.fx;
    const cD = D - 0.5 * b.T * cf, cL = lat - 0.5 * b.T * sf;
    const eD = Math.abs(0.5 * b.T * cf) + Math.abs(0.5 * b.W * sf), eL = Math.abs(0.5 * b.T * sf) + Math.abs(0.5 * b.W * cf);
    const near = cD - eD;
    return near > 0.01 && near < a.H * 1.02 + Math.max(0, a.y - b.y) * 0.5 && Math.abs(cL) < 0.5 * a.W + eL - 0.02;
  }
  function addLink(a, b) {
    for (const L of a.links) if (L.s === b) return;
    a.links.push({ s: b, D: (b.x - a.x) * a.fx + (b.z - a.z) * a.fz, dy: b.y - a.y });
    (b.back = b.back || []).push(a);
  }
  /** A point inside a prop's footprint (grown by m)? */
  function inProp(p, x, z, m) {
    if (p.kind === 'bell') return Math.hypot(x - p.x, z - p.z) < p.RB + m;
    const fx = Math.cos(p.h), fz = Math.sin(p.h), dx = x - p.ox, dz = z - p.oz, u = dx * fx + dz * fz, v = -dx * fz + dz * fx;
    return u > -m && u < p.len + m && Math.abs(v) < p.wid / 2 + m;
  }
  const propBot = (p) => p.y0 || 0, propTop = (p) => (p.kind === 'bell' ? p.hk + p.rk : p.ht);
  /** Tile t clashes with prop p: standing on its footprint, or able to fall onto it. */
  function clashProp(t, p) {
    if (propBot(p) >= t.y + t.H + 0.1 || propTop(p) <= t.y - 0.01) return false; // passes under it, or stands on it
    if (inProp(p, baseX(t), baseZ(t), 0.3)) return true;
    const nx = -t.fz, nz = t.fx;
    for (const u of [0.15, 0.45, 0.75, 1.05]) for (const v of [-0.5, 0, 0.5]) {
      const d = u * t.H, l = v * (t.W + 0.2);
      if (inProp(p, t.x + t.fx * d + nx * l, t.z + t.fz * d + nz * l, 0.05)) return true;
    }
    return false;
  }

  /*
   * A piece of course is drafted first (tiles, the order they were laid in, props) and kept only if it stays on the
   * table, comes in out of sight and keeps clear, as above, of everything already laid and of itself.
   */
  function draft(from) { return { tiles: [], links: [], props: [], from, tail: null }; }
  function put(dr, prev, x, z, h, o) {
    const t = mkTile(x, z, h, o);
    dr.tiles.push(t);
    if (prev) dr.links.push([prev, t]);
    return t;
  }
  /** Tiles along a polyline from tile prev (its first point), evenly spaced, the last at its end. */
  function lay(dr, prev, pts, o = {}, hEnd) {
    const L = lenOf(pts), n = Math.max(1, Math.round(L / SP), Math.ceil(L / 0.7));
    for (const [x, z, h] of walk(pts, n, hEnd)) prev = put(dr, prev, x, z, h, o);
    return prev;
  }
  /** Tiles from tile prev to the pose (x, z, h), turning no tighter than r; the last one at that pose. */
  function road(dr, prev, x, z, h, r, o) {
    const p = dubins(prev.x, prev.z, prev.h, x, z, h, r);
    if (!p || p.len > 70) return null;
    return lay(dr, prev, trace(prev.x, prev.z, prev.h, p.segs, [[prev.x, prev.z]]), o, h);
  }
  /** A fork: the next tile is a pair side by side, each starting a branch. */
  function fork(dr, F, o1 = {}, o2 = {}) {
    const nx = -F.fz, nz = F.fx, ax = F.x + F.fx * SP, az = F.z + F.fz * SP, off = 0.33;
    return [put(dr, F, ax + nx * off, az + nz * off, F.h, o1), put(dr, F, ax - nx * off, az - nz * off, F.h, o2)];
  }

  function fits(Wd, dr, from = 0) {
    const { zLo, zHi } = Wd.band, T = dr.tiles;
    for (let i = from; i < T.length; i++) {
      const t = T[i];
      if (t.z < zLo || t.z > zHi || t.x < Wd.minX) return false;
      if (!Wd.init && !Wd.late && t.x < rightEdge(Wd, t.z)) return false;
    }
    if (!from) for (const p of dr.props) if (p.z - p.r < zLo - 0.5 || p.z + p.r > zHi + 0.5) return false;
    // the order of laying (both ways), new and old together, to tell neighbours along the course
    const nb = new Map();
    const join = (a, b) => { let x = nb.get(a); if (!x) nb.set(a, (x = [])); x.push(b); let y = nb.get(b); if (!y) nb.set(b, (y = [])); y.push(a); };
    for (const [a, b] of dr.links) join(a, b);
    const NONE = [];
    const each = (t, f) => { // t's neighbours along the course
      for (const v of nb.get(t) || NONE) f(v);
      if (t.o >= 0) { for (const L of t.links) f(L.s); for (const v of t.back) f(v); }
    };
    const has = (t, b) => { let y = false; each(t, (v) => { if (v === b) y = true; }); return y; };
    const nearCache = new Map();
    const near = (t) => {
      let s = nearCache.get(t);
      if (s) return s;
      s = new Set([t]);
      let front = [t];
      for (let h = 0; h < HOPS && front.length; h++) {
        const nx = [];
        for (const u of front) each(u, (v) => { if (!s.has(v)) { s.add(v); nx.push(v); } });
        front = nx;
      }
      nearCache.set(t, s);
      return s;
    };
    const close = (a, b) => {
      if ((a.fid && a.fid === b.fid) || has(a, b)) return true;
      let y = false;
      each(a, (v) => { if (!y && has(v, b)) y = true; });
      return y || near(a).has(b);
    };
    // tiles against tiles: the old ones nearby, and the new ones among themselves
    const G2 = new Map(), bigs = Wd.bigs.slice();
    for (const t of T) { gridAdd(G2, t); if (t.s > 1) bigs.push(t); }
    let t = null, bx = 0, bz = 0, bad = false;
    const test = (u) => {
      if (bad || u === t || apart(t, u)) return;
      const need = Math.max(t.H, u.H) + CLEAR, d = Math.hypot(baseX(u) - bx, baseZ(u) - bz);
      if (d < need && !close(t, u)) bad = true;
    };
    for (let i = from; i < T.length && !bad; i++) {
      t = T[i]; bx = baseX(t); bz = baseZ(t);
      gridNear(Wd.grid, bx, bz, t.H + CLEAR, test); // as near as a tile of its size may stand
      gridNear(G2, bx, bz, t.H + CLEAR, test);
      for (const u of bigs) if (u.H > t.H && Math.abs(u.x - bx) < 3 && Math.abs(u.z - bz) < 3) test(u); // and the few bigger ones
    }
    if (bad) return false;
    // tiles against props (new or old), each prop's own tiles excepted
    const props = Wd.props.concat(dr.props);
    const owns = (p, t) => { if (!p.own) return false; if (p.own.has(t)) return true; for (const q of p.own) if (close(t, q)) return true; return false; };
    for (let i = from; i < T.length; i++) { const t = T[i]; for (const p of props) if (Math.hypot(p.x - t.x, p.z - t.z) < p.r + 2.6 * t.s && clashProp(t, p) && !owns(p, t)) return false; }
    if (from) return true;
    for (const p of dr.props) {
      let bad = false;
      gridNear(Wd.grid, p.x, p.z, p.r + 2.6, (u) => { if (!bad && clashProp(u, p) && !owns(p, u)) bad = true; });
      if (bad) return false;
      for (const q of props) if (q !== p && (!q.grp || q.grp !== p.grp) && Math.hypot(q.x - p.x, q.z - p.z) < q.r + p.r + 0.3) return false;
    }
    return true;
  }
  const BEARINGS = [0, 1 / 6, -1 / 6, 1 / 3.5, -1 / 3.5, 1 / 2.7, -1 / 2.7]; // curvatures a line can bear
  /** n tiles on from tile p, curving steadily (curvature c), into the draft. */
  function bear(dr, p, c, n) {
    let h = p.h;
    for (let i = 0; i < n; i++) { h += (c * SP) / 2; const q = put(dr, p, p.x + Math.cos(h) * SP, p.z + Math.sin(h) * SP, h + (c * SP) / 2, {}); h += (c * SP) / 2; p = q; }
    return p;
  }
  /** A piece is kept only if the line can go on from its end, on to the right across open table (so it never boxes itself in). */
  function fitsOn(Wd, dr, end) {
    if (!fits(Wd, dr)) return false;
    const { zLo, zHi } = Wd.band;
    for (const z of [(zLo + zHi) / 2, zLo + 2.5, zHi - 2.5]) for (const dx of [6, 10]) {
      const d2 = { tiles: dr.tiles.slice(), links: dr.links.slice(), props: dr.props, from: dr.from, bells: dr.bells };
      if (road(d2, end, Math.max(end.x, Wd.genX) + dx, z, 0, 2.8, {}) && fits(Wd, d2, dr.tiles.length)) return true;
    }
    return false;
  }
  function commit(Wd, dr) {
    const first = Wd.ord;
    for (const t of dr.tiles) {
      t.o = Wd.ord++;
      Wd.tiles.push(t);
      gridAdd(Wd.grid, t);
      if (t.s > 1) Wd.bigs.push(t);
      if (t.x > Wd.genX) Wd.genX = t.x;
    }
    // who strikes whom: each new tile, whatever its fall reaches; each older tile whose fall reaches a new one
    for (const t of dr.tiles) {
      gridNear(Wd.grid, t.x, t.z, 2.3 * t.s + 0.3, (u) => {
        if (strikes(t, u)) addLink(t, u);
        if (u.o < first && strikes(u, t)) addLink(u, t);
      });
    }
    for (const p of dr.props) {
      Wd.props.push(p);
      if (p.x > Wd.genX) Wd.genX = p.x;
      if (p.y0 > 0) gridNear(Wd.grid, p.x, p.z, p.r + 0.5, (u) => { if (u.y + u.H <= p.y0 + 0.05 && inProp(p, u.x, u.z, 0.35)) u.plank = p; }); // the tiles under a bridge's plank
    }
    for (const [t, b] of dr.bells || []) bellLink(t, b);
    Wd.tail = dr.tail;
  }

  /** A desk bell (scale s) on the floor: a dark base, a brass dome, the plunger with its knob on top. */
  function mkBell(x, z, s, br) {
    const b = { kind: 'bell', x, z, y: 0, s, r: 0.66 * s, br, hitK: 0, spr: null };
    b.RB = 0.62 * s; b.HB = 0.1 * s; b.RD = 0.52 * s; b.HD = 0.34 * s; b.rod = 0.2 * s; b.rk = 0.07 * s;
    b.hk = b.HB + b.HD + b.rod + b.rk; // the knob's centre
    return b;
  }
  /** The last tile of a run falls onto the bell's knob. */
  function bellLink(t, b) {
    const D = (b.x - t.x) * t.fx + (b.z - t.z) * t.fz, hk = b.hk - t.y, d = Math.hypot(D, hk);
    t.bell = { b, th: Math.atan2(D, hk) - Math.asin(Math.min(0.9, b.rk / d)) };
  }
  /** A run of growing tiles from prev, each a quarter bigger, along a gentle arc (turn per unit length), then a bell. */
  function growRun(dr, prev, n, turn, br) {
    let x = prev.x, z = prev.z, h = prev.h, s = prev.s;
    for (let i = 0; i < n; i++) {
      const s2 = s * 1.25, d = SP * s2 * 1.04;
      h += turn * d * 0.5; x += Math.cos(h) * d; z += Math.sin(h) * d; h += turn * d * 0.5;
      prev = put(dr, prev, x, z, h, { s: s2, br });
      s = s2;
    }
    bellAt(dr, prev, 1.3);
    return prev;
  }
  /** A desk bell (scale bs) just ahead of tile t, its knob where t's top comes down. */
  function bellAt(dr, t, bs) {
    const b = mkBell(0, 0, bs, 0), Db = b.RB + 0.12 + 0.04 * bs;
    b.x = t.x + Math.cos(t.h) * Db; b.z = t.z + Math.sin(t.h) * Db;
    b.own = new Set([t]);
    dr.props.push(b);
    (dr.bells = dr.bells || []).push([t, b]);
    return b;
  }

  /**
   * Wooden steps under a straight run (levels: how many steps up each tile stands): up three, along the top, down
   * three; or, for a bridge, up five, across a plank with nothing under it (plank: the tiles on it), and down.
   */
  let GRP = 0;
  function stairs(dr, prev, h, o = {}, levels = [0, 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1, 0, 0], plank = null) {
    const STEP = 0.25, fx = Math.cos(h), fz = Math.sin(h), grp = ++GRP, own = new Set();
    const x0 = prev.x + fx * SP, z0 = prev.z + fz * SP;
    const ts = levels.map((lv, i) => put(dr, i ? null : prev, x0 + fx * SP * i, z0 + fz * SP * i, h, { ...o, y: lv * STEP }));
    for (let i = 1; i < ts.length; i++) dr.links.push([ts[i - 1], ts[i]]);
    for (const t of ts) own.add(t);
    own.add(prev);
    // one block per level run, from floor to its height (the plank: a board at the top, open underneath), edges halfway between the tiles
    const isPlank = (i) => !!plank && i >= plank[0] && i <= plank[1];
    let i = 0;
    while (i < levels.length) {
      let k = i;
      while (k + 1 < levels.length && levels[k + 1] === levels[i] && isPlank(k + 1) === isPlank(i)) k++;
      if (levels[i] > 0) {
        const a0 = SP * i - TT - (SP - TT) / 2, a1 = SP * k + (SP - TT) / 2, ht = levels[i] * STEP;
        const blk = { kind: 'block', x: x0 + fx * (a0 + a1) / 2, z: z0 + fz * (a0 + a1) / 2, h, len: a1 - a0, wid: 0.92, ht, y0: isPlank(i) ? ht - 0.1 : 0, r: (a1 - a0) / 2 + 0.15, br: o.br || 0, spr: null, grp, own };
        blk.ox = x0 + fx * a0; blk.oz = z0 + fz * a0;
        dr.props.push(blk);
        for (let q = i; q <= k; q++) ts[q].blk = blk;
      }
      i = k + 1;
    }
    return ts[ts.length - 1];
  }

  /* the pictures painted on the backs of a field's tiles: v across (-1..1, left to right), w down the field (1 at the far tip) */
  const inPoly = (px, py, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const STAR = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = i % 2 ? 0.27 : 0.66; STAR.push([Math.sin(a) * r, Math.cos(a) * r + 0.04]); }
  // each with a margin of plain tiles round it, so its outline reads against the diamond's
  const PICS = [
    (v, w) => { const x = v * 1.95, y = w * 1.95 + 0.35, a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; }, // a heart
    (v, w) => { v *= 1.15; w = w * 1.15 + 0.02; return (w < 0.55 && w > -0.3 && Math.abs(v) < 0.18 + (0.55 - w) * 0.35 * (1 - Math.max(0, w - 0.3) * 1.5)) || (w <= -0.3 && w > -0.42 && Math.abs(v) < 0.52) || v * v + (w + 0.52) ** 2 < 0.012; }, // a bell
    (v, w) => { const x = v * 1.95, y = w * 1.95 + 0.35, a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; }, // a heart again: it reads best
    (v, w) => { v *= 1.2; w *= 1.2; return v * v + w * w < 0.42 && (v - 0.3) ** 2 + (w - 0.12) ** 2 >= 0.3; }, // a crescent moon
    (v, w) => inPoly(v, w, STAR), // a star
  ];

  /** The field: a diamond of tiles fanning out from one tile and closing to one, each striking two in the next row. */
  function field(dr, prev, M, pic) {
    const h = prev.h, fx = prev.fx, fz = prev.fz, nx = -fz, nz = fx, DZ = 0.6;
    const f = PICS[pic % PICS.length], fid = ++GRP;
    prev.kind = 1; prev.col = f(0, 1) ? 1 : 0; prev.fid = fid;
    let row = [prev];
    for (let c = 1; c <= 2 * M; c++) {
      const n = Math.min(c, 2 * M - c) + 1, w = 1 - c / M, next = [];
      for (let j = 0; j < n; j++) {
        const lam = (j - (n - 1) / 2) * DZ, v = (j - (n - 1) / 2) / (M / 2);
        next.push(put(dr, null, prev.x + fx * SP * c + nx * lam, prev.z + fz * SP * c + nz * lam, h, { kind: 1, col: f(v, w) ? 1 : 0 }));
        next[next.length - 1].fid = fid;
      }
      // each tile strikes the one or two in the next row that its width overlaps
      for (let a = 0; a < row.length; a++) {
        for (let b = 0; b < next.length; b++) {
          const la = (a - (row.length - 1) / 2) * DZ, lb = (b - (next.length - 1) / 2) * DZ;
          if (Math.abs(la - lb) < 0.45) dr.links.push([row[a], next[b]]);
        }
      }
      row = next;
    }
    return row[0];
  }

  /* ---------- the sections of course ---------- */

  function secSweep(Wd, dr, t0, o = {}) {
    const { zLo, zHi } = Wd.band, span = zHi - zLo, mid = (zLo + zHi) / 2;
    const up = t0.z < mid ? Math.random() < 0.82 : Math.random() < 0.18;
    const z1 = o.z ?? (up ? rnd(zHi - span * 0.15, zHi - 1.2) : rnd(zLo + 1.2, zLo + span * 0.15));
    const h1 = o.h ?? rnd(-0.35, 0.35);
    const x1 = t0.x + (o.dx ?? rnd(2.5, 5));
    return road(dr, t0, x1, z1, h1, o.r ?? rnd(2.7, 3.8), {});
  }
  function lead(dr, t0, n) { // a few tiles straight on
    let p = t0;
    for (let i = 0; i < n; i++) p = put(dr, p, p.x + p.fx * SP, p.z + p.fz * SP, p.h, {});
    return p;
  }
  /** Two branches that part and meet again; one of them may climb over the steps. */
  function secRace(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band;
    if (Math.abs(t0.h) > 0.8) return null;
    const F = lead(dr, t0, 2);
    const [a0, b0] = fork(dr, F, { br: 1 }, { br: 2 });
    const steps = Math.random() < 0.45 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    // far enough along that each branch can swing out and back in with gentle turns (no loops)
    const Lx = steps ? rnd(21, 24) : rnd(13, 17), mz = clamp(F.z + rnd(-3, 3), zLo + 6, zHi - 6), mh = rnd(-0.3, 0.3);
    const mx = F.x + Lx, fmx = Math.cos(mh), fmz = Math.sin(mh), nmx = -fmz, nmz = fmx;
    const ex = mx - fmx * SP, ez = mz - fmz * SP, off = 0.33;
    const spA = rnd(2.5, 6), spB = rnd(2.5, 6);
    const wA = [F.x + Lx * rnd(0.45, 0.55), clamp(Math.max(F.z, mz) + spA, zLo + 2, zHi - 2)];
    const wB = [F.x + Lx * rnd(0.45, 0.55), clamp(Math.min(F.z, mz) - spB, zLo + 2, zHi - 2)];
    const branch = (p, w, br, ex2, ez2) => {
      const hw = rnd(-0.25, 0.25);
      if (steps === br) {
        p = road(dr, p, F.x + 6.5, w[1], hw, 2.8, { br, j0: 3 });
        if (!p) return null;
        p = stairs(dr, p, hw, { br });
      } else {
        p = road(dr, p, w[0], w[1], hw, rnd(2.6, 3.6), { br, j0: 3 });
        if (!p) return null;
      }
      return road(dr, p, ex2, ez2, mh, 2.7, { br, j1: 4 });
    };
    const ea = branch(a0, wA, 1, ex + nmx * off, ez + nmz * off);
    if (!ea) return null;
    const eb = branch(b0, wB, 2, ex - nmx * off, ez - nmz * off);
    if (!eb) return null;
    const M = put(dr, ea, mx, mz, mh, { j: true });
    dr.links.push([eb, M]);
    return M;
  }
  /**
   * A side branch that winds into a spiral (its rings 1.7 apart: a fallen tile cannot reach the next ring) and ends
   * at a small bell in the middle, while the line goes on past it.
   */
  function secSpiral(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band;
    if (Math.abs(t0.h) > 0.7) return null;
    const F = lead(dr, t0, 2);
    const side = zHi - F.z > F.z - zLo ? 1 : -1;
    const [s0, m0] = side > 0 ? fork(dr, F, { br: 1 }, { br: 2 }) : fork(dr, F, { br: 2 }, { br: 1 }).reverse();
    const room = side > 0 ? zHi - 0.8 - F.z : F.z - zLo - 0.8, gap = rnd(2.2, 2.8);
    const R1 = 2.7, RING = 1.7, ph0 = -side * HALF; // enter at the near (or far) side, heading on
    // as many turns as bring the last tile to fall toward us (a little to one side): the bell in plain view
    const want = -HALF + side * 0.45;
    let Phi = md(side * (want - side * HALF - ph0));
    while (Phi < TAU * 1.4) Phi += TAU;
    const R0 = R1 + RING * (Phi / TAU);
    if (2 * R0 + gap > room) return null;
    const cx = F.x + rnd(4.5, 7), cz = F.z + side * (R0 + gap);
    const ex = cx + R0 * Math.cos(ph0), ez = cz + R0 * Math.sin(ph0);
    let p = road(dr, s0, ex, ez, 0, 2.8, { br: 1 });
    if (!p) return null;
    const pts = [[p.x, p.z]];
    for (let k = 1; k <= 500; k++) { const q = (k / 500) * Phi, r = R0 + (R1 - R0) * (q / Phi), a = ph0 + side * q; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
    p = lay(dr, p, pts, { br: 1 });
    bellAt(dr, p, 0.75);
    // the main line goes on past it
    return road(dr, m0, cx + rnd(1, 3), clamp(F.z - side * rnd(3, 8), zLo + 2, zHi - 2), -side * rnd(0.6, 1.2), rnd(2.8, 3.4), { br: 2 });
  }
  /**
   * A loop that comes back over itself the way it is done for real: the line runs down the table toward us, swings
   * round to the left and back up, and crosses its own earlier stretch (fallen by then) on a bridge: five wooden
   * steps up, three tiles on a plank with nothing under it, five steps down, going on to the right. Seen side on.
   */
  function secLoop(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, r = 2.8, q = rnd(2.4, 3.2), pl = rnd(2.5, 4);
    const x1 = t0.x + 2 * r + q + rnd(3, 5); // the stretch the bridge will cross runs down the table here
    const zB = rnd(zLo + r + 1.5, zHi - (pl + r + 6.2)), zc = zB + pl + r, zA = zc + 3.2;
    if (zA > zHi - 2) return null;
    let p = road(dr, t0, x1, zA, -HALF, 2.8, {});
    if (!p) return null;
    p = lay(dr, p, [[p.x, p.z], [x1, zB]], {}, -HALF);
    // round to the left, back up, and right again toward the stretch, ending at the bridge's first step
    const segs = [[r, -HALF], [0, q], [r, -HALF], [0, pl], [r, -HALF], [0, r + q - 7 * SP]];
    p = lay(dr, p, trace(p.x, p.z, -HALF, segs, [[p.x, p.z]]), {}, 0);
    if (Math.abs(p.x - (x1 - 7 * SP)) > 0.05 || Math.abs(p.z - zc) > 0.05) return null;
    return stairs(dr, p, 0, {}, [1, 2, 3, 4, 5, 5, 5, 5, 5, 4, 3, 2, 1, 0, 0], [5, 7]);
  }
  /** A short side branch curling away to a run of growing tiles and a bell. */
  function secGrow(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, mid = (zLo + zHi) / 2;
    if (Math.abs(t0.h) > 0.8) return null;
    // the branch comes toward us if there is room (else it bears off to the right), so the bell is never hidden behind its tiles
    const side = t0.z - zLo > 8.5 ? -1 : 1;
    void mid;
    const F = lead(dr, t0, 2);
    const [s0, m0] = side > 0 ? fork(dr, F, { br: 1 }, { br: 2 }) : fork(dr, F, { br: 2 }, { br: 1 }).reverse();
    const hb = side < 0 ? -rnd(0.5, 1.0) : rnd(0.1, 0.35);
    let p = road(dr, s0, F.x + rnd(3, 5.5), F.z + side * rnd(2.5, 4), hb, 2.7, { br: 1, j0: 3 });
    if (!p) return null;
    p = lead(dr, p, 2);
    for (const t of dr.tiles.slice(-2)) t.br = 1;
    growRun(dr, p, 4, rnd(-0.08, 0.08), 1);
    return road(dr, m0, F.x + rnd(6, 9), clamp(F.z - side * rnd(4, 9), zLo + 2, zHi - 2), -side * rnd(0.3, 0.9), rnd(2.8, 3.6), { br: 2, j0: 3 });
  }
  /** The line climbs to the far side, turns toward us into a field, and leaves it at the near tip. */
  function secField(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, span = zHi - zLo;
    const M = span > 27 ? 12 : span > 23 ? 10 : 8, len = 2 * M * SP;
    if (span < len + 9) return null;
    const zE = rnd(Math.max(zLo + len + 3, zHi - 9), zHi - 3.5);
    const p = road(dr, t0, t0.x + rnd(8, 12), zE, -HALF, rnd(2.8, 3.4), {});
    if (!p) return null;
    Wd.pic = (Wd.pic + 1 + ((Math.random() * 2) | 0)) % PICS.length;
    return field(dr, p, M, Wd.pic);
  }
  function secStairs(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, up = t0.z < (zLo + zHi) / 2 ? 1 : -1;
    const h = up * rnd(0.5, 0.95), run = 17 * SP; // across the table as much as along it
    // start where the whole run stays on the table, far enough on for the way there to be a gentle one
    const z0 = clamp(t0.z + up * rnd(0, 2), zLo + 1.5 + Math.max(0, -Math.sin(h) * run), zHi - 1.5 - Math.max(0, Math.sin(h) * run));
    const p = road(dr, t0, t0.x + rnd(6, 8), z0, h, rnd(2.8, 3.4), {});
    if (!p) return null;
    return stairs(dr, p, h, {});
  }

  /** The line runs back and forth across the table in rows, working its way to the far (or near) side. */
  function secZig(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, mid = (zLo + zHi) / 2, dz = t0.z < mid ? 1 : -1, r = rnd(2.7, 3.1);
    const z0 = clamp(t0.z + dz * rnd(0.5, 2), zLo + 1.5, zHi - 1.5), room = dz > 0 ? zHi - 1 - z0 : z0 - zLo - 1;
    let rows = Math.min(5, Math.floor(room / (2 * r)) + 1);
    if (rows % 2 === 0) rows--; // an odd number: the last row runs on to the right, into the open
    if (rows < 3) return null;
    const p = road(dr, t0, t0.x + r + rnd(3, 4), z0, 0, 2.8, {});
    if (!p) return null;
    const segs = [], L = rnd(5, 8);
    for (let i = 0; i < rows; i++) {
      segs.push([0, L]);
      if (i < rows - 1) segs.push([r, (i % 2 ? -1 : 1) * dz * Math.PI]);
    }
    return lay(dr, p, trace(p.x, p.z, p.h, segs, [[p.x, p.z]]), {});
  }

  const SECS = { sweep: secSweep, race: secRace, spiral: secSpiral, grow: secGrow, field: secField, stairs: secStairs, zig: secZig, loop: secLoop };
  const OPENING = ['sweep', 'race', 'sweep', 'field', 'zig', 'loop', 'grow', 'sweep', 'spiral', 'stairs', 'zig'];
  function nextKind(Wd) {
    if (Wd.pv) return 'sweep';
    if (Wd.secN < OPENING.length) return OPENING[Wd.secN];
    const last = Wd.lastKind;
    if (last !== 'sweep' && Math.random() < 0.35) return 'sweep';
    const sinceBell = Wd.secN - Wd.bellAt, sinceField = Wd.secN - Wd.fieldAt;
    if (sinceField > 7) return 'field';
    if (sinceBell > 5) return Math.random() < 0.5 ? 'spiral' : 'grow';
    const w = [['race', 1.1], ['spiral', 1], ['grow', 1], ['field', 1.3], ['stairs', 0.5], ['zig', 1.8], ['loop', 0.9], ['sweep', 0.6]].filter((q) => q[0] !== last);
    let r = Math.random() * w.reduce((a, q) => a + q[1], 0);
    for (const q of w) { r -= q[1]; if (r <= 0) return q[0]; }
    return 'sweep';
  }
  /**
   * Lay the next piece of course: the planned feature (a few tries), else a plain way on to anywhere clear ahead. One
   * try at a time, for at most ms milliseconds (the rest next frame); true once a piece is laid.
   */
  function generate(Wd, ms = 1e9) {
    const t0 = performance.now();
    let G = Wd.gen;
    if (!G) G = Wd.gen = { kind: nextKind(Wd), tries: 0 };
    if (G.ok) { // found last frame: laid now
      const { dr, k } = G.ok;
      commit(Wd, dr); Wd.gen = null;
      if (k) {
        Wd.secN++; Wd.lastKind = k;
        if (k === 'spiral' || k === 'grow') Wd.bellAt = Wd.secN;
        if (k === 'field') Wd.fieldAt = Wd.secN;
      }
      return true;
    }
    const tail = Wd.tail;
    while (performance.now() - t0 < ms) {
      const n = G.tries++, dr = draft(tail);
      let end = null, k = null;
      if (n < 8) {
        k = n < 6 ? G.kind : 'sweep';
        end = Wd.pv ? pvSweep(Wd, dr, tail) : SECS[k](Wd, dr, tail, n > 6 ? { dx: rnd(6, 9) } : {});
      } else if (n < 48) { // a plain way on, anywhere clear ahead
        const { zLo, zHi } = Wd.band, m = n - 8;
        end = m < 30 ? road(dr, tail, tail.x + rnd(3, 4 + m * 0.4), rnd(zLo + 1, zHi - 1), rnd(-1.2, 1.2), rnd(2.6, 3.4), {}) : bear(dr, tail, BEARINGS[(m - 30) % BEARINGS.length], 4);
      } else { // nowhere clear at all (never seen): a few tiles straight on, noted for the checks
        dr.tail = lead(dr, tail, 3); commit(Wd, dr);
        Wd.forced = (Wd.forced || 0) + 1; Wd.gen = null;
        return true;
      }
      if (end && fitsOn(Wd, dr, end)) {
        dr.tail = end;
        if (performance.now() - t0 > ms) { G.ok = { dr, k }; return false; } // the laying itself next frame
        commit(Wd, dr); Wd.gen = null;
        if (k) {
          Wd.secN++; Wd.lastKind = k;
          if (k === 'spiral' || k === 'grow') Wd.bellAt = Wd.secN;
          if (k === 'field') Wd.fieldAt = Wd.secN;
        }
        return true;
      }
    }
    return false;
  }
  /** The picker's little strip: one line, gently waving. */
  function pvSweep(Wd, dr, t0) {
    const { zLo, zHi } = Wd.band, L = rnd(3.5, 5), h0 = clamp(t0.h, -0.4, 0.4), h1 = rnd(-0.25, 0.25);
    const z1 = t0.z < (zLo + zHi) / 2 ? rnd((zLo + zHi) / 2, zHi) : rnd(zLo, (zLo + zHi) / 2), pts = [];
    for (let i = 0; i <= 40; i++) { // a smooth curve that only ever runs to the right: no loops in so small a strip
      const t = i / 40, t2 = t * t, t3 = t2 * t;
      pts.push([t0.x + L * t, (2 * t3 - 3 * t2 + 1) * t0.z + (t3 - 2 * t2 + t) * L * Math.tan(h0) + (-2 * t3 + 3 * t2) * z1 + (t3 - t2) * L * Math.tan(h1)]);
    }
    return lay(dr, t0, pts, {}, h1);
  }

  /* ---------- the camera ---------- */

  /**
   * Fixed, looking down at the table along +z (x to the right, z away from us); it only travels to the right.
   * Tiles keep their own depth as it travels, so each is drawn from the same angle all the way across.
   */
  function camera(w, h, pv) {
    const P = (pv ? 34 : 42) * D2R, phi = (pv ? 6 : 9) * D2R, F = h / 2 / Math.tan(phi);
    const k = pv ? h * 0.46 : clamp((h / 805) * 32, 18, 42);
    const ch = (F * Math.sin(P)) / k, cz = -ch / Math.tan(P);
    const cam = { P, sP: Math.sin(P), cP: Math.cos(P), F, ch, cz, ox: w / 2, oy: h / 2, x: 0, w, h, k };
    cam.zAt = (sy) => cz + ch / Math.tan(P + Math.atan((sy - h / 2) / F));
    return cam;
  }
  const zcOf = (cam, y, z) => -(y - cam.ch) * cam.sP + (z - cam.cz) * cam.cP;
  const ycOf = (cam, y, z) => (y - cam.ch) * cam.cP + (z - cam.cz) * cam.sP;
  /** How a tile standing at (y, z) is drawn: px per unit across, the screen offsets of a unit up and a unit away. */
  function jac(cam, y, z) {
    const zc = zcOf(cam, y, z), yc = ycOf(cam, y, z), F = cam.F, z2 = zc * zc;
    const J = { kx: F / zc, yy: (-F * (cam.cP * zc + yc * cam.sP)) / z2, yz: (-F * (cam.sP * zc - yc * cam.cP)) / z2, zc };
    const l = Math.hypot(J.yy, J.yz); J.vy = -J.yz / l; J.vz = J.yy / l; // toward the camera
    return J;
  }
  const hwAt = (Wd, z) => (Wd.cam.w / 2 + 70) / (Wd.cam.F / zcOf(Wd.cam, 0, z)); // half the visible width at depth z
  const rightEdge = (Wd, z) => Wd.cam.x + hwAt(Wd, z) + 1;

  /* ---------- the world ---------- */

  function newWorld(w, h, pv) {
    const cam = camera(w, h, pv);
    const zLo = cam.zAt(h * (pv ? 0.86 : 0.9)), zHi = cam.zAt(h * (pv ? 0.56 : 0.12));
    const Wd = {
      cam, pv, band: { zLo, zHi }, tiles: [], props: [], act: [], ord: 0, grid: new Map(), bigs: [], tail: null, genX: -1e9, minX: -1e9,
      secN: 0, lastKind: '', bellAt: 0, fieldAt: 0, pic: (Math.random() * PICS.length) | 0, snd: [], K: 0, init: true, front: null, fsx: w * 0.6, fsy: h * 0.5,
    };
    const z0 = pv ? (zLo + zHi) / 2 : rnd(zLo + (zHi - zLo) * 0.3, zLo + (zHi - zLo) * 0.5);
    const x0 = -hwAt(Wd, z0) - 1.5;
    const t = mkTile(x0, z0, pv ? 0 : rnd(-0.3, 0.3)); t.o = Wd.ord++;
    Wd.tiles.push(t); Wd.tail = t; Wd.genX = x0;
    gridAdd(Wd.grid, t);
    activate(Wd, t); t.om = 1.4 * SPD; t.cause = 'start';
    Wd.warmF = 0;
    return Wd;
  }
  /**
   * Run the new course until its wave is well under way, a few milliseconds a frame (nothing is drawn meanwhile);
   * true once it is.
   */
  function warm(Wd, ms) {
    const cam = Wd.cam, t0 = performance.now();
    while (Wd.init) {
      tick(Wd);
      const fr = Wd.front, f = ++Wd.warmF;
      if (f >= 1500 || (fr && f > 60 && (fr.x - cam.x) * jac(cam, 0, fr.z).kx > cam.w * (Wd.pv ? -0.04 : 0.08))) {
        Wd.snd.length = 0;
        Wd.init = false;
        for (const b of Wd.props) if (b.kind === 'bell' && b.hitK) b.hitK = -999;
      } else if (performance.now() - t0 > ms) return false;
    }
    return true;
  }

  /** One frame: the course laid out ahead, the tiles moved, the camera brought along, the far past cleared away. */
  function tick(Wd) {
    const cam = Wd.cam;
    // the course laid out ahead, a little each frame (all at once while the course is first being set up, or if the wave gets near its end)
    const edge = cam.x + hwAt(Wd, Wd.band.zHi), want = Math.max(edge + 16, Wd.front ? Wd.front.x + 24 : -1e9);
    Wd.late = Wd.genX < edge + 2; // the laid course barely reaches the edge of the view: new tiles may come in at the edge
    if (Wd.init) { while (Wd.genX < want) generate(Wd); }
    else if (Wd.genX < want) generate(Wd, Wd.genX < edge + 8 || (Wd.front && Wd.genX < Wd.front.x + 10) ? 6 : 1);
    for (let i = 0; i < SUB; i++) { Wd.sub = i; step(Wd); }
    Wd.K++;
    // the camera follows the leading front, but keeps every moving front in view
    let lead = null, lim = Infinity;
    for (const t of Wd.act) {
      if (t.sup && t.sup.st === 1) continue;
      if (!lead || t.x > lead.x) lead = t;
      lim = Math.min(lim, t.x + 0.44 * (cam.w / jac(cam, 0, t.z).kx));
    }
    for (const b of Wd.props) if (b.kind === 'bell' && b.hitK > 0 && Wd.K - b.hitK < 75) lim = Math.min(lim, b.x + 0.4 * (cam.w / jac(cam, 0, b.z).kx));
    if (lead) Wd.front = lead;
    else if (!Wd.act.length) { // everything has come to rest (a dead end): set the line going again by a touch at its tail
      const t = Wd.tiles.find((q) => q.st === 0 && q.o > (Wd.front ? Wd.front.o : -1));
      if (t) { activate(Wd, t); t.om = 1.3 * SPD; t.cause = 'restart'; }
    }
    const fr = Wd.front;
    if (fr) {
      const target = Math.min(fr.x - ((Wd.pv ? -0.02 : 0.1) * cam.w) / jac(cam, 0, fr.z).kx, lim);
      const d = target - cam.x;
      if (d > 0) cam.x += Wd.pv ? Math.min(d * 0.2, 0.8) : Math.min(d * 0.025, 0.12);
    }
    Wd.minX = cam.x - hwAt(Wd, Wd.band.zHi) - 2;
    if (Wd.K % 30 === 0) prune(Wd);
  }
  function prune(Wd) {
    const cut = Wd.cam.x - hwAt(Wd, Wd.band.zHi) - 4;
    let n = 0;
    for (const t of Wd.tiles) {
      if (t.x < cut && t.st !== 1) { gridDel(Wd.grid, t); dropSpr(t); continue; }
      Wd.tiles[n++] = t;
    }
    Wd.tiles.length = n;
    Wd.bigs = Wd.bigs.filter((t) => t.x >= cut || t.st === 1);
    Wd.props = Wd.props.filter((p) => p.x + p.r > cut || (p.kind === 'bell' && p.hitK > 0 && Wd.K - p.hitK < 90));
  }

  /* ---------- the look ---------- */

  function palette(L) {
    const [a0] = accents();
    if (L) {
      return {
        L, tile: [34, 32, 37], amb: 0.62, dif: 0.75, sky: 0.3, spec: 0.5, shin: 34, rim: [112, 108, 116], pip: [240, 234, 220], spin: [206, 166, 92],
        acc: mix(a0, [20, 20, 30], 0.42), plain: [34, 32, 37], wood: [142, 106, 70], woodA: 1, woodRim: [92, 64, 40],
        sh: [24, 28, 40], shA: 0.3, haze: 0, base: [38, 34, 36], brass: [[120, 82, 24], [208, 160, 70], [255, 236, 170]],
      };
    }
    return {
      L, tile: [192, 182, 161], amb: 0.38, dif: 0.7, sky: 0.12, spec: 0.15, shin: 26, rim: [84, 74, 60], pip: [28, 23, 20], spin: [176, 141, 79],
      acc: mix(a0, [0, 0, 0], 0.14), plain: [192, 182, 161], wood: [150, 112, 74], woodA: 1, woodRim: [62, 45, 30],
      sh: [0, 0, 0], shA: 0.5, haze: 0.06, base: [52, 44, 39], brass: [[106, 75, 25], [184, 144, 68], [222, 204, 160]],
    };
  }
  function lit(n, alb, P, J) {
    const dif = Math.max(0, n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]);
    const hx = LV[0], hy = LV[1] + J.vy, hz = LV[2] + J.vz, hl = Math.hypot(hx, hy, hz);
    const sp = Math.pow(Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl), P.shin) * P.spec * 255;
    const k = P.amb + P.dif * dif + P.sky * Math.max(0, n[1]);
    return [Math.min(255, alb[0] * k + sp), Math.min(255, alb[1] * k + sp), Math.min(255, alb[2] * k + sp)];
  }
  function rrect(x, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(r, 0); x.lineTo(w - r, 0); x.arcTo(w, 0, w, r, r); x.lineTo(w, h - r); x.arcTo(w, h, w - r, h, r);
    x.lineTo(r, h); x.arcTo(0, h, 0, h - r, r); x.lineTo(0, r); x.arcTo(0, 0, r, 0, r); x.closePath();
  }
  const PIPS = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
  const HULL = [];
  /** Convex hull of 2-D points (pairs in a flat array), into HULL; returns its vertex count. */
  function hull(p, n) {
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((a, b) => p[a * 2] - p[b * 2] || p[a * 2 + 1] - p[b * 2 + 1]);
    const st = [];
    const cr = (o, a, b) => (p[a * 2] - p[o * 2]) * (p[b * 2 + 1] - p[o * 2 + 1]) - (p[a * 2 + 1] - p[o * 2 + 1]) * (p[b * 2] - p[o * 2]);
    for (const i of idx) { while (st.length >= 2 && cr(st[st.length - 2], st[st.length - 1], i) <= 0) st.pop(); st.push(i); }
    const lo = st.length + 1;
    for (let k = idx.length - 2; k >= 0; k--) { const i = idx[k]; while (st.length >= lo && cr(st[st.length - 2], st[st.length - 1], i) <= 0) st.pop(); st.push(i); }
    st.pop();
    HULL.length = 0;
    for (const i of st) HULL.push(p[i * 2], p[i * 2 + 1]);
    return st.length;
  }

  /**
   * A box's faces, as the camera sees them at J from the point (ox, oy) (CSS px; d = device px per CSS px): its
   * corner o and edges A, B, N (world vectors with lengths la, lb, ln). Each face is lit by the lamp, a little lighter
   * toward its upper edge, its rounded rim catching the light; alb(face) is its colour, paint(x, face, lu, lv, colour)
   * dresses it in its own coordinates (u along its first edge, v along its second, world units).
   */
  const CR = new Float64Array(16);
  function box(x, J, ox, oy, d, o, A, B, N, la, lb, ln, alb, P, rim, paint, round = 0.24) {
    const pX = (v) => J.kx * v[0], pY = (v) => J.yy * v[1] + J.yz * v[2];
    let n = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const v = [o[0] + A[0] * la * a + B[0] * lb * b + N[0] * ln * c, o[1] + A[1] * la * a + B[1] * lb * b + N[1] * ln * c, o[2] + A[2] * la * a + B[2] * lb * b + N[2] * ln * c];
      CR[n++] = ox + pX(v); CR[n++] = oy + pY(v);
    }
    const m = hull(CR, 8);
    x.setTransform(d, 0, 0, d, 0, 0);
    x.beginPath(); x.moveTo(HULL[0], HULL[1]); for (let i = 1; i < m; i++) x.lineTo(HULL[i * 2], HULL[i * 2 + 1]); x.closePath();
    x.fillStyle = rgb(rim); x.fill();
    const e = 0.016 * Math.max(1, ln * 1.6), px = 1 / (J.kx * d); // one device pixel, in world units
    const face = (id, O, U, lu, V, lv, nrm) => {
      const facing = nrm[1] * J.vy + nrm[2] * J.vz;
      if (facing <= 0.002) return;
      x.setTransform(d * J.kx * U[0], d * (J.yy * U[1] + J.yz * U[2]), d * J.kx * V[0], d * (J.yy * V[1] + J.yz * V[2]), d * (ox + pX(O)), d * (oy + pY(O)));
      const al = alb(id), col = lit(nrm, al, P, J), ei = Math.min(e, lu * 0.2, lv * 0.2);
      const dif = Math.max(0, nrm[0] * LV[0] + nrm[1] * LV[1] + nrm[2] * LV[2]);
      x.translate(ei, ei);
      rrect(x, lu - 2 * ei, lv - 2 * ei, Math.min(lu, lv) * round);
      const g = x.createLinearGradient(0, 0, 0, lv);
      g.addColorStop(0, rgb(mix(col, rim, 0.16))); g.addColorStop(0.6, rgb(col)); g.addColorStop(1, rgb(mix(col, [255, 255, 255], P.L ? 0.05 : 0.07)));
      x.fillStyle = g; x.fill();
      if (dif > 0.05 && facing > 0.12) { // the rounded rim catching the lamp
        x.strokeStyle = P.L ? `rgba(255,255,255,${(0.1 + 0.22 * dif).toFixed(3)})` : `rgba(255,250,236,${(0.09 + 0.22 * dif).toFixed(3)})`;
        x.lineWidth = Math.min(px * 1.1, Math.min(lu, lv) * 0.25);
        x.stroke();
      }
      x.translate(-ei, -ei);
      if (paint) paint(x, id, lu, lv, col, nrm);
    };
    const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
    const neg = (v) => [-v[0], -v[1], -v[2]];
    face('a0', o, N, ln, B, lb, neg(A));
    face('a1', add(o, A, la), N, ln, B, lb, A);
    face('b1', add(o, B, lb), N, ln, A, la, B);
    face('b0', o, N, ln, A, la, neg(B));
    face('n1', add(o, N, ln), A, la, B, lb, N);
    face('n0', o, A, la, B, lb, neg(N));
  }

  /**
   * A tile tipped by th, its pivot (front bottom edge, middle) at (ox, oy). The pips are on its back (they face up
   * once it has fallen); a field tile has them on its front and its back and top painted, the picture's colour or
   * plain.
   */
  function drawTile(x, t, th, J, ox, oy, P, d) {
    const c = Math.cos(th), s = Math.sin(th), fx = t.fx, fz = t.fz;
    const A = [fx * c, -s, fz * c], B = [fx * s, c, fz * s], N = [-fz, 0, fx];
    const W = t.W, T = t.T, H = t.H;
    const o = [-A[0] * T - N[0] * W / 2, -A[1] * T, -A[2] * T - N[2] * W / 2];
    const field = t.kind === 1, pipFace = field ? 'a1' : 'a0';
    const alb = field && t.col ? (id) => (id === 'a0' || id === 'b1' ? P.acc : P.tile) : () => P.tile;
    box(x, J, ox, oy, d, o, A, B, N, T, H, W, alb, P, P.rim, (x2, id, lu, lv, col) => {
      if (id !== pipFace) return;
      // the face with the pips: a line across the middle, a brass pin, the pips in each half
      const k = clamp((col[0] + col[1] + col[2]) / (3 * 255), 0.2, 1), sc = t.s;
      x2.fillStyle = rgba(mix(P.pip, col, P.L ? 0.4 : 0.3), 0.85);
      x2.fillRect(lu * 0.14, lv / 2 - 0.008 * sc, lu * 0.72, 0.016 * sc);
      const q = lu * 0.25, pr = 0.044 * sc;
      x2.beginPath();
      for (let half = 0; half < 2; half++) {
        const cy = lv * (half ? 0.75 : 0.25);
        for (const [a, b] of PIPS[t.pips[half]]) { x2.moveTo(lu / 2 + a * q + pr, cy + b * q); x2.arc(lu / 2 + a * q, cy + b * q, pr, 0, TAU); }
      }
      x2.fillStyle = rgba(P.L ? mix(P.pip, [60, 56, 52], 1 - k) : P.pip, 0.9); x2.fill();
      x2.beginPath(); x2.arc(lu / 2, lv / 2, 0.028 * sc, 0, TAU); x2.fillStyle = rgb(mix(P.spin, [0, 0, 0], (1 - k) * 0.8)); x2.fill();
    });
  }
  /** Where a tile's corners lie (pivot-relative screen offsets) to size its picture. */
  function tileBox(t, th, J) {
    const c = Math.cos(th), s = Math.sin(th), fx = t.fx, fz = t.fz;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let q = 0; q < 2; q++) {
      const al = -t.T * a, be = t.H * b, la = (q - 0.5) * t.W;
      const vx = fx * c * al + fx * s * be - fz * la, vy = -s * al + c * be, vz = fz * c * al + fz * s * be + fx * la;
      const sx = J.kx * vx, sy = J.yy * vy + J.yz * vz;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return [x0, y0, x1, y1];
  }
  /*
   * A still tile is drawn once into a shared sheet (shelf-packed pages, so drawing a few hundred of them a frame is
   * one texture, not hundreds); a page is wiped and used again once none of its pictures is in use.
   */
  const atlas = (d) => ({ pages: [], cur: null, size: Math.min(2048, 1024 * Math.ceil(d)) });
  function dropSpr(t) {
    const sp = t.spr;
    if (sp && sp.gen === sp.pg.gen) sp.pg.live--;
    t.spr = null;
  }
  function wipe(pg) {
    pg.x.setTransform(1, 0, 0, 1, 0, 0); pg.x.clearRect(0, 0, pg.c.width, pg.c.height);
    pg.gen++; pg.live = 0; pg.cx = 0; pg.cy = 0; pg.sh = 0;
  }
  function place(A, w, h) {
    let pg = A.cur;
    const fits = (q) => (q.cx + w <= A.size ? q.cy + h <= A.size : q.cy + q.sh + h <= A.size);
    if (!pg || !fits(pg)) {
      pg = A.pages.find((q) => q !== A.cur && q.live <= 0);
      if (!pg && A.pages.length < 6) { const c = mk(A.size, A.size); pg = { c, x: c.getContext('2d'), gen: 0, live: 0, cx: 0, cy: 0, sh: 0 }; A.pages.push(pg); }
      if (!pg) pg = A.pages.filter((q) => q !== A.cur).sort((a, b) => a.live - b.live)[0]; // all in use: the emptiest gives way
      wipe(pg);
      A.cur = pg;
    }
    if (pg.cx + w > A.size) { pg.cy += pg.sh; pg.cx = 0; pg.sh = 0; }
    const r = { pg, gen: pg.gen, sx: pg.cx, sy: pg.cy, w, h };
    pg.cx += w; pg.sh = Math.max(pg.sh, h); pg.live++;
    return r;
  }
  function tileSprite(S, t, P, d) {
    const [x0, y0, x1, y1] = tileBox(t, t.th, t.J), pad = 2;
    const ax = Math.ceil(-x0 * d) + pad, ay = Math.ceil(-y0 * d) + pad;
    const sp = place(S.atl, Math.min(S.atl.size, ax + Math.ceil(x1 * d) + pad), Math.min(S.atl.size, ay + Math.ceil(y1 * d) + pad));
    drawTile(sp.pg.x, t, t.th, t.J, (sp.sx + ax) / d, (sp.sy + ay) / d, P, d);
    sp.ax = ax; sp.ay = ay;
    t.spr = sp;
    return sp;
  }

  /** The corners of a tile (or any box) dropped onto the floor along the light (or straight down): a convex outline. */
  const PT = new Float64Array(16);
  function shadowOf(t, down) {
    const c = Math.cos(t.th), s = Math.sin(t.th), fx = t.fx, fz = t.fz;
    let n = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let q = 0; q < 2; q++) {
      const al = -t.T * a, be = t.H * b, la = (q - 0.5) * t.W;
      const wx = t.x + fx * c * al + fx * s * be - fz * la, wy = -s * al + c * be, wz = t.z + fz * c * al + fz * s * be + fx * la;
      const k = down ? 0 : wy / LV[1];
      PT[n++] = wx - LV[0] * k; PT[n++] = wz - LV[2] * k;
    }
    const m = hull(PT, 8), out = new Float64Array(m * 2);
    if (down) { // a little wider than the tile: its contact shadow
      let cx = 0, cz = 0;
      for (let i = 0; i < m; i++) { cx += HULL[i * 2]; cz += HULL[i * 2 + 1]; }
      cx /= m; cz /= m;
      for (let i = 0; i < m; i++) { const dx = HULL[i * 2] - cx, dz = HULL[i * 2 + 1] - cz, l = Math.hypot(dx, dz) || 1, g = 0.07 * t.s; out[i * 2] = HULL[i * 2] + (dx / l) * g; out[i * 2 + 1] = HULL[i * 2 + 1] + (dz / l) * g; }
    } else out.set(HULL.slice(0, m * 2));
    return out;
  }
  /** A world outline (x, z pairs at height y) into the current path, in screen px. */
  function pathFloor(x, cam, pts, y) {
    for (let i = 0; i < pts.length; i += 2) {
      const zc = zcOf(cam, y, pts[i + 1]), sx = cam.ox + (cam.F * (pts[i] - cam.x)) / zc, sy = cam.oy - (cam.F * ycOf(cam, y, pts[i + 1])) / zc;
      if (i) x.lineTo(sx, sy); else x.moveTo(sx, sy);
    }
    x.closePath();
  }
  /** The same, for an outline that does not move: its screen points kept (only the travel to the right changes them). */
  function screenFloor(cam, pts, y) {
    const o = new Float64Array((pts.length / 2) * 3);
    for (let i = 0, j = 0; i < pts.length; i += 2, j += 3) {
      const zc = zcOf(cam, y, pts[i + 1]);
      o[j] = cam.ox + (cam.F * pts[i]) / zc; o[j + 1] = cam.F / zc; o[j + 2] = cam.oy - (cam.F * ycOf(cam, y, pts[i + 1])) / zc;
    }
    return o;
  }
  function pathKept(x, cx, o) {
    x.moveTo(o[0] - o[1] * cx, o[2]);
    for (let j = 3; j < o.length; j += 3) x.lineTo(o[j] - o[j + 1] * cx, o[j + 2]);
    x.closePath();
  }

  /** A wooden block (a step), lit like the tiles, with the grain along its top. */
  function blockSprite(b, cam, P, d) {
    const yb = b.y0 || 0, J = jac(cam, (yb + b.ht) / 2, b.z), fx = Math.cos(b.h), fz = Math.sin(b.h);
    const A = [fx, 0, fz], B = [0, 1, 0], N = [-fz, 0, fx];
    const o = [b.ox - b.x - N[0] * b.wid / 2, yb, b.oz - b.z - N[2] * b.wid / 2];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let a = 0; a < 2; a++) for (let q = 0; q < 2; q++) for (let c = 0; c < 2; c++) {
      const vx = o[0] + A[0] * b.len * a + N[0] * b.wid * c, vy = yb + (b.ht - yb) * q, vz = o[2] + A[2] * b.len * a + N[2] * b.wid * c;
      const sx = J.kx * vx, sy = J.yy * vy + J.yz * vz;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const pad = 2, ax = Math.ceil(-x0 * d) + pad, ay = Math.ceil(-y0 * d) + pad;
    const c = mk(ax + Math.ceil(x1 * d) + pad, ay + Math.ceil(y1 * d) + pad), x = c.getContext('2d');
    box(x, J, ax / d, ay / d, d, o, A, B, N, b.len, b.ht - yb, b.wid, () => P.wood, P, P.woodRim, (x2, id, lu, lv, col) => {
      // the grain: a few fine darker lines along the length
      x2.strokeStyle = rgba(mix(col, P.woodRim, 0.6), 0.5); x2.lineWidth = 0.018;
      x2.beginPath();
      if (id === 'b1') for (let i = 1; i < 5; i++) { const y = (lv * i) / 5 + Math.sin(i * 7.3) * 0.03; x2.moveTo(0.03, y); x2.bezierCurveTo(lu * 0.3, y + 0.02, lu * 0.6, y - 0.03, lu - 0.03, y + 0.01); }
      else if (id === 'n0' || id === 'n1') for (let i = 1; i < 3; i++) { const y = (lv * i) / 3; x2.moveTo(0.03, y); x2.lineTo(lu - 0.03, y + 0.01); }
      x2.stroke();
    }, 0.05);
    b.J = J;
    b.spr = { c, ax, ay };
    return b.spr;
  }

  /** A desk bell: dark base, brass dome (without the plunger, which moves). */
  function bellSprite(b, cam, P, d) {
    const J = jac(cam, 0, b.z), kv = Math.hypot(J.yy, J.yz);
    const ex = (r) => r * J.kx, ey = (r) => -r * J.yz; // a horizontal circle's half-axes on screen
    const left = ex(b.RB) + 2, up = -J.yy * (b.HB + b.HD) + 2, down = ey(b.RB) + 2;
    const pad = 2, ax = Math.ceil(left * d) + pad, ay = Math.ceil(up * d) + pad;
    const c = mk(ax * 2, ay + Math.ceil(down * d) + pad), x = c.getContext('2d');
    x.setTransform(d, 0, 0, d, ax, ay);
    const yT = J.yy * b.HB, [bd, bm, bl] = P.brass;
    // the base: its side band, then its top
    x.beginPath(); x.ellipse(0, 0, ex(b.RB), ey(b.RB), 0, 0, Math.PI); x.lineTo(-ex(b.RB), yT); x.ellipse(0, yT, ex(b.RB), ey(b.RB), 0, Math.PI, 0, true); x.closePath();
    let g = x.createLinearGradient(-ex(b.RB), 0, ex(b.RB), 0);
    g.addColorStop(0, rgb(mix(P.base, [255, 255, 255], 0.2))); g.addColorStop(0.45, rgb(P.base)); g.addColorStop(1, rgb(mix(P.base, [0, 0, 0], 0.45)));
    x.fillStyle = g; x.fill();
    x.beginPath(); x.ellipse(0, yT, ex(b.RB), ey(b.RB), 0, 0, TAU);
    g = x.createLinearGradient(-ex(b.RB), yT - ey(b.RB), ex(b.RB), yT + ey(b.RB));
    g.addColorStop(0, rgb(mix(P.base, [255, 255, 255], 0.28))); g.addColorStop(1, rgb(mix(P.base, [0, 0, 0], 0.12)));
    x.fillStyle = g; x.fill();
    // the dome: a spherical cap, everything of the sphere above the front of its rim
    const rho = (b.RD * b.RD + b.HD * b.HD) / (2 * b.HD), cy = J.yy * (b.HB + b.HD - rho);
    x.save();
    x.beginPath(); x.moveTo(-left, yT); x.ellipse(0, yT, ex(b.RD), ey(b.RD), 0, Math.PI, 0, true); x.lineTo(left, yT); x.lineTo(left, -up - 4); x.lineTo(-left, -up - 4); x.closePath();
    x.clip();
    x.beginPath(); x.ellipse(0, cy, J.kx * rho, kv * rho, 0, 0, TAU);
    const hx = -ex(b.RD) * 0.38, hy = yT + J.yy * b.HD * 0.72;
    g = x.createRadialGradient(hx, hy, 0, -ex(b.RD) * 0.1, yT + J.yy * b.HD * 0.4, ex(b.RD) * 1.2);
    g.addColorStop(0, rgb(bl)); g.addColorStop(0.16, rgb(mix(bl, bm, 0.55))); g.addColorStop(0.5, rgb(bm)); g.addColorStop(0.82, rgb(mix(bm, bd, 0.7))); g.addColorStop(1, rgb(bd));
    x.fillStyle = g; x.fill();
    x.restore();
    x.beginPath(); x.ellipse(0, yT, ex(b.RD), ey(b.RD), 0, 0, Math.PI); x.strokeStyle = rgba(bd, 0.85); x.lineWidth = 0.7; x.stroke();
    b.J = J;
    b.spr = { c, ax, ay };
    return b.spr;
  }
  function drawPlunger(x, b, sx, sy, P, dip) {
    const J = b.J, s = b.s, y0 = b.HB + b.HD - 0.02 * s, y1 = b.hk - dip;
    const a = sy + J.yy * y0, k = sy + J.yy * y1, rw = Math.max(0.8, 0.028 * s * J.kx);
    x.fillStyle = rgb(P.L ? [120, 122, 130] : [150, 150, 158]);
    x.fillRect(sx - rw, k, rw * 2, a - k);
    const kr = b.rk * J.kx;
    const g = x.createRadialGradient(sx - kr * 0.4, k - kr * 0.4, 0, sx, k, kr);
    g.addColorStop(0, 'rgb(250,250,252)'); g.addColorStop(0.5, P.L ? 'rgb(150,152,160)' : 'rgb(190,190,198)'); g.addColorStop(1, P.L ? 'rgb(70,72,80)' : 'rgb(96,96,104)');
    x.beginPath(); x.arc(sx, k, kr, 0, TAU); x.fillStyle = g; x.fill();
  }

  /*
   * ---------- sound ----------
   * Every strike is heard at the moment it happens (to the slice of the frame), as a grain of a recorded strike
   * (ambient/domino-tile.ogg, and domino-tile2..4.ogg when there are more takes, never the same take twice running):
   * its pitch, level and timing never quite the same, panned to where the tile is, quieter and duller the farther
   * off it is, lower and heavier for a big tile or one on the wooden steps. At ten strikes a second, more where the
   * line has forked or a field goes down, the grains run together into the rattle of a real run; softly under them,
   * a recording of a long run toppling (ambient/domino-run.ogg) follows how fast tiles are falling. All of it goes
   * through a warm, gently rounded bus (a little low-mid, the top above 5.5 kHz taken off, a compressor and a soft
   * limiter), so a field going down is a full rush, never harsh or clipped. Voices beyond the pool give way
   * quietest first. The bell rings its own recording (ambient/domino-bell.ogg).
   */
  const TILES = ['tile', 'tile2', 'tile3', 'tile4'];
  const FILES = { tile: 'domino-tile', tile2: 'domino-tile2', tile3: 'domino-tile3', tile4: 'domino-tile4', bell: 'domino-bell', run: 'domino-run' };
  const CLIP = { ac: null, buf: {}, st: {}, failed: {} };
  function clips(ac) {
    const load = (key) => {
      CLIP.st[key] = '';
      fetch(`ambient/${FILES[key]}.ogg`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((b) => ac.decodeAudioData(b)).then((buf) => { if (CLIP.ac === ac) { CLIP.buf[key] = buf; CLIP.st[key] = 'ok'; } })
        .catch(() => { if (CLIP.ac === ac) { CLIP.st[key] = 'failed'; CLIP.failed[key] = performance.now(); } });
    };
    if (CLIP.ac !== ac) {
      Object.assign(CLIP, { ac, buf: {}, st: {}, failed: {} });
      for (const key in FILES) load(key);
    } else {
      for (const key in FILES) if (CLIP.st[key] === 'failed' && performance.now() - CLIP.failed[key] > 60000) load(key); // a recording added later is picked up
    }
    return CLIP;
  }
  const audible = () => typeof AMB !== 'undefined' && AMB.ctx && AMB.master && typeof ambVolume === 'function' && ambVolume() > 0 && AMB.ctx.state === 'running';

  const AUD = { ac: null, bus: null, gbus: null, out: null, bed: null, rate: 0, pan: 0, tokens: 10, synth: null, voices: [], last: -1 };
  const MAX_VOICES = 24;
  /**
   * The domino bus: the grains and the bed, warmed a little in the low mids, the top above 5.5 kHz gently taken off,
   * then a compressor and a soft limiter so many strikes at once sum to a rush, not a clip.
   */
  function bus(ac) {
    if (AUD.ac !== ac) {
      const gb = ac.createGain(), g = ac.createGain(), warm = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), comp = ac.createDynamicsCompressor(), lim = ac.createDynamicsCompressor();
      warm.type = 'peaking'; warm.frequency.value = 280; warm.Q.value = 0.8; warm.gain.value = 2.5;
      lp.type = 'lowpass'; lp.frequency.value = 5500; lp.Q.value = 0.5;
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.005; comp.release.value = 0.2; // light
      lim.threshold.value = -6; lim.knee.value = 3; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08; // only a ceiling
      gb.connect(g); g.connect(warm); warm.connect(lp); lp.connect(comp); comp.connect(lim); lim.connect(AMB.master);
      Object.assign(AUD, { ac, bus: g, gbus: gb, out: lim, bed: null, rate: 0, tokens: 10, synth: null, voices: [], last: -1 });
    }
    return AUD.bus;
  }
  /** Until a recording loads (or if none can): a strike made on the spot, a soft tick over a short hollow knock. */
  function synthTile(ac) {
    if (AUD.synth && AUD.synth.sampleRate === ac.sampleRate) return AUD.synth;
    const sr = ac.sampleRate, n = Math.floor(sr * 0.12), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = 0.35 * (Math.random() * 2 - 1) * Math.exp(-t / 0.003) + 0.4 * Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.016) + 0.3 * Math.sin(TAU * 760 * t) * Math.exp(-t / 0.03);
    }
    return (AUD.synth = b);
  }
  /** One of the strike takes, never the one just played (identical overlapping takes would flam). */
  function takeOf(C, ac) {
    const ok = TILES.filter((k) => C.st[k] === 'ok');
    if (!ok.length) return TILES.every((k) => C.st[k] === 'failed') ? synthTile(ac) : null;
    let i = (Math.random() * ok.length) | 0;
    if (ok.length > 1 && ok[i] === AUD.last) i = (i + 1 + ((Math.random() * (ok.length - 1)) | 0)) % ok.length;
    AUD.last = ok[i];
    return C.buf[ok[i]];
  }
  function grain(ac, buf, at, rate, gain, pan, cut) {
    const now = ac.currentTime;
    // the pool: when it is full the quietest voice gives way (or this one, if it is the quietest)
    const V = AUD.voices;
    for (let i = V.length - 1; i >= 0; i--) if (V[i].end < now) V.splice(i, 1);
    if (V.length >= MAX_VOICES) {
      let q = 0;
      for (let i = 1; i < V.length; i++) if (V[i].gain < V[q].gain) q = i;
      if (V[q].gain >= gain) return false;
      const v = V[q];
      v.g.gain.setTargetAtTime(0, now, 0.006); try { v.src.stop(now + 0.04); } catch { /* already stopping */ }
      V.splice(q, 1);
    }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
    src.buffer = buf; src.playbackRate.value = rate;
    f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.4;
    g.gain.value = gain; p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(AUD.gbus);
    const t = Math.max(at, now);
    src.start(t);
    src.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
    V.push({ src, g, gain, end: t + buf.duration / rate });
    return true;
  }
  function ding(ac, pan, at) {
    const C = clips(ac);
    if (C.st.bell === 'ok') {
      const src = ac.createBufferSource(), g = ac.createGain(), p = ac.createStereoPanner();
      src.buffer = C.buf.bell; src.playbackRate.value = 0.98 + Math.random() * 0.04;
      g.gain.value = 0.8; p.pan.value = pan;
      src.connect(g); g.connect(p); p.connect(bus(ac) && AUD.out); src.start(Math.max(at, ac.currentTime)); // under the same ceiling as the strikes
      src.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
      return;
    }
    if (C.st.bell === '') { setTimeout(() => { if (audible()) ding(AMB.ctx, pan, AMB.ctx.currentTime + 0.01); }, 250); return; }
    // a small brass dome: a few inharmonic partials, the higher ones dying first, a slow beat between a close pair
    const o = ac.createGain(), p = ac.createStereoPanner(), f0 = 1480 + Math.random() * 60;
    o.gain.value = 0.06; p.pan.value = pan; o.connect(p); p.connect(bus(ac) && AUD.out);
    at = Math.max(at, ac.currentTime);
    for (const [m, a, dcy] of [[1, 1, 2.6], [1.004, 0.6, 2.4], [2.76, 0.4, 1.2], [5.4, 0.18, 0.5]]) {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.frequency.value = f0 * m;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(a, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dcy);
      osc.connect(g); g.connect(o); osc.start(at); osc.stop(at + dcy + 0.05);
    }
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, 3500);
  }
  /**
   * The run's bed: the recording looped from a random point, faded in as a wave starts, its level following how many
   * tiles fall a second, panned to where they fall, faded out when they stop (and by itself if the frames stop).
   */
  function bed(ac, C, rate, pan) {
    if (C.st.run !== 'ok') return;
    // a soft bed under the strikes: up to 0.55 (a dense rush), a little less for a single line
    const now = ac.currentTime, lvl = rate > 1.5 ? 0.55 * Math.min(1, Math.pow(rate / 14, 0.6)) : 0;
    let B = AUD.bed;
    if (!B && lvl > 0) {
      const src = ac.createBufferSource(), g = ac.createGain(), p = ac.createStereoPanner();
      src.buffer = C.buf.run; src.loop = true; g.gain.value = 0;
      src.connect(g); g.connect(p); p.connect(AUD.bus);
      src.start(now, Math.random() * C.buf.run.duration);
      B = AUD.bed = { src, g, p, lvl: 0, n: 0 };
      src.onended = () => { try { p.disconnect(); } catch { /* gone */ } if (AUD.bed === B) AUD.bed = null; };
    }
    if (!B || (++B.n % 3 && lvl > 0 === B.lvl > 0)) return; // its level is set ten times a second (and at once when the run starts or stops)
    B.g.gain.cancelScheduledValues(now);
    B.g.gain.setTargetAtTime(lvl, now, lvl > B.lvl ? 0.6 : 0.3); // in over two or three seconds as a run gathers
    B.g.gain.setTargetAtTime(0, now + 0.45, 0.15); // no next frame (page hidden, another background): it fades out
    B.p.pan.setTargetAtTime(pan, now, 0.25);
    if (lvl > 0) B.src.stop(now + 2.5); // re-armed every frame while tiles fall; once they stop, it ends and the next run starts elsewhere
    B.lvl = lvl;
  }

  /** The frame's strikes, each at its own moment (to a quarter of a frame), as grains; the loudest kept within budget. */
  function sounds(Wd, w) {
    const ac = AMB.ctx, C = clips(ac), cam = Wd.cam;
    bus(ac);
    const FR = 1 / 30, LAT = 0.02, now = ac.currentTime; // a frame's strikes spread over the slice of time they happened in, the last as the frame is drawn
    AUD.tokens = Math.min(10, AUD.tokens + 75 * FR);
    const zN = zcOf(cam, 0, Wd.band.zLo), zF = zcOf(cam, 0, Wd.band.zHi);
    const items = [];
    let n = 0, ps = 0, pw = 0;
    for (const e of Wd.snd) {
      const zc = zcOf(cam, e.y || 0, e.z), sx = cam.ox + (cam.F * (e.x - cam.x)) / zc;
      const pan = clamp((sx / w - 0.5) * 1.7, -0.9, 0.9), dn = clamp((zc - zN) / (zF - zN), 0, 1);
      const imp = now + LAT - ((SUB - 1 - (e.sub || 0)) / SUB) * FR; // when it happened, on the audio clock
      if (e.k === 'bell') { ding(ac, pan, now + 0.003); Wd.rang = (Wd.rang || 0) + 1; continue; }
      const k = clamp(e.v / (3.4 * SPD), 0.25, 1.3), s = e.s || 1, onStep = (e.y || 0) > 0.01, heavy = s > 1.05 || onStep;
      const gain = (0.55 + 0.35 * clamp(0.45 * (k - 0.25) / 1.05 + 0.55 * Math.random(), 0, 1)) * (1 - 0.35 * dn) * Math.pow(s, 0.6) * (e.k === 'hit' ? 1 : e.k === 'floor' ? 0.7 : 0.5);
      const cut = 16000 * Math.pow(0.2, dn) * (heavy ? 0.55 : 1);
      const rate = (rnd(0.88, 1.14) / Math.pow(s, 0.5)) * (heavy ? 0.9 : 1) * (e.k === 'floor' ? 0.85 : 1);
      items.push({ at: imp + Math.random() * 0.005, imp, gain, rate, pan, cut });
      if (heavy && (e.dy || s > 1.05)) items.push({ at: imp + 0.004, imp, gain: gain * 0.7, rate: rate * 0.55, pan, cut: 900, extra: true }); // the knock on the step, the weight of a big tile
      if (C.st.run === 'failed') for (let q = 0; q < 2; q++) items.push({ at: imp + rnd(-0.045, 0.045), imp, gain: gain * 0.22, rate: rate * rnd(0.85, 1.2), pan: clamp(pan + rnd(-0.1, 0.1), -1, 1), cut: cut * 0.7, extra: true }); // no recorded run: two faint grains fill the rattle
      if (e.k === 'hit') { n++; ps += pan * gain; pw += gain; }
    }
    // how many tiles fall a second, and where: the bed follows them
    AUD.rate += (n / FR - AUD.rate) * 0.1;
    if (pw) AUD.pan += (ps / pw - AUD.pan) * 0.2;
    bed(ac, C, AUD.rate, AUD.pan);
    if (Wd.K % 30 === 0) Wd.clips = Object.keys(FILES).filter((k) => C.st[k] === 'ok').join(',') || 'none'; // which recordings are in use
    if (!items.length) return;
    items.sort((a, b) => b.gain - a.gain);
    const keep = Math.min(items.length, Math.floor(AUD.tokens));
    let played = 0;
    for (let i = 0; i < keep; i++) {
      const g = items[i], buf = takeOf(C, ac);
      if (buf && grain(ac, buf, g.at, g.rate, g.gain, g.pan, g.cut)) played++;
    }
    AUD.tokens -= played;
    Wd.heard = (Wd.heard || 0) + played;
  }

  /* ---------- the frame ---------- */

  let GLOW = null;
  function glowSprite() {
    if (GLOW) return GLOW;
    GLOW = mk(128, 128);
    const x = GLOW.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,244,222,1)'); g.addColorStop(0.4, 'rgba(255,240,214,0.45)'); g.addColorStop(1, 'rgba(255,236,206,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return GLOW;
  }

  window.BG_EXT.domino = function (bg, ctx, w, h) {
    const L = typeof isLight === 'function' && isLight(), dpr = bg.dpr || 1, pv = h < 90;
    const real = bg.canvas.classList.contains('bg-layer');
    let S = bg.dom;
    const acc = accents()[0].join(',');
    if (!S || S.w !== w || S.h !== h || S.dpr !== dpr) {
      S = bg.dom = { w, h, dpr, Wd: newWorld(w, h, pv), key: '' };
    }
    const key = `${L}|${acc}`;
    const Wd = S.Wd, cam = Wd.cam;
    if (S.key !== key) {
      S.key = key; S.P = palette(L);
      for (const t of Wd.tiles) t.spr = null;
      for (const p of Wd.props) p.spr = null;
      S.atl = atlas(dpr);
      S.sh = mk(Math.ceil((w * dpr) / 3), Math.ceil((h * dpr) / 3));
    }
    const P = S.P;
    const t0 = performance.now();
    if (Wd.init && !warm(Wd, pv ? 1e9 : 9)) return;
    if (Wd.ready) tick(Wd); // (until every tile in view has its picture, the course waits)
    if (real && audible()) sounds(Wd, w);
    Wd.snd.length = 0;

    // what is in view this frame
    const vis = [], F = cam.F, m = 3 * cam.k;
    for (const t of Wd.tiles) {
      if (!t.J) { t.J = jac(cam, t.y, t.z); t.sy0 = cam.oy - (F * ycOf(cam, t.y, t.z)) / t.J.zc; }
      const sx = cam.ox + (F * (t.x - cam.x)) / t.J.zc;
      if (sx < -m * t.s || sx > w + m * t.s || t.sy0 < -m * t.s || t.sy0 > h + m * t.s) { t.vf = 0; continue; }
      t.sx = sx; t.sy = t.sy0; t.vf = Wd.K;
      vis.push(t);
    }
    const props = [];
    for (const p of Wd.props) {
      const zc = zcOf(cam, 0, p.z), sx = cam.ox + (F * (p.x - cam.x)) / zc, sy = cam.oy - (F * ycOf(cam, 0, p.z)) / zc;
      p.key = zcOf(cam, p.kind === 'block' ? ((p.y0 || 0) + p.ht) / 2 : 0.3, p.z) + (p.kind === 'block' ? -p.ht * 0.01 : 0);
      if (sx < -m * 2 || sx > w + m * 2) continue;
      p.sx = sx; p.sy = sy;
      props.push(p);
    }
    // depth order: far first; a tile leaning on another is drawn over it once that one's back can be seen
    for (let i = vis.length - 1; i >= 0; i--) {
      const t = vis[i], c = Math.cos(t.th), s = Math.sin(t.th);
      const al = -0.5 * t.T * c + 0.5 * t.H * s;
      t.key = zcOf(cam, t.y + 0.5 * t.T * s + 0.5 * t.H * c, t.z + t.fz * al);
      const sp = t.sup;
      if (sp && t.st !== 0 && sp.vf === Wd.K) {
        const back = Math.sin(sp.th) * sp.J.vy - sp.fz * Math.cos(sp.th) * sp.J.vz > 0;
        t.key = back ? Math.min(t.key, sp.key - 1e-4) : Math.max(t.key, sp.key + 1e-4);
      }
      if (t.blk) t.key = Math.min(t.key, t.blk.key - 2e-4);
      if (t.plank) t.key = Math.max(t.key, t.plank.key + 2e-3); // under the bridge: drawn before its plank (and so is the line leaning on it)
    }
    if (!Wd.ready) { // the first pictures of the tiles in view, a few milliseconds a frame, then all shown at once
      for (const t of vis) if (!t.spr && t.st !== 1) { tileSprite(S, t, P, dpr); if (!pv && performance.now() - t0 > 10) return; }
      Wd.ready = true;
    }
    const items = vis.concat(props).sort((a, b) => b.key - a.key);

    // a soft pool of lamp light around the wave (on a dark page)
    const fr = Wd.front;
    if (fr && fr.J) {
      Wd.fsx += ((cam.ox + (F * (fr.x - cam.x)) / fr.J.zc) - Wd.fsx) * 0.04;
      Wd.fsy += (fr.sy0 - Wd.fsy) * 0.04;
    }
    if (P.haze && !pv) {
      const r = Math.max(w, h) * 0.5;
      ctx.globalAlpha = P.haze;
      ctx.drawImage(glowSprite(), Wd.fsx - r, Wd.fsy - r * 0.5, r * 2, r);
      ctx.globalAlpha = 1;
    }

    // shadows on the floor (soft: drawn small and stretched) and contact shadows under every tile
    const sh = S.sh, sx2 = sh.getContext('2d');
    sx2.setTransform(1, 0, 0, 1, 0, 0); sx2.clearRect(0, 0, sh.width, sh.height);
    sx2.setTransform(sh.width / w, 0, 0, sh.height / h, 0, 0);
    sx2.fillStyle = rgb(P.sh);
    sx2.beginPath();
    for (const t of vis) {
      if (t.blk) continue;
      if (t.st === 1 || !t.hull) { t.hull = shadowOf(t, false); t.foot = shadowOf(t, true); t.hS = null; }
      if (t.st === 1) pathFloor(sx2, cam, t.hull, t.y);
      else { if (!t.hS) { t.hS = screenFloor(cam, t.hull, t.y); t.fS = screenFloor(cam, t.foot, t.y); } pathKept(sx2, cam.x, t.hS); }
    }
    for (const p of props) {
      if (p.kind === 'block') { const q = blockShadow(p, false); pathFloor(sx2, cam, q, 0); }
      else pathFloor(sx2, cam, bellShadow(p, false), 0);
    }
    sx2.globalAlpha = 0.55; sx2.fill();
    sx2.beginPath();
    for (const t of vis) { // (a fallen tile lies on its own contact shadow)
      if (t.blk || t.st === 2) continue;
      if (t.st === 1 || !t.fS) pathFloor(sx2, cam, t.foot, t.y); else pathKept(sx2, cam.x, t.fS);
    }
    for (const p of props) pathFloor(sx2, cam, p.kind === 'block' ? blockShadow(p, true) : bellShadow(p, true), 0);
    sx2.globalAlpha = 1; sx2.fill();
    ctx.globalAlpha = P.shA;
    ctx.drawImage(sh, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // the tiles and props, far to near
    let made = 0;
    const budget = 6;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const it of items) {
      if (it.kind === 'bell') {
        const spr = it.spr || bellSprite(it, cam, P, dpr);
        const age = it.hitK > 0 ? (Wd.K - it.hitK) / 30 : 9;
        const jit = age < 1.5 ? Math.sin(age * 90) * Math.exp(-age * 3) * 0.5 : 0;
        ctx.drawImage(spr.c, it.sx * dpr - spr.ax + jit * dpr, it.sy * dpr - spr.ay);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const dip = it.hitK ? 0.06 * it.s * (age < 0.15 ? age / 0.15 : 1) : 0;
        drawPlunger(ctx, it, it.sx + jit, it.sy, P, dip);
        if (age < 2.2) { // the glint on the dome as it rings
          const gl = glowSprite(), r = 0.5 * it.s * it.J.kx * (1 - age / 2.6), a = Math.exp(-age * 1.6) * (P.L ? 0.55 : 0.7);
          ctx.globalAlpha = a; ctx.globalCompositeOperation = P.L ? 'source-over' : 'lighter';
          ctx.drawImage(gl, it.sx - it.RD * 0.35 * it.J.kx - r, it.sy + it.J.yy * (it.HB + it.HD * 0.75) - r, r * 2, r * 2);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      if (it.kind === 'block') {
        const spr = it.spr || blockSprite(it, cam, P, dpr);
        ctx.drawImage(spr.c, Math.round(it.sx * dpr) - spr.ax, Math.round(it.sy * dpr) - spr.ay);
        // the shadows the tiles on it cast onto its top
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        let any = false;
        for (const t of vis) if (t.blk === it) { if (t.st === 1 || !t.hull) { t.hull = shadowOf(t, false); t.foot = shadowOf(t, true); } pathFloor(ctx, cam, t.hull, t.y); any = true; }
        if (any) {
          ctx.save(); ctx.clip(); ctx.beginPath(); pathFloor(ctx, cam, blockTop(it), it.ht); ctx.fillStyle = rgba(P.sh, P.shA * 0.55); ctx.fill(); ctx.restore();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      const t = it;
      if (t.st === 1) { drawTile(ctx, t, t.th, t.J, t.sx, t.sy, P, dpr); ctx.setTransform(1, 0, 0, 1, 0, 0); continue; }
      let spr = t.spr;
      if (spr && spr.gen !== spr.pg.gen) spr = t.spr = null; // its page was wiped
      if (!spr) {
        if (performance.now() - t0 > budget && made > 0) continue;
        spr = tileSprite(S, t, P, dpr); made++;
      }
      ctx.drawImage(spr.pg.c, spr.sx, spr.sy, spr.w, spr.h, Math.round(t.sx * dpr) - spr.ax, Math.round(t.sy * dpr) - spr.ay, spr.w, spr.h);
    }
    // pictures for the tiles about to come into view, while there is time
    if (performance.now() - t0 < 4) {
      let n = 0;
      for (let i = Wd.tiles.length - 1; i >= 0 && n < 6; i--) {
        const t = Wd.tiles[i];
        if (t.spr || t.st === 1 || !t.J) continue;
        const sx = cam.ox + (F * (t.x - cam.x)) / t.J.zc;
        if (sx > w + m && sx < w + 6 * m) { tileSprite(S, t, P, dpr); n++; }
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.ms = performance.now() - t0;
  };

  function blockCorners(b, y) {
    const fx = Math.cos(b.h), fz = Math.sin(b.h), nx = -fz, nz = fx, hw = b.wid / 2;
    return [[b.ox + nx * hw, b.oz + nz * hw], [b.ox + fx * b.len + nx * hw, b.oz + fz * b.len + nz * hw], [b.ox + fx * b.len - nx * hw, b.oz + fz * b.len - nz * hw], [b.ox - nx * hw, b.oz - nz * hw]].map((p) => [p[0], p[1], y]);
  }
  function blockTop(b) { return blockCorners(b, b.ht).flatMap((p) => [p[0], p[1]]); }
  function blockShadow(b, down) {
    if (b.shd && b.shd[down ? 1 : 0]) return b.shd[down ? 1 : 0];
    const pts = [];
    for (const [x, z, y] of [...blockCorners(b, b.y0 || 0), ...blockCorners(b, b.ht)]) { const k = down ? 0 : y / LV[1]; pts.push(x - LV[0] * k, z - LV[2] * k); }
    const m = hull(pts, 8), o = HULL.slice(0, m * 2);
    b.shd = b.shd || [];
    b.shd[down ? 1 : 0] = o;
    return o;
  }
  function bellShadow(b, down) {
    if (b.shd && b.shd[down ? 1 : 0]) return b.shd[down ? 1 : 0];
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      pts.push(b.x + Math.cos(a) * b.RB * (down ? 1.08 : 1), b.z + Math.sin(a) * b.RB * (down ? 1.08 : 1));
      if (!down) { const k = (b.HB + b.HD) / LV[1]; pts.push(b.x + Math.cos(a) * b.RD * 0.6 - LV[0] * k, b.z + Math.sin(a) * b.RD * 0.6 - LV[2] * k); }
    }
    const m = hull(pts, pts.length / 2), o = HULL.slice(0, m * 2);
    b.shd = b.shd || [];
    b.shd[down ? 1 : 0] = o;
    return o;
  }

  // the picker's still: the wave in the middle of the strip, fallen tiles to its left, standing ones to its right
  window.BG_PV_STILL.domino = (bg) => {
    const Wd = bg.dom && bg.dom.Wd, fr = Wd && Wd.front;
    if (fr) Wd.cam.x = fr.x + (0.02 * Wd.cam.w) / jac(Wd.cam, 0, fr.z).kx;
    return 1;
  };
})();
