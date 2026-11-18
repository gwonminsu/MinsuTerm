'use strict';
/*
 * 백룸 — the Skin-Stealer (an override of scenes/backrooms.js: see the comment above EV there).
 *
 * Something too tall for these rooms, wearing a person. The borrowed skin is loose: it sags in folds at the elbows,
 * the knees, the neck and the belly and wrinkles where what is underneath moves differently; down the back it is
 * gathered in a long puckered ridge, as if it had been pulled on. The face is stretched long and sits a little off
 * the head: the eyeholes are not over each other, the mouth is pulled far too wide, and a second face pushes up
 * faintly under the first. The arms hang to the knees, the fingers are too long and have a joint too many.
 *
 * How it is made: every part (thigh, shin, foot, abdomen, chest and their backs, neck, head, the faces, upper arm,
 * forearm, hands, a finger, a bulge) is baked once per size bucket and light / dark mode, pixel by pixel, a few
 * milliseconds a frame when a visit starts. A part is a height field (the round of a limb, folds and their creases,
 * ribs, tendons, the spine, the features) lit by the tubes overhead with a soft waxy wrap, a little warmth where the
 * light goes into the skin and a cold rim, mottled, veined and darker toward the feet. Each frame the parts are posed
 * (rotated, stretched, mirrored) into a small offscreen picture of the whole figure at the size it is on screen,
 * darkened to the light of its room, then worn into the scene and laid in: overlaps never double up and nearer walls
 * (drawn later) cover it, with its shadow thrown long across the carpet from the tube of its room. The outline crawls:
 * every part breathes on its own and lumps move under the skin. It moves like stop-motion (its own clock holds and
 * jumps, poses advance in jerks, twitches snap and hold), and when it jerks the tape loses hold of it: a torn line
 * through it, its colours split off sideways, the tracking band sent up through it.
 *
 * Each way of showing up has its moment close to us (2.5-5 m, a figure 250-550 px tall at 1280 x 800), and the lights
 * stutter at it (BG.st.entityNow = 'skinstealer:<name>'; a random visit is never the same one twice running):
 *   jamb   behind the wall beside the nearest doorway, half of it in the opening and its head up behind the lintel: its
 *          fingers come round the frame one by one and lie on our side of the wall, drumming out of time; it leans out
 *          in jerks, much too far, the neck still going after the body has stopped, the face held level and staring,
 *          then tilted past where a head goes, and it is gone in a jerk (a torn line, our tube stuttering).
 *   light  far down the hall under a tube that has just died, standing too still; at each dip of the lights it is
 *          nearer, waving, too slowly, the hand flopping at the wrist, at last close under a tube that buzzes and drops
 *          out; its head tilts past friendly and snaps back, its mouth opens.
 *   turn   close down the hall with its back to us, the skin gathered down its spine and crawling over its shoulders;
 *          it turns round in held steps, and the face comes a moment late: the head is bare, then the face slides round
 *          onto it, overshoots, slips back and settles crooked; the mouth opens.
 *   crawl  something scuttles sideways out from behind a jamb on all fours, its arms with a joint too many, facing us,
 *          the head held still up on its long neck while the body jerks along under it; it comes through the doorway at
 *          us and stands up, in jerks, taller than the door behind it.
 *   twin   a man in a red jumper walks past a far doorway; in the nearest one the same man is standing, too still. That
 *          one is too tall, its jumper and sleeves and trouser legs too short on it, its feet bare; when the first has
 *          gone it is still there, its head tilting in jerks and its face sliding down, until the head snaps over.
 * A random visit never shows the same one twice running.
 */
(function () {
  const TAU = Math.PI * 2;
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const c1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const bump = (a, b, c, v) => ss(a, b, v) * (1 - ss(b, c, v));
  const sq = (v) => (v > 0 ? Math.sqrt(v) : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const smin = (a, b, k) => { const h = cl(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };

  // ---- value noise in metres on the body (seeded: the same blotches every time)
  const RV = new Float32Array(256), PM = new Uint8Array(512);
  {
    let s = 20251119;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PM[i] = p[i & 255];
    for (let i = 0; i < 256; i++) RV[i] = r();
  }
  function vn(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y);
    let fx = x - xf, fy = y - yf;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i0 = xf & 255, j0 = yf & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
    const a = RV[PM[PM[i0] + j0]], b = RV[PM[PM[i1] + j0]], c = RV[PM[PM[i0] + j1]], d = RV[PM[PM[i1] + j1]];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, o) { let v = 0, a = 0.5, t = 0; for (let k = 0; k < o; k++) { v += vn(x, y) * a; t += a; x = x * 2.07 + 13.7; y = y * 2.07 + 7.1; a *= 0.5; } return v / t; }
  /** A smooth curve through (y, w) pairs (Catmull-Rom), for outlines given as half-widths up a body. */
  function curve(pts) {
    const n = pts.length / 2, ys = [], ws = [];
    for (let i = 0; i < n; i++) { ys.push(pts[2 * i]); ws.push(pts[2 * i + 1]); }
    return (y) => {
      if (y <= ys[0]) return ws[0];
      if (y >= ys[n - 1]) return ws[n - 1];
      let i = 1; while (ys[i] < y) i++;
      const t = (y - ys[i - 1]) / (ys[i] - ys[i - 1]), p0 = ws[Math.max(0, i - 2)], p1 = ws[i - 1], p2 = ws[i], p3 = ws[Math.min(n - 1, i + 1)];
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    };
  }
  let ST = 0; // where along the last segment sdist() found the nearest point (0..1)
  function sdist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-12);
    t = t < 0 ? 0 : t > 1 ? 1 : t; ST = t;
    const qx = px - ax - dx * t, qy = py - ay - dy * t; return Math.sqrt(qx * qx + qy * qy);
  }
  const ell = (x, y, cx, cy, rx, ry, rot) => { const c = Math.cos(rot || 0), s = Math.sin(rot || 0), dx = x - cx, dy = y - cy, u = dx * c + dy * s, w = -dx * s + dy * c; return (Math.hypot(u / rx, w / ry) - 1) * Math.min(rx, ry); };
  /** Detail finer than a few pixels at this size fades out instead of shimmering. */
  const fine = (b, lam) => ss(2.4, 5, lam * b);

  // ---- what the parts are made of: the borrowed skin, the face, holes, nails, hair, a wet eye, the shade of an edge,
  // cloth, the dark wrong thing under the skin where it does not cover, lips
  const SKIN = 0, FACE = 1, VOID = 2, NAIL = 3, HAIR = 4, WET = 5, HALO = 6, CLOTH = 7, FRAME = 8, LIP = 9;

  /** Wrinkles: short creases (u along them, v across them, dens per metre), wavy and broken, each running only part way. 0..1 how deep one is here. */
  function wrinkle(u, v, dens, b) {
    const w = v * dens + 2.2 * vn(u * 9 + 3.3, v * 5) + 0.6 * vn(u * 30, v * 18 + 1.1), n = Math.floor(w), f = w - n;
    return Math.exp(-(((f - 0.5) / 0.2) ** 2)) * ss(0.3, 0.62, vn(u * 14 + n * 3.1, n * 7.7 + 0.5)) * fine(b, 2 / dens);
  }
  /** Put a wrinkle field into o: a groove with its shade, k how strongly. */
  const crease = (o, wr, k) => { if (wr > 0.001) { o.ao *= 1 - 0.42 * k * wr; o.h -= 0.003 * k * wr; } };
  /** A pouch of loose skin hanging off a limb between v0 and v1 (side: +1 / -1 one side, 0 both), heaviest at the bottom. 0..1; shades the crease under it. */
  function pouch(v, x, side, v0, v1, o) {
    if (side && Math.sign(x || 1) !== side) return 0;
    const p = ss(v0, v1, v) ** 1.4 * (1 - ss(v1, v1 + 0.04, v));
    o.ao *= 1 - 0.45 * Math.exp(-(((v - v1 - 0.035) / 0.022) ** 2)) * (side ? 1 : 0.8);
    return p;
  }
  /** A limb hanging from (0, 0) to (0, -len), radius r here: how far outside (o.d) and how far it stands toward us (o.h). */
  function tube(x, y, len, r, o) {
    const ay = y > 0 ? 0 : y < -len ? -len : y, dy = y - ay, d2 = x * x + dy * dy;
    o.d = Math.sqrt(d2) - r; o.h = r * r > d2 ? Math.sqrt(r * r - d2) : 0;
  }
  /** Where the skin is too short: below v0 the thing under it shows, thinner, dark; the skin's edge curls. Returns the radius to use. */
  function short(v, v0, r, rf, x, y, o, b) {
    const e = v0 + 0.012 * (vn(x * 90, 4.4) - 0.5); // a ragged edge
    if (v > e) { o.m = FRAME; return rf; }
    o.h += 0.003 * Math.exp(-(((v - e + 0.006) / 0.005) ** 2)); o.ao *= 1 - 0.3 * Math.exp(-(((v - e + 0.012) / 0.006) ** 2)); // the lip of it, rolled
    return r;
  }

  // ---- the skeleton (metres from the floor between its feet; x to the right, y up)
  const LUA = 0.56, LFA = 0.52, LTH = 0.53, LSH = 0.55, NECK = 0.3, ABL = 0.36, CHL = 0.46, SHX = 0.162, SHY = 0.37, HIPW = 0.072;

  // ---- the parts. x0..x1, y0..y1: what the sprite covers (metres, the part's joint at 0, 0); yN: how high that joint
  // stands when it is upright (the feet are darker); nx, ny: where on the noise it lies; len: its length along its axis.
  const PART = {};
  PART.thigh = { x0: -0.09, x1: 0.09, y0: -0.6, y1: 0.075, yN: 1.14, nx: 3.1, ny: 0.7, len: LTH, shape(x, y, o, b) {
    const v = cl(-y / LTH); let r = 0.06 - 0.016 * v + 0.003 * Math.sin(v * 3);
    const bag = pouch(v, x, 0, 0.72, 0.95, o); // the skin of the thigh slipping down onto the knee
    r += 0.011 * bag * (0.7 + 0.6 * vn(x * 30, 1.7));
    tube(x, y, LTH, r, o);
    const hk = o.h / r;
    o.h += 0.012 * bag * hk;
    crease(o, wrinkle(x, y, 70, b), ss(0.6, 0.95, v)); // bunched over the knee
    crease(o, wrinkle(y, x, 55, b) * ss(0.2, 0.6, v), 0.5); // and hanging in long creases down the thigh
  } };
  PART.shin = { x0: -0.085, x1: 0.085, y0: -0.6, y1: 0.07, yN: 0.61, nx: 7.3, ny: 2.2, len: LSH, shape(x, y, o, b) {
    o.fade = ss(0.05, 0.005, y);
    const v = cl(-y / LSH); let r = 0.044 - 0.004 * v + 0.006 * Math.exp(-(((v - 0.3) / 0.18) ** 2)) - 0.016 * ss(0.4, 1, v);
    const bag = pouch(v, x, 0, 0.03, 0.2, o);
    r += 0.013 * bag * (0.75 + 0.5 * vn(v * 9, x * 20));
    r = short(v, 0.86, r, 0.018, x, y, o, b); // the skin ends short of the ankle
    tube(x, y, LSH, r, o);
    const hk = o.h / Math.max(1e-4, r);
    o.h += 0.013 * bag * hk;
    if (o.m === SKIN) { crease(o, wrinkle(x, y, 80, b), bump(0.0, 0.1, 0.3, v)); crease(o, wrinkle(x, y, 60, b), ss(0.65, 0.85, v) * 0.8); } // wrinkled over the knee, bunched above the ankle
    o.h += 0.007 * Math.exp(-((x / 0.022) ** 2 + ((v - 0.025) / 0.045) ** 2)); // the kneecap
  } };
  PART.foot = { x0: -0.075, x1: 0.075, y0: -0.085, y1: 0.035, yN: 0.07, nx: 1.3, ny: 9.1, shape(x, y, o, b) {
    // seen from the front: a thin dark ankle widening to long toes splayed on the carpet
    const t = cl(-y / 0.07), w = 0.02 + 0.034 * t * t, ax = Math.abs(x);
    o.d = Math.max(ax - w, y - 0.03, -0.072 - y);
    o.h = 0.03 * sq(1 - (x / (w + 0.003)) ** 2) * (0.55 + 0.45 * t);
    if (t < 0.4) o.m = FRAME;
    if (t > 0.55) { const tc = Math.cos((x / 0.0115) * Math.PI); o.ao *= 1 - 0.4 * ss(0.55, 1, t) * Math.max(0, tc) ** 4; o.h -= 0.003 * Math.max(0, tc) ** 4 * ss(0.55, 1, t); }
    o.ao *= 0.75 + 0.25 * (1 - t);
  } };

  /** A split down the side of the torso: the borrowed skin does not meet there, and the dark thing shows. xs its line, half width ws. */
  function split(x, y, o, xs, ws, b) {
    const dx = Math.abs(x - xs), wv = ws * (0.6 + 0.8 * vn(y * 30, xs * 9));
    if (dx < wv) { o.m = FRAME; o.h -= 0.006; o.t = vn(x * 200, y * 40); return; }
    o.h += 0.0035 * Math.exp(-(((dx - wv - 0.0035) / 0.003) ** 2)); // its edges, curled
    o.ao *= 1 - 0.45 * Math.exp(-((dx - wv) / 0.004));
    crease(o, wrinkle(y, dx, 160, b) * Math.exp(-dx / 0.025), 0.8); // the skin puckered along it
  }

  const AB_W = curve([-0.13, 0.07, -0.08, 0.106, -0.02, 0.128, 0.06, 0.136, 0.15, 0.13, 0.22, 0.114, 0.3, 0.104, 0.38, 0.108, 0.46, 0.118]);
  function abdBase(x, y, o) {
    let w = AB_W(y) * (x < 0 ? 1.03 : 1);
    w += 0.012 * Math.exp(-(((y - 0.12) / 0.06) ** 2)) * (x < 0 ? 1.4 : 0.7); // loose skin hanging at the sides, more on one side
    const yb = -0.105 + 0.04 * (x / 0.11) ** 2 + 0.018 * (x > 0 ? x / 0.1 : 0) + 0.008 * (vn(x * 40, 2.2) - 0.5); // it ends in the bag hanging over the thighs
    o.d = Math.max(Math.abs(x) - w, y - 0.46, yb - y);
    const xr = c1(x / w);
    o.h = 0.09 * sq(1 - xr * xr) * (0.72 + 0.28 * ss(-0.1, 0.02, y));
    return [xr, w, yb];
  }
  PART.abd = { x0: -0.17, x1: 0.17, y0: -0.16, y1: 0.47, yN: 1.13, nx: 5.5, ny: 1.9, shape(x, y, o, b) {
    const [xr, w, yb] = abdBase(x, y, o), hk = sq(1 - xr * xr);
    // the belly: a bag of skin, lumpy, heaviest at the bottom, lower on one side
    const bg = ss(0.3, -0.02, y) ** 1.3 * (1 - ss(yb + 0.035, yb, y));
    o.h += 0.03 * bg * hk * (0.8 + 0.4 * vn(x * 25, y * 12));
    if (y < yb + 0.03) o.ao *= 1 - 0.5 * ss(yb + 0.03, yb, y);
    crease(o, wrinkle(x * 0.7 + y * 0.3, y, 32, b), ss(0.32, 0.12, y) * 0.9); // it sags in creases across
    crease(o, wrinkle(y, x, 30, b), bg * 0.6); // and drags down in long ones
    const dn = ell(x, y, 0.013, 0.24, 0.004, 0.011, 0.1); // the navel, too high, drawn out into a slit
    if (dn < 0) o.m = VOID;
    o.ao *= 1 - 0.55 * Math.exp(-Math.max(0, dn) / 0.004); o.h -= 0.004 * Math.exp(-((dn / 0.006) ** 2));
    const rc = y - (0.44 - 0.85 * Math.abs(x)); o.h += 0.004 * Math.exp(-((rc / 0.012) ** 2)) * ss(0.02, 0.05, Math.abs(x)); // the bottom of the ribcage
    split(x, y, o, w * 0.74, 0.008 * ss(0.0, 0.12, y) + 0.004, b);
  } };
  PART.abdB = { x0: -0.17, x1: 0.17, y0: -0.16, y1: 0.47, yN: 1.13, nx: 2.5, ny: 6.9, shape(x, y, o, b) {
    const [xr, w] = abdBase(x, y, o), hk = sq(1 - xr * xr);
    for (let k = 0; k < 6; k++) { const yk = 0.42 - k * 0.062; o.h += 0.004 * Math.exp(-((x / 0.008) ** 2 + ((y - yk) / 0.012) ** 2)); }
    crease(o, wrinkle(x, y, 50, b), ss(0.25, 0.0, y) * 0.9); // folds draped over the hips
    o.h += 0.012 * ss(0.15, 0.0, y) * hk * (0.8 + 0.4 * vn(x * 20, 3.3));
    if (y < 0.02) o.ao *= 0.6 + 0.4 * ss(-0.12, 0.02, y);
    split(x, y, o, 0.004 * Math.sin(y * 40), 0.007, b); // the back split open up the spine
    split(x, y, o, -w * 0.76, 0.006 * ss(0.05, 0.2, y), b);
  } };

  const CH_W = curve([-0.09, 0.106, 0.0, 0.11, 0.1, 0.12, 0.2, 0.13, 0.28, 0.138, 0.33, 0.148, 0.36, 0.158, 0.385, 0.16, 0.41, 0.135, 0.44, 0.088, 0.47, 0.052, 0.53, 0.044]);
  function chestBase(x, y, o) {
    const w = CH_W(y) * (x < 0 ? 1.01 : 0.99);
    o.d = Math.max(Math.abs(x) - w, -0.12 - y, y - 0.53);
    o.fade = ss(-0.11, -0.03, y); // its lower edge melting into the belly
    const xr = c1(x / w);
    o.h = 0.1 * (0.85 + 0.15 * ss(0, 0.25, y)) * (1 - 0.55 * ss(0.38, 0.5, y)) * sq(1 - xr * xr);
    return [xr, w];
  }
  /** Over the shoulders the skin is pulled tight: creases fanning from each shoulder point toward the neck. */
  function strain(x, y, o, b) {
    for (const d of [-1, 1]) {
      const px = d * 0.15, py = 0.39, dx = x - px, dy = y - py, r = Math.hypot(dx, dy), an = Math.atan2(dy, dx * d);
      if (r < 0.15 && r > 0.012) { const k = ss(0.15, 0.06, r) * ss(0.012, 0.03, r); crease(o, wrinkle(r, an, 9, b), k * 0.9); }
    }
  }
  PART.chest = { x0: -0.21, x1: 0.21, y0: -0.11, y1: 0.54, yN: 1.49, nx: 8.1, ny: 3.3, shape(x, y, o, b) {
    const [xr, w] = chestBase(x, y, o), ax = Math.abs(x), hk = sq(1 - xr * xr);
    if (ax > 0.06 && y < 0.34 && y > 0.04) { // a few ribs at the sides
      for (let k = 0; k < 4; k++) {
        const yk = 0.29 - k * 0.058 - 0.42 * (ax - 0.03) * (1 + 0.12 * k) + 0.012 * (vn(k * 7.3, x * 9) - 0.5), dr = y - yk;
        o.h += 0.0028 * Math.exp(-((dr / 0.0095) ** 2)) * ss(0.06, 0.1, ax) * hk;
      }
    }
    // loose skin hanging off the chest: drapes from the collarbones, a sag below the breastbone, slack folds at the waist
    crease(o, wrinkle(y, x * (1 + 1.2 * (0.3 - Math.min(0.3, y))), 24, b), ss(0.4, 0.2, y) * ss(-0.05, 0.08, y) * hk);
    o.h += 0.012 * bump(0.0, 0.12, 0.22, y) * hk * (0.7 + 0.6 * vn(x * 15, 2.2));
    crease(o, wrinkle(x, y, 30, b), ss(0.12, -0.05, y));
    o.h -= 0.0028 * Math.exp(-((x / 0.007) ** 2)) * ss(0.08, 0.17, y) * (1 - ss(0.4, 0.45, y)); // the breastbone
    for (const d of [-1, 1]) { // collarbones, and the hollows above them
      const q = sdist(x, y, d * 0.028, 0.435, d * 0.165, 0.41), t = ST;
      o.h += 0.0062 * Math.exp(-((q / 0.0072) ** 2));
      const above = y - (0.435 + (0.41 - 0.435) * t);
      if (above > 0) { o.h -= 0.006 * Math.exp(-(((above - 0.014) / 0.012) ** 2)) * (1 - ss(0.75, 1, t)); o.ao *= 1 - 0.3 * Math.exp(-(((above - 0.012) / 0.01) ** 2)); }
    }
    strain(x, y, o, b);
    if (y < 0.36) split(x, y, o, w * 0.74, 0.004 + 0.008 * bump(0.0, 0.15, 0.34, y), b);
  } };
  PART.chestB = { x0: -0.21, x1: 0.21, y0: -0.11, y1: 0.54, yN: 1.49, nx: 4.1, ny: 8.3, shape(x, y, o, b) {
    const [xr, w] = chestBase(x, y, o), hk = sq(1 - xr * xr);
    for (const d of [-1, 1]) { // the shoulder blades, standing out
      const q = ell(x, y, d * 0.072, 0.29, 0.042, 0.075, d * -0.25), hq = q < 0 ? 0.006 + 0.004 * Math.min(1, -q / 0.03) : 0.006 * Math.exp(-((q / 0.012) ** 2));
      o.h += hq;
      if (q > 0 && q < 0.03 && d * x < 0.07) o.ao *= 1 - 0.25 * Math.exp(-(((q - 0.008) / 0.009) ** 2));
    }
    crease(o, wrinkle(x, y, 40, b), ss(0.2, 0.0, y) * hk); // slack folds at the waist
    strain(x, y, o, b);
    split(x, y, o, 0.004 * Math.sin(y * 40), 0.004 + 0.007 * bump(-0.1, 0.2, 0.44, y), b); // the back split open up the spine
    split(x, y, o, -w * 0.76, 0.005 * bump(0.0, 0.1, 0.3, y), b);
  } };
  /** Skin draped over the shoulder and the top of the arm, so no joint shows: pulled tight over the point, slack below. */
  PART.mantle = { x0: -0.08, x1: 0.08, y0: -0.2, y1: 0.07, yN: 1.84, nx: 12.2, ny: 3.4, shape(x, y, o, b) {
    const w = 0.05 + 0.014 * ss(0.03, -0.12, y), ax = Math.abs(x);
    o.d = Math.max(ax - w, y - 0.055); o.fade = ss(-0.2, -0.08, y) * ss(0.06, 0.02, y) * ss(w, w - 0.03, ax);
    o.h = 0.05 * sq(1 - (x / w) ** 2);
    crease(o, wrinkle(x, y, 60, b), ss(-0.02, -0.14, y)); // slack, wrinkled where it hangs
    crease(o, wrinkle(y, x, 70, b), ss(0.0, 0.04, y) * 0.8); // tight over the point
  } };

  PART.neck = { x0: -0.09, x1: 0.09, y0: -0.05, y1: 0.335, yN: 1.94, nx: 9.7, ny: 4.4, len: NECK, shape(x, y, o, b) {
    // the neck itself is the dark thing, thin; the skin that should be round it hangs off the jaw in front like an
    // emptied sack, narrow at the throat, spreading out where it lies on the chest, creased all down its length
    const v = cl(y / NECK), rf = 0.022 + 0.005 * ss(0.85, 1, v);
    tube(x, -y, NECK, rf, o);
    const hf = o.h, df = o.d;
    o.m = FRAME; o.t = vn(x * 300, y * 50);
    const ws = 0.026 + 0.034 * ss(0.32, 0.0, v) ** 1.5 - 0.006 * bump(0.25, 0.5, 0.8, v) + 0.006 * ss(0.8, 1, v) + 0.005 * (vn(v * 14, 3.1) - 0.5), ax = Math.abs(x - 0.004 * Math.sin(v * 7));
    const dsh = Math.max(ax - ws, -y - 0.045);
    if (dsh < 0) {
      o.m = SKIN; o.t = 0;
      const xr = c1(x / ws), bul = (0.008 + 0.012 * ss(0.5, 0.05, v)) * sq(1 - xr * xr);
      o.h = Math.max(hf, 0) + bul;
      crease(o, wrinkle(y, x * (1 + 1.4 * (1 - v)), 85, b), 0.9 * ss(0.95, 0.75, v)); // creased down its length
      crease(o, wrinkle(x, y + 0.03 * (1 - xr * xr), 50, b), ss(0.3, 0.05, v) * 0.7); // and sagging across where it piles up
      o.h += 0.003 * Math.exp(-(((ax - ws + 0.003) / 0.0025) ** 2)); o.ao *= 1 - 0.3 * Math.exp(-((ws - ax) / 0.004)); // its edges, rolled
    } else if (dsh < 0.008) o.ao *= 1 - 0.55 * Math.exp(-dsh / 0.003); // its shade on the neck
    o.d = Math.min(df, dsh);
    for (const d of [-1, 1]) { const q = sdist(x, y, d * 0.018, 0.29, d * 0.006, 0.12); if (o.m === FRAME) o.h += 0.004 * Math.exp(-((q / 0.005) ** 2)); } // cords, bare
  } };

  // the head under it all: dark, a cranium a little too tall over a narrow jaw, a borrowed scalp askew on it
  const headD = (x, y) => Math.min(smin(ell(x, y, 0, 0.135, 0.074, 0.104), ell(x, y, 0, 0.066, 0.056, 0.07), 0.022), ell(x, y, -0.074, 0.112, 0.011, 0.024), ell(x, y, 0.072, 0.093, 0.011, 0.024));
  const headH = (x, y) => -smin(-0.085 * sq(1 - (x / 0.077) ** 2 - ((y - 0.135) / 0.108) ** 2), -0.07 * sq(1 - (x / 0.059) ** 2 - ((y - 0.066) / 0.073) ** 2), 0.02);
  function headBase(x, y, o, b) {
    o.d = headD(x, y) + 0.0012 * (vn(x * 150, y * 150) - 0.5);
    o.h = headH(x, y);
    for (const [ex, ey] of [[-0.074, 0.112], [0.072, 0.093]]) { const q = ell(x, y, ex, ey, 0.011, 0.024); if (q < 0.004) { o.h = Math.max(o.h, 0.012 * sq(-q / 0.011)); o.ao *= 1 - 0.5 * Math.exp(-((ell(x, y, ex, ey, 0.005, 0.014) / 0.003) ** 2)); } }
  }
  /** Hair: lank, thin, the scalp showing through; how much of it there is here (0..1) for a hairline tilted by rot. */
  function hair(x, y, o, b, rot, low) {
    const c = Math.cos(rot), s = Math.sin(rot), xr = x * c + (y - 0.13) * s, yr = -x * s + (y - 0.13) * c;
    const yl = low - 0.058 * (xr / 0.075) ** 2 + 0.01 * (vn(xr * 55, 1.3) - 0.5);
    let hm = ss(-0.002, 0.006, yr - yl);
    for (let k = 0; k < 3; k++) { // a few lank strands hanging down one side, past the ear
      const xs = 0.066 + 0.008 * k + 0.004 * Math.sin(y * 50 + k * 2), y0 = 0.035 + 0.018 * k;
      if (y > y0 && y < 0.15) { const q = Math.abs(x - xs) - 0.0022; if (q < o.d) { o.d = Math.min(o.d, q); o.h = Math.max(o.h, 0.006); } if (q < 0) hm = 1; }
    }
    if (hm <= 0) return 0;
    const st = vn(xr * 420, yr * 18 + xr * 30), thin = vn(xr * 28 + 3, yr * 11 + xr * 5);
    const h0 = hm; hm *= 0.3 + 0.7 * ss(0.2, 0.4, thin);
    if (hm > 0.5) { o.m = HAIR; o.t = st; } else o.ao *= 1 - 0.7 * h0;
    o.h += 0.005 * hm + 0.0015 * (st - 0.5) * fine(b, 0.015);
    return hm;
  }
  PART.head = { x0: -0.095, x1: 0.095, y0: -0.015, y1: 0.255, yN: 2.24, nx: 11.3, ny: 5.1, shape(x, y, o, b) {
    headBase(x, y, o, b);
    const hm = hair(x, y, o, b, 0.14, 0.05);
    if (hm < 0.5 && o.m === SKIN) { o.m = FRAME; o.t = vn(x * 250, y * 250); } // under the face, nothing like a face
  } };
  PART.headB = { x0: -0.095, x1: 0.095, y0: -0.015, y1: 0.255, yN: 2.24, nx: 13.3, ny: 2.1, shape(x, y, o, b) {
    headBase(x, y, o, b);
    const hm = hair(x, y, o, b, -0.1, -0.035);
    const ye = 0.04 + 0.025 * (x / 0.06) ** 2 + 0.006 * (vn(x * 60, 4.4) - 0.5); // where the borrowed scalp ends at the nape, the dark thing under it
    if (hm < 0.5 && y < ye) { o.m = FRAME; o.t = vn(x * 250, y * 250); } else if (hm < 0.5) { o.ao *= 1 - 0.45 * Math.exp(-(((y - ye - 0.004) / 0.004) ** 2)); o.h += 0.002; }
  } };

  /**
   * A face: a person's, taken off them and worn. Too big for the head under it, the eyes, nose and mouth all there
   * but not where the head's are: in one eyehole the eye behind shows at the top edge, the other hole is empty; the
   * mouth too wide, its corners dragged down. open: how far the lips have parted. human: the man's own face.
   */
  function facePart(open, human) {
    return { x0: -0.08, x1: 0.08, y0: -0.02, y1: 0.205, yN: 2.24, nx: human ? 3.7 : 17.7, ny: 6.6, shape(x, y, o, b) {
      // the outline: a long face with jowls hanging at the bottom
      const jw = human ? 0 : 0.008 * ss(0.07, 0.02, y);
      const fd = ell(x, y, 0, 0.096, (human ? 0.058 : 0.059) + jw, human ? 0.084 : 0.09) + 0.0014 * (vn(x * 80 + 3, y * 80) - 0.5);
      if (fd > 0) { if (!human && fd < 0.008) { o.d = -1; o.m = HALO; o.t = (1 - fd / 0.008) ** 1.5; } return; } // the shade its edge throws
      o.d = fd; o.m = human ? SKIN : FACE; o.h = headH(x, y * 0.95) + 0.0025 * ss(-0.005, -0.001, fd);
      if (!human) o.ao *= 1 - 0.35 * Math.exp(-(-fd / 0.003)); // its edge, lifting off
      const E = human ? [[-0.026, 0.112, 0], [0.026, 0.112, 0]] : [[-0.027, 0.113, 1], [0.028, 0.104, 2]]; // (the right one has slid lower)
      for (const [ex, ey, kind] of E) {
        // an eye opening the shape of an eye, with lids; the brow above, sparse
        const lx = (x - ex) / 0.0135, upper = 0.0058 * (1 - lx * lx), lower = 0.0042 * (1 - lx * lx), dy = y - ey;
        const inEye = Math.abs(lx) < 1 && dy < upper && dy > -lower;
        const lid = Math.abs(lx) < 1.25 ? Math.exp(-(((dy - upper - 0.003) / 0.0028) ** 2)) : 0, bag = Math.abs(lx) < 1.2 ? Math.exp(-(((dy + lower + 0.005) / 0.004) ** 2)) : 0;
        o.h += 0.0035 * lid + 0.003 * bag - 0.004 * Math.exp(-((Math.hypot(lx * 0.0135, dy) / 0.012) ** 2));
        o.ao *= 1 - 0.45 * lid * 0.6 - 0.3 * Math.exp(-(((dy - upper - 0.0055) / 0.002) ** 2)) * (Math.abs(lx) < 1.1 ? 1 : 0);
        if (inEye) {
          if (kind === 0) { const ir = Math.hypot(x - ex, y - ey); o.m = ir < 0.005 ? (ir < 0.0022 ? VOID : HAIR) : WET; if (ir >= 0.005) o.t = 0; }
          else if (kind === 1) { const ir = Math.hypot(x - ex - 0.002, y - (ey + upper + 0.002)); o.m = ir < 0.0062 ? (ir < 0.003 ? VOID : HAIR) : dy > upper * 0.25 ? WET : VOID; } // its eye, high up behind the hole
          else o.m = VOID;
          o.ao *= 0.7;
        }
        const bq = sdist(x, y, ex - 0.017, ey + 0.017 + (ex > 0 ? 0.004 : 0), ex + 0.015, ey + 0.021); // the brow
        if (bq < 0.0024 && vn(x * 900, y * 300) > 0.35) { o.m = HAIR; o.t = 0.4; }
        o.h += 0.003 * Math.exp(-((bq / 0.006) ** 2));
      }
      // the nose: a bridge, a tip, its wings and nostrils; knocked a little to one side
      const nk = human ? 0 : 0.004, qn = sdist(x, y, 0, 0.112, nk, 0.076), tn = ST;
      o.h += (0.004 + 0.011 * tn) * Math.exp(-((qn / (0.0045 + 0.004 * tn)) ** 2));
      o.h += 0.006 * Math.exp(-(((x - nk) ** 2 + (y - 0.077) ** 2) / 0.0075 ** 2));
      for (const d of [-1, 1]) {
        const wx = nk + d * 0.011, q = Math.hypot(x - wx, y - 0.072);
        o.h += 0.005 * Math.exp(-((q / 0.0055) ** 2)); o.ao *= 1 - 0.4 * Math.exp(-(((q - 0.0065) / 0.0018) ** 2)); // the wings
        const qq = ell(x, y, nk + d * 0.0055, 0.0675, 0.0033, 0.0018, d * 0.3); if (qq < 0) o.m = VOID; o.ao *= 1 - 0.4 * Math.exp(-Math.max(0, qq) / 0.002);
        // the fold from the nose to the corner of the mouth, deep
        const fq = sdist(x, y, nk + d * 0.016, 0.074, d * (human ? 0.024 : 0.04), human ? 0.05 : 0.036);
        o.ao *= 1 - (human ? 0.12 : 0.2) * Math.exp(-((fq / 0.0022) ** 2)); o.h += 0.003 * Math.exp(-(((fq - 0.004) / 0.004) ** 2)) * (x * d > 0 ? 1 : 0);
      }
      // the mouth: lips, a cupid's bow; too wide on the borrowed one, the corners dragged down
      const MW = human ? 0.024 : 0.044, xm = x / MW, q = 1 - xm * xm;
      if (q > -0.3) {
        const ym = (human ? 0.05 : 0.047) - (human ? 0 : 0.012) * xm * xm + 0.0015 * Math.cos(xm * 3.2) * (Math.abs(xm) < 0.5 ? 1 : 0);
        const gap = (0.0005 + (0.002 + 0.007 * open) * Math.max(0, q) ** 1.2), lu = 0.0052 * Math.max(0, q) ** 0.6, ll = 0.0068 * Math.max(0, q) ** 0.6, dy = y - ym;
        if (q > 0 && dy < gap && dy > -gap) { o.m = VOID; o.ao *= 0.4; }
        else if (q > 0 && dy >= gap && dy < gap + lu) { o.m = LIP; o.h += 0.004 * Math.sin(((dy - gap) / lu) * Math.PI); }
        else if (q > 0 && dy <= -gap && dy > -gap - ll) { o.m = LIP; o.h += 0.005 * Math.sin(((-dy - gap) / ll) * Math.PI); }
        o.ao *= 1 - 0.4 * Math.exp(-((Math.abs(dy) - gap) / 0.0015)) * (q > 0 ? 1 : 0);
        if (!human) for (const d of [-1, 1]) { const cq = sdist(x, y, d * MW * 0.95, ym - 0.011, d * (MW + 0.012), ym - 0.03); o.ao *= 1 - 0.4 * Math.exp(-((cq / 0.002) ** 2)); } // the corners, dragged
      }
      o.h += 0.006 * Math.exp(-(((x) ** 2 + (y - 0.016) ** 2) / 0.016 ** 2)); // the chin
      for (const d of [-1, 1]) o.h += 0.004 * Math.exp(-(((x - d * 0.035) ** 2 + (y - 0.093) ** 2) / 0.014 ** 2)); // cheekbones
      if (human) return;
      // stretched: lines across the forehead, a sag under each cheek; and the other face pushing up under it, faintly
      crease(o, wrinkle(x, y, 260, b), ss(0.15, 0.17, y) * 0.8);
      o.h += 0.0026 * Math.exp(-((sdist(x, y, -0.024, 0.152, 0.05, 0.141) / 0.0075) ** 2)) + 0.004 * Math.exp(-(((x - 0.019) ** 2 + (y - 0.097) ** 2) / 0.0095 ** 2));
      o.t = vn(x * 40, y * 40);
    } };
  }
  PART.face0 = facePart(0); PART.face1 = facePart(0.45); PART.face2 = facePart(1); PART.faceH = facePart(0, true);

  PART.uarm = { x0: -0.11, x1: 0.08, y0: -0.6, y1: 0.07, yN: 1.86, nx: 2.7, ny: 12.1, len: LUA, shape(x, y, o, b) {
    o.fade = ss(0.05, -0.02, y);
    const v = cl(-y / LUA); let r = 0.032 + 0.006 * Math.exp(-((v / 0.14) ** 2)) - 0.003 * v;
    const bag = x < 0 ? ss(0.1, 0.55, v) ** 1.2 * (1 - ss(0.55, 0.88, v)) : 0; // a bag of skin hanging under the arm
    r += 0.026 * bag * (0.8 + 0.4 * vn(v * 8, 1.1));
    tube(x, y, LUA, r, o);
    const hk = o.h / r;
    if (bag > 0.05) { o.ao *= 1 - 0.3 * Math.exp(-(((v - 0.8) / 0.05) ** 2)); crease(o, wrinkle(y * 0.6 - x, x + y * 0.3, 80, b), bag); }
    o.h += 0.008 * bag * hk;
    crease(o, wrinkle(x, y, 75, b), ss(0.7, 0.95, v) * 0.8); // bunching toward the elbow
  } };
  PART.farm = { x0: -0.075, x1: 0.09, y0: -0.56, y1: 0.06, yN: 1.3, nx: 6.6, ny: 14.4, len: LFA, shape(x, y, o, b) {
    o.fade = ss(0.045, 0.0, y);
    const v = cl(-y / LFA); let r = 0.033 - 0.002 * v + 0.004 * Math.exp(-(((v - 0.25) / 0.15) ** 2)) - 0.011 * ss(0.35, 1, v);
    // the elbow: the skin hangs off the point of it in a wrinkled drape
    const bag = pouch(v, x, 1, 0.0, 0.2, o);
    r += 0.022 * bag * (0.8 + 0.4 * vn(v * 11, 2.2));
    r = short(v, 0.9, r, 0.016, x, y, o, b);
    tube(x, y, LFA, r, o);
    const hk = o.h / Math.max(1e-4, r);
    o.h += 0.014 * bag * hk;
    if (o.m === SKIN) { crease(o, wrinkle(x - y * 0.4, y, 85, b), bump(0.0, 0.08, 0.28, v) * 1.1); crease(o, wrinkle(y, x, 60, b), bag * 0.8); }
    for (const d of [-0.012, 0.01]) o.h += 0.0022 * Math.exp(-(((x - d) / 0.005) ** 2)) * ss(0.45, 0.7, v); // tendons
  } };
  /** The forearm below the joint too many: a knob of bone, the skin twisted round it, and short of the wrist. */
  PART.farm2 = { x0: -0.06, x1: 0.06, y0: -0.56, y1: 0.05, yN: 1.0, nx: 4.4, ny: 17.2, len: LFA, shape(x, y, o, b) {
    o.fade = ss(0.04, 0.0, y);
    const v = cl(-y / LFA); let r = 0.027 + 0.006 * Math.exp(-((v / 0.07) ** 2)) - 0.008 * ss(0.4, 1, v);
    r = short(v, 0.72, r, 0.014, x, y, o, b);
    tube(x, y, LFA, r, o);
    o.h += 0.007 * Math.exp(-(((x + 0.006) / 0.012) ** 2 + (v / 0.06) ** 2)); // the knob
    if (o.m === SKIN) crease(o, wrinkle(y * 0.6 + x, x - y * 0.5, 120, b), ss(0.0, 0.08, v) * (1 - ss(0.3, 0.45, v)));
    else o.t = vn(x * 300, y * 60);
  } };

  /** A hand: a skin glove, palm toward us (as nobody's hangs), four long fingers with a joint too many, a thumb. spread / curl per finger; human: an ordinary hand. */
  function handPart(spread, curl, human) {
    const FX = [-0.028, -0.0095, 0.0095, 0.028], FL = human ? [0.055, 0.07, 0.077, 0.068] : [0.16, 0.19, 0.205, 0.18], PL = human ? 0.085 : 0.11;
    const BL = human ? [0.45, 0.3, 0.25] : [0.3, 0.26, 0.24, 0.2], fingers = [];
    for (let i = 0; i < 4; i++) {
      const c = curl[i], P = [FX[i] * (human ? 0.85 : 1), -PL]; let a = spread[i];
      for (let k = 0; k < BL.length; k++) {
        if (k) a += (i < 2 ? -1 : 1) * 0.02 + c * 0.25 * (i < 2 ? 1 : -1) * 0.3;
        const l = FL[i] * BL[k] * (1 - c * 0.75 * ((k + 1) / BL.length)), n = P.length;
        P.push(P[n - 2] + Math.sin(a) * l, P[n - 1] - Math.cos(a) * l);
      }
      fingers.push({ P, r0: human ? 0.0085 : 0.0108, r1: (human ? 0.007 : 0.0072) * (1 + c * 0.6) });
    }
    const TP = [0.032, -0.024, 0.05, -0.054, 0.062, -0.084, 0.067, -0.108];
    return { x0: -0.14, x1: 0.14, y0: -0.37, y1: 0.03, yN: 1.2, nx: human ? 1.1 : 15.5, ny: 3.9, shape(x, y, o, b) {
      const w = 0.027 + 0.012 * ss(0.0, 0.6, -y / PL), rr = 0.012, qx = Math.abs(x - 0.001) - w + rr, qy = Math.abs(y + PL * 0.5 - 0.002) - PL * 0.5 - 0.002 + rr, dp = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
      let best = 1, bh = 0, joint = 1;
      for (const f of fingers) {
        const P = f.P, nb = P.length / 2 - 1;
        for (let k = 0; k < nb; k++) {
          const q = sdist(x, y, P[2 * k], P[2 * k + 1], P[2 * k + 2], P[2 * k + 3]), t = (k + ST) / nb, r = f.r0 + (f.r1 - f.r0) * t, dd = q - r;
          if (dd < best) { best = dd; bh = sq(r * r - q * q); joint = Math.min(ST, 1 - ST) * FL[1] * BL[k]; }
        }
      }
      let dt = 1, ht = 0;
      for (let k = 0; k < 3; k++) { const q = sdist(x, y, TP[2 * k], TP[2 * k + 1], TP[2 * k + 2], TP[2 * k + 3]), r = 0.013 - 0.0015 * (k + ST); if (q - r < dt) { dt = q - r; ht = sq(r * r - q * q); } }
      o.d = smin(smin(dp, best, 0.008), dt, 0.007);
      o.h = Math.max(0.022 * sq(1 - ((x - 0.001) / (w + 0.002)) ** 2) * ss(0.002, -0.004, dp), bh, ht);
      if (best < dp && best < dt) { o.ao *= 1 - 0.55 * Math.exp(-((joint / 0.0035) ** 2)); o.h += 0.002 * (1 - Math.exp(-((joint / 0.004) ** 2))); } // knuckles and the creases between
      if (dp < 0 && !human) { const cq = Math.abs(y + 0.055 - x * 0.4) - 0.0006; o.ao *= 1 - 0.3 * Math.exp(-((cq / 0.0018) ** 2)) * fine(b, 0.008); }
      if (!human && y > -0.012) { o.m = FRAME; o.t = vn(x * 300, y * 60); } // the glove of skin starts a little below the wrist
    } };
  }
  PART.hand0 = handPart([-0.09, -0.03, 0.03, 0.11], [0.1, 0.05, 0.08, 0.15]);
  PART.hand1 = handPart([-0.05, -0.02, 0.02, 0.06], [0.75, 0.6, 0.65, 0.5]);
  PART.hand2 = handPart([-0.42, -0.16, 0.12, 0.38], [0, 0.05, 0.1, 0]);
  PART.handH = handPart([-0.06, -0.02, 0.02, 0.06], [0.2, 0.2, 0.2, 0.2], true);
  /** One finger lying round a door frame (seen from the back: the knuckles, the nail), pointing along +x from its knuckle. */
  PART.finger = { x0: -0.015, x1: 0.21, y0: -0.05, y1: 0.018, yN: 1.95, nx: 19.1, ny: 1.1, shape(x, y, o, b) {
    const P = [0, 0, 0.055, -0.003, 0.1, -0.008, 0.14, -0.017, 0.172, -0.031], R = [0.0125, 0.0118, 0.0106, 0.0094, 0.0077];
    let best = 1, bh = 0, k0 = 0, t0 = 0;
    for (let k = 0; k < 4; k++) { const q = sdist(x, y, P[2 * k], P[2 * k + 1], P[2 * k + 2], P[2 * k + 3]), r = R[k] + (R[k + 1] - R[k]) * ST; if (q - r < best) { best = q - r; bh = sq(r * r - q * q); k0 = k; t0 = ST; } }
    o.d = best; o.h = bh;
    const jd = Math.min(t0, 1 - t0) * 0.045;
    o.h += 0.003 * Math.exp(-((jd / 0.006) ** 2)) * (k0 > 0 || t0 > 0.5 ? 1 : 0); // knuckles
    crease(o, wrinkle(y, x, 600, b) * Math.exp(-((jd / 0.008) ** 2)), 1); // wrinkled over them
    if (k0 === 3 && t0 > 0.45) { o.m = NAIL; o.h += 0.0012; }
  } };
  /** Something moving under the skin. */
  PART.bulge = { x0: -0.035, x1: 0.035, y0: -0.045, y1: 0.045, yN: 1.6, nx: 21.3, ny: 7.7, shape(x, y, o) {
    const q = (x / 0.022) ** 2 + (y / 0.032) ** 2; o.d = (Math.sqrt(q) - 1) * 0.022; o.soft = 0.012; o.h = 0.013 * Math.max(0, 1 - q) ** 1.5;
  } };

  // ---- the clothes the twin copies: a red jumper, grey trousers, brown shoes (on the man; the copy goes barefoot)
  const RED = [0.5, 0.17, 0.15], GREY = [0.26, 0.27, 0.29], BROWN = [0.24, 0.15, 0.09];
  function cloth(o, col, x, y, b, k) { o.m = CLOTH; o.col = col; o.h += 0.0012 * Math.sin(y * 900 + x * 40) * fine(b, 0.007) * (k || 1); }
  PART.jumper = { x0: -0.23, x1: 0.23, y0: -0.1, y1: 0.54, yN: 1.36, nx: 1, ny: 1, col: RED, shape(x, y, o, b) {
    const w = curve([-0.09, 0.135, 0.0, 0.14, 0.15, 0.142, 0.3, 0.155, 0.37, 0.19, 0.4, 0.192, 0.43, 0.15, 0.46, 0.085, 0.49, 0.06])(y);
    o.d = Math.max(Math.abs(x) - w, -0.095 - y, y - 0.49);
    const xr = c1(x / w); o.h = 0.11 * sq(1 - xr * xr);
    if (y < -0.04) { o.h += 0.004; o.ao *= 0.85; } // the ribbed hem
    if (y > 0.45) o.ao *= 0.8; // the collar
    for (const d of [-1, 1]) { const q = sdist(x, y, d * 0.06, 0.2, d * 0.13, 0.36); o.ao *= 1 - 0.25 * Math.exp(-((q / 0.008) ** 2)); } // folds
    cloth(o, RED, x, y, b);
  } };
  PART.trousers = { x0: -0.16, x1: 0.16, y0: -0.16, y1: 0.18, yN: 1.13, nx: 1, ny: 1, col: GREY, shape(x, y, o, b) {
    const w = curve([-0.16, 0.12, -0.05, 0.135, 0.06, 0.135, 0.16, 0.128])(y);
    o.d = Math.max(Math.abs(x) - w, -0.16 - y, y - 0.17);
    const xr = c1(x / w); o.h = 0.09 * sq(1 - xr * xr);
    if (y > 0.12) { o.ao *= 0.7; o.h += 0.003; } // the belt
    if (y < 0.0) o.ao *= 1 - 0.35 * Math.exp(-((x / 0.012) ** 2)); // the crotch seam
    cloth(o, GREY, x, y, b, 0.5);
  } };
  function sleeve(len, r0, r1, col, cuff) {
    return { x0: -0.09, x1: 0.09, y0: -len - 0.04, y1: 0.07, yN: 1.5, nx: 1, ny: 1, len, col, shape(x, y, o, b) {
      const v = cl(-y / len), r = r0 + (r1 - r0) * v; tube(x, y, len, r, o);
      o.ao *= 1 - 0.3 * Math.max(0, Math.sin(v * 22 + x * 30)) ** 3; // creases
      if (cuff && v > 0.9) o.ao *= 0.85;
      cloth(o, col, x, y, b);
    } };
  }
  PART.sleeveU = sleeve(0.33, 0.052, 0.045, RED, false); PART.sleeveF = sleeve(0.29, 0.046, 0.04, RED, true);
  PART.legT = sleeve(0.46, 0.078, 0.06, GREY, false); PART.legS = sleeve(0.43, 0.058, 0.05, GREY, true);
  PART.shoe = { x0: -0.08, x1: 0.08, y0: -0.09, y1: 0.03, yN: 0.07, nx: 1, ny: 1, col: BROWN, shape(x, y, o, b) {
    const t = cl(-y / 0.07), w = 0.04 + 0.016 * t; o.d = Math.max(Math.abs(x) - w, y - 0.025, -0.072 - y); o.h = 0.035 * sq(1 - (x / (w + 0.003)) ** 2);
    if (t > 0.85) o.ao *= 0.7; cloth(o, BROWN, x, y, b, 0.2); o.gl = 0.5;
  } };

  // ---- baking
  const LX = -0.08, LY = 0.972, LZ = 0.22, HX = -0.051, HY = 0.622, HZ = 0.781; // the tube right overhead, hard; the half vector for the sheen
  const AL = [0, 0, 0];
  /** The colour of the surface at (x, y) (metres plus the part's place on the noise): returns how glossy it is. */
  function albedo(x, y, m, t, b, col) {
    if (m === VOID) { AL[0] = 0.03; AL[1] = 0.022; AL[2] = 0.022; return 0; }
    if (m === WET) { AL[0] = 0.82; AL[1] = 0.78; AL[2] = 0.72; return 1.8; }
    if (m === HAIR) { const k = 0.6 + 0.8 * t; AL[0] = 0.085 * k; AL[1] = 0.07 * k; AL[2] = 0.058 * k; return 0.5; }
    if (m === CLOTH) { const n = 0.85 + 0.3 * fbm(x * 40, y * 40, 2) - 0.15 * vn(x * 400, y * 400) * fine(b, 0.006); AL[0] = col[0] * n; AL[1] = col[1] * n; AL[2] = col[2] * n; return 0.05; }
    if (m === FRAME) { const k = 0.65 + 0.7 * t; AL[0] = 0.13 * k; AL[1] = 0.115 * k; AL[2] = 0.13 * k; return 0.8; } // the thing underneath: dark, wet, a bruised grey-brown
    if (m === LIP) { const n = vn(x * 220, y * 700); AL[0] = 0.86 - 0.08 * n; AL[1] = 0.52 - 0.05 * n; AL[2] = 0.52; return 0.7; }
    // a person's skin: pale and pink, blotched red and sallow, bruised where it creases, veins showing through
    const n1 = fbm(x * 7.3, y * 7.3, 3), n2 = fbm(x * 24 + 5.1, y * 24 + 2.3, 2), n3 = vn(x * 95, y * 95);
    let r = 0.95, g = 0.79, bl = 0.71;
    const kr = ss(0.5, 0.78, n2) * 0.6, ky = ss(0.35, 0.7, n1) * 0.45, kd = ss(0.6, 0.85, fbm(x * 3.1 + 9, y * 3.1, 2)) * 0.5;
    r += (0.93 - r) * kr; g += (0.57 - g) * kr; bl += (0.53 - bl) * kr;
    r += (0.9 - r) * ky; g += (0.8 - g) * ky; bl += (0.6 - bl) * ky;
    r += (0.63 - r) * kd; g += (0.52 - g) * kd; bl += (0.63 - bl) * kd;
    const vv = (1 - Math.abs(fbm(x * 12 + 7.7, y * 12 + 2.1, 3) - 0.5) * 24) * fine(b, 0.006);
    if (vv > 0) { const k = vv * 0.3; r += (0.6 - r) * k; g += (0.64 - g) * k; bl += (0.8 - bl) * k; }
    if (n3 > 0.8) { const k = (n3 - 0.8) * 2.4 * fine(b, 0.012); r *= 1 - k * 0.3; g *= 1 - k * 0.38; bl *= 1 - k * 0.4; }
    if (m === FACE) { const ck = 0.35 * ss(0.45, 0.8, t); r += (0.97 - r) * 0.4; g += (0.85 - g) * 0.4; bl += (0.79 - bl) * 0.4; g -= 0.12 * ck; bl -= 0.1 * ck; }
    if (m === NAIL) { r = 0.82; g = 0.74; bl = 0.62; }
    AL[0] = r; AL[1] = g; AL[2] = bl;
    return (m === FACE ? 0.35 : 0.26) * (0.6 + 0.8 * n2) + (m === NAIL ? 0.5 : 0);
  }

  /** Bake one part at b px per metre for a light (L) or dark page: a generator, so it can be spread over frames. */
  function* bakeGen(P, b, L, out) {
    const pad = 3, W = Math.ceil((P.x1 - P.x0) * b) + 2 * pad, H = Math.ceil((P.y1 - P.y0) * b) + 2 * pad;
    const ib = 1 / b, X0 = P.x0 - pad * ib, Y1 = P.y1 + pad * ib, n = W * H;
    const A = new Float32Array(n), HF = new Float32Array(n), AO = new Float32Array(n), M = new Uint8Array(n), T = new Float32Array(n), GL = new Float32Array(n);
    const o = { d: 1, h: 0, ao: 1, m: 0, t: 0, soft: 0, col: null, gl: 0, fade: 1 };
    let col = P.col || null;
    for (let j = 0; j < H; j++) {
      const y = Y1 - (j + 0.5) * ib;
      for (let i = 0; i < W; i++) {
        const x = X0 + (i + 0.5) * ib, k = j * W + i;
        o.d = 1; o.h = 0; o.ao = 1; o.m = SKIN; o.t = 0; o.soft = 0; o.gl = 0; o.fade = 1;
        P.shape(x, y, o, b);
        if (o.m <= FACE && o.h > 0) { // (lumpy, loose)
          const ek = o.h > 0.006 ? 1 : o.h / 0.006; o.h += ek * (0.0032 * (fbm(x * 17 + P.nx, y * 17 + P.ny, 3) - 0.5) * fine(b, 0.05) + 0.0007 * (vn(x * 260 + P.ny, y * 260) - 0.5) * fine(b, 0.01)); }
        const a = (o.soft ? cl(-o.d / o.soft) : cl(0.5 - o.d * b)) * o.fade;
        A[k] = a;
        if (a > 0) { HF[k] = o.h; AO[k] = o.ao; M[k] = o.m; T[k] = o.t; GL[k] = o.gl; if (o.col) col = o.col; }
      }
      if ((j & 7) === 7) yield;
    }
    const cv = mk(W, H), cx = cv.getContext('2d'), im = cx.createImageData(W, H), D = im.data, hb = b * 0.5;
    for (let j = 0; j < H; j++) {
      const y = Y1 - (j + 0.5) * ib, yN = P.yN + y, hk = 0.14 + 0.86 * ss(0.0, 2.0, yN) ** 1.6;
      for (let i = 0; i < W; i++) {
        const k = j * W + i, a = A[k];
        if (a <= 0) continue;
        const m = M[k], p = k * 4;
        if (m === HALO) { D[p + 3] = Math.round(T[k] * a * (L ? 120 : 160)); continue; }
        const nx0 = -(HF[i < W - 1 ? k + 1 : k] - HF[i ? k - 1 : k]) * hb, ny0 = -(HF[j ? k - W : k] - HF[j < H - 1 ? k + W : k]) * hb;
        const il = 1 / Math.sqrt(nx0 * nx0 + ny0 * ny0 + 1), nx = nx0 * il, ny = ny0 * il, nz = il;
        const gloss = albedo(X0 + (i + 0.5) * ib + P.nx, y + P.ny, m, T[k], b, col) + GL[k];
        const ao = AO[k], ndl = nx * LX + ny * LY + nz * LZ;
        const wrap = Math.max(0, (ndl + 0.12) / 1.12), lam = ndl > 0 ? ndl : 0, sss = Math.max(0, wrap - lam * 0.85) * (m === SKIN || m === FACE || m === LIP ? 1 : 0);
        let sp = nx * HX + ny * HY + nz * HZ; sp = sp > 0 ? sp : 0; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
        const rim = (1 - nz) ** 1.4 * (0.35 + 0.65 * cl(ny + 0.6)) * (m === VOID ? 0 : 1);
        const ed = 0.45 + 0.55 * nz * nz, key = 1.75 * wrap * (0.45 + 0.55 * ao) * ed, amb = 0.09 * ao * ao * ed;
        const cr = m === CLOTH || m === HAIR ? 1 : Math.sqrt(Math.sqrt(ao)), fl = m === FACE || m === LIP ? 0.12 : 0;
        let r = AL[0] * (amb + 1.02 * key) + sss * 0.34 + sp * gloss * 0.3 + rim * 0.3 + fl;
        let g = AL[1] * (amb * 1.03 + 1.0 * key) * cr + sss * 0.08 + sp * gloss * 0.3 + rim * 0.4 + fl * 0.9;
        let bl = AL[2] * (amb * 0.95 + 0.9 * key) * cr + sss * 0.05 + sp * gloss * 0.28 + rim * 0.48 + fl * 0.85;
        let kk;
        if (!L) kk = 1.0 * hk;
        else if (m === FACE || m === WET) { r = 0.36 + 0.6 * r; g = 0.34 + 0.6 * g; bl = 0.31 + 0.58 * bl; kk = 1; }
        else if (m === FRAME) kk = 0.5; else { kk = 0.45 * (0.45 + 0.55 * hk); r += 0.03; g += 0.02; bl += 0.015; }
        r *= kk; g *= kk; bl *= kk;
        const lu = 0.3 * r + 0.59 * g + 0.11 * bl; // the tape's cast, as on the walls
        const gk = m === SKIN || m === FACE || m === LIP ? 0.1 : 0.18; r += (lu * 1.02 - r) * gk; g += (lu * 1.05 - g) * gk; bl += (lu * 0.82 - bl) * gk;
        D[p] = r >= 1 ? 255 : (r * 255) | 0; D[p + 1] = g >= 1 ? 255 : (g * 255) | 0; D[p + 2] = bl >= 1 ? 255 : (bl * 255) | 0; D[p + 3] = (a * 255) | 0;
      }
      if ((j & 15) === 15) yield;
    }
    cx.putImageData(im, 0, 0);
    // its shadow: the outline, blurred (thrown onto whatever it lies over)
    const sp = Math.ceil(2 + b * 0.008), sh = mk(W + 2 * sp, H + 2 * sp), sx = sh.getContext('2d');
    sx.filter = `blur(${(1 + b * 0.004).toFixed(1)}px)`; sx.drawImage(cv, sp, sp); sx.filter = 'none';
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#000'; sx.fillRect(0, 0, sh.width, sh.height);
    out.cv = cv; out.sh = sh; out.sp = sp; out.u0 = -X0 * b; out.v0 = Y1 * b; out.b = b; out.len = P.len || 1;
  }

  // ---- the baked sets: one per size bucket (px per metre on the device) and page; parts baked when a visit needs them
  const BUCKETS = [36, 50, 70, 98, 136, 190, 266, 372];
  const SETS = new Map();
  const NEED = {
    base: ['abd', 'chest', 'neck', 'head', 'face0', 'uarm', 'mantle', 'farm', 'farm2', 'hand0', 'thigh', 'shin', 'foot', 'hand1', 'face1', 'face2', 'bulge'],
    jamb: ['finger', 'hand2'], light: ['hand2'], turn: ['chestB', 'abdB', 'headB'], crawl: ['chestB', 'abdB', 'hand2'],
    twin: ['jumper', 'trousers', 'sleeveU', 'sleeveF', 'legT', 'legS', 'shoe', 'faceH', 'handH'],
  };
  const bucketFor = (k) => { for (const b of BUCKETS) if (b >= k / 1.14) return b; return BUCKETS[BUCKETS.length - 1]; };
  function setFor(b, L) {
    const key = (L ? 'L' : 'D') + b;
    let S = SETS.get(key);
    if (!S) { S = { b, L, parts: {}, jobs: [], gen: null, cur: null, out: null }; SETS.set(key, S); }
    return S;
  }
  function want(S, names) { for (const n of names) if (!S.parts[n] && S.cur !== n && !S.jobs.includes(n)) S.jobs.push(n); }
  const has = (S, names) => names.every((n) => S.parts[n]);
  /** Bake for up to ms milliseconds. */
  function work(S, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (!S.gen) { const n = S.jobs.shift(); if (!n) return true; S.cur = n; S.out = {}; S.gen = bakeGen(PART[n], S.b, S.L, S.out); }
      if (S.gen.next().done) { S.parts[S.cur] = S.out; S.gen = null; S.cur = null; }
    }
    return !S.jobs.length && !S.gen;
  }
  /** The set to draw with at k px per metre: the right bucket if it is ready, else the nearest ready one. */
  function pick(k, L, names) {
    const S = setFor(bucketFor(k), L);
    if (has(S, names)) return S;
    let best = null, bd = 1e9;
    for (const T of SETS.values()) if (T.L === L && has(T, names)) { const d = Math.abs(Math.log(T.b / k)); if (d < bd) { bd = d; best = T; } }
    return best && bd < 1.2 ? best : null;
  }

  // ---- posing. A pose: P pelvis, W waist, N neck base, H head base (points), hd the head's angle, back (seen from
  // behind), sw how square on it is (1 facing us, less turned), arms[2] { S, E, X (a joint too many, or null), R (wrist),
  // ha (the hand's angle), hf (hand sprite), hs (hand length kept, foreshortening) }, legs[2] { hip, K, A },
  // face { x, y, rot, sy, f (sprite) } or null, bul [{ part, x, y, a }] lumps under the skin. Points are [x, y] in metres.
  const V = (x, y) => [x, y];
  const rot = (a, x, y) => [x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a)];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const upA = (A, B) => Math.atan2(B[0] - A[0], B[1] - A[1]);
  const dnA = (A, B) => Math.atan2(A[0] - B[0], A[1] - B[1]);
  const dist = (A, B) => Math.hypot(B[0] - A[0], B[1] - A[1]);
  /** The joint of a two-bone limb from A reaching T (bones l1, l2), bent to side bend (+1: turned anticlockwise from A→T). */
  function ik2(A, T, l1, l2, bend) {
    let dx = T[0] - A[0], dy = T[1] - A[1], d = Math.hypot(dx, dy) || 1e-6;
    if (d > l1 + l2 - 1e-4) { const k = (l1 + l2 - 1e-4) / d; dx *= k; dy *= k; d = l1 + l2 - 1e-4; }
    const c = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))), an = Math.atan2(dy, dx) + bend * Math.acos(c);
    return [A[0] + Math.cos(an) * l1, A[1] + Math.sin(an) * l1];
  }
  /** A standing pose: q { px, py, aP (hips), bW, bC, bN (bends at the waist, chest, neck), ln (neck length), tilt, sw, back, legs [{fx}], arms [...] }. */
  function stand(q) {
    const as = q.asym === false ? 0 : 1, P = V(q.px || 0, 1.13 + (q.py || 0)), aP = (q.aP || 0) + 0.045 * as, aAb = aP + (q.bW || 0) - 0.08 * as, Wj = add(P, rot(aAb, 0, ABL)), aCh = aAb + (q.bC || 0) + 0.11 * as;
    const N = add(Wj, rot(aCh, 0, CHL)), aNk = aCh + (q.bN || 0) - 0.06 * as, H = add(N, rot(aNk, 0, q.ln || NECK)), sw = q.sw == null ? 1 : q.sw;
    const legs = [], arms = [];
    for (const d of [-1, 1]) {
      const i = d < 0 ? 0 : 1, hip = add(P, rot(aP, d * HIPW * sw, 0.01)), A = V(d * 0.095 * (0.6 + 0.4 * sw) + ((q.feet && q.feet[i]) || 0), 0.07);
      legs.push({ hip, K: ik2(hip, A, LTH, LSH, d * 0.35), A });
      const S = add(Wj, rot(aCh, d * SHX * sw, SHY - d * (q.shy == null ? 0.055 : q.shy))), am = q.arms[i];
      if (am.T) { // reaching for a point: foreshortened (it comes toward us) so that it gets there with a slight bend
        const dd = dist(S, am.T), k = Math.max(0.35, Math.min(1, (dd * 1.06) / (LUA + LFA))), E = ik2(S, am.T, LUA * k, LFA * k, am.bend);
        const R = add(E, [(am.T[0] - E[0]) * 1, (am.T[1] - E[1]) * 1]);
        arms.push({ S, E, X: null, R, ha: am.ha, hf: am.hf, hs: am.hs || 1 });
      } else { // hanging or held: angles from straight down, + outward
        const a1 = d * am.a1, a2 = d * am.a2, a3 = d * (am.a3 == null ? am.a2 : am.a3);
        const E = add(S, [Math.sin(a1) * LUA, -Math.cos(a1) * LUA]);
        if (q.kink === false) arms.push({ S, E, X: null, R: add(E, [Math.sin(a2) * LFA, -Math.cos(a2) * LFA]), ha: -a3, hf: am.hf, hs: am.hs || 1 });
        else { // a joint too many, halfway down the forearm, bent the wrong way
          const kb = d * (am.kb == null ? 0.22 : am.kb), X = add(E, [Math.sin(a2 - kb) * LFA * 0.52, -Math.cos(a2 - kb) * LFA * 0.52]), R = add(X, [Math.sin(a2 + kb) * LFA * 0.56, -Math.cos(a2 + kb) * LFA * 0.56]);
          arms.push({ S, E, X, R, ha: -a3 - kb * 0.6, hf: am.hf, hs: am.hs || 1 });
        }
      }
    }
    return { P, W: Wj, N, H, hd: aNk + (q.tilt || 0) + 0.17 * as, back: !!q.back, sw, legs, arms, face: null, bul: [] };
  }
  /** The whole pose made smaller (or larger) about the floor between its feet: f. */
  function scalePose(p, f) {
    const S = (v) => { v[0] *= f; v[1] *= f; };
    [p.P, p.W, p.N, p.H].forEach(S);
    for (const l of p.legs) { S(l.hip); S(l.K); S(l.A); }
    for (const a of p.arms) { S(a.S); S(a.E); if (a.X) S(a.X); S(a.R); }
    p.sc = f; return p;
  }
  /** Between two poses (points and angles), t 0..1. */
  function blend(a, b, t, tHead) {
    const L = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)], th = tHead == null ? t : tHead;
    const o = { P: L(a.P, b.P, t), W: L(a.W, b.W, t), N: L(a.N, b.N, t), H: L(a.H, b.H, th), hd: lerp(a.hd, b.hd, th), back: t < 0.5 ? a.back : b.back, sw: lerp(a.sw, b.sw, t), legs: [], arms: [], face: t < 0.5 ? a.face : b.face, bul: t < 0.5 ? a.bul : b.bul };
    for (let i = 0; i < 2; i++) {
      const p = a.legs[i], q = b.legs[i]; o.legs.push({ hip: L(p.hip, q.hip, t), K: L(p.K, q.K, t), A: L(p.A, q.A, t) });
      const r = a.arms[i], s = b.arms[i];
      o.arms.push({ S: L(r.S, s.S, t), E: L(r.E, s.E, t), X: r.X || s.X ? L(r.X || L(r.E, r.R, 0.5), s.X || L(s.E, s.R, 0.5), t) : null, R: L(r.R, s.R, t), ha: lerp(r.ha, s.ha, t), hf: t < 0.5 ? r.hf : s.hf, hs: lerp(r.hs, s.hs, t) });
    }
    return o;
  }

  /** The draw list of a pose: { p (part), x, y (its joint), a (angle), m (mirror), sx, sy, L (0 body, 1 head), sh (shadow under it), gco }. wob: the outline breathing. */
  function items(q, t, wob, out, dress) {
    out.length = 0;
    const W = (k) => 1 + wob * Math.sin(t * (0.09 + k * 0.023) + k * 2.1);
    const up = (p, A, B, nl, sx, extra) => out.push(Object.assign({ p, x: A[0], y: A[1], a: upA(A, B), m: 1, sx, sy: dist(A, B) / nl, L: 0, sh: 0 }, extra));
    const dn = (p, A, B, nl, m, sx, extra) => out.push(Object.assign({ p, x: A[0], y: A[1], a: dnA(A, B), m, sx, sy: dist(A, B) / nl, L: 0, sh: 0 }, extra));
    const Z = q.sc || 1;
    for (let i = 0; i < 2; i++) {
      const d = i ? 1 : -1, g = q.legs[i];
      dn('thigh', g.hip, g.K, LTH, d, W(i) * (dress === 'twin' ? 0.92 : 1));
      dn('shin', g.K, g.A, LSH, d, W(i + 2));
      out.push({ p: dress === 'man' ? 'shoe' : 'foot', x: g.A[0], y: g.A[1], a: 0, m: d, sx: Z, sy: Z, L: 0, sh: 0 });
      if (dress) { dn('legT', g.hip, g.K, 0.46, d, 1, { sy: dist(g.hip, g.K) / 0.46 }); dn('legS', g.K, g.A, 0.43, d, 1, { sy: dress === 'man' ? dist(g.K, g.A) / 0.43 : 0.86 }); }
    }
    up(q.back ? 'abdB' : 'abd', q.P, q.W, ABL, q.sw * W(4), { sh: 0.45 });
    if (dress) out.push({ p: 'trousers', x: q.P[0], y: q.P[1], a: upA(q.P, q.W), m: 1, sx: q.sw * (dress === 'man' ? 1 : 0.95), sy: Z, L: 0, sh: 0.4 });
    up(q.back ? 'chestB' : 'chest', q.W, q.N, CHL, q.sw * W(5), { sh: 0.5 });
    if (dress) up('jumper', q.W, q.N, CHL, q.sw * (dress === 'man' ? 1 : 0.96), { sh: 0.5, sy: dress === 'man' ? dist(q.W, q.N) / CHL : 0.94 });
    up('neck', q.N, q.H, NECK, W(6));
    for (const bu of q.bul) out.push({ p: 'bulge', x: bu.x, y: bu.y, a: bu.a || 0, m: 1, sx: (bu.s || 1) * Z, sy: (bu.s || 1) * Z, L: 0, sh: 0 });
    for (let i = 0; i < 2; i++) {
      const d = i ? 1 : -1, r = q.arms[i];
      dn('uarm', r.S, r.E, LUA, d, W(7 + i), { sh: 0.5 });
      if (!dress) dn('mantle', r.S, r.E, LUA, d, 1, { sy: 1 });
      if (r.X) { dn('farm', r.E, r.X, LFA, d, W(9 + i)); dn('farm2', r.X, r.R, LFA, d, W(11 + i)); }
      else dn('farm', r.E, r.R, LFA, d, W(9 + i));
      if (dress) {
        dn('sleeveU', r.S, r.E, 0.33, d, 1, { sy: dress === 'man' ? dist(r.S, r.E) / 0.33 : 1.02 });
        const fl = dist(r.E, r.R); dn('sleeveF', r.E, r.R, 0.29, d, 1, { sy: dress === 'man' ? fl / 0.29 : Math.min(1, (fl * 0.62) / 0.29) });
      }
      out.push({ p: r.hf, x: r.R[0], y: r.R[1], a: r.ha, m: d, sx: Z, sy: r.hs * Z, L: 0, sh: 0.45 });
    }
    const HZ = Z * (dress === 'man' ? 1 : 1.22);
    const hb = q.hb != null ? q.hb : q.back;
    out.push({ p: hb ? 'headB' : 'head', x: q.H[0], y: q.H[1], a: q.hd, m: 1, sx: (q.sw < 0.6 && !hb ? 0.86 : 1) * HZ, sy: HZ, L: 1, sh: 0.55 });
    if (q.face && !hb) {
      const f = q.face, [fx, fy] = rot(q.hd, f.x * HZ, f.y * HZ);
      const big = dress === 'man' ? 1 : 1.14;
      out.push({ p: f.f, x: q.H[0] + fx, y: q.H[1] + fy, a: q.hd + f.rot, m: 1, sx: (f.sx || 1) * HZ * big, sy: f.sy * HZ * big, L: 1, sh: 0, gco: f.clip ? 'source-atop' : 'source-over' });
    }
    return out;
  }

  // ---- drawing a figure: its parts into an offscreen picture at its size on screen, darkened to its light, worn in and laid in
  const OFF = [mk(64, 64), mk(64, 64)], OX = OFF.map((c) => c.getContext('2d')), IT = [], BOX = [0, 0, 0, 0];
  const mat = (it, pt, k) => { // the item's transform: sprite px → px about the figure's foot point (y down)
    const c = k / pt.b, cs = Math.cos(it.a), sn = Math.sin(it.a);
    return [c * it.m * it.sx * cs, c * it.m * it.sx * sn, -c * it.sy * sn, c * it.sy * cs, it.x * k, -it.y * k];
  };
  /** Compose the items into OFF[0] (body) / OFF[1] (head) at k px per metre; lk / lh: how much light reaches the body / head. Returns false if it has nothing to draw. */
  function compose(S, its, k, lk, lh, L) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const M = [];
    for (const it of its) {
      const pt = S.parts[it.p]; if (!pt) { M.push(null); continue; }
      const m = mat(it, pt, k), W = pt.cv.width, H = pt.cv.height;
      for (const [u, v] of [[-pt.u0, -pt.v0], [W - pt.u0, -pt.v0], [-pt.u0, H - pt.v0], [W - pt.u0, H - pt.v0]]) {
        const X = m[0] * u + m[2] * v + m[4], Y = m[1] * u + m[3] * v + m[5];
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      M.push(m);
    }
    if (x1 < x0) return false;
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2;
    const w = Math.ceil(x1 - x0) + 4, h = Math.ceil(y1 - y0) + 4;
    if (w > 4096 || h > 4096) return false;
    for (let l = 0; l < 2; l++) {
      const c = OFF[l], x = OX[l];
      if (c.width < w || c.height < h) { c.width = Math.max(c.width, w + 32); c.height = Math.max(c.height, h + 32); }
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, w, h);
    }
    const drop = Math.max(1, k * 0.011);
    for (let n = 0; n < its.length; n++) {
      const it = its[n], m = M[n]; if (!m) continue;
      const pt = S.parts[it.p], x = OX[it.L];
      if (it.sh && it.L === 0) { // its shadow on what is already there
        x.globalCompositeOperation = 'source-atop'; x.globalAlpha = it.sh;
        x.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0 + drop); x.drawImage(pt.sh, -pt.u0 - pt.sp, -pt.v0 - pt.sp);
        x.globalAlpha = 1;
      }
      x.globalCompositeOperation = it.gco || 'source-over';
      x.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0); x.drawImage(pt.cv, -pt.u0, -pt.v0);
      if (it.L === 1 && it.sh) { // the head's shadow on the neck and shoulders
        const x0c = OX[0]; x0c.globalCompositeOperation = 'source-atop'; x0c.globalAlpha = it.sh * 0.8;
        x0c.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0 + drop * 1.6); x0c.drawImage(pt.sh, -pt.u0 - pt.sp, -pt.v0 - pt.sp); x0c.globalAlpha = 1;
      }
    }
    const dk = L ? '34,28,20' : '4,4,3';
    { const x = OX[0], gr = x.createLinearGradient(0, -1.35 * k - y0, 0, -0.05 * k - y0); gr.addColorStop(0, 'rgba(' + dk + ',0)'); gr.addColorStop(1, 'rgba(' + dk + ',' + (L ? 0.45 : 0.72) + ')'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = gr; x.fillRect(0, 0, w, h); }
    for (let l = 0; l < 2; l++) {
      const x = OX[l], a = 1 - (l ? lh : lk);
      x.setTransform(1, 0, 0, 1, 0, 0);
      if (a > 0.01) { x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 1; x.fillStyle = `rgba(${dk},${a.toFixed(3)})`; x.fillRect(0, 0, w, h); }
      x.globalCompositeOperation = 'source-over';
    }
    OX[0].drawImage(OFF[1], 0, 0, w, h, 0, 0, w, h);
    BOX[0] = x0; BOX[1] = y0; BOX[2] = w; BOX[3] = h;
    return true;
  }
  /** Lay the composed figure into the scene at screen point (sx, sy) (its feet), opacity op. */
  function lay(ctx, sx, sy, d, op, kA, gx, L) {
    const [x0, y0, w, h] = BOX, X = sx + x0 / d, Y = sy + y0 / d;
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, op);
    ctx.drawImage(OFF[0], 0, 0, w, h, X, Y, w / d, h / d);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, op * kA);
    ctx.drawImage(OFF[0], 0, 0, w, h, X, Y, w / d, h / d);
    if (gx > 0) { // the tape losing hold of it: its colours split off sideways, a band of it torn across
      const o = (2 + gx * 1.6) * (Math.random() < 0.5 ? -1 : 1), x = OX[1], c = OFF[1];
      if (c.width < w || c.height < h) { c.width = Math.max(c.width, w + 32); c.height = Math.max(c.height, h + 32); }
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.globalAlpha = 1; x.drawImage(OFF[0], 0, 0, w, h, 0, 0, w, h);
      x.globalCompositeOperation = 'source-atop';
      ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
      x.fillStyle = 'rgb(255,40,30)'; x.fillRect(0, 0, w, h); ctx.globalAlpha = (L ? 0.2 : 0.32) * op; ctx.drawImage(c, 0, 0, w, h, X + o, Y, w / d, h / d);
      x.fillStyle = 'rgb(30,190,255)'; x.fillRect(0, 0, w, h); ctx.drawImage(c, 0, 0, w, h, X - o, Y, w / d, h / d);
      x.globalCompositeOperation = 'source-over';
      const by = (Math.random() * h * 0.85) | 0, bh = Math.max(3, (h * (0.03 + Math.random() * 0.07)) | 0), dx = (Math.random() - 0.5) * 0.3 * w;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, op);
      ctx.drawImage(OFF[0], 0, by, w, bh, X + dx / d, Y + by / d, w / d, bh / d);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** Its shadow thrown along the carpet, away from the tube at (lx, lz): long and soft. */
  function cast(g, x, z, lx, lz, op, wid, zmin) {
    let dx = x - lx, dz = z - lz; const dd = Math.hypot(dx, dz); if (dd < 0.2 || op < 0.01) return;
    dx /= dd; dz /= dd;
    let len = Math.min(2.8, 0.6 + dd * 1.1); if (zmin != null && dz < -0.01) len = Math.min(len, Math.max(0.1, (z - zmin) / -dz - 0.25));
    const px = -dz * wid * 0.5, pz = dx * wid * 0.5, x0 = x - dx * 0.25, z0 = z - dz * 0.25;
    if (!g.pr(x0 - px, z0 - pz, 0)) return; const ax = g.sx, ay = g.sy;
    if (!g.pr(x0 + px, z0 + pz, 0)) return; const bx = g.sx, by = g.sy;
    if (!g.pr(x0 - px + dx * len, z0 - pz + dz * len, 0)) return;
    const ctx = g.ctx; ctx.save(); ctx.globalAlpha = Math.min(1, op); ctx.transform(bx - ax, by - ay, g.sx - ax, g.sy - ay, ax, ay); ctx.drawImage(g.spr.blot, 0, 0, 1, 1); ctx.restore();
  }
  /** A whole figure at plan point (x, z) in pose q: contact shadow, composed, worn in, laid in. lit: its room's light. */
  function figure(e, g, BR, x, z, q, op, lit, names, dress, lamp) {
    const ctx = g.ctx;
    if (op <= 0.003 || !g.pr(x, z, 0)) return;
    const s = g.f / g.sz, d = ctx.getTransform().a || 1, k = s * d, S = pick(k, g.L, names);
    if (!S) return;
    const sx = g.sx, sy = g.sy;
    if (lamp) cast(g, x, z, lamp[0], lamp[1], (g.L ? 0.45 : 0.8) * op * lit, q.crawl ? 1.1 : 0.7, lamp[2]);
    BR.contact(g, x, z, q.crawl ? 1.3 : 0.85, op);
    if (!g.pr(x, z, 0)) return;
    items(q, e.tt, 0.03, IT, dress);
    const lk = g.L ? 0.58 + 0.42 * lit : 0.26 + 0.74 * lit, lh = g.L ? 0.85 + 0.15 * lit : 0.5 + 0.5 * lit;
    if (!compose(S, IT, k, lk, lh, g.L)) return;
    lay(ctx, sx, sy, d, op, g.L ? 0.97 : 0.96, e.gx || 0, g.L);
  }

  // ---- the plan helpers (the scene's own are inside it)
  const doorsAhead = (g, a, b, BR) => { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0; j < g.j0 + 8; j++) { const dd = (j + 1) * BR.C - g.camZ; if (dd >= a && dd <= b && g.cr(j, 0) === 2) o.push(j); } return o; };
  /** How far down the hall to stand (at least lo m) so that the doorway in front of it does not cut off its head. */
  function clearAhead(g, BR, lo) {
    for (let j = g.j0; j < g.j0 + 6; j++) {
      if (g.cr(j, 0) !== 2) continue;
      const dW = (j + 1) * BR.C - g.camZ;
      if (dW < 0.5) continue;
      if (dW > lo + 0.8) return g.camZ + Math.min(dW - 0.7, lo + 0.6); // in front of it
      if (dW - 0.6 >= 2.8) return g.camZ + dW - 0.6; // (or just in front of it, close)
      return g.camZ + Math.max(lo, dW / 0.6, dW + 1.0); // or far enough past it
    }
    return g.camZ + lo + 0.5;
  }

  /** The face on its head, never quite where a face goes: low, off to one side, crooked, stretched, slipping in jerks. */
  const faceOn = (e, f, extra) => { const t = Math.floor(e.tt / 5) * 5; return Object.assign({ x: 0.006 + 0.004 * Math.sin(t * 0.031), y: -0.026 - 0.006 * (0.5 + 0.5 * Math.sin(t * 0.047 + 1)), rot: 0.07 + 0.04 * Math.sin(t * 0.023), sy: 1.07 + 0.03 * Math.sin(t * 0.05), f }, extra); };
  const twitch = (e, k) => (BR_hash(e.tt >> 2, k, 31) < 0.14 ? 'hand1' : 'hand0');
  let BR_hash = null;
  const hang = (a1, a2, hf, extra) => Object.assign({ a1, a2, hf }, extra);
  /** Stop-motion: its own clock, held in steps of n frames. */
  const held = (e, n) => Math.floor(e.tt / n) * n;
  /** A twitch: a small angle that snaps to a new value every few frames and holds there (or rests at 0). */
  const snapv = (e, n, k, amp) => { const h = Math.floor(e.tt / n); return (BR_hash(h, k, 57) - 0.5) * 2 * amp * (BR_hash(h, k, 58) < 0.45 ? 1 : 0); };
  /** The tape losing hold of it: a torn line through the figure, its colours split for a few frames. */
  function jolt(e, g, st, BR, n) {
    BR.glitch(st, n); e.gx = n + 1;
    const at = st.evAt;
    if (at) { const h = g.ctx.canvas.height / (g.ctx.getTransform().a || 1); st.glY = Math.max(0, Math.min(0.97, (at[1] - at[2] * (0.3 + Math.random() * 0.9)) / (h * 0.9))); st.glH = 0.04 + Math.random() * 0.06; }
  }
  /** The tracking band, sent up through it. */
  const band = (st) => { const at = st.evAt; if (at) st.trk = { y: at[1] + at[2] * 0.95, hh: 16 + Math.random() * 22, v: 1.3 + Math.random() }; };

  // ---- the ways it shows up
  const VAR = {};

  /* jamb: behind the wall beside the nearest doorway (row J + 1), half of it in the opening and its head up behind the
     lintel; its fingers come round the frame on our side (row J); then it leans out */
  VAR.jamb = {
    w: 1.1,
    place(g, BR) {
      const o = doorsAhead(g, 3.2, 4.7, BR); if (!o.length) return null;
      const J = o[0], side = Math.random() < 0.5 ? -1 : 1;
      return { v: 'jamb', own: true, J, side, x: side * 0.9, z: (J + 1) * BR.C + BR.TH + 0.32, life: 228, tt: 0, sw: 0, swv: 0, grip: [0, 0, 0, 0], lift: [0, 0, 0, 0], lp: 0, ext: 0, ov: 0 };
    },
    step(e, g, st, BR) {
      const a = e.age, s = e.side, t = e.tt, J = e.J, key = a >= 146 && a < 164;
      e.cl = [[0, J + 1, a < 12 ? BR.flick(a, 5) : a > 184 && a < 196 ? BR.flick(a, 6) : 1], [0, J, a < 8 ? BR.flick(a + 3, 7) : key ? BR.flick(a, 12) : 1]];
      e.vis = a < 8 ? 0 : a < 186 ? 1 : 0;
      const snap = ss(182, 185, a);
      e.lp = (Math.floor(ss(100, 152, t) * 8) / 8) * (1 - snap); // the lean, in jerks
      e.ext = (Math.floor(ss(124, 166, t) * 6) / 6) * (1 - snap); // the neck still going after the body has stopped
      e.ov = bump(160, 167, 180, t) * (1 - snap);
      e.x = s * (0.9 - 0.04 * e.lp + 0.75 * snap);
      for (let i = 0; i < 4; i++) {
        const t0 = [20, 27, 42, 34][i];
        e.grip[i] = ss(t0, t0 + 10, a - (BR.hash(a >> 2, i, 9) < 0.3 ? 2 : 0)) * (1 - ss(180, 183, a));
        const dr = (t - 62) / 6.5, which = [3, 1, 2, 0, 3, 2, 0, 1][Math.floor(dr) & 7];
        e.lift[i] = t > 62 && t < 112 && which === i ? bump(0, 0.25, 0.7, dr - Math.floor(dr)) : 0;
      }
      const tgt = -s * 4 * (e.lp - (e.lp0 || 0)); e.lp0 = e.lp; // the arm left hanging swings late as the body leans
      e.swv += (tgt - e.sw) * 0.1 - e.swv * 0.12; e.sw += e.swv;
      if (a === 150) { jolt(e, g, st, BR, 2); band(st); }
      if (a === 182) jolt(e, g, st, BR, 4);
      if (a === 187) st.flick = BR.DIP.length;
    },
    pose(e, g, BR) {
      const s = e.side, lp = e.lp, ext = e.ext;
      const q = { px: 0, aP: -s * 0.05 * lp, bW: -s * 0.36 * lp + snapv(e, 7, 1, 0.03), bC: -s * (0.4 * lp + 0.14 * ss(0.5, 1, lp)) + snapv(e, 9, 2, 0.04), bN: -s * (0.42 * lp + 0.55 * ext), ln: NECK + 0.22 * ext,
        tilt: s * (0.9 * lp + 0.85 * ext) - s * 0.5 * e.ov + snapv(e, 6, 3, 0.08), arms: [null, null] };
      // the near arm reaches round to the jamb, where its fingers are
      const ia = s > 0 ? 0 : 1, zf = (e.J + 1) * BR.C, gy = 1.45;
      let T = [-s * 0.12, gy];
      if (g.pr(s * 0.85, zf + 0.02, gy)) { const ex = g.sx, ey = g.sy; if (g.pr(e.x, e.z, 0)) { const sc = g.f / g.sz; T = [(ex - g.sx) / sc + s * 0.01, (g.sy - ey) / sc]; } }
      q.arms[ia] = { T: [T[0] - s * 0.075, T[1] + 0.01], bend: s, ha: -s * 1.35, hf: 'hand1', hs: 0.8 };
      q.arms[1 - ia] = hang(0.05 - e.sw * s, 0.02 - e.sw * s * 1.3, twitch(e, 2));
      const p = stand(q);
      p.face = faceOn(e, e.tt > 150 ? (e.tt > 166 ? 'face2' : 'face1') : 'face0');
      const u = (e.tt % 70) / 70; p.bul = [{ x: lerp(p.N[0], p.H[0], 0.2 + 0.6 * u) + s * 0.025, y: lerp(p.N[1], p.H[1], 0.2 + 0.6 * u), s: 0.8 }];
      return p;
    },
    draw(e, g, j, c, BR) {
      if (c !== 0) return;
      if (j === e.J) return this.grip(e, g, BR);
      if (j !== BR.ROW(e.z) || !e.vis) return;
      figure(e, g, BR, e.x, e.z, this.pose(e, g, BR), e.vis * BR.far(e.z - g.camZ), g.lum(0, j) * g.glob, NEED.base.concat(NEED.jamb), null, [0, (j + 0.5) * BR.C, j * BR.C + BR.TH]);
    },
    /** Its fingers on our side of the wall: round the jamb's edge, lying along the wall, drumming. */
    grip(e, g, BR) {
      if (!e.vis || !e.grip.some((v) => v > 0.01)) return;
      const ctx = g.ctx, s = e.side, zf = (e.J + 1) * BR.C, gy = 1.45, x0 = s * 0.85;
      if (!g.pr(x0, zf - 0.004, gy)) return;
      const ex = g.sx, sc = g.f / g.sz, d = ctx.getTransform().a || 1, k = sc * d, S = pick(k, g.L, ['finger']); if (!S) return;
      const pt = S.parts.finger, lit = g.lum(0, e.J) * g.glob, op = BR.far(zf - g.camZ), FL = [0.172, 0.19, 0.18, 0.15];
      const w = Math.ceil(0.32 * k) + 8, h = Math.ceil(0.2 * k) + 8, ox = s > 0 ? 4 : w - 4, oy = Math.ceil(0.05 * k) + 4, x = OX[1], c = OFF[1];
      if (c.width < w || c.height < h) { c.width = Math.max(c.width, w + 32); c.height = Math.max(c.height, h + 32); }
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, w, h);
      const ms = [];
      for (let i = 0; i < 4; i++) {
        const ap = e.grip[i]; if (ap <= 0.01) { ms.push(null); continue; }
        const lf = e.lift[i], a = [0.02, 0.17, 0.08, 0.34][i] - 0.3 * lf + snapv(e, 5, 20 + i, 0.07), cs = Math.cos(a), sn = Math.sin(a), cc = k / pt.b, sxL = (FL[i] / 0.19) * (1 - 0.35 * lf), th = 1.15;
        const back = (1 - ap) * FL[i] * k; // how much of it is still behind the edge
        ms.push([s * cs * cc * sxL, sn * cc * sxL, -s * sn * cc * th, cs * cc * th, ox - s * cs * back, oy + [0, 0.026, 0.05, 0.068][i] * k - sn * back, lf]);
      }
      for (let i = 3; i >= 0; i--) { const m = ms[i]; if (!m) continue; x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); x.drawImage(pt.cv, -pt.u0, -pt.v0); }
      const lk = g.L ? 0.6 + 0.4 * lit : 0.3 + 0.7 * lit, dk = g.L ? '34,28,20' : '4,4,3';
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(' + dk + ',' + (1 - lk).toFixed(3) + ')'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
      const X = ex - ox / d, Y = g.sy - oy / d; // on the main picture: only the wall's side of the edge
      ctx.save(); ctx.beginPath(); if (s > 0) ctx.rect(ex, Y - 50, w / d + 50, h / d + 100); else ctx.rect(ex - w / d - 50, Y - 50, w / d + 50, h / d + 100); ctx.clip();
      ctx.globalAlpha = (g.L ? 0.32 : 0.5) * op; // their shadows on the wall, further off the more a finger is lifted
      for (let i = 0; i < 4; i++) { const m = ms[i]; if (!m) continue; const q = Math.max(1, k / 120), dx = ((1 + 3 * m[6]) * s * q) / d, dy = ((1.5 + 3 * m[6]) * q) / d; ctx.save(); ctx.translate(X + dx, Y + dy); ctx.scale(1 / d, 1 / d); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); ctx.drawImage(pt.sh, -pt.u0 - pt.sp, -pt.v0 - pt.sp); ctx.restore(); }
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = op; ctx.drawImage(c, 0, 0, w, h, X, Y, w / d, h / d);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = op * 0.97; ctx.drawImage(c, 0, 0, w, h, X, Y, w / d, h / d);
      ctx.restore();
    },
  };

  /* light: far down the hall under a tube that has just died; at each dip of the lights it is nearer, waving */
  VAR.light = {
    w: 1,
    place(g, BR) {
      const z = g.camZ + 11.5 + Math.random() * 2.5;
      return { v: 'light', own: true, J: BR.ROW(z), i: 0, x: (Math.random() - 0.5) * 0.7, z, stage: 0, life: 272, tt: 0, hand: Math.random() < 0.5 ? -1 : 1 };
    },
    step(e, g, st, BR) {
      const a = e.age;
      if (a === 94 || a === 156 || a === 258) st.flick = BR.DIP.length; // the whole floor dips, and between one frame and the next it has come on
      if (a >= 97 && e.stage < 1) { e.stage = 1; e.z = clearAhead(g, BR, 6.4); e.x = e.hand * 0.45; e.J = BR.ROW(e.z); jolt(e, g, st, BR, 2); }
      if (a >= 159 && e.stage < 2) { e.stage = 2; e.z = clearAhead(g, BR, 3.4); e.x = -e.hand * 0.18; e.J = BR.ROW(e.z); jolt(e, g, st, BR, 3); band(st); }
      // the tube over it: dying. Far off it is mostly out and catches now and then; close up it buzzes on, and drops out
      const hz = BR.hash(a >> 1, 3, 91);
      e.lv = e.stage < 2 ? ((a < 40 ? hz < 0.3 : hz < 0.07) ? 0.25 + 0.35 * BR.hash(a >> 1, 4, 91) : 0.03) : hz < 0.12 ? 0.05 : 0.55 + 0.3 * BR.hash(a >> 1, 5, 91);
      e.cl = [[0, e.J, e.lv]];
      e.vis = ss(20, 40, a) * (a < 261 ? 1 : 0);
      if (a === 214) jolt(e, g, st, BR, 2);
    },
    pose(e, g, BR) {
      const a = e.age, t = e.tt, wv = e.hand;
      // the head: a friendly tilt, then on past it, held, and snapped back
      const tilt = 0.12 + 0.2 * ss(170, 186, t) + 0.6 * ss(192, 200, t) * (1 - ss(213, 215, a)) + snapv(e, 8, 4, 0.06);
      const q = { px: wv * 0.035, aP: wv * 0.06, bW: -wv * 0.05, bC: -wv * 0.04 + snapv(e, 11, 5, 0.03), bN: -wv * 0.05, tilt: -wv * tilt, feet: wv > 0 ? [-0.03, 0.06] : [-0.06, 0.03], arms: [null, null] };
      // the wave: far off it stands with its arms down; nearer, the arm is already up; it swings far too slowly, the hand flopping behind at the wrist
      const up = e.stage === 0 ? 0 : 1 - ss(236, 239, a), ph = Math.max(0, t - 97) * (TAU / 62), sw = Math.sin(ph);
      const drop = a > 238 ? Math.exp(-(a - 238) / 14) * Math.cos((a - 238) * 0.45) : 0;
      const a1 = lerp(0.06, 1.3, up) + 0.35 * drop, a2 = lerp(0.03, Math.PI - 0.15 + 0.45 * sw, up) + 0.5 * drop, a3 = a2 + up * (-1.15 * Math.cos(ph) + 0.15);
      const wi = wv > 0 ? 1 : 0;
      q.arms[wi] = { a1, a2, a3, hf: up > 0.6 ? 'hand2' : 'hand0', kb: up > 0.5 ? -0.25 : 0.22 };
      q.arms[1 - wi] = hang(0.07, 0.02, twitch(e, 3));
      const p = stand(q);
      p.face = faceOn(e, a > 222 ? 'face2' : a > 200 ? 'face1' : 'face0');
      const u = (t % 90) / 90; p.bul = [{ x: lerp(p.P[0], p.W[0], 0.5) + 0.1 * (u - 0.5), y: lerp(p.P[1], p.W[1], 0.3 + 0.4 * u), s: 1.1 }];
      return p;
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
      const lit = Math.max(0.1, g.lum(0, j) * g.glob);
      figure(e, g, BR, e.x, e.z, this.pose(e, g, BR), e.vis * BR.far(e.z - g.camZ), lit, NEED.base.concat(NEED.light), null, [0, (j + 0.5) * BR.C]);
    },
  };

  /* turn: close, down the hall, its back to us; it turns round, and the face comes a moment late */
  VAR.turn = {
    w: 1,
    place(g, BR) {
      const z = clearAhead(g, BR, 3.6), dir = Math.random() < 0.5 ? -1 : 1;
      return { v: 'turn', own: true, J: BR.ROW(z), dir, x: dir * (0.12 + Math.random() * 0.18), z, life: 242, tt: 0 };
    },
    step(e, g, st, BR) {
      const a = e.age;
      e.cl = [[0, e.J, a < 12 ? BR.flick(a, 8) : a >= 152 && a < 166 ? BR.flick(a, 13) : a > 226 && a < 236 ? BR.flick(a, 9) : 1]];
      e.vis = a < 10 ? 0 : a < 231 ? 1 : 0;
      if (a === 112 || a === 118) jolt(e, g, st, BR, 1);
      if (a === 156) { jolt(e, g, st, BR, 3); band(st); }
      if (a === 228) { st.flick = BR.DIP.length; jolt(e, g, st, BR, 3); }
    },
    pose(e, g, BR) {
      const a = e.age, t = e.tt, dir = e.dir;
      // the turn in held steps: square on, side on, square on again with its front to us
      const k = a < 110 ? 0 : a < 114 ? 1 : a < 118 ? 2 : a < 122 ? 3 : 4, back = k < 2, sw = [1, 0.55, 0.32, 0.6, 1][k];
      const q = { px: 0, aP: snapv(e, 13, 6, 0.02), bW: snapv(e, 9, 7, 0.025), bC: snapv(e, 7, 8, 0.04), bN: 0.04 + snapv(e, 10, 9, 0.05), back, sw,
        tilt: (back ? 0.14 * bump(30, 50, 90, t) + snapv(e, 6, 10, 0.1) : 0) + 0.32 * bump(196, 204, 214, t) - 0.08 * ss(205, 214, t), arms: [back ? hang(0.06, 0.02, twitch(e, 4)) : hang(0.14, -0.95, 'hand1', { a3: -0.55, kb: 0.12 }), hang(0.04, 0.0, twitch(e, 5))] };
      const p = stand(q);
      // the face: not there at first; then sliding round onto the head from the side it turned from, overshooting, slipping back, settling crooked
      const fin = ss(132, 148, held(e, 2)), over = bump(142, 149, 155, a), back2 = ss(155, 157, a);
      const fx = dir * (-0.105 * (1 - fin) + 0.026 * over - 0.006 * back2), fr = dir * (0.2 * (1 - fin) - 0.08 * back2);
      if (!back && a > 131) p.face = faceOn(e, a > 205 ? 'face2' : a > 186 ? 'face1' : 'face0', { x: fx + 0.006 * back2, rot: fr + 0.07, clip: fin < 0.85 });
      // under the skin of its back, something crawling across the shoulders
      if (back) { const u = ((t + 20) % 80) / 80; p.bul = [{ x: lerp(-0.13, 0.13, u) * dir, y: p.W[1] + 0.33 + 0.04 * Math.sin(u * 6), s: 1.3 }, { x: 0.04, y: p.N[1] + 0.12 * ((t % 60) / 60), s: 0.8 }]; }
      return p;
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
      figure(e, g, BR, e.x, e.z, this.pose(e, g, BR), e.vis * BR.far(e.z - g.camZ), g.lum(0, j) * g.glob, NEED.base.concat(NEED.turn), null, [0, (j + 0.5) * BR.C]);
    },
  };

  /* crawl: out from behind the jamb of a doorway, sideways on all fours, facing us; through it toward us; then it stands up, taller than the door */
  VAR.crawl = {
    w: 0.9,
    place(g, BR) {
      const o = doorsAhead(g, 4.4, 7, BR); if (!o.length) return null;
      const J = o[0], side = Math.random() < 0.5 ? -1 : 1, zf = (J + 1) * BR.C;
      return { v: 'crawl', own: true, J, side, zf, x: side * 1.6, z: zf + 0.6, zEnd: zf - 1.5, life: 262, tt: 0, hx: side * 1.6, rise: 0 };
    },
    step(e, g, st, BR) {
      const a = e.age, s = e.side, t = e.tt;
      e.cl = [[0, e.J + 1, a < 14 ? BR.flick(a, 10) : 0.4], [0, e.J, a >= 156 && a < 190 ? (BR.hash(a >> 1, 2, 17) < 0.4 ? 0.2 : 1) : a > 250 && a < 260 ? BR.flick(a, 11) : 1]];
      e.vis = a < 12 ? 0 : a < 255 ? 1 : 0;
      if (a >= 88 && !e.zSet) { // where it will stand: about 3.5 m off, and never just behind a doorway (the lintel would take its head)
        e.zSet = true; let z = Math.min(e.zf - 0.5, g.camZ + 3.5);
        for (let j = g.j0; j <= e.J; j++) { const zw = (j + 1) * BR.C; if (z > zw - 0.4 && z < zw + 1.7) z = zw - 0.45 >= g.camZ + 2.6 ? zw - 0.45 : Math.min(e.zf - 0.5, zw + 1.7); }
        e.zEnd = z;
      }
      e.x = s * (1.6 - 1.5 * ss(12, 70, held(e, 3)));
      e.z = e.zf + 0.6 - (e.zf + 0.6 - e.zEnd) * ss(88, 150, held(e, 3));
      e.rise = Math.floor(ss(152, 188, t) * 5) / 5; // standing up, in jerks
      if (Math.abs(e.x - e.hx) > 0.18 || a < 13 || e.rise > 0) e.hx = e.x; // the head stays where it was while the body jerks along under it, then catches up
      if (a === 160 || a === 172) jolt(e, g, st, BR, 1);
      if (a === 189) { jolt(e, g, st, BR, 3); band(st); }
      if (a === 236) jolt(e, g, st, BR, 2);
      if (a === 251) st.flick = BR.DIP.length;
    },
    pose(e, g, BR) {
      const a = e.age, t = e.tt, s = e.side, mv = (a > 12 && a < 72) || (a > 88 && a < 152) ? 1 : 0;
      const ph = held(e, 2) * 0.17; // its gait: the same side's hand and foot together, as nothing crawls
      const lift = (k) => mv * Math.max(0, Math.sin(ph + k * Math.PI)) * 0.09, slide = (k) => mv * Math.cos(ph + k * Math.PI) * 0.07 * -s;
      const by = 0.03 * mv * Math.abs(Math.sin(ph)), dh = (e.hx - e.x) * (1 - e.rise);
      const C = {
        P: [0, 1.02 + by], W: [0, 0.84 + by], N: [0, 0.69 + by * 0.5], H: [dh, 0.69 + 0.46], hd: -dh * 1.2 + snapv(e, 7, 11, 0.12), back: true, hb: false, sw: 1, face: null, bul: [],
        legs: [-1, 1].map((d) => ({ hip: [d * 0.09, 1.0 + by], K: [d * 0.46, 0.8 + lift(d < 0 ? 0 : 1) * 0.6], A: [d * 0.31 + slide(d < 0 ? 0 : 1) * 0.6, 0.2 + lift(d < 0 ? 0 : 1) * 0.5] })),
        arms: [-1, 1].map((d) => { const k = d < 0 ? 0 : 1, l = lift(k); return { S: [d * 0.2, 0.66 + by], E: [d * 0.44, 0.97 + by + l * 0.5], X: [d * 0.66, 0.56 + l * 0.6], R: [d * 0.55 + slide(k), 0.06 + l], ha: 0, hf: 'hand2', hs: 0.5 }; }),
      };
      C.face = faceOn(e, 'face0');
      const up = stand({ px: 0, bN: 0.02 + snapv(e, 9, 12, 0.05), tilt: snapv(e, 6, 13, 0.12) + 0.35 * bump(222, 230, 244, t) - 0.5 * bump(236, 238, 246, a), arms: [hang(0.14, -0.95, 'hand1', { a3: -0.55, kb: 0.12 }), hang(0.05, 0.02, twitch(e, 7))] });
      up.face = faceOn(e, a > 226 ? 'face2' : a > 210 ? 'face1' : 'face0');
      const r = e.rise, p = r <= 0 ? C : r >= 1 ? up : blend(C, up, r, ss(0.35, 1, r));
      p.crawl = r < 0.5; p.hb = false;
      if (r > 0 && r < 1) { p.back = p.N[1] - p.W[1] < 0; p.face = r < 0.5 ? C.face : up.face; }
      return p;
    },
    draw(e, g, j, c, BR) {
      if (c !== 0 || j !== BR.ROW(e.z) || !e.vis) return;
      const lit = Math.max(0.12, g.lum(0, j) * g.glob);
      figure(e, g, BR, e.x, e.z, this.pose(e, g, BR), e.vis * BR.far(e.z - g.camZ), lit, NEED.base.concat(NEED.crawl), null, [0, (j + 0.5) * BR.C, e.z > e.zf ? e.zf + BR.TH : null]);
    },
  };

  /* twin: a man walks past a far doorway; in the nearest one the same man is standing, too still. That one is wrong. */
  VAR.twin = {
    w: 0.9,
    place(g, BR) {
      const o = doorsAhead(g, 3.2, 14, BR), near = o.filter((j) => (j + 1) * BR.C - g.camZ <= 5.4);
      if (!near.length) return null;
      const J1 = near[0], far = o.filter((j) => j > J1 && (j + 1) * BR.C - g.camZ >= 7);
      if (!far.length) return null;
      const J2 = far[0], dir = Math.random() < 0.5 ? -1 : 1, side = Math.random() < 0.5 ? -1 : 1;
      return { v: 'twin', own: true, J: J1, J2, dir, side, x: side * 0.32, z: (J1 + 1) * BR.C + BR.TH + 0.5, wx: -dir * 2.2, wz: (J2 + 1) * BR.C + BR.TH + 1.0, life: 248, tt: 0 };
    },
    step(e, g, st, BR) {
      const a = e.age;
      e.wx = -e.dir * 2.2 + e.dir * 0.042 * Math.max(0, a - 6); // the man: an ordinary walk, 1.25 m a second
      e.wv = e.wx * e.dir < 2.3 ? 1 : 0;
      e.cl = [[0, e.J2 + 1, 1], [0, e.J + 1, a > 48 && a < 54 ? 0.15 : 1], [0, e.J, a >= 196 && a < 214 ? BR.flick(a, 14) : 1]];
      if (a === 48) st.flick = BR.DIP.length; // between one flicker and the next, the other one is there
      e.vis = a < 52 ? 0 : a < 238 ? 1 : 0;
      if (a === 52) jolt(e, g, st, BR, 1);
      if (a === 228) { jolt(e, g, st, BR, 3); band(st); }
      if (a === 235) st.flick = BR.DIP.length;
    },
    draw(e, g, j, c, BR) {
      if (c !== 0) return;
      const names = NEED.base.concat(NEED.twin), a = e.age;
      if (j === BR.ROW(e.wz) && e.wv && a > 6) { // the man, walking (seen from the side)
        const ph = (e.wx * e.dir + 2.2) * 4.2, d = e.dir, sw = (k) => Math.sin(ph + k * Math.PI);
        const P = [0, 0.98 + 0.02 * Math.abs(Math.cos(ph))], q = { P, W: [0.01 * d, P[1] + 0.24], N: [0.03 * d, P[1] + 0.73], H: [0.035 * d, P[1] + 0.82], hd: 0.04 * d, back: false, sw: 0.55, bul: [], face: null, legs: [], arms: [] };
        for (const k of [0, 1]) {
          const an = sw(k) * 0.42, hip = [0, P[1]], K = [Math.sin(an) * 0.45 * d, P[1] - Math.cos(an) * 0.45], bnd = Math.max(0, Math.sin(ph + k * Math.PI + 1.7)) * 0.7;
          q.legs.push({ hip, K, A: [K[0] + Math.sin(an - bnd) * 0.44 * d, Math.max(0.07, K[1] - Math.cos(an - bnd) * 0.44)] });
          const b = -sw(k) * 0.32, S = [0.0, q.N[1] - 0.06], E = [S[0] + Math.sin(b) * 0.31 * d, S[1] - Math.cos(b) * 0.31], R = [E[0] + Math.sin(b * 1.4 + 0.15) * 0.26 * d, E[1] - Math.cos(b * 1.4) * 0.26];
          q.arms.push({ S, E, X: null, R, ha: -(b * 1.4 + 0.15) * d, hf: 'handH', hs: 1 });
        }
        q.face = { x: 0.03 * d, y: -0.004, rot: 0, sy: 1, sx: 0.55, f: 'faceH' };
        figure(e, g, BR, e.wx, e.wz, q, BR.far(e.wz - g.camZ) * ss(0, 6, a - 6), g.lum(0, j) * g.glob, names, 'man', [0, (j + 0.5) * BR.C]);
      }
      if (j === BR.ROW(e.z) && e.vis) { // the other one: still, too tall, its clothes too short on it
        const t = e.tt, still = a < 140;
        const tilt = still ? 0.04 : 0.04 + 0.45 * (Math.floor(ss(140, 200, t) * 6) / 6) + snapv(e, 7, 14, 0.05) - 1.15 * ss(228, 230, a);
        const q = stand({ px: 0, bN: 0.05, ln: NECK * 0.75, tilt, kink: false, asym: false, arms: [hang(0.03, 0.0, 'hand0'), hang(0.03, 0.0, still ? 'hand0' : twitch(e, 8))] });
        q.face = still ? { x: 0, y: -0.002, rot: 0.02, sy: 1, f: 'face0' } : faceOn(e, a > 205 ? 'face2' : a > 180 ? 'face1' : 'face0', { y: -0.006 - 0.02 * (Math.floor(ss(150, 215, t) * 5) / 5) });
        figure(e, g, BR, e.x, e.z, scalePose(q, 0.86), e.vis * BR.far(e.z - g.camZ), g.lum(0, j) * g.glob, names, 'twin', [0, (j + 0.5) * BR.C, j * BR.C + BR.TH]);
      }
    },
  };

  const ORDER = ['jamb', 'light', 'turn', 'crawl', 'twin'];
  let lastV = '';
  const ALIAS = { peek: 'jamb', tall: 'light', figure: 'light', back: 'turn', crawler: 'crawl', double: 'twin' };

  (window.BR_ENT = window.BR_ENT || {}).skinstealer = {
    /** Choose and place a visit (v: the one asked for, or none: any but the last). */
    place(g, v, BR) {
      BR_hash = BR.hash;
      let names;
      if (v) { v = ALIAS[v] || v; if (!VAR[v]) return undefined; names = [v]; }
      else {
        const pool = ORDER.filter((n) => n !== lastV); names = [];
        while (pool.length) { let t = 0; for (const n of pool) t += VAR[n].w; let r = Math.random() * t, i = 0; while (i < pool.length - 1 && (r -= VAR[pool[i]].w) > 0) i++; names.push(pool.splice(i, 1)[0]); }
      }
      for (const n of names) {
        const e = VAR[n].place(g, BR);
        if (e) {
          lastV = n;
          // start baking what it will need, at about the size it will be
          const dpr = window.devicePixelRatio || 1, nm = NEED.base.concat(NEED[n]);
          want(setFor(bucketFor((g.f / 3.8) * dpr), g.L), nm); // (first for the moment it is close)
          if (g.pr(e.x, e.z, 1.2)) want(setFor(bucketFor((g.f / g.sz) * dpr), g.L), nm);
          return e;
        }
      }
      return null;
    },
    step(e, g, st, BR) {
      BR_hash = BR.hash;
      if (!e.own) return;
      BR.tick(e, 0.07);
      if (e.gx > 0) e.gx--;
      VAR[e.v].step(e, g, st, BR);
      // bake: first for the size it is at now, then whatever else this visit asked for (the size it will be when close)
      const budget = e.vis > 0.05 ? 3.5 : 7, t0 = performance.now();
      if (g.pr(e.x, e.z, 1.2)) { const S = setFor(bucketFor((g.f / g.sz) * (window.devicePixelRatio || 1)), g.L); want(S, NEED.base.concat(NEED[e.v])); work(S, budget); }
      for (const S of SETS.values()) { const left = budget - (performance.now() - t0); if (left < 0.5) break; if (S.L === g.L && (S.jobs.length || S.gen)) work(S, left); }
    },
    draw(e, g, j, c, BR) {
      if (!e.own) { BR.EV.skinstealer.draw(e, g, j, c); return; }
      VAR[e.v].draw(e, g, j, c, BR);
    },
  };
})();
