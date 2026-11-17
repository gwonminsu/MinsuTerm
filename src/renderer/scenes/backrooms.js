'use strict';
/*
 * 백룸: rooms that should not be there. Mustard wallpaper, damp carpet, a drop ceiling of buzzing tubes, and
 * doorway after doorway opening onto more of the same. We drift forward, slowly, for ever: the plan repeats every
 * few rooms, so there is no seam to reach. Once in a long while a tube dies far ahead and something tall is
 * standing under it; the lights stutter, and it is gone.
 *
 * Nothing is pre-painted: a pinhole camera looks down a grid of wall segments, painted far to near. Every wall
 * first wears away what is behind it and is then laid in as a thin wash, so washes never pile up and nothing
 * shows through a nearer wall. The theme's own background is the dark at the end of every room.
 */
(function () {
  const K = window.SceneKit;
  const C = 3.6;          // a room: 3.6 m square
  const HC = 2.6;         // ceiling height
  const EYE = 1.55;       // eye height
  const LINTEL = 2.1;     // top of a doorway
  const TH = 0.14;        // how thick a wall is where a doorway cuts through it
  const NEAR = 0.22;      // nothing nearer than this is drawn
  const FAR = 32;         // by here everything has faded into the dark
  const X = 5;            // rooms drawn to each side of the one we walk through
  const P = 8;            // the plan repeats every P rows
  const NR = 8;           // rows drawn ahead
  const DIP = [0.12, 0.08, 0.9, 0.3, 0.06, 0.06, 1, 0.8, 0.15, 1, 0.5, 1]; // the lights stuttering, frame by frame
  const PAL = {
    D: { wall: '240,200,56', ceil: '226,214,176', floor: '146,118,66', ink: '14,10,3', grid: '232,224,196', tube: '255,247,214', aCross: 0.24, aSide: 0.18, aCeil: 0.1, aFloor: 0.19, aInk: 0.5, aGrid: 0.1 },
    L: { wall: '226,192,84', ceil: '178,158,106', floor: '164,128,66', ink: '92,66,28', grid: '92,66,28', tube: '255,255,255', aCross: 0.36, aSide: 0.28, aCeil: 0.15, aFloor: 0.22, aInk: 0.46, aGrid: 0.14 },
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (a, b, c) => { let h = Math.imul(a + 101, 374761393) ^ Math.imul(b + 57, 668265263) ^ Math.imul(c + 13, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const fade = (d) => { const k = (FAR - d) / (FAR - 4); return k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(k, 1.25); };

  /**
   * The plan, one period of it. cross[j][i]: the wall across the far end of room (i, j); side[j][e]: the wall
   * along the left of column e. 0 open, 1 wall, 2 wall with a doorway. The column we walk down (i = 0) is only
   * ever crossed by doorways.
   */
  function layout() {
    const R = K.rng(71), cross = [], side = [];
    for (let j = 0; j < P; j++) {
      const cr = new Int8Array(2 * X + 1), sd = new Int8Array(2 * X + 2);
      for (let i = -X; i <= X; i++) { const r = R(); cr[i + X] = i === 0 ? (r < 0.5 ? 2 : 0) : r < 0.36 ? 1 : r < 0.52 ? 2 : 0; }
      for (let e = -X; e <= X + 1; e++) { const r = R(), hall = e === 0 || e === 1; sd[e + X] = hall ? (r < 0.5 ? 1 : r < 0.7 ? 2 : 0) : r < 0.34 ? 1 : r < 0.47 ? 2 : 0; }
      cross.push(cr); side.push(sd);
    }
    // The tube that stutters hangs in a side room we can see into from a few rooms back (the hall wall of the
    // room before it stands open, and so does the wall between the two side rooms): seen at an angle, never right
    // overhead. The dying one is in the hall itself, a few rooms further on.
    let fl = [-1, 2], best = -1;
    for (let j = 0; j < P; j++) {
      for (const d of [-1, 1]) {
        const pj = (j + P - 1) % P, e = d < 0 ? X : X + 1, open = (v) => (v === 0 ? 2 : v === 2 ? 0.5 : 0);
        const score = open(side[pj][e]) * open(cross[pj][X + d]) + (side[j][e] === 0 ? 1 : 0);
        if (score > best) { best = score; fl = [d, j]; }
      }
    }
    return { cross, side, fl, dy: [0, (fl[1] + 4) % P] };
  }

  /** The washes of the ceiling and the floor, and the ink of the ceiling grid: all thinning with distance. */
  function grads(ctx, pal, f, hy, H) {
    const mk = (y0, y1, dist, rgb, A) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      for (const o of [0, 0.05, 0.07, 0.1, 0.14, 0.2, 0.28, 0.38, 0.5, 0.7, 1]) g.addColorStop(o, `rgba(${rgb},${(A * fade(dist(o))).toFixed(4)})`);
      return g;
    };
    const dc = (o) => (f * (HC - EYE)) / Math.max(1e-6, o * hy), df = (o) => (f * EYE) / Math.max(1e-6, o * (H - hy));
    return { ceil: mk(hy, 0, dc, pal.ceil, pal.aCeil), grid: mk(hy, 0, dc, pal.grid, pal.aGrid), floor: mk(hy, H, df, pal.floor, pal.aFloor) };
  }

  /** Something tall and gaunt seen from far off: narrow as a post, head tilted, arms hanging to its knees. s: its height on screen. */
  function figure(ctx, x, yb, s) {
    const X_ = (k) => x + k * s, Y_ = (k) => yb - k * s;
    ctx.beginPath();
    ctx.moveTo(X_(-0.046), Y_(0)); // the body: up the left side, over the shoulders, down the right, and the gap between the legs
    ctx.bezierCurveTo(X_(-0.05), Y_(0.24), X_(-0.064), Y_(0.4), X_(-0.058), Y_(0.5));
    ctx.bezierCurveTo(X_(-0.05), Y_(0.58), X_(-0.04), Y_(0.66), X_(-0.062), Y_(0.76));
    ctx.bezierCurveTo(X_(-0.076), Y_(0.82), X_(-0.06), Y_(0.855), X_(-0.02), Y_(0.865));
    ctx.lineTo(X_(-0.014), Y_(0.895)); ctx.lineTo(X_(0.02), Y_(0.895)); ctx.lineTo(X_(0.02), Y_(0.865));
    ctx.bezierCurveTo(X_(0.06), Y_(0.855), X_(0.076), Y_(0.82), X_(0.062), Y_(0.76));
    ctx.bezierCurveTo(X_(0.04), Y_(0.66), X_(0.05), Y_(0.58), X_(0.058), Y_(0.5));
    ctx.bezierCurveTo(X_(0.064), Y_(0.4), X_(0.05), Y_(0.24), X_(0.046), Y_(0));
    ctx.lineTo(X_(0.01), Y_(0)); ctx.quadraticCurveTo(X_(0.006), Y_(0.3), X_(0), Y_(0.45)); ctx.quadraticCurveTo(X_(-0.006), Y_(0.3), X_(-0.01), Y_(0));
    ctx.closePath();
    for (const d of [-1, 1]) { // arms: bowed out a little, far too long
      ctx.moveTo(X_(d * 0.058), Y_(0.82));
      ctx.bezierCurveTo(X_(d * 0.1), Y_(0.8), X_(d * 0.118), Y_(0.62), X_(d * 0.112), Y_(0.3));
      ctx.lineTo(X_(d * 0.098), Y_(0.3));
      ctx.bezierCurveTo(X_(d * 0.098), Y_(0.56), X_(d * 0.09), Y_(0.7), X_(d * 0.062), Y_(0.76));
      ctx.closePath();
    }
    ctx.moveTo(X_(0.014) + s * 0.036 * Math.cos(0.28), Y_(0.938) + s * 0.036 * Math.sin(0.28));
    ctx.ellipse(X_(0.014), Y_(0.938), s * 0.036, s * 0.05, 0.28, 0, 7); // the head, tilted
  }

  window.drawBackrooms = function (bg, ctx, w, h) {
    const V = K.view(w, h, 0.5, 1.6), { W, H, u } = V, L = K.light(), pal = L ? PAL.L : PAL.D;
    const S = K.scene(bg, V, () => ({ lay: layout() }));
    let st = bg.st;
    if (!st || st.kind !== 'backrooms' || st.key !== S.key) {
      st = bg.st = { kind: 'backrooms', key: S.key, z: st && st.kind === 'backrooms' ? st.z : 0.9, ent: null, entWait: 1500 + Math.random() * 2400, flick: 0, fDip: 0, dFlash: 0, px: new Float64Array(10), py: new Float64Array(10) };
    }
    // the walk: forward, very slowly, with the slightest wander
    st.z += V.pv ? 0.0055 : 0.0085;
    // (the picker preview stays where the rooms stand open and looks into them, swaying a little: a wall close by would fill the strip)
    const camZ = V.pv ? 14 + Math.sin(st.z * 0.35) * 0.45 : st.z, camX = Math.sin(camZ * 0.19) * 0.24, yaw = V.pv ? -0.24 + Math.sin(st.z * 0.5) * 0.03 : Math.sin(camZ * 0.083 + 1.3) * 0.045;
    const cs = Math.cos(yaw), sn = Math.sin(yaw), f = u * 0.92, cx = W / 2, hy = H * 0.5, j0 = Math.floor(camZ / C);
    const lw = Math.max(0.6, u * 0.0011), px = st.px, py = st.py;
    let X0 = 0, Z0 = 0;
    const cam = (x, z) => { const dx = x - camX, dz = z - camZ; X0 = dx * cs - dz * sn; Z0 = dx * sn + dz * cs; };

    // the tubes: one stutters, one is dying, and now and then the whole floor dips
    let fv = 1, dv = 0.07, glob = 1;
    if (!V.pv) {
      if (st.fDip > 0) { st.fDip--; fv = Math.random() < 0.55 ? 0.12 : 0.75; } else if (Math.random() < 0.022) st.fDip = 2 + ((Math.random() * 9) | 0);
      if (st.dFlash > 0) { st.dFlash--; dv = 0.25 + Math.random() * 0.6; } else if (Math.random() < 0.005) st.dFlash = 1 + ((Math.random() * 4) | 0);
      // the visitor: a tube goes out far ahead, it is standing there; when the lights stutter it is gone
      const e = st.ent;
      if (!e) {
        if (--st.entWait <= 0) st.ent = { i: Math.random() < 0.78 ? 0 : Math.random() < 0.5 ? -1 : 1, J: j0 + 5 + ((Math.random() * 2) | 0), age: 0, life: 170 + Math.random() * 170, ox: (Math.random() - 0.5) * 0.8 };
      } else if (++e.age > e.life || (e.J + 0.5) * C - camZ < 10) { st.ent = null; st.entWait = 1800 + Math.random() * 2600; st.flick = DIP.length; }
      if (st.flick > 0) { glob = DIP[Math.max(0, DIP.length - st.flick)]; st.flick--; }
    }
    const ent = st.ent, FL = S.lay.fl, DY = S.lay.dy;
    const lum = (i, j) => {
      const jm = mod(j, P);
      const b = ent && i === ent.i && j === ent.J ? 0 : i === FL[0] && jm === FL[1] ? fv : i === DY[0] && jm === DY[1] ? dv : 1;
      return b * glob;
    };
    const dim = (L ? 1 : 0.72 + 0.28 * glob) * (V.pv ? 0.55 : 1); // a dark theme: the walls sink with the lights (the picker preview is thinner still)
    const G = S.g || (S.g = grads(ctx, pal, f, hy, H));

    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    /** A line at height y between two points on the plan, cut off at the near plane (added to the current path). */
    const line = (x0, z0, x1, z1, y) => {
      cam(x0, z0); let xa = X0, za = Z0; cam(x1, z1); let xb = X0, zb = Z0;
      if (za < NEAR && zb < NEAR) return;
      if (za < NEAR) { const k = (NEAR - za) / (zb - za); xa += (xb - xa) * k; za = NEAR; } else if (zb < NEAR) { const k = (NEAR - zb) / (za - zb); xb += (xa - xb) * k; zb = NEAR; }
      ctx.moveTo(cx + (f * xa) / za, hy - (f * (y - EYE)) / za); ctx.lineTo(cx + (f * xb) / zb, hy - (f * (y - EYE)) / zb);
    };

    // ---- the ceiling: its wash, the grid of tiles, a stained tile here and there, the tubes
    ctx.globalAlpha = dim; ctx.fillStyle = G.ceil; ctx.fillRect(0, 0, W, hy); ctx.globalAlpha = 1;
    const xe = (X + 0.5) * C;
    ctx.beginPath();
    for (let x = -xe; x <= xe + 0.01; x += 1.2) line(x, camZ + 0.3, x, camZ + FAR, HC);
    for (let z = Math.ceil((camZ + 1.3) / 1.2) * 1.2; z < camZ + FAR; z += 1.2) line(-xe, z, xe, z, HC);
    ctx.strokeStyle = G.grid; ctx.lineWidth = lw; ctx.stroke();
    const quad = (x0, z0, x1, z1, y) => { // a rectangle lying flat at height y; false if it is too near to draw
      cam(x0, z0); if (Z0 < 0.4) return false; ctx.beginPath(); ctx.moveTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x1, z0); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x1, z1); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x0, z1); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      ctx.closePath(); return true;
    };
    for (let j = j0 + NR; j >= j0; j--) {
      const jm = mod(j, P);
      for (let i = -X; i <= X; i++) {
        const pxw = i * C, pz = (j + 0.5) * C;
        cam(pxw, pz);
        const zc = Z0, a = fade(zc);
        if (zc < 1.3 || a <= 0.012) continue;
        const sx = cx + (f * X0) / zc, sy = hy - (f * (HC - EYE)) / zc;
        if (sx < -u * 0.4 || sx > W + u * 0.4) continue;
        if (hash(i, jm, 3) < 0.2) { // a tile the damp has got into
          const tx = pxw - 1.8 + 1.2 * ((hash(i, jm, 4) * 3) | 0), tz = j * C + (hash(i, jm, 5) < 0.5 ? 0 : 2.4);
          if (quad(tx, tz, tx + 1.2, tz + 1.2, HC)) { ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.1 : 0.2) * a})`; ctx.fill(); }
        }
        const b = lum(i, j);
        if (!quad(pxw - 0.6, pz - 0.3, pxw + 0.6, pz + 0.3, HC)) continue;
        if (L) { // on a light page a lit fitting is the page itself; a dead one is a grey slot
          if (b > 0.05) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${Math.min(1, b) * 0.95})`; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
          if (b < 0.9) { ctx.fillStyle = `rgba(${pal.ink},${0.2 * (1 - b) * a})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(${pal.ink},${0.34 * a})`; ctx.lineWidth = lw; ctx.stroke();
        } else { // a dark theme: a soft diffuser (text over a near light must still read), brighter round its rim
          ctx.fillStyle = `rgba(${pal.tube},${(0.035 + (0.16 + 0.14 * Math.min(1, zc / 10)) * b) * a})`; ctx.fill();
          ctx.strokeStyle = `rgba(${pal.tube},${(0.1 + 0.3 * b) * a})`; ctx.lineWidth = lw; ctx.stroke();
          if (b > 0.3 && zc < 14 && i >= -3 && i <= 3) K.glow(ctx, sx, sy, (f * 1.5) / zc, [[0, `rgba(${pal.tube},${0.12 * b * a})`], [1, `rgba(${pal.tube},0)`]], 1, Math.min(1, 1.3 / zc + 0.12));
        }
        if (zc < 15) { // the two tubes inside it
          ctx.beginPath(); line(pxw - 0.52, pz - 0.14, pxw + 0.52, pz - 0.14, HC); line(pxw - 0.52, pz + 0.14, pxw + 0.52, pz + 0.14, HC);
          ctx.strokeStyle = L ? `rgba(${pal.ink},${0.22 * a})` : `rgba(${pal.tube},${(0.06 + (0.16 + 0.5 * Math.min(1, zc / 12)) * b) * a})`; ctx.lineWidth = Math.max(lw, (f * 0.035) / zc); ctx.stroke();
        }
      }
    }

    // ---- the carpet: its wash, the light lying on it under each tube, the damp
    ctx.globalAlpha = dim; ctx.fillStyle = G.floor; ctx.fillRect(0, hy, W, H - hy); ctx.globalAlpha = 1;
    for (let j = j0 + 4; j >= j0; j--) {
      const jm = mod(j, P);
      for (let i = -2; i <= 2; i++) {
        cam(i * C, (j + 0.5) * C);
        if (Z0 > 1.4) {
          const b = lum(i, j), a = fade(Z0);
          if (b > 0.3) {
            const sx = cx + (f * X0) / Z0, sy = hy + (f * EYE) / Z0, rx = (f * 1.5) / Z0, ky = Math.min(1, EYE / Z0);
            if (L) { ctx.globalCompositeOperation = 'destination-out'; K.glow(ctx, sx, sy, rx, [[0, `rgba(0,0,0,${0.3 * b * a})`], [1, 'rgba(0,0,0,0)']], 1, ky); ctx.globalCompositeOperation = 'source-over'; } else K.glow(ctx, sx, sy, rx, [[0, `rgba(${pal.tube},${0.075 * b * a})`], [1, `rgba(${pal.tube},0)`]], 1, ky);
          }
        }
        if (hash(i, jm, 7) < 0.55) { // a patch where the carpet is wet: soft-edged, and it dries as we come up to it
          cam(i * C + (hash(i, jm, 8) - 0.5) * 2.2, (j + hash(i, jm, 9)) * C);
          if (Z0 > 1.8) {
            const r = 0.5 + hash(i, jm, 10) * 0.6, al = (L ? 0.06 : 0.15) * fade(Z0) * Math.min(1, (Z0 - 1.8) / 4);
            K.glow(ctx, cx + (f * X0) / Z0, hy + (f * EYE) / Z0, (f * r) / Z0, [[0, `rgba(${pal.ink},${al})`], [0.55, `rgba(${pal.ink},${al * 0.8})`], [1, `rgba(${pal.ink},0)`]], 1 + hash(i, jm, 11) * 0.5, Math.min(1, EYE / Z0));
          }
        }
      }
    }

    /**
     * A wall between two points on the plan. type 2 has a doorway dw wide in the middle. contA / contB: the wall
     * runs on past that end (then it is laid a hair longer so the join does not show, and gets no end line).
     */
    const wall = (x0, z0, x1, z1, type, dw, A, contA, contB) => {
      cam(x0, z0); const xa = X0, za = Z0; cam(x1, z1); const xb = X0, zb = Z0;
      if (za < NEAR && zb < NEAR) return;
      let sa = contA ? -0.006 : 0, sb = contB ? 1.006 : 1, cutA = false, cutB = false;
      if (za + (zb - za) * sa < NEAR) { sa = (NEAR - za) / (zb - za); cutA = true; }
      if (za + (zb - za) * sb < NEAR) { sb = (NEAR - za) / (zb - za); cutB = true; }
      if (sb - sa < 1e-4) return;
      const zA = za + (zb - za) * sa, zB = za + (zb - za) * sb, fa = fade(zA), fb = fade(zB);
      if (fa <= 0.004 && fb <= 0.004) return;
      const sxA = cx + (f * (xa + (xb - xa) * sa)) / zA, sxB = cx + (f * (xa + (xb - xa) * sb)) / zB;
      if (Math.abs(sxB - sxA) < 0.4 || Math.max(sxA, sxB) < -2 || Math.min(sxA, sxB) > W + 2) return;
      const d0 = 0.5 - dw / (2 * C), d1 = 0.5 + dw / (2 * C), door = type === 2 && d0 < sb && d1 > sa;
      let n = 0;
      const pt = (s, y) => { const zc = za + (zb - za) * s; px[n] = cx + (f * (xa + (xb - xa) * s)) / zc; py[n] = hy - (f * (y - EYE)) / zc; n++; };
      pt(sa, HC); pt(sb, HC);
      if (door) { // along the floor from B back to A, stepping up over the doorway
        if (sb > d1) { pt(sb, 0); pt(d1, 0); pt(d1, LINTEL); } else pt(sb, LINTEL);
        if (sa < d0) { pt(d0, LINTEL); pt(d0, 0); pt(sa, 0); } else pt(sa, LINTEL);
      } else { pt(sb, 0); pt(sa, 0); }
      ctx.beginPath(); ctx.moveTo(px[0], py[0]);
      for (let k = 1; k < n; k++) ctx.lineTo(px[k], py[k]);
      ctx.closePath();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (Math.abs(fa - fb) < 0.02) ctx.fillStyle = `rgba(${pal.wall},${A * dim * (fa + fb) * 0.5})`;
      else { const g = ctx.createLinearGradient(sxA, 0, sxB, 0); g.addColorStop(0, `rgba(${pal.wall},${A * dim * fa})`); g.addColorStop(1, `rgba(${pal.wall},${A * dim * fb})`); ctx.fillStyle = g; }
      ctx.fill();
      const fm = (fa + fb) * 0.5, zm = (zA + zB) * 0.5;
      if (zm < 12 && Math.abs(sxB - sxA) > 22) { // near enough to see the paper: pairs of thin stripes, and the skirting
        ctx.beginPath();
        for (let k = Math.max(1, Math.ceil(sa * 8 + 1e-6)); k <= 7 && k / 8 < sb; k++) {
          for (const s of [k / 8 - 0.009, k / 8 + 0.009]) {
            if (s <= sa || s >= sb) continue;
            const zc = za + (zb - za) * s, x = cx + (f * (xa + (xb - xa) * s)) / zc;
            ctx.moveTo(x, hy - (f * (HC - EYE)) / zc); ctx.lineTo(x, hy - (f * ((door && s > d0 && s < d1 ? LINTEL : 0.1) - EYE)) / zc);
          }
        }
        ctx.strokeStyle = `rgba(${pal.ink},${(L ? 0.1 : 0.16) * fm * Math.min(1, (12 - zm) / 5)})`; ctx.lineWidth = lw; ctx.stroke();
        ctx.beginPath();
        const skirt = (s0, s1) => { if (s1 - s0 < 1e-3) return; let zc = za + (zb - za) * s0; ctx.moveTo(cx + (f * (xa + (xb - xa) * s0)) / zc, hy - (f * (0.1 - EYE)) / zc); zc = za + (zb - za) * s1; ctx.lineTo(cx + (f * (xa + (xb - xa) * s1)) / zc, hy - (f * (0.1 - EYE)) / zc); };
        if (door) { skirt(sa, Math.min(sb, d0)); skirt(Math.max(sa, d1), sb); } else skirt(sa, sb);
        ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.55 * fm})`; ctx.stroke();
      }
      ctx.beginPath(); // the ink: along the ceiling, along the floor and round the doorway, and down a free end
      ctx.moveTo(px[0], py[0]); ctx.lineTo(px[1], py[1]);
      ctx.moveTo(px[2], py[2]);
      for (let k = 3; k < n; k++) ctx.lineTo(px[k], py[k]);
      if (!contB && !cutB) { ctx.moveTo(px[1], py[1]); ctx.lineTo(px[2], py[2]); }
      if (!contA && !cutA) { ctx.moveTo(px[n - 1], py[n - 1]); ctx.lineTo(px[0], py[0]); }
      ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * fm})`; ctx.lineWidth = lw; ctx.stroke();
    };
    /** The cut end of a wall inside a doorway: a plain upright face from the floor to the lintel. */
    const slab = (x0, z0, x1, z1, A) => {
      cam(x0, z0); const xa = X0, za = Z0; cam(x1, z1); const xb = X0, zb = Z0;
      if (za < 0.4 || zb < 0.4) return;
      const fa = fade((za + zb) * 0.5), ax = cx + (f * xa) / za, bx = cx + (f * xb) / zb;
      if (fa <= 0.004 || Math.abs(bx - ax) < 0.5) return;
      ctx.beginPath();
      ctx.moveTo(ax, hy - (f * (LINTEL - EYE)) / za); ctx.lineTo(bx, hy - (f * (LINTEL - EYE)) / zb); ctx.lineTo(bx, hy + (f * EYE) / zb); ctx.lineTo(ax, hy + (f * EYE) / za); ctx.closePath();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(${pal.wall},${A * dim * fa})`; ctx.fill();
      ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * fa})`; ctx.lineWidth = lw; ctx.stroke();
    };
    /** The underside of a lintel. */
    const soffit = (x0, z0, x1, z1, A) => {
      if (!quad(x0, z0, x1, z1, LINTEL)) return;
      cam((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      const fa = fade(Z0);
      if (fa <= 0.004) return;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(${pal.wall},${A * dim * fa})`; ctx.fill();
    };
    const visitor = () => {
      const e = ent;
      cam(e.i * C + e.ox, (e.J + 0.5) * C);
      if (Z0 < 2 || e.age < 26) return;
      const s = (f * 2.32) / Z0, k = Math.min(1, (e.age - 26) / 24);
      figure(ctx, cx + (f * X0) / Z0, hy + (f * EYE) / Z0, s);
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = L ? `rgba(46,34,20,${0.5 * k})` : `rgba(4,3,1,${0.8 * k})`; ctx.fill();
    };

    // ---- the walls, farthest row first; within a row, the far wall, then the side walls from the outside in
    const lay = S.lay;
    for (let j = j0 + NR; j >= j0; j--) {
      const jm = mod(j, P), cr = lay.cross[jm], sd = lay.side[jm], sdP = lay.side[mod(j - 1, P)], sdN = lay.side[mod(j + 1, P)], zn = j * C, zf = zn + C;
      for (let i = -X; i <= X; i++) {
        const ty = cr[i + X], dw = i === 0 ? 1.7 : 1.05;
        if (ty === 2) { // a doorway: what shows of the wall's thickness — under the lintel, and the jamb that faces us
          const xl = i * C - dw / 2, xr = i * C + dw / 2;
          soffit(xl, zf, xr, zf + TH, pal.aSide * 0.75);
          if (camX > xl) slab(xl, zf, xl, zf + TH, pal.aSide * 0.85);
          if (camX < xr) slab(xr, zf, xr, zf + TH, pal.aSide * 0.85);
        }
        if (ty) wall((i - 0.5) * C, zf, (i + 0.5) * C, zf, ty, dw, pal.aCross, i > -X && cr[i + X - 1] > 0, i < X && cr[i + X + 1] > 0);
      }
      const here = ent && ent.J === j;
      const sideWall = (e) => {
        const ty = sd[e + X], x = (e - 0.5) * C;
        if (!ty) return;
        if (ty === 2) { // its doorway: the far jamb faces us, the wall's body lying away from the hall
          const za0 = zn + C / 2 - 0.525, zb0 = zn + C / 2 + 0.525, xo = x + (x > camX ? TH : -TH);
          soffit(x, za0, xo, zb0, pal.aSide * 0.75);
          if (camZ < zb0 - 0.4) slab(x, zb0, xo, zb0, pal.aCross * 0.9);
        }
        wall(x, zn, x, zf, ty, 1.05, pal.aSide, sdP[e + X] > 0, sdN[e + X] > 0);
      };
      for (let e = -X; e <= 0; e++) {
        if (here && ent.i === e - 1) visitor();
        sideWall(e);
      }
      for (let e = X + 1; e >= 1; e--) {
        if (here && ent.i === e) visitor();
        sideWall(e);
      }
      if (here && ent.i === 0) visitor();
    }
    if (L && glob < 1) { ctx.fillStyle = `rgba(${pal.ink},${0.07 * (1 - glob)})`; ctx.fillRect(0, 0, W, H); } // a light page: the stutter is a passing shade
    ctx.restore();
  };
})();
