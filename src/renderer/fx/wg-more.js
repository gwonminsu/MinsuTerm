'use strict';
/*
 * 작업 중 테두리 — 지퍼 · 컨베이어 벨트 · 톱니 체인 · 도미노.
 *
 * app.js asks window.WG_MORE for a style's first content (runners) and for the function that builds it for the
 * pane's size (fit; the ResizeObserver in syncRunners calls it again after every resize). Everything is drawn once
 * per size and then moved by animations that all start together and run on the compositor (transform / opacity):
 *  - travellers (sliders and their pulls, parcels, the domino machine, falling dominoes) ride the frame on transform
 *    keyframes that turn around each corner's centre: a steady speed, corners included;
 *  - a belt is four straight strips sliding by one cleat and four corner pieces turning on their drum, each clipped
 *    to its quarter (the seams on whole device pixels, the pattern fitting the lap a whole number of times);
 *  - the chain steps with its sprockets: each corner is 16 lit frames over one link pair, the straights step alike;
 *  - the zipper's tapes and teeth and the row of dominoes are painted on a canvas once; afterwards only the short
 *    stretches that change (round the sliders, where a domino starts or ends its fall, under the machine) are painted
 *    again, a few small patches a second, following the compositor's clock (a parked preview shows its still).
 * Main-thread CSS animations were avoided on purpose: at 144 Hz even a stepped SVG one cost 10–15 % of a core.
 * A rebuild (resize) carries on from the same moment of the lap.
 */
(() => {
  const RAD = Math.PI / 180;
  const f = (v) => Math.round(v * 100) / 100;
  const f4 = (v) => Math.round(v * 1e4) / 1e4;
  const snap = (v) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };
  let SEQ = 0;

  /** Size of the drawing: 1 on a pane, smaller in a settings preview (a mini pane 20 – 26 px high). */
  const scaleOf = (layer) => (layer.closest('.pv-pane') ? Math.max(0.22, Math.min(0.42, layer.clientHeight / 72)) : 1);

  /**
   * A rounded rectangle walked clockwise, starting at the left end of its top edge. segs: straight k (heading 90k°)
   * runs between the corner centres c[k] → c[k+1]; the arc after it turns round c[k+1]. A point at heading a on a
   * corner of radius r is centre + r·(sin a, −cos a); on a straight the "centre" slides from one corner to the next.
   */
  function loop(x0, y0, x1, y1, R) {
    const w = x1 - x0 - 2 * R, h = y1 - y0 - 2 * R, q = Math.PI * R / 2;
    const c = [[x0 + R, y0 + R], [x1 - R, y0 + R], [x1 - R, y1 - R], [x0 + R, y1 - R]];
    const segs = [];
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const len = k % 2 ? h : w;
      segs.push({ arc: false, k, s, len, a: 90 * k, from: c[k], to: c[(k + 1) % 4] });
      s += len;
      segs.push({ arc: true, k, s, len: q, a: 90 * k, c: c[(k + 1) % 4] });
      s += q;
    }
    const P = s;
    const A = `A${f(R)} ${f(R)} 0 0 1 `;
    const d = `M${f(x0 + R)} ${f(y0)}H${f(x1 - R)}${A}${f(x1)} ${f(y0 + R)}V${f(y1 - R)}${A}${f(x1 - R)} ${f(y1)}H${f(x0 + R)}${A}${f(x0)} ${f(y1 - R)}V${f(y0 + R)}${A}${f(x0 + R)} ${f(y0)}Z`;
    /** The point at arc length sv, `off` px outward of the line, and the heading there (degrees). */
    function at(sv, off = 0) {
      sv = ((sv % P) + P) % P;
      let g = segs[segs.length - 1];
      for (const x of segs) if (sv < x.s + x.len) { g = x; break; }
      const u = sv - g.s;
      let cx, cy, a;
      if (g.arc) { [cx, cy] = g.c; a = g.a + (R ? u / R / RAD : 0); } else {
        const t = g.len ? u / g.len : 0;
        cx = g.from[0] + (g.to[0] - g.from[0]) * t; cy = g.from[1] + (g.to[1] - g.from[1]) * t; a = g.a;
      }
      return { x: cx + (R + off) * Math.sin(a * RAD), y: cy - (R + off) * Math.cos(a * RAD), a };
    }
    return { x0, y0, x1, y1, R, P, c, segs, d, at };
  }
  /** The same loop moved `o` px outward (a parallel rounded rectangle: same corner centres). */
  const grow = (L, o) => loop(L.x0 - o, L.y0 - o, L.x1 + o, L.y1 + o, L.R + o);

  const circ = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;

  /*
   * Keyframes that carry an element round the loop at a steady speed, `off` px outward of the line. Its own (0, 0)
   * rides the line, its x axis along the way, its y axis inward. Only transforms: it runs on the compositor.
   */
  function orbitKeys(name, L, off = 0) {
    const r = -(L.R + off);
    // the last, imperceptible tilt (0.4°: 0.07 px across a parcel) matters: a layer moved with its axes kept square is
    // re-rasterised every frame to stay on whole pixels (eighteen parcels: 27 % of a core, against 7 % tilted)
    const kf = (c, a) => `{transform:translate(${f(c[0])}px,${f(c[1])}px) rotate(${f4(a)}deg) translate(0,${f(r)}px) rotate(.4deg)}`;
    let out = `@keyframes ${name}{`;
    for (const g of L.segs) out += `${f4(g.s / L.P * 100)}%${kf(g.arc ? g.c : g.from, g.a)}`;
    return `${out}100%${kf(L.c[0], 360)}}`;
  }

  /** Swap the layer's drawing for a new one and go on from the same moment of the lap as before. */
  function rebuild(layer, html, lapMs) {
    const old = +layer.dataset.wmLap || 0;
    let frac = null;
    if (old) {
      const an = layer.getAnimations({ subtree: true }).find((a) => a.currentTime != null);
      if (an) frac = (an.currentTime % old) / old;
    }
    layer.innerHTML = html;
    layer.dataset.wmLap = lapMs;
    if (frac) for (const an of layer.getAnimations({ subtree: true })) an.currentTime = frac * lapMs;
  }

  /** Box along straight k of loop L: local x along the way (from x0), local y inward, y = 0 on the line moved `off` out. */
  function edgeBox(L, k, off, E, x0, len) {
    const g = L.segs[2 * k], a = g.a;
    const no = [Math.sin(a * RAD), -Math.cos(a * RAD)], dir = [Math.cos(a * RAD), Math.sin(a * RAD)];
    const sx = g.from[0] + (L.R + off) * no[0] + x0 * dir[0], sy = g.from[1] + (L.R + off) * no[1] + x0 * dir[1];
    return `left:${f(sx + E * no[0])}px;top:${f(sy + E * no[1])}px;width:${f(len)}px;height:${f(2 * E)}px;transform:rotate(${a}deg)`;
  }
  const along = (p, a) => p[0] * Math.cos(a * RAD) + p[1] * Math.sin(a * RAD);

  /*
   * A band (chain, belt) running round loop L at v px/s, E px each side of the line. Straight strips slide by one
   * period `lam`; the corner pieces turn on their wheel (2πR / v per turn) and show only their quarter.
   *   strip(u0, u1): SVG of the band for arc lengths u0..u1 laid out straight (x = arc length, y inward)
   *   ring(j, hd): SVG of the band wrapped round corner j; hd(u) is the heading of arc length u there (t = 0)
   */
  function band(L, E, lam, v, strip, ring, slideName) {
    const cs = L.c.map(([x, y]) => [snap(x), snap(y)]); // seams on whole device pixels
    let html = '';
    for (let k = 0; k < 4; k++) {
      const a = 90 * k, g = L.segs[2 * k];
      const x0 = along(cs[k], a) - along(L.c[k], a);
      const len = along(cs[(k + 1) % 4], a) - along(cs[k], a);
      if (len <= 0) continue;
      const u0 = g.s + x0 - lam;
      html += `<div class="wm-clip" style="${edgeBox(L, k, 0, E, x0, len)}"><svg style="left:${f(-lam)}px;top:0;animation:${slideName} ${f4(lam / v)}s linear infinite" width="${f(len + 2 * lam)}" height="${f(2 * E)}" viewBox="${f4(u0)} ${f(-E)} ${f(len + 2 * lam)} ${f(2 * E)}">${strip(u0, u0 + len + 2 * lam)}</svg></div>`;
    }
    const turn = f4(2 * Math.PI * L.R / v);
    for (let j = 0; j < 4; j++) {
      const arc = L.segs[2 * ((j + 3) % 4) + 1];
      const hd = (u) => arc.a + (u - arc.s) / L.R / RAD;
      const [cx, cy] = L.c[j], [sx, sy] = cs[j];
      const right = j === 1 || j === 2, low = j === 2 || j === 3;
      const Q = L.R + E + 1;
      const left = right ? sx : sx - Q, top = low ? sy : sy - Q;
      html += `<div class="wm-clip" style="left:${f(left)}px;top:${f(top)}px;width:${f(Q)}px;height:${f(Q)}px"><svg class="wm-spin" style="left:${f(cx - Q - left)}px;top:${f(cy - Q - top)}px;animation-duration:${turn}s" width="${f(2 * Q)}" height="${f(2 * Q)}" viewBox="${f(-Q)} ${f(-Q)} ${f(2 * Q)} ${f(2 * Q)}">${ring(j, hd)}</svg></div>`;
    }
    return html;
  }
  /** A wheel turning with the band at corner j (drawn at t = 0, centre 0, 0). */
  function wheelAt(L, j, Q, v, svg) {
    const [cx, cy] = L.c[j];
    return `<svg class="wm wm-spin" style="left:${f(cx - Q)}px;top:${f(cy - Q)}px;animation-duration:${f4(2 * Math.PI * L.R / v)}s" width="${f(2 * Q)}" height="${f(2 * Q)}" viewBox="${f(-Q)} ${f(-Q)} ${f(2 * Q)} ${f(2 * Q)}">${svg}</svg>`;
  }
  /** The heading of arc length u on the wheel of corner j. */
  const headingOn = (L, j) => { const arc = L.segs[2 * ((j + 3) % 4) + 1]; return (u) => arc.a + (u - arc.s) / L.R / RAD; };
  /** Something drawn in a wheel's frame at heading a, radius r (local x along the way, y inward). */
  const wheelTr = (a, r) => `rotate(${f4(a)}) translate(0 ${f(-r)})`;
  const onWheel = (a, r, inner) => `<g transform="${wheelTr(a, r)}">${inner}</g>`;
  /** A mover: an element riding orbit keyframes; its drawing centred on its (0, 0) within ±Q. */
  const mover = (anim, Q, svg, cls = '') => `<div class="wm-mv${cls}" style="animation:${anim}"><svg style="left:${f(-Q)}px;top:${f(-Q)}px" width="${f(2 * Q)}" height="${f(2 * Q)}" viewBox="${f(-Q)} ${f(-Q)} ${f(2 * Q)} ${f(2 * Q)}">${svg}</svg></div>`;
  /** Delay that puts a lap-long animation at arc length s0 at t = 0. */
  const startAt = (s0, P, T) => -f4(((((s0 / P) % 1) + 1) % 1) * T);

  /* ---------------------------------------------------------------- shared ---------------------------------- */
  const LIGHT = [-0.6, -0.8]; // the light comes from the top left
  /** How far a drawing may reach past the layer: a pane has the stage's margin around it, a tile clips at its edge. */
  const outOf = (layer) => (layer.closest('.pv-pane') ? 3 : layer.closest('.tiled') ? 0 : 5);
  /** A figure-8 link plate between pin centres A and B (half height r at the ends, hw at the waist), moved by (ox, oy). */
  function plateAt(A, B, r, hw, ox = 0, oy = 0) {
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const P = (u, v) => `${f(A[0] + ox + u * ux - v * uy)} ${f(A[1] + oy + u * uy + v * ux)}`;
    const hc = 2 * hw - r, m = len / 2, R = f(r);
    return `M${P(0, -r)}A${R} ${R} 0 0 0 ${P(0, r)}Q${P(m, hc)} ${P(len, r)}A${R} ${R} 0 0 0 ${P(len, -r)}Q${P(m, -hc)} ${P(0, -r)}Z`;
  }
  const polyD = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

  /* ---------------------------------------------------------------- 지퍼 ------------------------------------ */
  /*
   * A zipper lying round the pane: two woven navy tapes, each with a row of brass teeth, the rows half a pitch apart.
   * It is a two-way zip (like a suitcase): two sliders ride it half a lap apart. The leading one, wide end first,
   * draws the rows together — they meet in a long gentle V in front of it and come out behind it interlocked into
   * one narrow chain; the trailing one, narrow end first, spreads them apart again in the same V the other way. Away
   * from the sliders the zipper stands slightly open: the tapes (and their teeth, tilted with the fabric) sit apart
   * and the pane shows through the slit between them.
   *
   * The tapes and teeth are painted on a canvas once, and afterwards only the two short stretches round the sliders
   * are painted again (some 25 times a second, while the sliders move). The sliders and their pull tabs ride on
   * compositor animations; the painting follows their clock, so a parked preview shows the matching still.
   */
  /*
   * A row's step aside at distance d out of a slider's throat: inside the slider (under its top plate) the rows are
   * guided apart to the width of its mouth; out of the mouth they spread in a short, nearly straight V (the angle
   * of the slider's shoulders) and settle on the open width. Further away they simply stay apart.
   */
  function zipRow(z, d) {
    if (d <= 0) return 0;
    if (d < z.dm) { const q = d / z.dm; return z.sm * q * Math.sqrt(q); }
    const x = (d - z.dm) / z.LV;
    if (x >= 1) return z.smax;
    const g = x <= 0.6 ? 1.25 * x : 0.75 + 1.25 * (x - 0.6) - 1.5625 * (x - 0.6) * (x - 0.6);
    return z.sm + (z.smax - z.sm) * g;
  }
  /** How far each row stands off the middle at arc length s, the closing slider's throat being at sC. */
  function zipShift(z, s, sC) {
    const P = z.L.P;
    const ahead = (((s - sC) % P) + P) % P;
    if (ahead === 0 || P - ahead <= z.Lc) return 0; // between the sliders: closed
    const behind = (((sC - z.Lc - s) % P) + P) % P;
    return Math.min(zipRow(z, ahead), zipRow(z, behind));
  }
  /** Paint the zipper for the closing slider at sC: all of it, or only the stretch of arc lengths a..b. */
  function zipPaint(z, sC, a, b) {
    const { ctx, L, k, p } = z;
    const full = a == null;
    if (full) { a = 0; b = L.P; }
    ctx.save();
    ctx.setTransform(z.dpr, 0, 0, z.dpr, z.out * z.dpr, z.out * z.dpr);
    const at = (s, o) => L.at(s, o);
    const trace = (pts, move = true) => pts.forEach((q, i) => (i || !move ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    if (full) ctx.clearRect(-z.out, -z.out, z.W + 2 * z.out, z.H + 2 * z.out);
    else {
      const M = z.half + 4 * k, st = 3 * k, pts = [];
      for (let s = a; s < b; s += st) pts.push(at(s, M));
      pts.push(at(b, M));
      for (let s = b; s > a; s -= st) pts.push(at(s, -M));
      pts.push(at(a, -M));
      ctx.beginPath(); trace(pts); ctx.closePath(); ctx.clip();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      ctx.clearRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    }
    const lo = full ? 0 : a - 2 * p, hi = full ? L.P : b + 2 * p;
    const sh = (s) => zipShift(z, s, sC);
    const line = (color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w * k; ctx.stroke(); };
    // ---- tapes: woven navy fabric, a darker selvedge, a row of stitches; they follow their row out and in
    for (const g of [1, -1]) {
      const outer = [], inner = [], mid1 = [], mid2 = [], selv = [];
      for (let s = lo; ; s += 1.5 * k) {
        const ss = Math.min(s, hi), e = z.ac + sh(ss);
        outer.push(at(ss, g * (e + z.tape))); inner.push(at(ss, g * e));
        mid1.push(at(ss, g * (e + z.tape * 0.36))); mid2.push(at(ss, g * (e + z.tape * 0.62))); selv.push(at(ss, g * (e + z.tape - 0.3 * k)));
        if (ss >= hi) break;
      }
      ctx.beginPath(); trace(outer); trace(inner.slice().reverse(), false); ctx.closePath();
      // a soft shadow round the tape (onto the pane and into the slit): two wide faint strokes under the fill
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 3.2 * k; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.24)'; ctx.lineWidth = 1.6 * k; ctx.stroke();
      ctx.fillStyle = '#26365d'; ctx.fill();
      // weft: fine threads across the tape, alternately lit and shaded (fixed to the cloth, not to the stretch painted)
      const ws = 1.25 * k, lit = new Path2D(), dark = new Path2D();
      for (let j = Math.ceil(lo / ws); j * ws <= hi; j++) {
        const s = j * ws, e = z.ac + sh(s), A = at(s, g * (e + 0.35 * k)), B = at(s, g * (e + z.tape - 0.35 * k));
        const P2 = j % 2 ? lit : dark;
        P2.moveTo(A.x, A.y); P2.lineTo(B.x, B.y);
      }
      ctx.lineWidth = 0.6 * k;
      ctx.strokeStyle = 'rgba(0,0,0,.26)'; ctx.stroke(dark);
      ctx.strokeStyle = 'rgba(170,190,240,.13)'; ctx.stroke(lit);
      ctx.beginPath(); trace(mid1); line('rgba(150,172,230,.2)', 0.5);
      ctx.beginPath(); trace(mid2); line('rgba(0,0,0,.18)', 0.5);
      ctx.beginPath(); trace(selv); line('rgba(8,12,26,.6)', 0.6);
      // stitches near the outer edge
      const st = new Path2D(), sp = 2.4 * k;
      for (let j = Math.ceil(lo / sp); j * sp <= hi; j++) {
        const s = j * sp;
        for (let q = 0; q <= 2; q++) { const u = s + q * 0.7 * k, e = z.ac + sh(u), P = at(u, g * (e + z.tape * 0.8)); if (q) st.lineTo(P.x, P.y); else st.moveTo(P.x, P.y); }
      }
      ctx.strokeStyle = 'rgba(205,214,236,.85)'; ctx.lineWidth = 0.55 * k; ctx.stroke(st);
    }
    // ---- teeth: brass, tilted with their tape; the lit side faces the top-left light
    const parts = { o: new Path2D(), b: new Path2D(), d: new Path2D(), l: new Path2D(), h: new Path2D(), c: new Path2D() };
    const w = 0.46 * p, hw = w / 2, tl = z.tl;
    const quad = (P2, x, y, ca, sa, u0, u1, v0, v1) => {
      const X = (u, v) => x + u * ca - v * sa, Y = (u, v) => y + u * sa + v * ca;
      P2.moveTo(X(u0, v0), Y(u0, v0)); P2.lineTo(X(u1, v0), Y(u1, v0)); P2.lineTo(X(u1, v1), Y(u1, v1)); P2.lineTo(X(u0, v1), Y(u0, v1)); P2.closePath();
    };
    for (let m = Math.floor(lo / p) - 1; m * p <= hi + p; m++) {
      for (const [g, fr] of [[1, 0.25], [-1, 0.75]]) {
        const s = (m + fr) * p;
        if (s < lo - p || s > hi + p) continue;
        const sig = sh(s), slope = (sh(s + 0.8 * k) - sh(s - 0.8 * k)) / (1.6 * k);
        const e = z.ac + sig, c = e + z.tr - tl / 2;
        const P = at(s, g * c);
        const ang = (P.a * RAD) - g * Math.atan(slope), ca = Math.cos(ang), sa = Math.sin(ang);
        const vh = g * tl / 2, vr = -vh; // head (toward the middle) and root (on the tape)
        const v0 = Math.min(vh, vr), v1 = Math.max(vh, vr);
        quad(parts.o, P.x, P.y, ca, sa, -hw - 0.3 * k, hw + 0.3 * k, v0 - 0.3 * k, v1 + 0.3 * k);
        quad(parts.b, P.x, P.y, ca, sa, -hw, hw, v0, v1);
        const litSide = ca * LIGHT[0] + sa * LIGHT[1] > 0 ? 1 : -1;
        quad(parts.l, P.x, P.y, ca, sa, litSide > 0 ? hw - 0.38 * w : -hw + 0.1 * w, litSide > 0 ? hw - 0.1 * w : -hw + 0.38 * w, v0 + 0.5 * k, v1 - 0.5 * k);
        quad(parts.d, P.x, P.y, ca, sa, litSide > 0 ? -hw : hw - 0.17 * w, litSide > 0 ? -hw + 0.17 * w : hw, v0, v1);
        quad(parts.h, P.x, P.y, ca, sa, -0.2 * w, 0.2 * w, Math.min(vh - g * 0.3 * k, vh - g * 1.3 * k), Math.max(vh - g * 0.3 * k, vh - g * 1.3 * k));
        quad(parts.c, P.x, P.y, ca, sa, -hw, hw, Math.min(vr + g * 0.85 * k, vr + g * 1.3 * k), Math.max(vr + g * 0.85 * k, vr + g * 1.3 * k));
      }
    }
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1.4 * k; ctx.stroke(parts.o); // their shadow at the slit's edge
    ctx.fillStyle = '#3a2908'; ctx.fill(parts.o);
    ctx.fillStyle = '#c69836'; ctx.fill(parts.b);
    ctx.fillStyle = '#8c6619'; ctx.fill(parts.d);
    ctx.fillStyle = '#f0d07b'; ctx.fill(parts.l);
    ctx.fillStyle = 'rgba(255,240,190,.85)'; ctx.fill(parts.h);
    ctx.fillStyle = 'rgba(95,68,14,.9)'; ctx.fill(parts.c);
    ctx.restore();
  }
  /*
   * Top view of a slider heading +x, as made: a Y-shaped channel under a top plate. The throat (x = 0, where the
   * teeth are locked together) is the narrow end; the mouth (x = 14) is the wide end with its two rounded
   * shoulders, the two separate rows going in on either side of the central wedge (the diamond). On the top plate a
   * bridge (lug) holds the pull. lead: mouth in front (it closes); otherwise the throat is in front (it opens).
   */
  const ZIP_BODY = 'M-1.6 -3.1Q-1.6 -4.7 0 -4.75L9.3 -7.05Q12.5 -7.4 13.6 -5.4L14.1 -4.5L14.1 4.5L13.6 5.4Q12.5 7.4 9.3 7.05L0 4.75Q-1.6 4.7 -1.6 3.1Z';
  function zipBody(lead) {
    const flip = lead ? '' : ' transform="scale(-1 1)"';
    return `<g${flip}>`
      + `<path d="${ZIP_BODY}" fill="rgba(0,0,0,.38)" transform="translate(.8 1.2)"/>`
      + `<path d="${ZIP_BODY}" fill="url(#wmZs)" stroke="#262c35" stroke-width=".6"/>`
      // the top plate's bevel: lit rim along the near edge, shade along the far one, the flanges along the sides
      + '<path d="M-.9 -3.4Q-.9 -4.1 .2 -4.15L9.2 -6.35Q11.9 -6.6 12.8 -5" fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".5" stroke-linecap="round"/>'
      + '<path d="M-.9 3.4Q-.9 4.1 .2 4.15L9.2 6.35Q11.9 6.6 12.8 5" fill="none" stroke="rgba(30,34,42,.55)" stroke-width=".5" stroke-linecap="round"/>'
      // the mouth: two channel openings either side of the wedge, the rows' teeth vanish into them
      + '<path d="M14.1 -4.5L12.5 -4.25L12.25 -1.15L14.1 -.9ZM14.1 4.5L12.5 4.25L12.25 1.15L14.1 .9Z" fill="#14171c"/>'
      + '<path d="M14.9 0L13.9 -1.15L11.7 0L13.9 1.15Z" fill="url(#wmZb)" stroke="#3a414c" stroke-width=".4"/>'
      // the throat: the locked chain comes out under its lip
      + '<path d="M-1.6 -2.6V2.6" stroke="#14171c" stroke-width=".7"/>'
      // the bridge (lug) for the pull, with the slot the pull's ring goes through
      + '<path d="M1.3 -1.7H8Q9.7 -1.7 9.7 0Q9.7 1.7 8 1.7H1.3Q.1 1.7 .1 0Q.1 -1.7 1.3 -1.7Z" fill="url(#wmZb)" stroke="#4d5562" stroke-width=".45"/>'
      + '<path d="M1.2 -.95H7.4" stroke="rgba(255,255,255,.95)" stroke-width=".45" stroke-linecap="round"/>'
      + '<path d="M6.1 -.85H7.9Q8.5 -.85 8.5 0Q8.5 .85 7.9 .85H6.1Q5.5 .85 5.5 0Q5.5 -.85 6.1 -.85Z" fill="#191d23"/></g>';
  }
  /*
   * The pull, hung from the bridge at (0, 0): a flat plate with a hole and a grip. A slider is pulled by it, so it
   * points forward (+x), the way the slider goes; it lags and swings a little as the slider turns a corner.
   */
  function zipTab() {
    const tab = 'M1.6 -2.1L17.6 -2.75Q21.2 -2.85 21.2 0Q21.2 2.85 17.6 2.75L1.6 2.1Q-.4 2 -.4 0Q-.4 -2 1.6 -2.1Z';
    return `<path d="${tab}" fill="rgba(0,0,0,.36)" transform="translate(.9 1.4)"/>`
      + `<path d="${tab}" fill="url(#wmZs)" stroke="#262c35" stroke-width=".6"/>`
      + '<path d="M2.9 -1.35L17.3 -1.9Q19.8 -1.95 19.8 0Q19.8 1.95 17.3 1.9L2.9 1.35" fill="none" stroke="rgba(70,78,92,.85)" stroke-width=".45"/>'
      + '<path d="M18.6 -.9H15.7Q14.8 -.9 14.8 0Q14.8 .9 15.7 .9H18.6Q19.5 .9 19.5 0Q19.5 -.9 18.6 -.9Z" fill="#171b21"/>'
      + '<path d="M6 -1.1V1.1M7.4 -1.15V1.15M8.8 -1.2V1.2M10.2 -1.25V1.25" stroke="rgba(60,67,80,.55)" stroke-width=".42"/>'
      + '<path d="M3 -.95L13.6 -1.3" stroke="rgba(255,255,255,.9)" stroke-width=".5" stroke-linecap="round"/>'
      + '<ellipse rx="1.5" ry="1.15" fill="none" stroke="#2f353f" stroke-width="1"/><ellipse rx="1.5" ry="1.15" fill="none" stroke="#dfe4ea" stroke-width=".4"/>';
  }
  /*
   * The pull lags as its slider turns a corner, overshoots a little and settles: a damped pendulum driven by the
   * slider's heading, run over two laps, kept as the pull's turn relative to the slider (keyframes).
   */
  function tabSwing(name, L, v, T) {
    const head = (t) => {
      const lap = Math.floor(t / T), s = (t - lap * T) * v;
      let g = L.segs[L.segs.length - 1];
      for (const x of L.segs) if (s < x.s + x.len) { g = x; break; }
      return lap * 360 + (g.arc ? g.a + ((s - g.s) / (g.len || 1)) * 90 : g.a);
    };
    const w0 = 2 * Math.PI * 1.7, zeta = 0.3, dt = 0.004;
    let th = head(0), om = 0;
    const out = [];
    for (let t = 0; t < 2 * T; t += dt) {
      const h = head(t);
      om += (w0 * w0 * (h - th) - 2 * zeta * w0 * om) * dt;
      th += om * dt;
      if (t >= T) out.push([t - T, th - h]);
    }
    let kf = `@keyframes ${name}{0%{transform:rotate(${f(out[0][1])}deg)}`, last = out[0][1], lastT = 0;
    for (const [t, r] of out) if (Math.abs(r - last) > 0.4 || (t - lastT > 0.25 && Math.abs(r - last) > 0.05)) { kf += `${f4((t / T) * 100)}%{transform:rotate(${f(r)}deg)}`; last = r; lastT = t; }
    return `${kf}100%{transform:rotate(${f(out[0][1])}deg)}}`;
  }
  function fitZipper(layer) {
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!W || !H) return;
    const k = scaleOf(layer) * 1.15, out = outOf(layer), id = `wz${++SEQ}`;
    const z = { k, out, W, H, dpr: window.devicePixelRatio || 1 };
    z.tape = 3.1 * k; z.ac = 1.9 * k; z.tl = 4.3 * k; z.tr = 1.2 * k; // tape width; closed: tape edge off the middle; tooth length, root on the tape
    z.smax = k * Math.max(2.4, Math.min(3.8, Math.min(W, H) / 210)); // each row's step aside when open (more on a big pane)
    z.half = z.ac + z.tape + z.smax;
    const ci = z.half + 1 * k - out; // the middle line, inset from the layer's edge
    const L = loop(ci, ci, W - ci, H - ci, Math.max(12 * k, z.half + 4 * k));
    z.L = L;
    z.N = Math.max(16, Math.round(L.P / (5.4 * k)));
    z.p = L.P / z.N;
    z.v = 30 * k;
    const T = L.P / z.v;
    z.dm = 14 * k; z.sm = 1.15 * k; // the slider's mouth: how far from its throat, how far the rows are apart there
    z.LV = 17 * k; // the V out of the mouth (the shoulders' angle), then the rows stay apart
    z.Lc = Math.round((L.P * 0.4) / z.p) * z.p; // closed between the sliders
    z.sC0 = 0.6 * L.segs[0].len - 1.2 * z.v; // the closing slider's throat at t = 0 (on the top edge in a resting preview)
    const Q = 27 * k, ride = (s0) => `${id}m ${f4(T)}s linear ${startAt(s0, L.P, T)}s infinite`;
    const box = `width="${f(2 * Q)}" height="${f(2 * Q)}" viewBox="${f(-Q / k)} ${f(-Q / k)} ${f(2 * Q / k)} ${f(2 * Q / k)}"`;
    const slider = (lead, s0) => `<div class="wm-mv${lead ? ' wz-c' : ''}" style="animation:${ride(s0)}">`
      + `<svg style="left:${f(-Q)}px;top:${f(-Q)}px" ${box}>${zipBody(lead)}</svg>`
      + `<div class="wm-tab" style="left:${f((lead ? 7 : -7) * k)}px;top:0;animation:${id}t ${f4(T)}s linear ${startAt(s0, L.P, T)}s infinite">`
      + `<svg class="wm-wob" style="left:${f(-Q)}px;top:${f(-Q)}px;transform-origin:${f(Q)}px ${f(Q)}px" ${box}>${zipTab()}</svg></div></div>`;
    const c = `<canvas class="wm wz-cv" width="${Math.round((W + 2 * out) * z.dpr)}" height="${Math.round((H + 2 * out) * z.dpr)}" style="left:${-out}px;top:${-out}px;width:${W + 2 * out}px;height:${H + 2 * out}px"></canvas>`;
    const html = `<style>${orbitKeys(`${id}m`, L)}${tabSwing(`${id}t`, L, z.v, T)}</style>${c}${slider(false, z.sC0 - z.Lc)}${slider(true, z.sC0)}`;
    rebuild(layer, html, T * 1000);
    z.ctx = layer.querySelector('.wz-cv').getContext('2d');
    z.drive = layer.querySelector('.wz-c').getAnimations()[0];
    layer.wmZ = z;
    zipRun(layer, z);
  }
  /** Repaint the stretches round the sliders while they move (and everything after a jump: a resize, a parked preview). */
  function zipRun(layer, z) {
    clearTimeout(layer.wmTimer);
    const tick = () => {
      if (!layer.isConnected || layer.wmZ !== z || !z.ctx.canvas.isConnected) return; // rebuilt, another style, or gone with its pane / preview
      layer.wmTimer = setTimeout(tick, 40);
      const t = z.drive && z.drive.currentTime;
      if (t == null || t === z.lastT) return; // held (a resting preview): nothing moved
      if (layer.checkVisibility && !layer.checkVisibility({ visibilityProperty: true })) return; // a tab in the back
      const sC = z.sC0 + (z.v * t) / 1000;
      if (z.lastT == null || t < z.lastT || t - z.lastT > 400) zipPaint(z, sC);
      else {
        const was = z.sC0 + (z.v * z.lastT) / 1000, m = 2 * z.p, reach = z.dm + z.LV;
        if (sC - was < 0.4 * z.p) return; // hardly moved: wait for the next tick
        zipPaint(z, sC, was - m, sC + reach + m); // the closing slider and its V
        zipPaint(z, sC, was - z.Lc - reach - m, sC - z.Lc + m); // the opening slider and its V
      }
      z.lastT = t;
    };
    tick();
  }

  /* ---------------------------------------------------------------- 톱니 체인 -------------------------------- */
  /*
   * A roller chain round the pane on four brass sprockets, one in each corner. The chain is drawn with depth: the
   * far side plates, the rollers between, the near inner and outer plates and the pin heads; the sprockets have a
   * real roller-chain tooth form (a round seat for each roller, curved flanks), a bevelled rim, five spokes and a
   * bolted hub, lit from the top left. The pitch is chosen so the lap holds a whole number of link pairs; the
   * sprockets have ten teeth, the chain's rollers sit in their seats and both move together.
   *
   * Light that stays put while a wheel turns: each corner (sprocket + the chain on it) is drawn as 16 frames over
   * one link pair (two teeth) and the frames take turns (opacity steps); the straight chain steps by the same amount
   * (a translate in 16 steps per link pair). Nothing is repainted while it runs.
   */
  function sprocket(Z, R, p, k, rot) {
    const rs = 0.3 * p, Rt = R + 0.29 * p, dps = 360 / Z, tau = (0.13 * p) / Rt / RAD;
    const pol = (a, r) => [r * Math.sin(a * RAD), -r * Math.cos(a * RAD)];
    const pts = [];
    for (let i = 0; i < Z; i++) {
      const ps = rot + i * dps, C = pol(ps, R), u = [Math.sin(ps * RAD), -Math.cos(ps * RAD)], t = [Math.cos(ps * RAD), Math.sin(ps * RAD)];
      for (let j = 0; j <= 6; j++) { const b = (-68 + (136 * j) / 6) * RAD; pts.push([C[0] + rs * (-u[0] * Math.cos(b) + t[0] * Math.sin(b)), C[1] + rs * (-u[1] * Math.cos(b) + t[1] * Math.sin(b))]); }
      const E = pts[pts.length - 1], pc = ps + dps / 2, T1 = pol(pc - tau, Rt), T2 = pol(pc + tau, Rt);
      const C1 = pol(ps + dps * 0.31, R + 0.17 * p), C2 = pol(ps + dps * 0.69, R + 0.17 * p);
      const nxt = pol(ps + dps, R), un = [Math.sin((ps + dps) * RAD), -Math.cos((ps + dps) * RAD)], tn = [Math.cos((ps + dps) * RAD), Math.sin((ps + dps) * RAD)];
      const S2 = [nxt[0] + rs * (-un[0] * Math.cos(-68 * RAD) + tn[0] * Math.sin(-68 * RAD)), nxt[1] + rs * (-un[1] * Math.cos(-68 * RAD) + tn[1] * Math.sin(-68 * RAD))];
      for (let j = 1; j <= 4; j++) { const q = j / 4, a1 = (1 - q) * (1 - q), a2 = 2 * q * (1 - q), a3 = q * q; pts.push([a1 * E[0] + a2 * C1[0] + a3 * T1[0], a1 * E[1] + a2 * C1[1] + a3 * T1[1]]); }
      pts.push(pol(pc, Rt + 0.02 * p));
      pts.push(T2);
      for (let j = 1; j <= 3; j++) { const q = j / 4, a1 = (1 - q) * (1 - q), a2 = 2 * q * (1 - q), a3 = q * q; pts.push([a1 * T2[0] + a2 * C2[0] + a3 * S2[0], a1 * T2[1] + a2 * C2[1] + a3 * S2[1]]); }
    }
    const outline = polyD(pts);
    // five spoke openings (one per two teeth), a hub with five bolts
    const Rr = R - rs, hub = 0.25 * R, r1 = hub + 0.8 * k, r2 = Rr - 0.34 * p, holes = [];
    for (let i = 0; i < Z / 2; i++) {
      const c = rot + i * (720 / Z) + 360 / Z, half = 360 / Z - (1.15 * k) / ((r1 + r2) / 2) / RAD, hp = [];
      for (let j = 0; j <= 6; j++) hp.push(pol(c - half + (2 * half * j) / 6, r2));
      for (let j = 6; j >= 0; j--) hp.push(pol(c - half * 0.7 + (1.4 * half * j) / 6, r1));
      holes.push(polyD(hp));
    }
    const bolts = Array.from({ length: Z / 2 }, (_, i) => pol(rot + i * (720 / Z), R * 0.24)).map(([x, y]) => circ(x, y, 0.62 * k)).join('');
    const mv = (d, x, y) => `<path d="${d}" transform="translate(${f(x)} ${f(y)})"`;
    return `${mv(outline, 0.9 * k, 1.3 * k)} fill="rgba(0,0,0,.3)"/>`
      + `${mv(outline, -0.7 * k, -0.95 * k)} fill="#6b4c16"/>`
      + `<path d="${outline}${holes.join('')}" fill-rule="evenodd" fill="url(#wmGf)"/>`
      // the web between the toothed rim and the hub sits a little lower (darker), its edge a recessed bevel
      + `<path d="${circ(0, 0, r2 + 0.9 * k)}${holes.join('')}" fill-rule="evenodd" fill="rgba(80,52,8,.3)"/>`
      + `<path d="${outline}" fill="none" stroke="url(#wmGe)" stroke-width="${f(1 * k)}"/><path d="${outline}" fill="none" stroke="#4a3310" stroke-width="${f(0.4 * k)}"/>`
      + `<circle r="${f(r2 + 0.9 * k)}" fill="none" stroke="url(#wmGr)" stroke-width="${f(0.75 * k)}"/>`
      + `<path d="${holes.join('')}" fill="none" stroke="url(#wmGr)" stroke-width="${f(0.85 * k)}"/><path d="${holes.join('')}" fill="none" stroke="#3d2a0a" stroke-width="${f(0.3 * k)}"/>`
      + `<circle r="${f(hub)}" fill="url(#wmGh)" stroke="url(#wmGe)" stroke-width="${f(0.6 * k)}"/>`
      + `<path d="${bolts}" fill="url(#wmGb)" stroke="#5a4010" stroke-width="${f(0.25 * k)}"/>`
      + `<circle r="${f(1 * k)}" fill="#2a1d08"/><circle r="${f(0.42 * k)}" cx="${f(-0.25 * k)}" cy="${f(-0.3 * k)}" fill="rgba(255,240,200,.5)"/>`;
  }
  /**
   * A stretch of roller chain through the joints J (consecutive pins q0, q0+1, …): far plates, rollers, near plates,
   * pin heads, a little grease sheen. litOut: the light falls on the plates' outer edge (strips); null: per plate.
   */
  function chainSvg(J, q0, p, k, D, S, lit, Lv = LIGHT) {
    const ro = 0.47 * p, hwo = 0.34 * p, ri = 0.43 * p, hwi = 0.31 * p;
    let shadow = '', far = '', rollers = '', pins = '', sheen = '', inner = '', outer = '';
    for (let i = 0; i + 1 < J.length; i++) {
      const A = J[i], B = J[i + 1], odd = (((q0 + i) % 2) + 2) % 2;
      const r = odd ? ro : ri, hw = odd ? hwo : hwi;
      shadow += plateAt(A, B, r, hw, S[0], S[1]);
      far += plateAt(A, B, r, hw, D[0], D[1]);
      const pl = plateAt(A, B, r, hw);
      if (lit == null) { if (odd) outer += `<path d="${pl}" fill="url(#wmCoD)"/>`; else inner += `<path d="${pl}" fill="url(#wmCiD)"/>`; } else if (odd) outer += pl; else inner += pl;
      if (odd) { // the sheen on the lit edge of an outer plate
        const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        const sgn = nx * Lv[0] + ny * Lv[1] > 0 ? 1 : -1, o = sgn * hwo * 0.72;
        sheen += `M${f(A[0] + dx * 0.28 + nx * o)} ${f(A[1] + dy * 0.28 + ny * o)}L${f(A[0] + dx * 0.72 + nx * o)} ${f(A[1] + dy * 0.72 + ny * o)}`;
      }
    }
    for (const A of J) { rollers += circ(A[0] + D[0] / 2, A[1] + D[1] / 2, 0.29 * p); pins += circ(A[0], A[1], 0.15 * p); }
    const sw = f(0.42 * k), lo = lit ? 'T' : 'B';
    return `<path d="${shadow}" fill="rgba(0,0,0,.3)"/><path d="${far}" fill="#2b3037" stroke="#121417" stroke-width="${sw}"/>`
      + `<path d="${rollers}" fill="url(#wmCro)" stroke="#121417" stroke-width="${f(0.3 * k)}"/>`
      + (lit == null ? `<g stroke="#1b1e23" stroke-width="${sw}">${inner}${outer}</g>`
        : `<path d="${inner}" fill="url(#wmCi${lo})" stroke="#1b1e23" stroke-width="${sw}"/><path d="${outer}" fill="url(#wmCo${lo})" stroke="#1b1e23" stroke-width="${sw}"/>`)
      + `<path d="${sheen}" stroke="rgba(255,255,255,.55)" stroke-width="${f(0.38 * k)}" stroke-linecap="round" fill="none"/>`
      + `<path d="${pins}" fill="url(#wmCp)" stroke="#2c3138" stroke-width="${f(0.28 * k)}"/>`;
  }
  function fitGears(layer) {
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!W || !H) return;
    const k = scaleOf(layer), out = outOf(layer), id = `wg${++SEQ}`;
    const Z = 10, F = 16;
    const ci = 6.2 * k - out; // the chain's line, inset from the layer edge
    const span = 2 * (W - 2 * ci) + 2 * (H - 2 * ci);
    const c1 = Z * (1 - 4 / Math.PI);
    const p0 = 9.4 * k;
    const nn = Math.max(4, Math.round((span + p0 * c1) / (2 * p0)));
    const p = span / (2 * nn - c1), lam = 2 * p;
    const R = (Z * p) / (2 * Math.PI);
    const L = loop(ci, ci, W - ci, H - ci, R);
    const v = 30 * k, Tp = lam / v, T = L.P / v;
    const Ds = [-0.9 * k, -1.25 * k], Ss = [1 * k, 1.4 * k]; // depth (far side) and shadow, on screen
    const loc = (vec, a) => [vec[0] * Math.cos(a * RAD) + vec[1] * Math.sin(a * RAD), -vec[0] * Math.sin(a * RAD) + vec[1] * Math.cos(a * RAD)];
    const E = 0.47 * p + 2.6 * k;
    const cs = L.c.map(([x, y]) => [snap(x), snap(y)]);
    // corners: sprocket + the chain on it, 16 frames over a link pair, side by side in one strip (drawn once) that
    // steps along behind a window by whole pixels — switching separate frames by opacity re-rasterised each of
    // them every time it came up (a quarter of a core); sliding one finished strip costs nothing
    const Q = R + 0.47 * p + 4.5 * k, dpr = window.devicePixelRatio || 1, cell = Math.ceil(2 * Q * dpr) / dpr;
    let html = `<style>@keyframes ${id}s{to{transform:translateX(${f4(lam)}px)}}@keyframes ${id}f{to{transform:translateX(${f4(-F * cell)}px)}}</style>`;
    for (let j = 0; j < 4; j++) {
      const [cx, cy] = L.c[j], [sx, sy] = cs[j];
      const arc = L.segs[2 * ((j + 3) % 4) + 1];
      const right = j === 1 || j === 2, low = j === 2 || j === 3;
      // the quarter this corner shows (its seams on whole device pixels), in the frame's own coordinates
      const qx = right ? sx - cx : -Q, qy = low ? sy - cy : -Q, qw = right ? Q - (sx - cx) : Q + (sx - cx), qh = low ? Q - (sy - cy) : Q + (sy - cy);
      const seat0 = arc.a + (Math.ceil(arc.s / p) * p - arc.s) / R / RAD; // a roller seat at t = 0
      let frames = '';
      for (let fr = 0; fr < F; fr++) {
        const shift = (fr * lam) / F;
        const q0 = Math.floor((arc.s - 2 * p - shift) / p), J = [];
        for (let q = q0; q * p + shift <= arc.s + arc.len + 2 * p; q++) { const P = L.at(q * p + shift); J.push([P.x - cx, P.y - cy]); }
        frames += `<g transform="translate(${f4(fr * cell + cell / 2)} ${f4(cell / 2)})">`
          + `<clipPath id="${id}q${j}_${fr}"><rect x="${f(qx)}" y="${f(qy)}" width="${f(qw)}" height="${f(qh)}"/></clipPath>`
          + sprocket(Z, R, p, k, seat0 + (shift / R) / RAD)
          + `<g clip-path="url(#${id}q${j}_${fr})">${chainSvg(J, q0, p, k, Ds, Ss, null)}</g></g>`;
      }
      html += `<div class="wm-win" style="left:${f4(cx - cell / 2)}px;top:${f4(cy - cell / 2)}px;width:${f4(cell)}px;height:${f4(cell)}px">`
        + `<svg style="animation:${id}f ${f4(Tp)}s steps(${F}, end) infinite" width="${f4(F * cell)}" height="${f4(cell)}">${frames}</svg></div>`;
    }
    // the straight runs: stepped with the corners (16 steps per link pair)
    for (let e = 0; e < 4; e++) {
      const a = 90 * e, g = L.segs[2 * e];
      const x0 = along(cs[e], a) - along(L.c[e], a), len = along(cs[(e + 1) % 4], a) - along(cs[e], a);
      if (len <= 0) continue;
      const u0 = g.s + x0 - lam, u1 = u0 + len + 2 * lam, J = [];
      const q0 = Math.floor(u0 / p) - 1;
      for (let q = q0; q * p <= u1 + p; q++) J.push([q * p, 0]);
      const litOut = loc(LIGHT, a)[1] < 0; // the light falls on the outer edge (top and left runs)
      html += `<div class="wm-clip" style="${edgeBox(L, e, 0, E, x0, len)}"><svg style="left:${f(-lam)}px;top:0;animation:${id}s ${f4(Tp)}s steps(${F}, end) infinite" width="${f(len + 2 * lam)}" height="${f(2 * E)}" viewBox="${f4(u0)} ${f(-E)} ${f(len + 2 * lam)} ${f(2 * E)}">`
        + `${chainSvg(J, q0, p, k, loc(Ds, a), loc(Ss, a), litOut, loc(LIGHT, a))}</svg></div>`;
    }
    rebuild(layer, html, T * 1000);
  }

  /* ---------------------------------------------------------------- 컨베이어 벨트 ---------------------------- */
  /*
   * A cleated rubber belt running round the pane (seen from the side, carrying face out): it wraps four drums in
   * the corners and rides on idler rollers along each side; parcels ride on it. The belt, drums and rollers all
   * move at the belt's speed; the rollers' turning is drawn as frames (one shown at a time) so it stays cheap.
   */
  const PARCELS = [
    // [width, height, svg drawn on (0, 0) = bottom centre, up = −y]
    [11, 8, '<rect x="-5.5" y="-8" width="11" height="8" rx=".5" fill="#c48d53" stroke="#6b4521" stroke-width=".55"/><path d="M-5.2 -6.5H5.2" stroke="#9c6b38" stroke-width=".45"/><rect x="-1" y="-8" width="2" height="8" fill="#e2bd86" stroke="#b58b55" stroke-width=".3"/><rect x="1.9" y="-4.8" width="2.8" height="2" fill="#f4efe4" stroke="#a89c86" stroke-width=".25"/><path d="M2.3 -4.2h1.9M2.3 -3.5h1.4" stroke="#8a8170" stroke-width=".3"/>'],
    [8, 9.4, '<rect x="-4" y="-9.4" width="8" height="9.4" rx=".5" fill="#b9814a" stroke="#644019" stroke-width=".55"/><rect x="-4" y="-5.4" width="8" height="1.6" fill="#ddb37b" stroke="#ad8450" stroke-width=".3"/><path d="M-2.6 -6.6v-1.9M-3.3 -7.8l.7 -.8.7 .8M-.6 -6.6v-1.9M-1.3 -7.8l.7 -.8.7 .8" stroke="#3b2812" stroke-width=".45" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'],
    [11.6, 8.6, '<rect x="-5.8" y="-8.6" width="11.6" height="8.6" fill="#b47c44" stroke="#5e3c18" stroke-width=".55"/><path d="M-5.8 -2.9H5.8M-5.8 -5.7H5.8" stroke="#7d5428" stroke-width=".5"/><rect x="-5.1" y="-7.9" width="10.2" height="7.2" fill="none" stroke="#8c5f2f" stroke-width=".8"/><path d="M-4.7 -1.1L4.7 -7.5" stroke="#8c5f2f" stroke-width=".9"/><path d="M-5.1 -7.9h.01M5.1 -7.9h.01M-5.1 -.7h.01M5.1 -.7h.01" stroke="#2e1f0e" stroke-width=".7" stroke-linecap="round"/>'],
    [7.6, 5.8, '<rect x="-3.8" y="-5.8" width="7.6" height="5.8" rx=".5" fill="#ebe8e1" stroke="#7f7c76" stroke-width=".5"/><rect x="-.65" y="-5.8" width="1.3" height="5.8" fill="#4c7bd9"/><rect x="-3.8" y="-3.55" width="7.6" height="1.1" fill="#4c7bd9"/><rect x="1.2" y="-5.2" width="2" height="1.2" fill="#fff" stroke="#9a978f" stroke-width=".2"/>'],
    [8.4, 7.2, '<rect x="-4.2" y="-7.2" width="8.4" height="7.2" rx=".5" fill="#d8475a" stroke="#7d1b2a" stroke-width=".55"/><rect x="-.7" y="-7.2" width="1.4" height="7.2" fill="#f5cf62"/><rect x="-4.2" y="-4.4" width="8.4" height="1.2" fill="#f5cf62"/><path d="M0 -7.2C-1.6 -9.4 -3.6 -8.4 -2.2 -7.2ZM0 -7.2C1.6 -9.4 3.6 -8.4 2.2 -7.2Z" fill="#f5cf62" stroke="#b58a1d" stroke-width=".35"/>'],
    [13, 9.2, '<rect x="-6.5" y="-9.2" width="13" height="9.2" rx=".5" fill="#c99a5f" stroke="#6b4723" stroke-width=".55"/><path d="M-6.2 -7.6H6.2" stroke="#a37540" stroke-width=".45"/><rect x="-6.5" y="-9.2" width="13" height="1.3" fill="#dfbd8b"/><path d="M-4.4 -5.6h2.6l-.3 1.5q-.25 .9 -1 .9 -.75 0 -1 -.9Zm1.3 2.4v1.5m-.9 0h1.8" stroke="#c0392b" stroke-width=".45" fill="none"/><path d="M.6 -5.2h4.6M.6 -4h3.4M.6 -2.8h4" stroke="#c0392b" stroke-width=".55"/>'],
  ];
  function roller(rot, k, r) {
    const q = r / 2.9;
    return `<circle r="${f(r)}" fill="url(#wmCr)" stroke="#2a2f36" stroke-width="${f(0.5 * k)}"/><circle r="${f(2 * q * k)}" fill="#5d6673" stroke="#3a414b" stroke-width="${f(0.3 * k)}"/>`
      + `<g transform="rotate(${f(rot)})" stroke="#d3dae3" stroke-width="${f(0.6 * k)}" stroke-linecap="round"><path d="M${f(-1.75 * q * k)} 0H${f(1.75 * q * k)}M0 ${f(-1.75 * q * k)}V${f(1.75 * q * k)}"/></g>`
      + `<circle r="${f(0.7 * q * k)}" fill="#262b31" stroke="#9aa3ae" stroke-width="${f(0.25 * k)}"/>`;
  }
  function drum(rd, k, rot) {
    const spokes = [0, 1, 2, 3, 4].map((i) => `<path transform="rotate(${f(rot + i * 72)})" d="M${f(-0.75 * k)} ${f(-rd * 0.3)}L${f(-0.55 * k)} ${f(-rd + 1.4 * k)}H${f(0.55 * k)}L${f(0.75 * k)} ${f(-rd * 0.3)}Z"/>`).join('');
    return `<circle r="${f(rd)}" fill="url(#wmCd)" stroke="#262b32" stroke-width="${f(0.55 * k)}"/><circle r="${f(rd - 1.25 * k)}" fill="#2f353d"/>`
      + `<g fill="#a7b0bc" stroke="#434a54" stroke-width="${f(0.3 * k)}">${spokes}</g>`
      + `<circle r="${f(rd * 0.33)}" fill="url(#wmCh)" stroke="#3a4048" stroke-width="${f(0.45 * k)}"/><circle r="${f(0.8 * k)}" fill="#1f2328"/>`;
  }
  function fitConveyor(layer) {
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!W || !H) return;
    const k = scaleOf(layer), out = outOf(layer), id = `wc${++SEQ}`;
    const pk = k * 1.3; // parcels a little bigger than drawn
    const tb = 3.2 * k, m = 8;
    const b = 10.6 * pk + 0.9 * k + tb / 2 + 0.5 * k - out; // belt line: the tallest parcel fits outside it
    const span = 2 * (W - 2 * b) + 2 * (H - 2 * b);
    const c1 = m * (1 - 4 / Math.PI);
    const lam0 = 7.6 * k;
    const n = Math.max(4, Math.round((span + lam0 * c1) / lam0));
    const lam = span / (n - c1);
    const R = m * lam / (2 * Math.PI);
    const L = loop(b, b, W - b, H - b, R);
    const v = 28 * k, T = L.P / v;
    const E = tb / 2 + 1.4 * k;
    // a green PVC belt: lit carrying face, darker underside, raised cleats, the joints' marks on its edge
    const cleat = (x) => `M${f(x - 1.1 * k)} ${f(-tb / 2 + 0.1 * k)}L${f(x - 0.65 * k)} ${f(-tb / 2 - 0.9 * k)}H${f(x + 0.65 * k)}L${f(x + 1.1 * k)} ${f(-tb / 2 + 0.1 * k)}Z`;
    const cleatTop = (x) => `M${f(x - 0.6 * k)} ${f(-tb / 2 - 0.75 * k)}H${f(x + 0.6 * k)}`;
    const lug = (x) => `M${f(x)} ${f(-tb / 2 + 0.8 * k)}V${f(tb / 2 - 0.6 * k)}`;
    const paint = (body, cl, ct, lg, face, under) => `${body}<path d="${under}" stroke="#163024" stroke-width="${f(0.8 * k)}" fill="none"/>`
      + `<path d="${lg}" stroke="#4e8a6b" stroke-width="${f(0.45 * k)}" fill="none"/><path d="${face}" stroke="#86c3a2" stroke-width="${f(0.6 * k)}" fill="none"/>`
      + `<path d="${cl}" fill="#2a5a43" stroke="#12281e" stroke-width="${f(0.35 * k)}"/><path d="${ct}" stroke="#9ad2b3" stroke-width="${f(0.4 * k)}"/>`;
    const strip = (u0, u1) => {
      let cl = '', ct = '', lg = '';
      for (let q = Math.floor(u0 / lam) - 1; q * lam < u1 + lam; q++) { cl += cleat(q * lam); ct += cleatTop(q * lam); lg += lug(q * lam + lam / 2); }
      return paint(`<rect x="${f(u0 - 1)}" y="${f(-tb / 2)}" width="${f(u1 - u0 + 2)}" height="${f(tb)}" fill="#2f6449"/>`, cl, ct, lg,
        `M${f(u0 - 1)} ${f(-tb / 2 + 0.35 * k)}H${f(u1 + 1)}`, `M${f(u0 - 1)} ${f(tb / 2 - 0.45 * k)}H${f(u1 + 1)}`);
    };
    const ringOf = (j, hd) => {
      const arc = L.segs[2 * ((j + 3) % 4) + 1];
      const q0 = Math.floor((arc.s - Math.PI * R) / lam);
      let cl = '', ct = '', lg = '';
      for (let q = q0; q < q0 + m; q++) { const a = hd(q * lam); cl += onWheel(a, R, `<path d="${cleat(0)}"/>`); ct += onWheel(a, R, `<path d="${cleatTop(0)}"/>`); lg += onWheel(hd(q * lam + lam / 2), R, `<path d="${lug(0)}"/>`); }
      return `<circle r="${f(R)}" fill="none" stroke="#2f6449" stroke-width="${f(tb)}"/><circle r="${f(R - tb / 2 + 0.45 * k)}" fill="none" stroke="#163024" stroke-width="${f(0.8 * k)}"/>`
        + `<g stroke="#4e8a6b" stroke-width="${f(0.45 * k)}" fill="none">${lg}</g><circle r="${f(R + tb / 2 - 0.35 * k)}" fill="none" stroke="#86c3a2" stroke-width="${f(0.6 * k)}"/>`
        + `<g fill="#2a5a43" stroke="#12281e" stroke-width="${f(0.35 * k)}">${cl}</g><g stroke="#9ad2b3" stroke-width="${f(0.4 * k)}">${ct}</g>`;
    };
    // drums in the corners, the steel frame under the belt, idler rollers along the sides
    const rd = R - tb / 2 - 0.15 * k, ri = 2.5 * k, li = tb / 2 + ri + 0.15 * k; // idler line: li inside the belt line
    let drums = '';
    for (let j = 0; j < 4; j++) drums += wheelAt(L, j, rd + 0.6 * k, v, drum(rd, k, headingOn(L, j)(0)));
    const rail = grow(L, -li);
    const fixed = `<svg class="wm" width="${W}" height="${H}" style="overflow:visible"><path d="${grow(L, -li - 0.5 * k).d}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="${f(4.6 * k)}"/>`
      + `<path d="${rail.d}" fill="none" stroke="#454d58" stroke-width="${f(3.9 * k)}"/><path d="${grow(L, -li + 1.7 * k).d}" fill="none" stroke="#7c8593" stroke-width="${f(0.55 * k)}"/>`
      + `<path d="${grow(L, -li - 1.7 * k).d}" fill="none" stroke="#262b31" stroke-width="${f(0.55 * k)}"/></svg>`;
    // the rollers' turning: six drawn frames over a quarter turn, stacked in one strip that steps behind a window by
    // whole pixels (drawn once; no re-rasterising as the frames change)
    const F = 6, cycle = ((Math.PI / 2) * ri) / v;
    const dpr = window.devicePixelRatio || 1, Eh = ri + 0.6 * k, row = Math.ceil(2 * Eh * dpr) / dpr;
    let idlers = '';
    const clear = Math.sqrt(Math.max(0, (rd + ri + 0.4 * k) ** 2 - (R - li) ** 2)) + 0.4 * k;
    for (let q = 0; q < 4; q++) {
      const g = L.segs[2 * q], len = g.len - 2 * clear;
      if (len < 0) continue;
      const cnt = Math.max(1, Math.round(len / (22 * k)) + 1), gap = cnt > 1 ? len / (cnt - 1) : 0;
      const xs = Array.from({ length: cnt }, (_, i) => clear + (cnt > 1 ? i * gap : len / 2));
      let rows = '';
      for (let fr = 0; fr < F; fr++) rows += `<g transform="translate(0 ${f4(fr * row + row / 2)})">${xs.map((x) => `<g transform="translate(${f(x)} 0)">${roller((fr * 90) / F, k, ri)}</g>`).join('')}</g>`;
      idlers += `<div class="wm-win" style="${edgeBox(L, q, -li, row / 2, 0, g.len)}"><svg style="animation:${id}r ${f4(cycle)}s steps(${F}, end) infinite" width="${f(g.len)}" height="${f4(F * row)}">${rows}</svg></div>`;
    }
    // parcels on the belt, spaced along the lap
    const on = tb / 2 + 0.9 * k; // they rest on the cleats
    const nb = Math.max(2, Math.min(12, Math.round(L.P / (330 * k))));
    let parcels = '';
    for (let i = 0; i < nb; i++) {
      const [pw, ph, svg] = PARCELS[(i * 5 + 2) % PARCELS.length];
      const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const s0 = (i + 0.35 + 0.3 * jitter) * (L.P / nb);
      const Q = (Math.max(pw / 2, ph) + 3) * pk;
      parcels += mover(`${id}b ${f4(T)}s linear ${startAt(s0, L.P, T)}s infinite`, Q,
        `<g transform="scale(${pk})"><path d="M${-pw / 2 + 0.6} 0.2H${pw / 2 + 0.9}L${pw / 2 + 0.9} ${-ph + 1.2}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.1"/>${svg}</g>`);
    }
    const html = `<style>@keyframes ${id}s{to{transform:translateX(${f4(lam)}px)}}@keyframes ${id}r{to{transform:translateY(${f4(-F * row)}px)}}${orbitKeys(`${id}b`, L, on)}</style>`
      + `${fixed}${idlers}${drums}${band(L, E, lam, v, strip, ringOf, `${id}s`)}${parcels}`;
    rebuild(layer, html, T * 1000);
  }

  /* ---------------------------------------------------------------- 도미노 ---------------------------------- */
  /*
   * A row of dominoes stands on a ledge round the pane (seen from the side, standing outward). The wave goes
   * round for ever: each domino tips, hits the next and comes to lean on it, the row ends up shingled. Behind the
   * wave a little machine drives along the ledge: its sweeper takes the fallen dominoes in at the front, the chute
   * at the back sets them down upright again, one by one — nothing ever un-falls.
   *
   * The fall is the real chain: a domino tips freely until it touches the next (θc = asin((s − d) / h)), then
   * leans on it, its angle following the next one's (θ = φ + asin((s·cos φ − d) / h)) until all rest at
   * θ* = acos(d / s).
   */
  function cart(k) {
    return `<g transform="scale(${k})">`
      // chute (sets the dominoes down) — tall enough to hide one standing domino
      + '<path d="M-15.4 -12.4Q-15.4 -12.9 -14.9 -12.9H-10.3V-0.3H-15.4Z" fill="url(#wmDc)" stroke="#2d333c" stroke-width=".5"/>'
      + '<path d="M-14.6 -12.1V-1.2" stroke="rgba(255,255,255,.45)" stroke-width=".5"/><rect x="-14.2" y="-9.6" width="2.6" height="5.4" rx=".5" fill="#1f242b"/>'
      // body: yellow, hazard stripes, a window on the dominoes inside, beacon
      + '<path d="M-10.6 -10.2Q-10.6 -10.9 -9.9 -10.9H3.8Q5 -10.9 5.4 -9.8L6.6 -6.4V-0.3H-10.6Z" fill="#f2bf2f" stroke="#5a4708" stroke-width=".55"/>'
      + '<path d="M-10.3 -10.3H4" stroke="rgba(255,255,255,.55)" stroke-width=".5"/>'
      + '<g clip-path="url(#wmDhz)"><rect x="-10.6" y="-3.9" width="17.2" height="2.2" fill="#1f1f22"/>'
      + '<path d="M-10 -1.7l2 -2.2h1.3l-2 2.2zM-6.4 -1.7l2 -2.2h1.3l-2 2.2zM-2.8 -1.7l2 -2.2h1.3l-2 2.2zM.8 -1.7l2 -2.2h1.3l-2 2.2zM4.4 -1.7l2 -2.2h1.3l-2 2.2z" fill="#f2bf2f"/></g>'
      + '<rect x="-8.6" y="-9.1" width="7.4" height="4.1" rx=".6" fill="#20262e" stroke="#5a4708" stroke-width=".45"/>'
      + '<path d="M-7.6 -5.2l1 -3.4M-6.1 -5.2l1 -3.4M-4.6 -5.2l1 -3.4M-3.1 -5.2l1 -3.4" stroke-width="1" stroke-linecap="round"/>'
      + '<path d="M-7.6 -5.2l1 -3.4" stroke="#ff6b6b" stroke-width="1"/><path d="M-6.1 -5.2l1 -3.4" stroke="#ffd43b" stroke-width="1"/><path d="M-4.6 -5.2l1 -3.4" stroke="#51cf66" stroke-width="1"/><path d="M-3.1 -5.2l1 -3.4" stroke="#4dabf7" stroke-width="1"/>'
      + '<path d="M-8 -8.7h6.2" stroke="rgba(255,255,255,.25)" stroke-width=".4"/>'
      + '<rect x="-.3" y="-12.6" width="2.2" height="1.8" rx=".4" fill="#4a4f57"/>'
      // sweeper hood over the front
      + '<path d="M5.4 -9.4L14.6 -7.8Q16 -7.5 16.3 -6.2L17.6 -0.3H5.4Z" fill="#e0ab1f" stroke="#5a4708" stroke-width=".55"/>'
      + '<path d="M6 -8.8L14.4 -7.3" stroke="rgba(255,255,255,.45)" stroke-width=".45"/><path d="M7.2 -6.1H12.6" stroke="#8a6c10" stroke-width=".5"/>'
      + '</g>';
  }
  const brush = (k) => `<g transform="scale(${k})"><circle r="2.35" fill="#3b2f1e"/><path d="M0 -2.8V2.8M-2.8 0H2.8M-2 -2L2 2M-2 2L2 -2" stroke="#c6a05a" stroke-width=".55" stroke-linecap="round"/><circle r=".8" fill="#5c5f66"/></g>`;
  const wheel = (k) => `<g transform="scale(${k})"><circle r="2.5" fill="#22262c"/><circle r="1.45" fill="#9aa3b0" stroke="#3a4048" stroke-width=".35"/><path d="M0 -1.4V1.4M-1.4 0H1.4" stroke="#3a4048" stroke-width=".45"/><circle r=".45" fill="#e9edf2"/></g>`;
  /* the eight colours of the row, repeating (each of the eight falling tiles is always the same colour) */
  const DOM_HUES = [2, 28, 46, 104, 166, 198, 232, 292];
  const domFill = (hue) => [`hsl(${hue} 72% 74%)`, `hsl(${hue} 66% 56%)`, `hsl(${hue} 60% 37%)`];
  /*
   * The row is painted on a canvas (standing, fallen, or picked up); only the eight dominoes that are falling at any
   * moment are elements, each taking every eighth domino in turn (its slot and its fall are keyframes, so the
   * fall runs smoothly on the compositor). The canvas repaints just the dominoes whose state changed, a few small
   * patches a second; the falling element holds still a moment before and after, so the hand-over never shows.
   */
  function domPaint(D, t, list) {
    const { ctx, L, k, s, d, h } = D;
    ctx.save();
    ctx.setTransform(D.dpr, 0, 0, D.dpr, D.out * D.dpr, D.out * D.dpr);
    const draw = (j0, j1) => { // dominoes j0..j1 and the ledge under them
      const a0 = j0 * s, a1 = (j1 + 1) * s;
      // ledge
      for (const [o, w, c] of [[-0.95, 1.9, '#8a6644'], [-0.25, 0.5, '#c39a6d'], [-1.8, 0.4, '#5b4129']]) {
        ctx.beginPath();
        for (let x = a0; ; x += 2 * k) { const P = L.at(Math.min(x, a1), o * k); if (x === a0) ctx.moveTo(P.x, P.y); else ctx.lineTo(P.x, P.y); if (x >= a1) break; }
        ctx.strokeStyle = c; ctx.lineWidth = w * k; ctx.stroke();
      }
      for (let j = j0; j <= j1; j++) {
        const jj = ((j % D.N) + D.N) % D.N, st = D.stateOf(jj, t);
        if (st !== 'S' && st !== 'F') continue;
        const P = L.at((jj + 0.5) * s + d / 2), [lit, mid, dark] = D.fills[jj % 8];
        ctx.save();
        ctx.translate(P.x, P.y); ctx.rotate(P.a * RAD + (st === 'F' ? D.thS : 0));
        const r = 0.8 * k;
        ctx.beginPath(); ctx.moveTo(-d, -h + r); ctx.quadraticCurveTo(-d, -h, -d + r, -h); ctx.lineTo(-r, -h); ctx.quadraticCurveTo(0, -h, 0, -h + r); ctx.lineTo(0, 0); ctx.lineTo(-d, 0); ctx.closePath();
        ctx.fillStyle = mid; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = lit; ctx.fillRect(-d, -h, d * 0.26, h);
        ctx.fillStyle = dark; ctx.fillRect(-d * 0.32, -h, d * 0.32, h);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-d, -h, d, 0.7 * k);
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,.42)'; ctx.lineWidth = 0.5 * k; ctx.stroke();
        ctx.restore();
      }
    };
    if (!list) { ctx.clearRect(-D.out, -D.out, D.W + 2 * D.out, D.H + 2 * D.out); draw(0, D.N - 1); } else {
      for (const [j0, j1] of list) {
        const a0 = (j0 - 0.6) * s, a1 = (j1 + 2.6) * s, M1 = h + 3 * k, M2 = -3 * k, pts = [];
        for (let x = a0; x < a1; x += 2 * k) pts.push(L.at(x, M1));
        pts.push(L.at(a1, M1));
        for (let x = a1; x > a0; x -= 2 * k) pts.push(L.at(x, M2));
        pts.push(L.at(a0, M2));
        ctx.save();
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.clip();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        ctx.clearRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
        draw(j0 - 3, j1 + 3);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function fitDomino(layer) {
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!W || !H) return;
    const k = scaleOf(layer), out = outOf(layer), id = `wd${++SEQ}`, K = 8;
    const d = 2.7 * k, h = 11.6 * k;          // thickness along the row, height
    const ib = 13.8 * k - out, R = 12 * k;    // the ledge line, inset from the layer edge
    const L = loop(ib, ib, W - ib, H - ib, R);
    const N = Math.max(2, Math.round(L.P / (8.6 * k * K))) * K; // a whole number of eights
    const s = L.P / N, dt = 0.11;             // spacing; seconds between one domino and the next
    const v = s / dt, T = N * dt;
    const thC = Math.asin(Math.min(1, (s - d) / h)), thS = Math.acos(Math.min(1, d / s));
    const lean = (phi) => phi + Math.asin(Math.max(-1, Math.min(1, (s * Math.cos(phi) - d) / h)));
    // the fall, every quarter of dt; it eases onto the shingled rest angle before the element hands over
    const H0 = 0.08, FALL = K * dt - H0 - 0.12, th = [];
    for (let i = 0; i * dt / 4 <= FALL + 1e-9; i++) {
      const x = i / 4, u = (i * dt) / 4;
      let a = x <= 1 ? thC * (0.25 * x + 0.75 * x * x) : lean(th[i - 4]);
      const e0 = FALL - 1.4 * dt;
      if (u > e0) { const q = Math.min(1, (u - e0) / (1.4 * dt)), sm = q * q * (3 - 2 * q); a += (thS - a) * sm; }
      th.push(a);
    }
    // the machine: where a fallen domino's foot is when its sweeper takes it, and where its chute sets one down
    const xv = 1 * k, xg = -11 * k, cartLen = 34 * k;
    const fallen = Math.max(10 * s, Math.min(0.3 * L.P, L.P - cartLen - 12 * s)); // wave front → sweeper
    const uPick = fallen / v, uPlace = uPick + (xv - xg) / v;
    const W0 = 0.62 * L.segs[0].len - 1.2 * v; // the wave front at t = 0 (on the top edge in a resting preview)
    const tOf = (j) => ((((j + 0.5) * s - W0) / v) % T + T) % T; // when the wave reaches domino j (in the lap)
    const D = { k, out, W, H, L, N, s, d, h, thS, dpr: window.devicePixelRatio || 1, fills: DOM_HUES.map(domFill) };
    // what the canvas shows of domino j at time tt: Standing, A (the falling element has it), Fallen, E (picked up)
    const aEnd = K * dt - H0 - 0.05;
    D.stateOf = (j, tt) => {
      let u = (((tt - tOf(j)) % T) + T) % T;
      if (u >= T - 0.055) u -= T; // the element takes over a moment before the wave arrives
      if (u < aEnd) return 'A';
      if (u < uPick) return 'F';
      if (u < uPlace) return 'E';
      return 'S';
    };
    // the eight falling dominoes: each one's slot (steps along the row) and its fall (every K·dt)
    const pc = (u, per) => f4((u / per) * 100);
    let css = `@keyframes ${id}r{0%{transform:rotate(0deg)}${pc(H0, K * dt)}%{transform:rotate(0deg)}`;
    th.forEach((a, i) => { if (i) css += `${pc(H0 + (i * dt) / 4, K * dt)}%{transform:rotate(${f(a / RAD)}deg)}`; });
    css += `100%{transform:rotate(${f(thS / RAD)}deg)}}`;
    let actors = '';
    for (let a = 0; a < K; a++) {
      const M = N / K;
      let kf = `@keyframes ${id}a${a}{`;
      for (let m = 0; m <= M; m++) {
        const P = L.at((((a + m * K) % N) + 0.5) * s + d / 2);
        kf += `${pc(m, M)}%{transform:translate(${f(P.x)}px,${f(P.y)}px) rotate(${f(P.a)}deg)}`;
      }
      css += `${kf}}`;
      const t0 = tOf(a) - H0, del = ((t0 % T) + T) % T - T, delR = ((t0 % (K * dt)) + K * dt) % (K * dt) - K * dt;
      const [lit, mid, dark] = D.fills[a];
      actors += `<div class="wd-a" style="animation:${id}a${a} ${f4(T)}s step-end ${f4(del)}s infinite"><i class="wd-b" style="left:${f(-d)}px;top:${f(-h)}px;width:${f(d)}px;height:${f(h)}px;`
        + `background:linear-gradient(90deg,${lit} 0 26%,${mid} 26% 68%,${dark} 68%);animation:${id}r ${f4(K * dt)}s linear ${f4(delR)}s infinite"></i></div>`;
    }
    // the machine: anchored on the ledge, its sweeper reaches a fallen domino's foot uPick after the wave did
    const cs0 = W0 + d / 2 - xv - fallen;
    const ride = `${id}c ${f4(T)}s linear ${startAt(cs0, L.P, T)}s infinite`;
    const wr = 2.5 * k, spin = (r) => f4((2 * Math.PI * r) / v);
    const set = ((((0.5 * s - W0) / v + uPlace) % dt) + dt) % dt; // the moment the chute sets one down, in its cycle
    const Qc = 19 * k;
    const part = (x, y, r, svg, extra) => `<svg class="wm-pt" style="left:${f(x - r)}px;top:${f(y - r)}px;${extra}" width="${f(2 * r)}" height="${f(2 * r)}" viewBox="${f(-r)} ${f(-r)} ${f(2 * r)} ${f(2 * r)}">${svg}</svg>`;
    const machine = `<div class="wm-mv wd-m" style="animation:${ride}">`
      + `<svg style="left:${f(-Qc)}px;top:${f(-Qc)}px" width="${f(2 * Qc)}" height="${f(2 * Qc)}" viewBox="${f(-Qc)} ${f(-Qc)} ${f(2 * Qc)} ${f(2 * Qc)}">${cart(k)}</svg>`
      + part(-7.2 * k, -wr, wr + 0.3 * k, wheel(k), `animation:wmSpin ${spin(wr)}s linear infinite`)
      + part(2.3 * k, -wr, wr + 0.3 * k, wheel(k), `animation:wmSpin ${spin(wr)}s linear infinite`)
      + part(14.9 * k, -2.5 * k, 3 * k, brush(k), `animation:wmSpin ${spin(2.4 * k)}s linear infinite`)
      + `<i class="wm-pt wm-push" style="left:${f(-15.9 * k)}px;top:${f(-3.4 * k)}px;width:${f(0.9 * k)}px;height:${f(2.6 * k)}px;animation:wmPush ${f4(dt)}s linear ${f4(set - dt)}s infinite"></i>`
      + `<i class="wm-pt wm-beacon" style="left:${f(0.1 * k)}px;top:${f(-13.7 * k)}px;width:${f(1.6 * k)}px;height:${f(1.4 * k)}px"></i>`
      + '</div>';
    const cv = `<canvas class="wm wd-cv" width="${Math.round((W + 2 * out) * D.dpr)}" height="${Math.round((H + 2 * out) * D.dpr)}" style="left:${-out}px;top:${-out}px;width:${W + 2 * out}px;height:${H + 2 * out}px"></canvas>`;
    rebuild(layer, `<style>${css}${orbitKeys(`${id}c`, L)}</style>${cv}${actors}${machine}`, T * 1000);
    D.ctx = layer.querySelector('.wd-cv').getContext('2d');
    D.drive = layer.querySelector('.wd-m').getAnimations()[0];
    layer.wmZ = D;
    clearTimeout(layer.wmTimer);
    const drawn = new Array(N).fill('');
    const tick = () => {
      if (!layer.isConnected || layer.wmZ !== D || !D.ctx.canvas.isConnected) return; // rebuilt, another style, or gone
      layer.wmTimer = setTimeout(tick, 25);
      const tm = D.drive && D.drive.currentTime;
      if (tm == null || tm === D.lastT) return;
      if (layer.checkVisibility && !layer.checkVisibility({ visibilityProperty: true })) return;
      const t = tm / 1000;
      if (D.lastT == null || tm < D.lastT || tm - D.lastT > 400) {
        domPaint(D, t);
        for (let j = 0; j < N; j++) drawn[j] = D.stateOf(j, t);
      } else {
        const list = [];
        for (let j = 0; j < N; j++) {
          const st = D.stateOf(j, t);
          if (st === drawn[j]) continue;
          drawn[j] = st;
          const last = list[list.length - 1];
          if (last && j - last[1] <= 3) last[1] = j; else list.push([j, j]);
        }
        if (list.length) domPaint(D, t, list);
      }
      D.lastT = tm;
    };
    tick();
  }

  /* --------------------------------------------------------------------------------------------------------- */
  // gradients shared by every pane (ids are global): one hidden <svg> in the document
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + '<linearGradient id="wmZt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0cf7d"/><stop offset=".5" stop-color="#cf9f3c"/><stop offset="1" stop-color="#9a7020"/></linearGradient>'
    // 지퍼: polished nickel slider and pull, lit along their middle (they turn at the corners)
    + '<linearGradient id="wmZs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3af"/><stop offset=".3" stop-color="#e9edf2"/><stop offset=".55" stop-color="#c3cad3"/><stop offset="1" stop-color="#737d8a"/></linearGradient>'
    + '<linearGradient id="wmZb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#d6dce4"/><stop offset="1" stop-color="#9aa3ae"/></linearGradient>'
    // 톱니 체인: brass lit from the top left (frames: the light stays put while the wheel turns), steel chain
    + '<linearGradient id="wmGf" x1=".12" y1=".05" x2=".88" y2=".95"><stop offset="0" stop-color="#f8e6ad"/><stop offset=".38" stop-color="#ddb257"/><stop offset=".75" stop-color="#b8872e"/><stop offset="1" stop-color="#7d5715"/></linearGradient>'
    + '<linearGradient id="wmGe" x1=".15" y1=".1" x2=".85" y2=".9"><stop offset="0" stop-color="#fff6d6"/><stop offset=".5" stop-color="#d9ab4c"/><stop offset="1" stop-color="#5e400f"/></linearGradient>'
    + '<linearGradient id="wmGr" x1=".15" y1=".1" x2=".85" y2=".9"><stop offset="0" stop-color="#5a3d0d"/><stop offset=".5" stop-color="#a87b27"/><stop offset="1" stop-color="#fbe8b0"/></linearGradient>'
    + '<radialGradient id="wmGh" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#fff4cf"/><stop offset=".6" stop-color="#d7a84a"/><stop offset="1" stop-color="#8f6420"/></radialGradient>'
    + '<radialGradient id="wmGb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9c0ca"/><stop offset="1" stop-color="#5d646e"/></radialGradient>'
    + '<linearGradient id="wmCiT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aab3bf"/><stop offset=".22" stop-color="#8a93a0"/><stop offset=".7" stop-color="#596170"/><stop offset="1" stop-color="#3a4049"/></linearGradient>'
    + '<linearGradient id="wmCiB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#aab3bf"/><stop offset=".22" stop-color="#8a93a0"/><stop offset=".7" stop-color="#596170"/><stop offset="1" stop-color="#3a4049"/></linearGradient>'
    + '<linearGradient id="wmCoT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f4f8"/><stop offset=".2" stop-color="#c7ced8"/><stop offset=".65" stop-color="#8d96a3"/><stop offset="1" stop-color="#545c68"/></linearGradient>'
    + '<linearGradient id="wmCoB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f1f4f8"/><stop offset=".2" stop-color="#c7ced8"/><stop offset=".65" stop-color="#8d96a3"/><stop offset="1" stop-color="#545c68"/></linearGradient>'
    + '<linearGradient id="wmCiD" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#aab3bf"/><stop offset=".3" stop-color="#8a93a0"/><stop offset=".75" stop-color="#596170"/><stop offset="1" stop-color="#3a4049"/></linearGradient>'
    + '<linearGradient id="wmCoD" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#f1f4f8"/><stop offset=".28" stop-color="#c7ced8"/><stop offset=".7" stop-color="#8d96a3"/><stop offset="1" stop-color="#545c68"/></linearGradient>'
    + '<radialGradient id="wmCro" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#7d8590"/><stop offset=".55" stop-color="#3b4048"/><stop offset="1" stop-color="#191c20"/></radialGradient>'
    + '<radialGradient id="wmCp" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#c3cad3"/><stop offset="1" stop-color="#5f6772"/></radialGradient>'
    + '<radialGradient id="wmCr" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#e6ebf1"/><stop offset=".6" stop-color="#a5aeba"/><stop offset="1" stop-color="#6c7581"/></radialGradient>'
    + '<radialGradient id="wmCd" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#9aa3b0"/><stop offset=".88" stop-color="#d3d9e1"/><stop offset="1" stop-color="#6b7480"/></radialGradient>'
    + '<radialGradient id="wmCh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4f6f9"/><stop offset="1" stop-color="#8c95a2"/></radialGradient>'
    + '<linearGradient id="wmDc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b4bcc8"/><stop offset="1" stop-color="#727c8a"/></linearGradient>'
    + '<clipPath id="wmDhz" clipPathUnits="userSpaceOnUse"><rect x="-10.6" y="-3.9" width="17.2" height="2.2"/></clipPath>'
    + '</defs></svg>';
  const addDefs = () => { if (!document.getElementById('wmZt')) document.body.insertAdjacentHTML('beforeend', DEFS); };
  if (document.body) addDefs(); else document.addEventListener('DOMContentLoaded', addDefs);

  const empty = () => '';
  window.WG_MORE = {
    runners: { zipper: empty, conveyor: empty, gears: empty, domino: empty },
    fit: { zipper: fitZipper, conveyor: fitConveyor, gears: fitGears, domino: fitDomino },
  };
})();
