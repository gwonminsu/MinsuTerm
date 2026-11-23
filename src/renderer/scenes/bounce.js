'use strict';
/*
 * 튕기는 로고: the app's own mark (the M and its cursor bar) glides across the stage and bounces off the walls.
 * Each wall squashes it a little, lights up where it was touched (a ripple and a few sparks) and turns it a new
 * colour over a moment. Now and then it runs into a corner, and that corner gets a small celebration of its own.
 * The mark is drawn as vectors every frame at the device's resolution, so it stays sharp at any size and position;
 * its glow and the sparks are sprites made once.
 */
(function () {
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('bounce');
  const TAU = Math.PI * 2;
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a))})`;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  // colours change through their hue (pink → teal must not pass through grey)
  const toHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const fromHsl = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };
  const mixHue = (a, b, k) => {
    if (k <= 0) return a; if (k >= 1) return b;
    const p = toHsl(a), q = toHsl(b);
    let dh = q[0] - p[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    return fromHsl([(p[0] + dh * k + 360) % 360, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]);
  };

  // the mark (index.html, #mt-logo) in its 64-unit box, and where its ink lies in that box
  const M_PATH = new Path2D('M10 48V16.5L28 34.5L44 18.5');
  const X0 = 5.3, Y0 = 11.8, X1 = 53.6, Y1 = 52.7;
  // colourways: the M's gradient (three stops) and the cursor bar. The first one is the brand's own.
  const PAL = [
    ['#7C5CFF', '#C266E8', '#FF8A5B', '#FF8A5B'],
    ['#2EC5E8', '#4F8DFF', '#8E6CFF', '#FFC15E'],
    ['#FF5C8D', '#F77BC0', '#B66BEA', '#6FE0C2'],
    ['#3ED598', '#2EC7C0', '#43A6F2', '#FF9A62'],
    ['#FFB547', '#FF8458', '#FF5C7A', '#8E7CFF'],
    ['#A27BFF', '#6AA2FF', '#45D3E0', '#FF74AE'],
  ].map((r) => r.map(hex));

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  /** The mark in a colourway (cols: 3 gradient stops + bar), its bar at `bar` opacity, in viewBox units. */
  function mark(c, cols, bar, lw = 9.2) {
    const g = c.createLinearGradient(6, 12, 58, 52);
    g.addColorStop(0, css(cols[0])); g.addColorStop(0.55, css(cols[1])); g.addColorStop(1, css(cols[2]));
    c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = g; c.stroke(M_PATH);
    if (bar > 0.004) { c.fillStyle = css(cols[3], bar); c.beginPath(); c.roundRect(41.5, 12, 12, 40.6, 4); c.fill(); }
  }

  function build(w, h, dpr, L) {
    const pv = h < 90;
    const ch = pv ? Math.max(9, Math.round(h * 0.4)) : Math.max(30, Math.min(78, Math.round(Math.min(w, h) * 0.088)));
    const k = ch / (Y1 - Y0), cw = (X1 - X0) * k;
    const gp = Math.round(ch * 0.36); // the glow's reach past the mark
    // a soft glow of the whole mark, one per colourway; on a light page also a soft shade under it
    const glows = PAL.map((cols) => {
      const c = mk((cw + gp * 2) * dpr, (ch + gp * 2) * dpr), x = c.getContext('2d');
      x.scale(dpr, dpr); x.filter = `blur(${(gp * 0.34).toFixed(1)}px)`;
      x.translate(gp, gp); x.scale(k, k); x.translate(-X0, -Y0);
      mark(x, cols, 1, 11);
      return c;
    });
    let shade = null;
    if (L) {
      shade = mk((cw + gp * 2) * dpr, (ch + gp * 2) * dpr);
      const x = shade.getContext('2d');
      x.scale(dpr, dpr); x.filter = `blur(${(gp * 0.2).toFixed(1)}px)`;
      x.translate(gp, gp); x.scale(k, k); x.translate(-X0, -Y0);
      mark(x, [[40, 36, 70], [40, 36, 70], [40, 36, 70], [40, 36, 70]], 1);
    }
    // per colourway: a dot (the head of a spark) and a four-pointed glint
    const tone = (cols) => (L ? mix(cols[1], [40, 20, 70], 0.18) : cols[1]);
    const core = (cols) => (L ? mix(cols[1], [30, 10, 50], 0.4) : [255, 255, 255]);
    const dots = PAL.map((cols) => {
      const n = 16, c = mk(n * dpr, n * dpr), x = c.getContext('2d'), r = n / 2;
      x.scale(dpr, dpr);
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, css(core(cols), 1)); g.addColorStop(0.3, css(tone(cols), 0.8)); g.addColorStop(1, css(tone(cols), 0));
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      return c;
    });
    const stars = PAL.map((cols) => {
      const n = 48, c = mk(n * dpr, n * dpr), x = c.getContext('2d'), r = n / 2;
      x.scale(dpr, dpr);
      const g = x.createRadialGradient(r, r, 0, r, r, r * 0.4);
      g.addColorStop(0, css(core(cols), 1)); g.addColorStop(0.3, css(tone(cols), 0.75)); g.addColorStop(1, css(tone(cols), 0));
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      for (const [sx, sy] of [[1, 0.06], [0.06, 1]]) { // two thin rays crossing
        x.save(); x.translate(r, r); x.scale(sx, sy);
        const q = x.createRadialGradient(0, 0, 0, 0, 0, r);
        q.addColorStop(0, css(core(cols), 0.95)); q.addColorStop(0.25, css(tone(cols), 0.7)); q.addColorStop(1, css(tone(cols), 0));
        x.fillStyle = q; x.fillRect(-r, -r, n, n); x.restore();
      }
      return c;
    });
    // the frame the mark is drawn into, whole device pixels, with room for the squash
    const mg = Math.ceil(ch * 0.22) + 2;
    const tmp = mk((cw + mg * 2) * dpr + 2, (ch + mg * 2) * dpr + 2);
    return { pv, ch, cw, k, gp, glows, shade, dots, stars, mg, tmp, tc: tmp.getContext('2d') };
  }

  /** Back to its own speed, and now and then (when it is heading close to a corner anyway) straight into it. */
  function aim(st, w, h) {
    const W = w - st.cw, H = h - st.ch;
    st.vx = Math.sign(st.vx) * st.bx; st.vy = Math.sign(st.vy) * st.by;
    const dx = st.vx > 0 ? W - st.x : st.x, dy = st.vy > 0 ? H - st.y : st.y;
    const tx = dx / st.bx, ty = dy / st.by;
    if (Math.abs(tx - ty) < 0.07 * Math.min(tx, ty) && Math.random() < 0.9) {
      if (tx < ty) st.vy = Math.sign(st.vy) * (dy / tx); else st.vx = Math.sign(st.vx) * (dx / ty);
    }
  }

  function fresh(w, h, prev) {
    const sc = Math.max(0.5, Math.min(1, h / 420));
    const a = (32 + Math.random() * 10) * (Math.PI / 180), v = 2.15 * sc;
    const st = {
      kind: 'bounce', fx: Math.random(), fy: Math.random(), bx: v * Math.cos(a), by: v * Math.sin(a),
      sx: Math.random() < 0.5 ? -1 : 1, sy: Math.random() < 0.5 ? -1 : 1,
      c0: 0, c1: 0, cm: 1, hit: -99, hitAx: 0, hitAy: 0, corner: -999, cx: 0, cy: 0, fxs: [], parts: [], hist: [],
    };
    if (prev) Object.assign(st, { fx: prev.fx, fy: prev.fy, sx: Math.sign(prev.vx) || 1, sy: Math.sign(prev.vy) || 1, c0: prev.c0, c1: prev.c1, cm: prev.cm });
    return st;
  }

  /** A wall was touched: a ripple, the wall lit where it was hit, sparks skidding off along it. */
  function wallHit(st, w, h, hx, hy) {
    const { ch, cw, pv } = st, ci = st.c1;
    const px = hx ? (hx > 0 ? w : 0) : st.x + cw / 2, py = hy ? (hy > 0 ? h : 0) : st.y + ch / 2, nx = -hx, ny = -hy;
    st.fxs.push({ type: 'ring', x: px, y: py, nx, ny, t0: st.t, c: ci });
    const n = pv ? 2 : 10, half = (hx ? ch : cw) * 0.5;
    for (let i = 0; i < n; i++) { // from both ends of where it touched, skimming off along the wall
      const sd = i % 2 ? 1 : -1, tx = -ny * sd, ty = nx * sd; // along the wall, away from the middle of the contact
      const a = Math.atan2(ty + ny * (0.12 + Math.random() * 0.45), tx + nx * (0.12 + Math.random() * 0.45));
      const v = (pv ? 0.6 : 2) + Math.random() * (pv ? 0.8 : 3.4), o = half * (0.75 + Math.random() * 0.2);
      st.parts.push({ x: px + tx * o + nx * 1.5, y: py + ty * o + ny * 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 10 + Math.random() * 12, c: Math.random() < 0.75 ? ci : (ci + 3) % PAL.length, s: pv ? 1.4 : 2.4, kind: 'spark', g: 0 });
    }
  }

  /** The corner! Rings out of it, a burst of glints thrown from it and more twinkling round it for a while. */
  function cornerHit(st, hx, hy) {
    const { ch, pv } = st, ci = st.c1, base = Math.atan2(-hy, -hx);
    for (let i = 0; i < (pv ? 8 : 30); i++) {
      const a = base + (Math.random() - 0.5) * Math.PI * 0.55, v = (pv ? 0.6 : 2) + Math.random() ** 1.5 * (pv ? 1.6 : 8.5);
      st.parts.push({ x: st.cx, y: st.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 45 + Math.random() * 45, c: (ci + i) % PAL.length, s: (pv ? 3.5 : 8) + Math.random() * (pv ? 4 : 13), kind: 'star', ph: Math.random() * TAU, g: 0.02 });
    }
    for (let i = 0; i < (pv ? 4 : 16); i++) { // glints that wink on and off round the corner afterwards
      const a = base + (Math.random() - 0.5) * Math.PI * 0.5, r = ch * (0.6 + Math.random() * (pv ? 1.6 : 3.4));
      st.parts.push({ x: st.cx + Math.cos(a) * r, y: st.cy + Math.sin(a) * r, vx: 0, vy: 0, life: -((Math.random() * 50) | 0), max: 16 + Math.random() * 16, c: (ci + i * 2) % PAL.length, s: (pv ? 4 : 10) + Math.random() * (pv ? 3 : 12), kind: 'wink', g: 0 });
    }
    for (let i = 0; i < 3; i++) st.fxs.push({ type: 'cring', x: st.cx, y: st.cy, t0: st.t + i * 8, c: (ci + i * 2) % PAL.length });
  }

  (window.BG_EXT = window.BG_EXT || {}).bounce = function (bg, ctx, w, h, t) {
    const L = typeof isLight === 'function' && isLight(), dpr = bg.dpr || 1;
    const key = `${w}x${h}@${dpr}${L ? 'L' : 'D'}`;
    let st = bg.st;
    if (!st || st.kind !== 'bounce' || st.key !== key) {
      const keep = st && st.kind === 'bounce' ? st : null;
      if (keep) { keep.fx = keep.x / Math.max(1, keep.bw - keep.cw); keep.fy = keep.y / Math.max(1, keep.bh - keep.ch); } // a resize keeps it where it was
      st = bg.st = Object.assign(fresh(w, h, keep), build(w, h, dpr, L), { key, bw: w, bh: h });
      st.x = Math.max(0, Math.min(w - st.cw, st.fx * (w - st.cw))); st.y = Math.max(0, Math.min(h - st.ch, st.fy * (h - st.ch)));
      st.vx = st.sx * st.bx; st.vy = st.sy * st.by;
      aim(st, w, h);
    }
    st.t = t;
    const { ch, cw, k, gp, mg, pv } = st;
    const real = bg.canvas.classList.contains('bg-layer');
    const add = L ? 'source-over' : 'lighter';

    // --- motion: a little quicker just off a wall, as if it sprang away ---
    const since0 = t - st.hit;
    const spd = 1 + 0.22 * Math.exp(-since0 / 7);
    st.x += st.vx * spd; st.y += st.vy * spd;
    const W = w - cw, H = h - ch;
    let hx = 0, hy = 0;
    if (st.x <= 0) { st.x = Math.min(W, -st.x); st.vx = Math.abs(st.vx); hx = -1; } else if (st.x >= W) { st.x = Math.max(0, 2 * W - st.x); st.vx = -Math.abs(st.vx); hx = 1; }
    if (st.y <= 0) { st.y = Math.min(H, -st.y); st.vy = Math.abs(st.vy); hy = -1; } else if (st.y >= H) { st.y = Math.max(0, 2 * H - st.y); st.vy = -Math.abs(st.vy); hy = 1; }
    if (hx || hy) {
      st.hit = t; st.hitAx = hx; st.hitAy = hy;
      st.c0 = st.c1; st.c1 = (st.c1 + 1) % PAL.length; st.cm = 0; // a new colour, eased in
      if (hx && hy) {
        st.corner = t; st.cx = hx > 0 ? w : 0; st.cy = hy > 0 ? h : 0;
        cornerHit(st, hx, hy);
        if (real && typeof ambSfx === 'function') ambSfx('corner');
      } else {
        wallHit(st, w, h, hx, hy);
        if (real && typeof ambSfx === 'function') ambSfx('boing');
      }
      aim(st, w, h);
    }
    const since = t - st.hit;
    if (st.cm < 1) st.cm = Math.min(1, st.cm + 1 / 16);
    const m = ease(st.cm), cols = PAL[st.c0].map((c, i) => { const q = mixHue(c, PAL[st.c1][i], m); return L ? mix(q, [24, 12, 64], 0.2) : q; }); // a touch deeper on a light page
    const hist = st.hist;
    hist.push(st.x, st.y); if (hist.length > 64) hist.splice(0, 2);

    const cAge = t - st.corner, cornerOn = cAge >= 0 && cAge < 100;
    const kick = Math.exp(-since / 9); // how freshly it bounced: a brighter glow
    const pop = cornerOn ? Math.exp(-cAge / 16) : 0;

    // --- a soft light in a corner it has just hit ---
    if (cornerOn) {
      const f = Math.exp(-cAge / 30) * Math.min(1, cAge / 4 + 0.35), r = ch * (pv ? 2.4 : 4.6) * (0.75 + 0.35 * (1 - Math.exp(-cAge / 12)));
      const c = mixHue(PAL[st.c0][1], PAL[st.c1][1], 0.5);
      ctx.save(); ctx.globalCompositeOperation = add;
      const g = ctx.createRadialGradient(st.cx, st.cy, 0, st.cx, st.cy, r);
      g.addColorStop(0, css(c, (L ? 0.24 : 0.36) * f)); g.addColorStop(0.4, css(c, (L ? 0.09 : 0.13) * f)); g.addColorStop(1, css(c, 0));
      ctx.fillStyle = g; ctx.fillRect(st.cx - r, st.cy - r, r * 2, r * 2);
      ctx.restore();
    }

    // --- the trail: its glow left behind for a moment ---
    const gl0 = st.glows[st.c0], gl1 = st.glows[st.c1], GW = cw + gp * 2, GH = ch + gp * 2;
    const drawGlow = (x, y, a, s = 1) => {
      const ww = GW * s, hh = GH * s, ox = x + cw / 2 - ww / 2, oy = y + ch / 2 - hh / 2;
      if (m < 1) { ctx.globalAlpha = a * (1 - m); ctx.drawImage(gl0, ox, oy, ww, hh); }
      ctx.globalAlpha = a * m; ctx.drawImage(gl1, ox, oy, ww, hh);
    };
    ctx.save(); ctx.globalCompositeOperation = add;
    const nh = hist.length / 2;
    for (let i = 5; i <= 30; i += 5) {
      if (nh - 1 - i < 0) break;
      const hx2 = hist[(nh - 1 - i) * 2], hy2 = hist[(nh - 1 - i) * 2 + 1];
      if (Math.abs(hx2 - st.x) > w * 0.5 || Math.abs(hy2 - st.y) > h * 0.5) continue; // after a jump (resize)
      drawGlow(hx2, hy2, (L ? 0.09 : 0.13) * (1 - i / 34), 1 - i * 0.006);
    }
    // its own glow, brighter just after a bounce and at a corner
    drawGlow(st.x, st.y, (L ? 0.26 : 0.32) * (1 + 0.6 * kick + 1.1 * pop), 1 + 0.12 * pop);
    ctx.restore();
    if (L && st.shade) { ctx.globalAlpha = 0.14; ctx.drawImage(st.shade, st.x - gp, st.y - gp + ch * 0.06, GW, GH); ctx.globalAlpha = 1; }

    // --- the mark: squashed against the wall it touched, then springing back ---
    let qx = 1, qy = 1, ax = cw / 2, ay = ch / 2;
    if (since < 24) {
      const q = 0.15 * Math.exp(-since / 4.5) * Math.cos(since * 0.58); // squash, a small overshoot, settle
      if (st.hitAx && st.hitAy) { qx = qy = 1 - q * 0.7; ax = st.hitAx > 0 ? cw : 0; ay = st.hitAy > 0 ? ch : 0; } else if (st.hitAx) { qx = 1 - q; qy = 1 + q * 0.5; ax = st.hitAx > 0 ? cw : 0; } else { qy = 1 - q; qx = 1 + q * 0.5; ay = st.hitAy > 0 ? ch : 0; }
    }
    if (pop > 0.01) { const p = 1 + 0.08 * pop * Math.sin((t - st.corner) * 0.3); qx *= p; qy *= p; }
    const blink = 0.6 + 0.4 * Math.tanh(4 * Math.sin((t / 34) * TAU)); // the cursor bar breathes, like a cursor that blinks
    const tc = st.tc, tw = st.tmp.width, th = st.tmp.height;
    const dx = (st.x - mg) * dpr, dy = (st.y - mg) * dpr, ix = Math.floor(dx), iy = Math.floor(dy);
    tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, tw, th);
    tc.setTransform(dpr, 0, 0, dpr, dx - ix, dy - iy);
    tc.translate(mg + ax, mg + ay); tc.scale(qx, qy); tc.translate(-ax, -ay);
    tc.scale(k, k); tc.translate(-X0, -Y0);
    mark(tc, cols, Math.max(0.08, blink));
    ctx.globalAlpha = Math.min(1, (L ? 0.9 : 0.76) + 0.12 * kick + 0.2 * pop);
    ctx.drawImage(st.tmp, ix / dpr, iy / dpr, tw / dpr, th / dpr);
    ctx.globalAlpha = 1;

    // --- what a hit leaves behind: a ripple on the wall, rings out of a corner ---
    ctx.save(); ctx.globalCompositeOperation = add;
    const ring = (f, r, a, lw) => { // a ring of light: a soft band with a fine bright line in it
      const c = L ? mix(PAL[f.c][1], [40, 20, 70], 0.18) : PAL[f.c][1];
      ctx.globalAlpha = 1;
      ctx.strokeStyle = css(c, a * (L ? 0.12 : 0.14)); ctx.lineWidth = lw * 5; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = css(L ? c : mix(c, [255, 255, 255], 0.3), a * (L ? 0.55 : 0.5)); ctx.lineWidth = lw; ctx.stroke();
    };
    st.fxs = st.fxs.filter((f) => t - f.t0 < (f.type === 'cring' ? 64 : 30));
    for (const f of st.fxs) {
      const age = t - f.t0;
      if (age < 0) continue;
      if (f.type === 'ring') {
        const p = age / 30, e = 1 - (1 - p) ** 3;
        // the wall glows where it was touched
        const lr = ch * (0.45 + 1.0 * e), lw = ch * (0.1 + 0.06 * e), la = (L ? 0.5 : 0.75) * (1 - p) ** 1.5;
        const sx = f.nx ? lw : lr, sy = f.ny ? lw : lr;
        ctx.globalAlpha = la; ctx.drawImage(st.dots[f.c], f.x - sx, f.y - sy, sx * 2, sy * 2);
        ring(f, ch * (0.25 + 1.05 * e), (1 - p) ** 1.4, pv ? 0.7 : 1.3);
      } else {
        const p = age / 64, e = 1 - (1 - p) ** 3;
        ring(f, ch * (0.5 + (pv ? 2.2 : 4.2) * e), (1 - p) ** 1.3, pv ? 0.9 : 1.8);
      }
    }
    // sparks and glints
    ctx.lineCap = 'round';
    for (const p of st.parts) {
      p.life++;
      if (p.life <= 0) continue;
      const f = p.life / p.max;
      if (p.kind === 'wink') { // grows, flashes, shrinks away
        const a = Math.sin(Math.PI * f) ** 2, s = p.s * (0.3 + 0.7 * Math.sin(Math.PI * f));
        ctx.globalAlpha = a * (L ? 0.8 : 0.85); ctx.drawImage(st.stars[p.c], p.x - s, p.y - s, s * 2, s * 2);
        continue;
      }
      p.x += p.vx; p.y += p.vy;
      const dr = p.kind === 'star' ? 0.93 : 0.88; p.vx *= dr; p.vy = p.vy * dr + p.g;
      const a = (f < 0.08 ? f / 0.08 : 1) * (1 - f) ** 1.3;
      if (a <= 0) continue;
      if (p.kind === 'star') {
        const tw2 = 0.55 + 0.45 * Math.sin(p.ph + p.life * 0.42), s = p.s * (0.55 + 0.45 * tw2) * (1 - f * 0.4);
        ctx.globalAlpha = a * (L ? 0.85 : 0.9) * (0.45 + 0.55 * tw2); ctx.drawImage(st.stars[p.c], p.x - s, p.y - s, s * 2, s * 2);
      } else { // a spark: a short streak behind a bright head
        const c = PAL[p.c][1], len = 3.2;
        ctx.globalAlpha = 1; ctx.strokeStyle = css(L ? mix(c, [40, 20, 70], 0.2) : mix(c, [255, 255, 255], 0.35), a * (L ? 0.6 : 0.7));
        ctx.lineWidth = Math.max(0.6, p.s * 0.45 * (1 - f * 0.5));
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * len, p.y - p.vy * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        const s = p.s * (1 - f * 0.5);
        ctx.globalAlpha = a * (L ? 0.7 : 0.85); ctx.drawImage(st.dots[p.c], p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    st.parts = st.parts.filter((p) => p.life < p.max);
    ctx.restore();
  };
})();
