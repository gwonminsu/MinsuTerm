'use strict';
/*
 * Submit (Enter) flourishes, group b: see fx/kit.js for the contract.
 *   불꽃 ember        a bonfire flare whooshes up, embers coil up round it, the ground glows warm
 *   버블 bubbles      one soap bubble is blown at the caret, rises wobbling and pops into droplets
 *   하트 hearts       a heart beats twice (lub-dub), then bursts into little hearts
 *   매트릭스 matrix    a band of green rain falls onto the caret; a scan line reads back along the line
 *   번개 lightning     one bolt strikes the caret, sparks crawl away along the row
 *   컨페티 confetti    two party poppers fire in a V: curling streamers, paper fluttering down
 *   벚꽃잎 petals      a blossom spins open and a little whirlwind of petals unwinds, then drifts down
 * Everything starts at the last input position (FXKit.anchor); detailed shapes are cached sprites.
 */
(() => {
  const { TAU, sprite, paint, put, part, clamp, ease, rand, glow, rgba, shade, anchor, thin, scaleOf } = FXKit;
  const SUB = window.FX_SUBMIT;
  const span = (t, a, b) => clamp((t - a) / (b - a)); // 0 → 1 while t runs from a to b
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const blend = (ctx, L) => { ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; };
  /** How many pieces: scaled by the intensity, fewer when the layer is busy. */
  const count = (c, n) => Math.max(1, Math.round(n * thin(c.fx) * (0.7 + 0.3 * Math.min(1.4, c.k))));
  const hash = (n) => { n |= 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; };
  /** A 4-pointed twinkle. */
  const twinkleS = (col, L, q) => sprite(`b-tw|${col}|${L}|${q}`, () => paint(24, 24, q, (x) => {
    x.translate(12, 12);
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 11); g.addColorStop(0, rgba(shade(col, 0.7), 0.85)); g.addColorStop(0.4, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(-12, -12, 24, 24); }
    x.fillStyle = L ? rgba(shade(col, -0.35), 1) : rgba(shade(col, 0.85), 1);
    x.beginPath(); x.moveTo(0, -11);
    x.quadraticCurveTo(1.4, -1.4, 11, 0); x.quadraticCurveTo(1.4, 1.4, 0, 11); x.quadraticCurveTo(-1.4, 1.4, -11, 0); x.quadraticCurveTo(-1.4, -1.4, 0, -11);
    x.fill();
  }));
  function drawTwinkle(ctx, p) {
    const a = p.age++ - (p.wait || 0);
    if (a < 0) return;
    const t = a / (p.T - (p.wait || 0)), k = Math.sin(Math.PI * clamp(t));
    p.x += p.vx || 0; p.y += p.vy || 0;
    ctx.save(); blend(ctx, p.L); ctx.globalAlpha = Math.min(1, k * 1.5) * p.al;
    put(ctx, p.sp, p.x, p.y, (p.s * (0.3 + 0.7 * k)) / 24, p.rot + a * 0.04);
    ctx.restore();
  }

  /* ====================================================================================================== */
  /* 불꽃: a bonfire flares up out of the caret. Three soft tongues whoosh up and lift away, embers coil up   */
  /* round them in a widening spiral, a few crackle off sideways, the ground under them glows warm.          */
  /* ====================================================================================================== */

  const warmGlow = () => glow('b-warm', [[0, 'rgba(255,240,200,1)'], [0.2, 'rgba(255,196,104,0.72)'], [0.55, 'rgba(255,126,44,0.24)'], [1, 'rgba(255,96,24,0)']]);
  const coolGlow = () => glow('b-ember', [[0, 'rgba(255,150,70,0.9)'], [0.35, 'rgba(240,84,30,0.34)'], [1, 'rgba(200,40,10,0)']]);
  const warmGlowL = () => glow('b-warmL', [[0, 'rgba(255,146,34,0.8)'], [0.4, 'rgba(246,112,24,0.32)'], [1, 'rgba(236,96,16,0)']]);

  /** A tongue of soft flame standing on (24, 104): red-orange outside, gold within, a white-hot heart. */
  function plumeS(L, q) {
    return sprite(`b-plume|${L}|${q}`, () => paint(48, 112, q, (x) => {
      const drop = (w, h) => { // round at the foot, drawn up to a point
        const r = w / 2, cy = 104 - r;
        x.beginPath(); x.moveTo(24, 104 - h);
        x.bezierCurveTo(24 + r * 0.22, 104 - h * 0.74, 24 + r, cy - (h - w) * 0.44, 24 + r, cy);
        x.arc(24, cy, r, 0, Math.PI);
        x.bezierCurveTo(24 - r, cy - (h - w) * 0.44, 24 - r * 0.22, 104 - h * 0.74, 24, 104 - h);
        x.closePath();
      };
      const sheet = (w, h, stops) => {
        const g = x.createLinearGradient(0, 104 - h, 0, 104);
        for (const [o, c] of stops) g.addColorStop(o, c);
        x.fillStyle = g; drop(w, h); x.fill();
      };
      x.filter = `blur(${2.4 * q}px)`;
      if (L) {
        sheet(34, 96, [[0, 'rgba(214,60,10,0)'], [0.4, 'rgba(226,80,16,0.62)'], [1, 'rgba(232,96,18,0.92)']]);
        sheet(22, 70, [[0, 'rgba(244,136,26,0)'], [0.42, 'rgba(248,146,34,0.88)'], [1, 'rgba(255,178,60,1)']]);
        sheet(11, 38, [[0, 'rgba(255,214,120,0)'], [0.5, 'rgba(255,220,130,0.95)'], [1, 'rgba(255,236,176,1)']]);
      } else {
        sheet(34, 96, [[0, 'rgba(255,80,20,0)'], [0.4, 'rgba(255,96,24,0.46)'], [1, 'rgba(255,116,30,0.82)']]);
        sheet(22, 70, [[0, 'rgba(255,166,56,0)'], [0.42, 'rgba(255,176,70,0.72)'], [1, 'rgba(255,204,104,0.96)']]);
        sheet(11, 38, [[0, 'rgba(255,240,200,0)'], [0.45, 'rgba(255,246,214,0.92)'], [1, 'rgba(255,255,240,1)']]);
      }
    }));
  }
  function drawFlare(ctx, p) {
    const a = p.age++, t = a / p.T, up = ease.out(span(a, 0, 7)), off = span(t, 0.16, 1);
    const whoosh = 1 + 0.5 * Math.sin(Math.PI * Math.min(1, off * 1.5)); // it stretches up as it goes
    ctx.save(); blend(ctx, p.L);
    for (const f of p.fl) {
      const fl = 1 + 0.09 * Math.sin(a * 0.8 + f.ph) + 0.05 * Math.sin(a * 1.9 + f.ph * 3); // it flickers
      const h = p.h * f.h * up * fl * whoosh * (1 - 0.6 * off), w = p.w * f.w * (0.55 + 0.45 * up) * (1 - 0.65 * off);
      if (h < 1) continue;
      const sx = w / 34, sy = h / 96;
      ctx.globalAlpha = p.al * f.a * (1 - ease.smooth(off));
      ctx.save();
      ctx.translate(p.x + f.dx * p.w * (1 - off), p.y - p.h * 1.15 * ease.in(off) * f.h); // the flare lifts off as it dies
      ctx.rotate(f.rot + Math.sin(a * 0.45 + f.ph) * 0.08);
      ctx.drawImage(p.sp.c, -24 * sx, -104 * sy, 48 * sx, 112 * sy);
      ctx.restore();
    }
    ctx.restore();
  }
  /** The warm light: a pool on the ground and a faint column of heat above it. */
  function drawHeat(ctx, p) {
    const a = p.age++, t = a / p.T, k = ease.out(span(a, 0, 5)) * (1 - ease.smooth(span(t, 0.15, 1)));
    if (k <= 0) return;
    ctx.save(); blend(ctx, p.L);
    ctx.globalAlpha = k * p.al * (p.L ? 0.32 : 0.95);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.4); put(ctx, p.g, 0, 0, (p.r * (p.L ? 0.7 : 1) * (0.85 + 0.25 * k)) / 48); ctx.restore();
    if (!p.L) { // on a light page this only muddies: there the pool alone is enough
      ctx.globalAlpha = k * p.al * 0.3;
      ctx.translate(p.x, p.y - p.h * 0.42); ctx.scale(0.5, 1.5); put(ctx, p.g, 0, 0, (p.h * 0.48) / 48);
    }
    ctx.restore();
  }
  /** An ember carried up the spiral: white-hot, cooling through orange to red as it climbs. */
  function drawCoil(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), h = p.H * (1 - (1 - t) ** 1.8);
    const r = p.r0 + p.r1 * (h / p.H), th = p.th + p.w * a, z = Math.sin(th);
    const x = p.x + Math.cos(th) * r + Math.sin(a * 0.31 + p.ph) * p.j, y = p.y - h + z * r * 0.3;
    const px = p.px == null ? x : p.px, py = p.py == null ? y : p.py;
    p.px = x; p.py = y;
    const front = 0.5 + 0.5 * z; // the near side of the coil is brighter
    const al = Math.min(1, t / 0.05) * (1 - ease.smooth(span(t, 0.45, 1))) * (0.45 + 0.55 * front) * (0.88 + 0.12 * Math.sin(a * 0.6 + p.ph));
    if (al <= 0.01) return;
    const C = p.L ? [[255, 168, 40], [232, 100, 18], [166, 38, 10]] : [[255, 244, 206], [255, 172, 64], [236, 76, 28]];
    const col = t < 0.35 ? mix(C[0], C[1], t / 0.35) : mix(C[1], C[2], (t - 0.35) / 0.65), s = p.s * (0.72 + 0.4 * front) * (1 - 0.45 * t);
    ctx.save(); blend(ctx, p.L); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(col, 0.5 * al); ctx.lineWidth = s * 0.9;
    ctx.beginPath(); ctx.moveTo(px - (x - px) * 1.4, py - (y - py) * 1.4); ctx.lineTo(x, y); ctx.stroke(); // the streak it leaves
    ctx.globalAlpha = al * (p.L ? 0.3 : 0.6); put(ctx, t < 0.45 ? p.g : p.g2, x, y, (s * 5.2) / 48);
    ctx.globalAlpha = 1; ctx.fillStyle = rgba(col, al); ctx.beginPath(); ctx.arc(x, y, s * 0.66, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A spark spat out of the fire: a short hot streak falling away. */
  function drawCrackle(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), px = p.x, py = p.y;
    p.vx *= 0.95; p.vy = p.vy * 0.95 + p.g; p.x += p.vx; p.y += p.vy;
    const al = (1 - t) ** 1.2;
    ctx.save(); blend(ctx, p.L); ctx.lineCap = 'round';
    ctx.strokeStyle = p.L ? `rgba(214,84,10,${al})` : `rgba(255,228,156,${al})`; ctx.lineWidth = p.s;
    ctx.beginPath(); ctx.moveTo(px - (p.x - px) * 1.8, py - (p.y - py) * 1.8); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  }
  SUB.ember = (c) => {
    const { fx, P, sz, cw, ch, alpha, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx);
    const X = A.x, Y = A.y + ch * 0.36, H = Math.max(ch * F, Math.min(ch * 5.4 * sz * F, Y - 3));
    const g = L ? warmGlowL() : warmGlow(), g2 = L ? warmGlowL() : coolGlow(), fh = Math.min(ch * 3.2 * sz * F, H * 0.7);
    P.push(part(72, drawHeat, { x: X, y: Y, r: ch * 2.8 * sz * F, h: H, al: alpha, L, g }));
    P.push(part(48, drawFlare, { x: X, y: Y + ch * 0.06, h: fh, w: fh * 0.42, al: alpha, L, sp: plumeS(L, q), fl: [
      { dx: 0, h: 1, w: 1, rot: 0, a: 1, ph: rand(0, TAU) },
      { dx: -0.32, h: 0.62, w: 0.7, rot: -0.3, a: 0.85, ph: rand(0, TAU) },
      { dx: 0.3, h: 0.56, w: 0.66, rot: 0.32, a: 0.85, ph: rand(0, TAU) },
    ] }));
    const m = count(c, 46), es = sz * Math.max(F, 0.62), dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < m; i++) { // two arms of a helix: the emitter turns one way, the embers the other
      const wait = Math.round((i / m) * 20);
      P.push(part(wait + rand(44, 60), drawCoil, { x: X + rand(-0.25, 0.25) * cw * F, y: Y, wait, H: H * rand(0.7, 1.04), r0: cw * 0.35 * F, r1: ch * rand(1, 1.4) * sz * F, th: -dir * 0.22 * wait + (i % 2) * Math.PI + rand(-0.25, 0.25), w: dir * rand(0.14, 0.17), j: rand(0.2, 0.9) * F, ph: rand(0, TAU), s: rand(1.2, 2.5) * es, L, g, g2 }));
    }
    for (let i = 0, n = thin(fx) < 1 ? 3 : 7; i < n; i++) { // the fire crackles
      const an = -Math.PI / 2 + rand(-1.25, 1.25), sp = rand(1.8, 3.8) * sz * F, wait = 2 + i * 3 + ((Math.random() * 3) | 0);
      P.push(part(wait + rand(14, 24), drawCrackle, { x: X + rand(-0.4, 0.4) * cw, y: Y - ch * rand(0.2, 0.9) * F, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 0.14 * F, s: rand(0.9, 1.4) * es, wait, L }));
    }
  };

  /* ====================================================================================================== */
  /* 버블: one soap bubble is blown at the caret (it swells, overshoots, settles), rises wobbling with its    */
  /* colours swirling faster as the film thins, and pops: a flash of film, shreds of rim, a spray of drops.   */
  /* ====================================================================================================== */

  /** The film: thin-film colours (the accent among them) round the rim, almost clear where it faces you. */
  function filmS(cols, R, L, q) {
    const W = R * 2 + 8, cx = W / 2;
    return sprite(`b-film|${cols.join('/')}|${R}|${L}|${q}`, () => paint(W, W, q, (x) => {
      const tint = (cc) => (L ? shade(cc, -0.12) : shade(cc, 0.3));
      const ring = [cols[0], [255, 116, 196], [255, 214, 116], cols[1], [104, 226, 255], cols[2], cols[0]];
      const g = x.createConicGradient(-Math.PI / 2, cx, cx);
      ring.forEach((cc, i) => g.addColorStop(i / (ring.length - 1), rgba(tint(cc), 1)));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cx, R, 0, TAU); x.fill();
      x.globalCompositeOperation = 'destination-in';
      const m = x.createRadialGradient(cx, cx, 0, cx, cx, R);
      m.addColorStop(0, 'rgba(0,0,0,0.06)'); m.addColorStop(0.6, 'rgba(0,0,0,0.13)'); m.addColorStop(0.84, 'rgba(0,0,0,0.45)'); m.addColorStop(0.95, 'rgba(0,0,0,0.95)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = m; x.fillRect(0, 0, W, W);
      x.globalCompositeOperation = 'source-over';
      if (R > 20) { // colour drifting over the face of it
        x.save(); x.beginPath(); x.arc(cx, cx, R * 0.9, 0, TAU); x.clip();
        x.filter = `blur(${R * 0.06 * q}px)`; x.lineWidth = R * 0.12;
        x.strokeStyle = rgba(tint(cols[1]), L ? 0.14 : 0.12); x.beginPath(); x.ellipse(cx + R * 0.1, cx + R * 0.35, R * 0.75, R * 0.3, -0.25, Math.PI * 1.05, Math.PI * 1.9); x.stroke();
        x.strokeStyle = rgba(tint([255, 116, 196]), L ? 0.12 : 0.1); x.beginPath(); x.ellipse(cx - R * 0.15, cx - R * 0.1, R * 0.6, R * 0.38, 0.4, Math.PI * 0.05, Math.PI * 0.8); x.stroke();
        x.restore();
      }
      x.strokeStyle = L ? 'rgba(60,70,120,0.42)' : 'rgba(255,255,255,0.34)'; x.lineWidth = Math.max(0.6, R * 0.016);
      x.beginPath(); x.arc(cx, cx, R * 0.965, 0, TAU); x.stroke();
    }));
  }
  /** The light on it: a window reflection upper left, a hard glint, light coming through lower right. */
  function shineS(R, L, q) {
    const W = R * 2 + 8, cx = W / 2;
    return sprite(`b-shine|${R}|${L}|${q}`, () => paint(W, W, q, (x) => {
      x.filter = `blur(${Math.max(0.5, R * 0.03) * q}px)`; x.lineCap = 'round';
      x.strokeStyle = L ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.72)'; x.lineWidth = R * 0.13;
      x.beginPath(); x.arc(cx, cx, R * 0.72, Math.PI * 1.1, Math.PI * 1.4); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(cx - R * 0.06, cx - R * 0.7, R * 0.075, 0, TAU); x.fill();
      x.strokeStyle = L ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)'; x.lineWidth = R * 0.07;
      x.beginPath(); x.arc(cx, cx, R * 0.78, Math.PI * 0.12, Math.PI * 0.4); x.stroke();
      if (L) { x.filter = 'none'; x.strokeStyle = 'rgba(80,90,130,0.25)'; x.lineWidth = R * 0.05; x.beginPath(); x.arc(cx, cx, R * 0.9, Math.PI * 0.55, Math.PI * 0.95); x.stroke(); }
    }));
  }
  function drawBubble(ctx, p) {
    const a = p.age++, L = p.L, g = span(a, 0, p.grow), r = p.r * Math.max(0.06, 1 - (1 - g) ** 2.2); // blown up, slowing as it fills
    const fly = Math.max(0, a - p.grow), fu = clamp(fly / (p.pop - p.grow));
    const sway = p.sway * Math.sin(fly * 0.13) * clamp(fly / 10);
    const wob = (0.08 * Math.exp(-fly * 0.05) + 0.03) * Math.sin(a * 0.45) * g; // the film jiggles, then settles
    const sx = (1 - 0.14 * (1 - g)) * (1 + wob), sy = (1 + 0.16 * (1 - g)) * (1 - wob);
    const cx = p.x + sway, cy = p.y - r * sy * 0.95 - p.rise * fu ** 1.35;
    p.cx = cx; p.cy = cy; p.cr = r;
    ctx.save(); blend(ctx, L);
    if (a >= p.pop) { // it bursts: the film flares for an instant and is gone
      const u = (a - p.pop) / 4;
      if (u <= 1) {
        ctx.globalAlpha = (1 - u) * p.al; put(ctx, p.film, cx, cy, (r * (1.05 + 0.18 * u)) / p.R, p.rot + a * 0.03);
        ctx.strokeStyle = L ? `rgba(90,100,150,${0.7 * (1 - u)})` : `rgba(255,255,255,${0.9 * (1 - u)})`; ctx.lineWidth = 1.4 * (1 - u) + 0.4;
        ctx.beginPath(); ctx.arc(cx, cy, r * (1 + 0.12 * u), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.translate(cx, cy); ctx.scale(sx, sy);
    ctx.globalAlpha = p.al * Math.min(1, (a + 1) / 3);
    put(ctx, p.film, 0, 0, r / p.R, p.rot + a * (0.025 + 0.06 * fu * fu)); // the colours swirl faster as the film thins
    put(ctx, p.shine, 0, 0, r / p.R);
    ctx.restore();
  }
  function drawMiniBubble(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), gr = ease.back(span(a, 0, 6)), r = p.r * gr;
    p.ph += 0.12; p.vx *= 0.97; p.x += p.vx + Math.sin(p.ph) * 0.3; p.y += p.vy;
    ctx.save(); blend(ctx, p.L); ctx.globalAlpha = p.al * (t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1);
    put(ctx, p.film, p.x, p.y, r / 10, a * 0.05);
    put(ctx, p.shine, p.x, p.y, r / 10);
    ctx.restore();
  }
  /** A drop of the film flung off by the pop. */
  function drawDroplet(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    if (p.x == null) { const s = p.src; p.x = s.cx + Math.cos(p.an) * s.cr; p.y = s.cy + Math.sin(p.an) * s.cr; }
    const t = a / (p.T - p.wait);
    p.vx *= 0.93; p.vy = p.vy * 0.93 + p.g; p.x += p.vx; p.y += p.vy;
    const al = (1 - t) ** 1.1 * p.al, r = p.s * (1 - 0.45 * t);
    ctx.save(); blend(ctx, p.L);
    ctx.fillStyle = rgba(p.col, 0.85 * al); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.9 * al})`; ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A shred of the rim curling away, or (whole) the ring the pop leaves. */
  function drawShred(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    if (p.cx == null) { p.cx = p.src.cx; p.cy = p.src.cy; p.r = p.src.cr; }
    const u = a / (p.T - p.wait), r = p.r * (1 + p.grow * ease.out(u)), an = p.an + p.spin * a, len = p.len * (1 - 0.65 * u);
    ctx.save(); blend(ctx, p.L); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.col, (1 - u) * 0.85 * p.al); ctx.lineWidth = p.w * (1 - 0.5 * u);
    ctx.beginPath(); ctx.arc(p.cx, p.cy + u * u * p.fall, r, an - len / 2, an + len / 2); ctx.stroke();
    ctx.restore();
  }
  SUB.bubbles = (c) => {
    const { fx, P, sz, cw, ch, cols, alpha, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx), th = thin(fx);
    const y0 = A.small ? A.y + Math.min(ch * 0.8, fx.h * 0.29) * 0.92 : A.y + ch * 0.42;
    const R = A.small ? Math.min(ch * 0.8, fx.h * 0.29) : Math.max(ch * 0.6, Math.min(ch * 1.3 * sz * F, (y0 - 3) / 2.05)); // smaller on a first line, so it stays in
    const rise = A.small ? fx.h * 0.13 : Math.max(0, Math.min(ch * 2.8 * F, y0 - R * 2.2 - 4));
    const pop = 58, film = filmS(cols, 48, L, q), shine = shineS(48, L, q), al = Math.max(0.75, alpha);
    const tint = (cc) => (L ? shade(cc, -0.18) : shade(cc, 0.45)), ring = [cols[0], [255, 116, 196], [255, 214, 116], cols[1], [104, 226, 255], cols[2]].map(tint);
    const b = part(pop + 6, drawBubble, { x: A.x, y: y0, r: R, R: 48, grow: 18, pop, rise, sway: cw * 0.6 * F, rot: rand(0, TAU), al, L, film, shine });
    P.push(b);
    const mf = filmS(cols, 10, L, q), ms = shineS(10, L, q);
    for (let i = 0, n = th < 1 ? 2 : 4; i < n; i++) { // little ones blown along with it
      const wait = 6 + i * 4 + ((Math.random() * 4) | 0);
      P.push(part(wait + rand(34, 50), drawMiniBubble, { x: A.x + rand(-0.6, 0.6) * cw, y: y0 - ch * 0.3 * F, vx: rand(-0.9, 0.9) * F, vy: -rand(0.5, 1.1) * sz * F, r: rand(0.16, 0.3) * R, ph: rand(0, TAU), wait, al, L, film: mf, shine: ms }));
    }
    for (let i = 0, n = count(c, 20); i < n; i++) { // the pop throws drops all round
      const an = (i / n) * TAU + rand(-0.15, 0.15), sp = rand(0.9, 2.4) * sz * Math.max(F, 0.5);
      P.push(part(pop + rand(20, 30), drawDroplet, { src: b, wait: pop, an, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 0.5, g: 0.12 * F, s: rand(1.1, 2) * Math.max(F, 0.6) * sz, col: ring[i % ring.length], al, L }));
    }
    for (let i = 0; i < 6; i++) P.push(part(pop + rand(10, 14), drawShred, { src: b, wait: pop, an: (i / 6) * TAU + rand(-0.3, 0.3), spin: rand(-0.06, 0.06), len: rand(0.5, 0.9), grow: rand(0.25, 0.5), fall: ch * 0.4 * F, w: Math.max(1, R * 0.07), col: ring[(i * 2) % ring.length], al, L }));
    P.push(part(pop + 10, drawShred, { src: b, wait: pop, an: 0, spin: 0, len: TAU, grow: 0.5, fall: 0, w: 1.2, col: L ? [110, 120, 165] : [255, 255, 255], al: al * 0.8, L }));
  };

  /* ====================================================================================================== */
  /* 하트: a glossy heart pops out of the caret and beats twice, lub-dub, a pulse running out of it each time; */
  /* then it bursts into little hearts that drift up and away.                                                */
  /* ====================================================================================================== */

  const HEART = (() => { // the classic heart curve, 1 wide, centred: tip at about +0.44, lobes at -0.44
    const path = new Path2D();
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * TAU, hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      if (i) path.lineTo(hx / 33, -(hy + 2.5) / 33); else path.moveTo(hx / 33, -(hy + 2.5) / 33);
    }
    path.closePath();
    return path;
  })();
  const PINK = [255, 92, 142];
  /** A glossy heart S px wide: lit upper left, deeper toward the tip, darkening round its edge, a shine on the left lobe. */
  function heartS(col, S, L, q) {
    return sprite(`b-heart|${col}|${S}|${L}|${q}`, () => paint(S + 8, S + 8, q, (x) => {
      const deep = shade(col, -0.52), lit = shade(col, 0.5);
      x.translate(S / 2 + 4, S / 2 + 4);
      x.save(); x.scale(S, S);
      const g = x.createRadialGradient(-0.17, -0.2, 0.02, -0.04, -0.02, 0.64);
      g.addColorStop(0, rgba(lit, 1)); g.addColorStop(0.38, rgba(col, 1)); g.addColorStop(1, rgba(deep, 1));
      x.fillStyle = g; x.fill(HEART);
      x.clip(HEART);
      x.filter = `blur(${Math.max(0.6, S * 0.05) * q}px)`;
      x.strokeStyle = rgba(deep, 0.6); x.lineWidth = 0.1; x.stroke(HEART); // a soft dark edge, as on anything round
      x.filter = `blur(${Math.max(0.4, S * 0.025) * q}px)`;
      x.strokeStyle = rgba(lit, 0.55); x.lineWidth = 0.04; x.beginPath(); x.arc(0, -0.1, 0.44, 0.3, 1.25); x.stroke(); // light bounced into the lower edge
      x.fillStyle = 'rgba(255,255,255,0.78)'; x.beginPath(); x.ellipse(-0.24, -0.24, 0.12, 0.055, -0.75, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(0.19, -0.3, 0.04, 0, TAU); x.fill();
      x.restore();
      x.filter = 'none';
      x.scale(S, S); x.strokeStyle = rgba(shade(col, -0.62), L ? 0.7 : 0.42); x.lineWidth = 0.9 / S; x.stroke(HEART);
    }));
  }
  const pinkGlow = () => glow('b-pink', [[0, 'rgba(255,190,214,0.9)'], [0.3, 'rgba(255,110,160,0.4)'], [1, 'rgba(255,80,140,0)']]);
  /** A heartbeat: up in 3 frames, dying away after; u = frames since the beat. */
  const pulse = (u) => (u < 0 ? 0 : u < 3 ? ease.out(u / 3) : Math.exp(-(u - 3) * 0.32));
  function drawBigHeart(ctx, p) {
    const a = p.age++, come = ease.out(span(a, 0, 9));
    const x = p.x0 + (p.x1 - p.x0) * come, y = p.y0 + (p.y1 - p.y0) * come;
    p.cx = x; p.cy = y;
    const beat = pulse(a - p.b1) * 0.2 + pulse(a - p.b2) * 0.13, bu = span(a, p.burst, p.burst + 6);
    const sc = (0.15 + 0.85 * ease.back(span(a, 0, 9))) * (1 + 0.4 * ease.out(bu)), al = 1 - ease.in(bu);
    if (al <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    ctx.globalAlpha = (p.L ? 0.06 + beat * 0.8 : 0.26 + beat * 2.2) * al * p.al;
    put(ctx, p.glow, x, y, (p.S * (p.L ? 0.85 : 1.05) * (1 + beat * 1.7) * sc) / 48);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(x, y); ctx.rotate(p.rot * (1 - come)); ctx.scale(sc * (1 + beat * 1.1), sc * (1 + beat * 0.8));
    ctx.drawImage(p.sp.c, -p.sp.w / 2, -p.sp.h / 2, p.sp.w, p.sp.h);
    ctx.restore();
  }
  /** The pulse a beat sends out: the outline of the heart, swelling and fading. */
  function drawBeatRing(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const u = a / (p.T - p.wait), s = p.S * (1.05 + 0.75 * ease.out(u));
    ctx.save(); blend(ctx, p.L);
    ctx.translate(p.src.cx, p.src.cy); ctx.scale(s, s);
    ctx.strokeStyle = p.L ? `rgba(214,40,96,${0.75 * (1 - u)})` : `rgba(255,170,200,${0.8 * (1 - u)})`; ctx.lineWidth = (1.8 * (1 - 0.6 * u)) / s;
    ctx.stroke(HEART);
    ctx.restore();
  }
  function drawLittleHeart(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    if (p.x == null) { p.x = p.src.cx + Math.cos(p.an) * p.d0; p.y = p.src.cy + Math.sin(p.an) * p.d0; }
    const t = a / (p.T - p.wait);
    p.vx *= 0.89; p.vy = p.vy * 0.89 - p.up * 0.11; p.ph += 0.09; // flung out, then floating up
    p.x += p.vx + Math.sin(p.ph) * 0.3 * p.k; p.y += p.vy;
    const s = p.s * ease.back(span(a, 0, 7)), al = 1 - ease.smooth(span(t, 0.55, 1));
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    put(ctx, p.sp, p.x, p.y, s, Math.sin(p.ph) * 0.22 + p.tilt);
    ctx.restore();
  }
  SUB.hearts = (c) => {
    const { fx, P, sz, cw, ch, alpha, pick, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx);
    const S = A.small ? Math.round(fx.h * 0.56) : Math.round(ch * 2 * sz * F);
    const x1 = A.small ? A.x : A.x + S * 0.55, y1 = A.small ? A.y : Math.max(S * 0.55, A.y - S * 0.5);
    const big = part(46, drawBigHeart, { x0: A.x, y0: A.y, x1, y1, S, b1: 13, b2: 22, burst: 36, rot: rand(-0.4, 0.4), al: alpha, L, sp: heartS(PINK, S, L, q), glow: pinkGlow() });
    P.push(big);
    for (const [w, T] of [[13, 16], [22, 15]]) P.push(part(w + T, drawBeatRing, { src: big, wait: w, S, L }));
    const n = count(c, 18), ls = Math.max(9, Math.round(S * 0.4)), es = A.small ? 0.55 : F * sz;
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? [255, 120, 170] : pick(), an = (i / n) * TAU + rand(-0.2, 0.2), sp = rand(1.8, 4) * es;
      P.push(part(36 + rand(36, 52), drawLittleHeart, { src: big, wait: 36, an, d0: S * 0.2, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, up: rand(0.35, 0.8) * es, ph: rand(0, TAU), k: es, tilt: rand(-0.2, 0.2), s: rand(0.65, 1.05), sp: heartS(col, ls, L, q) }));
    }
    const tw = twinkleS([255, 214, 230], L, q);
    for (let i = 0, m = thin(fx) < 1 ? 3 : 6; i < m; i++) { const an = rand(0, TAU), d = S * rand(0.45, 0.8); P.push(part(36 + rand(14, 22), drawTwinkle, { wait: 34 + (i % 3) * 2, x: x1 + Math.cos(an) * d, y: y1 + Math.sin(an) * d, vy: -0.3 * es, s: rand(7, 12) * Math.max(0.6, es), rot: rand(0, 1.5), al: 1, L, sp: tw })); }
  };

  /* ====================================================================================================== */
  /* 매트릭스: a band of digital rain falls onto the caret, each column's white head lighting the cells it     */
  /* passes; where it lands the sign flickers, settles and goes out; then a green scan line reads back along  */
  /* what was submitted.                                                                                      */
  /* ====================================================================================================== */

  const KANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789';
  /** All of KANA in one strip, in one tone (0 the white-hot head, 1 bright, 2 deep), its glow baked in. */
  function kanaS(fs, tone, L, q) {
    return sprite(`b-kana|${fs}|${tone}|${L}|${q}`, () => {
      const gw = Math.ceil(fs * 0.75) + 8, gh = Math.ceil(fs * 1.2) + 8;
      const s = paint(gw * KANA.length, gh, q, (x) => {
        x.font = `${fs}px 'Cascadia Mono', Consolas, 'MS Gothic', monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.shadowColor = L ? ['rgba(16,150,70,0.55)', 'rgba(24,160,80,0.35)', 'rgba(0,0,0,0)'][tone] : ['rgba(170,255,200,0.95)', 'rgba(60,240,130,0.8)', 'rgba(20,180,80,0.45)'][tone];
        x.shadowBlur = (tone ? 3 : 5) * q;
        x.fillStyle = L ? ['#04341a', '#0a8a3c', '#43a86a'][tone] : ['#f2fff4', '#66ff98', '#22c45c'][tone];
        for (let i = 0; i < KANA.length; i++) x.fillText(KANA[i], gw * i + gw / 2, gh / 2);
      });
      s.gw = gw; s.gh = gh; s.k = s.c.width / s.w;
      return s;
    });
  }
  const kana = (ctx, s, i, x, y) => ctx.drawImage(s.c, s.gw * i * s.k, 0, s.gw * s.k, s.c.height, x - s.gw / 2, y - s.gh / 2, s.gw, s.gh);
  const greenGlow = (L) => (L ? glow('b-greenL', [[0, 'rgba(30,170,80,0.5)'], [0.4, 'rgba(30,160,80,0.2)'], [1, 'rgba(30,160,80,0)']]) : glow('b-green', [[0, 'rgba(200,255,214,0.95)'], [0.25, 'rgba(70,240,130,0.45)'], [1, 'rgba(20,200,90,0)']]));
  /** The light of the rain: a band of green, fading upward and to the sides. */
  const bandS = (L) => sprite(`b-band|${L}`, () => paint(32, 128, 1, (x) => {
    const g = x.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(40,220,110,0)'); g.addColorStop(0.5, L ? 'rgba(20,150,70,0.5)' : 'rgba(60,255,130,0.5)'); g.addColorStop(1, 'rgba(40,220,110,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    x.globalCompositeOperation = 'destination-in';
    const v = x.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(0,0,0,0.6)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = v; x.fillRect(0, 0, 32, 128);
  }));
  /** One column of rain: its head falls a cell at a time, lit cells fade behind it, flickering. */
  function drawRain(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const fade = 1 - span(a, p.T - p.wait - 6, p.T - p.wait);
    ctx.save(); blend(ctx, p.L);
    for (let r = p.n; r >= 0; r--) {
      const u = a - (p.n - r) / p.v; // frames since the head reached this cell
      if (u < 0) break;
      const y = p.y - r * p.pitch;
      let tone, al, gi;
      if (r === 0) { // where it lands: flickers through a few signs, settles on one, goes out
        tone = u < 3 ? 0 : 1; al = 1 - span(u, 8, 18);
        gi = u < 8 ? hash(p.seed + a) % KANA.length : p.fin;
        if (u < 12) { ctx.globalAlpha = (1 - u / 12) * (p.L ? 0.3 : 0.6) * p.al * fade; put(ctx, p.glow, p.x, y, (p.pitch * (p.L ? 0.9 : 1.3)) / 48); }
      } else {
        al = (1 - span(u, 0, p.tail)) ** 0.7;
        tone = u < 2 ? 0 : u < p.tail * 0.45 ? 1 : 2;
        gi = hash(p.seed + r * 7919 + (((a + r * 5) / p.flick) | 0)) % KANA.length;
      }
      al *= fade * p.al;
      if (al <= 0.02) continue;
      ctx.globalAlpha = al;
      kana(ctx, p.atlas[tone], gi, p.x, y);
    }
    ctx.restore();
  }
  function drawBand(ctx, p) {
    const a = p.age++, t = a / p.T, k = ease.out(span(a, 0, 8)) * (1 - ease.smooth(span(t, 0.35, 1)));
    if (k <= 0) return;
    ctx.save(); blend(ctx, p.L); ctx.globalAlpha = k * (p.L ? 0.1 : 0.3) * p.al;
    ctx.drawImage(p.sp.c, p.x - p.w / 2, p.top, p.w, p.y - p.top);
    ctx.restore();
  }
  /** The scan line: a bright head runs from the caret back to where the line starts, lighting it as it goes. */
  function drawScan(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const run = ease.smooth(span(a, 0, p.run)), out = 1 - ease.smooth(span(a, p.run * 0.8, p.T - p.wait)), L = p.L;
    const hx = p.x1 + (p.x0 - p.x1) * run, right = p.x1 + p.pad;
    if (out <= 0) return;
    ctx.save(); blend(ctx, L);
    let g = ctx.createLinearGradient(hx, 0, right, 0); // the line, brightest where the head is
    g.addColorStop(0, L ? `rgba(8,130,58,${0.95 * out})` : `rgba(170,255,200,${out})`); g.addColorStop(0.2, L ? `rgba(16,150,70,${0.6 * out})` : `rgba(70,240,130,${0.75 * out})`); g.addColorStop(1, L ? `rgba(16,150,70,${0.25 * out})` : `rgba(40,200,100,${0.3 * out})`);
    ctx.fillStyle = g; ctx.fillRect(hx, p.y - 0.6, right - hx, 1.3);
    const wash = Math.min(right - hx, p.cw * 4); // a green wash over the text just read
    if (wash > 1) {
      g = ctx.createLinearGradient(hx, 0, hx + wash, 0);
      g.addColorStop(0, L ? `rgba(30,170,80,${0.16 * out})` : `rgba(60,255,130,${0.22 * out})`); g.addColorStop(1, 'rgba(60,255,130,0)');
      ctx.fillStyle = g; ctx.fillRect(hx, p.y - p.ch, wash, p.ch);
    }
    if (run < 1) { // the head
      ctx.globalAlpha = out * p.al;
      ctx.save(); ctx.translate(hx, p.y - p.ch * 0.35); ctx.scale(0.35, 1); put(ctx, p.glow, 0, 0, (p.ch * 1.1) / 48); ctx.restore();
      ctx.fillStyle = L ? 'rgba(4,90,40,0.95)' : 'rgba(235,255,240,1)'; ctx.fillRect(hx - 0.8, p.y - p.ch * 0.92, 1.6, p.ch * 0.92);
    }
    ctx.restore();
  }
  SUB.matrix = (c) => {
    const { fx, P, sz, cw, ch, alpha, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx);
    const pitch = A.small ? Math.max(7, Math.round(ch * 0.62)) : ch, fs = Math.max(7, Math.round(pitch * 0.78 * (A.small ? 1 : Math.min(1.15, sz))));
    const atlas = [0, 1, 2].map((t) => kanaS(fs, t, L, q)), gl = greenGlow(L), rows = Math.max(2, Math.min(9, Math.floor((A.y - pitch * 0.5) / pitch)));
    const half = A.small ? 5 : 4, gap = A.small ? Math.max(6, cw) : cw, v = 0.5;
    let land = 0;
    for (let i = -half; i <= half; i++) {
      if (thin(fx) < 1 && i % 2) continue;
      const edge = Math.abs(i) / half, n = i ? Math.max(2, rows - Math.floor(rand(0, 3.5))) : rows, wait = Math.round(Math.abs(i) * 0.9 + rand(0, 6));
      if (!i) land = wait + n / v;
      P.push(part(wait + n / v + 24, drawRain, { x: A.x + i * gap, y: A.y, n, v, pitch, wait, tail: rand(14, 24) * (1 - edge * 0.3), flick: rand(3, 7), seed: (Math.random() * 1e9) | 0, fin: (Math.random() * KANA.length) | 0, atlas, glow: gl, al: alpha * (1 - edge * 0.4), L }));
    }
    const top = Math.max(0, A.y - (rows + 0.6) * pitch);
    P.push(part(Math.round(land) + 26, drawBand, { x: A.x, w: (half * 2 + 1.6) * gap, top, y: A.y + pitch * 0.5, al: alpha, L, sp: bandS(L) }));
    const x1 = A.x + cw * 0.5, x0 = Math.min(A.x0, x1 - cw * 3), cells = (x1 - x0) / cw, run = Math.round(clamp(cells * 0.9, 10, 22));
    P.push(part(Math.round(land) + run + 16, drawScan, { wait: Math.round(land) + 1, x0, x1, pad: cw * 1.5, y: A.y + ch * 0.5 - 1, ch, cw, run, al: alpha, L, glow: gl }));
  };

  /* ====================================================================================================== */
  /* 번개: a leader steps down from above and the bolt strikes the caret, branches and all; one local flash,   */
  /* a ring on the ground, then sparks crawl away along the row and a few hot ones bounce off.               */
  /* ====================================================================================================== */

  /** A jagged path from (x0, y0) to (x1, y1), by midpoint displacement. */
  function jag(x0, y0, x1, y1, depth, rough) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay) || 1, o = (Math.random() - 0.5) * len * rough;
        out.push([(ax + bx) / 2 - ((by - ay) / len) * o, (ay + by) / 2 + ((bx - ax) / len) * o], pts[i]);
      }
      pts = out;
    }
    return pts;
  }
  const trace = (path, pts, n) => { path.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]); };
  function drawBolt(ctx, p) {
    const a = p.age++, L = p.L, lead = a < p.hit;
    const u = span(a, p.hit, p.T), shown = lead ? Math.ceil(p.main.length * ((a + 1) / p.hit)) : p.main.length;
    const main = new Path2D(), arms = new Path2D();
    trace(main, p.main, shown);
    for (const b of p.arms) if (b.at < shown) trace(arms, b.pts, lead ? Math.min(b.pts.length, Math.ceil((shown - b.at) * 1.5)) : b.pts.length);
    const halo = lead ? 0.35 : (1 - u) ** 1.2, core = lead ? 0.5 : (1 - u) ** 2.4, wd = p.wd * (lead ? 0.6 : 1 - 0.35 * u);
    ctx.save(); blend(ctx, L); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [path, k] of [[main, 1], [arms, 0.65]]) {
      ctx.strokeStyle = rgba(p.col, (L ? 0.22 : 0.2) * halo * k); ctx.lineWidth = wd * 7 * k; ctx.stroke(path);
      ctx.strokeStyle = rgba(L ? shade(p.col, -0.2) : shade(p.col, 0.25), (L ? 0.7 : 0.6) * halo * k); ctx.lineWidth = wd * 2.6 * k; ctx.stroke(path);
      ctx.strokeStyle = L ? rgba(shade(p.col, -0.62), 0.95 * core) : `rgba(255,255,255,${0.95 * core})`; ctx.lineWidth = wd * 1.15 * Math.max(0.6, k); ctx.stroke(path);
    }
    ctx.restore();
  }
  /** The single flash: light round the strike point and, fainter, up the channel. */
  function drawStrikeLight(ctx, p) {
    const a = p.age++, u = (a - p.hit) / (p.T - p.hit);
    if (u < 0 || u > 1) return;
    const k = (1 - u) ** 2;
    ctx.save(); blend(ctx, p.L);
    ctx.globalAlpha = k * (p.L ? 0.2 : 0.55) * p.al; put(ctx, p.g, p.x, p.y, (p.r * (p.L ? 0.75 : 1)) / 48);
    ctx.globalAlpha = k * (p.L ? 0.08 : 0.18) * p.al;
    ctx.translate(p.x, (p.y + p.top) / 2); ctx.scale(0.3, 1); put(ctx, p.g, 0, 0, ((p.y - p.top) * 0.6) / 48);
    ctx.restore();
  }
  /** Where it hit: a ring running out over the ground and a spot that cools. */
  function drawImpact(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const L = p.L, u = clamp(a / 16), v = a / (p.T - p.wait);
    ctx.save(); blend(ctx, L);
    if (u < 1) {
      const rx = p.cw * (0.8 + 5 * ease.out(u));
      ctx.strokeStyle = rgba(L ? shade(p.col, -0.25) : shade(p.col, 0.45), 0.8 * (1 - u) * p.al); ctx.lineWidth = 1.4 * (1 - 0.5 * u);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, rx * 0.22, 0, 0, TAU); ctx.stroke();
    }
    const hot = (1 - v) ** 1.5;
    ctx.fillStyle = L ? rgba(shade(p.col, -0.4), 0.7 * hot) : rgba(mix([255, 255, 255], p.col, Math.min(1, v * 2.5)), 0.85 * hot);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.cw * (0.9 - 0.4 * v), Math.max(0.8, p.cw * 0.22), 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A spark crawling along the row: a short live arc, its shape redrawn every other frame. */
  function drawCrawl(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), L = p.L;
    p.hx += p.v * p.d; p.v *= 0.95;
    if (!p.pts || a % 2 === 0) {
      const tail = p.hx - p.d * p.len * (1 - 0.5 * t), pts = [];
      for (let i = 0; i <= 6; i++) pts.push([tail + (p.hx - tail) * (i / 6), p.y + (i && i < 6 ? (Math.random() - 0.5) * p.amp * 2 : 0)]);
      if (Math.random() < 0.5) pts[3][1] -= p.amp * 1.6; // now and then it jumps up off the line
      p.pts = pts;
    }
    const al = (1 - t) ** 1.3 * p.al, path = new Path2D();
    trace(path, p.pts, p.pts.length);
    ctx.save(); blend(ctx, L); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(p.col, 0.4 * al); ctx.lineWidth = 3.6; ctx.stroke(path);
    ctx.strokeStyle = L ? rgba(shade(p.col, -0.6), 0.9 * al) : `rgba(255,255,255,${0.9 * al})`; ctx.lineWidth = 1; ctx.stroke(path);
    ctx.globalAlpha = al; put(ctx, p.g, p.hx, p.y, (p.cw * 1.4) / 48);
    ctx.restore();
  }
  function drawZap(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), px = p.x, py = p.y;
    p.vx *= 0.96; p.vy += p.g; p.x += p.vx; p.y += p.vy;
    if (p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.4; p.vx *= 0.7; } // a hop off the ground
    const al = (1 - t) * p.al;
    ctx.save(); blend(ctx, p.L); ctx.lineCap = 'round';
    ctx.strokeStyle = p.L ? rgba(shade(p.col, -0.5), al) : rgba(mix([255, 255, 255], p.col, t), al); ctx.lineWidth = p.s;
    ctx.beginPath(); ctx.moveTo(px - (p.x - px) * 1.5, py - (p.y - py) * 1.5); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  }
  SUB.lightning = (c) => {
    const { fx, P, sz, cw, ch, cols, alpha, L } = c, A = anchor(c), F = A.fit, th = thin(fx);
    const col = cols[0], gx = A.x, gy = A.y + ch * 0.38, top = Math.max(1, gy - ch * 8.5 * F);
    const g = glow(`b-volt|${col}|${L}`, L ? [[0, rgba(col, 0.6)], [0.4, rgba(col, 0.22)], [1, rgba(col, 0)]] : [[0, 'rgba(255,255,255,1)'], [0.2, rgba(shade(col, 0.55), 0.6)], [0.6, rgba(col, 0.16)], [1, rgba(col, 0)]]);
    const main = jag(gx + rand(-1, 1) * ch * 1.5 * F, top, gx, gy, 5, 0.42), arms = [];
    for (let i = 0, n = th < 1 ? 3 : 5; i < n; i++) { // branches fork off, down and outward
      const at = Math.round(main.length * (0.1 + (i / n) * 0.65 + rand(0, 0.08))), [bx, by] = main[at], [nx, ny] = main[Math.min(main.length - 1, at + 2)];
      const an = Math.atan2(ny - by, nx - bx) + (i % 2 ? 1 : -1) * rand(0.45, 0.9), len = Math.hypot(gx - bx, gy - by) * rand(0.3, 0.55);
      arms.push({ at, pts: jag(bx, by, bx + Math.cos(an) * len, by + Math.sin(an) * len, 4, 0.5) });
    }
    const hit = 4, wd = Math.max(0.7, sz * Math.max(F, 0.6));
    P.push(part(hit + 18, drawStrikeLight, { x: gx, y: gy, top, hit, r: ch * 3.2 * F * sz, al: alpha, L, g }));
    P.push(part(hit + 22, drawBolt, { main, arms, hit, wd, col, L }));
    P.push(part(hit + 28, drawImpact, { wait: hit, x: gx, y: gy, cw: cw * Math.max(F, 0.6), col, al: alpha, L }));
    for (let i = 0, n = th < 1 ? 2 : 4; i < n; i++) { // sparks crawling off along the row, both ways
      const wait = hit + (i >> 1) * 4 + ((Math.random() * 3) | 0);
      P.push(part(wait + rand(28, 38), drawCrawl, { wait, hx: gx, y: gy, d: i % 2 ? 1 : -1, v: rand(2.4, 3.6) * sz * F * (i >> 1 ? 0.7 : 1), len: cw * rand(1.6, 2.6) * F, amp: ch * 0.14 * F, cw, col, al: alpha, L, g }));
    }
    for (let i = 0, n = th < 1 ? 4 : 9; i < n; i++) {
      const an = -Math.PI / 2 + rand(-1.3, 1.3), sp = rand(1.5, 3.6) * sz * F;
      P.push(part(hit + rand(14, 26), drawZap, { wait: hit, x: gx, y: gy - 1, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 0.16 * F, floor: gy, s: rand(0.8, 1.3), col, al: 1, L }));
    }
  };

  /* ====================================================================================================== */
  /* 컨페티: two party poppers jump up at the caret in a V and fire: a flash and a puff at each mouth,        */
  /* serpentine streamers curling out, paper in the theme's colours tumbling and fluttering down.             */
  /* ====================================================================================================== */

  /** A party popper, mouth up, its tip at (14, 39): a cone of card wound with a stripe, foil at the rim. */
  function popperS(c1, c2, q) {
    return sprite(`b-popper|${c1}|${c2}|${q}`, () => paint(28, 42, q, (x) => {
      const body = new Path2D();
      body.moveTo(3.5, 8); body.lineTo(13, 38.2); body.quadraticCurveTo(14, 39.6, 15, 38.2); body.lineTo(24.5, 8);
      body.ellipse(14, 8, 10.5, 3.4, 0, 0, Math.PI); // the near half of the rim
      body.closePath();
      x.fillStyle = rgba(c1, 1); x.fill(body);
      x.save(); x.clip(body);
      x.strokeStyle = rgba(c2, 1); x.lineWidth = 3.4;
      for (let i = -3; i < 7; i++) { x.beginPath(); x.moveTo(0, 4 + i * 7); x.lineTo(28, 15 + i * 7); x.stroke(); }
      const sh = x.createLinearGradient(3.5, 0, 24.5, 0); // round, lit from the upper left
      sh.addColorStop(0, 'rgba(0,0,0,0.38)'); sh.addColorStop(0.28, 'rgba(255,255,255,0.38)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.04)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)');
      x.fillStyle = sh; x.fillRect(0, 0, 28, 42);
      x.restore();
      x.strokeStyle = 'rgba(0,0,0,0.38)'; x.lineWidth = 0.7; x.stroke(body);
      x.fillStyle = rgba(shade(c1, -0.7), 1); x.beginPath(); x.ellipse(14, 8, 9.6, 2.8, 0, 0, TAU); x.fill(); // inside the mouth
      const fo = x.createLinearGradient(3.5, 0, 24.5, 0);
      fo.addColorStop(0, '#b8862c'); fo.addColorStop(0.3, '#fff2bf'); fo.addColorStop(0.6, '#e2b24a'); fo.addColorStop(1, '#8a5d16');
      x.strokeStyle = fo; x.lineWidth = 1.5; x.beginPath(); x.ellipse(14, 8, 10.2, 3.2, 0, 0, TAU); x.stroke();
    }));
  }
  const puffGlow = () => glow('b-puff', [[0, 'rgba(255,250,236,0.95)'], [0.35, 'rgba(255,236,190,0.4)'], [1, 'rgba(255,220,160,0)']]);
  const smokeS = (L) => glow(`b-smoke|${L}`, L ? [[0, 'rgba(150,150,160,0.5)'], [0.5, 'rgba(150,150,160,0.2)'], [1, 'rgba(150,150,160,0)']] : [[0, 'rgba(235,235,245,0.5)'], [0.5, 'rgba(220,220,235,0.18)'], [1, 'rgba(220,220,235,0)']]);
  function drawPopper(ctx, p) {
    const a = p.age++, t = a / p.T, inn = ease.back(span(a, 0, 5)), f = a - p.fire;
    const kick = f >= 0 ? Math.exp(-f * 0.3) * Math.sin(Math.min(Math.PI, f * 0.9)) : 0, al = 1 - ease.smooth(span(t, 0.45, 1));
    if (al <= 0) return;
    const back = kick * p.s * 0.2; // the recoil, along its own axis
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(p.x - Math.sin(p.ang) * back, p.y + Math.cos(p.ang) * back); ctx.rotate(p.ang * (0.6 + 0.4 * inn) + kick * 0.1 * Math.sign(p.ang));
    const sc = (p.s / 42) * (0.4 + 0.6 * inn);
    ctx.drawImage(p.sp.c, -14 * sc, -39 * sc, 28 * sc, 42 * sc);
    ctx.restore();
  }
  /** The bang at a popper's mouth: a flash, a puff of smoke rolling out. */
  function drawBang(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const u = a / (p.T - p.wait);
    ctx.save();
    if (!p.L && a < 8) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - a / 8) ** 2 * 0.7 * p.al; put(ctx, p.g, p.x, p.y, p.r / 48); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 3; i++) {
      const d = p.r * (0.3 + 1.1 * ease.out(u)) * (0.6 + i * 0.3), an = p.ang + (i - 1) * 0.5;
      ctx.globalAlpha = (1 - u) ** 1.5 * 0.55;
      put(ctx, p.smoke, p.x + Math.sin(an) * d, p.y - Math.cos(an) * d - u * p.r * 0.4, (p.r * (0.35 + 0.5 * u)) / 48);
    }
    ctx.restore();
  }
  /** A scrap of paper: shot out, slowed by the air, then tumbling down, showing its face and its back. */
  function drawPaper(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    p.vx *= p.drag; p.vy = Math.min(p.vt, p.vy * p.drag + p.g);
    const calm = clamp(1 - Math.hypot(p.vx, p.vy) / (2.5 * p.k)); // once it has lost its speed, it flutters
    p.ph += p.pw; p.x += p.vx + Math.sin(p.ph) * p.sway * calm; p.y += p.vy;
    p.rot += p.spin * (1.4 - 0.8 * calm); p.fl += p.fw;
    const f = Math.cos(p.fl), al = Math.min(1, (a + 1) / 2) * (1 - ease.smooth(span(t, 0.66, 0.96))), sc = 1 - 0.4 * span(t, 0.6, 1);
    if (al <= 0) return;
    const col = f >= 0 ? shade(p.c, 0.34 * f ** 6 - 0.04) : shade(p.c, -0.26 + 0.14 * f); // a glint face-on, the back in shadow
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sc, sc * (0.18 + 0.82 * Math.abs(f)));
    ctx.fillStyle = rgba(col, 1);
    if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w * 0.45, 0, TAU); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  /** A serpentine streamer: its head curls as it flies, the ribbon twists behind it, then the whole thing sinks. */
  function drawStreamer(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), pts = p.pts;
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0.3 * p.k) { // it curls tighter as it slows
      const turn = p.w * clamp((3 * p.k) / v, 0.35, 2.4), cs = Math.cos(turn), sn = Math.sin(turn), vx = p.vx * cs - p.vy * sn, vy = p.vx * sn + p.vy * cs;
      p.vx = vx * 0.94; p.vy = vy * 0.94 + p.g; p.w *= 0.985;
      p.hx += p.vx; p.hy += p.vy; pts.push([p.hx, p.hy]);
    }
    const sink = p.g * 5 * Math.min(1, a / 30);
    for (const q of pts) { q[1] += sink; q[0] += Math.sin(a * 0.07 + q[1] * 0.05) * 0.06; }
    p.hy += sink;
    const al = Math.min(1, (a + 1) / 2) * (1 - ease.smooth(span(t, 0.6, 1)));
    if (al <= 0 || pts.length < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const f = Math.cos(i * 0.62 + p.tw);
      ctx.strokeStyle = f >= 0 ? p.front : p.back; ctx.lineWidth = p.wd * (0.25 + 0.75 * Math.abs(f));
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    ctx.restore();
  }
  SUB.confetti = (c) => {
    const { fx, P, sz, ch, cols, alpha, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx), th = thin(fx);
    let pal = cols;
    try { const tp = currentTheme().ansi.slice(9, 15).map(hexRgb); if (tp.length >= 3) pal = tp; } catch (e) { /* the accent then */ }
    const pk = () => pal[(Math.random() * pal.length) | 0], S = A.small ? Math.max(11, ch * 0.9) : ch * 1.25 * sz * F;
    const tx = A.x, ty = A.small ? A.y + S * 0.45 : A.y + ch * 0.42, ps = Math.max(F, 0.55) * sz, k = A.small ? 0.34 : F * sz, fire = 5;
    [-1, 1].forEach((d, j) => {
      const ang = d * rand(0.42, 0.58), px = tx + d * S * 0.08, mx = px + Math.sin(ang) * S * 0.74, my = ty - Math.cos(ang) * S * 0.74;
      P.push(part(44, drawPopper, { x: px, y: ty, s: S, ang, fire, sp: popperS(pal[(j * 3) % pal.length], [252, 248, 236], q) }));
      P.push(part(fire + 24, drawBang, { wait: fire, x: mx, y: my, ang, r: S * 0.9, al: alpha, L, g: puffGlow(), smoke: smokeS(L) }));
      for (let i = 0, n = th < 1 ? 1 : 2; i < n; i++) {
        const cc = pk(), an = ang + rand(-0.2, 0.2), sp = rand(6.5, 8.5) * k;
        P.push(part(fire + rand(70, 86), drawStreamer, { wait: fire + i, hx: mx, hy: my, vx: Math.sin(an) * sp, vy: -Math.cos(an) * sp, w: d * rand(0.09, 0.15) * (i ? -1 : 1), g: 0.05 * k, k, pts: [[mx, my]], tw: rand(0, TAU), wd: 2.4 * ps, front: rgba(cc, 1), back: rgba(shade(cc, -0.4), 1) }));
      }
      for (let i = 0, n = count(c, 32); i < n; i++) {
        const an = ang + rand(-0.36, 0.36), sp = rand(3.5, 10) * k, kind = Math.random();
        P.push(part(fire + rand(64, 88), drawPaper, { wait: fire + ((Math.random() * 3) | 0), x: mx, y: my, vx: Math.sin(an) * sp, vy: -Math.cos(an) * sp, drag: rand(0.9, 0.93), g: 0.085 * k, vt: rand(0.7, 1.2) * k, k,
          ph: rand(0, TAU), pw: rand(0.08, 0.15), sway: rand(0.3, 0.8) * k, rot: rand(0, TAU), spin: rand(-0.2, 0.2), fl: rand(0, TAU), fw: rand(0.1, 0.26),
          c: pk(), round: kind < 0.16, w: (kind < 0.55 ? rand(4.4, 6.4) : rand(7, 9.5)) * ps, h: (kind < 0.55 ? rand(2.8, 4) : rand(1.8, 2.4)) * ps }));
      }
    });
  };

  /* ====================================================================================================== */
  /* 벚꽃잎: a cherry blossom spins open at the caret, a little whirlwind of petals winds out of it, rising    */
  /* and widening with a breath of wind round it; then it lets go and the petals drift down, tumbling.       */
  /* ====================================================================================================== */

  const PETAL_TONES = [[[244, 132, 170], [255, 196, 214], [255, 238, 244]], [[238, 118, 160], [255, 182, 206], [255, 228, 238]], [[250, 150, 184], [255, 210, 226], [255, 246, 250]]];
  /** A sakura petal, base at (10, 22.5), the notch of its tip at the top: deeper at the base, paling to the edge. */
  function petalS(v, L, q) {
    return sprite(`b-petal|${v}|${L}|${q}`, () => paint(20, 24, q, (x) => {
      const [deep, mid, pale] = PETAL_TONES[v % PETAL_TONES.length].map((c) => (L ? shade(c, -0.1) : c)), P = new Path2D();
      P.moveTo(10, 22.5);
      P.bezierCurveTo(4.2, 19, 1.2, 12.5, 2.3, 6.8); P.bezierCurveTo(3.2, 2.6, 7, 1.3, 8.7, 3.4);
      P.lineTo(10, 5.6); P.lineTo(11.3, 3.4); // the notch
      P.bezierCurveTo(13, 1.3, 16.8, 2.6, 17.7, 6.8); P.bezierCurveTo(18.8, 12.5, 15.8, 19, 10, 22.5);
      P.closePath();
      const g = x.createLinearGradient(10, 23, 10, 2);
      g.addColorStop(0, rgba(deep, 1)); g.addColorStop(0.45, rgba(mid, 1)); g.addColorStop(1, rgba(pale, 1));
      x.fillStyle = g; x.fill(P);
      x.save(); x.clip(P);
      const sg = x.createLinearGradient(2, 0, 18, 0); // it is cupped: lit on one side, a little shadow on the other
      sg.addColorStop(0, 'rgba(255,255,255,0.3)'); sg.addColorStop(0.45, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(190,60,110,0.2)');
      x.fillStyle = sg; x.fillRect(0, 0, 20, 24);
      x.strokeStyle = 'rgba(214,96,140,0.32)'; x.lineWidth = 0.5;
      for (const ex of [6, 10, 14]) { x.beginPath(); x.moveTo(10, 22); x.quadraticCurveTo((10 + ex) / 2, 13, ex, 6.5); x.stroke(); } // veins
      x.restore();
      x.strokeStyle = L ? 'rgba(196,80,124,0.6)' : 'rgba(255,170,200,0.45)'; x.lineWidth = L ? 0.7 : 0.5; x.stroke(P);
    }));
  }
  /** The blossom: five petals round a deep pink eye with stamens. */
  function blossomS(L, q) {
    return sprite(`b-blossom|${L}|${q}`, () => paint(40, 40, q, (x) => {
      x.translate(20, 20);
      for (let i = 0; i < 5; i++) { x.save(); x.rotate((i / 5) * TAU); x.drawImage(petalS(i % 3, L, q).c, -8, -18, 16, 19.2); x.restore(); }
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 4.5);
      g.addColorStop(0, 'rgba(200,40,90,0.95)'); g.addColorStop(1, 'rgba(240,110,150,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, 4.5, 0, TAU); x.fill();
      x.lineWidth = 0.6;
      for (let i = 0; i < 10; i++) {
        const an = (i / 10) * TAU + 0.2, r = 4.6 + (i % 2) * 1.2;
        x.strokeStyle = 'rgba(214,70,110,0.8)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(an) * r, Math.sin(an) * r); x.stroke();
        x.fillStyle = '#ffd25a'; x.beginPath(); x.arc(Math.cos(an) * r, Math.sin(an) * r, 0.8, 0, TAU); x.fill();
      }
    }));
  }
  function drawBlossom(ctx, p) {
    const a = p.age++, s = ease.back(span(a, 0, 8)) * (1 - 0.6 * ease.in(span(a, 10, p.T))), al = 1 - ease.smooth(span(a, 12, p.T));
    if (al <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    put(ctx, p.sp, p.x, p.y, (p.s / 40) * s, p.rot + a * 0.17 + ease.out(span(a, 0, 10)) * 1.4);
    ctx.restore();
  }
  /** A petal in the whirl: wound round the rising axis, then let go to drift down. */
  function drawWhirl(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    let z = 1;
    if (a <= p.rel) {
      const u = a / p.rel, r = p.R * ease.out(Math.min(1, u * 1.25)), th = p.th + p.w * a, cy = p.y - p.rise * ease.smooth(u);
      const nx = p.x + Math.cos(th) * r, ny = cy + Math.sin(th) * r * p.tilt;
      if (p.cx != null) { p.vx = nx - p.cx; p.vy = ny - p.cy; }
      p.cx = nx; p.cy = ny; z = 0.5 + 0.5 * Math.sin(th);
      p.rot += p.spin * 2;
    } else { // free: the air takes the speed off it, it settles into a swaying fall
      p.vx *= 0.955; p.vy = Math.min(p.fall, p.vy * 0.955 + p.g); p.ph += 0.07;
      p.cx += p.vx + Math.sin(p.ph) * p.sway; p.cy += p.vy; p.rot += p.spin;
      z = Math.min(1, 0.5 + (a - p.rel) / 12);
    }
    p.fl += p.fw;
    const s = (p.s / 24) * ease.out(span(a, 0, 6)) * (0.75 + 0.3 * z) * (1 - 0.45 * span(t, 0.55, 1)); // shrinking as it goes, so it never dulls to grey
    const al = Math.min(1, (a + 1) / 3) * (1 - ease.smooth(span(t, 0.6, 0.94))) * (0.6 + 0.4 * z);
    if (al <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(p.cx, p.cy); ctx.rotate(p.rot); ctx.scale(s, s * (0.3 + 0.7 * Math.abs(Math.cos(p.fl))));
    ctx.drawImage(p.sp.c, -10, -12, 20, 24);
    ctx.restore();
  }
  /** A breath of wind round the whirl: a pale streak running round the rising ellipse. */
  function drawGust(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const u = a / (p.T - p.wait), r = p.R * (0.45 + 0.65 * ease.out(u)), cy = p.y - p.rise * ease.smooth(u), head = p.th + p.w * a, al = Math.sin(Math.PI * u) * p.al;
    ctx.save(); blend(ctx, p.L); ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) { // fading toward its tail
      const a0 = head - 1.9 * (1 - i / 10), a1 = head - 1.9 * (1 - (i + 1) / 10), k = (i + 1) / 10;
      ctx.strokeStyle = p.L ? `rgba(226,110,150,${0.42 * k * al})` : `rgba(255,214,232,${0.4 * k * al})`; ctx.lineWidth = 0.6 + 1.1 * k;
      ctx.beginPath(); ctx.ellipse(p.x, cy, r, r * p.tilt, 0, a0, a1); ctx.stroke();
    }
    ctx.restore();
  }
  SUB.petals = (c) => {
    const { fx, P, sz, ch, alpha, L } = c, A = anchor(c), F = A.fit, q = scaleOf(fx);
    const R = A.small ? Math.min(fx.w * 0.24, ch * 2.4) : ch * 2.1 * sz * F, rise = A.small ? fx.h * 0.12 : Math.min(ch * 1.5 * F, A.y * 0.3), tilt = 0.36;
    const ps = A.small ? 0.7 : Math.max(F, 0.6) * sz, spin = Math.random() < 0.5 ? 1 : -1, w = spin * 0.2;
    P.push(part(26, drawBlossom, { x: A.x, y: A.y, s: ch * 1.5 * ps, rot: rand(0, TAU), sp: blossomS(L, q) }));
    for (let i = 0; i < 2; i++) P.push(part(4 + i * 6 + 34, drawGust, { wait: 4 + i * 6, x: A.x, y: A.y, R: R * (1 - i * 0.2), rise, tilt, th: rand(0, TAU), w: w * 1.15, al: alpha, L }));
    for (let i = 0, n = count(c, A.small ? 24 : 42); i < n; i++) {
      const wait = Math.round((i / n) * 20), rel = Math.round(rand(24, 32));
      P.push(part(wait + rel + rand(34, 52), drawWhirl, { wait, rel, x: A.x, y: A.y, R: R * rand(0.55, 1), rise: rise * rand(0.7, 1.15), tilt, th: i * 2.39996, w: w * rand(0.85, 1.15),
        g: 0.035 * (A.small ? 0.5 : F), fall: rand(0.45, 0.9) * (A.small ? 0.45 : F * sz), sway: rand(0.25, 0.55) * (A.small ? 0.5 : F), ph: rand(0, TAU), rot: rand(0, TAU), spin: rand(-0.06, 0.06), fl: rand(0, TAU), fw: rand(0.07, 0.15),
        s: rand(8.5, 12.5) * ps, sp: petalS(i % 3, L, q) }));
    }
  };
})();
