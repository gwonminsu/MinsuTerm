'use strict';
/*
 * 벚꽃: petals coming down on the wind. Each has a cleft tip and a darker heart, tumbles as it falls (face-on it
 * floats, edge-on it slips down), and drifts at its own depth: small faint ones far off, a few large soft ones
 * close to the glass. A flowering branch leans in from the top right, away from the prompt, and lets some go
 * when the wind gusts.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('sakura');
  const TAU = Math.PI * 2;
  const TIPS = (L) => (L ? [[252, 204, 220], [248, 182, 204], [242, 158, 188], [236, 136, 172]] : [[255, 232, 240], [255, 212, 226], [255, 192, 212], [252, 172, 198]]);
  const HEART = (L) => (L ? [216, 88, 134] : [240, 128, 166]);
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  /** The outline of one petal in a 64 × 64 box: base at the bottom centre, a cleft at the tip. */
  function petalPath() {
    const p = new Path2D();
    p.moveTo(32, 62);
    p.bezierCurveTo(10, 52, 2, 28, 18, 8);
    p.quadraticCurveTo(25, 1, 32, 13);
    p.quadraticCurveTo(39, 1, 46, 8);
    p.bezierCurveTo(62, 28, 54, 52, 32, 62);
    p.closePath();
    return p;
  }
  /** One petal as a sprite (96 px, the petal about 60 px long in its middle); blur for the ones out of focus. */
  function petalSprite(tone, L, blur) {
    const key = `skPetal|${tone}|${L ? 'L' : 'D'}|${blur}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(96, 96), x = c.getContext('2d'), tip = TIPS(L)[tone], heart = HEART(L), path = petalPath();
    if (blur) x.filter = `blur(${blur}px)`;
    x.translate(16, 16);
    const g = x.createLinearGradient(32, 62, 32, 4);
    g.addColorStop(0, `rgb(${heart})`); g.addColorStop(0.32, `rgb(${mix(heart, tip, 0.62)})`); g.addColorStop(1, `rgb(${tip})`);
    x.fillStyle = g; x.fill(path);
    x.save(); x.clip(path);
    const sh = x.createLinearGradient(8, 0, 56, 0); // light on one side, a little shade on the other
    sh.addColorStop(0, 'rgba(255,255,255,0.3)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, `rgba(${heart},0.2)`);
    x.fillStyle = sh; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = `rgba(${heart},0.5)`; x.lineWidth = 1.3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(32, 60); x.quadraticCurveTo(31, 38, 32, 19); x.stroke(); // the vein
    x.restore();
    if (L) { x.strokeStyle = `rgba(${heart},0.5)`; x.lineWidth = 1.5; x.stroke(path); } // an edge, so a pale petal reads on a pale page
    K.cache.set(key, c);
    return c;
  }
  /** A blossom seen from the front: five petals round a dark heart, stamens with pollen tips. */
  function flowerSprite(tone, L) {
    const key = `skFlower|${tone}|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(96, 96), x = c.getContext('2d'), tip = TIPS(L)[tone], heart = HEART(L), path = petalPath(), f = 0.66;
    for (let k = 0; k < 5; k++) {
      x.save(); x.translate(48, 48); x.rotate((k / 5) * TAU); x.scale(f, f); x.translate(-32, -66);
      const g = x.createLinearGradient(32, 62, 32, 4);
      g.addColorStop(0, `rgb(${heart})`); g.addColorStop(0.38, `rgb(${mix(heart, tip, 0.7)})`); g.addColorStop(1, `rgb(${tip})`);
      x.fillStyle = g; x.fill(path);
      x.strokeStyle = `rgba(${heart},${L ? 0.5 : 0.28})`; x.lineWidth = 1.6; x.stroke(path);
      x.restore();
    }
    x.translate(48, 48);
    x.fillStyle = `rgb(${mix(heart, [150, 40, 80], 0.35)})`; x.beginPath(); x.arc(0, 0, 5.5, 0, TAU); x.fill();
    x.strokeStyle = `rgba(${mix(heart, [150, 40, 80], 0.35)},0.8)`; x.lineWidth = 1.2; x.fillStyle = L ? 'rgb(214,150,60)' : 'rgb(255,222,150)';
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + 0.3, r = 11 + (k % 3) * 2.2;
      x.beginPath(); x.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); x.stroke();
      x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, 1.7, 0, TAU); x.fill();
    }
    K.cache.set(key, c);
    return c;
  }

  /** The branch in its own layer (the stage's top-right corner is the layer's top-right corner). */
  function buildBranch(W, H, s, L, dpr, pv) {
    const bw = Math.min(W * 0.44, 440 * s), bh = Math.min(H * 0.48, 280 * s);
    const [layer, c] = K.layer(bw, bh, dpr), R = K.rng(417), thin = pv ? 0.6 : 1;
    const bark = L ? 'rgba(88,60,54,0.92)' : 'rgba(96,76,84,0.95)';
    c.strokeStyle = bark; c.lineCap = 'round'; c.lineJoin = 'round';
    const spots = [];
    const limb = (x, y, len, ang, wid, depth) => {
      let px = x, py = y, a = ang;
      const seg = depth > 1 ? 4 : 3, sl = len / seg;
      for (let i = 0; i < seg; i++) {
        a += (R() - 0.5) * 0.3 + (Math.PI / 2 - a) * 0.05; // every limb sags a little toward the ground
        const nx = px + Math.cos(a) * sl, ny = py + Math.sin(a) * sl;
        c.lineWidth = Math.max(0.7 * thin, wid * (1 - 0.3 * (i / seg)));
        c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
        if (depth <= 2 && i > 0 && R() < 0.55) { // a short twig with a cluster of its own
          const ta = a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.6), tl = sl * (0.45 + R() * 0.5), tx = nx + Math.cos(ta) * tl, ty = ny + Math.sin(ta) * tl;
          c.lineWidth = Math.max(0.6 * thin, wid * 0.36);
          c.beginPath(); c.moveTo(nx, ny); c.lineTo(tx, ty); c.stroke();
          spots.push([tx, ty, 0.75 + R() * 0.35]);
        }
        px = nx; py = ny;
      }
      if (depth <= 0) { spots.push([px, py, 1]); return; }
      const n = R() < 0.25 ? 3 : 2;
      for (let i = 0; i < n; i++) limb(px, py, len * (0.56 + R() * 0.16), a + (i - (n - 1) / 2) * (0.62 + R() * 0.3) + (R() - 0.5) * 0.2, wid * 0.62, depth - 1);
    };
    limb(bw * 1.03, bh * 0.06, bw * 0.4, Math.PI - 0.16, bw * 0.03, 3);
    limb(bw * 0.74, -bh * 0.03, bw * 0.24, Math.PI * 0.63, bw * 0.013, 2);

    // blossoms in clusters, a bud or two among them
    const blossoms = [];
    const fs = bw * 0.042;
    for (const [sx, sy, k] of spots) {
      const n = pv ? 2 : 2 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, r = i ? fs * (0.45 + R() * 0.6) * k : 0, fx = sx + Math.cos(a) * r, fy = sy + Math.sin(a) * r, d = fs * (0.8 + R() * 0.55) * k * (96 / 72);
        if (fx < -d || fy > bh + d) continue;
        c.save(); c.translate(fx, fy); c.rotate(R() * TAU); c.scale(1, 0.72 + R() * 0.28);
        c.globalAlpha = 0.86;
        c.drawImage(flowerSprite((R() * 3) | 0, L), -d / 2, -d / 2, d, d);
        c.restore();
        blossoms.push([fx, fy]);
      }
      if (!pv && R() < 0.7) { // a bud, not open yet
        const a = R() * TAU, bx = sx + Math.cos(a) * fs * 0.9, by = sy + Math.sin(a) * fs * 0.9;
        c.save(); c.translate(bx, by); c.rotate(a + Math.PI / 2);
        c.fillStyle = `rgba(${HEART(L)},0.9)`; c.beginPath(); c.ellipse(0, 0, fs * 0.15, fs * 0.24, 0, 0, TAU); c.fill();
        c.fillStyle = bark; c.beginPath(); c.ellipse(0, fs * 0.2, fs * 0.1, fs * 0.09, 0, 0, TAU); c.fill();
        c.restore();
      }
    }
    return { layer, bw, bh, blossoms: blossoms.map(([x, y]) => [W - bw + x, y]) };
  }

  function init(W, H, s, L, dpr, pv, key) {
    const area = (W * H) / 40000, R = Math.random;
    const mk = (n, f) => Array.from({ length: Math.max(0, Math.round(n)) }, f);
    const base = () => ({ x: R() * W, y: R() * H, rot: R() * TAU, flip: R() * TAU, ph: R() * TAU, tone: (R() * 4) | 0 });
    return {
      kind: 'sakura', key, gustWait: 300 + R() * 500, gustT: 1e9, gustLen: 1, release: 0,
      branch: buildBranch(W, H, s, L, dpr, pv),
      far: mk(Math.max(pv ? 4 : 10, area * 2.6), () => ({ ...base(), len: (5.5 + R() * 3.5) * s * (pv ? 1.5 : 1), a: 0.36 + R() * 0.16, v: 0.26 + R() * 0.2, wf: 0.5, vr: (R() - 0.5) * 0.02, fs: 0.02 + R() * 0.025, sp: 0.012 + R() * 0.012, sw: 0.3 })),
      mid: mk(Math.max(pv ? 3 : 8, area * 2), () => ({ ...base(), len: (12 + R() * 7) * s * (pv ? 1.2 : 1), a: 0.64 + R() * 0.2, v: 0.5 + R() * 0.42, wf: 1, vr: (R() - 0.5) * 0.035, fs: 0.03 + R() * 0.04, sp: 0.015 + R() * 0.015, sw: 0.6 })),
      near: mk(Math.max(pv ? 1 : 2, area * 0.28), () => ({ ...base(), len: (28 + R() * 16) * s, a: (L ? 0.3 : 0.4) + R() * 0.1, v: 0.95 + R() * 0.6, wf: 1.7, vr: (R() - 0.5) * 0.03, fs: 0.025 + R() * 0.03, sp: 0.012 + R() * 0.012, sw: 1 })),
    };
  }

  (window.BG_EXT = window.BG_EXT || {}).sakura = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), { W, H, u } = V, L = K.light(), dpr = bg.dpr || 1;
    const s = V.pv ? 0.42 : Math.max(0.6, Math.min(1.2, u / 700));
    const key = `${W}x${H}@${dpr}${L ? 'L' : 'D'}`;
    let st = bg.st;
    if (!st || st.kind !== 'sakura' || st.key !== key) st = bg.st = init(W, H, s, L, dpr, V.pv, key);
    const br = st.branch;

    // the wind: a steady lean to the right, and a gust now and then that shakes petals off the branch
    if (!V.pv && --st.gustWait <= 0) { st.gustWait = 480 + Math.random() * 700; st.gustT = 0; st.gustLen = 120 + Math.random() * 90; st.release = 5 + ((Math.random() * 5) | 0); }
    let gust = 0;
    if (st.gustT < st.gustLen) { gust = Math.sin((Math.PI * st.gustT) / st.gustLen) ** 2; st.gustT++; }
    const wind = (0.3 + 0.16 * Math.sin(t * 0.0037) + gust * 1.5) * s;
    if (st.release > 0 && gust > 0.3 && br.blossoms.length && Math.random() < 0.2) {
      st.release--;
      const [bx, by] = br.blossoms[(Math.random() * br.blossoms.length) | 0];
      st.mid.push({ x: bx, y: by, rot: Math.random() * TAU, flip: Math.random() * TAU, ph: Math.random() * TAU, tone: (Math.random() * 4) | 0, len: (12 + Math.random() * 6) * s, a: 0.72, v: 0.5 + Math.random() * 0.4, wf: 1, vr: (Math.random() - 0.5) * 0.04, fs: 0.04 + Math.random() * 0.04, sp: 0.02, sw: 0.6, extra: true });
    }

    const step = (p, list, i) => {
      p.flip += p.fs; p.ph += p.sp; p.rot += p.vr + wind * 0.006 * p.wf;
      const flat = Math.abs(Math.cos(p.flip));
      p.y += p.v * s * (1.25 - 0.6 * flat);
      p.x += wind * p.wf + Math.sin(p.ph) * p.sw * s;
      const m = p.len;
      if (p.x > W + m) p.x = -m;
      if (p.y > H + m) {
        if (p.extra) { list.splice(i, 1); return false; }
        if (list === st.mid && br.blossoms.length && Math.random() < 0.25) { const [bx, by] = br.blossoms[(Math.random() * br.blossoms.length) | 0]; p.x = bx; p.y = by; } // let go by the branch
        else { p.y = -m; p.x = Math.random() * W * 1.25 - W * 0.25; }
      }
      return true;
    };
    const draw = (p, blur) => {
      const fl = Math.cos(p.flip), sy = Math.abs(fl) < 0.14 ? (fl < 0 ? -0.14 : 0.14) : fl, d = (p.len / 60) * 96;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, sy);
      ctx.globalAlpha = p.a * (0.7 + 0.3 * Math.abs(fl)); // edge-on, a petal catches less light
      ctx.drawImage(petalSprite(p.tone, L, blur), -d / 2, -d / 2, d, d);
      ctx.restore();
    };
    const pass = (list, blur) => { for (let i = list.length - 1; i >= 0; i--) if (step(list[i], list, i)) draw(list[i], blur); };

    pass(st.far, 0);
    ctx.save(); // the branch, stirring in the wind about the corner it grows from
    ctx.translate(W, 0); ctx.rotate(Math.sin(t * 0.011) * 0.004 + gust * 0.012);
    K.stamp(ctx, br.layer, -br.bw, 0, br.bw, br.bh, L ? 0.8 : 0.84);
    ctx.restore();
    pass(st.mid, 0);
    pass(st.near, V.pv ? 2 : 4);
    ctx.globalAlpha = 1;
  };
})();
