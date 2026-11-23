'use strict';
/*
 * 노을: a day at sea, seen looking west, about twelve minutes from one sunset to the next. The sky lies over the page
 * in bands of haze; a headland with a lighthouse and a few islets stand on the horizon, their reflections under them;
 * three decks of cloud drift at their own pace (a high mackerel sky, a middle layer, long low bands near the horizon).
 * - Afternoon: the sun comes in at the top of the frame and slides down a slanted path toward the sea, warming as it
 *   sinks; the clouds are lit from above (white tops, soft grey bellies), the sea is bright and glints.
 * - Golden hour, sunset and the afterglow (the longest part): the sun flattens on the water and goes down, a path of
 *   glitter runs to it, the clouds' undersides turn gold, then orange, then pink and red, the low ones going grey first.
 * - Blue hour and night: the evening star and a young crescent moon follow the sun down the same slant and set, the
 *   stars come out (brightest first) and wheel slowly down to the right, the lighthouse turns, the islands go dark.
 * - Dawn happens behind the viewer: the stars fade (faintest first), the sky brightens all over, the earth's shadow
 *   lies on the western horizon under the pink band of the Belt of Venus, the clouds catch the morning light on
 *   their faces; then the day, with the sun high above the frame, until it comes in at the top again.
 * Everything follows one clock through keyframes that wrap around, so nothing pops. Each cloud deck was rendered once,
 * per pixel, into masks of its body, its lit underside and its lit top; every frame they are coloured from the sun (or
 * the light) outward. On a light page it is the same day in pastel: a pale blue noon, a peach sunset, an indigo night
 * whose stars and moon are the page showing through.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('sunset'); // light mode is drawn here, not inverted
  window.BG_EXT = window.BG_EXT || {};
  window.BG_PV_STILL = window.BG_PV_STILL || {};

  const TAU = Math.PI * 2, RND = Math.random;
  const sm = (e0, e1, x) => { let k = (x - e0) / (e1 - e0); k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const lerpAny = (a, b, k) => (typeof a === 'number' ? a + (b - a) * k : a.map((v, i) => lerpAny(v, b[i], k)));

  /* ---------- the clock: c = 0 … 1 over the period, 0 = the sun coming in at the top of the frame ---------- */

  const PERIOD = 21600; // frames: 12 minutes at 30 fps
  const C_START = 0.2, C_PREVIEW = 0.312; // late afternoon (a sunset about a minute away); the sun half in the sea
  // keyframe times: afternoon, late afternoon, golden hour, sunset, afterglow, blue hour, night, dawn, morning
  const CK = [0, 0.12, 0.17, 0.206, 0.237, 0.296, 0.345, 0.4, 0.45, 0.5, 0.56, 0.62, 0.72, 0.79, 0.84, 0.875, 0.93];
  /** A keyframed value at c (the list has one entry per CK; it wraps from the last back to the first). */
  function at(list, c) {
    let i = CK.length - 1;
    while (i > 0 && CK[i] > c) i--;
    const c0 = CK[i], c1 = i + 1 < CK.length ? CK[i + 1] : 1, b = list[(i + 1) % CK.length];
    return lerpAny(list[i], b, (c - c0) / (c1 - c0));
  }
  const NIGHT_D = [[6, 10, 34, 0.3], [12, 16, 46, 0.24], [20, 24, 58, 0.18], [30, 34, 68, 0.15], [40, 44, 78, 0.14]];
  const NIGHT_L = [[52, 60, 128, 0.39], [64, 70, 140, 0.33], [82, 86, 150, 0.27], [98, 100, 160, 0.23], [110, 110, 166, 0.21]];
  // the sky's haze, top → horizon: [r, g, b, a] at 0, 0.4, 0.7, 0.88, 1 of the way down
  const SKY_AT = [0, 0.4, 0.7, 0.88, 1];
  const SKY = {
    D: [
      [[104, 138, 200, 0.11], [140, 166, 214, 0.085], [180, 196, 226, 0.09], [200, 210, 232, 0.11], [214, 220, 236, 0.13]],
      [[100, 134, 198, 0.115], [140, 164, 212, 0.09], [186, 198, 224, 0.1], [214, 212, 222, 0.12], [230, 218, 212, 0.15]],
      [[92, 120, 186, 0.12], [150, 156, 196, 0.095], [214, 196, 196, 0.12], [238, 206, 184, 0.17], [246, 212, 174, 0.22]],
      [[72, 96, 164, 0.14], [146, 138, 176, 0.1], [246, 190, 136, 0.17], [255, 200, 132, 0.27], [255, 210, 146, 0.36]],
      [[62, 84, 150, 0.15], [140, 128, 166, 0.11], [252, 188, 124, 0.2], [255, 198, 124, 0.32], [255, 208, 138, 0.44]],
      [[56, 64, 136, 0.18], [164, 110, 156, 0.14], [255, 156, 108, 0.25], [255, 166, 98, 0.4], [255, 188, 118, 0.5]],
      [[48, 50, 126, 0.2], [182, 96, 146, 0.17], [255, 124, 92, 0.31], [255, 122, 66, 0.45], [255, 156, 88, 0.54]],
      [[36, 38, 110, 0.22], [140, 72, 140, 0.16], [228, 96, 106, 0.24], [255, 106, 60, 0.37], [255, 138, 80, 0.44]],
      [[24, 28, 92, 0.24], [66, 48, 118, 0.15], [146, 68, 108, 0.13], [224, 98, 70, 0.22], [244, 128, 80, 0.28]],
      [[16, 22, 76, 0.26], [38, 38, 104, 0.16], [84, 60, 116, 0.1], [172, 88, 80, 0.13], [212, 118, 80, 0.17]],
      [[10, 14, 50, 0.28], [20, 24, 66, 0.2], [38, 36, 80, 0.14], [68, 52, 84, 0.12], [88, 64, 88, 0.12]],
      NIGHT_D, NIGHT_D,
      [[26, 38, 86, 0.26], [40, 52, 104, 0.2], [66, 72, 124, 0.15], [60, 68, 112, 0.15], [56, 62, 104, 0.15]], // the earth's shadow rising
      [[62, 92, 158, 0.21], [112, 120, 178, 0.16], [240, 150, 180, 0.25], [76, 88, 136, 0.22], [70, 80, 128, 0.2]], // the Belt of Venus over it
      [[90, 126, 190, 0.16], [146, 156, 204, 0.13], [240, 176, 192, 0.19], [160, 150, 182, 0.15], [150, 156, 190, 0.15]],
      [[104, 140, 202, 0.11], [144, 170, 216, 0.085], [188, 202, 228, 0.09], [204, 212, 232, 0.11], [214, 220, 236, 0.13]],
    ],
    L: [
      [[116, 162, 232, 0.2], [150, 186, 236, 0.15], [188, 208, 240, 0.11], [206, 220, 242, 0.11], [218, 228, 244, 0.13]],
      [[116, 160, 230, 0.2], [150, 184, 234, 0.15], [200, 210, 234, 0.11], [228, 216, 222, 0.12], [238, 218, 206, 0.15]],
      [[126, 156, 222, 0.18], [186, 184, 222, 0.13], [238, 204, 196, 0.13], [250, 200, 170, 0.2], [252, 196, 156, 0.26]],
      [[146, 168, 222, 0.13], [205, 186, 214, 0.1], [255, 198, 160, 0.17], [255, 188, 138, 0.27], [255, 182, 128, 0.35]],
      [[150, 170, 222, 0.13], [205, 190, 218, 0.1], [255, 198, 158, 0.18], [255, 186, 136, 0.29], [255, 180, 126, 0.38]],
      [[140, 150, 216, 0.16], [220, 172, 206, 0.14], [255, 170, 136, 0.24], [255, 158, 108, 0.36], [255, 160, 104, 0.44]],
      [[124, 128, 206, 0.2], [228, 156, 198, 0.18], [255, 144, 126, 0.29], [255, 138, 94, 0.4], [255, 144, 96, 0.46]],
      [[108, 112, 196, 0.25], [196, 136, 202, 0.19], [246, 136, 140, 0.26], [255, 134, 96, 0.35], [255, 146, 106, 0.38]],
      [[88, 98, 184, 0.3], [130, 114, 192, 0.21], [200, 128, 162, 0.18], [245, 146, 116, 0.23], [250, 156, 118, 0.26]],
      [[76, 88, 174, 0.34], [98, 98, 182, 0.24], [150, 118, 172, 0.15], [230, 148, 128, 0.17], [240, 158, 128, 0.2]],
      [[62, 72, 150, 0.37], [80, 84, 160, 0.29], [110, 104, 166, 0.22], [150, 124, 160, 0.2], [170, 136, 156, 0.2]],
      NIGHT_L, NIGHT_L,
      [[84, 96, 164, 0.32], [104, 112, 176, 0.27], [132, 134, 184, 0.22], [118, 124, 172, 0.22], [112, 120, 168, 0.22]],
      [[120, 152, 216, 0.24], [170, 172, 222, 0.19], [244, 162, 194, 0.27], [118, 128, 180, 0.25], [112, 122, 172, 0.24]],
      [[136, 172, 230, 0.19], [180, 192, 232, 0.15], [246, 192, 206, 0.19], [196, 188, 210, 0.15], [190, 192, 216, 0.14]],
      [[116, 162, 232, 0.2], [150, 186, 236, 0.15], [188, 208, 240, 0.11], [206, 220, 242, 0.11], [218, 228, 244, 0.13]],
    ],
  };
  // the light on the clouds, from the light outward: [r, g, b, strength] at 0, 0.3, 0.65, 1 of the way across
  const DAY_D = [[255, 255, 250, 0.8], [248, 250, 255, 0.72], [236, 242, 252, 0.62], [226, 234, 250, 0.55]];
  const DAY_L = [[255, 255, 255, 0.85], [255, 255, 255, 0.78], [250, 252, 255, 0.7], [246, 248, 255, 0.62]];
  const MOONLIT_D = [[150, 160, 196, 0.09], [130, 140, 180, 0.07], [110, 120, 164, 0.05], [96, 106, 150, 0.04]];
  const MOONLIT_L = [[200, 204, 230, 0.14], [190, 196, 226, 0.11], [180, 186, 220, 0.08], [170, 178, 214, 0.06]];
  const LIT = {
    D: [DAY_D, DAY_D,
      [[255, 246, 224, 0.72], [252, 244, 236, 0.6], [244, 238, 240, 0.5], [228, 230, 244, 0.42]],
      [[255, 232, 178, 0.9], [255, 214, 156, 0.74], [246, 190, 160, 0.55], [214, 176, 182, 0.4]],
      [[255, 226, 160, 1], [255, 204, 138, 0.8], [244, 180, 148, 0.55], [206, 168, 176, 0.38]],
      [[255, 212, 144, 1], [255, 172, 104, 0.82], [250, 142, 122, 0.56], [210, 132, 152, 0.38]],
      [[255, 182, 104, 1], [255, 132, 84, 0.86], [245, 110, 122, 0.62], [200, 100, 152, 0.42]],
      [[255, 142, 84, 0.92], [250, 102, 94, 0.78], [222, 90, 132, 0.58], [172, 90, 152, 0.36]],
      [[220, 100, 84, 0.42], [190, 80, 102, 0.33], [150, 72, 122, 0.24], [112, 72, 132, 0.15]],
      [[150, 80, 92, 0.16], [120, 72, 102, 0.11], [92, 64, 112, 0.07], [72, 62, 112, 0.05]],
      [[130, 130, 170, 0.09], [110, 116, 160, 0.07], [96, 100, 146, 0.05], [84, 90, 136, 0.04]],
      MOONLIT_D, MOONLIT_D,
      [[214, 160, 192, 0.3], [196, 152, 190, 0.26], [170, 144, 188, 0.2], [146, 136, 180, 0.16]],
      [[255, 190, 192, 0.55], [250, 182, 192, 0.5], [232, 172, 192, 0.42], [204, 166, 196, 0.36]],
      [[255, 214, 192, 0.66], [255, 208, 196, 0.6], [242, 200, 204, 0.52], [226, 196, 214, 0.46]],
      DAY_D],
    L: [DAY_L, DAY_L,
      [[255, 246, 226, 0.85], [255, 240, 230, 0.75], [250, 236, 236, 0.62], [240, 236, 246, 0.55]],
      [[248, 190, 100, 0.88], [242, 170, 104, 0.72], [232, 158, 136, 0.52], [204, 162, 182, 0.36]],
      [[246, 182, 84, 0.9], [240, 162, 94, 0.72], [230, 152, 132, 0.5], [200, 160, 182, 0.34]],
      [[240, 152, 62, 0.9], [240, 132, 84, 0.76], [225, 122, 132, 0.55], [190, 130, 172, 0.38]],
      [[236, 122, 52, 0.92], [230, 102, 82, 0.8], [215, 96, 132, 0.6], [170, 100, 172, 0.4]],
      [[230, 102, 62, 0.82], [215, 86, 102, 0.7], [190, 86, 142, 0.5], [150, 96, 166, 0.34]],
      [[200, 100, 92, 0.4], [170, 92, 122, 0.32], [140, 92, 152, 0.24], [120, 100, 162, 0.15]],
      [[150, 100, 132, 0.15], [130, 100, 152, 0.12], [115, 106, 162, 0.08], [110, 110, 172, 0.05]],
      [[140, 130, 180, 0.12], [130, 126, 176, 0.1], [120, 120, 170, 0.07], [114, 116, 168, 0.05]],
      MOONLIT_L, MOONLIT_L,
      [[220, 170, 200, 0.32], [210, 166, 200, 0.28], [190, 160, 200, 0.22], [170, 156, 196, 0.18]],
      [[248, 186, 200, 0.55], [240, 180, 200, 0.5], [226, 176, 204, 0.42], [206, 172, 206, 0.36]],
      [[255, 214, 210, 0.7], [255, 212, 214, 0.64], [246, 210, 220, 0.56], [236, 210, 228, 0.5]],
      DAY_L],
  };
  // the water: [top, bottom] as [r, g, b, a]
  const SEA_DAY_D = [[150, 176, 212, 0.13], [100, 130, 180, 0.15]], SEA_EVE_D = [[6, 8, 22, 0.22], [4, 6, 16, 0.5]], SEA_NIGHT_D = [[4, 6, 18, 0.28], [2, 4, 12, 0.55]];
  const SEA_DAY_L = [[120, 160, 214, 0.16], [90, 130, 196, 0.22]], SEA_EVE_L = [[110, 120, 164, 0.14], [70, 82, 124, 0.3]], SEA_NIGHT_L = [[64, 70, 130, 0.3], [42, 48, 100, 0.4]];
  const SEA = {
    D: [SEA_DAY_D, SEA_DAY_D, [[120, 130, 160, 0.14], [70, 84, 120, 0.2]], [[30, 34, 56, 0.18], [16, 20, 40, 0.36]], SEA_EVE_D, SEA_EVE_D, SEA_EVE_D, SEA_EVE_D, SEA_EVE_D, SEA_EVE_D,
      [[5, 7, 20, 0.25], [3, 5, 14, 0.52]], SEA_NIGHT_D, SEA_NIGHT_D, [[20, 26, 52, 0.24], [10, 14, 34, 0.48]], [[60, 72, 108, 0.18], [30, 40, 70, 0.36]], [[110, 128, 166, 0.15], [64, 80, 120, 0.24]], SEA_DAY_D],
    L: [SEA_DAY_L, SEA_DAY_L, [[130, 150, 190, 0.15], [90, 110, 160, 0.24]], [[116, 124, 168, 0.14], [76, 88, 130, 0.28]], SEA_EVE_L, SEA_EVE_L, SEA_EVE_L, SEA_EVE_L, SEA_EVE_L, SEA_EVE_L,
      [[86, 94, 148, 0.22], [56, 64, 112, 0.36]], SEA_NIGHT_L, SEA_NIGHT_L, [[80, 92, 150, 0.26], [56, 66, 120, 0.36]], [[110, 130, 190, 0.2], [80, 100, 160, 0.28]], [[120, 150, 206, 0.17], [88, 120, 184, 0.24]], SEA_DAY_L],
  };
  // the rest, one number per keyframe
  const F = {
    wU: [0, 0, 0.1, 0.7, 1, 1, 1, 1, 1, 1, 0.4, 0.3, 0.3, 0.15, 0, 0, 0], // light on the clouds' undersides (the low sun)
    wT: [1, 1, 0.85, 0.35, 0.1, 0, 0, 0, 0, 0, 0.3, 0.4, 0.4, 0.8, 1, 1, 1], // … and on their tops and faces (a high or a morning sun)
    inkD: [0, 0, 0.06, 0.18, 0.24, 0.35, 0.4, 0.46, 0.54, 0.6, 0.58, 0.55, 0.55, 0.45, 0.3, 0.15, 0], // dark bellies
    inkL: [0, 0, 0.06, 0.16, 0.2, 0.236, 0.254, 0.274, 0.298, 0.32, 0.33, 0.34, 0.34, 0.3, 0.2, 0.1, 0],
    paleD: [0.13, 0.13, 0.1, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.13], // soft grey bellies by day
    paleL: [0.26, 0.26, 0.2, 0.06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.26],
    land: [1, 1, 0.75, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.5, 1], // the islands lightened by the day's haze
    lh: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0], // the lighthouse
    night: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0.85, 1, 1, 0.35, 0, 0, 0], // the faint stars
    glow: [1, 1, 1, 1, 1, 1, 1, 0.55, 0.2, 0.03, 0, 0, 0, 0, 0, 0, 0], // the sun's glow (lingering into the afterglow)
    spark: [1, 1, 0.8, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.8], // glints all over the water by day
    path: [0.6, 0.8, 0.85, 0.95, 1, 1, 0.85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // the sun's path on the water
    deck0: [1, 1, 1, 1, 1, 1, 1, 1, 0.55, 0.12, 0.12, 0.12, 0.12, 0.6, 1, 1, 1], // each deck's share of the light: the low one loses it first,
    deck1: [1, 1, 1, 1, 1, 1, 1, 0.75, 0.3, 0.12, 0.12, 0.12, 0.12, 0.4, 1, 1, 1], // the high one keeps it longest and gets it first at dawn
    deck2: [1, 1, 1, 1, 1, 1, 1, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.25, 0.9, 1, 1],
  };

  /*
   * The sun's height above the water, in its own radii, along a path slanting down to the right (the sun sets
   * toward the north-west seen from mid latitudes). It comes in at the top at c = 0, slows as it nears the water
   * (the golden hour is not rushed), touches it at c ≈ 0.283 and is gone at c ≈ 0.361; then it is below the horizon
   * (and, from dawn on, behind the viewer or high above the frame) until it comes in again.
   */
  const C8 = 0.17, C_SET = 0.361, SLANT = 0.72;
  function sunAlt(c, A0) {
    if (c > C_SET && c < 0.9) return -1.2 - (c - C_SET) * 60;
    const x = c >= 0.9 ? C8 + (1 - c) : C8 - c; // how long before c8 (wraps through c = 1)
    if (x >= 0) { const e = Math.max(0, (A0 - 21.92) / 0.0289); return 8 + 81.9 * x + e * x * x; }
    const y = 1 - (c - C8) / (C_SET - C8); // 1 … 0 down to the set
    return -1.2 + 9.2 * y * (0.3 + 0.7 * y);
  }
  // its colour by height, [height, colour]: white-gold up high, deep orange on the water
  const SUNC = {
    D: [[30, [255, 230, 168]], [12, [255, 226, 160]], [6, [255, 218, 150]], [3.3, [255, 214, 140]], [0.48, [255, 188, 102]], [-0.93, [255, 118, 60]]],
    L: [[30, [255, 214, 140]], [12, [255, 204, 120]], [6, [255, 190, 96]], [3.3, [255, 182, 84]], [0.48, [250, 152, 58]], [-0.93, [232, 92, 44]]],
  };
  function sunColour(A, L) {
    const k = SUNC[L ? 'L' : 'D'];
    if (A >= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (A >= k[i][0]) return mixc(k[i - 1][1], k[i][1], (k[i - 1][0] - A) / (k[i - 1][0] - k[i][0]));
    return k[k.length - 1][1];
  }
  // the evening star and the young moon follow the sun down the same slant (a little faster through the night)
  const venusAlt = (c) => 7 - (c - C_SET) * 52, moonAlt = (c) => 13 - (c - C_SET) * 52;
  // the stars wheel down to the right through the night, at the same pace
  const STAR_RATE = 52, STAR_C0 = 0.44, STAR_C1 = 0.82;

  /* ---------- cloud decks: masks rendered once (a few rows per frame), coloured every frame ---------- */

  const DECKS = [ // y0..y1: where the deck lies (of the sky's height); drift in px per frame (at u 700)
    { TW: 1536, TH: 168, seed: 41, px: 9, py: 6, lo: 0.53, hi: 0.7, warp: 1.4, rip: 0.26, cov: 0.44, env: [[0.5, 0.5, 1]], y0: 0.03, y1: 0.37, drift: 0.028, amax: 0.82, d: 3 },
    { TW: 1536, TH: 168, seed: 77, px: 7, py: 4, lo: 0.51, hi: 0.67, warp: 1.6, rip: 0.12, cov: 0.46, env: [[0.5, 0.42, 1]], y0: 0.33, y1: 0.61, drift: 0.05, amax: 0.9, d: 3 },
    { TW: 1536, TH: 96, seed: 113, px: 4, py: 4, lo: 0.53, hi: 0.63, warp: 0.9, rip: 0, cov: 0.33, env: [[0.3, 0.13, 1], [0.7, 0.12, 0.9]], y0: 0.66, y1: 0.985, drift: 0.085, amax: 0.96, d: 2 },
  ];
  const TEX = new Map();

  function* deckGen(o, s) {
    const TW = Math.max(16, Math.round(o.TW * s)), TH = Math.max(8, Math.round(o.TH * s)), A = new Float32Array(TW * TH);
    const f = K.fbm(o.seed, o.px, o.py, s < 0.5 ? 4 : 5), wp = K.fbm(o.seed + 3, Math.max(1, o.px >> 1), o.py, 2), cv = K.fbm(o.seed + 7, 3, 1, 2);
    const rp = o.rip ? K.fbm(o.seed + 5, o.px * 6, o.py * 4, 2) : null;
    for (let y = 0; y < TH; y++) {
      const v = (y + 0.5) / TH;
      let env = 0;
      for (const [c, wd, a] of o.env) env += a * Math.exp(-(((v - c) / wd) ** 2) * 2.2);
      env = Math.min(1, env) * sm(0, 0.16, v) * sm(1, 0.84, v); // nothing at the deck's top and bottom edges
      for (let x = 0; x < TW; x++) {
        let uu = (x / TW) * o.px, vv = v * o.py;
        uu += (wp(uu * 0.5, vv) - 0.5) * o.warp; vv += (wp(uu * 0.5 + 3.7, vv + 1.9) - 0.5) * o.warp * 0.35;
        let n = f(uu, vv);
        if (rp) n += (rp((x / TW) * o.px * 6, v * o.py * 4) - 0.5) * o.rip;
        const cover = sm(o.cov - 0.12, o.cov + 0.12, cv((x / TW) * 3, v));
        A[y * TW + x] = sm(o.lo, o.hi, n) * env * cover;
      }
      if (s < 0.5 ? (y & 7) === 7 : (y & 1) === 1) yield;
    }
    // the masks: the body; the part a low sun lights (the underside, thin and frayed parts, edges); the part a high sun lights (the tops)
    const mkMask = () => { const c = K.mk(TW, TH), x = c.getContext('2d'); return [c, x, x.createImageData(TW, TH)]; };
    const [dc, dx, di] = mkMask(), [uc, ux, ui] = mkMask(), [tc, tx, ti] = mkMask(), dd = di.data, ud = ui.data, td = ti.data, d = Math.max(1, Math.round(o.d * Math.max(0.5, s)));
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const k = y * TW + x, a = A[k];
        if (a < 0.004) continue;
        const below = y + d < TH ? A[k + d * TW] : 0, above = y - d >= 0 ? A[k - d * TW] : 0, above2 = y - 2 * d >= 0 ? A[k - 2 * d * TW] : 0;
        const under = Math.max(0, (a - below) / Math.max(a, 0.08)), top = Math.max(0, (a - above) / Math.max(a, 0.08)), top2 = Math.max(0, (a - above2) / Math.max(a, 0.08));
        const litU = Math.min(1, 0.22 + 1.1 * under + 0.45 * (1 - a) + 0.3 * top);
        const litT = Math.min(1, 0.3 + 0.75 * top + 0.35 * top2 + 0.3 * (1 - a) - 0.25 * under);
        const o4 = k * 4;
        dd[o4] = dd[o4 + 1] = dd[o4 + 2] = 255; dd[o4 + 3] = Math.round(Math.min(1, a ** 1.1 * o.amax) * 255);
        ud[o4] = ud[o4 + 1] = ud[o4 + 2] = 255; ud[o4 + 3] = Math.round(Math.min(1, a ** 0.8 * litU * o.amax * 1.15) * 255);
        td[o4] = td[o4 + 1] = td[o4 + 2] = 255; td[o4 + 3] = Math.round(Math.max(0, Math.min(1, a ** 0.8 * litT * o.amax * 1.1)) * 255);
      }
      if ((y & 15) === 15) yield;
    }
    dx.putImageData(di, 0, 0); ux.putImageData(ui, 0, 0); tx.putImageData(ti, 0, 0);
    dc.__k = `ssDeck${o.seed}x${s}`; // for K.tint's cache
    return { dens: dc, litU: uc, litT: tc };
  }
  function deck(i, pv) {
    const k = `${i}${pv ? 'p' : ''}`;
    let j = TEX.get(k);
    if (!j) { j = { ready: false, gen: null }; j.gen = (function* () { const r = yield* deckGen(DECKS[i], pv ? 0.25 : 1); Object.assign(j, r); j.ready = true; })(); TEX.set(k, j); }
    return j;
  }
  function pump(ms, pv) {
    const t0 = performance.now();
    for (let i = 0; i < DECKS.length; i++) {
      const j = deck(i, pv);
      while (!j.ready && (pv || performance.now() - t0 < ms)) j.gen.next();
      if (!j.ready) return;
    }
  }

  /* ---------- sprites ---------- */

  function radial(keyS, size, stops) {
    if (K.cache.has(keyS)) return K.cache.get(keyS);
    const c = K.mk(size, size), x = c.getContext('2d'), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    K.cache.set(keyS, c);
    return c;
  }
  const starSpr = (L) => radial(`ssStar|${L}`, 32, L
    ? [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.85)'], [0.28, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]
    : [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(236,240,255,0.9)'], [0.24, 'rgba(220,228,255,0.22)'], [0.5, 'rgba(220,228,255,0.04)'], [1, 'rgba(220,228,255,0)']]);
  const lampSpr = (L) => radial(`ssLamp|${L}`, 32, L
    ? [[0, 'rgba(214,120,30,1)'], [0.15, 'rgba(214,130,40,0.7)'], [0.4, 'rgba(214,130,40,0.12)'], [1, 'rgba(214,130,40,0)']]
    : [[0, 'rgba(255,252,236,1)'], [0.12, 'rgba(255,236,190,0.85)'], [0.3, 'rgba(255,220,160,0.22)'], [0.6, 'rgba(255,210,150,0.05)'], [1, 'rgba(255,210,150,0)']]);
  /** A glint on the water: a short soft dash (white; tinted per colour, a few dozen at most over the cycle). */
  function dashSpr(c) {
    const q = c.map((v) => Math.round(v / 12) * 12), k = `ssDash|${q}`;
    if (K.cache.has(k)) return K.cache.get(k);
    const cv = K.mk(48, 6), x = cv.getContext('2d'), g = x.createRadialGradient(24, 3, 0, 24, 3, 24);
    g.addColorStop(0, rgba(q, 1)); g.addColorStop(0.35, rgba(q, 0.6)); g.addColorStop(1, rgba(q, 0));
    x.setTransform(1, 0, 0, 0.125, 0, 2.625); x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    K.cache.set(k, cv);
    return cv;
  }
  /** The young moon, lit on its right (+x) by the sun, the rest faint with earthshine; alpha is how bright. */
  function moonSpr(L) {
    const k = `ssMoon|${L}`;
    if (K.cache.has(k)) return K.cache.get(k);
    const N = 96, r = N * 0.3, cv = K.mk(N, N), x = cv.getContext('2d'), c = N / 2;
    const lit = K.mk(N, N), lx = lit.getContext('2d');
    lx.fillStyle = '#fff'; lx.beginPath(); lx.arc(c, c, r, 0, TAU); lx.fill();
    lx.globalCompositeOperation = 'destination-out'; lx.beginPath(); lx.ellipse(c - r * 0.34, c, r * 1.02, r * 1.06, 0, 0, TAU); lx.fill(); // what is left is the crescent
    x.fillStyle = L ? 'rgba(255,255,255,0.16)' : 'rgba(120,132,168,0.28)'; x.beginPath(); x.arc(c, c, r, 0, TAU); x.fill(); // earthshine
    const hg = x.createRadialGradient(c + r * 0.6, c, 0, c + r * 0.6, c, r * 1.6); // a little halo on the lit side
    hg.addColorStop(0, L ? 'rgba(255,255,255,0.25)' : 'rgba(255,244,220,0.18)'); hg.addColorStop(1, 'rgba(255,244,220,0)');
    x.fillStyle = hg; x.fillRect(0, 0, N, N);
    x.globalCompositeOperation = L ? 'source-over' : 'lighter';
    if (!L) { const t2 = K.mk(N, N), t2x = t2.getContext('2d'); t2x.drawImage(lit, 0, 0); t2x.globalCompositeOperation = 'source-in'; t2x.fillStyle = 'rgb(255,246,222)'; t2x.fillRect(0, 0, N, N); x.drawImage(t2, 0, 0); }
    else x.drawImage(lit, 0, 0);
    K.cache.set(k, cv);
    return cv;
  }

  /* ---------- the still scenery: headland, islets and their reflections, the night sky ---------- */

  function build(bg, V) {
    const { W, H, u, pv } = V, L = K.light(), R = K.rng(5309), q = bg.dpr || 1;
    const wy = Math.round(H * (pv ? 0.7 : 0.74)), xs = W * (pv ? 0.6 : 0.63), rs = Math.max(pv ? 3.2 : 9, u * 0.031);
    const y0 = Math.floor(wy - u * 0.12), lh = H - y0, [land, lc] = K.layer(W, lh, q);
    lc.translate(0, -y0);
    const inkFar = L ? [150, 140, 172] : [44, 36, 62], inkNear = L ? [98, 92, 124] : [10, 9, 20];
    const shape = (x0, x1, hgt, rough, seed, flat) => { // an island's top: rising from the water, a lumpy crest, falling again
      const N = 64, hts = K.ridge(K.rng(seed), N, rough), pts = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N, env = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) ** (flat || 0.55);
        pts.push([x0 + (x1 - x0) * k, wy - hgt * env * (0.72 + 0.28 * hts[i])]);
      }
      return pts;
    };
    const fillShape = (pts, col, a) => { lc.fillStyle = rgba(col, a); lc.beginPath(); lc.moveTo(pts[0][0], wy + 1); for (const [x, y] of pts) lc.lineTo(x, y); lc.lineTo(pts[pts.length - 1][0], wy + 1); lc.closePath(); lc.fill(); };
    // far islands, hazy, low on the horizon
    fillShape(shape(W * 0.18, W * 0.42, u * 0.018, 0.55, 11, 0.4), inkFar, 0.75);
    fillShape(shape(W * 0.8, W * 1.04, u * 0.022, 0.6, 12, 0.5), inkFar, 0.7);
    // the headland on the left, with a lower spur in front, and two islets right of the sun
    const head = shape(-W * 0.16, W * (pv ? 0.26 : 0.22), u * 0.075, 0.5, 13, 0.7); // it runs off the left edge, high
    fillShape(head, inkNear, 1);
    fillShape(shape(W * 0.12, W * 0.3, u * 0.03, 0.6, 14, 0.6), inkNear, 1);
    fillShape(shape(W * 0.735, W * 0.79, u * 0.024, 0.65, 15, 0.7), inkNear, 1);
    fillShape(shape(W * 0.785, W * 0.81, u * 0.012, 0.7, 16, 0.8), inkNear, 1);
    // trees along the headland's crest, too far for more than a roughness
    lc.fillStyle = rgba(inkNear, 1);
    for (let i = 4; i < head.length - 4; i++) {
      const [x, y] = head[i];
      for (let k = 0; k < 3; k++) { const r = u * (0.002 + R() * 0.003) * (pv ? 1.5 : 1); lc.beginPath(); lc.arc(x + (R() - 0.5) * (W * 0.3 / 64), y + r * 0.6, r, 0, TAU); lc.fill(); }
    }
    // a lighthouse on the headland's spur
    const lhx = W * 0.27, lhb = wy - u * 0.01, th = u * 0.026, b0 = u * 0.0042, b1 = u * 0.0027;
    lc.beginPath(); lc.moveTo(lhx - b0, lhb + 2); lc.lineTo(lhx - b1, lhb - th); lc.lineTo(lhx + b1, lhb - th); lc.lineTo(lhx + b0, lhb + 2); lc.closePath(); lc.fill(); // the tapering tower
    lc.fillRect(lhx - b1 * 1.6, lhb - th - u * 0.0012, b1 * 3.2, u * 0.0014); // its gallery
    lc.fillRect(lhx - b1 * 0.55, lhb - th - u * 0.0052, b1 * 0.25, u * 0.0042); lc.fillRect(lhx + b1 * 0.3, lhb - th - u * 0.0052, b1 * 0.25, u * 0.0042); // the lantern's frame
    lc.beginPath(); lc.moveTo(lhx - b1 * 0.85, lhb - th - u * 0.005); lc.lineTo(lhx, lhb - th - u * 0.0085); lc.lineTo(lhx + b1 * 0.85, lhb - th - u * 0.005); lc.closePath(); lc.fill(); // its cap
    // by day the same land seen through the haze: lighter, bluer
    const [landDay, ldc] = K.layer(W, lh, q);
    ldc.setTransform(1, 0, 0, 1, 0, 0); ldc.drawImage(land, 0, 0); ldc.globalCompositeOperation = 'source-in'; ldc.fillStyle = L ? 'rgb(172,178,200)' : 'rgb(92,104,134)'; ldc.fillRect(0, 0, landDay.width, landDay.height);
    // the reflections: the land upside down, shortened and fading into the water
    const [refl, rc] = K.layer(W, lh, q);
    rc.translate(0, -y0);
    rc.save(); rc.translate(0, wy * 1.65 + 1); rc.scale(1, -0.65); rc.drawImage(land, 0, y0, W, lh); rc.restore(); // y' = wy + (wy - y) · 0.65
    rc.globalCompositeOperation = 'destination-in'; // (clears everything outside the water too)
    const fg = rc.createLinearGradient(0, wy, 0, wy + u * 0.06); fg.addColorStop(0, 'rgba(0,0,0,0.75)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    rc.fillStyle = fg; rc.fillRect(0, wy, W, H - wy);

    // the night sky, larger than the view by as far as it wheels through the night (down and to the right)
    const dY = (STAR_C1 - STAR_C0) * STAR_RATE * rs, dX = dY * SLANT; // how far it drifts, in px
    const SW = W + dX, SH = wy + dY, [sky, skc] = K.layer(SW, SH, q);
    const nFaint = pv ? 60 : Math.round(Math.min(4200, (SW * SH) / 1e6 * 1700));
    for (let i = 0; i < nFaint; i++) {
      const m = R(), a = L ? 0.4 + 0.55 * (1 - m) : 0.16 + 0.62 * (1 - m) ** 1.6, r = (pv ? 0.3 : 0.42) + 0.55 * (1 - m) ** 3;
      skc.fillStyle = L ? `rgba(255,255,255,${a.toFixed(3)})` : rgba(R() < 0.25 ? [255, 226, 200] : R() < 0.3 ? [200, 214, 255] : [236, 238, 250], a);
      skc.beginPath(); skc.arc(R() * SW, R() * SH, r, 0, TAU); skc.fill();
    }
    const stars = [];
    for (let i = 0, n = pv ? 16 : Math.round(Math.min(300, (SW * SH) / 1e6 * 130)); i < n; i++) {
      const m = R() ** 0.7;
      stars.push({ x: R() * SW, y: R() * SH, m, s: (pv ? 3 : 4.5) + (1 - m) * (pv ? 2.5 : 6.5), a: 0.35 + 0.6 * (1 - m), ph: R() * TAU, f: 0.05 + R() * 0.08 });
    }
    const swells = Array.from({ length: pv ? 5 : 32 }, (_, i) => ({ k: (i + 0.5 + (R() - 0.5) * 0.6) / (pv ? 5 : 32), x: R() * W, len: 0.08 + R() * 0.3, sp: (R() - 0.5) * 0.12, a: 0.5 + R() * 0.5 }));
    const sparks = Array.from({ length: pv ? 8 : 70 }, () => ({ k: R(), x: R() * W, len: 0.4 + R() * 0.8, ph: R() * TAU, f: 0.05 + R() * 0.09 }));
    const [scr, scx] = K.layer(W, wy, q);
    const A0 = (wy + rs * 1.4) / rs; // the height at which the sun is just above the frame
    return { wy, xs, rs, y0, lh, land, landDay, refl, sky, sq0: sky.width / SW, dX, dY, stars, swells, sparks, scr, scx, lhx, lhy: lhb - th - u * 0.0031, sq: scr.width / W, A0 };
  }

  function init(V, S) {
    return { kind: 'sunset', key: S.key, T: Math.round(C_START * PERIOD), birds: [], flockIn: V.pv ? 9999 : 260 + RND() * 300 };
  }

  /** A flock comes over: a loose V or a string, flapping out of step, now and then gliding. */
  function flock(st, V, S) {
    const { W, u } = V, dir = RND() < 0.5 ? 1 : -1, n = 3 + ((RND() * 7) | 0), s = u * (0.006 + RND() * 0.006), vee = RND() < 0.55;
    const y = S.wy * (0.22 + RND() * 0.42), v = u * (0.0016 + RND() * 0.001), x0 = dir > 0 ? -u * 0.08 : W + u * 0.08;
    for (let i = 0; i < n; i++) {
      const rank = vee ? Math.ceil(i / 2) : i, side = vee ? (i % 2 ? 1 : -1) : 0.25 * (RND() - 0.5);
      st.birds.push({ x: x0 - dir * rank * s * (vee ? 2.6 : 3.4) - dir * RND() * s, y: y + side * rank * s * (vee ? 1.5 : 1) + (RND() - 0.5) * s * 0.8, v: v * (0.97 + RND() * 0.06), dir, s: s * (0.85 + RND() * 0.3),
        ph: RND() * TAU, fs: 0.24 + RND() * 0.06, glide: 0, bob: RND() * TAU });
    }
  }

  /**
   * A light's path on the water (the sun's, or the moon's): glints that come and go under it, widest toward us. The
   * higher the light, the farther down the water its reflection lies and the wider it spreads.
   */
  function glitter(ctx, V, S, x, ly, col, I, t, L, narrow) {
    const { u, H, pv } = V, { wy, rs } = S, wh = H - wy, rows = pv ? 12 : 54, spr = dashSpr(col);
    const hgt = Math.max(0, wy - ly), yRef = wy + hgt * 0.9, spread = Math.max(wh * 0.35, hgt * 0.5), wide = 1 + Math.min(2.5, hgt / (rs * 8));
    for (let j = 0; j < rows; j++) {
      const kq = (j + 0.5) / rows, y = wy + 1.5 + wh * kq ** 1.65, hw = rs * (0.7 + 5.5 * kq ** 1.15) * wide * narrow;
      const wRow = 0.35 + 0.65 * Math.exp(-(((y - yRef) / spread) ** 2));
      for (let i = 0; i < 2; i++) {
        const ss = Math.sin(t * (0.021 + (j % 5) * 0.004) + j * 12.9898 + i * 78.233), sx = ss * Math.abs(ss) ** 0.6; // bunched toward the middle
        const fl = Math.sin(t * (0.09 + (j % 3) * 0.03) + j * 3.7 + i * 1.9);
        if (fl < -0.2) continue;
        const len = rs * (0.3 + 1.5 * kq) * (0.5 + 0.5 * fl) * narrow;
        ctx.globalAlpha = Math.min(1, I * wRow * (L ? 0.7 : 0.85) * (1 - 0.5 * kq) * (0.3 + 0.7 * fl) * (1 - 0.6 * Math.abs(sx)));
        ctx.drawImage(spr, x + sx * hw - len / 2, y - Math.max(1, u * 0.0016), len, Math.max(2, u * 0.0032));
      }
    }
  }

  window.BG_EXT.sunset = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.72, 1.7), { W, H, u } = V, L = K.light(), pv = V.pv;
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'sunset' || st.key !== S.key) { const T = st && st.kind === 'sunset' ? st.T : null; st = bg.st = init(V, S); if (T != null) st.T = T; }
    pump(5, pv);
    st.T++;
    const c = (((st.T % PERIOD) + PERIOD) % PERIOD) / PERIOD, M = L ? 'L' : 'D', add = L ? 'source-over' : 'lighter', k7 = u / 700;
    const { wy, xs, rs } = S, wh = H - wy;
    const A = sunAlt(c, S.A0), flat = 1 - 0.16 * sm(2.5, 0, A), sx = xs - A * rs * SLANT, sy = wy - A * rs * flat;
    const sunC = sunColour(A, L), glowK = at(F.glow, c), setX = xs + 1.2 * rs * SLANT;
    const gx = A > -1.2 ? sx : setX, gy = Math.max(sy, wy - rs * 0.4); // the glow stays where the sun went down
    const night = at(F.night, c);
    ctx.save(); ctx.translate(0, -V.oy);

    // 1. the sky's bands of haze
    const sk = at(SKY[M], c), g = ctx.createLinearGradient(0, 0, 0, wy);
    sk.forEach((col, i) => g.addColorStop(SKY_AT[i], rgba(col, col[3])));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, wy);

    // 2. the night: the stars wheeling down to the right (dimmer near the horizon), the evening star, the young moon
    const drift = Math.max(0, Math.min(1, (c - STAR_C0) / (STAR_C1 - STAR_C0))), ox = -S.dX + S.dX * drift, oy = -S.dY + S.dY * drift;
    const starOp = L ? 'destination-out' : 'lighter';
    if (night > 0.005) {
      ctx.globalCompositeOperation = starOp;
      const q0 = S.sq0, bands = [[0, 0.68, 1], [0.68, 0.84, 0.66], [0.84, 1, 0.36]];
      for (const [a0, a1, k] of bands) {
        const ya = wy * a0, yb = wy * a1;
        ctx.globalAlpha = night * k * (L ? 0.85 : 1);
        ctx.drawImage(S.sky, (0 - ox) * q0, (ya - oy) * q0, W * q0, (yb - ya) * q0, 0, ya, W, yb - ya);
      }
    }
    if (c > 0.42 && c < 0.86) {
      ctx.globalCompositeOperation = starOp;
      const spr = starSpr(L);
      for (const s of S.stars) {
        const vis = sm(0.45 + 0.07 * s.m, 0.49 + 0.07 * s.m, c) * (1 - sm(0.77 - 0.06 * s.m, 0.81 - 0.06 * s.m, c)); // brightest first at dusk, last at dawn
        if (vis < 0.01) continue;
        const x = s.x + ox, y = s.y + oy;
        if (x < -10 || x > W + 10 || y < -10 || y > wy) continue;
        const ext = sm(wy, wy * 0.72, y), tw = 0.78 + 0.22 * Math.sin(t * s.f + s.ph);
        ctx.globalAlpha = Math.min(1, vis * s.a * tw * ext * (L ? 0.8 : 1)); ctx.drawImage(spr, x - s.s / 2, y - s.s / 2, s.s, s.s);
      }
    }
    const vA = venusAlt(c), vVis = sm(0.355, 0.39, c) * sm(-1.2, 0.8, vA) * (c < 0.7 ? 1 : 0);
    if (vVis > 0.01) {
      const x = xs - W * 0.05 - vA * rs * SLANT, y = wy - vA * rs, z = pv ? 6 : 13;
      ctx.globalCompositeOperation = starOp; ctx.globalAlpha = vVis * (L ? 0.85 : 1) * sm(-1.2, 1.5, vA); ctx.drawImage(starSpr(L), x - z / 2, y - z / 2, z, z);
    }
    const mA = moonAlt(c), mVis = sm(0.36, 0.44, c) * sm(-1.3, 0.6, mA) * (c < 0.75 ? 1 : 0);
    const mx = xs - W * 0.14 - mA * rs * SLANT, my = wy - mA * rs;
    if (mVis > 0.01) { // its lit side toward the sun, down the slant below the horizon
      const z = (rs * 0.85) / 0.6, low = sm(-1, 3, mA); // (the disc is 0.6 of the sprite's half-size)
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(1, SLANT));
      ctx.globalCompositeOperation = L ? 'destination-out' : 'lighter'; ctx.globalAlpha = mVis * (0.55 + 0.45 * low) * (L ? 0.9 : 0.95);
      ctx.drawImage(moonSpr(L), -z, -z, z * 2, z * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 3. the sun's glow on the air: a wide light, a tighter one, and when it is low a long band along the horizon
    if (glowK > 0.01) {
      ctx.globalCompositeOperation = add;
      const lowK = sm(9, 2, A), hi = 1 - 0.2 * sm(4, 16, A); // a high sun's glow is a little gentler
      const gc = mixc(sunC, [255, 120, 80], c < 0.9 ? sm(0.33, 0.43, c) : 0); // redder into the afterglow (no glow is left by c = 0.9)
      K.glow(ctx, gx, gy, u * 0.95, [[0, rgba(gc, 0.2 * glowK * hi)], [0.3, rgba(gc, (L ? 0.08 : 0.07) * glowK * hi)], [1, rgba(gc, 0)]], 1.4, 0.75);
      K.glow(ctx, gx, gy, u * 0.24, [[0, rgba(mixc(sunC, [255, 255, 240], L ? 0 : 0.25), (L ? 0.3 : 0.42) * glowK * hi)], [0.4, rgba(sunC, (L ? 0.1 : 0.13) * glowK * hi)], [1, rgba(sunC, 0)]]);
      if (lowK > 0.01) K.glow(ctx, gx, wy, u * 0.9, [[0, rgba(gc, (L ? 0.2 : 0.22) * glowK * lowK)], [0.5, rgba(gc, 0.05 * glowK * lowK)], [1, rgba(gc, 0)]], 1.6, 0.09);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4. the decks of cloud: bellies (dark at dusk and night, soft grey by day; the low deck after the sun, so it can
    //    cross it), then the lit parts: undersides for a low sun, tops for a high one, coloured from the light outward
    const inkA = at(F[L ? 'inkL' : 'inkD'], c), paleA = at(F[L ? 'paleL' : 'paleD'], c), wU = at(F.wU, c), wT = at(F.wT, c);
    const ink = L ? 'rgb(134,126,172)' : 'rgb(22,18,40)', pale = L ? 'rgb(150,158,182)' : 'rgb(150,160,184)';
    const decks = DECKS.map((o, i) => { const j = deck(i, pv); return j.ready ? { o, j, y: o.y0 * wy, hh: (o.y1 - o.y0) * wy, lk: at(F['deck' + i], c) } : null; });
    const tile = (d) => d.hh * (d.j.dens.width / d.j.dens.height);
    const off = (d) => t * d.o.drift * k7 * (pv ? 0.4 : 1);
    const shade = (d, k) => {
      if (!d) return;
      if (inkA > 0.004) K.band(ctx, K.tint(d.j.dens, ink), W, d.y, d.hh, tile(d), off(d), inkA * k);
      if (paleA > 0.004) K.band(ctx, K.tint(d.j.dens, pale), W, d.y, d.hh, tile(d), off(d), paleA * k);
    };
    shade(decks[0], 0.62); shade(decks[1], 0.8);
    const soft = sm(3, 12, A), bR = rs * (3.4 + 4 * soft), R1 = rs * (1.25 + 0.5 * soft);
    if (A > -1.1 && sy > -bR) { // the sun's disc, flattened near the water, cut off by it; high up, a bloom of light round it
      // up high it is glare more than a disc: its edge melts into a wide bloom (a hard-edged pale disc would read as the moon)
      const bloom = sm(1.5, 8, A);
      if (bloom > 0.01) {
        ctx.globalCompositeOperation = add;
        K.glow(ctx, sx, sy, bR, [[0, rgba(mixc(sunC, [255, 255, 245], 0.3), (L ? 0.42 : 0.68) * bloom)], [0.22, rgba(mixc(sunC, [255, 206, 120], 0.4 * soft), (L ? 0.26 : 0.38) * bloom)], [0.5, rgba(sunC, (L ? 0.08 : 0.12) * bloom)], [1, rgba(sunC, 0)]]);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, wy); ctx.clip();
      ctx.translate(sx, sy); ctx.scale(1, flat);
      const e = 1 / (1.25 + 0.5 * soft); // the disc's edge, as a fraction of R1
      const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, R1), core = L ? sunC : mixc(sunC, [255, 252, 236], 0.45 - 0.1 * soft);
      dg.addColorStop(0, rgba(core, 0.95)); dg.addColorStop(0.62 * e * 1.25, rgba(mixc(core, sunC, 0.6 - 0.4 * soft), L ? 0.92 : 0.9)); dg.addColorStop(0.8 * e * 1.25, rgba(sunC, (L ? 0.85 : 0.8) - 0.25 * soft));
      dg.addColorStop(Math.min(0.99, 0.86 * e * 1.25 + 0.12 * soft), rgba(sunC, 0.25 + 0.15 * soft)); dg.addColorStop(1, rgba(sunC, 0));
      ctx.globalCompositeOperation = add; ctx.fillStyle = dg; ctx.fillRect(-R1, -R1, R1 * 2, R1 * 2);
      ctx.restore();
    }
    shade(decks[2], 1);
    const lit = at(LIT[M], c), sc = S.scx;
    sc.setTransform(S.sq, 0, 0, S.sq, 0, 0); sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, W, wy);
    let any = false;
    for (const d of decks) {
      if (!d) continue;
      if (any) { sc.globalCompositeOperation = 'destination-out'; K.band(sc, d.j.dens, W, d.y, d.hh, tile(d), off(d), 1); sc.globalCompositeOperation = 'source-over'; } // a nearer deck hides the light on one behind it
      if (wU > 0.004) K.band(sc, d.j.litU, W, d.y, d.hh, tile(d), off(d), d.lk * wU);
      if (wT > 0.004) K.band(sc, d.j.litT, W, d.y, d.hh, tile(d), off(d), d.lk * wT);
      any = true;
    }
    if (any) {
      // the light comes from the sun while it is up or just down; through the night and the morning from high behind the viewer
      const far = c > 0.52 && c < 0.6 ? sm(0.52, 0.6, c) : c >= 0.6 && c < 0.93 ? 1 : c >= 0.93 ? 1 - sm(0.93, 1, c) : 0;
      const lx = gx + (W * 0.5 - gx) * far, ly = gy + (-H * 1.2 - gy) * far, lr = Math.max(W, wy) * (1.05 + 1.2 * far);
      const lg = sc.createRadialGradient(lx, ly, 0, lx, ly, lr);
      [0, 0.3, 0.65, 1].forEach((o, i) => lg.addColorStop(o, rgba(lit[i], lit[i][3])));
      sc.globalCompositeOperation = 'source-in'; sc.fillStyle = lg; sc.fillRect(0, 0, W, wy); sc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = add; ctx.globalAlpha = L ? 0.85 : 0.95; ctx.drawImage(S.scr, 0, 0, W, wy);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // 5. the water: its body, the horizon's light lying on it
    const sea = at(SEA[M], c), sg = ctx.createLinearGradient(0, wy, 0, H);
    sg.addColorStop(0, rgba(sea[0], sea[0][3])); sg.addColorStop(1, rgba(sea[1], sea[1][3]));
    ctx.fillStyle = sg; ctx.fillRect(0, wy, W, wh);
    const hz = sk[4];
    ctx.globalCompositeOperation = add;
    const rg = ctx.createLinearGradient(0, wy, 0, wy + wh * 0.8);
    rg.addColorStop(0, rgba(hz, hz[3] * (L ? 0.55 : 0.75))); rg.addColorStop(0.35, rgba(hz, hz[3] * (L ? 0.2 : 0.25))); rg.addColorStop(1, rgba(hz, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, wy, W, wh);
    ctx.globalCompositeOperation = 'source-over';
    // the land on the horizon and its reflection, hazy by day, dark at night
    const landDay = at(F.land, c);
    K.stamp(ctx, S.refl, 0, S.y0, W, S.lh, (L ? 0.35 : 0.55) * (1 - 0.55 * landDay));
    K.stamp(ctx, S.land, 0, S.y0, W, S.lh, L ? 0.55 : 0.9);
    if (landDay > 0.004) { ctx.globalAlpha = landDay * (L ? 0.7 : 0.8); ctx.drawImage(S.landDay, 0, S.y0, W, S.lh); ctx.globalAlpha = 1; }
    // the lighthouse through the night: a slow beat
    const lhOn = at(F.lh, c) * (L ? 0.8 : 1);
    if (lhOn > 0.01) { const b = Math.max(0, Math.sin(t * 0.06)) ** 3, z = u * 0.024; ctx.globalCompositeOperation = add; ctx.globalAlpha = lhOn * (0.35 + 0.65 * b); ctx.drawImage(lampSpr(L), S.lhx - z / 2, S.lhy - z / 2, z, z); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }

    // 6. lights on the water: the sun's path, the moon's, glints all over it by day, the swell
    ctx.globalCompositeOperation = add;
    const pathI = at(F.path, c);
    if (pathI > 0.01) {
      const colG = mixc(sunC, [255, 255, 240], L ? 0 : 0.25), lowK = sm(10, 2, A);
      if (lowK > 0.01) K.glow(ctx, gx, wy + wh * 0.12, rs * 2.2, [[0, rgba(sunC, (L ? 0.25 : 0.28) * pathI * lowK)], [1, rgba(sunC, 0)]], 0.7, 2.4);
      glitter(ctx, V, S, gx, Math.max(sy, -H), colG, pathI * (0.55 + 0.45 * lowK), t, L, 1);
    }
    if (mVis > 0.05 && mA < 14) glitter(ctx, V, S, mx, my, L ? [150, 150, 190] : [220, 226, 240], mVis * 0.3 * sm(14, 4, mA) * sm(-1, 1.5, mA), t, L, 0.45);
    const spark = at(F.spark, c);
    if (spark > 0.01) {
      const spr = dashSpr(L ? [255, 255, 255] : [232, 238, 252]);
      for (const p of S.sparks) {
        const fl = Math.sin(t * p.f + p.ph);
        if (fl < 0.3) continue;
        const y = wy + 3 + wh * p.k ** 1.4, len = rs * p.len * (0.4 + p.k);
        ctx.globalAlpha = spark * (fl - 0.3) * (L ? 0.7 : 0.45); ctx.drawImage(spr, p.x - len / 2, y - 1, len, Math.max(1.5, u * 0.0024));
      }
    }
    const sw = dashSpr(L ? [120, 120, 160] : mixc(hz, [200, 200, 230], 0.4));
    for (const s of S.swells) {
      s.x += s.sp * k7;
      const y = wy + 2 + wh * s.k ** 1.5, len = W * s.len * (0.4 + s.k), x = ((s.x % (W + len)) + W + len) % (W + len) - len / 2;
      ctx.globalAlpha = (L ? 0.14 : 0.09) * s.a * (0.6 + 0.4 * Math.sin(t * 0.02 + s.k * 30)); ctx.drawImage(sw, x - len / 2, y - 1, len, Math.max(1.5, u * 0.0022));
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // 7. birds crossing, by day and at dusk (none deep in the night)
    if (--st.flockIn <= 0 && !st.birds.length) { if (night < 0.2) flock(st, V, S); st.flockIn = 900 + RND() * 1300; }
    if (st.birds.length) {
      ctx.strokeStyle = L ? 'rgba(54,50,74,0.62)' : 'rgba(8,7,16,0.8)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = st.birds.length - 1; i >= 0; i--) {
        const b = st.birds[i];
        b.x += b.v * b.dir; b.bob += 0.05;
        if (b.glide > 0) b.glide--; else if (RND() < 0.004) b.glide = 30 + RND() * 50;
        b.ph += b.glide > 0 ? 0 : b.fs;
        if ((b.dir > 0 && b.x > W + u * 0.1) || (b.dir < 0 && b.x < -u * 0.1)) { st.birds.splice(i, 1); continue; }
        const f = b.glide > 0 ? 0.15 : Math.sin(b.ph), s = b.s, x = b.x, y = b.y + Math.sin(b.bob) * s * 0.3 - f * s * 0.08;
        const tipY = y - s * 0.55 * f + s * 0.1, cy = y - s * (0.3 + 0.12 * f);
        ctx.lineWidth = Math.max(pv ? 0.6 : 1, s * 0.17);
        ctx.beginPath(); ctx.moveTo(x - s, tipY); ctx.quadraticCurveTo(x - s * 0.45, cy, x, y); ctx.quadraticCurveTo(x + s * 0.45, cy, x + s, tipY); ctx.stroke();
      }
    }
    ctx.restore();
  };

  /** The picker's still: the sun half in the sea, the clouds lit. */
  window.BG_PV_STILL.sunset = (bg) => { if (bg.st && bg.st.kind === 'sunset') bg.st.T = Math.round(C_PREVIEW * PERIOD); return 2; };
})();
