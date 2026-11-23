'use strict';
/*
 * 코드 비: streams of code running down the screen in four depths. Far streams are small, dim, slightly soft and
 * slow; near ones larger, brighter and faster; the odd one nearest of all is big and out of focus. Each stream is a
 * line of real code read downward (keywords, literals and names in the accent colours, like an editor's highlighting),
 * broken now and then by a run of symbols. Its head is a bright glyph with a soft glow; what it leaves behind cools
 * from white to its colour and fades where it was written, and here and there a glyph flickers into another. Now and
 * then a stream stops for a moment, its head flickering in place, and once in a while a band of glyphs glitches
 * sideways. On a light page the code is inked over the page in deeper colours.
 *
 * Glyphs are pre-rendered into small atlases (one per depth, tone and colour); a frame is only image copies.
 */
(function () {
  const K = window.SceneKit;
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('code');
  window.BG_EXT = window.BG_EXT || {};
  const WHITE = [255, 255, 255], INK = [20, 24, 46];
  const mix = (c, d, k) => [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const accents = () => (typeof fxColors === 'function' ? fxColors() : [[143, 115, 255], [194, 102, 232], [255, 138, 91]]);
  const WARM = 250; // frames run at a build (longer than any glyph lives)
  const RND = Math.random, pick = (a) => a[(RND() * a.length) | 0];
  const FONT = "'Cascadia Mono', 'Cascadia Code', Consolas, 'D2Coding', Menlo, monospace";

  /* ---------- what the streams are made of ---------- */

  const SNIPS = [
    'const res = await fetch(url);', 'for (let i = 0; i < n; i++) {', 'return xs.map(x => x * 2);', 'if err != nil { return err }',
    'fn main() -> Result<(), Error> {', 'def __init__(self, key):', '#include <stdint.h>', 'SELECT id FROM jobs WHERE done = 0;',
    'git commit -m "wip"', 'let mut buf = Vec::new();', 'x += vx * dt; y += vy * dt;', 'while (q.length) visit(q.shift());',
    'import { useState } from "react";', 'export default class Node {}', 'match v { Some(x) => x, None => 0 }', 'printf("%d\\n", n);',
    'async fn run(&mut self) {', 'mov eax, 0x1F', 'console.log(`${a} ${b}`);', 'assert(ok); // TODO', 'npm run build && git push',
    'try { parse(s) } catch (e) {}', 'self.cache[key] = val', 'type Pair<T> = [T, T];', 'lambda k: k ** 2', 'case 0x7F: break;',
    'h = (h * 31 + c) & 0xFFFF;', 'yield* walk(node.left);', 'public static void main()', 'std::vector<int> v{1, 2, 3};',
    'chmod 755 ./run.sh', 'while true; do sleep 1; done', 'null ?? fallback', 'bits = 0b1011_0110;', 'ssh -p 22 dev@host',
  ];
  const POOL = '0123456789ABCDEFabcdef{}[]()<>=+-*/%&!?;:.#$@^~_λ→≠≤≥∑∂∞∀∃⊕·';
  const GLITCH = '░▒▓█▌▐■▪';
  const KW = new Set(['const', 'let', 'var', 'for', 'if', 'else', 'return', 'while', 'fn', 'def', 'import', 'export', 'from', 'class', 'async', 'await',
    'yield', 'match', 'type', 'true', 'false', 'null', 'nil', 'None', 'Some', 'mut', 'new', 'self', 'int', 'void', 'default', 'SELECT', 'FROM', 'WHERE',
    'mov', 'try', 'catch', 'case', 'break', 'public', 'static', 'lambda', 'do', 'done', 'sleep', 'git', 'npm', 'run', 'ssh', 'chmod', 'std', 'include']);
  /** A snippet as glyphs with their class: 0 a name, 1 a keyword, 2 a literal, 3 punctuation, -1 a space. */
  const TOKENS = SNIPS.map((s) => {
    const out = [];
    for (const m of s.matchAll(/[A-Za-z_]\w*|0[xb][0-9A-Fa-f_]+|\d+|"[^"]*"|`[^`]*`|\s+|./g)) {
      const tok = m[0];
      const cls = /^\s/.test(tok) ? -1 : /^[A-Za-z_]/.test(tok) ? (KW.has(tok) ? 1 : 0) : /^[\d"`]/.test(tok) ? 2 : 3;
      for (const ch of tok) out.push([ch, cls === -1 ? -1 : cls]);
    }
    return out;
  });
  const CHARS = [...new Set([...SNIPS.join(''), ...POOL, ...GLITCH])].filter((c) => c !== ' ');
  const GI = new Map(CHARS.map((c, i) => [c, i]));
  const POOLI = [...POOL].map((c) => GI.get(c)), GLITCHI = [...GLITCH].map((c) => GI.get(c));

  /* ---------- depths ---------- */

  // fs: glyph size; al: strength; v: speed (px a frame); dens: share of columns running; life: how long a glyph
  // stays (frames); blur: out of focus; glow: the head's glow
  const LAYERS = [
    { fs: 10, al: 0.44, v: [0.75, 1.3], dens: 0.4, life: [160, 240], blur: 0.5, glow: 0.45, pitch: 1.02 },
    { fs: 14, al: 0.56, v: [1.35, 2.2], dens: 0.2, life: [140, 200], blur: 0, glow: 0.8, pitch: 1.05 },
    { fs: 20, al: 0.72, v: [2.3, 3.3], dens: 0.1, life: [110, 160], blur: 0, glow: 1, pitch: 1.1 },
    { fs: 40, al: 0.17, v: [3.6, 4.6], dens: 0.018, life: [60, 85], blur: 2.2, glow: 0.5, pitch: 1.2 },
  ];

  /** One depth's glyphs: per colour and tone (0 hot, 1 bright, 2 settled) an atlas, and a blurred one for the head's bloom. */
  function atlases(spec, s, dpr, cols, L) {
    const fs = spec.fs * s, fsd = Math.max(5, fs * dpr), pad = Math.ceil((spec.blur * 2 + 1) * dpr) + 1;
    const cw = Math.ceil(fsd * 0.62) + pad * 2, ch = Math.ceil(fsd * 1.28) + pad * 2, per = 16, rows = Math.ceil(CHARS.length / per);
    const white = (blur) => {
      const c = K.mk(cw * per, ch * rows), x = c.getContext('2d');
      x.font = `${fsd}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
      if (blur) x.filter = `blur(${blur * dpr}px)`;
      CHARS.forEach((g, i) => x.fillText(g, (i % per) * cw + cw / 2, ((i / per) | 0) * ch + ch / 2 + fsd * 0.04));
      return c;
    };
    const tint = (src, c) => {
      const o = K.mk(src.width, src.height), x = o.getContext('2d');
      x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = rgba(c, 1); x.fillRect(0, 0, o.width, o.height);
      return o;
    };
    const base = white(spec.blur), bloom = white(spec.blur + Math.max(1.6, fs * 0.16));
    const tones = (c) => (L ? [mix(c, INK, 0.5), mix(c, INK, 0.32), mix(c, INK, 0.12)] : [mix(c, WHITE, 0.8), mix(c, WHITE, 0.36), c]);
    return {
      cw, ch, per, pad, w: cw / dpr, h: ch / dpr, // a cell in css px (padding included)
      img: cols.map((c) => tones(c).map((tc) => tint(base, tc))),
      bloom: cols.map((c) => tint(bloom, L ? mix(c, WHITE, 0.1) : mix(c, WHITE, 0.35))),
    };
  }
  function glowSpr(c, L) {
    const key = `codeGlow|${c}|${L ? 'L' : 'D'}`;
    if (K.cache.has(key)) return K.cache.get(key);
    const N = 64, cv = K.mk(N, N), x = cv.getContext('2d'), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    g.addColorStop(0, rgba(c, L ? 0.3 : 0.5)); g.addColorStop(0.3, rgba(c, L ? 0.12 : 0.2)); g.addColorStop(0.65, rgba(c, L ? 0.03 : 0.05)); g.addColorStop(1, rgba(c, 0));
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    K.cache.set(key, cv);
    return cv;
  }

  /* ---------- streams ---------- */

  function feed(st) { // the next glyph a stream writes: its line of code, then a short run of symbols, then another line
    if (st.si >= st.src.length) {
      if (RND() < 0.55) { st.src = []; for (let k = 0, n = 2 + ((RND() * 6) | 0); k < n; k++) st.src.push([POOL[(RND() * POOL.length) | 0], 3]); st.src.push([' ', -1]); }
      else st.src = pick(TOKENS).concat([[' ', -1]]);
      st.si = 0;
    }
    return st.src[st.si++];
  }
  function spawn(S, li, prefill) {
    const D = S.layers[li], sp = D.spec, cols = D.cols;
    let col = (RND() * cols) | 0;
    const taken = (c) => D.busy[c] > 0 || (c > 0 && D.busy[c - 1] > 0) || (c < cols - 1 && D.busy[c + 1] > 0);
    for (let k = 0; k < 8 && taken(col); k++) col = (RND() * cols) | 0; // a free column, not beside another, if one turns up
    D.busy[col] += 1;
    const v = (sp.v[0] + RND() * (sp.v[1] - sp.v[0])) * S.vs, life = sp.life[0] + RND() * (sp.life[1] - sp.life[0]);
    const st = { li, col, x: D.x0 + col * D.pitch, v, life, y: -(1 + RND() * 7) * D.lh, row: 0, cells: [], src: [], si: 0, pause: 0, hue: RND() < 0.12 ? 1 : 0, k: 0.7 + RND() * 0.55, mut: 0 }; // k: some streams brighter than others
    st.si = (RND() * 8) | 0; st.src = pick(TOKENS); st.si = Math.min(st.si, st.src.length);
    if (prefill) st.y = -7 * D.lh + RND() * (S.h + 7 * D.lh + st.v * st.life) - WARM * st.v; // anywhere in its fall: the build then runs it on into its steady state
    st.row = Math.floor(st.y / D.lh);
    return st;
  }

  /** One frame of a stream: the head moves on and writes a glyph into each row it leaves; old glyphs go. */
  function step(S, i) {
    const st = S.streams[i], D = S.layers[st.li], lh = D.lh, T = S.t;
    if (st.pause > 0) st.pause -= 1;
    else {
      st.y += st.v;
      if (!S.pv && RND() < 0.0007 && st.y > 0 && st.y < S.h * 0.85) st.pause = 40 + ((RND() * 100) | 0); // the odd stream stops a moment
    }
    const row = Math.floor(st.y / lh);
    while (st.row < row) {
      const g = feed(st);
      if (st.row >= 0 && st.row < D.rows && g[1] >= 0) st.cells.push({ r: st.row, g: GI.get(g[0]), c: g[1], b: T, m: 0 }); // nothing is written below the screen: a stream that has left it fades and starts again
      st.row += 1;
    }
    while (st.cells.length && T - st.cells[0].b > st.life) st.cells.shift();
    if (RND() < 0.06 && st.cells.length) { const c = st.cells[(RND() * st.cells.length) | 0]; c.g = pick(POOLI); c.m = T; } // a glyph flickers into another
    if (st.y - lh > S.h && !st.cells.length) { D.busy[st.col] -= 1; S.streams[i] = spawn(S, st.li, false); }
  }

  function build(w, h, dpr, L, cols, pv) {
    const s = pv ? 0.52 : Math.max(0.8, Math.min(1.3, Math.min(w, h * 1.6) / 1200));
    const S = { geo: `${w}x${h}@${dpr}`, w, h, pv, s, vs: pv ? 0.5 : s, t: 0, streams: [], layers: [], glitch: null, nextGlitch: 200 + RND() * 200, glow: cols.map((c) => glowSpr(L ? mix(c, WHITE, 0.15) : c, L)) };
    LAYERS.forEach((sp, li) => {
      if (pv && li === 3) return;
      const A = atlases(sp, s, dpr, cols, L), fs = sp.fs * s, lh = Math.round(fs * 1.16 * 10) / 10, pitch = fs * 0.72 * sp.pitch;
      const ncol = Math.max(3, Math.floor(w / pitch)), x0 = (w - (ncol - 1) * pitch) / 2;
      S.layers.push({ spec: sp, A, fs, lh, pitch, cols: ncol, x0, busy: new Uint8Array(ncol), rows: Math.ceil(h / lh) + 2 });
    });
    S.layers.forEach((D, li) => {
      const n = li === 3 ? Math.max(1, Math.round((w * h) / 520000)) : Math.max(pv ? 2 : 3, Math.round(D.cols * D.spec.dens));
      D.want = n;
      for (let k = 0; k < n; k++) S.streams.push(spawn(S, li, true));
    });
    for (let f = 0; f < WARM; f++) { S.t += 1; for (let i = 0; i < S.streams.length; i++) step(S, i); } // run it on until it looks as it always will
    return S;
  }

  function draw(bg, ctx, w, h, t) {
    const pv = h < 90, L = K.light(), dpr = bg.dpr || 1, cols = accents();
    const pk = `${cols.join('|')}${L ? 'L' : 'D'}`;
    let S = bg.codeSt;
    if (!S || S.geo !== `${w}x${h}@${dpr}` || S.pk !== pk) { S = bg.codeSt = build(w, h, dpr, L, cols, pv); S.pk = pk; }
    S.t += 1;
    const T = S.t;

    // now and then a band across the screen glitches for a moment: what is in it jumps sideways, garbled and split
    if (!pv && !S.glitch && --S.nextGlitch <= 0) {
      const y0 = RND() * h * 0.9;
      S.glitch = { y0, y1: y0 + (18 + RND() * 60) * S.s, age: 0, dur: 5 + ((RND() * 8) | 0), twice: RND() < 0.55 };
      S.nextGlitch = 240 + RND() * 420;
    }
    const G = S.glitch;
    if (G && ++G.age > G.dur) { if (G.twice) { G.twice = false; G.age = -5 - ((RND() * 9) | 0); G.y0 += (RND() - 0.5) * 40; G.y1 = G.y0 + (14 + RND() * 50) * S.s; } else S.glitch = null; }
    const gOn = G && G.age > 0, gdx = gOn ? (((T * 13) % 7) - 3) * 4 * S.s + (RND() - 0.5) * 6 : 0; // the band's jump this frame

    ctx.save();
    ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
    for (let li = 0; li < S.layers.length; li++) {
      const D = S.layers[li], A = D.A, sp = D.spec, lh = D.lh, aw = A.w, ah = A.h, cw = A.cw, ch = A.ch, per = A.per;
      const strength = sp.al * (L ? 1.05 : 1);
      for (let i = 0; i < S.streams.length; i++) {
        const st = S.streams[i];
        if (st.li !== li) continue;
        step(S, i);
        if (S.streams[i] !== st) continue;

        // the trail: hot just behind the head, cooling to its colour, fading in place
        const x = Math.round((st.x - aw / 2) * dpr) / dpr;
        for (let k = 0; k < st.cells.length; k++) {
          const c = st.cells[k], age = (T - c.b) / st.life;
          let a = Math.pow(1 - age, 1.25) * strength * st.k * (c.c === 3 ? 0.75 : 1) * (age < 0.05 ? 1.25 : 1);
          if (c.m && T - c.m < 5) a = Math.min(1, a * 1.8);
          if (a < 0.012) continue;
          const tone = age < 0.07 ? 0 : age < 0.26 ? 1 : 2, hue = c.c === 1 ? 1 : c.c === 2 ? 2 : st.hue;
          let gx = x, g = c.g, img = A.img[hue][tone];
          const yy = Math.round((c.r * lh + lh / 2 - ah / 2) * dpr) / dpr;
          if (gOn && yy + ah > G.y0 && yy < G.y1) { // the glitch: shifted, garbled, split
            gx += gdx + (((i * 7 + T) % 3) - 1) * 2 * S.s;
            if ((T + k + i) % 3 === 0) g = pick(GLITCHI); else if ((T + k) % 4 === 0) g = pick(POOLI);
            img = A.img[2][1];
            ctx.globalAlpha = Math.min(1, a * 0.75);
            ctx.drawImage(A.img[0][1], (g % per) * cw, ((g / per) | 0) * ch, cw, ch, gx - 3 * S.s, yy, aw, ah);
            a = Math.min(1, a * 1.4 + 0.05);
          }
          ctx.globalAlpha = a;
          ctx.drawImage(img, (g % per) * cw, ((g / per) | 0) * ch, cw, ch, gx, yy, aw, ah);
        }

        // the head: a bright glyph in a soft glow (flickering in place while the stream waits)
        const hy = st.y - lh / 2;
        if (hy < -lh || hy > h + lh) continue;
        let hg = st.src[st.si] && st.src[st.si][1] >= 0 ? GI.get(st.src[st.si][0]) : POOLI[(st.col * 7 + st.row) % POOLI.length];
        let ha = Math.min(1, strength * 1.55);
        if (st.pause > 0) { hg = POOLI[(((T / 3) | 0) * 7 + st.col * 13) % POOLI.length]; ha *= ((T + st.col * 5) >> 3) & 1 ? 1 : 0.45; }
        const hue = st.hue, gs = (pv ? 10 : 26) * D.fs / 14 * sp.glow;
        ctx.globalAlpha = Math.min(1, ha * (L ? 0.55 : 0.75) * sp.glow);
        ctx.drawImage(S.glow[hue], st.x - gs, hy - gs, gs * 2, gs * 2);
        if (!pv && !L) { ctx.globalAlpha = Math.min(1, ha * (L ? 0.35 : 0.6)); ctx.drawImage(A.bloom[hue], (hg % per) * cw, ((hg / per) | 0) * ch, cw, ch, st.x - aw / 2, hy - ah / 2, aw, ah); }
        ctx.globalAlpha = ha;
        ctx.drawImage(A.img[hue][0], (hg % per) * cw, ((hg / per) | 0) * ch, cw, ch, st.x - aw / 2, hy - ah / 2, aw, ah);
      }
    }
    ctx.restore();
  }

  window.BG_EXT.code = draw;
})();
