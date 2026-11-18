'use strict';
/*
 * Typing effects with a little staging of their own: 금속활자 · 천상의 빛 · 지옥불 · 핏자국.
 *
 * addBurst (app.js) hands a key press to FX_EXT[kind].burst(c), with
 *   c = { fx, P (fx.parts), x, y (centre of the cursor cell), o ({ enter, k, cw, ch, text }), enter, k, sz, cw, ch, alpha }.
 * Whatever is pushed onto P paints itself: draw(ctx, p, fx) is called once a frame, the context in CSS pixels
 * and set to 'lighter', and the particle carries life / decay like the built-in ones.
 * Everything detailed (type, paper, seal, feathers, wings, splats, claw marks, the sigil) is painted once into
 * a sprite and only moved afterwards, and a burst thins itself out when the layer is already crowded.
 */
(function () {
  const TAU = Math.PI * 2;
  const isL = () => (typeof isLight === 'function' ? isLight() : false);
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  const easeIn = (t) => t * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const back = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- sprites ---------- */

  const cache = new Map();
  function sprite(key, make) {
    let s = cache.get(key);
    if (s) { cache.delete(key); cache.set(key, s); return s; } // most recently used last
    s = make(); cache.set(key, s);
    if (cache.size > 240) cache.delete(cache.keys().next().value); // typed characters come and go: drop the one unused longest
    return s;
  }
  /** A canvas painted in CSS pixels at device scale q. */
  function paint(w, h, q, draw) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * q)); c.height = Math.max(1, Math.ceil(h * q));
    const x = c.getContext('2d');
    x.scale(q, q); x.lineCap = 'round'; x.lineJoin = 'round';
    draw(x);
    return { c, w, h };
  }
  const scaleOf = (fx) => Math.min(2, Math.max(1, Math.round((fx.dpr || 1) * 4) / 4));
  /** A sprite centred on (x, y), scaled and turned. */
  function put(ctx, s, x, y, sc = 1, rot = 0) {
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(s.c, -s.w * 0.5 * sc, -s.h * 0.5 * sc, s.w * sc, s.h * sc); ctx.restore(); } else ctx.drawImage(s.c, x - s.w * 0.5 * sc, y - s.h * 0.5 * sc, s.w * sc, s.h * sc);
  }
  /** A particle that lives T frames. */
  const part = (T, draw, extra) => Object.assign({ life: 1, decay: 1 / T, T, age: 0, draw }, extra);
  /** A soft round light, in one colour ramp. */
  const glowS = (name, stops) => sprite(`glow|${name}`, () => paint(96, 96, 1, (x) => {
    const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    for (const [o, c] of stops) g.addColorStop(o, c);
    x.fillStyle = g; x.fillRect(0, 0, 96, 96);
  }));
  const goldGlow = () => glowS('gold', [[0, 'rgba(255,252,236,1)'], [0.22, 'rgba(255,234,166,0.72)'], [0.58, 'rgba(255,198,92,0.22)'], [1, 'rgba(255,180,60,0)']]);
  const fireGlow = () => glowS('fire', [[0, 'rgba(255,236,170,1)'], [0.25, 'rgba(255,140,40,0.6)'], [0.6, 'rgba(220,40,10,0.2)'], [1, 'rgba(160,10,0,0)']]);
  const hellGlow = () => glowS('hell', [[0, 'rgba(255,70,20,0.9)'], [0.4, 'rgba(200,16,6,0.4)'], [1, 'rgba(120,0,0,0)']]);

  const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
  /**
   * Where the character just typed sits. A burst arrives at the cursor, which has already moved on (and may have
   * a syllable still being composed after it): the character is the cell or two before that. All four effects
   * play on the character, not on the empty cell the next one is about to be typed into.
   *  → { g: the glyph ('' for a space, null when nothing printable was typed), gw: its width, cx: its centre, onLine }
   */
  function typedAt(c) {
    const { fx, x, o, cw } = c;
    const gl = typeof typedGlyphs === 'function' && o.text != null ? typedGlyphs(o.text) : [];
    const last = o.text != null ? [...String(o.text)].pop() : null;
    let g = gl.length ? gl[gl.length - 1] : null;
    const onLine = last === ' ' || (g != null && g === last); // it went onto the line (not ←, ⇥, esc …)
    if (last === ' ') g = '';
    const gw = (g && WIDE.test(g) ? 2 : 1) * cw;
    let cx = x;
    if (onLine && o.pre) return { g, gw, cx: o.pre.left + gw / 2, cy: o.pre.top + c.ch / 2, onLine };
    if (o.pre && o.pre.w) { const w = o.pre.w * cw; return { g, gw: w, cx: o.pre.left + w / 2, cy: o.pre.top + c.ch / 2, onLine: false }; } // the cell a Backspace erases
    if (onLine) {
      let comp = 0;
      if (fx.canvas.classList.contains('fx-layer')) { const v = document.querySelector('#stage .composition-view.active'); if (v && v.textContent) comp = v.getBoundingClientRect().width; }
      const tx = comp ? x - comp + cw / 2 - gw / 2 : x - cw / 2 - gw / 2;
      if (tx > gw / 2 - 1) cx = tx;
    }
    return { g, gw, cx, onLine };
  }
  /** An Enter flourish is sized for a terminal; in a small canvas (the picker's preview) it is scaled to fit. */
  const fitOf = (fx, ch) => clamp(fx.h / (ch * 7), 0.42, 1);
  /** A short canvas (the picker's preview) has no line of text to keep clear: there the effects play in the middle. */
  const isLow = (fx, ch) => fx.h < ch * 5;

  /* ====================================================================================================== */
  /* 금속활자: a bronze sort comes down on the character and leaves it printed in ink on a slip of hanji.      */
  /* Enter sets a vermilion seal beside the line.                                                             */
  /* ====================================================================================================== */

  const TYPE_FONT = '"Batang", "BatangChe", "AppleMyungjo", "Noto Serif CJK KR", "Noto Serif KR", "Nanum Myeongjo", "Yu Mincho", "Songti SC", "SimSun", "Times New Roman", serif';
  const JIKJI = [...'直指心體要節']; // what gets set when no character was typed: the oldest book printed with metal type
  let jikji = 0;

  /** A rectangle with soft corners whose edge wanders a little, as torn paper or a worn stamp does. */
  function deckle(x0, y0, w, h, r, R, amp) {
    const pts = [], step = 2.4;
    const edge = (ax, ay, bx, by) => {
      const len = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.round(len / step)), nx = (by - ay) / len, ny = -(bx - ax) / len;
      for (let i = 0; i < n; i++) { const t = i / n, o = (R() - 0.5) * 2 * amp; pts.push([ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o]); }
    };
    edge(x0 + r, y0, x0 + w - r, y0); edge(x0 + w, y0 + r, x0 + w, y0 + h - r); edge(x0 + w - r, y0 + h, x0 + r, y0 + h); edge(x0, y0 + h - r, x0, y0 + r);
    const path = new Path2D(), n = pts.length, mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
    path.moveTo(...mid(0));
    for (let i = 1; i <= n; i++) path.quadraticCurveTo(pts[i % n][0], pts[i % n][1], ...mid(i));
    path.closePath();
    return path;
  }
  /** The largest bold serif size at which the character fits the field. */
  function fitType(x, g, tw, th) {
    let fs = th * 0.7;
    x.font = `700 ${fs}px ${TYPE_FONT}`;
    const mw = x.measureText(g).width;
    if (mw > tw * 0.84) { fs *= (tw * 0.84) / mw; x.font = `700 ${fs}px ${TYPE_FONT}`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    return fs;
  }
  /** A slip of hanji: warm paper, fibres showing, a torn edge. */
  function hanji(tw, th, q) {
    return sprite(`hanji|${tw}|${th}|${q}`, () => paint(tw + 6, th + 6, q, (x) => {
      const R = rng(tw * 131 + th * 7 + 3), sheet = deckle(3, 3, tw, th, Math.min(1.5, tw * 0.12), R, 0.4);
      const g = x.createLinearGradient(3, 3, 3 + tw * 0.6, 3 + th);
      g.addColorStop(0, '#f9f0da'); g.addColorStop(0.55, '#f1e4c5'); g.addColorStop(1, '#e2d0a6');
      x.fillStyle = g; x.fill(sheet);
      x.save(); x.clip(sheet); x.lineWidth = 0.5;
      for (let i = 0, n = Math.round((tw * th) / 8); i < n; i++) { // the fibres
        const fx0 = 3 + R() * tw, fy0 = 3 + R() * th, len = 1.5 + R() * 5, an = R() * TAU;
        x.strokeStyle = R() < 0.55 ? `rgba(150,118,66,${0.1 + R() * 0.14})` : `rgba(255,255,255,${0.2 + R() * 0.25})`;
        x.beginPath(); x.moveTo(fx0, fy0);
        x.quadraticCurveTo(fx0 + Math.cos(an) * len * 0.5 + (R() - 0.5) * 2, fy0 + Math.sin(an) * len * 0.5 + (R() - 0.5) * 2, fx0 + Math.cos(an) * len, fy0 + Math.sin(an) * len);
        x.stroke();
      }
      x.restore();
      x.strokeStyle = 'rgba(122,92,44,0.42)'; x.lineWidth = 0.8; x.stroke(sheet);
    }));
  }
  /** The character as it comes off the type: black ink, a little uneven, bleeding into the paper. */
  function printS(g, tw, th, q) {
    return sprite(`print|${g}|${tw}|${th}|${q}`, () => paint(tw + 6, th + 6, q, (x) => {
      x.drawImage(hanji(tw, th, q).c, 0, 0, tw + 6, th + 6);
      if (!g) return;
      const fs = fitType(x, g, tw, th), cx = (tw + 6) / 2, cy = (th + 6) / 2 + fs * 0.03, R = rng(g.codePointAt(0) * 17 + tw);
      x.fillStyle = 'rgba(46,32,18,0.16)'; for (const [ox, oy] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) x.fillText(g, cx + ox, cy + oy); // ink bleeding into the paper
      x.fillStyle = 'rgba(20,14,9,0.95)'; x.fillText(g, cx, cy); x.fillText(g, cx + 0.25, cy + 0.15);
      x.globalCompositeOperation = 'source-atop'; // where the ink did not take (the paper is the same colour, so only the strokes show it)
      for (let i = 0, n = Math.round((tw * th) / 14); i < n; i++) { x.fillStyle = `rgba(238,224,192,${0.25 + R() * 0.45})`; x.beginPath(); x.arc(3 + R() * tw, 3 + R() * th, 0.25 + R() * 0.5, 0, TAU); x.fill(); }
    }));
  }
  /** The sort itself: cast bronze gone a little green, bevelled, the character standing on it in mirror image. */
  function blockS(g, tw, th, q) {
    return sprite(`block|${g}|${tw}|${th}|${q}`, () => paint(tw + 6, th + 6, q, (x) => {
      const R = rng(tw * 53 + th * 11 + 7), body = new Path2D();
      body.roundRect(3, 3, tw, th, Math.min(2, tw * 0.14));
      const gr = x.createLinearGradient(3, 3, 3 + tw, 3 + th);
      gr.addColorStop(0, '#f3d593'); gr.addColorStop(0.32, '#c99d52'); gr.addColorStop(0.7, '#98722f'); gr.addColorStop(1, '#5c4018');
      x.fillStyle = gr; x.fill(body);
      x.save(); x.clip(body);
      for (let i = 0, n = Math.round((tw * th) / 7); i < n; i++) { // the skin of the casting
        const k = R();
        x.fillStyle = k < 0.3 ? `rgba(84,140,114,${0.08 + R() * 0.12})` : k < 0.6 ? `rgba(255,242,196,${0.06 + R() * 0.1})` : `rgba(58,34,8,${0.07 + R() * 0.1})`;
        x.beginPath(); x.arc(3 + R() * tw, 3 + R() * th, 0.4 + R() * 1.5, 0, TAU); x.fill();
      }
      const m = Math.max(1.6, tw * 0.13); // a sunk field, with the character raised in it
      x.fillStyle = 'rgba(66,42,12,0.34)'; x.fillRect(3 + m, 3 + m, tw - m * 2, th - m * 2);
      x.lineWidth = 0.8;
      x.strokeStyle = 'rgba(40,24,6,0.6)'; x.beginPath(); x.moveTo(3 + m, 3 + th - m); x.lineTo(3 + m, 3 + m); x.lineTo(3 + tw - m, 3 + m); x.stroke();
      x.strokeStyle = 'rgba(255,238,188,0.5)'; x.beginPath(); x.moveTo(3 + m, 3 + th - m); x.lineTo(3 + tw - m, 3 + th - m); x.lineTo(3 + tw - m, 3 + m); x.stroke();
      if (g) {
        const fs = fitType(x, g, tw - m, th);
        x.translate((tw + 6) / 2, (th + 6) / 2 + fs * 0.03); x.scale(-1, 1); // type is cast the wrong way round
        x.fillStyle = 'rgba(36,20,4,0.8)'; x.fillText(g, -0.8, 0.9);
        x.fillStyle = 'rgba(255,244,204,0.85)'; x.fillText(g, 0.6, -0.6);
        x.fillStyle = '#bd9048'; x.fillText(g, 0, 0);
        x.setTransform(q, 0, 0, q, 0, 0);
      }
      x.restore();
      x.lineWidth = 1;
      x.strokeStyle = 'rgba(255,246,206,0.8)'; x.beginPath(); x.moveTo(3.6, 3 + th - 1.6); x.lineTo(3.6, 3.6); x.lineTo(3 + tw - 1.6, 3.6); x.stroke();
      x.strokeStyle = 'rgba(44,26,6,0.75)'; x.beginPath(); x.moveTo(3.6, 3 + th - 0.6); x.lineTo(3 + tw - 0.6, 3 + th - 0.6); x.lineTo(3 + tw - 0.6, 3.6); x.stroke();
    }));
  }
  const shadowS = (tw, th, q) => sprite(`shadow|${tw}|${th}|${q}`, () => paint(tw + 20, th + 20, q, (x) => {
    x.filter = `blur(${3.2 * q}px)`; x.fillStyle = 'rgba(0,0,0,0.6)';
    x.beginPath(); x.roundRect(10, 10, tw, th, 2); x.fill();
  }));
  /** A seal in vermilion paste, 金屬活字 cut out of it, worn where the paste did not take. */
  function sealS(S, q) {
    return sprite(`seal|${S}|${q}`, () => paint(S + 6, S + 6, q, (x) => {
      const R = rng(S * 3 + 77), pad = deckle(3, 3, S, S, S * 0.09, R, S * 0.012 + 0.3);
      x.fillStyle = '#c7281b'; x.fill(pad);
      x.save(); x.clip(pad);
      for (let i = 0; i < 34; i++) { // paste lying thicker and thinner
        x.fillStyle = R() < 0.5 ? `rgba(118,10,6,${0.06 + R() * 0.12})` : `rgba(246,96,64,${0.06 + R() * 0.12})`;
        x.beginPath(); x.arc(3 + R() * S, 3 + R() * S, S * (0.03 + R() * 0.12), 0, TAU); x.fill();
      }
      x.globalCompositeOperation = 'destination-out';
      x.lineWidth = Math.max(1, S * 0.034); x.strokeStyle = '#000';
      x.beginPath(); x.roundRect(3 + S * 0.085, 3 + S * 0.085, S * 0.83, S * 0.83, S * 0.04); x.stroke();
      x.font = `900 ${S * 0.345}px ${TYPE_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000';
      [['金', 0.7, 0.31], ['屬', 0.7, 0.705], ['活', 0.3, 0.31], ['字', 0.3, 0.705]].forEach(([ch, fx0, fy0]) => x.fillText(ch, 3 + S * fx0, 3 + S * fy0));
      for (let i = 0, n = Math.round(S * 2.6); i < n; i++) { x.globalAlpha = 0.2 + R() * 0.7; x.beginPath(); x.arc(3 + R() * S, 3 + R() * S, S * (0.004 + R() * 0.013), 0, TAU); x.fill(); }
      x.restore();
    }));
  }
  /** The seal stone seen from above: dark jade, bevelled, a knob carved on its back. */
  function sealToolS(S, q) {
    return sprite(`sealtool|${S}|${q}`, () => paint(S + 6, S + 6, q, (x) => {
      const R = rng(S * 5 + 3), body = new Path2D();
      body.roundRect(3, 3, S, S, S * 0.1);
      const gr = x.createLinearGradient(3, 3, 3 + S, 3 + S);
      gr.addColorStop(0, '#6f8f84'); gr.addColorStop(0.4, '#41584f'); gr.addColorStop(1, '#1a2622');
      x.fillStyle = gr; x.fill(body);
      x.save(); x.clip(body);
      for (let i = 0; i < 26; i++) { // veins in the stone
        x.strokeStyle = `rgba(${R() < 0.5 ? '190,226,210' : '10,22,18'},${0.05 + R() * 0.1})`; x.lineWidth = 0.4 + R() * 1.4;
        const sx = 3 + R() * S, sy = 3 + R() * S;
        x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + (R() - 0.5) * S * 0.7, sy + (R() - 0.5) * S * 0.7, sx + (R() - 0.5) * S, sy + (R() - 0.5) * S); x.stroke();
      }
      const kg = x.createRadialGradient(3 + S * 0.44, 3 + S * 0.42, S * 0.02, 3 + S * 0.5, 3 + S * 0.5, S * 0.3);
      kg.addColorStop(0, 'rgba(206,236,222,0.75)'); kg.addColorStop(0.5, 'rgba(96,130,118,0.6)'); kg.addColorStop(1, 'rgba(14,26,22,0.55)');
      x.fillStyle = kg; x.beginPath(); x.arc(3 + S * 0.5, 3 + S * 0.5, S * 0.27, 0, TAU); x.fill();
      x.restore();
      x.lineWidth = 1.2;
      x.strokeStyle = 'rgba(214,240,228,0.6)'; x.beginPath(); x.moveTo(3.8, 3 + S * 0.9); x.lineTo(3.8, 3 + S * 0.1); x.quadraticCurveTo(3.8, 3.8, 3 + S * 0.1, 3.8); x.lineTo(3 + S * 0.9, 3.8); x.stroke();
      x.strokeStyle = 'rgba(6,14,12,0.7)'; x.beginPath(); x.moveTo(3 + S * 0.1, 3 + S - 0.8); x.lineTo(3 + S * 0.9, 3 + S - 0.8); x.quadraticCurveTo(3 + S - 0.8, 3 + S - 0.8, 3 + S - 0.8, 3 + S * 0.9); x.lineTo(3 + S - 0.8, 3 + S * 0.1); x.stroke();
    }));
  }

  /** Down, a blow, away: the stamp (a sort or a seal stone) and the print it leaves. */
  function drawStamp(ctx, p) {
    const a = p.age++ - (p.wait || 0), hit = p.hit, S = Math.max(p.tw, p.th);
    if (a < 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    if (a >= hit) {
      const t = (a - hit) / (p.T - hit), al = t < p.hold ? 1 : 1 - smooth((t - p.hold) / (1 - p.hold));
      const spring = a - hit < 6 ? 1 - 0.045 * Math.sin(((a - hit) / 6) * Math.PI) : 1; // the paper gives, then lies flat
      ctx.globalAlpha = al;
      put(ctx, p.print, p.x, p.y, spring, p.rot);
      if (p.dust && a - hit < 14) { // what the blow throws out: bronze filings, or flecks of seal paste
        const R = rng(p.seed), u = (a - hit) / 14;
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.red ? `rgba(216,54,36,${0.9 * (1 - u)})` : `rgba(240,206,130,${0.9 * (1 - u)})`;
        for (let i = 0; i < p.dust; i++) {
          const an = R() * TAU, d = 0.56 + easeOut(u) * (0.3 + R() * 0.5);
          ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * p.tw * d, p.y + Math.sin(an) * p.th * d + u * u * 3, 0.5 + R() * 0.9, 0, TAU); ctx.fill();
        }
      }
    }
    if (a < p.lift) {
      let z, dx = 0, al = 1, rot = p.rot;
      if (a < hit) { z = (1 - easeIn(a / hit)) * 0.8; al = clamp((a + 1) / 2); rot -= z * 0.14; }
      else if (a < hit + 3) { z = -0.03; dx = a - hit === 1 ? 0.7 : a - hit === 2 ? -0.5 : 0; }
      else { const v = (a - hit - 3) / (p.lift - hit - 3); z = easeOut(v) * 0.75; al = 1 - v * v; rot += z * 0.12; }
      const zz = Math.max(0, z);
      ctx.globalAlpha = al * 0.55 * (1 - zz * 0.55);
      put(ctx, p.shadow, p.x + zz * S * 0.3, p.y + zz * S * 0.42, 1 + zz * 0.35, rot);
      ctx.globalAlpha = al;
      put(ctx, p.block, p.x + dx - zz * S * 0.1, p.y - zz * S * 0.5, 1 + z * 0.62, rot);
    }
    ctx.restore();
  }

  const FX = {};
  FX.movable = {
    burst(c) {
      const { fx, P, x, y, enter, sz, cw, ch } = c, q = scaleOf(fx), crowded = fx.parts.length > 160;
      if (enter) {
        const S = Math.round(ch * 2.1 * sz), lim = (v, max) => clamp(v, S / 2 + 3, Math.max(S / 2 + 3, max - S / 2 - 3));
        P.push(part(124, drawStamp, { x: lim(x + cw * 1.2 + S / 2, fx.w), y: lim(y - S * 0.06, fx.h), print: sealS(S, q), block: sealToolS(S, q), shadow: shadowS(S, S, q), hit: 8, lift: 25, hold: 0.42, rot: rand(-0.09, 0.09), seed: (Math.random() * 1e9) | 0, tw: S, th: S, dust: crowded ? 0 : 11, red: true }));
        return;
      }
      const at = typedAt(c);
      const one = (g, cx, cy, wait) => {
        const gw = (WIDE.test(g) ? 2 : 1) * cw, tw = Math.round((gw + Math.max(2, cw * 0.3)) * sz), th = Math.round(ch * 1.1 * sz);
        P.push(part(46 + wait, drawStamp, { x: cx, y: cy, wait, print: printS(g, tw, th, q), block: blockS(g, tw, th, q), shadow: shadowS(tw, th, q), hit: 4, lift: 13, hold: 0.3, rot: rand(-0.03, 0.03), seed: (Math.random() * 1e9) | 0, tw, th, dust: crowded ? 0 : 4, red: false }));
      };
      if (c.o.pre && at.onLine) { // each character where it lands, one after another
        const gl = [...String(c.o.text)].slice(-8);
        let left = c.o.pre.left + Math.max(0, [...String(c.o.text)].length - gl.length) * cw;
        gl.forEach((ch0, i) => {
          const w = (WIDE.test(ch0) ? 2 : 1) * cw;
          if (ch0 !== ' ') one(ch0, left + w / 2, c.o.pre.top + ch / 2, i * 2);
          left += w;
        });
        return;
      }
      const g = at.g == null ? JIKJI[jikji++ % JIKJI.length] : at.g;
      one(g, at.cx, at.cy != null ? at.cy : y, 0);
    },
  };

  /* ====================================================================================================== */
  /* 천상의 빛: a bloom of light with a halo lifting off it, feathers coming down. Enter raises a pillar of     */
  /* light and a pair of wings opens across it.                                                               */
  /* ====================================================================================================== */

  /** A feather, tip up: a fuller and a narrower vane, barbs, a split or two, down at the quill. */
  function featherS(v, L, q) {
    return sprite(`feather|${v}|${L}|${q}`, () => paint(26, 62, q, (x) => {
      const R = rng(v * 71 + 9), cx = 13, top = 3, bot = 58, bend = (v % 2 ? 1 : -1) * 2.2, vane = new Path2D();
      vane.moveTo(cx, top);
      vane.bezierCurveTo(cx + 9, top + 10, cx + 10 + bend * 0.3, top + 30, cx + 2.2 + bend * 0.5, bot - 13);
      vane.lineTo(cx + bend * 0.6, bot - 9); vane.lineTo(cx - 2 + bend * 0.5, bot - 13);
      vane.bezierCurveTo(cx - 8 + bend * 0.3, top + 32, cx - 7, top + 12, cx, top);
      const g = x.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, L ? '#fbf3df' : '#fff6de'); g.addColorStop(1, L ? '#ecd9a8' : '#ffe4ac');
      x.fillStyle = g; x.fill(vane);
      x.save(); x.clip(vane);
      x.lineWidth = 0.5; x.strokeStyle = L ? 'rgba(170,128,50,0.4)' : 'rgba(214,170,90,0.42)';
      for (let i = 0; i < 17; i++) { const yy = top + 5 + i * 2.6, sx = cx + bend * 0.6 * ((yy - top) / (bot - top)); x.beginPath(); x.moveTo(sx + 11, yy - 5); x.lineTo(sx, yy + 3); x.lineTo(sx - 10, yy - 4); x.stroke(); }
      x.globalCompositeOperation = 'destination-out'; x.lineWidth = 0.9; x.strokeStyle = 'rgba(0,0,0,0.9)';
      for (let i = 0; i < 3; i++) { const yy = top + 12 + R() * 26, d = R() < 0.5 ? 1 : -1; x.beginPath(); x.moveTo(cx + d * 12, yy - 6); x.lineTo(cx + d * 3, yy + 2); x.stroke(); }
      x.restore();
      x.strokeStyle = L ? 'rgba(176,130,50,0.9)' : 'rgba(232,190,110,0.9)'; x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(cx, top + 2); x.quadraticCurveTo(cx + bend * 0.2, (top + bot) / 2, cx + bend * 0.9, bot); x.stroke();
      x.strokeStyle = L ? 'rgba(200,170,110,0.75)' : 'rgba(255,240,210,0.8)'; x.lineWidth = 0.6;
      for (let i = 0; i < 7; i++) { const an = Math.PI * (0.12 + (i / 6) * 0.76), len = 3 + R() * 3.5; x.beginPath(); x.moveTo(cx + bend * 0.62, bot - 10); x.lineTo(cx + bend * 0.62 + Math.cos(an) * len, bot - 10 + Math.sin(an) * len * 0.8); x.stroke(); }
      if (L) { x.strokeStyle = 'rgba(176,130,50,0.8)'; x.lineWidth = 0.7; x.stroke(vane); }
    }));
  }
  /** A four-pointed glint. */
  const glintS = (L, q) => sprite(`glint|${L}|${q}`, () => paint(24, 24, q, (x) => {
    x.translate(12, 12);
    if (!L) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 11); g.addColorStop(0, 'rgba(255,244,200,0.9)'); g.addColorStop(0.35, 'rgba(255,214,120,0.28)'); g.addColorStop(1, 'rgba(255,200,90,0)'); x.fillStyle = g; x.fillRect(-12, -12, 24, 24); }
    x.fillStyle = L ? '#e2a21c' : '#fffbe6';
    x.beginPath(); x.moveTo(0, -11);
    x.quadraticCurveTo(1.5, -1.5, 11, 0); x.quadraticCurveTo(1.5, 1.5, 0, 11); x.quadraticCurveTo(-1.5, 1.5, -11, 0); x.quadraticCurveTo(-1.5, -1.5, 0, -11);
    x.fill();
  }));
  /** One wing, opening right and up from the shoulder at (WOX, WOY): primaries from the wrist, secondaries and coverts along the arm. */
  const WOX = 14, WOY = 122;
  function wingS(L, q) {
    return sprite(`wing|${L}|${q}`, () => paint(216, 196, q, (x) => {
      x.translate(WOX, WOY);
      const edge = L ? 'rgba(176,132,58,0.85)' : 'rgba(214,180,120,0.55)', rear = L ? 'rgba(250,240,216,0.98)' : 'rgba(238,230,210,0.97)', front = L ? 'rgba(255,253,244,1)' : 'rgba(255,254,246,1)';
      const fe = (fx0, fy0, ang, len, wid, fill) => {
        x.save(); x.translate(fx0, fy0); x.rotate(ang);
        x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(len * 0.3, -wid, len * 0.82, -wid * 0.85, len, 0); x.bezierCurveTo(len * 0.82, wid * 0.7, len * 0.3, wid * 0.85, 0, 0);
        x.fillStyle = fill; x.fill(); x.strokeStyle = edge; x.lineWidth = 0.8; x.stroke();
        x.restore();
      };
      const E = [50, -46], Wr = [102, -66], mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], arm = (t) => (t < 0.5 ? mix([0, 0], E, t * 2) : mix(E, Wr, t * 2 - 1));
      for (let i = 9; i >= 0; i--) { const tt = i / 9; fe(Wr[0] - tt * 12, Wr[1] + tt * 8, -0.45 + tt * 1.62, 92 - 28 * tt, 9.5 - tt * 2, rear); }
      for (let i = 0; i <= 10; i++) { const tt = i / 10, pp = arm(1 - tt * 0.92); fe(pp[0], pp[1] + 2, 1.2 + tt * 0.28, 66 - 28 * tt, 8.5, rear); }
      for (let i = 0; i <= 13; i++) { const tt = i / 13, pp = arm(1 - tt * 0.95); fe(pp[0], pp[1], 1.1 + tt * 0.3, 36 - 12 * tt, 6.5, front); }
      for (let i = 0; i <= 12; i++) { const tt = i / 12, pp = arm(1.02 - tt * 0.98); fe(pp[0] - 1, pp[1] - 2, 0.95 + tt * 0.3, 19 - 5 * tt, 5, front); }
      x.strokeStyle = front; x.lineWidth = 9; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(E[0], E[1] - 6, Wr[0] + 6, Wr[1] - 2); x.stroke();
      x.strokeStyle = edge; x.lineWidth = 1; x.beginPath(); x.moveTo(-2, -5); x.quadraticCurveTo(E[0], E[1] - 11, Wr[0] + 9, Wr[1] - 6); x.stroke();
    }));
  }
  /** A shaft of light, bright along its heart and fading upward. */
  const beamS = (L) => sprite(`beam|${L}`, () => paint(64, 256, 1, (x) => {
    const g = x.createLinearGradient(0, 0, 64, 0);
    if (L) { g.addColorStop(0, 'rgba(240,180,50,0)'); g.addColorStop(0.3, 'rgba(244,188,64,0.5)'); g.addColorStop(0.5, 'rgba(255,232,160,0.92)'); g.addColorStop(0.7, 'rgba(244,188,64,0.5)'); g.addColorStop(1, 'rgba(240,180,50,0)'); } else { g.addColorStop(0, 'rgba(255,200,90,0)'); g.addColorStop(0.28, 'rgba(255,214,120,0.34)'); g.addColorStop(0.5, 'rgba(255,252,236,0.95)'); g.addColorStop(0.72, 'rgba(255,214,120,0.34)'); g.addColorStop(1, 'rgba(255,200,90,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = 'destination-in';
    const v = x.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.4, 'rgba(0,0,0,0.55)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = v; x.fillRect(0, 0, 64, 256);
  }));

  // the flare: tall, level arms shorter, the diagonals shortest
  const FLARE = [[-Math.PI / 2, 1.5, 1.9], [Math.PI / 2, 1, 1.6], [0, 1.1, 1.6], [Math.PI, 1.1, 1.6], [-Math.PI / 4, 0.55, 0.9], [-Math.PI * 0.75, 0.55, 0.9], [Math.PI / 4, 0.5, 0.9], [Math.PI * 0.75, 0.5, 0.9]];

  function drawBloom(ctx, p) {
    const a = p.age++, t = a / p.T, L = p.L, e = easeOut(clamp(t * 1.7));
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    ctx.globalAlpha = (1 - t) ** 1.4 * p.al * (L ? 0.5 : 1) * p.soft;
    put(ctx, p.glow, p.x, p.y, (p.r * (1.3 + 1.7 * e)) / 96);
    ctx.globalAlpha = 1;
    for (let i = 0; i < FLARE.length; i += p.step) {
      const [ang0, l, wd] = FLARE[i], ang = ang0 + p.turn, len = p.r * (0.5 + 1.25 * e) * l, al = (1 - t) * p.al;
      const x0 = p.x + Math.cos(ang) * p.r * 0.14, y0 = p.y + Math.sin(ang) * p.r * 0.14, x1 = p.x + Math.cos(ang) * len, y1 = p.y + Math.sin(ang) * len;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, L ? `rgba(226,160,30,${0.72 * al})` : `rgba(255,246,212,${0.9 * al})`); g.addColorStop(1, L ? 'rgba(226,160,30,0)' : 'rgba(255,208,110,0)');
      ctx.strokeStyle = g; ctx.lineWidth = wd * p.wd;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    if (t < 0.6) { // the heart of it: a hard white point
      const ca = (1 - t / 0.6) * p.al;
      ctx.fillStyle = L ? `rgba(240,176,40,${ca})` : `rgba(255,255,244,${ca})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.075 * (1 + e), 0, TAU); ctx.fill();
    }
    const ht = clamp((t - 0.05) / 0.95), ha = Math.sin(Math.PI * Math.min(1, ht * 1.12)) * p.al; // the halo lifting off
    if (ha > 0.01) {
      const hy = p.y - p.rise * (0.55 + 0.45 * easeOut(ht)), rx = p.hr * (0.72 + 0.5 * easeOut(ht)), ry = rx * 0.3;
      if (!L) { ctx.strokeStyle = `rgba(255,204,104,${0.36 * ha})`; ctx.lineWidth = 3.6 * p.wd; ctx.beginPath(); ctx.ellipse(p.x, hy, rx, ry, 0, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = L ? `rgba(214,150,26,${0.72 * ha})` : `rgba(255,246,206,${0.95 * ha})`; ctx.lineWidth = (L ? 1.3 : 1.3) * p.wd;
      ctx.beginPath(); ctx.ellipse(p.x, hy, rx, ry, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function drawFeather(ctx, p) {
    const a = p.age++, t = a / p.T;
    p.ph += p.w; p.vy += (p.fall - p.vy) * 0.035; p.vx *= 0.965;
    p.x += p.vx + Math.sin(p.ph) * p.sway; p.y += p.vy;
    const al = Math.min(1, t / 0.08) * (t > 0.58 ? 1 - smooth((t - 0.58) / 0.42) : 1) * p.al, s = p.len / 62;
    ctx.save();
    if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 * al; put(ctx, p.glow, p.x, p.y, (p.len * 1.6) / 96); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot0 + Math.sin(p.ph) * 0.55 + p.spin * a);
    ctx.scale(0.5 + 0.5 * Math.abs(Math.cos(p.ph * 0.5 + p.tw)), 1); // it shows its edge as it rocks
    ctx.drawImage(p.sp.c, -13 * s, -31 * s, 26 * s, 62 * s);
    ctx.restore();
  }
  function drawGlint(ctx, p) {
    const a = p.age++, t = a / p.T, k = Math.sin(Math.PI * t);
    p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, k * 1.4) * p.al;
    put(ctx, p.sp, p.x, p.y, (p.s * (0.35 + 0.65 * k)) / 24, p.rot + a * p.spin);
    ctx.restore();
  }
  function drawPillar(ctx, p) {
    const a = p.age++, t = a / p.T, L = p.L;
    const open = easeOut(clamp(t / 0.18)), close = t > 0.52 ? smooth((t - 0.52) / 0.48) : 0, al = (1 - close) * p.al;
    const w = p.w * (0.2 + 0.8 * open) * (1 - close * 0.72), h = p.h * (0.35 + 0.65 * easeOut(clamp(t / 0.24)));
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    ctx.globalAlpha = al * (L ? 0.7 : 0.9); ctx.drawImage(p.beam.c, p.x - w / 2, p.y - h, w, h);
    ctx.globalAlpha = al * (L ? 0.5 : 0.75); ctx.drawImage(p.beam.c, p.x - w * 0.2, p.y - h, w * 0.4, h);
    ctx.globalAlpha = al * (L ? 0.45 : 0.85); // the pool of light it stands in
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.26); put(ctx, p.glow, 0, 0, (w * 2.8) / 96); ctx.restore();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) { // rings running out along the ground
      const rt = t * 1.6 - i * 0.24;
      if (rt <= 0 || rt >= 1) continue;
      const rx = p.w * (0.5 + 2.7 * easeOut(rt));
      ctx.strokeStyle = L ? `rgba(214,150,26,${0.85 * (1 - rt) * p.al})` : `rgba(255,238,176,${0.8 * (1 - rt) * p.al})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, rx * 0.25, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function drawWings(ctx, p) {
    const a = p.age++, t = a / p.T;
    const open = back(clamp(t / 0.36)), al = Math.min(1, t / 0.1) * (t > 0.6 ? 1 - smooth((t - 0.6) / 0.4) : 1) * p.al;
    const beat = Math.sin(a * 0.17) * 0.08 * clamp((t - 0.3) / 0.2), sc = (p.span / 190) * (0.32 + 0.68 * open);
    ctx.save();
    if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.32; put(ctx, p.glow, p.x, p.y - p.span * 0.25, (p.span * 3.2) / 96); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    for (const d of [-1, 1]) {
      ctx.save(); ctx.translate(p.x + d * p.gap, p.y); ctx.scale(d, 1); ctx.rotate((1 - open) * -1.2 + beat - 0.1); // folded: held up against the light
      ctx.drawImage(p.wing.c, -WOX * sc, -WOY * sc, p.wing.w * sc, p.wing.h * sc);
      ctx.restore();
    }
    ctx.restore();
  }

  FX.holy = {
    burst(c) {
      const { fx, P, x, y, enter, k, sz, cw, ch, alpha } = c, L = isL(), q = scaleOf(fx), n = fx.parts.length, lite = n > 150, bare = n > 300;
      const glow = goldGlow(), glint = glintS(L, q);
      const feather = (fx0, fy0, vx, vy, len, T) => P.push(part(T, drawFeather, { x: fx0, y: fy0, vx, vy, fall: rand(0.32, 0.62), ph: rand(0, TAU), w: rand(0.05, 0.09), sway: rand(0.3, 0.7), rot0: rand(-0.6, 0.6), spin: rand(-0.006, 0.006), tw: rand(0, TAU), len, al: 1, sp: featherS((Math.random() * 4) | 0, L, q), glow: L || lite ? null : glow }));
      const spark = (sx, sy, s, vy, T) => P.push(part(T, drawGlint, { x: sx, y: sy, s, vy, rot: rand(0, 1.5), spin: rand(-0.03, 0.03), al: alpha, L, sp: glint }));
      if (!enter) {
        const at = typedAt(c), bx = at.cx, by = isLow(fx, ch) ? y : y - ch * 0.56;
        P.push(part(34, drawBloom, { x: bx, y: by, r: ch * 1.15 * sz, rise: ch * 0.9 * sz, hr: Math.max(cw * 1.05, ch * 0.5) * sz, al: alpha, L, glow, soft: 0.55, step: lite ? 2 : 1, turn: rand(-0.06, 0.06), wd: 0.8 + 0.2 * sz }));
        if (bare) return;
        for (let i = 0, m = lite ? (Math.random() < 0.3 ? 1 : 0) : Math.random() < 0.28 * k ? 2 : 1; i < m; i++) feather(bx + rand(-1.2, 1.2) * cw, by - ch * rand(0.1, 0.7), rand(-0.5, 0.5), rand(-0.9, -0.3) * sz, ch * rand(0.95, 1.35) * sz, rand(84, 118));
        for (let i = 0, m = lite ? 1 : Math.max(1, Math.round(2.4 * k)); i < m; i++) spark(bx + rand(-2, 2) * cw, by + rand(-1.1, 0.5) * ch, rand(7, 12) * sz, -rand(0.1, 0.4), rand(16, 30));
        return;
      }
      const fit = fitOf(fx, ch), sz0 = sz * fit; // sized to the room there is
      const base = y + ch * 0.5, h = Math.max(ch * 3, Math.min(base + 30, ch * 13 * sz0));
      P.push(part(72, drawPillar, { x, y: base, w: cw * 5.4 * sz0, h, al: alpha, L, beam: beamS(L), glow }));
      P.push(part(46, drawBloom, { x, y: y - ch * 0.6 * sz0, r: ch * 2.5 * sz0, rise: ch * 2.6 * sz0, hr: cw * 2.4 * sz0, al: alpha, L, glow, soft: 1, step: 1, turn: 0, wd: 1.25 }));
      if (bare) return;
      P.push(part(80, drawWings, { x, y: y - ch * 0.75 * sz0, span: ch * 3.4 * sz0, gap: cw * 0.3, al: 1, wing: wingS(L, q), glow: L ? null : glow }));
      for (let i = 0, m = lite ? 3 : Math.max(4, Math.round(7 * Math.sqrt(k))); i < m; i++) { const an = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(1.4, 3.4) * sz0; feather(x + Math.cos(an) * cw, y - ch * 0.8 * fit + Math.sin(an) * ch * 0.4, Math.cos(an) * sp, Math.sin(an) * sp * 0.8, ch * rand(1.1, 1.7) * sz0, rand(96, 140)); }
      for (let i = 0, m = lite ? 4 : Math.max(5, Math.round(10 * Math.sqrt(k))); i < m; i++) spark(x + rand(-1.3, 1.3) * cw * sz0, base - rand(0, 0.85) * h, rand(8, 15) * sz0, -rand(0.5, 1.5) * fit, rand(22, 48));
    },
  };

  /* ====================================================================================================== */
  /* 지옥불: tongues of fire lick up from the character over a crack that glows and cools. Enter burns a sigil */
  /* into the ground and a column of fire stands up out of it.                                                */
  /* ====================================================================================================== */

  /** A tongue of flame: base on (x, y), w wide, h high, its tip leaning by `lean`. */
  function tongue(ctx, x, y, w, h, lean) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y);
    ctx.bezierCurveTo(x - w * 0.64, y - h * 0.3, x - w * 0.34 + lean * 0.35, y - h * 0.58, x + lean * 0.75, y - h * 0.8);
    ctx.quadraticCurveTo(x + lean * 0.95, y - h * 0.93, x + lean, y - h);
    ctx.quadraticCurveTo(x + lean * 0.9 + w * 0.2, y - h * 0.8, x + w * 0.3 + lean * 0.4, y - h * 0.52);
    ctx.bezierCurveTo(x + w * 0.68, y - h * 0.3, x + w * 0.56, y - h * 0.1, x + w * 0.5, y);
    ctx.quadraticCurveTo(x, y + h * 0.06, x - w * 0.5, y);
    ctx.closePath();
  }
  function drawFlame(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay), L = p.L;
    const up = easeOut(clamp(t / 0.22)), down = t > 0.3 ? (t - 0.3) / 0.7 : 0;
    const h = p.h * up * (1 - down * 0.5) * (0.9 + 0.1 * Math.sin(a * 0.9 + p.ph)), w = p.w * (0.7 + 0.3 * up) * (1 - down * 0.55);
    const lean = (Math.sin(a * 0.33 + p.ph) * 0.5 + Math.sin(a * 0.71 + p.ph * 2) * 0.25) * p.w * (0.3 + t) + p.drift * a;
    const x = p.x + p.vx * a, y = p.y + p.vy * a - down * down * p.rise, al = (1 - down ** 1.5) * p.al;
    if (h < 1 || w < 0.5) return;
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    if (p.glow) { ctx.globalAlpha = 0.34 * al; put(ctx, p.glow, x + lean * 0.3, y - h * 0.38, (h * 1.9) / 96); ctx.globalAlpha = 1; } // the sullen light it throws
    ctx.globalCompositeOperation = 'source-over'; // the fire is in front of the letter: its sheets cover it, they do not just brighten it
    let g = ctx.createLinearGradient(0, y, 0, y - h); // three sheets of fire, hotter toward the heart
    g.addColorStop(0, L ? `rgba(190,24,10,${0.92 * al})` : `rgba(226,26,8,${0.72 * al})`); g.addColorStop(0.7, L ? `rgba(128,8,6,${0.75 * al})` : `rgba(150,6,4,${0.5 * al})`); g.addColorStop(1, 'rgba(70,0,0,0)');
    ctx.fillStyle = g; tongue(ctx, x, y, w, h, lean); ctx.fill();
    g = ctx.createLinearGradient(0, y, 0, y - h * 0.74);
    g.addColorStop(0, L ? `rgba(255,120,24,${0.95 * al})` : `rgba(255,112,24,${0.8 * al})`); g.addColorStop(1, L ? `rgba(226,56,12,${0.45 * al})` : 'rgba(240,40,8,0)');
    ctx.fillStyle = g; tongue(ctx, x, y, w * 0.62, h * 0.72, lean * 0.7); ctx.fill();
    if (!L) ctx.globalCompositeOperation = 'lighter';
    g = ctx.createLinearGradient(0, y, 0, y - h * 0.42);
    g.addColorStop(0, L ? `rgba(255,240,180,${al})` : `rgba(255,240,190,${0.95 * al})`); g.addColorStop(1, L ? `rgba(255,180,70,${0.55 * al})` : 'rgba(255,170,60,0)');
    ctx.fillStyle = g; tongue(ctx, x, y, w * 0.3, h * 0.4, lean * 0.4); ctx.fill();
    ctx.restore();
  }
  function drawEmber(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay), px = p.x, py = p.y;
    p.ph += 0.22; p.vy = p.vy * 0.975 + p.g; p.vx *= 0.97; p.x += p.vx + Math.sin(p.ph) * p.curl; p.y += p.vy;
    const al = (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9) * p.al, hot = 1 - t;
    const col = `rgba(255,${Math.round(80 + 160 * hot)},${Math.round(16 + 100 * hot * hot)},`;
    ctx.save(); ctx.globalCompositeOperation = p.L ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = col + 0.55 * al + ')'; ctx.lineWidth = p.s * 0.9;
    ctx.beginPath(); ctx.moveTo(px - (p.x - px) * 1.6, py - (p.y - py) * 1.6); ctx.lineTo(p.x, p.y); ctx.stroke(); // the streak it leaves
    if (p.glow) { ctx.globalAlpha = 0.5 * al; put(ctx, p.glow, p.x, p.y, (p.s * 8) / 96); ctx.globalAlpha = 1; }
    ctx.fillStyle = col + al + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.55 + 0.5 * hot), 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** A crack: it runs out both ways from the middle, white-hot, then cools through orange to dull red. */
  function drawFissure(ctx, p) {
    const a = p.age++, t = a / p.T, L = p.L, open = easeOut(clamp(t / 0.12)), heat = (t < 0.18 ? 1 : 1 - smooth((t - 0.18) / 0.82)) * p.al;
    const trace = () => {
      ctx.beginPath();
      for (const arm of p.arms) {
        const n = Math.max(2, Math.ceil(arm.length * open));
        ctx.moveTo(p.x, p.y);
        for (let i = 0; i < n; i++) ctx.lineTo(p.x + arm[i][0], p.y + arm[i][1]);
        for (let i = 1; i < n; i++) if (arm[i][2]) { ctx.moveTo(p.x + arm[i][0], p.y + arm[i][1]); ctx.lineTo(p.x + arm[i][0] + arm[i][2], p.y + arm[i][1] + arm[i][3]); } // a side crack
      }
    };
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = L ? `rgba(170,24,8,${0.5 * heat})` : `rgba(255,56,10,${0.42 * heat})`; ctx.lineWidth = p.wd * 3.4; trace(); ctx.stroke();
    ctx.strokeStyle = L ? `rgba(255,110,20,${0.9 * heat})` : `rgba(255,150,40,${0.9 * heat})`; ctx.lineWidth = p.wd * 1.5; trace(); ctx.stroke();
    ctx.strokeStyle = `rgba(255,246,196,${heat * heat})`; ctx.lineWidth = p.wd * 0.55; trace(); ctx.stroke();
    ctx.restore();
  }
  const crack = (half, jag) => [-1, 1].map((d) => {
    const arm = [];
    for (let i = 1, n = 5; i <= n; i++) arm.push([d * half * (i / n) * rand(0.85, 1.1), rand(-1, 1) * jag * (1 - (i / n) * 0.5), i > 1 && Math.random() < 0.4 ? d * rand(1, 3.5) : 0, rand(1.2, 4) * (Math.random() < 0.5 ? -1 : 1) * 0.8]);
    return arm;
  });
  /** A circle of summoning: two rings, a star turned point-down, signs between the rings. */
  const SIGNS = [[[0, -4.5, 0, 4.5], [0, -4.5, 3, -2], [0, -1, 3, 1.5]], [[-2.5, 4.5, -2.5, -4.5], [-2.5, -4.5, 2.5, -1], [2.5, -1, 2.5, 4.5]], [[-3, -4.5, 3, 4.5], [3, -4.5, -3, 4.5]], [[0, -4.5, 0, 4.5], [-3, 1.5, 0, -1.5], [3, 1.5, 0, -1.5]], [[-3, -4.5, 0, 0], [0, 0, -3, 4.5], [0, 0, 3, 0]], [[0, -4.5, 3, 0], [3, 0, 0, 4.5], [0, 4.5, -3, 0], [-3, 0, 0, -4.5]]];
  function sigilS(L, q) {
    return sprite(`sigil|${L}|${q}`, () => paint(200, 200, q, (x) => {
      x.translate(100, 100);
      const figure = () => {
        for (const r of [93, 76, 30]) { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
        x.beginPath();
        for (let i = 0; i <= 5; i++) { const an = Math.PI / 2 + (i * 2 * TAU) / 5; x.lineTo(Math.cos(an) * 76, Math.sin(an) * 76); }
        x.closePath(); x.stroke();
        for (let i = 0; i < 20; i++) {
          x.save(); x.rotate((i / 20) * TAU + 0.08); x.translate(0, -84.5);
          x.beginPath(); for (const [x0, y0, x1, y1] of SIGNS[(i * 7) % SIGNS.length]) { x.moveTo(x0, y0); x.lineTo(x1, y1); } x.stroke();
          x.restore();
        }
      };
      if (!L) { x.filter = `blur(${3 * q}px)`; x.strokeStyle = '#ff4a10'; x.lineWidth = 5; figure(); x.filter = 'none'; }
      x.strokeStyle = L ? '#a8160a' : '#ff7a22'; x.lineWidth = 2.4; figure();
      x.strokeStyle = L ? '#ff8a2a' : '#ffe8b0'; x.lineWidth = 0.9; figure();
    }));
  }
  function drawSigil(ctx, p) {
    const a = p.age++, t = a / p.T, L = p.L, inn = easeOut(clamp(t / 0.22)), out = t > 0.6 ? smooth((t - 0.6) / 0.4) : 0;
    const sc = (p.d / 200) * (0.74 + 0.26 * inn + out * 0.1), flick = 0.84 + 0.16 * Math.sin(a * 1.1) * Math.sin(a * 0.37 + 1);
    ctx.save(); ctx.globalCompositeOperation = L ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, inn * 1.5) * (1 - out) * flick * p.al;
    ctx.translate(p.x, p.y); ctx.scale(1, p.tilt);
    if (inn < 1) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.d, -Math.PI / 2, -Math.PI / 2 + TAU * inn + 0.001); ctx.closePath(); ctx.clip(); } // lit round the circle like a fuse
    ctx.rotate(p.rot + a * 0.006);
    ctx.drawImage(p.sp.c, -100 * sc, -100 * sc, 200 * sc, 200 * sc);
    ctx.restore();
  }

  FX.hellfire = {
    burst(c) {
      const { fx, P, x, y, enter, k, sz, cw, ch, alpha } = c, L = isL(), n = fx.parts.length, lite = n > 150, bare = n > 300, base = y + ch * 0.46, glow = L ? null : fireGlow(), hell = hellGlow();
      const flame = (fx0, fy0, h, w, delay, T, vx = 0, vy = 0) => P.push(part(T + delay, drawFlame, { x: fx0, y: fy0, h, w, delay, ph: rand(0, TAU), vx, vy, drift: rand(-0.06, 0.06), rise: ch * 0.5, al: alpha, L, glow: L || lite ? null : hell }));
      const ember = (ex, ey, vx, vy, s, T, delay = 0) => P.push(part(T + delay, drawEmber, { x: ex, y: ey, vx, vy, g: -0.012, s, delay, ph: rand(0, TAU), curl: rand(0.2, 0.55), al: 1, L, glow }));
      if (!enter) { // the character catches: fire off its top, a crack glowing under its foot
        const at = typedAt(c), fx0 = at.cx, low = isLow(fx, ch), top = low ? base : y - ch * 0.4, foot = low ? base : (at.cy != null ? at.cy : y) + ch * 0.46, gw = at.gw;
        flame(fx0, foot, (ch * rand(1.5, 2.05) + (low ? 0 : ch * 0.8)) * sz * (low ? 0.82 : 1), gw * rand(1.35, 1.7) * sz, 0, rand(25, 32));
        if (bare) return;
        if (!lite) {
          flame(fx0 - gw * rand(0.4, 0.7), foot, (ch * rand(0.65, 1.05) + ch * 0.5) * sz, cw * 0.85 * sz, 2, 21);
          flame(fx0 + gw * rand(0.4, 0.7), foot, (ch * rand(0.6, 1) + ch * 0.5) * sz, cw * 0.85 * sz, 3, 22);
          P.push(part(46, drawFissure, { x: fx0, y: foot + 1, arms: crack((gw * 0.5 + cw * 1.1) * sz, ch * 0.09), wd: 0.9 + 0.3 * sz, al: alpha, L }));
        }
        for (let i = 0, m = lite ? 1 : Math.max(2, Math.round(3.4 * k)); i < m; i++) ember(fx0 + rand(-0.6, 0.6) * gw, top - rand(0, 0.7) * ch, rand(-0.6, 0.6), -rand(1.1, 2.6) * sz, rand(0.8, 1.6) * sz, rand(26, 46));
        return;
      }
      const sz0 = sz * fitOf(fx, ch), d = ch * 6.4 * sz0, tilt = 0.4; // sized to the room there is
      P.push(part(100, drawSigil, { x, y: base, d, tilt, rot: rand(0, TAU), al: alpha, L, sp: sigilS(L, scaleOf(fx)) }));
      P.push(part(60, drawFissure, { x, y: base + 1, arms: crack(d * 0.42, ch * 0.16), wd: 1.5 * sz0, al: alpha, L }));
      for (const [dx, hh, ww, dl] of [[0, 5.6, 2.6, 4], [-1.05, 3.8, 1.9, 7], [1.05, 3.6, 1.9, 8], [-2.1, 2.3, 1.4, 11], [2.1, 2.2, 1.4, 12]]) flame(x + dx * cw * sz0, base, ch * hh * sz0 * rand(0.9, 1.1), cw * ww * sz0, dl, rand(34, 42));
      if (bare) return;
      for (let i = 0, m = lite ? 5 : 10; i < m; i++) { // fire standing round the circle
        const an = (i / m) * TAU + 0.3, fx0 = x + Math.cos(an) * d * 0.44, fy0 = base + Math.sin(an) * d * 0.44 * tilt;
        flame(fx0, fy0, ch * rand(0.8, 1.3) * sz0 * (0.8 + 0.35 * Math.sin(an)), cw * 0.9 * sz0, 10 + ((i * 3) % 7), rand(24, 34));
      }
      for (let i = 0, m = lite ? 6 : Math.max(8, Math.round(15 * Math.sqrt(k))); i < m; i++) { const an = rand(-Math.PI * 0.92, -Math.PI * 0.08), sp = rand(1.6, 4.6) * sz0; ember(x + rand(-1.5, 1.5) * cw, base - rand(0, 1) * ch, Math.cos(an) * sp * 0.7, Math.sin(an) * sp, rand(0.9, 2) * sz0, rand(34, 66), (Math.random() * 12) | 0); }
    },
  };

  /* ====================================================================================================== */
  /* 핏자국: blood lands with a splat, throws drops, and runs. Enter rakes claws across the line.             */
  /* ====================================================================================================== */

  /** A splat: an uneven blot with fingers, drops thrown clear of it, a wet glint. */
  function splatS(v, q) {
    return sprite(`splat|${v}|${q}`, () => paint(64, 64, q, (x) => {
      const R = rng(v * 977 + 5), cx = 32, cy = 32, N = 26, r0 = 10 + R() * 2.5, pts = [];
      let gap = 0;
      for (let i = 0; i < N; i++) { // mostly round, with a few fingers where it burst outward
        const an = (i / N) * TAU + (R() - 0.5) * 0.08; let r = r0 * (0.86 + R() * 0.24);
        if (gap <= 0 && R() < 0.2) { r *= 1.55 + R() * 0.95; gap = 3; } else gap--;
        pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.94]);
      }
      const blot = new Path2D(), mid = (i) => [(pts[i % N][0] + pts[(i + 1) % N][0]) / 2, (pts[i % N][1] + pts[(i + 1) % N][1]) / 2];
      blot.moveTo(...mid(0));
      for (let i = 1; i <= N; i++) blot.quadraticCurveTo(pts[i % N][0], pts[i % N][1], ...mid(i));
      blot.closePath();
      const drop = (an, d, len, wd) => { // thrown outward: round at the far end, a tail back toward the blot
        x.save(); x.translate(cx + Math.cos(an) * d, cy + Math.sin(an) * d); x.rotate(an);
        x.beginPath(); x.moveTo(-len * 1.6, 0); x.quadraticCurveTo(-len * 0.3, -wd, len * 0.4, -wd * 0.9); x.arc(len * 0.4, 0, wd * 0.9, -Math.PI / 2, Math.PI / 2); x.quadraticCurveTo(-len * 0.3, wd, -len * 1.6, 0); x.fill();
        x.restore();
      };
      const g = x.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, r0 * 1.7);
      g.addColorStop(0, '#cf1b1d'); g.addColorStop(0.5, '#a00d13'); g.addColorStop(1, '#5e0407');
      x.fillStyle = g; x.fill(blot);
      for (let i = 0; i < 10; i++) drop(R() * TAU, r0 * (1.45 + R() * 1.25), 1.2 + R() * 3.6, 0.6 + R() * 1.3);
      x.fillStyle = '#a30e14';
      for (let i = 0; i < 9; i++) { const an = R() * TAU, d = r0 * (1.7 + R() * 1.2); x.beginPath(); x.arc(cx + Math.cos(an) * d, cy + Math.sin(an) * d, 0.35 + R() * 0.7, 0, TAU); x.fill(); }
      x.strokeStyle = 'rgba(64,0,4,0.55)'; x.lineWidth = 0.9; x.stroke(blot);
      x.save(); x.clip(blot);
      x.fillStyle = 'rgba(255,186,176,0.6)'; x.beginPath(); x.ellipse(cx - r0 * 0.32, cy - r0 * 0.36, r0 * 0.3, r0 * 0.13, -0.6, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,214,206,0.7)'; x.beginPath(); x.arc(cx + r0 * 0.12, cy - r0 * 0.5, r0 * 0.07, 0, TAU); x.fill();
      x.restore();
    }));
  }
  function drawSplat(ctx, p) {
    const a = p.age++, t = a / p.T;
    const sc = (p.d / 64) * (a < 3 ? 0.4 + 0.72 * (a / 3) : a < 7 ? 1.12 - 0.12 * ((a - 3) / 4) : 1);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (t > 0.42 ? 1 - smooth((t - 0.42) / 0.58) : 1) * p.al;
    put(ctx, p.sp, p.x, p.y, sc, p.rot);
    ctx.restore();
  }
  /** A run of blood: a thin trail and the bead at the end of it, slowing as it goes. */
  function drawDrip(ctx, p) {
    const a = p.age++ - p.delay;
    if (a < 0) return;
    const t = a / (p.T - p.delay);
    p.v = Math.max(p.vmin, p.v * 0.972); p.len = Math.min(p.max, p.len + p.v);
    const x = p.x, y0 = p.y, y1 = p.y + p.len, r = p.w * (0.95 + 0.3 * Math.min(1, p.len / (p.max * 0.5)));
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (t > 0.6 ? 1 - smooth((t - 0.6) / 0.4) : 1) * p.al;
    const g = ctx.createLinearGradient(0, y0, 0, y1 + r);
    g.addColorStop(0, 'rgba(126,8,12,0.6)'); g.addColorStop(0.6, 'rgba(172,14,20,0.96)'); g.addColorStop(1, 'rgba(210,28,30,1)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - p.w * 0.36, y0);
    ctx.quadraticCurveTo(x - p.w * 0.2 + p.wob, (y0 + y1) / 2, x - r * 0.9, y1 - r * 0.35);
    ctx.arc(x, y1, r, Math.PI * 1.12, -Math.PI * 0.12, true);
    ctx.quadraticCurveTo(x + p.w * 0.2 + p.wob, (y0 + y1) / 2, x + p.w * 0.36, y0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,204,194,0.62)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y1 - r * 0.2, r * 0.22, r * 0.36, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawDroplet(ctx, p) {
    const a = p.age++, t = a / p.T;
    p.vy += 0.2; p.vx *= 0.985; p.x += p.vx; p.y += p.vy;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, (1 - t) * 2.2) * p.al;
    ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillStyle = '#a60e14'; ctx.beginPath(); ctx.ellipse(0, 0, p.s * (1 + Math.min(1.6, Math.hypot(p.vx, p.vy) * 0.22)), p.s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,176,166,0.6)'; ctx.beginPath(); ctx.arc(p.s * 0.2, -p.s * 0.3, p.s * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** Four gashes, drawn left to right: torn edges, dark where they are deepest, wet along the middle. */
  const CLAW_W = 240, CLAW_H = 128;
  const GASH = [[18, -40, 176, -7, 7.6], [6, -14, 214, -10, 10], [10, 13, 208, -8, 9.4], [26, 39, 168, -5, 7]]; // x0, y0 (from the middle), length, bow, width
  function clawS(q) {
    return sprite(`claw|${q}`, () => paint(CLAW_W, CLAW_H, q, (x) => {
      const R = rng(4242);
      x.translate(0, CLAW_H / 2);
      for (const [x0, y0, len, bow, wd] of GASH) {
        const up = [], dn = [], N = 26;
        for (let i = 0; i <= N; i++) {
          const s = i / N, cy = y0 + bow * Math.sin(Math.PI * s) + s * 6, half = wd * Math.sin(Math.PI * Math.min(1, s * 1.08)) ** 0.62 * (1 - s * 0.25);
          up.push([x0 + len * s, cy - half * (0.8 + R() * 0.5)]); dn.push([x0 + len * s, cy + half * (0.8 + R() * 0.5)]);
        }
        const gash = new Path2D();
        gash.moveTo(up[0][0], (up[0][1] + dn[0][1]) / 2);
        for (const [px, py] of up) gash.lineTo(px, py);
        for (let i = N; i >= 0; i--) gash.lineTo(dn[i][0], dn[i][1]);
        gash.closePath();
        x.strokeStyle = 'rgba(58,0,4,0.75)'; x.lineWidth = 1.6; x.stroke(gash);
        const g = x.createLinearGradient(x0, 0, x0 + len, 0);
        g.addColorStop(0, '#c81a1c'); g.addColorStop(0.55, '#a40f15'); g.addColorStop(1, '#7c080c');
        x.fillStyle = g; x.fill(gash);
        x.save(); x.clip(gash);
        x.strokeStyle = 'rgba(54,0,4,0.7)'; x.lineWidth = wd * 0.5; // the depth of the cut
        x.beginPath(); for (let i = 0; i <= N; i++) { const s = i / N, cy = y0 + bow * Math.sin(Math.PI * s) + s * 6 + wd * 0.18; if (i) x.lineTo(x0 + len * s, cy); else x.moveTo(x0 + len * s, cy); } x.stroke();
        x.strokeStyle = 'rgba(255,120,104,0.75)'; x.lineWidth = Math.max(0.8, wd * 0.14); // the wet lip above it
        x.beginPath(); for (let i = 1; i <= N * 0.72; i++) { const s = i / N, cy = y0 + bow * Math.sin(Math.PI * s) + s * 6 - wd * 0.42 * Math.sin(Math.PI * s); if (i > 1) x.lineTo(x0 + len * s, cy); else x.moveTo(x0 + len * s, cy); } x.stroke();
        x.restore();
        x.fillStyle = '#a30e14'; // flung off the end of the stroke
        for (let i = 0; i < 7; i++) { const dx = x0 + len + R() * 20 - 2, dy = y0 + 6 + (R() - 0.5) * 12; x.beginPath(); x.ellipse(dx, dy, 0.6 + R() * 1.7, 0.4 + R() * 0.8, 0.2, 0, TAU); x.fill(); }
      }
    }));
  }
  function drawClaw(ctx, p) {
    const a = p.age++, t = a / p.T, sc = p.span / CLAW_W, rip = easeOut(clamp(a / 8));
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sc * p.flip, sc);
    if (a < 9) { // the stroke itself: pale lines ahead of the wound
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(255,236,232,${0.7 * (1 - a / 9)})`;
      for (const [x0, y0, len, bow, wd] of GASH) {
        ctx.lineWidth = wd * 0.5; ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const s = clamp(rip * 1.25 - 0.3 + (i / 12) * 0.3), px = x0 - CLAW_W / 2 + len * s, py = y0 + bow * Math.sin(Math.PI * s) + s * 6; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = (t > 0.5 ? 1 - smooth((t - 0.5) / 0.5) : 1) * p.al;
    ctx.beginPath(); ctx.rect(-CLAW_W / 2, -CLAW_H / 2, CLAW_W * rip, CLAW_H); ctx.clip();
    ctx.drawImage(p.sp.c, -CLAW_W / 2, -CLAW_H / 2, CLAW_W, CLAW_H);
    ctx.restore();
  }

  FX.blood = {
    burst(c) {
      const { fx, P, x, y, enter, k, sz, cw, ch } = c, q = scaleOf(fx), n = fx.parts.length, lite = n > 150, bare = n > 300;
      const drip = (dx, dy, w, max, delay, T) => P.push(part(T + delay, drawDrip, { x: dx, y: dy, w, max, delay, len: 0, v: rand(0.7, 1.3) * sz, vmin: rand(0.04, 0.12), wob: rand(-0.5, 0.5), al: 1 }));
      if (!enter) {
        const at = typedAt(c), d = ch * rand(1.55, 1.95) * sz, sx = at.cx + rand(-0.15, 0.15) * cw, sy = isLow(fx, ch) ? y - ch * 0.3 : y + ch * 0.5 + d * rand(0.1, 0.16); // just under the line
        P.push(part(78, drawSplat, { x: sx, y: sy, d, rot: rand(0, TAU), al: 1, sp: splatS((Math.random() * 7) | 0, q) }));
        if (bare) return;
        for (let i = 0, m = lite ? (Math.random() < 0.4 ? 1 : 0) : Math.random() < 0.3 * k ? 2 : 1; i < m; i++) drip(sx + rand(-0.12, 0.12) * d, sy + d * 0.08, rand(1.1, 1.8) * sz, ch * rand(0.9, 2.1) * sz, 3 + i * 5, rand(84, 104));
        for (let i = 0, m = lite ? 1 : Math.max(1, Math.round(2.4 * k)); i < m; i++) { const an = -Math.PI / 2 + rand(-1.3, 1.3), sp = rand(1.4, 3.4) * sz; P.push(part(rand(20, 30), drawDroplet, { x: sx, y: sy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.8, s: rand(0.8, 1.7) * sz, al: 1 })); }
        return;
      }
      const span = ch * 6.2 * sz * fitOf(fx, ch), flip = Math.random() < 0.5 ? 1 : -1, rot = flip * rand(0.3, 0.55), sc = span / CLAW_W;
      P.push(part(132, drawClaw, { x, y: y - ch * 0.1, span, rot, flip, al: 1, sp: clawS(q) }));
      if (bare) return;
      for (let i = 0, m = lite ? 3 : 7; i < m; i++) { // blood wells up along the gashes and runs
        const [x0, y0, len, bow, wd] = GASH[i % GASH.length], s = rand(0.18, 0.82), lx = (x0 - CLAW_W / 2 + len * s) * flip * sc, ly = (y0 + bow * Math.sin(Math.PI * s) + s * 6 + wd * 0.4) * sc;
        drip(x + lx * Math.cos(rot) - ly * Math.sin(rot), y - ch * 0.1 + lx * Math.sin(rot) + ly * Math.cos(rot), rand(1.1, 2) * sz, ch * rand(1, 2.6) * sz, 7 + ((Math.random() * 26) | 0), rand(96, 118));
      }
      for (let i = 0, m = lite ? 2 : 6; i < m; i++) { const an = rot + (flip < 0 ? Math.PI : 0) + rand(-0.5, 0.5), sp = rand(2, 5) * sz; P.push(part(rand(22, 34), drawDroplet, { x: x + Math.cos(rot) * span * 0.3 * flip, y: y + Math.sin(rot) * span * 0.3 * flip, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1, s: rand(0.9, 2) * sz, al: 1 })); }
    },
  };

  window.FX_EXT = Object.assign(window.FX_EXT || {}, FX);
})();
