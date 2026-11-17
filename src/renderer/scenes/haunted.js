'use strict';
/*
 * 으스스한 숲: a dead forest in the fog, an abandoned house with one lit window, graves, a swing moving by itself.
 * Things watch from the dark, and now and then someone stands among the trees — a little closer each time.
 */
(function () {
  const K = window.SceneKit;

  function crow(c, x, y, s, flap, dir, ink) {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    c.fillStyle = ink;
    if (flap == null) { // perched
      c.beginPath(); c.ellipse(0, -s * 0.55, s * 0.78, s * 0.42, -0.5, 0, 7); c.fill();
      c.beginPath(); c.arc(s * 0.55, -s * 1.05, s * 0.3, 0, 7); c.fill();
      c.beginPath(); c.moveTo(s * 0.8, -s * 1.14); c.lineTo(s * 1.32, -s * 1.0); c.lineTo(s * 0.8, -s * 0.92); c.fill();
      c.beginPath(); c.moveTo(-s * 0.5, -s * 0.35); c.lineTo(-s * 1.55, s * 0.22); c.lineTo(-s * 0.9, -s * 0.55); c.fill();
      c.fillRect(-s * 0.06, -s * 0.2, s * 0.08, s * 0.22); c.fillRect(s * 0.2, -s * 0.2, s * 0.08, s * 0.22);
    } else { // flying
      c.beginPath(); c.ellipse(0, 0, s * 0.8, s * 0.3, 0, 0, 7); c.fill();
      c.beginPath(); c.arc(s * 0.85, -s * 0.1, s * 0.26, 0, 7); c.fill();
      c.beginPath(); c.moveTo(s * 1.05, -s * 0.18); c.lineTo(s * 1.5, -s * 0.05); c.lineTo(s * 1.05, 0); c.fill();
      c.beginPath(); c.moveTo(-s * 0.6, -s * 0.1); c.lineTo(-s * 1.5, s * 0.05); c.lineTo(-s * 0.6, s * 0.15); c.fill();
      const wy = -flap * s * 1.4;
      c.beginPath(); c.moveTo(s * 0.45, -s * 0.1); c.quadraticCurveTo(s * 0.15, wy * 0.7 - s * 0.2, -s * 0.55, wy); c.quadraticCurveTo(-s * 0.55, wy * 0.4, -s * 0.5, 0); c.fill();
    }
    c.restore();
  }

  /** The watcher: too tall, arms too long, the head a little to one side. */
  function figure(c, x, base, s, ink, eye) {
    c.fillStyle = ink;
    c.save(); c.translate(x + s * 0.014, base - s * 0.945); c.rotate(0.2);
    c.beginPath(); c.ellipse(0, 0, s * 0.04, s * 0.062, 0, 0, 7); c.fill();
    c.restore();
    c.beginPath();
    c.moveTo(x - s * 0.014, base - s * 0.895); // neck
    c.lineTo(x - s * 0.02, base - s * 0.865);
    c.lineTo(x - s * 0.108, base - s * 0.815); // shoulders slope away
    c.lineTo(x - s * 0.128, base - s * 0.55);
    c.lineTo(x - s * 0.142, base - s * 0.3); // arms hang past the knees
    c.lineTo(x - s * 0.15, base - s * 0.235); c.lineTo(x - s * 0.138, base - s * 0.25); c.lineTo(x - s * 0.134, base - s * 0.215); c.lineTo(x - s * 0.124, base - s * 0.25); c.lineTo(x - s * 0.116, base - s * 0.225); c.lineTo(x - s * 0.112, base - s * 0.3); // long fingers
    c.lineTo(x - s * 0.088, base - s * 0.6);
    c.lineTo(x - s * 0.062, base - s * 0.5);
    c.lineTo(x - s * 0.07, base); c.lineTo(x - s * 0.012, base); c.lineTo(x, base - s * 0.42); c.lineTo(x + s * 0.012, base); c.lineTo(x + s * 0.07, base);
    c.lineTo(x + s * 0.062, base - s * 0.5);
    c.lineTo(x + s * 0.088, base - s * 0.6);
    c.lineTo(x + s * 0.112, base - s * 0.3);
    c.lineTo(x + s * 0.116, base - s * 0.225); c.lineTo(x + s * 0.124, base - s * 0.25); c.lineTo(x + s * 0.134, base - s * 0.215); c.lineTo(x + s * 0.138, base - s * 0.25); c.lineTo(x + s * 0.15, base - s * 0.235);
    c.lineTo(x + s * 0.142, base - s * 0.3);
    c.lineTo(x + s * 0.128, base - s * 0.55);
    c.lineTo(x + s * 0.108, base - s * 0.815);
    c.lineTo(x + s * 0.02, base - s * 0.865);
    c.lineTo(x + s * 0.014, base - s * 0.895);
    c.closePath(); c.fill();
    if (eye) { c.fillStyle = eye; for (const d of [-1, 1]) { c.beginPath(); c.arc(x + s * 0.016 + d * s * 0.016, base - s * 0.95 + d * s * 0.003, Math.max(0.7, s * 0.0062), 0, 7); c.fill(); } }
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(20261117);
    const hz = H * 0.76;
    const [far, f] = K.layer(W, H, bg.dpr), [mid, m] = K.layer(W, H, bg.dpr), [near, n] = K.layer(W, H, bg.dpr);
    const ink = L ? '#262a34' : '#010303';
    for (const c of [f, m, n]) { c.strokeStyle = ink; c.fillStyle = ink; }
    const bare = { wander: 0.5, spread: 0.75, twig: 0.35, curl: 0.1 };

    // far: a wall of thin trunks lost in the fog
    for (let x = -u * 0.02; x < W + u * 0.05; x += u * (0.04 + R() * 0.05)) K.tree(f, R, x, hz + u * 0.02, u * (0.1 + R() * 0.07), -Math.PI / 2 + (R() - 0.5) * 0.2, u * (0.007 + R() * 0.005), 4, bare);
    const ground = (c, y0, amp, k) => { c.beginPath(); c.moveTo(0, H + 2); for (let x = 0; x <= W + 8; x += 8) c.lineTo(x, y0 + Math.sin((x / u) * k) * amp + Math.sin((x / u) * k * 2.7 + 1) * amp * 0.5); c.lineTo(W, H + 2); c.closePath(); c.fill(); };
    ground(f, hz + u * 0.018, u * 0.006, 7);

    // mid: bigger trees, the old house and what is left of its fence
    for (let x = u * 0.06; x < W; x += u * (0.17 + R() * 0.2)) K.tree(m, R, x, hz + u * 0.045, u * (0.15 + R() * 0.07), -Math.PI / 2 + (R() - 0.5) * 0.25, u * (0.015 + R() * 0.008), 5, bare);
    ground(m, hz + u * 0.046, u * 0.007, 4.3);
    // the house: two storeys, a tower with a witch-hat roof, a lean-to, a sagging porch
    const hx = W * 0.22, hb = hz + u * 0.05, k = u * 0.0105, tx = hx - 6.2 * k;
    m.fillRect(hx - 6.5 * k, hb - 12 * k, 13 * k, 12 * k + 2);
    m.beginPath(); m.moveTo(hx - 7.6 * k, hb - 11.6 * k); m.quadraticCurveTo(hx - 3.6 * k, hb - 16 * k, hx - 0.4 * k, hb - 19.5 * k); m.quadraticCurveTo(hx + 3.2 * k, hb - 16.2 * k, hx + 7.8 * k, hb - 11.4 * k); m.closePath(); m.fill();
    m.fillRect(tx - 2.4 * k, hb - 19 * k, 4.8 * k, 19 * k + 2);
    m.beginPath(); m.moveTo(tx - 3.3 * k, hb - 18.6 * k); m.quadraticCurveTo(tx - 1 * k, hb - 21 * k, tx + 0.1 * k, hb - 27.5 * k); m.quadraticCurveTo(tx + 1.1 * k, hb - 21 * k, tx + 3.3 * k, hb - 18.6 * k); m.closePath(); m.fill();
    m.lineWidth = Math.max(1, k * 0.22);
    m.beginPath(); m.moveTo(tx + 0.1 * k, hb - 27.3 * k); m.lineTo(tx + 0.35 * k, hb - 30 * k); m.moveTo(tx - 0.9 * k, hb - 29.3 * k); m.lineTo(tx + 1.5 * k, hb - 28.9 * k); m.stroke(); // a bent vane
    m.fillRect(hx + 6.3 * k, hb - 6.5 * k, 6.2 * k, 6.5 * k + 2);
    m.beginPath(); m.moveTo(hx + 6 * k, hb - 9.8 * k); m.lineTo(hx + 13.3 * k, hb - 6.2 * k); m.lineTo(hx + 6 * k, hb - 6.2 * k); m.closePath(); m.fill();
    m.save(); m.translate(hx + 3.7 * k, hb - 15 * k); m.rotate(0.08); m.fillRect(-0.8 * k, -5.4 * k, 1.6 * k, 5.6 * k); m.fillRect(-1.1 * k, -5.9 * k, 2.2 * k, 0.6 * k); m.restore(); // a leaning chimney
    m.beginPath(); m.moveTo(hx + 0.5 * k, hb - 13.9 * k); m.lineTo(hx + 2 * k, hb - 16.6 * k); m.lineTo(hx + 3.5 * k, hb - 13.9 * k); m.closePath(); m.fill(); // dormer
    m.beginPath(); m.moveTo(hx - 3.9 * k, hb - 4.9 * k); m.quadraticCurveTo(hx + 1 * k, hb - 4.2 * k, hx + 6.1 * k, hb - 5 * k); m.lineTo(hx + 6.1 * k, hb - 4.45 * k); m.quadraticCurveTo(hx + 1 * k, hb - 3.65 * k, hx - 3.9 * k, hb - 4.35 * k); m.closePath(); m.fill(); // porch roof
    for (const px of [-3.4, -0.4, 2.5, 5.4]) m.fillRect(hx + px * k, hb - 4.5 * k, 0.32 * k, 4.6 * k);
    m.fillRect(hx - 1.6 * k, hb - 0.55 * k, 4.2 * k, 0.8 * k);
    const wins = [];
    const win = (x, y, ww, wh, lit) => { // an arched window cut out of the wall, its glazing bars left in
      m.globalCompositeOperation = 'destination-out';
      m.beginPath(); m.moveTo(x - ww / 2, y + wh / 2); m.lineTo(x - ww / 2, y - wh / 4); m.arc(x, y - wh / 4, ww / 2, Math.PI, 0); m.lineTo(x + ww / 2, y + wh / 2); m.closePath(); m.fill();
      m.globalCompositeOperation = 'source-over';
      m.fillRect(x - ww * 0.06, y - wh / 4 - ww / 2, ww * 0.12, wh * 0.75 + ww / 2); m.fillRect(x - ww / 2, y - wh * 0.02, ww, wh * 0.08);
      wins.push({ x, y: y - wh * 0.1, w: ww * 1.25, h: wh * 1.3 + ww * 0.3, lit });
    };
    win(hx - 3.3 * k, hb - 8.7 * k, 1.5 * k, 2.7 * k, 1);
    win(hx + 0.6 * k, hb - 8.7 * k, 1.5 * k, 2.7 * k, 0);
    win(hx + 4.2 * k, hb - 8.7 * k, 1.5 * k, 2.7 * k, 0);
    win(tx, hb - 13.4 * k, 1.4 * k, 2.6 * k, 0);
    win(hx + 9.5 * k, hb - 3.3 * k, 1.5 * k, 2.2 * k, 0);
    m.globalCompositeOperation = 'destination-out'; m.beginPath(); m.arc(tx, hb - 17.3 * k, 0.75 * k, 0, 7); m.fill(); m.globalCompositeOperation = 'source-over';
    wins.push({ x: tx, y: hb - 17.3 * k, w: 1.9 * k, h: 1.9 * k, lit: 0.5 });
    K.tree(m, R, hx + 15.5 * k, hb + 2, u * 0.075, -Math.PI / 2 + 0.12, u * 0.009, 4, bare);
    const hw = 13 * k;
    m.lineWidth = Math.max(1, u * 0.004);
    for (let i = 0; i < 9; i++) { // fence: leaning posts, a broken rail
      const px = hx + hw * 0.75 + i * u * 0.034, lean = (R() - 0.5) * 0.5, ph = u * (0.028 + R() * 0.014);
      if (R() < 0.2) continue;
      m.beginPath(); m.moveTo(px, hb + 2); m.lineTo(px + Math.sin(lean) * ph, hb - ph); m.stroke();
      if (i < 8 && R() < 0.7) { m.beginPath(); m.moveTo(px, hb - ph * 0.62); m.lineTo(px + u * 0.034, hb - ph * (0.5 + R() * 0.25)); m.stroke(); }
    }

    // near: the ground, graves, and the great trees that frame it all
    const gy = (x) => hz + u * 0.078 + Math.sin((x / u) * 5) * u * 0.008 + Math.sin((x / u) * 13 + 2) * u * 0.004;
    n.beginPath(); n.moveTo(0, H + 2); for (let x = 0; x <= W + 6; x += 6) n.lineTo(x, gy(x)); n.lineTo(W, H + 2); n.closePath(); n.fill();
    n.lineWidth = 1;
    for (let x = 0; x < W; x += 3 + R() * 6) { const y = gy(x); n.beginPath(); n.moveTo(x, y + 1); n.lineTo(x + (R() - 0.5) * 5, y - u * (0.006 + R() * 0.014)); n.stroke(); }
    const stones = [];
    for (const gx of [0.33, 0.41, 0.49, 0.585, 0.67, 0.75]) {
      const x = W * (gx + (R() - 0.5) * 0.02), y = gy(x) + u * 0.006, s = u * (0.03 + R() * 0.018), tilt = (R() - 0.5) * 0.3;
      n.save(); n.translate(x, y); n.rotate(tilt);
      if (R() < 0.45) { n.fillRect(-s * 0.09, -s * 1.5, s * 0.18, s * 1.5); n.fillRect(-s * 0.42, -s * 1.12, s * 0.84, s * 0.17); }
      else { n.beginPath(); n.moveTo(-s * 0.4, 0); n.lineTo(-s * 0.4, -s * 0.75); n.arc(0, -s * 0.75, s * 0.4, Math.PI, 0); n.lineTo(s * 0.4, 0); n.closePath(); n.fill(); stones.push([x + Math.sin(tilt) * s * 1.15, y - Math.cos(tilt) * s * 1.15]); }
      n.restore();
    }
    const big = { wander: 0.34, spread: 0.72, twig: 0.42, curl: 0.07 };
    K.tree(n, R, W * 0.015, H + u * 0.04, u * 0.3, -Math.PI / 2 + 0.13, u * 0.052, 7, big);
    K.tree(n, R, W * 0.975, H + u * 0.04, u * 0.33, -Math.PI / 2 - 0.1, u * 0.058, 7, big);
    K.tree(n, R, W * 0.13, H + u * 0.02, u * 0.17, -Math.PI / 2 - 0.08, u * 0.022, 6, bare);
    // the limb the swing hangs from
    const bx = W * 0.975 - u * 0.02, by0 = hz - u * 0.2, ex = bx - u * 0.32, ey = by0 - u * 0.07;
    const limb = (t) => [bx + (ex - bx) * t, by0 + (ey - by0) * t + Math.sin(t * Math.PI) * u * 0.012];
    for (let i = 0; i < 10; i++) { const [x0, y0] = limb(i / 10), [x1, y1] = limb((i + 1) / 10); n.lineWidth = u * 0.021 * (1 - 0.62 * (i / 10)); n.beginPath(); n.moveTo(x0, y0); n.lineTo(x1, y1); n.stroke(); }
    K.tree(n, R, ex, ey, u * 0.08, Math.PI + 0.35, u * 0.008, 3, bare);
    const [rim, r] = K.layer(W, H, bg.dpr);
    r.drawImage(near, 0, 0, W, H);
    r.globalCompositeOperation = 'destination-out'; r.drawImage(near, -Math.max(1.2, u * 0.0028), u * 0.001, W, H);
    r.globalCompositeOperation = 'source-in'; r.fillStyle = '#cfe0da'; r.fillRect(0, 0, W, H);
    const perchA = limb(0.3), ridgeTop = [hx - 0.4 * k, hb - 19.5 * k];
    return { far, mid, near, rim, hz, swing: limb(0.63), wins, hx, perches: [[perchA[0], perchA[1] - u * 0.008], stones[0] || [W * 0.5, hz], [ridgeTop[0] + k, ridgeTop[1] + k * 0.9]] };
  }

  window.drawHaunted = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.3, 1.55), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'haunted' || st.key !== S.key) {
      st = bg.st = { kind: 'haunted', key: S.key, eyes: [], ep: null, wait: 320 + Math.random() * 420, flick: 0, swarm: 0, winFig: 0,
        crows: S.perches.map((p, i) => ({ px: p[0], py: p[1], x: p[0], y: p[1], dir: i % 2 ? -1 : 1, state: 'sit', ph: Math.random() * 6, timer: 0, vx: 0, vy: 0 })) };
    }
    const hz = S.hz, mx = W * 0.73, my = H * (V.pv ? 0.36 : 0.19), mr = u * 0.058;
    const inkN = L ? 'rgba(38,42,52,0.34)' : 'rgba(1,3,3,0.82)';
    const fogT = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#b7c9c3');
    const cloudT = K.tint(K.noiseTex('cloud5', 512, 128, { px: 5, py: 2, oct: 5, lo: 0.4, hi: 0.72, warp: 1.1, env: 'band', seed: 9 }), L ? '#7d848c' : '#020404');
    ctx.save(); ctx.translate(0, -V.oy);

    // moonlight: the halo, and a pale band of lit fog along the ground (what the trees stand out against)
    if (!L) {
      K.glow(ctx, mx, my, mr * 7, [[0, 'rgba(196,214,208,0.2)'], [0.3, 'rgba(170,192,186,0.07)'], [1, 'rgba(170,192,186,0)']]);
      K.glow(ctx, W * 0.5, hz, W * 0.62, [[0, 'rgba(150,172,166,0.22)'], [0.6, 'rgba(150,172,166,0.07)'], [1, 'rgba(150,172,166,0)']], 1, (u * 0.34) / (W * 0.62));
    }
    ctx.fillStyle = L ? 'rgba(150,160,172,0.24)' : 'rgba(214,226,220,0.78)';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = L ? 'rgba(120,130,144,0.2)' : 'rgba(120,138,134,0.36)';
    for (const [dx, dy, r] of [[-0.32, -0.2, 0.24], [0.26, 0.16, 0.17], [-0.06, 0.4, 0.13], [0.3, -0.38, 0.1]]) { ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 7); ctx.fill(); }
    K.band(ctx, cloudT, W, my - u * 0.17, u * 0.36, u * 1.7, t * 0.22, L ? 0.13 : 0.7);

    K.put(ctx, S.far, W, H, L ? 0.11 : 0.42);
    K.mist(ctx, fogT, W, hz - u * 0.24, u * 0.36, u * 1.9, t * 0.3, L ? 0.7 : 0.14);

    // a will-o'-the-wisp wandering between the far trunks
    const wk = Math.max(0, Math.sin(t * 0.006)) ** 2;
    if (wk > 0.02) {
      const wx = W * (0.5 + 0.32 * Math.sin(t * 0.0031)), wy = hz - u * 0.04 + Math.sin(t * 0.017) * u * 0.02;
      K.glow(ctx, wx, wy, u * 0.035, [[0, `rgba(170,232,222,${0.55 * wk})`], [0.3, `rgba(120,210,200,${0.18 * wk})`], [1, 'rgba(120,210,200,0)']]);
    }

    // the watcher comes in episodes of a few beats. Between beats the light fails for an instant —
    // and when it is back, it has moved: somewhere else, closer.
    const beat = (ep) => { ep.sg = ep.seq[ep.i]; ep.x = W * (0.26 + Math.random() * 0.48); ep.life = 0; ep.dur = ep.sg === 3 ? 62 : 78 - ep.sg * 14 + Math.random() * 60; };
    if (!st.ep && !V.pv && --st.wait <= 0) {
      const n = 3 + ((Math.random() * 4) | 0), seq = [];
      for (let i = 0; i < n; i++) seq.push(Math.min(2, Math.floor((i / n) * 3 + Math.random() * 0.7)));
      if (Math.random() < 0.45) seq.push(3);
      st.ep = { seq, i: 0 };
      beat(st.ep);
    }
    const fig = st.ep;
    let fa = 0;
    if (fig) {
      fig.life++;
      fa = Math.max(0, Math.min(1, fig.life / (fig.i === 0 ? 45 : 4), (fig.dur - fig.life) / 3));
      if (fig.life === Math.round(fig.dur) - 3) st.flick = 1; // the light fails just as it moves
      if (fig.life >= fig.dur) {
        fig.i++;
        if (fig.i >= fig.seq.length) { st.ep = null; st.wait = 700 + Math.random() * 1100; } else beat(fig);
      }
    }
    const drawFig = (sg) => {
      if (!fig || fig.sg !== sg || fa <= 0) return;
      const [sz, base, al] = [[u * 0.085, hz + u * 0.012, 0.55], [u * 0.145, hz + u * 0.05, 0.82], [u * 0.3, hz + u * 0.14, 0.94], [u * 0.78, H + u * 0.5, 0.94]][sg];
      figure(ctx, fig.x, base, sz, L ? `rgba(30,33,42,${al * fa})` : `rgba(0,0,0,${al * fa})`, sg >= 1 ? (L ? `rgba(255,255,255,${fa})` : `rgba(226,236,230,${fa})`) : null);
    };
    drawFig(0);

    // the house: one window still lit, faltering; the dead ones catch a little moonlight; now and then someone crosses the room
    const wf = Math.max(0.15, 0.6 + 0.25 * Math.sin(t * 0.21) * Math.sin(t * 0.043) - (Math.random() < 0.04 ? 0.3 : 0));
    for (const wn of S.wins) {
      ctx.fillStyle = wn.lit ? (L ? `rgba(206,146,44,${0.7 * wf * wn.lit})` : `rgba(255,190,96,${0.62 * wf * wn.lit})`) : (L ? 'rgba(255,255,255,0)' : 'rgba(150,172,168,0.16)');
      ctx.fillRect(wn.x - wn.w / 2, wn.y - wn.h / 2, wn.w, wn.h);
    }
    const w0 = S.wins[0];
    if (st.winFig > 0) {
      st.winFig--;
      const p = 1 - st.winFig / 90;
      ctx.save(); ctx.beginPath(); ctx.rect(w0.x - w0.w / 2, w0.y - w0.h / 2, w0.w, w0.h); ctx.clip();
      ctx.fillStyle = L ? 'rgba(38,42,52,0.95)' : 'rgba(0,0,0,0.95)';
      ctx.fillRect(w0.x - w0.w / 2 + w0.w * (p * 1.5 - 0.35), w0.y - w0.h * 0.3, w0.w * 0.32, w0.h);
      ctx.restore();
    } else if (!V.pv && Math.random() < 0.0012) st.winFig = 90;
    K.put(ctx, S.mid, W, H, L ? 0.22 : 0.62);
    if (!L) K.glow(ctx, w0.x, w0.y, u * 0.04, [[0, `rgba(255,180,80,${0.14 * wf})`], [1, 'rgba(255,180,80,0)']]);

    // eyes opening in the dark
    const eye = (delay) => st.eyes.push({ x: ((x) => (Math.abs(x - S.hx) < u * 0.16 ? x + u * 0.34 : x))(W * (0.04 + Math.random() * 0.92)), y: hz - u * 0.17 + Math.random() * u * 0.2, s: u * (0.0045 + Math.random() * 0.004), life: -delay, dur: 200 + Math.random() * 260, bl: 60 + Math.random() * 120 });
    if (st.swarm > 0) st.swarm--;
    if (Math.random() < 0.007 && st.eyes.length < 3) eye(0);
    if (!V.pv && st.swarm <= 0 && Math.random() < 0.0007) { st.swarm = 500; for (let i = 0; i < 9; i++) eye(i * 7); }
    for (const e of st.eyes) {
      e.life++;
      if (e.life < 0) continue;
      const k = e.life / e.dur, a = Math.min(1, k * 8, (1 - k) * 8), blink = e.life % e.bl < 5 ? 0.08 : 1;
      ctx.fillStyle = L ? `rgba(170,20,16,${0.85 * a * blink})` : `rgba(255,52,36,${0.9 * a * blink})`;
      if (!L) { ctx.shadowColor = 'rgba(255,30,10,0.9)'; ctx.shadowBlur = e.s * 5; }
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(e.x + d * e.s * 2.3, e.y, e.s, e.s * 0.62, d * 0.25, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    st.eyes = st.eyes.filter((e) => e.life < e.dur);

    drawFig(1);
    K.mist(ctx, fogT, W, hz - u * 0.1, u * 0.3, u * 1.5, -t * 0.42 + 500, L ? 0.75 : 0.17);
    K.put(ctx, S.near, W, H, L ? 0.32 : 0.8);
    if (!L) { ctx.globalAlpha = 0.14; ctx.drawImage(S.rim, 0, 0, W, H); }
    ctx.globalAlpha = 1;

    // the swing: nobody on it
    const sa = S.swing, th = 0.1 * Math.sin(t * 0.021) + 0.035 * Math.sin(t * 0.057 + 1), rl = u * 0.2, pw = u * 0.036;
    ctx.strokeStyle = inkN; ctx.lineWidth = Math.max(0.8, u * 0.0022);
    for (const d of [-1, 1]) { const ax = sa[0] + d * pw * 0.42; ctx.beginPath(); ctx.moveTo(ax, sa[1]); ctx.lineTo(ax + Math.sin(th) * rl, sa[1] + Math.cos(th) * rl); ctx.stroke(); }
    ctx.save(); ctx.translate(sa[0] + Math.sin(th) * rl, sa[1] + Math.cos(th) * rl); ctx.rotate(-th); ctx.fillStyle = inkN; ctx.fillRect(-pw / 2, -u * 0.003, pw, u * 0.007); ctx.restore();

    // crows: they leave when it comes
    for (const c of st.crows) {
      if (c.state === 'sit') {
        if ((fig && fig.i === 0 && fig.life === 20) || (!V.pv && Math.random() < 0.0006)) { c.state = 'fly'; c.dir = Math.random() < 0.5 ? -1 : 1; c.vx = c.dir * (1.6 + Math.random()) * (u / 500); c.vy = -(0.9 + Math.random() * 0.6) * (u / 500); }
      } else if (c.state === 'fly') {
        c.ph += 0.5; c.x += c.vx; c.y += c.vy; c.vy *= 0.992;
        if (c.x < -40 || c.x > W + 40 || c.y < -40) { c.state = 'away'; c.timer = 500 + Math.random() * 900; }
      } else if (c.state === 'away') {
        if (--c.timer <= 0) { c.state = 'back'; c.dir = c.px > W / 2 ? -1 : 1; c.x = c.dir > 0 ? -30 : W + 30; c.y = c.py - u * 0.25; }
      } else {
        c.ph += 0.5;
        const dx = c.px - c.x, dy = c.py - c.y, d = Math.hypot(dx, dy), sp = Math.min(d, 2.2 * (u / 500) + d * 0.01);
        c.x += (dx / (d || 1)) * sp; c.y += (dy / (d || 1)) * sp; c.dir = dx >= 0 ? 1 : -1;
        if (d < 1.5) { c.state = 'sit'; c.x = c.px; c.y = c.py; }
      }
      if (c.state !== 'away') crow(ctx, c.x, c.y, u * 0.013, c.state === 'sit' ? null : Math.sin(c.ph), c.dir, inkN);
    }

    drawFig(2); drawFig(3);
    K.mist(ctx, fogT, W, hz + u * 0.02, u * 0.28, u * 1.2, t * 0.7 + 900, L ? 0.5 : 0.14);

    if (!V.pv) { // the dark closing in at the edges, and a light that fails for a moment
      if (!L) {
        const vg = ctx.createRadialGradient(W / 2, H / 2, u * 0.4, W / 2, H / 2, Math.max(W, H) * 0.78);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
      if (st.flick > 0) { ctx.fillStyle = L ? `rgba(70,74,86,${0.3 * st.flick})` : `rgba(0,0,0,${0.5 * st.flick})`; ctx.fillRect(0, 0, W, H); st.flick -= 0.13; }
      else if (!fig && Math.random() < 0.0015) st.flick = 0.8;
    }
    ctx.restore();
  };
})();
