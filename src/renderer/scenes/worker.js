'use strict';
/*
 * 작업하는 일꾼 (미니어처 공방): a small workshop diorama in the lower right, seen from a little above like a model on
 * a table: floor boards, a cut-away corner of two walls (pine boards, brick), a workbench with a vice under a pegboard,
 * a window with this hour's sky, a ticking clock, a stool, a cat in its basket and a shelf for finished pieces. A small
 * woodworker in it follows the AI agent in the active tab:
 * - working: the lamp turns up and sawdust drifts in its light; he hammers, saws, planes, measures and checks the
 *   blueprint, taking the hammer from the pegboard and putting it back, and the piece on the bench takes shape part by
 *   part (on a long task he wipes his brow, sips coffee, rolls up his sleeves; a sawn-short plank is swapped for a
 *   new board from under the bench);
 * - finished (as app.js decides it: working -> done, not stopped by Esc): the last parts go on, a rub of polish, a
 *   stretch, and he carries the piece (a birdhouse, a chair, a toy boat ... a different one each time) to the shelf
 *   with a small flare of light; the shelf fills over the session, then a crate under the bench;
 * - waiting for input: the lamp dims, he dozes on the stool, the cat curls up;
 * - a question: he turns to you with a hand raised under a "?";
 * - interrupted (Esc / Ctrl+C): he starts, the tool drops to the floor, and he picks it up and hangs it back;
 * - a plain shell: he reads the paper, sweeps up, has a coffee, whistles.
 * The room is painted once per size at two lamp levels and cross-faded; the figure is a small rig (two-bone IK limbs)
 * posed by eased keyframes on the plane z = 0, which the camera shows without distortion. Light mode is drawn here.
 */
(function () {
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('worker');

  /* ---------- small helpers ---------- */
  const TAU = Math.PI * 2, PI = Math.PI, DT = 1 / 30;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const sm = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const E = {
    lin: (k) => k,
    in: (k) => k * k * k, // accelerating into a blow
    in2: (k) => k * k,
    out: (k) => 1 - (1 - k) ** 3, // slowing into a wind-up
    out2: (k) => 1 - (1 - k) ** 2,
    io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
    sm,
    back: (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2, // a little overshoot
  };
  const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; else if (d < -PI) d += TAU; return a + d * k; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const scl = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  /* ---------- the workshop, in scene units (su): floor at y = 0, up is negative ---------- */
  const BENCH = { x0: -172, x1: 0, top: -50 };
  const AX = 17, SAWX = 27; // where he stands at the bench end (feet centre); a step back for sawing the overhang
  const STOOL = { x: 70, seat: -22 }, SITX = 50; // a low three-legged stool; his feet when sitting on it
  const SHELF = { x0: 104, x1: 216, ys: [-80, -114] };
  const SLOTS = [[126, 0], [152, 0], [178, 0], [134, 1], [160, 1], [186, 1]];
  const CRATE = { x: -122 };
  const PIECE_X = -30;
  const SAW_HOOK = [3, -47];
  const BROOM_X = 96;
  const PRINT = { x: -66, y: -144, w: 34, h: 26 };
  const BIN = { x0: -44, x1: -28 };

  /*
   * The diorama: a one-point perspective onto a small room with two walls (back and left) cut away at the top.
   * The figure lives on the plane z = 0 (the front faces of the bench, stool and shelves); that plane maps onto the
   * screen without distortion, so his actions keep simple 2D coordinates. Farther things shrink toward V.
   */
  const CAM = { D: 640, vx: 110, vy: -380 };
  const ROOM = { x0: -198, x1: 240, z0: -72, z1: 32, h: 178, t: 7 };
  const zf = (z) => CAM.D / (CAM.D + z);
  const P3 = (x, y, z) => { const f = zf(z); return [CAM.vx + (x - CAM.vx) * f, CAM.vy + (y - CAM.vy) * f]; };
  /* he is taller than the stocky rig his actions were first written for: heights on his plane are remapped */
  const UPL = 9;
  function Ym(y) {
    if (y >= -5) return y;
    if (y >= -41.5) return y - (UPL * (-y - 5)) / 36.5;
    if (y >= -72) return y - UPL;
    if (y >= -92) return y - UPL + (7 * (-72 - y)) / 20;
    return y - UPL + 7;
  }
  function Yinv(r) { let lo = -320, hi = 20; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Ym(m) < r) lo = m; else hi = m; } return (lo + hi) / 2; }
  const TOP = Ym(-50); // the bench top as drawn
  const BZ = 30; // bench depth
  const PEG = { x0: -158, x1: 4, y0: -62, y1: -134, hammer: [-2, -80] }; // the pegboard on the back wall, and its hooks
  const LAMPZ = 16;
  const CAT = { x: 162, z: -40 };
  const WIN = { x0: 36, x1: 92, y0: -96, y1: -150 };
  const CLOCK = { x: 16, y: -140 };

  /* ---------- palettes: [lit, base, shade] as lit by the warm lamp ---------- */
  const RAW = {
    skin: ['#f3caa8', '#d99e7a', '#8c5a41'], hair: ['#866046', '#47311f', '#1d130b'], shirt: ['#cfe0ec', '#93b0c6', '#4a647c'],
    apron: ['#bd8655', '#835834', '#3f2715'], pants: ['#626b84', '#3e4559', '#1c202b'], boot: ['#9a643f', '#633f25', '#2c1a0e'],
    wood: ['#e3b882', '#b78450', '#6e4a2c'], steel: ['#eef2f6', '#a7afba', '#5b626d'],
    red: ['#e0705a', '#b94534', '#6c2519'], yellow: ['#f7d66a', '#ddb03a', '#8a6a1c'], cream: ['#f8efdc', '#e2d4b8', '#a08f70'],
  };
  const pal = {};
  for (const k in RAW) { pal[k] = RAW[k]; pal[k + 'F'] = RAW[k].map((h) => rgb(scl(hex(h), 0.72))); }
  const LINE = { D: 'rgba(28,16,10,0.85)', L: 'rgba(58,34,20,0.72)' };

  /* ---------- the figure's rig ---------- */
  const LIMB = { up: 17.5, fore: 16.5, thigh: 24, shin: 22.6 };
  const F = ['x', 'hx', 'hy', 'lean', 'hd', 'turn', 'nx', 'ny', 'na', 'fx', 'fy', 'fa', 'nfx', 'nfy', 'nft', 'ffx', 'ffy', 'fft', 'eye', 'happy', 'brow', 'mouth', 'sq', 'sx', 'nh', 'fh', 'ff'];
  const ANG = { na: 1, fa: 1 };
  const BASE = { face: -1, x: AX, hx: -2, hy: -41.5, lean: 0.06, hd: 0.06, turn: 0, nx: 3, ny: -43, na: 1.5, fx: -2, fy: -44, fa: 1.55, nfx: 4, nfy: -5, nft: 0, ffx: -7, ffy: -5, fft: 0, eye: 1, happy: 0, brow: 0, mouth: 0, sq: 1, sx: 1, nh: 0, fh: 0, ff: 0 };
  const HANG = { nx: 3, ny: -43, na: 1.5, fx: -2, fy: -44, fa: 1.55, nh: 0, fh: 0, ff: 0 };

  /** The shoulder in the actions' own (authored) frame: used to blend hand paths in arcs. */
  function shoulder(p, far) {
    const s = Math.sin(p.lean), c = Math.cos(p.lean), u = 31 * p.sq, f = far ? -4.5 : -1.5;
    return [p.hx + s * u + c * f, p.hy - c * u + s * f];
  }
  /** Blend two poses: the hands travel in arcs around the shoulders, not in straight lines. */
  function mix(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const o = { face: b.face };
    for (const f of F) o[f] = ANG[f] ? angLerp(a[f], b[f], k) : a[f] + (b[f] - a[f]) * k;
    for (let far = 0; far < 2; far++) {
      const X = far ? 'fx' : 'nx', Y = far ? 'fy' : 'ny';
      const sa = shoulder(a, far), sb = shoulder(b, far), so = shoulder(o, far);
      const ra = Math.hypot(a[X] - sa[0], a[Y] - sa[1]), rb = Math.hypot(b[X] - sb[0], b[Y] - sb[1]);
      const an = angLerp(Math.atan2(a[Y] - sa[1], a[X] - sa[0]), Math.atan2(b[Y] - sb[1], b[X] - sb[0]), k), r = ra + (rb - ra) * k;
      o[X] = so[0] + Math.cos(an) * r; o[Y] = so[1] + Math.sin(an) * r;
    }
    return o;
  }
  /** The same pose seen from the other side (facing the other way, every point where it was in the world). */
  function mirror(p) {
    return Object.assign({}, p, { face: -p.face, hx: -p.hx, lean: -p.lean, nx: -p.nx, na: PI - p.na, fx: -p.fx, fa: PI - p.fa, nfx: -p.nfx, ffx: -p.ffx, nft: -p.nft, fft: -p.fft });
  }
  function ik(S, T, a, b, bend) {
    const dx = T[0] - S[0], dy = T[1] - S[1], d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.5, a + b - 0.05);
    const ang = Math.atan2(dy, dx), be = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)) * bend;
    return [[S[0] + Math.cos(ang + be) * a, S[1] + Math.sin(ang + be) * a], [S[0] + Math.cos(ang) * d, S[1] + Math.sin(ang) * d]];
  }
  /** Joints as drawn (heights remapped for his longer legs). */
  function solve(p) {
    const s = Math.sin(p.lean), c = Math.cos(p.lean), q = p.sq, hy = Ym(p.hy);
    const J = { s, c, hy };
    const sh = (far) => { const u = 31 * q, f = far ? -3 : -1; return [p.hx + s * u + c * f, hy - c * u + s * f]; };
    J.SN = sh(0); J.SF = sh(1);
    J.neck = [p.hx + s * 32.6 * q + c * 1.2, hy - c * 32.6 * q + s * 1.2];
    J.ha = p.lean * 0.6 + p.hd;
    J.head = [J.neck[0] + Math.sin(J.ha) * 8.4 + Math.cos(J.ha) * 1.4, J.neck[1] - Math.cos(J.ha) * 8.4 + Math.sin(J.ha) * 1.4];
    [J.EN, J.WN] = ik(J.SN, [p.nx, Ym(p.ny)], LIMB.up, LIMB.fore, 1);
    [J.EF, J.WF] = ik(J.SF, [p.fx, Ym(p.fy)], LIMB.up, LIMB.fore, 1);
    J.HN = [p.hx + c * 0.8, hy + s * 0.8]; J.HF = [p.hx - c * 2, hy - s * 2 - 0.4];
    [J.KN, J.AN] = ik(J.HN, [p.nfx, Ym(p.nfy)], LIMB.thigh, LIMB.shin, -1);
    [J.KF, J.AF] = ik(J.HF, [p.ffx, Ym(p.ffy)], LIMB.thigh, LIMB.shin, -1);
    J.T = (f, u) => [p.hx + c * f - s * u, hy + s * f + c * u]; // torso frame (forward, down) to local
    return J;
  }

  /* ---------- drawing the figure (local frame: feet centre at 0,0, facing +x) ---------- */
  let Lv = [0.6, -0.8], LN = LINE.D; // toward the lamp, in the figure's own frame
  function grad(c, cx, cy, r, col) {
    const g = c.createLinearGradient(cx + Lv[0] * r, cy + Lv[1] * r, cx - Lv[0] * r, cy - Lv[1] * r);
    g.addColorStop(0, col[0]); g.addColorStop(0.45, col[1]); g.addColorStop(1, col[2]);
    return g;
  }
  function capsule(c, x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1e-4, a = Math.atan2(dy, dx), th = Math.acos(clamp((r1 - r2) / d, -1, 1));
    c.moveTo(x1 + Math.cos(a + th) * r1, y1 + Math.sin(a + th) * r1);
    c.arc(x1, y1, r1, a + th, a + TAU - th);
    c.arc(x2, y2, r2, a - th, a + th);
    c.closePath();
  }
  /** Several capsules of one material: outlined only around their outside, shaded toward the lamp. */
  function limbs(c, segs, col, cx, cy, r) {
    c.beginPath();
    for (const s of segs) capsule(c, s[0][0], s[0][1], s[1], s[2][0], s[2][1], s[3]);
    c.lineWidth = 1.3; c.strokeStyle = LN; c.stroke();
    c.fillStyle = grad(c, cx, cy, r, col); c.fill();
  }
  function outlined(c, col, cx, cy, r, lw = 0.65) {
    c.fillStyle = typeof col === 'string' ? col : grad(c, cx, cy, r, col); c.fill();
    c.lineWidth = lw; c.strokeStyle = LN; c.stroke();
  }

  function drawLeg(c, H, K, A, tilt, far) {
    limbs(c, [[H, 4.5, K, 3.8], [K, 3.7, A, 2.9]], far ? pal.pantsF : pal.pants, (H[0] + A[0]) / 2, (H[1] + A[1]) / 2, 12);
    c.save(); c.translate(A[0], A[1]); c.rotate(tilt);
    c.beginPath();
    c.moveTo(-3.2, -3.4); c.lineTo(-3.7, 3.4); c.quadraticCurveTo(-3.7, 5, -2.3, 5); c.lineTo(7.6, 5);
    c.quadraticCurveTo(9.4, 5, 9, 2.6); c.quadraticCurveTo(8.4, 0.4, 5, -0.4); c.quadraticCurveTo(3, -0.8, 2.7, -3.4); c.closePath();
    outlined(c, far ? pal.bootF : pal.boot, 2.5, 0, 6);
    c.fillStyle = 'rgba(24,14,8,0.9)'; c.fillRect(-3.7, 3.9, 13, 1.1);
    c.restore();
  }

  function drawArm(c, S, El, Wr, roll, far) {
    const sh = far ? pal.shirtF : pal.shirt, sk = far ? pal.skinF : pal.skin;
    const t = lerp(0.84, 0.3, roll);
    const cuff = [lerp(El[0], Wr[0], t), lerp(El[1], Wr[1], t)];
    limbs(c, [[cuff, 2.6, Wr, 2.2]], sk, (cuff[0] + Wr[0]) / 2, (cuff[1] + Wr[1]) / 2, 5);
    limbs(c, [[S, 3.7, El, 3.1], [El, 3.1, cuff, 2.9]], sh, El[0], El[1], 10);
    const a = Math.atan2(Wr[1] - El[1], Wr[0] - El[0]), rr = lerp(3.1, 3.6, roll), wd = lerp(1, 1.9, roll);
    c.save(); c.translate(cuff[0], cuff[1]); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0, wd, rr, 0, 0, TAU);
    outlined(c, sh, 0, 0, 4, 0.55);
    c.restore();
  }

  function drawHand(c, Wr, a, far, open) {
    c.save(); c.translate(Wr[0], Wr[1]); c.rotate(a);
    const sk = far ? pal.skinF : pal.skin;
    c.beginPath();
    if (open > 0.5) { c.ellipse(2.4, 0, 3.6, 2.6, 0, 0, TAU); c.moveTo(1.4, -2.3); c.ellipse(0.8, -2.7, 1.7, 1, -0.7, 0, TAU); }
    else { c.ellipse(1.7, 0, 2.9, 2.5, 0, 0, TAU); c.moveTo(1.5, -2.1); c.ellipse(1, -2.4, 1.5, 1, -0.5, 0, TAU); }
    c.lineWidth = 1.2; c.strokeStyle = LN; c.stroke();
    c.fillStyle = grad(c, 1.5, 0, 3.5, sk); c.fill();
    c.restore();
  }

  /* tools, drawn in the frame of the hand that holds them (x along the handle) */
  const TOOL = {
    hammer(c) {
      c.beginPath(); c.moveTo(-3.6, -1.5); c.lineTo(19.5, -1.25); c.lineTo(19.5, 1.25); c.lineTo(-3.6, 1.6); c.quadraticCurveTo(-5.2, 0, -3.6, -1.5); c.closePath();
      outlined(c, pal.wood, 8, 0, 6, 0.7);
      c.beginPath(); c.moveTo(18.2, -2.4); c.lineTo(23.3, -2.4); c.lineTo(23.6, 5); c.lineTo(24.1, 5.4); c.lineTo(24.1, 7.2); c.lineTo(17.6, 7.2); c.lineTo(17.6, 5.4); c.lineTo(18.1, 5); c.closePath();
      c.moveTo(18.6, -2.4); c.quadraticCurveTo(17.4, -6.6, 13.6, -9.2); c.quadraticCurveTo(18.4, -7.8, 20.6, -4.6); c.lineTo(23.2, -2.4); c.closePath();
      outlined(c, pal.steel, 20, 0, 7, 0.7);
    },
    saw(c) {
      c.beginPath(); c.moveTo(3, -5.6); c.lineTo(35, -2.2); c.lineTo(35.6, 2.4); c.lineTo(3, 6.2); c.closePath();
      outlined(c, ['#c4cad2', '#868f9b', '#454b55'], 18, 0, 6, 0.6);
      c.strokeStyle = 'rgba(70,74,82,0.85)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(3.5, 6.1);
      for (let x = 4.5; x < 35; x += 1.25) c.lineTo(x, 6.2 - (x - 3) * 0.118 + ((x * 0.8) % 2 < 1 ? 1 : 0));
      c.stroke();
      c.beginPath(); c.moveTo(-6, -6.5); c.quadraticCurveTo(-10, 0, -6.2, 7.4); c.lineTo(5, 7.2); c.quadraticCurveTo(6.4, 0, 5, -6.2); c.closePath();
      c.moveTo(1.8, 0.4); c.ellipse(-1.4, 0.4, 3.2, 4.3, 0, 0, TAU);
      c.fillStyle = grad(c, 0, 0, 7, ['#d0835a', '#a2532f', '#5c2c16']); c.fill('evenodd'); c.lineWidth = 0.8; c.strokeStyle = LN; c.stroke();
    },
    plane(c) {
      c.beginPath(); c.moveTo(-8.5, 3.6); c.lineTo(14.6, 3.6); c.quadraticCurveTo(16, 3.8, 16, 5.6); c.lineTo(16, 8.6); c.lineTo(-9.4, 8.6); c.lineTo(-9.4, 5); c.closePath();
      outlined(c, pal.wood, 3, 5, 10, 0.75);
      c.fillStyle = 'rgba(40,26,16,0.8)'; c.fillRect(-9.4, 7.6, 25.4, 1);
      c.beginPath(); c.moveTo(3.4, 3.8); c.lineTo(5.6, -3.2); c.lineTo(8.2, -2.6); c.lineTo(7.2, 3.8); c.closePath(); outlined(c, pal.steel, 6, 0, 4, 0.6);
      c.beginPath(); c.moveTo(-6.4, 3.8); c.quadraticCurveTo(-7.6, -2.6, -3, -4.6); c.lineTo(-0.4, -4.2); c.quadraticCurveTo(-3.6, -1, -1.6, 3.8); c.closePath(); outlined(c, ['#c26a42', '#93492a', '#55260f'], -3, 0, 5, 0.7);
      c.beginPath(); c.ellipse(12, 1.3, 2.4, 2.6, 0, 0, TAU); outlined(c, ['#c26a42', '#93492a', '#55260f'], 12, 1, 3, 0.6);
    },
    tape(c) {
      c.beginPath(); c.roundRect(-2, -4.6, 9.4, 9.2, 2.6); outlined(c, pal.yellow, 2.5, 0, 6, 0.75);
      c.fillStyle = 'rgba(40,30,20,0.7)'; c.beginPath(); c.arc(2.6, 0, 1.6, 0, TAU); c.fill();
      c.fillRect(6.6, 2.6, 1.6, 2.2);
    },
    pencil(c) {
      c.beginPath(); c.rect(-4, -0.95, 9, 1.9); outlined(c, pal.yellow, 0, 0, 2, 0.5);
      c.beginPath(); c.moveTo(5, -0.95); c.lineTo(7.6, 0); c.lineTo(5, 0.95); c.closePath(); c.fillStyle = '#e8c49a'; c.fill();
      c.fillStyle = '#2a2420'; c.beginPath(); c.moveTo(6.8, -0.3); c.lineTo(7.7, 0); c.lineTo(6.8, 0.3); c.fill();
      c.fillStyle = '#e8908a'; c.fillRect(-5.6, -0.95, 1.2, 1.9); c.fillStyle = '#b8b8b0'; c.fillRect(-4.6, -0.95, 0.7, 1.9);
    },
    mug(c) {
      c.beginPath(); c.moveTo(2.2, -9); c.lineTo(10.8, -9); c.lineTo(10.4, 1.8); c.quadraticCurveTo(6.5, 3, 2.6, 1.8); c.closePath();
      outlined(c, pal.cream, 6.5, -3, 6, 0.75);
      c.fillStyle = rgb(hex('#b94534'), 0.85); c.fillRect(2.4, -5.6, 8.2, 1.8);
      c.beginPath(); c.ellipse(6.5, -9, 4.3, 1.2, 0, 0, TAU); c.fillStyle = '#4a2a18'; c.fill(); c.lineWidth = 0.6; c.strokeStyle = LN; c.stroke();
      c.beginPath(); c.arc(2.2, -3.6, 3, PI * 0.55, PI * 1.45); c.lineWidth = 1.6; c.strokeStyle = rgb(hex(RAW.cream[1])); c.stroke();
    },
    broom(c) {
      c.beginPath(); c.moveTo(-24, -1.1); c.lineTo(44, -1.1); c.lineTo(44, 1.1); c.lineTo(-24, 1.1); c.closePath(); outlined(c, pal.wood, 10, 0, 6, 0.6);
      c.beginPath(); c.moveTo(43, -2.6); c.lineTo(47.5, -3); c.lineTo(47.5, 3); c.lineTo(43, 2.6); c.closePath(); outlined(c, pal.red, 45, 0, 3, 0.6);
      c.beginPath(); c.moveTo(47.5, -3.2); c.lineTo(59, -7.5); c.quadraticCurveTo(60.5, 0, 59, 7.5); c.lineTo(47.5, 3.2); c.closePath(); outlined(c, ['#f0d483', '#cfa952', '#7d6127'], 53, 0, 7, 0.6);
      c.strokeStyle = 'rgba(110,80,30,0.55)'; c.lineWidth = 0.4; c.beginPath();
      for (let i = -3; i <= 3; i++) { c.moveTo(48, i * 0.9); c.lineTo(59.5, i * 2.3); }
      c.stroke();
    },
  };

  function drawHead(c, p, W, J) {
    const t = clamp(p.turn, 0, 1);
    c.save(); c.translate(J.head[0], J.head[1]); c.rotate(J.ha);
    // neck
    c.beginPath(); capsule(c, -0.6, 4.2, 2.4, -1.2, 8.6, 2.6); outlined(c, pal.skinF, 0, 6, 3, 0.5);
    // face and skull
    c.scale(1.08, 1.08);
    c.beginPath(); c.ellipse(0.3, 0, 6.1, 6.9, 0, 0, TAU); outlined(c, pal.skin, 0, 0, 7, 0.7);
    const nX = lerp(6.1, 0.3, t);
    if (t < 0.6) { c.beginPath(); c.ellipse(nX, 1.3, 1.5, 1.3, 0.3, 0, TAU); outlined(c, pal.skin, nX, 1, 2, 0.5); }
    // hair: short, tidy, a side parting
    c.beginPath();
    c.moveTo(lerp(5.2, 5.6, t), -2.6); c.quadraticCurveTo(lerp(5.4, 4.5, t), -7.2, lerp(0.6, 0.2, t), -7.6);
    c.quadraticCurveTo(-5.4, -7.6, -6.6, -2.4); c.quadraticCurveTo(-7, 1.6, -5.6, 4.4); c.lineTo(lerp(-3.4, -5, t), 4); c.quadraticCurveTo(lerp(-3.8, -5.6, t), 0.4, lerp(-1.2, -4.4, t), -1.6);
    if (t > 0.4) { c.lineTo(lerp(-1, 4.4, t), -1.6); c.quadraticCurveTo(lerp(-1, 5.6, t), 0.4, lerp(-1, 5, t), 4); c.lineTo(5.6, 4.4); c.quadraticCurveTo(6.6, 1, 5.6, -2.6); }
    c.quadraticCurveTo(lerp(1.4, 1, t), -3.2, lerp(3, 0.8, t), -4.2); c.quadraticCurveTo(lerp(4.2, 3, t), -2.6, lerp(5.2, 5.6, t), -2.6); c.closePath();
    outlined(c, pal.hair, -1, -4, 7, 0.6);
    c.strokeStyle = 'rgba(255,225,190,0.25)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-3.6, -5.4); c.quadraticCurveTo(-1, -6.8, 2.2, -6.4); c.stroke();
    // ear
    if (t < 0.85) { const ex = lerp(-1.8, -5.6, t); c.beginPath(); c.ellipse(ex, 0.8, 1.4, 2, 0, 0, TAU); outlined(c, pal.skin, ex, 0.8, 2, 0.5); }
    // face: eyes, brows, mouth
    const eo = clamp(p.eye * (W.blink > 0 ? 0 : 1), 0, 1.5);
    const eyes = t < 0.3 ? [[lerp(3.4, 2.6, t / 0.3), 1]] : [[lerp(-2.2, -2.2, t), 1], [lerp(1.5, 2.3, t), 1]];
    if (t < 0.3) eyes[0][0] = 3.4 - t * 2;
    c.fillStyle = '#24140c'; c.strokeStyle = '#24140c'; c.lineCap = 'round';
    for (const [ex] of eyes) {
      if (p.happy > 0.5 && eo > 0.15) { c.lineWidth = 0.6; c.beginPath(); c.arc(ex, 0, 0.9, PI * 1.15, PI * 1.85); c.stroke(); }
      else if (eo < 0.2) { c.lineWidth = 0.55; c.beginPath(); c.moveTo(ex - 0.8, -0.3); c.lineTo(ex + 0.8, -0.3); c.stroke(); }
      else { c.beginPath(); c.ellipse(ex, -0.4, eo > 1.1 ? 0.95 : 0.7, (eo > 1.1 ? 1.2 : 0.95) * Math.min(1, eo), 0, 0, TAU); c.fill(); }
      c.lineWidth = 0.6; c.beginPath(); c.moveTo(ex - 1.1, -2.2 - p.brow * 0.7); c.lineTo(ex + 1.1, -2.5 - p.brow * 0.9 + (p.brow < 0 ? 0.6 : 0)); c.stroke();
    }
    const mx = lerp(4.6, 0.3, t);
    if (p.mouth > 0.08) { c.beginPath(); c.ellipse(mx - 0.4, 3.6, 0.8 + p.mouth * 0.5, p.mouth * 1.5, 0, 0, TAU); c.fillStyle = '#5a2418'; c.fill(); }
    else { c.strokeStyle = 'rgba(110,48,34,0.85)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(mx - 1.3, 3.4); c.quadraticCurveTo(mx - 0.4, 3.8 + p.happy * 0.8, mx + 0.5, 3.3); c.stroke(); }
    c.fillStyle = 'rgba(232,110,96,0.22)'; c.beginPath(); c.ellipse(lerp(2.4, -3.2, t), 2, 1.5, 1, 0, 0, TAU); c.fill();
    c.lineCap = 'butt';
    // the pencil behind his ear
    if (W.tool.pencil === 'ear' && t < 0.7) { c.save(); c.translate(lerp(-1.4, -4.6, t), -1.6); c.rotate(2.15); c.scale(0.62, 0.62); TOOL.pencil(c); c.restore(); }
    c.restore();
  }

  function drawTorso(c, J, p, W) {
    c.save(); c.translate(p.hx, J.hy); c.rotate(p.lean); c.scale(1, p.sq);
    c.beginPath();
    c.moveTo(-5.6, 3); c.bezierCurveTo(-7.8, -6, -7.8, -18, -6.4, -25.5); c.bezierCurveTo(-5.6, -30.4, -2.6, -32.8, 1.2, -32.4);
    c.bezierCurveTo(5, -31.8, 7.4, -28.4, 7.8, -23.4); c.bezierCurveTo(8.4, -17.4, 7.2, -11, 6.6, -6); c.bezierCurveTo(6.4, -1, 6.9, 2, 5.8, 3.6); c.bezierCurveTo(2, 5.4, -3, 5.4, -5.6, 3); c.closePath();
    c.lineWidth = 1.3; c.strokeStyle = LN; c.stroke(); c.fillStyle = grad(c, 0, -15, 16, pal.shirt); c.fill();
    // collar
    c.fillStyle = rgb(hex(RAW.shirt[0])); c.beginPath(); c.moveTo(-1.6, -31.6); c.lineTo(3.4, -30.6); c.lineTo(1.8, -28.4); c.closePath(); c.fill();
    // leather apron: bib down the front, straps over the shoulders
    c.beginPath(); c.moveTo(1.4, -24.6); c.lineTo(7.7, -23.2); c.bezierCurveTo(8.5, -17.2, 7.4, -10.8, 6.9, -6); c.lineTo(7.2, 3.2); c.lineTo(0.2, 3.6); c.closePath();
    outlined(c, pal.apron, 4, -10, 12, 0.6);
    c.setLineDash([0.8, 0.8]); c.strokeStyle = 'rgba(255,220,170,0.35)'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(2.2, -23.6); c.lineTo(7, -22.4); c.stroke(); c.setLineDash([]);
    c.strokeStyle = rgb(scl(hex(RAW.apron[2]), 1.3)); c.lineWidth = 1.1; c.beginPath(); c.moveTo(1.8, -24.4); c.quadraticCurveTo(-1, -30, -4.6, -28.6); c.moveTo(0.4, 1.4); c.lineTo(-6.6, 0.8); c.stroke();
    c.restore();
  }

  function drawApron(c, J, p, W) {
    const WB = J.T(0.2, 2.6), WF = J.T(7.1, 3), K = J.KN;
    const hy = Math.max(K[1] + 5, WF[1] + 10), hx = Math.max(WF[0] + 0.6, K[0] + 4.4) + W.apronSw;
    const bx = lerp(WB[0], K[0], 0.1) - 1;
    c.beginPath(); c.moveTo(WB[0], WB[1]); c.lineTo(WF[0], WF[1]);
    c.quadraticCurveTo(Math.max(WF[0], K[0] + 4.8), (WF[1] + hy) / 2, hx, hy);
    c.quadraticCurveTo((hx + bx) / 2, hy + 1.2, bx, hy + 0.4); c.closePath();
    outlined(c, pal.apron, (WB[0] + hx) / 2, (WB[1] + hy) / 2, 12, 0.6);
    // pocket, with the tape measure in it
    const px0 = lerp(bx, hx, 0.4), px1 = lerp(bx, hx, 0.9), py0 = lerp(WF[1], hy, 0.32), py1 = lerp(WF[1], hy, 0.72);
    if (W.tool.tape === 'pocket') { c.beginPath(); c.roundRect(px1 - 4.2, py0 - 2.2, 3.4, 3, 1); outlined(c, pal.yellow, px1 - 3, py0 - 1, 2, 0.45); }
    if (W.tool.paper === 'pocket') { c.beginPath(); c.rect(px0 + 0.4, py0 - 3.4, 2.8, 4); outlined(c, pal.cream, px0 + 1.6, py0 - 1.4, 3, 0.4); }
    c.beginPath(); c.moveTo(px0, py0); c.lineTo(px1, py0 - 0.3); c.lineTo(px1 + 0.2, py1); c.lineTo(px0 + 0.1, py1 + 0.2); c.closePath();
    outlined(c, pal.apron, px0, py0, 6, 0.5);
    c.setLineDash([0.7, 0.7]); c.strokeStyle = 'rgba(255,220,170,0.35)'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(px0 + 0.6, py0 + 0.7); c.lineTo(px1 - 0.4, py0 + 0.4); c.stroke(); c.setLineDash([]);
  }

  function drawBow(c, J, W) {
    const B = J.T(-6.6, 0.6), S = W.bow;
    c.strokeStyle = rgb(scl(hex(RAW.apron[2]), 1.3)); c.lineWidth = 0.9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(B[0], B[1]); c.quadraticCurveTo(B[0] - 1.4 + S.x * 0.3, B[1] + 3.5, B[0] - 1.8 + S.x, B[1] + 7 + S.y);
    c.moveTo(B[0], B[1]); c.quadraticCurveTo(B[0] - 0.3 + S.x * 0.2, B[1] + 3.5, B[0] + 0.4 + S.x * 0.8, B[1] + 6.4 + S.y * 0.8); c.stroke();
    c.beginPath(); c.ellipse(B[0] - 1.6, B[1] - 1, 1.8, 1, -0.5, 0, TAU); c.moveTo(B[0] - 0.3, B[1] + 1.4); c.ellipse(B[0] - 1.5, B[1] + 1.3, 1.6, 1, 0.5, 0, TAU);
    c.lineWidth = 0.75; c.stroke(); c.lineCap = 'butt';
  }

  /** Things held in both hands, drawn between the figure and its near arm. */
  function drawShared(c, J, p, W) {
    const h = W.hold.n;
    if (h === 'broom') { c.save(); c.translate(J.WN[0], J.WN[1]); c.rotate(p.na); TOOL[h](c); c.restore(); }
    if (h === 'tape' && W.tapeOut > 0.3) { // the blade from the case to the far hand
      const a = J.WN, ex = [a[0] + Math.cos(p.na) * 7 - Math.sin(p.na) * 3.5, a[1] + Math.sin(p.na) * 7 + Math.cos(p.na) * 3.5];
      const b = [lerp(ex[0], J.WF[0] + 1, W.tapeOut), lerp(ex[1], J.WF[1] + 1, W.tapeOut)];
      c.strokeStyle = '#7a6018'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(ex[0], ex[1]); c.lineTo(b[0], b[1]); c.stroke();
      c.strokeStyle = '#f2d062'; c.lineWidth = 1.9; c.stroke();
      const L = Math.hypot(b[0] - ex[0], b[1] - ex[1]), ux = (b[0] - ex[0]) / (L || 1), uy = (b[1] - ex[1]) / (L || 1);
      c.strokeStyle = 'rgba(40,30,10,0.75)'; c.lineWidth = 0.35; c.beginPath();
      for (let d = 2; d < L; d += 2) { c.moveTo(ex[0] + ux * d, ex[1] + uy * d); c.lineTo(ex[0] + ux * d - uy * (d % 10 < 2 ? 1 : 0.5), ex[1] + uy * d + ux * (d % 10 < 2 ? 1 : 0.5)); }
      c.stroke();
    }
    if (h === 'paper') drawPaper(c, J, p, W);
    if (h === 'board' && W.board > 0) { // a board carried flat in both hands, along his way
      const m = [(J.WN[0] + J.WF[0]) / 2, Math.max(J.WN[1], J.WF[1]) + 1.2], L2 = W.board;
      c.save(); c.translate(m[0], m[1]);
      const g = c.createLinearGradient(0, -3, 0, 0); g.addColorStop(0, '#e2bd88'); g.addColorStop(1, '#b98a58');
      c.fillStyle = g; c.fillRect(-L2 * 0.35, -3, L2, 3); c.strokeStyle = LN; c.lineWidth = 0.5; c.strokeRect(-L2 * 0.35, -3, L2, 3);
      c.restore();
    }
    if (h === 'piece' && W.carry) { c.save(); c.translate((J.WN[0] + J.WF[0]) / 2, Math.max(J.WN[1], J.WF[1]) + 1.5); c.scale(p.face, 1); drawPiece(c, W.carry, 1, W.t, true); c.restore(); }
  }
  function drawPaper(c, J, p, W) {
    const a = J.WF, b = J.WN, cx = (a[0] + b[0]) / 2 + 1, cy = Math.min(a[1], b[1]) - 9;
    const hw = 9.5, hh = 14, tu = W.page;
    c.save(); c.translate(cx, cy); c.rotate(-0.06);
    const half = (dir, k) => { // one half of the open paper; k: 1 flat .. -1 turned over
      c.beginPath(); c.moveTo(0, -hh); c.lineTo(dir * hw * k, -hh + 1.5 * Math.abs(k)); c.lineTo(dir * hw * k, hh - 1); c.lineTo(0, hh); c.closePath();
      c.fillStyle = Math.abs(k) < 0.999 && k < 0 ? '#d8cfbc' : '#efe8d6'; c.fill(); c.lineWidth = 0.7; c.strokeStyle = LN; c.stroke();
      if (Math.abs(k) > 0.35) {
        c.fillStyle = 'rgba(70,70,70,0.42)';
        for (let i = 0; i < 9; i++) { const y = -hh + 4 + i * 2.6; if (dir > 0 && i < 3) continue; c.fillRect(dir > 0 ? 1.2 * k : dir * (hw - 1.2) * k, y, (hw - 2.4) * k * 0.92, 0.6); }
        if (dir > 0) { c.fillStyle = 'rgba(70,70,70,0.3)'; c.fillRect(1.4 * k, -hh + 3.5, (hw - 3) * k, 6); }
      }
    };
    half(-1, 1);
    half(1, 1);
    if (tu > 0) half(1, Math.cos(PI * tu)); // a page being turned
    c.strokeStyle = 'rgba(60,50,40,0.5)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(0, -hh); c.lineTo(0, hh); c.stroke();
    c.restore();
  }

  function toolIn(c, tool, Wr, a, W) {
    c.save(); c.translate(Wr[0], Wr[1]); c.rotate(a);
    if (tool === 'hammer' && W.grip) c.translate(-W.grip, 0);
    TOOL[tool](c); c.restore();
  }
  function drawActor(c, W) {
    const p = W.pose, J = W.J, tool = W.hold.n, farT = !!(tool && FARTOOL[tool]);
    const shared = tool === 'broom' || tool === 'paper' || tool === 'piece' || tool === 'board' || (tool === 'tape' && W.tapeOut > 0.3);
    const farLate = p.ff >= 0.5 || shared;
    // the far (right) arm behind the body, with what it holds
    if (p.ff < 0.5) {
      drawArm(c, J.SF, J.EF, J.WF, W.roll, true);
      if (farT) toolIn(c, tool, J.WF, p.fa, W);
      if (!farLate) drawHand(c, J.WF, p.fa, true, p.fh);
    }
    drawLeg(c, J.HF, J.KF, J.AF, p.fft, true);
    drawBow(c, J, W);
    drawTorso(c, J, p, W);
    drawLeg(c, J.HN, J.KN, J.AN, p.nft, false);
    drawApron(c, J, p, W);
    drawHead(c, p, W, J);
    if (p.ff >= 0.5) drawArm(c, J.SF, J.EF, J.WF, W.roll, true);
    drawShared(c, J, p, W);
    if (farLate) drawHand(c, J.WF, p.fa, true, p.fh);
    drawArm(c, J.SN, J.EN, J.WN, W.roll, false);
    if (tool && TOOL[tool] && !farT && tool !== 'broom') toolIn(c, tool, J.WN, p.na, W);
    drawHand(c, J.WN, p.na, false, p.nh);
  }

  /* ---------- the cat: sits up and watches while he works, curls up in its basket while he waits ---------- */
  const CATC = { fur: ['#f2a868', '#cf7f3e', '#7a4420'], cream: ['#fbe6cc', '#e8c9a2', '#a88a68'] };
  function drawCat(c, C, t, L) {
    const k = sm(C.curl), st = Math.sin(PI * C.curl) * (C.moving ? 1 : 0); // halfway it stands and turns
    const br = 1 + Math.sin(t * (k > 0.5 ? 1.6 : 2.4)) * (k > 0.5 ? 0.035 : 0.015);
    // tail
    const tw = Math.sin(t * 1.7 + C.ph) * (1 - k) * 0.5 + (k > 0.5 ? Math.sin(t * 0.7) * 0.08 : 0);
    c.lineCap = 'round';
    c.beginPath();
    if (k < 0.5) { c.moveTo(5, -1.2); c.bezierCurveTo(11, -1 + tw * 4, 12 + tw * 6, -8 + tw * 3, 9 + tw * 7, -12 + tw * 2); }
    else { c.moveTo(7, -2); c.bezierCurveTo(9, 2, 0, 3.4, -7.5 + tw * 2, 1.4); }
    c.lineWidth = 3.4; c.strokeStyle = LN; c.stroke(); c.lineWidth = 2.4; c.strokeStyle = CATC.fur[1]; c.stroke();
    // body: from sitting upright to a round loaf
    const bx = lerp(1.6, 0.5, k), by = lerp(-6.2, -4, k) - st * 3, rx = lerp(5.4, 9.4, k) * br, ry = lerp(6.8, 4.6, k) * br, rot = lerp(-0.35, 0, k);
    c.beginPath(); c.ellipse(bx, by, rx, ry, rot, 0, TAU);
    c.fillStyle = grad(c, bx, by, 8, CATC.fur); c.fill(); c.lineWidth = 0.7; c.strokeStyle = LN; c.stroke();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(120,60,24,0.45)'; c.lineWidth = 0.9;
    c.beginPath(); for (let i = 0; i < 4; i++) { const x = bx - 2 + i * 2.6; c.moveTo(x, by - ry); c.quadraticCurveTo(x + 1.6, by, x - 0.4, by + ry * 0.5); } c.stroke();
    if (k < 0.6) { c.fillStyle = rgb(hex(CATC.cream[1]), 0.9); c.beginPath(); c.ellipse(bx - rx * 0.62, by + 0.8, 2.4, 4.6, -0.2, 0, TAU); c.fill(); }
    c.restore();
    // front paws when sitting
    if (k < 0.6) { c.globalAlpha = 1 - k / 0.6; c.beginPath(); c.ellipse(-2.6, -0.8, 1.6, 1, 0, 0, TAU); c.ellipse(-0.6, -0.6, 1.6, 1, 0, 0, TAU); c.fillStyle = rgb(hex(CATC.cream[0])); c.fill(); c.lineWidth = 0.5; c.strokeStyle = LN; c.stroke(); c.globalAlpha = 1; }
    // head
    const hx = lerp(-2.4, -7, k) + (C.look || 0) * 0.6, hy = lerp(-14.6, -4.2, k) - st * 4 + (k < 0.5 ? Math.sin(t * 0.9) * 0.15 : 0);
    const hr = lerp(3.9, 3.5, k), tilt = lerp(C.look * 0.15, 0.35, k);
    c.save(); c.translate(hx, hy); c.rotate(tilt);
    const ear = (sx) => { c.beginPath(); c.moveTo(sx * 0.6, -hr * 0.55); c.lineTo(sx * 3, -hr - lerp(3.2, 1.6, k) + (C.twitch > 0 && sx > 0 ? 0.8 : 0)); c.lineTo(sx * 3.4, -hr * 0.2); c.closePath(); c.fillStyle = CATC.fur[1]; c.fill(); c.lineWidth = 0.6; c.strokeStyle = LN; c.stroke(); };
    ear(-1); ear(1);
    c.beginPath(); c.ellipse(0, 0, hr * 1.12, hr, 0, 0, TAU); c.fillStyle = grad(c, 0, 0, 4, CATC.fur); c.fill(); c.lineWidth = 0.65; c.strokeStyle = LN; c.stroke();
    c.fillStyle = rgb(hex(CATC.cream[0])); c.beginPath(); c.ellipse(0, 1.5, 2.2, 1.6, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1a10'; c.strokeStyle = '#2a1a10'; c.lineWidth = 0.5;
    const shut = k > 0.5 || C.blink > 0;
    for (const sx of [-1.4, 1.4]) { if (shut) { c.beginPath(); c.arc(sx, -0.3, 0.8, 0.2, PI - 0.2); c.stroke(); } else { c.beginPath(); c.ellipse(sx, -0.4, 0.55, 0.85, 0, 0, TAU); c.fill(); } }
    c.fillStyle = '#c9706a'; c.beginPath(); c.moveTo(-0.5, 0.9); c.lineTo(0.5, 0.9); c.lineTo(0, 1.5); c.fill();
    c.restore();
    c.lineCap = 'butt';
    void L;
  }

  /* ---------- the pieces he makes (piece frame: bottom centre at 0,0; depth goes up and right) ---------- */
  const DX = 0.5, DY = -0.36;
  const C = hex;
  const PINE = C('#dcb27a'), OAK = C('#b98650'), WAL = C('#87593a'), DARK = C('#3c281a'), CREAM = C('#ece0c4'), RED = C('#c24c3a'), BLUE = C('#4673a3'), GREEN = C('#6f8f5a'), STEEL = C('#8c9eac'), YEL = C('#e2b440');
  function pface(P, pts, col, f) {
    const c = P.c; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath();
    if (P.line) { c.stroke(); return; }
    c.fillStyle = rgb(scl(col, f * P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke();
  }
  function box(P, x, y, w, h, d, col, grain) {
    const dx = d * DX, dy = d * DY;
    pface(P, [x + w, y, x + w + dx, y + dy, x + w + dx, y - h + dy, x + w, y - h], col, 0.7);
    pface(P, [x, y - h, x + w, y - h, x + w + dx, y - h + dy, x + dx, y - h + dy], col, 1.2);
    pface(P, [x, y, x + w, y, x + w, y - h, x, y - h], col, 1);
    if (grain && !P.line) {
      const c = P.c; c.strokeStyle = 'rgba(80,45,20,0.22)'; c.lineWidth = 0.35; c.beginPath();
      if (w > h) for (let i = 1; i < 3; i++) { const yy = y - (h * i) / 3; c.moveTo(x + 0.6, yy); c.quadraticCurveTo(x + w * 0.5, yy + (i - 1.5) * 0.5, x + w - 0.6, yy); }
      else for (let i = 1; i < 3; i++) { const xx = x + (w * i) / 3; c.moveTo(xx, y - 0.6); c.lineTo(xx + (i - 1.5) * 0.3, y - h + 0.6); }
      c.stroke();
    }
  }
  function disc(P, x, y, r, col, f = 1) {
    const c = P.c; c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (P.line) { c.stroke(); return; }
    c.fillStyle = rgb(scl(col, f * P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke();
  }
  function ell(P, x, y, rx, ry, col, f = 1) {
    const c = P.c; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (P.line) { c.stroke(); return; }
    c.fillStyle = rgb(scl(col, f * P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke();
  }
  const PIECES = [
    { id: 'birdhouse', nail: [7.5, -10], parts: [
      (P) => box(P, -11.5, 0, 23, 2.4, 9, GREEN, 1),
      (P) => box(P, -8.5, -2.4, 17, 13.5, 7, CREAM, 1),
      (P) => pface(P, [-8.5, -15.9, 8.5, -15.9, 0, -23.6], CREAM, 1.05),
      (P) => { disc(P, 0, -9.6, 2.9, DARK); },
      (P) => pface(P, [0, -25.4, 11.2, -14.3, 14.7, -16.8, 3.5, -27.9], RED, 0.78),
      (P) => { pface(P, [0, -25.4, -11.2, -14.3, -7.7, -16.8, 3.5, -27.9], RED, 1.12); pface(P, [0, -25.4, -11.2, -14.3, -11.2, -13.1, 0, -24.2], RED, 0.82); pface(P, [0, -25.4, 11.2, -14.3, 11.2, -13.1, 0, -24.2], RED, 0.7); },
      (P) => { box(P, -0.7, -4.6, 1.4, 1.4, 1, WAL); disc(P, 0, -5.3, 0.9, WAL, 1.2); },
    ] },
    { id: 'chair', nail: [7, -11], parts: [
      (P) => { box(P, -5.6, -2.5, 2, 26, 2, OAK, 1); box(P, 7.6, -2.5, 2, 26, 2, OAK, 1); },
      (P) => { for (const x of [-1.4, 2.2, 5.6]) box(P, x, -12.8, 1.3, 11.4, 1, PINE); },
      (P) => box(P, -5.6, -24.2, 15.2, 3.4, 1.6, OAK, 1),
      (P) => box(P, -9, -10.4, 18.6, 2.4, 7, PINE, 1),
      (P) => { box(P, -9, 0, 2, 10.4, 2, OAK, 1); box(P, 7.6, 0, 2, 10.4, 2, OAK, 1); },
      (P) => box(P, -7, -3.6, 14.6, 1.2, 1.2, OAK),
      (P) => { const c = P.c; c.beginPath(); c.moveTo(-8.4, -12.6); c.quadraticCurveTo(0, -15.4, 9, -12.6); c.lineTo(12, -14.6); c.quadraticCurveTo(3, -17.4, -5.4, -14.8); c.closePath(); if (P.line) c.stroke(); else { c.fillStyle = rgb(scl(RED, 1.05 * P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke(); } },
    ] },
    { id: 'boat', nail: [-6, -11], parts: [
      (P) => { box(P, -8, 0, 3, 3.2, 4, WAL, 1); box(P, 5, 0, 3, 3.2, 4, WAL, 1); },
      (P) => { pface(P, [-12.5, -10.4, 12.5, -10.4, 9, -3.2, -8.5, -3.2], BLUE, 1); pface(P, [-12.5, -10.4, 12.5, -10.4, 15.3, -12.2, -9.7, -12.2], C('#c99b65'), 1.12); },
      (P) => pface(P, [-11.9, -8.6, 11.9, -8.6, 11.2, -7.1, -11.2, -7.1], CREAM, 1.05),
      (P) => { box(P, -6, -10.4, 8, 5, 4, CREAM); disc(P, -3.6, -12.8, 0.9, BLUE, 0.9); disc(P, -0.4, -12.8, 0.9, BLUE, 0.9); },
      (P) => box(P, 3.4, -10.8, 1.2, 15, 1, WAL),
      (P) => { const c = P.c; c.beginPath(); c.moveTo(4.9, -24.6); c.quadraticCurveTo(10.5, -18, 12.6, -13.6); c.lineTo(4.9, -12.6); c.closePath(); if (P.line) c.stroke(); else { c.fillStyle = rgb(scl(C('#f3ead8'), P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke(); } },
      (P) => pface(P, [4, -25.6, 4, -28, 8.2, -26.9], RED, 1.05),
    ] },
    { id: 'robot', nail: [6, -8], parts: [
      (P) => { box(P, -7, 0, 5, 2.2, 5, C('#5d6b78')); box(P, 2, 0, 5, 2.2, 5, C('#5d6b78')); },
      (P) => { box(P, -5.6, -2.2, 2.4, 4, 2.4, STEEL); box(P, 3.4, -2.2, 2.4, 4, 2.4, STEEL); },
      (P) => { box(P, -7.5, -6.2, 15, 10, 6, STEEL); box(P, -4.5, -8.4, 9, 5.2, 0, C('#a9b8c2')); disc(P, 2.2, -11.6, 1.5, YEL); },
      (P) => { box(P, -10.6, -8.2, 3.1, 7.4, 3, STEEL); box(P, 7.5, -8.2, 3.1, 7.4, 3, STEEL); disc(P, -9, -7.4, 1.6, C('#5d6b78')); disc(P, 9.1, -7.4, 1.6, C('#5d6b78')); },
      (P) => box(P, -1.4, -16.2, 2.8, 1.4, 2.8, C('#5d6b78')),
      (P) => { box(P, -6, -17.6, 12, 7.6, 5.5, STEEL); disc(P, -2.6, -21.6, 1.3, C('#86e0d4'), 1.1); disc(P, 2.6, -21.6, 1.3, C('#86e0d4'), 1.1); box(P, -2.6, -18.6, 5.2, 0.8, 0, C('#5d6b78')); },
      (P) => { box(P, 0.6, -25.2, 0.8, 3, 0.8, C('#5d6b78')); disc(P, 1.4, -27.6, 1.6, RED, 1.1); },
    ] },
    { id: 'horse', nail: [5, -13], parts: [
      (P) => { const c = P.c; for (const [o, f] of [[1, 0.7], [0, 1]]) { c.save(); c.translate(o * 2.6, o * -1.9); c.beginPath(); c.moveTo(-13.5, -3.6); c.quadraticCurveTo(0, 3.4, 13.5, -3.6); c.lineTo(13.5, -5.8); c.quadraticCurveTo(0, 1.2, -13.5, -5.8); c.closePath(); if (P.line) c.stroke(); else { c.fillStyle = rgb(scl(RED, f * P.lit)); c.fill(); c.strokeStyle = P.edge; c.stroke(); } c.restore(); } },
      (P) => { for (const [x, o] of [[-7.6, 1], [6.2, 1], [-8.4, 0], [7, 0]]) box(P, x + o * 2.2, -1.4 - o * 1.6, 1.7, 10.4, 1.4, PINE); },
      (P) => ell(P, -0.6, -14.2, 10, 4.3, C('#e6d2ab'), 1),
      (P) => pface(P, [-7.4, -16.4, -10.8, -24.8, -15.8, -24.2, -17, -21.6, -12.8, -20.6, -8.2, -12.2], C('#e6d2ab'), 1.04),
      (P) => { pface(P, [-11.6, -24.6, -10.6, -28, -9.6, -24.4], C('#e6d2ab'), 0.9); if (!P.line) { const c = P.c; c.fillStyle = '#2b1810'; c.beginPath(); c.arc(-12.6, -22.6, 0.7, 0, TAU); c.fill(); } },
      (P) => { const c = P.c; c.strokeStyle = P.line ? c.strokeStyle : rgb(scl(C('#6b4228'), P.lit)); c.lineWidth = 1.3; c.beginPath(); for (let i = 0; i < 5; i++) { c.moveTo(-9.8 + i * 0.9, -24 + i * 2); c.lineTo(-7.6 + i * 1, -24.4 + i * 2.2); } c.moveTo(9.2, -15); c.quadraticCurveTo(12.6, -14, 12.4, -8.6); c.moveTo(9.2, -14); c.quadraticCurveTo(13.6, -12, 13.8, -9.2); c.stroke(); c.lineWidth = 0.4; },
      (P) => pface(P, [-4.6, -18, 3.4, -18.4, 4.2, -14.6, -5, -14.2], RED, 1.08),
    ] },
    { id: 'truck', nail: [-5, -10], parts: [
      (P) => { disc(P, -5, -5.1, 3.3, DARK, 0.7); disc(P, 10.5, -5.1, 3.3, DARK, 0.7); },
      (P) => box(P, -12.5, -3.2, 25, 2.2, 7, WAL, 1),
      (P) => { box(P, -12.5, -5.4, 14, 5.4, 7, BLUE, 1); pface(P, [-11.6, -10.4, 0.6, -10.4, 3.2, -12.2, -9, -12.2], BLUE, 0.55); },
      (P) => { box(P, 1.8, -5.4, 10.6, 9.6, 7, RED, 1); pface(P, [6.4, -14.2, 11.4, -14.2, 11.4, -10.6, 6.4, -10.6], C('#bfe0ee'), 0.95); },
      (P) => { disc(P, -7.6, -3.3, 3.3, DARK); disc(P, -7.6, -3.3, 1.2, CREAM, 0.9); disc(P, 8, -3.3, 3.3, DARK); disc(P, 8, -3.3, 1.2, CREAM, 0.9); },
      (P) => { disc(P, 12.2, -7.8, 0.95, YEL, 1.2); box(P, 12.4, -5.4, 0.8, 1.2, 7, C('#5d6b78')); },
    ] },
    { id: 'plane', nail: [-2, -9], parts: [
      (P) => { const c = P.c; if (!P.line) { c.strokeStyle = rgb(scl(DARK, P.lit)); } c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3, -2); c.lineTo(-1.6, -7); c.moveTo(4, -2); c.lineTo(2.6, -7); c.stroke(); c.lineWidth = 0.4; disc(P, -3, -2, 1.9, DARK); disc(P, 4, -2, 1.9, DARK); },
      (P) => box(P, -6, -7.2, 12, 1.4, 14, RED),
      (P) => pface(P, [-13, -12.2, -9, -9.4, 9, -7.8, 12.6, -8.8, 12.6, -12.6, 9, -14, -9, -13.6], YEL, 1),
      (P) => pface(P, [-13, -12.2, -9.6, -13.6, -13.6, -20.2, -14.8, -19.4], RED, 1),
      (P) => pface(P, [-1, -13.8, 3.6, -14, 4.6, -16.6, 0.4, -16.8], C('#4a6a82'), 1),
      (P) => { disc(P, 13.3, -10.6, 1.3, DARK); ell(P, 13.6, -10.6, 0.9, 6.2, WAL, 0.9); },
      (P) => { const c = P.c; if (!P.line) c.strokeStyle = rgb(scl(DARK, P.lit)); c.lineWidth = 0.7; c.beginPath(); c.moveTo(-3, -13.8); c.lineTo(-2.4, -18.6); c.moveTo(4, -14); c.lineTo(4.6, -18.6); c.stroke(); c.lineWidth = 0.4; box(P, -6, -18.6, 12, 1.3, 14, RED); },
    ] },
  ];
  const PIECE_BY = Object.fromEntries(PIECES.map((d) => [d.id, d]));
  /** Draw a piece: proj { id, n (parts in place), at: [times each part arrived] }; t: world time for the settle bounce. */
  function drawPiece(c, proj, lit, t, held) {
    const d = PIECE_BY[proj.id];
    const P = { c, lit, edge: 'rgba(40,22,12,0.55)', line: false };
    c.lineWidth = 0.4; c.lineJoin = 'round';
    for (let i = 0; i < d.parts.length && i < proj.n; i++) {
      const age = held ? 9 : t - (proj.at[i] || -9);
      if (age < 0.4) { const k = age / 0.4; c.save(); c.translate(0, -(1 - E.out2(k)) * 6 + Math.sin(k * PI) * 0.6); c.globalAlpha *= clamp(k * 3, 0, 1); d.parts[i](P); c.restore(); } else d.parts[i](P);
    }
    if (proj.shine > 0) { // the polish: a band of light sweeping across
      const k = proj.shine;
      c.save(); c.globalCompositeOperation = 'source-atop';
      const x = lerp(-22, 22, k), g = c.createLinearGradient(x - 6, 0, x + 6, -8);
      g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(0.5, `rgba(255,250,235,${0.55 * Math.sin(k * PI)})`); g.addColorStop(1, 'rgba(255,250,235,0)');
      c.fillStyle = g; c.fillRect(-20, -34, 40, 38);
      c.restore();
    }
  }
  /** The piece as a finished sprite (for the shelf), drawn once. */
  function pieceSprite(id, k, dpr) {
    const s = k * dpr, cv = mk(44 * s, 40 * s), c = cv.getContext('2d');
    c.setTransform(s, 0, 0, s, 22 * s, 36 * s);
    drawPiece(c, { id, n: 99, at: [] }, 0.92, 99, true);
    return cv;
  }
  /** The plan of a piece in white lines (the blueprint). */
  function blueprint(id, k, dpr, L) {
    const s = k * dpr, cv = mk(PRINT.w * s, PRINT.h * s), c = cv.getContext('2d');
    c.scale(s, s);
    c.fillStyle = L ? '#3d6ea4' : '#2f5f93'; c.fillRect(0, 0, PRINT.w, PRINT.h);
    c.strokeStyle = 'rgba(220,235,255,0.16)'; c.lineWidth = 0.25; c.beginPath();
    for (let x = 2; x < PRINT.w; x += 2.5) { c.moveTo(x, 0); c.lineTo(x, PRINT.h); }
    for (let y = 2; y < PRINT.h; y += 2.5) { c.moveTo(0, y); c.lineTo(PRINT.w, y); }
    c.stroke();
    c.save(); c.translate(PRINT.w * 0.46, PRINT.h - 3.2); c.scale(0.68, 0.68);
    c.strokeStyle = 'rgba(235,245,255,0.85)'; c.lineWidth = 0.55;
    const P = { c, lit: 1, edge: '', line: true };
    for (const part of PIECE_BY[id].parts) part(P);
    c.restore();
    c.strokeStyle = 'rgba(235,245,255,0.6)'; c.lineWidth = 0.4; c.strokeRect(1.2, 1.2, PRINT.w - 2.4, PRINT.h - 2.4);
    c.fillStyle = 'rgba(235,245,255,0.55)'; c.fillRect(PRINT.w - 10, PRINT.h - 5, 8, 0.6); c.fillRect(PRINT.w - 10, PRINT.h - 3.6, 6, 0.6);
    return cv;
  }

  /* ---------- actions: eased keyframes, or poses computed from time ---------- */
  /** The same pose with the two hands' parts exchanged (an action authored for the near hand, done with the far one). */
  const swapNF = (p) => Object.assign({}, p, { nx: p.fx, ny: p.fy, na: p.fa, nh: p.fh, fx: p.nx, fy: p.ny, fa: p.na, fh: p.nh });
  /** Keyframes [time, fields, ease] built on `from`; ev: [[time, fn(W)]]; swap: authored for the near hand, done by the far one. */
  function K(name, from, list, o = {}) {
    const keys = [], cv = o.swap ? swapNF : (q) => q;
    let prev = cv(from);
    for (const [t, f, e] of list) { prev = Object.assign({}, prev, f); keys.push({ t, p: prev, e: E[e || 'io'] }); }
    const dur = o.dur || keys[keys.length - 1].t;
    const at = (tau) => {
      if (tau <= keys[0].t) return keys[0].p;
      for (let i = 1; i < keys.length; i++) if (tau < keys[i].t) { const a = keys[i - 1], b = keys[i]; return mix(a.p, b.p, b.e((tau - a.t) / (b.t - a.t))); }
      return keys[keys.length - 1].p;
    };
    return Object.assign({ name, dur, soft: true, blend: 0.25, end: cv(keys[keys.length - 1].p), pose: (tau) => cv(at(tau)) }, o);
  }
  const lx = (wx, p) => (wx - p.x) * p.face; // a world x in the figure's frame

  function walk(from, toX, o = {}) {
    const face = from.face, d = toX - from.x;
    if (Math.abs(d) < 1.5) return null;
    const fwd = d * face > 0, n = Math.max(2, Math.ceil(Math.abs(d) / (fwd ? 14 : 9)));
    const T = (fwd ? 0.36 : 0.42) * (o.slow || 1), dur = n * T;
    const end = Object.assign({}, from, { x: toX, nfx: 4, ffx: -7, nfy: -5, ffy: -5, nft: 0, fft: 0, hy: -41.5, hx: -2, lean: 0.06, sx: 1 });
    if (!o.keepHands) Object.assign(end, HANG);
    const wn0 = from.x + from.nfx * face, wf0 = from.x + from.ffx * face, wn1 = toX + 4 * face, wf1 = toX - 7 * face;
    const nFirst = (wn0 - wf0) * Math.sign(d) < 0, cA = Math.ceil(n / 2), cB = Math.floor(n / 2);
    const foot = (first, w0, w1, cnt, st, su) => {
      let done = 0; for (let i = 0; i < st; i++) if ((i % 2 === 0) === first) done++;
      const a = w0 + (w1 - w0) * (done / cnt);
      if ((st % 2 === 0) !== first) return [a, 0, 0];
      const b = w0 + (w1 - w0) * ((done + 1) / cnt), e = E.io(su);
      return [lerp(a, b, e), Math.sin(PI * su) * (fwd ? 4.6 : 3), -Math.sin(TAU * su) * (fwd ? 0.32 : -0.2)];
    };
    return { name: 'walk', dur, soft: false, blend: 0.16, end,
      pose(tau) {
        const u = clamp(tau / dur, 0, 1), st = Math.min(n - 1, Math.floor(tau / T)), su = clamp((tau - st * T) / T, 0, 1);
        const x = from.x + d * (u - Math.sin(TAU * u) / TAU);
        const [xn, ln, tn] = foot(nFirst, wn0, wn1, nFirst ? cA : cB, st, su), [xf, lf, tf] = foot(!nFirst, wf0, wf1, nFirst ? cB : cA, st, su);
        const p = Object.assign({}, from, { x, sx: 1, nfx: (xn - x) * face, nfy: -5 - ln, nft: tn, ffx: (xf - x) * face, ffy: -5 - lf, fft: tf });
        p.hy = -41.5 - Math.sin(PI * su) * 1.4 + 0.4; p.hx = -2;
        p.lean = fwd ? 0.1 : -0.03; p.hd = from.hd * 0.3 + 0.04;
        if (!o.keepHands) {
          const s = Math.sin((PI * tau) / T) * (nFirst ? 1 : -1);
          Object.assign(p, { nx: 3 - 6 * s, ny: -43.5 + Math.abs(s) * 1.2, na: 1.5 - s * 0.3, fx: -2 + 5 * s, fy: -44 + Math.abs(s), fa: 1.55 + s * 0.25, nh: 0, fh: 0, ff: 0 });
        } else { p.ny = from.ny - Math.sin(PI * su) * 1; p.fy = from.fy - Math.sin(PI * su) * 1; }
        return p;
      } };
  }
  function turn(from, o = {}) {
    const half = 0.2;
    const mid = Object.assign({}, from, { sx: 0.45, turn: 0.95, lean: 0.02, hd: 0.04 });
    if (!o.keepHands) Object.assign(mid, { nx: 2, ny: -44, fx: -1, fy: -44, na: 1.57, fa: 1.57, nh: 0, fh: 0 });
    else { mid.nx = 9; mid.fx = 13; }
    const midM = mirror(mid);
    const end = Object.assign(mirror(from), { sx: 1, turn: 0, lean: 0.06, hd: 0.06, hx: -2, nfx: 4, ffx: -7, nft: 0, fft: 0, nfy: -5, ffy: -5 });
    if (!o.keepHands) Object.assign(end, HANG); else Object.assign(end, { nx: from.nx, ny: from.ny, fx: from.fx, fy: from.fy, na: from.na, fa: from.fa });
    return { name: 'turn', dur: half * 2, soft: false, blend: 0.1, end,
      pose(tau) {
        if (tau < half) { const p = mix(from, mid, E.in2(tau / half)); p.nfy = -5 - Math.sin((PI * tau) / half) * 2; return p; }
        const p = mix(midM, end, E.out2((tau - half) / half)); p.ffy = -5 - Math.sin((PI * (tau - half)) / half) * 2; return p;
      } };
  }
  /** Get from wherever he is to standing at x, facing `face`. */
  function goTo(W, x, face, o = {}, from) {
    const out = [];
    let p = from || tail(W);
    const push = (a) => { if (a) { out.push(a); p = a.end; } };
    if (W.sitting && !from) push(standUp(W, p));
    const d = x - p.x;
    if (Math.abs(d) > 1.5) {
      const fwd = d * p.face > 0;
      if (!fwd && Math.abs(d) > 22) { push(turn(p, o)); }
      push(walk(p, x, o));
    }
    if (p.face !== face) push(turn(p, o));
    return out;
  }
  function tail(W) { return W.q.length ? W.q[W.q.length - 1].end : W.act ? W.act.end : W.pose; }

  /* ----- sitting ----- */
  function sitDown(W, from) {
    const sL = lx(STOOL.x, from);
    return K('sit', from, [
      [0, {}],
      [0.4, { hd: 0.18, turn: 0.35, lean: 0.12, hy: -40.4, nx: 4, ny: -46, fx: -4, fy: -46 }, 'io'],
      [0.85, { hx: sL * 0.55, hy: -31, lean: 0.42, hd: 0.1, turn: 0.1, nx: 15, ny: -50, fx: 10, fy: -50, nfx: 3, ffx: -5 }, 'io'],
      [1.12, { hx: sL, hy: STOOL.seat - 3.6, lean: 0.16, sq: 0.95, nx: 9, ny: -32, fx: 4, fy: -32, nfx: 2, ffx: -6, na: 0.3, fa: 0.3 }, 'in2'],
      [1.45, { sq: 1, lean: 0.1, hd: 0.08 }, 'out2'],
    ], { soft: false, blend: 0.2, begin: (w) => { w.sitting = true; } });
  }
  function standUp(W, from) {
    const end = Object.assign({}, from, BASE, { x: from.x, face: from.face, nx: 3, ny: -43, fx: -2, fy: -44 });
    return K('stand', from, [
      [0, {}],
      [0.35, { lean: 0.5, hd: 0.05, hx: from.hx + 4, hy: from.hy + 1, nx: 12, ny: -30, fx: 7, fy: -30, eye: 1 }, 'io'],
      [0.8, { hx: -3, hy: -40.6, lean: 0.14, nx: 6, ny: -44, fx: 1, fy: -45 }, 'out2'],
      [1.05, { hx: -2, hy: -41.5, lean: 0.06, hd: 0.06, nx: 3, ny: -43, fx: -2, fy: -44, nfx: 4, ffx: -7 }, 'io'],
    ], { soft: false, blend: 0.22, end, after: (w) => { w.sitting = false; } });
  }

  /* ----- tools in and out of hand ----- */
  /* where things are put down, as points on his plane: the hammer and saw hang on the pegboard, the plane and the mug stand on the bench */
  const onPeg = (x, y) => P3(x, y, ROOM.z1 - 0.6);
  const PLANE_AT = () => P3(-11, TOP - 8.6, 21), MUG_AT = () => P3(-1, TOP - 1.8, 16);
  const REST = {
    hammer: (p) => { const q = onPeg(PEG.hammer[0], PEG.hammer[1]); return [lx(q[0], p), Yinv(q[1]), -1.62]; },
    saw: (p) => [lx(SAW_HOOK[0], p), SAW_HOOK[1] + 1, 1.62],
    plane: (p) => { const q = PLANE_AT(); return [lx(q[0], p), Yinv(q[1]), 0.02]; },
    tape: (p) => [lx(AX - 15, p), -36, 1.0],
    pencil: (p) => [9, -94, -2.2],
    mug: (p) => { const q = MUG_AT(); return [lx(q[0], p), Yinv(q[1]), 0]; },
  };
  const FARTOOL = { hammer: 1, saw: 1, plane: 1 };
  const HOME = { hammer: 'peg', saw: 'hook', plane: 'bench', tape: 'pocket', pencil: 'ear', mug: 'bench', broom: 'wall', paper: 'pocket' };
  function take(W, tool) { W.tool[tool] = 'n'; W.hold.n = tool; }
  function stow(W, tool) { W.tool[tool] = HOME[tool]; if (W.hold.n === tool) W.hold.n = null; }
  /** Put away what is in the near hand (at the bench). */
  function putAway(W, from) {
    const tool = W.hold.n;
    if (!tool || !REST[tool]) return null;
    const [rx, ry, ra] = REST[tool](from);
    const lean = tool === 'plane' ? 0.32 : tool === 'saw' ? 0.18 : 0.08;
    const sw = !!FARTOOL[tool], f0 = sw ? swapNF(from) : from, belt = tool === 'hammer', up = HOME[tool] === 'peg';
    return K('stow', from, [
      [0, {}],
      [0.42, { nx: rx, ny: ry, na: ra, lean: up ? 0.1 : lean, hd: up ? -0.3 : 0.3, nh: 0 }, 'io'],
      [0.62, { nx: rx, ny: ry + 1, na: ra }, 'io'],
      [0.95, Object.assign({}, HANG, { fx: f0.fx, fy: f0.fy, fa: f0.fa, lean: 0.06, hd: 0.1 }), 'io'],
    ], { swap: sw, ev: [[0.3, (w) => { if (belt) w.gripTo = 13; }], [0.55, (w) => stow(w, tool)]] });
  }
  function fetchTool(W, from, tool) {
    const [rx, ry, ra] = REST[tool](from);
    const lean = tool === 'plane' ? 0.32 : tool === 'saw' ? 0.18 : 0.08;
    const belt = tool === 'hammer', up = HOME[tool] === 'peg';
    return K('fetch', from, [
      [0, {}],
      [0.4, { nx: rx, ny: ry, na: ra, lean: up ? 0.1 : lean, hd: up ? -0.3 : 0.32, nh: 0 }, 'io'],
      [0.56, { nx: rx, ny: ry + 0.6, na: ra }, 'io'],
      [0.85, { nx: 8, ny: -52, na: tool === 'saw' ? 0.9 : tool === 'plane' ? 0.1 : -0.5, lean: 0.1, hd: 0.18 }, 'out2'],
    ], { swap: !!FARTOOL[tool], ev: [[0.5, (w) => { if (belt) { w.grip = 13; w.gripTo = 0; } take(w, tool); }]] });
  }
  /** Make sure the near hand holds `tool` (or is empty for null): at the bench. */
  function ensure(W, out, tool) {
    let p = out.length ? out[out.length - 1].end : tail(W);
    const cur = W.hold.n;
    if (cur === tool) return p;
    if (cur) { const a = putAway(W, p); if (a) { out.push(a); p = a.end; } }
    if (tool) { const a = fetchTool(W, p, tool); out.push(a); p = a.end; }
    return p;
  }

  /* ----- the work ----- */
  function hammerTask(W, from) {
    const pr = W.proj, d = PIECE_BY[pr.id];
    const N = [PIECE_X + d.nail[0], BENCH.top + d.nail[1]];
    const nl = lx(N[0], from);
    const hit = (a) => { const fx = 20.8 * Math.cos(a) - 7.2 * Math.sin(a), fy = 20.8 * Math.sin(a) + 7.2 * Math.cos(a); return [nl - fx, N[1] - fy]; };
    const hold = { fx: nl - 6.5, fy: N[1] - 1.5, fa: 0.9, fh: 0 };
    const off = { fx: lx(PIECE_X + 12.5, from), fy: BENCH.top - 3.5, fa: 0.5 };
    const at = hit(0.14);
    const keys = [[0, {}], [0.4, Object.assign({ lean: 0.14, hd: 0.36, nx: at[0], ny: at[1] - 3, na: 0.05, brow: -0.25 }, hold), 'io']];
    const evs = [];
    let t = 0.4;
    const taps = 2 + ((Math.random() * 2) | 0), hard = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < taps + hard; i++) {
      const soft = i < taps, big = i === taps + hard - 1 && Math.random() < 0.6;
      const up = soft ? 0.22 : big ? 0.38 : 0.28 + rnd(-0.03, 0.04), top = soft ? -0.75 : big ? -2.25 : -1.95 + rnd(-0.15, 0.12);
      const ta = soft ? 0.14 : 0.13 + rnd(-0.02, 0.03), hl = soft ? 0.02 : big ? 0.12 : 0.06;
      const raise = soft ? [at[0] - 4, at[1] - 12] : [at[0] - (big ? 15 : 12), at[1] - (big ? 33 : 28)];
      const k0 = t;
      keys.push([t += up, Object.assign({ nx: raise[0], ny: raise[1], na: top, lean: soft ? 0.12 : big ? 0.02 : 0.06, hd: 0.3, sq: soft ? 1 : 1.008 }, soft ? {} : i === taps ? off : {}), 'out']);
      if (hl) keys.push([t += hl, { na: top - 0.08, ny: raise[1] - 1 }, 'sm']);
      keys.push([t += ta, { nx: at[0], ny: at[1], na: 0.14, lean: big ? 0.2 : 0.16, hd: 0.38, sq: big ? 0.975 : 0.99 }, 'in']);
      evs.push([t, ((s, b) => (w) => strike(w, N, s, b))(soft, big)]);
      keys.push([t += 0.09, { nx: at[0] - 1, ny: at[1] - (soft ? 2 : 4.5), na: soft ? 0.02 : -0.22, sq: 1 }, 'out']);
      keys.push([t += soft ? 0.08 : 0.12, { nx: at[0], ny: at[1] - 2, na: 0.08 }, 'io']);
      void k0;
    }
    // look at the joint, give it a push
    keys.push([t += 0.45, { lean: 0.3, hd: 0.5, nx: at[0] - 4, ny: at[1] + 2, na: 0.5, fx: off.fx - 1, fy: off.fy - 1, brow: 0.1 }, 'io']);
    keys.push([t += 0.25, { fx: off.fx - 3, fy: off.fy - 1.5 }, 'io']);
    keys.push([t += 0.25, { fx: off.fx - 1, fy: off.fy - 1, hd: 0.42 }, 'io']);
    keys.push([t += 0.4, { lean: 0.1, hd: 0.2, brow: 0, nx: 9, ny: -54, na: -0.4, fx: -1, fy: -45, fa: 1.5 }, 'io']);
    return K('hammer', from, keys, { ev: evs, swap: true });
  }
  function strike(W, N, soft, big) {
    addProgress(W, soft ? 0.006 : big ? 0.03 : 0.02);
    W.lamp.v += (soft ? 0.002 : big ? 0.012 : 0.007) * (Math.random() < 0.5 ? -1 : 1);
    W.shake = soft ? 0.3 : big ? 1.2 : 0.7;
    W.snd.push({ k: 'hammer', x: N[0], g: soft ? 0.45 : big ? 1 : 0.8 });
    const n = soft ? 2 : big ? 7 : 4;
    for (let i = 0; i < n; i++) addP(W, { k: 'puff', x: N[0] + rnd(-2, 2), y: N[1] + rnd(-1, 1), vx: rnd(-14, 14), vy: rnd(-12, -3), drag: 0.9, life: rnd(0.4, 0.8), r: rnd(1.2, 2.6) });
    if (!soft && Math.random() < 0.6) addP(W, { k: 'chip', x: N[0], y: N[1] - 1, vx: rnd(-30, 30), vy: rnd(-55, -30), g: 260, life: 3, rot: rnd(0, 6), vr: rnd(-14, 14), land: 1 });
  }

  function sawTask(W, from) {
    const p0 = Object.assign({}, from, { x: SAWX });
    const cutX = 3, CP = [cutX, BENCH.top - 4];
    const keys = [[0, {}]];
    const evs = [];
    let t = 0;
    // step back, slide the plank out over the end of the bench
    keys.push([t += 0.45, { x: SAWX, nfx: 4, ffx: -7, lean: 0.1, hd: 0.3, fx: lx(-4, p0), fy: BENCH.top - 4.6, fa: 0.4, nx: 8, ny: -56, na: 0.62 }, 'io']);
    keys.push([t += 0.45, { fx: lx(4, p0), fy: BENCH.top - 4.6, lean: 0.14 }, 'io']);
    evs.push([0.45, (w) => { w.slide = { from: w.plank.r, to: cutX + 4.5, t0: w.t, d: 0.45 }; }]);
    // the off hand holds the plank down
    keys.push([t += 0.3, { fx: lx(-9, p0), fy: BENCH.top - 4.2, fa: 0.3, hd: 0.42, lean: 0.2, brow: -0.2 }, 'io']);
    const a = 0.64, ca = Math.cos(a), sa = Math.sin(a);
    const handFor = (s, depth) => { // blade point s (from the grip) meets the kerf at depth 0..1
      const bx = s, by = 6.2 - (s - 3) * 0.118, wx = bx * ca - by * sa, wy = bx * sa + by * ca;
      return [lx(CP[0], p0) - wx, CP[1] + depth * 4 - wy];
    };
    const n = 7 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const dp = i / n, h0 = handFor(26, dp), h1 = handFor(12, dp + 0.5 / n);
      keys.push([t += 0.26, { nx: h0[0], ny: h0[1], na: a, lean: 0.17, sq: 1 }, 'io']);
      keys.push([t += 0.32, { nx: h1[0], ny: h1[1], na: a + 0.03, lean: 0.23, sq: 0.995 }, 'io']);
      evs.push([t - 0.31, (w) => { w.cut = (i + 1) / n; w.snd.push({ k: 'saw', x: cutX }); addProgress(w, 0.012); for (let j = 0; j < 4; j++) addP(w, { k: 'dust', x: cutX + rnd(-1, 1), y: BENCH.top, vx: rnd(-6, 6), vy: rnd(0, 12), g: 90, life: 4, land: 1 }); }]);
    }
    // the end drops off
    evs.push([t + 0.05, (w) => { const r = w.plank.r; w.plank.len -= r - cutX; w.plank.r = cutX; w.cut = 0; addP(w, { k: 'off', x: (r + cutX) / 2, y: BENCH.top - 2, vx: rnd(4, 10), vy: -4, g: 300, life: 9, rot: 0, vr: rnd(3, 7), land: 1, w: r - cutX }); }]);
    keys.push([t += 0.5, { nx: 10, ny: -58, na: 0.4, lean: 0.12, hd: 0.5, brow: 0.2 }, 'io']);
    // slide the plank back and step in
    keys.push([t += 0.35, { fx: lx(cutX - 3, p0), fy: BENCH.top - 4.4, fa: 0.3, hd: 0.3 }, 'io']);
    evs.push([t, (w) => { w.slide = { from: w.plank.r, to: -1, t0: w.t, d: 0.4 }; }]);
    keys.push([t += 0.4, { fx: lx(-5, p0), fy: BENCH.top - 4.4 }, 'io']);
    keys.push([t += 0.45, Object.assign({ x: AX, lean: 0.06, hd: 0.15, brow: 0, nx: 7, ny: -52, na: 0.9 }, { fx: -2, fy: -44, fa: 1.55 }), 'io']);
    return K('saw', from, keys, { ev: evs, swap: true });
  }

  function planeTask(W, from) {
    const top = BENCH.top - 4 - 8.6; // the grip, with the sole on the plank
    const keys = [[0, {}], [0.45, { lean: 0.22, hd: 0.36, nx: lx(2, from), ny: top - 1.5, na: -0.06, fx: lx(-10, from), fy: top - 2.5, fa: 0.1, fh: 0 }, 'io']];
    const evs = [];
    let t = 0.45;
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      keys.push([t += 0.2, { nx: lx(1, from), ny: top, na: 0, fx: lx(-11, from), fy: top - 1.2, lean: 0.26, hx: -1, brow: -0.2 }, 'io']);
      keys.push([t += 0.62, { nx: lx(-16, from), ny: top, na: 0.01, fx: lx(-28, from), fy: top - 1.2, lean: 0.42, hx: 2.2, hy: -40.8, hd: 0.4 }, 'io']);
      evs.push([t - 0.5, (w) => w.snd.push({ k: 'plane', x: -6 })]);
      evs.push([t - 0.05, (w) => { addProgress(w, 0.014); addP(w, { k: 'shave', x: -16 + 4, y: BENCH.top - 9, vx: rnd(-14, -4), vy: rnd(-38, -20), g: 120, drag: 0.985, life: 6, rot: rnd(0, 6), vr: rnd(-6, 6), land: 1, s: rnd(0.8, 1.2) }); }]);
      keys.push([t += 0.5, { nx: lx(1, from), ny: top - 2.2, na: -0.08, fx: lx(-11, from), fy: top - 3, lean: 0.2, hx: -2, hy: -41.5, hd: 0.36 }, 'io']);
    }
    // blow the dust off and feel the surface
    keys.push([t += 0.45, { lean: 0.42, hd: 0.55, mouth: 0.4, nx: lx(-2, from), ny: top - 5, fx: lx(-12, from), fy: BENCH.top - 6, fa: 0.2, fh: 1, brow: 0.3 }, 'io']);
    evs.push([t, (w) => { for (let j = 0; j < 6; j++) addP(w, { k: 'puff', x: rnd(-14, -2), y: BENCH.top - 5, vx: rnd(-24, -6), vy: rnd(-10, 2), drag: 0.92, life: rnd(0.6, 1.1), r: rnd(1.4, 2.8) }); }]);
    keys.push([t += 0.4, { mouth: 0, fx: lx(-24, from), fy: BENCH.top - 5.5 }, 'io']);
    keys.push([t += 0.45, { fx: lx(-12, from), fy: BENCH.top - 5.5, brow: 0.4, happy: 0.6 }, 'io']);
    keys.push([t += 0.45, { lean: 0.1, hd: 0.15, happy: 0, brow: 0, fx: -2, fy: -44, fa: 1.55, fh: 0, nx: 9, ny: -54, na: 0.05 }, 'io']);
    return K('plane', from, keys, { ev: evs, swap: true });
  }

  function measureTask(W, from) {
    const keys = [[0, {}]];
    const evs = [];
    let t = 0;
    // the tape from the apron pocket
    keys.push([t += 0.4, { nx: 9, ny: -33, na: 1.2, hd: 0.3, lean: 0.08 }, 'io']);
    evs.push([0.4, (w) => take(w, 'tape')]);
    keys.push([t += 0.45, { nx: lx(1, from), ny: BENCH.top - 9.5, na: 0, lean: 0.2, hd: 0.4, fx: lx(-1, from), fy: BENCH.top - 8, fa: 0.4 }, 'io']);
    keys.push([t += 0.65, { fx: lx(-17, from), fy: BENCH.top - 6, fa: 0.3, lean: 0.32, hd: 0.46, hx: 0.5 }, 'io']);
    evs.push([0.85, (w) => { w.tapeTo = 1; }]);
    keys.push([t += 0.6, { hd: 0.5, brow: 0.35 }, 'io']);
    keys.push([t += 0.3, { hd: 0.44 }, 'io']);
    keys.push([t += 0.3, { hd: 0.52, brow: 0 }, 'io']);
    evs.push([t, (w) => { w.tapeTo = 0; addProgress(w, 0.012); w.snd.push({ k: 'zip', x: 0 }); }]);
    keys.push([t += 0.35, { fx: lx(-1, from), fy: BENCH.top - 8, lean: 0.18, hx: -2 }, 'out']);
    keys.push([t += 0.45, { nx: 9, ny: -33, na: 1.2, fx: -2, fy: -44, fa: 1.55, lean: 0.08, hd: 0.25 }, 'io']);
    evs.push([t, (w) => stow(w, 'tape')]);
    // the pencil from behind his ear, a mark, and back it goes
    keys.push([t += 0.45, { nx: 2, ny: -95, na: -2.4, hd: 0.12, turn: 0.15 }, 'io']);
    evs.push([t, (w) => take(w, 'pencil')]);
    const mk0 = lx(-9, from);
    keys.push([t += 0.45, { nx: mk0 - 6, ny: BENCH.top - 9, na: 0.95, lean: 0.24, hd: 0.45, turn: 0 }, 'io']);
    for (let i = 0; i < 2; i++) {
      keys.push([t += 0.16, { nx: mk0 - 5.4, ny: BENCH.top - 8, na: 1 }, 'io']);
      keys.push([t += 0.16, { nx: mk0 - 6.2, ny: BENCH.top - 9.6, na: 0.95 }, 'io']);
    }
    evs.push([t, (w) => { w.marks.push(-9 + rnd(-1, 1)); if (w.marks.length > 4) w.marks.shift(); addProgress(w, 0.008); }]);
    keys.push([t += 0.5, { nx: 2, ny: -95, na: -2.4, hd: 0.1, lean: 0.06, turn: 0.15 }, 'io']);
    evs.push([t, (w) => stow(w, 'pencil')]);
    keys.push([t += 0.4, Object.assign({}, HANG, { hd: 0.08, turn: 0 }), 'io']);
    return K('measure', from, keys, { ev: evs });
  }

  function blueprintTask(W, from, fresh) {
    const keys = [[0, {}]];
    const evs = [];
    let t = 0;
    keys.push([t += 0.6, { hd: -0.42, lean: -0.04, turn: 0.05, nx: 13, ny: -81, na: -1.4, nh: 0 }, 'io']);
    if (fresh) evs.push([0.5, (w) => { w.flip = 0.001; }]);
    keys.push([t += 0.5, { nx: 14, ny: -82, brow: 0.3 }, 'io']);
    keys.push([t += 0.3, { hd: -0.36, nx: 14.5, ny: -80.5 }, 'io']);
    keys.push([t += 0.3, { hd: -0.44, brow: -0.2 }, 'io']);
    keys.push([t += 0.5, { hd: -0.4 }, 'io']);
    // push the spectacles up
    keys.push([t += 0.35, { nx: 14, ny: -96, na: -1.75, nh: 0 }, 'io']);
    keys.push([t += 0.2, { ny: -97.5 }, 'io']);
    keys.push([t += 0.3, { nx: 13, ny: -82, na: -1.4, brow: 0.4 }, 'io']);
    keys.push([t += 0.3, { hd: -0.34 }, 'io']);
    keys.push([t += 0.25, { hd: -0.44 }, 'io']);
    keys.push([t += 0.25, { hd: -0.36 }, 'io']);
    evs.push([t, (w) => addProgress(w, 0.01)]);
    keys.push([t += 0.55, Object.assign({}, HANG, { hd: 0.1, lean: 0.06, brow: 0, turn: 0 }), 'io']);
    return K('blueprint', from, keys, { ev: evs });
  }

  function browTask(W, from) {
    return K('brow', from, [
      [0, {}],
      [0.5, { nx: 17, ny: -95, na: -2.9, nh: 0, hd: -0.05, lean: 0.03, eye: 0.6 }, 'io'],
      [0.95, { nx: -6, ny: -103, na: -2.2, hd: 0.02, eye: 0.3 }, 'io'],
      [1.25, { nx: 4, ny: -74, na: 1.2, eye: 1, mouth: 0.35, brow: 0.3 }, 'io'],
      [1.4, { nx: 6, ny: -70, na: 1.5 }, 'io'],
      [1.55, { nx: 4, ny: -72, na: 1.0 }, 'io'],
      [1.9, Object.assign({}, HANG, { mouth: 0, brow: 0, hd: 0.06 }), 'io'],
    ], { ev: [[1.2, (w) => { addP(w, { k: 'breath', x: w.pose.x + w.pose.face * 14, y: -86, vx: w.pose.face * 10, vy: -4, drag: 0.95, life: 0.9 }); for (let i = 0; i < 2; i++) addP(w, { k: 'drop', x: w.pose.x + w.pose.face * rnd(-6, 2), y: -100, vx: rnd(-14, 14), vy: rnd(-24, -12), g: 200, life: 0.8 }); }]] });
  }
  function coffeeTask(W, from) {
    const m = REST.mug(from);
    return K('coffee', from, [
      [0, {}],
      [0.5, { nx: m[0], ny: m[1], na: 0, lean: 0.16, hd: 0.28 }, 'io'],
      [0.62, { ny: m[1] - 0.6 }, 'io'],
      [1.15, { nx: 9, ny: -82, na: -0.35, lean: 0.02, hd: -0.05 }, 'io'],
      [1.5, { nx: 8, ny: -84.5, na: -0.95, hd: -0.22, eye: 0, mouth: 0 }, 'io'],
      [2.2, { na: -1.05, hd: -0.26 }, 'sm'],
      [2.55, { nx: 9, ny: -76, na: -0.2, hd: 0.02, eye: 1, happy: 1, brow: 0.4 }, 'io'],
      [3.1, { happy: 1 }, 'sm'],
      [3.6, { nx: m[0], ny: m[1] - 0.6, na: 0, lean: 0.16, hd: 0.26, happy: 0, brow: 0 }, 'io'],
      [3.72, { ny: m[1] }, 'io'],
      [4.15, Object.assign({}, HANG, { lean: 0.06, hd: 0.06 }), 'io'],
    ], { ev: [[0.58, (w) => take(w, 'mug')], [2.5, (w) => addP(w, { k: 'breath', x: w.pose.x + w.pose.face * 15, y: -84, vx: w.pose.face * 6, vy: -6, drag: 0.95, life: 1 })], [3.68, (w) => stow(w, 'mug')]] });
  }
  function sleeveTask(W, from) {
    const keys = [[0, {}], [0.45, { nx: 10, ny: -58, na: 0.2, fx: 12, fy: -60, fa: 0.4, ff: 1, hd: 0.4, lean: 0.08 }, 'io']];
    let t = 0.45;
    for (let i = 0; i < 3; i++) {
      keys.push([t += 0.22, { fx: 9 + i * -1.6, fy: -62 - i * 1.6 }, 'io']);
      keys.push([t += 0.22, { fx: 11 + i * -1.6, fy: -60 - i * 1.6 }, 'io']);
    }
    keys.push([t += 0.35, { nx: 14, ny: -60, fx: 6, fy: -58, na: 0.6, fa: 0.1, ff: 1 }, 'io']);
    for (let i = 0; i < 2; i++) { keys.push([t += 0.22, { nx: 11 - i * 1.5, ny: -62 - i * 1.4 }, 'io']); keys.push([t += 0.22, { nx: 13 - i * 1.5, ny: -60 - i * 1.4 }, 'io']); }
    keys.push([t += 0.3, { nx: 8, ny: -64, fx: 4, fy: -64, ff: 1, hd: 0.15, happy: 0.7, brow: 0.3 }, 'io']);
    keys.push([t += 0.45, Object.assign({}, HANG, { happy: 0, brow: 0, hd: 0.06 }), 'io']);
    return K('sleeves', from, keys, { begin: (w) => { w.rollTo = 1; } });
  }
  function backTask(W, from) {
    return K('back', from, [
      [0, {}],
      [0.55, { nx: -9, ny: -45, na: 0.9, fx: -12, fy: -46, fa: 1.2, lean: 0.04 }, 'io'],
      [1.2, { lean: -0.2, hd: -0.25, eye: 0, mouth: 0.3, hx: 1 }, 'io'],
      [1.9, { lean: -0.22, hd: -0.3 }, 'sm'],
      [2.4, { lean: 0.05, hd: 0.05, eye: 1, mouth: 0, hx: -2 }, 'io'],
      [2.9, Object.assign({}, HANG), 'io'],
    ]);
  }

  /* ----- finishing ----- */
  function finalTask(W, from) {
    const keys = [[0, {}], [0.4, { lean: 0.28, hd: 0.45, nx: lx(PIECE_X + 10, from), ny: BENCH.top - 10, na: 0.4, nh: 1, fx: lx(PIECE_X + 12, from), fy: BENCH.top - 3, fa: 0.6 }, 'io']];
    const evs = [];
    let t = 0.4;
    const left = Math.max(0, PIECE_BY[W.proj.id].parts.length - W.proj.n);
    for (let i = 0; i < left; i++) {
      keys.push([t += 0.2, { nx: lx(PIECE_X + 8 - i, from), ny: BENCH.top - 16, na: 0.6, nh: 0 }, 'out']);
      keys.push([t += 0.12, { nx: lx(PIECE_X + 9 - i, from), ny: BENCH.top - 10, na: 0.3 }, 'in']);
      evs.push([t, (w) => { revealNext(w); w.snd.push({ k: 'hammer', x: PIECE_X, g: 0.4 }); }]);
    }
    // a rub with the cloth: the polish comes up
    keys.push([t += 0.3, { nx: lx(PIECE_X + 8, from), ny: BENCH.top - 14, na: 0.3, nh: 1, lean: 0.34 }, 'io']);
    evs.push([t, (w) => { w.proj.shine = 0.0001; }]);
    for (let i = 0; i < 3; i++) { keys.push([t += 0.22, { nx: lx(PIECE_X - 6, from), ny: BENCH.top - 18 }, 'io']); keys.push([t += 0.22, { nx: lx(PIECE_X + 8, from), ny: BENCH.top - 14 }, 'io']); }
    evs.push([t, (w) => { w.proj.done = 1; sparkle(w, PIECE_X, BENCH.top - 16, 7); }]);
    keys.push([t += 0.5, { lean: 0.06, hd: 0.3, nh: 0, nx: 3, ny: -43, na: 1.5, fx: -2, fy: -44, fa: 1.55, happy: 0.8 }, 'io']);
    return K('final', from, keys, { ev: evs, soft: false, keep: 1 });
  }
  function stretchTask(W, from) {
    return K('stretch', from, [
      [0, {}],
      [0.45, { hy: -39.2, lean: 0.14, hd: 0.15, nx: 6, ny: -52, fx: 3, fy: -53, nh: 0, fh: 0, happy: 0 }, 'io'],
      [1.1, { hy: -45.5, nfy: -8.5, ffy: -8.5, nft: 0.5, fft: 0.5, lean: -0.13, hd: -0.3, nx: 1, ny: -118, fx: -1, fy: -118, na: -1.6, fa: -1.6, eye: 0, mouth: 0.75, brow: 0.5 }, 'out'],
      [1.8, { hy: -46, lean: -0.15, hd: -0.34, mouth: 0.85 }, 'sm'],
      [2.15, { hy: -41.5, nfy: -5, ffy: -5, nft: 0, fft: 0, lean: 0.04, hd: 0.1, nx: 8, ny: -47, fx: -7, fy: -48, na: 1.3, fa: 1.8, eye: 1, mouth: 0, brow: 0 }, 'in2'],
      [2.35, { nx: 4, ny: -44, fx: -3, fy: -45, sq: 0.985 }, 'out2'],
      [2.6, { sq: 1.012, hy: -42.5 }, 'io'],
      [2.85, { sq: 1, hy: -41.5 }, 'io'],
    ], { soft: false });
  }
  function proudTask(W, from) {
    return K('proud', from, [
      [0, {}],
      [0.5, { nx: 7, ny: -47, na: 2.3, fx: 4, fy: -47, fa: 2.4, nh: 0, fh: 0, hd: 0.34, lean: 0.02 }, 'io'],
      [1.0, { hd: 0.4, brow: 0.3, happy: 1 }, 'io'],
      [1.25, { hd: 0.28 }, 'io'],
      [1.5, { hd: 0.4 }, 'io'],
      [2.1, { turn: 0.85, hd: -0.04, lean: -0.04, happy: 1, brow: 0.6, hy: -42 }, 'io'],
      [3.1, { turn: 0.82, hd: -0.06 }, 'sm'],
      [3.5, { turn: 0, hd: 0.1, brow: 0, happy: 0.4, hy: -41.5 }, 'io'],
    ], { soft: false });
  }
  /** Lift the finished piece off the bench and put it on the shelf (or in the crate when the shelf is full). */
  function shelveSeq(W) {
    const out = [];
    let p = tail(W);
    const push = (a) => { if (a) { out.push(a); p = a.end; } };
    if (W.sitting) push(standUp(W, p));
    if (W.hold.n !== 'piece') {
      if (Math.abs(p.x - AX) > 1.5 || p.face !== -1) for (const a of goTo(W, AX, -1, {}, p)) push(a);
      if (W.hold.n) push(putAway(W, p));
      const r = lx(PIECE_X + 11, p), l = lx(PIECE_X - 11, p);
      push(K('lift', p, [
        [0, {}],
        [0.5, { lean: 0.62, hd: 0.5, hx: 0, nx: r, ny: BENCH.top - 6, na: 1.9, fx: l, fy: BENCH.top - 6, fa: 1.2, nh: 0, fh: 0, happy: 0.5 }, 'io'],
        [0.65, { ny: BENCH.top - 5.5, fy: BENCH.top - 5.5 }, 'io'],
        [1.15, { lean: 0.12, hd: 0.3, hx: -2, nx: 13, ny: -58, na: 1.6, fx: 23, fy: -58, fa: 1.4 }, 'io'],
      ], { soft: false, ev: [[0.62, (w) => { w.carry = w.proj; w.proj = null; w.hold.n = 'piece'; w.marks = []; }]] }));
    }
    const slot = W.shelf.length < SLOTS.length ? SLOTS[W.shelf.length] : null;
    const tx = slot ? slot[0] - (slot[1] ? 9 : 15) : CRATE.x + 22;
    for (const a of goTo(W, tx, slot ? 1 : -1, { keepHands: true }, p)) push(a);
    const sy = slot ? SHELF.ys[slot[1]] : -10;
    const reach = slot ? lx(slot[0], p) : lx(CRATE.x, p);
    const hi = slot && slot[1] === 1;
    push(K('place', p, [
      [0, {}],
      [0.55, hi ? { nx: reach - 5, ny: sy + 1, fx: reach + 5, fy: sy + 1, na: -1.4, fa: -1.4, hy: -44.5, nfy: -8, ffy: -8, nft: 0.45, fft: 0.45, lean: -0.05, hd: -0.35 }
        : slot ? { nx: reach - 5, ny: sy + 1, fx: reach + 5, fy: sy + 1, na: -0.6, fa: -0.6, lean: 0.04, hd: -0.1 }
          : { nx: reach - 5, ny: sy, fx: reach + 5, fy: sy, na: 1.5, fa: 1.5, lean: 0.7, hy: -33, hx: -5, hd: 0.5 }, 'io'],
      [0.75, { ny: (slot ? sy + 1 : sy) + 0.6, fy: (slot ? sy + 1 : sy) + 0.6 }, 'io'],
      [1.15, Object.assign({}, HANG, { hy: -41.5, nfy: -5, ffy: -5, nft: 0, fft: 0, lean: 0.04, hd: hi ? -0.3 : slot ? -0.12 : 0.3, hx: -2 }), 'io'],
      [1.4, { happy: 1, brow: 0.4 }, 'io'],
      [2.1, { nx: 6, ny: -47, na: 2.3, fx: 3, fy: -47, fa: 2.4, happy: 1 }, 'io'],
      [2.5, { happy: 0.3, brow: 0, hd: 0.06 }, 'io'],
    ], { soft: false, ev: [[0.72, (w) => shelvePiece(w, slot)]] }));
    for (const a of goTo(W, AX, -1, {}, p)) push(a);
    for (const a of out) a.keep = 1;
    return out;
  }
  function shelvePiece(W, slot) {
    if (!W.carry) return;
    const item = { id: W.carry.id, at: W.t };
    if (slot) W.shelf.push(item); else W.crate.push(item);
    W.carry = null; W.hold.n = null;
    W.snd.push({ k: 'place', x: slot ? slot[0] : CRATE.x });
    const gx = slot ? slot[0] : CRATE.x, gy = slot ? Ym(SHELF.ys[slot[1]]) - 12 : -16;
    W.glow = { x: gx, y: gy, t: W.t }; W.flare = 0.35; // a little celebration of light
    for (let i = 0; i < 9; i++) addP(W, { k: 'spark', rc: 1, x: gx + rnd(-12, 12), y: gy + rnd(-12, 8), vx: 0, vy: rnd(-8, -3), life: rnd(0.8, 1.5), d: rnd(0, 0.6), r2: rnd(1.4, 2.6) });
  }

  /* ----- startled, asked, waiting ----- */
  function startleTask(W, from) {
    const S = W.sitting, up = Object.assign({}, from, { lean: from.lean - 0.12 }), sn = shoulder(up, 0), sf = shoulder(up, 1);
    const hop = S ? {} : { nfy: -8, ffy: -7.5, nft: 0.25, fft: 0.25 }, land = S ? {} : { nfy: from.nfy, ffy: from.ffy, nft: from.nft, fft: from.fft };
    return K('startle', from, [
      [0, {}],
      [0.06, { sq: 0.96, hy: from.hy + 1.2, eye: 1.2 }, 'out2'],
      [0.16, Object.assign({ hy: from.hy - (S ? 2.5 : 4.5), sq: 1.05, eye: 1.45, brow: 1, mouth: 0.6, hd: from.hd - 0.16, lean: from.lean - 0.12, nx: sn[0] + 13, ny: sn[1] - 12, na: -0.7, fx: sf[0] + 7, fy: sf[1] - 15, fa: -1.1, nh: 1, fh: 1, turn: 0.45 }, hop), 'out'],
      [0.3, Object.assign({ hy: from.hy - 0.5, sq: 0.97 }, land), 'in2'],
      [0.38, { sq: 1.01, hy: from.hy - 1 }, 'out2'],
      [0.62, { nx: sn[0] + 12, ny: sn[1] - 11, fx: sf[0] + 6, fy: sf[1] - 14, sq: 1 }, 'sm'],
      [0.86, { nx: sn[0] + 13, ny: sn[1] - 12, fx: sf[0] + 7, fy: sf[1] - 15, eye: 1.35, mouth: 0.45 }, 'sm'],
      [1.3, { hy: from.hy, mouth: 0, eye: 1, brow: 0.6, sq: 0.985, hd: from.hd + 0.1, lean: from.lean + 0.04, turn: 0.2, nx: from.nx, ny: from.ny, na: from.na, fx: from.fx, fy: from.fy, fa: from.fa, nh: 0, fh: 0 }, 'io'],
      [1.6, { sq: 1, brow: 0.3 }, 'io'],
    ], { soft: false, keep: 1, blend: 0.05, begin: (w) => {
      w.bang = 1; w.calmUntil = w.t + 6; w.snd.push({ k: 'startle', x: w.pose.x });
      const tl = w.hold.n;
      if (tl && DROPS[tl]) { // out of his hand it goes
        const p = w.pose, J = w.J, h = FARTOOL[tl] ? J.WF : J.WN, a = FARTOOL[tl] ? p.fa : p.na;
        w.drop = { tool: tl, x: p.x + h[0] * p.face, y: h[1], vx: p.face * rnd(8, 22), vy: rnd(-30, -10), rot: p.face < 0 ? PI - a : a, vr: rnd(-9, 9), face: p.face, rest: 0, bounced: 0 };
        w.tool[tl] = 'floor'; w.hold.n = null;
      }
    } });
  }
  const DROPS = { hammer: 1, saw: 1, plane: 1, tape: 1, pencil: 1 };
  function shrugTask(W, from) {
    return K('shrug', from, [
      [0, {}],
      [0.45, { nx: 14, ny: -56, na: 0.2, fx: 9, fy: -57, fa: 0.3, nh: 1, fh: 1, sq: 1.03, hd: 0.14, turn: 0.45, brow: 0.7 }, 'io'],
      [1.05, { sq: 1.025, hd: 0.18 }, 'sm'],
      [1.5, Object.assign({}, HANG, { sq: 1, hd: 0.06, turn: 0, brow: 0 }), 'io'],
    ], { keep: 1 });
  }
  /** The hand up beside his head, wherever he is (standing or on the stool). */
  function handUp(from, dx = 0) { const s = shoulder(Object.assign({}, from, { lean: 0.02 }), 0); return { nx: s[0] + 6 + dx, ny: s[1] - 32 }; }
  function askTask(W, from) {
    const S = W.sitting, up = handUp(from), s0 = shoulder(from, 0);
    const keys = [[0, {}],
      [0.25, { turn: 0.55, hd: 0.02, eye: 1.15, brow: 0.5 }, 'io'],
      [0.45, { nx: s0[0] + 8, ny: s0[1] + 22, na: 0.6, turn: 0.82, sq: 0.99, lean: S ? 0.06 : 0.04 }, 'io'],
      [0.75, Object.assign({ na: -1.45, nh: 1, sq: 1.01, eye: 1, hd: -0.06, lean: 0.02 }, up), 'back'],
    ];
    let t = 0.75;
    for (let i = 0; i < 2; i++) { keys.push([t += 0.2, { na: -1.12, nx: up.nx + 2.5 }, 'io']); keys.push([t += 0.2, { na: -1.78, nx: up.nx - 2.5 }, 'io']); }
    keys.push([t += 0.2, { na: -1.45, nx: up.nx }, 'io']);
    return K('ask', from, keys, { begin: (w) => { w.bubbleTo = 1; } });
  }
  function askHold(W, from) {
    const S = W.sitting, up = handUp(from), s0 = shoulder(from, 0);
    return K('askHold', from, [
      [0, {}],
      [1.6, { hd: -0.02, nx: up.nx + 0.6, turn: 0.8 }, 'sm'],
      [3.2, { hd: -0.08, nx: up.nx - 0.6, turn: 0.84 }, 'sm'],
      [3.8, { nx: s0[0] + 9, ny: s0[1] - 8, na: -0.9, nh: 0, turn: 0.75, brow: 0.2 }, 'io'],
      [S ? 4.6 : 4.2, S ? { ny: s0[1] - 10 } : { nfy: -6.4, nft: -0.25 }, 'io'],
      [S ? 5.2 : 4.45, S ? { ny: s0[1] - 8 } : { nfy: -5, nft: 0 }, 'io'],
      [S ? 5.6 : 4.7, S ? {} : { nfy: -6.4, nft: -0.25 }, 'io'],
      [S ? 5.8 : 4.95, S ? {} : { nfy: -5, nft: 0 }, 'io'],
      [6.3, Object.assign({ na: -1.45, nh: 1, turn: 0.84, brow: 0.5 }, up), 'back'],
    ]);
  }

  function idleTask(W, from) {
    const v = pick(['look', 'tap', 'scratch']);
    if (v === 'look') return K('idle', from, [[0, {}], [0.8, { turn: 0.5, hd: -0.05 }, 'io'], [1.8, { turn: 0.55, hd: -0.1 }, 'sm'], [2.6, { turn: 0, hd: 0.1 }, 'io'], [3.4, { hd: 0.06 }, 'sm']]);
    if (v === 'scratch') return K('idle', from, [[0, {}], [0.5, { nx: 1, ny: -104, na: -2.2, hd: 0.1, turn: 0.2 }, 'io'], [0.7, { nx: 3, ny: -106 }, 'io'], [0.9, { nx: 1, ny: -104 }, 'io'], [1.1, { nx: 3, ny: -106 }, 'io'], [1.6, Object.assign({}, HANG, { turn: 0 }), 'io'], [2.4, {}, 'sm']]);
    const keys = [[0, {}], [0.5, { nx: lx(-2, from), ny: BENCH.top - 4, na: 0.2, lean: 0.12, hd: 0.25 }, 'io']];
    let t = 0.5;
    for (let i = 0; i < 6; i++) { keys.push([t += 0.12, { ny: BENCH.top - 7 }, 'out2']); keys.push([t += 0.12, { ny: BENCH.top - 4 }, 'in2']); }
    keys.push([t += 0.6, Object.assign({}, HANG, { lean: 0.06, hd: 0.06 }), 'io']);
    return K('idle', from, keys);
  }

  function nodCycle(W, from) {
    const deep = W.dozeN > 2 && Math.random() < 0.4, wake = !deep && Math.random() < 0.18;
    const base = { lean: 0.2, nx: lx(STOOL.x, from) + 13, ny: -40, na: 0.4, fx: lx(STOOL.x, from) + 16, fy: -41, fa: 3.3, ff: 1, nh: 0, fh: 0 };
    if (wake) return K('wake', from, [[0, base], [0.35, { hd: 0.1, eye: 0.8, lean: 0.14 }, 'out'], [1.1, { turn: 0.6, hd: 0.05 }, 'io'], [1.9, { turn: 0.1, hd: 0.12, mouth: 0.25 }, 'io'], [2.2, { mouth: 0 }, 'io'], [3.4, { eye: 0.25, hd: 0.3, lean: 0.2 }, 'io']], { begin: (w) => { w.dozeN = 0; } });
    const d = deep ? rnd(7, 10) : rnd(5, 7.5);
    return K('nod', from, [
      [0, base],
      [d * 0.25, { eye: 0.15, hd: 0.3 }, 'io'],
      [d * 0.85, { eye: 0, hd: deep ? 0.72 : 0.58, lean: 0.26, mouth: deep ? 0.35 : 0 }, 'in2'],
      [d * 0.85 + 0.12, { hd: 0.2, eye: deep ? 0 : 0.5, lean: 0.2, mouth: 0 }, 'out'],
      [d, { hd: 0.24, eye: 0.1 }, 'io'],
    ], { begin: (w) => { w.dozeN++; if (deep) w.snoreAt = w.t + d * 0.6; } });
  }

  /* ----- in a plain shell ----- */
  function readSeq(W) {
    const out = goStool(W);
    let p = out.length ? out[out.length - 1].end : tail(W);
    const sx = lx(STOOL.x, p);
    const rd = { nx: sx + 30, ny: -56, na: 2.4, fx: sx + 22, fy: -58, fa: 0.8, ff: 1, hd: 0.3, lean: 0.06 };
    const keys = [[0, {}], [0.45, { nx: sx + 18, ny: -34, na: 1.3, hd: 0.3 }, 'io'], [0.9, rd, 'io']];
    const evs = [[0.45, (w) => { w.tool.paper = 'n'; w.hold.n = 'paper'; }]];
    let t = 0.9;
    const pages = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < pages; i++) {
      for (let j = 0; j < 4; j++) { keys.push([t += rnd(1.4, 2.4), { hd: 0.26 + (j % 2) * 0.06 + rnd(-0.02, 0.02), brow: j === 2 ? 0.3 : 0 }, 'sm']); }
      if (i < pages - 1) { keys.push([t += 0.35, { nx: sx + 26, ny: -60 }, 'io']); evs.push([t, (w) => { w.pageTo = 1; w.snd.push({ k: 'page', x: STOOL.x }); }]); keys.push([t += 0.5, { nx: sx + 30, ny: -56 }, 'io']); evs.push([t + 0.3, (w) => { w.page = 0; w.pageTo = 0; }]); }
    }
    keys.push([t += 0.5, { nx: sx + 20, ny: -40, na: 1.3, hd: 0.2 }, 'io']);
    evs.push([t, (w) => { w.tool.paper = 'pocket'; w.hold.n = null; }]);
    keys.push([t += 0.45, { nx: sx + 13, ny: -40, na: 0.4, fx: sx + 16, fy: -41, fa: 3.3, ff: 1, hd: 0.15 }, 'io']);
    out.push(K('read', p, keys, { ev: evs }));
    return out;
  }
  function goStool(W) {
    const out = [];
    let p = tail(W);
    if (W.sitting) return out;
    for (const a of goTo(W, SITX, -1, {}, p)) { out.push(a); p = a.end; }
    out.push(sitDown(W, p));
    return out;
  }
  function sweepSeq(W) {
    const out = [];
    let p = tail(W);
    const push = (a) => { if (a) { out.push(a); p = a.end; } };
    if (W.sitting) push(standUp(W, p));
    for (const a of goTo(W, BROOM_X - 15, 1, {}, p)) push(a);
    push(K('broom', p, [[0, {}], [0.45, { nx: 11, ny: -62, na: -1.1, lean: 0.1, hd: 0.2 }, 'io'], [0.9, { nx: 8, ny: -56, na: 1.05, fx: 1, fy: -66, fa: 1.05 }, 'io']], { ev: [[0.45, (w) => { w.tool.broom = 'n'; w.hold.n = 'broom'; }]] }));
    for (const a of goTo(W, 58, -1, { keepHands: true }, p)) push(a);
    // strokes toward the bin under the bench, a step at a time
    let x = 58;
    while (x > 18) {
      const from = p;
      const sw = { na: 1.02, fa: 1.02, ny: -54, fy: -64 };
      const a0 = K('sweep', from, [
        [0, {}],
        [0.22, Object.assign({ nx: 6, fx: -1, lean: 0.12, hd: 0.35 }, sw), 'io'],
        [0.62, Object.assign({}, sw, { nx: 16, fx: 9, ny: -52, fy: -62, lean: 0.24 }), 'io'],
        [0.86, Object.assign({}, sw, { nx: 7, fx: 0, ny: -55, fy: -65, lean: 0.12 }), 'io'],
      ], { blend: 0.15, ev: [[0.25, (w) => { w.sweeping = 1; }], [0.62, (w) => { w.sweeping = 0; w.snd.push({ k: 'sweep', x: w.pose.x - 30 }); }]] });
      push(a0);
      const nx = x - 9;
      const wk = walk(p, nx, { keepHands: true, slow: 1.2 });
      push(wk);
      x = nx;
    }
    for (const a of goTo(W, BROOM_X - 15, 1, { keepHands: true }, p)) push(a);
    push(K('broomBack', p, [[0, {}], [0.5, { nx: 11, ny: -62, na: -1.1, fx: -2, fy: -44, fa: 1.55 }, 'io'], [0.95, Object.assign({}, HANG), 'io']], { ev: [[0.5, (w) => { w.tool.broom = 'wall'; w.hold.n = null; }]] }));
    return out;
  }
  function whistleSeq(W) {
    const out = [];
    let p = tail(W);
    if (W.sitting) { out.push(standUp(W, p)); p = out[0].end; }
    const keys = [[0, {}], [0.5, { nx: -9, ny: -47, na: 1.0, fx: -12, fy: -47, fa: 1.2, hd: -0.05, mouth: 0.18, turn: 0.3 }, 'io']];
    let t = 0.5;
    for (let i = 0; i < 4; i++) {
      keys.push([t += 0.7, { nfy: -5.5, nft: -0.28, ffy: -5.5, fft: -0.28, hy: -42.4, hd: -0.08 }, 'io']);
      keys.push([t += 0.7, { nfy: -5, nft: 0, ffy: -5, fft: 0, hy: -41.5, hd: -0.02 }, 'io']);
    }
    keys.push([t += 0.5, Object.assign({}, HANG, { mouth: 0, turn: 0 }), 'io']);
    out.push(K('whistle', p, keys, { begin: (w) => { w.whistle = 1; }, after: (w) => { w.whistle = 0; } }));
    return out;
  }

  /* ---------- planning: what next, given what the agent is doing and where he is ---------- */
  function plan(W) {
    const q = W.q;
    const put = (arr) => { for (const a of arr) if (a) q.push(a); };
    if (W.pending === 'startle') {
      W.pending = '';
      put([startleTask(W, tail(W)), shrugTask(W, tail(W))]);
      return;
    }
    if (W.hold.n === 'piece') return put(shelveSeq(W));
    if (W.mode === 'ask' && !W.pv) return planAsk(W);
    W.asked = 0;
    const dropped = Object.keys(W.tool).find((k) => W.tool[k] === 'floor');
    if (dropped && W.drop && W.drop.rest) return put(pickupSeq(W, dropped));
    if ((W.proj && W.proj.done) || W.pending === 'finish') {
      if (W.pending === 'finish' && !W.proj) W.proj = newProject(W);
      if (W.pending === 'finish' && !W.proj.done) {
        W.pending = '';
        const out = [];
        let p = tail(W);
        if (W.sitting) { out.push(standUp(W, p)); p = out[0].end; }
        for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; }
        if (W.hold.n) { const a = putAway(W, p); if (a) { out.push(a); p = a.end; } }
        for (const a of out) a.keep = 1;
        out.push(finalTask(W, p)); p = out[out.length - 1].end;
        out.push(stretchTask(W, p)); p = out[out.length - 1].end;
        out.push(proudTask(W, p));
        put(out);
        return;
      }
      W.pending = '';
      put(shelveSeq(W));
      return;
    }
    W.pending = '';
    if (W.pv) return put(pvPlan(W));
    if (W.mode === 'work') return planWork(W);
    if (W.mode === 'wait') {
      if (!W.sitting) {
        if (W.idleN < 1 + (Math.random() < 0.5)) { W.idleN++; return put([idleTask(W, tail(W))]); }
        const out = [];
        let p = tail(W);
        if (W.hold.n && W.hold.n !== 'paper') { if (Math.abs(p.x - AX) > 1.5 || p.face !== -1) for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; } const a = putAway(W, p); if (a) { out.push(a); p = a.end; } }
        put(out);
        put(goStool(W));
        return;
      }
      W.idleN = 0;
      return put([nodCycle(W, tail(W))]);
    }
    // a plain shell
    W.idleN = 0;
    const r = Math.random();
    const dirty = W.debris.length > 24;
    let v = dirty && W.lastShell !== 'sweep' && r < 0.45 ? 'sweep' : r < 0.55 && W.lastShell !== 'read' ? 'read' : r < 0.8 && W.lastShell !== 'whistle' ? 'whistle' : W.lastShell !== 'coffee' ? 'coffee' : 'read';
    W.lastShell = v;
    if (W.hold.n && W.hold.n !== 'paper') {
      const out = [];
      let p = tail(W);
      for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; }
      out.push(putAway(W, p));
      return put(out);
    }
    if (v === 'sweep') return put(sweepSeq(W));
    if (v === 'read') return put(readSeq(W));
    if (v === 'whistle') return put(whistleSeq(W));
    const out = [];
    let p = tail(W);
    if (W.sitting) { out.push(standUp(W, p)); p = out[0].end; }
    for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; }
    out.push(coffeeTask(W, p));
    return put(out);
  }
  function planAsk(W) {
    const out = [];
    let p = tail(W);
    if (W.hold.n && W.hold.n !== 'paper' && !W.sitting) { if (Math.abs(p.x - AX) > 1.5 || p.face !== -1) for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; } const a = putAway(W, p); if (a) { out.push(a); p = a.end; } }
    if (W.hold.n === 'paper') { W.hold.n = null; W.tool.paper = 'pocket'; }
    out.push(W.asked ? askHold(W, p) : askTask(W, p));
    W.asked = 1;
    W.q.push(...out);
  }
  /** Bend down for a tool he dropped, and (at the bench) hang it back up. */
  function pickupSeq(W, tool) {
    const out = [];
    let p = tail(W);
    const push = (a) => { if (a) { out.push(a); p = a.end; } };
    if (W.sitting) push(standUp(W, p));
    const tx = W.drop.x, face = tx < p.x ? -1 : 1, sx = tx - face * 14;
    for (const a of goTo(W, sx, face, {}, p)) push(a);
    const l = lx(tx, p);
    push(K('pickup', p, [
      [0, {}],
      [0.55, { hy: -30, hx: -6, lean: 0.75, hd: 0.45, nx: l, ny: -3, na: 0.2, nfx: 7, ffx: -8, brow: 0.2 }, 'io'],
      [0.75, { ny: -2.5 }, 'io'],
      [1.3, Object.assign({}, HANG, { hy: -41.5, hx: -2, lean: 0.06, hd: 0.1, nfx: 4, ffx: -7, nx: 8, ny: -52, na: 0.6, brow: 0 }), 'io'],
    ], { soft: false, keep: 1, ev: [[0.7, (w) => { w.tool[tool] = 'n'; w.hold.n = tool; w.drop = null; }]] }));
    if (W.mode === 'work' || W.mode === 'wait' || W.mode === 'shell') {
      for (const a of goTo(W, AX, -1, { keepHands: true }, p)) push(a);
      if (REST[tool]) { const a = putAway(Object.assign({}, W, { hold: { n: tool } }), p); if (a) push(a); }
    }
    for (const a of out) a.keep = 1;
    return out;
  }
  function planWork(W) {
    const out = [];
    let p = tail(W);
    if (W.t < W.calmUntil) { W.q.push(idleTask(W, p)); return; } // just stopped: no going straight back to it
    if (W.sitting) { out.push(standUp(W, p)); p = out[0].end; }
    if (W.hold.n === 'paper') { W.hold.n = null; W.tool.paper = 'pocket'; }
    if (W.hold.n === 'broom') { for (const a of goTo(W, BROOM_X - 15, 1, { keepHands: true }, p)) { out.push(a); p = a.end; } out.push(K('broomBack', p, [[0, {}], [0.5, { nx: 11, ny: -62, na: -1.1, fx: -2, fy: -44, fa: 1.55 }, 'io'], [0.95, Object.assign({}, HANG), 'io']], { ev: [[0.5, (w) => { w.tool.broom = 'wall'; w.hold.n = null; }]] })); p = out[out.length - 1].end; }
    for (const a of goTo(W, AX, -1, {}, p)) { out.push(a); p = a.end; }
    W.q.push(...out);
    if (!W.proj) { W.proj = newProject(W); W.q.push(blueprintTask(W, tail(W), true)); W.lastTask = 'blueprint'; return; }
    // a long task: now and then a breather
    const long = W.workFor > 40;
    if (long && W.t - W.extraAt > rnd(28, 45)) {
      W.extraAt = W.t;
      const opts = [];
      if (W.roll < 0.5 && W.workFor > 75) opts.push('sleeves', 'sleeves');
      opts.push('brow', 'coffee', 'back');
      const v = pick(opts.filter((o) => o !== W.lastExtra));
      W.lastExtra = v;
      const o2 = [];
      ensure(W, o2, null);
      W.q.push(...o2);
      const pp = tail(W);
      W.q.push(v === 'sleeves' ? sleeveTask(W, pp) : v === 'brow' ? browTask(W, pp) : v === 'coffee' ? coffeeTask(W, pp) : backTask(W, pp));
      return;
    }
    const weights = { hammer: 34, saw: 20, plane: 20, measure: 15, blueprint: 8 };
    weights[W.lastTask] = (weights[W.lastTask] || 0) * 0.15;
    let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0), task = 'hammer';
    for (const [k, v] of Object.entries(weights)) { if ((r -= v) < 0) { task = k; break; } }
    W.lastTask = task;
    if (task === 'saw' && W.plank.len < 30) { const o3 = []; ensure(W, o3, null); W.q.push(...o3, ...restockSeq(W)); return; }
    const need = task === 'hammer' ? 'hammer' : task === 'saw' ? 'saw' : task === 'plane' ? 'plane' : null;
    const o2 = [];
    ensure(W, o2, need);
    W.q.push(...o2);
    const pp = tail(W);
    W.q.push(task === 'hammer' ? hammerTask(W, pp) : task === 'saw' ? sawTask(W, pp) : task === 'plane' ? planeTask(W, pp) : task === 'measure' ? measureTask(W, pp) : blueprintTask(W, pp, false));
  }
  /** The plank is sawn short: take it down to the stack under the bench and bring a long board up. */
  function restockSeq(W) {
    const out = [];
    let p = tail(W);
    const push = (a) => { if (a) { out.push(a); p = a.end; } };
    const carry = { nx: 12, ny: -56, na: 0.2, fx: 4, fy: -57, fa: 0.2, nh: 0, fh: 0 };
    push(K('liftBoard', p, [
      [0, {}],
      [0.45, { lean: 0.3, hd: 0.4, nx: lx(-4, p), ny: -54, na: 1.4, fx: lx(-14, p), fy: -54, fa: 1.4 }, 'io'],
      [0.9, Object.assign({ lean: 0.08, hd: 0.2 }, carry), 'io'],
    ], { ev: [[0.5, (w) => { w.board = w.plank.len; w.plank.len = 0; w.hold.n = 'board'; }]] }));
    push(walk(p, -52, { keepHands: true }));
    const l = lx(-86, p);
    push(K('stack', p, [
      [0, {}],
      [0.55, { hy: -30, hx: -5, lean: 0.7, hd: 0.45, nx: l + 6, ny: -16, na: 1.2, fx: l - 4, fy: -16, fa: 1.2, nfx: 7, ffx: -8 }, 'io'],
      [0.8, { ny: -15, fy: -15 }, 'io'],
      [1.4, Object.assign({ hy: -41.5, hx: -2, lean: 0.08, hd: 0.15, nfx: 4, ffx: -7 }, carry), 'io'],
    ], { soft: false, ev: [[0.75, (w) => { w.board = 64; w.snd.push({ k: 'clack', x: -86 }); }]] }));
    for (const a of goTo(W, AX, -1, { keepHands: true }, p)) push(a);
    push(K('layBoard', p, [
      [0, {}],
      [0.5, { lean: 0.3, hd: 0.4, nx: lx(-4, p), ny: -54, na: 1.4, fx: lx(-14, p), fy: -54, fa: 1.4 }, 'io'],
      [0.9, Object.assign({}, HANG, { lean: 0.06, hd: 0.1 }), 'io'],
    ], { ev: [[0.5, (w) => { w.plank.len = 64; w.plank.r = -1; w.board = 0; w.hold.n = null; w.snd.push({ k: 'clack', x: -10 }); }]] }));
    for (const a of out) a.keep = 1;
    return out;
  }
  /** The picker's preview: hammering, always. */
  function pvPlan(W) {
    if (!W.proj) W.proj = newProject(W, 'birdhouse');
    W.proj.n = 5;
    const out = [];
    if (W.hold.n !== 'hammer') { W.tool.hammer = 'n'; W.hold.n = 'hammer'; }
    out.push(hammerTask(W, tail(W)));
    return out;
  }

  /* ---------- the project on the bench ---------- */
  function newProject(W, id) {
    const pool = PIECES.map((d) => d.id).filter((x) => !W.used.includes(x));
    const pid = id || pick(pool.length ? pool : PIECES.map((d) => d.id));
    W.used.push(pid);
    if (W.used.length > 4) W.used.shift();
    W.printNext = pid;
    return { id: pid, p: 0, n: 0, at: [], shine: 0, done: 0 };
  }
  function addProgress(W, k) {
    const pr = W.proj;
    if (!pr || pr.done) return;
    pr.p += (1 - pr.p) * k;
    const n = PIECE_BY[pr.id].parts.length;
    while (pr.n < n - 1 && pr.p > 0.06 + (0.86 * pr.n) / (n - 1)) revealNext(W);
  }
  function revealNext(W) {
    const pr = W.proj;
    if (!pr || pr.n >= PIECE_BY[pr.id].parts.length) return;
    pr.at[pr.n] = W.t; pr.n++;
    for (let i = 0; i < 4; i++) addP(W, { k: 'puff', x: PIECE_X + rnd(-9, 9), y: BENCH.top - 1, vx: rnd(-10, 10), vy: rnd(-6, -1), drag: 0.9, life: rnd(0.5, 0.9), r: rnd(1.2, 2.2) });
  }
  function sparkle(W, x, y, n) { for (let i = 0; i < n; i++) addP(W, { k: 'spark', x: x + rnd(-12, 12), y: y + rnd(-12, 8), vx: 0, vy: rnd(-6, -2), life: rnd(0.7, 1.3), d: rnd(0, 0.4), r2: rnd(1.6, 3) }); }

  /* ---------- particles and the floor ---------- */
  function addP(W, o) { if (W.parts.length < 240) { o.age = 0; W.parts.push(o); } }
  function updParticles(W) {
    const keep = [];
    for (const p of W.parts) {
      p.age += DT;
      if (p.d && p.age < p.d) { keep.push(p); continue; }
      if (p.g) p.vy += p.g * DT;
      if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      p.x += p.vx * DT; p.y += p.vy * DT;
      if (p.vr) p.rot += p.vr * DT;
      if (p.land && p.y >= -p.zf) {
        if (p.k === 'off' && !p.bounced && p.vy > 30) { p.bounced = 1; p.vy *= -0.3; p.vx *= 0.5; p.vr *= 0.4; p.y = -p.zf; W.snd.push({ k: 'clack', x: p.x }); keep.push(p); continue; }
        if (W.debris.length >= 220) W.debris.splice(0, 1);
        W.debris.push({ k: p.k, x: p.x, y: rnd(-2, 3.5), rot: p.rot || rnd(0, 6), s: p.s || 1, w: p.w || 0 });
        continue;
      }
      if (p.zf == null) p.zf = rnd(-3, 2);
      if (p.age < p.life) keep.push(p);
    }
    W.parts = keep;
  }

  /* ---------- the world ---------- */
  const SESSION = { shelf: [], crate: [], used: [], debris: [], proj: null, roll: 0, plank: null };
  function newWorld(real) {
    const S = real ? SESSION : { shelf: [{ id: 'boat', at: -9 }, { id: 'chair', at: -9 }], crate: [], used: [], debris: [], proj: null, roll: 0, plank: null };
    const W = {
      kind: 'worker', real, pv: !real, t: 0,
      pose: Object.assign({}, BASE), act: null, tau: 0, evi: 0, snap: null, q: [], J: null,
      hold: { n: null, f: null }, tool: Object.assign({}, HOME), sitting: false,
      shelf: S.shelf, crate: S.crate, used: S.used, debris: S.debris, proj: S.proj, carry: null,
      plank: S.plank || (S.plank = { r: -1, len: 64 }), board: 0, slide: null, cut: 0, marks: [],
      roll: S.roll, rollTo: S.roll, S,
      parts: [], lamp: { a: 0, v: 0 }, bow: { x: 0, y: 0, vx: 0, vy: 0 }, apronSw: 0, lampLv: 0.7, flare: 0, dust: 0.3, glow: null,
      cat: { curl: 0, to: 0, wait: 0, moving: 0, blink: 0, twitch: 0, look: 0, ph: rnd(0, 6) },
      mode: '', tab: { id: undefined, status: '', intAt: 0 }, lastInt: 0, pending: '', idleN: 0, dozeN: 0, asked: 0,
      lastTask: '', lastExtra: '', lastShell: '', extraAt: 0, workFor: 0, calmUntil: 0, drop: null,
      blink: 0, nextBlink: 2, glint: 0, bubble: 0, bubbleTo: 0, bang: 0, shake: 0, flip: 0, print: null, printNext: null,
      grip: 0, gripTo: 0, tapeOut: 0, tapeTo: 0, page: 0, pageTo: 0, whistle: 0, sweeping: 0, snoreAt: 0, zAt: 0, noteAt: 0,
      snd: [], motes: [],
    };
    for (let i = 0; i < 26; i++) W.motes.push({ x: rnd(-90, 70), y: rnd(-180, -10), vx: rnd(-1, 1), vy: rnd(-1, 1), ph: rnd(0, 6) });
    if (!real) { W.proj = newProject(W, 'birdhouse'); W.proj.n = 5; W.tool.hammer = 'n'; W.hold.n = 'hammer'; W.mode = 'work'; W.pose = Object.assign({}, BASE, { nx: 9, ny: -54, na: -0.4, lean: 0.1, hd: 0.3 }); }
    W.print = W.proj ? W.proj.id : 'birdhouse';
    return W;
  }

  /** Read the active tab: who is working, and what just happened. */
  function poll(W) {
    let t = null;
    try { t = typeof activeTab === 'function' ? activeTab() : null; } catch { t = null; }
    const id = t ? t.id : null, agent = t && t.agent ? t.agent : null, status = t ? t.status || '' : '';
    const ask = !!(agent && (t.awaitChoice || status === 'attention'));
    const mode = !agent || t.alive === false || status === 'exited' || status === 'starting' || status === 'shell' ? 'shell' : ask ? 'ask' : status === 'working' ? 'work' : 'wait';
    let ev = '';
    const pv = W.tab;
    const intAt = t ? t.interruptedAt || 0 : 0;
    if (t && pv.id === id) {
      const newEsc = !!t.interrupted && intAt && intAt !== W.lastInt;
      if (pv.status === 'working' && status !== 'working') {
        const stopped = !!t.interrupted && (t.lastOut || 0) - intAt < 5000;
        if (stopped && newEsc) ev = 'interrupt';
        else if (!stopped && status === 'done' && (t.lastDuration || 0) > 1000) ev = 'finish';
      } else if (newEsc && Date.now() - intAt < 2000 && (status === 'working' || pv.status === 'attention' || t.awaitChoice)) ev = 'interrupt';
      if (ev === 'interrupt') W.lastInt = intAt;
    } else if (t) W.lastInt = intAt; // another tab: no events carried over
    W.tab = { id, status };
    W.workFor = mode === 'work' && t && t.workStart ? (Date.now() - t.workStart) / 1000 : 0;
    const cut = () => { W.q = W.q.filter((a) => a.keep); if (W.act && W.act.soft && !W.act.keep) W.tau = W.act.dur; };
    if (ev === 'finish') { W.pending = 'finish'; cut(); }
    if (ev === 'interrupt') { W.pending = 'startle'; W.q = W.q.filter((a) => a.keep && a.name !== 'shrug'); if (W.act && !W.act.keep && (W.act.soft || W.act.name === 'walk')) W.tau = W.act.dur; }
    if (mode !== W.mode) {
      const was = W.mode;
      W.mode = mode;
      if (was) cut();
      if (mode !== 'ask') W.bubbleTo = 0;
      if (mode !== 'wait') W.idleN = 0;
      if (mode === 'work' && was !== 'work') W.calmUntil = Math.min(W.calmUntil, W.t);
    }
  }

  /** One frame of time: the action, the springs, the props. */
  function simulate(W) {
    W.t += DT;
    // the action
    const a = W.act;
    if (!a || W.tau >= a.dur) {
      if (a && a.after) a.after(W);
      if (!W.q.length) plan(W);
      const n = W.q.shift() || idleTask(W, W.pose);
      W.snap = W.pose; W.act = n; W.tau = 0; W.evi = 0;
      if (n.begin) n.begin(W);
    }
    const b = W.act;
    W.tau += DT;
    const evs = b.ev;
    while (evs && W.evi < evs.length && evs[W.evi][0] <= W.tau) evs[W.evi++][1](W);
    let p = b.pose(Math.min(W.tau, b.dur), W);
    const bl = b.blend == null ? 0.25 : b.blend;
    if (W.snap && W.tau < bl) { let s = W.snap; if (s.face !== p.face) s = mirror(s); p = mix(s, p, sm(W.tau / bl)); }
    // breathing, a little life
    const br = W.sitting && W.mode === 'wait' ? 0.25 : 0.45, amp = W.sitting && W.mode === 'wait' ? 0.016 : 0.008;
    p = Object.assign({}, p, { sq: p.sq * (1 + Math.sin(W.t * TAU * br) * amp) });
    W.pose = p;
    W.J = solve(p);
    // blinking
    W.nextBlink -= DT; if (W.blink > 0) W.blink -= DT;
    if (W.nextBlink <= 0) { W.blink = 0.13; W.nextBlink = rnd(2, 5.5) * (Math.random() < 0.15 ? 0.15 : 1); }
    // springs: the apron strings, the lamp
    const J = W.J, f = p.face * p.sx;
    const hipW = p.x + p.hx * f;
    const bw = W.bow;
    if (W.hipPrev != null) { const v = (hipW - W.hipPrev) / DT; bw.vx -= v * 0.03 * p.face; }
    W.hipPrev = hipW;
    bw.vx += (-bw.x * 60 - bw.vx * 5) * DT; bw.vy += (-bw.y * 60 - bw.vy * 5) * DT;
    bw.x += bw.vx * DT; bw.y += bw.vy * DT; bw.x = clamp(bw.x, -5, 5);
    W.apronSw = lerp(W.apronSw, clamp(-bw.x * 0.5, -2, 2), 0.2);
    const lp = W.lamp;
    lp.v += (-lp.a * 1.4 - lp.v * 0.25) * DT; lp.a += lp.v * DT * 4;
    if (Math.random() < 0.004) lp.v += rnd(-0.0015, 0.0015);
    // props
    if (W.slide) { const k = clamp((W.t - W.slide.t0) / W.slide.d, 0, 1); W.plank.r = lerp(W.slide.from, W.slide.to, E.io(k)); if (k >= 1) W.slide = null; }
    W.roll += (W.rollTo - W.roll) * 0.02; W.S.roll = W.rollTo;
    W.tapeOut += (W.tapeTo - W.tapeOut) * (W.tapeTo ? 0.12 : 0.35);
    W.grip += (W.gripTo - W.grip) * 0.25;
    if (W.pageTo) W.page = Math.min(1, W.page + DT / 0.5);
    W.bubble += (W.bubbleTo - W.bubble) * (W.bubbleTo ? 0.16 : 0.2);
    W.bang = Math.max(0, W.bang - DT / 1.3);
    W.shake = Math.max(0, W.shake - DT * 4);
    if (W.proj && W.proj.shine > 0) { W.proj.shine += DT / 1.2; if (W.proj.shine >= 1) W.proj.shine = 0; }
    if (W.flip > 0) { W.flip += DT / 0.7; if (W.flip > 0.5 && W.printNext) { W.print = W.printNext; W.printNext = null; W.printSpr = null; } if (W.flip >= 1) W.flip = 0; }
    if (!W.flip && W.printNext && !W.proj) { /* waits for the next look at it */ }
    W.S.proj = W.proj;
    // sweeping: the broom pushes what lies on the floor toward the bin
    if (W.sweeping && W.hold.n === 'broom') {
      const tip = W.J.WN[0] + Math.cos(p.na) * 58, bx = p.x + tip * p.face;
      for (const d of W.debris) if (Math.abs(d.x - bx) < 9) { d.x -= 1.6 + Math.random() * 1.2; d.rot += 0.2; }
      for (let i = W.debris.length - 1; i >= 0; i--) if (W.debris[i].x < BIN.x1 - 2 && W.debris[i].x > BIN.x0 - 20) W.debris.splice(i, 1);
    }
    // sleepy noises
    if (W.mode === 'wait' && W.sitting && p.eye < 0.2 && W.t > W.zAt) { W.zAt = W.t + rnd(1.4, 2.2); addP(W, { k: 'z', rc: 1, x: p.x + (J.head[0] + 9) * p.face, y: J.head[1] - 14, vx: rnd(3, 6), vy: -9, life: 3.2, s: rnd(0.8, 1.1) }); }
    if (W.snoreAt && W.t > W.snoreAt) { W.snoreAt = 0; if (Math.random() < 0.35) W.snd.push({ k: 'snore', x: p.x }); }
    if (W.whistle && W.t > W.noteAt) { W.noteAt = W.t + rnd(0.5, 0.9); addP(W, { k: 'note', rc: 1, x: p.x + (J.head[0] + 12) * p.face, y: J.head[1] + 6, vx: p.face * rnd(4, 9), vy: rnd(-14, -9), life: 1.8, s: rnd(0.8, 1.1), ph: rnd(0, 6) }); }
    if (W.hold.n === 'mug' && Math.random() < 0.3) addP(W, { k: 'steam', rc: 1, x: p.x + (J.WN[0] + 6) * p.face, y: J.WN[1] - 10, vx: rnd(-2, 2), vy: rnd(-9, -6), life: 1.4, ph: rnd(0, 6) });
    // the lamp: full while he works, low while he waits; a flare when a piece is done
    const want = W.mode === 'work' || W.pending === 'finish' || W.hold.n === 'piece' || (W.act && /final|stretch|proud|lift|place/.test(W.act.name)) ? 1 : W.mode === 'ask' ? 0.7 : W.mode === 'wait' ? (W.sitting ? 0.22 : 0.55) : 0.72;
    W.lampLv += (want + W.flare - W.lampLv) * (want > W.lampLv ? 0.06 : 0.025);
    W.flare *= 0.96;
    W.dust += ((W.mode === 'work' ? 1 : 0.2) - W.dust) * 0.01;
    // the cat
    const ct = W.cat;
    ct.to = W.mode === 'wait' && W.sitting ? 1 : 0;
    const was = ct.curl;
    if (ct.to > ct.curl && W.t > ct.wait) ct.curl = Math.min(1, ct.curl + DT / 2.2); else if (ct.to < ct.curl) ct.curl = Math.max(0, ct.curl - DT / 1.6);
    if (ct.to === 0) ct.wait = W.t + rnd(2, 5); // it settles a little after he does
    ct.moving = Math.abs(ct.curl - was) > 1e-4;
    if (ct.blink > 0) ct.blink -= DT; else if (Math.random() < 0.006) ct.blink = 0.25;
    if (ct.twitch > 0) ct.twitch -= DT; else if (Math.random() < 0.004 || W.shake > 1) ct.twitch = 0.18;
    ct.look += ((Math.sin(W.t * 0.13 + ct.ph) > 0.3 ? 1 : 0) - ct.look) * 0.03;
    updParticles(W);
    const dr = W.drop;
    if (dr && !dr.rest) {
      dr.vy += 300 * DT; dr.x += dr.vx * DT; dr.y += dr.vy * DT; dr.rot += dr.vr * DT;
      if (dr.y >= -2) {
        dr.y = -2;
        if (!dr.bounced && dr.vy > 40) { dr.bounced = 1; dr.vy *= -0.28; dr.vx *= 0.45; dr.vr *= 0.4; W.snd.push({ k: 'drop', x: dr.x }); }
        else { dr.rest = 1; dr.rot = Math.round(dr.rot / PI) * PI; }
      }
    }
    for (const m of W.motes) { m.vx += rnd(-0.5, 0.5) * DT * 6; m.vy += rnd(-0.5, 0.5) * DT * 6; m.vx *= 0.98; m.vy *= 0.98; m.x += m.vx * DT * 3; m.y += m.vy * DT * 3 - 0.02; if (m.x < -110) m.x = 90; if (m.x > 90) m.x = -110; if (m.y < -186) m.y = -8; if (m.y > -6) m.y = -186; }
  }

  /* ---------- the diorama, painted once per size: with the lamp low, and with it full ---------- */
  function layout(w, h, pv) {
    if (pv) { const k = h / 116; return { k, ox: w * 0.6 - 17 * k, oy: h - 3 * k, pv }; }
    const k = clamp(Math.min(h / 740, w / 1180) * 1.02, 0.5, 1.4);
    return { k, ox: w - 262 * k, oy: h - 66 * k, pv };
  }
  const LP = [-14, -134, LAMPZ]; // the bulb
  const MAT = {
    D: { amb: 0.36, lamp: 1.2, floor: '#c2905e', wall: '#cfa877', brick: '#b9775c', mortar: '#8a7a6a', cut: '#e6d8bf', cutS: '#b8a68a', slab: '#6a4a30', wood: '#c48e58', dark: '#8c5e36', metal: '#9aa3ae', peg: '#c9a27a' },
    L: { amb: 0.72, lamp: 0.55, floor: '#d6ab7c', wall: '#e3c79e', brick: '#d39a80', mortar: '#c4b5a4', cut: '#f6efe2', cutS: '#d9ccb6', slab: '#9c7652', wood: '#d6a470', dark: '#a87b52', metal: '#a9b2bc', peg: '#ddbb92' },
  };
  function lightAt(q, n, M, lamp) {
    const dx = LP[0] - q[0], dy = LP[1] - q[1], dz = LP[2] - q[2], d = Math.hypot(dx, dy, dz) || 1;
    const ndl = Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d);
    return M.amb + lamp * M.lamp * (0.25 + 0.75 * ndl) / (1 + (d / 140) ** 2);
  }
  /** A flat face lit by the lamp: brightest at the point nearest the bulb, falling off across it. */
  function litFace(c, q3, n, alb, M, lamp, line) {
    const pts = q3.map((q) => P3(q[0], q[1], q[2]));
    const lo = [0, 1, 2].map((i) => Math.min(...q3.map((q) => q[i]))), hi = [0, 1, 2].map((i) => Math.max(...q3.map((q) => q[i])));
    const dd = (LP[0] - q3[0][0]) * n[0] + (LP[1] - q3[0][1]) * n[1] + (LP[2] - q3[0][2]) * n[2];
    const near = [0, 1, 2].map((i) => clamp(LP[i] - n[i] * dd, lo[i], hi[i]));
    let far = q3[0], fd = -1;
    for (const q of q3) { const d = Math.hypot(q[0] - near[0], q[1] - near[1], q[2] - near[2]); if (d > fd) { fd = d; far = q; } }
    const mid = [0, 1, 2].map((i) => lerp(near[i], far[i], 0.4));
    const S = P3(near[0], near[1], near[2]), Fp = P3(far[0], far[1], far[2]), R = Math.max(1, Math.hypot(Fp[0] - S[0], Fp[1] - S[1]));
    const g = c.createRadialGradient(S[0], S[1], 0, S[0], S[1], R);
    g.addColorStop(0, rgb(scl(alb, lightAt(near, n, M, lamp)))); g.addColorStop(0.4, rgb(scl(alb, lightAt(mid, n, M, lamp)))); g.addColorStop(1, rgb(scl(alb, lightAt(far, n, M, lamp))));
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath();
    c.fillStyle = g; c.fill();
    if (line) { c.strokeStyle = line; c.lineWidth = 0.45; c.stroke(); }
  }
  /** A box: its front (z0), top and the side that faces the vanishing point. */
  function box3(c, x0, x1, yT, yB, z0, z1, alb, M, lamp, o = {}) {
    const ln = o.line || 'rgba(30,18,10,0.45)';
    if (x1 < CAM.vx - 0.01 && !o.noSide) litFace(c, [[x1, yB, z0], [x1, yB, z1], [x1, yT, z1], [x1, yT, z0]], [1, 0, 0], alb, M, lamp, ln);
    else if (x0 > CAM.vx && !o.noSide) litFace(c, [[x0, yB, z0], [x0, yB, z1], [x0, yT, z1], [x0, yT, z0]], [-1, 0, 0], alb, M, lamp, ln);
    if (!o.noTop) litFace(c, [[x0, yT, z0], [x1, yT, z0], [x1, yT, z1], [x0, yT, z1]], [0, -1, 0], scl(alb, 1.06), M, lamp, ln);
    if (!o.noFront) litFace(c, [[x0, yB, z0], [x1, yB, z0], [x1, yT, z0], [x0, yT, z0]], [0, 0, -1], alb, M, lamp, ln);
    if (o.grain) { // a few lines of grain along the front and the top
      c.strokeStyle = 'rgba(70,40,18,0.18)'; c.lineWidth = 0.35; c.beginPath();
      for (let i = 1; i < 3; i++) { const y = lerp(yT, yB, i / 3); const a = P3(x0 + 1, y, z0), b = P3(x1 - 1, y + (i - 1.5) * 0.4, z0); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 0.5, b[0], b[1]); }
      for (let i = 1; i < 4; i++) { const z = lerp(z0, z1, i / 4); const a = P3(x0 + 1, yT, z), b = P3(x1 - 1, yT, z); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.stroke();
    }
    if (!o.noTop && !o.noFront) { const a = P3(x0, yT, z0), b = P3(x1, yT, z0); c.strokeStyle = 'rgba(255,236,206,0.3)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  }
  function polyP(c, q3) { c.beginPath(); q3.forEach((q, i) => { const r = P3(q[0], q[1], q[2]); if (i) c.lineTo(r[0], r[1]); else c.moveTo(r[0], r[1]); }); c.closePath(); }
  /** Soft contact shadow: a floor polygon drawn several times, growing and fading. */
  function softShadow(c, x0, x1, z0, z1, a, y = 0) {
    for (let i = 0; i < 4; i++) { const g = i * 2.2; polyP(c, [[x0 - g, y, z0 - g], [x1 + g, y, z0 - g], [x1 + g, y, z1 + g], [x0 - g, y, z1 + g]]); c.fillStyle = `rgba(0,0,0,${a / (1 + i * 0.7)})`; c.fill(); }
  }
  /** Draw in the plane of the back wall (or any plane z = const): plain coordinates, scaled toward V. */
  function onPlane(c, z) { const f = zf(z); c.translate(CAM.vx * (1 - f), CAM.vy * (1 - f)); c.scale(f, f); }

  function room(c, M, lamp, L) {
    const { x0, x1, z0, z1, h, t } = ROOM, R = (seed) => ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;
    // back wall: vertical boards
    const wall = hex(M.wall);
    for (let x = x0, i = 0; x < x1; x += 12, i++) litFace(c, [[x, 0, z1], [Math.min(x1, x + 12), 0, z1], [Math.min(x1, x + 12), -h, z1], [x, -h, z1]], [0, 0, -1], scl(wall, 0.9 + R(i) * 0.16), M, lamp);
    c.save(); onPlane(c, z1);
    c.strokeStyle = 'rgba(40,22,10,0.32)'; c.lineWidth = 0.6; c.beginPath(); for (let x = x0 + 12; x < x1; x += 12) { c.moveTo(x, 0); c.lineTo(x, -h); } c.stroke();
    c.strokeStyle = 'rgba(70,40,18,0.1)'; c.lineWidth = 0.4; c.beginPath();
    for (let x = x0 + 3, i = 0; x < x1; x += 4, i++) { const y0 = -h * R(i + 3), l = 20 + 40 * R(i + 7); c.moveTo(x, y0); c.quadraticCurveTo(x + 0.8, y0 - l / 2, x, y0 - l); }
    c.stroke();
    c.restore();
    // a rail along the top of the wainscot and the skirting
    box3(c, x0, x1, -72, -69, z1 - 1.6, z1, scl(wall, 0.8), M, lamp, { noSide: 1 });
    box3(c, x0, x1, -8, 0, z1 - 2, z1, hex(M.dark), M, lamp, { noSide: 1 });
    // left wall: brick
    const br = hex(M.brick);
    litFace(c, [[x0, 0, z0], [x0, 0, z1], [x0, -h, z1], [x0, -h, z0]], [1, 0, 0], br, M, lamp);
    c.lineWidth = 0.45;
    for (let r = 0, y = 0; y > -h; r++, y -= 6) {
      for (let z = z0 - (r % 2) * 7; z < z1; z += 14) {
        const za = Math.max(z0, z), zb = Math.min(z1, z + 14);
        if (zb <= za) continue;
        polyP(c, [[x0, y, za], [x0, y, zb], [x0, y - 6, zb], [x0, y - 6, za]]);
        const v = R(r * 31 + z * 0.37);
        c.fillStyle = v > 0.5 ? `rgba(255,220,190,${(v - 0.5) * 0.16})` : `rgba(40,16,8,${(0.5 - v) * 0.2})`; c.fill();
        c.strokeStyle = 'rgba(40,24,16,0.35)'; c.stroke();
      }
    }
    box3(c, x0, x0 + 2, -8, 0, z0, z1, hex(M.dark), M, lamp, { noTop: 1, noFront: 1 });
    // floor: boards along the back wall
    const fl = hex(M.floor);
    for (let z = z1, i = 0; z > z0; z -= 9, i++) {
      const za = Math.max(z0, z - 9);
      litFace(c, [[x0, 0, za], [x1, 0, za], [x1, 0, z], [x0, 0, z]], [0, -1, 0], scl(fl, 0.88 + R(i + 40) * 0.18), M, lamp);
      const a = P3(x0, 0, za), b = P3(x1, 0, za);
      c.strokeStyle = 'rgba(30,16,8,0.45)'; c.lineWidth = 0.55; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      for (let x = x0 + 30 + R(i) * 70; x < x1; x += 70 + R(i + x) * 40) { const u = P3(x, 0, za), v = P3(x, 0, z); c.moveTo(u[0], u[1]); c.lineTo(v[0], v[1]); }
      c.stroke();
      c.strokeStyle = 'rgba(70,38,16,0.12)'; c.lineWidth = 0.4; c.beginPath();
      for (let j = 0; j < 5; j++) { const zz = lerp(za, z, 0.2 + j * 0.15), xs = x0 + R(i * 9 + j) * 200; const u = P3(xs, 0, zz), v = P3(xs + 60 + R(j + i) * 90, 0, zz + 0.6); c.moveTo(u[0], u[1]); c.lineTo(v[0], v[1]); }
      c.stroke();
    }
    // the shade where walls meet the floor
    for (const [q3, a] of [[[[x0, 0, z1], [x1, 0, z1], [x1, 0, z1 - 12], [x0, 0, z1 - 12]], 0.25], [[[x0, 0, z0], [x0, 0, z1], [x0 + 14, 0, z1], [x0 + 14, 0, z0]], 0.25]]) {
      const A = P3(...q3[0]), B = P3(...q3[3]);
      const g = c.createLinearGradient(A[0], A[1], B[0], B[1]); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      polyP(c, q3); c.fillStyle = g; c.fill();
    }
    { const A = P3(x0, -h / 2, z1), B = P3(x0 + 26, -h / 2, z1); const g = c.createLinearGradient(A[0], A[1], B[0], B[1]); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); polyP(c, [[x0, 0, z1], [x0 + 26, 0, z1], [x0 + 26, -h, z1], [x0, -h, z1]]); c.fillStyle = g; c.fill(); }
    // the cut-away edges of the model: wall tops, the end of the left wall, the floor slab
    const cut = hex(M.cut), cutS = hex(M.cutS);
    polyP(c, [[x0 - t, -h, z1 + t], [x1, -h, z1 + t], [x1, -h, z1], [x0, -h, z1]]); c.fillStyle = rgb(cut); c.fill();
    polyP(c, [[x0 - t, -h, z0], [x0, -h, z0], [x0, -h, z1], [x0 - t, -h, z1 + t]]); c.fillStyle = rgb(cut); c.fill();
    polyP(c, [[x0 - t, 0, z0], [x0, 0, z0], [x0, -h, z0], [x0 - t, -h, z0]]); c.fillStyle = rgb(cutS, 0.55); c.fill();
    polyP(c, [[x0 - t, 0, z0], [x1, 0, z0], [x1, 9, z0], [x0 - t, 9, z0]]); c.fillStyle = rgb(scl(hex(M.slab), L ? 1 : 0.9)); c.fill();
    { const a = P3(x0 - t, 0, z0), b = P3(x1, 0, z0); c.strokeStyle = L ? 'rgba(255,250,240,0.6)' : 'rgba(255,230,200,0.3)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  }

  function wallThings(c, M, lamp, L) {
    const z = ROOM.z1 - 0.6;
    // pegboard
    litFace(c, [[PEG.x0, PEG.y0, z], [PEG.x1, PEG.y0, z], [PEG.x1, PEG.y1, z], [PEG.x0, PEG.y1, z]], [0, 0, -1], hex(M.peg), M, lamp, 'rgba(40,22,10,0.5)');
    c.save(); onPlane(c, z);
    c.fillStyle = 'rgba(40,22,10,0.42)';
    for (let x = PEG.x0 + 4; x < PEG.x1 - 2; x += 5) for (let y = PEG.y0 - 4; y > PEG.y1 + 2; y -= 5) c.fillRect(x - 0.45, y - 0.45, 0.9, 0.9);
    pegTools(c, L);
    // a framed sketch, the window frame and the clock case
    c.fillStyle = rgb(scl(hex(M.dark), 0.9)); c.fillRect(WIN.x0 - 3, WIN.y1 - 3, WIN.x1 - WIN.x0 + 6, WIN.y0 - WIN.y1 + 6);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(WIN.x0, WIN.y1, WIN.x1 - WIN.x0, WIN.y0 - WIN.y1);
    c.restore();
    box3(c, WIN.x0 - 5, WIN.x1 + 5, WIN.y0, WIN.y0 + 3, z - 5, z, hex(M.wood), M, lamp); // the sill
    c.save(); onPlane(c, z);
    c.beginPath(); c.arc(CLOCK.x, CLOCK.y, 9.5, 0, TAU); c.fillStyle = rgb(scl(hex(M.dark), 0.95)); c.fill();
    c.beginPath(); c.arc(CLOCK.x, CLOCK.y, 8, 0, TAU); c.fillStyle = L ? '#fbf6ea' : '#e9e0cc'; c.fill();
    c.strokeStyle = 'rgba(40,30,20,0.8)'; c.lineWidth = 0.5; c.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r0 = i % 3 ? 6.6 : 5.8; c.moveTo(CLOCK.x + Math.cos(a) * r0, CLOCK.y + Math.sin(a) * r0); c.lineTo(CLOCK.x + Math.cos(a) * 7.4, CLOCK.y + Math.sin(a) * 7.4); }
    c.stroke();
    c.restore();
  }
  function pegTools(c, L) {
    const steel = 'rgba(178,186,196,1)', wood = rgb(hex('#b07a44')), red = rgb(hex('#c4473a'));
    const draw = (sh) => {
      const S = (col) => (sh ? 'rgba(0,0,0,0.3)' : col);
      c.save(); if (sh) c.translate(-1.4, 2);
      c.fillStyle = S(steel); c.fillRect(-150, -126, 2.4, 34); c.fillRect(-150, -94.4, 20, 2.4); // a square
      for (let i = 0; i < 3; i++) { const x = -122 + i * 6; c.fillStyle = S(wood); c.fillRect(x - 1.3, -122, 2.6, 10); c.fillStyle = S(steel); c.fillRect(x - 0.9, -112, 1.8 - i * 0.3, 9 - i * 2); } // chisels
      c.strokeStyle = S('rgba(70,90,110,1)'); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-98, -118); c.lineTo(-98, -126); c.lineTo(-78, -126); c.lineTo(-78, -118); c.stroke(); // coping saw
      c.strokeStyle = S('rgba(205,210,218,1)'); c.lineWidth = 0.4; c.beginPath(); c.moveTo(-98, -118); c.lineTo(-78, -118); c.stroke();
      c.fillStyle = S(wood); c.fillRect(-90, -117.5, 3.4, 8);
      c.fillStyle = S(wood); c.fillRect(-64, -110, 2.2, 18); c.fillStyle = S(rgb(hex('#d39d62'))); c.fillRect(-69, -116, 11.5, 6.5); // mallet
      c.strokeStyle = S(red); c.lineWidth = 1.8; c.beginPath(); c.moveTo(-48, -96); c.lineTo(-44.5, -114); c.moveTo(-41, -96); c.lineTo(-44.5, -114); c.stroke(); // pliers
      for (let i = 0; i < 2; i++) { const x = -146 + i * 12; c.strokeStyle = S('rgba(64,74,88,1)'); c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + 5, -86); c.lineTo(x, -86); c.lineTo(x, -70); c.lineTo(x + 5, -70); c.stroke(); c.fillStyle = S(red); c.fillRect(x + 3.4, -81, 4.4, 5); } // clamps
      c.restore();
    };
    draw(true); draw(false);
    c.fillStyle = 'rgba(30,18,10,0.9)';
    for (const [x, y] of [[-149, -128], [-122, -124], [-116, -124], [-110, -124], [-88, -128], [-63, -112], [-44.5, -116], [-143, -88], [-131, -88], [PEG.hammer[0], PEG.hammer[1] - 1]]) c.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
  }

  function benchDraw(c, M, lamp, L) {
    const w = hex(M.wood), d = hex(M.dark), x0 = BENCH.x0, x1 = BENCH.x1, top = TOP;
    softShadow(c, x0 + 6, x1 + 2, 0, BZ, 0.16);
    // the wall behind and below the top sits in its shade
    polyP(c, [[x0, 0, ROOM.z1], [x1, 0, ROOM.z1], [x1, top, ROOM.z1], [x0, top, ROOM.z1]]); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    for (const lx0 of [x0 + 6, x1 - 10]) box3(c, lx0, lx0 + 5, top + 6, 0, BZ - 6, BZ - 1, scl(d, 0.8), M, lamp); // back legs
    box3(c, x0 + 8, x1 - 8, -16, -13, 4, BZ - 3, d, M, lamp); // lower shelf
    for (let i = 0; i < 3; i++) box3(c, x0 + 20, x0 + 92 - i * 7, -18.6 - i * 2.3, -16.2 - i * 2.3, 8 + i * 2, 20 + i * 2, scl(hex('#d7a86e'), 0.92 + i * 0.04), M, lamp); // boards
    box3(c, x0 + 104, x0 + 126, -27, -16, 8, 20, hex('#b94a38'), M, lamp); // a toolbox
    { const a = P3(x0 + 110, -27, 14), b = P3(x0 + 120, -27, 14); c.strokeStyle = '#3a3a40'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + 1, a[1] - 4); c.lineTo(b[0] - 1, b[1] - 4); c.lineTo(b[0], b[1]); c.stroke(); }
    // bin for the sweepings
    box3(c, BIN.x0, BIN.x1, -15, 0, -2, 10, hex(M.metal), M, lamp);
    { const a = P3((BIN.x0 + BIN.x1) / 2, -15, 4); c.fillStyle = 'rgba(214,176,120,0.85)'; c.beginPath(); c.ellipse(a[0], a[1], 7, 1.6, 0, 0, TAU); c.fill(); }
    for (const lx0 of [x0 + 6, x1 - 10]) box3(c, lx0, lx0 + 5, top + 6, 0, 0, 5, d, M, lamp); // front legs
    box3(c, x0 + 11, x1 - 10, -12, -9, 1, 4, d, M, lamp); // stretcher
    box3(c, x0 + 2, x1 - 2, top + 6, top + 11, 1, BZ - 2, scl(w, 0.85), M, lamp, { noTop: 1 }); // rail
    { const a = P3(x0 + 62, top + 6.6, 1), b = P3(x0 + 104, top + 10.4, 1); c.strokeStyle = 'rgba(30,16,8,0.5)'; c.lineWidth = 0.5; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.fillStyle = '#e2c48e'; c.beginPath(); c.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.9, 0, TAU); c.fill(); }
    box3(c, x0, x1, top, top + 6, 0, BZ, w, M, lamp, { grain: 1 }); // the thick top
    { c.fillStyle = 'rgba(30,16,8,0.45)'; for (let x = x0 + 26; x < x1 - 30; x += 24) { const a = P3(x, top, 6); c.beginPath(); c.ellipse(a[0], a[1], 0.9, 0.4, 0, 0, TAU); c.fill(); } }
    // a front vice
    box3(c, x0 + 14, x0 + 40, top - 1, top + 16, -5, 0, scl(w, 0.95), M, lamp, { grain: 1 });
    { const a = P3(x0 + 20, top + 20, -6), b = P3(x0 + 36, top + 4, -6); c.strokeStyle = rgb(scl(hex(M.metal), 1.1)); c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.fillStyle = rgb(hex('#d9b27a')); c.beginPath(); c.arc(a[0], a[1], 1.4, 0, TAU); c.arc(b[0], b[1], 1.4, 0, TAU); c.fill(); c.lineCap = 'butt'; }
    // a few things at the far end of the top: a clamp, an oil can
    box3(c, x0 + 60, x0 + 62, top - 12, top, 10, 14, hex('#4a5866'), M, lamp); box3(c, x0 + 60, x0 + 72, top - 12, top - 10, 10, 14, hex('#4a5866'), M, lamp); box3(c, x0 + 66, x0 + 71, top - 8, top - 3, 10, 14, hex('#c4473a'), M, lamp);
    box3(c, x0 + 92, x0 + 100, top - 9, top, 14, 20, hex('#3f6a4a'), M, lamp);
    { const a = P3(x0 + 96, top - 9, 17), b = P3(x0 + 106, top - 15, 17); c.strokeStyle = rgb(hex('#3f6a4a')); c.lineWidth = 0.8; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  }
  function shelving(c, M, lamp, L) {
    const w = hex(M.wood), x0 = SHELF.x0, x1 = SHELF.x1, H = -134;
    softShadow(c, x0, x1, 0, 30, 0.12);
    for (const y of [Ym(SHELF.ys[0]), Ym(SHELF.ys[1])]) polyP(c, [[x0 + 4, y + 3.5, ROOM.z1], [x1 - 4, y + 3.5, ROOM.z1], [x1 - 4, y + 10, ROOM.z1], [x0 + 4, y + 10, ROOM.z1]]), c.fillStyle = 'rgba(0,0,0,0.22)', c.fill();
    box3(c, x1 - 4, x1, H, 0, 0, 30, scl(w, 0.9), M, lamp); // right side panel (its inner face)
    for (const y of [-6, Ym(SHELF.ys[0]), Ym(SHELF.ys[1])]) box3(c, x0 + 3, x1 - 3, y, y + 3.5, 0, 28, w, M, lamp, { grain: 1, noSide: 1 });
    box3(c, x0 - 1, x1 + 1, H - 3, H, -1, 30, scl(w, 0.95), M, lamp, { noSide: 1 });
    box3(c, x0, x0 + 4, H, 0, 0, 30, scl(w, 0.9), M, lamp); // left panel
    // on the bottom shelf: tins and a jar; on top: a plant
    box3(c, x0 + 12, x0 + 24, -20, -6, 8, 20, hex('#7d8794'), M, lamp); box3(c, x0 + 12, x0 + 24, -16, -12, 8, 8.1, hex('#4673a3'), M, lamp, { noTop: 1, noSide: 1 });
    box3(c, x0 + 28, x0 + 38, -17, -6, 10, 20, hex('#a9906a'), M, lamp);
    box3(c, x1 - 30, x1 - 14, -14, -6, 6, 22, hex('#c99a64'), M, lamp, { grain: 1 });
    { const p0 = P3(x1 - 22, H - 3, 12); box3(c, x1 - 28, x1 - 17, H - 12, H - 3, 8, 18, hex('#b8603e'), M, lamp); c.strokeStyle = rgb(hex(L ? '#5f9a4a' : '#5f8f4a')); c.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = -PI / 2 + (i - 3.5) * 0.4, l = 6 + (i % 3) * 3; c.lineWidth = 1.8; c.beginPath(); c.moveTo(p0[0], p0[1] - 9); c.quadraticCurveTo(p0[0] + Math.cos(a) * l * 0.6, p0[1] - 9 + Math.sin(a) * l * 0.5 - 2, p0[0] + Math.cos(a) * l, p0[1] - 9 + Math.sin(a) * l + (Math.abs(i - 3.5) > 2 ? 9 : 0)); c.stroke(); } c.lineCap = 'butt'; }
  }
  function stoolDraw(c, M, lamp, L) {
    const x = STOOL.x, y = Ym(STOOL.seat) - 1.5, w = hex(M.wood);
    softShadow(c, x - 10, x + 10, -8, 8, 0.12);
    const ring = (r, yy) => { const pts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; pts.push(P3(x + Math.cos(a) * r, yy, Math.sin(a) * r)); } return pts; };
    const leg = (a, f) => { const t = P3(x + Math.cos(a) * 8, y + 2, Math.sin(a) * 8), b = P3(x + Math.cos(a) * 12, 0, Math.sin(a) * 12); c.lineCap = 'round'; c.strokeStyle = 'rgba(30,16,8,0.6)'; c.lineWidth = 3.6; c.beginPath(); c.moveTo(t[0], t[1]); c.lineTo(b[0], b[1]); c.stroke(); c.strokeStyle = rgb(scl(w, f * lightAt([x, -15, 0], [0, 0, -1], M, lamp))); c.lineWidth = 2.6; c.stroke(); c.lineCap = 'butt'; };
    leg(-PI * 0.75, 0.7); leg(-PI * 0.25, 0.75);
    const rg = ring(10, -11); c.strokeStyle = rgb(scl(w, 0.7 * lightAt([x, -11, 0], [0, -1, 0], M, lamp))); c.lineWidth = 1.2; c.beginPath(); rg.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke();
    leg(PI * 0.75, 1); leg(PI * 0.25, 0.92);
    // the seat: a thick round top
    const top = ring(12, y), bot = ring(12, y + 3);
    c.beginPath(); bot.slice(0, 13).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); top.slice(0, 13).reverse().forEach((q) => c.lineTo(q[0], q[1])); c.closePath();
    c.fillStyle = rgb(scl(w, 0.85 * lightAt([x, y + 2, -12], [0, 0, -1], M, lamp))); c.fill(); c.strokeStyle = 'rgba(30,16,8,0.5)'; c.lineWidth = 0.45; c.stroke();
    c.beginPath(); top.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
    const S = P3(x, y, 0); const g = c.createRadialGradient(S[0] - 4, S[1], 0, S[0], S[1], 12); g.addColorStop(0, rgb(scl(w, 1.15 * lightAt([x, y, 0], [0, -1, 0], M, lamp)))); g.addColorStop(1, rgb(scl(w, 0.9 * lightAt([x + 12, y, 0], [0, -1, 0], M, lamp))));
    c.fillStyle = g; c.fill(); c.stroke();
  }
  function crateDraw(c, M, lamp, L) {
    const x0 = CRATE.x - 18, x1 = CRATE.x + 18, w = hex('#c79a64');
    box3(c, x0, x1, -11, 0, -8, 12, scl(w, 0.9), M, lamp, { noTop: 1 });
    polyP(c, [[x0, -11, -8], [x1, -11, -8], [x1, -11, 12], [x0, -11, 12]]); c.fillStyle = 'rgba(30,18,10,0.55)'; c.fill();
    c.strokeStyle = 'rgba(40,22,10,0.5)'; c.lineWidth = 0.5; c.beginPath();
    { const a = P3(x0, -5.5, -8), b = P3(x1, -5.5, -8); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
  }
  /** The whole diorama at one lamp level. */
  function paintRoom(V, w, h, dpr, L, lamp) {
    const [cv, c] = SceneKit.layer(w, h, dpr);
    const M = L ? MAT.L : MAT.D;
    c.save(); c.translate(V.ox, V.oy); c.scale(V.k, V.k); c.lineJoin = 'round';
    room(c, M, lamp, L);
    wallThings(c, M, lamp, L);
    benchDraw(c, M, lamp, L);
    shelving(c, M, lamp, L);
    stoolDraw(c, M, lamp, L);
    crateDraw(c, M, lamp, L);
    c.restore();
    // a miniature seen close up: the far wall tops and the near edge are a little out of focus
    const q = cv.width / w, Y = (y) => (V.oy + y * V.k) * q;
    if (!V.pv) {
      const b = mk(cv.width, cv.height), bc = b.getContext('2d');
      bc.filter = `blur(${(1.3 * V.k * q).toFixed(2)}px)`; bc.drawImage(cv, 0, 0); bc.filter = 'none';
      bc.globalCompositeOperation = 'destination-in';
      const g = bc.createLinearGradient(0, Y(-195), 0, Y(60));
      const st = (y) => clamp((y + 195) / 255, 0, 1);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(st(-120), 'rgba(0,0,0,0)'); g.addColorStop(st(20), 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      bc.fillStyle = g; bc.fillRect(0, 0, b.width, b.height);
      c.drawImage(b, 0, 0);
    }
    // the edges of the model fade into the theme: up the walls, toward the near edge, and at both ends
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-in';
    const X = (x) => (V.ox + x * V.k) * q;
    const gv = c.createLinearGradient(0, Y(-196), 0, Y(62));
    const at = (y) => clamp((y + 196) / 258, 0, 1);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(at(-150), 'rgba(0,0,0,0.55)'); gv.addColorStop(at(-112), 'rgba(0,0,0,1)'); gv.addColorStop(at(16), 'rgba(0,0,0,1)'); gv.addColorStop(at(40), 'rgba(0,0,0,0.5)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gv; c.fillRect(0, 0, cv.width, cv.height);
    const gh = c.createLinearGradient(X(-262), 0, X(262), 0), ah = (x) => clamp((x + 262) / 524, 0, 1);
    gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(ah(-228), 'rgba(0,0,0,0.12)'); gh.addColorStop(ah(-186), 'rgba(0,0,0,0.6)'); gh.addColorStop(ah(-140), 'rgba(0,0,0,1)'); gh.addColorStop(ah(180), 'rgba(0,0,0,1)'); gh.addColorStop(ah(222), 'rgba(0,0,0,0.4)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gh; c.fillRect(0, 0, cv.width, cv.height);
    c.restore();
    return cv;
  }

  /* ---------- sprites made once per size ---------- */
  function sprites(V, dpr, L) {
    const s = V.k * dpr, S = {};
    const cw = 240, chh = 150, cv = mk(cw * s * 0.5, chh * s * 0.5), c = cv.getContext('2d');
    c.scale(s * 0.5, s * 0.5);
    for (let y = 0; y < chh; y += 2) {
      const hw = 9 + y * 0.6, a = (L ? 0.1 : 0.15) * Math.pow(1 - y / chh, 1.1) * (0.4 + 0.6 * Math.min(1, y / 10));
      const g = c.createLinearGradient(cw / 2 - hw, 0, cw / 2 + hw, 0), col = L ? '255,196,110' : '255,206,140';
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.2, `rgba(${col},${a * 0.55})`); g.addColorStop(0.5, `rgba(${col},${a})`); g.addColorStop(0.8, `rgba(${col},${a * 0.55})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(cw / 2 - hw, y, hw * 2, 2);
    }
    S.cone = cv; S.cw = cw; S.ch = chh;
    const blob = (stops) => { const b = mk(64, 64), bc = b.getContext('2d'), g = bc.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [o, col] of stops) g.addColorStop(o, col); bc.fillStyle = g; bc.fillRect(0, 0, 64, 64); return b; };
    S.blob = blob(L ? [[0, 'rgba(150,110,70,0.9)'], [0.4, 'rgba(150,110,70,0.4)'], [1, 'rgba(150,110,70,0)']] : [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    S.shadow = blob([[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    S.bloom = blob([[0, 'rgba(255,236,190,1)'], [0.2, 'rgba(255,200,120,0.5)'], [1, 'rgba(255,170,90,0)']]);
    return S;
  }
  /** The window's sky at this hour of the day: night, dawn, day, dusk. */
  function skySprite(k, dpr, L) {
    const W0 = WIN.x1 - WIN.x0, H0 = WIN.y0 - WIN.y1, s = k * dpr, cv = mk(W0 * s, H0 * s), c = cv.getContext('2d');
    c.scale(s, s);
    const d = new Date(), hr = d.getHours() + d.getMinutes() / 60;
    const day = clamp(Math.min((hr - 5.6) / 1.4, (19.2 - hr) / 1.4), 0, 1), dusk = Math.max(clamp(1 - Math.abs(hr - 18.6) / 1.3, 0, 1), clamp(1 - Math.abs(hr - 6.1) / 1.1, 0, 1) * 0.8);
    const mixc = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
    let top = mixc(L ? [58, 76, 120] : [14, 24, 48], L ? [120, 170, 220] : [86, 140, 196], day), bot = mixc(L ? [90, 104, 150] : [26, 40, 72], L ? [190, 220, 240] : [160, 200, 228], day);
    top = mixc(top, [92, 84, 140], dusk * 0.6); bot = mixc(bot, [240, 160, 110], dusk * 0.8);
    const g = c.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    c.fillStyle = g; c.fillRect(0, 0, W0, H0);
    const R = SceneKit.rng(((hr * 7) | 0) + 3);
    if (day < 0.5) {
      c.fillStyle = `rgba(255,250,230,${0.8 * (1 - day * 2)})`;
      for (let i = 0; i < 14; i++) c.fillRect(R() * W0, R() * H0 * 0.7, 0.5 + R() * 0.5, 0.5 + R() * 0.5);
      c.beginPath(); c.arc(W0 * 0.72, H0 * 0.28, 4, 0, TAU); c.fillStyle = `rgba(250,244,220,${0.9 * (1 - day * 2)})`; c.fill();
      c.beginPath(); c.arc(W0 * 0.72 + 1.8, H0 * 0.28 - 1, 3.6, 0, TAU); c.fillStyle = rgb(top); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [x, y, r] of [[0.25, 0.35, 5], [0.36, 0.3, 6], [0.47, 0.36, 4.5], [0.7, 0.55, 3.5], [0.78, 0.5, 4.2]]) { c.beginPath(); c.arc(W0 * x, H0 * y, r, 0, TAU); c.fill(); }
    }
    // a tree line far off
    c.fillStyle = L ? 'rgba(60,80,70,0.5)' : 'rgba(8,14,12,0.75)';
    c.beginPath(); c.moveTo(0, H0); for (let x = 0; x <= W0; x += 3) c.lineTo(x, H0 - 6 - Math.sin(x * 0.4) * 2 - R() * 3); c.lineTo(W0, H0); c.fill();
    cv.day = day;
    return cv;
  }

  /* ---------- drawing a frame ---------- */
  const BOX = { x0: -260, x1: 280, y0: -300, y1: 90 }; // the part of his plane where anything moves
  function render(W, ctx, V, L, dpr, w, h) {
    const k = V.k, S = W.spr, lv = clamp(W.lampLv, 0, 1.4), M = L ? MAT.L : MAT.D;
    LN = L ? LINE.L : LINE.D;
    ctx.drawImage(W.statD, 0, 0, w, h);
    if (W.statB) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = clamp(lv, 0, 1); ctx.drawImage(W.statB, 0, 0, w, h); ctx.restore(); }
    const zw = ROOM.z1 - 0.6;
    ctx.save(); ctx.translate(V.ox, V.oy); ctx.scale(k, k);
    // the window: this hour's sky, and by day a little light on the floor
    if (!W.sky || W.t > W.skyAt) { W.sky = skySprite(k, dpr, L); W.skyAt = W.t + 60; }
    ctx.save(); onPlane(ctx, zw);
    ctx.globalAlpha = L ? 0.9 : 0.8; ctx.drawImage(W.sky, WIN.x0, WIN.y1, WIN.x1 - WIN.x0, WIN.y0 - WIN.y1); ctx.globalAlpha = 1;
    ctx.fillStyle = rgb(scl(hex(M.dark), lightAt([64, -120, 30], [0, 0, -1], M, lv) * 1.1));
    ctx.fillRect((WIN.x0 + WIN.x1) / 2 - 1.2, WIN.y1, 2.4, WIN.y0 - WIN.y1); ctx.fillRect(WIN.x0, (WIN.y0 + WIN.y1) / 2 - 1.2, WIN.x1 - WIN.x0, 2.4);
    ctx.restore();
    if (W.sky.day > 0.05 && !V.pv) {
      const a = P3(WIN.x0, 0, ROOM.z1 - 4), b = P3(WIN.x1, 0, ROOM.z1 - 4), c2 = P3(WIN.x1 + 16, 0, ROOM.z1 - 48), d2 = P3(WIN.x0 + 16, 0, ROOM.z1 - 48);
      const g = ctx.createLinearGradient(0, a[1], 0, c2[1]); g.addColorStop(0, `rgba(255,246,220,${(L ? 0.12 : 0.07) * W.sky.day})`); g.addColorStop(1, 'rgba(255,246,220,0)');
      ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // everything that moves goes into one layer, lit by the lamp as a whole
    const s = k * dpr, bw = Math.ceil((BOX.x1 - BOX.x0) * s), bh = Math.ceil((BOX.y1 - BOX.y0) * s);
    if (!W.dl || W.dl.width !== bw || W.dl.height !== bh) { W.dl = mk(bw, bh); W.dlx = W.dl.getContext('2d'); }
    const c = W.dlx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, bw, bh);
    c.setTransform(s, 0, 0, s, -BOX.x0 * s, -BOX.y0 * s); c.lineJoin = 'round';
    // the clock's hands (the second hand ticks)
    { c.save(); onPlane(c, zw); const d = new Date(), sec = d.getSeconds() + Math.min(1, d.getMilliseconds() / 140), mn = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + mn / 60;
      const hand = (a, l, wd, col) => { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(CLOCK.x, CLOCK.y); c.lineTo(CLOCK.x + Math.sin(a) * l, CLOCK.y - Math.cos(a) * l); c.stroke(); };
      c.lineCap = 'round'; hand((hr / 12) * TAU, 4, 1, '#2a2018'); hand((mn / 60) * TAU, 6, 0.7, '#2a2018'); hand((sec / 60) * TAU, 6.4, 0.35, '#c0392b'); c.lineCap = 'butt';
      c.fillStyle = '#2a2018'; c.beginPath(); c.arc(CLOCK.x, CLOCK.y, 0.7, 0, TAU); c.fill(); c.restore(); }
    // the blueprint pinned on the pegboard (it flips to a new sheet for a new piece)
    if (!W.printSpr) W.printSpr = blueprint(W.print || 'birdhouse', k, dpr, L);
    { c.save(); onPlane(c, zw); c.translate(-42, -128); c.rotate(-0.02);
      const fl = W.flip, fy = fl > 0 ? Math.cos(Math.min(1, fl * 2) * PI) : 1;
      c.drawImage(W.printSpr, 0, 0, PRINT.w, PRINT.h);
      if (fl > 0 && fl < 0.5) { c.fillStyle = L ? '#3d6ea4' : '#2f5f93'; c.fillRect(0, 0, PRINT.w, PRINT.h * Math.max(0.02, fy)); }
      c.fillStyle = '#c84a3a'; for (const px of [2, PRINT.w - 2]) { c.beginPath(); c.arc(px, 2, 1, 0, TAU); c.fill(); }
      c.restore(); }
    // tools on the pegboard; the plane and the mug on the bench
    { c.save(); onPlane(c, zw);
      if (W.tool.hammer === 'peg') { c.save(); c.translate(PEG.hammer[0], PEG.hammer[1]); c.rotate(-PI / 2); c.translate(-13, 0); TOOL.hammer(c); c.restore(); }
      c.restore(); }
    if (W.tool.saw === 'hook') { c.save(); c.translate(SAW_HOOK[0], Ym(SAW_HOOK[1])); c.rotate(1.62); TOOL.saw(c); c.restore(); }
    if (W.tool.plane === 'bench') { const q = PLANE_AT(); c.save(); c.translate(q[0], q[1]); c.scale(zf(21), zf(21)); c.scale(-1, 1); TOOL.plane(c); c.restore(); }
    if (W.tool.mug === 'bench') { const q = MUG_AT(); c.save(); c.translate(q[0], q[1]); c.scale(zf(16), zf(16)); TOOL.mug(c); c.restore(); if (Math.random() < 0.06) addP(W, { k: 'steam', rc: 1, x: q[0] + 6, y: q[1] - 11, vx: rnd(-1, 1), vy: -7, life: 1.4, ph: rnd(0, 6) }); }
    // the piece taking shape, and the plank along the front of the bench
    if (W.proj && W.proj.n > 0) { c.save(); c.translate(PIECE_X, TOP - 4.5 + (W.shake ? Math.sin(W.t * 60) * W.shake * 0.25 : 0)); drawPiece(c, W.proj, 1, W.t, false); c.restore(); }
    if (W.plank.len > 0) { const pk = W.plank, py = TOP - 0.5;
      const pg = c.createLinearGradient(0, py - 4, 0, py); pg.addColorStop(0, rgb(scl(hex('#e2bd88'), 1.05))); pg.addColorStop(1, rgb(scl(hex('#c49662'), 0.95)));
      c.fillStyle = pg; c.fillRect(pk.r - pk.len, py - 4, pk.len, 4);
      c.fillStyle = rgb(hex('#a8794a')); c.fillRect(pk.r - 1.2, py - 4, 1.2, 4);
      c.strokeStyle = 'rgba(40,22,12,0.55)'; c.lineWidth = 0.4; c.strokeRect(pk.r - pk.len, py - 4, pk.len, 4);
      c.strokeStyle = 'rgba(30,20,20,0.75)'; c.beginPath(); for (const m of W.marks) { c.moveTo(m, py - 4); c.lineTo(m, py - 1.6); } if (W.cut > 0) { c.moveTo(3, py - 4); c.lineTo(3, py - 4 + W.cut * 4); } c.stroke(); }
    // finished pieces on the shelves, and in the crate once the shelves are full
    W.sprC = W.sprC || {};
    const spr = (id) => W.sprC[id] || (W.sprC[id] = pieceSprite(id, k, dpr));
    for (let i = 0; i < W.shelf.length && i < SLOTS.length; i++) {
      const [x, row] = SLOTS[i], y = Ym(SHELF.ys[row]) - 0.2, it = W.shelf[i], age = W.t - it.at, b = age < 0.5 ? Math.sin(age * TAU * 2) * (1 - age * 2) * 0.8 : 0;
      c.drawImage(spr(it.id), x - 22, y - 36 - b, 44, 40);
    }
    for (let i = Math.max(0, W.crate.length - 4); i < W.crate.length; i++) { const j = i % 4, x = CRATE.x - 10 + j * 7, y = -9 - (j % 2) * 2.5; c.save(); c.translate(x, y); c.rotate((j - 2) * 0.18); c.drawImage(spr(W.crate[i].id), -15.4, -25.2, 30.8, 28); c.restore(); }
    if (W.crate.length) { const a = P3(CRATE.x - 18, -11, -8), b = P3(CRATE.x + 18, -5.5, -8); c.fillStyle = rgb(scl(hex('#c79a64'), 0.8 * clamp(0.5 + lv * 0.5, 0, 1))); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    // the broom against the shelves
    if (W.tool.broom === 'wall') { c.save(); c.translate(BROOM_X - 4, -86); c.rotate(1.5); TOOL.broom(c); c.restore(); }
    // shavings and dust on the floor, and a dropped tool
    for (const d of W.debris) drawBit(c, d, L, true);
    if (W.drop) { const d = W.drop; c.save(); c.translate(d.x, d.y); c.rotate(d.rot); c.scale(1, d.face < 0 ? -1 : 1); TOOL[d.tool](c); c.restore(); }
    // his shadow on the floor
    const p = W.pose, f = p.face * p.sx, J = W.J;
    { const cx = p.x + (W.sitting ? (p.hx * p.face) * 0.5 : 0), sl = (p.x - LP[0]) * 0.06; c.globalAlpha = (L ? 0.22 : 0.42) * (0.6 + 0.4 * lv); c.drawImage(S.shadow, cx - 19 + sl, -3.5, 38, 7); c.globalAlpha = 1; }
    // the figure, with a rim of lamplight
    const fb = { x0: p.x - 70, y0: -175, w: 140, h: 185 }, fw = Math.ceil(fb.w * s), fh = Math.ceil(fb.h * s);
    if (!W.cl || W.cl.width !== fw || W.cl.height !== fh) { W.cl = mk(fw, fh); W.clx = W.cl.getContext('2d'); W.rim = mk(fw, fh); W.rimx = W.rim.getContext('2d'); }
    const fc = W.clx;
    fc.setTransform(1, 0, 0, 1, 0, 0); fc.clearRect(0, 0, fw, fh);
    fc.setTransform(s, 0, 0, s, -fb.x0 * s, -fb.y0 * s); fc.lineJoin = 'round';
    fc.save(); fc.translate(p.x, 0); fc.scale(f, 1);
    const tw = [p.x + J.SN[0] * f, J.SN[1]], lvv = [LP[0] - tw[0], LP[1] - tw[1]], ll = Math.hypot(lvv[0], lvv[1]) || 1;
    Lv = [(lvv[0] / ll) * p.face, lvv[1] / ll];
    drawActor(fc, W);
    fc.restore();
    { const rx = W.rimx, ox = (-lvv[0] / ll) * 1.1 * s, oy = (-lvv[1] / ll) * 1.1 * s;
      rx.setTransform(1, 0, 0, 1, 0, 0); rx.globalCompositeOperation = 'copy'; rx.drawImage(W.cl, 0, 0);
      rx.globalCompositeOperation = 'destination-out'; rx.drawImage(W.cl, ox, oy);
      rx.globalCompositeOperation = 'source-in'; rx.fillStyle = L ? 'rgba(255,238,205,1)' : 'rgba(255,214,156,1)'; rx.fillRect(0, 0, fw, fh);
      fc.save(); fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalCompositeOperation = 'source-atop'; fc.globalAlpha = (L ? 0.3 : 0.55) * clamp(lv, 0.2, 1); fc.drawImage(W.rim, 0, 0); fc.restore(); }
    c.drawImage(W.cl, fb.x0, fb.y0, fb.w, fb.h);
    // the cat in its basket, in front
    { const q = P3(CAT.x, 0, CAT.z), sc = zf(CAT.z); c.save(); c.translate(q[0], q[1]); c.scale(sc, sc); basket(c, false, L); drawCat(c, W.cat, W.t, L); basket(c, true, L); c.restore(); }
    // wood in the air
    for (const q of W.parts) if (!q.rc) drawBit(c, q, L, false, W, S);
    // the lamp's light over all of it: warm near the bulb, dimmer away from it
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop';
    const B = [(LP[0] - BOX.x0) * s, (LP[1] - BOX.y0) * s], lg = c.createRadialGradient(B[0], B[1], 18 * s, B[0], B[1], 230 * s);
    if (L) { lg.addColorStop(0, `rgba(255,214,150,${0.1 * lv})`); lg.addColorStop(0.45, 'rgba(255,214,150,0)'); lg.addColorStop(1, `rgba(70,52,40,${0.12 + 0.14 * (1 - Math.min(1, lv))})`); }
    else { lg.addColorStop(0, `rgba(255,200,130,${0.16 * lv})`); lg.addColorStop(0.4, 'rgba(255,190,120,0)'); lg.addColorStop(1, `rgba(10,7,5,${0.3 + 0.3 * (1 - Math.min(1, lv))})`); }
    c.fillStyle = lg; c.fillRect(0, 0, bw, bh);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(W.dl, V.ox + BOX.x0 * k, V.oy + BOX.y0 * k, (BOX.x1 - BOX.x0) * k, (BOX.y1 - BOX.y0) * k);
    // on top: the lamp, its light in the air, glints, bubbles
    ctx.save(); ctx.translate(V.ox, V.oy); ctx.scale(k, k);
    for (const q of W.parts) if (q.rc) drawBit(ctx, q, L, false, W, S);
    const hd = [p.x + J.head[0] * f, J.head[1]];
    if (W.bubble > 0.01) askBubble(ctx, hd[0] + 7, hd[1] - 22 + Math.sin(W.t * 2.2) * 1, W.bubble, L);
    if (W.bang > 0) { const a = Math.min(1, W.bang * 2), sc = (0.8 + E.back(clamp((1.3 - W.bang * 1.3) * 3, 0, 1)) * 0.4) * 0.8; ctx.save(); ctx.translate(hd[0] + 3 * p.face, hd[1] - 16); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.font = "800 16px 'Segoe UI', sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = L ? 'rgba(255,255,255,0.9)' : 'rgba(30,16,10,0.85)'; ctx.strokeText('!', 0, 0); ctx.fillStyle = L ? '#d0503c' : '#ffcf6a'; ctx.fillText('!', 0, 0); ctx.strokeStyle = L ? 'rgba(200,80,60,0.6)' : 'rgba(255,220,140,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const a2 of [-2.4, -1.9, -1.2, -0.7]) { ctx.moveTo(Math.cos(a2) * 11, Math.sin(a2) * 11 - 5); ctx.lineTo(Math.cos(a2) * 15, Math.sin(a2) * 15 - 5); } ctx.stroke(); ctx.restore(); }
    if (W.glow) { const g = W.t - W.glow.t; if (g > 2.4) W.glow = null; else { const a = Math.sin(Math.min(1, g / 0.25) * PI / 2) * (1 - g / 2.4); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = a * (L ? 0.5 : 0.8); const r = 22 + g * 10; ctx.drawImage(S.bloom, W.glow.x - r, W.glow.y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
    // the lamp: cord, shade, bulb, and the cone of light; it dims while he waits
    ctx.save(); onPlane(ctx, LAMPZ);
    const la = W.lamp.a, top = -320, sx = LP[0] + Math.sin(la) * (LP[1] - top);
    const cg = ctx.createLinearGradient(0, top + 60, 0, LP[1] - 12); cg.addColorStop(0, 'rgba(30,20,14,0)'); cg.addColorStop(1, L ? 'rgba(60,40,30,0.6)' : 'rgba(40,28,20,0.95)');
    ctx.strokeStyle = cg; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(LP[0], top + 60); ctx.lineTo(sx, LP[1] - 12); ctx.stroke();
    ctx.translate(sx, LP[1] - 12); ctx.rotate(-la);
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = clamp(lv, 0, 1.2) * (V.pv ? 0.6 : 1);
    ctx.drawImage(S.cone, -S.cw * 0.45, 12, S.cw * 0.9, S.ch * 0.95);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.lineTo(3, 3); ctx.quadraticCurveTo(12, 4.5, 14, 12); ctx.lineTo(-14, 12); ctx.quadraticCurveTo(-12, 4.5, -3, 3); ctx.closePath();
    const lg2 = ctx.createLinearGradient(-14, 0, 14, 0); lg2.addColorStop(0, L ? '#5d7a6a' : '#3d5a4e'); lg2.addColorStop(0.4, L ? '#8fb09c' : '#6f9482'); lg2.addColorStop(1, L ? '#3e584c' : '#24382f');
    ctx.fillStyle = lg2; ctx.fill(); ctx.strokeStyle = 'rgba(20,14,10,0.7)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.fillStyle = `rgba(255,238,196,${0.35 + 0.6 * clamp(lv, 0, 1)})`; ctx.beginPath(); ctx.ellipse(0, 12, 13.6, 1.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,248,224,${0.5 + 0.5 * clamp(lv, 0, 1)})`; ctx.beginPath(); ctx.arc(0, 11, 3, 0, PI); ctx.fill();
    if (!L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * clamp(lv, 0, 1.2); ctx.drawImage(S.bloom, -30, -16, 60, 54); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    // sawdust turning in the light
    if (!V.pv) {
      ctx.save(); onPlane(ctx, LAMPZ); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
      for (const m of W.motes) {
        const dy = m.y - (LP[1]); if (dy < 0) continue;
        const hw = 9 + dy * 0.6, inC = 1 - Math.abs(m.x - sx) / hw;
        if (inC <= 0) continue;
        const a = inC * (0.25 + 0.4 * Math.sin(W.t * 1.3 + m.ph)) * (1 - dy / 150) * clamp(lv, 0, 1) * (0.35 + 0.9 * W.dust);
        if (a <= 0.01) continue;
        ctx.fillStyle = L ? `rgba(150,105,50,${a * 0.7})` : `rgba(255,236,200,${a})`;
        ctx.fillRect(m.x - 0.4, m.y - 0.4, 0.8, 0.8);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  /** The cat's wicker basket: its back half behind the cat, its front over it. */
  function basket(c, front, L) {
    const wk = L ? ['#e2c08a', '#c49a5e', '#8a6636'] : ['#d6b07a', '#a8804c', '#5e4424'];
    if (!front) {
      c.beginPath(); c.ellipse(0, -4, 14, 4.2, 0, PI, TAU); c.lineTo(14, 0); c.ellipse(0, 0, 14, 4.2, 0, 0, PI); c.closePath();
      c.fillStyle = wk[2]; c.fill();
      c.beginPath(); c.ellipse(0, -3.6, 12, 3.2, 0, 0, TAU); c.fillStyle = L ? '#b8574a' : '#8e3c32'; c.fill();
      return;
    }
    c.beginPath(); c.moveTo(-14, -4); c.ellipse(0, -4, 14, 4.2, 0, PI, 0, true); c.lineTo(13.4, 1); c.ellipse(0, 1, 13.4, 3.6, 0, 0, PI); c.closePath();
    const g = c.createLinearGradient(-14, 0, 14, 0); g.addColorStop(0, wk[0]); g.addColorStop(0.6, wk[1]); g.addColorStop(1, wk[2]);
    c.fillStyle = g; c.fill(); c.lineWidth = 0.6; c.strokeStyle = LN; c.stroke();
    c.strokeStyle = 'rgba(70,44,18,0.4)'; c.lineWidth = 0.4; c.beginPath();
    for (let x = -12; x <= 12; x += 2.4) { const y0 = -4 + 4.2 * Math.sqrt(Math.max(0, 1 - (x / 14) ** 2)), y1 = 1 + 3.6 * Math.sqrt(Math.max(0, 1 - (x / 13.4) ** 2)); c.moveTo(x, y0); c.lineTo(x, y1); }
    c.stroke();
    c.beginPath(); c.ellipse(0, -4, 14, 4.2, 0, 0, PI); c.lineWidth = 1.4; c.strokeStyle = wk[0]; c.stroke();
  }
  function askBubble(ctx, x, y, a, L) {
    const s = 0.4 + E.back(clamp(a, 0, 1)) * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = clamp(a * 1.4, 0, 1);
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 10, 0, 0, TAU); ctx.moveTo(-5, 8); ctx.lineTo(-9, 15); ctx.lineTo(-1, 9.5);
    ctx.fillStyle = L ? 'rgba(255,253,246,0.97)' : 'rgba(250,242,226,0.95)'; ctx.fill();
    ctx.lineWidth = 1.1; ctx.strokeStyle = L ? 'rgba(90,60,40,0.75)' : 'rgba(40,24,14,0.9)'; ctx.stroke();
    ctx.font = "800 14px 'Segoe UI', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = L ? '#c0503a' : '#b9503a'; ctx.fillText('?', 0, 0.8);
    ctx.restore();
  }
  function drawBit(ctx, d, L, onFloor, W, S) {
    if (!d.rc) d = Object.assign({}, d, { y: Ym(d.y) });
    const wood = L ? '#b98d5a' : '#d9b07a';
    switch (d.k) {
      case 'dust': ctx.fillStyle = onFloor ? (L ? 'rgba(170,130,80,0.75)' : 'rgba(214,176,120,0.7)') : (L ? 'rgba(180,140,90,0.8)' : 'rgba(236,200,140,0.8)'); ctx.fillRect(d.x - 0.6, d.y - 0.6, 1.2, 1.2); break;
      case 'chip': ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.fillStyle = wood; ctx.fillRect(-1.2, -0.6, 2.4, 1.2); ctx.restore(); break;
      case 'off': { const wd = Math.max(2, d.w || 4); ctx.save(); ctx.translate(d.x, d.y - (onFloor ? 2 : 0)); ctx.rotate(onFloor ? Math.round(d.rot / (PI / 2)) * (PI / 2) * 0 + 0.05 : d.rot); ctx.fillStyle = rgb(hex('#d6ad78')); ctx.fillRect(-wd / 2, -2, wd, 4); ctx.strokeStyle = 'rgba(40,22,12,0.5)'; ctx.lineWidth = 0.4; ctx.strokeRect(-wd / 2, -2, wd, 4); ctx.restore(); break; }
      case 'shave': { ctx.save(); ctx.translate(d.x, d.y - (onFloor ? 1.4 : 0)); ctx.rotate(d.rot); ctx.scale(d.s || 1, d.s || 1); ctx.strokeStyle = L ? '#c9995e' : '#efc98e'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0.3, 5.6); ctx.stroke(); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0.6, 0.2, 1.2, 1, 6); ctx.stroke(); ctx.restore(); break; }
      case 'puff': { const k = d.age / d.life, r = d.r * (1 + k * 1.6); ctx.globalAlpha = (1 - k) * (L ? 0.3 : 0.32); ctx.drawImage(S.blob, d.x - r, d.y - r, r * 2, r * 2); if (L) { ctx.globalCompositeOperation = 'source-atop'; } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break; }
      case 'breath': { const k = d.age / d.life, r = 2 + k * 5; ctx.globalAlpha = (1 - k) * 0.25; ctx.drawImage(S.blob, d.x - r, d.y - r, r * 2, r * 2); ctx.globalAlpha = 1; break; }
      case 'steam': { const k = d.age / d.life; ctx.strokeStyle = L ? `rgba(150,130,120,${(1 - k) * 0.35})` : `rgba(255,246,230,${(1 - k) * 0.3})`; ctx.lineWidth = 0.8 + k; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + Math.sin(d.ph + k * 5) * 2.5, d.y - 2, d.x + Math.sin(d.ph + k * 7) * 1.5, d.y - 4); ctx.stroke(); break; }
      case 'drop': { const k = d.age / d.life; ctx.fillStyle = L ? `rgba(90,150,200,${1 - k})` : `rgba(190,225,255,${(1 - k) * 0.9})`; ctx.beginPath(); ctx.ellipse(d.x, d.y, 0.8, 1.2, 0, 0, TAU); ctx.fill(); break; }
      case 'spark': { const k = clamp((d.age - (d.d || 0)) / d.life, 0, 1), r = (d.r2 || 2) * Math.sin(k * PI); ctx.fillStyle = L ? `rgba(230,170,60,${1 - k})` : `rgba(255,244,210,${1 - k * 0.6})`; ctx.beginPath(); ctx.moveTo(d.x, d.y - r); ctx.lineTo(d.x + r * 0.22, d.y - r * 0.22); ctx.lineTo(d.x + r, d.y); ctx.lineTo(d.x + r * 0.22, d.y + r * 0.22); ctx.lineTo(d.x, d.y + r); ctx.lineTo(d.x - r * 0.22, d.y + r * 0.22); ctx.lineTo(d.x - r, d.y); ctx.lineTo(d.x - r * 0.22, d.y - r * 0.22); ctx.closePath(); ctx.fill(); break; }
      case 'z': { const k = d.age / d.life, s = (0.7 + k * 0.7) * d.s; ctx.save(); ctx.translate(d.x + Math.sin(d.age * 2.2) * 2.5, d.y); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, k * 4) * (1 - k); ctx.font = "italic 800 11px 'Segoe UI', sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 2.2; ctx.strokeStyle = L ? 'rgba(255,255,255,0.8)' : 'rgba(30,20,30,0.6)'; ctx.strokeText('z', 0, 0); ctx.fillStyle = L ? '#6a7fb0' : '#d8e2ff'; ctx.fillText('z', 0, 0); ctx.restore(); break; }
      case 'note': { const k = d.age / d.life, s = d.s; ctx.save(); ctx.translate(d.x + Math.sin(d.age * 3 + d.ph) * 2, d.y); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, k * 5) * (1 - k); ctx.fillStyle = L ? '#7a5a40' : '#ffe2a8'; ctx.beginPath(); ctx.ellipse(0, 0, 1.8, 1.3, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(1.2, -7, 0.7, 7); ctx.beginPath(); ctx.moveTo(1.9, -7); ctx.quadraticCurveTo(4.5, -5.5, 3.6, -3.2); ctx.lineTo(1.9, -5.2); ctx.fill(); ctx.restore(); break; }
      default: break;
    }
  }

  /* ---------- sound: recordings when they are there, a soft synthesized stand-in until then ---------- */
  const CLIPS = { ac: null, st: {}, buf: {}, at: {} };
  function clipBuf(name) {
    const ac = AMB.ctx;
    if (CLIPS.ac !== ac) Object.assign(CLIPS, { ac, st: {}, buf: {}, at: {} });
    const st = CLIPS.st[name];
    if (!st || (st === 'failed' && performance.now() - CLIPS.at[name] > 60000)) { // not there yet: look again in a minute
      CLIPS.st[name] = 'loading'; CLIPS.at[name] = performance.now();
      fetch('ambient/' + name + '.ogg').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((b) => ac.decodeAudioData(b)).then((buf) => { if (CLIPS.ac === ac) { CLIPS.buf[name] = buf; CLIPS.st[name] = 'ok'; } })
        .catch(() => { if (CLIPS.ac === ac) { CLIPS.st[name] = 'failed'; CLIPS.at[name] = performance.now(); } });
    }
    return CLIPS.st[name] === 'ok' ? CLIPS.buf[name] : null;
  }
  const audible = () => typeof AMB !== 'undefined' && AMB.ctx && AMB.master && typeof ambVolume === 'function' && ambVolume() > 0 && AMB.ctx.state === 'running';
  let noiseBuf = null;
  function noise(ac) {
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  function out(ac, pan, gain) { const g = ac.createGain(), p = ac.createStereoPanner(); g.gain.value = gain; p.pan.value = pan; g.connect(p); p.connect(AMB.master); return [g, p]; }
  function playClip(buf, pan, gain, rate, offset = 0) {
    const ac = AMB.ctx, [g, p] = out(ac, pan, gain), s = ac.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate; s.connect(g); s.start(ac.currentTime + 0.003, offset);
    s.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
  }
  function noiseHit(pan, gain, type, f, q, dur, attack = 0.002, am = 0) {
    const ac = AMB.ctx, t0 = ac.currentTime + 0.003, [g, p] = out(ac, pan, 1), n = ac.createBufferSource(), bp = ac.createBiquadFilter(), e = ac.createGain();
    n.buffer = noise(ac); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(gain, t0 + attack); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp); bp.connect(e);
    if (am) { const m = ac.createGain(), o = ac.createOscillator(), od = ac.createGain(); o.frequency.value = am; od.gain.value = 0.5; m.gain.value = 0.5; o.connect(od); od.connect(m.gain); e.connect(m); m.connect(g); o.start(t0); o.stop(t0 + dur + 0.05); } else e.connect(g);
    n.start(t0, Math.random() * 0.5, dur + 0.05);
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, (dur + 0.4) * 1000);
  }
  function tone(pan, gain, f0, f1, dur) {
    const ac = AMB.ctx, t0 = ac.currentTime + 0.003, [g, p] = out(ac, pan, 1), o = ac.createOscillator(), e = ac.createGain();
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(gain, t0 + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, (dur + 0.4) * 1000);
  }
  function sound(W, V, w) {
    const seen = new Set();
    for (const s of W.snd) {
      if (seen.has(s.k)) continue;
      seen.add(s.k);
      const pan = clamp(((V.ox + s.x * V.k) / w - 0.5) * 1.6, -0.85, 0.85), r = (a) => 1 + (Math.random() - 0.5) * 2 * a;
      if (s.k === 'hammer') {
        const b = clipBuf('worker-hammer');
        if (b) playClip(b, pan, 0.5 * (s.g || 1) * r(0.1), r(0.05) * (s.g < 0.6 ? 1.07 : 1));
        else { noiseHit(pan, 0.16 * (s.g || 1), 'bandpass', 1700 * r(0.08), 1.4, 0.07); tone(pan, 0.12 * (s.g || 1), 210 * r(0.06), 120, 0.11); }
      } else if (s.k === 'saw') {
        const b = clipBuf('worker-saw');
        if (b) playClip(b, pan, 0.36 * r(0.1), 0.92 * r(0.04), 0.04);
        else noiseHit(pan, 0.035, 'bandpass', 2600 * r(0.1), 1.1, 0.3, 0.09, 38);
      } else if (s.k === 'snore') {
        const b = clipBuf('worker-snore');
        if (b) playClip(b, pan, 0.16 * r(0.1), r(0.04));
        else noiseHit(pan, 0.014, 'lowpass', 420, 0.8, 1.3, 0.55, 26);
      } else if (s.k === 'plane') noiseHit(pan, 0.018, 'bandpass', 4200 * r(0.1), 0.9, 0.42, 0.08);
      else if (s.k === 'drop') { const b = clipBuf('worker-hammer'); if (b) playClip(b, pan, 0.3, 0.78); else noiseHit(pan, 0.06, 'bandpass', 900, 1.6, 0.08); }
      else if (s.k === 'clack') { noiseHit(pan, 0.06, 'bandpass', 1300 * r(0.1), 2, 0.05); tone(pan, 0.04, 380, 260, 0.06); }
      else if (s.k === 'place') { noiseHit(pan, 0.05, 'bandpass', 900, 1.6, 0.06); tone(pan, 0.05, 260, 200, 0.08); }
      else if (s.k === 'zip') noiseHit(pan, 0.02, 'bandpass', 3000, 2, 0.22, 0.02, 90);
      else if (s.k === 'page') noiseHit(pan, 0.012, 'highpass', 2500, 0.7, 0.25, 0.05);
      else if (s.k === 'sweep') noiseHit(pan, 0.014, 'bandpass', 3400, 0.8, 0.32, 0.1);
    }
    W.snd.length = 0;
  }

  /* ---------- the background ---------- */
  function frame(bg, ctx, w, h) {
    const t0 = performance.now();
    const L = typeof isLight === 'function' && isLight(), dpr = bg.dpr || 1, pv = h < 90;
    const real = bg.canvas.classList.contains('bg-layer');
    let W = bg.wk;
    if (!W || W.kind !== 'worker') W = bg.wk = newWorld(real);
    const V = layout(w, h, pv);
    const key = `${w}x${h}@${dpr}${L ? 'L' : 'D'}`;
    let built = 0;
    if (W.key !== key) { built = 1; W.key = key; W.V = V; W.statD = paintRoom(V, w, h, dpr, L, 0.28); W.statB = null; W.spr = sprites(V, dpr, L); W.sprC = {}; W.printSpr = null; W.cl = null; W.sky = null; }
    else if (!W.statB) { built = 1; W.statB = paintRoom(V, w, h, dpr, L, 1); } // the lamp at full: one frame later, so no frame does both
    if (real) poll(W);
    simulate(W);
    render(W, ctx, W.V, L, dpr, w, h);
    if (real && audible()) { if (!W.pre) { W.pre = 1; for (const n of ['worker-hammer', 'worker-saw', 'worker-snore']) clipBuf(n); } sound(W, W.V, w); }
    W.snd.length = 0;
    W.ms = performance.now() - t0;
    if (built) W.buildMs = W.ms; else { const pf = W.pf || (W.pf = { n: 0, sum: 0, max: 0 }); pf.n++; pf.sum += W.ms; pf.max = Math.max(pf.max, W.ms); }
  }
  (window.BG_EXT = window.BG_EXT || {}).worker = frame;
  // the picker's still: the hammer up at the top of its swing
  (window.BG_PV_STILL = window.BG_PV_STILL || {}).worker = (bg) => {
    const W = bg.wk;
    if (!W) return 0;
    for (let i = 0; i < 300; i++) { if (W.act && W.act.name === 'hammer' && W.pose.fa > -1.25 && W.pose.fa < -0.55 && W.pose.fy < -76) break; simulate(W); }
    if (!W.statB) W.statB = paintRoom(W.V, bg.w, bg.h, bg.dpr || 1, typeof isLight === 'function' && isLight(), 1);
    return 1;
  };
})();
