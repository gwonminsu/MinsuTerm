'use strict';
/*
 * 마왕성: the demon lord's castle on its crag, a blood moon behind the keep, a storm turning above the spire.
 * Lightning strikes the spire, bats pour out, windows and torches flicker, and now and then a dragon crosses the moon.
 */
(function () {
  const K = window.SceneKit;

  /** A dragon in flight, heading left; f -1..1 is the wing beat. Fill in the context's style. */
  function dragon(c, x, y, s, f) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath();
    c.moveTo(-1.6, -0.1); c.lineTo(-1.4, -0.2); c.lineTo(-1.34, -0.33); c.lineTo(-1.26, -0.2);
    c.quadraticCurveTo(-1.0, -0.24, -0.8, -0.06); c.quadraticCurveTo(-0.45, 0.02, -0.1, -0.12); c.quadraticCurveTo(0.4, -0.18, 0.9, 0.0);
    c.quadraticCurveTo(1.4, 0.16, 1.9, 0.02); c.lineTo(2.02, -0.08); c.lineTo(1.97, 0.1);
    c.quadraticCurveTo(1.4, 0.27, 0.9, 0.14); c.quadraticCurveTo(0.4, 0.2, 0.0, 0.2); c.lineTo(-0.06, 0.38); c.lineTo(-0.17, 0.2);
    c.quadraticCurveTo(-0.5, 0.2, -0.8, 0.1); c.quadraticCurveTo(-1.05, 0.0, -1.3, -0.03); c.lineTo(-1.56, -0.01);
    c.closePath(); c.fill();
    const yk = 0.5 - (f + 1) * 0.7; // wingtip: under the body on the downstroke, high above on the upstroke
    for (const [k, ox] of [[1, 0], [0.8, 0.12]]) {
      c.beginPath(); c.moveTo(-0.25 + ox, -0.06);
      c.quadraticCurveTo(-0.1 + ox, yk * 0.75 * k, 0.15 + ox, yk * 0.85 * k);
      c.quadraticCurveTo(0.6 + ox, yk * 1.1 * k, 1.0 + ox, yk * k + 0.1);
      c.quadraticCurveTo(0.85 + ox, yk * 0.75 * k + 0.2, 0.72 + ox, yk * 0.42 * k + 0.16);
      c.quadraticCurveTo(0.58 + ox, yk * 0.5 * k + 0.26, 0.45 + ox, yk * 0.18 * k + 0.12);
      c.quadraticCurveTo(0.36 + ox, yk * 0.2 * k + 0.2, 0.3 + ox, 0.02);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  /** Cloud wound into a spiral (alpha texture), to turn slowly over the spire. */
  function vortexTex() {
    if (K.cache.has('vortex')) return K.cache.get('vortex');
    const N = 256, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(31, 8, 4, 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const dx = (i - N / 2 + 0.5) / (N / 2), dy = (j - N / 2 + 0.5) / (N / 2), rr = Math.hypot(dx, dy);
        if (rr >= 1) continue;
        const th = Math.atan2(dy, dx) / (2 * Math.PI) + 0.5;
        let a = (f(th * 8 + rr * 3.4, rr * 4) - 0.36) / 0.36;
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        a *= Math.pow(Math.sin(Math.PI * Math.min(1, rr)), 0.8) * Math.min(1, rr / 0.14);
        const k = (j * N + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = 'vortex';
    K.cache.set('vortex', c);
    return c;
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(666);
    const cx = W * 0.6, y0 = H * 0.73, cu = u * 0.82; // cu: the castle's own scale, leaving sky for the storm
    const ink = L ? '#2b2738' : '#040206';
    const [back, b] = K.layer(W, H, bg.dpr), [mid, m] = K.layer(W, H, bg.dpr), [front, f] = K.layer(W, H, bg.dpr);
    for (const c of [b, m, f]) { c.fillStyle = ink; c.strokeStyle = ink; }

    // far ranges
    b.globalAlpha = 0.55; K.fillRidge(b, K.ridge(R, 128, 0.62), -10, W + 10, H * 0.72, u * 0.2, H + 2);
    b.globalAlpha = 1; K.fillRidge(b, K.ridge(R, 128, 0.58), -10, W + 10, H * 0.8, u * 0.16, H + 2);

    // the castle
    const wins = [], tips = [], torches = [];
    const T = (dx, w, h, rh, o = {}) => { // a round tower: shaft, corbelled crown, then a witch-hat roof or battlements
      const bx = cx + dx * cu, tw = w * cu, th = h * cu, by = y0 - (o.base || 0) * cu, top = by - th;
      m.beginPath(); m.moveTo(bx - tw * 0.56, by + 2); m.lineTo(bx - tw * 0.5, top); m.lineTo(bx + tw * 0.5, top); m.lineTo(bx + tw * 0.56, by + 2); m.closePath(); m.fill();
      const cw = tw * 1.26, chh = tw * 0.28, ry = top - chh;
      m.fillRect(bx - cw / 2, ry, cw, chh + 1);
      for (let i = 0; i < 5; i++) m.fillRect(bx - cw / 2 + ((i + 0.3) * cw) / 5, top - 0.5, cw / 11, tw * 0.11);
      if (rh) {
        const rw = cw * 0.55, hg = rh * cu;
        m.beginPath(); m.moveTo(bx - rw, ry + 1); m.quadraticCurveTo(bx - rw * 0.22, ry - hg * 0.42, bx, ry - hg); m.quadraticCurveTo(bx + rw * 0.22, ry - hg * 0.42, bx + rw, ry + 1); m.closePath(); m.fill();
        m.fillRect(bx - Math.max(0.5, tw * 0.02), ry - hg - tw * 0.55, Math.max(1, tw * 0.04), tw * 0.6);
        tips.push([bx, ry - hg - tw * 0.55]);
        if (o.flag) { m.beginPath(); m.moveTo(bx, ry - hg - tw * 0.52); m.lineTo(bx + tw * 0.55, ry - hg - tw * 0.4); m.lineTo(bx, ry - hg - tw * 0.26); m.closePath(); m.fill(); }
      } else {
        for (let i = 0; i < 4; i++) m.fillRect(bx - cw / 2 + (i * cw) / 3.5 - 0.2, ry - tw * 0.16, cw / 7 + 0.4, tw * 0.17);
      }
      const nw = Math.max(1, Math.round(th / (tw * 1.5)));
      for (let i = 0; i < nw; i++) if (R() < 0.7) wins.push({ x: bx + (R() - 0.5) * tw * 0.34, y: top + th * (0.1 + (i / nw) * 0.72), w: Math.max(1.3, tw * 0.1), h: Math.max(2.8, tw * 0.3), ph: R() * 9, sp: 0.03 + R() * 0.07 });
      return { bx, top: ry, tw };
    };
    const wall = (x0, x1, hgt) => {
      const a = cx + x0 * cu, q = cx + x1 * cu, top = y0 - hgt * cu;
      m.fillRect(a, top, q - a, hgt * cu + 2);
      for (let x = a; x < q - 1; x += cu * 0.012) m.fillRect(x, top - cu * 0.006, cu * 0.007, cu * 0.007);
    };
    T(-0.165, 0.036, 0.15, 0.07);
    T(0.215, 0.036, 0.13, 0.065);
    T(-0.105, 0.046, 0.215, 0.1, { flag: 1 });
    T(0.15, 0.05, 0.24, 0.11);
    T(-0.04, 0.05, 0.27, 0);
    T(0.095, 0.042, 0.3, 0.12);
    const keep = T(0.025, 0.085, 0.3, 0); // the keep: a great drum, a narrower stage on top of it, then the spire
    for (const d of [-1, 1]) T(0.025 + d * 0.047, 0.017, 0.04, 0.045, { base: 0.262 }); // turrets at its shoulders
    T(0.025, 0.05, 0.11, 0.2, { base: (y0 - keep.top) / cu - 0.004, flag: 1 });
    const spire = tips[tips.length - 1];
    wall(-0.2, 0.24, 0.075);
    m.lineWidth = cu * 0.008; // flying buttresses
    for (const d of [-1, 1]) { m.beginPath(); m.moveTo(cx + (0.025 + d * 0.043) * cu, y0 - cu * 0.2); m.quadraticCurveTo(cx + (0.025 + d * 0.07) * cu, y0 - cu * 0.19, cx + (0.025 + d * 0.088) * cu, y0 - cu * 0.12); m.stroke(); }
    wins.push({ x: cx + 0.025 * cu, y: y0 - cu * 0.215, w: cu * 0.02, h: cu * 0.02, ph: 1, sp: 0.02, round: 1 }); // the rose window
    T(-0.228, 0.026, 0.1, 0.05); T(-0.186, 0.026, 0.1, 0.05); // gatehouse
    const gate = { x: cx - 0.207 * cu, y: y0 - cu * 0.018, w: cu * 0.02, h: cu * 0.036 };

    // the causeway on its pointed arches, and the crag
    const bx0 = -cu * 0.03, bx1 = cx - cu * 0.22, by = y0 - cu * 0.012, deck = cu * 0.016, span = cu * 0.085;
    m.fillRect(bx0, by, bx1 - bx0, deck);
    for (let x = bx0; x < bx1; x += cu * 0.012) m.fillRect(x, by - cu * 0.006, cu * 0.007, cu * 0.007);
    for (let x = bx1 - span * 0.4; x > bx0 - span; x -= span) {
      m.beginPath(); m.moveTo(x - cu * 0.011, by); m.lineTo(x + cu * 0.011, by); m.lineTo(x + cu * 0.02, H + 2); m.lineTo(x - cu * 0.02, H + 2); m.closePath(); m.fill();
      const xa = x - span + cu * 0.011, xb = x - cu * 0.011, mid2 = (xa + xb) / 2, db = by + deck - 1, sp = db + span * 0.42;
      m.beginPath(); m.moveTo(xa, db); m.lineTo(xb, db); m.lineTo(xb, sp); m.quadraticCurveTo(xb, db + span * 0.1, mid2, db + span * 0.05); m.quadraticCurveTo(xa, db + span * 0.1, xa, sp); m.closePath(); m.fill();
      torches.push([x, by - cu * 0.012]);
    }
    K.rock(m, R, [[cx - 0.245 * cu, y0 + cu * 0.004], [cx + 0.275 * cu, y0 + cu * 0.004], [cx + 0.35 * cu, y0 + cu * 0.08], [cx + 0.52 * cu, H + 4], [cx - 0.42 * cu, H + 4], [cx - 0.31 * cu, y0 + cu * 0.09]], cu * 0.012);

    // the foreground: rocks and dead trees leaning in at the corners
    const dead = { wander: 0.45, spread: 0.8, twig: 0.4, curl: 0.12 };
    K.rock(f, R, [[-4, H + 4], [-4, H * 0.86], [u * 0.1, H * 0.9], [u * 0.26, H * 0.97], [u * 0.3, H + 4]], u * 0.012);
    K.rock(f, R, [[W + 4, H + 4], [W + 4, H * 0.84], [W - u * 0.12, H * 0.9], [W - u * 0.3, H * 0.975], [W - u * 0.34, H + 4]], u * 0.012);
    K.tree(f, R, u * 0.05, H * 0.9, u * 0.17, -Math.PI / 2 + 0.25, u * 0.02, 5, dead);
    K.tree(f, R, W - u * 0.06, H * 0.88, u * 0.19, -Math.PI / 2 - 0.22, u * 0.022, 5, dead);

    // what lightning picks out: the upper edges of the castle
    const [rim, r] = K.layer(W, H, bg.dpr);
    r.drawImage(mid, 0, 0, W, H);
    r.globalCompositeOperation = 'destination-out'; r.drawImage(mid, 0, Math.max(1.4, u * 0.003), W, H);
    r.globalCompositeOperation = 'source-in'; r.fillStyle = L ? '#7a5ad0' : '#e9dcff'; r.fillRect(0, 0, W, H);

    // the blood moon
    const mr = u * 0.15, ms = Math.ceil(mr * 2.2), [moon, q] = K.layer(ms, ms, bg.dpr);
    q.translate(ms / 2, ms / 2);
    const g = q.createRadialGradient(-mr * 0.25, -mr * 0.3, mr * 0.1, 0, 0, mr);
    g.addColorStop(0, L ? '#e8765e' : '#f5805c'); g.addColorStop(0.7, L ? '#cf4a3c' : '#c8382c'); g.addColorStop(1, L ? '#b23430' : '#861a1c');
    q.fillStyle = g; q.beginPath(); q.arc(0, 0, mr, 0, 7); q.fill();
    q.save(); q.clip();
    q.globalAlpha = 0.26; q.fillStyle = '#480808';
    for (let i = 0; i < 10; i++) { q.beginPath(); q.ellipse((R() - 0.5) * mr * 1.5, (R() - 0.5) * mr * 1.5, mr * (0.1 + R() * 0.24), mr * (0.07 + R() * 0.16), R() * 3, 0, 7); q.fill(); }
    q.restore();
    return { back, mid, front, rim, moon, mr, ms, cx, y0, wins, torches, gate, spire, mx: cx + cu * 0.02, my: y0 - cu * 0.3 };
  }

  window.drawCastle = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1.6), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'castle' || st.key !== S.key) {
      st = bg.st = { kind: 'castle', key: S.key, bats: [], batWait: 120 + Math.random() * 200, dragon: null, dragonWait: 700 + Math.random() * 900, next: t + 150 + Math.random() * 200, flashT: -999, bolt: null,
        stars: Array.from({ length: V.pv ? 12 : 46 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.55, r: (0.4 + Math.random() * 0.9) * V.z, ph: Math.random() * 6 })) };
    }
    const { cx, y0, mx, my, mr } = S, vx = S.spire[0], vy = S.spire[1] - u * 0.1;
    const inkA = (a) => (L ? `rgba(43,39,56,${a})` : `rgba(4,2,6,${a})`);
    const cloud = K.noiseTex('cloud5', 512, 128, { px: 5, py: 2, oct: 5, lo: 0.4, hi: 0.72, warp: 1.1, env: 'band', seed: 9 });
    const fogT = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#7c2c34');
    ctx.save(); ctx.translate(0, -V.oy);

    // lightning: timing first, everything else reacts to it
    if (!V.pv && t >= st.next) {
      st.next = t + 260 + Math.random() * 520; st.flashT = t;
      const mk = (x0, y0b, x1, y1, n, jit) => { const pts = [[x0, y0b]]; for (let i = 1; i < n; i++) { const k = i / n, e = Math.sin(k * Math.PI); pts.push([x0 + (x1 - x0) * k + (Math.random() - 0.5) * jit * e, y0b + (y1 - y0b) * k + (Math.random() - 0.5) * jit * 0.4 * e]); } pts.push([x1, y1]); return pts; };
      const main = mk(vx + (Math.random() - 0.5) * u * 0.1, vy, S.spire[0], S.spire[1], 9, u * 0.07);
      const br = main[3 + ((Math.random() * 3) | 0)];
      st.bolt = [main, mk(br[0], br[1], br[0] + (Math.random() - 0.5) * u * 0.3, br[1] + u * (0.08 + Math.random() * 0.1), 5, u * 0.04)];
    }
    const age = t - st.flashT, fl = age < 0 ? 0 : age < 3 ? 1 : age < 6 ? 0.3 : age < 10 ? 0.8 : Math.max(0, 0.8 * (1 - (age - 10) / 14));

    if (!L) for (const s of st.stars) { s.ph += 0.03; ctx.fillStyle = `rgba(255,214,214,${0.12 + 0.2 * Math.sin(s.ph) ** 2})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }

    // the blood moon, and whatever crosses it
    K.glow(ctx, mx, my, mr * 3.6, L ? [[0, 'rgba(220,70,56,0.2)'], [0.4, 'rgba(210,60,50,0.07)'], [1, 'rgba(210,60,50,0)']] : [[0, 'rgba(255,74,48,0.28)'], [0.35, 'rgba(214,44,36,0.11)'], [1, 'rgba(200,30,30,0)']]);
    ctx.globalAlpha = L ? 0.62 : 0.78; ctx.drawImage(S.moon, mx - S.ms / 2, my - S.ms / 2, S.ms, S.ms); ctx.globalAlpha = 1;
    if (!st.dragon && !V.pv && --st.dragonWait <= 0) st.dragon = { x: W + u * 0.3, y: my + (Math.random() - 0.5) * mr * 0.8, ph: 0 };
    if (st.dragon) {
      const d = st.dragon;
      d.x -= 1.5 * (u / 700); d.ph += 0.09; d.y += Math.sin(d.ph * 0.5) * 0.3;
      ctx.fillStyle = inkA(L ? 0.6 : 0.92); dragon(ctx, d.x, d.y, u * 0.045, Math.sin(d.ph));
      if (d.x < -u * 0.3) { st.dragon = null; st.dragonWait = 1500 + Math.random() * 1500; }
    }
    K.band(ctx, K.tint(cloud, L ? '#6c6478' : '#0a0306'), W, my - u * 0.3, u * 0.44, u * 1.8, t * 0.3, L ? 0.14 : 0.62);
    if (!L) K.band(ctx, K.tint(cloud, '#b8323a'), W, my - u * 0.31, u * 0.44, u * 1.8, t * 0.3, 0.07);
    K.put(ctx, S.back, W, H, L ? 0.2 : 0.5);

    // the storm turning over the spire
    const vs = u * 1.05;
    ctx.save(); ctx.translate(vx, vy); ctx.scale(1, 0.3); ctx.rotate(t * 0.006);
    ctx.globalAlpha = Math.min(1, (L ? 0.26 : 0.36) * (1 + fl));
    ctx.drawImage(K.tint(vortexTex(), L ? '#7a5a96' : '#8c3a8e'), -vs / 2, -vs / 2, vs, vs);
    ctx.restore(); ctx.globalAlpha = 1;
    K.glow(ctx, vx, vy, u * 0.5, [[0, `rgba(${L ? '140,96,220' : '190,120,255'},${(L ? 0.1 : 0.12) + fl * 0.3})`], [1, 'rgba(170,110,255,0)']], 1, 0.5);

    K.put(ctx, S.mid, W, H, L ? 0.5 : 0.9);
    if (fl > 0.02) { ctx.globalAlpha = Math.min(1, fl * (L ? 0.7 : 0.9)); ctx.drawImage(S.rim, 0, 0, W, H); }
    ctx.globalAlpha = 1;

    // lights in the windows, the gate, torches along the causeway
    for (const wn of S.wins) {
      const a = 0.45 + 0.4 * Math.sin(t * wn.sp + wn.ph);
      if (a < 0.2) continue;
      ctx.fillStyle = L ? `rgba(206,92,40,${a})` : `rgba(255,146,60,${a * 0.9})`;
      ctx.beginPath();
      if (wn.round) ctx.arc(wn.x, wn.y, wn.w / 2, 0, 7);
      else { ctx.moveTo(wn.x - wn.w / 2, wn.y + wn.h / 2); ctx.lineTo(wn.x - wn.w / 2, wn.y - wn.h * 0.2); ctx.lineTo(wn.x, wn.y - wn.h / 2); ctx.lineTo(wn.x + wn.w / 2, wn.y - wn.h * 0.2); ctx.lineTo(wn.x + wn.w / 2, wn.y + wn.h / 2); ctx.closePath(); }
      ctx.fill();
    }
    const gt = S.gate, ga = 0.5 + 0.2 * Math.sin(t * 0.05);
    ctx.fillStyle = L ? `rgba(200,50,40,${ga})` : `rgba(255,70,40,${ga})`;
    ctx.beginPath(); ctx.moveTo(gt.x - gt.w / 2, gt.y + gt.h / 2); ctx.lineTo(gt.x - gt.w / 2, gt.y - gt.h * 0.1); ctx.arc(gt.x, gt.y - gt.h * 0.1, gt.w / 2, Math.PI, 0); ctx.lineTo(gt.x + gt.w / 2, gt.y + gt.h / 2); ctx.closePath(); ctx.fill();
    for (const [tx, ty] of S.torches) {
      const a = 0.6 + 0.4 * Math.sin(t * 0.3 + tx);
      K.glow(ctx, tx, ty, u * 0.018, [[0, `rgba(255,170,70,${(L ? 0.7 : 0.55) * a})`], [1, 'rgba(255,120,40,0)']]);
    }

    // the bolt
    if (st.bolt && age >= 0 && age < 12) {
      ctx.save();
      ctx.strokeStyle = L ? `rgba(110,70,210,${1 - age / 12})` : `rgba(238,224,255,${1 - age / 12})`;
      ctx.shadowColor = 'rgba(190,140,255,0.9)'; ctx.shadowBlur = u * 0.02; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      st.bolt.forEach((pts, i) => { ctx.lineWidth = Math.max(1, u * (i ? 0.0016 : 0.003)); ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); });
      ctx.restore();
    }

    // bats pour out of the towers
    if (!V.pv && --st.batWait <= 0) {
      st.batWait = 400 + Math.random() * 700;
      const n = 6 + ((Math.random() * 7) | 0), dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) st.bats.push({ x: cx + (Math.random() - 0.5) * u * 0.2, y: y0 - u * (0.15 + Math.random() * 0.2), vx: dir * (1 + Math.random() * 1.4) * (u / 600), vy: -(0.3 + Math.random() * 0.9) * (u / 600), ph: Math.random() * 6, s: u * (0.007 + Math.random() * 0.007) });
    }
    ctx.fillStyle = inkA(L ? 0.6 : 0.95);
    for (const q of st.bats) { q.ph += 0.55; q.x += q.vx; q.y += q.vy + Math.sin(q.ph * 0.31) * 0.5; K.bat(ctx, q.x, q.y, q.s, Math.sin(q.ph)); }
    st.bats = st.bats.filter((q) => q.x > -40 && q.x < W + 40 && q.y > -40);

    K.mist(ctx, fogT, W, y0 + u * 0.01, H - y0 + u * 0.04, u * 1.5, t * 0.35, L ? 0.7 : 0.2);
    K.put(ctx, S.front, W, H, L ? 0.5 : 0.94);
    K.mist(ctx, fogT, W, H - u * 0.16, u * 0.2, u * 1.1, -t * 0.5 + 300, L ? 0.5 : 0.14);
    ctx.restore();
  };
})();
