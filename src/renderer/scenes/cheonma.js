'use strict';
/*
 * 천마: a stone platform on a mountain top under a blood-tinged moon. The Heavenly Demon hangs in the air high
 * above its far end, still from the waist up while his robes, cape and hair stream in his own qi; dark smoke and
 * crimson flame rise off him, a wheel of dark cloud turns over his head, the stones under him are cracked and lit
 * from within and lift off the floor. A halo of twelve swords turns behind him. A flick of two fingers and one, or a
 * volley of several, leaves the halo, turns on its mark, trembles and flies; the heroes of the righteous sects
 * (a monk with a staff, a Taoist swordsman, a beggar with a bamboo staff, a swordswoman, an old master fighting
 * bare-handed), small and scattered across the platform, block in a spray of sparks, flinch from a blade that stabs
 * the floor at their feet, slide back, drop to a knee and brace again, and the swords come back in formation. What
 * they throw back at him breaks on the rim of his halo; he does not move. Now and then he opens his arms: the halo
 * trembles and the weight of his domain rolls out over the platform, flattening the grass and driving all of them
 * to their knees at once.
 * The figures are skeletons solved every frame (legs and arms by two-bone IK) and filled as one silhouette each, so
 * they read as solid ink at any strength. On a light page it is an ink painting with a red sun and crimson accents.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('cheonma'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ss = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const turn = (a, b, k) => a + wrap(b - a) * k; // turn angle a toward b by the fraction k
  const HT = new Float32Array(256); for (let i = 0, q = 7; i < 256; i++) { q = (q * 16807) % 2147483647; HT[i] = q / 2147483647; } // (its own fixed table: no draw on Math.random)
  const hsh = (n) => HT[n & 255];
  const nz = (x) => { const i = Math.floor(x), f = x - i; return lerp(HT[i & 255], HT[(i + 1) & 255], f * f * (3 - 2 * f)) * 2 - 1; }; // smooth value noise, -1..1: irregular rhythms

  /* ---------- silhouettes: every part of a figure goes into one path, all wound the same way, filled once ---------- */
  class Fig {
    constructor() { this.p = new Path2D(); }
    /** A polygon from a flat [x0, y0, x1, y1, …] list, wound clockwise whichever way it was given. */
    poly(q) {
      const n = q.length, p = this.p;
      let a = 0;
      for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; a += q[i] * q[j + 1] - q[j] * q[i + 1]; }
      if (a >= 0) { p.moveTo(q[0], q[1]); for (let i = 2; i < n; i += 2) p.lineTo(q[i], q[i + 1]); } else { p.moveTo(q[n - 2], q[n - 1]); for (let i = n - 4; i >= 0; i -= 2) p.lineTo(q[i], q[i + 1]); }
      p.closePath();
    }
    circ(x, y, r) { this.p.moveTo(x + r, y); this.p.arc(x, y, r, 0, TAU, false); this.p.closePath(); }
    ell(x, y, rx, ry, rot) { this.p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx); this.p.ellipse(x, y, rx, ry, rot, 0, TAU, false); this.p.closePath(); }
    /** A limb tapering from width wa to wb; caps: round ends (1 the start, 2 the end, 3 both, 0 / false none). */
    seg(ax, ay, bx, by, wa, wb, caps = 3) {
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6, nx = -dy / l, ny = dx / l, ha = wa / 2, hb = wb / 2;
      this.poly([ax + nx * ha, ay + ny * ha, bx + nx * hb, by + ny * hb, bx - nx * hb, by - ny * hb, ax - nx * ha, ay - ny * ha]);
      if (caps & 1) this.circ(ax, ay, ha);
      if (caps & 2) this.circ(bx, by, hb);
    }
    /** A band along a line of points, its width going from w0 to w1. */
    ribbon(q, w0, w1) {
      const n = q.length / 2, a = [], b = [];
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dx = q[i1 * 2] - q[i0 * 2], dy = q[i1 * 2 + 1] - q[i0 * 2 + 1], l = Math.hypot(dx, dy) || 1e-6;
        const w = lerp(w0, w1, i / (n - 1)) / 2, nx = (-dy / l) * w, ny = (dx / l) * w;
        a.push(q[i * 2] + nx, q[i * 2 + 1] + ny); b.push(q[i * 2] - nx, q[i * 2 + 1] - ny);
      }
      for (let i = b.length - 2; i >= 0; i -= 2) a.push(b[i], b[i + 1]);
      this.poly(a);
    }
  }

  /**
   * A strand (hair, beard, sash, tassel) from (x, y) heading a: it bends toward the angle `to` as it goes, and waves
   * run down it. Returns its points.
   */
  function strand(f, x, y, a, to, len, n, w0, w1, E, k, amp, bend) {
    const q = [x, y], sl = len / n;
    let base = a;
    for (let i = 1; i <= n; i++) {
      const p = i / n;
      base = turn(base, to, bend);
      const aa = base + Math.sin(E.t * 0.23 * E.sp + E.ph + k - p * 3.4) * amp * p * (1 + 0.9 * (E.pl || 0)); // (fluttering harder in his current)
      x += Math.cos(aa) * sl; y += Math.sin(aa) * sl; q.push(x, y);
    }
    if (f) f.ribbon(q, w0, w1);
    return q;
  }

  /** Two-bone IK: the joint between a (the root) and the target, bending to one side; also the end it reaches. */
  function ik(ax, ay, tx, ty, l1, l2, bend) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
    const mx = (l1 + l2) * 0.999;
    if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; }
    if (d < 1e-5) d = 1e-5;
    const th = Math.atan2(dy, dx) - bend * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    return [ax + Math.cos(th) * l1, ay + Math.sin(th) * l1, ax + dx, ay + dy];
  }

  /**
   * An arm: of the two places the elbow could be, the one that points down and back, as an elbow does. (Always bending
   * to the same side turned the elbow up whenever the hand reached behind the shoulder.)
   */
  function ikArm(ax, ay, tx, ty, l1, l2) {
    const a = ik(ax, ay, tx, ty, l1, l2, 1), b = ik(ax, ay, tx, ty, l1, l2, -1);
    const da = (a[0] - ax) * -0.5 + (a[1] - ay) * 0.87, db = (b[0] - ax) * -0.5 + (b[1] - ay) * 0.87;
    return da > db ? a : b;
  }

  /* ---------- the heroes: proportions in units of standing height, facing right (+x), feet on y = 0 ---------- */
  const TH = 0.245, SH = 0.235, SO = 0.03, SP = 0.3, UA = 0.165, FA = 0.15;
  const PK = ['hx', 'hy', 'ln', 'hd', 'fx', 'fy', 'bx', 'by', 'ax', 'ay', 'cx', 'cy', 'wa', 'g2', 'gd', 'ar'];
  const ARM = ['ax', 'ay', 'cx', 'cy', 'wa', 'g2', 'gd', 'hd']; // the guard of a hero who is down: arms, weapon and head
  const DEF = { hx: 0, hy: -0.45, ln: 0, hd: 0, fx: 0.2, fy: 0, bx: -0.2, by: 0, ax: 0.2, ay: 0, cx: 0, cy: 0.15, wa: 0, g2: 0, gd: 0.26, ar: 0 };
  const P = (o) => { const r = {}; for (const k of PK) r[k] = k in o ? o[k] : DEF[k]; return r; };
  /*
   * Poses: hip (hx, hy), lean of the spine and tilt of the head, front / back ankle (fx, bx; fy, by lift), front hand
   * and back hand relative to the shoulder (ax, ay; cx, cy), the weapon's angle; g2 = 1: the back hand holds the
   * weapon gd behind the front one. base: braced; rec: thrown back by a blow; grd: guard raised; knl: down on one
   * knee; cnt: striking back. ar: off the ground (1: the body hangs from the hip instead of standing on whatever is lowest).
   */
  const POSES = {
    monk: {
      base: P({ hy: -0.4, ln: 0.14, hd: -0.1, fx: 0.21, bx: -0.21, ax: 0.2, ay: 0.07, wa: -0.22, g2: 1, gd: 0.27 }),
      rec: P({ hx: -0.03, hy: -0.44, ln: -0.18, hd: -0.22, fx: 0.26, bx: -0.13, ax: 0.15, ay: -0.07, wa: -0.85, g2: 1, gd: 0.25 }),
      grd: P({ hy: -0.42, ln: 0.04, hd: 0.12, fx: 0.2, bx: -0.2, ax: 0.14, ay: -0.27, wa: -0.08, g2: 1, gd: 0.32 }),
      knl: P({ hy: -0.27, ln: 0.3, hd: 0.3, fx: 0.17, bx: -0.31, by: 0.008, ax: 0.15, ay: -0.02, wa: -1.3, g2: 1, gd: 0.2 }),
      cnt: P({ hx: 0.05, hy: -0.39, ln: 0.3, hd: -0.18, fx: 0.27, bx: -0.2, ax: 0.3, ay: 0.02, wa: -0.12, g2: 1, gd: 0.27 }),
    },
    taoist: {
      base: P({ hx: 0.02, hy: -0.43, ln: 0.06, hd: -0.05, fx: 0.2, bx: -0.24, ax: 0.25, ay: -0.03, wa: -0.32, cx: -0.1, cy: -0.24 }),
      rec: P({ hx: -0.04, hy: -0.46, ln: -0.26, hd: -0.25, fx: 0.25, bx: -0.14, ax: 0.05, ay: -0.25, wa: -2.0, cx: -0.21, cy: 0.02 }),
      grd: P({ hy: -0.44, ln: -0.03, hd: 0.05, fx: 0.2, bx: -0.22, ax: 0.12, ay: -0.1, wa: -1.5, cx: 0.14, cy: -0.03 }),
      knl: P({ hy: -0.27, ln: 0.3, hd: 0.3, fx: 0.17, bx: -0.31, by: 0.008, ax: 0.1, ay: 0.17, wa: 1.45, cx: 0.02, cy: 0.15 }),
      cnt: P({ hx: 0.05, hy: -0.41, ln: 0.2, hd: -0.08, fx: 0.25, bx: -0.25, ax: 0.28, ay: 0.02, wa: 0.12, cx: -0.18, cy: -0.06 }),
    },
    beggar: {
      base: P({ hy: -0.36, ln: 0.32, hd: -0.3, fx: 0.22, bx: -0.22, ax: 0.2, ay: 0.06, wa: -0.4, cx: -0.13, cy: 0.1 }),
      rec: P({ hx: -0.03, hy: -0.4, ln: -0.1, hd: -0.3, fx: 0.27, bx: -0.14, ax: 0.1, ay: -0.2, wa: -1.4, cx: -0.22, cy: -0.06 }),
      grd: P({ hy: -0.38, ln: 0.12, hd: 0.05, fx: 0.2, bx: -0.2, ax: 0.12, ay: -0.22, wa: -0.05, g2: 1, gd: 0.28 }),
      knl: P({ hy: -0.26, ln: 0.36, hd: -0.12, fx: 0.16, bx: -0.3, by: 0.008, ax: 0.18, ay: 0, wa: -0.75, cx: 0.06, cy: 0.2 }),
      cnt: P({ hx: 0.06, hy: -0.36, ln: 0.42, hd: -0.35, fx: 0.28, bx: -0.2, ax: 0.29, ay: 0.06, wa: -0.15, cx: -0.18, cy: 0.04 }),
    },
    woman: {
      base: P({ hx: 0.02, hy: -0.45, ln: 0.04, hd: -0.04, fx: 0.21, bx: -0.21, ax: 0.05, ay: -0.27, wa: 0.28, cx: 0.24, cy: -0.05 }),
      rec: P({ hx: -0.03, hy: -0.46, ln: -0.24, hd: -0.22, fx: 0.25, bx: -0.13, ax: -0.06, ay: -0.2, wa: -1.1, cx: 0.08, cy: 0.14 }),
      grd: P({ hy: -0.44, ln: -0.02, hd: 0.06, fx: 0.2, bx: -0.21, ax: 0.12, ay: -0.14, wa: -1.75, cx: 0.14, cy: -0.06 }),
      knl: P({ hy: -0.28, ln: 0.18, hd: 0, fx: 0.18, bx: -0.32, by: 0.008, ax: -0.22, ay: 0.02, wa: 2.9, cx: 0.17, cy: 0.2 }),
      cnt: P({ hx: 0.05, hy: -0.42, ln: 0.2, hd: -0.06, fx: 0.26, bx: -0.24, ax: 0.28, ay: -0.04, wa: 0, cx: -0.16, cy: -0.18 }),
    },
    master: {
      base: P({ hy: -0.47, ln: 0.12, hd: -0.03, fx: 0.17, bx: -0.17, ax: 0.25, ay: -0.02, cx: 0.17, cy: 0.08 }),
      rec: P({ hx: -0.03, hy: -0.48, ln: -0.12, hd: -0.12, fx: 0.22, bx: -0.12, ax: 0.17, ay: -0.1, cx: 0.1, cy: 0.02 }),
      grd: P({ hy: -0.46, ln: 0.06, hd: 0.12, fx: 0.17, bx: -0.17, ax: 0.12, ay: -0.16, cx: 0.15, cy: -0.12 }),
      knl: P({ hy: -0.3, ln: 0.25, hd: 0.1, fx: 0.17, bx: -0.3, by: 0.008, ax: 0.18, ay: 0.06, cx: 0, cy: 0.17 }),
      cnt: P({ hx: 0.05, hy: -0.45, ln: 0.24, hd: -0.08, fx: 0.24, bx: -0.2, ax: 0.31, ay: -0.04, cx: -0.1, cy: 0.1 }),
    },
  };
  /** Garments and gear: hem below the knee (negative: above it), sleeve depth, build, head, weapon. */
  const GEAR = {
    monk: { hem: 0.09, sleeve: 0.1, slim: 1.06, head: 'monk', wpn: 'staff' },
    taoist: { hem: 0.07, sleeve: 0.11, slim: 0.96, head: 'taoist', wpn: 'sword' },
    beggar: { hem: -0.035, sleeve: 0.055, slim: 0.95, head: 'beggar', wpn: 'bamboo', rag: 1 },
    woman: { hem: 0.01, sleeve: 0.045, slim: 0.86, head: 'woman', wpn: 'sword' },
    master: { hem: 0.12, sleeve: 0.12, slim: 1, head: 'master', wpn: 'palm', hunch: 1 },
  };

  /** A charge: gathering (crouched, the weapon drawn back) and the blow in the air, one for each of them. */
  const GAT = {}, ATK = {
    monk: P({ hy: -0.5, ln: -0.12, hd: -0.15, fx: 0.15, fy: -0.14, bx: -0.2, by: -0.02, ax: 0.04, ay: -0.3, wa: -2.3, g2: 1, gd: 0.3 }), // the staff swung up for a smash
    taoist: P({ hy: -0.5, ln: 0.38, hd: -0.3, fx: 0.14, fy: -0.16, bx: -0.32, by: 0.01, ax: 0.3, ay: 0.01, wa: 0.02, cx: -0.2, cy: -0.12 }), // a straight thrust
    beggar: P({ hy: -0.46, ln: 0.18, hd: -0.2, fx: 0.12, fy: -0.16, bx: -0.16, by: -0.06, ax: 0.16, ay: -0.1, wa: 0, cx: 0.06, cy: 0.04 }), // the staff spinning
    woman: P({ hy: -0.5, ln: 0.55, hd: -0.4, fx: 0.1, fy: -0.12, bx: -0.36, by: 0, ax: 0.31, ay: -0.03, wa: 0.04, cx: -0.18, cy: -0.14 }), // a flying lunge
    master: P({ hy: -0.5, ln: 0.28, hd: -0.12, fx: 0.18, fy: -0.14, bx: -0.22, by: 0, ax: 0.33, ay: -0.06, cx: -0.12, cy: 0.12 }), // a palm driven out
  };
  for (const k in POSES) { const c = POSES[k].cnt; GAT[k] = P({ ...c, hy: c.hy + 0.08, ln: c.ln + 0.08, ax: c.ax - 0.22, ay: c.ay + 0.05, wa: c.wa - 0.7, fx: c.fx - 0.05 }); }

  function mixInto(o, b, k) { if (k > 0.001) for (const key of PK) o[key] += (b[key] - o[key]) * Math.min(1, k); }

  function solve(p) {
    const s0 = Math.sin(p.ln), s1 = -Math.cos(p.ln), n0 = -s1, n1 = s0; // the spine (up) and across it (forward)
    const hx = p.hx, hy = p.hy, sh = [hx + s0 * SP * 0.88, hy + s1 * SP * 0.88], nk = [hx + s0 * SP, hy + s1 * SP];
    const ha = p.ln + p.hd, hd = [nk[0] + Math.sin(ha) * 0.075, nk[1] - Math.cos(ha) * 0.075];
    const kf = ik(hx, hy, p.fx, p.fy - SO, TH, SH, 1), kb = ik(hx, hy, p.bx, p.by - SO, TH, SH, 1);
    const ef = ikArm(sh[0], sh[1], sh[0] + p.ax, sh[1] + p.ay, UA, FA);
    const gx = ef[2] - Math.cos(p.wa) * p.gd, gy = ef[3] - Math.sin(p.wa) * p.gd;
    const eb = ikArm(sh[0] - n0 * 0.012, sh[1] - n1 * 0.012, lerp(sh[0] + p.cx, gx, p.g2), lerp(sh[1] + p.cy, gy, p.g2), UA, FA);
    const J = { ln: p.ln, ha, wa: p.wa, hip: [hx, hy], sh, nk, hd, kf: [kf[0], kf[1]], af: [kf[2], kf[3]], kb: [kb[0], kb[1]], ab: [kb[2], kb[3]], ef: [ef[0], ef[1]], hf: [ef[2], ef[3]], eb: [eb[0], eb[1]], hb: [eb[2], eb[3]] };
    const low = Math.max(J.af[1] + SO, J.ab[1] + SO, J.kf[1] + 0.026, J.kb[1] + 0.026) * (1 - (p.ar || 0)); // whatever is lowest rests on the floor (in the air, nothing does)
    for (const k of ['hip', 'sh', 'nk', 'hd', 'kf', 'af', 'kb', 'ab', 'ef', 'hf', 'eb', 'hb']) J[k][1] -= low;
    return J;
  }

  const unit = (x, y) => { const l = Math.hypot(x, y) || 1e-6; return [x / l, y / l]; };

  function leg(f, hp, k, a, sl) {
    f.seg(hp[0], hp[1], k[0], k[1], 0.09 * sl, 0.064 * sl, 2); // trousers: the knee rounded; hip and ankle are covered by the robe and the foot
    f.seg(k[0], k[1], a[0], a[1], 0.062 * sl, 0.042 * sl, 0);
    const [sx, sy] = unit(a[0] - k[0], a[1] - k[1]), lie = ss((Math.abs(sx) - 0.6) / 0.3); // a shin lying on the floor: the foot stretches back along it
    const [dx, dy] = unit(lerp(1, sx, lie), lerp(0, sy, lie));
    let nx = -dy, ny = dx; if (ny < 0) { nx = -nx; ny = -ny; }
    f.poly([a[0] - dx * 0.024 - nx * 0.01, a[1] - dy * 0.024 - ny * 0.01, a[0] + dx * 0.04 + nx * 0.006, a[1] + dy * 0.04 + ny * 0.006,
      a[0] + dx * 0.08 + nx * 0.025, a[1] + dy * 0.08 + ny * 0.025, a[0] + dx * 0.076 + nx * 0.032, a[1] + dy * 0.076 + ny * 0.032,
      a[0] - dx * 0.03 + nx * 0.032, a[1] - dy * 0.03 + ny * 0.032]);
  }

  /** Points of a quadratic curve from (x0, y0) through the control (cx, cy) to (x1, y1), its start left out. */
  function qc(q, x0, y0, cx, cy, x1, y1, n) { for (let i = 1; i <= n; i++) { const k = i / n, m = 1 - k; q.push(m * m * x0 + 2 * m * k * cx + k * k * x1, m * m * y0 + 2 * m * k * cy + k * k * y1); } }

  /** The skirt of the robe: it flares from the waist, split up the middle where the stance opens, the back of it billowing in the wind. */
  function skirt(f, J, G, E) {
    const { hip, kf, kb } = J, s0 = Math.sin(J.ln), s1 = -Math.cos(J.ln), n0 = -s1, n1 = s0, sl = G.slim;
    const wc0 = hip[0] + s0 * 0.06, wc1 = hip[1] + s1 * 0.06;
    const dF = unit(kf[0] - hip[0], kf[1] - hip[1]), nF = [dF[1], -dF[0]], dB = unit(kb[0] - hip[0], kb[1] - hip[1]), nB = [-dB[1], dB[0]];
    const sF = unit(J.af[0] - kf[0], J.af[1] - kf[1] + 0.9), sB = unit(J.ab[0] - kb[0], J.ab[1] - kb[1] + 0.9); // cloth hangs between the shin and straight down
    const hl = G.hem, long = hl > 0.1, wv = E.wind * (G.inner ? 0.5 : 1) * (1 - 1.8 * (E.pl || 0)), f1 = Math.sin(E.t * 0.29 * E.sp + E.ph), f2 = Math.sin(E.t * 0.21 * E.sp + E.ph * 1.7 + 1), f3 = Math.sin(E.t * 0.37 * E.sp + E.ph * 0.6 + 2);
    const at = (k, d, s) => (hl >= 0 ? [k[0] + s[0] * hl, k[1] + s[1] * hl] : [k[0] + d[0] * hl, k[1] + d[1] * hl]);
    const gr = (y) => Math.min(y, -0.004);
    const hF = at(kf, dF, sF), hB = at(kb, dB, sB), fw = (long ? 0.072 : 0.056) * sl, bw = (long ? 0.088 : 0.062) * sl;
    const fo = [hF[0] + nF[0] * fw - wv * 0.008, gr(hF[1] + nF[1] * fw)], fi = [hF[0] - nF[0] * 0.05 * sl - wv * 0.016, gr(hF[1] - nF[1] * 0.05 * sl + 0.006)];
    const bo = [hB[0] + nB[0] * bw - wv * (0.055 + 0.025 * f1), gr(hB[1] + nB[1] * bw - wv * 0.018 * f2 - 0.006)], bi = [hB[0] - nB[0] * 0.045 * sl - wv * 0.022, gr(hB[1] - nB[1] * 0.045 * sl)];
    const sep = clamp((Math.abs(kf[0] - kb[0]) - 0.05) / 0.2, 0, 1) * (long ? 0.85 : 1), hy = (fi[1] + bi[1]) / 2;
    const ap = [(fi[0] + bi[0]) / 2, lerp(hy, Math.min(kf[1], kb[1]) - 0.03, sep)];
    const wf = [wc0 + n0 * 0.06 * sl, wc1 + n1 * 0.06 * sl], wb = [wc0 - n0 * 0.057 * sl, wc1 - n1 * 0.057 * sl];
    const kfo = [kf[0] + nF[0] * 0.058 * sl, kf[1] + nF[1] * 0.058 * sl], kbo = [kb[0] + nB[0] * 0.066 * sl - wv * 0.02, kb[1] + nB[1] * 0.066 * sl];
    const q = [wb[0], wb[1], wf[0], wf[1]];
    qc(q, wf[0], wf[1], lerp(hip[0], kf[0], 0.5) + nF[0] * 0.074 * sl, lerp(hip[1], kf[1], 0.5) + nF[1] * 0.074 * sl, kfo[0], kfo[1], 4); // over the thigh
    qc(q, kfo[0], kfo[1], lerp(kfo[0], fo[0], 0.5) - nF[0] * 0.006, lerp(kfo[1], fo[1], 0.5) - nF[1] * 0.006, fo[0], fo[1], 3); // flaring to the hem
    if (G.rag) q.push(lerp(fo[0], fi[0], 0.3), lerp(fo[1], fi[1], 0.3) - 0.024, lerp(fo[0], fi[0], 0.55), lerp(fo[1], fi[1], 0.55) + 0.01, lerp(fo[0], fi[0], 0.78), lerp(fo[1], fi[1], 0.78) - 0.016);
    else qc(q, fo[0], fo[1], lerp(fo[0], fi[0], 0.5), lerp(fo[1], fi[1], 0.5) + 0.014 + 0.004 * f2, fi[0], fi[1], 3);
    q.push(fi[0], fi[1]);
    qc(q, fi[0], fi[1], lerp(fi[0], ap[0], 0.7), lerp(fi[1], ap[1], 0.3), ap[0], ap[1], 3); // the split, rounded at its top
    qc(q, ap[0], ap[1], lerp(ap[0], bi[0], 0.3), lerp(ap[1], bi[1], 0.7), bi[0], bi[1], 3);
    if (G.rag) q.push(lerp(bi[0], bo[0], 0.25), lerp(bi[1], bo[1], 0.25) + 0.018, lerp(bi[0], bo[0], 0.45), lerp(bi[1], bo[1], 0.45) - 0.026, lerp(bi[0], bo[0], 0.7), lerp(bi[1], bo[1], 0.7) + 0.014, lerp(bi[0], bo[0], 0.86), lerp(bi[1], bo[1], 0.86) - 0.016);
    else { const mx = lerp(bi[0], bo[0], 0.5), my = lerp(bi[1], bo[1], 0.5); q.push(lerp(bi[0], mx, 0.5), lerp(bi[1], my, 0.5) + 0.01 + 0.006 * f3, mx, my - 0.004 * f1, lerp(mx, bo[0], 0.5), lerp(my, bo[1], 0.5) + 0.008 * f3); }
    q.push(bo[0], bo[1]);
    qc(q, bo[0], bo[1], lerp(bo[0], kbo[0], 0.5) + nB[0] * 0.02 - wv * 0.025, lerp(bo[1], kbo[1], 0.5) + nB[1] * 0.02, kbo[0], kbo[1], 3); // the back, billowing
    qc(q, kbo[0], kbo[1], lerp(hip[0], kb[0], 0.5) + nB[0] * 0.086 * sl - wv * 0.012, lerp(hip[1], kb[1], 0.5) + nB[1] * 0.086 * sl, wb[0], wb[1], 4);
    q.length -= 2; // the last point is wb again
    f.poly(q);
  }

  /**
   * A wide sleeve hanging off the forearm (elbow e to cuff h). The cloth is pulled down and back by gravity and the
   * wind (wx, wy). The part of that pull along the forearm slides the cloth toward the lower end; the rest hangs it
   * off one side. Its top edge and its hem both run the same way along the arm and sit on opposite sides of it, so
   * the outline never crosses itself, whatever the arm does. A ripple runs out along it, largest at the cuff.
   */
  function sleeve(f, e, h, d, rag, E, k, wx, wy) {
    const [fx, fy] = unit(h[0] - e[0], h[1] - e[1]), [gx, gy] = unit(wx, d + wy), al = gx * fx + gy * fy;
    const [px, py] = unit(gx - fx * al * 0.85 + wx * 0.2, gy - fy * al * 0.85), sl = -al * d * 0.3, n = rag ? 6 : 5, q = [], b = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = lerp(e[0], h[0], u), y = lerp(e[1], h[1], u);
      const w = d * (0.35 + 0.65 * Math.pow(u, 0.8)) * (rag && i % 2 ? 0.72 : 1) + Math.sin(E.t * 0.24 * E.sp + E.ph + k * 2.1 - u * 2.4) * d * 0.14 * u;
      q.push(x - px * 0.024, y - py * 0.024);
      b.push(x + px * w - fx * sl * u, y + py * w - fy * sl * u);
    }
    for (let i = b.length - 2; i >= 0; i -= 2) q.push(b[i], b[i + 1]);
    f.poly(q);
  }

  /** A hero's silhouette (local units); pale blades are listed in `blades` to be drawn over it. */
  function heroPath(f, J, G, E, blades, L) {
    const s0 = Math.sin(J.ln), s1 = -Math.cos(J.ln), n0 = -s1, n1 = s0, sl = G.slim, hp = J.hip, wv = E.wind;
    const pl = E.pl || 0, sw = pl > 0.01 ? (a) => turn(a, E.da, pl * 0.7) : (a) => a; // caught in his current: what hangs or trails streams toward his palm
    leg(f, hp, J.kb, J.ab, sl); leg(f, hp, J.kf, J.af, sl);
    skirt(f, J, G, E);
    // the torso: chest forward, a straight back (a stoop for the old master)
    const TOR = [[0, 0.056, 0.053], [0.3, 0.05, 0.047], [0.6, 0.058, 0.05], [0.85, 0.052, 0.055], [1, 0.03, 0.034]], q = [];
    for (const [k, fw] of TOR) q.push(hp[0] + s0 * SP * k + n0 * fw * sl, hp[1] + s1 * SP * k + n1 * fw * sl);
    for (let i = TOR.length - 1; i >= 0; i--) { const [k, , bw] = TOR[i], b = bw + (G.hunch && k > 0.55 && k < 0.95 ? 0.016 : 0); q.push(hp[0] + s0 * SP * k - n0 * b * sl, hp[1] + s1 * SP * k - n1 * b * sl); }
    f.poly(q);
    f.circ(J.sh[0], J.sh[1], 0.047 * sl);
    const wc0 = hp[0] + s0 * 0.065, wc1 = hp[1] + s1 * 0.065; // the belt, and the ends of the sash
    f.seg(wc0 + n0 * 0.064 * sl, wc1 + n1 * 0.064 * sl, wc0 - n0 * 0.062 * sl, wc1 - n1 * 0.062 * sl, 0.03, 0.03, false);
    const sx = wc0 - n0 * 0.058 * sl, sy = wc1 - n1 * 0.058 * sl;
    strand(f, sx, sy, sw(Math.PI * 0.62), sw(Math.PI * 1.06), 0.2 + 0.04 * wv, 5, 0.022, 0.012, E, 0, 0.5, 0.3);
    strand(f, sx, sy + 0.01, sw(Math.PI * 0.55), sw(Math.PI * 0.98), 0.16 + 0.03 * wv, 5, 0.02, 0.01, E, 1.7, 0.5, 0.3);
    if (G.head === 'beggar') { const g0 = sx - 0.012, g1 = sy + 0.05 + 0.004 * Math.sin(E.t * 0.2 + E.ph); f.seg(sx, sy, g0, g1 - 0.02, 0.006, 0.006, false); f.circ(g0, g1 - 0.018, 0.017); f.circ(g0 - 0.002, g1 + 0.014, 0.027); } // the gourd
    // neck and head, in profile
    const ha = J.ha, u0 = Math.sin(ha), u1 = -Math.cos(ha), w0 = Math.cos(ha), w1 = Math.sin(ha), H = J.hd;
    const at = (a, b) => [H[0] + w0 * a + u0 * b, H[1] + w1 * a + u1 * b]; // a forward, b up
    f.seg(J.nk[0], J.nk[1], H[0] - u0 * 0.035, H[1] - u1 * 0.035, 0.046, 0.04, 0);
    f.ell(H[0], H[1], 0.05, 0.059, ha);
    f.poly([...at(0.034, 0.014), ...at(0.062, -0.012), ...at(0.044, -0.024)]); // nose
    f.poly([...at(0.02, -0.03), ...at(0.046, -0.038), ...at(0.04, -0.062), ...at(0, -0.064)]); // jaw
    const hairTo = Math.PI + 0.06;
    if (G.head === 'taoist') {
      f.circ(...at(-0.012, 0.074), 0.02);
      f.poly([...at(-0.036, 0.066), ...at(0.012, 0.066), ...at(0.018, 0.1), ...at(-0.006, 0.092), ...at(-0.042, 0.1)]); // the crown
      f.seg(...at(-0.06, 0.084), ...at(0.034, 0.084), 0.008, 0.008, false); // its pin
      const [bx, by] = at(0.03, -0.058); strand(f, bx, by, sw(Math.PI * 0.5 + ha), sw(Math.PI * 0.7), 0.11, 4, 0.026, 0.004, E, 0.4, 0.3, 0.25); // beard
    } else if (G.head === 'beggar') {
      f.poly([...at(0.032, 0.046), ...at(0.006, 0.086), ...at(-0.016, 0.07), ...at(-0.044, 0.094), ...at(-0.05, 0.062), ...at(-0.086, 0.07), ...at(-0.064, 0.03), ...at(-0.09, 0.012), ...at(-0.056, -0.018), ...at(-0.03, 0.02)]); // a shock of hair
      const [bx, by] = at(-0.05, 0.034);
      strand(f, bx, by, sw(Math.PI + ha), sw(hairTo), 0.11 + 0.02 * wv, 4, 0.014, 0.008, E, 0.3, 0.55, 0.3); strand(f, bx, by + 0.008, sw(Math.PI + 0.3 + ha), sw(hairTo + 0.2), 0.09, 4, 0.013, 0.008, E, 2.2, 0.55, 0.3); // headband ends
    } else if (G.head === 'woman') {
      f.ell(...at(-0.012, 0.012), 0.058, 0.064, ha); // hair over the crown
      const [bx, by] = at(-0.03, 0.066); f.circ(bx, by, 0.022);
      strand(f, bx, by, sw(Math.PI * 1.1 + ha), sw(hairTo), 0.34 + 0.04 * wv, 8, 0.05, 0.006, E, 0, 0.35, 0.22); // the ponytail
      strand(f, bx, by - 0.005, sw(Math.PI * 1.2 + ha), sw(hairTo - 0.15), 0.2, 6, 0.012, 0.006, E, 1.1, 0.7, 0.3); // ribbon ends
      strand(f, bx, by + 0.004, sw(Math.PI * 1.05 + ha), sw(hairTo + 0.12), 0.17, 6, 0.012, 0.006, E, 2.6, 0.7, 0.3);
    } else if (G.head === 'master') {
      f.circ(...at(-0.032, 0.058), 0.021); f.seg(...at(-0.06, 0.07), ...at(-0.002, 0.07), 0.007, 0.007, false);
      const [bx, by] = at(0.028, -0.056); strand(f, bx, by, sw(Math.PI * 0.5 + ha), sw(Math.PI * 0.74), 0.22 + 0.03 * wv, 6, 0.05, 0.005, E, 0.6, 0.3, 0.2); // a long beard
      const [ex, ey] = at(0.03, 0.022); strand(f, ex, ey, sw(Math.PI * 0.85 + ha), sw(Math.PI * 0.9), 0.05, 3, 0.012, 0.003, E, 1, 0.3, 0.3); // a long eyebrow
    } else { f.circ(...at(-0.046, 0.0), 0.012); } // the monk: shaven, an ear
    // arms: the back one, then the front
    const swx = lerp(-0.05 * wv, Math.cos(E.da || 0) * 0.14, pl), swy = lerp(-0.006, Math.sin(E.da || 0) * 0.14, pl);
    for (const [s, e, h, k] of [[[J.sh[0] - n0 * 0.012, J.sh[1] - n1 * 0.012], J.eb, J.hb, 0], [J.sh, J.ef, J.hf, 1]]) {
      f.seg(s[0], s[1], e[0], e[1], 0.052 * sl, 0.043 * sl, 2); f.seg(e[0], e[1], h[0], h[1], 0.042 * sl, 0.032 * sl, 0);
      if (G.sleeve > 0) sleeve(f, e, h, G.sleeve, G.rag, E, k, swx, swy);
      if (G.wpn === 'palm') { const [px, py] = unit(h[0] - e[0], h[1] - e[1]); f.ell(h[0] + px * 0.012, h[1] + py * 0.012 - 0.008, 0.016, 0.028, 0.15); } // open palms, fingers up
      else f.circ(h[0], h[1], 0.023);
    }
    const d0 = Math.cos(J.wa), d1 = Math.sin(J.wa), p0 = -d1, p1 = d0, [hx, hy] = J.hf;
    const cut = (x0, y0, x1, y1) => { if (y1 > -0.003 && y1 !== y0) { const k = (-0.003 - y0) / (y1 - y0); if (k > 0 && k < 1) return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; } return [x1, y1]; }; // a staff stops at the floor
    if (G.wpn === 'sword') {
      f.seg(hx - d0 * 0.04, hy - d1 * 0.04, hx + d0 * 0.045, hy + d1 * 0.045, 0.019, 0.017, false);
      f.circ(hx - d0 * 0.048, hy - d1 * 0.048, 0.014);
      const gx = hx + d0 * 0.05, gy = hy + d1 * 0.05;
      f.poly([gx + p0 * 0.038 - d0 * 0.008, gy + p1 * 0.038 - d1 * 0.008, gx + p0 * 0.03 + d0 * 0.016, gy + p1 * 0.03 + d1 * 0.016, gx - p0 * 0.03 + d0 * 0.016, gy - p1 * 0.03 + d1 * 0.016, gx - p0 * 0.038 - d0 * 0.008, gy - p1 * 0.038 - d1 * 0.008]);
      const bx = gx + d0 * 0.012, by = gy + d1 * 0.012, L1 = 0.37, [ex, ey] = cut(bx, by, bx + d0 * L1, by + d1 * L1), len = Math.hypot(ex - bx, ey - by);
      const w = 0.0095;
      f.poly([bx + p0 * w, by + p1 * w, bx + d0 * len * 0.9 + p0 * w * 0.8, by + d1 * len * 0.9 + p1 * w * 0.8, bx + d0 * len, by + d1 * len, bx + d0 * len * 0.9 - p0 * w * 0.8, by + d1 * len * 0.9 - p1 * w * 0.8, bx - p0 * w, by - p1 * w]);
      blades.push(bx, by, d0, d1, len);
      strand(f, hx - d0 * 0.055, hy - d1 * 0.055, sw(J.wa + Math.PI), sw(Math.PI * 0.62), 0.07, 4, 0.008, 0.012, E, 2, 0.6, 0.35); // the tassel
    } else if (G.wpn === 'staff') {
      const [ax, ay] = cut(hx, hy, hx - d0 * 0.74, hy - d1 * 0.74), [bx, by] = cut(hx, hy, hx + d0 * 0.52, hy + d1 * 0.52);
      f.seg(ax, ay, bx, by, 0.022, 0.022);
      f.seg(bx - d0 * 0.05, by - d1 * 0.05, bx, by, 0.03, 0.03, false); f.seg(ax + d0 * 0.05, ay + d1 * 0.05, ax, ay, 0.03, 0.03, false); // iron caps
    } else if (G.wpn === 'bamboo') {
      const [ax, ay] = cut(hx, hy, hx - d0 * 0.3, hy - d1 * 0.3), [bx, by] = cut(hx, hy, hx + d0 * 0.7, hy + d1 * 0.7);
      f.seg(ax, ay, bx, by, 0.017, 0.013);
      for (let k = 0.12; k < 0.95; k += 0.17) f.seg(lerp(ax, bx, k) - d0 * 0.006, lerp(ay, by, k) - d1 * 0.006, lerp(ax, bx, k) + d0 * 0.006, lerp(ay, by, k) + d1 * 0.006, 0.024, 0.024, false); // nodes
    }
  }

  /* ---------- 천마: floating, facing the heroes (drawn mirrored), hip at the origin ---------- */
  /** The front arm in joint angles: the upper arm's angle from the shoulder, and the elbow's bend (always negative: flexion). */
  const armA = (x, y) => { const d = Math.min(Math.hypot(x, y), (UA + FA) * 0.999) || 1e-5, al = Math.atan2(y, x), th = Math.acos(clamp((UA * UA + d * d - FA * FA) / (2 * UA * d), -1, 1)), ph = al + th, ex = Math.cos(ph) * UA, ey = Math.sin(ph) * UA; const hx = Math.cos(al) * d, hy = Math.sin(al) * d; return [ph, wrap(Math.atan2(hy - ey, hx - ex) - ph)]; };
  const armP = (ph, b) => [Math.cos(ph) * UA + Math.cos(ph + b) * FA, Math.sin(ph) * UA + Math.sin(ph + b) * FA];
  const LOWP = [0.235, 0.075, 0.5]; // the low command pose after a great move: the hand at his chest, the forearm forward, the two fingers on them
  const HP0 = { cu: [0.08, 0.08, 1, 1], spr: 0, th: 0, ps: 1, z: 1.22, full: 1, orb: 0, beck: 0 }; // the hand at rest: 劍指
  /*
   * His wide sleeve, from the elbow e to the cuff c. With the forearm down or level it is a bag of cloth hanging off
   * the forearm: its fall one direction for the whole sleeve (down, and back with the wind his cape and hair stream
   * in), never worked out from the forearm, so it cannot flip; deepest past the middle, closing in to the cuff where
   * the hand comes out; its free hem rippling with the same wave as his hair. The more the forearm points up (up), the
   * further it has slid down off it: gathered round the elbow in a soft bunch (with the upper arm raised too, on down
   * toward the shoulder), its loose end hanging from there and streaming back with the wind, the ripple running down
   * to its hem; the slim forearm left bare above it. One outline morphing between the two, always the same number of
   * points. Fold lines go into `folds`.
   */
  function demonSleeve(f, E, sh, e, c, d, k, wv, sn, folds) {
    const [ax, ay] = unit(c[0] - e[0], c[1] - e[1]), up = ss((-ay - 0.15) / 0.6), N = 11, R = d / 0.17;
    const [hx, hy] = unit(-0.62 * wv - 0.7 * sn, 1 - 0.1 * wv - 0.9 * sn), px = -hy, py = hx; // (the bag's fall)
    const side = (c[0] - e[0]) * px + (c[1] - e[1]) * py > 0 ? -1 : 1, q0 = [], h0 = [];
    for (let i = 0; i <= N; i++) { // the bag on the forearm
      const v = i / N, x = lerp(e[0], c[0], v), y = lerp(e[1], c[1], v), th = 0.024 * (1 - 0.45 * v);
      q0.push(x - hx * th + px * th * 0.3 * side, y - hy * th + py * th * 0.3 * side);
      const bag = (0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, v * 1.1) * 0.9)) * (1 - 0.86 * ss((v - 0.72) / 0.28)), dep = d * bag;
      const w = Math.sin(E.t * 0.23 * E.sp + E.ph + k * 2.1 - v * 3.2) * d * 0.13 * (0.35 + 0.65 * bag), w2 = Math.sin(E.t * 0.31 * E.sp + E.ph + k + 1.3 - v * 4.1) * d * 0.05;
      h0.push(x + hx * (dep + w2) + px * w * side, y + hy * (dep + w2) + py * w * side);
    }
    const eB0 = [c[0] + hx * 0.012, c[1] + hy * 0.012], eA0 = [e[0] - (c[0] - e[0]) * 0.06 + hx * d * 0.12, e[1] - (c[1] - e[1]) * 0.06 + hy * d * 0.12];
    if (up < 0.002) { const q = [...q0, ...eB0]; for (let i = N; i >= 0; i--) q.push(h0[i * 2], h0[i * 2 + 1]); q.push(...eA0); f.poly(q); return; }
    // slid down: the gather at the elbow (g), between the upper arm (b, toward the shoulder) and the forearm (a)
    const Lu = Math.hypot(sh[0] - e[0], sh[1] - e[1]) || 1e-6, bx = (sh[0] - e[0]) / Lu, by = (sh[1] - e[1]) / Lu, uu = ss((by - 0.3) / 0.5); // uu: the upper arm raised too
    const [a0, a1] = unit(lerp(ax, -bx, uu), lerp(ay, -by, uu)), nx = -a1, ny = a0, mx = by, my = -bx, [ox, oy] = unit(nx + mx, ny + my); // (n, m: the outer sides of forearm and upper arm; o: the elbow's outer corner)
    const sl = 0.5 * uu * Lu, gx = e[0] + bx * sl, gy = e[1] + by * sl, P = (pa, pb, pn, pm, po) => [gx + a0 * pa + bx * pb + nx * pn + mx * pm + ox * po, gy + a1 * pa + by * pb + ny * pn + my * pm + oy * po];
    const t1 = lerp(0.048, 0.034, uu) * R, PA = P(0, 0.064 * R, 0, -t1, 0), PC = P(0, 0, 0, 0, -lerp(0.052, 0.034, uu) * R), PB = P(0.046 * R, 0, -0.03 * R, 0, 0), q1 = [];
    for (let i = 0; i <= N; i++) { const v = i / N, m0 = (1 - v) * (1 - v), m1 = 2 * v * (1 - v), m2 = v * v, lump = 0.007 * R * Math.abs(Math.sin(v * Math.PI * 2.6)) * (1 - 0.6 * uu); q1.push(m0 * PA[0] + m1 * PC[0] + m2 * PB[0] - ox * lump, m0 * PA[1] + m1 * PC[1] + m2 * PB[1] - oy * lump); } // over the top / the crook, a little lumpy
    // the loose end: hanging from under the elbow, streaming back with the wind, a ripple running down it
    const Lt = d * lerp(0.85, 0.6, uu), [dx, dy] = unit(-Math.min(0.5, 0.24 * wv + 0.6 * sn), 1), fx = dy, fy = -dx, ph = E.t * 0.23 * E.sp + E.ph + k * 2.1;
    const RF = P(0, 0, 0, 0.012 * R, 0.036 * R), RB = P(0, 0.016 * R, 0, 0.042 * R, 0), Rc = [lerp(RF[0], RB[0], 0.45), lerp(RF[1], RB[1], 0.45)];
    const D = (v) => { const r = Lt * 0.1 * v * Math.sin(ph - v * 3.2), l = Lt * v; return [Rc[0] + dx * l - Lt * 0.1 * v * v + fx * r, Rc[1] + dy * l - Lt * 0.03 * v * v + fy * r]; }; // its middle: a little further back as it falls, a ripple running down it (the wind blows toward -x)
    const br = Math.sin(E.t * 0.31 * E.sp + E.ph + k + 1.3) * 0.004 * R, C = (v, a, bx2, by2) => { const o = D(v); return [o[0] + fx * a + bx2, o[1] + fy * a + by2]; }; // (br: the bag breathing)
    const L1 = [P(0.046 * R, 0, 0.03 * R, 0, 0), P(0.01 * R, 0, 0.026 * R, 0, 0.036 * R), RF, C(0.3, 0.036 * R, 0, 0), C(0.62, 0.044 * R + br, 0, 0), C(0.88, 0.036 * R + br, 0, 0), C(1.04, 0.006 * R, 0, 0), // (pinched in under the gather, then) // a bag, full in front, round at the bottom;
      C(0.95, -0.042 * R - br, -Lt * 0.05, 0), C(0.66, -0.02 * R, 0, 0), C(0.33, -0.02 * R, 0, 0), RB, P(0, 0.05 * R, 0, 0.042 * R, 0)]; // its back corner pointing back into the wind
    const eB1 = P(0.062 * R, 0, 0, 0, 0), eA1 = P(0, 0.08 * R, 0, 0, 0), q = [];
    for (let i = 0; i <= N; i++) q.push(lerp(q0[i * 2], q1[i * 2], up), lerp(q0[i * 2 + 1], q1[i * 2 + 1], up));
    q.push(lerp(eB0[0], eB1[0], up), lerp(eB0[1], eB1[1], up));
    for (let i = N; i >= 0; i--) { const l = L1[N - i]; q.push(lerp(h0[i * 2], l[0], up), lerp(h0[i * 2 + 1], l[1], up)); }
    q.push(lerp(eA0[0], eA1[0], up), lerp(eA0[1], eA1[1], up));
    f.poly(q);
    if (folds && up > 0.3) { // creases round the gather; one down the hanging cloth
      folds.push([...P(0.04 * R, 0, -0.026 * R, 0, 0), ...P(0.03 * R, 0, 0.004 * R, 0, 0), ...P(0.034 * R, 0, 0.03 * R, 0, 0)], [...P(0, 0, 0, 0, -0.03 * R), ...P(0.008 * R, 0, 0, 0, 0.008 * R), ...P(0, 0, 0, 0, 0.042 * R)], [...P(0, 0.06 * R, 0, -0.036 * R, 0), ...P(0, 0.048 * R, 0, 0, 0), ...P(0, 0.046 * R, 0, 0.03 * R, 0)]);
      folds.push([...C(0.14, 0.004 * R, 0, 0), ...C(0.48, 0.012 * R, 0, 0), ...C(0.84, 0.006 * R, 0, 0)], [...C(0.4, -0.012 * R, 0, 0), ...C(0.66, -0.008 * R, 0, 0), ...C(0.9, -0.022 * R, 0, 0)]);
    }
  }
  function demonPath(f, D, E, acc) {
    const ln = D.ln, s0 = Math.sin(ln), s1 = -Math.cos(ln), n0 = -s1, n1 = s0, t = E.t, wv = E.wind, sp = E.sp;
    const sh = [s0 * SP * 0.88, s1 * SP * 0.88], nk = [s0 * SP, s1 * SP];
    const ha = ln + D.hd, H = [nk[0] + Math.sin(ha) * 0.075, nk[1] - Math.cos(ha) * 0.075];
    const wave = (a, b) => Math.sin(t * a * sp + b), folds = [];
    // legs in wide trousers, the front knee drawn up, boots pointing down
    const kf = ik(0, 0, 0.11 + 0.01 * Math.sin(t * 0.031), 0.4, TH, SH, 1), kb = ik(0, 0, -0.045, 0.465, TH, SH, 1);
    for (const k of [kb, kf]) {
      f.seg(0, 0, k[0], k[1], 0.12, 0.086, 2); f.seg(k[0], k[1], k[2], k[3] - 0.012, 0.086, 0.06, 0);
      const ax = k[2], ay = k[3];
      f.poly([ax - 0.032, ay - 0.05, ax + 0.03, ay - 0.05, ax + 0.034, ay + 0.03, ax + 0.052, ay + 0.078, ax + 0.03, ay + 0.088, ax - 0.018, ay + 0.04]);
    }
    // the robe, split at the sides: a front panel over the raised knee, a long back panel thrown back by the wind
    const wc0 = s0 * 0.06, wc1 = s1 * 0.06, wf = [wc0 + n0 * 0.076, wc1 + n1 * 0.076], wb = [wc0 - n0 * 0.074, wc1 - n1 * 0.074];
    const dF = unit(kf[0], kf[1]), nF = [dF[1], -dF[0]], kfo = [kf[0] + nF[0] * 0.075, kf[1] + nF[1] * 0.075];
    const fo = [kfo[0] + 0.045 + 0.015 * wave(0.19, 1), kf[1] + 0.2 + 0.02 * wave(0.23, 2)], fi = [kf[0] - 0.05, kf[1] + 0.17 + 0.015 * wave(0.21, 3)];
    f.poly([wf[0], wf[1], kfo[0], kfo[1], lerp(kfo[0], fo[0], 0.5) + 0.008, lerp(kfo[1], fo[1], 0.5), fo[0], fo[1], lerp(fo[0], fi[0], 0.5), lerp(fo[1], fi[1], 0.5) + 0.024, fi[0], fi[1], 0.012, 0.16, wc0, wc1]);
    folds.push([wc0 + n0 * 0.035, wc1 + n1 * 0.035, kf[0] + 0.012, kf[1] + 0.03, lerp(fo[0], fi[0], 0.45), lerp(fo[1], fi[1], 0.45)]);
    const bo = [-0.4 - 0.09 * wv - 0.03 * wave(0.13, 0), kb[1] + 0.05 + 0.05 * wave(0.16, 2)], b0 = [kb[0] + 0.02, kb[1] + 0.17 + 0.015 * wave(0.2, 0.5)];
    const bq = [wb[0], wb[1], wc0, wc1, -0.012, 0.15, b0[0], b0[1]];
    for (let i = 1; i <= 6; i++) { const k = i / 6; bq.push(lerp(b0[0], bo[0], k) + 0.01 * wave(0.27, i), lerp(b0[1], bo[1], k) + (i % 2 ? 0.028 : -0.006) + 0.024 * wave(0.22, i * 1.7)); }
    bq.push(bo[0] + 0.05, bo[1] - 0.13 + 0.03 * wave(0.15, 1), -0.21 - 0.05 * wv, -0.02 + 0.02 * wave(0.18, 2), wb[0] - 0.03, wb[1] + 0.02);
    f.poly(bq);
    folds.push([wc0 - n0 * 0.02, wc1 + 0.03, lerp(b0[0], bo[0], 0.35), lerp(b0[1], bo[1], 0.35) - 0.06, lerp(b0[0], bo[0], 0.55), lerp(b0[1], bo[1], 0.55) + 0.01], [wc0 - n0 * 0.06, wc1 + 0.01, lerp(b0[0], bo[0], 0.62), lerp(b0[1], bo[1], 0.5) - 0.1, lerp(b0[0], bo[0], 0.86), lerp(b0[1], bo[1], 0.86) - 0.02]);
    // the torso: a deep chest, a broad back
    const TOR = [[0, 0.07, 0.068], [0.3, 0.066, 0.064], [0.62, 0.086, 0.074], [0.86, 0.08, 0.084], [1, 0.04, 0.046]], tq = [];
    for (const [k, fw] of TOR) tq.push(s0 * SP * k + n0 * fw, s1 * SP * k + n1 * fw);
    for (let i = TOR.length - 1; i >= 0; i--) { const [k, , bw] = TOR[i]; tq.push(s0 * SP * k - n0 * bw, s1 * SP * k - n1 * bw); }
    f.poly(tq);
    f.circ(sh[0], sh[1], 0.064);
    // a broad belt, and a cloth hanging from it in front
    f.seg(wc0 + n0 * 0.082, wc1 + n1 * 0.082, wc0 - n0 * 0.08, wc1 - n1 * 0.08, 0.042, 0.042, false);
    f.poly([wc0 + n0 * 0.055, wc1 + n1 * 0.055 + 0.01, wc0 + n0 * 0.005, wc1 + 0.012, 0.02 + 0.012 * wave(0.3, 0), 0.25 + 0.012 * wave(0.25, 1), 0.07 + 0.012 * wave(0.3, 0.5), 0.24]);
    // a mantle squaring the shoulders, its edge lifting behind; a high collar standing up behind the head
    const w1 = wave(0.2, 0), w2 = wave(0.26, 1.3);
    f.poly([nk[0] + n0 * 0.035, nk[1] + n1 * 0.035 + 0.01, sh[0] + n0 * 0.1, sh[1] + n1 * 0.1 + 0.005, sh[0] + n0 * 0.088, sh[1] + 0.12, sh[0] + n0 * 0.03, sh[1] + 0.15 + 0.01 * w1,
      sh[0] - 0.09, sh[1] + 0.145 + 0.012 * w2, sh[0] - 0.2 - 0.04 * wv, sh[1] + 0.085 + 0.03 * w1, sh[0] - 0.15, sh[1] - 0.015, nk[0] - n0 * 0.07, nk[1] - n1 * 0.07]);
    folds.push([sh[0] + n0 * 0.02, sh[1] + 0.04, sh[0] - 0.05, sh[1] + 0.12 + 0.01 * w2]);
    f.poly([nk[0] - n0 * 0.03, nk[1] - n1 * 0.03, nk[0] - n0 * 0.08 + s0 * 0.115, nk[1] - n1 * 0.08 + s1 * 0.115, nk[0] - n0 * 0.05 + s0 * 0.125, nk[1] - n1 * 0.05 + s1 * 0.125, nk[0] - n0 * 0.008 + s0 * 0.04, nk[1] - n1 * 0.008 + s1 * 0.04]);
    // the cape, streaming back and up from his shoulders; its crimson lining shows along the lower edge
    const AT = [sh[0] - n0 * 0.06, sh[1] - n1 * 0.06 - 0.012], AB = [wc0 - n0 * 0.07, wc1 - n1 * 0.07 + 0.01], top = [], bot = [], N = 12, Lc = 0.62;
    for (let i = 0; i <= N; i++) { // waves run out along the cloth, growing toward its end
      const s = i / N, ph = t * 0.12 * sp - s * 5.6, a = Math.sin(ph) + 0.35 * Math.sin(ph * 2.1 + 1), b = Math.sin(ph - 0.7) + 0.35 * Math.sin(ph * 1.9 + 2);
      top.push([AT[0] - Lc * s * (1 + 0.05 * wv), AT[1] - Lc * 0.42 * s * s * (0.9 + 0.1 * wv) + 0.055 * s * a]);
      bot.push([AB[0] - Lc * 1.12 * s * (1 + 0.05 * wv), AB[1] - Lc * 0.16 * s * s + 0.075 * s * b]);
    }
    const cq = top.flat(), tN = top[N], bN = bot[N];
    cq.push(lerp(tN[0], bN[0], 0.3) + 0.05, lerp(tN[1], bN[1], 0.3) + 0.01, lerp(tN[0], bN[0], 0.55) + 0.01 - 0.02 * Math.sin(t * 0.21), lerp(tN[1], bN[1], 0.55), lerp(tN[0], bN[0], 0.75) + 0.07, lerp(tN[1], bN[1], 0.75)); // a ragged, forked end
    for (let i = N; i >= 0; i--) cq.push(bot[i][0], bot[i][1]);
    f.poly(cq);
    for (const m of [0.36, 0.68]) { const fl = []; for (let i = 2; i <= N - 1; i++) fl.push(lerp(bot[i][0], top[i][0], m), lerp(bot[i][1], top[i][1], m)); folds.push(fl); }
    const lq = [];
    for (let i = 1; i <= N; i++) lq.push(bot[i][0], bot[i][1]);
    for (let i = N; i >= 1; i--) { const s = i / N, k = 0.06 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.12 * sp - s * 5.6 + 1.3)); lq.push(lerp(bot[i][0], top[i][0], k), lerp(bot[i][1], top[i][1], k)); }
    acc.lining = lq;
    // head: chin up, a topknot under a small crown, long hair thrown back by the qi
    const at = (a, b) => [H[0] + Math.cos(ha) * a + Math.sin(ha) * b, H[1] + Math.sin(ha) * a - Math.cos(ha) * b];
    f.seg(nk[0], nk[1], H[0] - Math.sin(ha) * 0.035, H[1] + Math.cos(ha) * 0.035, 0.056, 0.048, 0);
    f.ell(H[0], H[1], 0.05, 0.06, ha);
    f.poly([...at(0.034, 0.014), ...at(0.062, -0.012), ...at(0.044, -0.024)]);
    f.poly([...at(0.018, -0.028), ...at(0.052, -0.04), ...at(0.047, -0.07), ...at(0.012, -0.076), ...at(-0.02, -0.06)]); // a strong jaw
    f.ell(...at(-0.014, 0.014), 0.058, 0.064, ha); // hair over the crown, drawn up
    f.circ(...at(-0.01, 0.088), 0.025); // the topknot, high
    f.poly([...at(-0.03, 0.074), ...at(0.012, 0.074), ...at(0.017, 0.112), ...at(0.002, 0.13), ...at(-0.017, 0.132), ...at(-0.034, 0.114)]); // a narrow guan round it
    f.seg(...at(-0.036, 0.09), ...at(0.024, 0.118), 0.008, 0.006, false); // its pin, short and slanting
    strand(f, ...at(-0.03, 0.1), Math.PI + 0.2 + ha, Math.PI + 0.12, 0.2 + 0.03 * wv, 6, 0.012, 0.004, E, 3.3, 0.6, 0.2); // the tie trailing from it
    { // the hair: one heavy mass off the back of the head, coming apart into locks toward the ends
      const [bx, by] = at(-0.046, 0.006);
      const m = strand(f, bx, by, Math.PI + 0.32 + ha, Math.PI + 0.06, 0.5 + 0.05 * wv, 12, 0.095, 0.004, E, 0, 0.36, 0.16);
      for (const [i, da, len, w, k] of [[2, 0.16, 0.3, 0.042, 1.3], [3, -0.24, 0.22, 0.03, 0.4], [4, -0.14, 0.3, 0.034, 2.7], [6, 0.1, 0.2, 0.026, 4.1], [7, 0.26, 0.16, 0.02, 5.6]]) { // locks coming loose from it
        const x0 = m[i * 2], y0 = m[i * 2 + 1], a0 = Math.atan2(m[i * 2 + 3] - m[i * 2 - 1], m[i * 2 + 2] - m[i * 2 - 2]);
        strand(f, x0, y0, a0 + da * 0.5, a0 + da, len + 0.03 * wv, 7, w, 0.002, E, k, 0.45, 0.1);
      }
    }
    acc.eye = at(0.03, 0.012);
    // arms, heavy: the back hand behind him, the front one raised, two fingers out; a wide outer sleeve over a narrow inner cuff
    const sb = [sh[0] - n0 * 0.016, sh[1] - n1 * 0.016], su = [sh[0], sh[1] - 0.014 * (D.su || 0)]; // (the shoulder rises a little with a great gesture)
    const eb = ikArm(sb[0], sb[1], sb[0] + D.bx, sb[1] + D.by, UA, FA);
    const ef = ik(su[0], su[1], su[0] + D.ax, su[1] + D.ay, UA, FA, -1); // the front arm always bends the way an elbow bends (the forearm folding toward the inside of the arm): it never flips to the other side
    acc.el = [ef[0], ef[1]]; acc.su = su;
    const rot = (x, y, a) => { const c = Math.cos(a), n = Math.sin(a); return [x * c - y * n, x * n + y * c]; };
    /*
     * A hand at the wrist W, the forearm along fd, pointing along pd: a palm bent partway toward where it points, four
     * fingers of two joints each and a thumb, each curled by its own amount (cu: 0 straight .. 1 folded into the palm),
     * fanned apart by spr. ps turns the hand over: 1, the fingers curl down toward the near side (劍指: index and middle
     * out together, ring and little curled, the thumb pressed over them); -1, the palm faces up and they curl toward the
     * sky. z: its size. Returns the point between the two sword fingertips, a point just above the palm, and the
     * palm's upper edge.
     */
    const hand = (W, fd, pd, cu, spr, th, ps, z, full) => {
      const [h0, h1] = unit(fd[0] + pd[0] * 1.3, fd[1] + pd[1] * 1.3), q0 = -h1 * ps, q1 = h0 * ps, ac = 0.35 + 0.65 * Math.abs(ps); // the palm; across it toward where the fingers curl (seen edge on as it turns over)
      const K0 = W[0] + h0 * 0.046 * z, K1 = W[1] + h1 * 0.046 * z, sg = clamp(ps * 2.5, -1, 1), eo = 1 - Math.abs(sg); // (sg: which way the fingers curl, passing through 0 as the hand turns over edge on: no sudden mirror)
      f.seg(W[0] - h0 * 0.004, W[1] - h1 * 0.004, K0, K1, 0.033 * z, (0.04 + 0.006 * spr) * z, 3);
      const [p0, p1] = unit(lerp(h0, pd[0], 0.7), lerp(h1, pd[1], 0.7)), FS = [-0.26, -0.09, 0.08, 0.24], OF = [-0.009, -0.003, 0.006, 0.013], LN = [1, 1.06, 0.98, 0.8], tip = [];
      let bump = 0;
      for (let i = 0; i < 4; i++) {
        if (!full && cu[i] > 0.88 && (i > 1 || cu[0] > 0.88)) { bump = 1; tip.push(K0, K1); continue; } // (curled right in: drawn below as one knuckled bump)
        const c = cu[i], o = OF[i] * z * ac * (i < 2 ? lerp(0.6, 1.3, spr) : 1), bx = K0 + q0 * o, by = K1 + q1 * o;
        const tk = ss((c - 0.55) / 0.45); // folded right in: the finger folds tighter and shorter and lies against the palm
        let [d0, d1] = rot(p0, p1, (FS[i] * spr + c * (1.35 + 0.2 * tk)) * sg);
        const fo = lerp(1, 0.4, c * eo) * (1 - 0.4 * tk), l1 = 0.027 * LN[i] * z * fo, l2 = 0.025 * LN[i] * z * (1 - 0.3 * c) * fo, m0 = bx + d0 * l1, m1 = by + d1 * l1;
        [d0, d1] = rot(d0, d1, c * (1.5 + 0.4 * tk) * sg);
        const t0 = m0 + d0 * l2, t1 = m1 + d1 * l2;
        f.seg(bx, by, m0, m1, 0.0148 * z, 0.0134 * z, 2); f.seg(m0, m1, t0, t1, 0.0134 * z, 0.0096 * z, 2);
        if (tk > 0.01) f.ell((bx + m0 + t0) / 3, (by + m1 + t1) / 3, l1 * 0.62 * tk, 0.0128 * z * tk, Math.atan2(m1 - by, m0 - bx)); // (no gap under the folded finger: it reads as knuckles, not a claw)
        tip.push(t0, t1);
      }
      if (bump) { const [c0, c1] = rot(p0, p1, 1.2 * sg); f.ell(K0 + q0 * 0.009 * z + c0 * 0.008 * z, K1 + q1 * 0.009 * z + c1 * 0.008 * z, 0.017 * z, 0.013 * z, Math.atan2(p1, p0)); } // the curled fingers: a knuckled bump in the palm
      const b0 = W[0] + h0 * 0.014 * z + q0 * 0.012 * z, b1 = W[1] + h1 * 0.014 * z + q1 * 0.012 * z, tl = lerp(0.031, 0.037, th) * z; // the thumb: across the curled fingers, or out to the side
      let [u0, u1] = rot(h0, h1, lerp(0.5, 1.05, th) * sg);
      const m0 = b0 + u0 * tl * 0.55, m1 = b1 + u1 * tl * 0.55;
      [u0, u1] = rot(u0, u1, -lerp(0.6, 0.05, th) * sg);
      f.seg(b0, b1, m0, m1, 0.019 * z, 0.016 * z, 2); f.seg(m0, m1, m0 + u0 * tl * 0.5, m1 + u1 * tl * 0.5, 0.016 * z, 0.012 * z, 2);
      const pc0 = W[0] + h0 * 0.03 * z, pc1 = W[1] + h1 * 0.03 * z, n0 = -q0 * sg * 0, nn = sg < 0 ? [q0, q1] : [-q0, -q1]; // (up off the palm when it faces up)
      return { tip: [(tip[0] + tip[2]) / 2, (tip[1] + tip[3]) / 2], orb: [pc0 + q0 * 0.045 * z, pc1 + q1 * 0.045 * z], lit: [W[0] + q0 * 0.017 * z, W[1] + q1 * 0.017 * z, K0 + q0 * 0.021 * z, K1 + q1 * 0.021 * z],
        split: cu[0] < 0.4 && cu[1] < 0.4 && spr < 0.3 && ps > 0.5 ? [K0 - q0 * 0.006 * z + p0 * 0.008, K1 - q1 * 0.006 * z + p1 * 0.008, (tip[0] + tip[2]) / 2 - p0 * 0.008, (tip[1] + tip[3]) / 2 - p1 * 0.008] : null };
    };
    let hr = null;
    for (const [s, e, k] of [[sb, eb, 0], [su, ef, 1]]) {
      const [fx, fy] = unit(e[2] - e[0], e[3] - e[1]), W = [e[2], e[3]], up = ss((-fy - 0.15) / 0.6), uu = up * ss((unit(s[0] - e[0], s[1] - e[1])[1] - 0.3) / 0.5); // up: the forearm raised, its wide sleeve slid down to the elbow, the forearm slim in a narrow inner sleeve; uu: the upper arm raised too
      f.seg(s[0], s[1], e[0], e[1], 0.072, lerp(0.06, 0.047, uu), 2); f.seg(e[0], e[1], e[2], e[3], lerp(0.058, 0.044, up), lerp(0.044, 0.036, up), 0);
      f.seg(W[0] - fx * 0.045, W[1] - fy * 0.045, W[0], W[1], lerp(0.04, 0.031, up), lerp(0.036, 0.029, up), 0); // the wrist, out of the cuff
      const fb = 0.05 * ss((-fy - 0.3) / 0.6) * (1 - up), c0 = lerp(0.088 + fb, 0.066, up), c1 = lerp(0.036 + fb * 0.6, 0.037, up); // the more the forearm points up, the further the wide sleeve has fallen back down it; raised, it is a band at the wrist
      f.seg(e[2] - fx * c0, e[3] - fy * c0, e[2] - fx * c1, e[3] - fy * c1, lerp(0.052, 0.049, up), lerp(0.046, 0.047, up), 0); f.circ(e[2] - fx * c0, e[3] - fy * c0, lerp(0.026, 0.018, up)); f.circ(e[2] - fx * c1, e[3] - fy * c1, lerp(0.023, 0.0135, up)); // the inner cuff
      if (fb > 0.002) f.seg(e[2] - fx * (0.04 + fb * 0.6), e[3] - fy * (0.04 + fb * 0.6), W[0] - fx * 0.04, W[1] - fy * 0.04, 0.046, 0.04, 0); // (the bare forearm it leaves)
      demonSleeve(f, E, s, [e[0], e[1]], [e[2] - fx * (0.074 + fb), e[3] - fy * (0.074 + fb)], k ? 0.17 : 0.15, k, wv, k ? D.sn || 0 : 0, folds); // the wide sleeve: hanging, streaming with the wind, rippling
      if (k) { acc.wr = W; const hp = D.hp || HP0; hr = hand(W, [fx, fy], unit(D.px, D.py), hp.cu, hp.spr, hp.th, hp.ps, hp.z, hp.full); }
      else hand(W, [fx, fy], [fx, fy], [1, 1, 1, 1], 0, 0.2, 1, 1.22, 0); // the back hand, closed, half hidden behind him
    }
    const pw = (D.hp && D.hp.orb) || 0;
    acc.hand = [lerp(hr.tip[0], hr.orb[0], pw), lerp(hr.tip[1], hr.orb[1], pw)]; acc.sh = sh; // (the fingertips; in 흡공 the air just above his palm)
    acc.lit = pw > 0.05 ? hr.lit : null; acc.beck = (D.hp && D.hp.beck) || 0;
    acc.split = hr.split; // the line between the two sword fingers
    // the sash: crimson, its ends trailing
    const sx = wc0 - n0 * 0.07, sy = wc1 - n1 * 0.07;
    acc.sash = [strand(null, sx, sy, Math.PI * 0.75, Math.PI * 1.12, 0.36 + 0.05 * wv, 7, 0, 0, E, 0.5, 0.45, 0.22), strand(null, sx, sy + 0.012, Math.PI * 0.65, Math.PI * 1.04, 0.3 + 0.04 * wv, 7, 0, 0, E, 2.1, 0.45, 0.22)];
    acc.belt = [wc0 + n0 * 0.08, wc1 + n1 * 0.08, wc0 - n0 * 0.078, wc1 - n1 * 0.078];
    acc.folds = folds;
  }

  /** Lay a silhouette path into the picture at (x, y), scale s, dir -1 mirrored: it hides what lies behind it. With
   * `rim`, the edges facing the light (the side away from the shift rx, ry, in pixels) are lit in that style. */
  const HJ = 0.4; // how strongly the hanji shows (1: fibres, pulp and bleed at full strength); the scene reads first, the paper second
  let BLEED = 0; // ink soaking into the paper round a figure's edge (set each frame)
  function inkFig(ctx, path, x, y, s, dir, a, ink, rim, rx, ry, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s * dir, s);
    if (BLEED) { ctx.globalAlpha = a * BLEED; ctx.strokeStyle = ink; ctx.lineWidth = (1.2 + 1.6 * HJ) / s; ctx.stroke(path); } // (a thin soft fringe)
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fill(path);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = ink; ctx.fill(path);
    if (rim) {
      ctx.clip(path);
      ctx.globalAlpha = 1; ctx.fillStyle = rim; ctx.fillRect(-1.6, -1.5, 3.2, 2);
      ctx.translate(rx / (s * dir), ry / s);
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(path);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = ink; ctx.fill(path);
    }
    ctx.restore();
  }

  /* ---------- sprites and textures ---------- */
  /** A straight sword pointing right, 256 × 48, its middle at the centre: a broad blade with a ridge and a lit edge, a crossguard, a wrapped grip. */
  function swordSprite(L) {
    const key = `chmSword3${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(256, 48), x = c.getContext('2d'), m = 24;
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (!L) for (const [lw, a] of [[24, 0.035], [15, 0.06], [9, 0.1]]) { x.strokeStyle = `rgba(232,44,60,${a})`; x.lineWidth = lw; x.beginPath(); x.moveTo(84, m); x.lineTo(246, m); x.stroke(); } // the qi on it
    const blade = new Path2D(); blade.moveTo(76, m - 6.6); blade.lineTo(214, m - 5.4); blade.lineTo(253, m); blade.lineTo(214, m + 5.4); blade.lineTo(76, m + 6.6); blade.closePath();
    const g = x.createLinearGradient(0, m - 7, 0, m + 7);
    if (L) { g.addColorStop(0, '#c6cad2'); g.addColorStop(0.5, '#8c929d'); g.addColorStop(1, '#b0b5be'); } else { g.addColorStop(0, '#f4f7fd'); g.addColorStop(0.45, '#b8c1d6'); g.addColorStop(0.55, '#6c7690'); g.addColorStop(1, '#c4cde2'); }
    x.fillStyle = g; x.fill(blade);
    if (L) { x.strokeStyle = '#1e2026'; x.lineWidth = 1.7; x.stroke(blade); } // an ink line round it, so each reads on its own
    x.strokeStyle = L ? 'rgba(30,32,38,0.5)' : 'rgba(70,78,100,0.7)'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(80, m); x.lineTo(226, m); x.stroke(); // the ridge
    x.strokeStyle = L ? 'rgba(255,255,255,0.95)' : 'rgba(255,240,232,1)'; x.lineWidth = L ? 1.1 : 1.5; x.beginPath(); x.moveTo(80, m - 6); x.lineTo(214, m - 4.9); x.lineTo(251, m); x.stroke(); // the edge catching the light
    const ink = L ? '#24262c' : '#0b0709';
    x.fillStyle = ink;
    x.beginPath(); x.moveTo(63, m - 4.5); x.quadraticCurveTo(63, m - 16, 74, m - 20); x.lineTo(78.5, m - 16); x.quadraticCurveTo(72, m - 11.5, 75, m - 4.5); x.lineTo(75, m + 4.5); x.quadraticCurveTo(72, m + 11.5, 78.5, m + 16); x.lineTo(74, m + 20); x.quadraticCurveTo(63, m + 16, 63, m + 4.5); x.closePath(); x.fill(); // the guard, its ends curling toward the blade
    x.fillRect(22, m - 4.8, 42, 9.6); // the grip
    x.beginPath(); x.arc(16, m, 7.2, 0, TAU); x.fill(); // the pommel
    x.strokeStyle = L ? 'rgba(186,52,52,0.8)' : 'rgba(160,40,48,0.95)'; x.lineWidth = 1.5;
    for (let k = 25; k < 62; k += 5) { x.beginPath(); x.moveTo(k, m - 4.4); x.lineTo(k + 3.6, m + 4.4); x.stroke(); } // the wrapped grip
    x.strokeStyle = L ? 'rgba(150,104,30,0.9)' : 'rgba(232,188,100,0.85)'; x.lineWidth = 1.6;
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(64, m + d * 2.5); x.quadraticCurveTo(65, m + d * 15, 74, m + d * 18.5); x.stroke(); }
    x.beginPath(); x.arc(16, m, 4.4, 0, TAU); x.stroke();
    K.cache.set(key, c);
    return c;
  }

  /** The moon (a crimson sun on a light page). */
  function orb(L) {
    const key = `chmOrb${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 126);
    if (L) { g.addColorStop(0, 'rgba(214,66,58,1)'); g.addColorStop(0.88, 'rgba(196,48,46,1)'); g.addColorStop(1, 'rgba(196,48,46,0)'); } else { g.addColorStop(0, 'rgba(255,236,226,1)'); g.addColorStop(0.6, 'rgba(250,206,190,1)'); g.addColorStop(0.86, 'rgba(232,150,136,1)'); g.addColorStop(0.97, 'rgba(204,86,80,0.85)'); g.addColorStop(1, 'rgba(204,86,80,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = L ? 0.1 : 0.17;
    x.drawImage(K.tint(K.noiseTex('chmMoon', 128, 128, { px: 4, py: 4, oct: 4, lo: 0.42, hi: 0.72, seed: 57 }), L ? '#5a1010' : '#8a7066'), 0, 0, 256, 256);
    K.cache.set(key, c);
    return c;
  }

  /** Cloud wound into a slow spiral (white alpha), to turn over his head. */
  function vortexTex() {
    if (K.cache.has('chmVortex')) return K.cache.get('chmVortex');
    const N = 256, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(93, 8, 4, 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (i + 0.5 - N / 2) / (N / 2), dy = (j + 0.5 - N / 2) / (N / 2), r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      const th = Math.atan2(dy, dx) / TAU + 0.5;
      let a = (f(th * 8 + Math.log(r + 0.04) * 2.4, r * 3) - 0.42) / 0.28; // arms winding inward
      a = a < 0 ? 0 : a > 1 ? 1 : a; a = a * a * (3 - 2 * a);
      a *= Math.pow(Math.sin(Math.PI * r), 0.9) * ss(r / 0.2);
      const o = (j * N + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    c.__k = 'chmVortex';
    K.cache.set('chmVortex', c);
    return c;
  }

  /** A soft round puff (dust, glow), white. */
  function puff() {
    if (K.cache.has('chmPuff')) return K.cache.get('chmPuff');
    const c = K.mk(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    c.__k = 'chmPuff';
    K.cache.set('chmPuff', c);
    return c;
  }

  /**
   * 마기: the demonic qi wrapped round each of his swords, laid out in the sword sprite's own units (the sword's middle
   * at (AUR_X, AUR_Y), its point toward +x): smoke hugging the blade, densest at the hilt and thinning toward the
   * point, crimson tongues licking back off the guard and past the pommel, a few embers at its edge. AUR_N frames,
   * cycled for the flicker. Ink wash and crimson on a light page.
   */
  const AUR_N = 6, AUR_W = 400, AUR_H = 144, AUR_X = 240, AUR_Y = 72;
  function auraSprite(L, f) {
    const key = `chmAura3${L ? 'L' : 'D'}${f}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(AUR_W, AUR_H), x = c.getContext('2d'), R = K.rng(311 + f * 17);
    const blob = (sx, sy, r, rgb, a, sq) => { const px = AUR_X + sx, py = AUR_Y + sy, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.45, `rgba(${rgb},${a * 0.5})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.save(); x.translate(px, py); x.scale(1, sq || 1); x.translate(-px, -py); x.fillRect(px - r, py - r, r * 2, r * 2); x.restore(); };
    const smoke = L ? '52,44,50' : '16,2,8', flame = L ? '168,26,38' : '214,36,52', ember = L ? '150,20,30' : '255,150,110';
    for (let i = 0; i <= 16; i++) { const p = i / 16; blob(lerp(-112, 112, p), 0, lerp(30, 11, p), flame, lerp(L ? 0.07 : 0.3, L ? 0.02 : 0.07, p), 0.7); } // a glow of it close along the blade
    for (let i = 0; i <= 22; i++) { // smoke wrapped round the blade
      const p = i / 22, sx = lerp(-124, 116, p), r = lerp(34, 10, Math.pow(p, 0.75)) * (0.85 + R() * 0.3);
      blob(sx, (R() - 0.5) * r * 0.5, r, smoke, lerp(L ? 0.06 : 0.55, L ? 0.01 : 0.08, p), 0.8);
    }
    for (let i = 0; i < 32; i++) { // flame along both edges, leaning back
      const p = R(), sx = lerp(-80, 118, p), w = sx < -50 ? 20 : lerp(8, 2, (sx + 50) / 170), sd = R() < 0.5 ? -1 : 1, r = lerp(17, 6, p) * (0.7 + R() * 0.6);
      if (L && R() < 0.45) continue; // a wash with gaps on paper
      blob(sx - r * 0.5, sd * (w + r * (0.3 + R() * 0.45)), r, flame, lerp(L ? 0.26 : 0.7, L ? 0.06 : 0.14, p) * (0.6 + R() * 0.4), 0.55);
    }
    for (let i = 0; i < 7; i++) { // tongues licking back past the pommel, curling
      let sx = -104 - R() * 14, sy = (R() - 0.5) * 34; const len = 50 + R() * 70, cu = (R() - 0.5) * 1.2, ph = R() * TAU;
      for (let k = 0; k < 8; k++) { const q = k / 7, r = lerp(18, 4, q); blob(sx, sy, r, k < 2 ? smoke : flame, lerp(L ? 0.2 : 0.6, 0.05, q), 0.6); sx -= len / 8; sy += Math.sin(ph + q * 3) * 4 + cu * q * 8; }
    }
    for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) { const q = k / 5; blob(-58 - q * 60 - R() * 8, sd * (22 + q * 16 + R() * 5), lerp(12, 4, q), flame, lerp(L ? 0.18 : 0.55, 0.05, q), 0.6); } // off the guard
    for (let i = 0; i < 9; i++) { const sx = lerp(-130, 100, R()), sd = R() < 0.5 ? -1 : 1; blob(sx, sd * (12 + R() * 16), 2 + R() * 1.6, ember, L ? 0.5 : 0.9); } // embers
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }

  /* ---------- the stage ---------- */
  function layout(V) {
    const { W, H, u } = V, cx = W - Math.max(u * 0.42, W * 0.28), hc = u * 0.33;
    return { cx, hc, ey: H * 0.8, hipY: H * 0.43, gyC: H * 0.885, gx: cx - u * 0.46, rows: [H * 0.925, H * 0.89, H * 0.858], sz: [u * 0.152, u * 0.136, u * 0.12] };
  }

  /** A tapered limb filled in the context's style. */
  function limb(c, a, b, wa, wb) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6, nx = -dy / l, ny = dx / l;
    c.beginPath(); c.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2); c.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2); c.lineTo(b[0] - nx * wb / 2, b[1] - ny * wb / 2); c.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2); c.closePath(); c.fill();
    c.beginPath(); c.arc(b[0], b[1], wb / 2, 0, TAU); c.fill();
  }
  /** A pad of pine needles: a low, ragged dome, its edge bristling. */
  function needles(c, R, x, y, r, z) {
    c.beginPath();
    for (let i = 0; i <= 18; i++) { const a = Math.PI + (i / 18) * Math.PI, k = 0.82 + R() * 0.3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r * k, y + Math.sin(a) * r * 0.36 * k); }
    for (let i = 1; i < 6; i++) c.lineTo(x + r * (1 - (i / 6) * 2) * 0.92, y + r * (0.06 + R() * 0.07));
    c.closePath(); c.fill();
    c.lineWidth = Math.max(0.5 * z, r * 0.028);
    c.beginPath();
    for (let i = 0; i < 34; i++) { // needles: out of the top of the pad, and hanging from its underside
      const a = Math.PI + R() * Math.PI, sx = x + Math.cos(a) * r * 0.62, sy = y + Math.sin(a) * r * 0.2, k = 1.02 + R() * 0.2;
      c.moveTo(sx, sy); c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * 0.46 * k);
    }
    for (let i = 0; i < 12; i++) { const sx = x + (R() * 2 - 1) * r * 0.8; c.moveTo(sx, y + r * 0.05); c.lineTo(sx + (R() - 0.5) * r * 0.1, y + r * (0.14 + R() * 0.1)); }
    c.stroke();
  }
  /** A pine on a crag: a twisting trunk, limbs reaching out and drooping, pads of needles (fill and stroke in the context's style). */
  function pine(c, R, x, y, h, lean, z) {
    const n = 9, sl = h / n, pts = [];
    let px = x, py = y, a = -Math.PI / 2 + lean;
    for (let i = 0; i <= n; i++) { pts.push([px, py]); a += (R() - 0.5) * 0.55 - lean * 0.07 + (i === 4 ? 0.3 : 0); px += Math.cos(a) * sl; py += Math.sin(a) * sl; }
    const wid = (k) => h * (0.08 * (1 - k) + 0.016 * k);
    limb(c, [x - h * 0.07, y + h * 0.02], [x, y - h * 0.03], h * 0.03, h * 0.06); limb(c, [x + h * 0.08, y + h * 0.025], [x, y - h * 0.03], h * 0.025, h * 0.06); // roots gripping the rock
    for (let i = 0; i < n; i++) limb(c, pts[i], pts[i + 1], wid(i / n), wid((i + 1) / n));
    const pads = [];
    for (let i = 3; i <= n; i++) {
      if (i < n && R() < 0.2) continue;
      const [bx, by] = pts[i], d = (i % 2 ? 1 : -1) * (i === n ? 1 : 1), bl = h * (0.48 - 0.26 * (i / n)) * (0.7 + R() * 0.55) * (d > 0 ? 1.15 : 0.85), bp = [[bx, by]];
      let ba = d > 0 ? -0.25 - R() * 0.3 : Math.PI + 0.25 + R() * 0.3, qx = bx, qy = by;
      for (let k = 0; k < 4; k++) { ba += d * (0.12 + R() * 0.12); qx += Math.cos(ba) * bl / 4; qy += Math.sin(ba) * bl / 4; bp.push([qx, qy]); } // out, then drooping
      for (let k = 0; k < 4; k++) limb(c, bp[k], bp[k + 1], wid(i / n) * 0.55 * (1 - k / 5), wid(i / n) * 0.55 * (1 - (k + 1) / 5));
      pads.push([qx, qy - bl * 0.02, bl * 0.5], [bp[2][0], bp[2][1] - bl * 0.06, bl * 0.34]);
    }
    pads.push([pts[n][0], pts[n][1] + h * 0.01, h * 0.17], [pts[n][0] - h * 0.05, pts[n][1] - h * 0.04, h * 0.1]);
    for (const [fx, fy, r] of pads) needles(c, R, fx, fy, r, z);
  }

  function build(bg, V) {
    const { W, H, u, z } = V, L = K.light(), R = K.rng(4417), q = bg.dpr || 1, Y = layout(V);
    const ink = L ? '#2a2c33' : '#05070b', inkRGB = L ? '42,44,51' : '5,7,11';
    const [back, b] = K.layer(W, H, q), [rock, r] = K.layer(W, H, q), [floor, f] = K.layer(W, H, q), [near, n] = K.layer(W, H, q);

    // far peaks in ink wash: needles of rock standing out of the clouds, each range hiding the one behind
    const smooth = (h, r) => { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) { let a = 0, n = 0; for (let k = -r; k <= r; k++) { const j = Math.min(h.length - 1, Math.max(0, i + k)), wk = r + 1 - Math.abs(k); a += h[j] * wk; n += wk; } o[i] = a / n; } return o; };
    const range = (base, amp, nSp, rgb, top, low) => {
      const N = 192, rr = smooth(K.ridge(R, N, 0.5), 3), rk = smooth(K.ridge(R, N, 0.62), 1), sp = [];
      for (let i = 0; i < nSp; i++) { const w = 0.035 + R() * 0.07; sp.push({ x: (i + 0.15 + R() * 0.7) / nSp, wl: w * (0.65 + R() * 0.7), wr: w * (0.65 + R() * 0.7), h: 0.45 + R() * 0.55, sh: R() < 0.5 ? -1 : 1 }); }
      const X = (i) => -12 + ((W + 24) * i) / N, hts = [];
      for (let i = 0; i <= N; i++) {
        const xx = i / N; let v = rr[i] * 0.3;
        for (const s of sp) { // steep, uneven sides, a shoulder on one of them, a rocky crown
          const dx = xx - s.x, d = Math.abs(dx) / (dx < 0 ? s.wl : s.wr);
          if (d < 1) { let p = s.h * Math.pow(1 - Math.pow(d, 1.6), 2); if (Math.sign(dx) === s.sh) p = Math.max(p, s.h * 0.62 * Math.pow(1 - Math.pow(Math.abs(d - 0.45) / 0.55, 2), 2) * (d < 1 ? 1 : 0)); v = Math.max(v, p + (rk[i] - 0.5) * 0.16 * p); }
        }
        hts.push(v);
      }
      const Yv = (i) => base - amp * hts[i], bottom = base + u * 0.03, path = new Path2D();
      path.moveTo(-12, bottom); for (let i = 0; i <= N; i++) path.lineTo(X(i), Yv(i)); path.lineTo(W + 12, bottom); path.closePath();
      b.save(); b.globalCompositeOperation = 'destination-out'; b.fill(path); b.restore();
      const g = b.createLinearGradient(0, base - amp, 0, bottom);
      g.addColorStop(0, `rgba(${rgb},${top})`); g.addColorStop(0.6, `rgba(${rgb},${top * 0.55 + low * 0.45})`); g.addColorStop(1, `rgba(${rgb},${low})`);
      b.fillStyle = g; b.fill(path);
      b.save(); b.clip(path); b.lineCap = 'round';
      for (let i = 1; i < N; i++) { // strokes running down the faces
        if (hts[i] < 0.28 || R() > 0.45) continue;
        const x = X(i), y = Yv(i), len = amp * (0.05 + R() * 0.22) * (0.4 + hts[i]), dx = (Yv(i + 1) - Yv(i - 1)) * 0.25;
        b.strokeStyle = `rgba(${rgb},${top * (0.25 + R() * 0.35)})`; b.lineWidth = (0.6 + R() * 0.9) * z;
        b.beginPath(); b.moveTo(x, y + 1); b.quadraticCurveTo(x + dx * 0.4, y + len * 0.5, x + dx + (R() - 0.5) * u * 0.006, y + len); b.stroke();
      }
      b.restore();
    };
    const nw = Math.max(3, Math.round(W / u * 2.2));
    if (L) { range(Y.ey - u * 0.1, u * 0.42, nw, inkRGB, 0.12, 0.01); range(Y.ey - u * 0.05, u * 0.3, nw + 1, inkRGB, 0.19, 0.02); range(Y.ey, u * 0.16, nw + 2, inkRGB, 0.28, 0.04); } else { range(Y.ey - u * 0.1, u * 0.42, nw, '128,144,186', 0.19, 0.02); range(Y.ey - u * 0.05, u * 0.3, nw + 1, '96,110,152', 0.25, 0.04); range(Y.ey, u * 0.16, nw + 2, '44,52,78', 0.5, 0.1); }

    // a pinnacle at the left, a pine leaning out from it over the platform
    r.fillStyle = ink; r.strokeStyle = ink;
    const px = Math.min(W * 0.06, u * 0.07), pt = H * 0.53;
    const cg = r.createLinearGradient(0, pt, 0, Y.ey); cg.addColorStop(0, ink); cg.addColorStop(1, `rgba(${inkRGB},0.55)`);
    r.fillStyle = cg;
    K.rock(r, R, [[-12, Y.ey + 12], [-12, pt + u * 0.04], [px - u * 0.07, pt + u * 0.01], [px - u * 0.02, pt - u * 0.008], [px + u * 0.05, pt + u * 0.004], [px + u * 0.08, pt + u * 0.06], [px + u * 0.1, pt + u * 0.17], [px + u * 0.13, Y.ey + 12]], u * 0.01);
    r.fillStyle = ink;
    r.save(); if (L) r.strokeStyle = 'rgba(0,0,0,0.45)'; else { r.globalCompositeOperation = 'destination-out'; r.strokeStyle = 'rgba(0,0,0,0.3)'; } // clefts in the rock
    for (let i = 0; i < 5; i++) { let x = px + u * (0.07 - i * 0.03 + R() * 0.02), y = pt + u * (0.02 + R() * 0.04); r.lineWidth = Math.max(1, u * (0.002 + R() * 0.003)); r.beginPath(); r.moveTo(x, y); for (let k = 0; k < 3; k++) { x += u * (R() * 0.02 - 0.006); y += u * (0.02 + R() * 0.04); r.lineTo(x, y); } r.stroke(); }
    r.restore();
    pine(r, R, px + u * 0.01, pt + u * 0.004, u * 0.2, 0.55, z);
    const [rim, rm] = K.layer(W, H, q); // edges the moon catches
    rm.drawImage(rock, 0, 0, W, H);
    rm.globalCompositeOperation = 'destination-out'; rm.drawImage(rock, u * 0.0026, u * 0.0026, W, H);
    rm.globalCompositeOperation = 'source-in'; rm.fillStyle = '#c4cdea'; rm.fillRect(0, 0, W, H);

    // the platform: the theme's own background, flagstones laid in perspective, worn and moonlit
    const mask = new Path2D(), edge = [];
    for (let i = 0; i <= 64; i++) edge.push([-12 + ((W + 24) * i) / 64, Y.ey + (R() - 0.5) * u * 0.005 + Math.sin(i * 0.7) * u * 0.0015]);
    mask.moveTo(-12, H + 12); for (const [x, y] of edge) mask.lineTo(x, y); mask.lineTo(W + 12, H + 12); mask.closePath();
    const vx = W * 0.5, vy = Y.ey - u * 0.8, rows = 6, gap = Math.max(0.8, u * 0.0022) * (V.pv ? 0.6 : 1), spc = u * 0.11;
    const XP = (xe, y) => vx + ((xe - vx) * (y - vy)) / (Y.ey - vy);
    f.save(); f.clip(mask);
    for (let j = 0; j < rows; j++) {
      const y0 = Y.ey + (H - Y.ey) * Math.pow(j / rows, 1.5), y1 = Y.ey + (H - Y.ey) * Math.pow((j + 1) / rows, 1.5), off = (j % 2) * 0.5;
      for (let k = -Math.ceil(W / spc) - 2; k <= Math.ceil(W / spc) + 2; k++) {
        const xa = vx + (k + off + (R() - 0.5) * 0.2) * spc, xb = xa + spc * (0.85 + R() * 0.3);
        const pts = [[XP(xa, y0), y0], [XP(xb, y0), y0], [XP(xb, y1), y1], [XP(xa, y1), y1]];
        if (pts[1][0] < -20 || pts[0][0] > W + 20) continue;
        const ccx = (pts[0][0] + pts[2][0]) / 2, ccy = (y0 + y1) / 2, gg = gap * (0.6 + 0.4 * ((y1 - Y.ey) / (H - Y.ey)));
        const near0 = Math.hypot((ccx - Y.cx) / (u * 0.22), (ccy - Y.gyC) / (u * 0.06)); // stones by 천마 are broken
        if (near0 < 0.55 || R() < 0.07) continue;
        const a = (L ? 0.012 + R() * 0.024 : 0.014 + R() * 0.032) * (near0 < 1 ? 0.55 : 1) * (1 - 0.35 * (j / rows));
        f.fillStyle = L ? `rgba(${inkRGB},${a})` : `rgba(168,180,214,${a})`;
        f.beginPath();
        pts.forEach(([x, y], i) => { const dx = ccx - x, dy = ccy - y, l = Math.hypot(dx, dy) || 1; f[i ? 'lineTo' : 'moveTo'](x + (dx / l) * gg * 1.4, y + (dy / l) * gg); });
        f.closePath(); f.fill();
        if (R() < 0.12) { // a crack across the stone
          f.strokeStyle = `rgba(${inkRGB},${L ? 0.2 : 0.5})`; f.lineWidth = Math.max(0.6, u * 0.0012);
          let x = lerp(pts[0][0], pts[1][0], R()), y = y0 + gg; f.beginPath(); f.moveTo(x, y);
          for (let s = 0; s < 3; s++) { x += (R() - 0.5) * spc * 0.4; y += (y1 - y0) * 0.3; f.lineTo(x, y); }
          f.stroke();
        }
      }
    }
    // the crater under 천마: broken stones, cracks running out from it (they glow when his qi pulses)
    const cracks = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + (R() - 0.5) * 0.4, len = u * (0.07 + R() * 0.16), pts = [[Y.cx + Math.cos(a) * u * 0.03, Y.gyC + Math.sin(a) * u * 0.008]];
      let x = pts[0][0], y = pts[0][1];
      for (let s = 1; s <= 5; s++) { const aa = a + (R() - 0.5) * 0.7; x += Math.cos(aa) * len / 5; y += Math.sin(aa) * len / 5 * 0.24; pts.push([x, y]); }
      cracks.push(pts);
    }
    f.strokeStyle = `rgba(${inkRGB},${L ? 0.35 : 0.75})`;
    for (const c of cracks) { f.lineWidth = Math.max(0.8, u * 0.0022); f.beginPath(); c.forEach(([x, y], i) => f[i ? 'lineTo' : 'moveTo'](x, y)); f.stroke(); }
    for (let i = 0; i < 16; i++) { // shards of the stones that were there
      const a = R() * TAU, d = u * (0.04 + R() * 0.14), x = Y.cx + Math.cos(a) * d, y = Y.gyC + Math.sin(a) * d * 0.25, s = u * (0.008 + R() * 0.012);
      f.fillStyle = L ? `rgba(${inkRGB},${0.05 + R() * 0.06})` : `rgba(168,180,214,${0.025 + R() * 0.035})`;
      K.rock(f, R, [[x - s, y], [x - s * 0.3, y - s * 0.35], [x + s, y - s * 0.2], [x + s * 0.6, y + s * 0.3]], s * 0.2);
    }
    f.restore();
    // the lip of the far edge, grass along it
    f.strokeStyle = `rgba(${inkRGB},${L ? 0.42 : 0.8})`; f.lineCap = 'round';
    for (let i = 0; i < edge.length - 1; i++) { if (R() < 0.1) continue; f.lineWidth = Math.max(1, u * (0.004 + R() * 0.003)); f.beginPath(); f.moveTo(edge[i][0], edge[i][1]); f.lineTo(edge[i + 1][0], edge[i + 1][1]); f.stroke(); }
    f.lineWidth = Math.max(0.7, u * 0.0014);
    for (let i = 0; i < 40; i++) {
      const k = R(), x = -12 + (W + 24) * k, y = Y.ey + Math.sin(k * 64 * 0.7) * u * 0.0015 + 1, hh = u * (0.006 + R() * 0.012);
      if (Math.abs(x - Y.cx) < u * 0.12) continue;
      for (let s = -1; s <= 1; s++) { f.beginPath(); f.moveTo(x + s * u * 0.003, y); f.quadraticCurveTo(x + s * u * 0.004, y - hh * 0.6, x + s * u * 0.007 - u * 0.003, y - hh); f.stroke(); }
    }

    // near: rocks at the bottom right corner, a few weeds
    n.fillStyle = ink; n.strokeStyle = ink;
    K.rock(n, R, [[W + 12, H + 12], [W + 12, H - u * 0.07], [W - u * 0.06, H - u * 0.055], [W - u * 0.12, H - u * 0.02], [W - u * 0.16, H + 12]], u * 0.01);
    K.rock(n, R, [[W - u * 0.15, H + 12], [W - u * 0.17, H - u * 0.022], [W - u * 0.2, H - u * 0.018], [W - u * 0.22, H + 12]], u * 0.006);
    n.lineWidth = Math.max(0.8, u * 0.0016);
    for (let i = 0; i < 9; i++) { const x = W - u * (0.04 + R() * 0.16), hh = u * (0.02 + R() * 0.035); n.beginPath(); n.moveTo(x, H - u * 0.02); n.quadraticCurveTo(x - hh * 0.1, H - u * 0.02 - hh * 0.6, x - hh * (0.25 + R() * 0.3), H - u * 0.02 - hh); n.stroke(); }

    const crackPath = new Path2D();
    for (const c of cracks) c.forEach(([x, y], i) => crackPath[i ? 'lineTo' : 'moveTo'](x, y));
    const feather = (c, al) => { // ink soaked into the paper round every shape: a soft halo (built once)
      const tc = K.mk(c.width, c.height), x = c.getContext('2d'), r = (c.width / W) * 1.4; tc.getContext('2d').drawImage(c, 0, 0);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-over';
      for (let i = 0; i < 12; i++) { const th = i * 2.4, rr = r * (i < 6 ? 1 : 2.1); x.globalAlpha = al * (i < 6 ? 1 : 0.6); x.drawImage(tc, Math.cos(th) * rr, Math.sin(th) * rr); }
      x.restore();
    };
    if (!V.pv) { feather(back, 0.03 * HJ); feather(rock, (L ? 0.05 : 0.04) * HJ); }
    return { back, rock, rim, floor, near, mask, crackPath, Y };
  }

  /* ---------- the cast and its state ---------- */
  const CAST = [
    { type: 'beggar', off: 0, row: 1 },
    { type: 'taoist', off: 0.1, row: 0 },
    { type: 'master', off: 0.2, row: 2 },
    { type: 'woman', off: 0.295, row: 0, down: 1 },
    { type: 'monk', off: 0.4, row: 1, down: 1 },
  ];
  const NSW = 12; // swords in his halo

  function init(V, S) {
    const { W, H, u } = V, pv = V.pv, Y = S.Y;
    const heroes = CAST.map((c, i) => ({ ...c, i, x0: Y.gx - u * c.off, dx: 0, vx: 0, rec: 0, recT: 0, grd: 0, grdHold: 0, knl: c.down ? 1 : 0, knlHold: c.down ? 60 + RND() * 160 : 0, cnt: 0, cntHold: 0, shake: 0, lit: 0, ph: i * 1.9 + RND(), pose: P({}), hit: [0, 0], head: [0, 0], lastHit: -150 * i }));
    const tufts = [];
    for (let i = 0; i < (pv ? 6 : 20); i++) { const k = RND(); tufts.push({ x: Y.gx - u * 0.55 + RND() * (Y.cx - Y.gx + u * 0.8), y: lerp(Y.ey + u * 0.014, H - u * 0.01, k * k), h: u * (0.011 + RND() * 0.013) * (0.6 + 0.7 * k), fl: 0, ph: RND() * TAU }); }
    return {
      kind: 'cheonma', key: S.key, t: 0, rot: RND() * TAU, next: pv ? 20 : 50, domCd: pv ? 150 : 240 + RND() * 200, last: -1, gust: 0, flare: 0, hitAura: 0, hitAng: 0, dom: null, press: null, trem: 0, lastUlt: '', chCd: pv ? 1e9 : 260 + RND() * 260, chI: 0, chOrd: [0, 1, 2, 3, 4].sort(() => RND() - 0.5), shat: [], lost: null, ghosts: null, slash: null, shield: null, dome: null,
      q: 0, qrip: [], qtong: [], qmote: [], focF: null, palm: [],
      heroes, tufts, sw: Array.from({ length: NSW }, (_, i) => ({ i, st: 'ring', k: 0, x: 0, y: 0, a: 0, fl: 1, z: -1, tr: [] })),
      dm: { cmd: 0, cmdT: 0, tx: 0, ty: 0, hold: 0, spr: 0, up: 0, dn: 0 },
      sparks: [], dust: [], chips: [], rings: [], flashes: [], bolts: [], retal: null, glint: null,
      leaves: Array.from({ length: pv ? 6 : 12 }, () => ({ a: RND() * TAU, r: 0.25 + RND() * 1.05, z: RND(), ph: RND() * TAU, sp: 0.05 + RND() * 0.08, s: u * (0.005 + RND() * 0.004), c: RND() < 0.3 })),
      smoke: Array.from({ length: pv ? 5 : 9 }, () => ({ k: RND(), x: (RND() - 0.5) * 0.3, y: 0.3 - RND() * 0.8, sp: 0.006 + RND() * 0.006, s: 0.7 + RND() * 0.6 })),
      flames: Array.from({ length: pv ? 4 : 8 }, () => ({ k: RND(), x: (RND() - 0.5) * 0.32, y: 0.1 - RND() * 0.5, sp: 0.011 + RND() * 0.01, s: 0.6 + RND() * 0.6 })),
      motes: Array.from({ length: pv ? 4 : 10 }, () => ({ k: RND(), a: RND() * TAU, sp: 0.006 + RND() * 0.01, r: 0.4 + RND() * 0.6 })),
      debris: Array.from({ length: pv ? 4 : 8 }, () => ({ k: RND(), a: RND() * TAU, d: 0.3 + RND() * 0.7, sp: 0.0016 + RND() * 0.0026, s: 0.5 + RND() * 1, rot: RND() * TAU })),
      stars: Array.from({ length: pv ? 8 : 22 }, () => ({ x: RND() * W, y: RND() * H * 0.5, r: (0.4 + RND() * 0.8) * V.z, ph: RND() * TAU })),
    };
  }

  /** Where halo slot i is now: position and the angle of a sword there (its point outward); the halo stands behind him. */
  function slot(st, R, i, o) {
    const a = st.rot + (i * TAU) / NSW, rr = R.r * (1 + 0.02 * Math.sin(st.t * 0.045 + i * 1.7) + 0.05 * st.flare), tw = st.trem * R.u * 0.0022 * Math.sin(st.t * 2.7 + i * 2.1);
    o.x = R.cx + Math.cos(a) * rr + tw; o.y = R.cy + Math.sin(a) * rr * R.k + tw * 0.6;
    o.a = Math.atan2(Math.sin(a) * R.k, Math.cos(a)) + 0.07 * Math.sin(i * 2.3); o.fl = 1; o.z = -1;
    return o;
  }
  /**
   * The way home for a blade: up and round onto a circle that clears his outline (st.oc, st.ro), along it to the angle
   * of its place, then in, hilt first, drawn behind him from there (s.lay 0). Places on his left are entered straight
   * from the circle; the rest are reached along it, over his head or under his feet, whichever is shorter.
   */
  const orbP = (sl, phi, r, o) => { o.x = sl.oc[0] + Math.cos(phi) * r; o.y = sl.oc[1] + Math.sin(phi) * r * 0.92; return o; };
  const orbA = (sl, x, y) => Math.atan2((y - sl.oc[1]) / 0.92, x - sl.oc[0]);
  const HO = {}, HP = {};
  function planHome(st, s, u, dur) {
    slot(st, st.R, s.i, HO);
    const ps = ((orbA(st, HO.x, HO.y) % TAU) + TAU) % TAU, lo = Math.PI * 0.55, hi = Math.PI * 1.45;
    let pe = ps;
    if (ps < lo || ps > hi) { const upw = ps > hi ? ps - hi : ps + TAU - hi, dnw = ps < lo ? lo - ps : lo + TAU - ps; pe = upw < dnw ? hi : lo; }
    let g = null;
    if (s.vg) { // a volley comes home as a flight: the first sets the route, the rest follow it a beat apart into the places beside
      g = st.vgr && st.vgr.id === s.vg ? st.vgr : null;
      if (!g) {
        g = st.vgr = { id: s.vg, pe, ord: new Map(), tA: 0 };
        st.sw.filter((w) => w.vg === s.vg).map((w) => { slot(st, st.R, w.i, HP); return [Math.abs(wrap(orbA(st, HP.x, HP.y) - pe)), w]; }).sort((a, b) => b[0] - a[0]).forEach(([, w], r) => g.ord.set(w.i, r));
      }
      pe = g.pe;
    }
    s.pe = pe; s.dl = wrap(ps - pe); orbP(st, pe, st.ro, HP);
    let tx, ty; if (Math.abs(s.dl) > 0.05) { const sg = s.dl > 0 ? 1 : -1; tx = -Math.sin(pe) * sg; ty = Math.cos(pe) * 0.92 * sg; } else { tx = -Math.cos(pe); ty = -Math.sin(pe) * 0.92; } // along the circle, or in from outside it
    const tl = Math.hypot(tx, ty) || 1, d = Math.hypot(HP.x - s.x, HP.y - s.y), cl = Math.min(u * 0.22, d * 0.5);
    s.q = [s.x, s.y, s.x + u * 0.03, s.y - u * 0.3, HP.x - (tx / tl) * cl, HP.y - (ty / tl) * cl, HP.x, HP.y, s.a];
    s.D = dur ? Math.max(12, dur * 0.6) : Math.max(14, Math.min(34, d / (u * 0.024)));
    if (g) { if (!g.tA) g.tA = st.t + s.D; s.D = Math.max(10, g.tA + (g.ord.get(s.i) || 0) * 2.5 - st.t); }
    s.D2 = 8 + Math.abs(s.dl) * 7; s.k = 0;
  }
  function homeA(st, s) { // up and round to the circle
    s.k++; const e = Math.min(1, s.k / s.D), q = s.q;
    s.x = bez(q[0], q[2], q[4], q[6], e); s.y = bez(q[1], q[3], q[5], q[7], e);
    const ta = Math.atan2(bezD(q[1], q[3], q[5], q[7], Math.max(0.02, e)), bezD(q[0], q[2], q[4], q[6], Math.max(0.02, e)));
    s.a = e < 0.15 ? turn(q[8], ta, e / 0.15) : ta; s.fl = 1; s.lay = 1;
    return e >= 1;
  }
  function homeB(st, s) { // along it, then in to its place
    s.k++; slot(st, st.R, s.i, HO);
    let dl = wrap(orbA(st, HO.x, HO.y) - s.pe); if (dl * s.dl < 0 && Math.abs(dl) > 2) dl += s.dl > 0 ? TAU : -TAU;
    const e = Math.min(1, s.k / s.D2), ee = 1 - (1 - e) * (1 - e), dir = Math.abs(s.dl) <= 0.05, inn = dir ? ss(e) : ss((e - 0.55) / 0.45), ph = s.pe + dl * ee;
    orbP(st, ph, st.ro, HP); s.x = lerp(HP.x, HO.x, inn); s.y = lerp(HP.y, HO.y, inn);
    const sg = s.dl >= 0 ? 1 : -1, ta = dir ? Math.atan2(-Math.sin(ph) * 0.92, -Math.cos(ph)) : Math.atan2(Math.cos(ph) * 0.92 * sg, -Math.sin(ph) * sg);
    s.a = turn(ta, HO.a, ss((e - (dir ? 0 : 0.2)) / 0.6)); s.fl = 1; s.lay = inn > 0.35 ? 0 : 1;
    return e >= 1;
  }
  const bez = (p0, p1, p2, p3, k) => { const m = 1 - k; return m * m * m * p0 + 3 * m * m * k * p1 + 3 * m * k * k * p2 + k * k * k * p3; };
  const bezD = (p0, p1, p2, p3, k) => { const m = 1 - k; return 3 * m * m * (p1 - p0) + 6 * m * k * (p2 - p1) + 3 * k * k * (p3 - p2); };

  /** Send a sword at hero h: 'clash' (blocked: sparks), 'ground' (stabs the floor at their feet), 'graze' (skims past). */
  function strike(st, h, kind, pw, aimDur, retDur) {
    let best = null, bd = 9;
    const R = st.R, tx = h.hit[0], ty = h.hit[1], o = {};
    for (const s of st.sw) {
      if (s.st !== 'ring') continue;
      slot(st, R, s.i, o);
      const d = Math.abs(wrap(o.a - Math.atan2(ty - o.y, tx - o.x))); // the one already pointing their way
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    const dz = dazed(h); // still reeling from the last blow: it hangs a moment longer, so they can get a guard up from where they are
    let tg = h, cov = 0, dur = (aimDur || 13 + RND() * 9) + 9 * dz;
    if ((h.noWpn || dz > 0.55) && !h.ch && kind !== 'graze') { // one who cannot defend: another steps in front, or the old master's palm turns it aside
      const able = st.heroes.filter((a) => a !== h && !a.ch && !a.noWpn && dazed(a) < 0.3 && !(a.cvT > 0) && !a.dg && (a.fo || 0) < 0.2 && a.tgtT !== st.t && !a.thr);
      if (able.length) {
        const ms = able.find((a) => a.type === 'master'), hx0 = h.X === undefined ? h.x0 : h.X;
        if (ms && (RND() < 0.4 || able.length === 1)) cov = 2;
        else { tg = able.sort((a, b) => Math.abs((a.X === undefined ? a.x0 : a.X) - hx0) - Math.abs((b.X === undefined ? b.x0 : b.X) - hx0))[0]; cov = 1; slot(st, R, best.i, o); const tq = (tg.hit[1] - o.y) / ((h.hit[1] - o.y) || 1), lx = o.x + (h.hit[0] - o.x) * tq, off = tg.hit[0] - (tg.X === undefined ? tg.x0 : tg.X); tg.cvx = clamp(lx - off, hx0 + h.sz * 0.12, hx0 + h.sz * 0.7); tg.cvT = dur + 70; } // (into the blade's line, in front of them)
        kind = 'clash'; dur = Math.max(dur, 22); h.grdHold = Math.max(h.grdHold, dur + 40); // the one protected still flinches and gets their arms up
      }
    } else if ((h.type === 'woman' || h.type === 'beggar') && kind !== 'graze' && h.grd < 0.55 && dz < 0.45 && !h.noWpn && RND() < 0.4) kind = 'dodge'; // not braced, and quick on their feet: out of its way
    Object.assign(best, { st: 'aim', k: 0, dur, h: tg, kind, pw: pw || 0.85 + RND() * 0.3, tr: [], side: RND() < 0.5 ? -1 : 1, retDur: retDur || 0, vg: aimDur ? st.t : 0, cov: cov === 2 ? st.heroes.find((a) => a.type === 'master') : null, pt: cov ? h : null, knk: 0 });
    st.dm.cmdT = 1; st.dm.hold = Math.max(st.dm.hold, 22); st.dm.tx = tx; st.dm.ty = ty; // a flick of two fingers
    st.last = h.i; h.lastHit = st.t; tg.tgtT = st.t;
    if (kind !== 'dodge' && (kind !== 'graze' || dz > 0.3)) tg.grdHold = Math.max(tg.grdHold, (aimDur || 22) + (kind === 'graze' ? 22 : 34) + 12 * dz); // they see it coming: the guard goes up
    return true;
  }
  /** Several at once, one at each of several heroes, launched a beat apart; they come back together. */
  function volley(st, n) {
    const used = [], rd = 46 + RND() * 10;
    for (let k = 0; k < n; k++) {
      const c = st.heroes.filter((h) => !used.includes(h) && !h.ch);
      if (!c.length) break;
      const h = c[(RND() * c.length) | 0];
      used.push(h);
      strike(st, h, kindOf(), 0.75 + RND() * 0.3, 20 + k * 4, rd + k * 3);
    }
    if (!used.length) return;
    const g = used.reduce((a, h) => [a[0] + h.hit[0] / used.length, a[1] + h.hit[1] / used.length], [0, 0]);
    st.dm.tx = g[0]; st.dm.ty = g[1]; st.dm.hold = 34;
  }

  function chooseHero(st, avoid) {
    const c = st.heroes.filter((h) => h.i !== st.last && h.i !== avoid && !h.ch);
    const w = c.map((h) => (h.knl > 0.5 ? 0.4 : 1) * Math.min(2.5, 0.4 + (st.t - (h.lastHit || 0)) / 250)); // those left alone a while are due
    let r = RND() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) return c[i]; }
    return c[0];
  }
  const kindOf = () => { const r = RND(); return r < 0.52 ? 'clash' : r < 0.84 ? 'ground' : 'graze'; };

  function hit(st, h, pw, kind, u) {
    h.shake = 1; h.lit = kind === 'press' ? 0.5 : 1; h.cntHold = 0; h.fat = Math.min(1, (h.fat || 0) + (kind === 'graze' ? 0.05 : 0.14));
    if (kind === 'absorb') { h.vx -= u * 0.013; h.recT = 1.2; h.knlHold = Math.max(h.knlHold, 110 + RND() * 50); h.grdHold = Math.max(h.grdHold, 70); h.fat = Math.min(1, (h.fat || 0) + 0.2); return; } // thrown down by the crushed orb
    if (kind === 'divert') { h.vx -= u * (0.005 + RND() * 0.004); h.recT = 0.85; h.grdHold = Math.max(h.grdHold, 95); if (pw > 1) h.knlHold = Math.max(h.knlHold, 80 + RND() * 50); return; } // the spearhead turned aside: thrown back, the guard still up
    if (kind === 'press') { h.vx -= u * 0.0065; h.recT = Math.min(1.2, h.recT + 0.7); h.knlHold = Math.max(h.knlHold, 110 + RND() * 80); h.grdHold = Math.max(h.grdHold, 70); return; } // driven down by the weight of his qi alone
    h.vx -= pw * (kind === 'clash' ? 1 : kind === 'ground' ? 0.5 : 0.25) * u * 0.0105 * (1 + h.dx / (u * 0.12)); // the farther back, the harder they dig in
    h.recT = Math.min(1.2, h.recT + pw * (kind === 'graze' ? 0.45 : 1));
    if (kind === 'ground' || kind === 'graze' || (kind === 'clash' && RND() < 0.35)) h.grdHold = Math.max(h.grdHold, 22 + RND() * 30);
    if ((h.rec > 0.4 && pw > 0.6 && kind !== 'graze') || pw > 1.05 || (kind === 'clash' && RND() < 0.25)) h.knlHold = Math.max(h.knlHold, 60 + RND() * 90);
  }

  function burst(st, x, y, n, sp, dir, spread, col, V) {
    const u = V.u, m = (V.pv ? 0.5 : 1) * (st.q >= 1 ? 0.65 : 1);
    for (let i = 0; i < Math.round(n * m); i++) {
      if (st.sparks.length > 110) st.sparks.shift();
      const a = dir + (RND() - 0.5) * spread, v = u * sp * (0.3 + RND() * 0.9);
      st.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 10 + RND() * 16, col });
    }
  }
  function dust(st, x, y, n, V, spd, rise) {
    const u = V.u;
    for (let i = 0; i < (V.pv ? Math.ceil(n / 2) : st.q >= 1 ? Math.ceil(n * 0.65) : n); i++) {
      if (st.dust.length > 40) st.dust.shift();
      const a = RND() * TAU;
      st.dust.push({ x: x + (RND() - 0.5) * u * 0.02, y: y - RND() * u * 0.006, vx: Math.cos(a) * u * spd * (0.4 + RND()), vy: -u * rise * (0.2 + RND()), r: u * (0.012 + RND() * 0.016), life: 0, max: 30 + RND() * 30 });
    }
  }
  /** Whether (x, y) lies in hero h's body: a capsule from just above the feet to the head, padded by pad × their size. */
  function inHull(h, x, y, pad) {
    if (h.X === undefined || h.ch) return false;
    const s = h.sz, ax = h.X, ay = h.Yg - s * 0.12, vx = h.head[0] - ax, vy = h.head[1] - ay, l2 = vx * vx + vy * vy || 1, q = clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1), dx = x - ax - vx * q, dy = y - ay - vy * q, r = s * (0.09 + (pad || 0));
    return dx * dx + dy * dy < r * r;
  }
  const atWeapon = (h, x, y) => Math.hypot(x - h.hit[0], y - h.hit[1]) < h.sz * 0.15;
  /** Never into a body: a blade that would meet a hero anywhere but their weapon is parried there, late and shaky; one stuck in the ground pulls itself out before anyone steps onto it. */
  function guardNet(st, s, V) {
    const u = V.u, Ls = u * 0.105, tx = s.x + Math.cos(s.a) * Ls * 0.5, ty = s.y + Math.sin(s.a) * Ls * 0.5;
    for (const hb of st.heroes) {
      if (hb.dg || hb.ch || !inHull(hb, tx, ty, s.st === 'stuck' ? 0.3 : 0.03) || (s.st !== 'stuck' && atWeapon(hb, tx, ty))) continue;
      if (s.st === 'stuck') { s.st = 'ret'; s.k = 0; s.q = null; return; }
      hb.grdHold = Math.max(hb.grdHold, 30); hb.shake = Math.max(hb.shake, 0.6); hb.thr = 1;
      s.x = hb.hit[0] - Math.cos(s.a) * Ls * 0.5; s.y = hb.hit[1] - Math.sin(s.a) * Ls * 0.5;
      burst(st, hb.hit[0], hb.hit[1], 8, 0.011, s.a + Math.PI, 2, 0, V); surge(st, s, hb.hit[0], hb.hit[1], s.a, V, 0.7);
      s.st = 'rebound'; s.k = 0; s.vx = u * (0.007 + RND() * 0.004); s.vy = -u * (0.012 + RND() * 0.006); s.spin = 0.4; s.q = null; return;
    }
  }
  const hideIn = (st, s, Ls) => { const tx = s.x + Math.cos(s.a) * Ls * 0.5, ty = s.y + Math.sin(s.a) * Ls * 0.5; return st.heroes.some((hb) => !hb.dg && inHull(hb, tx, ty, 0) && !atWeapon(hb, tx, ty)); };
  /** A blade of 천마일검 streaming past is kept off their bodies: pushed out of any it would cross. */
  function pushOut(st, s, Ls) {
    const tx = s.x + Math.cos(s.a) * Ls * 0.5, ty = s.y + Math.sin(s.a) * Ls * 0.5;
    for (const hb of st.heroes) {
      if (hb.ch || hb.X === undefined) continue;
      const z = hb.sz, ax = hb.X, ay = hb.Yg - z * 0.12, vx = hb.head[0] - ax, vy = hb.head[1] - ay, l2 = vx * vx + vy * vy || 1, q = clamp(((tx - ax) * vx + (ty - ay) * vy) / l2, 0, 1);
      const cx = ax + vx * q, cy = ay + vy * q, d = Math.hypot(tx - cx, ty - cy), r = z * 0.15;
      if (d < r) { const nx = d > 0.5 ? (tx - cx) / d : 0, ny = d > 0.5 ? (ty - cy) / d : -1; s.x += nx * (r - d + 1); s.y += ny * (r - d + 1); }
    }
  }
  /** How badly a hero is still reeling (down on a knee, thrown back, disarmed, worn out): 0..1. */
  const dazed = (h) => Math.min(1, Math.max(h.knl, h.rec * 0.9, h.noWpn ? 0.7 : 0, (h.fat || 0) * 0.5));
  /** The 마기 on a blade flares where it meets a guard: tongues of it curl off and a ripple runs out from the contact. */
  function surge(st, s, x, y, a, V, n) {
    n = n || 1; if (s) s.surge = 1;
    const u = V.u, m = Math.round((V.pv ? 3 : 7) * n * (st.q >= 1 ? 0.65 : 1));
    if (st.qrip.length > 9) st.qrip.shift();
    st.qrip.push({ x, y, life: 0, max: 14 + 5 * n, r: u * 0.011 * n, ph: RND() * TAU });
    for (let i = 0; i < m && i < 14; i++) { if (st.qtong.length > 30) st.qtong.shift(); const b = a + Math.PI + (RND() - 0.5) * 2.8, v = u * (0.003 + RND() * 0.005) * Math.sqrt(n); st.qtong.push({ x, y, vx: Math.cos(b) * v, vy: Math.sin(b) * v, c: (RND() - 0.5) * 0.35, life: 0, max: 10 + RND() * 10 }); }
  }
  /** 마기 left hanging in the air (천마일검's tunnel): black-red smoke that swirls, lingers a second and falls away as ash. */
  function smoke(st, x, y, u, vx, vy) {
    const a = st.smk || (st.smk = []); if (a.length > 34) a.shift();
    a.push({ x, y, vx, vy, r: u * (0.016 + RND() * 0.02), sw: (RND() - 0.5) * 0.3, rot: RND() * TAU, life: 0, max: 26 + RND() * 12 });
  }
  /** Pale qi left by a shield: motes drifting up as it dissolves (sh 0), slivers falling as it shatters (sh 1); spread sx × sy. */
  function motes(st, x, y, n, V, sh, sx, sy) {
    const u = V.u, m = Math.round(n * (V.pv ? 0.5 : 1) * (st.q >= 1 ? 0.65 : 1));
    for (let i = 0; i < m; i++) { if (st.qmote.length > 48) st.qmote.shift(); st.qmote.push({ x: x + (RND() - 0.5) * (sx || 0), y: y + (RND() - 0.5) * (sy || 0), vx: (RND() - 0.5) * u * (sh ? 0.006 : 0.0016), vy: sh ? -u * RND() * 0.004 : -u * (0.0006 + RND() * 0.0014), rot: RND() * TAU, life: 0, max: 18 + RND() * 16, sh }); }
  }

  /** His swords snap into a wall across the line of a charge, points out toward it. */
  function wallUp(st, h, c, Ls) {
    const o = {}, px = -Math.sin(c.th), py = Math.cos(c.th);
    const cand = st.sw.filter((w) => w.st === 'ring').map((w) => { slot(st, st.R, w.i, o); return [Math.abs(wrap(o.a - c.th)), w]; }).sort((a, b) => a[0] - b[0]).slice(0, 3);
    cand.forEach(([, w], j) => { const d = (j - 1) * Ls * 0.34; Object.assign(w, { st: 'wall', k: 0, h, wx: c.cx - Math.cos(c.th) * Ls * 0.3 + px * d, wy: c.cy - Math.sin(c.th) * Ls * 0.3 + py * d, wa: c.th + (j - 1) * 0.07 }); });
  }
  /** A charge breaks a body-length short of him: sparks, a ring of shattered qi, and his answer. */
  function repel(st, h, c, V, Y) {
    st.hs = Math.max(st.hs || 0, 0.7); st.hsp = [c.cx, c.cy];
    const u = V.u, x = c.cx, y = c.cy, back = Math.atan2(y - st.R.cy, x - st.R.cx);
    burst(st, x, y, 16, 0.013, back, 2.2, 1, V); burst(st, x, y, 10, 0.01, back, 1.6, 0, V);
    st.flashes.push({ x, y, r: u * 0.04, life: 0, max: 6, c: 1 }); st.shat.push({ x, y, life: 0 });
    for (const w of st.sw) if (w.st === 'wall' && w.h === h) w.surge = 1;
    surge(st, null, x, y, back + Math.PI, V, 1.2);
    if (c.def === 'aura') { st.hitAura = 1; st.hitAng = Math.atan2((y - st.R.cy) / st.R.k, x - st.R.cx); }
    else if (c.def === 'flick') { st.dm.cmdT = 1; st.dm.hold = 14; st.dm.tx = x; st.dm.ty = y; st.flashes.push({ x, y, r: u * 0.03, life: 0, max: 5 }); }
    if (c.lose && !st.lost) { h.noWpn = 1; st.lost = { h, type: GEAR[h.type].wpn, x, y, vx: -u * (0.006 + RND() * 0.006), vy: -u * (0.011 + RND() * 0.006), rot: RND() * TAU, vr: 0.4 + RND() * 0.25, life: 0, stuck: 0, gy: Y.rows[h.row] + u * 0.012 }; }
  }
  const spanOf = (st, u) => { const xs = st.heroes.map((h) => h.x0 + h.dx); return [Math.min(...xs) - u * 0.08, Math.max(...xs) + u * 0.06]; };
  /** 만검귀종: the halo opens, a sky full of ghost blades appears over them, then falls in a staggered rain. */
  /*
   * 만검귀종 is sent by a flick of his wrist: the arm raised high and held still while the sky fills, the sword-finger
   * pointing at the sky; then only the wrist snaps, the two fingers whipping forward and down in two or three frames,
   * past where they stop and back (a crisp stop), the arm giving a little with it. The first blades fall on the snap.
   */
  const RS = { s0: 58, aS: 0.72, SN: [0, 0.42, 1.14, 0.95, 1.02, 1] };
  const rainSnap = (rk) => { const i = rk - RS.s0; if (i <= 0) return 0; if (i >= RS.SN.length - 1) return 1; const f = Math.floor(i); return lerp(RS.SN[f], RS.SN[f + 1], i - f); };
  RS.rel = (() => { for (let k = RS.s0; k < RS.s0 + 6; k++) if (rainSnap(k) >= 0.5) return k; return RS.s0 + 2; })(); // the frame of the snap
  function rainStart(st, V, S) {
    const { u, H } = V, Y = S.Y, [x0, x1] = spanOf(st, u), n = V.pv ? 14 : st.q >= 1 ? 24 : 36;
    st.ghosts = Array.from({ length: n }, (_, i) => { const col = i % 12, row = (i / 12) | 0; return { x: lerp(x0, x1, (col + 0.25 + (row % 2) * 0.5) / 12) + (RND() - 0.5) * u * 0.015, y0: H * (0.1 + row * 0.075) + (RND() - 0.5) * u * 0.02, gy: lerp(Y.ey + u * 0.03, H - u * 0.03, RND()), tf: RS.rel + 1 + i * 0.6, a: Math.PI / 2 + (RND() - 0.5) * 0.16, y: 0, v: 0, k: 0, hit: 0 }; });
  }
  /**
   * Each ghost blade is given its mark when the sky fills: three in four go at a hero's weapon (or at the old master's
   * dome over himself and the one beside him), the rest at the stones between them. A blade that meets a guard rings
   * off it spinning and sticks in the ground beside them; the heroes look up and raise their guards before the first
   * one falls, give ground under each blow, and are driven down by the sheer number, still defending.
   */
  const steer = (st, g, u) => { for (const hb of st.heroes) if (!hb.ch && hb.X !== undefined && Math.abs(g.x - hb.X) < hb.sz * 0.55) g.x += (g.x < hb.X ? -1 : 1) * u * 0.006; }; // (a falling blade kept off bodies)
  function rainStep(st, V, S, d) {
    const u = V.u, Y = S.Y, Ls = u * 0.105;
    if (d.k === 20) {
      const hs = st.heroes.filter((h) => !h.ch);
      st.ghosts.forEach((g, i) => { g.h = i % 4 !== 3 && hs.length ? hs[i % hs.length] : null; });
      for (const g of st.ghosts) if (!g.h) { // a miss lands clear of all of them, or the nearest blocks it
        const clear = (x) => st.heroes.every((hb) => hb.X === undefined || Math.abs(x - hb.X) > hb.sz * 0.6);
        let x = null; for (let k = 1; k <= 16 && x === null; k++) for (const sd of [-1, 1]) { const c = g.x + sd * k * u * 0.018; if (x === null && clear(c)) x = c; }
        if (clear(g.x)) x = g.x;
        if (x !== null) g.x = x; else g.h = hs.slice().sort((a, b) => Math.abs(a.X - g.x) - Math.abs(b.X - g.x))[0] || null;
      }
      for (const h of hs) { h.grdHold = Math.max(h.grdHold, 175); h.rainHits = 0; }
      st.ghosts.slice().sort((a, b) => (b.h ? 1 : 0) - (a.h ? 1 : 0)).forEach((g, j) => { g.tf = j < 6 ? RS.rel : RS.rel + 1 + (j - 6) * 0.6 + RND() * 1.2; }); // a first wave with the stroke, the rest in a quick cascade after it
      const ms = hs.find((h) => h.type === 'master');
      if (ms) { const al = hs.filter((h) => h !== ms).sort((a, b) => Math.abs(a.x0 - ms.x0) - Math.abs(b.x0 - ms.x0))[0], mx = ms.x0 + ms.dx, ax = al ? al.x0 + al.dx : mx; st.dome = { h: ms, al, cx: (mx + ax) / 2, cy: Y.rows[ms.row], R: Math.max(Math.abs(mx - ax) / 2 + ms.sz * 0.45, ms.sz * 0.9), hits: 0, k: 0 }; }
    }
    if (d.k === RS.rel && st.dacc && st.dacc.hand) { const hx = S.Y.cx - st.dacc.hand[0] * S.Y.hc, hy = S.Y.hipY + st.dacc.hand[1] * S.Y.hc; for (let i = 0; i < (V.pv ? 2 : 4); i++) { if (st.qtong.length > 30) st.qtong.shift(); const b = Math.PI - RS.aS + (RND() - 0.5) * 0.7, v = u * (0.006 + RND() * 0.005); st.qtong.push({ x: hx, y: hy, vx: Math.cos(b) * v, vy: Math.sin(b) * v, c: (RND() - 0.5) * 0.3, life: 0, max: 8 + RND() * 5 }); } } // a flick of crimson qi off his fingertips
    for (const g of st.ghosts) {
      if (g.gone) continue;
      if (d.k < g.tf) { g.y = g.y0 + Math.sin(d.k * 0.08 + g.x) * u * 0.004 + Math.sin(d.k * 2.7 + g.x * 0.37) * u * 0.0016 * ss((d.k - 38) / 16); continue; } // hanging, points down, quivering harder as he holds
      if (g.hit) { g.k++; continue; }
      if (g.def) { // rung off a guard: spinning down into the stones beside them
        g.vy += u * 0.0011; g.x += g.vx; g.y += g.vy; g.a += g.spin; steer(st, g, u);
        if (g.y >= g.gy) { g.hit = 1; g.k = 0; g.y = g.gy; g.a = Math.PI / 2 + (RND() - 0.5) * 0.8; dust(st, g.x, g.gy, 1, V, 0.001, 0.0008); }
        continue;
      }
      if (g.fx0 === undefined) g.fx0 = g.x;
      g.v += u * 0.006; g.y += g.v + u * 0.012;
      if (!g.h) steer(st, g, u);
      const h = g.h, dm = h && st.dome && (h === st.dome.h || h === st.dome.al) ? st.dome : null;
      if (h) {
        const tx = dm ? h.x0 + h.dx : h.hit[0], ty = dm ? dm.cy - dm.R * 0.92 * Math.sqrt(Math.max(0, 1 - ((tx - dm.cx) / dm.R) ** 2)) : h.hit[1];
        g.x = lerp(g.fx0, tx, clamp((g.y - g.y0) / Math.max(1, ty - g.y0), 0, 1));
        if (g.y + Ls * 0.5 >= ty) { // it meets the guard (or the dome)
          const cx = tx, cy = ty;
          if (!d.first) d.first = d.k; // (the first blow)
          burst(st, cx, cy, 6, 0.01, -Math.PI / 2, 2.4, dm ? 1 : 0, V); st.flashes.push({ x: cx, y: cy, r: u * 0.022, life: 0, max: 4, c: dm ? 1 : 0 });
          g.def = 1; g.vx = u * (0.005 + RND() * 0.006); // rung off forward, away from the body behind the guard g.vy = -u * (0.006 + RND() * 0.004); g.spin = (RND() < 0.5 ? -1 : 1) * 0.35;
          g.gy = Y.rows[h.row] + (RND() - 0.3) * u * 0.02; g.y = cy - Ls * 0.5;
          g.surge = 1; surge(st, null, cx, cy, g.a, V, 0.6);
          if (dm) dm.hits++;
          h.prsHold = dm ? 4 : 8; h.vx -= u * (dm ? 0.001 : 0.0026); h.shake = Math.max(h.shake, dm ? 0.3 : 0.7); h.fat = Math.min(1, (h.fat || 0) + 0.04); h.rainHits = (h.rainHits || 0) + 1;
          if (!dm && (h.rainHits === 3 || h.rainHits === 6)) h.knlHold = Math.max(h.knlHold, 70); // driven to a knee, the guard still up
        }
      } else if (g.y >= g.gy) { if (!d.first) d.first = d.k; g.y = g.gy; g.hit = 1; g.k = 0; dust(st, g.x, g.gy, 1, V, 0.0012, 0.001); burst(st, g.x, g.gy - u * 0.004, 3, 0.006, -Math.PI / 2, 2, 0, V); } // into the stones between them
    }
    for (const g of st.ghosts) { // a ghost blade that would meet a body anywhere but at a guard dissolves (it is only his qi)
      if (g.surge) g.surge *= 0.88;
      if (g.gone || d.k < g.tf) continue;
      const tx = g.hit ? g.x + Math.cos(g.a) * Ls * 0.1 : g.x + Math.cos(g.a) * Ls * 0.5, ty = g.hit ? g.y + Math.sin(g.a) * Ls * 0.1 : g.y + Math.sin(g.a) * Ls * 0.5;
      if (st.heroes.some((hb) => inHull(hb, tx, ty, g.hit ? 0.12 : 0.04) && !((hb === g.h || g.def) && atWeapon(hb, tx, ty)))) g.gone = 1;
    }
    if (d.k > 178) { st.dom = null; st.ghosts = null; if (st.dome) st.dome.fade = 0; } // the dome holds a beat longer, then dissolves (update)
  }
  /**
   * 천마일검: the twelve leave the halo one after another, sweep round him (never across him) and pack into a
   * spearhead beside him, points at the heroes, their 마기 running together into one dark wake. It trembles while the
   * air at its point tightens, then crosses the gap in a few frames with a sonic boom. The five pool their strength
   * into one point before them, weapons crossed on it, and the point holds: a moment of stillness, a grinding clash,
   * then the spearhead splits on it and the swords stream past over their heads and along the ground, grazing, and
   * curve back high round the field into the halo.
   */
  /*
   * 압력 파동: he turns his palm down and presses it slowly through the air from his chest to his waist; the air thickens
   * (a dark haze settling over the field, leaves and stones stopping where they are, robes and hair pinned down, the
   * grass laid flat in a ring growing out from under him, the peaks squashed under the weight). When the palm reaches
   * the bottom a ring of 마기 slams out over the ground from beneath him, cracking the stones, throwing up a wall of dust,
   * an echo behind it; where it reaches them their shield breaks, their knees go and the ground caves under them.
   */
  const PRS = { turn: 12, slam: 34, rel: 56, end: 130 };
  const SL = { gat: 6, form: 44, dash: 58, hit: 62, grind: 66, split: 74, done: 240 }; // frames (about 30 a second)
  const FORM = [[0, 0], [0.24, 0.11], [0.24, -0.11], [0.42, 0], [0.48, 0.22], [0.48, -0.22], [0.66, 0.11], [0.66, -0.11], [0.72, 0.33], [0.72, -0.33], [0.88, 0.22], [0.88, -0.22]]; // back along the axis, across it (+: the upper side), in sword lengths
  const FOC = { beggar: 0.06, taoist: 0.025, woman: -0.06, monk: -0.1, master: -0.14 }; // where each closes in round the point (u, from the cluster's middle)
  function slashStart(st, V, S) {
    const u = V.u, Y = S.Y, F = [Y.gx - u * 0.037, Y.rows[1] - u * 0.068], A = [Y.cx - u * 0.31, Y.hipY + u * 0.2];
    const th = Math.atan2(F[1] - A[1], F[0] - A[0]), up = Math.cos(th) > 0 ? -1 : 1; // the side of the axis toward the sky
    const cy = Y.rows[1] - u * 0.012, x0 = A[0] + u * 0.01, x1 = F[0] + u * 0.01, crack = new Path2D(); // the stones that open under its path
    let x = x0, y = cy; crack.moveTo(x, y);
    while (x > x1) { x -= u * (0.008 + RND() * 0.014); y = cy + (RND() - 0.5) * u * 0.007; if (RND() < 0.18) crack.moveTo(x, y); else crack.lineTo(x, y); if (RND() < 0.35) { crack.lineTo(x - u * 0.012, y + (RND() < 0.5 ? -1 : 1) * u * (0.004 + RND() * 0.006)); crack.moveTo(x, y); } }
    const o = {}, mdx = st.heroes.reduce((a, h) => a + h.dx, 0) / st.heroes.length;
    for (const s of st.sw) if (s.st === 'aim') { slot(st, st.R, s.i, o); s.ox = s.x - o.x; s.oy = s.y - o.y; s.st = 'ring'; s.tr.length = 0; }
    const home = st.sw.filter((s) => s.st === 'ring'), away = st.sw.filter((s) => s.st !== 'ring');
    home.map((s) => { slot(st, st.R, s.i, o); return [Math.hypot(o.x - A[0], o.y - A[1]), s]; }).sort((a, b) => a[0] - b[0]).forEach(([, s], j) => ultJoin(s, j, SL.gat + j * 1.5));
    away.forEach((s, i) => { const r = [s.x, s.y, s.a]; ultJoin(s, home.length + i, 2 + i); s.rc = r; }); // still out on an attack: called straight back into the spearhead
    for (const h of st.heroes) h.ftx = F[0] + u * (FOC[h.type] - 0.105);
    st.focF = F;
    const nu = [-Math.sin(th) * up, Math.cos(th) * up];
    st.slash = { k: 0, F, F0: F.slice(), A, th, nu, rs: Math.cos(th) * nu[1] - Math.sin(th) * nu[0] > 0 ? 1 : -1, ys: Y.rows[0] + u * 0.03, crack, cx0: x0, cx1: x1, cy, mdx0: mdx, oc: [Y.cx + u * 0.03, Y.hipY - Y.hc * 0.1], ro: Y.hc, booms: [], tip: A.slice(), hitK: 0, streak: 0 };
  }
  const ultJoin = (s, j, t0) => Object.assign(s, { st: 'ult', ph: 'gat', j, k: 0, lay: 0, surge: 0, hot: 0, fb: FORM[j][0], fs: FORM[j][1], t0, D: 0, q: null, rico: 0, scr: 0, uj: undefined });
  function slashStep(st, V, S, d) {
    const u = V.u, sl = st.slash, k = d.k;
    sl.k = k;
    const mdx = st.heroes.reduce((a, h) => a + h.dx, 0) / st.heroes.length;
    sl.F[0] = sl.F0[0] + (mdx - sl.mdx0) * 0.8; // the point gives ground with them
    const dashE = (kk) => Math.pow(clamp((kk - SL.dash - 1) / (SL.hit - SL.dash - 1), 0, 1), 1.2), e = dashE(k); // (held two frames while the air breaks round it, then across in three)
    sl.tip[0] = lerp(sl.A[0], sl.F[0], e); sl.tip[1] = lerp(sl.A[1], sl.F[1], e);
    if (k > SL.dash - 18 && k < SL.dash) { // the air ahead of it tightening: dust on the stones beneath drawn in toward the point, the grass leaning in
      const pl = ss((k - SL.dash + 18) / 18), gx = sl.tip[0] + Math.cos(sl.th) * u * 0.04;
      if (k % 2 === 0) for (let i = 0; i < (V.pv ? 1 : 2); i++) { if (st.dust.length > 40) st.dust.shift(); const sd = RND() < 0.5 ? -1 : 1, x = gx + sd * u * (0.05 + RND() * 0.13); st.dust.push({ x, y: sl.cy + u * 0.004, vx: -sd * u * (0.002 + 0.003 * pl), vy: -u * 0.0008 * RND(), r: u * (0.008 + RND() * 0.01), life: 0, max: 16 + RND() * 10 }); }
      st.suck = { x: gx, k: pl };
    } else st.suck = null;
    if (k === 8) for (const h of st.heroes) h.grdHold = Math.max(h.grdHold, 160); // they see it forming, and close on one point
    if (k === 20) st.gust = Math.max(st.gust, 1.2);
    if (k === SL.dash) { // the break: a vapour cone round the spearhead, a thick shock ring bursting out and two more behind it, a bubble of shock running out over the sky; it holds there two frames
      const [ax, ay] = sl.A;
      sl.booms.push({ x: ax, y: ay, life: 0, max: 11, r0: u * 0.03, r1: u * 0.21, v: 2, rot: RND() * TAU, vi: 0 }, { x: ax, y: ay, life: -2, max: 12, r0: u * 0.03, r1: u * 0.28, v: 1, rot: RND() * TAU, vi: 1 }, { x: ax, y: ay, life: -4, max: 13, r0: u * 0.03, r1: u * 0.34, v: 1, rot: RND() * TAU, vi: 2 });
      sl.bub = { x: ax, y: ay, life: 0, max: 14, r1: u * 0.55 };
      sl.vc = 1; sl.hitK = 1; sl.streak = 1; st.gust = 2.8; st.hs = Math.max(st.hs || 0, 0.55); st.hsp = [ax, ay];
      burst(st, ax, ay, 28, 0.02, 0, TAU, 0, V); surge(st, null, ax, ay, sl.th + Math.PI, V, 1.6); // embers thrown out with the rings, tongues of 마기 off the break
      for (let i = 0; i < 6; i++) smoke(st, ax + (RND() - 0.5) * u * 0.04, ay + (RND() - 0.5) * u * 0.04, u, -Math.cos(sl.th) * u * 0.004, -Math.sin(sl.th) * u * 0.004);
      sl.tor = Array.from({ length: st.q >= 2 ? 4 : 7 }, () => [(RND() - 0.5) * 2, 0.35 + RND() * 0.6]); // streaks of air torn open down the tunnel behind it
      st.flashes.push({ x: ax, y: ay, r: u * 0.045, life: 0, max: 4, c: 1 });
      Object.assign(st.dm, { cmdT: 1, hold: 18, tx: sl.F[0], ty: sl.F[1] });
    }
    if (sl.vc > 0) { if (k <= SL.hit) { sl.vcx = sl.tip[0] - Math.cos(sl.th) * u * 0.105 * 0.7; sl.vcy = sl.tip[1] - Math.sin(sl.th) * u * 0.105 * 0.7; } else sl.vc = sl.vc > 0.03 ? sl.vc * 0.7 : 0; } // (the sheath rides with it to the point, then is left behind and thins)
    if (sl.vc > 0.3 && st.qtong.length < 30) for (let i = 0; i < 2; i++) { const c = Math.cos(sl.th), n = Math.sin(sl.th), sd = RND() < 0.5 ? -1 : 1, bx = sl.vcx - c * u * 0.1 - n * sd * u * 0.06, by = sl.vcy - n * u * 0.1 + c * sd * u * 0.06; st.qtong.push({ x: bx, y: by, vx: -c * u * 0.006 - n * sd * u * 0.003, vy: -n * u * 0.006 + c * sd * u * 0.003, c: (RND() - 0.5) * 0.4, life: 0, max: 9 + RND() * 6 }); } // black-red tongues peeling off the sheath's back edge
    if (sl.bub && ++sl.bub.life >= sl.bub.max) sl.bub = null;
    if (k > SL.dash + 1 && k <= SL.hit) { // across the gap: rings shed behind it, the mist on its path blown open, a sheet of dust and stones torn up off the stones beneath, the grass flattened in a running wave
      const e0 = dashE(k - 1), e1 = e, px = -Math.sin(sl.th), py = Math.cos(sl.th), many = st.q >= 1 || V.pv ? 3 : 5;
      for (const q of [0.33, 0.68]) if (q > e0 && q <= e1 && st.q < 3) sl.booms.push({ x: lerp(sl.A[0], sl.F[0], q), y: lerp(sl.A[1], sl.F[1], q), life: 0, max: 10, r0: u * 0.015, r1: u * 0.095, v: 0, rot: RND() * TAU, vi: (q * 3) | 0 });
      const xa = lerp(sl.A[0], sl.F[0], e0), xb = lerp(sl.A[0], sl.F[0], e1), ya = lerp(sl.A[1], sl.F[1], e0), yb = lerp(sl.A[1], sl.F[1], e1);
      for (let i = 0; i < many; i++) { if (st.dust.length > 40) st.dust.shift(); const q = RND(), sd = RND() < 0.5 ? -1 : 1, v = u * (0.004 + RND() * 0.004); st.dust.push({ x: lerp(xa, xb, q) + px * sd * u * 0.02, y: lerp(ya, yb, q) + py * sd * u * 0.02, vx: px * sd * v, vy: py * sd * v, r: u * (0.012 + RND() * 0.014), life: 0, max: 22 + RND() * 12 }); }
      for (let i = 0; i < many; i++) { if (st.dust.length > 40) st.dust.shift(); const a = RND() * TAU; st.dust.push({ x: lerp(xa, xb, RND()), y: sl.cy + u * 0.004, vx: Math.cos(a) * u * 0.002, vy: -u * 0.0045 * (0.4 + RND()), r: u * (0.012 + RND() * 0.016), life: 0, max: 30 + RND() * 24, blk: 1 }); } // a sheet of black dust torn up off the stones beneath
      for (let i = 0; i < (V.pv ? 2 : 4); i++) { const q = RND(); smoke(st, lerp(xa, xb, q) + (RND() - 0.5) * u * 0.02, lerp(ya, yb, q) + (RND() - 0.5) * u * 0.02, u, px * (RND() - 0.5) * u * 0.004, py * (RND() - 0.5) * u * 0.004); } // its 마기 left swirling in the tunnel
      for (let i = 0; i < (V.pv ? 1 : 3); i++) { if (st.chips.length > 30) st.chips.shift(); st.chips.push({ x: lerp(xa, xb, RND()), y: sl.cy, vx: (RND() - 0.5) * u * 0.006, vy: -u * (0.008 + RND() * 0.01), rot: RND() * TAU, vr: (RND() - 0.5) * 0.6, s: u * (0.0016 + RND() * 0.002), life: 0, gy: sl.cy + u * RND() * 0.01 }); }
      for (const tf of st.tufts) if (tf.x <= xa + u * 0.04 && tf.x >= xb - u * 0.04) tf.fl = 1;
    }
    if (k === SL.hit + 2) { // the shock arrives a beat after the blades: a second blast at the point, robes and hair snapped back, a ring of dust round their feet
      const [fx, fy] = sl.F, gy = S.Y.rows[1];
      sl.booms.push({ x: fx, y: fy, life: 0, max: 12, r0: u * 0.03, r1: u * 0.17, v: 2, rot: RND() * TAU, vi: 0, at: 1 }, { x: fx, y: fy, life: -2, max: 12, r0: u * 0.03, r1: u * 0.21, v: 1, rot: RND() * TAU, vi: 2, at: 1 });
      burst(st, fx, fy, 18, 0.016, sl.th + Math.PI, 2.6, 0, V); burst(st, fx, fy, 14, 0.014, sl.th + Math.PI, 2.2, 1, V); // his embers and their pale qi, thrown up together
      surge(st, null, fx, fy, sl.th, V, 1.6); motes(st, fx, fy, 8, V, 1, u * 0.02, u * 0.03); st.flashes.push({ x: fx, y: fy, r: u * 0.035, life: 0, max: 4, c: 1 });
      st.rings.push({ x: fx - u * 0.02, y: gy + u * 0.004, r: u * 0.04, life: 0, max: 30 }); dust(st, fx - u * 0.04, gy, 10, V, 0.004, 0.0016);
      st.gust = Math.max(st.gust, 3.4); st.hs = Math.max(st.hs || 0, 0.5); st.hsp = [fx, fy];
      for (const h of st.heroes) { h.shake = 1; h.recT = Math.min(1.2, h.recT + 0.25); }
    }
    if (k === SL.hit) { // the point holds
      st.hs = 1; st.hsp = sl.F.slice();
      const [fx, fy] = sl.F;
      st.flashes.push({ x: fx, y: fy, r: u * 0.05, life: 0, max: 6, c: 1 });
      burst(st, fx, fy, 16, 0.014, sl.th + Math.PI, 1.8, 0, V); burst(st, fx, fy, 10, 0.012, sl.th + Math.PI, 2.6, 1, V);
      surge(st, null, fx, fy, sl.th, V, 1.6);
      for (const s of st.sw) if (s.st === 'ult') s.surge = 1;
      for (const h of st.heroes) { h.shake = 1; h.prsHold = 3; h.lit = 1; }
      st.gust = Math.max(st.gust, 2);
    }
    if (k > SL.hit && k < SL.split) { // pressed on the point: feet give, knees buckle; from SL.grind sparks pour off it
      for (const h of st.heroes) { h.prsHold = 2; h.shake = Math.max(h.shake, 0.4); if (k >= SL.grind) h.vx = Math.min(h.vx, -u * 0.0011); }
      if (k >= SL.grind) {
        burst(st, sl.F[0], sl.F[1], 3, 0.012, sl.th + Math.PI, 1.6, 0, V); if (k % 2) burst(st, sl.F[0], sl.F[1], 1, 0.01, sl.th + Math.PI, 2.4, 1, V);
        for (const s of st.sw) if (s.st === 'ult') s.surge = Math.max(s.surge, 0.7);
        if (k % 4 === 2) surge(st, null, sl.F[0], sl.F[1], sl.th, V, 1);
      }
    }
    if (k === SL.split) { // and they turn it aside, barely
      const [fx, fy] = sl.F;
      st.flashes.push({ x: fx, y: fy, r: u * 0.06, life: 0, max: 7, c: 1 });
      burst(st, fx, fy, 14, 0.016, sl.th + Math.PI, 2.6, 1, V);
      surge(st, null, fx, fy, sl.th, V, 1.4);
      motes(st, fx, fy, 9, V, 1, u * 0.02, u * 0.03); // splinters of the point
      st.heroes.filter((h) => !h.ch).sort((a, b) => b.x0 - a.x0).forEach((h, i) => hit(st, h, i < 2 ? 1.1 : 0.8, 'divert', u)); // the two in front take the most of it
      st.gust = Math.max(st.gust, 2.2);
    }
    sl.hitK *= 0.985; if (k > SL.hit) sl.streak *= 0.8;
    for (const b of sl.booms) b.life++;
    sl.booms = sl.booms.filter((b) => b.life < b.max);
    if ((k > SL.split + 4 && st.sw.every((s) => s.st !== 'ult')) || k > SL.done) { for (const s of st.sw) if (s.st === 'ult') { s.st = 'ring'; s.tr.length = 0; } st.dom = null; st.slash = null; }
  }
  /** One of the twelve through 천마일검: s.x, s.y, s.a; s.lay 0 while it is drawn in the halo, behind him. */
  const UO = {}, UP = {}, UQ = {};
  function ultSword(st, s, V) {
    const sl = st.slash, u = V.u, Ls = u * 0.105, k = sl.k, R = st.R, c = Math.cos(sl.th), n = Math.sin(sl.th);
    const formAt = (q) => { // its place in the spearhead
      let back = s.fb;
      if (k >= SL.grind) back *= 1 - 0.2 * ss((k - SL.grind) / 6); // those behind crowd in on the point
      const tr = (k < SL.dash ? u * 0.0026 * ss((k - SL.form + 8) / 12) * (1 + 1.6 * ss((k - SL.dash + 10) / 10)) : k <= SL.dash + 1 ? u * 0.004 : k > SL.hit + 3 ? u * 0.0016 : 0) * Math.sin(st.t * 2.9 + s.j * 1.7); // (shuddering hardest as the air breaks)
      q.x = sl.tip[0] - c * Ls * (0.5 + back) + sl.nu[0] * (Ls * s.fs + tr); q.y = sl.tip[1] - n * Ls * (0.5 + back) + sl.nu[1] * (Ls * s.fs + tr);
      q.a = sl.th + sl.rs * s.fs * 0.2; return q; // fanned a little, points forward
    };
    const at = (e, q) => { // gathering: out of its slot, round the circle that clears him, into its place
      slot(st, R, s.i, UO); formAt(UP);
      const out = ss(e / 0.3), inn = ss((e - 0.62) / 0.38);
      if (s.ox) { UO.x += s.ox * (1 - out); UO.y += s.oy * (1 - out); } // (one that was already aiming starts from there)
      orbP(sl, s.p0 + s.dl * ss(e), sl.ro * (1 + 0.03 * (s.j % 3)), q);
      q.x = lerp(lerp(UO.x, q.x, out), UP.x, inn); q.y = lerp(lerp(UO.y, q.y, out), UP.y, inn); q.out = out; q.inn = inn; return q;
    };
    if (s.ph === 'gat' && s.rc) { // called back from an attack: straight in, fast, round behind its place
      formAt(UP);
      if (!s.D) { const d = Math.hypot(UP.x - s.rc[0], UP.y - s.rc[1]); s.D = Math.max(10, Math.min(28, d / (u * 0.04))); }
      const e = clamp((k - s.t0) / s.D, 0, 1), q = s.rc, px0 = s.x, py0 = s.y;
      s.x = bez(q[0], q[0] + Math.cos(q[2]) * u * 0.06, UP.x - c * Ls * 1.3, UP.x, e); s.y = bez(q[1], q[1] + Math.sin(q[2]) * u * 0.06 - u * 0.12, UP.y - n * Ls * 1.3, UP.y, e);
      const ta = Math.hypot(s.x - px0, s.y - py0) > 0.3 ? Math.atan2(s.y - py0, s.x - px0) : s.a;
      s.a = turn(ta, UP.a, ss((e - 0.6) / 0.4)); s.fl = 1; s.lay = 1; s.hot = 0;
      if (e >= 1) { s.ph = 'form'; s.rc = null; }
    } else if (s.ph === 'gat') {
      if (k < s.t0) { slot(st, R, s.i, s); if (s.ox) { s.x += s.ox; s.y += s.oy; } s.lay = 0; return; } // still in the halo
      if (!s.D) { slot(st, R, s.i, UO); formAt(UP); s.p0 = orbA(sl, UO.x, UO.y); s.dl = wrap(orbA(sl, UP.x, UP.y) - s.p0); s.D = 12 + Math.abs(s.dl) * 5; }
      const e = clamp((k - s.t0) / s.D, 0, 1);
      at(Math.min(1, e + 0.03), UQ); const qx = UQ.x, qy = UQ.y; at(e, s);
      const sa = UO.a, fa = UP.a, ta = Math.atan2(qy - s.y, qx - s.x);
      s.a = turn(turn(sa, Math.hypot(qx - s.x, qy - s.y) > 0.01 ? ta : sa, s.out), fa, s.inn); s.fl = 1; s.lay = s.out < 0.55 ? 0 : 1;
      if (e >= 1) { s.ph = 'form'; s.lay = 1; s.ox = s.oy = 0; }
    } else if (s.ph === 'form') {
      formAt(s); s.fl = 1; s.lay = 1; s.hot = k >= SL.dash && k <= SL.hit ? 1 : 0;
      if (k >= SL.split + s.j * 0.5) { s.ph = 'dfl'; s.k = 0; s.vx = c * u * 0.042; s.vy = n * u * 0.042; s.rico = 0; }
    } else if (s.ph === 'dfl') { // past the point on one side or the other: over their heads, or down to skim the stones
      s.k++; s.hot = 1;
      if (!s.rico && ((s.x - sl.F[0]) * c + (s.y - sl.F[1]) * n > -Ls * 0.45 || s.k > 4)) {
        s.rico = 1; const sp = Math.hypot(s.vx, s.vy), q = clamp(s.j / 11, 0, 1);
        s.da = s.fs >= 0 ? Math.PI + 0.85 + 0.3 * q : Math.PI * 0.53 + 0.12 * q; // the uppers flung up and over, the lowers down past their front foot
        s.vx = Math.cos(s.da) * sp; s.vy = Math.sin(s.da) * sp;
        if (s.fs >= 0) s.da = Math.PI + 0.32 + 0.25 * q;
      } else if (s.rico) {
        const low = s.fs < 0, ta = low ? (s.y < sl.ys - Ls * 0.3 ? s.da : Math.PI - 0.03 + 0.03 * (s.j % 3)) : s.da;
        const va = turn(Math.atan2(s.vy, s.vx), ta, low ? 0.4 : 0.09), sp = Math.max(Math.hypot(s.vx, s.vy) * 0.962, low ? u * 0.022 : 0);
        s.vx = Math.cos(va) * sp; s.vy = Math.sin(va) * sp;
      }
      s.x += s.vx; s.y += s.vy;
      if (s.fs < 0 && s.y >= sl.ys) { // scraping along the stones in front of their feet
        s.y = sl.ys; s.vy = Math.min(0, s.vy);
        const tx = s.x + Math.cos(s.a) * Ls * 0.5;
        if (!s.scr) { s.scr = 1; dust(st, tx, sl.ys, 2, V, 0.0016, 0.0012); }
        burst(st, tx, sl.ys - u * 0.002, 1, 0.008, -Math.PI / 2 + 0.6, 1.4, 0, V);
        if (s.k % 4 === 0) dust(st, tx, sl.ys, 1, V, 0.001, 0.001);
      }
      s.a = Math.atan2(s.vy, s.vx); s.fl = 1; s.lay = 1;
      pushOut(st, s, Ls);
      if (s.fs >= 0 ? s.k >= 13 : s.k >= 19 && (s.k >= 40 || st.heroes.every((hb) => hb.X === undefined || s.x + Math.cos(s.a) * Ls * 0.5 < hb.X - hb.sz * 0.6))) { s.ph = 'ret'; s.k = 0; s.q = null; } // (the low ones only rise once past the last of them)
    } else if (s.ph === 'ret') { // up and round, high over the field, onto the circle that clears him
      if (!s.q) {
        const sp = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / sp, dy = s.vy / sp; slot(st, R, s.i, UO);
        s.pe = Math.PI + 0.3 + 0.08 * (s.j % 4); s.dl = wrap(orbA(sl, UO.x, UO.y) - s.pe); orbP(sl, s.pe, sl.ro, UP);
        const sg = s.dl >= 0 ? 1 : -1, tx = -Math.sin(s.pe) * sg, ty = Math.cos(s.pe) * 0.92 * sg, tl = Math.hypot(tx, ty);
        s.q = [s.x, s.y, s.x + dx * u * 0.12, s.y + dy * u * 0.12 - u * 0.22, UP.x - (tx / tl) * u * 0.22, UP.y - (ty / tl) * u * 0.22, UP.x, UP.y]; s.D = 22 + (s.j % 3) * 3;
      }
      s.k++; const e = Math.min(1, s.k / s.D), q = s.q;
      s.x = bez(q[0], q[2], q[4], q[6], e); s.y = bez(q[1], q[3], q[5], q[7], e);
      s.a = Math.atan2(bezD(q[1], q[3], q[5], q[7], Math.max(0.02, e)), bezD(q[0], q[2], q[4], q[6], Math.max(0.02, e))); s.fl = 1; s.lay = 1; s.hot = 0; pushOut(st, s, Ls);
      if (e >= 1) { s.ph = 'orb'; s.k = 0; s.D = 8 + Math.abs(s.dl) * 7; }
    } else if (s.ph === 'orb') { // round him on the circle, then in to its place
      s.k++; slot(st, R, s.i, UO);
      let dl = wrap(orbA(sl, UO.x, UO.y) - s.pe); if (dl * s.dl < 0 && Math.abs(dl) > 2) dl += s.dl > 0 ? TAU : -TAU;
      const e = Math.min(1, s.k / s.D), ee = 1 - (1 - e) * (1 - e), inn = ss((e - 0.55) / 0.45), ph = s.pe + dl * ee;
      orbP(sl, ph, sl.ro, UP); s.x = lerp(UP.x, UO.x, inn); s.y = lerp(UP.y, UO.y, inn);
      const sg = s.dl >= 0 ? 1 : -1; s.a = turn(Math.atan2(Math.cos(ph) * 0.92 * sg, -Math.sin(ph) * sg), UO.a, inn); s.fl = 1; s.lay = inn > 0.35 ? 0 : 1;
      if (e >= 1) { s.st = 'ring'; s.ph = null; s.tr.length = 0; s.q = null; s.hot = 0; return; }
    }
    if ((s.ph === 'form' && s.hot) || s.ph === 'dfl' || s.ph === 'ret' || (s.ph === 'gat' && s.lay)) { // its trail, while it goes fast
      s.tr.unshift(s.x + Math.cos(s.a) * Ls * 0.5, s.y + Math.sin(s.a) * Ls * 0.5);
      const cap = u * (s.hot ? 0.34 : 0.14); let dd = 0, i = 2;
      for (; i < s.tr.length; i += 2) { dd += Math.hypot(s.tr[i] - s.tr[i - 2], s.tr[i + 1] - s.tr[i - 1]); if (dd > cap) break; }
      s.tr.length = Math.min(s.tr.length, i + 2, 40);
    } else if (s.tr.length) s.tr.length = Math.max(0, s.tr.length - 4);
  }

  /**
   * 흡공: he holds out an open palm and a crimson current reaches across the gap to each of them in turn and coils
   * round them. It drags them by the heels over the stones, then lifts them and draws them up their own lanes toward
   * his palm; they fight it (weapons rammed into the stones, the old master holding on to a friend, the monk's staff
   * whirling to cut it, the swordswoman slashing at the coils), tear free one by one in a burst of their own qi, drop
   * to the stones, get their breath and walk back to re-form the line, while the field fades and he closes his hand.
   */
  const SA = { ext: 14, field: 22, cat: 24, gap: 3, rel: 100, step: 6, fade: 150, done: 182 }; // frames
  function absorbStep(st, V, S, d) {
    const u = V.u, k = d.k, a = st.ab || (st.ab = { k: 0, r: 0, o: null, ord: null }), dm = st.dm;
    a.k = k;
    const hs = st.heroes.filter((h) => !h.ch);
    if (k === 1 && hs.length) {
      dm.tx = hs.reduce((q, h) => q + h.hit[0], 0) / hs.length; dm.ty = hs.reduce((q, h) => q + h.hit[1], 0) / hs.length - u * 0.04;
      hs.slice().sort((p, q) => (p.X || p.x0) - (q.X || q.x0)).forEach((h, j) => { h.lnj = j; }); // each its own lane up toward him, in the order they stand
      a.ord = hs.slice().sort((p, q) => p.lnj - q.lnj); // caught one by one from the far end of the line, and torn free in the same order (so none falls through a lane still held)
      a.ord.forEach((h, i) => { h.knlHold = 0; h.ab = { ph: 'wait', k: 0, kc: SA.cat + i * SA.gap, kr: SA.rel + i * SA.step + ((RND() * 3) | 0), LF: 0.55 + 0.025 * (i % 3), sd: RND() * 60, r: 0, vr: 0, cr: 0, vcr: 0, air: 0, ul: 0, ls: 0, pl: 0, rc: 0, rest: 8 + RND() * 7, vw: 0.025 + RND() * 0.005 }; });
    }
    dm.fs = ss((k - SA.fade + 6) / 10); dm.ex = ss(k / SA.ext) * (1 - ss((k - SA.fade) / 20)); dm.ab = 0.25 * ss((k - 40) / 40) * (1 - ss((k - SA.fade) / 20));
    st.pull = ss((k - SA.field) / 18) * (1 - ss((k - SA.fade) / 24));
    a.r = u * 0.024 * ss((k - SA.field) / 30) * (1 - ss((k - SA.fade - 4) / 14)); // a small orb in his palm, closed in his hand as the field fades
    if (k === 8) for (const h of hs) h.grdHold = Math.max(h.grdHold, 220);
    for (const h of a.ord || []) { // the coils of his qi round each of them, from just before it takes hold until they tear free
      const b = h.ab, on = b && ((b.ph === 'wait' && k >= b.kc - 6) || b.ph === 'pull');
      h.cl = on ? Math.min(1, (h.cl || 0) + 0.06) : Math.max(0, (h.cl || 0) - 0.2);
      if (b && b.ph === 'pull') h.drn = Math.min(1, (h.drn || 0) + 0.008);
    }
    const o = a.ord || []; // they keep clear of each other: two drawn together are pushed apart (on the stones only along them), so each stays readable in its own lane
    for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) {
      const p = o[i].ab, q = o[j].ab; if (!p || !q || p.x === undefined || q.x === undefined || (p.ph !== 'pull' && p.ph !== 'free') || (q.ph !== 'pull' && q.ph !== 'free')) continue;
      const sp = o[i].sz || u * 0.13, sq = o[j].sz || u * 0.13, dx = q.x - p.x, dy = q.y - sq * 0.45 - (p.y - sp * 0.45), d = Math.hypot(dx, dy) || 1, d0 = (sp + sq) * 0.36;
      if (d < d0) { const f = 0.05 * (d0 - d), fx = (dx / d) * f, fy = (dy / d) * f; p.vx -= fx; q.vx += fx; if (!p.gnd) p.vy -= fy; if (!q.gnd) q.vy += fy; }
    }
    if (k === SA.fade + 6) { st.hs = Math.max(st.hs || 0, 0.6); st.hsp = a.o ? a.o.slice() : null; } // his hand closes on it
    if (k > SA.done) { st.dom = null; st.ab = null; st.pull = 0; }
  }
  /*
   * 흡공, one hero: forces, not tweens. His current is a spring toward a point on their lane that comes up to full
   * strength over 1.5 s, at first along the stones in front of them, then up the lane; against it their own resistance
   * (irregular: they claw back, then lose ground again), gravity, and while their feet are down the friction of heels
   * dug into the stones. Torn free, nothing holds them but gravity and the air: they fly on toward him a beat as the
   * coils snap, are thrown back by their own qi, come down on their feet, sink into the landing, get their breath and
   * walk back to their place.
   */
  const AB = { ramp: 45, kp: 0.0075, c: 0.085, mus: 0.42, muk: 0.36 };
  function abHero(st, h, V, S) {
    const b = h.ab, u = V.u, Y = S.Y, s = h.sz || Y.sz[h.row], gy = Y.rows[h.row], a = st.ab, k = a ? a.k : 1e9, g = s * 0.0095;
    if (b.ph === 'wait') { if (k < b.kc || h.X === undefined || !a || !a.o) return; Object.assign(b, { ph: 'pull', k: 0, x: h.X, y: gy, gx: h.X, vx: 0, vy: 0, gnd: 1 }); }
    b.k++;
    const n1 = nz(b.k * 0.09 + b.sd), n2 = nz(b.k * 0.05 + b.sd * 1.7), n3 = nz(b.k * 0.21 + b.sd * 2.3);
    if (b.ph === 'pull') {
      const o = (a && a.o) || b.o, j = h.lnj === undefined ? 2 : h.lnj, ex = o[0] - u * 0.05 - (4 - j) * u * 0.08, ey = o[1] + s * 0.45 + (4 - j) * u * 0.07 - u * 0.05;
      const tx = lerp(b.gx, ex, b.LF), ty = lerp(gy, ey, b.LF), ls = ss((k - b.kr + 11) / 11); b.ls = ls; b.o = o;
      const A = ss(b.k / AB.ramp) * (1 + 0.42 * n1 * ss(b.k / 25)) * (1 + 0.3 * ss((k - b.kr + 6) / 6)), lift = ss((b.k - 20) / 26); b.pl = Math.min(1, A); // his pull: surging and slackening, a last hard yank as they gather themselves
      const up = ss((b.k - 20) / 36), px = lerp(b.gx + s, tx, up), py = lerp(gy, ty, up); // where it draws them: along the stones, then up the lane
      const rx0 = b.gx - o[0], ry0 = gy - o[1], rl = Math.hypot(rx0, ry0) || 1, R = s * 0.0024 * (0.75 + 0.7 * n2) * (1 + 0.4 * ls); // their resistance, straight back from his palm
      const fx = A * AB.kp * (px - b.x) + (R * rx0) / rl + s * 0.0009 * n3 * (1 - b.gnd), fy = A * AB.kp * (py - b.y) + (R * ry0) / rl + g * (1 - A * lift) + s * 0.0008 * nz(b.k * 0.19 + b.sd + 7) * (1 - b.gnd);
      if (b.gnd) {
        const N = Math.max(0, fy); b.ul = clamp(1 - N / g, 0, 1); // how much of their weight is still on their heels
        if (fy < 0) { b.gnd = 0; b.vy = fy; } else {
          b.vy = 0; b.y = gy;
          if (Math.abs(b.vx) < s * 0.0004 && Math.abs(fx) <= AB.mus * N) b.vx = 0; // heels dug in: they hold
          else { const fr = AB.muk * N * Math.sign(b.vx || fx), nv = b.vx + fx - fr; b.vx = b.vx && Math.sign(nv) !== Math.sign(b.vx) ? 0 : nv; if (b.fu0 === undefined) b.fu0 = b.x; b.fu1 = b.x; if (b.k % 3 === 0) dust(st, b.x + s * 0.28, gy, 1, V, 0.0008, 0.0007); } // the heels drag, ploughing the dust
        }
        b.vx *= 0.97;
      }
      if (!b.gnd) { b.ul = 1; b.vx += fx - AB.c * b.vx; b.vy += fy - AB.c * b.vy; }
      b.x += b.vx; b.y += b.vy;
      if (b.y > gy) { b.y = gy; b.vy = 0; b.gnd = 1; }
      b.air += ((b.gnd ? 0 : 1) - b.air) * 0.18;
      b.rt = b.air * (0.26 + 0.11 * n2) + 0.06 * b.ul; // tipped toward him by the pull at their middle
      if (ls > 0.2 && b.k % 3 === 0 && st.qtong.length < 30) { const th = RND() * TAU, wx = b.x + Math.cos(th) * s * 0.3, wy = b.y - s * 0.45 + Math.sin(th) * s * 0.18, dx = o[0] - wx, dy = o[1] - wy, l = Math.hypot(dx, dy) || 1, v = u * 0.006; st.qtong.push({ x: wx, y: wy, vx: (dx / l) * v, vy: (dy / l) * v, c: (RND() - 0.5) * 0.3, life: 0, max: 9 + RND() * 6 }); } // the coils fraying
      if (k >= b.kr) { // they tear free: a brief ring of their own qi, the coils snap back toward his palm, and they fly on toward him a beat
        b.ph = 'free'; b.k = 0; b.fa = 1;
        const cx = b.x + Math.sin(b.r) * s * 0.12, cy = b.y - s * 0.3 - Math.cos(b.r) * s * 0.12, dx = o[0] - b.x, dy = o[1] - b.y, l = Math.hypot(dx, dy) || 1;
        st.shat.push({ x: cx, y: cy, life: 0 }); st.flashes.push({ x: cx, y: cy, r: u * 0.03, life: 0, max: 5, c: 1 });
        for (let i = 0; i < 8; i++) { if (st.qtong.length > 30) st.qtong.shift(); const wx = cx + (RND() - 0.5) * s * 0.6, wy = cy + (RND() - 0.5) * s * 0.7, ex2 = o[0] - wx, ey2 = o[1] - wy, l2 = Math.hypot(ex2, ey2) || 1, v = u * (0.01 + RND() * 0.008); st.qtong.push({ x: wx, y: wy, vx: (ex2 / l2) * v, vy: (ey2 / l2) * v, c: (RND() - 0.5) * 0.25, life: 0, max: 14 + RND() * 8 }); }
        b.vx += (dx / l) * s * 0.011; b.vy += (dy / l) * s * 0.011; b.vr -= 0.012;
        const ft = Math.sqrt((2 * Math.max(s * 0.3, gy - b.y)) / g) + 6, need = (0.8 * (b.x - (h.Xh === undefined ? b.gx : h.Xh))) / (ft * 0.82); b.pw = clamp((need + b.vx) / (6.3 * 0.93), s * 0.004, s * 0.014); // how hard their qi throws them back
      }
    } else if (b.ph === 'free') {
      const e = b.k < 10 ? Math.sin((Math.PI * b.k) / 10) : 0, pw = b.pw * e; // the push of their own qi, a few frames long, then only gravity and the air
      b.vx += -0.93 * pw - 0.025 * b.vx; b.vy += -0.36 * pw + g * 0.8 - 0.03 * b.vy; // (their own qi lightening the fall a little)
      b.x += b.vx; b.y += b.vy;
      b.rt = b.k < 6 ? 0.34 : 0.1 + clamp((-b.vx / s) * 1.5, 0, 0.1); // turning to get their feet under them
      b.air = 1; b.pl *= 0.85;
      if (b.y >= gy && b.vy > 0) { // down: the legs take it
        b.ph = 'land'; b.k = 0; b.vcr = clamp(b.vy / s / 0.22, 0.2, 0.9); b.cr = Math.min(0.5, (b.y - gy) / s / 0.22 + b.vcr * 0.25); b.y = gy; b.vy = 0; // (what is left of this frame's fall already in the knees)
        h.shake = 1; h.fat = Math.min(1, (h.fat || 0) + 0.25); dust(st, b.x, gy, 6, V, 0.0024, 0.0014); st.rings.push({ x: b.x, y: gy + u * 0.002, r: s * 0.15, life: 0, max: 26 });
      }
    } else if (b.ph === 'land' || b.ph === 'rec') { // a short skid, sunk to a knee; a breath; up again
      b.air = Math.max(0, b.air - 0.34); b.pl *= 0.8;
      if (b.ph === 'land' && b.k < 5 && Math.abs(b.vx) > s * 0.006) dust(st, b.x + s * 0.1, gy, 1, V, 0.0012, 0.0008);
      b.vx *= b.k < 5 && b.ph === 'land' ? 0.82 : 0.7; b.x += b.vx; b.rt = 0.04 * b.cr;
      const crT = b.ph === 'land' ? 0.62 : b.k < b.rest ? 0.5 + 0.04 * n2 : 0;
      b.vcr += 0.11 * (crT - b.cr) - (b.ph === 'land' && b.k < 4 ? 0.42 : 0.32) * b.vcr; b.cr += b.vcr;
      if (b.cr > 1.25) { b.cr = 1.25; b.vcr = Math.min(0, b.vcr); } if (b.cr < 0) { b.cr = 0; b.vcr = 0; }
      if (b.ph === 'land' && b.k > 7) { b.ph = 'rec'; b.k = 0; }
      if (b.ph === 'rec' && b.k > b.rest + 6 && b.cr < 0.06) { b.ph = 'walk'; b.k = 0; b.vx = 0; }
    } else if (b.ph === 'walk') { // back to their place in the line a step at a time, still facing him
      b.cr = Math.max(0, b.cr * 0.85); b.rt = 0; b.pl = 0;
      const d = (h.Xh === undefined ? b.gx : h.Xh) - b.x, vd = Math.sign(d) * Math.min(s * b.vw, Math.sqrt(2 * s * 0.0015 * Math.abs(d)));
      b.vx += clamp(vd - b.vx, -s * 0.0025, s * 0.0025); b.x += b.vx * (0.86 + 0.28 * Math.abs(Math.cos(h.wp || 0)));
      if (Math.abs(d) < s * 0.006 && Math.abs(b.vx) < s * 0.003) { h.ab = null; h.grdHold = Math.max(h.grdHold, 50); return; } // in place: guard up
    }
    if (b.ph !== 'pull') { b.rc = Math.min(1, b.rc + 0.1); b.fa = Math.max(0, b.fa - 0.012); }
    b.vr += 0.035 * (b.rt - b.r) - 0.16 * b.vr; b.r += b.vr; // the body turns as a body: no snaps
  }

  /* ---------- the simulation, one frame ---------- */
  function update(st, V, S, L) {
    const { u } = V, Y = S.Y, R = st.R, o = {}, pv = V.pv;
    if (!st.oc) { st.oc = [Y.cx + u * 0.03, Y.hipY - Y.hc * 0.1]; st.ro = Y.hc; } // the circle the blades take round him
    st.t++;
    st.rot += 0.0032 + st.flare * 0.004; // the halo turns, slow and heavy
    st.vrot = (st.vrot || 0) + 0.0032 * (1 + 4 * (st.pull || 0)); // the wheel of cloud, tightening while he draws their qi in
    st.gust *= 0.975; st.hitAura *= 0.88; st.prd = (st.prd || 0) * 0.95; st.tp = (st.tp || 0) * 0.86; st.hs = (st.hs || 0) > 0.02 ? st.hs * 0.6 : 0; // (a big blow drains the colour for a few frames)
    if (st.domCd > 0) st.domCd--;
    const dm = st.dm;
    if (dm.hold > 0) dm.hold--; else dm.cmdT = 0;
    dm.cmd += (dm.cmdT - dm.cmd) * (dm.cmdT ? 0.25 : 0.07);

    // his domain: the qi gathers (the halo trembles, his arms open), then its weight rolls out over the platform
    const dom = st.dom;
    if (dom) {
      dom.k++;
      if (dom.type === 'press') {
        const pk = dom.k; st.trem = pk < PRS.slam ? pk / PRS.slam : Math.max(0, 1 - (pk - PRS.slam) / 24);
        if (pk === 1) { // the cracks it will open, out from under him (the stones are seen low, so they run flat)
          const p = new Path2D(), N = V.pv ? 8 : 18;
          for (let i = 0; i < N; i++) { const a = (i / N) * TAU + (RND() - 0.5) * 0.35, L0 = u * (0.1 + RND() * RND() * 0.38); let d = u * 0.02 + RND() * u * 0.03, x = Y.cx + Math.cos(a) * d, y = Y.gyC + Math.sin(a) * d * 0.15; p.moveTo(x, y);
            while (d < L0) { d += u * (0.012 + RND() * 0.02); const j = (RND() - 0.5) * u * 0.035; x = Y.cx + Math.cos(a) * d - Math.sin(a) * j; y = Y.gyC + (Math.sin(a) * d + Math.cos(a) * j) * 0.15; p.lineTo(x, y); if (RND() < 0.35) { const b = a + (RND() < 0.5 ? -1 : 1) * (0.4 + RND() * 0.6), bl = u * (0.015 + RND() * 0.04); p.lineTo(x + Math.cos(b) * bl, y + Math.sin(b) * bl * 0.15); p.moveTo(x, y); } } }
          st.pcr = { p, r: 0, a: 0 };
        }
        st.phz = ss((pk - 4) / 26) * (1 - ss((pk - PRS.slam - 6) / 50)); st.prz = ss((pk - 6) / 10) * (1 - ss((pk - PRS.slam + 1) / 2)); st.ppin = ss((pk - 8) / 20) * (1 - ss((pk - PRS.slam - 4) / 30)); st.psq = 0.05 * ss((pk - 6) / 26) * (1 - ss((pk - PRS.slam) / 14)); st.pab = ss((pk - 4) / 26) * (1 - ss((pk - PRS.slam - 2) / 16));
        if (pk < PRS.slam) { const rb = u * 0.75 * ss((pk - 4) / 30); for (const tf of st.tufts) if (Math.abs(tf.x - Y.cx) < rb) tf.fl = Math.max(tf.fl, 0.75); } // the grass laid flat in a ring growing out from under him
        if (pk >= 14 && pk < PRS.slam) for (const h of st.heroes) if (!h.ch) h.prsHold = 2; // their knees giving under the weight of it
        if (pk === PRS.slam) { // the palm at the bottom: the ring slams out from beneath him
          st.press = { r: u * 0.03, r2: 0, life: 0, hit: new Set(), first: 0 }; st.gust = 2.6; st.hs = 0.6; st.hsp = [Y.cx, Y.gyC]; st.prd = 1;
          st.flashes.push({ x: Y.cx, y: Y.gyC, r: u * 0.06, life: 0, max: 6 }); burst(st, Y.cx, Y.gyC, 16, 0.016, -Math.PI / 2, 2.6, 0, V); dust(st, Y.cx, Y.gyC, 8, V, 0.004, 0.002);
        }
        if (dom.k === 12) for (const h of st.heroes) if (!h.ch) h.grdHold = Math.max(h.grdHold, 110); // weapons planted, leaning into it
        if (dom.k > PRS.end) { st.dom = null; st.phz = st.prz = st.ppin = st.psq = st.pab = 0; }
      } else if (dom.type === 'rain') { st.trem = dom.k < 40 ? dom.k / 40 : dom.k < RS.rel ? 1 : Math.max(0, 1 - (dom.k - RS.rel) / 30); rainStep(st, V, S, dom); if (dom.first === dom.k) { st.hs = 1; st.hsp = [Y.gx - u * 0.15, Y.rows[1] - u * 0.1]; } }
      else if (dom.type === 'absorb') absorbStep(st, V, S, dom);
      else slashStep(st, V, S, dom);
    }
    const dme = st.dome; // the old master's dome: after the rain it holds a beat, he lowers his hands, it settles and thins away
    if (dme) {
      dme.k++;
      if (dme.fade !== undefined) {
        dme.fade++;
        if (dme.fade === 8) for (let i = 0; i <= 8; i++) { const th = Math.PI * (1.08 + (i / 8) * 0.84); motes(st, dme.cx + Math.cos(th) * dme.R, dme.cy + Math.sin(th) * dme.R * 0.92, 2, V, 0, u * 0.02, u * 0.02); }
        if (dme.fade > 34) st.dome = null;
      }
    }
    const ultOn = dom && dom.k < (dom.type === 'press' ? 90 : 130);
    st.flare += ((ultOn ? 1.1 : 0) - st.flare) * (dom ? 0.05 : 0.025);
    dm.spr += ((dom && dom.type === 'press' && dom.k < 80 ? 1 : 0) - dm.spr) * 0.045;
    dm.up += ((dom && (dom.type === 'rain' ? dom.k < RS.rel + 2 : dom.type === 'slash' && dom.k < SL.dash) ? 1 : 0) - dm.up) * 0.05;
    dm.dn += ((dom && dom.type === 'slash' && dom.k >= SL.dash && dom.k < SL.split + 16 ? 1 : 0) - dm.dn) * (dom && dom.type === 'slash' && dom.k >= SL.dash ? 0.35 : 0.06); // the two fingers come down as it goes

    const sd = st.shield;
    if (dom && !sd && dom.k === 8 && dom.type !== 'slash' && dom.type !== 'absorb') { const xs = st.heroes.map((h) => h.x0 + h.dx), mx = Math.max(...xs); st.shield = { k: 0, x: mx + u * 0.075, cr: 0, cuts: Array.from({ length: 6 }, () => [RND(), RND() - 0.5, RND() - 0.5]) }; }
    if (st.shield) {
      const q = st.shield; q.k++;
      const hitNow = dom && ((dom.type === 'press' && st.press && Y.cx - st.press.r < q.x) || (dom.type === 'rain' && dom.first === dom.k));
      if (hitNow && !q.cr && !q.dis) { // it breaks: its slivers fall and fade
        q.cr = 1; q.br = 0; const ym = lerp(Y.rows[2] - u * 0.15, Y.rows[0], 0.5);
        burst(st, q.x, ym, 14, 0.01, Math.PI, 2.4, 1, V); motes(st, q.x + u * 0.03, ym, 12, V, 1, u * 0.03, u * 0.15);
      }
      if (q.cr) q.br++;
      if (!q.cr && !q.dis && (q.k > 260 || (!dom && q.k > 30))) { q.dis = 1; motes(st, q.x + u * 0.03, lerp(Y.rows[2] - u * 0.15, Y.rows[0], 0.5), 10, V, 0, u * 0.02, u * 0.15); } // outlived its attack: it thins away
      if (q.dis) q.dis++;
      if (q.br > 26 || q.dis > 26) st.shield = null;
    }
    // what happens next
    if (st.retal && st.t >= st.retal.at) { strike(st, st.retal.h, 'clash', 0.95 + RND() * 0.2); st.retal = null; }
    if (st.t >= st.next && !dom) {
      const free = st.sw.filter((s) => s.st === 'ring').length, r = RND();
      if (free < 6) st.next = st.t + 12;
      else if (st.domCd <= 0 && (r < 0.32 || st.forceUlt) && !st.heroes.some((h) => h.ch)) {
        const opts = ['press', 'rain', 'slash', 'absorb'].filter((x) => x !== st.lastUlt), ty = st.forceUlt || opts[(RND() * opts.length) | 0]; // forceUlt: a preview / test asks for one
        st.forceUlt = null;
        st.lastUlt = ty; st.dom = { k: 0, type: ty };
        if (ty === 'rain') rainStart(st, V, S); else if (ty === 'slash') slashStart(st, V, S);
        st.domCd = (pv ? 330 : 750) + RND() * 300; st.next = st.t + (ty === 'press' ? 150 : ty === 'rain' ? 185 : ty === 'absorb' ? 225 : 210) + RND() * 30;
      }
      else if (r < 0.58) { volley(st, 3 + ((RND() * 2.6) | 0)); st.next = st.t + 105 + RND() * 50; }
      else if (r < 0.7 && !pv && !st.bolts.length) {
        const cs = st.heroes.filter((h) => h.knl < 0.2 && h.type !== 'beggar'), h = cs[(RND() * cs.length) | 0];
        if (h) { h.cntHold = 16; h.fire = 8; }
        st.next = st.t + 110 + RND() * 40;
      } else { strike(st, chooseHero(st), kindOf()); st.next = st.t + (pv ? 32 : 40) + RND() * (pv ? 28 : 50); }
    }

    // the heroes
    for (const h of st.heroes) {
      h.rec += (h.recT - h.rec) * 0.5; h.recT *= 0.9;
      const kt = h.knlHold > 0 ? 1 : 0; h.knl += (kt - h.knl) * (kt ? 0.2 : 0.045 * (1 - 0.55 * (h.fat || 0))); if (h.knlHold > 0) h.knlHold--; // tired, they are slower to rise
      h.fat = Math.max(0, (h.fat || 0) - 0.00035); h.prs = (h.prs || 0) + ((h.prsT || 0) - (h.prs || 0)) * 0.25; h.prsT = h.prsHold > 0 ? (h.prsHold--, 1) : 0;
      const gt = h.grdHold > 0 ? 1 : 0; h.grd += (gt - h.grd) * (gt ? 0.2 - 0.08 * dazed(h) : 0.2); if (h.grdHold > 0) h.grdHold--; // hurt, the guard comes up slower, but it comes
      h.lk = (h.lk || 0) + ((h.thr ? 1 : 0) - (h.lk || 0)) * (h.thr ? 0.4 : 0.1); h.thr = 0;
      if (h.cvT > 0) h.cvT--; h.cvk = (h.cvk || 0) + ((h.cvT > 0 ? 1 : 0) - (h.cvk || 0)) * (h.cvT > 0 ? 0.25 : 0.06); // stepping in front of a fallen friend, and back again
      if (h.dg) { // a roll (crouch, tucked dive along the ground, up on one knee into guard) or a quick sidestep back
        const g = h.dg; g.k++;
        if (g.roll) {
          const e = ss((g.k - 3) / 10); h.dgo = -u * 0.14 * e; h.rl = -TAU * e;
          if (g.k > 3 && g.k < 13 && g.k % 2) dust(st, (h.X || h.x0) + u * 0.012, Y.rows[h.row], 1, V, 0.0012, 0.0008); // a trail of dust where it rolls
          if (g.k === 13) { h.knlHold = Math.max(h.knlHold, 45); h.grdHold = Math.max(h.grdHold, 60); }
          if (g.k >= 15) { h.dg = null; h.rl = 0; }
        } else { h.dgo = -u * 0.12 * ss(g.k / 10); if (g.k >= 12) { h.dg = null; dust(st, (h.X || h.x0) + u * 0.01, Y.rows[h.row], 3, V, 0.0018, 0.0012); } }
      }
      else if (h.dgo) h.dgo = Math.min(0, h.dgo + u * 0.0011); // and back to the line, on foot // the head snaps toward a blade coming at them
      const fot = st.slash && st.slash.k > 8 && st.slash.k < SL.split ? 1 : 0; h.fo = (h.fo || 0) + (fot - (h.fo || 0)) * (fot ? 0.07 : 0.025); // closing on the one point, and letting go of it
      const ct = h.cntHold > 0 ? 1 : 0; h.cnt += (ct - h.cnt) * (ct ? 0.4 : 0.12); if (h.cntHold > 0) h.cntHold--;
      h.dx += h.vx; h.vx *= 0.84;
      if (h.dx < -u * 0.085) { h.dx = -u * 0.085; h.vx = 0; } // pushed to the limit: they hold there
      if (h.dx > u * 0.07) h.dx = u * 0.07;
      h.drn = Math.max(0, (h.drn || 0) - (st.ab ? 0 : 0.004));
      if (h.ab) abHero(st, h, V, S); // caught in 흡공, and after it: falling, landing, walking back
      if (!st.pull && h.rec < 0.12 && h.knl < 0.1 && h.vx > -0.3 && h.dx < 0) { h.rcs = ((h.rcs || 0) + 1) % 40; if (h.rcs < 8) h.dx = Math.min(0, h.dx + u * 0.002); } // they win the ground back, a couple of steps at a time
      h.shake *= 0.86; h.lit *= 0.9;
      if (h.vx < -u * 0.0016 && st.t % 2 === 0) dust(st, (h.X || h.x0 + h.dx) + u * 0.01, Y.rows[h.row], 1, V, 0.0006, 0.0008); // feet skidding
      if (h.fire > 0 && --h.fire === 0) { // the blow it was winding up leaves the hand
        const sx = h.hit[0], sy = h.hit[1], dx = R.cx - sx, dy = R.cy - sy, l = Math.hypot(dx, dy);
        st.bolts.push({ x: sx, y: sy, vx: (dx / l) * u * 0.024, vy: (dy / l) * u * 0.024, h, kind: h.type === 'taoist' || h.type === 'woman' ? 'crescent' : 'palm', tr: [] });
      }
    }

    // now and then one of them gathers themself and throws themself at him
    const Ls = u * 0.105;
    if (st.chCd > 0) st.chCd--;
    if (st.chCd <= 0 && !st.dom && !st.heroes.some((h) => h.ch)) {
      const h = st.heroes[st.chOrd[st.chI % st.chOrd.length]];
      if (h.knl < 0.25 && h.rec < 0.25 && !h.noWpn && h.shake < 0.2 && !h.ab) {
        st.chI++; st.chCd = 330 + RND() * 420;
        h.ch = { ph: 'gather', k: 0, x: h.x0 + h.dx, y: Y.rows[h.row], rot: 0, tr: [], key: 'gat', def: ['aura', 'wall', 'flick'][(RND() * 3) | 0], lose: h.type !== 'master' && RND() < 0.32 };
        h.grdHold = 0; h.cntHold = 0; h.knlHold = 0;
      } else st.chCd = 40;
    }
    for (const h of st.heroes) {
      const c = h.ch; if (!c) continue;
      const gy = Y.rows[h.row]; c.k++;
      if (c.ph === 'gather') { // crouched, the weapon drawn back, a kick of dust
        c.key = 'gat'; c.x = h.x0 + h.dx;
        if (c.k === 16) dust(st, c.x, gy, 4, V, 0.0018, 0.0012);
        if (c.k >= 24) { c.ph = 'dash'; c.k = 0; c.x0 = c.x; c.x1 = lerp(c.x, R.cx, 0.28); }
      } else if (c.ph === 'dash') { // a few running strides at him
        c.key = 'cnt'; const e = Math.pow(Math.min(1, c.k / 10), 1.4); c.x = lerp(c.x0, c.x1, e); c.y = gy; c.rot = 0.12 * e;
        if (c.k % 2 === 0) dust(st, c.x, gy, 1, V, 0.001, 0.0008);
        if (c.k >= 10) {
          c.ph = 'leap'; c.k = 0; c.lx = c.x; dust(st, c.x, gy, 4, V, 0.0022, 0.0014);
          const th = Math.atan2(gy - h.sz * 0.6 - R.cy, c.x - R.cx), rr = R.r + Ls * 0.55;
          c.th = th; c.cx = R.cx + Math.cos(th) * rr; c.cy = R.cy + Math.sin(th) * rr * R.k;
        }
      } else if (c.ph === 'leap') { // up and in, the blow drawn back, a trail of qi behind
        c.key = 'atk'; const e = Math.min(1, c.k / 16), m = 1 - e;
        const tx = c.cx - h.wOff[0], ty = c.cy - h.wOff[1], qx = lerp(c.lx, tx, 0.45), qy = Math.min(gy, ty) - u * 0.1;
        c.x = m * m * c.lx + 2 * m * e * qx + e * e * tx; c.y = m * m * gy + 2 * m * e * qy + e * e * ty; c.rot = -0.2 * e;
        if (c.def === 'wall' && c.k === 8) wallUp(st, h, c, Ls);
        if (c.k >= 16) { c.ph = 'stop'; c.k = 0; c.sx = c.x; c.sy = c.y; repel(st, h, c, V, Y); }
      } else if (c.ph === 'stop') { // dead against it, shaking
        c.key = h.type === 'monk' ? 'cnt' : 'atk'; const v = (1 - c.k / 8) * u * 0.003;
        c.x = c.sx + Math.sin(c.k * 2.7) * v; c.y = c.sy + Math.cos(c.k * 3.3) * v;
        if (c.k >= 8) { c.ph = 'fly'; c.k = 0; c.landX = h.x0 + h.dx - u * (0.03 + RND() * 0.04); }
      } else if (c.ph === 'fly') { // flung back down in an arc, turning over
        c.key = 'rec'; const e = Math.min(1, c.k / 30), m = 1 - e, qx = lerp(c.sx, c.landX, 0.3), qy = Math.min(c.sy, gy) - u * 0.08;
        c.x = m * m * c.sx + 2 * m * e * qx + e * e * c.landX; c.y = m * m * c.sy + 2 * m * e * qy + e * e * gy; c.rot = -Math.sin(Math.PI * e) * 1.2;
        if (c.k >= 30) { // a hard landing
          h.ch = null; h.dx = c.landX - h.x0; h.vx = -u * 0.007; h.recT = 1.1; h.knlHold = 80 + RND() * 60; h.shake = 1; h.lit = 1; h.cp = null;
          dust(st, c.landX, gy, 8, V, 0.0026, 0.0016); st.rings.push({ x: c.landX, y: gy + u * 0.002, r: h.sz * 0.15, life: 0, max: 26 });
          continue;
        }
      }
      if (c.ph === 'dash' || c.ph === 'leap' || c.ph === 'stop' || (c.ph === 'fly' && c.k < 8)) { c.tr.unshift(c.x + h.cOff[0], c.y + h.cOff[1]); if (c.tr.length > 24) c.tr.length = 24; } else if (c.tr.length) c.tr.length = Math.max(0, c.tr.length - 4);
    }

    // the swords
    for (const s of st.sw) {
      if (s.surge) s.surge = s.surge > 0.01 ? s.surge * 0.9 : 0;
      if (s.st === 'ult') { if (st.slash) ultSword(st, s, V); else { s.st = 'ring'; s.tr.length = 0; } if (s.st === 'ult') { s.hid = hideIn(st, s, Ls); continue; } }
      if (s.st === 'ring' && s.uj !== undefined) { if (st.slash && st.slash.k < SL.form - 14) ultJoin(s, s.uj, st.slash.k); else s.uj = undefined; if (s.st === 'ult') { ultSword(st, s, V); continue; } }
      if (s.st === 'ring') { slot(st, R, s.i, s); s.tr.length = 0; continue; }
      const h = s.h, hx = h.hit[0], hy = h.hit[1];
      if (s.st === 'aim' || s.st === 'fly') h.thr = 1;
      if (s.st === 'aim') { // it slides out of the halo, turns on its mark and trembles
        s.k += 1 / s.dur; slot(st, R, s.i, o);
        const ta = Math.atan2(hy - o.y, hx - o.x), e = ss(s.k * 1.4);
        s.x = o.x + Math.cos(o.a) * u * 0.045 * e; s.y = o.y + Math.sin(o.a) * u * 0.045 * e;
        s.a = turn(o.a, ta, e); s.fl = 1; s.z = lerp(-1, 1, e);
        const tr = u * 0.0028 * ss((s.k - 0.4) / 0.4); s.x += Math.sin(st.t * 2.9 + s.i) * tr * -Math.sin(s.a); s.y += Math.sin(st.t * 2.9 + s.i) * tr * Math.cos(s.a);
        if (s.k >= 1) {
          s.st = 'fly'; s.k = 0;
          let gr = s.kind === 'ground' || s.kind === 'dodge', tx = s.kind === 'dodge' ? (h.X === undefined ? h.x0 : h.X) + h.sz * 0.06 : s.kind === 'ground' ? h.x0 + h.dx + h.sz * (0.22 + RND() * 0.1) : hx, ty = gr ? Y.rows[h.row] - u * 0.004 : hy - (s.kind === 'graze' ? h.sz * 0.25 : 0);
          if (s.kind === 'dodge') h.dg = { k: 0, roll: h.type === 'woman' || RND() < 0.4 }; // they see it leave and throw themselves out of its way
          if (gr) for (let k = 0; k < 8 && st.heroes.some((hb) => inHull(hb, tx, ty - Ls * 0.1, 0.14)); k++) tx += h.sz * 0.09; // into open ground, clear of all of them
          const d = Math.hypot(tx - s.x, ty - s.y);
          s.p = [s.x, s.y, s.x + Math.cos(s.a) * d * 0.3, s.y + Math.sin(s.a) * d * 0.3 - d * 0.1 * s.side, tx + d * 0.28, ty - d * (gr ? 0.45 : 0.25), tx, ty];
          if (s.kind === 'graze') { s.p[6] = tx - u * 0.3; s.p[7] = ty - u * 0.1; s.p[4] = tx + d * 0.1; s.p[5] = ty + d * 0.05; }
          s.dur = Math.max(9, d / (u * 0.036));
          for (let i = 1; i <= 10; i++) { const e = Math.pow(i / 10, 1.5), px = bez(s.p[0], s.p[2], s.p[4], s.p[6], e), py = bez(s.p[1], s.p[3], s.p[5], s.p[7], e); for (const hb of st.heroes) if (hb !== h && !hb.ch && inHull(hb, px, py, 0.08)) hb.grdHold = Math.max(hb.grdHold, s.dur + 24); } // anyone in its way sees it coming
          if (!pv) st.glint = { x: s.x + Math.cos(s.a) * Ls * 0.5, y: s.y + Math.sin(s.a) * Ls * 0.5, life: 0 };
        }
      } else if (s.st === 'fly') {
        s.k += 1 / s.dur;
        const p = s.p, kk = Math.min(1, s.k), e = Math.pow(kk, 1.5);
        if (s.kind === 'clash') { p[6] = h.hit[0]; p[7] = h.hit[1]; } // it follows them as they slide
        const tipBack = s.kind === 'graze' ? 0 : Ls * 0.45;
        s.x = bez(p[0], p[2], p[4], p[6], e); s.y = bez(p[1], p[3], p[5], p[7], e);
        s.a = Math.atan2(bezD(p[1], p[3], p[5], p[7], Math.max(0.02, e)), bezD(p[0], p[2], p[4], p[6], Math.max(0.02, e)));
        s.x -= Math.cos(s.a) * tipBack * e; s.y -= Math.sin(s.a) * tipBack * e;
        s.fl = 1; s.z = 1;
        if (s.cov && !s.knk && (1 - kk) * s.dur <= 10) { // the old master's palm: a wave of qi sent out to meet it (it knocks it aside when it gets there)
          s.knk = 1; const m = s.cov; m.cntHold = 14; if (st.palm.length > 3) st.palm.shift();
          st.palm.push({ s, x0: m.hit[0], y0: m.hit[1], x: m.hit[0], y: m.hit[1], a: 0, life: 0, max: 7 });
        }
        if (s.kind === 'graze' && !s.flinch && kk > 0.55) { s.flinch = 1; hit(st, h, 0.5, 'graze', u); s.surge = 0.6; }
        if (s.k >= 1) {
          const ix = s.x + Math.cos(s.a) * Ls * 0.5, iy = s.y + Math.sin(s.a) * Ls * 0.5;
          if (s.kind === 'clash') { s.st = 'grind'; s.k = 0; s.dur = 12 + RND() * 16; h.grdHold = Math.max(h.grdHold, s.dur + 24); st.flashes.push({ x: ix, y: iy, r: u * 0.03, life: 0, max: 5 }); s.flinch = 0; surge(st, s, ix, iy, s.a, V); guardNet(st, s, V); continue; }
          if (s.kind === 'clash') {
            hit(st, h, s.pw, 'clash', u);
            burst(st, ix, iy, 20, 0.012, s.a + Math.PI, 2.4, 0, V); burst(st, ix, iy, 7, 0.016, s.a + Math.PI - 0.6, 0.8, 0, V);
            st.flashes.push({ x: ix, y: iy, r: u * 0.045, life: 0, max: 7 });
            dust(st, h.x0 + h.dx, Y.rows[h.row], 3, V, 0.0018, 0.001);
            s.st = 'rebound'; s.k = 0; s.vx = u * (0.006 + RND() * 0.006); s.vy = -u * (0.012 + RND() * 0.008); s.spin = (RND() < 0.5 ? -1 : 1) * (0.35 + RND() * 0.2);
          } else if (s.kind === 'ground' || s.kind === 'dodge') { // into the stones at their feet (or where they stood)
            if (s.kind === 'ground') hit(st, h, s.pw * 0.7, 'ground', u);
            dust(st, ix, iy, 9, V, 0.0024, 0.0016);
            for (let i = 0; i < (pv ? 3 : 7); i++) { if (st.chips.length > 30) st.chips.shift(); st.chips.push({ x: ix, y: iy, vx: (RND() - 0.5) * u * 0.011, vy: -u * (0.005 + RND() * 0.009), rot: RND() * TAU, vr: (RND() - 0.5) * 0.6, s: u * (0.0018 + RND() * 0.0024), life: 0, gy: iy + u * (RND() * 0.012) }); }
            st.rings.push({ x: ix, y: iy + u * 0.002, r: u * 0.01, life: 0, max: 26 });
            burst(st, ix, iy, 8, 0.008, -Math.PI / 2, 2.2, 0, V);
            s.st = 'stuck'; s.k = 0; s.dur = 18 + RND() * 22;
          } else { s.st = 'ret'; s.k = 0; s.q = null; }
          s.flinch = 0;
        }
      } else if (s.st === 'stuck') {
        s.k += 1 / s.dur;
        const v = (1 - s.k) * u * 0.002 * Math.sin(st.t * 3.1); s.x += -Math.sin(s.a) * v * 0.3; s.y += Math.cos(s.a) * v * 0.3;
        if (s.k >= 1) { s.st = 'ret'; s.k = 0; s.q = null; }
      } else if (s.st === 'grind') { // pressed on the guard: sparks, the hero's arms buckling, feet sliding back
        s.k++; h.prsT = 1; h.shake = Math.max(h.shake, 0.35); s.surge = Math.max(s.surge || 0, 0.6); // the 마기 flickering hard against the guard
        const tr = u * 0.0018 * Math.sin(st.t * 3.3); s.x = h.hit[0] - Math.cos(s.a) * Ls * 0.47 - Math.sin(s.a) * tr; s.y = h.hit[1] - Math.sin(s.a) * Ls * 0.47 + Math.cos(s.a) * tr;
        h.vx = Math.min(h.vx, -u * 0.0014);
        if (s.k % 2 === 0) burst(st, h.hit[0], h.hit[1], 2, 0.008, s.a + Math.PI + (RND() - 0.5), 1.4, 0, V);
        if (s.k % 3 === 0) dust(st, h.x0 + h.dx + h.sz * 0.12, Y.rows[h.row], 1, V, 0.0006, 0.0005); // furrows behind their feet
        if (s.k >= s.dur) {
          const forced = RND() < 0.35 + 0.3 * (h.fat || 0);
          hit(st, h, forced ? 1.1 : 0.55, 'clash', u); if (!forced) h.grdHold = Math.max(h.grdHold, 20);
          burst(st, h.hit[0], h.hit[1], 10, 0.012, s.a + Math.PI, 2, 0, V); surge(st, s, h.hit[0], h.hit[1], s.a, V, 0.8);
          s.st = 'rebound'; s.k = 0; s.vx = u * (0.006 + RND() * 0.006) * (forced ? 0.6 : 1); s.vy = -u * (0.01 + RND() * 0.008); s.spin = (RND() < 0.5 ? -1 : 1) * (0.35 + RND() * 0.2); // turned aside
        }
      } else if (s.st === 'wall') { // snapped into a wall across a charge
        s.k++; slot(st, R, s.i, o); const e = ss(s.k / 6);
        s.x = lerp(o.x, s.wx, e) + (s.k > 8 && s.k < 16 ? Math.sin(s.k * 3) * u * 0.002 : 0); s.y = lerp(o.y, s.wy, e); s.a = turn(o.a, s.wa, e); s.z = 1; s.fl = 1;
        if (s.k > 26) { s.st = 'ret'; s.k = 0; s.q = null; s.retDur = 28; }
      } else if (s.st === 'rebound') {
        s.k += 1 / 10; s.x += s.vx; s.y += s.vy; s.vy += u * 0.0012; s.a += s.spin; s.spin *= 0.93;
        if (s.k >= 1) { s.st = 'ret'; s.k = 0; s.q = null; }
      } else if (s.st === 'ret') { // back round the outside of him (never across him), toward its place in the halo
        if (!s.q) planHome(st, s, u, s.retDur);
        if (homeA(st, s)) { s.st = 'orb'; s.k = 0; }
      } else if (s.st === 'orb') { // along the circle and in
        if (homeB(st, s)) { s.st = 'ring'; s.tr.length = 0; s.lay = 1; }
      }
      if (s.st !== 'aim') guardNet(st, s, V);
      s.hid = s.st !== 'ring' && s.st !== 'aim' && hideIn(st, s, Ls);
      if (s.st === 'fly' || s.st === 'ret' || s.st === 'rebound' || (s.st === 'orb' && s.lay)) { // the trail: no longer than a stretch of the way
        s.tr.unshift(s.x + Math.cos(s.a) * Ls * 0.5, s.y + Math.sin(s.a) * Ls * 0.5);
        const cap = u * (s.st === 'fly' ? 0.3 : 0.16); let d = 0, i = 2;
        for (; i < s.tr.length; i += 2) { d += Math.hypot(s.tr[i] - s.tr[i - 2], s.tr[i + 1] - s.tr[i - 1]); if (d > cap) break; }
        s.tr.length = Math.min(s.tr.length, i + 2, 40);
      } else if (s.tr.length) s.tr.length = Math.max(0, s.tr.length - 4);
    }

    // qi thrown back at him stops at the rim of his halo: he does not even look
    const rim = R.r + Ls * 0.45;
    for (const b of st.bolts) {
      b.x += b.vx; b.y += b.vy; b.tr.unshift(b.x, b.y); if (b.tr.length > 16) b.tr.length = 16;
      const dx = b.x - R.cx, dy = b.y - R.cy;
      if (Math.hypot(dx, dy / R.k) < rim) {
        b.dead = 1; st.hitAura = 1; st.hitAng = Math.atan2(dy / R.k, dx);
        burst(st, b.x, b.y, 18, 0.011, Math.atan2(-dy, -dx), 2.6, 1, V); burst(st, b.x, b.y, 8, 0.008, Math.atan2(-dy, -dx), 1.6, 0, V);
        st.flashes.push({ x: b.x, y: b.y, r: u * 0.045, life: 0, max: 7, c: 1 });
        st.retal = { h: b.h, at: st.t + 9 };
      }
    }
    st.bolts = st.bolts.filter((b) => !b.dead);
    // the pressure of his domain rolling out over the platform: grass flattened, dust thrown up, every one of them driven to a knee
    const pr = st.press;
    if (pr) { // the ring of 마기 running out over the ground; its echo behind
      pr.life++; pr.r += u * (0.042 * Math.exp(-pr.life / 22) + 0.0065); if (pr.life >= 8) pr.r2 += u * (0.036 * Math.exp(-(pr.life - 8) / 22) + 0.0055);
      if (st.pcr) st.pcr.r = Math.max(st.pcr.r, pr.r);
      for (const h of st.heroes) if (!pr.hit.has(h.i) && !h.ch && Y.cx - pr.r < h.x0 + h.dx + h.sz * 0.2) { // it reaches them: knees driven down, the ground caving under them
        pr.hit.add(h.i); hit(st, h, 1, 'press', u); h.crt = 1; h.gst = 1; h.lit = 1; h.prsHold = 26; h.fat = Math.min(1, (h.fat || 0) + 0.12);
        const fx = h.x0 + h.dx, fy = Y.rows[h.row]; dust(st, fx, fy, 7, V, 0.0028, 0.0018); st.rings.push({ x: fx, y: fy + u * 0.002, r: h.sz * 0.16, life: 0, max: 30 });
        for (let i = 0; i < (pv ? 2 : 4); i++) { if (st.chips.length > 30) st.chips.shift(); st.chips.push({ x: fx + (RND() - 0.5) * h.sz * 0.5, y: fy, vx: (RND() - 0.5) * u * 0.008, vy: -u * (0.006 + RND() * 0.008), rot: RND() * TAU, vr: (RND() - 0.5) * 0.6, s: u * (0.0018 + RND() * 0.002), life: 0, gy: fy + u * RND() * 0.008 }); }
        if (!pr.first) { pr.first = 1; st.hs = 0.45; st.hsp = [fx, fy - h.sz * 0.4]; st.tp = 0.35; }
      }
      for (const tf of st.tufts) if (Math.abs(tf.x - Y.cx) < pr.r) tf.fl = Math.max(tf.fl, 1 - pr.life / 110);
      if (pr.r < u * 1.1) { // a wall of dust thrown up behind its front, clods of earth jumping
        for (let i = 0; i < (pv ? 1 : 3); i++) { const a = Math.PI * (0.55 + RND() * 0.9), x = Y.cx + Math.cos(a) * pr.r, y = Math.max(Y.ey + u * 0.012, Y.gyC + Math.sin(a) * pr.r * 0.15); dust(st, x, y, 1, V, 0.0018, 0.0075); st.dust[st.dust.length - 1].cr = 1; } // a tall wall of dust (lit crimson) thrown up behind the front
        const fxL = Y.cx - pr.r; if (fxL > V.W * 0.12 && pr.life < 58) { // the storm of 마기 riding on it: smoke and flame tumbling forward, embers and tongues of it whipping round
          for (let i = 0; i < (pv ? 1 : 2); i++) { const a = Math.PI * (0.62 + RND() * 0.76), x = Y.cx + Math.cos(a) * pr.r, y = Math.max(Y.ey + u * 0.01, Y.gyC + Math.sin(a) * pr.r * 0.15) - u * 0.02; smoke(st, x, y, u, Math.cos(a) * u * 0.007, -u * 0.003); }
          if (pr.life % 2 === 0) { burst(st, fxL, Y.rows[1] - u * 0.02, 2, 0.014, Math.PI + 0.3, 1.2, 0, V); if (st.qtong.length < 30) st.qtong.push({ x: fxL + u * 0.02, y: lerp(Y.ey, Y.rows[0], RND()) - u * 0.03, vx: -u * 0.009, vy: -u * 0.003, c: (RND() < 0.5 ? -1 : 1) * (0.25 + RND() * 0.2), life: 0, max: 12 + RND() * 8 }); }
        }
        if (pr.life % 2 === 0) { const a = Math.PI * (0.6 + RND() * 0.8), x = Y.cx + Math.cos(a) * pr.r, y = Math.max(Y.ey + u * 0.012, Y.gyC + Math.sin(a) * pr.r * 0.15); if (st.chips.length > 30) st.chips.shift(); st.chips.push({ x, y, vx: Math.cos(a) * u * 0.004, vy: -u * (0.006 + RND() * 0.007), rot: RND() * TAU, vr: (RND() - 0.5) * 0.6, s: u * (0.0016 + RND() * 0.002), life: 0, gy: y + u * 0.004 }); }
      }
      if (pr.life > 72) st.press = null;
    }
    for (const h of st.heroes) { if (h.crt) h.crt = h.crt > 0.01 ? h.crt * 0.985 : 0; if (h.gst) h.gst = h.gst > 0.01 ? h.gst * 0.94 : 0; } // (the gust tearing at them dies away over a second)
    if (st.pcr && !st.press && !(st.dom && st.dom.type === 'press')) { st.pcr.a = (st.pcr.a || 0) + 1; if (st.pcr.a > 40) st.pcr = null; } // (the cracks outlast it a little, then are gone)
    for (const tf of st.tufts) tf.fl *= 0.986;

    // particles
    for (const p of st.sparks) { p.life++; p.x += p.vx; p.y += p.vy; p.vx *= 0.91; p.vy = p.vy * 0.91 + u * 0.0006; }
    st.sparks = st.sparks.filter((p) => p.life < p.max);
    for (const p of st.dust) { p.life++; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.r += u * 0.0006; p.x += (p.x < Y.cx ? 1 : -1) * (st.press ? -2 : 0.25 + 4 * (st.pull || 0)) * u * 0.0006; }
    st.dust = st.dust.filter((p) => p.life < p.max);
    for (const p of st.chips) { p.life++; p.x += p.vx; p.y += p.vy; p.vy += u * 0.0011; p.rot += p.vr; if (p.y > p.gy) { p.y = p.gy; p.vy *= -0.3; p.vx *= 0.5; p.vr *= 0.5; } }
    st.chips = st.chips.filter((p) => p.life < 46);
    for (const r of st.rings) { r.life++; r.r += u * 0.006 * (1 - r.life / r.max); }
    st.rings = st.rings.filter((r) => r.life < r.max);
    for (const f of st.flashes) f.life++;
    st.flashes = st.flashes.filter((f) => f.life < f.max);
    for (const q of st.shat) q.life++;
    if (st.smk && st.smk.length) { for (const p of st.smk) { p.life++; const cs = Math.cos(p.sw * 0.3), sn = Math.sin(p.sw * 0.3), vx = p.vx * cs - p.vy * sn; p.vy = (p.vx * sn + p.vy * cs) * 0.93 - u * 0.00015; p.vx = vx * 0.93; p.x += p.vx; p.y += p.vy; p.r += u * 0.0007; p.rot += p.sw; } st.smk = st.smk.filter((p) => p.life < p.max); }
    for (const q of st.palm) { // the palm's wave travelling out; where it reaches the blade it turns it aside
      q.life++; const w = q.s, e = Math.min(1, q.life / q.max), bx = w.x + Math.cos(w.a) * Ls * 0.3, by = w.y + Math.sin(w.a) * Ls * 0.3;
      q.a = Math.atan2(by - q.y0, bx - q.x0); q.x = lerp(q.x0, bx, ss(e) * 0.4 + e * 0.6); q.y = lerp(q.y0, by, ss(e) * 0.4 + e * 0.6);
      if (q.life === q.max && w.st === 'fly' && w.cov) {
        st.flashes.push({ x: bx, y: by, r: u * 0.04, life: 0, max: 6, c: 1 }); burst(st, bx, by, 12, 0.012, q.a, 1.8, 1, V); surge(st, w, bx, by, w.a, V);
        if (w.pt) w.pt.shake = Math.max(w.pt.shake, 0.5);
        w.st = 'rebound'; w.k = 0; w.vx = u * (0.008 + RND() * 0.004); w.vy = -u * (0.014 + RND() * 0.006); w.spin = 0.45; w.cov = null;
      }
    }
    st.palm = st.palm.filter((q) => q.life < q.max + 4);
    for (const q of st.qrip) q.life++;
    st.qrip = st.qrip.filter((q) => q.life < q.max);
    for (const p of st.qtong) { p.life++; const cc = Math.cos(p.c), sn = Math.sin(p.c), vx = p.vx * cc - p.vy * sn; p.vy = (p.vx * sn + p.vy * cc) * 0.93 - u * 0.0002; p.vx = vx * 0.93; p.x += p.vx; p.y += p.vy; }
    st.qtong = st.qtong.filter((p) => p.life < p.max);
    for (const p of st.qmote) { p.life++; p.x += p.vx; p.y += p.vy; if (p.sh) { p.vy += u * 0.0009; p.vx *= 0.96; p.rot += 0.3; } else { p.vx *= 0.97; p.vy *= 0.985; } }
    st.qmote = st.qmote.filter((p) => p.life < p.max);
    st.shat = st.shat.filter((q) => q.life < 14);
    const lw = st.lost; // a weapon knocked out of a hero's hands: it spins down and sticks in the stones until they come for it
    if (lw) {
      lw.life++;
      if (!lw.stuck) { lw.vy += u * 0.0011; lw.x += lw.vx; lw.y += lw.vy; lw.rot += lw.vr; if (lw.y >= lw.gy && lw.vy > 0) { lw.stuck = 1; lw.y = lw.gy; lw.rot = Math.PI / 2 + (RND() - 0.5) * 0.7; dust(st, lw.x, lw.gy, 3, V, 0.0012, 0.001); } }
      else if (lw.life > 170 && !lw.h.ch && lw.h.knl < 0.3) { lw.fade = (lw.fade || 0) + 1; if (lw.fade > 20) { lw.h.noWpn = 0; st.lost = null; } }
    }
    if (st.glint) { st.glint.life++; if (st.glint.life > 6) st.glint = null; }
    for (const l of st.leaves) { // drawn round him, spiralling in; his domain throws them out again
      const fz = 1 - (st.prz || 0); l.ph += l.sp * fz;
      l.r += fz * (st.press || (st.slash && st.slash.hitK > 0.5) ? 0.012 : -(0.0015 + 0.0012 * l.z) * ((st.slash && st.slash.k > SL.gat && st.slash.k < SL.dash) || st.pull > 0.3 ? 3 : 1)); l.a += fz * 0.005 + 0.011 / (l.r + 0.3);
      if (l.r < 0.12 || l.r > 1.5) { l.r = 0.9 + RND() * 0.45; l.a = RND() * TAU; }
    }
  }

  /**
   * Adaptive quality: the frame's own cost, smoothed over about a second. Above QB for about 2 s steps down a level
   * (1: fewer particles; 2: outlines rebuilt less often, fewer aura frames, one fog band less; 3: secondary passes
   * dropped); well under it for about 5 s steps back up (longer while it keeps bouncing). st.qForce pins a level.
   */
  const QB = 2.5; // ms a frame
  function qualityTick(st, dt) {
    if (st.qForce !== undefined) { st.q = st.qForce; return; }
    if (st.t < 20) return; // the first frames build sprites and layers
    st.qe = st.qe === undefined ? dt : st.qe + (Math.min(dt, QB * 4) - st.qe) * 0.033;
    if (st.qe > QB) { st.qHi = (st.qHi || 0) + 1; st.qLo = 0; } else if (st.qe < QB * 0.45) { st.qLo = (st.qLo || 0) + 1; st.qHi = 0; } else st.qHi = st.qLo = 0;
    if (st.qHi > 60 && st.q < 3) { st.q++; st.qHi = 0; st.qBo = st.t - (st.qUp || -1e9) < 300 ? Math.min(5, (st.qBo || 0) + 1) : 0; } // stepping down soon after stepping up: wait longer next time
    if (st.qLo > 150 * (1 + (st.qBo || 0)) && st.q > 0) { st.q--; st.qLo = 0; st.qUp = st.t; }
  }

  /*
   * 흡공, how each of them moves while it has them: a target pose built every frame from their state (heels dug in and
   * leaning back on the stones; in the air legs kicking and the body twisting to irregular rhythms of their own, each
   * fighting it their own way; thrown clear, the legs reaching for the ground), eased into so nothing snaps. The sink
   * of a landing goes on top unsmoothed, so the hips carry the speed of the fall into the knees.
   */
  const mixT = (o, q, k) => { for (const key of PK) o[key] = key === 'wa' ? turn(o.wa, q.wa, k) : o[key] + (q[key] - o[key]) * k; }; // (the weapon's angle the short way round)
  const KICK = { monk: [1, 1, 1], taoist: [0.75, 0.75, 0.8], beggar: [0.9, 0.85, 0.9], woman: [1.15, 1, 1], master: [0.6, 0.5, 0.7] }; // kick rate, kick size, twist
  function abPose(hh, b, pz, PZ, t, s, X, Yg, st, gy) {
    const tg = hh.abt || (hh.abt = P({})), sm = hh.abp || (hh.abp = P({})), ty = hh.type, sd = b.sd, KK = KICK[ty], kr = KK[0], ka = KK[1], tw = KK[2];
    for (const k of PK) tg[k] = pz[k];
    if (!b.p0) { for (const k of PK) sm[k] = pz[k]; b.p0 = 1; b.lp = sd; b.dp = sd * 0.37; b.sp = pz.wa; b.sph = 0; b.sdu = 22; b.sc = 0; }
    let rate = 0.3, ar = 0;
    let al = null; if (ty === 'master' && b.ph === 'pull') for (const o of st.heroes) if (o !== hh && o.ab && o.ab.ph === 'pull' && o.X > X && (!al || o.X < al.X)) al = o; // the friend he holds on to
    if (b.ph === 'pull') {
      const air = b.air, gw = 1 - air, ul = b.ul, ls = b.ls, kk = ka * (1 - 0.55 * ls);
      b.lp += (0.2 + 0.1 * nz(t * 0.04 + sd + 6)) * kr * air; // their own rhythm: the kicks quicken and falter
      // on the stones: heels dug in, leaning back against it; the back foot comes up first, then the front heel
      const dg = Math.max(0, Math.sin(b.dp)) * (1 - ss((ul - 0.35) / 0.25)); b.dp += (0.1 + 0.08 * nz(t * 0.03 + sd + 30)) * gw; // now and then the back foot steps back to dig in again
      tg.hy = (-0.37 + 0.02 * nz(t * 0.11 + sd + 1) + 0.015 * dg) * gw + (-0.45) * air;
      tg.ln = (-0.2 - 0.12 * ul + 0.09 * nz(t * 0.07 + sd + 2) - 0.04 * dg) * gw + (-0.06 + 0.2 * tw * nz(t * 0.055 + sd + 4)) * air;
      tg.hd = (-0.1 + 0.2 * nz(t * 0.06 + sd + 3)) * gw + (-0.08 + 0.26 * nz(t * 0.07 + sd + 5)) * air;
      tg.fx = (0.3) * gw + (0.05 + 0.09 * kk * Math.sin(b.lp)) * air; tg.fy = (-0.045 * ss((ul - 0.75) / 0.25)) * gw + (0.05 - 0.11 * kk * Math.max(0, Math.sin(b.lp + 0.5))) * air;
      tg.bx = (-0.24 - 0.04 * ul - 0.05 * dg) * gw + (-0.21 + 0.08 * kk * Math.sin(b.lp + 2.6 + 0.6 * nz(t * 0.05 + sd + 7))) * air; tg.by = (-0.07 * ss((ul - 0.4) / 0.35) - 0.035 * ss((ul - 0.5) / 0.3) * Math.max(0, Math.sin(t * 0.37 + sd)) - 0.05 * dg) * gw + (0.05 - 0.12 * kk * Math.max(0, Math.sin(b.lp + 3.6))) * air;
      // the arms: on the stones the weapon rammed down at them (it scrapes and jolts); in the air each fights it their own way
      const gwa = 1.2 + 0.2 * nz(t * 0.23 + sd + 22) + 0.12 * nz(t * 0.6 + sd + 31);
      if (ty !== 'master' && !hh.noWpn) { tg.ax = 0.22 + 0.035 * nz(t * 0.3 + sd + 20); tg.ay = 0.16 + 0.04 * nz(t * 0.27 + sd + 21); tg.wa = gwa; tg.g2 = 1; tg.gd = 0.22; }
      const fl = ss((air - 0.5) / 0.4); // (the struggle in the air takes over from the bracing as they leave the ground)
      if (fl > 0.001) {
        if (ty === 'monk') { // the staff whirled to cut the current, its speed rising and falling; the other hand clawing back at the ground
          b.sp += (0.3 + 0.22 * nz(t * 0.05 + sd + 8)) * fl;
          tg.ax = lerp(tg.ax, 0.1 + 0.05 * Math.cos(b.sp * 0.5), fl); tg.ay = lerp(tg.ay, -0.22 + 0.04 * Math.sin(b.sp * 0.5), fl); tg.g2 = lerp(tg.g2, 0, fl); tg.wa = turn(gwa, b.sp, fl);
          tg.cx = lerp(tg.cx, -0.17 + 0.08 * nz(t * 0.09 + sd + 9), fl); tg.cy = lerp(tg.cy, 0.08 + 0.12 * nz(t * 0.08 + sd + 10), fl);
        } else if (ty === 'woman') { // slashing at the coils: wound up over the shoulder, a fast cut, a beat to recover, each a different length
          b.sph += 1 / b.sdu; if (b.sph >= 1) { b.sph -= 1; b.sc++; b.sdu = 15 + 13 * hsh(b.sc + Math.floor(sd)); }
          const e = b.sph, w1 = ss(e / 0.6), w2 = ss((e - 0.6) / 0.1), w3 = ss((e - 0.72) / 0.28);
          const sx = lerp(lerp(lerp(0.18, 0, w1), 0.3, w2), 0.18, w3), sy = lerp(lerp(lerp(-0.08, -0.27, w1), 0.05, w2), -0.08, w3), sw = lerp(lerp(lerp(-0.6, -2.4, w1), 0.8, w2), -0.6, w3);
          tg.ax = lerp(tg.ax, sx, fl); tg.ay = lerp(tg.ay, sy, fl); tg.wa = turn(gwa, sw, fl); tg.g2 = lerp(tg.g2, 0, fl);
          tg.cx = lerp(tg.cx, -0.2 + 0.06 * nz(t * 0.1 + sd + 11), fl); tg.cy = lerp(tg.cy, -0.1 + 0.08 * nz(t * 0.09 + sd + 12), fl); rate = 0.55;
        } else if (ty === 'beggar') { // the bamboo staff braced down at the stones below him, jabbing for a hold
          tg.ax = lerp(tg.ax, 0.1 + 0.05 * nz(t * 0.15 + sd + 13), fl); tg.ay = lerp(tg.ay, 0.2 + 0.03 * nz(t * 0.2 + sd + 14), fl); tg.wa = turn(gwa, 1.95 + 0.25 * nz(t * 0.18 + sd + 15), fl); tg.g2 = 1; tg.gd = lerp(tg.gd, 0.26, fl);
        } else if (ty === 'taoist') { // the sword held out at the current, the other hand in a sword seal before his face, thrust out with each effort
          tg.ax = lerp(tg.ax, 0.25, fl); tg.ay = lerp(tg.ay, -0.02 + 0.03 * nz(t * 0.1 + sd + 16), fl); tg.wa = turn(gwa, 0.3 + 0.18 * nz(t * 0.09 + sd + 17), fl); tg.g2 = lerp(tg.g2, 0, fl);
          tg.cx = lerp(tg.cx, 0.1 + 0.07 * Math.max(0, nz(t * 0.12 + sd + 18)), fl); tg.cy = lerp(tg.cy, -0.2 + 0.02 * nz(t * 0.1 + sd + 19), fl);
        }
      }
      if (ty === 'master') { // one hand holding on to his friend, the other palm pushing his own qi back at the current
        const sh = [tg.hx + Math.sin(tg.ln) * SP * 0.88, tg.hy - Math.cos(tg.ln) * SP * 0.88];
        if (al) {
          const r = b.r, c0 = Math.cos(r), s0 = Math.sin(r), pv = s * 0.3, wx = (al.X - al.sz * 0.05 - X) / s, wy = (al.Yg - al.sz * 0.5 - (Yg - pv)) / s, lx = c0 * wx + s0 * wy, ly = -s0 * wx + c0 * wy - 0.3; // (his friend, in his own turned frame)
          const vx = lx - sh[0], vy = ly - sh[1], dd = Math.hypot(vx, vy) || 1, rr = Math.min(0.29, dd);
          b.gr = (b.gr || 0) + (1 - (b.gr || 0)) * 0.1; tg.ax = lerp(0.24, (vx / dd) * rr + 0.008 * nz(t * 0.4 + sd + 23), b.gr); tg.ay = lerp(-0.04, (vy / dd) * rr + 0.008 * nz(t * 0.37 + sd + 24), b.gr);
        } else { b.gr = 0; tg.ax = 0.26; tg.ay = -0.05 + 0.03 * nz(t * 0.2 + sd + 25); }
        tg.cx = 0.24 + 0.05 * Math.max(0, nz(t * 0.2 + sd + 26)); tg.cy = -0.13 + 0.03 * nz(t * 0.17 + sd + 27);
      }
      if (ls > 0.01) { mixT(tg, PZ.cnt, 0.35 * ls); tg.hd -= 0.1 * ls; } // gathering themselves for it
      ar = air;
    } else if (b.ph === 'free') { // flung clear: arms out, legs tucked, then reaching down for the stones as they come
      const tti = (gy - b.y) / Math.max(b.vy, s * 0.004), ext = ss(1 - tti / 9);
      const fo = 1 - ss(b.k / 9), ka2 = ka * (1 - ext) * 0.6; b.lp += 0.16 * kr * (1 - ext); // (the burst flings the arms wide; they come back in to guard as the stones come up)
      for (const k of ARM) if (k !== 'hd') tg[k] = PZ.grd[k];
      tg.ax = lerp(tg.ax, 0.28, fo) + 0.04 * nz(t * 0.2 + sd + 32); tg.ay = lerp(tg.ay, -0.16, fo) + 0.05 * nz(t * 0.17 + sd + 33); tg.cx = lerp(tg.cx - 0.08, -0.26, fo) + 0.05 * nz(t * 0.19 + sd + 34); tg.cy = lerp(tg.cy - 0.04, -0.12, fo) + 0.07 * nz(t * 0.15 + sd + 35);
      tg.hy = -0.43; tg.ln = lerp(-0.18, 0.24, ext) + 0.08 * nz(t * 0.08 + sd + 36) * (1 - ext); tg.hd = lerp(-0.1, 0.2, ext) + 0.12 * nz(t * 0.1 + sd + 37) * (1 - ext);
      tg.fx = lerp(0.13, 0.19, ext) + 0.07 * ka2 * Math.sin(b.lp); tg.fy = lerp(-0.07, 0.03, ext) - 0.05 * ka2 * Math.max(0, Math.sin(b.lp + 0.5)); tg.bx = lerp(-0.1, -0.21, ext) + 0.06 * ka2 * Math.sin(b.lp + 2.8); tg.by = lerp(-0.05, 0.03, ext) - 0.05 * ka2 * Math.max(0, Math.sin(b.lp + 3.6));
      rate = 0.35; ar = 1;
    } else if (b.ph === 'land' || b.ph === 'rec') { // down on a knee, head hanging, a hand on the knee, breathing hard; looking up at him before they rise
      const up = b.ph === 'rec' ? ss((b.k - b.rest + 4) / 8) : 0, br = Math.sin(t * 0.45 + sd);
      tg.hd += 0.22 * (1 - up) - 0.15 * up; tg.hy += 0.012 * br; tg.ln += 0.06 + 0.03 * Math.sin(t * 0.45 + sd + 1);
      if (tg.g2 < 0.5) { tg.cx = lerp(0.12, tg.cx, up); tg.cy = lerp(0.3, tg.cy, up); }
      ar = b.air;
    } else rate = 0.2; // walking back: easing into their own stance again
    for (const k of PK) { if (k === 'wa') sm.wa = turn(sm.wa, tg.wa, rate); else sm[k] += (tg[k] - sm[k]) * (rate === 0.55 && (k === 'ax' || k === 'ay') ? 0.55 : Math.min(rate, 0.35)); }
    const W = b.ph === 'walk' ? 1 - ss(b.k / 14) : 1;
    for (const k of PK) { if (k === 'wa') pz.wa = turn(pz.wa, sm.wa, W); else pz[k] += (sm[k] - pz[k]) * W; }
    if (b.cr > 0.001) { mixT(pz, PZ.knl, Math.min(1, b.cr)); pz.ln += 0.1 * b.cr + 0.5 * Math.max(0, b.cr - 1); pz.hd += 0.4 * Math.max(0, b.cr - 1); } // the landing taken in the knees (a hard one folds them over it)
    pz.ar = ar;
  }


  /*
   * The grade: the whole picture painted on hanji (닥종이) and graded like a still from a boss fight, out of a few
   * sprites built once per size and mode and a few draws a frame. The paper: long thin mulberry fibres every which way,
   * some darker and some lighter than the pulp, clumping here and there, a cloudy uneven pulp, a few flecks of bark;
   * dyed with ink on a dark page (its fibres a touch paler, and warm where his crimson light comes through), a
   * hint of ivory on a light one, all of it kept faint (HJ). It lies under the figures, on the sky, the peaks and the
   * stones, and stays still, as paper does; no paler fibre lies behind the text on the left. Under it the scene's own pixels (never the theme behind them: 'source-atop') are pulled toward
   * cold ink, and toward a dark crimson round him and in the sky over him. A vignette only ever darkens: the edges and
   * corners, bleeding dark crimson on his side; on a light page an ink wash kept off the top left, where the text
   * starts. His power breathes in it: through his great moves the edges deepen and redden, and a big blow drains the
   * colour for a few frames (no flash, nothing brighter).
   */
  function gradeSprites(V, Y, L, h, dpr) {
    const { W, H } = V, sw = 192, sh = Math.max(24, Math.round((sw * H) / W)), vh = Math.max(24, Math.round((sw * h) / W));
    const radial = (x, cx, cy, r, stops, sy) => { const y = sy || 1; x.save(); x.translate(cx, cy); x.scale(1, y); const g = x.createRadialGradient(0, 0, 0, 0, 0, r); for (const [k, c] of stops) g.addColorStop(k, c); x.fillStyle = g; x.fillRect(-cx, -cy / y, x.canvas.width, x.canvas.height / y); x.restore(); };
    const tone = K.mk(sw, sh), t = tone.getContext('2d'), mx = ((Y.cx + V.u * 0.02) / W) * sw, my = ((Y.hipY - Y.hc * 0.3) / H) * sh, hx = ((Y.gx - V.u * 0.2) / W) * sw, hy = ((Y.rows[1] - V.u * 0.06) / H) * sh; // (in scene space: it moves with what it tints)
    t.fillStyle = L ? 'rgba(60,44,30,0.05)' : 'rgba(6,10,24,0.12)'; t.fillRect(0, 0, sw, sh); // cold ink in everything: the shadows colder and deeper (darker only: the blacks stay black)
    radial(t, sw * 0.6, sh * 0.6, sw * 0.62, L ? [[0, 'rgba(60,44,30,0)'], [0.4, 'rgba(60,44,30,0)'], [1, 'rgba(60,44,30,0.18)']] : [[0, 'rgba(6,9,20,0)'], [0.35, 'rgba(6,9,20,0.06)'], [1, 'rgba(6,9,20,0.42)']], 0.75); // more of it away from the fight
    radial(t, hx, hy, sw * 0.3, L ? [[0, 'rgba(40,52,84,0.1)'], [1, 'rgba(40,52,84,0)']] : [[0, 'rgba(8,14,36,0.24)'], [1, 'rgba(8,14,36,0)']], 0.8); // their side colder and dimmer: they are outmatched
    const sky = t.createLinearGradient(0, 0, 0, sh * 0.55); sky.addColorStop(0, L ? 'rgba(150,34,44,0.05)' : 'rgba(170,22,36,0.08)'); sky.addColorStop(1, 'rgba(170,22,36,0)'); t.fillStyle = sky; t.fillRect(sw * 0.45, 0, sw * 0.55, sh);
    radial(t, mx, my, sw * 0.4, L ? [[0, 'rgba(170,26,40,0.11)'], [1, 'rgba(170,26,40,0)']] : [[0, 'rgba(200,22,38,0.17)'], [0.55, 'rgba(180,20,34,0.07)'], [1, 'rgba(180,20,34,0)']], 0.85); // the moon, his halo and his aura deep crimson
    const vig = (c, a, inn, cy) => { const v = K.mk(sw, vh), x = v.getContext('2d'); // (over what is on screen: the preview's window too)
      radial(x, sw * 0.54, vh * (cy || 0.56), sw * 0.74, [[0, `rgba(${c},0)`], [inn, `rgba(${c},0)`], [inn + (1 - inn) * 0.45, `rgba(${c},${a * 0.4})`], [inn + (1 - inn) * 0.8, `rgba(${c},${a * 0.78})`], [1, `rgba(${c},${a})`]], vh / sw * 1.25);
      return [v, x]; };
    const mot = K.noiseTex('chmVig', 192, 112, { px: 5, py: 3, oct: 4, lo: 0.32, hi: 0.78, seed: 9 }); // (mottled like smoke, or ink soaked into old paper: not a ruled gradient)
    const keepTL = (x, a) => radial(x, 0, 0, sw * 0.62, [[0, `rgba(0,0,0,${a})`], [0.6, `rgba(0,0,0,${a * 0.55})`], [1, 'rgba(0,0,0,0)']], 1.1); // (with 'destination-out': nothing added over the text at the top left)
    const [vg, vx] = vig(L ? '58,44,32' : '2,3,8', L ? 0.26 : 0.8, L ? 0.42 : 0.32); // heavy, smoky, reaching in toward the middle
    radial(vx, sw * 0.86, vh * 0.12, sw * 0.58, L ? [[0, 'rgba(150,30,40,0.13)'], [1, 'rgba(150,30,40,0)']] : [[0, 'rgba(84,6,14,0.5)'], [0.5, 'rgba(70,5,12,0.24)'], [1, 'rgba(70,5,12,0)']], 0.95); // a blood-red sky behind him, darker than what it covers
    vx.globalCompositeOperation = 'destination-out'; vx.globalAlpha = 0.45; vx.drawImage(mot, 0, 0, sw, vh); vx.globalAlpha = 1;
    if (L) keepTL(vx, 0.92);
    const [red, rx] = vig(L ? '150,28,40' : '30,2,6', L ? 0.1 : 0.7, 0.36); // his power: the edges deep red-black
    rx.globalCompositeOperation = 'destination-out'; rx.globalAlpha = 0.45; rx.drawImage(mot, sw, 0, -sw, vh); rx.globalAlpha = 1;
    keepTL(rx, L ? 0.92 : 0.7);
    const [tun, tx] = vig(L ? '58,44,32' : '6,1,4', L ? 0.2 : 0.72, 0.14, 0.66); // (centred low enough to keep the five in it) // tunnel vision: the dark reaching in almost to the middle
    tx.globalCompositeOperation = 'destination-out'; tx.globalAlpha = 0.4; tx.drawImage(mot, 0, 0, sw, vh); tx.globalAlpha = 1; if (L) keepTL(tx, 0.92);
    return { tone, vg, red, tun, paper: hanji(V, Y, L, h, dpr) };
  }
  function hanji(V, Y, L, h, dpr) { // (at the screen's own pixels, scale fixed in pixels: crisp, and never stretched with the window)
    const W = V.W, sc = Math.min(dpr || 1, 3, Math.sqrt(5e6 / Math.max(1, W * h))), c = K.mk(W * sc, h * sc), x = c.getContext('2d'), R = K.rng(7331);
    x.scale(sc, sc); x.lineCap = 'round';
    if (L) { x.fillStyle = `rgba(236,220,186,${0.17 * HJ})`; x.fillRect(0, 0, W, h); } // a hint of ivory
    const cx1 = Math.max(2, Math.round(W / 50)), cy1 = Math.max(2, Math.round(h / 50)), cx2 = Math.max(4, Math.round(W / 18)), cy2 = Math.max(3, Math.round(h / 18)); // pulp clouds some 50 px across, a finer one some 18
    const p1 = K.noiseTex(`chmPulp${cx1}x${cy1}`, Math.min(1024, cx1 * 16), Math.min(640, cy1 * 16), { px: cx1, py: cy1, oct: 3, lo: 0.25, hi: 0.8, seed: 21 }), p2 = K.noiseTex(`chmPulq${cx2}x${cy2}`, Math.min(1536, cx2 * 8), Math.min(960, cy2 * 8), { px: cx2, py: cy2, oct: 2, lo: 0.4, hi: 0.9, seed: 22 });
    x.globalAlpha = (L ? 0.15 : 0.3) * HJ * 0.8; x.drawImage(K.tint(p1, L ? '#9c7c52' : '#02040b'), 0, 0, W, h); // the pulp, thicker here and thinner there (only ever darker)
    x.globalAlpha = (L ? 0.1 : 0.18) * HJ * 0.8; x.drawImage(K.tint(p2, L ? '#8a6c46' : '#02040b'), 0, 0, W, h);
    const mx = Y.cx + V.u * 0.02, my = Y.hipY - Y.hc * 0.3 - V.oy, n = Math.round(Math.min(2200, (900 * W * h) / (1280 * 760)) * (V.pv ? 0.4 : 1) * Math.min(1, HJ + 0.1));
    let x0 = 0, y0 = 0, a0 = 0;
    for (let i = 0; i < n; i++) { // the fibres: hair-fine and short, every which way, a few lying together
      if (i && R() < 0.3) { x0 += (R() - 0.5) * 6; y0 += (R() - 0.5) * 6; a0 += (R() - 0.5) * 0.7; } else { x0 = R() * W; y0 = R() * h; a0 = R() * TAU; }
      const len = 3.5 + 25 * R() * R(), cv = (R() - 0.5) * 0.6 * len, ca = Math.cos(a0), sa = Math.sin(a0), x1 = x0 + ca * len, y1 = y0 + sa * len, qx = (x0 + x1) / 2 - sa * cv, qy = (y0 + y1) / 2 + ca * cv;
      const side = ss(((x0 + x1) / 2 / W - 0.3) / 0.4 + 0.25), pale = R() < (L ? 0.3 : 0.42); // (side: 0 behind the text on the left, 1 out on his side)
      if (pale && !L && side < 0.02) continue; // (no paler fibre behind the text)
      let col;
      if (pale) { const d = Math.hypot(((x0 + x1) / 2 - mx) / (V.u * 0.5), ((y0 + y1) / 2 - my) / (V.u * 0.45)), wm = d > 1 ? 0 : 1 - d * d; col = L ? '255,252,242' : `${Math.round(150 + 70 * wm)},${Math.round(160 - 40 * wm)},${Math.round(190 - 60 * wm)}`; x.globalAlpha = (L ? 0.55 + 0.4 * R() : (0.09 + 0.12 * R()) * side) * HJ; } // (warm where his light comes through the paper)
      else { col = L ? '104,80,50' : '0,0,0'; x.globalAlpha = (L ? 0.13 + 0.18 * R() : 0.3 + 0.35 * R()) * (0.5 + 0.5 * side) * HJ; }
      x.strokeStyle = `rgb(${col})`; x.lineWidth = 0.3 + R() * R() * 0.65; // (hair-fine: a pixel at most)
      x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(qx, qy, x1, y1); x.stroke();
    }
    x.fillStyle = L ? 'rgb(84,56,30)' : 'rgb(0,0,0)'; // tiny flecks of bark caught in the pulp
    for (let i = 0; i < n * 0.06; i++) { const fx = R() * W, fy = R() * h, r = 0.2 + R() * 0.35; x.globalAlpha = ((L ? 0.2 : 0.32) + R() * 0.3) * HJ; x.beginPath(); x.ellipse(fx, fy, r * (1 + R()), r, R() * TAU, 0, TAU); x.fill(); }
    x.globalAlpha = 1;
    return c;
  }

  /**
   * 천마일검's shock, made of his 마기 (cached, a few variants each): the red-warped air ahead of its point (+x); the
   * sheath of the break (a dark turbulent body, a crisp but ragged crimson rim with a white-hot edge, smoke curling
   * off its back); and the shock rings (a circle, squashed edge-on when drawn): a broken, uneven band of black smoke
   * and crimson, torn open in places, wisps peeling off it and embers riding its front. Light: ink, crimson ink, bare paper.
   */
  /**
   * The storm of 마기 on the pressure wave, on a dark page: billows of smoke (a few shapes, cached), each a cauliflower
   * of soft lobes, its core near black and darkest toward the back, its crown and front (up, and ahead: -x) rimmed in
   * ember light from the hot front and the lightning, its underside a dusky crimson where the ring's glow catches it;
   * and each shape whole in pale crimson, for a flash of lightning lighting it from inside.
   */
  const STA = (() => { const n = 512, c = [0]; for (let i = 1; i <= n; i++) { const a = Math.PI * (0.58 + (0.84 * (i - 0.5)) / n); c.push(c[i - 1] + Math.sqrt(Math.sin(a) ** 2 + 0.0225 * Math.cos(a) ** 2)); } const o = []; let j = 0; for (let k = 0; k <= 128; k++) { const s = (c[n] * k) / 128; while (j < n && c[j + 1] < s) j++; o.push(Math.PI * (0.58 + (0.84 * (j + (s - c[j]) / (c[j + 1] - c[j] || 1))) / n)); } return o; })(); // (the storm's places round the ring, evenly spaced along it as seen)
  function stormSprites(one) { // (one: make just the next of them; ahead of the slam, a frame each)
    let out = K.cache.get('chmStorm1'); if (!out) { out = { body: [], lit: [] }; K.cache.set('chmStorm1', out); }
    const S = 128;
    while (out.body.length < 3) {
      const v = out.body.length;
      const R = K.rng(71 + v * 13), m = K.mk(S, S), mx = m.getContext('2d');
      const lobe = (x, y, r) => { const g = mx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.8, 'rgba(255,255,255,0.97)'); g.addColorStop(1, 'rgba(255,255,255,0)'); mx.fillStyle = g; mx.fillRect(x - r, y - r, r * 2, r * 2); };
      lobe(64, 74, 34 + R() * 4);
      for (let k = 0; k < 7; k++) { const a = Math.PI * (1.0 + k / 6) + (R() - 0.5) * 0.3, r = 15 + R() * 8, d = Math.min(58 - r, 22 + R() * 10); lobe(64 + Math.cos(a) * d, 70 + Math.sin(a) * d * 0.9, r); } // (a crown of lobes, and smaller ones on them)
      for (let k = 0; k < 9; k++) { const a = Math.PI * (0.96 + (1.08 * k) / 8) + (R() - 0.5) * 0.2, r = 7 + R() * 7, d = Math.min(60 - r, 36 + R() * 10); lobe(64 + Math.cos(a) * d, 70 + Math.sin(a) * d * 0.85, r); }
      for (const a of [0.12, 0.88]) { const r = 15 + R() * 5; lobe(64 + Math.cos(Math.PI * a) * 30, 72 + Math.sin(Math.PI * a) * 22, r); }
      mx.globalCompositeOperation = 'destination-out'; mx.globalAlpha = 0.6; mx.drawImage(K.noiseTex('chmStormN' + v, 64, 64, { px: 5, py: 5, oct: 3, lo: 0.48, hi: 0.82, warp: 1.1, seed: 13 + v }), 0, 0, S, S); mx.globalAlpha = 1; mx.globalCompositeOperation = 'source-over'; // (torn and thinned in places: smoke, not cotton)
      m.__k = 'chmStormM' + v;
      const b = K.mk(S, S), bx = b.getContext('2d');
      bx.drawImage(m, 0, 0); bx.globalCompositeOperation = 'source-in'; bx.fillStyle = 'rgb(12,3,7)'; bx.fillRect(0, 0, S, S);
      bx.globalCompositeOperation = 'source-atop';
      let g = bx.createLinearGradient(0, S * 0.5, 0, S); g.addColorStop(0, 'rgba(130,20,36,0)'); g.addColorStop(0.6, 'rgba(150,24,40,0.5)'); g.addColorStop(1, 'rgba(196,40,52,0.92)'); bx.fillStyle = g; bx.fillRect(0, 0, S, S); // the underside, caught by the ring's glow
      g = bx.createRadialGradient(74, 62, 0, 74, 62, 44); g.addColorStop(0, 'rgba(2,0,1,0.85)'); g.addColorStop(0.6, 'rgba(2,0,1,0.45)'); g.addColorStop(1, 'rgba(2,0,1,0)'); bx.fillStyle = g; bx.fillRect(0, 0, S, S); // the core, darkest
      const rm = K.mk(S, S), rx = rm.getContext('2d'); // the rim: the shape less itself shifted back and down
      rx.drawImage(m, 0, 0); rx.globalCompositeOperation = 'source-in'; g = rx.createLinearGradient(0, 0, S, S); g.addColorStop(0.1, 'rgb(255,176,128)'); g.addColorStop(0.5, 'rgb(255,70,54)'); g.addColorStop(0.9, 'rgb(186,22,40)'); rx.fillStyle = g; rx.fillRect(0, 0, S, S);
      rx.globalCompositeOperation = 'destination-out'; rx.drawImage(m, 5, 6); rx.drawImage(m, 2, 7);
      bx.globalCompositeOperation = 'source-atop'; bx.drawImage(rm, 0, 0);
      const lt = K.mk(S, S), lx = lt.getContext('2d'); lx.drawImage(m, 0, 0); lx.globalCompositeOperation = 'source-in'; g = lx.createRadialGradient(62, 76, 0, 62, 76, 62); g.addColorStop(0, 'rgba(255,170,150,1)'); g.addColorStop(0.45, 'rgba(255,110,100,0.8)'); g.addColorStop(1, 'rgba(220,40,60,0.15)'); lx.fillStyle = g; lx.fillRect(0, 0, S, S); out.body.push(b); out.lit.push(lt); // (lit from inside: brightest deep in it, dimmer to its edges)
      if (one) break;
    }
    return out;
  }

  function airSprites(L) {
    const key = `chmAir2${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const ink = L ? '28,20,24' : '8,2,5', cr = L ? '168,24,36' : '226,40,50', hot = L ? '255,255,255' : '255,232,214', R = K.rng(5150);
    const cone = K.mk(128, 64), a = cone.getContext('2d');
    a.beginPath(); a.moveTo(0, 6); a.quadraticCurveTo(70, 18, 128, 32); a.quadraticCurveTo(70, 46, 0, 58); a.closePath();
    const g = a.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, `rgba(${cr},0.4)`); g.addColorStop(0.6, `rgba(${cr},0.12)`); g.addColorStop(1, `rgba(${cr},0)`); a.fillStyle = g; a.fill();
    a.strokeStyle = `rgba(${cr},0.45)`; a.lineWidth = 1.2; for (const x of [18, 44, 76]) { const hw = 26 * (1 - x / 140); a.beginPath(); a.moveTo(x - 6, 32 - hw); a.quadraticCurveTo(x + 8 + (R() - 0.5) * 6, 32 + (R() - 0.5) * 8, x - 6, 32 + hw); a.stroke(); }
    const turb = K.noiseTex('chmTurb', 96, 80, { px: 6, py: 5, oct: 3, lo: 0.3, hi: 0.85, seed: 41 });
    const vap = [0, 1].map((vi) => { // the sheath
      const c = K.mk(192, 160), v = c.getContext('2d');
      v.beginPath(); v.moveTo(130, 12); v.quadraticCurveTo(70, 4, 6, 2); v.lineTo(6, 158); v.quadraticCurveTo(70, 156, 130, 148); v.ellipse(130, 80, 16, 68, 0, Math.PI / 2, -Math.PI / 2, true); v.closePath();
      const gv = v.createLinearGradient(146, 0, 6, 0); gv.addColorStop(0, `rgba(${ink},${L ? 0.55 : 0.8})`); gv.addColorStop(0.4, `rgba(${ink},${L ? 0.25 : 0.4})`); gv.addColorStop(1, `rgba(${ink},0)`); v.fillStyle = gv; v.fill();
      v.save(); v.globalCompositeOperation = 'source-atop'; v.globalAlpha = L ? 0.4 : 0.6; v.drawImage(K.tint(turb, `rgb(${cr})`), vi * -40, 0, 240, 160); v.restore(); // churning crimson in it
      v.lineCap = 'round'; v.strokeStyle = `rgba(${cr},0.3)`; v.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) { const y = 18 + i * 18 + (R() - 0.5) * 8; v.beginPath(); v.moveTo(126, y); v.quadraticCurveTo(80, y + (R() - 0.5) * 16, 24 + R() * 30, y + (y - 80) * 0.15 + (R() - 0.5) * 10); v.stroke(); }
      const rim = []; for (let i = 0; i <= 26; i++) { const t = -Math.PI / 2 + (Math.PI * i) / 26, j = 1 + (R() - 0.5) * 0.16; rim.push([130 + Math.cos(t) * 16 * j + 2, 80 + Math.sin(t) * 68 * j]); } // a ragged leading edge
      for (const [w, col, al, dx] of [[7, ink, L ? 0.5 : 0.7, 0], [4, cr, 0.9, 0], [1.6, hot, L ? 1 : 0.95, 2.5]]) { v.strokeStyle = `rgba(${col},${al})`; v.lineWidth = w; v.beginPath(); rim.forEach(([x, y], i) => (i ? v.lineTo(x + dx, y) : v.moveTo(x + dx, y))); v.stroke(); }
      for (let i = 0; i < 7; i++) { const y = 10 + R() * 140, sd = y < 80 ? -1 : 1; v.strokeStyle = `rgba(${R() < 0.5 ? ink : cr},${0.35 + R() * 0.25})`; v.lineWidth = 1.5 + R() * 2.5; v.beginPath(); v.moveTo(20 + R() * 20, y); v.bezierCurveTo(4, y + sd * 6, 10, y + sd * (14 + R() * 10), 0, y + sd * (22 + R() * 12)); v.stroke(); } // smoke curling off its back edge
      return c;
    });
    const ring = [0, 1, 2].map(() => { // a shock ring of 마기, at radius 100 in a 256 square
      const c = K.mk(256, 256), x = c.getContext('2d'), N = 72, ph = [R() * TAU, R() * TAU, R() * TAU], th = [];
      for (let i = 0; i < N; i++) { const a = (i / N) * TAU; th.push(clamp(0.55 + 0.3 * Math.sin(a * 2 + ph[0]) + 0.22 * Math.sin(a * 5 + ph[1]) + 0.18 * Math.sin(a * 9 + ph[2]) + (R() - 0.5) * 0.3, 0, 1)); } // thick here, thin there, torn open where it falls away
      x.lineCap = 'round';
      for (const [w0, w1, col, al, rr] of [[5, 11, ink, L ? 0.45 : 0.6, 99], [2, 5, cr, 0.9, 100], [0.8, 1.6, hot, L ? 1 : 0.9, 103]]) {
        for (let i = 0; i < N; i++) { const t = th[i]; if (t < 0.22 || (col === hot && t < 0.55)) continue; x.strokeStyle = `rgba(${col},${al * t})`; x.lineWidth = w0 + (w1 - w0) * t; x.beginPath(); x.arc(128, 128, rr + (t - 0.5) * 3, (i / N) * TAU, ((i + 1.15) / N) * TAU); x.stroke(); }
      }
      for (let i = 0; i < 12; i++) { const a = R() * TAU, r0 = 100, l = 12 + R() * 20, sd = R() < 0.5 ? -1 : 1, x0 = 128 + Math.cos(a) * r0, y0 = 128 + Math.sin(a) * r0, ox = Math.cos(a) * l, oy = Math.sin(a) * l, tx = -Math.sin(a) * sd * l * 0.8, ty = Math.cos(a) * sd * l * 0.8; x.strokeStyle = `rgba(${R() < 0.6 ? ink : cr},${0.3 + R() * 0.3})`; x.lineWidth = 1 + R() * 2; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(x0 + ox * 0.5 + tx * 0.2, y0 + oy * 0.5 + ty * 0.2, x0 + ox * 0.6 + tx, y0 + oy * 0.6 + ty); x.stroke(); } // wisps peeling off
      x.fillStyle = `rgb(${hot})`; for (let i = 0; i < 14; i++) { const a = R() * TAU, r = 104 + R() * 8; x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(128 + Math.cos(a) * r - 1, 128 + Math.sin(a) * r - 1, 2, 2); } x.globalAlpha = 1; // embers riding its front
      return c;
    });
    const o = { cone, vap, ring }; K.cache.set(key, o); return o;
  }

  /* ---------- the frame ---------- */
  window.BG_EXT.cheonma = function (bg, ctx, w, h, t) {
    const T0 = performance.now();
    const V = K.view(w, h, 0.75, 1.3), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V)), Y = S.Y;
    BLEED = pv || (bg.st && bg.st.q >= 3) ? 0 : (L ? 0.16 : 0.24) * HJ;
    let st = bg.st;
    if (!st || st.kind !== 'cheonma' || st.key !== S.key) st = bg.st = init(V, S);
    const bob = Math.sin(t * 0.03) * u * 0.003, hipY = Y.hipY + bob; // he hangs in the air all but still
    const up = st.dm.up || 0; // for the great moves the halo rises and opens
    st.R = { cx: Y.cx, cy: hipY - Y.hc * 0.22 - u * 0.07 * up, r: Y.hc * 0.64 * (1 + 0.22 * up), k: 0.92, u };
    const sz = Y.sz;
    // pose the heroes first: strikes aim at where they are
    const E = { t, ph: 0, wind: 1 + st.gust * 0.8, sp: 1 + st.gust * 0.3 };
    const solved = st.heroes.map((hh) => {
      const PZ = POSES[hh.type], pz = hh.pose, c = hh.ch;
      hh.rk = (hh.rk || 0) + ((st.dom && st.dom.type !== 'absorb' && !c ? 1 : 0) - (hh.rk || 0)) * 0.04; // against his great moves they close ranks (not when he draws them in: each holds their own ground)
      const hx0 = hh.x0 + hh.dx + (Y.gx - u * 0.2 - hh.x0) * 0.22 * hh.rk, fo = c ? 0 : hh.fo || 0; // and for 천마일검 close on the one point
      let X = c ? c.x : hh.ftx === undefined ? hx0 : lerp(hx0, hh.ftx + hh.dx, fo * 0.7);
      if (!c) { if ((hh.cvk || 0) > 0.003) X = lerp(X, hh.cvx, hh.cvk); X += hh.dgo || 0; }
      const s = sz[hh.row]; let Yg = c ? c.y : Y.rows[hh.row] - (hh.dg && !hh.dg.roll ? Math.sin(Math.PI * clamp(hh.dg.k / 10, 0, 1)) * s * 0.1 : 0); // (a sidestep is a little hop)
      if (!c) hh.Xh = X - (hh.dgo || 0); // where they belong in the line
      const ab = c ? null : hh.ab, abOn = !!ab && ab.ph !== 'wait';
      if (abOn) { X = ab.x; Yg = ab.y; } // 흡공: where the forces on them have put them
      hh.tl = abOn ? ab.r : 0;
      const mv = hh.X === undefined ? 0 : (X - hh.X) / s;
      hh.X = X; hh.Yg = Yg;
      for (const k of PK) pz[k] = PZ.base[k];
      mixInto(pz, PZ.grd, 0.3 + 0.12 * Math.sin(t * 0.017 + hh.ph)); // braced against him, weapons up
      mixInto(pz, PZ.rec, clamp(hh.rec, 0, 1)); mixInto(pz, PZ.grd, hh.grd); mixInto(pz, PZ.cnt, hh.cnt); mixInto(pz, PZ.knl, hh.knl);
      const dz = dazed(hh), gk = hh.grd * Math.max(hh.knl, clamp(hh.rec, 0, 1) * 0.6); // down on a knee or reeling, the guard still goes up
      if (gk > 0.02) { const G2 = PZ.grd; for (const k of ARM) pz[k] += (G2[k] - pz[k]) * gk * 0.9; pz.ln -= 0.08 * gk; }
      if (hh.grd > 0.1 && dz > 0.2) { const q = hh.grd * dz; pz.wa += Math.sin(t * 1.9 + hh.ph) * 0.08 * q; pz.ay += 0.04 * q + Math.sin(t * 1.3 + hh.ph) * 0.012 * q; } // hurt: a shaky, lower guard
      if (hh.noWpn && hh.grd > 0.05) { const q = hh.grd; pz.ax = lerp(pz.ax, 0.13, q); pz.ay = lerp(pz.ay, -0.2, q); pz.cx = lerp(pz.cx, 0.17, q); pz.cy = lerp(pz.cy, -0.15, q); pz.g2 = lerp(pz.g2, 0, q); } // no weapon: forearms crossed, a palm of qi pushed out
      if (hh.lk > 0.02) pz.hd -= 0.22 * hh.lk; // looking up at what is coming
      const fat = hh.fat || 0, prs = hh.prs || 0;
      if (prs > 0.01) { mixInto(pz, PZ.knl, 0.35 * prs); pz.ln -= 0.06 * prs; pz.ay += 0.04 * prs; } // a blade grinding on the guard: knees bend, arms buckle
      if (fat > 0.05) { // worn out: lower, stooped, breathing hard; a hand on the knee when they can spare it
        pz.hy += 0.03 * fat; pz.ln += 0.08 * fat + Math.sin(t * 0.12 + hh.ph) * 0.025 * fat; pz.hy += Math.sin(t * 0.12 + hh.ph) * 0.008 * fat;
        const free = Math.max(0, fat - 0.3) * (1 - hh.grd) * (1 - prs) * 0.9; if (pz.g2 < 0.5 && free > 0) { pz.cx = lerp(pz.cx, 0.12, free); pz.cy = lerp(pz.cy, 0.3, free); }
      }
      if (st.dom && !hh.ch) { // against his great moves: braced, leaning in, looking up at what comes
        const dk = st.dom.k, ty = st.dom.type;
        if (ty === 'press') pz.ln += 0.1;
        if ((ty === 'rain' && dk > 20) || (ty === 'slash' && dk < SL.hit)) pz.hd -= 0.28;
        if (ty === 'rain' && dk > 46 && (hh.type === 'monk' || hh.type === 'beggar')) { pz.g2 = 0; pz.ax = 0.06; pz.ay = -0.3; pz.wa = t * 0.75 + hh.ph; } // the staff whirled overhead like a wheel
        if (ty === 'rain' && dk > 46 && hh.type === 'taoist') pz.wa += Math.sin(t * 0.5) * 0.7; // quick parrying arcs
      }
      if (st.dome && hh === st.dome.h && !c) { const q = ss(st.dome.k / 10) * (st.dome.fade === undefined ? 1 : 1 - ss(st.dome.fade / 7)); pz.ax = lerp(pz.ax, 0.1, q); pz.ay = lerp(pz.ay, -0.32, q); pz.cx = lerp(pz.cx, 0.04, q); pz.cy = lerp(pz.cy, -0.33, q); } // the old master holds the dome up with both palms
      if ((hh.cvk || 0) > 0.05 && !c) mixInto(pz, PZ.cnt, 0.35 * hh.cvk);
      const pl = st.pull || 0;
      if (abOn) abPose(hh, ab, pz, PZ, t, s, X, Yg, st, Y.rows[hh.row]);
      else if (ab && pl > 0.01) { pz.ln = lerp(pz.ln, -0.12, pl * 0.6); pz.hd = lerp(pz.hd, -0.12, pl); } // (not caught yet: leaning back from it)
      if (fo > 0.01 && st.focF) { // weapons crossed on the one point, the old master's palm behind them
        const F = st.focF, lx = (F[0] - X) / s, ly = (F[1] - Yg) / s;
        mixInto(pz, PZ.cnt, 0.4 * fo);
        const shx = pz.hx + Math.sin(pz.ln) * SP * 0.88, shy = pz.hy - Math.cos(pz.ln) * SP * 0.88, vx = lx - shx, vy = ly - shy, d = Math.hypot(vx, vy) || 1, r = Math.min(0.27, d * 0.75);
        const ax = (vx / d) * r, ay = (vy / d) * r;
        pz.ax = lerp(pz.ax, ax, fo); pz.ay = lerp(pz.ay, ay, fo); pz.wa = turn(pz.wa, Math.atan2(ly - shy - ay, lx - shx - ax), fo);
      }
      const strain = 0.7 + 0.6 * st.flare;
      pz.hy += Math.sin(t * 0.06 + hh.ph) * 0.004; pz.ln += Math.sin(t * 0.045 + hh.ph) * 0.012 + hh.shake * Math.sin(t * 1.9) * 0.035 + Math.sin(t * 1.3 + hh.ph) * 0.005 * strain;
      pz.ay += Math.sin(t * 0.05 + hh.ph * 1.3) * 0.008; pz.wa += Math.sin(t * 0.04 + hh.ph) * 0.03 + hh.shake * Math.sin(t * 2.3 + 1) * 0.07 + Math.sin(t * 1.7 + hh.ph) * 0.012 * strain;
      let pp = pz;
      if (c) {
        if (!hh.cp) { hh.cp = P({}); for (const k of PK) hh.cp[k] = pz[k]; }
        mixInto(hh.cp, c.key === 'gat' ? GAT[hh.type] : c.key === 'atk' ? ATK[hh.type] : PZ[c.key], c.key === 'atk' || c.ph === 'stop' ? 0.4 : 0.28);
        if (hh.type === 'beggar' && c.ph === 'leap') hh.cp.wa = t * 0.95; // the staff spinning
        pp = hh.cp;
      } else hh.cp = null;
      { // footwork: moving along the ground they step, feet alternating, dust at each plant; driven back by a blow they skid; rolling, neither
        const roll = hh.dg && hh.dg.roll, skid = !c && (hh.vx < -u * 0.0012 || (abOn && (ab.ph === 'pull' || (ab.ph === 'land' && ab.k < 5)))), air = (c && c.ph !== 'dash') || (abOn && ab.air > 0.03), sp = Math.abs(mv);
        hh.wk = (hh.wk || 0) + ((skid || roll || air ? 0 : Math.min(1, sp / 0.008)) - (hh.wk || 0)) * 0.35;
        if (!skid && !roll && !air) hh.wp = (hh.wp || 0) + (Math.sign(mv) * Math.min(sp, 0.07) / 0.2) * Math.PI;
        const q = hh.pq || (hh.pq = P({}));
        if (hh.wk > 0.03 || roll || hh.dg) { for (const k of PK) q[k] = pp[k]; pp = q; }
        if (hh.wk > 0.03) {
          const w = hh.wk, sn = Math.sin(hh.wp), cs = Math.cos(hh.wp);
          q.fx += 0.075 * sn * w; q.bx -= 0.075 * sn * w; q.fy -= 0.06 * Math.max(0, cs) * w; q.by -= 0.06 * Math.max(0, -cs) * w; q.hy -= 0.012 * Math.abs(cs) * w; q.ln += 0.05 * w * Math.sign(mv);
          const pl = cs >= 0 ? 1 : -1; if (pl !== hh.wpl) { hh.wpl = pl; if (w > 0.35) dust(st, X + (pl > 0 ? q.bx : q.fx) * s, Yg, 1, V, 0.0009, 0.0007); }
        }
        if (hh.dg && roll) { // crouched to spring, then tucked tight: knees to chest, head down, the weapon held close
          const k = hh.dg.k, tk = ss((k - 2) / 2) * (1 - ss((k - 12) / 2)); mixInto(q, PZ.knl, 0.75);
          if (tk > 0) { const T = { hy: -0.22, fx: 0.07, fy: -0.14, bx: -0.02, by: -0.12, ln: 0.55, hd: 0.5, ax: 0.1, ay: 0.1, cx: 0.08, cy: 0.12, wa: 1.2, g2: 0 }; for (const key in T) q[key] = lerp(q[key], T[key], tk); }
        } else if (hh.dg) mixInto(q, PZ.knl, 0.3); // tucked for the roll, crouched for the sidestep
      }
      const J = solve(pp);
      hh.sz = s;
      const wp = GEAR[hh.type].wpn === 'palm' || hh.noWpn ? [J.hf[0] + 0.07, J.hf[1] - 0.01] : [J.hf[0] + Math.cos(J.wa) * 0.2, J.hf[1] + Math.sin(J.wa) * 0.2];
      hh.wOff = [wp[0] * s, wp[1] * s]; hh.cOff = [J.sh[0] * s, J.sh[1] * s];
      hh.hit[0] = X + wp[0] * s; hh.hit[1] = Yg + wp[1] * s; hh.head[0] = X + J.hd[0] * s; hh.head[1] = Yg + J.hd[1] * s;
      return J;
    });
    update(st, V, S, L);

    const inkC = L ? '#202329' : '#04060a', ink2 = L ? '#181a1f' : '#020204';
    const crim = L ? '172,26,38' : '226,46,58', gold = L ? '150,100,24' : '255,206,128';
    const pulse = 0.55 + 0.25 * Math.sin(t * 0.07) + 0.2 * Math.sin(t * 0.17 + 1) + st.flare * 0.6;
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // the sky: a blood-tinged moon behind him, a slow wheel of dark cloud turning over his head
    const mx = Y.cx + u * 0.02, my = hipY - Y.hc * 0.3, mr = u * 0.15;
    if (!L) { ctx.fillStyle = '#e2e6ff'; for (const s of st.stars) { s.ph += 0.025; ctx.globalAlpha = 0.08 + 0.18 * Math.sin(s.ph) ** 2; ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2); } ctx.globalAlpha = 1; }
    K.glow(ctx, mx, my, u * (L ? 0.5 : 0.95), L ? [[0, `rgba(206,60,52,${0.14 + st.flare * 0.05})`], [1, 'rgba(206,60,52,0)']] : [[0, `rgba(226,120,120,${0.2 + st.flare * 0.07})`], [0.35, 'rgba(176,60,72,0.09)'], [1, 'rgba(150,40,52,0)']]);
    ctx.globalAlpha = L ? 0.48 : 0.76; ctx.drawImage(orb(L), mx - mr * 1.02, my - mr * 1.02, mr * 2.04, mr * 2.04); ctx.globalAlpha = 1;
    const bub = st.slash && st.slash.bub, bq = bub ? bub.life / bub.max : 1, bR = bub ? bub.r1 * (1 - (1 - bq) * (1 - bq)) : 0, bW = u * 0.02 * (1 - 0.5 * bq); // 천마일검's shock running out over the sky bends what is behind it
    const bend = (fn) => { ctx.save(); ctx.beginPath(); ctx.arc(bub.x, bub.y, bR + bW, 0, TAU); ctx.arc(bub.x, bub.y, Math.max(1, bR - bW), 0, TAU, true); ctx.clip(); ctx.beginPath(); ctx.rect(W * 0.45, -H, W, H * 3); ctx.clip(); fn(); ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }; // (never over the text on the left)
    if (bub && bub.life >= 1 && !pv && st.q < 3) bend(() => { // a band of the moon shifted outward
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.8 * (1 - bq); ctx.fillRect(bub.x - bR - bW, bub.y - bR - bW, (bR + bW) * 2, (bR + bW) * 2);
      ctx.globalCompositeOperation = 'source-over'; const sc = 1 + 0.05 * (1 - bq); ctx.translate(bub.x, bub.y); ctx.scale(sc, sc); ctx.translate(-bub.x, -bub.y);
      ctx.globalAlpha = (L ? 0.48 : 0.76) * 0.8 * (1 - bq); ctx.drawImage(orb(L), mx - mr * 1.02, my - mr * 1.02, mr * 2.04, mr * 2.04);
    });
    if (!L) { ctx.strokeStyle = `rgba(${crim},${0.08 + 0.12 * st.flare})`; ctx.lineWidth = u * 0.005; ctx.beginPath(); ctx.arc(mx, my, mr * 1.03, 0, TAU); ctx.stroke(); }
    { // the vortex
      const vs = u * 1.55, vt = vortexTex();
      ctx.save(); ctx.translate(Y.cx, hipY - Y.hc * 0.72); ctx.scale(1 - 0.15 * (st.pull || 0), 0.34 * (1 - 0.15 * (st.pull || 0))); ctx.rotate(-(st.vrot || 0));
      ctx.globalAlpha = L ? 0.12 : 0.5; ctx.drawImage(K.tint(vt, L ? '#4a4048' : '#05040a'), -vs / 2, -vs / 2, vs, vs);
      ctx.rotate(0.5); if (!L) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (L ? 0.07 : 0.06) * (1 + st.flare * 1.2); ctx.drawImage(K.tint(vt, L ? '#a01e2a' : '#c0283a'), -vs / 2, -vs / 2, vs, vs);
      ctx.restore();
    }
    const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#a8b4d4');

    if ((st.psq || 0) > 0.002) { ctx.save(); ctx.translate(0, Y.ey); ctx.scale(1, 1 - st.psq); ctx.translate(0, -Y.ey); ctx.drawImage(S.back, 0, 0, W, H); ctx.restore(); } else ctx.drawImage(S.back, 0, 0, W, H);
    if (bub && bub.life >= 1 && !pv && st.q < 3) bend(() => { const sc = 1 + 0.035 * (1 - bq); ctx.translate(bub.x, bub.y); ctx.scale(sc, sc); ctx.translate(-bub.x, -bub.y); ctx.globalAlpha = 0.6 * (1 - bq); ctx.drawImage(S.back, 0, 0, W, H); }); // and the peaks
    K.mist(ctx, fog, W, Y.ey - u * 0.18, u * 0.22, u * 1.5, t * 0.12, L ? 0.75 : 0.15);
    K.put(ctx, S.rock, W, H, L ? 0.5 : 0.9);
    if (!L) { ctx.globalAlpha = 0.24; ctx.drawImage(S.rim, 0, 0, W, H); ctx.globalAlpha = 1; }
    if (st.q < 2) K.mist(ctx, fog, W, Y.ey - u * 0.045, u * 0.07, u * 1.1, t * 0.22 + 500, L ? 0.55 : 0.12);

    // the platform
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fill(S.mask); ctx.restore();
    ctx.drawImage(S.floor, 0, 0, W, H);
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; // the crater under him: cracks lit from within, a thin ring of light
    const ca = (L ? 0.2 : 0.34) * pulse * (pv ? 0.45 : 1);
    ctx.strokeStyle = L ? `rgb(${crim})` : '#ff463c';
    if (st.q < 3) { ctx.globalAlpha = ca * 0.3; ctx.lineWidth = Math.max(1.6, u * 0.006); ctx.stroke(S.crackPath); }
    ctx.globalAlpha = ca; ctx.lineWidth = Math.max(0.7, u * 0.0014); ctx.stroke(S.crackPath);
    ctx.strokeStyle = L ? `rgb(${crim})` : '#ff9a7a'; ctx.globalAlpha = ca * 0.7; ctx.lineWidth = Math.max(0.7, u * 0.0016);
    ctx.beginPath(); ctx.ellipse(Y.cx, Y.gyC, u * 0.045 * (1 + 0.08 * Math.sin(t * 0.07)), u * 0.0075, 0, 0, TAU); ctx.stroke();
    if (st.pcr && st.pcr.r > u * 0.02) { // 압력 파동: the stones cracked out from under him where the ring has passed, lit from within, then fading
      const cr = st.pcr, ca2 = (L ? 0.6 : 0.75) * (1 - ss(cr.a / 40)) * (st.dom && st.dom.type === 'press' ? 1 - ss((st.dom.k - PRS.slam - 30) / 66) * 0.6 : 0.4);
      if (ca2 > 0.01) { ctx.save(); ctx.beginPath(); ctx.ellipse(Y.cx, Y.gyC, cr.r, cr.r * 0.15, 0, 0, TAU); ctx.clip(); ctx.strokeStyle = L ? `rgb(${crim})` : '#ff4a3a';
        if (st.q < 3) { ctx.globalAlpha = ca2 * 0.3; ctx.lineWidth = Math.max(2, u * 0.006); ctx.stroke(cr.p); }
        ctx.globalAlpha = ca2; ctx.lineWidth = Math.max(0.8, u * 0.0015); ctx.stroke(cr.p); ctx.restore(); }
    }
    if (st.slash && st.slash.k > SL.dash + 1) { // the stones opening under the spearhead's path, a beat after it passes, lit from within
      const sl = st.slash, k = sl.k, hk = (k < SL.hit + 6 ? 1 : 1 - ss((k - SL.hit - 6) / 40)) * (L ? 0.7 : 0.8), rx = lerp(sl.cx0, sl.cx1 - u * 0.02, clamp((k - SL.dash - 3) / 5, 0, 1)); // (scorched open a beat after it passes)
      if (hk > 0.01) {
        ctx.save(); ctx.beginPath(); ctx.rect(rx, sl.cy - u * 0.05, sl.cx0 - rx + u * 0.03, u * 0.1); ctx.clip();
        ctx.strokeStyle = L ? `rgb(${crim})` : '#ff5a44';
        if (st.q < 3) { ctx.globalAlpha = hk * 0.3; ctx.lineWidth = Math.max(2, u * 0.008); ctx.stroke(sl.crack); ctx.globalAlpha = hk * 0.35; ctx.lineWidth = Math.max(1.4, u * 0.004); ctx.stroke(sl.crack); }
        ctx.globalAlpha = hk; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.stroke(sl.crack);
        if (!L && k < SL.hit + 14) { ctx.strokeStyle = '#ffd2b0'; ctx.globalAlpha = hk * 0.6 * (1 - ss((k - SL.hit) / 14)); ctx.lineWidth = Math.max(0.6, u * 0.0008); ctx.stroke(sl.crack); } // white-hot at first
        ctx.restore();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
    K.mist(ctx, fog, W, Y.ey - u * 0.012, Y.rows[0] - Y.ey, u * 1.2, t * 0.2 + 100, L ? 0.3 : 0.07); // mist lying on the stones
    // grass on the stones: leaning in toward him, flattened when his domain rolls over it
    ctx.strokeStyle = L ? '#3a3c44' : '#8c96b4'; ctx.globalAlpha = L ? 0.26 : 0.2; ctx.lineWidth = Math.max(0.6, u * 0.0013);
    ctx.beginPath();
    for (const tf of st.tufts) {
      const side = tf.x < Y.cx ? -1 : 1, sk = st.suck, lean = lerp(Math.sin(t * 0.06 + tf.ph) * 0.15 - side * 0.3, side * 1.5, tf.fl) - side * 1.2 * (st.pull || 0) * (0.8 + 0.2 * Math.sin(t * 0.3 + tf.ph)) + (sk ? clamp((sk.x - tf.x) / (u * 0.08), -1, 1) * 1.1 * sk.k * ss(1 - Math.abs(sk.x - tf.x) / (u * 0.3)) : 0), hh = tf.h * (1 - 0.55 * tf.fl); // (drawn in toward 천마일검's point before it breaks)
      for (let b = -1; b <= 1; b++) { const bx = tf.x + b * u * 0.003; ctx.moveTo(bx, tf.y); ctx.quadraticCurveTo(bx + lean * hh * 0.3, tf.y - hh * 0.6, bx + lean * hh * 0.8 + b * hh * 0.2, tf.y - hh * (1 - 0.3 * Math.min(1, Math.abs(lean)))); }
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (st.dom && st.dom.type === 'press' && !pv) { // 압력 파동: bands of dark crimson haze sinking from above, dragged off in streaks by the storm; a heavy rain of qi pressing down round the slam
      const pk2 = st.dom.k, sink = ss((pk2 - 4) / 30), hz = st.phz || 0, fogC = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#4a3a3c' : '#4a0c16'), drag = st.press ? st.press.life * 9 : 0;
      for (let b = 0; b < 2; b++) { const y = lerp(-u * 0.12, Y.ey - u * (0.32 - b * 0.16), sink); if (L && y < H * 0.3) continue; K.band(ctx, fogC, W, y, u * 0.16, u * 1.3, t * 0.12 + b * 300 + drag, (L ? 0.3 : 0.42) * hz); }
      const rq = ss((pk2 - PRS.slam + 12) / 6) * (1 - ss((pk2 - PRS.slam - 14) / 10));
      if (rq > 0.01) { ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.beginPath();
        for (let j = 0; j < (st.q >= 1 ? 26 : 40); j++) { const x = W * (0.32 + 0.68 * HT[(j * 41 + 3) & 255]), y = ((HT[(j * 29 + 7) & 255] * H + t * u * 0.055 * (0.8 + 0.4 * HT[(j * 13) & 255])) % (Y.ey + u * 0.05)), l = u * (0.035 + 0.03 * HT[(j * 17) & 255]); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.08, y + l); }
        ctx.globalAlpha = (L ? 0.3 : 0.35) * rq; ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; }
    }
    if ((st.phz || 0) > 0.01 && !pv) {
      if (!S.prh) { const c = K.mk(64, 64), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, L ? 'rgba(60,50,48,1)' : 'rgba(6,2,5,1)'); g.addColorStop(0.75, L ? 'rgba(60,50,48,0.6)' : 'rgba(6,2,5,0.65)'); g.addColorStop(1, L ? 'rgba(60,50,48,0)' : 'rgba(6,2,5,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
        x.globalCompositeOperation = 'source-atop'; const g2 = x.createLinearGradient(0, 0, 64, 0); g2.addColorStop(0.45, 'rgba(120,14,24,0)'); g2.addColorStop(1, L ? 'rgba(150,26,38,0.55)' : 'rgba(90,8,16,0.85)'); x.fillStyle = g2; x.fillRect(0, 0, 64, 64);
        if (L) { x.globalCompositeOperation = 'destination-out'; const g3 = x.createRadialGradient(0, 0, 0, 0, 0, 44); g3.addColorStop(0, 'rgba(0,0,0,1)'); g3.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g3; x.fillRect(0, 0, 64, 64); } S.prh = c; }
      ctx.globalAlpha = (L ? 0.18 : 0.19) * st.phz; ctx.drawImage(S.prh, 0, V.oy, w, h * (0.35 + 0.75 * st.phz)); ctx.globalAlpha = 1;
    }
    // shadows on the stones
    ctx.fillStyle = `rgba(${L ? '32,34,40' : '0,0,0'},${L ? 0.1 : 0.32})`;
    ctx.beginPath();
    for (const hh of st.heroes) { const air = hh.ch ? clamp(1 - (Y.rows[hh.row] - hh.ch.y) / (u * 0.3), 0.25, 1) : hh.ab && hh.ab.ph !== 'wait' ? clamp(1 - (Y.rows[hh.row] - hh.Yg) / (u * 0.3), 0.3, 1) : 1, x = (hh.ch ? hh.ch.x : hh.X === undefined ? hh.x0 + hh.dx : hh.X) - hh.sz * 0.06, y = Y.rows[hh.row] + hh.sz * 0.004, r = hh.sz * 0.3 * air; ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, hh.sz * 0.035 * air, 0, 0, TAU); }
    ctx.moveTo(Y.cx - u * 0.01 + u * 0.07, Y.gyC + u * 0.004); ctx.ellipse(Y.cx - u * 0.01, Y.gyC + u * 0.004, u * 0.07, u * 0.01, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); let fu = 0; // furrows where their heels were dragged over the stones
    for (const hh of st.heroes) { const b = hh.ab; if (!b || b.fu0 === undefined || b.fu1 - b.fu0 < 2 || (b.fa !== undefined && b.fa <= 0)) continue; const y = Y.rows[hh.row] + hh.sz * 0.006, s = hh.sz; fu = Math.max(fu, b.fa === undefined ? 1 : b.fa); for (const [o, w] of [[0.3, 1], [-0.24, 0.7]]) { ctx.moveTo(b.fu0 + s * o, y); ctx.lineTo(b.fu1 + s * o, y + s * 0.004 * w); } }
    if (fu > 0) { ctx.strokeStyle = L ? 'rgba(50,44,40,0.3)' : 'rgba(0,0,0,0.42)'; ctx.globalAlpha = fu; ctx.lineWidth = Math.max(1, u * 0.0024); ctx.stroke(); ctx.globalAlpha = 1; }
    if (!L && !pv) { const pg = K.tint(puff(), '#b01c2c'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const hh of st.heroes) if ((hh.crt || 0) > 0.02 && hh.X !== undefined) { const x = (hh.ch ? hh.ch.x : hh.X) - hh.sz * 0.04, y = Y.rows[hh.row] - hh.sz * 0.16, rw = hh.sz * 0.8, rh = hh.sz * 0.46; ctx.globalAlpha = 0.72 * Math.min(1, hh.crt * 1.3); ctx.drawImage(pg, x - rw, y - rh, rw * 2, rh * 2); } ctx.restore(); ctx.globalAlpha = 1; } // (dark page: the 마기 seeping up out of the ground caved in under them lights them from behind, so they read)
    for (const hh of st.heroes) if ((hh.crt || 0) > 0.02 && hh.X !== undefined) { const x = (hh.ch ? hh.ch.x : hh.X) - hh.sz * 0.04, y = Y.rows[hh.row] + hh.sz * 0.01; ctx.fillStyle = `rgba(${L ? '40,34,32' : '0,0,0'},${(L ? 0.16 : 0.32) * hh.crt})`; ctx.beginPath(); ctx.ellipse(x, y, hh.sz * 0.46, hh.sz * 0.065, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = L ? `rgba(90,70,60,${0.3 * hh.crt})` : `rgba(160,60,60,${0.25 * hh.crt})`; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.beginPath(); ctx.ellipse(x, y - hh.sz * 0.006, hh.sz * 0.48, hh.sz * 0.07, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); } // the ground caved in under them
    for (const r of st.rings) { const k = r.life / r.max; ctx.strokeStyle = L ? `rgba(70,60,50,${0.3 * (1 - k)})` : `rgba(200,206,226,${0.32 * (1 - k)})`; ctx.lineWidth = Math.max(0.8, u * 0.004 * (1 - k)); ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.2, 0, 0, TAU); ctx.stroke(); }
    if ((st.pab || 0) > 0.01) { ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.translate(Y.cx, Y.gyC); ctx.scale(1, 0.16); const R = u * (0.1 + 0.3 * st.pab); K.glow(ctx, 0, 0, R, L ? [[0, `rgba(150,24,36,${0.3 * st.pab})`], [1, 'rgba(150,24,36,0)']] : [[0, `rgba(200,30,40,${0.35 * st.pab})`], [0.6, `rgba(120,10,20,${0.15 * st.pab})`], [1, 'rgba(120,10,20,0)']]); ctx.restore(); } // his aura flattened, spreading over the ground under him
    if (!L && !pv && st.t >= 40 && st.t < 43) stormSprites(1); // (the storm's billows made early, a frame each, while nothing is happening)
    if (st.press) { // the ring of 마기 rolling out over the ground (seen low: flat): a low thick wall of it, its far side fading into the distance, its front hot; the echo behind; a storm of 마기 riding on it
      const pr = st.press, AS = airSprites(L), q = pr.life / 72, fq = 1 - q * q, gy = Y.gyC;
      const ringAt = (r, al, vi, ro, dy) => { if (r < u * 0.02) return; ctx.save(); ctx.translate(Y.cx, gy - dy); ctx.scale(1, 0.15); ctx.rotate(ro + pr.life * 0.012); ctx.globalAlpha = al; ctx.drawImage(AS.ring[vi], -r * 1.28, -r * 1.28, r * 2.56, r * 2.56); ctx.restore(); };
      const near = (r, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(-W, gy - r * 0.03, W * 3, H * 2); ctx.clip(); fn(); ctx.restore(); }, far = (r, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, gy - r * 0.03 + H); ctx.clip(); fn(); ctx.restore(); };
      far(pr.r, () => ringAt(pr.r, 0.22 * fq, 0, 0.3, 0)); // (the far side: faint, fading off toward the horizon)
      near(pr.r, () => { for (const [k, dy] of [[0, 0], [1, u * 0.011], [2, u * 0.022]]) ringAt(pr.r * (1 - 0.025 * k), (1 - 0.28 * k) * fq, k, 0.3 + k * 1.9, dy * fq); }); // (stacked: a wall with height)
      if (pr.r2 > u * 0.02) near(pr.r2, () => ringAt(pr.r2, 0.45 * fq, 2, 4.1, 0));
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = L ? 'rgba(255,255,255,1)' : 'rgba(255,214,190,1)'; ctx.globalAlpha = (L ? 0.75 : 0.6) * fq; ctx.lineWidth = Math.max(1.2, u * 0.003 * (1 - 0.5 * q));
      ctx.beginPath(); ctx.ellipse(Y.cx, gy, pr.r * 1.035, pr.r * 1.035 * 0.15, 0, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; // (its hot front edge, on the near side)
      if (!pv) { // the storm wall: dark smoke and crimson flame tumbling forward along the front, crimson lightning crackling in it, crimson wind racing ahead over the field
        const pk = K.tint(puff(), L ? '#1c1416' : '#0a0206'), pc = K.tint(puff(), L ? '#a8202e' : '#b8182a'), NB = L ? (st.q >= 1 ? 12 : 18) : st.q >= 1 ? 11 : 16, pts = [];
        for (let i = 0; i < NB; i++) {
          const a = L ? Math.PI * (0.58 + (0.84 * i) / (NB - 1)) : STA[Math.round((i / (NB - 1)) * 128)], sn = Math.sin(a), x = Y.cx + Math.cos(a) * pr.r, y = Math.max(Y.ey + u * 0.008, gy + sn * pr.r * 0.15), xf = ss((x - W * 0.1) / (W * 0.14)) * fq; if (xf < 0.02) continue;
          const hg = u * (0.04 + 0.018 * Math.sin(i * 2.3 + pr.life * 0.21)) * (1 + 0.5 * Math.max(0, sn)) * (0.4 + 0.6 * (1 - q)), ph = -pr.life * 0.33 + i * 1.7, ox = Math.cos(ph) * hg * 0.35, oy = Math.sin(ph) * hg * 0.25;
          if (L) { ctx.globalAlpha = 0.32 * xf; ctx.drawImage(pk, x + ox - hg, y - hg * 0.8 + oy - hg, hg * 2, hg * 2); }
          pts.push([x, y - hg * 0.8, hg, xf, i]);
        }
        const fc = (t / 17) | 0, fp = t - fc * 17, fk = !L && st.q < 2 && pts.length > 2 && HT[(fc * 23 + 5) & 255] < 0.8 && fp < 3 ? [1, 0.5, 0.2][fp] : 0, F = fk ? pts[(HT[(fc * 41 + 11) & 255] * pts.length) | 0] : null; // now and then a flash of lightning inside the wall, a few frames
        ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
        if (L) for (let i = 0; i < pts.length; i++) { const [x, y, hg, xf] = pts[i], ph = pr.life * 0.4 + i * 2.1, r = hg * 0.85; ctx.globalAlpha = 0.22 * xf; ctx.drawImage(pc, x + Math.cos(ph) * hg * 0.3 - r, y + Math.sin(ph) * hg * 0.2 - r, r * 2, r * 2); }
        else { // dark page: the fire inside it glowing out between the billows; the billows rolling forward over it (each two lobes turning over, the crown running ahead), dark cores against ember-lit crowns and dusky crimson undersides; embers whirling in them; a flash lighting them from inside
          for (const [x, y, hg, xf] of pts) { const r = hg * 1.05; ctx.globalAlpha = 0.5 * xf; ctx.drawImage(pc, x - r, y + hg * 0.1 - r, r * 2, r * 2); }
          ctx.globalCompositeOperation = 'source-over'; const SB = stormSprites(), nl = st.q >= 1 ? 1 : 2;
          for (const [x, y, hg, xf, i] of pts) for (let j = 0; j < nl; j++) { const ph = -pr.life * 0.3 + i * 1.7 + j * 3.1, r = hg * (j ? 0.74 : nl > 1 ? 0.98 : 1.18) * (1 + 0.06 * Math.sin(pr.life * 0.23 + i + j * 2)), rw = r * (1.18 + 0.12 * HT[(i * 5 + j) & 255]); ctx.globalAlpha = 0.94 * xf; ctx.drawImage(SB.body[(i + j * 2) % 3], x + Math.cos(ph) * hg * 0.36 - rw, y - j * hg * 0.42 + Math.sin(ph) * hg * 0.26 - r, rw * 2, r * 2); } // (wider than tall; the second lobe riding up on the first)
          ctx.globalCompositeOperation = 'lighter';
          if (F) { const r0 = F[2] * 2.4; ctx.globalAlpha = 0.4 * fk * F[3]; ctx.drawImage(pc, F[0] - r0, F[1] - r0 * 0.7, r0 * 2, r0 * 1.4); for (const [x, y, hg, xf, i] of pts) { const d = Math.hypot(x - F[0], (y - F[1]) * 2) / (F[2] * 4.5); if (d >= 1) continue; const r = hg * 1.1; ctx.globalAlpha = 0.9 * fk * (1 - d) * xf; ctx.drawImage(SB.lit[i % 3], x - r, y - r, r * 2, r * 2); } } // (lit from inside round the bolt)
          ctx.fillStyle = '#ffb27a'; const z = Math.max(1, u * 0.0019);
          for (const [x, y, hg, xf, i] of pts) for (let k = 0; k < (st.q >= 1 ? 1 : 2); k++) { const h0 = HT[(i * 7 + k * 31) & 255], a = h0 * TAU - pr.life * (0.24 + 0.1 * k), rr = hg * (0.25 + 0.45 * HT[(i * 13 + k * 17) & 255]), fl2 = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 3 + k * 2); ctx.globalAlpha = (0.35 + 0.55 * fl2) * xf; ctx.fillRect(x + Math.cos(a) * rr - z / 2, y + Math.sin(a) * rr * 0.7 - hg * 0.1 - z / 2, z, z); }
        }
        if (pts.length > 3 && st.q < 3) { // lightning in it, a new bolt every few frames
          const sd = (t / 3) | 0; ctx.lineJoin = 'miter'; ctx.beginPath();
          for (let b = 0; b < 2; b++) { const i0 = b === 0 && F ? Math.min(pts.length - 2, pts.indexOf(F)) : (HT[(sd * 7 + b * 31) & 255] * (pts.length - 2)) | 0, A0 = pts[i0], A1 = pts[i0 + 1 + (b & 1)]; if (!A1) continue; let x = A0[0], y = A0[1] - A0[2] * 0.4; ctx.moveTo(x, y); for (let k = 1; k <= 5; k++) { x = lerp(A0[0], A1[0], k / 5) + (HT[(sd * 13 + k * 5 + b * 17) & 255] - 0.5) * u * 0.02; y = lerp(A0[1], A1[1], k / 5) - A0[2] * 0.4 + (HT[(sd * 11 + k * 7 + b) & 255] - 0.5) * u * 0.03; ctx.lineTo(x, y); } }
          const fl = Math.min(1.6, (t % 3 === 2 ? 0.35 : 1) + 0.6 * fk); ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(1, u * 0.003); ctx.globalAlpha = 0.5 * fl * fq; ctx.stroke(); ctx.strokeStyle = L ? 'rgba(255,255,255,1)' : 'rgba(255,236,220,1)'; ctx.lineWidth = Math.max(0.6, u * 0.001); ctx.globalAlpha = 0.8 * fl * fq; ctx.stroke(); ctx.lineJoin = 'round';
        }
        const fx0 = Y.cx - pr.r; ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.beginPath(); // crimson wind racing ahead of it
        for (let j = 0; j < 12; j++) { const x = fx0 - u * (0.03 + HT[(j * 37) & 255] * 0.32) - ((pr.life * u * 0.012 + j * u * 0.07) % (u * 0.2)), y = lerp(Y.ey + u * 0.01, H - u * 0.02, HT[(j * 53 + 9) & 255]), l = u * (0.05 + 0.07 * HT[(j * 19) & 255]); if (x < W * 0.1) continue; ctx.moveTo(x, y); ctx.lineTo(x + l, y - l * 0.03); }
        ctx.globalAlpha = (L ? 0.35 : 0.3) * fq; ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      }
    }

    // stones lifted off the floor by his qi
    ctx.fillStyle = L ? 'rgba(40,40,46,0.5)' : 'rgba(10,10,14,0.9)';
    const feetY = hipY + Y.hc * 0.5;
    for (const d of st.debris) {
      d.k += d.sp * (1 + st.flare * 2) * (1 - (st.prz || 0)); if (d.k > 1) { d.k = 0; d.a = RND() * TAU; d.d = 0.3 + RND() * 0.7; }
      if (st.q >= 1 && st.debris.indexOf(d) % 3 === 2) continue;
      const x = Y.cx + Math.cos(d.a + d.k * 1.5) * u * 0.12 * d.d, y = lerp(Y.gyC, feetY + u * 0.03, ss(d.k) * (1 - 0.9 * (st.prd || 0))) + Math.sin(d.a + d.k * 1.5) * u * 0.014, s = u * 0.005 * d.s;
      ctx.globalAlpha = ss(d.k * 6) * ss((1 - d.k) * 4);
      const c = Math.cos(d.rot + d.k * 4) * s, n = Math.sin(d.rot + d.k * 4) * s;
      ctx.beginPath(); ctx.moveTo(x - c, y - n); ctx.lineTo(x - c * 0.2 + n * 0.8, y - n * 0.2 - c * 0.8); ctx.lineTo(x + c + n * 0.3, y + n - c * 0.3); ctx.lineTo(x + c * 0.5 - n * 0.6, y + n * 0.5 + c * 0.6); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // leaves drawn round him: those on the far side of the wheel first
    const leaf = (l) => {
      const x = Y.cx + Math.cos(l.a) * l.r * u * 1.15, y = hipY - Y.hc * 0.1 + Math.sin(l.a) * l.r * u * 0.36 + (st.prd || 0) * u * 0.12;
      ctx.fillStyle = l.c ? (L ? '#aa1c28' : '#d23c46') : L ? '#2a2c33' : '#ced4e4'; ctx.globalAlpha = (l.c ? 0.52 : 0.4) * ss((1.5 - l.r) * 4) * ss((l.r - 0.12) * 8);
      ctx.beginPath(); ctx.ellipse(x, y, l.s * (1 + 0.6 * l.z), l.s * 0.32 * (0.3 + 0.7 * Math.abs(Math.cos(l.ph))), l.ph * 1.3, 0, TAU); ctx.fill();
    };
    for (let i = 0; i < st.leaves.length; i++) { const l = st.leaves[i]; if (Math.sin(l.a) < 0 && !(st.q >= 1 && i % 3 === 2)) leaf(l); }
    ctx.globalAlpha = 1;

    // 천마: dark qi smoking off him, crimson flame licking up through it
    const pfw = puff();
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'destination-out';
    const pfL = L ? K.tint(pfw, '#3a2c32') : pfw;
    for (const m of st.smoke) {
      m.k += m.sp * (1 + st.flare * 1.5); if (m.k > 1) { m.k = 0; m.x = (RND() - 0.5) * 0.3; m.y = 0.3 - RND() * 0.8; }
      if (st.q >= 1 && st.smoke.indexOf(m) % 3 === 2) continue;
      const k = m.k, x = Y.cx + (m.x + k * 0.2 * (0.5 + st.gust)) * Y.hc, y = hipY + (m.y - k * 0.6) * Y.hc, r = Y.hc * (0.08 + k * 0.2) * m.s;
      ctx.globalAlpha = (L ? 0.1 : 0.32) * ss(k * 5) * (1 - k) * (0.8 + 0.2 * pulse);
      ctx.drawImage(pfL, x - r, y - r, r * 2, r * 2);
    }
    if (st.ab && st.dacc && st.pull > 0.01) { const hx = Y.cx - st.dacc.hand[0] * Y.hc, hy = hipY + st.dacc.hand[1] * Y.hc; for (let i = 0; i < 6; i++) { const p = (t * 0.03 + i / 6) % 1, ang = i * 1.05 + p * TAU * 1.4, rr = (1 - p) * u * 0.09, r = u * (0.02 + 0.02 * (1 - p)); ctx.globalAlpha = (L ? 0.12 : 0.3) * st.pull * Math.sin(Math.PI * p); ctx.drawImage(pfL, hx + Math.cos(ang) * rr - r, hy + Math.sin(ang) * rr * 0.8 - r, r * 2, r * 2); } } // his aura drawn into his palm
    ctx.restore();
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
    const pfC = K.tint(pfw, L ? '#a01e2a' : '#d02434');
    for (const m of st.flames) {
      m.k += m.sp * (1 + st.flare); if (m.k > 1) { m.k = 0; m.x = (RND() - 0.5) * 0.32; m.y = 0.1 - RND() * 0.5; }
      if (st.q >= 1 && st.flames.indexOf(m) % 3 === 2) continue;
      const k = m.k, x = Y.cx + (m.x * (1 - k * 0.5) + k * 0.06) * Y.hc, y = hipY + (m.y - k * 0.75) * Y.hc, r = Y.hc * (0.05 + k * 0.1) * m.s;
      ctx.globalAlpha = (L ? 0.05 : 0.12) * ss(k * 4) * (1 - k) * (0.7 + 0.3 * pulse + st.flare * 0.6);
      ctx.drawImage(pfC, x - r, y - r * 1.4, r * 2, r * 2.8);
    }
    if (st.hitAura > 0.02) { // where a blow broke on the rim of his halo
      const R = st.R, rr = R.r + u * 0.04;
      ctx.globalAlpha = st.hitAura * (L ? 0.5 : 0.7); ctx.strokeStyle = L ? '#284696' : '#c8dcff'; ctx.lineWidth = u * 0.004;
      ctx.beginPath(); ctx.ellipse(R.cx, R.cy, rr * (1.08 - st.hitAura * 0.08), rr * R.k * (1.08 - st.hitAura * 0.08), 0, st.hitAng - 0.5, st.hitAng + 0.5); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;

    // the halo of swords behind him
    const spr = swordSprite(L), Ls = u * 0.105;
    const M = ctx.getTransform(), ma = M.a, md = M.d, me = M.e, mf = M.f, sc = Ls / 236;
    const aur = []; for (let i = 0; i < AUR_N; i++) aur.push(auraSprite(L, i));
    const drawSword = (s, a, au) => { // the canvas transform is a scale and a shift: rotate the sprite into it directly
      const c = Math.cos(s.a) * sc, n = Math.sin(s.a) * sc;
      ctx.setTransform(ma * c * s.fl, ma * n * s.fl, -ma * n, ma * c, ma * s.x + me, md * s.y + mf);
      if (au > 0.01) { // 마기 round it, flaring when it meets a guard
        const sg = s.surge || 0, z = 1 + 0.6 * sg; let fi = ((t * (0.34 + 0.5 * sg) + (s.i || 0) * 2.3) | 0) % AUR_N; if (st.q >= 2) fi -= fi % 2;
        ctx.globalAlpha = Math.min(1, au * (0.8 + 0.4 * sg)); ctx.drawImage(aur[fi], -AUR_X * z, -AUR_Y * z, AUR_W * z, AUR_H * z);
      }
      ctx.globalAlpha = a; ctx.drawImage(spr, -128, -24);
      ctx.setTransform(ma, 0, 0, md, me, mf); ctx.globalAlpha = 1;
    };
    const slx = st.slash;
    if (slx && slx.k > SL.gat + 6 && slx.k < SL.hit + 12) { // the 마기 of the twelve running together: one dark wake behind the spearhead (behind him where they cross)
      const k = slx.k, fa = ss((k - SL.gat - 6) / 24) * (k <= SL.hit ? 1 : 1 - ss((k - SL.hit) / 10)), c = Math.cos(slx.th), n = Math.sin(slx.th), sxw = (u * 0.105 * 1.9 + Math.hypot(slx.tip[0] - slx.A[0], slx.tip[1] - slx.A[1])) / 231, syw = sxw * 1.35 * (k > SL.dash ? 0.8 : 1 + 0.08 * Math.sin(k * 0.7));
      ctx.setTransform(ma * c * sxw, ma * n * sxw, -ma * n * syw, ma * c * syw, ma * slx.tip[0] + me, md * slx.tip[1] + mf);
      ctx.globalAlpha = (L ? 0.3 : 0.95) * fa; ctx.drawImage(aur[((t * 0.4) | 0) % AUR_N], -(AUR_X + 125), -AUR_Y);
      ctx.setTransform(ma, 0, 0, md, me, mf); ctx.globalAlpha = 1;
    }
    {
      const R = st.R, rr = R.r * (1 + 0.05 * st.flare) - Ls * 0.42, ga = (0.7 + 0.3 * pulse + st.flare) * (pv ? 0.6 : 1);
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgb(${crim})`;
      ctx.globalAlpha = (L ? 0.08 : 0.06) * ga; ctx.lineWidth = u * 0.012; ctx.beginPath(); ctx.ellipse(R.cx, R.cy, rr, rr * R.k, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (L ? 0.22 : 0.2) * ga; ctx.lineWidth = Math.max(0.7, u * 0.0016); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    for (const s of st.sw) {
      if (s.st === 'ring') drawSword(s, L ? 0.6 : 0.82, L ? 0.55 : 0.8);
      else if ((s.st === 'ult' || s.st === 'orb') && !s.lay) drawSword(s, L ? 0.62 : 0.85, L ? 0.6 : 0.8);
    }
    ctx.strokeStyle = `rgb(${crim})`; ctx.globalAlpha = L ? 0.6 : 0.7; ctx.lineWidth = Math.max(0.8, u * 0.0022); ctx.beginPath();
    for (const s of st.sw) { if (s.st !== 'ring' || s.i % 3 || st.slash) continue; const px = s.x - Math.cos(s.a) * Ls * 0.47, py = s.y - Math.sin(s.a) * Ls * 0.47, sw = Math.sin(t * 0.2 + s.i) * Ls * 0.04; ctx.moveTo(px, py); ctx.quadraticCurveTo(px - Math.cos(s.a) * Ls * 0.05, py + Ls * 0.07, px - Math.cos(s.a) * Ls * 0.08 + sw, py + Ls * 0.17); }
    ctx.stroke(); ctx.globalAlpha = 1;
    { const gi = st.sw[((t / 16) | 0) % NSW], gk = (t % 16) / 16; if (gi.st === 'ring' && !pv && !st.slash && st.q < 3) { const c = Math.cos(gi.a), n = Math.sin(gi.a), p0 = lerp(-0.12, 0.42, gk) * Ls, x = gi.x + c * p0, y = gi.y + n * p0; ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = L ? '#ffffff' : '#fff6f0'; ctx.globalAlpha = 0.75 * Math.sin(Math.PI * gk); ctx.lineWidth = Math.max(1, u * 0.0024); ctx.beginPath(); ctx.moveTo(x - c * Ls * 0.06 - n * Ls * 0.012, y - n * Ls * 0.06 + c * Ls * 0.012); ctx.lineTo(x + c * Ls * 0.06 - n * Ls * 0.012, y + n * Ls * 0.06 + c * Ls * 0.012); ctx.stroke(); ctx.restore(); } } // a glint running down one blade

    // the man: still above the waist, everything else streaming
    const dm = st.dm, D = { sn: 0, ln: -0.05 + 0.004 * Math.sin(t * 0.021), hd: -0.12, ax: 0, ay: 0, px: 0, py: -1, bx: -0.075, by: 0.2 };
    const dsx = Y.cx - (Math.sin(D.ln) * SP * 0.88) * Y.hc, dsy = hipY - Math.cos(D.ln) * SP * 0.88 * Y.hc; // his shoulder on screen
    let lx = -(dm.tx - dsx), ly = dm.ty - dsy; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll; // toward the target, in his (mirrored) frame
    const c = dm.cmd, sp = dm.spr;
    D.ax = 0.16 + lx * 0.05 * c; D.ay = -0.17 + ly * 0.05 * c; // the raised hand barely moves: two fingers flick toward them
    D.px = lerp(0.25, lx, c); D.py = lerp(-1, ly, c);
    D.bx = lerp(-0.075, -0.21, sp); D.by = lerp(0.2, 0.05, sp); // his arms open only for his domain
    const slk = st.slash ? st.slash.k : -1, rk = st.dom && st.dom.type === 'rain' ? st.dom.k : -1; let ep = 0; st.hq = 0;
    const setA = (x, y, a, w) => { // toward a pose, through the joints (the upper arm turning, the elbow bending), never by dragging the hand in a straight line
      if (w <= 0) return; const A0 = armA(D.ax, D.ay), A1 = armA(x, y), p = armP(A0[0] + wrap(A1[0] - A0[0]) * w, A0[1] + (A1[1] - A0[1]) * w); D.ax = p[0]; D.ay = p[1];
      const an = turn(Math.atan2(D.py, D.px), a, w); D.px = Math.cos(an); D.py = Math.sin(an); };
    const inUlt = rk >= 0 || slk >= 0 || (dm.ex || 0) > 0.001 || (st.dom && st.dom.type === 'press');
    st.idleK = inUlt ? 0 : (st.idleK || 0) + 1;
    if (!inUlt && (st.lw || 0) > 0 && st.idleK > 45) st.lw = Math.max(0, st.lw - 1 / 40); // a second and a half after a great move he raises the hand again
    if ((st.lw || 0) > 0.001) { // after a great move the hand stays low, the two fingers on them; it rises to rest in one movement, the elbow leading, the fingers turning up only at the end
      const v = 1 - st.lw, AL = armA(LOWP[0], LOWP[1]), AR = armA(D.ax, D.ay), ra = Math.atan2(D.py, D.px), e1 = ss(Math.min(1, v * 1.25)), e2 = ss(Math.max(0, v * 1.25 - 0.25)), p = armP(AL[0] + wrap(AR[0] - AL[0]) * e1, AL[1] + (AR[1] - AL[1]) * e2);
      D.ax = p[0]; D.ay = p[1]; const an = turn(LOWP[2], ra, ss((v - 0.55) / 0.45)); D.px = Math.cos(an); D.py = Math.sin(an);
    }
    const R0x = D.ax, R0y = D.ay, R0a = Math.atan2(D.py, D.px);
    if (rk >= 0) { // 만검귀종: a breath and a dip of the hand, the elbow leading up and forward, the forearm following, the wrist turning the two fingers to the sky; held while the sky fills with blades; then swept down and forward to send them
      const hu = ss((rk - 1) / 27), sn = rainSnap(rk), lv = clamp((rk - RS.rel - 18) / 30, 0, 1), lw = ss(lv), fin = ss((rk - RS.rel - 42) / 18); // raised; the snap of the wrist; after half a second the arm comes down (lw), the fingers turning up to rest only once it has arrived (fin)
      const cr = (a, b, c2, d, q) => 0.5 * (2 * b + (c2 - a) * q + (2 * a - 5 * b + 4 * c2 - d) * q * q + (3 * b - a - 3 * c2 + d) * q * q * q); // (Catmull-Rom: no corners at the keys)
      const KX = [R0x, R0x, 0.172, 0.13, 0.085, 0.085], KY = [R0y, R0y, -0.115, -0.125, -0.288, -0.288], KA = [R0a, R0a, -1.02, -0.86, -1.53, -1.53], KU = [0, 0, 0.2, 0.52, 1, 1];
      let sgi = 1; while (sgi < 3 && hu > KU[sgi + 1]) sgi++;
      const q = clamp((hu - KU[sgi]) / (KU[sgi + 1] - KU[sgi]), 0, 1), hold = ss((rk - 26) / 6) * (1 - ss((rk - RS.s0) / 2)), trm = ss((rk - 26) / 6) * (1 - ss((rk - RS.s0 + 1) / 2));
      let x = cr(KX[sgi - 1], KX[sgi], KX[sgi + 1], KX[sgi + 2], q), y = cr(KY[sgi - 1], KY[sgi], KY[sgi + 1], KY[sgi + 2], q), a = cr(KA[sgi - 1], KA[sgi], KA[sgi + 1], KA[sgi + 2], q);
      const rc = rk >= RS.s0 ? Math.sin(Math.PI * clamp((rk - RS.s0) / 8, 0, 1)) * Math.exp(-Math.max(0, rk - RS.s0 - 2) * 0.15) : 0; // the arm giving a little with the snap
      x += 0.004 * trm * Math.sin(t * 2.3) - 0.008 * rc; y += 0.003 * trm * Math.sin(t * 1.9) - 0.012 * rc; a += (RS.aS + 1.53) * sn; // (a slight tremble while he holds it; then the wrist)
      if (lv > 0) { // the elbow leads it down and a little out, the forearm folding in, the wrist relaxing, the two fingers still forward and down at them
        const A0 = armA(x, y), A1 = armA(R0x, R0y), p = armP(A0[0] + wrap(A1[0] - A0[0]) * lw + 0.035 * Math.sin(Math.PI * clamp((rk - RS.rel - 44) / 12, 0, 1)), A0[1] + (A1[1] - A0[1]) * lw - 0.22 * Math.sin(Math.PI * lw)); // (the elbow bending a little more on the way, then easing; a little give as it arrives)
        x = p[0]; y = p[1];
        a = turn(lerp(a, 0.25, ss(lv / 0.8)), R0a, fin); // (the wrist easing from the hook to pointing at them; up to rest only at the end)
      }
      if (rk >= RS.rel) st.lw = 1; // (released: from here the hand's place to come back to is the low one)
      setA(x, y, a, 1); ep = hu * (1 - ss(lv / 0.6)); // (the elbow drops under the arm early in the descent) st.hq = hold; D.sn = rk >= RS.s0 ? Math.sin(Math.PI * clamp((rk - RS.s0) / 9, 0, 1)) : 0;
      D.hd -= 0.07 * hu * (1 - lw) - 0.05 * Math.min(1, sn) * (1 - lw); D.ln -= 0.015 * hu * (1 - lw); // the chin rising, the chest lifting a little; with the snap the head dips to watch them fall
      D.hp = Object.assign({}, HP0, { z: 1.22 * (1 + 0.12 * hu * (1 - lw)) }); // (the hand a little larger while it is the whole gesture)
    } else if (st.dom && st.dom.type === 'press') { // 압력 파동: the palm turned down at his chest, pressed slowly down through the air to his waist, the arm trembling with what it holds back; at the bottom the ring goes out; the hand stays down, then relaxes
      const pk = st.dom.k, tw = ss(pk / PRS.turn), pe = Math.pow(clamp((pk - PRS.turn) / (PRS.slam - PRS.turn), 0, 1), 1.8), rl = ss((pk - PRS.rel) / 22), tr = 0.0035 * ss((pk - PRS.turn) / 10) * (1 - ss((pk - PRS.slam - 6) / 8));
      const rc = pk >= PRS.slam ? Math.sin(Math.PI * clamp((pk - PRS.slam) / 7, 0, 1)) * 0.022 : 0;
      if (pk >= PRS.slam) st.lw = 1;
      setA(lerp(0.215, 0.19, pe) + tr * nz(t * 0.35 + 3), lerp(0.02, 0.2, pe) - rc + tr * nz(t * 0.42 + 7), lerp(0.05, 0.16, pe), tw * (1 - rl));
      D.ln += 0.03 * pe * (1 - rl); D.hd += 0.05 * tw * (1 - rl);
      const hw = tw * (1 - rl); D.hp = { cu: [lerp(0.08, 0.1, hw), lerp(0.08, 0.08, hw), lerp(1, 0.12, hw), lerp(1, 0.16, hw)], spr: 0.12 * hw, th: 0.75 * hw, ps: 1, z: 1.22 * (1 + 0.1 * hw), full: 1, orb: 0, beck: 0 };
    } else if (slk >= 0) { // 천마일검: the arm out toward their point at the height of his shoulder, sighting along the two fingers; the fingertips trace a spiral that tightens to nothing as the blades spiral into the spearhead; perfectly still while it holds, qi gathering at them; a short sharp thrust as it fires; lowered slowly after
      const F = st.slash.F, [ux, uy] = unit(-(F[0] - dsx), F[1] - dsy), aimA = Math.atan2(Math.min(uy, 0.25), ux), cx = Math.cos(aimA), cy = Math.sin(aimA);
      const ext = ss((slk - 2) / 14), back = ss((slk - SL.split - 6) / 30), spr = 0.022 * ss((slk - 5) / 8) * (1 - ss((slk - 8) / 34)), sa = slk * 0.45;
      const th = slk >= SL.dash - 1 ? Math.sin(Math.PI * clamp((slk - SL.dash + 1) / 5, 0, 1)) : 0, rch = 0.285 + 0.025 * th, ox = Math.cos(sa) * spr, oy = Math.sin(sa) * spr * 0.6;
      if (slk >= SL.dash) st.lw = 1;
      setA(cx * rch - cy * ox + cx * oy, cy * rch + cx * ox + cy * oy, aimA + ox * 6, ext * (1 - back)); D.su = ext * (1 - back) * 0.6; // (the elbow under the arm, as an arm held out)
      st.hq = ss((slk - 40) / 6) * (slk < SL.dash ? 1 : 1 - ss((slk - SL.dash) / 3)); D.hd -= 0.03 * ext * (1 - back);
    }
    if (inUlt) { st.gp = [D.ax, D.ay, Math.atan2(D.py, D.px)]; st.gpk = 0; }
    else if (st.gp) { const w = ss(++st.gpk / 10); if (w >= 1) st.gp = null; else { const g = st.gp, A0 = armA(g[0], g[1]), A1 = armA(D.ax, D.ay), p = armP(A0[0] + wrap(A1[0] - A0[0]) * w, A0[1] + (A1[1] - A0[1]) * w); D.ax = p[0]; D.ay = p[1]; const an = turn(g[2], Math.atan2(D.py, D.px), w); D.px = Math.cos(an); D.py = Math.sin(an); } }
    D.ep = ep; if (rk >= 0) D.su = ep;
    if (rk < 0 && !(st.dom && st.dom.type === 'press')) D.hp = HP0;
    if ((dm.ex || 0) > 0.001) { // 흡공: the hand turns over, the palm up to the sky, fingers unfurling from the little finger in; a slow beckoning curl runs through them while the current pulls; at the end they close one by one round what he took, and the fist goes down
      const ex = dm.ex, ak = st.ab ? st.ab.k : SA.done, cl = ss((ak - SA.fade + 6) / 12), HP = { cu: [0, 0, 0, 0], spr: 0, th: 0, ps: 1, z: 1.22, full: 1, orb: ex, beck: 0 };
      if (cl > 0.001) st.lw = 1;
      setA(0.265 - 0.05 * cl, -0.03 + 0.07 * cl, Math.atan2(-0.3 + 0.2 * cl, 0.95), ex); // at the height of his shoulder, held out to them; lowered as it closes
      const roll = ss((ak - 2) / 14) * (1 - 0.3 * cl), WD = [1.65, 1.1, 0.55, 0], amp = ss((ak - 24) / 16) * (1 - ss((ak - SA.fade + 14) / 8));
      for (let i = 0; i < 4; i++) {
        const un = i < 2 ? 1 : ss((ak - (i === 3 ? 3 : 6)) / 9), w = Math.pow(Math.max(0, Math.sin(t * 0.095 - WD[i])), 1.6);
        let c = lerp(HP0.cu[i], 0.16 + 0.05 * i, un) + amp * 0.55 * w; HP.beck += amp * w * 0.25;
        c = lerp(c, 1, ss((ak - SA.fade + 10 - (3 - i) * 3) / 7)); // the little finger first
        HP.cu[i] = lerp(HP0.cu[i], c, ex);
      }
      HP.th = ex * ss((ak - 5) / 10) * (1 - ss((ak - SA.fade + 1) / 7)); HP.ps = lerp(1, Math.cos(Math.PI * roll), ex); HP.spr = 0.3 * ex * (1 - ss((ak - SA.fade + 10) / 10)); HP.z = 1.22 * (1 + 0.28 * ex); // (larger: a gesture meant to be seen)
      D.hp = HP;
    }
    const still = !dm.hold && Math.abs(dm.cmd) < 0.02 && dm.spr < 0.02 && dm.up < 0.02 && dm.dn < 0.02 && !st.dom && !((st.lw || 0) > 0 && st.lw < 1) && !st.gp && (dm.ex || 0) < 0.001; // (rebuilt every frame while the arm moves)
    if (!st.dfig || (st.q >= 2 ? t % 3 === 0 : !still || t % 2 === 0)) { const df0 = new Fig(), acc0 = {}; demonPath(df0, D, { t, ph: 0, wind: 1.15 + st.flare * 1.3 + st.gust * 0.3, sp: 1.35 + st.flare * 0.9 }, acc0); st.dfig = df0; st.dacc = acc0; }
    const df = st.dfig, acc = st.dacc;
    { // the crimson edge of his aura, hugging his outline (strokes of the whole figure; the ink covers their inner half)
      const ga = (0.75 + 0.25 * pulse + st.flare * 0.8) * (L ? 0.8 : 1) * (pv ? 0.55 : 1);
      ctx.save(); ctx.translate(Y.cx, hipY); ctx.scale(-Y.hc, Y.hc); ctx.lineJoin = 'round';
      if (!L) ctx.globalCompositeOperation = 'lighter';
      for (const [lw, a] of [[0.06, 0.07], [0.016, 0.17]]) {
        ctx.strokeStyle = `rgba(${crim},${a * ga})`; ctx.lineWidth = lw * (1 + 0.18 * Math.sin(t * 0.23 + lw * 70) + st.flare * 0.5); ctx.stroke(df.p);
      }
      ctx.restore();
    }
    let rimD = null;
    if (!L && !pv) { rimD = ctx.createLinearGradient(0, -0.9, 0, 0.45); rimD.addColorStop(0, 'rgba(255,232,222,0.85)'); rimD.addColorStop(0.5, 'rgba(240,190,190,0.5)'); rimD.addColorStop(1, `rgba(${crim},0.4)`); }
    inkFig(ctx, df.p, Y.cx, hipY, Y.hc, -1, L ? 0.82 : 0.97, ink2, rimD, 0, Math.max(1, u * 0.0018));
    ctx.save(); ctx.translate(Y.cx, hipY); ctx.scale(-Y.hc, Y.hc); // fold lines, so it reads as cloth; then crimson: the lining of his cape, the sash
    ctx.lineWidth = 1.2 / Y.hc; ctx.strokeStyle = L ? 'rgba(255,255,255,0.24)' : 'rgba(150,128,160,0.32)'; ctx.beginPath();
    for (const q of acc.folds) { ctx.moveTo(q[0], q[1]); for (let i = 2; i < q.length - 2; i += 2) ctx.quadraticCurveTo(q[i], q[i + 1], (q[i] + q[i + 2]) / 2, (q[i + 1] + q[i + 3]) / 2); ctx.lineTo(q[q.length - 2], q[q.length - 1]); }
    ctx.stroke();
    if (acc.lit && !L && st.ab) { const q = acc.lit; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${crim},${0.6 * Math.min(1, (st.ab.r || 0) / (u * 0.012) + 0.3)})`; ctx.lineWidth = 2 / Y.hc; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.stroke(); ctx.restore(); } // the top of his palm lit by the orb above it
    if (acc.split) { const q = acc.split; ctx.strokeStyle = L ? 'rgba(255,255,255,0.1)' : 'rgba(150,128,160,0.22)'; ctx.lineWidth = 0.8 / Y.hc; ctx.beginPath(); ctx.moveTo(lerp(q[0], q[2], 0.25), lerp(q[1], q[3], 0.25)); ctx.lineTo(lerp(q[0], q[2], 0.85), lerp(q[1], q[3], 0.85)); ctx.stroke(); } // (faint)
    ctx.fillStyle = L ? 'rgba(150,20,32,0.5)' : 'rgba(118,10,24,0.8)';
    ctx.beginPath(); acc.lining.forEach((v, i) => { if (i % 2 === 0) ctx[i ? 'lineTo' : 'moveTo'](v, acc.lining[i + 1]); }); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = L ? 'rgba(160,22,34,0.75)' : 'rgba(170,18,34,0.9)';
    ctx.lineWidth = 0.024; ctx.beginPath(); ctx.moveTo(acc.belt[0], acc.belt[1]); ctx.lineTo(acc.belt[2], acc.belt[3]); ctx.stroke();
    for (const q of acc.sash) { for (let i = 0; i < q.length - 2; i += 2) { ctx.lineWidth = 0.02 * (1 - (i / q.length) * 0.6); ctx.beginPath(); ctx.moveTo(q[i], q[i + 1]); ctx.lineTo(q[i + 2], q[i + 3]); ctx.stroke(); } }
    ctx.restore();
    const ex = Y.cx - acc.eye[0] * Y.hc, ey = hipY + acc.eye[1] * Y.hc, eg = 0.85 + 0.15 * Math.sin(t * 0.11) + st.flare * 0.3; // his eyes
    if (!L) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; K.glow(ctx, ex, ey, u * (0.007 + 0.003 * st.flare), [[0, `rgba(255,226,180,${0.95 * Math.min(1, eg)})`], [0.25, `rgba(255,80,64,${0.6 * eg})`], [1, 'rgba(255,40,40,0)']]); ctx.restore(); } else { ctx.fillStyle = 'rgba(176,24,36,0.95)'; ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.8, u * 0.0022), 0, TAU); ctx.fill(); }
    { const rk2 = st.dom && st.dom.type === 'rain' ? st.dom.k : -1; if (rk2 > RS.s0 && rk2 < RS.rel + 7 && acc.wr && !pv) { // 만검귀종: the arc his fingertips cut in the snap, in crimson
      const wx = Y.cx - acc.wr[0] * Y.hc, wy = hipY + acc.wr[1] * Y.hc, r = 0.13 * Y.hc, a0 = Math.PI + 1.53, a1 = Math.PI - (RS.aS + 1.53) * Math.min(1, rainSnap(rk2)) + 1.53, f = 1 - clamp((rk2 - RS.rel) / 7, 0, 1);
      if (a0 - a1 > 0.2) { ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = `rgb(${crim})`; for (const [lw, al, k0] of [[u * 0.007, 0.16, 0], [u * 0.0022, L ? 0.45 : 0.7, 0.35]]) { ctx.lineWidth = lw; ctx.globalAlpha = al * f; ctx.beginPath(); ctx.arc(wx, wy, r, a1, a1 + (a0 - a1) * (1 - k0)); ctx.stroke(); } ctx.restore(); ctx.globalAlpha = 1; }
    } }
    if ((st.hq || 0) > 0.02 && !pv) { const hx = Y.cx - acc.hand[0] * Y.hc, hy2 = hipY + acc.hand[1] * Y.hc, g = st.hq * (0.75 + 0.25 * Math.sin(t * 0.4)); ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; K.glow(ctx, hx, hy2, u * (0.024 + 0.006 * Math.sin(t * 0.31)), [[0, `rgba(${L ? crim : '255,120,100'},${0.4 * g})`], [0.4, `rgba(${crim},${0.18 * g})`], [1, `rgba(${crim},0)`]]); ctx.restore(); } // 천마일검: his qi gathering at the raised fingertips
    if (dm.cmd > 0.3) { const hx = Y.cx - acc.hand[0] * Y.hc, hy2 = hipY + acc.hand[1] * Y.hc; ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; K.glow(ctx, hx, hy2, u * 0.016, [[0, `rgba(${L ? crim : '255,140,110'},${0.55 * dm.cmd})`], [1, `rgba(${crim},0)`]]); ctx.restore(); }

    // embers rising off him
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = L ? `rgb(${crim})` : '#ff6050';
    for (const m of st.motes) {
      m.k += m.sp * (1 + st.flare); if (m.k > 1) { m.k = 0; m.a = RND() * TAU; }
      if (st.q >= 1 && st.motes.indexOf(m) % 3 === 2) continue;
      const x = Y.cx + Math.cos(m.a) * Y.hc * 0.3 * m.r + Math.sin(t * 0.05 + m.a * 3) * u * 0.01, y = hipY + Y.hc * 0.3 - m.k * Y.hc * 1.1;
      const r = Math.max(0.6, u * 0.0016 * m.r) * (pv ? 0.7 : 1);
      ctx.globalAlpha = 0.6 * ss(m.k * 5) * ss((1 - m.k) * 3); ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();

    // the heroes, farthest first
    const drawHero = (hh, J) => {
      const G = hh.noWpn ? { ...GEAR[hh.type], wpn: 'none' } : GEAR[hh.type], s = hh.sz, ch = hh.ch, X0 = ch ? ch.x : hh.X, Y0 = ch ? ch.y : hh.Yg, rot = ch ? ch.rot : (hh.rl || 0) + (hh.tl || 0);
      // the outline is rebuilt every frame while a blow lands, every other frame while they shift stance, every third while they hold it
      let X = X0, Yg = Y0; if (!ch && rot) { const pv = s * (hh.dg && hh.dg.roll ? 0.18 : 0.3); X = X0 - Math.sin(rot) * pv; Yg = Y0 - pv + Math.cos(rot) * pv; } // a roll turns about the middle of them
      const ab = hh.ab, abB = !!ab && ab.ph !== 'wait' && ((st.q < 2 && hh.row < 2 && st.rbN < 3 && (ab.ph === 'free' || ab.ph === 'land' || (ab.ph === 'pull' && ab.air > 0.3 && hh.type !== 'taoist'))) || (t + hh.i) % (ab.ph === 'rec' ? 3 : 2) === 0); // (the farthest and the composed Taoist every other frame; no more than three a frame at full rate) // (in 흡공: every frame while they fly, kick and land; every other while they brace or get their breath)
      const busy = !!ch || !!hh.dg || (hh.wk || 0) > 0.3 || abB || ((hh.cvk || 0) > 0.05 && (hh.cvk || 0) < 0.95) || hh.rec > 0.08 || hh.shake > 0.15 || hh.vx < -u * 0.002, moving = (hh.grd > 0.03 && hh.grd < 0.97) || (hh.knl > 0.03 && hh.knl < 0.97) || (hh.cnt > 0.03 && hh.cnt < 0.97) || st.gust > 0.5;
      if (abB) st.rbN++;
      if (!hh.fig || busy || (t + hh.i) % (st.q >= 2 ? (moving ? 4 : 7 + (hh.row === 2 ? 1 : 0)) : moving ? 3 : hh.row === 2 ? 6 : 4) === 0) { const f = new Fig(); hh.blades = []; const b = hh.ab, pa = b && b.ph !== 'wait' ? b.pl : 0, pp = (st.ppin || 0) * 0.85, pg = (hh.gst || 0) * 0.95, pl = Math.max(pa, pp, pg), da = pa >= pp && pa >= pg ? (pa > 0.01 && b.o ? Math.atan2(b.o[1] - (Y0 - s * 0.45), b.o[0] - X0) - rot : 0) : pg > pp ? Math.PI * 0.94 - rot : Math.PI / 2 - rot; heroPath(f, J, G, { t, ph: hh.ph, wind: E.wind * (0.8 + 0.4 * hh.rec) * (1 + 1.5 * (hh.gst || 0)), sp: E.sp * (1 + (hh.gst || 0)), pl, da }, hh.blades, L); hh.fig = f; } // (in his current, robes and hair stream toward his palm)
      if (hh.ab && hh.type === 'master') { const c0 = Math.cos(rot), s0 = Math.sin(rot); hh.hbw = [X + (c0 * J.hb[0] - s0 * J.hb[1]) * s, Yg + (s0 * J.hb[0] + c0 * J.hb[1]) * s]; } // (where his pushing palm is)
      const f = hh.fig, blades = hh.blades, far = hh.row / 2;
      const a = L ? 0.66 - far * 0.16 : 0.94 - far * 0.12;
      let rimS = null;
      if (!L && !pv && hh.row < (st.q >= 3 ? 1 : 2)) { const ra = (0.44 - far * 0.14) * (1 + hh.lit * 0.8) * (0.8 + 0.2 * pulse); const cw = Math.min(1, (hh.crt || 0) * 1.4); rimS = `rgba(255,${Math.round(lerp(168 - 40 * hh.lit, 70, cw))},${Math.round(lerp(150 - 50 * hh.lit, 60, cw))},${Math.min(0.9, ra * (1 + cw)) * (1 - 0.65 * (hh.drn || 0))})`; } // (lit crimson by the wave that hit them)
      inkFig(ctx, f.p, X, Yg, s, 1, a, inkC, rimS, -Math.max(1.1, s * 0.013), Math.max(0.6, s * 0.007), rot);
      if (!L && blades.length && st.q < 3) { // steel catching the moon
        ctx.save(); ctx.translate(X, Yg); if (rot) ctx.rotate(rot); ctx.scale(s, s); ctx.fillStyle = `rgba(214,222,240,${0.55 - far * 0.13 + hh.lit * 0.3})`;
        for (let i = 0; i < blades.length; i += 5) { const bx = blades[i], by = blades[i + 1], d0 = blades[i + 2], d1 = blades[i + 3], len = blades[i + 4], ww = 0.0055; ctx.beginPath(); ctx.moveTo(bx - d1 * ww, by + d0 * ww); ctx.lineTo(bx + d0 * len * 0.9 - d1 * ww * 0.7, by + d1 * len * 0.9 + d0 * ww * 0.7); ctx.lineTo(bx + d0 * len, by + d1 * len); ctx.lineTo(bx + d0 * len * 0.9 + d1 * ww * 0.7, by + d1 * len * 0.9 - d0 * ww * 0.7); ctx.lineTo(bx + d1 * ww, by - d0 * ww); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    };
    st.rbN = 0; for (const row of [2, 1, 0]) st.heroes.forEach((hh, i) => { if (hh.row === row) drawHero(hh, solved[i]); });
    if (st.lost) {
      const lw = st.lost, s = lw.h.sz, len = lw.type === 'staff' ? s * 1.15 : lw.type === 'bamboo' ? s * 0.95 : s * 0.5, c = Math.cos(lw.rot), n = Math.sin(lw.rot);
      const ax = lw.stuck ? lw.x - c * len * 0.86 : lw.x - (c * len) / 2, ay = lw.stuck ? lw.y - n * len * 0.86 : lw.y - (n * len) / 2, bx = lw.stuck ? lw.x : lw.x + (c * len) / 2, by = lw.stuck ? lw.y : lw.y + (n * len) / 2;
      ctx.globalAlpha = 1 - (lw.fade || 0) / 20; ctx.strokeStyle = inkC; ctx.lineCap = 'round';
      if (lw.type === 'sword') {
        ctx.lineWidth = Math.max(1, s * 0.02); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, bx, 0.24), lerp(ay, by, 0.24)); ctx.stroke();
        ctx.strokeStyle = L ? inkC : 'rgba(214,222,240,0.75)'; ctx.lineWidth = Math.max(0.8, s * 0.013); ctx.beginPath(); ctx.moveTo(lerp(ax, bx, 0.26), lerp(ay, by, 0.26)); ctx.lineTo(bx, by); ctx.stroke();
      } else { ctx.lineWidth = Math.max(1, s * (lw.type === 'staff' ? 0.022 : 0.016)); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (st.ghosts && st.dom) { // the sky of ghost blades, and their fall
      const d = st.dom, fin = ss((d.k - 8) / 30), gs = { x: 0, y: 0, a: 0, fl: 1 };
      for (const g of st.ghosts) {
        if (g.gone) continue;
        const a = g.hit ? (g.k < 20 ? 1 : Math.max(0, 1 - (g.k - 20) / 12)) : fin * (d.k < g.tf ? 0.7 : 1);
        if (a <= 0.01) continue;
        gs.a = g.a; gs.x = g.hit ? g.x - Math.cos(g.a) * Ls * 0.4 : g.x; gs.y = g.hit ? g.y - Math.sin(g.a) * Ls * 0.4 : g.y;
        gs.i = g.x; gs.surge = g.surge || 0; drawSword(gs, a * (L ? 0.55 : 0.7), st.q >= 2 ? 0 : a * (L ? 0.45 : 0.6));
        if (!g.hit && !g.def && d.k >= g.tf) { ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgb(${L ? crim : gold})`; ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(0.8, u * 0.002); ctx.beginPath(); ctx.moveTo(g.x, g.y - Ls * 0.5); ctx.lineTo(g.x, g.y - Ls * 0.5 - g.v * 5); ctx.stroke(); ctx.restore(); }
      }
    }
    const sl = st.slash, hand = st.dacc ? [Y.cx - st.dacc.hand[0] * Y.hc, hipY + st.dacc.hand[1] * Y.hc] : [Y.cx, hipY];
    { // a thread of the same 마기 from each blade away from the halo back to his two fingers: he is the one moving them
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.6, u * 0.0012);
      for (let half = 0; half < 2; half++) {
        ctx.globalAlpha = half ? (L ? 0.07 : 0.06) : L ? 0.14 : 0.12; ctx.beginPath();
        for (const s of st.sw) {
          if (s.st === 'ring' || ((s.st === 'ult' || s.st === 'orb') && !s.lay)) continue;
          const bx = s.x - Math.cos(s.a) * Ls * 0.5, by = s.y - Math.sin(s.a) * Ls * 0.5;
          if (bx > hand[0] - u * 0.02) continue; // never drawn across him
          const cx = (bx + hand[0]) / 2 + Math.sin(t * 0.13 + s.i) * u * 0.02, cy = (by + hand[1]) / 2 - u * 0.03 + Math.cos(t * 0.11 + s.i * 1.7) * u * 0.015;
          const mx = 0.25 * bx + 0.5 * cx + 0.25 * hand[0], my = 0.25 * by + 0.5 * cy + 0.25 * hand[1]; // the curve split at its middle
          if (!half) { ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + cx) / 2, (by + cy) / 2, mx, my); } else { ctx.moveTo(mx, my); ctx.quadraticCurveTo((cx + hand[0]) / 2, (cy + hand[1]) / 2, hand[0], hand[1]); }
        }
        ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (st.smk && st.smk.length) { // 마기 hanging in 천마일검's tunnel: black-red smoke swirling, then falling away as ash
      const pk = K.tint(puff(), L ? '#1c1416' : '#0a0206'), pc = K.tint(puff(), L ? '#a8202e' : '#b8182a');
      for (const p of st.smk) { const q = p.life / p.max, f = ss(p.life / 3) * (1 - q); ctx.globalAlpha = (L ? 0.3 : 0.45) * f; ctx.drawImage(pk, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      for (const p of st.smk) { const q = p.life / p.max, r = p.r * 0.55; ctx.globalAlpha = (L ? 0.16 : 0.22) * (1 - q) * (1 - q) * ss(p.life / 3); ctx.drawImage(pc, p.x + Math.cos(p.rot) * r * 0.5 - r, p.y + Math.sin(p.rot) * r * 0.5 - r, r * 2, r * 2); }
      ctx.restore(); ctx.fillStyle = L ? '#5a5250' : '#8a8490';
      for (const p of st.smk) { const q = p.life / p.max; if (q < 0.4) continue; ctx.globalAlpha = 0.55 * (1 - q); const z = Math.max(0.8, u * 0.0014); for (let i = 0; i < 2; i++) { const a = p.rot + i * 2.6; ctx.fillRect(p.x + Math.cos(a) * p.r * 0.6, p.y + Math.sin(a) * p.r * 0.5 + (q - 0.4) * p.r, z, z); } }
      ctx.globalAlpha = 1;
    }
    if (sl) { // 천마일검, his 마기 in the shock: drawn in from his aura before it breaks; the break (a sheath and rings of it); the tunnel it leaves (the Mach cone, a dark smoky body); the shock arriving at the point
      const k = sl.k, c = Math.cos(sl.th), n = Math.sin(sl.th), px = -n, py = c, ink = L ? '28,20,24' : '8,2,5', hot = L ? '255,255,255' : '255,232,214', AS = airSprites(L);
      const leftFade = (x, ext) => clamp((x - ext - W * 0.45) / (W * 0.06) + 1, 0, 1); // (kept off the text on the left)
      if (k >= SL.dash - 22 && k < SL.dash) { // 마기 drawn in from his halo to the point, in dark crimson streams
        const ka = ss((k - SL.dash + 22) / 12), [tx, ty] = sl.tip, R = st.R;
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.save(); if (pass && !L) ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = pass ? `rgb(${crim})` : `rgb(${ink})`; ctx.lineWidth = pass ? Math.max(0.8, u * 0.0035) : u * 0.01; ctx.globalAlpha = (pass ? 0.55 : L ? 0.18 : 0.26) * ka;
          if (pass) ctx.globalAlpha = 0.3 * ka;
          ctx.beginPath(); const SQ = [];
          for (let i = 0; i < 5; i++) { const a = Math.PI * (0.62 + i * 0.19) + Math.sin(k * 0.05 + i) * 0.05, sx = R.cx + Math.cos(a) * R.r, sy = R.cy + Math.sin(a) * R.r * R.k, mxp = (sx + tx) / 2 + Math.sin(k * 0.13 + i * 1.7) * u * 0.02, myp = (sy + ty) / 2 - u * 0.03; ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mxp, myp, tx, ty); SQ.push([sx, sy, mxp, myp]); }
          ctx.stroke();
          if (pass) { const pc = K.tint(puff(), L ? '#a8202e' : '#c0283a'); for (const [sx, sy, mxp, myp] of SQ) for (let j = 0; j < 3; j++) { const q = (k * 0.06 + j / 3 + sx * 0.01) % 1, m = 1 - q, x = m * m * sx + 2 * m * q * mxp + q * q * tx, y = m * m * sy + 2 * m * q * myp + q * q * ty, r = u * (0.022 * (1 - q) + 0.006); ctx.globalAlpha = (L ? 0.3 : 0.4) * ka * Math.sin(Math.PI * q); ctx.drawImage(pc, x - r, y - r, r * 2, r * 2); } } // knots of it flowing down them into the point
          ctx.restore();
        }
      }
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      if (k >= SL.form - 10 && k <= SL.dash + 1) { // the air ahead of the point warped red, rings of it drawn in toward the point
        const ka = ss((k - SL.form + 10) / 14) * (k >= SL.dash ? 0.5 : 1), tx = sl.tip[0] + c * u * 0.008, ty = sl.tip[1] + n * u * 0.008, sh = 1 + 0.07 * Math.sin(k * 1.9) + 0.25 * ss((k - SL.dash + 10) / 10);
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(sl.th); ctx.globalAlpha = (L ? 0.5 : 0.6) * ka * (0.8 + 0.2 * Math.sin(k * 2.3)); ctx.drawImage(AS.cone, 0, -u * 0.045 * sh, u * 0.14 * sh, u * 0.09 * sh); ctx.restore();
        ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.8, u * 0.002);
        for (let r = 0; r < 4; r++) { const q = (k * 0.09 + r / 4) % 1, rr = u * 0.085 * (1 - q) + u * 0.005; ctx.globalAlpha = (L ? 0.34 : 0.4) * ka * Math.sin(Math.PI * q); ctx.beginPath(); ctx.ellipse(tx + c * u * 0.03 * (1 - q), ty + n * u * 0.03 * (1 - q), rr * 0.36, rr, sl.th, 0.3 * r, TAU - 0.9 + 0.3 * r); ctx.stroke(); }
      }
      ctx.restore();
      if (k > SL.dash && k < SL.hit + 16) { // the tunnel: a dark smoky body between two crimson shock lines spreading back from the point (the Mach cone), wavering and fraying
        const fa = k <= SL.hit ? 1 : 1 - ss((k - SL.hit) / 16), [hx, hy] = sl.tip, d = Math.hypot(hx - sl.A[0], hy - sl.A[1]) + u * 0.14, sp = 0.17 + 0.12 * ss((k - SL.hit) / 16);
        const ex = (sd, fr) => { const a2 = sl.th + Math.PI + sd * sp; return [hx + Math.cos(a2) * d * fr, hy + Math.sin(a2) * d * fr]; };
        const [l1x, l1y] = ex(-1, 1), [l2x, l2y] = ex(1, 1), gb = ctx.createLinearGradient(hx, hy, (l1x + l2x) / 2, (l1y + l2y) / 2);
        gb.addColorStop(0, `rgba(${ink},${(L ? 0.22 : 0.32) * fa})`); gb.addColorStop(1, `rgba(${ink},0)`);
        ctx.fillStyle = gb; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(l1x, l1y); ctx.lineTo(l2x, l2y); ctx.closePath(); ctx.fill();
        const line = (sd, sd2, off) => { ctx.moveTo(hx, hy); for (let i = 1; i <= 8; i++) { const fr = i / 8, [x, y] = ex(sd, fr), w = nz(t * 0.45 + i * 0.8 + sd * 7 + off) * u * 0.007 * fr + sd2 * u * 0.012 * fr * fr; ctx.lineTo(x + Math.cos(sl.th + Math.PI + sd * sp + Math.PI / 2) * w, y + Math.sin(sl.th + Math.PI + sd * sp + Math.PI / 2) * w); } };
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgb(${ink})`; ctx.lineWidth = u * 0.008; ctx.globalAlpha = (L ? 0.2 : 0.3) * fa; ctx.beginPath(); line(-1, 0, 0); line(1, 0, 0); ctx.stroke();
        if (!L) ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.9, u * 0.0028); ctx.globalAlpha = 0.75 * fa; ctx.beginPath(); line(-1, 0, 0); line(1, 0, 0); ctx.stroke();
        ctx.lineWidth = Math.max(0.6, u * 0.0012); ctx.globalAlpha = 0.35 * fa; ctx.beginPath(); line(-1, -1, 3); line(1, 1, 3); line(-1, 0.6, 5); ctx.stroke(); // frayed strands off them
        ctx.strokeStyle = `rgb(${hot})`; ctx.lineWidth = Math.max(0.5, u * 0.0009); ctx.globalAlpha = (L ? 0.9 : 0.55) * fa * (k <= SL.hit + 4 ? 1 : 0.5); ctx.beginPath(); line(-1, 0, 0); line(1, 0, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      if (sl.streak > 0.02 && k >= SL.dash) {
        const [hx, hy] = sl.tip, x0 = sl.A[0] - c * u * 0.05, y0 = sl.A[1] - n * u * 0.05;
        for (const [w, a, col] of [[u * 0.03, 0.1, crim], [u * 0.012, 0.28, L ? crim : gold], [u * 0.0035, 0.75, L ? crim : '255,248,236']]) { ctx.strokeStyle = `rgb(${col})`; ctx.globalAlpha = a * sl.streak; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, hy); ctx.stroke(); }
      }
      ctx.restore();
      if (sl.vc > 0.02 && sl.vcx !== undefined) { // the sheath of the break: a dark turbulent body round the spearhead, its ragged rim crimson and white-hot
        const vh = u * 0.105 * 1.25 * (1 + 0.25 * (1 - sl.vc)); ctx.save(); ctx.translate(sl.vcx, sl.vcy); ctx.rotate(sl.th); ctx.scale(1, 1 + 0.06 * Math.sin(k * 2.1));
        ctx.globalAlpha = sl.vc * (L ? 0.85 : 0.9); ctx.drawImage(AS.vap[k & 1], -vh * 0.98, -vh * 0.5, vh * 1.2, vh); ctx.restore();
      }
      for (const b of sl.booms) { // shock rings of 마기, edge on: broken, uneven, torn open, embers on their front
        if (b.life < 0) continue;
        const q = b.life / b.max, r = lerp(b.r0, b.r1, 1 - (1 - q) * (1 - q)), xe = Math.hypot(0.38 * r * c, r * n), lf = b.at ? 1 : leftFade(b.x, xe); // (the blast at their point stays: they are where it lands) if (lf <= 0.01) continue;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(sl.th); ctx.scale(0.38, 1); ctx.rotate(b.rot + q * 0.4);
        ctx.globalAlpha = (b.v === 2 ? 1 : b.v ? 0.8 : 0.6) * (1 - q * q) * lf; ctx.drawImage(AS.ring[b.vi || 0], -r * 1.28, -r * 1.28, r * 2.56, r * 2.56); ctx.restore();
      }
      if (bub && bub.life >= 0) { const lf = leftFade(bub.x, bR); if (lf > 0.01) { ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.7, u * 0.0025 * (1 - bq)); ctx.globalAlpha = (L ? 0.18 : 0.22) * (1 - bq) * lf; ctx.beginPath(); ctx.arc(bub.x, bub.y, bR, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke(); ctx.restore(); } } // the bubble of shock, faint, on his side
      ctx.globalAlpha = 1;
    }

    // swords in flight, and their trails
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
    for (const s of st.sw) {
      const tr = s.tr, n = tr.length / 2;
      if (n < 2) continue;
      const strong = s.st === 'fly' || s.hot ? 1 : 0.4, cHot = L ? `rgb(${crim})` : `rgb(${gold})`, cCrim = `rgb(${crim})`;
      for (let c = 0; c < 4; c++) { // the trail in four strokes, hot at the head, fading behind
        const i0 = Math.floor((c * (n - 1)) / 4), i1 = Math.floor(((c + 1) * (n - 1)) / 4), k = (c + 0.5) / 4;
        if (i1 <= i0) continue;
        ctx.strokeStyle = k < 0.25 ? cHot : cCrim; ctx.globalAlpha = strong * Math.pow(1 - k, 1.4) * (L ? 0.55 : 0.6); ctx.lineWidth = Math.max(0.6, u * 0.0034 * strong * (1 - k) + u * 0.0008);
        ctx.beginPath(); ctx.moveTo(tr[i0 * 2], tr[i0 * 2 + 1]); for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(tr[i * 2], tr[i * 2 + 1]); ctx.stroke();
      }
    }
    ctx.restore();
    for (const s of st.sw) if (s.st !== 'ring' && !s.hid && !((s.st === 'ult' || s.st === 'orb') && !s.lay)) drawSword(s, s.st === 'ret' ? (L ? 0.6 : 0.78) : L ? 0.72 : 0.9, 1);
    if (st.glint) { const gk = 1 - st.glint.life / 7; ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${L ? crim : '255,236,220'},${0.8 * gk})`; ctx.lineWidth = Math.max(0.7, u * 0.0016); const r = u * 0.018 * (0.6 + 0.4 * gk); ctx.beginPath(); ctx.moveTo(st.glint.x - r, st.glint.y); ctx.lineTo(st.glint.x + r, st.glint.y); ctx.moveTo(st.glint.x, st.glint.y - r); ctx.lineTo(st.glint.x, st.glint.y + r); ctx.stroke(); ctx.restore(); }
    if (sl && sl.k > 12 && sl.k < SL.split + 16) { // the five on one point: threads of their qi run to it, a bright point, a wedge of pale qi where the spearhead strikes
      const k = sl.k, F = sl.F, c = Math.cos(sl.th), n = Math.sin(sl.th), px = -n, py = c, qc2 = L ? '40,70,150' : '200,222,255';
      const fa = ss((k - 12) / 22) * (k < SL.split ? 1 : 1 - ss((k - SL.split) / 14)), br = 0.45 + 0.55 * ss((k - SL.form) / (SL.hit - SL.form)) + (k >= SL.hit && k < SL.split ? 0.35 : 0);
      ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgb(${qc2})`; ctx.lineWidth = Math.max(0.8, u * 0.0018); ctx.globalAlpha = (L ? 0.38 : 0.3) * fa * Math.min(1, br); ctx.beginPath();
      for (const hh of st.heroes) { if (hh.ch) continue; const [x0, y0] = hh.hit; ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + F[0]) / 2 + Math.sin(t * 0.3 + hh.i * 2) * u * 0.005, (y0 + F[1]) / 2 - u * 0.012 + Math.cos(t * 0.27 + hh.i) * u * 0.004, F[0], F[1]); }
      ctx.stroke();
      const wa = fa * (k < SL.hit ? ss((k - SL.form + 14) / 14) : 1), push = k >= SL.hit ? u * 0.007 * ss((k - SL.hit) / 4) * (k < SL.split ? 1 : 1 - ss((k - SL.split) / 6)) : 0;
      if (wa > 0.01) {
        const ax = F[0] - c * (u * 0.006 - push), ay = F[1] - n * (u * 0.006 - push), sp = 0.62 + (k >= SL.split ? 0.4 * ss((k - SL.split) / 8) : 0), len = u * 0.05, bow = push * 1.6;
        const e1x = ax + Math.cos(sl.th + sp) * len, e1y = ay + Math.sin(sl.th + sp) * len, e2x = ax + Math.cos(sl.th - sp) * len, e2y = ay + Math.sin(sl.th - sp) * len;
        ctx.beginPath(); ctx.moveTo(e1x, e1y); ctx.quadraticCurveTo((ax + e1x) / 2 - c * bow, (ay + e1y) / 2 - n * bow, ax, ay); ctx.quadraticCurveTo((ax + e2x) / 2 - c * bow, (ay + e2y) / 2 - n * bow, e2x, e2y); ctx.quadraticCurveTo(ax + c * len * 0.55, ay + n * len * 0.55, e1x, e1y); ctx.closePath();
        ctx.fillStyle = `rgb(${qc2})`; ctx.globalAlpha = (L ? 0.14 : 0.13) * wa * br; ctx.fill();
        ctx.globalAlpha = (L ? 0.6 : 0.7) * wa * Math.min(1, br); ctx.lineWidth = Math.max(0.9, u * 0.002); ctx.stroke();
        if (k >= SL.hit + 2) { // cracks running through it
          ctx.globalAlpha = (L ? 0.5 : 0.6) * wa; ctx.lineWidth = Math.max(0.7, u * 0.0012); ctx.beginPath();
          for (let i = 0; i < 4; i++) { const q = (i + 0.5) / 4, sd = i % 2 ? 1 : -1, bx = lerp(ax, sd > 0 ? e1x : e2x, q * 0.8), by = lerp(ay, sd > 0 ? e1y : e2y, q * 0.8); ctx.moveTo(bx, by); ctx.lineTo(bx + c * u * 0.012 + px * sd * u * 0.004, by + n * u * 0.012 + py * sd * u * 0.004); ctx.lineTo(bx + c * u * 0.02, by + n * u * 0.02); }
          ctx.stroke();
        }
      }
      const pr = u * (0.01 + 0.02 * br) * fa; // the point itself
      if (pr > 0.5) K.glow(ctx, F[0], F[1], pr * 2.2, L ? [[0, `rgba(40,70,150,${0.42 * fa})`], [0.3, `rgba(40,70,150,${0.15 * fa})`], [1, 'rgba(40,70,150,0)']] : [[0, `rgba(255,255,255,${0.9 * fa})`], [0.18, `rgba(214,230,255,${0.5 * fa})`], [0.5, `rgba(150,180,255,${0.12 * fa})`], [1, 'rgba(150,180,255,0)']]);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (st.qrip.length || st.qtong.length) { // 마기 surging off a blade where it met a guard: a ripple running out, tongues curling off
      ctx.save();
      for (let pass = 0; pass < 2; pass++) {
        if (pass && !L) ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = pass ? `rgb(${crim})` : L ? 'rgb(40,30,36)' : 'rgb(14,2,6)';
        for (const q of st.qrip) {
          const k = q.life / q.max, r = q.r * (1 + 3.2 * ss(Math.sqrt(k)));
          ctx.globalAlpha = (pass ? (L ? 0.4 : 0.5) : L ? 0.2 : 0.4) * (1 - k); ctx.lineWidth = Math.max(0.7, u * (pass ? 0.0016 : 0.005) * (1 - k * 0.6));
          ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = (i / 20) * TAU, rr = r * (1 + 0.13 * Math.sin(a * 5 + q.ph + q.life * 0.7)); ctx[i ? 'lineTo' : 'moveTo'](q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr * 0.8); }
          ctx.stroke();
        }
        ctx.lineWidth = Math.max(0.8, u * (pass ? 0.0018 : 0.004)); ctx.globalAlpha = pass ? (L ? 0.45 : 0.55) : L ? 0.25 : 0.45; ctx.beginPath();
        for (const p of st.qtong) { const k = p.life / p.max; if (k > 0.85) continue; ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x - p.vx * 2 + p.vy * p.c * 6, p.y - p.vy * 2 - p.vx * p.c * 6, p.x - p.vx * 4 * (1 - k), p.y - p.vy * 4 * (1 - k)); }
        ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // qi thrown back at him; the pressure of his domain in the air
    ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
    for (const hh of st.heroes) { // a charging hero's trail of qi
      const c = hh.ch; if (!c || c.tr.length < 4) continue;
      const n = c.tr.length / 2; ctx.strokeStyle = L ? '#284696' : '#bed6ff';
      for (let i = 0; i < n - 1; i++) { const k = i / (n - 1); ctx.globalAlpha = (L ? 0.32 : 0.38) * (1 - k); ctx.lineWidth = Math.max(0.8, u * 0.007 * (1 - k)); ctx.beginPath(); ctx.moveTo(c.tr[i * 2], c.tr[i * 2 + 1]); ctx.lineTo(c.tr[i * 2 + 2], c.tr[i * 2 + 3]); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (st.dome) { // the old master's dome over himself and the one beside him: blades clang off it and it cracks
      const q = st.dome, fd = q.fade === undefined ? -1 : q.fade, a = ss(q.k / 12) * (fd < 0 ? 1 : 1 - ss((fd - 6) / 26)), R = q.R * (fd < 0 ? 1 : 1 - 0.12 * ss(fd / 30)), glo = fd < 0 ? 1 : 1 + 1.6 * Math.sin(Math.PI * clamp(fd / 12, 0, 1));
      ctx.strokeStyle = L ? '#284696' : '#c4d8ff';
      ctx.globalAlpha = (L ? 0.06 : 0.05) * a; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.ellipse(q.cx, q.cy, R, R * 0.92, 0, Math.PI, TAU); ctx.fill();
      ctx.globalAlpha = (L ? 0.4 : 0.34) * a; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.stroke();
      ctx.globalAlpha = Math.min(1, (L ? 0.4 : 0.34) * a * glo); ctx.lineWidth = Math.max(0.7, u * 0.0013); ctx.beginPath();
      for (let i = 0; i < Math.min(9, q.hits); i++) { const th = Math.PI * (1.15 + (i * 0.618 % 1) * 0.7), x = q.cx + Math.cos(th) * R, y = q.cy + Math.sin(th) * R * 0.92; ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(th) * R * 0.12 + R * 0.04, y - Math.sin(th) * R * 0.1); ctx.lineTo(x - Math.cos(th) * R * 0.2, y - Math.sin(th) * R * 0.2 + R * 0.03); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (st.shield) { // the shield of pale qi they raise together, cracking and breaking
      const q = st.shield, y0 = Y.rows[2] - u * 0.17, y1 = Y.rows[0] + u * 0.005, ym = (y0 + y1) / 2, a = ss(q.k / 20) * (q.cr ? 1 - ss(q.br / 20) : 1) * (q.dis ? 1 - ss(q.dis / 24) : 1), bx = q.x + u * 0.035 * (1 + 0.15 * Math.sin(t * 0.3));
      ctx.strokeStyle = L ? '#284696' : '#c4d8ff';
      ctx.globalAlpha = (L ? 0.1 : 0.08) * a; ctx.lineWidth = u * 0.03; ctx.beginPath(); ctx.moveTo(q.x, y0); ctx.quadraticCurveTo(bx, ym, q.x, y1); ctx.stroke();
      ctx.globalAlpha = (L ? 0.4 : 0.32) * a * (0.8 + 0.2 * Math.sin(t * 0.5)); ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.stroke();
      if (q.cr) { ctx.globalAlpha = 0.55 * a; ctx.lineWidth = Math.max(0.7, u * 0.0014); ctx.beginPath(); for (const [p, d1, d2] of q.cuts) { const y = lerp(y0, y1, p), x = lerp(q.x, bx, 0.5 * (1 - Math.abs(p - 0.5) * 2)); ctx.moveTo(x, y); ctx.lineTo(x + d1 * u * 0.02, y + u * 0.02); ctx.lineTo(x + d2 * u * 0.02, y + u * 0.04); } ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (st.ab) { // 흡공: a vast crimson current pouring across the gap into his open palm, the heroes caught in it
      const a = st.ab, hx = Y.cx - st.dacc.hand[0] * Y.hc, hy = hipY + st.dacc.hand[1] * Y.hc, ox = hx, oy = hy, fld = st.pull || 0; a.o = [ox, oy]; // (just above his upturned palm)
      const hs = st.heroes.filter((h) => !h.ch && h.X !== undefined);
      if (fld > 0.01 && hs.length) {
        const x0 = Math.min(...hs.map((h) => h.X)) - u * 0.08, x1 = Math.max(...hs.map((h) => h.X)) + u * 0.06, cur = [];
        for (const h of hs) { // a current to each of them: it reaches out to them one by one, and once they tear free it whips back into his palm
          const b = h.ab, on = b && b.ph !== 'wait', r = on ? h.tl || 0 : 0, bx = h.X + Math.sin(r) * h.sz * 0.12, by = on ? h.Yg - h.sz * 0.3 - Math.cos(r) * h.sz * 0.12 : h.Yg - h.sz * 0.45;
          const f = (b ? (b.ph === 'wait' ? ss((a.k - b.kc + 12) / 12) : 1) : 1) * (1 - ss(b ? b.rc : 0)); if (f < 0.02) continue;
          const j = h.lnj === undefined ? 2 : h.lnj, ex = ox - (4 - j) * u * 0.012, ey = oy + (j - 2) * u * 0.018, sx = lerp(ex, bx, f), sy = lerp(ey, by, f);
          cur.push([sx, sy, lerp(sx, ex, 0.5) + Math.sin(t * 0.05 + h.i) * u * 0.04 * f, Math.min(sy, ey) - u * (0.05 + 0.02 * Math.sin(t * 0.04 + h.i * 2)) * f, h, ex, ey, f]); // each reaching a different point round his palm
        }
        ctx.save(); if (!L) ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgb(${crim})`; ctx.lineWidth = Math.max(0.7, u * 0.0016); ctx.globalAlpha = (L ? 0.16 : 0.14) * fld; ctx.beginPath(); // the stones under them glowing faintly red, streaked toward him
        for (let i = 0; i < 9; i++) { const x = lerp(x0, x1, (i + 0.5) / 9) + ((t * 1.3 + i * 37) % 30) * u * 0.001, y = lerp(Y.rows[2], Y.rows[0], (i * 0.37) % 1); ctx.moveTo(x, y); ctx.lineTo(x + u * 0.06, y - u * 0.004); }
        ctx.stroke();
        // the currents, flowing into his palm (the mist in them shows the flow)
        for (const [sx, sy, cx, cy, h, ex, ey, f] of cur) { const g = fld * (0.4 + 0.6 * (h.cl || 0)) * (0.3 + 0.7 * f); for (const [w, al] of [[u * 0.016, 0.07], [u * 0.006, 0.09], [u * 0.002, 0.14]]) { ctx.globalAlpha = (L ? 0.85 : 1) * al * g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke(); } }
        const pr = K.tint(puff(), L ? '#b02434' : '#c0283a'); // red mist carried along in it
        if (cur.length) for (let j = 0; j < (st.q >= 1 ? 6 : 10); j++) { const q = (t * 0.012 + j / 10) % 1, [sx, sy, cx, cy, , ex, ey] = cur[j % cur.length], m = 1 - q, x = m * m * sx + 2 * m * q * cx + q * q * ex, y = m * m * sy + 2 * m * q * cy + q * q * ey, r = u * (0.045 * (1 - q) + 0.012); ctx.globalAlpha = (L ? 0.1 : 0.12) * fld * Math.sin(Math.PI * q); ctx.drawImage(pr, x - r, y - r, r * 2, r * 2); }
        const tight = Math.min(1, (st.dm.ab || 0) / 0.25 + 0.4 * ((st.dacc && st.dacc.beck) || 0)); // bands of red mist coiling round each of them (turned with them), tightening as he closes his hand; before they tear free the bands loosen, flicker and fray, then fly apart
        for (const h of hs) {
          const cl = h.cl || 0; if (cl < 0.02) continue;
          const b = h.ab, on = b && b.ph !== 'wait', r = on ? h.tl || 0 : 0, ls = on && b.ph === 'pull' ? b.ls : 0, gone = on && b.ph !== 'pull' ? 1 - cl : 0;
          const cx = h.X + Math.sin(r) * h.sz * 0.12 + h.sz * 0.02, cy = on ? h.Yg - h.sz * 0.3 - Math.cos(r) * h.sz * 0.12 : h.Yg - h.sz * 0.42, rx = h.sz * (0.34 - 0.1 * tight) * (1.4 - 0.4 * cl) * (1 + 0.3 * ls + 0.8 * gone), ry = h.sz * 0.12 * (1 + 0.2 * ls + 0.5 * gone), sp = 4 * (1 - 0.3 * ls), gp = 0.7 * ls;
          ctx.lineWidth = Math.max(1, u * 0.006 * (1 - 0.3 * ls));
          for (let j = 0; j < 3; j++) {
            const ph = t * 0.16 * (j % 2 ? -1 : 1) + j * 2.1 + h.i, dj = (j - 1) * h.sz * 0.22, yy = cy + Math.cos(r) * dj, xx = cx - Math.sin(r) * dj, rj = rx * (1 - 0.12 * j), fl = ls > 0.01 ? 1 - 0.5 * ls * (0.5 + 0.5 * nz(t * 0.9 + h.i * 7 + j * 3)) : 1;
            ctx.globalAlpha = (L ? 0.2 : 0.22) * cl * fld * fl; ctx.beginPath();
            if (gp > 0.03) { ctx.ellipse(xx, yy, rj, ry, -0.25 + 0.12 * j + r, ph, ph + sp * 0.5); const th = ph + sp * 0.5 + gp, ro = -0.25 + 0.12 * j + r; ctx.moveTo(xx + rj * Math.cos(th) * Math.cos(ro) - ry * Math.sin(th) * Math.sin(ro), yy + rj * Math.cos(th) * Math.sin(ro) + ry * Math.sin(th) * Math.cos(ro)); ctx.ellipse(xx, yy, rj, ry, -0.25 + 0.12 * j + r, ph + sp * 0.5 + gp, ph + sp); } // (frayed: broken in two)
            else ctx.ellipse(xx, yy, rj, ry, -0.25 + 0.12 * j + r, ph, ph + sp);
            ctx.stroke();
            if (j === 0) { const px = xx + Math.cos(ph + 2) * rj, rr = h.sz * 0.16; ctx.globalAlpha = (L ? 0.1 : 0.14) * cl * fld * fl; ctx.drawImage(pr, px - rr, yy - rr * 0.6, rr * 2, rr * 1.2); }
          }
        }
        const pq = K.tint(puff(), L ? '#3a56a0' : '#c8dcff'); // their own qi flaring as they fight it, brightest as they gather it to tear free
        for (const h of hs) {
          const b = h.ab; if (!b || b.ph === 'wait') continue;
          const q = b.ph === 'pull' ? Math.min(1, 0.5 * b.air + 0.9 * b.ls) : b.ph === 'free' ? Math.max(0, 1 - b.k / 8) : 0; if (q < 0.03) continue;
          const r = h.sz * 0.5, cx = h.X + Math.sin(h.tl || 0) * h.sz * 0.12, cy = h.Yg - h.sz * 0.3 - Math.cos(h.tl || 0) * h.sz * 0.12;
          ctx.globalAlpha = (L ? 0.11 : 0.14) * q * (0.75 + 0.25 * Math.sin(t * 0.6 + h.i)); ctx.drawImage(pq, cx - r, cy - r, r * 2, r * 2);
          if (h.type === 'master' && b.ph === 'pull' && h.hbw) { const rp = h.sz * 0.14; ctx.globalAlpha = (L ? 0.14 : 0.16) * (0.5 + 0.5 * Math.max(0, nz(t * 0.2 + b.sd + 26))) * Math.max(0.4, b.air); ctx.drawImage(pq, h.hbw[0] - rp, h.hbw[1] - rp, rp * 2, rp * 2); } // the old master's palm pushing back
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
      if (a.r > 0.5) K.glow(ctx, ox, oy, a.r * 2, L ? [[0, 'rgba(160,30,44,0.4)'], [1, 'rgba(160,30,44,0)']] : [[0, 'rgba(255,190,180,0.45)'], [0.35, 'rgba(226,46,58,0.3)'], [1, 'rgba(226,46,58,0)']]); // the small orb in his palm
    }
    for (const p of st.palm) { // the old master's palm: a crescent of pale qi with a faint palm at its heart, flying out to meet the blade
      const e = Math.min(1, p.life / p.max), fd = p.life > p.max ? 1 - (p.life - p.max) / 4 : 1, r = u * (0.016 + 0.02 * e), c = Math.cos(p.a), n = Math.sin(p.a);
      ctx.strokeStyle = ctx.fillStyle = L ? '#284696' : '#d8e6ff';
      ctx.globalAlpha = (L ? 0.55 : 0.6) * (1 - 0.35 * e) * fd; ctx.lineWidth = Math.max(0.8, u * 0.0032);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.42, r, p.a, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.globalAlpha = (L ? 0.3 : 0.28) * (1 - 0.35 * e) * fd; ctx.lineWidth = Math.max(0.7, u * 0.0016);
      ctx.beginPath(); ctx.ellipse(p.x - c * r * 0.25, p.y - n * r * 0.25, r * 0.32, r * 0.78, p.a, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.globalAlpha = (L ? 0.18 : 0.2) * fd; const hx = p.x - c * r * 0.55, hy = p.y - n * r * 0.55;
      ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.22, r * 0.3, p.a, 0, TAU); ctx.fill(); ctx.lineWidth = Math.max(0.6, u * 0.0014); ctx.beginPath();
      for (let k = -1.5; k <= 1.5; k++) { const fx = hx + c * r * 0.18 - n * k * r * 0.13, fy = hy + n * r * 0.18 + c * k * r * 0.13; ctx.moveTo(fx, fy); ctx.lineTo(fx + c * r * 0.22, fy + n * r * 0.22); }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (p.life < 4) K.glow(ctx, p.x0, p.y0, u * 0.022, [[0, L ? `rgba(40,70,150,${0.35 * (1 - p.life / 4)})` : `rgba(220,234,255,${0.5 * (1 - p.life / 4)})`], [1, 'rgba(150,180,255,0)']]);
    }
    for (const hh of st.heroes) if (hh.noWpn && !hh.ch && hh.grd > 0.15) { // disarmed: a palm of pale qi pushed out against what comes
      const r = hh.sz * 0.09 * (0.8 + 0.2 * hh.grd); ctx.fillStyle = ctx.strokeStyle = L ? '#284696' : '#c8dcff';
      ctx.globalAlpha = 0.1 * hh.grd; ctx.beginPath(); ctx.ellipse(hh.hit[0], hh.hit[1], r * 0.45, r, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = (L ? 0.5 : 0.45) * hh.grd; ctx.lineWidth = Math.max(0.7, u * 0.0014); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (st.qmote.length) { // what is left of a shield: motes drifting up, slivers falling
      ctx.fillStyle = ctx.strokeStyle = L ? '#284696' : '#d2e0ff'; ctx.lineWidth = Math.max(0.7, u * 0.0014);
      for (const p of st.qmote) { const k = p.life / p.max; ctx.globalAlpha = (p.sh ? 0.6 : 0.5) * (1 - k) * ss(p.life / 3); if (p.sh) { const c = Math.cos(p.rot) * u * 0.006, n = Math.sin(p.rot) * u * 0.006; ctx.beginPath(); ctx.moveTo(p.x - c, p.y - n); ctx.lineTo(p.x + c, p.y + n); ctx.stroke(); } else { const r = Math.max(0.7, u * 0.0016); ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); } }
      ctx.globalAlpha = 1;
    }
    for (const q of st.shat) { // the ring of shattered qi where a charge broke
      const k = q.life / 14, r = u * (0.02 + 0.06 * k); ctx.strokeStyle = L ? '#284696' : '#d2e0ff'; ctx.globalAlpha = 0.55 * (1 - k); ctx.lineWidth = Math.max(0.8, u * 0.003 * (1 - k));
      ctx.beginPath(); ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, TAU);
      for (let i = 0; i < 10; i++) { const a = (i * TAU) / 10 + q.life * 0.05; ctx.moveTo(q.x + Math.cos(a) * r * 1.15, q.y + Math.sin(a) * r * 1.15); ctx.lineTo(q.x + Math.cos(a) * r * 1.5, q.y + Math.sin(a) * r * 1.5); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const b of st.bolts) {
      const a = Math.atan2(b.vy, b.vx), n = b.tr.length / 2;
      ctx.strokeStyle = L ? '#284696' : '#bed6ff';
      for (let i = 0; i < n - 1; i++) { const k = i / (n - 1); ctx.globalAlpha = (L ? 0.4 : 0.45) * (1 - k); ctx.lineWidth = Math.max(0.7, u * 0.004 * (1 - k)); ctx.beginPath(); ctx.moveTo(b.tr[i * 2], b.tr[i * 2 + 1]); ctx.lineTo(b.tr[i * 2 + 2], b.tr[i * 2 + 3]); ctx.stroke(); }
      ctx.globalAlpha = 1;
      K.glow(ctx, b.x, b.y, u * 0.034, [[0, L ? 'rgba(50,80,160,0.3)' : 'rgba(186,210,255,0.4)'], [0.35, L ? 'rgba(50,80,160,0.1)' : 'rgba(150,180,255,0.12)'], [1, 'rgba(150,180,255,0)']]);
      ctx.fillStyle = L ? 'rgba(36,64,140,0.75)' : 'rgba(236,244,255,0.85)';
      ctx.beginPath();
      if (b.kind === 'crescent') { const cx = b.x - Math.cos(a) * u * 0.02, cy = b.y - Math.sin(a) * u * 0.02, r = u * 0.028; ctx.arc(cx, cy, r, a - 1.15, a + 1.15); ctx.arc(cx - Math.cos(a) * r * 0.35, cy - Math.sin(a) * r * 0.35, r * 1.12, a + 0.95, a - 0.95, true); } // a crescent of sword qi
      else ctx.arc(b.x, b.y, u * 0.0065, 0, TAU); // a palm's worth of qi
      ctx.fill();
    }
    // sparks and flashes
    if (st.sparks.length) { // sparks: white-hot, then gold, then crimson, one stroke for each band (the hero's qi pale blue)
      const bands = [[L ? `rgb(${gold})` : '#ffecc8', 0.83], [`rgb(${gold})`, 0.5], [`rgb(${crim})`, 0.18], [L ? '#284696' : '#c8dcff', 0.55]];
      for (let b = 0; b < 4; b++) {
        ctx.beginPath(); let any = 0;
        for (const p of st.sparks) { const k = p.life / p.max, pb = p.col ? 3 : k < 0.35 ? 0 : k < 0.65 ? 1 : 2; if (pb !== b) continue; any = 1; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6); }
        if (!any) continue;
        ctx.strokeStyle = bands[b][0]; ctx.globalAlpha = bands[b][1] * (L ? 0.8 : 0.9); ctx.lineWidth = Math.max(0.6, u * 0.0014); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const f of st.flashes) { const k = f.life / f.max; K.glow(ctx, f.x, f.y, f.r * (0.6 + 0.6 * k), [[0, f.c ? `rgba(${L ? '40,70,150' : '214,228,255'},${0.5 * (1 - k)})` : `rgba(${L ? crim : '255,226,190'},${0.55 * (1 - k)})`], [0.4, f.c ? `rgba(${L ? '40,70,150' : '150,180,255'},${0.15 * (1 - k)})` : `rgba(${crim},${0.18 * (1 - k)})`], [1, 'rgba(0,0,0,0)']]); }
    ctx.restore();
    // dust and chips of stone
    const pf = K.tint(puff(), L ? '#7a6e64' : '#b8c0d6');
    const pfk = K.tint(puff(), L ? '#2a2226' : '#060308');
    const pfc = K.tint(puff(), L ? '#8a5a52' : '#a03a3a');
    for (const p of st.dust) { const k = p.life / p.max; ctx.globalAlpha = (p.blk ? (L ? 0.3 : 0.42) : p.cr ? (L ? 0.26 : 0.3) : L ? 0.22 : 0.16) * ss(k * 5) * (1 - k); ctx.drawImage(p.blk ? pfk : p.cr ? pfc : pf, p.x - p.r, p.y - p.r * 0.7, p.r * 2, p.r * 1.4); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = L ? 'rgba(52,50,52,0.55)' : 'rgba(110,116,134,0.6)';
    for (const p of st.chips) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = 1 - p.life / 46; ctx.beginPath(); ctx.moveTo(-p.s, p.s * 0.4); ctx.lineTo(p.s * 0.2, -p.s * 0.6); ctx.lineTo(p.s, p.s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); } // stone chips
    ctx.globalAlpha = 1;
    for (let i = 0; i < st.leaves.length; i++) { const l = st.leaves[i]; if (Math.sin(l.a) >= 0 && !(st.q >= 1 && i % 3 === 2)) leaf(l); }
    ctx.globalAlpha = 1;
    K.put(ctx, S.near, W, H, L ? 0.5 : 0.9);
    { // the grade (see gradeSprites)
      const G = S.grade || (S.grade = gradeSprites(V, Y, L, h, bg.dpr)), p = Math.min(1, st.flare * (st.dom ? 1 : 0.6)), hs = st.hs || 0;
      const tb = t % 78, beat = (q) => ss(1 - Math.abs(q) / 7), hb = (beat(tb - 7) + 0.55 * beat(tb - 19)) * (1 - p); // his presence, even at rest: a slow, deep double beat every two and a half seconds
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(G.tone, 0, 0, W, H);
      if (hs > 0.02) { ctx.globalAlpha = hs * (L ? 0.34 : 0.5); ctx.fillStyle = L ? '#8e8a84' : '#121419'; ctx.fillRect(0, V.oy, w, h); } // a big blow drains the colour
      ctx.globalCompositeOperation = 'source-over';
      st.pdk = (st.pdk || 0) + ((!L && st.dom && st.dom.type === 'press' ? 1 : 0) - (st.pdk || 0)) * 0.05; const pdk = st.pdk; // (dark page, through the pressure wave: the edges held back a little, so the storm, the ring and the five on their knees still read)
      ctx.globalAlpha = (pv ? 0.6 : 1) * Math.min(1, 0.8 + 0.2 * p * (1 - 0.6 * pdk) + 0.12 * hb + 0.15 * hs); ctx.drawImage(G.vg, 0, V.oy, w, h);
      const rd = p * 0.95 * (1 - 0.3 * pdk) + 0.3 * hb; if (rd > 0.02) { ctx.globalAlpha = Math.min(1, rd) * (pv ? 0.5 : 1); ctx.drawImage(G.red, 0, V.oy, w, h); } // the edges red-black with it
      const tq = Math.min(1, p * p * 0.55 * (st.dom && st.dom.type === 'press' ? (L ? 0.45 : 0.25) : 1) + 0.45 * (st.tp || 0)); if (tq > 0.02 && !pv) { ctx.globalAlpha = tq; ctx.drawImage(G.tun, 0, V.oy, w, h); } // through his great moves the frame closes in on him
      if (hs > 0.05 && st.hsp && !pv) { const [ix, iy] = st.hsp, g = ctx.createRadialGradient(ix, iy, u * 0.04, ix, iy, u * 0.55); g.addColorStop(0, L ? 'rgba(40,34,30,0)' : 'rgba(0,0,0,0)'); g.addColorStop(1, L ? 'rgba(40,34,30,0.16)' : 'rgba(0,0,0,0.3)'); ctx.globalAlpha = hs; ctx.fillStyle = g; ctx.fillRect(0, V.oy, w, h); } // and for a moment everything but the blow goes dark
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    qualityTick(st, performance.now() - T0);
  };
})();
