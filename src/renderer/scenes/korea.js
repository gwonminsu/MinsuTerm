'use strict';
/*
 * 한국의 밤: an ink landscape by moonlight. Ridges fading into mist, a pavilion and pines on a cliff over the
 * water, the corner of a tiled eave with a silk lantern and a wind chime, cranes crossing the moon, a boat,
 * reeds, petals on the wind. In light mode it is an ink painting on the page, with a red sun.
 */
(function () {
  const K = window.SceneKit;

  /** A pine: a bent trunk, a few limbs, each ending in flat fans of needles (the context's fill and stroke). */
  function pine(c, R, x, y, h, lean) {
    let px = x, py = y, a = -Math.PI / 2 + lean;
    const seg = 7, sl = h / seg, pts = [[px, py]];
    for (let i = 0; i < seg; i++) { a += (R() - 0.5) * 0.5 - lean * 0.13; px += Math.cos(a) * sl; py += Math.sin(a) * sl; pts.push([px, py]); }
    for (let i = 0; i < seg; i++) { c.lineWidth = Math.max(1, h * 0.055 * (1 - (i / seg) * 0.7)); c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke(); }
    const fan = (fx, fy, fw) => {
      c.beginPath(); c.ellipse(fx, fy, fw, fw * 0.3, 0, Math.PI, 0); c.closePath(); c.fill();
      c.lineWidth = Math.max(0.6, fw * 0.04);
      for (let k = 0; k <= 12; k++) { const q = Math.PI + (Math.PI * k) / 12, ex = fx + Math.cos(q) * fw, ey = fy + Math.sin(q) * fw * 0.3; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(q) * fw * 0.17, ey + Math.sin(q) * fw * 0.2 - fw * 0.03); c.stroke(); }
    };
    for (let i = 2; i <= seg; i++) {
      const [bx, by] = pts[i], d = i % 2 ? 1 : -1, bl = h * (0.36 - (i / seg) * 0.17) * (0.8 + R() * 0.5);
      const ex = bx + d * bl, ey = by - bl * (0.1 + R() * 0.2);
      c.lineWidth = Math.max(0.8, h * 0.02);
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + d * bl * 0.5, by + bl * 0.08, ex, ey); c.stroke();
      fan(ex, ey, bl * 0.56);
      if (R() < 0.7) fan(bx + d * bl * 0.45, by - bl * 0.13, bl * 0.4);
    }
    fan(pts[seg][0], pts[seg][1], h * 0.17);
  }

  /** A crane in flight, heading left; f: -1 wings down … 1 wings up. */
  function crane(c, s, f, body, dark, crown) {
    const wing = (ff, dx) => {
      const ty = -ff * s * 0.8, tx = dx + s * (0.05 + 0.13 * (1 - Math.abs(ff)));
      c.beginPath(); c.moveTo(dx - s * 0.2, -s * 0.04);
      c.quadraticCurveTo(dx - s * 0.13, ty * 0.62, tx, ty);
      c.lineTo(tx + s * 0.1, ty * 0.86); c.lineTo(tx + s * 0.07, ty * 0.74); c.lineTo(tx + s * 0.17, ty * 0.62); c.lineTo(tx + s * 0.12, ty * 0.5);
      c.quadraticCurveTo(dx + s * 0.25, ty * 0.2, dx + s * 0.2, 0);
      c.closePath(); c.fill();
    };
    c.fillStyle = dark; wing(f * 0.8 - 0.12, s * 0.05);              // the far wing, a beat behind
    c.strokeStyle = dark; c.lineCap = 'round';
    c.lineWidth = s * 0.03; c.beginPath(); c.moveTo(s * 0.34, s * 0.03); c.lineTo(s * 1.0, s * 0.1); c.stroke(); // legs trailing
    c.lineWidth = s * 0.055; c.beginPath(); c.moveTo(-s * 0.34, -s * 0.02); c.quadraticCurveTo(-s * 0.7, -s * 0.11, -s * 0.98, -s * 0.075); c.stroke(); // the neck, stretched out
    c.lineWidth = s * 0.024; c.beginPath(); c.moveTo(-s * 1.03, -s * 0.072); c.lineTo(-s * 1.22, -s * 0.05); c.stroke();
    c.fillStyle = body;
    c.beginPath(); c.ellipse(0, 0, s * 0.42, s * 0.12, -0.08, 0, 7); c.fill();
    c.beginPath(); c.ellipse(-s * 1.0, -s * 0.078, s * 0.062, s * 0.042, 0, 0, 7); c.fill();
    wing(f, 0);
    c.fillStyle = crown; c.beginPath(); c.arc(-s * 0.99, -s * 0.108, s * 0.03, 0, 7); c.fill();
  }

  /** The moon (or, in light mode, a red sun) as a sprite. */
  function orb(L) {
    const key = `kOrb${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 126);
    if (L) { g.addColorStop(0, 'rgba(226,84,60,1)'); g.addColorStop(0.9, 'rgba(206,60,44,1)'); g.addColorStop(1, 'rgba(206,60,44,0)'); } else { g.addColorStop(0, 'rgba(255,250,232,1)'); g.addColorStop(0.86, 'rgba(250,238,206,1)'); g.addColorStop(0.97, 'rgba(244,226,186,0.9)'); g.addColorStop(1, 'rgba(244,226,186,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    if (!L) { x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.16; x.drawImage(K.tint(K.noiseTex('kMoon', 128, 128, { px: 4, py: 4, oct: 4, lo: 0.42, hi: 0.7, seed: 31 }), '#8c7c6a'), 0, 0, 256, 256); }
    K.cache.set(key, c);
    return c;
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(1392), q = bg.dpr;
    const ink = L ? '#2b3038' : '#05080c', inkRGB = L ? '43,48,56' : '5,8,12';
    const wy = H * 0.74; // where the far shore meets the water
    const [back, b] = K.layer(W, H, q), [hills, hl] = K.layer(W, H, q), [mid, m] = K.layer(W, H, q), [near, n] = K.layer(W, H, q);

    // A ridge in ink wash: strong along its crest, thinning into the mist below. It hides whatever is behind it.
    const smooth = (h) => { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) o[i] = (h[Math.max(0, i - 2)] + h[Math.max(0, i - 1)] * 2 + h[i] * 3 + h[Math.min(h.length - 1, i + 1)] * 2 + h[Math.min(h.length - 1, i + 2)]) / 9; return o; };
    const ridge = (c, rgb, top, low, base, amp, o = {}) => {
      const hts = smooth(K.ridge(R, 128, 0.52)), N = 128, X = (i) => -12 + ((W + 24) * i) / N, Y = (i) => base - amp * (0.12 + 0.88 * hts[i]) * (o.env ? o.env(i / N) : 1);
      const bottom = base + u * 0.02, path = new Path2D(); path.moveTo(-12, bottom);
      for (let i = 0; i <= N; i++) path.lineTo(X(i), Y(i));
      path.lineTo(W + 12, bottom); path.closePath();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(path); c.restore();
      const g = c.createLinearGradient(0, base - amp, 0, bottom);
      g.addColorStop(0, `rgba(${rgb},${top})`); g.addColorStop(0.55, `rgba(${rgb},${top * 0.62 + low * 0.38})`); g.addColorStop(1, `rgba(${rgb},${low})`);
      c.fillStyle = g; c.fill(path);
      c.save(); c.clip(path); c.lineCap = 'round';
      for (let i = 2; i < N - 1; i++) { // texture strokes running down the slopes, moss dots on the crests
        const dh = Y(i + 1) - Y(i - 1), x = X(i), y = Y(i);
        if (R() < 0.32) {
          const len = amp * (0.04 + R() * 0.1), dx = (dh > 0 ? 1 : -1) * len * (0.5 + R() * 0.7);
          c.strokeStyle = `rgba(${rgb},${top * (0.2 + R() * 0.3)})`; c.lineWidth = (0.6 + R() * 0.8) * (V.pv ? 0.6 : 1);
          c.beginPath(); c.moveTo(x, y + 1); c.quadraticCurveTo(x + dx * 0.3, y + len * 0.5, x + dx, y + len); c.stroke();
        }
        if (Y(i) < Y(i - 1) && Y(i) <= Y(i + 1) && R() < 0.8) {
          c.fillStyle = `rgba(${rgb},${Math.min(1, top * 0.9)})`;
          for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + (R() - 0.5) * u * 0.022, y + u * 0.004 + R() * u * 0.012, (0.7 + R() * 1.1) * V.z, 0, 7); c.fill(); }
        }
      }
      c.restore();
      return { X, Y, N };
    };
    if (L) { ridge(b, inkRGB, 0.17, 0.01, wy, u * 0.34); ridge(b, inkRGB, 0.27, 0.03, wy + u * 0.006, u * 0.22); } else { ridge(b, '132,152,196', 0.24, 0.03, wy, u * 0.34); ridge(b, '92,112,158', 0.3, 0.05, wy + u * 0.006, u * 0.22); }
    // the near shore: low dark hills, small pines standing on them
    const sh = ridge(hl, inkRGB, L ? 0.42 : 0.74, L ? 0.16 : 0.42, wy + u * 0.012, u * 0.12, { env: (k) => 0.55 + 0.45 * Math.sin(k * 5.2 + 1) ** 2 });
    hl.strokeStyle = `rgba(${inkRGB},${L ? 0.5 : 0.8})`; hl.lineCap = 'round';
    for (let i = 3; i < sh.N - 2; i++) {
      if (R() > 0.2) continue;
      const x = sh.X(i), y = sh.Y(i), th = u * (0.012 + R() * 0.014);
      hl.lineWidth = Math.max(0.8, u * 0.0016); hl.beginPath(); hl.moveTo(x, y + 2); hl.lineTo(x + th * 0.1, y - th); hl.stroke();
      hl.lineWidth = Math.max(0.8, u * 0.0022);
      for (let k = 0; k < 3; k++) { const yy = y - th * (0.45 + k * 0.25), ww = th * (0.5 - k * 0.12); hl.beginPath(); hl.moveTo(x - ww, yy + ww * 0.15); hl.lineTo(x + ww, yy - ww * 0.1); hl.stroke(); }
    }

    // the cliff on the left, the pavilion on it, pines leaning out over the water
    m.fillStyle = ink; m.strokeStyle = ink;
    const py = H * 0.6, px = W * 0.02 + u * 0.2;
    const cg = m.createLinearGradient(0, py, 0, H); cg.addColorStop(0, ink); cg.addColorStop(0.35, ink); cg.addColorStop(1, `rgba(${inkRGB},0.5)`);
    m.fillStyle = cg;
    K.rock(m, R, [[-12, H + 12], [-12, py + u * 0.012], [px - u * 0.14, py], [px + u * 0.135, py], [px + u * 0.175, py + u * 0.05], [px + u * 0.2, py + u * 0.16], [px + u * 0.27, H * 0.88], [px + u * 0.38, H + 12]], u * 0.012);
    m.fillStyle = ink;
    m.save(); m.globalCompositeOperation = 'destination-out'; m.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 6; i++) { // clefts in the rock face
      let x = px + u * (0.16 - i * 0.07 + R() * 0.04), y = py + u * (0.03 + R() * 0.07);
      m.lineWidth = Math.max(1, u * (0.002 + R() * 0.004)); m.beginPath(); m.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += u * (R() * 0.04 - 0.004); y += u * (0.025 + R() * 0.045); m.lineTo(x, y); }
      m.stroke();
    }
    m.restore();
    pine(m, R, px - u * 0.15, py + u * 0.004, u * 0.15, -0.22);
    pine(m, R, px + u * 0.155, py + u * 0.035, u * 0.21, 0.42);
    m.fillRect(px - u * 0.092, py - u * 0.014, u * 0.184, u * 0.016); // the stone base
    for (const d of [-0.07, -0.024, 0.024, 0.07]) m.fillRect(px + u * d - u * 0.0035, py - u * 0.082, u * 0.007, u * 0.07);
    m.fillRect(px - u * 0.076, py - u * 0.084, u * 0.152, u * 0.007); // the beam under the eaves
    m.lineWidth = Math.max(1, u * 0.0028); m.lineCap = 'butt';
    m.beginPath(); m.moveTo(px - u * 0.072, py - u * 0.034); m.lineTo(px + u * 0.072, py - u * 0.034); m.stroke(); // the railing
    m.lineWidth = Math.max(0.8, u * 0.0016);
    for (let k = -8; k <= 8; k++) { m.beginPath(); m.moveTo(px + u * 0.0085 * k, py - u * 0.034); m.lineTo(px + u * 0.0085 * k, py - u * 0.014); m.stroke(); }
    m.beginPath(); // the roof: eaves sagging in the middle and lifting at the corners
    m.moveTo(px - u * 0.124, py - u * 0.094);
    m.quadraticCurveTo(px, py - u * 0.07, px + u * 0.124, py - u * 0.094);
    m.quadraticCurveTo(px + u * 0.074, py - u * 0.103, px + u * 0.052, py - u * 0.136);
    m.quadraticCurveTo(px, py - u * 0.13, px - u * 0.052, py - u * 0.136);
    m.quadraticCurveTo(px - u * 0.074, py - u * 0.103, px - u * 0.124, py - u * 0.094);
    m.closePath(); m.fill();
    for (const d of [-1, 1]) { m.beginPath(); m.moveTo(px + d * u * 0.052, py - u * 0.136); m.lineTo(px + d * u * 0.062, py - u * 0.149); m.lineTo(px + d * u * 0.044, py - u * 0.139); m.closePath(); m.fill(); } // ridge ends
    m.save(); m.globalCompositeOperation = 'destination-out'; m.lineWidth = Math.max(0.6, u * 0.0012); // tile rows
    for (let k = -9; k <= 9; k++) { m.beginPath(); m.moveTo(px + u * 0.0052 * k, py - u * 0.131); m.lineTo(px + u * 0.0118 * k, py - u * 0.084); m.stroke(); }
    m.restore();

    // the eave of a tiled roof coming in at the top right, its corner turned up
    n.fillStyle = ink; n.strokeStyle = ink;
    const tx = W - u * 0.43, ty = u * 0.085, ex = W + 12, ey = ty + u * 0.14, cx2 = tx + u * 0.22, cy2 = ty + u * 0.135;
    const edge = (k) => [(1 - k) * (1 - k) * tx + 2 * (1 - k) * k * cx2 + k * k * ex, (1 - k) * (1 - k) * ty + 2 * (1 - k) * k * cy2 + k * k * ey];
    n.beginPath(); n.moveTo(tx, ty);
    n.quadraticCurveTo(tx + u * 0.09, ty - u * 0.022, tx + u * 0.19, -u * 0.03);
    n.lineTo(ex, -u * 0.03); n.lineTo(ex, ey);
    n.quadraticCurveTo(cx2, cy2, tx, ty);
    n.closePath(); n.fill();
    for (let k = 0.02; k < 1; k += 0.03) { const [x, y] = edge(k); n.beginPath(); n.arc(x, y + u * 0.002, u * 0.0062, 0, 7); n.fill(); } // end tiles along the edge
    n.save(); n.globalCompositeOperation = 'destination-out'; n.lineWidth = Math.max(0.7, u * 0.0014);
    for (let k = 0.05; k < 1; k += 0.03) { const [x, y] = edge(k); n.beginPath(); n.moveTo(x, y - u * 0.008); n.lineTo(x + u * (0.05 + 0.1 * k), -u * 0.03); n.stroke(); } // tile rows
    n.restore();
    const [rim, rr] = K.layer(W, H, q); // the edges the moon catches: up and to the right
    rr.drawImage(mid, 0, 0, W, H);
    rr.globalCompositeOperation = 'destination-out'; rr.drawImage(mid, -u * 0.0026, u * 0.0026, W, H);
    rr.globalCompositeOperation = 'source-in'; rr.fillStyle = '#b8c8ea'; rr.fillRect(0, 0, W, H);
    const lp = edge(0.42), cp = [tx + u * 0.012, ty + u * 0.004];
    return { back, hills, mid, near, rim, wy, px, py, lantern: [lp[0], lp[1] + u * 0.004], chime: cp };
  }

  window.drawKorea = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.4, 1.6), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'korea' || st.key !== S.key) {
      st = bg.st = { kind: 'korea', key: S.key,
        cranes: [0, 1, 2].map((i) => ({ x: W * (0.5 + i * 0.3) + Math.random() * W * 0.2, y: H * (0.16 + i * 0.07), s: u * (0.042 - i * 0.005), ph: Math.random() * 6, v: (0.55 + Math.random() * 0.25) * (u / 700) })),
        petals: Array.from({ length: V.pv ? 6 : 18 }, () => ({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6, r: u * (0.0035 + Math.random() * 0.003), v: 0.3 + Math.random() * 0.5 })),
        stars: Array.from({ length: V.pv ? 8 : 26 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.5, r: (0.4 + Math.random() * 0.8) * V.z, ph: Math.random() * 6 })) };
    }
    const { wy } = S, mx = W * 0.6, my = H * 0.27, mr = u * 0.072;
    const inkA = (a) => (L ? `rgba(43,48,56,${a})` : `rgba(5,8,12,${a})`);
    const mistT = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#b4c2de');
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // the sky: stars, the moon with its halo (a red sun on a light page)
    if (!L) for (const s of st.stars) { s.ph += 0.025; ctx.fillStyle = `rgba(226,232,255,${0.1 + 0.2 * Math.sin(s.ph) ** 2})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    K.glow(ctx, mx, my, u * (L ? 0.5 : 0.9), L ? [[0, 'rgba(222,84,56,0.14)'], [1, 'rgba(222,84,56,0)']] : [[0, 'rgba(176,196,240,0.2)'], [0.4, 'rgba(160,182,232,0.08)'], [1, 'rgba(160,182,232,0)']]);
    ctx.globalAlpha = L ? 0.6 : 0.86; ctx.drawImage(orb(L), mx - mr * 1.02, my - mr * 1.02, mr * 2.04, mr * 2.04); ctx.globalAlpha = 1;
    if (!L) { ctx.strokeStyle = 'rgba(214,224,255,0.035)'; for (const lw of [0.018, 0.009]) { ctx.lineWidth = u * lw; ctx.beginPath(); ctx.arc(mx, my, mr * 2.3, 0, 7); ctx.stroke(); } }

    ctx.drawImage(S.back, 0, 0, W, H); // washes: they lie over the sky's glow
    K.mist(ctx, mistT, W, wy - u * 0.17, u * 0.2, u * 1.7, t * 0.16, L ? 0.75 : 0.13);
    K.put(ctx, S.hills, W, H, 1);

    // the water: the light lying on it, ripples, a boat
    const wh = H - wy;
    for (let i = 0; i < 15; i++) {
      const k = (i + 0.5) / 15, y = wy + u * 0.014 + wh * k * 0.96, ww = mr * (0.5 + 2.6 * k) * (0.7 + 0.3 * Math.sin(t * 0.06 + i * 2.1));
      const a = (L ? 0.3 : 0.34) * (1 - k * 0.55) * (0.55 + 0.45 * Math.sin(t * 0.09 + i * 1.7));
      ctx.strokeStyle = L ? `rgba(206,64,46,${a})` : `rgba(255,240,206,${a})`; ctx.lineWidth = Math.max(1, u * 0.0022 * (1 + k));
      const x = mx + Math.sin(t * 0.03 + i * 1.3) * ww * 0.14;
      ctx.beginPath(); ctx.moveTo(x - ww, y); ctx.lineTo(x + ww, y); ctx.stroke();
    }
    ctx.lineWidth = Math.max(0.8, u * 0.0014);
    for (let i = 0; i < 26; i++) {
      const k = (i * 0.618) % 1, y = wy + u * 0.02 + wh * k, len = u * (0.02 + 0.05 * ((i * 7) % 5) / 5) * (0.5 + k);
      const x = ((i * 137.5 + t * 0.06 * (1 + (i % 3))) % (W + 200)) - 100;
      ctx.strokeStyle = L ? `rgba(43,48,56,${0.1 + 0.08 * k})` : `rgba(186,202,232,${0.07 + 0.07 * k})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
    const bx = W * (0.5 + 0.13 * Math.sin(t * 0.0011)), by = wy + u * 0.07 + Math.sin(t * 0.04) * u * 0.0012, bs = u * 0.036;
    ctx.fillStyle = inkA(L ? 0.5 : 0.85); ctx.strokeStyle = inkA(L ? 0.5 : 0.85);
    ctx.beginPath(); ctx.moveTo(bx - bs, by - bs * 0.1); ctx.quadraticCurveTo(bx, by + bs * 0.42, bx + bs, by - bs * 0.1); ctx.quadraticCurveTo(bx, by + bs * 0.1, bx - bs, by - bs * 0.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - bs * 0.2, by + bs * 0.05); ctx.lineTo(bx - bs * 0.1, by - bs * 0.36); ctx.lineTo(bx + bs * 0.06, by + bs * 0.05); ctx.closePath(); ctx.fill(); // the boatman
    ctx.beginPath(); ctx.moveTo(bx - bs * 0.32, by - bs * 0.34); ctx.lineTo(bx - bs * 0.1, by - bs * 0.52); ctx.lineTo(bx + bs * 0.12, by - bs * 0.34); ctx.closePath(); ctx.fill(); // his hat
    ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.beginPath(); ctx.moveTo(bx + bs * 0.1, by - bs * 0.62); ctx.lineTo(bx + bs * 0.62, by + bs * 0.3); ctx.stroke(); // the pole
    K.mist(ctx, mistT, W, wy - u * 0.035, u * 0.12, u * 1.3, -t * 0.24 + 300, L ? 0.6 : 0.12);

    // the cliff and the pavilion, a lamp burning inside it
    K.put(ctx, S.mid, W, H, L ? 0.5 : 0.88);
    if (!L) { ctx.globalAlpha = 0.26; ctx.drawImage(S.rim, 0, 0, W, H); ctx.globalAlpha = 1; }
    const la = 0.75 + 0.25 * Math.sin(t * 0.09) * Math.sin(t * 0.023);
    K.glow(ctx, S.px, S.py - u * 0.05, u * 0.07, [[0, `rgba(255,${L ? 150 : 196},${L ? 60 : 110},${(L ? 0.55 : 0.5) * la})`], [0.35, `rgba(255,170,80,${0.16 * la})`], [1, 'rgba(255,160,70,0)']]);

    // petals on the wind
    for (const p of st.petals) {
      p.ph += 0.035; p.x -= p.v * (u / 700) * (1 + 0.4 * Math.sin(p.ph * 0.6)); p.y += (0.22 + 0.2 * Math.sin(p.ph)) * (u / 700);
      if (p.x < -10 || p.y > H + 10) { p.x = W + 10 + Math.random() * W * 0.2 - (p.y > H + 10 ? Math.random() * W : 0); p.y = p.y > H + 10 ? -10 : Math.random() * H * 0.8; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ph);
      ctx.fillStyle = L ? 'rgba(214,96,120,0.5)' : 'rgba(255,196,208,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55 * Math.abs(Math.cos(p.ph * 0.7)) + p.r * 0.2, 0, 0, 7); ctx.fill();
      ctx.restore();
    }

    // cranes: they pass behind nothing but the eave
    for (const c of st.cranes) {
      c.x -= c.v; c.ph += 0.11; c.y += Math.sin(c.ph * 0.23) * 0.12;
      if (c.x < -u * 0.1) { c.x = W + u * (0.1 + Math.random() * 0.5); c.y = H * (0.12 + Math.random() * 0.26); }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-0.05);
      crane(ctx, c.s, Math.sin(c.ph), L ? 'rgba(43,48,56,0.5)' : 'rgba(236,240,250,0.8)', L ? 'rgba(30,34,40,0.62)' : 'rgba(150,162,190,0.75)', L ? 'rgba(206,56,44,0.9)' : 'rgba(240,84,70,0.95)');
      ctx.restore();
    }

    // the eave, its wind chime, and the silk lantern hanging from it
    K.put(ctx, S.near, W, H, L ? 0.52 : 0.92);
    const sw = Math.sin(t * 0.021) * 0.07 + Math.sin(t * 0.05 + 1) * 0.025, ls = u * 0.05;
    ctx.save(); ctx.translate(S.chime[0], S.chime[1]); ctx.rotate(sw * 1.5);
    ctx.strokeStyle = inkA(L ? 0.55 : 0.9); ctx.fillStyle = inkA(L ? 0.55 : 0.9); ctx.lineWidth = Math.max(0.8, u * 0.0014);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, u * 0.022); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.004, u * 0.022); ctx.lineTo(u * 0.004, u * 0.022); ctx.lineTo(u * 0.009, u * 0.04); ctx.lineTo(-u * 0.009, u * 0.04); ctx.closePath(); ctx.fill(); // the bell
    ctx.translate(0, u * 0.04); ctx.rotate(sw * 2.4);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, u * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, u * 0.03, u * 0.0045, u * 0.011, 0, 0, 7); ctx.fill(); // the fish that catches the wind
    ctx.beginPath(); ctx.moveTo(0, u * 0.038); ctx.lineTo(-u * 0.006, u * 0.049); ctx.lineTo(u * 0.006, u * 0.049); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.save(); ctx.translate(S.lantern[0], S.lantern[1]); ctx.rotate(sw);
    ctx.strokeStyle = inkA(L ? 0.55 : 0.9); ctx.lineWidth = Math.max(0.8, u * 0.0016);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, ls * 0.5); ctx.stroke();
    const top = ls * 0.5, bw = ls * 0.34, bh = ls * 1.05, lg = 0.8 + 0.2 * Math.sin(t * 0.11) * Math.sin(t * 0.031);
    K.glow(ctx, 0, top + bh * 0.5, ls * 1.9, [[0, `rgba(255,186,110,${(L ? 0.22 : 0.26) * lg})`], [1, 'rgba(255,170,90,0)']]);
    const body = new Path2D();
    body.moveTo(-bw * 0.62, top + ls * 0.07);
    body.bezierCurveTo(-bw * 1.25, top + bh * 0.3, -bw * 1.25, top + bh * 0.72, -bw * 0.62, top + bh);
    body.lineTo(bw * 0.62, top + bh);
    body.bezierCurveTo(bw * 1.25, top + bh * 0.72, bw * 1.25, top + bh * 0.3, bw * 0.62, top + ls * 0.07);
    body.closePath();
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = L ? 'rgba(200,52,52,0.8)' : 'rgba(216,62,62,0.88)'; ctx.fillRect(-bw * 1.3, top, bw * 2.6, bh * 0.53);
    ctx.fillStyle = L ? 'rgba(44,84,176,0.8)' : 'rgba(62,104,200,0.88)'; ctx.fillRect(-bw * 1.3, top + bh * 0.53, bw * 2.6, bh * 0.6);
    K.glow(ctx, 0, top + bh * 0.52, bw * 1.5, [[0, `rgba(255,232,170,${0.6 * lg})`], [1, 'rgba(255,220,150,0)']]);
    ctx.restore();
    ctx.strokeStyle = inkA(L ? 0.4 : 0.5); ctx.lineWidth = Math.max(0.6, u * 0.001);
    for (const k of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(bw * 0.62 * k * 1.1, top + ls * 0.07); ctx.bezierCurveTo(bw * 1.25 * k * 1.5, top + bh * 0.3, bw * 1.25 * k * 1.5, top + bh * 0.72, bw * 0.62 * k * 1.1, top + bh); ctx.stroke(); }
    ctx.fillStyle = inkA(L ? 0.6 : 0.92);
    ctx.fillRect(-bw * 0.72, top, bw * 1.44, ls * 0.08); ctx.fillRect(-bw * 0.72, top + bh - ls * 0.01, bw * 1.44, ls * 0.07);
    ctx.strokeStyle = L ? 'rgba(200,52,52,0.8)' : 'rgba(226,80,80,0.85)'; ctx.lineWidth = Math.max(0.8, u * 0.0018);
    for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(bw * k * 0.5, top + bh + ls * 0.06); ctx.quadraticCurveTo(bw * k, top + bh + ls * 0.3, bw * k * 0.9 - sw * ls * 2, top + bh + ls * 0.52); ctx.stroke(); } // the tassel
    ctx.restore();

    // reeds in the near corner, leaning with the wind
    ctx.strokeStyle = inkA(L ? 0.46 : 0.86); ctx.fillStyle = inkA(L ? 0.46 : 0.86);
    for (let i = 0; i < (V.pv ? 6 : 15); i++) {
      const x0 = W - u * 0.3 * ((i * 0.618 + 0.11) % 1) + u * 0.03, hh = u * (0.11 + 0.15 * ((i * 0.37) % 1)), lean = u * (0.02 + 0.03 * ((i * 0.53) % 1)) + Math.sin(t * 0.03 + i * 0.9) * u * 0.012 + sw * u * 0.1;
      const x1 = x0 - lean, y1 = H - hh;
      ctx.lineWidth = Math.max(1, u * 0.0022); ctx.beginPath(); ctx.moveTo(x0, H + 4); ctx.quadraticCurveTo(x0, H - hh * 0.55, x1, y1); ctx.stroke();
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(Math.atan2(-hh * 0.45, -lean) + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, -u * 0.016, u * 0.0042, u * 0.02, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };
})();
