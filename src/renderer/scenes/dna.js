'use strict';
/*
 * DNA 나선: a double helix down the right side of the screen, turning slowly about its axis. The two backbones are
 * flat ribbons on the helix (broad where they face us, edge-on at the sides), lit from the upper left; the strands are
 * set off from each other round the axis, so the major and minor grooves show. Between them the base pairs are rods in
 * paired colours (A-T, G-C) meeting in the middle. What turns away is drawn behind and dimmer. Every so often a short
 * stretch comes apart: the strands bow out, the pairs let go and wave, and then it zips back. A few small molecules
 * drift past at different depths. On a light page the same molecule is drawn in deeper colours over the page.
 *
 * Turning a perfect helix about its axis looks the same as sliding it along the axis, so each backbone half (behind /
 * in front of the axis) is shaded once, pixel by pixel, into a tall strip and slid; only the stretch that is coming
 * apart is shaded every frame. The rods are drawn between the two halves, which puts everything in the right order.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('dna');
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};
  const TAU = Math.PI * 2, WHITE = [255, 255, 255], INK = [24, 26, 52];
  const mix = (c, d, k) => [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const unit = (x, y, z) => { const n = Math.sqrt(x * x + y * y + z * z); return [x / n, y / n, z / n]; };
  const LD = unit(-0.5, -0.62, 0.6), HV = unit(LD[0], LD[1], LD[2] + 1); // the light, and the half-way vector for its shine

  function palette(cols, L) {
    const [a0, a1, a2] = cols;
    return L ? {
      L, alpha: 0.92, backA: 0.42, backC: 1, amb: 0.34, dif: 0.62, spec: 0.36,
      strand: [mix(a0, INK, 0.26), mix(a1, INK, 0.26)],
      base: [mix(a2, INK, 0.2), mix(mix(a2, [226, 160, 20], 0.65), INK, 0.2), mix(mix(a0, [10, 150, 190], 0.6), INK, 0.2), mix(mix(a1, [220, 60, 150], 0.35), INK, 0.18)],
      mol: mix(a0, INK, 0.3), sceneA: 0.95,
    } : {
      L, alpha: 0.96, backA: 0.42, backC: 0.62, amb: 0.24, dif: 0.84, spec: 0.55,
      strand: [mix(a0, WHITE, 0.16), mix(a1, WHITE, 0.16)],
      base: [a2, mix(a2, [255, 214, 110], 0.62), mix(a0, [110, 214, 255], 0.62), mix(a1, [255, 190, 236], 0.42)],
      mol: mix(a0, WHITE, 0.45), sceneA: 0.8,
    };
  }

  /* ---------- the backbones, shaded pixel by pixel ---------- */

  let BG_G = 1, BG_GP = 0; // the bulge at the row being shaded (and its slope)
  const NT = 360, NU = 64; // the shading table: angle round the axis × place across the ribbon

  /** A ribbon's local frame where it is at angle th round the axis (bulge gg, its slope gp): tangent, breadth, width. */
  function frame(g, th, gg, gp, out) {
    const { R, k, wf, wt } = g, sn = Math.sin(th), cs = Math.cos(th), Rg = R * gg;
    const tx = Rg * k * cs + R * gp * sn, tz = -Rg * k * sn + R * gp * cs, tn = Math.sqrt(tx * tx + 1 + tz * tz);
    const Tx = tx / tn, Ty = 1 / tn, Tz = tz / tn;
    let bx = Ty * cs, by = Tz * sn - Tx * cs, bz = -Ty * sn; // the ribbon's breadth: across the strand, along the cylinder
    const bn = Math.sqrt(bx * bx + by * by + bz * bz); bx /= bn; by /= bn; bz /= bn;
    const tl = Math.sqrt(Tx * Tx + Ty * Ty), ex = Ty / tl, ey = -Tx / tl;
    const ps = 1 + 0.1 * cs, WT = wt * ps, WF = wf * ps; // nearer is a little wider
    const A = WT * sn * ex, B = WF * (bx * ex + by * ey);
    out.sn = sn; out.cs = cs; out.bx = bx; out.by = by; out.bz = bz; out.WT = WT; out.WF = WF;
    out.M = Math.sqrt(A * A + B * B); out.psi0 = Math.atan2(B, A); out.cosA = Ty / tl; out.x = Rg * sn;
    return out;
  }

  /** Light on both ribbons, worked out once: colour and strength at each angle and place across (lit from the upper left). */
  function shadeTable(g, pal) {
    const tab = [new Float32Array(NT * NU * 4), new Float32Array(NT * NU * 4)], f = {};
    for (let q = 0; q < 2; q++) {
      const col = pal.strand[q], T = tab[q];
      for (let i = 0; i < NT; i++) {
        const th = (i / NT) * TAU;
        frame(g, th, 1, 0, f);
        const { sn, cs, bx, by, bz, WT, WF, psi0 } = f, depth = 0.5 + 0.5 * cs;
        const aMul = pal.alpha * (pal.backA + (1 - pal.backA) * depth), cMul = pal.backC + (1 - pal.backC) * depth, wh = 255 * cMul;
        for (let j = 0; j < NU; j++) {
          const u = -1 + (2 * j) / (NU - 1), ac = Math.acos(u), p1 = psi0 + ac, p2 = psi0 - ac;
          const ps_ = WT * Math.cos(p1) * cs + WF * Math.sin(p1) * bz >= WT * Math.cos(p2) * cs + WF * Math.sin(p2) * bz ? p1 : p2; // the side facing us
          const cp = Math.cos(ps_) / WT, sp = Math.sin(ps_) / WF;
          let nx = cp * sn + sp * bx, ny = sp * by, nz = cp * cs + sp * bz;
          const nn = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nn; ny /= nn; nz /= nn;
          const lam = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
          let sh = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]); sh *= sh; sh *= sh; sh *= sh; sh *= sh; sh *= sh;
          const k1 = Math.min(1, pal.amb + pal.dif * lam) * cMul, k2 = sh * pal.spec; // the shine blends toward white (no hue shift)
          const o = (i * NU + j) * 4, r0 = col[0] * k1, g0 = col[1] * k1, b0 = col[2] * k1;
          T[o] = r0 + (wh - r0) * k2; T[o + 1] = g0 + (wh - g0) * k2; T[o + 2] = b0 + (wh - b0) * k2;
          T[o + 3] = aMul * (0.82 + 0.18 * Math.abs(nz)); // the edges a touch see-through
        }
      }
    }
    return tab;
  }

  /**
   * Shade rows of both backbones into two RGBA buffers W wide (device px): the half behind the axis into back, the half
   * in front into front. Row r is at helix height s0 + (r + 0.5) / dpr (css px); bulge(y) sets BG_G / BG_GP.
   */
  const FR = {};
  function paintRows(g, tab, back, front, W, rows, s0, dpr, bulge, yOf) {
    const { k, phi } = g, ax = W / 2;
    for (let r = 0; r < rows; r++) {
      const s = s0 + (r + 0.5) / dpr;
      if (bulge) bulge(yOf(s)); else { BG_G = 1; BG_GP = 0; }
      const th0 = k * s, c0 = Math.cos(th0), c1 = Math.cos(th0 + phi);
      for (let qq = 0; qq < 2; qq++) {
        const q = (c0 < c1) === (qq === 0) ? 0 : 1; // the farther strand first
        const th = th0 + q * phi, f = frame(g, th, BG_G, BG_GP, FR), M = f.M, cosA = f.cosA;
        const xc = ax + f.x * dpr, half = (M / cosA) * dpr + 1.5, buf = f.cs >= 0 ? front : back;
        const T = tab[q], ti = ((((Math.round((th / TAU) * NT) % NT) + NT) % NT) * NU) * 4, us = (NU - 1) / 2;
        const x0 = Math.max(0, Math.floor(xc - half)), x1 = Math.min(W - 1, Math.ceil(xc + half)), row = r * W;
        for (let x = x0; x <= x1; x++) {
          const d = ((x + 0.5 - xc) / dpr) * cosA, cov = (M - Math.abs(d)) * dpr + 0.5;
          if (cov <= 0) continue;
          const o = ti + Math.round((clamp(d / M, -1, 1) + 1) * us) * 4;
          const a = (cov < 1 ? cov : 1) * T[o + 3];
          const i = (row + x) * 4, ea = buf[i + 3] / 255, oa = a + ea * (1 - a), wN = a / oa, wE = 1 - wN;
          buf[i] = T[o] * wN + buf[i] * wE;
          buf[i + 1] = T[o + 1] * wN + buf[i + 1] * wE;
          buf[i + 2] = T[o + 2] * wN + buf[i + 2] * wE;
          buf[i + 3] = oa * 255;
        }
      }
    }
  }

  /* ---------- molecules drifting by ---------- */

  /** A small ball-and-stick molecule (white; drawn tinted): a few atoms round a ring or a chain. */
  function molSprite(i, c, L) {
    const key = `dnaMol|${i}|${c}|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const R = K.rng(500 + i * 31), N = 72, cv = K.mk(N, N), x = cv.getContext('2d');
    const kind = i % 3, atoms = [];
    if (kind === 0) for (let k = 0; k < 6; k++) atoms.push([Math.cos((k * TAU) / 6) * 12, Math.sin((k * TAU) / 6) * 12, 3.2]); // a ring
    else if (kind === 1) { let px = -16, py = 0; for (let k = 0; k < 5; k++) { atoms.push([px, py, k % 2 ? 2.6 : 3.4]); px += 8; py += (k % 2 ? 1 : -1) * 6; } } // a zigzag chain
    else { atoms.push([0, 0, 4.2]); for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4 + 0.4; atoms.push([Math.cos(a) * 13, Math.sin(a) * 13 * 0.8, 2.4]); } } // a centre with four arms
    if (kind === 0) for (let k = 0; k < 3; k++) { const a = R() * TAU; const p = atoms[(R() * 6) | 0]; atoms.push([p[0] * 1.75, p[1] * 1.75, 2.2]); }
    const pale = L ? mix(c, INK, 0.2) : mix(c, WHITE, 0.25), dark = L ? mix(c, INK, 0.45) : mix(c, [20, 20, 40], 0.45);
    x.translate(N / 2, N / 2);
    x.lineCap = 'round';
    x.strokeStyle = rgba(L ? dark : pale, 0.6); x.lineWidth = 1.6;
    x.beginPath();
    for (let k = 0; k < atoms.length; k++) {
      const a = atoms[k];
      for (let m = k + 1; m < atoms.length; m++) { const b = atoms[m]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 15.5) { x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); } }
    }
    x.stroke();
    for (const [ax, ay, ar] of atoms) {
      const gr = x.createRadialGradient(ax - ar * 0.35, ay - ar * 0.4, ar * 0.1, ax, ay, ar);
      gr.addColorStop(0, rgba(L ? mix(c, WHITE, 0.35) : mix(c, WHITE, 0.7), 1)); gr.addColorStop(0.6, rgba(pale, 1)); gr.addColorStop(1, rgba(dark, 1));
      x.fillStyle = gr; x.beginPath(); x.arc(ax, ay, ar, 0, TAU); x.fill();
    }
    K.cache.set(key, cv);
    return cv;
  }
  /** The same, out of focus (a nearer one). */
  function molBlur(i, c, L, b) {
    const key = `dnaMolB|${i}|${c}|${L ? 'L' : 'D'}|${b}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const src = molSprite(i, c, L), cv = K.mk(src.width, src.height), x = cv.getContext('2d');
    x.filter = `blur(${b}px)`; x.drawImage(src, 0, 0);
    K.cache.set(key, cv);
    return cv;
  }

  /* ---------- the scene ---------- */

  function build(w, h, pv, dpr, L, cols, old) {
    const LH = pv ? w : h; // the strip's length along the axis (the preview's helix lies on its side)
    const R = pv ? Math.max(6, h * 0.25) : clamp(Math.min(w * 0.06, h * 0.105), 30, 84);
    const P = 3.4 * R, k = TAU / P, phi = 0.64 * Math.PI, G = 0.4;
    const g = { R, P, k, phi, wf: 0.135 * R, wt: 0.07 * R, G, bp: P / 10 };
    const LW = Math.ceil(2 * (R * (1 + G) + g.wf * 1.4) + 10), LWd = Math.ceil(LW * dpr);
    const pal = palette(cols, L);
    // the slid strips: one period longer than the screen
    const rowsL = Math.ceil((LH + P + 2) * dpr), tab = shadeTable(g, pal);
    const imB = new ImageData(LWd, rowsL), imF = new ImageData(LWd, rowsL);
    paintRows(g, tab, imB.data, imF.data, LWd, rowsL, 0, dpr, null, null);
    const back = K.mk(LWd, rowsL), front = K.mk(LWd, rowsL);
    back.getContext('2d').putImageData(imB, 0, 0); front.getContext('2d').putImageData(imF, 0, 0);
    // a stretch coming apart is shaded every frame into these
    const pRows = Math.ceil((g.bp * 14 + 8) * dpr);
    const patch = { rows: pRows, imB: new ImageData(LWd, pRows), imF: new ImageData(LWd, pRows), cB: K.mk(LWd, pRows), cF: K.mk(LWd, pRows) };
    const hc = K.mk(LWd, Math.ceil(LH * dpr));
    const Rs = K.rng(1953), seq = [];
    for (let n = 0; n < Math.ceil(LH / g.bp) + 4; n++) seq.push((Rs() * 4) | 0); // 0 A-T, 1 T-A, 2 G-C, 3 C-G
    const st = {
      key: '', pv, g, LW, LWd, LH, dpr, pal, tab, back, front, patch, hc, hx: hc.getContext('2d'), seq,
      rot: old ? old.rot : 0, bub: old && old.pv === pv ? old.bub : null, next: old && old.pv === pv ? old.next : pv ? 1e9 : 300 + Math.random() * 200,
      mols: old && old.pv === pv && old.LH === LH ? old.mols : [], molNext: 0,
    };
    return st;
  }

  /** The stretch coming apart: how far the strands bow out at screen height y (sets BG_G, BG_GP). */
  function bulgeOf(st) {
    const b = st.bub, G = st.g.G;
    const p = b.age / b.dur, open = p < 0.3 ? ease(p / 0.3) : p < 0.68 ? 1 : 1 - ease((p - 0.68) / 0.32);
    const hw = b.hw * (0.45 + 0.55 * (p < 0.3 ? ease(p / 0.3) : p < 0.68 ? 1 : 1 - 0.6 * ease((p - 0.68) / 0.32))) + 1e-3;
    const amp = open * (1 + 0.06 * Math.sin(b.age * 0.09));
    b.open = open; b.hwNow = hw; b.amp = amp;
    return (y) => {
      const u = (y - b.y) / hw;
      if (u <= -1 || u >= 1) { BG_G = 1; BG_GP = 0; return; }
      const q = 1 - u * u;
      BG_G = 1 + G * amp * q * q;
      BG_GP = (G * amp * -4 * u * q) / hw;
    };
  }

  function draw(bg, ctx, w, h, t) {
    const pv = h < 90, L = K.light(), dpr = bg.dpr || 1, cols = accents();
    const key = `${w}x${h}@${dpr}${L ? 'L' : 'D'}${cols.join('|')}`;
    let st = bg.dnaSt;
    if (!st || st.key !== key) { st = bg.dnaSt = build(w, h, pv, dpr, L, cols, st); st.key = key; }
    const { g, LW, LWd, LH, pal, hx, patch } = st, { R, P, k, phi, bp, G } = g;
    st.rot += 0.0105 * (1 + 0.18 * Math.sin(t * 0.0019));
    const off = (((st.rot / k) % P) + P) % P; // turning = sliding the strips

    // now and then a stretch comes apart
    if (!st.bub && --st.next <= 0) {
      const n = 7 + ((Math.random() * 4) | 0);
      st.bub = { y: LH * (0.22 + Math.random() * 0.56), hw: (n / 2 + 1.6) * bp, age: 0, dur: 230 + Math.random() * 80, open: 0, hwNow: 0, amp: 0 };
    }
    let bulge = null, y0 = 0, y1 = 0;
    if (st.bub) {
      const b = st.bub;
      b.age += 1;
      if (b.age >= b.dur) { st.bub = null; st.next = 420 + Math.random() * 480; }
      else {
        bulge = bulgeOf(st);
        y0 = Math.max(0, Math.floor((b.y - b.hwNow - 3) * dpr)); y1 = Math.min(Math.ceil(LH * dpr), Math.ceil((b.y + b.hwNow + 3) * dpr), y0 + patch.rows); // only the rows that bow
      }
    }

    // the helix is put together in its own strip, then laid into the picture at the scene's strength
    hx.setTransform(1, 0, 0, 1, 0, 0);
    hx.clearRect(0, 0, LWd, st.hc.height);
    const Hd = st.hc.height, offD = off * dpr;
    const strip = (img, pc) => {
      if (!bulge) { hx.drawImage(img, 0, offD, LWd, Hd, 0, 0, LWd, Hd); return; }
      if (y0 > 0) hx.drawImage(img, 0, offD, LWd, y0, 0, 0, LWd, y0);
      if (y1 < Hd) hx.drawImage(img, 0, offD + y1, LWd, Hd - y1, 0, y1, LWd, Hd - y1);
      hx.drawImage(pc, 0, 0, LWd, y1 - y0, 0, y0, LWd, y1 - y0);
    };
    if (bulge) { // shade the stretch that is coming apart
      const n = (y1 - y0) * LWd * 4;
      patch.imB.data.fill(0, 0, n); patch.imF.data.fill(0, 0, n);
      paintRows(g, st.tab, patch.imB.data, patch.imF.data, LWd, y1 - y0, y0 / dpr + off, dpr, bulge, (s) => s - off);
      patch.cB.getContext('2d').putImageData(patch.imB, 0, 0, 0, 0, LWd, y1 - y0);
      patch.cF.getContext('2d').putImageData(patch.imF, 0, 0, 0, 0, LWd, y1 - y0);
    }
    strip(st.back, patch.cB);

    // the base pairs: rods from each backbone to the middle, in paired colours
    hx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hx.lineCap = 'round';
    const ax = LW / 2, rr = Math.max(pv ? 0.55 : 1.1, R * 0.042), rods = [];
    const n0 = -1, n1 = Math.ceil(LH / bp) + 1;
    for (let n = n0; n <= n1; n++) {
      const y = n * bp + bp * 0.5;
      if (bulge) bulge(y); else { BG_G = 1; BG_GP = 0; }
      const gg = BG_G, th = k * y + st.rot;
      const sa = Math.sin(th), ca = Math.cos(th), sb = Math.sin(th + phi), cb = Math.cos(th + phi);
      const mx = (R * (sa + sb)) / 2, mz = (R * (ca + cb)) / 2; // where the pair meets, closed
      const o = bulge ? clamp(((gg - 1) / G - 0.18) / 0.5, 0, 1) : 0; // how far this pair has let go
      const type = st.seq[(n - n0) % st.seq.length], cA = pal.base[type < 2 ? (type === 0 ? 0 : 1) : type === 2 ? 2 : 3], cB = pal.base[type < 2 ? (type === 0 ? 1 : 0) : type === 2 ? 3 : 2];
      for (let side = 0; side < 2; side++) {
        const px = R * gg * (side ? sb : sa), pz = R * gg * (side ? cb : ca);
        let vx = mx - px, vz = mz - pz;
        const len = Math.sqrt(vx * vx + vz * vz) || 1, gap = (pv ? 0.35 : 1.1) / len;
        let f = 1 - gap - 0.42 * o; // a closed pair meets the other half; an open one draws back a little
        let dy = 0;
        if (o > 0) { // and waves about
          const wob = o * 0.55 * Math.sin(t * 0.06 + n * 1.9 + side * 2.4), cw = Math.cos(wob), sw = Math.sin(wob);
          const rx = vx * cw - vz * sw, rz = vx * sw + vz * cw; vx = rx; vz = rz;
          dy = o * bp * 0.22 * Math.sin(t * 0.05 + n * 2.7 + side);
        }
        const ex = px + vx * f, ez = pz + vz * f;
        rods.push({ x0: ax + px, y0: y, x1: ax + ex, y1: y + dy, z: (pz + ez) / 2, c: side ? cB : cA });
      }
    }
    rods.sort((a, b) => a.z - b.z);
    for (const r of rods) {
      const dep = clamp(0.5 + (0.5 * r.z) / R, 0, 1), aM = pal.backA + (1 - pal.backA) * dep, cM = pal.backC + (1 - pal.backC) * dep;
      const wR = rr * (1 + 0.1 * (dep * 2 - 1));
      const shade = (m) => (pal.L ? mix(r.c, INK, m) : mix([0, 0, 0], r.c, cM * (1 - m)));
      hx.strokeStyle = rgba(shade(pal.L ? 0.28 : 0.42), aM * pal.alpha); hx.lineWidth = wR * 2; // the rod's shadowed body
      hx.beginPath(); hx.moveTo(r.x0, r.y0); hx.lineTo(r.x1, r.y1); hx.stroke();
      hx.strokeStyle = rgba(shade(0), aM * pal.alpha); hx.lineWidth = wR * 1.25; // its lit face
      hx.beginPath(); hx.moveTo(r.x0, r.y0 - wR * 0.28); hx.lineTo(r.x1, r.y1 - wR * 0.28); hx.stroke();
      if (!pv) {
        hx.strokeStyle = rgba(pal.L ? mix(r.c, WHITE, 0.55) : mix(r.c, WHITE, 0.6 * cM), aM * (pal.L ? 0.7 : 0.8)); hx.lineWidth = wR * 0.5; // and the shine along its top
        hx.beginPath(); hx.moveTo(r.x0, r.y0 - wR * 0.52); hx.lineTo(r.x1, r.y1 - wR * 0.52); hx.stroke();
      }
    }
    hx.setTransform(1, 0, 0, 1, 0, 0);
    strip(st.front, patch.cF);

    // small molecules drifting by (behind the helix, then in front of it)
    if (!pv) {
      if (--st.molNext <= 0 && st.mols.length < 5) {
        st.molNext = 200 + Math.random() * 400;
        const z = Math.random(), fromTop = Math.random() < 0.3;
        st.mols.push({ x: ax + (Math.random() - 0.5) * R * 7, y: fromTop ? -30 : LH + 30, vy: (fromTop ? 1 : -1) * (0.18 + Math.random() * 0.22) * (0.6 + z * 0.8), vx: (Math.random() - 0.5) * 0.15,
          z, a: Math.random() * TAU, va: (Math.random() - 0.5) * 0.008, i: (Math.random() * 6) | 0, c: (Math.random() * 3) | 0, ph: Math.random() * TAU });
      }
    }
    const molDraw = (front) => {
      for (const m of st.mols) {
        if ((m.z > 0.55) !== front) continue;
        const sc = 0.45 + m.z * 0.9, near = m.z > 0.82 && !L, spr = near ? molBlur(m.i, cols[m.c], L, 2) : molSprite(m.i, cols[m.c], L); // out of focus when near (on a light page that would only smudge)
        const s = 72 * sc * (R / 70) * 1.55, al = (0.3 + 0.45 * (1 - Math.abs(m.z - 0.6))) * (near ? 0.7 : 1);
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a); ctx.globalAlpha = al * pal.sceneA; ctx.drawImage(spr, -s / 2, -s / 2, s, s); ctx.restore();
      }
    };

    // into the picture
    ctx.save();
    if (pv) ctx.setTransform(0, dpr, -dpr, 0, w * dpr, ((h - LW) / 2) * dpr); // on its side in the picker
    else ctx.translate(w * 0.86 - ax, 0);
    for (const m of st.mols) { m.x += m.vx + Math.sin(t * 0.01 + m.ph) * 0.12; m.y += m.vy; m.a += m.va; }
    st.mols = st.mols.filter((m) => m.y > -60 && m.y < LH + 60);
    molDraw(false);
    ctx.globalAlpha = pal.sceneA * (pv ? 0.85 : 1);
    ctx.drawImage(st.hc, 0, 0, LW, Hd / dpr);
    ctx.globalAlpha = 1;
    molDraw(true);
    ctx.restore();
  }

  window.BG_EXT.dna = draw;
})();
