'use strict';
// 방 스타일: 오래된 서재 — 책 냄새 가득한 초록 스탠드 서재 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮엔 담쟁이 창으로 든 볕에 먼지가 떠다니고 고양이가 창턱에 앉는다. 해질녘엔 초록 갓 스탠드가 빛을 넘겨받고,
// 밤엔 불빛이 바닥에 고이고 창에 별이 뜬다. 잘 때는 불을 끄고 고양이가 침대 발치에서 몸을 만다.
(() => {
  const R = '#room[data-room="library"]';
  const f = (n) => +n.toFixed(2);
  const stops = (st) => st.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op == null ? '' : ` stop-opacity="${op}"`}/>`).join('');
  const lg = (id, st, a = 'x2="0" y2="1"') => `<linearGradient id="rs-library-${id}" ${a}>${stops(st)}</linearGradient>`;
  const rg = (id, a, st) => `<radialGradient id="rs-library-${id}" ${a}>${stops(st)}</radialGradient>`;
  let seed = 20261125;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  // 책장: 칸마다 책 높이·두께·색을 달리 세우고, 같은 질의 전집, 눕혀 쌓은 책, 기대 선 책을 섞는다
  const SPINE = ['#7a2e2a', '#8a4b2a', '#2f5a3e', '#2c3f62', '#5a3a5c', '#a07a3a', '#3b2a22', '#9a5a3a', '#4f5f4a', '#c4ad82', '#6a2a3a', '#2a4c4c', '#7c6a3a', '#40506e'];
  function books(x0, x1, yb, h) {
    let x = x0 + .5, out = '', last = 0;
    while (x < x1 - 2.6) {
      const room = x1 - x;
      if (rnd() < .1 && room > 12) { // 눕혀 쌓은 책
        const n = 2 + Math.floor(rnd() * 3); let y = yb, w0 = 9 + rnd() * 3;
        for (let i = 0; i < n; i++) { const w = w0 - rnd() * 1.6, t = 1.8 + rnd() * .9, c = pick(SPINE); out += `<rect x="${f(x + (w0 - w) / 2)}" y="${f(y - t)}" width="${f(w)}" height="${f(t)}" fill="${c}"/><path d="M${f(x + (w0 - w) / 2 + .8)} ${f(y - t / 2)}h${f(w - 1.6)}" stroke="#d8c08a" stroke-width=".25" opacity=".5"/>`; y -= t; }
        x += w0 + .8; last = 0; continue;
      }
      const set = rnd() < .22 ? 3 + Math.floor(rnd() * 3) : 1, c = pick(SPINE), w = 2.2 + rnd() * 2.4, bh = h * (.62 + rnd() * .32), gilt = rnd() < .55, lab = rnd() < .3;
      for (let k = 0; k < set && x + w < x1 - .4; k++) {
        const hh = set > 1 ? bh : h * (.6 + rnd() * .34), y = yb - hh;
        out += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(hh)}" fill="${set > 1 ? c : pick(SPINE)}"/>`;
        if (gilt) out += `<path d="M${f(x + .3)} ${f(y + 1.5)}h${f(w - .6)}M${f(x + .3)} ${f(y + 2.3)}h${f(w - .6)}M${f(x + .3)} ${f(yb - 1.6)}h${f(w - .6)}" stroke="#c9a24a" stroke-width=".3"/>`;
        if (lab) out += `<rect x="${f(x + .5)}" y="${f(y + hh * .3)}" width="${f(w - 1)}" height="${f(Math.min(2.6, hh * .16))}" fill="#e6d6b0" opacity=".75"/>`;
        out += `<rect x="${f(x)}" y="${f(y)}" width=".45" height="${f(hh)}" fill="#fff" opacity=".1"/>`;
        x += w + .15; last = hh;
      }
      if (rnd() < .12 && x1 - x > 7 && last) { // 기대 선 책
        const hh = h * (.6 + rnd() * .25), bw = 2.6 + rnd() * 1.2, s = hh * .24;
        out += `<rect x="${f(x + s)}" y="${f(yb - hh)}" width="${f(bw)}" height="${f(hh)}" fill="${pick(SPINE)}" transform="rotate(-14 ${f(x + s + bw)} ${yb})"/>`;
        x += s + bw + 2.4;
      }
    }
    return out;
  }
  const BAYS = [[3.2, 51.6], [54.6, 103.2], [106.2, 153.4]];
  const ROWS = [[5.4, 23], [25.2, 44], [46.2, 65]];
  // 칸마다 책이 차지할 폭 (물건 자리를 비운다): [행][칸] = [시작, 끝]
  const FILL = [[[3.2, 51.6], [66, 103.2], [106.2, 139]], [[3.2, 51.6], [54.6, 80], [106.2, 153.4]], [[3.2, 34], [54.6, 103.2], [106.2, 153.4]]];
  const shelfBooks = ROWS.map(([, yb], r) => FILL[r].map(([a, b]) => books(a, b, yb, yb - ROWS[r][0] - .6)).join('')).join('');
  const objects = `
    <g transform="translate(60.4 23)"><rect x="-4.4" y="-2" width="8.8" height="2" fill="#4a3a30"/><path d="M-3.6-2Q-3.8-5.6-1.6-6.4L-1.4-8.2Q-3-9.4-2.8-11.6Q-2.4-14.4 0-14.6Q2.6-14.4 2.8-11.4Q2.8-9.2 1.4-8.2L1.6-6.4Q3.8-5.6 3.6-2Z" fill="#e3ddd0"/><path d="M1.6-13.6Q2.6-12 2.4-10" stroke="#b9b1a0" stroke-width=".5" fill="none"/></g>
    <g transform="translate(146 23)"><rect x="-4.6" y="-1.3" width="9.2" height="1.3" rx=".3" fill="#5a3a24"/><rect x="-4.6" y="-15.4" width="9.2" height="1.3" rx=".3" fill="#5a3a24"/>
      <path d="M-3.2-14.1Q-3.2-9.6-.4-7.7Q-3.2-5.8-3.2-1.3H3.2Q3.2-5.8.4-7.7Q3.2-9.6 3.2-14.1Z" fill="#dfe9ea" opacity=".35" stroke="#c9d6d8" stroke-width=".3"/>
      <path d="M-1.6-11.4Q0-10.4 1.6-11.4Q1.2-9.2 0-8.4Q-1.2-9.2-1.6-11.4Z" fill="#d6b16a"/><path d="M-3-1.3Q-2.4-4.4 0-4.8Q2.4-4.4 3-1.3Z" fill="#d6b16a"/><path class="lb-sand" d="M0-8V-4.8" stroke="#d6b16a" stroke-width=".35"/>
      <path d="M-4-14.1V-1.3M4-14.1V-1.3" stroke="#7a5232" stroke-width=".7"/></g>
    <g transform="translate(91 44)"><rect x="-10" y="-1.6" width="20" height="1.6" rx=".5" fill="#8a6a34"/><rect x="-6.6" y="-6.2" width="6" height="4.6" rx="1" fill="#1d2430"/><rect x="-5.4" y="-7.4" width="3.6" height="1.4" rx=".4" fill="#a8843e"/>
      <path d="M-3.6-7.2L4.6-17.6" stroke="#e8e2d6" stroke-width=".35"/><path d="M-1.6-9.6Q1-15.6 4.8-17.8Q2.4-13.6-.6-9.2Z" fill="#eae4d8"/><circle cx="4.6" cy="-3.4" r="1.8" fill="#a8843e"/><rect x="2.8" y="-3.4" width="3.6" height="1.8" fill="#a8843e"/></g>
    <g transform="translate(43.6 65)"><path d="M-6.4 0V-7.4Q-6.4-13.6 0-13.6Q6.4-13.6 6.4-7.4V0Z" fill="#5a3420"/><rect x="-7.2" y="-1.4" width="14.4" height="1.4" rx=".4" fill="#a8843e"/>
      <circle cy="-7.6" r="4" fill="#efe6cf" stroke="#a8843e" stroke-width=".8"/><path d="M0-7.6V-10.4M0-7.6L1.8-6.6" stroke="#2a2018" stroke-width=".45"/><circle cy="-14.2" r=".9" fill="#a8843e"/></g>`;

  const WIN = 'M171 15H239V63H171Z';
  const MUNTIN = 'M193.7 15V63M216.3 15V63M171 27H239M171 51H239';
  const defs = `<defs>
    ${lg('shelf', [[0, '#000', .45], [1, '#000', 0]])}
    ${lg('sky', [[0, '#a7cbe4'], [1, '#e0eff0']])}${lg('sky-k', [[0, '#7d6a9c'], [.5, '#e08c6c'], [1, '#f4c890']])}${lg('sky-n', [[0, '#121a30'], [1, '#26324e']])}
    ${lg('beam', [[0, '#fff3d0', .12], [1, '#fff3d0', 0]])}${lg('beam-k', [[0, '#ffb066', .18], [1, '#ffb066', 0]])}
    ${lg('cone', [[0, '#ffe0a0', .34], [1, '#ffe0a0', .02]])}
    ${rg('pool', '', [[0, '#ffd890', .42], [1, '#ffd890', 0]])}
    ${lg('glass', [[0, '#4fa06c'], [.55, '#226a40'], [1, '#18512f']])}${lg('glass-on', [[0, '#8fe0a8'], [.6, '#3aa865'], [1, '#2a8a50']])}
    ${lg('pic', [[0, '#ffe6a8', .4], [1, '#ffe6a8', 0]])}
    <pattern id="rs-library-damask" width="14" height="18" patternUnits="userSpaceOnUse"><path d="M7 3l2.4 3.6L7 10.2 4.6 6.6zM0 12l2.4 3.6L0 19.2-2.4 15.6zM14 12l2.4 3.6L14 19.2l-2.4-3.6z" fill="#fff" opacity=".05"/></pattern>
    <pattern id="rs-library-chev" width="20" height="10" patternUnits="userSpaceOnUse" patternTransform="scale(1 .5)"><rect width="20" height="10" fill="#432d1f"/>
      <path d="M0 5L10 0V5L0 10ZM20 5L10 0V5L20 10Z" fill="#49311f"/><path d="M0 0L10-5M0 5L10 0M0 10L10 5M0 15L10 10M10-5L20 0M10 0L20 5M10 5L20 10M10 10L20 15M10 0V10M0 0V10" stroke="#2e1e14" stroke-width=".5" stroke-opacity=".7"/></pattern>
    <clipPath id="rs-library-win"><path d="${WIN}"/></clipPath>
    <mask id="rs-library-mk"><path d="${WIN}" fill="#fff"/><path d="${MUNTIN}" stroke="#000" stroke-width="1.6"/><path d="M171 39H239" stroke="#000" stroke-width="2.4"/></mask>
    <filter id="rs-library-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <filter id="rs-library-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".5"/></filter>
  </defs>`;

  // 벽: 왼쪽은 천장까지 닿는 책장(아래는 문 달린 장), 오른쪽은 다마스크 벽지와 판벽, 침대 위엔 그림과 그림등
  const panels = Array.from({ length: 6 }, (_, i) => { const x = 160 + i * 40; return `<rect x="${x}" y="76" width="36" height="34" rx="1" class="lb-pan"/><rect x="${x + 3}" y="79" width="30" height="28" rx=".6" class="lb-pan2"/>`; }).join('');
  const doors = BAYS.map(([a, b]) => { const w = (b - a) / 2; return [0, 1].map((k) => `<rect x="${f(a + k * w + 1)}" y="68.4" width="${f(w - 2)}" height="45.6" class="lb-door"/><rect x="${f(a + k * w + 3.4)}" y="71" width="${f(w - 6.8)}" height="40.4" class="lb-door2"/><circle cx="${f(k ? a + w + 2.6 : a + w - 2.6)}" cy="88" r=".8" fill="#a8843e"/>`).join(''); }).join('');
  const wall = `${defs}
    <rect x="157" y="0" width="243" height="72" fill="url(#rs-library-damask)"/>
    <rect x="157" y="70" width="243" height="46" class="lb-wain"/>${panels}
    <rect x="157" y="69" width="243" height="3.2" class="lb-rail"/><rect x="157" y="69" width="243" height=".6" fill="#fff" opacity=".12"/>
    <rect x="157" y="0" width="243" height="5" class="lb-crown"/><rect x="157" y="5" width="243" height="4" fill="url(#rs-library-shelf)" opacity=".6"/>
    <rect x="0" y="0" width="157" height="116" class="lb-case"/>
    ${ROWS.map(([a, b]) => BAYS.map(([x0, x1]) => `<rect x="${x0}" y="${a}" width="${f(x1 - x0)}" height="${f(b - a)}" class="lb-back"/><rect x="${x0}" y="${a}" width="${f(x1 - x0)}" height="5" fill="url(#rs-library-shelf)"/>`).join('')).join('')}
    ${shelfBooks}${objects}
    ${[23, 44, 65].map((y) => `<rect x="0" y="${y}" width="157" height="2.3" class="lb-board"/><rect x="0" y="${y}" width="157" height=".5" fill="#fff" opacity=".1"/>`).join('')}
    ${[0, 51.6, 103.2, 153.6].map((x) => `<rect x="${x}" y="0" width="3.2" height="116" class="lb-board"/>`).join('')}
    ${doors}
    <rect x="0" y="0" width="157" height="5.4" class="lb-crown"/><rect x="0" y="4.6" width="157" height=".8" fill="#fff" opacity=".1"/>
    <path d="M346 5V10.4" stroke="#8a6a34" stroke-width=".8"/>
    <rect x="322" y="15" width="48" height="36" rx=".6" fill="#a88443"/><rect x="324.4" y="17.4" width="43.2" height="31.2" fill="#7a5a2a"/>
    <rect x="325.6" y="18.6" width="40.8" height="28.8" class="lb-canvas"/>
    <path d="M325.6 38C332 34 338 35.6 344 37.6C350 39.6 358 36 366.4 38.4V47.4H325.6Z" fill="#3e4a32"/><path d="M325.6 42C334 40 346 43 366.4 41.4V47.4H325.6Z" fill="#2e3828"/>
    <path d="M354 41V30.6" stroke="#2a2a20" stroke-width=".9"/><ellipse cx="354" cy="29" rx="4.2" ry="3.6" fill="#33402c"/><path d="M325.6 18.6H366.4V47.4H325.6Z" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>
    <rect x="335.6" y="10.2" width="20.8" height="2.8" rx="1.4" fill="#a8843e"/><rect x="335.6" y="12.2" width="20.8" height=".8" fill="#6f5626"/>`;

  // 창밖: 정원(먼 나무, 산울타리, 잔디 줄무늬, 자갈길, 새 물그릇, 꽃), 창 둘레의 담쟁이, 밤엔 별과 반딧불
  const IVY = [...[172.6, 176.4, 181, 186.2, 190.6, 194, 197, 222, 227, 231.6, 236.4].map((x, i) => [x, 17 + (i % 3) * .9 + (x === 194) * 4, (i % 2 ? -1 : 1) * (12 + i * 3)]),
    ...[23.6, 29.6, 35.6, 41.4, 48].map((y, i) => [172.4 + (i % 2) * 1.4, y, 75 + i * 9]), ...[44, 50.4, 56.6, 61.4].map((y, i) => [236.4 + (i % 2) * 1.4, y, -75 - i * 9])];
  const STARS = [[178, 22, .7], [186, 31, .5], [199, 20, .6], [207, 28, .45], [214, 19, .55], [226, 25, .5], [232, 33, .6], [190, 39, .4], [219, 36, .45]];
  const leaf = 'l-2.4-1.3.5-1.5h1l.9-1.6.9 1.6h1l.5 1.5z';
  const view = `<g clip-path="url(#rs-library-win)">
      <rect x="170" y="14" width="70" height="50" class="lb-sky"/>
      <g class="nite"><g class="lb-stars">${STARS.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${f(-i * .7)}s"/>`).join('')}</g><circle cx="229" cy="24" r="3.6" fill="#f2ebcf"/><circle cx="230.8" cy="22.6" r="3.2" class="lb-mooncut"/></g>
      <path class="lb-trees" d="M171 46Q173 37 179 38.4Q183 32 189.6 35.6Q194.6 30.4 201 34.6Q206 29.6 212.4 34.8Q218 31.4 222.4 36.6Q228 32.6 233.4 37.8Q237 35.6 239 38.6V50H171Z"/>
      <path class="lb-hedge" d="M171 52V47.6Q174 45.4 177 47Q180 45.2 183.4 46.8Q187 45 190.4 46.8Q194 45.2 197 47V52ZM213 52V47Q216.6 45.2 220 46.8Q223.6 45 227 46.8Q230.6 45.2 234 46.8Q237 45.6 239 47V52Z"/>
      <rect class="lb-lawn" x="171" y="50.6" width="68" height="12.4"/><path class="lb-stripe" d="M171 53.4H239V55.6H171ZM171 58H239V60.4H171Z"/>
      <path class="lb-path" d="M199.6 63C201.6 58.4 205.4 54.2 209.4 50.6H212.4C209.6 54.4 207.2 58.6 206.6 63Z"/>
      <g class="lb-bath"><rect x="185.2" y="54.4" width="1.8" height="5.4"/><rect x="183.8" y="59.4" width="4.6" height="1.2" rx=".4"/><path d="M181.6 53.2H190.6Q190 55 186.1 55Q182.2 55 181.6 53.2Z"/></g>
      <g class="lb-flowers">${[178, 181.4, 185.6, 189.8, 194, 216.4, 220.6, 225, 229.4, 234].map((x, i) => `<circle cx="${x}" cy="${52.6 + (i % 3) * .25}" r=".75" fill="${['#e7a1b0', '#f4efe4', '#a58bd1'][i % 3]}"/>`).join('')}</g>
      <g class="nite lb-flies">${[[180, 49], [204, 46.4], [226, 49.6]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r=".7" style="animation-delay:${-i * 1.3}s"/>`).join('')}</g>
      <path class="lb-vine" d="M171 16.6Q186 20 198 17.4Q210 15.4 220 18.2Q230 20.6 239 17M172.8 16V62M237.2 40V63" fill="none" stroke-width=".55"/>
      <g class="lb-ivy">${IVY.map(([x, y, r]) => `<path d="M${x} ${y}${leaf}" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>
      <rect x="171" y="15" width="68" height="48" fill="url(#rs-library-beam)" opacity=".5"/>
    </g>
    <path class="lb-mun" d="${MUNTIN}" stroke-width="1.3"/><path class="lb-mun" d="M171 39H239" stroke-width="2.4"/>`;

  // 바닥: 짙은 헤링본 마루와 페르시아 카펫(마름모 메달리온, 술)
  const fringe = (y, a, b) => `<path d="${Array.from({ length: Math.floor((b - a) / 1.6) }, (_, i) => `M${f(a + .8 + i * 1.6)} ${y}v2.4`).join('')}" stroke="#e4d8bf" stroke-width=".55" opacity=".8"/>`;
  const floor = `
    <rect x="0" y="120" width="400" height="110" fill="url(#rs-library-chev)"/>
    <rect x="0" y="120" width="400" height="6" fill="#000" opacity=".18"/>
    ${fringe(148.6, 66, 334)}${fringe(184, 52, 348)}
    <path d="M66 151H334L348 184.2H52Z" fill="#1f2a44"/>
    <path d="M70.6 153.4H329.4L341.4 181.8H58.6Z" fill="none" stroke="#b08d4a" stroke-width=".7"/>
    <path d="M76.4 155.6H323.6L333.8 179.6H66.2Z" fill="#6b2526"/>
    <path d="M78.4 156.6H321.6L331 178.6H69Z" fill="none" stroke="#b08d4a" stroke-width=".45" stroke-dasharray="1.6 1.2"/>
    <g fill="#b08d4a" opacity=".85">${Array.from({ length: 34 }, (_, i) => `<circle cx="${f(70 + i * 7.9)}" cy="152.3" r=".45"/>`).join('')}${Array.from({ length: 38 }, (_, i) => `<circle cx="${f(58 + i * 7.6)}" cy="182.9" r=".5"/>`).join('')}</g>
    <g transform="translate(200 167.6) scale(1 .3)">
      <path d="M0-36L44 0L0 36L-44 0Z" fill="#1f2a44"/><path d="M0-27L33 0L0 27L-33 0Z" fill="#b08d4a"/><path d="M0-21L25 0L0 21L-25 0Z" fill="#7a2a2b"/>
      <circle r="8" fill="#1f2a44"/><circle r="3.6" fill="#d9c38a"/><path d="M-58-6L-50 0L-58 6L-66 0ZM58-6L66 0L58 6L50 0Z" fill="#1f2a44"/><path d="M-58-2.6L-54.6 0L-58 2.6L-61.4 0ZM58-2.6L61.4 0L58 2.6L54.6 0Z" fill="#b08d4a"/>
      <g fill="#b08d4a" opacity=".45">${[-118, -100, -82, 82, 100, 118].map((x, i) => [-26, 0, 26].map((y) => (y || i % 5) && `<path d="M${x} ${y - 4}l3 4-3 4-3-4z"/>`).join('')).join('')}</g>
    </g>`;

  // 소품: 고사리, 지구본, 쌓인 책, 찻잔, 초록 유리 갓, 의자 징, 고양이, 창으로 든 빛
  const frond = (x0, y0, cx, cy, x1, y1) => {
    let d = `M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`;
    for (let i = 2; i <= 9; i++) {
      const t = i / 10, x = (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * cx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * cy + t * t * y1;
      const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy), l = Math.hypot(dx, dy), s = 2.6 * (1 - t * .7);
      d += `M${f(x)} ${f(y)}l${f((-dy / l + dx / l * .5) * s)} ${f((dx / l + dy / l * .5) * s)}M${f(x)} ${f(y)}l${f((dy / l + dx / l * .5) * s)} ${f((-dx / l + dy / l * .5) * s)}`;
    }
    return d;
  };
  const fern = `<path class="lb-fern" d="${[[39, 87, 33, 80, 27.6, 83.4], [39, 87, 35, 77, 31.4, 75.4], [39, 87, 39.6, 78, 38.6, 73.4], [39, 87, 43, 77, 47, 75.6], [39, 87, 45, 80, 50.4, 83], [39, 87, 36, 82, 30, 88.4], [39, 87, 42, 82, 48.6, 88.6]].map((a) => frond(...a)).join('')}"/>
    <path d="M34.2 87.2H43.8L42.6 94.4H35.4Z" fill="#a8843e"/><rect x="33.8" y="86.6" width="10.4" height="1.6" rx=".5" fill="#c9a24a"/><path d="M35 90.6H43" stroke="#6f5626" stroke-width=".4"/>`;
  const globe = `<path d="M9 137L12.4 119M21 137L17.6 119M15 137V121" stroke="#4a2c1e" stroke-width="1.3" stroke-linecap="round"/><path d="M7 137h4M19 137h4" stroke="#3a2216" stroke-width="1"/>
    <circle cx="15" cy="108" r="9.4" fill="#5f8178"/><path d="M8.6 104.4q3-2.2 5 .4t1.4 4.4q-1.6 1.4-3.4 0M15.6 100.4q3.4-.6 5.4 2.2t-.4 4.2M17.4 110.6q2.4.4 3.4 2.6" stroke="#c9b07a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="12.4" cy="104.6" r="5" fill="#fff" opacity=".1"/><path d="M8.2 99.4A10.6 10.6 0 0 1 21.8 116.6" stroke="#a8843e" stroke-width=".9" fill="none" transform="rotate(-10 15 108)"/>
    <ellipse cx="15" cy="112.6" rx="11.6" ry="2.4" fill="none" stroke="#6f4c2e" stroke-width="1.6"/><ellipse cx="15" cy="112.2" rx="11.6" ry="2.4" fill="none" stroke="#8a6040" stroke-width=".6"/>`;
  const stack = [[151, 135.6, 19, 2.6, '#2c3f62'], [152.4, 133, 16.4, 2.6, '#7a2e2a'], [151.6, 130.4, 17.4, 2.6, '#2f5a3e'], [153.4, 127.6, 14, 2.8, '#a07a3a'], [152.8, 125.2, 15.6, 2.4, '#5a3a5c']].map(([x, y, w, h, c]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".3" fill="${c}"/><rect x="${f(x + w - 1)}" y="${f(y + .4)}" width=".7" height="${f(h - .8)}" fill="#e9dfc6"/><path d="M${f(x + 2)} ${f(y + h / 2)}h${f(w - 5)}" stroke="#c9a24a" stroke-width=".3"/>`).join('');
  const cup = `<g class="table-mug">
    <path class="steam s1" d="M254.6 90q-1.6-1.8 0-3.6t0-3.6"/><path class="steam s2" d="M258 90q-1.6-1.8 0-3.6t0-3.6"/>
    <ellipse cx="256.4" cy="99.4" rx="7" ry="1.2" fill="#f2ede2"/><ellipse cx="256.4" cy="99.2" rx="7" ry="1.2" fill="none" stroke="#c9a24a" stroke-width=".4"/>
    <path d="M261.8 93.6q2.6 0 2.4 2t-3 2.2" stroke="#f2ede2" stroke-width=".9" fill="none"/>
    <path d="M251 92.6H261.8Q261.6 97 259 98.6H253.8Q251.2 97 251 92.6Z" fill="#f4efe6"/><path d="M251.2 94.2H261.6" stroke="#2c4a7a" stroke-width=".7"/><path d="M251.1 93.1H261.7" stroke="#c9a24a" stroke-width=".35"/>
    <ellipse cx="256.4" cy="92.6" rx="5.4" ry=".55" fill="#8a4a24"/><path d="M262.4 99.2l4.6-1.4" stroke="#b9b4aa" stroke-width=".5"/>
  </g>`;
  const SHADE = 'M273.8 59.4Q273.6 50.6 285.2 49.2Q296.8 50.6 296.6 59.4Z';
  const shade = (cls) => `<path class="${cls}" d="${SHADE}"/><path d="M276.4 55.4Q277.4 51.6 285 50.6" stroke="#fff" stroke-width=".7" opacity=".3" fill="none"/>
    <rect x="273.2" y="58.8" width="24" height="1.6" rx=".8" fill="#b08d4a"/><circle cx="285.2" cy="48.6" r="1" fill="#b08d4a"/>`;
  const catSit = `<path d="M-4.6 0Q-5.4-6.4-2.4-8.6Q-3.4-11.8-1.6-13.4L-1.2-15.8L.4-14Q1.4-14.2 2.2-14L3.6-15.8L3.8-13.2Q5.4-11.4 3.8-8.6Q6.4-6 5.4 0Z"/><path class="lb-tail" d="M4.6-.6Q9.4-.6 9.6-3.8Q9.8-6 8.2-6.6" fill="none" stroke-width="1.5" stroke-linecap="round"/>`;
  const catCurl = `<path d="M-9 0C-9.6-4.6-6-7.4-1-7.4C3.6-7.4 7.4-6 8.4-3.4L8.6 0Z"/><circle cx="7" cy="-3.4" r="3.3"/><path d="M4.6-5.4L5.2-9L7.6-6.6ZM7.8-6.6L10.4-8.6L10.2-5Z"/>
    <path class="lb-stripes" d="M-6-6q.8 2.6 0 4.6M-2.6-7.2q.9 3 0 5.8M.8-7.2q.9 3 0 5.8" fill="none" stroke-width=".7"/><path class="lb-ctail" d="M-8.8-.8Q-2 1.6 5.4-.2" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M5.4-3.2q1 .6 2.2 0" stroke="#5f5953" stroke-width=".4" fill="none"/>`;
  const lp = (cls, m) => `<g class="lb-lp ${cls}" transform="matrix(${m})"><path d="${WIN}" mask="url(#rs-library-mk)"/></g>`;
  const props = `
    ${fern}${globe}${stack}${cup}
    <g fill="#c9a24a">${[175.6, 236.4].map((x) => [98, 102, 106, 110, 114].map((y) => `<circle cx="${x}" cy="${y}" r=".55"/>`).join('')).join('')}</g>
    ${shade('lb-shade')}<path d="M289.4 60.4V66.2" stroke="#b08d4a" stroke-width=".35" stroke-dasharray=".6 .3"/><circle cx="289.4" cy="66.8" r=".7" fill="#b08d4a"/>
    <g filter="url(#rs-library-blur)">${lp('lb-lp-d', '1 0 -.2917 -.4167 23.38 155.25')}${lp('lb-lp-k', '1 0 -.9167 -.7083 68.75 180.63')}${lp('lb-lp-a', '1 0 .125 -.3542 -8.88 149.31')}</g>
    <g class="lb-cat lb-cat-sill" transform="translate(229 65)">${catSit}</g>
    <g class="lb-cat lb-cat-floor" transform="translate(244 137.4) scale(.95)">${catSit}</g>
    <g class="lb-cat lb-cat-bed" transform="translate(322 106.6) scale(.9)"><g class="lb-breathe">${catCurl}</g></g>
    <rect class="lb-dim" x="0" y="0" width="400" height="230"/>`;

  // 빛: 낮의 볕과 먼지, 스탠드 불빛(갓, 빛 기둥, 바닥에 고인 빛), 그림등
  const MOTES = [[196, 58, 0], [214, 72, -2], [226, 88, -4], [207, 96, -1], [240, 104, -6], [221, 116, -3], [251, 122, -5], [233, 132, -7], [202, 80, -8], [246, 90, -2.5], [212, 76, -5.5], [258, 112, -1.5]];
  const glow = `
    <g class="lb-sun"><path class="lb-beam" d="M171 15H239L292 140L206 142Z" filter="url(#rs-library-soft)"/>
      <g class="lb-motes">${MOTES.map(([x, y, d]) => `<circle cx="${x}" cy="${y}" r="${f(.45 + (x % 3) * .15)}" style="animation-delay:${d}s"/>`).join('')}</g></g>
    <g class="lb-lit">
      <path d="M274.4 60.4H296L322 139H248.4Z" fill="url(#rs-library-cone)" filter="url(#rs-library-soft)"/>
      <ellipse cx="285.2" cy="139.4" rx="44" ry="8.6" fill="url(#rs-library-pool)"/>
      ${shade('lb-shade-on')}<path d="M274.6 59.6Q285.2 61.8 295.8 59.6" stroke="#fff4cf" stroke-width="1.2" fill="none"/>
      <rect class="lb-piclit" x="324" y="15" width="44" height="34" fill="url(#rs-library-pic)"/>
    </g>`;

  const N = (sel) => `${R}.sky-night ${sel}, ${R}.night ${sel}`;
  // 낮·해질녘·밤 채움색
  const TONE = { canvas: ['#b89a62', '#c49460', '#7d6a48'], sky: ['url(#rs-library-sky)', 'url(#rs-library-sky-k)', 'url(#rs-library-sky-n)'], trees: ['#86a898', '#6a6a6a', '#1b2629'],
    hedge: ['#4e7c54', '#3c5440', '#16211c'], lawn: ['#8dbd6c', '#75864e', '#1e2c24'], stripe: ['#9bc97a', '#7f8f55', '#213128'], path: ['#dcd2b8', '#c9a98a', '#343a3c'],
    bath: ['#b9b4a8', '#9a8a80', '#3c4044'], ivy: ['#3f7442', '#34522e', '#142018'] };
  const css = `
  ${R}[id] { --wall: #2d4838; --wall-line: #2a1a10; --floor: #432d1f; --floor-line: #2e1e14; --wood: #77462d; --wood-dark: #4a2b1c; --metal: #a8843e; --frame: #3a2619;
    --sheet: #e9e2d2; --pillow: #f1ebdd; --blanket: #2f5a44; --blanket-dark: #244836; --lamp: #ffd98a; --shade: #226a40; --rug: #6b2526; --rug-line: #b08d4a;
    --arm: #7a2f2a; --arm-dark: #642622; --cushion: #b08d4a; }
  ${R}[id].sky-dusk { --wall: #304636; }
  ${R}[id].sky-night, ${R}[id].night { --wall: #26392e; --floor: #3a271b; }
  ${R} .floor-line, ${R} .rug, ${R} .rug-line, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
  ${R} .sky, ${R} .shade, ${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} .pot, ${R} .leaf, ${R} rect.wood[x="14"][y="44"], ${R} #scene > .table-mug { display: none; }
  ${R} .frame { rx: .8; }
  ${R} .lb-case { fill: #3a2619; } ${R} .lb-back { fill: #22160f; } ${R} .lb-board { fill: #4e3221; } ${R} .lb-crown { fill: #3a2619; }
  ${R} .lb-door { fill: #4a2f1f; } ${R} .lb-door2 { fill: #432a1b; stroke: #5e3d28; stroke-width: .6; }
  ${R} .lb-wain { fill: #3e271a; } ${R} .lb-pan { fill: #452c1d; } ${R} .lb-pan2 { fill: none; stroke: #573925; stroke-width: .8; } ${R} .lb-rail { fill: #553722; }
  ${Object.entries(TONE).map(([k, [d, e, n]]) => `${R} .lb-${k} { fill: ${d}; } ${R}.sky-dusk .lb-${k} { fill: ${e}; } ${N(`.lb-${k}`)} { fill: ${n}; }`).join('\n  ')}
  ${R} .lb-mooncut { fill: #18213a; } ${R} .lb-stars circle { fill: #fff; animation: rs-library-twinkle 4s ease-in-out infinite; } ${N('.lb-flowers')} { opacity: .25; }
  ${R} .lb-flies circle { fill: #e9f59a; animation: rs-library-fly 3.9s ease-in-out infinite; }
  ${R} .lb-vine { stroke: #4a5a32; } ${N('.lb-vine')} { stroke: #18201a; }
  ${R} .lb-mun { stroke: #3a2619; fill: none; }
  ${R} .lb-fern { stroke: #4f8a4a; stroke-width: .5; fill: none; stroke-linecap: round; }
  ${R} .lb-shade { fill: url(#rs-library-glass); } ${R} .lb-shade-on { fill: url(#rs-library-glass-on); }
  ${R} .lb-cat { fill: #3b3734; stroke: #3b3734; } ${R} .lb-cat .lb-tail { transform-box: fill-box; transform-origin: 0 100%; animation: rs-library-tail 5s ease-in-out infinite; }
  ${R} .lb-cat-floor, ${R} .lb-cat-bed { fill: #a39b92; stroke: #a39b92; } ${R} .lb-stripes { stroke: #7d756d; } ${R} .lb-ctail { stroke: #a39b92; }
  ${R} .lb-breathe { transform-box: fill-box; transform-origin: 50% 100%; animation: rs-library-breathe 3.8s ease-in-out infinite; }
  ${R} .lb-cat-floor, ${R} .lb-cat-bed, ${N('.lb-cat-sill')} { display: none; } ${R}.sky-night .lb-cat-floor, ${R}.night .lb-cat-bed { display: inline; }
  ${R} .lb-lp path { fill: #fff3d0; } ${R} .lb-lp-d { opacity: .26; } ${R} .lb-lp-k { opacity: .4; } ${R} .lb-lp-k path { fill: #ffad5a; } ${R} .lb-lp-a { opacity: .22; } ${R} .lb-lp-a path { fill: #dfe8ff; }
  ${R} .lb-lp-k, ${R} .lb-lp-a, ${R}.sky-dusk .lb-lp-d, ${N('.lb-lp-d')} { display: none; } ${R}.sky-dusk .lb-lp-k, ${R}.night .lb-lp-a { display: inline; }
  ${R} .lb-beam { fill: url(#rs-library-beam); } ${R}.sky-dusk .lb-beam { fill: url(#rs-library-beam-k); } ${N('.lb-sun')}, ${R}.sky-dusk .lb-motes { display: none; }
  ${R} .lb-motes circle { fill: #fff6d8; opacity: .5; animation: rs-library-mote 9s ease-in-out infinite; }
  ${R} .lb-lit, ${R} .lb-dim { display: none; } ${R}.sky-dusk .lb-lit, ${R}.sky-night .lb-lit, ${R}.sky-night .lb-dim { display: inline; }
  ${R}.sky-dusk .lb-lit { opacity: .8; } ${R}.sky-dusk .lb-piclit { display: none; }
  ${R} .lb-dim { fill: #0e1320; opacity: .3; }
  ${R} #lampGlow { opacity: 0; } ${R}.sky-dusk #lampGlow { opacity: .6; } ${R}.sky-night #lampGlow { opacity: .9; } ${R}.night #lampGlow { opacity: 0; }
  ${R} .lb-sand { animation: rs-library-sand 1.6s steps(2) infinite; }
  @keyframes rs-library-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes rs-library-fly { 0%, 100% { opacity: 0; transform: translate(0, 0); } 40% { opacity: 1; } 60% { opacity: .9; transform: translate(2px, -1.4px); } }
  @keyframes rs-library-mote { 0% { opacity: 0; transform: translate(0, 0); } 30% { opacity: .9; } 70% { opacity: .7; } 100% { opacity: 0; transform: translate(5px, -7px); } }
  @keyframes rs-library-tail { 0%, 60%, 100% { transform: rotate(0); } 75% { transform: rotate(-14deg); } }
  @keyframes rs-library-breathe { 50% { transform: scale(1.03, 1.08); } }
  @keyframes rs-library-sand { 50% { opacity: .4; } }`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['library'] = { css, wall, view, floor, props, glow };
})();
