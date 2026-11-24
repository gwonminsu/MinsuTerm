'use strict';
// 방 스타일: 네온 도시 원룸 — 비 오는 밤 도시의 작은 방 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮: 흐린 도시, 네온은 꺼진 우윳빛 관. 해질녘: 도시가 깨어나 창에 불이 들고 방의 네온이 켜진다.
// 밤: 비가 오고 간판이 깜빡이며 윤기 나는 바닥에 네온이 가장 짙게 비친다. 잘 때: 방엔 구름 간판 하나만 희미하게 남는다.
(() => {
  const R = '#room[data-room="neon"]';
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = (v) => +v.toFixed(2);
  // 잎 하나: 밑동(x, y)에서 a도 기울어 z 길이로 자란다
  const leaf = ([x, y, a, z, c]) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${z})"><path d="M0 0C.62-.15.55-.78 0-1C-.55-.78-.62-.15 0 0Z" fill="${c}"/><path d="M0-.12V-.8" stroke="#2e7d5c" stroke-width="${n(0.3 / z)}"/></g>`;
  const rect = (x, y, w, h, a = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${a}/>`;
  // 불 켜진 창: 해질녘부터(l1), 밤부터(l2), 깨어 있는 밤에만(l3, 잘 때쯤엔 꺼진다)
  const lit = (x, y, w, h, warm) => {
    const r = rnd();
    const cls = r < 0.3 ? 'rs-neon-l1' : r < 0.72 ? 'rs-neon-l2' : 'rs-neon-l3';
    return rect(x, y, w, h, ` class="${cls}" fill="${warm ? (rnd() < 0.8 ? '#ffd27a' : '#ffb46b') : (rnd() < 0.7 ? '#cfe8ff' : '#ffe3a3')}"`);
  };

  // ── 창밖 도시: 먼 빌딩, 중간 빌딩, 길 건너 빌라와 오피스 타워 ──
  const far = [[171, 34, 7], [178, 28, 7], [185, 37, 6], [191, 31, 8], [199, 36, 6], [205, 30, 9], [214, 35, 6], [220, 27, 6], [226, 33, 13]];
  const mid = [[171, 41, 9], [184, 44, 9], [193, 39, 7], [200, 46, 10], [210, 42, 8], [218, 45, 7]];
  let farSvg = `<g class="rs-neon-far">${far.map(([x, y, w]) => rect(x, y, w, 63 - y)).join('')}${rect(192.6, 29, 4.8, 2.5)}${rect(181.2, 22.6, 0.6, 5.6)}${rect(195.2, 22.4, 0.8, 41)}${rect(186, 23.6, 15, 0.7)}${rect(199, 24.3, 1.9, 1.5)}${rect(188.9, 24.3, 0.3, 8)}${rect(188.5, 32.2, 1.1, 1)}<path d="M195.6 21.2L186.3 23.6V23.9L195.6 21.7ZM195.6 21.2L200.8 23.6V23.9L195.6 21.7Z"/></g><circle class="nite" cx="195.6" cy="21.1" r=".55" fill="#ff5a4a" opacity=".85"/>`;
  let farLit = '';
  for (const [x, y, w] of far) for (let wy = y + 1.8; wy < 61; wy += 2.3) for (let wx = x + 1.1; wx < x + w - 1; wx += 1.9) if (rnd() < 0.3) farLit += lit(wx, wy, 0.8, 0.9, rnd() < 0.6);
  let midSvg = `<g class="rs-neon-mid">${mid.map(([x, y, w]) => rect(x, y, w, 63 - y)).join('')}</g>`;
  let midWin = '';
  let midLit = '';
  for (const [x, y, w] of mid) for (let wy = y + 1.6; wy < 61.5; wy += 2.6) for (let wx = x + 1.1; wx < x + w - 1.2; wx += 2.1) {
    midWin += rect(wx, wy, 1, 1.3);
    if (rnd() < 0.42) midLit += lit(wx, wy, 1, 1.3, rnd() < 0.65);
  }
  // 길 건너 4층 빌라 (옥상 물탱크와 난간), 2개 층이 보인다
  let near = rect(171, 50, 24, 13) + rect(175.2, 46.2, 6, 2.9, ' rx=".7"') + rect(176.6, 45.5, 3.2, 1, ' rx=".4"') + rect(175.6, 49, 5.2, 0.4) + rect(176, 49, 0.5, 1.1) + rect(179.9, 49, 0.5, 1.1)
    + rect(183, 48, 12, 0.5) + [183, 186.8, 190.6, 194.5].map((x) => rect(x, 48, 0.5, 2)).join('');
  let nearWin = '';
  let nearLit = '';
  for (const wy of [52, 57.6]) for (const wx of [172.6, 178.2, 183.8, 189.4]) {
    nearWin += rect(wx, wy, 3.4, 2.6);
    if (rnd() < 0.62) nearLit += lit(wx, wy, 3.4, 2.6, true);
  }
  // 오른쪽 오피스 타워: 띠 창, 밤엔 층마다 일부만 켜진다
  near += rect(224, 22, 15, 41) + rect(226.4, 19.6, 10, 2.6);
  for (let wy = 24.2; wy < 62; wy += 3) {
    nearWin += rect(225.2, wy, 13.8, 1.4);
    for (let wx = 225.2; wx < 238.4;) {
      const len = 1.8 + rnd() * 3.6;
      if (rnd() < 0.42) nearLit += lit(wx, wy, Math.min(len, 239 - wx), 1.4, false);
      wx += len + 0.4;
    }
  }
  // 빗줄기: 48 높이 타일 둘을 이어 붙여 아래로 흘린다 (바람에 조금 기운다)
  let rain = '';
  for (let i = 0; i < 30; i++) {
    const x = 171 + rnd() * 76;
    const y = 15 + rnd() * 48;
    rain += `M${n(x)} ${n(y)}l-.6 5`;
  }
  const cloud = 'M341 48H335.5C330.8 48 329.6 41.4 334.4 40C334.6 34.6 340.4 31.6 345 34C347.4 28.4 357 27.8 359.2 34.6C364.4 33.8 368.4 38.4 366.4 42.6C369.4 43.6 369 48 365 48H346';
  const drops = 'M339 53l-1.4 4.5M349 53l-1.4 4.5M359 53l-1.4 4.5M344 60l-1.4 4.5M354 60l-1.4 4.5';
  const tube = ' fill="none" stroke-linecap="round" stroke-linejoin="round"';

  const css = `
${R} { --wall: #463f62; --wall-line: #352e4f; --floor: #2c2540; --floor-line: #383050; --wood: #42375f; --wood-dark: #2c2446;
  --metal: #6d6890; --frame: #2a2342; --sky: #9aa0b4; --sheet: #c4bedf; --pillow: #dcd7ee; --blanket: #5a43a0; --blanket-dark: #46328a;
  --screen: #0b0f20; --laptop: #7d8299; --mug: #ff6fb5; --lamp: #ff5fd2; --shade: #ff5fd2; }
${R}:not(#rs) { --rug: #342a4f; --rug-line: #4f4176; --arm: #52306e; --arm-dark: #41255a; --cushion: #ff8fc8; }
${R}.sky-dusk { --wall: #2e2549; --wall-line: #241d3d; --floor: #1c1629; --floor-line: #282039; }
${R}.sky-night, ${R}.night { --wall: #221b3d; --wall-line: #1b1531; --floor: #140f22; --floor-line: #1f1833; }
${R} .wall, ${R} .base, ${R} .floor { transition: fill .8s; }
${R} .shade, ${R} #lampGlow, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2 { display: none; }
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} .pot, ${R} .leaf, ${R} rect.wood[x="14"],
${R} .table-mug > .steam, ${R} .table-mug > .mug, ${R} .table-mug > .mug-handle { display: none; }
${R} .sglow-a, ${R} .sglow-b { stop-color: #34e1ff; }
${R} .rs-neon-on, ${R} .rs-neon-k, ${R} .rs-neon-l1, ${R} .rs-neon-l2, ${R} .rs-neon-l3 { display: none; }
${R}.sky-dusk .rs-neon-on, ${R}.sky-night .rs-neon-on, ${R}.sky-dusk .rs-neon-k,
${R}.sky-dusk .rs-neon-l1, ${R}.sky-night .rs-neon-l1, ${R}.night .rs-neon-l1,
${R}.sky-night .rs-neon-l2, ${R}.night .rs-neon-l2, ${R}.sky-night .rs-neon-l3, ${R}.night .rs-neon-sign { display: inline; }
${R}.sky-dusk .rs-neon-d, ${R}.sky-night .rs-neon-d, ${R}.night .rs-neon-d { display: none; }
${R}.sky-dusk .rs-neon-on { opacity: .7; }
${R}.night .rs-neon-sign { opacity: .62; }
${R}.night .rs-neon-room { display: none; }
${R} .rs-neon-far { fill: #9196ab; } ${R} .rs-neon-mid { fill: #7c8198; } ${R} .rs-neon-near { fill: #5f647a; }
${R}.sky-dusk .rs-neon-far { fill: #7a4670; } ${R}.sky-dusk .rs-neon-mid { fill: #4c2a59; } ${R}.sky-dusk .rs-neon-near { fill: #2c1a3d; }
${R}.sky-night .rs-neon-far, ${R}.night .rs-neon-far { fill: #2b1f46; }
${R}.sky-night .rs-neon-mid, ${R}.night .rs-neon-mid { fill: #1d1534; }
${R}.sky-night .rs-neon-near, ${R}.night .rs-neon-near { fill: #100b1f; }
${R} .rs-neon-g { fill: #d3d8e4; opacity: .3; }
${R}.sky-dusk .rs-neon-g { fill: #f4a487; opacity: .28; }
${R}.sky-night .rs-neon-g, ${R}.night .rs-neon-g { fill: #06050d; opacity: .45; }
${R} .rs-neon-sheen { opacity: .08; } ${R}.sky-night .rs-neon-sheen, ${R}.night .rs-neon-sheen { opacity: .035; }
${R} .rs-neon-tubeoff { fill: #d8d2e8; } ${R}.night .rs-neon-tubeoff { fill: #8a84a6; }
${R} .rs-neon-al { fill: #3a3256; } ${R} .rs-neon-al2 { fill: #4a4170; }
${R} .rs-neon-rain { animation: rs-neon-rain .7s linear infinite; }
${R} .rs-neon-flk { animation: rs-neon-flicker 5.2s linear infinite; }
${R} .rs-neon-flk2 { animation: rs-neon-flicker 7.4s linear 2.1s infinite; }
${R} .rs-neon-blink { animation: rs-neon-blink 2.4s ease-in-out infinite; }
${R} .rs-neon-drip { animation: rs-neon-drip 6s ease-in infinite; }
${R} .rs-neon-drip2 { animation: rs-neon-drip 7.5s ease-in 3s infinite; }
@keyframes rs-neon-rain { to { transform: translate(-6px, 48px); } }
@keyframes rs-neon-flicker { 0%, 84%, 85.5%, 88%, 89.5%, 100% { opacity: 1; } 84.6%, 85.2% { opacity: .2; } 88.6% { opacity: .45; } }
@keyframes rs-neon-blink { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
@keyframes rs-neon-drip { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: .75; } 85% { opacity: .6; } 100% { transform: translateY(20px); opacity: 0; } }
`;

  const wall = `<defs>
  <linearGradient id="rs-neon-sday" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f96ac"/><stop offset=".55" stop-color="#b0b5c6"/><stop offset="1" stop-color="#d2d4dd"/></linearGradient>
  <linearGradient id="rs-neon-sdusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2350"/><stop offset=".55" stop-color="#8c4479"/><stop offset="1" stop-color="#f08a6d"/></linearGradient>
  <linearGradient id="rs-neon-snight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0a1c"/><stop offset=".3" stop-color="#1f1540"/><stop offset=".62" stop-color="#47214f"/><stop offset="1" stop-color="#6a2a55"/></linearGradient>
  <radialGradient id="rs-neon-sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffc58a" stop-opacity=".85"/><stop offset="1" stop-color="#ffc58a" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-neon-dlight" cx="50%" cy="40%" r="50%"><stop offset="0" stop-color="#dfe4f5" stop-opacity=".14"/><stop offset="1" stop-color="#dfe4f5" stop-opacity="0"/></radialGradient>
  <linearGradient id="rs-neon-cwash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34e1ff" stop-opacity=".24"/><stop offset="1" stop-color="#34e1ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-neon-pwash" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".3"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-neon-prefl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".42"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></linearGradient>
  <radialGradient id="rs-neon-swash" cx="50%" cy="0%" r="50%"><stop offset="0" stop-color="#34e1ff" stop-opacity=".3"/><stop offset="1" stop-color="#34e1ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="rs-neon-grow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d27bff" stop-opacity=".42"/><stop offset="1" stop-color="#d27bff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-neon-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e4ff" stop-opacity=".07"/><stop offset="1" stop-color="#e9e4ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-neon-tube" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ae0"/><stop offset="1" stop-color="#b65cff"/></linearGradient>
  <radialGradient id="rs-neon-lglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".3"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-neon-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#34e1ff" stop-opacity=".16"/><stop offset="1" stop-color="#34e1ff" stop-opacity="0"/></radialGradient>
  <filter id="rs-neon-bloom" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="230"><feGaussianBlur stdDeviation="1.4"/></filter>
  <clipPath id="rs-neon-win"><rect x="171" y="15" width="68" height="48"/></clipPath>
  <clipPath id="rs-neon-rec"><circle cx="99" cy="37" r="8.2"/></clipPath>
</defs>
<rect class="rs-neon-d" x="110" y="0" width="190" height="116" fill="url(#rs-neon-dlight)"/>
<rect class="rs-neon-on rs-neon-room" x="0" y="0" width="400" height="48" fill="url(#rs-neon-cwash)"/>
<rect class="rs-neon-on rs-neon-room" x="0" y="88" width="400" height="26" fill="url(#rs-neon-pwash)"/>
<rect x="0" y="0" width="400" height="2.8" fill="#16112a"/><rect x="0" y="1" width="400" height="1" fill="#857ea3" opacity=".55"/>
<rect x="0" y="113.2" width="400" height="2.8" fill="#16112a"/><rect x="0" y="114.1" width="400" height="1" fill="#857ea3" opacity=".55"/>
<g class="rs-neon-on rs-neon-room"><rect x="0" y="113.4" width="400" height="2.4" fill="#ff4fd8" filter="url(#rs-neon-bloom)"/><rect x="0" y="114.1" width="400" height="1" fill="#ffc6f2"/></g>
<rect class="rs-neon-on rs-neon-room" x="4" y="47" width="72" height="34" fill="url(#rs-neon-swash)"/>
<rect x="14" y="44" width="52" height="3" rx=".6" fill="#17122a"/><rect x="14" y="44" width="52" height=".6" fill="#ffffff" opacity=".08"/><rect x="16" y="46.9" width="48" height=".7" fill="#857ea3" opacity=".5"/>
<g class="rs-neon-on rs-neon-room"><rect x="16" y="46.5" width="48" height="1.5" fill="#34e1ff" filter="url(#rs-neon-bloom)"/><rect x="16" y="46.9" width="48" height=".7" fill="#c8fbff"/></g>
<rect x="16" y="32.6" width="9.4" height="11.4" rx=".9" fill="#1b1629"/><circle cx="20.7" cy="40" r="2.9" fill="#2c2642"/><circle cx="20.7" cy="40" r="1.1" fill="#14101f"/><circle cx="20.7" cy="35.3" r="1.1" fill="#2c2642"/><circle class="rs-neon-on rs-neon-room" cx="23.7" cy="34.2" r=".35" fill="#34e1ff"/>
<g fill="#ff6fb5"><circle cx="30.6" cy="31.7" r="1.05"/><circle cx="34.2" cy="31.7" r="1.05"/><rect x="29.6" y="31.4" width="5.6" height="4.4" rx="2"/><rect x="30.2" y="35.6" width="4.4" height="4.6" rx=".9"/><rect x="29" y="36" width="1.3" height="3.6" rx=".6"/><rect x="34.5" y="36" width="1.3" height="3.6" rx=".6"/><rect x="30.3" y="40" width="2" height="4" rx=".5"/><rect x="32.5" y="40" width="2" height="4" rx=".5"/></g>
<rect x="30.3" y="32.2" width=".9" height="2.6" rx=".45" fill="#ffffff" opacity=".45"/><path d="M32.4 37.4l.6.6.6-.6" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width=".4"/>
<rect x="44.5" y="42.8" width="18.5" height="1.2" rx=".5" fill="#0e0b19"/>
<path d="M60.4 37.6C62.4 39.4 61.6 42.6 58.6 42.6H49.4C48 42.6 47.8 39.4 49.4 36.6C48.2 35.6 48.2 33.6 48.8 32.6L48.6 29.8L50.8 31.4C51.8 31 52.8 31 53.6 31.4L55.6 29.8L55.4 32.6C56 33.8 55.8 35.6 54.6 36.4C56.8 37.6 58 39.6 57.8 42.6M50.5 34h.9" stroke="#b9b2d2" stroke-opacity=".5" stroke-width="1.1"${tube}/>
<g class="rs-neon-on rs-neon-room"><path d="M60.4 37.6C62.4 39.4 61.6 42.6 58.6 42.6H49.4C48 42.6 47.8 39.4 49.4 36.6C48.2 35.6 48.2 33.6 48.8 32.6L48.6 29.8L50.8 31.4C51.8 31 52.8 31 53.6 31.4L55.6 29.8L55.4 32.6C56 33.8 55.8 35.6 54.6 36.4C56.8 37.6 58 39.6 57.8 42.6M50.5 34h.9" stroke="#ff4fd8" stroke-width="2.4" filter="url(#rs-neon-bloom)"${tube}/><path d="M60.4 37.6C62.4 39.4 61.6 42.6 58.6 42.6H49.4C48 42.6 47.8 39.4 49.4 36.6C48.2 35.6 48.2 33.6 48.8 32.6L48.6 29.8L50.8 31.4C51.8 31 52.8 31 53.6 31.4L55.6 29.8L55.4 32.6C56 33.8 55.8 35.6 54.6 36.4C56.8 37.6 58 39.6 57.8 42.6M50.5 34h.9" stroke="#ffc6f2" stroke-width=".9"${tube}/></g>
<rect x="78" y="24" width="32" height="26" rx="1.2" fill="#0e0b19"/><rect x="80" y="26" width="28" height="22" fill="#2a2344"/>
<g clip-path="url(#rs-neon-rec)"><circle cx="99" cy="37" r="8.2" fill="#0b0912"/><circle cx="99" cy="37" r="6.6" fill="none" stroke="#2b2640" stroke-width=".5"/><circle cx="99" cy="37" r="5" fill="none" stroke="#2b2640" stroke-width=".5"/></g>
<circle cx="99" cy="37" r="2.5" fill="#ff5fae"/><circle cx="99" cy="37" r=".5" fill="#0b0912"/>
<rect x="81.5" y="28" width="18" height="18" fill="#1b1736"/><circle cx="90.5" cy="35.5" r="4.4" fill="none" stroke="#ff5fae" stroke-width="1.2"/>
<path d="M85 42.6h11" stroke="#3cc4dc" stroke-width=".9"/><path d="M81.5 28h18" stroke="#ffffff" stroke-opacity=".12" stroke-width=".5"/>
<rect class="rs-neon-on rs-neon-sign" x="314" y="16" width="72" height="60" fill="url(#rs-neon-halo)"/>
<rect x="326" y="23" width="46" height="46" rx="2.5" fill="#ffffff" fill-opacity=".035" stroke="#ffffff" stroke-opacity=".12" stroke-width=".5"/>
<path d="M369.6 69c.6 4.4 4 6.6 9 8.4s8 3.4 9.4 7" fill="none" stroke="#120d22" stroke-width=".7"/>
<g fill="#8d86a8">${[[329, 26], [369, 26], [329, 66], [369, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1"/>`).join('')}</g>
<g stroke="#b9b2d2" stroke-opacity=".5" stroke-width="1.3"${tube}><path d="${cloud}"/><path d="${drops}"/></g>`;

  const view = `<g clip-path="url(#rs-neon-win)">
  <g class="rs-neon-d"><rect x="171" y="15" width="68" height="48" fill="url(#rs-neon-sday)"/></g>
  <g class="rs-neon-k"><rect x="171" y="15" width="68" height="48" fill="url(#rs-neon-sdusk)"/><ellipse cx="208" cy="58" rx="34" ry="15" fill="url(#rs-neon-sun)"/>
    <g fill="#ffb08a" opacity=".5"><rect x="166" y="23" width="34" height="1.6" rx=".8"/><rect x="200" y="27.4" width="44" height="1.4" rx=".7"/><rect x="180" y="31.4" width="22" height="1.1" rx=".55"/></g></g>
  <rect class="nite" x="171" y="15" width="68" height="48" fill="url(#rs-neon-snight)"/>
  ${farSvg}<g>${farLit}</g>
  <circle class="nite rs-neon-blink" cx="181.5" cy="22.4" r=".75" fill="#ff4848"/>
  ${midSvg}<g class="rs-neon-g">${midWin}</g><g>${midLit}</g>
  <g><rect x="184.6" y="38.4" width="8" height="4.4" fill="#211a33"/><rect class="rs-neon-mid" x="186.2" y="42.8" width=".5" height="1.4"/><rect class="rs-neon-mid" x="190.6" y="42.8" width=".5" height="1.4"/>
    <g class="rs-neon-d"><rect x="185" y="38.8" width="7.2" height="3.6" fill="#d9d8e2"/><rect x="185.8" y="39.8" width="3.4" height=".7" fill="#9aa0b6"/><rect x="185.8" y="41" width="5" height=".5" fill="#b6bacb"/></g>
    <g class="rs-neon-on"><rect x="185" y="38.8" width="7.2" height="3.6" fill="#5b2bd6"/><rect x="185" y="38.8" width="3.6" height="3.6" fill="#ff4fd8" opacity=".75"/><rect x="185.8" y="39.9" width="4.6" height=".7" fill="#ffffff"/><rect x="185.8" y="41" width="3" height=".5" fill="#bff6ff"/></g></g>
  <g class="rs-neon-near">${near}</g><g class="rs-neon-g">${nearWin}</g><g>${nearLit}</g>
  <rect x="223.6" y="28" width="1" height=".6" fill="#3a3256"/><rect x="223.6" y="43.4" width="1" height=".6" fill="#3a3256"/>
  <rect x="220.2" y="26.8" width="3.6" height="18.4" rx=".4" fill="#140d1e"/>
  <g class="rs-neon-d" fill="#a49cb5"><rect x="220.5" y="27.1" width="3" height="17.8" rx=".3" fill="none" stroke="#8a8199" stroke-width=".4"/>${[28.4, 32.6, 36.8, 41].map((y) => rect(221.1, y, 1.8, 2.8, ' rx=".3"')).join('')}</g>
  <g class="rs-neon-on"><g class="rs-neon-flk"><rect x="220.5" y="27.1" width="3" height="17.8" rx=".3" fill="none" stroke="#ff4fd8" stroke-width=".9" filter="url(#rs-neon-bloom)"/><rect x="220.5" y="27.1" width="3" height="17.8" rx=".3" fill="none" stroke="#ffb3ef" stroke-width=".4"/></g>
    <g fill="#bff6ff">${[28.4, 32.6, 36.8, 41].map((y, i) => rect(221.1, y, 1.8, 2.8, ` rx=".3"${i === 2 ? ' class="rs-neon-flk2"' : ''}`)).join('')}</g></g>
  <g class="nite"><g class="rs-neon-rain"><path d="${rain}" stroke="#a9b8ff" stroke-opacity=".38" stroke-width=".45"/><path transform="translate(6 -48)" d="${rain}" stroke="#a9b8ff" stroke-opacity=".38" stroke-width=".45"/></g>
    <g fill="none" stroke="#d6defc" stroke-opacity=".32" stroke-width=".45" stroke-linecap="round"><path d="M177.2 26q.5 3.4 0 6.6"/><path d="M196 40q-.4 3 .1 5.4"/><path d="M214.3 21q.4 4-.1 7.4"/><path d="M231.4 44q-.4 3 .1 5"/></g>
    <g fill="#e2e8ff" fill-opacity=".5"><circle cx="177.2" cy="33" r=".7"/><circle cx="196.1" cy="45.8" r=".6"/><circle cx="214.2" cy="28.8" r=".7"/><circle cx="231.5" cy="49.4" r=".6"/><circle cx="181" cy="52" r="0.4"/><circle cx="186.5" cy="24" r="0.35"/><circle cx="191" cy="57" r="0.45"/><circle cx="200" cy="30" r="0.35"/><circle cx="210" cy="50" r="0.4"/><circle cx="219" cy="36" r="0.35"/><circle cx="226" cy="57" r="0.45"/><circle cx="234" cy="24" r="0.4"/><circle cx="174" cy="44" r="0.35"/><circle cx="203" cy="55" r="0.3"/>
      <circle class="rs-neon-drip" cx="188" cy="19" r=".65"/><circle class="rs-neon-drip2" cx="223" cy="22" r=".6"/></g></g>
  <path class="rs-neon-sheen" d="M176 63L191 15H197L182 63ZM211 63L226 15H229L214 63Z" fill="#ffffff"/>
</g>
<g class="rs-neon-al"><rect x="171" y="15" width="68" height="1.6"/><rect x="171" y="61.4" width="68" height="1.6"/><rect x="171" y="15" width="1.6" height="48"/><rect x="237.4" y="15" width="1.6" height="48"/><rect x="202.4" y="15" width="2.8" height="48"/></g>
<rect class="rs-neon-al2" x="205.2" y="15" width="2.8" height="48"/><rect x="205.2" y="15" width=".5" height="48" fill="#ffffff" opacity=".12"/>
<rect x="203.6" y="37" width="3.2" height="2.6" rx=".6" fill="#a39cc0"/>`;

  const floor = `<rect x="0" y="120" width="400" height="36" fill="url(#rs-neon-gloss)"/>
<g class="rs-neon-on rs-neon-room"><rect x="0" y="120" width="400" height="17" fill="url(#rs-neon-prefl)"/>
  <rect x="282.4" y="139" width="5.6" height="13" fill="url(#rs-neon-prefl)"/><ellipse cx="285.2" cy="139.6" rx="17" ry="3" fill="#ff4fd8" opacity=".16"/></g>
<ellipse cx="21.6" cy="133.4" rx="5.4" ry="1.1" fill="#b9c8ff" opacity=".13"/><ellipse cx="22.8" cy="133.2" rx="2" ry=".35" fill="#e6ecff" opacity=".25"/>`;

  // 스탠드: 갓 대신 세워 두는 네온 관 조명. 꺼지면 우윳빛 관
  const props = `<path d="M43.6 86.4V74.4Q43.6 72.4 41.6 72.4" fill="none" stroke="#2a2342" stroke-width=".9"/><rect x="34.4" y="71.4" width="9" height="1.8" rx=".9" fill="#2a2342"/><rect x="35.2" y="72.9" width="7.4" height=".6" rx=".3" fill="#8a84a6"/>
<g class="rs-neon-on rs-neon-room"><path d="M35.2 73.4H42.6L46.6 86.4H31.6Z" fill="url(#rs-neon-grow)"/><rect x="35.2" y="72.5" width="7.4" height="1.4" rx=".7" fill="#d27bff" filter="url(#rs-neon-bloom)"/><rect x="35.2" y="72.8" width="7.4" height=".8" rx=".4" fill="#f2c9ff"/></g>
<path d="M39.6 86.4L37.2 80.4M39.6 86.4L40.6 78.6M39.8 86.4L43.6 81.6M39.4 86.4L36.4 84.2M39.8 86.4L41.8 84" stroke="#3f8f6c" stroke-width=".5"/>${[[37.2, 80.4, -35, 5.2, '#3fa57c'], [43.6, 81.6, 55, 4.6, '#3fa57c'], [40.6, 78.6, 8, 5.6, '#4fb98d'], [36.4, 84.2, -70, 3.8, '#4fb98d'], [41.8, 84, 35, 3.6, '#5cc79a']].map(leaf).join('')}
<rect x="34.8" y="86.2" width="9.6" height="8.3" rx="1.2" fill="#e9e5f1"/><rect x="41.4" y="86.2" width="3" height="8.3" rx="1.2" fill="#2a2342" opacity=".12"/><rect x="34.4" y="85.9" width="10.4" height="1.3" rx=".6" fill="#f7f5fb"/><circle cx="37" cy="91.6" r=".45" fill="#34c6e0"/>
<g class="table-mug"><path d="M256.4 97L261.9 80.6" stroke="#34c6e0" stroke-width="1.5"/><path d="M251.4 88.6H260.6L259.5 100H252.5Z" fill="#ffffff" fill-opacity=".14"/><path d="M251.55 90.2H260.45L259.5 99.9H252.5Z" fill="#d7b28c" fill-opacity=".9"/><rect x="251.6" y="90.2" width="8.8" height=".8" fill="#ffffff" opacity=".2"/><g fill="#2b1a17">${[[253.6, 98.8], [255.3, 99.05], [257, 98.75], [258.6, 99], [254.4, 97.5], [256.2, 97.6], [257.9, 97.4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75"/>`).join('')}</g><path d="M259.28 88.4L261.9 80.6" stroke="#34c6e0" stroke-width="1.5"/><rect x="251.2" y="88" width="9.6" height="1.1" rx=".35" fill="#ff8fd0"/><path d="M251.4 88.6L252.5 100H259.5L260.6 88.6" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width=".4"/><path d="M252.7 91L253.3 98.4" stroke="#ffffff" stroke-opacity=".5" stroke-width=".5"/><g fill="#ffffff" fill-opacity=".55"><circle cx="258.6" cy="92.4" r=".3"/><circle cx="259.1" cy="95" r=".25"/><circle cx="254.2" cy="93.6" r=".25"/></g></g>
<rect class="rs-neon-tubeoff" x="283.4" y="47" width="3.6" height="85" rx="1.8"/><rect x="284.2" y="48" width=".9" height="83" rx=".45" fill="#ffffff" opacity=".35"/>
<rect x="282.9" y="45.2" width="4.6" height="3" rx="1" fill="#4a4566"/><rect x="282.9" y="130.6" width="4.6" height="5" rx="1" fill="#4a4566"/>
<g stroke-linecap="round" stroke-linejoin="round">
  <path d="M21.2 133L13.6 91.6" stroke="#9aa3b8" stroke-width=".7"/>
  <path d="M20.8 130.6C20.9 126 20.2 118 19.7 113C19.4 109.8 19.1 107.6 18.9 107C18.5 105.2 17.4 104 15.7 103C14.6 103.8 14 105.4 14.1 107.9C14.5 112 16.4 119.4 20.8 130.6Z" fill="#dfe8f6" fill-opacity=".36" stroke="#eef3fb" stroke-opacity=".55" stroke-width=".4"/>
  <path d="M20.5 128.4L17.4 107.4M20.2 129L15.6 108.2" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width=".35"/>
  <path d="M16 115.7l3.9-.7" stroke="#e8eefb" stroke-opacity=".75" stroke-width="1"/>
  <path d="M21.2 133l-.5-2.6" stroke="#4a4566" stroke-width="1"/>
  <path d="M13.6 91.6l-.5-2.8q-.6-2.7-3-2.2t-1.4 2.4" fill="none" stroke="#eef1f8" stroke-width="1.3"/>
</g>`;

  const glow = `<g class="rs-neon-on rs-neon-room rs-neon-ceil"><rect x="0" y="0" width="400" height="3.4" fill="#34e1ff" filter="url(#rs-neon-bloom)"/><rect x="0" y="1" width="400" height="1" fill="#c8fbff"/></g>
<g class="rs-neon-on rs-neon-room"><ellipse cx="285.2" cy="90" rx="26" ry="50" fill="url(#rs-neon-lglow)"/>
  <rect x="282.4" y="48.4" width="5.6" height="82" rx="2.8" fill="#ff4fd8" filter="url(#rs-neon-bloom)"/>
  <rect x="283.4" y="48.4" width="3.6" height="82" rx="1.8" fill="url(#rs-neon-tube)"/><rect x="284.6" y="50" width="1.2" height="79" rx=".6" fill="#ffe3f8" opacity=".85"/></g>
<g class="rs-neon-on rs-neon-sign">
  <g filter="url(#rs-neon-bloom)" stroke-width="2.8"${tube}><path d="${cloud}" stroke="#34e1ff"/><path d="${drops}" stroke="#ff4fd8"/></g>
  <path d="${cloud}" stroke="#c4f8ff" stroke-width="1.1"${tube}/><path class="rs-neon-flk" d="${drops}" stroke="#ffc6f2" stroke-width="1.1"${tube}/>
</g>`;

  (window.MT_ROOMS = window.MT_ROOMS || {}).neon = { css, wall, view, floor, props, glow };
})();
