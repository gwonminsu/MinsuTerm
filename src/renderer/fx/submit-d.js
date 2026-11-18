'use strict';
/* Submit (Enter) flourishes, group d: see fx/kit.js for the contract. */
(() => {
  const { TAU, sprite, paint, put, part, clamp, ease, rand, rng, glow, rgba, shade, scaleOf, thin, anchor } = FXKit;
  const SO = 'source-over', ADD = 'lighter';
  const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  const COMIC = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Yu Gothic UI', 'Microsoft YaHei', sans-serif";
  const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
  const lerp = (a, b, t) => a + (b - a) * t;
  /** 1 until t0, then smoothly down to 0 at t = 1. */
  const tail = (t, t0) => (t < t0 ? 1 : 1 - ease.smooth(clamp((t - t0) / (1 - t0))));
  /** -1..1, mostly near 0. */
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  /** How many pieces: n at intensity 1, fewer on a busy layer. */
  const many = (c, n, min = 1) => Math.max(min, Math.round(n * thin(c.fx) * clamp(0.55 + 0.45 * c.k, 0.6, 1.3)));
  let meas = null;
  const textW = (font, s) => { meas = meas || document.createElement('canvas').getContext('2d'); meas.font = font; return meas.measureText(s).width; };

  /** A four-pointed twinkle with a soft heart (white-gold; amber on a light page), 32 px. */
  const twinkleS = (L, q) => sprite(`d-tw|${L}|${q}`, () => paint(32, 32, q, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 10);
    g.addColorStop(0, L ? 'rgba(255,244,200,1)' : 'rgba(255,255,255,1)');
    g.addColorStop(0.3, L ? 'rgba(255,170,20,0.75)' : 'rgba(255,232,160,0.6)');
    g.addColorStop(1, 'rgba(255,190,60,0)');
    x.fillStyle = g; x.beginPath(); x.arc(16, 16, 10, 0, TAU); x.fill();
    const ray = (an, len, wd) => {
      x.save(); x.translate(16, 16); x.rotate(an);
      x.beginPath(); x.moveTo(0, -wd); x.quadraticCurveTo(len * 0.25, -wd * 0.25, len, 0); x.quadraticCurveTo(len * 0.25, wd * 0.25, 0, wd); x.closePath(); x.fill();
      x.restore();
    };
    x.fillStyle = L ? '#d27400' : '#fff8dc';
    for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, 15.5, 1.7);
    for (let i = 0; i < 4; i++) ray(Math.PI / 4 + (i * Math.PI) / 2, 7, 1.1);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 1.9, 0, TAU); x.fill();
  }));
  function drawTwinkle(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const u = a / (p.T - p.delay), s = Math.sin(Math.PI * clamp(u)) ** 1.4;
    p.x += p.vx; p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = p.L ? SO : ADD; ctx.globalAlpha = clamp(p.al * s);
    put(ctx, p.sp, p.x, p.y, (p.s * (0.45 + 0.55 * s)) / 32, p.rot + u * 0.9);
    ctx.restore();
  }
  const twinkle = (P, L, q, x, y, s, delay, T, al, vx = 0, vy = 0) => P.push(part(delay + T, drawTwinkle, { x, y, s, delay, vx, vy, rot: rand(0, 0.8), al, L, sp: twinkleS(L, q) }));
  /** A soft light that blooms and goes (dark pages only: it is additive). */
  function drawFlash(ctx, p) {
    const a = p.age++, u = a / p.T;
    ctx.save(); ctx.globalCompositeOperation = ADD; ctx.globalAlpha = clamp(p.al * (1 - u) ** 2);
    put(ctx, p.sp, p.x, p.y, (p.r * (0.7 + 0.5 * ease.out(u))) / 48);
    ctx.restore();
  }
  const popGlow = () => glow('d-pop', [[0, 'rgba(255,250,228,0.95)'], [0.3, 'rgba(255,216,128,0.42)'], [0.68, 'rgba(255,140,90,0.1)'], [1, 'rgba(255,120,70,0)']]);
  const goldGlow = () => glow('d-gold', [[0, 'rgba(255,248,214,0.9)'], [0.3, 'rgba(255,210,90,0.45)'], [0.65, 'rgba(255,170,40,0.12)'], [1, 'rgba(255,150,30,0)']]);

  /* ---- 이모지 팝: one big emoji springs out of the point, squashes, and bursts into a fountain of little ones ---- */
  const HEROES = ['🎉', '🤩', '🥳', '🚀', '💯', '😎', '🔥', '⭐'];
  const BITS = ['😀', '😆', '🔥', '✨', '💥', '🎉', '👍', '💯', '🚀', '⭐', '💖', '🍀', '😎', '🤩', '⚡'];
  const emojiS = (g, px, q) => sprite(`d-emo|${g}|${px}|${q}`, () => paint(px * 1.3, px * 1.3, q, (x) => {
    x.font = `${px}px ${EMOJI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    x.fillText(g, px * 0.65, px * 0.68);
  }));
  /** Diamond-shaped pop lines around (x, y). */
  function popLines(ctx, x, y, n, r0, r1, w, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = rot + (i / n) * TAU, ca = Math.cos(an), sa = Math.sin(an), rm = lerp(r0, r1, 0.42), hw = w / 2;
      ctx.moveTo(x + ca * r0, y + sa * r0);
      ctx.lineTo(x + ca * rm - sa * hw, y + sa * rm + ca * hw);
      ctx.lineTo(x + ca * r1, y + sa * r1);
      ctx.lineTo(x + ca * rm + sa * hw, y + sa * rm - ca * hw);
      ctx.closePath();
    }
    ctx.fill();
  }
  function drawHero(ctx, p) {
    const a = p.age++, G = p.G, b = a - p.burst;
    const spring = 1 + (ease.elastic(clamp((a + 1) / 22)) - 1) * 0.7;
    let sx = spring, sy = spring, al = 1;
    if (a >= p.sq && b < 0) { const u = ease.smooth(clamp((a - p.sq) / (p.burst - p.sq))); sx *= 1 + 0.18 * u; sy *= 1 - 0.16 * u; } // gathering itself
    if (b >= 0) { const u = clamp(b / 6); sx = sy = 1.18 + 0.5 * ease.out(u); al = 1 - u; }
    const x = p.x, y = lerp(p.y0, p.y1, ease.out(clamp(a / 18))), rot = Math.sin(a * 0.45) * 0.16 * Math.max(0, 1 - a / 22);
    ctx.save();
    if (!p.L) { // a warm light behind it
      ctx.globalCompositeOperation = ADD;
      ctx.globalAlpha = clamp(p.al * al * (a < 4 ? 0.75 : 0.3 + 0.45 * Math.exp(-(a - 4) / 7)));
      put(ctx, popGlow(), x, y, (G * 2 * Math.max(sx, sy)) / 96);
    }
    ctx.globalCompositeOperation = SO;
    ctx.fillStyle = p.L ? '#e07000' : '#fff1bf'; ctx.strokeStyle = ctx.fillStyle;
    if (a < 10) { const u = a / 10, e = ease.out(u); ctx.globalAlpha = (1 - u) * p.al; popLines(ctx, x, y, 12, G * (0.52 + e * 0.3), G * (0.74 + e * 0.55), Math.max(1.5, G * 0.075), p.rot0); }
    if (b >= 0 && b < 13) {
      const u = b / 13, e = ease.out(u);
      ctx.globalAlpha = (1 - u) * p.al;
      popLines(ctx, x, y, 14, G * (0.6 + e * 0.55), G * (0.86 + e * 0.85), Math.max(1.5, G * 0.08) * (1 - u * 0.4), p.rot0 + 0.2);
      ctx.lineWidth = Math.max(0.8, G * 0.07 * (1 - u)); ctx.beginPath(); ctx.arc(x, y, G * (0.45 + 0.75 * e), 0, TAU); ctx.stroke();
    }
    if (al > 0) {
      ctx.globalAlpha = al;
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx * p.sc, sy * p.sc);
      ctx.drawImage(p.sp.c, -p.sp.w / 2, -p.sp.h / 2, p.sp.w, p.sp.h);
    }
    ctx.restore();
  }
  function drawBit(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay);
    if (a > 0) { p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; }
    const pop = a < 7 ? ease.back(clamp((a + 1) / 7)) : 1;
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = tail(t, 0.58);
    put(ctx, p.sp, p.x, p.y, p.sc * Math.max(0.05, pop), p.rot);
    ctx.restore();
  }
  FX_SUBMIT.emojipop = (c) => {
    const { fx, P, ch, sz, L } = c, A = anchor(c), q = scaleOf(fx);
    const G = A.small ? Math.round(fx.h * 0.6) : Math.round(ch * 2.5 * sz * A.fit);
    const px = Math.max(16, Math.ceil((G * 1.2) / 8) * 8), hero = HEROES[(Math.random() * HEROES.length) | 0];
    const y1 = A.small ? A.y : clamp(A.y - ch * 0.9 * A.fit, G * 0.62, Math.max(G * 0.62, fx.h - G * 0.62)), burst = 30;
    P.push(part(burst + 14, drawHero, { x: A.x, y0: A.y, y1, G, sp: emojiS(hero, px, q), sc: G / px, sq: 21, burst, rot0: rand(0, 1), L, al: c.alpha }));
    const s0 = A.small ? 10 : ch * 0.95 * sz * A.fit, g = (A.small ? 0.1 : 0.2) * sz, up = A.small ? A.y - s0 * 0.6 - 2 : Math.min(ch * 4.4 * sz * A.fit, Math.max(ch, y1 - s0));
    const bpx = Math.max(12, Math.ceil((s0 * 1.3) / 4) * 4);
    for (let i = 0, n = many(c, 22, 6); i < n; i++) { // a spray: up the middle, arcing over to either side
      const th = (((i * 0.618) % 1) * 2 - 1) * (A.small ? 1.25 : 1.05) + rand(-0.1, 0.1), v = Math.sqrt(2 * g * up * rand(0.55, 1));
      const delay = burst + ((i * 7) % 6);
      P.push(part(delay + rand(48, 62), drawBit, {
        x: A.x + rand(-0.18, 0.18) * G, y: y1 + rand(-0.15, 0.15) * G, vx: Math.sin(th) * v * (A.small ? 1.1 : 0.75), vy: -Math.cos(th) * v, g, delay,
        sp: emojiS(Math.random() < 0.3 ? hero : BITS[(Math.random() * BITS.length) | 0], bpx, q), sc: (s0 * rand(0.75, 1.15)) / bpx, rot: rand(-0.3, 0.3), vr: rand(-0.06, 0.06),
      }));
    }
    for (let i = 0, m = many(c, 7, 2); i < m; i++) {
      const an = rand(0, TAU), d = G * rand(0.5, 1.4);
      twinkle(P, L, q, A.x + Math.cos(an) * d, y1 + Math.sin(an) * d * (A.small ? 0.4 : 0.8), G * rand(0.35, 0.6), burst + rand(-2, 14), rand(16, 24), c.alpha, 0, -0.25);
    }
  };

  /* ---- 의성어: a comic explosion balloon bursts out of the point with the sound word lettered in it ---- */
  function boomS(word, fs, q, L) {
    return sprite(`d-boom|${word}|${fs}|${q}|${L}`, () => {
      const font = `900 ${fs}px ${COMIC}`, tw = textW(font, word);
      const rx = Math.max(tw * 0.5 + fs * 0.85, fs * 1.35), ry = fs * 1.2;
      const W = Math.ceil(rx * 2.7 + 10), H = Math.ceil(ry * 2.7 + 10), cx = W / 2, cy = H / 2;
      const s = paint(W, H, q, (x) => {
        const R = rng(word.length * 97 + fs * 13 + 5);
        const spikes = (n, lo, hi, ilo, ihi) => {
          const pts = [], off = R() * TAU;
          for (let i = 0; i < n * 2; i++) pts.push([off + (i / (n * 2)) * TAU + (R() - 0.5) * (Math.PI / n) * 0.5, i % 2 ? lerp(ilo, ihi, R()) : lerp(lo, hi, R())]);
          return pts;
        };
        // in real space (strokes, clips), or squeezed to a circle so a radial gradient follows the ellipse
        const path = (pts, dx = 0, dy = 0, round = false) => {
          const p2 = new Path2D();
          pts.forEach(([an, f], i) => p2[i ? 'lineTo' : 'moveTo'](round ? Math.cos(an) * rx * f : cx + dx + Math.cos(an) * rx * f, round ? Math.sin(an) * rx * f : cy + dy + Math.sin(an) * ry * f));
          p2.closePath();
          return p2;
        };
        const fillRound = (pts, stops, r) => {
          x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
          const g = x.createRadialGradient(0, -rx * 0.12, 0, 0, 0, r);
          for (const [o, col] of stops) g.addColorStop(o, col);
          x.fillStyle = g; x.fill(path(pts, 0, 0, true));
          x.restore();
        };
        const outer = spikes(10 + Math.round((rx / fs) * 1.5), 1.1, 1.34, 0.74, 0.86), inner = spikes(9, 0.8, 0.94, 0.58, 0.66), edge = path(outer);
        x.fillStyle = L ? 'rgba(40,10,0,0.3)' : 'rgba(0,0,0,0.55)'; x.fill(path(outer, fs * 0.12, fs * 0.16)); // printed shadow
        fillRound(outer, [[0, '#fffbd6'], [0.32, '#ffe04a'], [0.68, '#ffa21e'], [1, '#ea4518']], rx * 1.3);
        x.save(); x.clip(edge); // halftone dots, larger toward the spikes
        const sp = Math.max(2.4, fs * 0.17);
        x.fillStyle = 'rgba(190,30,16,0.5)';
        for (let j = 0, row = 0; j < H; j += sp * 0.87, row++) {
          for (let i = row % 2 ? sp / 2 : 0; i < W; i += sp) {
            const r = sp * 0.5 * clamp((Math.hypot((i - cx) / rx, (j - cy) / ry) - 0.5) / 0.75);
            if (r > 0.25) { x.beginPath(); x.arc(i, j, r, 0, TAU); x.fill(); }
          }
        }
        x.restore();
        fillRound(inner, [[0, '#ffffff'], [0.45, '#fff6b4'], [1, '#ffd84a']], rx * 0.95);
        x.lineJoin = 'miter'; x.miterLimit = 5;
        x.strokeStyle = 'rgba(232,104,18,0.9)'; x.lineWidth = Math.max(1, fs * 0.06); x.stroke(path(inner));
        x.strokeStyle = '#1d0d08'; x.lineWidth = Math.max(1.5, fs * 0.1); x.stroke(edge);
        // the word: a block of shadow under it, a thick ink line, a hot fill with a shine along the top
        x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
        const ty = cy + fs * 0.06, depth = Math.max(2, Math.round(fs * 0.13));
        x.fillStyle = '#420606'; x.strokeStyle = '#420606'; x.lineWidth = fs * 0.2;
        for (let i = depth; i > 0; i--) { x.strokeText(word, cx + i * 0.6, ty + i * 0.8); x.fillText(word, cx + i * 0.6, ty + i * 0.8); }
        x.strokeStyle = '#140808'; x.strokeText(word, cx, ty);
        const g = x.createLinearGradient(0, ty - fs * 0.5, 0, ty + fs * 0.5);
        g.addColorStop(0, '#fff2d2'); g.addColorStop(0.3, '#ff6a36'); g.addColorStop(0.62, '#e5221a'); g.addColorStop(1, '#9e0c12');
        x.fillStyle = g; x.fillText(word, cx, ty);
      });
      s.rx = rx; s.ry = ry;
      return s;
    });
  }
  function drawBoom(ctx, p) {
    const a = p.age++, out = a > p.hold ? clamp((a - p.hold) / (p.T - p.hold)) : 0;
    const pop = a < 8 ? ease.back(clamp((a + 1) / 8)) : 1 + 0.04 * Math.sin((a - 8) * 0.6) * Math.exp(-(a - 8) / 12);
    const k = ease.out(clamp((a + 1) / 6)), sh = a < 10 ? (1 - a / 10) * p.shake : 0;
    const x = lerp(p.x0, p.x1, k) + Math.sin(a * 2.3) * sh, y = lerp(p.y0, p.y1, k) + Math.cos(a * 3.1) * sh;
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = 1 - ease.smooth(out);
    put(ctx, p.sp, x, y, Math.max(0.05, pop) * (1 + 0.12 * ease.out(out)), p.rot + 0.03 * Math.sin(a * 0.35));
    ctx.restore();
  }
  /** Comic focus lines shooting out of the point. */
  function drawFocus(ctx, p) {
    const a = p.age++, u = a / p.T, e = ease.out(u);
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = (1 - u) ** 1.2 * p.al; ctx.fillStyle = p.col;
    ctx.beginPath();
    for (const [an, r0, len, w] of p.lines) {
      const ri = r0 + p.D * e * 0.55, ro = ri + len * (0.35 + 0.65 * e), ca = Math.cos(an), sa = Math.sin(an), hw = w / 2;
      ctx.moveTo(p.x + ca * ri, p.y + sa * ri);
      ctx.lineTo(p.x + ca * ro - sa * hw, p.y + sa * ro + ca * hw);
      ctx.lineTo(p.x + ca * ro + sa * hw, p.y + sa * ro - ca * hw);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  /** A comic puff of smoke: inked round lobes, shaded underneath. */
  const puffS = (v, q) => sprite(`d-puff|${v}|${q}`, () => paint(32, 32, q, (x) => {
    const R = rng(v * 59 + 3), C = [[16, 17, 6.4]];
    for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + R() * 0.9, d = 5.2 + R() * 2.4; C.push([16 + Math.cos(an) * d, 17 + Math.sin(an) * d * 0.8, 3.8 + R() * 2]); }
    x.fillStyle = '#1a1014'; for (const [px, py, r] of C) { x.beginPath(); x.arc(px, py, r + 1.3, 0, TAU); x.fill(); }
    x.fillStyle = '#aaa3b8'; for (const [px, py, r] of C) { x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }
    for (const [px, py, r] of C) {
      const g = x.createRadialGradient(px - r * 0.4, py - r * 0.45, r * 0.1, px - r * 0.12, py - r * 0.15, r * 0.85);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e4dfec');
      x.fillStyle = g; x.beginPath(); x.arc(px - r * 0.13, py - r * 0.15, r * 0.78, 0, TAU); x.fill();
    }
  }));
  function drawPuff(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const u = a / (p.T - p.delay);
    p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy = p.vy * 0.9 - 0.02;
    const sc = p.s * (0.3 + 0.8 * ease.out(clamp(u * 2.2))) * (1 - 0.5 * ease.in(clamp((u - 0.55) / 0.45)));
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = tail(u, 0.5);
    put(ctx, p.sp, p.x, p.y, sc / 32, p.rot);
    ctx.restore();
  }
  /** Flung bits of the blast: little inked shards. */
  function drawShards(ctx, p) {
    const a = p.age++;
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = tail(a / p.T, 0.5);
    for (const b of p.bits) {
      b.vy += 0.16; b.vx *= 0.97; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      const cs = Math.cos(b.r) * b.s, sn = Math.sin(b.r) * b.s;
      ctx.fillStyle = b.c;
      ctx.beginPath(); ctx.moveTo(b.x + cs, b.y + sn); ctx.lineTo(b.x - sn * 0.6 - cs * 0.5, b.y + cs * 0.6 - sn * 0.5); ctx.lineTo(b.x + sn * 0.5 - cs * 0.4, b.y - cs * 0.5 - sn * 0.4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  FX_SUBMIT.ono = (c) => {
    const { fx, P, ch, sz, L } = c, A = anchor(c), q = scaleOf(fx);
    const word = typeof fxWord === 'function' ? fxWord('쾅!') : '쾅!';
    let fs = A.small ? Math.round(fx.h * 0.3) : Math.round(ch * 1.6 * sz * A.fit), sp = boomS(word, fs, q, L);
    if (sp.w > fx.w * 0.92) { fs = Math.max(8, Math.floor((fs * fx.w * 0.92) / sp.w)); sp = boomS(word, fs, q, L); }
    const hw = sp.rx * 1.25, hh = sp.ry * 1.25, f = A.fit * sz;
    const x1 = A.small ? clamp(A.x, hw, fx.w - hw) : clamp(A.x + sp.rx * 0.4, hw + 2, Math.max(hw + 2, fx.w - hw - 2));
    const y1 = A.small ? fx.h / 2 : clamp(A.y - sp.ry * 0.95, hh + 2, Math.max(hh + 2, fx.h - hh - 2));
    const lines = [];
    for (let i = 0, n = many(c, 28, 12); i < n; i++) lines.push([(i / n) * TAU + rand(-0.08, 0.08), ch * rand(0.5, 1.1) * A.fit, ch * rand(0.9, 2.4) * f, rand(1.1, 2.6) * Math.max(0.7, f)]);
    P.push(part(20, drawFocus, { x: A.x, y: A.y, lines, D: ch * 3.4 * f, col: L ? '#24140e' : '#fff6dc', al: 0.9 }));
    if (!L) P.push(part(9, drawFlash, { x: A.x, y: A.y, r: ch * 1.6 * f, al: 0.8 * c.alpha, sp: popGlow() }));
    for (let i = 0, n = many(c, 6, 3); i < n; i++) { // smoke rolling out low, either side
      const an = Math.PI * (-0.08 + (1.16 * i) / Math.max(1, n - 1)) + rand(-0.15, 0.15), v = rand(1.6, 2.8) * f;
      P.push(part(rand(44, 54), drawPuff, { x: A.x, y: A.y, vx: Math.cos(an) * v * 1.3, vy: Math.sin(an) * v * 0.5, s: ch * rand(1, 1.5) * f, delay: (i % 3) + 1, rot: rand(0, TAU), sp: puffS(i % 4, q) }));
    }
    const bits = [], BITC = L ? ['#ffc21a', '#ff7417', '#e0221a', '#24140e'] : ['#ffd84a', '#ff8a24', '#ff4a2a', '#fff2c8'];
    for (let i = 0, n = many(c, 12, 4); i < n; i++) { const an = rand(0, TAU), v = rand(2, 4.5) * f; bits.push({ x: A.x, y: A.y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 1.2, r: rand(0, TAU), vr: rand(-0.3, 0.3), s: rand(1.6, 3) * Math.max(0.7, f), c: BITC[i % 4] }); }
    P.push(part(34, drawShards, { bits }));
    P.push(part(56, drawBoom, { x0: A.x, y0: A.y, x1, y1, sp, rot: rand(-0.16, 0.06), shake: Math.max(1, ch * 0.09), hold: 30 }));
  };

  /* ---- 팝콘: the point turns into a popcorn machine: kernels sizzle, pop, tumble and land in a heap that melts away ---- */
  function cornS(v, q, L) {
    return sprite(`d-corn|${v}|${q}|${L}`, () => paint(24, 24, q, (x) => {
      const R = rng(v * 131 + 7), C = [[12, 12.5, 4.6]];
      for (let i = 0, n = 4 + (v % 2); i < n; i++) { const an = (i / n) * TAU + R() * 0.7, d = 3.6 + R() * 1.4; C.push([12 + Math.cos(an) * d, 12.5 + Math.sin(an) * d * 0.9, 3 + R() * 1.4]); }
      x.fillStyle = L ? 'rgba(122,74,24,0.85)' : 'rgba(132,88,36,0.6)'; // the outline round the whole puff
      for (const [px, py, r] of C) { x.beginPath(); x.arc(px, py, r + 0.8, 0, TAU); x.fill(); }
      for (const [px, py, r] of C) {
        const g = x.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.08, px, py, r);
        g.addColorStop(0, '#fffefa'); g.addColorStop(0.55, '#f8eccd'); g.addColorStop(1, '#d8bb84');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
      }
      x.fillStyle = 'rgba(255,206,84,0.38)'; // butter
      for (let i = 1; i < 3; i++) { const [px, py, r] = C[i]; x.beginPath(); x.arc(px + r * 0.2, py + r * 0.25, r * 0.5, 0, TAU); x.fill(); }
      const [hx, hy, hr] = C[1 + (v % 3)], an = Math.atan2(hy - 12.5, hx - 12); // the husk, still stuck to one side
      x.save(); x.translate(hx + Math.cos(an) * hr * 0.7, hy + Math.sin(an) * hr * 0.7); x.rotate(an);
      const hg = x.createLinearGradient(-2, -2, 2, 2); hg.addColorStop(0, '#f0b04a'); hg.addColorStop(1, '#8a4a10');
      x.fillStyle = hg; x.beginPath(); x.ellipse(0, 0, 1.6, 2.4, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,236,190,0.8)'; x.beginPath(); x.arc(-0.5, -0.8, 0.5, 0, TAU); x.fill();
      x.restore();
    }));
  }
  /** An unpopped kernel: an amber teardrop with a shine. */
  const seedS = (q) => sprite(`d-seed|${q}`, () => paint(12, 12, q, (x) => {
    const g = x.createRadialGradient(5, 4.5, 0.4, 6, 6, 5);
    g.addColorStop(0, '#ffe3a0'); g.addColorStop(0.5, '#e7a338'); g.addColorStop(1, '#8e4f0f');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(6, 1.6); x.bezierCurveTo(9.6, 2.4, 9.8, 8.4, 6, 10.4); x.bezierCurveTo(2.2, 8.4, 2.4, 2.4, 6, 1.6); x.fill();
    x.fillStyle = 'rgba(255,250,230,0.85)'; x.beginPath(); x.ellipse(4.9, 4.6, 0.8, 1.5, -0.3, 0, TAU); x.fill();
  }));
  const heatGlow = () => glow('d-heat', [[0, 'rgba(255,220,150,0.8)'], [0.4, 'rgba(255,150,60,0.3)'], [1, 'rgba(255,100,30,0)']]);
  function drawHeat(ctx, p) {
    const a = p.age++, u = a / p.T;
    ctx.save(); ctx.globalCompositeOperation = ADD; ctx.globalAlpha = clamp(p.al * 0.42 * Math.sin(Math.PI * u) * (0.85 + 0.15 * Math.sin(a * 0.9)));
    put(ctx, p.sp, p.x, p.y, p.r / 48);
    ctx.restore();
  }
  const binOf = (pl, x) => clamp(Math.floor((x - pl.x0) / pl.bw), 0, pl.h.length - 1);
  /** Come to rest on the heap: roll into a lower neighbouring spot if there is one, and raise the heap there. */
  function settle(p, pl, i) {
    let j = i;
    if (i > 0 && pl.h[i - 1] < pl.h[j] - p.r * 0.4) j = i - 1;
    if (i < pl.h.length - 1 && pl.h[i + 1] < pl.h[j] - p.r * 0.4) j = i + 1;
    p.rest = true; p.vx = p.vy = p.vr = 0;
    p.tx = pl.x0 + (j + 0.5) * pl.bw + rand(-0.25, 0.25) * pl.bw; p.ty = pl.y0 - pl.h[j] - p.r * 0.8;
    pl.h[j] += p.r * 0.85;
    if (j > 0) pl.h[j - 1] += p.r * 0.3;
    if (j < pl.h.length - 1) pl.h[j + 1] += p.r * 0.3;
  }
  function drawKernel(ctx, p) {
    const a = p.age++ - p.delay, pl = p.pile;
    if (a < 0) return;
    const fade = 1 - ease.smooth(clamp((p.age - pl.fade0) / (p.T - pl.fade0)));
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = fade;
    if (a < p.fizz) { // the seed, shivering in the heat
      put(ctx, p.seed, p.x + (a % 2 ? 0.6 : -0.6), p.y, p.ssc * (0.85 + 0.08 * a), p.rot);
      ctx.restore();
      return;
    }
    const b = a - p.fizz;
    if (!p.rest) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const i = binOf(pl, p.x), floor = pl.y0 - pl.h[i] - p.r * 0.8;
      if (p.vy > 0 && p.y >= floor) {
        p.y = floor;
        if (!p.hit) { p.hit = true; p.vy *= -0.3; p.vx *= 0.5; p.vr *= 0.4; } else settle(p, pl, i);
      }
    } else { p.x = lerp(p.x, p.tx, 0.35); p.y = lerp(p.y, p.ty, 0.35); }
    put(ctx, p.sp, p.x, p.y, p.sc * (b < 5 ? Math.max(0.3, ease.back(clamp((b + 1) / 5))) : 1), p.rot);
    if (b < 5) { // the pop: ticks flying off where it burst
      const u = b / 5;
      ctx.globalAlpha = fade * (1 - u); ctx.strokeStyle = p.L ? 'rgba(150,96,30,0.9)' : 'rgba(255,246,214,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const an = p.tick + (k * TAU) / 4, r0 = p.r * (1.1 + u * 0.8), r1 = r0 + p.r * 0.7; ctx.moveTo(p.ox + Math.cos(an) * r0, p.oy + Math.sin(an) * r0); ctx.lineTo(p.ox + Math.cos(an) * r1, p.oy + Math.sin(an) * r1); }
      ctx.stroke();
    }
    ctx.restore();
  }
  FX_SUBMIT.popcorn = (c) => {
    const { fx, P, ch, cw, sz, L } = c, A = anchor(c), q = scaleOf(fx);
    const d = A.small ? 7 : Math.max(6, ch * 0.72 * sz * A.fit), r = d / 2, T = 94;
    const bw = d * 0.85, nb = 2 * Math.ceil((A.small ? fx.w * 0.5 : ch * 4 * sz) / bw);
    const pile = { x0: A.x - (nb / 2) * bw, bw, h: new Float32Array(nb), y0: A.small ? fx.h - 1 : A.y + ch * 0.5, fade0: 62 };
    const g = (A.small ? 0.16 : 0.26) * sz, seed = seedS(q);
    if (!L) P.push(part(44, drawHeat, { x: A.x, y: A.y + ch * 0.2, r: ch * 1.3 * sz * A.fit, al: c.alpha, sp: heatGlow() }));
    for (let i = 0, n = many(c, 26, 7); i < n; i++) {
      const h = A.small ? rand(0.45, 1) * (A.y - 4) : ch * rand(1, 2.3) * sz * A.fit, x0 = A.x + rand(-0.3, 0.3) * cw, y0 = A.y + rand(-0.1, 0.2) * ch;
      P.push(part(T, drawKernel, {
        x: x0, y: y0, ox: x0, oy: y0, delay: Math.round((i / n) * 18 + rand(0, 1.5)), fizz: 3, vx: gauss() * (A.small ? 1.9 : 2.3) * sz, vy: -Math.sqrt(2 * g * h), g, r,
        rot: rand(0, TAU), vr: rand(-0.28, 0.28), tick: rand(0, 1.5), pile, L, sp: cornS((Math.random() * 6) | 0, q, L), sc: (d / 18) * rand(0.85, 1.12), seed, ssc: (d * 0.5) / 9,
      }));
    }
  };

  /* ---- 물감 튀김: three paints thrown at the point at once: layered splats, flicked streaks, drips and droplets ---- */
  const PAINT = [[255, 82, 82], [255, 193, 7], [33, 150, 243], [76, 175, 80], [171, 71, 188], [255, 112, 67]];
  /** A splat of one paint: an uneven blot with fingers, drops thrown clear, thicker where it pooled, a wet shine. */
  function paintS(v, ci, q) {
    return sprite(`d-paint|${v}|${ci}|${q}`, () => paint(64, 64, q, (x) => {
      const col = PAINT[ci], R = rng(v * 613 + ci * 37 + 11), cx = 32, cy = 32, N = 26, r0 = 11 + R() * 2, pts = [];
      let gap = 0;
      for (let i = 0; i < N; i++) {
        const an = (i / N) * TAU + (R() - 0.5) * 0.08; let r = r0 * (0.84 + R() * 0.26);
        if (gap <= 0 && R() < 0.24) { r *= 1.4 + R() * 0.75; gap = 3; } else gap--;
        pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.95]);
      }
      const blot = new Path2D(), mid = (i) => [(pts[i % N][0] + pts[(i + 1) % N][0]) / 2, (pts[i % N][1] + pts[(i + 1) % N][1]) / 2];
      blot.moveTo(...mid(0));
      for (let i = 1; i <= N; i++) blot.quadraticCurveTo(pts[i % N][0], pts[i % N][1], ...mid(i));
      blot.closePath();
      const drop = (an, d, len, wd) => { // thrown outward: round at the far end, a tail back toward the blot
        x.save(); x.translate(cx + Math.cos(an) * d, cy + Math.sin(an) * d); x.rotate(an);
        x.beginPath(); x.moveTo(-len * 1.6, 0); x.quadraticCurveTo(-len * 0.3, -wd, len * 0.4, -wd * 0.9); x.arc(len * 0.4, 0, wd * 0.9, -Math.PI / 2, Math.PI / 2); x.quadraticCurveTo(-len * 0.3, wd, -len * 1.6, 0); x.fill();
        x.restore();
      };
      const g = x.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, r0 * 1.8);
      g.addColorStop(0, rgba(shade(col, 0.4), 1)); g.addColorStop(0.42, rgba(col, 1)); g.addColorStop(1, rgba(shade(col, -0.42), 1));
      x.fillStyle = g; x.fill(blot);
      x.fillStyle = rgba(shade(col, -0.1), 1);
      for (let i = 0; i < 9; i++) drop(R() * TAU, r0 * (1.45 + R() * 0.9), 1.2 + R() * 3.2, 0.6 + R() * 1.3);
      for (let i = 0; i < 8; i++) { const an = R() * TAU, d = r0 * (1.7 + R() * 0.65); x.beginPath(); x.arc(cx + Math.cos(an) * d, cy + Math.sin(an) * d, 0.4 + R() * 0.8, 0, TAU); x.fill(); }
      x.strokeStyle = rgba(shade(col, -0.6), 0.5); x.lineWidth = 0.9; x.stroke(blot);
      x.save(); x.clip(blot);
      x.fillStyle = rgba(shade(col, -0.35), 0.35); x.beginPath(); x.ellipse(cx + r0 * 0.3, cy + r0 * 0.38, r0 * 0.6, r0 * 0.3, -0.5, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(cx - r0 * 0.34, cy - r0 * 0.38, r0 * 0.34, r0 * 0.14, -0.6, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(cx + r0 * 0.14, cy - r0 * 0.52, r0 * 0.075, 0, TAU); x.fill();
      x.restore();
    }));
  }
  function drawPaintSplat(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = (p.age - 1) / p.T, al = tail(t, p.h0);
    const sc = (p.d / 64) * (a < 3 ? 0.35 + 0.77 * ((a + 1) / 3) : a < 7 ? 1.12 - 0.12 * ((a - 3) / 4) : 1) * (0.9 + 0.1 * al); // soaks in a little as it fades
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = al;
    put(ctx, p.sp, p.x, p.y, sc, p.rot);
    ctx.restore();
  }
  /** Gobs flung out of the throw: a round head, a tail drawn back toward the middle, slightly bent. */
  function drawFlicks(ctx, p) {
    const a = p.age++, grow = ease.out(clamp((a + 1) / 6)), t = a / p.T;
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = tail(t, p.h0);
    for (const f of p.list) {
      const r0 = f.r0, rh = r0 + f.len * grow, w = f.w * (0.6 + 0.4 * grow), m = lerp(r0, rh, 0.55);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(f.an);
      ctx.fillStyle = f.fill;
      ctx.beginPath(); ctx.moveTo(r0, 0); ctx.quadraticCurveTo(m, -w * 0.5 + f.bend, rh, -w); ctx.arc(rh, 0, w, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(m, w * 0.5 + f.bend, r0, 0); ctx.fill();
      ctx.fillStyle = f.deep; ctx.beginPath(); ctx.arc(rh + w * 0.15, w * 0.2, w * 0.7, 0, TAU); ctx.fill(); // rounder and darker underneath
      ctx.fillStyle = f.fill; ctx.beginPath(); ctx.arc(rh - w * 0.1, -w * 0.12, w * 0.78, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(rh - w * 0.25, -w * 0.4, w * 0.36, w * 0.2, -0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  /** A run of paint: a thin trail and the bead at the end of it, slowing as it goes. */
  function drawPaintDrip(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    p.v = Math.max(p.vmin, p.v * 0.968); p.len = Math.min(p.max, p.len + p.v);
    const x = p.x, y0 = p.y, y1 = p.y + p.len, r = p.w * (0.95 + 0.35 * Math.min(1, p.len / (p.max * 0.5)));
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = tail((p.age - 1) / p.T, p.h0);
    const g = ctx.createLinearGradient(0, y0, 0, y1 + r);
    g.addColorStop(0, rgba(p.dark, 0.7)); g.addColorStop(0.55, rgba(p.col, 0.98)); g.addColorStop(1, rgba(p.lite, 1));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - p.w * 0.38, y0);
    ctx.quadraticCurveTo(x - p.w * 0.2 + p.wob, (y0 + y1) / 2, x - r * 0.9, y1 - r * 0.35);
    ctx.arc(x, y1, r, Math.PI * 1.12, -Math.PI * 0.12, true);
    ctx.quadraticCurveTo(x + p.w * 0.2 + p.wob, (y0 + y1) / 2, x + p.w * 0.38, y0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y1 - r * 0.2, r * 0.22, r * 0.36, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawPaintDrop(ctx, p) {
    const a = p.age++, t = a / p.T;
    p.vy += 0.2; p.vx *= 0.985; p.x += p.vx; p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = Math.min(1, (1 - t) * 2.2);
    ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillStyle = rgba(p.col, 1); ctx.beginPath(); ctx.ellipse(0, 0, p.s * (1 + Math.min(1.6, Math.hypot(p.vx, p.vy) * 0.22)), p.s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(p.s * 0.2, -p.s * 0.3, p.s * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  FX_SUBMIT.paint = (c) => {
    const { fx, P, ch, sz } = c, A = anchor(c), q = scaleOf(fx), lite = thin(fx) < 1;
    const cs = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 3);
    const d0 = A.small ? fx.h * 1.7 : ch * 5 * sz * A.fit, an = rand(0, TAU), T = 96;
    const splats = [[A.x, A.y, d0, cs[0], 0]];
    for (let i = 1; i < 3; i++) { const a2 = an + i * rand(2, 2.6), dd = d0 * rand(0.15, 0.24); splats.push([A.x + Math.cos(a2) * dd * (A.small ? 1.6 : 1), A.y + Math.sin(a2) * dd * (A.small ? 0.4 : 0.8), d0 * (i === 1 ? 0.66 : 0.52), cs[i], i * 2]); }
    const list = [];
    for (let i = 0, m = lite ? 4 : 8; i < m; i++) {
      const col = PAINT[cs[i % 3]];
      list.push({ an: (i / m) * TAU + rand(-0.3, 0.3), r0: d0 * 0.1, len: d0 * rand(0.22, 0.42), w: Math.max(1.4, d0 * rand(0.022, 0.04)), bend: rand(-1, 1) * d0 * 0.03, fill: rgba(col, 1), deep: rgba(shade(col, -0.35), 1) });
    }
    P.push(part(66, drawFlicks, { x: A.x, y: A.y, list, h0: 0.26 }));
    for (const [sx, sy, d, ci, delay] of splats) P.push(part(66 + delay, drawPaintSplat, { x: sx, y: sy, d, delay, h0: 0.28, rot: rand(0, TAU), sp: paintS((Math.random() * 4) | 0, ci, Math.min(4, Math.ceil(q * Math.max(1, (d * 1.1) / 64) * 4) / 4)) }));
    for (let i = 0, m = lite ? 3 : 7; i < m; i++) { // runs down from the lower edge of each splat
      const [sx, sy, d, ci] = splats[i % 3], col = PAINT[ci], rr = d * 0.17, dx = rand(-0.7, 0.7) * rr, y0 = sy + Math.sqrt(Math.max(0, rr * rr - dx * dx)) * 0.85;
      P.push(part(T, drawPaintDrip, {
        x: sx + dx, y: y0, w: rand(1.2, 2.1) * sz * (A.small ? 0.7 : 1), max: A.small ? Math.max(2, Math.min(rand(4, 9), fx.h - 3 - y0)) : ch * rand(1, 2.6) * sz * A.fit, len: 0, v: rand(0.8, 1.4) * sz, vmin: rand(0.05, 0.12), wob: rand(-0.5, 0.5),
        delay: 6 + ((Math.random() * 16) | 0), h0: 0.55, col, dark: shade(col, -0.35), lite: shade(col, 0.15),
      }));
    }
    for (let i = 0, m = lite ? 5 : 14; i < m; i++) {
      const a2 = rand(0, TAU), v = rand(2.2, 5.5) * sz * (A.small ? 0.6 : A.fit);
      P.push(part(rand(22, 34), drawPaintDrop, { x: A.x, y: A.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 1.2, s: rand(0.9, 1.9) * sz * (A.small ? 0.7 : 1), col: PAINT[cs[i % 3]] }));
    }
  };

  /* ---- 코인: a jackpot: gold coins spray out of the point and rain back with glints; one big coin flips up and shines ---- */
  function coinS(R, q, dim, L) {
    return sprite(`d-coin|${R}|${q}|${dim}|${L}`, () => paint(R * 2 + 4, R * 2 + 4, q, (x) => {
      const c = R + 2, k = dim ? (L ? 0.8 : 0.68) : 1, col = (r, g, b, a = 1) => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
      let g = x.createLinearGradient(c - R, c - R, c + R * 0.8, c + R);
      g.addColorStop(0, col(255, 242, 170)); g.addColorStop(0.42, col(247, 198, 66)); g.addColorStop(1, col(160, 100, 12));
      x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, TAU); x.fill();
      g = x.createLinearGradient(c - R, c - R, c + R, c + R); // the field sits lower than the rim: lit from the other side
      g.addColorStop(0, col(190, 128, 20)); g.addColorStop(0.55, col(238, 182, 52)); g.addColorStop(1, col(255, 226, 124));
      x.fillStyle = g; x.beginPath(); x.arc(c, c, R * 0.78, 0, TAU); x.fill();
      if (R >= 7) { x.fillStyle = col(255, 236, 160, 0.85); for (let i = 0; i < 20; i++) { const an = (i / 20) * TAU; x.beginPath(); x.arc(c + Math.cos(an) * R * 0.89, c + Math.sin(an) * R * 0.89, Math.max(0.35, R * 0.035), 0, TAU); x.fill(); } }
      const star = (dx, dy, s) => { x.beginPath(); for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.42 : s; x[i ? 'lineTo' : 'moveTo'](c + dx + Math.cos(an) * r, c + dy + Math.sin(an) * r); } x.closePath(); x.fill(); };
      const ss = R * 0.5, o = Math.max(0.5, R * 0.05);
      x.fillStyle = col(130, 78, 6, 0.9); star(o, o, ss); // the struck star: shadow, lit edge, face
      x.fillStyle = col(255, 248, 200, 0.95); star(-o, -o, ss);
      g = x.createLinearGradient(c - ss, c - ss, c + ss, c + ss); g.addColorStop(0, col(255, 226, 110)); g.addColorStop(1, col(214, 148, 28));
      x.fillStyle = g; star(0, 0, ss);
      x.lineWidth = Math.max(0.6, R * 0.08);
      x.strokeStyle = 'rgba(255,255,236,0.75)'; x.beginPath(); x.arc(c, c, R * 0.92, Math.PI * 1.02, Math.PI * 1.48); x.stroke();
      x.lineWidth = 0.8; x.strokeStyle = col(96, 58, 4, 0.8); x.beginPath(); x.arc(c, c, R - 0.4, 0, TAU); x.stroke();
    }));
  }
  /** A coin turned by ph about its upright axis (or, flip, about its level one): the far rim, the edge between, the face. */
  function coinAt(ctx, p, x, y, ph, flip) {
    const R = p.R, w = Math.cos(ph), aw = Math.max(0.07, Math.abs(w)), e = Math.sin(ph) * R * 0.2, D = p.face.w, ga = ctx.globalAlpha;
    const draw = (s, o) => (flip ? ctx.drawImage(s.c, x - D / 2, y + o - (D * aw) / 2, D, D * aw) : ctx.drawImage(s.c, x + o - (D * aw) / 2, y - D / 2, D * aw, D));
    if (Math.abs(e) > 0.25) {
      draw(p.back, e / 2);
      ctx.fillStyle = p.L ? '#a8700e' : '#8f5c0c';
      if (flip) ctx.fillRect(x - R * 0.97, y - Math.abs(e) / 2, R * 1.94, Math.abs(e)); else ctx.fillRect(x - Math.abs(e) / 2, y - R * 0.97, Math.abs(e), R * 1.94);
    }
    draw(p.back, -e / 2);
    if (w > 0) { ctx.globalAlpha = ga * clamp(w * 1.4); draw(p.face, -e / 2); ctx.globalAlpha = ga; }
  }
  function drawCoinBit(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay), al = tail(t, 0.62);
    if (a > 0) { p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.ph += p.vph; }
    ctx.save(); ctx.globalCompositeOperation = SO; ctx.globalAlpha = al;
    coinAt(ctx, p, p.x, p.y, p.ph, false);
    const gl = a - p.gt;
    if (gl >= 0 && gl < 10) { ctx.globalCompositeOperation = p.L ? SO : ADD; ctx.globalAlpha = Math.sin((gl / 10) * Math.PI) * al; put(ctx, p.tw, p.x - p.R * 0.35, p.y - p.R * 0.4, (p.R * 2.6) / 32, gl * 0.08); }
    ctx.restore();
  }
  function drawBigCoin(ctx, p) {
    const a = p.age++, R = p.R, x = p.x;
    let y, ph, al = 1;
    if (a < p.up) { const u = ease.out(clamp((a + 1) / p.up)); y = lerp(p.y0, p.y1, u); ph = 6 * Math.PI * u; } // tossed up, flipping, landing face on
    else if (a < p.drop) { y = p.y1 + Math.sin((a - p.up) * 0.16) * R * 0.06; ph = 0; }
    else { const u = clamp((a - p.drop) / (p.T - p.drop)); y = lerp(p.y1, p.y2, ease.in(u)); ph = u * u * 4; al = tail(u, 0.25); }
    ctx.save();
    const hang = clamp((a - p.up + 4) / (p.drop - p.up + 10));
    if (!p.L && hang > 0 && hang < 1) { ctx.globalCompositeOperation = ADD; ctx.globalAlpha = 0.5 * Math.sin(Math.PI * hang) * p.al; put(ctx, goldGlow(), x, y, (R * 3.4) / 48); }
    ctx.globalCompositeOperation = SO; ctx.globalAlpha = al;
    coinAt(ctx, p, x, y, ph, true);
    const s = a - p.up - 2;
    if (s >= 0 && s < 16) { // a band of light crossing the face
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, R * 0.96, 0, TAU); ctx.clip();
      ctx.translate(x + lerp(-R * 1.5, R * 1.5, ease.smooth(s / 16)), y); ctx.rotate(0.5);
      const g = ctx.createLinearGradient(-R * 0.4, 0, R * 0.4, 0);
      g.addColorStop(0, 'rgba(255,255,240,0)'); g.addColorStop(0.5, 'rgba(255,255,240,0.8)'); g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g; ctx.fillRect(-R * 0.4, -R * 1.6, R * 0.8, R * 3.2);
      ctx.restore();
    }
    const tw = a - p.up - 8;
    if (tw >= 0 && tw < 18) { const e = Math.sin((tw / 18) * Math.PI); ctx.globalCompositeOperation = p.L ? SO : ADD; ctx.globalAlpha = e; put(ctx, p.tw, x + R * 0.5, y - R * 0.55, (R * 2.4 * (0.6 + 0.4 * e)) / 32, tw * 0.05); }
    ctx.restore();
  }
  FX_SUBMIT.coins = (c) => {
    const { fx, P, ch, cw, sz, L } = c, A = anchor(c), q = scaleOf(fx);
    const r = Math.max(3, Math.round(A.small ? 4 : ch * 0.36 * sz * A.fit)), Rb = Math.max(6, Math.round(A.small ? fx.h * 0.3 : ch * 0.95 * sz * A.fit));
    const tw = twinkleS(L, q), g = (A.small ? 0.12 : 0.22) * sz, up = A.small ? A.y - 4 : ch * 4.4 * sz * A.fit;
    if (!L) P.push(part(10, drawFlash, { x: A.x, y: A.y, r: ch * 1.3 * sz * A.fit, al: 0.6 * c.alpha, sp: goldGlow() }));
    const sizes = [r, Math.max(3, r - 1)].map((R) => ({ R, face: coinS(R, q, false, L), back: coinS(R, q, true, L) }));
    for (let i = 0, n = many(c, 28, 8); i < n; i++) {
      const delay = Math.round(i * 0.6), th = (((i * 0.618) % 1) * 2 - 1) * (A.small ? 1.2 : 0.95) + rand(-0.1, 0.1), v = Math.sqrt(2 * g * up * rand(0.45, 1));
      P.push(part(delay + rand(52, 66), drawCoinBit, Object.assign({
        x: A.x + rand(-0.3, 0.3) * cw, y: A.y, vx: Math.sin(th) * v * (A.small ? 1.1 : 0.8), vy: -Math.cos(th) * v, g, delay,
        ph: rand(0, TAU), vph: rand(0.18, 0.36) * (Math.random() < 0.5 ? -1 : 1), gt: Math.random() < 0.45 ? (rand(8, 40) | 0) : -99, tw, L,
      }, sizes[i % 3 ? 0 : 1])));
    }
    P.push(part(80, drawBigCoin, { x: A.x, y0: A.small ? A.y + 4 : A.y, y1: A.small ? A.y - 1 : Math.max(Rb + 4, A.y - ch * 2.5 * sz * A.fit), y2: A.small ? A.y + 6 : A.y + ch * 0.6, up: 26, drop: 52, R: Rb, face: coinS(Rb, q, false, L), back: coinS(Rb, q, true, L), tw, L, al: c.alpha }));
  };

  /* ---- 글리치 블록: the line just sent tears into sliding slices with split colour, scanlines and a burst of broken blocks ---- */
  const GB = { C: [0, 229, 255], M: [255, 46, 136], W: [236, 248, 255] }, GBL = { C: [0, 150, 196], M: [214, 0, 112], W: [36, 30, 60] };
  const hash = (n) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  /** Broken data: runs of 2 px pixels in the glitch colours. */
  function noiseS(v, L, q) {
    return sprite(`d-noise|${v}|${L}|${q}`, () => paint(48, 24, q, (x) => {
      const R = rng(v * 7919 + 1), K = L ? GBL : GB, pal = [K.C, K.M, K.W, L ? [120, 120, 140] : [20, 26, 48]];
      for (let j = 0; j < 24; j += 2) {
        for (let i = 0; i < 48;) {
          const run = 2 * (1 + ((R() * (R() < 0.3 ? 8 : 2)) | 0));
          if (R() < 0.72) { x.fillStyle = rgba(pal[(R() * pal.length) | 0], 0.45 + R() * 0.5); x.fillRect(i, j, run, 2); }
          i += run;
        }
      }
    }));
  }
  /** Scanlines fading out from the middle (an ellipse), 256 x 72. */
  const scanS = (L, q) => sprite(`d-scan|${L}|${q}`, () => paint(256, 72, q, (x) => {
    x.fillStyle = L ? 'rgba(20,24,52,1)' : 'rgba(150,236,255,1)';
    for (let j = 0; j < 72; j += 3) x.fillRect(0, j, 256, 1);
    x.globalCompositeOperation = 'destination-in';
    x.translate(128, 36); x.scale(1, 72 / 256);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 128);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(-128, -128, 256, 256);
  }));
  /** The last stretch of the submitted line drawn three times (cyan, magenta, white rows), cell by cell like the terminal. */
  function lineText(c, A, K) {
    const o = c.o, cw = c.cw, ch = c.ch;
    if (!o.line || !A.text || A.small) return null;
    let font = `${Math.round(ch * 0.62)}px Consolas, monospace`;
    try { const t = activeTab().term.options; font = `${t.fontSize}px ${t.fontFamily}`; } catch (e) { /* keep the fallback */ }
    const from = Math.max(0, o.line.cols - 30), W = Math.ceil((o.line.cols - from) * cw + 8), chars = [...A.text];
    const s = paint(W, ch * 3, scaleOf(c.fx), (x) => {
      x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      [K.C, K.M, K.W].forEach((col, row) => {
        x.fillStyle = rgba(col, 1);
        let at = 0;
        for (const g of chars) {
          const wd = WIDE.test(g) ? 2 : 1;
          if (at >= from && g !== ' ') x.fillText(g, 4 + (at - from + wd / 2) * cw, row * ch + ch / 2 + 0.5);
          at += wd;
        }
      });
    });
    s.left = o.line.left + from * cw - 4; s.top = o.line.top; s.rh = ch;
    return s;
  }
  /** Copy the part of text row r that falls in the box (bx, by, bw, bh), moved sideways by dx. */
  function slice(ctx, s, r, bx, by, bw, bh, dx) {
    const q = s.c.width / s.w, x0 = Math.max(bx, s.left), x1 = Math.min(bx + bw, s.left + s.w), y0 = Math.max(by, s.top), y1 = Math.min(by + bh, s.top + s.rh);
    if (x1 - x0 < 1 || y1 - y0 < 0.5) return;
    ctx.drawImage(s.c, (x0 - s.left) * q, (y0 - s.top + r * s.rh) * q, (x1 - x0) * q, (y1 - y0) * q, x0 + dx, y0, x1 - x0, y1 - y0);
  }
  function drawTear(ctx, p) {
    const a = p.age++, K = p.K, L = p.L, A = p.A, env = clamp((a + 1) / 5) * tail(a / p.T, 0.5);
    ctx.save(); ctx.globalCompositeOperation = L ? SO : ADD; ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = env * (L ? 0.14 : 0.2); // scanlines crawling over the torn patch
    ctx.drawImage(p.scan.c, p.sx - p.scanW / 2, Math.round(A.y - 36 + ((a >> 1) % 3)), p.scanW, 72);
    if (p.txt && a < 34) { // the whole line, its colours pulled apart
      const s = Math.round(1 + 2 * Math.sin(Math.PI * (a / 34)));
      ctx.globalAlpha = 0.55 * env;
      slice(ctx, p.txt, 0, -1e5, -1e5, 2e5, 2e5, -s); slice(ctx, p.txt, 1, -1e5, -1e5, 2e5, 2e5, s);
    }
    for (const b of p.bands) { // slices sliding sideways in jumps
      if (a < b.t0 || a > b.t1) continue;
      const u = (a - b.t0) / (b.t1 - b.t0), e = Math.sin(Math.PI * u), step = Math.floor((a - b.t0) / b.hold);
      const dx = Math.round((hash(b.seed + step) - 0.5) * 2 * b.amp * (0.4 + 0.6 * e)), w = b.xb - b.xa;
      ctx.globalAlpha = e * (L ? 0.55 : 0.7);
      ctx.fillStyle = rgba(b.tint ? K.M : K.C, L ? 0.3 : 0.2); ctx.fillRect(b.xa + dx, b.y, w, b.h);
      if (p.txt && b.y < p.txt.top + p.txt.rh && b.y + b.h > p.txt.top) {
        slice(ctx, p.txt, 0, b.xa, b.y, w, b.h, dx); slice(ctx, p.txt, 1, b.xa, b.y, w, b.h, -Math.round(dx * 0.6));
        if (!L) slice(ctx, p.txt, 2, b.xa, b.y, w, b.h, Math.round(dx * 0.3));
      } else if (b.noise || p.bare) { const s = b.noise || p.noise, qq = s.c.width / s.w; ctx.drawImage(s.c, 0, b.ny * qq, s.c.width, Math.max(1, Math.min(b.h, 24 - b.ny)) * qq, b.xa + dx, b.y, w, b.h); }
      ctx.fillStyle = rgba(K.W, L ? 0.6 : 0.5); ctx.fillRect(b.xa + dx, b.y, w, 1); // the torn edge
    }
    for (const k of p.blocks) { // broken blocks, each shown once, briefly
      const u = a - k.t0;
      if (u < 0 || u >= k.dur) continue;
      const s = k.sp, qq = s.c.width / s.w;
      ctx.globalAlpha = (u >= k.dur - 2 ? 0.5 : 1) * (L ? 0.75 : 0.8);
      ctx.drawImage(s.c, k.sx * qq, k.sy * qq, Math.min(k.w, 48 - k.sx) * qq, Math.min(k.h, 24 - k.sy) * qq, k.x, k.y, k.w, k.h);
      ctx.fillStyle = rgba(k.tint ? K.M : K.C, 0.9); ctx.fillRect(k.x, k.y, k.w, 1);
    }
    if (a < 18) { // the cell at the point splits into its colours and snaps back
      const u = a / 18, d = Math.round(p.cw * 0.9 * Math.sin((Math.PI * (a + 1)) / 19)), bx = Math.round(A.x - p.cw / 2), by = Math.round(A.y - p.ch * 0.45), bh = Math.round(p.ch * 0.9);
      ctx.globalAlpha = (1 - u * 0.6) * (L ? 0.7 : 0.85);
      ctx.fillStyle = rgba(K.C, 1); ctx.fillRect(bx - d, by, p.cw, bh);
      ctx.fillStyle = rgba(K.M, 1); ctx.fillRect(bx + d, by, p.cw, bh);
      if (!L) { ctx.fillStyle = 'rgba(255,236,120,1)'; ctx.fillRect(bx, by + Math.round(d * 0.3), p.cw, bh); }
    }
    ctx.restore();
  }
  FX_SUBMIT.gblock = (c) => {
    const { fx, P, ch, cw, L } = c, A = anchor(c), q = scaleOf(fx), K = L ? GBL : GB;
    const bands = [], rowTop = A.y - ch / 2, cuts = [0, rand(0.28, 0.4), rand(0.58, 0.7), 1];
    for (let i = 0; i < 3; i++) { // the row itself, cut in three
      bands.push({ y: Math.round(rowTop + cuts[i] * ch), h: Math.max(1, Math.round((cuts[i + 1] - cuts[i]) * ch)), xa: Math.max(A.x0 - cw, A.x - cw * rand(14, 24)), xb: A.x + cw * rand(1.5, 3.5), t0: 1 + i * 2 + rand(0, 2), t1: 30 + rand(0, 10), hold: 3 + (i % 2), amp: cw * rand(1.2, 2.4), seed: (Math.random() * 1e9) | 0, tint: i % 2, ny: (Math.random() * 20) | 0 });
    }
    for (let i = 0, n = many(c, 9, 4); i < n; i++) { // and thinner ones above and below it
      const off = (i % 2 ? -1 : 1) * rand(0.6, A.small ? 1.1 : 1.8) * ch, h = Math.random() < 0.4 ? rand(1, 2.5) : rand(0.15, 0.5) * ch, span = rand(3, 16) * cw, t0 = 3 + (Math.abs(off) / ch) * 4 + rand(0, 10);
      bands.push({ y: Math.round(A.y + off - h / 2), h: Math.max(1, Math.round(h)), xa: A.x - span * rand(0.55, 1.1), xb: A.x + span * rand(0.15, 0.5), t0, t1: t0 + rand(8, 20), hold: 2 + ((Math.random() * 3) | 0), amp: cw * rand(0.8, 2.6), seed: (Math.random() * 1e9) | 0, tint: i % 2, noise: Math.random() < 0.55 ? noiseS(i % 3, L, q) : null, ny: (Math.random() * 20) | 0 });
    }
    const blocks = [];
    for (let i = 0, n = many(c, 18, 6); i < n; i++) {
      const gx = Math.round(-Math.abs(gauss()) * 12 + rand(-1, 3)), gy = Math.round(gauss() * (A.small ? 0.8 : 1.6));
      const w = Math.round(cw * (1 + ((Math.random() * 3.5) | 0))), h = Math.round(ch * (Math.random() < 0.5 ? 1 : rand(0.3, 0.6)));
      blocks.push({ x: Math.round(A.x - cw / 2 + gx * cw), y: Math.round(A.y - ch / 2 + gy * ch + (ch - h) * Math.random()), w, h, t0: Math.round(3 + Math.hypot(gx, (gy * ch) / cw) * 0.9 + rand(0, 6)), dur: 4 + ((Math.random() * 6) | 0), sp: noiseS(i % 3, L, q), sx: Math.round(rand(0, Math.max(0, 48 - w)) / 2) * 2, sy: Math.round(rand(0, Math.max(0, 24 - h)) / 2) * 2, tint: i % 2 });
    }
    const scanW = Math.min(fx.w, cw * 34);
    const txt = lineText(c, A, K);
    P.push(part(52, drawTear, { A, K, L, cw, ch, bands, blocks, txt, bare: !txt, noise: noiseS(1, L, q), scan: scanS(L, q), scanW, sx: A.small ? fx.w / 2 : clamp(A.x - cw * 6, scanW / 2, fx.w - scanW / 2) }));
  };

  /* ---- 레이저: the four beams turn like a lighthouse, sweeping out of the point; the row they run along lights up as a grid ---- */
  const beamS = (col, L, q) => sprite(`d-beam|${col}|${L}|${q}`, () => paint(128, 16, q, (x) => {
    const hot = L ? shade(col, -0.25) : shade(col, 0.55); // on a light page: a deeper sheath round the same white-hot core
    let g = x.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(L ? shade(col, -0.1) : col, L ? 0.32 : 0.5)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 128, 16);
    g = x.createLinearGradient(0, 5, 0, 11);
    g.addColorStop(0, rgba(hot, 0)); g.addColorStop(0.5, rgba(hot, L ? 0.85 : 0.9)); g.addColorStop(1, rgba(hot, 0));
    x.fillStyle = g; x.fillRect(0, 5, 128, 6);
    x.fillStyle = '#ffffff'; x.fillRect(0, 7.35, 128, 1.3);
    x.globalCompositeOperation = 'destination-in'; // thinning toward its far end
    g = x.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 16);
  }));
  /** The light a turning beam leaves behind it: a wedge from (0, 64) behind +x, fading with angle and distance. */
  const coneS = (col, L, q) => sprite(`d-cone|${col}|${L}|${q}`, () => paint(128, 128, q, (x) => {
    for (let i = 0, N = 10; i < N; i++) {
      const al = (L ? 0.22 : 0.32) * (1 - i / N) ** 1.6, g = x.createRadialGradient(0, 64, 0, 0, 64, 128);
      g.addColorStop(0, rgba(col, al)); g.addColorStop(0.6, rgba(col, al * 0.5)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 64); x.arc(0, 64, 128, -0.5 * ((i + 1) / N), -0.5 * (i / N)); x.closePath(); x.fill();
    }
  }));
  const streakS = (col, L, q) => sprite(`d-streak|${col}|${L}|${q}`, () => paint(96, 12, q, (x) => {
    const c2 = L ? shade(col, -0.4) : shade(col, 0.6);
    let g = x.createLinearGradient(0, 0, 96, 0);
    g.addColorStop(0, rgba(c2, 0)); g.addColorStop(0.5, rgba(c2, 1)); g.addColorStop(1, rgba(c2, 0));
    x.fillStyle = g; x.fillRect(0, 0, 96, 12);
    x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(0, 0, 0, 12); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 96, 12);
  }));
  /** How far a beam from the point at angle an can go before it leaves the layer. */
  function reach(p, an, l) {
    const ca = Math.cos(an), sa = Math.sin(an), { x, y } = p.A;
    let m = l;
    if (ca > 1e-3) m = Math.min(m, (p.W - 2 - x) / ca); else if (ca < -1e-3) m = Math.min(m, (2 - x) / ca);
    if (sa > 1e-3) m = Math.min(m, (p.H - 2 - y) / sa); else if (sa < -1e-3) m = Math.min(m, (2 - y) / sa);
    return Math.max(0, m);
  }
  function drawLaser(ctx, p) {
    const a = p.age++, A = p.A, L = p.L, cw = p.cw, ch = p.ch;
    const u = clamp((a - 8) / 46), turn = Math.PI * ease.smooth(u), sweep = 4 * u * (1 - u);
    const shrink = 1 - ease.in(clamp((a - 58) / 12)), len = p.len * ease.out(clamp((a + 1) / 7)) * shrink;
    ctx.save(); ctx.globalCompositeOperation = L ? SO : ADD;
    const top = Math.round(A.y - ch / 2) + 0.5; // the row lights up as a grid where the level beams run along it
    ctx.lineWidth = 1;
    for (const k of p.cells) {
      const d = a - k.t, d2 = a - k.t2;
      const al = (d < 0 ? 0 : Math.exp(-d / 11) * clamp(d / 2 + 0.5)) + (d2 < 0 ? 0 : 0.6 * Math.exp(-d2 / 9) * clamp(d2 / 2 + 0.5));
      if (al < 0.03) continue;
      const x = Math.round(A.x - cw / 2 - k.i * cw) + 0.5;
      ctx.globalAlpha = clamp(al) * p.al;
      ctx.fillStyle = p.cellFill; ctx.fillRect(x, top, cw, ch - 1);
      ctx.strokeStyle = p.gridCol; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ch - 1); ctx.moveTo(x, top); ctx.lineTo(x + cw, top); ctx.moveTo(x, top + ch - 1); ctx.lineTo(x + cw, top + ch - 1); ctx.stroke();
      ctx.fillStyle = p.dotCol; ctx.fillRect(x - 1, top - 1, 2, 2); ctx.fillRect(x - 1, top + ch - 2, 2, 2);
    }
    if (sweep > 0.02) for (let k = 0; k < 4; k++) { // the light left behind a turning beam
      const an = turn + (k * Math.PI) / 2, l = reach(p, an, len) * 0.9, sc = l / 128;
      ctx.globalAlpha = sweep * p.al; ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(an); ctx.drawImage(p.cone.c, 0, -64 * sc, 128 * sc, 128 * sc); ctx.restore();
    }
    const beam = (an, l, th, al) => { ctx.globalAlpha = al; ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(an); ctx.drawImage(p.beam.c, 0, -th / 2, l, th); ctx.restore(); };
    const side = Math.sin(Math.PI * clamp((a - 10) / 42));
    if (side > 0.02) for (let k = 0; k < 4; k++) { const an = turn + Math.PI / 4 + (k * Math.PI) / 2; beam(an, reach(p, an, len * 0.62), p.th * 0.6, side * 0.8 * p.al); }
    for (let k = 0; k < 4; k++) {
      const an = turn + (k * Math.PI) / 2, l = reach(p, an, len);
      beam(an, l, p.th, p.al);
      if (l > 4 && shrink > 0.1) { ctx.globalAlpha = 0.7 * p.al * shrink; put(ctx, p.glow, A.x + Math.cos(an) * l * 0.92, A.y + Math.sin(an) * l * 0.92, (ch * 0.5) / 48); } // where it ends
    }
    const flash = a < 6 ? 1 - a / 6 : 0, core = Math.max(0, shrink) * (0.55 + 0.45 * flash); // the emitter
    if (core > 0.01) {
      ctx.globalAlpha = core * p.al; put(ctx, p.glow, A.x, A.y, (ch * 0.85 * (1 + flash * 0.9)) / 48);
      const sw = ch * 3.2 * (0.6 + 0.4 * flash) * core; ctx.drawImage(p.streak.c, A.x - sw / 2, A.y - 4, sw, 8);
    }
    if (a >= 62) { const e = ease.out(clamp((a - 62) / 16)); ctx.globalAlpha = (1 - e) * 0.8 * p.al; ctx.strokeStyle = p.gridCol; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(A.x, A.y, ch * (0.3 + 1.3 * e), 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  FX_SUBMIT.laser = (c) => {
    const { fx, P, ch, cw, sz, cols, L } = c, A = anchor(c), q = scaleOf(fx), col = cols[0];
    const len = ch * 6.5 * sz * A.fit, n = Math.min(60, Math.max(3, Math.round((A.x - A.x0) / cw) + 1)), cells = [];
    // when the beam's head reaches each cell (it grows with ease.out over 7 frames), then on along the row; again as the turn ends
    const at = (dist) => (dist <= len ? 7 * (1 - Math.cbrt(1 - dist / len)) - 1 : 6 + (dist - len) / (cw * 2.5));
    for (let i = -3; i < n; i++) { const dist = Math.abs(i) * cw; cells.push({ i, t: at(dist), t2: 52 + dist / (cw * 2) }); }
    const glowS = L ? glow(`d-lzL|${col}`, [[0, 'rgba(255,255,255,1)'], [0.14, rgba(shade(col, -0.2), 0.85)], [0.36, rgba(shade(col, -0.1), 0.22)], [1, rgba(col, 0)]]) : glow(`d-lz|${col}`, [[0, 'rgba(255,255,255,1)'], [0.18, rgba(shade(col, 0.5), 0.8)], [0.5, rgba(col, 0.25)], [1, rgba(col, 0)]]);
    P.push(part(80, drawLaser, {
      A, W: fx.w, H: fx.h, cw, ch, len, th: Math.max(8, 14 * sz * A.fit), cells, al: c.alpha, L,
      beam: beamS(col, L, q), cone: coneS(col, L, q), streak: streakS(col, L, q), glow: glowS,
      cellFill: rgba(L ? col : shade(col, 0.3), L ? 0.14 : 0.12), gridCol: rgba(L ? shade(col, -0.35) : shade(col, 0.45), 0.8), dotCol: L ? rgba(shade(col, -0.5), 1) : '#ffffff',
    }));
  };
})();
