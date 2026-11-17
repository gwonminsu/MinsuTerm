'use strict';
/*
 * 눈: snow in depth. Fine far flakes, soft nearer ones, fat ones closer still, a few out of focus near the glass,
 * and the odd six-armed crystal turning as it falls. The wind leans on all of it and now and then gusts, and
 * spindrift runs along the bottom edge. On a light page the snow is drawn in blue-grey, the colour snow has in
 * shadow (white on white would not show).
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('snow');
  const TAU = Math.PI * 2;
  const COL = (L) => (L ? '92,118,162' : '236,242,255');

  /** A soft flake: a firm core melting into its edge. */
  function dotSprite(L) {
    const key = `snDot${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(32, 32), x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${COL(L)},1)`); g.addColorStop(0.36, `rgba(${COL(L)},0.92)`); g.addColorStop(0.7, `rgba(${COL(L)},0.26)`); g.addColorStop(1, `rgba(${COL(L)},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    K.cache.set(key, c);
    return c;
  }
  /** A flake close to the glass, out of focus: a pale disc with no edge to speak of. */
  function bokehSprite(L) {
    const key = `snBokeh${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${COL(L)},0.95)`); g.addColorStop(0.45, `rgba(${COL(L)},0.7)`); g.addColorStop(0.78, `rgba(${COL(L)},0.22)`); g.addColorStop(1, `rgba(${COL(L)},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    K.cache.set(key, c);
    return c;
  }
  /** A six-armed crystal; v: 0 fern-like, 1 a plate with short arms, 2 broad arms with forked tips. */
  function crystalSprite(v, L) {
    const key = `snCrystal${v}${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(96, 96), x = c.getContext('2d');
    x.translate(48, 48);
    x.strokeStyle = `rgba(${COL(L)},1)`; x.fillStyle = `rgba(${COL(L)},0.35)`; x.lineCap = 'round'; x.lineJoin = 'round';
    const arm = 40, side = v === 0 ? [[0.34, 0.36], [0.56, 0.28], [0.76, 0.16]] : v === 1 ? [[0.62, 0.2], [0.82, 0.12]] : [[0.5, 0.3]];
    for (let k = 0; k < 6; k++) {
      x.save(); x.rotate((k / 6) * TAU);
      x.lineWidth = v === 2 ? 5.6 : 4.2;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -arm); x.stroke();
      x.lineWidth = v === 2 ? 4.4 : 3.4;
      for (const [at, len] of side) for (const d of [-1, 1]) { x.beginPath(); x.moveTo(0, -arm * at); x.lineTo(d * arm * len * 0.87, -arm * at - arm * len * 0.5); x.stroke(); }
      if (v === 2) for (const d of [-1, 1]) { x.beginPath(); x.moveTo(0, -arm); x.lineTo(d * arm * 0.13, -arm * 1.12); x.stroke(); }
      x.restore();
    }
    const hex = v === 1 ? 0.42 : 0.16;
    x.lineWidth = 3.4;
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + TAU / 12; x[k ? 'lineTo' : 'moveTo'](Math.cos(a) * arm * hex, Math.sin(a) * arm * hex); }
    x.closePath(); x.fill(); x.stroke();
    K.cache.set(key, c);
    return c;
  }

  function init(W, H, s, pv, key) {
    const area = (W * H) / 40000, R = Math.random;
    const mk = (n, f) => Array.from({ length: Math.max(0, Math.round(n)) }, f);
    const at = () => ({ x: R() * W, y: R() * H, ph: R() * TAU });
    return {
      kind: 'snow', key, gustWait: 240 + R() * 500, gustT: 1e9, gustLen: 1, gustDir: 1,
      far: mk(Math.max(pv ? 10 : 30, area * 8), () => ({ ...at(), r: Math.max(0.35, (0.6 + R() * 0.65) * s), a: 0.3 + R() * 0.24, v: 0.24 + R() * 0.3, wf: 0.42, sp: 0.012 + R() * 0.02, sw: 0.18 })),
      mid: mk(Math.max(pv ? 6 : 14, area * 3.6), () => ({ ...at(), d: (3.8 + R() * 3) * s * (pv ? 1.25 : 1), a: 0.55 + R() * 0.25, v: 0.55 + R() * 0.45, wf: 1, sp: 0.016 + R() * 0.02, sw: 0.4 })),
      close: mk(Math.max(pv ? 2 : 4, area * 0.9), () => ({ ...at(), d: (8.5 + R() * 6) * s, a: 0.4 + R() * 0.2, v: 0.85 + R() * 0.5, wf: 1.35, sp: 0.014 + R() * 0.014, sw: 0.6 })),
      near: mk(Math.max(pv ? 1 : 2, area * 0.28), () => ({ ...at(), d: (30 + R() * 30) * s, a: 0.07 + R() * 0.05, v: 1.25 + R() * 0.7, wf: 1.8, sp: 0.01 + R() * 0.012, sw: 0.8 })),
      crystals: mk(pv ? 1 : Math.max(3, area * 0.28), () => ({ ...at(), d: (20 + R() * 13) * s * (pv ? 1.3 : 1), a: 0.5 + R() * 0.16, v: 0.34 + R() * 0.26, wf: 0.8, sp: 0.01 + R() * 0.012, sw: 0.5, rot: R() * TAU, vr: (R() < 0.5 ? -1 : 1) * (0.004 + R() * 0.009), k: (R() * 3) | 0 })),
    };
  }

  (window.BG_EXT = window.BG_EXT || {}).snow = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), { W, H, u } = V, L = K.light();
    const s = V.pv ? 0.42 : Math.max(0.6, Math.min(1.2, u / 700));
    const key = `${W}x${H}${L ? 'L' : 'D'}`;
    let st = bg.st;
    if (!st || st.kind !== 'snow' || st.key !== key) st = bg.st = init(W, H, s, V.pv, key);

    // the wind: a slow lean one way, and a gust now and then
    if (!V.pv && --st.gustWait <= 0) { st.gustWait = 420 + Math.random() * 700; st.gustDir = Math.random() < 0.35 ? -1 : 1; st.gustT = 0; st.gustLen = 110 + Math.random() * 90; }
    let gust = 0;
    if (st.gustT < st.gustLen) { gust = Math.sin((Math.PI * st.gustT) / st.gustLen) ** 2 * st.gustDir * 1.7; st.gustT++; }
    const wind = (0.2 + 0.18 * Math.sin(t * 0.0041) + gust) * s;
    const fall = (f, m) => {
      f.ph += f.sp; f.y += f.v * s; f.x += wind * f.wf + Math.sin(f.ph) * f.sw * s;
      if (f.y > H + m) { f.y = -m; f.x = Math.random() * (W + m * 2) - m; }
      if (f.x > W + m) f.x -= W + m * 2; else if (f.x < -m) f.x += W + m * 2;
    };
    const k = L ? 1.2 : 1; // a pale page needs a little more ink

    ctx.fillStyle = `rgb(${COL(L)})`;
    for (const f of st.far) {
      fall(f, 3);
      ctx.globalAlpha = Math.min(1, f.a * k * (0.72 + 0.28 * Math.sin(f.ph * 3)));
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
    }
    const dot = dotSprite(L);
    for (const f of st.mid) {
      fall(f, f.d);
      ctx.globalAlpha = Math.min(1, f.a * k);
      ctx.drawImage(dot, f.x - f.d / 2, f.y - f.d / 2, f.d, f.d);
    }
    for (const f of st.close) {
      fall(f, f.d);
      ctx.globalAlpha = Math.min(1, f.a * k);
      ctx.drawImage(dot, f.x - f.d / 2, f.y - f.d / 2, f.d, f.d);
    }
    for (const f of st.crystals) {
      fall(f, f.d);
      f.rot += f.vr;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(1, 0.8 + 0.2 * Math.cos(f.ph * 0.7));
      ctx.globalAlpha = Math.min(1, f.a * k);
      ctx.drawImage(crystalSprite(f.k, L), -f.d / 2, -f.d / 2, f.d, f.d);
      ctx.restore();
    }
    const bokeh = bokehSprite(L);
    for (const f of st.near) {
      fall(f, f.d);
      ctx.globalAlpha = Math.min(1, f.a * k);
      ctx.drawImage(bokeh, f.x - f.d / 2, f.y - f.d / 2, f.d, f.d);
    }
    ctx.globalAlpha = 1;

    // spindrift along the bottom edge, going the way the wind goes
    st.drift = (st.drift || 0) + wind * 1.4 + 0.25 * s;
    const haze = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#5c76a2' : '#ecf2ff');
    K.band(ctx, haze, W, H - u * 0.06, u * 0.1, u * 1.5, -st.drift, (L ? 0.1 : 0.12) * (1 + Math.min(1, Math.abs(gust)) * 0.5));
  };
})();
