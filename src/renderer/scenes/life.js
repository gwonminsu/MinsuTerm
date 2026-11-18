'use strict';
/*
 * 생명 게임: Conway's Game of Life (B3/S23) on a board that wraps at its edges, drawn as soft dots of light.
 * A cell blooms in as it is born and shrinks away as it dies, leaving a brief ghost, so gliders and spaceships
 * draw little comet tails. Its colour tells how settled it is: new life on fresh ground is bright and warm, and
 * still lifes that have stood a while cool to a deeper, quieter hue (the accent colours, warm to deep).
 * Now and then a famous pattern is set down somewhere empty (gliders, spaceships, a pulsar, the R-pentomino, an
 * acorn, now and then a Gosper glider gun), and when the board goes quiet a new soup is sown, ring by ring, into
 * its stillest region: no reset, no flash.
 * Generations come at a calm pace and are eased. Once a generation the board is drawn into two layers, as it is
 * and as it will be a step on (ghosts a step fainter, cells a step cooler), and the two are crossfaded frame by
 * frame; only the cells being born or dying are drawn every frame. On a light page the dots are darker inks.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('life'); // light mode is drawn here, not inverted
  const NB = 16;      // colour steps from newborn to settled
  const RATE = 0.07;  // how quickly a cell's settledness follows whether it is alive (per generation)
  const GHOST = 9;    // generations a dead cell's ghost takes to fade
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const bucket = (s) => { const b = (s * NB) | 0; return b < 0 ? 0 : b >= NB ? NB - 1 : b; };
  const ahead = (s) => s + (1 - s) * RATE; // settledness a step on, if the cell lives
  const ghostA = (tau) => (tau < 1 || tau > GHOST + 1 ? 0 : ((GHOST + 1 - tau) / GHOST) ** 2); // 1 just after death … 0

  /* ---------- patterns ---------- */
  const PAT = {
    glider: ['.O.', '..O', 'OOO'],
    lwss: ['.O..O', 'O....', 'O...O', 'OOOO.'],
    mwss: ['...O..', '.O...O', 'O.....', 'O....O', 'OOOOO.'],
    hwss: ['...OO..', '.O....O', 'O......', 'O.....O', 'OOOOOO.'],
    copperhead: ['.OO..OO.', '...OO...', '...OO...', 'O.O..O.O', 'O......O', '........', 'O......O', '.OO..OO.', '..OOOO..', '........', '...OO...', '...OO...'],
    loafer: ['.OO..O.OO', 'O..O..OO.', '.O.O.....', '..O......', '........O', '......OOO', '.....O...', '......O..', '.......OO'],
    pulsar: ['..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............',
      '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
    penta: ['..O....O..', 'OO.OOOO.OO', '..O....O..'],
    rpent: ['.OO', 'OO.', '.O.'],
    acorn: ['.O.....', '...O...', 'OO..OOO'],
    bhept: ['O.OO', 'OOO.', '.O..'],
    pihept: ['OOO', 'O.O', 'O.O'],
    diehard: ['......O.', 'OO......', '.O...OOO'],
    gun: ['........................O...........', '......................O.O...........', '............OO......OO............OO',
      '...........O...O....OO............OO', 'OO........O.....O...OO..............', 'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........', '...........O...O....................', '............OO......................'],
  };
  const cellsOf = (rows) => { const p = []; rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'O') p.push([x, y]); }); return p; };
  const PTS = {};
  for (const k in PAT) PTS[k] = cellsOf(PAT[k]);
  PTS.fleet = [[0, 10], [5, 5], [10, 0]].flatMap(([ox, oy]) => PTS.glider.map(([x, y]) => [x + ox, y + oy])); // three gliders abreast
  // what is dropped, and how often (the gun only on a board with room for its stream)
  const DROPS = [['glider', 13], ['fleet', 7], ['lwss', 8], ['mwss', 6], ['hwss', 5], ['copperhead', 3], ['loafer', 3], ['pulsar', 6],
    ['penta', 5], ['rpent', 7], ['acorn', 4], ['bhept', 4], ['pihept', 4], ['diehard', 3], ['gun', 3]];
  const PV_DROPS = [['glider', 3], ['lwss', 2]];

  /** One of the eight turns / mirror images of a pattern, moved to start at 0, 0. */
  function orient(p, o) {
    const q = p.map(([x, y]) => { let a = o & 1 ? -x : x, b = o & 2 ? -y : y; if (o & 4) [a, b] = [b, a]; return [a, b]; });
    let mx = 1e9, my = 1e9;
    for (const [x, y] of q) { if (x < mx) mx = x; if (y < my) my = y; }
    return q.map(([x, y]) => [x - mx, y - my]);
  }
  function pick(table) {
    let n = 0;
    for (const [, wt] of table) n += wt;
    let r = Math.random() * n;
    for (const [k, wt] of table) if ((r -= wt) < 0) return k;
    return table[0][0];
  }

  /* ---------- the board ---------- */
  const wrap = (v, n) => ((v % n) + n) % n;
  function set(st, x, y) { st.cur[wrap(y, st.gh) * st.gw + wrap(x, st.gw)] = 1; }
  function emptyAt(st, x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++) { const r = wrap(y, st.gh) * st.gw; for (let x = x0; x < x0 + w; x++) if (st.cur[r + wrap(x, st.gw)]) return false; }
    return true;
  }
  /** Set a pattern down, turned any way, somewhere with clear ground round it. */
  function drop(st, name) {
    const p = orient(PTS[name], (Math.random() * 8) | 0), m = st.pv ? 1 : 3;
    let pw = 0, ph = 0;
    for (const [x, y] of p) { if (x >= pw) pw = x + 1; if (y >= ph) ph = y + 1; }
    if (pw + m * 2 > st.gw || ph + m * 2 > st.gh) return false;
    for (let n = 0; n < 16; n++) {
      const x0 = (Math.random() * st.gw) | 0, y0 = (Math.random() * st.gh) | 0;
      if (!emptyAt(st, x0 - m, y0 - m, pw + m * 2, ph + m * 2)) continue;
      for (const [x, y] of p) set(st, x0 + x, y0 + y);
      return true;
    }
    return false;
  }
  /** Sow random soup in a disc, the rings from lo to hi of its radius (thinning towards the edge). */
  function sow(st, cx, cy, r, dens, lo, hi) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / r;
      if (d >= lo && d < hi && Math.random() < dens * (1 - 0.6 * d * d)) set(st, cx + x, cy + y);
    }
  }
  /** Start sowing the quietest region (by births lately): one ring a generation, from the middle out. */
  function startSow(st) {
    const { blk, BX, gw, gh } = st;
    const order = Array.from(blk.keys()).sort((a, b) => blk[a] - blk[b]);
    const k = order[(Math.random() * Math.min(3, order.length)) | 0], bx = k % BX, by = (k / BX) | 0, BY = blk.length / BX;
    const cx = Math.round(((bx + 0.5 + (Math.random() - 0.5) * 0.5) / BX) * gw), cy = Math.round(((by + 0.5 + (Math.random() - 0.5) * 0.5) / BY) * gh);
    const r = st.pv ? Math.ceil(Math.hypot(gw, gh) / 2) : Math.round(Math.min(gw, gh) * (0.15 + Math.random() * 0.08));
    st.sowing = { cx, cy, r, k: 0, n: st.pv ? 1 : 3 };
    st.lastSow = st.gen;
    blk[k] += 60; // and not the same place again straight away
  }

  function geom(st, W, H) {
    const { gw, gh, cs, px, py, vig, bi, BX } = st, BY = st.blk.length / BX;
    const ox = (W - gw * cs) / 2, oy = (H - gh * cs) / 2;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x, X = ox + (x + 0.5) * cs, Y = oy + (y + 0.5) * cs;
      px[i] = X; py[i] = Y;
      bi[i] = Math.min(BX - 1, ((x / gw) * BX) | 0) + Math.min(BY - 1, ((y / gh) * BY) | 0) * BX;
      if (st.pv) { vig[i] = 1; continue; }
      const dx = (X - W / 2) / (W / 2), dy = (Y - H / 2) / (H / 2), q = Math.max(0, Math.min(1, (Math.sqrt(dx * dx + dy * dy) - 0.45) / 0.9));
      vig[i] = 1 - 0.42 * q * q * (3 - 2 * q); // a soft vignette: the corners at a little over half strength
    }
    st.W = W; st.H = H; st.geo = (st.geo || 0) + 1;
  }

  function fresh(gw, gh, cs, pv, W, H, t, seed) {
    const N = gw * gh, BX = pv ? 2 : 6, BY = pv ? 1 : 4;
    const st = {
      kind: 'life', gw, gh, cs, pv, N, gen: 0, genT: t, dur: pv ? 12 : 26, BX,
      prev: new Uint8Array(N), cur: new Uint8Array(N), spare: new Uint8Array(N),
      seen: new Float32Array(N), death: new Int32Array(N).fill(-1e6), gcol: new Uint8Array(N),
      steady: new Int32Array(N), born: new Int32Array(N), died: new Int32Array(N), ghost: new Int32Array(N), bornA: new Float32Array(N),
      ns: 0, nb: 0, nd: 0, ng: 0, pop: 0, nov: 0,
      px: new Float32Array(N), py: new Float32Array(N), vig: new Float32Array(N), bi: new Uint8Array(N), blk: new Float32Array(BX * BY),
      nextDrop: pv ? 14 : 30 + Math.random() * 40, lastSow: 0, sowing: null,
      quiet: pv ? 0.8 : Math.max(2, N * 0.0012), // fewer new births than this a generation: the board has gone still
    };
    geom(st, W, H);
    if (!seed) return st;
    if (pv) { sow(st, gw >> 1, gh >> 1, Math.ceil(Math.hypot(gw, gh) / 2), 0.36, 0, 1.01); drop(st, 'glider'); }
    else {
      // a few patches of soup, and a traveller or two
      for (let n = 0, m = N > 6000 ? 3 : 2; n < m; n++) sow(st, (Math.random() * gw) | 0, (Math.random() * gh) | 0, Math.round(Math.min(gw, gh) * (0.16 + Math.random() * 0.07)), 0.36, 0, 1.01);
      drop(st, Math.random() < 0.5 ? 'fleet' : 'lwss');
      drop(st, pick(DROPS.slice(0, 8)));
    }
    account(st, true);
    return st;
  }
  /** The board on a resized pane with the same cell size: what still fits stays as it was. */
  function remap(o, gw, gh, W, H) {
    const st = fresh(gw, gh, o.cs, o.pv, W, H, o.genT, false);
    for (let y = 0; y < Math.min(gh, o.gh); y++) for (let x = 0; x < Math.min(gw, o.gw); x++) {
      const i = y * gw + x, j = y * o.gw + x;
      st.cur[i] = st.prev[i] = o.cur[j]; st.seen[i] = o.seen[j]; st.death[i] = o.death[j]; st.gcol[i] = o.gcol[j];
    }
    for (const k of ['gen', 'genT', 'dur', 'nextDrop', 'lastSow', 'nov']) st[k] = o[k];
    account(st, false);
    return st;
  }

  /** Sort the cells into steady, born, dying and ghosts; on a step also age them. */
  function account(st, step) {
    const { N, cur, prev, seen, death, gcol, steady, born, died, ghost, bornA, bi, blk, gen } = st;
    let ns = 0, nb = 0, nd = 0, ng = 0, pop = 0, nov = 0;
    if (step) for (let k = 0; k < blk.length; k++) blk[k] *= 0.985;
    for (let i = 0; i < N; i++) {
      let s = seen[i];
      if (cur[i]) {
        pop++;
        if (prev[i]) steady[ns++] = i;
        else {
          born[nb] = i; bornA[nb++] = (1 - s) * (1 - s); // new ground blooms brightest; an oscillator's cells hardly at all
          if (s < 0.3) nov++;
          blk[bi[i]]++;
          if (gen - death[i] <= GHOST) ghost[ng++] = i; // reborn on its own ghost: the ghost fades out under it
        }
        if (step) s += (1 - s) * RATE;
      } else {
        if (prev[i]) { died[nd++] = i; if (step) { death[i] = gen; gcol[i] = bucket(ahead(s)); } }
        if (step) s -= s * RATE;
        if (gen - death[i] <= GHOST) ghost[ng++] = i;
      }
      seen[i] = s;
    }
    st.ns = ns; st.nb = nb; st.nd = nd; st.ng = ng; st.pop = pop;
    if (step) st.nov = st.nov * 0.9 + nov * 0.1;
  }

  /** One generation: B3/S23 on the torus, then whatever is dropped or sown, then the bookkeeping. */
  function advance(st) {
    const { gw, gh } = st, a = st.cur, b = st.spare;
    for (let y = 0; y < gh; y++) {
      const r0 = y * gw, rm = (y ? y - 1 : gh - 1) * gw, rp = (y < gh - 1 ? y + 1 : 0) * gw;
      for (let x = 0; x < gw; x++) {
        const xm = x ? x - 1 : gw - 1, xp = x < gw - 1 ? x + 1 : 0;
        const n = a[rm + xm] + a[rm + x] + a[rm + xp] + a[r0 + xm] + a[r0 + xp] + a[rp + xm] + a[rp + x] + a[rp + xp];
        b[r0 + x] = n === 3 || (n === 2 && a[r0 + x]) ? 1 : 0;
      }
    }
    st.spare = st.prev; st.prev = a; st.cur = b; st.gen++;

    const busy = st.pop > st.N * (st.pv ? 0.32 : 0.2);
    if (st.sowing) {
      const s = st.sowing;
      sow(st, s.cx, s.cy, s.r, 0.36, s.k / s.n, s.k === s.n - 1 ? 1.01 : (s.k + 1) / s.n);
      if (++s.k >= s.n) st.sowing = null;
    } else if (!busy && st.gen - st.lastSow > (st.pv ? 24 : 100) && (st.nov < st.quiet || st.gen - st.lastSow > 750)) startSow(st);
    if (st.gen >= st.nextDrop) {
      if (!busy) {
        let name = pick(st.pv ? PV_DROPS : DROPS);
        if (name === 'gun' && (st.gw < 52 || st.gh < 28)) name = 'glider';
        drop(st, name);
      }
      st.nextDrop = st.gen + (st.pv ? 16 + Math.random() * 18 : 45 + Math.random() * 70);
    }
    account(st, true);
  }

  /* ---------- drawing ---------- */
  /** A round sprite: a radial falloff of one colour; stops [[offset, alpha], …]. */
  function radial(S, c, al, stops) {
    const cv = K.mk(S, S), x = cv.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    for (const [o, a] of stops) g.addColorStop(o, rgba(c, a * al));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return cv;
  }
  /** Dots and ghosts in NB colours from newborn to settled, and the bloom of a birth; per accent and mode (pv: the picker preview, a little stronger). */
  function sprites(L, a0, a1, a2, pv) {
    const key = `life|${L ? 'L' : 'D'}${pv ? 'p' : ''}|${a0}|${a1}|${a2}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const ramp = L
      ? [[0, mix(a2, BLACK, 0.12)], [0.18, mix(a2, BLACK, 0.24)], [0.45, mix(a1, BLACK, 0.28)], [0.75, mix(a0, BLACK, 0.3)], [1, mix(a0, [44, 50, 72], 0.55)]]
      : [[0, mix(a2, WHITE, 0.55)], [0.18, mix(a2, WHITE, 0.1)], [0.45, a1], [0.75, a0], [1, mix(a0, [44, 56, 120], 0.42)]];
    const col = (s) => {
      for (let k = 1; k < ramp.length; k++) if (s <= ramp[k][0]) { const [s0, c0] = ramp[k - 1], [s1, c1] = ramp[k]; return mix(c0, c1, (s - s0) / (s1 - s0)); }
      return ramp[ramp.length - 1][1];
    };
    const DOT = L ? [[0, 1], [0.24, 0.95], [0.33, 0.55], [0.42, 0.14], [0.62, 0.035], [1, 0]] : [[0, 1], [0.16, 0.92], [0.28, 0.55], [0.42, 0.21], [0.7, 0.07], [1, 0]];
    const GH = L ? [[0, 0.55], [0.3, 0.32], [0.56, 0.07], [1, 0]] : [[0, 0.6], [0.3, 0.34], [0.6, 0.08], [1, 0]];
    const base = (L ? 0.58 : 0.42) * (pv ? 1.35 : 1);
    const sp = { dot: [], ghost: [], bloom: null };
    for (let b = 0; b < NB; b++) {
      const s = (b + 0.5) / NB, c = col(s), al = base * (1 - 0.5 * s); // settled cells are quieter as well as cooler
      sp.dot.push(radial(64, c, al, DOT));
      sp.ghost.push(radial(48, L ? mix(c, [120, 130, 160], 0.25) : mix(c, a0, 0.3), base * 0.64, GH));
    }
    sp.bloom = radial(64, L ? col(0.1) : mix(col(0), WHITE, 0.4), L ? 0.28 : 0.42, [[0, 0.75], [0.2, 0.38], [0.5, 0.09], [1, 0]]);
    K.cache.set(key, sp);
    return sp;
  }
  /** A barely-there lattice of the cell centres. */
  function lattice(st, W, H, L, dpr) {
    const [c, x] = K.layer(W, H, dpr), r = Math.max(0.5, st.cs * 0.05);
    x.fillStyle = L ? 'rgb(48,58,90)' : 'rgb(190,200,235)';
    for (let i = 0; i < st.N; i++) { x.globalAlpha = (L ? 0.055 : 0.045) * st.vig[i]; x.fillRect(st.px[i] - r, st.py[i] - r, r * 2, r * 2); }
    return c;
  }

  /** The two layers: A as the board is now, B as it will be a step on. */
  function paint(st, sc, sp, W, H, L) {
    const { cs, px, py, vig, seen, death, gcol, steady, ghost, cur, gen } = st, A = sc.ax, B = sc.bx, d = cs * 2, op = L ? 'source-over' : 'lighter';
    for (const x of [A, B]) { x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H); }
    if (sc.lat) A.drawImage(sc.lat, 0, 0, W, H);
    A.globalCompositeOperation = op;
    for (let k = 0; k < st.ns; k++) { // steady cells whose colour holds through the step: drawn once, then the layer is copied
      const i = steady[k], b0 = bucket(seen[i]);
      if (b0 !== bucket(ahead(seen[i]))) continue;
      A.globalAlpha = vig[i]; A.drawImage(sp.dot[b0], px[i] - cs, py[i] - cs, d, d);
    }
    B.drawImage(sc.a, 0, 0, W, H);
    B.globalCompositeOperation = op;
    for (let k = 0; k < st.ns; k++) {
      const i = steady[k], b0 = bucket(seen[i]), b1 = bucket(ahead(seen[i]));
      if (b0 === b1) continue;
      A.globalAlpha = B.globalAlpha = vig[i];
      A.drawImage(sp.dot[b0], px[i] - cs, py[i] - cs, d, d); B.drawImage(sp.dot[b1], px[i] - cs, py[i] - cs, d, d);
    }
    for (let k = 0; k < st.ng; k++) { // ghosts, a step fainter (and a little wider) in B
      const i = ghost[k], tau = gen - death[i], img = sp.ghost[gcol[i]];
      const ga = ghostA(tau), gb = cur[i] ? 0 : ghostA(tau + 1);
      if (ga > 0.015) { const r = cs * (0.9 + (0.3 * tau) / GHOST); A.globalAlpha = vig[i] * ga; A.drawImage(img, px[i] - r, py[i] - r, r * 2, r * 2); }
      if (gb > 0.015) { const r = cs * (0.9 + (0.3 * (tau + 1)) / GHOST); B.globalAlpha = vig[i] * gb; B.drawImage(img, px[i] - r, py[i] - r, r * 2, r * 2); }
    }
    sc.drawn = gen;
  }

  (window.BG_EXT = window.BG_EXT || {}).life = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.5, 1), { W, H, pv } = V, L = K.light(), dpr = bg.dpr || 1;
    // the cell size grows with the pane, so the board stays within about 9000 cells; the picker preview gets a coarse one
    const cs = pv ? Math.max(3, Math.round(H / 7)) : Math.max(13, Math.ceil(Math.sqrt((W * H) / 9000)));
    const gw = Math.max(5, Math.ceil(W / cs)), gh = Math.max(5, Math.ceil(H / cs));
    let st = bg.st;
    if (!st || st.kind !== 'life' || st.cs !== cs || st.pv !== pv) st = bg.st = fresh(gw, gh, cs, pv, W, H, t, true);
    else if (st.gw !== gw || st.gh !== gh) st = bg.st = remap(st, gw, gh, W, H);
    else if (st.W !== W || st.H !== H) geom(st, W, H);

    const P = pv ? 7 : 12; // frames a generation (~2.5 a second)
    if (t - st.genT >= st.dur || t < st.genT) { advance(st); st.genT = t; st.dur = P; }
    const f = Math.max(0, Math.min(1, (t - st.genT) / st.dur));

    const [a0, a1, a2] = typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]];
    const sp = sprites(L, a0, a1, a2, pv);
    const sc = K.scene(bg, V, () => { const [a, ax] = K.layer(W, H, dpr), [b, bx] = K.layer(W, H, dpr); return { a, ax, b, bx, drawn: -1, sp: null, st: null }; });
    if (sc.st !== st || sc.geo !== st.geo) { sc.st = st; sc.geo = st.geo; sc.lat = pv ? null : lattice(st, W, H, L, dpr); sc.drawn = -1; }
    if (sc.sp !== sp) { sc.sp = sp; sc.drawn = -1; }
    if (sc.drawn !== st.gen) paint(st, sc, sp, W, H, L);

    const { cs: r, px, py, vig, seen } = st;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // an exact crossfade of the two layers
    if (f < 1) { ctx.globalAlpha = 1 - f; ctx.drawImage(sc.a, 0, 0, W, H); }
    if (f > 0) { ctx.globalAlpha = f; ctx.drawImage(sc.b, 0, 0, W, H); }
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    const e = f * f * (3 - 2 * f);
    for (let k = 0, sz = r * (1 - 0.55 * e), d = sz * 2; k < st.nd; k++) { // the dying shrink and fade into their ghosts
      const i = st.died[k];
      ctx.globalAlpha = vig[i] * (1 - e);
      ctx.drawImage(sp.dot[st.gcol[i]], px[i] - sz, py[i] - sz, d, d);
    }
    const g = 1 + 2.1 * (f - 1) ** 3 + 1.1 * (f - 1) ** 2, ga = Math.min(1, 0.15 + f * 1.4); // the newborn swell in, a touch past full size
    for (let k = 0, sz = r * g, d = sz * 2; k < st.nb; k++) {
      const i = st.born[k];
      ctx.globalAlpha = vig[i] * ga;
      ctx.drawImage(sp.dot[bucket(seen[i] + (1 - seen[i]) * RATE)], px[i] - sz, py[i] - sz, d, d);
    }
    // and a bloom of light round them; when many are born at once each gets less, so a new soup never flashes
    const bk = Math.min(1, (pv ? 8 : 40) / Math.max(1, st.nb)) * Math.sin(Math.PI * f) ** 0.6; // a broad swell: the board does not pulse with the generations
    if (bk > 0.01) {
      const sz = r * (1.1 + 0.9 * f), d = sz * 2;
      for (let k = 0; k < st.nb; k++) {
        const a = bk * st.bornA[k] * vig[st.born[k]];
        if (a < 0.015) continue;
        const i = st.born[k];
        ctx.globalAlpha = a;
        ctx.drawImage(sp.bloom, px[i] - sz, py[i] - sz, d, d);
      }
    }
    ctx.restore();
  };
})();
