'use strict';
/*
 * Upgraded cursors, group c: 로켓 · 운석 · 혜성 · 마법봉 · 광선검 · 위성, redrawn in layers like fx/cursor-art.js.
 * Styles and animations in fx/cursor-up-c.css.
 *
 * Each drawing is a 20 x 40 box (.cuc-box) fitted to the caret cell, a little larger than it. Every moving part is its
 * own layer (.cuc-l: an <svg>, or a <span> grouping some) and only transform and opacity are animated; the gradients
 * are defined once in a hidden <svg> (#cuc-defs). Parts that reach out over the terminal (a meteor's sparks, the
 * satellite's orbit, the rocket's smoke, the wand's sparkle spray) are .cuc-reach: faint, gone when the terminal loses
 * focus and left out of the composer. The comet's tail is its shape, so it stays (dimmed, and shorter in the composer).
 *
 * They react to typing in two ways: .moving (on the cursor for about a quarter of a second after the caret moves) for
 * a state that lasts while you type (the rocket lifts, the tail stretches), and a "kick" on each move (below) for
 * something that happens once per key: the saber flares, the wand sheds sparkles, the satellite pings.
 */
(function () {
  const n2 = (v) => +v.toFixed(2);
  const SV = (cls, vb, body, style, par) => `<svg class="cuc-l ${cls}" viewBox="${vb}"${par ? ` preserveAspectRatio="${par}"` : ''} aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const L = (cls, body, style) => SV(cls, '0 0 20 40', body, style);
  const G = (cls, inner, style) => `<span class="cuc-l ${cls}"${style ? ` style="${style}"` : ''}>${inner}</span>`;
  const box = (cls, inner) => `<span class="cuc-box ${cls}">${inner}</span>`;
  const at = (x, y) => `transform-origin:${n2(x * 5)}% ${n2(y * 2.5)}%`; // a point of the 20 x 40 drawing as a transform origin
  const RAY = (s) => { const q = n2(s * 0.06); return `M0 ${-s}L${q} ${-q}L${s} 0L${q} ${q}L0 ${s}L${-q} ${q}L${-s} 0L${-q} ${-q}Z`; }; // a thin four-ray glint
  const TW = (s) => { const q = n2(s * 0.16); return `M0 ${-s}Q${q} ${-q} ${s} 0Q${q} ${q} 0 ${s}Q${-q} ${q} ${-s} 0Q${-q} ${-q} 0 ${-s}Z`; }; // a four-point twinkle

  /* 광선검: a blade of light standing on a short hilt (emitter collar, glowing guard ring, ridged grip, pommel). The
     blade hums (its glow breathes unevenly) and a pulse of light runs up it now and then; every key makes it flare, and
     typing swings it back a little on its hilt. The blade takes the accent colour. */
  const SBX = 3.6; // the blade's centre line: near the cell's left edge, where a bar caret stands
  const saber = box('cuc-sb', G('sb-swing',
    L('sb-glow', `<rect x="${n2(SBX - 9)}" y="-4.4" width="18" height="34.6" rx="9" fill="url(#cuc-sb-glow)"/>`) +
    L('sb-flare cuc-kick', `<rect x="${n2(SBX - 9.5)}" y="-6" width="19" height="37" rx="9.5" fill="url(#cuc-sb-glow)"/><rect x="${n2(SBX - 2.6)}" y="-.4" width="5.2" height="30" rx="2.6" fill="url(#cuc-sb-hot)"/>`) +
    L('sb-blade', `<rect x="${n2(SBX - 2.3)}" y=".3" width="4.6" height="29.2" rx="2.3" fill="url(#cuc-sb-blade)"/><rect class="sb-core" x="${n2(SBX - 1.15)}" y="1.1" width="2.3" height="28" rx="1.15"/>`) +
    L('sb-pulse', `<ellipse cx="${SBX}" cy="26" rx="1.9" ry="3.4" fill="url(#cuc-sb-pulse)"/>`) +
    L('sb-hilt', `<path d="M1.2 28.6H6L5.6 30.5H1.6Z" fill="url(#cuc-metal)"/>
      <rect class="sb-slot" x="1.55" y="28.95" width="4.1" height=".42"/>
      <rect x="1.75" y="30.4" width="3.7" height="1.05" fill="url(#cuc-metal)"/>
      <rect class="sb-ring" x="1.5" y="31.4" width="4.2" height=".8"/>
      <rect x="1.75" y="32.15" width="3.7" height="5.6" rx=".35" fill="url(#cuc-sb-grip)"/>
      <path class="sb-ridge" d="M2 33.3H5.2M2 34.5H5.2M2 35.7H5.2M2 36.9H5.2"/>
      <rect class="sb-stud" x="5.25" y="32.7" width="1.1" height="1.75" rx=".45"/>
      <path d="M1.55 37.65H5.65V39.1Q5.65 40.4 3.6 40.4Q1.55 40.4 1.55 39.1Z" fill="url(#cuc-metal)"/>
      <path class="sb-edge" d="M1.2 28.6H6L5.6 30.5H5.45V37.65H5.65V39.1Q5.65 40.4 3.6 40.4Q1.55 40.4 1.55 39.1V37.65H1.75V30.5H1.6Z"/>`)));

  /* 혜성: a comet's head (a white nucleus in a glowing coma, a glint crossing it) with its tail streaming back the way
     the caret came: a broad pale dust tail and fine ion streamers in the accent colour, flickering, specks of dust
     drifting off down it. Typing stretches the tail; when the typing stops it draws back in. The tail is drawn pointing
     left and turned by --cuc-cm-a (set on each move, and eased back to rest when the caret stops; see the end of this file). */
  const CT = (cls, body, style) => SV(cls, '0 0 100 30', body, style, 'none'); // the tail: 6 cells long, the head at x = 100
  const mote = (y, d, t) => CT('cm-mote', `<circle cx="97" cy="${y}" r="1.5"/>`, `animation-delay:${d}s;animation-duration:${t}s`);
  const comet = `<span class="cm-dir"><span class="cm-tail">` +
      CT('cm-dust', '<path d="M100 8.8C80 9.6 58 11.6 38 14C24 15.5 12 16.5 0 17.2C12 17.5 24 17.9 38 18.5C58 19.4 80 20.4 100 21.2Z" fill="url(#cuc-cm-dust)"/>') +
      CT('cm-ion cm-i1', '<path d="M100 15H2" stroke="url(#cuc-cm-ion)"/>') +
      CT('cm-ion cm-i2', '<path d="M100 13.2L14 10.6" stroke="url(#cuc-cm-ion)"/>') +
      CT('cm-ion cm-i3', '<path d="M100 16.8L26 19.8" stroke="url(#cuc-cm-ion)"/>') +
      `<span class="cuc-l cuc-reach">${mote(14.4, 0, 1.9) + mote(16.2, -0.7, 2.3) + mote(15, -1.5, 1.7)}</span>` +
    '</span></span>' +
    box('cuc-cm',
      L('cm-coma', '<circle cx="10" cy="20" r="13" fill="url(#cuc-cm-coma)"/>') +
      L('cm-head', '<circle cx="10" cy="20" r="7.6" fill="url(#cuc-cm-halo)"/><circle cx="10" cy="20" r="4.6" fill="url(#cuc-cm-nuc)"/><circle class="cm-rim" cx="10" cy="20" r="4.6"/><circle class="cm-hi" cx="8.7" cy="18.6" r="1.35"/>') +
      L('cm-glint', `<path transform="translate(10 20)" d="${RAY(8.6)}"/>`, at(10, 20)));

  /* 운석: a lump of rock tumbling slowly inside its own fire: the leading side white-hot, a sheath of flame wrapped
     round it and streaming back up-left in layers (red, orange, a yellow-white heart) over a thread of smoke, sparks
     peeling off down the tail. Typing fans the fire (the tail grows and brightens) and each key throws off a spray of
     sparks. */
  const MX = 10, MY = 23; // the rock's centre
  const lump = [5.9, 4.8, 6.3, 5.0, 5.8, 4.6, 6.1, 5.3, 6.2, 4.9];
  const rp = lump.map((r, i) => { const a = (i * 36 + 8) * Math.PI / 180; return [MX + Math.cos(a) * r, MY + Math.sin(a) * r]; });
  const mid = (a, b) => `${n2((a[0] + b[0]) / 2)} ${n2((a[1] + b[1]) / 2)}`;
  const ROCK = `M${mid(rp[9], rp[0])}` + rp.map((p, i) => `Q${n2(p[0])} ${n2(p[1])} ${mid(p, rp[(i + 1) % 10])}`).join('') + 'Z';
  const crater = (dx, dy, r) => `<circle class="mt-pit" cx="${n2(MX + dx)}" cy="${n2(MY + dy)}" r="${r}"/><path class="mt-pitlit" d="M${n2(MX + dx - r * 0.7)} ${n2(MY + dy + r * 0.72)}A${r} ${r} 0 0 0 ${n2(MX + dx + r * 0.95)} ${n2(MY + dy - r * 0.3)}"/>`;
  const MT = (cls, body, style) => SV(cls, '0 0 100 24', body, style, 'none'); // the tail: the head at x = 100, y = 12
  const SPARK = 'M0 -1.9L1.5 0L0 1.9L-1.5 0Z';
  const ember = (x, y, dx, dy, d, t, cls = 'mt-spark') => MT(cls, `<path transform="translate(${x} ${y})" d="${SPARK}"/>`, `--dx:${dx}%;--dy:${dy}%;animation-delay:${d}s;animation-duration:${t}s`);
  const meteor = box('cuc-mt',
    `<span class="mt-tw"><span class="mt-tail">` +
      MT('mt-smoke', '<path d="M90 7.4C72 7 52 8.4 32 10C18 11 6 11.8 -10 12.3C6 13.2 18 14 32 15C52 16.4 72 17.4 90 16.8Z" fill="url(#cuc-mt-smoke)"/>') +
      G('mt-fire',
        MT('mt-f1', '<path d="M100 3.6C92 3.4 82 5.2 68 7.6C52 10 30 11.2 2 12C30 12.8 52 14 68 16.4C82 18.8 92 20.6 100 20.4A8.4 8.4 0 0 0 100 3.6Z" fill="url(#cuc-mt-f1)"/>') +
        MT('mt-f2', '<path d="M100 5.6C93 5.6 85 7.1 74 8.9C62 10.7 48 11.5 28 12C48 12.5 62 13.3 74 15.1C85 16.9 93 18.4 100 18.4A6.4 6.4 0 0 0 100 5.6Z" fill="url(#cuc-mt-f2)"/>') +
        MT('mt-f3', '<path d="M100 7.8C95 7.8 89 8.9 82 10.1C75 11.2 68 11.7 56 12C68 12.3 75 12.8 82 13.9C89 15.1 95 16.2 100 16.2A4.2 4.2 0 0 0 100 7.8Z" fill="url(#cuc-mt-f3)"/>')) +
      `<span class="cuc-l cuc-reach">${ember(90, 9.5, -46, -14, 0, 1.25) + ember(88, 14.5, -40, 18, -0.45, 1.05) + ember(92, 12, -58, 4, -0.85, 1.45)}</span>` +
      [0, 1].map((g) => `<span class="cuc-l cuc-reach mt-burst cuc-kick">${ember(97, 9 + g, -62, -34 - g * 8, 0, 0.6, 'mt-bs') + ember(97, 14 - g, -70, 30 + g * 6, 0, 0.6, 'mt-bs') + ember(99, 12, -84, -6 + g * 12, 0, 0.6, 'mt-bs')}</span>`).join('') +
    '</span></span>' +
    L('mt-glow', `<circle cx="${MX}" cy="${MY}" r="11" fill="url(#cuc-mt-glow)"/>`) +
    L('mt-rock', `<path d="${ROCK}" fill="url(#cuc-mt-rock)"/>${crater(-1.9, -1.5, 1.45)}${crater(2.1, 1.3, 1.05)}${crater(-0.5, 2.7, 0.75)}${crater(2.4, -2.5, 0.6)}<path class="mt-edge" d="${ROCK}"/>`, at(MX, MY)) +
    L('mt-heat', `<circle cx="${MX}" cy="${MY}" r="7.4" fill="url(#cuc-mt-heat)"/>`));

  /* 로켓: a little rocket on the pad in the accent colour (nose, fins, a band), porthole and all. Idling, its exhaust
     flickers, sputters now and then and puffs smoke along the ground. Typing opens the throttle: it lifts off the line
     and rumbles, the flame roars out (shock diamonds in it) and the smoke billows; each key gives a kick of thrust.
     When the typing stops it settles back down. */
  const FIN = 'M5.9 18.2L2.4 23.6Q1.5 25.1 1.7 27.8L5.9 25.9Z';
  const HULL = 'M10 1.2C12.5 3.1 13.9 6.4 14.1 10.2V25.2Q14.1 26.8 12.6 26.8H7.4Q5.9 26.8 5.9 25.2V10.2C6.1 6.4 7.5 3.1 10 1.2Z';
  const puff = (dx, d, r) => L('rk-puff', `<circle cx="10" cy="38.6" r="${r}" fill="url(#cuc-rk-puff)"/>`, `--dx:${dx}%;animation-delay:${d}s`);
  const rocket = box('cuc-rk',
    `<span class="cuc-l cuc-reach rk-smoke">${puff(-62, 0, 3.2) + puff(58, -0.45, 3) + puff(-34, -0.9, 2.6) + puff(36, -1.35, 3)}</span>` +
    G('rk-lift', G('rk-shake',
      G('rk-flamew', G('rk-thrust cuc-kick', G('rk-sput',
        L('rk-fo', '<path d="M6.7 29.2H13.3C13.5 32.6 12.1 36 10 40.4C7.9 36 6.5 32.6 6.7 29.2Z" fill="url(#cuc-rk-fo)"/>') +
        L('rk-fi', '<path d="M8.2 29.2H11.8C11.9 31.6 11.2 33.8 10 36.4C8.8 33.8 8.1 31.6 8.2 29.2Z" fill="url(#cuc-rk-fi)"/>') +
        L('rk-dia', '<path d="M10 30.6L10.8 32L10 33.4L9.2 32ZM10 34.2L10.55 35.2L10 36.2L9.45 35.2Z"/>')))) +
      L('rk-body', `<path class="rk-fin" d="${FIN}" fill="url(#cuc-rk-acc)"/><path class="rk-fin" d="M14.1 18.2L17.6 23.6Q18.5 25.1 18.3 27.8L14.1 25.9Z" fill="url(#cuc-rk-acc)"/>
        <path d="M7.4 26.6H12.6L13.5 29.4H6.5Z" fill="url(#cuc-rk-noz)"/>
        <path d="${HULL}" fill="url(#cuc-rk-hull)"/>
        <path d="M10 1.2C12.5 3.1 13.9 6.4 14.1 10.2H5.9C6.1 6.4 7.5 3.1 10 1.2Z" fill="url(#cuc-rk-acc)"/>
        <path d="M10 1.2C10.9 1.9 11.6 2.8 12.1 3.8H7.9C8.4 2.8 9.1 1.9 10 1.2Z" fill="url(#cuc-metal)"/>
        <path class="rk-seam" d="M5.9 10.2H14.1"/>
        <rect x="5.9" y="21.5" width="8.2" height="1.35" fill="url(#cuc-rk-acc)"/>
        <path class="rk-rivet" d="M7.1 19.4h.01M12.9 19.4h.01M7.1 24.8h.01M12.9 24.8h.01"/>
        <circle class="rk-rim" cx="10" cy="15" r="2.6"/><circle cx="10" cy="15" r="1.85" fill="url(#cuc-rk-glass)"/><circle class="rk-glint" cx="9.3" cy="14.3" r=".55"/>
        <path d="M9.35 22.9H10.65L10.9 28.6H9.1Z" fill="url(#cuc-rk-acc)"/>
        <path class="rk-edge" d="${HULL}"/>`))));

  /* 마법봉: a pearl wand bound with an accent ribbon, a faceted gold star on its tip. The star rocks and twinkles in a
     soft glow and lets fall a few sparkles; typing flicks the wand, and every key shakes a little spray of sparkles off
     the star. */
  const SC = [5, 8.4], SR = 6.4, Sr = 2.7; // the star on the upright wand (the wand is tilted as a whole)
  const sp = (deg, r) => `${n2(SC[0] + Math.sin(deg * Math.PI / 180) * r)} ${n2(SC[1] - Math.cos(deg * Math.PI / 180) * r)}`;
  let facets = '', starEdge = '';
  for (let k = 0; k < 5; k++) {
    const a = k * 72;
    facets += `<path class="wd-fl" d="M${SC.join(' ')}L${sp(a - 36, Sr)}L${sp(a, SR)}Z"/><path class="wd-fd" d="M${SC.join(' ')}L${sp(a, SR)}L${sp(a + 36, Sr)}Z"/>`;
    starEdge += `${k ? 'L' : 'M'}${sp(a, SR)}L${sp(a + 36, Sr)}`;
  }
  const TIP = [11.5, 9.1]; // where the star is once the wand is tilted: sparkles leave from here
  const glitter = (cls, c, s, style) => L(cls, `<path class="wd-c${c}" transform="translate(${TIP[0]} ${TIP[1]}) scale(${s})" d="${TW(2)}"/>`, `${at(TIP[0], TIP[1])};${style}`);
  const wand = box('cuc-wd',
    G('wd-tilt',
      L('wd-rod', `<path d="M4.1 13.6H5.9L6.1 31.2H3.9Z" fill="url(#cuc-wd-rod)"/>
        <g clip-path="url(#cuc-wd-rodclip)"><path class="wd-rib" d="M3 16.2L7 14.4M3 19.6L7 17.8M3 23L7 21.2M3 26.4L7 24.6M3 29.8L7 28"/></g>
        <path class="wd-line" d="M4.1 13.6H5.9L6.1 31.2H3.9Z"/>
        <rect x="3.55" y="30.7" width="2.9" height="7.4" rx=".8" fill="url(#cuc-wd-grip)"/>
        <path class="wd-band" d="M3.55 31.6H6.45M3.55 37.2H6.45"/>
        <circle cx="5" cy="39" r="1.2" fill="url(#cuc-wd-gem)"/>
        <path d="M3.7 12.5H6.3L6 14.2H4Z" fill="url(#cuc-gold)"/>`) +
      G('wd-starw',
        L('wd-glow', `<circle cx="${SC[0]}" cy="${SC[1]}" r="9.6" fill="url(#cuc-wd-glow)"/>`) +
        L('wd-star', `${facets}<path class="wd-edge" d="${starEdge}Z"/><circle class="wd-hi" cx="4.3" cy="7.3" r=".85"/>`) +
        L('wd-tw', `<path transform="translate(2.2 3.6)" d="${TW(3)}"/>`, at(2.2, 3.6)), at(SC[0], SC[1])), at(5, 39.5)) +
    glitter('wd-fall', 1, 1, '--dx:-14%;animation-delay:0s;animation-duration:2.6s') +
    glitter('wd-fall', 2, 0.85, '--dx:22%;animation-delay:-.9s;animation-duration:3.1s') +
    glitter('wd-fall', 3, 0.8, '--dx:4%;animation-delay:-1.8s;animation-duration:2.8s') +
    [[[-70, -26, 1], [64, -40, 2], [30, 34, 3]], [[-56, 30, 2], [78, 6, 3], [-20, -48, 1]], [[60, 40, 1], [-80, 4, 3], [24, -52, 2]]].map((g) =>
      `<span class="cuc-l cuc-reach wd-burst cuc-kick">${g.map(([bx, by, c]) => glitter('wd-bs', c, 1.15, `--bx:${bx}%;--by:${by}%`)).join('')}</span>`).join(''));

  /* 위성: a small satellite (gold-foil body, blue solar wings, a blinking beacon) on a tilted orbit round the caret bar.
     Its orbit is laid faintly over the line, a fading trail follows it, it shrinks and dims as it goes behind the bar and
     catches the light as it comes round in front. Typing rocks the orbit; each key sends a ping out along it.
     The ellipse is a circle squashed flat: the trail turns inside the squash; the satellite itself is moved by two
     eased back-and-forth slides (x and y, a quarter of a turn apart), so it is not squashed. */
  const OBX = 3.6; // the bar, where the orbit is centred
  const OP = (cls, body, style) => SV(cls, '-100 -100 200 200', body, style); // the orbital plane, the bar at its centre
  let trail = '';
  for (let i = 0, n = 10; i < n; i++) { // an arc behind the satellite, fading out over 110 degrees
    const a0 = (-110 + i * 11) * Math.PI / 180, a1 = (-110 + (i + 1) * 11) * Math.PI / 180;
    trail += `<path d="M${n2(Math.cos(a0) * 96)} ${n2(Math.sin(a0) * 96)}A96 96 0 0 1 ${n2(Math.cos(a1) * 96)} ${n2(Math.sin(a1) * 96)}" stroke-opacity="${n2(((i + 1) / n) ** 1.7)}"/>`;
  }
  const BAR = `<rect x="${n2(OBX - 1.6)}" y="3" width="3.2" height="34" rx="1.6" fill="url(#cuc-ob-bar)"/>`;
  const orbit = box('cuc-ob',
    L('ob-bar', `<rect x="${n2(OBX - 3.2)}" y="1.6" width="6.4" height="36.8" rx="3.2" fill="url(#cuc-ob-glow)"/>${BAR}`) +
    `<span class="ob-plane">` +
      OP('cuc-reach ob-path', '<path class="ob-back" d="M-96 0A96 28.8 0 0 1 96 0"/><path class="ob-front" d="M96 0A96 28.8 0 0 1 -96 0"/>') +
      [0, 1].map(() => OP('cuc-reach ob-ping cuc-kick', '<ellipse rx="96" ry="28.8"/>')).join('') +
      G('cuc-reach ob-sq', OP('ob-spin', `<g class="ob-trail">${trail}</g>`)) +
      G('ob-x', G('ob-y', G('ob-d',
        OP('ob-halo', '<circle r="42" fill="url(#cuc-ob-halo)"/>') + OP('ob-sat', `<g transform="scale(1.6)"><path class="ob-strut" d="M-9 0H9"/>
          <rect x="-22" y="-4.6" width="13.4" height="9.2" rx=".9" fill="url(#cuc-ob-panel)"/><rect x="8.6" y="-4.6" width="13.4" height="9.2" rx=".9" fill="url(#cuc-ob-panel)"/>
          <path class="ob-grid" d="M-17.5 -4.6V4.6M-13 -4.6V4.6M-22 0H-8.6M13.1 -4.6V4.6M17.6 -4.6V4.6M8.6 0H22"/>
          <path class="ob-edge" d="M-22 -4.6H-8.6V4.6H-22ZM8.6 -4.6H22V4.6H8.6Z"/>
          <path class="ob-mast" d="M0 -6V-12.4"/><path d="M-4 -6.2Q0 -11.2 4 -6.2Z" fill="url(#cuc-metal)"/>
          <rect x="-5.4" y="-6" width="10.8" height="12" rx="1.3" fill="url(#cuc-gold)"/>
          <path class="ob-foil" d="M-3.6 -3.6L-.6 -1.4L-2.4 2.2M1.4 -4.2L3.4 .4L1 3.6"/>
          <path class="ob-edge" d="M-5.4 -4.7Q-5.4 -6 -4.1 -6H4.1Q5.4 -6 5.4 -4.7V4.7Q5.4 6 4.1 6H-4.1Q-5.4 6 -5.4 4.7Z"/></g>`) +
        OP('ob-blink', '<circle cx="0" cy="-21.4" r="3"/>') +
        OP('ob-glint', `<path transform="translate(-24 -2)" d="${TW(13)}"/><path transform="translate(24 2) scale(.7)" d="${TW(13)}"/>`)))) +
    '</span>' +
    L('ob-over', BAR)); // the bar again, shown while the satellite is behind it

  Object.assign(window.CURSOR_ART = window.CURSOR_ART || {}, { saber, comet, meteor, rocket, wand, orbit });

  /* Gradients, shared by every copy of these cursors (terminal, picker previews, composer). The accent is --violet. */
  const v = (c, o) => `style="stop-color:${c}${o == null ? '' : `;stop-opacity:${o}`}"`;
  const lin = (id, stops, a = 'x1="0" y1="0" x2="1" y2="0"') => `<linearGradient id="${id}" ${a}>${stops.map(([o, c, op]) => `<stop offset="${o}" ${v(c, op)}/>`).join('')}</linearGradient>`;
  const rad = (id, stops, a = 'cx=".5" cy=".5" r=".5"') => `<radialGradient id="${id}" ${a}>${stops.map(([o, c, op]) => `<stop offset="${o}" ${v(c, op)}/>`).join('')}</radialGradient>`;
  const DEFS =
    lin('cuc-metal', [[0, '#5d626d'], [0.32, '#eef0f4'], [0.6, '#aab0bb'], [1, '#474b55']]) +
    lin('cuc-gold', [[0, '#9a6510'], [0.3, '#ffe9a6'], [0.6, '#f0b93a'], [1, '#8a5608']]) +
    lin('cuc-sb-glow', [[0, 'var(--cuc-sb-c)', 0], [0.12, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .05)'], [0.25, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .2)'], [0.37, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .48)'], [0.5, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .6)'], [0.63, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .48)'], [0.75, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .2)'], [0.88, 'var(--cuc-sb-c)', 'calc(var(--cuc-sb-glow-o) * .05)'], [1, 'var(--cuc-sb-c)', 0]]) +
    lin('cuc-sb-blade', [[0, 'var(--cuc-sb-c)', 0.15], [0.2, 'var(--cuc-sb-c)', 0.95], [0.42, 'var(--cuc-sb-in)'], [0.58, 'var(--cuc-sb-in)'], [0.8, 'var(--cuc-sb-c)', 0.95], [1, 'var(--cuc-sb-c)', 0.15]]) +
    lin('cuc-sb-hot', [[0, 'var(--cuc-sb-in)', 0], [0.3, 'var(--cuc-sb-in)', 0.8], [0.5, '#fff'], [0.7, 'var(--cuc-sb-in)', 0.8], [1, 'var(--cuc-sb-in)', 0]]) +
    rad('cuc-sb-pulse', [[0, '#fff', 0.95], [0.45, 'var(--cuc-sb-in)', 0.6], [1, 'var(--cuc-sb-c)', 0]]) +
    lin('cuc-sb-grip', [[0, '#17191e'], [0.36, '#4d5360'], [0.7, '#2a2d35'], [1, '#121418']]) +
    rad('cuc-cm-coma', [[0, 'var(--cuc-cm-coma)', 'var(--cuc-cm-coma-o)'], [0.3, 'var(--cuc-cm-coma)', 'calc(var(--cuc-cm-coma-o) * .6)'], [0.6, 'var(--cuc-cm-coma)', 'calc(var(--cuc-cm-coma-o) * .2)'], [1, 'var(--cuc-cm-coma)', 0]]) +
    rad('cuc-cm-halo', [[0, '#ffffff', 'var(--cuc-cm-halo-o)'], [0.5, 'var(--cuc-cm-coma)', 'calc(var(--cuc-cm-halo-o) * .5)'], [1, 'var(--cuc-cm-coma)', 0]]) +
    rad('cuc-cm-nuc', [[0, 'var(--cuc-cm-nuc0)'], [0.55, 'var(--cuc-cm-nuc)'], [1, 'var(--cuc-cm-nuc2)']], 'cx=".4" cy=".38" r=".7"') +
    lin('cuc-cm-dust', [[0, 'var(--cuc-cm-dust)', 'var(--cuc-cm-dust-o)'], [0.2, 'var(--cuc-cm-dust)', 'calc(var(--cuc-cm-dust-o) * .55)'], [0.55, 'var(--cuc-cm-dust)', 'calc(var(--cuc-cm-dust-o) * .18)'], [1, 'var(--cuc-cm-dust)', 0]], 'gradientUnits="userSpaceOnUse" x1="100" y1="0" x2="0" y2="0"') +
    lin('cuc-cm-ion', [[0, 'var(--cuc-cm-ion)', 'var(--cuc-cm-ion-o)'], [0.3, 'var(--cuc-cm-ion)', 'calc(var(--cuc-cm-ion-o) * .45)'], [1, 'var(--cuc-cm-ion)', 0]], 'gradientUnits="userSpaceOnUse" x1="100" y1="0" x2="0" y2="0"') +
    rad('cuc-mt-glow', [[0, 'var(--cuc-mt-glow)', 'var(--cuc-mt-glow-o)'], [0.45, 'var(--cuc-mt-glow)', 'calc(var(--cuc-mt-glow-o) * .35)'], [1, 'var(--cuc-mt-glow)', 0]]) +
    rad('cuc-mt-rock', [[0, '#8f7362'], [0.55, '#5a443a'], [1, '#33251f']], 'cx=".42" cy=".4" r=".62"') +
    rad('cuc-mt-heat', [[0, '#fffbe2', 0.95], [0.2, '#ffd66e', 0.9], [0.45, '#ff7d22', 0.62], [0.72, '#ff4a12', 0]], 'cx=".8" cy=".8" r=".78" fx=".86" fy=".88"') +
    lin('cuc-mt-f1', [[0, 'var(--cuc-mt-f1a)', 0.88], [0.25, 'var(--cuc-mt-f1b)', 0.8], [0.6, 'var(--cuc-mt-f1b)', 0.32], [1, 'var(--cuc-mt-f1b)', 0]], 'gradientUnits="userSpaceOnUse" x1="104" y1="0" x2="2" y2="0"') +
    lin('cuc-mt-f2', [[0, 'var(--cuc-mt-f2a)'], [0.3, 'var(--cuc-mt-f2b)', 0.9], [1, 'var(--cuc-mt-f2b)', 0]], 'gradientUnits="userSpaceOnUse" x1="104" y1="0" x2="28" y2="0"') +
    lin('cuc-mt-f3', [[0, '#ffffff'], [0.35, 'var(--cuc-mt-f3)', 0.95], [1, 'var(--cuc-mt-f3)', 0]], 'gradientUnits="userSpaceOnUse" x1="102" y1="0" x2="56" y2="0"') +
    lin('cuc-mt-smoke', [[0, 'var(--cuc-mt-smoke)', 0], [0.22, 'var(--cuc-mt-smoke)', 'var(--cuc-mt-smoke-o)'], [0.6, 'var(--cuc-mt-smoke)', 'calc(var(--cuc-mt-smoke-o) * .4)'], [1, 'var(--cuc-mt-smoke)', 0]], 'gradientUnits="userSpaceOnUse" x1="90" y1="0" x2="-10" y2="0"') +
    lin('cuc-rk-hull', [[0, 'var(--cuc-rk-h1)'], [0.34, '#ffffff'], [0.68, 'var(--cuc-rk-h2)'], [1, 'var(--cuc-rk-h3)']]) +
    lin('cuc-rk-acc', [[0, 'color-mix(in srgb, var(--violet) 62%, #000)'], [0.36, 'color-mix(in srgb, var(--violet) 62%, #fff)'], [0.62, 'var(--violet)'], [1, 'color-mix(in srgb, var(--violet) 55%, #000)']]) +
    lin('cuc-rk-noz', [[0, '#2c3039'], [0.4, '#8a909c'], [1, '#22252c']]) +
    rad('cuc-rk-puff', [[0, 'var(--cuc-rk-smoke)', 'var(--cuc-rk-smoke-o)'], [0.5, 'var(--cuc-rk-smoke)', 'calc(var(--cuc-rk-smoke-o) * .55)'], [1, 'var(--cuc-rk-smoke)', 0]]) +
    rad('cuc-rk-glass', [[0, '#d4f1ff'], [0.5, '#4aa0e0'], [1, '#163a70']], 'cx=".35" cy=".35" r=".75"') +
    lin('cuc-rk-fo', [[0, 'var(--cuc-rk-fo1)'], [0.45, 'var(--cuc-rk-fo2)', 0.88], [1, 'var(--cuc-rk-fo2)', 0]], 'gradientUnits="userSpaceOnUse" x1="0" y1="29" x2="0" y2="40.4"') +
    lin('cuc-rk-fi', [[0, '#ffffff'], [0.4, 'var(--cuc-rk-fi)'], [1, 'var(--cuc-rk-fi)', 0]], 'gradientUnits="userSpaceOnUse" x1="0" y1="29" x2="0" y2="36.4"') +
    lin('cuc-wd-rod', [[0, 'var(--cuc-wd-r1)'], [0.35, '#ffffff'], [0.7, 'var(--cuc-wd-r2)'], [1, 'var(--cuc-wd-r3)']]) +
    lin('cuc-wd-grip', [[0, 'color-mix(in srgb, var(--violet) 45%, #000)'], [0.4, 'color-mix(in srgb, var(--violet) 80%, #fff)'], [1, 'color-mix(in srgb, var(--violet) 40%, #000)']]) +
    rad('cuc-wd-gem', [[0, '#ffffff'], [0.4, '#ff9ad6'], [1, '#c02a82']], 'cx=".35" cy=".35" r=".75"') +
    rad('cuc-wd-glow', [[0, 'var(--cuc-wd-glow)', 'var(--cuc-wd-glow-o)'], [0.45, 'var(--cuc-wd-glow)', 'calc(var(--cuc-wd-glow-o) * .32)'], [1, 'var(--cuc-wd-glow)', 0]]) +
    '<clipPath id="cuc-wd-rodclip"><path d="M4.1 13.6H5.9L6.1 31.2H3.9Z"/></clipPath>' +
    lin('cuc-ob-bar', [[0, 'color-mix(in srgb, var(--violet) 70%, #000)'], [0.3, 'var(--violet)'], [0.5, 'var(--cuc-ob-core)'], [0.7, 'var(--violet)'], [1, 'color-mix(in srgb, var(--violet) 70%, #000)']]) +
    lin('cuc-ob-glow', [[0, 'var(--violet)', 0], [0.5, 'var(--violet)', 'var(--cuc-ob-glow-o)'], [1, 'var(--violet)', 0]]) +
    lin('cuc-ob-panel', [[0, 'var(--cuc-ob-p1)'], [0.45, 'var(--cuc-ob-p2)'], [1, 'var(--cuc-ob-p1)']], 'x1="0" y1="0" x2="1" y2="1"') +
    rad('cuc-ob-halo', [[0, 'var(--cuc-ob-halo)', 'var(--cuc-ob-halo-o)'], [0.5, 'var(--cuc-ob-halo)', 'calc(var(--cuc-ob-halo-o) * .35)'], [1, 'var(--cuc-ob-halo)', 0]]);
  const mount = () => {
    if (document.getElementById('cuc-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="cuc-defs" class="cuc-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };

  /*
   * One small watcher on the terminal's cursor element (and on the composer's): each time it moves (updateCursor sets a
   * new translate) it turns the comet's tail to point back the way the caret came (--cuc-cm-a, and --cuc-cm-k: how far
   * the tail stretches, more for a long jump), and gives these cursors a "kick": it restarts a one-shot animation on the next .cuc-kick element
   * of the drawing by swapping its class between .cuc-ka and .cuc-kb (two copies of the same keyframes, so the swap
   * starts it again). Kicks are at most one per 110 ms and go round the drawing's kick elements in turn, so a held key
   * keeps up a steady spray instead of restarting one burst over and over. updateCursor rewrites the cursor's className,
   * so the swapped classes live on the drawing's own elements.
   * Once the caret has stopped (CM_REST_MS after the last move, when the tail has drawn back in) the comet's tail eases
   * back to its resting pose, along the row and a little up, so after Enter or a jump it never lies across other lines.
   * A small turn (typing on along a row, or resuming after a rest) eases quickly; a big one snaps while the tail regrows.
   */
  const MINE = new Set(Object.keys({ saber, comet, meteor, rocket, wand, orbit }));
  const CM_REST = 5, CM_REST_MS = 900; // the tail at rest (deg, as --cuc-cm-a), and how long after the last move it goes there
  const watch = (el) => {
    let px = null, py = null, last = 0, turn = 0, ang = CM_REST, restT = 0;
    const aim = (a, how) => { // turn the comet's tail to a (deg) the nearer way round; how: 'cm-turn', 'cm-rest' or '' (snap)
      const dir = el.querySelector('.cm-dir');
      if (!dir) return;
      a += 360 * Math.round((ang - a) / 360);
      dir.classList.toggle('cm-turn', how === 'cm-turn');
      dir.classList.toggle('cm-rest', how === 'cm-rest');
      el.style.setProperty('--cuc-cm-a', `${n2(a)}deg`);
      ang = a;
    };
    new MutationObserver(() => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
      if (!m) return;
      const x = +m[1], y = +m[2];
      if (x === px && y === py) return;
      const dx = x - px, dy = y - py, first = px === null;
      px = x; py = y;
      const kind = el.dataset.art;
      if (first || !MINE.has(kind) || el.hidden) return;
      if (kind === 'comet') {
        const a = (Math.atan2(-dy, -dx) * 180) / Math.PI - 180, off = Math.abs((((a - ang) % 360) + 540) % 360 - 180);
        aim(a, off < 30 ? 'cm-turn' : '');
        clearTimeout(restT);
        restT = setTimeout(() => { if (el.dataset.art === 'comet') aim(CM_REST, 'cm-rest'); }, CM_REST_MS);
        el.style.setProperty('--cuc-cm-k', String(n2(Math.min(2.6, 1.55 + Math.hypot(dx, dy) / (parseFloat(el.style.width) || 8) / 12))));
      }
      const now = performance.now();
      if (now - last < 110) return;
      last = now;
      const ks = el.querySelectorAll('.cuc-kick');
      if (!ks.length) return;
      const k = ks[turn++ % ks.length];
      const a = k.classList.contains('cuc-ka');
      k.classList.toggle('cuc-ka', !a);
      k.classList.toggle('cuc-kb', a);
    }).observe(el, { attributes: true, attributeFilter: ['style'] });
  };
  const find = () => {
    const el = document.querySelector('#stage > .mt-cursor');
    if (el) watch(el); else setTimeout(find, 800);
  };
  (window.CURSOR_INIT = window.CURSOR_INIT || []).push(watch); // the composer's cursor, a copy made when it opens, is watched the same way
  const start = () => { mount(); find(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
