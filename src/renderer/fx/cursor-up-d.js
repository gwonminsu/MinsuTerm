'use strict';
/*
 * Cursors redrawn in layers (group d): 불꽃 · 용암 방울 · 플라즈마 · 홀로그램 · 글리치 · 잔상. Styles in fx/cursor-up-d.css.
 *
 * The same rules as fx/cursor-art.js: a 20 x 40 drawing (.cud-box) fitted to the caret cell, every moving part its own
 * layer (.cl) of which only transform and opacity are animated, gradients painted once from a hidden <defs> svg
 * (#cud-defs). A few parts reach past the cell (a lava drop falling onto the next line, a stray arc, a tear along the
 * row); they are faint and brief, and go when the terminal loses focus.
 * 잔상 leaves real afterimages where the caret has just been: updateCursor (app.js) reports each move through
 * window.CURSOR_MOVE, and an echo is pinned at the old place and fades there while the caret goes on.
 */
(function () {
  const L = (cls, body, style) => `<svg class="cl ${cls}" viewBox="0 0 20 40" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const G = (cls, inner, style) => `<span class="cl ${cls}"${style ? ` style="${style}"` : ''}>${inner}</span>`;
  const box = (cls, inner) => `<span class="cud-box ${cls}">${inner}</span>`;
  const n2 = (v) => +v.toFixed(2);
  const at = (x, y) => `transform-origin:${n2(x * 5)}% ${n2(y * 2.5)}%`; // a point of the drawing as a transform origin

  /* 불꽃: a living flame standing on the line. A blue root, a white-gold heart, orange tongues that lick up out of step
     and throw off little wisps; now and then it gutters low and flares back; a spark drifts up into the line above.
     Typing makes it lean back and flare. */
  const FL_OUT = 'M10 39.6C5.2 39.6 2.8 36.2 3 31.4C3.2 26.4 6 22.8 7.2 18.2C8.2 14.4 8 10 9.4 4C12.4 9.2 14.8 12.6 15.8 17C16.8 21.4 17 26.4 17 31.2C17 36.2 14.6 39.6 10 39.6Z';
  const flSpark = (cls, x, y, dx, t, d) => L(cls, `<circle cx="${x}" cy="${y}" r="1.7" fill="url(#cud-fl-sparkglow)"/><circle class="fl-sp" cx="${x}" cy="${y}" r=".6"/>`, `${at(x, y)};--dx:${dx}%;animation-duration:${t}s;animation-delay:${d}s`);
  const flame = box('cud-fl',
    G('fl-glowg', L('fl-glow', '<ellipse cx="10" cy="27" rx="12.5" ry="16.5" fill="url(#cud-fl-glow)"/>')) +
    flSpark('fl-spark', 9.6, 7, -14, 3.3, -0.6) + flSpark('fl-spark', 11, 9, 18, 4.7, -2.9) +
    G('fl-lean', G('fl-gut',
      L('fl-tl', '<path d="M7.6 23.4C5.4 20.2 4.8 16.2 5.8 11.8C6.9 15.2 8.4 17.4 9.6 20.2Z" fill="url(#cud-fl-out)"/>', at(8.4, 23)) +
      L('fl-tr', '<path d="M12.2 19.4C13.6 15.8 13.6 11.8 12.6 8.2C15 11 16.4 14.6 16.1 19.6Z" fill="url(#cud-fl-out)"/>', at(14, 19.5)) +
      L('fl-o', `<path d="${FL_OUT}" fill="url(#cud-fl-out)"/><path class="fl-edge" d="${FL_OUT}"/>`) +
      L('fl-wisp', '<path d="M9.5 4.4C10.5 2.8 10.5 1.2 9.7 -.6C11.5 1 12.1 2.8 11.1 4.6C10.7 5.2 9.9 5.2 9.5 4.4Z" fill="url(#cud-fl-out)"/>', at(10.3, 4.6)) +
      L('fl-wisp fl-wisp2', '<path d="M13.4 10.8C14.2 9.6 14.2 8.4 13.6 7C15 8.2 15.4 9.6 14.6 11Z" fill="url(#cud-fl-out)"/>', at(14, 11)) +
      L('fl-m', '<path d="M10 39.3C6.6 39.3 5 36.8 5.2 33C5.4 29 7.4 26.2 8.4 22.4C9.2 19.4 9.4 16.4 10.2 12.4C12.2 16.6 13.8 20 14.3 24.6C14.7 28.6 14.8 31 14.6 33.4C14.3 37 12.6 39.3 10 39.3Z" fill="url(#cud-fl-mid)"/>') +
      L('fl-c', '<path d="M10 38.8C8.1 38.8 7.1 37.3 7.2 35C7.3 32 8.7 29.8 9.8 25.8C11 29 12.7 31.6 12.8 34.8C12.9 37.3 11.9 38.8 10 38.8Z" fill="url(#cud-fl-core)"/>') +
      L('fl-b', '<path d="M4.2 32.6C4.4 37.2 6.9 39.6 10 39.6C13.1 39.6 15.6 37.2 15.8 32.6C14.6 34.8 12.6 35.9 10 35.9C7.4 35.9 5.4 34.8 4.2 32.6Z" fill="url(#cud-fl-blue)"/>'))) +
    L('fl-pop', '<circle cx="8.6" cy="12" r=".7"/><circle cx="12.4" cy="17" r=".55"/>', at(10, 14)));

  /* 용암 방울: a column of molten rock, crusted dark at the edges, bright lava pulsing down it into a drop that swells,
     stretches on a neck, lets go and falls onto the line below, where it splashes and cools from orange to a dark
     cinder. Typing swings the hanging drop back and flings a fleck of lava. */
  const DR_COL = 'M7.1 3.6C7.1 1.6 8.4 .7 10 .7C11.6 .7 12.9 1.6 12.9 3.6V27.2C12.9 29.4 11.7 30.8 10 30.8C8.3 30.8 7.1 29.4 7.1 27.2Z';
  const drip = box('cud-dr',
    L('dr-glow', '<ellipse cx="10" cy="21" rx="9.5" ry="19.5" fill="url(#cud-dr-glow)"/>') +
    G('dr-colw',
      L('dr-col', `<path d="${DR_COL}" fill="url(#cud-dr-lava)"/><path d="${DR_COL}" fill="url(#cud-dr-cool)"/>
        <path class="dr-crack" d="M10.2 2.4L9.6 6.2L10.5 9.6L9.5 13.4L10.4 17.4L9.6 21.2L10.3 25.2L9.9 28.6"/>
        <path class="dr-edge" d="${DR_COL}"/>`) +
      L('dr-pulse', '<ellipse cx="10" cy="3.4" rx="1.55" ry="2.8" fill="url(#cud-dr-hot)"/>') +
      L('dr-pulse dr-pulse2', '<ellipse cx="10" cy="3.4" rx="1.3" ry="2.2" fill="url(#cud-dr-hot)"/>') +
      L('dr-crust', `<path d="M7.1 4.4L8.9 3.7L9.6 5.6L8.8 8.2L7.1 8.6Z M12.9 6.6L11 6.1L10.4 8.4L11.2 10.8L12.9 11.2Z M7.1 10.4L9 9.8L9.5 12.2L8.6 14.6L7.1 14.8Z
        M12.9 13.4L11.1 13L10.5 15.4L11.4 17.6L12.9 17.8Z M7.1 16.8L8.8 16.4L9.4 18.6L8.6 20.8L7.1 21.2Z M12.9 19.8L11.2 19.5L10.6 21.8L11.3 23.6L12.9 23.8Z
        M7.1 23L8.7 22.7L9.2 24.6L8 26.2L7.1 26Z"/><path class="dr-crusthi" d="M7.4 5L8.7 4.4M12.6 7.1L11.2 6.7M7.4 11L8.8 10.4M12.6 13.9L11.3 13.5M7.4 17.4L8.6 17M12.6 20.3L11.4 20"/>`)) +
    G('dr-swing',
      L('dr-hang', '<path d="M10 26.4C12.7 29.8 13.8 31.9 13.7 33.8C13.6 35.9 12 37.2 10 37.2C8 37.2 6.4 35.9 6.3 33.8C6.2 31.9 7.3 29.8 10 26.4Z" fill="url(#cud-dr-drop)"/><path class="dr-dedge" d="M10 26.4C12.7 29.8 13.8 31.9 13.7 33.8C13.6 35.9 12 37.2 10 37.2C8 37.2 6.4 35.9 6.3 33.8C6.2 31.9 7.3 29.8 10 26.4Z"/><ellipse class="dr-glint" cx="8.6" cy="32.6" rx=".55" ry="1.1"/>')) +
    L('dr-fall', '<path d="M10 29.6C11.8 31.8 12.6 33.2 12.5 34.5C12.4 36 11.3 36.9 10 36.9C8.7 36.9 7.6 36 7.5 34.5C7.4 33.2 8.2 31.8 10 29.6Z" fill="url(#cud-dr-drop)"/><path class="dr-dedge" d="M10 29.6C11.8 31.8 12.6 33.2 12.5 34.5C12.4 36 11.3 36.9 10 36.9C8.7 36.9 7.6 36 7.5 34.5C7.4 33.2 8.2 31.8 10 29.6Z"/>') +
    `<span class="cud-reach dr-land">${
      L('dr-splat', '<ellipse cx="10" cy="36.4" rx="3.6" ry="1.05" fill="url(#cud-dr-drop)"/>') +
      L('dr-cinder', '<ellipse cx="10" cy="36.5" rx="3.3" ry=".95"/><path d="M8.2 36.4L9.6 36.1L10.4 36.6L11.8 36.3"/>') +
      L('dr-fleck', '<circle cx="10" cy="35.8" r=".6"/>', '--dx:-26%') +
      L('dr-fleck', '<circle cx="10" cy="35.8" r=".5"/>', '--dx:24%;animation-delay:.04s')}</span>` +
    L('dr-fling', '<circle cx="9" cy="31" r=".75"/><circle cx="11.6" cy="28.4" r=".5"/>', at(10, 30)));

  /* 플라즈마: a little arc lamp: a white-hot filament in a violet sheath between two electrodes. Arcs crack out from it
     to points around the cell at irregular moments, sometimes reach over to the next cell or the line above, and the
     sheath breathes; typing sets off a discharge. */
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const zig = (pts, j) => { // a jagged path through a chain of points, each step jittered sideways by up to j
    let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, k = i === pts.length - 1 ? 0 : (rnd() * 2 - 1) * j;
      d += `L${n2(x1 + nx * k)} ${n2(y1 + ny * k)}`;
    }
    return d;
  };
  const line = (x1, y1, x2, y2, n) => Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  const bow = (x1, y1, cx, cy, x2, y2, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * x1 + 2 * t * u * cx + t * t * x2, u * u * y1 + 2 * t * u * cy + t * t * y2]; });
  const arc = (cls, pts, j, t, dl, branch) => {
    const d = zig(pts, j), e = pts[pts.length - 1];
    let b = '';
    if (branch) { const p = pts[branch]; b = zig(line(p[0], p[1], p[0] + (e[0] - pts[0][0]) * 0.3 + (rnd() - 0.5) * 4, p[1] + (rnd() - 0.5) * 7, 3), j * 0.7); }
    return L(`pz-arc ${cls}`, `<path class="pz-halo" d="${d}${b ? ` ${b}` : ''}"/><path class="pz-bolt" d="${d}${b ? ` ${b}` : ''}"/><circle class="pz-hit" cx="${n2(e[0])}" cy="${n2(e[1])}" r=".9"/>`, `animation-duration:${t}s;animation-delay:${dl}s`);
  };
  // each arc in two shapes that take turns while it is lit, so it crackles
  const pair = (pts, j, t, dl, branch) => arc('pz-a', pts, j, t, dl, branch) + arc('pz-b', pts, j, t, dl, branch);
  const plasma = box('cud-pz',
    G('pz-surge', L('pz-glow', '<ellipse cx="10" cy="20" rx="10.5" ry="21.5" fill="url(#cud-pz-glow)"/>')) +
    L('pz-core', `<rect x="7.9" y="2.6" width="4.2" height="34.8" rx="2.1" fill="url(#cud-pz-sheath)"/><rect class="pz-fil" x="9.4" y="3.2" width="1.2" height="33.6" rx=".6"/>
      <rect x="7.4" y=".6" width="5.2" height="2.4" rx=".8" fill="url(#cud-pz-metal)"/><rect x="7.4" y="37" width="5.2" height="2.4" rx=".8" fill="url(#cud-pz-metal)"/>`) +
    [0, 1, 2].map((k) => L('pz-writhe', `<path d="${zig(line(10, 3.4, 10, 36.6, 9), 1.15)}"/>`, `animation-delay:${n2(-k * 0.47)}s`)).join('') + // the filament writhes
    L('pz-flow', '<ellipse cx="10" cy="34" rx="1.2" ry="2.6" fill="url(#cud-pz-hot)"/>') +
    L('pz-flow pz-flow2', '<ellipse cx="10" cy="34" rx="1" ry="2" fill="url(#cud-pz-hot)"/>') +
    pair(line(10, 8, 2.2, 3.4, 5), 1.4, 2.3, 0, 3) +
    pair(line(10, 17, 18.6, 12.4, 5), 1.4, 1.9, -0.7) +
    pair(line(10, 30.5, 1.6, 35.6, 5), 1.4, 2.9, -1.6, 2) +
    pair(line(10, 23.5, 18.2, 31.6, 5), 1.4, 3.7, -2.2) +
    pair(bow(10, 5.6, 19.5, 11.5, 10, 18.8, 7), 1.1, 3.1, -0.4) +
    pair(bow(10, 21.2, 0.2, 27.8, 10, 35, 7), 1.1, 4.3, -3) +
    `<span class="cud-reach pz-far">${
      arc('pz-long', line(10, 14, 36, 4.5, 9), 2.2, 5.9, -2.6, 5) +
      arc('pz-long', line(10, 27, -17, 33, 9), 2.2, 7.3, -4.4, 4) +
      arc('pz-long', line(10, 2.6, 13.5, -23, 9), 2, 6.7, -1.1, 6)}</span>` +
    L('pz-burst', `<path class="pz-halo" d="${zig(line(10, 12, 1, 6, 5), 1.5)} ${zig(line(10, 26, 19, 21, 5), 1.5)}"/><path class="pz-bolt" d="${zig(line(10, 12, 1, 6, 5), 1.5)} ${zig(line(10, 26, 19, 21, 5), 1.5)}"/>`));

  /* 홀로그램: a projector on the line casts a see-through caret into the air: a cone of light, a floating block with
     bright corners, scanlines rolling up through it and a brighter band sweeping by; data motes rise in the beam. Now
     and then the picture flickers and slips; typing makes it re-project, rising out of the lens. */
  const hologram = box('cud-ho',
    G('ho-beamw', L('ho-beam', '<path d="M7.2 37.6L2.6 31.4H17.4L12.8 37.6Z" fill="url(#cud-ho-beam)"/>')) +
    L('ho-mote', '<rect x="7.6" y="35" width=".9" height=".9"/>', '--dy:-15%') +
    L('ho-mote', '<rect x="11.6" y="35.4" width=".8" height=".8"/>', '--dy:-13%;animation-delay:-1.3s;animation-duration:3.1s') +
    G('ho-proj', G('ho-flick', G('ho-float',
      L('ho-block', `<rect x="2.6" y="2.4" width="14.8" height="28.8" rx=".5" fill="url(#cud-ho-fill)"/><rect class="ho-rim" x="2.6" y="2.4" width="14.8" height="28.8" rx=".5"/>
        <path class="ho-corner" d="M2.6 6.6V2.4H6.4M13.6 2.4H17.4V6.6M17.4 27V31.2H13.6M6.4 31.2H2.6V27"/>`) +
      `<span class="cl ho-win"><i class="ho-lines"></i><i class="ho-sweep"></i></span>` +
      L('ho-slip', '<rect x="2.6" y="13.4" width="14.8" height="4.2" fill="url(#cud-ho-fill)"/><path class="ho-rim" d="M2.6 13.4H17.4M2.6 17.6H17.4"/>')))) +
    L('ho-base', `<ellipse cx="10" cy="38.5" rx="7.8" ry="1.5" fill="url(#cud-ho-metal)"/><path class="ho-plate" d="M2.2 38.5A7.8 1.5 0 0 0 17.8 38.5"/>
      <ellipse class="ho-lens" cx="10" cy="37.8" rx="3" ry=".8"/><circle class="ho-led" cx="4.4" cy="38.6" r=".42"/><circle class="ho-led" cx="15.6" cy="38.6" r=".42"/>`) +
    L('ho-lensglow', '<ellipse cx="10" cy="37.6" rx="4.4" ry="1.5" fill="url(#cud-ho-lensglow)"/>'));

  /* 글리치: two thin bars side by side, cyan and magenta, on the cell's left edge (the shape it always had). At
     irregular moments they jump apart, a slice of both tears sideways, stray pixels blink beside them, and now and
     then a faint tear runs along the row; typing splits the colours wider and sets off a burst. Plain boxes, no SVG. */
  const glBar = (cls) => `<span class="gl-bar ${cls}"><i class="gl-seg gl-seg1"></i><i class="gl-seg gl-seg2"></i><i class="gl-seg gl-seg3"></i></span>`;
  const glPx = (cls, x, y, t, d) => `<i class="gl-px ${cls}" style="left:${x}cqw;top:${y}%;animation-duration:${t}s;animation-delay:${d}s"></i>`;
  const glitch = `<span class="cud-reach gl-row"><i class="gl-tear"></i><i class="gl-tear gl-tear2"></i></span>` +
    `<span class="cud-gl"><span class="gl-all">${glBar('gl-c') + glBar('gl-m')}</span>${
      glPx('gl-pc', -70, 20, 2.6, -0.3) + glPx('gl-pm', 60, 62, 3.9, -2.2) + glPx('gl-pw', 45, 8, 5.1, -3.7)}</span>`;

  /* 잔상: a soft bar of light that leaves afterimages where it has just been: each one is pinned to the old place and
     fades there, spreading as it goes, while the caret moves on; a long jump draws a brief smear. Idle, it now and then
     sheds a faint echo that drifts back and fades. */
  const GH_N = 7; // afterimages at once: enough for fast typing (each lasts under a second)
  const ghost = `<span class="cud-gh">${'<span class="gh-echo"><i></i></span>'.repeat(GH_N)}<span class="gh-smear"></span>` +
    '<span class="gh-shed"><i></i></span><span class="gh-glow"></span><span class="gh-bar"></span></span>';

  Object.assign(window.CURSOR_ART = window.CURSOR_ART || {}, { flame, drip, plasma, hologram, glitch, ghost });

  /* 잔상's afterimages. Called by updateCursor (and the composer's caret) whenever the caret has moved: x, y are the
     new position in px. Echoes already fading keep their place on screen, so they are shifted by the move. */
  const GH_MS = 850;
  const moved = (el, x, y) => {
    const prev = el._cudGh;
    el._cudGh = { x, y, t: performance.now() };
    if (el.dataset.art !== 'ghost' || !prev) return;
    const root = el.querySelector('.cud-gh');
    if (!root) return;
    const now = el._cudGh.t, dx = prev.x - x, dy = prev.y - y;
    const ch = parseFloat(el.style.height) || 18, cw = parseFloat(el.style.width) || 8;
    const live = (root._live = (root._live || []).filter((e) => e.until > now));
    for (const e of live) e.el.style.translate = `${n2(e.x - x)}px ${n2(e.y - y)}px`;
    if (Math.abs(dy) > ch * 2.5 || Math.abs(dx) > cw * 160 || (!dx && !dy)) return; // a jump (clear, another tab): no trail
    if (dy && now - prev.t < 120) return; // output streaming past: the caret runs down the lines, nobody is typing
    const echoes = root.querySelectorAll('.gh-echo');
    const slot = echoes[(root._next = ((root._next || 0) + 1) % echoes.length)];
    root._live = live.filter((e) => e.el !== slot);
    root._live.push({ el: slot, x: prev.x, y: prev.y, until: now + GH_MS });
    slot.style.translate = `${n2(dx)}px ${n2(dy)}px`;
    if (slot._anim) slot._anim.cancel();
    slot._anim = slot.animate([
      { opacity: 0.85, transform: 'none' },
      { opacity: 0.5, transform: 'scale(1.3, .97)', offset: 0.3 },
      { opacity: 0, transform: 'scale(2.4, .9)' },
    ], { duration: GH_MS, easing: 'cubic-bezier(.25, .6, .45, 1)' });
    if (!dy && Math.abs(dx) > cw * 1.6) { // a long jump along the line: a smear from where it was
      const sm = root.querySelector('.gh-smear');
      sm.style.width = `${n2(Math.abs(dx))}px`;
      sm.style.translate = `${n2(Math.min(dx, 0))}px 0`;
      sm.style.scale = dx > 0 ? '-1 1' : '';
      if (sm._anim) sm._anim.cancel();
      sm._anim = sm.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
    }
  };
  (window.CURSOR_MOVE = window.CURSOR_MOVE || []).push(moved);

  const v = (name, o) => `style="stop-color:var(${name})${o == null ? '' : `;stop-opacity:${o}`}"`;
  const DEFS = `
    <radialGradient id="cud-fl-glow" cx=".5" cy=".55" r=".5"><stop offset="0" ${v('--cud-fl-glow', 'var(--cud-fl-glow-o)')}/><stop offset=".5" ${v('--cud-fl-glow', 'calc(var(--cud-fl-glow-o) * .28)')}/><stop offset="1" ${v('--cud-fl-glow', 0)}/></radialGradient>
    <linearGradient id="cud-fl-out" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="0"><stop offset="0" ${v('--cud-fl-o1')}/><stop offset=".45" ${v('--cud-fl-o2')}/><stop offset=".8" ${v('--cud-fl-o3', '.85')}/><stop offset="1" ${v('--cud-fl-o3', '.35')}/></linearGradient>
    <linearGradient id="cud-fl-mid" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="12"><stop offset="0" ${v('--cud-fl-m1')}/><stop offset=".7" ${v('--cud-fl-m2')}/><stop offset="1" ${v('--cud-fl-m2', '.55')}/></linearGradient>
    <linearGradient id="cud-fl-core" gradientUnits="userSpaceOnUse" x1="0" y1="39" x2="0" y2="25.5"><stop offset="0" ${v('--cud-fl-c1')}/><stop offset=".6" ${v('--cud-fl-c1')}/><stop offset="1" ${v('--cud-fl-c2', '.7')}/></linearGradient>
    <radialGradient id="cud-fl-sparkglow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--cud-fl-spark', '.8')}/><stop offset="1" ${v('--cud-fl-spark', 0)}/></radialGradient>
    <linearGradient id="cud-fl-blue" gradientUnits="userSpaceOnUse" x1="0" y1="39.6" x2="0" y2="32.6"><stop offset="0" ${v('--cud-fl-b1', '.95')}/><stop offset=".5" ${v('--cud-fl-b2', '.8')}/><stop offset="1" ${v('--cud-fl-b2', 0)}/></linearGradient>
    <radialGradient id="cud-dr-glow" cx=".5" cy=".62" r=".5"><stop offset="0" ${v('--cud-dr-glow', 'var(--cud-dr-glow-o)')}/><stop offset=".5" ${v('--cud-dr-glow', 'calc(var(--cud-dr-glow-o) * .3)')}/><stop offset="1" ${v('--cud-dr-glow', 0)}/></radialGradient>
    <linearGradient id="cud-dr-lava" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--cud-dr-l1')}/><stop offset=".3" ${v('--cud-dr-l2')}/><stop offset=".5" ${v('--cud-dr-l3')}/><stop offset=".7" ${v('--cud-dr-l2')}/><stop offset="1" ${v('--cud-dr-l1')}/></linearGradient>
    <linearGradient id="cud-dr-cool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8" stop-opacity=".35"/><stop offset=".35" stop-color="#fff6c8" stop-opacity="0"/><stop offset=".7" ${v('--cud-dr-l1', 0)}/><stop offset="1" ${v('--cud-dr-l1', '.55')}/></linearGradient>
    <radialGradient id="cud-dr-hot" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--cud-dr-hot', '.95')}/><stop offset=".55" ${v('--cud-dr-hot', '.45')}/><stop offset="1" ${v('--cud-dr-hot', 0)}/></radialGradient>
    <radialGradient id="cud-dr-drop" cx=".42" cy=".62" r=".62"><stop offset="0" ${v('--cud-dr-d1')}/><stop offset=".38" ${v('--cud-dr-d2')}/><stop offset=".75" ${v('--cud-dr-d3')}/><stop offset="1" ${v('--cud-dr-d4')}/></radialGradient>
    <radialGradient id="cud-pz-glow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--cud-pz-glow', 'var(--cud-pz-glow-o)')}/><stop offset=".35" ${v('--cud-pz-glow', 'calc(var(--cud-pz-glow-o) * .45)')}/><stop offset=".7" ${v('--cud-pz-glow2', 'calc(var(--cud-pz-glow-o) * .12)')}/><stop offset="1" ${v('--cud-pz-glow2', 0)}/></radialGradient>
    <linearGradient id="cud-pz-sheath" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--cud-pz-s1')}/><stop offset=".32" ${v('--cud-pz-s2')}/><stop offset=".5" ${v('--cud-pz-s3')}/><stop offset=".68" ${v('--cud-pz-s2')}/><stop offset="1" ${v('--cud-pz-s1')}/></linearGradient>
    <linearGradient id="cud-pz-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a4f5e"/><stop offset=".35" stop-color="#d9dde8"/><stop offset=".6" stop-color="#8b91a3"/><stop offset="1" stop-color="#3a3e4b"/></linearGradient>
    <radialGradient id="cud-pz-hot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" ${v('--cud-pz-s2', '.7')}/><stop offset="1" ${v('--cud-pz-s2', 0)}/></radialGradient>
    <linearGradient id="cud-ho-beam" gradientUnits="userSpaceOnUse" x1="0" y1="37.6" x2="0" y2="31.4"><stop offset="0" ${v('--cud-ho-c', 'calc(var(--cud-ho-beam-o) * 1.6)')}/><stop offset=".5" ${v('--cud-ho-c', 'var(--cud-ho-beam-o)')}/><stop offset="1" ${v('--cud-ho-c', 'calc(var(--cud-ho-beam-o) * .3)')}/></linearGradient>
    <linearGradient id="cud-ho-fill" gradientUnits="userSpaceOnUse" x1="0" y1="2.4" x2="0" y2="31.2"><stop offset="0" ${v('--cud-ho-c', 'calc(var(--cud-ho-fill-o) * .55)')}/><stop offset="1" ${v('--cud-ho-c', 'var(--cud-ho-fill-o)')}/></linearGradient>
    <linearGradient id="cud-ho-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--cud-ho-m1')}/><stop offset=".4" ${v('--cud-ho-m2')}/><stop offset="1" ${v('--cud-ho-m1')}/></linearGradient>
    <radialGradient id="cud-ho-lensglow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--cud-ho-c', '.7')}/><stop offset=".5" ${v('--cud-ho-c', '.2')}/><stop offset="1" ${v('--cud-ho-c', 0)}/></radialGradient>`;
  const mount = () => { // shared by every copy of a cursor (terminal, previews, composer); kept out of all of them
    if (document.getElementById('cud-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="cud-defs" class="ca-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
