'use strict';
/*
 * Cursors drawn as inline SVG: kind -> markup put inside the .mt-cursor element (terminal, picker preview, composer).
 *
 * Every drawing uses a 20 x 40 box (.ca-box) fitted to the character cell, a little larger than it, and may spill
 * outside. They are bold enough to read in a cell of about 8 x 18 px; the finer detail shows when the font is large.
 *
 * A cursor is on screen all the time, so it must cost nothing while it idles. Each moving part is therefore its own
 * layer (.cl: an <svg>, or a <span> grouping some) and only transform and opacity are animated, which the compositor
 * can do without repainting. Animating inside one SVG instead (rotating a group, morphing a path, a moving dash)
 * repaints it on the main thread every frame: a first version built that way showed up clearly in the renderer's
 * CPU time, and went quiet as soon as its animations were switched off.
 * Colours and animation live in fx/cursor-art.css; the gradients are defined once for the whole document below.
 */
(function () {
  const L = (cls, body, style) => `<svg class="cl ${cls}" viewBox="0 0 20 40" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const G = (cls, inner) => `<span class="cl ${cls}">${inner}</span>`;
  const box = (cls, inner) => `<span class="ca-box ${cls}">${inner}</span>`;
  const at = (x, y) => `transform-origin:${x * 5}% ${y * 2.5}%`; // a point of the drawing as a transform origin

  /* 붓: a bamboo brush, its tuft soaked in ink; a drop gathers at the tip and falls onto the line. */
  const TUFT = 'M4.6 15.6H13.4C15.4 17.8 15.4 21.4 13.2 23.8C11.6 25.6 9.8 27 9 30.4C8.2 27 6.4 25.6 4.8 23.8C2.6 21.4 2.6 17.8 4.6 15.6Z';
  const brush = box('ca-brush',
    L('b-stroke', '<path d="M9 38.1C4 37.5 -3 38 -11 38.7C-3 39.9 4 40.2 9 39.9Z"/>') +
    L('b-blot', '<ellipse cx="9" cy="39" rx="4.3" ry="1.15"/>') +
    G('b-tilt', L('b-sway', `
      <path class="b-loop" d="M9 -5.6C7 -8 7.2 -10.2 9 -10.2s2 2.2 0 4.6"/>
      <rect class="b-handle" x="5.9" y="-6" width="6.2" height="19" rx="1.7" fill="url(#ca-bamboo)"/>
      <rect class="b-cap" x="5.9" y="-6" width="6.2" height="2.4" rx="1.2"/>
      <path class="b-node" d="M5.9 .8h6.2M5.9 7h6.2"/>
      <path class="b-nodehi" d="M6.7 1.7h4.6M6.7 7.9h4.6"/>
      <path class="b-ferrule" d="M5.2 12.4h7.6l.9 3.4H4.3z"/>
      <path class="b-band" d="M5 13.7h8"/>
      <path d="${TUFT}" fill="url(#ca-tuft)"/>
      <path class="b-hair" d="M6.6 16.5C6.3 17.6 6.3 18.4 6.6 19.2M9 16.5V19.6M11.4 16.5C11.7 17.6 11.7 18.4 11.4 19.2"/>
      <g clip-path="url(#ca-tuft-clip)">
        <path class="b-bleed" d="M1 18.1C3 16.9 4.6 18.9 6.4 18.1C8 17.3 9.6 19.1 11.4 18.2C13 17.5 14.6 18.7 17 17.7V32H1Z"/>
        <path d="M1 19.6C3 18.4 4.6 20.4 6.4 19.6C8 18.8 9.6 20.6 11.4 19.7C13 19 14.6 20.2 17 19.2V32H1Z" fill="url(#ca-ink)"/>
        <path class="b-wet" d="M4.5 21.2C5.1 23.4 6.8 25 8.3 28"/>
      </g>
      <path class="b-tuft" d="${TUFT}"/>`)) +
    L('b-drop', '<path d="M9 30C10.9 32.8 11.4 34.8 9 35.4C6.6 34.8 7.1 32.8 9 30Z"/><ellipse class="b-glint" cx="8.2" cy="33.5" rx=".42" ry=".75"/>'));

  /* 후광: a pillar of light with small wings, a halo turning above it, sparks and motes drifting round it. */
  const wing = L('h-wing', `<path class="h-feather" d="M8.2 14.6C5.8 11 2.4 9 -1.6 9.4Q-1 11.8 .6 13.2Q.1 14.8 1.3 16.4Q2.3 16.7 3.2 16.3Q3 17.9 4.3 19.3Q5.5 19.5 6.5 18.9Q6.8 20.2 8.2 20.6Z" fill="url(#ca-h-wing)"/>
      <path class="h-vane" d="M.9 11.2Q4.6 12.2 7.8 15.2M2.6 14.9Q5.4 15.4 8 17.2"/>`);
  const spark = (x, y, s, d) => L('h-spark', `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -1.7Q.28 -.28 1.7 0Q.28 .28 0 1.7Q-.28 .28 -1.7 0Q-.28 -.28 0 -1.7Z"/>`, `${at(x, y)};animation-delay:${d}s`);
  const halo = box('ca-halo',
    L('h-glow', '<ellipse cx="10" cy="23" rx="10.5" ry="18.5" fill="url(#ca-h-glow)"/>') +
    G('h-wings', wing + G('h-flip', wing)) +
    L('h-body', `<ellipse cx="10" cy="38.4" rx="6.4" ry="1.6" fill="url(#ca-h-glow)"/>
      <rect class="h-bar" x="7.8" y="9" width="4.4" height="29.6" rx="2.2" fill="url(#ca-h-bar)"/>
      <rect class="h-core" x="9.3" y="10.2" width="1.4" height="27.2" rx=".7"/>`) +
    G('h-ring',
      L('h-band', '<ellipse cx="10" cy="4.3" rx="9.6" ry="4.2" fill="url(#ca-h-glow)"/><ellipse class="h-rim" cx="10" cy="4.3" rx="7.2" ry="2.4" stroke="url(#ca-h-ring)"/>') +
      G('h-squash', L('h-spin', '<path d="M17.2 4.3A7.2 7.2 0 0 1 10 11.5"/>'))) + // a quarter of a circle, squashed into the ring's ellipse
    L('h-mote', '<circle cx="5.6" cy="36" r=".6"/>') +
    L('h-mote', '<circle cx="14.6" cy="37" r=".55"/>', 'animation-delay:-1.5s') +
    spark(2.4, 27.6, 1.25, 0) + spark(17.8, 31, 1, -0.9) + spark(18.4, 11.4, 0.85, -1.7));

  /* 지옥불: a rod glowing white-hot inside layers of flame, the outer ones forked like horns; embers fly off. */
  const ember = (x, y, dx, d) => L('hf-ember', `<path transform="translate(${x} ${y})" d="M0 -1.1L.95 0L0 1.1L-.95 0Z"/>`, `${at(x, y)};--dx:${dx * 5}%;animation-delay:${d}s`);
  const hell = box('ca-hell',
    L('hf-glow', '<ellipse cx="10" cy="24" rx="13" ry="20" fill="url(#ca-hf-glow)"/>') +
    G('hf-all',
      L('hf-o1', '<path d="M10 39.8C4.8 39.6 1.2 33.4 1.4 25.2C1.6 16.6 4.2 10 4.8 .4C6.2 4.6 7.8 8 9.6 10C10.8 7.4 11.8 3.4 12.2 -2C13.8 8.6 18.8 16 18.6 25C18.6 33.2 15.2 39.6 10 39.8Z" fill="url(#ca-hf-o)"/>') +
      L('hf-o2', '<path d="M10 39.8C4.4 39.6 2 32.8 2 24C2 15.4 6.4 8.4 7.6 -2.6C8 3 9.2 6 10.4 7.6C12 5.6 13.8 1.6 15 -4.4C15.4 7.4 18 15 18 24C18.2 32.8 15.6 39.6 10 39.8Z" fill="url(#ca-hf-o)"/>') +
      L('hf-m1', '<path d="M11.2 4.8C12.8 10.6 15.2 17 15.1 26C15 33.6 13.6 39.4 10 39.6C6.4 39.4 4.9 33.4 4.9 26.2C4.9 17.6 9.4 11.4 11.2 4.8Z" fill="url(#ca-hf-m)"/>') +
      L('hf-m2', '<path d="M9 7.6C11.6 12.4 16 18.4 15.7 27C15.5 34.2 13.6 39.4 10 39.6C6.4 39.4 4.4 34.2 4.3 26.8C4.1 18.8 7.2 13.2 9 7.6Z" fill="url(#ca-hf-m)"/>') +
      L('hf-i', '<path d="M10 14.6C11.6 18.6 13.8 23 13.7 29.4C13.6 35 12.4 39.2 10 39.4C7.6 39.2 6.4 35 6.3 29.4C6.2 23.4 8.6 19 10 14.6Z" fill="url(#ca-hf-i)"/>')) +
    L('hf-rod', '<rect x="8.1" y="9.4" width="3.8" height="29.6" rx="1.7" fill="url(#ca-hf-rod)"/><path class="hf-crack" d="M10 11.6l.45 3-.8 2.9.7 3.3-.6 3.1.6 3.5-.5 3.3.35 4.2"/>') +
    L('hf-core', '<rect x="9.2" y="10.6" width="1.6" height="27.4" rx=".8"/>') +
    ember(5.4, 8, -2.6, 0) + ember(14.4, 4, 2.4, -0.5) + ember(9.2, 0, -1, -1) + ember(16, 12, 3, -1.45) + ember(3.6, 16, -2, -0.8));

  /* 핏방울: blood seeping from the top of the cell runs down in three trails; the longest swells into a drop that
     lets go and lands in a small pool on the line. */
  const DROP = 'fill="url(#ca-bl-drop)"';
  const blood = box('ca-blood',
    L('bl-pool', '<ellipse cx="10" cy="39" rx="5.6" ry="1.25"/>') +
    L('bl-body', `<path class="bl-run" d="M1.6 .8C1.2 -.4 2.4 -1.4 3.8 -1.1C5.4 -1.6 7 -.7 8.6 -1.1C10.2 -1.6 11.8 -.8 13.4 -1.2C14.6 -1.5 15.6 -.9 16.6 -1C17.8 -1.1 18.7 -.1 18.3 1.2C17.9 2.2 17 2.6 16.4 2.9C16.5 4.4 16.6 6 16.4 7.4C16.3 8.6 14.5 8.6 14.4 7.4C14.3 6 14.5 4.6 14.2 3.4C13.8 3 13 3 12.6 3.6C12.2 9 12.8 15 12.4 21.6C12.3 22.8 7.7 22.8 7.6 21.6C7.2 15 7.9 9 7.4 3.6C7 3 6.4 3 6 3.4C6.2 6.4 6 9.4 6.1 12.4C6 13.8 3.2 13.8 3.1 12.4C3 9.4 3.3 6.2 3 3.2C2.4 2.8 1.8 1.9 1.6 .8Z" fill="url(#ca-bl)"/>
      <path class="bl-shine" d="M3.4 .5C5.6 0 8 .7 10.6 .2M8.7 4.8C8.5 9.6 8.95 14.4 8.7 19.4M3.9 4.4C4 6.8 3.9 9 4 11.4"/>`) +
    L('bl-bead', `<ellipse cx="10" cy="6" rx="2.9" ry="3.2" ${DROP}/>`) +
    L('bl-side', `<path d="M4.6 10.8C5.8 12.8 6.7 13.8 6.7 14.9C6.6 16 5.7 16.7 4.6 16.7C3.5 16.7 2.6 16 2.5 14.9C2.5 13.8 3.4 12.8 4.6 10.8Z" ${DROP}/><ellipse class="bl-glint" cx="3.9" cy="14.6" rx=".4" ry=".65"/>`) +
    G('bl-swing', L('bl-hang', `<path d="M10 19.2C12.4 23 14.2 25.2 14.1 27.3C14 29.6 12.2 31 10 31C7.8 31 6 29.6 5.9 27.3C5.8 25.2 7.6 23 10 19.2Z" ${DROP}/><ellipse class="bl-glint" cx="8.2" cy="26.4" rx=".7" ry="1.2"/>`)) +
    L('bl-fall', `<path d="M10 26C11.6 28.6 12.5 30.2 12.4 31.4C12.3 32.8 11.3 33.6 10 33.6C8.7 33.6 7.7 32.8 7.6 31.4C7.5 30.2 8.4 28.6 10 26Z" ${DROP}/><ellipse class="bl-glint" cx="9" cy="30.8" rx=".45" ry=".8"/>`) +
    L('bl-splash', '<circle cx="10" cy="38.4" r=".75"/>', '--dx:-23%') +
    L('bl-splash', '<circle cx="10" cy="38.4" r=".6"/>', '--dx:21%'));

  window.CURSOR_ART = { brush, halo, hellfire: hell, blood };

  // Gradients shared by every copy of a cursor (terminal, previews, composer). They must not sit inside one of the
  // copies: a hidden cursor (display: none) would take them away from all the others.
  const v = (name) => `style="stop-color:var(${name})"`;
  const DEFS = `
    <linearGradient id="ca-bamboo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5626"/><stop offset=".3" stop-color="#ecce90"/><stop offset=".62" stop-color="#bf944f"/><stop offset="1" stop-color="#6c4a1e"/></linearGradient>
    <linearGradient id="ca-tuft" gradientUnits="userSpaceOnUse" x1="0" y1="15.6" x2="0" y2="30.2"><stop offset="0" stop-color="#fbf6e6"/><stop offset=".6" stop-color="#e6dcc4"/><stop offset="1" stop-color="#cfc4a8"/></linearGradient>
    <linearGradient id="ca-ink" gradientUnits="userSpaceOnUse" x1="0" y1="18.8" x2="0" y2="30.4"><stop offset="0" ${v('--ca-ink-a')}/><stop offset="1" ${v('--ca-ink-b')}/></linearGradient>
    <clipPath id="ca-tuft-clip"><path d="${TUFT}"/></clipPath>
    <radialGradient id="ca-h-glow" cx=".5" cy=".5" r=".5"><stop offset="0" style="stop-color:var(--ca-h-glow);stop-opacity:.5"/><stop offset=".5" style="stop-color:var(--ca-h-glow);stop-opacity:.1"/><stop offset="1" style="stop-color:var(--ca-h-glow);stop-opacity:0"/></radialGradient>
    <linearGradient id="ca-h-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" ${v('--ca-h-a')}/><stop offset=".5" ${v('--ca-h-b')}/><stop offset="1" ${v('--ca-h-c')}/></linearGradient>
    <linearGradient id="ca-h-ring" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-h-c')}/><stop offset=".5" ${v('--ca-h-b')}/><stop offset="1" ${v('--ca-h-c')}/></linearGradient>
    <linearGradient id="ca-h-wing" gradientUnits="userSpaceOnUse" x1="8.2" y1="0" x2="-1" y2="0"><stop offset="0" ${v('--ca-h-wr')}/><stop offset=".45" ${v('--ca-h-wt')}/><stop offset="1" ${v('--ca-h-wt')}/></linearGradient>
    <linearGradient id="ca-hf-o" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="-4"><stop offset="0" stop-color="#c8170c"/><stop offset=".4" stop-color="#980c07"/><stop offset=".76" stop-color="#5a0504" stop-opacity=".9"/><stop offset="1" stop-color="#2a0000" stop-opacity=".25"/></linearGradient>
    <linearGradient id="ca-hf-m" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="6"><stop offset="0" stop-color="#ff6a1c"/><stop offset=".5" stop-color="#f0310d"/><stop offset="1" stop-color="#ac0f06" stop-opacity=".75"/></linearGradient>
    <linearGradient id="ca-hf-i" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="14"><stop offset="0" stop-color="#fff3b4"/><stop offset=".4" stop-color="#ffc640"/><stop offset="1" stop-color="#ff6414" stop-opacity=".9"/></linearGradient>
    <linearGradient id="ca-hf-rod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e0b03"/><stop offset=".26" stop-color="#ff7e22"/><stop offset=".5" stop-color="#fff6d2"/><stop offset=".74" stop-color="#ff7e22"/><stop offset="1" stop-color="#5e0b03"/></linearGradient>
    <radialGradient id="ca-hf-glow" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#ff3a0e" stop-opacity=".46"/><stop offset=".6" stop-color="#d81c06" stop-opacity=".13"/><stop offset="1" stop-color="#c01000" stop-opacity="0"/></radialGradient>
    <linearGradient id="ca-bl" gradientUnits="userSpaceOnUse" x1="0" y1="-1" x2="0" y2="24"><stop offset="0" stop-color="#e8291e"/><stop offset=".4" stop-color="#c2140e"/><stop offset="1" stop-color="#8d0b08"/></linearGradient>
    <radialGradient id="ca-bl-drop" cx=".36" cy=".4" r=".7"><stop offset="0" stop-color="#ff6a5c"/><stop offset=".4" stop-color="#c8150f"/><stop offset="1" stop-color="#780707"/></radialGradient>`;
  const mount = () => {
    if (document.getElementById('ca-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="ca-defs" class="ca-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();

/*
 * Five more, drawn the same way (styles in the second half of fx/cursor-art.css): 등대 · 레이더 · 나침반 · 회오리 · 해파리.
 * The same 20 x 40 box, one layer per moving part, transform and opacity only; their gradients sit in a second hidden
 * <svg> (#ca-defs-b), mounted like the first. Three of them also reach out over the terminal around the caret, like
 * 십자선 and 스포트라이트 (.ca-reach): a lighthouse beam, a radar screen, gusts of wind. Those are drawn once and only
 * turned, scaled or faded, faint enough to read the text through, and they go when the terminal loses focus. Whatever
 * turns or scales is an <svg> whose fading is drawn into it (stepped slices, gradients): a CSS mask or clip-path on a
 * turning element made the renderer redraw it every frame (a quarter of a core for the lighthouse beam).
 */
(function () {
  const L = (cls, body, style) => `<svg class="cl ${cls}" viewBox="0 0 20 40" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ''}>${body}</svg>`;
  const G = (cls, inner, style) => `<span class="cl ${cls}"${style ? ` style="${style}"` : ''}>${inner}</span>`;
  const W = (cls, vb, body, par) => `<svg class="${cls}" viewBox="${vb}"${par ? ` preserveAspectRatio="${par}"` : ''} aria-hidden="true" focusable="false">${body}</svg>`; // a part over the terminal
  const box = (cls, inner) => `<span class="ca-box ${cls}">${inner}</span>`;
  const n2 = (v) => +v.toFixed(2);
  const at = (x, y) => `transform-origin:${n2(x * 5)}% ${n2(y * 2.5)}%`;
  const polar = (deg, r) => `${n2(Math.sin((deg * Math.PI) / 180) * r)} ${n2(-Math.cos((deg * Math.PI) / 180) * r)}`; // clockwise from up

  /* 등대: a striped lighthouse on a rock in the surf. The lamp turns: its beam swings out across the terminal, flashes
     when it faces you and dims as it passes behind; typing throws spray up against the rock. */
  const TOWER = 'M7.1 12.4H12.9L15.1 33.4H4.9Z';
  const WAVE = (y) => `M-3 ${y}Q-1 ${n2(y - 1.1)} 1 ${y}T5 ${y}T9 ${y}T13 ${y}T17 ${y}T21 ${y}T25 ${y}`;
  const lighthouse = box('ca-lh',
    L('lh-glow', '<ellipse cx="10" cy="8.9" rx="7.6" ry="6.6" fill="url(#ca-lh-glow)"/>') +
    `<span class="ca-reach lh-farw">${W('lh-far', '0 0 100 100', // the long beam over the terminal: three cones, brightest along the middle
      '<path d="M0 49.3L100 0V100L0 50.7Z" opacity=".4"/><path d="M0 49.5L100 18V82L0 50.5Z" opacity=".55"/><path d="M0 49.7L100 35V65L0 50.3Z" opacity=".7"/>', 'none')}</span>` +
    L('lh-sea lh-back', `<path d="${WAVE(37.2)}V40.6H-3Z"/>`) +
    L('lh-body', `
      <path class="lh-rock" d="M-.6 40.4L.3 37.6Q1.4 35.5 3.8 35.3L6 34.8Q8 34.2 10.2 34.6Q12.8 34 14.8 34.7L16.4 35.1Q18.8 35.4 19.8 37.6L20.8 40.4Z"/>
      <path class="lh-rockhi" d="M1.4 37Q2.8 36 4.6 36.1M12.4 35.3Q13.9 35 15.4 35.6"/>
      <rect class="lh-plinth" x="4.1" y="33" width="11.8" height="2.5" rx=".6" fill="url(#ca-lh-stone)"/>
      <path class="lh-white" d="${TOWER}"/>
      <g clip-path="url(#ca-lh-tower)">
        <path class="lh-red" d="M3 17.3Q10 18.7 17 17.3V22.7Q10 24.1 3 22.7Z"/>
        <path class="lh-red" d="M3 27.7Q10 29.1 17 27.7V34H3Z"/>
        <path d="${TOWER}" fill="url(#ca-lh-shade)"/>
      </g>
      <path class="lh-edge" d="${TOWER}"/>
      <path class="lh-win" d="M9.35 16.1V14.9A.65 .65 0 0 1 10.65 14.9V16.1Z"/>
      <path class="lh-lit" d="M9.35 26.5V25.3A.65 .65 0 0 1 10.65 25.3V26.5Z"/>
      <path class="lh-door" d="M8.9 33V31.4A1.1 1.1 0 0 1 11.1 31.4V33Z"/>
      <rect class="lh-gallery" x="5.3" y="11.2" width="9.4" height="1.5" rx=".35"/>
      <path class="lh-rail" d="M5.7 11.2V9.5H7.3M14.3 11.2V9.5H12.7M5.7 10.35H7.3M12.7 10.35H14.3"/>
      <rect x="7.3" y="6.6" width="5.4" height="4.7" fill="url(#ca-lh-glass)"/>
      <path class="lh-mull" d="M8.9 6.9V11.3M11.1 6.9V11.3"/>
      <path d="M6.4 6.9Q6.6 3.2 10 2.7Q13.4 3.2 13.6 6.9Z" fill="url(#ca-lh-roof)"/>
      <rect class="lh-eave" x="6" y="6.3" width="8" height="1" rx=".45"/>
      <path class="lh-spike" d="M10 2.8V.3"/>
      <circle class="lh-ball" cx="10" cy="2.3" r=".8"/>`) +
    L('lh-beam', '<path d="M10 8.1L43 3.4Q45.8 8.9 43 14.4L10 9.7Z" fill="url(#ca-lh-beam)"/><path d="M10 8.55L37 7.2Q38.2 8.9 37 10.6L10 9.25Z" fill="url(#ca-lh-core)"/>') +
    L('lh-flash', '<circle cx="10" cy="8.9" r="4.2" fill="url(#ca-lh-glow)"/><path d="M10 3Q10.55 8.35 16 8.9Q10.55 9.45 10 14.8Q9.45 9.45 4 8.9Q9.45 8.35 10 3Z"/>') +
    L('lh-sea lh-front', `<path d="${WAVE(38.5)}V40.6H-3Z"/><path class="lh-foam" d="${WAVE(38.5)}"/>`) +
    L('lh-spray', '<circle cx="2.6" cy="33.4" r=".75"/><circle cx="4.6" cy="31.6" r=".55"/><circle cx="1" cy="31.2" r=".45"/><circle cx="17.2" cy="33" r=".75"/><circle cx="18.8" cy="31" r=".5"/><circle cx="15.6" cy="30.8" r=".45"/>'));

  /* 레이더: a phosphor-green caret at the centre of a radar screen laid faintly over the terminal. The beam sweeps round,
     echoes light up as it passes over them and fade, and a ping ring spreads out from the caret. */
  const RD_T = 4.4; // one sweep (s); the ping goes out twice per sweep
  const blips = [[50, 0.56], [137, 0.82], [228, 0.4], [306, 0.72]].map(([a, d]) => {
    const r = (a * Math.PI) / 180;
    return `<span class="rd-blip" style="--x:${n2(Math.sin(r) * d)};--y:${n2(-Math.cos(r) * d)};animation-delay:${n2((a / 360) * RD_T - RD_T)}s"></span>`;
  }).join('');
  let trail = ''; // the beam and its afterglow: 24 slices of a 120-degree fan, fainter further behind the beam
  for (let i = 0, n = 24; i < n; i++) trail += `<path d="M0 0L${polar(-120 + (120 * i) / n, 100)}A100 100 0 0 1 ${polar(-120 + (120 * (i + 1)) / n, 100)}Z" fill-opacity="${n2(((i + 1) / n) ** 2.2)}"/>`;
  const radar = `<span class="ca-reach rd-wide"><span class="rd-rings"></span>${W('rd-sweep', '-100 -100 200 200', `${trail}<path class="rd-edge" d="M0 0V-100"/>`)}<span class="rd-ping"></span>${blips}</span>` +
    box('ca-rd',
      L('rd-glow', '<rect x="4.6" y=".4" width="10.8" height="39.2" rx="5.4" fill="url(#ca-rd-glow)"/>') +
      L('rd-bar', `<rect x="8.5" y="1.6" width="3" height="36.8" rx="1.5" fill="url(#ca-rd-bar)"/>
        <path class="rd-ticks" d="M6.4 6.4H7.6M6.4 13.2H7.6M6.4 26.8H7.6M6.4 33.6H7.6M12.4 6.4H13.6M12.4 13.2H13.6M12.4 26.8H13.6M12.4 33.6H13.6"/>`) +
      L('rd-ring', '<circle cx="10" cy="20" r="3.6"/>') +
      L('rd-dot', '<circle cx="10" cy="20" r="1.7"/>'));

  /* 나침반: a magnetised needle over a faint compass rose, trembling as it points north. Typing knocks it aside; when
     the typing stops it swings back and forth and settles. */
  const compass = box('ca-cp',
    L('cp-rose', `<circle class="cp-ring" cx="10" cy="20" r="8.6"/>
      <path class="cp-ticks" d="M10 11.4V13.2M10 26.8V28.6M1.4 20H3.2M16.8 20H18.6M3.9 13.9L5 15M16.1 13.9L15 15M3.9 26.1L5 25M16.1 26.1L15 25"/>
      <path class="cp-star" d="M10 13.4L11 19L16.6 20L11 21L10 26.6L9 21L3.4 20L9 19Z"/>`) +
    G('cp-swing',
      L('cp-needle', `<path class="cp-shadow" d="M10.8 1.8L13.7 20.8L10.8 39.8L7.9 20.8Z"/>
        <path d="M10 .8L7.1 20H10Z" fill="url(#ca-cp-nl)"/><path d="M10 .8L12.9 20H10Z" fill="url(#ca-cp-nr)"/>
        <path d="M10 39.2L7.1 20H10Z" fill="url(#ca-cp-sl)"/><path d="M10 39.2L12.9 20H10Z" fill="url(#ca-cp-sr)"/>
        <path class="cp-edge" d="M10 .8L12.9 20L10 39.2L7.1 20Z"/>`) +
      L('cp-glint', '<path transform="translate(10 4.4)" d="M0 -2.4Q.32 -.32 2.4 0Q.32 .32 0 2.4Q-.32 .32 -2.4 0Q-.32 -.32 0 -2.4Z"/>')) +
    L('cp-cap', '<circle cx="10" cy="20" r="2.3" fill="url(#ca-cp-brass)"/><circle class="cp-capring" cx="10" cy="20" r="2.3"/><circle class="cp-jewel" cx="10" cy="20" r=".8"/><circle class="cp-capglint" cx="9.2" cy="19.2" r=".5"/>'));

  /* 회오리: a twister hanging from a storm cloud down to the line. Its bands sway one after another like a rope, streaks
     run across its face as it turns, debris circles it, dust boils up where it touches down, and gusts sweep round the
     caret over the terminal. Typing bends it back. */
  const tnW = (y) => 2.2 + 15.6 * Math.pow(Math.max(0, 38.6 - y) / 35.6, 1.5); // the funnel's width at height y
  const ring = (y, w, s) => `${n2(10 - w)} ${n2(y)}Q10 ${n2(y + w * s)} ${n2(10 + w)} ${n2(y)}`; // a band's rim, seen from a little above
  let bands = '';
  [3, 7, 10, 11.5, 11, 9, 5.5, 2].forEach((sway, k) => { // sway: how far the band swings (% of the box), least at both ends
    const yt = 3 + k * 4.45, yb = k === 7 ? 38.8 : yt + 5.1, wt = tnW(yt) / 2, wb = tnW(yb) / 2;
    const slice = `<path d="M${ring(yt, wt, 0.34)}L${n2(10 + wb)} ${n2(yb)}Q10 ${n2(yb + wb * 0.34)} ${n2(10 - wb)} ${n2(yb)}Z"/><path class="tn-lip" d="M${ring(yt, wt, 0.34)}"/>`;
    const ym = (yt + yb) / 2, wm = tnW(ym) / 2;
    const streak = k > 0 && k < 7 ? L('tn-streak', `<path d="M${ring(ym + wm * 0.12, wm * 0.32, 0.5)}"/>`, `--s:${n2(wm * 3.6)}%;animation-delay:${n2(-k * 0.29)}s`) : '';
    bands += G('tn-band', L(`tn-slice tn-${k % 2 ? 'b' : 'a'}`, slice) + streak, `--a:${sway}%;animation-delay:${n2(-k * 0.21)}s`);
  });
  const bit = (y, d, t) => { const r = tnW(y) / 2 + 1.6; return L('tn-bit', `<path transform="translate(10 ${y})" d="M-.75 -.3L.6 -.5L.8 .3L-.55 .45Z"/>`, `${at(10, y)};--rx:${n2(r * 5)}%;--ry:${n2(r * 0.75)}%;animation-delay:${d}s;animation-duration:${t}s`); };
  let gustArc = ''; // a ring of wind: its head bright, the tail fading over 144 degrees behind it
  for (let j = 0, n = 12; j < n; j++) gustArc += `<path d="M${polar(6 + j * 12, 96)}A96 96 0 0 1 ${polar(18 + j * 12, 96)}" stroke-opacity="${n2((1 - j / n) ** 1.6)}"/>`;
  const tornado = `<span class="ca-reach tn-wide"><span class="tn-wsq">${[1, 2, 3].map((k) => W(`tn-gust tn-g${k}`, '-100 -100 200 200', gustArc)).join('')}</span></span>` +
    box('ca-tn',
      L('tn-dust', '<ellipse cx="10" cy="38.4" rx="3.4" ry="1.2"/>') +
      L('tn-dust', '<ellipse cx="10" cy="38.4" rx="3.4" ry="1.2"/>', 'animation-delay:-.7s') +
      G('tn-all',
        L('tn-base', '<ellipse cx="10" cy="38.7" rx="2.6" ry=".8"/>') +
        bands +
        L('tn-cloud', '<path d="M-3.4 6.4C-4.4 3.8 -2 1.6 .6 2.2C1.2 -.8 5.2 -2.2 7.6 -.2C9.4 -2.6 13.8 -2.4 15 .4C17.8 -.8 22.2 1.2 21.6 4.2C23.8 4.6 24.2 6.8 22.4 7.6C16 9 4 9 -3.4 6.4Z" fill="url(#ca-tn-cloud)"/><path class="tn-cloudhi" d="M-1.6 3.6Q-.4 2.4 1.2 2.8M5.4 .6Q7 -.8 8.8 .2M13 .2Q14.6 -.8 16.2 .6M19.4 3Q21 2.6 22 3.8"/><path class="tn-cloudlo" d="M.4 7.2Q10 8.6 19.6 7.2"/>') +
        bit(13, 0, 1.5) + bit(23.5, -0.6, 1.2) + bit(31, -0.3, 0.95)));

  /* 해파리: a glowing jellyfish. The bell squeezes and it rises, then it sinks slowly as the bell opens again, the
     tentacles trailing and drawing in; typing tilts it and sweeps the tentacles back. */
  const BELL = 'M2.4 15.2C2.2 7.8 5.4 2.6 10 2.6S17.8 7.8 17.6 15.2C16.7 16.2 15.6 15.6 14.6 16.1C13.5 16.7 12.6 15.9 11.6 16.4C10.9 16.8 10.5 16.4 10 16.4S9.1 16.8 8.4 16.4C7.4 15.9 6.5 16.7 5.4 16.1C4.4 15.6 3.3 16.2 2.4 15.2Z';
  const jellyfish = box('ca-jf',
    L('jf-glow', '<ellipse cx="10" cy="12.5" rx="11" ry="11.5" fill="url(#ca-jf-glow)"/>') +
    G('jf-swim', G('jf-tilt',
      G('jf-tents',
        L('jf-tent jf-tl', '<path d="M3.5 15.9C2.5 20 4.5 23.4 3.3 27.4C2.3 30.8 3.9 33.8 2.9 37.8"/><path d="M6.4 16.4C5.6 21 7.4 25 6.4 29.4C5.8 32.6 6.8 35.2 6.2 38.8"/>') +
        L('jf-tent jf-tr', '<path d="M13.6 16.4C14.4 21 12.6 25 13.6 29.4C14.2 32.6 13.2 35.2 13.8 38.8"/><path d="M16.5 15.9C17.5 20 15.5 23.4 16.7 27.4C17.7 30.8 16.1 33.8 17.1 37.8"/>') +
        L('jf-arms', '<path d="M8.3 16.3C7.1 19.6 9.5 22.4 8.1 25.8C7.3 27.8 8.5 29.8 7.7 32.2C8.7 31.2 9.5 29.4 9.2 27.4C9 25.4 10.2 23 9.9 20.4C9.8 19 9.5 17.6 9.9 16.5Z"/><path d="M11.7 16.3C12.9 19.4 10.7 21.8 11.9 24.8C12.6 26.6 11.7 28.4 12.3 30.4C11.4 29.6 10.7 28 10.9 26.2C11.1 24.4 10 22.2 10.2 19.8C10.3 18.6 10.5 17.4 10.1 16.5Z"/>')) +
      G('jf-bellw',
        L('jf-bell', `<path d="${BELL}" fill="url(#ca-jf-bell)"/>
          <path class="jf-sub" d="M3.9 14.7C5.1 12.6 7.3 11.8 10 11.8S14.9 12.6 16.1 14.7"/>
          <g class="jf-gon"><ellipse cx="8.3" cy="8.9" rx="1.7" ry="1.15" transform="rotate(-28 8.3 8.9)"/><ellipse cx="11.7" cy="8.9" rx="1.7" ry="1.15" transform="rotate(28 11.7 8.9)"/><ellipse cx="8.7" cy="10.9" rx="1.4" ry=".9" transform="rotate(18 8.7 10.9)"/><ellipse cx="11.3" cy="10.9" rx="1.4" ry=".9" transform="rotate(-18 11.3 10.9)"/></g>
          <path class="jf-hi" d="M4.6 8C5.3 5.4 7.4 3.8 9.6 3.7C7.8 4.7 6.3 6.2 5.7 8.4Z"/>
          <path class="jf-rim" d="${BELL}"/>`) +
        L('jf-dots', '<circle cx="3.3" cy="15.6" r=".5"/><circle cx="6" cy="16.3" r=".5"/><circle cx="8.6" cy="16.5" r=".45"/><circle cx="11.4" cy="16.5" r=".45"/><circle cx="14" cy="16.3" r=".5"/><circle cx="16.7" cy="15.6" r=".5"/>')))) +
    L('jf-mote', '<circle cx="4.2" cy="31" r=".5"/>') +
    L('jf-mote', '<circle cx="15.8" cy="34" r=".45"/>', 'animation-delay:-2.1s'));

  Object.assign(window.CURSOR_ART = window.CURSOR_ART || {}, { lighthouse, radar, compass, tornado, jellyfish });

  const v = (name, o) => `style="stop-color:var(${name})${o == null ? '' : `;stop-opacity:${o}`}"`;
  const DEFS = `
    <radialGradient id="ca-lh-glow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--ca-lh-light', 'var(--ca-lh-glow-o)')}/><stop offset=".45" ${v('--ca-lh-light', 'calc(var(--ca-lh-glow-o) * .3)')}/><stop offset="1" ${v('--ca-lh-light', 0)}/></radialGradient>
    <linearGradient id="ca-lh-beam" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="44" y2="0"><stop offset="0" ${v('--ca-lh-light', 'var(--ca-lh-beam-o)')}/><stop offset=".35" ${v('--ca-lh-light', 'calc(var(--ca-lh-beam-o) * .45)')}/><stop offset="1" ${v('--ca-lh-light', 0)}/></linearGradient>
    <linearGradient id="ca-lh-core" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="38" y2="0"><stop offset="0" ${v('--ca-lh-core', '.95')}/><stop offset=".5" ${v('--ca-lh-core', '.3')}/><stop offset="1" ${v('--ca-lh-core', 0)}/></linearGradient>
    <linearGradient id="ca-lh-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".3" stop-color="#fff" stop-opacity=".34"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".44"/></linearGradient>
    <radialGradient id="ca-lh-glass" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fffef2"/><stop offset=".45" stop-color="#ffe680"/><stop offset="1" stop-color="#e09a2c"/></radialGradient>
    <linearGradient id="ca-lh-roof" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8231c"/><stop offset=".35" stop-color="#ff6f5e"/><stop offset="1" stop-color="#7c1310"/></linearGradient>
    <linearGradient id="ca-lh-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d929c"/><stop offset=".35" stop-color="#c4c8cf"/><stop offset="1" stop-color="#5d626c"/></linearGradient>
    <clipPath id="ca-lh-tower"><path d="${TOWER}"/></clipPath>
    <linearGradient id="ca-lh-far" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-lh-farc', 'var(--ca-lh-far-o)')}/><stop offset=".22" ${v('--ca-lh-farc', 'calc(var(--ca-lh-far-o) * .45)')}/><stop offset=".55" ${v('--ca-lh-farc', 'calc(var(--ca-lh-far-o) * .15)')}/><stop offset="1" ${v('--ca-lh-farc', 0)}/></linearGradient>
    <radialGradient id="ca-rd-sw" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100"><stop offset=".03" ${v('--ca-rd-swc', 0)}/><stop offset=".14" ${v('--ca-rd-swc', 'var(--ca-rd-sw-o)')}/><stop offset=".6" ${v('--ca-rd-swc', 'var(--ca-rd-sw-o)')}/><stop offset="1" ${v('--ca-rd-swc', 0)}/></radialGradient>
    <linearGradient id="ca-rd-glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-rd', 0)}/><stop offset=".5" ${v('--ca-rd', 'var(--ca-rd-glow-o)')}/><stop offset="1" ${v('--ca-rd', 0)}/></linearGradient>
    <linearGradient id="ca-rd-bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-rd-dk')}/><stop offset=".45" ${v('--ca-rd-hi')}/><stop offset="1" ${v('--ca-rd-dk')}/></linearGradient>
    <linearGradient id="ca-cp-nl" gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="20"><stop offset="0" stop-color="#ff9a86"/><stop offset="1" stop-color="#e8382f"/></linearGradient>
    <linearGradient id="ca-cp-nr" gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="20"><stop offset="0" stop-color="#d42a24"/><stop offset="1" stop-color="#8a0c12"/></linearGradient>
    <linearGradient id="ca-cp-sl" gradientUnits="userSpaceOnUse" x1="0" y1="39" x2="0" y2="20"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d0d7e3"/></linearGradient>
    <linearGradient id="ca-cp-sr" gradientUnits="userSpaceOnUse" x1="0" y1="39" x2="0" y2="20"><stop offset="0" stop-color="#a9b3c4"/><stop offset="1" stop-color="#667187"/></linearGradient>
    <radialGradient id="ca-cp-brass" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#fff4c4"/><stop offset=".45" stop-color="#e0ad44"/><stop offset="1" stop-color="#7f5212"/></radialGradient>
    <linearGradient id="ca-tn-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-tn-a1')}/><stop offset=".42" ${v('--ca-tn-a2')}/><stop offset="1" ${v('--ca-tn-a3')}/></linearGradient>
    <linearGradient id="ca-tn-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" ${v('--ca-tn-b1')}/><stop offset=".42" ${v('--ca-tn-b2')}/><stop offset="1" ${v('--ca-tn-b3')}/></linearGradient>
    <linearGradient id="ca-tn-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" ${v('--ca-tn-c1')}/><stop offset="1" ${v('--ca-tn-c2')}/></linearGradient>
    <radialGradient id="ca-jf-bell" cx=".5" cy=".28" r=".75"><stop offset="0" ${v('--ca-jf-b1', '.3')}/><stop offset=".55" ${v('--ca-jf-b2', '.5')}/><stop offset="1" ${v('--ca-jf-b3', '.8')}/></radialGradient>
    <radialGradient id="ca-jf-glow" cx=".5" cy=".5" r=".5"><stop offset="0" ${v('--ca-jf-glow', 'var(--ca-jf-glow-o)')}/><stop offset=".55" ${v('--ca-jf-glow', 'calc(var(--ca-jf-glow-o) * .3)')}/><stop offset="1" ${v('--ca-jf-glow', 0)}/></radialGradient>`;
  const mount = () => {
    if (document.getElementById('ca-defs-b')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="ca-defs-b" class="ca-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
