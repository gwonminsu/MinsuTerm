'use strict';
/*
 * Cursors redrawn in layers (they were flat CSS shapes): 보석 · 모래시계 · 미니 시계 · 행성 · 눈알.
 * Styles and animations in fx/cursor-up-b.css; gradients in a hidden <svg> (#cub-defs) mounted below.
 *
 * Built like fx/cursor-art.js: a box fitted to the caret cell (.cub-box: square 20 x 20 or tall 20 x 40), a little
 * larger than the cell, and every moving part its own layer (.cl: an <svg>, or a <span> grouping some) of which only
 * transform and opacity are animated, so the compositor runs them and nothing is repainted. They react to typing
 * through the cursor's .moving class and hold still when the terminal loses focus or the app is idle (cursors.css).
 */
(function () {
  const n2 = (v) => +v.toFixed(2);
  const L = (h, cls, body, style) => `<svg class="cl ${cls}" viewBox="0 0 20 ${h}" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const Q = (cls, body, style) => L(20, cls, body, style); // square
  const T = (cls, body, style) => L(40, cls, body, style); // tall
  const G = (cls, inner, style) => `<span class="cl ${cls}"${style ? ` style="${style}"` : ''}>${inner}</span>`;
  const box = (shape, cls, inner) => `<span class="cub-box cub-${shape} ${cls}">${inner}</span>`;
  const STAR = 'M0 -3Q.2 -.2 3 0Q.2 .2 0 3Q-.2 .2 -3 0Q-.2 -.2 0 -3Z'; // a four-pointed glint, long thin rays
  const star = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="${STAR}"/>`;

  /* ---------- 보석 ----------
     A round brilliant in the accent colour, seen a little from above. Its facets are worked out in 3D (table, star,
     kite and upper-girdle facets on the crown, a girdle band, mains and lower-girdle facets on the pavilion) and each
     is shaded by the light it catches. It turns slowly: the drawing is made at four angles a quarter of a facet apart
     (the shape repeats every 45 degrees), and each fades in over the one before, so the facets slide and flash. Now
     and then a glint flares on its crown and a few specks of coloured fire land round it; typing makes it jump and
     spin, striking sparks. */
  const GEM_PHASES = 4;
  const gem = (() => {
    const tilt = (13 * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt), y0 = 5.4;
    const P = ([x, y, z]) => `${n2(10 + x)},${n2(y0 - y * ct + z * st)}`;
    const ring = (r, y, deg) => { const a = (deg * Math.PI) / 180; return [r * Math.sin(a), y, r * Math.cos(a)]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const V = [0, st, ct]; // towards the eye
    const LIGHT = unit([-0.55, 0.85, 0.5]), HALF = unit([LIGHT[0] + V[0], LIGHT[1] + V[1], LIGHT[2] + V[2]]);
    const FIRE = unit([0.35, 0.9, -0.25]); // what the pavilion sends back up through the stone
    const rt = 4.1, R = 8.3, yG = -3.2, yG2 = -3.75, yC = -12.6, CEN = [0, -4, 0];
    const tone = (b) => (b > 0.9 ? 'gw' : b > 0.7 ? 'g1' : b > 0.52 ? 'g2' : b > 0.36 ? 'g3' : b > 0.22 ? 'g4' : 'g5');
    const facet = (pts, kind) => {
      let nrm = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
      if (dot(nrm, sub(c, CEN)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      if (dot(nrm, V) < 0.015) return ''; // faces away: a convex stone needs no sorting
      let b;
      if (kind === 'out') b = 0.16 + 0.5 * Math.max(0, dot(nrm, LIGHT)) + 0.95 * Math.pow(Math.max(0, dot(nrm, HALF)), 18);
      else { // light bounced back through the pavilion: a patchwork that changes as the stone turns
        const r = sub([0, 0, 0], sub(V, nrm.map((v) => v * 2 * dot(V, nrm))));
        b = 0.1 + 0.95 * Math.pow(Math.max(0, dot(unit(r), FIRE)), 2.4);
      }
      return `<polygon class="${tone(b)}" points="${pts.map(P).join(' ')}"/>`;
    };
    const phase = (th) => {
      let s = `<polygon class="g2" points="${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => P(ring(rt, 0, th + 45 * k))).join(' ')}"/>`; // the table
      for (let k = 0; k < 8; k++) {
        const a = th + 45 * k, m = a + 22.5, b = a + 45;
        const Ta = ring(rt, 0, a), Tb = ring(rt, 0, b), S = ring(rt + (R - rt) * 0.5, yG * 0.47, m), Sp = ring(rt + (R - rt) * 0.5, yG * 0.47, m - 45);
        const Ga = ring(R, yG, a), Gm = ring(R, yG, m), Gb = ring(R, yG, b);
        const ga = ring(R, yG2, a), gm = ring(R, yG2, m), gb = ring(R, yG2, b);
        const B = ring(3.1, yG2 + (yC - yG2) * (1 - 3.1 / R), m), Bp = ring(3.1, yG2 + (yC - yG2) * (1 - 3.1 / R), m - 45);
        s += facet([Ta, Tb, S], 'out') + facet([Ta, S, Ga, Sp], 'out') + facet([S, Gm, Ga], 'out') + facet([S, Gb, Gm], 'out');
        s += facet([Ga, Gm, gm, ga], 'out') + facet([Gm, Gb, gb, gm], 'out');
        s += facet([ga, gm, B], 'in') + facet([gm, gb, B], 'in') + facet([ga, B, [0, yC, 0], Bp], 'in');
      }
      return s;
    };
    let turn = '';
    for (let p = 0; p < GEM_PHASES; p++) turn += Q(`gm-face gm-p${p}`, phase((45 * p) / GEM_PHASES));
    const OUTLINE = `M${P(ring(rt, 0, -90))}A${rt} ${n2(rt * st)} 0 0 1 ${P(ring(rt, 0, 90))}L${P(ring(R, yG, 90))}L${P(ring(R, yG2, 90))}L${P([0, yC, 0])}L${P(ring(R, yG2, -90))}L${P(ring(R, yG, -90))}Z`;
    const fleck = (cls, x, y, r) => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
    return box('sq', 'cub-gm',
      G('gm-glow', '') +
      G('gm-hop', G('gm-bob', G('gm-spin', turn + Q('gm-rim', `<path d="${OUTLINE}"/>`)) +
        Q('gm-star gm-s1', star(14.3, 4.6, 0.95), 'transform-origin:71.5% 23%') +
        Q('gm-star gm-s2', star(3.2, 8.9, 0.7), 'transform-origin:16% 44.5%'))) +
      Q('gm-fire', fleck('f1', -3.4, 6.2, 0.95) + fleck('f2', 23.6, 4.4, 0.85) + fleck('f3', -2.2, 15.8, 0.8) + fleck('f4', 22.8, 14.6, 0.95) + fleck('f2', 9.4, -2.8, 0.7)) +
      Q('gm-pop gm-pop1', star(1.6, 2.6, 0.62), 'transform-origin:8% 13%') +
      Q('gm-pop gm-pop2', star(18.6, 15.8, 0.5), 'transform-origin:93% 79%') +
      Q('gm-pop gm-pop3', star(19.2, 3.4, 0.42), 'transform-origin:96% 17%'));
  })();

  /* ---------- 모래시계 ----------
     Glass bulbs between two wooden plates on turned posts. The sand in the top bulb sinks into a hollow and drains
     (faster as it runs low, as in a cone) through a thin stream of falling grains, and heaps up below. When it has
     run out the glass is lifted, turned over with a swing past upright, and set down with a bump; while it turns, the
     heap slides down to the neck, so the next round starts from a full top bulb. Typing rocks it on its base.
     The top bulb narrows like a cone towards the neck, so the sand in it shrinks about the neck and stays in the glass. */
  const GLASS = 'M5.5 4.1H14.5Q15.2 4.3 14.9 5.5Q13.5 11.8 10.75 18.6Q10.5 20 10.75 21.4Q13.5 28.2 14.9 34.5Q15.2 35.7 14.5 35.9H5.5Q4.8 35.7 5.1 34.5Q6.5 28.2 9.25 21.4Q9.5 20 9.25 18.6Q6.5 11.8 5.1 5.5Q4.8 4.3 5.5 4.1Z';
  const SAND_TOP = 'M6.1 7.7Q10 9.2 13.9 7.7L10.45 19.3Q10 20.3 9.55 19.3Z'; // the surface already hollowed by the drain
  const SAND_HANG = 'M6.1 32.3Q10 30.8 13.9 32.3L10.45 20.7Q10 19.7 9.55 20.7Z'; // the same, turned over: what the heap becomes as the glass turns
  const post = (x) => `<rect class="hg-post" x="${x - 0.55}" y="3.6" width="1.1" height="32.8" rx=".55" fill="url(#cub-hg-post)"/><ellipse class="hg-bead" cx="${x}" cy="8.6" rx=".95" ry=".7"/><ellipse class="hg-bead" cx="${x}" cy="20" rx="1" ry=".75"/><ellipse class="hg-bead" cx="${x}" cy="31.4" rx=".95" ry=".7"/>`;
  const grain = (d) => T('hg-grain', '<circle cx="10" cy="21.4" r=".42"/>', `animation-delay:${d}s`);
  const hourglass = box('tall', 'cub-hg', G('hg-nudge', G('hg-lift', G('hg-turn',
    T('hg-back', `<path class="hg-glass" d="${GLASS}"/><path class="hg-far" d="M13.5 6.2Q13 9 12.2 11M13.5 33.8Q13 31 12.2 29"/>`) +
    T('hg-top', `<path d="${SAND_TOP}" fill="url(#cub-hg-sand)"/><path class="hg-sandhi" d="M7.4 8.6Q10 9.5 12.6 8.6"/>`) +
    G('hg-flow', T('hg-stream', '<path d="M10 20.6V35.5"/>') + grain(0) + grain(-0.16) + grain(-0.32)) +
    T('hg-heap', '<path d="M5.3 35.6C6.5 33.2 8.2 30.9 10 30.2C11.8 30.9 13.5 33.2 14.7 35.6Z" fill="url(#cub-hg-sand)"/><path class="hg-sandhi" d="M8.5 31.8Q10 30.8 11.5 31.8"/>') +
    T('hg-hang', `<path d="${SAND_HANG}" fill="url(#cub-hg-sand)"/>`) +
    T('hg-front', `<path class="hg-shine" d="M6.3 5.9Q6.9 9.4 8.3 13M6.3 34.1Q6.9 30.6 8.3 27"/><path class="hg-shine2" d="M8.9 15.2L9.5 16.9M8.9 24.8L9.5 23.1"/>
      <path class="hg-rim" d="${GLASS}"/>
      ${post(3.7)}${post(16.3)}
      <rect class="hg-cap" x="2.2" y="1" width="15.6" height="3.2" rx="1.1" fill="url(#cub-hg-wood)"/><path class="hg-caphi" d="M3.2 1.7H16.8"/>
      <rect class="hg-cap" x="2.2" y="35.8" width="15.6" height="3.2" rx="1.1" fill="url(#cub-hg-wood)"/><path class="hg-caphi" d="M3.2 36.5H16.8"/>`)))));

  /* ---------- 미니 시계 ----------
     A little twin-bell alarm clock that shows the real time: hour and minute hands creep round, and the red second
     hand ticks, overshooting a hair and settling. On the minute its hammer taps a bell (ting); typing sets it ringing
     for a moment. The hands' delays are worked out from the clock each time the drawing is taken (CURSOR_ART.clock is
     a getter), and a timer puts them right again after the animation has been held still (unfocused, idle). */
  const ckTimes = () => {
    const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    return { s, m, h };
  };
  const bell = (x, rot) => `<g transform="translate(${x} 4.7) rotate(${rot})"><path class="ck-bell" d="M-2.7 1.1C-2.7 -1.1 -1.5 -2.6 0 -2.6S2.7 -1.1 2.7 1.1Z" fill="url(#cub-ck-bell)"/><rect class="ck-bellrim" x="-3" y=".8" width="6" height=".9" rx=".45"/><circle class="ck-knob" cy="-3" r=".62"/><path class="ck-bellhi" d="M-1.6 .2Q-1.5 -1.4 -.3 -2"/></g>`;
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180, big = i % 3 === 0, r1 = big ? 4.45 : 4.85, r2 = 5.35;
    ticks += `<path class="${big ? 'ck-tick' : 'ck-tick2'}" d="M${n2(10 + Math.sin(a) * r1)} ${n2(11 - Math.cos(a) * r1)}L${n2(10 + Math.sin(a) * r2)} ${n2(11 - Math.cos(a) * r2)}"/>`;
  }
  const clockArt = () => {
    const { s, m, h } = ckTimes();
    const dl = (v) => `animation-delay:${n2(-v)}s`;
    return box('sq', 'cub-ck',
      Q('ck-shadow', '<ellipse cx="10" cy="19.2" rx="5.6" ry=".75"/>') +
      G('ck-ring', `<span class="cl ck-amin" style="${dl(s)}">` +
        Q('ck-legs', '<path d="M6.3 16.3L4.7 19M13.7 16.3L15.3 19"/><circle cx="4.6" cy="19.1" r=".7"/><circle cx="15.4" cy="19.1" r=".7"/>') +
        Q('ck-bells', bell(4.5, -36) + bell(15.5, 36)) +
        G('ck-hamw', `<span class="cl ck-ham" style="${dl(s)}">${Q('ck-hamq', '<path class="ck-stem" d="M10 4.6V2.1"/><circle class="ck-head" cx="10" cy="1.75" r=".85"/>')}</span>`) +
        Q('ck-body', `<circle class="ck-case" cx="10" cy="11" r="7"/><circle cx="10" cy="11" r="7" fill="url(#cub-ck-caseshade)"/><circle class="ck-caseedge" cx="10" cy="11" r="7"/>
          <path class="ck-casehi" d="M4.8 8.2A5.9 5.9 0 0 1 8.4 4.9"/>
          <circle cx="10" cy="11" r="5.9" fill="url(#cub-ck-face)"/><circle class="ck-faceedge" cx="10" cy="11" r="5.9"/>${ticks}`) +
        `<span class="cl ck-h" style="${dl(h * 3600)}">${Q('ck-hand', '<path d="M9.2 11.6L9.5 8Q10 7.2 10.5 8L10.8 11.6Z"/>')}</span>` +
        `<span class="cl ck-m" style="${dl(m * 60)}">${Q('ck-hand', '<path d="M9.4 11.8L9.66 6.1Q10 5.4 10.34 6.1L10.6 11.8Z"/>')}</span>` +
        `<span class="cl ck-s" style="${dl(s)}"><span class="cl ck-settle" style="${dl(s % 1)}">${Q('ck-sec', '<path d="M10 13.2V5.6"/><circle cx="10" cy="12.8" r=".5"/>')}</span></span>` +
        Q('ck-cap', '<circle cx="10" cy="11" r=".85" fill="url(#cub-ck-brass)"/><circle class="ck-capdot" cx="10" cy="11" r=".28"/><path class="ck-glare" d="M5.6 10.2A4.6 4.6 0 0 1 8.6 6.7"/>') +
        '</span>' +
        Q('ck-waves', '<path d="M1.4 2.6Q.3 4.4 1.2 6.4M-.4 1.6Q-1.9 4.4 -.6 7.2M18.6 2.6Q19.7 4.4 18.8 6.4M20.4 1.6Q21.9 4.4 20.6 7.2"/>')));
  };
  // put the hands right after they were held still (unfocused, idle) or the markup was made a while before use;
  // a clock that is being held still is left alone (an idle app does nothing) and is put right within 4 s of waking
  const CK_ANIMS = { cubCkHour: (t) => t.h * 3600, cubCkMin: (t) => t.m * 60, cubCkSec: (t) => t.s, cubCkSettle: (t) => t.s % 1, cubCkTing: (t) => t.s, cubCkJolt: (t) => t.s };
  const syncClocks = () => {
    const els = document.querySelectorAll('.cub-ck');
    if (!els.length) return;
    const t = ckTimes(), idle = document.body.classList.contains('idle');
    for (const el of els) {
      if (el.closest('.mt-cursor.blurred') || (idle && el.closest('#stage'))) continue;
      for (const a of el.getAnimations({ subtree: true })) {
        const f = CK_ANIMS[a.animationName];
        if (!f) continue;
        const want = f(t) * 1000 + (a.effect.getTiming().delay || 0); // local time = active time + delay (the delay is negative)
        if (Math.abs((a.currentTime || 0) - want) > 250) a.currentTime = want;
      }
    }
  };
  setInterval(syncClocks, 4000);
  window.addEventListener('focus', () => setTimeout(syncClocks, 50));

  /* ---------- 행성 ----------
     A banded gas giant with a ring (the far half behind the ball, the near half in front of it, a gap between the
     bands). A storm turns across its face along a band, foreshortened at the limbs; the ring rocks slowly and the
     planet floats. A small moon goes round it on a wide, tilted orbit out over the neighbouring characters: large and
     bright as it passes in front, smaller and dimmer behind. Typing knocks the planet askew and it springs back. */
  const RING_BACK = 'M.7 10.4A9.3 2.55 0 0 1 19.3 10.4', RING_FRONT = 'M19.3 10.4A9.3 2.55 0 0 1 .7 10.4';
  const RIN_BACK = 'M2.6 10.4A7.4 1.95 0 0 1 17.4 10.4', RIN_FRONT = 'M17.4 10.4A7.4 1.95 0 0 1 2.6 10.4';
  const band = (cls, y, w) => `<path class="pl-band ${cls}" d="M3 ${y}Q10 ${n2(y + 1.3)} 17 ${y}" style="stroke-width:${w}"/>`;
  const moon = (where) => `<span class="cub-reach pl-orbit pl-${where}"><span class="pl-mx"><span class="pl-my"><span class="pl-moonw">${W('pl-moon', '0 0 10 10',
    '<circle cx="5" cy="5" r="4.6" fill="url(#cub-pl-moon)"/><circle cx="5" cy="5" r="4.6" fill="url(#cub-pl-moonshade)"/><circle class="pl-crater" cx="3.6" cy="4" r=".9"/><circle class="pl-crater" cx="6" cy="6.3" r=".6"/><circle class="pl-moonedge" cx="5" cy="5" r="4.6"/>')}</span></span></span></span>`;
  function W(cls, vb, body) { return `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`; }
  const planet = moon('behind') + box('sq', 'cub-pl', G('pl-wob', G('pl-bob',
    G('pl-tilt', Q('pl-back', `<path class="pl-ring pl-outer" d="${RING_BACK}"/><path class="pl-ring pl-inner" d="${RIN_BACK}"/>`)) +
    G('pl-tilt', Q('pl-ball', `<circle cx="10" cy="10.4" r="5.3" fill="url(#cub-pl-base)"/>
      <g clip-path="url(#cub-pl-clip)">${band('b1', 6.4, 0.9)}${band('b2', 8.2, 1.3)}${band('b3', 9.9, 0.7)}${band('b4', 11.6, 1.5)}${band('b5', 13.6, 0.9)}${band('b6', 15.2, 1.2)}</g>`) +
      Q('pl-storm', '<ellipse class="pl-st1" cx="10" cy="12.4" rx="1.35" ry=".72"/><ellipse class="pl-st2" cx="10.15" cy="12.32" rx=".6" ry=".3"/>') +
      Q('pl-storm pl-sb', '<ellipse class="pl-st3" cx="10" cy="8.6" rx=".95" ry=".42"/>')) +
    Q('pl-shade', '<circle cx="10" cy="10.4" r="5.3" fill="url(#cub-pl-shade)"/><path class="pl-atmo" d="M5.5 8.2A4.9 4.9 0 0 1 9.1 5.3"/><circle class="pl-edge" cx="10" cy="10.4" r="5.3"/>') +
    G('pl-tilt', Q('pl-front', `<path class="pl-ring pl-outer" d="${RING_FRONT}"/><path class="pl-ring pl-inner" d="${RIN_FRONT}"/><path class="pl-ringhi" d="M16.4 11.9Q13.6 12.9 10 13"/>`))))) + moon('front');

  /* ---------- 눈알 ----------
     An almond eye with lashes and an accent-coloured iris. It darts its glance about and holds it (two rhythms that
     do not line up, so it never quite repeats), its pupil widens and narrows, it blinks (sometimes twice), and now and
     then narrows its eyes suspiciously. The lid comes down and curls into a closed-eye arc. Typing makes it open wide,
     the pupil tightens and it looks down at what was just typed, then drifts back. */
  const ALMOND = 'M1.6 10.4C4.6 4.9 15.4 4.9 18.4 10.4C15.4 15.5 4.6 15.5 1.6 10.4Z';
  let fibres = '';
  for (let i = 0; i < 18; i++) {
    const a = (i * 20 * Math.PI) / 180, r1 = 1.95, r2 = i % 2 ? 2.9 : 3.15;
    fibres += `M${n2(10 + Math.cos(a) * r1)} ${n2(10.4 + Math.sin(a) * r1)}L${n2(10 + Math.cos(a) * r2)} ${n2(10.4 + Math.sin(a) * r2)}`;
  }
  const eye = box('sq', 'cub-ey',
    G('ey-wide', G('ey-sq', G('ey-bl', Q('ey-ball', `<path d="${ALMOND}" fill="url(#cub-ey-white)"/><path d="${ALMOND}" fill="url(#cub-ey-lidshade)"/>`) +
      G('ey-follow', G('ey-gx', G('ey-gy',
        Q('ey-iris', `<circle class="ey-irisbase" cx="10" cy="10.4" r="3.45"/><circle cx="10" cy="10.4" r="3.45" fill="url(#cub-ey-irisshade)"/><path class="ey-fibre" d="${fibres}"/><circle class="ey-limbus" cx="10" cy="10.4" r="3.45"/>`) +
        Q('ey-pupil', '<circle cx="10" cy="10.4" r="1.55"/>') +
        Q('ey-glint', '<ellipse cx="11.35" cy="9.05" rx=".8" ry=".68"/><circle cx="8.75" cy="11.85" r=".36"/>'))))))) +
    G('ey-lowsq', G('ey-lowbl', Q('ey-lower', '<path d="M2.4 10.9C5.4 15.3 14.6 15.3 17.6 10.9"/>'))) +
    G('ey-lidwide', G('ey-lidsq', G('ey-lidbl', Q('ey-lid', `<path class="ey-crease" d="M3.4 7.9C6.4 3.4 13.6 3.4 16.6 7.9"/>
      <path class="ey-line" d="M1.6 10.4C4.6 4.9 15.4 4.9 18.4 10.4"/>
      <path class="ey-lash" d="M4.2 7.4L3 5.9M6.4 6.1L5.7 4.4M13.6 6.1L14.3 4.4M15.8 7.4L17 5.9"/>`)))));

  const art = window.CURSOR_ART = window.CURSOR_ART || {};
  Object.assign(art, { gem, hourglass, planet, eye });
  Object.defineProperty(art, 'clock', { get: clockArt, enumerable: true, configurable: true });

  const v = (name, o) => `style="stop-color:var(${name})${o == null ? '' : `;stop-opacity:${o}`}"`;
  const DEFS = `
    <linearGradient id="cub-hg-sand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--cub-hg-s1')}/><stop offset=".42" ${v('--cub-hg-s2')}/><stop offset="1" ${v('--cub-hg-s3')}/></linearGradient>
    <linearGradient id="cub-hg-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d49a5e"/><stop offset=".45" stop-color="#9a6131"/><stop offset="1" stop-color="#5a3517"/></linearGradient>
    <linearGradient id="cub-hg-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4220"/><stop offset=".45" stop-color="#c88e55"/><stop offset="1" stop-color="#5a3517"/></linearGradient>
    <radialGradient id="cub-ck-caseshade" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
    <radialGradient id="cub-ck-face" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#fffdf6"/><stop offset=".75" stop-color="#f4eedf"/><stop offset="1" stop-color="#d9cfb8"/></radialGradient>
    <radialGradient id="cub-ck-bell" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff7d6"/><stop offset=".45" stop-color="#e6bd5c"/><stop offset="1" stop-color="#8a5e14"/></radialGradient>
    <radialGradient id="cub-ck-brass" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff4c4"/><stop offset=".5" stop-color="#d9a640"/><stop offset="1" stop-color="#7f5212"/></radialGradient>
    <radialGradient id="cub-pl-base" cx=".42" cy=".36" r=".72"><stop offset="0" stop-color="#fbe6c2"/><stop offset=".6" stop-color="#e5b884"/><stop offset="1" stop-color="#c08850"/></radialGradient>
    <radialGradient id="cub-pl-shade" cx=".34" cy=".3" r=".82"><stop offset=".42" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#140800" stop-opacity=".42"/><stop offset="1" stop-color="#140800" stop-opacity=".72"/></radialGradient>
    <radialGradient id="cub-pl-moon" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d8dde8"/><stop offset="1" stop-color="#9aa3b5"/></radialGradient>
    <radialGradient id="cub-pl-moonshade" cx=".3" cy=".28" r=".9"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b1020" stop-opacity=".6"/></radialGradient>
    <clipPath id="cub-pl-clip"><circle cx="10" cy="10.4" r="5.3"/></clipPath>
    <radialGradient id="cub-ey-white" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f6f4fa"/><stop offset="1" ${v('--cub-ey-corner')}/></radialGradient>
    <linearGradient id="cub-ey-lidshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d3a" stop-opacity=".42"/><stop offset=".38" stop-color="#2a1d3a" stop-opacity="0"/></linearGradient>
    <radialGradient id="cub-ey-irisshade" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`;
  const mount = () => {
    if (document.getElementById('cub-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="cub-defs" class="ca-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
