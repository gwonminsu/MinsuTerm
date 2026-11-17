'use strict';
/*
 * 회로 기판: a quiet board. Traces run on a grid with 45° bends, in buses and from the pins of a few chips, and
 * end in vias and pads; the board itself is drawn once, faintly. A handful of signals travel it as short pulses
 * with a brief trail: one arriving at a chip makes it glow and send others out.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('circuit');
  const TAU = Math.PI * 2;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  function build(W, H, s, L, dpr, pv) {
    const R = K.rng(8086), g = pv ? 6 : Math.max(9, Math.round(26 * s)); // a finer grid in the picker preview, so it shows a board and not one chip
    const cols = Math.max(4, Math.ceil(W / g) + 1), rows = Math.max(3, Math.ceil(H / g) + 1);
    const ox = (W - (cols - 1) * g) / 2, oy = (H - (rows - 1) * g) / 2;
    const X = (i) => ox + i * g, Y = (j) => oy + j * g;
    const occ = new Uint8Array(cols * rows), diag = new Uint8Array(cols * rows);
    const inside = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows;
    const taken = (i, j) => !inside(i, j) || occ[j * cols + i];
    const take = (i, j) => { if (inside(i, j)) occ[j * cols + i] = 1; };
    const traces = [], vias = [], pads = [], chips = [], parts = [];

    /** Lay a trace from a node, heading d: long straight runs, the odd 45° turn. Returns its nodes. */
    const route = (i, j, d, maxLen, turn = 0.3) => {
      const nodes = [[i, j]];
      take(i, j);
      let run = 0;
      for (let n = 0; n < maxLen; n++) {
        const want = run >= 2 && R() < turn ? (d + (R() < 0.5 ? 1 : 7)) % 8 : d;
        let moved = false;
        for (const nd of want === d ? [d, (d + 1) % 8, (d + 7) % 8] : [want, d]) {
          const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
          if (!inside(ni, nj)) { if (nd === d) { nodes.push([ni, nj]); return { nodes, open: true }; } continue; } // runs off the board
          if (occ[nj * cols + ni]) continue;
          if (nd % 2) { const c = Math.min(j, nj) * cols + Math.min(i, ni); if (diag[c]) continue; diag[c] = 1; } // two diagonals may not cross
          run = nd === d ? run + 1 : 0;
          i = ni; j = nj; d = nd; take(i, j); nodes.push([i, j]);
          moved = true;
          break;
        }
        if (!moved) break;
      }
      return { nodes, open: false };
    };
    const add = (r, pin) => {
      if (r.nodes.length < 2) return null;
      const pts = r.nodes.map(([i, j]) => [X(i), Y(j)]), cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const tr = { pts, cum, len: cum[cum.length - 1], chip: pin ? pin.chip : -1, open: r.open };
      if (!r.open) { const e = pts[pts.length - 1]; (R() < 0.7 ? vias : pads).push(e); }
      traces.push(tr);
      return tr;
    };

    // chips first: they claim their ground, then traces fan out from their pins
    const spec = pv ? [[0.55, 0.3, 3, 2, 1]] : [[0.6, 0.2, 6, 6, 1], [0.2, 0.62, 8, 4, 0], [0.74, 0.68, 5, 5, 1]];
    for (const [fx, fy, cw0, ch0, quad] of spec) {
      const cw = Math.min(cw0, cols - 4), ch = Math.min(ch0, rows - 3);
      if (cw < 2 || ch < 1) continue;
      const i0 = Math.max(2, Math.min(cols - cw - 3, Math.round(cols * fx))), j0 = Math.max(1, Math.min(rows - ch - 2, Math.round(rows * fy)));
      for (let j = j0 - 1; j <= j0 + ch + 1; j++) for (let i = i0 - 1; i <= i0 + cw + 1; i++) take(i, j);
      const pins = [];
      for (let i = i0 + 1; i < i0 + cw; i++) { pins.push([i, j0 - 1, 6]); pins.push([i, j0 + ch + 1, 2]); }
      if (quad) for (let j = j0 + 1; j < j0 + ch; j++) { pins.push([i0 - 1, j, 4]); pins.push([i0 + cw + 1, j, 0]); }
      chips.push({ i0, j0, cw, ch, pins, glow: 0, out: [] });
    }
    chips.forEach((chip, ci) => {
      for (const [i, j, d] of chip.pins) {
        if (R() > 0.72 || !inside(i, j)) continue;
        occ[j * cols + i] = 0; // the pin's own node is where its trace starts
        const tr = add(route(i, j, d, 5 + ((R() * 12) | 0), 0.34), { chip: ci });
        if (tr) chip.out.push(traces.length - 1);
      }
    });
    // buses: a few traces side by side, bending together
    for (let b = 0; b < (pv ? 1 : 3); b++) {
      const side = (R() * 3) | 0, n = 3 + ((R() * 2) | 0); // from the left, the bottom or the right edge
      const at = side === 1 ? 2 + ((R() * Math.max(1, cols - n - 4)) | 0) : 2 + ((R() * Math.max(1, rows - n - 4)) | 0);
      for (let k = 0; k < n; k++) {
        const [i, j, d] = side === 0 ? [0, at + k, 0] : side === 1 ? [at + k, rows - 1, 6] : [cols - 1, at + k, 4];
        if (!taken(i, j)) add(route(i, j, d, 8 + ((R() * 10) | 0) - k, 0.22), null);
      }
    }
    // loose traces between vias
    for (let n = 0; n < (pv ? 2 : Math.round((cols * rows) / 115)); n++) {
      const i = 1 + ((R() * (cols - 2)) | 0), j = 1 + ((R() * (rows - 2)) | 0);
      if (taken(i, j)) continue;
      vias.push([X(i), Y(j)]);
      add(route(i, j, ((R() * 4) | 0) * 2, 4 + ((R() * 9) | 0), 0.36), null);
    }
    // small two-pad parts on free ground
    for (let n = 0; n < (pv ? 1 : Math.round((cols * rows) / 190)); n++) {
      const i = 1 + ((R() * (cols - 3)) | 0), j = 1 + ((R() * (rows - 2)) | 0), vert = R() < 0.4;
      const i2 = vert ? i : i + 1, j2 = vert ? j + 1 : j;
      if (taken(i, j) || taken(i2, j2)) continue;
      take(i, j); take(i2, j2);
      parts.push([X(i), Y(j), X(i2), Y(j2)]);
    }

    // the board, drawn once
    const [layer, c] = K.layer(W, H, dpr);
    const ink = (a) => (L ? `rgba(58,78,124,${a})` : `rgba(150,170,214,${a})`);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = ink(L ? 0.22 : 0.17); c.lineWidth = Math.max(0.8, 1.4 * s);
    for (const tr of traces) { c.beginPath(); tr.pts.forEach(([x, y], k) => c[k ? 'lineTo' : 'moveTo'](x, y)); c.stroke(); }
    const pr = Math.max(1.1, 2.6 * s);
    for (const [x, y] of vias) { // a ring round a drilled hole
      c.strokeStyle = ink(L ? 0.36 : 0.3); c.lineWidth = Math.max(0.7, 1.3 * s);
      c.beginPath(); c.arc(x, y, pr, 0, TAU); c.stroke();
    }
    c.fillStyle = ink(L ? 0.3 : 0.22);
    for (const [x, y] of pads) c.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    for (const [x0, y0, x1, y1] of parts) {
      c.fillStyle = ink(L ? 0.3 : 0.22);
      for (const [x, y] of [[x0, y0], [x1, y1]]) c.fillRect(x - pr * 1.1, y - pr * 1.1, pr * 2.2, pr * 2.2);
      c.fillStyle = ink(L ? 0.16 : 0.11);
      const vx = x1 - x0, vy = y1 - y0;
      c.fillRect(Math.min(x0, x1) + Math.abs(vx) * 0.3 - (vx ? 0 : pr * 1.2), Math.min(y0, y1) + Math.abs(vy) * 0.3 - (vy ? 0 : pr * 1.2), vx ? Math.abs(vx) * 0.4 : pr * 2.4, vy ? Math.abs(vy) * 0.4 : pr * 2.4);
    }
    for (const chip of chips) {
      const x0 = X(chip.i0) - g * 0.42, y0 = Y(chip.j0) - g * 0.42, cw = chip.cw * g + g * 0.84, ch = chip.ch * g + g * 0.84;
      chip.box = [x0, y0, cw, ch];
      c.strokeStyle = ink(L ? 0.3 : 0.22); c.lineWidth = Math.max(1, 2.2 * s); c.lineCap = 'butt';
      for (const [i, j, d] of chip.pins) { c.beginPath(); c.moveTo(X(i), Y(j)); c.lineTo(X(i) - DIRS[d][0] * g * 0.6, Y(j) - DIRS[d][1] * g * 0.6); c.stroke(); } // legs
      c.fillStyle = ink(L ? 0.07 : 0.06); c.strokeStyle = ink(L ? 0.36 : 0.28); c.lineWidth = Math.max(0.8, 1.3 * s);
      c.beginPath(); c.roundRect(x0, y0, cw, ch, g * 0.16); c.fill(); c.stroke();
      c.fillStyle = ink(L ? 0.3 : 0.22);
      c.beginPath(); c.arc(x0 + g * 0.42, y0 + g * 0.42, Math.max(0.9, g * 0.11), 0, TAU); c.fill(); // pin 1
      c.strokeStyle = ink(L ? 0.16 : 0.1); c.lineWidth = Math.max(0.6, s);
      for (let k = 1; k <= 2; k++) { c.beginPath(); c.moveTo(x0 + cw * 0.3, y0 + ch * (0.36 + k * 0.14)); c.lineTo(x0 + cw * 0.74, y0 + ch * (0.36 + k * 0.14)); c.stroke(); } // the part number, as two faint lines
    }
    return { layer, traces: traces.filter((tr) => tr.len >= g * 3), all: traces, chips, g };
  }

  /** The point a distance d along a trace. */
  function along(tr, d) {
    const { pts, cum } = tr;
    if (d <= 0) return pts[0];
    if (d >= tr.len) return pts[pts.length - 1];
    let k = 1;
    while (cum[k] < d) k++;
    const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f];
  }

  (window.BG_EXT = window.BG_EXT || {}).circuit = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), { W, H, u } = V, L = K.light(), dpr = bg.dpr || 1;
    const s = V.pv ? 0.42 : Math.max(0.6, Math.min(1.2, u / 700));
    const key = `${W}x${H}@${dpr}${L ? 'L' : 'D'}`;
    let st = bg.st;
    if (!st || st.kind !== 'circuit' || st.key !== key) st = bg.st = Object.assign(build(W, H, s, L, dpr, V.pv), { kind: 'circuit', key, pulses: [], rings: [], due: [] });
    const cols = typeof fxColors === 'function' ? fxColors() : [[124, 92, 255], [255, 122, 198], [255, 170, 90]];
    const maxP = V.pv ? 2 : Math.max(3, Math.min(9, Math.round((W * H) / 110000)));
    const send = (ti, outward) => { const tr = st.all[ti]; if (!tr || tr.len < st.g * 2) return; st.pulses.push({ tr, pos: outward ? 0 : tr.len, dir: outward ? 1 : -1, v: (2.1 + Math.random() * 1.5) * s, c: cols[Math.random() < 0.6 ? 2 : 0], age: 0 }); };

    ctx.drawImage(st.layer, 0, 0, W, H);

    // now and then a signal sets out; one that reaches a chip is answered a moment later
    if (st.pulses.length < maxP && st.traces.length && Math.random() < (V.pv ? 0.09 : 0.045)) {
      const ti = st.all.indexOf(st.traces[(Math.random() * st.traces.length) | 0]), tr = st.all[ti];
      send(ti, tr.chip >= 0 ? Math.random() < 0.45 : tr.open ? false : Math.random() < 0.5);
    }
    for (let i = st.due.length - 1; i >= 0; i--) if (--st.due[i][0] <= 0) { if (st.pulses.length < maxP + 2) send(st.due[i][1], true); st.due.splice(i, 1); }

    const tl = 62 * s, lw = Math.max(1, 1.7 * s);
    ctx.lineCap = 'round'; ctx.lineWidth = lw;
    for (let i = st.pulses.length - 1; i >= 0; i--) {
      const p = st.pulses[i], tr = p.tr;
      p.pos += p.v * p.dir; p.age++;
      const fade = Math.min(1, p.age / 8), c = p.c.join(',');
      for (let k = 0; k < 8; k++) { // the trail: short pieces of the trace behind the head, each fainter
        const d0 = p.pos - p.dir * (tl * k) / 8, d1 = p.pos - p.dir * (tl * (k + 1)) / 8;
        if ((p.dir > 0 && d0 < 0) || (p.dir < 0 && d0 > tr.len)) break;
        const a = along(tr, d0), b = along(tr, d1);
        ctx.strokeStyle = `rgba(${c},${(L ? 0.75 : 0.6) * fade * (1 - k / 8) ** 2})`;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const [x, y] = along(tr, p.pos);
      if (!p.done) { // the head; once it has arrived only its trail runs in
        K.glow(ctx, x, y, 6.5 * s, [[0, `rgba(${c},${(L ? 0.6 : 0.55) * fade})`], [1, `rgba(${c},0)`]]);
        ctx.fillStyle = L ? `rgba(${c},${0.95 * fade})` : `rgba(255,255,255,${0.85 * fade})`;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.7, 1.3 * s), 0, TAU); ctx.fill();
      }
      if (p.pos < -tl || p.pos > tr.len + tl) { st.pulses.splice(i, 1); continue; }
      if (!p.done && (p.dir > 0 ? p.pos >= tr.len : p.pos <= 0)) { // arrived
        p.done = true;
        if (p.dir < 0 && tr.chip >= 0) {
          const chip = st.chips[tr.chip];
          chip.glow = 1; chip.c = p.c;
          if (!V.pv) for (let n = 0, m = 1 + ((Math.random() * 2) | 0); n < m && chip.out.length; n++) st.due.push([10 + Math.random() * 26, chip.out[(Math.random() * chip.out.length) | 0]]);
        } else if (!tr.open || p.dir < 0) st.rings.push({ x, y, life: 1, c: p.c });
      }
    }
    for (const r of st.rings) { // a signal landing on a via
      r.life -= 0.045;
      ctx.strokeStyle = `rgba(${r.c.join(',')},${Math.max(0, r.life) * (L ? 0.6 : 0.5)})`; ctx.lineWidth = Math.max(0.7, 1.1 * s);
      ctx.beginPath(); ctx.arc(r.x, r.y, (3 + (1 - r.life) * 9) * s, 0, TAU); ctx.stroke();
    }
    st.rings = st.rings.filter((r) => r.life > 0);
    for (const chip of st.chips) { // a chip that was just spoken to
      if (chip.glow <= 0.01) continue;
      chip.glow -= 0.022;
      const [x0, y0, cw, ch] = chip.box, c = chip.c.join(','), a = Math.max(0, chip.glow);
      ctx.fillStyle = `rgba(${c},${a * (L ? 0.055 : 0.08)})`; ctx.strokeStyle = `rgba(${c},${a * (L ? 0.6 : 0.5)})`; ctx.lineWidth = Math.max(0.8, 1.3 * s);
      ctx.beginPath(); ctx.roundRect(x0, y0, cw, ch, st.g * 0.16); ctx.fill(); ctx.stroke();
    }
  };
})();
