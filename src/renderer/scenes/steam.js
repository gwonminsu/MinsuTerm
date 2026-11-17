'use strict';
/*
 * 스팀펑크: a city of brass and steam. Gear trains turning in the corners, a clock tower keeping the real time,
 * works and chimneys in the haze, airships crossing the sky, a train on the iron viaduct, a gauge trembling on
 * a leaking pipe.
 */
(function () {
  const K = window.SceneKit;
  const TAU = Math.PI * 2;
  const INK = (L) => (L ? '#3b2f25' : '#0a0705');

  /** A gear as a sprite (pitch radius r, N teeth): toothed rim, spokes, hub, rivets; ink with brass edges. */
  function gearSprite(N, r, L, q) {
    const key = `gear|${N}|${Math.round(r * 4)}|${L}|${q}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const th = (4.4 * r) / N, R1 = r + th * 0.5, R0 = r - th * 0.5, size = (R1 + 3) * 2;
    const c = K.mk(size * q, size * q), x = c.getContext('2d');
    x.scale(q, q); x.translate(size / 2, size / 2);
    const brass = (a) => (L ? `rgba(150,96,36,${a})` : `rgba(255,186,96,${a})`), w = TAU / N;
    const rim = new Path2D();
    for (let i = 0; i < N; i++) {
      const a = i * w;
      for (const [da, rad] of [[-0.25, R0], [-0.14, R1], [0.14, R1], [0.25, R0]]) { const px = Math.cos(a + da * w) * rad, py = Math.sin(a + da * w) * rad; if (i === 0 && da === -0.25) rim.moveTo(px, py); else rim.lineTo(px, py); }
    }
    rim.closePath();
    x.fillStyle = INK(L); x.fill(rim);
    const ri = R0 - Math.max(th * 0.9, r * 0.1), rh = Math.max(r * 0.2, 3), sw = Math.max(r * 0.07, 1.5);
    x.globalCompositeOperation = 'destination-out';
    if (ri > rh * 2.2) { // open the web between the spokes
      const spokes = N >= 20 ? 6 : N >= 12 ? 5 : 4, mo = Math.asin(Math.min(1, sw / ri)), mi = Math.asin(Math.min(1, sw / (rh * 1.5)));
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * TAU, a1 = ((i + 1) / spokes) * TAU;
        if (a1 - mi <= a0 + mi) continue;
        x.beginPath(); x.arc(0, 0, ri, a0 + mo, a1 - mo); x.arc(0, 0, rh * 1.5, a1 - mi, a0 + mi, true); x.closePath(); x.fill();
      }
    } else for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; x.beginPath(); x.arc(Math.cos(a) * (ri + rh) * 0.5, Math.sin(a) * (ri + rh) * 0.5, Math.max(1, (ri - rh) * 0.24), 0, TAU); x.fill(); }
    x.beginPath(); x.arc(0, 0, rh * 0.36, 0, TAU); x.fill(); // the axle
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = brass(L ? 0.75 : 0.5); x.lineWidth = Math.max(0.8, r * 0.011); x.stroke(rim);
    x.strokeStyle = brass(L ? 0.5 : 0.3);
    for (const rad of [ri, rh * 1.5, rh * 0.36]) { x.beginPath(); x.arc(0, 0, rad, 0, TAU); x.stroke(); }
    x.fillStyle = brass(L ? 0.8 : 0.6);
    const nr = Math.max(6, Math.round(N / 2)), rr = (ri + R0) / 2;
    for (let i = 0; i < nr; i++) { const a = (i / nr) * TAU + 0.2; x.beginPath(); x.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(0.7, r * 0.014), 0, TAU); x.fill(); }
    const sp = { c, size, N, r };
    K.cache.set(key, sp);
    return sp;
  }

  /** An airship heading left: ribbed envelope, fins, a gondola with lit windows. */
  function shipSprite(len, L, q) {
    const key = `ship|${Math.round(len)}|${L}|${q}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const w = len * 1.12, h = len * 0.5, c = K.mk(w * q, h * q), x = c.getContext('2d');
    x.scale(q, q);
    const cy = h * 0.36, ry = len * 0.125, hull = new Path2D();
    hull.moveTo(len * 0.03, cy);
    hull.bezierCurveTo(len * 0.08, cy - ry * 1.3, len * 0.55, cy - ry * 1.2, len, cy);
    hull.bezierCurveTo(len * 0.55, cy + ry * 1.2, len * 0.08, cy + ry * 1.3, len * 0.03, cy);
    x.fillStyle = INK(L); x.strokeStyle = INK(L); x.fill(hull);
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(len * 0.82, cy + d * ry * 0.34); x.lineTo(len * 1.08, cy + d * ry * 1.1); x.lineTo(len * 1.1, cy + d * ry * 0.3); x.lineTo(len * 0.98, cy); x.closePath(); x.fill(); }
    x.save(); x.clip(hull); x.globalCompositeOperation = 'destination-out'; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = Math.max(0.6, len * 0.004);
    for (const k of [-0.62, -0.22, 0.22, 0.62]) { x.beginPath(); x.moveTo(len * 0.03, cy); x.bezierCurveTo(len * 0.08, cy + ry * 1.3 * k, len * 0.55, cy + ry * 1.2 * k, len, cy); x.stroke(); }
    for (let k = 1; k < 7; k++) { x.beginPath(); x.ellipse(len * (0.06 + k * 0.125), cy, len * 0.012, ry * 1.3, 0, 0, TAU); x.stroke(); }
    x.restore();
    const brass = (a) => (L ? `rgba(150,96,36,${a})` : `rgba(255,186,96,${a})`);
    x.strokeStyle = brass(L ? 0.5 : 0.34); x.lineWidth = Math.max(0.7, len * 0.005); x.stroke(hull); // the light along the hull
    if (!L) {
      x.save(); x.clip(hull); x.strokeStyle = brass(0.16); x.lineWidth = Math.max(0.6, len * 0.004);
      for (const k of [-0.62, -0.22, 0.22, 0.62]) { x.beginPath(); x.moveTo(len * 0.03, cy); x.bezierCurveTo(len * 0.08, cy + ry * 1.3 * k, len * 0.55, cy + ry * 1.2 * k, len, cy); x.stroke(); }
      for (let k = 1; k < 7; k++) { x.beginPath(); x.ellipse(len * (0.06 + k * 0.125), cy, len * 0.012, ry * 1.3, 0, 0, TAU); x.stroke(); }
      x.restore();
    }
    x.strokeStyle = INK(L);
    const gx0 = len * 0.36, gx1 = len * 0.6, gy = cy + ry * 1.28, gh = ry * 0.46;
    x.lineWidth = Math.max(0.6, len * 0.004);
    for (const k of [0, 0.33, 0.66, 1]) { x.beginPath(); x.moveTo(gx0 + (gx1 - gx0) * k, gy + 1); x.lineTo(gx0 + (gx1 - gx0) * (0.5 + (k - 0.5) * 1.5), cy + ry * 0.7); x.stroke(); }
    x.beginPath(); x.moveTo(gx0, gy); x.lineTo(gx1, gy); x.lineTo(gx1 - gh * 0.3, gy + gh); x.lineTo(gx0 + gh * 0.9, gy + gh); x.closePath(); x.fill();
    x.fillStyle = L ? 'rgba(196,120,40,0.85)' : 'rgba(255,196,110,0.9)';
    for (let k = 0; k < 5; k++) x.fillRect(gx0 + gh * 0.8 + k * ((gx1 - gx0 - gh * 1.4) / 5), gy + gh * 0.22, (gx1 - gx0) * 0.09, gh * 0.3);
    const sp = { c, w, h, prop: [gx1 + len * 0.012, gy + gh * 0.45], lamp: [gx0 + gh * 0.5, gy + gh * 0.6], cy };
    K.cache.set(key, sp);
    return sp;
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(1851), q = bg.dpr || 1, ink = INK(L);
    const lit = (a) => (L ? `rgba(196,120,40,${a})` : `rgba(255,178,84,${a})`);
    const [far, f] = K.layer(W, H, q), [mid, m] = K.layer(W, H, q), [via, v] = K.layer(W, H, q), [near, n] = K.layer(W, H, q);
    for (const c of [f, m, v, n]) { c.fillStyle = ink; c.strokeStyle = ink; c.lineCap = 'butt'; }
    const stacks = [];

    // far: works and chimneys in the haze
    for (let x = -u * 0.04; x < W;) {
      const bw = u * (0.08 + R() * 0.12), top = H * (0.76 - R() * 0.13), kind = R();
      f.fillRect(x, top, bw, H - top + 2);
      if (kind < 0.45) { // a saw-tooth roof
        const nT = Math.max(2, Math.round(bw / (u * 0.035)));
        for (let i = 0; i < nT; i++) { const x0 = x + (bw * i) / nT, x1 = x + (bw * (i + 1)) / nT; f.beginPath(); f.moveTo(x0, top + 1); f.lineTo(x0, top - u * 0.022); f.lineTo(x1, top + 1); f.closePath(); f.fill(); }
      } else if (kind < 0.7) { f.beginPath(); f.ellipse(x + bw / 2, top + 1, bw * 0.42, bw * 0.2, 0, Math.PI, 0); f.fill(); } // a gas holder
      if (R() < 0.75) { // a chimney, flared at the lip
        const cw = u * (0.012 + R() * 0.01), ch = H * (0.12 + R() * 0.2), cx = x + bw * (0.2 + R() * 0.6);
        f.beginPath(); f.moveTo(cx - cw * 0.78, top + 2); f.lineTo(cx - cw * 0.5, top - ch); f.lineTo(cx + cw * 0.5, top - ch); f.lineTo(cx + cw * 0.78, top + 2); f.closePath(); f.fill();
        f.fillRect(cx - cw * 0.72, top - ch - cw * 0.3, cw * 1.44, cw * 0.36);
        stacks.push([cx, top - ch - cw * 0.3, 0.7]);
      }
      x += bw + u * (0.006 + R() * 0.05);
    }

    // mid: houses, and the clock tower standing over them
    const house = (x, bw, top, o) => {
      m.fillStyle = ink; m.fillRect(x, top, bw, H - top + 2);
      if (o.roof === 0) { m.beginPath(); m.moveTo(x - u * 0.004, top + 1); m.lineTo(x + bw / 2, top - bw * 0.4); m.lineTo(x + bw + u * 0.004, top + 1); m.closePath(); m.fill(); }
      if (o.roof === 1) { m.beginPath(); m.moveTo(x, top + 1); m.lineTo(x + bw * 0.12, top - u * 0.03); m.lineTo(x + bw * 0.88, top - u * 0.03); m.lineTo(x + bw, top + 1); m.closePath(); m.fill(); }
      if (o.roof === 2) { m.beginPath(); m.ellipse(x + bw / 2, top + 1, bw * 0.4, bw * 0.34, 0, Math.PI, 0); m.fill(); m.fillRect(x + bw / 2 - 1, top - bw * 0.34 - u * 0.03, 2, u * 0.032); }
      if (o.chim) { const cx = x + bw * o.chim; m.fillRect(cx, top - u * 0.055, u * 0.014, u * 0.057); m.fillRect(cx - u * 0.003, top - u * 0.06, u * 0.02, u * 0.008); stacks.push([cx + u * 0.007, top - u * 0.06, 1]); }
      const ww = u * 0.013, wh = u * 0.025, cols = Math.max(1, Math.floor((bw - ww) / (ww * 2.1))), rows = Math.max(1, Math.floor((H * 0.92 - top - wh) / (wh * 1.7)));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { // arched windows, some of them lit
        if (R() > 0.4) continue;
        const wx = x + (bw - (cols - 1) * ww * 2.1 - ww) / 2 + c * ww * 2.1, wy = top + wh * 0.7 + r * wh * 1.7;
        m.fillStyle = lit(0.3 + R() * 0.5);
        m.beginPath(); m.moveTo(wx, wy + wh); m.lineTo(wx, wy + ww * 0.5); m.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0); m.lineTo(wx + ww, wy + wh); m.closePath(); m.fill();
      }
      m.fillStyle = ink;
    };
    for (let x = -u * 0.03; x < W;) {
      const bw = u * (0.09 + R() * 0.08);
      house(x, bw, H * (0.6 + R() * 0.13), { roof: (R() * 4) | 0, chim: R() < 0.5 ? 0.15 + R() * 0.6 : 0 });
      x += bw + u * (R() < 0.3 ? 0.02 : 0);
    }
    const gx = W * 0.6, tw = u * 0.085, tTop = H * 0.35, dialY = H * 0.45, dialR = u * 0.046;
    m.fillRect(gx - tw / 2, tTop, tw, H - tTop + 2);
    m.fillRect(gx - tw * 0.64, dialY - dialR * 1.45, tw * 1.28, dialR * 2.9); // the clock stage
    m.fillRect(gx - tw * 0.72, dialY - dialR * 1.45 - u * 0.008, tw * 1.44, u * 0.009);
    m.fillRect(gx - tw * 0.72, dialY + dialR * 1.45, tw * 1.44, u * 0.009);
    m.beginPath(); m.moveTo(gx - tw * 0.62, tTop + 1); m.lineTo(gx - tw * 0.22, tTop - u * 0.085); m.lineTo(gx, tTop - u * 0.2); m.lineTo(gx + tw * 0.22, tTop - u * 0.085); m.lineTo(gx + tw * 0.62, tTop + 1); m.closePath(); m.fill();
    m.fillRect(gx - 1, tTop - u * 0.24, 2, u * 0.05); m.beginPath(); m.arc(gx, tTop - u * 0.205, u * 0.006, 0, TAU); m.fill();
    for (const d of [-1, 1]) { m.beginPath(); m.moveTo(gx + d * tw * 0.66, tTop + 1); m.lineTo(gx + d * tw * 0.55, tTop - u * 0.05); m.lineTo(gx + d * tw * 0.44, tTop + 1); m.closePath(); m.fill(); }
    m.fillStyle = lit(0.6);
    for (let k = 0; k < 5; k++) m.fillRect(gx - u * 0.004, dialY + dialR * 1.9 + k * u * 0.04, u * 0.008, u * 0.022); // slits down the shaft
    m.fillStyle = ink;

    // the iron viaduct in front of them
    const dy = H * 0.72, td = u * 0.036, bay = u * 0.045;
    v.fillRect(-10, dy, W + 20, u * 0.007); v.fillRect(-10, dy + td, W + 20, u * 0.005);
    v.fillStyle = lit(L ? 0.5 : 0.34); v.fillRect(-10, dy, W + 20, Math.max(1, u * 0.0016)); v.fillStyle = ink; // the rail catching the light
    v.lineWidth = Math.max(1, u * 0.0028);
    for (let x = -bay; x < W + bay; x += bay) { v.beginPath(); v.moveTo(x, dy + 2); v.lineTo(x + bay, dy + td); v.moveTo(x + bay, dy + 2); v.lineTo(x, dy + td); v.moveTo(x, dy); v.lineTo(x, dy + td); v.stroke(); }
    v.lineWidth = Math.max(0.8, u * 0.0014);
    v.beginPath(); v.moveTo(-10, dy - u * 0.012); v.lineTo(W + 10, dy - u * 0.012); v.stroke();
    for (let x = 0; x < W; x += u * 0.016) { v.beginPath(); v.moveTo(x, dy - u * 0.012); v.lineTo(x, dy); v.stroke(); }
    for (let x = u * 0.2; x < W + u * 0.2; x += u * 0.44) {
      v.beginPath(); v.moveTo(x - u * 0.018, dy + td); v.lineTo(x - u * 0.03, H + 4); v.lineTo(x + u * 0.03, H + 4); v.lineTo(x + u * 0.018, dy + td); v.closePath(); v.fill();
      v.fillRect(x - u * 0.027, dy + td - 1, u * 0.054, u * 0.01);
    }

    // the train: an engine and four coaches, heading left
    const trH = u * 0.05, carL = u * 0.07, trL = u * 0.1 + 4 * (carL + u * 0.006), [train, tr] = K.layer(trL, trH, q);
    tr.fillStyle = ink; tr.strokeStyle = ink;
    const wheel = (x, r) => { tr.beginPath(); tr.arc(x, trH - r, r, 0, TAU); tr.fill(); };
    tr.beginPath(); tr.moveTo(0, trH); tr.lineTo(u * 0.014, trH - u * 0.016); tr.lineTo(u * 0.014, trH); tr.closePath(); tr.fill(); // cowcatcher
    tr.beginPath(); tr.roundRect(u * 0.012, trH - u * 0.034, u * 0.05, u * 0.024, u * 0.006); tr.fill();                        // boiler
    tr.fillRect(u * 0.021, trH - u * 0.046, u * 0.007, u * 0.014); tr.fillRect(u * 0.0185, trH - u * 0.049, u * 0.012, u * 0.004); // stack
    tr.beginPath(); tr.arc(u * 0.042, trH - u * 0.034, u * 0.006, Math.PI, 0); tr.fill();                                          // dome
    tr.fillRect(u * 0.058, trH - u * 0.044, u * 0.03, u * 0.034); tr.fillRect(u * 0.055, trH - u * 0.047, u * 0.036, u * 0.004);     // cab
    tr.fillRect(u * 0.012, trH - u * 0.012, u * 0.078, u * 0.004);
    wheel(u * 0.022, u * 0.0065); wheel(u * 0.038, u * 0.0065); wheel(u * 0.07, u * 0.0095);
    tr.fillStyle = lit(0.9); tr.fillRect(u * 0.064, trH - u * 0.039, u * 0.012, u * 0.011);
    for (let c = 0; c < 4; c++) {
      const x0 = u * 0.096 + c * (carL + u * 0.006);
      tr.fillStyle = ink; tr.fillRect(x0, trH - u * 0.038, carL, u * 0.028); tr.fillRect(x0 - u * 0.002, trH - u * 0.041, carL + u * 0.004, u * 0.004); tr.fillRect(x0 - u * 0.006, trH - u * 0.017, u * 0.006, u * 0.003);
      wheel(x0 + carL * 0.18, u * 0.006); wheel(x0 + carL * 0.82, u * 0.006);
      tr.fillStyle = lit(0.85);
      for (let k = 0; k < 5; k++) tr.fillRect(x0 + carL * (0.08 + k * 0.18), trH - u * 0.033, carL * 0.11, u * 0.011);
    }

    // near: a pipe along the bottom with a valve and a pressure gauge
    const py = H - u * 0.045, pt = u * 0.026, gX = W * 0.72, gY = H - u * 0.13, gR = u * 0.038, vX = W * 0.36, vY = H - u * 0.09, vR = u * 0.026;
    n.fillRect(-10, py, W + 20, pt);
    for (let x = u * 0.1; x < W; x += u * 0.24) n.fillRect(x - u * 0.006, py - u * 0.006, u * 0.012, pt + u * 0.012);
    n.fillRect(gX - u * 0.006, gY, u * 0.012, py - gY + 2);
    n.beginPath(); n.arc(gX, gY, gR * 1.17, 0, TAU); n.fill();
    n.globalCompositeOperation = 'destination-out'; n.beginPath(); n.arc(gX, gY, gR, 0, TAU); n.fill(); n.globalCompositeOperation = 'source-over';
    n.fillRect(vX - u * 0.004, vY, u * 0.008, py - vY + 2);
    n.lineWidth = Math.max(1.2, u * 0.005); n.beginPath(); n.arc(vX, vY, vR, 0, TAU); n.stroke();
    n.lineWidth = Math.max(1, u * 0.003);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + 0.3; n.beginPath(); n.moveTo(vX - Math.cos(a) * vR, vY - Math.sin(a) * vR); n.lineTo(vX + Math.cos(a) * vR, vY + Math.sin(a) * vR); n.stroke(); }
    n.beginPath(); n.arc(vX, vY, vR * 0.24, 0, TAU); n.fill();
    n.strokeStyle = lit(L ? 0.6 : 0.42); n.lineWidth = Math.max(0.8, u * 0.0016); n.beginPath(); n.arc(vX, vY, vR + u * 0.0018, 0, TAU); n.stroke(); n.strokeStyle = ink;
    n.fillStyle = lit(L ? 0.7 : 0.5);
    for (let x = u * 0.02; x < W; x += u * 0.03) { n.beginPath(); n.arc(x, py + pt * 0.5, Math.max(0.7, u * 0.0016), 0, TAU); n.fill(); } // rivets
    n.strokeStyle = lit(L ? 0.6 : 0.4); n.lineWidth = Math.max(0.8, u * 0.0016); n.beginPath(); n.arc(gX, gY, gR * 1.09, 0, TAU); n.stroke();

    // gear trains in the two bottom corners: each wheel meshes with the one before it
    const gears = [];
    const add = (N, parent, dir, x, y, r) => {
      const g = parent ? { N, r: (parent.r * N) / parent.N, parent, dir } : { N, r, x, y };
      if (parent) { g.x = parent.x + Math.cos(dir) * (parent.r + g.r); g.y = parent.y + Math.sin(dir) * (parent.r + g.r); }
      g.sp = gearSprite(N, g.r, L, q); gears.push(g);
      return g;
    };
    const A = add(26, null, 0, u * 0.07, H + u * 0.045, u * 0.2), B = add(14, A, -0.98), D = add(22, null, 0, W - u * 0.05, H + u * 0.03, u * 0.17);
    add(9, B, -0.12); add(12, D, -2.2);
    return { far, mid, via, near, train, trL, trH, stacks, gx, dialY, dialR, dy, gX, gY, gR, py, pt, gears, leak: [W * 0.52, py - u * 0.004] };
  }

  /** A dial set into a hole in its layer: a lit face, marks round the rim. */
  function face(ctx, x, y, r, L, marks) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, L ? 'rgba(250,238,206,0.8)' : 'rgba(255,220,150,0.6)'); g.addColorStop(1, L ? 'rgba(230,204,150,0.75)' : 'rgba(236,150,60,0.46)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = L ? 'rgba(59,47,37,0.8)' : 'rgba(10,7,5,0.88)'; ctx.lineCap = 'butt';
    for (const [a, big] of marks) { ctx.lineWidth = r * (big ? 0.07 : 0.035); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * (big ? 0.76 : 0.83), y + Math.sin(a) * r * (big ? 0.76 : 0.83)); ctx.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); ctx.stroke(); }
    ctx.restore();
  }
  function hand(ctx, x, y, a, len, wid, tail, style) {
    ctx.strokeStyle = style; ctx.lineWidth = wid; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * tail, y - Math.sin(a) * tail); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }

  window.drawSteampunk = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.62, 1.6), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'steampunk' || st.key !== S.key) {
      st = bg.st = { kind: 'steampunk', key: S.key, puffs: [], train: null, trainWait: 300 + Math.random() * 600, hiss: 0, hissWait: 200 + Math.random() * 300,
        ships: [{ x: W * 0.78, y: H * 0.17, len: u * 0.1, v: -0.1, a: 0.5 }, { x: W * 0.2, y: H * 0.3, len: u * 0.21, v: 0.17, a: 1 }] };
    }
    const k = u / 700, inkA = (a) => (L ? `rgba(59,47,37,${a})` : `rgba(10,7,5,${a})`), amber = (a) => (L ? `rgba(196,120,40,${a})` : `rgba(255,186,96,${a})`);
    const puff = (x, y, r, vx, vy, grow, fade, tone) => { if (st.puffs.length < 120) st.puffs.push({ x, y, r, vx, vy, grow, fade, life: 1, tone }); };
    ctx.save(); ctx.translate(0, -V.oy);

    // the glow of the furnaces on the haze
    K.glow(ctx, W * 0.5, H * 0.8, W * 0.75, L ? [[0, 'rgba(196,130,60,0.12)'], [1, 'rgba(196,130,60,0)']] : [[0, 'rgba(255,150,70,0.22)'], [0.5, 'rgba(230,110,50,0.08)'], [1, 'rgba(220,100,40,0)']], 1, (H * 0.36) / (W * 0.75));
    K.put(ctx, S.far, W, H, L ? 0.14 : 0.36);

    // airships: the far one small and faint, the near one below it
    for (const s of st.ships) {
      const sp = shipSprite(s.len, L, bg.dpr || 1), dir = s.v < 0 ? 1 : -1;
      s.x += s.v * k;
      if (s.x < -s.len * 1.3) s.x = W + s.len * 1.2; else if (s.x > W + s.len * 1.3) s.x = -s.len * 1.2;
      ctx.save(); ctx.translate(s.x, s.y + Math.sin(t * 0.012 + s.len) * u * 0.004); ctx.scale(dir, 1);
      K.stamp(ctx, sp.c, -sp.w / 2, -sp.cy, sp.w, sp.h, (L ? 0.36 : 0.84) * (0.55 + 0.45 * s.a));
      const pw = Math.abs(Math.sin(t * 0.6)) * s.len * 0.014 + 0.6;
      ctx.fillStyle = inkA((L ? 0.4 : 0.8) * s.a); ctx.beginPath(); ctx.ellipse(sp.prop[0] - sp.w / 2, sp.prop[1] - sp.cy, pw, s.len * 0.045, 0, 0, TAU); ctx.fill();
      K.glow(ctx, sp.lamp[0] - sp.w / 2, sp.lamp[1] - sp.cy, s.len * 0.09, [[0, amber(0.5 * s.a)], [1, amber(0)]]);
      ctx.restore();
    }

    // smoke from the chimneys
    if (!V.pv) for (const [x, y, sz] of S.stacks) if (Math.random() < 0.03) puff(x + (Math.random() - 0.5) * u * 0.004, y, u * 0.007 * sz, (0.1 + Math.random() * 0.16) * k, -(0.45 + Math.random() * 0.35) * k, u * 0.00034 * sz, 0.0055, 0);
    const drawPuffs = (tone) => {
      for (const p of st.puffs) {
        if (p.tone !== tone) continue;
        p.x += p.vx; p.y += p.vy; p.r += p.grow; p.life -= p.fade;
        const a = Math.min(1, p.life * 1.6) * Math.max(0, p.life) * (tone ? (L ? 0.2 : 0.16) : (L ? 0.1 : 0.1));
        K.glow(ctx, p.x, p.y, p.r, [[0, L ? `rgba(104,92,80,${a})` : tone ? `rgba(236,226,208,${a})` : `rgba(196,176,150,${a})`], [1, 'rgba(200,180,150,0)']]);
      }
    };
    drawPuffs(0);

    K.put(ctx, S.mid, W, H, L ? 0.34 : 0.84);

    // the clock keeps the real time
    const d = new Date(), sec = d.getSeconds() + d.getMilliseconds() / 1000, tick = Math.floor(sec) + (sec % 1 < 0.12 ? (sec % 1) / 0.12 - 1 : 0); // the second hand jumps, then rests
    K.glow(ctx, S.gx, S.dialY, S.dialR * 2.6, [[0, amber(L ? 0.12 : 0.2)], [1, amber(0)]]);
    face(ctx, S.gx, S.dialY, S.dialR, L, Array.from({ length: 12 }, (_, i) => [(i / 12) * TAU, i % 3 === 0]));
    const hs = L ? 'rgba(59,47,37,0.9)' : 'rgba(10,7,5,0.92)';
    hand(ctx, S.gx, S.dialY, ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * TAU - Math.PI / 2, S.dialR * 0.5, S.dialR * 0.1, S.dialR * 0.1, hs);
    hand(ctx, S.gx, S.dialY, (d.getMinutes() + sec / 60) / 60 * TAU - Math.PI / 2, S.dialR * 0.76, S.dialR * 0.065, S.dialR * 0.12, hs);
    hand(ctx, S.gx, S.dialY, (tick / 60) * TAU - Math.PI / 2, S.dialR * 0.8, Math.max(0.8, S.dialR * 0.025), S.dialR * 0.2, L ? 'rgba(170,60,30,0.9)' : 'rgba(150,40,20,0.95)');
    ctx.fillStyle = hs; ctx.beginPath(); ctx.arc(S.gx, S.dialY, S.dialR * 0.075, 0, TAU); ctx.fill();

    // the train crossing the viaduct
    if (!st.train && !V.pv && --st.trainWait <= 0) st.train = { x: W + 20 };
    if (st.train) {
      const tr = st.train;
      tr.x -= 1.5 * k;
      K.stamp(ctx, S.train, tr.x, S.dy - S.trH, S.trL, S.trH, L ? 0.5 : 0.92);
      if ((t | 0) % 5 === 0) puff(tr.x + u * 0.0245, S.dy - S.trH, u * 0.008, 0.5 * k, -0.55 * k, u * 0.00042, 0.012, 1);
      if (tr.x < -S.trL - 20) { st.train = null; st.trainWait = 900 + Math.random() * 1300; }
    }
    drawPuffs(1);
    K.put(ctx, S.via, W, H, L ? 0.44 : 0.9);

    // the pipe: its gauge trembling, steam hissing from a joint now and then
    K.put(ctx, S.near, W, H, L ? 0.52 : 0.94);
    face(ctx, S.gX, S.gY, S.gR, L, Array.from({ length: 9 }, (_, i) => [Math.PI * 0.8 + (i / 8) * Math.PI * 1.4, i % 4 === 0]));
    if (st.hiss > 0) { st.hiss--; for (let i = 0; i < 2; i++) puff(S.leak[0], S.leak[1], u * 0.006, -(0.5 + Math.random() * 1.2) * k, -(1.4 + Math.random() * 1.4) * k, u * 0.0007, 0.02, 2); } else if (!V.pv && --st.hissWait <= 0) { st.hiss = 46; st.hissWait = 260 + Math.random() * 420; }
    const pres = 0.52 + 0.16 * Math.sin(t * 0.013) + 0.02 * Math.sin(t * 0.9) + (st.hiss > 0 ? -0.12 * (1 - st.hiss / 46) : 0);
    hand(ctx, S.gX, S.gY, Math.PI * 0.8 + pres * Math.PI * 1.4, S.gR * 0.74, Math.max(1, S.gR * 0.06), S.gR * 0.18, L ? 'rgba(170,60,30,0.9)' : 'rgba(150,40,20,0.95)');
    ctx.fillStyle = hs; ctx.beginPath(); ctx.arc(S.gX, S.gY, S.gR * 0.1, 0, TAU); ctx.fill();
    for (const p of st.puffs) { // the hiss: a bright jet in front of the pipe
      if (p.tone !== 2) continue;
      p.x += p.vx; p.y += p.vy; p.vy *= 0.97; p.r += p.grow; p.life -= p.fade;
      const a = Math.max(0, p.life) * (L ? 0.2 : 0.2);
      K.glow(ctx, p.x, p.y, p.r, [[0, L ? `rgba(104,92,80,${a})` : `rgba(240,232,218,${a})`], [1, 'rgba(220,210,190,0)']]);
    }
    st.puffs = st.puffs.filter((p) => p.life > 0);

    // the gear trains
    const a0 = t * 0.0042;
    for (const g of S.gears) {
      g.a = g.parent ? g.dir + Math.PI - Math.PI / g.N + (g.parent.N * (g.dir - g.parent.a)) / g.N : (g === S.gears[0] ? a0 : -a0 * 1.2);
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a);
      K.stamp(ctx, g.sp.c, -g.sp.size / 2, -g.sp.size / 2, g.sp.size, g.sp.size, L ? 0.5 : 0.9);
      ctx.restore();
    }
    ctx.restore();
  };
})();
