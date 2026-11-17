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
