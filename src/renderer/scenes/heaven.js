'use strict';
/*
 * 천상: a light at the top of the sky. Rings of small angels turn around it, larger ones attend on both sides
 * above a sea of cloud, and rays, motes and the odd feather come down through it all.
 */
(function () {
  const K = window.SceneKit;

  function feather(c, x, y, ang, len, wid, fill, edge) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(len * 0.3, -wid, len * 0.82, -wid * 0.85, len, 0);
    c.bezierCurveTo(len * 0.82, wid * 0.7, len * 0.3, wid * 0.85, 0, 0);
    c.fillStyle = fill; c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = 0.7; c.stroke(); }
    c.restore();
  }

  /** Angel parts at scale q: one wing (opening right and up from the shoulder) and a robed figure seen from the front, hands joined. */
  function parts(L, q) {
    const key = `angel${L ? 'L' : 'D'}${q.toFixed(2)}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const edge = L ? 'rgba(176,132,58,0.8)' : 'rgba(176,152,110,0.45)';
    const back = L ? 'rgba(250,240,216,0.97)' : 'rgba(228,222,206,0.96)', front = L ? 'rgba(255,253,244,0.99)' : 'rgba(255,254,248,0.99)';
    const WW = 216, WH = 196, wox = 14, woy = 122;
    const wing = K.mk(WW * q, WH * q);
    let x = wing.getContext('2d');
    x.scale(q, q); x.translate(wox, woy); x.lineCap = 'round'; x.lineJoin = 'round';
    const S = [0, 0], E = [50, -46], Wr = [102, -66];
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const arm = (t) => (t < 0.5 ? lerp(S, E, t * 2) : lerp(E, Wr, t * 2 - 1));
    for (let i = 9; i >= 0; i--) { const tt = i / 9; feather(x, Wr[0] - tt * 12, Wr[1] + tt * 8, -0.45 + tt * 1.62, 92 - 28 * tt, 9.5 - tt * 2, back, edge); } // primaries fan out from the wrist
    for (let i = 0; i <= 10; i++) { const tt = i / 10, p = arm(1 - tt * 0.92); feather(x, p[0], p[1] + 2, 1.2 + tt * 0.28, 66 - 28 * tt, 8.5, back, edge); } // secondaries
    for (let i = 0; i <= 13; i++) { const tt = i / 13, p = arm(1 - tt * 0.95); feather(x, p[0], p[1], 1.1 + tt * 0.3, 36 - 12 * tt, 6.5, front, edge); } // greater coverts
    for (let i = 0; i <= 12; i++) { const tt = i / 12, p = arm(1.02 - tt * 0.98); feather(x, p[0] - 1, p[1] - 2, 0.95 + tt * 0.3, 19 - 5 * tt, 5, front, edge); } // lesser coverts
    x.strokeStyle = front; x.lineWidth = 9;
    x.beginPath(); x.moveTo(S[0], S[1]); x.quadraticCurveTo(E[0], E[1] - 6, Wr[0] + 6, Wr[1] - 2); x.stroke(); // the leading edge
    if (L) { x.strokeStyle = edge; x.lineWidth = 1; x.beginPath(); x.moveTo(S[0] - 2, S[1] - 5); x.quadraticCurveTo(E[0], E[1] - 11, Wr[0] + 9, Wr[1] - 6); x.stroke(); }

    const BW = 96, BH = 222, box = 48, boy = 62;
    const body = K.mk(BW * q, BH * q);
    x = body.getContext('2d');
    x.scale(q, q); x.translate(box, boy); x.lineCap = 'round'; x.lineJoin = 'round';
    const g = x.createLinearGradient(0, -20, 0, 156); // the robe thins away at the hem: they do not stand on anything
    g.addColorStop(0, 'rgba(255,255,251,0.99)'); g.addColorStop(0.6, L ? 'rgba(252,242,218,0.93)' : 'rgba(255,247,226,0.84)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    x.beginPath();
    x.moveTo(-7, -14); x.quadraticCurveTo(-15, -12, -17, -4);
    x.quadraticCurveTo(-24, 18, -19, 40);
    x.quadraticCurveTo(-29, 96, -37, 150);
    x.quadraticCurveTo(-18, 159, 0, 153); x.quadraticCurveTo(18, 159, 37, 150);
    x.quadraticCurveTo(29, 96, 19, 40);
    x.quadraticCurveTo(24, 18, 17, -4);
    x.quadraticCurveTo(15, -12, 7, -14);
    x.closePath(); x.fillStyle = g; x.fill();
    if (L) { x.strokeStyle = edge; x.lineWidth = 1; x.stroke(); }
    x.strokeStyle = L ? 'rgba(176,132,58,0.42)' : 'rgba(196,176,136,0.36)'; x.lineWidth = 1; // folds falling from the girdle
    for (const k of [-0.72, -0.36, 0, 0.36, 0.72]) { x.beginPath(); x.moveTo(k * 15, 60); x.quadraticCurveTo(k * 23, 102, k * 42, 147); x.stroke(); }
    x.fillStyle = front; // wide sleeves, forearms meeting at the chest
    for (const d of [-1, 1]) {
      x.beginPath(); x.moveTo(d * 17, -3); x.quadraticCurveTo(d * 26, 14, d * 21, 31); x.quadraticCurveTo(d * 22, 47, d * 15, 53); x.quadraticCurveTo(d * 8, 34, d * 1.6, 17); x.lineTo(d * 1.6, 6); x.quadraticCurveTo(d * 9, 4, d * 17, -3); x.closePath(); x.fill();
      if (L) { x.strokeStyle = edge; x.lineWidth = 0.9; x.stroke(); }
    }
    x.fillStyle = 'rgba(255,250,240,1)'; x.beginPath(); x.ellipse(0, 9, 3.3, 6.6, 0, 0, 7); x.fill(); // joined hands
    x.strokeStyle = L ? 'rgba(214,160,50,0.85)' : 'rgba(255,214,120,0.75)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-19, 55); x.quadraticCurveTo(0, 61, 19, 55); x.stroke(); // a golden girdle
    x.fillStyle = L ? 'rgba(214,168,86,0.95)' : 'rgba(242,216,152,0.97)'; // hair to the shoulders
    x.beginPath(); x.ellipse(0, -27, 12, 12.5, 0, 0, 7); x.fill();
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(d * 11, -27); x.quadraticCurveTo(d * 17, -9, d * 11, 2); x.lineTo(d * 6, -14); x.closePath(); x.fill(); }
    x.fillStyle = 'rgba(255,251,242,1)'; x.beginPath(); x.ellipse(0, -23.5, 8, 9.4, 0, 0, 7); x.fill(); // a bowed face
    x.strokeStyle = L ? 'rgba(214,160,50,0.95)' : 'rgba(255,214,120,0.97)'; x.lineWidth = 2.4; x.shadowColor = 'rgba(255,200,90,0.9)'; x.shadowBlur = 8;
    x.beginPath(); x.ellipse(0, -44, 13, 3.8, 0, 0, 7); x.stroke();
    const P = { wing, WW, WH, wox, woy, body, BW, BH, box, boy };
    K.cache.set(key, P);
    return P;
  }

  /** size = height of the figure; lean tips it toward the light; flap -1..1. */
  function angel(ctx, P, x, y, size, lean, flap, alpha) {
    const s = size / 205;
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    for (const d of [-1, 1]) { ctx.save(); ctx.translate(d * 7, -6); ctx.scale(d * 0.8, 0.8); ctx.rotate(-0.08 - flap * 0.13); ctx.drawImage(P.wing, -P.wox, -P.woy, P.WW, P.WH); ctx.restore(); }
    ctx.drawImage(P.body, -P.box, -P.boy, P.BW, P.BH);
    ctx.restore();
  }

  /** A small angel seen from afar, wings spread. */
  function cherub(L) {
    const key = `cherub${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(96, 72), x = c.getContext('2d');
    x.scale(1.5, 1.5); x.translate(32, 26);
    const col = L ? 'rgba(204,156,64,0.96)' : 'rgba(255,249,230,0.98)';
    if (!L) { x.shadowColor = 'rgba(255,214,130,0.95)'; x.shadowBlur = 6; }
    for (const d of [-1, 1]) for (let i = 0; i < 4; i++) feather(x, d * 3, -3, d > 0 ? -0.55 + i * 0.33 : Math.PI + 0.55 - i * 0.33, 21 - i * 3.2, 3.3, col, null);
    x.fillStyle = col;
    x.beginPath(); x.moveTo(-3.6, -4); x.quadraticCurveTo(-6.5, 10, 0, 19); x.quadraticCurveTo(6.5, 10, 3.6, -4); x.closePath(); x.fill();
    x.beginPath(); x.arc(0, -8, 4, 0, 7); x.fill();
    x.shadowBlur = 0; x.strokeStyle = L ? 'rgba(214,160,50,0.9)' : 'rgba(255,214,120,0.97)'; x.lineWidth = 1.2;
    x.beginPath(); x.ellipse(0, -14.5, 5, 1.5, 0, 0, 7); x.stroke();
    K.cache.set(key, c);
    return c;
  }

  window.drawHeaven = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.08, 1.5), { W, H, u } = V, L = K.light();
    let st = bg.st;
    if (!st || st.kind !== 'heaven' || st.key !== `${W}x${H}`) {
      const R = K.rng(77);
      st = bg.st = { kind: 'heaven', key: `${W}x${H}`,
        rays: Array.from({ length: 24 }, (_, i) => ({ a: (i / 24) * Math.PI * 2 + (R() - 0.5) * 0.16, w: 0.018 + R() * 0.04, ph: R() * 6, sp: 0.006 + R() * 0.012 })),
        motes: Array.from({ length: V.pv ? 10 : 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.12 + Math.random() * 0.4, r: (0.6 + Math.random() * 1.5) * V.z, ph: Math.random() * 6 })),
        feathers: [] };
    }
    const cx = W / 2, cy = H * 0.17, gold = L ? '236,178,66' : '255,232,160';
    const P = parts(L, Math.min(2, Math.max(0.6, ((u * 0.34) / 205) * (bg.dpr || 1))));
    const ch = cherub(L);
    ctx.save(); ctx.translate(0, -V.oy);

    // rays from the light, the downward ones strongest
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    const len = Math.hypot(W, H) * 1.05;
    for (const r of st.rays) {
      const a = r.a + Math.sin(t * 0.002 + r.ph) * 0.02, down = Math.max(0, Math.sin(a));
      const al = (L ? 0.075 : 0.05) * (0.25 + 0.75 * down) * (0.55 + 0.45 * Math.sin(t * r.sp + r.ph));
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.addColorStop(0, `rgba(${gold},${al})`); g.addColorStop(0.65, `rgba(${gold},${al * 0.25})`); g.addColorStop(1, `rgba(${gold},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - r.w) * len, cy + Math.sin(a - r.w) * len); ctx.lineTo(cx + Math.cos(a + r.w) * len, cy + Math.sin(a + r.w) * len); ctx.closePath(); ctx.fill();
    }
    K.glow(ctx, cx, (cy + H) / 2, u * 0.2, [[0, `rgba(${gold},${L ? 0.08 : 0.05})`], [1, `rgba(${gold},0)`]], 1, ((H - cy) * 0.62) / (u * 0.2)); // the way down from the light
    ctx.globalCompositeOperation = 'source-over';

    // rings of small angels around the light: the far half of each ring first
    const rings = [[0.16, 13, 0.0042], [0.255, 19, -0.003], [0.36, 26, 0.0022]];
    const ring = (front) => {
      for (const [rr, n, sp] of rings) {
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2 + t * sp, d = Math.sin(th);
          if (d >= 0 !== front) continue;
          const x = cx + Math.cos(th) * rr * u, y = cy + d * rr * u * 0.3 + Math.sin(t * 0.03 + i * 1.7) * u * 0.003;
          const sz = u * 0.052 * (1 + 0.28 * d);
          ctx.globalAlpha = (L ? 0.4 : 0.26) + (L ? 0.35 : 0.3) * (d * 0.5 + 0.5);
          ctx.drawImage(ch, x - sz / 2, y - sz * 0.36, sz, sz * 0.75);
        }
      }
      ctx.globalAlpha = 1;
    };
    ring(false);
    K.glow(ctx, cx, cy, u * 0.5, L
      ? [[0, 'rgba(255,238,176,0.62)'], [0.18, 'rgba(250,208,112,0.24)'], [1, 'rgba(250,200,100,0)']]
      : [[0, 'rgba(255,249,224,0.72)'], [0.08, 'rgba(255,232,164,0.34)'], [0.32, 'rgba(255,206,120,0.1)'], [1, 'rgba(255,200,110,0)']]);
    ctx.fillStyle = L ? 'rgba(255,250,226,0.9)' : 'rgba(255,255,246,0.92)';
    ctx.beginPath(); ctx.arc(cx, cy, u * 0.017, 0, 7); ctx.fill();
    for (const [rot, ln] of [[t * 0.0012, 0.24], [t * 0.0012 + Math.PI / 2, 0.19], [t * 0.0012 + Math.PI / 4, 0.09], [t * 0.0012 - Math.PI / 4, 0.09]]) { // the star of light
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      const g = ctx.createLinearGradient(-u * ln, 0, u * ln, 0);
      g.addColorStop(0, `rgba(${gold},0)`); g.addColorStop(0.5, `rgba(${L ? '250,214,130' : '255,250,226'},${L ? 0.6 : 0.58})`); g.addColorStop(1, `rgba(${gold},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-u * ln, 0); ctx.lineTo(0, -u * 0.005); ctx.lineTo(u * ln, 0); ctx.lineTo(0, u * 0.005); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ring(true);

    // a sea of cloud, three banks deep (each runs past the bottom edge), and the angels who attend above it
    const cl = K.noiseTex('hvSea', 512, 192, { px: 6, py: 2, oct: 5, lo: 0.36, hi: 0.68, warp: 1.3, env: 'sea', seed: 21 });
    const cA = K.tint(cl, L ? '#ead8b2' : '#f3e2bd'), cB = K.tint(cl, '#ffffff');
    const sea = (y, tw, off, a) => { const hh = H - y + u * 0.06; K.band(ctx, cA, W, y, hh, tw, off, a); K.band(ctx, cB, W, y - u * 0.007, hh, tw, off, a * (L ? 0.85 : 0.3)); };
    sea(H * 0.6, u * 1.9, t * 0.1, L ? 0.42 : 0.24);
    const att = [[0.36, 0.43, 0.16, 0.2], [0.62, 0.56, 0.235, 1.9], [0.93, 0.68, 0.33, 3.7]];
    for (const side of [-1, 1]) {
      for (const [dx, fy, sz, ph] of att) {
        const x = cx + side * u * dx, y = H * fy + Math.sin(t * 0.021 + ph + side) * u * 0.008, size = u * sz;
        if (!L) K.glow(ctx, x, y + size * 0.1, size * 0.8, [[0, 'rgba(255,224,150,0.12)'], [1, 'rgba(255,224,150,0)']]);
        angel(ctx, P, x, y, size, -side * 0.1, Math.sin(t * 0.05 + ph * 2 + side), L ? 0.62 : 0.55);
      }
    }
    ctx.globalAlpha = 1;
    sea(H * 0.72, u * 1.5, -t * 0.16 + 300, L ? 0.55 : 0.32);
    sea(H * 0.84, u * 1.2, t * 0.24 + 700, L ? 0.7 : 0.42);

    // motes of light rising, feathers coming down
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (const m of st.motes) {
      m.ph += 0.04; m.y -= m.v; m.x += Math.sin(m.ph * 0.5) * 0.2;
      if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      ctx.fillStyle = `rgba(${L ? '214,160,60' : '255,236,170'},${(L ? 0.42 : 0.45) * (0.4 + 0.6 * Math.sin(m.ph) ** 2)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.02 && st.feathers.length < 12) st.feathers.push({ x: Math.random() * W, y: -12, r: Math.random() * 6, vy: 0.35 + Math.random() * 0.4, s: u * (0.014 + Math.random() * 0.012) });
    for (const f of st.feathers) {
      f.r += 0.035; f.x += Math.sin(f.r) * 0.7; f.y += f.vy * (0.7 + 0.3 * Math.cos(f.r * 2));
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.sin(f.r) * 0.9 + 1.2);
      feather(ctx, -f.s, 0, 0, f.s * 2, f.s * 0.42, L ? 'rgba(255,255,255,0.9)' : 'rgba(255,252,240,0.6)', L ? 'rgba(176,132,58,0.6)' : 'rgba(200,180,140,0.25)');
      ctx.strokeStyle = L ? 'rgba(176,132,58,0.5)' : 'rgba(210,190,150,0.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-f.s * 1.15, 0); ctx.lineTo(f.s, 0); ctx.stroke();
      ctx.restore();
    }
    st.feathers = st.feathers.filter((f) => f.y < H + 20);
    ctx.restore();
  };
})();
