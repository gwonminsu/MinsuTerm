'use strict';
/*
 * 백룸: rooms that should not be there, as found on an old camcorder tape. Mustard wallpaper with a faint damask,
 * damp mottled carpet, a drop ceiling of buzzing troffers (a few dead, a few stained or missing tiles), and
 * doorway after doorway opening onto more of the same. We drift forward, unsteadily, for ever: the plan repeats
 * every few rooms, so there is no seam to reach. Now and then the walk falters, stops, looks aside, goes on.
 *
 * Nothing is pre-painted: a pinhole camera looks down a grid of walls, painted far to near. Every wall is a slab
 * TH thick: its broad face, the ends that stand free, the jambs and the underside of each lintel are separate
 * faces, and each face first wears away what is behind it and is then laid in as a thin wash, so washes never
 * pile up and nothing shows through a nearer wall. Where a wall meets another, the faces that lie in one plane
 * overlap by a hair (no seam) and the ones that turn a corner get an inked edge. The theme's own background is
 * the dark at the end of every room.
 *
 * Once in a while (25-70 s apart, never the same twice running) one of the residents shows itself, far off and
 * briefly, placed in the plan like everything else so nearer walls hide it: a Smiler in a hall gone dark, a Hound
 * slinking across a doorway, a Faceling waiting (or walking past, or a small one peeking), a Skin-Stealer leaning
 * out from behind a jamb or standing under a dying tube, a Partygoer among balloons, a lone balloon, a Deathmoth
 * battering a tube, a shadow on the wall with nothing to cast it. bg.st.entityNow = '<name>' (or true) calls one.
 *
 * Over it all lies the tape: lifted blacks, a green-yellow cast, chroma fringes on the tubes, scanlines, grain,
 * a vignette, a tracking band drifting up now and then, a torn line when something is near, and REC in a corner.
 */
(function () {
  const K = window.SceneKit;
  const C = 3.6;          // a room: 3.6 m square
  const HC = 2.6;         // ceiling height
  const EYE = 1.55;       // eye height
  const LINTEL = 2.1;     // top of a doorway
  const TH = 0.14;        // how thick a wall is
  const SK = 0.1;         // the skirting board
  const NEAR = 0.22;      // nothing nearer than this is drawn
  const FAR = 32;         // by here everything has faded into the dark
  const X = 5;            // rooms drawn to each side of the one we walk through
  const P = 8;            // the plan repeats every P rows
  const NR = 8;           // rows drawn ahead
  const VHS = 2;          // how strongly the tape shows (0: a clean picture, 2: found footage; everything below is tuned at 2)
  const TAU = Math.PI * 2;
  const DIP = [0.12, 0.08, 0.9, 0.3, 0.06, 0.06, 1, 0.8, 0.15, 1, 0.5, 1]; // the lights stuttering, frame by frame
  // tone: per kind of face [r, g, b, alpha]: c faces us, s runs along our way, j a doorway's jamb, k the far jamb of a side doorway, o under a lintel.
  // A light page gets real values (pale cream toward us, darker along the sides, darker still in a doorway) and fades into a pale yellow haze (hz).
  const PAL = {
    D: { wall: '232,202,76', ceil: '222,216,180', floor: '142,122,70', ink: '12,11,3', grid: '228,226,196', tube: '240,250,214', pale: '226,222,204', skin: '204,178,96', sil: '4,3,1', aSil: 0.82,
      aCeil: 0.1, aFloor: 0.19, aInk: 0.5, aGrid: 0.1, hz: null, hzA: 0,
      tone: { c: [232, 202, 76, 0.24], s: [232, 202, 76, 0.18], j: [232, 202, 76, 0.153], k: [232, 202, 76, 0.216], o: [232, 202, 76, 0.135] } },
    L: { wall: '198,160,52', ceil: '200,186,132', floor: '120,92,38', ink: '84,66,34', grid: '104,88,50', tube: '255,255,240', pale: '252,250,240', skin: '214,176,58', sil: '40,30,16', aSil: 0.72,
      aCeil: 0.86, aFloor: 0.88, aInk: 0.4, aGrid: 0.42, hz: [160, 134, 60], hzA: 0.78, // by day still the backrooms: deep mustard that hides the page, a yellow haze far off
      tone: { c: [206, 168, 58, 0.96], s: [172, 138, 44, 0.97], j: [144, 114, 34, 0.98], k: [186, 150, 48, 0.96], o: [132, 104, 30, 0.97] } },
  };
  // the tape's colour: every paint washed out a little and pushed toward yellow-green (a third of the way at VHS 2)
  const GRADE = Math.min(0.6, 0.17 * VHS);
  const grade = (c) => { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return [c[0] + (l * 1.02 - c[0]) * GRADE, c[1] + (l * 1.05 - c[1]) * GRADE, c[2] + (l * 0.8 - c[2]) * GRADE].map((v) => Math.max(0, Math.min(255, Math.round(v)))); };
  for (const p of [PAL.D, PAL.L]) {
    for (const k of ['wall', 'ceil', 'floor', 'tube', 'skin', 'grid']) p[k] = grade(p[k].split(',').map(Number)).join(',');
    for (const t of Object.values(p.tone)) { const q = grade(t); t[0] = q[0]; t[1] = q[1]; t[2] = q[2]; }
    if (p.hz) p.hz = grade(p.hz);
  }
  const BAL = ['206,74,66', '72,118,206', '86,164,92', '212,118,168', '226,170,60'];
  const mod = (a, n) => ((a % n) + n) % n;
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hash = (a, b, c) => { let h = Math.imul(a + 101, 374761393) ^ Math.imul(b + 57, 668265263) ^ Math.imul(c + 13, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const fade = (d) => { const k = (FAR - d) / (FAR - 4); return k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(k, 1.25); };
  const pick = (a) => a[(Math.random() * a.length) | 0];

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

  /** The things drawn once per palette and reused: blotches, the wallpaper, a streak of damp, grain, a soft shadow. */
  function sprites(pal, L) {
    const can = (w, h) => { const c = K.mk(w, h); return [c, c.getContext('2d')]; };
    const R = K.rng(9);
    // a soft, uneven blotch (damp, a stain, a contact shadow): a few overlapping soft discs
    const [blot, b] = can(64, 64);
    for (let k = 0; k < 7; k++) {
      const x = 32 + (R() - 0.5) * (k ? 22 : 0), y = 32 + (R() - 0.5) * (k ? 22 : 0), r = k ? 9 + R() * 12 : 22;
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${pal.ink},${k ? 0.45 : 0.6})`); g.addColorStop(0.6, `rgba(${pal.ink},${k ? 0.25 : 0.4})`); g.addColorStop(1, `rgba(${pal.ink},0)`);
      b.fillStyle = g; b.fillRect(0, 0, 64, 64);
    }
    // a run of damp down the paper: a tide mark at the top and a few drips
    const [streak, s] = can(32, 128);
    { const g = s.createRadialGradient(16, 14, 0, 16, 14, 15); g.addColorStop(0, `rgba(${pal.ink},0.5)`); g.addColorStop(0.75, `rgba(${pal.ink},0.32)`); g.addColorStop(1, `rgba(${pal.ink},0)`); s.fillStyle = g; s.fillRect(0, 0, 32, 32); }
    for (let k = 0; k < 4; k++) {
      const x = 6 + R() * 20, len = 40 + R() * 80, g = s.createLinearGradient(0, 10, 0, 10 + len);
      g.addColorStop(0, `rgba(${pal.ink},0.3)`); g.addColorStop(1, `rgba(${pal.ink},0)`);
      s.fillStyle = g; s.fillRect(x - 1.5 - R(), 10, 3 + R() * 3, len);
    }
    // the wallpaper, one strip of it (0.45 m wide, floor to ceiling): a pair of thin stripes and a column of damask
    const [pap, p] = can(40, 232);
    p.fillStyle = `rgba(${pal.ink},0.9)`; p.fillRect(2.4, 0, 0.9, 232); p.fillRect(36.7, 0, 0.9, 232);
    p.fillStyle = `rgba(${pal.ink},0.42)`;
    for (let k = 0; k < 9; k++) {
      const y = 12 + k * 26, x = 20 + (k % 2 ? 0 : 0.5);
      p.beginPath(); // a small lozenge with two curls: damask, as far as anyone can tell from here
      p.moveTo(x, y - 7); p.quadraticCurveTo(x + 4.5, y - 2, x, y + 7); p.quadraticCurveTo(x - 4.5, y - 2, x, y - 7);
      p.moveTo(x - 1, y + 4); p.quadraticCurveTo(x - 9, y + 6, x - 7, y - 1); p.quadraticCurveTo(x - 6, y + 3, x - 1, y + 3);
      p.moveTo(x + 1, y + 4); p.quadraticCurveTo(x + 9, y + 6, x + 7, y - 1); p.quadraticCurveTo(x + 6, y + 3, x + 1, y + 3);
      p.fill();
      p.fillRect(x - 0.5, y + 9, 1, 3);
    }
    // grain: a tile of fine luma noise, some specks light and some dark
    const [grain, gr] = can(96, 96), im = gr.createImageData(96, 96), d = im.data;
    for (let k = 0; k < d.length; k += 4) {
      const r = R(), lit = r < 0.5, a = Math.pow(R(), 2.2);
      const v = L ? (lit ? 255 : 40) : (lit ? 236 : 0);
      d[k] = v; d[k + 1] = v; d[k + 2] = L ? v - 20 : v - 26; d[k + 3] = Math.round(a * 255 * (lit ? 1 : 0.8));
    }
    gr.putImageData(im, 0, 0);
    // scanlines: one dark line in three
    const [scan, sc] = can(4, 3); sc.fillStyle = L ? 'rgba(80,72,50,1)' : 'rgba(0,0,0,1)'; sc.fillRect(0, 2, 4, 1);
    // a strip of tape noise for the tracking band: short bright and dark dashes
    const [tape, tp] = can(256, 24);
    for (let k = 0; k < 140; k++) {
      const lit = R() < 0.6; tp.fillStyle = lit ? (L ? 'rgba(255,255,250,0.9)' : 'rgba(236,240,224,0.85)') : `rgba(${pal.ink},0.8)`;
      tp.fillRect(R() * 256, R() * 24, 4 + R() * 40, R() < 0.8 ? 1 : 2);
    }
    // the soft shadow of somebody standing (three frames of a slow walk), its edges blurred by stacking
    const shadow = [0, 1, 2].map((ph) => {
      const [c, x] = can(48, 128);
      x.fillStyle = `rgba(${pal.ink},0.075)`;
      const sw = [0, 0.08, -0.08][ph];
      for (let k = 0; k < 14; k++) {
        const ox = Math.cos(k * 2.4) * (1 + k * 0.33), oy = Math.sin(k * 2.4) * (1 + k * 0.33);
        x.beginPath();
        x.ellipse(24 + ox, 12 + oy, 6.2, 7.4, 0, 0, TAU);
        x.moveTo(15 + ox, 24 + oy); x.quadraticCurveTo(24 + ox, 20 + oy, 33 + ox, 24 + oy); x.lineTo(34 + ox, 62 + oy); x.lineTo(30 + ox, 70 + oy);
        x.lineTo(28 + ox + sw * 60, 124 + oy); x.lineTo(24.5 + ox, 124 + oy); x.lineTo(24 + ox, 74 + oy); x.lineTo(23.5 + ox, 124 + oy); x.lineTo(20 + ox - sw * 60, 124 + oy);
        x.lineTo(18 + ox, 70 + oy); x.lineTo(14 + ox, 62 + oy); x.closePath();
        x.fill();
      }
      return c;
    });
    // a moth's shadow, huge and soft
    const [mshadow, ms] = can(96, 64);
    ms.fillStyle = `rgba(${pal.ink},0.08)`;
    for (let k = 0; k < 12; k++) {
      const ox = Math.cos(k * 2.4) * (1 + k * 0.4), oy = Math.sin(k * 2.4) * (1 + k * 0.4);
      ms.beginPath();
      ms.moveTo(48 + ox, 18 + oy); ms.bezierCurveTo(30 + ox, 2 + oy, 6 + ox, 6 + oy, 8 + ox, 22 + oy); ms.bezierCurveTo(12 + ox, 34 + oy, 30 + ox, 32 + oy, 44 + ox, 34 + oy);
      ms.bezierCurveTo(30 + ox, 44 + oy, 26 + ox, 58 + oy, 36 + ox, 56 + oy); ms.lineTo(48 + ox, 44 + oy); ms.lineTo(60 + ox, 56 + oy);
      ms.bezierCurveTo(70 + ox, 58 + oy, 66 + ox, 44 + oy, 52 + ox, 34 + oy); ms.bezierCurveTo(66 + ox, 32 + oy, 84 + ox, 34 + oy, 88 + ox, 22 + oy);
      ms.bezierCurveTo(90 + ox, 6 + oy, 66 + ox, 2 + oy, 48 + ox, 18 + oy); ms.fill();
    }
    // a small soft glow (eyes and teeth in the dark)
    const [glow, gl] = can(32, 32);
    { const g = gl.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, `rgba(${pal.pale},0.9)`); g.addColorStop(0.4, `rgba(${pal.pale},0.35)`); g.addColorStop(1, `rgba(${pal.pale},0)`); gl.fillStyle = g; gl.fillRect(0, 0, 32, 32); }
    // a Deathmoth's wing pair (one side, the body at the right edge): dusty, banded, an eyespot on each wing that looks back like a face
    const [wing, wg] = can(96, 80);
    { const g = wg.createLinearGradient(96, 0, 0, 0); g.addColorStop(0, 'rgba(92,78,58,0.95)'); g.addColorStop(0.6, 'rgba(128,110,82,0.92)'); g.addColorStop(1, 'rgba(104,88,64,0.85)');
      wg.fillStyle = g; wg.beginPath();
      wg.moveTo(96, 26); wg.bezierCurveTo(70, 8, 30, 0, 4, 8); wg.bezierCurveTo(2, 22, 10, 36, 24, 40); wg.bezierCurveTo(50, 44, 76, 42, 96, 40); wg.closePath(); wg.fill();
      wg.beginPath(); wg.moveTo(96, 40); wg.bezierCurveTo(70, 44, 34, 52, 26, 64); wg.bezierCurveTo(22, 76, 40, 80, 58, 74); wg.bezierCurveTo(74, 68, 88, 56, 96, 50); wg.closePath(); wg.fill();
      wg.strokeStyle = 'rgba(52,42,28,0.5)'; wg.lineWidth = 2.2; wg.beginPath(); wg.moveTo(90, 24); wg.quadraticCurveTo(50, 14, 14, 18); wg.moveTo(88, 36); wg.quadraticCurveTo(52, 34, 22, 36); wg.stroke();
      wg.strokeStyle = 'rgba(160,142,110,0.35)'; wg.lineWidth = 1.5; wg.beginPath(); wg.moveTo(70, 46); wg.quadraticCurveTo(50, 56, 36, 66); wg.stroke();
      for (const [x, y, r] of [[40, 22, 10], [50, 62, 8]]) { // the eyespots: pale ring, dark eyes, a slit of a mouth
        wg.fillStyle = 'rgba(210,196,160,0.85)'; wg.beginPath(); wg.ellipse(x, y, r, r * 0.85, 0, 0, TAU); wg.fill();
        wg.fillStyle = 'rgba(30,22,14,0.95)'; wg.beginPath(); wg.ellipse(x, y, r * 0.72, r * 0.62, 0, 0, TAU); wg.fill();
        wg.fillStyle = 'rgba(214,204,176,0.9)'; wg.beginPath(); wg.arc(x - r * 0.3, y - r * 0.15, r * 0.14, 0, TAU); wg.arc(x + r * 0.28, y - r * 0.18, r * 0.12, 0, TAU); wg.fill();
        wg.strokeStyle = 'rgba(214,204,176,0.8)'; wg.lineWidth = 1; wg.beginPath(); wg.moveTo(x - r * 0.35, y + r * 0.25); wg.quadraticCurveTo(x, y + r * 0.45, x + r * 0.35, y + r * 0.22); wg.stroke();
      }
      wg.globalCompositeOperation = 'destination-out'; // a ragged, dusty edge
      for (let k = 0; k < 60; k++) { wg.fillStyle = `rgba(0,0,0,${0.3 + R() * 0.5})`; const a = R() * TAU; wg.beginPath(); wg.arc(48 + Math.cos(a) * 52, 40 + Math.sin(a) * 40, 1 + R() * 2.5, 0, TAU); wg.fill(); }
      wg.globalCompositeOperation = 'source-over'; }
    const [mbody, mb] = can(20, 56);
    for (let k = 0; k < 3; k++) { const g = mb.createRadialGradient(10, 18 + k * 12, 0, 10, 18 + k * 12, 10 - k); g.addColorStop(0, 'rgba(120,102,76,0.95)'); g.addColorStop(0.7, 'rgba(70,58,40,0.85)'); g.addColorStop(1, 'rgba(70,58,40,0)'); mb.fillStyle = g; mb.fillRect(0, 0, 20, 56); }
    // balloons, shaded: a highlight up on the left, the far side darker, the knot
    const bal = BAL.map((c) => {
      const [b0, bx] = can(40, 52), g = bx.createRadialGradient(14, 15, 1, 20, 22, 22);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.12, `rgba(${c},1)`); g.addColorStop(0.75, `rgba(${c},0.95)`); g.addColorStop(1, `rgba(${c.split(',').map((v) => Math.round(v * 0.55)).join(',')},0.95)`);
      bx.fillStyle = g; bx.beginPath(); bx.ellipse(20, 22, 17, 21, 0, 0, TAU); bx.moveTo(17, 45); bx.lineTo(23, 45); bx.lineTo(20, 41); bx.closePath(); bx.fill();
      return b0;
    });
    // the light a tube lays on the carpet (and round itself): one soft disc, drawn squashed and faint
    const [pool, pl] = can(64, 64);
    { const g = pl.createRadialGradient(32, 32, 0, 32, 32, 32), c = L ? '255,250,226' : pal.tube; g.addColorStop(0, `rgba(${c},1)`); g.addColorStop(1, `rgba(${c},0)`); pl.fillStyle = g; pl.fillRect(0, 0, 64, 64); }
    return { blot, streak, pap, grain, scan, tape, shadow, mshadow, glow, wing, mbody, bal, pool };
  }

  /** The washes of the ceiling and the floor and the ink of the ceiling grid, thinning with distance; the haze and the vignette. */
  function grads(ctx, pal, f, hy, W, H, L) {
    const mk = (y0, y1, dist, rgb, A, hz) => { // hz: a light page, where the far end is a pale haze, not the page
      const g = ctx.createLinearGradient(0, y0, 0, y1), c = rgb.split(',').map(Number);
      for (const o of [0, 0.03, 0.05, 0.07, 0.1, 0.14, 0.2, 0.28, 0.38, 0.5, 0.7, 1]) {
        const fd = fade(dist(o)), m = 1 - fd;
        g.addColorStop(o, hz ? `rgba(${(c[0] + (pal.hz[0] - c[0]) * m) | 0},${(c[1] + (pal.hz[1] - c[1]) * m) | 0},${(c[2] + (pal.hz[2] - c[2]) * m) | 0},${(A * fd + pal.hzA * m).toFixed(4)})` : `rgba(${rgb},${(A * fd).toFixed(4)})`);
      }
      return g;
    };
    const dc = (o) => (f * (HC - EYE)) / Math.max(1e-6, o * hy), df = (o) => (f * EYE) / Math.max(1e-6, o * (H - hy));
    const hc = L ? '232,214,140' : pal.ceil, haze = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, Math.max(W, H) * (L ? 0.17 : 0.22));
    haze.addColorStop(0, `rgba(${hc},${L ? 0.16 : 0.035})`); haze.addColorStop(1, `rgba(${hc},0)`);
    // the tape's vignette, over the whole picture (the text gets no calmer corner)
    const R = Math.hypot(W, H) * 0.56, vig = ctx.createRadialGradient(W * 0.5, H * 0.5, R * 0.42, W * 0.5, H * 0.5, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(0.6, L ? 'rgba(84,64,24,0.16)' : 'rgba(0,0,0,0.16)'); vig.addColorStop(1, L ? 'rgba(70,52,18,0.46)' : 'rgba(0,0,0,0.5)');
    // the tape's lifted blacks: an even veil
    const vt = Math.min(1.5, VHS / 2), vc = L ? '214,198,136' : '66,76,40', va = (L ? 0.035 : 0.1) * vt, veil = ctx.createLinearGradient(0, 0, W, H);
    veil.addColorStop(0, `rgba(${vc},${va})`); veil.addColorStop(0.45, `rgba(${vc},${va})`); veil.addColorStop(1, `rgba(${vc},${va})`);
    // a light page: the walls lit from the tubes above, darkening down toward the carpet (in screen space: every wall's
    // floor line lies below the horizon, its top above it, so one gradient serves them all)
    const wsh = ctx.createLinearGradient(0, 0, 0, H);
    wsh.addColorStop(0, 'rgba(255,248,206,0.16)'); wsh.addColorStop(Math.max(0.05, (hy / H) * 0.85), 'rgba(255,248,206,0)');
    wsh.addColorStop(Math.min(0.95, hy / H + 0.04), 'rgba(70,54,20,0)'); wsh.addColorStop(1, 'rgba(70,54,20,0.3)');
    return { ceil: mk(hy, 0, dc, pal.ceil, pal.aCeil, L), grid: mk(hy, 0, dc, pal.grid, pal.aGrid, false), floor: mk(hy, H, df, pal.floor, pal.aFloor, L), haze, vig, veil, wsh };
  }

  /*
   * The residents, built as Path2Ds in metres (feet at the origin, y up), one per material (cloth, skin, hair). Every
   * piece winds the same way (clockwise with y up), so a single nonzero fill covers overlaps once: no joints show.
   */
  /** A tapered limb from (x0, y0) to (x1, y1), rounded at both ends. */
  function limb(p, x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1e-6, nx = -dy / l, ny = dx / l;
    p.moveTo(x0 + nx * w0, y0 + ny * w0); p.lineTo(x1 + nx * w1, y1 + ny * w1); p.lineTo(x1 - nx * w1, y1 - ny * w1); p.lineTo(x0 - nx * w0, y0 - ny * w0); p.closePath();
    p.moveTo(x1 + w1, y1); p.arc(x1, y1, w1, 0, -TAU, true);
    p.moveTo(x0 + w0, y0); p.arc(x0, y0, w0, 0, -TAU, true);
  }
  function limb2(p, ax, ay, bx, by, cx, cy, w0, w1, w2) { limb(p, ax, ay, bx, by, w0, w1); limb(p, bx, by, cx, cy, w1, w2); }
  const oval = (p, x, y, rx, ry, rot) => { p.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); p.ellipse(x, y, rx, ry, rot || 0, 0, -TAU, true); };
  /** A closed polygon added clockwise whichever way its points were listed (mx: mirror in x). */
  function poly(p, pts, mx) {
    let a = 0;
    for (let k = 0, n = pts.length; k < n; k += 2) { const j = (k + 2) % n; a += (pts[k] * mx) * pts[j + 1] - (pts[j] * mx) * pts[k + 1]; }
    const n = pts.length / 2, rev = a > 0;
    for (let k = 0; k < n; k++) { const q = rev ? n - 1 - k : k; if (k) p.lineTo(pts[2 * q] * mx, pts[2 * q + 1]); else p.moveTo(pts[2 * q] * mx, pts[2 * q + 1]); }
    p.closePath();
  }
  /** Two-bone reach: where the joint goes on a limb from (ax, ay) toward (tx, ty) with bones l1, l2; up: the joint on the higher side. */
  function ik(ax, ay, tx, ty, l1, l2, up) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 1e-6;
    if (d > l1 + l2 - 1e-3) { const k = (l1 + l2 - 1e-3) / d; dx *= k; dy *= k; d = l1 + l2 - 1e-3; }
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))), b = Math.atan2(dy, dx);
    const p1y = ay + Math.sin(b + a) * l1, p2y = ay + Math.sin(b - a) * l1, s = (p1y > p2y) === up ? a : -a;
    return [ax + Math.cos(b + s) * l1, ay + Math.sin(b + s) * l1];
  }

  /**
   * A person, or something wearing the shape of one: { legs, top (shirt and arms), skin (head and hands), hd (the head) }.
   * o: h height, sh / hw half the shoulders / hips, neck, hr the head's half-height, arm (1: a normal reach), ph walking
   * phase (null: standing), stride, lean (the upper body tipped about the hips), tilt (the head), sway (idle), wob (the
   * outline crawling, as if the skin did not fit), sag (loose folds at the joints), fingers, wave (0..1: right arm up), t time.
   */
  function person(o) {
    const legs = new Path2D(), top = new Path2D(), skin = new Path2D();
    const pf = !!o.side, h = o.h, hr = o.hr || 0.115, nk = o.neck || 0.06, hipY = h * (o.hipK || 0.52), shY = h - 2 * hr - nk + 0.03, sh = pf ? 0.1 : o.sh || 0.2, hw = pf ? 0.1 : o.hw || 0.15, lk = o.limbK || 1; // pf: seen side on
    const wob = o.wob || 0, t = o.t || 0, lean = (o.lean || 0) + (o.sway ? Math.sin(t * 0.035) * o.sway : 0), cs = Math.cos(lean), sn = Math.sin(lean);
    const W = (k) => wob * Math.sin(t * (0.21 + k * 0.07) + k * 1.7);
    const U = (x, y) => [x * cs + (y - hipY) * sn, hipY - x * sn + (y - hipY) * cs];
    const ph = o.ph, st = o.stride || 0.32, kneeY = hipY * 0.5;
    for (const d of [-1, 1]) { // legs: swung from the hip, the knee bending on the way forward; shoes
      const q = ph == null ? 0 : ph + (d > 0 ? 0 : Math.PI), a = ph == null ? d * 0.035 + (o.sway ? Math.sin(t * 0.035 + d) * 0.01 : 0) : Math.sin(q) * st, bend = ph == null ? 0 : Math.max(0, Math.sin(q + 1.7)) * 0.6;
      const hx = pf ? d * 0.012 : d * hw * 0.55, kx = hx + Math.sin(a) * (hipY - kneeY), ky = hipY - Math.cos(a) * (hipY - kneeY);
      const fx = kx + Math.sin(a - bend) * kneeY, fy = Math.max(0.03, ky - Math.cos(a - bend) * kneeY);
      limb2(legs, hx, hipY + 0.02, kx, ky, fx, fy, 0.085 * lk, 0.055 * lk, 0.045 * lk);
      limb(legs, fx - 0.03, fy, fx + (o.foot ?? 0.1), Math.max(0.02, fy - 0.015), 0.035, 0.026);
      if (o.sag) oval(skin, kx + 0.01, ky - 0.05, 0.035 * lk, 0.05, 0.1 * d); // a fold hanging under the knee
    }
    // the trunk: shoulders, a slight waist, the hips (and with sag, a loose fold over the belt)
    const q = [-hw + W(0), hipY - 0.04, -hw * 1.02 + W(1), hipY + 0.12, -sh * 0.86 + W(2), shY - 0.2, -sh + W(3), shY - 0.05, -sh * 0.8, shY + 0.02, -0.07, shY + 0.05,
      0.07, shY + 0.05, sh * 0.8, shY + 0.02, sh + W(4), shY - 0.05, sh * 0.86 + W(5), shY - 0.2, hw * 1.02 + W(6), hipY + 0.12, hw + W(7), hipY - 0.04, 0, hipY - 0.08];
    if (o.sag) q.splice(20, 0, hw + 0.05 + W(8), hipY + 0.1, hw + 0.03, hipY + 0.02);
    const pts = [];
    for (let k = 0; k < q.length; k += 2) { const [x, y] = U(q[k], q[k + 1]); pts.push(x, y); }
    poly(top, pts, 1);
    const [nx0, ny0] = U(0, shY), [nx1, ny1] = U(o.headX || 0, shY + nk + 0.03);
    limb(skin, nx0, ny0, nx1, ny1, 0.05, 0.045);
    const tilt = (o.tilt || 0) + lean * 0.6, hx = nx1 + Math.sin(tilt) * hr * 0.9, hy = ny1 + Math.cos(tilt) * hr * 0.92;
    oval(skin, hx, hy, hr * 0.8, hr, -tilt);
    const al = o.arm || 1;
    for (const d of [-1, 1]) { // arms: hanging, swinging against the stride, or raised in a slow wave
      const [sx, sy] = U(pf ? d * 0.015 : d * sh * 0.88, shY - 0.05);
      let ex, ey, hx2, hy2;
      if (d > 0 && o.wave) { const a = 0.4 * Math.sin(t * 0.07); ex = sx + 0.14; ey = sy + 0.05 + 0.2 * o.wave; hx2 = ex + Math.sin(a) * 0.28 * o.wave; hy2 = ey + Math.cos(a) * 0.28 * o.wave; }
      else {
        const sw = ph == null ? (o.sway ? Math.sin(t * 0.035 + d) * 0.03 : 0) : Math.sin(ph + (d > 0 ? Math.PI : 0)) * (pf ? 0.4 : 0.24), out = pf ? 0 : d * (0.035 + (o.splay || 0));
        ex = sx + out + Math.sin(sw) * 0.3 * al; ey = sy - Math.cos(sw) * 0.3 * al;
        hx2 = ex + out * 0.4 + Math.sin(sw * 1.4 + (ph == null ? 0 : 0.2)) * 0.27 * al; hy2 = ey - Math.cos(sw * 1.4) * 0.28 * al;
      }
      limb2(top, sx, sy, ex, ey, hx2, hy2, 0.055, 0.042, 0.034);
      oval(skin, hx2, hy2 - 0.035, 0.03, 0.05, 0);
      if (o.sag) oval(top, ex + d * 0.012, ey - 0.04, 0.04, 0.055, 0); // the skin of the elbow, too loose
      if (o.fingers) for (const k of [-1, 0, 1]) limb(skin, hx2, hy2 - 0.04, hx2 + k * 0.022 + d * 0.01, hy2 - 0.04 - 0.13 * o.fingers, 0.01, 0.005);
    }
    return { legs, top, skin, hd: { hx, hy, hr, tilt } };
  }

  /** Something on all fours, gaunt, human once: its elbows and knees higher than its back, the hands and feet where the gait put them. */
  function houndBody(o) {
    const p = new Path2D(), hair = new Path2D(), shY = 0.7 + o.bob, hpY = 0.62 + o.bob * 0.6;
    const roots = [[0.24, shY, 0.5, 0.56, 0.044, 0.03, 0.02], [0.24, shY, 0.5, 0.56, 0.044, 0.03, 0.02], [-0.4, hpY, 0.46, 0.54, 0.06, 0.036, 0.022], [-0.4, hpY, 0.46, 0.54, 0.06, 0.036, 0.022]];
    for (const k of [1, 3, 0, 2]) { // far pair first
      const [rx, ry, l1, l2, w0, w1, w2] = roots[k], [fx, fy] = o.feet[k], dz = k & 1 ? 0.03 : 0, [jx, jy] = ik(rx - dz, ry, fx - dz, fy, l1, l2, true);
      limb2(p, rx - dz, ry, jx, jy, fx - dz, fy, w0, w1, w2);
      oval(p, jx, jy, w1 * 1.35, w1 * 1.2, 0); // a bony joint
      for (const s of [-1, 0, 1]) limb(p, fx - dz, fy, fx - dz + (k < 2 ? 0.08 : 0.07) + s * 0.012, Math.max(0.006, fy - 0.012 - s * 0.006), 0.012, 0.005); // long fingers / toes
    }
    const br = o.br;
    poly(p, [-0.5, 0.5, -0.54, 0.62 + br, -0.42, hpY + 0.1, -0.3, hpY + 0.075, -0.18, 0.7 + br, -0.06, 0.69, 0.06, 0.73 + br, 0.18, shY + 0.1, 0.3, shY + 0.07,
      0.34, shY - 0.05, 0.28, 0.52, 0.18, 0.47 - br, 0.12, 0.5, 0.04, 0.46 - br, -0.04, 0.5, -0.12, 0.48, -0.3, 0.51, -0.44, 0.46], 1);
    for (let k = 0; k < 6; k++) oval(p, -0.36 + k * 0.12, 0.69 + Math.sin(k * 1.3) * 0.02 + br, 0.022, 0.018, 0); // the spine, knuckle by knuckle
    const hx = 0.6 - o.look * 0.05 + o.hj, hy = 0.4 + o.look * 0.2 + br;
    limb(p, 0.28, shY + 0.02, hx - 0.06, hy + 0.03, 0.07, 0.05);
    oval(p, hx, hy, o.look > 0.5 ? 0.095 : 0.12, 0.088, o.look > 0.5 ? 0 : -0.25);
    for (let k = 0; k < 11; k++) { // matted hair down over the face, dragging behind the way it moves
      const x0 = hx + 0.06 - k * 0.032, y0 = hy + 0.075 - Math.abs(k - 3) * 0.008, len = 0.2 + ((k * 37) % 13) * 0.022, s = o.lag * (0.3 + k * 0.04) + Math.sin(o.t * 0.05 + k) * 0.01;
      limb(hair, x0, y0, x0 - s + 0.01, y0 - len, 0.02, 0.006);
    }
    return { p, hair, hx, hy };
  }

  /*
   * The residents' visits. One at a time: placed in the plan where the camera will see it (mostly one to three rooms
   * off), stepped every frame, and drawn from the wall loop when its spot comes up in the painter's order (its row,
   * its column), so nearer walls and jambs hide it. g: this frame's camera and helpers (see the frame function).
   */
  const ROW = (z) => Math.floor(z / C), COL = (x) => Math.round(x / C);
  const doorsAhead = (g, a, b) => { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0 + 1; j < g.j0 + NR; j++) { const d = (j + 1) * C - g.camZ; if (d >= a && d <= b && g.cr(j, 0) === 2) o.push(j); } return o; };
  const doorAhead = (g, a, b) => { const o = doorsAhead(g, a, b); return o.length ? pick(o) : null; };
  const hallAhead = (g, a, b, ok) => { if (g.loose) { a *= 0.8; b *= 1.5; } const o = []; for (let j = g.j0 + 1; j < g.j0 + NR; j++) { const d = (j + 0.5) * C - g.camZ; if (d >= a && d <= b && (!ok || ok(j))) o.push(j); } return o.length ? pick(o) : null; };
  const glitch = (st, n) => { st.gl = Math.max(st.gl, n); st.glY = Math.random(); st.glH = 0.03 + Math.random() * 0.09; st.glDX = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 18); };
  const flick = (a, k) => (hash(a >> 1, k, 77) < 0.5 ? 0.12 : 0.85); // a tube stuttering, two frames at a time
  /** Their own clock, which does not keep time: now and then it stops for a few frames, then catches up all at once. */
  const tick = (e, p) => { if (e.hold > 0) { if (--e.hold === 0) e.tt += e.held + 1; } else { e.tt++; if (Math.random() < p) { e.hold = 2 + ((Math.random() * 4) | 0); e.held = e.hold; } } };
  // what they are made of: [lit top, middle, feet] on a dark page and on a light one
  const TONE = {
    D: { cloth: ['58,55,46', '22,21,16', '6,5,3'], pants: ['42,40,35', '16,15,12', '4,4,2'], skin: ['98,90,74', '44,40,31', '14,12,8'], hound: ['70,63,50', '27,24,18', '7,6,3'], hair: ['32,29,21', '12,11,8', '4,3,2'],
      gaunt: ['178,166,144', '102,92,78', '34,30,23'], party: ['236,206,112', '180,148,62', '88,66,25'] },
    L: { cloth: ['116,106,86', '70,62,48', '38,32,22'], pants: ['84,76,62', '50,44,34', '26,22,15'], skin: ['148,134,112', '100,88,72', '56,48,38'], hound: ['112,100,80', '64,56,42', '32,26,17'], hair: ['58,50,38', '34,29,21', '18,15,10'],
      gaunt: ['170,154,128', '112,98,78', '56,46,33'], party: ['220,186,86', '170,134,52', '94,70,26'] },
  };

  /** Under the local transform: one material of a figure, with volume. Worn into what is behind; a rim of the tubes'
   * light left along its upper edges (lit inside the outline, the body laid in a pixel lower); lit at the head, dark at the feet. */
  function shade(g, p, op, top, lit, tn, k) {
    const ctx = g.ctx, a = op * (k || 0.92), r = lit * op;
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${op})`; ctx.fill(p); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.clip(p);
    if (r > 0.03) { ctx.fillStyle = `rgba(${g.L ? '255,250,232' : g.pal.tube},${(g.L ? 0.7 : 0.36) * r})`; ctx.fillRect(-3, -0.2, 6, top + 0.6); }
    const gr = ctx.createLinearGradient(0, top, 0, 0);
    gr.addColorStop(0, `rgba(${tn[0]},${a})`); gr.addColorStop(0.45, `rgba(${tn[1]},${a})`); gr.addColorStop(1, `rgba(${tn[2]},${a})`);
    ctx.translate(0, -g.rim); ctx.fillStyle = gr; ctx.fill(p);
    ctx.restore();
  }
  /** The local transform at a point (on the floor, or at height y): metres, y up, mirrored by dir. Returns px per metre, 0 if behind us. */
  function local(g, x, z, y, dir) {
    if (!g.pr(x, z, y || 0)) return 0;
    const s = g.f / g.sz; g.s = s; g.rim = Math.max(0.004, 1.4 / s);
    g.ctx.save(); g.ctx.translate(g.sx, g.sy); g.ctx.scale(s * (dir || 1), -s);
    return s;
  }
  /** A soft shadow on the carpet where something stands. */
  function contact(g, x, z, wm, op) {
    if (!g.pr(x, z, 0)) return;
    const s = g.f / g.sz, rw = wm * 0.5 * s, rh = rw * Math.min(1, EYE / g.sz) * 0.8;
    g.ctx.globalAlpha = (g.L ? 0.45 : 0.75) * op; g.ctx.drawImage(g.spr.blot, g.sx - rw, g.sy - rh, rw * 2, rh * 2); g.ctx.globalAlpha = 1;
  }
  const far = (z) => 0.5 + 0.5 * fade(z); // the haze takes the far ones
  const tones = (g) => TONE[g.L ? 'L' : 'D'];

  /** A Faceling's face: smooth and pale, turned t (0 away … 1 to us), the features it does not have pressing faintly from behind. */
  function blank(g, hd, t, op, lit) {
    if (t < 0.04) return;
    const ctx = g.ctx, k = Math.sin((t * Math.PI) / 2), r = hd.hr, w = r * 0.64 * k, a = (g.L ? 0.9 : 0.55) * op * (0.55 + 0.45 * lit);
    ctx.save(); ctx.translate(hd.hx + r * 0.3 * (1 - k), hd.hy - r * 0.06); ctx.rotate(-hd.tilt);
    const gr = ctx.createLinearGradient(0, r * 0.8, 0, -r * 0.8); gr.addColorStop(0, `rgba(${g.pal.pale},${a})`); gr.addColorStop(1, `rgba(${g.pal.pale},${a * 0.5})`);
    ctx.beginPath(); oval(ctx, 0, 0, w, r * 0.8, 0); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); oval(ctx, -w * 0.42, r * 0.16, w * 0.24, r * 0.1, 0.1); oval(ctx, w * 0.42, r * 0.14, w * 0.24, r * 0.1, -0.1); oval(ctx, 0, -r * 0.4, w * 0.32, r * 0.05, 0);
    ctx.fillStyle = `rgba(${g.pal.sil},${(g.L ? 0.16 : 0.2) * op * k})`; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.1); ctx.lineTo(0, -r * 0.2); ctx.strokeStyle = `rgba(${g.pal.pale},${0.6 * a})`; ctx.lineWidth = Math.max(0.004, 0.9 / g.s); ctx.stroke();
    ctx.restore();
  }
  /** A Skin-Stealer's face: borrowed, stretched long, sliding off true; another, smaller face pushing up under it. */
  function skinFace(g, hd, op) {
    const ctx = g.ctx, r = hd.hr, ink = g.pal.sil;
    ctx.save(); ctx.translate(hd.hx, hd.hy); ctx.rotate(-hd.tilt);
    ctx.beginPath(); oval(ctx, 0, -r * 0.14, r * 0.62, r * 0.98, 0.06); ctx.fillStyle = `rgba(${g.pal.pale},${(g.L ? 0.75 : 0.4) * op})`; ctx.fill();
    ctx.beginPath(); oval(ctx, r * 0.12, -r * 0.32, r * 0.34, r * 0.5, -0.15); ctx.strokeStyle = `rgba(${ink},${0.26 * op})`; ctx.lineWidth = Math.max(0.004, 0.9 / g.s); ctx.stroke();
    ctx.beginPath(); oval(ctx, 0, -r * 0.24, r * 0.06, r * 0.035, 0); oval(ctx, r * 0.24, -r * 0.28, r * 0.06, r * 0.035, 0); ctx.fillStyle = `rgba(${ink},${0.2 * op})`; ctx.fill();
    ctx.beginPath(); oval(ctx, -r * 0.25, r * 0.14, r * 0.15, r * 0.22, 0.25); oval(ctx, r * 0.26, r * 0.07, r * 0.13, r * 0.25, -0.2);
    ctx.moveTo(-r * 0.2, -r * 0.62); ctx.quadraticCurveTo(0, -r * 0.8, r * 0.22, -r * 0.68); ctx.quadraticCurveTo(0, -r * 1.0, -r * 0.2, -r * 0.62);
    ctx.fillStyle = `rgba(${ink},${(g.L ? 0.7 : 0.88) * op})`; ctx.fill();
    ctx.restore();
  }
  /** A balloon on its string (a shaded sprite, worn in so it hides what is behind); sc shrinks it as it goes soft. */
  function balloon(g, b, op) {
    if (!g.pr(b.x, b.z, b.y)) return;
    const ctx = g.ctx, s = g.f / g.sz, sc = b.sc == null ? 1 : b.sc, rx = 0.15 * sc * s, ry = 0.19 * sc * s, x = g.sx, y = g.sy, a = op * far(g.sz);
    if (ry < 0.8) return;
    const sw = Math.sin(g.fr * 0.05 + b.ph) * 0.06 * s;
    ctx.beginPath(); ctx.moveTo(x, y + ry * 1.1); ctx.bezierCurveTo(x + sw, y + ry + 0.3 * s, x - sw, y + ry + 0.55 * s, x + sw * 0.5, y + ry + 0.95 * s * (b.str || 1));
    ctx.strokeStyle = `rgba(${g.pal.ink},${0.45 * a})`; ctx.lineWidth = Math.max(0.6, s * 0.005); ctx.stroke();
    K.stamp(ctx, g.spr.bal[b.ci], x - rx * 1.18, y - ry * 1.05, rx * 2.36, ry * 2.6, (g.L ? 0.8 : 0.6) * a);
  }
  const REST = [0.5, 0.5, -0.6, -0.6];
  /** The Hound's gait: hands and feet stay where they were put; a diagonal pair is lifted and set down ahead together, the pairs taking turns. */
  function gait(e, dur, stride) {
    let moving = false;
    for (const f of e.feet) if (f.t > 0) { moving = true; f.t = Math.min(1, f.t + 1 / f.dur); f[0] = f.x0 + (f.x1 - f.x0) * ss(0, 1, f.t); f[1] = Math.sin(f.t * Math.PI) * 0.1; if (f.t >= 1) { f.t = 0; f[1] = 0; } }
    if (moving) return;
    const lag = (k) => (e.x + e.dir * (REST[k] + (k & 1 ? 0.07 : -0.03)) - e.feet[k][0]) * e.dir;
    for (const pr of e.lastPair === 0 ? [1, 0] : [0, 1]) {
      const ks = pr ? [1, 2] : [0, 3];
      if (Math.max(lag(ks[0]), lag(ks[1])) <= stride * 0.3) continue;
      for (const k of ks) { const f = e.feet[k]; f.t = 1e-6; f.dur = dur; f.x0 = f[0]; f.x1 = f[0] + e.dir * (lag(k) + stride * 0.45); }
      e.lastPair = pr; return;
    }
  }

  /*
   * ---- For whoever paints the residents: the override hook --------------------------------------------------------
   * A file such as scenes/br-ent-<name>.js can replace how one resident looks without touching this one:
   *   (window.BR_ENT = window.BR_ENT || {}).hound = { draw(e, g, j, c, BR) { … }, step(e, g, st, BR) { … }, wall(e, g, j, ed, BR) { … }, ceil(e, g, BR) { … } };
   * place(g, v, BR) may also be given: it chooses and places the visit itself (v: the variant asked for through the test
   * hook, e.g. 'hound:wallcrawl', or undefined for a random pick) and returns the visit object e (null: nowhere to put
   * it now; undefined: let the built-in place() do it). Built-in variants can be reached through BR.EV[name].place(g, v).
   * Mark a visit e.own = true to skip the built-in step for it (your step then drives it entirely: set e.vis, e.life, e.cl).
   * Every part is optional. step runs after the built-in step (same frame, it may add fields to e); draw / wall / ceil run
   * INSTEAD of the built-in ones. Each override call is wrapped in ctx.save() / restore() and try / catch: if it throws,
   * it is reported once (console.warn) and the built-in part is used from then on. window.BR holds the helpers (below).
   *
   * When they are called (the painter's order, far to near): ceil(e, g) once a frame right after the ceiling, before any
   * wall; then for every row j from j0 + 8 down to j0: the far walls of row j, then the side walls from the outside in,
   * with draw(e, g, j, c) called for each column slot c just before the side wall that is nearer the hall than column c
   * (left side: c = -6 … -1, right side: c = 6 … 1), wall(e, g, j, ed) right after side wall line ed (-5 … 6) has been
   * drawn, and finally draw(e, g, j, 0) for the hall itself. So: draw only the parts of you whose plan position is in row
   * j = ROW(z) and column c = COL(x), and nearer walls will cover you correctly. Most residents use row ROW(e.z), column 0.
   *
   * g (this frame; rebuilt every frame):
   *   ctx      the canvas context, in scene CSS px, already translated (head bob, picker strip offset, tape jitter);
   *            composite 'source-over', alpha 1 on entry. Wear away what is behind you (destination-out) before laying in.
   *   pr(x, z, y) → bool: project a plan point (metres; x across, z along the hall, y up from the floor) and set g.sx, g.sy
   *            (screen px) and g.sz (depth in metres); false if nearer than NEAR. px per metre there = g.f / g.sz.
   *   f, cx, hy  focal length (px), screen centre x, horizon y.      camX, camZ, yaw  the camera; j0 = ROW(camZ).
   *   L        light mode?   pal  the palette (PAL.L / PAL.D: wall, ink, pale, sil 'r,g,b' strings, aSil, tube, hz …).
   *   spr      cached sprites (blot, glow, pool, wing, mbody, bal[5], mshadow, shadow[3], streak, pap, grain, scan, tape).
   *   lum(i, j)  the light of room (column i, row j), 0..1, before the floor-wide dip; glob  the floor-wide dip (DIP), 0..1.
   *            A figure's light: g.lum(COL(x), ROW(z)) * g.glob.     fr  frame counter (30 fps).   bobS  sin of the step.
   *   cr(j, i), sd(j, e)  the plan: far wall of room (i, j) / side wall on line e of row j; 0 open, 1 wall, 2 doorway.
   *   s, rim   set by BR.local(): px per metre at the figure, and the rim-light offset in metres (≈ 1.4 px).
   *
   * e (the visit; e.k its name, e.age frames since it started, e.life, e.vis 0..1 visible, e.cl light overrides
   *   [[i, j, level], …] for rooms near it, e.tt its own stuttering clock (BR.tick), e.hold frames it is frozen):
   *   smiler      x, z (plan; face at y = 1.72 + e.rise), J (row), eye 0..1 (lids), grin 0..1, wide 0..1 (corners still
   *               stretching), open 0..1 (mouth parted), tilt (rad), rise (m). Drawn at row ROW(z), column 0.
   *   hound       x, z, dir (±1, the way it faces/moves), feet [4] = [worldX, liftY] (0, 1 fore; 2, 3 hind; planted by
   *               BR.gait), look 0..1 (head raised and turned to us), lag (hair trailing), bob, jy (jitter), hj (head
   *               twitch), age < 10: the low shadow dashing across first. Row ROW(z), column 0.
   *   faceling    v 'stand' | 'walk' | 'child'; x, z, dir (±1 facing), ph (walk phase, null when standing), turn 0..1
   *               (blank face turned to us), tilt, lean; child: side, two (a second, nearer doorway), J1. Row ROW(z), col 0.
   *   skinstealer v 'jamb' | 'light'; x, z, side (jamb: which side of the doorway it hides behind), lean (rad, toward the
   *               opening), tilt, idle (jerky sway phase); light: i (column). Row ROW(z), column 0 (light: column i).
   *   partygoer   x, z (moves one room nearer at age 177), fig (figure shown), wave 0..1, tilt (ticks ±0.24),
   *               bs [5 balloons {x, y, z, ci (sprite index), sc (deflate), str, ph}], pop (index popped), bits (pop specks).
   *   balloon     b {x, y, z, ci, sc, ph}. Row ROW(b.z), column 0.
   *   moth        x, y, z (it flies; row ROW(z), column COL(x)), fz (its tube), flap (cos of the beat: |flap| = wing
   *               opening), fp, vx/vy/vz, bump (frames the tube dims), dust [{x, y, z, life}], side; age < 46: only
   *               the shadow on the ceiling (drawn by ceil).
   *   shadow      J, ed (side wall line), xs (the wall's plane x), zp (centre along the wall), fr (0..2 walk frame),
   *               wd (width factor), op — drawn on the wall by wall(e, g, j, ed) right after that wall.
   */
  const EV = {
    /** A hall goes dark one tube at a time toward us; in it two eyes open (not a pair), then a grin spreads, wider than any
     * head, too many teeth, and parts. It rises and sinks with nothing under it, and snaps shut the moment before the light comes back. */
    smiler: {
      w: 1,
      place(g) { const J = hallAhead(g, 6.5, 10.5); return J == null ? null : { J, x: (Math.random() - 0.5) * 0.5, z: (J + 0.5) * C + 0.6, life: 262, tt: 0 }; },
      step(e, g, st) {
        const a = e.age, J = e.J;
        tick(e, 0.015);
        e.cl = [];
        [J + 1, J, J - 1].forEach((j, k) => {
          const t0 = k * 20;
          let v = a < t0 ? 1 : a < t0 + 16 ? flick(a, k) : a < 222 ? 0 : a < 234 ? flick(a + 1, k + 4) : 1;
          if (k === 2 && a > 118 && a < 205 && hash(a >> 2, 9, 1) < 0.16) v = 0.5; // the light near it keeps trying to come on
          e.cl.push([0, j, v]);
        });
        if (a === 215) glitch(st, 3);
        if (a === 222) st.flick = DIP.length;
        e.vis = a < 58 || a >= 221 ? 0 : ss(58, 72, a) * (e.cl[2][2] > 0.3 ? 0.45 : 1);
        e.eye = ss(60, 80, a) * (a > 170 && a < 174 ? 0.1 : 1);
        e.grin = ss(86, 150, a) * (1 - ss(213, 217, a));
        e.wide = ss(140, 215, a); // the corners keep stretching
        e.open = ss(160, 182, a) * (1 - ss(194, 206, a));
        e.tilt = ss(150, 195, a) * 0.42 + Math.sin(e.tt * 0.03) * 0.04;
        e.rise = Math.sin(e.tt * 0.018) * 0.14;
      },
      draw(e, g, j, c) {
        if (c !== 0 || j !== ROW(e.z) || !e.vis || !g.pr(e.x, e.z, 1.72 + e.rise)) return;
        const ctx = g.ctx, s = (g.f / g.sz) * 1.2, op = e.vis * far(g.sz), sx = g.sx, sy = g.sy, pal = g.pal;
        ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.globalAlpha = (g.L ? 0.4 : 0.55) * op; // the dark it stands in, deeper round it
        ctx.drawImage(g.spr.blot, sx - s * 1.1, sy - s, s * 2.2, s * 2.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        if (!g.L && e.grin > 0.1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * op * e.grin; ctx.drawImage(g.spr.glow, sx - s * 1.3, sy - s * 0.9, s * 2.6, s * 2.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s); ctx.rotate(e.tilt);
        const w = 0.1 + 0.62 * e.grin + 0.16 * e.wide * e.grin, cu = 0.05 + 0.12 * e.grin + 0.05 * e.wide, ty = 0.1, y0 = ty - cu, cU = ty + 0.06, th = 0.032, cL = cU + 4 * th + 0.22 * e.open;
        const Y = (t, cc) => y0 + 2 * t * (1 - t) * (cc - y0), N = 26;
        const eyes = [[-0.105, -0.085, 1, 0.12], [0.1, -0.06, 1.3, -0.1]]; // not a pair: one higher, one larger
        if (e.eye > 0.02) {
          if (!g.L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * op; for (const [x, y, k] of eyes) ctx.drawImage(g.spr.glow, x - 0.1 * k, y - 0.08 * k, 0.2 * k, 0.16 * k); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
          ctx.beginPath();
          for (const [x, y, k, r] of eyes) { const hw = 0.048 * k, hh = 0.03 * k * e.eye; ctx.moveTo(x - hw, y); ctx.quadraticCurveTo(x, y - hh * 2 + r * 0.02, x + hw, y + r * 0.03); ctx.quadraticCurveTo(x, y + hh * 1.4, x - hw, y); }
          ctx.fillStyle = `rgba(${pal.pale},${(g.L ? 0.95 : 0.8) * op})`; ctx.fill();
          if (g.L) { ctx.strokeStyle = `rgba(${pal.ink},${0.5 * op})`; ctx.lineWidth = 1 / s; ctx.stroke(); }
          ctx.beginPath(); for (const [x, y, k] of eyes) oval(ctx, x + 0.004, y + 0.002, 0.009 * k, 0.012 * k * e.eye, 0); ctx.fillStyle = `rgba(${pal.sil},${0.9 * op})`; ctx.fill(); // pinprick pupils
        }
        if (e.grin > 0.01) {
          if (!g.L) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * op; ctx.drawImage(g.spr.glow, -w * 0.62, y0 - 0.08, w * 1.24, 0.34); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
          ctx.beginPath(); ctx.moveTo(-w / 2, y0); ctx.quadraticCurveTo(0, cU, w / 2, y0); ctx.quadraticCurveTo(0, cL, -w / 2, y0); // lips to lips, filled with teeth
          ctx.fillStyle = `rgba(${pal.pale},${(g.L ? 0.95 : 0.72) * op})`; ctx.fill();
          ctx.strokeStyle = `rgba(${pal.sil},${(g.L ? 0.55 : 0.6) * op})`; ctx.lineWidth = 1.1 / s; ctx.stroke();
          const gT = cU + 2 * th, gB = cL - 2 * th;
          if (gB > gT + 0.004) { ctx.beginPath(); ctx.moveTo(-w / 2, y0); ctx.quadraticCurveTo(0, gT, w / 2, y0); ctx.quadraticCurveTo(0, gB, -w / 2, y0); ctx.fillStyle = `rgba(${pal.sil},${0.9 * op})`; ctx.fill(); }
          if (s * w > 18) { // every tooth, upper row and lower
            ctx.beginPath();
            for (let k = 1; k < N; k++) { const t = k / N, x = -w / 2 + w * t; ctx.moveTo(x, Y(t, cU) + 0.002); ctx.lineTo(x, Y(t, gT)); ctx.moveTo(x, Y(t, gB)); ctx.lineTo(x, Y(t, cL) - 0.002); }
            ctx.strokeStyle = `rgba(${pal.sil},${(g.L ? 0.4 : 0.55) * op})`; ctx.lineWidth = 0.8 / s; ctx.stroke();
          }
        }
        ctx.restore();
      },
    },

    /** Something low darts across a far doorway. Later it crawls back into it on hands and feet whose joints bend the wrong
     * way, stops, lifts its head to us — and keeps looking at us while the rest of it scrambles away, too fast. */
    hound: {
      w: 1,
      place(g) {
        const J = doorAhead(g, 5.5, 9.5); if (J == null) return null;
        const dir = Math.random() < 0.5 ? -1 : 1, x = -dir * 2.05;
        return { J, dir, x, z: (J + 1) * C + TH + 0.8, look: 0, lag: 0, bob: 0, jy: 0, hj: 0, tt: 0, life: 235, feet: REST.map((r) => { const f = [x + dir * r, 0]; f.t = 0; return f; }) };
      },
      step(e, g, st) {
        const a = e.age, d = e.dir, x0 = e.x;
        tick(e, 0.03);
        e.cl = [[0, e.J + 1, a < 6 || (a > 50 && a < 56) ? flick(a, 3) : 1]];
        e.jy = 0; e.hj = 0;
        if (a < 55) { e.vis = 0; return; }
        if (a < 100) { e.x = -d * (2.05 - 1.85 * ss(55, 100, a)); gait(e, 5, 0.55); }
        else if (a < 160) { e.look = ss(100, 116, a); if (Math.random() < 0.05) e.hj = (Math.random() - 0.5) * 0.06; gait(e, 10, 0.45); }
        else {
          if (a === 160) glitch(st, 3);
          if (!e.hold) e.x += d * (0.07 + Math.random() * 0.07); // scrambling, stopping, scrambling
          e.jy = (Math.random() - 0.5) * 0.03; gait(e, 4 + ((Math.random() * 3) | 0), 0.6);
        }
        const v = (e.x - x0) * d;
        e.lag += (v * 3 - e.lag) * 0.2; e.bob = v > 0.004 ? Math.sin(a * 0.6) * 0.015 : 0;
        e.vis = a < 196 && e.x * d < 2.4 ? 1 : 0;
      },
      draw(e, g, j, c) {
        if (c !== 0 || j !== ROW(e.z)) return;
        const a = e.age, ctx = g.ctx;
        if (a < 10 && g.pr(-e.dir * 1.9 + e.dir * 3.8 * (a / 10), e.z, 0.3)) { // the first thing: a shadow, low and quick
          const s = g.f / g.sz; ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.globalAlpha = (g.L ? 0.4 : 0.6) * far(g.sz);
          ctx.drawImage(g.spr.blot, g.sx - s * 0.8, g.sy - s * 0.32, s * 1.6, s * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        if (!e.vis) return;
        const op = far(e.z - g.camZ), lit = g.lum(0, j) * g.glob, T = tones(g);
        contact(g, e.x, e.z, 1.7, op);
        const s = local(g, e.x, e.z, e.jy, e.dir); if (!s) return;
        const B = houndBody({ feet: e.feet.map((f) => [(f[0] - e.x) * e.dir, f[1]]), look: e.look, t: e.tt, br: Math.sin(e.tt * 0.2) * 0.008, bob: e.bob, lag: e.lag, hj: e.hj });
        shade(g, B.p, op, 1.0, lit, T.hound, 0.95);
        if (lit > 0.15) { // its ribs catching the light
          ctx.save(); ctx.clip(B.p); ctx.beginPath();
          for (const [x, l] of [[-0.2, 0.15], [-0.12, 0.17], [-0.035, 0.18], [0.05, 0.16], [0.13, 0.12]]) { ctx.moveTo(x, 0.69); ctx.quadraticCurveTo(x + 0.04, 0.69 - l * 0.5, x + 0.015, 0.69 - l); }
          ctx.strokeStyle = `rgba(${g.L ? '255,250,232' : g.pal.tube},${(g.L ? 0.3 : 0.14) * lit * op})`; ctx.lineWidth = Math.max(0.006, 1.1 / s); ctx.stroke(); ctx.restore();
        }
        shade(g, B.hair, op, 0.62, lit * 0.35, T.hair, 0.95);
        if (e.look > 0.6) { ctx.beginPath(); oval(ctx, B.hx - 0.03, B.hy + 0.008, 0.013, 0.011, 0); oval(ctx, B.hx + 0.034, B.hy + 0.014, 0.011, 0.013, 0); ctx.fillStyle = `rgba(${g.pal.pale},${(g.L ? 0.95 : 0.75) * op * e.look})`; ctx.fill(); }
        ctx.restore();
      },
    },

    /** A Faceling, in plain clothes, its face smooth: standing in a far room with its back to us, swaying when we sway, and
     * turning its head round to us; or walking past a doorway, one step out of time; or a small one at a far jamb, far too
     * still — and at the next flicker, one doorway closer — before it runs off in quick small steps. */
    faceling: {
      w: 1.3,
      place(g, v) {
        v = v || pick(['stand', 'walk', 'child']);
        if (v === 'stand') { const J = hallAhead(g, 7.5, 11.5, (j) => g.lum(0, j) > 0.4); return J == null ? null : { v, J, x: (Math.random() - 0.5) * 1.1, z: (J + 0.5) * C + 0.3, turn: 0, tilt: 0, life: 280, tt: 0, dir: 1 }; }
        if (v === 'walk') { const J = doorAhead(g, 6, 10); return J == null ? null : { v, J, x: -1.75, z: (J + 1) * C + TH + 1.1, ph: 0, turn: 0, tilt: 0, life: 260, dir: 1, tt: 0 }; }
        const ds = doorsAhead(g, 5.5, 15), near = ds.filter((j) => (j + 1) * C - g.camZ <= 8.5); if (!near.length) return null;
        const J1 = pick(near), J2 = ds.find((j) => j > J1 + 1), side = Math.random() < 0.5 ? -1 : 1;
        return { v, J: J2 != null ? J2 : J1, J1, two: J2 != null, side, x: side * 0.8, z: ((J2 != null ? J2 : J1) + 1) * C + TH + 0.3, ph: 0, turn: 1, tilt: 0, lean: 0, life: 175, dir: -side, tt: 0 };
      },
      step(e, g, st) {
        const a = e.age;
        tick(e, 0.01);
        if (e.v === 'stand') {
          e.turn = ss(80, 175, a); e.tilt = ss(170, 230, a) * 0.38 * (1 - ss(236, 240, a));
          if (a === 240) st.flick = DIP.length;
          e.vis = a < 241 ? ss(0, 20, a) : 0;
        } else if (e.v === 'walk') {
          const n = Math.floor(e.ph / Math.PI); // the third step comes late, and the fourth hurries to catch up
          e.ph += 0.094 * (n === 3 ? 0.25 + 0.75 * ss(0.4, 0.9, (e.ph / Math.PI) % 1) : n === 4 ? 1.6 : 1);
          e.x = -1.75 + (e.ph / Math.PI) * 0.58;
          e.turn = ss(-0.5, 0.1, e.x) * (1 - ss(0.6, 1.1, e.x));
          e.vis = e.x < 2.1 ? 1 : 0;
        } else {
          const s = e.side;
          if (e.two && a === 64) st.flick = DIP.length;
          if (e.two && a === 67) { e.J = e.J1; e.z = (e.J1 + 1) * C + TH + 0.3; glitch(st, 2); } // one doorway closer, between one flicker and the next
          if (a < 120) { e.x = s * 0.8; e.lean = s * 0.16; e.turn = 1; }
          else { e.turn = 1 - ss(120, 123, a); e.lean = 0; e.ph += 0.6; e.x = s * 0.8 - s * 2.8 * ss(123, 160, a); }
          e.vis = a < 162 ? 1 : 0;
        }
      },
      draw(e, g, j, c) {
        if (c !== 0 || j !== ROW(e.z) || !e.vis) return;
        const child = e.v === 'child', h = child ? 1.16 : 1.74, op = e.vis * far(e.z - g.camZ), lit = g.lum(0, j) * g.glob, T = tones(g);
        contact(g, e.x, e.z, child ? 0.55 : 0.8, op);
        const s = local(g, e.x, e.z, 0, e.dir); if (!s) return;
        const still = child && e.age < 120, ph = e.v === 'walk' || (child && !still) ? e.ph : null;
        const P = person({ h, sh: child ? 0.15 : 0.2, hw: child ? 0.12 : 0.15, hr: child ? 0.105 : 0.115, ph, stride: child ? 0.45 : 0.3, t: e.tt, foot: ph == null ? 0.04 : 0.1, limbK: child ? 0.85 : 1, side: ph != null, headX: ph != null ? 0.025 : 0,
          lean: (e.lean || 0) + (e.v === 'stand' ? g.yaw * 0.6 + g.bobS * 0.02 : 0), tilt: e.tilt, sway: still ? 0 : 0.012 });
        shade(g, P.legs, op, h, lit, T.pants); shade(g, P.top, op, h, lit, T.cloth); shade(g, P.skin, op, h, lit, T.skin);
        blank(g, P.hd, e.turn, op, lit);
        g.ctx.restore();
      },
    },

    /** A Skin-Stealer: too tall for the doorway it stands half behind, its borrowed skin hanging at the joints, idling like
     * a person does but with the timing wrong; it leans out, much too far, and snaps back. Or far down the hall, under a
     * tube that has just died. */
    skinstealer: {
      w: 1.1,
      place(g, v) {
        v = v || (Math.random() < 0.65 ? 'jamb' : 'light');
        if (v === 'jamb') { const J = doorAhead(g, 5.5, 9); if (J == null) return null; const side = Math.random() < 0.5 ? -1 : 1; return { v, J, side, x: side * 0.98, z: (J + 1) * C + TH + 0.32, lean: 0, tilt: 0.1, tt: 0, life: 222 }; }
        const J = hallAhead(g, 10, 15); if (J == null) return null;
        const i = Math.random() < 0.78 ? 0 : Math.random() < 0.5 ? -1 : 1;
        return { v, J, i, x: i * C + (Math.random() - 0.5) * 0.8, z: (J + 0.5) * C, lean: 0, tilt: 0.3, tt: 0, life: 170 + Math.random() * 160 };
      },
      step(e, g, st) {
        const a = e.age;
        tick(e, 0.04);
        e.idle = Math.round(e.tt / 9) * 0.6; // an idle sway learnt from watching people: in jerks
        if (e.v === 'light') {
          e.cl = [[e.i, e.J, 0]];
          e.vis = ss(26, 50, a);
          if (a > e.life - 1 || e.z - g.camZ < 7) { e.age = e.life + 1; st.flick = DIP.length; }
          return;
        }
        const s = e.side;
        e.cl = [[0, e.J + 1, a < 14 ? flick(a, 5) : a > 178 && a < 190 ? flick(a, 6) : 1], [0, e.J, a < 10 ? flick(a + 3, 7) : 1]];
        e.vis = a < 7 ? 0 : a < 181 ? 1 : 0;
        e.lean = -s * 0.7 * ss(95, 160, a);
        e.tilt = 0.1 + 0.45 * ss(160, 176, a);
        e.x = s * (0.98 - 0.06 * ss(95, 160, a));
        if (a >= 176) { const k = ss(176, 180, a); e.lean *= 1 - k; e.x = s * (0.92 + 0.6 * k); if (a === 176) glitch(st, 4); }
      },
      draw(e, g, j, c) {
        const col = e.v === 'light' ? e.i : 0;
        if (c !== col || j !== ROW(e.z) || !e.vis) return;
        const op = e.vis * far(e.z - g.camZ), lit = e.v === 'light' ? 0.12 : g.lum(0, j) * g.glob, T = tones(g);
        contact(g, e.x, e.z, 0.75, op);
        const s = local(g, e.x, e.z, 0, 1); if (!s) return;
        const P = person({ h: 2.38, sh: 0.17, hw: 0.12, neck: 0.32, hr: 0.1, arm: 1.5, splay: 0.03, fingers: 1.6, hipK: 0.5, limbK: 0.78, foot: 0.06,
          lean: e.lean + Math.sin(e.idle) * 0.035, tilt: e.tilt, wob: 0.016, t: e.tt, sag: true });
        shade(g, P.legs, op, 2.38, lit, T.gaunt, 0.86); shade(g, P.top, op, 2.38, lit, T.gaunt, 0.86); shade(g, P.skin, op, 2.38, lit, T.gaunt, 0.9);
        skinFace(g, P.hd, op * (e.v === 'jamb' ? 0.5 + 0.5 * Math.min(1, Math.abs(e.lean) / 0.4) : 0.6));
        g.ctx.restore();
      },
    },

    /** Balloons drift into an empty room, then come on toward us against the air; between one flicker and the next a
     * Partygoer is standing among them, waving slowly, its head ticking side to side; at the next it is a room closer. */
    partygoer: {
      w: 0.5,
      place(g) {
        const J = hallAhead(g, 9.5, 13); if (J == null) return null;
        const side = Math.random() < 0.5 ? -1 : 1, x = side * 0.42, z = (J + 0.5) * C + 0.4, cs = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
        const bs = [[-0.55, -0.3, 1.8], [0.5, 0.25, 2.05], [-0.15, 0.6, 1.6], [0.25, -0.5, 1.95], [-0.75, 0.35, 2.15]].map(([dx, dz, y], k) => ({ hx: x + dx, hz: z + dz, hy: y, x: x + dx, z: z + dz + C, y, ci: cs[k], ph: k * 2, sc: 1, str: 1 }));
        return { J, x, z, bs, wave: 0, tilt: 0, life: 320, pop: -1, bits: null, tt: 0 };
      },
      step(e, g, st) {
        const a = e.age;
        tick(e, 0.02);
        e.cl = [[0, e.J, a >= 80 && a < 84 ? 0.25 : 1]];
        for (const b of e.bs) {
          const k = ss(0, 80, a), dv = ss(258, 300, a), on = Math.max(0, a - 80) * 0.004; // in out of the haze; then on toward us, against the air
          b.x = b.hx + Math.sin(a * 0.02 + b.ph) * 0.05; b.z = b.hz + C * (1 - k) - on; b.y = b.hy + Math.sin(a * 0.045 + b.ph) * 0.05 - dv * (b.hy - 0.35);
          b.sc = 1 - 0.55 * dv; b.str = 1 - 0.6 * dv;
        }
        if (a === 262) { e.pop = (Math.random() * 5) | 0; const b = e.bs[e.pop]; e.bits = [0, 1, 2, 3, 4].map((k) => ({ x: b.x, y: b.y, z: b.z, vx: Math.cos(k * 1.3) * 0.03, vy: Math.sin(k * 1.3) * 0.03, c: BAL[b.ci] })); }
        if (e.bits) for (const q of e.bits) { q.x += q.vx; q.y += q.vy; q.vy -= 0.004; }
        e.fig = a >= 82 && a < 256;
        e.wave = a < 175 ? ss(86, 110, a) : 0;
        e.tilt = Math.floor(e.tt / 13) % 2 ? 0.24 : -0.24; // a cheerful tick-tock of the head, never smooth
        if (a === 175) st.flick = DIP.length;
        if (a === 177) e.z -= C;
        if (a === 255) { st.flick = DIP.length; glitch(st, 2); }
      },
      draw(e, g, j, c) {
        if (c !== 0) return;
        const parts = e.bs.filter((b, k) => k !== e.pop && ROW(b.z) === j).sort((p, q) => q.z - p.z), al = ss(0, 30, e.age);
        let done = !e.fig || ROW(e.z) !== j;
        for (const b of parts) { if (!done && b.z < e.z) { this.fig(e, g, j); done = true; } balloon(g, b, al); }
        if (!done) this.fig(e, g, j);
        if (e.bits && e.age < 272 && ROW(e.bits[0].z) === j) for (const q of e.bits) if (g.pr(q.x, q.z, q.y)) { g.ctx.fillStyle = `rgba(${q.c},${0.5 * far(g.sz)})`; const r = Math.max(0.7, (g.f * 0.014) / g.sz); g.ctx.fillRect(g.sx - r, g.sy - r, r * 2, r * 2); }
      },
      fig(e, g, j) {
        const op = far(e.z - g.camZ), lit = g.lum(0, j) * g.glob, T = tones(g), ctx = g.ctx;
        contact(g, e.x, e.z, 0.75, op);
        const s = local(g, e.x, e.z, 0, 1); if (!s) return;
        const P = person({ h: 2.05, sh: 0.19, hw: 0.13, hr: 0.14, neck: 0.12, arm: 1.12, limbK: 0.9, foot: 0.04, wave: e.wave, tilt: e.tilt, t: e.tt });
        for (const p of [P.legs, P.top, P.skin]) shade(g, p, op, 2.05, lit, T.party, g.L ? 0.9 : 0.8);
        ctx.save(); ctx.clip(P.top); ctx.beginPath(); // leathery: creases across the middle
        for (let k = 0; k < 5; k++) { const y = 1.0 + k * 0.05; ctx.moveTo(-0.12, y); ctx.quadraticCurveTo(0, y - 0.02, 0.12, y + 0.005); }
        ctx.strokeStyle = `rgba(${T.party[2]},${0.35 * op})`; ctx.lineWidth = Math.max(0.005, 0.9 / s); ctx.stroke(); ctx.restore();
        const hd = P.hd, r = hd.hr; // the painted smile, too wide and never moving; two painted eyes
        ctx.save(); ctx.translate(hd.hx, hd.hy); ctx.rotate(-hd.tilt);
        ctx.beginPath(); ctx.moveTo(-r * 1.05, r * 0.05); ctx.quadraticCurveTo(0, -r * 0.55, r * 1.05, r * 0.05); ctx.quadraticCurveTo(0, -r * 1.05, -r * 1.05, r * 0.05);
        oval(ctx, -r * 0.34, r * 0.38, r * 0.1, r * 0.16, 0); oval(ctx, r * 0.34, r * 0.38, r * 0.1, r * 0.16, 0);
        ctx.fillStyle = `rgba(${g.pal.sil},${(g.L ? 0.8 : 0.88) * op})`; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.1); ctx.quadraticCurveTo(0, -r * 0.62, r * 0.8, -r * 0.1);
        ctx.strokeStyle = `rgba(${g.pal.pale},${(g.L ? 0.9 : 0.6) * op})`; ctx.lineWidth = Math.max(0.006, 1.3 / s); ctx.stroke();
        ctx.restore(); ctx.restore();
      },
    },

    /** A single balloon drifts across a far room, hangs there a while as if it had seen us, and drifts on. */
    balloon: {
      w: 0.6,
      place(g) { const J = doorAhead(g, 6, 10.5); if (J == null) return null; const side = Math.random() < 0.5 ? -1 : 1; return { J, side, b: { x: -side * 1.6, y: 1.5, z: (J + 1) * C + TH + 0.9, ci: 0, ph: 0, sc: 1 }, life: 300 }; },
      step(e) { const a = e.age, k = 0.5 * ss(0, 95, a) + 0.5 * ss(175, 298, a); e.b.x = -e.side * 1.6 + e.side * 3.3 * k; e.b.y = 1.45 + Math.sin(a * 0.04) * 0.07; e.vis = 1; },
      draw(e, g, j, c) { if (c === 0 && j === ROW(e.b.z)) balloon(g, e.b, ss(0, 20, e.age) * (1 - ss(285, 300, e.age))); },
    },

    /** A Deathmoth: its shadow flutters huge over the ceiling; then it batters the tube (the tube stutters, dust sifts down
     * through the light), the eyes on its wings looking back like faces, its legs twitching; at last it flaps off into a dark room. */
    moth: {
      w: 0.8,
      place(g) {
        const J = hallAhead(g, 3.8, 6.5, (j) => g.lum(0, j) > 0.8); if (J == null) return null;
        const side = Math.random() < 0.5 ? -1 : 1, fz = (J + 0.5) * C;
        return { J, side, fz, x: 0.2, y: HC - 0.22, z: fz, vx: 0, vy: 0, vz: 0, dust: [], bump: 0, fp: 0, flap: 1, life: 250, tt: 0 };
      },
      step(e, g) {
        const a = e.age;
        tick(e, 0.03);
        e.cl = [[0, e.J, e.bump > 0 ? 0.4 : 1]];
        if (e.bump > 0) e.bump--;
        if (a >= 46 && a < 200) { // around and around the light, hitting it
          e.vx += (Math.random() - 0.5) * 0.02 - e.x * 0.004; e.vz += (Math.random() - 0.5) * 0.02 - (e.z - e.fz) * 0.006; e.vy += (Math.random() - 0.45) * 0.012 - (e.y - (HC - 0.2)) * 0.01;
          e.vx *= 0.9; e.vz *= 0.9; e.vy *= 0.9; e.x += e.vx; e.z += e.vz; e.y += e.vy;
          if (e.y > HC - 0.07) { e.y = HC - 0.07; e.vy = -0.03; if (Math.abs(e.x) < 0.6 && Math.abs(e.z - e.fz) < 0.3) { e.bump = 2; for (let k = 0; k < 4; k++) e.dust.push({ x: e.x + (Math.random() - 0.5) * 0.2, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 0.004, life: 50 + Math.random() * 40 }); } }
        } else if (a >= 200) { const k = ss(200, 246, a); e.x += (e.side * 4.6 - e.x) * 0.05 * k; e.z += (e.fz + 2.4 - e.z) * 0.05 * k; e.y += (1.95 - e.y) * 0.05 * k; }
        if (a >= 46 && Math.random() < 0.08) e.dust.push({ x: e.x, y: e.y - 0.03, z: e.z, vx: (Math.random() - 0.5) * 0.003, life: 40 + Math.random() * 30 });
        for (const q of e.dust) { q.x += q.vx; q.y -= 0.007; q.life--; }
        e.dust = e.dust.filter((q) => q.life > 0 && q.y > 0);
        e.fp += a < 46 ? 0.75 : 0.95 + Math.random() * 0.3;
        e.flap = Math.cos(e.fp);
        e.vis = a >= 46 ? 1 : 0.5;
      },
      ceil(e, g) { // first only its shadow, flapping across the ceiling tiles
        const a = e.age;
        if (a >= 46) return;
        const x = -e.side * 2.6 + e.side * 5.2 * (a / 46), z = e.fz + 0.35 * Math.sin(a * 0.2), hw = 1.15 * Math.max(0.2, Math.abs(e.flap)), hd = 0.75;
        if (!g.pr(x - hw, z + hd, HC)) return; const x0 = g.sx, y0 = g.sy;
        if (!g.pr(x + hw, z + hd, HC)) return; const x1 = g.sx, y1 = g.sy;
        if (!g.pr(x - hw, z - hd, HC)) return;
        const ctx = g.ctx;
        ctx.save(); ctx.transform(x1 - x0, y1 - y0, g.sx - x0, g.sy - y0, x0, y0);
        ctx.globalAlpha = (g.L ? 0.75 : 0.9) * Math.sin((a / 46) * Math.PI) * far(g.sz); ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out'; ctx.drawImage(g.spr.mshadow, 0, 0, 1, 1);
        ctx.restore();
      },
      draw(e, g, j, c) {
        const a = e.age, ctx = g.ctx;
        if (a >= 46 && j === ROW(e.z) && c === COL(e.x)) {
          const op = (1 - ss(226, 248, a)) * far(e.z - g.camZ), s = local(g, e.x, e.z, e.y, 1);
          if (s) {
            ctx.rotate(Math.sin(e.tt * 0.3) * 0.4 + e.vx * 6);
            const legs = new Path2D(); // six legs, twitching
            for (let k = 0; k < 6; k++) { const sd = k < 3 ? -1 : 1, n = k % 3, tw = hash(e.tt >> 1, k, 5) < 0.3 ? 0.4 : 0, an = -0.4 - n * 0.5 + tw; limb(legs, sd * 0.01, 0.02 - n * 0.025, sd * (0.01 + Math.cos(an) * 0.07), 0.02 - n * 0.025 + Math.sin(an) * 0.07, 0.005, 0.003); }
            ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${0.9 * op})`; ctx.fill(legs);
            ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(${g.pal.sil},${0.8 * op})`; ctx.fill(legs);
            const sc = Math.max(0.12, Math.abs(e.flap));
            for (const sd of [1, -1]) { // the wings: the sprite squashed as they beat (wingspan about 0.62 m)
              ctx.save(); ctx.scale(sd * sc * (0.31 / 96), -0.26 / 80);
              ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.95 * op; ctx.drawImage(g.spr.wing, -96, -40);
              ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (g.L ? 0.95 : 0.85) * op; ctx.drawImage(g.spr.wing, -96, -40);
              ctx.restore();
            }
            ctx.save(); ctx.scale(0.045 / 20, -0.13 / 56); ctx.globalAlpha = op; ctx.drawImage(g.spr.mbody, -10, -24); ctx.restore();
            ctx.globalAlpha = 1; ctx.restore();
          }
        }
        if (c === 0) for (const q of e.dust) if (ROW(q.z) === j && g.pr(q.x, q.z, q.y)) { // dust off its wings, sifting down through the light
          const r = Math.max(0.5, Math.min(1.4, (g.f * 0.005) / g.sz)); ctx.fillStyle = g.L ? `rgba(${g.pal.ink},${0.3 * Math.min(1, q.life / 40)})` : `rgba(${g.pal.pale},${0.5 * Math.min(1, q.life / 40)})`; ctx.fillRect(g.sx - r, g.sy - r, r * 2, r * 2);
        }
      },
    },

    /** The shadow of somebody walking along a lit wall, with nobody there. It stops, as if it had noticed us, then hurries off. */
    shadow: {
      w: 0.8,
      place(g) {
        const o = [];
        for (let j = g.j0; j < g.j0 + (g.loose ? 5 : 4); j++) for (const e of [0, 1]) { const d = j * C - g.camZ; if (d >= 1.5 && d <= (g.loose ? 13 : 9) && g.sd(j, e) === 1 && g.lum(0, j) > (g.loose ? 0.05 : 0.4)) o.push([j, e]); }
        if (!o.length) return null;
        const [J, ed] = pick(o);
        return { J, ed, xs: (ed - 0.5) * C, zp: (J + 1) * C - 0.55, life: 190 };
      },
      step(e, g, st) {
        const a = e.age, zn = e.J * C, zf = zn + C;
        e.zp = a < 95 ? zf - 0.55 - 1.6 * ss(0, 95, a) : a < 135 ? zf - 2.15 : zf - 2.15 + 1.85 * ss(135, 172, a);
        e.zp = Math.max(zn + 0.45, Math.min(zf - 0.4, e.zp));
        e.fr = a < 95 ? [1, 0, 2, 0][(a / 11) & 3] : a < 135 ? 0 : [1, 0, 2, 0][(a / 6) & 3];
        e.wd = a >= 95 && a < 135 ? 0.78 : 1;
        e.op = ss(0, 15, a) * (1 - ss(160, 176, a));
        e.vis = e.op;
        e.cl = [[0, e.J, a > 176 && a < 182 ? 0.5 : 1]];
      },
      wall(e, g, j, ed) {
        if (j !== e.J || ed !== e.ed || e.op <= 0) return;
        const w = 0.42 * e.wd, top = 2.0 + (e.fr ? 0.015 : 0);
        if (!g.pr(e.xs, e.zp - w, top)) return; const x0 = g.sx, y0 = g.sy;
        if (!g.pr(e.xs, e.zp + w, top)) return; const x1 = g.sx, y1 = g.sy;
        if (!g.pr(e.xs, e.zp - w, 0)) return;
        const ctx = g.ctx, lit = g.lum(0, j) * g.glob;
        ctx.save(); ctx.transform(x1 - x0, y1 - y0, g.sx - x0, g.sy - y0, x0, y0);
        ctx.globalAlpha = (g.L ? 0.7 : 0.9) * e.op * (0.4 + 0.6 * lit) * far(g.sz); ctx.globalCompositeOperation = g.L ? 'source-over' : 'destination-out';
        ctx.drawImage(g.spr.shadow[e.fr], 0, 0, 1, 1);
        ctx.restore();
      },
    },
  };
  const ALIAS = { eyes: 'smiler', crawler: 'hound', walker: 'faceling:walk', child: 'faceling:child', peek: 'skinstealer:jamb', tall: 'skinstealer:light', figure: 'skinstealer:light', deathmoth: 'moth' };
  /** Start a visit: by name ('hound', 'faceling:child' …), or the weighted pick of what fits (never the last one again). */
  function startEvent(st, g, want) {
    let names;
    if (want) { const [k, v] = (ALIAS[want] || want).split(':'); if (!EV[k]) return true; names = [[k, v]]; }
    else {
      const pool = Object.keys(EV).filter((k) => k !== st.last), out = [];
      while (pool.length) { let t = 0; for (const k of pool) t += EV[k].w; let r = Math.random() * t, n = 0; while (n < pool.length - 1 && (r -= EV[pool[n]].w) > 0) n++; out.push([pool[n]]); pool.splice(n, 1); }
      names = out;
    }
    for (const [k, v] of names) {
      // a painter's file may place the visit itself (its own ways of showing up; v: the variant asked for, or none)
      const ov = window.BR_ENT && window.BR_ENT[k];
      let e;
      if (ov && ov.place && !BR_FAIL[k + '.place']) {
        try { e = ov.place(g, v, window.BR); } catch (err) { BR_FAIL[k + '.place'] = 1; console.warn(`backrooms: BR_ENT.${k}.place failed; using the built-in one`, err); e = undefined; }
        if (e === undefined) e = EV[k].place(g, v);
      } else e = EV[k].place(g, v);
      if (e) { e.k = k; e.age = 0; e.vis = 0; e.cl = null; e.hold = 0; if (e.tt == null) e.tt = 0; st.ev = e; st.last = k; return true; }
    }
    return false;
  }
  const BR_FAIL = {};
  /** Run a resident's override part (window.BR_ENT[name][part]) if there is one: true if it ran, false if none (or it threw: warned once, then left alone). */
  function ovCall(e, part, g, args) {
    const ov = window.BR_ENT && window.BR_ENT[e.k], fn = ov && ov[part];
    if (typeof fn !== 'function' || BR_FAIL[e.k + '.' + part]) return false;
    if (g) g.ctx.save();
    try { fn.apply(ov, args); return true; }
    catch (err) { BR_FAIL[e.k + '.' + part] = 1; console.warn(`backrooms: BR_ENT.${e.k}.${part} failed; using the built-in one`, err); return false; }
    finally { if (g) { g.ctx.restore(); g.ctx.globalCompositeOperation = 'source-over'; g.ctx.globalAlpha = 1; } }
  }
  window.BR = { K, C, HC, EYE, LINTEL, TH, NEAR, FAR, TAU, DIP, BAL, PAL, TONE, REST, EV, ROW, COL, mod, cl, ss, hash, fade, pick, far, tones, tick, flick, glitch,
    local, contact, shade, person, houndBody, blank, skinFace, balloon, gait, limb, limb2, oval, poly, ik };

  window.drawBackrooms = function (bg, ctx, w, h) {
    const V = K.view(w, h, 0.5, 1.6), { W, H, u } = V, L = K.light(), pal = L ? PAL.L : PAL.D;
    const S = K.scene(bg, V, () => ({ lay: layout(), spr: sprites(L ? PAL.L : PAL.D, L) }));
    let st = bg.st;
    if (!st || st.kind !== 'backrooms' || st.key !== S.key) {
      const o = st && st.kind === 'backrooms' ? st : null;
      st = bg.st = { kind: 'backrooms', key: S.key, z: o ? o.z : 0.9, v: 0.0085, fr: 0, bob: 0, halt: 0, hd: 1, look: 0, ev: null, last: o ? o.last : '', evWait: o ? o.evWait : 450 + Math.random() * 600,
        entityNow: o ? o.entityNow : null, flick: 0, fDip: 0, dFlash: 0, gl: 0, glY: 0, glH: 0, glDX: 0, trk: null, trkWait: 500 + Math.random() * 900, px: new Float64Array(12), py: new Float64Array(12) };
    }
    st.fr++;
    // the walk: not quite steady. It slows and quickens, and now and then stops, looks aside as if unsure, and goes on
    if (V.pv) st.z += 0.0055;
    else {
      if (st.halt > 0) st.halt--; else if (!st.ev && Math.random() < 0.0007) { st.halt = 110 + Math.random() * 140; st.hd = Math.random() < 0.5 ? -1 : 1; }
      const want = (st.halt > 0 ? 0.0003 : 0.0085 * (0.8 + 0.4 * (0.5 + 0.5 * Math.sin(st.fr * 0.0023)))) * (st.ev && st.ev.vis ? 0.4 : 1); // it slows when something is there
      st.v += (want - st.v) * 0.025;
      st.look += ((st.halt > 40 ? st.hd * 0.1 : 0) - st.look) * 0.018;
      st.z += st.v; st.bob += st.v * 9.5;
    }
    // (the picker preview stays where the rooms stand open and looks into them, swaying a little: a wall close by would fill the strip)
    const camZ = V.pv ? 14 + Math.sin(st.z * 0.35) * 0.45 : st.z, camX = Math.sin(camZ * 0.19) * 0.24;
    const yaw = V.pv ? -0.24 + Math.sin(st.z * 0.5) * 0.03 : Math.sin(camZ * 0.083 + 1.3) * 0.045 + st.look + Math.sin(st.bob * 0.5) * 0.003;
    const bobY = V.pv ? 0 : (Math.abs(Math.sin(st.bob)) - 0.5) * u * 0.0024 * Math.min(1, st.v / 0.006); // each step, a slight dip
    const cs = Math.cos(yaw), sn = Math.sin(yaw), f = u * 0.92, cx = W / 2, hy = H * 0.5, j0 = Math.floor(camZ / C);
    const lw = Math.max(0.6, u * 0.0011), px = st.px, py = st.py, lay = S.lay, spr = S.spr;
    let X0 = 0, Z0 = 0;
    const cam = (x, z) => { const dx = x - camX, dz = z - camZ; X0 = dx * cs - dz * sn; Z0 = dx * sn + dz * cs; };
    const cr = (j, i) => (i < -X || i > X ? 0 : lay.cross[mod(j, P)][i + X]);
    const sd = (j, e) => (e < -X || e > X + 1 ? 0 : lay.side[mod(j, P)][e + X]);

    // the tubes: one stutters, one is dying, a few are dead or dim, and now and then the whole floor dips
    let fv = 1, dv = 0.07, glob = 1;
    if (!V.pv) {
      if (st.fDip > 0) { st.fDip--; fv = Math.random() < 0.55 ? 0.12 : 0.75; } else if (Math.random() < 0.022) { st.fDip = 2 + ((Math.random() * 9) | 0); if (VHS > 0 && Math.random() < 0.12) glitch(st, 2); }
      if (st.dFlash > 0) { st.dFlash--; dv = 0.25 + Math.random() * 0.6; } else if (Math.random() < 0.005) st.dFlash = 1 + ((Math.random() * 4) | 0);
    }
    const FL = lay.fl, DY = lay.dy;
    let ev = st.ev;
    /** A room's own light, 0..1 (the floor-wide dip comes on top). */
    const lum = (i, j) => {
      if (st.evFl > 0 && i === st.evFc[0] && j === st.evFc[1]) return 0.2; // the lights stutter round them
      if (ev && ev.cl) for (const q of ev.cl) if (q[0] === i && q[1] === j) return q[2];
      const jm = mod(j, P);
      if (i === FL[0] && jm === FL[1]) return fv;
      if (i === DY[0] && jm === DY[1]) return dv;
      const r = hash(i, jm, 21);
      return r < 0.05 ? 0.04 : r < 0.12 ? 0.5 : 1;
    };
    const g = { ctx, L, pal, spr, f, cx, hy, camX, camZ, j0, cr, sd, lum, fr: st.fr, glob: 1, sx: 0, sy: 0, sz: 0, s: 1, rim: 0.01, yaw, bobS: Math.sin(st.bob), pr: null };
    g.pr = (x, z, y) => { cam(x, z); if (Z0 < NEAR) return false; g.sz = Z0; g.sx = cx + (f * X0) / Z0; g.sy = hy - (f * (y - EYE)) / Z0; return true; };
    // the residents: one visit at a time
    if (!V.pv) {
      if (st.entityNow) { g.loose = ++st.wantN > 45; if (startEvent(st, g, st.entityNow === true ? null : String(st.entityNow))) { st.entityNow = null; st.wantN = 0; } g.loose = false; ev = st.ev; } // the test hook: wider placement if it has to wait
      else if (!ev && --st.evWait <= 0) { if (!startEvent(st, g, null)) st.evWait = 90; ev = st.ev; }
      if (ev) {
        ev.age++;
        if (!ev.own) EV[ev.k].step(ev, g, st); // (a visit its file placed itself, own: true, is driven by that file's step alone)
        ovCall(ev, 'step', null, [ev, g, st, window.BR]); // a painter's override may add to it
        if (ev.age > ev.life) { st.ev = ev = null; st.evWait = 750 + Math.random() * 1350; }
      }
      if (st.evFl > 0) st.evFl--;
      else if (ev && ev.vis > 0.5 && Math.random() < 0.012) { st.evFl = 2 + ((Math.random() * 4) | 0); st.evFc = [COL(ev.x || 0), ROW(ev.z || (ev.b ? ev.b.z : 0))]; }
      if (st.flick > 0) { if (st.flick === DIP.length && VHS > 0 && Math.random() < 0.6) glitch(st, 3); glob = DIP[Math.max(0, DIP.length - st.flick)]; st.flick--; }
    }
    g.glob = glob;
    if (!V.pv && VHS > 0) { if (st.jit > 0) st.jit--; else if (Math.random() < 0.004) { st.jit = 2 + ((Math.random() * 4) | 0); st.jdy = Math.random() < 0.5 ? -1 : 1; } } // the frame jumps a line now and then
    const jit = st.jit > 0 ? st.jdy : 0;
    const dim = (L ? 1 : (0.72 + 0.28 * glob) * (VHS > 0 ? 0.88 : 1)) * (V.pv ? 0.55 : 1); // a dark theme: the walls sink with the lights (the picker preview is thinner still)
    const G = S.g || (S.g = grads(ctx, pal, f, hy, W, H, L));

    ctx.save(); ctx.translate(0, -V.oy + bobY + jit);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    /** A line at height y between two points on the plan, cut off at the near plane (added to the current path). */
    const line = (x0, z0, x1, z1, y) => {
      cam(x0, z0); let xa = X0, za = Z0; cam(x1, z1); let xb = X0, zb = Z0;
      if (za < NEAR && zb < NEAR) return;
      if (za < NEAR) { const k = (NEAR - za) / (zb - za); xa += (xb - xa) * k; za = NEAR; } else if (zb < NEAR) { const k = (NEAR - zb) / (za - zb); xb += (xa - xb) * k; zb = NEAR; }
      ctx.moveTo(cx + (f * xa) / za, hy - (f * (y - EYE)) / za); ctx.lineTo(cx + (f * xb) / zb, hy - (f * (y - EYE)) / zb);
    };
    const quad = (x0, z0, x1, z1, y) => { // a rectangle lying flat at height y; false if it is too near to draw
      cam(x0, z0); if (Z0 < 0.4) return false; ctx.beginPath(); ctx.moveTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x1, z0); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x1, z1); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      cam(x0, z1); if (Z0 < 0.4) return false; ctx.lineTo(cx + (f * X0) / Z0, hy - (f * (y - EYE)) / Z0);
      ctx.closePath(); return true;
    };
    /** A sprite laid flat at height y over (x0..x1, z0..z1): mapped from three corners, near enough to true at this size. */
    const flat = (img, x0, z0, x1, z1, y, al) => {
      cam(x0, z1); if (Z0 < 0.5) return; const ax = cx + (f * X0) / Z0, ay = hy - (f * (y - EYE)) / Z0;
      cam(x1, z1); if (Z0 < 0.5) return; const bx = cx + (f * X0) / Z0, by = hy - (f * (y - EYE)) / Z0;
      cam(x0, z0); if (Z0 < 0.5) return; const qx = cx + (f * X0) / Z0, qy = hy - (f * (y - EYE)) / Z0;
      ctx.save(); ctx.globalAlpha = al; ctx.transform(bx - ax, by - ay, qx - ax, qy - ay, ax, ay); ctx.drawImage(img, 0, 0, 1, 1); ctx.restore();
    };

    // ---- the ceiling: its wash, the grid of tiles, damp and missing and sagging tiles, the fittings
    ctx.globalAlpha = dim; ctx.fillStyle = G.ceil; ctx.fillRect(0, -8, W, hy + 8); ctx.globalAlpha = 1;
    const xe = (X + 0.5) * C;
    ctx.beginPath();
    for (let x = -xe; x <= xe + 0.01; x += 1.2) line(x, camZ + 0.3, x, camZ + FAR, HC);
    for (let z = Math.ceil((camZ + 1.3) / 1.2) * 1.2; z < camZ + FAR; z += 1.2) line(-xe, z, xe, z, HC);
    ctx.strokeStyle = G.grid; ctx.lineWidth = lw; ctx.stroke();
    for (let j = j0 + NR; j >= j0; j--) {
      const jm = mod(j, P);
      for (let i = -X; i <= X; i++) {
        const pxw = i * C, pz = (j + 0.5) * C;
        cam(pxw, pz);
        const zc = Z0, a = fade(zc);
        if (zc < 1.3 || a <= 0.012) continue;
        const sx = cx + (f * X0) / zc, sy = hy - (f * (HC - EYE)) / zc;
        if (sx < -u * 0.4 || sx > W + u * 0.4) continue;
        const ht = hash(i, jm, 3), tx = pxw - 1.8 + 1.2 * ((hash(i, jm, 4) * 3) | 0), tz = j * C + (hash(i, jm, 5) < 0.5 ? 0 : 2.4);
        if (ht < 0.2 && zc < 18) flat(spr.blot, tx - 0.15, tz - 0.15, tx + 1.35, tz + 1.35, HC, (L ? 0.5 : 0.75) * a); // a tile the damp has got into
        else if (ht < 0.25 && quad(tx, tz, tx + 1.2, tz + 1.2, HC)) { // a tile gone: the dark above
          if (!L) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${0.6 * a})`; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
          ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.2 : 0.3) * a})`; ctx.fill();
        } else if (ht < 0.31 && quad(tx, tz, tx + 1.2, tz + 1.2, HC)) { // a tile sagging out of its grid
          ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.05 : 0.08) * a})`; ctx.fill();
          cam(tx, tz); if (Z0 > 0.5) { const ax = cx + (f * X0) / Z0, ay = hy - (f * (HC - EYE)) / Z0; cam(tx + 0.6, tz); const mx = cx + (f * X0) / Z0, my = hy - (f * (HC - 0.07 - EYE)) / Z0; cam(tx + 1.2, tz); const bx = cx + (f * X0) / Z0, by = hy - (f * (HC - EYE)) / Z0;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(2 * mx - (ax + bx) / 2, 2 * my - (ay + by) / 2, bx, by); ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.6 * a})`; ctx.lineWidth = lw; ctx.stroke(); }
        }
        const b = lum(i, j) * glob;
        if (!quad(pxw - 0.6, pz - 0.3, pxw + 0.6, pz + 0.3, HC)) continue;
        if (L) { // on a light page a lit panel is painted white (never a hole to a tinted page), fading into the haze; a dead one is a grey slot
          if (b > 0.05) { ctx.fillStyle = `rgba(${pal.tube},${Math.min(1, b) * 0.92 * a})`; ctx.fill(); }
          if (b < 0.9) { ctx.fillStyle = `rgba(${pal.ink},${0.2 * (1 - b) * a})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(${pal.ink},${0.34 * a})`; ctx.lineWidth = lw; ctx.stroke();
        } else { // a dark theme: a soft diffuser (text over a near light must still read), brighter round its rim
          ctx.fillStyle = `rgba(${pal.tube},${(0.035 + (0.16 + 0.14 * Math.min(1, zc / 10)) * b) * a})`; ctx.fill();
          if (b > 0.3 && zc < 16 && VHS > 0) { // the tape smears the bright panel a little red one way and cyan the other
            const o = Math.max(1, u * 0.0016), ca = 0.035 * b * a * VHS;
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(o, 0); ctx.fillStyle = `rgba(255,60,40,${ca})`; ctx.fill(); ctx.translate(-2 * o, 0); ctx.fillStyle = `rgba(30,190,255,${ca})`; ctx.fill(); ctx.translate(o, 0);
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.strokeStyle = `rgba(${pal.tube},${(0.1 + 0.3 * b) * a})`; ctx.lineWidth = lw; ctx.stroke();
          if (b > 0.3 && zc < 14 && i >= -3 && i <= 3) { const r = (f * 1.5) / zc, ry = r * Math.min(1, 1.3 / zc + 0.12); ctx.globalAlpha = 0.12 * b * a; ctx.drawImage(spr.pool, sx - r, sy - ry, r * 2, ry * 2); ctx.globalAlpha = 1; }
        }
        if (zc < 15) { // the two tubes inside it, and close up the prisms of the diffuser
          ctx.beginPath(); line(pxw - 0.52, pz - 0.14, pxw + 0.52, pz - 0.14, HC); line(pxw - 0.52, pz + 0.14, pxw + 0.52, pz + 0.14, HC);
          ctx.strokeStyle = L ? `rgba(${pal.ink},${0.22 * a})` : `rgba(${pal.tube},${(0.06 + (0.16 + 0.5 * Math.min(1, zc / 12)) * b) * a})`; ctx.lineWidth = Math.max(lw, (f * 0.035) / zc); ctx.stroke();
          if (zc < 6) {
            ctx.beginPath();
            for (let k = 1; k < 4; k++) line(pxw - 0.6 + 0.3 * k, pz - 0.3, pxw - 0.6 + 0.3 * k, pz + 0.3, HC);
            line(pxw - 0.6, pz, pxw + 0.6, pz, HC);
            ctx.strokeStyle = `rgba(${pal.ink},${(L ? 0.1 : 0.07) * a})`; ctx.lineWidth = lw; ctx.stroke();
          }
        }
      }
    }
    if (ev && !ovCall(ev, 'ceil', g, [ev, g, window.BR]) && EV[ev.k].ceil) EV[ev.k].ceil(ev, g);

    // ---- the carpet: its wash, the light lying on it under each tube, a mottle of old damp and the wet patches
    ctx.globalAlpha = dim; ctx.fillStyle = G.floor; ctx.fillRect(0, hy, W, H - hy + 8); ctx.globalAlpha = 1;
    for (let j = j0 + 4; j >= j0; j--) {
      const jm = mod(j, P);
      for (let i = -2; i <= 2; i++) {
        cam(i * C, (j + 0.5) * C);
        if (Z0 > 1.4) {
          const b = lum(i, j) * glob, a = fade(Z0);
          if (b > 0.3) {
            const sx = cx + (f * X0) / Z0, sy = hy + (f * EYE) / Z0, rx = (f * 1.5) / Z0, ky = Math.min(1, EYE / Z0);
            ctx.globalAlpha = (L ? 0.24 : 0.075) * b * a; ctx.drawImage(spr.pool, sx - rx, sy - rx * ky, rx * 2, rx * ky * 2); ctx.globalAlpha = 1;
          }
        }
        for (let k = 0; k < 4; k++) { // three old stains and, in some rooms, a patch still wet; they dry as we come up to them
          if (k === 3 && hash(i, jm, 7) >= 0.55) continue;
          cam(i * C + (hash(i, jm, 13 + k) - 0.5) * (k === 3 ? 2.2 : 3.2), (j + hash(i, jm, 17 + k)) * C);
          if (Z0 < 1.8) continue;
          const hk = hash(i * 7 + k, jm, 12), r = k === 3 ? 0.5 + hash(i, jm, 10) * 0.6 : 0.3 + hk * 0.6;
          const sxp = cx + (f * X0) / Z0, rw = ((f * r) / Z0) * (1 + hk * 0.5), rh = ((f * r) / Z0) * Math.min(1, EYE / Z0);
          if (sxp + rw < 0 || sxp - rw > W) continue;
          ctx.globalAlpha = (k === 3 ? (L ? 0.09 : 0.2) : (L ? 0.035 : 0.075)) * fade(Z0) * Math.min(1, (Z0 - 1.8) / 4);
          ctx.drawImage(spr.blot, sxp - rw, hy + (f * EYE) / Z0 - rh, rw * 2, rh * 2);
        }
      }
    }
    ctx.globalAlpha = 1;

    const TN = pal.tone, HZ = pal.hz;
    /** The colour of a face of kind t (see PAL) at fade fd, lit by k: on a light page it goes over to the haze with distance. */
    const tcol = (t, fd, k) => {
      if (!L) return `rgba(${pal.wall},${t[3] * dim * k * fd})`;
      const m = 1 - fd;
      return `rgba(${(t[0] + (HZ[0] - t[0]) * m) | 0},${(t[1] + (HZ[1] - t[1]) * m) | 0},${(t[2] + (HZ[2] - t[2]) * m) | 0},${t[3] * fd + pal.hzA * m})`;
    };
    /** Lay in a face already worn away (the current path): the paper's colour for its kind t, lit by the room it looks into (b). */
    const wash = (t, fa, fb, sxA, sxB, b) => {
      const k = L ? 1 : 0.42 + 0.58 * b;
      if (Math.abs(fa - fb) < 0.02) ctx.fillStyle = tcol(t, (fa + fb) * 0.5, k);
      else { const gr = ctx.createLinearGradient(sxA, 0, sxB, 0); gr.addColorStop(0, tcol(t, fa, k)); gr.addColorStop(1, tcol(t, fb, k)); ctx.fillStyle = gr; }
      ctx.fill();
      if (L) { // a light page: light and shade on the paper, a dark room really dark, the place dimming as the lights stutter
        ctx.fillStyle = G.wsh; ctx.fill();
        const dk = Math.max(0.36 * (1 - b), 0.3 * (1 - glob)) * (0.4 + 0.6 * (fa + fb) * 0.5);
        if (dk > 0.01) { ctx.fillStyle = `rgba(${pal.ink},${dk})`; ctx.fill(); }
      }
    };
    /**
     * An upright face between two points of the plan, from y0 up to y1: the free end of a wall, or a jamb. Full
     * height ends get the skirting board round them. ia / ib: ink the upright edge at that end.
     */
    const face = (x0, z0, x1, z1, y0, y1, A, b, ia, ib) => {
      cam(x0, z0); let xa = X0, za = Z0; cam(x1, z1); let xb = X0, zb = Z0;
      if (za < NEAR && zb < NEAR) return;
      if (za < NEAR) { const k = (NEAR - za) / (zb - za); xa += (xb - xa) * k; za = NEAR; ia = false; } else if (zb < NEAR) { const k = (NEAR - zb) / (za - zb); xb += (xa - xb) * k; zb = NEAR; ib = false; }
      const fa = fade(za), fb = fade(zb);
      if (fa <= 0.004 && fb <= 0.004) return;
      const ax = cx + (f * xa) / za, bx = cx + (f * xb) / zb;
      if (Math.abs(bx - ax) < 0.25 || Math.max(ax, bx) < -2 || Math.min(ax, bx) > W + 2) return;
      const ya1 = hy - (f * (y1 - EYE)) / za, yb1 = hy - (f * (y1 - EYE)) / zb, ya0 = hy - (f * (y0 - EYE)) / za, yb0 = hy - (f * (y0 - EYE)) / zb;
      ctx.beginPath(); ctx.moveTo(ax, ya1); ctx.lineTo(bx, yb1); ctx.lineTo(bx, yb0); ctx.lineTo(ax, ya0); ctx.closePath();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      wash(A, fa, fb, ax, bx, b);
      const fm = (fa + fb) * 0.5;
      if (y0 === 0 && y1 === HC) {
        ctx.beginPath(); ctx.moveTo(ax, hy - (f * (SK - EYE)) / za); ctx.lineTo(bx, hy - (f * (SK - EYE)) / zb); ctx.lineTo(bx, yb0); ctx.lineTo(ax, ya0); ctx.closePath();
        ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.09 : 0.16) * fm})`; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(ax, ya1); ctx.lineTo(bx, yb1); ctx.moveTo(ax, ya0); ctx.lineTo(bx, yb0);
      if (ia) { ctx.moveTo(ax, ya0); ctx.lineTo(ax, ya1); }
      if (ib) { ctx.moveTo(bx, yb0); ctx.lineTo(bx, yb1); }
      ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * fm})`; ctx.lineWidth = lw; ctx.stroke();
    };
    /** The underside of a lintel. */
    const soffit = (x0, z0, x1, z1, A, b) => {
      if (!quad(x0, z0, x1, z1, LINTEL)) return;
      cam((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      const fa = fade(Z0);
      if (fa <= 0.004) return;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; wash(A, fa, fa, 0, 1, b);
    };
    const pat = S.pat || (S.pat = ctx.createPattern(spr.pap, 'repeat')), ptf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    /**
     * A wall's broad face between two points on the plan. type 2 has a doorway dw wide in the middle. eA / eB: how
     * far it reaches past each end (a hair where a face in its plane carries on, so the join does not show); kA /
     * kB: ink the upright edge at that end; cvA / cvB: that end is an inside corner (it gets a soft shade). b: the light of the room it
     * faces. id: seeds its stains and fittings.
     */
    const wall = (x0, z0, x1, z1, type, dw, A, b, eA, eB, kA, kB, cvA, cvB, id) => {
      cam(x0, z0); const xa = X0, za = Z0; cam(x1, z1); const xb = X0, zb = Z0;
      if (za < NEAR && zb < NEAR) return;
      let sa = -eA / C, sb = 1 + eB / C, cutA = false, cutB = false;
      if (za + (zb - za) * sa < NEAR) { sa = (NEAR - za) / (zb - za); cutA = true; }
      if (za + (zb - za) * sb < NEAR) { sb = (NEAR - za) / (zb - za); cutB = true; }
      if (sb - sa < 1e-4) return;
      const zA = za + (zb - za) * sa, zB = za + (zb - za) * sb, fa = fade(zA), fb = fade(zB);
      if (fa <= 0.004 && fb <= 0.004) return;
      const sxA = cx + (f * (xa + (xb - xa) * sa)) / zA, sxB = cx + (f * (xa + (xb - xa) * sb)) / zB;
      if (Math.abs(sxB - sxA) < 0.4 || Math.max(sxA, sxB) < -2 || Math.min(sxA, sxB) > W + 2) return;
      const d0 = 0.5 - dw / (2 * C), d1 = 0.5 + dw / (2 * C), door = type === 2 && d0 < sb && d1 > sa;
      const SX = (s) => cx + (f * (xa + (xb - xa) * s)) / (za + (zb - za) * s), SY = (s, y) => hy - (f * (y - EYE)) / (za + (zb - za) * s);
      let n = 0;
      const pt = (s, y) => { px[n] = SX(s); py[n] = SY(s, y); n++; };
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
      wash(A, fa, fb, sxA, sxB, b);
      const fm = (fa + fb) * 0.5, zm = (zA + zB) * 0.5, wpx = Math.abs(sxB - sxA), solid = (s0, s1) => !door || s1 <= d0 || s0 >= d1;
      if (zm < 8 && wpx > 30) { // near enough to see the paper: strips of stripes and damask, each mapped onto its own stretch
        const cut = [sa];
        for (let k = 1; k < 8; k++) if (k / 8 > sa + 1e-4 && k / 8 < sb - 1e-4) cut.push(k / 8);
        if (door) { if (d0 > sa && d0 < sb) cut.push(d0); if (d1 > sa && d1 < sb) cut.push(d1); cut.sort((p, q) => p - q); }
        cut.push(sb);
        ctx.globalAlpha = (L ? 0.15 : 0.16) * fm * Math.min(1, (8 - zm) / 3); ctx.fillStyle = pat;
        for (let k = 0; k + 1 < cut.length; k++) {
          const s0 = cut[k], s1 = cut[k + 1];
          if (s1 - s0 < 1e-4) continue;
          const yb = solid(s0 + 1e-5, s1 - 1e-5) ? 0 : LINTEL, u0 = (s0 * 8 - Math.floor(s0 * 8 + 1e-6)) * 40, u1 = u0 + (s1 - s0) * 320;
          const x0c = SX(s0), x1c = SX(s1), t0 = SY(s0, HC), t1 = SY(s1, HC);
          ptf.a = (x1c - x0c) / (u1 - u0); ptf.b = (t1 - t0) / (u1 - u0); ptf.d = (SY(s0, 0) - t0) / 232; ptf.e = x0c - ptf.a * u0; ptf.f = t0 - ptf.b * u0;
          pat.setTransform(ptf);
          ctx.beginPath(); ctx.moveTo(x0c, t0); ctx.lineTo(x1c, t1); ctx.lineTo(x1c, SY(s1, yb)); ctx.lineTo(x0c, SY(s0, yb)); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // the skirting board: a darker band along every solid stretch, and its top edge close up
      ctx.beginPath();
      const band = (s0, s1) => { if (s1 - s0 < 1e-4) return; ctx.moveTo(SX(s0), SY(s0, SK)); ctx.lineTo(SX(s1), SY(s1, SK)); ctx.lineTo(SX(s1), SY(s1, 0)); ctx.lineTo(SX(s0), SY(s0, 0)); ctx.closePath(); };
      if (door) { band(sa, Math.min(sb, d0)); band(Math.max(sa, d1), sb); } else band(sa, sb);
      ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.09 : 0.16) * fm})`; ctx.fill();
      if (zm < 14) {
        ctx.beginPath();
        const top = (s0, s1) => { if (s1 - s0 < 1e-4) return; ctx.moveTo(SX(s0), SY(s0, SK)); ctx.lineTo(SX(s1), SY(s1, SK)); };
        if (door) { top(sa, Math.min(sb, d0)); top(Math.max(sa, d1), sb); } else top(sa, sb);
        ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.5 * fm})`; ctx.lineWidth = lw; ctx.stroke();
      }
      const ao = (L ? 0.11 : 0.15) * fm * Math.min(1, (10 - zm) / 3);
      if (ao > 0.004 && wpx > 24) { // a soft shade where the wall meets the floor (in short runs, so the shade follows the perspective) and in an inside corner
        const nseg = Math.abs(zb - za) > 1 ? 2 : 1, runs = door ? [[sa, Math.min(sb, d0)], [Math.max(sa, d1), sb]] : [[sa, sb]];
        for (const [r0, r1] of runs) for (let k = 0; k < nseg; k++) {
          const s0 = r0 + ((r1 - r0) * k) / nseg, s1 = r0 + ((r1 - r0) * (k + 1)) / nseg, sm = (s0 + s1) * 0.5;
          if (s1 - s0 < 1e-4) continue;
          const gr = ctx.createLinearGradient(0, SY(sm, SK), 0, SY(sm, 0.5)); gr.addColorStop(0, `rgba(${pal.ink},${ao})`); gr.addColorStop(1, `rgba(${pal.ink},0)`);
          ctx.beginPath(); ctx.moveTo(SX(s0), SY(s0, 0.5)); ctx.lineTo(SX(s1), SY(s1, 0.5)); ctx.lineTo(SX(s1), SY(s1, SK)); ctx.lineTo(SX(s0), SY(s0, SK)); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
        }
        for (const [cv, se, si] of [[cvA && !cutA, sa, Math.min(sb, sa + 0.1)], [cvB && !cutB, sb, Math.max(sa, sb - 0.1)]]) {
          if (!cv) continue;
          const gr = ctx.createLinearGradient(SX(se), 0, SX(si), 0); gr.addColorStop(0, `rgba(${pal.ink},${ao * 0.8})`); gr.addColorStop(1, `rgba(${pal.ink},0)`);
          ctx.beginPath(); ctx.moveTo(SX(se), SY(se, HC)); ctx.lineTo(SX(si), SY(si, HC)); ctx.lineTo(SX(si), SY(si, 0)); ctx.lineTo(SX(se), SY(se, 0)); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
        }
      }
      if (zm < 7 && wpx > 40) { // close up: a run of damp, a seam lifting at the top, a socket, a vent
        const nr = Math.min(1, (7 - zm) / 2.5), wq = (s0, s1, y0, y1) => { ctx.moveTo(SX(s0), SY(s0, y1)); ctx.lineTo(SX(s1), SY(s1, y1)); ctx.lineTo(SX(s1), SY(s1, y0)); ctx.lineTo(SX(s0), SY(s0, y0)); ctx.closePath(); };
        const h1 = hash(id, 1, 51), s = 0.08 + hash(id, 2, 51) * 0.78, ds = 0.32 / C;
        if (h1 < 0.45 && s > sa && s + ds < sb && solid(s, s + ds)) {
          const len = 0.8 + hash(id, 6, 51) * 1.1, ox = SX(s), oy = SY(s, HC);
          ctx.save(); ctx.globalAlpha = (L ? 0.42 : 0.5) * fm * nr; ctx.transform(SX(s + ds) - ox, SY(s + ds, HC) - oy, 0, SY(s, HC - len) - oy, ox, oy); ctx.drawImage(spr.streak, 0, 0, 1, 1); ctx.restore();
        }
        const kp = 1 + ((hash(id, 3, 51) * 7) | 0), sp = kp / 8;
        if (hash(id, 4, 51) < 0.5 && sp > sa && sp + 0.02 < sb && solid(sp, sp + 0.02)) { // the paper coming away at a seam, curling off the wall
          ctx.beginPath(); ctx.moveTo(SX(sp), SY(sp, HC - 0.01)); ctx.lineTo(SX(sp + 0.016), SY(sp + 0.016, HC - 0.03)); ctx.lineTo(SX(sp + 0.005), SY(sp + 0.005, HC - 0.24)); ctx.closePath();
          ctx.fillStyle = `rgba(${pal.pale},${(L ? 0.5 : 0.1) * fm * nr})`; ctx.fill();
          ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.7 * fm * nr})`; ctx.lineWidth = lw; ctx.stroke();
        }
        const so = 0.12 + hash(id, 5, 51) * 0.74, dso = 0.075 / C;
        if (zm < 7 && hash(id, 7, 51) < 0.35 && so > sa && so + dso < sb && solid(so, so + dso)) { // a socket by the skirting
          ctx.beginPath(); wq(so, so + dso, 0.27, 0.39);
          ctx.fillStyle = `rgba(${pal.pale},${(L ? 0.55 : 0.1) * fm * nr})`; ctx.fill();
          ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.8 * fm * nr})`; ctx.lineWidth = lw; ctx.stroke();
        }
        const sv = 0.2 + hash(id, 8, 51) * 0.6, dsv = 0.36 / C;
        if (hash(id, 9, 51) < 0.2 && sv > sa && sv + dsv < sb) { // a vent up by the ceiling, its slats
          ctx.beginPath(); wq(sv, sv + dsv, 2.2, 2.42); ctx.fillStyle = `rgba(${pal.ink},${(L ? 0.1 : 0.16) * fm * nr})`; ctx.fill();
          for (let k = 1; k < 4; k++) { const y = 2.2 + k * 0.055; ctx.moveTo(SX(sv), SY(sv, y)); ctx.lineTo(SX(sv + dsv), SY(sv + dsv, y)); }
          ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * 0.7 * fm * nr})`; ctx.lineWidth = lw; ctx.stroke();
        }
      }
      ctx.beginPath(); // the ink: along the ceiling, along the floor and round the doorway, and down an end that turns a corner or stands free
      ctx.moveTo(px[0], py[0]); ctx.lineTo(px[1], py[1]);
      ctx.moveTo(px[2], py[2]);
      for (let k = 3; k < n; k++) ctx.lineTo(px[k], py[k]);
      if (kB && !cutB) { ctx.moveTo(px[1], py[1]); ctx.lineTo(px[2], py[2]); }
      if (kA && !cutA) { ctx.moveTo(px[n - 1], py[n - 1]); ctx.lineTo(px[0], py[0]); }
      ctx.strokeStyle = `rgba(${pal.ink},${pal.aInk * fm})`; ctx.lineWidth = lw; ctx.stroke();
      if (zm < 7 && VHS > 0 && !V.pv) { // the tape's chroma out of register: the edges fringed red one way and cyan the other
        const o = Math.max(1, u * 0.0016), al = (L ? 0.07 : 0.06) * Math.min(1.5, VHS / 2) * fm;
        if (!L) ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = lw * 1.4;
        ctx.translate(o, 0); ctx.strokeStyle = `rgba(255,64,44,${al})`; ctx.stroke(); ctx.translate(-2 * o, 0); ctx.strokeStyle = `rgba(36,180,255,${al})`; ctx.stroke(); ctx.translate(o, 0);
        ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = lw;
      }
    };
    /** Dust hanging in the light of the nearest few fittings. */
    const motes = (j) => {
      if (V.pv || j > j0 + 2) return;
      const b = lum(0, j) * glob, jm = mod(j, P), t = st.fr;
      if (b < 0.4) return;
      for (let k = 0; k < 10; k++) {
        const ph = hash(k, jm, 41) * TAU, x = (hash(k, jm, 42) - 0.5) * 2.4 + Math.sin(t * 0.004 + ph) * 0.25, z = (j + 0.2 + hash(k, jm, 43) * 0.6) * C + Math.cos(t * 0.003 + ph) * 0.2;
        cam(x, z); if (Z0 < 1.4) continue;
        const y = 0.6 + hash(k, jm, 44) * 1.7 + Math.sin(t * 0.006 + ph * 2) * 0.12, r = Math.min(1.3, Math.max(0.5, (f * 0.0035) / Z0)), tw = 0.5 + 0.5 * Math.sin(t * 0.05 + ph * 3), a = b * tw * fade(Z0);
        ctx.fillStyle = L ? `rgba(${pal.ink},${0.2 * a})` : `rgba(${pal.pale},${0.32 * a})`;
        ctx.fillRect(cx + (f * X0) / Z0 - r, hy - (f * (y - EYE)) / Z0 - r, r * 2, r * 2);
      }
    };

    // ---- the walls, farthest row first; within a row the far walls, then the side walls, each from the outside in.
    // Every wall is a slab TH thick lying away from the hall (side walls) or away from us (far walls), so from here we
    // only ever see a broad face, the end faces that stand free and face us, and the inside of a doorway.
    const evk = ev ? EV[ev.k] : null;
    const evDraw = (j, c) => { if (evk && !ovCall(ev, 'draw', g, [ev, g, j, c, window.BR]) && evk.draw) evk.draw(ev, g, j, c); }; // BR_ENT overrides first (see above EV)
    const evWall = (j, e) => { if (evk && !ovCall(ev, 'wall', g, [ev, g, j, e, window.BR]) && evk.wall) evk.wall(ev, g, j, e); };
    for (let j = j0 + NR; j >= j0; j--) {
      const zn = j * C, zf = zn + C, jm = mod(j, P);
      for (let q = 0; q <= 2 * X; q++) {
        const i = q === 2 * X ? 0 : q % 2 ? -(X - (q >> 1)) : X - (q >> 1), ty = cr(j, i);
        if (!ty) continue;
        const dw = i === 0 ? 1.7 : 1.05, b = lum(i, j), x0 = (i - 0.5) * C, x1 = (i + 0.5) * C;
        let eA = 0, eB = 0, kA = true, kB = true;
        // left end, on line i. Right of the hall it is the arm leading away (its end faces the hall: drawn unless a
        // wall meets it); left of the hall it is the arm toward the hall (it reaches over a side wall's end beside it).
        { const N = sd(j, i) > 0, F = sd(j + 1, i) > 0, o = cr(j, i - 1) > 0;
          if (i >= 1) { if (o) { eA = 0.02; kA = false; } else if (!F) face(x0, zf + TH, x0, zf, 0, HC, TN.s, lum(i - 1, j), true, false); }
          else if (o || (F && !N)) { eA = 0.02; kA = false; } }
        // right end, on line i + 1: the mirror of it
        { const N = sd(j, i + 1) > 0, F = sd(j + 1, i + 1) > 0, o = cr(j, i + 1) > 0;
          if (i <= -1) { if (o) { eB = 0.02; kB = false; } else if (!F) face(x1, zf, x1, zf + TH, 0, HC, TN.s, lum(i + 1, j), false, true); }
          else if (o || (F && !N)) { eB = 0.02; kB = false; } }
        if (ty === 2) { // a doorway: under the lintel, and the jambs on either side that face us
          const xl = i * C - dw / 2, xr = i * C + dw / 2;
          soffit(xl, zf, xr, zf + TH, TN.o, b);
          if (camX > xl) face(xl, zf, xl, zf + TH, 0, LINTEL, TN.j, b, true, true);
          if (camX < xr) face(xr, zf, xr, zf + TH, 0, LINTEL, TN.j, b, true, true);
        }
        wall(x0, zf, x1, zf, ty, dw, TN.c, b, eA, eB, kA, kB, i <= 0 && sd(j, i) > 0, i >= 0 && sd(j, i + 1) > 0, i * 17 + jm * 131 + 7);
      }
      const sideWall = (e) => {
        const ty = sd(j, e);
        if (!ty) return;
        const x = (e - 0.5) * C, r = e >= 1, out = r ? TH : -TH, hc = r ? e - 1 : e, ac = r ? e : e - 1, b = lum(hc, j);
        let eA = 0, eB = 0, kA = true, kB = true;
        // near end (on the far wall line of the row before): carried on by the wall before it, or covered by a far
        // wall running away from the hall there; otherwise its end faces us (in the plane of a far wall toward the hall, if one meets it)
        if (sd(j - 1, e) > 0) { eA = 0.02; kA = false; } else if (!cr(j - 1, ac)) face(x, zn, x + out, zn, 0, HC, TN.c, lum(hc, j - 1), false, true);
        // far end: carried on by the next wall, or by the end face of a far wall leading away
        if (sd(j + 1, e) > 0 || (cr(j, ac) > 0 && !cr(j, hc))) { eB = 0.02; kB = false; }
        if (ty === 2) { // its doorway: the far jamb faces us, the wall's body lying away from the hall
          const za0 = zn + C / 2 - 0.525, zb0 = zn + C / 2 + 0.525;
          soffit(x, za0, x + out, zb0, TN.o, b);
          if (camZ < zb0 - 0.05) face(x, zb0, x + out, zb0, 0, LINTEL, TN.k, b, true, true);
        }
        wall(x, zn, x, zf, ty, 1.05, TN.s, b, eA, eB, kA, kB, false, cr(j, hc) > 0, e * 29 + jm * 113 + 3);
      };
      for (let e = -X; e <= 0; e++) { evDraw(j, e - 1); sideWall(e); evWall(j, e); }
      for (let e = X + 1; e >= 1; e--) { evDraw(j, e); sideWall(e); evWall(j, e); }
      motes(j);
      evDraw(j, 0);
    }

    // ---- the air: a haze gathering at the end of every hall, thicker with distance (on a light page it pales instead)
    ctx.fillStyle = G.haze; ctx.fillRect(0, hy - W * 0.3, W, W * 0.6);
    if (L && glob < 1) { ctx.fillStyle = `rgba(${pal.ink},${0.07 * (1 - glob)})`; ctx.fillRect(0, -8, W, H + 16); } // a light page: the stutter is a passing shade
    if (VHS > 0 && !V.pv) { // the tape's colour: blacks lifted a little toward green-yellow, the corners sinking
      ctx.fillStyle = G.veil; ctx.fillRect(0, -8, W, H + 16);
      ctx.fillStyle = G.vig; ctx.fillRect(0, -8, W, H + 16);
    }
    if (ev) { // where the visit is on screen (for the test hook's frame sheets)
      const ax = ev.xs != null ? ev.xs : ev.b ? ev.b.x : ev.x, az = ev.xs != null ? ev.zp : ev.b ? ev.b.z : ev.z;
      st.evAt = g.pr(ax, az, ev.k === 'moth' ? ev.y : 1) ? [g.sx, g.sy - V.oy + bobY, f / g.sz] : null;
    }
    ctx.restore();

    // ---- the tape itself, fixed to the screen. Everything here is tuned at VHS = 2; T scales it.
    if (VHS <= 0) return;
    const T = Math.min(1.5, VHS / 2), d = bg.dpr || 1, cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (!V.pv) { // the picture softened, its colour bleeding to the right: the frame laid over itself a pixel or two along
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.2 * T; ctx.drawImage(ctx.canvas, Math.round(2 * d), 0);
      ctx.restore();
      if (ev && ev.vis) { ctx.globalAlpha = Math.min(1, 0.5 * ev.vis * T); ctx.fillStyle = G.vig; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; } // a pressure in the corners while it is there
    }
    // scanlines; grain, all over
    const sp = S.scanPat || (S.scanPat = ctx.createPattern(spr.scan, 'repeat')), gp = S.grainPat || (S.grainPat = ctx.createPattern(spr.grain, 'repeat'));
    ctx.globalAlpha = (L ? 0.08 : 0.17) * T * (V.pv ? 0.6 : 1); ctx.fillStyle = sp; ctx.fillRect(0, 0, w, h);
    if (!(st.fr & 1)) { st.gx = Math.random() * 96; st.gy = Math.random() * 96; }
    ptf.a = 1; ptf.b = 0; ptf.c = 0; ptf.d = 1; ptf.e = st.gx || 0; ptf.f = st.gy || 0; gp.setTransform(ptf);
    const ga = (L ? 0.11 : 0.15) * T * (V.pv ? 0.6 : 1), qx = Math.round(w * 0.5), qy = Math.round(h * 0.4);
    ctx.fillStyle = gp;
    ctx.globalAlpha = ga; ctx.fillRect(0, 0, w, h); void qx; void qy;
    ctx.globalAlpha = 1;
    if (V.pv) return;
    // a stray line of noise here and there; more while something is about
    for (let k = (Math.random() < 0.4 ? 1 : 0) + (ev && Math.random() < 0.6 ? 1 : 0); k > 0; k--) {
      ctx.fillStyle = L ? `rgba(110,100,72,${0.12 * T})` : `rgba(226,232,214,${0.1 * T})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 260, 1);
    }
    // the tracking band: a strip of hash drifting slowly up the picture
    if (!st.trk && --st.trkWait <= 0) st.trk = { y: h + 10, hh: 14 + Math.random() * 30, v: 0.5 + Math.random() * 0.8 };
    if (st.trk) {
      const t = st.trk; t.y -= t.v;
      if (t.y < -t.hh - 4) { st.trk = null; st.trkWait = 300 + Math.random() * 900; }
      else { ctx.globalAlpha = (L ? 0.2 : 0.18) * T * (t.y < h * 0.4 ? 0.6 : 1); const o = (Math.random() * 256) | 0; for (let x = -o; x < w; x += 256) ctx.drawImage(spr.tape, x, t.y, 256, t.hh); ctx.globalAlpha = 1; }
    }
    // head switching along the bottom: the last lines torn sideways under a ribbon of static that never settles
    {
      const hb = Math.max(4, Math.round((9 + 5 * Math.sin(st.fr * 0.07) + Math.random() * 3) * T)), y = h - hb, sh = Math.round((3 + Math.random() * 7) * d);
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, hb); ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(ctx.canvas, 0, Math.round(y * d), cw, Math.round(hb * d), sh, Math.round(y * d), cw, Math.round(hb * d));
      ctx.restore();
      ctx.globalAlpha = (L ? 0.32 : 0.3) * T; const o = (Math.random() * 256) | 0; for (let x = -o; x < w; x += 256) ctx.drawImage(spr.tape, x, y, 256, hb); ctx.globalAlpha = 1;
    }
    // a torn line: a strip of the picture slips sideways for a few frames (more often when something is near or the lights stutter)
    if (st.gl <= 0 && Math.random() < (ev ? 0.005 : 0.0012)) glitch(st, 2 + ((Math.random() * 3) | 0));
    if (st.gl > 0) {
      st.gl--;
      const y = Math.round(st.glY * h * 0.9), hh = Math.max(4, Math.round(st.glH * h));
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, hh); ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(ctx.canvas, 0, Math.round(y * d), cw, Math.round(hh * d), Math.round(st.glDX * d), Math.round(y * d), cw, Math.round(hh * d));
      ctx.restore();
      ctx.globalAlpha = 0.7 * T; ctx.drawImage(spr.tape, (Math.random() * 200) | 0, 0, 56, 24, 0, y - 1, w, 3); ctx.globalAlpha = 1;
    }
    // now and then a dropout: a band of static over the lower picture for a few frames, the image under it sliding
    if (!st.drop && Math.random() < 0.0005 * (ev ? 3 : 1)) st.drop = { n: 4 + ((Math.random() * 5) | 0), y: h * (0.42 + Math.random() * 0.35), hh: h * (0.06 + Math.random() * 0.12), sl: 0 };
    if (st.drop) {
      const q = st.drop, y = Math.round(q.y), hh = Math.round(q.hh); q.sl += 3 + Math.random() * 4;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, hh); ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(ctx.canvas, 0, Math.round((y - q.sl) * d), cw, Math.round(hh * d), 0, Math.round(y * d), cw, Math.round(hh * d));
      ctx.restore();
      ctx.globalAlpha = (L ? 0.45 : 0.4) * T;
      for (let yy = y; yy < y + hh; yy += 24) { const o = (Math.random() * 256) | 0; for (let x = -o; x < w; x += 256) ctx.drawImage(spr.tape, x, yy, 256, Math.min(24, y + hh - yy)); }
      ctx.globalAlpha = 1;
      if (--q.n <= 0) st.drop = null;
    }
    // the camcorder's own lettering, bottom right, above the torn lines: REC, the battery, the date it thinks it is
    const fs = Math.max(12, Math.round(u * 0.019)), m = Math.round(fs * 1.1), sec = 3 * 3600 + 41 * 60 + 7 + Math.floor(st.fr / 30), p2 = (v) => (v < 10 ? '0' : '') + v;
    const x = w - m, y = h - m - Math.round(12 * T), fg = L ? `rgba(40,36,26,${Math.min(1, 0.62 * T)})` : `rgba(240,244,228,${Math.min(1, 0.62 * T)})`, sh = L ? `rgba(255,252,238,${0.55 * T})` : `rgba(0,0,0,${0.6 * T})`;
    ctx.font = `bold ${fs}px Consolas, "Courier New", monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    const put = (s, xx, yy) => { ctx.fillStyle = sh; ctx.fillText(s, xx + 1, yy + 1); ctx.fillStyle = fg; ctx.fillText(s, xx, yy); };
    put(`AM ${Math.floor(sec / 3600) % 12 || 12}:${p2(Math.floor(sec / 60) % 60)}:${p2(sec % 60)}`, x, y);
    put('NOV.19 1996', x, y - fs * 1.3);
    const ry = y - fs * 2.7, bw = fs * 1.7, bh = fs * 0.72, bx = x - bw, by = ry - bh; // the battery, its last bar blinking
    ctx.fillStyle = sh; ctx.fillRect(bx + 1, by + 1, bw, bh);
    ctx.strokeStyle = fg; ctx.lineWidth = Math.max(1, fs * 0.09); ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = fg; ctx.fillRect(bx - fs * 0.16, by + bh * 0.3, fs * 0.16, bh * 0.4);
    if (Math.floor(st.fr / 20) % 2 === 0) ctx.fillRect(bx + bw - fs * 0.5, by + bh * 0.2, fs * 0.36, bh * 0.6);
    put('REC', bx - fs * 0.7, ry);
    if (Math.floor(st.fr / 24) % 2 === 0) {
      const rw = S.recW || (S.recW = ctx.measureText('REC').width);
      ctx.beginPath(); ctx.arc(bx - fs * 0.7 - rw - fs * 0.6, ry - fs * 0.36, fs * 0.32, 0, TAU);
      ctx.fillStyle = L ? `rgba(176,40,30,${Math.min(1, 0.7 * T)})` : `rgba(230,60,46,${Math.min(1, 0.7 * T)})`; ctx.fill();
    }
  };
})();
