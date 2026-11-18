'use strict';
/*
 * 구름 위 비행기 창밖: the view from a window seat at dusk. A sea of cloud lies under a sky that runs from the
 * afterglow on the horizon up to deep blue and the first stars, with a few high wisps still catching the light.
 * The cloud drifts past in six bands, the far ones barely moving, the near ones sliding by: each band was rendered
 * once from a height field (heaped cloud with lumpy, cauliflower tops) as seen from above at its own depth, lit by
 * the low sun from the side, its crests catching a rim of light, and is scrolled with wrap. Every few minutes the
 * near cloud breaks up into scattered cumulus for a minute or so and the sea or the land shows far below (a coast,
 * fields, woods, a river, the first town lights), drifting by slowly under heavy haze, then the deck closes again.
 * The left wing reaches in from the lower right with a sheen of sunset along it, flap fairings, rivets and panels,
 * and a winglet; the engine hangs ahead of the inner wing on its pylon, the sky's reflection sliding along its cowl.
 * The red navigation light burns steady on the tip and the white strobe flashes now and then. The aircraft floats a
 * little, banks very slowly, and every minute or so rides a patch of gentle turbulence (the view bobs, the wing and
 * engine flex); once in a long while another aircraft passes far off, its contrail lit by the sun. The rounded window
 * frame is only hinted at in the corners. Every quarter of an hour or so it flies through a cumulonimbus: its tower
 * slides in from ahead, its nearer billows come in after it and overtake it, then the mist closes over everything and
 * most of the wing, the wingtip's lights glow in it, lightning flickers deep in the cloud, rain streaks the window and
 * the ride turns rough; then it thins and tears, the cloud slides away behind and the evening comes back. On a light
 * page it is a clear day: a blue sky, cloud shaded in blue-grey with the page itself for its sunlit tops, blue sea and
 * green land below, the wing and engine in grey metal (and a storm in grey, its lightning a brightening within it).
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('planewindow'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const qb = (a, c, b, t) => { const s = 1 - t; return [s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]; };
  const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

  const HORIZON = 0.48; // of the scene's height
  const SUN_X = 0.7; // where the sun went down, of the width

  /* ---------- the sea of cloud ---------- */

  /*
   * Far → near. f0 / f1: the far and near edge of a band's slab of cloud, as fractions of the sea's depth on screen
   * (0 on the horizon, 1 at the bottom edge); span: texture rows between them; cells: cloud masses across one tile;
   * deep: noise cells through the slab's depth; gx / gy: height-field grid steps across and down (texture px);
   * oct: octaves of puffs; towers: tall heads standing up on the horizon; opens: a break in the cloud opens it up.
   */
  const BANDS = [
    { f0: 0.004, f1: 0.05, span: 18, cells: 120, deep: 22, gx: 1, gy: 2, oct: 2, towers: 3, seed: 11 },
    { f0: 0.035, f1: 0.11, span: 30, cells: 64, deep: 11, gx: 2, gy: 2, oct: 3, towers: 1, seed: 23 },
    { f0: 0.09, f1: 0.2, span: 46, cells: 34, deep: 7, gx: 2, gy: 2, oct: 3, seed: 37, opens: 1 },
    { f0: 0.17, f1: 0.34, span: 70, cells: 19, deep: 5, gx: 2, gy: 2, oct: 3, seed: 41, opens: 1 },
    { f0: 0.3, f1: 0.58, span: 116, cells: 11, deep: 4.2, gx: 2, gy: 3, oct: 4, seed: 53, opens: 1 },
    { f0: 0.52, f1: 1.1, span: 224, cells: 6, deep: 3.6, gx: 4, gy: 3, oct: 4, seed: 67, opens: 1 },
  ];
  const TW = 1600; // texture width of every band: one tile
  const LIFT = 0.17; // the tallest heaps stand this high, as a fraction of their depth below the horizon
  const TOWER = 0.05; // distant towers, as a fraction of the sea's depth
  const SUN_D = norm3(0.85, 0.3, -0.45); // dusk: the sun low on the right, a little ahead (x right, y up, z toward us)
  const SUN_L = norm3(0.4, 0.9, 0.35); // day: high, behind us on the right
  const hazeAt = (f) => 0.62 * Math.exp(-f / 0.07) + 0.14 * Math.exp(-f / 0.3); // how far cloud at depth f has faded into the air

  function lut(stops) {
    const o = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let k = 0;
      while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const [p0, c0] = stops[k], [p1, c1] = stops[k + 1], m = clamp01((v - p0) / (p1 - p0));
      for (let c = 0; c < 3; c++) o[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * m;
    }
    return o;
  }
  // light → colour: shadowed sides in deep blue-violet, the sunlit ones rose and peach, crests gold
  const LUT_D = lut([[0, [38, 44, 82]], [0.34, [80, 78, 122]], [0.6, [158, 112, 136]], [0.8, [236, 154, 128]], [1, [255, 208, 164]]]);
  const HAZE_D = [206, 140, 138]; // the far sea, faded into the afterglow

  /** Rounded puffs, one to a cell (tileable across: cx cells): the height of the tallest cap over (u, v), 0..1. */
  function domes(seed, cx, cy) {
    const R = K.rng(seed), n = cx * cy, px = new Float32Array(n), py = new Float32Array(n), rr = new Float32Array(n), hh = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = R(); py[i] = R(); rr[i] = 0.6 + R() * 0.4; hh[i] = 0.5 + R() * 0.5; }
    return (u, v) => {
      const iu = Math.floor(u), iv = Math.floor(v);
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const cj = iv + dj;
        if (cj < 0 || cj >= cy) continue;
        for (let di = -1; di <= 1; di++) {
          const k = cj * cx + ((((iu + di) % cx) + cx) % cx);
          const dx = iu + di + px[k] - u, dy = cj + py[k] - v, r = rr[k], d2 = (dx * dx + dy * dy) / (r * r);
          if (d2 < 1) { const h = hh[k] * (1 - d2) ** 0.62; if (h > best) best = h; }
        }
      }
      return best;
    };
  }

  /** Where a band's texture puts its slab (cheap: the textures themselves are made a band at a time). */
  function geom(k) {
    const B = BANDS[k], per = B.span / (B.f1 - B.f0), towerH = B.towers ? TOWER * per : 0; // per: texture px per unit of depth
    const yFar = Math.ceil(Math.max(LIFT * B.f0 * per * 1.25, towerH * 1.15)) + 3;
    return { per, towerH, yFar, yNear: yFar + B.span, TH: yFar + B.span + 2 };
  }

  /**
   * A band's height field seen from above at its depth, rendered column by column from near to far (each row of
   * cloud shows only where it rises above the rows in front of it). Per texture pixel: coverage, light at dusk and by
   * day (both with the rim a crest catches), and how hazy with distance it is. Made once, kept for the session; the
   * work pauses (yield) every so often, so it can be spread over frames (see fieldStep).
   */
  function* fieldJob(k) {
    const key = `pwField${k}`;
    const B = BANDS[k], { span, f0, f1, cells, deep, gx, gy, oct } = B, { per, towerH, yFar, yNear, TH } = geom(k);
    const lift = (f) => LIFT * f * per;
    const GX = Math.round(TW / gx), GY = Math.ceil(span / gy) + 1;
    const pyc = Math.ceil(deep + 3);
    const wA = K.fbm(B.seed + 5, cells, pyc, 2), wB = K.fbm(B.seed + 9, cells, pyc, 2), mass = K.fbm(B.seed + 1, cells, pyc, 3);
    const puffs = [];
    for (let o = 0; o < oct; o++) puffs.push(domes(B.seed + 20 + o, cells << o, pyc << o));
    const inv0 = 1 / f0, inv1 = 1 / f1;
    const rowF = new Float32Array(GY), rowV = new Float32Array(GY);
    for (let j = 0; j < GY; j++) { const f = f0 + (f1 - f0) * Math.min(1, (j * gy) / span); rowF[j] = f; rowV[j] = (deep * (1 / f - inv1)) / (inv0 - inv1); }

    // heights (texture px): puffs on puffs, heaped up where the mass of the cloud is, a lumpy deck between
    const Hm = new Float32Array(GX * GY), Bl = new Float32Array(GX * GY), PW = [0.56, 0.3, 0.2, 0.12];
    for (let j = 0; j < GY; j++) {
      const lf = lift(rowF[j]), v0 = rowV[j];
      for (let i = 0; i < GX; i++) {
        const u0 = (i / GX) * cells;
        const uu = u0 + (wA(u0, v0) - 0.5) * 0.9, vv = v0 + (wB(u0, v0) - 0.5) * 0.9;
        const m = sstep(0.34, 0.68, mass(uu, vv));
        let hm = 0, det = 0;
        for (let o = 0; o < oct; o++) {
          const d = puffs[o](uu * (1 << o), (vv + 1) * (1 << o));
          if (o === 0) hm += PW[0] * d * m; else { hm += PW[o] * d * (o === 1 ? 0.25 + 0.75 * m : 0.55 + 0.45 * m); det += d; }
        }
        const p = j * GX + i;
        Bl[p] = oct > 1 ? det / (oct - 1) : 0.5;
        Hm[p] = lf * Math.min(1.15, hm / 0.95);
      }
      yield;
    }
    if (B.towers) { // a few towering heads far off, each a heap of rounded turrets, the tallest in the middle
      const R = K.rng(B.seed * 7 + 3);
      for (let n = 0; n < B.towers; n++) {
        const cx = ((n + 0.2 + R() * 0.6) / B.towers) * GX, cj = GY * (0.15 + R() * 0.35), rx = GX * (0.008 + R() * 0.008) * (k ? 1.6 : 1), th = towerH * (0.45 + R() * 0.55);
        const caps = Array.from({ length: 9 + ((R() * 5) | 0) }, (_, m) => {
          const ox = (m === 0 ? 0 : (R() - 0.5) * 1.7) * rx, rc = rx * (m === 0 ? 0.42 : 0.18 + R() * 0.24);
          return { ox, oj: (R() - 0.5) * GY * 0.2, rc, rj: GY * (0.12 + R() * 0.12), hc: th * (1 - (ox / rx) ** 2 * 0.75) * (m === 0 ? 1 : 0.55 + R() * 0.4) };
        });
        for (const c of caps) {
          const ci = cx + c.ox;
          for (let j = Math.max(0, Math.floor(cj + c.oj - c.rj)); j <= Math.min(GY - 1, Math.ceil(cj + c.oj + c.rj)); j++) {
            for (let di = -Math.ceil(c.rc); di <= Math.ceil(c.rc); di++) {
              const ii = Math.round(ci) + di, d2 = ((ii - ci) / c.rc) ** 2 + ((j - cj - c.oj) / c.rj) ** 2;
              if (d2 >= 1) continue;
              const p = j * GX + (((ii % GX) + GX) % GX);
              Hm[p] = Math.max(Hm[p], c.hc * (1 - d2) ** 0.55 * (0.86 + 0.22 * Bl[p]));
            }
          }
        }
      }
    }

    // light on the grid: wrapped diffuse (cloud lets light round its edges), darker down in the folds
    const LD = new Float32Array(GX * GY), LL = new Float32Array(GX * GY), cellPx = TW / cells;
    for (let j = 0; j < GY; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(GY - 1, j + 1), dz = Math.max(1e-3, (rowV[jm] - rowV[jp]) * cellPx), lf = lift(rowF[j]);
      for (let i = 0; i < GX; i++) {
        const p = j * GX + i;
        const hx = (Hm[j * GX + ((i + 1) % GX)] - Hm[j * GX + ((i + GX - 1) % GX)]) / (2 * gx);
        const hz = (Hm[jp * GX + i] - Hm[jm * GX + i]) / dz;
        const [nx, ny, nz] = norm3(-hx, 1, -hz);
        const ao = 0.42 + 0.58 * clamp01(Hm[p] / (0.62 * lf + 1e-6));
        const dd = clamp01((nx * SUN_D[0] + ny * SUN_D[1] + nz * SUN_D[2] + 0.3) / 1.3);
        const dl = clamp01((nx * SUN_L[0] + ny * SUN_L[1] + nz * SUN_L[2] + 0.3) / 1.3);
        LD[p] = ao * (0.06 + 0.94 * dd * dd);
        LL[p] = (0.08 + 0.92 * ao * (0.16 + 0.84 * dl)) ** 1.25;
      }
      if (j % 8 === 7) yield;
    }

    // seen from above: near rows first, each farther row only where it stands above them. The bands a break in
    // the cloud opens up are rendered a second time as broken cumulus: the heaps alone, the deck between them gone.
    const n = TW * TH, gap = Math.max(2, span * 0.03), gapRef = span * 0.16, rimW = 1 + span * 0.008;
    // the far rows fade into the band behind, which covers the same depth: no hard edge where one band ends
    const ov = k ? clamp01((BANDS[k - 1].f1 - f0) / (f1 - f0)) : 0.35, fadeRow = new Float32Array(span + 1);
    for (let r = 0; r <= span; r++) fadeRow[r] = sstep(0, ov, r / span);
    const fOf = (r) => f0 + ((f1 - f0) * r) / span;
    function* render(broken) {
      const A = new Uint8ClampedArray(n), OD = new Uint8ClampedArray(n), OL = new Uint8ClampedArray(n), DP = new Uint8ClampedArray(n);
      const rowAt = new Int16Array(TH), segD = new Float32Array(TH), segL = new Float32Array(TH), segK = new Float32Array(TH), cov = new Float32Array(TH);
      for (let x = 0; x < TW; x++) {
        const gxf = x / gx, gi = Math.floor(gxf), i0 = gi % GX, i1 = (i0 + 1) % GX, fx = gxf - gi;
        cov.fill(0); segD.fill(0); segL.fill(0); segK.fill(0);
        let ymin = TH;
        for (let yy = span; yy >= 0; yy--) {
          const gyf = yy / gy, j0 = Math.min(GY - 1, Math.floor(gyf)), j1 = Math.min(GY - 1, j0 + 1), fy = gyf - j0;
          const p00 = j0 * GX + i0, p01 = j0 * GX + i1, p10 = j1 * GX + i0, p11 = j1 * GX + i1;
          const hh = (Hm[p00] * (1 - fx) + Hm[p01] * fx) * (1 - fy) + (Hm[p10] * (1 - fx) + Hm[p11] * fx) * fy;
          const top = yFar + yy - hh, pt = Math.max(0, Math.floor(top)), lf = lift(fOf(yy));
          let pb = Math.min(TH, ymin + 1), soft = 1; // down to the top pixel of the cloud in front, which this may show through
          if (broken) { // only the heaps, on flat bases at a common level: a heap shrinks to nothing at its edge
            const base = 0.36 * lf;
            if (hh < base + 0.6) continue;
            soft = sstep(0, 0.12 * lf + 0.5, hh - base); pb = Math.min(TH, Math.floor(yFar + yy - base) + 1);
          } else if (pt >= ymin) continue;
          const d = (LD[p00] * (1 - fx) + LD[p01] * fx) * (1 - fy) + (LD[p10] * (1 - fx) + LD[p11] * fx) * fy;
          const l = (LL[p00] * (1 - fx) + LL[p01] * fx) * (1 - fy) + (LL[p10] * (1 - fx) + LL[p11] * fx) * fy;
          const run = Math.max(3, lf * 0.5); // down a tall face the light falls off toward its foot
          for (let py = pt; py < pb; py++) { // laid behind what is already there (front to back)
            const w = (1 - cov[py]) * (py === pt ? clamp01(pt + 1 - top) : 1) * soft * (broken ? clamp01((pb - py) / 2.5) : 1); // a heap's flat base, softly
            if (w <= 0.002) continue;
            if (!cov[py]) rowAt[py] = yy;
            segD[py] += w * d; segL[py] += w * l; segK[py] += w * (1 - 0.34 * Math.min(1, (py - pt) / run)); cov[py] += w;
          }
          if (!broken) ymin = pt;
        }
        // a crest standing in front of cloud farther back catches a rim of light along its edge
        let crest = 0, cs = 0, prev = 0, open = true;
        for (let py = 0; py < TH; py++) {
          const c = cov[py];
          if (c <= 0) { open = true; continue; }
          const r = rowAt[py];
          if (open) { crest = py; cs = 0.85 * clamp01((yFar + r - py) / (0.7 * lift(fOf(r)) + 0.5)); }
          else if (r - prev > gap) { const sg = clamp01((r - prev) / gapRef); if (sg > cs * Math.exp(-(py - crest) / rimW)) { crest = py; cs = sg; } }
          open = false; prev = r;
          const rim = cs * Math.exp(-(py - crest) / rimW), o = py * TW + x;
          const sd = segD[py] / c, sl = segL[py] / c, sk = segK[py] / c;
          A[o] = 255 * c * fadeRow[r];
          OD[o] = 255 * clamp01(sd * sk + rim * 0.5 * (0.35 + sd));
          OL[o] = 255 * clamp01(sl * (0.6 + 0.4 * sk) + rim * 0.12);
          DP[o] = 255 * hazeAt(fOf(r));
        }
        if (x % 32 === 31) yield;
      }
      // soften the light a pixel or two (steep faces and crests come out of the columns a little streaked)
      const tD = new Float32Array(n), tL = new Float32Array(n);
      for (let q = k < 3 ? 1 : 2; q > 0; q--) {
        for (let y = 0, o = 0; y < TH; y++, o += TW) { // across (the tile wraps)
          for (let x = 0; x < TW; x++) {
            const c = o + x, l = x ? c - 1 : o + TW - 1, r = x < TW - 1 ? c + 1 : o, wl = A[l], wc = A[c] * 2, wr = A[r], ws = wl + wc + wr;
            if (!ws) continue;
            tD[c] = (OD[l] * wl + OD[c] * wc + OD[r] * wr) / ws; tL[c] = (OL[l] * wl + OL[c] * wc + OL[r] * wr) / ws;
          }
          if (y % 16 === 15) yield;
        }
        for (let c = 0; c < n; c++) { // down
          const u0 = c >= TW ? c - TW : c, d0 = c < n - TW ? c + TW : c, wu = A[u0], wc = A[c] * 2, wd = A[d0], ws = wu + wc + wd;
          if (!ws) continue;
          OD[c] = (tD[u0] * wu + tD[c] * wc + tD[d0] * wd) / ws; OL[c] = (tL[u0] * wu + tL[c] * wc + tL[d0] * wd) / ws;
          if (c % (TW * 16) === TW * 16 - 1) yield;
        }
      }
      return { A, OD, OL, DP };
    }
    const F = yield* render(false);
    F.brk = B.opens ? yield* render(true) : null;
    Object.assign(F, { TH, yFar, yNear });
    K.cache.set(key, F);
  }
  const jobs = new Map();
  /** Work on band k's field for up to `ms` milliseconds; true once it is made. */
  function fieldStep(k, ms) {
    if (K.cache.has(`pwField${k}`)) return true;
    let g = jobs.get(k);
    if (!g) jobs.set(k, (g = fieldJob(k)));
    const t0 = performance.now();
    do { if (g.next().done) { jobs.delete(k); return true; } } while (performance.now() - t0 < ms);
    return false;
  }
  function field(k) { fieldStep(k, Infinity); return K.cache.get(`pwField${k}`); }

  /**
   * A band as a texture (kept for the session). 'D': in colour, for a dark page (haze laid over it); 'L': for a light
   * page, the shade in blue-grey ink, its alpha how deep the shade is (a faint blue over the sunlit tops, bluer and
   * hazier with distance), so the brightest cloud is the page itself (white would whiten a cream or tinted page);
   * 'M': its coverage, which clears what lies behind it. A trailing 'b': the broken cumulus of a break in the cloud.
   */
  function bandTex(k, kind) {
    const key = `pwBand${k}${kind}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const F0 = field(k), F = kind[1] === 'b' ? F0.brk : F0, c = K.mk(TW, F0.TH), x = c.getContext('2d'), img = x.createImageData(TW, F0.TH), d = img.data;
    for (let p = 0, n = TW * F0.TH; p < n; p++) {
      const a = F.A[p];
      if (!a) continue;
      const o = p * 4, hk = F.DP[p] / 255;
      if (kind[0] === 'M') { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a; }
      else if (kind[0] === 'D') { const l = F.OD[p] * 3; d[o] = LUT_D[l] + (HAZE_D[0] - LUT_D[l]) * hk; d[o + 1] = LUT_D[l + 1] + (HAZE_D[1] - LUT_D[l + 1]) * hk; d[o + 2] = LUT_D[l + 2] + (HAZE_D[2] - LUT_D[l + 2]) * hk; d[o + 3] = a; }
      else {
        const l = F.OL[p] / 255, h = Math.min(1, hk * 1.3), sh = clamp01((1 - l) * 1.5);
        d[o] = 52 + 92 * l + (150 - 52 - 92 * l) * h; d[o + 1] = 84 + 88 * l + (184 - 84 - 88 * l) * h; d[o + 2] = 150 + 66 * l + (232 - 150 - 66 * l) * h;
        d[o + 3] = a * Math.max(sh * (1 - 0.45 * h), 0.12 + 0.4 * h);
      }
    }
    x.putImageData(img, 0, 0);
    K.cache.set(key, c);
    return c;
  }
  /** Halved `lv` times (a picker preview shrinks the bands far below their size: without this they would shimmer). */
  function bandMip(k, kind, lv) {
    if (!lv) return bandTex(k, kind);
    const key = `pwBand${k}${kind}m${lv}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const src = bandMip(k, kind, lv - 1), c = K.mk(Math.ceil(src.width / 2), Math.ceil(src.height / 2));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    K.cache.set(key, c);
    return c;
  }

  /* ---------- the surface far below ---------- */

  /*
   * The sea or the land some ten kilometres down, seen where a break in the cloud opens: much farther off than the
   * cloud at the same height on screen, so it drifts by several times more slowly. A few bands at their depths, far
   * to near, like the cloud; each fades at its far edge into the band behind. Heavy blue haze toward the horizon.
   */
  const GBANDS = [{ f0: 0.07, f1: 0.22, th: 44 }, { f0: 0.18, f1: 0.48, th: 88 }, { f0: 0.42, f1: 1.12, th: 190 }];
  const GW = 1024, GROUND_FAR = 4.5;
  const GPAL = {
    D: { sea: [22, 34, 60], seaHi: [44, 58, 92], surf: [100, 106, 128], beach: [72, 66, 64], fields: [[36, 42, 32], [46, 46, 34], [32, 40, 36], [52, 46, 38], [40, 44, 30]], hedge: [22, 26, 22], forest: [18, 26, 21], river: [120, 110, 150], road: [78, 72, 76], town: [54, 50, 58], light: [255, 198, 124], haze: [100, 94, 134], a: 0.85 },
    L: { sea: [36, 96, 170], seaHi: [72, 134, 200], surf: [226, 234, 242], beach: [224, 212, 176], fields: [[118, 160, 84], [152, 172, 92], [190, 172, 106], [98, 142, 72], [172, 154, 98], [134, 166, 96]], hedge: [80, 114, 62], forest: [60, 102, 64], river: [70, 142, 212], road: [196, 186, 166], town: [170, 162, 152], light: [170, 162, 152], haze: [174, 202, 236], a: 0.62 },
  };
  let cellEdge = 0;
  /** Field patchwork: the nearest of a jittered grid of points (tileable across: cx cells); cellEdge: how near a border. */
  function fieldsFn(seed, cx, cy) {
    const R = K.rng(seed), n = cx * cy, px = new Float32Array(n), py = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = 0.1 + R() * 0.8; py[i] = 0.1 + R() * 0.8; }
    return (u, v) => {
      const iu = Math.floor(u), iv = Math.floor(v);
      let d1 = 9, d2 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const k = ((((iv + dj) % cy) + cy) % cy) * cx + ((((iu + di) % cx) + cx) % cx);
        const dx = iu + di + px[k] - u, dy = iv + dj + py[k] - v, dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; id = k; } else if (dd < d2) d2 = dd;
      }
      cellEdge = Math.sqrt(d2) - Math.sqrt(d1);
      return id;
    };
  }
  /** The surface below as band textures for a dark or light page: 'sea' (open water) or 'land' (a coast, fields, woods, a river, roads, towns). */
  function* groundJob(kind, L) {
    const C = GPAL[L ? 'L' : 'D'], out = [];
    for (let g = 0; g < GBANDS.length; g++) {
      const G = GBANDS[g], fm = (G.f0 + G.f1) / 2, Pu = Math.max(2, Math.round((3 * GW * (G.f1 - G.f0)) / (G.th * fm)));
      const per = (k) => Math.max(1, Math.round(Pu * k));
      const coast = K.fbm(301, per(0.25), 16, 4), wood = K.fbm(311, per(1), 48, 3), river = K.fbm(321, per(0.35), 24, 3), road = K.fbm(331, per(0.5), 24, 2);
      const town = K.fbm(341, per(0.8), 48, 3), shade = K.fbm(351, per(0.5), 24, 3), swell = K.fbm(361, per(4), 96, 3), fields = fieldsFn(371, per(4.5), 512);
      const ov = g ? clamp01((GBANDS[g - 1].f1 - G.f0) / (G.f1 - G.f0)) : 0.4;
      const c = K.mk(GW, G.th), x = c.getContext('2d'), img = x.createImageData(GW, G.th), d = img.data;
      for (let y = 0; y < G.th; y++) {
        const q = (y + 0.5) / G.th, f = G.f0 + (G.f1 - G.f0) * q, v = 5.1 / f, hz = clamp01(1.02 * Math.exp(-f / 0.17) + 0.06), al = C.a * sstep(0, ov, q);
        for (let xx = 0; xx < GW; xx++) {
          const u = xx / GW;
          let col;
          const cst = kind === 'sea' ? 0 : coast(u * per(0.25), v * 0.22);
          if (cst < 0.42) { // water: long swells catching the sky, a line of surf along a coast
            col = mix(C.sea, C.seaHi, 0.6 * sstep(0.42, 0.78, swell(u * per(4), (v * 2.4) % 96)));
            if (cst > 0.395) col = mix(col, C.surf, sstep(0.395, 0.42, cst) * 0.8);
          } else if (cst < 0.44) col = C.beach;
          else {
            const id = fields(u * per(4.5), (v * 4.2) % 512), e = cellEdge;
            col = mix(C.fields[id % C.fields.length], C.fields[(id >> 3) % C.fields.length], 0.35);
            col = mix(col, C.hedge, e < 0.05 ? 0.45 : 0);
            if (wood(u * per(1), (v * 0.9) % 48) > 0.58) col = C.forest;
            const tw = town(u * per(0.8), (v * 0.7) % 48);
            if (tw > 0.66) { col = C.town; if (!L && (((xx * 73856093) ^ (y * 19349663)) >>> 0) % 997 < 260 * (tw - 0.64)) col = C.light; } // the first lights coming on
            if (Math.abs(road(u * per(0.5), (v * 0.5) % 24) - 0.5) < 0.006) col = mix(col, C.road, 0.8);
            if (Math.abs(river(u * per(0.35), (v * 0.35) % 24) - 0.5) < 0.011) col = C.river;
          }
          if (col !== C.light) { const sh = shade(u * per(0.5), (v * 0.45) % 24); if (sh > 0.58) col = mix(col, [0, 0, 0], L ? 0.2 : 0.3); } // the shadows of clouds
          col = mix(col, C.haze, hz);
          const o = (y * GW + xx) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255 * al;
        }
        if (y % 3 === 2) yield;
      }
      x.putImageData(img, 0, 0);
      out.push(c);
      yield;
    }
    K.cache.set(`pwGround${kind}${L ? 'L' : 'D'}`, out);
  }
  const gjobs = new Map();
  /** Work on the surface textures for up to `ms` milliseconds; the textures once they are made, else null. */
  function groundStep(kind, L, ms) {
    const key = `pwGround${kind}${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    let g = gjobs.get(key);
    if (!g) gjobs.set(key, (g = groundJob(kind, L)));
    const t0 = performance.now();
    do { if (g.next().done) { gjobs.delete(key); return K.cache.get(key); } } while (performance.now() - t0 < ms);
    return null;
  }

  /* ---------- sprites ---------- */

  function radial(key, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    K.cache.set(key, c);
    return c;
  }
  const navGlow = (L) => radial(`pwNav${L ? 'L' : 'D'}`, L
    ? [[0, 'rgba(214,40,36,0.9)'], [0.12, 'rgba(214,40,36,0.45)'], [0.4, 'rgba(214,40,36,0.1)'], [1, 'rgba(214,40,36,0)']]
    : [[0, 'rgba(255,214,206,1)'], [0.08, 'rgba(255,70,56,0.85)'], [0.3, 'rgba(255,56,44,0.22)'], [0.65, 'rgba(255,50,40,0.05)'], [1, 'rgba(255,50,40,0)']]);
  const strobeGlow = () => radial('pwStrobe', [[0, 'rgba(255,255,255,1)'], [0.06, 'rgba(240,246,255,0.8)'], [0.22, 'rgba(220,232,255,0.22)'], [0.55, 'rgba(210,224,255,0.05)'], [1, 'rgba(210,224,255,0)']]);
  const strobeDay = () => radial('pwStrobeL', [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(236,244,255,0.9)'], [0.28, 'rgba(150,182,236,0.28)'], [0.6, 'rgba(150,182,236,0.06)'], [1, 'rgba(150,182,236,0)']]);
  const warmDot = () => radial('pwWarm', [[0, 'rgba(255,214,176,1)'], [0.45, 'rgba(255,190,150,0.45)'], [1, 'rgba(255,170,130,0)']]);
  /** A smooth ramp, clear on the left to col on the right (stretched over the soft side of a slice of murk). */
  function ramp(col) {
    const key = `pwRamp${col}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(256, 4), x = c.getContext('2d'), img = x.createImageData(256, 4);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 256; i++) { const o = (j * 256 + i) * 4, t = i / 255; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255 * t * t * (3 - 2 * t); }
    x.putImageData(img, 0, 0);
    K.cache.set(key, c);
    return c;
  }
  const softDot = () => radial('pwSoft', [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);

  /* ---------- the still scenery ---------- */

  function build(bg, V, w, h) {
    const { W, H, u, pv } = V, L = K.light(), q = bg.dpr || 1, R = K.rng(9127);
    const yh = Math.round(H * HORIZON), D = H - yh, sunX = W * SUN_X;
    const mx = Math.ceil(W * 0.03) + 4, my = Math.ceil(H * 0.075) + 4; // room for the view to bob and tilt (in a storm, a lot)

    // the sky: afterglow on the horizon, deep blue above, the first stars (a bright clear day on a light page)
    const [sky, sc] = K.layer(W + mx * 2, yh + my * 2, q);
    sc.translate(mx, my);
    const g = sc.createLinearGradient(0, -my, 0, yh);
    if (L) { g.addColorStop(0, 'rgba(26,98,212,0.44)'); g.addColorStop(0.3, 'rgba(48,122,222,0.32)'); g.addColorStop(0.62, 'rgba(98,160,232,0.17)'); g.addColorStop(0.86, 'rgba(150,192,238,0.11)'); g.addColorStop(1, 'rgba(184,212,240,0.1)'); }
    else { g.addColorStop(0, 'rgba(30,52,142,0.16)'); g.addColorStop(0.38, 'rgba(50,58,152,0.11)'); g.addColorStop(0.64, 'rgba(118,78,152,0.1)'); g.addColorStop(0.81, 'rgba(214,102,128,0.12)'); g.addColorStop(0.93, 'rgba(255,136,100,0.19)'); g.addColorStop(1, 'rgba(255,180,128,0.28)'); }
    sc.fillStyle = g; sc.fillRect(-mx, -my, W + mx * 2, yh + my * 2);
    if (!L) {
      K.glow(sc, sunX, yh, W * 0.46, [[0, 'rgba(255,198,140,0.24)'], [0.25, 'rgba(255,160,110,0.12)'], [0.6, 'rgba(240,130,110,0.04)'], [1, 'rgba(240,130,110,0)']], 1, 0.34);
      K.glow(sc, sunX, yh, W * 0.12, [[0, 'rgba(255,230,184,0.26)'], [1, 'rgba(255,214,160,0)']], 1, 0.28);
    } else { // the glare of a high sun: the blue gives way to the page
      sc.globalCompositeOperation = 'destination-out';
      K.glow(sc, W * 0.92, -my, W * 0.42, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']], 1, 0.7);
      sc.globalCompositeOperation = 'source-over';
    }
    const twinkle = [];
    if (!L) {
      const n = Math.round(pv ? 14 : Math.min(300, ((W * yh) / 40000) * 10));
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() ** 1.5 * yh * 0.84, near = Math.exp(-(((x - sunX) / (W * 0.3)) ** 2)) * (y / yh);
        const a = (0.1 + R() * 0.38) * (1 - y / (yh * 0.92)) ** 0.8 * (1 - 0.8 * near);
        if (a < 0.03) continue;
        sc.fillStyle = rgba(R() < 0.18 ? [255, 226, 200] : [218, 228, 255], a);
        sc.beginPath(); sc.arc(x, y, (0.35 + R() * 0.5) * (pv ? 0.7 : 1), 0, TAU); sc.fill();
      }
      for (let i = 0; i < (pv ? 3 : 16); i++) {
        const x = R() * W, y = R() ** 1.7 * yh * 0.6;
        if (Math.abs(x - sunX) < W * 0.12) continue;
        twinkle.push({ x, y, r: (0.6 + R() * 0.5) * (pv ? 0.7 : 1), a: 0.28 + R() * 0.3, ph: R() * TAU, sp: 0.012 + R() * 0.025 });
      }
      const vx = sunX - W * 0.15, vy = yh * 0.44; // the evening star, low over the afterglow
      K.glow(sc, vx, vy, u * 0.014 * (pv ? 0.6 : 1), [[0, 'rgba(255,244,224,0.2)'], [1, 'rgba(255,244,224,0)']]);
      sc.fillStyle = 'rgba(255,248,236,0.78)'; sc.beginPath(); sc.arc(vx, vy, pv ? 0.6 : 1.15, 0, TAU); sc.fill();
    }

    // the cloud bands, set at their depths (the textures are made a few milliseconds a frame: see ready())
    const bands = BANDS.map((B, k) => {
      const G = geom(k), s = ((B.f1 - B.f0) * D) / B.span, lv = Math.max(0, Math.min(3, Math.floor(Math.log2(0.7 / s))));
      return { k, lv, opens: !!B.opens, tex: null, mask: null, texB: null, maskB: null, s: s * (1 << lv), ry: yh + B.f0 * D - G.yFar * s, rh: G.TH * s, tw: TW * s, sp: 1.3 * (u / 700) * ((B.f0 + B.f1) / 2) * (pv ? 2.5 : 1), a: L ? 0.66 + k * 0.03 : 0.5 + k * 0.02 };
    });

    // the surface far below (seen only when the cloud breaks)
    const gbands = GBANDS.map((G) => { const s = ((G.f1 - G.f0) * D) / G.th; return { s, ry: yh + G.f0 * D, rh: G.th * s, tw: GW * s, sp: (1.3 * (u / 700) * ((G.f0 + G.f1) / 2) * (pv ? 2.5 : 1)) / GROUND_FAR }; });

    const wingP = wingLayer(V, yh, q, L);
    const frame = frameLayer(w, h, q, L, pv);
    return { yh, D, mx, my, sky, twinkle, bands, gbands, ready: false, ...wingP, frame, sunX };
  }

  /**
   * The left wing, seen from a seat just ahead of it: it reaches out from the lower right and sweeps back to the
   * tip, flexed up a little in flight; slats along the leading edge, spoilers and flaps along the trailing one, flap
   * fairings standing out behind it, a winglet on the tip. Dusk lays a sheen along the upper surface.
   */
  function wingLayer(V, yh, q, L) {
    const { W, H, u, pv } = V, D = H - yh;
    const P = (x, y) => [x * W, yh + y * D];
    const RL = P(1.1, 0.86), CL = P(0.63, 0.63), TL = P(0.212, 0.285); // the leading edge, root → tip
    const RT = P(0.6, 1.25), CT = P(0.39, 0.83), TT = P(0.16, 0.352); // the trailing edge
    const LE = (s) => qb(RL, CL, TL, s), TE = (s) => qb(RT, CT, TT, s);
    const at = (s, c) => lerp2(LE(s), TE(s), c);
    const WL = P(0.177, 0.075), WT = P(0.159, 0.09); // the top of the winglet

    const bx = Math.floor(W * 0.12), by = Math.floor(yh - D * 0.08), bw = W + 6 - bx, bh = H + 6 - by;
    const [c, x] = K.layer(bw, bh, q);
    x.translate(-bx, -by);
    const lw = (v) => Math.max(pv ? 0.35 : 0.6, v);
    const ink = L
      ? { body: [116, 124, 140], aft: [96, 104, 120], le: [196, 202, 214], edge: [244, 246, 250], sheen: [168, 178, 194], line: [48, 54, 68], fair: [104, 112, 128], hi: [204, 210, 220], wl: [110, 118, 134], refl: [0, 0, 0] }
      : { body: [24, 27, 38], aft: [13, 15, 22], le: [92, 66, 62], edge: [220, 154, 114], sheen: [132, 90, 82], line: [52, 56, 74], fair: [28, 30, 42], hi: [100, 76, 72], wl: [20, 22, 33], refl: [70, 80, 116] };

    const N = 56, poly = (pts) => { const p = new Path2D(); pts.forEach((v, i) => (i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1]))); p.closePath(); return p; };
    const span = (f, a = 0, b = 1) => Array.from({ length: N + 1 }, (_, i) => f(a + ((b - a) * i) / N));
    const strip = (c0, c1, s0 = 0, s1 = 1) => poly([...span((s) => at(s, c0), s0, s1), ...span((s) => at(s, c1), s0, s1).reverse()]);
    const wing = poly([...span(LE), ...span(TE).reverse()]);

    // the fairings over the flap tracks first: their tails stand out behind the trailing edge
    const fairings = [0.3, 0.46, 0.61].map((s) => {
      const a = at(s, 0.8), b = at(s, 1.13), m = lerp2(a, b, 0.5), cl = Math.hypot(TE(s)[0] - LE(s)[0], TE(s)[1] - LE(s)[1]);
      const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy), nx = -dy / dl, ny = dx / dl, wd = cl * 0.026;
      const e = at(s, 1), p = new Path2D(); // a pod: full where it passes the trailing edge, tapering to a rounded point
      p.moveTo(a[0] + nx * wd * 0.5, a[1] + ny * wd * 0.5); p.lineTo(e[0] + nx * wd, e[1] + ny * wd);
      p.quadraticCurveTo(b[0] + nx * wd * 0.5, b[1] + ny * wd * 0.5, b[0], b[1]);
      p.quadraticCurveTo(b[0] - nx * wd * 0.5, b[1] - ny * wd * 0.5, e[0] - nx * wd, e[1] - ny * wd);
      p.lineTo(a[0] - nx * wd * 0.5, a[1] - ny * wd * 0.5); p.closePath();
      return { p, a, b, m: e, nx, ny, wd };
    });
    for (const f of fairings) { x.fillStyle = rgba(ink.fair, 1); x.fill(f.p); }

    // the upper surface: lighter toward the leading edge, where it mirrors the bright horizon
    const g0 = x.createLinearGradient(...at(0.55, 0), ...at(0.55, 1));
    g0.addColorStop(0, rgba(mix(ink.body, ink.le, 0.2), 1)); g0.addColorStop(0.5, rgba(ink.body, 1)); g0.addColorStop(1, rgba(ink.aft, 1));
    x.fillStyle = g0; x.fill(wing);
    x.save(); x.clip(wing);
    // the sheen of the sunset (of the sky by day), strongest out toward the tip
    const gs = x.createLinearGradient(...at(0.25, 0.4), ...at(1, 0.4));
    gs.addColorStop(0, rgba(ink.sheen, 0)); gs.addColorStop(0.5, rgba(ink.sheen, L ? 0.12 : 0.13)); gs.addColorStop(1, rgba(ink.sheen, L ? 0.22 : 0.24));
    x.fillStyle = gs;
    for (let i = 1; i <= 7; i++) x.fill(strip(0.3 - i * 0.03, 0.3 + i * 0.045, 0.18, 1));
    // the curve of the aerofoil behind the leading edge mirrors the sky (by day a bright streak: the ink thins to the page)
    const streak = (g) => { x.fillStyle = g; for (let i = 1; i <= 5; i++) x.fill(strip(0.2 - i * 0.02, 0.2 + i * 0.022, 0, 0.97)); };
    const gc = x.createLinearGradient(...at(0.05, 0.2), ...at(1, 0.2));
    if (L) { gc.addColorStop(0, 'rgba(0,0,0,0.05)'); gc.addColorStop(0.45, 'rgba(0,0,0,0.14)'); gc.addColorStop(1, 'rgba(0,0,0,0.08)'); }
    else { gc.addColorStop(0, rgba(ink.refl, 0.08)); gc.addColorStop(0.5, rgba(ink.refl, 0.16)); gc.addColorStop(1, rgba(ink.refl, 0.1)); streak(gc); }
    // aft of the spar the surface falls away from the light
    x.fillStyle = rgba(ink.aft, L ? 0.12 : 0.2); x.fill(strip(0.5, 0.79, 0, 1));
    // the leading edge: the slats' rounded nose catching the light
    const gl = x.createLinearGradient(...LE(0.1), ...LE(1));
    gl.addColorStop(0, rgba(ink.le, 0.55)); gl.addColorStop(0.7, rgba(ink.le, 0.85)); gl.addColorStop(1, rgba(ink.le, 0.95));
    x.fillStyle = gl; x.fill(strip(0, 0.075));
    x.fillStyle = rgba(ink.le, 0.35); x.fill(strip(0.075, 0.11));
    // panel lines: the slats' edge, the spoilers, the flaps and the aileron, a few joints across
    x.strokeStyle = rgba(ink.line, L ? 0.55 : 0.8); x.lineWidth = lw(u * 0.0012);
    const along = (cc, s0, s1) => { x.beginPath(); span((s) => at(s, cc), s0, s1).forEach((v, i) => (i ? x.lineTo(v[0], v[1]) : x.moveTo(v[0], v[1]))); x.stroke(); };
    const across = (s, c0, c1) => { const a = at(s, c0), b = at(s, c1); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
    along(0.11, 0, 0.97); along(0.6, 0.02, 0.6); along(0.76, 0.02, 0.6); along(0.79, 0, 0.92);
    for (const s of [0.12, 0.24, 0.36, 0.48, 0.6]) across(s, 0.6, 0.76);
    for (const s of [0.2, 0.42, 0.66, 0.92]) across(s, 0.79, 1);
    for (const s of [0.16, 0.33, 0.52, 0.72, 0.88]) across(s, 0, 0.11);
    x.strokeStyle = rgba(ink.line, L ? 0.3 : 0.45); x.lineWidth = lw(u * 0.0009);
    along(0.34, 0.05, 0.95);
    for (const s of [0.22, 0.4, 0.56, 0.74]) across(s, 0.11, 0.6);
    // access panels over the inner wing
    x.strokeStyle = rgba(ink.line, L ? 0.4 : 0.55); x.lineWidth = lw(u * 0.0008);
    for (const [s0, s1, c0, c1] of [[0.05, 0.09, 0.36, 0.45], [0.15, 0.18, 0.37, 0.46], [0.26, 0.29, 0.35, 0.43], [0.4, 0.42, 0.37, 0.44], [0.1, 0.13, 0.66, 0.72]]) {
      x.beginPath(); [at(s0, c0), at(s1, c0), at(s1, c1), at(s0, c1)].forEach((v, i) => (i ? x.lineTo(v[0], v[1]) : x.moveTo(v[0], v[1]))); x.closePath(); x.stroke();
    }
    // rows of rivets along the spars, close together near us and running out with the wing
    x.fillStyle = rgba(ink.line, L ? 0.45 : 0.7);
    const rv = Math.max(pv ? 0.25 : 0.45, u * 0.0006);
    for (const cc of [0.16, 0.59]) {
      let last = null;
      for (let i = 0; i <= 400; i++) {
        const pt = at((0.9 * i) / 400, cc);
        if (last && Math.hypot(pt[0] - last[0], pt[1] - last[1]) < u * 0.009) continue;
        last = pt; x.beginPath(); x.arc(pt[0], pt[1], rv, 0, TAU); x.fill();
      }
    }
    x.restore();
    // the leading edge itself, a thin bright line; the trailing edge a shade darker
    x.lineCap = 'butt'; // pieces of different width: round ends would overlap into a row of dots
    for (let i = 0; i < N; i++) {
      const s = i / N, a = LE(s), b = LE((i + 1) / N);
      x.strokeStyle = rgba(ink.edge, (L ? 0.75 : 0.5) * (0.4 + 0.6 * s)); x.lineWidth = lw(u * (0.0026 - 0.0016 * s));
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    x.lineCap = 'round';
    x.strokeStyle = rgba(ink.aft, 0.9); x.lineWidth = lw(u * 0.0016);
    x.beginPath(); span(TE).forEach((v, i) => (i ? x.lineTo(v[0], v[1]) : x.moveTo(v[0], v[1]))); x.stroke();
    // the fairings' tops catch a line of light
    for (const f of fairings) {
      x.strokeStyle = rgba(ink.hi, L ? 0.7 : 0.6); x.lineWidth = lw(u * 0.001);
      x.beginPath(); x.moveTo(f.m[0] + f.nx * f.wd * 0.7, f.m[1] + f.ny * f.wd * 0.7); x.quadraticCurveTo(f.b[0] + f.nx * f.wd * 0.45, f.b[1] + f.ny * f.wd * 0.45, f.b[0], f.b[1]); x.stroke();
    }
    // static wicks near the tip
    x.strokeStyle = rgba(ink.line, 0.9); x.lineWidth = lw(u * 0.0008);
    for (const s of [0.84, 0.9, 0.95]) { const a = at(s, 1), b = at(s, 1.09); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }

    // the winglet, rising from the tip and swept back
    const wlLE = (p) => { p.moveTo(TL[0], TL[1]); p.bezierCurveTo(...P(0.198, 0.272), ...P(0.181, 0.19), WL[0], WL[1]); }; // carries on from the wing's edge, then turns up
    const wl = new Path2D();
    wlLE(wl);
    wl.quadraticCurveTo(...P(0.166, 0.072), WT[0], WT[1]);
    wl.bezierCurveTo(...P(0.158, 0.2), ...P(0.157, 0.3), TT[0], TT[1]);
    wl.closePath();
    const gw = x.createLinearGradient(...P(0.2, 0.3), ...P(0.17, 0.08));
    gw.addColorStop(0, rgba(ink.wl, 1)); gw.addColorStop(1, rgba(mix(ink.wl, ink.sheen, 0.3), 1));
    x.fillStyle = gw; x.fill(wl);
    x.save(); x.clip(wl);
    x.strokeStyle = rgba(ink.edge, L ? 0.7 : 0.45); x.lineWidth = lw(u * 0.0022); // its leading edge in the light
    x.beginPath(); wlLE(x); x.stroke();
    x.restore();
    x.strokeStyle = rgba(ink.line, 0.6); x.lineWidth = lw(u * 0.0009); // where it joins the wing
    x.beginPath(); x.moveTo(...lerp2(TL, TT, 0.1)); x.quadraticCurveTo(...P(0.185, 0.335), ...lerp2(TL, TT, 0.94)); x.stroke();
    // the lens over the navigation light
    const nav = P(0.204, 0.27), strobe = P(0.166, 0.343); // red at the front of the tip, the strobe at its back
    x.fillStyle = rgba(L ? [150, 70, 70] : [70, 34, 36], 0.9);
    x.beginPath(); x.ellipse(nav[0], nav[1], u * 0.0042, u * 0.0026, -0.5, 0, TAU); x.fill();

    const mask = maskOf(c); // what it hides: the whole silhouette, before any highlight thins the ink
    if (L) { x.save(); x.clip(wing); x.globalCompositeOperation = 'destination-out'; streak(gc); x.restore(); } // by day a bright streak: the ink thins to the page

    return { wing: c, wingM: mask, wx: bx, wy: by, ww: bw, wh: bh, nav, strobe, pivot: [W * 1.06, H * 1.12], ...engineLayer(V, yh, q, L, P, LE) };
  }

  /** A copy of a layer: its silhouette, used to clear what it hides at full strength. */
  function maskOf(c) { const m = K.mk(c.width, c.height); m.getContext('2d').drawImage(c, 0, 0); return m; }
  /** Set a layer into the picture: what its mask covers is cleared, then the layer is laid on at strength a. */
  function stampM(ctx, m, img, x, y, w, h, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, x, y, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  /**
   * The engine under the inner wing, seen from a seat behind and above it: the big nacelle of a high-bypass engine, a
   * straight tube with a rounded lip, its front standing out ahead of the leading edge (the wing is laid over the rest).
   * It is a surface of revolution in 3D, rendered pixel by pixel (seen straight on, no perspective), so it keeps its
   * shape at any angle. From here the intake faces away: no opening, only the rounded lip. Lit by the afterglow low on
   * the right (by day a high sun), with the sky above and the cloud below mirrored in it (the horizon a bright streak
   * along its top); seams round it where the lip, the fan cowl and the thrust reverser meet; a shadow where the wing's
   * edge passes over it; the pylon a slim fairing along its top running back into the wing.
   */
  function engineLayer(V, yh, q, L, P, LE) {
    const { W, H, u, pv } = V, D = H - yh, deg = Math.PI / 180;
    // its axis in screen space (x right, y down, z toward us): yaw turns its head away from us (to the left on screen;
    // 0: side on), pitch tilts it up, both in degrees; fwd slides it forward along itself, in its radii
    const tv = window.PW_ENGINE_TEST, num = (v, d0) => (typeof v === 'number' && isFinite(v) ? v : d0); // { yaw, pitch, fwd }: lets the preview page try other angles by hand
    const yaw = Math.max(5, Math.min(85, num(tv && tv.yaw, 57))) * deg, pitch = Math.max(-40, Math.min(50, num(tv && tv.pitch, 10))) * deg, fwd = num(tv && tv.fwd, -2.8); // the angle the owner chose
    const R = D * 0.15, LN = 9, Lr = R * LN, EL = 22 * deg; // radius; length lip → nozzle (long: the back of it is always under the wing); we look down on it this steeply
    const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const nz3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cp = Math.cos(pitch), d = [cp * Math.cos(yaw), -Math.sin(pitch), -cp * Math.sin(yaw)];
    const upC = [0, -Math.cos(EL), Math.sin(EL)], zC = [0, Math.sin(EL), Math.cos(EL)]; // the world's up, and its level 'toward us'
    const toC = (v) => [v[0], -(v[1] * Math.cos(EL) - v[2] * Math.sin(EL)), v[1] * Math.sin(EL) + v[2] * Math.cos(EL)]; // world → screen space
    const ud = dt(upC, d), e1 = nz3([upC[0] - ud * d[0], upC[1] - ud * d[1], upC[2] - ud * d[2]]); // the top of the nacelle (the pylon's side)
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    // where it sits: the point SP back from the lip is under the wing's edge, and it turns about that point
    const SP = 3.1 * R, piv = P(0.75, 0.68), O = [piv[0] + d[0] * (SP + fwd * R), piv[1] + d[1] * (SP + fwd * R), d[2] * (SP + fwd * R)];
    // seen in mild perspective: the eye straight out of the window at the horizon, the screen through the pivot (what is
    // farther than that comes out a little smaller)
    const E = [W * 0.5, yh, W * 2.2], proj = (p) => { const k = E[2] / (E[2] - p[2]); return [E[0] + (p[0] - E[0]) * k, E[1] + (p[1] - E[1]) * k]; };

    // the profile along it, s from the lip (0) to the fan nozzle (1), radius in R: a straight tube, its front edge rounded
    // over, a short gentle taper to the nozzle; behind it the core cowl and the plug (under the wing, seen only if moved out)
    const SL = 0.16 / LN, RL = 0.9;
    const prof = (s) => (s < SL ? RL + (1 - RL) * Math.sqrt(Math.max(0, 1 - (1 - s / SL) ** 2))
      : s <= 1 ? 1 - 0.01 * sstep(1 / LN, 4 / LN, s) - 0.1 * Math.max(0, (s - 0.9) / 0.1) ** 2
      : s <= 1.12 ? 0.56 - (0.1 * (s - 1)) / 0.12
      : 0.38 * Math.sqrt(Math.max(0, 1 - ((s - 1.12) / 0.12) ** 2)));
    const S_END = 1.24;
    // the outward normal at s, as weights of the radial direction and the axis (the lip's front faces straight ahead)
    const slope = (s) => {
      if (s < SL) { const th = Math.acos(Math.max(-1, Math.min(1, 1 - s / SL))); return [Lr * SL * Math.sin(th), R * (1 - RL) * Math.cos(th)]; }
      const lo = s <= 1 ? SL : s <= 1.12 ? 1 : 1.12, hi = s <= 1 ? 1 : s <= 1.12 ? 1.12 : S_END, h = 1e-3;
      const a = Math.max(lo, s - h), b = Math.min(hi - 1e-6, s + h);
      return [Lr, (R * (prof(b) - prof(a))) / Math.max(1e-6, b - a)];
    };
    // as segments along the axis (a = -s·Lr, near end first), r² linear in a in each; a step up between two is a face
    const knots = [];
    for (let i = 8; i >= 0; i--) { const s = 1.12 + 0.12 * Math.sin((i / 8) * Math.PI / 2); knots.push([s, i === 8 ? 0 : prof(i ? s : 1.1201)]); }
    knots.push([1.12, prof(1.1199)], [1, prof(1.0001)]); // the core cowl, from the core nozzle
    for (let i = 60; i >= 0; i--) { const s = SL + ((1 - SL) * i) / 60; knots.push([s, prof(i === 60 ? 0.99999 : s)]); }
    for (let i = 11; i >= 0; i--) { const s = SL * (1 - Math.cos((i / 12) * Math.PI / 2)); knots.push([s, prof(s)]); }
    const sg = [];
    for (let i = 0; i + 1 < knots.length; i++) {
      const [s0, r0] = knots[i], [s1, r1] = knots[i + 1];
      if (s0 - s1 < 1e-9) continue;
      const a0 = -s0 * Lr, a1 = -s1 * Lr, q0 = (r0 * R) ** 2, q1 = (r1 * R) ** 2, be = (q1 - q0) / (a1 - a0);
      const prev = sg[sg.length - 1];
      sg.push({ a0, a1, al: q0 - be * a0, be, cap: !!prev && Math.abs(prev.a1 - a0) < 1e-6 && q0 > prev.q1 + 1e-6, q1 });
    }
    const aMin = -S_END * Lr, NG = 512, grid = new Int16Array(NG + 1);
    for (let g = 0, i = 0; g <= NG; g++) { const a = aMin + (-aMin * g) / NG; while (i < sg.length - 1 && sg[i].a1 <= a) i++; grid[g] = i; }

    // the layer; what lies a few pixels below the wing's leading edge is hidden by the wing, so it is left out
    const ex = Math.floor(W * 0.5), ey = Math.floor(yh + D * 0.2), ew = W + 6 - ex, eh = H + 6 - ey;
    const [c, x] = K.layer(ew, eh, q), qL = c.width / ew;
    x.translate(-ex, -ey);
    const leT = new Float32Array(ew + 2); // how low the leading edge runs over each column of the layer (and a little more)
    for (let i = ew + 1, k = 0, pa = LE(0), pb = LE(1 / 256); i >= 0; i--) { // right to left: the edge runs from the root out to the tip
      const cx = ex + i;
      while (k < 255 && pb[0] > cx) { k++; pa = pb; pb = LE((k + 1) / 256); }
      leT[i] = pa[1] + (pb[1] - pa[1]) * clamp01((cx - pa[0]) / (pb[0] - pa[0] || 1)) + 3;
    }
    const leAt = (cx) => { const f = Math.max(0, Math.min(ew, cx - ex)), i = Math.floor(f); return leT[i] + (leT[i + 1] - leT[i]) * (f - i); };
    const pt3 = (s, ph, dr = 0) => { const a = -s * Lr, r = prof(s) * R + dr, cs = Math.cos(ph), sn = Math.sin(ph); return [O[0] + a * d[0] + r * (cs * e1[0] + sn * e2[0]), O[1] + a * d[1] + r * (cs * e1[1] + sn * e2[1]), O[2] + a * d[2] + r * (cs * e1[2] + sn * e2[2])]; };
    const at3 = (s, ph) => proj(pt3(s, ph));
    // its outline: the union of its cross-sections (each an ellipse on screen), those that show ahead of the edge
    const body = new Path2D(), CS = Array.from({ length: 65 }, (_, k) => [Math.cos((k / 64) * TAU), Math.sin((k / 64) * TAU)]), rp = new Float32Array(130);
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i <= 150; i++) {
      const s = i < 24 ? SL * 1.6 * (i / 24) ** 1.6 : i < 128 ? SL * 1.6 + ((1 - SL * 1.6) * (i - 24)) / 104 : 1 + ((S_END - 1.003) * (i - 128)) / 22;
      const ss = i === 128 ? 0.9999 : s, a = -ss * Lr, r = prof(ss) * R, cx = O[0] + a * d[0], cy = O[1] + a * d[1], cz = O[2] + a * d[2];
      let vis = false;
      for (let k = 0; k <= 64; k++) {
        const [vx, vy] = proj([cx + r * (CS[k][0] * e1[0] + CS[k][1] * e2[0]), cy + r * (CS[k][0] * e1[1] + CS[k][1] * e2[1]), cz + r * (CS[k][0] * e1[2] + CS[k][1] * e2[2])]);
        rp[k * 2] = vx; rp[k * 2 + 1] = vy;
        if (!vis && vy < leAt(vx)) vis = true;
      }
      if (!vis) continue;
      for (let k = 0; k <= 64; k++) {
        const vx = rp[k * 2], vy = rp[k * 2 + 1];
        k ? body.lineTo(vx, vy) : body.moveTo(vx, vy);
        if (vx < bx0) bx0 = vx; if (vx > bx1) bx1 = vx; if (vy < by0) by0 = vy; if (vy > by1) by1 = vy;
      }
      body.closePath();
    }
    // its outline as one polygon (the fan cowl's), for clipping the sky's reflection to it every frame
    const m2 = Math.hypot(e1[2], e2[2]), psi = Math.atan2(e2[2], e1[2]), up = [], dn = [];
    const contour = (s) => { const [cu, cd] = slope(s), cc = (-cd * d[2]) / (cu * m2 + 1e-9); return Math.abs(cc) <= 1 ? Math.acos(cc) : null; };
    for (let i = 0; i <= 80; i++) {
      const s = i < 20 ? SL * (i / 20) ** 1.5 : SL + ((0.999 - SL) * (i - 20)) / 60, w = contour(s);
      if (w === null) continue;
      up.push(at3(s, psi + w)); dn.push(at3(s, psi - w));
    }
    const eclip = new Path2D();
    const wE = contour(0.999) || 0;
    [...up, ...Array.from({ length: 13 }, (_, k) => at3(0.999, psi + wE + ((TAU - 2 * wE) * k) / 12)), ...dn.reverse()].forEach((v, i) => (i ? eclip.lineTo(v[0], v[1]) : eclip.moveTo(v[0], v[1])));
    eclip.closePath();

    // light: the afterglow low on the right at dusk, a high sun by day (as the cloud has it); the sky and the cloud mirrored
    const Ls = toC(L ? SUN_L : SUN_D), hs = nz3([Ls[0], Ls[1], Ls[2] + 1]), SET = [0.29, -0.96]; // SET: where the sun went down, level (x, z)
    const M = L
      ? { alb: 0.62, f0: 0.06, f0lip: 0.18, fmax: 0.35, gnd: [60, 64, 78], sky: [170, 178, 196], sun: [120, 120, 118], ks: 0.55, sp: 40, spc: [255, 255, 255], rim: [0, 0, 0] }
      : { alb: 0.45, f0: 0.24, f0lip: 0.45, fmax: 1, gnd: [14, 15, 24], sky: [62, 66, 104], sun: [110, 70, 62], ks: 0.08, sp: 14, spc: [255, 196, 156], rim: [210, 136, 106] };
    const Lb = nz3([0.25, -0.6, -0.76]); // the glow behind it, grazing its top
    const env = (rx, ry, rz, o) => { // the world seen in direction r (world: rx right, ry up, rz toward us)
      const az0 = Math.max(0, (rx * SET[0] + rz * SET[1]) / (Math.sqrt(rx * rx + rz * rz) || 1)), az = az0 * az0 * az0;
      if (L) {
        if (ry >= 0) { const k = sstep(0, 0.6, ry); o[0] = 236 - 120 * k; o[1] = 242 - 80 * k; o[2] = 250 - 26 * k; }
        else { const k = sstep(0, 0.5, -ry); o[0] = 236 - 30 * k; o[1] = 240 - 26 * k; o[2] = 246 - 18 * k; }
        return;
      }
      const g = Math.exp(-Math.abs(ry) / (ry >= 0 ? 0.08 : 0.04)) * (0.12 + 0.88 * az); // the afterglow along the horizon
      if (ry >= 0) { const k = sstep(0.03, 0.7, ry); o[0] = 116 - 86 * k + 330 * g; o[1] = 96 - 58 * k + 200 * g; o[2] = 140 - 56 * k + 130 * g; }
      else { const k = sstep(0, 0.25, -ry); o[0] = 70 - 52 * k + 200 * g; o[1] = 56 - 38 * k + 124 * g; o[2] = 86 - 56 * k + 86 * g; }
    };
    /** The colour of the surface with normal n (lip: how much of the polished lip; part: 0 the cowl, 1 the core, 2 the exhaust's mouth); o: [r, g, b, by day how much the ink thins]. */
    const ev = [0, 0, 0];
    const shade = (n0, n1, n2, lip, part, o) => {
      const nv = Math.max(0, n2), nUp = n0 * upC[0] + n1 * upC[1] + n2 * upC[2];
      const r0 = 2 * nv * n0, r1 = 2 * nv * n1, r2 = 2 * nv * n2 - 1; // the view reflected: r = 2(n·v)n - v, v = (0, 0, 1)
      env(r0, r0 * upC[0] + r1 * upC[1] + r2 * upC[2], r1 * zC[1] + r2 * zC[2], ev);
      const f0 = M.f0 + (M.f0lip - M.f0) * lip, g1 = 1 - nv, g2 = g1 * g1, fr = Math.min(M.fmax, f0 + (1 - f0) * g2 * g2 * g1) * (part === 2 ? 0.2 : 1), kh = 0.5 + 0.5 * nUp;
      const dif = Math.max(0, n0 * Ls[0] + n1 * Ls[1] + n2 * Ls[2]), nh = n0 * hs[0] + n1 * hs[1] + n2 * hs[2], spc = nh > 0.5 ? Math.pow(nh, M.sp) * M.ks : 0;
      const alb = M.alb * (1 + 0.25 * lip) * (part === 2 ? 0.15 : part ? 0.55 : 1), rim = part === 2 ? 0 : Math.max(0, n0 * Lb[0] + n1 * Lb[1] + n2 * Lb[2]) * g2 * g1;
      let cr = alb * (M.gnd[0] + (M.sky[0] - M.gnd[0]) * kh + M.sun[0] * dif) + fr * ev[0] + rim * M.rim[0];
      let cg = alb * (M.gnd[1] + (M.sky[1] - M.gnd[1]) * kh + M.sun[1] * dif) + fr * ev[1] + rim * M.rim[1];
      let cb = alb * (M.gnd[2] + (M.sky[2] - M.gnd[2]) * kh + M.sun[2] * dif) + fr * ev[2] + rim * M.rim[2];
      o[3] = 0;
      if (L) { // by day the brightest light is the page itself: what would go past the ink thins it instead
        const eg = g2 * g2, lum = (0.3 * cr + 0.55 * cg + 0.15 * cb) * (1 - 0.25 * eg); // toward its outline a shade darker, so it stands off the bright sky
        cr *= 1 - 0.25 * eg; cg *= 1 - 0.25 * eg; cb *= 1 - 0.22 * eg;
        o[3] = 255 * Math.min(0.9, (Math.max(0, lum - 200) / 55 + spc) * 0.9 * (1 - eg));
        if (lum > 214) { const k = 214 / lum; cr *= k; cg *= k; cb *= k; }
      } else { cr += spc * M.spc[0]; cg += spc * M.spc[1]; cb += spc * M.spc[2]; }
      o[0] = cr; o[1] = cg; o[2] = cb;
      return o;
    };

    // the pixels: each looks from the eye through its point on the screen; the first point of the surface it meets, its
    // normal, and the light there (the shadow of the wing's edge, where that passes over, darkening it)
    const i0 = Math.max(0, Math.floor((bx0 - ex) * qL) - 3), i1 = Math.min(c.width, Math.ceil((bx1 - ex) * qL) + 3);
    const j0 = Math.max(0, Math.floor((by0 - ey) * qL) - 3), j1 = Math.min(c.height, Math.ceil((by1 - ey) * qL) + 3);
    const iw = Math.max(1, i1 - i0), ih = Math.max(1, j1 - j0), img = new ImageData(iw, ih), px = img.data, hl = L ? new Uint8ClampedArray(iw * ih) : null;
    const Rb2 = (R * 1.001) ** 2, sc = [0, 0, 0, 0], w0 = [E[0] - O[0], E[1] - O[1], E[2] - O[2]], a0 = dt(w0, d), ww = dt(w0, w0), aoW = R * 0.24, aoK = L ? 0.42 : 0.62;
    const leY = Float32Array.from({ length: iw }, (_, i) => leAt(ex + (i0 + i + 0.5) / qL));
    const NT = 2048, tS = new Float32Array(NT + 1); // along the body, the axis's weight in the normal (to the radial direction's 1)
    for (let i = 0; i <= NT; i++) { const [cu, cd] = slope(SL + ((S_END - SL) * i) / NT); tS[i] = cd / cu; }
    for (let j = 0; j < ih; j++) {
      const cy = ey + (j0 + j + 0.5) / qL;
      for (let i = 0; i < iw; i++) {
        if (cy > leY[i]) continue;
        const cxp = ex + (i0 + i + 0.5) / qL, vx0 = cxp - E[0], vy0 = cy - E[1], vl = Math.sqrt(vx0 * vx0 + vy0 * vy0 + E[2] * E[2]);
        const v0 = vx0 / vl, v1 = vy0 / vl, v2 = -E[2] / vl, vd = v0 * d[0] + v1 * d[1] + v2 * d[2];
        if (vd < 0.05) continue;
        // along the ray, a = (point - O)·d; the squared distance from the axis is A2·a² + A1·a + A0
        const wv = w0[0] * v0 + w0[1] * v1 + w0[2] * v2, iv = 1 / vd, A2 = iv * iv - 1, A1 = 2 * wv * iv - 2 * a0 * iv * iv, A0 = ww - 2 * wv * a0 * iv + a0 * a0 * iv * iv;
        const disc = A1 * A1 - 4 * A2 * (A0 - Rb2);
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        let a1 = (-A1 - sq) / (2 * A2);
        const a2 = Math.min(0, (-A1 + sq) / (2 * A2));
        if (a1 < aMin) a1 = aMin;
        if (a1 >= a2) continue;
        let ah = NaN, cap = false;
        for (let n = grid[Math.max(0, Math.min(NG, Math.floor(((a1 - aMin) / -aMin) * NG)))]; n < sg.length; n++) {
          const G = sg[n];
          if (G.a1 < a1) continue;
          const lo = Math.max(G.a0, a1);
          if (lo > a2) break;
          if (A2 * lo * lo + A1 * lo + A0 - (G.al + G.be * lo) < 0) { ah = lo; cap = G.cap && lo === G.a0; break; }
          const B1 = A1 - G.be, dd = B1 * B1 - 4 * A2 * (A0 - G.al);
          if (dd >= 0) { const rt = (-B1 - Math.sqrt(dd)) / (2 * A2); if (rt >= lo && rt <= G.a1) { ah = rt; break; } }
        }
        if (ah !== ah) continue;
        const tt = (ah - a0) * iv, s = -ah / Lr; // the point: E + tt·v
        let n0, n1, n2;
        const rx0 = E[0] + tt * v0 - O[0] - ah * d[0], ry0 = E[1] + tt * v1 - O[1] - ah * d[1], rz0 = E[2] + tt * v2 - O[2] - ah * d[2], rl = Math.sqrt(rx0 * rx0 + ry0 * ry0 + rz0 * rz0) || 1;
        if (cap) { n0 = -d[0]; n1 = -d[1]; n2 = -d[2]; }
        else {
          let cu = 1, cd;
          if (s < SL) [cu, cd] = slope(s); else cd = tS[Math.min(NT, Math.round(((s - SL) / (S_END - SL)) * NT))];
          const nx = (rx0 / rl) * cu + d[0] * cd, ny = (ry0 / rl) * cu + d[1] * cd, nzv = (rz0 / rl) * cu + d[2] * cd, nl = Math.sqrt(nx * nx + ny * ny + nzv * nzv);
          n0 = nx / nl; n1 = ny / nl; n2 = nzv / nl;
        }
        shade(n0, n1, n2, 1 - sstep(0.25 / LN, 0.32 / LN, s), cap ? 2 : s > 1.005 ? 1 : 0, sc);
        // under the wing's edge the cowl lies in its shadow: deepest right under it, most on the top that faces it
        const gap = leY[i] - 3 - cy, nUp = n0 * upC[0] + n1 * upC[1] + n2 * upC[2];
        const ao = gap < aoW * 5 ? Math.exp(-gap / aoW) * (0.35 + 0.65 * Math.max(0, nUp)) + (gap < R * 0.07 ? 0.5 * (1 - gap / (R * 0.07)) : 0) : 0, k = 1 - aoK * Math.min(1, ao);
        const o = (j * iw + i) * 4;
        px[o] = sc[0] * k; px[o + 1] = sc[1] * k; px[o + 2] = sc[2] * k; px[o + 3] = 255;
        if (L) hl[j * iw + i] = sc[3] * k;
      }
    }
    // a pixel of colour past the edge (the outline then trims it smooth)
    const src = new Uint8ClampedArray(px);
    for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
      const o = (j * iw + i) * 4;
      if (src[o + 3]) continue;
      const nb = i > 0 && src[o - 1] ? o - 4 : i < iw - 1 && src[o + 7] ? o + 4 : j > 0 && src[o - iw * 4 + 3] ? o - iw * 4 : j < ih - 1 && src[o + iw * 4 + 3] ? o + iw * 4 : -1;
      if (nb >= 0) { px[o] = src[nb]; px[o + 1] = src[nb + 1]; px[o + 2] = src[nb + 2]; px[o + 3] = 255; }
    }
    const T = K.mk(iw, ih), tx = T.getContext('2d');
    tx.putImageData(img, 0, 0);
    tx.setTransform(qL, 0, 0, qL, -ex * qL - i0, -ey * qL - j0);
    tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = '#000'; tx.fill(body);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(T, i0, j0); x.restore();

    const lw = (v) => Math.max(pv ? 0.35 : 0.6, v);
    const poly = (pts) => { x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(v[0], v[1]) : x.moveTo(v[0], v[1]))); };
    const ink = L ? { seam: [56, 62, 78] } : { seam: [8, 9, 14] };
    x.save(); x.clip(body);
    // seams: the lip's joint, the inlet and the fan cowl, the thrust reverser: the halves of their rings toward us
    const ring = (s) => { const w = contour(s); if (w === null) return; poly(Array.from({ length: 33 }, (_, k) => at3(s, psi - w + (2 * w * k) / 32))); x.stroke(); };
    x.lineWidth = lw(u * 0.0011); x.strokeStyle = rgba(ink.seam, L ? 0.5 : 0.8); ring(0.32 / LN);
    x.lineWidth = lw(u * 0.0008); x.strokeStyle = rgba(ink.seam, L ? 0.3 : 0.55); ring(1.3 / LN);
    x.strokeStyle = rgba(ink.seam, L ? 0.3 : 0.55); ring(2.6 / LN);
    x.restore();

    // the pylon: a slim, rounded fairing on the top of the cowl from a third of the way back, rising as it runs back into
    // the wing (it goes under the leading edge where the cowl does). Its rounded side toward us is laid in bands from its
    // foot to its crest, each in the light its normal there gets
    const sv = e2[2] >= 0 ? e2 : [-e2[0], -e2[1], -e2[2]], pS0 = 1.4 / LN;
    const pH = (s) => R * 0.15 * sstep(pS0, 3.4 / LN, s) ** 0.75, pW = (s) => R * 0.075 * sstep(pS0, pS0 + 0.6 / LN, s) ** 0.5;
    const pS = Array.from({ length: 33 }, (_, i) => pS0 + ((0.96 - pS0) * i) / 32);
    const pyl = (s, th) => { const a = -s * Lr, r = prof(s) * R * 0.985, h = pH(s), w = pW(s), cs = Math.cos(th), sn = Math.sin(th); // its foot a little down the curve of the cowl
      return proj([O[0] + a * d[0] + (r + h * sn) * e1[0] + w * cs * sv[0], O[1] + a * d[1] + (r + h * sn) * e1[1] + w * cs * sv[1], O[2] + a * d[2] + (r + h * sn) * e1[2] + w * cs * sv[2]]); };
    const pylP = new Path2D(), NB = 6, hm = pH(3.4 / LN), wm = pW(3.4 / LN);
    [...pS.map((s) => pyl(s, Math.PI / 2)), ...pS.slice().reverse().map((s) => pyl(s, 0))].forEach((v, i) => (i ? pylP.lineTo(v[0], v[1]) : pylP.moveTo(v[0], v[1])));
    pylP.closePath();
    for (let k = 0; k < NB; k++) { // from its foot up to its crest, each band reaching over the next (no seams between)
      const t0 = (k / NB) * (Math.PI / 2), t1 = Math.min(Math.PI / 2, ((k + 1.6) / NB) * (Math.PI / 2)), tm = ((k + 0.5) / NB) * (Math.PI / 2);
      const nrm = nz3([(sv[0] * Math.cos(tm)) / wm + (e1[0] * Math.sin(tm)) / hm, (sv[1] * Math.cos(tm)) / wm + (e1[1] * Math.sin(tm)) / hm, (sv[2] * Math.cos(tm)) / wm + (e1[2] * Math.sin(tm)) / hm]);
      const col = shade(nrm[0], nrm[1], nrm[2], 0, 0, [0, 0, 0, 0]);
      poly([...pS.map((s) => pyl(s, t1)), ...pS.slice().reverse().map((s) => pyl(s, t0))]); x.closePath();
      x.fillStyle = rgba(col, 1); x.fill();
    }
    x.strokeStyle = rgba(ink.seam, L ? 0.35 : 0.6); x.lineWidth = lw(u * 0.0008); poly(pS.map((s) => pyl(s, 0))); x.stroke(); // where it meets the cowl

    const engM = maskOf(c); // the silhouette, before highlights thin the ink (by day)
    if (L) { // by day the brightest light is the page showing through
      const hc = K.mk(iw, ih), hx = hc.getContext('2d'), hi = hx.createImageData(iw, ih);
      for (let p = 0; p < iw * ih; p++) hi.data[p * 4 + 3] = hl[p];
      hx.putImageData(hi, 0, 0);
      hx.setTransform(qL, 0, 0, qL, -ex * qL - i0, -ey * qL - j0);
      hx.globalCompositeOperation = 'destination-out'; hx.fill(pylP);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(hc, i0, j0); x.restore();
    }

    // the track of the sky's reflection sliding along the cowl: the brightest line on its upper side, short of the lip
    let best = -1, bw = 0;
    for (let k = 0; k <= 40; k++) {
      const w = psi - Math.PI / 2 + (Math.PI * k) / 40, n = [Math.cos(w) * e1[0] + Math.sin(w) * e2[0], Math.cos(w) * e1[1] + Math.sin(w) * e2[1], Math.cos(w) * e1[2] + Math.sin(w) * e2[2]];
      if (n[2] <= 0) continue;
      const rr = [2 * n[2] * n[0], 2 * n[2] * n[1], 2 * n[2] * n[2] - 1];
      env(rr[0], dt(rr, upC), dt(rr, zC), ev);
      const lum = ev[0] + ev[1] + ev[2] + 300 * dt(n, upC); // along the top
      if (lum > best) { best = lum; bw = w; }
    }
    const t0 = at3(2.3 / LN, bw), t1 = at3(0.45 / LN, bw), tl = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) || 1, tdx = (t1[0] - t0[0]) / tl, tdy = (t1[1] - t0[1]) / tl;
    return { eng: c, engM, ex, ey, ew, eh, eclip, eax: { a0: t0, dx: tdx, dy: tdy, nx: tdy, ny: -tdx, len: tl, r: R } };
  }

  /** The window: the cabin wall in the corners, the reveal around the pane (lit on the side the light comes from). */
  function frameLayer(w, h, q, L, pv) {
    const [c, x] = K.layer(w, h, q), m = Math.min(w, h);
    const cr = pv ? Math.min(9, h * 0.3) : m * 0.19, e = pv ? 1.4 : Math.max(4, m * 0.011), cr2 = cr * 1.22;
    const wall = new Path2D(); wall.rect(-2, -2, w + 4, h + 4); wall.roundRect(0, 0, w, h, cr);
    const rev = new Path2D(); rev.roundRect(0, 0, w, h, cr); rev.roundRect(e, e, w - e * 2, h - e * 2, cr2);
    const pane = new Path2D(); pane.roundRect(e, e, w - e * 2, h - e * 2, cr2);
    // a soft shadow just inside the pane, from the thickness of the window
    x.save(); x.clip(pane);
    const sh = L ? [96, 84, 70] : [0, 0, 0];
    for (let i = 0; i < (pv ? 3 : 9); i++) { x.strokeStyle = rgba(sh, L ? 0.018 : 0.028); x.lineWidth = (pv ? 3 : m * 0.06) * (1 - i / (pv ? 3 : 9)); x.stroke(pane); }
    x.restore();
    const wallC = L ? [158, 150, 140] : [8, 9, 13], revC = L ? [186, 178, 168] : [22, 21, 28];
    x.fillStyle = rgba(wallC, 1); x.fill(wall, 'evenodd');
    const gr = x.createLinearGradient(0, 0, w, 0); // the reveal: warm where the low sun reaches it, cool across from it
    gr.addColorStop(0, rgba(mix(revC, L ? [226, 218, 206] : [120, 76, 64], 0.55), 1)); gr.addColorStop(0.5, rgba(revC, 1)); gr.addColorStop(1, rgba(mix(revC, L ? [150, 142, 132] : [40, 44, 64], 0.5), 1));
    x.fillStyle = gr; x.fill(rev, 'evenodd');
    const open = new Path2D(); open.roundRect(0, 0, w, h, cr); // the reveal turns away into the wall: darker toward its outer edge
    x.save(); x.clip(rev, 'evenodd');
    x.strokeStyle = rgba(L ? [92, 80, 66] : [0, 0, 0], L ? 0.03 : 0.055);
    for (let i = 0; i < 14; i++) { x.lineWidth = e * 3.2 * (1 - i / 14); x.stroke(open); }
    x.restore();
    const gsl = x.createLinearGradient(0, 0, w, 0); // the seal round the pane
    gsl.addColorStop(0, L ? 'rgba(250,244,234,0.8)' : 'rgba(255,196,160,0.32)'); gsl.addColorStop(0.5, L ? 'rgba(232,226,216,0.5)' : 'rgba(170,150,170,0.14)'); gsl.addColorStop(1, L ? 'rgba(214,206,196,0.5)' : 'rgba(130,140,190,0.18)');
    x.strokeStyle = gsl; x.lineWidth = pv ? 0.5 : Math.max(0.7, m * 0.0012); x.stroke(pane);
    return c;
  }

  /* ---------- a storm cloud ---------- */

  /*
   * Once in a long while the aircraft flies through a cumulonimbus. It stands still in the world and our flight brings
   * it by: the great cloud slides in from the side we fly toward with the sea of cloud, towering, its heads rimmed by
   * the afterglow; then the part we fly through sweeps over the view from that side, the wing fading into it; inside, a
   * dim grey gloom on the move, the lights on the wingtip glowing in it, lightning now and then deep in the cloud, rain
   * on the window and a rough ride; then it thins from the same side as we come out, and the cloud falls behind us on
   * the other. Its textures are made a few milliseconds a frame in the quarter of a minute before it comes: mist (soft
   * noise that tiles both ways), the billowing side of a slice of murk, the cloud seen whole (its tower, and a bank of
   * billows for its flanks), a few blooms of light.
   */
  function* noiseJob(key, W, H, o) { // white, its alpha the noise (as SceneKit's noiseTex), a few rows at a time
    const f = K.fbm(o.seed, o.px, o.py, o.oct), f2 = K.fbm(o.seed + 77, o.px, o.py, 2);
    const c = K.mk(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const uu = (i / W) * o.px, vv = (j / H) * o.py, du = (f2(uu + 3.1, vv + 1.7) - 0.5) * o.warp, dv = (f2(uu + 9.2, vv + 5.3) - 0.5) * o.warp;
        const a = clamp01((f(uu + du, vv + dv) - o.lo) / (o.hi - o.lo)), k = (j * W + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = 255 * a * a * (3 - 2 * a);
      }
      if (j % 6 === 5) yield;
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    return c;
  }
  /**
   * The cumulonimbus as it stands ahead: towers of rounded heads over a broad mass, the tallest in the middle, its
   * foot lost in the sea of cloud. Each head is a ball (laid in a depth buffer, the nearest showing), lit as the sky
   * lights it: at dusk the afterglow behind it rims every head in gold over a dark face; by day the sun from above
   * makes the heads white over a grey base. A tower marked so (its fifth value) is crowned with a dome of heads, its top
   * the highest and roundest. Two textures: { D, L }.
   */
  function* towerJob(W0, towers, seed, foot = true, xp = []) {
    const H0 = 320, R = K.rng(seed), puffs = [], nf = K.fbm(seed + 6, 12, 5, 4);
    const add = (x, y, r, z, depth) => { // a head, and smaller heads swelling out of its upper side (and theirs)
      if (depth && y - r < 3) return; // (none reaching out of the top: it would be cut off flat there)
      puffs.push([x, y, r, z]);
      if (depth >= 2 || r < 5) return;
      for (let k = 0, n = depth ? 6 : 11; k < n; k++) {
        const a = -Math.PI * (0.02 + 0.96 * R()), dd = r * (0.74 + R() * 0.16), rr = r * (depth ? 0.3 + R() * 0.16 : 0.26 + R() * 0.2);
        add(x + Math.cos(a) * dd, y + Math.sin(a) * dd, rr, z + Math.sqrt(Math.max(0, r * r - dd * dd)) * 0.9, depth + 1);
      }
    };
    for (let x = W0 * 0.1; x < W0 * 0.9; x += 22 + R() * 16) { const e = Math.min(x - W0 * 0.1, W0 * 0.9 - x) / W0; add(x, 280 + R() * 12 - e * 30, 24 + R() * 16 + e * 34, R() * 10, 1); } // the mass, rounding off at its ends
    for (const [cx, ty, hw, cd = 3, , sides = 7] of towers) { // the towers (their columns reaching cd half-widths down, the base below)
      for (let y = Math.min(286, ty + hw * (1 + cd)); y > ty + hw; y -= hw * 0.34) { const k = (y - ty) / (286 - ty); add(cx + (R() - 0.5) * hw * 0.6, y, hw * (0.6 + 0.3 * k) * (0.85 + R() * 0.3), R() * 12, 1); }
      add(cx, ty + hw * 0.9, hw * 0.82, 20, 0);
      for (let n = 0; n < 6; n++) { const a = -Math.PI * (0.1 + 0.8 * R()); add(cx + Math.cos(a) * hw * 0.7, ty + hw * 0.95 + Math.sin(a) * hw * 0.55, hw * (0.3 + R() * 0.15), 24, 1); }
      for (let n = 0; n < sides; n++) { const sd = R() < 0.5 ? -1 : 1; add(cx + sd * hw * (0.5 + 0.3 * R()), ty + hw + R() * (270 - ty - hw), hw * (0.24 + R() * 0.2), 14 + R() * 10, 1); } // bulges down its sides
    }
    // and swelling over the whole face of it, so it is lumpy everywhere, not in columns
    const topAt = (x) => Math.min(...towers.map(([cx, ty, hw]) => { const k = (x - cx) / (hw * 1.3); return Math.abs(k) < 1 ? ty + hw * 0.9 - hw * 0.8 * Math.sqrt(1 - k * k) : 300; }), 286);
    for (let n = 0; n < Math.round(W0 / 13); n++) {
      const x = W0 * (0.13 + 0.74 * R()), r = 24 + R() * 40, y = Math.max(topAt(x) + r * 0.9, 150 + R() * 130);
      if (y < 292) add(x, y, r, 12 + R() * 16, 1);
    }
    // the main tower's top: a ring of heads round its cap, their outer sides on a dome, and one filling it, so it ends
    // in a high, lumpy dome (a cauliflower top, not spread out flat), now rounder, now taller
    for (const [cx, ty, hw, , dome] of towers) if (dome) {
      const ox = cx + (R() - 0.5) * hw * 0.16, ry = 1 + 0.25 * R(), oy = Math.max(ty + hw * 0.75, 16 + hw * 0.98 * ry); // (its top well inside the texture)
      add(ox, oy - hw * 0.45 * ry, hw * 0.5, 30, 1);
      for (let n = 0; n < 7; n++) {
        const a = -Math.PI * (0.06 + (0.88 * (n + 0.25 + 0.5 * R())) / 7), rr = hw * (0.32 + R() * 0.12), d0 = hw * 0.98 - rr;
        add(ox + Math.cos(a) * d0, oy + Math.sin(a) * d0 * ry, rr, 26 - 6 * Math.sin(a), 1);
      }
    }
    puffs.push(...xp); // (and any given: [x, y, r, z, flattening])
    yield;
    const N = W0 * H0, zb = new Float32Array(N).fill(-1e9), cov = new Float32Array(N), nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
    for (let m = 0; m < puffs.length; m++) {
      const [px, py, r, zo, asp = 1] = puffs[m], soft = Math.max(1.2, r * 0.05);
      for (let j = Math.max(0, Math.floor(py - r * asp - 1)); j < Math.min(H0, Math.ceil(py + r * asp + 1)); j++) {
        for (let i = Math.max(0, Math.floor(px - r - 1)); i < Math.min(W0, Math.ceil(px + r + 1)); i++) {
          const dx = i + 0.5 - px, dy = (j + 0.5 - py) / asp, dd = Math.sqrt(dx * dx + dy * dy), p = j * W0 + i;
          if (dd >= r) continue;
          const cv = clamp01((r - dd) / soft);
          if (cv > cov[p]) cov[p] = cv;
          const z = Math.sqrt(r * r - dd * dd) * asp + zo;
          if (z > zb[p]) { zb[p] = z; nX[p] = dx / r; nY[p] = dy / r; nZ[p] = (z - zo) / r; }
        }
      }
      if (m % 80 === 79) yield;
    }
    // the light on it, smoothed across the heads (where one swells in front of another the light runs on, softly); the
    // alpha of what lies a little above each point, for the rims along its upper edges
    const box = function* (src, dst, r, wt) { // a box blur, across then down (weighted: what is not cloud does not count)
      const tmp = new Float32Array(N), tw = new Float32Array(N);
      for (let j = 0; j < H0; j++) {
        let acc = 0, aw = 0;
        const row = j * W0;
        for (let i = -r; i < W0 + r; i++) {
          const ia = i + r, ib = i - r - 1;
          if (ia < W0) { const w = wt ? wt[row + ia] : 1; acc += src[row + ia] * w; aw += w; }
          if (ib >= 0) { const w = wt ? wt[row + ib] : 1; acc -= src[row + ib] * w; aw -= w; }
          if (i >= 0 && i < W0) { tmp[row + i] = acc; tw[row + i] = aw; }
        }
      }
      yield;
      for (let i = 0; i < W0; i++) {
        let acc = 0, aw = 0;
        for (let j = -r; j < H0 + r; j++) {
          const ja = j + r, jb = j - r - 1;
          if (ja < H0) { acc += tmp[ja * W0 + i]; aw += tw[ja * W0 + i]; }
          if (jb >= 0) { acc -= tmp[jb * W0 + i]; aw -= tw[jb * W0 + i]; }
          if (j >= 0 && j < H0) dst[j * W0 + i] = aw > 1e-6 ? acc / aw : 0;
        }
      }
      yield;
    };
    // the surface it shows us: the nearest heads' depth, smoothed where one swells in front of another, with a grain of
    // small bumps over it (the cauliflower); lit from its slopes. And how much cloud lies just above each point: its
    // upper edges against the sky take the rim of light
    const cv = new Float32Array(N), hz = new Float32Array(N), hs = new Float32Array(N), above = new Float32Array(N), gf = K.fbm(439, 16, 7, 3);
    for (let p = 0; p < N; p++) { const sol = p >= 290 * W0; cv[p] = sol ? Math.max(cov[p], cv[p - W0]) : cov[p]; hz[p] = Math.max(0, zb[p], sol ? 30 * cv[p] : 0); } // below its heads its foot goes straight down
    { const t2 = new Float32Array(N); yield* box(hz, hs, 5, cv); yield* box(hs, t2, 4, cv); yield* box(t2, hs, 4, cv); } // (three passes: a smooth bell, not one box with flat, square-edged facets that light up in steps)
    yield* box(cv, above, 2, null);
    for (let j = 0; j < H0; j++) { for (let i = 0; i < W0; i++) hs[j * W0 + i] += 9 * (gf((i / W0) * 16, (j / H0) * 7) - 0.5); if (j % 32 === 31) yield; }
    const sh = new Float32Array(N), sk = new Float32Array(N), sd = new Float32Array(N); // the light of the sun (by day), of the sky above and of the afterglow (at dusk)
    const Lx = 0.35, Ly = -0.75, Lz = 0.56;
    for (let j = 1; j < H0 - 1; j++) for (let i = 1; i < W0 - 1; i++) {
      const p = j * W0 + i, gx = (hs[p + 1] - hs[p - 1]) * 0.5, gy = (hs[p + W0] - hs[p - W0]) * 0.5, l = Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx / l, ny = -gy / l, nz = 1 / l;
      sh[p] = clamp01(nx * Lx + ny * Ly + nz * Lz); sk[p] = clamp01(-ny); sd[p] = clamp01(nx * 0.9 - ny * 0.2);
    }
    yield;
    let top = 0; // its highest row
    while (top < H0 - 1 && !cv.subarray(top * W0, top * W0 + W0).some((c) => c > 0.2)) top++;
    const out = { top };
    for (const md of ['D', 'L']) {
      const c = K.mk(W0, H0), x = c.getContext('2d'), img = x.createImageData(W0, H0), d = img.data;
      for (let j = 0; j < H0; j++) {
        const q = (j + 0.5) / H0;
        for (let i = 0; i < W0; i++) {
          const p = j * W0 + i, o = p * 4, n = nf((i / W0) * 12, (j / H0) * 5);
          const a = cv[p] * (foot ? 1 - sstep(0.8 + 0.12 * (n - 0.5), 0.99, q) : 1); // its foot fades
          if (a <= 0) continue;
          const up = j > 3 ? above[p - 3 * W0] : 0, rim = clamp01((cv[p] - up) * 1.5) * (1 - sstep(0.3, 0.8, q)) * sstep(0.3, 0.8, n + 0.15 * sk[p]); // its upper edges, against the sky
          let col;
          if (md === 'D') { // backlit: a dark face, a little sky light on its upper slopes, the heads' tops rimmed with the afterglow
            col = mix(mix([60, 58, 94], [28, 28, 52], sstep(0.2, 0.9, q)), [96, 86, 126], sk[p] * 0.45 * (1 - sstep(0.3, 0.9, q)));
            col = mix(col, [118, 86, 108], sd[p] * 0.35);
            col = mix(col, [250, 180, 142], clamp01(rim * 1.1));
          } else { // the sun high on the right: white heads over grey
            col = mix([112, 120, 140], [248, 250, 253], (clamp01(sh[p] * 1.15 + rim * 0.25) ** 0.85 * (1 - sstep(0.5, 1, q)) + 0.4 * sstep(0.5, 1, q)) * (1 - 0.45 * sstep(0.45, 1, q))); // its base in its own shadow, grey, the swellings there hardly lit
          }
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255 * a;
        }
        if (j % 24 === 23) yield;
      }
      x.putImageData(img, 0, 0);
      out[md] = c;
    }
    return out;
  }
  function* bloomJob(key, seed) { // light within a cloud: a soft bloom, uneven as the cloud is
    const S0 = 128, f = K.fbm(seed, 4, 4, 4), c = K.mk(S0, S0), x = c.getContext('2d'), img = x.createImageData(S0, S0), d = img.data;
    for (let j = 0; j < S0; j++) {
      for (let i = 0; i < S0; i++) {
        const dx = (i + 0.5) / S0 - 0.5, dy = (j + 0.5) / S0 - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2, n = f((i / S0) * 4, (j / S0) * 4);
        const o4 = (j * S0 + i) * 4;
        d[o4] = d[o4 + 1] = d[o4 + 2] = 255; d[o4 + 3] = 255 * clamp01(1 - r) ** 1.7 * (0.3 + 0.7 * sstep(0.32, 0.72, n));
      }
      if (j % 16 === 15) yield;
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    return c;
  }
  function* stormJob() {
    const X = { mist: [], bloom: [] };
    X.mist.push(yield* noiseJob('pwStM1', 256, 128, { px: 4, py: 2, oct: 4, lo: 0.4, hi: 0.9, warp: 1.6, seed: 419 }));
    for (let n = 0; n < 3; n++) X.bloom.push(yield* bloomJob(`pwStB${n}`, 443 + n * 7));
    K.cache.set('pwStorm', X);
  }
  /**
   * A cumulonimbus, a new one each time (from its seed): a main tower of rounded heads ending in a high, domed
   * cauliflower top, two to five lower lobes swelling out of its sides, sometimes a second, smaller tower beside it, on a
   * broad base. With it (its .fl), a long, lower bank of billows: its flanks, seen nearer.
   */
  function* cbJob(seed) {
    const R = K.rng(seed), W0 = 1024, towers = [], xp = [], cl = (x) => Math.max(W0 * 0.14, Math.min(W0 * 0.86, x));
    const wind = R() < 0.5 ? -1 : 1, mx = W0 * (0.5 - wind * (0.06 + 0.1 * R())), mh = 62 + R() * 26, my = 34 + R() * 26; // the main column: where (upwind of the middle), its half-width, the top of its heads
    towers.push([mx, my, mh, 4, 1]);
    for (let k = 0; k < 3; k++) towers.push([mx + (R() - 0.5) * mh * 0.5, my + mh * (0.8 + 0.9 * k), mh * (1.05 + 0.18 * k), 1.6]); // its stacked lobes, broader lower down
    for (let n = 2 + ((R() * 4) | 0), k = 0; k < n; k++) { // flanking towers stepping down beside it
      const sd = k % 2 ? 1 : -1, step = 1 + (k >> 1);
      towers.push([cl(mx + sd * mh * (1.3 + 1.1 * step + 0.4 * R())), my + 60 + 45 * step + R() * 40, mh * (0.75 + 0.35 * R()), 1.4 + R()]);
    }
    if (R() < 0.45) towers.push([cl(mx - wind * mh * (4.2 + R())), my + 70 + R() * 50, mh * (0.75 + 0.2 * R()), 2.4]); // a second, smaller tower upwind
    const out = yield* towerJob(W0, towers, seed, true, xp);
    out.mx = mx / W0; // (where its main tower stands in it)
    // and its flanks: a long bank of billowing heads, highest toward the middle (seen nearer, so lower than the tower):
    // broad heads on short columns, smaller ones swelling out all over its face
    const R2 = K.rng(seed + 991), fl = [], fx = [], tops = [];
    for (let x = W0 * (0.2 + 0.03 * R2()); x < W0 * 0.81; x += W0 * (0.07 + 0.05 * R2())) {
      const e = clamp01(Math.min(x - W0 * 0.12, W0 * 0.88 - x) / (W0 * 0.3)), t = [x, 215 - 145 * e + R2() * 35, 30 + 24 * e + R2() * 14, 0.4 + R2() * 0.5, 0, 0]; // e: 0 at its ends, 1 in its middle (no bulges down their sides: in a row they would streak it)
      fl.push(t); tops.push(t);
    }
    const topF = (x) => Math.min(286, ...tops.map(([cx, ty, hw]) => ty + hw * 0.5 + Math.max(0, Math.abs(x - cx) - hw) * 0.8)) + 80 * (1 - clamp01(Math.min(x - W0 * 0.13, W0 * 0.87 - x) / (W0 * 0.12))); // (falling away between its heads, and down to its ends)
    for (let x = W0 * 0.13; x < W0 * 0.87; x += 22 + R2() * 14) { // its face filled with smaller heads, lumpy all over (no gaps, no columns)
      for (let r = 18 + R2() * 18, y = topF(x) + r * 0.9; y < 284; r = 18 + R2() * 20, y += r * (0.7 + 0.3 * R2())) fx.push([x + (R2() - 0.5) * 20, y, r, 12 + R2() * 16]);
    }
    out.fl = yield* towerJob(W0, fl, seed + 101, true, fx);
    return out;
  }
  let sjob = null, cbj = null;
  /** The cumulonimbus for this seed: worked on for up to `ms` milliseconds; it once made, else null. */
  function cloudFor(seed, ms) {
    if (!cbj || cbj.seed !== seed) cbj = { seed, gen: cbJob(seed), out: null };
    if (cbj.out) return cbj.out;
    const t0 = performance.now();
    do { const r = cbj.gen.next(); if (r.done) { cbj.out = r.value; return r.value; } } while (performance.now() - t0 < ms);
    return null;
  }
  /** Work on the storm's textures for up to `ms` milliseconds; the textures once they are made, else null. */
  function stormStep(ms) {
    if (K.cache.has('pwStorm')) return K.cache.get('pwStorm');
    if (!sjob) sjob = stormJob();
    const t0 = performance.now();
    do { if (sjob.next().done) { sjob = null; return K.cache.get('pwStorm'); } } while (performance.now() - t0 < ms);
    return null;
  }

  /*
   * The storm cloud, as the window shows it. We look out sideways, so each part of it keeps its depth f (as the cloud
   * bands have it: f of the sea's depth on screen below the horizon) and its size, and slides across the view as fast
   * as the band at that depth: a point a distance x along our way stands at cx + (x - X)·f on screen (X: how far we
   * have flown, in the band speed's units). Only parallax tells that it comes nearer. We enter it at X = 0 and leave
   * it at Xin. The part we fly through is the murk: slices at f 1.3 to 15 between X = 0 and Xin. Round it, the cloud
   * seen whole, as layers far to near, each drawn among the bands at its depth (the sea of cloud in front of it hides
   * its foot): its main tower on the far side (f about 0.22), broad and slow, the first to show, sliding in from the side
   * we fly toward a minute or two before we reach the cloud; its flanks (f about 0.55 and 0.95), banks of billows
   * standing a little above us, longer along our way than the part we fly through, which come in later and faster and
   * overtake it; then the murk sweeps over the view and swallows us. After, the same the other way: the murk, then
   * the flanks, then, last and slowest, the tower slide off the other side.
   */
  function stormStart(sm, V, S, cloud, quick) {
    const { W, u } = V, { D } = S, v = 1.3 * (u / 700), R = RND;
    const inside = (600 + R() * 600) * v, cx = W * 0.5; // how long we are in it (as a distance): twenty to forty seconds
    sm.sl = [1.3, 2.4, 4.4, 8, 15].map((f) => ({ f, k: 'M', xE: cx, wE: inside * f, hide: f > 10 ? 1 : f > 6 ? 0.6 : f > 3 ? 0.5 : 0.35, thin: f < 3 ? 0.5 : 1 })); // the part we fly through: the murk
    for (const s of sm.sl) { s.ph = R() * 512; s.xl = s.xr = 1e9; }
    // a layer at depth f, its texture's left edge x0 along our way, span long (its cloud: the middle 0.8 of it); its row
    // 292 on the sea of cloud at its depth (a little below: its foot sinks into it), its top reaching yTop above the
    // horizon (as seen at depth 1), or (yTop null) the texture's own proportions; hz: how much air lies between
    const deck = 1.08 * D;
    const layer = (f, x0, span, tex, flip, yTop, hz) => {
      const sy = Math.max(0, tex.top - 4), Sy = yTop === null ? (span * 0.42) / 320 : (deck + yTop) / (292 - tex.top);
      const yT = deck - (292 - sy) * Sy, hW = (320 - sy) * Sy, nb = BANDS.find((B) => (B.f0 + B.f1) / 2 > f);
      // its foot ends on the sea of cloud at its depth, or higher up, where the band laid over it begins (that band's far
      // edge would cut it off straight); fl: how long the last of it fades (about 0.1 of the sea's depth on screen)
      const kE = Math.min((292 - sy) / (320 - sy), nb ? ((nb.f0 * D) / f - yT) / hW : 1);
      return { f, x0, w: span * f, tex, flip, sy, yT, hW, kE, fl: Math.min(0.25, Math.max(0.05, (D * 0.1) / (hW * f))), hz, bk: {}, xl: 1e9, a: 0 };
    };
    const flank = (f, a, b, yTop, hz) => { const span = (b - a) / 0.8; return layer(f, a - span * 0.1, span, cloud.fl, R() < 0.5, yTop, hz); };
    // the tower: its depth, how long its texture is; it stands about abreast of where we go in, its top (as we go in)
    // about the middle of the view: it has come in a minute or more before, and is the last to leave after
    const fT = 0.2 + 0.05 * R(), sT = (u * (1.1 + 0.3 * R())) / fT, flip = R() < 0.5, pk = flip ? 1 - cloud.mx : cloud.mx;
    sm.cb = [
      layer(fT, (W * (0.48 + 0.14 * R()) - cx) / fT - pk * sT, sT, cloud, flip, null, 0.3 + 0.08 * R()),
      flank(0.5 + 0.1 * R(), -inside * (0.28 + 0.14 * R()), inside * (1.14 + 0.1 * R()), D * (0.32 + 0.12 * R()), 0.14),
      flank(0.88 + 0.12 * R(), -inside * (0.08 + 0.08 * R()), inside * (1.08 + 0.08 * R()), D * (0.28 + 0.1 * R()), 0.06),
    ];
    // the natural one starts as the first of it comes in at the edge, a minute or two before we reach the cloud; the
    // preview's a few seconds off, the tower already in view
    const m = W * 0.03 + 8, first = Math.min(...sm.cb.map((c) => c.x0 + (c.w / c.f) * 0.2 - (W + m - cx) / c.f));
    sm.ph = 1; sm.t = 0; sm.X = quick ? -360 * v : Math.max(-3600 * v, Math.min(-1800 * v, first)); sm.Xin = inside; sm.quick = !!quick; sm.lt = 60; sm.fl = null; sm.n = 0; sm.si = 0;
  }

  /** A lightning bolt: a main channel jagged at every scale, forks splitting off it and off them, thinner each time. */
  function boltOf(x0, y0, len) {
    const out = [];
    const branch = (xa, ya, xb, yb, w, depth) => {
      let pts = [[xa, ya], [xb, yb]];
      for (let lv = 0, amp = Math.hypot(xb - xa, yb - ya) * 0.2; lv < 5; lv++, amp *= 0.55) {
        const np = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i], dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, o = (RND() - 0.5) * 2 * amp;
          np.push([(p0[0] + p1[0]) / 2 - (dy / l) * o, (p0[1] + p1[1]) / 2 + (dx / l) * o], p1);
        }
        pts = np;
      }
      // seen through the cloud: here and there it is hidden
      for (let i = 0; i < pts.length - 1; i += 6) out.push({ pts: pts.slice(i, i + 7), w, vis: RND() < 0.2 ? 0.15 : 0.45 + 0.55 * RND() });
      if (depth < 2) for (let i = 3; i < pts.length - 3; i++) if (RND() < (depth ? 0.05 : 0.09)) {
        const [px, py] = pts[i], l = Math.hypot(xb - xa, yb - ya) * (0.2 + 0.3 * RND()) * (1 - i / pts.length), an = Math.atan2(yb - ya, xb - xa) + (RND() < 0.5 ? -1 : 1) * (0.35 + 0.6 * RND());
        branch(px, py, px + Math.cos(an) * l, py + Math.sin(an) * l, w * 0.5, depth + 1);
      }
    };
    branch(x0, y0, x0 + (RND() - 0.5) * len * 0.5, y0 + len, 1, 0);
    return out;
  }

  /** The storm's course, every frame: where it stands, how deep in it we are, the lightning, the rain. */
  function stormTick(st, V, S, X, t) {
    const sm = st.sm, { W, H, u } = V, v = 1.3 * (u / 700), e = W * 0.02, cx = W * 0.5;
    sm.X += v; sm.t++;
    if (sm.ph === 1 && sm.X >= 0) sm.ph = 2;
    if (sm.ph === 2 && sm.X >= sm.Xin) sm.ph = 3;
    const fin = sm.quick ? sstep(0, 40, sm.t) : 1; // (the preview's fades in: it starts in view)
    let gone = sm.ph === 3, near = null;
    for (const c of sm.cb) { // the cloud whole, where each layer of it stands now
      c.xl = cx + (c.x0 - sm.X) * c.f; c.a = fin;
      if (c.xl + c.w * 0.92 > -e) gone = false;
    }
    for (const s of sm.sl) {
      s.xl = s.xE - sm.X * s.f; s.xr = s.xl + s.wE; s.a = fin;
      if (s.xr > -e) gone = false;
      near = s;
    }
    // how far the nearest of it has come over the view: the wing, the rain and the rough air go with it
    sm.n = clamp01((Math.min(W, near.xr) - Math.max(0, near.xl)) / W);
    sm.si = sm.n;
    sm.veiled = near.xl < -e && near.xr > W + e; // once the nearest fills the view, nothing behind it shows
    if (gone) { sm.ph = 0; sm.sl = null; sm.cb = null; sm.fl = null; sm.rain = null; sm.n = sm.si = 0; return; }
    // lightning, every few seconds once we are well inside: a bolt glimpsed through the cloud (the cloud round it lit), a
    // sheet of it lighting a wide part of the cloud from within, or a flash running on through the cloud
    if (sm.fl && ++sm.fl.i >= sm.fl.seq.length + sm.fl.lag) sm.fl = null;
    if (sm.n > 0.85 && !sm.fl && --sm.lt <= 0) {
      const seqs = [[0.5, 1, 0.45, 0.18, 0.06], [0.6, 1, 0.3, 0.1, 0, 0, 0.75, 0.4, 0.15, 0.05], [0.35, 0.8, 1, 0.5, 0.2, 0.08, 0, 0, 0, 0.3, 0.12, 0.04], [0.4, 0.7, 0.25, 0.08]];
      const x = W * (0.3 + RND() * 0.65), y = H * (0.1 + RND() * 0.5), r = u * (0.22 + RND() * 0.3), kind = RND(), bl = [];
      let bolt = null;
      if (kind < 0.35) { bl.push({ x, y, r, b: (RND() * 3) | 0, d: 0, k: 1 }); bolt = boltOf(x + (RND() - 0.5) * r * 0.4, y - r * 0.7, r * (1.2 + 0.6 * RND())); }
      else if (kind < 0.7) bl.push({ x, y, r: r * 1.8, b: (RND() * 3) | 0, d: 0, k: 0.7 });
      else for (let m = 0, nm = 2 + (RND() < 0.5 ? 1 : 0), lag = 0; m < nm; m++, lag += 2 + ((RND() * 3) | 0)) bl.push({ x: x + (RND() - 0.5) * r * 1.6, y: y + (RND() - 0.5) * r * 0.8, r: r * (0.6 + 0.5 * RND()), b: (RND() * 3) | 0, d: lag, k: 0.9 });
      sm.fl = { bl, seq: seqs[(RND() * seqs.length) | 0], i: 0, lag: bl[bl.length - 1].d, bolt };
      sm.lt = 60 + RND() * 190;
    }
    // rain on the window while we are in it
    if (sm.n > 0.05) {
      if (!sm.rain) sm.rain = Array.from({ length: 34 }, () => ({ x: RND() * W, y: RND() * H, l: u * (0.012 + RND() * 0.03), v: (u / 700) * (9 + RND() * 9) }));
      for (const r of sm.rain) { r.x -= r.v; r.y += r.v * 0.42; if (r.x < -r.l || r.y > H + r.l) { r.x = W * (0.3 + RND() * 0.8); r.y = -RND() * H * 0.4; } }
    } else sm.rain = null;
  }

  /**
   * A layer of the storm cloud as it is laid on: in the air of its depth (a little for the near ones, more for the far
   * tower), thickest down toward its foot, which dissolves unevenly into the sea of cloud (no edge where it stands in it).
   */
  function bakeCB(c, md, L, X) {
    const src = c.tex[md], w = src.width, h = 320 - c.sy, k = c.kE, o = K.mk(w, h), x = o.getContext('2d');
    if (c.flip) { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(src, 0, c.sy, w, h, 0, 0, w, h);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const air = L ? [198, 211, 230] : [96, 84, 116], low = L ? [204, 215, 233] : [84, 76, 104];
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(air, c.hz * 0.7)); g.addColorStop(k * 0.55, rgba(air, c.hz)); g.addColorStop(k * 0.92, rgba(low, Math.min(0.8, c.hz + 0.3))); g.addColorStop(1, rgba(low, Math.min(0.85, c.hz + 0.4)));
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-out';
    const n = K.mk(w, h), nx = n.getContext('2d'), y0 = h * (k - c.fl * 3); // the foot: mist eating into it, then gone
    nx.drawImage(X.mist[0], 0, y0, w * 0.5, h * c.fl * 3.4); nx.drawImage(X.mist[0], w * 0.5, y0, w * 0.5, h * c.fl * 3.4);
    const gn = nx.createLinearGradient(0, y0, 0, h * k);
    gn.addColorStop(0, 'rgba(0,0,0,0)'); gn.addColorStop(1, 'rgba(0,0,0,0.9)');
    nx.globalCompositeOperation = 'destination-in'; nx.fillStyle = gn; nx.fillRect(0, 0, w, h);
    x.drawImage(n, 0, 0);
    const gf = x.createLinearGradient(0, h * (k - c.fl), 0, h * k + 1);
    gf.addColorStop(0, 'rgba(0,0,0,0)'); gf.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = gf; x.fillRect(0, h * (k - c.fl), w, h);
    return o;
  }

  /**
   * The storm cloud up to depth fMax (laid in among the bands, so the sea of cloud in front of it hides its foot). The
   * cloud whole, far to near: its heads rimmed by the afterglow (by day white over grey), each layer at its depth and
   * in its air. Then the murk's slices, a faint grey haze with mist streaming by on them (soft-sided: no seams), which
   * hide what lies behind them.
   */
  function stormSlices(ctx, V, S, st, X, L, fMax) {
    const sm = st.sm, { W, H } = V, { yh } = S, my = S.my, cb = sm.cb, md = L ? 'L' : 'D';
    while (sm.ci < cb.length && cb[sm.ci].f < fMax) {
      const c = cb[sm.ci++], x0 = c.xl, w = c.w;
      if (c.a <= 0.003 || x0 + w * 0.92 < -my || x0 + w * 0.08 > W + my) continue;
      const img = c.bk[md] || (c.bk[md] = bakeCB(c, md, L, X)), y = yh + c.yT * c.f, h = c.hW * c.f;
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = c.a; ctx.drawImage(img, x0, y, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = c.a * (L ? 0.88 : 0.84); ctx.drawImage(img, x0, y, w, h);
    }
    const P = st.smPat || (st.smPat = { m: X.mist.map((c) => ctx.createPattern(K.tint(c, L ? '#4e5a70' : '#aab4d2'), 'repeat')) });
    const murkRGB = L ? [104, 114, 127] : [74, 80, 112], todo = [];
    while (sm.k < sm.sl.length && sm.sl[sm.k].f < fMax) todo.push(sm.sl[sm.k++]);
    const vis = (s) => s.a > 0.003 && s.xr > -10 && s.xl < W + 10;
    const wall = (s, pass) => { // a slice of the murk, its sides soft
      const top = -my, hh = H + my * 2, ew = Math.min(s.wE * 0.5, W * 0.45, W * (0.04 + 0.05 * Math.sqrt(s.f)) * 3), full = s.xl + ew < -my && s.xr - ew > W + my;
      const x0 = Math.max(s.xl, -my), x1 = Math.min(s.xr, W + my);
      if (x1 <= x0) return;
      const even = (col, aT) => { // a colour fading in over its sides: a smooth ramp stretched over each (no steps, no dither)
        ctx.globalAlpha = aT; ctx.fillStyle = rgba(col, 1);
        if (full) { ctx.fillRect(x0, top, x1 - x0, hh); return; }
        const rp = ramp(col), e2 = Math.min(ew, (s.xr - s.xl) / 2), i0 = Math.max(s.xl + e2, -my), i1 = Math.min(s.xr - e2, W + my);
        if (i1 > i0) ctx.fillRect(i0, top, i1 - i0, hh);
        ctx.drawImage(rp, s.xl, top, e2, hh);
        ctx.save(); ctx.translate(s.xr, 0); ctx.scale(-1, 1); ctx.drawImage(rp, 0, top, e2, hh); ctx.restore();
      };
      const rects = (aT) => { // (a pattern cannot take a ramp: side by side strips, fainter out toward its sides; never laid over one another, or their dither would add up into a grid)
        if (full) { ctx.globalAlpha = aT; ctx.fillRect(x0, top, x1 - x0, hh); return; }
        const e2 = Math.min(ew, (s.xr - s.xl) / 2), NS = 4, sw = e2 / NS, i0 = Math.max(s.xl + e2, -my), i1 = Math.min(s.xr - e2, W + my);
        ctx.globalAlpha = aT; if (i1 > i0) ctx.fillRect(i0, top, i1 - i0, hh);
        for (let k = 0; k < NS; k++) { ctx.globalAlpha = (aT * (k + 0.5)) / NS; ctx.fillRect(s.xl + k * sw, top, sw, hh); ctx.fillRect(s.xr - (k + 1) * sw, top, sw, hh); }
      };
      if (!pass) { ctx.globalCompositeOperation = 'destination-out'; even([0, 0, 0], s.a * s.hide); return; } // what lies behind it is hidden, in part (many together hide it all)
      ctx.globalCompositeOperation = 'source-over'; even(murkRGB, s.a * (L ? 0.13 : 0.04) * s.thin);
      const pm = P.m[0], ms = ((W * 0.5) / 256) * Math.min(4, Math.max(0.6, s.f * 0.5)); // mist on it, streaming by with it (drawn out along the way it goes)
      pm.setTransform(new DOMMatrix([ms * 1.9, 0, 0, ms, s.xl, s.ph])); ctx.fillStyle = pm; rects(s.a * (L ? 0.12 : 0.08));
    };
    for (const s of todo) if (vis(s)) wall(s, 0); // all of the murk first hides what lies behind it (the nearest hides it all, but not the others' wisps)
    for (const s of todo) if (vis(s)) wall(s, 1);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /** Lightning in the cloud (behind the wing, which stands dark against it): parts of it lit from within, a bolt now and then. */
  function stormLightning(ctx, V, st, X, L) {
    const z = st.sm.fl;
    if (!z) return;
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    for (const b of z.bl) {
      const a = (z.seq[z.i - b.d] || 0) * st.sm.n * b.k, B = X.bloom[b.b];
      if (a > 0.01) { ctx.globalAlpha = a * (L ? 0.5 : 0.32); ctx.drawImage(L ? B : K.tint(B, '#d2dbff'), b.x - b.r, b.y - b.r * 0.8, b.r * 2, b.r * 1.6); }
    }
    if (z.bolt && (z.seq[z.i] || 0) > 0.45) {
      const a = z.seq[z.i] * st.sm.n;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = L ? '#000' : '#e6ebff';
      for (const seg of z.bolt) { // a glow round it, then its bright core (thinner down the forks)
        ctx.beginPath(); seg.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.globalAlpha = a * seg.vis * 0.08 * (L ? 1.4 : 1); ctx.lineWidth = Math.max(1.5, V.u * 0.011 * seg.w); ctx.stroke();
        ctx.globalAlpha = a * seg.vis * 0.4 * (L ? 1.4 : 1); ctx.lineWidth = Math.max(0.5, V.u * 0.0014 * seg.w); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /** The wing and engine fading into the murk (all but the root, the least): their silhouettes, deepest toward the tip. */
  function stormVeil(ctx, S, V, n, L) {
    const key = L ? 'L' : 'D';
    if (!S.fade || S.fade.key !== key) {
      const { W, H } = V, { yh, D } = S, f = (m, x0, y0, w0, h0) => {
        const c = K.mk(m.width, m.height), x = c.getContext('2d'), q = m.width / w0;
        x.drawImage(m, 0, 0); x.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
        const g = x.createLinearGradient(W * 1.02, H * 1.06, W * 0.17, yh + D * 0.22);
        g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.35, 'rgba(0,0,0,0.72)'); g.addColorStop(0.7, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0.97)');
        x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(x0, y0, w0, h0);
        const t = K.mk(c.width, c.height), tx = t.getContext('2d'); // the same in the murk's colour: what shows where the wing has gone
        tx.drawImage(c, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = L ? '#68727f' : '#4a5070'; tx.fillRect(0, 0, t.width, t.height);
        return [c, t];
      };
      const [e0, e1] = f(S.engM, S.ex, S.ey, S.ew, S.eh), [w0, w1] = f(S.wingM, S.wx, S.wy, S.ww, S.wh);
      S.fade = { key, eng: e0, engT: e1, wing: w0, wingT: w1 };
    }
    const F = S.fade;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = n;
    ctx.drawImage(F.eng, S.ex, S.ey, S.ew, S.eh); ctx.drawImage(F.wing, S.wx, S.wy, S.ww, S.wh);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = n * (L ? 0.4 : 0.16);
    ctx.drawImage(F.engT, S.ex, S.ey, S.ew, S.eh); ctx.drawImage(F.wingT, S.wx, S.wy, S.ww, S.wh);
    ctx.restore();
  }

  /** In the cloud, close by: the nearest mist rushing past, the wingtip's lights glowing in it, the flash, the rain. */
  function stormNear(ctx, V, S, st, X, L, fl) {
    const { W, H, u } = V, sm = st.sm, n = sm.n;
    if (n <= 0.003) return;
    const near = sm.sl[sm.sl.length - 1], x0 = Math.max(0, near.xl), x1 = Math.min(W, near.xr);
    // the nearest wisps, over the wing too, where the cloud has come
    if (x1 > x0) { // (fainter out toward its faces, in strips side by side: no hard edge sweeping across the view)
      const pat = st.smPat.m[0], sc = (W * 0.5) / 256, aT = n * (L ? 0.14 : 0.09), ew = Math.min(W * 0.2, (near.xr - near.xl) / 2), NS = 6, sw = ew / NS;
      pat.setTransform(new DOMMatrix([sc * 1.9, 0, 0, sc, near.xl * 0.6, near.ph]));
      ctx.fillStyle = pat;
      const i0 = Math.max(x0, near.xl + ew), i1 = Math.min(x1, near.xr - ew);
      ctx.globalAlpha = aT; if (i1 > i0) ctx.fillRect(i0, 0, i1 - i0, H);
      for (let k = 0; k < NS; k++) {
        ctx.globalAlpha = (aT * (k + 0.5)) / NS;
        if (near.xl + (k + 1) * sw > 0) ctx.fillRect(near.xl + k * sw, 0, sw, H);
        if (near.xr - (k + 1) * sw < W) ctx.fillRect(near.xr - (k + 1) * sw, 0, sw, H);
      }
    }
    // the lights on the wingtip glow in the cloud: the red one steady, the strobe lighting it up for an instant
    const [nx, ny] = S.nav, [sx, sy] = S.strobe, rn = u * 0.13, rs = u * 0.3;
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.globalAlpha = n * (L ? 0.26 : 0.42); ctx.drawImage(navGlow(L), nx - rn, ny - rn, rn * 2, rn * 2);
    if (fl > 0) {
      if (L) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = fl * n * 0.3; ctx.drawImage(softDot(), sx - rs * 0.7, sy - rs * 0.7, rs * 1.4, rs * 1.4); }
      else { ctx.globalAlpha = fl * n * 0.32; ctx.drawImage(strobeGlow(), sx - rs, sy - rs, rs * 2, rs * 2); }
    }
    // a flash lights the mist close by too
    if (sm.fl) {
      const a = Math.max(...sm.fl.bl.map((b) => (sm.fl.seq[sm.fl.i - b.d] || 0) * b.k)) * n;
      if (a > 0.01) { ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter'; ctx.globalAlpha = a * (L ? 0.07 : 0.05); ctx.fillStyle = L ? '#000' : '#a8b4e0'; ctx.fillRect(0, 0, W, H); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // rain streaking back across the window
    if (sm.rain && n > 0.05) {
      ctx.globalAlpha = n * (L ? 0.16 : 0.1); ctx.strokeStyle = L ? '#3c4658' : '#c8d2ea'; ctx.lineWidth = Math.max(0.6, u * 0.0009); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const r of sm.rain) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.l * 0.9, r.y - r.l * 0.42); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the flight ---------- */

  /**
   * The first time, the sea is made a few milliseconds a frame (all at once it would stall the window for a few
   * tenths of a second) and fades in when it is complete; later scenes find it made. True once all bands are there.
   */
  function ready(S, L) {
    if (S.ready) return true;
    const t0 = performance.now();
    for (const b of S.bands) {
      if (b.tex) continue;
      const left = 9 - (performance.now() - t0);
      if (left <= 0 || !fieldStep(b.k, left)) return false;
      b.tex = bandMip(b.k, L ? 'L' : 'D', b.lv);
      b.mask = L ? bandMip(b.k, 'M', b.lv) : b.tex;
      if (b.opens) { b.texB = bandMip(b.k, L ? 'Lb' : 'Db', b.lv); b.maskB = L ? bandMip(b.k, 'Mb', b.lv) : b.texB; }
    }
    return (S.ready = true);
  }

  function init(S, V, key) {
    return { kind: 'planewindow', key, cf: S.ready ? 1 : 0, deck: null, off: BANDS.map(() => RND() * 8000), pats: null, masks: null, hz: null, mist: RND() * 4000, cir: RND() * 4000,
      tb: { wait: V.pv ? 1e9 : 450 + RND() * 900, age: -1, len: 1, amp: 0, p: [0, 0, 0, 0] }, sb: 0, sbP: 50 + RND() * 40, plane: null, planeIn: 1800 + RND() * 3600,
      // a break in the cloud: closed / opening / open / closing, and what lies below; the first within a minute or two
      rv: { ph: 0, t: 0, hold: 0, k: 0, kind: null, next: null, gr: null }, rvIn: 1500 + RND() * 1800, lastKind: RND() < 0.5 ? 'sea' : 'land', gpats: null, patsB: null, masksB: null, goff: GBANDS.map(() => RND() * 4000), clearNow: false,
      // a storm cloud: none / entering / inside / leaving; the first in six to twelve minutes
      sm: { ph: 0, t: 0, X: 0, Xin: 0, sl: null, cb: null, k: 0, ci: 0, n: 0, si: 0, veiled: false, quick: false, lt: 0, fl: null, rain: null, jy: 0, vy: 0, jr: 0, vr: 0, jf: 0, vf: 0 }, smIn: 10800 + RND() * 10800, smPat: null, stormNow: false };
  }

  window.BG_EXT.planewindow = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.6, 1.7), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V, w, h));
    ready(S, L);
    let st = bg.st;
    if (!st || st.kind !== 'planewindow' || st.key !== S.key) st = bg.st = init(S, V, S.key);
    const k7 = u / 700, { yh, D } = S;

    // once in a long while it flies through a cumulonimbus (bg.st.stormNow = true brings one at once: for trying it out)
    const sm = st.sm, rv0 = st.rv;
    let SX = null;
    // (bg.st.stormSeed = n picks the cloud's shape for it)
    if (st.stormNow) { // (for the preview it starts close: the cloud a few seconds off)
      st.stormNow = false;
      if (!pv && !sm.ph) {
        SX = stormStep(Infinity);
        stormStart(sm, V, S, cloudFor(st.stormSeed || ((RND() * 1e9) | 0), Infinity), true);
        if (rv0.ph === 1 || rv0.ph === 2) { rv0.ph = 3; rv0.t = 0; } // a break in the cloud closes under it
      }
    } else if (!sm.ph && !pv && S.ready && --st.smIn < 450) {
      // its textures and the cloud itself (a new one each time), made in the background in the last quarter of a minute before
      if (!st.smSeed) st.smSeed = st.stormSeed || ((RND() * 1e9) | 0);
      SX = stormStep(3);
      const cl = SX && cloudFor(st.smSeed, 3);
      if (st.smIn <= 0 && cl) { if (rv0.ph || st.plane) st.smIn = 900; else { stormStart(sm, V, S, cl, false); st.smSeed = 0; } } // never while the cloud is open below or another aircraft is about (its tower is in view for minutes)
    }
    if (sm.ph) {
      SX = SX || stormStep(Infinity);
      stormTick(st, V, S, SX, t);
      if (!sm.ph) { st.smIn = 14400 + RND() * 12600; st.rvIn = Math.max(st.rvIn, 1800); } // the next in eight to fifteen minutes
    }

    // how the aircraft moves: a slow float and bank, and now and then a patch of gentle turbulence
    const tb = st.tb;
    let bump = 0, flex = 0, roll = 0;
    if (tb.age < 0) { if (--tb.wait <= 0) { tb.age = 0; tb.len = 130 + RND() * 160; tb.amp = u * (0.0035 + RND() * 0.0035); tb.p = tb.p.map(() => RND() * TAU); } }
    else {
      const a = tb.age, env = Math.sin((Math.PI * a) / tb.len) ** 2, wob = (s) => 0.55 * Math.sin(s * 0.17 + tb.p[0]) + 0.3 * Math.sin(s * 0.29 + tb.p[1]) + 0.15 * Math.sin(s * 0.53 + tb.p[2]);
      bump = tb.amp * env * wob(a); flex = tb.amp * env * wob(a - 4) * 0.8; roll = 0.0022 * env * Math.sin(a * 0.11 + tb.p[3]);
      if (++tb.age > tb.len) { tb.age = -1; tb.wait = 1300 + RND() * 2300; }
    }
    { // in a storm the ride is rough: jolts in bunches with short calms between, the wings rocking a degree or two
      // and flexing, now and then a sudden drop (the world outside lurches up, then settles). Springs, not jitter
      const si = sm.si, q = sm.tq || (sm.tq = { gap: 20, left: 0, next: 0 });
      if (si > 0.05) {
        if (q.left > 0) {
          if (--q.next <= 0) { const k = si * (0.5 + 0.5 * RND()); sm.vy += (RND() - 0.5) * u * 0.013 * k; sm.vr += (RND() - 0.5) * 0.024 * k; sm.vf += (RND() - 0.5) * u * 0.024 * k; q.left--; q.next = 6 + RND() * 14; }
        } else if (--q.gap <= 0) {
          q.left = 3 + ((RND() * 5) | 0); q.next = 0; q.gap = 30 + RND() * 80;
          if (RND() < 0.2) sm.vy -= u * 0.008 * si; // a drop
        }
      }
      sm.vy += -0.045 * sm.jy - 0.09 * sm.vy; sm.jy += sm.vy; sm.vr += -0.04 * sm.jr - 0.08 * sm.vr; sm.jr += sm.vr; sm.vf += -0.07 * sm.jf - 0.1 * sm.vf; sm.jf += sm.vf;
      bump += sm.jy; roll += sm.jr; flex += sm.jf;
    }
    const bob = u * 0.0014 * Math.sin(t * 0.019) + u * 0.0007 * Math.sin(t * 0.0071 + 1) + bump;
    const tilt = 0.0032 * Math.sin(t * 0.0011) + 0.0012 * Math.sin(t * 0.0029 + 2) + roll;

    ctx.save(); ctx.translate(0, -V.oy);

    // the world outside, as the aircraft floats and banks in it
    ctx.save();
    ctx.translate(W / 2, yh); ctx.rotate(tilt); ctx.translate(-W / 2, -yh + bob);
    const veiled = sm.ph && sm.veiled; // deep in the cloud nothing of the world shows: not drawn
    if (sm.ph) { sm.k = 0; sm.ci = veiled ? sm.cb.length : 0; } // (deep inside, the cloud seen whole is hidden behind the murk)
    if (!veiled) {
      ctx.drawImage(S.sky, -S.mx, -S.my, W + S.mx * 2, yh + S.my * 2);
      if (S.twinkle.length) {
        ctx.fillStyle = '#e6ecff';
        for (const s of S.twinkle) { s.ph += s.sp; ctx.globalAlpha = s.a * (0.45 + 0.55 * Math.sin(s.ph) ** 2); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      // high wisps catching the last light (white streaks on a blue sky by day)
      st.cir += 0.05 * k7;
      const cir = K.tint(K.noiseTex('pwCirrus', 512, 96, { px: 4, py: 2, oct: 5, lo: 0.54, hi: 0.88, env: 'band', envPow: 1.3, warp: 2.2, seed: 61 }), L ? '#ffffff' : '#ffb49a');
      K.mist(ctx, cir, W, yh * 0.34, yh * 0.3, u * 2.8, st.cir, L ? 0.6 : 0.07);

      // now and then the cloud breaks up for a minute or so and the sea or the land shows far below
      // (bg.st.clearNow = true | 'sea' | 'land' opens one at once: for trying it out)
      const rv = st.rv;
      if (st.clearNow) {
        rv.kind = st.clearNow === 'sea' || st.clearNow === 'land' ? st.clearNow : RND() < 0.5 ? 'sea' : 'land';
        st.clearNow = false; rv.gr = groundStep(rv.kind, L, Infinity); rv.ph = 2; rv.t = 0; rv.hold = 1800; rv.k = 1; rv.next = null; st.gpats = null;
      } else if (rv.ph === 0) {
        if (!pv && S.ready && !sm.ph && --st.rvIn < 300) {
          if (!rv.next) { rv.next = st.lastKind === 'sea' ? 'land' : 'sea'; rv.gr = null; }
          if (!rv.gr) rv.gr = groundStep(rv.next, L, 5); // made in the background in the last few seconds before
          if (st.rvIn <= 0 && rv.gr) { rv.kind = rv.next; rv.next = null; rv.ph = 1; rv.t = 0; st.gpats = null; }
        }
      } else if (rv.ph === 1) { rv.k = sstep(0, 1, ++rv.t / 390); if (rv.t >= 390) { rv.ph = 2; rv.t = 0; rv.hold = 1200 + RND() * 1500; } }
      else if (rv.ph === 2) { rv.k = 1; if (++rv.t >= rv.hold) { rv.ph = 3; rv.t = 0; } }
      else { rv.k = 1 - sstep(0, 1, ++rv.t / 390); if (rv.t >= 390) { rv.ph = 0; rv.k = 0; st.lastKind = rv.kind; rv.gr = null; st.rvIn = 5400 + RND() * 5400; } }

      let hazed = false;
      const haze = () => { // (in a storm laid on before the nearer cloud: the towers standing in front of the horizon are not hazed)
        if (hazed) return;
        hazed = true;
        // the horizon itself is a soft bright band of air (on a light page, the page showing through)
        if (!st.hz) {
          const g = (st.hz = ctx.createLinearGradient(0, yh - D * 0.05, 0, yh + D * 0.08));
          if (L) { g.addColorStop(0, 'rgba(160,196,238,0)'); g.addColorStop(0.4, 'rgba(160,196,238,0.2)'); g.addColorStop(0.55, 'rgba(170,200,236,0.16)'); g.addColorStop(1, 'rgba(170,200,236,0)'); }
          else { g.addColorStop(0, 'rgba(255,180,140,0)'); g.addColorStop(0.4, 'rgba(255,184,142,0.12)'); g.addColorStop(0.55, 'rgba(236,160,146,0.09)'); g.addColorStop(1, 'rgba(220,150,150,0)'); }
        }
        ctx.fillStyle = st.hz;
        ctx.fillRect(xa, yh - D * 0.05, xb, D * 0.13);
        ctx.globalCompositeOperation = 'source-over';
        // haze lying along the horizon
        st.mist += 0.03 * k7;
        const fog = K.tint(K.noiseTex('fog6', 512, 128, { px: 6, py: 2, oct: 4, lo: 0.3, hi: 0.78, env: 'band', seed: 5 }), L ? '#ffffff' : '#ffc2a0');
        K.mist(ctx, fog, W, yh - D * 0.035, D * 0.1, u * 1.8, st.mist, L ? 0.22 : 0.08);
      };
      // the sea of cloud, far to near; each band hides the ones behind it
      const xa = -S.mx, xb = W + S.mx * 2;
      S.bands.forEach((b, k) => { st.off[k] = (st.off[k] + b.sp) % b.tw; });
      if (rv.k > 0 && rv.gr && S.ready) { // the surface first, under the cloud
        if (!st.gpats) st.gpats = rv.gr.map((c) => ctx.createPattern(c, 'repeat-x'));
        S.gbands.forEach((g, i) => {
          st.goff[i] = (st.goff[i] + g.sp) % g.tw;
          st.gpats[i].setTransform(new DOMMatrix([g.s, 0, 0, g.s, -st.goff[i], g.ry]));
          ctx.fillStyle = st.gpats[i]; ctx.fillRect(xa, g.ry, xb, g.rh);
        });
        if (rv.kind === 'sea' && !L) { // the last of the sun laid on the water as a long path of light
          ctx.save(); ctx.beginPath(); ctx.rect(xa, yh + D * 0.08, xb, H); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
          K.glow(ctx, S.sunX, yh + D * 0.1, D * 0.75, [[0, 'rgba(255,190,140,0.2)'], [0.35, 'rgba(240,150,120,0.08)'], [1, 'rgba(240,150,120,0)']], 0.13, 1);
          ctx.restore();
        }
      }
      if (st.cf < 1) { // until the sea is made (the first time only): a plain hazy deck where it will lie
        if (!st.deck) {
          const g = (st.deck = ctx.createLinearGradient(0, yh, 0, H));
          if (L) { g.addColorStop(0, 'rgba(170,198,236,0.3)'); g.addColorStop(0.3, 'rgba(150,174,214,0.26)'); g.addColorStop(1, 'rgba(120,146,190,0.26)'); }
          else { g.addColorStop(0, 'rgba(206,140,138,0.32)'); g.addColorStop(0.2, 'rgba(110,96,140,0.28)'); g.addColorStop(1, 'rgba(56,60,100,0.3)'); }
        }
        ctx.globalAlpha = 1 - st.cf; ctx.fillStyle = st.deck; ctx.fillRect(xa, yh, xb, H - yh + S.my); ctx.globalAlpha = 1;
      }
      if (S.ready) {
        if (!st.pats) { st.pats = S.bands.map((b) => ctx.createPattern(b.tex, 'repeat-x')); st.masks = L ? S.bands.map((b) => ctx.createPattern(b.mask, 'repeat-x')) : st.pats; }
        st.cf = Math.min(1, st.cf + 0.05); // fading in, the first time
        if (rv.k > 0 && !st.patsB) { st.patsB = S.bands.map((b) => b.texB && ctx.createPattern(b.texB, 'repeat-x')); st.masksB = L ? S.bands.map((b) => b.maskB && ctx.createPattern(b.maskB, 'repeat-x')) : st.patsB; }
        // it hides what is behind it: cleared by its coverage, then added. Where the coverage is partial (soft edges,
        // the far rows fading into the band behind) that is an exact cross-fade, with no seam darker or lighter.
        const lay = (pat, msk, b, k, a) => {
          const m = new DOMMatrix([b.s, 0, 0, b.s, -st.off[k], b.ry]);
          pat.setTransform(m); if (msk !== pat) msk.setTransform(m);
          ctx.fillStyle = msk; ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = st.cf * a; ctx.fillRect(xa, b.ry, xb, b.rh);
          ctx.fillStyle = pat; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = st.cf * a * b.a; ctx.fillRect(xa, b.ry, xb, b.rh);
        };
        S.bands.forEach((b, k) => { // in a break the deck gives way to broken cumulus
          if (sm.ph && SX) { if (k === 3) haze(); stormSlices(ctx, V, S, st, SX, L, (BANDS[b.k].f0 + BANDS[b.k].f1) / 2); } // a storm cloud stands in the sea of cloud
          const kb = b.opens ? rv.k : 0;
          if (kb < 1) lay(st.pats[k], st.masks[k], b, k, 1 - kb);
          if (kb > 0) lay(st.patsB[k], st.masksB[k], b, k, kb);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-atop';
        if (!L) K.glow(ctx, S.sunX, yh, W * 0.5, [[0, 'rgba(255,186,132,0.2)'], [0.4, 'rgba(255,150,120,0.08)'], [1, 'rgba(255,150,120,0)']], 1, 0.42); // the afterglow on the far cloud
        else K.glow(ctx, W * 1.02, yh + D * 0.35, W * 0.62, [[0, 'rgba(255,214,150,0.22)'], [0.5, 'rgba(255,224,170,0.08)'], [1, 'rgba(255,224,170,0)']], 1, 0.8); // by day the cloud toward the sun a little warmer
        ctx.globalCompositeOperation = 'source-over';
      }
      haze();

      // another aircraft far off, now and then
      if (!pv && !st.plane && !sm.ph && --st.planeIn <= 0) {
        const dir = RND() < 0.5 ? -1 : 1;
        st.plane = { dir, x: dir > 0 ? -W * 0.02 : W * 1.02, y: yh - (L ? 0.3 + RND() * 0.3 : 0.05 + RND() * 0.16) * yh, v: dir * k7 * (0.42 + RND() * 0.3), dy: (RND() - 0.5) * 0.004 * k7, trail: W * (0.06 + RND() * 0.08), ph: (RND() * 40) | 0, side: RND() < 0.5 };
      }
      if (st.plane) {
        const p = st.plane;
        p.x += p.v; p.y += p.dy; p.ph++; p.trail = Math.min(W * 0.24, p.trail + Math.abs(p.v) * 0.35);
        const tx = p.x - p.dir * p.trail, ty = p.y - p.dy * (p.trail / Math.abs(p.v));
        const gt = ctx.createLinearGradient(p.x, p.y, tx, ty);
        if (L) { gt.addColorStop(0, 'rgba(0,0,0,0)'); gt.addColorStop(0.06, 'rgba(0,0,0,0.5)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalCompositeOperation = 'destination-out'; }
        else { gt.addColorStop(0, 'rgba(255,206,176,0)'); gt.addColorStop(0.06, 'rgba(255,206,176,0.24)'); gt.addColorStop(0.5, 'rgba(250,180,170,0.1)'); gt.addColorStop(1, 'rgba(240,170,170,0)'); }
        ctx.strokeStyle = gt; ctx.lineWidth = Math.max(0.8, u * 0.0016); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - p.dir * u * 0.004, p.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = L ? 'rgba(70,80,100,0.7)' : 'rgba(255,226,190,0.6)'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, u * 0.0011), 0, TAU); ctx.fill();
        ctx.fillStyle = p.side ? 'rgba(255,84,70,0.75)' : 'rgba(110,255,150,0.65)'; ctx.beginPath(); ctx.arc(p.x + p.dir * u * 0.0016, p.y + u * 0.0004, Math.max(0.5, u * 0.0008), 0, TAU); ctx.fill();
        const f = p.ph % 38;
        if (f < 2 || (f > 4 && f < 6)) { ctx.globalAlpha = L ? 0.5 : 0.8; const r = u * 0.009; ctx.drawImage(L ? navGlow(true) : strobeGlow(), p.x - r, p.y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
        if (p.x < -W * 0.3 || p.x > W * 1.3) { st.plane = null; st.planeIn = 5400 + RND() * 7200; } // gone with its trail; the next in three to seven minutes
      }
    }
    if (sm.ph && SX) { stormSlices(ctx, V, S, st, SX, L, Infinity); stormLightning(ctx, V, st, SX, L); }
    ctx.restore();

    // the wing: part of the aircraft, so it moves only as it flexes
    const [px, py] = S.pivot, dist = Math.hypot(px - S.nav[0], py - S.nav[1]);
    const ang = (flex * 0.55 + u * 0.0006 * Math.sin(t * 0.019 - 0.6)) / dist;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(ang); ctx.translate(-px, -py);
    stampM(ctx, S.engM, S.eng, S.ex, S.ey, S.ew, S.eh, L ? 0.9 : 0.86); // the engine, under the wing
    { // the reflection of the sky sliding slowly along the cowl
      const e = S.eax, k = 0.5 + 0.3 * Math.sin(t * 0.0037), r = e.r; // along the bright line on its top, short of the lip
      ctx.save(); ctx.clip(S.eclip);
      ctx.translate(e.a0[0] + e.dx * e.len * k, e.a0[1] + e.dy * e.len * k); ctx.rotate(Math.atan2(e.dy, e.dx));
      ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter'; ctx.globalAlpha = L ? 0.4 : 0.22;
      ctx.drawImage(L ? softDot() : warmDot(), -e.len * 0.22, -r * 0.12, e.len * 0.44, r * 0.24);
      ctx.restore();
    }
    stampM(ctx, S.wingM, S.wing, S.wx, S.wy, S.ww, S.wh, L ? 0.82 : 0.84);
    // the steady red light on the tip, and the strobe now and then (soft: never a flash over the screen)
    const [nx, ny] = S.nav, rn = u * (pv ? 0.05 : 0.026);
    ctx.globalAlpha = L ? 0.7 : 0.75; ctx.drawImage(navGlow(L), nx - rn, ny - rn, rn * 2, rn * 2);
    if (++st.sb >= st.sbP) { st.sb = 0; st.sbP = 84 + RND() * 36; }
    const SB = [1, 0.55, 0.12, 0, 0.85, 0.4, 0.08], fl = st.sb < SB.length ? SB[st.sb] : 0;
    if (fl > 0) {
      const [sx, sy] = S.strobe, rs = u * (pv ? 0.09 : 0.05), rc = rs * 0.28;
      if (L) { // by day the flash shows as the wingtip lit up: the ink there gives way to the page
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = fl * 0.75; ctx.drawImage(softDot(), sx - rs * 0.45, sy - rs * 0.45, rs * 0.9, rs * 0.9); ctx.restore();
        ctx.globalAlpha = fl * 0.7; ctx.drawImage(strobeDay(), sx - rs * 0.6, sy - rs * 0.6, rs * 1.2, rs * 1.2);
      } else {
        ctx.globalAlpha = fl * 0.42; ctx.drawImage(strobeGlow(), sx - rs, sy - rs, rs * 2, rs * 2);
        ctx.globalAlpha = fl * 0.95; ctx.drawImage(strobeGlow(), sx - rc, sy - rc, rc * 2, rc * 2);
      }
    }
    ctx.globalAlpha = 1;
    if (sm.ph && sm.n > 0.003) stormVeil(ctx, S, V, sm.n, L); // in a storm the wing fades into the murk
    ctx.restore();
    if (sm.ph && SX) stormNear(ctx, V, S, st, SX, L, fl);
    ctx.restore();

    // the window around it all
    K.put(ctx, S.frame, w, h, L ? 0.58 : 0.85);
  };
})();
