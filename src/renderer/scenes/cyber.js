'use strict';
/*
 * 사이버펑크: a city in the rain. Three depths of towers, neon signs that flicker, a ticker on the megatower and a
 * hologram turning above it, searchlights, flying cars on their lanes, a train on the elevated line, steam off the roofs.
 */
(function () {
  const K = window.SceneKit;
  const NEON = { m: [255, 45, 180], c: [40, 235, 255], v: [165, 95, 255], a: [255, 200, 80] };
  const NEON_L = { m: [214, 24, 150], c: [10, 150, 190], v: [118, 60, 220], a: [200, 130, 20] };
  const KEYS = ['m', 'c', 'v', 'a'];
  const SIGNS = ['네온', '라멘', '약국', 'PC방', '24시', 'ホテル', '酒場', '電脳', 'OPEN', 'BAR', 'CYBER', '夜市', '노래방', 'ラーメン'];
  const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Yu Gothic UI", "Microsoft YaHei UI", "Segoe UI", sans-serif';

  /** A framed neon sign as a sprite (glow baked in). */
  function signSprite(txt, col, vertical, fs, L, q) {
    const key = `sign|${txt}|${col}|${vertical}|${Math.round(fs * 10)}|${L}|${q}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const chars = [...txt], pad = fs * 0.75, wide = /[^\x00-\x7f]/.test(txt);
    const w = vertical ? fs * 1.05 + pad * 2 : fs * chars.length * (wide ? 1.04 : 0.66) + pad * 2, h = vertical ? fs * 1.12 * chars.length + pad * 2 : fs * 1.15 + pad * 2;
    const c = K.mk(w * q, h * q), x = c.getContext('2d');
    x.scale(q, q);
    x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const rgb = col.join(',');
    const draw = () => { if (vertical) chars.forEach((ch, i) => x.fillText(ch, w / 2, pad + fs * 1.12 * (i + 0.5))); else x.fillText(txt, w / 2, h / 2 + fs * 0.04); };
    x.strokeStyle = `rgba(${rgb},${L ? 0.85 : 0.7})`; x.lineWidth = Math.max(1, fs * 0.08);
    if (!L) { x.shadowColor = `rgba(${rgb},1)`; x.shadowBlur = fs * 0.5; }
    x.strokeRect(pad * 0.42, pad * 0.42, w - pad * 0.84, h - pad * 0.84);
    x.fillStyle = `rgba(${rgb},${L ? 0.95 : 0.9})`; draw();
    if (!L) { x.shadowBlur = fs * 0.16; x.fillStyle = 'rgba(255,255,255,0.8)'; draw(); }
    const sp = { c, w, h };
    K.cache.set(key, sp);
    return sp;
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(2077), q = bg.dpr || 1;
    const [far, f] = K.layer(W, H, q), [mid, m] = K.layer(W, H, q), [near, n] = K.layer(W, H, q);
    const pal = L ? NEON_L : NEON, rc = (k, a) => `rgba(${pal[k].join(',')},${a})`;
    const beacons = [], signs = [], blinkers = [];

    // far: slim towers lost in the haze
    const inkF = L ? '#5a6086' : '#3c3270';
    for (let x = -u * 0.02; x < W;) {
      const bw = u * (0.025 + R() * 0.05), bh = H * (0.3 + R() * 0.36);
      f.fillStyle = inkF; f.fillRect(x, H - bh, bw, bh + 2);
      if (R() < 0.3) f.fillRect(x + bw * 0.45, H - bh - u * 0.04, Math.max(1, u * 0.003), u * 0.04);
      f.fillStyle = L ? 'rgba(255,255,255,0.4)' : 'rgba(176,156,255,0.4)';
      for (let i = 0; i < 7; i++) f.fillRect(x + R() * (bw - 2), H - bh + R() * bh * 0.8, Math.max(1, u * 0.0022), Math.max(1, u * 0.0022));
      x += bw + u * (0.004 + R() * 0.02);
    }

    // mid: the buildings that carry the signs
    const inkM = L ? '#34364e' : '#08060f';
    const building = (x, bw, bh, o = {}) => {
      const top = H - bh;
      m.fillStyle = inkM;
      if (o.taper) { m.beginPath(); m.moveTo(x, H + 2); m.lineTo(x + bw * 0.12, top); m.lineTo(x + bw * 0.88, top); m.lineTo(x + bw, H + 2); m.closePath(); m.fill(); } else m.fillRect(x, top, bw, bh + 2);
      let cap = top;
      if (o.step) {
        const sw = bw * (0.5 + R() * 0.25), sh = bh * (0.07 + R() * 0.1);
        m.fillRect(x + (bw - sw) / 2, top - sh, sw, sh + 1); cap = top - sh;
        if (R() < 0.6) { m.fillRect(x + (bw - sw * 0.45) / 2, cap - sh * 0.7, sw * 0.45, sh * 0.7 + 1); cap -= sh * 0.7; }
      }
      if (o.slant) { m.beginPath(); m.moveTo(x, top + 1); m.lineTo(x + bw, top - bw * 0.45); m.lineTo(x + bw, top + 1); m.closePath(); m.fill(); }
      if (o.ant !== 0 && R() < 0.7) { const ax = x + bw * (0.3 + R() * 0.4), ah = u * (0.03 + R() * 0.06); m.fillRect(ax, cap - ah, Math.max(1, u * 0.0025), ah + 1); beacons.push([ax + u * 0.00125, cap - ah, R() * 6]); }
      const cs = Math.max(2.4, u * 0.0095), inset = o.taper ? bw * 0.15 : cs * 0.9, cols = Math.max(1, Math.floor((bw - inset * 2) / (cs * 1.7))), rows = Math.floor((bh - cs * 2) / (cs * 2));
      const k1 = KEYS[(R() * 4) | 0], k2 = KEYS[(R() * 4) | 0];
      for (let r = 0; r < rows; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
          const lit = R();
          if (lit >= 0.22) continue;
          const wx = x + inset + c2 * ((bw - inset * 2) / cols), wy = top + cs * 1.4 + r * cs * 2;
          m.fillStyle = rc(R() < 0.7 ? k1 : k2, 0.3 + R() * 0.45); m.fillRect(wx, wy, cs * 0.9, cs * 0.8);
          if (lit < 0.012) blinkers.push({ x: wx, y: wy, w: cs * 0.9, h: cs * 0.8, k: k1, ph: R() * 6 });
        }
      }
      if (o.strip) { m.fillStyle = rc(o.strip, 0.8); m.fillRect(x + bw * (R() < 0.5 ? 0.06 : 0.9), top + bh * 0.05, Math.max(1.2, u * 0.003), bh * (0.4 + R() * 0.4)); }
      return { x, top, bw, bh, cap };
    };
    const blds = [];
    for (let x = -u * 0.03; x < W;) {
      const bw = u * (0.07 + R() * 0.09), bh = H * (0.22 + R() * 0.28);
      blds.push(building(x, bw, bh, { step: R() < 0.45, slant: R() < 0.15, strip: R() < 0.4 ? KEYS[(R() * 4) | 0] : null }));
      x += bw + u * (0.006 + R() * 0.03);
    }
    const tw = u * 0.12, tx = W * 0.73 - tw / 2, th = H * 0.7, mega = building(tx, tw, th, { taper: 1, ant: 0, strip: 'c' });
    m.fillStyle = inkM; m.fillRect(tx + tw * 0.45, mega.top - u * 0.05, tw * 0.1, u * 0.05 + 1);
    blds.forEach((b) => {
      if (R() > 0.66 || signs.length >= 11 || (b.x + b.bw > tx && b.x < tx + tw)) return;
      const vertical = R() < 0.65, fs = u * (0.02 + R() * 0.011), k = KEYS[(R() * 4) | 0], sp = signSprite(SIGNS[(R() * SIGNS.length) | 0], pal[k], vertical, fs, L, q);
      signs.push({ sp, x: vertical ? b.x + (R() < 0.5 ? -sp.w * 0.3 : b.bw - sp.w * 0.7) : b.x + (b.bw - sp.w) / 2, y: b.top + b.bh * (0.06 + R() * 0.22), ph: R() * 400 });
    });

    // near: the elevated line, then rooftops with their tanks, units, masts and cables
    const inkN = L ? '#22243a' : '#030208', ry = H * 0.64;
    n.fillStyle = inkN; n.strokeStyle = inkN;
    n.fillRect(0, ry, W, u * 0.007);
    for (let x = u * 0.1; x < W; x += u * 0.24) { n.fillRect(x, ry, u * 0.012, H); n.fillRect(x - u * 0.012, ry - u * 0.004, u * 0.036, u * 0.008); }
    const vents = [];
    for (let x = -u * 0.02; x < W;) {
      const bw = u * (0.12 + R() * 0.16), bh = H * (0.07 + R() * 0.1), top = H - bh, kind = R();
      n.fillRect(x, top, bw, bh + 2);
      if (kind < 0.3) {
        const cxk = x + bw * (0.25 + R() * 0.5), r = u * 0.022;
        n.fillRect(cxk - r, top - r * 2.6, r * 2, r * 1.7);
        n.beginPath(); n.moveTo(cxk - r * 1.1, top - r * 2.6); n.lineTo(cxk, top - r * 3.3); n.lineTo(cxk + r * 1.1, top - r * 2.6); n.fill();
        for (const d of [-0.8, 0, 0.8]) n.fillRect(cxk + d * r - 1, top - r * 0.95, 2, r);
      } else if (kind < 0.6) {
        for (let i = 0; i < 3; i++) n.fillRect(x + bw * (0.1 + i * 0.26), top - u * 0.014, u * 0.03, u * 0.014 + 1);
        const dx = x + bw * 0.85;
        n.beginPath(); n.arc(dx, top - u * 0.03, u * 0.016, Math.PI * 0.15, Math.PI * 1.15); n.fill(); n.fillRect(dx - 1, top - u * 0.03, 2, u * 0.03);
        vents.push([x + bw * 0.23, top - u * 0.014]);
      } else if (kind < 0.85) {
        const ax = x + bw * (0.2 + R() * 0.6), ah = u * (0.06 + R() * 0.06);
        n.fillRect(ax, top - ah, Math.max(1.2, u * 0.003), ah + 1);
        for (let i = 1; i < 4; i++) n.fillRect(ax - u * 0.012 * (1 - i / 5), top - ah * (i / 4.5), u * 0.024 * (1 - i / 5) + Math.max(1.2, u * 0.003), Math.max(1, u * 0.002));
        beacons.push([ax + u * 0.0015, top - ah, R() * 6]);
      }
      n.fillRect(x, top - u * 0.006, bw, Math.max(1, u * 0.002));
      x += bw + u * (0.004 + R() * 0.02);
    }
    n.lineWidth = Math.max(0.8, u * 0.0016);
    for (let i = 0; i < 4; i++) { const x0 = R() * W * 0.7, x1 = x0 + u * (0.3 + R() * 0.4), y0 = H * (0.8 + R() * 0.07), y1 = H * (0.8 + R() * 0.07); n.beginPath(); n.moveTo(x0, y0); n.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + u * 0.05, x1, y1); n.stroke(); }
    return { far, mid, near, beacons, signs, blinkers, vents, ry, mega: { x: tx, w: tw, top: mega.top - u * 0.05, h: th } };
  }

  window.drawCyber = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.72, 1.55), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'cyber' || st.key !== S.key) st = bg.st = { kind: 'cyber', key: S.key, cars: [], train: null, trainWait: 200 + Math.random() * 400, steam: [] };
    const pal = L ? NEON_L : NEON, rc = (k, a) => `rgba(${pal[k].join(',')},${a})`;
    ctx.save(); ctx.translate(0, -V.oy);

    // the light the city throws up into the rain
    K.glow(ctx, W * 0.24, H * 1.02, u * 0.75, [[0, rc('m', L ? 0.1 : 0.16)], [1, rc('m', 0)]], 1.3, 0.7);
    K.glow(ctx, W * 0.74, H * 1.0, u * 0.8, [[0, rc('c', L ? 0.08 : 0.12)], [1, rc('c', 0)]], 1.3, 0.7);
    K.put(ctx, S.far, W, H, L ? 0.16 : 0.3);

    // searchlights sweeping from behind the towers
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const [fx, ph, k] of [[0.42, 0, 'c'], [0.6, 2.4, 'v']]) {
      const a = -Math.PI / 2 + Math.sin(t * 0.006 + ph) * 0.5, x0 = W * fx, y0 = H * 0.66, len = u * 0.9, wd = 0.035;
      const g = ctx.createLinearGradient(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      g.addColorStop(0, rc(k, L ? 0.14 : 0.12)); g.addColorStop(1, rc(k, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a - wd) * len, y0 + Math.sin(a - wd) * len); ctx.lineTo(x0 + Math.cos(a + wd) * len, y0 + Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // traffic in the air: the far lanes pass behind the towers
    if (st.cars.length < (V.pv ? 3 : 9) && Math.random() < 0.045) {
      const lane = (Math.random() * 3) | 0, dir = lane % 2 ? -1 : 1, z = [0.55, 0.8, 1.2][lane];
      st.cars.push({ lane, x: dir > 0 ? -40 : W + 40, y: H * ([0.36, 0.5, 0.24][lane] + (Math.random() - 0.5) * 0.05), v: dir * (1.2 + Math.random() * 1.6) * z * (u / 700), z });
    }
    const car = (c) => {
      const len = u * 0.024 * c.z, dir = Math.sign(c.v);
      const g = ctx.createLinearGradient(c.x - dir * len * 5, 0, c.x, 0);
      g.addColorStop(0, 'rgba(255,60,70,0)'); g.addColorStop(1, `rgba(255,70,80,${L ? 0.7 : 0.6})`);
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, u * 0.0022 * c.z);
      ctx.beginPath(); ctx.moveTo(c.x - dir * len * 5, c.y); ctx.lineTo(c.x - dir * len * 0.5, c.y); ctx.stroke();
      ctx.fillStyle = L ? 'rgba(40,42,64,0.8)' : 'rgba(6,5,14,0.95)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, len * 0.62, len * 0.17, 0, 0, 7); ctx.fill();
      ctx.fillStyle = L ? 'rgba(20,130,170,0.95)' : 'rgba(215,250,255,0.95)';
      ctx.beginPath(); ctx.arc(c.x + dir * len * 0.62, c.y, Math.max(1, u * 0.0024 * c.z), 0, 7); ctx.fill();
    };
    for (const c of st.cars) { c.x += c.v; if (c.lane === 0) car(c); }

    K.put(ctx, S.mid, W, H, L ? 0.36 : 0.86);
    for (const b of S.blinkers) { const a = 0.5 + 0.5 * Math.sin(t * 0.05 + b.ph); ctx.fillStyle = rc(b.k, (L ? 0.8 : 0.7) * a); ctx.fillRect(b.x, b.y, b.w, b.h); }

    // the megatower: a ticker across it, a hologram turning over the mast
    const mg = S.mega, by = mg.top + mg.h * 0.3, bh = u * 0.034, bx = mg.x + mg.w * 0.13, bw = mg.w * 0.74;
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = rc('c', L ? 0.12 : 0.1); ctx.fillRect(bx, by, bw, bh);
    ctx.font = `700 ${bh * 0.62}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = rc('c', L ? 0.9 : 0.85);
    const msg = 'MINSUTERM  //  CLAUDE  //  CODEX  //  ', mw = ctx.measureText(msg).width || 1;
    for (let x = bx - ((t * 0.9) % mw); x < bx + bw; x += mw) ctx.fillText(msg, x, by + bh / 2);
    ctx.restore();
    const gx = mg.x + mg.w / 2, gr = u * 0.045, gy = mg.top - gr * 1.5;
    ctx.strokeStyle = rc('c', (L ? 0.55 : 0.42) * (0.85 + 0.15 * Math.sin(t * 0.7))); ctx.lineWidth = Math.max(0.8, u * 0.0014);
    for (let i = 0; i < 4; i++) { const rx = Math.abs(Math.cos(t * 0.012 + (i * Math.PI) / 4)) * gr; ctx.beginPath(); ctx.ellipse(gx, gy, Math.max(0.5, rx), gr, 0, 0, 7); ctx.stroke(); }
    for (const la of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(gx, gy + Math.sin(la) * gr, Math.cos(la) * gr, Math.cos(la) * gr * 0.22, 0, 0, 7); ctx.stroke(); }
    if (!L) K.glow(ctx, gx, gy, gr * 2.2, [[0, rc('c', 0.14)], [1, rc('c', 0)]]);

    // signs: mostly steady, now and then one stutters
    for (const sg of S.signs) {
      const cyc = (t + sg.ph) % 420, a = cyc < 14 ? (((cyc / 2) | 0) % 2 ? 0.9 : 0.2) : 0.82 + 0.1 * Math.sin(t * 0.08 + sg.ph);
      ctx.globalAlpha = a * (L ? 0.9 : 0.85);
      ctx.drawImage(sg.sp.c, sg.x, sg.y, sg.sp.w, sg.sp.h);
    }
    ctx.globalAlpha = 1;
    for (const c of st.cars) if (c.lane !== 0) car(c);
    st.cars = st.cars.filter((c) => c.x > -80 && c.x < W + 80);

    // the train on the elevated line
    if (!st.train && !V.pv && --st.trainWait <= 0) { const dir = Math.random() < 0.5 ? -1 : 1; st.train = { x: dir > 0 ? -u * 0.6 : W + u * 0.1, dir }; }
    if (st.train) {
      const tr = st.train, cl = u * 0.06, n = 8, ty = S.ry - u * 0.019;
      tr.x += tr.dir * 5.5 * (u / 700);
      for (let i = 0; i < n; i++) {
        const x = tr.x + i * cl * 1.04;
        ctx.fillStyle = L ? 'rgba(34,36,58,0.85)' : 'rgba(5,4,12,0.97)';
        ctx.beginPath(); ctx.roundRect(x, ty, cl, u * 0.019, u * 0.004); ctx.fill();
        ctx.fillStyle = rc(i % 3 ? 'a' : 'c', L ? 0.85 : 0.8);
        for (let k = 0; k < 5; k++) ctx.fillRect(x + cl * (0.08 + k * 0.18), ty + u * 0.004, cl * 0.12, u * 0.007);
      }
      if (tr.x > W + u * 0.1 || tr.x < -u * 0.7) { st.train = null; st.trainWait = 500 + Math.random() * 800; }
    }
    K.put(ctx, S.near, W, H, L ? 0.58 : 0.94);
    for (const [x, y, ph] of S.beacons) { const a = Math.max(0, Math.sin(t * 0.07 + ph)); if (a > 0.05) K.glow(ctx, x, y, u * 0.012, [[0, `rgba(255,50,50,${(L ? 0.9 : 0.85) * a})`], [1, 'rgba(255,50,50,0)']]); }

    // steam off the roofs
    for (const [vx, vy] of S.vents) if (Math.random() < 0.06) st.steam.push({ x: vx, y: vy, r: u * 0.008, life: 1, vx: (Math.random() - 0.3) * 0.25 });
    for (const p of st.steam) { p.y -= 0.5 * (u / 700); p.x += p.vx; p.r += u * 0.0005; p.life -= 0.008; K.glow(ctx, p.x, p.y, p.r, [[0, L ? `rgba(120,124,150,${0.12 * p.life})` : `rgba(200,205,235,${0.1 * p.life})`], [1, 'rgba(200,205,235,0)']]); }
    st.steam = st.steam.filter((p) => p.life > 0);

    // rain, two depths
    ctx.lineCap = 'round';
    for (const [n, sp, len, a, lw] of [[70, 9, 0.02, L ? 0.2 : 0.16, 0.9], [36, 15, 0.034, L ? 0.26 : 0.22, 1.3]]) {
      ctx.strokeStyle = L ? `rgba(70,84,130,${a})` : `rgba(160,220,255,${a})`; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const rx = ((i * 97.13 + sp * 31 + t * sp * 0.22) % (W + 60)) - 30, ryy = ((i * 53.7 + t * sp) % (H + 60)) - 30; ctx.moveTo(rx, ryy); ctx.lineTo(rx - u * len * 0.22, ryy + u * len); }
      ctx.stroke();
    }
    ctx.restore();
  };
})();
