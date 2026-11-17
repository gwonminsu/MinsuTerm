'use strict';
/*
 * 해파리: jellyfish drifting up through the dark. Each one pulses: the bell closes and pushes it along, then opens
 * again while it coasts. Four frilled oral arms and a fringe of fine tentacles trail behind and lag in the turns.
 * Drawn in the theme's accent colours over the theme's own background; a nearer bell hides what is behind it.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('jellyfish');
  const TAU = Math.PI * 2;
  const mix = (c, d, k) => [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);

  /** A smooth line through points (quadratics through the midpoints), continuing the current path. */
  function through(c, pts, move) {
    if (move) c.moveTo(pts[0][0], pts[0][1]); else c.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }

  function spawn(W, H, unit, pv, i, n, anywhere) {
    const z = Math.random(), R = unit * (0.03 + 0.034 * z); // depth: 0 far … 1 near; R: the bell's radius
    const tl = pv ? 1.7 + Math.random() * 0.7 : 2.3 + Math.random() * 1.3;
    return {
      z, R, c: (Math.random() * 3) | 0, seed: Math.random() * 100,
      x: anywhere ? W * ((i + 0.15 + Math.random() * 0.7) / n) : W * (0.06 + Math.random() * 0.88),
      y: anywhere ? H * (0.1 + Math.random() * 0.9) : H + R * 2.5,
      ph: Math.random() * TAU, rate: 0.03 + Math.random() * 0.014,
      v: (0.2 + 0.26 * z) * (unit / 735) * (0.8 + Math.random() * 0.5),
      th: (Math.random() - 0.5) * 0.5, tt: (Math.random() - 0.5) * 0.6, lag: 0, turn: 120 + Math.random() * 400,
      tent: pv ? 6 : 10 + ((Math.random() * 5) | 0), tl, al: (pv ? 1.05 : 1.25) + Math.random() * 0.6,
    };
  }

  function draw(ctx, j, col, L, pv) {
    const R = j.R, open = 0.5 + 0.5 * Math.cos(j.ph), coast = Math.max(0, -Math.sin(j.ph));
    const bw = R * (0.84 + 0.22 * open), bh = R * (0.98 - 0.2 * open), ry = bw * 0.2; // ry: how deep the rim's ellipse looks
    const far = 0.55 + 0.45 * j.z; // the far ones are fainter
    const a = (m) => rgba(col, m * far);
    const pale = mix(col, [255, 255, 255], L ? 0.25 : 0.55), deep = L ? mix(col, [28, 30, 64], 0.3) : col;
    const bend = Math.max(-0.45, Math.min(0.45, j.lag - j.th)), lw = Math.max(0.5, R * 0.03);
    ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(j.th);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    K.glow(ctx, 0, -bh * 0.4, R * 2.7, [[0, rgba(col, (L ? 0.07 : 0.13) * far)], [1, rgba(col, 0)]]);

    // the fringe of fine tentacles: they billow while it coasts and straighten when it pushes
    const tl = R * j.tl * (0.9 + 0.1 * coast), ns = pv ? 5 : 9;
    const tg = ctx.createLinearGradient(0, 0, 0, tl);
    tg.addColorStop(0, rgba(deep, (L ? 0.5 : 0.36) * far)); tg.addColorStop(0.7, rgba(deep, (L ? 0.24 : 0.16) * far)); tg.addColorStop(1, rgba(deep, 0));
    ctx.strokeStyle = tg; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let k = 0; k < j.tent; k++) {
      const ang = Math.PI * ((k + 0.5) / j.tent), rx = Math.cos(ang) * bw * 0.96, r0 = Math.sin(ang) * ry * 0.5;
      const len = tl * (0.7 + 0.3 * Math.sin(k * 2.4 + j.seed) ** 2), amp = R * (0.09 + 0.17 * coast), pts = [[rx, r0 - bh * 0.05]];
      for (let i = 1; i <= ns; i++) {
        const f = i / ns;
        pts.push([rx * (1 - 0.3 * f * (1 - open)) + Math.sin(j.ph * 1.2 - i * 0.62 + k * 1.3 + j.seed) * amp * Math.pow(f, 1.1) + bend * len * f * f * 1.1, r0 + len * f]);
      }
      through(ctx, pts, true);
    }
    ctx.stroke();

    // four oral arms: frilled ribbons from under the middle of the bell
    const al = R * j.al, na = pv ? 5 : 10;
    for (let k = 0; k < 4; k++) {
      const rx = bw * (-0.3 + 0.2 * k), sd = j.seed + k * 2.1, lf = [], rt = [];
      for (let i = 0; i <= na; i++) {
        const f = i / na, y = -bh * 0.3 + (al + bh * 0.3) * f;
        const cx = rx * (1 - 0.4 * f) + Math.sin(j.ph * 0.9 - i * 0.5 + sd) * R * (0.07 + 0.1 * coast) * f + bend * al * f * f;
        const wv = R * 0.11 * (1 - 0.78 * f) * (1 + 0.35 * Math.sin(i * 1.9 + sd + j.ph * 0.5));
        lf.push([cx - wv, y]); rt.push([cx + wv * (1 + 0.45 * Math.sin(i * 2.6 + sd)), y]);
      }
      ctx.beginPath(); through(ctx, lf, true); through(ctx, rt.reverse(), false); ctx.closePath();
      ctx.fillStyle = a(L ? 0.2 : 0.17); ctx.fill();
      ctx.strokeStyle = a(L ? 0.34 : 0.26); ctx.lineWidth = lw * 0.8; ctx.stroke();
    }

    // the bell: a dome over a scalloped rim
    const bell = new Path2D(), sc = pv ? 4 : 8;
    bell.moveTo(-bw, 0);
    bell.bezierCurveTo(-bw * 1.06, -bh * 0.72, -bw * 0.6, -bh, 0, -bh);
    bell.bezierCurveTo(bw * 0.6, -bh, bw * 1.06, -bh * 0.72, bw, 0);
    for (let i = 0; i < sc; i++) {
      const a1 = Math.PI * ((i + 1) / sc), am = Math.PI * ((i + 0.5) / sc);
      bell.quadraticCurveTo(Math.cos(am) * bw, Math.sin(am) * ry + ry * 0.6 + bh * 0.03, Math.cos(a1) * bw, Math.sin(a1) * ry);
    }
    bell.closePath();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fill(bell); ctx.restore(); // it hides what is behind it
    const bf = ctx.createRadialGradient(0, -bh * 0.5, bw * 0.05, 0, -bh * 0.35, bw * 1.15);
    bf.addColorStop(0, rgba(pale, (L ? 0.36 : 0.42) * far)); bf.addColorStop(0.55, a(L ? 0.25 : 0.23)); bf.addColorStop(1, a(L ? 0.17 : 0.11));
    ctx.fillStyle = bf; ctx.fill(bell);

    ctx.save(); ctx.clip(bell); // what shows through it
    ctx.strokeStyle = a(L ? 0.3 : 0.24); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.98, ry, 0, Math.PI, TAU); ctx.stroke(); // the far side of the rim
    if (!pv) {
      ctx.beginPath(); // canals running from the crown to the rim
      for (let i = 0; i <= 8; i++) { const an = Math.PI * (i / 8); ctx.moveTo(Math.cos(an) * bw * 0.12, -bh * 0.82); ctx.quadraticCurveTo(Math.cos(an) * bw * 0.72, -bh * 0.62, Math.cos(an) * bw * 0.97, Math.sin(an) * ry * 0.9); }
      ctx.strokeStyle = a(L ? 0.24 : 0.19); ctx.lineWidth = lw * 0.7; ctx.stroke();
    }
    if (R > 9) { // the four loops at its heart
      ctx.strokeStyle = rgba(pale, (L ? 0.6 : 0.5) * far); ctx.lineWidth = lw * 1.4;
      for (const [gx, gy, sq] of [[-0.31, -0.44, 0.6], [-0.115, -0.5, 1], [0.115, -0.5, 1], [0.31, -0.44, 0.6]]) { ctx.beginPath(); ctx.ellipse(gx * bw, gy * bh, bw * 0.105 * sq, bh * 0.17, 0, Math.PI * 0.94, Math.PI * 2.06); ctx.stroke(); }
    }
    ctx.restore();

    ctx.strokeStyle = a(L ? 0.62 : 0.5); ctx.lineWidth = lw * 1.2; ctx.stroke(bell);
    ctx.strokeStyle = `rgba(255,255,255,${(L ? 0.5 : 0.3) * far})`; ctx.lineWidth = lw * 1.6; // the light catching its shoulder
    ctx.beginPath(); ctx.moveTo(-bw * 0.64, -bh * 0.5); ctx.quadraticCurveTo(-bw * 0.52, -bh * 0.86, -bw * 0.16, -bh * 0.93); ctx.stroke();
    ctx.restore();
  }

  window.BG_EXT = window.BG_EXT || {};
  window.BG_EXT.jellyfish = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), pv = V.pv, L = K.light(), unit = pv ? 132 : Math.max(300, V.u);
    const key = `${w}x${h}`;
    let st = bg.st;
    if (!st || st.kind !== 'jellyfish' || st.key !== key) {
      const n = pv ? 4 : Math.max(4, Math.min(9, Math.round((w * h) / 160000) + 4));
      st = bg.st = { kind: 'jellyfish', key, items: Array.from({ length: n }, (_, i) => spawn(w, h, unit, pv, i, n, true)).sort((a, b) => a.z - b.z) };
    }
    const cols = accents();
    for (let i = 0; i < st.items.length; i++) {
      let j = st.items[i];
      j.ph += j.rate * (Math.sin(j.ph) > 0 ? 1.45 : 0.85); // it closes quickly and opens slowly
      if (j.ph > TAU) j.ph -= TAU;
      const thrust = Math.max(0, Math.sin(j.ph));
      if (--j.turn <= 0) { j.tt = (Math.random() - 0.5) * 0.9; j.turn = 220 + Math.random() * 420; }
      if (j.x < w * 0.1) j.tt = Math.max(j.tt, 0.3); else if (j.x > w * 0.9) j.tt = Math.min(j.tt, -0.3); // keep off the sides
      j.th += (j.tt - j.th) * 0.008;
      j.lag += (j.th - j.lag) * 0.02; // what trails behind turns later
      const sp = j.v * (0.4 + 1.5 * thrust);
      j.x += Math.sin(j.th) * sp; j.y -= Math.cos(j.th) * sp;
      if (j.y < -j.R * (j.tl + 2)) { j = st.items[i] = spawn(w, h, unit, pv, i, st.items.length, false); st.resort = true; }
      draw(ctx, j, cols[j.c] || cols[0], L, pv);
    }
    if (st.resort) { st.items.sort((a, b) => a.z - b.z); st.resort = false; }
  };
})();
