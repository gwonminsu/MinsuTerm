'use strict';
/*
 * Cursors that reach out over the terminal around the caret, like 십자선 and 스포트라이트: 후광's pillar of light comes
 * down from the top of the pane, 촛불 lights the lines around it, 심전도 writes its trace along the row, and so on.
 *
 * The wide part (.cw-wide) is put in front of the cursor's own drawing (window.CURSOR_ART, fx/cursor-art.js; for the
 * CSS cursors the drawing stays in their ::before / ::after) and sits under it. Styles in fx/cursor-wide.css.
 * updateCursor (app.js) tells the cursor where its pane ends: --pl, --pr, --pt, --pb are px from the caret cell's top
 * left corner to the pane's left, right, top and bottom edge. In a split view it also clips the cursor to its pane.
 *
 * The same rules as the drawn cursors: gradients and paths painted once, then only moved, scaled or faded (each moving
 * part its own element), faint enough to read the text through, gone when the terminal loses focus.
 *
 * First, some cursors redrawn in layers like the ones in fx/cursor-art.js (they were flat CSS shapes): 고양이, 촛불.
 * Each is a box fitted to the caret cell (.cm-box: tall 20 x 40 or square 20 x 20), a little larger than the cell,
 * every moving part its own layer (.cl). They react to typing through the cursor's .moving class, and have small habits
 * of their own while you think (a cat flicks an ear, a candle gutters).
 */
(function () {
  const L = (h, cls, body, style) => `<svg class="cl ${cls}" viewBox="0 0 20 ${h}" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const T = (cls, body, style) => L(40, cls, body, style); // tall
  const Q = (cls, body, style) => L(20, cls, body, style); // square
  const G = (cls, inner, style) => `<span class="cl ${cls}"${style ? ` style="${style}"` : ''}>${inner}</span>`;
  const box = (shape, cls, inner) => `<span class="cm-box cm-${shape} ${cls}">${inner}</span>`;
  const mirror = (d) => d.replace(/(-?(?:\d+(?:\.\d+)?|\.\d+))(\s|,)(-?(?:\d+(?:\.\d+)?|\.\d+))/g, (m, x, s, y) => `${+(20 - x).toFixed(2)}${s}${y}`); // x -> 20 - x (absolute M/L/Q/C points)

  /* 고양이: an orange tabby (치즈 고양이). It blinks, now and then gives a slow blink, flicks an ear, and hops when you type. */
  const EAR = 'M3.3 8.9L2.5 1.6Q2.6 .7 3.4 1.1L8.6 5.5Z', EAR_IN = 'M4 7.3L3.6 2.9L7.1 5.7Z';
  const EYE = 'M4.8 11.5Q6.7 9.1 8.6 11.5Q6.7 13.5 4.8 11.5Z';
  const cat = box('sq', 'cm-cat', G('ct-all',
    G('ct-earl', Q('ct-ear', `<path class="ct-fur" d="${EAR}"/><path class="ct-in" d="${EAR_IN}"/>`)) +
    G('ct-earr', Q('ct-ear', `<path class="ct-fur" d="${mirror(EAR)}"/><path class="ct-in" d="${mirror(EAR_IN)}"/>`)) +
    Q('ct-head', `<path class="ct-fur" d="M10 5.1C14.6 5.1 17.6 7.8 17.7 11.6C17.8 13.3 18.7 13.9 18.5 14.6C17.7 17.1 14.3 18.8 10 18.8C5.7 18.8 2.3 17.1 1.5 14.6C1.3 13.9 2.2 13.3 2.3 11.6C2.4 7.8 5.4 5.1 10 5.1Z"/>
      <path class="ct-stripe" d="M10 5.6V8.1M7.5 6L8.2 8.3M12.5 6L11.8 8.3M2.5 11.3L4.7 11.7M2.9 13.4L4.8 13.1M17.5 11.3L15.3 11.7M17.1 13.4L15.2 13.1"/>
      <ellipse class="ct-muzzle" cx="10" cy="15.3" rx="3.4" ry="2.4"/>
      <path class="ct-nose" d="M9 13.7H11L10 14.8Z"/>
      <path class="ct-mouth" d="M10 14.8V15.4M10 15.4Q9.2 16.2 8.4 15.6M10 15.4Q10.8 16.2 11.6 15.6"/>
      <path class="ct-whisk" d="M7.4 14.7L1.6 14M7.4 15.4L1.9 16.3M12.6 14.7L18.4 14M12.6 15.4L18.1 16.3"/>`) +
    Q('ct-eyes', `<path class="ct-eye" d="${EYE}"/><path class="ct-eye" d="${mirror(EYE)}"/>
      <ellipse class="ct-pupil" cx="6.7" cy="11.5" rx=".6" ry="1.55"/><ellipse class="ct-pupil" cx="13.3" cy="11.5" rx=".6" ry="1.55"/>
      <circle class="ct-glint" cx="7.15" cy="10.9" r=".38"/><circle class="ct-glint" cx="13.75" cy="10.9" r=".38"/>`)));

  /* 촛불: a candle in a little brass dish. The flame flickers in layers (blue at its root, a white heart); every so
     often it gutters, sinks and sends up a thread of smoke, then stands up again; typing makes it lean back. */
  const candle = box('tall', 'cm-cn',
    G('cn-glowg', T('cn-glow', '<ellipse cx="10" cy="12" rx="9.5" ry="10.5" fill="url(#cm-cn-glow)"/>')) +
    T('cn-body', `<ellipse class="cn-dish" cx="10" cy="38.6" rx="6.4" ry="1.4" fill="url(#cm-brass)"/>
      <path class="cn-wax" d="M6.3 22.6Q10 21.5 13.7 22.6V38.2Q10 39.2 6.3 38.2Z" fill="url(#cm-cn-wax)"/>
      <ellipse class="cn-pool" cx="10" cy="22.6" rx="3.7" ry=".95"/>
      <path class="cn-drip" d="M12.3 22.9Q12.9 25.2 12.7 27Q12.5 28.2 12 27.6Q11.7 25.6 11.5 23.2Z"/>
      <path class="cn-wick" d="M10 22.4Q10.05 21 10.45 19.9"/>`) +
    T('cn-smoke', '<path d="M10.4 4.4Q8.9 1.6 10.6 -1.2Q12.2 -3.8 10.4 -6.8"/>') +
    G('cn-lean', G('cn-flame',
      T('cn-outer', '<path d="M10 3.2C11.7 7.4 13.5 10.4 13.4 14.4C13.3 17.6 11.9 20 10 20C8.1 20 6.7 17.6 6.6 14.4C6.5 10.4 8.3 7.4 10 3.2Z" fill="url(#cm-cn-outer)"/>') +
      T('cn-inner', '<path d="M10 8.4C11.1 11 12.1 12.9 12 15.4C11.9 17.6 11.1 19.1 10 19.1C8.9 19.1 8.1 17.6 8 15.4C7.9 12.9 8.9 11 10 8.4Z" fill="url(#cm-cn-inner)"/><ellipse class="cn-blue" cx="10" cy="18.9" rx="1.6" ry="1.05"/><ellipse class="cn-core" cx="10" cy="16.6" rx=".75" ry="1.7"/>'))));

  /* 병아리: a fluffy chick facing the way you type. It waddles, blinks, now and then pecks at the line, and when a key
     lands it hops and flaps its little wing. */
  const chick = box('sq', 'cm-ck', G('ck-hop', G('ck-waddle', G('ck-peck',
    Q('ck-feet', '<path d="M8.3 18.4V19.7M7.3 19.7H9.3M11.7 18.4V19.7M10.7 19.7H12.7"/>') +
    Q('ck-body', `<path class="ck-tuft" d="M9.3 5.3Q8.9 3.4 10 2.5Q10.2 3.8 10.8 4.2Q11.6 3.3 12.5 3.5Q11.5 4.4 11.2 5.4Z"/>
      <path class="ck-fluff" d="M10 4.8C14.2 4.8 17 7.8 17 12C17 16.2 14 18.8 10 18.8C6 18.8 3 16.2 3 12C3 7.8 5.8 4.8 10 4.8Z" fill="url(#cm-ck-body)"/>
      <ellipse class="ck-blush" cx="13.9" cy="13.4" rx="1.15" ry=".72"/>
      <path class="ck-beak" d="M15.3 10.7L19.4 12.1L15.3 13.5Z"/><path class="ck-beakline" d="M15.5 12.1H18.4"/>`) +
    Q('ck-eye', '<circle class="ck-pupil" cx="12.5" cy="9.8" r="1.35"/><circle class="ck-glint" cx="12.95" cy="9.35" r=".48"/>') +
    Q('ck-wing', '<path d="M4.7 12Q2.9 13.3 3.5 15.4Q5.7 16.1 7.3 14.4Q7.1 12.6 4.7 12Z"/>')))));

  /* 하트: a glossy heart beating lub-dub; each beat sends a faint ring out, and a key press lets two little hearts float up */
  const HEART = 'M10 17.6C6.4 15.3 2.4 12.2 2.4 8.2C2.4 5.6 4.3 3.8 6.6 3.8C8.1 3.8 9.3 4.6 10 5.8C10.7 4.6 11.9 3.8 13.4 3.8C15.7 3.8 17.6 5.6 17.6 8.2C17.6 12.2 13.6 15.3 10 17.6Z';
  const pop = (cls, x, y, s) => Q(`ht-pop ${cls}`, `<path transform="translate(${x} ${y}) scale(${s}) translate(-10 -10)" d="${HEART}"/>`, `transform-origin:${x * 5}% ${y * 5}%`);
  const heart = box('sq', 'cm-ht',
    Q('ht-ring', `<path d="${HEART}"/>`) +
    G('ht-beat', Q('ht-body', `<path d="${HEART}" fill="url(#cm-ht-body)"/><path class="ht-edge" d="${HEART}"/>
      <path class="ht-gloss" d="M4.6 7.4Q5 5.4 7.2 5"/><circle class="ht-gloss2" cx="5.2" cy="9.2" r=".55"/>`)) +
    pop('ht-p1', 4, 4, 0.28) + pop('ht-p2', 16.4, 2.6, 0.22));

  /* 슬라임: a glossy green slime bouncing in place, its shadow shrinking as it leaves the ground. It glances about and
     blinks; a key press squashes it flat for a moment. */
  const slime = box('sq', 'cm-sl',
    Q('sl-shadow', '<ellipse cx="10" cy="18.7" rx="6" ry="1.05"/>') +
    G('sl-bounce', G('sl-squish',
      Q('sl-body', `<path d="M2.4 17.8C2 12.2 5.6 6.8 10 6.8C14.4 6.8 18 12.2 17.6 17.8C14.9 18.9 5.1 18.9 2.4 17.8Z" fill="url(#cm-sl-body)"/>
        <ellipse class="sl-core" cx="10" cy="15.2" rx="4.6" ry="2.6"/>
        <path class="sl-edge" d="M2.4 17.8C2 12.2 5.6 6.8 10 6.8C14.4 6.8 18 12.2 17.6 17.8C14.9 18.9 5.1 18.9 2.4 17.8Z"/>
        <path class="sl-shine" d="M5 12.4Q5.6 9.6 8.2 8.6"/><circle class="sl-shine2" cx="5.5" cy="14.3" r=".6"/>
        <path class="sl-mouth" d="M9.1 15.6Q10 16.3 10.9 15.6"/>`) +
      Q('sl-eyes', '<ellipse cx="7.7" cy="13.2" rx=".78" ry="1.15"/><ellipse cx="12.3" cy="13.2" rx=".78" ry="1.15"/><circle class="sl-glint" cx="7.95" cy="12.75" r=".3"/><circle class="sl-glint" cx="12.55" cy="12.75" r=".3"/>'))));

  /* 젤리: a gummy block (the caret cell) with a shine; it jiggles now and then, and squishes as it moves */
  const jelly = '<span class="cm-jl"><span class="jl-body"><i class="jl-in"></i><i class="jl-gloss"></i></span></span>';

  Object.assign(window.CURSOR_ART = window.CURSOR_ART || {}, { cat, candle, chick, heart, slime, jelly });

  const v = (name, o) => `style="stop-color:var(${name})${o == null ? '' : `;stop-opacity:${o}`}"`;
  const DEFS = `
    <linearGradient id="cm-ct-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd28e"/><stop offset=".55" stop-color="#f6a84e"/><stop offset="1" stop-color="#df8530"/></linearGradient>
    <radialGradient id="cm-ct-eye" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#f4ff9a"/><stop offset=".6" stop-color="#bfe04a"/><stop offset="1" stop-color="#7fae2a"/></radialGradient>
    <radialGradient id="cm-cn-glow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--cm-cn-glow', 'var(--cm-cn-glow-o)')}/><stop offset=".5" ${v('--cm-cn-glow', 'calc(var(--cm-cn-glow-o) * .3)')}/><stop offset="1" ${v('--cm-cn-glow', 0)}/></radialGradient>
    <linearGradient id="cm-cn-wax" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9dfc8"/><stop offset=".38" stop-color="#fffaf0"/><stop offset=".7" stop-color="#f1e7d2"/><stop offset="1" stop-color="#c9bb9c"/></linearGradient>
    <linearGradient id="cm-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6420"/><stop offset=".4" stop-color="#f2cf73"/><stop offset="1" stop-color="#7a5414"/></linearGradient>
    <linearGradient id="cm-cn-outer" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="3"><stop offset="0" stop-color="#ff6a12"/><stop offset=".45" stop-color="#ff9a2a"/><stop offset=".85" stop-color="#ffc24a" stop-opacity=".85"/><stop offset="1" stop-color="#ffd36a" stop-opacity=".2"/></linearGradient>
    <linearGradient id="cm-cn-inner" gradientUnits="userSpaceOnUse" x1="0" y1="19" x2="0" y2="8"><stop offset="0" stop-color="#fff6c8"/><stop offset=".6" stop-color="#ffe36e"/><stop offset="1" stop-color="#ffc23a" stop-opacity=".6"/></linearGradient>
    <radialGradient id="cm-ck-body" cx=".4" cy=".34" r=".72"><stop offset="0" stop-color="#fff59a"/><stop offset=".55" stop-color="#ffd83e"/><stop offset="1" stop-color="#f2ab1a"/></radialGradient>
    <radialGradient id="cm-ht-body" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#ff9cbc"/><stop offset=".5" stop-color="#ff4f80"/><stop offset="1" stop-color="#c8174c"/></radialGradient>
    <linearGradient id="cm-sl-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6ffab" stop-opacity=".95"/><stop offset=".55" stop-color="#62de50" stop-opacity=".92"/><stop offset="1" stop-color="#2c9a38"/></linearGradient>`;
  const mount = () => { // shared by every copy of a cursor (terminal, previews, composer); kept out of all of them
    if (document.getElementById('cm-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="cm-defs" class="ca-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();

(function () {
  const W = (kind, inner) => `<span class="cw-wide cw-${kind}" aria-hidden="true">${inner}</span>`;
  const S = (cls, style) => `<span class="${cls}"${style ? ` style="${style}"` : ''}></span>`;
  const n2 = (v) => +v.toFixed(2);

  /* 후광: the pillar of light coming down from the top of the pane onto the caret, shimmering, with motes drifting down */
  const mote = (x, d, t) => `<span class="hw-motew" style="left:${x}cqw;animation-delay:${d}s;animation-duration:${t}s">${S('hw-mote', `animation-delay:${d}s;animation-duration:${t}s`)}</span>`;
  const halo = W('halo', `<span class="hw-col">${S('hw-shaft') + S('hw-ray hw-r1') + S('hw-ray hw-r2') + S('hw-core') +
    mote(-72, 0, 7.4) + mote(58, -2.9, 8.6) + mote(-14, -5.6, 6.8)}</span>`);

  /* 촛불: a warm pool of light round the flame, flickering */
  const candle = W('candle', `<span class="cdw-g">${S('cdw-pool') + S('cdw-core')}</span>`); // .cdw-g dims as the flame gutters

  /* 심전도: the bar is the pen of a heart monitor. The trace it writes runs off along the row to the right, fading. The
     strip moves away from the pen, so each beat is drawn mirrored: the newest part (T wave) nearest the pen. */
  const EG_N = 40; // beats in the strip: enough to cover the widest pane plus one beat
  let ecgPath = '';
  for (let i = 0; i < EG_N; i++) {
    const o = i * 40, x = (v) => n2(o + v);
    ecgPath += `M${x(0)} 12H${x(5)}Q${x(8.5)} 6.4 ${x(12)} 12H${x(14.6)}L${x(15.3)} 14.8L${x(16.9)} 1.4L${x(18.4)} 13.6L${x(19.1)} 12H${x(23)}Q${x(24.6)} 9.6 ${x(26.2)} 12H${x(40)}`;
  }
  const ecg = W('ecg', `<span class="ew-strip"><svg class="ew-trace" viewBox="0 0 ${EG_N * 40} 20" preserveAspectRatio="none" focusable="false">` +
    `<path class="ew-glow" d="${ecgPath}" vector-effect="non-scaling-stroke"/><path class="ew-line" d="${ecgPath}" vector-effect="non-scaling-stroke"/></svg></span>` +
    S('ew-beat'));

  /* 초승달: cold moonlight round the moon, and a faint lunar halo (달무리) breathing slowly */
  const moon = W('moon', S('mw-glow') + S('mw-ring'));

  /* 비눗방울: small bubbles leave the caret, drift up a few lines swaying, and pop. Paths are in cells (% of the cell). */
  const bub = (x, s, d, t, w) => `<span class="bw-rise" style="--x:${x}%;--s:${s};animation-delay:${d}s;animation-duration:${t}s"><span class="bw-sway" style="animation-delay:${d}s;animation-duration:${w}s"><span class="bw-ball" style="animation-delay:${d}s;animation-duration:${t}s"></span></span></span>`;
  const bubble = W('bubble', bub(-170, 0.8, 0, 5.6, 1.9) + bub(220, 0.64, -2.1, 6.4, 2.3) + bub(120, 0.95, -4.0, 7.2, 2.7));

  /* 벚꽃: a few petals drifting down past the caret, swaying and tumbling */
  const PETAL = '<svg viewBox="0 0 20 20" focusable="false"><path d="M10 19.4C5.4 17.2 3 13.4 3.4 9.2C3.8 5 6.6 1.6 8.8 .8L10 3.4L11.2 .8C13.4 1.6 16.2 5 16.6 9.2C17 13.4 14.6 17.2 10 19.4Z"/><path class="sw-vein" d="M10 17.6V7.6"/></svg>';
  const petal = (x0, y0, x1, y1, d, t, w) => `<span class="sw-fall" style="--x0:${x0}%;--y0:${y0}%;--x1:${x1}%;--y1:${y1}%;animation-delay:${d}s;animation-duration:${t}s"><span class="sw-sway" style="animation-delay:${d}s;animation-duration:${w}s"><span class="sw-spin" style="animation-delay:${d}s;animation-duration:${n2(w * 0.8)}s">${PETAL}</span></span></span>`;
  const sakura = W('sakura', petal(-420, -560, 260, 220, 0, 8.4, 2.6) + petal(380, -620, 900, 140, -2.9, 9.2, 3.1) + petal(-1100, -480, -520, 260, -5.8, 8.8, 2.8));

  /* 반딧불 커서: a few more fireflies wandering lazily round the caret, glowing now and then */
  const fly = (path, d, t, b, bd) => `<span class="fw-fly fw-${path}" style="animation-delay:${d}s;animation-duration:${t}s"><span class="fw-glow" style="animation-delay:${bd}s;animation-duration:${b}s"></span></span>`;
  const firefly = W('firefly', fly('a', 0, 13, 3.4, 0) + fly('b', -4.2, 16, 4.1, -1.3) + fly('c', -9, 14.5, 3.7, -2.6));

  const art = window.CURSOR_ART = window.CURSOR_ART || {};
  const wide = { halo, candle, ecg, moon, bubble, sakura, firefly };
  for (const k of Object.keys(wide)) art[k] = wide[k] + (art[k] || '');
})();
