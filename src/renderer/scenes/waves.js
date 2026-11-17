'use strict';
/*
 * 물결: a calm sea along the bottom of the screen. Four swells, far to near; each is a translucent wash that is
 * strongest under its crest and thins toward the next one, so the water has depth instead of flat bands. Light
 * runs along every crest (brightest where the water stands highest), broken ripple lines follow the surface,
 * small glints ride it, and a low light beyond the horizon lays a path across the water. Colours follow the accent.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('waves'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const SWELLS = [ // far → near: base (of H), half-height and wavelength (of u), drift per frame, strength at the crest
    { base: 0.715, amp: 0.009, len: 0.42, sp: 0.008, a: 0.15 },
    { base: 0.772, amp: 0.013, len: 0.56, sp: -0.012, a: 0.17 },
    { base: 0.838, amp: 0.018, len: 0.76, sp: 0.016, a: 0.19 },
    { base: 0.912, amp: 0.025, len: 1.04, sp: -0.021, a: 0.21 },
  ];
  const TONES = 5; // steps of brightness along a crest
  /** How high the water stands at x: 0 in a trough … 1 on a crest (crests narrower than troughs). */
  function lift(S, i, x, t, u) {
    const k = TAU / (S.len * u), ph = t * S.sp;
    const n = (Math.sin(x * k + ph + i * 1.7) + 0.38 * Math.sin(x * k * 2.37 - ph * 1.6 + i) + 0.5 * Math.sin(x * k * 0.41 + ph * 0.37 + i * 2.3)) / 1.88;
    return Math.pow((n + 1) / 2, 1.5);
  }

  window.BG_EXT.waves = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 1, 1.5), { W, H, u } = V, L = K.light();
    const [a0, a1, a2] = fxColors();
    const key = `${W}x${H}`;
    let st = bg.st;
    if (!st || st.kind !== 'waves' || st.key !== key) {
      const R = K.rng(4217);
      st = bg.st = { kind: 'waves', key, glints: [] };
      SWELLS.forEach((S, i) => {
        for (let n = 0, m = V.pv ? 3 : 7 + i * 4; n < m; n++) st.glints.push({ i, fx: R(), d: 0.1 + R() * 0.75, ph: R() * TAU, sp: 0.02 + R() * 0.035, len: 0.004 + R() * 0.007, path: false });
        for (let n = 0, m = V.pv ? 3 : 8 + i * 5; n < m; n++) st.glints.push({ i, fx: (R() + R() - 1), d: 0.06 + R() * 0.88, ph: R() * TAU, sp: 0.05 + R() * 0.09, len: (0.005 + R() * 0.008) * (1 + i * 0.25), path: true });
      });
    }
    const lw = Math.max(0.5, 1.25 * (V.pv ? 0.6 : 1)), gx = W * 0.7; // gx: where the light stands beyond the horizon
    const baseY = (i) => H * SWELLS[i].base + Math.sin(t * 0.008 + i) * u * 0.004;
    const yAt = (i, x) => baseY(i) + SWELLS[i].amp * u * (1 - 2 * lift(SWELLS[i], i, x, t, u));
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // the light low beyond the horizon; the water in front hides its lower half
    K.glow(ctx, gx, baseY(0) - u * 0.004, u * 0.3, L ? [[0, rgba(a2, 0.15)], [1, rgba(a2, 0)]] : [[0, rgba(mix(a2, WHITE, 0.3), 0.2)], [0.5, rgba(a2, 0.06)], [1, rgba(a2, 0)]], 1.7, 0.36);

    // the surface of every swell, sampled once
    const step = Math.max(2, W / 170), xs = [], Y = [], LF = [];
    for (let x = -step; x <= W + step; x += step) xs.push(x);
    SWELLS.forEach((S, i) => {
      const b = baseY(i), ys = new Float32Array(xs.length), lf = new Float32Array(xs.length);
      for (let j = 0; j < xs.length; j++) { lf[j] = lift(S, i, xs[j], t, u); ys[j] = b + S.amp * u * (1 - 2 * lf[j]); }
      Y.push(ys); LF.push(lf);
    });

    SWELLS.forEach((S, i) => {
      const col = mix(a0, a1, i / (SWELLS.length - 1)), ys = Y[i], lf = LF[i], nx = Y[i + 1];
      const body = new Path2D();
      let top = 1e9;
      body.moveTo(xs[0], H + 4);
      for (let j = 0; j < xs.length; j++) { body.lineTo(xs[j], ys[j]); if (ys[j] < top) top = ys[j]; }
      body.lineTo(xs[xs.length - 1], H + 4); body.closePath();
      // the swell hides the water behind it, then lays its own wash: strong under the crest, thin by the next one
      const next = SWELLS[i + 1], bottom = next ? baseY(i + 1) + next.amp * u : H;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(body);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, top, 0, Math.max(top + 1, bottom));
      const a = S.a * (L ? 1.15 : 1);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(0.45, rgba(col, a * 0.55)); g.addColorStop(1, rgba(col, a * 0.24));
      ctx.fillStyle = g; ctx.fill(body);

      // broken ripple lines lying between this crest and the next
      const k = TAU / (S.len * u);
      ctx.lineWidth = lw * 0.8; ctx.strokeStyle = L ? rgba(mix(col, BLACK, 0.1), 0.2) : rgba(mix(col, WHITE, 0.4), 0.15);
      ctx.beginPath();
      for (let r = 0; r < 2; r++) {
        const f = r ? 0.64 : 0.3;
        let on = false;
        for (let j = 0; j < xs.length; j++) {
          const x = xs[j];
          if (Math.sin(x * k * 0.7 + r * 2.4 + i * 1.3 - t * S.sp * 0.6) < 0.15) { on = false; continue; }
          const yn = nx ? nx[j] : H + u * 0.03, y = ys[j] + f * (yn - ys[j]) + Math.sin(x * k * 2.2 + t * S.sp * 2.5 + r * 3) * S.amp * u * 0.22;
          if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
        }
      }
      ctx.stroke();

      // the light along the crest, brighter the higher the water stands
      const tones = Array.from({ length: TONES }, () => new Path2D());
      for (let j = 1; j < xs.length; j++) {
        const b = Math.min(TONES - 1, Math.floor(((lf[j - 1] + lf[j]) / 2) * TONES));
        tones[b].moveTo(xs[j - 1], ys[j - 1]); tones[b].lineTo(xs[j], ys[j]);
      }
      ctx.lineCap = 'butt'; // the pieces of different brightness must not overlap at their ends
      tones.forEach((p, b) => {
        const q = Math.pow(b / (TONES - 1), 1.4);
        ctx.lineWidth = lw * (1 + 0.55 * q);
        ctx.strokeStyle = L ? rgba(mix(col, BLACK, 0.1 + 0.1 * q), 0.2 + 0.32 * q) : rgba(mix(col, WHITE, 0.4 + 0.28 * q), 0.2 + 0.36 * q);
        ctx.stroke(p);
      });
      ctx.lineCap = 'round';
    });

    // glints riding the water: scattered ones, and the path the light lays toward us
    const lit = mix(a2, WHITE, 0.5);
    ctx.globalCompositeOperation = L ? 'destination-out' : 'source-over'; // on a light page a glint is the page showing through
    for (const q of st.glints) {
      const S = SWELLS[q.i], next = SWELLS[q.i + 1];
      const tw = Math.max(0, Math.sin(q.ph + t * q.sp)) ** 3;
      if (tw < 0.04) continue;
      const spread = u * (0.018 + 0.05 * q.i);
      const x = q.path ? gx + q.fx * spread + Math.sin(t * 0.02 + q.ph) * spread * 0.1 : ((q.fx * W + t * S.sp * 9) % (W + 40) + W + 40) % (W + 40) - 20;
      const band = (next ? baseY(q.i + 1) - next.amp * u : H) - (baseY(q.i) + S.amp * u);
      const y = yAt(q.i, x) + u * 0.005 + q.d * Math.max(u * 0.01, band + S.amp * u);
      if (y > H + 2) continue;
      ctx.fillStyle = L ? `rgba(0,0,0,${((q.path ? 0.9 : 0.6) * tw).toFixed(3)})` : rgba(lit, (q.path ? 0.62 : 0.36) * tw);
      ctx.beginPath(); ctx.ellipse(x, y, q.len * u * (0.6 + 0.6 * tw), Math.max(0.45, lw * (q.path ? 0.62 : 0.5)), 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };
})();
