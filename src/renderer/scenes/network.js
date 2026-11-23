'use strict';
/*
 * 입자 네트워크: a cloud of nodes in depth that the view drifts slowly through, the cloud swaying a little as it
 * goes and every node wandering on its own. Nearer nodes are larger and brighter (the nearest a little out of
 * focus), farther ones small and dim; links join close nodes and fade with their length and depth. A few hubs
 * carry a soft halo. Pulses of light run along the links from node to node, and every few seconds a node lights
 * up and its signal ripples out through its neighbours. Accent colours added as light over a dark page; on a light
 * page the same network is inked over the page in deeper colours.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('network');
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};
  const TAU = Math.PI * 2, WHITE = [255, 255, 255], INK = [22, 26, 52];
  const mix = (c, d, k) => [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);
  const sstep = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const AL = 8, WL = 3; // links are stroked in buckets: alpha steps × width steps

  /* ---------- sprites (made once per colour, cached) ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** A thin soft ring at 0.4 of the sprite's size. */
  function ringSpr(key, c) {
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 96, cv = K.mk(N, N), x = cv.getContext('2d');
    x.filter = 'blur(1.2px)';
    x.strokeStyle = rgba(c, 1); x.lineWidth = 2.2;
    x.beginPath(); x.arc(N / 2, N / 2, N * 0.4, 0, TAU); x.stroke();
    K.cache.set(key, cv);
    return cv;
  }
  /** One colour's sprites: a node (a firm core in a short halo), an out-of-focus disc, a wide halo, a ring. */
  function sprites(c, L) {
    const k = `net|${c}|${L ? 'L' : 'D'}`;
    let s = K.cache.get(k);
    if (s) return s;
    const core = L ? mix(c, INK, 0.35) : mix(c, WHITE, 0.72), body = L ? mix(c, INK, 0.12) : mix(c, WHITE, 0.3);
    s = {
      dot: radial(k + '|dot', 64, [[0, rgba(core, 1)], [0.12, rgba(core, 0.97)], [0.17, rgba(body, 0.75)], [0.24, rgba(c, L ? 0.24 : 0.32)], [0.48, rgba(c, L ? 0.05 : 0.08)], [1, rgba(c, 0)]]), // the core's edge at 0.17
      bokeh: radial(k + '|bokeh', 64, [[0, rgba(body, 0.3)], [0.5, rgba(c, 0.3)], [0.76, rgba(body, 0.36)], [0.88, rgba(c, 0.14)], [1, rgba(c, 0)]]),
      halo: radial(k + '|halo', 96, [[0, rgba(c, L ? 0.34 : 0.5)], [0.18, rgba(c, L ? 0.17 : 0.24)], [0.45, rgba(c, L ? 0.05 : 0.07)], [1, rgba(c, 0)]]),
      head: radial(k + '|head', 48, [[0, rgba(L ? core : WHITE, 1)], [0.1, rgba(core, 0.95)], [0.22, rgba(c, L ? 0.45 : 0.55)], [0.5, rgba(c, L ? 0.1 : 0.14)], [1, rgba(c, 0)]]),
      ring: ringSpr(k + '|ring', L ? mix(c, INK, 0.1) : mix(c, WHITE, 0.25)),
    };
    K.cache.set(k, s);
    return s;
  }
  function palette(cols, L) {
    const [a0, a1, a2] = cols;
    const node = L ? mix(a0, INK, 0.2) : mix(a0, WHITE, 0.32);
    return {
      L,
      link: L ? mix(a0, INK, 0.45) : mix(a0, [210, 220, 255], 0.42),
      linkA: L ? 0.8 : 0.78,
      hue: [node, L ? mix(a1, INK, 0.12) : mix(a1, WHITE, 0.12), L ? mix(a2, INK, 0.12) : mix(a2, WHITE, 0.08)],
      spr: [sprites(node, L), sprites(L ? mix(a1, INK, 0.12) : mix(a1, WHITE, 0.12), L), sprites(L ? mix(a2, INK, 0.12) : mix(a2, WHITE, 0.08), L)],
    };
  }

  /* ---------- the cloud ---------- */

  function build(w, h, pv) {
    const R = K.rng(pv ? 311 : 2026);
    const U = Math.max(w, h * 1.3), D = 1.1 * U, Dz = 0.42 * U, sF = D / (D + Dz);
    const Wx = (0.5 * w / sF) * 1.24 + 12, Hy = (0.5 * h / sF) * 1.14 + 12; // wide enough that the field wraps off screen at every depth
    const N = pv ? 72 : Math.max(140, Math.min(420, Math.round((w * h) / 2500)));
    const rho = N / (8 * Wx * Hy * Dz), Lmax = Math.cbrt((3 * 5) / (4 * Math.PI * rho)); // about five links a node
    const mu = pv ? 0.35 : Math.max(0.6, U / 1200); // scale for wandering
    // a little under half the nodes gather in knots round a hub; the rest are scattered between them
    const nodes = [], nK = pv ? 3 : Math.max(6, Math.round(N / 28)), inK = Math.round(N * 0.42), gs = () => (R() + R() + R() - 1.5) * 0.9;
    const wrapA = (v, m) => ((((v + m) % (2 * m)) + 2 * m) % (2 * m)) - m;
    const knots = Array.from({ length: nK }, () => [(R() * 2 - 1) * Wx, (R() * 2 - 1) * Hy, (R() * 2 - 1) * Dz * 0.85, Lmax * (0.5 + R() * 0.45)]);
    for (let i = 0; i < N; i++) {
      const kn = i < inK ? knots[i % nK] : null, hub = !!kn && i < nK;
      const x = kn ? wrapA(kn[0] + (hub ? 0 : gs() * kn[3]), Wx) : (R() * 2 - 1) * Wx;
      const y = kn ? wrapA(kn[1] + (hub ? 0 : gs() * kn[3]), Hy) : (R() * 2 - 1) * Hy;
      const z = kn ? Math.max(-Dz, Math.min(Dz, kn[2] + (hub ? 0 : gs() * kn[3]))) : (R() * 2 - 1) * Dz;
      nodes.push({
        x, y, z,
        ax: (8 + R() * 20) * mu * (kn ? 0.6 : 1), ay: (6 + R() * 16) * mu * (kn ? 0.6 : 1), az: (8 + R() * 22) * mu * (kn ? 0.6 : 1),
        f1: 0.003 + R() * 0.006, f2: 0.003 + R() * 0.006, f3: 0.002 + R() * 0.005, p1: R() * TAU, p2: R() * TAU, p3: R() * TAU,
        hub, r: hub ? 2.9 + R() * 1.3 : 1.05 + R() * 0.75, c: hub ? (R() < 0.5 ? 0 : 1) : 0, ph: R() * TAU,
        lr: Lmax * (hub ? 1.3 : kn ? 0.85 : 1.22), // how far it reaches: the scattered nodes farther, so the space between the knots is spanned too
        flash: 0, fc: 2, wx: 0, wy: 0, wz: 0, sx: 0, sy: 0, s: 1, zn: 0.5, fade: 1, dA: 1, on: false,
      });
    }
    const buckets = Array.from({ length: AL * WL }, () => []);
    return { kind: 'network', geo: `${w}x${h}`, pv, U, D, Dz, Wx, Hy, Lmax, nodes, buckets, order: nodes.map((_, i) => i), pulses: [], rings: [], next: pv ? 20 : 70 + R() * 60, cid: 0, cc: 0 };
  }

  /** Nodes within linking distance of node i (indices), nearest first. */
  function neighbours(st, i, out) {
    out.length = 0;
    const a = st.nodes[i];
    for (let j = 0; j < st.nodes.length; j++) {
      if (j === i) continue;
      const b = st.nodes[j], lim = (a.lr + b.lr) / 2;
      const dx = a.wx - b.wx, dy = a.wy - b.wy, dz = a.wz - b.wz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < lim * lim) out.push(j, d2);
    }
    const n = out.length / 2, idx = [];
    for (let k = 0; k < n; k++) idx.push(k);
    idx.sort((p, q) => out[p * 2 + 1] - out[q * 2 + 1]);
    return idx.map((k) => out[k * 2]);
  }
  const NB = [];

  function send(st, a, b, c, e, cid, gen) {
    if (st.pulses.length >= (st.pv ? 12 : 70)) return;
    st.pulses.push({ a, b, pos: 0, v: (st.pv ? 1.5 : 3.2 + Math.random() * 1.6) * (st.pv ? 1 : Math.max(0.8, st.U / 1300)), c, e, cid, gen, age: 0 });
  }

  /** A node lights up and its signal ripples out through its neighbours. */
  function cascade(st, w, h) {
    let best = -1, bs = -1;
    for (let k = 0; k < 24; k++) { // a node in plain view, not too near nor too far; a hub if one is there
      const i = (Math.random() * st.nodes.length) | 0, n = st.nodes[i];
      if (!n.on || n.sx < w * 0.08 || n.sx > w * 0.92 || n.sy < h * 0.1 || n.sy > h * 0.9) continue;
      const sc = (n.hub ? 2 : 1) * (1 - Math.abs(n.s - 1.05)) + Math.random() * 0.3;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return;
    const c = [2, 1, 2, 0][st.cc++ % 4], n = st.nodes[best];
    st.cid += 1;
    st.seen = new Set([best]);
    st.seenId = st.cid;
    n.flash = 1.25; n.fc = c;
    st.rings.push({ i: best, age: 0, c });
    for (const j of neighbours(st, best, NB).slice(0, 6)) { st.seen.add(j); send(st, best, j, c, 1, st.cid, 1); }
  }

  function draw(bg, ctx, w, h, t) {
    const pv = h < 90, L = K.light();
    let st = bg.netSt;
    if (!st || st.geo !== `${w}x${h}`) st = bg.netSt = build(w, h, pv);
    const cols = accents(), pk = `${cols.join('|')}${L ? 'L' : 'D'}`;
    if (st.pk !== pk) { st.pk = pk; st.pal = palette(cols, L); }
    const P = st.pal, { nodes, D, Dz, Wx, Hy, Lmax, U } = st, N = nodes.length;
    const cx = w / 2, cy = h / 2;
    const rs = pv ? 0.62 : Math.max(0.85, Math.min(1.35, U / 1250)); // node sizes
    const dv = pv ? 0.16 : Math.max(0.7, U / 1200); // drift speed

    // the view's slow drift through the field, and the cloud's sway
    const ox = -t * 0.27 * dv, oy = -t * 0.06 * dv;
    const yaw = 0.17 * Math.sin(t * 0.0021) + 0.06 * Math.sin(t * 0.00083 + 2.1), pitch = 0.08 * Math.sin(t * 0.0016 + 0.7);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ex = Wx * 0.14, ey = Hy * 0.14;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      let x = n.x + ox + n.ax * Math.sin(t * n.f1 + n.p1); x = ((((x + Wx) % (2 * Wx)) + 2 * Wx) % (2 * Wx)) - Wx;
      let y = n.y + oy + n.ay * Math.sin(t * n.f2 + n.p2); y = ((((y + Hy) % (2 * Hy)) + 2 * Hy) % (2 * Hy)) - Hy;
      const z = n.z + n.az * Math.sin(t * n.f3 + n.p3);
      n.wx = x; n.wy = y; n.wz = z;
      const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const s = D / Math.max(D * 0.3, D + z2);
      n.s = s; n.sx = cx + x1 * s; n.sy = cy + y1 * s;
      n.zn = Math.max(0, Math.min(1, (z2 + Dz) / (2 * Dz)));
      n.fade = sstep(0, ex, Wx - Math.abs(x)) * sstep(0, ey, Hy - Math.abs(y)); // nothing pops where the field wraps
      n.dA = (1 - 0.74 * Math.pow(n.zn, 0.85)) * n.fade; // farther is dimmer
      const m = 30 * s;
      n.on = n.fade > 0.01 && n.sx > -m && n.sx < w + m && n.sy > -m && n.sy < h + m;
      if (n.flash > 0.004) n.flash *= 0.935; else n.flash = 0;
    }

    // links: stroked in buckets by strength and width
    const B = st.buckets, adj = st.adj || (st.adj = nodes.map(() => [])), TF = st.tri || (st.tri = [[], [], [], []]);
    for (let k = 0; k < B.length; k++) B[k].length = 0;
    for (let k = 0; k < N; k++) adj[k].length = 0;
    for (let k = 0; k < TF.length; k++) TF[k].length = 0;
    const L2 = Lmax * 1.3;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        if (!a.on && !b.on) continue;
        const dx = a.wx - b.wx;
        if (dx > L2 || dx < -L2) continue;
        const dy = a.wy - b.wy;
        if (dy > L2 || dy < -L2) continue;
        const dz = a.wz - b.wz, lim = (a.lr + b.lr) / 2, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= lim * lim) continue;
        const q = 1 - Math.sqrt(d2) / lim, al = Math.pow(q, 0.85) * Math.min(a.dA, b.dA);
        if (al < 0.04) continue;
        const ss = (a.s + b.s) / 2, wl = ss < 0.95 ? 0 : ss < 1.3 ? 1 : 2;
        B[wl * AL + Math.min(AL - 1, (al * AL) | 0)].push(a.sx, a.sy, b.sx, b.sy);
        if (q > 0.3) { adj[i].push(j, al); }
      }
    }
    // where three close nodes are all linked, the face between them is filled very faintly: a mesh, not a scatter
    for (let i = 0; i < N; i++) {
      const ai = adj[i];
      for (let p = 0; p < ai.length; p += 2) {
        const j = ai[p], aj = adj[j];
        for (let q2 = p + 2; q2 < ai.length; q2 += 2) {
          const k2 = ai[q2];
          for (let r = 0; r < aj.length; r += 2) {
            if (aj[r] !== k2) continue;
            const A = nodes[i], Bn = nodes[j], C = nodes[k2];
            const area = Math.abs((Bn.sx - A.sx) * (C.sy - A.sy) - (C.sx - A.sx) * (Bn.sy - A.sy)) / 2, big = area / (pv ? 300 : 5200); // a large face would read as a flat shape: only the small ones show
            if (big >= 1) continue;
            const f = Math.min(ai[p + 1], ai[q2 + 1], aj[r + 1]) * (1 - big) * (1 - big);
            if (f > 0.12) TF[Math.min(3, ((f - 0.12) * 6) | 0)].push(A.sx, A.sy, Bn.sx, Bn.sy, C.sx, C.sy);
          }
        }
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.lineCap = 'round';
    const lwBase = pv ? 0.6 : Math.max(0.8, Math.min(1.2, U / 1300));
    for (let k = 0; k < TF.length; k++) {
      const tf = TF[k];
      if (!tf.length) continue;
      ctx.fillStyle = rgba(P.link, (0.03 + 0.028 * k) * (L ? 0.6 : 1)); // on a light page a filled face reads more as a shape: fainter there
      ctx.beginPath();
      for (let m = 0; m < tf.length; m += 6) { ctx.moveTo(tf[m], tf[m + 1]); ctx.lineTo(tf[m + 2], tf[m + 3]); ctx.lineTo(tf[m + 4], tf[m + 5]); ctx.closePath(); }
      ctx.fill();
    }
    for (let wl = 0; wl < WL; wl++) {
      ctx.lineWidth = [0.55, 0.9, 1.45][wl] * lwBase;
      for (let al = 0; al < AL; al++) {
        const seg = B[wl * AL + al];
        if (!seg.length) continue;
        ctx.strokeStyle = rgba(P.link, ((al + 0.6) / AL) * P.linkA);
        ctx.beginPath();
        for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(seg[k], seg[k + 1]); ctx.lineTo(seg[k + 2], seg[k + 3]); }
        ctx.stroke();
      }
    }

    // a node that has just been reached: its links light up in the signal's colour
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      if (a.flash < 0.06 || !a.on) continue;
      ctx.strokeStyle = rgba(P.hue[a.fc], Math.min(1, a.flash) * (L ? 0.5 : 0.42) * a.dA);
      ctx.lineWidth = Math.max(0.6, 1.1 * a.s) * lwBase;
      ctx.beginPath();
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const b = nodes[j], lim = (a.lr + b.lr) / 2;
        const dx = a.wx - b.wx, dy = a.wy - b.wy, dz = a.wz - b.wz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= lim * lim) continue;
        const q = 1 - Math.sqrt(d2) / lim; // shorter for weaker links: the light runs part of the way out
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.sx + (b.sx - a.sx) * (0.35 + 0.65 * q), a.sy + (b.sy - a.sy) * (0.35 + 0.65 * q));
      }
      ctx.stroke();
    }

    // nodes, far to near (on a light page a nearer one covers a farther one)
    const ord = st.order;
    if (L) ord.sort((p, q) => nodes[q].zn - nodes[p].zn);
    for (let k = 0; k < N; k++) {
      const n = nodes[L ? ord[k] : k];
      if (!n.on) continue;
      const S = P.spr[n.c], rc = n.r * Math.pow(n.s, 1.6) * rs, a = n.dA, f = Math.min(1, n.flash); // sizes run a little steeper than perspective: depth reads at a glance
      if (n.hub) { // a soft halo that breathes, and a faint ring
        const br = 0.85 + 0.15 * Math.sin(t * 0.045 + n.ph), hs = rc * (pv ? 4.5 + 3 * f : 9 + 5 * f) * br;
        ctx.globalAlpha = Math.min(1, (0.55 + 0.6 * f) * a);
        ctx.drawImage(S.halo, n.sx - hs, n.sy - hs, hs * 2, hs * 2);
        const rr = rc * (2.3 + 0.25 * Math.sin(t * 0.03 + n.ph)) / 0.4;
        ctx.globalAlpha = 0.32 * a;
        ctx.drawImage(S.ring, n.sx - rr / 2, n.sy - rr / 2, rr, rr);
      }
      if (f > 0.02) { // lit by a signal
        const Sf = P.spr[n.fc], hs = pv ? rc * (3.5 + 4 * f) : rc * (7 + 9 * f) + 4 * f;
        ctx.globalAlpha = Math.min(1, 0.95 * f * (0.35 + 0.65 * a));
        ctx.drawImage(Sf.halo, n.sx - hs, n.sy - hs, hs * 2, hs * 2);
      }
      const blur = n.s > 1.42 ? (n.s - 1.42) * 13 * rs : 0; // the nearest are out of focus
      if (blur > 0.7) {
        const rb = (rc + blur) * 1.1;
        ctx.globalAlpha = Math.min(1, a * Math.max(0.22, Math.pow(rc / (rc + blur), 0.9) * 1.25) + f * 0.4);
        ctx.drawImage(S.bokeh, n.sx - rb, n.sy - rb, rb * 2, rb * 2);
      } else {
        const ds = (rc / 0.17) * 2 * (1 + 0.25 * f);
        ctx.globalAlpha = Math.min(1, a * (L ? 0.95 : 0.9) + f * 0.5);
        ctx.drawImage(f > 0.3 ? P.spr[n.fc].head : S.dot, n.sx - ds / 2, n.sy - ds / 2, ds, ds);
      }
    }

    // a node that lit up: a ring spreads from it
    for (let i = st.rings.length - 1; i >= 0; i--) {
      const r = st.rings[i], n = nodes[r.i];
      r.age += 1;
      const k = r.age / 42;
      if (k >= 1) { st.rings.splice(i, 1); continue; }
      const rr = (n.r * n.s * rs * 2.5 + (pv ? 14 : 46) * n.s * (1 - (1 - k) * (1 - k))) / 0.4;
      ctx.globalAlpha = (1 - k) * (1 - k) * (L ? 0.55 : 0.5) * Math.max(0.3, n.dA) * (pv ? 0.45 : 1);
      ctx.drawImage(P.spr[r.c].ring, n.sx - rr / 2, n.sy - rr / 2, rr, rr);
    }

    // pulses travelling along the links
    if (st.pulses.length < (pv ? 3 : Math.max(5, Math.min(18, Math.round(N / 20)))) && Math.random() < (pv ? 0.12 : 0.1)) {
      for (let k = 0; k < 10; k++) {
        const i = (Math.random() * N) | 0, n = nodes[i];
        if (!n.on || (!n.hub && Math.random() < 0.5)) continue;
        const nb = neighbours(st, i, NB);
        if (!nb.length) continue;
        send(st, i, nb[(Math.random() * Math.min(4, nb.length)) | 0], n.hub && n.c ? 1 : Math.random() < 0.65 ? 2 : 1, 0.9, 0, 0);
        break;
      }
    }
    if (--st.next <= 0) { cascade(st, w, h); st.next = pv ? 90 : 130 + Math.random() * 160; }
    ctx.lineCap = 'round';
    for (let i = st.pulses.length - 1; i >= 0; i--) {
      const p = st.pulses[i], A = nodes[p.a], Bn = nodes[p.b];
      const len = Math.max(1, Math.hypot(A.wx - Bn.wx, A.wy - Bn.wy, A.wz - Bn.wz));
      if (len > Lmax * 1.6) { st.pulses.splice(i, 1); continue; } // its link broke (wrapped round the field)
      p.pos += p.v / len; p.age += 1;
      if (p.pos >= 1) { // arrived: the node lights up, and the signal may go on
        st.pulses.splice(i, 1);
        Bn.flash = Math.max(Bn.flash, p.cid ? 0.95 * p.e : 0.55 * p.e); Bn.fc = p.c;
        if (p.cid) {
          if (p.cid === st.seenId && p.e > 0.4) {
            const e = p.e * 0.8;
            let sent = 0;
            for (const j of neighbours(st, p.b, NB)) {
              if (st.seen.has(j)) continue;
              st.seen.add(j); send(st, p.b, j, p.c, e, p.cid, p.gen + 1);
              if (++sent >= (p.gen < 2 ? 3 : 2)) break;
            }
          }
        } else if (p.e > 0.4 && Math.random() < 0.6) {
          const nb = neighbours(st, p.b, NB).filter((j) => j !== p.a);
          if (nb.length) send(st, p.b, nb[(Math.random() * Math.min(4, nb.length)) | 0], p.c, p.e * 0.86, 0, p.gen + 1);
        }
        continue;
      }
      if (!A.on && !Bn.on) continue;
      const S = P.spr[p.c], col = P.hue[p.c];
      const x = A.sx + (Bn.sx - A.sx) * p.pos, y = A.sy + (Bn.sy - A.sy) * p.pos, s = A.s + (Bn.s - A.s) * p.pos;
      const dA = A.dA + (Bn.dA - A.dA) * p.pos, fin = Math.min(1, p.age / 6) * Math.min(1, (1 - p.pos) * 8 + 0.4);
      const e = (0.45 + 0.55 * p.e) * fin * (0.3 + 0.7 * dA);
      const tl = Math.min(p.pos, (pv ? 12 : 64) / len); // the trail: the link just behind it glows
      ctx.lineWidth = Math.max(0.8, 1.6 * s * lwBase);
      ctx.globalAlpha = 1;
      for (let k = 0; k < 6; k++) {
        const u0 = p.pos - (tl * k) / 6, u1 = p.pos - (tl * (k + 1)) / 6;
        ctx.strokeStyle = rgba(col, e * (L ? 0.8 : 0.75) * (1 - k / 6) * (1 - k / 6));
        ctx.beginPath(); ctx.moveTo(A.sx + (Bn.sx - A.sx) * u0, A.sy + (Bn.sy - A.sy) * u0); ctx.lineTo(A.sx + (Bn.sx - A.sx) * u1, A.sy + (Bn.sy - A.sy) * u1); ctx.stroke();
      }
      const hs = (pv ? 3.4 : 11) * s * rs;
      ctx.globalAlpha = Math.min(1, e);
      ctx.drawImage(S.head, x - hs, y - hs, hs * 2, hs * 2);
    }
    ctx.restore();
  }

  window.BG_EXT.network = draw;
  // the picker's still: a node just lit, its signal on the way out
  window.BG_PV_STILL.network = (bg) => { if (bg.netSt) bg.netSt.next = 1; return 16; };
})();
