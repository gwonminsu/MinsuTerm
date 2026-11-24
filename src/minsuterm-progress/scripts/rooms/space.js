'use strict';
// 방 스타일: 우주 정거장 — 고요한 궤도 위 선실 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 선실 조명이 하루를 따라간다: 낮은 일하는 흰빛, 해질녘은 저녁 호박빛, 밤은 취침 주기 파란빛.
// 현창 밖 행성도 햇빛 받는 쪽 → 명암 경계(궤도 일몰) → 도시 불빛이 보이는 밤 쪽으로 바뀐다.
(() => {
  const R = '#room[data-room="space"]';
  const n = (v) => +v.toFixed(2);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // 행성: 중심 (222,90), 반지름 52. 현창 유리는 (205,39) 반지름 22라 위쪽 가장자리(지평선)만 보인다
  const PX = 222, PY = 90, PR = 52;
  const pol = (a, r) => [n(PX + r * Math.cos(a * Math.PI / 180)), n(PY + r * Math.sin(a * Math.PI / 180))];
  // 닫힌 곡선(캣멀롬 → 베지어)
  const smooth = (pts) => {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
    }
    return d + 'Z';
  };
  // 대륙: 극좌표 타원에 잔잔한 물결을 얹어 가장자리 쪽으로 납작하게(원근) 만든다
  const LANDS = [[-128, 44, 13, 4.5, 1, 'a'], [-92, 41, 10, 5.5, 2, 'b'], [-40, 45, 16, 4, 3, 'a'], [20, 42, 12, 6, 4, 'c'],
    [75, 46, 14, 4, 5, 'b'], [135, 41, 18, 5.5, 6, 'a'], [195, 45, 11, 4.5, 7, 'c']];
  let lands = '', cities = '';
  for (const [a0, r0, da, dr, ph, k] of LANDS) {
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2;
      const w = 1 + 0.16 * Math.sin(3 * t + ph) + 0.08 * Math.sin(5 * t + ph * 2);
      pts.push(pol(a0 + da * Math.cos(t) * w, r0 + dr * Math.sin(t) * w));
    }
    lands += `<path class="sp-land-${k}" d="${smooth(pts)}"/>`;
    for (let i = 0; i < 16; i++) { // 해안 쪽에 더 많은 도시 불빛
      const t = rnd() * Math.PI * 2, s = 0.35 + 0.6 * Math.sqrt(rnd());
      const [x, y] = pol(a0 + da * s * Math.cos(t), r0 + dr * s * Math.sin(t));
      const big = i % 5 === 0;
      cities += `<circle cx="${x}" cy="${y}" r="${big ? 0.75 : n(0.3 + rnd() * 0.25)}"${big ? ' class="sp-tw"' : ''}/>`;
    }
  }
  // 구름: 지평선을 따라 길게 늘어선 띠
  const clouds = [[49.5, 1.5, '16 10 7 24 22 18'], [46.6, 1.2, '9 20 26 14 6 30'], [42.5, 1.4, '20 26 8 18 14 34'], [38.5, 1.1, '6 22 18 30']]
    .map(([r, w, da]) => `<circle cx="${PX}" cy="${PY}" r="${r}" stroke-width="${w}" stroke-dasharray="${da}"/>`).join('');
  // 별
  const STARS = [[190, 22, .55], [199, 27, .4], [213, 21, .5], [186, 34, .4], [222, 28, .45], [195, 41, .35], [207, 31, .3], [181, 44, .3], [217, 34, .35], [203, 19, .4], [226, 22, .3], [188, 28, .3]];
  const stars = STARS.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}"${i % 3 === 0 ? ' class="sp-tw"' : i % 2 ? ' class="nite"' : ''}/>`).join('');
  // 현창 볼트와 덧판 리벳
  const ring = (cx, cy, rr, k, r0, cls) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2 + Math.PI / k;
    return `<circle class="${cls}" cx="${n(cx + rr * Math.cos(a))}" cy="${n(cy + rr * Math.sin(a))}" r="${r0}"/>`;
  }).join('');

  // 벽판: 열 [x0,x1], 위아래 두 줄. 모서리마다 리벳
  const COLS = [[0, 69], [70.5, 159], [160.5, 249.5], [251, 299], [300.5, 400]];
  const ROWS = [[10.5, 78.5], [80, 115.5]];
  let panels = '', rivets = '';
  for (const [x0, x1] of COLS) for (const [y0, y1] of ROWS) {
    panels += `<rect class="sp-panel" x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="1.6"/><path class="sp-panel-hi" d="M${x0 + 2} ${y0 + .6}H${x1 - 2}"/>`;
    for (const [x, y] of [[x0 + 3.2, y0 + 3.2], [x1 - 3.2, y0 + 3.2], [x0 + 3.2, y1 - 3.2], [x1 - 3.2, y1 - 3.2]]) {
      if (x > 400 || (x > 300 && y > 50)) continue; // 캡슐 뒤는 가려진다
      rivets += `<circle cx="${n(x)}" cy="${n(y)}" r=".75"/>`;
    }
  }
  // 바닥: 기본 바닥 줄눈 자리를 따라 격자 철판을 깐다
  const PLATES = [[120, 142, [0, 60, 300, 400]], [142, 172, [0, 170, 400]], [172, 202, [0, 90, 240, 400]], [202, 230, [0, 150, 340, 400]]];
  let plates = '', bolts = '';
  for (const [y0, y1, xs] of PLATES) for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    plates += `<rect class="sp-plate" x="${x0 + .6}" y="${y0 + .6}" width="${x1 - x0 - 1.2}" height="${y1 - y0 - 1.2}" rx="1"/>`
      + `<rect fill="url(#rs-space-grate)" x="${x0 + 3}" y="${y0 + 3}" width="${x1 - x0 - 6}" height="${y1 - y0 - 6}" rx=".6"/>`;
    for (const [x, y] of [[x0 + 1.8, y0 + 1.8], [x1 - 1.8, y0 + 1.8], [x0 + 1.8, y1 - 1.8], [x1 - 1.8, y1 - 1.8]]) if (x > 0 && x < 400) bolts += `<circle cx="${x}" cy="${y}" r=".55"/>`;
  }
  // 걸레받이의 야간 유도등 (밤에만 켜진다)
  const guide = '<rect class="sp-guide-line" x="0" y="117.3" width="400" height="1.3"/>';

  const css = `
${R}[viewBox] { --wall: #232a35; --wall-line: #1b2129; --floor: #1c222b; --floor-line: #1c222b;
  --wood: #a8b3c3; --wood-dark: #667284; --metal: #8f9bad; --frame: #a8b3c3; --sky: #05080f;
  --sheet: #c9d3e0; --pillow: #e7ecf3; --blanket: #3f6db0; --blanket-dark: #2d5491;
  --screen: #08111b; --laptop: #b9c3d1; --mug: #e2873a; --lamp: #e4f1ff; --shade: #e4f1ff;
  --rug: #34465c; --rug-line: #6d9bc4; --arm: #4f6c8f; --arm-dark: #405a79; --cushion: #c98a3a; }
${R}.sky-dusk[viewBox] { --lamp: #ffc27a; }
${R}.sky-night[viewBox], ${R}.night[viewBox] { --lamp: #7fa8ff; }
${R} .frame, ${R} .sky, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .shade, ${R} .floor-line,
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} rect.wood[y="44"], ${R} .pot, ${R} .leaf, ${R} .mug, ${R} .mug-handle, ${R} .steam { display: none; }
${R} .sp-slosh { transform-origin: 256.5px 94px; animation: rs-space-slosh 3.2s ease-in-out infinite alternate; }
${R} .sp-panel { fill: #36404e; } ${R} .sp-panel-hi { stroke: #44505f; stroke-width: .8; }
${R} .sp-rivets { fill: #55617a; } ${R} .sp-beam { fill: #1b2129; }
${R} .sp-plate { fill: #2b333f; } ${R} .sp-bolts { fill: #4a5568; }
${R} .sp-dusk { display: none; }
${R}.sky-dusk .sp-dusk { display: inline; } ${R}.sky-dusk .sp-noon { display: none; }
/* 천장 띠 조명: 낮 흰빛 → 해질녘 호박빛 → 밤엔 꺼지고 파란 취침등 */
${R} .sp-strip { fill: #f1f7ff; } ${R} .sp-wash path { fill: url(#rs-space-wash); }
${R}.sky-dusk .sp-strip { fill: #ffd29a; } ${R}.sky-dusk .sp-wash path { fill: url(#rs-space-wash-dusk); }
${R}.sky-night .sp-strip, ${R}.night .sp-strip { fill: #3b4554; }
${R}.sky-night .sp-wash, ${R}.night .sp-wash { display: none; }
${R} .sp-tube { fill: #f3f9ff; } ${R}.sky-dusk .sp-tube { fill: #ffe1b8; }
${R}.sky-night .sp-tube, ${R}.night .sp-tube { fill: #a9c6ff; }
/* 현창 */
${R} .sp-flange { fill: #39424f; stroke: #20262f; stroke-width: .7; }
${R} .sp-flange-rivet { fill: #5d6a80; }
${R} .sp-bolt { fill: #dbe2ea; stroke: #4a5464; stroke-width: .35; }
${R} .sp-stars { fill: #fff; }
${R}.sky-night .sp-stars .nite, ${R}.night .sp-stars .nite { display: inline; }
${R} .sp-land-a { fill: #6d9358; } ${R} .sp-land-b { fill: #a99566; } ${R} .sp-land-c { fill: #5f8a62; }
${R} .sp-clouds { fill: none; stroke: #fff; stroke-linecap: round; opacity: .62; }
${R} .sp-ocean { fill: url(#rs-space-ocean); }
${R}.sky-night .sp-ocean, ${R}.night .sp-ocean { fill: url(#rs-space-dark); }
${R}.sky-night .sp-lands, ${R}.night .sp-lands { opacity: .07; }
${R}.sky-night .sp-clouds, ${R}.night .sp-clouds { stroke: #9fb3d9; opacity: .14; }
${R} .sp-city { display: none; fill: #ffd27e; }
${R}.sky-dusk .sp-city { display: inline; clip-path: url(#rs-space-shadowclip); }
${R}.sky-night .sp-city, ${R}.night .sp-city { display: inline; }
${R} .sp-turn { transform-origin: ${PX}px ${PY}px; animation: rs-space-turn 260s linear infinite; }
${R} .sp-tw { animation: rs-space-tw 3.4s ease-in-out infinite; }
${R} .sp-tw:nth-child(3n) { animation-delay: -1.2s; } ${R} .sp-tw:nth-child(3n+1) { animation-delay: -2.3s; }
${R} .sp-led { animation: rs-space-blink 2.4s steps(1) infinite; }
${R} .sp-led.l2 { animation-duration: 3.7s; animation-delay: -1s; }
${R} .sp-sat { offset-path: path('M80.6 35.6C82 38.6 95.4 36.4 101.6 31.2C106.6 27 99.6 25.4 94 26.4C86.4 27.8 79.4 33 80.6 35.6Z'); animation: rs-space-orbit 9s linear infinite; }
${R} .sp-dim { display: none; fill: #0a1640; }
${R}.sky-night .sp-dim { display: inline; opacity: .2; }
${R}.sky-night #lampGlow { opacity: .75; } ${R}.night .sp-dim { display: inline; opacity: .08; }
${R} .sp-guide-line { fill: #2d3542; } ${R}.sky-night .sp-guide-line, ${R}.night .sp-guide-line { fill: #93b6ff; }
${R} .sp-cap-light { fill: #f4f8ff; } ${R}.sky-dusk .sp-cap-light { fill: #ffd8a6; }
${R}.sky-night .sp-cap-light, ${R}.night .sp-cap-light { fill: #46556a; }
@keyframes rs-space-slosh { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@keyframes rs-space-turn { to { transform: rotate(360deg); } }
@keyframes rs-space-tw { 50% { opacity: .25; } }
@keyframes rs-space-blink { 50% { opacity: .2; } }
@keyframes rs-space-orbit { to { offset-distance: 100%; } }
`;

  const wall = `
<defs>
${[['', '#e9f4ff', .16], ['-dusk', '#ffb45e', .2]].map(([k, c, o]) => `<radialGradient id="rs-space-wash${k}" cx=".5" cy="0" r=".5" gradientTransform="translate(.5 0) scale(1 2) translate(-.5 0)"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('')}
  <radialGradient id="rs-space-sunwash" cx="205" cy="39" r="60" gradientUnits="userSpaceOnUse"><stop offset=".45" stop-color="#ff9d55" stop-opacity=".22"/><stop offset="1" stop-color="#ff9d55" stop-opacity="0"/></radialGradient>
  <linearGradient id="rs-space-capin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151a22"/><stop offset="1" stop-color="#232a35"/></linearGradient>
  <clipPath id="rs-space-patch"><circle cx="57" cy="36" r="7.3"/></clipPath>
  <linearGradient id="rs-space-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7c1cf"/><stop offset="1" stop-color="#8592a5"/></linearGradient>
</defs>
<rect class="sp-beam" x="0" y="0" width="400" height="9"/>
<path d="M0 9H400" stroke="#2b333f" stroke-width=".8"/>
${panels}
<g class="sp-rivets">${rivets}</g>
<g class="sp-wash"><path d="M4 10.2A80 34 0 0 0 164 10.2Z"/><path d="M246 10.2A76 34 0 0 0 398 10.2Z"/></g>
<rect class="sp-dusk" x="140" y="0" width="130" height="110" fill="url(#rs-space-sunwash)"/>
<rect x="10" y="7" width="148" height="3.2" rx="1.2" fill="#2a313c"/><rect class="sp-strip" x="12" y="8.6" width="144" height="1.6" rx=".8"/>
<rect x="252" y="7" width="140" height="3.2" rx="1.2" fill="#2a313c"/><rect class="sp-strip" x="254" y="8.6" width="136" height="1.6" rx=".8"/>
<!-- 계기판(액자 자리): 궤도 그림과 원격측정 -->
<rect x="75" y="19" width="42" height="33" rx="2.2" fill="#1a2029" stroke="#4b5667" stroke-width=".6"/>
<rect x="77.5" y="21.5" width="37" height="20.5" rx="1" fill="#07121b"/>
<path d="M77.5 26.6H114.5M77.5 31.7H114.5M77.5 36.8H114.5M86.7 21.5V42M95.9 21.5V42M105.1 21.5V42" stroke="#0f2230" stroke-width=".4"/>
<circle cx="91" cy="31" r="3.8" fill="#2d6bb3"/><path d="M88.4 29.4c1-.9 2.4-1.1 3.2-.3-.6.9-1.8 1.4-3.2.3zM91.6 32.4c.9-.4 2-.2 2.4.6-.8.5-1.8.4-2.4-.6z" fill="#69a160"/>
<path d="M80.6 35.6C82 38.6 95.4 36.4 101.6 31.2C106.6 27 99.6 25.4 94 26.4C86.4 27.8 79.4 33 80.6 35.6Z" fill="none" stroke="#4fc6ff" stroke-width=".45" stroke-dasharray="1.2 .9" opacity=".8"/>
<circle class="sp-sat" r=".9" fill="#e9fbff"/>
<path d="M106 25.4h6M106 28h4.2M106 30.6h5.2" stroke="#6fe3b0" stroke-width=".9" stroke-linecap="round"/>
<path d="M105.6 38.4l1.3-2.2 1.3 2.2 1.3-2.2 1.3 2.2 1.3-2.2 1.3 2.2" fill="none" stroke="#f0b86e" stroke-width=".5"/>
<rect x="101.5" y="45" width="3" height="4" rx=".6" fill="#3a4351"/><rect x="102.2" y="45.4" width="1.6" height="1.8" rx=".4" fill="#c4ccd8"/>
<rect x="107" y="45" width="3" height="4" rx=".6" fill="#3a4351"/><rect x="107.7" y="47" width="1.6" height="1.8" rx=".4" fill="#c4ccd8"/>
<!-- 시료 보관대와 임무 패치 (책 선반 자리) -->
<rect x="13.5" y="25" width="33" height="22.5" rx="1.6" fill="#232b36" stroke="#4b5667" stroke-width=".5"/>
${[[16.4, 31, '#7fe0a8', '#e2873a'], [23.6, 34, '#f0b86e', '#d7dee8'], [30.8, 30, '#b9a6ff', '#e2873a'], [38, 33, '#6fd3ff', '#d7dee8']].map(([x, lv, c, cap]) =>
  `<rect x="${x}" y="28.6" width="5.6" height="15.4" rx="1.4" fill="#9fb3c8" fill-opacity=".28" stroke="#9fb3c8" stroke-opacity=".5" stroke-width=".35"/>`
  + `<rect x="${n(x + .7)}" y="${lv}" width="4.2" height="${n(43.3 - lv)}" rx=".9" fill="${c}" opacity=".85"/>`
  + `<rect x="${n(x - .2)}" y="27" width="6" height="2.6" rx=".7" fill="${cap}"/>`
  + `<rect x="${n(x + .8)}" y="37.2" width="4" height="3" rx=".3" fill="#eef2f6"/><path d="M${n(x + 1.4)} 38.4h2.8M${n(x + 1.4)} 39.4h1.8" stroke="#5a6577" stroke-width=".35"/>`).join('')}
<rect x="14.6" y="32.4" width="30.8" height="1.5" rx=".5" fill="#8f9bad"/><rect x="14.6" y="44.2" width="30.8" height="2.2" rx=".6" fill="#55627a"/>
<circle cx="57" cy="36" r="8.4" fill="#c9a24a"/><circle cx="57" cy="36" r="7.3" fill="#18264a"/>
<g clip-path="url(#rs-space-patch)"><circle cx="57" cy="47.6" r="7.4" fill="#2f6fc0"/><path d="M51.8 41.8q2.2-1.3 4.6-.6-1.2 1.6-4.6.6z" fill="#69a160"/></g>
<ellipse cx="57" cy="36" rx="6.2" ry="2.1" transform="rotate(-22 57 36)" fill="none" stroke="#e9f3ff" stroke-width=".5"/>
<circle cx="62.6" cy="33.8" r=".85" fill="#ffd27a"/><path d="M53.6 30.2v2.4M52.4 31.4h2.4" stroke="#fff" stroke-width=".45"/><circle cx="59.4" cy="30.8" r=".35" fill="#fff"/>
<circle cx="57" cy="36" r="7.3" fill="none" stroke="#e9d29a" stroke-width=".3"/>
<!-- 손잡이 -->
<rect x="82" y="61.2" width="60" height="2.4" rx="1.2" fill="#8c99ad"/><rect x="82" y="62.6" width="60" height="1" rx=".5" fill="#6c788b"/>
<rect x="86" y="60" width="3.4" height="4.8" rx=".7" fill="#59657a"/><rect x="134.6" y="60" width="3.4" height="4.8" rx=".7" fill="#59657a"/>
<!-- 환기구 -->
<rect x="259" y="16" width="33" height="16" rx="1.6" fill="#262d38" stroke="#465163" stroke-width=".5"/>
<path d="M262 19.2H289M262 22.4H289M262 25.6H289M262 28.8H289" stroke="#12161c" stroke-width="1.3" stroke-linecap="round"/>
<path d="M262 20.2H289M262 23.4H289M262 26.6H289M262 29.8H289" stroke="#3a4453" stroke-width=".4"/>
<!-- 선실 표시 -->
<text x="334" y="31" font-family="system-ui, sans-serif" font-size="5.2" font-weight="700" fill="#56637a" letter-spacing=".5">C-02</text>
<path d="M334 33.6H355" stroke="#56637a" stroke-width=".5"/><path d="M334 35.6l2-2M337 35.6l2-2M340 35.6l2-2M343 35.6l2-2M346 35.6l2-2M349 35.6l2-2M352 35.6l2-2" stroke="#b98a3a" stroke-width=".7" opacity=".7"/>
<!-- 캡슐 침대 -->
<path d="M301.5 118V67Q301.5 51.5 317 51.5H400V118Z" fill="url(#rs-space-shell)"/>
<path d="M301.5 67Q301.5 51.5 317 51.5H400" fill="none" stroke="#d3dae4" stroke-width=".8"/>
<path d="M306 118V68.5Q306 56.5 318 56.5H400V118Z" fill="url(#rs-space-capin)"/>
<rect x="306" y="56.5" width="94" height="4.6" fill="#7c889a"/><rect x="306" y="60.6" width="94" height=".8" fill="#5a6577"/>
<rect x="328" y="61.2" width="3" height="4" rx=".8" fill="#a2adbd"/>
<rect class="sp-cap-light" x="356" y="62.2" width="18" height="1.6" rx=".8"/>
<rect x="314" y="68" width="24" height="17" rx="1.6" fill="none" stroke="#3a4453" stroke-width=".7"/>
<path d="M318 68V85M322 68V85M326 68V85M330 68V85M334 68V85M314 72.2H338M314 76.4H338M314 80.6H338" stroke="#2d3541" stroke-width=".45"/>
<rect x="379" y="70" width="6" height="4" rx=".8" fill="#2c3440"/><circle cx="380.8" cy="72" r=".6" fill="#53c98b"/>
<rect class="sp-guide" x="0" y="116.4" width="400" height="3.2" fill="#1b2129"/>
${guide}
`;

  const view = `
<defs>
  <clipPath id="rs-space-glass"><circle cx="205" cy="39" r="22"/></clipPath>
  <clipPath id="rs-space-planet"><circle cx="${PX}" cy="${PY}" r="${PR}"/></clipPath>
  <clipPath id="rs-space-shadowclip"><circle cx="252" cy="68" r="42"/></clipPath>
  <radialGradient id="rs-space-void" cx="190" cy="25" r="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0d1530"/><stop offset="1" stop-color="#03050b"/></radialGradient>
  <radialGradient id="rs-space-ocean" cx="${PX}" cy="${PY}" r="${PR}" gradientUnits="userSpaceOnUse"><stop offset=".6" stop-color="#173f86"/><stop offset=".9" stop-color="#2d6cbd"/><stop offset="1" stop-color="#7bb8ec"/></radialGradient>
  <radialGradient id="rs-space-dark" cx="${PX}" cy="${PY}" r="${PR}" gradientUnits="userSpaceOnUse"><stop offset=".7" stop-color="#060c1c"/><stop offset="1" stop-color="#14254a"/></radialGradient>
  <radialGradient id="rs-space-shade" cx="252" cy="68" r="47" gradientUnits="userSpaceOnUse"><stop offset=".86" stop-color="#050b1c" stop-opacity=".93"/><stop offset="1" stop-color="#050b1c" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-space-halo"><stop offset="0" stop-color="#fffaf0" stop-opacity=".9"/><stop offset=".25" stop-color="#cfe6ff" stop-opacity=".35"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-space-halo2"><stop offset="0" stop-color="#fff4d8"/><stop offset=".3" stop-color="#ffb062" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a3c" stop-opacity="0"/></radialGradient>
  <linearGradient id="rs-space-sunset" x1="188" x2="228" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff1c4"/><stop offset=".16" stop-color="#ffb35a"/><stop offset=".42" stop-color="#ff6c45"/><stop offset=".66" stop-color="#a8457e"/><stop offset=".86" stop-color="#36336f"/><stop offset="1" stop-color="#1b2347"/></linearGradient>
  <linearGradient id="rs-space-sunset2" x1="188" x2="228" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8fc4ff"/><stop offset=".5" stop-color="#4c6fc4"/><stop offset="1" stop-color="#1f2b55"/></linearGradient>
  <radialGradient id="rs-space-vignette" cx="205" cy="39" r="22" gradientUnits="userSpaceOnUse"><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
  <linearGradient id="rs-space-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3ccd8"/><stop offset=".55" stop-color="#8592a5"/><stop offset="1" stop-color="#576375"/></linearGradient>
  <linearGradient id="rs-space-lip" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9aa6b7"/><stop offset="1" stop-color="#3c4553"/></linearGradient>
</defs>
<circle class="sp-flange" cx="205" cy="39" r="31"/>
${ring(205, 39, 29.4, 16, 0.55, 'sp-flange-rivet')}
<g clip-path="url(#rs-space-glass)">
  <rect x="180" y="14" width="50" height="50" fill="url(#rs-space-void)"/>
  <g class="sp-stars">${stars}</g>
  <g class="day sp-noon"><circle cx="195" cy="27" r="11" fill="url(#rs-space-halo)"/><path d="M195 20V34M188 27H202" stroke="#fff" stroke-width=".45" opacity=".8"/><path d="M191.3 23.3l7.4 7.4M198.7 23.3l-7.4 7.4" stroke="#fff" stroke-width=".3" opacity=".5"/><circle cx="195" cy="27" r="2.6" fill="#fffef9"/></g>
  <g class="nite"><circle cx="196" cy="27" r="3" fill="#dfe3ea"/><path d="M196 24a3 3 0 0 1 0 6 2.1 3 0 0 0 0-6z" fill="#6f7686"/><circle cx="195" cy="26.4" r=".55" fill="#c3c9d3"/><circle cx="196.8" cy="28.4" r=".4" fill="#c3c9d3"/></g>
  <circle class="sp-ocean" cx="${PX}" cy="${PY}" r="${PR}"/>
  <g clip-path="url(#rs-space-planet)">
    <g class="sp-turn"><g class="sp-lands">${lands}</g><g class="sp-clouds">${clouds}</g></g>
    <g class="sp-dusk"><circle cx="${PX}" cy="${PY}" r="${PR}" fill="#ff9a52" opacity=".14"/><circle cx="252" cy="68" r="47" fill="url(#rs-space-shade)"/></g>
    <g class="sp-city"><g class="sp-turn">${cities}</g></g>
  </g>
  <g fill="none">
    <g class="day sp-noon"><circle cx="${PX}" cy="${PY}" r="52.7" stroke="#bfe5ff" stroke-width="1.3"/><circle cx="${PX}" cy="${PY}" r="54.5" stroke="#5aa2ff" stroke-width="2.4" opacity=".4"/><circle cx="${PX}" cy="${PY}" r="57" stroke="#3d7be0" stroke-width="3" opacity=".14"/></g>
    <g class="sp-dusk"><circle cx="${PX}" cy="${PY}" r="52.8" stroke="url(#rs-space-sunset)" stroke-width="1.6"/><circle cx="${PX}" cy="${PY}" r="54.8" stroke="url(#rs-space-sunset2)" stroke-width="2.2" opacity=".5"/>
      <circle cx="192.6" cy="46.5" r="10" fill="url(#rs-space-halo2)"/><circle cx="192.6" cy="46.5" r="1.9" fill="#fff6e2"/></g>
    <g class="nite"><circle cx="${PX}" cy="${PY}" r="52.6" stroke="#2c4a86" stroke-width="1"/><circle cx="${PX}" cy="${PY}" r="54.2" stroke="#7dffb4" stroke-width=".7" opacity=".45"/></g>
  </g>
  <circle cx="205" cy="39" r="22" fill="url(#rs-space-vignette)"/>
  <path d="M190 24a20 20 0 0 1 12-6.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".1"/>
</g>
<circle cx="205" cy="39" r="27.6" fill="none" stroke="url(#rs-space-rim)" stroke-width="5.6"/>
<circle cx="205" cy="39" r="23.1" fill="none" stroke="url(#rs-space-lip)" stroke-width="2.2"/>
<circle cx="205" cy="39" r="30.3" fill="none" stroke="#2a313c" stroke-width=".5"/>
<circle cx="205" cy="39" r="24.7" fill="none" stroke="#4d5868" stroke-width=".5"/>
${ring(205, 39, 27.4, 8, 1.05, 'sp-bolt')}
`;

  const floor = `
<defs>
  <pattern id="rs-space-grate" width="6" height="3.6" patternUnits="userSpaceOnUse" y="1">
    <rect width="6" height="3.6" fill="#323a46"/><rect x=".8" y=".9" width="4.4" height="1.1" rx=".55" fill="#232a33"/><rect x="1" y="2.15" width="4" height=".35" rx=".17" fill="#3d4654"/>
  </pattern>
</defs>
${plates}
<g class="sp-bolts">${bolts}</g>
`;

  const props = `
<!-- 수경 재배기 (책상 화분 자리): 상추 세 포기, 물통, 생장등 -->
<rect x="47.2" y="74.6" width="1.5" height="14" fill="#7c889a"/>
<rect x="32.4" y="72.8" width="17" height="2.8" rx="1" fill="#a9b4c4"/><path d="M33.2 73.4H48.6" stroke="#d6dde7" stroke-width=".4"/>
${[35.4, 40.4, 45].map((x, i) => `<path fill="#4f9f52" d="M${x} 88.6c-1.6-2-1.6-5.8 0-8 1.6 2.2 1.6 6 0 8z"/><path fill="#6cc36a" d="M${x} 88.6c-3-.8-4.2-3.8-2.8-${i === 1 ? 6.6 : 5.8} 1.6.9 2.8 3.4 2.8 ${i === 1 ? 6.6 : 5.8}zM${x} 88.6c3-.8 4.2-3.8 2.8-${i === 1 ? 6.2 : 5.4}-1.6.9-2.8 3.4-2.8 ${i === 1 ? 6.2 : 5.4}z"/>`).join('')}
<rect x="32.4" y="88.4" width="17" height="6.1" rx="1.2" fill="#c9d2de"/><path d="M33.4 88.9H48.4" stroke="#eef2f6" stroke-width=".4"/>
<rect x="34" y="90.4" width="8" height="2.4" rx=".6" fill="#2a3a4c"/><rect x="34" y="91.5" width="8" height="1.3" rx=".4" fill="#4fb4ff"/>
<circle cx="46" cy="91.6" r=".7" fill="#4fd88a"/>
<!-- 탁자 위 음료 구: 둥근 유리에 커피, 빨대 -->
<g class="table-mug">
  <defs><clipPath id="rs-space-bulb"><circle cx="256.5" cy="93.2" r="4.6"/></clipPath></defs>
  <path d="M252.6 100l1.1-2.4h5.6l1.1 2.4z" fill="#8f9bad"/>
  <circle cx="256.5" cy="93.2" r="4.9" fill="#cfe3f5" fill-opacity=".22"/>
  <g clip-path="url(#rs-space-bulb)"><g class="sp-slosh"><rect x="249" y="93.8" width="15" height="6" fill="#7a4a2b"/><rect x="249" y="93.8" width="15" height=".7" fill="#b07a4e"/></g></g>
  <circle cx="256.5" cy="93.2" r="4.9" fill="none" stroke="#dbe8f5" stroke-width=".5"/>
  <rect x="257.5" y="87.6" width="2.2" height="1.6" rx=".4" fill="#8f9bad"/>
  <path d="M258.6 87.8V84.4q0-1.6 1.6-1.6h2.2" stroke="#e2873a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <path d="M253.3 91.2a3.8 3.8 0 0 1 2.2-2" stroke="#fff" stroke-width=".6" fill="none" opacity=".7" stroke-linecap="round"/>
</g>
<rect x="283.4" y="55" width="3.6" height="6" rx="1" fill="#7c889a"/>
<path d="M271 51.6Q271 50 272.6 50H297.8Q299.4 50 299.4 51.6V55.4H271Z" fill="#a9b4c4"/><path d="M272 50.6H298.4" stroke="#d6dde7" stroke-width=".5"/>
<rect class="sp-tube" x="272.2" y="55" width="26" height="1.6" rx=".8"/>
<path class="sp-dim" fill-rule="evenodd" d="M0 0H400V230H0ZM205 17a22 22 0 1 0 .01 0Z"/>
<path class="sp-dusk" fill="#ff9640" opacity=".06" fill-rule="evenodd" d="M0 0H400V230H0ZM205 17a22 22 0 1 0 .01 0Z"/>
`;

  const glow = `
<defs>
  <linearGradient id="rs-space-nlf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f8dff" stop-opacity="0"/><stop offset=".2" stop-color="#5f8dff" stop-opacity=".22"/><stop offset="1" stop-color="#5f8dff" stop-opacity="0"/></linearGradient>
  <radialGradient id="rs-space-nl"><stop offset="0" stop-color="#5f8dff" stop-opacity=".5"/><stop offset="1" stop-color="#5f8dff" stop-opacity="0"/></radialGradient>
</defs>
<linearGradient id="rs-space-grow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5fd2" stop-opacity=".3"/><stop offset="1" stop-color="#ff5fd2" stop-opacity=".04"/></linearGradient>
<path d="M33.6 75.8H48.2L49.6 88.4H32.2Z" fill="url(#rs-space-grow)"/>
<rect x="33.4" y="75.2" width="15" height="1.1" rx=".55" fill="#ff7ad9"/>
<circle class="sp-led" cx="80.5" cy="47" r=".95" fill="#5cf09a"/>
<circle cx="84.5" cy="47" r=".95" fill="#5cf09a"/>
<circle class="sp-led l2" cx="88.5" cy="47" r=".95" fill="#ffbf4a"/>
<circle cx="92.5" cy="47" r=".95" fill="#5fd2ff"/>
<g class="nite">
  <rect x="0" y="116" width="300" height="9" fill="url(#rs-space-nlf)"/>
  <rect x="356" y="62.2" width="18" height="1.6" rx=".8" fill="#6f9bff"/>
  <rect x="272.2" y="55" width="26" height="1.6" rx=".8" fill="#a9c6ff"/>
  <ellipse cx="365" cy="70" rx="26" ry="10" fill="url(#rs-space-nl)"/>
  <g fill="#6f9bff"><circle cx="40" cy="8.4" r=".7"/><circle cx="84" cy="8.4" r=".7"/><circle cx="128" cy="8.4" r=".7"/><circle cx="278" cy="8.4" r=".7"/><circle cx="322" cy="8.4" r=".7"/><circle cx="366" cy="8.4" r=".7"/></g>
</g>
`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['space'] = { css, wall, view, floor, props, glow };
})();
