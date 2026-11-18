'use strict';
/*
 * Shared helpers for typing effects kept in their own files, and the registry of submit effects.
 *
 * window.FX_SUBMIT[kind] = function (c) { … }  — what a typing effect does when the user submits (Enter).
 *   It replaces the effect's ordinary burst only for a real submit (o.submit: the terminal, the composer, the
 *   picker preview). Celebrations also call bursts with { enter: true }, and those keep the old look.
 *
 * c: { fx, P, x, y, o, k, sz, cw, ch, cols, pick, alpha, rnd, L }
 *   fx    the layer (fx.w, fx.h in CSS px, fx.parts, fx.dpr, fx.canvas)
 *   P     fx.parts: push particles here. A particle is { life: 1, decay, draw(ctx, p, fx) }: drawFx lowers life by
 *         decay every frame (about 60 fps) and drops it at 0; draw() paints it. ctx is in CSS px with the dpr
 *         transform set and globalCompositeOperation 'lighter' on entry: save / restore whatever you change.
 *   x, y  the cursor cell's centre after the Enter (fallback anchor)
 *   o     { k, cw, ch, text: '\r', pre, line, submit: true } — pre: { left, top } the cursor cell when Enter was
 *         pressed (the end of what was submitted); line: { text, left, top, cols } the submitted text on that row
 *         (may be missing: picker preview, composer)
 *   k     intensity 0.3..2; sz = 0.65 + 0.35 k; alpha; cols: accent colours [[r,g,b] × 3]; pick() one of them
 *   L     light mode (the page is light: additive light does not show, draw with source-over)
 */
window.FX_SUBMIT = window.FX_SUBMIT || {};
window.FXKit = (() => {
  const TAU = Math.PI * 2;
  const cache = new Map();
  /** A cached offscreen picture (least recently used dropped past 200). */
  function sprite(key, make) {
    let s = cache.get(key);
    if (s) { cache.delete(key); cache.set(key, s); return s; }
    s = make(); cache.set(key, s);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return s;
  }
  /** A canvas painted in CSS px at device scale q → { c, w, h }. */
  function paint(w, h, q, draw) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * q)); c.height = Math.max(1, Math.ceil(h * q));
    const x = c.getContext('2d');
    x.scale(q, q); x.lineCap = 'round'; x.lineJoin = 'round';
    draw(x);
    return { c, w, h };
  }
  /** Draw a sprite centred on (x, y), scaled and turned. */
  function put(ctx, s, x, y, sc = 1, rot = 0) {
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(s.c, -s.w * 0.5 * sc, -s.h * 0.5 * sc, s.w * sc, s.h * sc); ctx.restore(); } else ctx.drawImage(s.c, x - s.w * 0.5 * sc, y - s.h * 0.5 * sc, s.w * sc, s.h * sc);
  }
  /** A particle that lives T frames; p.age counts frames (advance it yourself in draw: p.age++). */
  const part = (T, draw, extra) => Object.assign({ life: 1, decay: 1 / T, T, age: 0, draw }, extra);
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ease = {
    out: (t) => 1 - (1 - t) ** 3,
    in: (t) => t * t,
    smooth: (t) => t * t * (3 - 2 * t),
    back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
    elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const lightMode = () => (typeof isLight === 'function' ? isLight() : false); // app.js's own (a global lexical binding, not on window)
  const scaleOf = (fx) => Math.min(2, Math.max(1, Math.round((fx.dpr || 1) * 4) / 4));
  /** A soft round light in one colour ramp (96 px sprite). stops: [[offset, css colour], …] */
  const glow = (name, stops) => sprite(`kglow|${name}`, () => paint(96, 96, 1, (x) => {
    const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    for (const [o, c] of stops) g.addColorStop(o, c);
    x.fillStyle = g; x.fillRect(0, 0, 96, 96);
  }));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  /** A colour mixed toward white (t > 0) or black (t < 0). */
  const shade = (c, t) => (t >= 0 ? c.map((v) => Math.round(v + (255 - v) * t)) : c.map((v) => Math.round(v * (1 + t))));

  /**
   * Where a submit happens, with fallbacks: { x, y } the end of the submitted text (the cursor when Enter was
   * pressed), { x0, x1, y } the span of the submitted text on its row (at least a few cells), text, small (a
   * short canvas such as the picker preview: keep everything inside it), fit (0.42..1 scale for small canvases).
   */
  function anchor(c) {
    const { fx, o, cw, ch } = c;
    const small = fx.h < ch * 5, fit = clamp(fx.h / (ch * 7), 0.42, 1);
    let x = c.x, y = c.y, x0, x1, text = '';
    if (o.pre) { x = o.pre.left + cw * 0.5; y = o.pre.top + ch * 0.5; }
    if (o.line && o.line.cols > 0) { x0 = o.line.left; x1 = o.line.left + o.line.cols * cw; y = o.line.top + ch * 0.5; text = o.line.text || ''; }
    else { x1 = x; x0 = Math.max(cw, x - cw * 8 * fit); }
    if (x1 - x0 < cw * 3) x0 = Math.max(0, x1 - cw * 3);
    if (small) { y = fx.h / 2; x = clamp(x, fx.w * 0.2, fx.w * 0.8); x0 = Math.max(4, x - fx.w * 0.3); x1 = Math.min(fx.w - 4, x + fx.w * 0.3); }
    return { x, y, x0, x1, text, small, fit };
  }
  /** Fewer pieces when the layer is already busy (fast typing, a paste): 1 → as many as asked, 0.25 at the most crowded. */
  const thin = (fx) => (fx.parts.length > 300 ? 0.25 : fx.parts.length > 150 ? 0.5 : 1);

  return { TAU, sprite, paint, put, part, clamp, ease, rand, rng, isLight: lightMode, scaleOf, glow, rgba, shade, anchor, thin };
})();

/* Test helpers (the harness): hold the stage's effect layer at frame n of whatever is playing, then let it run on. */
window.__fxHold = (n) => { const fx = stageFx(); cancelAnimationFrame(fx.raf); fx.raf = -1; for (let i = 0; i < n; i++) drawFx(fx); };
window.__fxRun = () => { const fx = stageFx(); fx.raf = 0; fx.kick(); };
