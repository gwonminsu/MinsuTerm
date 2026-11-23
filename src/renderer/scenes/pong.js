'use strict';
/*
 * 혼자 하는 탁구: a table tennis table seen from the side and a little above, drawn faintly over the theme. Two
 * rackets with nobody holding them play on their own: the ball arcs over the net with its shadow on the table and
 * bounces once on each half; each racket runs to meet it, winds up and swings through. Mostly steady drives, now
 * and then a push, a looping topspin ball, or a lob that gets smashed. Each racket is a little slow, so sooner or
 * later a ball gets past one (or one goes into the net or long) and the next rally starts with a serve.
 *
 * The world is in metres (an ITTF table), simulated in slow motion; the camera looks along the table's side.
 * On the real background it is heard too, in time with the picture and panned to where it happens: the app's own
 * ping-pong recordings for each hit, bounce, net touch, smash and the missed ball bouncing away, and the umpire's
 * whistle when a point is decided.
 */
(function () {
  (window.BG_OWN_LIGHT = window.BG_OWN_LIGHT || new Set()).add('pong');
  const TAU = Math.PI * 2;
  const G = 9.81, BR = 0.02, LX = 1.37, LZ = 0.7625, NH = 0.1525, NZ = 0.915, TH = 0.76, E = 0.88;
  const TS = 0.52, SUB = 4, DT = TS / 30 / SUB; // slow motion: real seconds simulated per frame / per sub-step
  const REACH = 0.1; // how far from where it should be a racket can still get the ball
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;
  const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  /*
   * Strokes. B: where the racket winds up to and F: where it follows through to, relative to the contact point
   * (x counted away from the net). w: the wrist (0 upright, + the head tipped toward the net and the face closed,
   * - open), f: the face turned toward the camera (+) or away (-); each at wind-up, contact, follow-through.
   * ts / tf: seconds of the swing into the ball and of the follow-through.
   */
  const STYLE = {
    drive: { B: [0.4, -0.16, 0.06], F: [-0.3, 0.38, 0.14], w: [0.1, 0.45, 1.1], f: [1.2, 0.3, -0.45], ts: 0.2, tf: 0.3 },
    loop: { B: [0.38, -0.38, 0.06], F: [-0.2, 0.6, 0.12], w: [-0.4, 0.6, 1.35], f: [1.3, 0.25, -0.55], ts: 0.24, tf: 0.32 },
    smash: { B: [0.3, 0.42, 0.02], F: [-0.42, -0.45, 0.14], w: [-1.1, 0.45, 1.55], f: [0.9, 0.1, -0.3], ts: 0.2, tf: 0.3 },
    lob: { B: [0.15, -0.3, 0.02], F: [-0.2, 0.45, 0.05], w: [0.4, -0.55, -0.85], f: [1.0, 0.5, 0.25], ts: 0.22, tf: 0.3 },
    push: { B: [0.18, 0.04, 0.02], F: [-0.24, -0.03, 0.02], w: [-0.3, -0.5, -0.55], f: [0.85, 0.6, 0.5], ts: 0.16, tf: 0.24 },
    serve: { B: [0.25, -0.05, 0.05], F: [-0.25, 0.15, 0.04], w: [0.3, 0.4, 0.9], f: [1.3, 0.5, -0.2], ts: 0.2, tf: 0.26 },
  };
  const READY = { w: 0.75, f: 0.9 }; // the head leaning toward the net, the red face half turned to us

  /* ---------- the ball ---------- */

  /**
   * Moves the ball dt seconds: gravity plus the dip of its spin (m, m/s²: + topspin, - backspin), bouncing off
   * the table, the net and the floor at the exact moment it meets them. ev (optional) collects what it hit.
   */
  function stepBall(b, dt, ev) {
    let rem = dt;
    for (let guard = 0; guard < 4 && rem > 1e-9; guard++) {
      const g = G + b.m, [x, y, z] = b.p, [vx, vy, vz] = b.v;
      let tHit = rem, what = null;
      const yEnd = y + vy * rem - 0.5 * g * rem * rem;
      const reach = (lvl) => { // when it comes down to height lvl within this step (or -1)
        if (!(y >= lvl - 1e-7 && yEnd < lvl)) return -1;
        const tau = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (y - lvl)))) / g;
        return tau >= 0 && tau <= rem ? tau : -1;
      };
      const tt = reach(BR);
      if (tt >= 0 && Math.abs(x + vx * tt) <= LX && Math.abs(z + vz * tt) <= LZ) { tHit = tt; what = 'table'; }
      if (!what) { const tf = reach(-TH + BR); if (tf >= 0) { tHit = tf; what = 'floor'; } }
      if (vx) {
        const tn = -x / vx;
        if (tn > 1e-9 && tn <= tHit) {
          const yn = y + vy * tn - 0.5 * g * tn * tn;
          if (Math.abs(z + vz * tn) <= NZ && yn - BR < NH && yn > -0.03) { tHit = tn; what = 'net'; }
        }
      }
      b.p = [x + vx * tHit, y + vy * tHit - 0.5 * g * tHit * tHit, z + vz * tHit];
      b.v = [vx, vy - g * tHit, vz];
      rem -= tHit;
      if (what === 'table') {
        const vin = b.v[1];
        b.p[1] = BR; b.v[1] = -vin * E * (1 - 0.025 * b.m); b.v[0] *= 0.93 + 0.012 * b.m; b.v[2] *= 0.94; b.m *= 0.55;
        if (ev) ev.push(['table', b.p[0], b.p[2], -vin]);
      } else if (what === 'floor') {
        b.p[1] = -TH + BR; b.v[1] = -b.v[1] * 0.62; b.v[0] *= 0.8; b.v[2] *= 0.8; b.m = 0;
        if (ev) ev.push(['floor', b.p[0], b.v[1], b.p[2]]);
      } else if (what === 'net') {
        b.p[0] = -Math.sign(vx) * 0.024; b.v = [-vx * 0.12, Math.min(b.v[1], 0) * 0.3, vz * 0.3]; b.m = 0;
        if (ev) ev.push(['net']);
      }
    }
  }
  /** The launch velocity that lands the ball at P1 after T seconds (spin m). */
  const aimAt = (P0, P1, T, m) => [(P1[0] - P0[0]) / T, (P1[1] - P0[1]) / T + 0.5 * (G + m) * T, (P1[2] - P0[2]) / T];

  /* ---------- the players ---------- */

  function newGame() {
    const rk = [-1, 1].map((side, i) => ({
      side, p: [side * (LX + 0.5), 0.2, 0], v: [0, 0, 0], w: READY.w, f: READY.f, plan: null,
      vmax: i ? 2.7 : 3, home: [side * (LX + 0.55), 0.2, 0],
    }));
    const st = {
      kind: 'pong', K: 0, rk, ball: { p: [0, 0.4, 0], v: [0, 0, 0], m: 0, held: false, alpha: 1 }, phase: 'rally',
      lastHitter: -1, expect: 'opp', bounced: 0, rally: 1, shown: 0, bump: 0, endK: -1e9, server: -1, served: 0, log: [],
      trail: [], snd: [],
    };
    // already under way: a drive from the left racket
    const b = st.ball;
    b.p = [-(LX + 0.4), 0.28, rnd(-0.3, 0.3)];
    shot(st, rk[0], 'drive', true);
    return st;
  }

  /** The hitter sends the ball back: where to and how, with now and then a mistake. */
  function shot(st, rk, style, safe) {
    const b = st.ball, P0 = b.p, d = -rk.side;
    let Xt, T, m;
    if (style === 'loop') { Xt = rnd(0.75, 1.22); T = rnd(0.56, 0.68); m = 7; }
    else if (style === 'smash') { Xt = rnd(0.8, 1.25); T = rnd(0.2, 0.26); m = 1; }
    else if (style === 'lob') { Xt = rnd(0.7, 1.05); T = rnd(1.0, 1.2); m = 1.5; }
    else if (style === 'push') { Xt = rnd(0.3, 0.7); T = rnd(0.44, 0.52); m = -3; }
    else { Xt = rnd(0.55, 1.2); T = rnd(0.42, 0.52); m = 2.5; }
    let Zt = clamp(P0[2] + clamp(rnd(-0.6, 0.6) - P0[2] * 0.8, -0.85, 0.85), -0.6, 0.6); // across the table, not too sharply
    // a miss now and then: more likely the longer the rally, and on a smash or a loop
    const pErr = safe ? 0 : (style === 'smash' ? 0.1 : style === 'loop' ? 0.06 : 0.028) + Math.min(0.06, st.rally * 0.003);
    const err = Math.random() < pErr ? (Math.random() < 0.55 ? 'net' : 'long') : null;
    if (err === 'long') Xt = LX + rnd(0.05, 0.3);
    let v = aimAt(P0, [d * Xt, BR, Zt], T, m);
    for (let i = 0; i < 10 && err !== 'net'; i++) { // over the net with room to spare
      const tn = -P0[0] / v[0], yn = P0[1] + v[1] * tn - 0.5 * (G + m) * tn * tn;
      if (yn > NH + BR + 0.035) break;
      T += 0.05; v = aimAt(P0, [d * Xt, BR, Zt], T, m);
    }
    if (err === 'net') { // into the net instead
      const tn = -P0[0] / v[0], yn = P0[1] + v[1] * tn - 0.5 * (G + m) * tn * tn;
      v[1] += (NH * rnd(0.25, 0.75) - yn) / tn;
    }
    b.v = v; b.m = m;
  }

  /** Where and when the receiving racket will meet the ball (it predicts the flight), and with what stroke. */
  function predict(st, rk) {
    const b = { p: st.ball.p.slice(), v: st.ball.v.slice(), m: st.ball.m };
    let need = st.expect === 'own' ? 2 : 1, ib = -1;
    const S = [], ev = [];
    for (let i = 1; i <= 1200; i++) {
      ev.length = 0;
      stepBall(b, DT, ev);
      S.push({ k: st.K + i, p: b.p.slice(), vy: b.v[1], m: b.m });
      for (const e of ev) {
        if (e[0] !== 'table') return null; // the net or the floor: nothing to play
        const s = Math.sign(e[1]);
        if (need === 2) { if (s === -rk.side) need = 1; else return null; } else if (ib < 0 && s === rk.side) ib = S.length - 1; else return null;
      }
      if (ib >= 0 && (Math.abs(b.p[0]) > LX + 1.4 || b.p[1] < 0)) break;
    }
    if (ib < 0) return null;
    let ia = ib;
    while (ia < S.length - 1 && S[ia].vy > 0) ia++;
    const yA = S[ia].p[1];
    let style, ic;
    const X = (i) => Math.abs(S[i].p[0]);
    if (yA > 0.62 && X(ia) < LX + 1.1 && Math.random() < 0.85) { style = 'smash'; ic = ia + Math.round(rnd(0, 0.04) / DT); } else {
      ic = ia + Math.round(rnd(0, 0.06) / DT); // at the top of the bounce, or just after
      if (X(Math.min(ic, S.length - 1)) > LX + 0.95) { // a fast one: taken on the rise, well back
        ic = ib + 1;
        while (ic < S.length - 1 && X(ic) < LX + 0.55) ic++;
      }
      while (ic < S.length - 1 && X(ic) < LX - 0.3) ic++; // it can reach only so far over the table
    }
    ic = Math.min(ic, S.length - 1);
    while (ic > ib + 1 && S[ic].p[1] < 0.06) ic--; // not after it has dropped below the table
    const c = S[ic];
    if (style !== 'smash') {
      const deep = Math.abs(c.p[0]) - LX, r = Math.random();
      if (deep > 0.75) style = r < 0.35 ? 'lob' : 'drive';
      else if (c.m < -0.5) style = r < 0.55 ? 'loop' : 'push';
      else if (c.p[1] < 0.1) style = r < 0.5 ? 'loop' : 'push';
      else style = r < 0.72 ? 'drive' : r < 0.89 ? 'loop' : r < 0.96 ? 'push' : 'lob';
    }
    return { k: c.k, C: c.p, style };
  }

  /** The racket gets ready for the ball it has just seen coming. */
  function planFor(st, rk, P) {
    if (!P) { rk.plan = null; return; }
    const sty = STYLE[P.style], s = rk.side;
    const Cr = [P.C[0] + s * 0.03, P.C[1] - 0.012, P.C[2]];
    rk.plan = {
      k: P.k, C: P.C, Cr, style: P.style, B: add3(Cr, [s * sty.B[0], sty.B[1], sty.B[2]]), Fd: [s * sty.F[0], sty.F[1], sty.F[2]],
      kStart: st.K + Math.round(rnd(0.05, 0.13) / DT), ksw: P.k - Math.round(sty.ts / DT), nf: Math.round(sty.tf / DT),
    };
  }

  function endRally(st, why) {
    if (st.phase !== 'rally') return;
    st.phase = 'dead'; st.endK = st.K;
    st.whistleK = st.K + Math.round(0.3 / DT); // the umpire calls the point a beat later
    st.log.push([st.rally, why]); if (st.log.length > 60) st.log.shift(); // the last rallies: how long, how they ended
    for (const r of st.rk) if (r.plan && r.plan.Ps === undefined) r.plan = null; // stop running after it (a swing under way finishes)
  }

  /** The ball meets the racket (or does not). */
  function contact(st, rk, pl) {
    const b = st.ball;
    if (!pl.ok || st.phase !== 'rally' || b.held) { if (st.phase === 'rally' && !b.held) endRally(st, 'miss'); return; }
    if (pl.style === 'serve') { b.v = pl.serveV.slice(); b.m = pl.serveM; st.expect = 'own'; } else { shot(st, rk, pl.style, false); st.expect = 'opp'; }
    st.lastHitter = rk.side; st.bounced = 0; st.rally++; st.bump = 1;
    st.snd.push({ k: pl.style === 'smash' ? 'smash' : pl.style === 'serve' ? 'serve' : 'tok', p: b.p.slice(), s: pl.style });
    const other = st.rk[rk.side < 0 ? 1 : 0];
    planFor(st, other, predict(st, other));
    rk.home = [rk.side * (LX + (pl.style === 'lob' ? 0.85 : 0.55)), 0.2, 0];
    other.home = [other.side * (LX + (pl.style === 'smash' ? 0.9 : 0.55)), 0.2, 0];
  }

  /** A serve: toss, then strike, bouncing once on the server's own half and once on the other. */
  function serve(st) {
    const s = st.server, rk = st.rk[s < 0 ? 0 : 1], b = st.ball;
    let ok = null;
    for (let n = 0; n < 40 && !ok; n++) {
      const m0 = rnd(0.5, 2.5), m1 = m0 * 0.55;
      const B1 = [s * rnd(0.45, 0.95), BR, rnd(-0.5, 0.5)], B2 = [-s * rnd(0.5, 1.15), BR, clamp(rnd(-0.6, 0.6), -LZ + 0.1, LZ - 0.1)];
      const T2 = rnd(0.36, 0.46), v1 = aimAt(B1, B2, T2, m1);
      if (v1[1] <= 0.3) continue;
      const tn = -B1[0] / v1[0], yn = BR + v1[1] * tn - 0.5 * (G + m1) * tn * tn;
      if (yn < NH + BR + 0.02) continue;
      const v0 = [v1[0] / (0.93 + 0.012 * m0), -v1[1] / (E * (1 - 0.025 * m0)), v1[2] / 0.94];
      const x0 = s * (LX + 0.1), T1 = (B1[0] - x0) / v0[0];
      if (!(T1 > 0.08 && T1 < 0.45)) continue;
      const P0 = [x0, BR - v0[1] * T1 - 0.5 * (G + m0) * T1 * T1, B1[2] - v0[2] * T1];
      if (P0[1] < 0.05 || P0[1] > 0.42 || Math.abs(P0[2]) > 0.65) continue;
      ok = { P0, v: [v0[0], v0[1] + (G + m0) * T1, v0[2]], m: m0 };
    }
    if (!ok) ok = { P0: [s * (LX + 0.1), 0.2, 0], v: null, m: 1 };
    // the toss: held a moment in the free hand, then thrown up, struck on the way down
    const up = 0.3, hand = ok.P0[1] - 0.06, vt = Math.sqrt(2 * G * (ok.P0[1] + up - hand));
    const tDown = (vt + Math.sqrt(vt * vt - 2 * G * (ok.P0[1] - hand))) / G;
    const hold = Math.round(0.28 / DT);
    Object.assign(b, { p: [ok.P0[0], hand, ok.P0[2]], v: [0, 0, 0], m: 0, held: true, alpha: 0, tossK: st.K + hold, tossV: vt });
    st.phase = 'rally'; st.rally = 0; st.expect = 'own'; st.lastHitter = s; st.bounced = 0; st.trail = []; st.floored = false;
    planFor(st, rk, { k: st.K + hold + Math.round(tDown / DT), C: ok.P0, style: 'serve' });
    if (!ok.v) { const tgt = [-s * 0.8, BR, 0]; ok.v = aimAt(ok.P0, tgt, 0.55, 1); } // (a plain serve if no proper one was found)
    rk.plan.serveV = ok.v; rk.plan.serveM = ok.m;
    rk.plan.kStart = st.K;
  }

  /** One sub-step of the game. */
  function tick(st) {
    st.K++;
    const b = st.ball;
    if (b.held) {
      b.alpha = Math.min(1, b.alpha + 0.05);
      if (st.K >= b.tossK) { b.held = false; b.v = [0, b.tossV, 0]; }
    } else {
      const ev = [];
      stepBall(b, DT, ev);
      for (const e of ev) {
        if (e[0] === 'table') {
          if (e[3] > 0.5) st.snd.push({ k: 'tik', p: b.p.slice(), v: e[3] }); // (not the patter of a ball coming to rest)
          if (st.phase !== 'rally') continue;
          const s = Math.sign(e[1]);
          if (st.expect === 'own') { if (s === st.lastHitter) st.expect = 'opp'; else endRally(st, 'fault'); } else if (s === -st.lastHitter && !st.bounced) st.bounced = 1; else endRally(st, s === st.lastHitter ? 'own side' : 'twice');
        } else if (e[0] === 'net') { st.snd.push({ k: 'net', p: b.p.slice() }); endRally(st, 'net'); } else if (e[0] === 'floor') {
          if (!st.floored && Math.abs(e[2]) > 0.25) { st.floored = true; st.snd.push({ k: 'floor', p: b.p.slice(), v: Math.abs(e[2]) }); } // the missed ball bouncing away
          endRally(st, 'floor');
        }
      }
      if (st.phase === 'rally') { // gone past the end without touching the table, or the racket had no answer
        const [x, y, z] = b.p;
        if (y < -0.05 && (Math.abs(x) > LX || Math.abs(z) > LZ)) endRally(st, st.bounced ? 'passed' : 'long');
        else if (Math.abs(x) > LX + 1.6) endRally(st, 'passed');
      }
    }
    for (const rk of st.rk) moveRacket(st, rk);
    if (st.whistleK && st.K >= st.whistleK) { st.whistleK = 0; st.snd.push({ k: 'whistle', p: [0, 0.5, 0] }); }
    if (st.phase === 'dead') {
      const t = (st.K - st.endK) * DT;
      if (t > 0.45) b.alpha = Math.max(0, b.alpha - 0.02);
      const settled = st.floored || (Math.abs(b.p[0]) <= LX && Math.abs(b.p[2]) <= LZ && b.p[1] < 0.3); // a missed ball is heard landing before the next serve
      if (t > 0.85 && (settled || t > 1.9) && !st.rk.some((r) => r.plan)) {
        if (st.served++ % 2 === 1) st.server = -st.server; // service changes every two points
        st.phase = 'serve';
      }
    } else if (st.phase === 'serve') serve(st);
  }

  /** A racket moves: drifts home, runs to where it will wind up, swings through the ball, follows through. */
  function moveRacket(st, rk) {
    const pl = rk.plan, K = st.K;
    let target = rk.home, tw = READY.w, tf = READY.f, vmax = rk.vmax;
    if (pl) {
      const sty = STYLE[pl.style];
      if (K >= pl.ksw) {
        if (pl.Ps === undefined) { // the swing starts from wherever it got to
          pl.Ps = rk.p.slice(); pl.ws = rk.w; pl.fs = rk.f;
          pl.ok = len3(sub3(pl.Ps, pl.B)) < REACH;
          pl.end = pl.ok ? pl.Cr : add3(pl.Ps, sub3(pl.Cr, pl.B));
        }
        if (K <= pl.k) {
          const u = pl.k > pl.ksw ? (K - pl.ksw) / (pl.k - pl.ksw) : 1, e = Math.pow(u, 1.6), dip = Math.sin(Math.PI * e) * (pl.style === 'smash' ? -0.05 : 0.05);
          rk.p = [lerp(pl.Ps[0], pl.end[0], e), lerp(pl.Ps[1], pl.end[1], e) - dip, lerp(pl.Ps[2], pl.end[2], e) - dip]; // an arc, not a straight line
          rk.w = lerp(pl.ws, sty.w[1], e); rk.f = lerp(pl.fs, sty.f[1], e);
          if (K === pl.k) contact(st, rk, pl);
        } else {
          const u = Math.min(1, (K - pl.k) / pl.nf), ex = 1 - (1 - u) ** 2.6, ey = 1 - (1 - u) ** 1.5, e = 1 - (1 - u) * (1 - u);
          rk.p = [pl.end[0] + pl.Fd[0] * ex, pl.end[1] + pl.Fd[1] * ey, pl.end[2] + pl.Fd[2] * e]; // on through the ball first, then up and round rk.w = lerp(sty.w[1], sty.w[2], e); rk.f = lerp(sty.f[1], sty.f[2], e);
          if (u >= 1) { rk.plan = null; rk.v = [0, 0, 0]; }
        }
        rk.swing = true;
        return;
      }
      if (K >= pl.kStart) {
        target = pl.B; tw = sty.w[0]; tf = sty.f[0];
        if ((pl.ksw - K) * DT < 0.14) vmax *= 1.5; // a last lunge
      }
    } else if (st.phase === 'rally' && !st.ball.held) target = [rk.home[0], rk.home[1], clamp(st.ball.p[2] * 0.5, -0.4, 0.4)]; // keeps an eye on the ball
    rk.swing = false;
    const kk = 15, a = [0, 1, 2].map((i) => kk * kk * (target[i] - rk.p[i]) - 2 * kk * rk.v[i]);
    rk.v = add3(rk.v, a, DT);
    const sp = len3(rk.v);
    if (sp > vmax) rk.v = rk.v.map((q) => (q * vmax) / sp);
    rk.p = add3(rk.p, rk.v, DT);
    const ease = 1 - Math.exp(-DT * 9);
    rk.w += (tw - rk.w) * ease; rk.f += (tf - rk.f) * ease;
  }

  /* ---------- sound: the app's own table-tennis recordings (samples-gen.js), placed where it happens ---------- */

  const CLIPS = { ac: null, bufs: {}, state: '' };
  /** The ping-pong clips, decoded once into the background's audio context (state: '' while decoding, 'ok', 'failed'). */
  function clips(ac) {
    if (CLIPS.ac !== ac) {
      Object.assign(CLIPS, { ac, bufs: {}, state: '' });
      const src = window.SAMPLES && window.SAMPLES.pingpong;
      if (!src) CLIPS.state = 'failed';
      else {
        Promise.all(Object.entries(src).map(async ([name, b64]) => {
          try {
            const bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const buf = await ac.decodeAudioData(bytes.buffer);
            CLIPS.bufs[name] = typeof tidySample === 'function' ? tidySample(ac, buf) : buf; // trimmed, at an even level, as the typing sounds use them
          } catch { /* a bad clip: the others still play */ }
        })).then(() => { if (CLIPS.ac === ac) CLIPS.state = Object.keys(CLIPS.bufs).length ? 'ok' : 'failed'; });
      }
    }
    return CLIPS;
  }
  const audible = () => typeof AMB !== 'undefined' && AMB.ctx && AMB.master && typeof ambVolume === 'function' && ambVolume() > 0 && AMB.ctx.state === 'running';

  /** One clip through a gain and a stereo pan into the background's own volume. */
  function clip(ac, name, { rate = 1, gain = 1, dur = 0, offset = 0, pan = 0, lp = 0 } = {}) {
    const b = CLIPS.bufs[name];
    if (!b) return false;
    const t0 = ac.currentTime + 0.003, g0 = gain * ((window.SAMPLE_GAINS && window.SAMPLE_GAINS.pingpong && window.SAMPLE_GAINS.pingpong[name]) ?? 1);
    const src = ac.createBufferSource(), g = ac.createGain(), p = ac.createStereoPanner();
    src.buffer = b; src.playbackRate.value = rate;
    g.gain.value = g0;
    if (dur) { g.gain.setValueAtTime(g0, t0 + Math.max(0, dur - 0.05)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
    p.pan.value = pan;
    let node = src;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g); g.connect(p); p.connect(AMB.master);
    src.start(t0, offset, dur ? dur + 0.02 : undefined);
    src.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
    return true;
  }

  /**
   * What the rally sounds like: a racket hit (one of four takes, its pitch and level never quite the same), a
   * quieter tick off the table, the dull touch of the net, a smash, and a missed ball bouncing away on the floor.
   */
  function sound(e, pan) {
    const ac = AMB.ctx, C = clips(ac);
    if (C.state === 'failed') return synth(e.k, pan);
    if (C.state !== 'ok') return; // still decoding (a moment, once)
    const r = (a = 0.06) => 1 + (Math.random() - 0.5) * 2 * a, soft = e.s === 'push' || e.s === 'lob';
    if (e.k === 'tok') {
      const n = ['k1', 'k2', 'k3', 'k4'][(Math.random() * 4) | 0];
      clip(ac, n, { rate: r() * (soft ? 0.93 : 1), gain: (soft ? 0.56 : 0.72) * r(0.1), dur: n === 'k4' ? 0.26 : 0, pan }); // ≈ -28 LUFS momentary, peaks -4 dBFS: over the hall's -25 LUFS room tone
    } else if (e.k === 'serve') clip(ac, 'newline', { rate: r(0.04), gain: 0.62 * r(0.08), dur: 0.34, pan });
    else if (e.k === 'smash') clip(ac, 'enter', { rate: r(0.03), gain: 0.82, offset: 0.1, dur: 0.5, pan });
    else if (e.k === 'tik') clip(ac, 'space', { rate: r(0.05) * (0.96 + Math.min(0.1, e.v * 0.02)), gain: 0.4 * Math.min(1.1, 0.45 + e.v * 0.14) * r(0.08), dur: 0.2, pan }); // a few dB under a hit
    else if (e.k === 'net') clip(ac, 'back', { rate: r(0.05), gain: 0.55, pan });
    else if (e.k === 'floor') clip(ac, 'space', { rate: 0.86 * r(0.04), gain: 0.45, pan, lp: 2600 }); // farther off, on a harder floor
  }

  /*
   * The umpire's whistle when a point is decided: a recording (ambient/pong-whistle.ogg) if there is one, else a
   * pea whistle made on the spot. Centred, a little quieter than a racket hit.
   */
  const WHISTLE = { ac: null, buf: null, state: '' };
  function whistle() {
    const ac = AMB.ctx;
    if (WHISTLE.ac !== ac) {
      Object.assign(WHISTLE, { ac, buf: null, state: '' });
      fetch('ambient/pong-whistle.ogg').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((b) => ac.decodeAudioData(b))
        .then((buf) => { if (WHISTLE.ac === ac) Object.assign(WHISTLE, { buf, state: 'ok' }); }) // kept at its own level (mastered against the hall loop)
        .catch(() => { if (WHISTLE.ac === ac) WHISTLE.state = 'failed'; });
    }
    return WHISTLE;
  }
  function blowWhistle(st) {
    const ac = AMB.ctx, W = whistle(), t0 = ac.currentTime + 0.003;
    st.whistled = W.state === 'ok' ? 'recording' : 'synthesized'; // which one the last point got
    const out = ac.createGain();
    out.connect(AMB.master);
    if (W.state === 'ok') {
      const src = ac.createBufferSource();
      src.buffer = W.buf; src.playbackRate.value = 0.98 + Math.random() * 0.04;
      out.gain.value = 0.6; // a held tone carries: about 5 dB under a racket hit over 100 ms, a little over the hall's room tone
      src.connect(out); src.start(t0);
      src.onended = () => { try { out.disconnect(); } catch { /* gone */ } };
      return;
    }
    // a pea whistle: a bright tone near 3 kHz, warbling fast and unevenly as the pea rattles, with a little breath
    const len = 0.4;
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.05, t0 + 0.018); // about as loud as the recording
    out.gain.setValueAtTime(0.05, t0 + len - 0.07);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    const f0 = 2850 + Math.random() * 250;
    const tone = ac.createOscillator(), over = ac.createOscillator(), og = ac.createGain();
    tone.type = 'sine'; over.type = 'sine';
    tone.frequency.setValueAtTime(f0 * 0.97, t0); tone.frequency.linearRampToValueAtTime(f0, t0 + 0.04);
    over.frequency.setValueAtTime(f0 * 2 * 0.97, t0); over.frequency.linearRampToValueAtTime(f0 * 2, t0 + 0.04);
    og.gain.value = 0.18;
    const trill = ac.createOscillator(), depth = ac.createGain(), depth2 = ac.createGain(), am = ac.createGain();
    trill.type = 'triangle';
    const rate = new Float32Array(12);
    for (let i = 0; i < rate.length; i++) rate[i] = 26 + Math.random() * 16; // the pea never rattles evenly
    trill.frequency.setValueCurveAtTime(rate, t0, len);
    depth.gain.value = f0 * 0.05; depth2.gain.value = f0 * 0.1;
    trill.connect(depth); depth.connect(tone.frequency);
    trill.connect(depth2); depth2.connect(over.frequency);
    am.gain.value = 0.75;
    const amDepth = ac.createGain(); amDepth.gain.value = 0.25;
    trill.connect(amDepth); amDepth.connect(am.gain);
    tone.connect(am); over.connect(og); og.connect(am); am.connect(out);
    let nb = blowWhistle.noise;
    if (!nb || nb.sampleRate !== ac.sampleRate) {
      nb = blowWhistle.noise = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const breath = ac.createBufferSource(), bp = ac.createBiquadFilter(), bg2 = ac.createGain();
    breath.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = f0 * 1.1; bp.Q.value = 1.6; bg2.gain.value = 0.12;
    breath.connect(bp); bp.connect(bg2); bg2.connect(out);
    for (const o of [tone, over, trill]) { o.start(t0); o.stop(t0 + len + 0.02); }
    breath.start(t0); breath.stop(t0 + len + 0.02);
    setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, (len + 0.3) * 1000);
  }

  /** Only if the recordings cannot be decoded: a soft synthesized tok. */
  function synth(kind, pan) {
    const ac = AMB.ctx, t0 = ac.currentTime + 0.004;
    const out = ac.createGain(), p = ac.createStereoPanner();
    out.gain.value = kind === 'tik' ? 0.16 : kind === 'floor' || kind === 'net' ? 0.12 : 0.24;
    p.pan.value = pan; out.connect(p); p.connect(AMB.master);
    const f = (kind === 'tik' ? 2100 : kind === 'floor' ? 1400 : kind === 'net' ? 600 : 1000) * (0.96 + Math.random() * 0.08);
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.05);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.08);
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, 400);
  }

  /* ---------- the picture ---------- */

  /** The camera: beside the table, a little above it, turned slightly toward one end; fitted to the canvas. */
  function camera(w, h, pv) {
    const yaw = 0.1, pitch = pv ? 0.2 : 0.28, dist = 9;
    const f = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const T = [0, 0.15, 0], C = add3(T, f, -dist);
    const rl = Math.hypot(f[2], f[0]), r = [f[2] / rl, 0, -f[0] / rl], u = cross3(f, r);
    const cam = { C, f, r, u, F: 1, ox: 0, oy: 0 };
    const box = (pts) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const [x, y] = proj(cam, p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x0, x1, y0, y1 };
    };
    if (pv) { // the picker's strip: the table and a little air over it
      const b = box([[-1.95, -0.1, 0], [1.95, -0.1, 0], [-1.95, 0.62, 0], [1.95, 0.62, 0]]);
      cam.F = Math.min((0.96 * w) / (b.x1 - b.x0), (0.94 * h) / (b.y1 - b.y0));
      cam.ox = w / 2 - (cam.F * (b.x0 + b.x1)) / 2; cam.oy = 0.98 * h - cam.F * b.y1;
      return cam;
    }
    // the table about three fifths of the width, in the middle; room above it for a lob, the floor below
    const tb = box([[-LX, 0, -LZ], [LX, 0, -LZ], [-LX, 0, LZ], [LX, 0, LZ]]);
    const all = box([[-LX, -TH, -LZ], [LX, -TH, -LZ], [-LX, -TH, LZ], [LX, -TH, LZ], [0, 1.08, 0], [-1.6, 1.0, 0], [1.6, 1.0, 0]]);
    cam.F = Math.min((0.6 * w) / (tb.x1 - tb.x0), (0.86 * h) / (all.y1 - all.y0));
    const mid = proj(cam, [0, 0, 0]);
    cam.ox = w / 2 - cam.F * mid[0];
    cam.oy = (0.06 * h + 0.95 * h) / 2 - (cam.F * (all.y0 + all.y1)) / 2;
    return cam;
  }
  /** World → screen: [x, y, pixels per metre there]. */
  function proj(cam, p) {
    const d = sub3(p, cam.C), zc = dot3(d, cam.f);
    return [cam.ox + (cam.F * dot3(d, cam.r)) / zc, cam.oy - (cam.F * dot3(d, cam.u)) / zc, cam.F / zc];
  }

  /**
   * The table, drawn once: a solid blue board lit from above, its white lines, the dark edge of the top, the net
   * with its white tape and posts, the legs and frame under it in shadow, and its shadow on the floor.
   */
  function buildTable(w, h, dpr, L, cam, pv) {
    const c = mk(w * dpr, h * dpr), x = c.getContext('2d');
    x.scale(dpr, dpr); x.lineJoin = 'round'; x.lineCap = 'butt';
    const P = (X, Y, Z) => proj(cam, [X, Y, Z]);
    const path = (pts) => { x.beginPath(); pts.forEach((q, i) => { const s = P(q[0], q[1], q[2]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); }); x.closePath(); };
    const solid = (pts, fill) => { // hides what is behind it, then takes its own colour
      path(pts); x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(); x.restore();
      x.fillStyle = fill; x.fill();
    };
    const C = L ? {
      board: [84, 126, 184], hi: [140, 176, 222], lo: [62, 98, 152], a: 0.82, apron: [44, 72, 120], line: [255, 255, 255], la: 0.96,
      leg: [64, 72, 88], legA: 0.5, rim: [255, 255, 255], rimA: 0, shadow: [36, 46, 66], shA: 0.17, mesh: [28, 34, 48], meshA: 0.3, post: [52, 58, 72],
    } : {
      board: [22, 60, 128], hi: [58, 108, 186], lo: [12, 38, 88], a: 0.86, apron: [8, 24, 58], line: [236, 242, 255], la: 0.92,
      leg: [5, 7, 12], legA: 0.82, rim: [170, 186, 220], rimA: 0.13, shadow: [0, 0, 0], shA: 0.5, mesh: [2, 4, 10], meshA: 0.55, post: [8, 10, 16],
    };
    const px = proj(cam, [0, 0, 0])[2]; // pixels per metre at the table's middle
    const TT = 0.03; // the top's thickness
    const top = [[-LX, 0, -LZ], [LX, 0, -LZ], [LX, 0, LZ], [-LX, 0, LZ]];

    if (!pv) {
      // a little light on the floor round it (on a dark page), and the table's shadow there, soft
      if (!L) {
        const cf = P(0, -TH, 0.1), rx = (LX + 1.2) * cf[2], g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(190,205,240,0.06)'); g.addColorStop(0.6, 'rgba(190,205,240,0.025)'); g.addColorStop(1, 'rgba(190,205,240,0)');
        x.save(); x.translate(cf[0], cf[1]); x.scale(1, 0.22); x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
      }
      x.save(); x.filter = `blur(${Math.max(4, 0.07 * px).toFixed(1)}px)`;
      path([[-LX + 0.02, -TH, -LZ + 0.08], [LX - 0.02, -TH, -LZ + 0.08], [LX - 0.02, -TH, LZ - 0.02], [-LX + 0.02, -TH, LZ - 0.02]]);
      x.fillStyle = rgba(C.shadow, C.shA); x.fill();
      x.restore();
      // the legs and the frame under the top, in shadow (the far ones first)
      const leg = (X, Z, far) => {
        const wd = 0.045, a0 = P(X - wd / 2, -0.06, Z), a1 = P(X + wd / 2, -0.06, Z), b0 = P(X - wd / 2, -TH + 0.02, Z), b1 = P(X + wd / 2, -TH + 0.02, Z);
        x.beginPath(); x.moveTo(a0[0], a0[1]); x.lineTo(a1[0], a1[1]); x.lineTo(b1[0], b1[1]); x.lineTo(b0[0], b0[1]); x.closePath();
        x.fillStyle = rgba(C.leg, C.legA * (far ? 0.8 : 1)); x.fill();
        if (C.rimA) { x.strokeStyle = rgba(C.rim, C.rimA * (far ? 0.6 : 1)); x.lineWidth = 1; x.beginPath(); x.moveTo(a0[0], a0[1]); x.lineTo(b0[0], b0[1]); x.stroke(); }
        const ft = P(X, -TH + 0.01, Z), fr = 0.06 * ft[2]; // its foot
        x.fillStyle = rgba(C.leg, C.legA * 0.9); x.beginPath(); x.ellipse(ft[0], ft[1], fr, fr * 0.32, 0, 0, TAU); x.fill();
      };
      const LXi = LX - 0.3, LZi = LZ - 0.14;
      leg(-LXi, LZi, true); leg(LXi, LZi, true);
      x.strokeStyle = rgba(C.leg, C.legA * 0.75); x.lineWidth = Math.max(1, 0.025 * px);
      for (const Z of [LZi, -LZi]) { path([[-LXi, -0.42, Z], [LXi, -0.42, Z]]); x.stroke(); } // the stretchers between the legs
      leg(-LXi, -LZi, false); leg(LXi, -LZi, false);
      solid([[-LX + 0.06, -TT, -LZ + 0.06], [LX - 0.06, -TT, -LZ + 0.06], [LX - 0.06, -0.08, -LZ + 0.06], [-LX + 0.06, -0.08, -LZ + 0.06]], L ? 'rgba(44,56,82,0.55)' : rgba(C.leg, C.legA)); // the frame under the top
    }

    // the board: solid, lit softly from a lamp above (a sheen across its middle, a little darker toward the ends)
    solid(top, rgba(C.board, C.a));
    x.save(); path(top); x.clip();
    const m0 = P(-0.15, 0, 0.2), rx = LX * 1.25 * m0[2];
    const sheen = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    sheen.addColorStop(0, rgba(C.hi, L ? 0.55 : 0.6)); sheen.addColorStop(0.55, rgba(C.hi, L ? 0.2 : 0.22)); sheen.addColorStop(1, rgba(C.hi, 0));
    x.save(); x.translate(m0[0], m0[1]); x.scale(1, 0.28); x.fillStyle = sheen; x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
    const e0 = P(-LX, 0, 0), e1 = P(LX, 0, 0), ends = x.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
    ends.addColorStop(0, rgba(C.lo, 0.45)); ends.addColorStop(0.22, rgba(C.lo, 0)); ends.addColorStop(0.78, rgba(C.lo, 0)); ends.addColorStop(1, rgba(C.lo, 0.45));
    x.fillStyle = ends; path(top); x.fill();
    x.restore();
    // the white lines: 2 cm round the edge, a fine one down the middle
    const e = 0.02;
    x.fillStyle = rgba(C.line, C.la);
    for (const q of [
      [[-LX, 0, -LZ], [LX, 0, -LZ], [LX, 0, -LZ + e], [-LX, 0, -LZ + e]], [[-LX, 0, LZ - e], [LX, 0, LZ - e], [LX, 0, LZ], [-LX, 0, LZ]],
      [[-LX, 0, -LZ], [-LX + e, 0, -LZ], [-LX + e, 0, LZ], [-LX, 0, LZ]], [[LX - e, 0, -LZ], [LX, 0, -LZ], [LX, 0, LZ], [LX - e, 0, LZ]],
    ]) { path(q); x.fill(); }
    x.strokeStyle = rgba(C.line, C.la * 0.75); x.lineWidth = Math.max(0.8, 0.004 * px);
    path([[-LX + e, 0, 0], [LX - e, 0, 0]]); x.stroke();
    // the near edge of the top, darker
    solid([[-LX, 0, -LZ], [LX, 0, -LZ], [LX, -TT, -LZ], [-LX, -TT, -LZ]], rgba(C.apron, Math.min(1, C.a + 0.06)));
    x.strokeStyle = rgba(C.line, L ? 0.5 : 0.28); x.lineWidth = 0.8; // the light catching the edge
    path([[-LX, -0.001, -LZ], [LX, -0.001, -LZ]]); x.stroke();

    // the net: a dark mesh, a white tape along its top, posts clamped to the sides
    if (!pv) {
      x.fillStyle = rgba(C.mesh, C.meshA * 0.3);
      path([[0, 0.004, -NZ], [0, 0.004, NZ], [0, NH - 0.012, NZ], [0, NH - 0.012, -NZ]]); x.fill();
      x.strokeStyle = rgba(C.mesh, C.meshA); x.lineWidth = 0.6;
      x.beginPath();
      for (let Z = -NZ; Z <= NZ + 1e-6; Z += 0.03) { const a = P(0, 0.004, Z), b = P(0, NH - 0.012, Z); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
      for (let Y = 0.02; Y < NH - 0.012; Y += 0.022) { const a = P(0, Y, -NZ), b = P(0, Y, NZ); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
      x.stroke();
    }
    x.fillStyle = rgba(C.line, Math.min(1, C.la + 0.06)); // the white tape along its top
    path([[0, NH - 0.018, -NZ], [0, NH - 0.018, NZ], [0, NH, NZ], [0, NH, -NZ]]); x.fill();
    const postW = Math.max(pv ? 0.7 : 1.4, 0.014 * px);
    for (const Z of [NZ, -NZ]) {
      const a = P(0, -TT, Z), b = P(0, NH + 0.008, Z);
      x.strokeStyle = rgba(C.post, L ? 0.75 : 0.9); x.lineWidth = postW;
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
      if (C.rimA) { x.strokeStyle = rgba(C.rim, C.rimA * 1.4); x.lineWidth = 0.8; x.beginPath(); x.moveTo(a[0] - postW / 2, a[1]); x.lineTo(b[0] - postW / 2, b[1]); x.stroke(); }
      const s = Math.sign(Z); // the clamp, over the edge of the top
      solid([[-0.025, 0.012, s * (LZ - 0.03)], [0.025, 0.012, s * (LZ - 0.03)], [0.025, 0.012, Z], [-0.025, 0.012, Z]], rgba(C.post, L ? 0.75 : 0.92));
      solid([[-0.025, 0.012, s * NZ], [0.025, 0.012, s * NZ], [0.025, -TT - 0.015, s * NZ], [-0.025, -TT - 0.015, s * NZ]], rgba(C.post, L ? 0.75 : 0.92));
    }
    return c;
  }

  function sprites(dpr, L) {
    const ball = mk(32 * dpr, 32 * dpr), b = ball.getContext('2d');
    b.scale(dpr, dpr);
    const g = b.createRadialGradient(16, 16, 0, 16, 16, 16);
    if (L) { g.addColorStop(0, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(255,140,60,0)'); } else { g.addColorStop(0, 'rgba(255,246,228,0.4)'); g.addColorStop(0.35, 'rgba(255,240,215,0.1)'); g.addColorStop(1, 'rgba(255,240,215,0)'); }
    b.fillStyle = g; b.fillRect(0, 0, 32, 32);
    const shadow = mk(32 * dpr, 32 * dpr), s = shadow.getContext('2d');
    s.scale(dpr, dpr);
    const q = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    q.addColorStop(0, L ? 'rgba(20,28,48,0.9)' : 'rgba(0,0,0,0.95)'); q.addColorStop(0.5, L ? 'rgba(20,28,48,0.45)' : 'rgba(0,0,0,0.5)'); q.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = q; s.fillRect(0, 0, 32, 32);
    return { ball, shadow };
  }

  /** A racket: round blade (red rubber on one face, black on the other, the wood showing at its edge), handle. */
  function drawRacket(ctx, cam, rk, L, pv) {
    const s = rk.side, cw = Math.cos(rk.w), sw = Math.sin(rk.w);
    const u = [-s * sw, cw, 0], p = [-s * cw, -sw, 0];
    const n = [p[0] * Math.cos(rk.f), p[1] * Math.cos(rk.f), -Math.sin(rk.f)];
    const v = cross3(n, u);
    const c = rk.p, toCam = sub3(cam.C, c), front = dot3(n, toCam) > 0;
    const ring = (o, a, bb, k = 22) => { ctx.beginPath(); for (let i = 0; i <= k; i++) { const t = (i / k) * TAU, q = proj(cam, add3(add3(o, v, Math.cos(t) * a), u, Math.sin(t) * bb)); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.closePath(); };
    const wood = L ? [168, 120, 72] : [226, 190, 140];
    // the handle, flaring a little toward its end
    const h0 = add3(c, u, -0.082), h1 = add3(c, u, -0.205);
    const qs = [add3(h0, v, 0.014), add3(h1, v, 0.019), add3(h1, v, -0.019), add3(h0, v, -0.014)].map((q) => proj(cam, q));
    ctx.beginPath(); qs.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    ctx.fillStyle = rgba(wood, L ? 0.62 : 0.55); ctx.fill();
    ctx.strokeStyle = rgba(L ? [110, 74, 40] : [150, 116, 80], L ? 0.4 : 0.35); ctx.lineWidth = pv ? 0.4 : 0.8; ctx.stroke();
    // the blade's thickness: its far face, in wood, then the near face
    const back = add3(c, n, front ? -0.009 : 0.009);
    ring(back, 0.088, 0.093); ctx.fillStyle = rgba(wood, L ? 0.6 : 0.55); ctx.fill();
    ring(c, 0.088, 0.093);
    // the rubber, lit from above: red on one face, black on the other (on a dark page a dark grey, so it still reads)
    const q = proj(cam, c), r = 0.093 * q[2];
    const g = ctx.createRadialGradient(q[0] - r * 0.3, q[1] - r * 0.45, r * 0.05, q[0], q[1], r * 1.15);
    if (front) { g.addColorStop(0, L ? 'rgba(232,84,80,0.82)' : 'rgba(246,104,96,0.76)'); g.addColorStop(1, L ? 'rgba(178,34,44,0.82)' : 'rgba(196,48,56,0.72)'); } else { g.addColorStop(0, L ? 'rgba(70,72,82,0.8)' : 'rgba(92,96,110,0.72)'); g.addColorStop(1, L ? 'rgba(22,22,28,0.82)' : 'rgba(40,42,52,0.78)'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba(wood, L ? 0.45 : 0.42); ctx.lineWidth = pv ? 0.5 : 1; ctx.stroke();
  }

  // the picker's still: the ball on its way over the net, not between two rallies
  (window.BG_PV_STILL = window.BG_PV_STILL || {}).pong = (bg) => {
    const st = bg.st;
    if (!st || st.kind !== 'pong') return 0;
    for (let i = 0; i < 2400; i++) {
      const b = st.ball, d = Math.sign(b.v[0]) * b.p[0];
      if (st.phase === 'rally' && !b.held && st.expect === 'opp' && d > -0.95 && d < -0.45 && b.p[1] > 0.12) break;
      tick(st);
    }
    st.trail = []; st.snd.length = 0;
    return 3;
  };

  (window.BG_EXT = window.BG_EXT || {}).pong = function (bg, ctx, w, h) {
    const L = typeof isLight === 'function' && isLight(), dpr = bg.dpr || 1, pv = h < 90;
    const real = bg.canvas.classList.contains('bg-layer');
    let st = bg.st;
    if (!st || st.kind !== 'pong') st = bg.st = newGame();
    const key = `${w}x${h}@${dpr}${L ? 'L' : 'D'}`;
    if (st.key !== key) { st.key = key; st.cam = camera(w, h, pv); st.table = buildTable(w, h, dpr, L, st.cam, pv); st.spr = sprites(dpr, L); st.trail = []; }
    for (let i = 0; i < SUB; i++) tick(st);
    if (real && audible()) {
      clips(AMB.ctx); whistle(); // decoded ahead of the first use
      const seen = new Set();
      for (const e of st.snd) { // once of each kind a frame, panned to where it happened (the left racket on the left)
        if (seen.has(e.k)) continue;
        seen.add(e.k);
        if (e.k === 'whistle') blowWhistle(st); else sound(e, clamp((proj(st.cam, e.p)[0] / w - 0.5) * 1.7, -0.85, 0.85));
      }
    }
    st.snd.length = 0;

    const cam = st.cam, b = st.ball;
    ctx.drawImage(st.table, 0, 0, w, h);

    // the ball's shadow, on the table or (off it) on the floor: small and dark when close, wide and faint when high
    const bp = b.p, over = Math.abs(bp[0]) <= LX && Math.abs(bp[2]) <= LZ && bp[1] >= 0;
    const sy = over ? 0 : -TH, hgt = Math.max(0, bp[1] - BR - sy);
    if (b.alpha > 0.01 && (over || (!pv && bp[1] > -TH))) {
      const q = proj(cam, [bp[0], sy, bp[2]]), r = (BR * 1.1 + hgt * 0.1) * q[2] * 1.6;
      ctx.globalAlpha = b.alpha * (over ? (L ? 0.5 : 0.75) : (L ? 0.22 : 0.4)) / (1 + hgt * 4);
      ctx.drawImage(st.spr.shadow, q[0] - r, q[1] - r * 0.34, r * 2, r * 0.68);
      ctx.globalAlpha = 1;
    }
    // the rackets, the farther one first, each with a faint shadow on the floor below it
    const rs = st.rk.slice().sort((a, c) => c.p[2] - a.p[2]);
    if (!pv) for (const rk of rs) {
      const q = proj(cam, [rk.p[0], -TH, rk.p[2]]), r = 0.15 * q[2], up = Math.max(0, rk.p[1] + TH);
      ctx.globalAlpha = (L ? 0.2 : 0.4) / (1 + up * 0.8);
      ctx.drawImage(st.spr.shadow, q[0] - r, q[1] - r * 0.3, r * 2, r * 0.6);
      ctx.globalAlpha = 1;
    }
    for (const rk of rs) drawRacket(ctx, cam, rk, L, pv);
    // the ball, with a short streak behind it
    const q = proj(cam, bp), br = Math.max(pv ? 1.1 : 2.2, BR * q[2]);
    st.trail.push([q[0], q[1]]); if (st.trail.length > 7) st.trail.shift();
    if (b.alpha > 0.01) {
      const tr = st.trail, n = tr.length;
      if (!b.held && n > 2) {
        ctx.lineCap = 'round';
        for (let i = n - 1; i > 0; i--) {
          const k = i / (n - 1);
          ctx.strokeStyle = L ? `rgba(230,110,40,${0.22 * k * b.alpha})` : `rgba(255,244,226,${0.2 * k * b.alpha})`;
          ctx.lineWidth = br * 1.6 * k;
          ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
        }
      }
      ctx.globalAlpha = b.alpha;
      ctx.drawImage(st.spr.ball, q[0] - br * 4, q[1] - br * 4, br * 8, br * 8);
      ctx.fillStyle = L ? 'rgba(255,128,48,0.95)' : 'rgba(255,250,240,0.92)';
      ctx.beginPath(); ctx.arc(q[0], q[1], br, 0, TAU); ctx.fill();
      if (L) { ctx.strokeStyle = 'rgba(170,70,20,0.6)'; ctx.lineWidth = 0.8; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    // the rally so far, quietly, above the net
    if (!pv) {
      const want = st.rally >= 2 && (st.phase === 'rally' || (st.K - st.endK) * DT < 1.2) ? 1 : 0;
      st.shown += (want - st.shown) * (want ? 0.2 : 0.06);
      st.bump *= 0.86;
      if (st.shown > 0.01) {
        const top = proj(cam, [0, 1.0, 0]), fs = Math.max(14, Math.round(0.1 * top[2]));
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = `300 ${Math.round(fs * (1 + 0.12 * st.bump))}px 'Segoe UI', 'Pretendard', sans-serif`;
        ctx.fillStyle = L ? `rgba(34,44,66,${0.4 * st.shown})` : `rgba(228,234,250,${0.34 * st.shown})`;
        ctx.fillText(String(st.rally), top[0], top[1]);
        ctx.font = `400 ${Math.max(9, Math.round(fs * 0.4))}px 'Segoe UI', 'Pretendard', sans-serif`;
        ctx.fillStyle = L ? `rgba(34,44,66,${0.26 * st.shown})` : `rgba(228,234,250,${0.2 * st.shown})`;
        ctx.fillText('랠리', top[0], top[1] + fs * 0.6);
        ctx.textAlign = 'start';
      }
    }
  };
})();
