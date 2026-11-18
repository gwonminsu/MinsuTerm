'use strict';
/*
 * Submit (Enter) flourishes, group e: 꽃 피기 · 반짝이 가루 · 주사위 · 풍선 펑 · 빗방울 · 별똥별 · 마법진.
 * See fx/kit.js for the contract. Each one starts at the last input position (FXKit.anchor), is over in about
 * 1.5 s, and paints everything detailed once into a cached sprite that is only moved afterwards.
 */
(function () {
  const { TAU, sprite, paint, put, part, clamp, ease, rand, glow, rgba, shade, scaleOf, thin, anchor } = window.FXKit;
  const SUB = window.FX_SUBMIT;
  const seg = (v, a, b) => clamp((v - a) / (b - a)); // 0 → 1 while v runs from a to b
  const fade = (t, from) => (t < from ? 1 : 1 - ease.smooth(clamp((t - from) / (1 - from)))); // 1, then down to 0 from t = from
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  const ck = (c) => c.join(',');
  const lq = (L) => (L ? 1 : 0);
  /**
   * A flourish that rises from y and needs `need` px above it: close to the top of the layer (the first rows, the
   * composer's first line) it shrinks a little and, if that is not enough, sits up to `drop` px lower. → { s, y }
   */
  function roomUp(y, need, drop) {
    const s = clamp((y - 4) / need, 0.62, 1);
    return { s, y: y + clamp(need * s - (y - 4), 0, drop) };
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /**
   * Overlapping pieces (petals, a bunch of balloons) drawn at full strength into a reused scratch canvas and laid
   * down at alpha al, so the group fades out as one thing instead of turning see-through where pieces overlap.
   */
  function asOne(ctx, fx, al, x0, y0, w, h, draw) {
    if (al >= 0.999) { draw(ctx); return; }
    if (al <= 0) return;
    const q = scaleOf(fx), W = Math.ceil(w / 32) * 32, H = Math.ceil(h / 32) * 32;
    x0 = Math.floor(x0); y0 = Math.floor(y0); // laid down on whole pixels: no resampling blur
    const s = sprite(`e-scratch|${W}|${H}|${q}`, () => paint(W, H, q, () => {})), x = s.c.getContext('2d');
    x.setTransform(q, 0, 0, q, 0, 0); x.clearRect(0, 0, W, H); x.translate(-x0, -y0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.lineCap = 'round'; x.lineJoin = 'round';
    draw(x);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al; ctx.drawImage(s.c, x0, y0, W, H); ctx.restore();
  }

  /** A four-pointed glint: soft light round a white heart (dark page), or a deep-toned star (light page). */
  const starS = (col, L, q, soft) => sprite(`e-star|${ck(col)}|${lq(L)}|${q}|${lq(soft)}`, () => paint(32, 32, q, (x) => {
    x.translate(16, 16);
    const ray = (len, wd) => { x.beginPath(); x.moveTo(0, -len); x.quadraticCurveTo(wd, -wd, len, 0); x.quadraticCurveTo(wd, wd, 0, len); x.quadraticCurveTo(-wd, wd, -len, 0); x.quadraticCurveTo(-wd, -wd, 0, -len); x.fill(); };
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 16); g.addColorStop(0, rgba(shade(col, 0.5), 0.7)); g.addColorStop(0.3, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(-16, -16, 32, 32); }
    x.save(); x.rotate(Math.PI / 4); x.fillStyle = rgba(L ? shade(col, -0.3) : shade(col, 0.4), 0.75); ray(7.5, 1.1); x.restore();
    x.fillStyle = rgba(L ? shade(col, -0.42) : shade(col, 0.6), 1); ray(15, 1.6);
    x.fillStyle = L ? rgba(shade(col, 0.35), 1) : soft ? rgba(shade(col, 0.72), 1) : '#ffffff'; ray(6.5, 1.1);
  }));
  /** A glint that swells, turns a little and goes (optionally flying out and slowing). */
  function drawStar(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), k = Math.sin(Math.PI * Math.min(1, t));
    if (p.vx || p.vy) { p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; }
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, k * 1.5) * p.al;
    put(ctx, p.sp, p.x, p.y, (p.s * (0.3 + 0.7 * k)) / 32, p.rot + a * p.spin);
    ctx.restore();
  }
  const star = (P, x, y, s, wait, T, sp, L, extra) => P.push(part(T + wait, drawStar, Object.assign({ x, y, s, wait, sp, L, rot: rand(-0.3, 0.3), spin: rand(-0.04, 0.04), al: 1, vx: 0, vy: 0, drag: 0.9, g: 0 }, extra)));

  /* ====================================================================================================== */
  /* 꽃 피기: a little bouquet tied at the cursor; its flowers open one after another across the fan, then    */
  /* it fades and lets a few petals go.                                                                      */
  /* ====================================================================================================== */

  const FLORA = [[255, 170, 205], [255, 205, 120], [190, 160, 255], [140, 210, 255]];
  const BLOSSOM = [{ n1: 6, n2: 5, l: 1, w: 0.64 }, { n1: 8, n2: 6, l: 1.06, w: 0.46 }, { n1: 5, n2: 5, l: 0.92, w: 0.8 }]; // round, daisy-like, cupped
  const PETAL = new Path2D('M10 31C3.5 26.5 0.4 15 2.4 7.4Q4.6 1.2 8.4 2.4Q10 4.4 11.6 2.4Q15.4 1.2 17.6 7.4C19.6 15 16.5 26.5 10 31Z');
  /** A petal, base down: deep at the throat, pale toward the notched tip, veined, its right half turning away. */
  const petalS = (col, inner, L, q) => sprite(`e-petal|${ck(col)}|${lq(inner)}|${lq(L)}|${q}`, () => paint(20, 32, q, (x) => {
    const c = inner ? shade(col, 0.22) : L ? shade(col, -0.12) : col;
    let g = x.createLinearGradient(0, 31, 0, 1);
    g.addColorStop(0, rgba(shade(c, inner ? -0.3 : -0.48), 1)); g.addColorStop(0.36, rgba(c, 1)); g.addColorStop(1, rgba(shade(c, 0.62), 1));
    x.fillStyle = g; x.fill(PETAL);
    x.save(); x.clip(PETAL);
    g = x.createLinearGradient(0, 0, 20, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(60,0,40,0)'); g.addColorStop(1, 'rgba(60,0,40,0.22)');
    x.fillStyle = g; x.fillRect(0, 0, 20, 32);
    x.strokeStyle = rgba(shade(c, -0.42), 0.4); x.lineWidth = 0.6;
    for (const d of [-4.6, 0, 4.6]) { x.beginPath(); x.moveTo(10, 30); x.quadraticCurveTo(10 + d * 0.35, 18, 10 + d, 6.5); x.stroke(); }
    x.restore();
    x.strokeStyle = rgba(shade(c, -0.52), L ? 0.75 : 0.5); x.lineWidth = 0.8; x.stroke(PETAL);
  }));
  /** The flower's heart: a domed golden disc ringed with stamens. */
  const discS = (q) => sprite(`e-disc|${q}`, () => paint(16, 16, q, (x) => {
    const g = x.createRadialGradient(6.4, 6, 0.5, 8, 8, 7.4);
    g.addColorStop(0, '#fff7c8'); g.addColorStop(0.35, '#ffd451'); g.addColorStop(0.8, '#d98b16'); g.addColorStop(1, '#8c4f06');
    x.fillStyle = g; x.beginPath(); x.arc(8, 8, 7.2, 0, TAU); x.fill();
    for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; x.fillStyle = i % 2 ? 'rgba(120,64,4,0.75)' : 'rgba(255,244,190,0.95)'; x.beginPath(); x.arc(8 + Math.cos(an) * 4.9, 8 + Math.sin(an) * 4.9, 0.85, 0, TAU); x.fill(); }
  }));
  const LEAF = new Path2D('M6 29.5C-0.5 22 0.2 8 6 0.5C11.8 8 12.5 22 6 29.5Z');
  /** A leaf, base down: lit on its left, a pale midrib and side veins. */
  const leafS = (L, q) => sprite(`e-leaf|${lq(L)}|${q}`, () => paint(12, 30, q, (x) => {
    const g = x.createLinearGradient(0, 0, 12, 0);
    g.addColorStop(0, L ? '#79bd64' : '#8fd07a'); g.addColorStop(0.5, L ? '#3f8a3e' : '#4f9e4c'); g.addColorStop(1, L ? '#215a2a' : '#2a6b34');
    x.fillStyle = g; x.fill(LEAF);
    x.strokeStyle = 'rgba(214,246,180,0.75)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(6, 29); x.quadraticCurveTo(5.2, 15, 6, 2); x.stroke();
    x.lineWidth = 0.45; x.strokeStyle = 'rgba(214,246,180,0.4)';
    for (let i = 0; i < 4; i++) { const yy = 24 - i * 5.5; x.beginPath(); x.moveTo(5.8, yy); x.lineTo(2.2, yy - 4); x.moveTo(5.8, yy); x.lineTo(9.8, yy - 4); x.stroke(); }
    x.strokeStyle = `rgba(20,70,30,${L ? 0.75 : 0.5})`; x.lineWidth = 0.7; x.stroke(LEAF);
  }));
  const BOW = ['M15 10L10 20.5L12 19L13.4 21L16.4 11Z', 'M17 10L22 20.5L20 19L18.6 21L15.6 11Z', 'M15 9C10 2 2.5 1.5 2.5 7.5C2.5 13 10 13 15 10.5Z', 'M17 9C22 2 29.5 1.5 29.5 7.5C29.5 13 22 13 17 10.5Z'].map((d) => new Path2D(d));
  /** The satin bow the stems are tied with. */
  const bowS = (q) => sprite(`e-bow|${q}`, () => paint(32, 22, q, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 22);
    g.addColorStop(0, '#ff9cc0'); g.addColorStop(0.55, '#e85b8f'); g.addColorStop(1, '#a8305e');
    x.fillStyle = g; x.strokeStyle = 'rgba(110,20,56,0.6)'; x.lineWidth = 0.7;
    for (const b of BOW) { x.fill(b); x.stroke(b); }
    x.fillStyle = 'rgba(120,20,60,0.45)'; // the insides of the loops
    for (const [ex, r] of [[8.2, 0.12], [23.8, -0.12]]) { x.beginPath(); x.ellipse(ex, 8.6, 2.6, 1.3, r, 0, TAU); x.fill(); }
    x.fillStyle = 'rgba(255,232,242,0.75)'; // satin shine
    for (const [ex, r] of [[7.4, -0.25], [24.6, 0.25]]) { x.beginPath(); x.ellipse(ex, 5, 3.2, 1.1, r, 0, TAU); x.fill(); }
    const kg = x.createLinearGradient(0, 6, 0, 13); kg.addColorStop(0, '#ffb8d2'); kg.addColorStop(1, '#c23f72');
    x.fillStyle = kg; x.beginPath(); x.roundRect(13.2, 6.3, 5.6, 6.4, 2); x.fill(); x.stroke();
  }));

  /** A point on a stem (a quadratic from the tie to the flower), bent about the tie by the breeze. */
  function stemAt(f, t, sw) {
    const m = 1 - t, x = m * m * f.ox + 2 * m * t * f.cx + t * t * f.hx, y = m * m * f.oy + 2 * m * t * f.cy + t * t * f.hy;
    const dx = x - f.ox, dy = y - f.oy, s = sw * t, cs = Math.cos(s), sn = Math.sin(s);
    return [f.ox + dx * cs - dy * sn, f.oy + dx * sn + dy * cs];
  }
  function leafAt(ctx, sp, x, y, an, len) {
    if (len < 0.5) return;
    const w = len * 0.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(an + Math.PI / 2); ctx.drawImage(sp.c, -w / 2, -len, w, len); ctx.restore();
  }
  /** One ring of petals: closed into a bud at o = 0, spread round the heart at o = 1 (o may overshoot). */
  function petalRing(ctx, sp, n, rot, o, len, wd) {
    const oc = Math.max(0, o), l = len * (0.42 + 0.58 * Math.min(oc, 1.1)), w = wd * (0.5 + 0.5 * Math.min(oc, 1));
    for (let j = 0; j < n; j++) {
      const ph = rot + (j / n) * TAU, an = Math.atan2(Math.sin(ph), Math.cos(ph)) * (0.1 + 0.9 * oc);
      ctx.save(); ctx.rotate(an); ctx.drawImage(sp.c, -w / 2, -l * 0.94, w, l); ctx.restore();
    }
  }
  function drawFlower(ctx, p, f, a) {
    if (f.g < 0.5) return;
    const [hx, hy] = stemAt(f, f.g, f.sw), [bx, by] = stemAt(f, f.g - 0.06, f.sw), dir = Math.atan2(hy - by, hx - bx) + Math.PI / 2;
    const o1 = ease.back(seg(a, f.h, f.h + 11)), o2 = ease.back(seg(a, f.h + 4, f.h + 15)), bud = seg(f.g, 0.5, 1), R = f.R;
    if (f.glow && o1 > 0) { // a breath of light as it opens
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.38 * Math.sin(Math.PI * seg(a, f.h, f.h + 30)) * p.al;
      put(ctx, f.glow, hx, hy, (R * 3.4) / 96); ctx.restore();
    }
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(dir); ctx.scale(1, 0.8); // turned a little toward its stem
    petalRing(ctx, f.sp1, f.n1, f.rot, o1, R * f.l1 * bud, R * f.w1 * bud);
    if (o2 > 0) petalRing(ctx, f.sp2, f.n2, f.rot + Math.PI / f.n2, o2, R * 0.72, R * f.w1 * 0.86);
    if (o2 > 0.2) { const cs = R * 0.62 * Math.min(1.1, o2); ctx.drawImage(p.disc.c, -cs / 2, -cs / 2, cs, cs); }
    ctx.restore();
  }
  function drawBouquet(ctx, p, fx) {
    const a = p.age++, u = p.u;
    asOne(ctx, fx, fade(a / p.T, 0.6), p.x - u * 3.5, p.y - u * 4.4, u * 7, u * 5.3, (x) => bouquet(x, p, a));
  }
  function bouquet(ctx, p, a) {
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    for (const lf of p.base) leafAt(ctx, p.leaf, lf.x, lf.y, lf.an + Math.sin(a * 0.08 + lf.an) * 0.04, lf.len * ease.back(seg(a, lf.d, lf.d + 12)));
    for (const f of p.fl) {
      f.g = ease.out(seg(a, f.d, f.d + 12)); f.sw = Math.sin(a * 0.09 + f.ph) * 0.04;
      if (f.g <= 0) continue;
      for (const [col, wd, off] of p.ink) { // a dark stalk, light down its lit side
        ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const [sx, sy] = stemAt(f, (i / 10) * f.g, f.sw); if (i) ctx.lineTo(sx + off, sy); else ctx.moveTo(sx + off, sy); }
        ctx.stroke();
      }
      if (f.lf && f.g > 0.45) { const [lx, ly] = stemAt(f, 0.45, f.sw), [bx, by] = stemAt(f, 0.4, f.sw); leafAt(ctx, p.leaf, lx, ly, Math.atan2(ly - by, lx - bx) + f.lf * 0.85, p.u * 0.72 * ease.back(seg(a, f.d + 6, f.d + 16))); }
    }
    for (const f of p.fl) drawFlower(ctx, p, f, a);
    put(ctx, p.bow, p.x, p.y, p.bs * ease.back(seg(a, 1, 9)));
    ctx.restore();
  }
  function drawFallPetal(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    p.ph += p.w; p.vy = Math.min(p.vy + 0.035 * p.k, 0.7 * p.k); p.vx *= 0.97; p.x += p.vx + Math.sin(p.ph) * 0.35 * p.k; p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a / 4) * (1 - ease.smooth(seg(t, 0.4, 1)));
    ctx.translate(p.x, p.y); ctx.rotate(p.rot + a * p.spin); ctx.scale(0.35 + 0.65 * Math.abs(Math.cos(p.ph * 0.7)), 1);
    ctx.drawImage(p.sp.c, -p.wd / 2, -p.len / 2, p.wd, p.len);
    ctx.restore();
  }
  const FAN = { 3: [[-0.62, 2.3], [0, 3.0], [0.62, 2.35]], 4: [[-0.86, 2.15], [-0.29, 2.95], [0.3, 2.6], [0.88, 2.05]], 5: [[-0.98, 1.95], [-0.5, 2.65], [0, 3.1], [0.5, 2.55], [0.98, 1.9]] };
  SUB.bloom = function (c) {
    const { fx, P, ch, sz, L, alpha } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const u0 = ch * sz * A.fit, room = A.small ? { s: 1, y: fx.h - 5 } : roomUp(A.y + ch * 0.15, u0 * 3.9, ch);
    const n = th < 1 ? 3 : Math.random() < 0.45 ? 5 : 4, oy = room.y, u = u0 * room.s, k = u / 18, ox = A.x + (A.small ? 0 : c.cw * 0.3); // the knot just clear of the last character
    const cols = shuffle(FLORA.slice()), kind0 = (Math.random() * 3) | 0;
    const fl = FAN[n].map(([an0, len], i) => {
      const an = -Math.PI / 2 + an0 + rand(-0.05, 0.05), Ls = len * u * rand(0.95, 1.05), col = i < 4 ? cols[i] : shade(cols[0], 0.25), b = BLOSSOM[(kind0 + i) % 3];
      return {
        ox: ox + (i - (n - 1) / 2) * u * 0.05, oy, cx: ox + Math.cos(an) * Ls * 0.18, cy: oy - Ls * 0.55, hx: ox + Math.cos(an) * Ls, hy: oy + Math.sin(an) * Ls,
        d: Math.abs(i - (n - 1) / 2) * 1.5, h: 7 + i * 3.5, R: u * rand(0.7, 0.8), ph: rand(0, TAU), rot: rand(0, TAU), g: 0, sw: 0,
        n1: b.n1, n2: b.n2, l1: b.l, w1: b.w, sp1: petalS(col, false, L, q), sp2: petalS(col, true, L, q), col,
        glow: L ? null : glow(`e-bloom|${ck(col)}`, [[0, rgba(shade(col, 0.5), 0.9)], [0.4, rgba(col, 0.35)], [1, rgba(col, 0)]]),
        lf: i === 0 ? -1 : i === n - 1 ? 1 : i === 1 ? 1 : 0,
      };
    });
    const base = [-1, 1].map((s) => ({ x: ox + s * u * 0.08, y: oy - u * 0.12, an: -Math.PI / 2 + s * 1.08, len: u * 1.2, d: 3 }));
    const ink = [[L ? '#235c2b' : '#2f7436', 1.8 * k, 0], [L ? 'rgba(150,210,110,0.9)' : 'rgba(170,226,130,0.85)', 0.6 * k, -0.45 * k]];
    P.push(part(72, drawBouquet, { x: ox, y: oy, u, fl, base, ink, leaf: leafS(L, q), disc: discS(q), bow: bowS(q), bs: (u * 1.15) / 32, al: alpha, L }));
    if (th < 0.5) return;
    for (const f of fl) for (let j = 0; j < 2; j++) { // a few petals let go as it fades
      const wait = 40 + j * 7 + ((Math.random() * 6) | 0), len = f.R * f.l1 * 0.85;
      P.push(part(36 + wait, drawFallPetal, { x: f.hx + rand(-0.4, 0.4) * f.R, y: f.hy + rand(-0.3, 0.3) * f.R, vx: rand(-0.5, 0.5) * k, vy: rand(-0.5, 0) * k, k, ph: rand(0, TAU), w: rand(0.12, 0.2), rot: rand(0, TAU), spin: rand(-0.06, 0.06), len, wd: len * f.w1, sp: f.sp1, wait }));
    }
  };

  /* ====================================================================================================== */
  /* 반짝이 가루: a glitter bomb. A pastel puff bursts at the cursor and throws a cloud of tiny flakes that   */
  /* slow, then settle, flipping and catching the light as they fall.                                        */
  /* ====================================================================================================== */

  const GLIT = [[255, 166, 218], [164, 206, 255], [255, 232, 150], [198, 170, 255], [160, 240, 206]];
  const GLIT_L = [[222, 80, 158], [64, 128, 222], [196, 142, 16], [128, 88, 222], [30, 160, 112]];
  const HEX = new Path2D('M8.72 7.15L5 9.3L1.28 7.15L1.28 2.85L5 0.7L8.72 2.85Z');
  /** A hexagonal flake: one facet bright, one in shade, a fine rim. */
  const flakeS = (col, L, q) => sprite(`e-flake|${ck(col)}|${lq(L)}|${q}`, () => paint(10, 10, q, (x) => {
    const g = x.createLinearGradient(1.3, 0.7, 8.7, 9.3);
    g.addColorStop(0, rgba(shade(col, 0.75), 1)); g.addColorStop(0.5, rgba(col, 1)); g.addColorStop(1, rgba(shade(col, -0.38), 1));
    x.fillStyle = g; x.fill(HEX);
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.moveTo(5, 5); x.lineTo(1.28, 2.85); x.lineTo(5, 0.7); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.beginPath(); x.moveTo(5, 5); x.lineTo(8.72, 7.15); x.lineTo(5, 9.3); x.closePath(); x.fill();
    x.strokeStyle = rgba(shade(col, -0.5), L ? 0.85 : 0.5); x.lineWidth = 0.6; x.stroke(HEX);
  }));
  function drawPuff(ctx, p) {
    const a = p.age++, t = a / p.T, e = ease.out(clamp(t * 1.5));
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    for (const b of p.bl) {
      ctx.globalAlpha = (1 - t) ** 1.6 * b.al * p.al;
      put(ctx, b.sp, p.x + b.dx * e, p.y + b.dy * e + t * t * p.u * 0.5, (b.r * (0.35 + 0.85 * e)) / 96);
    }
    if (a < 8) { ctx.globalAlpha = (1 - a / 8) * (p.L ? 0.45 : 0.85) * p.al; put(ctx, p.core, p.x, p.y, (p.u * (1.3 + a * 0.3)) / 96); } // the pop
    ctx.restore();
  }
  function drawGlitter(ctx, p, fx) {
    const a = p.age++, d = fx.dpr || 1, L = p.L;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (const f of p.fl) {
      const fa = a - f.wait;
      f.on = fa >= 0 && fa < f.T;
      if (!f.on) continue;
      f.vx *= f.drag; f.vy = f.vy * f.drag + p.g; // flung out, held back by the air, then settling at its own pace
      f.ph += f.w; f.x += f.vx + Math.sin(f.ph * 0.31 + f.sw) * 0.24 * p.k; f.y += f.vy;
      const t = fa / f.T, cs = Math.cos(f.ph), r = f.rot + fa * f.spin, co = Math.cos(r), si = Math.sin(r);
      f.face = Math.abs(cs); f.al = Math.min(1, (fa + 1) / 2) * (t > 0.62 ? 1 - ease.smooth((t - 0.62) / 0.38) : 1);
      const sx = (Math.max(0.16, f.face) * f.s) / 10, sy = f.s / 10;
      ctx.globalAlpha = f.al * (0.45 + 0.55 * f.face);
      ctx.setTransform(d * co * sx, d * si * sx, -d * si * sy, d * co * sy, d * f.x, d * f.y);
      ctx.drawImage(f.sp.c, -5, -5, 10, 10);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const f of p.fl) { // a flake turned square to the light flashes; a few flash big
      if (!f.on) continue;
      const fa = a - f.wait, big = f.big && fa > f.big && fa < f.big + 16 ? Math.sin(((fa - f.big) / 16) * Math.PI) : 0, catchL = f.face > 0.965 ? (f.face - 0.965) / 0.035 : 0;
      const k = Math.max(big, catchL * 0.4);
      if (k < 0.04) continue;
      ctx.globalAlpha = f.al * Math.min(1, k * 1.4);
      put(ctx, f.star, f.x, f.y, (f.s * (1.1 + 2.6 * k)) / 32, f.rot);
    }
    ctx.restore();
  }
  SUB.glitter = function (c) {
    const { fx, P, ch, cw, sz, L, k: kk, alpha } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const u = ch * sz * A.fit, k = u / 18, pal = L ? GLIT_L : GLIT;
    const bl = [];
    for (let i = 0; i < 7; i++) {
      const an = rand(0, TAU), d = u * rand(0.5, 1.3), col = pal[i % pal.length];
      bl.push({ dx: Math.cos(an) * d, dy: Math.sin(an) * d * 0.8 - u * 0.35, r: u * rand(1.3, 2.1), al: rand(0.35, 0.6), sp: glow(`e-puff|${ck(col)}|${lq(L)}`, L ? [[0, rgba(col, 0.42)], [0.5, rgba(col, 0.16)], [1, rgba(col, 0)]] : [[0, rgba(shade(col, 0.1), 0.8)], [0.45, rgba(col, 0.38)], [1, rgba(col, 0)]]) });
    }
    P.push(part(34, drawPuff, { x: A.x, y: A.y, u, bl, al: alpha, L, core: glow(`e-puffcore|${lq(L)}`, L ? [[0, 'rgba(255,170,220,0.7)'], [0.4, 'rgba(240,150,210,0.25)'], [1, 'rgba(240,150,210,0)']] : [[0, 'rgba(255,246,252,1)'], [0.3, 'rgba(255,200,236,0.6)'], [1, 'rgba(230,190,255,0)']]) }));
    const fl = [], n = Math.round(118 * th * clamp(kk, 0.7, 1.2)), v0 = u * 0.28 * (A.small ? 0.8 : 1);
    for (let i = 0; i < n; i++) {
      const an = rand(0, TAU), sp = (Math.random() < 0.45 ? rand(0.72, 1) : rand(0.12, 0.72)) * v0, col = pal[(Math.random() * pal.length) | 0];
      fl.push({ x: A.x + rand(-0.3, 0.3) * cw, y: A.y + rand(-0.25, 0.25) * ch, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.85 - u * 0.05, drag: rand(0.885, 0.93), s: rand(2.8, 5.2) * k, ph: rand(0, TAU), w: rand(0.1, 0.22), sw: rand(0, TAU), rot: rand(0, TAU), spin: rand(-0.05, 0.05), wait: (Math.random() * 3) | 0, T: rand(60, 92) | 0, big: i % 7 === 0 ? 6 + ((Math.random() * 50) | 0) : 0, sp: flakeS(col, L, q), star: starS(col, L, q, true), on: false, face: 0, al: 0 });
    }
    P.push(part(96, drawGlitter, { fl, g: 0.048 * k, k, L }));
  };

  /* ====================================================================================================== */
  /* 주사위: two real dice tossed from the cursor tumble, bounce and roll to a stop on double sixes, which   */
  /* sparkle.                                                                                                */
  /* ====================================================================================================== */

  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const DF = 40, DR = 6.5;
  const FACE = (() => { const f = new Path2D(); f.roundRect(0.4, 0.4, DF - 0.8, DF - 0.8, DR); return f; })();
  /** One face of an ivory die: rounding off at its edges, the pips drilled in (the ace in red). */
  const faceS = (v, q) => sprite(`e-dieface|${v}|${q}`, () => paint(DF, DF, q, (x) => {
    const g = x.createRadialGradient(15, 13, 2, 20, 20, 29);
    g.addColorStop(0, '#fffdf7'); g.addColorStop(0.65, '#f4eee1'); g.addColorStop(1, '#d9cdb5');
    x.fillStyle = g; x.fill(FACE);
    x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 1; x.beginPath(); x.roundRect(2.4, 2.4, DF - 4.8, DF - 4.8, DR - 1.8); x.stroke();
    x.strokeStyle = 'rgba(120,100,70,0.4)'; x.lineWidth = 1.1; x.stroke(FACE);
    const red = v === 1, pr = red ? 5.6 : 3.8;
    for (const [dx, dy] of PIPS[v]) {
      const px = 20 + dx * 10.5, py = 20 + dy * 10.5, pg = x.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
      pg.addColorStop(0, red ? '#6e0a14' : '#040306'); pg.addColorStop(0.72, red ? '#b8172a' : '#221d27'); pg.addColorStop(1, red ? '#dc4452' : '#4d4653');
      x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.7; x.beginPath(); x.arc(px, py, pr - 0.35, 0.1 * Math.PI, 0.62 * Math.PI); x.stroke(); // light on the far wall of the pit
    }
  }));
  const rot3 = (ax, ay, az, th) => { const c = Math.cos(th), s = Math.sin(th), t = 1 - c; return [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay, t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax, t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c]; };
  const mul3 = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((cc) => A[r * 3] * B[cc] + A[r * 3 + 1] * B[3 + cc] + A[r * 3 + 2] * B[6 + cc]));
  const app3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const DIE = [[6, [0, 1, 0], [1, 0, 0], [0, 0, 1]], [1, [0, -1, 0], [1, 0, 0], [0, 0, -1]], [2, [0, 0, 1], [1, 0, 0], [0, -1, 0]], [5, [0, 0, -1], [-1, 0, 0], [0, -1, 0]], [3, [1, 0, 0], [0, 0, -1], [0, -1, 0]], [4, [-1, 0, 0], [0, 0, 1], [0, -1, 0]]]; // value, normal, the face's two axes
  const SUN = (() => { const v = [-0.45, 0.78, 0.45], l = Math.hypot(...v); return v.map((cc) => cc / l); })();
  const ELEV = 0.86, VIEW = rot3(1, 0, 0, ELEV); // seen from above enough for the top face to read
  const CORNERS = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((cc) => [a, b, cc])));
  function hull(pts) { // monotone chain
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
    for (const pt of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
    for (let i = pts.length - 1; i >= 0; i--) { const pt = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], pt) <= 0) hi.pop(); hi.push(pt); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  /** A toss: up, down, a few bounces, a short slide. Frames of [dx, dy] from the start, and the frames it hit the floor. */
  function toss(vy, g, floor) {
    const path = [], hits = [];
    let x = 0, y = 0, vx = 1, b = 0, ground = false, rest = 0;
    for (let i = 0; i < 90 && !rest; i++) {
      if (!ground) {
        vy += g; x += vx; y += vy;
        if (y >= floor && vy > 0) { y = floor; hits.push(i); if (vy > 1.2 * Math.sqrt(g / 0.34) && b < 3) { vy *= -0.4; vx *= 0.6; b++; } else ground = true; }
      } else { vx *= 0.72; x += vx; if (vx < 0.05) rest = i; }
      path.push([x, y]);
    }
    return { path, hits, rest: rest || path.length - 1 };
  }
  function drawDie(ctx, p, fx) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const [px, py] = p.path[Math.min(a, p.path.length - 1)], h = p.h, L = p.L, al = fade(a / (p.T - p.wait), 0.8);
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    if (L) { const z = clamp((p.floor - py) / (h * 6)); ctx.globalAlpha = al * 0.4 * (1 - z * 0.7); put(ctx, p.shadow, px, p.floorY, (h * (3.6 - z)) / 64); }
    for (const hf of p.hits) { // a little dust where it hits
      const da = a - hf;
      if (da < 0 || da > 14) continue;
      const [hx] = p.path[hf], s = da / 14;
      ctx.globalAlpha = al * (1 - s) * 0.5;
      for (const d of [-1, 1]) put(ctx, p.dust, hx + d * h * (0.6 + s * 1.6), p.floorY - h * 0.15 - s * h * 0.3, (h * (1 + s * 1.4)) / 96);
    }
    if (p.glow && a > p.rest) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.42 * Math.sin(Math.PI * seg(a, p.rest, p.rest + 40)); put(ctx, p.glow, px, py, (h * 7) / 96); }
    ctx.restore();
    asOne(ctx, fx, al, px - h * 2.2, py - h * 2.2, h * 4.4, h * 4.4, (x) => die(x, p, a, px, py));
  }
  function die(ctx, p, a, px, py) {
    const h = p.h, u = Math.min(1, a / p.rest), M = mul3(VIEW, mul3(rot3(p.ax[0], p.ax[1], p.ax[2], p.th0 * (1 - u) ** 2.2), p.Rf));
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const pts = CORNERS.map((v) => { const w = app3(M, v); return [px + w[0] * h, py - w[1] * h]; }), hp = hull(pts), r = h * (DR / DF) * 1.8;
    ctx.beginPath(); // the body under the faces, filling the rounded corners where three faces meet
    for (let i = 0; i < hp.length; i++) { const [x0, y0] = hp[i], dx = px - x0, dy = py - y0, dl = Math.hypot(dx, dy) || 1, f = Math.min(r, dl * 0.5) / dl; if (i) ctx.lineTo(x0 + dx * f, y0 + dy * f); else ctx.moveTo(x0 + dx * f, y0 + dy * f); }
    ctx.closePath(); ctx.fillStyle = '#d3c6ad'; ctx.strokeStyle = '#d3c6ad'; ctx.lineJoin = 'round'; ctx.lineWidth = r * 1.6; ctx.fill(); ctx.stroke();
    const kf = (2 * h) / DF;
    for (const [v, nn, uu, vv] of DIE) {
      const N = app3(M, nn);
      if (N[2] < 0.02) continue;
      const U = app3(M, uu), V = app3(M, vv);
      ctx.save();
      ctx.transform(U[0] * kf, -U[1] * kf, V[0] * kf, -V[1] * kf, px + (N[0] - U[0] - V[0]) * h, py - (N[1] - U[1] - V[1]) * h);
      ctx.drawImage(p.faces[v].c, 0, 0, DF, DF);
      const b = N[0] * SUN[0] + N[1] * SUN[1] + N[2] * SUN[2];
      if (b < 0.95) { ctx.fillStyle = `rgba(56,40,22,${(0.95 - Math.max(0, b)) * 0.52})`; ctx.fill(FACE); }
      if (b > 0.82) { ctx.fillStyle = `rgba(255,255,255,${(b - 0.82) * 1.4})`; ctx.fill(FACE); }
      ctx.restore();
    }
    ctx.restore();
  }
  SUB.dice = function (c) {
    const { fx, P, ch, cw, sz, L } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const h = A.small ? Math.min(fx.h * 0.15, ch * 0.47 * sz) : ch * 0.47 * sz * A.fit, g = 0.34 * (h / 8);
    const floorY = A.small ? fx.h - 3 : A.y + ch * 0.42, faces = {};
    for (let v = 1; v <= 6; v++) faces[v] = faceS(v, q);
    const reach = h * 2 * 3.8 + h * 2, dir = A.x + reach > fx.w - 4 ? -1 : 1; // into the empty rest of the row, back over the text only at the right edge
    const dust = glow(`e-dust|${lq(L)}`, L ? [[0, 'rgba(150,130,110,0.55)'], [1, 'rgba(150,130,110,0)']] : [[0, 'rgba(230,224,210,0.45)'], [1, 'rgba(230,224,210,0)']]);
    const shadow = L ? sprite('e-dieshadow', () => paint(64, 64, 1, (x) => { x.save(); x.scale(1, 0.3); const sg = x.createRadialGradient(32, 106, 0, 32, 106, 32); sg.addColorStop(0, 'rgba(40,30,20,0.6)'); sg.addColorStop(1, 'rgba(40,30,20,0)'); x.fillStyle = sg; x.fillRect(0, 0, 64, 214); x.restore(); })) : null;
    const warm = glow('e-dieglow', [[0, 'rgba(255,240,190,0.9)'], [0.35, 'rgba(255,210,120,0.3)'], [1, 'rgba(255,190,90,0)']]);
    let last = 0;
    const dice = [[1.9, 0, 1.75], [3.6, 3, 2.05]].map(([dist, wait, up]) => {
      const yaw = (Math.random() < 0.5 ? -1 : 1) * rand(0.26, 0.48), low = h * (Math.cos(ELEV) + (Math.cos(yaw) + Math.abs(Math.sin(yaw))) * Math.sin(ELEV));
      const rise = A.small ? Math.max(4, A.y - h * 1.6 - 2) : Math.min(ch * up * sz * A.fit, Math.max(ch * 0.8, A.y - h * 2 - 4)), drop = floorY - low - A.y;
      const tp = toss(-Math.sqrt(2 * g * rise), g, drop), D = tp.path[tp.path.length - 1][0], sx = (dist * 2 * h * dir) / D;
      const path = tp.path.map(([x, y]) => [A.x + dir * cw * 0.2 + x * sx, A.y + y]);
      const ax = [rand(-0.5, 0.5), rand(-0.35, 0.35), dir], al = Math.hypot(...ax);
      last = Math.max(last, wait + tp.rest);
      return { path, hits: tp.hits, rest: tp.rest, wait, h, floor: A.y + drop, floorY, ax: ax.map((v) => v / al), th0: rand(3, 4.4) * Math.PI, Rf: rot3(0, 1, 0, yaw), faces, dust, shadow, glow: L ? null : warm, L };
    });
    for (const d of dice) P.push(part(last + 40, drawDie, Object.assign(d, { T: last + 40 })));
    if (th < 0.5) return;
    const gold = L ? [214, 150, 20] : [255, 232, 160];
    for (let i = 0, m = Math.round(9 * th); i < m; i++) { // the sparkle when the second one comes to rest
      const d = dice[i % 2], [rx, ry] = d.path[d.path.length - 1], an = rand(0, TAU), rr = h * rand(1.2, 2.1);
      star(P, rx + Math.cos(an) * rr, ry + Math.sin(an) * rr * 0.8, h * rand(1.6, 2.6), last + 1 + i * 2, rand(16, 22), starS(gold, L, q), L);
    }
  };

  /* ====================================================================================================== */
  /* 풍선 펑: a bunch of balloons, tied at the cursor, blow up one after another and float up and away.       */
  /* ====================================================================================================== */

  const BAL = [[255, 107, 129], [99, 202, 255], [255, 196, 87], [96, 220, 160], [176, 132, 255]];
  const SKIN = new Path2D('M20 2C30.5 2 37 10.5 37 20.5C37 31.5 27.5 40.5 20 41.5C12.5 40.5 3 31.5 3 20.5C3 10.5 9.5 2 20 2Z');
  /** A rubber balloon: lit from the upper left, light bouncing into its lower side, a bright window on it, the knot. */
  const balloonS = (col, L, q) => sprite(`e-balloon|${ck(col)}|${lq(L)}|${q}`, () => paint(40, 48, q, (x) => {
    let g = x.createRadialGradient(13, 12, 1, 19, 21, 25);
    g.addColorStop(0, rgba(shade(col, 0.8), 1)); g.addColorStop(0.2, rgba(shade(col, 0.32), 1)); g.addColorStop(0.6, rgba(col, 1)); g.addColorStop(0.9, rgba(shade(col, -0.32), 1)); g.addColorStop(1, rgba(shade(col, -0.48), 1));
    x.fillStyle = g; x.fill(SKIN);
    x.save(); x.clip(SKIN);
    g = x.createRadialGradient(28, 34, 0, 28, 34, 11); g.addColorStop(0, rgba(shade(col, 0.55), 0.5)); g.addColorStop(1, rgba(shade(col, 0.55), 0));
    x.fillStyle = g; x.fillRect(0, 0, 40, 48);
    x.restore();
    x.fillStyle = rgba(shade(col, -0.28), 1); x.beginPath(); x.moveTo(20, 40.6); x.lineTo(23.2, 45.4); x.quadraticCurveTo(20, 46.8, 16.8, 45.4); x.closePath(); x.fill();
    if (L) { x.strokeStyle = rgba(shade(col, -0.55), 0.55); x.lineWidth = 0.8; x.stroke(SKIN); }
    x.fillStyle = 'rgba(255,255,255,0.88)'; x.beginPath(); x.ellipse(12.5, 12.5, 3, 5.6, 0.55, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(16.8, 7.6, 1.1, 0, TAU); x.fill();
  }));
  const BUNCH = { 3: [[0, -4.2, 2], [-1.05, -3.3, 0], [1.1, -3.4, 1]], 4: [[0, -4.55, 2], [-1.3, -3.65, 0], [1.35, -3.75, 1], [0.1, -2.95, 3]], 5: [[-0.75, -4.6, 2], [0.8, -4.7, 3], [-1.65, -3.5, 0], [1.7, -3.55, 1], [0.05, -3, 4]] }; // back to front: dx, dy (in radii), order it blows up in
  function drawBunch(ctx, p, fx) {
    const a = p.age++, r = p.r, fl = Math.max(0, a - p.t0);
    const kx = p.x + fl * p.drift + Math.sin(a * 0.05) * r * 0.08, ky = p.y - fl * p.v1 - fl * fl * p.acc; // the knot: still, then off and away, faster and faster
    asOne(ctx, fx, fade(a / p.T, 0.7), kx - r * 3.6, ky - r * 6.6, r * 7.2, r * 8.8, (x) => bunch(x, p, a, kx, ky, fl));
  }
  function bunch(ctx, p, a, kx, ky, fl) {
    const L = p.L, r = p.r;
    const sway = Math.sin(a * 0.075 + p.ph) * 0.09 * Math.min(1, a / 20) + Math.min(1, fl / 20) * p.drift * 0.25, cs = Math.cos(sway), sn = Math.sin(sway);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    const B = p.b.map((b) => {
      const e = ease.out(seg(a, b.d, b.d + 12)), s = ease.back(seg(a, b.d, b.d + 13)), bob = Math.sin(a * 0.09 + b.ph) * r * 0.08;
      const ox = b.dx * r * (0.4 + 0.6 * e), oy = b.dy * r * (0.4 + 0.6 * e) + bob, x = kx + ox * cs - oy * sn, y = ky + ox * sn + oy * cs, rot = sway * 1.2 + b.lean;
      return { b, s, e, x, y, rot, tx: x - Math.sin(rot) * r * 1.42 * s, ty: y + Math.cos(rot) * r * 1.42 * s };
    });
    ctx.strokeStyle = L ? 'rgba(84,84,100,0.75)' : 'rgba(226,226,238,0.62)'; ctx.lineWidth = 0.8 * p.k; ctx.beginPath(); // strings
    for (const q of B) {
      if (q.s <= 0) continue;
      const mx = (kx + q.tx) / 2 + Math.sin(a * 0.11 + q.b.ph) * r * 0.18, my = (ky + q.ty) / 2;
      ctx.moveTo(kx, ky); ctx.quadraticCurveTo(mx, my, q.tx, q.ty);
    }
    ctx.stroke();
    for (const q of B) {
      if (q.s <= 0) continue;
      const wob = 1 + Math.sin(a * 0.7 + q.b.ph) * 0.07 * (1 - q.e), sc = (q.s * r) / 17;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(sc * wob, sc / wob);
      ctx.drawImage(q.b.sp.c, -20, -21.5, 40, 48);
      ctx.restore();
    }
    ctx.strokeStyle = rgba(p.rib, 0.95); ctx.lineWidth = 1.1 * p.k; ctx.beginPath(); // the curled ribbon they are tied with
    for (let i = 0; i <= 12; i++) { const v = i / 12, xx = kx + Math.sin(v * 9 + a * 0.12) * r * 0.22 * (0.25 + v), yy = ky + v * r * 1.5 + fl * fl * p.acc * 0.012 * v; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke();
    ctx.fillStyle = rgba(p.rib, 1); ctx.beginPath(); ctx.arc(kx, ky, 1.3 * p.k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  SUB.balloonpop = function (c) {
    const { fx, P, ch, sz, L } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const r0 = ch * 0.6 * sz * A.fit, room = A.small ? { s: 1, y: fx.h - 5 } : roomUp(A.y + ch * 0.3, r0 * 6.3, ch * 0.8);
    const n = th < 1 ? 3 : Math.random() < 0.5 ? 5 : 4, ky = room.y, r = A.small ? (fx.h - 8) / 6.3 : r0 * room.s, k = r / 10.8;
    const cols = shuffle(BAL.slice()), seq = BUNCH[n];
    const b = seq.map(([dx, dy, o], i) => ({ dx, dy, d: o * 4, ph: rand(0, TAU), lean: dx * 0.08 + rand(-0.05, 0.05), sp: balloonS(cols[i], L, q) }));
    P.push(part(92, drawBunch, { x: A.x, y: ky, r, k, b, t0: 18, v1: 0.4 * k, acc: 0.034 * k, drift: (Math.random() < 0.5 ? -1 : 1) * rand(0.12, 0.3) * k, ph: rand(0, TAU), rib: L ? shade(cols[0], -0.3) : cols[0], L }));
  };

  /* ====================================================================================================== */
  /* 빗방울: a short slanting shower round the cursor, each drop ringing the water, then one big drop on the */
  /* cursor itself: a crown of spray, a jet that throws a bead back up, wide rings.                          */
  /* ====================================================================================================== */

  const DROP = new Path2D('M6 0.6C7.6 6 11.4 10.5 11.4 16.6A5.4 5.4 0 0 1 0.6 16.6C0.6 10.5 4.4 6 6 0.6Z');
  /** A falling drop: clear, bright at its edges, a window reflected in it, light focused at its foot. */
  const dropS = (L, q) => sprite(`e-drop|${lq(L)}|${q}`, () => paint(12, 24, q, (x) => {
    const g = x.createLinearGradient(0.6, 0, 11.4, 0);
    if (L) { g.addColorStop(0, 'rgba(36,104,186,0.95)'); g.addColorStop(0.4, 'rgba(120,180,236,0.62)'); g.addColorStop(0.8, 'rgba(60,130,210,0.82)'); g.addColorStop(1, 'rgba(22,80,158,0.95)'); } else { g.addColorStop(0, 'rgba(225,244,255,0.95)'); g.addColorStop(0.35, 'rgba(140,196,246,0.5)'); g.addColorStop(0.75, 'rgba(96,160,230,0.62)'); g.addColorStop(1, 'rgba(206,236,255,0.92)'); }
    x.fillStyle = g; x.fill(DROP);
    x.strokeStyle = L ? 'rgba(20,66,136,0.85)' : 'rgba(225,244,255,0.7)'; x.lineWidth = 0.6; x.stroke(DROP);
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(4, 14.4, 1.1, 2.6, 0.2, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.arc(8, 19.3, 1.1, 0, TAU); x.fill();
  }));
  const WATER = { crest: [214, 240, 255], near: [236, 248, 255], trough: [110, 170, 230] }, WATER_L = { crest: [44, 116, 196], near: [28, 96, 184], trough: [20, 66, 140] };
  /** A ring on the water seen at a slant: a crest (its near half brighter) and the trough inside it. */
  function ring(ctx, x, y, rx, al, wd, W) {
    const ry = rx * 0.3;
    ctx.lineWidth = wd * 0.8; ctx.strokeStyle = rgba(W.trough, 0.4 * al); ctx.beginPath(); ctx.ellipse(x, y, rx * 0.86, ry * 0.86, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = wd; ctx.strokeStyle = rgba(W.crest, 0.5 * al); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(W.near, 0.95 * al); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI); ctx.stroke();
  }
  function drawRainDrop(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0 || a >= p.fall) return;
    const vy = p.v0 + p.g * a, y = p.ty - (p.v0 * (p.fall - a) + 0.5 * p.g * (p.fall * p.fall - a * a)), x = p.tx + (p.ty - y) * p.sl;
    const st = 1 + Math.min(1.1, vy * 0.06), w = 12 * p.s, hh = 24 * p.s * st;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(p.W.crest, 0.28); ctx.lineWidth = 0.8 * p.s * 2; ctx.beginPath(); ctx.moveTo(x + vy * 2.4 * p.sl, y - hh * 0.5 - vy * 2.4); ctx.lineTo(x, y - hh * 0.35); ctx.stroke(); // its streak
    ctx.translate(x, y); ctx.rotate(-Math.atan(p.sl)); ctx.drawImage(p.sp.c, -w / 2, -hh * 0.8, w, hh);
    ctx.restore();
  }
  function drawRing(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), rx = p.r0 + (p.r1 - p.r0) * ease.out(t);
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    ring(ctx, p.x, p.y, rx, (1 - t) ** 1.2 * p.al, p.wd * (1 - 0.55 * t), p.W);
    ctx.restore();
  }
  /** A bead of water thrown up from the surface (x, y on the water, z above it). */
  function drawSpray(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    p.z += p.vz; p.vz -= p.g; p.x += p.vx; p.y += p.vg;
    if (p.z < 0) { p.life = 0; return; }
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(p.W.crest, 0.9); ctx.beginPath(); ctx.ellipse(p.x, p.y - p.z, p.s, p.s * (1 + Math.min(0.8, Math.abs(p.vz) * 0.2)), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(p.x - p.s * 0.3, p.y - p.z - p.s * 0.3, p.s * 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** The crown: a wall of water thrown up round the big drop, rising in points and falling back. */
  function drawCrown(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), rx = p.r * (0.45 + 0.9 * ease.out(t)), ry = rx * 0.3, hh = p.h * Math.sin(Math.PI * Math.min(1, t * 1.1)), al = 1 - t * t;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (const front of [0, 1]) { // the far side first, fainter
      const a0 = front ? 0 : Math.PI, top = [];
      for (let j = 0; j <= 18; j++) { const an = a0 + (j / 18) * Math.PI, sp = 0.55 + 0.45 * Math.abs(Math.cos(an * p.n * 0.5 + p.ph)); top.push([p.x + Math.cos(an) * rx, p.y + Math.sin(an) * ry - hh * sp]); }
      ctx.beginPath();
      top.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let j = 18; j >= 0; j--) { const an = a0 + (j / 18) * Math.PI; ctx.lineTo(p.x + Math.cos(an) * rx * 0.9, p.y + Math.sin(an) * ry * 0.9); }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, p.y - hh, 0, p.y + ry);
      g.addColorStop(0, rgba(p.W.near, (front ? 0.6 : 0.3) * al)); g.addColorStop(0.5, rgba(p.W.crest, (front ? 0.22 : 0.08) * al)); g.addColorStop(1, rgba(p.W.trough, (front ? 0.3 : 0.1) * al));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(p.W.near, (front ? 0.95 : 0.5) * al); ctx.lineWidth = 0.9 * p.k; ctx.beginPath(); // the bright lip of the sheet
      top.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }
  /** The jet that stands up out of the middle after the drop goes in. */
  function drawJet(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), hh = p.h * Math.sin(Math.PI * t) * (t < 0.42 ? 1 : 0.78), w = p.w * (1 - t * 0.4);
    if (hh < 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, p.y, 0, p.y - hh);
    g.addColorStop(0, rgba(p.W.trough, 0.5)); g.addColorStop(1, rgba(p.W.near, 0.95));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p.x - w, p.y); ctx.quadraticCurveTo(p.x - w * 0.3, p.y - hh * 0.5, p.x - w * 0.35, p.y - hh); ctx.arc(p.x, p.y - hh, w * 0.35, Math.PI, 0); ctx.quadraticCurveTo(p.x + w * 0.3, p.y - hh * 0.5, p.x + w, p.y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  SUB.raindrop = function (c) {
    const { fx, P, ch, cw, sz, L, alpha } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx), W = L ? WATER_L : WATER;
    const u = ch * sz * A.fit, k = u / 18, wy = A.small ? Math.min(fx.h - 6, A.y + u * 0.6) : A.y + ch * 0.3, sp = dropS(L, q), sl = 0.22;
    const g = 0.6 * k, rain = (tx, ty, arrive, fall, s) => { // a drop, timed to land at `arrive`
      const v0 = Math.min(5 * k, Math.max(1, (ty + 4 - 0.5 * g * fall * fall) / fall));
      P.push(part(arrive, drawRainDrop, { tx, ty, wait: arrive - fall, fall, v0, g, sl, s, sp, W }));
    };
    const spray = (x, y, wait, an, spd, vz, s) => P.push(part(wait + 40, drawSpray, { x, y, wait, vx: Math.cos(an) * spd, vg: Math.sin(an) * spd * 0.3, z: 0.5, vz, g: 0.26 * k, s, W }));
    const rings = (x, y, wait, r1, T, wd, al) => P.push(part(T + wait, drawRing, { x, y, wait, r0: 1.5 * k, r1, wd, al: al * alpha, L, W }));
    const m = Math.round(8 * th), side = Math.random() < 0.5 ? -1 : 1;
    for (let j = 0; j < m; j++) { // the shower
      const sd = (j % 2 ? -1 : 1) * side, tx = A.x + sd * rand(1.6, 6.5) * cw * A.fit * (A.small ? 1.6 : 1), ty = wy + rand(-0.5, 0.5) * u * 0.6, arrive = 4 + j * 3 + ((Math.random() * 2) | 0);
      rain(tx, ty, arrive, 8, k * rand(0.5, 0.62));
      rings(tx, ty, arrive, u * rand(0.8, 1.15), 30, 1.1 * k, 0.85);
      if (th > 0.5) for (let i = 0; i < 2; i++) spray(tx, ty, arrive, rand(0, TAU), rand(0.3, 0.8) * k, rand(1, 1.8) * k, rand(0.6, 0.9) * k);
    }
    const hit = 32; // the big one
    rain(A.x, wy, hit, 14, k * 0.95);
    for (let i = 0; i < 3; i++) rings(A.x, wy, hit + i * 6, u * [3.6, 2.7, 1.9][i], 46, (1.9 - i * 0.3) * k, 1);
    P.push(part(hit + 14, drawCrown, { x: A.x, y: wy, wait: hit, r: u * 0.9, h: u * 0.85, n: 9, ph: rand(0, TAU), k, W }));
    for (let i = 0, n = Math.round(12 * th); i < n; i++) { const an = (i / n) * TAU + rand(-0.15, 0.15); spray(A.x + Math.cos(an) * u * 0.6, wy + Math.sin(an) * u * 0.18, hit + 4, an, rand(1, 1.9) * k, rand(1.8, 3) * k, rand(0.8, 1.2) * k); }
    const jet = hit + 7, jt = 22, jh = u * 1.25;
    P.push(part(jet + jt, drawJet, { x: A.x, y: wy, wait: jet, h: jh, w: 2.6 * k, W }));
    const z0 = jh * Math.sin(Math.PI * 0.42), vz = (jh * Math.PI * Math.cos(Math.PI * 0.42)) / jt * 0.6, gz = 0.26 * k, land = (vz + Math.sqrt(vz * vz + 2 * gz * z0)) / gz;
    P.push(part(jet + 9 + 60, drawSpray, { x: A.x, y: wy, wait: jet + 9, vx: 0, vg: 0, z: z0, vz, g: gz, s: 1.5 * k, W })); // the bead it throws up
    rings(A.x, wy, Math.round(jet + 9 + land), u * 1.1, 26, 1.1 * k, 0.8);
  };

  /* ====================================================================================================== */
  /* 별똥별: a big fireball streaks down from the upper side into the cursor: a flash, a shock ring running  */
  /* out over the ground, glowing debris thrown up, a smoking crater.                                        */
  /* ====================================================================================================== */

  const ROCKS = [[255, 248, 224], [255, 190, 90]];
  /** From white-hot through orange and the accent to cold rock. */
  const heat = (h, acc) => (h > 0.66 ? mix(ROCKS[1], ROCKS[0], (h - 0.66) / 0.34) : h > 0.33 ? mix(acc, ROCKS[1], (h - 0.33) / 0.33) : mix([70, 56, 66], acc, h / 0.33));
  /** A tapering tail behind the head at (x, y), (ux, uy) pointing back along it. */
  function tail(ctx, x, y, ux, uy, w, len, c0, c1) {
    const nx = -uy, ny = ux, g = ctx.createLinearGradient(x, y, x + ux * len, y + uy * len);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(x + nx * w, y + ny * w); ctx.quadraticCurveTo(x - ux * w * 1.5, y - uy * w * 1.5, x - nx * w, y - ny * w);
    ctx.quadraticCurveTo(x + ux * len * 0.4 - nx * w * 0.6, y + uy * len * 0.4 - ny * w * 0.6, x + ux * len, y + uy * len);
    ctx.quadraticCurveTo(x + ux * len * 0.4 + nx * w * 0.6, y + uy * len * 0.4 + ny * w * 0.6, x + nx * w, y + ny * w);
    ctx.fill();
  }
  function drawFireball(ctx, p) {
    const a = p.age++, L = p.L, hit = p.hit;
    if (a > hit + 7) return;
    const k = Math.min(1, a / hit), e = k ** 1.5, out = a > hit ? (a - hit) / 7 : 0;
    const hx = p.sx + (p.x - p.sx) * e, hy = p.sy + (p.y - p.sy) * e, len = Math.min(p.len, Math.hypot(hx - p.sx, hy - p.sy) + p.u * 0.6) * (1 - out * 0.7), fl = 0.94 + 0.06 * Math.sin(a * 1.3);
    const [c0, c1] = p.cols, al = (1 - out) * p.al, u = p.u, nx = -p.uy, ny = p.ux;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    if (L) {
      tail(ctx, hx, hy, p.ux, p.uy, u * 0.78 * fl, len, rgba(c0, 0.5 * al), rgba(c1, 0));
      tail(ctx, hx, hy, p.ux, p.uy, u * 0.42, len * 0.75, rgba(shade(c0, -0.25), 0.9 * al), rgba(c0, 0));
    } else {
      tail(ctx, hx, hy, p.ux, p.uy, u * 0.85 * fl, len, rgba(c0, 0.45 * al), rgba(c1, 0));
      tail(ctx, hx, hy, p.ux, p.uy, u * 0.44, len * 0.8, rgba(shade(c0, 0.5), 0.8 * al), rgba(c0, 0));
    }
    for (let j = 0; j < 4; j++) { // tongues of flame torn off the head, never still
      const off = Math.sin(a * 0.9 + j * 2.1) * u * 0.3, ln = len * (0.32 + 0.14 * Math.sin(a * 1.3 + j * 1.7));
      tail(ctx, hx + nx * off, hy + ny * off, p.ux, p.uy, u * 0.1, ln, rgba(L ? [255, 170, 70] : shade(c0, 0.75), 0.8 * al), rgba(c0, 0));
    }
    tail(ctx, hx, hy, p.ux, p.uy, u * 0.2, len * 0.55, L ? rgba([255, 214, 120], al) : rgba([255, 255, 255], al), L ? rgba([255, 150, 60], 0) : rgba(shade(c0, 0.8), 0));
    if (out < 1) {
      ctx.globalAlpha = (1 - out) * p.al * (L ? 0.75 : 1); put(ctx, p.glow, hx, hy, (u * 3.6 * fl) / 96);
      ctx.globalAlpha = 1 - out; ctx.fillStyle = L ? '#fff1c4' : '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy, u * 0.3, 0, TAU); ctx.fill();
      if (L) { ctx.strokeStyle = rgba(shade(c0, -0.35), 0.8 * (1 - out)); ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawFlash(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait);
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.globalAlpha = (1 - t) ** 2 * (p.L ? 0.6 : 0.95) * p.al;
    put(ctx, p.sp, p.x, p.y, (p.r * (0.7 + 0.6 * ease.out(t))) / 96);
    ctx.restore();
  }
  function drawShock(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), e = ease.out(t), rx = p.r * (0.08 + 0.92 * e), L = p.L, al = (1 - t) ** 1.3 * p.al, [c0] = p.cols;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.strokeStyle = rgba(L ? shade(c0, -0.3) : c0, 0.75 * al); ctx.lineWidth = p.wd * (1 - 0.7 * t); ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, rx * 0.34, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(L ? shade(c0, 0.2) : shade(c0, 0.75), 0.9 * al); ctx.lineWidth = p.wd * 0.4 * (1 - 0.6 * t); ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 0.96, rx * 0.326, 0, 0, TAU); ctx.stroke();
    const t2 = Math.min(1, t * 2.2); // the air: a faster, fainter round ring
    if (t2 < 1) { ctx.strokeStyle = rgba(L ? shade(c0, -0.1) : shade(c0, 0.6), 0.5 * (1 - t2) * p.al); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.62 * ease.out(t2), 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function drawDebris(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), x0 = p.x, y0 = p.y;
    p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.spin;
    if (p.y > p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.spin *= 0.5; }
    const hh = Math.max(0, 1 - t * 1.2), col = heat(hh, p.acc), al = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1, L = p.L;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(col, 0.55 * al * hh); ctx.lineWidth = p.s * 0.9; ctx.beginPath(); ctx.moveTo(x0 - (p.x - x0) * 1.6, y0 - (p.y - y0) * 1.6); ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!L && hh > 0) { ctx.globalAlpha = al * hh * 0.6; put(ctx, p.glow, p.x, p.y, (p.s * 6) / 96); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.fillStyle = rgba(L ? mix(col, [60, 48, 52], 1 - hh * 0.6) : col, 1);
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath();
    p.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * p.s, py * p.s) : ctx.moveTo(px * p.s, py * p.s)));
    ctx.closePath(); ctx.fill();
    if (L && hh > 0.2) { ctx.strokeStyle = rgba([255, 150, 50], hh); ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.restore();
  }
  function drawSpark(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), x0 = p.x, y0 = p.y;
    p.vx *= 0.9; p.vy = p.vy * 0.9 + p.g; p.x += p.vx; p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(heat(1 - t * 0.8, p.acc), (1 - t) * p.al); ctx.lineWidth = p.s;
    ctx.beginPath(); ctx.moveTo(x0 - (p.x - x0) * 2.5, y0 - (p.y - y0) * 2.5); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  }
  /** What is left: a glowing pit going dull, a little smoke drifting off it. */
  function drawCrater(ctx, p) {
    const a = p.age++ - p.wait;
    if (a < 0) return;
    const t = a / (p.T - p.wait), L = p.L;
    ctx.save();
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = (1 - t) ** 1.5 * p.al;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.4); put(ctx, p.glow, 0, 0, (p.u * 2.4 * (1 - t * 0.4)) / 96); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    for (const s of p.smoke) {
      const st = seg(a, s.d, s.d + s.T);
      if (st <= 0 || st >= 1) continue;
      ctx.globalAlpha = Math.sin(Math.PI * st) * s.al;
      put(ctx, p.puff, p.x + s.dx + st * s.vx, p.y - st * s.rise, (s.r * (0.6 + st)) / 96);
    }
    ctx.restore();
  }
  SUB.meteors = function (c) {
    const { fx, P, ch, sz, L, cols, alpha } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const u = ch * sz * A.fit, k = u / 18, hit = 14, c0 = cols[0], c1 = cols[1], acc = L ? shade(c0, -0.2) : c0;
    const side = A.x > fx.w * 0.62 ? -1 : 1, ul = Math.hypot(0.8, 0.62), ux = (side * 0.8) / ul, uy = -0.62 / ul, Lm = u * (A.small ? 11 : 9.5);
    const glowM = glow(`e-met|${ck(c0)}|${lq(L)}`, L ? [[0, rgba([255, 236, 170], 0.95)], [0.2, rgba(shade(c0, 0.2), 0.7)], [0.5, rgba(c0, 0.25)], [1, rgba(c0, 0)]] : [[0, 'rgba(255,255,255,1)'], [0.18, rgba(shade(c0, 0.6), 0.85)], [0.45, rgba(c0, 0.32)], [1, rgba(c0, 0)]]);
    const ember = glow(`e-ember|${ck(c0)}`, [[0, 'rgba(255,236,190,1)'], [0.3, rgba(shade(c0, 0.3), 0.5)], [1, rgba(c0, 0)]]);
    P.push(part(hit + 8, drawFireball, { x: A.x, y: A.y, sx: A.x + ux * Lm, sy: A.y + uy * Lm, ux, uy, len: u * 6.5, u, hit, cols: [c0, c1], glow: glowM, al: alpha, L }));
    for (let i = 0, m = Math.round(9 * th); i < m; i++) { // sparks it sheds along the way
      const e = 0.15 + (i / m) * 0.75, wait = Math.round(hit * e ** (1 / 1.5));
      P.push(part(wait + rand(14, 24), drawSpark, { x: A.x + ux * Lm * (1 - e) + rand(-0.2, 0.2) * u, y: A.y + uy * Lm * (1 - e) + rand(-0.2, 0.2) * u, vx: ux * rand(0.3, 0.9) * k, vy: uy * rand(0.3, 0.9) * k, g: 0.06 * k, s: rand(0.8, 1.4) * k, wait, acc, al: alpha, L }));
    }
    const fy = A.y + ch * 0.3 * A.fit;
    P.push(part(hit + 46, drawCrater, { x: A.x, y: fy, wait: hit, u, al: alpha, L, glow: glow(`e-pit|${ck(c0)}|${lq(L)}`, L ? [[0, 'rgba(255,150,50,0.8)'], [0.35, rgba(shade(c0, -0.3), 0.4)], [1, 'rgba(60,40,40,0)']] : [[0, 'rgba(255,220,150,0.95)'], [0.35, rgba(c0, 0.45)], [1, rgba(c0, 0)]]), puff: glow(`e-smoke|${lq(L)}`, L ? [[0, 'rgba(90,86,96,0.5)'], [1, 'rgba(90,86,96,0)']] : [[0, 'rgba(170,166,186,0.4)'], [1, 'rgba(170,166,186,0)']]), smoke: Array.from({ length: th < 0.5 ? 2 : 4 }, (_, i) => ({ d: 4 + i * 5, T: rand(28, 36), dx: rand(-0.6, 0.6) * u, vx: rand(-0.5, 0.5) * u, rise: u * rand(1.4, 2.2), r: u * rand(1.4, 2), al: rand(0.35, 0.55) })) }));
    P.push(part(hit + 10, drawFlash, { x: A.x, y: A.y, wait: hit, r: u * 3.6, al: alpha, L, sp: glow(`e-flash|${ck(c0)}|${lq(L)}`, L ? [[0, rgba(shade(c0, 0.5), 0.8)], [0.4, rgba(c0, 0.3)], [1, rgba(c0, 0)]] : [[0, 'rgba(255,255,255,1)'], [0.25, rgba(shade(c0, 0.6), 0.6)], [0.6, rgba(c0, 0.18)], [1, rgba(c0, 0)]]) }));
    P.push(part(hit + 28, drawShock, { x: A.x, y: fy, wait: hit, r: u * 5.6, wd: 3 * k, cols: [c0, c1], al: alpha, L }));
    for (let i = 0, m = Math.round(16 * th); i < m; i++) { // the ground thrown up
      const an = -Math.PI / 2 + rand(-1.25, 1.25), sp = rand(1.8, 5) * k, pts = [];
      for (let j = 0, nn = 5 + ((Math.random() * 3) | 0); j < nn; j++) { const b = (j / nn) * TAU; pts.push([Math.cos(b) * rand(0.6, 1.1), Math.sin(b) * rand(0.6, 1.1)]); }
      P.push(part(hit + rand(30, 46), drawDebris, { x: A.x + rand(-0.3, 0.3) * u, y: fy - 1, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 0.2 * k, floor: fy + rand(-0.2, 0.3) * u, rot: rand(0, TAU), spin: rand(-0.3, 0.3), s: rand(1.2, 2.6) * k, pts, wait: hit, acc, glow: ember, L }));
    }
    for (let i = 0, m = Math.round(20 * th); i < m; i++) { // sparks off the blow
      const an = -Math.PI / 2 + rand(-1.6, 1.6), sp = rand(2.5, 6.5) * k;
      P.push(part(hit + rand(12, 22), drawSpark, { x: A.x, y: fy - 1, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.8, g: 0.12 * k, s: rand(0.8, 1.5) * k, wait: hit, acc, al: alpha, L }));
    }
  };

  /* ====================================================================================================== */
  /* 마법진: an arcane portal. Three rune circles, each its own design, are born at the cursor and stack up  */
  /* into a turning column, runes orbiting them; then they draw in and the spell goes off in a burst of      */
  /* sparks at the top. In the accent colours, cool and line-drawn (not 지옥불's red star or 천상의 빛's gold). */
  /* ====================================================================================================== */

  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  const RUNE_FONT = "'Segoe UI Symbol', 'Segoe UI Historic', 'Noto Sans Runic', sans-serif";
  /** One circle of the portal (tier 0 the widest, at the bottom), drawn as light: a glow, the line, a hot core. */
  function circleS(tier, c0, c1, L, q) {
    return sprite(`e-circle|${tier}|${ck(c0)}|${ck(c1)}|${lq(L)}|${q}`, () => paint(200, 200, q, (x) => {
      x.translate(100, 100);
      const circ = (r) => { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); };
      const poly = (n, r, step, rot) => { x.beginPath(); for (let i = 0; i <= n; i++) { const an = rot + (i * step * TAU) / n; if (i) x.lineTo(Math.cos(an) * r, Math.sin(an) * r); else x.moveTo(Math.cos(an) * r, Math.sin(an) * r); } x.closePath(); x.stroke(); };
      const runes = (r, n, fs, seed, off = 0) => {
        x.font = `${fs}px ${RUNE_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        for (let i = 0; i < n; i++) { x.save(); x.rotate(((i + off) / n) * TAU); x.translate(0, -r); x.fillText(RUNES[(i * 7 + seed) % RUNES.length], 0, 0); x.restore(); }
      };
      const dots = (r, n, s, off = 0) => { for (let i = 0; i < n; i++) { const an = ((i + off) / n) * TAU; x.beginPath(); x.arc(Math.cos(an) * r, Math.sin(an) * r, s, 0, TAU); x.fill(); } };
      const rim = [
        () => { circ(92); circ(77); runes(84.5, 18, 11, 0); for (let i = 0; i < 48; i++) { const an = (i / 48) * TAU, r0 = i % 4 ? 92 : 89; x.beginPath(); x.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); x.lineTo(Math.cos(an) * 96, Math.sin(an) * 96); x.stroke(); } },
        () => { circ(92); circ(84); for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; x.beginPath(); x.arc(Math.cos(an) * 88, Math.sin(an) * 88, 5.5, 0, TAU); x.stroke(); } runes(88, 8, 9, 5, 0.5); },
        () => { circ(92); circ(80); runes(86, 12, 9, 11); dots(80, 24, 1.3); },
      ][tier];
      const figure = [
        () => { circ(58); poly(3, 58, 1, -Math.PI / 2); poly(3, 58, 1, Math.PI / 2); for (let i = 0; i < 6; i++) { const an = -Math.PI / 2 + (i / 6) * TAU; x.beginPath(); x.arc(Math.cos(an) * 58, Math.sin(an) * 58, 4.5, 0, TAU); x.stroke(); } circ(22); dots(0, 1, 3); },
        () => { circ(68); poly(8, 68, 3, 0); circ(36); dots(28, 12, 1.5); },
        () => { poly(4, 72, 1, 0); poly(4, 72, 1, Math.PI / 4); circ(44); poly(3, 44, 1, -Math.PI / 2); circ(10); },
      ][tier];
      // [colour, width, figure colour, blurred]: widths hold up when the tilt flattens the circle to a third
      const passes = L ? [[shade(c0, -0.45), 3.6, shade(c1, -0.45), false], [shade(c0, 0.12), 1.5, shade(c1, 0.12), false]] : [[c0, 4.6, c1, true], [shade(c0, 0.35), 2.1, shade(c1, 0.35), false], [shade(c0, 0.82), 0.85, shade(c1, 0.8), false]];
      for (const [col, lw, col1, blur] of passes) {
        x.filter = blur ? `blur(${2.6 * q}px)` : 'none';
        x.strokeStyle = x.fillStyle = rgba(col, blur ? 0.8 : 1); x.lineWidth = lw; rim();
        x.strokeStyle = x.fillStyle = rgba(col1, blur ? 0.8 : 1); x.lineWidth = lw * 0.85; figure();
      }
      x.filter = 'none';
    }));
  }
  /** A rune on its own, glowing (dark page) or inked with a dark edge (light page). */
  const runeS = (g, col, L, q) => sprite(`e-rune|${g}|${ck(col)}|${lq(L)}|${q}`, () => paint(20, 20, q, (x) => {
    x.font = `13px ${RUNE_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (L) { x.strokeStyle = rgba(shade(col, -0.5), 0.9); x.lineWidth = 2; x.strokeText(g, 10, 10.5); x.fillStyle = rgba(shade(col, 0.15), 1); } else { x.filter = `blur(${1.6 * q}px)`; x.fillStyle = rgba(col, 1); x.fillText(g, 10, 10.5); x.fillText(g, 10, 10.5); x.filter = 'none'; x.fillStyle = rgba(shade(col, 0.82), 1); }
    x.fillText(g, 10, 10.5);
  }));
  function drawPortal(ctx, p) {
    const a = p.age++, L = p.L, tl = p.tilt, burst = p.burst;
    const lift = p.lift * ease.smooth(seg(a, 8, burst + 4)), draw = 1 - 0.45 * ease.in(seg(a, burst - 6, burst + 8)), gone = seg(a, burst - 2, burst + 18);
    const R = [], Y = [], AL = [];
    for (let i = 0; i < 3; i++) {
      const d = i * 6, g = ease.back(seg(a, d, d + 14)), e = ease.out(seg(a, d, d + 20));
      R[i] = p.R[i] * Math.max(0, g) * draw; Y[i] = p.y - lift - p.gap[i] * e; AL[i] = Math.min(1, g * 1.6) * (1 - gone) * p.al;
    }
    AL[0] *= 1 - 0.4 * seg(a, 16, 30); // once the column stands, the circle lying over the text steps back
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    if (p.floor && AL[0] > 0) { ctx.save(); ctx.globalAlpha = 0.3 * AL[0]; ctx.translate(p.x, Y[0]); ctx.scale(1, tl); put(ctx, p.floor, 0, 0, (R[0] * 2.6) / 96); ctx.restore(); }
    const orbit = (front) => { // runes circling the column, the far ones dimmer and smaller
      for (const o of p.orb) {
        const i = o.tier, oa = a - o.d;
        if (oa < 0 || AL[i] <= 0) continue;
        const an = o.an + oa * o.w, s = Math.sin(an);
        if ((s > 0) !== front) continue;
        ctx.globalAlpha = AL[i] * Math.min(1, oa / 6) * (0.4 + 0.6 * (s + 1) / 2);
        put(ctx, o.sp, p.x + Math.cos(an) * R[i] * 1.18, Y[i] + s * R[i] * 1.18 * tl - o.bob * Math.sin(oa * 0.15), (o.s * (0.75 + 0.25 * (s + 1) / 2)) / 20);
      }
    };
    orbit(false);
    for (let i = 0; i < 3; i++) {
      if (R[i] < 1 || AL[i] <= 0) continue;
      const D = (R[i] * 200) / 92, e = ease.out(seg(a, i * 6, i * 6 + 20));
      ctx.save(); ctx.globalAlpha = AL[i]; ctx.translate(p.x, Y[i]); ctx.scale(1, tl); ctx.rotate(p.rot[i] + p.dir[i] * (a * 0.032 + (1 - e) * 1.5));
      ctx.drawImage(p.sp[i].c, -D / 2, -D / 2, D, D);
      ctx.restore();
    }
    orbit(true);
    for (const m of p.motes) { // motes of light drawn up through the circles
      const ma = a - m.d;
      if (ma < 0 || ma > m.T) continue;
      const st = ma / m.T;
      ctx.globalAlpha = Math.sin(Math.PI * st) * p.al;
      const mx = p.x + Math.cos(m.an) * R[0] * m.rr * (1 - st * 0.5), my = Y[0] + Math.sin(m.an) * p.R[0] * m.rr * tl - st * m.rise;
      if (L) put(ctx, p.mote, mx, my, (m.s * 3.4) / 32, m.an); else put(ctx, p.mote, mx, my, (m.s * 6) / 96);
    }
    ctx.restore();
  }
  SUB.magiccircle = function (c) {
    const { fx, P, ch, sz, L, cols, alpha } = c, A = anchor(c), q = scaleOf(fx), th = thin(fx);
    const u0 = ch * sz * A.fit, room = A.small ? { s: 1, y: fx.h - 7 } : roomUp(A.y + ch * 0.3, u0 * 4.4, ch * 0.8);
    const c0 = cols[0], c1 = cols[1], c2 = cols[2], y0 = room.y, u = u0 * room.s, k = u / 18, burst = 54, tilt = 0.34;
    const R = [2.3, 1.72, 1.2].map((v) => v * u), gap = [0, 1.55, 2.85].map((v) => v * u), lift = u * 0.7;
    const orb = [];
    for (let i = 0, m = th < 1 ? 6 : 10; i < m; i++) { const g = RUNES[(Math.random() * RUNES.length) | 0], tier = i % 3; orb.push({ tier, d: 6 + tier * 6 + ((i / 3) | 0) * 3, an: rand(0, TAU), w: (tier % 2 ? -1 : 1) * rand(0.07, 0.1), s: u * rand(0.62, 0.78), bob: u * 0.12, sp: runeS(g, i % 2 ? c1 : c0, L, q) }); }
    const motes = Array.from({ length: Math.round(16 * th) }, () => ({ d: rand(4, 44) | 0, T: rand(24, 38), an: rand(0, TAU), rr: rand(0.2, 0.85), rise: u * rand(2.4, 4), s: k * rand(1.4, 2.4) }));
    const mote = L ? starS(c0, L, q) : glow(`e-mote|${ck(c0)}`, [[0, 'rgba(255,255,255,1)'], [0.2, rgba(shade(c0, 0.6), 0.75)], [1, rgba(c0, 0)]]); // a crisp glint on a light page, a soft light on a dark one
    P.push(part(burst + 20, drawPortal, { x: A.x, y: y0, R, gap, lift, tilt, burst, rot: [0, 1, 2].map(() => rand(0, TAU)), dir: [1, -1, 1], sp: [0, 1, 2].map((i) => circleS(i, c0, c1, L, q)), orb, motes, mote, floor: L ? null : glow(`e-floor|${ck(c0)}`, [[0, rgba(c0, 0.6)], [0.5, rgba(c0, 0.18)], [1, rgba(c0, 0)]]), al: alpha, L }));
    const top = y0 - lift - gap[2], pal = [shade(c0, 0.3), shade(c1, 0.3), shade(c2, 0.3), [255, 255, 255]];
    P.push(part(burst + 12, drawFlash, { x: A.x, y: top, wait: burst, r: R[2] * 2.4, al: alpha * 0.7, L, sp: glow(`e-spell|${ck(c0)}|${lq(L)}`, L ? [[0, rgba(shade(c0, 0.4), 0.7)], [0.45, rgba(c0, 0.22)], [1, rgba(c0, 0)]] : [[0, 'rgba(255,255,255,0.95)'], [0.3, rgba(shade(c0, 0.5), 0.5)], [1, rgba(c0, 0)]]) }));
    for (let i = 0, m = Math.round(20 * th); i < m; i++) { // the spell goes off
      const an = rand(0, TAU), spd = rand(2.2, 5.4) * k;
      star(P, A.x + Math.cos(an) * R[2] * 0.3, top + Math.sin(an) * R[2] * 0.1, u * rand(0.5, 0.95), burst + ((Math.random() * 4) | 0), rand(20, 30), starS(pal[i % pal.length], L, q, i % 4 !== 3), L, { vx: Math.cos(an) * spd, vy: Math.sin(an) * spd * 0.75 - 0.5 * k, drag: 0.91, g: 0.025 * k, spin: rand(-0.08, 0.08) });
    }
  };
})();
