'use strict';
/*
 * 거미줄: the undergrowth at dawn, seen close; an orb-weaver builds its web the way it really does, step by step.
 * - The bridge line: from the tip of a twig the spider lets a thread out into the breeze, which carries it off,
 *   wafting, sagging and swinging, until its end snags on a twig across the gap. The spider hauls in the slack and
 *   walks across, laying a second line over the first.
 * - It fastens a loose thread at the far end and walks back laying it (it hangs below the bridge), steps out onto it
 *   (its weight pulls it into a V) and from the middle drops on a dragline to a twig below: the Y, whose fork is the hub.
 * - The frame threads from twig to twig round the edge; then the radii one by one, each carried out from the hub along
 *   a finished one and across the frame, the gaps filled evenly; the hub's tight mesh and a widely spaced temporary
 *   spiral outward; then the sticky capture spiral from the outside in, closely and evenly spaced (back and forth in
 *   the deeper corners and lower part first), the temporary spiral cut away as it goes, a free zone left round the
 *   hub. The spider settles at the hub, head down.
 * - Dew beads form along the threads and catch the low sun (refracting drops, glints as the web sways in the breeze).
 *   Now and then an insect flies into it and struggles: the spider feels it, turns and plucks the radius, runs out and
 *   bites, then turns round and brings its abdomen down onto the prey, rolling it while the hind legs comb bands of
 *   silk over it until it is a pale mummy; it cuts it free and carries it to the hub on a short thread, or leaves it
 *   hanging in the web. In the end the web is torn (a gust, a beetle crashing through, a falling leaf) and falls into
 *   dangling strands; the spider drops away on a line, and the view moves on through the undergrowth to another twig,
 *   where a spider is about to begin.
 * Everything is ink (twigs, the spider) and light (silk, dew, haze) over the theme's own background. On a light page
 * it has its own palette: grey silk, drops like little lenses (a dark rim, a white highlight), brown-grey twigs.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('spiderweb'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, DT = 1 / 30, RND = Math.random;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1).toFixed(3)})`;
  const P = (x, y) => ({ x, y });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => ((((a - b) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  const LX = 0.77, LY = 0.64; // the low sun's light travels down and to the right (it comes from the upper left)
  // thread kinds
  const BRIDGE = 0, FRAME = 1, RADIUS = 2, ANCHOR = 3, HUB = 4, TEMP = 5, CAP = 6;

  /* ---------- polylines ---------- */

  function poly(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function polyAt(pl, s) {
    const { pts, cum } = pl, n = pts.length;
    if (n < 2) return { x: pts[0].x, y: pts[0].y, tx: 1, ty: 0 };
    s = clamp(s, 0, pl.len);
    let lo = 1, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
    const a = pts[lo - 1], b = pts[lo], L = cum[lo] - cum[lo - 1] || 1e-6, k = (s - cum[lo - 1]) / L;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx: (b.x - a.x) / L, ty: (b.y - a.y) / L };
  }
  /** The point of a polyline nearest p (only its stretch s0 … s1), with its arc length s and direction. */
  function polyNear(pl, p, s0 = 0, s1 = Infinity) {
    const { pts, cum } = pl;
    let best = null, bd = Infinity;
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < s0 || cum[i - 1] > s1) continue;
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-6;
      let k = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
      k = clamp(k, Math.max(0, (s0 - cum[i - 1]) / L), Math.min(1, (s1 - cum[i - 1]) / L));
      const x = a.x + dx * k, y = a.y + dy * k, d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) { bd = d; best = { x, y, s: cum[i - 1] + k * L, tx: dx / L, ty: dy / L }; }
    }
    return best;
  }
  /** The stretch of a polyline from s0 to s1 (either way round), as points. */
  function subPoly(pl, s0, s1) {
    const a = Math.min(s0, s1), b = Math.max(s0, s1), out = [polyAt(pl, a)];
    for (let i = 0; i < pl.pts.length; i++) if (pl.cum[i] > a + 0.5 && pl.cum[i] < b - 0.5) out.push(pl.pts[i]);
    out.push(polyAt(pl, b));
    const r = out.map((q) => P(q.x, q.y));
    return s1 < s0 ? r.reverse() : r;
  }
  /** Where segment ab crosses cd: [t along ab, u along cd], or null. */
  function segX(a, b, c, d) {
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const qx = c.x - a.x, qy = c.y - a.y, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  }
  /** Where the ray from o at angle ang leaves the polygon: its distance, the edge and the place along it. */
  function rayPoly(o, ang, pg) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = Infinity, edge = -1, eu = 0;
    for (let i = 0; i < pg.length; i++) {
      const a = pg[i], b = pg[(i + 1) % pg.length], sx = b.x - a.x, sy = b.y - a.y, den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const qx = a.x - o.x, qy = a.y - o.y, t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) { best = t; edge = i; eu = clamp(u, 0, 1); }
    }
    return { d: best, edge, u: eu };
  }
  /** A smooth curve through control points (Catmull-Rom), sampled every ~step px. */
  function spline(ctrl, step) {
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push(P(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)));
      }
    }
    const e = ctrl[ctrl.length - 1];
    out.push(P(e.x, e.y));
    return out;
  }

  /* ---------- the twigs ---------- */

  /**
   * A twig through the control points. It grows in short internodes, so it is crooked with small kinks at its nodes;
   * it swells a little at each node and steps thinner where a side twig leaves it; the side twigs (away from the web)
   * fork now and then and end in a bud or a leaf; lichen tufts and bark bumps break its outline.
   */
  function makeTwig(R, ctrl, w0, w1, hub, k, o = {}) {
    let pts = spline(ctrl, 4);
    const n = pts.length, wig = o.wig ?? 1;
    const offs = new Float32Array(n), nodes = [];
    let off = 0, vel = 0, s = 0, next = (10 + R() * 20) * k;
    for (let i = 0; i < n; i++) {
      if (i) s += dist(pts[i - 1], pts[i]);
      if (s >= next && i > 2 && i < n - 3) { vel += (R() - 0.5) * 2.4 * wig * k; nodes.push(i); next = s + (18 + R() * 30) * k; }
      off += vel; vel *= 0.78; off *= 0.99;
      offs[i] = off;
    }
    pts = pts.map((p, i) => {
      const t = i / (n - 1), e = sm(0, 0.06, t) * sm(1, 0.93, t);
      if (!e) return p;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
      return P(p.x - (ty / l) * offs[i] * e, p.y + (tx / l) * offs[i] * e);
    });
    const pl = poly(pts);
    const subs = [], leaves = [], buds = [], lichen = [], bumps = [];
    const outward = (q) => { const nx = -q.ty, ny = q.tx; return (nx * (q.x - hub.x) + ny * (q.y - hub.y)) > 0 ? 1 : -1; };
    // side twigs leave at some of the nodes
    const nSub = Math.min(nodes.length, o.subs ?? 3), subAt = new Set();
    for (let j = 0; j < nSub; j++) subAt.add(nodes[Math.floor(((j + 0.2 + R() * 0.6) / nSub) * nodes.length)]);
    const wd = new Float32Array(n);
    let step = 1;
    for (let i = 0; i < n; i++) {
      if (subAt.has(i)) step *= 0.93;
      let bulge = 1;
      for (const nd of nodes) { const d = Math.abs(nd - i); if (d < 3) bulge = Math.max(bulge, 1 + 0.12 * (1 - d / 3)); }
      wd[i] = Math.max(w1 * 0.85, lerp(w0, w1, Math.pow(i / (n - 1), 0.8)) * step * bulge * (1 + 0.05 * Math.sin(i * 1.7)));
    }
    const leaf = (x, y, a, size) => leaves.push({ x, y, a: lerp(a, Math.PI / 2, 0.25) + (R() - 0.5) * 0.5, len: size * k, wid: 0.34 + R() * 0.12, curl: (R() - 0.5) * 0.7, dry: R() < 0.4 });
    const side = (x, y, a, len, ww, depth) => {
      const c = [P(x, y)], nseg = 2 + (R() < 0.5 ? 1 : 0);
      let ang = a;
      for (let m = 0; m < nseg; m++) { ang += (R() - 0.5) * 0.55; const p0 = c[c.length - 1]; c.push(P(p0.x + (Math.cos(ang) * len) / nseg, p0.y + (Math.sin(ang) * len) / nseg)); }
      subs.push({ pts: c, w0: ww, w1: Math.max(0.75 * k, ww * 0.38) });
      if (depth > 0 && R() < 0.4) { const m = c[1]; side(m.x, m.y, ang + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.4), len * (0.35 + R() * 0.2), ww * 0.55, depth - 1); }
      const tip = c[c.length - 1];
      if (R() < 0.38) leaf(tip.x, tip.y, ang, 9 + R() * 13);
      else buds.push({ x: tip.x, y: tip.y, a: ang, r: Math.max(0.9 * k, ww * 0.42) });
      if (R() < 0.25) { const m = c[1]; leaf(m.x, m.y, ang + (R() < 0.5 ? -1 : 1) * 1.1, 7 + R() * 8); }
    };
    for (const i of subAt) {
      const q = polyAt(pl, pl.cum[i]), sd = outward(q);
      side(q.x, q.y, Math.atan2(q.ty, q.tx) + sd * (0.5 + R() * 0.55), (16 + R() * 44) * k * (o.subLen || 1), wd[i] * 0.55, 1);
    }
    // lichen tufts and bark bumps on the main stem
    for (let j = 0, m = 2 + Math.floor(R() * 3); j < m; j++) {
      const i = Math.floor((0.1 + R() * 0.75) * n), q = polyAt(pl, pl.cum[i]), sd = R() < 0.6 ? -1 : 1, nx = -q.ty * sd, ny = q.tx * sd, w = wd[i] / 2;
      for (let t = 0, c = 4 + Math.floor(R() * 5); t < c; t++) { const al = (R() - 0.5) * 2.2 * w; lichen.push({ x: q.x + q.tx * al + nx * (w + (R() * 1.6 - 0.3) * k), y: q.y + q.ty * al + ny * (w + (R() * 1.6 - 0.3) * k), r: (0.5 + R() * 0.9) * k }); }
    }
    for (let i = 4; i < n - 4; i += 3 + Math.floor(R() * 6)) {
      const q = polyAt(pl, pl.cum[i]), sd = R() < 0.5 ? -1 : 1, w = wd[i] / 2;
      bumps.push({ x: q.x - q.ty * sd * w * 0.8, y: q.y + q.tx * sd * w * 0.8, rx: w * (0.35 + R() * 0.4), ry: w * (0.2 + R() * 0.2), a: Math.atan2(q.ty, q.tx) });
    }
    return { pts, pl, wd, subs, leaves, buds, lichen, bumps, w0, w1 };
  }

  /* ---------- the place: twigs round a gap, where the web will go ---------- */

  function compose(W, H, seed, pv) {
    const R = K.rng(seed), s = R() < 0.5 ? 1 : -1;
    const u = pv ? H * 1.05 : Math.min(W * 0.62, H);
    const k = pv ? 0.3 : clamp(u / 780, 0.6, 1.3);
    const hub = P(W * 0.5 + s * (R() - 0.35) * W * (pv ? 0.02 : 0.07), H * (pv ? 0.52 : 0.38 + R() * 0.05));
    const dTop = u * (pv ? 0.17 : 0.15 + R() * 0.022), side = dTop * (1.45 + R() * 0.2), dBot = dTop * (1.7 + R() * 0.25);
    const A = P(hub.x - s * side * (0.98 + R() * 0.12), hub.y - dTop * (1.02 + R() * 0.12));
    const Bp = P(hub.x + s * side * (0.98 + R() * 0.12), hub.y - dTop * (0.9 + R() * 0.16));
    const MLp = P(hub.x - s * side * (1.1 + R() * 0.06), hub.y + dBot * (0.22 + R() * 0.12));
    const MRp = P(hub.x + s * side * (1.1 + R() * 0.06), hub.y + dBot * (0.24 + R() * 0.12));
    const wk = pv ? 0.55 : 1, bulgeL = P(lerp(MLp.x, A.x, 0.5) - s * side * (0.1 + R() * 0.08), lerp(MLp.y, A.y, 0.5));
    // the start twig ends at the tip A, where the spider will stand: a stem rising from below, or a branch from the side
    const startCtrl = R() < 0.5
      ? [P(MLp.x - s * side * (0.3 + R() * 0.35), H + 50), P(MLp.x - s * side * (0.08 + R() * 0.1), lerp(MLp.y, H, 0.45)), MLp, bulgeL, A]
      : [P(hub.x - s * (W * 0.5 + 60), MLp.y + dBot * (0.3 + R() * 0.35)), P(MLp.x - s * side * (0.3 + R() * 0.2), MLp.y + dBot * (0.1 + R() * 0.1)), MLp, bulgeL, A];
    const start = makeTwig(R, startCtrl, 15 * k * wk, 1.8 * k, hub, k, { subs: 3 + Math.floor(R() * 2) });
    // the far twig, where the bridge line will snag: hanging from above, or reaching in from the side, then on down
    const bulgeR = P(lerp(Bp.x, MRp.x, 0.5) + s * side * (0.1 + R() * 0.08), lerp(Bp.y, MRp.y, 0.5)), tipR = P(MRp.x + s * side * 0.06, MRp.y + dBot * (0.3 + R() * 0.15));
    const farCtrl = R() < 0.55
      ? [P(Bp.x + s * side * (0.25 + R() * 0.2), -H * 0.08), P(Bp.x + s * side * 0.05, Bp.y - dTop * (0.6 + R() * 0.2)), Bp, bulgeR, MRp, tipR]
      : [P(hub.x + s * (W * 0.5 + 60), Bp.y - dTop * (0.5 + R() * 0.5)), P(Bp.x + s * side * (0.25 + R() * 0.15), Bp.y - dTop * (0.35 + R() * 0.15)), Bp, bulgeR, MRp, tipR];
    const far = makeTwig(R, farCtrl, 13 * k * wk, 1.6 * k, hub, k, { subs: 3 + Math.floor(R() * 2) });
    // a low twig arches up from the ground and across under the gap
    const low = makeTwig(R, [P(hub.x + s * side * (0.85 + R() * 0.45), H + 50), P(hub.x + s * side * 0.45, hub.y + dBot * (1.08 + R() * 0.06)), P(hub.x - s * side * 0.1, hub.y + dBot * (0.98 + R() * 0.06)),
      P(hub.x - s * side * (0.6 + R() * 0.12), hub.y + dBot * (0.84 + R() * 0.08))], 12 * k * wk, 1.7 * k, hub, k, { subs: 2 + Math.floor(R() * 2) });
    return { s, k, u, W, H, hub, dTop, side, dBot, A, Bp, MLp, MRp, start, far, low, twigs: [start, far, low], seed, pv };
  }

  function drawTwigs(c, comp) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const tw of comp.twigs) {
      for (let i = 1; i < tw.pts.length; i++) {
        c.lineWidth = (tw.wd[i - 1] + tw.wd[i]) / 2;
        c.beginPath(); c.moveTo(tw.pts[i - 1].x, tw.pts[i - 1].y); c.lineTo(tw.pts[i].x, tw.pts[i].y); c.stroke();
      }
      for (const sb of tw.subs) {
        const n = sb.pts.length;
        for (let i = 1; i < n; i++) { c.lineWidth = lerp(sb.w0, sb.w1, (i - 0.5) / (n - 1)); c.beginPath(); c.moveTo(sb.pts[i - 1].x, sb.pts[i - 1].y); c.lineTo(sb.pts[i].x, sb.pts[i].y); c.stroke(); }
      }
      for (const b of tw.bumps) { c.beginPath(); c.ellipse(b.x, b.y, b.rx, b.ry, b.a, 0, TAU); c.fill(); }
      for (const b of tw.buds) { c.beginPath(); c.ellipse(b.x + Math.cos(b.a) * b.r * 0.8, b.y + Math.sin(b.a) * b.r * 0.8, b.r * 1.5, b.r * 0.75, b.a, 0, TAU); c.fill(); }
      for (const l of tw.lichen) { c.beginPath(); c.arc(l.x, l.y, l.r, 0, TAU); c.fill(); }
      for (const lf of tw.leaves) {
        c.save(); c.translate(lf.x, lf.y); c.rotate(lf.a);
        const l = lf.len, w = l * lf.wid * (lf.dry ? 0.7 : 1), cu = lf.curl;
        c.lineWidth = Math.max(0.6, l * 0.05); c.beginPath(); c.moveTo(0, 0); c.lineTo(l * 0.16, cu * w * 0.2); c.stroke(); // the stalk
        c.beginPath(); c.moveTo(l * 0.14, 0);
        c.bezierCurveTo(l * 0.3, -w * (1.05 + cu), l * 0.78, -w * (0.7 + cu * 0.6), l, cu * w * 1.2);
        c.bezierCurveTo(l * 0.75, w * (0.75 - cu * 0.6), l * 0.32, w * (0.95 - cu), l * 0.14, 0);
        c.fill();
        if (!lf.dry) { // the midrib, let through
          c.save(); c.globalCompositeOperation = 'destination-out'; c.lineWidth = Math.max(0.35, l * 0.035);
          c.beginPath(); c.moveTo(l * 0.2, 0); c.quadraticCurveTo(l * 0.6, cu * w * 0.3, l * 0.92, cu * w * 1.05); c.stroke(); c.restore();
        }
        c.restore();
      }
    }
  }

  /**
   * The twigs as one layer, in screen pixels (the site's transform applied): dark ink, a thin warm rim where the low
   * sun catches their upper-left edges (broken by the bark), and a softer light over the sunward side.
   */
  function twigLayer(site, W, H, dpr, L) {
    const [cv, c] = K.layer(W, H, dpr), T = site.Tm, q = cv.width / W;
    const at = (x, ox = 0, oy = 0) => x.setTransform(q * T.s, 0, 0, q * T.s, q * (T.x + ox), q * (T.y + oy));
    at(c);
    c.fillStyle = c.strokeStyle = L ? 'rgb(72,60,48)' : 'rgb(7,9,8)';
    drawTwigs(c, site.c);
    const lit = (col, dx, dy) => {
      const [v, x] = K.layer(W, H, dpr);
      at(x); x.fillStyle = x.strokeStyle = col; drawTwigs(x, site.c);
      x.globalCompositeOperation = 'destination-out'; at(x, dx, dy); drawTwigs(x, site.c);
      return [v, x];
    };
    const [rv, r] = lit(L ? 'rgb(255,250,236)' : 'rgb(255,206,150)', 1.2, 1.0);
    // the bark breaks the rim up
    const R = K.rng(site.c.seed + 1);
    at(r); r.fillStyle = '#000';
    for (const tw of site.c.twigs) for (let i = 0; i < tw.pts.length; i++) {
      if (R() > 0.45) continue;
      const p = tw.pts[i], w = tw.wd[i] / 2;
      r.beginPath(); r.ellipse(p.x - LX * w, p.y - LY * w, (0.6 + R() * 1.6) * site.k, (0.5 + R() * 0.8) * site.k, R() * 3, 0, TAU); r.fill();
    }
    const [sv] = lit(L ? 'rgb(255,248,230)' : 'rgb(190,140,95)', 3.4, 2.8);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = L ? 0.22 : 0.2; c.drawImage(sv, 0, 0);
    c.globalAlpha = (L ? 0.5 : 0.72) * (site.c.pv ? 0.55 : 1); c.drawImage(rv, 0, 0);
    return cv;
  }

  /* ---------- sprites (per light / dark) ---------- */

  function sprites(L) {
    const key = `swSpr|${L}`;
    if (K.cache.has(key)) return K.cache.get(key);
    // a dew drop, radius 8 in a 32 px square (drawn at 4 r): a lens of water, the sun bright through its lower right
    // (refracted), a hard little reflection at its upper left, its edge a touch brighter than its middle
    const drop = K.mk(32, 32), d = drop.getContext('2d');
    const rad = (x, y, r, stops) => { const g = d.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) g.addColorStop(o, c); d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, TAU); d.fill(); };
    if (!L) {
      rad(16, 16, 16, [[0, 'rgba(255,238,210,0.12)'], [0.5, 'rgba(255,236,206,0.045)'], [1, 'rgba(255,236,206,0)']]);
      rad(16, 16, 8, [[0, 'rgba(190,205,220,0.05)'], [0.7, 'rgba(210,222,236,0.13)'], [0.92, 'rgba(232,240,248,0.3)'], [1, 'rgba(232,240,248,0)']]);
      rad(19.2, 19.4, 4.8, [[0, 'rgba(255,240,206,1)'], [0.4, 'rgba(255,218,160,0.6)'], [1, 'rgba(255,200,140,0)']]);
      rad(12.8, 12.6, 2.6, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    } else {
      rad(16, 16, 8, [[0, 'rgba(240,246,252,0.55)'], [0.75, 'rgba(226,236,246,0.6)'], [0.88, 'rgba(84,100,118,0.55)'], [1, 'rgba(84,100,118,0)']]);
      d.strokeStyle = 'rgba(64,80,98,0.22)'; d.lineWidth = 2.2; d.beginPath(); d.arc(16, 16, 5.2, Math.PI * 1.05, Math.PI * 1.75); d.stroke(); // shade under the upper rim
      rad(19.2, 19.4, 4.6, [[0, 'rgba(250,180,70,0.95)'], [0.5, 'rgba(250,190,100,0.5)'], [1, 'rgba(250,200,120,0)']]);
      rad(12.8, 12.6, 2.6, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    }
    // a glint: a soft core and thin rays, longest across
    const glint = K.mk(64, 64), g = glint.getContext('2d');
    const core = g.createRadialGradient(32, 32, 0, 32, 32, 9);
    core.addColorStop(0, L ? 'rgba(255,214,130,1)' : 'rgba(255,252,240,1)'); core.addColorStop(0.3, L ? 'rgba(240,170,60,0.55)' : 'rgba(255,234,196,0.45)'); core.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = core; g.fillRect(0, 0, 64, 64);
    for (const [ax, ay, len, lw] of [[1, 0, 30, 1], [0, 1, 22, 0.9], [0.707, 0.707, 9, 0.7], [0.707, -0.707, 9, 0.7]]) {
      const lg = g.createLinearGradient(32 - ax * len, 32 - ay * len, 32 + ax * len, 32 + ay * len), c0 = L ? '206,130,30' : '255,246,226';
      lg.addColorStop(0, `rgba(${c0},0)`); lg.addColorStop(0.5, `rgba(${c0},0.85)`); lg.addColorStop(1, `rgba(${c0},0)`);
      g.strokeStyle = lg; g.lineWidth = lw; g.beginPath(); g.moveTo(32 - ax * len, 32 - ay * len); g.lineTo(32 + ax * len, 32 + ay * len); g.stroke();
    }
    if (L) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(32, 32, 1.5, 0, TAU); g.fill(); }
    // a speck of dust or pollen in a sunbeam
    const mote = K.mk(16, 16), m = mote.getContext('2d'), mg = m.createRadialGradient(8, 8, 0, 8, 8, 8);
    mg.addColorStop(0, L ? 'rgba(190,140,50,0.9)' : 'rgba(255,240,210,1)'); mg.addColorStop(0.35, L ? 'rgba(190,140,50,0.3)' : 'rgba(255,236,200,0.35)'); mg.addColorStop(1, 'rgba(255,230,190,0)');
    m.fillStyle = mg; m.fillRect(0, 0, 16, 16);
    // a sunbeam: soft across, fading along
    const beam = K.mk(256, 64), b = beam.getContext('2d');
    for (let y = 0; y < 64; y++) {
      const v = (y + 0.5) / 64, a = Math.exp(-(((v - 0.5) / 0.24) ** 2));
      const lg = b.createLinearGradient(0, 0, 256, 0), c0 = L ? '255,206,120' : '255,226,170';
      lg.addColorStop(0, `rgba(${c0},0)`); lg.addColorStop(0.1, `rgba(${c0},${a})`); lg.addColorStop(0.5, `rgba(${c0},${a * 0.75})`); lg.addColorStop(1, `rgba(${c0},0)`);
      b.fillStyle = lg; b.fillRect(0, y, 256, 1);
    }
    // the low sun's glow, behind the leaves
    const sun = K.mk(256, 256), sg = sun.getContext('2d'), sgr = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
    if (L) { sgr.addColorStop(0, 'rgba(255,206,130,0.42)'); sgr.addColorStop(0.3, 'rgba(255,214,150,0.2)'); sgr.addColorStop(0.65, 'rgba(255,224,170,0.06)'); sgr.addColorStop(1, 'rgba(255,224,170,0)'); }
    else { sgr.addColorStop(0, 'rgba(255,220,160,0.3)'); sgr.addColorStop(0.25, 'rgba(255,206,140,0.12)'); sgr.addColorStop(0.6, 'rgba(255,200,130,0.035)'); sgr.addColorStop(1, 'rgba(255,200,130,0)'); }
    sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 256);
    // the backlit hairs round the spider's body
    const halo = K.mk(64, 64), hg = halo.getContext('2d'), hgr = hg.createRadialGradient(32, 32, 0, 32, 32, 32);
    hgr.addColorStop(0, 'rgba(255,196,130,0)'); hgr.addColorStop(0.45, 'rgba(255,196,130,0.35)'); hgr.addColorStop(0.62, 'rgba(255,190,120,0.16)'); hgr.addColorStop(1, 'rgba(255,190,120,0)');
    hg.fillStyle = hgr; hg.fillRect(0, 0, 64, 64);
    const out = { drop, glint, mote, beam, sun, halo };
    K.cache.set(key, out);
    return out;
  }

  /* ---------- the morning: out-of-focus foliage, far stems, mist; a strip that tiles sideways ---------- */

  function hazeLayer(W, H, L, seed) {
    const q = 0.5, TW = Math.round(W), cv = K.mk(TW * q, H * q), x = cv.getContext('2d');
    x.scale(q, q);
    const R = K.rng(seed), zs = Math.max(0.55, H / 800);
    const wrap = (fn, px, r) => { fn(px); if (px - r < 0) fn(px + TW); if (px + r > TW) fn(px - TW); };
    const blob = (px, py, r, col, a, sy = 1) => wrap((xx) => {
      const g = x.createRadialGradient(xx, py, 0, xx, py, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.55)); g.addColorStop(1, rgba(col, 0));
      x.save(); x.translate(xx, py); x.scale(1, sy); x.translate(-xx, -py); x.fillStyle = g; x.fillRect(xx - r, py - r, r * 2, r * 2); x.restore();
    }, px, r);
    // a bokeh disc: an out-of-focus point of light, flat with a slightly brighter rim and a soft edge
    const disc = (px, py, r, col, a) => wrap((xx) => {
      const g = x.createRadialGradient(xx, py, 0, xx, py, r);
      g.addColorStop(0, rgba(col, a * 0.7)); g.addColorStop(0.72, rgba(col, a * 0.85)); g.addColorStop(0.88, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.beginPath(); x.arc(xx, py, r, 0, TAU); x.fill();
    }, px, r);
    x.filter = `blur(${Math.round(14 * zs)}px)`;
    // the canopy: dark masses along the top and in the lower corners
    const dark = L ? [70, 96, 70] : [3, 8, 5];
    for (let i = 0; i < 22; i++) {
      const px = R() * TW, top = R() < 0.6, py = top ? R() * H * 0.22 - 20 : H * (0.8 + R() * 0.3), r = (70 + R() * 150) * zs;
      blob(px, py, r, dark, L ? 0.06 + R() * 0.06 : 0.25 + R() * 0.2, 0.55 + R() * 0.4);
    }
    // far stems, out of focus
    for (let i = 0; i < 3; i++) {
      const x0 = R() * TW, lean = (R() - 0.5) * 0.25, w = (12 + R() * 26) * zs;
      x.strokeStyle = rgba(dark, L ? 0.07 : 0.28); x.lineWidth = w; x.lineCap = 'round';
      const bend = (R() - 0.5) * 60;
      for (const xx of [x0, x0 - TW, x0 + TW]) { x.beginPath(); x.moveTo(xx, H * 1.05); x.quadraticCurveTo(xx + lean * H * 0.5 + bend, H * 0.5, xx + lean * H, -H * 0.05); x.stroke(); }
    }
    // foliage further off, some of it lit through by the low sun (more of it toward the sun, upper left)
    const leafy = L ? [[112, 146, 92], [138, 160, 96], [176, 172, 104]] : [[54, 84, 50], [86, 112, 60], [150, 150, 80]];
    for (let i = 0; i < 34; i++) {
      const sunny = R() < 0.5, px = sunny ? R() * TW * 0.55 : R() * TW, py = sunny ? R() * H * 0.5 : R() * H * 0.9, r = (40 + R() * 120) * zs;
      blob(px, py, r, leafy[(R() * 3) | 0], L ? 0.05 + R() * 0.06 : 0.06 + R() * 0.07, 0.6 + R() * 0.5);
    }
    const lit = L ? [236, 206, 132] : [230, 196, 120];
    for (let i = 0; i < 12; i++) { const px = R() * TW * 0.6, py = R() * H * 0.45, r = (30 + R() * 80) * zs; blob(px, py, r, lit, L ? 0.07 + R() * 0.06 : 0.035 + R() * 0.035); }
    x.filter = 'none';
    // out-of-focus points of sunlight through the leaves
    for (let i = 0; i < 16; i++) {
      const px = R() * TW * (R() < 0.7 ? 0.6 : 1), py = R() * H * 0.6, r = (7 + R() * 20) * zs;
      disc(px, py, r, L ? [240, 196, 110] : [255, 230, 170], L ? 0.045 + R() * 0.04 : 0.025 + R() * 0.03);
    }
    // dawn mist low down
    const mg = x.createLinearGradient(0, H * 0.6, 0, H);
    mg.addColorStop(0, L ? 'rgba(200,214,200,0)' : 'rgba(180,200,190,0)'); mg.addColorStop(0.65, L ? 'rgba(200,214,200,0.06)' : 'rgba(180,200,190,0.05)'); mg.addColorStop(1, L ? 'rgba(200,214,200,0.1)' : 'rgba(180,200,190,0.09)');
    x.fillStyle = mg; x.fillRect(0, 0, TW, H);
    return { cv, TW };
  }

  /* ---------- the web's threads, as a graph of nodes and segments ---------- */

  function addNode(site, x, y, f) { const n = { x, y, f, ph: RND() * TAU, X: x, Y: y, PX: x, PY: y, pin: 0 }; site.nodes.push(n); return n; }
  function addSeg(site, a, b, k) { const s = { a, b, k, dead: 0, cut: 0, drops: null, rest: 0 }; site.segs.push(s); return s; }

  /** A node on radius r at distance d from the hub (an existing one if it is that close), splitting its thread. */
  function onRadius(site, r, d) {
    for (const n of r.ns) if (Math.abs(n.d - d) < 0.4) return n;
    const H = site.hubN, f = 1 - (1 - r.end.f) * clamp(d / r.L, 0, 1);
    const n = addNode(site, H.x + r.ux * d, H.y + r.uy * d, f);
    n.d = d; n.r = r;
    let j = 0;
    while (j < r.ns.length - 1 && r.ns[j + 1].d < d) j++;
    r.ns.splice(j + 1, 0, n);
    if (r.segs.length) { const sOld = r.segs[j], b = sOld.b; sOld.b = n; r.segs.splice(j + 1, 0, addSeg(site, n, b, sOld.k)); }
    return n;
  }
  /** A node on frame edge e at u along it (0 at its first corner), splitting its thread. */
  function onFrame(site, e, u) {
    for (let i = 0; i < e.ns.length; i++) if (Math.abs(e.us[i] - u) * e.len < 0.4) return e.ns[i];
    const a = e.a, b = e.b, f = 0.08 + 0.3 * Math.sin(Math.PI * u) * (e.bridge ? 0.6 : 1);
    const n = addNode(site, lerp(a.x, b.x, u), lerp(a.y, b.y, u), f);
    let j = 0;
    while (j < e.ns.length - 1 && e.us[j + 1] < u) j++;
    e.ns.splice(j + 1, 0, n); e.us.splice(j + 1, 0, u);
    if (e.segs.length) { const sOld = e.segs[j], bb = sOld.b; sOld.b = n; e.segs.splice(j + 1, 0, addSeg(site, n, bb, sOld.k)); }
    return n;
  }

  /**
   * The web's plan, once the bridge has snagged at B: the hub below the bridge, the anchor C on the low twig straight
   * under it, two frame corners on the side twigs, the frame round them, the radii at even angles to the frame.
   */
  function plan(site, B, sB) {
    const c = site.c, s = c.s, A = c.A;
    const Hx = lerp(A.x, B.x, 0.5 + s * (RND() - 0.45) * 0.1), Hy = Math.max(A.y, B.y) + c.dTop * (0.92 + RND() * 0.1);
    // the low twig straight below the hub
    let C = null, sC = 0;
    const lp = c.low.pl;
    for (let i = 1; i < lp.pts.length; i++) {
      const a = lp.pts[i - 1], b = lp.pts[i];
      if ((a.x - Hx) * (b.x - Hx) <= 0 && a.x !== b.x) { const k = (Hx - a.x) / (b.x - a.x), y = lerp(a.y, b.y, k); if (y > Hy + c.dBot * 0.5 && (!C || y < C.y)) { C = P(Hx, y); sC = lp.cum[i - 1] + k * (lp.cum[i] - lp.cum[i - 1]); } }
    }
    if (!C) { const q = polyNear(lp, P(Hx, Hy + c.dBot)); C = P(q.x, q.y); sC = q.s; }
    const sp = c.start.pl, fp = c.far.pl;
    const ml = polyNear(sp, P(Hx - s * c.side * 1.1, Hy + (C.y - Hy) * 0.26), 0, sp.len - 30 * c.k);
    const mr = polyNear(fp, P(Hx + s * c.side * 1.1, Hy + (C.y - Hy) * 0.3), sB + 30 * c.k, fp.len);
    const pl = { A, B, C, H: P(Hx, Hy), ML: P(ml.x, ml.y), MR: P(mr.x, mr.y), sA: sp.len, sML: ml.s, sB, sMR: mr.s, sC };
    site.plan = pl;
    // nodes for the corners (fixed: on twigs) and the hub
    site.hubN = addNode(site, Hx, Hy, 1);
    const nA = addNode(site, A.x, A.y, 0), nB = addNode(site, B.x, B.y, 0), nC = addNode(site, C.x, C.y, 0), nML = addNode(site, pl.ML.x, pl.ML.y, 0), nMR = addNode(site, pl.MR.x, pl.MR.y, 0);
    const corners = [nA, nB, nMR, nC, nML];
    site.corners = corners;
    site.pg = corners.map((n) => P(n.x, n.y));
    // frame edges: the nodes along each (a corner is at u = 0 on one edge and u = 1 on the next, so u lives on the edge)
    site.edges = corners.map((a, i) => { const b = corners[(i + 1) % 5]; return { a, b, ns: [a, b], us: [0, 1], len: dist(a, b), segs: [], bridge: i === 0, built: false }; });
    // perimeter, for walking along the frame
    let acc = 0;
    site.perim = site.edges.map((e) => { const p0 = acc; acc += e.len; return p0; });
    site.perimLen = acc;
    // radii: the three of the Y, and the others in the gaps at about even angles
    const H = site.hubN, angOf = (q) => Math.atan2(q.y - Hy, q.x - Hx);
    const proto = [[angOf(A), nA, 0], [angOf(B), nB, 1], [angOf(C), nC, 2]].sort((a, b) => a[0] - b[0]);
    const Rm = (dist(pl.H, A) + dist(pl.H, B) + dist(pl.H, C)) / 3;
    const want = c.pv ? 14 : clamp(Math.round(Rm / (12 * c.k)), 14, 22), step = TAU / want;
    const radii = [];
    for (let i = 0; i < 3; i++) {
      const [a0, n0, which] = proto[i], a1 = i < 2 ? proto[i + 1][0] : proto[0][0] + TAU, gap = a1 - a0, m = Math.max(1, Math.round(gap / step));
      radii.push({ ang: a0, end: n0, proto: which });
      for (let j = 1; j < m; j++) radii.push({ ang: a0 + (gap * (j + (RND() - 0.5) * 0.22)) / m, end: null, proto: -1 });
    }
    for (const r of radii) {
      r.ang = Math.atan2(Math.sin(r.ang), Math.cos(r.ang));
      r.ux = Math.cos(r.ang); r.uy = Math.sin(r.ang);
      if (r.end) { r.L = dist(r.end, H); r.ux = (r.end.x - Hx) / r.L; r.uy = (r.end.y - Hy) / r.L; r.edge = -1; }
      else { const hit = rayPoly(pl.H, r.ang, site.pg); r.L = hit.d; r.edge = hit.edge; r.eu = hit.u; }
      r.ns = [H]; r.segs = []; r.built = false; H.d = 0;
      r.ex = Hx + r.ux * r.L; r.ey = Hy + r.uy * r.L;
    }
    radii.sort((a, b) => a.ang - b.ang);
    radii.forEach((r, i) => { r.i = i; });
    site.radii = radii;
    site.Rm = radii.reduce((m, r) => m + r.L, 0) / radii.length;
    return pl;
  }

  /** The perimeter position of a point on edge e at u. */
  const perimAt = (site, e, u) => site.perim[e] + u * site.edges[e].len;
  /** Walk along the frame from perimeter position p0 to p1 the shorter way: the points passed. */
  function framePath(site, p0, p1) {
    const Lp = site.perimLen;
    let d = ((p1 - p0) % Lp + Lp) % Lp, dir = 1;
    if (d > Lp / 2) { d = Lp - d; dir = -1; }
    const pts = [], n = Math.max(2, Math.ceil(d / 6));
    for (let i = 0; i <= n; i++) pts.push(perimPoint(site, p0 + dir * d * (i / n)));
    return pts;
  }
  function perimPoint(site, p) {
    const Lp = site.perimLen;
    p = ((p % Lp) + Lp) % Lp;
    let e = 0;
    while (e < 4 && site.perim[e + 1] <= p) e++;
    const E = site.edges[e], u = (p - site.perim[e]) / E.len;
    return P(lerp(E.a.x, E.b.x, u), lerp(E.a.y, E.b.y, u));
  }
  /** Where a radius meets the frame, as a perimeter position. */
  function radiusPerim(site, r) {
    if (r.edge >= 0) return perimAt(site, r.edge, r.eu);
    const ci = site.corners.indexOf(r.end);
    return site.perim[ci];
  }

  /** Build a radius: its thread from the hub to the frame (the end fastened into the frame thread). */
  function buildRadius(site, r) {
    if (r.built) return;
    if (!r.end) { const e = site.edges[r.edge]; r.end = onFrame(site, e, r.eu); }
    r.end.d = r.L;
    r.ns = [site.hubN, r.end];
    r.segs = [addSeg(site, site.hubN, r.end, RADIUS)];
    r.built = true;
  }
  function buildEdge(site, i) {
    const e = site.edges[i];
    if (e.built) return;
    e.segs = [addSeg(site, e.a, e.b, i === 0 ? BRIDGE : FRAME)];
    e.built = true;
  }
  /** A thread's fastening on a twig: two or three short strands splayed along the bark. */
  function anchorFan(site, n, twig, s0) {
    if (site.c.pv) return;
    const pl = twig.pl;
    for (const off of [-1, 1]) {
      if (RND() < 0.25) continue;
      const q = polyAt(pl, s0 + off * (3 + RND() * 5) * site.k), m = addNode(site, q.x, q.y, 0);
      addSeg(site, n, m, ANCHOR);
    }
  }

  /** The order of the spirals: the hub's tight mesh and the temporary spiral (outward), the capture spiral (inward). */
  function spiralPlans(site) {
    const R = site.radii, N = R.length, k = site.k, Rm = site.Rm, pv = site.c.pv, dir = site.c.s;
    const at = (i) => R[((i % N) + N) % N];
    const hubR = Rm * 0.085, pH = Math.max(pv ? 1.2 : 2.4 * k, Rm * 0.016);
    const hub = [], temp = [];
    let d = pH * 0.9, i = 0;
    while (d < hubR) { hub.push({ r: at(i * dir), d: d + (RND() - 0.5) * pH * 0.3 }); d += pH / N; i++; }
    const pT = Rm * 0.125;
    while (d < Rm * 0.8) {
      const r = at(i * dir), w = sm(hubR, hubR + pT, d);
      temp.push({ r, d: Math.min(d, r.L * 0.86) });
      d += lerp(pH, pT, w) / N; i++;
    }
    // the capture spiral, from the outside in, closely and evenly spaced. Where the web runs deeper than the spiral
    // could go all the way round (the corners, the lower part) the spider first fills it back and forth, arc by arc,
    // turning at the shallower radii (the deepest parts first); then it goes round and round inward to the free zone.
    const pC = pv ? Math.max(2.2, Rm * 0.075) : Math.max(5.2 * k, Rm * 0.05);
    const Dout = R.map((r) => r.L - Math.max(4 * k, r.L * 0.07)), Din = Rm * 0.3;
    const dFull = Math.min(...Dout), thr = dFull + pC * 0.6;
    const cap = [];
    const runsAbove = (run, lvl) => { const out = []; let cur = null; for (const j of run) { if (Dout[j] > lvl) (cur = cur || []).push(j); else if (cur) { out.push(cur); cur = null; } } if (cur) out.push(cur); return out; };
    const fill = (run, floor) => {
      if (run.length < 2) return;
      let m = Infinity;
      for (const j of run) m = Math.min(m, Dout[j]);
      for (const sub of runsAbove(run, m + pC * 0.6)) fill(sub, m + pC * 0.6);
      const seq = [];
      let fwd = RND() < 0.5;
      for (let d = m; d > floor; d -= pC) {
        for (const j of fwd ? run : run.slice().reverse()) seq.push({ r: R[j], d: d + (RND() - 0.5) * pC * 0.08 });
        fwd = !fwd;
      }
      if (seq.length > 2) cap.push(seq);
    };
    let s0 = 0;
    while (s0 < N - 1 && Dout[s0] > thr) s0++;
    const lobes = [];
    let run = null;
    for (let m = 1; m <= N; m++) { const j = (s0 + m) % N; if (Dout[j] > thr) (run = run || []).push(j); else if (run) { lobes.push(run); run = null; } }
    if (run) lobes.push(run);
    lobes.sort((a, b) => Math.max(...b.map((j) => Dout[j])) - Math.max(...a.map((j) => Dout[j])));
    for (const lobe of lobes) fill(lobe, thr);
    const main = [], lastS = cap.length ? cap[cap.length - 1] : null;
    let ci = lastS ? lastS[lastS.length - 1].r.i : s0, cd = dFull;
    while (cd > Din) { main.push({ r: R[ci], d: cd }); ci = (ci + dir + N) % N; cd -= pC / N; }
    cap.push(main);
    return { hub, temp, cap, pC, hubR, Din };
  }

  /* ---------- the spider ---------- */

  // body frame: x toward the head, y to the right; lengths in k (≈ px at full size). Hip, resting foot, leg length.
  const HIP = [[4.6, 1.6], [3.7, 2.4], [2.5, 2.7], [1.2, 2.3]];
  const REST = [[19.5, 8.5], [9.5, 16], [-3.6, 12.2], [-16.5, 8.5]];
  const LEN = [24, 21, 13.5, 19.5];
  const SPIN = 12.4; // the spinnerets, behind the pedicel

  function newSpider(x, y, hd, k) {
    const sp = { x, y, hd, hdT: hd, k: k * 1.15, vx: 0, vy: 0, mode: 'line', path: null, abd: 0, bend: 0, bendT: 0, wrapP: null, wrapSide: 1, combPh: 0, chew: 0, chewPh: 0, handle: 0, feedP: null, turn: 6, legs: [], spd: 0, bob: 0, haul: 0 };
    for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1, pair = i % 4; sp.legs.push({ side, pair, grp: (pair + (side < 0 ? 0 : 1)) % 2, x, y, sx: x, sy: y, t: -1, dur: 0.1 }); }
    return sp;
  }
  const bodyPt = (sp, bx, by) => { const c = Math.cos(sp.hd), s = Math.sin(sp.hd); return P(sp.x + (bx * c - by * s) * sp.k, sp.y + (bx * s + by * c) * sp.k); };
  /** The spinnerets, at the tip of the abdomen (which may be curled round to one side). */
  const spinneret = (sp) => { const a = sp.hd + sp.bend, l = SPIN * (1 - 0.3 * sp.abd) * sp.k; return P(sp.x - Math.cos(a) * l, sp.y - Math.sin(a) * l); };

  /** Where a foot wants to be: its resting place round the body; on a single thread or twig, on that line. */
  function footTarget(sp, L, lead) {
    const r = REST[L.pair], hang = sp.mode === 'hang';
    let bx = r[0] * (hang ? 0.78 : 1), by = r[1] * L.side * (hang ? 0.8 : 1);
    if (sp.wrapP) { // wrapping prey at the spinnerets: the third legs hold it and turn it, the hind legs comb silk out over it in turn
      const Wp = sp.wrapP, k = sp.k, rt = L.side > 0;
      if (L.pair === 2) {
        const a = sp.combPh * 0.5 + (rt ? 0.7 : -0.7) + sp.hd;
        return P(Wp.x + Math.cos(a) * 2.4 * k, Wp.y + Math.sin(a) * 2.4 * k);
      }
      if (L.pair === 3) {
        const sn = spinneret(sp), e = 0.5 + 0.5 * Math.sin(sp.combPh + (rt ? 0 : Math.PI)), a = sp.hd + Math.PI + (rt ? 1 : -1) * (0.9 + 0.6 * e);
        return P(lerp(sn.x + Math.cos(sp.hd + (rt ? 1.7 : -1.7)) * 3 * k, Wp.x + Math.cos(a) * 3.6 * k, e), lerp(sn.y + Math.sin(sp.hd + (rt ? 1.7 : -1.7)) * 3 * k, Wp.y + Math.sin(a) * 3.6 * k, e));
      }
    }
    if (sp.haul && L.pair === 0) bx -= (0.5 + 0.5 * Math.sin(sp.haulPh + (L.side > 0 ? Math.PI : 0))) * 6; // reeling in: front legs pull the line in, hand over hand
    if (sp.handle > 0 && sp.feedP && L.pair === 0) { // feeding: the front legs take hold of the bundle and turn it
      const a = sp.hd + L.side * (0.9 + 0.35 * Math.sin(sp.chewPh * 0.3)), r = 3 * sp.k;
      return P(sp.feedP.x + Math.cos(a) * r, sp.feedP.y + Math.sin(a) * r);
    }
    const p = bodyPt(sp, bx, by);
    p.x += lead.x; p.y += lead.y;
    if (sp.mode === 'line' && sp.path) {
      const hip = bodyPt(sp, HIP[L.pair][0], HIP[L.pair][1] * L.side), reach = LEN[L.pair] * sp.k * 1.02;
      const q = polyNear(sp.path, hip, sp.ps - 30 * sp.k, sp.ps + 30 * sp.k) || polyNear(sp.path, hip);
      if (!q) return p;
      const h = Math.hypot(q.x - hip.x, q.y - hip.y);
      if (h >= reach) return P(q.x, q.y);
      const m = Math.sqrt(reach * reach - h * h) * 0.92, o = clamp((p.x - q.x) * q.tx + (p.y - q.y) * q.ty, -m, m);
      const r2 = polyNear(sp.path, P(q.x + q.tx * o, q.y + q.ty * o), q.s - m * 1.3, q.s + m * 1.3);
      return r2 ? P(r2.x, r2.y) : P(q.x + q.tx * o, q.y + q.ty * o);
    }
    return p;
  }

  function spiderStep(sp) {
    sp.hd += angDiff(sp.hdT, sp.hd) * Math.min(1, sp.turn * DT);
    sp.bend += (sp.bendT - sp.bend) * Math.min(1, 4 * DT);
    if (sp.wrapP) sp.combPh += DT * TAU * 1.5;
    if (sp.haul) sp.haulPh += DT * 11;
    if (sp.chew) sp.chewPh += DT * 7.5;
    const holding = (sp.handle > 0 && sp.feedP ? 1 : 0) | (sp.wrapP ? 2 : 0);
    if (sp.held & ~holding) for (const L of sp.legs) if (L.pair === 0 || L.pair >= 2) { L.t = 0; L.sx = L.x; L.sy = L.y; L.dur = 0.16 + L.pair * 0.03; } // let go: back to their places
    sp.held = holding;
    const spd = Math.hypot(sp.vx, sp.vy) / DT;
    sp.spd += (spd - sp.spd) * 0.3;
    const lead0 = clamp(sp.spd * 0.06, 0, 8 * sp.k), vl = Math.hypot(sp.vx, sp.vy) || 1;
    const lead = P((sp.vx / vl) * lead0, (sp.vy / vl) * lead0);
    const swing = [0, 0];
    for (const L of sp.legs) if (L.t >= 0) swing[L.grp]++;
    const hang = sp.mode === 'hang';
    for (const L of sp.legs) {
      const tg = footTarget(sp, L, lead);
      if (hang) { L.x += (tg.x - L.x) * 0.35; L.y += (tg.y - L.y) * 0.35; L.t = -1; continue; }
      if ((sp.wrapP && L.pair >= 2) || (sp.handle > 0 && sp.feedP && L.pair === 0)) { L.x += (tg.x - L.x) * 0.35; L.y += (tg.y - L.y) * 0.35; L.t = -1; continue; }
      if (L.t >= 0) {
        L.t += DT / L.dur;
        const e = Math.min(1, L.t), ee = e * e * (3 - 2 * e);
        const lift = Math.sin(Math.PI * e) * 1.6 * sp.k, nx = -Math.sin(sp.hd) * L.side, ny = Math.cos(sp.hd) * L.side;
        L.x = lerp(L.sx, tg.x, ee) + nx * lift; L.y = lerp(L.sy, tg.y, ee) + ny * lift;
        if (L.t >= 1) { L.t = -1; L.x = tg.x; L.y = tg.y; }
      } else {
        const d = Math.hypot(L.x - tg.x, L.y - tg.y), thr = Math.max(0.3 * LEN[L.pair] * sp.k, sp.spd * DT * 1.1);
        if ((d > thr && swing[1 - L.grp] === 0) || d > thr * 2.4 + 6 * sp.k) {
          L.t = 0; L.sx = L.x; L.sy = L.y; L.dur = clamp((thr * 1.6) / (sp.spd + 1) , 0.06, 0.16); swing[L.grp]++;
        }
      }
    }
    sp.bob += DT * (2 + sp.spd * 0.05);
  }

  /**
   * An orb-weaver, seen against the low sun: dark, with a glow of backlit hairs round it and a warm rim on its sunward
   * edge; the big round abdomen with its shoulders and the pale cross of spots, the smaller head end with its palps,
   * eight banded legs (I and II long and forward, III short, IV back), each bent outward at the knee.
   */
  function drawSpider(ctx, sp, ox, oy, L, spr) {
    const k = sp.k, c = Math.cos(sp.hd), s = Math.sin(sp.hd), x0 = sp.x + ox, y0 = sp.y + oy;
    const ink = L ? 'rgb(52,42,34)' : 'rgb(10,7,5)', band = L ? 'rgb(118,96,72)' : 'rgb(74,48,30)';
    const toW = (bx, by) => P(x0 + (bx * c - by * s) * k, y0 + (bx * s + by * c) * k);
    const legs = [];
    for (const Lg of sp.legs) {
      const hip = toW(HIP[Lg.pair][0], HIP[Lg.pair][1] * Lg.side), len = LEN[Lg.pair] * k, l1 = len * 0.47, l2 = len * 0.6;
      let fx = Lg.x + ox, fy = Lg.y + oy, dx = fx - hip.x, dy = fy - hip.y, d = Math.hypot(dx, dy) || 1e-3;
      if (d > l1 + l2 - 0.05) { const m = (l1 + l2 - 0.05) / d; fx = hip.x + dx * m; fy = hip.y + dy * m; dx *= m; dy *= m; d = l1 + l2 - 0.05; }
      const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), base = Math.atan2(dy, dx);
      const nx = -s * Lg.side, ny = c * Lg.side; // outward from the body's midline
      const k1 = P(hip.x + Math.cos(base + a) * l1, hip.y + Math.sin(base + a) * l1), k2 = P(hip.x + Math.cos(base - a) * l1, hip.y + Math.sin(base - a) * l1);
      const knee = (k1.x - hip.x) * nx + (k1.y - hip.y) * ny > (k2.x - hip.x) * nx + (k2.y - hip.y) * ny ? k1 : k2;
      const mx = lerp(knee.x, fx, 0.56) + nx * l2 * 0.06, my = lerp(knee.y, fy, 0.56) + ny * l2 * 0.06;
      legs.push([hip, knee, P(mx, my), P(fx, fy), Lg.pair]);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const legPath = () => { ctx.beginPath(); for (const [h, kn, m, f] of legs) { ctx.moveTo(h.x, h.y); ctx.lineTo(kn.x, kn.y); ctx.lineTo(m.x, m.y); ctx.lineTo(f.x, f.y); } };
    // the glow of fine hairs along the legs, lit from behind
    if (!L) {
      ctx.strokeStyle = 'rgba(255,190,125,0.13)'; ctx.lineWidth = 2.6 * k; legPath(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85;
      const abL = 6.4 * (1 - 0.3 * sp.abd) * k, ab = P(x0 - Math.cos(sp.hd + sp.bend) * abL, y0 - Math.sin(sp.hd + sp.bend) * abL), hr = 13 * k;
      ctx.drawImage(spr.halo, ab.x - hr, ab.y - hr, hr * 2, hr * 2);
      const cp = toW(3.2, 0), cr = 7.5 * k;
      ctx.drawImage(spr.halo, cp.x - cr, cp.y - cr, cr * 2, cr * 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.4 * k; legPath(); ctx.stroke();
    }
    // the legs: thick femur, thinner tibia and metatarsus, with paler bands at the joints
    ctx.strokeStyle = ink;
    for (const [h, kn, m, f] of legs) {
      ctx.lineWidth = 1.45 * k; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(kn.x, kn.y); ctx.stroke();
      ctx.lineWidth = 1.1 * k; ctx.beginPath(); ctx.moveTo(kn.x, kn.y); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.lineWidth = 0.75 * k; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(f.x, f.y); ctx.stroke();
    }
    ctx.strokeStyle = band; ctx.lineWidth = 1.05 * k; ctx.beginPath();
    for (const [h, kn, m, f] of legs) {
      ctx.moveTo(lerp(kn.x, m.x, 0.12), lerp(kn.y, m.y, 0.12)); ctx.lineTo(lerp(kn.x, m.x, 0.3), lerp(kn.y, m.y, 0.3));
      ctx.moveTo(lerp(m.x, f.x, 0.05), lerp(m.y, f.y, 0.05)); ctx.lineTo(lerp(m.x, f.x, 0.22), lerp(m.y, f.y, 0.22));
    }
    ctx.stroke();
    // the body
    ctx.save();
    ctx.translate(x0, y0); ctx.rotate(sp.hd); ctx.scale(k, k);
    const ab = 1 - 0.3 * sp.abd; // a raised abdomen looks shorter from here
    const abdomen = () => { ctx.beginPath(); ctx.moveTo(-0.8, 0); ctx.bezierCurveTo(-0.5, -3.9, -2.2, -6.3, -4.8 * ab, -6.4); ctx.bezierCurveTo(-8.4 * ab, -6.6, -11.8 * ab, -4.4, -12.9 * ab, -1.1); ctx.lineTo(-13.5 * ab, 0); ctx.lineTo(-12.9 * ab, 1.1); ctx.bezierCurveTo(-11.8 * ab, 4.4, -8.4 * ab, 6.6, -4.8 * ab, 6.4); ctx.bezierCurveTo(-2.2, 6.3, -0.5, 3.9, -0.8, 0); ctx.closePath(); };
    const ceph = () => { ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.bezierCurveTo(-0.6, -2.6, 1.6, -3.2, 3.6, -2.8); ctx.bezierCurveTo(5.6, -2.4, 6.9, -1.4, 7, 0); ctx.bezierCurveTo(6.9, 1.4, 5.6, 2.4, 3.6, 2.8); ctx.bezierCurveTo(1.6, 3.2, -0.6, 2.6, -0.6, 0); ctx.closePath(); };
    // a warm rim on the sunward edge: the same shapes a hair toward the light, under the ink
    const lbx = c * LX + s * LY, lby = -s * LX + c * LY; // the light's direction in body space
    const ca = Math.cos(sp.hd + sp.bend), sa = Math.sin(sp.hd + sp.bend), lax = ca * LX + sa * LY, lay = -sa * LX + ca * LY; // … and in the abdomen's
    ctx.fillStyle = L ? 'rgba(255,250,236,0.95)' : 'rgba(255,200,136,0.85)';
    ctx.save(); ctx.rotate(sp.bend); ctx.translate(-lax * 0.75, -lay * 0.75); abdomen(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(-lbx * 0.75, -lby * 0.75); ceph(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(sp.bend);
    const gx = -lax * 6, gy = -lay * 6, gr = ctx.createLinearGradient(-6 + gx, gy, -6 - gx, -gy);
    gr.addColorStop(0, L ? 'rgb(96,78,60)' : 'rgb(58,36,22)'); gr.addColorStop(0.45, ink); gr.addColorStop(1, ink);
    ctx.fillStyle = gr; abdomen(); ctx.fill();
    // the folium: a darker scalloped band down the back, edged paler, and the pale cross of spots
    ctx.fillStyle = L ? 'rgba(30,24,18,0.5)' : 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.moveTo(-2.6 * ab, 0);
    for (let j = 0; j <= 4; j++) { const xx = (-2.6 - j * 2.3) * ab, w = (2.6 - j * 0.45) * (j % 2 ? 0.8 : 1); ctx.lineTo(xx, -w); }
    for (let j = 4; j >= 0; j--) { const xx = (-2.6 - j * 2.3) * ab, w = (2.6 - j * 0.45) * (j % 2 ? 0.8 : 1); ctx.lineTo(xx, w); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = L ? 'rgba(240,228,204,0.7)' : 'rgba(255,214,160,0.32)';
    for (const [mx, my, r] of [[-3.4, 0, 0.7], [-5.3, 0, 0.85], [-7.4, 0, 0.7], [-5.3, -1.9, 0.65], [-5.3, 1.9, 0.65], [-9.3, -2.9, 0.5], [-9.3, 2.9, 0.5], [-3.2, -3.9, 0.45], [-3.2, 3.9, 0.45]]) { ctx.beginPath(); ctx.arc(mx * ab, my, r, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = ink; ceph(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    // the palps and, between them, the chelicerae: working at the bundle while it feeds
    const ch = sp.chew ? 0.5 + 0.5 * Math.sin(sp.chewPh) : 0.3, pw = sp.chew ? Math.sin(sp.chewPh * 0.5 + 1) * 0.45 : 0;
    ctx.beginPath(); ctx.moveTo(6.4, -1.2); ctx.quadraticCurveTo(7.9, -1.8 - pw, 8.6 + pw * 0.5, -1.1 - pw); ctx.moveTo(6.4, 1.2); ctx.quadraticCurveTo(7.9, 1.8 + pw, 8.6 - pw * 0.5, 1.1 + pw); ctx.stroke();
    ctx.lineWidth = 1.05;
    ctx.beginPath(); ctx.moveTo(6.5, -0.45); ctx.lineTo(7.4 + 0.25 * ch, -0.4 - 0.35 * ch); ctx.moveTo(6.5, 0.45); ctx.lineTo(7.4 + 0.25 * ch, 0.4 + 0.35 * ch); ctx.stroke();
    ctx.restore();
  }

  /* ---------- insects, prey, falling drops ---------- */

  /**
   * A fly or a small moth. Its wings catch the low sun (in flight a pale blur, beating; stuck in the web, spread and
   * buzzing in bursts); its body is dark with a warm rim on the sunward side.
   */
  function drawInsect(ctx, ins, x, y, L, T, alpha = 1) {
    const s = ins.sz, flying = ins.state === 'fly' || ins.state === 'free', buzzing = flying || ins.buzz > 0;
    const lbx = Math.cos(ins.ang) * LX + Math.sin(ins.ang) * LY, lby = -Math.sin(ins.ang) * LX + Math.cos(ins.ang) * LY; // the light, in its own frame
    ctx.save(); ctx.translate(x, y); ctx.rotate(ins.ang); ctx.scale(s, s);
    if (ins.roll) { const cr = Math.cos(ins.roll); ctx.scale(1, Math.abs(cr) < 0.2 ? 0.2 * Math.sign(cr || 1) : cr); } // rolled over and over in the spider's legs
    ctx.globalAlpha = alpha;
    if (!L) ctx.globalCompositeOperation = 'lighter';
    if (ins.type === 'moth') {
      const f = buzzing ? Math.sin(T * 34 + ins.ph) : 0.25;
      for (const sd of [-1, 1]) {
        ctx.fillStyle = L ? `rgba(140,124,100,${0.55 + 0.25 * Math.abs(f)})` : `rgba(236,220,190,${0.22 + 0.2 * Math.abs(f)})`;
        ctx.beginPath(); ctx.ellipse(-0.8, sd * (2.2 + f * 0.9), 2.4, 2.7 * (0.5 + 0.5 * Math.abs(f)), sd * 0.45, 0, TAU); ctx.fill();
      }
    } else if (buzzing) { // a blur where the wings beat
      for (const sd of [-1, 1]) {
        ctx.fillStyle = L ? 'rgba(120,132,150,0.3)' : 'rgba(226,234,246,0.2)';
        ctx.beginPath(); ctx.moveTo(0.4, 0); ctx.ellipse(0.4, 0, 4.2, 4.2, 0, Math.PI + sd * 0.15, Math.PI + sd * 1.25, sd < 0); ctx.closePath(); ctx.fill();
        const a = sd * (0.55 + 0.5 * Math.sin(T * 63 + ins.ph));
        ctx.save(); ctx.rotate(Math.PI + a); ctx.fillStyle = L ? 'rgba(110,122,140,0.45)' : 'rgba(236,242,250,0.3)'; ctx.beginPath(); ctx.ellipse(2.4, 0, 2.6, 0.95, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    } else {
      for (const sd of [-1, 1]) { ctx.save(); ctx.rotate(Math.PI + sd * 0.3); ctx.fillStyle = L ? 'rgba(110,122,140,0.5)' : 'rgba(236,242,250,0.34)'; ctx.beginPath(); ctx.ellipse(2.6, 0, 2.9, 1.05, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    const ink = L ? 'rgba(44,38,32,0.92)' : 'rgba(8,7,6,0.95)';
    const body = () => { ctx.beginPath(); ctx.ellipse(-1.9, 0, 2.5, 1.35, 0, 0, TAU); ctx.moveTo(1.9, 0); ctx.ellipse(0.5, 0, 1.4, 1.3, 0, 0, TAU); ctx.moveTo(3.05, 0); ctx.arc(2.1, 0, 0.95, 0, TAU); };
    ctx.fillStyle = L ? 'rgba(255,250,236,0.9)' : 'rgba(255,200,140,0.75)';
    ctx.save(); ctx.translate(-lbx * 0.35, -lby * 0.35); body(); ctx.fill(); ctx.restore();
    ctx.fillStyle = ink; body(); ctx.fill();
    if (!flying) { // legs, scrabbling
      ctx.strokeStyle = ink; ctx.lineWidth = 0.32; ctx.beginPath();
      for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) { const w = Math.sin(T * 25 + j * 2 + sd) * ins.str; ctx.moveTo(0.4 + (j - 1) * 0.7, sd * 0.9); ctx.lineTo(0.4 + (j - 1) * 1.5 + w * 0.6, sd * (2.5 + w * 0.4)); }
      ctx.stroke();
    }
    ctx.restore();
  }
  /** A heavy beetle in flight: wing cases lifted, the wings a pale blur, a rim of low sun on its shell. */
  function drawBeetle(ctx, b, x, y, L, T) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(b.ang); ctx.scale(b.sz, b.sz);
    const lbx = Math.cos(b.ang) * LX + Math.sin(b.ang) * LY, lby = -Math.sin(b.ang) * LX + Math.cos(b.ang) * LY;
    if (!L) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = L ? 'rgba(120,128,140,0.35)' : 'rgba(226,232,242,0.16)';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.ellipse(0.5, 0, 8.5, 8.5, 0, Math.PI + sd * 0.25, Math.PI + sd * 1.5, sd < 0); ctx.closePath(); ctx.fill(); }
    const f = Math.sin(T * 55);
    ctx.fillStyle = L ? 'rgba(110,118,132,0.45)' : 'rgba(236,240,248,0.26)';
    for (const sd of [-1, 1]) { ctx.save(); ctx.rotate(Math.PI + sd * (0.9 + 0.4 * f)); ctx.beginPath(); ctx.ellipse(4.6, 0, 5, 1.7, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.globalCompositeOperation = 'source-over';
    const shell = () => {
      ctx.beginPath(); ctx.ellipse(-1.5, 0, 4.4, 3.3, 0, 0, TAU);
      for (const sd of [-1, 1]) { ctx.moveTo(-1.3 + 4.2, sd * 1.9); ctx.ellipse(-1.3, sd * 2.1, 4.2, 2.1, sd * 0.3, 0, TAU); }
      ctx.moveTo(4.5, 0); ctx.ellipse(2.9, 0, 1.6, 2.1, 0, 0, TAU); ctx.moveTo(5.6, 0); ctx.arc(4.4, 0, 1.2, 0, TAU);
    };
    ctx.fillStyle = L ? 'rgba(255,250,236,0.95)' : 'rgba(255,196,130,0.8)';
    ctx.save(); ctx.translate(-lbx * 0.5, -lby * 0.5); shell(); ctx.fill(); ctx.restore();
    ctx.fillStyle = L ? 'rgb(46,40,34)' : 'rgb(6,5,4)'; shell(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(5, -0.6); ctx.lineTo(6.8, -1.8); ctx.moveTo(5, 0.6); ctx.lineTo(6.8, 1.8); ctx.stroke();
    ctx.fillStyle = L ? 'rgba(255,255,255,0.45)' : 'rgba(255,226,180,0.35)'; ctx.beginPath(); ctx.ellipse(-2.4 - lbx, -lby * 1.4, 1.8, 0.55, Math.atan2(-lby, -lbx) + Math.PI / 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A dry leaf tumbling down, the low sun glowing amber through it, its veins dark. */
  function drawLeaf(ctx, lf, x, y, L) {
    const fl = Math.cos(lf.flip), sx = Math.max(0.12, Math.abs(fl));
    ctx.save(); ctx.translate(x, y); ctx.rotate(lf.ang); ctx.scale(lf.sz * sx, lf.sz);
    const shape = () => { ctx.beginPath(); ctx.moveTo(-6, 0); ctx.bezierCurveTo(-3, -4.6, 3.2, -4.3, 6.6, 0.5); ctx.bezierCurveTo(3, 3.9, -3, 4.1, -6, 0); };
    const g = ctx.createLinearGradient(-6, -4, 6, 4);
    if (L) { g.addColorStop(0, 'rgba(176,120,58,0.85)'); g.addColorStop(1, 'rgba(120,80,40,0.85)'); } else { g.addColorStop(0, `rgba(200,128,50,${0.55 + 0.3 * sx})`); g.addColorStop(1, `rgba(90,50,20,${0.7 + 0.2 * sx})`); }
    ctx.fillStyle = g; shape(); ctx.fill();
    ctx.strokeStyle = L ? 'rgba(80,50,26,0.8)' : 'rgba(30,16,8,0.85)'; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6.2, 0.4);
    for (let j = -2; j <= 2; j++) { if (!j) continue; const vx = j * 1.9; ctx.moveTo(vx, 0.1 * j); ctx.lineTo(vx + 2, Math.sign(j) * 2.6); ctx.moveTo(vx, 0.1 * j); ctx.lineTo(vx + 2, -Math.sign(j) * 2.6); }
    ctx.stroke();
    ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-8.4, 0.9); ctx.stroke(); // the stalk
    ctx.restore();
  }
  /** One more turn of silk on the prey: a broad band across it, or (as it fills out) a lump along it. */
  function addLayer(ins) {
    const n = ins.layers.length;
    if (n > 24) return;
    const band = n < 6 ? true : RND() < 0.55;
    ins.layers.push(band
      ? { x: -3.6 + RND() * 5.8, y: (RND() - 0.5) * 0.5, rx: 0.9 + RND() * 0.8, ry: 1.9 + RND() * 0.6 + n * 0.02, rot: (RND() - 0.5) * 0.7, ph: RND() * TAU, cu: (RND() - 0.5) * 2 }
      : { x: -0.8 + (RND() - 0.5) * 2, y: (RND() - 0.5) * 0.9, rx: 2.6 + RND() * 1.2 + n * 0.02, ry: 1.4 + RND() * 0.7 + n * 0.015, rot: (RND() - 0.5) * 0.35, ph: RND() * TAU, cu: (RND() - 0.5) * 2 });
  }

  /**
   * The prey under its silk: every band the spider combed over it is laid on in turn, so the bundle grows layer by
   * layer, first a veil the insect shows through, then a pale, opaque, lumpy mummy; it turns as it is rolled (the bands
   * on its far side show dimmer), the sun lights its upper side, and fine loose strands catch the light.
   */
  function drawBundle(ctx, ins, x, y, L) {
    const ls = ins.layers;
    if (!ls || !ls.length) return;
    // as it is fed on it is sucked out: smaller, flatter, crumpled, duller, the outer turns gone thin and translucent
    const e = ins.eat || 0, sh = 1 - 0.34 * e, fl = 1 - 0.3 * e, a0 = ins.ang + (ins.tw || 0);
    const roll = ins.roll || 0, lbx = Math.cos(a0) * LX + Math.sin(a0) * LY, lby = -Math.sin(a0) * LX + Math.cos(a0) * LY;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a0); ctx.scale(ins.sz * sh, ins.sz * sh * fl);
    const pos = (b) => { const c = Math.cos(roll * 0.8 + b.ph); return [b.x, b.y * (1 + e * 0.9) + c * 0.5 + e * b.cu * 0.35, 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(roll * 0.8 + b.ph))]; };
    const fresh = L ? [250, 248, 243] : [222, 216, 202], dull = L ? [206, 196, 180] : [196, 182, 156];
    const silk = fresh.map((v, i) => Math.round(lerp(v, dull[i], e)));
    for (const b of ls) {
      const [bx, by, fr] = pos(b), edge = 1 - 0.45 * e * clamp(Math.abs(b.x + 0.6) / 3.5, 0, 1);
      ctx.fillStyle = rgba(silk, (L ? 0.42 : 0.27) * fr * edge);
      ctx.beginPath(); ctx.ellipse(bx, by, b.rx, b.ry, b.rot, 0, TAU); ctx.fill();
    }
    // light and shade over the whole bundle
    const w = ins.wrap * (1 - 0.6 * e), clip = () => { ctx.beginPath(); for (const b of ls) { const [bx, by] = pos(b); ctx.moveTo(bx + b.rx, by); ctx.ellipse(bx, by, b.rx, b.ry, b.rot, 0, TAU); } };
    ctx.save(); clip(); ctx.clip();
    const g = ctx.createLinearGradient(-lbx * 4, -lby * 4, lbx * 4, lby * 4);
    g.addColorStop(0, L ? `rgba(255,255,255,${0.5 * w})` : `rgba(255,236,200,${0.22 * w})`); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, L ? `rgba(70,76,90,${0.22 * w})` : `rgba(40,34,28,${0.3 * w})`);
    ctx.fillStyle = g; ctx.fillRect(-6, -5, 12, 10);
    ctx.restore();
    if (L) { ctx.strokeStyle = `rgba(96,102,116,${0.45 * Math.min(1, ins.wrap * 2) * (1 - 0.3 * e)})`; ctx.lineWidth = 0.22; clip(); ctx.stroke(); }
    // fine strands round it, catching the light
    if (!L) ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    for (const b of ls) {
      const [bx, by, fr] = pos(b);
      if (fr < 0.75) continue;
      const h = b.ry * 1.08;
      ctx.moveTo(bx - 0.4 * b.cu, by - h); ctx.quadraticCurveTo(bx + b.cu * 0.9, by, bx + 0.4 * b.cu, by + h);
    }
    ctx.strokeStyle = L ? `rgba(255,255,255,${0.8 * (1 - 0.4 * e)})` : `rgba(255,246,228,${0.42 * (1 - 0.5 * e)})`;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * While it wraps: silk drawn out of the spinnerets by the hind legs, combed into a broad band and laid over the
   * turning prey: a fan of fine threads from the spinnerets to each hind foot, and on to the prey as the foot comes down.
   */
  function drawSwathes(ctx, st, sp, ins, x, y, L) {
    const sn = spinneret(sp), ox = st.spOff.x, oy = st.spOff.y, sx = sn.x + ox, sy = sn.y + oy;
    if (!L) ctx.globalCompositeOperation = 'lighter';
    for (const Lg of sp.legs) {
      if (Lg.pair !== 3) continue;
      const fx = Lg.x + ox, fy = Lg.y + oy, e = 0.5 + 0.5 * Math.sin(sp.combPh + (Lg.side > 0 ? 0 : Math.PI));
      const px = -(fy - sy), py = fx - sx, pl = Math.hypot(px, py) || 1, nx = px / pl, ny = py / pl;
      // the band: a haze of many threads …
      ctx.strokeStyle = L ? 'rgba(150,156,168,0.2)' : 'rgba(255,246,226,0.1)'; ctx.lineWidth = 2.2 * sp.k;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); if (e > 0.45) ctx.lineTo(x, y); ctx.stroke();
      // … and a few of them catching the light
      ctx.strokeStyle = L ? 'rgba(90,98,112,0.5)' : 'rgba(255,248,232,0.42)'; ctx.lineWidth = 0.35;
      ctx.beginPath();
      for (let j = -1; j <= 1; j++) {
        const o = j * 0.9;
        ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + fx) / 2 + nx * o * 1.6, (sy + fy) / 2 + ny * o * 1.6, fx + nx * o * 0.6, fy + ny * o * 0.6);
        if (e > 0.45) { const a = ins.roll * 1.3 + j * 0.9 + (Lg.side > 0 ? 0 : Math.PI); ctx.moveTo(fx + nx * o * 0.6, fy + ny * o * 0.6); ctx.lineTo(x + Math.cos(a) * 3 * ins.sz, y + Math.sin(a) * 2 * ins.sz); }
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- the breeze ---------- */

  function windAt(st) {
    const T = st.T;
    return 0.55 + 0.22 * Math.sin(T * 0.21) + 0.16 * Math.sin(T * 0.53 + 1.3) + 0.1 * Math.sin(T * 1.27 + 2.1) + st.gust;
  }

  /** Every node's place this frame: the sheet drifting and breathing in the breeze, the shaking from a struggle. */
  function displace(st, site) {
    if (site.sim) return;
    const T = site.T, w = st.wind, k = site.k, H = site.hubN;
    const sx = (w - 0.5) * 3.2 * k + 1.1 * k * Math.sin(T * 0.9), sy = 0.9 * k * Math.sin(T * 0.67 + 0.4) + (w - 0.5) * 0.8 * k, br = 0.005 * Math.sin(T * 0.43) * w;
    const ev = site.events;
    for (const e of ev) { const a = T - e.t0; e.cur = e.amp * Math.exp(-e.decay * a) * Math.sin(e.w * a); }
    const fl = 0.22 * k * w, gu = st.gust * k;
    for (const n of site.nodes) {
      let dx = 0, dy = 0;
      if (n.f > 0 && H) {
        dx = n.f * (sx + br * (n.x - H.x) + fl * Math.sin(T * 2.3 + n.ph) + gu * 7 * Math.sin(T * 3.1 + n.x * 0.018 / k));
        dy = n.f * (sy + br * (n.y - H.y) + fl * Math.cos(T * 1.9 + n.ph) + gu * 4.5 * Math.cos(T * 2.6 + n.y * 0.02 / k));
        for (const e of ev) {
          const ddx = n.x - e.x, ddy = n.y - e.y, g = Math.exp(-(ddx * ddx + ddy * ddy) / e.s2) * e.cur * Math.min(1, n.f * 3);
          if (g > 0.001 || g < -0.001) { dx += g * e.dx; dy += g * e.dy; }
        }
      }
      n.X = n.x + dx; n.Y = n.y + dy;
    }
    for (let i = ev.length - 1; i >= 0; i--) if (T - ev[i].t0 > 5 / ev[i].decay) ev.splice(i, 1);
  }
  /** The displacement at a free point (the spider, a fly), from its place in the web. */
  function dispAt(st, site, x, y) {
    const H = site.hubN;
    if (!H || site.sim) return P(0, 0);
    const d = Math.hypot(x - H.x, y - H.y), ang = Math.atan2(y - H.y, x - H.x), Lr = rayPoly(H, ang, site.pg).d;
    if (!(d < Lr)) return P(0, 0);
    const f = 1 - 0.8 * (d / Lr), T = site.T, w = st.wind, k = site.k;
    const sx = (w - 0.5) * 3.2 * k + 1.1 * k * Math.sin(T * 0.9), sy = 0.9 * k * Math.sin(T * 0.67 + 0.4) + (w - 0.5) * 0.8 * k, br = 0.005 * Math.sin(T * 0.43) * w;
    const gu = st.gust * k;
    let dx = f * (sx + br * (x - H.x) + gu * 7 * Math.sin(T * 3.1 + x * 0.018 / k)), dy = f * (sy + br * (y - H.y) + gu * 4.5 * Math.cos(T * 2.6 + y * 0.02 / k));
    for (const e of site.events) { const ddx = x - e.x, ddy = y - e.y, g = Math.exp(-(ddx * ddx + ddy * ddy) / e.s2) * e.cur * Math.min(1, f * 3); dx += g * e.dx; dy += g * e.dy; }
    return P(dx, dy);
  }
  /** A struggle or an impact: a damped shake spreading from a point. */
  function shake(site, x, y, amp, dx, dy, s, w = 18, decay = 2.2) {
    const l = Math.hypot(dx, dy) || 1;
    site.events.push({ x, y, amp, dx: dx / l, dy: dy / l, s2: s * s, w, decay, t0: site.T, cur: 0 });
    if (site.events.length > 6) site.events.shift();
  }

  /* ---------- the site: one place, one web ---------- */

  function newSite(st, W, H, seed, pv) {
    const c = compose(W, H, seed, pv);
    const site = { c, W0: W, H0: H, k: c.k, nodes: [], segs: [], radii: [], edges: null, hubN: null, plan: null,
      sp: null, chain: null, free: null, drag: null, loose: null, live: null, dip: null, tail: null,
      insects: [], bundles: [], falls: [], events: [], dewT: -1, drops: null, glints: null, sim: null, flyers: [],
      ox: 0, T: 0, layer: null, layerKey: '', Tm: { s: 1, x: 0, y: 0 } };
    // the spider waits a little way down its twig from the tip
    const q = polyAt(c.start.pl, c.start.pl.len - (pv ? 0 : 70 * c.k));
    site.sp = newSpider(q.x, q.y, Math.atan2(q.ty, q.tx), c.k);
    site.sp.path = c.start.pl; site.sp.ps = c.start.pl.len - 70 * c.k;
    for (const Lg of site.sp.legs) { const t = footTarget(site.sp, Lg, P(0, 0)); Lg.x = t.x; Lg.y = t.y; }
    return site;
  }

  /* ---------- the spider's work, frame by frame (generators: one yield per frame) ---------- */

  function place(sp, x, y) { sp.vx = x - sp.x; sp.vy = y - sp.y; sp.x = x; sp.y = y; }

  /**
   * Walk along a polyline. o: speed (px/s at k = 1), mode ('line' feet on the path / 'mesh' / 'hang'), tail (the path is
   * traced by the spinnerets, the body ahead), hd (a fixed heading), marks + mark(i) (called as the spinnerets pass
   * each cumulative distance), each(k, s).
   */
  function* walk(site, pts, o = {}) {
    const sp = site.sp, pl = poly(pts), v = (o.speed || 200) * site.k, acc = v * (o.acc || 5);
    sp.mode = o.mode || 'line';
    sp.path = sp.mode === 'line' ? (o.feet ? poly(o.feet) : pl) : null;
    let s = 0, cur = o.v0 ? v : 0, mi = 0;
    const off = o.tail ? SPIN * sp.k * (1 - 0.3 * sp.abd) : 0;
    if (pl.len < 0.5) { if (o.marks) while (mi < o.marks.length) o.mark(mi++); return; }
    while (true) {
      const left = pl.len - s;
      cur = Math.min(cur + acc * DT, v, o.noStop ? v : Math.sqrt(2 * acc * left) + 10 * site.k);
      s = Math.min(pl.len, s + cur * DT);
      const q = polyAt(pl, s);
      const hd = o.hd != null ? o.hd : Math.atan2(q.ty, q.tx);
      if (o.tail) { sp.hdT = hd; place(sp, q.x + Math.cos(sp.hd) * off, q.y + Math.sin(sp.hd) * off); }
      else { sp.hdT = hd; place(sp, q.x, q.y); }
      if (o.feet) { const fq = polyNear(sp.path, P(sp.x, sp.y)); sp.ps = fq ? fq.s : 0; } else sp.ps = s;
      if (o.marks) while (mi < o.marks.length && o.marks[mi] <= s + 0.01) o.mark(mi++);
      if (o.each) o.each(s / pl.len, s);
      yield;
      if (s >= pl.len) break;
    }
    sp.vx = sp.vy = 0;
  }
  function* wait(site, sec, fn) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { if (fn) fn(i / n); yield; } site.sp.vx = site.sp.vy = 0; }
  function* turnTo(site, hd, sec = 0.6) { site.sp.hdT = hd; yield* wait(site, sec); }

  /** A new thread trailed from P as the spider walks; fastened at the end, its slack drawn in. */
  function startFree(site, Pt, slack = 0.25) { site.free = { x: Pt.x, y: Pt.y, len: 0, slack, tight: 0 }; }
  function* fasten(site, after) {
    const sp = site.sp, fr = site.free;
    yield* wait(site, 0.22, (k) => { sp.abd = Math.sin(Math.PI * k) * 0.6; });
    if (fr) for (let i = 0; i < 8; i++) { fr.tight = (i + 1) / 8; yield; }
    site.free = null;
    if (after) after();
  }

  /* 1. the bridge line, carried off by the breeze */
  function* bridge(st, site) {
    const c = site.c, sp = site.sp, k = site.k, A = c.A, s = c.s;
    // out to the tip, then turn round to face along the twig, into the breeze
    yield* walk(site, subPoly(c.start.pl, c.start.pl.len - 70 * k, c.start.pl.len - 2 * k), { speed: 60 });
    const tip = polyAt(c.start.pl, c.start.pl.len - 6 * k);
    sp.path = poly(subPoly(c.start.pl, c.start.pl.len - 60 * k, c.start.pl.len)); sp.ps = sp.path.len - 6 * k;
    yield* turnTo(site, Math.atan2(-tip.ty, -tip.tx), 0.9);
    yield* wait(site, 0.8, (q) => { sp.abd = sm(0, 1, q); }); // the abdomen tilts up toward the gap
    // silk pays out from the spinnerets; the breeze takes it
    const N = 34, sp0 = spinneret(sp), ch = { pts: [], L: 2 * k, snag: null };
    for (let i = 0; i < N; i++) ch.pts.push({ x: sp0.x + s * i * 0.05, y: sp0.y, px: sp0.x + s * i * 0.05, py: sp0.y });
    site.chain = ch;
    const gap = Math.abs(c.Bp.x - A.x), Lmax = gap * 1.9, fp = c.far.pl;
    let t = 0;
    while (!ch.snag) {
      t += DT;
      ch.L = Math.min(Lmax, ch.L + (18 + 30 * sm(0, 3, t)) * k * DT * (t > 14 ? 1.6 : 1));
      const root = spinneret(sp), seg = ch.L / (N - 1), T = site.T;
      ch.pts[0].x = root.x; ch.pts[0].y = root.y;
      const wv = (34 + 24 * st.wind) * k, steer = t > 18 ? sm(18, 26, t) : 0;
      for (let i = 1; i < N; i++) {
        const p = ch.pts[i];
        let vx = p.x - p.px, vy = p.y - p.py;
        p.px = p.x; p.py = p.y;
        const tx = s * wv + 16 * k * Math.sin(p.y * 0.012 / k + T * 1.1) + 9 * k * Math.sin(p.x * 0.021 / k - T * 1.7);
        let ty = 22 * k * Math.sin(T * 0.55 + p.x * 0.006 / k) * Math.cos(T * 0.31) + 12 * k * Math.cos(p.x * 0.017 / k + T * 1.3);
        ty += (c.Bp.y - p.y) * (0.1 + 0.4 * steer) * (i / N); // the breeze runs level under the canopy: the line wafts about the far twig's height
        vx += (tx * DT - vx) * 0.09; vy += (ty * DT - vy) * 0.09 + 7 * k * DT * DT;
        p.x += vx; p.y += vy;
      }
      for (let it = 0; it < 10; it++) {
        for (let i = 1; i < N; i++) {
          const a = ch.pts[i - 1], b = ch.pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
          if (d <= seg) continue;
          const m = (d - seg) / d;
          if (i === 1) { b.x -= dx * m; b.y -= dy * m; } else { a.x += dx * m * 0.5; a.y += dy * m * 0.5; b.x -= dx * m * 0.5; b.y -= dy * m * 0.5; }
        }
      }
      // does it touch the far twig?
      for (let i = Math.floor(N * 0.35); i < N && !ch.snag; i++) {
        const a = ch.pts[i - 1], b = ch.pts[i];
        for (let j = 1; j < fp.pts.length; j++) {
          const hit = segX(a, b, fp.pts[j - 1], fp.pts[j]);
          if (hit) { const B = P(lerp(a.x, b.x, hit[0]), lerp(a.y, b.y, hit[0])); ch.snag = { B, i, sB: fp.cum[j - 1] + hit[1] * (fp.cum[j] - fp.cum[j - 1]) }; break; }
        }
      }
      yield;
    }
    // snagged: what lies beyond the twig hangs there as a loose end; the spider hauls in the slack
    const { B, i: si, sB } = ch.snag;
    const tailPts = ch.pts.slice(si, si + 4), tseg = Math.min(5 * k, ch.L / (N - 1));
    site.tail = { pts: [{ x: B.x, y: B.y, px: B.x, py: B.y }].concat(tailPts.map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y }))), seg: tseg };
    ch.pts = ch.pts.slice(0, si); ch.pts.push({ x: B.x, y: B.y, px: B.x, py: B.y });
    const n = ch.pts.length;
    let L0 = 0;
    for (let i = 1; i < n; i++) L0 += dist(ch.pts[i - 1], ch.pts[i]);
    sp.haul = 1; sp.haulPh = 0;
    const L1 = dist(A, B) * 1.004, haulT = 2.2;
    for (let f = 0; f <= haulT / DT; f++) {
      const e = sm(0, 1, f / (haulT / DT)), Lc = lerp(L0, L1, e), seg = Lc / (n - 1), root = f > haulT / DT * 0.75 ? A : spinneret(sp);
      ch.pts[0].x = lerp(ch.pts[0].x, root.x, 0.3); ch.pts[0].y = lerp(ch.pts[0].y, root.y, 0.3);
      ch.pts[n - 1].x = B.x; ch.pts[n - 1].y = B.y;
      for (let i = 1; i < n - 1; i++) { const p = ch.pts[i], vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9; p.px = p.x; p.py = p.y; p.x += vx + s * 4 * k * DT * DT; p.y += vy + 30 * k * DT * DT; }
      for (let it = 0; it < 14; it++) for (let i = 1; i < n; i++) {
        const a = ch.pts[i - 1], b = ch.pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        if (d <= seg) continue;
        const m = (d - seg) / d, wa = i === 1 ? 0 : 0.5, wb = i === n - 1 ? 0 : 0.5, sw = wa + wb || 1;
        a.x += dx * m * wa / sw; a.y += dy * m * wa / sw; b.x -= dx * m * wb / sw; b.y -= dy * m * wb / sw;
      }
      yield;
    }
    sp.haul = 0;
    site.chain = null;
    plan(site, B, sB);
    buildEdge(site, 0);
    anchorFan(site, site.corners[0], c.start, c.start.pl.len - 1);
    anchorFan(site, site.corners[1], c.far, sB);
    // across, laying a second line over the first
    yield* turnTo(site, Math.atan2(B.y - A.y, B.x - A.x), 0.5);
    sp.abd = 0;
    site.dip = { seg: site.edges[0].segs[0], a: A, b: B, double: 0 };
    yield* walk(site, [P(sp.x, sp.y), B], { speed: 95, each: (q) => { site.dip.double = q; } });
    site.dip.double = 1;
  }

  /* 2. the loose thread under the bridge, the drop from its middle: the Y */
  function* yForm(st, site) {
    const p = site.plan, sp = site.sp, k = site.k, A = p.A, B = p.B, H = p.H;
    const Ll = dist(A, H) + dist(H, B);
    yield* turnTo(site, Math.atan2(A.y - B.y, A.x - B.x), 0.6);
    yield* fasten(site);
    // back across the bridge, the new line paying out behind and hanging below
    site.loose = { a: B, b: null, len: 0, onIt: false };
    yield* walk(site, [P(sp.x, sp.y), A], { speed: 130, each: (q) => { site.loose.len = Math.min(Ll, dist(B, spinneret(sp)) * (1 + 0.32 * q)); } });
    site.loose.len = Ll; site.loose.b = A;
    yield* wait(site, 0.3);
    yield* fasten(site);
    site.dip = null;
    // out along the loose thread; it takes the spider's weight and pulls into a V, its fork sliding toward the middle
    const arc = [];
    const below = (x) => { let lo = Math.max(A.y, B.y), hi = lo + Ll; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, q = P(x, m); if (dist(q, A) + dist(q, B) < Ll) lo = m; else hi = m; } return (lo + hi) / 2; };
    arc.push(P(A.x, A.y));
    for (let i = 0; i <= 24; i++) { const x = lerp(A.x, H.x, i / 24); arc.push(P(x, below(x))); }
    site.loose.onIt = true;
    yield* walk(site, arc, { speed: 95 });
    site.loose = null;
    // the arms of the V are now threads: two radii; and down on a dragline
    const rA = site.radii.find((r) => r.proto === 0), rB = site.radii.find((r) => r.proto === 1), rC = site.radii.find((r) => r.proto === 2);
    buildRadius(site, rA); buildRadius(site, rB);
    yield* turnTo(site, Math.PI / 2, 0.5);
    site.drag = { x: H.x, y: H.y };
    const C = p.C, swing = (q) => Math.sin(q * 7) * 4 * k * Math.sin(Math.PI * q);
    const dpts = [];
    for (let i = 0; i <= 20; i++) { const q = i / 20; dpts.push(P(lerp(H.x, C.x, q) + swing(q), lerp(H.y + SPIN * 0.3 * k, C.y - 6 * k, q))); }
    yield* walk(site, dpts, { speed: 85, mode: 'hang', hd: Math.PI / 2, acc: 2 });
    // takes hold of the twig and fastens the line: the Y is done
    const lp = site.c.low.pl;
    yield* walk(site, [P(sp.x, sp.y), C], { speed: 30, feet: subPoly(lp, p.sC - 40 * k, p.sC + 40 * k) });
    yield* wait(site, 0.25);
    site.drag = null;
    buildRadius(site, rC);
    anchorFan(site, site.corners[3], site.c.low, p.sC);
  }

  /* 3. the frame: from twig to twig round the edge */
  function* frame(st, site) {
    const p = site.plan, c = site.c, k = site.k, sp = site.sp, A = p.A, B = p.B, C = p.C, H = p.H;
    const sTw = c.start.pl, fTw = c.far.pl, sp0 = (q) => P(q.x, q.y);
    const v = 250;
    // C → (up the Y) → A → down the start twig to ML: the thread C–ML
    startFree(site, C, 0.2);
    yield* walk(site, [sp0(sp), H, A], { speed: v, each: () => trail(site) });
    yield* walk(site, subPoly(sTw, p.sA, p.sML), { speed: v * 0.8, each: () => trail(site) });
    yield* fasten(site, () => { buildEdge(site, 3); anchorFan(site, site.corners[4], c.start, p.sML); });
    // ML → back up the twig to A: the thread ML–A
    startFree(site, p.ML, 0.15);
    yield* walk(site, subPoly(sTw, p.sML, p.sA), { speed: v * 0.8, each: () => trail(site) });
    yield* fasten(site, () => buildEdge(site, 4));
    // over the bridge, down the far twig to MR: the thread B–MR
    site.dip = { seg: site.edges[0].segs[0], a: A, b: B, double: 1 };
    yield* walk(site, [sp0(sp), B], { speed: v });
    site.dip = null;
    startFree(site, B, 0.15);
    yield* walk(site, subPoly(fTw, p.sB, p.sMR), { speed: v * 0.8, each: () => trail(site) });
    yield* fasten(site, () => { buildEdge(site, 1); anchorFan(site, site.corners[2], c.far, p.sMR); });
    // MR → up to B, down the arm to the hub and the vertical to C: the thread MR–C
    startFree(site, p.MR, 0.2);
    yield* walk(site, subPoly(fTw, p.sMR, p.sB), { speed: v * 0.8, each: () => trail(site) });
    yield* walk(site, [B, H, C], { speed: v, each: () => trail(site) });
    yield* fasten(site, () => buildEdge(site, 2));
    // back up to the hub
    yield* walk(site, [sp0(sp), H], { speed: v });
  }
  /** The trailed thread lengthens as the spider walks (it keeps it clear with a hind leg: not much slack). */
  function trail(site) {
    const fr = site.free;
    if (!fr) return;
    const s = spinneret(site.sp), d = Math.hypot(s.x - fr.x, s.y - fr.y);
    fr.len = Math.max(d, Math.min(fr.len + Math.hypot(site.sp.vx, site.sp.vy), d * (1 + fr.slack)));
  }

  /* 4. the radii, one by one, the widest gap first */
  function* radii(st, site) {
    const R = site.radii, sp = site.sp, H = site.plan.H, k = site.k;
    for (;;) {
      const built = R.filter((r) => r.built);
      let best = null, bestGap = -1;
      for (const r of R) {
        if (r.built) continue;
        let g = Infinity;
        for (const b of built) g = Math.min(g, Math.abs(angDiff(r.ang, b.ang)));
        g += RND() * 0.05;
        if (g > bestGap) { bestGap = g; best = r; }
      }
      if (!best) break;
      // out along the nearest finished radius to the frame, along the frame to the new one's place, trailing the thread
      let nb = built[0];
      for (const b of built) if (Math.abs(angDiff(best.ang, b.ang)) < Math.abs(angDiff(best.ang, nb.ang))) nb = b;
      const out = [P(H.x, H.y), P(nb.ex, nb.ey)].concat(framePath(site, radiusPerim(site, nb), radiusPerim(site, best)).slice(1));
      startFree(site, H, 0.015);
      yield* walk(site, out, { speed: 300, acc: 7, each: () => trail(site) });
      yield* fasten(site, () => buildRadius(site, best));
      // and back to the hub along it
      yield* walk(site, [P(sp.x, sp.y), H], { speed: 320, acc: 7 });
    }
  }

  /* 5. the hub's mesh and the temporary spiral, outward; 6. the capture spiral, inward */
  function* spirals(st, site) {
    const pl = spiralPlans(site), sp = site.sp;
    site.spi = pl;
    const run = function* (seq, kind, speed, onNode) {
      const pts = seq.map((q) => P(site.hubN.x + q.r.ux * q.d, site.hubN.y + q.r.uy * q.d));
      // start from where the spider stands
      const all = [P(sp.x - Math.cos(sp.hd) * SPIN * sp.k, sp.y - Math.sin(sp.hd) * SPIN * sp.k)].concat(pts);
      const cum = poly(all).cum;
      let prev = null;
      site.live = null;
      yield* walk(site, all, { speed, mode: 'mesh', tail: true, noStop: false, marks: cum.slice(1), mark: (i) => {
        const q = seq[i], n = onRadius(site, q.r, q.d);
        if (prev && prev !== n) { const sg = addSeg(site, prev, n, kind); if (kind === TEMP) { (prev.tmp = prev.tmp || []).push(sg); (n.tmp = n.tmp || []).push(sg); } }
        prev = n; site.live = { n, kind };
        if (onNode) onNode(q, n);
      } });
      site.live = null;
    };
    yield* run(pl.hub, HUB, 110);
    yield* run(pl.temp, TEMP, 260);
    // the sticky spiral, stroke by stroke: as it passes a radius, the scaffold outside it is cut away
    const cutOut = (q) => {
      for (const n of q.r.ns) {
        if (!n.tmp || n.d <= q.d + pl.pC * 0.25) continue;
        for (const sg of n.tmp) if (!sg.cut) sg.cut = site.T;
      }
    };
    for (const stroke of pl.cap) {
      const c0 = stroke[0], o = P(site.hubN.x + c0.r.ux * c0.d, site.hubN.y + c0.r.uy * c0.d);
      yield* walk(site, [P(sp.x, sp.y), o], { speed: 210, mode: 'mesh' });
      yield* run(stroke, CAP, 235, cutOut);
    }
    for (const sg of site.segs) if (sg.k === TEMP && !sg.cut) sg.cut = site.T; // what is left of it, near the hub
  }

  /* 7. the spider settles at the hub, head down; the dew begins to form */
  function* settle(st, site) {
    const sp = site.sp, H = site.plan.H;
    yield* walk(site, [P(sp.x, sp.y), H], { speed: 160, mode: 'mesh' });
    sp.hdT = Math.PI / 2;
    yield* wait(site, 1.2);
    site.dewT = site.T;
    makeDrops(site);
  }

  /** Beads of dew along the threads: closely along the capture spiral, sparser and larger on the radii and frame. */
  function makeDrops(site) {
    const k = site.k, pv = site.c.pv, R = K.rng(site.c.seed + 9);
    site.drops = [];
    site.glints = [];
    for (const sg of site.segs) {
      if (sg.dead || sg.cut || sg.k === TEMP || sg.k === ANCHOR) continue;
      const len = dist(sg.a, sg.b), cap = sg.k === CAP || sg.k === HUB;
      const gap = (pv ? 4.2 : cap ? 6.2 * k : 15 * k) * (0.85 + R() * 0.3);
      const n = Math.floor(len / gap + R() * 0.6);
      if (n <= 0) continue;
      sg.drops = [];
      for (let j = 0; j < n; j++) {
        const big = R() < (cap ? 0.07 : 0.2);
        let r = cap ? (0.65 + R() * 0.75) * k : (0.9 + R() * 0.9) * k;
        if (big) r *= 1.7 + R() * 0.6;
        if (pv) r = (cap ? 0.85 + R() * 0.45 : 1.1 + R() * 0.5) * (big ? 1.4 : 1);
        const d = { u: (j + 0.5 + (R() - 0.5) * 0.7) / n, r, dl: R() * 0.65, ph: R() * TAU, big, fall: 0 };
        sg.drops.push(d);
        if (big || R() < (pv ? 0.12 : 0.03)) site.glints.push({ sg, d, ph: R() * TAU, f: 0.4 + R() * 0.9 });
      }
      site.drops.push(sg);
    }
  }

  /*
   * The finished web: the dew, insects now and then, and the spider's meals. A bundle carried to the hub hangs just
   * under its jaws and it feeds, head down and otherwise still: the mouthparts working at the bundle, the front legs
   * turning it now and then, the bundle slowly sucked out (smaller, flatter, duller) over a minute or more, until the
   * spider cuts the empty husk loose and it tumbles away. A bundle left in the web is the larder: when the spider has
   * been idle at the hub a while, it goes out, cuts it free and brings it in to feed on.
   */
  function* idle(st, site, forever) {
    const sp = site.sp, pv = site.c.pv;
    let next = pv ? 4 + RND() * 4 : 8 + RND() * 8, caught = 0, quiet = 0, fetchIn = 7 + RND() * 9;
    const t0 = site.T, minT = 90 + RND() * 25, maxT = 200;
    site.meals = 0;
    for (;;) {
      const T = site.T - t0;
      // the web is torn at some point after at least one full meal (it may come in the middle of another)
      if (!forever && T > minT && (site.meals >= 1 || T > maxT) && !(site.meal && site.meals === 0) && (site.meal || quiet > 5)) return;
      if (!forever && T > maxT + 90) return;
      next -= DT;
      if (next <= 0 && (forever || (caught < 2 && T < minT))) {
        yield* insect(st, site);
        caught++; next = 26 + RND() * 30; quiet = 0;
        continue;
      }
      if (site.meal) {
        if (feedFrame(site)) { yield* dropHusk(st, site, site.meal); quiet = 0; fetchIn = 6 + RND() * 8; }
        else yield;
        continue;
      }
      quiet += DT;
      // the larder: a bundle stored in the web, fetched once the spider has sat idle for a while
      if (quiet > fetchIn) {
        const b = site.insects.find((i) => i.state === 'left');
        if (b) { yield* fetchBundle(st, site, b); quiet = 0; continue; }
      }
      if (RND() < 0.004) { const Lg = sp.legs[(RND() * 8) | 0]; if (Lg.t < 0) { Lg.t = 0; Lg.sx = Lg.x; Lg.sy = Lg.y; Lg.dur = 0.18; } } // a leg shifts its hold
      yield;
    }
  }

  /** Where a bundle hangs to be fed on: just under the jaws of the spider sitting head down at the hub. */
  const jawPt = (site) => P(site.plan.H.x + 0.6 * site.sp.k, site.plan.H.y + 9.6 * site.sp.k);
  /** Hang a bundle from a new point at the hub (the thread's end moves there over a second, carried by the legs). */
  function hangAt(site, ins, to, rope, from) {
    ins.state = 'hub'; ins.anc0 = P(from.x, from.y); ins.ancT = site.T; ins.ancTo = P(to.x, to.y); ins.anc = P(from.x, from.y); ins.rope = rope;
  }
  function startMeal(site, ins) {
    site.meal = ins; ins.eat = ins.eat || 0; ins.dur = ins.dur || (site.c.pv ? 50 : 62) + RND() * 20; ins.wrap = 1;
  }
  /** One frame of a meal: returns true when the bundle has been sucked dry. */
  function feedFrame(site) {
    const m = site.meal, sp = site.sp;
    if (!m) { sp.chew = 0; sp.handle = 0; return false; }
    m.eat = Math.min(1, m.eat + DT / m.dur);
    sp.chew = 1; sp.feedP = P(m.bx, m.by);
    if (sp.handle <= 0 && RND() < DT / 8) { sp.handle = 1.4; m.turn = RND() < 0.5 ? 1 : -1; } // now and then the front legs turn it
    if (sp.handle > 0) { sp.handle -= DT; m.tw = (m.tw || 0) + DT * 0.7 * m.turn; m.roll = (m.roll || 0) + DT * 1.6; }
    else m.tw = (m.tw || 0) * 0.97;
    return m.eat >= 1;
  }
  /** The meal is done: the empty husk is held a moment in the front legs, its thread cut, and it falls away. */
  function* dropHusk(st, site, m) {
    const sp = site.sp;
    sp.chew = 0; sp.handle = 1.2;
    yield* wait(site, 1.2);
    shake(site, m.bx, m.by, 0.6 * site.k, 0, 1, 16 * site.k, 20, 5);
    letFall(m, 0.3);
    site.meal = null; site.meals = (site.meals || 0) + 1; sp.handle = 0;
    yield* wait(site, 1.4);
  }
  /** A bundle (or the husk of one) let go: it tumbles down out of the web, drifting a little on the breeze. */
  function letFall(m, spin) { m.state = 'drop'; m.vx = (m.bx - (m.pbx ?? m.bx)) * 0.5; m.vy = 0; m.spin = (RND() - 0.5) * spin; m.tw = m.tw || 0; }
  /** Fetching a stored bundle: out along the nearest radius, cut it free, and back to the hub with it on a short line. */
  function* fetchBundle(st, site, b) {
    const sp = site.sp, H = site.plan.H, k = site.k, sk = sp.k;
    const ang = Math.atan2(b.tgt.y - H.y, b.tgt.x - H.x), d = Math.hypot(b.tgt.x - H.x, b.tgt.y - H.y);
    let r = site.radii[0];
    for (const q of site.radii) if (Math.abs(angDiff(q.ang, ang)) < Math.abs(angDiff(r.ang, ang))) r = q;
    site.fetching = b;
    sp.hdT = Math.atan2(r.uy, r.ux);
    yield* wait(site, 0.6);
    const near = P(H.x + r.ux * Math.max(0, d - 10 * sk), H.y + r.uy * Math.max(0, d - 10 * sk));
    yield* walk(site, [P(sp.x, sp.y), near], { speed: 140 });
    sp.hdT = Math.atan2(b.tgt.y - near.y, b.tgt.x - near.x);
    yield* wait(site, 1.1, () => { if (RND() < 0.12) shake(site, b.tgt.x, b.tgt.y, 0.5 * k, RND() - 0.5, RND() - 0.5, 14 * k, 20, 6); }); // cutting it out of the threads
    b.state = 'carried'; b.bx = b.pbx = b.tgt.x; b.by = b.pby = b.tgt.y; b.rope = 6 * k;
    yield* walk(site, [P(sp.x, sp.y), H], { speed: 105, acc: 4 });
    sp.hdT = Math.PI / 2;
    hangAt(site, b, jawPt(site), 4.3 * k, spinneret(sp));
    yield* wait(site, 1.4);
    site.fetching = null;
    startMeal(site, b);
  }
  /** Back at the hub after dealing with a newcomer: the half-eaten bundle is taken up again. */
  function* resumeMeal(site, m) {
    const sp = site.sp;
    sp.hdT = Math.PI / 2;
    hangAt(site, m, jawPt(site), 4.3 * site.k, m.anc);
    yield* wait(site, 1.3);
    site.parked = null;
    startMeal(site, m);
  }

  /**
   * An insect flies in and sticks. The spider feels the struggle through the web, turns toward it and plucks the
   * radius, runs out along it and bites; then it turns side-on, holds the prey in its front legs and rolls it over and
   * over, the abdomen curled round so the spinnerets are right at it, while the hind legs in turn comb broad bands of
   * silk out and lay them over it, layer after layer, until it is a pale lumpy mummy and lies still. It cuts the
   * bundle free and carries it to the hub on a short thread, or leaves it hanging in the web.
   */
  function* insect(st, site) {
    const sp = site.sp, H = site.plan.H, k = site.k, R = site.radii, spi = site.spi, pv = site.c.pv;
    const r = R[(RND() * R.length) | 0], dd = lerp(spi.Din + 10 * k, r.L - Math.max(12 * k, r.L * 0.14), 0.15 + RND() * 0.72);
    const tgt = P(H.x + r.ux * dd + (RND() - 0.5) * 5 * k, H.y + r.uy * dd + (RND() - 0.5) * 5 * k);
    const type = RND() < 0.7 ? 'fly' : 'moth';
    const fromL = RND() < 0.5, sx = fromL ? -40 : site.c.W + 40, sy = tgt.y + (RND() - 0.5) * site.c.H * 0.6;
    const ins = { type, x: sx, y: sy, vx: 0, vy: 0, ang: 0, sz: (type === 'moth' ? 1.9 : 1.6) * k * (pv ? 1.6 : 1), state: 'fly', ph: RND() * TAU, tgt, str: 1, buzz: 0, wrap: 0, roll: 0, layers: [], t: 0 };
    site.insects.push(ins);
    // its flight: wandering toward the web
    while (ins.state === 'fly') {
      ins.t += DT;
      const dx = tgt.x - ins.x, dy = tgt.y - ins.y, d = Math.hypot(dx, dy);
      const spd = (type === 'moth' ? 70 : 105) * k * (pv ? 0.5 : 1);
      const wob = Math.sin(ins.t * 5.3 + ins.ph) * 0.9 + Math.sin(ins.t * 11.7) * 0.4;
      const ax = dx / d, ay = dy / d, wx = ax - ay * wob, wy = ay + ax * wob;
      ins.vx += (wx * spd * DT - ins.vx) * 0.14; ins.vy += (wy * spd * DT - ins.vy) * 0.14;
      ins.x += ins.vx; ins.y += ins.vy;
      ins.ang = Math.atan2(ins.vy, ins.vx);
      if (d < 3 * k || ins.t > 30) { ins.state = 'stuck'; ins.x = tgt.x; ins.y = tgt.y; }
      if (site.meal && site.meal.eat < 1) feedFrame(site);
      yield;
    }
    // the hit: the web gives and shakes, drops are shaken off, the insect buzzes and fights
    shake(site, tgt.x, tgt.y, 3.2 * k, ins.vx, ins.vy, 34 * k, 16, 2.4);
    shedDrops(site, tgt, 16 * k, 0.5);
    hitSound(st, site, tgt.x, 1);
    ins.buzz = 0.6;
    const escape = !st.forceCatch && RND() < 0.14;
    // in the middle of a meal: it hangs the half-eaten bundle aside at the hub before it goes
    const parked = site.meal;
    if (parked) {
      site.meal = null; site.parked = parked; sp.chew = 0; sp.handle = 0;
      hangAt(site, parked, P(H.x + (RND() < 0.5 ? -1 : 1) * 9 * k, H.y + 4 * k), 5 * k, parked.anc);
      yield* wait(site, 0.8, () => strug(site, ins));
    }
    // the spider feels it: turns toward the shaking and plucks the radius to find where it is
    yield* wait(site, 0.3 + RND() * 0.35, () => strug(site, ins));
    sp.hdT = Math.atan2(r.uy, r.ux);
    yield* wait(site, 0.4, () => strug(site, ins));
    sp.haul = 1; sp.haulPh = 0;
    yield* wait(site, 0.55, () => { strug(site, ins); if (RND() < 0.3) shake(site, H.x + r.ux * 30 * k, H.y + r.uy * 30 * k, 1.1 * k, r.ux, r.uy, 30 * k, 24, 6); });
    sp.haul = 0;
    if (escape) { // it tears itself free before the spider gets there
      const pts = [P(sp.x, sp.y), P(H.x + r.ux * dd * 0.45, H.y + r.uy * dd * 0.45)];
      yield* walk(site, pts, { speed: 300, each: () => strug(site, ins) });
      ins.state = 'free'; ins.vx = (RND() - 0.5) * 3; ins.vy = -2;
      shake(site, tgt.x, tgt.y, 2 * k, 0, 1, 26 * k, 14, 3);
      shedDrops(site, tgt, 14 * k, 1);
      breakNear(site, tgt, 9 * k);
      yield* wait(site, 0.8);
      yield* walk(site, [P(sp.x, sp.y), H], { speed: 160 });
      sp.hdT = Math.PI / 2;
      if (parked) yield* resumeMeal(site, parked);
      return;
    }
    // out along the radius, fast, and a quick bite
    const ux = r.ux, uy = r.uy, sk = sp.k;
    const near = P(tgt.x - ux * 11 * sk, tgt.y - uy * 11 * sk);
    yield* walk(site, [P(sp.x, sp.y), near], { speed: 330, acc: 9, each: () => strug(site, ins) });
    const hdB = Math.atan2(tgt.y - near.y, tgt.x - near.x);
    sp.hdT = hdB;
    yield* wait(site, 0.2, () => strug(site, ins));
    yield* walk(site, [P(sp.x, sp.y), P(tgt.x - ux * 7.5 * sk, tgt.y - uy * 7.5 * sk)], { speed: 80, acc: 30, hd: hdB });
    shake(site, tgt.x, tgt.y, 1.4 * k, ux, uy, 22 * k, 26, 5);
    ins.buzz = 0.5; ins.str = 0.8;
    yield* wait(site, 0.3, () => strug(site, ins));
    yield* walk(site, [P(sp.x, sp.y), near], { speed: 50, acc: 30, hd: hdB });
    // it turns round over the prey and brings the tip of its abdomen down onto it: the spinnerets right at the prey
    const side = RND() < 0.5 ? 1 : -1, hdW = Math.atan2(-uy, -ux) + side * 0.4, tip = (SPIN * (1 - 0.3 * 0.45) + 2.4) * sk;
    const S = P(tgt.x + Math.cos(hdW + side * 0.2) * tip, tgt.y + Math.sin(hdW + side * 0.2) * tip);
    ins.state = 'wrapping';
    sp.wrapSide = side; sp.bendT = side * 0.2; sp.combPh = -Math.PI / 2;
    yield* walk(site, [P(sp.x, sp.y), P(lerp(sp.x, S.x, 0.5) + Math.cos(hdW + side * 1.6) * 3 * sk, lerp(sp.y, S.y, 0.5) + Math.sin(hdW + side * 1.6) * 3 * sk), S], { speed: 32, acc: 6, mode: 'mesh', hd: hdW, each: (q) => { sp.abd = 0.45 * q; strug(site, ins); } });
    sp.wrapP = tgt;
    // rolling it and wrapping it: a band of silk at every stroke of a hind leg, the struggle dying away
    const dur = 6 + RND() * 1.8, nL = 18;
    let strokes = 0;
    yield* wait(site, dur, (q) => {
      ins.roll += DT * 3.4 * (1 - 0.35 * q);
      ins.ang += DT * 0.15 * side;
      const n = Math.floor((sp.combPh + Math.PI / 2) / Math.PI);
      if (n > strokes) { strokes = n; addLayer(ins); ins.wrap = Math.min(1, ins.layers.length / nL); }
      ins.str = Math.max(0, 0.8 * (1 - ins.wrap * 1.45));
      strug(site, ins);
      sp.hdT = hdW + Math.sin(q * 31) * 0.05;
      if (RND() < 0.1) shake(site, tgt.x, tgt.y, (0.45 + 0.9 * ins.str) * k, RND() - 0.5, RND() - 0.5, 18 * k, 24, 5); // the threads round it tug as it turns
    });
    sp.wrapP = null; sp.bendT = 0; ins.state = 'wrapped'; ins.str = 0; ins.buzz = 0;
    // it lifts its abdomen, turns about to face the bundle and cuts it free of the web
    yield* wait(site, 0.4, (q) => { sp.abd = 0.45 * (1 - q); });
    sp.hdT = Math.atan2(tgt.y - sp.y, tgt.x - sp.x);
    yield* wait(site, 0.5);
    yield* walk(site, [P(sp.x, sp.y), P(lerp(sp.x, tgt.x, 0.25), lerp(sp.y, tgt.y, 0.25))], { speed: 30, acc: 20, hd: sp.hdT, mode: 'mesh' });
    yield* wait(site, 0.7, () => { if (RND() < 0.12) shake(site, tgt.x, tgt.y, 0.5 * k, RND() - 0.5, RND() - 0.5, 14 * k, 20, 6); });
    if (!parked && (st.forceCatch === 'carry' || (st.forceCatch !== 'leave' && RND() < 0.55))) {
      // carried to the hub on a short thread from the spinnerets
      ins.state = 'carried'; ins.bx = ins.pbx = tgt.x; ins.by = ins.pby = tgt.y; ins.rope = 6 * k;
      yield* walk(site, [P(sp.x, sp.y), H], { speed: 115, acc: 4 });
      // at the hub it turns head down and passes the bundle forward, to hang just under its jaws, and feeds
      sp.hdT = Math.PI / 2;
      hangAt(site, ins, jawPt(site), 4.3 * k, spinneret(sp));
      yield* wait(site, 1.4);
      startMeal(site, ins);
      return;
    }
    // stored where it hangs, for later (always so if a meal was waiting at the hub)
    ins.state = 'left';
    yield* walk(site, [P(sp.x, sp.y), H], { speed: 150 });
    sp.hdT = Math.PI / 2;
    if (parked) { yield* resumeMeal(site, parked); return; }
    yield* wait(site, 0.8);
  }
  /** A stuck insect fights in bursts (weaker as it is wrapped): its wings buzz and the threads round it jerk. */
  function strug(site, ins) {
    if (ins.state !== 'stuck' && ins.state !== 'wrapping') return;
    ins.buzz = Math.max(0, ins.buzz - DT);
    if (RND() < 0.04 * Math.min(1, ins.str + 0.1)) { ins.buzz = (0.25 + RND() * 0.4) * Math.min(1, ins.str * 1.5); shake(site, ins.tgt.x, ins.tgt.y, 1.6 * site.k * ins.str, RND() - 0.5, RND() - 0.5, 26 * site.k, 22, 3.5); }
  }
  /** Drops shaken loose near a point fall away. */
  function shedDrops(site, p, rad, share) {
    if (!site.drops) return;
    for (const sg of site.drops) {
      if (sg.dead || !sg.drops) continue;
      for (const d of sg.drops) {
        if (d.fall) continue;
        const x = lerp(sg.a.X, sg.b.X, d.u), y = lerp(sg.a.Y, sg.b.Y, d.u);
        if (Math.hypot(x - p.x, y - p.y) < rad && RND() < share) { d.fall = 1; if (site.falls.length < 160) site.falls.push({ x, y, vx: (RND() - 0.5) * 0.4, vy: 0.2 + RND() * 0.6, r: d.r * dewGrow(site, d), a: 1 }); }
      }
    }
  }
  /** A small tear where an insect fought free: the nearest capture threads part and hang. */
  function breakNear(site, p, rad) {
    for (const sg of site.segs) {
      if (sg.dead || sg.k !== CAP) continue;
      const mx = (sg.a.x + sg.b.x) / 2, my = (sg.a.y + sg.b.y) / 2;
      if (Math.hypot(mx - p.x, my - p.y) < rad) { sg.dead = site.T; addDangle(site, sg.a, sg.b); addDangle(site, sg.b, sg.a); }
    }
  }
  function addDangle(site, n, toward) {
    const len = dist(n, toward) * (0.3 + RND() * 0.2);
    site.dangles = site.dangles || [];
    site.dangles.push({ n, len, a: Math.atan2(toward.y - n.y, toward.x - n.x), va: 0, ph: RND() * TAU });
  }

  /* the end of the web: torn, the strands falling; the spider drops away */
  function* tear(st, site) {
    const H = site.plan.H, k = site.k, sp = site.sp, c = site.c, kind = st.forceTear || ['gust', 'beetle', 'leaf'][(RND() * 3) | 0];
    site.tearKind = kind;
    if (kind === 'gust') {
      // the breeze rises; the web bellies and strains, a frame thread gives, the rest falls slack
      yield* wait(site, 3.4, (q) => { st.gust = 1.6 * sm(0, 1, q); if (RND() < 0.25) shedDrops(site, P(H.x + (RND() - 0.5) * site.Rm * 2, H.y + (RND() - 0.5) * site.Rm * 2), 40 * k, 0.3 * q); });
      const e = [1, 2, 3, 4][(RND() * 4) | 0], E = site.edges[e];
      startSim(site);
      for (const sg of E.segs.slice()) breakSeg(site, sg, 0.5);
      // radii fastened to it pull free, and the sticky spiral on that side tears in many places
      const mid = P((E.a.x + E.b.x) / 2, (E.a.y + E.b.y) / 2), reach = site.Rm * 1.1;
      for (const r of site.radii) if (r.edge === e && RND() < 0.75) { const sg = r.segs[r.segs.length - 1 - ((RND() * 3) | 0)]; if (sg) breakSeg(site, sg, -1); }
      for (const sg of site.segs.slice()) if (!sg.dead && !sg.strand && (sg.k === CAP || sg.k === RADIUS) && RND() < 0.34 * sm(reach, reach * 0.3, dist(P((sg.a.x + sg.b.x) / 2, (sg.a.y + sg.b.y) / 2), mid))) breakSeg(site, sg, -1);
      unpin(site, mid, 9999, H);
      shedDrops(site, mid, 9999, 0.6);
      hitSound(st, site, mid.x, 0.5);
      yield* dropAway(st, site);
      yield* wait(site, 4, (q) => { st.gust = 1.6 * (1 - sm(0, 1, q)) + 0.2; });
      st.gust = 0;
    } else if (kind === 'beetle') {
      // a heavy beetle blunders straight through, too strong to hold
      const a0 = (RND() - 0.5) * 0.7 + (RND() < 0.5 ? 0 : Math.PI), from = P(H.x - Math.cos(a0) * c.W, H.y - Math.sin(a0) * c.W * 0.5 + (RND() - 0.5) * 40 * k);
      const thru = P(H.x + (RND() - 0.5) * site.Rm * 0.6, H.y + (RND() - 0.2) * site.Rm * 0.6);
      const dir = P(thru.x - from.x, thru.y - from.y), dl = Math.hypot(dir.x, dir.y);
      const b = { x: from.x, y: from.y, ang: Math.atan2(dir.y, dir.x), sz: 1.25 * k, vx: (dir.x / dl) * 230 * k * DT, vy: (dir.y / dl) * 230 * k * DT, ph: RND() * TAU };
      site.beetle = b;
      let hit = false, drop = null;
      const prev = P(b.x, b.y);
      for (let f = 0; f < 240; f++) {
        b.x += b.vx; b.y += b.vy + Math.sin(f * 0.25) * 0.4;
        if (!hit && Math.hypot(b.x - thru.x, b.y - thru.y) < 8 * k) {
          hit = true;
          startSim(site);
          const nx = b.vx / Math.hypot(b.vx, b.vy), ny = b.vy / Math.hypot(b.vx, b.vy);
          const back = P(thru.x - nx * 400, thru.y - ny * 400), fwd = P(thru.x + nx * 400, thru.y + ny * 400);
          for (const sg of site.segs.slice()) if (!sg.dead && !sg.strand && segNear(sg, back, fwd, 11 * k) && sg.k !== ANCHOR && RND() < 0.9) breakSeg(site, sg, -1, nx, ny);
          unpin(site, thru, 70 * k, H, P(back.x, back.y), P(fwd.x, fwd.y));
          shedDrops(site, thru, 60 * k, 0.8);
          hitSound(st, site, thru.x, 1.4);
          b.vx *= 0.8; b.vy *= 0.8;
          // the strands it hits are dragged along a little
          for (const n of site.sim.free) if (Math.hypot(n.X - thru.x, n.Y - thru.y) < 26 * k) { n.PX -= nx * 3; n.PY -= ny * 3; }
          drop = dropAway(st, site);
        }
        prev.x = b.x; prev.y = b.y;
        if (drop && drop.next().done) drop = false;
        yield;
        if (b.x < -60 || b.x > c.W + 60 || b.y < -60 || b.y > c.H + 60) if (hit) break;
      }
      site.beetle = null;
      if (!hit) startSim(site);
      if (drop === null) yield* dropAway(st, site); else if (drop) yield* drop;
      yield* wait(site, 3);
    } else {
      // a dead leaf comes down through the web, tumbling, and slits it top to bottom
      const x0 = H.x + (RND() - 0.5) * site.Rm * 0.9;
      const lf = { x: x0, y: -30, ang: RND() * TAU, sz: (1.3 + RND() * 0.6) * k, flip: 0, vr: (RND() - 0.5) * 0.12 };
      site.leaf = lf;
      let entered = false, stuck = 0, drop = null;
      for (let f = 0; f < 600; f++) {
        lf.y += (stuck > 0 ? 0.2 : 1.6 + Math.sin(f * 0.07) * 0.5) * k * (stuck > 0 ? 1 : 1);
        lf.x += Math.sin(f * 0.05 + 1) * 1.1 * k + (st.wind - 0.5) * 0.5;
        lf.ang += lf.vr; lf.flip += 0.06;
        if (stuck > 0) stuck--;
        const inside = site.pg && pointIn(site.pg, lf);
        if (inside && !entered) {
          entered = true;
          startSim(site);
          stuck = 40; // it lies in the web a moment, then the threads give
          shake(site, lf.x, lf.y, 3 * k, 0, 1, 40 * k);
          hitSound(st, site, lf.x, 0.6);
        }
        if (entered && stuck === 1) {
          const top = P(lf.x, lf.y - 10 * k), bot = P(lf.x + (RND() - 0.5) * 30 * k, c.H + 40);
          for (const sg of site.segs.slice()) if (!sg.dead && !sg.strand && sg.k !== ANCHOR && segNear(sg, top, bot, 10 * k) && RND() < 0.92) breakSeg(site, sg, -1, 0, 1);
          unpin(site, lf, 60 * k, H, top, bot);
          shedDrops(site, P(lf.x, lf.y + 60 * k), 80 * k, 0.7);
        }
        if (entered && stuck === 0 && drop === null) drop = dropAway(st, site);
        if (drop && drop.next().done) drop = false;
        if (entered && site.sim && stuck === 0) { // it pulls the cut strands down as it goes
          for (const n of site.sim.free) if (Math.hypot(n.X - lf.x, n.Y - lf.y) < 14 * k) { n.Y = Math.max(n.Y, lf.y - 6 * k); }
        }
        yield;
        if (lf.y > c.H + 40) break;
      }
      site.leaf = null;
      if (!site.sim) startSim(site);
      if (drop === null) yield* dropAway(st, site); else if (drop) yield* drop;
      yield* wait(site, 3);
    }
  }
  const pointIn = (pg, p) => { let inside = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const a = pg[i], b = pg[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; };
  function segNear(sg, a, b, rad) {
    const p = P((sg.a.X + sg.b.X) / 2, (sg.a.Y + sg.b.Y) / 2);
    if (segX(P(sg.a.X, sg.a.Y), P(sg.b.X, sg.b.Y), a, b)) return true;
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) < rad;
  }
  /** The spider lets go and drops on a line below the wreck, and hangs there. */
  function* dropAway(st, site) {
    const sp = site.sp, k = site.k;
    const top = P(sp.x, sp.y);
    site.drag = { x: top.x, y: top.y, node: site.hubN };
    sp.hdT = Math.PI / 2;
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(P(top.x + Math.sin(i * 0.4) * 2 * k, top.y + (70 + 30 * RND()) * k * (i / 16)));
    yield* walk(site, pts, { speed: 90, mode: 'hang', hd: Math.PI / 2, acc: 3 });
    site.hangAt = P(sp.x, sp.y);
  }

  /* ---------- the torn web as strings under gravity ---------- */

  function startSim(site) {
    if (site.sim) return;
    const free = [];
    for (const n of site.nodes) { n.PX = n.X; n.PY = n.Y; n.fixed = n.f === 0; n.pin = n.fixed ? 0 : 0.18; n.RX = n.X; n.RY = n.Y; if (!n.fixed) free.push(n); }
    for (const sg of site.segs) sg.rest = Math.hypot(sg.b.X - sg.a.X, sg.b.Y - sg.a.Y) * 0.996;
    site.sim = { free, t0: site.T };
    for (const ins of site.insects) if (ins.state === 'hub' || ins.state === 'carried') letFall(ins, 0.2); // a meal in progress falls with the wreck
    site.meal = null; site.parked = null; site.sp.chew = 0; site.sp.handle = 0;
  }
  /** A thread parts at u (or at its middle): each half hangs from its end as a short strand. */
  function breakSeg(site, sg, u, nx = 0, ny = 0) {
    if (sg.dead) return;
    if (u < 0) u = 0.3 + RND() * 0.4;
    sg.dead = site.T;
    if (sg.drops) for (const d of sg.drops) { // its dew falls
      if (d.fall) continue;
      d.fall = 1;
      const g = dewGrow(site, d);
      if (g > 0.1 && site.falls.length < 220) site.falls.push({ x: lerp(sg.a.X, sg.b.X, d.u), y: lerp(sg.a.Y, sg.b.Y, d.u), vx: (RND() - 0.5) * 0.5 + nx, vy: RND() * 0.5 + ny, r: d.r * g });
    }
    const x = lerp(sg.a.X, sg.b.X, u), y = lerp(sg.a.Y, sg.b.Y, u), L = sg.rest || dist(sg.a, sg.b);
    for (const [end, len] of [[sg.a, L * u], [sg.b, L * (1 - u)]]) {
      if (len < 1.5) continue;
      let prev = end;
      const parts = len > 30 ? 3 : len > 10 ? 2 : 1;
      for (let i = 1; i <= parts; i++) {
        const q = i / parts, m = addNode(site, lerp(end.X, x, q), lerp(end.Y, y, q), 0.5);
        m.X = m.x; m.Y = m.y; m.PX = m.X - nx * 2.5 * q; m.PY = m.Y - ny * 2.5 * q; m.fixed = false; m.pin = 0;
        site.sim.free.push(m);
        const ns = addSeg(site, prev, m, sg.k); ns.rest = len / parts; ns.strand = 1;
        prev = m;
      }
    }
  }
  /** Near a tear the web loses its tension: those nodes are held only by their threads. */
  function unpin(site, c, rad, H, a, b) {
    for (const n of site.sim.free) {
      let d;
      if (a) { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = clamp(((n.X - a.x) * dx + (n.Y - a.y) * dy) / L2, 0, 1); d = Math.hypot(n.X - a.x - dx * t, n.Y - a.y - dy * t); }
      else d = Math.hypot(n.X - c.x, n.Y - c.y);
      n.pin = Math.min(n.pin, 0.18 * sm(rad * 0.6, rad * 1.8, d));
    }
  }
  function simStep(st, site) {
    const S = site.sim, k = site.k, g = 60 * k * DT * DT, T = site.T, w = st.wind;
    for (const n of S.free) {
      const vx = (n.X - n.PX) * 0.975, vy = (n.Y - n.PY) * 0.975;
      n.PX = n.X; n.PY = n.Y;
      const wx = (w - 0.3) * (0.022 + 0.03 * st.gust) * k + (0.012 + 0.04 * st.gust) * k * Math.sin(T * 1.7 + n.ph + n.Y * 0.02), wy = (0.01 + 0.03 * st.gust) * k * Math.sin(T * 1.3 + n.ph);
      n.X += vx + wx * (1 - n.pin * 4); n.Y += vy + wy + g * (1 - n.pin * 5.5);
      if (n.pin > 0) { n.X += (n.RX - n.X) * n.pin; n.Y += (n.RY - n.Y) * n.pin; }
    }
    for (let it = 0; it < 6; it++) {
      for (const sg of site.segs) {
        if (sg.dead || !sg.rest) continue;
        const a = sg.a, b = sg.b, dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy) || 1e-6;
        if (d <= sg.rest) continue; // silk goes slack, it doesn't push
        const m = (d - sg.rest) / d, wa = a.fixed ? 0 : 1, wb = b.fixed ? 0 : 1, sw = wa + wb;
        if (!sw) continue;
        a.X += dx * m * wa / sw; a.Y += dy * m * wa / sw; b.X -= dx * m * wb / sw; b.Y -= dy * m * wb / sw;
      }
    }
  }

  /* ---------- the dangling loose end of the bridge line ---------- */

  function tailStep(st, site) {
    const tl = site.tail;
    if (!tl) return;
    const k = site.k, T = site.T;
    for (let i = 1; i < tl.pts.length; i++) {
      const p = tl.pts[i], vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
      p.px = p.x; p.py = p.y;
      p.x += vx + (st.wind * 0.05 + 0.04 * Math.sin(T * 2 + i)) * k * site.c.s; p.y += vy + 0.03 * k;
    }
    for (let it = 0; it < 4; it++) for (let i = 1; i < tl.pts.length; i++) {
      const a = tl.pts[i - 1], b = tl.pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6, m = (d - tl.seg) / d;
      if (i === 1) { b.x -= dx * m; b.y -= dy * m; } else { a.x += dx * m * 0.5; a.y += dy * m * 0.5; b.x -= dx * m * 0.5; b.y -= dy * m * 0.5; }
    }
  }

  /* ---------- sound: a faint buzz and tick when something hits the web ---------- */

  const audible = () => typeof AMB !== 'undefined' && AMB.ctx && AMB.master && typeof ambVolume === 'function' && ambVolume() > 0 && AMB.ctx.state === 'running';
  const CLIP = { ac: null, buf: null, state: '' };
  function clipFor(ac) {
    if (CLIP.ac !== ac) {
      Object.assign(CLIP, { ac, buf: null, state: '' });
      fetch('ambient/spiderweb-buzz.ogg').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((b) => ac.decodeAudioData(b))
        .then((buf) => { if (CLIP.ac === ac) Object.assign(CLIP, { buf, state: 'ok' }); })
        .catch(() => { if (CLIP.ac === ac) CLIP.state = 'failed'; });
    }
    return CLIP;
  }
  function hitSound(st, site, x, big) {
    if (!st.real || !audible()) return;
    const ac = AMB.ctx, t0 = ac.currentTime + 0.004, C = clipFor(ac);
    const pan = clamp(((x * site.Tm.s + site.Tm.x + site.ox - st.camX) / st.W - 0.5) * 1.4, -0.8, 0.8);
    const out = ac.createGain(), p = ac.createStereoPanner();
    p.pan.value = pan; out.connect(p); p.connect(AMB.master);
    if (C.state === 'ok') {
      const src = ac.createBufferSource();
      src.buffer = C.buf; src.playbackRate.value = (0.92 + Math.random() * 0.16) * (big > 1 ? 0.8 : 1);
      out.gain.value = 0.32 * Math.min(1.3, big) * (0.85 + Math.random() * 0.3);
      src.connect(out); src.start(t0);
      src.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
      return;
    }
    // a wingbeat buzz (a sawtooth hum, beating) that cuts off, and the tick of the threads taking it
    const len = 0.32 + 0.2 * Math.min(1, big), f0 = (big > 1 ? 120 : 190) * (0.9 + Math.random() * 0.2);
    const o = ac.createOscillator(), bp = ac.createBiquadFilter(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.06, t0); o.frequency.linearRampToValueAtTime(f0, t0 + len);
    bp.type = 'bandpass'; bp.frequency.value = f0 * 3.2; bp.Q.value = 1.1;
    lfo.frequency.value = 26 + Math.random() * 10; lg.gain.value = 0.45; am.gain.value = 0.55;
    lfo.connect(lg); lg.connect(am.gain);
    const peak = 0.028 * Math.min(1.4, big);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.03); g.gain.setValueAtTime(peak, t0 + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(bp); bp.connect(am); am.connect(g); g.connect(out);
    const tk = ac.createOscillator(), tg = ac.createGain();
    tk.type = 'triangle'; tk.frequency.setValueAtTime(1500 * (0.9 + Math.random() * 0.2), t0); tk.frequency.exponentialRampToValueAtTime(900, t0 + 0.05);
    tg.gain.setValueAtTime(0.0001, t0); tg.gain.exponentialRampToValueAtTime(0.014, t0 + 0.003); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    tk.connect(tg); tg.connect(out);
    for (const n of [o, lfo]) { n.start(t0); n.stop(t0 + len + 0.02); }
    tk.start(t0); tk.stop(t0 + 0.08);
    out.gain.value = 1;
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, (len + 0.3) * 1000);
  }

  /* ---------- the whole story, site after site ---------- */

  function* life(st, site) {
    // (the phase names and st.forceTear / st.forceCatch / st.tick are there for tests that run the story forward)
    site.phase = 'bridge'; yield* bridge(st, site);
    site.phase = 'y'; yield* yForm(st, site);
    site.phase = 'frame'; yield* frame(st, site);
    site.phase = 'radii'; yield* radii(st, site);
    site.phase = 'spirals'; yield* spirals(st, site);
    site.phase = 'settle'; yield* settle(st, site);
    site.phase = 'idle'; yield* idle(st, site, false);
    site.phase = 'tear'; yield* tear(st, site);
    site.phase = 'gone';
  }
  function* master(st) {
    for (let n = 0; ; n++) {
      const site = newSite(st, st.W, st.H, st.seed + n * 7919, false);
      if (st.site) {
        // the view moves on through the undergrowth to the next twig
        st.prev = st.site; st.site = site;
        site.ox = st.prev.ox + st.W * 1.08;
        const c0 = st.camX, D = site.ox - c0, nF = Math.round(9 / DT);
        for (let f = 1; f <= nF; f++) { const q = f / nF; st.camX = c0 + D * (q * q * q * (q * (q * 6 - 15) + 10)); yield; }
        st.prev = null;
      } else st.site = site;
      yield* life(st, site);
    }
  }
  /** The picker: a finished web straight away, dew on it, the spider at the hub. */
  function* pvLife(st) {
    const site = newSite(st, st.W, Math.round(st.H * 2.6), st.seed, true); // a taller place, seen through the strip
    st.site = site;
    instantWeb(site);
    yield* idle(st, site, true);
  }
  function instantWeb(site) {
    const c = site.c;
    const q = polyNear(c.far.pl, c.Bp);
    plan(site, P(q.x, q.y), q.s);
    for (let i = 0; i < 5; i++) buildEdge(site, i);
    for (const r of site.radii) buildRadius(site, r);
    const pl = spiralPlans(site);
    site.spi = pl;
    const lay = (seq, kind) => { let prev = null; for (const q of seq) { const n = onRadius(site, q.r, q.d); if (prev && prev !== n) addSeg(site, prev, n, kind); prev = n; } };
    lay(pl.hub, HUB);
    for (const stroke of pl.cap) lay(stroke, CAP);
    const H = site.plan.H, sp = site.sp;
    sp.x = H.x; sp.y = H.y; sp.hd = sp.hdT = Math.PI / 2; sp.mode = 'mesh'; sp.path = null;
    for (const Lg of sp.legs) { const t = footTarget(sp, Lg, P(0, 0)); Lg.x = t.x; Lg.y = t.y; }
    site.dewT = -100;
    makeDrops(site);
  }

  /** One frame of everything that moves by itself. */
  function tick(st) {
    st.T += DT;
    st.wind = windAt(st);
    st.gen.next();
    for (const site of [st.prev, st.site]) {
      if (!site) continue;
      site.T += DT;
      if (site.sim) simStep(st, site);
      displace(st, site);
      tailStep(st, site);
      if (site.sp.mode === 'hang' && site.hangAt && site.drag) { // swinging gently on its line below the wreck
        const sp = site.sp, ax = site.drag.node ? site.drag.node.X : site.drag.x, l = site.hangAt.y - site.drag.y;
        place(sp, ax + Math.sin(site.T * 1.1) * 0.06 * l + (st.wind - 0.5) * 0.08 * l, site.hangAt.y);
      }
      spiderStep(site.sp);
      for (let i = site.insects.length - 1; i >= 0; i--) {
        const ins = site.insects[i];
        if (ins.state === 'carried' || ins.state === 'hub') { // a bundle hanging on a short thread: it swings
          if (ins.state === 'hub' && ins.ancTo) { const q = sm(0, 1.2, site.T - ins.ancT); ins.anc = P(lerp(ins.anc0.x, ins.ancTo.x, q), lerp(ins.anc0.y, ins.ancTo.y, q)); }
          const a = ins.state === 'carried' ? spinneret(site.sp) : ins.anc;
          const vx = (ins.bx - ins.pbx) * 0.9, vy = (ins.by - ins.pby) * 0.9;
          ins.pbx = ins.bx; ins.pby = ins.by;
          ins.bx += vx + (st.wind - 0.5) * 0.02 * site.k; ins.by += vy + 0.3 * site.k;
          const dx = ins.bx - a.x, dy = ins.by - a.y, d = Math.hypot(dx, dy) || 1e-6;
          if (d > ins.rope) { ins.bx = a.x + (dx / d) * ins.rope; ins.by = a.y + (dy / d) * ins.rope; }
          ins.ang += angDiff(Math.atan2(dy, dx), ins.ang) * 0.12; // it hangs lengthwise along its thread
          if (site.meal === ins && site.sp.chew) { const j = Math.max(0, Math.sin(site.sp.chewPh)); ins.by -= j * 0.17 * site.k; ins.bx += Math.sin(site.sp.chewPh * 0.5) * 0.04 * site.k; } // worked at by the jaws
        }
        if (ins.state === 'drop') { // let go: falling and tumbling, a husk slowly (it is light), drifting on the breeze
          const term = (ins.eat >= 1 ? 1.5 : 4.5) * site.k;
          ins.vy = Math.min(term, ins.vy + 0.16 * site.k); ins.vx = ins.vx * 0.97 + (st.wind - 0.45) * 0.03 * site.k + Math.sin(site.T * 2.1 + ins.ph) * (ins.eat >= 1 ? 0.05 : 0.015) * site.k;
          ins.bx += ins.vx; ins.by += ins.vy; ins.ang += ins.spin; ins.roll = (ins.roll || 0) + 0.08;
          if (ins.by > site.c.H + 40) { site.insects.splice(i, 1); continue; }
        }
        if (ins.state === 'free') { ins.vy -= 0.05; ins.vx += Math.sin(site.T * 6) * 0.3; ins.x += ins.vx; ins.y += ins.vy; ins.ang = Math.atan2(ins.vy, ins.vx); if (ins.y < -40) site.insects.splice(i, 1); }
      }
      for (let i = site.falls.length - 1; i >= 0; i--) { const f = site.falls[i]; f.vy += 0.35; f.x += f.vx; f.y += f.vy; if (f.y > site.c.H + 20) site.falls.splice(i, 1); }
    }
    if (st.real) { // midges dancing in the light
      for (const m of st.midges) { m.t += DT; m.x = m.cx + Math.sin(m.t * m.fx + m.ph) * m.ax + Math.sin(m.t * 7.1 + m.ph) * 3; m.y = m.cy + Math.sin(m.t * m.fy) * m.ay + Math.cos(m.t * 9.3 + m.ph) * 2; m.cx += (st.wind - 0.55) * 0.15; if (m.cx > st.W + 40) m.cx -= st.W + 80; if (m.cx < -40) m.cx += st.W + 80; }
    }
  }

  /* ---------- drawing ---------- */

  const dewGrow = (site, d) => { if (site.dewT < 0) return 0; const q = (site.T - site.dewT) / 24 - d.dl * 0.6; return q <= 0 ? 0 : Math.min(1, q / 0.4) ** 0.6; };

  /** All the threads, by brightness: a thread lit across its length by the low sun glows, one along the light is dim. */
  function drawThreads(ctx, st, site, L) {
    const T = site.T, sg0 = Math.sin(T * 0.37) * 0.09 + (st.wind - 0.5) * 0.12, lx = Math.cos(Math.atan2(LY, LX) + sg0), ly = Math.sin(Math.atan2(LY, LX) + sg0);
    const B = st.buckets; // 4 classes (frame and radii, the hub, the sticky spiral, the temporary one) × 4 levels of light
    for (const b of B) b.length = 0;
    const dew = site.dewT >= 0 ? Math.min(1, (site.T - site.dewT) / 20) : 0, sim = !!site.sim;
    for (const sg of site.segs) {
      if (sg.dead) continue;
      if (sg.cut && T - sg.cut > 0.35) continue;
      const ax = sg.a.X, ay = sg.a.Y, bx = sg.b.X, by = sg.b.Y, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6;
      if (sg.cut) { st.cutList.push(sg); continue; }
      const al = Math.abs((dx * lx + dy * ly) / l), lit = (1 - al) ** 3;
      const cls = sg.k <= ANCHOR ? 0 : sg.k === CAP ? 2 : sg.k === TEMP ? 3 : 1;
      const lv = lit > 0.72 ? 3 : lit > 0.4 ? 2 : lit > 0.15 ? 1 : 0;
      B[cls * 4 + lv].push(sg);
    }
    const col = L ? [[66, 74, 88], [66, 74, 88], [92, 86, 70], [150, 112, 46]] : [[226, 226, 220], [236, 232, 222], [250, 240, 220], [255, 232, 190]];
    const alp = L ? [0.36, 0.44, 0.54, 0.66] : [0.2, 0.3, 0.44, 0.66];
    const wid = [0.85, 0.6, 0.72, 0.5], ka = [1, 0.85, 1, 0.55];
    for (let cls = 0; cls < 4; cls++) for (let lv = 0; lv < 4; lv++) {
      const list = B[cls * 4 + lv];
      if (!list.length) continue;
      ctx.beginPath();
      for (const sg of list) {
        const ax = sg.a.X, ay = sg.a.Y, bx = sg.b.X, by = sg.b.Y;
        if (st.dipSeg === sg && st.dipPt) { ctx.moveTo(ax, ay); ctx.lineTo(st.dipPt.x, st.dipPt.y); ctx.lineTo(bx, by); continue; }
        ctx.moveTo(ax, ay);
        if (sim && sg.rest) {
          const d = Math.hypot(bx - ax, by - ay), slack = sg.rest - d;
          if (slack > 0.5) { const sag = Math.min(d * 0.6, Math.sqrt(3 * d * slack / 8) * 2); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by); continue; }
        }
        if (dew > 0 && sg.k === CAP) { const sag = Math.hypot(bx - ax, by - ay) * 0.035 * dew; ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag * 2, bx, by); continue; }
        ctx.lineTo(bx, by);
      }
      ctx.strokeStyle = rgba(col[lv], alp[lv] * ka[cls] * (site.c.pv ? 0.72 : 1));
      ctx.lineWidth = wid[cls] * (site.c.pv ? 0.75 : 1);
      ctx.stroke();
    }
    // the bridge is doubled: a second line laid over the first as the spider crossed
    const e0 = site.edges && site.edges[0];
    if (e0 && e0.built && !site.c.pv) {
      const reach = site.dip && site.dip.double < 1 ? site.dip.double : 1;
      ctx.strokeStyle = rgba(col[1], alp[1] * 0.7); ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const sg of e0.segs) {
        if (sg.dead) continue;
        const a = sg.a, b = sg.b;
        if (reach < 1) { const A = site.plan.A, Bq = site.plan.B; ctx.moveTo(A.x, A.y + 0.7); ctx.lineTo(lerp(A.x, Bq.x, reach), lerp(A.y, Bq.y, reach) + (st.dipPt ? st.dipPt.y - lerp(A.y, Bq.y, reach) : 0) + 0.7); break; }
        ctx.moveTo(a.X, a.Y + 0.7); ctx.lineTo(b.X, b.Y + 0.7);
      }
      ctx.stroke();
    }
    for (const sg of st.cutList) {
      const q = 1 - (T - sg.cut) / 0.35;
      ctx.strokeStyle = rgba(col[1], alp[1] * q); ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(sg.a.X, sg.a.Y); ctx.lineTo(sg.b.X, sg.b.Y); ctx.stroke();
    }
    st.cutList.length = 0;
  }

  /** The dangling pieces: the loose end at the bridge's snag, the ends of threads an insect broke. */
  function drawLoose(ctx, st, site, L) {
    const col = L ? 'rgba(66,74,88,0.45)' : 'rgba(240,234,220,0.4)';
    ctx.strokeStyle = col; ctx.lineWidth = 0.6;
    ctx.beginPath();
    if (site.tail) { const t = site.tail.pts; ctx.moveTo(t[0].x, t[0].y); for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y); }
    if (site.dangles) for (const d of site.dangles) {
      const sw = Math.sin(site.T * 1.6 + d.ph) * 0.25 + (st.wind - 0.5) * 0.4, a = lerp(d.a, Math.PI / 2, 0.55) + sw;
      const ex = d.n.X + Math.cos(a) * d.len, ey = d.n.Y + Math.sin(a) * d.len;
      ctx.moveTo(d.n.X, d.n.Y); ctx.quadraticCurveTo(d.n.X + Math.cos(d.a) * d.len * 0.4, d.n.Y + Math.sin(d.a) * d.len * 0.4 + d.len * 0.2, ex, ey);
    }
    ctx.stroke();
  }

  /** What is being spun right now: the line on the breeze, the trailed thread, the loose thread, the dragline, the spiral's newest piece. */
  function drawLive(ctx, st, site, L) {
    const sp = site.sp, k = site.k, spn = spinneret(sp), dsp = st.spOff;
    const col = L ? [66, 74, 88] : [244, 238, 224];
    ctx.lineCap = 'round';
    if (site.chain) {
      const p = site.chain.pts, n = p.length;
      ctx.strokeStyle = rgba(col, L ? 0.55 : 0.5); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
      ctx.lineTo(p[n - 1].x, p[n - 1].y); ctx.stroke();
      // the free end catches the light now and then
      const e = p[n - 1], tw = Math.max(0, Math.sin(site.T * 2.3)) ** 6;
      if (tw > 0.05 && !site.chain.snag) { ctx.globalAlpha = tw * (L ? 0.7 : 0.8); ctx.drawImage(st.spr.mote, e.x - 4, e.y - 4, 8, 8); ctx.globalAlpha = 1; }
    }
    const curve = (ax, ay, bx, by, len) => {
      const d = Math.hypot(bx - ax, by - ay), slack = Math.max(0, len - d), sag = Math.min(d * 0.35, Math.sqrt(3 * d * slack / 8));
      const wx = (st.wind - 0.5) * sag * 0.5 * site.c.s;
      ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 + wx, (ay + by) / 2 + sag * 2, bx, by);
    };
    ctx.strokeStyle = rgba(col, L ? 0.5 : 0.46); ctx.lineWidth = 0.65;
    ctx.beginPath();
    if (site.free) {
      const fr = site.free, len = lerp(fr.len, Math.hypot(spn.x + dsp.x - fr.x, spn.y + dsp.y - fr.y), fr.tight);
      curve(fr.x, fr.y, spn.x + dsp.x, spn.y + dsp.y, len);
    }
    if (site.loose) {
      const lo = site.loose;
      if (lo.onIt) { // a V: from A to the spider, from the spider on to B
        const S = P(sp.x + dsp.x, sp.y + dsp.y), A = lo.b, Bq = lo.a, l1 = dist(A, S);
        curve(A.x, A.y, S.x, S.y, l1); curve(S.x, S.y, Bq.x, Bq.y, Math.max(dist(S, Bq), lo.len - l1));
      } else if (lo.b) curve(lo.a.x, lo.a.y, lo.b.x, lo.b.y, lo.len);
      else curve(lo.a.x, lo.a.y, spn.x + dsp.x, spn.y + dsp.y, lo.len);
    }
    if (site.drag) {
      const ax = site.drag.node ? site.drag.node.X : site.drag.x, ay = site.drag.node ? site.drag.node.Y : site.drag.y;
      ctx.moveTo(ax, ay); ctx.lineTo(spn.x + dsp.x, spn.y + dsp.y);
    }
    if (site.live) { ctx.moveTo(site.live.n.X, site.live.n.Y); ctx.lineTo(spn.x + dsp.x, spn.y + dsp.y); }
    ctx.stroke();
  }

  function drawDrops(ctx, st, site, L) {
    if (!site.drops) return;
    const spr = st.spr.drop, T = site.T, dewOn = site.dewT >= 0;
    if (!dewOn) return;
    const dew = Math.min(1, (T - site.dewT) / 20), sim = !!site.sim;
    for (const sg of site.drops) {
      if (sg.dead) continue;
      const ax = sg.a.X, ay = sg.a.Y, bx = sg.b.X, by = sg.b.Y;
      let cx = (ax + bx) / 2, cy = (ay + by) / 2;
      if (sim && sg.rest) { const d = Math.hypot(bx - ax, by - ay), slack = sg.rest - d; if (slack > 0.5) cy += Math.min(d * 0.6, Math.sqrt(3 * d * slack / 8) * 2); }
      else if (sg.k === CAP) cy += Math.hypot(bx - ax, by - ay) * 0.07 * dew;
      for (const d of sg.drops) {
        if (d.fall) continue;
        const gr = dewGrow(site, d);
        if (gr <= 0.02) continue;
        const r = d.r * gr, u = d.u, iu = 1 - u;
        const x = iu * iu * ax + 2 * u * iu * cx + u * u * bx, y = iu * iu * ay + 2 * u * iu * cy + u * u * by;
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(T * 0.8 + d.ph);
        ctx.drawImage(spr, x - r * 2, y - r * 2, r * 4, r * 4);
      }
    }
    ctx.globalAlpha = 1;
    // drops shaken loose, falling
    for (const f of site.falls) { const r = Math.max(0.5, f.r); ctx.drawImage(spr, f.x - r * 2, f.y - r * 2, r * 4, r * 4 * (1 + Math.min(1.5, f.vy * 0.08))); }
  }
  function drawGlints(ctx, st, site, L) {
    if (!site.glints || site.dewT < 0) return;
    const T = site.T, k = site.k, spr = st.spr.glint, sway = Math.sin(T * 0.37) * 1.2 + st.wind * 1.5;
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const g of site.glints) {
      const sg = g.sg, d = g.d;
      if (sg.dead || d.fall) continue;
      const v = Math.sin(T * g.f + g.ph + sway * 2.2), th = site.c.pv ? 0.7 : 0.95;
      if (v < th) continue;
      const gr = dewGrow(site, d);
      if (gr < 0.5) continue;
      const q = (v - th) / (1 - th), ax = sg.a.X, ay = sg.a.Y, bx = sg.b.X, by = sg.b.Y;
      const dew = Math.min(1, (T - site.dewT) / 20);
      const x = lerp(ax, bx, d.u), y = lerp(ay, by, d.u) + (sg.k === CAP && !site.sim ? Math.hypot(bx - ax, by - ay) * 0.07 * dew * 2 * d.u * (1 - d.u) : 0);
      const z = (site.c.pv ? 6 : 7 + d.r * 2.6) * (0.45 + 0.55 * q) * k ** 0.5;
      ctx.globalAlpha = q * (L ? 0.8 : 0.7);
      ctx.drawImage(spr, x - z, y - z, z * 2, z * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawSite(ctx, st, site, L, dpr) {
    const W = st.W, H = st.H;
    const Tm = site.Tm, sx = site.ox - st.camX;
    if (sx > W * 1.2 || sx < -W * 1.2) return;
    // the twigs: ink that hides what is behind it
    if (!site.layer || site.layerKey !== st.key) { site.layer = twigLayer(site, W, H, dpr, L); site.layerKey = st.key; }
    ctx.setTransform(dpr, 0, 0, dpr, dpr * sx, 0);
    K.put(ctx, site.layer, W, H, L ? 0.7 : 0.86);
    ctx.setTransform(dpr * Tm.s, 0, 0, dpr * Tm.s, dpr * (Tm.x + sx), dpr * Tm.y);
    // the spider's place this frame (with the web's sway and the bridge's dip under it)
    const sp = site.sp, d0 = dispAt(st, site, sp.x, sp.y);
    st.spOff = d0; st.dipSeg = null; st.dipPt = null;
    if (site.dip && site.dip.seg) {
      const a = site.dip.a, b = site.dip.b, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, u = clamp(((sp.x - a.x) * dx + (sp.y - a.y) * dy) / l2, 0, 1);
      if (u > 0.01 && u < 0.99) { const dip = 4 * u * (1 - u) * Math.sqrt(l2) * 0.014 * (1 + 0.15 * Math.sin(site.T * 9)); st.dipSeg = site.dip.seg; st.dipPt = P(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + dip); st.spOff = P(0, dip); }
    }
    drawThreads(ctx, st, site, L);
    drawLoose(ctx, st, site, L);
    drawLive(ctx, st, site, L);
    drawDrops(ctx, st, site, L);
    // prey: stuck, being wrapped, bundled; carried or hung on a short thread
    for (const ins of site.insects) {
      if (ins.state === 'fly' || ins.state === 'free') continue;
      let x, y, anc = null;
      const hung = ins.state === 'carried' || ins.state === 'hub';
      if (ins.state === 'drop') { drawBundle(ctx, ins, ins.bx, ins.by, L); continue; }
      if (hung) {
        const o = ins.state === 'carried' ? st.spOff : dispAt(st, site, ins.bx, ins.by), a = ins.state === 'carried' ? spinneret(sp) : ins.anc, oa = ins.state === 'carried' ? st.spOff : dispAt(st, site, a.x, a.y);
        x = ins.bx + o.x; y = ins.by + o.y; anc = P(a.x + oa.x, a.y + oa.y);
      } else { const o = dispAt(st, site, ins.tgt.x, ins.tgt.y); x = ins.tgt.x + o.x; y = ins.tgt.y + o.y; }
      if (site.sim) { // carried away with whatever node is nearest
        const ref = hung ? P(ins.bx, ins.by) : ins.tgt;
        if (!ins.simN) { let best = null, bd = 1e9; for (const n of site.nodes) { const dd = (n.x - ref.x) ** 2 + (n.y - ref.y) ** 2; if (dd < bd) { bd = dd; best = n; } } ins.simN = best; ins.simO = P(x - best.X, y - best.Y); }
        x = ins.simN.X + ins.simO.x; y = ins.simN.Y + ins.simO.y; anc = null;
      }
      if (anc) { ctx.strokeStyle = L ? 'rgba(80,88,100,0.55)' : 'rgba(244,238,224,0.5)'; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(anc.x, anc.y); ctx.lineTo(x, y); ctx.stroke(); }
      const jit = (ins.state === 'stuck' || ins.state === 'wrapping') && ins.buzz > 0 ? 0.7 * site.k * Math.max(0.3, ins.str) : 0;
      if (ins.wrap < 0.9) drawInsect(ctx, ins, x + (RND() - 0.5) * jit, y + (RND() - 0.5) * jit, L, site.T, 1 - ins.wrap * 0.75);
      drawBundle(ctx, ins, x, y, L);
      if (ins.state === 'wrapping' && sp.wrapP) drawSwathes(ctx, st, sp, ins, x, y, L);
    }
    drawSpider(ctx, sp, st.spOff.x, st.spOff.y, L, st.spr);
    drawGlints(ctx, st, site, L);
    // in the air, in front
    for (const ins of site.insects) if (ins.state === 'fly' || ins.state === 'free') drawInsect(ctx, ins, ins.x, ins.y, L, site.T);
    if (site.beetle) drawBeetle(ctx, site.beetle, site.beetle.x, site.beetle.y, L, site.T);
    if (site.leaf) drawLeaf(ctx, site.leaf, site.leaf.x, site.leaf.y, L);
  }

  /** The light: a few sunbeams slanting down through the canopy, breathing slowly; dust and pollen turning in them. */
  function drawLight(ctx, st, L, dpr) {
    const W = st.W, H = st.H, T = st.T, beam = st.spr.beam, ang = Math.atan2(LY, LX), shift = -st.camX * 0.18;
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    // the low sun itself, behind the leaves at the upper left (too far off to move when the view does)
    const sr = Math.max(W, H) * 0.95;
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(T * 0.11);
    ctx.drawImage(st.spr.sun, W * 0.08 - sr, -H * 0.1 - sr, sr * 2, sr * 2);
    for (const b of st.beams) {
      const a = b.a * (0.55 + 0.45 * Math.sin(T * b.f + b.ph)) * (0.8 + 0.2 * Math.sin(T * 0.13 + b.ph * 2));
      if (a < 0.003) continue;
      let ox = (((b.x + shift) % (W * 1.6)) + W * 1.6) % (W * 1.6) - W * 0.3;
      ctx.save(); ctx.translate(ox, -H * 0.12); ctx.rotate(ang); ctx.globalAlpha = a;
      ctx.drawImage(beam, -H * 0.1, -b.w / 2, Math.hypot(W, H) * 1.1, b.w);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // motes: visible where a beam lights them
    const spr = st.spr.mote;
    for (const m of st.motes) {
      m.x += (st.wind * 0.18 + Math.sin(T * 0.3 + m.ph) * 0.1) * m.z; m.y += (Math.sin(T * 0.5 + m.ph) * 0.08 - 0.03) * m.z;
      if (m.x > W + 10) m.x -= W + 20; if (m.y < -10) m.y += H + 20; if (m.y > H + 10) m.y -= H + 20;
      let lit = 0;
      for (const b of st.beams) {
        let ox = (((b.x + shift) % (W * 1.6)) + W * 1.6) % (W * 1.6) - W * 0.3;
        const px = m.x - ox, py = m.y + H * 0.12, across = Math.abs(-px * LY + py * LX);
        lit += Math.exp(-((across / (b.w * 0.3)) ** 2)) * b.a * 12;
      }
      lit = Math.min(1, lit) * (0.5 + 0.5 * Math.sin(T * m.f + m.ph));
      if (lit < 0.04) continue;
      const z = (1.4 + m.z * 2.2);
      ctx.globalAlpha = lit * (L ? 0.5 : 0.7); ctx.drawImage(spr, m.x - z, m.y - z, z * 2, z * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function init(bg, w, h, pv, real) {
    const seed = pv ? 2711 : (Date.now() % 100000) | 0;
    const st = { kind: 'spiderweb', W: w, H: h, pv, real, seed, T: 0, wind: 0.5, gust: 0, camX: 0, site: null, prev: null, gen: null, key: '', spr: null,
      buckets: Array.from({ length: 16 }, () => []), cutList: [], spOff: P(0, 0), dipSeg: null, dipPt: null, haze: null, beams: [], motes: [], midges: [] };
    const R = K.rng(seed + 3);
    for (let i = 0; i < (pv ? 2 : 6); i++) st.beams.push({ x: (i + 0.2 + R() * 0.6) * (w * 1.6) / (pv ? 2 : 6), w: (pv ? 14 : 30 + R() * (i % 2 ? 70 : 170)) * (pv ? 1 : Math.max(0.6, h / 800)), a: (pv ? 0.05 : 0.04 + R() * 0.045), f: 0.06 + R() * 0.1, ph: R() * TAU });
    if (!pv) for (let i = 0; i < 46; i++) st.motes.push({ x: R() * w, y: R() * h, z: 0.3 + R() * 0.7, ph: R() * TAU, f: 0.4 + R() * 1.2 });
    if (!pv) for (let i = 0; i < 7; i++) { const cx = w * (0.65 + R() * 0.3), cy = h * (0.2 + R() * 0.3); st.midges.push({ cx, cy, x: cx, y: cy, t: R() * 9, fx: 1.3 + R() * 2, fy: 1.7 + R() * 2.5, ax: 8 + R() * 14, ay: 6 + R() * 10, ph: R() * TAU }); }
    st.gen = pv ? pvLife(st) : master(st);
    st.tick = () => tick(st); // (lets a test run the story forward without drawing)
    bg.spw = st;
    return st;
  }

  window.BG_EXT.spiderweb = function (bg, ctx, w, h) {
    const L = K.light(), dpr = bg.dpr || 1, pv = h < 90, real = bg.canvas.classList.contains('bg-layer');
    let st = bg.spw;
    if (!st || st.pv !== pv) st = init(bg, w, h, pv, real);
    st.real = real;
    const key = `${w}x${h}@${dpr}${L ? 'L' : 'D'}`;
    if (st.key !== key) {
      if (st.W !== w || st.H !== h) { st.W = w; st.H = h; if (st.prev) { st.camX = st.site.ox; st.prev = null; } }
      st.key = key; st.spr = sprites(L);
      st.haze = pv ? null : hazeLayer(w, h, L, st.seed + 5);
    }
    // each site keeps the size it was laid out for, scaled to cover the view
    for (const site of [st.prev, st.site]) {
      if (!site) continue;
      const s = Math.max(w / site.W0, h / site.H0);
      site.Tm = { s, x: (w - site.W0 * s) / 2, y: (h - site.H0 * s) / 2 };
    }
    if (!st.site) tick(st); // first frame: lay out the place
    tick(st);
    if (st.site) { const s = Math.max(w / st.site.W0, h / st.site.H0); st.site.Tm = { s, x: (w - st.site.W0 * s) / 2, y: (h - st.site.H0 * s) / 2 }; }
    if (pv) {
      // the picker: a window onto the web's middle
      const site = st.site;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPv(ctx, st, site, L, dpr, w, h);
      ctx.restore();
      return;
    }
    // the haze, drifting past slower than the twigs when the view moves on
    if (st.haze) {
      const hz = st.haze, off = ((-st.camX * 0.35) % hz.TW + hz.TW) % hz.TW;
      ctx.drawImage(hz.cv, off - hz.TW, 0, hz.TW, h);
      ctx.drawImage(hz.cv, off, 0, hz.TW, h);
    }
    drawLight(ctx, st, L, dpr);
    for (const site of [st.prev, st.site]) if (site) drawSite(ctx, st, site, L, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // midges in the air
    ctx.fillStyle = L ? 'rgba(60,54,46,0.55)' : 'rgba(255,240,214,0.55)';
    for (const m of st.midges) { ctx.beginPath(); ctx.arc(m.x, m.y, 0.8, 0, TAU); ctx.fill(); }
  };

  /** The picker's preview: the finished web, zoomed so its middle fills the strip. */
  function drawPv(ctx, st, site, L, dpr, w, h) {
    const sc = site.Tm.s;
    const glow = ctx.createRadialGradient(w * 0.2, -h * 0.4, 0, w * 0.2, -h * 0.4, w * 0.9);
    glow.addColorStop(0, L ? 'rgba(255,214,150,0.3)' : 'rgba(255,214,150,0.14)'); glow.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    drawSite(ctx, st, site, L, dpr);
  }

  /** The picker's still: the finished web with its dew (it starts that way); a few frames for the sway to settle. */
  window.BG_PV_STILL.spiderweb = () => 2;
})();
