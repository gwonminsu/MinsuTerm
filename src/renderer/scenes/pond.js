'use strict';
/*
 * 빗방울 연못: rain on a pond, seen from the bank. Each drop falls, throws up a small crown and sends rings out
 * over the water, lit on their far side and shaded on the near one. Lily pads ride the surface (veins, a notch,
 * a paler rim, one of them in flower) and a koi or two pass underneath. Rings and lights follow the accent.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('pond'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, TILT = 0.42; // how flat the water lies to the eye
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0], LEAF = [70, 148, 102];
  const near = (y, H) => 0.62 + 0.62 * Math.max(0, Math.min(1, y / H)); // things lower on the screen are closer, so larger

  /** A lily pad's outline in the water's plane: a slightly wavy disc with a notch cut to the middle. */
  function padPath(ctx, p, r) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, TILT); ctx.rotate(p.rot);
    ctx.beginPath(); ctx.moveTo(r * 0.1, 0);
    for (let k = 0; k <= 40; k++) { const a = p.notch + ((TAU - p.notch * 2) * k) / 40, rr = r * (1 + 0.028 * Math.sin(a * 5 + p.ph)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
    ctx.restore();
  }
  /** A water lily: three rings of petals, the outer ones lying open, the inner ones standing. */
  function lily(ctx, x, y, fr, cols, lw) {
    const petal = (ang, len, flat, up, fill, edge) => {
      const by = y - up * 0.4, tx = x + Math.cos(ang) * len, ty = y + Math.sin(ang) * len * flat - up, mx = (x + tx) / 2, my = (by + ty) / 2;
      const d = Math.hypot(tx - x, ty - by) || 1, nx = (-(ty - by) / d) * len * 0.3, ny = ((tx - x) / d) * len * 0.3;
      const path = new Path2D();
      path.moveTo(x, by); path.quadraticCurveTo(mx + nx, my + ny, tx, ty); path.quadraticCurveTo(mx - nx, my - ny, x, by);
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(path); // a petal hides what is under it
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = fill; ctx.fill(path);
      ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke(path);
    };
    for (const [n, len, flat, up, turn, ci] of [[9, 1, 0.5, 0, 0, 0], [7, 0.72, 0.62, 0.1, 0.4, 1], [5, 0.46, 0.8, 0.2, 0.15, 2]]) {
      const order = Array.from({ length: n }, (_, i) => turn + (i / n) * TAU).sort((p, q) => Math.sin(p) - Math.sin(q)); // far petals first
      for (const a of order) petal(a, fr * len, flat, fr * up, cols.petal[ci], cols.edge);
    }
    ctx.fillStyle = cols.heart; ctx.beginPath(); ctx.ellipse(x, y - fr * 0.24, fr * 0.13, fr * 0.09, 0, 0, TAU); ctx.fill();
  }

  window.BG_EXT.pond = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1.5), { W, H, u } = V, L = K.light();
    const [a0, a1, a2] = fxColors();
    const key = `${W}x${H}`, z = V.pv ? 0.6 : 1, big = V.pv ? 2.2 : 1; // big: rings in the small picker preview are drawn larger so they read
    const drop = (x, y, age) => { const s = near(y, H), v = u * 0.0012 * s * big * (0.85 + Math.random() * 0.3); return { x, y, s, fall: age ? 0 : 6, age, r: v * age, life: 1 - 0.0085 * age, v, onPad: false }; };
    let st = bg.st;
    if (!st || st.kind !== 'pond' || st.key !== key) {
      const R = K.rng(8131);
      const spots = V.pv ? [[0.78, 0.62], [0.2, 0.42]] : [[0.8, 0.7], [0.9, 0.5], [0.14, 0.84], [0.57, 0.9], [0.4, 0.26]];
      st = bg.st = { kind: 'pond', key, drops: [],
        pads: spots.map(([fx, fy], i) => { const y = H * (fy + (R() - 0.5) * 0.04); return { x: W * (fx + (R() - 0.5) * 0.05), y, r: u * (0.05 + R() * 0.026) * near(y, H) * (V.pv ? 1.9 : 1), rot0: R() * TAU, rot: 0, notch: 0.26 + R() * 0.12, ph: R() * 6, flower: !V.pv && (i === 0 || i === 3) }; }),
        koi: (V.pv ? [0] : [0, 1]).map((i) => ({ x: W * (0.3 + 0.4 * R()), y: H * (0.35 + 0.4 * R()), a: R() * TAU, tx: W * R(), ty: H * R(), wait: 0, trail: [], ph: R() * 6, size: (i ? 0.1 : 0.135) * (V.pv ? 1.5 : 1) })),
        glints: Array.from({ length: V.pv ? 4 : 14 }, () => ({ x: R() * W, y: R() * H, ph: R() * 6.28, sp: 0.012 + R() * 0.02, len: 0.008 + R() * 0.012 })) };
      for (let i = 0, n = V.pv ? 4 : 5; i < n; i++) st.drops.push(drop(W * (0.1 + 0.8 * R()), H * (0.15 + 0.7 * R()), 12 + R() * 70)); // the rain has been falling for a while
    }
    const k700 = u / 700;
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // koi under the surface: a soft shape with pale markings, the tail sweeping behind
    for (const f of st.koi) {
      const s = near(f.y, H), len = u * f.size * s, v = 0.85 * k700 * (0.7 + 0.3 * s);
      if (--f.wait <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < u * 0.08) { f.tx = W * (0.06 + 0.88 * Math.random()); f.ty = H * (0.1 + 0.82 * Math.random()); f.wait = 500 + Math.random() * 500; }
      let da = Math.atan2(f.ty - f.y, f.tx - f.x) - f.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      f.a += Math.max(-0.014, Math.min(0.014, da * 0.04)) + Math.sin(t * 0.16 + f.ph) * 0.006;
      f.x += Math.cos(f.a) * v; f.y += Math.sin(f.a) * v * 0.62;
      f.trail.unshift([f.x, f.y]);
      const N = Math.max(8, Math.ceil(len / v));
      if (f.trail.length > N) f.trail.length = N;
      if (f.trail.length < 8) continue;
      const SP = 8, bw = len * 0.105, pts = [];
      for (let q = 0; q < SP; q++) pts.push(f.trail[Math.min(f.trail.length - 1, Math.round((q * (f.trail.length - 1)) / (SP - 1)))]);
      const WD = [0.5, 0.96, 1, 0.86, 0.62, 0.4, 0.22, 0.1], sp = [], nr = [];
      for (let q = 0; q < SP; q++) {
        const p0 = pts[Math.max(0, q - 1)], p1 = pts[Math.min(SP - 1, q + 1)], dx = p0[0] - p1[0], dy = p0[1] - p1[1], d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d, ny = (dx / d) * 0.8, wag = Math.sin(t * 0.2 + f.ph - q * 0.75) * Math.pow(q / (SP - 1), 1.5) * bw * 1.1;
        sp.push([pts[q][0] + nx * wag, pts[q][1] + ny * wag, dx / d, dy / d]); nr.push([nx, ny]);
      }
      const body = new Path2D(), side = (q, sg) => [sp[q][0] + nr[q][0] * WD[q] * bw * sg, sp[q][1] + nr[q][1] * WD[q] * bw * sg];
      body.moveTo(sp[0][0] + sp[0][2] * bw * 0.9, sp[0][1] + sp[0][3] * bw * 0.9); // the nose
      for (let q = 0; q < SP; q++) { const [x, y] = side(q, 1); body.lineTo(x, y); }
      const tl = sp[SP - 1], fl = bw * 2.1, fw = bw * 1.25; // the tail fin, forked
      body.lineTo(tl[0] - tl[2] * fl + nr[SP - 1][0] * fw, tl[1] - tl[3] * fl + nr[SP - 1][1] * fw);
      body.lineTo(tl[0] - tl[2] * fl * 0.5, tl[1] - tl[3] * fl * 0.5);
      body.lineTo(tl[0] - tl[2] * fl - nr[SP - 1][0] * fw, tl[1] - tl[3] * fl - nr[SP - 1][1] * fw);
      for (let q = SP - 1; q >= 0; q--) { const [x, y] = side(q, -1); body.lineTo(x, y); }
      body.closePath();
      ctx.fillStyle = L ? rgba(mix(a2, [72, 84, 100], 0.4), 0.26) : rgba(mix(a2, WHITE, 0.2), 0.2);
      for (const sg of [1, -1]) { // pectoral fins, swept back
        const [x, y] = side(2, sg), ang = Math.atan2(-sp[2][3], -sp[2][2]) + sg * 0.75;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * bw * 0.85, y + Math.sin(ang) * bw * 0.85, bw * 0.85, bw * 0.3, ang, 0, TAU); ctx.fill();
      }
      ctx.fill(body);
      ctx.fillStyle = L ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.13)';
      for (const q of [1, 3, 4]) { ctx.beginPath(); ctx.ellipse(sp[q][0], sp[q][1], bw * WD[q] * (q === 1 ? 0.6 : 0.5), bw * WD[q] * 0.42, Math.atan2(sp[q][3], sp[q][2]), 0, TAU); ctx.fill(); }
    }

    // light lying on still water
    for (const g of st.glints) {
      const tw = Math.max(0, Math.sin(g.ph + t * g.sp)) ** 2;
      if (tw < 0.05) continue;
      const len = g.len * u * near(g.y, H);
      ctx.strokeStyle = L ? rgba(a0, 0.14 * tw) : rgba(mix(a0, WHITE, 0.45), 0.13 * tw); ctx.lineWidth = Math.max(0.5, 1.1 * z);
      ctx.beginPath(); ctx.moveTo(g.x - len, g.y); ctx.lineTo(g.x + len, g.y); ctx.stroke();
    }

    // rain: a drop falls, lands, and its rings spread
    if (Math.random() < (V.pv ? 0.05 : 0.06) && st.drops.length < 40) {
      const d = drop(Math.random() * W, Math.random() * H, 0);
      d.onPad = st.pads.some((p) => ((d.x - p.x) / p.r) ** 2 + ((d.y - p.y) / (p.r * TILT)) ** 2 < 0.9);
      st.drops.push(d);
    }
    const hi0 = L ? mix(a2, BLACK, 0.14) : mix(a2, WHITE, 0.3), hi1 = L ? mix(a1, BLACK, 0.1) : mix(a1, WHITE, 0.3);
    for (const d of st.drops) {
      if (d.fall > 0) { d.fall--; continue; }
      d.age++;
      if (d.onPad) { d.life -= 0.12; continue; } // a drop on a leaf: a small splash, no rings
      d.r += d.v; d.life -= 0.0085;
      const gap = u * 0.016 * d.s * big, fadeIn = Math.min(1, d.age / 6);
      for (let q = 0; q < 3; q++) {
        const r = d.r - q * gap;
        if (r <= 0.5) continue;
        const a = Math.max(0, d.life) * (0.52 - q * 0.13) * fadeIn, c = q === 0 ? hi0 : hi1;
        ctx.lineWidth = Math.max(0.5, (1.7 - q * 0.35) * z * (0.75 + 0.25 * d.s));
        ctx.strokeStyle = L ? rgba(c, a * 0.8) : rgba(c, a); // the far side of the ring catches the light
        ctx.beginPath(); ctx.ellipse(d.x, d.y, r, r * TILT, 0, Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = L ? rgba(mix(c, BLACK, 0.3), a * 1.3) : rgba(mix(c, BLACK, 0.35), a * 0.6); // the near side lies in its own shade
        ctx.beginPath(); ctx.ellipse(d.x, d.y, r, r * TILT, 0, 0, Math.PI); ctx.stroke();
      }
    }
    st.drops = st.drops.filter((d) => d.life > 0);

    // lily pads on the surface: they hide the rings passing under them
    const leaf = mix(LEAF, a0, 0.16);
    for (const p of st.pads) {
      p.x += 0.02 * k700; if (p.x > W + p.r * 1.5) p.x = -p.r * 1.5;
      p.rot = p.rot0 + 0.14 * Math.sin(t * 0.004 + p.ph);
      const y0 = p.y; p.y = y0 + Math.sin(t * 0.021 + p.ph) * u * 0.0012;
      ctx.fillStyle = L ? 'rgba(34,54,62,0.1)' : 'rgba(0,0,0,0.26)'; // its shadow on the water
      ctx.beginPath(); ctx.ellipse(p.x + p.r * 0.05, p.y + p.r * TILT * 0.17, p.r * 1.02, p.r * TILT * 1.02, 0, 0, TAU); ctx.fill();
      padPath(ctx, p, p.r);
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(p.x - p.r * 0.25, p.y - p.r * TILT * 0.3, 0, p.x, p.y, p.r);
      g.addColorStop(0, rgba(mix(leaf, WHITE, L ? 0.12 : 0.26), L ? 0.3 : 0.34)); g.addColorStop(1, rgba(mix(leaf, BLACK, L ? 0.18 : 0.28), L ? 0.36 : 0.38));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = L ? rgba(mix(leaf, BLACK, 0.35), 0.5) : rgba(mix(leaf, WHITE, 0.5), 0.5); ctx.lineWidth = Math.max(0.5, 1.2 * z); ctx.stroke(); // the paler rim
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, TILT); ctx.rotate(p.rot); // veins running out from the notch
      ctx.beginPath();
      for (let q = 0; q < 9; q++) { const a = p.notch + 0.3 + ((TAU - p.notch * 2 - 0.6) * q) / 8; ctx.moveTo(p.r * 0.1, 0); ctx.lineTo(Math.cos(a) * p.r * 0.9, Math.sin(a) * p.r * 0.9); }
      ctx.restore();
      ctx.strokeStyle = L ? rgba(mix(leaf, BLACK, 0.3), 0.24) : rgba(mix(leaf, WHITE, 0.4), 0.2); ctx.lineWidth = Math.max(0.4, 0.8 * z); ctx.stroke();
      ctx.strokeStyle = L ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)'; ctx.lineWidth = Math.max(0.5, 1.4 * z); // a waxy gleam
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.74, p.r * 0.74 * TILT, 0, Math.PI * 1.12, Math.PI * 1.5); ctx.stroke();
      if (p.flower) {
        const cols = L
          ? { petal: [rgba(mix(a1, WHITE, 0.3), 0.62), rgba(mix(a1, WHITE, 0.5), 0.72), rgba(mix(a1, WHITE, 0.68), 0.82)], edge: rgba(mix(a1, BLACK, 0.2), 0.34), heart: rgba(mix(a2, [236, 176, 60], 0.5), 0.9) }
          : { petal: [rgba(mix(a1, WHITE, 0.5), 0.66), rgba(mix(a1, WHITE, 0.68), 0.78), rgba(mix(a1, WHITE, 0.84), 0.88)], edge: rgba(a1, 0.34), heart: rgba(mix(a2, [255, 222, 120], 0.5), 0.95) };
        lily(ctx, p.x - p.r * 0.16, p.y - p.r * TILT * 0.1, p.r * 0.5, cols, Math.max(0.4, 0.7 * z));
      }
      p.y = y0;
    }

    // the drops themselves: the streak coming down, then the crown it throws up
    for (const d of st.drops) {
      const c = L ? mix(a0, [70, 80, 96], 0.5) : mix(a2, WHITE, 0.55);
      if (d.fall > 0) {
        const yy = d.y - d.fall * u * 0.03 * d.s;
        ctx.strokeStyle = rgba(c, L ? 0.3 : 0.26); ctx.lineWidth = Math.max(0.5, 1 * z);
        ctx.beginPath(); ctx.moveTo(d.x + d.fall * 0.6 * z, yy - u * 0.034 * d.s); ctx.lineTo(d.x + d.fall * 0.3 * z, yy); ctx.stroke();
      } else if (d.age < 10) {
        const q = d.age / 10, up = Math.sin(Math.PI * q) * u * 0.017 * d.s, a = (1 - q) * (L ? 0.6 : 0.62);
        ctx.strokeStyle = rgba(c, a); ctx.fillStyle = rgba(c, a); ctx.lineWidth = Math.max(0.5, 1.1 * z);
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - up); ctx.stroke();
        for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(d.x + sg * q * u * 0.012 * d.s, d.y - up * 0.8 + q * q * u * 0.008 * d.s, Math.max(0.4, 1 * z * d.s), 0, TAU); ctx.fill(); }
      }
    }
    ctx.restore();
  };
})();
