'use strict';
/*
 * Submit (Enter) flourishes, group a (see fx/kit.js for the contract):
 *   글로우  the caret swells into a soft light, then a band of it runs back along the submitted text
 *   물결    a drop falls on the caret: rings spread over the surface in perspective, a crown splashes up
 *   충격파  one small flash, a ring with a hot front and a warped band behind it, a blast racing along the row
 *   파티클  particles rush in to the caret, pack into a bright core and burst out in a clean ring
 *   스파크  a sparkler fizzes at the caret for a moment, throwing long sparks that fork
 *   별빛    a shooting star arcs up off the caret over a twinkling trail; a five-point star flares where it stops
 *   픽셀    an 8-bit coin, heart or tick builds itself out of flying pixels, flashes once and breaks up again
 * Each starts at the last input position (FXKit.anchor) and is a single particle that draws its whole piece:
 * pictures are cached sprites, and the counts thin out when the layer is already busy.
 */
(function () {
  const { TAU, sprite, paint, put, part, clamp, ease, rand, scaleOf, glow, rgba, shade, anchor, thin } = window.FXKit;
  const FXS = window.FX_SUBMIT;
  const key = (c) => c.join(',');
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  /** A 96 px light sprite stretched over the ellipse rx × ry around (x, y). */
  const orb = (ctx, s, x, y, rx, ry = rx) => ctx.drawImage(s.c, x - rx, y - ry, rx * 2, ry * 2);
  /** A soft light in an accent colour: a hot centre for a dark stage ('lighter'), a deeper tint for a light page ('source-over'). */
  const soft = (col, L) => (L
    ? glow(`saL|${key(col)}`, [[0, rgba(shade(col, -0.3), 0.62)], [0.3, rgba(shade(col, -0.18), 0.3)], [0.65, rgba(shade(col, -0.1), 0.08)], [1, rgba(col, 0)]])
    : glow(`saD|${key(col)}`, [[0, rgba(shade(col, 0.88), 1)], [0.14, rgba(shade(col, 0.5), 0.8)], [0.42, rgba(col, 0.26)], [1, rgba(col, 0)]]));
  /** White heat (dark stage only). */
  const hotS = () => glow('saHot', [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,252,244,0.72)'], [0.55, 'rgba(255,244,226,0.14)'], [1, 'rgba(255,240,220,0)']]);
  const hot = (col, L) => (L ? soft(shade(col, -0.2), true) : hotS());
  /** A bead of light (16 px, its core about 3.5 px across): a halo round a hot core, or a solid shaded dot on a light page. */
  const beadS = (col, L, q) => sprite(`sa-bead|${key(col)}|${L}|${q}`, () => paint(16, 16, q, (x) => {
    if (L) {
      const g = x.createRadialGradient(6.8, 6.8, 0.3, 8, 8, 4);
      g.addColorStop(0, rgba(shade(col, 0.45), 1)); g.addColorStop(0.55, rgba(shade(col, -0.12), 1)); g.addColorStop(1, rgba(shade(col, -0.45), 1));
      x.fillStyle = g; x.beginPath(); x.arc(8, 8, 3.6, 0, TAU); x.fill();
      return;
    }
    const g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, rgba(shade(col, 0.92), 1)); g.addColorStop(0.2, rgba(shade(col, 0.55), 0.95)); g.addColorStop(0.45, rgba(col, 0.38)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 16, 16);
  }));
  const bead = (ctx, s, x, y, r) => ctx.drawImage(s.c, x - r * 2.3, y - r * 2.3, r * 4.6, r * 4.6);

  /* ---------- 글로우 ---------- */

  /** The band of light: brightest at its head (left), trailing off to the right, soft above and below. */
  const bandS = (col, L) => sprite(`sa-band|${key(col)}|${L}`, () => paint(192, 40, 1, (x) => {
    const hc = L ? shade(col, -0.32) : shade(col, 0.62), g = x.createLinearGradient(0, 0, 192, 0);
    g.addColorStop(0, rgba(hc, 0)); g.addColorStop(0.05, rgba(hc, 1)); g.addColorStop(0.18, rgba(col, L ? 0.75 : 0.62)); g.addColorStop(0.55, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 192, 40);
    x.globalCompositeOperation = 'destination-in';
    const v = x.createLinearGradient(0, 0, 0, 40);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.3, 'rgba(0,0,0,0.42)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(0.7, 'rgba(0,0,0,0.42)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = v; x.fillRect(0, 0, 192, 40);
  }));
  /** On a light page a glow is a clear tint of the colour, not a dark smudge. */
  const tint = (col) => glow(`saT|${key(col)}`, [[0, rgba(col, 0.5)], [0.35, rgba(shade(col, 0.1), 0.22)], [0.7, rgba(col, 0.05)], [1, rgba(col, 0)]]);
  const unSmooth = (v) => 0.5 - Math.sin(Math.asin(1 - 2 * clamp(v)) / 3); // the u where ease.smooth(u) = v
  /** The caret lit from inside: an upright capsule of light, white at its heart (32 × 64). */
  const caretS = (col, L) => sprite(`sa-caret|${key(col)}|${L}`, () => paint(32, 64, 1, (x) => {
    x.scale(1, 2);
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    if (L) { g.addColorStop(0, rgba(shade(col, -0.2), 0.72)); g.addColorStop(0.32, rgba(col, 0.42)); g.addColorStop(1, rgba(col, 0)); } else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.28, rgba(shade(col, 0.62), 0.88)); g.addColorStop(0.62, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0)); }
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  }));

  function drawGlow(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { x, y, cw, ch } = p;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    // the caret cell swells into light, then lets it go
    const sw = ease.out(clamp(a / 13)), b = sw * (1 - ease.smooth(clamp((a - 12) / 40))) * al, g = 0.55 + 0.45 * sw;
    if (b > 0.004) {
      ctx.globalAlpha = b * (L ? 0.5 : 0.6); orb(ctx, p.halo, x, y, p.R * g, p.R * g * 0.72);
      ctx.globalAlpha = b * (L ? 0.75 : 0.8); orb(ctx, p.soft, x, y, cw * 2.6 * g, ch * 1.25 * g);
      const core = b * (1 - ease.smooth(clamp((a - 6) / 24)));
      if (core > 0.01) {
        ctx.globalAlpha = core; ctx.drawImage(p.caret.c, x - cw * 0.95, y - ch * 0.9, cw * 1.9, ch * 1.8);
        ctx.globalAlpha = core * (L ? 0.45 : 0.55) * Math.sin(Math.PI * clamp(a / 26)); orb(ctx, p.soft, x, y, ch * 3.4 * g, Math.max(1.2, ch * 0.09)); // a level streak through it, as through a lens
      }
    }
    // the band runs from the caret back to the start of the line, a line of light under the text with it
    const u = clamp((a - p.s0) / p.D), out = clamp((a - p.s0 - p.D) / 22);
    if (a >= p.s0 && out < 1) {
      const hx = x - (x - p.x0) * ease.smooth(u), tl = Math.min(x - hx, ch * 9) * (1 - ease.out(out)) + cw;
      const env = clamp((a - p.s0) / 4) * (1 - ease.smooth(out)) * al, W = tl / 0.95, bh = ch * 1.3, uy = y + ch * 0.47;
      ctx.globalAlpha = env * (L ? 0.55 : 0.62); ctx.drawImage(p.band.c, hx - W * 0.05, y - bh / 2, W, bh);
      ctx.globalAlpha = env * (L ? 0.9 : 0.85); ctx.drawImage(p.band.c, hx - W * 0.05, uy - 3, W, 6);
      const lg = ctx.createLinearGradient(hx, 0, hx + tl, 0);
      lg.addColorStop(0, rgba(p.hc, env)); lg.addColorStop(0.5, rgba(p.col, env * 0.5)); lg.addColorStop(1, rgba(p.col, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.fillRect(hx, uy - 0.6, tl, 1.2);
      const hs = 1 + 0.35 * out;
      ctx.globalAlpha = env * (L ? 0.6 : 0.75); orb(ctx, p.soft, hx, y, ch * 1.1 * hs, ch * 0.75 * hs);
      ctx.globalAlpha = env * (L ? 0.6 : 0.8) * (1 - out); ctx.drawImage(p.caret.c, hx - cw * 0.7, y - ch * 0.62, cw * 1.4, ch * 1.24);
    }
    ctx.restore();
  }
  /** A mote of light shaken off the band: rises a little, glimmers, goes. */
  function drawMote(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay);
    p.x += p.vx; p.y += p.vy; p.vy *= 0.985;
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.8 * (0.78 + 0.22 * Math.sin(a * 0.3 + p.ph)) * p.al;
    bead(ctx, p.sp, p.x, p.y, p.r);
    ctx.restore();
  }
  FXS.glow = function (c) {
    const { fx, P, cw, ch, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, q = scaleOf(fx), th = thin(fx), col = cols[0];
    const x0 = Math.min(A.x0 + cw * 0.5 * A.fit, A.x - cw * 2 * A.fit), D = Math.round(clamp((A.x - x0) / (cw * 0.85), 20, 34)), s0 = 9;
    P.push(part(s0 + D + 24, drawGlow, { x: A.x, y: A.y, x0, cw: cw * f, ch: ch * f, R: ch * 3 * f, s0, D, al: alpha, L, col, hc: L ? shade(col, -0.32) : shade(col, 0.62), soft: L ? tint(col) : soft(col, L), halo: L ? tint(cols[1]) : soft(cols[1], L), band: bandS(col, L), caret: caretS(col, L) }));
    for (let i = 0, m = Math.round(10 * th); i < m; i++) {
      const fr = (i + Math.random()) / m, delay = s0 + Math.round(unSmooth(fr) * D);
      P.push(part(delay + Math.round(rand(32, 48)), drawMote, { delay, x: A.x - (A.x - x0) * fr, y: A.y + rand(-0.45, 0.35) * ch * f, vx: rand(-0.12, 0.12) * f, vy: -rand(0.25, 0.6) * f, r: rand(1, 1.6) * f, ph: rand(0, TAU), al: alpha, L, sp: beadS(i % 3 === 2 ? cols[2] : col, L, q) }));
    }
  };

  /* ---------- 물결 ---------- */

  /** A falling drop of water (14 × 20): clear in the middle, the colour gathering at the rim, light focused low on the far side, a glint. */
  const dropS = (col, L, q) => sprite(`sa-drop|${key(col)}|${L}|${q}`, () => paint(14, 20, q, (x) => {
    const body = new Path2D();
    body.moveTo(7, 1.2); body.bezierCurveTo(8.3, 5.6, 12.3, 9, 12.3, 13.4); body.arc(7, 13.4, 5.3, 0, Math.PI); body.bezierCurveTo(1.7, 9, 5.7, 5.6, 7, 1.2);
    const g = x.createRadialGradient(6.3, 12.4, 0.5, 7, 13.2, 6.6);
    if (L) { g.addColorStop(0, rgba(shade(col, 0.55), 0.3)); g.addColorStop(0.62, rgba(shade(col, -0.08), 0.6)); g.addColorStop(1, rgba(shade(col, -0.45), 0.95)); } else { g.addColorStop(0, rgba(shade(col, 0.4), 0.22)); g.addColorStop(0.6, rgba(col, 0.42)); g.addColorStop(0.88, rgba(shade(col, 0.45), 0.85)); g.addColorStop(1, rgba(shade(col, 0.75), 1)); }
    x.fillStyle = g; x.fill(body);
    x.strokeStyle = L ? rgba(shade(col, -0.52), 0.85) : rgba(shade(col, 0.8), 0.8); x.lineWidth = 0.7; x.stroke(body);
    x.fillStyle = L ? rgba(shade(col, 0.6), 0.9) : rgba(shade(col, 0.85), 0.85); x.beginPath(); x.ellipse(8.7, 15.6, 2.3, 1.1, -0.45, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(5, 11.2, 1.2, 2.1, 0.35, 0, TAU); x.fill();
  }));
  /** One ring on the water: a broad swell, its crest catching the light (brighter on the near side), the trough behind it in shadow. */
  function waterRing(ctx, p, rx, ry, k, w, shine) {
    const { x, y, L } = p;
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.lineWidth = w * 3.2; ctx.strokeStyle = rgba(p.col, k * (L ? 0.14 : 0.2));
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = w * 0.75; ctx.strokeStyle = rgba(p.crest, k * (L ? 0.45 : 0.5));
    ctx.beginPath(); ctx.ellipse(x, y, rx + w * 0.6, ry + w * 0.25, 0, Math.PI, TAU); ctx.stroke();
    ctx.lineWidth = w * 1.15; ctx.strokeStyle = rgba(p.crest, k * (L ? 0.85 : 0.95));
    ctx.beginPath(); ctx.ellipse(x, y, rx + w * 0.6, ry + w * 0.25, 0, 0, Math.PI); ctx.stroke();
    if (shine) { ctx.lineWidth = w * 1.3; ctx.strokeStyle = rgba(p.glint, k * 0.9); ctx.beginPath(); ctx.ellipse(x, y, rx + w * 0.6, ry + w * 0.25, 0, Math.PI * 0.58, Math.PI * 0.74); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = w * 0.9; ctx.strokeStyle = rgba(p.trough, k * (L ? 0.32 : 0.45));
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, rx - w * 1.5), Math.max(0.5, ry - w * 0.55), 0, 0, TAU); ctx.stroke();
  }
  function drawRipple(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { x, y } = p, b = a - p.hit;
    ctx.save(); ctx.lineCap = 'round';
    if (b < 0) { // the drop coming down, its mark on the water growing under it
      const u = a / p.hit, dy = p.H * (1 - ease.in(u)), s = 1 + 0.3 * u, top = y - dy - 18.7 * p.ds * s;
      ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
      ctx.globalAlpha = al * u * 0.6; orb(ctx, p.soft, x, y, p.cw * (0.6 + 0.8 * u), p.cw * 0.3 * (0.6 + 0.8 * u));
      const st = ctx.createLinearGradient(0, top - p.cw * 2.2 * u, 0, top + 4); // the streak of its fall
      st.addColorStop(0, rgba(p.crest, 0)); st.addColorStop(1, rgba(p.crest, al * 0.45));
      ctx.globalAlpha = 1; ctx.fillStyle = st; ctx.fillRect(x - 0.6, top - p.cw * 2.2 * u, 1.2, p.cw * 2.2 * u + 4);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al * clamp((a + 1) / 3);
      ctx.drawImage(p.drop.c, x - 7 * p.ds, top, 14 * p.ds, 20 * p.ds * s);
      ctx.restore();
      return;
    }
    for (const r of p.rings) {
      const rb = b - r.d;
      if (rb < 0 || rb > r.T) continue;
      const u = rb / r.T, rx = p.cw * 0.5 + r.R * ease.out(u), k = (1 - u) ** 1.35 * al * r.a * clamp(rb / 2 + 0.3);
      waterRing(ctx, p, rx, rx * p.tilt, k, p.w * (1 - 0.35 * u), r.shine);
    }
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    if (b < 12) { ctx.globalAlpha = al * (1 - b / 12) ** 2 * 0.8; orb(ctx, p.soft, x, y, p.cw * 1.6, p.cw * 0.55); } // the dimple where it went in
    if (b < 9) { // the crown's wall standing up round it
      const k = al * (1 - b / 9), rc = p.rc * (1 + b * 0.06);
      ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.crest, k * 0.7); ctx.lineWidth = Math.max(0.8, p.w);
      ctx.beginPath(); ctx.ellipse(x, y, rc, rc * p.tilt, 0, 0, TAU); ctx.stroke();
    }
    for (const d of p.crown) { // the sheet thrown up off it, breaking into droplets
      const t = b - d.d, px = d.x0 + d.vx * t, py = d.y0 + d.vy * t + 0.5 * p.g * t * t;
      if (t < 0 || (t > 3 && py > d.y0 + 1)) continue;
      const k = al * clamp(1.25 - t / 24);
      if (t < 9) { ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.crest, k * 0.7 * (1 - t / 9)); ctx.lineWidth = d.s * 1.3; ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(px, py); ctx.stroke(); }
      ctx.globalAlpha = k; bead(ctx, p.bead, px, py, d.s);
    }
    const j = b - p.jet.d; // the drop bouncing back out of the middle; falling in again it makes the last small ring
    if (j >= 0 && j <= p.jet.T) {
      const jy = y - (p.jet.v * j - 0.5 * p.jet.g * j * j);
      if (j < 6) { ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.crest, al * 0.6 * (1 - j / 6)); ctx.lineWidth = p.jet.s * 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, jy); ctx.stroke(); }
      ctx.globalAlpha = al; bead(ctx, p.bead, x, jy, p.jet.s * (j < 4 ? 1.3 : 1));
    }
    ctx.restore();
  }
  FXS.ripple = function (c) {
    const { fx, P, cw, ch, sz, alpha, L, pick } = c, A = anchor(c), f = A.fit * sz, q = scaleOf(fx), th = thin(fx), col = pick();
    const rc = cw * 0.9 * f, crown = [], R = ch * 3.3 * f;
    for (let i = 0, m = Math.round(9 * Math.max(0.5, th)); i < m; i++) {
      const an = (i / m) * TAU + rand(-0.2, 0.2);
      crown.push({ d: 0, x0: A.x + Math.cos(an) * rc, y0: A.y + Math.sin(an) * rc * 0.32, vx: Math.cos(an) * rand(0.5, 1.1) * f, vy: -rand(1.7, 2.6) * f, s: rand(0.95, 1.4) * f });
    }
    const rings = [{ d: 0, T: 54, R, a: 1, shine: true }, { d: 7, T: 50, R: R * 0.78, a: 0.85, shine: true }, { d: 14, T: 46, R: R * 0.58, a: 0.7 }, { d: 29, T: 38, R: R * 0.36, a: 0.6 }].slice(0, th < 0.5 ? 2 : 4);
    P.push(part(10 + 29 + 40, drawRipple, {
      x: A.x, y: A.y, cw: cw * f, rc, hit: 10, H: A.small ? Math.min(ch * 2.4 * f, A.y - 3) : ch * 2.4 * f, ds: Math.max(0.5, 0.7 * f), tilt: 0.32, w: Math.max(0.8, 1.3 * f), g: 0.2 * f,
      crown, rings, jet: { d: 9, v: 1.9 * f, g: 0.19 * f, T: 20, s: 1.1 * f }, al: alpha, L, col,
      crest: L ? shade(col, -0.32) : shade(col, 0.6), trough: L ? shade(col, 0.65) : shade(col, -0.7), glint: L ? shade(col, -0.5) : [255, 255, 255],
      soft: soft(col, L), drop: dropS(col, L, q), bead: beadS(L ? col : shade(col, 0.3), L, q),
    }));
  };

  /* ---------- 충격파 ---------- */

  function drawShock(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { x, y, f } = p, add = L ? 'source-over' : 'lighter';
    ctx.save(); ctx.globalCompositeOperation = add; ctx.lineCap = 'round';
    if (a < 8) { // the one flash, small and quick
      const u = a / 8, k = (1 - u) ** 2 * al;
      ctx.globalAlpha = k * (L ? 0.6 : 1); orb(ctx, p.soft, x, y, p.F * (0.7 + 0.5 * ease.out(u)));
      ctx.globalAlpha = k * (L ? 0.5 : 0.9); orb(ctx, p.hot, x, y, p.F * 0.45);
    }
    if (a < 30) { // the blast racing out both ways along the row: a curved front at each end, a wake of light behind it
      const u = a / 30, k = (1 - u) ** 1.5 * al, rx = p.D * ease.out(u) + p.cw, rr = p.ch * (0.95 - 0.25 * u), sw = 0.95 - 0.25 * u;
      for (const s of [-1, 1]) {
        const hx = x + s * rx, wx = x + s * rx * 0.35, a0 = s > 0 ? 0 : Math.PI, g = ctx.createLinearGradient(wx, 0, hx, 0);
        g.addColorStop(0, rgba(p.col, 0)); g.addColorStop(0.85, rgba(p.col, k * (L ? 0.16 : 0.2))); g.addColorStop(1, rgba(p.col, 0));
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(Math.min(wx, hx), y - p.ch * 0.36, Math.abs(hx - wx), p.ch * 0.72);
        ctx.globalAlpha = k * (L ? 0.5 : 0.7); orb(ctx, p.soft, hx - s * p.ch * 0.2, y, p.ch * 0.9, p.ch * 0.55);
        ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.col, k * 0.4); ctx.lineWidth = Math.max(1.5, 3.2 * f);
        ctx.beginPath(); ctx.arc(hx - s * (rr + 1.5 * f), y, rr, a0 - sw, a0 + sw); ctx.stroke();
        ctx.strokeStyle = rgba(p.edge, k * 0.95); ctx.lineWidth = Math.max(0.8, 1.1 * f);
        ctx.beginPath(); ctx.arc(hx - s * rr, y, rr, a0 - sw * 0.9, a0 + sw * 0.9); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of p.rings) {
      const u = (a - r.d) / r.T;
      if (u < 0 || u > 1) continue;
      const R = r.R * ease.out(u) + 2, k = (1 - u) ** 1.4 * al * r.a, w = r.w * (1 - 0.5 * u);
      if (r.band) { // the air behind the front, bent: a wake of light, a band of another colour, a dark thread
        const g = ctx.createRadialGradient(x, y, Math.max(0, R - w * 8), x, y, R);
        g.addColorStop(0, rgba(p.c2, 0)); g.addColorStop(0.55, rgba(p.c2, k * (L ? 0.14 : 0.16))); g.addColorStop(0.75, rgba(p.c2, k * 0.04)); g.addColorStop(0.93, rgba(r.col, k * (L ? 0.3 : 0.4))); g.addColorStop(1, rgba(r.col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(p.dark, k * (L ? 0.35 : 0.55)); ctx.lineWidth = Math.max(0.8, w * 0.45);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, R - w * 2.3), 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = add;
      }
      // the front: a broad glow, a hot thin edge that is brighter in some places than others, a cool fringe just outside
      ctx.strokeStyle = rgba(r.col, k * 0.42); ctx.lineWidth = w * 2.4; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, R - w * 0.4), 0, TAU); ctx.stroke();
      const cg = ctx.createConicGradient(p.turn + r.d, x, y);
      for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, rgba(p.edge, k * (i % 6 === 0 ? 1 : p.lit[i - 1])));
      ctx.strokeStyle = cg; ctx.lineWidth = Math.max(0.8, w * 0.7); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      if (r.band) { ctx.strokeStyle = rgba(p.c3, k * 0.45); ctx.lineWidth = Math.max(0.7, w * 0.35); ctx.beginPath(); ctx.arc(x, y, R + w * 0.85, 0, TAU); ctx.stroke(); }
    }
    for (const d of p.debris) { // specks thrown out, streaking while they are fast
      const t = (a - d.d) / d.T;
      if (t < 0 || t > 1) continue;
      d.x += d.vx; d.y += d.vy; d.vx *= 0.92; d.vy = d.vy * 0.92 + d.g;
      const sp = Math.hypot(d.vx, d.vy) || 1, ln = Math.max(1, sp * 1.8);
      ctx.strokeStyle = rgba(d.c, (1 - t) * al); ctx.lineWidth = d.s;
      ctx.beginPath(); ctx.moveTo(d.x - (d.vx / sp) * ln, d.y - (d.vy / sp) * ln); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();
  }
  FXS.shockwave = function (c) {
    const { fx, P, ch, cw, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, th = thin(fx), col = cols[0];
    const edge = L ? shade(col, -0.45) : shade(col, 0.78), R = ch * 4.2 * f, debris = [];
    const dc = L ? [shade(col, -0.5), shade(cols[2], -0.35), [70, 74, 90]] : [edge, col, cols[2]];
    for (let i = 0, m = Math.round(18 * th); i < m; i++) {
      const an = i % 3 === 0 ? (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.22, 0.22) : rand(0, TAU), sp = rand(2.2, 5.5) * f;
      debris.push({ d: Math.round(rand(0, 3)), T: rand(22, 38), x: A.x, y: A.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * (A.small ? 0.5 : 1), g: 0.07 * f, s: Math.max(0.7, rand(0.8, 1.5) * f), c: dc[i % 3] });
    }
    P.push(part(50, drawShock, {
      x: A.x, y: A.y, f, cw: cw * f, ch: ch * f, F: ch * 1.5 * f, D: A.small ? fx.w * 0.4 : Math.min(ch * 9 * f, Math.max(A.x, fx.w - A.x)), turn: rand(0, TAU), lit: [rand(0.35, 0.6), rand(0.8, 1), rand(0.3, 0.55), rand(0.75, 1), rand(0.4, 0.65)],
      rings: [{ d: 0, T: 40, R, w: Math.max(1.2, 2.6 * f), col: L ? shade(col, -0.2) : col, a: 1, band: true }, { d: 5, T: 34, R: R * 0.62, w: Math.max(0.9, 1.5 * f), col: L ? shade(cols[2], -0.25) : cols[2], a: 0.8 }].slice(0, th < 0.5 ? 1 : 2),
      debris, al: alpha, L, col: L ? shade(col, -0.2) : col, edge, c2: L ? shade(cols[1], -0.2) : cols[1], c3: L ? shade(cols[2], -0.3) : cols[2], dark: L ? shade(col, -0.6) : shade(col, -0.75),
      soft: soft(col, L), hot: hot(col, L),
    }));
  };

  /* ---------- 파티클 ---------- */

  function drawParticles(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { x, y, G, pop, vk } = p;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    if (a < G) for (const d of p.ins) { // rushing in, each with a short streak behind it
      const u = clamp((a - d.d) / (G - d.d));
      if (u <= 0 || u >= 1) continue;
      const at = (v) => { const e = ease.in(v), r = d.r * (1 - e), an = d.an + d.sw * e; return [x + Math.cos(an) * r, y + Math.sin(an) * r * vk]; };
      const [px, py] = at(u), [tx, ty] = at(Math.max(0, u - 0.22)), k = clamp(u * 5) * al;
      ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.cs[d.ci], k * 0.5); ctx.lineWidth = d.s * 1.1;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
      ctx.globalAlpha = k; bead(ctx, p.beads[d.ci], px, py, d.s);
    }
    if (a < pop + 12) { // the core: it fills as they arrive, packs tighter, then lets go
      let r, k, sq = 0;
      if (a < pop) { const grow = ease.out(clamp(a / G)); sq = ease.in(clamp((a - G + 3) / (pop - G + 3))); r = p.cr * (0.35 + 0.65 * grow) * (1 - 0.5 * sq); k = (0.35 + 0.65 * grow) * al; } else { const v = (a - pop) / 12; r = p.cr * (0.5 + 1.5 * ease.out(v)); k = (1 - v) ** 2 * al; }
      ctx.globalAlpha = k * (L ? 0.55 : 0.6); orb(ctx, p.soft, x, y, r * 2.4);
      ctx.globalAlpha = k; orb(ctx, p.hot, x, y, r);
      if (sq > 0) { ctx.globalAlpha = sq * al; orb(ctx, p.hot, x, y, r * 0.55); }
    }
    if (a >= pop) {
      const b = a - pop;
      for (const rg of p.rings) {
        const u = b / rg.T;
        if (u >= 1) continue;
        const e = ease.out(u), R = rg.R * e, k = (1 - u) ** 1.1 * al, s = rg.s * (1 - 0.5 * u);
        if (rg.line && u < 0.45) { ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.cs[0], k * 0.3 * (1 - u / 0.45)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, R, R * vk, 0, 0, TAU); ctx.stroke(); }
        if (u < 0.35) { // streaks while they are fast
          const back = rg.R * (e - ease.out(Math.max(0, u - 0.06)));
          ctx.globalAlpha = 1; ctx.strokeStyle = rgba(p.cs[rg.ci], k * 0.45 * (1 - u / 0.35)); ctx.lineWidth = s * 1.2; ctx.beginPath();
          for (let i = 0; i < rg.n; i++) { const an = rg.o + (i / rg.n) * TAU, cx = Math.cos(an), cy = Math.sin(an) * vk; ctx.moveTo(x + cx * (R - back), y + cy * (R - back)); ctx.lineTo(x + cx * R, y + cy * R); }
          ctx.stroke();
        }
        ctx.globalAlpha = k;
        for (let i = 0; i < rg.n; i++) { const an = rg.o + (i / rg.n) * TAU; bead(ctx, p.beads[(i + rg.ci) % 3], x + Math.cos(an) * R, y + Math.sin(an) * R * vk, s); }
      }
      for (const d of p.strays) { // a few fall away like the key-press particles
        if (b >= d.T) continue;
        d.x += d.vx; d.y += d.vy; d.vy += p.g; d.vx *= 0.97;
        ctx.globalAlpha = (1 - b / d.T) * al; bead(ctx, p.beads[d.ci], d.x, d.y, d.s);
      }
    }
    ctx.restore();
  }
  FXS.particles = function (c) {
    const { fx, P, ch, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, q = scaleOf(fx), th = thin(fx);
    const ins = [], strays = [], R = ch * 3.3 * f;
    for (let i = 0, m = Math.round(26 * th); i < m; i++) ins.push({ an: (i / m) * TAU + rand(-0.15, 0.15), r: ch * rand(2.2, 3.6) * f, sw: rand(0.35, 0.7), d: Math.round(rand(0, 6)), s: rand(0.9, 1.4) * f, ci: i % 3 });
    for (let i = 0, m = Math.round(8 * th); i < m; i++) { const an = rand(0, TAU), sp = rand(1, 2.6) * f; strays.push({ x: A.x, y: A.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 0.8 * f, T: rand(26, 40), s: rand(0.7, 1.1) * f, ci: i % 3 }); }
    const rings = [{ n: Math.round(36 * Math.max(0.5, th)), R, T: 52, s: 1.55 * f, o: rand(0, TAU), ci: 0, line: true }, { n: Math.round(20 * Math.max(0.5, th)), R: R * 0.58, T: 46, s: 1.2 * f, o: rand(0, TAU), ci: 1 }];
    P.push(part(21 + 53, drawParticles, {
      x: A.x, y: A.y, G: 15, pop: 21, vk: A.small ? 0.75 : 1, ins, rings, strays, cr: ch * 0.7 * f, g: 0.08 * f, al: alpha, L,
      beads: cols.map((cc) => beadS(cc, L, q)), cs: cols.map((cc) => (L ? shade(cc, -0.2) : cc)), soft: soft(cols[0], L), hot: hot(cols[0], L),
    }));
  };

  /* ---------- 스파크 ---------- */

  function emitSpark(p, x, y, an, sp, T, w, fork) {
    if (p.left <= 0) return;
    p.left--;
    const i = (Math.random() * 3) | 0;
    p.sparks.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * p.vyK, T, age: 0, w, fork, c: p.cs[i], h: p.hs[i] });
  }
  function drawSparkler(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { x, y, f } = p;
    if (a < p.E) { // the fizz throws sparks every frame, fewer as it burns down
      for (let i = 0, n = Math.round(p.rate * (1 - (a / p.E) * 0.6) + Math.random() - 0.3); i < n; i++) {
        const long = Math.random() < 0.3, sp = (long ? rand(5.4, 7.4) : rand(2.6, 5.2)) * f;
        emitSpark(p, x, y, rand(0, TAU), sp, Math.round(long ? rand(20, 27) : rand(11, 19)), (long ? 1.3 : rand(0.8, 1.15)) * Math.max(0.7, f), Math.random() < 0.4 ? Math.round(rand(4, 9)) : 0);
      }
    }
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    const env = clamp((a + 1) / 3) * (1 - ease.smooth(clamp((a - p.E + 8) / 16))) * al;
    if (env > 0.01) { // the burning point: a gentle seethe, never a flicker
      const fl = 0.88 + 0.12 * Math.sin(a * 1.9) * Math.sin(a * 0.7 + 1.3);
      ctx.globalAlpha = env * 0.45; orb(ctx, p.soft, x, y, p.cr * 3 * fl);
      ctx.globalAlpha = env; orb(ctx, p.hot, x, y, p.cr * fl);
    }
    ctx.globalAlpha = 1;
    for (const s of p.sparks) {
      if (s.age >= s.T) continue;
      s.age++;
      s.x += s.vx; s.y += s.vy; s.vx *= 0.955; s.vy = s.vy * 0.955 + p.g;
      if (s.fork && s.age === s.fork) { // it forks: two or three smaller sparks fly off from a little star
        const an = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy) * 0.85;
        for (let j = 0, m = Math.random() < 0.5 ? 2 : 3; j < m; j++) emitSpark(p, s.x, s.y, an + (j - (m - 1) / 2) * rand(0.45, 0.75) + rand(-0.15, 0.15), sp, Math.round(rand(6, 11)), s.w * 0.75, 0);
        p.flecks.push({ x: s.x, y: s.y, age: 0, c: s.h });
      }
      const t = s.age / s.T, k = (1 - t * t) * al;
      ctx.strokeStyle = rgba(s.c, k * 0.6); ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(s.x - s.vx * 5.5, s.y - s.vy * 5.5); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.strokeStyle = rgba(s.h, k); ctx.lineWidth = s.w * 0.55; ctx.beginPath(); ctx.moveTo(s.x - s.vx * 1.8, s.y - s.vy * 1.8); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    for (const fl of p.flecks) {
      if (fl.age >= 4) continue;
      fl.age++;
      const r = 3.4 * Math.max(0.6, f) * (0.6 + fl.age * 0.25);
      ctx.strokeStyle = rgba(fl.c, (1 - fl.age / 4) * al); ctx.lineWidth = Math.max(0.8, f);
      ctx.beginPath(); ctx.moveTo(fl.x - r, fl.y); ctx.lineTo(fl.x + r, fl.y); ctx.moveTo(fl.x, fl.y - r); ctx.lineTo(fl.x, fl.y + r); ctx.stroke();
    }
    ctx.restore();
  }
  FXS.spark = function (c) {
    const { fx, P, ch, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, th = thin(fx);
    const cs = cols.map((cc) => (L ? shade(cc, -0.28) : shade(cc, 0.3)));
    P.push(part(68, drawSparkler, {
      x: A.x, y: A.y, f, E: 40, rate: 2.2 * th, left: Math.round(120 * th), sparks: [], flecks: [], g: 0.085 * f, vyK: A.small ? 0.55 : 1, cr: ch * 0.42 * f, al: alpha, L,
      cs, hs: cs.map((cc) => (L ? shade(cc, -0.45) : mix([255, 250, 236], cc, 0.15))), soft: soft(cols[0], L), hot: hot(cols[0], L),
    }));
  };

  /* ---------- 별빛 ---------- */

  /** A twinkle, the key-press star's four points (20 px). */
  const twinkleS = (col, L, q) => sprite(`sa-tw|${key(col)}|${L}|${q}`, () => paint(20, 20, q, (x) => {
    x.translate(10, 10);
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 10); g.addColorStop(0, rgba(shade(col, 0.8), 0.7)); g.addColorStop(0.4, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(-10, -10, 20, 20); }
    x.fillStyle = rgba(L ? shade(col, -0.3) : shade(col, 0.75), 1);
    x.beginPath(); x.moveTo(0, -9); x.quadraticCurveTo(1.2, -1.2, 9, 0); x.quadraticCurveTo(1.2, 1.2, 0, 9); x.quadraticCurveTo(-1.2, 1.2, -9, 0); x.quadraticCurveTo(-1.2, -1.2, 0, -9); x.fill();
  }));
  /** A bevelled five-point star (48 px, 42 across): each arm a lit face and a shaded one, a glint near the middle. */
  const star5S = (col, L, q) => sprite(`sa-star5|${key(col)}|${L}|${q}`, () => paint(48, 48, q, (x) => {
    const cx = 24, cy = 25, pt = (i) => { const an = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 8.8 : 21; return [cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]; };
    const lit = L ? shade(col, 0.2) : shade(col, 0.78), dim = L ? shade(col, -0.55) : shade(col, -0.32), edge = L ? shade(col, -0.65) : shade(col, -0.4);
    const outline = new Path2D();
    for (let i = 0; i < 10; i++) { const [px, py] = pt(i); if (i) outline.lineTo(px, py); else outline.moveTo(px, py); }
    outline.closePath();
    for (let i = 0; i < 10; i++) { // a face: the middle, a point, the notch beside it; lit as it turns toward the upper left
      const [tx, ty] = pt(i % 2 ? i + 1 : i), [nx0, ny0] = pt(i % 2 ? i : i + 1), ux = tx - cx, uy = ty - cy, ul = Math.hypot(ux, uy);
      const vx = nx0 - cx, vy = ny0 - cy, dt = (vx * ux + vy * uy) / (ul * ul), nx = vx - ux * dt, ny = vy - uy * dt, nl = Math.hypot(nx, ny) || 1;
      const lum = clamp(0.5 + 0.48 * ((nx * -0.62 + ny * -0.78) / nl) + 0.06 * (-uy / ul));
      const [ax, ay] = pt(i), [bx, by] = pt(i + 1);
      x.fillStyle = rgba(mix(dim, lit, lum), 1); x.beginPath(); x.moveTo(cx, cy); x.lineTo(ax, ay); x.lineTo(bx, by); x.closePath(); x.fill();
    }
    x.lineWidth = 0.9; x.strokeStyle = rgba(edge, 0.9); x.stroke(outline);
    x.lineWidth = 0.6; x.strokeStyle = L ? rgba(shade(col, 0.45), 0.55) : 'rgba(255,255,255,0.42)'; // the ridges
    x.beginPath(); for (let i = 0; i < 10; i += 2) { const [px, py] = pt(i); x.moveTo(cx, cy); x.lineTo(px, py); } x.stroke();
    const g = x.createRadialGradient(cx - 3, cy - 4, 0, cx - 3, cy - 4, 6);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx - 3, cy - 4, 6, 0, TAU); x.fill();
  }));
  function drawStars(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, F = p.F, add = L ? 'source-over' : 'lighter';
    const at = (u) => { const v = 1 - u; return [v * v * p.x + 2 * v * u * p.cx + u * u * p.ex, v * v * p.y + 2 * v * u * p.cy + u * u * p.ey]; };
    ctx.save(); ctx.globalCompositeOperation = add; ctx.lineCap = 'round';
    // the trail, thin and faint at its tail, and the head drawing it
    const hu = ease.out(clamp(a / F)), tu = Math.max(0, hu - 0.6 * (1 - ease.in(clamp((a - F) / 14)))), env = al * (a < F ? 1 : 1 - clamp((a - F) / 14));
    if (env > 0.01 && hu - tu > 0.005) {
      let [px, py] = at(tu);
      for (let i = 1; i <= 14; i++) {
        const v = i / 14, [qx, qy] = at(tu + (hu - tu) * v);
        ctx.strokeStyle = rgba(p.col, env * v * v * 0.45); ctx.lineWidth = p.w * (1 + 3.2 * v); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        ctx.strokeStyle = rgba(p.hc, env * v ** 1.5); ctx.lineWidth = p.w * (0.3 + 0.7 * v); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        px = qx; py = qy;
      }
    }
    if (a < F + 2) { const [hx, hy] = at(hu), k = al * (a < F ? 1 : 0.5); ctx.globalAlpha = k * (L ? 0.7 : 0.9); orb(ctx, p.soft, hx, hy, p.ch * 0.75); ctx.globalAlpha = k; orb(ctx, p.hot, hx, hy, p.ch * 0.3); }
    for (const t of p.tw) { // twinkles left along the way
      const b = a - t.d;
      if (b < 0 || b >= t.T) continue;
      const e = Math.sin((Math.PI * b) / t.T) ** 0.8;
      ctx.globalAlpha = e * (0.6 + 0.4 * Math.sin(b * 0.4 + t.ph)) * al;
      put(ctx, p.twS[t.ci], t.x, t.y + b * 0.12 * p.f, (t.sz * (0.6 + 0.4 * e)) / 20, t.rot + b * 0.02);
    }
    const sa = a - (F - 3);
    if (sa >= 0) { // the star where it stops: it springs open, flares, holds, shrinks away
      const out = ease.smooth(clamp((sa - 30) / 16)), sc = p.S * ease.back(clamp(sa / 12)) * (1 - 0.6 * out), k = al * (1 - out) * clamp((sa + 1) / 3), fl = Math.sin(Math.PI * clamp(sa / 24));
      if (k > 0.01) {
        ctx.globalAlpha = k * (L ? 0.5 : 0.6) * (0.6 + 0.4 * fl); orb(ctx, p.soft, p.ex, p.ey, p.S * (1.1 + 0.6 * fl));
        if (fl > 0.01) {
          ctx.globalAlpha = 1; ctx.lineWidth = Math.max(0.7, 1.1 * p.f);
          for (const [dx, dy, l] of p.flare) {
            const len = p.ch * 2.4 * l * (0.4 + 0.6 * fl), g = ctx.createLinearGradient(p.ex - dx * len, p.ey - dy * len, p.ex + dx * len, p.ey + dy * len);
            g.addColorStop(0, rgba(p.hc, 0)); g.addColorStop(0.5, rgba(p.hc, k * fl * 0.9)); g.addColorStop(1, rgba(p.hc, 0));
            ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(p.ex - dx * len, p.ey - dy * len); ctx.lineTo(p.ex + dx * len, p.ey + dy * len); ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k;
        put(ctx, p.star, p.ex, p.ey, sc / 42, p.rot0 * (1 - ease.out(clamp(sa / 16))) + out * 0.25);
        ctx.globalCompositeOperation = add;
        if (fl > 0.05 && !L) { ctx.globalAlpha = k * fl * 0.7; orb(ctx, p.hot, p.ex, p.ey, p.S * 0.26); }
      }
      if (sa < 22) for (const r of p.rays) { const u = sa / 22, d = p.ch * 1.5 * ease.out(u); ctx.globalAlpha = al * (1 - u); put(ctx, p.twS[r.ci], p.ex + Math.cos(r.an) * d, p.ey + Math.sin(r.an) * d * p.vk, (p.ch * 0.32 * (1 - 0.5 * u)) / 20); }
    }
    ctx.restore();
  }
  FXS.stars = function (c) {
    const { fx, P, cw, ch, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, q = scaleOf(fx), th = thin(fx), col = cols[0], F = 22;
    const S = ch * 1.3 * f, dir = A.small ? (A.x < fx.w / 2 ? 1 : -1) : A.x + cw * 9 < fx.w ? 1 : -1;
    const ex = clamp(A.x + dir * (A.small ? fx.w * 0.24 : cw * 6.5 * f), S, fx.w - S), ey = Math.max(S * 0.7 + 2, A.y - (A.small ? A.y * 0.6 : ch * 2.8 * f));
    const cx = A.x, cy = ey, tw = [];
    for (let i = 0, m = Math.round(10 * th); i < m; i++) { // where the twinkles fall: along the arc, a little to either side
      const s = ((i + 0.5) / m) * 0.92, v = 1 - s, bx = v * v * A.x + 2 * v * s * cx + s * s * ex, by = v * v * A.y + 2 * v * s * cy + s * s * ey;
      const dx = 2 * v * (cx - A.x) + 2 * s * (ex - cx), dy = 2 * v * (cy - A.y) + 2 * s * (ey - cy), dl = Math.hypot(dx, dy) || 1, off = rand(-0.5, 0.5) * ch * f * 0.6;
      tw.push({ x: bx - (dy / dl) * off, y: by + (dx / dl) * off, d: Math.round(F * (1 - Math.cbrt(1 - s))), T: Math.round(rand(26, 44)), ph: rand(0, TAU), sz: rand(0.7, 1.15) * ch * 0.56 * f, rot: rand(-0.3, 0.3), ci: i % 3 });
    }
    const rays = [];
    for (let i = 0, m = th < 0.5 ? 3 : 6; i < m; i++) rays.push({ an: (i / m) * TAU + rand(-0.3, 0.3), ci: (i + 1) % 3 });
    P.push(part(F + 48, drawStars, {
      x: A.x, y: A.y, cx, cy, ex, ey, F, f, S, ch: ch * f, w: Math.max(0.7, 1.3 * f), vk: A.small ? 0.6 : 1, tw, rays, rot0: -0.9 * dir, al: alpha, L,
      col: L ? shade(col, -0.15) : col, hc: L ? shade(col, -0.42) : shade(col, 0.75), flare: [[1, 0, 1], [0, 1, 0.75], [0.707, 0.707, 0.38], [0.707, -0.707, 0.38]],
      soft: soft(col, L), hot: hot(col, L), twS: cols.map((cc) => twinkleS(cc, L, q)), star: star5S(col, L, q),
    }));
  };

  /* ---------- 픽셀 ---------- */

  // o outline (added round each picture) · d deep shade · b shade · l body · w highlight
  const PIX = {
    coin: ['.llll.', 'lwlllb', 'lwldlb', 'lwldlb', 'lwldlb', 'lwldlb', 'llldlb', 'lllllb', '.bbbb.'],
    heart: ['.lll.lll.', 'lwwllllll', 'lwlllllbb', 'lllllllbb', '.lllllbb.', '..lllbb..', '...lbb...', '....b....'],
    tick: ['.........llb', '........llb.', 'wlb....llb..', '.wlb..llb...', '..wlbllb....', '...wllb.....', '....bb......'],
  };
  /** The cells of a pixel picture with a one-pixel outline round it → { cells: [[col, row, letter], …], w, h }. */
  function cellsOf(rows) {
    const w = rows[0].length + 2, h = rows.length + 2, at = (r, c) => (rows[r - 1] && rows[r - 1][c - 1]) || '.', cells = [];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let l = at(r, c);
        if (l === '.' && (at(r - 1, c) !== '.' || at(r + 1, c) !== '.' || at(r, c - 1) !== '.' || at(r, c + 1) !== '.')) l = 'o';
        if (l !== '.') cells.push([c, r, l]);
      }
    }
    return { cells, w, h };
  }
  const SHAPES = Object.fromEntries(Object.entries(PIX).map(([k, v]) => [k, cellsOf(v)]));
  const palOf = (col) => ({ o: shade(col, -0.66), d: shade(col, -0.4), b: shade(col, -0.18), l: col, w: shade(col, 0.62) });
  /** The whole picture, pixel-exact at device scale: as it is (0), flashed white (1) or as a shadow (2). */
  const pixS = (name, col, P, dpr, v, L) => sprite(`sa-px|${name}|${key(col)}|${P}|${dpr}|${v}|${L}`, () => {
    const { cells, w, h } = SHAPES[name], pal = palOf(col);
    return paint(w * P, h * P, dpr, (x) => {
      for (const [c, r, l] of cells) {
        x.fillStyle = v === 2 ? '#000' : v === 1 ? rgba(l === 'o' ? pal.o : L ? shade(col, 0.82) : [255, 255, 255], 1) : rgba(pal[l], 1);
        x.fillRect(c * P, r * P, P, P);
      }
    });
  });
  function drawPixel(ctx, p) {
    const a = p.age++, L = p.L, al = p.al, { P, F, H } = p, snap = (v, o) => o + Math.round((v - o) / P) * P;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const rb = a - F, hop = rb >= 0 && rb < 4 ? 2 : rb >= 4 && rb < 8 ? 1 : 0, cy = p.cy - hop * P;
    if (rb >= 0) { // square rings of pixels stepping out, fading in steps
      ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
      if (!L && a < H) { ctx.globalAlpha = al * (rb < 6 ? 0.55 : 0.3); orb(ctx, p.soft, p.cx, cy, p.W * 1.25); }
      for (const r of p.rings) {
        const u = (rb - r.d) / r.T;
        if (u < 0 || u >= 1) continue;
        const m = Math.round((p.hs0 + r.R * ease.out(u)) / P), x0 = snap(p.cx, p.ox), y0 = snap(cy, p.oy), hs = m * P;
        ctx.globalAlpha = (Math.ceil((1 - u) * 3) / 3) * al * 0.9; ctx.fillStyle = p.ringCss[r.ci];
        for (let i = 1 - m + ((m + 1) % 2); i < m; i += 2) { // every other pixel along each side, the corners left out
          const o = i * P;
          ctx.fillRect(x0 + o, y0 - hs, P, P); ctx.fillRect(x0 - o, y0 + hs, P, P); ctx.fillRect(x0 - hs, y0 - o, P, P); ctx.fillRect(x0 + hs, y0 + o, P, P);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (a < F) { // flying together: out of the caret, then each to its place, always on the pixel grid
      for (const d of p.px) {
        let px, py;
        if (a < d.b) { const e = ease.out(a / d.b); px = p.x + (d.sx - p.x) * e; py = p.y + (d.sy - p.y) * e; } else { const e = ease.smooth(clamp((a - d.b) / (d.g - d.b))); px = d.sx + (d.tx - d.sx) * e; py = d.sy + (d.ty - d.sy) * e; }
        ctx.globalAlpha = al * clamp((a + 1) / 3); ctx.fillStyle = p.css[d.l]; ctx.fillRect(snap(px, p.ox), snap(py, p.oy), P, P);
      }
    } else if (a < H) { // whole: one flash, a hop, a little shadow under it
      const Y = p.oy - hop * P;
      ctx.globalAlpha = al * (L ? 0.16 : 0.5); ctx.drawImage(p.sh.c, p.ox + P, Y + P, p.sp.w, p.sp.h);
      ctx.globalAlpha = al; ctx.drawImage((rb < 3 ? p.fl : p.sp).c, p.ox, Y, p.sp.w, p.sp.h);
      if (rb >= 3 && rb < 7) { ctx.globalAlpha = al * (1 - (rb - 3) / 4); ctx.drawImage(p.fl.c, p.ox, Y, p.sp.w, p.sp.h); }
    } else { // breaking up: every pixel falls away on its own, fading in steps
      const b = a - H;
      for (const d of p.px) {
        if (b >= d.T) continue;
        d.x += d.vx; d.y += d.vy; d.vy += p.g; d.vx *= 0.97;
        ctx.globalAlpha = (al * Math.ceil((1 - b / d.T) * 4)) / 4; ctx.fillStyle = p.css[d.l]; ctx.fillRect(snap(d.x, p.ox), snap(d.y, p.oy), P, P);
      }
    }
    ctx.restore();
  }
  let pixTurn = 0;
  FXS.pixel = function (c) {
    const { fx, P: parts, cw, ch, sz, alpha, cols, L } = c, A = anchor(c), f = A.fit * sz, th = thin(fx), dpr = fx.dpr || 1;
    const turn = pixTurn++ % 3, name = ['coin', 'heart', 'tick'][turn], col = L ? shade(cols[[2, 1, 0][turn]], -0.12) : cols[[2, 1, 0][turn]], shp = SHAPES[name];
    const pd = Math.max(1, Math.round(ch * 0.115 * f * dpr)), P = pd / dpr, W = shp.w * P, Hh = shp.h * P, snapD = (v) => Math.round(v * dpr) / dpr;
    const ox = snapD(clamp(A.small ? A.x - W / 2 : A.x - cw * 0.5 * A.fit, 1, fx.w - W - 1)), oy = snapD(clamp(A.y - Hh / 2 - ch * 0.08 * f, 1, fx.h - Hh - 1));
    const cx = ox + W / 2, cy = oy + Hh / 2, F = 26, H = F + 22, pal = palOf(col);
    const px = shp.cells.map(([cc, r, l]) => {
      const tx = ox + cc * P, ty = oy + r * P, an = rand(0, TAU), dist = ch * rand(0.5, 1.6) * f, dx = tx + P / 2 - cx, dy = ty + P / 2 - cy, dl = Math.hypot(dx, dy) || 1;
      return {
        l, tx, ty, x: tx, y: ty, b: th < 1 ? 1 : Math.round(rand(6, 10)), g: Math.round(14 + (shp.h - 1 - r) * 0.9 + rand(0, 2.5)),
        sx: th < 1 ? A.x : A.x + Math.cos(an) * dist * 1.3, sy: th < 1 ? A.y : A.y + Math.sin(an) * dist * (A.small ? 0.5 : 0.8),
        vx: (dx / dl) * rand(0.6, 2.2) * f + rand(-0.3, 0.3) * f, vy: (dy / dl) * rand(0.6, 2) * f - rand(0.8, 1.8) * f, T: Math.round(rand(18, 30)),
      };
    });
    const ringCols = cols.map((cc) => (L ? shade(cc, -0.3) : shade(cc, 0.25)));
    parts.push(part(H + 31, drawPixel, {
      x: A.x, y: A.y, P, F, H, ox, oy, cx, cy, W, hs0: Math.max(W, Hh) / 2 + P, g: 0.14 * f, al: alpha, L, px,
      rings: [{ d: 0, T: 15, R: ch * 0.9 * f, ci: 0 }, { d: 3, T: 17, R: ch * 1.3 * f, ci: 1 }, { d: 6, T: 19, R: ch * 1.7 * f, ci: 2 }].slice(0, th < 1 ? 1 : 3),
      css: Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, rgba(v, 1)])), ringCss: ringCols.map((cc) => rgba(cc, 1)),
      sp: pixS(name, col, P, dpr, 0, L), fl: pixS(name, col, P, dpr, 1, L), sh: pixS(name, col, P, dpr, 2, L), soft: soft(col, L),
    }));
  };
})();
