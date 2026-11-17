'use strict';
/*
 * 지옥: a horned skull carved into the far wall, a river of half-cooled lava running out of its mouth,
 * volcanoes smoking behind it, fire geysers, embers and ash, chains swaying from a ceiling of stalactites.
 */
(function () {
  const K = window.SceneKit;

  /** A smooth open line through points (quadratic through the midpoints). */
  function through(c, pts, move = true) {
    if (move) c.moveTo(pts[0][0], pts[0][1]); else c.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }

  /** The lava's surface: a dark crust with glowing cracks, as a sheet that repeats vertically, plus half- and quarter-size copies. */
  function lavaSheet(L) {
    const key = `lavaSheet${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const T = 256, c = K.mk(T * 3, T * 4), x = c.getContext('2d');
    x.fillStyle = L ? '#e2662c' : '#641205'; x.fillRect(0, 0, c.width, c.height); // opaque: strips can overlap without doubling up
    const lay = (tex, color, size, a) => { const tt = K.tint(tex, color); x.globalAlpha = a; for (let j = 0; j < c.height; j += size) for (let i = 0; i < c.width; i += size) x.drawImage(tt, i, j, size, size); x.globalAlpha = 1; };
    x.globalCompositeOperation = L ? 'source-over' : 'lighter';
    lay(K.noiseTex('lavaB', 256, 256, { px: 4, py: 4, oct: 3, lo: 0.56, hi: 0.82, seed: 43 }), L ? '#ffb060' : '#ff6a1a', T, L ? 0.4 : 0.22);
    lay(K.noiseTex('lavaV1', 256, 256, { px: 5, py: 5, oct: 3, vein: 0.045, warp: 0.8, seed: 41 }), L ? '#fff0a8' : '#ffb648', T, L ? 0.85 : 0.66);
    lay(K.noiseTex('lavaV2', 256, 256, { px: 7, py: 7, oct: 2, vein: 0.04, seed: 47 }), L ? '#ffe090' : '#ff8a2a', T / 2, L ? 0.5 : 0.32);
    const mips = [c];
    for (const k of [2, 4]) { const d = K.mk(c.width / k, c.height / k), y = d.getContext('2d'); y.imageSmoothingQuality = 'high'; y.drawImage(mips[mips.length - 1], 0, 0, d.width, d.height); mips.push(d); }
    K.cache.set(key, mips);
    return mips;
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(13);
    const cx = W * 0.5, hz = H * 0.6, s = u * 0.15, sy = hz - s * 0.55;
    const ink = L ? '#3a2e2e' : '#070202';
    const [far, f] = K.layer(W, H, bg.dpr), [gate, g] = K.layer(W, H, bg.dpr), [rock, k] = K.layer(W, H, bg.dpr), [top, q] = K.layer(W, H, bg.dpr);
    for (const c of [f, g, k, q]) { c.fillStyle = ink; c.strokeStyle = ink; }

    // far: volcanic peaks
    f.globalAlpha = 0.6; K.fillRidge(f, K.ridge(R, 128, 0.66), -10, W + 10, hz + u * 0.02, u * 0.34, H + 2);
    f.globalAlpha = 1; K.fillRidge(f, K.ridge(R, 128, 0.6), -10, W + 10, hz + u * 0.06, u * 0.22, H + 2);

    // two volcanoes behind the wall: the cone, and the courses its lava takes down the slope
    const volc = [[W * 0.845, 0.3, 0.2], [W * 0.15, 0.21, 0.15]].map(([vx, vh, vw]) => {
      const by = hz + u * 0.1, ty = by - u * vh, cw = u * vh * 0.085, bw = u * vw * 1.65;
      f.beginPath(); f.moveTo(vx - bw, by + 2);
      f.bezierCurveTo(vx - bw * 0.45, by - u * vh * 0.3, vx - cw * 2.4, ty + u * vh * 0.2, vx - cw, ty);
      f.quadraticCurveTo(vx, ty + cw * 0.55, vx + cw, ty - cw * 0.12);
      f.bezierCurveTo(vx + cw * 2.6, ty + u * vh * 0.22, vx + bw * 0.5, by - u * vh * 0.26, vx + bw, by + 2);
      f.closePath(); f.fill();
      const half = (q) => cw + (bw * 0.62 - cw) * Math.pow(q, 1.5); // the slope's half-width a fraction q of the way down
      const rills = [[-1, 0.78, 0.5], [1, 0.62, 0.42], [1, 0.36, 0.75]].map(([d, len, lean]) => {
        const pts = []; let k = lean;
        for (let i = 0; i <= 7; i++) { const q = (i / 7) * len; k += (R() - 0.5) * 0.16; pts.push([vx + d * half(q) * Math.max(0.15, Math.min(0.9, k)), ty + cw * 0.3 + (by - ty) * q]); }
        return pts;
      });
      return { x: vx, y: ty, cw, rills, h: u * vh };
    });

    // the wall, lower where the skull stands, and the skull itself
    const mouthB = sy + s * 1.05, hts = K.ridge(R, 128, 0.62);
    const wallY = (x, i) => hz + u * 0.03 - u * 0.17 * hts[i] * Math.min(1, 0.35 + (Math.abs(x - cx) / (s * 2.4)) * 0.5);
    g.beginPath(); g.moveTo(-10, H + 10);
    for (let i = 0; i <= 128; i++) { const x = -10 + ((W + 20) * i) / 128; g.lineTo(x, wallY(x, i)); }
    g.lineTo(W + 10, H + 10); g.closePath(); g.globalAlpha = 0.7; g.fill(); g.globalAlpha = 1; // a shade lighter than the skull standing in it
    g.beginPath();
    g.moveTo(cx - s * 0.62, sy + s * 1.06);
    g.quadraticCurveTo(cx - s * 0.7, sy + s * 0.55, cx - s * 0.98, sy + s * 0.3);
    g.bezierCurveTo(cx - s * 1.25, sy - s * 0.9, cx + s * 1.25, sy - s * 0.9, cx + s * 0.98, sy + s * 0.3);
    g.quadraticCurveTo(cx + s * 0.7, sy + s * 0.55, cx + s * 0.62, sy + s * 1.06);
    g.closePath(); g.fill();
    for (const d of [-1, 1]) { // horns
      g.beginPath(); g.moveTo(cx + d * s * 0.62, sy - s * 0.42);
      g.bezierCurveTo(cx + d * s * 1.5, sy - s * 0.75, cx + d * s * 1.78, sy - s * 1.5, cx + d * s * 1.3, sy - s * 2.1);
      g.bezierCurveTo(cx + d * s * 1.45, sy - s * 1.45, cx + d * s * 1.2, sy - s * 0.95, cx + d * s * 0.9, sy - s * 0.2);
      g.closePath(); g.fill();
    }
    // the lava's bed: the arch of the mouth, then the river widening toward us. Every layer in front is cut to this
    // one shape, so the lava never has to show through a translucent silhouette.
    const mw = s * 0.46, mt = sy + s * 0.82, ma = sy + s * 0.62, y1 = mouthB - s * 0.16, N = 9, left = [], right = [];
    for (let j = 0; j <= N; j++) {
      const p = j / N, yy = y1 + (H + u * 0.06 - y1) * Math.pow(p, 1.25), hw = mw + (W * 0.62 - mw) * Math.pow(p, 1.7), off = Math.sin(p * 4.4 + 0.6) * u * 0.06 * p;
      left.push([cx + off - hw + (R() - 0.5) * u * 0.03 * p, yy]); right.push([cx + off + hw + (R() - 0.5) * u * 0.03 * p, yy]);
    }
    const river = new Path2D();
    river.moveTo(cx - mw, y1); river.lineTo(cx - mw, mt); river.quadraticCurveTo(cx, ma, cx + mw, mt);
    through(river, right, false);
    through(river, left.slice().reverse(), false);
    river.closePath();
    g.globalCompositeOperation = 'destination-out'; // sockets, nose, and the mouth with its river: the fire shows through
    for (const d of [-1, 1]) { g.beginPath(); g.ellipse(cx + d * s * 0.42, sy + s * 0.02, s * 0.27, s * 0.2, d * 0.38, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(cx, sy + s * 0.27); g.quadraticCurveTo(cx - s * 0.16, sy + s * 0.52, cx - s * 0.1, sy + s * 0.58); g.lineTo(cx, sy + s * 0.5); g.lineTo(cx + s * 0.1, sy + s * 0.58); g.quadraticCurveTo(cx + s * 0.16, sy + s * 0.52, cx, sy + s * 0.27); g.fill();
    g.fill(river);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 7; i++) { // teeth
      const tt = (i + 0.5) / 7, xq = cx - s * 0.46 + s * 0.92 * tt, yq = sy + s * ((1 - tt) * (1 - tt) * 0.82 + 2 * (1 - tt) * tt * 0.62 + tt * tt * 0.82);
      g.beginPath(); g.moveTo(xq - s * 0.062, yq - 1); g.lineTo(xq + s * 0.062, yq - 1); g.lineTo(xq, yq + s * (0.1 + (i % 2) * 0.05)); g.closePath(); g.fill();
    }

    // near: the banks. They sink to the river where it leaves the mouth, and the river is cut out of them.
    const top2 = K.ridge(R, 64, 0.6);
    k.beginPath(); k.moveTo(-10, H + 10);
    for (let i = 0; i <= 64; i++) {
      const x = -10 + ((W + 20) * i) / 64, m = Math.min(1, Math.max(0, (Math.abs(x - cx) - mw) / (s * 0.9)));
      k.lineTo(x, y1 + s * 0.03 - (s * 0.07 + top2[i] * s * 0.22) * m * (2 - m));
    }
    k.lineTo(W + 10, H + 10); k.closePath(); k.fill();
    k.globalCompositeOperation = 'destination-out'; k.fill(river); k.globalCompositeOperation = 'source-over';
    for (const [ix, ip, iw] of [[0.12, 0.4, 0.05], [-0.2, 0.68, 0.075], [0.3, 0.86, 0.06]]) { // rocks standing in the flow
      const yy = y1 + (H - y1) * ip, x = cx + u * ix, rw = u * iw;
      K.rock(k, R, [[x - rw, yy + rw * 0.25], [x - rw * 0.5, yy - rw * 0.3], [x + rw * 0.4, yy - rw * 0.36], [x + rw, yy + rw * 0.2], [x + rw * 0.3, yy + rw * 0.42], [x - rw * 0.5, yy + rw * 0.4]], rw * 0.12);
    }
    k.save(); k.lineWidth = Math.max(1.5, u * 0.0035); k.strokeStyle = L ? 'rgba(255,120,40,0.9)' : 'rgba(255,150,60,0.9)'; k.shadowColor = 'rgba(255,90,20,0.9)'; k.shadowBlur = u * 0.018;
    for (const side of [left, right]) { k.beginPath(); through(k, side); k.stroke(); }
    k.restore();

    // the ceiling: stalactites, longest toward the sides
    for (let x = -u * 0.03; x < W + u * 0.03;) {
      const wd = u * (0.025 + R() * 0.06), edge = Math.min(1, Math.abs(x + wd / 2 - W / 2) / (W / 2)), len = u * (0.025 + R() * 0.08 + edge * edge * 0.17);
      q.beginPath(); q.moveTo(x - 1, -2); q.lineTo(x + wd * (0.4 + R() * 0.2), len); q.lineTo(x + wd + 1, -2); q.closePath(); q.fill();
      x += wd * (0.75 + R() * 0.3);
    }
    // the bed in perspective: its centre and half-width at a given height
    const D = H + u * 0.06 - y1;
    const bed = (y) => { const pp = Math.pow(Math.max(0, Math.min(1, (y - y1) / D)), 1 / 1.25); return [cx + Math.sin(pp * 4.4 + 0.6) * u * 0.06 * pp, mw + (W * 0.62 - mw) * Math.pow(pp, 1.7)]; };
    return { far, gate, rock, top, river, bed, D, mw, ma, cx, hz, s, sy, y1, volc, geysers: [[cx - u * 0.05, y1 + (H - y1) * 0.3], [cx + u * 0.2, y1 + (H - y1) * 0.62], [cx - u * 0.26, y1 + (H - y1) * 0.85]] };
  }

  window.drawHell = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.42, 1.6), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'hell' || st.key !== S.key) st = bg.st = { kind: 'hell', key: S.key, embers: [], sparks: [], ash: Array.from({ length: V.pv ? 8 : 34 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: (0.2 + Math.random() * 0.4) * (V.pv ? 0.4 : 1), ph: Math.random() * 6, r: (0.6 + Math.random() * 1.2) * V.z })), gey: S.geysers.map(() => ({ wait: 120 + Math.random() * 400, on: 0 })), flare: 0, plume: [], erupt: 300 + Math.random() * 400 };
    const { cx, s, sy, y1 } = S;
    const inkA = (a) => (L ? `rgba(58,46,46,${a})` : `rgba(7,2,2,${a})`);
    ctx.save(); ctx.translate(0, -V.oy);

    // the glow of the river on everything above it
    K.glow(ctx, cx, H, W * 0.75, L ? [[0, 'rgba(255,110,40,0.14)'], [1, 'rgba(255,110,40,0)']] : [[0, 'rgba(255,84,24,0.2)'], [0.5, 'rgba(220,50,14,0.07)'], [1, 'rgba(200,40,10,0)']], 1, (H * 0.6) / (W * 0.75));
    K.put(ctx, S.far, W, H, L ? 0.14 : 0.45);
    // the volcanoes: fire in the crater, lava creeping down, smoke going up
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    S.volc.forEach((v, vi) => {
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.03 + vi * 2);
      K.glow(ctx, v.x, v.y, v.h * 0.42, [[0, `rgba(255,${L ? 130 : 150},50,${(L ? 0.5 : 0.42) * pulse})`], [0.4, `rgba(255,90,30,${(L ? 0.2 : 0.14) * pulse})`], [1, 'rgba(255,80,20,0)']], 1, 0.8);
      v.rills.forEach((pts, i) => {
        const g = ctx.createLinearGradient(0, pts[0][1], 0, pts[pts.length - 1][1]);
        g.addColorStop(0, L ? 'rgba(244,120,40,0.8)' : 'rgba(255,150,60,0.62)'); g.addColorStop(0.6, L ? 'rgba(236,96,30,0.5)' : 'rgba(255,100,36,0.36)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, v.h * (i ? 0.011 : 0.016));
        ctx.beginPath(); through(ctx, pts); ctx.stroke();
        ctx.setLineDash([v.h * 0.07, v.h * 0.3]); ctx.lineDashOffset = -t * 0.16 - i * 37; // surges
        ctx.strokeStyle = L ? 'rgba(255,214,150,0.9)' : 'rgba(255,226,160,0.7)'; ctx.lineWidth *= 0.7;
        ctx.beginPath(); through(ctx, pts.slice(0, 6)); ctx.stroke();
        ctx.setLineDash([]);
      });
      if (!V.pv && Math.random() < 0.05) st.plume.push({ x: v.x + (Math.random() - 0.5) * v.cw, y: v.y - v.cw, r: v.cw * 1.2, life: 1, vx: 0.25 + Math.random() * 0.3, g: v.h * 0.0052 });
    });
    for (const p of st.plume) { p.y -= 0.95 * (u / 700); p.x += p.vx * (u / 700); p.r += p.g; p.life -= 0.006; K.glow(ctx, p.x, p.y, p.r, [[0, L ? `rgba(96,80,78,${0.1 * p.life})` : `rgba(120,34,20,${0.17 * p.life})`], [1, 'rgba(120,34,20,0)']]); }
    st.plume = st.plume.filter((p) => p.life > 0);
    if (!V.pv && --st.erupt <= 0) { // now and then one throws fire
      st.erupt = 420 + Math.random() * 700;
      const v = S.volc[Math.random() < 0.7 ? 0 : 1];
      for (let n = 0; n < 26; n++) st.sparks.push({ x: v.x + (Math.random() - 0.5) * v.cw, y: v.y, vx: (Math.random() - 0.5) * 2.2 * (u / 700), vy: -(2 + Math.random() * 3.6) * (u / 700), life: 1, r: 0.8 + Math.random() * 1.4 });
    }
    const smoke = K.tint(K.noiseTex('cloud5', 512, 128, { px: 5, py: 2, oct: 5, lo: 0.4, hi: 0.72, warp: 1.1, env: 'band', seed: 9 }), L ? '#7a6a68' : '#6a1a0e');
    K.band(ctx, smoke, W, H * 0.02, H * 0.42, u * 2, t * 0.25, L ? 0.16 : 0.18);
    K.band(ctx, smoke, W, H * 0.22, H * 0.36, u * 1.5, -t * 0.4 + 400, L ? 0.14 : 0.14);

    // the lava, inside its bed only. The surface is laid in perspective, strip by strip: fine and slow where it
    // leaves the mouth, broad and quick by the time it reaches us.
    const sheet = lavaSheet(L), yh = y1 - S.D * 0.55, A = 2.4 / (1 / (y1 - yh) - 1 / (H - yh));
    const qv = (y) => A / (y1 - yh) - A / (y - yh), fr = (t * 0.0034) % 1, sway = Math.sin(t * 0.006) * u * 0.006;
    ctx.save(); ctx.clip(S.river);
    // the throat: dark at the back, white-hot where the lava wells up, thin streams running down it
    const tg = ctx.createLinearGradient(0, S.ma, 0, y1 + s * 0.04);
    tg.addColorStop(0, L ? '#c4562a' : '#3c0602'); tg.addColorStop(1, L ? '#ffb458' : '#ff9a36');
    ctx.fillStyle = tg; ctx.fillRect(cx - S.mw - 1, S.ma - 1, S.mw * 2 + 2, y1 - S.ma + 2);
    ctx.fillStyle = L ? '#ffecb0' : '#ffd890';
    for (let i = 0; i < 7; i++) { const yy = S.ma + ((t * 1.3 + i * 29) % (y1 - S.ma)); ctx.fillRect(cx + (i - 3) * S.mw * 0.27 + Math.sin(i * 1.9) * S.mw * 0.06, yy, Math.max(1, u * 0.0016), s * 0.09); }
    for (let y = y1; y < H + 2;) {
      const dy = Math.max(1.5, Math.min(14, (y - yh) * 0.045)), [bc, hw] = S.bed(y + dy / 2), half = hw * 1.08 + 3;
      const mip = half * 2 < 192 ? 2 : half * 2 < 384 ? 1 : 0, k = 1 / (1 << mip);
      const sv0 = (qv(y) - fr + 1) * 256, sv1 = (qv(y + dy) - fr + 1) * 256;
      ctx.drawImage(sheet[mip], 0, sv0 * k, 768 * k, Math.max(0.6, (sv1 - sv0) * k), bc - half + sway * (hw / (W * 0.62)), y, half * 2, dy + 0.7);
      y += dy;
    }
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${L ? 0.42 : 0.26})`; ctx.fill(S.river); // thin it, all of a piece
    ctx.restore();
    K.glow(ctx, cx, y1 + s * 0.05, s * 1.15, L ? [[0, 'rgba(255,170,70,0.5)'], [1, 'rgba(255,120,40,0)']] : [[0, 'rgba(255,170,70,0.42)'], [0.5, 'rgba(255,100,30,0.14)'], [1, 'rgba(230,60,10,0)']], 1, 0.7); // hottest where it comes out

    // the fire behind the skull's eyes
    if (st.flare > 0) st.flare -= 0.02; else if (!V.pv && Math.random() < 0.002) st.flare = 1;
    const ea = 0.55 + 0.2 * Math.sin(t * 0.05) + 0.4 * Math.max(0, st.flare);
    for (const d of [-1, 1]) K.glow(ctx, cx + d * s * 0.42, sy + s * 0.04, s * 0.42, [[0, `rgba(255,${L ? 150 : 190},70,${Math.min(1, ea)})`], [0.5, `rgba(255,90,24,${Math.min(1, ea * 0.75)})`], [1, 'rgba(200,30,10,0)']]);
    K.glow(ctx, cx, sy + s * 0.45, s * 0.25, [[0, `rgba(255,110,30,${Math.min(1, ea * 0.7)})`], [1, 'rgba(200,30,10,0)']]);
    K.put(ctx, S.gate, W, H, L ? 0.26 : 0.86);
    for (const d of [-1, 1]) K.glow(ctx, cx + d * s * 0.42, sy + s * 0.04, s * 0.62, [[0, `rgba(255,120,40,${(L ? 0.2 : 0.26) * Math.min(1, ea)})`], [1, 'rgba(255,90,24,0)']]); // their light on the bone

    // imps wheeling round the horns
    ctx.fillStyle = inkA(L ? 0.55 : 0.92);
    for (let i = 0; i < 4; i++) { const a = t * 0.011 * (i % 2 ? -1 : 1) + i * 1.7; K.bat(ctx, cx + Math.cos(a) * s * (2 + i * 0.25), sy - s * 1.2 + Math.sin(a * 1.3) * s * 0.5, u * 0.0075, Math.sin(t * 0.42 + i)); }

    K.put(ctx, S.rock, W, H, L ? 0.4 : 0.92);

    // geysers of fire, embers on the updraft
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    S.geysers.forEach(([gx, gy], i) => {
      const gs = st.gey[i];
      if (gs.on > 0) {
        gs.on--;
        for (let n = 0; n < 3; n++) st.sparks.push({ x: gx + (Math.random() - 0.5) * u * 0.02, y: gy, vx: (Math.random() - 0.5) * 1.6 * (u / 700), vy: -(3.5 + Math.random() * 4.5) * (u / 700), life: 1, r: 1 + Math.random() * 2 });
        K.glow(ctx, gx, gy, u * 0.09, [[0, 'rgba(255,200,90,0.5)'], [1, 'rgba(255,100,30,0)']], 1, 1.6);
      } else if (!V.pv && --gs.wait <= 0) { gs.on = 24 + Math.random() * 20; gs.wait = 260 + Math.random() * 520; }
    });
    for (const p of st.sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.13 * (u / 700); p.life -= 0.013; ctx.fillStyle = `rgba(255,${Math.round(110 + 120 * p.life)},${Math.round(40 + 60 * p.life)},${Math.max(0, p.life)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    st.sparks = st.sparks.filter((p) => p.life > 0 && p.y < H + 10);
    if (st.embers.length < (V.pv ? 14 : 80) && Math.random() < 0.7) st.embers.push({ x: cx + (Math.random() - 0.5) * W * 0.9, y: y1 + Math.random() * (H - y1), vy: -(0.4 + Math.random() * 1.3) * (u / 700), life: 1, r: (0.7 + Math.random() * 1.6) * V.z, ph: Math.random() * 6 });
    for (const e of st.embers) { e.ph += 0.06; e.x += Math.sin(e.ph) * 0.5; e.y += e.vy; e.life -= 0.004; ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * e.life)},40,${Math.max(0, e.life) * (L ? 0.8 : 0.85)})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); }
    st.embers = st.embers.filter((e) => e.life > 0 && e.y > -10);
    ctx.globalCompositeOperation = 'source-over';

    // the ceiling and what hangs from it
    K.put(ctx, S.top, W, H, L ? 0.18 : 0.8);
    ctx.strokeStyle = inkA(L ? 0.4 : 0.9); ctx.lineWidth = Math.max(1, u * 0.0028);
    const lk = u * 0.016;
    for (const [fx, len, ph] of [[0.16, 0.3, 0], [0.83, 0.24, 2.1], [0.67, 0.15, 4]]) {
      ctx.save(); ctx.translate(W * fx, -2); ctx.rotate(Math.sin(t * 0.013 + ph) * 0.05);
      for (let y = 0, n = 0; y < u * len; y += lk * 0.8, n++) { ctx.beginPath(); if (n % 2) ctx.ellipse(0, y + lk / 2, lk * 0.26, lk / 2, 0, 0, 7); else { ctx.moveTo(0, y); ctx.lineTo(0, y + lk); } ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, u * len + lk * 0.9, lk * 0.7, -Math.PI / 2, Math.PI * 0.9); ctx.stroke();
      ctx.restore();
    }
    for (const a of st.ash) { // ash coming down
      a.ph += 0.03; a.y += a.v; a.x += Math.sin(a.ph) * 0.4;
      if (a.y > H + 4) { a.y = -4; a.x = Math.random() * W; }
      ctx.fillStyle = L ? 'rgba(90,70,66,0.45)' : 'rgba(150,96,84,0.4)';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
    }
    ctx.restore();
  };
})();
