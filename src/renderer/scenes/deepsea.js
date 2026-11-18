'use strict';
/*
 * 심해: the deep sea, far under the last of the daylight. A memory of the surface lingers at the top in a few slow
 * shafts that die away with depth, and marine snow sinks through the water in layers. Creatures drift by at random,
 * a few at a time, at every depth and both ways, each with its own lights: a school of lanternfish with rows of
 * photophores, small red shrimp, an anglerfish bobbing its lure, a gulper eel with its pouch of a mouth, a vampire
 * squid opening and closing its cloak, a dumbo octopus flapping its ear fins, a comb jelly running with rainbows, the
 * long glowing chain of a siphonophore, a sea angel rowing upward. Plankton spark where they pass. Rarely a whale
 * crosses far off, barely darker than the dark. On the floor a vent smokes among tube worms and sea pens.
 * On a light page the water is shallower, sunlit teal: the creatures are inked, their lights laid on as soft colour.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('deepsea'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};

  const TAU = Math.PI * 2, RND = Math.random, WHITE = [255, 255, 255], BLACK = [0, 0, 0], DEG = 180 / Math.PI;
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const rr = (a, b) => a + (b - a) * RND();
  const ease = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

  /* Colours: [on a dark page], [on a light page]. top / bot: back and belly; rim: the faint light from far above. */
  const PAL = {
    lantern: [{ top: [92, 118, 146], bot: [30, 38, 54], rim: [172, 206, 232], eye: [200, 234, 255], lite: [96, 214, 255] },
      { top: [36, 56, 72], bot: [98, 120, 132], rim: [24, 38, 52], eye: [236, 244, 250], lite: [0, 150, 200] }],
    shrimp: [{ top: [158, 56, 58], bot: [76, 24, 32], rim: [244, 158, 138], eye: [214, 232, 255], lite: [120, 196, 255] },
      { top: [138, 42, 38], bot: [190, 98, 86], rim: [96, 26, 22], eye: [255, 255, 255], lite: [30, 120, 210] }],
    angler: [{ top: [74, 70, 88], bot: [24, 22, 32], rim: [140, 142, 168], eye: [196, 214, 232], lite: [160, 238, 255], tooth: [226, 236, 244] },
      { top: [56, 54, 66], bot: [108, 104, 116], rim: [30, 28, 38], eye: [236, 240, 245], lite: [0, 160, 200], tooth: [255, 255, 255] }],
    gulper: [{ top: [80, 78, 96], bot: [28, 28, 38], rim: [150, 150, 180], eye: [204, 214, 232], lite: [255, 116, 150], skin: [120, 104, 124] },
      { top: [52, 52, 64], bot: [100, 100, 114], rim: [26, 26, 34], eye: [240, 240, 245], lite: [212, 46, 96], skin: [116, 106, 120] }],
    vampire: [{ top: [138, 42, 62], bot: [64, 18, 32], rim: [238, 150, 170], eye: [150, 206, 255], lite: [140, 210, 255], web: [96, 28, 46] },
      { top: [108, 28, 46], bot: [156, 72, 86], rim: [66, 12, 24], eye: [30, 100, 180], lite: [20, 120, 200], web: [138, 58, 74] }],
    dumbo: [{ top: [206, 156, 180], bot: [118, 78, 108], rim: [252, 218, 234], eye: [26, 18, 28], lite: [255, 226, 240], web: [156, 104, 134] },
      { top: [150, 84, 110], bot: [196, 136, 156], rim: [104, 48, 72], eye: [36, 18, 28], lite: [255, 255, 255], web: [176, 114, 138] }],
    comb: [{ body: [140, 196, 230], rim: [196, 232, 255], lite: [130, 230, 255] }, { body: [70, 132, 160], rim: [36, 88, 116], lite: [0, 150, 190] }],
    siphon: [{ body: [150, 192, 232], rim: [204, 230, 255], lite: [130, 150, 255], float: [255, 156, 112] }, { body: [70, 110, 150], rim: [36, 74, 112], lite: [50, 80, 210], float: [210, 90, 50] }],
    angel: [{ body: [170, 208, 228], rim: [214, 238, 252], gut: [255, 136, 76] }, { body: [96, 146, 172], rim: [40, 86, 116], gut: [222, 98, 40] }],
    whale: [{ ink: [3, 7, 13], rim: [86, 128, 160] }, { ink: [34, 70, 90], rim: [34, 70, 90] }],
  };
  const SNOW = [[180, 208, 226], [60, 94, 112]];
  const RAINBOW = [[[255, 118, 150], [255, 172, 92], [246, 232, 112], [132, 240, 150], [96, 222, 255], [136, 150, 255], [214, 128, 255]],
    [[214, 36, 84], [226, 116, 16], [184, 150, 0], [24, 156, 72], [0, 138, 200], [56, 70, 212], [158, 46, 198]]];
  const rainbow = (L) => { // 14 steps round the colour wheel, as stroke styles
    const key = `dsRainbow${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const src = RAINBOW[L ? 1 : 0], out = [];
    for (let i = 0; i < 14; i++) { const f = (i / 14) * src.length, a = Math.floor(f); out.push(rgb(mix(src[a], src[(a + 1) % src.length], f - a))); }
    K.cache.set(key, out);
    return out;
  };

  /* ---------- sprites (made once, cached) ---------- */

  function radial(key, size, stops) {
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(key, c);
    return c;
  }
  /** Sprites looked up by the colour array itself (no key string built per call, per frame). */
  const byColour = new WeakMap();
  const memo = (c, slot, make) => { let m = byColour.get(c); if (!m) byColour.set(c, (m = {})); return m[slot] || (m[slot] = make()); };
  /** A creature's light: a firm core in a short halo. On a light page, colour laid on the page (no added light). */
  const lamp = (c, L) => memo(c, L ? 'lampL' : 'lampD', () => radial(`dsLamp|${c}|${L ? 'L' : 'D'}`, 48, L
    ? [[0, rgba(mix(c, BLACK, 0.2), 1)], [0.16, rgba(c, 0.85)], [0.4, rgba(c, 0.24)], [0.72, rgba(c, 0.05)], [1, rgba(c, 0)]]
    : [[0, rgba(mix(c, WHITE, 0.75), 1)], [0.14, rgba(mix(c, WHITE, 0.3), 0.9)], [0.36, rgba(c, 0.3)], [0.7, rgba(c, 0.06)], [1, rgba(c, 0)]]));
  /** The wide, soft light a lure throws, or a cloud of glowing spew. */
  const aura = (c) => memo(c, 'aura', () => radial(`dsAura|${c}`, 96, [[0, rgba(c, 1)], [0.2, rgba(c, 0.6)], [0.45, rgba(c, 0.2)], [0.75, rgba(c, 0.04)], [1, rgba(c, 0)]]));
  const SPARK = [[110, 232, 255], [0, 150, 190]], SPEW = [[90, 190, 255], [0, 140, 200]], PEN = [[110, 255, 190], [20, 160, 110]];

  /** A creature's fixed lights baked into one sprite in its own units: pts [[x, y, size], …] inside box [x0, y0, x1, y1]. */
  function lights(slot, pts, c, L, box, r) { // slot: a constant name per set of lights and light / dark
    return memo(c, slot, () => {
      const ppu = 160, cv = K.mk((box[2] - box[0]) * ppu, (box[3] - box[1]) * ppu), x = cv.getContext('2d'), spr = lamp(c, L);
      for (const [px, py, s] of pts) { const rad = r * (s || 1) * ppu; x.drawImage(spr, (px - box[0]) * ppu - rad, (py - box[1]) * ppu - rad, rad * 2, rad * 2); }
      return cv;
    });
  }

  /** A shaft of light from the surface: a soft wedge, widening and fading as it goes down, with streaks along it. */
  function shaftSpr() {
    if (K.cache.has('dsShaft')) return K.cache.get('dsShaft');
    const SW = 96, SH = 320, c = K.mk(SW, SH), x = c.getContext('2d'), img = x.createImageData(SW, SH), d = img.data, f = K.fbm(19, 6, 2, 3);
    for (let j = 0; j < SH; j++) {
      const v = (j + 0.5) / SH, half = 0.3 + 0.7 * v, fall = Math.pow(1 - v, 1.6) * Math.min(1, 0.35 + v * 6);
      for (let i = 0; i < SW; i++) {
        const s = (((i + 0.5) / SW) * 2 - 1) / half;
        if (s <= -1 || s >= 1) continue;
        const prof = (1 - s * s) ** 2, streak = 0.5 + 0.5 * f((s + 1) * 3, v * 2);
        const o = (j * SW + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(255 * prof * streak * fall);
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = 'dsShaft';
    K.cache.set('dsShaft', c);
    return c;
  }
  /** A puff of the vent's murk: noise inside a soft round envelope (white; tinted by K.tint). */
  function smokeSpr(i) {
    const key = `dsSmoke${i}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 64, c = K.mk(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, f = K.fbm(71 + i * 13, 4, 4, 4);
    for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const dx = ((k + 0.5) / N) * 2 - 1, dy = ((j + 0.5) / N) * 2 - 1, r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const al = Math.max(0, Math.min(1, (f((k / N) * 4, (j / N) * 4) - 0.28) / 0.45)) * (1 - r2) ** 2;
      const o = (j * N + k) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(al * 255);
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    K.cache.set(key, c);
    return c;
  }
  /** A speck of marine snow seen a little out of focus. */
  const dotSpr = (L) => radial(`dsDot${L ? 'L' : 'D'}`, 16, [[0, rgba(SNOW[L ? 1 : 0], 1)], [0.35, rgba(SNOW[L ? 1 : 0], 0.75)], [0.7, rgba(SNOW[L ? 1 : 0], 0.2)], [1, rgba(SNOW[L ? 1 : 0], 0)]]);
  /** A floc of marine snow close to the glass: a loose, soft clump with a few threads. */
  function flocSpr(i, L) {
    const key = `dsFloc${i}${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 48, c = K.mk(N, N), x = c.getContext('2d'), R = K.rng(910 + i * 7), col = SNOW[L ? 1 : 0];
    for (let k = 0; k < 5; k++) {
      const a = R() * TAU, d = R() * 9, r = 5 + R() * 7, cx = 24 + Math.cos(a) * d, cy = 24 + Math.sin(a) * d * 0.8, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(col, 0.5 + R() * 0.3)); g.addColorStop(0.5, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, N, N);
    }
    x.strokeStyle = rgba(col, 0.3); x.lineWidth = 1.1; x.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const a = R() * TAU, l = 8 + R() * 10; x.beginPath(); x.moveTo(24, 24); x.quadraticCurveTo(24 + Math.cos(a + 0.6) * l * 0.6, 24 + Math.sin(a + 0.6) * l * 0.6, 24 + Math.cos(a) * l, 24 + Math.sin(a) * l); x.stroke(); }
    K.cache.set(key, c);
    return c;
  }

  /* ---------- drawing helpers ---------- */

  /** A shape that hides what is behind it (cut: how much), then filled at alpha a. */
  function solid(ctx, path, style, a, cut) {
    if (cut > 0.004) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, cut); ctx.fillStyle = '#000'; ctx.fill(path); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = style; ctx.fill(path);
  }
  /** The same for a sprite laid over box [x0, y0, x1, y1] in the current units. */
  function stampBox(ctx, img, b, a, cut) {
    const w = b[2] - b[0], h = b[3] - b[1];
    if (cut > 0.004) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, cut); ctx.drawImage(img, b[0], b[1], w, h); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(img, b[0], b[1], w, h);
  }
  /** A light: sprite spr centred on (x, y), radius r. */
  function lit(ctx, spr, x, y, r, a) {
    if (a < 0.008) return;
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  }
  /** A gradient kept for the life of the scene (it is applied in whatever units are current when it fills). */
  function grad(F, key, x0, y0, x1, y1, stops) {
    let g = F.st.g[key];
    if (!g) { g = F.ctx.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); F.st.g[key] = g; }
    return g;
  }
  function rgrad(F, key, x, y, r, stops) {
    let g = F.st.g[key];
    if (!g) { g = F.ctx.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) g.addColorStop(o, c); F.st.g[key] = g; }
    return g;
  }
  const bodyGrad = (F, type, y0, y1) => { const p = F.pal[type]; return grad(F, type + 'Body', 0, y0, 0, y1, [[0, rgb(p.top)], [0.45, rgb(mix(p.top, p.bot, 0.45))], [1, rgb(p.bot)]]); };
  const rimGrad = (F, type, y0, y1) => { const p = F.pal[type]; return grad(F, type + 'Rim', 0, y0, 0, y1, [[0, rgba(p.rim, 0.9)], [1, rgba(p.rim, 0)]]); };

  /* ---------- lanternfish: small, a school of them; every pose of the tail painted once ---------- */

  const LANT = (() => {
    const body = new Path2D();
    body.moveTo(0.5, 0.012);
    body.bezierCurveTo(0.5, -0.06, 0.42, -0.115, 0.27, -0.122);
    body.bezierCurveTo(0.08, -0.13, -0.18, -0.085, -0.37, -0.03);
    body.lineTo(-0.37, 0.03);
    body.bezierCurveTo(-0.2, 0.075, 0.04, 0.12, 0.26, 0.11);
    body.bezierCurveTo(0.4, 0.104, 0.48, 0.07, 0.5, 0.012);
    body.closePath();
    const fins = new Path2D(); // dorsal, adipose, anal, pelvic
    fins.moveTo(0.06, -0.12); fins.quadraticCurveTo(0.0, -0.2, -0.05, -0.205); fins.quadraticCurveTo(-0.1, -0.16, -0.15, -0.1); fins.closePath();
    fins.moveTo(-0.25, -0.07); fins.quadraticCurveTo(-0.28, -0.11, -0.31, -0.105); fins.lineTo(-0.3, -0.055); fins.closePath();
    fins.moveTo(-0.1, 0.08); fins.quadraticCurveTo(-0.16, 0.14, -0.22, 0.14); fins.quadraticCurveTo(-0.25, 0.1, -0.27, 0.055); fins.closePath();
    fins.moveTo(0.08, 0.11); fins.quadraticCurveTo(0.03, 0.16, -0.01, 0.165); fins.lineTo(0.0, 0.105); fins.closePath();
    const tail = new Path2D(); // around the tail stalk
    tail.moveTo(0.02, -0.03); tail.quadraticCurveTo(-0.07, -0.06, -0.16, -0.14); tail.quadraticCurveTo(-0.13, -0.05, -0.1, 0); tail.quadraticCurveTo(-0.13, 0.05, -0.16, 0.14); tail.quadraticCurveTo(-0.07, 0.06, 0.02, 0.03); tail.closePath();
    const pect = new Path2D(); pect.moveTo(0.25, 0.035); pect.quadraticCurveTo(0.16, 0.05, 0.1, 0.085); pect.quadraticCurveTo(0.17, 0.075, 0.25, 0.055); pect.closePath();
    const lines = new Path2D();
    lines.moveTo(0.24, -0.09); lines.quadraticCurveTo(0.19, 0.0, 0.23, 0.09); // the gill cover
    lines.moveTo(0.495, 0.03); lines.quadraticCurveTo(0.42, 0.06, 0.33, 0.05); // the mouth
    lines.moveTo(0.2, -0.03); lines.quadraticCurveTo(-0.05, -0.03, -0.34, -0.002); // the lateral line
    const dots = [[0.31, 0.085], [0.24, 0.094], [0.17, 0.099], [0.1, 0.101], [0.03, 0.099], [-0.04, 0.093], [-0.11, 0.084], [-0.18, 0.073], [-0.25, 0.06], [-0.31, 0.047],
      [0.2, 0.045, 0.8], [0.1, 0.05, 0.8], [0.0, 0.046, 0.8], [-0.1, 0.036, 0.8], [-0.2, 0.022, 0.8], [0.45, -0.018, 1.5], [0.34, 0.052, 1.1]];
    return { body, fins, tail, pect, lines, dots, dotsM: dots.concat([[-0.33, -0.035, 1.8]]), box: [-0.62, -0.25, 0.56, 0.24] };
  })();
  const POSES = 12, LSPR = [[], []];
  function lanternSpr(i, L) {
    const have = LSPR[L ? 1 : 0][i];
    if (have) return have;
    const key = `dsLant${i}${L ? 'L' : 'D'}`;
    const ppu = 120, b = LANT.box, cv = K.mk((b[2] - b[0]) * ppu, (b[3] - b[1]) * ppu), x = cv.getContext('2d'), p = PAL.lantern[L ? 1 : 0];
    x.scale(ppu, ppu); x.translate(-b[0], -b[1]); x.lineCap = 'round'; x.lineJoin = 'round';
    const sil = new Path2D();
    sil.addPath(LANT.body); sil.addPath(LANT.fins); sil.addPath(LANT.tail, new DOMMatrix().translateSelf(-0.36, 0).rotateSelf(Math.sin((i / POSES) * TAU) * 17));
    const g = x.createLinearGradient(0, -0.13, 0, 0.12); g.addColorStop(0, rgb(p.top)); g.addColorStop(0.5, rgb(mix(p.top, p.bot, 0.5))); g.addColorStop(1, rgb(p.bot));
    x.fillStyle = g; x.fill(sil);
    const sh = x.createLinearGradient(0, -0.1, 0, 0.02); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.6, rgba(p.rim, L ? 0.08 : 0.16)); sh.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fill(LANT.body); // a silvery sheen along the flank
    const rg = x.createLinearGradient(0, -0.14, 0, 0.05); rg.addColorStop(0, rgba(p.rim, 0.85)); rg.addColorStop(1, rgba(p.rim, 0));
    x.strokeStyle = rg; x.lineWidth = 0.024; x.stroke(sil);
    x.fillStyle = rgba(mix(p.top, p.rim, 0.35), 0.7); x.fill(LANT.pect);
    x.strokeStyle = rgba(p.rim, 0.28); x.lineWidth = 0.016; x.stroke(LANT.lines);
    x.fillStyle = L ? '#18202a' : '#04060a'; x.beginPath(); x.arc(0.355, -0.03, 0.056, 0, TAU); x.fill(); // the big eye
    x.strokeStyle = rgba(p.rim, 0.45); x.lineWidth = 0.013; x.stroke();
    x.fillStyle = rgba(p.eye, 0.85); x.beginPath(); x.arc(0.372, -0.047, 0.016, 0, TAU); x.fill();
    K.cache.set(key, cv);
    LSPR[L ? 1 : 0][i] = cv;
    return cv;
  }
  function lanternfish(ctx, F, m, x, y, size, dir, p, A, vis) {
    const pose = ((Math.floor((m.ph / TAU) * POSES) % POSES) + POSES) % POSES, b = LANT.box;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * size, size); ctx.rotate(p - Math.sin(m.ph) * 0.035);
    stampBox(ctx, lanternSpr(pose, F.L), b, A * F.body, vis);
    ctx.globalCompositeOperation = F.add;
    ctx.globalAlpha = Math.min(1, A * F.lite * (0.8 + 0.2 * Math.sin(m.wob + F.t * 0.03)));
    ctx.drawImage(lights(m.male ? (F.L ? 'lantML' : 'lantMD') : F.L ? 'lantL' : 'lantD', m.male ? LANT.dotsM : LANT.dots, F.pal.lantern.lite, F.L, b, 0.05), b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* ---------- a small red shrimp, its back arched, long feelers trailing ---------- */

  const SHR = (() => {
    const body = new Path2D();
    body.moveTo(0.43, -0.03);
    body.bezierCurveTo(0.36, -0.13, 0.18, -0.15, 0.04, -0.13); // the carapace, humped
    body.bezierCurveTo(-0.1, -0.12, -0.22, -0.09, -0.3, -0.04); // the abdomen, arching down
    body.quadraticCurveTo(-0.36, -0.0, -0.37, 0.05);
    body.lineTo(-0.34, 0.075);
    body.quadraticCurveTo(-0.27, 0.035, -0.18, 0.035);
    body.bezierCurveTo(-0.08, 0.04, 0.02, 0.045, 0.08, 0.045);
    body.bezierCurveTo(0.2, 0.055, 0.34, 0.045, 0.445, 0.005);
    body.closePath();
    body.moveTo(0.42, -0.04); body.quadraticCurveTo(0.52, -0.075, 0.62, -0.075); body.quadraticCurveTo(0.52, -0.05, 0.44, -0.012); body.closePath(); // the rostrum
    body.moveTo(-0.355, 0.04); body.quadraticCurveTo(-0.43, 0.03, -0.5, 0.06); body.quadraticCurveTo(-0.46, 0.1, -0.5, 0.15); body.quadraticCurveTo(-0.42, 0.12, -0.33, 0.08); body.closePath(); // the tail fan
    const lines = new Path2D(); // the joints of the shell and the groove on the carapace
    for (const [x, y0, y1] of [[-0.02, -0.125, 0.045], [-0.1, -0.117, 0.042], [-0.175, -0.1, 0.038], [-0.24, -0.077, 0.036], [-0.295, -0.045, 0.045]]) { lines.moveTo(x + 0.014, y0); lines.quadraticCurveTo(x - 0.012, (y0 + y1) / 2, x - 0.002, y1); }
    lines.moveTo(0.3, -0.13); lines.quadraticCurveTo(0.2, -0.05, 0.25, 0.045);
    const dots = [[0.33, 0.036], [0.24, 0.046], [0.15, 0.05], [0.05, 0.046], [-0.06, 0.04, 0.9], [-0.15, 0.036, 0.9], [-0.23, 0.034, 0.8], [0.4, -0.004, 1.2]];
    return { body, lines, dots, box: [-0.4, -0.06, 0.48, 0.1] };
  })();
  const SBOX = [-0.56, -0.17, 0.66, 0.17], SSPR = [null, null];
  function shrimpSpr(L) { // the shell, its joints, the light along its back and the eye, painted once
    if (SSPR[L ? 1 : 0]) return SSPR[L ? 1 : 0];
    const ppu = 120, b = SBOX, cv = K.mk((b[2] - b[0]) * ppu, (b[3] - b[1]) * ppu), x = cv.getContext('2d'), p = PAL.shrimp[L ? 1 : 0];
    x.scale(ppu, ppu); x.translate(-b[0], -b[1]); x.lineCap = 'round'; x.lineJoin = 'round';
    const g = x.createLinearGradient(0, -0.13, 0, 0.06); g.addColorStop(0, rgb(p.top)); g.addColorStop(0.45, rgb(mix(p.top, p.bot, 0.45))); g.addColorStop(1, rgb(p.bot));
    x.fillStyle = g; x.fill(SHR.body);
    x.strokeStyle = rgba(p.rim, 0.25); x.lineWidth = 0.018; x.stroke(SHR.lines);
    const rg = x.createLinearGradient(0, -0.15, 0, 0.02); rg.addColorStop(0, rgba(p.rim, 0.6)); rg.addColorStop(1, rgba(p.rim, 0));
    x.strokeStyle = rg; x.lineWidth = 0.024; x.stroke(SHR.body);
    x.fillStyle = L ? '#1a1214' : '#060406'; x.beginPath(); x.arc(0.385, -0.04, 0.032, 0, TAU); x.fill();
    x.fillStyle = rgba(p.eye, 0.8); x.beginPath(); x.arc(0.394, -0.05, 0.01, 0, TAU); x.fill();
    return (SSPR[L ? 1 : 0] = cv);
  }
  function shrimp(ctx, F, m, x, y, size, dir, p, A, vis) {
    const pal = F.pal.shrimp, px = 1 / size, ph = m.ph, t = F.t;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * size, size); ctx.rotate(p);
    // feelers and legs, thin, behind the body; the feelers trail and lag (their shapes reworked every third frame)
    if (!m.pc || (t + m.slot) % 3 === 0) {
      const feel = new Path2D(), swim = new Path2D(), w1 = Math.sin(t * 0.031 + m.wob), w2 = Math.sin(t * 0.026 + m.wob * 2);
      feel.moveTo(0.44, -0.03); feel.bezierCurveTo(0.8, -0.16, 0.3 + 0.05 * w1, -0.34, -0.8 + 0.06 * w2, -0.26 + 0.08 * w1);
      feel.moveTo(0.43, -0.015); feel.bezierCurveTo(0.74, -0.06, 0.2, -0.15 + 0.03 * w2, -1.0, -0.06 + 0.08 * w2);
      feel.moveTo(0.44, -0.025); feel.quadraticCurveTo(0.55, -0.075, 0.66, -0.06);
      for (let i = 0; i < 3; i++) { const bx = 0.3 - i * 0.08; feel.moveTo(bx, 0.04); feel.quadraticCurveTo(bx + 0.04, 0.1, bx + 0.012 * Math.sin(ph * 0.3 + i), 0.17); }
      for (let i = 0; i < 4; i++) { const bx = -0.02 - i * 0.07, by = 0.04, beat = Math.sin(ph - i * 0.9); swim.moveTo(bx, by); swim.quadraticCurveTo(bx - 0.01, by + 0.04, bx - 0.03 + 0.03 * beat, by + 0.075); } // swimmerets, beating in a wave
      m.pc = { feel, swim };
    }
    ctx.strokeStyle = rgb(mix(pal.top, pal.rim, 0.25)); ctx.lineWidth = 0.7 * px;
    ctx.globalAlpha = Math.min(1, A * F.body * 0.7); ctx.stroke(m.pc.feel);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.38); ctx.stroke(m.pc.swim);
    stampBox(ctx, shrimpSpr(F.L), SBOX, A * F.body, vis);
    ctx.globalCompositeOperation = F.add; ctx.globalAlpha = Math.min(1, A * F.lite * 0.8);
    const b = SHR.box; ctx.drawImage(lights(F.L ? 'shrimpL' : 'shrimpD', SHR.dots, pal.lite, F.L, b, 0.036), b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* ---------- anglerfish: a black, round, loose-skinned fish under its own little lamp ---------- */

  const ANG = (() => {
    const body = new Path2D();
    body.moveTo(0.44, -0.075);
    body.bezierCurveTo(0.43, -0.25, 0.26, -0.355, 0.05, -0.345);
    body.bezierCurveTo(-0.13, -0.335, -0.26, -0.22, -0.33, -0.08);
    body.lineTo(-0.36, -0.04); body.lineTo(-0.36, 0.04);
    body.bezierCurveTo(-0.3, 0.13, -0.16, 0.245, 0.04, 0.25);
    body.bezierCurveTo(0.26, 0.255, 0.43, 0.16, 0.51, 0.035);
    body.quadraticCurveTo(0.42, 0.02, 0.31, -0.008);
    body.quadraticCurveTo(0.39, -0.03, 0.44, -0.075);
    body.closePath();
    body.moveTo(-0.15, -0.3); body.quadraticCurveTo(-0.22, -0.39, -0.29, -0.36); body.quadraticCurveTo(-0.29, -0.24, -0.31, -0.14); body.closePath(); // dorsal fin
    body.moveTo(-0.17, 0.22); body.quadraticCurveTo(-0.25, 0.3, -0.3, 0.27); body.quadraticCurveTo(-0.3, 0.18, -0.31, 0.12); body.closePath(); // anal fin
    const tail = new Path2D();
    tail.moveTo(0.02, -0.045); tail.quadraticCurveTo(-0.1, -0.13, -0.19, -0.12); tail.quadraticCurveTo(-0.24, 0, -0.19, 0.12); tail.quadraticCurveTo(-0.1, 0.13, 0.02, 0.045); tail.closePath();
    const rays = new Path2D(); for (let i = -2; i <= 2; i++) { rays.moveTo(-0.01, i * 0.012); rays.lineTo(-0.19, i * 0.05); }
    const teeth = new Path2D();
    for (let i = 0; i < 6; i++) {
      const k = (i + 0.5) / 6, n = 1 - 0.55 * k;
      let bx = 0.44 + (0.31 - 0.44) * k, by = -0.075 + 0.067 * k + 0.004;
      teeth.moveTo(bx - 0.009, by); teeth.lineTo(bx + 0.003, by + 0.07 * n); teeth.lineTo(bx + 0.009, by); teeth.closePath();
      bx = 0.51 + (0.31 - 0.51) * k; by = 0.035 - 0.043 * k - 0.004;
      teeth.moveTo(bx - 0.009, by); teeth.lineTo(bx - 0.005, by - 0.06 * n); teeth.lineTo(bx + 0.009, by); teeth.closePath();
    }
    const pect = new Path2D(); pect.moveTo(0.06, 0.03); pect.quadraticCurveTo(-0.03, 0.04, -0.08, 0.12); pect.quadraticCurveTo(0.02, 0.135, 0.08, 0.07); pect.closePath();
    const folds = new Path2D(); // its loose skin
    folds.moveTo(0.12, -0.3); folds.quadraticCurveTo(0.18, -0.2, 0.15, -0.08);
    folds.moveTo(-0.04, -0.29); folds.quadraticCurveTo(0.03, -0.15, 0.0, -0.03);
    folds.moveTo(0.2, 0.2); folds.quadraticCurveTo(0.28, 0.12, 0.34, 0.04);
    return { body, tail, rays, teeth, pect, folds };
  })();
  function angler(ctx, F, c, A) {
    const pal = F.pal.angler, px = 1 / c.L, s1 = Math.sin(c.age * 0.021 + c.seed), s2 = Math.sin(c.age * 0.033 + c.seed * 2);
    const glow = (0.75 + 0.25 * Math.sin(c.age * 0.017 + c.seed)) * ease(c.vis); // the lure breathes
    const ex = 0.53 + 0.035 * s1, ey = -0.51 + 0.045 * s2;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.dir * c.L, c.L); ctx.rotate(c.p);
    const sil = new Path2D(); sil.addPath(ANG.body); sil.addPath(ANG.tail, new DOMMatrix().translateSelf(-0.35, 0).rotateSelf(Math.sin(c.ph) * 11));
    solid(ctx, sil, bodyGrad(F, 'angler', -0.35, 0.25), A * F.body, c.vis);
    ctx.save(); ctx.clip(sil); // the lure lights its own face
    if (!F.L) { ctx.globalCompositeOperation = 'lighter'; lit(ctx, aura(pal.lite), ex, ey, 0.95, A * 0.3 * glow); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = Math.min(1, A * F.body * 0.55); ctx.strokeStyle = rgba(pal.rim, 0.5); ctx.lineWidth = px; ctx.stroke(ANG.folds);
    ctx.restore();
    ctx.globalAlpha = Math.min(1, A * F.body * 0.6); ctx.strokeStyle = rimGrad(F, 'angler', -0.36, 0.05); ctx.lineWidth = 1.2 * px; ctx.stroke(ANG.body);
    ctx.save(); ctx.translate(-0.35, 0); ctx.rotate(Math.sin(c.ph) * 0.19); ctx.strokeStyle = rgba(pal.rim, 0.3); ctx.lineWidth = 0.8 * px; ctx.stroke(ANG.rays); ctx.restore();
    ctx.save(); ctx.translate(0.04, 0.05); ctx.scale(1, 0.75 + 0.25 * Math.sin(c.age * 0.06)); ctx.translate(-0.04, -0.05); // the little pectoral fin paddles
    ctx.globalAlpha = Math.min(1, A * F.body * 0.8); ctx.fillStyle = rgba(mix(pal.top, pal.rim, 0.25), 0.8); ctx.fill(ANG.pect); ctx.restore();
    ctx.globalAlpha = Math.min(1, A * (F.L ? 0.55 : 0.35 + 0.35 * glow)); ctx.fillStyle = rgb(pal.tooth); ctx.fill(ANG.teeth);
    ctx.globalAlpha = Math.min(1, A); ctx.fillStyle = F.L ? '#1a1a22' : '#030305'; ctx.beginPath(); ctx.arc(0.25, -0.17, 0.026, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(pal.eye, 0.7); ctx.beginPath(); ctx.arc(0.258, -0.178, 0.009, 0, TAU); ctx.fill();
    // the rod, bending as the lure bobs, and the lure
    ctx.globalAlpha = Math.min(1, A * F.body); ctx.strokeStyle = rgb(mix(pal.top, pal.rim, 0.35)); ctx.lineWidth = Math.max(0.9 * px, 0.012);
    ctx.beginPath(); ctx.moveTo(0.16, -0.335); ctx.quadraticCurveTo(0.3 + 0.03 * s1, -0.66, ex, ey + 0.02); ctx.stroke();
    ctx.lineWidth = 0.7 * px; ctx.beginPath(); ctx.moveTo(ex, ey + 0.03); ctx.quadraticCurveTo(ex + 0.02, ey + 0.06, ex + 0.015 + 0.012 * s1, ey + 0.09); ctx.moveTo(ex - 0.01, ey + 0.03); ctx.quadraticCurveTo(ex - 0.02, ey + 0.05, ex - 0.03, ey + 0.08 + 0.01 * s2); ctx.stroke();
    ctx.globalAlpha = Math.min(1, A * 0.8); ctx.fillStyle = rgba(mix(pal.lite, pal.top, 0.4), 0.8); ctx.beginPath(); ctx.ellipse(ex, ey + 0.008, 0.026, 0.032, 0, 0, TAU); ctx.fill(); // the bulb
    ctx.globalCompositeOperation = F.add;
    lit(ctx, aura(pal.lite), ex, ey, 0.42, A * (F.L ? 0.16 : 0.2) * glow);
    lit(ctx, lamp(pal.lite, F.L), ex, ey, 0.1, A * F.lite * glow);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* ---------- gulper eel: an enormous loose mouth on a tiny head, a whip of a body with a light at its tip ---------- */

  function gulper(ctx, F, c, A) {
    const pal = F.pal.gulper, N = 28, px = 1 / c.L, pts = c.pts || (c.pts = new Float32Array(N * 2));
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.dir * c.L, c.L); ctx.rotate(c.p);
    if (!c.pc || (c.age + c.slot) % 2 === 0) c.pc = gulperShape(c, pts, N);
    const { body, head, jaws, gape, pouch, ut } = c.pc, m = c.pc.m;
    if (c.vis > 0.004) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = c.vis; ctx.fillStyle = '#000'; ctx.fill(body); ctx.fill(head); ctx.fill(jaws); ctx.fill(pouch); ctx.fill(gape); ctx.globalCompositeOperation = 'source-over'; }
    gulperPaint(ctx, F, c, A, pal, px, body, head, jaws, gape, pouch, ut, m, pts, N);
    ctx.restore();
  }
  function gulperShape(c, pts, N) { // the body's wave and the jaws, worked out every other frame
    const m = c.mouth;
    for (let i = 0; i < N; i++) { const s = i / (N - 1), amp = 0.006 + 0.045 * s ** 1.3; pts[i * 2] = -s; pts[i * 2 + 1] = amp * Math.sin(TAU * 1.05 * s - c.ph); }
    const body = new Path2D(), wd = (s) => 0.02 * (1 - s) ** 1.2 + 0.0018, side = [];
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1], d = Math.hypot(tx, ty) || 1, w = wd(i / (N - 1));
      side.push([pts[i * 2] + (ty / d) * w, pts[i * 2 + 1] - (tx / d) * w, pts[i * 2] - (ty / d) * w, pts[i * 2 + 1] + (tx / d) * w]);
    }
    body.moveTo(side[0][0], side[0][1]);
    for (let i = 1; i < N; i++) body.lineTo(side[i][0], side[i][1]);
    for (let i = N - 1; i >= 0; i--) body.lineTo(side[i][2], side[i][3]);
    body.closePath();
    const back = new Path2D(); back.moveTo(side[2][2], side[2][3]); for (let i = 3; i < N; i++) back.lineTo(side[i][2], side[i][3]);
    const head = new Path2D(); head.ellipse(0.0, 0.0, 0.032, 0.023, 0, 0, TAU); // the small head
    const ut = [0.215, -0.022 - 0.045 * m], lt = [0.2, 0.018 + 0.11 * m]; // the tips of the jaws
    const jaws = new Path2D(); // long thin jaws hinged far back
    jaws.moveTo(-0.005, -0.02); jaws.quadraticCurveTo(0.1, -0.027 - 0.02 * m, ut[0], ut[1]); jaws.quadraticCurveTo(0.1, -0.013 - 0.02 * m, 0.02, -0.006); jaws.closePath();
    jaws.moveTo(0.02, 0.006); jaws.quadraticCurveTo(0.1, 0.012 + 0.05 * m, lt[0], lt[1]); jaws.quadraticCurveTo(0.1, 0.025 + 0.05 * m, -0.005, 0.02); jaws.closePath();
    const gape = new Path2D(); // the open mouth: dark inside
    gape.moveTo(0.02, -0.006); gape.quadraticCurveTo(0.1, -0.013 - 0.02 * m, ut[0], ut[1]); gape.lineTo(lt[0], lt[1]); gape.quadraticCurveTo(0.1, 0.012 + 0.05 * m, 0.02, 0.006); gape.closePath();
    const pouch = new Path2D(); // the pouch: skin slung below the lower jaw, back to the throat
    pouch.moveTo(lt[0], lt[1]); pouch.bezierCurveTo(lt[0] - 0.03, lt[1] + 0.04 + 0.05 * m, 0.06, 0.05 + 0.09 * m, -0.01, 0.022); pouch.quadraticCurveTo(0.1, 0.025 + 0.05 * m, lt[0], lt[1]); pouch.closePath();
    const sil = new Path2D(); sil.addPath(body); sil.addPath(head); sil.addPath(jaws); // all wound the same way: one fill, no darker overlaps
    return { body, back, head, jaws, gape, pouch, ut, m, sil };
  }
  function gulperPaint(ctx, F, c, A, pal, px, body, head, jaws, gape, pouch, ut, m, pts, N) {
    ctx.globalAlpha = Math.min(1, A * (F.L ? 0.2 : 0.45)); ctx.fillStyle = F.L ? 'rgb(30,26,40)' : 'rgb(0,0,0)'; ctx.fill(gape);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.75); ctx.fillStyle = grad(F, 'gulperPouch', 0, 0.02, 0, 0.16, [[0, rgb(pal.skin)], [1, rgb(mix(pal.skin, pal.bot, 0.6))]]); ctx.fill(pouch);
    ctx.strokeStyle = rgba(pal.rim, 0.4); ctx.lineWidth = 0.8 * px; ctx.stroke(pouch);
    solid(ctx, c.pc.sil, bodyGrad(F, 'gulper', -0.05, 0.05), A * F.body, 0);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.55); ctx.strokeStyle = rimGrad(F, 'gulper', -0.08, 0.03); ctx.lineWidth = 0.9 * px; ctx.stroke(c.pc.back); ctx.stroke(jaws);
    ctx.globalAlpha = Math.min(1, A); ctx.fillStyle = rgba(pal.eye, 0.8); ctx.beginPath(); ctx.arc(ut[0] - 0.03, ut[1] * 0.85 - 0.008, Math.max(0.005, 0.8 * px), 0, TAU); ctx.fill();
    const tx = pts[(N - 1) * 2], ty = pts[(N - 1) * 2 + 1], glow = (0.55 + 0.45 * Math.sin(c.age * 0.045 + c.seed) ** 2) * ease(c.vis);
    ctx.globalCompositeOperation = F.add;
    lit(ctx, aura(pal.lite), tx, ty, 0.07, A * 0.28 * glow);
    lit(ctx, lamp(pal.lite, F.L), tx, ty, Math.max(0.022, 3.5 * px), A * F.lite * glow);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- vampire squid, seen from above: mantle first, ear fins, eight arms webbed into a cloak ---------- */

  const VAMP = (() => {
    const mantle = new Path2D();
    mantle.moveTo(0.5, 0);
    mantle.bezierCurveTo(0.5, -0.09, 0.38, -0.14, 0.2, -0.145);
    mantle.bezierCurveTo(0.08, -0.15, 0.0, -0.15, -0.04, -0.12);
    mantle.quadraticCurveTo(-0.09, -0.07, -0.09, 0);
    mantle.quadraticCurveTo(-0.09, 0.07, -0.04, 0.12);
    mantle.bezierCurveTo(0.0, 0.15, 0.08, 0.15, 0.2, 0.145);
    mantle.bezierCurveTo(0.38, 0.14, 0.5, 0.09, 0.5, 0);
    mantle.closePath();
    return { mantle, box: [-0.12, -0.17, 0.53, 0.17] };
  })();
  const VSPR = [null, null];
  function vampSpr(L) {
    if (VSPR[L ? 1 : 0]) return VSPR[L ? 1 : 0];
    const ppu = 200, b = VAMP.box, cv = K.mk((b[2] - b[0]) * ppu, (b[3] - b[1]) * ppu), x = cv.getContext('2d'), p = PAL.vampire[L ? 1 : 0];
    x.scale(ppu, ppu); x.translate(-b[0], -b[1]);
    const g = x.createRadialGradient(0.3, -0.03, 0, 0.3, -0.03, 0.42); g.addColorStop(0, rgb(mix(p.top, p.rim, 0.2))); g.addColorStop(0.55, rgb(p.top)); g.addColorStop(1, rgb(p.bot));
    x.fillStyle = g; x.fill(VAMP.mantle);
    x.globalAlpha = 0.45; x.strokeStyle = rgba(p.rim, 0.6); x.lineWidth = 0.008; x.stroke(VAMP.mantle); x.globalAlpha = 1;
    for (const s of [-1, 1]) { // the big eyes
      x.fillStyle = L ? '#2a1420' : '#12060a'; x.beginPath(); x.ellipse(-0.01, 0.105 * s, 0.032, 0.026, 0, 0, TAU); x.fill();
      x.fillStyle = rgba(p.eye, 0.7); x.beginPath(); x.arc(-0.002, 0.105 * s - 0.006, 0.008, 0, TAU); x.fill();
    }
    return (VSPR[L ? 1 : 0] = cv);
  }
  function vampire(ctx, F, c, A) {
    const pal = F.pal.vampire, px = 1 / c.L, open = 0.5 + 0.5 * Math.sin(c.ph2), f = 0.55 + 0.45 * Math.cos(c.ph);
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.dir * c.L, c.L); ctx.rotate(c.p);
    if (!c.pc || (c.age + c.slot) % 3 === 0) c.pc = vampShape(c, open, f);
    const { web, arms, cirri, body, tips } = c.pc;
    if (c.vis > 0.004) { // it hides what is behind it
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = c.vis; ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.03;
      ctx.fill(web); ctx.fill(body); ctx.stroke(arms); ctx.globalCompositeOperation = 'source-over';
    }
    vampPaint(ctx, F, c, A, pal, px, web, arms, cirri, body, tips);
    ctx.restore();
  }
  function vampShape(c, open, f) {
    const B = [-0.06, 0], n = 8, spread = 0.36 + 0.42 * open, tips = [], wp = [], arms = new Path2D(), cirri = new Path2D();
    for (let i = 0; i < n; i++) {
      const q = (i / (n - 1)) * 2 - 1, a = Math.PI + spread * q, la = 0.46 * (0.94 + 0.06 * Math.sin(i * 1.7 + c.seed));
      const curl = (0.12 + 0.2 * (1 - open)) * q + 0.06 * Math.sin(c.age * 0.03 + i) - c.lag * 4;
      const cx = B[0] + Math.cos(a) * la * 0.55, cy = B[1] + Math.sin(a) * la * 0.55, tx = B[0] + Math.cos(a - curl) * la, ty = B[1] + Math.sin(a - curl) * la;
      const hx = tx - Math.sin(a - curl) * 0.035 * q, hy = ty + Math.cos(a - curl) * 0.035 * q; // the tips curl inward
      arms.moveTo(B[0], B[1]); arms.bezierCurveTo(cx, cy, tx, ty, hx, hy);
      const s = 0.62, u = 1 - s; wp.push([u * u * B[0] + 2 * u * s * cx + s * s * tx, u * u * B[1] + 2 * u * s * cy + s * s * ty]);
      if (c.L > 70) for (let k = 1; k <= 3; k++) { const tt = 0.25 + k * 0.12, v = 1 - tt, x = v * v * B[0] + 2 * v * tt * cx + tt * tt * tx, y = v * v * B[1] + 2 * v * tt * cy + tt * tt * ty, nx = -Math.sin(a), ny = Math.cos(a); cirri.moveTo(x, y); cirri.lineTo(x + nx * 0.02, y + ny * 0.02); cirri.moveTo(x, y); cirri.lineTo(x - nx * 0.02, y - ny * 0.02); }
      tips.push([hx, hy]);
    }
    const web = new Path2D(); web.moveTo(-0.03, 0.11); web.lineTo(wp[0][0], wp[0][1]);
    for (let i = 0; i < n - 1; i++) { const a0 = wp[i], a1 = wp[i + 1]; web.quadraticCurveTo(B[0] + ((a0[0] + a1[0]) / 2 - B[0]) * 0.8, B[1] + ((a0[1] + a1[1]) / 2 - B[1]) * 0.8, a1[0], a1[1]); }
    web.lineTo(-0.03, -0.11); web.closePath();
    const fins = new Path2D();
    for (const s of [-1, 1]) { fins.moveTo(0.41, 0.12 * s); fins.bezierCurveTo(0.44, (0.15 + 0.12 * f) * s, 0.4, (0.15 + 0.2 * f) * s, 0.33, (0.15 + 0.19 * f) * s); fins.bezierCurveTo(0.27, (0.15 + 0.18 * f) * s, 0.23, (0.15 + 0.07 * f) * s, 0.23, 0.135 * s); fins.closePath(); }
    const body = new Path2D(); body.addPath(VAMP.mantle); body.addPath(fins);
    return { web, arms, cirri, body, fins, tips };
  }
  function vampPaint(ctx, F, c, A, pal, px, web, arms, cirri, body, tips) {
    ctx.globalAlpha = Math.min(1, A * F.body * 0.85); ctx.fillStyle = rgrad(F, 'vampWeb', -0.06, 0, 0.42, [[0, rgb(mix(pal.web, pal.top, 0.3))], [0.6, rgb(pal.web)], [1, rgb(mix(pal.web, pal.bot, 0.5))]]); ctx.fill(web);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.5); ctx.strokeStyle = rgba(pal.rim, 0.5); ctx.lineWidth = 0.7 * px; ctx.stroke(cirri);
    ctx.strokeStyle = rgb(mix(pal.top, pal.bot, 0.25)); ctx.lineWidth = 0.024; ctx.globalAlpha = Math.min(1, A * F.body); ctx.stroke(arms);
    ctx.strokeStyle = rgba(pal.rim, 0.3); ctx.lineWidth = 0.7 * px; ctx.globalAlpha = Math.min(1, A * F.body * 0.6); ctx.stroke(web);
    solid(ctx, c.pc.fins, rgrad(F, 'vampBody', 0.3, -0.03, 0.42, [[0, rgb(mix(pal.top, pal.rim, 0.2))], [0.55, rgb(pal.top)], [1, rgb(pal.bot)]]), A * F.body, 0);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.45); ctx.strokeStyle = rgba(pal.rim, 0.6); ctx.lineWidth = 1.0 * px; ctx.stroke(c.pc.fins);
    stampBox(ctx, vampSpr(F.L), VAMP.box, A * F.body, 1); // the mantle and the big eyes, painted once; it hides the fins' roots behind it
    ctx.globalCompositeOperation = F.add;
    const spr = lamp(pal.lite, F.L), lid = (0.55 + 0.45 * Math.sin(c.age * 0.019 + c.seed) ** 2) * ease(c.vis);
    for (const s of [-1, 1]) lit(ctx, spr, 0.31, 0.118 * s, 0.07, A * F.lite * lid);
    for (const [x, y] of tips) lit(ctx, spr, x, y, 0.035, A * F.lite * 0.55 * ease(c.vis));
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- dumbo octopus: a bell of a head, two ear fins, a skirt of webbed arms ---------- */

  const DUMBO = (() => {
    const mantle = new Path2D();
    mantle.moveTo(-0.21, 0.05);
    mantle.bezierCurveTo(-0.29, -0.16, -0.21, -0.5, 0, -0.5);
    mantle.bezierCurveTo(0.21, -0.5, 0.29, -0.16, 0.21, 0.05);
    mantle.quadraticCurveTo(0, 0.15, -0.21, 0.05); // rounded underneath, over the skirt
    mantle.closePath();
    const crown = new Path2D(); // where the light from above falls
    crown.moveTo(-0.19, -0.32); crown.bezierCurveTo(-0.16, -0.45, -0.09, -0.485, 0, -0.485); crown.bezierCurveTo(0.09, -0.485, 0.16, -0.45, 0.19, -0.32);
    const fin = new Path2D(); // around its root, reaching out to the right
    fin.moveTo(0, -0.045); fin.bezierCurveTo(0.08, -0.11, 0.22, -0.1, 0.25, -0.02); fin.bezierCurveTo(0.26, 0.05, 0.1, 0.07, 0, 0.045); fin.closePath();
    return { mantle, crown, fin, box: [-0.32, -0.53, 0.32, 0.17] };
  })();
  const DSPR = [null, null];
  function dumboSpr(L) {
    if (DSPR[L ? 1 : 0]) return DSPR[L ? 1 : 0];
    const ppu = 200, b = DUMBO.box, cv = K.mk((b[2] - b[0]) * ppu, (b[3] - b[1]) * ppu), x = cv.getContext('2d'), p = PAL.dumbo[L ? 1 : 0];
    x.scale(ppu, ppu); x.translate(-b[0], -b[1]); x.lineCap = 'round';
    const g = x.createRadialGradient(-0.07, -0.33, 0, -0.07, -0.33, 0.55); g.addColorStop(0, rgb(mix(p.top, p.rim, 0.25))); g.addColorStop(0.45, rgb(p.top)); g.addColorStop(1, rgb(p.bot));
    x.fillStyle = g; x.fill(DUMBO.mantle);
    const rg = x.createLinearGradient(0, -0.5, 0, -0.12); rg.addColorStop(0, rgba(p.rim, 0.9)); rg.addColorStop(1, rgba(p.rim, 0));
    x.globalAlpha = 0.5; x.strokeStyle = rg; x.lineWidth = 0.012; x.stroke(DUMBO.crown); x.globalAlpha = 1;
    for (const s of [-1, 1]) {
      x.fillStyle = rgb(p.eye); x.beginPath(); x.ellipse(0.095 * s, -0.13, 0.034, 0.04, 0, 0, TAU); x.fill();
      x.fillStyle = rgba(p.lite, 0.7); x.beginPath(); x.arc(0.095 * s + 0.01, -0.143, 0.01, 0, TAU); x.fill();
      x.strokeStyle = rgba(p.rim, 0.4); x.lineWidth = 0.008; x.beginPath(); x.arc(0.095 * s, -0.13, 0.05, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); // a soft lid
    }
    return (DSPR[L ? 1 : 0] = cv);
  }
  function dumbo(ctx, F, c, A) {
    const pal = F.pal.dumbo, px = 1 / c.L, p = 0.5 + 0.5 * Math.sin(c.ph2), fl = Math.sin(c.ph);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.tilt); ctx.scale(c.L, c.L);
    if (!c.pc || (c.age + c.slot) % 2 === 0) { // its shapes, reworked every other frame
      const hw = 0.23 + 0.17 * p, ye = 0.31 - 0.08 * p, n = 7, tips = [];
      for (let j = 0; j < n; j++) { const q = (j / (n - 1)) * 2 - 1; tips.push([q * hw, ye + 0.05 * (1 - q * q) + 0.014 * Math.sin(c.age * 0.04 + j * 1.3 - c.ph2)]); }
      const web = new Path2D(); web.moveTo(-0.2, 0.0);
      web.quadraticCurveTo(-0.24 - 0.1 * p, 0.1, tips[0][0], tips[0][1]);
      for (let j = 0; j < n - 1; j++) { const a0 = tips[j], a1 = tips[j + 1]; web.quadraticCurveTo((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2 - 0.05 - 0.03 * p, a1[0], a1[1]); }
      web.quadraticCurveTo(0.24 + 0.1 * p, 0.1, 0.2, 0.0); web.closePath();
      const ang = (0.15 + 0.6 * fl) * DEG, fins = new Path2D();
      fins.addPath(DUMBO.fin, new DOMMatrix().translateSelf(0.19, -0.27).rotateSelf(-ang));
      fins.addPath(DUMBO.fin, new DOMMatrix().translateSelf(-0.19, -0.27).scaleSelf(-1, 1).rotateSelf(-ang));
      const arms = new Path2D(), cirri = new Path2D();
      for (const [x, y] of tips) { arms.moveTo(x * 0.2, 0.06); arms.quadraticCurveTo(x * 0.75, y * 0.55, x, y + 0.015); if (c.L > 60) for (let k = 1; k <= 3; k++) { const tt = 0.3 + k * 0.17, cx = x * (0.2 + 0.8 * tt), cy = 0.06 + (y - 0.06) * tt; cirri.moveTo(cx + 0.012, cy); cirri.arc(cx, cy, 0.012, 0, TAU); } }
      c.pc = { web, fins, arms, cirri };
    }
    const { web, fins, arms, cirri } = c.pc;
    if (c.vis > 0.004) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = c.vis; ctx.fillStyle = '#000'; ctx.fill(web); ctx.fill(DUMBO.mantle); ctx.fill(fins); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = Math.min(1, A * F.body * 0.8); ctx.fillStyle = grad(F, 'dumboWeb', 0, 0, 0, 0.36, [[0, rgb(pal.web)], [1, rgb(mix(pal.web, pal.bot, 0.55))]]); ctx.fill(web);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.55); ctx.strokeStyle = rgba(pal.rim, 0.45); ctx.lineWidth = 0.9 * px; ctx.stroke(arms);
    ctx.fillStyle = rgba(pal.rim, 0.3); ctx.fill(cirri);
    const g = rgrad(F, 'dumboBody', -0.07, -0.33, 0.55, [[0, rgb(mix(pal.top, pal.rim, 0.25))], [0.45, rgb(pal.top)], [1, rgb(pal.bot)]]);
    solid(ctx, fins, g, A * F.body * 0.9, 0);
    ctx.globalAlpha = Math.min(1, A * F.body * 0.5); ctx.strokeStyle = rgba(pal.rim, 0.4); ctx.lineWidth = 0.8 * px; ctx.stroke(fins);
    stampBox(ctx, dumboSpr(F.L), DUMBO.box, A * F.body, 1); // the head and its eyes, painted once; it hides the fins' roots and the skirt's top
    ctx.restore();
  }

  /* ---------- comb jelly: an egg of jelly with eight rows of beating combs that break the light into rainbows ---------- */

  const COMB_J = Array.from({ length: 9 }, (_, j) => { const th = Math.PI * (0.16 + (0.68 * j) / 8), d = 0.036 * Math.PI; return [Math.sin(th - d), -Math.cos(th - d), Math.sin(th + d), -Math.cos(th + d)]; }); // each comb plate along a row
  function combRows(ctx, F, c, A, front) {
    const RB = rainbow(F.L), px = 1 / c.L, ay = 0.5 * 1.01;
    ctx.lineWidth = Math.max(1.3 * px, 0.035);
    for (let k = 0; k < 8; k++) {
      const phi = c.rot + (k * Math.PI) / 4, cz = Math.cos(phi), ax = 0.31 * 1.03 * Math.sin(phi);
      if (front ? cz < 0 : cz >= 0) continue;
      const vis = A * F.lite * (front ? 0.45 + 0.55 * cz : 0.22 * (1 + cz));
      if (vis < 0.01) continue;
      for (let j = 0; j < 9; j++) {
        const q = COMB_J[j], idx = ((Math.floor(j * 1.5 - c.age * 0.2 + k * 2.1) % 14) + 14) % 14, pulse = 0.5 + 0.5 * Math.sin(j * 0.9 - c.age * 0.15 + k);
        ctx.globalAlpha = Math.min(1, vis * (0.3 + 0.7 * pulse));
        ctx.strokeStyle = RB[idx];
        ctx.beginPath(); ctx.moveTo(ax * q[0], ay * q[1]); ctx.lineTo(ax * q[2], ay * q[3]); ctx.stroke();
      }
    }
  }
  function comb(ctx, F, c, A) {
    const pal = F.pal.comb, px = 1 / c.L, a = c.age;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.tilt + (c.vy0 < 0 ? Math.PI : 0)); ctx.scale(c.L, c.L); // it swims mouth first
    if (!c.pc || (c.age + c.slot) % 3 === 0) c.pc = combTentacles(c, a); // reworked every third frame
    const { tent, hair } = c.pc;
    ctx.strokeStyle = rgb(pal.rim); ctx.lineWidth = 0.7 * px;
    ctx.globalAlpha = Math.min(1, A * 0.32); ctx.stroke(tent);
    ctx.globalAlpha = Math.min(1, A * 0.16); ctx.lineWidth = 0.6 * px; ctx.stroke(hair);
    combBody(ctx, F, c, A, pal, px);
    ctx.restore();
  }
  function combTentacles(c, a) { // two long tentacles in loose, unequal curves, fringed with fine side threads
    const tent = new Path2D(), hair = new Path2D();
    const up = c.vy0 < 0, base = up ? -Math.PI / 2 : Math.PI / 2; // rising, they stream out behind; sinking, they hang below
    for (const s of [-1, 1]) {
      const sd = c.seed + s * 2.3;
      let x = s * (up ? 0.2 : 0.27), y = up ? -0.22 : 0.08, ang = base + (up ? s : -s) * 0.35;
      tent.moveTo(x, y);
      for (let i = 1; i <= 13; i++) {
        ang += 0.3 * Math.sin(a * 0.016 - i * 0.5 + sd) * (0.3 + i / 13);
        ang += (base - ang) * 0.14;
        const nx = x + Math.cos(ang) * 0.13, ny = y + Math.sin(ang) * 0.13;
        tent.quadraticCurveTo(x + Math.cos(ang + 0.25 * s) * 0.065, y + Math.sin(ang + 0.25 * s) * 0.065, nx, ny);
        if (i > 2) { const l = 0.07 * (1 - i / 17), sw = 0.4 * Math.sin(a * 0.04 + i * 1.3); hair.moveTo(nx, ny); hair.quadraticCurveTo(nx + Math.cos(ang + s * 1.3) * l * 0.6, ny + Math.sin(ang + s * 1.3) * l * 0.6, nx + Math.cos(ang + s * (0.9 + sw)) * l, ny + Math.sin(ang + s * (0.9 + sw)) * l); }
        x = nx; y = ny;
      }
    }
    return { tent, hair };
  }
  const COMB_ELL = new Path2D(); COMB_ELL.ellipse(0, 0, 0.31, 0.5, 0, 0, TAU);
  function combBody(ctx, F, c, A, pal, px) {
    if (!F.L) ctx.globalCompositeOperation = 'lighter';
    combRows(ctx, F, c, A, false);
    ctx.globalCompositeOperation = 'source-over';
    const ell = COMB_ELL;
    solid(ctx, ell, grad(F, 'combBody', 0, -0.5, 0, 0.5, [[0, rgba(pal.body, 0.5)], [0.5, rgba(pal.body, 0.22)], [1, rgba(pal.body, 0.4)]]), A * (F.L ? 0.45 : 0.35), c.vis);
    ctx.globalAlpha = Math.min(1, A * 0.5); ctx.strokeStyle = rgba(pal.rim, 0.7); ctx.lineWidth = 0.9 * px; ctx.stroke(ell);
    ctx.beginPath(); ctx.moveTo(0, -0.3); ctx.quadraticCurveTo(0.03, 0.05, 0, 0.42); ctx.moveTo(-0.04, 0.42); ctx.lineTo(0.04, 0.42); // the gut and the mouth
    ctx.globalAlpha = Math.min(1, A * 0.3); ctx.lineWidth = 1.4 * px; ctx.stroke();
    ctx.fillStyle = rgba(pal.rim, 0.8); ctx.beginPath(); ctx.arc(0, -0.46, 0.025, 0, TAU); ctx.fill(); // the balance organ at the top
    if (!F.L) ctx.globalCompositeOperation = 'lighter';
    combRows(ctx, F, c, A, true);
    if (!F.L) lit(ctx, aura(pal.lite), 0, 0, 0.9, A * 0.045);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- siphonophore: a colony strung out on one stem, swimming bells in front, a light at every polyp ---------- */

  const BELL = (() => { // a swimming bell, its tip at +x, open at the back
    const outer = new Path2D();
    outer.moveTo(-0.9, -0.75); outer.bezierCurveTo(-0.2, -1.15, 0.9, -0.8, 1.1, 0); outer.bezierCurveTo(0.9, 0.8, -0.2, 1.15, -0.9, 0.75); outer.quadraticCurveTo(-0.55, 0, -0.9, -0.75); outer.closePath();
    const inner = new Path2D(); inner.moveTo(-0.65, -0.5); inner.quadraticCurveTo(0.55, -0.48, 0.6, 0); inner.quadraticCurveTo(0.55, 0.48, -0.65, 0.5);
    return { outer, inner };
  })();
  function siphon(ctx, F, c, A) {
    const pal = F.pal.siphon, nd = c.nodes, N = nd.length, L = c.L, a = c.age;
    const lw = Math.max(0.7, L * 0.003);
    // the stem
    ctx.beginPath(); ctx.moveTo(nd[0].x, nd[0].y);
    for (let i = 1; i < N - 1; i++) ctx.quadraticCurveTo(nd[i].x, nd[i].y, (nd[i].x + nd[i + 1].x) / 2, (nd[i].y + nd[i + 1].y) / 2);
    ctx.lineTo(nd[N - 1].x, nd[N - 1].y);
    ctx.globalAlpha = Math.min(1, A * 0.45); ctx.strokeStyle = rgb(pal.body); ctx.lineWidth = lw; ctx.stroke();
    // a fishing tentacle from each polyp: hanging, curling, left behind as the colony moves on
    const tent = new Path2D(), polyps = new Path2D(), back = -c.vx / Math.max(0.05, Math.abs(c.vx) + 0.05);
    for (let i = 7; i < N; i++) {
      const n = nd[i], tl = L * (0.07 + 0.06 * Math.sin(i * 1.3 + c.seed) ** 2), s1 = Math.sin(a * 0.017 + i * 0.7), s2 = Math.sin(a * 0.013 + i * 1.9);
      tent.moveTo(n.x, n.y);
      tent.bezierCurveTo(n.x + back * tl * 0.25 + s1 * tl * 0.15, n.y + tl * 0.35, n.x + back * tl * 0.45 - s2 * tl * 0.2, n.y + tl * 0.7, n.x + back * tl * 0.6 + s1 * tl * 0.2, n.y + tl);
      const r = L * 0.007;
      polyps.moveTo(n.x + r, n.y + r * 1.6); polyps.ellipse(n.x, n.y + r * 1.6, r, r * 1.7, 0, 0, TAU);
    }
    ctx.globalAlpha = Math.min(1, A * 0.24); ctx.lineWidth = lw * 0.7; ctx.stroke(tent);
    solid(ctx, polyps, rgba(pal.body, 0.6), A * 0.45, c.vis);
    // swimming bells near the front, alternating sides, pulsing in turn
    for (let i = 1; i <= 5; i++) { // each a little glassy bell, open at the back, its inner wall showing
      const n = nd[i], m = nd[i - 1], ang = Math.atan2(n.y - m.y, n.x - m.x), s = i % 2 ? 1 : -1, pump = 1 + 0.1 * Math.sin(a * 0.12 - i * 1.1), r = L * 0.021 * (1 - i * 0.05);
      ctx.save(); ctx.translate(n.x - Math.sin(ang) * s * r * 0.8, n.y + Math.cos(ang) * s * r * 0.8); ctx.rotate(ang + Math.PI + s * 0.35); ctx.scale(r * pump, r / pump);
      solid(ctx, BELL.outer, rgba(pal.body, 0.32), A * 0.6, c.vis);
      ctx.globalAlpha = Math.min(1, A * 0.45); ctx.strokeStyle = rgba(pal.rim, 0.75); ctx.lineWidth = (lw * 0.7) / r; ctx.stroke(BELL.outer);
      ctx.globalAlpha = Math.min(1, A * 0.3); ctx.stroke(BELL.inner);
      ctx.restore();
    }
    ctx.globalAlpha = Math.min(1, A * 0.7); ctx.fillStyle = rgb(pal.float); ctx.beginPath(); ctx.arc(nd[0].x, nd[0].y, Math.max(0.8, L * 0.007), 0, TAU); ctx.fill(); // the float
    // its lights, a slow wave of them running down the colony
    ctx.globalCompositeOperation = F.add;
    const spr = lamp(pal.lite, F.L), r = Math.max(1.6, L * 0.013), e = ease(c.vis);
    for (let i = 6; i < N; i++) { const w = Math.max(0, Math.sin(i * 0.45 - a * 0.04)) ** 2; lit(ctx, spr, nd[i].x, nd[i].y + L * 0.008, r * (0.8 + 0.4 * w), A * F.lite * (0.25 + 0.6 * w) * e); }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- sea angel: a glassy body, two wings rowing it upward, an orange heart of a gut ---------- */

  const ANGEL = (() => {
    const body = new Path2D();
    body.moveTo(0, -0.47);
    body.bezierCurveTo(0.075, -0.47, 0.105, -0.4, 0.085, -0.33);
    body.quadraticCurveTo(0.07, -0.29, 0.085, -0.25);
    body.bezierCurveTo(0.14, -0.12, 0.13, 0.12, 0.0, 0.5);
    body.bezierCurveTo(-0.13, 0.12, -0.14, -0.12, -0.085, -0.25);
    body.quadraticCurveTo(-0.07, -0.29, -0.085, -0.33);
    body.bezierCurveTo(-0.105, -0.4, -0.075, -0.47, 0, -0.47);
    body.closePath();
    const wing = new Path2D();
    wing.moveTo(0, -0.02); wing.bezierCurveTo(0.08, -0.1, 0.24, -0.1, 0.3, -0.03); wing.bezierCurveTo(0.26, 0.04, 0.1, 0.05, 0, 0.025); wing.closePath();
    return { body, wing };
  })();
  function angel(ctx, F, c, A) {
    const pal = F.pal.angel, px = 1 / c.L, beat = c.flap ? Math.sin(c.ph) : 0, rest = c.rest;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.tilt); ctx.scale(c.L, c.L);
    if (!c.pc || (c.age + c.slot) % 2 === 0) { // the wings, reworked every other frame
      const ang = (-0.15 - 0.6 * beat) * (1 - rest) - 0.9 * rest, w = new Path2D();
      w.addPath(ANGEL.wing, new DOMMatrix().translateSelf(0.07, -0.22).rotateSelf(ang * DEG));
      w.addPath(ANGEL.wing, new DOMMatrix().translateSelf(-0.07, -0.22).scaleSelf(-1, 1).rotateSelf(ang * DEG));
      c.pc = w;
    }
    const wings = c.pc;
    solid(ctx, wings, rgba(pal.body, 0.5), A * 0.6, c.vis);
    ctx.globalAlpha = Math.min(1, A * 0.55); ctx.strokeStyle = rgba(pal.rim, 0.8); ctx.lineWidth = 0.9 * px; ctx.stroke(wings);
    solid(ctx, ANGEL.body, grad(F, 'angelBody', 0, -0.47, 0, 0.5, [[0, rgba(pal.body, 0.55)], [0.6, rgba(pal.body, 0.32)], [1, rgba(pal.body, 0.12)]]), A, c.vis);
    ctx.globalAlpha = Math.min(1, A * 0.6); ctx.stroke(ANGEL.body);
    ctx.globalAlpha = Math.min(1, A * 0.3); ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(-0.055, -0.2); ctx.quadraticCurveTo(-0.1, 0.02, -0.035, 0.28); ctx.stroke(); // the glassy sheen down one side
    ctx.globalAlpha = Math.min(1, A * 0.6); ctx.lineWidth = 0.9 * px;
    ctx.beginPath(); ctx.moveTo(-0.035, -0.46); ctx.quadraticCurveTo(-0.05, -0.5, -0.06, -0.52); ctx.moveTo(0.035, -0.46); ctx.quadraticCurveTo(0.05, -0.5, 0.06, -0.52); ctx.stroke(); // its little horns
    ctx.globalAlpha = Math.min(1, A * (F.L ? 0.7 : 0.6)); ctx.fillStyle = rgb(pal.gut);
    ctx.beginPath(); ctx.ellipse(0, -0.02, 0.055, 0.15, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = Math.min(1, A * 0.4); ctx.beginPath(); ctx.arc(0, -0.37, 0.035, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------- the whale, far off ---------- */

  const WHALE = (() => {
    const body = new Path2D();
    body.moveTo(0.5, 0.004);
    body.bezierCurveTo(0.495, -0.04, 0.44, -0.07, 0.32, -0.082);
    body.bezierCurveTo(0.14, -0.1, -0.06, -0.098, -0.15, -0.084);
    body.quadraticCurveTo(-0.18, -0.104, -0.205, -0.098); // the small dorsal fin
    body.quadraticCurveTo(-0.215, -0.08, -0.23, -0.07);
    body.bezierCurveTo(-0.26, -0.06, -0.28, -0.05, -0.3, -0.045);
    body.lineTo(-0.3, 0.035);
    body.bezierCurveTo(-0.2, 0.06, -0.04, 0.09, 0.1, 0.09);
    body.bezierCurveTo(0.28, 0.09, 0.44, 0.06, 0.5, 0.004);
    body.closePath();
    const tail = new Path2D(); // around the tail stock: the stock and the flukes, seen almost edge-on
    tail.moveTo(0.02, -0.05);
    tail.bezierCurveTo(-0.04, -0.038, -0.09, -0.022, -0.13, -0.012);
    tail.quadraticCurveTo(-0.19, -0.03, -0.25, -0.036);
    tail.quadraticCurveTo(-0.215, -0.008, -0.235, 0.004);
    tail.quadraticCurveTo(-0.2, 0.012, -0.25, 0.03);
    tail.quadraticCurveTo(-0.18, 0.026, -0.13, 0.012);
    tail.bezierCurveTo(-0.09, 0.018, -0.04, 0.032, 0.02, 0.042);
    tail.closePath();
    const fin = new Path2D(); // the long flipper, around its root
    fin.moveTo(0.02, -0.01); fin.quadraticCurveTo(-0.08, 0.08, -0.26, 0.16); fin.quadraticCurveTo(-0.24, 0.172, -0.215, 0.166); fin.quadraticCurveTo(-0.08, 0.1, 0.03, 0.02); fin.closePath();
    const grooves = new Path2D();
    for (let i = 0; i < 6; i++) { const y = 0.027 + i * 0.01; grooves.moveTo(0.46 - i * 0.014, y * 0.9); grooves.quadraticCurveTo(0.3, y + 0.03, 0.12, 0.075 + i * 0.002); }
    return { body, tail, fin, grooves };
  })();
  function whale(ctx, F, wh) {
    const pal = F.pal.whale, px = 1 / wh.L, beat = Math.sin(wh.ph);
    ctx.save(); ctx.translate(wh.x, wh.y); ctx.scale(wh.dir * wh.L, wh.L); ctx.rotate(wh.p + beat * 0.006);
    const sil = new Path2D();
    sil.addPath(WHALE.body);
    sil.addPath(WHALE.tail, new DOMMatrix().translateSelf(-0.29, 0).rotateSelf(beat * 7));
    sil.addPath(WHALE.fin, new DOMMatrix().translateSelf(0.2, 0.06).rotateSelf(Math.sin(wh.ph * 0.5 + 1) * 4));
    solid(ctx, sil, rgb(pal.ink), F.L ? 0.16 : 0.62, 1); // it hides the light and the snow behind it: that is how it is seen
    if (!F.L) {
      ctx.globalAlpha = 0.07; ctx.strokeStyle = grad(F, 'whaleRim', 0, -0.1, 0, 0.0, [[0, rgba(pal.rim, 1)], [1, rgba(pal.rim, 0)]]); ctx.lineWidth = 1.5 * px; ctx.stroke(sil);
      ctx.globalAlpha = 0.035; ctx.strokeStyle = rgb(pal.rim); ctx.lineWidth = px; ctx.stroke(WHALE.grooves);
    }
    ctx.restore();
  }

  /* ---------- the floor: abyssal hills, pillow rocks, a vent among tube worms ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(5303), q = bg.dpr || 1;
    const fh = Math.max(pv ? 7 : 26, Math.min(H * 0.12, u * 0.12)); // the floor's height
    const top = Math.floor(H - fh * 2.8), lh = H - top, [floor, c] = K.layer(W, lh, q);
    c.translate(0, -top);
    const N = 128, X = (i) => -8 + ((W + 16) * i) / N, ventX = W * (pv ? 0.7 : 0.77);
    const far = K.ridge(R, N, 0.6), near = K.ridge(R, N, 0.48);
    const mound = (x) => Math.exp(-(((x - ventX) / (fh * 3.4)) ** 2)); // the floor rises around the vent
    const farY = (i) => H - fh * (0.6 + 0.8 * far[i]);
    const nearY = (i) => H - fh * (0.2 + 0.26 * near[i] + 0.38 * mound(X(i)));
    const yAt = (x) => { const f = ((x + 8) / (W + 16)) * N, i = Math.max(0, Math.min(N - 1, Math.floor(f))); return nearY(i) + (nearY(i + 1) - nearY(i)) * (f - i); };
    const inkFar = L ? [104, 150, 160] : [26, 44, 60], ink = L ? [40, 68, 80] : [3, 7, 12], tube = L ? [96, 116, 122] : [34, 44, 52], rimC = L ? [24, 46, 58] : [80, 116, 140];
    const lw = (v) => Math.max(pv ? 0.5 : 0.8, v);
    // far hills, hazy
    let g = c.createLinearGradient(0, H - fh * 1.5, 0, H);
    g.addColorStop(0, rgba(inkFar, L ? 0.55 : 0.7)); g.addColorStop(1, rgba(inkFar, L ? 0.2 : 0.3));
    c.fillStyle = g; c.beginPath(); c.moveTo(-8, H + 2); for (let i = 0; i <= N; i++) c.lineTo(X(i), farY(i)); c.lineTo(W + 8, H + 2); c.closePath(); c.fill();
    // the near floor, its rocks and chimneys: one shape, which hides the hills behind it
    const shapes = new Path2D();
    shapes.moveTo(-8, H + 2); for (let i = 0; i <= N; i++) shapes.lineTo(X(i), nearY(i)); shapes.lineTo(W + 8, H + 2); shapes.closePath();
    const blob = (cx, cy, rx, ry, rot) => { // a lump, not quite round: a ring of jittered points joined by smooth curves
      const n = 9, pts = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, j = 0.78 + R() * 0.36, x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = mid(pts[n - 1], pts[0]);
      shapes.moveTo(m0[0], m0[1]);
      for (let k = 0; k < n; k++) { const m = mid(pts[k], pts[(k + 1) % n]); shapes.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]); }
      shapes.closePath();
    };
    for (let i = 0; i < (pv ? 5 : 15); i++) { // pillow rocks, half sunk
      const x = R() < 0.4 ? ventX + (R() - 0.5) * fh * 5 : R() * W, r = fh * (0.06 + R() * 0.12), y = yAt(x);
      for (let k = 0, n = 2 + ((R() * 3) | 0); k < n; k++) blob(x + (R() - 0.5) * r * 2, y - r * (0.1 + R() * 0.35), r * (0.7 + R() * 0.6), r * (0.45 + R() * 0.3), (R() - 0.5) * 0.5);
    }
    const vents = [];
    const chimney = (x0, hgt, w0, w1, seed) => { // a crooked column with knobbly sides and a flange or two
      const base = yAt(x0) + fh * 0.05, n = 16, left = [], right = [];
      for (let k = 0; k <= n; k++) {
        const f = k / n, w = (w0 + (w1 - w0) * f ** 0.75) * (0.85 + 0.3 * R()), cx = x0 + Math.sin(f * 2.6 + seed) * fh * 0.09;
        left.push([cx - w, base - hgt * f]); right.push([cx + w * (0.85 + 0.25 * R()), base - hgt * f]);
      }
      shapes.moveTo(left[0][0], left[0][1]);
      for (let k = 1; k <= n; k++) shapes.lineTo(left[k][0], left[k][1]);
      const tp = left[n], tq = right[n];
      shapes.quadraticCurveTo((tp[0] + tq[0]) / 2, tp[1] - w1 * 0.5, tq[0], tq[1]);
      for (let k = n; k >= 0; k--) shapes.lineTo(right[k][0], right[k][1]);
      shapes.closePath();
      for (let k = 2; k < n - 1; k++) if (R() < 0.3) { const s = R() < 0.5 ? left[k] : right[k], wk = Math.abs(right[k][0] - left[k][0]); blob(s[0], s[1], wk * (0.16 + R() * 0.16), (hgt / n) * (0.6 + R() * 0.5), (R() - 0.5) * 0.6); }
      for (let k = 0; k < 2; k++) { const j = 4 + ((R() * (n - 7)) | 0), wk = Math.abs(right[j][0] - left[j][0]), sd = R() < 0.5 ? -1 : 1; blob((left[j][0] + right[j][0]) / 2 + sd * wk * (0.35 + R() * 0.25), left[j][1], wk * (0.5 + R() * 0.3), Math.max(1.2, fh * 0.04), (R() - 0.5) * 0.25); } // a ledge where hot water pooled
      vents.push({ x: (tp[0] + tq[0]) / 2, y: tp[1] - w1 * 0.3, w: w1 });
    };
    chimney(ventX, fh * (pv ? 1.3 : 1.8), fh * 0.22, fh * 0.07, 1);
    chimney(ventX - fh * 1.05, fh * 0.95, fh * 0.15, fh * 0.055, 3);
    if (!pv) chimney(ventX + fh * 1.15, fh * 0.5, fh * 0.11, fh * 0.06, 5);
    c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill(shapes); c.restore();
    g = c.createLinearGradient(0, H - fh * 2.6, 0, H);
    g.addColorStop(0, rgb(mix(ink, inkFar, 0.3))); g.addColorStop(0.45, rgb(ink)); g.addColorStop(1, rgb(ink));
    c.fillStyle = g; c.fill(shapes);
    { // rough rock and silt, not a flat cut-out: mottling inside the shape
      const tex = K.tint(K.noiseTex('dsRock', 256, 128, { px: 8, py: 4, oct: 5, lo: 0.42, hi: 0.8, warp: 1.2, seed: 41 }), L ? '#e8f0f2' : '#2c4252');
      c.save(); c.clip(shapes); c.globalCompositeOperation = 'source-atop';
      K.tile(c, tex, 0, top, W, lh, fh * 4, fh * 2, 0, 0, L ? 0.4 : 0.55);
      c.restore();
    }
    { // the light from far above, only on the tops: the shape less itself moved down a little
      const [rc0, rc] = K.layer(W, lh, q), d = Math.max(1, fh * 0.03);
      rc.translate(0, -top); rc.fillStyle = '#fff'; rc.fill(shapes);
      rc.globalCompositeOperation = 'destination-out'; rc.translate(0, d); rc.fill(shapes);
      rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalCompositeOperation = 'source-in'; rc.fillStyle = L ? 'rgba(0,0,0,0.5)' : rgba(rimC, 0.5); rc.fillRect(0, 0, rc0.width, rc0.height);
      if (L) { c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(rc0, 0, top, W, lh); c.restore(); } // on a light page, lit edges are paler: less ink
      else c.drawImage(rc0, 0, top, W, lh);
    }
    // tube worms in a thicket round the vent's foot (their red plumes move, so they are drawn each frame)
    const tubes = [];
    c.lineCap = 'round';
    for (let i = 0; i < (pv ? 6 : 18); i++) {
      const dx = (R() - 0.5) * fh * 2.8;
      if (Math.abs(dx) < fh * 0.22) continue;
      const x = ventX + dx, y = yAt(x) + fh * 0.06, h = fh * (0.18 + R() * 0.3) * Math.max(0.35, 1 - Math.abs(dx) / (fh * 1.6)), lean = (R() - 0.5) * fh * 0.08, wd = lw(fh * (0.03 + R() * 0.018));
      c.strokeStyle = rgb(tube); c.lineWidth = wd; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.5, y - h * 0.5, x + lean, y - h); c.stroke();
      c.strokeStyle = rgba(mix(tube, rimC, 0.5), 0.6); c.lineWidth = Math.max(0.5, wd * 0.35); c.beginPath(); c.moveTo(x - wd * 0.25, y); c.quadraticCurveTo(x + lean * 0.5 - wd * 0.25, y - h * 0.5, x + lean - wd * 0.25, y - h); c.stroke(); // lit on one side
      tubes.push({ x: x + lean, y: y - h, ph: R() * TAU, s: 0.8 + R() * 0.5, a: Math.atan2(-h, lean) });
    }
    // sea pens standing in the soft floor, away from the vent
    const pens = [];
    for (let i = 0; i < (pv ? 2 : 7); i++) {
      let x = W * (0.04 + R() * 0.6);
      if (Math.abs(x - ventX) < fh * 2.5) x = (x + W * 0.3) % (W * 0.65);
      pens.push({ x, y: yAt(x) + fh * 0.04, h: fh * (0.4 + R() * 0.4), ph: R() * TAU, lean: (R() - 0.5) * 0.3 });
    }
    return { floor, top, fh, vents, tubes, pens, ventX };
  }

  /* ---------- the state: shafts, snow, the creatures coming and going ---------- */

  const TYPES = { // w: how often; size: its length as a share of the scene; v: speed; band: the depths it keeps to; ext: how far it reaches past its centre (in lengths)
    lantern: { w: 14, size: [0.04, 0.054], v: 0.74, band: [0.12, 0.7], ext: 5.3, pv: 2.4, spark: 0.05 },
    shrimp: { w: 10, size: [0.05, 0.064], v: 0.4, band: [0.15, 0.8], ext: 4.6, pv: 2.2, spark: 0.03 },
    angler: { w: 8, size: [0.1, 0.13], v: 0.18, band: [0.5, 0.8], ext: 0.8, pv: 1.6, spark: 0.008 },
    gulper: { w: 6, size: [0.28, 0.38], v: 0.42, band: [0.18, 0.75], ext: 1.15, pv: 0.8, spark: 0.04 },
    vampire: { w: 8, size: [0.11, 0.14], v: 0.28, band: [0.2, 0.78], ext: 0.6, pv: 1.4, spark: 0.03 },
    dumbo: { w: 8, size: [0.085, 0.11], v: 0.21, band: [0.35, 0.8], ext: 0.65, pv: 1.4, spark: 0.02 },
    comb: { w: 9, size: [0.055, 0.075], v: 0.15, band: [0.12, 0.62], ext: 2.6, pv: 1.4, vert: true, spark: 0 },
    siphon: { w: 5, size: [0.34, 0.46], v: 0.24, band: [0.12, 0.6], ext: 1.15, pv: 0.7, spark: 0.02 },
    angel: { w: 9, size: [0.04, 0.052], v: 0.22, band: [0.12, 0.78], ext: 0.7, pv: 2.4, vert: true, spark: 0.008 },
  };
  const DRAW = { angler, gulper, vampire, dumbo, comb, siphon, angel };

  function init(V, S, L, h) {
    const { W, H, u, pv } = V, area = (W * H) / 40000;
    const U = pv ? 110 : Math.max(320, Math.min(1000, u)), k = (U / 800) * (pv ? 2.2 : 1), R = Math.random;
    const st = { kind: 'deepsea', key: S.key, U, k, h, g: {}, pal: {}, cr: [], sp: [], puffs: [], smoke: [], bub: [], recent: [], started: false, cur: 0,
      cap: pv ? 2 : W * H > 1.1e6 ? 4 : 3, next: pv ? 60 : 110 + R() * 90, whaleIn: pv ? 1e9 : 2400 + R() * 1800, whale: null, glowPen: -1, penIn: 500 + R() * 900 };
    for (const t in PAL) st.pal[t] = PAL[t][L ? 1 : 0];
    const xs = pv ? [0.3, 0.72] : [0.12, 0.34, 0.6, 0.84];
    st.shafts = xs.map((x) => ({ x: x + (R() - 0.5) * 0.08, w: W * (pv ? 0.22 : 0.09 + R() * 0.07), len: H * (0.5 + R() * 0.22), tilt: 0.15 + (R() - 0.5) * 0.08, a: L ? 0.55 + R() * 0.3 : 0.06 + R() * 0.04, ph: R() * TAU, sp: 0.004 + R() * 0.006, sw: 0.0012 + R() * 0.0015 }));
    const mk = (n, f) => Array.from({ length: Math.max(0, Math.round(n)) }, f);
    const s = pv ? 0.5 : Math.max(0.7, Math.min(1.2, u / 700));
    st.far = mk(pv ? 14 : area * 4.4, () => ({ k: (R() * 4) | 0, b: 0, x: R() * W, y: R() * H, a: 0.18 + R() * 0.22, v: (0.05 + R() * 0.06) * s, ph: R() * TAU, sw: 0.02 + R() * 0.03, r: (0.7 + R() * 0.5) * s }));
    st.mid = mk(pv ? 6 : area * 1.35, () => ({ k: (R() * 4) | 0, b: 0, x: R() * W, y: R() * H, a: 0.3 + R() * 0.25, v: (0.11 + R() * 0.1) * s, ph: R() * TAU, sw: 0.03 + R() * 0.04, d: (2.4 + R() * 1.6) * s }));
    st.near = mk(pv ? 1 : Math.max(3, area * 0.22), () => ({ x: R() * W, y: R() * H, a: 0.07 + R() * 0.07, v: (0.25 + R() * 0.15) * s, ph: R() * TAU, sw: 0.05 + R() * 0.05, d: (12 + R() * 12) * s, rot: R() * TAU, vr: (R() - 0.5) * 0.006, i: (R() * 4) | 0 }));
    return st;
  }

  function pickType(st, pv) {
    const w = {};
    let tot = 0;
    for (const t in TYPES) {
      if (pv && t === 'siphon') continue;
      let v = TYPES[t].w;
      if (st.cr.some((c) => c.type === t)) v = 0;
      if (st.recent.includes(t)) v *= 0.2;
      w[t] = v; tot += v;
    }
    let r = RND() * tot;
    for (const t in w) { r -= w[t]; if (r <= 0) return t; }
    return 'lantern';
  }

  /** A creature appears: from beyond the edge it is heading in from, or out of the dark (inView). */
  function spawn(st, F, type, inView) {
    const T = TYPES[type], { W, H, V } = F, pv = V.pv;
    const z = pv ? 0.55 + RND() * 0.45 : 0.15 + 0.85 * RND() ** 0.8, sc = 0.62 + 0.55 * z; // mostly middling, now and then one far off or close by
    const c = { type, z, A: 0.5 + 0.5 * z, L: F.U * (T.size[0] + RND() * (T.size[1] - T.size[0])) * sc * (pv ? T.pv : 1), dir: RND() < 0.5 ? -1 : 1, age: 0,
      ph: RND() * TAU, ph2: RND() * TAU, seed: RND() * 100, wf: rr(0.004, 0.009), vis: 1, out: false, life: null, p: 0, p0: (RND() - 0.5) * 0.12, lag: 0, tilt: 0, vy0: 0, vx: 0, mouth: 0.3, slot: (RND() * 3) | 0 };
    c.v = T.v * F.k * (0.6 + 0.6 * z) * rr(0.85, 1.15);
    c.ext = c.L * T.ext;
    let y0 = H * T.band[0], y1 = H * T.band[1];
    if (pv) { y0 = V.oy + F.h * 0.3; y1 = V.oy + F.h * 0.7; }
    let y = y0, best = -1;
    for (let k = 0; k < 5; k++) { const cy = y0 + RND() * (y1 - y0), d = st.cr.reduce((m, o) => Math.min(m, Math.abs(o.y - cy)), 1e9); if (d > best) { best = d; y = cy; } }
    if (T.vert) c.vy0 = type === 'angel' ? (RND() < 0.75 ? -1 : 1) : RND() < 0.5 ? -1 : 1;
    if (inView) { c.x = W * rr(0.15, 0.85); c.y = y; c.vis = 0; c.life = rr(700, 1300); }
    else if (T.vert && !pv) { c.x = W * rr(0.08, 0.92); c.y = c.vy0 < 0 ? H + c.ext : -c.L * 0.7; }
    else { c.x = c.dir > 0 ? -c.ext : W + c.ext; c.y = y; }
    if (type === 'lantern' || type === 'shrimp') { // a school, or a few together
      const n = type === 'lantern' ? (pv ? 3 : 4 + ((RND() * 6) | 0)) : pv ? 1 : 1 + ((RND() * 3) | 0), sp = type === 'lantern' ? [2.6, 1.3] : [2, 1.1];
      c.m = [];
      for (let i = 0; i < n * 8 && c.m.length < n; i++) {
        const m = { ox: (RND() * 2 - 1) * sp[0], oy: (RND() * 2 - 1) * sp[1], dz: RND() * 2 - 1, ph: RND() * TAU, sp: type === 'lantern' ? rr(0.17, 0.23) : rr(0.2, 0.28), male: RND() < 0.4, wob: RND() * TAU, slot: (RND() * 3) | 0 };
        if (c.m.every((o) => Math.hypot(o.ox - m.ox, (o.oy - m.oy) * 1.6) > 1.05)) c.m.push(m);
      }
      c.m.sort((a, b) => a.dz - b.dz);
    }
    if (type === 'comb') c.rot = RND() * TAU;
    if (type === 'angel') { c.flap = true; c.flapT = rr(200, 420); c.rest = 0; }
    if (type === 'siphon') {
      const n = 26, seg = c.L / (n - 1);
      c.nodes = [{ x: c.x, y: c.y }];
      for (let i = 1; i < n; i++) { const p = c.nodes[i - 1], th = 0.25 * Math.sin(i * 0.35 + c.seed); c.nodes.push({ x: p.x - c.dir * Math.cos(th) * seg, y: p.y + Math.sin(th) * seg }); } // laid out along a gentle wave, each link its full length
    }
    st.cr.push(c);
    st.cr.sort((a, b) => a.z - b.z);
    st.recent.unshift(type); st.recent.length = Math.min(st.recent.length, 3);
    return c;
  }

  function spark(st, x, y, r, F) {
    if (st.sp.length >= (F.V.pv ? 6 : 22)) return;
    st.sp.push({ x, y, r, age: 0, life: rr(40, 80), a: rr(0.35, 0.7) });
  }

  /** One frame of a creature's life: it moves, and fades in or out. Returns false when it has gone. */
  function step(st, c, F) {
    const { W, H } = F;
    c.age++;
    if (c.out) c.vis -= 1 / 150; else if (c.vis < 1) c.vis = Math.min(1, c.vis + 1 / 120);
    if (!c.out && c.life != null && --c.life <= 0) c.out = true;
    if (c.out && c.vis <= 0) return false;
    const T = TYPES[c.type], v = c.v, cur = st.cur * (0.4 + 0.6 * c.z), p1 = c.p;
    const steer = () => { // horizontal swimmers wander a little up and down and keep within the water
      if (c.y < H * 0.08) c.p0 = Math.abs(c.p0) + 0.04; else if (c.y > H * 0.86) c.p0 = -Math.abs(c.p0) - 0.04;
      c.p += (c.p0 + 0.1 * Math.sin(c.age * c.wf + c.seed) - c.p) * 0.02;
    };
    switch (c.type) {
      case 'lantern': { steer(); const go = v * (0.82 + 0.18 * Math.sin(c.age * 0.045 + c.seed)); c.x += c.dir * go * Math.cos(c.p) + cur; c.y += go * Math.sin(c.p); for (const m of c.m) m.ph += m.sp * (0.85 + 0.3 * Math.sin(c.age * 0.045 + c.seed)); break; }
      case 'shrimp': { steer(); const go = v * (0.65 + 0.35 * Math.sin(c.age * 0.1) ** 2); c.x += c.dir * go * Math.cos(c.p) + cur; c.y += go * Math.sin(c.p); for (const m of c.m) m.ph += m.sp; break; }
      case 'angler': { c.ph += 0.05; c.p = 0.06 * Math.sin(c.age * 0.006 + c.seed); const go = v * (0.45 + 0.55 * Math.max(0, Math.sin(c.age * 0.008 + c.seed))); c.x += c.dir * go + cur; c.y += Math.sin(c.age * 0.011 + c.seed) * 0.06 * F.k; break; }
      case 'gulper': { steer(); c.ph += 0.07; const go = v * (0.85 + 0.15 * Math.sin(c.ph)); c.x += c.dir * go * Math.cos(c.p) + cur; c.y += go * Math.sin(c.p);
        c.mouth = 0.25 + 0.75 * Math.max(0, Math.sin(c.age * 0.005 + c.seed)) ** 3; break; }
      case 'vampire': { steer(); c.ph += 0.08; c.ph2 += 0.022; const go = v * (0.45 + 0.9 * Math.max(0, -Math.cos(c.ph2)) ** 1.5); c.x += c.dir * go * Math.cos(c.p) + cur; c.y += go * Math.sin(c.p); break; }
      case 'dumbo': c.ph += 0.065; c.ph2 += 0.016; c.tilt += (c.dir * 0.14 + 0.05 * Math.sin(c.age * 0.01 + c.seed) - c.tilt) * 0.05;
        c.x += c.dir * v * (0.75 + 0.25 * Math.cos(c.ph)) + cur; c.y += -v * 0.3 * Math.cos(c.ph) + v * 0.15 * Math.sin(c.age * c.wf + c.seed) + (c.y > H * 0.82 ? -v * 0.3 : 0); break;
      case 'comb': c.rot += 0.006; c.tilt = 0.14 * Math.sin(c.age * 0.004 + c.seed); c.x += Math.sin(c.age * c.wf + c.seed) * v * 0.4 + cur; c.y += c.vy0 * v * (0.8 + 0.2 * Math.sin(c.age * 0.03)); break;
      case 'angel':
        if (--c.flapT <= 0) { c.flap = !c.flap; c.flapT = c.flap ? rr(200, 420) : rr(60, 150); }
        c.rest += ((c.flap ? 0 : 1) - c.rest) * 0.04;
        if (c.flap) c.ph += 0.15 * (1 - c.rest * 0.8);
        c.tilt = 0.12 * Math.sin(c.age * 0.006 + c.seed);
        c.x += Math.sin(c.age * c.wf + c.seed) * v * 0.3 + cur;
        c.y += c.vy0 < 0 ? -v * (1 - c.rest) * (0.6 + 0.4 * Math.sin(c.ph * 2) ** 2) + v * 0.25 * c.rest : v * 0.5;
        break;
      case 'siphon': {
        const nd = c.nodes, seg = c.L / (nd.length - 1);
        if (c.y < H * 0.1) c.p0 = 0.12; else if (c.y > H * 0.7) c.p0 = -0.12;
        c.hd = (c.dir > 0 ? 0 : Math.PI) + c.dir * (0.2 * Math.sin(c.age * c.wf + c.seed) + c.p0);
        const go = v * (0.8 + 0.2 * Math.sin(c.age * 0.06));
        c.vx = Math.cos(c.hd) * go; nd[0].x += c.vx + cur; nd[0].y += Math.sin(c.hd) * go;
        for (let i = 1; i < nd.length; i++) { const n = nd[i], m = nd[i - 1]; n.y += 0.002 * F.k; const dx = n.x - m.x, dy = n.y - m.y, d = Math.hypot(dx, dy) || 1; n.x = m.x + (dx / d) * seg; n.y = m.y + (dy / d) * seg; }
        c.x = nd[0].x; c.y = nd[0].y;
        break;
      }
    }
    c.lag += (c.p - p1 - c.lag) * 0.1; // how fast it is turning, for what trails behind
    // plankton flaring where it passes
    if (T.spark && RND() < T.spark * c.vis * (F.V.pv ? 0.3 : 1)) {
      let x = c.x - c.dir * c.L * 0.5, y = c.y;
      if (c.m) { const m = c.m[(RND() * c.m.length) | 0]; x = c.x + m.ox * c.L * 1.7 - c.dir * c.L * 0.5; y = c.y + m.oy * c.L * 1.3; }
      else if (c.type === 'siphon') { const n = c.nodes[(RND() * c.nodes.length) | 0]; x = n.x; y = n.y; }
      spark(st, x + (RND() - 0.5) * c.L * 0.3, y + (RND() - 0.5) * c.L * 0.3, rr(1.2, 2.4) * Math.max(0.6, F.U / 800), F);
    }
    if (c.type === 'shrimp' && !F.V.pv && RND() < 0.0006 && st.puffs.length < 2) { const m = c.m[0]; st.puffs.push({ x: c.x + m.ox * c.L * 1.7 + c.dir * c.L * 0.3, y: c.y + m.oy * c.L * 1.3, r: c.L * 0.5, age: 0, life: 220 }); }
    const e = c.ext + 40;
    if (c.type === 'siphon') { const tail = c.nodes[c.nodes.length - 1]; if ((c.dir > 0 && tail.x > W + 40) || (c.dir < 0 && tail.x < -40)) return false; return !(c.y < -e || c.y > H + e); }
    if (c.type === 'comb' || c.type === 'angel') return !(c.x < -e || c.x > W + e || c.y < -c.L * 0.8 - 40 || c.y > H + e);
    return !(c.x < -e || c.x > W + e || c.y < -e || c.y > H + e);
  }

  function drawCreature(ctx, c, F) {
    const A = c.A * ease(c.vis);
    if (A < 0.004) return;
    if (c.m) { // a school, or a few shrimp: each one its own size and swing
      const f = c.type === 'lantern' ? lanternfish : shrimp;
      for (const m of c.m) {
        const x = c.x + m.ox * c.L * 1.7 + Math.sin(c.age * 0.01 + m.wob) * c.L * 0.25, y = c.y + m.oy * c.L * 1.3 + Math.sin(c.age * 0.013 + m.wob * 1.7) * c.L * 0.2;
        f(ctx, F, m, x, y, c.L * (1 + 0.3 * m.dz), c.dir, c.p + 0.06 * Math.sin(c.age * 0.02 + m.wob), A * (0.92 + 0.08 * m.dz), c.vis);
      }
      return;
    }
    DRAW[c.type](ctx, F, c, A);
  }

  /* ---------- per frame ---------- */

  function water(ctx, st, F) {
    const { W, H, L, t } = F;
    if (!st.gw) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (L) { g.addColorStop(0, 'rgba(70,180,200,0.1)'); g.addColorStop(0.45, 'rgba(46,146,172,0.15)'); g.addColorStop(1, 'rgba(24,100,132,0.21)'); }
      else { g.addColorStop(0, 'rgba(86,150,182,0.09)'); g.addColorStop(0.22, 'rgba(60,112,150,0.035)'); g.addColorStop(0.5, 'rgba(20,40,60,0)'); g.addColorStop(1, 'rgba(0,3,8,0.24)'); }
      st.gw = g;
    }
    ctx.fillStyle = st.gw; ctx.fillRect(0, 0, W, H);
    // shafts from the surface: added light in the dark; on a light page they wear the teal away to the page
    const spr = st.shaftSpr || (st.shaftSpr = L ? shaftSpr() : K.tint(shaftSpr(), '#86bcd4'));
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    for (const s of st.shafts) {
      s.cx = s.x * W + Math.sin(t * s.sw * 0.7 + s.ph) * W * 0.015; s.ct = s.tilt + 0.03 * Math.sin(t * s.sw + s.ph * 2);
      s.ca = s.a * (0.62 + 0.38 * Math.sin(t * s.sp + s.ph));
      ctx.save(); ctx.translate(s.cx, -H * 0.03); ctx.rotate(s.ct);
      ctx.globalAlpha = s.ca; ctx.drawImage(spr, -s.w / 2, 0, s.w, s.len);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  /** How much a shaft lights a point (motes in the beam). */
  function inBeam(st, x, y, H) {
    let b = 0;
    for (const s of st.shafts) {
      const d = (y + H * 0.03) / Math.cos(s.ct);
      if (d <= 0 || d >= s.len) continue;
      const cx = s.cx - Math.sin(s.ct) * d, hw = (s.w / 2) * (0.3 + 0.7 * (d / s.len)), dx = Math.abs(x - cx);
      if (dx < hw) b += (1 - dx / hw) * (1 - d / s.len) * (s.ca / s.a);
    }
    return b;
  }
  function snowLayer(ctx, st, F, list, kind) {
    const { W, H, L } = F, col = SNOW[L ? 1 : 0], cur = st.cur;
    if (kind === 'far') { // specks sorted by brightness into a handful of shapes, each filled once
      const buckets = [null, new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (const p of list) {
        p.ph += p.sw * 0.4; p.y += p.v; p.x += cur * 0.4 + Math.sin(p.ph) * 0.03;
        if (p.y > H + 2) { p.y = -2; p.x = RND() * W; } if (p.x > W + 2) p.x -= W + 4; else if (p.x < -2) p.x += W + 4;
        if ((F.t + p.k) % 4 === 0) p.b = inBeam(st, p.x, p.y, H); // the shafts move slowly: each speck looks again every fourth frame
        const b = Math.min(7, Math.round(p.a * (1 - 0.45 * (p.y / H)) * (1 + 1.8 * p.b) * (L ? 1.1 : 1) * 10));
        if (b > 0) buckets[b].rect(p.x, p.y, p.r, p.r);
      }
      ctx.fillStyle = rgb(col);
      for (let b = 1; b < 8; b++) { ctx.globalAlpha = b / 10; ctx.fill(buckets[b]); }
    } else if (kind === 'mid') {
      const spr = st.dot || (st.dot = dotSpr(L));
      for (const p of list) {
        p.ph += p.sw * 0.3; p.y += p.v; p.x += cur * 0.7 + Math.sin(p.ph) * 0.05;
        if (p.y > H + p.d) { p.y = -p.d; p.x = RND() * W; } if (p.x > W + p.d) p.x -= W + p.d * 2; else if (p.x < -p.d) p.x += W + p.d * 2;
        if ((F.t + p.k) % 4 === 0) p.b = inBeam(st, p.x, p.y, H);
        ctx.globalAlpha = Math.min(1, p.a * (1 - 0.4 * (p.y / H)) * (1 + 1.4 * p.b));
        ctx.drawImage(spr, p.x - p.d / 2, p.y - p.d / 2, p.d, p.d);
      }
    } else {
      for (const p of list) {
        p.ph += p.sw * 0.12; p.y += p.v; p.x += cur * 1.2 + Math.sin(p.ph) * 0.08; p.rot += p.vr;
        if (p.y > H + p.d) { p.y = -p.d; p.x = RND() * W; } if (p.x > W + p.d) p.x -= W + p.d * 2; else if (p.x < -p.d) p.x += W + p.d * 2;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.a * (1 - 0.35 * (p.y / H))); ctx.drawImage(p.spr || (p.spr = flocSpr(p.i, L)), -p.d / 2, -p.d / 2, p.d, p.d);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function seafloor(ctx, st, S, F) {
    const { W, H, L, t, V } = F, fh = S.fh;
    // the vents' murk, rising in slow puffs, spreading and bending with the current (behind the chimneys)
    if (st.smoke.length < (V.pv ? 4 : 8)) for (let vi = 0; vi < S.vents.length; vi++) {
      if (RND() > (vi ? 0.025 : 0.05)) continue;
      const v = S.vents[vi];
      st.smoke.push({ x: v.x + (RND() - 0.5) * v.w * 0.6, y: v.y + v.w * 0.3, r0: v.w * 1.3, r1: fh * (0.55 + 0.35 * RND()) * (vi ? 0.65 : 1), age: 0, life: rr(240, 340) * (vi ? 0.75 : 1), i: (RND() * 3) | 0, ph: RND() * TAU });
    }
    const murk = st.murk || (st.murk = [0, 1, 2].map((i) => K.tint(smokeSpr(i), L ? '#5a6a72' : '#5c7486')));
    for (let i = st.smoke.length - 1; i >= 0; i--) {
      const p = st.smoke[i];
      p.age++;
      if (p.age >= p.life) { st.smoke.splice(i, 1); continue; }
      const q = p.age / p.life;
      p.y -= (0.32 - 0.18 * q) * st.k * (V.pv ? 0.5 : 1); p.x += st.cur * (0.4 + q) + Math.sin(p.age * 0.03 + p.ph) * 0.06 * st.k;
      const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(q), a = Math.sin(Math.PI * q) ** 1.3 * (L ? 0.13 : 0.09);
      ctx.globalAlpha = a; ctx.drawImage(murk[p.i], p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    K.stamp(ctx, S.floor, 0, S.top, W, H - S.top, L ? 0.42 : 0.85);
    // hot water shimmering just above the main vent: faint threads that waver and fade as they rise
    const v0 = S.vents[0], hh = fh * 1.1;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const x0 = v0.x + (k - 0.5) * v0.w * 0.8;
      ctx.moveTo(x0, v0.y);
      for (let y = 3; y <= hh; y += 3) ctx.lineTo(x0 + Math.sin(y * 0.2 - t * 0.21 + k * 2.1) * fh * 0.018 * (0.3 + y / hh) + st.cur * 6 * (y / hh) ** 2, v0.y - y);
    }
    ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter';
    ctx.globalAlpha = L ? 0.3 : 0.07; ctx.strokeStyle = grad(F, 'shimmer', 0, v0.y, 0, v0.y - hh, [[0, L ? 'rgba(0,0,0,1)' : 'rgba(150,196,220,1)'], [1, L ? 'rgba(0,0,0,0)' : 'rgba(150,196,220,0)']]); ctx.lineWidth = Math.max(0.7, fh * 0.02); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // a few bubbles from the vent's mouth
    if (!V.pv && st.bub.length < 6 && RND() < 0.02) { const v = S.vents[(RND() * S.vents.length) | 0]; st.bub.push({ x: v.x + (RND() - 0.5) * v.w, y: v.y, r: rr(0.8, 2) * Math.max(0.7, fh / 70), ph: RND() * TAU }); }
    ctx.strokeStyle = L ? 'rgb(40,80,100)' : 'rgb(170,214,236)'; ctx.lineWidth = 0.8;
    for (let i = st.bub.length - 1; i >= 0; i--) {
      const b = st.bub[i];
      b.ph += 0.12; b.y -= (0.35 + b.r * 0.15) * F.k; b.x += Math.sin(b.ph) * 0.25 + st.cur;
      const up = (v0.y - b.y) / (fh * 3.2);
      if (up > 1) { st.bub.splice(i, 1); continue; }
      ctx.globalAlpha = (L ? 0.4 : 0.3) * Math.min(1, (1 - up) * 3) * Math.min(1, (up + 0.1) * 6); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
    }
    // tube worms' red plumes and the sea pens' feathers sway slowly: their shapes are worked out every other frame
    if (!st.fp || t % 2 === 0) {
      const plumes = new Path2D(), pens = new Path2D();
      for (const tw of S.tubes) {
        const sw = Math.sin(t * 0.035 + tw.ph) * 0.2, l = fh * 0.062 * tw.s;
        for (let k = 0; k < 5; k++) {
          const a = tw.a + sw + (k / 4 - 0.5) * 0.8, bend = 0.35 * Math.sin(t * 0.05 + tw.ph + k);
          plumes.moveTo(tw.x, tw.y); plumes.quadraticCurveTo(tw.x + Math.cos(a) * l * 0.55, tw.y + Math.sin(a) * l * 0.55, tw.x + Math.cos(a + bend * 0.3) * l, tw.y + Math.sin(a + bend * 0.3) * l);
        }
      }
      for (const p of S.pens) { // a stalk and a feather of polyps
        const sw = Math.sin(t * 0.02 + p.ph) * p.h * 0.08 + p.lean * p.h * 0.3;
        pens.moveTo(p.x, p.y); pens.quadraticCurveTo(p.x + sw * 0.2, p.y - p.h * 0.5, p.x + sw, p.y - p.h);
        for (let k = 3; k < 10; k++) {
          const f = k / 10, x = p.x + sw * f * f, y = p.y - p.h * f, l = p.h * 0.15 * Math.sin(Math.PI * Math.min(1, (f - 0.2) / 0.82));
          pens.moveTo(x, y); pens.quadraticCurveTo(x - l * 0.5, y - l * 0.1, x - l, y - l * 0.75); pens.moveTo(x, y); pens.quadraticCurveTo(x + l * 0.5, y - l * 0.1, x + l, y - l * 0.75);
        }
      }
      st.fp = { plumes, pens };
    }
    ctx.globalAlpha = L ? 0.34 : 0.3; ctx.strokeStyle = L ? 'rgb(180,46,56)' : 'rgb(186,56,66)'; ctx.lineWidth = Math.max(0.7, fh * 0.014); ctx.stroke(st.fp.plumes);
    ctx.globalAlpha = L ? 0.42 : 0.45; ctx.strokeStyle = L ? 'rgb(40,74,88)' : 'rgb(70,98,116)'; ctx.lineWidth = Math.max(0.6, fh * 0.012); ctx.stroke(st.fp.pens);
    // now and then a sea pen glows when something brushes it
    if (!V.pv && --st.penIn <= 0) { st.glowPen = (RND() * S.pens.length) | 0; st.penAge = 0; st.penIn = 900 + RND() * 1500; }
    if (st.glowPen >= 0 && S.pens[st.glowPen]) {
      const p = S.pens[st.glowPen], age = ++st.penAge, env = Math.sin(Math.min(1, age / 150) * Math.PI);
      if (age >= 150) st.glowPen = -1;
      ctx.globalCompositeOperation = F.add;
      const spr = lamp(PEN[L ? 1 : 0], L), sw = Math.sin(t * 0.02 + p.ph) * p.h * 0.08 + p.lean * p.h * 0.3;
      for (let k = 3; k < 10; k++) { const f = k / 10, wave = Math.max(0, Math.sin(f * 5 - age * 0.08)); lit(ctx, spr, p.x + sw * f * f, p.y - p.h * f, p.h * 0.09, env * wave * 0.45); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  window.BG_EXT.deepsea = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.78, 1.7), { W, H, pv } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'deepsea' || st.key !== S.key) st = bg.st = init(V, S, L, h);
    const F = { ctx, L, t, W, H, V, h, st, U: st.U, k: st.k, add: L ? 'source-over' : 'lighter', body: L ? 0.6 : 0.66, lite: L ? 0.8 : 0.9, pal: st.pal };
    st.cur = (0.07 * Math.sin(t * 0.0013) + 0.035 * Math.sin(t * 0.0041 + 2)) * st.k;
    ctx.save(); ctx.translate(0, -V.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // creatures come and go one by one: a few at a time, never a crowd, never two arriving together
    if (!st.started) { st.started = true; const c = spawn(st, F, pickType(st, pv), true); if (pv) c.vis = 1; }
    if (--st.next <= 0) {
      if (st.cr.length < st.cap) { spawn(st, F, pickType(st, pv), RND() < (pv ? 0.6 : 0.35)); st.next = (pv ? 150 : 200) + RND() * (pv ? 200 : 300); }
      else st.next = 60 + RND() * 120;
    }

    // 1. the water: daylight's last trace at the top, deepening below; the shafts
    water(ctx, st, F);
    // 2. far snow, then the whale if one is passing (it hides the light and the snow behind it)
    snowLayer(ctx, st, F, st.far, 'far');
    if (!st.whale && --st.whaleIn <= 0) {
      const Lw = Math.max(W * 0.62, F.U * 1.05), dir = RND() < 0.5 ? -1 : 1;
      st.whale = { L: Lw, dir, x: dir > 0 ? -Lw * 0.62 : W + Lw * 0.62, y: H * rr(0.24, 0.42), p: (RND() - 0.5) * 0.05, ph: 0, v: (W + Lw * 1.3) / (30 * rr(95, 130)) };
    }
    if (st.whale) {
      const wh = st.whale;
      wh.ph += 0.035; wh.x += wh.dir * wh.v * (0.9 + 0.1 * Math.sin(wh.ph)); wh.y += Math.sin(wh.p) * wh.v * 0.3;
      whale(ctx, F, wh);
      if (RND() < 0.04) spark(st, wh.x - wh.dir * wh.L * rr(-0.3, 0.4), wh.y + wh.L * rr(0.06, 0.1), rr(1.2, 2.2), F);
      if ((wh.dir > 0 && wh.x > W + wh.L * 0.65) || (wh.dir < 0 && wh.x < -wh.L * 0.65)) { st.whale = null; st.whaleIn = 7200 + RND() * 6000; }
    }
    snowLayer(ctx, st, F, st.mid, 'mid');
    // 3. the floor
    seafloor(ctx, st, S, F);
    // 4. plankton sparks and glowing clouds, then the creatures, far to near
    ctx.globalCompositeOperation = F.add;
    const sc = lamp(SPARK[L ? 1 : 0], L);
    for (let i = st.sp.length - 1; i >= 0; i--) {
      const p = st.sp[i];
      p.age++; p.x += st.cur; p.y -= 0.02;
      if (p.age >= p.life) { st.sp.splice(i, 1); continue; }
      const env = Math.min(1, p.age / 10) ** 2 * (1 - p.age / p.life) ** 1.6;
      lit(ctx, sc, p.x, p.y, p.r * 2.4, p.a * env * F.lite);
    }
    for (let i = st.puffs.length - 1; i >= 0; i--) {
      const p = st.puffs[i];
      p.age++; p.x += st.cur;
      if (p.age >= p.life) { st.puffs.splice(i, 1); continue; }
      lit(ctx, aura(SPEW[L ? 1 : 0]), p.x, p.y, p.r * (1 + p.age / 50), (L ? 0.16 : 0.2) * Math.min(1, p.age / 14) ** 2 * (1 - p.age / p.life) ** 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    st.cr = st.cr.filter((c) => step(st, c, F));
    for (const c of st.cr) drawCreature(ctx, c, F);
    // 5. flocs of marine snow, close to the glass
    snowLayer(ctx, st, F, st.near, 'near');
    ctx.restore();
  };
})();
