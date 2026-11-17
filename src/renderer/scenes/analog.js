'use strict';
/*
 * 아날로그 호러: a worn tape of a quiet street at night, played back behind the terminal. Scanlines, tape grain,
 * a tracking band rolling up the picture, colour bleeding off every edge. Now and then the tracking slips, and
 * when the picture settles something is different: a figure down the street is nearer, someone stands at the
 * lit window, a stand-by card looks back for a moment, the clock has gone back a few seconds.
 *
 * Nothing here flashes: a slip is a narrow band of displaced rows in a dark, low-contrast picture, about half a
 * second long and many seconds apart; the lights only ever fade.
 */
(function () {
  const K = window.SceneKit;
  const TAU = Math.PI * 2;

  // The on-screen display: a 5 × 7 dot font ('>' is the play triangle, '*' the record dot).
  const FONT = {
    0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '..#../.##../..#../..#../..#../..#../.###.', 2: '.###./#...#/....#/...#./..#../.#.../#####',
    3: '#####/...#./..#../...#./....#/#...#/.###.', 4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
    6: '..##./.#.../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
    9: '.###./#...#/#...#/.####/....#/...#./.##..', P: '####./#...#/#...#/####./#..../#..../#....', L: '#..../#..../#..../#..../#..../#..../#####',
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#', Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', S: '.####/#..../#..../.###./....#/....#/####.',
    R: '####./#...#/#...#/####./#.#../#..#./#...#', E: '#####/#..../#..../####./#..../#..../#####', C: '.###./#...#/#..../#..../#..../#...#/.###.',
    ':': '...../..#../..#../...../..#../..#../.....', '.': '...../...../...../...../...../.##../.##..', '-': '...../...../...../#####/...../...../.....',
  };
  function osdPath(c, text, x, y, px, right) {
    const adv = px * 6, ch = px * 1.15;
    let x0 = right ? x - text.length * adv + px : x;
    for (const chr of text) {
      if (chr === '>') { c.moveTo(x0 + px * 0.4, y + ch * 0.3); c.lineTo(x0 + px * 4.9, y + ch * 3.5); c.lineTo(x0 + px * 0.4, y + ch * 6.7); c.closePath(); }
      else if (chr === '*') { c.moveTo(x0 + px * 5, y + ch * 3.5); c.arc(x0 + px * 2.5, y + ch * 3.5, px * 2.5, 0, TAU); }
      else { const g = FONT[chr]; if (g) for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r * 6 + k] === '#') c.rect(x0 + k * px, y + r * ch, px * 1.03, ch * 1.03); }
      x0 += adv;
    }
  }
  /** Text in the display's font, its colours a little out of register. */
  function osd(c, text, x, y, px, right, L, a, bleed = 0.34) {
    const pass = (dx, style) => { c.fillStyle = style; c.beginPath(); osdPath(c, text, x + dx, y, px, right); c.fill(); };
    pass(-px * bleed, `rgba(255,70,96,${a * (L ? 0.36 : 0.5)})`); pass(px * bleed, `rgba(40,200,240,${a * (L ? 0.36 : 0.5)})`);
    pass(0, L ? `rgba(46,49,56,${a})` : `rgba(230,238,232,${a})`);
  }
  const two = (n) => String(n).padStart(2, '0');

  /** Tape grain: sparse specks, redrawn at a new offset every other frame. */
  function grain(L) {
    const key = `anaGrain${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const c = K.mk(128, 128), x = c.getContext('2d'), img = x.createImageData(128, 128), d = img.data, R = K.rng(77), v = L ? [46, 49, 56] : [236, 240, 236];
    for (let i = 0; i < d.length; i += 4) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = R() < 0.42 ? R() * R() * 255 : 0; }
    x.putImageData(img, 0, 0);
    K.cache.set(key, c);
    return c;
  }

  /** A closed polygon added to the current path, always wound the same way (so overlapping parts never cancel). */
  function poly(c, pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; area += x0 * y1 - x1 * y0; }
    const p = area < 0 ? pts.slice().reverse() : pts;
    c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
    c.closePath();
  }
  /** The one who stands there: narrow, the arms too long, the head a little to one side. Feet at (x, y). */
  function figurePath(c, x, y, h, tilt) {
    poly(c, [[x - h * 0.062, y - h * 0.5], [x - h * 0.012, y - h * 0.5], [x - h * 0.014, y], [x - h * 0.06, y]]);
    poly(c, [[x + h * 0.012, y - h * 0.5], [x + h * 0.062, y - h * 0.5], [x + h * 0.06, y], [x + h * 0.014, y]]);
    poly(c, [[x - h * 0.1, y - h * 0.84], [x + h * 0.1, y - h * 0.84], [x + h * 0.066, y - h * 0.47], [x - h * 0.066, y - h * 0.47]]);
    for (const d of [-1, 1]) poly(c, [[x + d * h * 0.082, y - h * 0.84], [x + d * h * 0.128, y - h * 0.8], [x + d * h * 0.122, y - h * 0.29], [x + d * h * 0.098, y - h * 0.29], [x + d * h * 0.09, y - h * 0.76]]);
    const nx = Math.sin(tilt) * h * 0.1, ny = -Math.cos(tilt) * h * 0.1;
    poly(c, [[x - h * 0.022, y - h * 0.83], [x + h * 0.022, y - h * 0.83], [x + nx + h * 0.018, y - h * 0.86 + ny], [x + nx - h * 0.018, y - h * 0.86 + ny]]);
    c.moveTo(x + nx + h * 0.05 * Math.cos(tilt), y - h * 0.87 + ny + h * 0.05 * Math.sin(tilt));
    c.ellipse(x + nx, y - h * 0.87 + ny, h * 0.05, h * 0.066, tilt, 0, TAU);
    return [x + nx, y - h * 0.875 + ny]; // where the face is
  }

  function build(bg, V) {
    const { W, H, u } = V, L = K.light(), R = K.rng(1996);
    const rgb = L ? '46,49,56' : '6,7,9', ink = `rgb(${rgb})`;
    // The picture is kept at two thirds of screen resolution: tape is soft, whatever it is shown on.
    const lay = (s) => { const c = K.mk(W * s, H * s), x = c.getContext('2d'); x.scale(c.width / W, c.height / H); x.lineCap = 'round'; x.lineJoin = 'round'; x.fillStyle = ink; x.strokeStyle = ink; return [c, x]; };
    const [far, f] = lay(0.66), [mid, m] = lay(0.66);
    const gy = H * 0.76;

    // far: the trees and roofs of the next street, a relay mast on the horizon
    K.fillRidge(f, K.ridge(R, 128, 0.72), -10, W + 10, gy + 2, u * 0.062, H + 2);
    for (let i = 0; i < 6; i++) {
      const x = W * (0.03 + i * 0.165 + R() * 0.06), bw = u * (0.05 + R() * 0.035), bh = u * (0.03 + R() * 0.022);
      f.fillRect(x, gy - bh, bw, bh + 4);
      f.beginPath(); f.moveTo(x - bw * 0.08, gy - bh + 1); f.lineTo(x + bw / 2, gy - bh - bw * 0.3); f.lineTo(x + bw * 1.08, gy - bh + 1); f.closePath(); f.fill();
    }
    const tx = W * 0.955, tt = gy - u * 0.4, tw = (k) => u * (0.03 * (1 - k) + 0.002);
    f.lineWidth = Math.max(1, u * 0.0028);
    f.beginPath(); f.moveTo(tx - tw(0), gy); f.lineTo(tx - tw(1), tt); f.moveTo(tx + tw(0), gy); f.lineTo(tx + tw(1), tt); f.stroke();
    f.lineWidth = Math.max(0.8, u * 0.0015);
    for (let k = 0; k < 10; k++) {
      const y0 = gy - (gy - tt) * (k / 10), y1 = gy - (gy - tt) * ((k + 1) / 10), w0 = tw(k / 10), w1 = tw((k + 1) / 10);
      f.beginPath(); f.moveTo(tx - w0, y0); f.lineTo(tx + w1, y1); f.moveTo(tx + w0, y0); f.lineTo(tx - w1, y1); f.moveTo(tx - w1, y1); f.lineTo(tx + w1, y1); f.stroke();
    }
    f.fillRect(tx - Math.max(0.6, u * 0.0012), tt - u * 0.035, Math.max(1.2, u * 0.0024), u * 0.036);

    // mid: the street. The ground is darkest along the kerb and thins toward the bottom of the frame.
    const gg = m.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, ink); gg.addColorStop(1, `rgba(${rgb},0.5)`);
    m.fillStyle = gg; m.fillRect(-10, gy, W + 20, H - gy + 4); m.fillStyle = ink;

    // the house: two storeys under a front gable, a chimney, a garage wing, a hedge along the front
    const hx = W * 0.64, bw = u * 0.15, top = gy - u * 0.2;
    m.fillRect(hx - bw, top, bw * 2, u * 0.2 + 2);
    m.beginPath(); m.moveTo(hx - bw - u * 0.022, top + 1); m.lineTo(hx, top - u * 0.125); m.lineTo(hx + bw + u * 0.022, top + 1); m.closePath(); m.fill();
    m.fillRect(hx + u * 0.075, top - u * 0.115, u * 0.024, u * 0.09); m.fillRect(hx + u * 0.071, top - u * 0.121, u * 0.032, u * 0.009);
    m.fillRect(hx + bw - 1, gy - u * 0.1, u * 0.155, u * 0.1 + 2);
    m.beginPath(); m.moveTo(hx + bw - u * 0.01, gy - u * 0.1 + 1); m.lineTo(hx + bw + u * 0.03, gy - u * 0.137); m.lineTo(hx + bw + u * 0.135, gy - u * 0.137); m.lineTo(hx + bw + u * 0.172, gy - u * 0.1 + 1); m.closePath(); m.fill();
    for (let i = 0; i < 9; i++) { m.beginPath(); m.arc(hx - bw + u * (0.012 + i * 0.034) + R() * u * 0.01, gy + 1, u * (0.016 + R() * 0.012), Math.PI, 0); m.fill(); }

    // a tree behind the garage, a fence running off to the right
    const trx = hx + bw + u * 0.1;
    m.beginPath(); m.moveTo(trx - u * 0.016, gy + 2); m.lineTo(trx - u * 0.009, gy - u * 0.13); m.lineTo(trx + u * 0.009, gy - u * 0.13); m.lineTo(trx + u * 0.016, gy + 2); m.closePath(); m.fill();
    for (let i = 0; i < 12; i++) { const a = R() * TAU, d = R() * u * 0.07; m.beginPath(); m.arc(trx + Math.cos(a) * d * 1.1, gy - u * 0.235 + Math.sin(a) * d * 0.8, u * (0.03 + R() * 0.03), 0, TAU); m.fill(); }
    for (let x = hx + bw + u * 0.165; x < W + 10; x += u * 0.015) { m.beginPath(); m.moveTo(x, gy + 1); m.lineTo(x, gy - u * 0.036); m.lineTo(x + u * 0.0045, gy - u * 0.044); m.lineTo(x + u * 0.009, gy - u * 0.036); m.lineTo(x + u * 0.009, gy + 1); m.closePath(); m.fill(); }
    m.fillRect(hx + bw + u * 0.16, gy - u * 0.026, W, u * 0.005);

    // a pole carrying the lines on down the street, with a drop to the house
    const ux = W * 0.065, ut = gy - u * 0.47;
    m.fillRect(ux - u * 0.006, ut, u * 0.012, gy - ut + u * 0.03);
    m.fillRect(ux - u * 0.052, ut + u * 0.02, u * 0.104, u * 0.008); m.fillRect(ux - u * 0.036, ut + u * 0.05, u * 0.072, u * 0.006);
    for (const d of [-0.045, 0, 0.045]) m.fillRect(ux + u * d - u * 0.003, ut + u * 0.008, u * 0.006, u * 0.014);
    m.lineWidth = Math.max(1, u * 0.0017);
    for (const [d, sag] of [[-0.045, 0.05], [0, 0.058], [0.045, 0.066]]) {
      m.beginPath(); m.moveTo(ux + u * d, ut + u * 0.012); m.quadraticCurveTo((ux + W) / 2, ut + u * (0.03 + sag * 2), W + 20, ut + u * (0.05 + sag * 0.4)); m.stroke();
      m.beginPath(); m.moveTo(ux + u * d, ut + u * 0.012); m.quadraticCurveTo(ux - u * 0.1, ut + u * 0.045, -20, ut + u * 0.03); m.stroke();
    }
    m.beginPath(); m.moveTo(ux, ut + u * 0.054); m.quadraticCurveTo((ux + hx) / 2, top - u * 0.02, hx - u * 0.012, top - u * 0.114); m.stroke();

    // the street lamp
    const sx = W * 0.3, lx = sx + u * 0.075, ly = gy - u * 0.376;
    m.lineWidth = Math.max(1.5, u * 0.008);
    m.beginPath(); m.moveTo(sx, gy + u * 0.045); m.lineTo(sx, gy - u * 0.34); m.quadraticCurveTo(sx, gy - u * 0.39, sx + u * 0.045, gy - u * 0.39); m.lineTo(lx - u * 0.012, gy - u * 0.388); m.stroke();
    m.beginPath(); m.ellipse(lx, ly - u * 0.009, u * 0.023, u * 0.008, 0, 0, TAU); m.fill();
    m.fillRect(sx - u * 0.009, gy + u * 0.02, u * 0.018, u * 0.03);

    // cut into the ink: pavement and kerb, the line down the road, dark panes, the doors
    const win = { x: hx - u * 0.075, y: gy - u * 0.15, w: u * 0.052, h: u * 0.062 };
    const panes = [[hx + u * 0.075, gy - u * 0.15, u * 0.052, u * 0.062], [hx + u * 0.07, gy - u * 0.058, u * 0.078, u * 0.052]];
    m.save(); m.globalCompositeOperation = 'destination-out'; m.lineCap = 'butt';
    m.strokeStyle = 'rgba(0,0,0,0.34)'; m.lineWidth = Math.max(0.9, u * 0.002);
    for (const dy of [0.022, 0.058, 0.066]) { m.beginPath(); m.moveTo(-10, gy + u * dy); m.lineTo(W + 10, gy + u * dy); m.stroke(); }
    m.setLineDash([u * 0.075, u * 0.06]); m.lineWidth = Math.max(1.2, u * 0.005);
    m.beginPath(); m.moveTo(-10, gy + u * 0.165); m.lineTo(W + 10, gy + u * 0.165); m.stroke(); m.setLineDash([]);
    m.fillStyle = 'rgba(0,0,0,0.26)';
    for (const [px, py, pw, ph] of panes) m.fillRect(px - pw / 2, py - ph / 2, pw, ph);
    m.beginPath(); m.arc(hx, top - u * 0.052, u * 0.015, 0, TAU); m.fill();
    m.strokeStyle = 'rgba(0,0,0,0.3)'; m.lineWidth = Math.max(0.9, u * 0.002);
    m.strokeRect(hx - u * 0.1, gy - u * 0.088, u * 0.042, u * 0.088);
    m.strokeRect(hx + bw + u * 0.02, gy - u * 0.076, u * 0.115, u * 0.076);
    for (const k of [0.25, 0.5, 0.75]) { m.beginPath(); m.moveTo(hx + bw + u * 0.02, gy - u * 0.076 * k); m.lineTo(hx + bw + u * 0.135, gy - u * 0.076 * k); m.stroke(); }
    m.restore();
    m.fillStyle = ink; // glazing bars back in
    for (const [px, py, pw, ph] of panes) { m.fillRect(px - u * 0.0018, py - ph / 2, u * 0.0036, ph); m.fillRect(px - pw / 2, py - u * 0.0018, pw, u * 0.0036); }

    // colour bleeding off every edge: the mid picture again, red and cyan, at a third of the resolution
    const ghost = (col) => { const c = K.mk(W * 0.33, H * 0.33), x = c.getContext('2d'); x.drawImage(mid, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };
    const gR = ghost(L ? '#e23c5c' : '#ff3c64'), gC = ghost(L ? '#1e96c8' : '#28c8f0');

    // the last place it stands: right in front of the lens, out of focus
    const cs = u * 0.56, close = K.mk(cs * 0.5, cs * 0.5), cx = close.getContext('2d'), ck = close.width / cs;
    cx.filter = `blur(${Math.max(1, cs * 0.018 * ck).toFixed(1)}px)`; cx.scale(ck, ck); cx.fillStyle = ink;
    cx.beginPath(); cx.ellipse(cs * 0.47, cs * 0.33, cs * 0.125, cs * 0.17, 0.16, 0, TAU); cx.fill();
    cx.beginPath(); cx.moveTo(cs * 0.4, cs * 0.44); cx.lineTo(cs * 0.53, cs * 0.44); cx.lineTo(cs * 0.56, cs * 0.62); cx.lineTo(cs * 0.36, cs * 0.62); cx.closePath(); cx.fill();
    cx.beginPath(); cx.moveTo(cs * 0.07, cs * 1.1); cx.bezierCurveTo(cs * 0.09, cs * 0.7, cs * 0.28, cs * 0.57, cs * 0.46, cs * 0.57); cx.bezierCurveTo(cs * 0.68, cs * 0.57, cs * 0.89, cs * 0.7, cs * 0.93, cs * 1.1); cx.closePath(); cx.fill();

    const rim = K.mk(close.width, close.height), rx = rim.getContext('2d'); // what the lamp behind it catches: the top edges
    rx.drawImage(close, 0, 0); rx.globalCompositeOperation = 'destination-out'; rx.drawImage(close, 0, close.height * 0.018);
    rx.globalCompositeOperation = 'source-in'; rx.fillStyle = L ? '#c89632' : '#eeeab0'; rx.fillRect(0, 0, rim.width, rim.height);

    const cw = Math.min(W * 0.44, H * 0.54 * (4 / 3)), chh = cw * 0.75;
    return {
      far, mid, gR, gC, close, rim, cs, closeAt: [lx + u * 0.03 - cs * 0.47, gy - u * 0.1 - cs * 0.33], gy, hx, win, lamp: [lx, ly], porch: [hx - u * 0.05, gy - u * 0.098], beacon: [tx, tt - u * 0.035],
      card: { x: (W - cw) / 2, y: H * 0.47 - chh / 2, w: cw, h: chh },
      // where it stands, each time nearer: down the street, on the pavement, under the lamp, in the yard
      spots: [[W * 0.118, gy + u * 0.004, u * 0.036, 0.1], [W * 0.205, gy + u * 0.03, u * 0.078, -0.12], [lx + u * 0.035, gy + u * 0.052, u * 0.135, 0.16], [hx - u * 0.228, gy + u * 0.024, u * 0.152, -0.2]],
    };
  }

  /** The tracking slips: decide what will be different once the picture settles, and which rows tear. */
  function slip(st, S, V) {
    const { H, u } = V, r = Math.random();
    const what = st.force || (st.card > 0 ? 'uncard'
      : st.stage === 4 ? 'step'
      : st.stage >= 0 ? (r < 0.7 ? 'step' : r < 0.85 ? 'clock' : 'none')
      : st.win ? 'unwin'
      : r < 0.3 ? 'step' : r < 0.46 ? 'win' : r < 0.57 ? 'card' : r < 0.8 ? 'clock' : 'none');
    st.force = '';
    let y0, y1;
    if (what === 'step') { const big = st.stage >= 3; y0 = big ? H * 0.4 : S.gy - u * 0.2; y1 = big ? H : S.gy + u * 0.08; }
    else if (what === 'win' || what === 'unwin') { y0 = S.win.y - u * 0.075; y1 = S.win.y + u * 0.075; }
    else if (what === 'card' || what === 'uncard') { y0 = S.card.y; y1 = S.card.y + S.card.h; }
    else if (what === 'clock') { y0 = H - u * 0.14; y1 = H; }
    else { const hh = H * (0.08 + Math.random() * 0.1); y0 = Math.random() * (H - hh); y1 = y0 + hh; }
    st.gl = { f: 0, dur: 14, what, y0, y1, rows: null };
    st.next = 320 + Math.random() * 420;
  }
  function change(st, what) {
    if (what === 'step') {
      if (st.stage === 3) st.stage = Math.random() < 0.45 ? 4 : -1;
      else if (st.stage === 4) { st.stage = -1; if (Math.random() < 0.6) st.rec = 260; }
      else st.stage++;
      if (st.stage === 4) st.next = 90 + Math.random() * 60; // it does not stay
    } else if (what === 'win') st.win = true;
    else if (what === 'unwin') st.win = false;
    else if (what === 'card') st.card = 44;
    else if (what === 'uncard') st.card = 0;
    else if (what === 'clock') st.clock -= 6 + ((Math.random() * 14) | 0);
  }

  window.drawAnalog = function (bg, ctx, w, h, t) {
    const V = K.view(w, h, 0.62, 1.6), { W, H, u } = V, L = K.light();
    const S = K.scene(bg, V, () => build(bg, V));
    let st = bg.st;
    if (!st || st.kind !== 'analog' || st.key !== S.key) st = bg.st = { kind: 'analog', key: S.key, t0: t, stage: -1, win: false, card: 0, rec: 0, gl: null, next: 240 + Math.random() * 300, clock: 0, force: '', ox: 0, oy: 0, scan: null };
    const { gy } = S, rgb = L ? '46,49,56' : '6,7,9', inkA = (a) => `rgba(${rgb},${a})`, pale = (a) => (L ? `rgba(46,49,56,${a})` : `rgba(226,234,230,${a})`);

    // the tracking slips now and then; half-way through, something is different
    if (!V.pv) {
      if (st.gl) { const g = st.gl; if (++g.f === (g.dur >> 1)) change(st, g.what); if (g.f >= g.dur) st.gl = null; }
      else if (--st.next <= 0) slip(st, S, V);
      if (st.card > 1) st.card--; else if (st.card === 1 && !st.gl) { st.force = 'uncard'; slip(st, S, V); }
      if (st.rec > 0) st.rec--;
    }
    const g = st.gl, env = g ? Math.sin((Math.PI * (g.f + 0.5)) / g.dur) : 0, sag = 1 - 0.7 * env; // the lights sag while it slips
    const secs = Math.max(0, Math.floor((t - st.t0) / 30) + st.clock);

    /** The picture on the tape, between rows y0 and y1 (what cannot reach them is skipped). */
    const la = sag * (0.94 + 0.06 * Math.sin(t * 0.13) * Math.sin(t * 0.031)); // the lamp, never quite steady
    const picture = (y0, y1) => {
      const hit = (cy, r) => cy + r > y0 && cy - r < y1;
      if (!L) K.glow(ctx, W * 0.5, gy, W * 0.75, [[0, 'rgba(150,172,178,0.1)'], [1, 'rgba(150,172,178,0)']], 1, (H * 0.42) / (W * 0.75));
      K.put(ctx, S.far, W, H, L ? 0.13 : 0.36);
      if (hit(S.beacon[1], u * 0.02)) K.glow(ctx, S.beacon[0], S.beacon[1], u * 0.016, [[0, `rgba(255,60,50,${(L ? 0.7 : 0.75) * (0.5 + 0.5 * Math.sin(t * 0.085))})`], [1, 'rgba(255,60,50,0)']]);
      ctx.globalAlpha = L ? 0.13 : 0.2; // colour out of register on both sides of every edge
      ctx.drawImage(S.gR, u * 0.0055, 0, W, H); ctx.drawImage(S.gC, -u * 0.0045, 0, W, H);
      ctx.globalAlpha = 1;
      K.put(ctx, S.mid, W, H, L ? 0.3 : 0.74);

      // the lit window upstairs, and whoever stands in it
      const wn = S.win;
      if (hit(wn.y, wn.w * 2.4)) {
        const wa = (0.88 + 0.07 * Math.sin(t * 0.021)) * (0.5 + 0.5 * sag);
        ctx.fillStyle = `rgba(255,92,60,${0.22 * wa})`; ctx.fillRect(wn.x - wn.w / 2 + u * 0.007, wn.y - wn.h / 2, wn.w, wn.h); // its warmth smears to the right
        ctx.fillStyle = L ? `rgba(222,150,64,${0.78 * wa})` : `rgba(255,214,146,${0.84 * wa})`; ctx.fillRect(wn.x - wn.w / 2, wn.y - wn.h / 2, wn.w, wn.h);
        if (st.win) {
          ctx.save(); ctx.beginPath(); ctx.rect(wn.x - wn.w / 2, wn.y - wn.h / 2, wn.w, wn.h); ctx.clip();
          ctx.fillStyle = inkA(L ? 0.62 : 0.9); ctx.beginPath();
          ctx.ellipse(wn.x + wn.w * 0.06, wn.y - wn.h * 0.02, wn.w * 0.15, wn.h * 0.18, 0.12, 0, TAU);
          poly(ctx, [[wn.x - wn.w * 0.3, wn.y + wn.h * 0.52], [wn.x - wn.w * 0.24, wn.y + wn.h * 0.24], [wn.x - wn.w * 0.02, wn.y + wn.h * 0.15], [wn.x + wn.w * 0.14, wn.y + wn.h * 0.15], [wn.x + wn.w * 0.36, wn.y + wn.h * 0.24], [wn.x + wn.w * 0.42, wn.y + wn.h * 0.52]]);
          ctx.fill(); ctx.restore();
        }
        ctx.fillStyle = inkA(L ? 0.5 : 0.8); ctx.fillRect(wn.x - u * 0.0018, wn.y - wn.h / 2, u * 0.0036, wn.h); ctx.fillRect(wn.x - wn.w / 2, wn.y - u * 0.0018, wn.w, u * 0.0036);
        K.glow(ctx, wn.x, wn.y, wn.w * 2.4, [[0, `rgba(255,196,120,${(L ? 0.1 : 0.15) * wa})`], [1, 'rgba(255,196,120,0)']]);
      }
      if (hit(S.porch[1], u * 0.06)) K.glow(ctx, S.porch[0], S.porch[1], u * 0.055, [[0, `rgba(255,214,150,${(L ? 0.5 : 0.55) * sag})`], [0.16, `rgba(255,190,120,${(L ? 0.2 : 0.2) * sag})`], [1, 'rgba(255,190,120,0)']]);

      // the street lamp: its head, the beam in the damp air, the pool on the pavement
      const [lx, ly] = S.lamp, py = gy + u * 0.052, lc = L ? '228,184,90' : '238,234,176';
      if (hit((ly + py) / 2, (py - ly) / 2 + u * 0.05)) {
        const lg = ctx.createLinearGradient(0, ly, 0, py);
        lg.addColorStop(0, `rgba(${lc},${0.034 * la})`); lg.addColorStop(1, `rgba(${lc},${0.012 * la})`);
        ctx.fillStyle = lg;
        for (let i = 0; i < 6; i++) { const k = 1 - i * 0.15; ctx.beginPath(); ctx.moveTo(lx - u * 0.012 * k, ly); ctx.lineTo(lx + u * 0.012 * k, ly); ctx.lineTo(lx + u * 0.13 * k, py); ctx.lineTo(lx - u * 0.13 * k, py); ctx.closePath(); ctx.fill(); } // soft-edged
        K.glow(ctx, lx, py, u * 0.16, [[0, `rgba(${lc},${0.2 * la})`], [0.6, `rgba(${lc},${0.08 * la})`], [1, `rgba(${lc},0)`]], 1, 0.24);
        ctx.fillStyle = `rgba(255,92,60,${0.2 * la})`; ctx.beginPath(); ctx.ellipse(lx + u * 0.008, ly, u * 0.02, u * 0.006, 0, 0, TAU); ctx.fill();
        K.glow(ctx, lx, ly, u * 0.04, [[0, `rgba(255,248,214,${0.9 * la})`], [0.25, `rgba(${lc},${0.34 * la})`], [1, `rgba(${lc},0)`]]);
      }

      // the one who stands there
      if (st.stage >= 0 && st.stage < 4) {
        const [fx, fy, fh, tilt] = S.spots[st.stage];
        if (hit(fy - fh / 2, fh)) {
          const body = (dx) => { ctx.beginPath(); const at = figurePath(ctx, fx + dx, fy, fh, tilt); ctx.fill(); return at; };
          ctx.fillStyle = `rgba(255,60,100,${L ? 0.2 : 0.3})`; body(fh * 0.035);
          ctx.fillStyle = `rgba(40,200,240,${L ? 0.16 : 0.24})`; body(-fh * 0.03);
          ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; body(0); ctx.restore(); // it hides what is behind it
          ctx.fillStyle = inkA(L ? 0.52 : 0.88); const [ex, ey] = body(0);
          if (st.stage > 0) { // two points where the eyes are
            const er = Math.max(0.7, fh * 0.011);
            if (L) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; } else ctx.fillStyle = 'rgba(236,240,222,0.8)';
            ctx.beginPath(); ctx.arc(ex - fh * 0.02, ey, er, 0, TAU); ctx.arc(ex + fh * 0.02, ey, er, 0, TAU); ctx.fill();
            if (L) ctx.restore();
          }
        }
      } else if (st.stage === 4 && hit(S.closeAt[1] + S.cs / 2, S.cs / 2)) { // right in front of the lens, between it and the lamp
        K.stamp(ctx, S.close, S.closeAt[0], S.closeAt[1], S.cs, S.cs, L ? 0.34 : 0.8);
        ctx.globalAlpha = (L ? 0.32 : 0.3) * la; ctx.drawImage(S.rim, S.closeAt[0], S.closeAt[1], S.cs, S.cs); ctx.globalAlpha = 1;
      }

      // the recording's own clock, burnt into the picture
      if (!V.pv && hit(H - u * 0.07, u * 0.07)) {
        const tm = 11220 + secs, px = Math.max(1, u * 0.0036), mg = u * 0.04;
        osd(ctx, `${two(Math.floor(tm / 3600) % 24)}:${two(Math.floor(tm / 60) % 60)}:${two(tm % 60)}`, W - mg, H - mg - px * 18.5, px, true, L, L ? 0.42 : 0.4, 0.5);
        osd(ctx, '1996.10.13', W - mg, H - mg - px * 8.05, px, true, L, L ? 0.42 : 0.4, 0.5);
      }

      // the stand-by card that comes up instead of the picture, and who is on it
      if (st.card > 0 && hit(S.card.y + S.card.h / 2, S.card.h / 2)) {
        const c = S.card, bwid = c.w / 7, bh = c.h * 0.7, ccx = c.x + c.w / 2, ccy = c.y + c.h * 0.44, cr = c.h * 0.3;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, u * 0.012); ctx.clip();
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.globalCompositeOperation = 'source-over';
        [[236, 236, 236], [232, 226, 70], [70, 226, 232], [70, 222, 90], [226, 80, 226], [228, 76, 70], [70, 80, 226]].forEach(([r, gg, b], i) => { ctx.fillStyle = `rgba(${r},${gg},${b},${L ? 0.17 : 0.11})`; ctx.fillRect(c.x + i * bwid, c.y, bwid + 0.5, bh); });
        for (let i = 0; i < 7; i++) { ctx.fillStyle = pale(0.02 + 0.02 * ((i * 3) % 7)); ctx.fillRect(c.x + i * bwid, c.y + bh, bwid + 0.5, c.h - bh); }
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = pale(L ? 0.05 : 0.07); ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.clip();
        ctx.fillStyle = inkA(L ? 0.5 : 0.86); ctx.beginPath();
        ctx.ellipse(ccx + cr * 0.03, ccy - cr * 0.1, cr * 0.25, cr * 0.33, 0.14, 0, TAU);
        poly(ctx, [[ccx - cr * 0.08, ccy + cr * 0.14], [ccx + cr * 0.14, ccy + cr * 0.14], [ccx + cr * 0.17, ccy + cr * 0.36], [ccx - cr * 0.13, ccy + cr * 0.36]]);
        poly(ctx, [[ccx - cr * 1.1, ccy + cr * 1.1], [ccx - cr * 0.84, ccy + cr * 0.52], [ccx - cr * 0.3, ccy + cr * 0.33], [ccx + cr * 0.3, ccy + cr * 0.33], [ccx + cr * 0.84, ccy + cr * 0.52], [ccx + cr * 1.1, ccy + cr * 1.1]]);
        ctx.fill();
        if (L) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; } else ctx.fillStyle = 'rgba(236,240,222,0.8)';
        ctx.beginPath(); ctx.arc(ccx - cr * 0.07, ccy - cr * 0.12, cr * 0.035, 0, TAU); ctx.arc(ccx + cr * 0.14, ccy - cr * 0.1, cr * 0.035, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = pale(0.36); ctx.lineWidth = Math.max(1, u * 0.002);
        ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.moveTo(c.x, ccy); ctx.lineTo(ccx - cr, ccy); ctx.moveTo(ccx + cr, ccy); ctx.lineTo(c.x + c.w, ccy); ctx.stroke();
        ctx.lineWidth = Math.max(1.5, u * 0.004); ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, u * 0.012); ctx.stroke();
        osd(ctx, '03', c.x + c.w - u * 0.02, c.y + c.h - u * 0.012 - Math.max(1, u * 0.004) * 8.05, Math.max(1, u * 0.004), true, L, 0.5);
        ctx.restore();
      }
    };

    ctx.save(); ctx.translate(0, -V.oy);
    picture(-1e9, 1e9);

    // rows drawn again out of place: the band that rolls up the picture, the bottom edge where the heads switch,
    // and, while the tracking slips, the torn rows themselves
    const rows = [];
    if (!V.pv) {
      const bh = H * 0.07, by = H + bh - ((t * (H / 520)) % (H + bh * 2));
      [[0, 0.3, 0.5], [0.3, 0.72, 1.5], [0.72, 1, 0.8]].forEach(([a, b, k]) => rows.push([by + bh * a, bh * (b - a), u * 0.0055 * k * (1 + 0.3 * Math.sin(t * 0.37 + k))]));
      const hs = Math.max(4, H * 0.02);
      rows.push([H - hs, hs * 0.5, u * (0.012 + 0.004 * Math.sin(t * 0.7))], [H - hs * 0.5, hs * 0.5, u * (0.026 + 0.006 * Math.sin(t * 0.9))]);
      if (g) {
        if (!g.rows || g.f % 2 === 0) { g.rows = []; for (let y = g.y0; y < g.y1;) { const hh = 3 + Math.random() * 11; g.rows.push([y, Math.min(hh, g.y1 - y), (Math.random() - 0.5) * 2]); y += hh; } }
        for (const [y, hh, k] of g.rows) rows.push([y, hh, k * u * 0.045 * env]);
      }
      for (const [y, hh, dx] of rows) {
        if (y > H || y + hh < 0 || Math.abs(dx) < 0.3) continue;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, hh); ctx.clip();
        ctx.clearRect(0, y - 1, W, hh + 2);
        const pad = Math.abs(dx) + 1; // stretched a hair, so the row still reaches both edges
        ctx.translate(dx - pad, 0); ctx.scale((W + pad * 2) / W, 1); picture(y, y + hh);
        ctx.restore();
      }
      // noise riding the band, the bottom edge and the tear
      ctx.fillStyle = pale(L ? 0.1 : 0.13);
      for (let i = 0; i < 7; i++) ctx.fillRect(Math.random() * W, by + Math.random() * bh, u * (0.02 + Math.random() * 0.12), 1);
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.random() * W, H - Math.random() * hs, u * (0.03 + Math.random() * 0.2), 1);
      if (g) { ctx.fillStyle = pale((L ? 0.12 : 0.16) * env); for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * W, g.y0 + Math.random() * (g.y1 - g.y0), u * (0.03 + Math.random() * 0.22), 1 + (i % 2)); }
      ctx.fillStyle = pale(L ? 0.012 : 0.022); ctx.fillRect(0, by, W, bh);
    }
    ctx.restore();

    // over the picture: scanlines, grain, the odd drop-out
    if (!st.scan) { const c = K.mk(1, 3), x = c.getContext('2d'); x.fillStyle = L ? 'rgb(46,49,56)' : 'rgb(214,226,222)'; x.fillRect(0, 0, 1, 1); st.scan = ctx.createPattern(c, 'repeat'); }
    ctx.globalAlpha = L ? 0.034 : 0.026; ctx.fillStyle = st.scan; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    if (t % 2 === 0) { st.ox = Math.random() * 192; st.oy = Math.random() * 192; }
    K.tile(ctx, grain(L), 0, 0, w, h, 192, 192, st.ox, st.oy, V.pv ? 0.05 : L ? 0.07 : 0.085);
    if (!V.pv) {
      ctx.fillStyle = pale(L ? 0.1 : 0.16);
      for (let i = 0, n = 2 + ((Math.random() * 3) | 0); i < n; i++) ctx.fillRect(Math.random() * w, Math.random() * h, u * (0.01 + Math.random() * Math.random() * 0.12), 1);
    }

    // the player's own display, clean over everything: PLAY and the counter; for a while after it was here, REC
    const px = Math.max(1, Math.round(Math.min(w, h) * 0.0042 * 2) / 2), mg = Math.min(w, h) * 0.045, a = L ? 0.34 : 0.36;
    if (st.rec > 0) {
      osd(ctx, 'REC  ', w - mg, mg, px, true, L, a);
      ctx.fillStyle = `rgba(255,56,48,${(L ? 0.75 : 0.8) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.105)))})`; ctx.beginPath(); osdPath(ctx, '*', w - mg, mg, px, true); ctx.fill();
    } else osd(ctx, 'PLAY >', w - mg, mg, px, true, L, a);
    if (!V.pv) { const ct = 817 + secs; osd(ctx, `SP ${Math.floor(ct / 3600)}:${two(Math.floor(ct / 60) % 60)}:${two(ct % 60)}`, w - mg, mg + px * 10.5, px, true, L, a); }
  };
})();
