'use strict';
/*
 * Scene backgrounds (으스스한 숲 · 천상 · 마왕성 · 지옥 · 사이버펑크 · 한국의 밤): the shared kit.
 *
 * A scene never paints its own backdrop: the canvas stays transparent and the terminal theme's background
 * shows through. Only dark "ink" (silhouettes) and light "haze" (glow, fog, lights) are laid over it, so a
 * scene sits in any colour theme and its picker preview matches the other backgrounds.
 * Still scenery is painted once into offscreen layers (rebuilt on resize or a light / dark switch); only
 * light, weather and creatures are drawn every frame.
 */
window.SceneKit = (() => {
  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const light = () => (typeof isLight === 'function' ? isLight() : false);

  /** Seeded random numbers: a scene keeps its composition when it is rebuilt. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Tileable fractal value noise: f(u, v) in 0..1, repeating every px × py cells. */
  function fbm(seed, px, py, oct) {
    const R = rng(seed);
    const grids = [];
    for (let o = 0; o < oct; o++) {
      const gx = px << o, gy = py << o;
      const g = new Float32Array(gx * gy);
      for (let i = 0; i < g.length; i++) g[i] = R();
      grids.push({ gx, gy, g });
    }
    const sm = (t) => t * t * (3 - 2 * t);
    return (u, v) => {
      let val = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < oct; o++) {
        const { gx, gy, g } = grids[o];
        const x = u * (1 << o), y = v * (1 << o);
        const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
        const x0 = ((ix % gx) + gx) % gx, x1 = (x0 + 1) % gx, y0 = ((iy % gy) + gy) % gy, y1 = (y0 + 1) % gy;
        const a = g[y0 * gx + x0], b = g[y0 * gx + x1], c = g[y1 * gx + x0], d = g[y1 * gx + x1];
        val += amp * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
        tot += amp; amp *= 0.5;
      }
      return val / tot;
    };
  }

  /**
   * A white noise texture whose alpha is the noise (fog, cloud, smoke, lava crust), cached by key.
   * o: { px, py, oct, lo, hi, warp, env: 'band' | 'up' | 'down' | undefined, seed }
   */
  function noiseTex(key, W, H, o) {
    if (cache.has(key)) return cache.get(key);
    const f = fbm(o.seed || 1, o.px, o.py, o.oct || 4);
    const f2 = o.warp ? fbm((o.seed || 1) + 77, o.px, o.py, 2) : null;
    const c = mk(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) {
      const q = (j + 0.5) / H;
      const env = o.env === 'sea' ? 1 : o.env === 'band' ? Math.pow(Math.sin(Math.PI * q), o.envPow || 0.9) : o.env === 'up' ? Math.min(1, q * 2.2) : o.env === 'down' ? Math.min(1, (1 - q) * 2.2) : 1;
      for (let i = 0; i < W; i++) {
        let u = (i / W) * o.px, v = (j / H) * o.py;
        if (f2) { const du = (f2(u + 3.1, v + 1.7) - 0.5) * o.warp, dv = (f2(u + 9.2, v + 5.3) - 0.5) * o.warp; u += du; v += dv; }
        let al = o.vein ? 1 - Math.abs(f(u, v) - 0.5) / o.vein : (f(u, v) - o.lo) / (o.hi - o.lo); // vein: thin lines where the noise crosses its middle
        al = al < 0 ? 0 : al > 1 ? 1 : al;
        al = al * al * (3 - 2 * al);
        if (o.env === 'sea') { const b = Math.max(0, Math.min(1, (q - 0.42) / 0.5)); al = Math.max(al * Math.min(1, q * 2.6), b * b * (3 - 2 * b)); } // billows on top, solid below
        const k = (j * W + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(al * env * 255);
      }
    }
    x.putImageData(img, 0, 0);
    c.__k = key;
    cache.set(key, c);
    return c;
  }
  /** The texture in one colour (its alpha kept). */
  function tint(tex, color) {
    const key = `${tex.__k}|${color}`;
    if (cache.has(key)) return cache.get(key);
    const c = mk(tex.width, tex.height), x = c.getContext('2d');
    x.drawImage(tex, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    c.__k = key;
    cache.set(key, c);
    return c;
  }
  /** A strip of texture tiled across the width, scrolled by off. */
  function band(ctx, tex, W, y, hh, tileW, off, alpha) {
    if (alpha <= 0.004) return;
    const o = ((off % tileW) + tileW) % tileW;
    ctx.globalAlpha = alpha;
    let x0 = Math.round(-o); // tiles abut on whole pixels: no seam, no doubled edge
    for (let k = 1; x0 < W; k++) { const x1 = Math.round(-o + k * tileW); ctx.drawImage(tex, x0, y, x1 - x0, hh); x0 = x1; }
    ctx.globalAlpha = 1;
  }
  /**
   * Mist. On a dark theme it is a pale band laid over the picture; on a light one it wears the picture away to
   * the page instead, whatever colour the page is (a white band would smudge a cream or grey theme).
   */
  function mist(ctx, tex, W, y, hh, tileW, off, alpha) {
    if (!light()) return band(ctx, tex, W, y, hh, tileW, off, alpha);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; band(ctx, tex, W, y, hh, tileW, off, alpha); ctx.restore();
  }
  /** Texture tiled both ways inside a rectangle (clipped), scrolled by (ox, oy). */
  function tile(ctx, tex, rx, ry, rw, rh, tw, th, ox, oy, alpha) {
    if (alpha <= 0.004) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.globalAlpha = alpha;
    const sx = ((ox % tw) + tw) % tw, sy = ((oy % th) + th) % th;
    const xs = [], ys = [];
    for (let k = 0; rx - sx + k * tw < rx + rw + tw; k++) xs.push(Math.round(rx - sx + k * tw));
    for (let k = 0; ry - sy + k * th < ry + rh + th; k++) ys.push(Math.round(ry - sy + k * th));
    for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) ctx.drawImage(tex, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
    ctx.restore();
  }

  /** An offscreen layer drawn in CSS pixels (crisp on HiDPI, capped so huge windows stay light). */
  function layer(W, H, dpr) {
    const q = Math.max(0.75, Math.min(dpr || 1, 2, Math.sqrt(3.4e6 / Math.max(1, W * H))));
    const c = mk(W * q, H * q), x = c.getContext('2d');
    x.scale(q, q);
    x.lineCap = 'round'; x.lineJoin = 'round';
    return [c, x];
  }
  /** The scene's coordinate space. Picker previews (a short strip) look through a window onto a taller scene. */
  function view(w, h, anchor = 0.5, zoom = 1.7) {
    const pv = h < 90;
    const H = pv ? Math.round(h * zoom) : h;
    return { W: w, H, oy: pv ? (H - h) * anchor : 0, pv, u: Math.min(w, H), z: pv ? 0.42 : 1 }; // z: scale for specks and hairlines measured in pixels
  }
  /** The scene's static layers, rebuilt when the size, pixel ratio or light / dark mode changes. */
  function scene(bg, V, build) {
    const key = `${V.W}x${V.H}@${bg.dpr}${light() ? 'L' : 'D'}`;
    if (!bg.scene || bg.scene.key !== key) { bg.scene = build(); bg.scene.key = key; }
    return bg.scene;
  }

  /**
   * Set a silhouette layer into the picture at the given strength. It hides what is behind it rather than letting
   * it show through, so overlapping layers read as solid shapes at any strength (they are faint in light mode).
   */
  function put(ctx, layer, W, H, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.drawImage(layer, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0, W, H);
    ctx.restore();
  }

  /** The same for a sprite (a gear, an airship, a train): it hides what is behind it. Works under any transform. */
  function stamp(ctx, img, x, y, w, h, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.drawImage(img, x, y, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  /** A soft radial glow; stops: [[offset, colour], …]; sx / sy squash it into an ellipse. */
  function glow(ctx, x, y, r, stops, sx = 1, sy = 1) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  /** A rugged skyline by midpoint displacement: n + 1 heights in 0..1 (n a power of two). */
  function ridge(R, n, rough) {
    const hts = new Float32Array(n + 1);
    hts[0] = R(); hts[n] = R();
    let step = n, amp = 1;
    while (step > 1) {
      const half = step >> 1;
      for (let i = half; i < n; i += step) hts[i] = (hts[i - half] + hts[i + half]) / 2 + (R() - 0.5) * amp;
      step = half; amp *= rough;
    }
    let mn = 1e9, mx = -1e9;
    for (const v of hts) { if (v < mn) mn = v; if (v > mx) mx = v; }
    for (let i = 0; i <= n; i++) hts[i] = (hts[i] - mn) / (mx - mn || 1);
    return hts;
  }
  function fillRidge(c, hts, x0, x1, base, amp, bottom) {
    const n = hts.length - 1;
    c.beginPath(); c.moveTo(x0, bottom);
    for (let i = 0; i <= n; i++) c.lineTo(x0 + ((x1 - x0) * i) / n, base - amp * hts[i]);
    c.lineTo(x1, bottom); c.closePath(); c.fill();
  }
  /** A closed polygon with broken, rocky edges. */
  function rock(c, R, pts, amp) {
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / (amp * 2.2)));
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      for (let k = 0; k < n; k++) {
        const t = k / n, o = k === 0 ? 0 : (R() - 0.5) * amp;
        const x = x0 + (x1 - x0) * t + nx * o, y = y0 + (y1 - y0) * t + ny * o;
        if (i === 0 && k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
    }
    c.closePath(); c.fill();
  }

  /** A bare, crooked tree: limbs taper and wander, twigs split off; stroke in the context's style. */
  function tree(c, R, x, y, len, ang, wid, depth, o) {
    let px = x, py = y, a = ang;
    const seg = 4, sl = len / seg, curl = (R() - 0.5) * 2 * (o.curl || 0);
    for (let i = 0; i < seg; i++) {
      a += (R() - 0.5) * o.wander + curl;
      const nx = px + Math.cos(a) * sl, ny = py + Math.sin(a) * sl;
      c.lineWidth = Math.max(0.5, wid * (1 - 0.36 * (i / seg)));
      c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
      if (depth > 0 && i > 0 && R() < o.twig) tree(c, R, nx, ny, len * (0.3 + R() * 0.25), a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.7), wid * 0.36, Math.min(depth - 1, 2), o);
      px = nx; py = ny;
    }
    if (depth <= 0) return;
    const n = R() < 0.3 ? 3 : 2;
    for (let i = 0; i < n; i++) tree(c, R, px, py, len * (0.6 + R() * 0.2), a + (i - (n - 1) / 2) * o.spread * (0.7 + R() * 0.6) + (R() - 0.5) * 0.3, wid * 0.62, depth - 1, o);
  }

  /** A bat (fill in the context's style); f: -1 wings down … 1 wings up. */
  function bat(c, x, y, s, f) {
    const wy = -f * s * 0.9;
    c.beginPath();
    c.moveTo(x, y - s * 0.15);
    c.lineTo(x - s * 0.12, y - s * 0.38); c.lineTo(x - s * 0.1, y - s * 0.1);
    c.quadraticCurveTo(x - s * 0.9, y - s * 0.35 + wy * 0.6, x - s * 1.9, y + wy);
    c.quadraticCurveTo(x - s * 1.5, y + wy * 0.5 + s * 0.25, x - s * 1.25, y + s * 0.45 + wy * 0.35);
    c.quadraticCurveTo(x - s * 1.0, y + s * 0.1 + wy * 0.2, x - s * 0.7, y + s * 0.5 + wy * 0.15);
    c.quadraticCurveTo(x - s * 0.45, y + s * 0.2, x - s * 0.12, y + s * 0.55);
    c.lineTo(x, y + s * 0.75);
    c.lineTo(x + s * 0.12, y + s * 0.55);
    c.quadraticCurveTo(x + s * 0.45, y + s * 0.2, x + s * 0.7, y + s * 0.5 + wy * 0.15);
    c.quadraticCurveTo(x + s * 1.0, y + s * 0.1 + wy * 0.2, x + s * 1.25, y + s * 0.45 + wy * 0.35);
    c.quadraticCurveTo(x + s * 1.5, y + wy * 0.5 + s * 0.25, x + s * 1.9, y + wy);
    c.quadraticCurveTo(x + s * 0.9, y - s * 0.35 + wy * 0.6, x + s * 0.1, y - s * 0.1);
    c.lineTo(x + s * 0.12, y - s * 0.38);
    c.closePath(); c.fill();
  }

  return { cache, mk, light, rng, fbm, noiseTex, tint, band, mist, tile, layer, put, stamp, view, scene, glow, ridge, fillRidge, rock, tree, bat };
})();
