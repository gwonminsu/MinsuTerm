'use strict';
/*
 * Submit (Enter) flourishes, group c (see fx/kit.js for the contract):
 *   나비 a flock lifts off · 음표 a staff unrolls and ends in a rising chord · 미니 폭죽 a rocket and a chrysanthemum shell ·
 *   먹물 an ensō brushed from the point · 눈송이 a crystal grows and shatters · 글자 파편 the submitted characters leap
 *   off the line · 검기 a cross slash that cuts a spark in two.
 * Each starts at the last input position (FXKit.anchor) and keeps a small canvas (the picker's preview) inside its
 * edges. Detailed pieces are painted once into sprites; a frame is a few sprite draws and strokes.
 */
(function () {
  const K = window.FXKit;
  const { TAU, sprite, paint, put, part, clamp, ease, rand, rng, glow, rgba, shade, anchor, thin, scaleOf } = K;
  const SUB = window.FX_SUBMIT;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ck = (c) => c.join('.');
  const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
  /** 1 well inside the canvas, 0 at its edge: what flies off a small canvas fades out instead of being cut. */
  const inside = (fx, x, y, m) => clamp(Math.min(x, fx.w - x, y, fx.h - y) / Math.max(1, m));
  /** Soft light in an accent colour, white at the heart. */
  const tint = (c) => glow(`c-tint|${ck(c)}`, [[0, rgba(shade(c, 0.75), 0.95)], [0.28, rgba(shade(c, 0.25), 0.42)], [0.62, rgba(c, 0.1)], [1, rgba(c, 0)]]);
  const warm = () => glow('c-warm', [[0, 'rgba(255,252,240,1)'], [0.18, 'rgba(255,232,180,0.7)'], [0.5, 'rgba(255,180,90,0.2)'], [1, 'rgba(255,150,60,0)']]);
  const frost = () => glow('c-frost', [[0, 'rgba(236,246,255,0.95)'], [0.25, 'rgba(170,210,255,0.4)'], [0.6, 'rgba(110,170,255,0.1)'], [1, 'rgba(90,150,255,0)']]);
  const pollen = () => glow('c-pollen', [[0, 'rgba(255,252,226,1)'], [0.22, 'rgba(255,230,150,0.5)'], [1, 'rgba(255,200,90,0)']]);
  /** A four-pointed glint: a hard core, rays in colour c, and (on dark) soft light round it. 32 px. */
  const glintS = (c, L, q) => sprite(`c-glint|${ck(c)}|${L}|${q}`, () => paint(32, 32, q, (x) => {
    x.translate(16, 16);
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 15); g.addColorStop(0, rgba(shade(c, 0.85), 0.9)); g.addColorStop(0.3, rgba(c, 0.3)); g.addColorStop(1, rgba(c, 0)); x.fillStyle = g; x.fillRect(-16, -16, 32, 32); }
    const ray = (len, wd) => { x.beginPath(); x.moveTo(0, -len); x.quadraticCurveTo(wd, -wd, len, 0); x.quadraticCurveTo(wd, wd, 0, len); x.quadraticCurveTo(-wd, wd, -len, 0); x.quadraticCurveTo(-wd, -wd, 0, -len); x.closePath(); };
    x.fillStyle = L ? rgba(shade(c, -0.3), 0.95) : rgba(shade(c, 0.4), 0.9); ray(15, 2.3); x.fill();
    x.fillStyle = L ? rgba(shade(c, -0.62), 1) : '#fff'; ray(10, 1.25); x.fill();
    if (L) { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 1.4, 0, TAU); x.fill(); }
  }));

  /** A puff of tiny lights (flecks, in light mode) thrown out from a point. */
  function drawMotes(ctx, p, fx) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), e = ease.out(t);
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    for (const m of p.m) {
      const x = p.x + m.dx * e, y = p.y + m.dy * e + p.fall * t * t, al = (1 - t) * m.a * p.al * inside(fx, x, y, 3);
      if (al < 0.01) continue;
      ctx.globalAlpha = al;
      if (p.L) { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(x, y, m.s * 0.28 * (1 - t * 0.5), 0, TAU); ctx.fill(); } else ctx.drawImage(p.g.c, x - m.s, y - m.s, m.s * 2, m.s * 2);
    }
    ctx.restore();
  }
  function motes(P, o) {
    const m = [];
    for (let i = 0; i < o.n; i++) { const an = rand(0, TAU), d = o.spread * rand(0.35, 1); m.push({ dx: Math.cos(an) * d, dy: Math.sin(an) * d * 0.8 - o.spread * (o.up ?? 0.25), s: o.size * rand(0.6, 1.2), a: rand(0.55, 1) }); }
    P.push(part(o.T + (o.wait || 0), drawMotes, { x: o.x, y: o.y, m, wait: o.wait || 0, fall: o.fall || 0, L: o.L, col: o.col, g: o.g, al: o.al ?? 1 }));
  }

  /* ==================================================================================================== */
  /* 나비: a little flock lifts off the point, wings beating, each on its own wandering way up and away.  */
  /* ==================================================================================================== */

  // the right-hand wing of each pair in wing units (a forewing about 29 long), its root at (0, 0)
  const FORE = new Path2D('M0 -1C4 -9 14 -16 26 -16.5C29.5 -13 29 -6 24.5 -0.5C16 1.5 7 1.6 0 1Z');
  const HIND = new Path2D('M0 0.5C8 -0.5 16.5 1.5 19.5 6.5C22 11.5 18 17.5 11 17.5C5.5 17.5 1.5 10.5 0 2.5Z');
  /** A wing: dark at the root, the accent through the middle, a band of the second colour, a dark margin set with white spots. */
  function wingS(fore, c1, c2, L, sc, q) {
    return sprite(`c-wing|${fore}|${ck(c1)}|${ck(c2)}|${L}|${sc}|${q}`, () => {
      const [bx, by, bw, bh] = fore ? [-1.5, -18.5, 33, 21] : [-1.5, -1.5, 25, 21], W = fore ? FORE : HIND, len = fore ? 29 : 21;
      const s = paint(bw * sc, bh * sc, q, (x) => {
        x.scale(sc, sc); x.translate(-bx, -by);
        const deep = shade(c1, -0.5), rim = shade(c1, -0.84), lit = shade(c1, 0.38);
        const g = x.createRadialGradient(0, 0, 0.5, 0, 0, len);
        g.addColorStop(0, rgba(deep, 1)); g.addColorStop(0.2, rgba(c1, 1)); g.addColorStop(0.5, rgba(lit, 1)); g.addColorStop(0.64, rgba(shade(c2, 0.2), 1)); g.addColorStop(0.75, rgba(rim, 1)); g.addColorStop(1, rgba(rim, 1));
        x.fillStyle = g; x.fill(W);
        x.save(); x.clip(W);
        x.strokeStyle = rgba(rim, 0.5); x.lineWidth = 0.6; // veins
        for (const an of fore ? [-1.05, -0.78, -0.52, -0.3, -0.1] : [0.2, 0.48, 0.78, 1.08]) {
          x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(Math.cos(an - 0.12) * len * 0.45, Math.sin(an - 0.12) * len * 0.45, Math.cos(an) * len * 1.1, Math.sin(an) * len * 1.1); x.stroke();
        }
        x.fillStyle = 'rgba(255,255,255,0.92)'; // spots set in the dark margin
        for (const [sx, sy, r] of fore ? [[26.5, -13.5, 1.5], [27, -9.5, 1.3], [25.5, -5.5, 1.1], [23.2, -2, 0.9], [22.5, -15, 0.8], [18.5, -14.6, 0.7]] : [[18.5, 8, 1], [17.5, 12.5, 1], [13.5, 15.8, 0.9], [8.5, 16.2, 0.8]]) { x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill(); }
        if (fore) { x.fillStyle = 'rgba(255,255,255,0.24)'; x.beginPath(); x.ellipse(15, -8, 6.5, 2.2, -0.55, 0, TAU); x.fill(); } else { // an eyespot
          for (const [r, col] of [[3.2, rgba(rim, 1)], [2.3, rgba(shade(c2, 0.3), 1)], [1.15, rgba(rim, 1)]]) { x.fillStyle = col; x.beginPath(); x.arc(10.5, 8.5, r, 0, TAU); x.fill(); }
          x.fillStyle = '#fff'; x.beginPath(); x.arc(10, 8, 0.5, 0, TAU); x.fill();
        }
        x.restore();
        x.strokeStyle = rgba(rim, L ? 1 : 0.85); x.lineWidth = L ? 1 : 0.8; x.stroke(W);
        x.strokeStyle = rgba(lit, 0.6); x.lineWidth = 0.7; // light along the leading edge
        x.beginPath();
        if (fore) { x.moveTo(1, -2); x.bezierCurveTo(5, -9.5, 14, -15.5, 25, -16); } else { x.moveTo(1, 0); x.bezierCurveTo(8, -0.6, 15, 1.2, 18.5, 5.5); }
        x.stroke();
      });
      s.bx = bx * sc; s.by = by * sc;
      return s;
    });
  }
  /** Head, thorax, abdomen and clubbed antennae, lit down the middle. */
  const bodyS = (c, L, sc, q) => sprite(`c-body|${ck(c)}|${L}|${sc}|${q}`, () => paint(14 * sc, 30 * sc, q, (x) => {
    x.scale(sc, sc); x.translate(7, 15);
    const dk = shade(c, -0.82), lt = shade(c, L ? -0.25 : 0.45);
    x.strokeStyle = rgba(dk, 0.95); x.lineWidth = 0.75; x.fillStyle = rgba(dk, 1);
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(d * 0.6, -6.4); x.quadraticCurveTo(d * 1.4, -11, d * 4.2, -13.2); x.stroke(); x.beginPath(); x.arc(d * 4.3, -13.3, 0.95, 0, TAU); x.fill(); }
    const g = x.createLinearGradient(-2, 0, 2, 0);
    g.addColorStop(0, rgba(dk, 1)); g.addColorStop(0.42, rgba(lt, 1)); g.addColorStop(1, rgba(dk, 1));
    x.fillStyle = g;
    for (const [ey, rx, ry] of [[-5.3, 1.5, 1.5], [-1.8, 1.9, 2.9], [5, 1.3, 5.6]]) { x.beginPath(); x.ellipse(0, ey, rx, ry, 0, 0, TAU); x.fill(); }
  }));
  function drawFly(ctx, p, fx) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    p.ph += p.w * (a < 16 ? 1.45 : 1); // beating hard to get off the ground
    p.hd += (p.h0 - p.hd) * 0.05 + Math.sin(a * p.f1 + p.p1) * 0.06 + Math.sin(a * p.f2 + p.p2) * 0.04; // it wanders about its way
    const sp = p.sp * (a < 10 ? 1.8 - a * 0.08 : 1);
    p.x += Math.cos(p.hd) * sp; p.y += Math.sin(p.hd) * sp * p.vk;
    p.rot += (clamp(p.hd + Math.PI / 2, -1.1, 1.1) - p.rot) * 0.15;
    const al = clamp((a + 1) / 4) * (t > 0.7 ? 1 - ease.smooth((t - 0.7) / 0.3) : 1) * inside(fx, p.x, p.y, p.span * 0.7);
    if (al < 0.01) return;
    const wf = 0.08 + 0.92 * (0.5 + 0.5 * Math.cos(p.ph)), wh = 0.1 + 0.9 * (0.5 + 0.5 * Math.cos(p.ph - 0.55)); // the hindwings a little behind
    const sc = (0.5 + 0.5 * ease.out(clamp(a / 9))) * (1 - 0.3 * t) * p.k, bob = Math.sin(p.ph) * p.span * 0.06, S = p.S;
    ctx.save();
    ctx.translate(p.x, p.y - bob); ctx.rotate(p.rot); ctx.scale(sc, sc);
    if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * al * p.al; const r = p.span * 1.15; ctx.drawImage(p.glow.c, -r, -r, r * 2, r * 2); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    for (const [s, ox, oy, w] of [[p.hind, 0.5, 0.4, wh], [p.fore, 0.6, -1.8, wf]]) {
      for (const d of [-1, 1]) { ctx.save(); ctx.translate(d * ox * S, oy * S); ctx.scale(d * w, 1); ctx.drawImage(s.c, s.bx, s.by, s.w, s.h); ctx.restore(); }
    }
    ctx.drawImage(p.body.c, -p.body.w / 2, -p.body.h / 2, p.body.w, p.body.h);
    ctx.restore();
  }
  SUB.butterfly = (c) => {
    const { fx, P, cols, cw, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx), th = thin(fx);
    const n = Math.max(2, Math.round(7 * th)), span = ch * 1.85 * u, S = Math.max(0.12, Math.round((span / 2 / 27) * 50) / 50);
    for (let i = 0; i < n; i++) {
      const c1 = cols[i % 3], c2 = cols[(i + 1) % 3], fan = i / (n - 1) - 0.5, side = i % 2 ? 1 : -1;
      const h0 = A.small ? -Math.PI / 2 + side * rand(1.15, 1.45) : -Math.PI / 2 + fan * 2.7 + rand(-0.12, 0.12);
      const wait = Math.round(i * 2.2 + rand(0, 2)), T = wait + Math.round(A.small ? rand(62, 74) : rand(82, 98));
      P.push(part(T, drawFly, {
        wait, x: A.x + rand(-0.35, 0.35) * cw, y: A.y + rand(-0.2, 0.2) * ch, h0, hd: h0 + rand(-0.15, 0.15), rot: 0,
        sp: rand(1.5, 2.3) * u, vk: A.small ? 0.3 : 1, ph: rand(0, TAU), w: rand(0.5, 0.68), f1: rand(0.05, 0.09), f2: rand(0.13, 0.2), p1: rand(0, TAU), p2: rand(0, TAU),
        span, S, k: rand(0.85, 1.1), al: alpha, L, fore: wingS(true, c1, c2, L, S, q), hind: wingS(false, c1, c2, L, S, q), body: bodyS(c1, L, S, q), glow: L ? null : tint(c1),
      }));
    }
    motes(P, { x: A.x, y: A.y, n: Math.round(9 * th), spread: ch * 1.1 * u, size: ch * 0.45 * u, T: 30, up: 0.45, L, col: rgba(shade(cols[2], -0.35), 0.9), g: pollen(), al: alpha });
  };

  /* ==================================================================================================== */
  /* 음표: a staff unrolls from the point with notes riding it in time, and it ends in a chord that rises.  */
  /* ==================================================================================================== */

  // where along the staff, the pitch (half spaces up from the middle line), and 0 a crotchet / 1, 2 a beamed pair
  const TUNE = [[0.14, -2, 0], [0.25, 0, 1], [0.34, 2, 2], [0.46, 1, 0], [0.57, 3, 1], [0.66, 5, 2], [0.78, 4, 0]];
  const CHORD = [-2, 0, 2], CHORD_S = 0.93, UNROLL = 22;
  /** A glossy notehead, tilted as engraved noteheads are; r is half its width. */
  const headS = (c, L, r, q) => sprite(`c-nh|${ck(c)}|${L}|${r}|${q}`, () => paint(r * 2 + 4, r * 2 + 4, q, (x) => {
    x.translate(r + 2, r + 2); x.rotate(-0.38);
    const ry = r * 0.7, g = x.createRadialGradient(-r * 0.35, -ry * 0.45, 0.2, 0, 0, r * 1.1);
    g.addColorStop(0, rgba(shade(c, L ? 0.3 : 0.75), 1)); g.addColorStop(0.45, rgba(L ? shade(c, -0.25) : c, 1)); g.addColorStop(1, rgba(shade(c, L ? -0.62 : -0.35), 1));
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, r, ry, 0, 0, TAU); x.fill();
    x.strokeStyle = L ? rgba(shade(c, -0.72), 0.85) : rgba(shade(c, 0.5), 0.7); x.lineWidth = 0.5; x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.78)'; x.beginPath(); x.ellipse(-r * 0.34, -ry * 0.36, r * 0.32, ry * 0.2, -0.2, 0, TAU); x.fill();
  }));
  /** A treble clef, h tall, from the music symbols font, shaded like the notes. */
  const clefS = (c, L, h, q) => sprite(`c-clef|${ck(c)}|${L}|${h}|${q}`, () => paint(h * 0.62 + 4, h + 4, q, (x) => {
    const font = (s) => `${s}px 'Segoe UI Symbol', 'Noto Music', 'Apple Symbols', serif`;
    x.font = font(h); let m = x.measureText('\u{1D11E}');
    const gh = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || h, fs = (h * h) / gh;
    x.font = font(fs); m = x.measureText('\u{1D11E}');
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const cx = (h * 0.62 + 4) / 2, by = 2 + m.actualBoundingBoxAscent;
    const g = x.createLinearGradient(0, 2, 0, h + 2);
    g.addColorStop(0, rgba(shade(c, L ? -0.2 : 0.7), 1)); g.addColorStop(0.55, rgba(L ? shade(c, -0.45) : shade(c, 0.2), 1)); g.addColorStop(1, rgba(shade(c, L ? -0.65 : -0.15), 1));
    if (!L) { x.shadowColor = rgba(c, 0.9); x.shadowBlur = 3 * q; }
    x.fillStyle = g; x.fillText('\u{1D11E}', cx, by);
  }));
  function drawStaff(ctx, p, fx) {
    const a = p.age++, L = p.L, G = p.gap;
    const head = ease.out(clamp(a / UNROLL)), tail = ease.in(clamp((a - 46) / 32)), fade = 1 - ease.smooth(clamp((a - 58) / 24));
    const N = 28, pts = [];
    for (let i = 0; i <= N; i++) pts.push(p.at(lerp(tail, head, i / N)));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lc = L ? shade(p.c, -0.58) : shade(p.c, 0.4);
    if (head - tail > 0.01 && fade > 0) { // five lines, faded in where the tail is
      const lines = () => { ctx.beginPath(); for (let l = -2; l <= 2; l++) for (let i = 0; i <= N; i++) { const [px, py, nx, ny] = pts[i], X = px + nx * l * G, Y = py + ny * l * G; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } };
      const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[N][0], pts[N][1]), f = (L ? 0.78 : 0.75) * fade;
      g.addColorStop(0, rgba(lc, tail > 0.002 ? 0 : f)); g.addColorStop(0.14, rgba(lc, f)); g.addColorStop(1, rgba(lc, f));
      ctx.strokeStyle = g;
      if (!L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 * p.al; ctx.lineWidth = G * 0.95; lines(); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineWidth = Math.max(0.7, G * 0.2); lines(); ctx.stroke();
      if (tail < 0.002) { const [px, py, nx, ny] = pts[0]; ctx.strokeStyle = rgba(lc, f); ctx.lineWidth = Math.max(0.8, G * 0.28); ctx.beginPath(); ctx.moveTo(px - nx * 2 * G, py - ny * 2 * G); ctx.lineTo(px + nx * 2 * G, py + ny * 2 * G); ctx.stroke(); } // the opening bar line
      if (a < UNROLL + 3) { const [px, py] = pts[N]; ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = (1 - a / (UNROLL + 3)) * p.al; put(ctx, p.glint, px, py, (G * 6) / 32, a * 0.1); ctx.globalAlpha = 1; } // the pen running ahead
    }
    ctx.globalCompositeOperation = 'source-over';
    const right = (q) => [-q[3], q[2]];
    if (tail < 0.05 && a >= 2) { // the clef
      const q = p.at(0.055), [rx, ry] = right(q), k = ease.back(clamp((a - 2) / 8));
      ctx.globalAlpha = clamp((a - 2) / 3) * fade * (1 - clamp(tail / 0.05));
      put(ctx, p.clef, q[0] - q[2] * G * 0.35, q[1] - q[3] * G * 0.35, k, Math.atan2(ry, rx));
    }
    const stem = Math.max(0.75, G * 0.24), up = G * 3.3, shown = [];
    for (let i = 0; i < TUNE.length; i++) { // the notes, bobbing in time; they float up as the staff goes
      const [s, pitch, kind] = TUNE[i], k = a - p.born[i];
      if (k < 0) break;
      const gone = clamp((tail - s + 0.04) / 0.1), al = clamp((k + 1) / 2) * (1 - gone) * fade;
      const q = p.at(s), [rx, ry] = right(q), pop = ease.back(clamp(k / 7)), off = pitch * G * 0.5 + Math.sin((k * TAU) / 16) * G * 0.32 + gone * G * 3;
      const hx = q[0] + q[2] * off, hy = q[1] + q[3] * off, sx = hx + rx * p.r * 0.82 * pop, sy = hy + ry * p.r * 0.82 * pop;
      shown.push({ hx, hy, sx, sy, tx: sx + q[2] * up * pop, ty: sy + q[3] * up * pop, al, pop, kind, c: p.cs[i % 3], ang: Math.atan2(ry, rx) });
    }
    for (let i = 0; i < shown.length; i++) {
      const n = shown[i];
      if (n.al < 0.01) continue;
      ctx.globalAlpha = n.al; ctx.strokeStyle = rgba(L ? shade(n.c, -0.55) : shade(n.c, 0.45), 1); ctx.lineWidth = stem;
      ctx.beginPath(); ctx.moveTo(n.sx, n.sy); ctx.lineTo(n.tx, n.ty); ctx.stroke();
      const m = n.kind === 1 && shown[i + 1];
      if (m) { ctx.lineWidth = G * 0.6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(n.tx - (m.tx - n.tx) * 0.04, n.ty); ctx.lineTo(m.tx + (m.tx - n.tx) * 0.04, m.ty); ctx.stroke(); ctx.lineCap = 'round'; } // the beam
      put(ctx, p.heads[i % 3], n.hx, n.hy, n.pop, n.ang);
    }
    const ca = a - p.cb; // the chord: three heads stacked in turn on the last bar, then it rises
    if (ca >= 0) {
      const q = p.at(CHORD_S), lift = ease.smooth(clamp((ca - 16) / 48)), al = clamp((ca + 1) / 2) * (1 - ease.smooth(clamp((ca - 44) / 24)));
      const ang = Math.atan2(q[2], -q[3]) * (1 - lift), rx = Math.cos(ang), ry = Math.sin(ang), nx = ry, ny = -rx, sc = 1 + 0.75 * lift;
      const bx = q[0] + Math.sin(ca * 0.13) * G * 1.2 * lift, by = q[1] - p.cr * lift;
      if (al > 0.01) {
        if (!L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * p.al * (0.4 + 0.12 * Math.sin((ca * TAU) / 16)); put(ctx, p.tint, bx, by - G * sc, (G * 14 * sc) / 96); ctx.globalCompositeOperation = 'source-over'; }
        let topx = bx, topy = by, n = 0;
        for (let j = 0; j < CHORD.length; j++) {
          const k = ca - j * 3;
          if (k < 0) break;
          n = j + 1;
          const off = CHORD[j] * G * 0.5 * sc, hx = bx + nx * off, hy = by + ny * off;
          ctx.globalAlpha = al; put(ctx, p.heads[j], hx, hy, ease.back(clamp(k / 6)) * sc, ang);
          if (j === 0) { topx = hx; topy = hy; }
        }
        if (n) { // one stem for them all
          const sx = topx + rx * p.r * 0.82 * sc, sy = topy + ry * p.r * 0.82 * sc, len = (CHORD[n - 1] - CHORD[0]) * G * 0.5 * sc + up * sc;
          ctx.globalAlpha = al; ctx.strokeStyle = rgba(L ? shade(p.c, -0.55) : shade(p.c, 0.45), 1); ctx.lineWidth = stem * sc;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + nx * len, sy + ny * len); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  SUB.notes = (c) => {
    const { fx, P, cols, cw, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx);
    const G = Math.max(1.6, Math.round(ch * 0.23 * u * 4) / 4), r = Math.max(1.4, Math.round(G * 0.74 * 4) / 4);
    const roomR = fx.w - A.x - 10, roomL = A.x - 10, dir = roomR >= ch * 6 || roomR >= roomL ? 1 : -1;
    const len = Math.max(ch * 3, Math.min(ch * 9 * u, (dir > 0 ? roomR : roomL) - cw, A.small ? fx.w * 0.42 : 1e9));
    const rise = clamp(A.small ? (A.y - G * 2 - 4) * 0.5 : ch * 2 * u, 0, Math.max(0, A.y - G * 2 - 8)), wave = G * 1.3, x0 = A.x + dir * cw * 0.3, y0 = A.y;
    const C = (s) => [x0 + dir * len * s, y0 - rise * ease.smooth(s) + wave * Math.sin(TAU * s * 0.85) * (1 - s)];
    const at = (s) => { const [px, py] = C(s), [x2, y2] = C(Math.min(1, s + 0.01)), [x1, y1] = C(Math.max(0, s - 0.01)), l = Math.hypot(x2 - x1, y2 - y1) || 1; return [px, py, ((y2 - y1) / l) * dir, (-(x2 - x1) / l) * dir]; };
    const born = TUNE.map(([s]) => Math.ceil(UNROLL * (1 - Math.cbrt(1 - s))));
    const cy = C(CHORD_S)[1], cr = Math.max(G * 3, Math.min(ch * 2.6 * u, cy - G * 4 - (A.small ? 2 : 6)));
    P.push(part(86, drawStaff, { at, born, gap: G, r, c: cols[0], cs: cols, cb: born[TUNE.length - 1] + 6, cr, L, al: alpha, heads: cols.map((col) => headS(col, L, r, q)), clef: clefS(cols[0], L, Math.round(G * 7.2), q), glint: glintS(cols[0], L, q), tint: tint(cols[0]) }));
  };

  /* ==================================================================================================== */
  /* 미니 폭죽: a rocket climbs from the point and breaks into a chrysanthemum: trailing stars, white-hot    */
  /* to colour, a ring of a second colour inside, and a crackle of glitter as they burn out.              */
  /* ==================================================================================================== */

  function drawShell(ctx, p, fx) {
    const a = p.age++, L = p.L, lw = p.lw;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    for (const s of p.fizz) { // what the rocket spits out on its way up
      const k = a - s.t0;
      if (k < 0 || k > s.T) continue;
      const [rx, ry] = p.rk(s.t0), al = 1 - k / s.T;
      ctx.fillStyle = L ? `rgba(184,110,18,${al})` : `rgba(255,${(196 + 50 * al) | 0},130,${al})`;
      ctx.fillRect(rx + s.vx * k - lw * 0.6, ry + s.vy * k + s.g * k * k - lw * 0.6, lw * 1.2, lw * 1.2);
    }
    if (a <= p.tb) {
      for (let j = 0; j < 5; j++) { // its tail, hottest at the head
        const [x0, y0] = p.rk(Math.max(0, a - (j + 1) * 1.6)), [x1, y1] = p.rk(Math.max(0, a - j * 1.6));
        ctx.strokeStyle = L ? `rgba(172,96,14,${0.8 * (1 - j / 5)})` : `rgba(255,${220 - j * 22},${150 - j * 22},${0.85 * (1 - j / 5)})`;
        ctx.lineWidth = (1.7 - j * 0.24) * lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      const [hx, hy] = p.rk(a);
      if (!L) { ctx.globalAlpha = 0.9 * p.al; put(ctx, p.warm, hx, hy, (p.ch * 1.3 * p.u) / 96); ctx.globalAlpha = 1; }
      ctx.fillStyle = L ? '#9a5206' : '#fffaf0'; ctx.beginPath(); ctx.arc(hx, hy, 1.3 * lw, 0, TAU); ctx.fill();
    }
    const tau = a - p.tb;
    if (tau >= 0) {
      if (tau < 9) { ctx.globalAlpha = (L ? 0.3 : 0.5) * (1 - tau / 9) ** 2 * p.al; put(ctx, L ? p.tint : p.warm, p.cx, p.cy, (p.R * 1.5) / 96); ctx.globalAlpha = 1; } // the one flash
      const hot = clamp(1 - tau / (L ? 6 : 11));
      for (const s of p.stars) {
        if (tau > s.end) continue;
        const e = (k) => 1 - Math.exp(-Math.max(0, k) / 9), at = (k) => [p.cx + s.dx * e(k), p.cy + s.dy * e(k) + p.g * Math.max(0, k) ** 2];
        let al = clamp(tau / 1.5 + 0.3) * (tau > s.end * 0.55 ? 1 - (tau - s.end * 0.55) / (s.end * 0.45) : 1);
        if (tau > s.end * 0.6) al *= 0.72 + 0.28 * Math.sin(tau * 1.3 + s.ph); // flickering as it burns out
        const col = [0, 1, 2].map((i) => Math.round(lerp(s.c[i], p.hot[i], hot))), [x0, y0] = at(tau - 10), [x1, y1] = at(tau - 4), [x2, y2] = at(tau);
        ctx.strokeStyle = rgba(col, 0.26 * al); ctx.lineWidth = 1.6 * lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.8 * al); ctx.lineWidth = 1.15 * lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (s.g) { ctx.globalAlpha = 0.55 * al * p.al; put(ctx, s.g, x2, y2, (lw * 10) / 96); ctx.globalAlpha = 1; } // each star burns in its own little light
        ctx.fillStyle = rgba(L ? col : shade(col, 0.5), al); ctx.beginPath(); ctx.arc(x2, y2, 1.2 * lw * (0.7 + 0.3 * (1 - tau / s.end)), 0, TAU); ctx.fill();
      }
      for (const k of p.crackle) { // glitter popping where the stars burnt out
        const d = tau - k.t;
        if (d < 0 || d > 4) continue;
        const al = (1 - d / 4) * p.al;
        if (!L) { ctx.globalAlpha = al * 0.7; put(ctx, p.warm, k.x, k.y, (lw * 7) / 96); ctx.globalAlpha = 1; }
        ctx.fillStyle = L ? `rgba(150,84,10,${al})` : `rgba(255,252,236,${al})`; ctx.beginPath(); ctx.arc(k.x, k.y, lw * 0.95 * (1 - d / 5), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  SUB.firework = (c) => {
    const { fx, P, cols, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, th = thin(fx);
    let R = ch * 3.3 * u, cx, cy;
    if (A.small) { R = Math.min(R * 1.25, fx.h * 0.4); cy = Math.min(A.y - 3, fx.h * 0.44); cx = clamp(A.x + 10, R + 3, fx.w - R - 3); } else {
      const want = A.y - ch * 4.6 * u, top = R * 0.85 + 6;
      cy = want >= top ? want : Math.max(want, Math.min(top, A.y - ch * 1.2 * u));
      if (cy - R * 0.85 < 6) R = Math.max(ch * 1.4 * u, (cy - 6) / 0.85);
      cy = Math.max(4, cy); cx = clamp(A.x, R + 6, fx.w - R - 6);
    }
    const tb = A.small ? 14 : 20, wob = (Math.random() < 0.5 ? -1 : 1) * 0.7 * u;
    const rk = (t) => { const k = ease.out(clamp(t / tb)); return [lerp(A.x, cx, k) + Math.sin(t * 0.9) * wob * (1 - k), lerp(A.y, cy, k)]; };
    const lw = Math.max(0.65, u), hotC = L ? [222, 160, 44] : [255, 244, 214], ns = Math.max(16, Math.round(54 * th)), np = Math.max(6, Math.round(16 * th));
    const stars = [], crackle = [], g = 0.006 * u;
    for (let i = 0; i < ns + np; i++) { // a sphere of stars seen from the side: some come at you and look short
      const inner = i >= ns, j = inner ? i - ns : i, m = inner ? np : ns, z = 1 - (2 * (j + 0.5)) / m, r = Math.sqrt(1 - z * z), an = j * 2.39996 + rand(-0.1, 0.1);
      const sp = R * (inner ? 0.46 : 1) * rand(0.92, 1.06), base = inner ? cols[2] : cols[i % 2];
      const s = { dx: Math.cos(an) * r * sp, dy: Math.sin(an) * r * sp, end: rand(44, 60) * (inner ? 0.8 : 1), ph: rand(0, TAU), c: L ? shade(base, -0.3) : shade(base, 0.2), g: L ? null : tint(base) };
      stars.push(s);
      if (!inner && Math.random() < 0.5 * th + 0.15) {
        for (let k = 0; k < 3; k++) { const t = s.end * rand(0.55, 0.85) + k * 2, e = 1 - Math.exp(-t / 9); crackle.push({ t, x: cx + s.dx * e + rand(-4, 4) * u, y: cy + s.dy * e + g * t * t + rand(-4, 4) * u }); }
      }
    }
    const fizz = [];
    for (let i = 0, m = Math.round(12 * th); i < m; i++) fizz.push({ t0: rand(1, tb - 2), vx: rand(-0.6, 0.6) * u, vy: rand(0.2, 1.1) * u, g: 0.03 * u, T: rand(8, 15) });
    P.push(part(tb + 62, drawShell, { rk, tb, cx, cy, R, g, u, lw, ch, stars, crackle, fizz, hot: hotC, L, al: alpha, warm: warm(), tint: tint(L ? shade(cols[0], -0.2) : cols[0]) }));
  };

  /* ==================================================================================================== */
  /* 먹물: the brush comes down on the point and goes round in one stroke, an ensō, wet and full where it  */
  /* lands and running dry into streaks at its tail; drops fly where it lands and where it flicks off.     */
  /* ==================================================================================================== */

  const E0 = Math.PI * 0.83, ESW = 5.6; // where the brush comes down (about eight o'clock) and how far round it goes, clockwise
  const ensoW = (s) => (s < 0.06 ? 0.78 + 0.22 * Math.sin((s / 0.06) * Math.PI * 0.5) : s < 0.5 ? 1 - 0.2 * ((s - 0.06) / 0.44) : 0.8 * (1 - (s - 0.5) / 0.5) ** 0.6 + 0.06);
  const ensoR = (s, v) => 1 + 0.03 * Math.sin(s * 6.1 + v * 1.7) - 0.05 * s * s;
  const brushAt = (v) => 0.03 + 0.97 * v * v * (1.6 - 0.6 * v); // slow off the mark, quickest as it flicks away
  function ensoS(v, R, W, c, L, q) {
    return sprite(`c-enso|${v}|${R}|${W}|${ck(c)}|${L}|${q}`, () => {
      const D = Math.ceil((R * 1.06 + W) * 2 + 10);
      return paint(D, D, q, (x) => {
        const Rn = rng(v * 7919 + 13), N = 120, pt = [];
        x.translate(D / 2, D / 2);
        for (let i = 0; i <= N; i++) { const s = i / N, an = E0 + ESW * s, r = R * ensoR(s, v); pt.push([Math.cos(an) * r, Math.sin(an) * r, Math.cos(an), Math.sin(an), W * ensoW(s), s]); }
        const ink = L ? shade(c, -0.52) : shade(c, 0.05), dense = L ? shade(c, -0.74) : shade(c, 0.42), pale = L ? shade(c, -0.2) : shade(c, -0.3);
        x.filter = `blur(${1.6 * q}px)`; x.strokeStyle = rgba(ink, 0.2); x.lineWidth = W * 1.25; // ink seeping into the paper round the wet part
        x.beginPath(); for (let i = 0; i <= N * 0.7; i++) { const [px, py] = pt[i]; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
        x.filter = 'none';
        const M = Math.round(N * 0.66), body = new Path2D(), hw = (i) => pt[i][4] * 0.5 * clamp((0.66 - pt[i][5]) / 0.12) * (1 + (Rn() - 0.5) * 0.1);
        for (let i = 0; i <= M; i++) { const [px, py, nx, ny] = pt[i], h = hw(i); if (i) body.lineTo(px + nx * h, py + ny * h); else body.moveTo(px + nx * h, py + ny * h); }
        for (let i = M; i >= 0; i--) { const [px, py, nx, ny] = pt[i], h = hw(i); body.lineTo(px - nx * h, py - ny * h); }
        body.closePath();
        x.fillStyle = rgba(ink, L ? 0.88 : 0.76); x.fill(body);
        x.strokeStyle = rgba(dense, L ? 0.7 : 0.8); x.lineWidth = 0.9; x.stroke(body); // the ink pooling at its edges
        x.lineCap = 'butt'; x.globalCompositeOperation = 'destination-out'; // the ink thinning as the brush gives it up (round the circle, so a conic ramp)
        const thinning = x.createConicGradient(E0, 0, 0), at = (s) => (s * ESW) / TAU;
        thinning.addColorStop(0, 'rgba(0,0,0,0)'); thinning.addColorStop(at(0.22), 'rgba(0,0,0,0)'); thinning.addColorStop(at(0.62), 'rgba(0,0,0,0.3)'); thinning.addColorStop(1, 'rgba(0,0,0,0.3)');
        x.strokeStyle = thinning; x.lineWidth = W * 1.4;
        x.beginPath(); for (let i = Math.round(N * 0.2); i <= M; i++) { const [px, py] = pt[i]; if (i > Math.round(N * 0.2)) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
        x.globalCompositeOperation = 'source-over';
        for (let k = 0, KB = 8; k < KB; k++) { // the hairs: solid while there is ink, then streaks and gaps as the brush runs dry
          const off = (k + 0.5) / KB - 0.5 + (Rn() - 0.5) * 0.04, end = 0.74 + (1 - Math.abs(off) * 2) * 0.24 + (Rn() - 0.5) * 0.1, fr = 26 + Rn() * 36, ph = Rn() * TAU;
          x.strokeStyle = rgba(Rn() < 0.35 ? dense : ink, 1);
          for (let i = Math.round(N * 0.42); i < N; i++) {
            const [ax, ay, anx, any, aw, as] = pt[i], [bx, by, bnx, bny, bw] = pt[i + 1];
            let al = clamp((end - as) / 0.06) * clamp((as - 0.42) / 0.12);
            if (as > 0.58 && Math.sin(as * fr + ph) < 0.5 - (as - 0.58) * 2.2) al *= 0.08; // more of the hair goes dry toward the end
            if (al < 0.03) continue;
            x.globalAlpha = al * (L ? 0.94 : 0.9); x.lineWidth = Math.max(0.6, (aw / KB) * 1.45);
            x.beginPath(); x.moveTo(ax + anx * off * aw, ay + any * off * aw); x.lineTo(bx + bnx * off * bw, by + bny * off * bw); x.stroke();
          }
        }
        x.globalAlpha = 1; x.lineCap = 'round';
        x.strokeStyle = L ? 'rgba(255,255,255,0.28)' : rgba(shade(c, 0.6), 0.32); x.lineWidth = Math.max(0.6, W * 0.14); // a wet sheen along the inside of the wet part
        x.beginPath(); for (let i = 3; i <= N * 0.5; i++) { const [px, py, nx, ny, w] = pt[i]; if (i > 3) x.lineTo(px - nx * w * 0.22, py - ny * w * 0.22); else x.moveTo(px - nx * w * 0.22, py - ny * w * 0.22); } x.stroke();
        x.lineWidth = 0.45;
        for (let k = 0; k < 5; k++) { // hair lines through the wet part
          const off = (Rn() - 0.5) * 0.7;
          x.strokeStyle = rgba(k % 2 ? dense : pale, 0.55); x.lineWidth = k % 2 ? 0.45 : 0.7; x.beginPath();
          for (let i = 2; i <= M - 6; i++) { const [px, py, nx, ny, w] = pt[i]; if (i > 2) x.lineTo(px + nx * off * w, py + ny * off * w); else x.moveTo(px + nx * off * w, py + ny * off * w); }
          x.stroke();
        }
        const [sx, sy] = pt[0], blot = new Path2D(); // where the brush came down: fuller, uneven
        for (let i = 0; i <= 16; i++) { const an = (i / 16) * TAU, r = W * 0.62 * (0.86 + Rn() * 0.28); if (i) blot.lineTo(sx + Math.cos(an) * r, sy + Math.sin(an) * r); else blot.moveTo(sx + Math.cos(an) * r, sy + Math.sin(an) * r); }
        x.fillStyle = rgba(ink, L ? 0.92 : 0.86); x.fill(blot); x.strokeStyle = rgba(dense, 0.5); x.stroke(blot);
      });
    });
  }
  function drawEnso(ctx, p) {
    const a = p.age++, v = clamp(a / p.dur), s = brushAt(v);
    const al = (a < p.hold ? 1 : 1 - ease.smooth((a - p.hold) / (p.T - p.hold))) * p.al;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.save();
    if (v < 1) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.R * 2, E0 - 0.4, E0 + ESW * s); ctx.closePath(); ctx.clip(); }
    const sc = 1 + 0.025 * ease.out(clamp((a - p.hold) / 30)); // it spreads a touch as it dries
    ctx.drawImage(p.sp.c, (-p.sp.w / 2) * sc, (-p.sp.h / 2) * sc, p.sp.w * sc, p.sp.h * sc);
    ctx.restore();
    if (v < 1) { // the loaded tip of the brush
      const an = E0 + ESW * s, r = p.R * ensoR(s, p.v), w = p.W * ensoW(s);
      ctx.fillStyle = p.tip; ctx.translate(Math.cos(an) * r, Math.sin(an) * r); ctx.rotate(an + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(w * 0.12, 0, w * 0.56, w * 0.46, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawInkDrops(ctx, p, fx) {
    const a = p.age++, fade = (a < p.hold ? 1 : 1 - ease.smooth((a - p.hold) / (p.T - p.hold))) * p.al;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (const d of p.d) {
      const k = a - d.t0;
      if (k < 0) continue;
      const f = 0.84 ** k, m = (1 - f) / 0.16, x = d.x + d.vx * m, y = d.y + d.vy * m, st = 1 + Math.min(1.5, f * Math.hypot(d.vx, d.vy) * 0.35); // drawn out while it flies
      ctx.globalAlpha = fade * clamp(k / 1.5 + 0.4) * inside(fx, x, y, 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.an);
      ctx.fillStyle = p.ink; ctx.beginPath(); ctx.ellipse(0, 0, d.s * st, d.s / Math.sqrt(st), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.sheen; ctx.beginPath(); ctx.arc(-d.s * 0.2, -d.s * 0.3, d.s * 0.32, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  SUB.ink = (c) => {
    const { fx, P, cols, ch, L } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx), col = cols[0];
    let R = Math.round(ch * 1.3 * u), W = Math.round(ch * 0.42 * u * 2) / 2;
    if (A.small) { R = Math.round(fx.h * 0.3); W = Math.round(R * 0.6) / 2; }
    R = Math.max(6, R); W = Math.max(1.5, W);
    const v = (Math.random() * 4) | 0, rot = rand(-0.3, 0.3), dur = 24, hold = 34, T = 72, m0 = R + W * 0.7 + 2;
    // the brush comes down on the point and goes round from there: the circle stands up and to the right of it, off the text
    const x = clamp(A.x - Math.cos(E0 + rot) * R * ensoR(0, v), m0, fx.w - m0), y = clamp(A.y - Math.sin(E0 + rot) * R * ensoR(0, v), m0, fx.h - m0);
    const ink = rgba(L ? shade(col, -0.55) : shade(col, 0.08), L ? 0.92 : 0.86);
    P.push(part(T, drawEnso, { x, y, R, W, v, rot, dur, hold, al: 1, sp: ensoS(v, R, W, col, L, q), tip: rgba(L ? shade(col, -0.62) : shade(col, 0.12), 0.95) }));
    const world = (s, d = 0) => { const an = E0 + ESW * s + rot, r = R * ensoR(s, v) + d; return [x + Math.cos(an) * r, y + Math.sin(an) * r, an]; };
    const d = [], m = Math.max(2, Math.round(7 * thin(fx)));
    for (let i = 0; i < m; i++) {
      const flick = i >= m - 3, s = flick ? 0.97 : 0.01, [px, py, an] = world(s), sp = (flick ? rand(2.2, 3.6) : rand(1.4, 3.4)) * u;
      const dir = flick ? an + Math.PI / 2 + rand(-0.25, 0.25) : an + rand(-1.2, 1.2) + (Math.random() < 0.35 ? Math.PI : 0); // thrown out from where the brush lands; flung on round off its tail
      d.push({ x: px, y: py, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, an: dir, s: rand(0.7, flick ? 1.4 : 2) * Math.max(0.6, u), t0: flick ? dur - 2 : rand(0, 2) });
    }
    P.push(part(T, drawInkDrops, { d, hold, al: 1, ink, sheen: L ? 'rgba(255,255,255,0.35)' : rgba(shade(col, 0.6), 0.55) }));
  };

  /* ==================================================================================================== */
  /* 눈송이: a six-armed crystal grows out from the point, branch by branch, catches the light, cracks and  */
  /* breaks apart, and fine flakes drift down from it.                                                     */
  /* ==================================================================================================== */

  /** One arm of a dendrite along +x in units of its length: the spine, side branches at sixty degrees, twigs off them parallel to the arm. */
  function armSegs(v) {
    const Rn = rng(v * 131 + 17), segs = [[0.15, 0, 1, 0]];
    for (const [d0, l0] of [[0.3, 0.19], [0.45, 0.3], [0.6, 0.27], [0.74, 0.19], [0.86, 0.1]]) {
      const d = d0 + (Rn() - 0.5) * 0.04, l = l0 * (0.8 + Rn() * 0.4);
      for (const sg of [-1, 1]) {
        const ex = d + l * 0.5, ey = sg * l * 0.866;
        segs.push([d, 0, ex, ey]);
        if (l > 0.16) for (const f of [0.45, 0.78]) { const tx = d + (ex - d) * f, ty = ey * f; segs.push([tx, ty, tx + l * 0.3 * (1 - f * 0.5), ty]); }
      }
    }
    return segs;
  }
  function traceXtal(x, segs, R) {
    x.beginPath();
    for (let k = 0; k < 6; k++) {
      const cs = Math.cos((k * TAU) / 6), sn = Math.sin((k * TAU) / 6);
      for (const [x0, y0, x1, y1] of segs) { x.moveTo((x0 * cs - y0 * sn) * R, (x0 * sn + y0 * cs) * R); x.lineTo((x1 * cs - y1 * sn) * R, (x1 * sn + y1 * cs) * R); }
    }
  }
  /** The cold light round a crystal (dark mode), kept apart so the crystal itself can grow crisp out of it. */
  const xtalGlowS = (v, R, q) => sprite(`c-xglow|${v}|${R}|${q}`, () => paint(R * 2 + 14, R * 2 + 14, q, (x) => {
    x.translate(R + 7, R + 7); x.filter = `blur(${2 * q}px)`;
    x.strokeStyle = 'rgba(110,170,255,0.9)'; x.lineWidth = Math.max(0.8, R * 0.045) * 3.2; traceXtal(x, armSegs(v), R); x.stroke();
    x.beginPath(); for (let k = 0; k < 6; k++) x.lineTo(Math.cos((k * TAU) / 6) * R * 0.21, Math.sin((k * TAU) / 6) * R * 0.21); x.closePath(); x.fillStyle = 'rgba(110,170,255,0.6)'; x.fill();
  }));
  function crystalS(v, R, L, q) {
    return sprite(`c-xtal|${v}|${R}|${L}|${q}`, () => paint(R * 2 + 14, R * 2 + 14, q, (x) => {
      const segs = armSegs(v), trace = () => traceXtal(x, segs, R);
      x.translate(R + 7, R + 7);
      const hex = (r) => { x.beginPath(); for (let k = 0; k < 6; k++) x.lineTo(Math.cos((k * TAU) / 6) * r, Math.sin((k * TAU) / 6) * r); x.closePath(); };
      const W = Math.max(0.8, R * 0.045);
      for (let k = 0; k < 6; k++) { // each arm a thin prism: one face catching the light, the other in shade
        x.save(); x.rotate((k * TAU) / 6);
        const w = R * 0.07;
        x.fillStyle = L ? 'rgba(170,206,245,0.95)' : 'rgba(225,242,255,0.55)'; x.beginPath(); x.moveTo(R * 0.15, 0); x.lineTo(R * 0.55, -w); x.lineTo(R, 0); x.closePath(); x.fill();
        x.fillStyle = L ? 'rgba(66,120,190,0.9)' : 'rgba(110,160,235,0.45)'; x.beginPath(); x.moveTo(R * 0.15, 0); x.lineTo(R * 0.55, w); x.lineTo(R, 0); x.closePath(); x.fill();
        x.restore();
      }
      x.strokeStyle = L ? 'rgba(52,104,178,0.95)' : 'rgba(176,216,255,0.95)'; x.lineWidth = W * 1.3; trace(); x.stroke();
      x.strokeStyle = L ? 'rgba(226,240,255,0.95)' : 'rgba(255,255,255,0.95)'; x.lineWidth = W * 0.5; trace(); x.stroke();
      const g = x.createLinearGradient(-R * 0.2, -R * 0.2, R * 0.2, R * 0.2); // the plate at its heart, faceted
      g.addColorStop(0, L ? 'rgba(206,230,255,0.98)' : 'rgba(244,251,255,0.9)'); g.addColorStop(1, L ? 'rgba(62,118,192,0.95)' : 'rgba(120,172,240,0.6)');
      hex(R * 0.2); x.fillStyle = g; x.fill(); x.strokeStyle = L ? 'rgba(40,90,160,0.9)' : 'rgba(200,230,255,0.9)'; x.lineWidth = W * 0.8; x.stroke();
      x.beginPath(); for (let k = 0; k < 6; k++) { x.moveTo(0, 0); x.lineTo(Math.cos((k * TAU) / 6) * R * 0.2, Math.sin((k * TAU) / 6) * R * 0.2); }
      x.strokeStyle = L ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.6)'; x.lineWidth = W * 0.45; x.stroke();
      hex(R * 0.1); x.stroke();
      for (let k = 0; k < 6; k++) { // a little spearhead at each tip
        x.save(); x.rotate((k * TAU) / 6); x.fillStyle = L ? 'rgba(52,104,178,0.95)' : 'rgba(236,246,255,0.95)';
        x.beginPath(); x.moveTo(R * 1.04, 0); x.lineTo(R * 0.93, -R * 0.045); x.lineTo(R * 0.89, 0); x.lineTo(R * 0.93, R * 0.045); x.closePath(); x.fill(); x.restore();
      }
    }));
  }
  /** A fine flake: a star with spurs half way, a plain star, or one with spurs near the tips. 16 px, radius about 7. */
  const flakeS = (v, L, q) => sprite(`c-flake|${v}|${L}|${q}`, () => paint(16, 16, q, (x) => {
    x.translate(8, 8);
    const trace = () => {
      x.beginPath();
      for (let k = 0; k < 6; k++) {
        const an = (k * TAU) / 6, cs = Math.cos(an), sn = Math.sin(an), at = v === 2 ? 4.8 : 3.6, l = v === 2 ? 1.6 : 2.2;
        x.moveTo(0, 0); x.lineTo(cs * 6.4, sn * 6.4);
        if (v !== 1) for (const d of [-1, 1]) { x.moveTo(cs * at, sn * at); x.lineTo(cs * at + Math.cos(an + d * 1.05) * l, sn * at + Math.sin(an + d * 1.05) * l); }
      }
    };
    if (!L) { x.filter = `blur(${1.2 * q}px)`; x.strokeStyle = 'rgba(130,185,255,0.9)'; x.lineWidth = 2.6; trace(); x.stroke(); x.filter = 'none'; }
    x.strokeStyle = L ? 'rgba(52,104,178,0.95)' : 'rgba(200,228,255,0.95)'; x.lineWidth = 1.3; trace(); x.stroke();
    x.strokeStyle = L ? 'rgba(230,242,255,0.95)' : '#fff'; x.lineWidth = 0.5; trace(); x.stroke();
  }));
  function drawCrystal(ctx, p) {
    const a = p.age++, L = p.L, R = p.R, sp = p.sp, SH = p.sh;
    ctx.save();
    if (a < SH) {
      const g = ease.out(clamp(a / 18)), r = R * 1.12 * g + 0.5, sc = 0.84 + 0.16 * ease.back(clamp(a / 18));
      const cx = p.x0 + (p.x - p.x0) * g, cy = p.y0 + (p.y - p.y0) * g; // it starts on the point and grows out to the side of the text
      if (!L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.32 * g * p.al; put(ctx, p.frost, cx, cy, (R * 3.2) / 96); }
      ctx.translate(cx, cy); ctx.rotate(p.rot - (1 - g) * 0.5); ctx.scale(sc, sc);
      if (p.glow) { ctx.globalAlpha = g * p.al; put(ctx, p.glow, 0, 0, Math.max(0.05, g)); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.save(); // it grows out along its arms: a hexagon, corners on the arms, widening
      ctx.beginPath(); for (let k = 0; k < 6; k++) ctx.lineTo(Math.cos((k * TAU) / 6) * r, Math.sin((k * TAU) / 6) * r); ctx.closePath(); ctx.clip();
      ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
      const gl = Math.sin(Math.PI * clamp((a - 15) / 17)); // it catches the light
      if (gl > 0) {
        if (!L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * gl * p.al; ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); }
        ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = gl;
        put(ctx, p.glint, Math.cos(-Math.PI / 3) * R * 0.97, Math.sin(-Math.PI / 3) * R * 0.97, (R * 0.95 * (0.45 + 0.55 * gl)) / 32, a * 0.05);
      }
      const cr = clamp((a - (SH - 6)) / 6); // cracks run out just before it breaks
      if (cr > 0) {
        ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = 1; ctx.strokeStyle = L ? 'rgba(30,76,150,0.9)' : 'rgba(236,248,255,0.95)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = ((k + 0.5) * TAU) / 6; ctx.moveTo(Math.cos(an) * R * 0.1, Math.sin(an) * R * 0.1); ctx.lineTo(Math.cos(an) * R * (0.1 + 0.85 * cr), Math.sin(an) * R * (0.1 + 0.85 * cr)); } ctx.stroke();
      }
    } else { // six shards, each an arm, flying apart and falling
      const k = a - SH, e = ease.out(clamp(k / 20)), al = 1 - ease.smooth(clamp(k / 18));
      if (al > 0.01) {
        ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = al;
        for (let i = 0; i < 6; i++) {
          const an = (i * TAU) / 6 + p.rot, d = R * 0.65 * e;
          ctx.save();
          ctx.translate(p.x + Math.cos(an) * d, p.y + Math.sin(an) * d + 0.002 * R * k * k); ctx.rotate(p.rot + p.spin[i] * k); ctx.scale(1 - 0.35 * e, 1 - 0.35 * e);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 1.2, ((i - 0.5) * TAU) / 6, ((i + 0.5) * TAU) / 6); ctx.closePath(); ctx.clip();
          ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
  function drawFlake(ctx, p, fx) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    p.vx *= 0.95; p.vy = p.vy * 0.95 + p.fall * 0.05; p.ph += p.w;
    p.x += p.vx + Math.sin(p.ph) * p.sway; p.y += p.vy; p.rot += p.vr;
    const al = clamp(a / 3) * (t > 0.55 ? 1 - ease.smooth((t - 0.55) / 0.45) : 1) * (0.78 + 0.22 * Math.sin(p.ph * 2.3)) * inside(fx, p.x, p.y, 4);
    if (al < 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    put(ctx, p.sp, p.x, p.y, p.s / 7, p.rot);
    ctx.restore();
  }
  SUB.snowflake = (c) => {
    const { fx, P, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx), th = thin(fx);
    let R = Math.round(ch * 1.5 * u);
    if (A.small) R = Math.min(R, Math.round(fx.h * 0.42));
    R = Math.max(7, R);
    const SH = 36, rot = rand(-0.2, 0.2), x = A.small ? A.x : Math.min(A.x + R * 0.55, fx.w - R - 4), y = A.small ? A.y : Math.max(A.y - R * 0.2, R + 4);
    const v = (Math.random() * 3) | 0;
    P.push(part(SH + 20, drawCrystal, { x0: A.x, y0: A.y, x, y, R, rot, sh: SH, L, al: alpha, sp: crystalS(v, R, L, q), glow: L ? null : xtalGlowS(v, R, q), frost: frost(), glint: glintS([200, 228, 255], L, q), spin: Array.from({ length: 6 }, () => rand(-0.03, 0.03)) }));
    for (let i = 0, m = Math.max(6, Math.round(26 * th)); i < m; i++) { // fine flakes shaken out of it
      const an = ((i % 6) * TAU) / 6 + rot + rand(-0.3, 0.3), d = R * rand(0.2, 1), sp = rand(0.5, 1.7) * u, T = SH + Math.round(rand(46, 66) * (A.small ? 0.8 : 1));
      P.push(part(T, drawFlake, { wait: SH - 1, x: x + Math.cos(an) * d, y: y + Math.sin(an) * d, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 0.4 * u, fall: rand(0.25, 0.5) * u, ph: rand(0, TAU), w: rand(0.05, 0.1), sway: rand(0.15, 0.4) * u, rot: rand(0, TAU), vr: rand(-0.05, 0.05), s: rand(2.4, 5.2) * Math.max(0.55, u), sp: flakeS(i % 3, L, q) }));
    }
    motes(P, { x, y, n: Math.round(10 * th), spread: R * 1.3, size: ch * 0.4 * u, T: 26, wait: SH - 1, up: 0, fall: ch * 0.4 * u, L, col: 'rgba(52,104,178,0.9)', g: frost(), al: alpha });
  };

  /* ==================================================================================================== */
  /* 글자 파편: the submitted characters leap off the line one after another, from the last one at the     */
  /* point, tumble and fall away.                                                                          */
  /* ==================================================================================================== */

  const LFONT = "'Cascadia Mono', Consolas, Menlo, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Segoe UI Symbol', monospace";
  const BIG = 1.5; // how much a character grows as it leaps: its piece is painted at that size
  const SPARE = ['↵', '✦', '♪', '★', '#', '&', '!', '?']; // when there is no text to throw
  /** A character as a little solid piece: extruded in a deep shade, the face lit from above, a fine rim. */
  function chipS(g, c, fs, L, q) {
    return sprite(`c-chip|${g}|${ck(c)}|${fs}|${L}|${q}`, () => {
      const W = Math.ceil(fs * (WIDE.test(g) ? 1.2 : 0.8) + 12), H = Math.ceil(fs * 1.3 + 12);
      return paint(W, H, q, (x) => {
        x.font = `700 ${fs}px ${LFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const cx = W / 2 - 0.6, cy = H / 2 - 0.6, deep = shade(c, L ? -0.68 : -0.58);
        const dz = clamp(fs / 22, 0.35, 1); // the depth, less on a small piece
        for (let i = fs < 14 ? 2 : 4; i >= 1; i--) { x.fillStyle = rgba(shade(deep, -0.12 * i), 1); x.fillText(g, cx + i * 0.7 * dz, cy + i * 0.85 * dz); }
        const gr = x.createLinearGradient(0, cy - fs * 0.5, 0, cy + fs * 0.5);
        gr.addColorStop(0, rgba(shade(c, L ? 0.2 : 0.72), 1)); gr.addColorStop(0.5, rgba(L ? shade(c, -0.18) : c, 1)); gr.addColorStop(1, rgba(shade(c, L ? -0.42 : -0.18), 1));
        x.fillStyle = gr; x.fillText(g, cx, cy);
        x.lineWidth = 0.8; x.strokeStyle = L ? rgba(shade(c, -0.75), 0.55) : 'rgba(255,255,255,0.42)'; x.strokeText(g, cx, cy);
      });
    });
  }
  function drawLetter(ctx, p, fx) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const PRE = 4, t = a / (p.T - p.wait);
    let x = p.x, y = p.y, sx = 1, sy = 1, rot = 0, flip = 1, pop = 1;
    if (a < PRE) { const k = Math.sin((a / PRE) * Math.PI * 0.5); sx = 1 + 0.16 * k; sy = 1 - 0.24 * k; y += p.s * 0.1 * k; } // crouching for the jump
    else {
      const k = a - PRE, vy = p.vy + p.g * k, st = clamp(Math.abs(vy) / 6) * 0.14;
      x += (p.vx * (1 - 0.985 ** k)) / 0.015; y += p.vy * k + 0.5 * p.g * k * k;
      rot = p.vr * k; pop = 1 + 0.5 * ease.out(clamp(k / 9)); sy = 1 + st; sx = 1 - st * 0.5;
      if (p.vf) { const f = Math.cos(p.vf * k); flip = Math.sign(f || 1) * (0.25 + 0.75 * Math.abs(f)); } // tumbling over
    }
    ctx.save();
    const rk = (a - PRE) / 12; // a ring on the line where it sprang from
    if (rk > 0 && rk < 1) {
      ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.globalAlpha = (1 - rk) * 0.75 * p.al; ctx.strokeStyle = p.ring; ctx.lineWidth = 1.2 * (1 - rk) + 0.3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.s * 0.42, p.s * (0.25 + 0.65 * ease.out(rk)), p.s * (0.08 + 0.18 * ease.out(rk)), 0, 0, TAU); ctx.stroke();
    }
    const al = (t > 0.62 ? 1 - ease.smooth((t - 0.62) / 0.38) : 1) * inside(fx, x, y, p.s * 0.5);
    if (al > 0.01) {
      if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.26 * al * p.al; put(ctx, p.glow, x, y, (p.s * 2.4 * pop) / 96); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale((sx * flip * pop) / BIG, (sy * pop) / BIG);
      ctx.drawImage(p.sp.c, -p.sp.w / 2, -p.sp.h / 2, p.sp.w, p.sp.h);
    }
    ctx.restore();
  }
  SUB.letters = (c) => {
    const { fx, P, cols, cw, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx), th = thin(fx);
    const fs = Math.max(7, Math.round(ch * 0.8 * (A.small ? 0.7 : Math.min(1.15, c.sz)))), max = Math.max(3, Math.round(10 * th)), list = [];
    let right = A.x - cw / 2; // the right edge of the last character
    const chars = [...(A.text || '')];
    for (let i = chars.length - 1; i >= 0 && list.length < max && right > 0; i--) {
      const g = chars[i], w = (WIDE.test(g) ? 2 : 1) * cw;
      if (g.trim()) list.push([g, right - w / 2, false]);
      right -= w;
    }
    if (!list.length) SPARE.slice(0, max).forEach((g) => list.push([g, A.x, true]));
    const uv = A.small ? 0.45 : Math.max(0.7, u), grav = 0.22 * uv, room = Math.max(ch * 0.9, A.y - fs * 0.7); // no higher than there is room above the line
    list.forEach(([g, gx, spare], i) => {
      const col = cols[i % 3], side = i % 2 ? 1 : -1, wait = i * 3;
      P.push(part(wait + 4 + Math.round(rand(52, 62)), drawLetter, {
        wait, x: gx, y: A.y, s: fs, vy: -Math.min(rand(3.6, 5) * uv, Math.sqrt(2 * grav * room) * rand(0.85, 1)), g: grav, vx: (spare ? side * rand(0.6, 1.8) : rand(-1.4, 1.4)) * uv * (A.small ? 1.6 : 1), vr: rand(-0.09, 0.09), vf: i % 2 ? rand(0.08, 0.14) : 0,
        L, al: alpha, ring: rgba(L ? shade(col, -0.45) : shade(col, 0.3), 1), glow: L ? null : tint(col), sp: chipS(g, col, Math.round(fs * BIG), L, q),
      }));
    });
  };

  /* ==================================================================================================== */
  /* 검기: two crescent blades cross at the point; a beat later a fine white cut shows along each, a spark */
  /* flares where they meet, and its two halves slide apart along the cut.                                */
  /* ==================================================================================================== */

  const BOW = 0.095; // how far the middle of a crescent stands off its chord, as a share of its length
  /** The crescent a blade leaves: a hot edge on the outside of the curve fading to nothing inside. Chord along x. */
  function bladeS(c, L, len, q) {
    return sprite(`c-blade|${ck(c)}|${L}|${len}|${q}`, () => {
      const top = Math.ceil(len * 0.14 + 5), s = paint(len + 10, top + 6, q, (x) => {
        x.translate(5 + len / 2, top);
        const curve = (k) => { x.beginPath(); x.moveTo(-len / 2, 0); x.quadraticCurveTo(0, -k * len, len / 2, 0); };
        if (!L) { x.filter = `blur(${3 * q}px)`; x.beginPath(); x.moveTo(-len / 2, 0); x.quadraticCurveTo(0, -0.27 * len, len / 2, 0); x.quadraticCurveTo(0, -0.12 * len, -len / 2, 0); x.fillStyle = rgba(c, 0.8); x.fill(); x.filter = 'none'; }
        const N = 14, wd = ((0.15 * len) / 2 / N) * 1.9;
        for (let j = N; j >= 0; j--) {
          const f = j / N, col = f < 0.12 ? (L ? shade(c, -0.6) : [255, 255, 255]) : f < 0.3 ? shade(c, L ? -0.35 : 0.55) : L ? shade(c, -0.1) : c;
          x.strokeStyle = rgba(col, (f < 0.5 ? 1 : 1 - (f - 0.5) / 0.5) * (L ? 0.9 : 0.85)); x.lineWidth = wd; curve(lerp(0.26, 0.12, f)); x.stroke();
        }
        x.strokeStyle = L ? rgba(shade(c, -0.7), 1) : '#fff'; x.lineWidth = 1; curve(0.265); x.stroke();
      });
      s.top = top; s.ox = 5 + len / 2;
      return s;
    });
  }
  function drawCross(ctx, p) {
    const a = p.age++, L = p.L, len = p.len, half = len / 2;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    for (const b of p.blades) { // the blades, sweeping through
      const k = a - b.t0;
      if (k < 0 || k > 24) continue;
      const hp = ease.out(clamp(k / 6)), tp = ease.in(clamp((k - 2) / 13)), al = k < 9 ? 1 : 1 - ease.smooth((k - 9) / 15);
      const xh = -half + len * hp * 1.04, xt = -half + len * tp;
      if (xh - xt < 1 || al < 0.01) continue;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(b.ang); ctx.scale(1, b.fy * (1 - 0.4 * clamp((k - 6) / 14))); ctx.translate(0, len * BOW);
      ctx.beginPath(); ctx.rect(xt, -len * 0.3, xh - xt, len * 0.4); ctx.clip();
      ctx.globalAlpha = al; ctx.drawImage(p.blade.c, -p.blade.ox, -p.blade.top, p.blade.w, p.blade.h);
      ctx.restore();
      if (k < 8 && p.flare) { // the bright head of the stroke
        const v = clamp(xh / len + 0.5), hy = (BOW - 0.52 * v * (1 - v)) * len * b.fy, cs = Math.cos(b.ang), sn = Math.sin(b.ang);
        ctx.globalAlpha = (1 - k / 8) * p.al; put(ctx, p.flare, p.x + xh * cs - hy * sn, p.y + xh * sn + hy * cs, (p.ch * 1.5 * p.u) / 96);
      }
    }
    for (const b of p.blades) { // the cut left hanging in the air: it shows, holds, then parts and fades
      const k = a - p.cut - b.t0 * 0.5;
      if (k < 0 || k > 30) continue;
      const hl = len * 0.56 * ease.out(clamp(k / 4)), sep = k > 10 ? ease.out(clamp((k - 10) / 14)) * 1.8 * p.lw : 0, al = k < 10 ? 1 : 1 - ease.smooth((k - 10) / 20);
      const cs = Math.cos(b.ang), sn = Math.sin(b.ang), nx = -sn, ny = cs;
      for (const d of sep ? [-1, 1] : [0]) {
        const ox = p.x + nx * sep * d, oy = p.y + ny * sep * d, x0 = ox - cs * hl, y0 = oy - sn * hl, x1 = ox + cs * hl, y1 = oy + sn * hl;
        for (const [col, w, f] of [[p.cutGlow, 3 * p.lw, 0.35 * p.al], [p.cutCore, 0.9, 1]]) {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.3, rgba(col, al * f)); g.addColorStop(0.7, rgba(col, al * f)); g.addColorStop(1, rgba(col, 0));
          ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      }
    }
    for (const s of p.sparks) { // steel sparks off the crossing
      const k = a - s.t0;
      if (k < 0 || k > s.T) continue;
      const at = (kk) => { const m = (1 - 0.88 ** Math.max(0, kk)) / 0.12; return [p.x + s.vx * m, p.y + s.vy * m + 0.03 * kk * kk * p.u]; };
      const [x0, y0] = at(k - 2), [x1, y1] = at(k), al = 1 - k / s.T;
      ctx.globalAlpha = 1; ctx.strokeStyle = rgba(L ? p.deep : k < 4 ? [255, 255, 255] : p.lite, al); ctx.lineWidth = 0.9 * p.lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    const sk = a - p.spark; // the spark where the blades meet, then cut in two
    if (sk >= 0) {
      if (sk < 9 && p.flash) { ctx.globalAlpha = 0.55 * (1 - sk / 9) ** 2 * p.al; put(ctx, p.flash, p.x, p.y, (p.ch * 3.6 * p.u) / 96); }
      const S = p.ss, b = p.blades[0], cs = Math.cos(b.ang), sn = Math.sin(b.ang), split = sk - (p.split - p.spark);
      if (split < 0) { ctx.globalAlpha = 1; put(ctx, p.glint, p.x, p.y, (ease.back(clamp(sk / 5)) * S) / 32, b.ang + 0.35 + sk * 0.02); } else {
        const e = ease.out(clamp(split / 16)), al = 1 - ease.smooth(clamp((split - 4) / 16));
        if (al > 0.01) {
          for (const d of [-1, 1]) {
            ctx.save();
            ctx.translate(p.x + d * (cs - 0.2 * sn) * e * p.slide, p.y + d * (sn + 0.2 * cs) * e * p.slide); ctx.rotate(b.ang + d * 0.14 * e);
            ctx.beginPath(); ctx.rect(-S, d < 0 ? -S : 0, S * 2, S); ctx.clip();
            ctx.globalAlpha = al; ctx.drawImage(p.glint.c, -S / 2, -S / 2, S, S);
            ctx.globalAlpha = al * (1 - e * 0.6); ctx.strokeStyle = rgba(p.cutCore, 1); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-S * 0.42, 0); ctx.lineTo(S * 0.42, 0); ctx.stroke(); // the cut face
            ctx.restore();
          }
        }
      }
    }
    ctx.restore();
  }
  SUB.slash = (c) => {
    const { fx, P, cols, ch, L, alpha } = c, A = anchor(c), u = c.sz * A.fit, q = scaleOf(fx), col = cols[0];
    const tilt = rand(-0.12, 0.12), A0 = 0.72;
    let len = Math.round(ch * 5.2 * u);
    if (A.small) len = Math.min(len, Math.round((fx.h - 4) / Math.sin(A0 + 0.12)));
    const x = A.small ? clamp(A.x, len * 0.4, fx.w - len * 0.4) : A.x, y = A.y, swap = Math.random() < 0.5;
    const blades = [{ ang: A0 + tilt, fy: 1, t0: 0 }, { ang: Math.PI - A0 + tilt, fy: -1, t0: 4 }];
    if (swap) blades.reverse().forEach((b, i) => { b.t0 = i * 4; });
    const sparks = [];
    for (let i = 0, m = Math.max(4, Math.round(10 * thin(fx))); i < m; i++) { const b = blades[i % 2], an = b.ang + (i % 4 < 2 ? 0 : Math.PI) + rand(-0.35, 0.35), sp = rand(2, 4.2) * u; sparks.push({ vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t0: 5 + rand(0, 4), T: rand(10, 16) }); }
    P.push(part(48, drawCross, {
      x, y, len, u, ch, lw: Math.max(0.65, u), blades, sparks, cut: 11, spark: 5, split: 15, ss: Math.round(ch * 1.8 * u), slide: ch * 1.7 * u, L, al: alpha,
      blade: bladeS(col, L, len, q), glint: glintS(L ? col : shade(col, 0.2), L, q), flare: L ? null : tint(col), flash: L ? null : tint(col),
      cutCore: L ? shade(col, -0.65) : [255, 255, 255], cutGlow: L ? shade(col, -0.1) : shade(col, 0.3), deep: shade(col, -0.5), lite: shade(col, 0.5),
    }));
  };
})();
