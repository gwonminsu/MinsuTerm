'use strict';
/*
 * 유령 (a wraith): a typing effect in its own module (see fx/kit.js for the contract).
 *   key press  the character breathes out cold: its cell dims as if the warmth were drawn out of it, frost creeps from
 *              its corners, and a thread of its own light is pulled upward into a dark tattered shred that thins to smoke
 *   Enter      the light drains around the line and frost runs along it; out of the last input position a hooded,
 *              faceless wraith rises in long rags, pale wisps are drawn up out of the submitted letters into the dark of
 *              its hood while its bony fingers close, and it comes apart into smoke
 * Painted once and cached: the cloak and hood (two layers), each rag as a straight textured strip, smoke puffs, frost
 * crystals, letters. Each frame only bends the rags (drawn in slices: a wave runs down them and their tips trail where
 * the body was a few frames before), draws the hands and moves things about.
 */
(function () {
  const { TAU, sprite, paint, put, part, clamp, ease, rand, rng, isLight, scaleOf, glow, rgba, anchor, thin } = window.FXKit;

  /* ---------- colours and light ---------- */

  const DARK = {
    cloth: [10, 13, 21], mid: [30, 37, 52], fold: [66, 78, 100], rim: [186, 212, 216], lining: [36, 44, 60], void: [0, 0, 3],
    bone: [200, 206, 200], boneSh: [28, 34, 44], frost: [226, 242, 255], frostGlow: [140, 196, 255], soul: [226, 246, 240], soulGlow: [130, 206, 196],
  };
  const LIGHT = { // an ink wash: the rim is an inked edge here, not light
    cloth: [44, 48, 58], mid: [74, 80, 94], fold: [124, 132, 146], rim: [20, 22, 30], lining: [96, 102, 116], void: [8, 10, 14],
    bone: [238, 236, 226], boneSh: [50, 52, 58], frost: [66, 98, 142], frostGlow: [126, 154, 194], soul: [52, 78, 120], soulGlow: [110, 132, 168],
  };
  const pal = (L) => (L ? LIGHT : DARK);
  /** The faint sickly glow behind the wraith (a cold grey wash on a light page). */
  const auraG = (L) => (L
    ? glow('wr-washL', [[0, 'rgba(146,160,184,0.5)'], [0.5, 'rgba(168,180,200,0.22)'], [1, 'rgba(190,200,214,0)']])
    : glow('wr-aura', [[0, 'rgba(206,230,222,0.6)'], [0.35, 'rgba(150,188,186,0.26)'], [0.7, 'rgba(96,136,146,0.07)'], [1, 'rgba(80,120,140,0)']]));
  /** Light drained away: a soft dark (a grey ink wash on a light page). */
  const darkG = (L) => (L
    ? glow('wr-dimL', [[0, 'rgba(56,62,78,0.6)'], [0.5, 'rgba(66,74,90,0.34)'], [1, 'rgba(84,92,106,0)']])
    : glow('wr-dim', [[0, 'rgba(1,2,6,0.92)'], [0.5, 'rgba(2,3,8,0.64)'], [1, 'rgba(3,4,10,0)']]));
  const rimeG = (L) => (L
    ? glow('wr-rimeL', [[0, 'rgba(88,116,156,0.6)'], [0.45, 'rgba(110,136,172,0.25)'], [1, 'rgba(130,150,186,0)']])
    : glow('wr-rime', [[0, 'rgba(226,242,255,0.75)'], [0.4, 'rgba(150,200,255,0.28)'], [1, 'rgba(120,170,240,0)']]));
  const soulG = (L) => (L
    ? glow('wr-soulL', [[0, 'rgba(60,86,128,0.8)'], [0.4, 'rgba(94,116,152,0.3)'], [1, 'rgba(120,140,170,0)']])
    : glow('wr-soul', [[0, 'rgba(244,255,252,1)'], [0.25, 'rgba(186,232,222,0.5)'], [1, 'rgba(110,170,170,0)']]));
  /** A billow of smoke: overlapping soft lobes, denser in the hollows, cold light catching the top of each (64 px). */
  const puffS = (v, L) => sprite(`wr-puff|${v}|${L}`, () => paint(64, 64, 1, (x) => {
    const P = pal(L), R = rng(v * 337 + 11), lobes = [];
    for (let i = 0; i < 12; i++) { const r = 6 + R() * 8, a = R() * TAU, d = R() * 12; lobes.push([32 + Math.cos(a) * d * 1.2, 33 + Math.sin(a) * d * 0.8, r]); }
    const lobe = (bx, by, r, col, al) => { const g = x.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, rgba(col, al)); g.addColorStop(0.55, rgba(col, al * 0.55)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(bx - r, by - r, r * 2, r * 2); };
    if (!L) for (const [bx, by, r] of lobes) lobe(bx, by - r * 0.25, r * 1.05, P.rim, 0.035);
    for (const [bx, by, r] of lobes) lobe(bx, by, r, L ? [72, 78, 90] : P.cloth, L ? 0.26 : 0.4);
    for (const [bx, by, r] of lobes) lobe(bx + r * 0.15, by + r * 0.2, r * 0.55, L ? [40, 44, 54] : P.void, L ? 0.14 : 0.22);
  }));
  const NPUFF = 4;

  /* ---------- frost, letters ---------- */

  /** A frost crystal len px long: a stem from its root at the left middle, branches near 60°, twigs on those. */
  const iceS = (v, len, L, q) => sprite(`wr-ice|${v}|${len}|${L}|${q}`, () => paint(len + 4, len + 4, q, (x) => {
    const P = pal(L), R = rng(v * 7919 + len * 31 + 13), segs = [], oy = (len + 4) / 2;
    const grow = (x0, y0, ang, l, wd, depth) => {
      const x1 = x0 + Math.cos(ang) * l, y1 = y0 + Math.sin(ang) * l;
      segs.push([x0, y0, x1, y1, wd]);
      if (depth <= 0 || l < 2.5) return;
      for (let i = 1, n = depth > 1 ? 3 : 2; i <= n; i++) {
        const t = i / (n + 1) + (R() - 0.5) * 0.1, bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t, bl = l * (0.4 - t * 0.2) * (0.75 + R() * 0.4);
        if (R() < 0.85) grow(bx, by, ang - Math.PI / 3 + (R() - 0.5) * 0.35, bl, wd * 0.66, depth - 1);
        if (R() < 0.85) grow(bx, by, ang + Math.PI / 3 + (R() - 0.5) * 0.35, bl * (0.6 + R() * 0.5), wd * 0.66, depth - 1);
      }
    };
    grow(1.5, oy, (R() - 0.5) * 0.25, len, Math.max(0.75, len * 0.055), 2);
    x.lineCap = 'round';
    const pass = (col, k, add) => { x.strokeStyle = col; for (const [x0, y0, x1, y1, wd] of segs) { x.lineWidth = wd * k + add; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); } };
    x.shadowColor = rgba(P.frostGlow, L ? 0.4 : 0.85); x.shadowBlur = (L ? 1 : 1.6) * q;
    pass(rgba(P.frost, L ? 0.8 : 0.5), 1, 0);
    x.shadowBlur = 0;
    pass(L ? 'rgba(168,190,222,0.9)' : 'rgba(250,253,255,0.9)', 0.5, 0.05); // the glassy heart of each needle
  }));
  /** A four-pointed glint for the tip of a crystal (12 px). */
  const sparkS = (L, q) => sprite(`wr-spark|${L}|${q}`, () => paint(12, 12, q, (x) => {
    const P = pal(L);
    x.translate(6, 6);
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 5); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, rgba(P.frostGlow, 0.3)); g.addColorStop(1, rgba(P.frostGlow, 0)); x.fillStyle = g; x.fillRect(-6, -6, 12, 12); }
    x.fillStyle = L ? rgba(P.frost, 1) : '#ffffff';
    x.beginPath(); x.moveTo(0, -5.5); x.quadraticCurveTo(0.6, -0.6, 5.5, 0); x.quadraticCurveTo(0.6, 0.6, 0, 5.5); x.quadraticCurveTo(-0.6, 0.6, -5.5, 0); x.quadraticCurveTo(-0.6, -0.6, 0, -5.5); x.fill();
  }));
  /** A crystal with its root at (x, y), pointing along ang, grown out to the fraction g of its length (a sparkle at its tip). */
  function ice(ctx, s, x, y, ang, g, spark, tw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (g < 1) { ctx.beginPath(); ctx.rect(-2, -s.h / 2, s.w * g + 1, s.h); ctx.clip(); }
    ctx.drawImage(s.c, -1.5, -s.h / 2, s.w, s.h);
    ctx.restore();
    if (spark && tw > 0.01) { const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * tw; put(ctx, spark, x + Math.cos(ang) * s.w * 0.8, y + Math.sin(ang) * s.w * 0.8, 0.45 + 0.4 * tw, tw * 0.8); ctx.globalAlpha = a0; }
  }
  const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
  const termFont = () => (typeof S !== 'undefined' && S.settings && S.settings.fontFamily) || "'Cascadia Mono', Consolas, 'Malgun Gothic', monospace";
  const termSize = (ch) => (typeof S !== 'undefined' && S.settings && +S.settings.fontSize) || Math.round(ch * 0.72);
  /** A letter's own light: the glyph in a pale, slightly sickly glow (slate blue on a light page). */
  const glyphS = (g, w, h, fs, L, q) => sprite(`wr-glyph|${g}|${w}|${h}|${fs}|${L}|${q}`, () => paint(w + 10, h + 10, q, (x) => {
    x.font = `${fs}px ${termFont()}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = L ? 'rgba(100,120,156,0.55)' : 'rgba(150,214,200,0.95)'; x.shadowBlur = 3.5 * q;
    x.fillStyle = L ? 'rgba(58,80,118,0.92)' : 'rgba(228,246,240,0.95)';
    x.fillText(g, (w + 10) / 2, (h + 10) / 2 + 0.5);
  }));

  /* ---------- the wraith: cloth ---------- */

  /** Cloth over a shape: lit a little from the upper left, a worn mottled weave, folds as ridge and crease, its edge rim-lit. */
  function fabric(x, P, L, q, path, o) {
    if (!L && o.rim) { // cold light from behind spilling round its edge
      x.save(); x.shadowColor = rgba(P.rim, 0.6); x.shadowBlur = 3 * q; x.shadowOffsetX = o.rim[0] * q; x.shadowOffsetY = o.rim[1] * q;
      x.fillStyle = rgba(P.cloth, 1); x.fill(path); x.restore();
    }
    x.fillStyle = rgba(P.cloth, 1); x.fill(path);
    x.save(); x.clip(path);
    const [bx0, by0, bx1, by1] = o.box, bw = bx1 - bx0, bh = by1 - by0, R = rng(o.seed);
    const g = x.createRadialGradient(o.lx, o.ly, 0, o.lx, o.ly, o.lr);
    g.addColorStop(0, rgba(P.fold, L ? 0.55 : 0.5)); g.addColorStop(0.45, rgba(P.mid, 0.35)); g.addColorStop(1, rgba(P.mid, 0));
    x.fillStyle = g; x.fillRect(bx0, by0, bw, bh);
    for (let i = 0, n = Math.min(420, Math.round((bw * bh) / 14)); i < n; i++) { // the weave, worn: mottled lighter and darker
      x.fillStyle = R() < 0.5 ? rgba(P.fold, 0.05 + R() * 0.1) : rgba(P.void, 0.08 + R() * 0.18);
      x.beginPath(); x.ellipse(bx0 + R() * bw, by0 + R() * bh, 0.5 + R() * 1.6, 0.8 + R() * 2.8, 0, 0, TAU); x.fill();
    }
    x.lineCap = 'round';
    for (const [x0, y0, x1, y1] of o.folds || []) { // a fold: a ridge catching the light beside a dark crease
      const mx = (x0 + x1) / 2 + (R() - 0.5) * bw * 0.08, my = (y0 + y1) / 2;
      x.strokeStyle = rgba(P.fold, L ? 0.26 : 0.16); x.lineWidth = Math.max(1.2, bw * 0.06); x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(mx, my, x1, y1); x.stroke();
      x.strokeStyle = rgba(P.void, 0.36); x.lineWidth = Math.max(0.7, bw * 0.018); x.beginPath(); x.moveTo(x0 + 1.4, y0); x.quadraticCurveTo(mx + 1.4, my, x1 + 1.4, y1); x.stroke();
    }
    x.restore();
    if (L) { x.strokeStyle = rgba(P.rim, 0.55); x.lineWidth = 0.9; x.stroke(path); }
  }
  /** A thin line of cold light along an edge, softly glowing (dark stage only). */
  function rimLine(x, P, L, q, path, al = 0.55) {
    if (L) return;
    x.save(); x.lineCap = 'round'; x.shadowColor = rgba(P.rim, 0.9); x.shadowBlur = 2.5 * q; x.strokeStyle = rgba(P.rim, al); x.lineWidth = 0.9; x.stroke(path); x.restore();
  }
  /** The dark inside of a sleeve's cuff. */
  function hollow(x, P, cx, cy, rx, ry, rot) {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(1, ry / rx);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, rgba(P.void, 0.95)); g.addColorStop(0.7, rgba(P.void, 0.8)); g.addColorStop(1, rgba(P.void, 0));
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, TAU); x.fill(); x.restore();
  }
  const padOf = (W) => Math.round(W * 0.14);
  const poly = (pts) => { const p = new Path2D(); pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py))); return p; };
  /** The cloak's back layer: its body (giving way to the rags lower down) and the right sleeve hanging. Figure centre at 0.6 W. */
  const backS = (W, H, L, q) => sprite(`wr-back|${W}|${H}|${L}|${q}`, () => {
    const PX = padOf(W);
    return paint(W + PX * 2, H, q, (x) => {
      x.translate(PX, 0);
      const P = pal(L), cx = W * 0.6, body = new Path2D(), rs = new Path2D();
      body.moveTo(cx - 0.15 * W, 0.28 * H);
      body.bezierCurveTo(cx - 0.27 * W, 0.31 * H, cx - 0.29 * W, 0.4 * H, cx - 0.24 * W, 0.6 * H);
      body.lineTo(cx + 0.27 * W, 0.6 * H);
      body.bezierCurveTo(cx + 0.31 * W, 0.4 * H, cx + 0.28 * W, 0.31 * H, cx + 0.15 * W, 0.28 * H);
      body.closePath();
      fabric(x, P, L, q, body, { lx: cx - 0.12 * W, ly: 0.33 * H, lr: 0.3 * W, rim: [0, -1], seed: W * 7 + 1, box: [cx - 0.3 * W, 0.27 * H, cx + 0.32 * W, 0.61 * H], folds: [-0.13, 0.02, 0.16].map((f) => [cx + f * W * 0.8, 0.33 * H, cx + f * W * 1.1, 0.6 * H]) });
      x.save(); x.globalCompositeOperation = 'destination-in'; // lower down the body gives way to its rags
      const v = x.createLinearGradient(0, 0.44 * H, 0, 0.6 * H); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = v; x.fillRect(-PX, 0, W + PX * 2, H); x.restore();
      rs.moveTo(cx + 0.15 * W, 0.3 * H);
      rs.quadraticCurveTo(cx + 0.31 * W, 0.32 * H, cx + 0.31 * W, 0.45 * H);
      rs.quadraticCurveTo(cx + 0.31 * W, 0.53 * H, cx + 0.3 * W, 0.56 * H);
      rs.quadraticCurveTo(cx + 0.33 * W, 0.62 * H, cx + 0.32 * W, 0.68 * H); // a tatter hanging from the cuff
      rs.quadraticCurveTo(cx + 0.27 * W, 0.61 * H, cx + 0.2 * W, 0.56 * H);
      rs.quadraticCurveTo(cx + 0.17 * W, 0.45 * H, cx + 0.14 * W, 0.37 * H);
      rs.closePath();
      fabric(x, P, L, q, rs, { lx: cx + 0.24 * W, ly: 0.33 * H, lr: 0.16 * W, rim: [1.2, -0.6], seed: W * 7 + 2, box: [cx + 0.13 * W, 0.29 * H, cx + 0.34 * W, 0.69 * H], folds: [[cx + 0.23 * W, 0.34 * H, cx + 0.27 * W, 0.6 * H]] });
      hollow(x, P, cx + 0.25 * W, 0.56 * H, 0.055 * W, 0.018 * H, 0.05);
      rimLine(x, P, L, q, poly([[cx + 0.08 * W, 0.29 * H], [cx + 0.2 * W, 0.302 * H], [cx + 0.29 * W, 0.35 * H], [cx + 0.31 * W, 0.45 * H], [cx + 0.3 * W, 0.55 * H]])); // the right shoulder and arm
    });
  });
  /** The front layer: the left arm reaching out toward the line, the hood (peaked, its tip fallen back), a void in it for a face. */
  const frontS = (W, H, L, q) => sprite(`wr-front|${W}|${H}|${L}|${q}`, () => {
    const PX = padOf(W);
    return paint(W + PX * 2, H, q, (x) => {
      x.translate(PX, 0);
      const P = pal(L), cx = W * 0.6, ls = new Path2D(), hood = new Path2D(), crown = new Path2D();
      ls.moveTo(cx - 0.13 * W, 0.29 * H);
      ls.quadraticCurveTo(cx - 0.33 * W, 0.29 * H, cx - 0.47 * W, 0.4 * H);
      ls.quadraticCurveTo(cx - 0.53 * W, 0.45 * H, cx - 0.57 * W, 0.5 * H);
      ls.lineTo(cx - 0.5 * W, 0.57 * H);
      ls.quadraticCurveTo(cx - 0.47 * W, 0.63 * H, cx - 0.42 * W, 0.69 * H); // a tatter hanging from the cuff
      ls.quadraticCurveTo(cx - 0.43 * W, 0.6 * H, cx - 0.39 * W, 0.52 * H);
      ls.quadraticCurveTo(cx - 0.3 * W, 0.45 * H, cx - 0.2 * W, 0.42 * H);
      ls.closePath();
      fabric(x, P, L, q, ls, { lx: cx - 0.3 * W, ly: 0.31 * H, lr: 0.22 * W, rim: [-0.6, -1.2], seed: W * 7 + 3, box: [cx - 0.58 * W, 0.28 * H, cx - 0.12 * W, 0.7 * H], folds: [[cx - 0.18 * W, 0.33 * H, cx - 0.48 * W, 0.49 * H], [cx - 0.36 * W, 0.45 * H, cx - 0.44 * W, 0.64 * H]] });
      hollow(x, P, cx - 0.535 * W, 0.535 * H, 0.05 * W, 0.02 * H, -0.85);
      rimLine(x, P, L, q, poly([[cx - 0.1 * W, 0.288 * H], [cx - 0.3 * W, 0.296 * H], [cx - 0.44 * W, 0.375 * H], [cx - 0.56 * W, 0.49 * H]])); // the top of the arm
      for (const p of [hood, crown]) { // up the side to the crown, over it to the tip fallen back
        p.moveTo(cx - 0.2 * W, 0.31 * H);
        p.bezierCurveTo(cx - 0.25 * W, 0.17 * H, cx - 0.14 * W, 0.05 * H, cx + 0.02 * W, 0.025 * H);
        p.bezierCurveTo(cx + 0.1 * W, 0.012 * H, cx + 0.17 * W, 0.02 * H, cx + 0.23 * W, 0.06 * H);
        p.quadraticCurveTo(cx + 0.19 * W, 0.09 * H, cx + 0.2 * W, 0.14 * H);
      }
      hood.bezierCurveTo(cx + 0.23 * W, 0.2 * H, cx + 0.23 * W, 0.27 * H, cx + 0.2 * W, 0.31 * H); // down its back
      hood.bezierCurveTo(cx + 0.12 * W, 0.36 * H, cx + 0.04 * W, 0.4 * H, cx - 0.01 * W, 0.41 * H); // its front, fallen over the chest
      hood.bezierCurveTo(cx - 0.07 * W, 0.39 * H, cx - 0.14 * W, 0.36 * H, cx - 0.2 * W, 0.31 * H);
      hood.closePath();
      fabric(x, P, L, q, hood, { lx: cx - 0.09 * W, ly: 0.07 * H, lr: 0.28 * W, rim: [-0.5, -1], seed: W * 7 + 4, box: [cx - 0.25 * W, 0, cx + 0.25 * W, 0.42 * H], folds: [[cx - 0.06 * W, 0.06 * H, cx - 0.19 * W, 0.3 * H], [cx + 0.1 * W, 0.05 * H, cx + 0.17 * W, 0.3 * H], [cx - 0.13 * W, 0.33 * H, cx - 0.02 * W, 0.4 * H]] });
      rimLine(x, P, L, q, crown, 0.7); // the crown, lit from behind
      const fx0 = cx - 0.02 * W, fw = 0.095 * W, face = new Path2D(); // where a face would be: the lining of the hood, then nothing
      face.moveTo(fx0 - fw, 0.2 * H);
      face.quadraticCurveTo(fx0 - fw * 1.05, 0.095 * H, fx0 + 0.01 * W, 0.075 * H);
      face.quadraticCurveTo(fx0 + fw * 1.1, 0.095 * H, fx0 + fw, 0.2 * H);
      face.quadraticCurveTo(fx0 + fw * 0.75, 0.29 * H, fx0, 0.305 * H);
      face.quadraticCurveTo(fx0 - fw * 0.75, 0.29 * H, fx0 - fw, 0.2 * H);
      face.closePath();
      x.fillStyle = rgba(P.lining, 1); x.fill(face);
      x.save(); x.clip(face);
      let g = x.createRadialGradient(fx0 + 0.015 * W, 0.17 * H, 0, fx0 + 0.015 * W, 0.18 * H, fw * 1.35); // down into black, deepest under the brim
      g.addColorStop(0, rgba(P.void, 1)); g.addColorStop(0.5, rgba(P.void, 1)); g.addColorStop(0.78, rgba(L ? [26, 30, 38] : [5, 7, 13], 0.92)); g.addColorStop(1, rgba(P.void, 0));
      x.fillStyle = g; x.fillRect(fx0 - fw * 1.2, 0.06 * H, fw * 2.4, 0.26 * H);
      g = x.createLinearGradient(0, 0.075 * H, 0, 0.15 * H); g.addColorStop(0, rgba(P.void, 0.9)); g.addColorStop(1, rgba(P.void, 0));
      x.fillStyle = g; x.fillRect(fx0 - fw * 1.2, 0.06 * H, fw * 2.4, 0.1 * H);
      x.restore();
      x.strokeStyle = rgba(P.fold, L ? 0.75 : 0.55); x.lineWidth = Math.max(0.8, W * 0.012); // the lip of the hood over it
      x.beginPath(); x.moveTo(fx0 - fw, 0.2 * H); x.quadraticCurveTo(fx0 - fw * 1.05, 0.095 * H, fx0 + 0.01 * W, 0.075 * H); x.quadraticCurveTo(fx0 + fw * 1.1, 0.095 * H, fx0 + fw, 0.2 * H); x.stroke();
    });
  });
  // rags (box fractions from its centre): where each hangs from, how long and wide; lag (frames its tip trails the body),
  // wave speed and number (a wave runs down it), sway, fan (how far it splays out); the back ones darker and slower
  const RAGS = [
    { x: -0.07, y: 0, len: 0.48, w: 0.13, lag: 15, om: 0.042, k: 2.4, amp: 0.06, off: 0, fan: -0.1, seed: 1, lit: -1, back: true },
    { x: 0.08, y: 0, len: 0.52, w: 0.15, lag: 16, om: 0.038, k: 2.2, amp: 0.055, off: 1.7, fan: 0.02, seed: 2, lit: 0, back: true },
    { x: 0.24, y: 0.01, len: 0.46, w: 0.13, lag: 15, om: 0.045, k: 2.6, amp: 0.06, off: 3.1, fan: 0.12, seed: 3, lit: 1, back: true },
    { x: -0.1, y: 0.05, len: 0.4, w: 0.12, lag: 9, om: 0.075, k: 2.8, amp: 0.05, off: 0.6, fan: -0.14, seed: 5, lit: -1 },
    { x: 0.04, y: 0.07, len: 0.44, w: 0.13, lag: 10, om: 0.07, k: 2.5, amp: 0.045, off: 2, fan: -0.03, seed: 6, lit: 0 },
    { x: 0.18, y: 0.06, len: 0.42, w: 0.12, lag: 10, om: 0.075, k: 2.7, amp: 0.05, off: 3.5, fan: 0.06, seed: 7, lit: 0 },
    { x: 0.31, y: 0.05, len: 0.36, w: 0.11, lag: 9, om: 0.08, k: 2.9, amp: 0.055, off: 5, fan: 0.16, seed: 8, lit: 1 },
  ];
  /** One rag, painted hanging straight: torn edges, frayed into tongues, a worn weave, shaded across, fading in at the top and into smoke at the end. */
  function ragS(d, W, H, L, q) {
    const w = Math.max(3, Math.round(d.w * W)), len = Math.max(8, Math.round(d.len * H)), pad = Math.ceil(w * 0.45) + 2;
    return sprite(`wr-rag|${d.seed}|${w}|${len}|${L}|${q}`, () => paint(w + pad * 2, len, q, (x) => {
      const P = pal(L), R = rng(d.seed * 977 + w * 13 + len), cx = pad + w / 2, split = 0.46, N = 16, lf = [], rt = [], parts = [];
      for (let i = 0; i <= N; i++) { const s = (i / N) * (split + 0.06), half = w * 0.5 * (1 - s * 0.3); lf.push([cx - half * (0.86 + 0.28 * R()), s * len]); rt.push([cx + half * (0.86 + 0.28 * R()), s * len]); }
      parts.push(poly([[lf[0][0], -1], ...lf, ...rt.slice().reverse(), [rt[0][0], -1]]));
      const nt = w > 9 ? 3 : 2;
      for (let j = 0; j < nt; j++) { // the end torn into tongues, splaying a little
        const o = (j - (nt - 1) / 2) / nt, tl = len * (1 - split) * (0.6 + 0.4 * R()), tw = (w / nt) * (1.15 + 0.3 * R()), x0 = cx + o * w * 0.85, y0 = split * len, sp = o * w * 0.5 + (R() - 0.5) * w * 0.2, a = [], b = [];
        for (let i = 0; i <= 8; i++) { const s = i / 8, xm = x0 + sp * s * s, half = tw * 0.5 * (1 - s) ** 0.75 * (0.8 + 0.4 * R()); a.push([xm - half, y0 + s * tl]); b.push([xm + half, y0 + s * tl]); }
        parts.push(poly([[a[0][0], y0 - len * 0.05], ...a, ...b.reverse(), [b[b.length - 1][0], y0 - len * 0.05]]));
      }
      x.fillStyle = rgba(P.cloth, 1);
      for (const p of parts) x.fill(p);
      x.globalCompositeOperation = 'source-atop';
      const ls = d.lit || -1, g = x.createLinearGradient(cx + ls * w * 0.5, 0, cx - ls * w * 0.5, 0); // round, not flat: a lit side, a shadowed side
      g.addColorStop(0, rgba(P.fold, L ? 0.55 : 0.45)); g.addColorStop(0.3, rgba(P.mid, 0.4)); g.addColorStop(0.62, rgba(P.cloth, 0)); g.addColorStop(1, rgba(P.void, 0.55));
      x.fillStyle = g; x.fillRect(0, 0, w + pad * 2, len);
      for (let i = 0, n = Math.min(260, Math.round((w * len) / 10)); i < n; i++) { // a worn weave
        x.fillStyle = R() < 0.5 ? rgba(P.fold, 0.05 + R() * 0.12) : rgba(P.void, 0.1 + R() * 0.22);
        x.beginPath(); x.ellipse(pad + R() * w, R() * len, 0.4 + R() * 1.2, 0.8 + R() * 2.6, 0, 0, TAU); x.fill();
      }
      x.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) { // threads running down it
        const fx0 = pad + w * (0.1 + 0.8 * R()), wob = (R() - 0.5) * w * 0.3;
        x.strokeStyle = i % 2 ? rgba(P.fold, 0.1) : rgba(P.void, 0.18); x.beginPath(); x.moveTo(fx0, 0); x.quadraticCurveTo(fx0 + wob, len * 0.5, fx0 - wob * 0.5, len); x.stroke();
      }
      if (d.back) { x.fillStyle = L ? 'rgba(236,238,242,0.3)' : 'rgba(0,0,4,0.38)'; x.fillRect(0, 0, w + pad * 2, len); } // further back: darker (paler, in a wash)
      if (L) { x.strokeStyle = rgba(P.rim, 0.45); x.lineWidth = 1.1; for (const p of parts) x.stroke(p); }
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.75)'; // a tear or two along the weave
      for (let i = 0; i < (w > 10 ? 2 : 1); i++) { x.beginPath(); x.ellipse(pad + w * (0.25 + 0.5 * R()), len * (0.2 + 0.22 * R()), Math.max(0.45, w * 0.035), len * 0.06, (R() - 0.5) * 0.25, 0, TAU); x.fill(); }
      if (!L) { // cold light spilling round its edge, behind it (clearly on the outer rags)
        x.globalCompositeOperation = 'destination-over'; x.save(); x.shadowColor = rgba(P.rim, d.lit ? 0.55 : 0.28); x.shadowBlur = 2.5 * q; x.shadowOffsetX = (d.lit || (d.x < 0.1 ? -0.6 : 0.6)) * 1.3 * q;
        x.fillStyle = rgba(P.cloth, 1); for (const p of parts) x.fill(p); x.restore();
      }
      x.globalCompositeOperation = 'destination-in';
      const f = x.createLinearGradient(0, 0, 0, len);
      f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.12, 'rgba(0,0,0,1)'); f.addColorStop(0.5, 'rgba(0,0,0,1)'); f.addColorStop(0.78, 'rgba(0,0,0,0.55)'); f.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = f; x.fillRect(0, 0, w + pad * 2, len);
    }));
  }
  /** A skeletal hand from the wrist at (hx, hy) pointing along ang: long bones, knuckles, fingers crooked by curl (drawn live). */
  function hand(ctx, P, L, hx, hy, ang, len, curl, ts, wd) {
    const ca = Math.cos(ang), sa = Math.sin(ang), nx = -sa, ny = ca, palm = len * 0.3, spr = len * 0.13, bones = [], joints = [];
    for (const o of [-0.5, 0.5]) bones.push([hx - ca * len * 0.12 + nx * spr * o, hy - sa * len * 0.12 + ny * spr * o, hx + nx * spr * o * 0.6, hy + ny * spr * o * 0.6, 0.9]); // the wrist
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * spr, kx = hx + ca * palm + nx * o * 1.15, ky = hy + sa * palm + ny * o * 1.15, fl = i === 0 || i === 3 ? 0.82 : 1;
      bones.push([hx + nx * o * 0.4, hy + ny * o * 0.4, kx, ky, 0.72]);
      joints.push([kx, ky, 1]);
      let a = ang + (i - 1.5) * 0.22, px = kx, py = ky;
      for (let j = 0; j < 3; j++) {
        a += curl * (0.55 + j * 0.5);
        const l = [0.32, 0.26, 0.2][j] * len * fl, qx = px + Math.cos(a) * l, qy = py + Math.sin(a) * l;
        bones.push([px, py, qx, qy, 0.85 - j * 0.2]);
        if (j < 2) joints.push([qx, qy, 0.75]);
        px = qx; py = qy;
      }
    }
    let a = ang + ts * 0.9, px = hx + nx * spr * 1.8 * ts + ca * palm * 0.2, py = hy + ny * spr * 1.8 * ts + sa * palm * 0.2; // the thumb
    bones.push([hx + nx * spr * 0.9 * ts, hy + ny * spr * 0.9 * ts, px, py, 0.8]);
    for (const l of [0.24, 0.18]) { a -= ts * (0.4 + curl); const qx = px + Math.cos(a) * l * len, qy = py + Math.sin(a) * l * len; bones.push([px, py, qx, qy, 0.7]); px = qx; py = qy; }
    ctx.lineCap = 'round';
    const pass = (col, add, dx, dy) => { ctx.strokeStyle = col; for (const [x0, y0, x1, y1, k] of bones) { ctx.lineWidth = wd * k + add; ctx.beginPath(); ctx.moveTo(x0 + dx, y0 + dy); ctx.lineTo(x1 + dx, y1 + dy); ctx.stroke(); } };
    pass(rgba(P.boneSh, 0.88), wd * 0.9, wd * 0.3, wd * 0.45); // its shadow (an ink outline on a light page)
    pass(rgba(P.bone, 0.95), 0, 0, 0);
    ctx.fillStyle = rgba(P.bone, 1);
    for (const [jx, jy, k] of joints) { ctx.beginPath(); ctx.arc(jx, jy, wd * 0.62 * k + 0.12, 0, TAU); ctx.fill(); } // knuckles
  }

  /* ---------- Enter ---------- */

  /** Where the wraith is and how it holds itself at frame a (its box centre, lean, scale, opacity). */
  function wraithAt(p, a) {
    const { H, ch, cw, f } = p, u = ease.smooth(clamp((a - 4) / 38)), y0 = p.hy + H * 0.85; // it rises slowly, gathers speed, settles
    let y = y0 + (p.hy - y0) * u + Math.sin(a * 0.07 + p.ph) * ch * 0.14 * f * ease.smooth(clamp((a - 34) / 14));
    const x = p.x0 + (p.hx - p.x0) * u + Math.sin(a * 0.045 + p.ph * 2) * cw * 0.3 * f;
    let sy = 1 + 0.06 * (1 - u), sx = 1 - 0.05 * (1 - u), al = ease.smooth(clamp((a - 4) / 18));
    const pull = Math.sin(Math.PI * clamp((a - 30) / 52)); // drawing in while the souls come
    sy *= 1 + 0.03 * pull; sx *= 1 + 0.02 * pull;
    const v = clamp((a - 78) / 32), ev = ease.in(v); // it sinks a little and comes apart
    y += ev * H * 0.1; al *= 1 - ease.smooth(v); sy *= 1 + 0.06 * ev; sx *= 1 - 0.05 * ev;
    return { x, y, sx, sy, al, v, rot: -0.06 * u - 0.04 * pull + Math.sin(a * 0.05 + p.ph) * 0.02, skew: 0.05 * u + 0.03 * pull };
  }
  /** A point of the wraith's box (from its centre) on the screen this frame. */
  const at = (s, lx, ly) => {
    const X = lx * s.sx + s.skew * ly * s.sy, Y = ly * s.sy, c = Math.cos(s.rot), n = Math.sin(s.rot);
    return [s.x + X * c - Y * n, s.y + X * n + Y * c];
  };
  /** Where the body was f frames ago (between frames when f is fractional). */
  const histAt = (h, f) => {
    const i = Math.min(h.length - 1, Math.floor(f)), j = Math.min(h.length - 1, i + 1), t = f - Math.floor(f);
    return [h[i][0] + (h[j][0] - h[i][0]) * t, h[i][1] + (h[j][1] - h[i][1]) * t];
  };
  /** A rag, bent as it is drawn: in slices down its length, each shifted by the wave running down it and by where the body was. */
  function drawRag(ctx, p, d, s, a) {
    const { W, H, dpr } = p, sp = d.sp, r = sp.c.width / sp.w, len = sp.h, n = Math.max(8, Math.min(18, Math.round(len / 5)));
    const [ax, ay] = at(s, d.x * W, d.y * H), h0 = p.hist[0], lean = Math.sin(s.rot) * 0.6 + 0.08, wake = ease.smooth(clamp(s.al * 1.6));
    let y0 = Math.round(ay * dpr) / dpr, x = ax;
    for (let i = 0; i < n; i++) {
      const sa = i / n, sb = (i + 1) / n, sm = (sa + sb) / 2, [, hy] = histAt(p.hist, sb * d.lag), [hx] = histAt(p.hist, sm * d.lag);
      const y1 = Math.max(y0 + 0.5, Math.round((ay + sb * len + (hy - h0[1]) * 0.7 * sb ** 0.8) * dpr) / dpr);
      x = ax + (lean + d.fan) * sm * len + d.amp * W * sm ** 1.2 * Math.sin(d.om * a - d.k * sm + d.off) * wake + (hx - h0[0]) * 0.75 * sm ** 0.8;
      ctx.drawImage(sp.c, 0, sa * len * r, sp.c.width, (sb - sa) * len * r, x - sp.w / 2, y0, sp.w, y1 - y0);
      y0 = y1;
    }
    d.tx = x; d.ty = y0; // its tip, where its smoke comes off
  }
  function drawFrost(ctx, p, a) {
    const out = 1 - ease.smooth(clamp((a - 84) / 28));
    if (out <= 0) return;
    ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter';
    const sp = ease.out(clamp((a - 2) / 26)), xl = p.ax - (p.ax - p.fx0) * sp, xr = p.ax + p.cw * 3 * sp; // rime along the foot of the line
    ctx.globalAlpha = out * p.al * clamp(a / 4) * (p.L ? 0.55 : 0.5);
    ctx.drawImage(p.rime.c, xl - p.cw, p.rowB - 3, xr - xl + p.cw * 2, 6);
    for (const k of p.ice) {
      const g = ease.out(clamp((a - k.delay) / 14));
      if (g <= 0) continue;
      ctx.globalAlpha = out * p.al * (p.L ? 0.85 : 0.72);
      ice(ctx, k.s, k.x, k.y, k.ang, g, k.tw ? p.spark : null, k.tw ? Math.sin(Math.PI * clamp((a - k.delay - k.tw) / 10)) : 0);
    }
  }
  function drawFigure(ctx, p, a, s) {
    const { W, H, L } = p, P = pal(L), al = s.al * p.al, PX = padOf(W);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, p.fw, p.clipY + ease.smooth(clamp((a - 34) / 26)) * H * 0.6); ctx.clip(); // it comes up out of the line, which then lets its rags go
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = al * (L ? 0.5 : 0.36);
    const [ax, ay] = at(s, 0.08 * W, -0.1 * H);
    ctx.drawImage(p.aura.c, ax - W * 0.62, ay - H * 0.58, W * 1.24, H * 1.16);
    ctx.globalCompositeOperation = 'source-over';
    for (const m of p.gather) { // smoke welling up out of the line where it rises
      const t = clamp((a - m.t0) / 40);
      if (t <= 0 || t >= 1) continue;
      ctx.globalAlpha = Math.sin(Math.PI * t) * p.al * (L ? 0.45 : 0.7);
      put(ctx, p.puffs[m.v], p.gx + m.dx * (0.4 + 0.6 * ease.out(t)), p.clipY - p.ch * 0.25 - ease.out(t) * p.ch * m.up, (H * 0.32 * m.s * (0.45 + 0.55 * ease.out(t))) / 64, m.rot + t * m.spin);
    }
    for (const m of p.smoke) { // smoke coming off the ends of its rags
      const d = p.rags[m.r];
      if (d.tx == null) continue;
      const t = ((a + m.o) % 42) / 42;
      ctx.globalAlpha = Math.sin(Math.PI * t) * al * (L ? 0.22 : 0.6);
      put(ctx, p.puffs[m.v], d.tx + m.dx * ease.out(t) * W * 0.25, d.ty - H * 0.05 + t * H * 0.1, (H * 0.26 * m.s * (0.35 + 0.65 * ease.out(t))) / 64, m.rot + t * m.spin);
    }
    ctx.globalAlpha = al;
    for (const d of p.rags) if (d.back) drawRag(ctx, p, d, s, a);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.transform(1, 0, s.skew, 1, 0, 0); ctx.scale(s.sx, s.sy);
    ctx.drawImage(p.back.c, -W / 2 - PX, -H / 2, W + PX * 2, H);
    ctx.restore();
    for (const d of p.rags) if (!d.back) drawRag(ctx, p, d, s, a);
    ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.transform(1, 0, s.skew, 1, 0, 0); ctx.scale(s.sx, s.sy);
    ctx.drawImage(p.front.c, -W / 2 - PX, -H / 2, W + PX * 2, H);
    ctx.globalAlpha = al * p.hands;
    const grip = ease.smooth(clamp((a - 30) / 34)) * (1 - ease.smooth(clamp((a - 82) / 20))), tw = Math.sin(a * 0.31) * 0.03; // the fingers close as it feeds
    hand(ctx, P, L, 0.35 * W, 0.065 * H, Math.PI / 2 + 0.08, H * 0.13, -0.16 - 0.14 * grip + tw, 1, p.bw);
    hand(ctx, P, L, -0.435 * W, 0.04 * H, 2.25, H * 0.15, 0.1 + 0.3 * grip - tw, -1, p.bw);
    ctx.restore();
  }
  /** The letters' light, drawn up out of them along a curve into the dark of the hood: a thin glowing ribbon, bright at its head. */
  function drawSouls(ctx, p, a, s) {
    const [tx, ty] = at(s, 0.08 * p.W, -0.31 * p.H), L = p.L;
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    for (const m of p.souls) {
      const u = (a - m.delay) / m.dur;
      if (u <= 0 || u >= 1.3) continue;
      const c1x = m.x + (tx - m.x) * 0.15, c1y = m.y - m.lift;
      const B = (k) => { k = clamp(k); const e = k * k, i = 1 - e, wob = Math.sin(k * 8 + m.ph) * m.wob * (1 - k); return [i * i * m.x + 2 * i * e * c1x + e * e * tx + wob, i * i * m.y + 2 * i * e * c1y + e * e * ty]; };
      const head = Math.min(1, u), fade = ease.smooth(clamp(u / 0.12)) * (u > 1 ? 1 - (u - 1) / 0.3 : 1) * p.al;
      let [px, py] = B(head);
      for (let j = 1; j <= 11; j++) { // the ribbon: a wide faint glow round a thin bright core, thinning toward the tail
        const k = head - j * 0.026;
        if (k < 0) break;
        const [qx, qy] = B(k), fj = 1 - j / 12;
        ctx.globalAlpha = fade * fj * (L ? 0.3 : 0.24); ctx.strokeStyle = p.glowCol; ctx.lineWidth = m.wd * 3.2 * fj + 0.4;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        ctx.globalAlpha = fade * fj * 0.85; ctx.strokeStyle = p.coreCol; ctx.lineWidth = m.wd * fj + 0.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        px = qx; py = qy;
      }
      if (u >= 1) continue;
      const [hx, hy] = B(head), [bx, by] = B(head - 0.03);
      ctx.globalAlpha = fade; put(ctx, p.soul, hx, hy, (m.wd * 7) / 96);
      if (m.sp && u < 0.4) { // at first it is still the letter, lifting off and drawn out thin
        const k = u / 0.4, along = 1 + 1.6 * k, across = 1 - 0.55 * k;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(hy - by, hx - bx) + Math.PI / 2); ctx.globalAlpha = fade * (1 - ease.smooth(k)) * 0.9;
        ctx.drawImage(m.sp.c, (-m.sp.w / 2) * across, (-m.sp.h / 2) * along, m.sp.w * across, m.sp.h * along);
        ctx.restore();
      }
    }
  }
  /** As it goes: billows of smoke grow out of its shape and drift up, a little cold light caught in some. */
  function drawDissolve(ctx, p, a, s) {
    if (a < 74) return;
    for (const m of p.diss) {
      const t = (a - m.t0) / 32;
      if (t <= 0 || t >= 1) continue;
      const [x, y] = at(s, m.lx * p.W, m.ly * p.H), e = ease.out(t), k = Math.sin(Math.PI * t) * p.al, px = x + m.dx * e * p.W * 0.3, py = y - e * p.H * 0.2, sc = (p.H * 0.5 * m.s * (0.35 + 0.65 * e)) / 64;
      if (m.lit && !p.L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.16; put(ctx, p.aura, px, py - sc * 6, sc * 0.8); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k * (p.L ? 0.45 : 0.6);
      put(ctx, p.puffs[m.v], px, py, sc, m.rot + t * m.spin);
    }
  }
  function drawWraith(ctx, p) {
    const a = p.age++ * p.spd, s = wraithAt(p, a);
    p.hist.unshift([s.x, s.y]);
    if (p.hist.length > 24) p.hist.pop();
    ctx.save();
    const dk = ease.in(clamp(a / 16)) * (a < 44 ? 1 : 1 - 0.55 * ease.smooth(clamp((a - 44) / 16))) * (1 - ease.smooth(clamp((a - 82) / 30))) * p.al * (p.L ? 0.42 : 0.7);
    if (dk > 0.004) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = dk; ctx.drawImage(p.dark.c, p.vx - p.vrx, p.vy - p.vry, p.vrx * 2, p.vry * 2); } // the light drains around the line
    drawFrost(ctx, p, a);
    if (s.al > 0.004) drawFigure(ctx, p, a, s);
    drawSouls(ctx, p, a, s);
    drawDissolve(ctx, p, a, s);
    ctx.restore();
  }

  function submit(c) {
    const { fx, P, cw, ch, sz, alpha } = c, L = c.L != null ? c.L : isLight(), A = anchor(c), f = A.fit * sz, q = scaleOf(fx), th = thin(fx), C = pal(L);
    const H = A.small ? Math.round(fx.h * 0.92) : Math.max(28, Math.round(ch * 6 * f)), W = Math.round(H * 0.8);
    const rowB = A.small ? A.y + ch * 0.4 * A.fit : A.y + ch * 0.5, rowT = A.small ? A.y - ch * 0.4 * A.fit : A.y - ch * 0.5;
    const lo = W * 0.5 + 2, hi = Math.max(lo, fx.w - W * 0.5 - 2), hx = clamp(A.x + W * 0.3, lo, hi), x0 = clamp(A.x + W * 0.12, lo, hi);
    const hy = A.small ? fx.h / 2 : Math.max(A.y + ch * 0.5 - H * 0.4, H * 0.5 + 2); // near the top of the screen it stands lower
    const fx0 = Math.max(A.x0, A.x - cw * 30);
    // the letters it draws the light out of (the last stretch of what was submitted), or plain wisps
    const cells = [], souls = [], ns = Math.max(2, Math.round((A.small ? 4 : 7) * th));
    let lx = A.x0;
    for (const g of A.text) { const w = (WIDE.test(g) ? 2 : 1) * cw; if (g.trim() && lx + w / 2 > fx0) cells.push([g, lx + w / 2, w]); lx += w; }
    for (let i = 0; i < ns; i++) {
      const cell = cells.length ? cells[Math.min(cells.length - 1, Math.round(((i + 0.5) / ns) * cells.length - 0.5))] : null;
      souls.push({ x: cell ? cell[1] : fx0 + (A.x - fx0) * ((i + 0.5) / ns), y: A.y, sp: cell && !A.small ? glyphS(cell[0], Math.round(cell[2]), Math.round(ch), termSize(ch), L, q) : null, delay: 22 + rand(0, 30), dur: rand(32, 40), lift: ch * rand(1.4, 2.6) * f, ph: rand(0, TAU), wob: cw * rand(0.3, 0.8) * f, wd: Math.max(0.7, ch * (L ? 0.1 : 0.075) * f) });
    }
    // frost along the line: crystals creeping out from the caret, along the edges of the row
    const ice0 = [], span = A.x - fx0, nI = Math.round(clamp((span / cw) * 0.6 + 6, 7, A.small ? 8 : 24) * th), sizes = [0.45, 0.6, 0.8];
    for (let i = 0; i < nI; i++) {
      const right = i % 7 === 3, u = (i / nI) ** 1.25, up = i % 2 === 0, x = right ? A.x + rand(0.3, 2.5) * cw : A.x - u * (span + cw) + rand(-0.4, 0.4) * cw;
      const dl = Math.random() < 0.25 ? rand(1, 1.4) : rand(0.15, 0.8), ang = right ? (up ? -dl : dl) : up ? Math.PI + dl : Math.PI - dl;
      const len = Math.max(5, Math.round(ch * sizes[(Math.random() * 3) | 0] * f * (1 - u * 0.3)));
      const delay = 2 + (Math.abs(x - A.x) / cw) * 0.7;
      ice0.push({ x, y: up ? rowT : rowB, ang, s: iceS((Math.random() * 6) | 0, len, L, q), delay, tw: Math.random() < 0.35 ? rand(14, 40) : 0 });
    }
    const vrx = A.small ? fx.w * 0.55 : clamp(span * 0.6 + cw * 12, cw * 16, fx.w * 0.45), vry = A.small ? fx.h * 0.75 : ch * 5;
    const puffs = Array.from({ length: NPUFF }, (_, i) => puffS(i, L)), pv = () => (Math.random() * NPUFF) | 0;
    const rags = RAGS.filter((d, i) => th >= 1 || i % 4 !== 1).map((d) => Object.assign({}, d, { sp: ragS(d, W, H, L, q) }));
    P.push(part(A.small ? 65 : 116, drawWraith, {
      x0, hx, hy, W, H, cw, ch, f, al: alpha, L, ph: rand(0, TAU), fw: fx.w, dpr: fx.dpr || 1, spd: A.small ? 1.8 : 1, hands: A.small ? 0.6 : 1, clipY: A.small ? fx.h + H : A.y + ch * 0.9,
      ax: A.x, gx: x0 + W * 0.08, fx0, rowB, vx: A.small ? fx.w / 2 : (A.x + fx0) / 2 + cw * 3, vy: A.small ? fx.h / 2 : A.y - ch * 1.2, vrx, vry, bw: Math.max(0.7, H * 0.009),
      back: backS(W, H, L, q), front: frontS(W, H, L, q), rags, hist: [], puffs,
      aura: auraG(L), dark: darkG(L), rime: rimeG(L), soul: soulG(L), spark: sparkS(L, q), glowCol: rgba(C.soulGlow, 1), coreCol: rgba(C.soul, 1),
      souls, ice: ice0,
      gather: Array.from({ length: Math.max(3, Math.round(6 * th)) }, (_, i) => ({ t0: i * 3, dx: rand(-0.5, 0.5) * W, up: rand(0.3, 1), s: rand(0.8, 1.3), v: pv(), rot: rand(0, TAU), spin: rand(-0.6, 0.6) })),
      smoke: Array.from({ length: Math.max(3, Math.round(8 * th)) }, (_, i) => ({ r: i % rags.length, o: i * 5.3, dx: rand(-0.5, 0.5), s: rand(0.8, 1.25), v: pv(), rot: rand(0, TAU), spin: rand(-0.8, 0.8) })),
      diss: Array.from({ length: Math.max(5, Math.round(14 * th)) }, (_, i) => ({ t0: 74 + rand(0, 18), lx: rand(-0.3, 0.36), ly: rand(-0.42, 0.3), dx: rand(-0.6, 0.6), s: rand(0.8, 1.3), v: pv(), rot: rand(0, TAU), spin: rand(-0.7, 0.7), lit: i % 2 === 0 })),
    }));
  }

  /* ---------- key press ---------- */

  /** Where the character just typed sits (found as fx/effects.js does): { g, gw, cx, cy, onLine }. */
  function typedAt(c) {
    const { fx, x, o, cw } = c;
    const gl = typeof typedGlyphs === 'function' && o.text != null ? typedGlyphs(o.text) : [];
    const last = o.text != null ? [...String(o.text)].pop() : null;
    let g = gl.length ? gl[gl.length - 1] : null;
    const onLine = last === ' ' || (g != null && g === last);
    if (last === ' ') g = '';
    const gw = (g && WIDE.test(g) ? 2 : 1) * cw;
    if (onLine && o.pre) return { g, gw, cx: o.pre.left + gw / 2, cy: o.pre.top + c.ch / 2, onLine };
    if (o.pre && o.pre.w) { const w = o.pre.w * cw; return { g, gw: w, cx: o.pre.left + w / 2, cy: o.pre.top + c.ch / 2, onLine: false }; } // the cell a Backspace erases
    let cx = x;
    if (onLine) {
      let comp = 0;
      if (fx.canvas.classList.contains('fx-layer')) { const v = document.querySelector('#stage .composition-view.active'); if (v && v.textContent) comp = v.getBoundingClientRect().width; }
      const tx = comp ? x - comp + cw / 2 - gw / 2 : x - cw / 2 - gw / 2;
      if (tx > gw / 2 - 1) cx = tx;
    }
    return { g, gw, cx, cy: null, onLine };
  }
  /** The warmth drawn out of the cell: it darkens for a moment. */
  function drawDim(ctx, p) {
    const a = p.age++, k = ease.smooth(Math.min(1, (a + 1) / 4)) * (1 - ease.smooth(a / p.T));
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k * p.al;
    ctx.drawImage(p.sp.c, p.x - p.rx, p.y - p.ry, p.rx * 2, p.ry * 2);
    ctx.restore();
  }
  /** Frost creeping out of a corner of the cell, then melting away. */
  function drawIce(ctx, p) {
    const a = p.age++, g = ease.out(clamp(a / 10)), al = (a < 22 ? 1 : 1 - ease.smooth((a - 22) / (p.T - 22))) * p.al;
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.globalAlpha = al;
    ice(ctx, p.s, p.x, p.y, p.ang, g, p.spark, p.spark ? Math.sin(Math.PI * clamp((a - 9) / 10)) : 0);
    ctx.restore();
  }
  /** The character's own light pulled up out of it: the letter stretches thin, a thread of light runs up out of it. */
  function drawThread(ctx, p) {
    const a = p.age++, t = a / p.T, ch = p.ch, rise = ch * (p.small ? 0.3 : 0.9) * ease.in(t);
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    if (p.sp) {
      const s = p.sp, w = s.w * (1 - 0.72 * ease.out(t)), h = s.h * (1 + (p.small ? 1 : 2.2) * ease.out(t)), foot = p.y + s.h / 2 - rise; // its foot stays in the cell a moment
      ctx.globalAlpha = (1 - ease.smooth(t)) * p.al * 0.85; ctx.drawImage(s.c, p.x - w / 2, foot - h, w, h);
    }
    const top = p.y - ch * 0.35, reach = ch * (p.small ? 0.6 : 1.2), y1 = top - reach * ease.out(t), y0 = top - reach * ease.out(clamp((t - 0.3) / 0.7)), N = 6;
    for (let j = 0; j < N; j++) { // the thread: brightest at its head, thinning behind
      const ya = y1 + ((y0 - y1) * j) / N, yb = y1 + ((y0 - y1) * (j + 1)) / N, k = 1 - j / N, wob = (yy) => Math.sin(yy * 0.4 + p.ph) * p.cw * 0.12;
      ctx.globalAlpha = p.al * k * 0.25 * (1 - t); ctx.strokeStyle = p.glowCol; ctx.lineWidth = p.wd * 3 * k + 0.4; ctx.beginPath(); ctx.moveTo(p.x + wob(ya), ya); ctx.lineTo(p.x + wob(yb), yb); ctx.stroke();
      ctx.globalAlpha = p.al * k * 0.85 * (1 - t); ctx.strokeStyle = p.coreCol; ctx.lineWidth = p.wd * k + 0.2; ctx.beginPath(); ctx.moveTo(p.x + wob(ya), ya); ctx.lineTo(p.x + wob(yb), yb); ctx.stroke();
    }
    ctx.restore();
  }
  /** The dark shred the thread becomes: it hangs from its head as that flutters up, the rest following late; then it thins to smoke. */
  function drawShred(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay), e = ease.out(t), hx = p.x + Math.sin(a * 0.16 + p.ph) * p.cw * 0.5 + p.dx * e, hy = p.y - p.rise * e;
    p.trail.unshift(hx);
    if (p.trail.length > 10) p.trail.pop();
    const al = ease.smooth(clamp(a / 6)) * (1 - ease.smooth(clamp((t - 0.4) / 0.6))) * p.al;
    if (al <= 0.004) return;
    const n = 4, lf = [], rt = [], hl = p.h * (0.55 + 0.45 * ease.out(clamp(a / 9))); // it unfurls downward
    const X = (s) => p.trail[Math.min(p.trail.length - 1, Math.round(s * 9))] + Math.sin(a * 0.35 - s * 4 + p.ph) * p.w * 0.4 * s; // lower down it follows where the head was
    for (let i = 0; i <= n; i++) { const s = (i / n) * 0.55, half = p.w * 0.5 * (1 - s * 0.45), y = hy + s * hl; lf.push([X(s) - half * p.jl[i], y]); rt.push([X(s) + half * p.jr[i], y]); }
    const fray = [[X(1) - p.w * 0.22, hy + hl], [X(0.66) - p.w * 0.04, hy + hl * 0.66], [X(0.86) + p.w * 0.1, hy + hl * 0.86], [X(0.62) + p.w * 0.2, hy + hl * 0.62], [X(0.74) + p.w * 0.34, hy + hl * 0.74]]; // torn into tongues
    ctx.save();
    if (!p.L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.34; put(ctx, p.aura, hx, hy + hl * 0.4, (hl * 2.6) / 96); } // a sickly glimmer behind, so the dark shows
    ctx.globalCompositeOperation = 'source-over';
    if (t > 0.3) { ctx.globalAlpha = Math.sin(Math.PI * clamp((t - 0.3) / 0.7)) * p.al * (p.L ? 0.35 : 0.5); put(ctx, p.puff, hx, hy + hl * 0.7, (hl * (0.9 + 1.4 * (t - 0.3))) / 64, p.ph + t); } // the smoke it thins into
    ctx.globalAlpha = al;
    const g = ctx.createLinearGradient(0, hy, 0, hy + hl);
    g.addColorStop(0, p.c0); g.addColorStop(0.5, p.c1); g.addColorStop(1, p.c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lf[0][0], lf[0][1]);
    for (const [px, py] of [...lf, ...fray]) ctx.lineTo(px, py);
    for (let i = n; i >= 0; i--) ctx.lineTo(rt[i][0], rt[i][1]);
    ctx.lineTo(X(0) + p.w * 0.1, hy + hl * 0.08); // its top torn too
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = p.edge; ctx.lineWidth = 0.6; ctx.beginPath(); // its edges catching the cold
    [...lf, fray[0]].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    [...rt, fray[4]].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.restore();
  }
  const CORNERS = [[-1, 1, Math.PI - 0.45], [1, 1, 0.45], [1, -1, -0.45], [-1, -1, Math.PI + 0.45]];

  function burst(c) {
    const { fx, P, y, sz, cw, ch, alpha } = c, L = isLight(), C = pal(L);
    if (c.enter) { submit(Object.assign({}, c, { L })); return; } // the composer's Enter, a celebration's burst
    const q = scaleOf(fx), tA = typedAt(c), small = fx.h < ch * 5, cx = tA.cx, cy = tA.cy != null ? tA.cy : y, now = performance.now(), th = thin(fx);
    const gw = tA.gw || cw, held = now - (fx.wrT || 0) < 95; // keys faster than a hand types (a held key)
    const nI = held || th < 1 ? 1 : 2 + (Math.random() < 0.35 ? 1 : 0), c0 = (Math.random() * 4) | 0;
    for (let i = 0; i < nI; i++) { // frost creeping from the cell's corners, along the row; opposite corners first
      const [ox, oy, ang] = CORNERS[(c0 + i * 2 + (i > 1 ? 1 : 0)) % 4], len = Math.max(5, Math.round(ch * (small ? 0.4 : [0.38, 0.48, 0.58][(Math.random() * 3) | 0]) * sz));
      P.push(part(40, drawIce, { x: cx + ox * gw * 0.5, y: cy + oy * ch * 0.44, ang: ang + rand(-0.3, 0.3), al: alpha * (L ? 1 : 0.72), L, s: iceS((Math.random() * 6) | 0, len, L, q), spark: i === 0 && !held ? sparkS(L, q) : null }));
    }
    const glyph = tA.onLine && tA.g ? glyphS(tA.g, Math.round(gw), Math.round(ch), termSize(ch), L, q) : null;
    P.push(part(18, drawThread, { x: cx, y: cy, ch: ch * sz, cw, small, al: alpha * (L ? 0.85 : 0.9), L, sp: glyph, ph: rand(0, TAU), wd: Math.max(0.6, ch * 0.06), glowCol: rgba(C.soulGlow, 1), coreCol: rgba(C.soul, 1) }));
    if (held || Math.random() > th) return;
    fx.wrT = now;
    P.push(part(24, drawDim, { x: cx, y: cy, rx: gw * 0.5 + cw * 0.9, ry: ch * 0.75, al: alpha * (L ? 0.38 : 0.6), sp: darkG(L) }));
    const k = small ? 0.7 : 1, w = Math.max(3, ch * 0.42 * sz * k), h = Math.max(6, ch * 1.05 * sz * k), R = Math.random;
    P.push(part(46, drawShred, {
      delay: 7, x: cx + rand(-0.2, 0.2) * cw, y: cy - ch * (small ? 0.55 : 1.4), rise: ch * (small ? 0.3 : 1) * sz, dx: rand(-0.6, 0.6) * cw, ph: rand(0, TAU), cw, w, h, al: alpha, L, trail: [],
      jl: Array.from({ length: 5 }, () => 0.8 + 0.35 * R()), jr: Array.from({ length: 5 }, () => 0.8 + 0.35 * R()),
      c0: L ? rgba(C.mid, 0.95) : rgba([54, 64, 84], 0.92), c1: rgba(C.cloth, 0.88), c2: rgba(C.cloth, 0), edge: rgba(C.rim, L ? 0.5 : 0.55), aura: auraG(false), puff: puffS((Math.random() * NPUFF) | 0, L),
    }));
  }

  window.FX_EXT = window.FX_EXT || {};
  window.FX_EXT.ghost = { burst };
  window.FX_SUBMIT.ghost = submit;
})();
