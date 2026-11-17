'use strict';
/*
 * 수족관: a tank seen through the screen. Goldfish, angelfish, damsels, barbs and a betta cruise at different
 * depths, a shoal of small tetras wheels about and turns together, water plants sway in the corners and air
 * rises in strings of bubbles. Bodies are painted once as sprites; tails and pectoral fins move every frame.
 * A nearer fish or plant hides what is behind it; the theme's own background is the water.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('aquarium');
  const TAU = Math.PI * 2, WHITE = [255, 255, 255], INK = [22, 28, 44];
  const mix = (c, d, k) => [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);

  // hh: half the body's height (in body lengths); ped: half the tail stalk; size: body length as a share of the
  // screen; tk: how big the tail is
  const SPECIES = {
    gold: { hh: 0.29, belly: 1.14, ped: 0.07, size: 0.105, speed: 0.5, tail: 'veil', tk: 1 },
    angel: { hh: 0.33, belly: 1, ped: 0.06, size: 0.082, speed: 0.38, tail: 'fan', tk: 0.8 },
    damsel: { hh: 0.22, belly: 1.05, ped: 0.055, size: 0.07, speed: 0.8, tail: 'fork', tk: 1 },
    barb: { hh: 0.2, belly: 1.08, ped: 0.055, size: 0.06, speed: 0.9, tail: 'fork', tk: 0.9 },
    betta: { hh: 0.155, belly: 1.05, ped: 0.06, size: 0.078, speed: 0.3, tail: 'veil', tk: 1.25 },
    tetra: { hh: 0.125, belly: 1.1, ped: 0.04, size: 0.034, speed: 1.15, tail: 'fork', tk: 0.8 },
  };

  function palette(id, L, acc) {
    let base, back, belly, fin, mark = INK, mark2 = INK;
    if (id === 'gold') { base = L ? [238, 122, 40] : [255, 150, 64]; back = mix(base, [150, 40, 0], 0.35); belly = mix(base, WHITE, 0.6); fin = mix(base, WHITE, L ? 0.2 : 0.35); }
    else if (id === 'angel') { base = L ? [206, 184, 112] : [236, 224, 176]; back = mix(base, [90, 80, 40], 0.4); belly = mix(base, WHITE, 0.5); fin = mix(base, WHITE, 0.2); mark = [44, 42, 60]; }
    else if (id === 'damsel') { base = L ? [48, 118, 224] : [92, 172, 255]; back = mix(base, [10, 30, 110], 0.45); belly = mix(base, WHITE, 0.45); fin = L ? [226, 164, 36] : [255, 214, 96]; mark = [190, 236, 255]; }
    else if (id === 'barb') { base = L ? [216, 162, 48] : [244, 198, 88]; back = mix(base, [110, 70, 0], 0.4); belly = mix(base, WHITE, 0.55); fin = L ? [214, 70, 44] : [244, 104, 76]; mark = [30, 30, 40]; }
    else if (id === 'betta') { base = L ? mix(acc[1], INK, 0.12) : acc[1]; back = mix(base, [20, 10, 50], 0.45); belly = mix(base, WHITE, 0.25); fin = acc[2]; mark = mix(base, WHITE, 0.55); }
    else { base = L ? [124, 146, 168] : [178, 198, 216]; back = mix(base, [40, 60, 80], 0.45); belly = mix(base, WHITE, 0.6); fin = mix(base, WHITE, 0.3); mark = acc[0]; mark2 = [236, 72, 72]; }
    return { base, back, belly, fin, mark, mark2, key: [base, fin, mark].join('|') };
  }

  function through(c, pts, move) {
    if (move) c.moveTo(pts[0][0], pts[0][1]); else c.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }

  /** The body's outline, nose at (0.5, 0), tail stalk at x = -0.42 (units: body lengths). */
  function bodyPath(sp) {
    const p = new Path2D(), hh = sp.hh, bl = hh * sp.belly;
    p.moveTo(0.5, 0.012);
    p.bezierCurveTo(0.41, -hh * 0.92, -0.02, -hh * 1.12, -0.42, -sp.ped);
    p.lineTo(-0.42, sp.ped);
    p.bezierCurveTo(-0.02, bl * 1.12, 0.4, bl * 0.9, 0.5, 0.012);
    p.closePath();
    return p;
  }

  /** A fin spread between two points on the body and a tip, with its rays. */
  function fan(x, p0, p1, tip, col, alpha, nr, bulge) {
    const path = new Path2D(), bm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], ox = tip[0] - bm[0], oy = tip[1] - bm[1], ol = Math.hypot(ox, oy) || 1;
    path.moveTo(p0[0], p0[1]);
    path.quadraticCurveTo((p0[0] + tip[0]) / 2 + bulge * ol * 0.5, (p0[1] + tip[1]) / 2, tip[0], tip[1]);
    path.quadraticCurveTo((p1[0] + tip[0]) / 2 + bulge * ol * 0.25, (p1[1] + tip[1]) / 2, p1[0], p1[1]);
    path.closePath();
    const g = x.createLinearGradient(bm[0], bm[1], tip[0], tip[1]);
    g.addColorStop(0, rgba(col, alpha)); g.addColorStop(1, rgba(mix(col, WHITE, 0.3), alpha * 0.55));
    x.fillStyle = g; x.fill(path);
    x.save(); x.clip(path);
    x.strokeStyle = rgba(mix(col, INK, 0.4), 0.38); x.lineWidth = 0.005;
    x.beginPath();
    for (let r = 1; r <= nr; r++) { const k = r / (nr + 1), bx = p0[0] + (p1[0] - p0[0]) * k, by = p0[1] + (p1[1] - p0[1]) * k; x.moveTo(bx, by); x.lineTo(bx + ox * 1.1 + (tip[0] - bx) * 0.35, by + oy * 1.1 + (tip[1] - by) * 0.35); }
    x.stroke();
    x.restore();
    x.strokeStyle = rgba(mix(col, INK, 0.3), 0.4); x.lineWidth = 0.006; x.stroke(path);
  }

  function finsOf(id, h) {
    switch (id) {
      case 'gold': return [[[0.2, -h * 0.7], [-0.26, -h * 0.45], [-0.2, -h - 0.2], 7, 0.3], [[-0.1, h * 0.8], [-0.34, h * 0.35], [-0.38, h + 0.12], 4, 0.2], [[0.12, h * 0.95], [0, h], [-0.08, h + 0.16], 3, 0.2]];
      case 'angel': return [[[0.14, -h * 0.8], [-0.38, -h * 0.25], [-0.52, -h - 0.36], 8, 0.5], [[0.02, h * 0.85], [-0.38, h * 0.25], [-0.52, h + 0.36], 8, 0.5]];
      case 'damsel': return [[[0.24, -h * 0.75], [-0.32, -h * 0.35], [-0.3, -h - 0.085], 8, 0.15], [[-0.06, h * 0.85], [-0.33, h * 0.38], [-0.35, h + 0.08], 5, 0.15], [[0.14, h * 0.9], [0.04, h * 0.98], [-0.03, h + 0.13], 3, 0.2]];
      case 'barb': return [[[0.08, -h * 0.85], [-0.16, -h * 0.75], [-0.13, -h - 0.16], 5, 0.25], [[-0.14, h * 0.8], [-0.3, h * 0.45], [-0.31, h + 0.09], 4, 0.2], [[0.08, h * 0.95], [-0.01, h], [-0.07, h + 0.11], 3, 0.2]];
      case 'betta': return [[[0, -h * 0.85], [-0.4, -h * 0.4], [-0.5, -h - 0.3], 9, 0.5], [[0.16, h * 0.85], [-0.4, h * 0.4], [-0.36, h + 0.38], 11, 0.35]];
      default: return [[[0.04, -h * 0.85], [-0.1, -h * 0.8], [-0.1, -h - 0.1], 4, 0.25], [[-0.08, h * 0.85], [-0.3, h * 0.5], [-0.28, h + 0.085], 5, 0.2]];
    }
  }

  /** One fish's body with its fixed fins, painted once (facing right). */
  function sprite(id, pal, L, q) {
    const key = `fish|${id}|${pal.key}|${L}|${q}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const BL = 128, sp = SPECIES[id], h = sp.hh, c = K.mk(BL * 1.2 * q, BL * 1.6 * q), x = c.getContext('2d');
    x.scale(q * BL, q * BL); x.translate(0.62, 0.8);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const body = bodyPath(sp);
    for (const [p0, p1, tip, nr, bulge] of finsOf(id, h)) fan(x, p0, p1, tip, pal.fin, 0.82, nr, bulge);
    if (id === 'angel' || id === 'betta') { // trailing feelers under the chest
      x.strokeStyle = rgba(pal.fin, 0.8); x.lineWidth = 0.012;
      for (const d of [0, 0.05]) { x.beginPath(); x.moveTo(0.17 - d, h * 0.85); x.quadraticCurveTo(0.1 - d, h + 0.2, -0.1 - d * 2, h + (id === 'angel' ? 0.42 : 0.3)); x.stroke(); }
    }
    const g = x.createLinearGradient(0, -h, 0, h * sp.belly);
    g.addColorStop(0, rgb(pal.back)); g.addColorStop(0.42, rgb(pal.base)); g.addColorStop(1, rgb(pal.belly));
    x.fillStyle = g; x.fill(body);

    x.save(); x.clip(body);
    if (id === 'angel') { // dark bars
      x.fillStyle = rgba(pal.mark, 0.44);
      for (const [bx, bw] of [[0.3, 0.036], [0.05, 0.075], [-0.2, 0.07]]) { x.beginPath(); x.moveTo(bx + 0.02, -h * 1.3); x.lineTo(bx + bw + 0.02, -h * 1.3); x.lineTo(bx + bw - 0.02, h * 1.3); x.lineTo(bx - 0.02, h * 1.3); x.closePath(); x.fill(); }
    } else if (id === 'barb') {
      x.fillStyle = rgba(pal.mark, 0.72);
      for (const bx of [0.28, 0.09, -0.1, -0.31]) x.fillRect(bx, -h * 1.3, 0.05, h * 2.6);
      x.fillStyle = rgba(pal.fin, 0.5); x.beginPath(); x.arc(0.5, 0.01, 0.07, 0, TAU); x.fill(); // a red nose
    } else if (id === 'damsel') {
      x.strokeStyle = rgba(pal.mark, 0.7); x.lineWidth = 0.016;
      x.beginPath(); x.moveTo(0.44, -h * 0.28); x.quadraticCurveTo(0.1, -h * 0.9, -0.34, -h * 0.5); x.stroke(); // an electric line along the back
    } else if (id === 'tetra') {
      const rg = x.createLinearGradient(0.06, 0, -0.42, 0);
      rg.addColorStop(0, rgba(pal.mark2, 0)); rg.addColorStop(0.35, rgba(pal.mark2, 0.8)); rg.addColorStop(1, rgba(pal.mark2, 0.85));
      x.fillStyle = rg; x.fillRect(-0.42, 0, 0.5, h * 1.3); // red toward the tail, below the line
      x.strokeStyle = rgba(pal.mark, 0.95); x.lineWidth = 0.04;
      x.beginPath(); x.moveTo(0.27, -h * 0.16); x.quadraticCurveTo(-0.05, -h * 0.34, -0.36, -h * 0.04); x.stroke(); // the neon line
      x.strokeStyle = rgba(mix(pal.mark, WHITE, 0.6), 0.9); x.lineWidth = 0.013;
      x.beginPath(); x.moveTo(0.27, -h * 0.17); x.quadraticCurveTo(-0.05, -h * 0.35, -0.36, -h * 0.05); x.stroke();
    } else if (id === 'betta') {
      x.strokeStyle = rgba(pal.mark, 0.3); x.lineWidth = 0.02;
      for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0.3 - i * 0.16, -h); x.lineTo(0.2 - i * 0.16, h); x.stroke(); } // a sheen
    }
    x.strokeStyle = rgba(pal.back, id === 'tetra' ? 0.12 : 0.24); x.lineWidth = 0.006; // scales
    for (let row = -3; row <= 3; row++) for (let col = 0; col < 9; col++) { x.beginPath(); x.arc(0.2 - col * 0.07 - (row & 1) * 0.035, row * h * 0.3, 0.036, -1.1, 1.1); x.stroke(); }
    const hl = x.createLinearGradient(0, -h, 0, h * 0.1); // the light along the back
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.4, 'rgba(255,255,255,0.3)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hl; x.fillRect(-0.45, -h * 1.2, 0.97, h * 1.3);
    x.restore();

    x.strokeStyle = rgba(pal.back, 0.5); x.lineWidth = 0.009;
    x.beginPath(); x.arc(0.03, 0.02, h * 0.62, -0.9, 0.9); x.stroke(); // the gill cover
    x.beginPath(); x.moveTo(0.488, 0.03); x.quadraticCurveTo(0.46, 0.048, 0.44, 0.032); x.stroke(); // the mouth
    const ex = 0.31, ey = -h * 0.26, er = id === 'tetra' ? 0.062 : id === 'gold' ? 0.052 : 0.046;
    x.fillStyle = '#f6f7fa'; x.beginPath(); x.arc(ex, ey, er, 0, TAU); x.fill();
    x.fillStyle = '#12141c'; x.beginPath(); x.arc(ex + er * 0.14, ey, er * 0.58, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.arc(ex + er * 0.34, ey - er * 0.26, er * 0.19, 0, TAU); x.fill();
    x.strokeStyle = rgba(pal.back, 0.6); x.lineWidth = 0.007; x.beginPath(); x.arc(ex, ey, er, 0, TAU); x.stroke();
    x.strokeStyle = L ? rgba(mix(pal.back, INK, 0.5), 0.6) : rgba(mix(pal.base, WHITE, 0.45), 0.45); x.lineWidth = 0.008; x.stroke(body);
    K.cache.set(key, c);
    return c;
  }

  /** The tail, drawn in a frame that has its origin on the tail stalk and swings with the beat. */
  function tailPath(kind, ped, k, lag) {
    const p = new Path2D();
    if (kind === 'fork') {
      p.moveTo(0.03, -ped);
      p.quadraticCurveTo(-0.1 * k, -0.11 * k, -0.3 * k, -0.2 * k);
      p.quadraticCurveTo(-0.2 * k, -0.06 * k, -0.15 * k, 0);
      p.quadraticCurveTo(-0.2 * k, 0.06 * k, -0.3 * k, 0.2 * k);
      p.quadraticCurveTo(-0.1 * k, 0.11 * k, 0.03, ped);
    } else if (kind === 'fan') {
      p.moveTo(0.03, -ped);
      p.quadraticCurveTo(-0.12 * k, -0.2 * k, -0.3 * k, -0.25 * k);
      p.quadraticCurveTo(-0.25 * k, 0, -0.3 * k, 0.25 * k);
      p.quadraticCurveTo(-0.12 * k, 0.2 * k, 0.03, ped);
    } else { // a veil: two long lobes whose ends follow late
      const c = Math.cos(lag), s = Math.sin(lag), rot = (x, y) => [-0.2 * k + (x + 0.2 * k) * c - y * s, (x + 0.2 * k) * s + y * c];
      const U = rot(-0.54 * k, -0.27 * k), M = rot(-0.3 * k, 0), D = rot(-0.54 * k, 0.27 * k), Uc = rot(-0.4 * k, -0.34 * k), Dc = rot(-0.4 * k, 0.34 * k);
      p.moveTo(0.03, -ped);
      p.bezierCurveTo(-0.1 * k, -0.2 * k, Uc[0], Uc[1], U[0], U[1]);
      p.quadraticCurveTo((U[0] + M[0]) / 2 - 0.05 * k, (U[1] + M[1]) / 2 + 0.05 * k, M[0], M[1]);
      p.quadraticCurveTo((D[0] + M[0]) / 2 - 0.05 * k, (D[1] + M[1]) / 2 - 0.05 * k, D[0], D[1]);
      p.bezierCurveTo(Dc[0], Dc[1], -0.1 * k, 0.2 * k, 0.03, ped);
    }
    p.closePath();
    return p;
  }

  function setDepth(f, z, unit, L) {
    const sp = SPECIES[f.sp];
    f.z = z; f.bl = unit * sp.size * (0.62 + 0.5 * z);
    f.v = sp.speed * (0.55 + 0.5 * z) * (unit / 735) * (0.85 + Math.random() * 0.3);
    f.alpha = (L ? 0.52 : 0.46) + 0.32 * z; // the far ones fainter
  }
  function makeFish(id, z, x, y, dir, unit, L) {
    const f = { sp: id, x, y, dir, turn: 0, ph: Math.random() * TAU, by: Math.random() * TAU, pitch: 0 };
    setDepth(f, z, unit, L);
    return f;
  }

  function drawFish(ctx, f, face, pal, L, q) {
    const sp = SPECIES[f.sp], sgn = face < 0 ? -1 : 1, sx = Math.max(0.16, Math.abs(face)) * sgn * f.bl; // never thinner than a fish seen head-on
    const a = Math.sin(f.ph) * (0.3 + 0.12 * sp.speed), col = pal.fin;
    ctx.save();
    ctx.translate(f.x, f.y); ctx.rotate(-f.pitch * sgn); ctx.scale(sx, f.bl); ctx.rotate(-a * 0.09); // the body answers the tail
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(-0.42, 0); ctx.rotate(a);
    const tp = tailPath(sp.tail, sp.ped, sp.tk, Math.sin(f.ph - 0.9) * 0.42);
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(tp); ctx.globalCompositeOperation = 'source-over'; // it hides what is behind it
    ctx.globalAlpha = f.alpha;
    const g = ctx.createLinearGradient(0, 0, -0.5 * sp.tk, 0);
    g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(1, rgba(mix(col, WHITE, 0.35), 0.5));
    ctx.fillStyle = g; ctx.fill(tp);
    if (f.bl > 14) {
      ctx.save(); ctx.clip(tp);
      ctx.strokeStyle = rgba(mix(col, INK, 0.4), 0.4); ctx.lineWidth = 0.006;
      ctx.beginPath();
      for (let r = 0; r < 7; r++) { const an = -0.62 + r * 0.207; ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(an) * 0.7 * sp.tk, Math.sin(an) * 0.7 * sp.tk); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = rgba(mix(col, INK, 0.3), 0.42); ctx.lineWidth = 0.007; ctx.stroke(tp);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    K.stamp(ctx, sprite(f.sp, pal, L, q), -0.62, -0.8, 1.2, 1.6, f.alpha);
    if (f.bl > 14) { // the pectoral fin, fanning
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = rgba(mix(col, WHITE, 0.25), 0.62); ctx.strokeStyle = rgba(mix(col, INK, 0.35), 0.4); ctx.lineWidth = 0.006;
      const fl = Math.sin(f.ph * 0.6), px = 0.1, py = sp.hh * 0.22;
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px - 0.03, py + 0.1 + 0.03 * fl, px - 0.15, py + 0.09 + 0.05 * fl);
      ctx.quadraticCurveTo(px - 0.11, py + 0.03, px - 0.02, py - 0.012);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function build(W, H, unit, pv, L) {
    const st = { fish: [], schools: [], plants: [], bubbles: [], src: [] };
    const area = (W * H) / 40000, n = pv ? 3 : Math.max(4, Math.min(10, Math.round(area * 0.45) + 3));
    const order = pv ? ['gold', 'angel', 'damsel'] : ['gold', 'angel', 'damsel', 'barb', 'betta', 'barb', 'gold', 'damsel', 'angel', 'barb'];
    for (let i = 0; i < n; i++) st.fish.push(makeFish(order[i % order.length], pv ? [0.9, 0.55, 0.3][i] : Math.random(), W * ((i + 0.15 + Math.random() * 0.7) / n), H * (pv ? 0.3 + 0.2 * i : 0.1 + Math.random() * 0.72), Math.random() < 0.5 ? -1 : 1, unit, L));
    const ns = pv ? 1 : area > 9 ? 2 : 1;
    for (let k = 0; k < ns; k++) { // shoals of tetras
      const z = 0.3 + Math.random() * 0.45, dir = k % 2 ? -1 : 1, m = pv ? 4 : 7 + ((Math.random() * 3) | 0);
      const s = { cx: W * (0.3 + 0.4 * Math.random()), cy: H * (0.25 + 0.35 * k + Math.random() * 0.15), ty: H * (0.3 + Math.random() * 0.4), dir, wy: Math.random() * TAU, v: SPECIES.tetra.speed * 0.72 * (unit / 735), rx: unit * 0.1, fish: [] };
      for (let i = 0; i < m; i++) {
        const f = makeFish('tetra', Math.max(0.05, Math.min(0.95, z + (Math.random() - 0.5) * 0.24)), s.cx, s.cy, dir, unit, L);
        f.ox = (Math.random() * 2 - 1) * s.rx; f.oy = (Math.random() * 2 - 1) * s.rx * 0.42; f.x += f.ox; f.y += f.oy; f.delay = 0;
        s.fish.push(f);
      }
      st.schools.push(s);
    }
    const R = K.rng(77);
    const cluster = (x0, x1, m, h0, h1) => { for (let i = 0; i < m; i++) st.plants.push({ x: x0 + (x1 - x0) * ((i + R() * 0.8) / m), hh: H * (h0 + R() * (h1 - h0)), bw: unit * (0.008 + R() * 0.007), ph: R() * TAU, lean: (R() - 0.5) * unit * 0.05, tone: R() }); };
    cluster(W * 0.01, W * 0.15, pv ? 3 : 6, 0.16, pv ? 0.44 : 0.36);
    cluster(W * 0.86, W * 0.99, pv ? 3 : 6, 0.14, pv ? 0.4 : 0.33);
    if (!pv) cluster(W * 0.42, W * 0.6, 4, 0.05, 0.11);
    st.stems = [];
    for (const [fx, fh] of pv ? [[0.1, 0.5], [0.92, 0.46]] : [[0.045, 0.3], [0.125, 0.22], [0.9, 0.27], [0.965, 0.2], [0.52, 0.09]]) st.stems.push({ x: W * fx, hh: H * fh * (0.85 + R() * 0.3), ph: R() * TAU, lean: (R() - 0.5) * unit * 0.04, ls: unit * (0.013 + R() * 0.005), n: Math.max(3, Math.round((H * fh) / (unit * 0.034))) });
    st.src = pv ? [{ x: W * 0.8, wait: 10 }] : [{ x: W * 0.18, wait: 5 }, { x: W * 0.83, wait: 30 }];
    return st;
  }

  function drawPlants(ctx, st, H, t, L) {
    for (const p of st.stems) { // stems with paired round leaves
      const n = 10, mid = [];
      for (let i = 0; i <= n; i++) { const k = i / n; mid.push([p.x + p.lean * k + Math.sin(t * 0.015 + p.ph + k * 2.1) * p.hh * 0.07 * Math.pow(k, 1.3), H + 2 - p.hh * k]); }
      const col = L ? [50, 132, 84] : [96, 190, 128];
      ctx.strokeStyle = rgba(col, L ? 0.5 : 0.34); ctx.lineWidth = Math.max(0.6, p.ls * 0.12);
      ctx.beginPath(); through(ctx, mid, true); ctx.stroke();
      for (let j = 1; j <= p.n; j++) {
        const u = (j / (p.n + 0.6)) * n, i0 = Math.min(n - 1, Math.floor(u)), fr = u - i0;
        const x = mid[i0][0] + (mid[i0 + 1][0] - mid[i0][0]) * fr, y = mid[i0][1] + (mid[i0 + 1][1] - mid[i0][1]) * fr;
        const dir = Math.atan2(mid[i0 + 1][1] - mid[i0][1], mid[i0 + 1][0] - mid[i0][0]), ls = p.ls * (1 - 0.45 * (j / p.n));
        for (const d of [-1, 1]) {
          const an = dir + d * (1.05 + 0.12 * Math.sin(t * 0.02 + p.ph + j)), leaf = new Path2D();
          leaf.ellipse(x + Math.cos(an) * ls * 0.95, y + Math.sin(an) * ls * 0.95, ls, ls * 0.5, an, 0, TAU);
          ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fill(leaf); ctx.restore();
          ctx.fillStyle = rgba(col, L ? 0.36 : 0.27); ctx.fill(leaf);
          ctx.strokeStyle = rgba(L ? mix(col, INK, 0.3) : mix(col, WHITE, 0.35), L ? 0.36 : 0.24); ctx.lineWidth = Math.max(0.5, ls * 0.07); ctx.stroke(leaf);
        }
      }
    }
    for (const p of st.plants) {
      const n = 9, lf = [], rt = [], mid = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, cx = p.x + p.lean * k + Math.sin(t * 0.017 + p.ph + k * 2.4) * (p.bw * 1.6 + p.hh * 0.05) * Math.pow(k, 1.4), y = H + 2 - p.hh * k;
        const wv = p.bw * (1 - Math.pow(k, 2.4)) * (0.78 + 0.22 * Math.sin(k * 10 + p.ph));
        lf.push([cx - wv, y]); rt.push([cx + wv, y]); mid.push([cx, y]);
      }
      const path = new Path2D();
      through(path, lf, true); through(path, rt.reverse(), false); path.closePath();
      const col = L ? mix([34, 118, 92], [70, 140, 60], p.tone) : mix([60, 170, 132], [110, 190, 110], p.tone);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fill(path); ctx.restore();
      ctx.fillStyle = rgba(col, L ? 0.32 : 0.24); ctx.fill(path);
      ctx.strokeStyle = rgba(L ? mix(col, INK, 0.3) : mix(col, WHITE, 0.4), L ? 0.34 : 0.2); ctx.lineWidth = Math.max(0.5, p.bw * 0.16);
      ctx.beginPath(); through(ctx, mid, true); ctx.stroke(); // the midrib
    }
  }

  window.BG_EXT = window.BG_EXT || {};
  window.BG_EXT.aquarium = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), pv = V.pv, L = K.light(), unit = pv ? 150 : Math.max(300, V.u), q = bg.dpr || 1, k = unit / 735;
    const key = `${w}x${h}${L ? 'L' : 'D'}`;
    let st = bg.st;
    if (!st || st.kind !== 'aquarium' || st.key !== key) { st = bg.st = build(w, h, unit, pv, L); st.kind = 'aquarium'; st.key = key; }
    const acc = accents(), pals = {};
    const palOf = (id) => pals[id] || (pals[id] = palette(id, L, acc));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (!pv) { // the floor of the tank: a low strip of sand with a few pebbles
      const hs = Math.min(h * 0.045, unit * 0.045), sand = L ? [150, 128, 96] : [168, 156, 132];
      const g = ctx.createLinearGradient(0, h - hs, 0, h);
      g.addColorStop(0, rgba(sand, L ? 0.16 : 0.1)); g.addColorStop(1, rgba(sand, L ? 0.26 : 0.17));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-2, h + 2);
      for (let x = -2; x <= w + 24; x += 24) ctx.lineTo(x, h - hs * (0.55 + 0.25 * Math.sin(x * 0.011 + 1.3) + 0.2 * Math.sin(x * 0.037)));
      ctx.lineTo(w + 2, h + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(sand, L ? 0.3 : 0.2);
      for (let i = 0; i < 14; i++) { const x = w * ((i * 0.618 + 0.07) % 1), r = hs * (0.1 + 0.16 * ((i * 0.37) % 1)); ctx.beginPath(); ctx.ellipse(x, h - hs * 0.28, r * 1.5, r, 0, 0, TAU); ctx.fill(); }
    }

    // the lone swimmers
    for (const f of st.fish) {
      const sp = SPECIES[f.sp];
      f.ph += 0.1 + 0.16 * sp.speed; f.by += 0.017;
      f.face = f.turn > 0 ? f.dir * Math.cos(Math.PI * f.turn) : f.dir; // turning: seen end-on half-way round
      if (f.turn > 0) { f.turn += 0.03; if (f.turn >= 1) { f.turn = 0; f.dir = -f.dir; } }
      else if (pv ? (f.x > w * 0.9 && f.dir > 0) || (f.x < w * 0.1 && f.dir < 0) : Math.random() < 0.0007 && f.x > w * 0.2 && f.x < w * 0.8) f.turn = 0.001; // in the small preview they turn at the sides and stay in sight
      const vy = Math.sin(f.by) * 0.16 * k * (0.5 + sp.speed);
      f.x += f.v * f.face * (f.turn > 0 ? 0.5 : 1); f.y += vy;
      f.pitch += (Math.max(-0.25, Math.min(0.25, (-vy / Math.max(0.05 * k, f.v)) * 0.5)) - f.pitch) * 0.1;
      const m = f.bl * 1.5;
      if ((f.x > w + m && f.dir > 0) || (f.x < -m && f.dir < 0)) { f.dir = -f.dir; f.turn = 0; f.y = h * (0.1 + Math.random() * 0.72); setDepth(f, Math.random(), unit, L); } // out of sight: it comes back another way
    }
    // the shoals: they follow a point that wanders, and wheel about together
    for (const s of st.schools) {
      s.wy += 0.008;
      s.cx += s.v * s.dir; s.cy += Math.sin(s.wy) * 0.2 * k + (s.ty - s.cy) * 0.003;
      if ((s.cx > w * 0.86 && s.dir > 0) || (s.cx < w * 0.14 && s.dir < 0) || (!pv && Math.random() < 0.0012)) {
        const was = s.dir;
        s.dir = -s.dir; s.ty = h * (0.2 + Math.random() * 0.5);
        for (const f of s.fish) f.delay = 1 + Math.round(((s.rx - f.ox * was) / (2 * s.rx)) * 16 + Math.random() * 6); // the leaders first
      }
      for (const f of s.fish) {
        f.ph += 0.26 + 0.1 * Math.sin(f.by); f.by += 0.03;
        if (f.delay > 0) { if (--f.delay === 0 && f.dir !== s.dir && f.turn === 0) f.turn = 0.001; } else if (f.turn === 0 && f.dir !== s.dir) f.delay = 1 + ((Math.random() * 6) | 0);
        f.face = f.turn > 0 ? f.dir * Math.cos(Math.PI * f.turn) : f.dir;
        if (f.turn > 0) { f.turn += 0.05; if (f.turn >= 1) { f.turn = 0; f.dir = -f.dir; } }
        const tx = s.cx + f.ox, ty = s.cy + f.oy + Math.sin(f.by) * unit * 0.004;
        f.x += s.v * f.face + (tx - f.x) * 0.03; f.y += (ty - f.y) * 0.04;
        f.pitch = 0;
      }
    }

    // far to near; the plants stand in the middle distance
    const all = st.fish.slice();
    for (const s of st.schools) for (const f of s.fish) all.push(f);
    all.sort((a, b) => a.z - b.z);
    let planted = false;
    for (const f of all) {
      if (!planted && f.z >= 0.5) { drawPlants(ctx, st, h, t, L); planted = true; }
      drawFish(ctx, f, f.face, palOf(f.sp), L, q);
      if (!pv && f.bl > 20 && Math.random() < 0.004 && st.bubbles.length < 70) st.bubbles.push({ x: f.x + f.face * f.bl * 0.5, y: f.y, r: unit * (0.002 + Math.random() * 0.003), ph: Math.random() * TAU });
    }
    if (!planted) drawPlants(ctx, st, h, t, L);

    // air rising in strings
    for (const s of st.src) {
      if (--s.wait > 0) continue;
      s.wait = pv ? 24 + Math.random() * 40 : 6 + Math.random() * 16;
      if (Math.random() < 0.15) s.wait += pv ? 60 : 50; // a breath between strings
      if (st.bubbles.length < 70) st.bubbles.push({ x: s.x + (Math.random() - 0.5) * unit * 0.012, y: h + 4, r: unit * (0.0035 + Math.random() * Math.random() * 0.009), ph: Math.random() * TAU });
    }
    for (const b of st.bubbles) {
      b.ph += 0.09; b.y -= (0.5 + 0.9 * (b.r / (unit * 0.0125))) * k; b.x += Math.sin(b.ph) * 0.3 * k;
      const top = Math.max(0, Math.min(1, b.y / (h * 0.08))); // they thin out as they reach the top
      ctx.lineWidth = Math.max(0.5, b.r * 0.16);
      ctx.strokeStyle = L ? `rgba(64,104,150,${0.44 * top})` : `rgba(190,230,255,${0.36 * top})`;
      ctx.fillStyle = L ? `rgba(64,104,150,${0.06 * top})` : `rgba(190,230,255,${0.06 * top})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      if (b.r > 1.6) { ctx.strokeStyle = `rgba(255,255,255,${(L ? 0.9 : 0.55) * top})`; ctx.lineWidth = Math.max(0.5, b.r * 0.2); ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.58, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke(); }
    }
    st.bubbles = st.bubbles.filter((b) => b.y > -b.r * 2);
  };
})();
