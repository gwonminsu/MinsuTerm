'use strict';
// 방 스타일: 80년대 게임방 — 브라운관과 오락기 소리 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮: 파스텔 픽셀 도시, 오락기 데모 화면. 해질녘: 줄무늬 해의 노을, INSERT COIN. 밤: 별똥별, 포스터 네온, 블랙라이트 카펫. 잘 때: GAME OVER만 깜빡인다.
(() => {
  const R = '#room[data-room="arcade"]';
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = (v) => +v.toFixed(2);
  const rect = (x, y, w, h, a = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${a}/>`;
  const rf = (x, y, w, h, f) => rect(x, y, w, h, ` fill="${f}"`);
  const sq = (x, y, w, h) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
  // 픽셀 그림: 글자마다 색 하나, 같은 색 칸은 한 path로 (칸 사이에 실금이 생기지 않게)
  const bmp = (rows, x, y, p, pal, a = '') => {
    const by = {};
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length;) {
        const ch = row[c];
        let e = c;
        while (row[e + 1] === ch) e++;
        if (ch !== '.') (by[ch] = by[ch] || []).push(sq(x + c * p, y + r * p, (e - c + 1) * p, p));
        c = e + 1;
      }
    });
    return Object.entries(by).map(([ch, d]) => `<path d="${d.join('')}" fill="${pal[ch]}"${a}/>`).join('');
  };
  // 3×5 픽셀 글꼴 (M·N은 넓게)
  const FONT = { A: '111/101/111/101/101', C: '111/100/100/100/111', E: '111/100/111/100/111', G: '111/100/101/101/111', I: '111/010/010/010/111',
    M: '10001/11011/10101/10001/10001', N: '1001/1101/1011/1001/1001', O: '111/101/101/101/111', R: '111/101/110/101/101',
    S: '111/100/111/001/111', T: '111/010/010/010/010', V: '101/101/101/101/010', ' ': '0/0/0/0/0' };
  const tw = (s) => [...s].reduce((w, ch) => w + FONT[ch].indexOf('/') + 1, -1);
  const txt = (s, cx, y, p) => {
    let d = '';
    let col = 0;
    const x = cx - (tw(s) * p) / 2;
    for (const ch of s) {
      const rows = FONT[ch].split('/');
      rows.forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') d += sq(x + (col + c) * p, y + r * p, p, p); }));
      col += rows[0].length + 1;
    }
    return d;
  };

  // ── 창밖 픽셀 도시 (한 칸 = 2) ──
  const P = 2;
  const cell = (c, r, w, h, a) => rect(171 + c * P, 15 + r * P, w * P, h * P, a);
  const bands = (list) => { let r = 0; return list.map(([h, f]) => { const s = cell(0, r, 34, h, ` fill="${f}"`); r += h; return s; }).join(''); };
  const back = [[0, 4, 10], [4, 3, 6], [7, 3, 12], [10, 2, 9], [14, 7, 18], [22, 3, 9], [25, 3, 5], [28, 3, 11], [31, 3, 7]];
  const front = [[0, 5, 15], [5, 3, 11], [8, 5, 17], [13, 3, 20], [16, 3, 21], [19, 3, 19], [22, 5, 13], [27, 3, 16], [30, 5, 12]];
  const litCls = () => { const r = rnd(); return r < 0.3 ? 'rs-arcade-l1' : r < 0.75 ? 'rs-arcade-l2' : 'rs-arcade-l3'; };
  const litCol = () => ['#ffd43b', '#ffd43b', '#ff8ac6', '#7df9ff'][Math.floor(rnd() * 4)];
  let city = `<g class="rs-arcade-bk">${back.map(([c, w, t]) => cell(c, t, w, 24 - t)).join('')}</g>`;
  for (const [c, w, t] of back) for (let r = t + 1; r < 23; r += 2) for (let k = c; k < c + w; k += 2) if (rnd() < 0.22) city += rect(171 + k * P + 0.5, 15 + r * P + 0.5, 1, 1, ` class="${litCls()}" fill="${litCol()}"`);
  city += `<g class="rs-arcade-fr">${front.map(([c, w, t], i) => cell(c, t, w, 24 - t, ` class="rs-arcade-c${i % 6}"`)).join('')}${cell(6, 8, 1, 3, ' class="rs-arcade-c3"')}</g>`;
  let glass = '';
  let lit = '';
  for (const [c, w, t] of front) for (let r = t + 1; r < 23; r += 2) for (let k = c + 1; k < c + w - 1; k += 2) {
    glass += cell(k, r, 1, 1);
    if (rnd() < 0.45) lit += cell(k, r, 1, 1, ` class="${litCls()}" fill="${litCol()}"`);
  }
  // 해질녘의 줄무늬 해: 1 높이 줄을 2 칸에 맞춰 쌓고, 아래로 갈수록 틈이 잦아진다
  let sun = '';
  for (let y = 39; y < 59; y++) {
    const dy = y + 0.5 - 49;
    if ([44, 47, 49, 51, 53, 55, 57].includes(y) || Math.abs(dy) >= 10) continue;
    const half = Math.round(Math.sqrt(100 - dy * dy) / 2) * 2;
    const t = (y - 39) / 14;
    const col = `rgb(${255},${Math.round(230 - 151 * t)},${Math.round(109 + 45 * t)})`;
    sun += rect(205 - half, y, half * 2, 1, ` fill="${col}"`);
  }
  const star5 = ['..1..', '.111.', '11111', '.111.', '.1.1.'];
  const cloud = ['..1111...', '.1111111.', '111111111'];
  const clouds = bmp(cloud, 174, 21, P, { 1: '#ffffff' }) + bmp(cloud.map((r) => r.slice(1)), 209, 27, P, { 1: '#ffffff' });
  const stars = [[175, 19], [183, 27], [190, 17], [198, 31], [203, 21], [211, 17], [217, 29], [224, 21], [230, 33], [236, 19], [180, 35], [194, 25], [221, 37], [233, 27], [187, 41], [214, 25]];

  // ── 바닥: 소실점이 위로 멀리 있는 흑백 체크 타일 ──
  const VY = -380;
  const ys = [];
  for (let y = 120, h = 9; y < 230; y += h, h *= 1.045) ys.push(y);
  ys.push(240);
  const X = (xb, y) => 200 + ((xb - 200) * (y - VY)) / (120 - VY);
  let tiles = '';
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < 20; c++) if ((r + c) % 2 === 0) {
    const [a, b] = [ys[r], ys[r + 1]];
    tiles += `M${n(X(c * 20, a))} ${n(a)}L${n(X(c * 20 + 20, a))} ${n(a)}L${n(X(c * 20 + 20, b))} ${n(b)}L${n(X(c * 20, b))} ${n(b)}Z`;
  }

  // ── 블랙라이트 카펫 무늬 (러그 안, 눕힌 도형) ──
  const shapes = ['M-3 0l1.5-2 1.5 2 1.5-2 1.5 2', 'M0-2.4l2.4 4h-4.8z', 'M2 0a2 2 0 1 1-4 0a2 2 0 1 1 4 0', 'M-2.6 0q1.3-2.4 2.6 0t2.6 0', 'M-2 0h4M0-2v4'];
  const neonCols = ['#ff5ab4', '#3be3ff', '#ffd43b', '#b6ff5c'];
  let carpet = '';
  for (let i = 0, x = 52; x < 350; x += 21, i++) {
    const y = i % 2 ? 171.5 : 160.5;
    carpet += `<path transform="translate(${n(x + rnd() * 6)} ${y}) scale(1 .42) rotate(${Math.round(rnd() * 60 - 30)})" d="${shapes[i % 5]}" stroke="${neonCols[(i * 3) % 4]}"/>`;
  }

  const css = `
${R} { --wall: #9b90e4; --wall-line: #6d5fc7; --floor: #ddd6eb; --floor-line: #ddd6eb; --wood: #3d3366; --wood-dark: #2c2550; --metal: #2b2440; --frame: #fbf8ff;
  --sky: #9fdcff; --sheet: #f6f3fc; --pillow: #ffd1e8; --blanket: #3cc9b5; --blanket-dark: #27a898; --screen: #0b1712; --laptop: #ece4d4; --mug: #ff6fae; --lamp: #ffd86b; --shade: #ffd43b; }
${R}:not(#rs) { --rug: #261e40; --rug-line: #ff6fae; --arm: #ff74b4; --arm-dark: #e2589a; --cushion: #ffd43b; }
${R}.sky-dusk { --wall: #8a6cc0; --wall-line: #5d4aa8; --floor: #c9b8d9; --frame: #f3e6f7; }
${R}.sky-night, ${R}.night { --wall: #2c2254; --wall-line: #1f1840; --floor: #403759; --frame: #9a91c4; --wood: #2e2752; --wood-dark: #221c40;
  --sheet: #c9c2e2; --pillow: #d9a9c8; --blanket: #2f9e90; --blanket-dark: #227f74; --shade: #d9b032; }
${R}.sky-night:not(#rs), ${R}.night:not(#rs) { --arm: #c9589a; --arm-dark: #ab4682; --rug: #1a142e; }
${R} .wall, ${R} .base, ${R} .floor { transition: fill .8s; }
${R} .floor-line, ${R} .laptop, ${R} .screen, ${R} .code, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .win-bar,
${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star, ${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} .pot, ${R} .leaf,
${R} rect.wood[x="14"], ${R} .table-mug > .steam, ${R} .table-mug > .mug, ${R} .table-mug > .mug-handle { display: none; }
${R} .sglow-a, ${R} .sglow-b { stop-color: #7dffb0; }
${R} .rs-arcade-k, ${R} .rs-arcade-n, ${R} .rs-arcade-on, ${R} .rs-arcade-x, ${R} .rs-arcade-z, ${R} .rs-arcade-l1, ${R} .rs-arcade-l2, ${R} .rs-arcade-l3 { display: none; }
${R}.sky-dusk .rs-arcade-k, ${R}.sky-night .rs-arcade-n, ${R}.sky-dusk .rs-arcade-on, ${R}.sky-night .rs-arcade-on, ${R}.night .rs-arcade-z,
${R}.sky-dusk .rs-arcade-x, ${R}.sky-night .rs-arcade-x, ${R}.night .rs-arcade-x,
${R}.sky-dusk .rs-arcade-l1, ${R}.sky-night .rs-arcade-l1, ${R}.night .rs-arcade-l1, ${R}.sky-night .rs-arcade-l2, ${R}.night .rs-arcade-l2, ${R}.sky-night .rs-arcade-l3 { display: inline; }
${R}.sky-dusk .rs-arcade-d, ${R}.sky-night .rs-arcade-d, ${R}.night .rs-arcade-d, ${R}.sky-dusk .rs-arcade-dn, ${R}.night .rs-arcade-dn, ${R}.night .rs-arcade-crt { display: none; }
${R}.night .rs-arcade-mq { opacity: .45; }
${R} .rs-arcade-c0 { fill: #f7a8c8; } ${R} .rs-arcade-c1 { fill: #9ee6cf; } ${R} .rs-arcade-c2 { fill: #ffe08a; }
${R} .rs-arcade-c3 { fill: #c4b0f5; } ${R} .rs-arcade-c4 { fill: #ffc3a0; } ${R} .rs-arcade-c5 { fill: #a8c8ff; }
${R} .rs-arcade-bk { fill: #dcd6f6; }
${R}.sky-dusk .rs-arcade-bk { fill: #6a2a78; } ${R}.sky-dusk .rs-arcade-fr rect { fill: #3d1a5c; }
${R}.sky-night .rs-arcade-bk, ${R}.night .rs-arcade-bk { fill: #2a1d52; } ${R}.sky-night .rs-arcade-fr rect, ${R}.night .rs-arcade-fr rect { fill: #1a1238; }
${R} .rs-arcade-g { fill: #ffffff; opacity: .55; }
${R}.sky-dusk .rs-arcade-g, ${R}.sky-night .rs-arcade-g, ${R}.night .rs-arcade-g { fill: #0e0a24; opacity: .55; }
${R} .rs-arcade-tile { fill: #4b4369; } ${R}.sky-dusk .rs-arcade-tile { fill: #352a50; } ${R}.sky-night .rs-arcade-tile, ${R}.night .rs-arcade-tile { fill: #1b1628; }
${R} .rug-line { opacity: .6; } ${R}.night #lampGlow { display: none; }
${R} .rs-arcade-post { fill: #8379b8; } ${R}.sky-dusk .rs-arcade-post, ${R}.sky-night .rs-arcade-post, ${R}.night .rs-arcade-post { fill: #1a1238; }
${R} .rs-arcade-sheen { opacity: .12; } ${R}.sky-dusk .rs-arcade-sheen { opacity: .07; } ${R}.sky-night .rs-arcade-sheen, ${R}.night .rs-arcade-sheen { opacity: .04; }
${R} .rs-arcade-paper { opacity: .5; } ${R}.sky-dusk .rs-arcade-paper { opacity: .4; } ${R}.sky-night .rs-arcade-paper, ${R}.night .rs-arcade-paper { opacity: .13; }
${R} .rs-arcade-wain { fill: #7468cf; } ${R}.sky-dusk .rs-arcade-wain { fill: #6a4fa6; } ${R}.sky-night .rs-arcade-wain, ${R}.night .rs-arcade-wain { fill: #221a44; }
${R}.sky-night .rs-arcade-stripe, ${R}.night .rs-arcade-stripe { opacity: .45; }
${R} .rs-arcade-carpet { opacity: .5; }
${R} .rs-arcade-drift { animation: rs-arcade-drift 90s steps(34) infinite; }
${R} .rs-arcade-tw { animation: rs-arcade-tw 2.4s steps(1) infinite; } ${R} .rs-arcade-tw2 { animation: rs-arcade-tw 3.1s steps(1) .9s infinite; }
${R} .rs-arcade-shoot { animation: rs-arcade-shoot 7s linear 1s infinite; opacity: 0; }
${R} .rs-arcade-blink { animation: rs-arcade-tw 1.1s steps(1) infinite; } ${R} .rs-arcade-blink2 { animation: rs-arcade-tw 1.8s steps(1) infinite; }
${R} .rs-arcade-sway { animation: rs-arcade-sway 3.2s steps(4) infinite alternate; }
${R} .rs-arcade-shot { animation: rs-arcade-shot .9s linear infinite; }
${R}.working .rs-arcade-code { animation: rs-arcade-tw 1.4s steps(1) infinite; } ${R}.working .rs-arcade-code + .rs-arcade-code { animation-delay: .5s; }
@keyframes rs-arcade-drift { to { transform: translateX(68px); } }
@keyframes rs-arcade-tw { 50% { opacity: .15; } }
@keyframes rs-arcade-shoot { 0% { opacity: 0; transform: translate(0, 0); } 1% { opacity: 1; } 12% { opacity: 1; } 15% { opacity: 0; transform: translate(-36px, 18px); } 100% { opacity: 0; transform: translate(-36px, 18px); } }
@keyframes rs-arcade-sway { from { transform: translateX(-1.6px); } to { transform: translateX(1.6px); } }
@keyframes rs-arcade-shot { 0% { transform: translateY(0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translateY(-6.4px); opacity: 0; } }
`;

  const memphis = '<path d="M3 8l3-3 3 3 3-3 3 3" stroke="#ffe066" stroke-width="1.2" fill="none"/><path d="M27 4l4 7h-8z" stroke="#7ff0d0" stroke-width="1" fill="none"/>'
    + '<circle cx="35" cy="21" r="1.3" fill="#ffffff"/><path d="M8 25a4 4 0 0 1 8 0z" fill="#ff8fc4"/><path d="M24 27l4-2M27 29.4l4-2" stroke="#8fd0ff" stroke-width="1.1"/><path d="M19 15h3M20.5 13.5v3" stroke="#ffffff" stroke-width=".9"/>';
  const posterNeon = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="none" stroke="${c}" stroke-width="2.4" filter="url(#rs-arcade-bloom)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width=".7"/>`;
  const rocket = ['..a..', '.aaa.', '.aba.', '.aaa.', 'caaac', 'c.d.c', '..d..'];
  const car = ['....aaaaaaaa....', '...abbbbbbbba...', '..aaaaaaaaaaaa..', '.aaccaaaaaaccaa.', '.aaaaaaaaaaaaaa.', '.dd..........dd.'];
  const palm = ['.aa.aa', 'aaaaa.', '..b...', '..b...', '..b...', '..b...'];

  const wall = `<defs>
  <pattern id="rs-arcade-memphis" patternUnits="userSpaceOnUse" width="40" height="32">${memphis}</pattern>
  <pattern id="rs-arcade-scan" patternUnits="userSpaceOnUse" width="4" height=".9"><rect width="4" height=".36" fill="#000000" opacity=".4"/></pattern>
  <radialGradient id="rs-arcade-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7dffb0" stop-opacity=".22"/><stop offset="1" stop-color="#7dffb0" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-arcade-pink" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff5ab4" stop-opacity=".28"/><stop offset="1" stop-color="#ff5ab4" stop-opacity="0"/></radialGradient>
  <filter id="rs-arcade-bloom" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="230"><feGaussianBlur stdDeviation="1.3"/></filter>
  <clipPath id="rs-arcade-win"><rect x="171" y="15" width="68" height="48"/></clipPath>
  <clipPath id="rs-arcade-rugc"><ellipse cx="200" cy="166" rx="163" ry="15.6"/></clipPath>
  <clipPath id="rs-arcade-cup"><path d="M251.2 89.2H260.8L259.6 100H252.4Z"/></clipPath>
</defs>
<rect class="rs-arcade-paper" x="0" y="0" width="400" height="86" fill="url(#rs-arcade-memphis)"/>
<rect class="rs-arcade-wain" x="0" y="86" width="400" height="30"/>
<g class="rs-arcade-stripe">${rf(0, 86, 400, 1.4, '#ff6fae')}${rf(0, 88.2, 400, 1.4, '#ffd43b')}${rf(0, 90.4, 400, 1.4, '#5fe3c0')}</g>
<rect x="30" y="44" width="36" height="3" rx=".6" fill="#5fd3bb"/><rect x="30" y="46.2" width="36" height=".8" fill="#000000" opacity=".15"/><path d="M33 47h3l-3 3zM63 47h-3l3 3z" fill="#ff6fae"/>
${[31.2, 33.8, 36.4, 39].map((x, i) => rf(x, 33, 2.4, 11, '#8e88a6') + rect(x + 0.4, 34.4, 1.6, 6.6, ` fill="${['#ff6fae', '#ffd43b', '#3be3ff', '#b49bff'][i]}"`)).join('')}
${rect(41.8, 35.4, 8, 8.6, ' rx=".6" fill="#9a94b0"')}<path d="M43 36.4h5.6M43 37.4h5.6" stroke="#7d7894" stroke-width=".4"/>${rf(42.8, 38.4, 6, 4.8, '#1d1650')}${bmp(star5, 44.55, 39.55, 0.58, { 1: '#ffd43b' })}
${rect(51.4, 33.6, 6, 10.4, ' rx="1" fill="#ff9fc8"')}${rect(52.2, 34.6, 4.4, 4.4, ' rx=".4" fill="#3d3560"')}${rf(52.8, 35.2, 3.2, 3.2, '#a8e6cf')}<path d="M52.6 41.6h2.2M53.7 40.5v2.2" stroke="#3d3560" stroke-width=".7"/><circle cx="55.8" cy="42.1" r=".5" fill="#6d3cff"/><circle cx="56.6" cy="41.1" r=".5" fill="#6d3cff"/>
<path d="M59 38l1.4-1.4h6L65 38z" fill="#f4f1fa"/>${bmp(['abc', 'cab', 'bca'], 59, 38, 2, { a: '#ff4d6d', b: '#3cc9b5', c: '#ffd43b' })}<path d="M59 38h6v6h-6zM61 38v6M63 38v6M59 40h6M59 42h6" fill="none" stroke="#1d1832" stroke-width=".35"/>
${rf(78, 16, 28, 40, '#f7f3ff')}${rf(79, 17, 26, 38, '#1d1650')}
<g fill="#ffffff" opacity=".7">${[[81.5, 27], [99.5, 26.4], [86, 33.2], [102, 36.6], [80.6, 44], [98.4, 47], [89.6, 49.4], [94, 41]].map(([x, y]) => rect(x, y, 0.9, 0.9)).join('')}</g>
<path d="${txt('COMET', 92.6, 19.6, 0.9)}" fill="#ff5ab4"/><path d="${txt('COMET', 92, 19, 0.9)}" fill="#ffd43b"/>
${bmp(['....oy', '...oo.', '..pp..', 'pp....'].map((r) => r), 91, 29, 1.6, { y: '#fff6c2', o: '#ffb347', p: '#ff5ab4' })}
${bmp(rocket, 84, 38.6, 1.3, { a: '#f4f0ff', b: '#5fd4ff', c: '#ff5ab4', d: '#ffb347' })}
${rf(79, 51.6, 26, 1.2, '#ff5ab4')}${rf(79, 53.2, 26, 0.8, '#3be3ff')}
${rf(326, 20, 50, 44, '#f7f3ff')}
<g>${rf(327, 21, 48, 9, '#7fd8ff')}${rf(327, 30, 48, 6, '#a5e5ff')}${rf(327, 36, 48, 6, '#ffd0e8')}${rf(327, 42, 48, 4, '#ffe9a8')}
  ${bmp(['..111..', '.11111.', '1111111'], 344, 40, 1.4, { 1: '#ffb347' })}${rf(327, 46, 48, 17, '#5fe3c0')}
  <path d="M349 46h4l16 17h-36z" fill="#4a3f6b"/><path d="M349 46l-16 17M353 46l16 17" stroke="#ff6fae" stroke-width=".8"/>${[[350.6, 47, 0.8, 1.2], [350.4, 50, 1.2, 1.8], [350.2, 54, 1.6, 2.6]].map(([x, y, w, h]) => rf(x, y, w, h, '#ffffff')).join('')}
  ${bmp(car, 343, 56.4, 1, { a: '#ff4d6d', b: '#2a2147', c: '#ffd43b', d: '#1a1530' })}
  ${bmp(palm, 330, 40, 1.4, { a: '#2a8f7e', b: '#7a4b3a' })}${bmp(palm.map((r) => [...r].reverse().join('')), 363.6, 40, 1.4, { a: '#2a8f7e', b: '#7a4b3a' })}
  <path d="${txt('STAR RACER', 351.5, 23.5, 0.8)}" fill="#3a1a6e"/><path d="${txt('STAR RACER', 351, 23, 0.8)}" fill="#ff3d8b"/></g>
<g class="nite" fill="#120c2a" opacity=".32"><rect x="78" y="16" width="28" height="40"/><rect x="326" y="20" width="50" height="44"/></g>
<g class="rs-arcade-d" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"><rect x="75.6" y="13.6" width="32.8" height="44.8" rx="2"/><rect x="323.6" y="17.6" width="54.8" height="48.8" rx="2"/></g>`;

  const view = `<g clip-path="url(#rs-arcade-win)">
  <g class="rs-arcade-d">${bands([[6, '#7ccfff'], [6, '#96d9ff'], [4, '#b3e5ff'], [4, '#d4efff'], [4, '#ffe3f1']])}${bmp(['.111.', '11111', '11111', '11111', '.111.'], 223, 19, P, { 1: '#ffe45c' })}
    <g class="rs-arcade-drift">${clouds}<g transform="translate(-68 0)">${clouds}</g></g></g>
  <g class="rs-arcade-k">${bands([[4, '#2b1055'], [4, '#4a1670'], [4, '#7a1f80'], [3, '#b52f7e'], [3, '#e5476f'], [3, '#ff7a59'], [3, '#ffb347']])}${sun}</g>
  <g class="nite">${bands([[8, '#0a0a26'], [8, '#120f38'], [4, '#1c1446'], [4, '#2a1a55']])}
    ${bmp(['..###.', '.##...', '##....', '##....', '##....', '.##...', '..###.'], 178, 18, 1, { '#': '#fff3b0' })}
    <g fill="#ffffff">${stars.map(([x, y], i) => rect(x, y, 1, 1, i % 5 === 1 ? ' class="rs-arcade-tw"' : i % 5 === 3 ? ' class="rs-arcade-tw2"' : '')).join('')}</g>
    <g class="rs-arcade-shoot">${rf(228, 18, 1.5, 1.5, '#ffffff')}${[1, 2, 3, 4].map((k) => rect(228 + k * 2, 18 - k, 1.5, 1, ` fill="#ffe9a8" opacity="${n(1 - k * 0.22)}"`)).join('')}</g></g>
  ${city}<g class="rs-arcade-g">${glass}</g><g>${lit}</g>
  <g class="rs-arcade-post"><rect x="215.4" y="37" width=".8" height="4"/><rect x="219.8" y="37" width=".8" height="4"/></g>
  ${bmp(star5, 215.5, 32, 1, { 1: '#ffe9a0' }, ' class="rs-arcade-d"')}${bmp(star5, 215.5, 32, 1, { 1: '#ffd43b' }, ' class="rs-arcade-x"')}
  <rect class="nite rs-arcade-tw" x="183.4" y="30.4" width="1.2" height="1.2" fill="#ff4d6d"/>
  <path class="rs-arcade-sheen" d="M176 63L190 15H196L182 63Z" fill="#ffffff"/>
</g>`;

  const floor = `<path class="rs-arcade-tile" d="${tiles}"/><ellipse cx="14" cy="134" rx="15" ry="2.2" fill="#000000" opacity=".22"/>`;

  // 오락기 (책상 왼쪽, 벽 앞), 선인장 화분, 브라운관과 조이스틱, 탄산음료
  const cactus = ['....pp....', '...pyyp...', '...abbc...', '...abbc...', 'ac.abbc...', 'ac.abbc.ac', 'ac.abbc.ac', 'abbabbc.ac', '.ccabbcbbc', '...abbccc.', '...abbc...', '...abbc...', '...abbc...'];
  const props = `<g clip-path="url(#rs-arcade-rugc)" fill="none" stroke-width="1.1" stroke-linecap="round" class="rs-arcade-carpet">${carpet}</g>
<rect x="1" y="50" width="26" height="8.4" rx=".8" fill="#1c1636"/>${rf(2.4, 51.2, 23.2, 6, '#ffd6ea')}
${bmp(star5, 11.75, 51.95, 0.9, { 1: '#ff5ab4' })}${rf(3.4, 54.4, 6.6, 0.8, '#3be3ff')}${rf(18, 54.4, 6.6, 0.8, '#3be3ff')}${rf(3.4, 55.6, 6.6, 0.6, '#ffd43b')}${rf(18, 55.6, 6.6, 0.6, '#ffd43b')}
${rf(2, 58.4, 24, 75.6, '#2a2147')}${rf(1.4, 50, 1.2, 84, '#ff6fae')}${rf(25.4, 50, 1.2, 84, '#ff6fae')}
<rect x="4" y="60.4" width="20" height="18.4" rx="1" fill="#0e0b1c"/><rect x="5.6" y="62" width="16.8" height="14.4" rx="1.6" fill="#06040f"/>
<path d="M.6 80.2H27.4L26.4 86.6H1.6Z" fill="#433774"/>${rf(1.6, 86.6, 24.8, 1.6, '#1c1636')}
${rf(7.2, 78, .8, 4, '#15111f')}<circle cx="7.6" cy="77.6" r="1.5" fill="#ff4d6d"/><circle cx="7.1" cy="77.1" r=".45" fill="#ffffff" opacity=".6"/>
<ellipse cx="14.4" cy="83" rx="1.2" ry=".7" fill="#ffd43b"/><ellipse cx="18" cy="83.6" rx="1.2" ry=".7" fill="#5fe3c0"/><ellipse cx="21.6" cy="83" rx="1.2" ry=".7" fill="#3be3ff"/>
<rect x="8" y="95" width="12" height="16" rx=".6" fill="#8d88a6"/><rect x="10" y="98" width="2.6" height="4.2" rx=".3" fill="#ffb067"/><rect x="15.4" y="98" width="2.6" height="4.2" rx=".3" fill="#ffb067"/>
${rf(10, 104.6, 2.6, 1.6, '#3a3550')}${rf(15.4, 104.6, 2.6, 1.6, '#3a3550')}${rf(2, 128, 24, 6, '#1c1636')}
${bmp(cactus, 35, 74, 1, { p: '#ff6fae', y: '#ffd43b', a: '#8fe3a0', b: '#5ec27a', c: '#3f9a5c' })}
${rf(35, 87, 10, 2, '#ff8fc4')}${rf(35, 87, 10, .6, '#ffc2de')}${rf(36, 89, 8, 5.5, '#ff8fc4')}${rf(42, 89, 2, 5.5, '#e5679f')}${rf(36, 91, 8, 1, '#ffd43b')}
<rect x="73.5" y="70.4" width="33" height="23.8" rx="2.4" fill="#ece4d4"/><rect x="102.5" y="70.4" width="4" height="23.8" rx="2" fill="#d6cdb9"/><rect x="76.4" y="72.8" width="26" height="17.4" rx="2.2" fill="#cfc5b0"/>
<rect x="77.6" y="73.8" width="23.6" height="15.2" rx="2.6" fill="#0b1712"/>
<g class="rs-arcade-crt">${[[79.2, 76, 8, '#7dffb0'], [81.6, 78.4, 12, '#7dffb0'], [81.6, 80.8, 7, '#ffd43b'], [79.2, 83.2, 10, '#7dffb0'], [81.6, 85.6, 5, '#ff8ac6']].map(([x, y, w, c]) => rect(x, y, w, 1.2, ` class="rs-arcade-code" fill="${c}"`)).join('')}${rect(87.4, 85.6, 1.2, 1.2, ' class="rs-arcade-blink" fill="#7dffb0"')}</g>
<rect x="77.6" y="73.8" width="23.6" height="15.2" rx="2.6" fill="url(#rs-arcade-scan)"/><path d="M79 76.4q.4-1.6 2.4-1.8h6" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width=".8" stroke-linecap="round"/>
${['#ff6fae', '#ffd43b', '#5fe3c0', '#3be3ff'].map((c, i) => rect(78.6 + i * 0.9, 91, 0.8, 1.6, ` fill="${c}"`)).join('')}<circle cx="86" cy="91.8" r=".5" fill="#4ad66d"/>
<path d="M95 94.5V91.6Q95 90.4 96.2 90.4H105.8Q107 90.4 107 91.6V94.5Z" fill="#1d1832"/><ellipse cx="97.4" cy="90.4" rx="1.1" ry=".55" fill="#ffd43b"/>
${rf(100.6, 85.6, .9, 5, '#2a2540')}<circle cx="101.05" cy="85.2" r="1.9" fill="#ff4d6d"/><circle cx="100.4" cy="84.6" r=".6" fill="#ffffff" opacity=".6"/>
<g class="table-mug"><path d="M256.4 88V82.6l3.4-2.8" fill="none" stroke="#ff4d6d" stroke-width="1.1" stroke-linecap="round"/><path d="M256.4 88V82.6l3.4-2.8" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-dasharray=".8 .8"/>
  <path d="M251.2 89.2H260.8L259.6 100H252.4Z" fill="#ffffff"/><g clip-path="url(#rs-arcade-cup)"><path d="M250 92.6q2.6-1.4 5.2 0t5.2 0t5.2 0V95.6q-2.6 1.4-5.2 0t-5.2 0t-5.2 0Z" fill="#ff6fae"/>${rf(250, 96.8, 12, 1, '#3cc9b5')}${rect(258, 89, 4, 11, ' fill="#000000" opacity=".07"')}</g>
  ${bmp(star5, 254.6, 93.1, 0.55, { 1: '#ffd43b' })}<path d="M251.6 87.8q4.4-1.6 8.8 0z" fill="#e6e1f0"/><rect x="250.8" y="87.6" width="10.4" height="1.6" rx=".6" fill="#f4f1fa"/></g>
<path d="M278.4 58.4l1.6-1.4 1.6 1.4 1.6-1.4 1.6 1.4 1.6-1.4 1.6 1.4 1.6-1.4 1.6 1.4 1.6-1.4" fill="none" stroke="#2b2440" stroke-width=".7"/><path d="M279.4 51.6h11.2" stroke="#ff5ab4" stroke-width=".8"/>`;

  const glow = `<g class="rs-arcade-on">${posterNeon(75.6, 13.6, 32.8, 44.8, '#ff5ab4')}${posterNeon(323.6, 17.6, 54.8, 48.8, '#3be3ff')}
  <ellipse cx="89.4" cy="81.4" rx="22" ry="16" fill="url(#rs-arcade-halo)"/><ellipse cx="14" cy="54" rx="20" ry="9" fill="url(#rs-arcade-pink)"/></g>
<g class="rs-arcade-n" fill="none" stroke-width="1.1" stroke-linecap="round" clip-path="url(#rs-arcade-rugc)"><g filter="url(#rs-arcade-bloom)" stroke-width="2">${carpet}</g>${carpet}</g>
<g class="rs-arcade-x rs-arcade-mq"><rect x="2.4" y="51.2" width="23.2" height="6" fill="#ff5ab4" filter="url(#rs-arcade-bloom)" opacity=".7"/><rect x="2.4" y="51.2" width="23.2" height="6" fill="#ffe6f3" opacity=".55"/>${bmp(star5, 11.75, 51.95, 0.9, { 1: '#ff3d9e' })}</g>
<g class="rs-arcade-x" fill="#ff8a3d"><rect x="9.4" y="97.4" width="3.8" height="5.4" rx=".6" filter="url(#rs-arcade-bloom)"/><rect x="14.8" y="97.4" width="3.8" height="5.4" rx=".6" filter="url(#rs-arcade-bloom)"/><rect x="10" y="98" width="2.6" height="4.2" rx=".3" fill="#ffd0a0"/><rect x="15.4" y="98" width="2.6" height="4.2" rx=".3" fill="#ffd0a0"/></g>
<g class="rs-arcade-dn">${[[7, 63.6], [20.4, 66], [9.2, 70], [18.6, 72.8], [12.4, 67.6]].map(([x, y]) => rect(x, y, 0.5, 0.5, ' fill="#ffffff" opacity=".6"')).join('')}
  <g class="rs-arcade-sway">${['#ff6fae', '#ffd43b', '#5fe3c0', '#3be3ff'].map((c, i) => rect(8.1 + i * 3.2, 64.4, 2.2, 1.4, ` fill="${c}"`)).join('')}</g>
  ${rect(13.8, 71, 0.4, 1.2, ' class="rs-arcade-shot" fill="#ffffff"')}${bmp(['..1..', '.111.', '11111'], 12.25, 72.6, 0.7, { 1: '#7df9ff' })}</g>
<path class="rs-arcade-k rs-arcade-blink" d="${txt('INSERT', 14, 64.6, 0.55)}${txt('COIN', 14, 70.2, 0.55)}" fill="#ffd43b"/>
<path class="rs-arcade-z rs-arcade-blink2" d="${txt('GAME', 14, 64.6, 0.55)}${txt('OVER', 14, 70.2, 0.55)}" fill="#ff6fae"/>
<rect x="5.6" y="62" width="16.8" height="14.4" rx="1.6" fill="url(#rs-arcade-scan)"/><rect class="rs-arcade-x" x="3" y="60" width="22" height="18.8" rx="2" fill="none" stroke="#7df9ff" stroke-opacity=".25" stroke-width="1.6" filter="url(#rs-arcade-bloom)"/>`;

  (window.MT_ROOMS = window.MT_ROOMS || {}).arcade = { css, wall, view, floor, props, glow };
})();
