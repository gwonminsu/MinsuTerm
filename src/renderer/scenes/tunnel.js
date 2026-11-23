'use strict';
/*
 * 시공간 터널: flying down a twisting tube of light. Its walls are rings of light (each brighter in some places than
 * others, so they read as light, not drawn circles) in a soft glow, with faint lines running along them; the tube
 * twists like a vortex, the near part turning fastest. Streaks of light race along the walls toward us and stretch
 * long as they sweep past the edges. The tube bends gently, so the glow at its far end drifts about the screen; the
 * near rings rush past soft and out of focus. The speed swells now and then into a rush (the view widens, the far
 * light brightens, the streaks multiply and lengthen) and eases off again, and every so often a pulse of light comes
 * down the tube and lights the walls as it passes. Accent colours.
 * On a light page it is drawn in deeper tones over the page (not inverted), and the far light clears the walls away.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('tunnel'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2;
  const ZN = 0.45, ZF = 30, GAP = 1; // the nearest and farthest ring drawn, and the spacing of the rings (in tube radii)
  const VORT = 1.15; // how much the tube twists toward us: a ring turns by VORT / (z + 0.6) as it comes
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);
  const WHITE = [255, 255, 255], INK = [0, 0, 0];

  /* the tube's centre line: two slow bends on each axis that never quite repeat */
  const pX = (u) => 2.2 * Math.sin(0.047 * u + 0.3) + 1.1 * Math.sin(0.113 * u + 2.1);
  const dX = (u) => 0.1034 * Math.cos(0.047 * u + 0.3) + 0.1243 * Math.cos(0.113 * u + 2.1);
  const pY = (u) => 1.5 * Math.sin(0.061 * u + 1.7) + 0.8 * Math.sin(0.097 * u + 4.0);
  const dY = (u) => 0.0915 * Math.cos(0.061 * u + 1.7) + 0.0776 * Math.cos(0.097 * u + 4.0);

  /** A ring of light: a thin bright line in a soft halo, its brightness wandering around it (knots, gaps). */
  function ringTex(col, L, seed, size) {
    const c = K.mk(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
    const h = size / 2, R = h * 0.88, cw = Math.max(0.7, size / 480), hw = size / 55, ext = hw * 3;
    const f = K.fbm(seed, 16, 4, 4), n = 2048, mod = new Float32Array(n);
    for (let i = 0; i < n; i++) mod[i] = 0.07 + 0.93 * sm(0.36, 0.74, f((i / n) * 16, 1.5)) ** 1.4; // knots of light with dim stretches and gaps between
    const core = L ? mix(col, INK, 0.3) : mix(col, WHITE, 0.55), halo = L ? mix(col, INK, 0.05) : col;
    for (let py = 0; py < size; py++) {
      const dy = py + 0.5 - h;
      if (Math.abs(dy) > R + ext) continue;
      for (let px = 0; px < size; px++) {
        const dx = px + 0.5 - h, r = Math.sqrt(dx * dx + dy * dy), e = r - R;
        if (e > ext || e < -ext) continue;
        const m = mod[((Math.atan2(dy, dx) / TAU + 0.5) * n) & (n - 1)];
        const a1 = Math.exp(-((e / cw) ** 2)), a2 = (L ? 0.16 : 0.3) * Math.exp(-((e / hw) ** 2)), a = Math.min(1, (a1 + a2) * m);
        if (a < 0.004) continue;
        const k = (py * size + px) * 4, wc = a1 / (a1 + a2 + 1e-6);
        d[k] = halo[0] + (core[0] - halo[0]) * wc; d[k + 1] = halo[1] + (core[1] - halo[1]) * wc; d[k + 2] = halo[2] + (core[2] - halo[2]) * wc; d[k + 3] = a * 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  /** The glow of the wall about a ring: a broad soft band, uneven around. */
  function bandTex(col, seed, size) {
    const c = K.mk(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
    const h = size / 2, R = h * 0.7, bw = h * 0.13, f = K.fbm(seed, 6, 4, 3), n = 1024, mod = new Float32Array(n);
    for (let i = 0; i < n; i++) mod[i] = 0.35 + 0.65 * sm(0.25, 0.8, f((i / n) * 6, 2.5));
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - h, dy = py + 0.5 - h, e = (Math.sqrt(dx * dx + dy * dy) - R) / bw;
      if (e > 3 || e < -3) continue;
      const a = Math.exp(-e * e) * mod[((Math.atan2(dy, dx) / TAU + 0.5) * n) & (n - 1)], k = (py * size + px) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  /** A streak of light: a trail that thickens and brightens to a hot head at its right end, in a soft glow. */
  function streakTex(col, L) {
    const W = 192, H = 24, c = K.mk(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    const hot = L ? mix(col, INK, 0.2) : mix(col, WHITE, 0.7);
    for (let px = 0; px < W; px++) {
      const f = (px + 0.5) / W, along = f ** 1.7 * (f > 0.94 ? 1 - ((f - 0.94) / 0.06) * 0.6 : 1), sg = H * (0.05 + 0.1 * f);
      for (let py = 0; py < H; py++) {
        const e = py + 0.5 - H / 2, core = Math.exp(-((e / sg) ** 2)), halo = 0.3 * Math.exp(-((e / (sg * 3)) ** 2)), a = Math.min(1, along * (core + halo));
        const wc = (core / (core + halo + 1e-6)) * f, k = (py * W + px) * 4;
        d[k] = col[0] + (hot[0] - col[0]) * wc; d[k + 1] = col[1] + (hot[1] - col[1]) * wc; d[k + 2] = col[2] + (hot[2] - col[2]) * wc; d[k + 3] = a * 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function radial(size, stops) {
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  }

  function init(w, h, L, pv, cols, key, old, t) {
    const size = pv ? 160 : 640, deep = (c) => mix(c, INK, 0.3);
    const st = {
      key, L, pv, cx: w / 2, cy: h / 2, F0: (pv ? 0.45 : 0.38) * Math.hypot(w, h), unit: Math.hypot(w, h) / 1650, cols,
      ring: [], band: [], ready: false,
      streak: cols.map((c) => streakTex(L ? deep(c) : mix(c, WHITE, 0.2), L)),
      glow: L
        ? radial(256, [[0, 'rgba(0,0,0,1)'], [0.25, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]) // light mode: it clears the walls away
        : radial(256, [[0, rgba(mix(cols[0], WHITE, 0.92), 1)], [0.07, rgba(mix(cols[0], WHITE, 0.8), 0.9)], [0.17, rgba(mix(cols[0], WHITE, 0.55), 0.55)], [0.3, rgba(mix(cols[0], WHITE, 0.25), 0.24)], [0.52, rgba(cols[1], 0.08)], [1, rgba(cols[1], 0)]]), // a soft white light, tinted, filling the far opening
      fill: L ? null : radial(128, [[0, rgba(mix(cols[0], WHITE, 0.75), 0.55)], [0.35, rgba(mix(cols[0], WHITE, 0.45), 0.3)], [0.7, rgba(cols[0], 0.08)], [1, rgba(cols[0], 0)]]), // the light filling the far tube
      tint: radial(128, L
        ? [[0, rgba(mix(cols[0], WHITE, 0.6), 0.3)], [0.4, rgba(mix(cols[0], WHITE, 0.7), 0.1)], [1, rgba(mix(cols[0], WHITE, 0.7), 0)]]
        : [[0, rgba(cols[1], 0.09)], [0.5, rgba(cols[0], 0.035)], [1, rgba(cols[0], 0)]]),
      // the motion carries over a rebuild (a resize or a theme change must not jump)
      s: old ? old.s : 200 + Math.random() * 400, roll: old ? old.roll : Math.random() * TAU, v: old ? old.v : 0.05,
      surge: old ? old.surge : null, nextSurge: old ? old.nextSurge : t + (pv ? 60 : 420 + Math.random() * 300),
      pulses: old ? old.pulses : [], nextPulse: old ? old.nextPulse : t + (pv ? 30 : 150 + Math.random() * 200),
      streaks: [], fade: old ? 1 : 0, old: old && old.ready ? old : null,
    };
    // the textures take a few ms each: one a frame (until then the old ones, if any, stand in)
    st.job = (function* () {
      for (let i = 0; i < 3; i++) { st.ring[i] = ringTex(L ? deep(cols[i]) : cols[i], L, 101 + i * 37, size); yield; }
      for (let i = 0; i < 3; i++) st.band[i] = bandTex(L ? deep(cols[i]) : cols[i], 211 + i * 19, pv ? 96 : 256);
    })();
    return st;
  }

  window.BG_EXT.tunnel = function (bg, ctx, w, h, t) {
    const L = K.light(), pv = h < 90, cols = accents();
    const key = `${w}x${h}${L ? 'L' : 'D'}${cols.map((c) => c.join(',')).join(';')}`;
    let st = bg.tn;
    if (!st || st.key !== key) st = bg.tn = init(w, h, L, pv, cols, key, st && st.pv === pv ? st : null, t);
    if (!st.ready) { const t0 = performance.now(); while (performance.now() - t0 < (pv ? 30 : 6)) if (st.job.next().done) { st.ready = true; st.old = null; break; } }
    const tx = st.ready ? st : st.old; // the textures to draw with
    st.fade = Math.min(1, st.fade + 0.04);
    const fd = tx ? st.fade : 0, dpr = bg.dpr || 1, unit = st.unit;

    // speed: a slow swell, and now and then a rush that builds, holds a moment and eases off
    if (!st.surge && t >= st.nextSurge) st.surge = { t0: t, dur: pv ? 90 : 150 + Math.random() * 110, k: 0.9 + Math.random() * 0.9 };
    let rush = 0;
    if (st.surge) {
      const p = (t - st.surge.t0) / st.surge.dur;
      if (p >= 1) { st.surge = null; st.nextSurge = t + (pv ? 150 : 480 + Math.random() * 600); } else rush = Math.sin(Math.PI * p) ** 2 * st.surge.k;
    }
    const want = 0.05 * (1 + 0.22 * Math.sin(t * 0.0041) * Math.sin(t * 0.0017 + 2)) * (1 + 1.5 * rush);
    st.v += (want - st.v) * 0.08;
    st.s += st.v;
    st.roll += 0.0016 + 0.001 * Math.sin(t * 0.0031); // the whole view turns slowly
    if (!fd) return;
    const s = st.s, roll = st.roll, cr = Math.cos(roll), sr = Math.sin(roll);
    const F = st.F0 * (1 - 0.07 * rush), cx = st.cx, cy = st.cy;
    const X0 = pX(s), Y0 = pY(s), DX = dX(s), DY = dY(s);
    /** Where the tube's centre is at depth z (on screen), and its scale there. */
    const centre = (z) => { const u = s + z, rx = pX(u) - X0 - DX * z, ry = pY(u) - Y0 - DY * z, k = F / z; return [cx + (rx * cr - ry * sr) * k, cy + (rx * sr + ry * cr) * k, k]; };
    const radius = (u) => 1 + 0.09 * Math.sin(0.31 * u + t * 0.011) + 0.05 * Math.sin(0.17 * u - t * 0.007); // the tube swells and narrows as it goes
    const twist = (z, u) => roll + 0.21 * u + VORT / (z + 0.6); // the near part of the tube turns fastest: a vortex
    const add = L ? 'source-over' : 'lighter';

    ctx.save();
    ctx.globalCompositeOperation = add;
    // the light far down the tube
    const [gx, gy] = centre(22), gr = Math.min(w, h) * (pv ? 0.42 : 0.3) * (1 + (L ? 0.35 : 0.45) * rush); // the light sits in the opening, where the last rings close in
    const T = Math.max(w, h) * (pv ? 0.9 : 0.75);
    if (!L) { ctx.globalAlpha = fd; ctx.drawImage(tx.tint, gx - T, gy - T, T * 2, T * 2); }

    // pulses of light coming down the tube
    if (t >= st.nextPulse) { st.pulses.push({ u: s + ZF + 2, v: 0.3 + Math.random() * 0.15 }); st.nextPulse = t + (pv ? 70 : 240 + Math.random() * 420); }
    for (let i = st.pulses.length - 1; i >= 0; i--) { st.pulses[i].u -= st.pulses[i].v; if (st.pulses[i].u < s + ZN * 0.5) st.pulses.splice(i, 1); }
    const lit = (u) => { let k = 0; for (const p of st.pulses) k += Math.exp(-(((u - p.u) / 1.6) ** 2)); return k; };

    // the rings, far to near: each a ring of light in the wall's soft glow, turned and squashed a little; the near ones soft
    const k0 = Math.ceil((s + ZN) / GAP), k1 = Math.floor((s + ZF) / GAP);
    for (let k = k1; k >= k0; k--) {
      const u = k * GAP, z = u - s, [x, y, sc] = centre(z), lu = lit(u);
      const a = fd * sm(ZN, 1.0, z) * (1 - sm(11, ZF, z)) * (L ? 0.95 : 0.55) * (0.8 + 0.4 * sm(1.5, 9, z)) * (1 + 1.8 * lu);
      if (a <= 0.004) continue;
      const sq = 1 + 0.06 * Math.sin(0.23 * u + t * 0.006), ang = twist(z, u) + ((k * 2.39) % TAU);
      const ci = ((k % 3) + 3) % 3, ca = Math.cos(ang), sa = Math.sin(ang);
      const place = (tex, rr) => { const R = (radius(u) * sc) / rr, hs = tex.width / 2; ctx.setTransform((dpr * ca * sq * R) / hs, (dpr * sa * sq * R) / hs, (-dpr * sa * R) / (sq * hs), (dpr * ca * R) / (sq * hs), dpr * x, dpr * y); ctx.drawImage(tex, -hs, -hs); };
      const ab = fd * sm(0.8, 2.2, z) * (1 - sm(9, 22, z)) * (L ? 0.06 : 0.16) * (1 + 1.2 * lu); // (on a light page only a trace: it would read as haze)
      if (ab > 0.004) { ctx.globalAlpha = Math.min(1, ab); place(tx.band[ci], 0.7); }
      ctx.globalAlpha = Math.min(1, a); place(tx.ring[ci], 0.88);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // faint lines along the walls, following the twist, drawn in depth bands so they fade into the distance
    // (two sets, every other line a little brighter; bands of light run down them toward us)
    const M = pv ? 10 : 20, NZ = pv ? 20 : 44, ZL = 0.5, q = Math.pow(ZF / ZL, 1 / NZ);
    let prev = null;
    ctx.lineCap = 'round';
    const lc = [L ? mix(cols[1], INK, 0.3) : mix(cols[1], WHITE, 0.25), L ? mix(cols[0], INK, 0.3) : mix(cols[0], WHITE, 0.4)];
    for (let j = 0; j <= NZ; j++) {
      const z = ZL * Math.pow(q, j), u = s + z, [x, y, sc] = centre(z), rr = radius(u) * sc, tw = twist(z, u) + 0.25 * Math.sin(0.2 * u);
      const pts = new Float32Array(M * 2);
      for (let m = 0; m < M; m++) { const an = tw + (m / M) * TAU; pts[m * 2] = x + Math.cos(an) * rr; pts[m * 2 + 1] = y + Math.sin(an) * rr; }
      if (prev) {
        const zm = z / Math.sqrt(q), um = s + zm, flow = 0.45 + 0.55 * Math.max(0, Math.sin(0.9 * um)) ** 3;
        const a = fd * sm(ZL, 1.3, zm) * (1 - sm(6, 22, zm)) * (L ? 0.4 : 0.26) * flow * (1 + 1.2 * lit(um));
        if (a > 0.004) {
          ctx.lineWidth = Math.max(0.5, Math.min(2.2, (pv ? 0.5 : 1.4) / zm));
          for (let set = 0; set < 2; set++) {
            ctx.strokeStyle = rgba(lc[set], Math.min(1, a * (set ? 1 : 0.55)));
            ctx.beginPath();
            for (let m = set; m < M; m += 2) { ctx.moveTo(prev[m * 2], prev[m * 2 + 1]); ctx.lineTo(pts[m * 2], pts[m * 2 + 1]); }
            ctx.stroke();
          }
        }
      }
      prev = pts;
    }

    // streaks of light racing along the walls toward us: they follow the twist, and stretch as they pass
    const want2 = Math.round((pv ? 10 : 64) * (0.7 + 0.5 * rush + 6 * Math.max(0, st.v - 0.05)));
    while (st.streaks.length < want2) st.streaks.push({ z: 6 + Math.random() * (ZF - 8), th: Math.random() * TAU, vs: 0.02 + Math.random() * 0.07, c: (Math.random() * 3) | 0, wd: 0.6 + Math.random() * 0.8, r: 0.88 + Math.random() * 0.1, al: 0.5 + Math.random() * 0.5 });
    for (let i = st.streaks.length - 1; i >= 0; i--) {
      const p = st.streaks[i];
      p.z -= st.v + p.vs;
      if (p.z < ZN * 0.8) { st.streaks.splice(i, 1); continue; }
      const len = 0.3 + (st.v + p.vs) * 15, z2 = p.z + len;
      const a = fd * p.al * sm(ZN * 0.8, 1.4, p.z) * (1 - sm(14, ZF - 4, p.z)) * (L ? 0.8 : 0.75);
      if (a <= 0.004) continue;
      const [hx0, hy0, hk] = centre(p.z), [tx0, ty0, tk] = centre(z2), ah = twist(p.z, s + p.z) + p.th, at = twist(z2, s + z2) + p.th;
      const hr = radius(s + p.z) * hk * p.r, tr = radius(s + z2) * tk * p.r;
      const hx = hx0 + Math.cos(ah) * hr, hy = hy0 + Math.sin(ah) * hr, tx2 = tx0 + Math.cos(at) * tr, ty2 = ty0 + Math.sin(at) * tr;
      const dx = hx - tx2, dy = hy - ty2, l = Math.hypot(dx, dy);
      if (l < 0.5) continue;
      const wdt = Math.max(pv ? 2.5 : 4, Math.min(30, ((pv ? 6 : 26) * unit * p.wd) / p.z)); // the sprite's glow is ~5x wider than its bright line
      const tex = tx.streak[p.c];
      ctx.setTransform((dpr * dx) / tex.width, (dpr * dy) / tex.width, (-dpr * (dy / l) * wdt) / tex.height, (dpr * (dx / l) * wdt) / tex.height, dpr * (tx2 + ((dy / l) * wdt) / 2), dpr * (ty2 - ((dx / l) * wdt) / 2));
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(tex, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // the far light itself, over the converging walls (on a light page it clears them away instead, and tints the page);
    // it fills the far part of the tube along its bend, brightest at the end, and brightens in a rush
    const pulse = 0.88 + 0.12 * Math.sin(t * 0.03);
    if (!L) for (const z of [8, 10.5, 13.5, 17, 21, 26]) {
      const [fx, fy, fk] = centre(z), fr = fk * 1.05;
      ctx.globalAlpha = Math.min(1, fd * (0.14 + 0.02 * z) * (1 + 0.6 * rush) * pulse);
      ctx.drawImage(tx.fill, fx - fr, fy - fr, fr * 2, fr * 2);
    }
    ctx.globalAlpha = fd * (L ? 0.85 : Math.min(1, 0.8 + 0.35 * rush)) * pulse;
    if (L) ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(tx.glow, gx - gr, gy - gr, gr * 2, gr * 2);
    if (L) { const Tl = gr * 1.6; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fd; ctx.drawImage(tx.tint, gx - Tl, gy - Tl, Tl * 2, Tl * 2); }
    ctx.restore();
  };
})();
