'use strict';
// 방 스타일: 벚꽃 정원 방 — 봄바람에 꽃잎이 들어오는 방 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
{
  const R = '#room[data-room="sakura"]';
  const K = `${R}.sky-dusk`, N = `${R}.sky-night`, Z = `${R}.night`;
  // 꽃잎 하나(끝이 살짝 파인 벚꽃 잎)
  const PETAL = 'M0-.7L.45-1.35C1.2-1.25 1.5-.25 1.1.5.75 1.15 0 1.45 0 1.45S-.75 1.15-1.1.5C-1.5-.25-1.2-1.25-.45-1.35Z';
  const pt = (x, y, r = 0, c = 'rs-sk-pt', k = 1) => `<use class="${c}" href="#rs-sakura-p" transform="translate(${x} ${y}) rotate(${r})${k === 1 ? '' : ` scale(${k})`}"/>`;
  // 바람에 날려 들어와 떨어지는 꽃잎: 시작 자리, 좌우 뒤집기, 경로, 길이, 지연, 도는 빠르기
  const fall = (x, y, flip, path, dur, delay, spin) => `<g transform="translate(${x} ${y}) scale(${flip ? -1.25 : 1.25} 1.25)"><g class="rs-sk-f${path}" style="animation-duration:${dur}s;animation-delay:${delay}s"><use class="rs-sk-pt rs-sk-sp" href="#rs-sakura-p" style="animation-duration:${spin}s"/></g></g>`;
  // 창으로 들어온 빛(창살 그림자 포함)
  const PATCH = {
    d: 'M171 122L203.8 122 201 133.4 168.2 133.4ZM206.2 122L239 122 236.2 133.4 203.3 133.4ZM167.8 134.6L200.7 134.6 197.8 146 165 146ZM203 134.6L235.8 134.6 233 146 200.2 146Z',
    k: 'M171 122L203.8 122 192.4 139.1 159.6 139.1ZM206.2 122L239 122 227.6 139.1 194.8 139.1ZM158.4 140.9L191.2 140.9 179.8 158 147 158ZM193.6 140.9L226.4 140.9 215 158 182.2 158Z',
    n: 'M171 122L203.8 122 197.2 136.3 164.3 136.3ZM206.2 122L239 122 232.3 136.3 199.5 136.3ZM163.7 137.8L196.5 137.8 189.8 152 157 152ZM198.8 137.8L231.7 137.8 225 152 192.2 152Z',
  };
  const patches = `<path class="rs-sk-d rs-sk-lp" d="${PATCH.d}"/><path class="rs-sk-k rs-sk-lp" d="${PATCH.k}"/><path class="rs-sk-n rs-sk-lp" d="${PATCH.n}"/>`;
  // 꽃구름(가장자리가 꽃송이처럼 오톨도톨한 덩어리): 그늘, 바탕, 볕 드는 쪽, 꽃송이 점
  const scal = (cx, cy, rx, ry, n, s) => {
    const r = ((Math.PI * 2) / n) * Math.max(rx, ry) * 0.6;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const k = i % n, a = (k / n) * Math.PI * 2 + s, j = 1 + 0.07 * Math.sin(k * 2.3 + s * 3);
      const x = (cx + rx * j * Math.cos(a)).toFixed(1), y = (cy + ry * j * Math.sin(a)).toFixed(1);
      d += i ? `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x} ${y}` : `M${x} ${y}`;
    }
    return d + 'Z';
  };
  const frac = (v) => v - Math.floor(v);
  const crown = ([cx, cy, rx, ry, n, s], p = 'rs-sk-t') => {
    let dots = '';
    for (let i = 0; i < Math.round(rx * 0.9); i++) {
      const a = -Math.PI * (0.05 + 0.8 * frac(i * 0.618 + s)), f = 0.12 + 0.55 * frac(i * 0.382 + s * 2);
      dots += `<circle cx="${(cx + 1.2 + rx * f * Math.cos(a)).toFixed(1)}" cy="${(cy - 0.6 + ry * f * Math.sin(a)).toFixed(1)}" r="${(0.42 + 0.3 * frac(i * 0.27)).toFixed(2)}"/>`;
    }
    return `<path class="${p}0" d="${scal(cx - 0.6, cy + 1.3, rx, ry, n, s)}"/><path class="${p}1" d="${scal(cx, cy, rx * 0.94, ry * 0.9, n, s + 0.4)}"/>` +
      `<path class="${p}2" d="${scal(cx + rx * 0.16, cy - ry * 0.22, rx * 0.6, ry * 0.52, Math.max(6, n - 4), s + 1)}"/><g class="${p}3">${dots}</g>`;
  };
  // 벚나무 왕관: 뒤의 세 덩어리, 앞의 네 덩어리
  const CROWN = [[187, 21, 14, 7, 15, 0.2], [173.5, 28.5, 10, 6.2, 11, 1.1], [201, 26.5, 10.5, 6, 11, 2.3],
    [179, 37.2, 10, 5.4, 11, 0.7], [195.5, 35.4, 9.4, 5.2, 11, 1.9], [209, 34.6, 6.4, 4.4, 8, 2.9], [170.5, 43.4, 6.4, 3.8, 8, 0.4]];
  // 책상 위 벚나무 분재(물 주는 화분 자리)
  const BONSAI = [[34, 78.2, 4.4, 2.5, 8, 0.5], [45.8, 78.6, 4.2, 2.3, 8, 1.4], [40.4, 74.6, 5.4, 2.9, 9, 2.2]];
  // 등: 낮에는 꺼진 종이 등, 해질녘부터 켜진다
  const LANTERNS = [[213, 47.6], [223, 48.6], [232.5, 47.9]];
  const lantern = (lit) => LANTERNS.map(([x, y]) => `<path d="M${x} ${y - 3.6}v1" stroke="#4a3b38" stroke-width=".35"/><ellipse cx="${x}" cy="${y}" rx="1.95" ry="2.5" fill="${lit ? '#ffe3a3' : '#fbf1e2'}"/><path d="M${x - 1.8} ${y - .9}h3.6M${x - 1.95} ${y + .3}h3.9M${x - 1.6} ${y + 1.4}h3.2" stroke="${lit ? '#f4ab5c' : '#e9d3bb'}" stroke-width=".3"/><rect x="${x - 1.2}" y="${y - 3}" width="2.4" height=".8" rx=".2" fill="#4a3b38"/><rect x="${x - 1.2}" y="${y + 2.2}" width="2.4" height=".8" rx=".2" fill="#4a3b38"/>`).join('');

  (window.MT_ROOMS = window.MT_ROOMS || {})['sakura'] = {
    css: `
${R} {
  --wall: #f6e5e7; --wall-line: #ebd3d6; --floor: #ead5b8; --floor-line: #dcc39f;
  --wood: #d4aa80; --wood-dark: #b98b61; --metal: #ab988c; --frame: #d9b690; --sky: #cfe6f6;
  --sheet: #fdf7f4; --pillow: #fffdfc; --blanket: #eaa7b9; --blanket-dark: #d68ea3;
  --screen: #2a2f45; --laptop: #e0d2d3; --mug: #e68ea2; --lamp: #ffd7a3; --shade: #eecfae;
  --rs-sk-hill: #b9d1c6; --rs-sk-hill2: #a2c4b2; --rs-sk-lawn: #9fcb93; --rs-sk-edge: #86b47e;
  --rs-sk-pond: #a3cde2; --rs-sk-pond2: #d3ebf5; --rs-sk-ref: #e9b9c8;
  --rs-sk-t0: #e49db1; --rs-sk-t1: #f0b6c6; --rs-sk-t2: #f8cfda; --rs-sk-t3: #fde3ea; --rs-sk-bark: #5f4540;
}
${R}[viewBox][role] { --rug: #f1d6d4; --rug-line: #fdf0ef; --arm: #a9c4ae; --arm-dark: #91ad97; --cushion: #f2bfcb; }
${K} {
  --rs-sk-hill: #c99aae; --rs-sk-hill2: #b5879f; --rs-sk-lawn: #b39a86; --rs-sk-edge: #9c8274;
  --rs-sk-pond: #dca7b9; --rs-sk-pond2: #f6cbc4; --rs-sk-ref: #e597a4;
  --rs-sk-t0: #d98a9f; --rs-sk-t1: #eea5ae; --rs-sk-t2: #f8bfb6; --rs-sk-t3: #ffdccb; --rs-sk-bark: #563a3e;
}
${N}, ${Z} {
  --rs-sk-hill: #283262; --rs-sk-hill2: #222a53; --rs-sk-lawn: #2b3a4f; --rs-sk-edge: #223043;
  --rs-sk-pond: #1c2550; --rs-sk-pond2: #3a4a82; --rs-sk-ref: #4a4775;
  --rs-sk-t0: #665c8a; --rs-sk-t1: #8476a3; --rs-sk-t2: #a292bc; --rs-sk-t3: #c6b8d8; --rs-sk-bark: #2a2440;
}
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} rect.wood[x="14"][y="44"], ${R} .pot, ${R} .leaf, ${R} .hill1, ${R} .hill2,
${R} .table-mug > .mug, ${R} .table-mug > .mug-handle, ${R} .table-mug > .steam { display: none; }
${R} .rs-sk-b0 { fill: #e49db1; } ${R} .rs-sk-b1 { fill: #f0b6c6; } ${R} .rs-sk-b2 { fill: #f8cfda; } ${R} .rs-sk-b3 { fill: #fde3ea; }
${R} .rs-sk-steam { stroke: #b9a7a7; stroke-width: 1; fill: none; stroke-linecap: round; opacity: 0; animation: rs-sakura-steam 3s ease-in-out infinite; }
${R} .rs-sk-s2 { animation-delay: 1.4s; }
${R} .poster-sky { fill: #fbf4ea; }
${R} .rs-sk-k, ${R} .rs-sk-n, ${R} .rs-sk-kn, ${R} .rs-sk-z { display: none; }
${K} .rs-sk-k, ${K} .rs-sk-kn, ${N} .rs-sk-n, ${N} .rs-sk-kn, ${Z} .rs-sk-n, ${Z} .rs-sk-kn, ${Z} .rs-sk-z { display: inline; }
${K} .rs-sk-d, ${N} .rs-sk-d, ${Z} .rs-sk-d, ${Z} .rs-sk-nz { display: none; }
${R} .rs-sk-hill { fill: var(--rs-sk-hill); } ${R} .rs-sk-hill2 { fill: var(--rs-sk-hill2); }
${R} .rs-sk-lawn { fill: var(--rs-sk-lawn); } ${R} .rs-sk-edge { fill: var(--rs-sk-edge); }
${R} .rs-sk-pond { fill: var(--rs-sk-pond); } ${R} .rs-sk-rip { stroke: var(--rs-sk-pond2); stroke-width: .45; fill: none; stroke-linecap: round; }
${R} .rs-sk-ref { fill: var(--rs-sk-ref); opacity: .55; }
${R} .rs-sk-t0 { fill: var(--rs-sk-t0); } ${R} .rs-sk-t1 { fill: var(--rs-sk-t1); } ${R} .rs-sk-t2 { fill: var(--rs-sk-t2); } ${R} .rs-sk-t3 { fill: var(--rs-sk-t3); }
${R} .rs-sk-bark { stroke: var(--rs-sk-bark); fill: none; stroke-linecap: round; }
${R} .rs-sk-pt { fill: #f7c2d0; } ${R} .rs-sk-pt2 { fill: #fbdde6; }
${R} .rs-sk-lp { fill: #fff6e0; opacity: .42; filter: blur(.5px); }
${K} .rs-sk-lp { fill: #ffbf86; opacity: .42; }
${N} .rs-sk-lp, ${Z} .rs-sk-lp { fill: #d3dcff; opacity: .2; }
${R} .rs-sk-tint { fill: #fff; mix-blend-mode: multiply; transition: fill .8s; pointer-events: none; }
${K} .rs-sk-tint { fill: url(#rs-sakura-tk); }
${N} .rs-sk-tint, ${Z} .rs-sk-tint { fill: url(#rs-sakura-tn); }
${R} .rs-sk-cl { transform-origin: 162px 9px; animation: rs-sakura-swl 7s ease-in-out infinite; }
${R} .rs-sk-cr { transform-origin: 248px 9px; animation: rs-sakura-swr 7.6s ease-in-out -2.4s infinite; }
${Z} .rs-sk-cl, ${Z} .rs-sk-cr { animation: none; }
${R} .rs-sk-fa, ${R} .rs-sk-fb { animation: rs-sakura-fa 14s ease-in-out infinite; }
${R} .rs-sk-fb { animation-name: rs-sakura-fb; }
${R} .rs-sk-sp { transform-box: fill-box; transform-origin: center; animation: rs-sakura-spin 3.4s linear infinite; }
${R} .rs-sk-rip { animation: rs-sakura-rip 6s ease-in-out infinite; }
${R} .rs-sk-halo { animation: rs-sakura-flk 3.2s ease-in-out infinite; }
${Z} .rs-sk-f { display: none; }
${Z} #blanketOver .blanket { fill: #7c5a82; } ${Z} #blanketOver .fold { stroke: #6c4b6c; } ${Z} #blanketOver .wood { fill: #6f5958; } ${Z} #blanketOver .wood-dark { fill: #604948; }
@media (prefers-reduced-motion: reduce) { ${R} .rs-sk-f { display: none; } }
@keyframes rs-sakura-swl { 0%, 100% { transform: skewX(0); } 50% { transform: skewX(-2.6deg); } }
@keyframes rs-sakura-swr { 0%, 100% { transform: skewX(0); } 50% { transform: skewX(2.2deg); } }
@keyframes rs-sakura-fa {
  0% { transform: translate(0, 0); opacity: 0; } 6% { opacity: 1; }
  22% { transform: translate(13px, 22px); } 44% { transform: translate(9px, 48px); }
  66% { transform: translate(27px, 72px); } 88% { transform: translate(23px, 98px); opacity: 1; }
  100% { transform: translate(33px, 110px); opacity: 0; }
}
@keyframes rs-sakura-fb {
  0% { transform: translate(0, 0); opacity: 0; } 6% { opacity: 1; }
  25% { transform: translate(-6px, 26px); } 50% { transform: translate(10px, 50px); }
  75% { transform: translate(4px, 78px); } 90% { opacity: 1; }
  100% { transform: translate(18px, 100px); opacity: 0; }
}
@keyframes rs-sakura-spin {
  0% { transform: rotate(0) scaleX(1); } 25% { transform: rotate(90deg) scaleX(.3); }
  50% { transform: rotate(180deg) scaleX(1); } 75% { transform: rotate(270deg) scaleX(.4); } 100% { transform: rotate(360deg) scaleX(1); }
}
@keyframes rs-sakura-steam { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: .55; } 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes rs-sakura-rip { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(1.2px); } }
@keyframes rs-sakura-flk { 0%, 100% { opacity: .9; } 45% { opacity: 1; } 70% { opacity: .78; } }
`,
    wall: `
<rect x="0" y="86" width="400" height="30" fill="#f2dde0"/>
<rect x="0" y="85" width="400" height="1.8" fill="#e3c4a6"/>
<path d="M5 91h42v21H5zM55 91h42v21H55zM105 91h42v21h-42zM155 91h42v21h-42zM205 91h42v21h-42zM255 91h42v21h-42zM305 91h42v21h-42zM355 91h42v21h-42z" fill="none" stroke="#e7cdd1" stroke-width=".9"/>`,
    view: `
<defs>
  <clipPath id="rs-sakura-win"><rect x="171" y="15" width="68" height="48" rx="1.5"/></clipPath>
  <linearGradient id="rs-sakura-sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccbef"/><stop offset="1" stop-color="#e6f2f7"/></linearGradient>
  <linearGradient id="rs-sakura-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9f8fc4"/><stop offset=".55" stop-color="#eaa2b4"/><stop offset="1" stop-color="#ffcf9f"/></linearGradient>
  <linearGradient id="rs-sakura-sn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111a3e"/><stop offset="1" stop-color="#2e3a70"/></linearGradient>
  <radialGradient id="rs-sakura-sg"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".85"/><stop offset="1" stop-color="#ffc9a0" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-sakura-mh"><stop offset="0" stop-color="#fff4d2" stop-opacity=".5"/><stop offset="1" stop-color="#fff4d2" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#rs-sakura-win)">
  <rect class="rs-sk-d" x="171" y="15" width="68" height="38" fill="url(#rs-sakura-sd)"/>
  <rect class="rs-sk-k" x="171" y="15" width="68" height="38" fill="url(#rs-sakura-sk)"/>
  <rect class="rs-sk-n" x="171" y="15" width="68" height="38" fill="url(#rs-sakura-sn)"/>
  <g class="rs-sk-d" fill="#fff" opacity=".9"><path d="M219 25.5a2.6 2.6 0 0 1 2.6-2.4 3.4 3.4 0 0 1 6.4.6 2.2 2.2 0 0 1 .6 4.3h-8.7a1.6 1.6 0 0 1-.9-2.5z"/><path d="M230 33.4a1.7 1.7 0 0 1 1.8-1.5 2.3 2.3 0 0 1 4.3.4 1.5 1.5 0 0 1 .3 2.9h-5.7a1.1 1.1 0 0 1-.7-1.8z" opacity=".8"/></g>
  <g class="rs-sk-k"><circle cx="233" cy="49" r="16" fill="url(#rs-sakura-sg)"/><g fill="#ffd6c4"><path d="M211.6 23.6c4-1.3 10.4-1.6 17.6-.6-5.4.9-12.2 1.2-17.6.6z" opacity=".85"/><path d="M219 29.4c3.6-1 9.6-1.2 19-.3-6 .8-13.2 1-19 .3z" opacity=".7"/><path d="M226.6 19.2c2.4-.7 6.2-.8 10.4-.2-3.4.5-7.2.6-10.4.2z" opacity=".6"/></g></g>
  <g class="rs-sk-n" fill="#fff"><circle cx="216" cy="19" r=".45"/><circle cx="236" cy="18.4" r=".5"/><circle cx="234.5" cy="33" r=".4"/><circle cx="211" cy="29.5" r=".35"/><circle cx="221" cy="34.2" r=".4" opacity=".7"/><circle cx="208.6" cy="20.8" r=".3" opacity=".7"/></g>
  <g class="rs-sk-n"><circle cx="227" cy="24" r="9" fill="url(#rs-sakura-mh)"/><circle cx="227" cy="24" r="4.1" fill="#fbf0cf"/><circle cx="225.6" cy="23" r=".9" fill="#ece0bb"/><circle cx="228.4" cy="25.6" r=".6" fill="#ece0bb"/></g>
  <path class="rs-sk-hill" d="M171 46.5c4-2.6 8.6-3.4 13-2.2 3.2.9 5.6.4 8.6-1.2 4.2-2.2 9-2 13 .2 3.6 2 7.2 2.2 11 .6 4.6-1.9 9.6-1.8 14 .2 2.8 1.2 5.6 1.4 8.4.6V53H171z"/>
  <path class="rs-sk-hill2" d="M171 49.4c5-1.6 10.4-1.8 15.6-.6 4 .9 8 .8 12-.4 6-1.8 12.4-1.6 18.4.4 3.8 1.2 7.6 1.2 11.4 0 3.6-1 7-1 10.6 0V53H171z"/>
  <rect class="rs-sk-lawn" x="171" y="50.4" width="68" height="3"/>
  <rect class="rs-sk-pond" x="171" y="53" width="68" height="10"/>
  <rect class="rs-sk-edge" x="171" y="52.8" width="68" height=".8"/>
  <ellipse cx="235.5" cy="54.2" rx="2.6" ry="1.1" fill="#8d9295" opacity=".85"/><ellipse cx="174.5" cy="54.1" rx="2.2" ry=".9" fill="#8d9295" opacity=".8"/>
  <g class="rs-sk-t2" opacity=".9"><circle cx="196.4" cy="55.4" r=".45"/><circle cx="197.4" cy="55.8" r=".4"/><circle cx="198.6" cy="55.5" r=".45"/><circle cx="197.8" cy="56.6" r=".35"/><circle cx="182" cy="59.6" r=".4"/><circle cx="183.1" cy="59.9" r=".45"/><circle cx="184.2" cy="59.5" r=".35"/><circle cx="227.6" cy="61.6" r=".4"/><circle cx="228.6" cy="61.4" r=".35"/><circle cx="203.6" cy="61.8" r=".4"/></g>
  <ellipse cx="217" cy="59" rx="1.6" ry=".55" fill="#7fae74" opacity=".8"/><ellipse cx="219.4" cy="60.3" rx="1.2" ry=".45" fill="#7fae74" opacity=".7"/>
  <g>
  <path class="rs-sk-bark" stroke-width="3" d="M185.4 53.6c.4-3.8.8-7.4 1.8-11"/>
  <path class="rs-sk-bark" stroke-width="1.8" d="M186.8 43.4c-2.4-3.4-6-6.4-10.4-8.6M187 42.6c2.6-3.8 6.8-6.8 12-8.4M190.6 39.2c5-.4 10.4.8 15.6 3.2"/>
  <path class="rs-sk-bark" stroke-width="1" d="M180.4 37.6c-1-3-1-6 .4-8.6M193.4 36.4c.6-3.2 2.4-6 5-8M199.2 40.4c2.2-2.4 5-3.8 8.2-4.2"/>
  ${CROWN.slice(0, 3).map((c) => crown(c)).join('')}
  <path class="rs-sk-bark" stroke-width=".8" d="M176.6 35c-2.2.6-4.2 1.8-5.6 3.6M201.4 34.4c2.4.2 4.6 1 6.4 2.4M188 39.6c-.4-1.4-.2-2.8.6-4"/>
  ${CROWN.slice(3).map((c) => crown(c)).join('')}
  </g>
  <path d="M184 53.4c.3 2.4.7 4.8 1.4 7.2l1.6-.2c-.6-2.4-.9-4.6-1-7z" fill="var(--rs-sk-bark)" opacity=".3"/><g class="rs-sk-ref">${CROWN.map(([cx, cy, rx, ry, n, s]) => `<path d="${scal(cx, 106.6 - cy, rx * 0.94, ry * 0.8, n, s)}"/>`).join('')}</g>
  <g class="rs-sk-rip"><path d="M175 58.4h7M188 57.2h9M201 59.6h6M213 56.4h8M226 58.2h9M180 61.2h10M209 61.6h7M231 61h5"/></g>
  <path d="M206.5 41.5Q222 47.5 239.5 42" stroke="#4a3b38" stroke-width=".35" fill="none"/>
  <g class="rs-sk-d">${lantern(false)}</g>
</g>`,
    floor: `
<path d="M8 131h38M118 128h30M250 133h40M330 126h44M28 158h52M196 154h36M296 160h44M60 188h40M250 186h44M120 218h36M300 216h40" stroke="#f3e2c8" stroke-width=".7" stroke-linecap="round" opacity=".8"/>
${patches}
${pt(152, 125, 20)}${pt(247, 128, -40, 'rs-sk-pt2')}${pt(240, 141, 70)}${pt(160, 143, -15, 'rs-sk-pt2')}${pt(118, 140, 110)}${pt(286, 145, 35)}`,
    props: `
<defs>
  <path id="rs-sakura-p" d="${PETAL}"/>
  <clipPath id="rs-sakura-rug"><ellipse cx="200" cy="166" rx="165" ry="17"/></clipPath>
  <radialGradient id="rs-sakura-tk" gradientUnits="userSpaceOnUse" cx="205" cy="45" r="230"><stop offset="0" stop-color="#fff6ee"/><stop offset=".45" stop-color="#fbe2d6"/><stop offset="1" stop-color="#e8c3b8"/></radialGradient>
  <radialGradient id="rs-sakura-tn" gradientUnits="userSpaceOnUse" cx="285" cy="64" r="250"><stop offset="0" stop-color="#fff1df"/><stop offset=".16" stop-color="#f1e1e6"/><stop offset=".5" stop-color="#c6c1de"/><stop offset="1" stop-color="#a4a2c8"/></radialGradient>
</defs>
<g clip-path="url(#rs-sakura-rug)">${patches}</g>
<path d="M82.5 47c4-2.2 7.5-5.4 10.4-9.2 2.4-3.2 6-5.6 10-6.4M92.9 37.8c-.4-2.4.4-4.6 2-6.2M97.6 34.2c1.6.4 3.2 1.4 4.2 2.8" stroke="#6b4e45" stroke-width=".7" fill="none" stroke-linecap="round"/>
<g fill="#f2a7ba"><circle cx="88" cy="42.6" r="1.3"/><circle cx="95" cy="31.4" r="1.2"/><circle cx="99.6" cy="32.6" r="1.3"/><circle cx="103.4" cy="31.2" r="1.1"/><circle cx="101.9" cy="37.2" r="1.2"/><circle cx="91" cy="39.4" r="1.1"/></g>
<g fill="#f8cdd8"><circle cx="86" cy="44.6" r="1"/><circle cx="93.4" cy="35" r="1"/><circle cx="97.2" cy="35.6" r=".9"/><circle cx="105" cy="33.6" r=".8"/></g>
<g fill="#c9637e"><circle cx="88" cy="42.6" r=".35"/><circle cx="99.6" cy="32.6" r=".35"/><circle cx="95" cy="31.4" r=".3"/><circle cx="101.9" cy="37.2" r=".3"/></g>
<rect x="102.2" y="44.2" width="2.4" height="2.4" rx=".3" fill="#c9483f"/>
<rect x="12" y="44" width="58" height="2.6" rx=".8" fill="#d9b48c"/><rect x="12" y="45.9" width="58" height=".7" fill="#c49a70"/>
<path d="M18 46.6h3.4c-2 .6-3 2.2-3.4 4.6zM64 46.6h-3.4c2 .6 3 2.2 3.4 4.6z" fill="#c49a70"/>
<rect x="15" y="42.9" width="29" height="1.1" rx=".5" fill="#a97c55"/>
<path d="M19.2 38.4c-1.5-.5-2.5-1.8-2.9-3.3l.9-.3c.5 1.1 1.4 1.8 2.4 2.1z" fill="#bcd3c6"/>
<path d="M18.8 38.6c0-2.8 2.3-4.6 5.2-4.6s5.2 1.8 5.2 4.6c0 2.5-1.9 4.3-5.2 4.3s-5.2-1.8-5.2-4.3z" fill="#d3e3d9"/>
<path d="M24 34c2.9 0 5.2 1.8 5.2 4.6 0 2.5-1.9 4.3-5.2 4.3 2-.6 3.2-2.2 3.2-4.3 0-2.4-1.3-4-3.2-4.6z" fill="#bcd3c6"/>
<path d="M21.8 34.5c.4-1 1.2-1.5 2.2-1.5s1.8.5 2.2 1.5z" fill="#c1d6ca"/><circle cx="24" cy="32.7" r=".6" fill="#8a6a4a"/>
<path d="M20.6 35.2c.2-3.6 1.5-5.6 3.4-5.6s3.2 2 3.4 5.6" stroke="#8a6a4a" stroke-width=".7" fill="none" stroke-linecap="round"/>
<path d="M21.6 38.4c.3-.9 1-1.5 1.8-1.7" stroke="#eef6f1" stroke-width=".6" fill="none" stroke-linecap="round"/>
<g fill="#fffaf4"><path d="M32.2 38.6h4.2l-.35 4.3h-3.5zM37.8 38.6h4.2l-.35 4.3h-3.5z"/></g>
<path d="M35.1 38.6h1.3l-.35 4.3h-1.1zM40.7 38.6h1.3l-.35 4.3h-1.1z" fill="#eadfd2"/>
<g fill="#e48fa5"><path d="M32.2 38.6h4.2v.8h-4.2zM37.8 38.6h4.2v.8h-4.2z"/></g>
<path d="M53.5 44h3.4c.9-1.6 1.1-3.6.3-5.2-.4-.9-.8-1.6-.8-2.6v-1.3H54v1.3c0 1-.4 1.7-.8 2.6-.8 1.6-.6 3.6.3 5.2z" fill="#e7c6cd"/>
<path d="M55.2 44h1.7c.9-1.6 1.1-3.6.3-5.2-.4-.9-.8-1.6-.8-2.6v-1.3h-1.2z" fill="#d9b0b9"/>
<path d="M55.2 34.8c-.4-3.6-1.6-6.6-3.6-9.2M55.4 34.8c.8-2.8 2.2-5 4.2-6.6M53.9 30.2c-1.2-.6-2.4-.8-3.6-.6" stroke="#6b4e45" stroke-width=".55" fill="none" stroke-linecap="round"/>
<g fill="#f2a9bc"><circle cx="51.4" cy="25.6" r="1.1"/><circle cx="59.4" cy="28.2" r="1.1"/><circle cx="50.2" cy="29.6" r=".9"/><circle cx="53.6" cy="28.4" r=".9"/><circle cx="57.6" cy="30.4" r=".85"/></g>
<g fill="#f9d1dc"><circle cx="52.6" cy="24.4" r=".8"/><circle cx="60.6" cy="27" r=".7"/><circle cx="56.8" cy="29" r=".75"/></g>
<g fill="#d9758f"><circle cx="51.4" cy="25.6" r=".3"/><circle cx="59.4" cy="28.2" r=".3"/><circle cx="50.4" cy="23.6" r=".45"/></g>
<path d="M32.6 90.6h14.2l-.9 3.2c-.1.4-.5.7-.9.7h-10.6c-.4 0-.8-.3-.9-.7z" fill="#6f8fa8"/>
<path d="M40.2 90.6h6.6l-.9 3.2c-.1.4-.5.7-.9.7h-4.8z" fill="#5f7d95"/>
<rect x="32" y="89.6" width="15.4" height="1.3" rx=".4" fill="#84a2b9"/>
<path d="M33 89.7c2.6-.9 10.8-.9 13.4 0z" fill="#7da862"/>
<path d="M38.4 89.8c.5-2.5-.6-4.1-1.7-5.6-1-1.4-1-3.2.4-4.4 1-.8 2.4-1.1 3.2-2.3l.9.6c-.8 1.4-2.2 1.9-3 2.7-.7.8-.5 2 .3 3.2 1.2 1.8 2.1 3.6 1.7 5.8z" fill="#5f4540"/>
<path d="M37.4 80.8c-1.6-.4-2.8-1.4-3.6-2.8M40.4 78.4c1.8-.5 3.6-.3 5.2.5M39.8 78.2c-.1-1.4.3-2.6 1.1-3.6" stroke="#5f4540" stroke-width=".8" fill="none" stroke-linecap="round"/>
${BONSAI.map((c) => crown(c, 'rs-sk-b')).join('')}
${pt(49.6, 93.8, 80)}${pt(29.4, 93.8, -30, 'rs-sk-pt2')}
<g class="table-mug">
  <path class="rs-sk-steam" d="M255.2 90.4q-1.6-2.4 0-4.8t0-4.8"/><path class="rs-sk-steam rs-sk-s2" d="M258.8 90.4q-1.6-2.4 0-4.8t0-4.8"/>
  <path d="M250.2 94.2h13.6c-.2 3.2-2.4 5.3-5 5.5h-3.6c-2.6-.2-4.8-2.3-5-5.5z" fill="#ead0c0"/>
  <path d="M257 99.7h1.8c2.6-.2 4.8-2.3 5-5.5h-3.2c-.2 2.8-1.4 4.6-3.6 5.5z" fill="#d9b9a7"/>
  <path d="M251 96.8c2 .9 4 1.3 6 1.3s4-.4 6-1.3c-.7 1.7-2.2 2.8-4.2 2.9h-3.6c-2-.1-3.5-1.2-4.2-2.9z" fill="#c99a8c" opacity=".55"/>
  <rect x="254.6" y="99.4" width="4.8" height=".7" rx=".3" fill="#c9a593"/>
  <ellipse cx="257" cy="94.2" rx="6.8" ry="1.25" fill="#f1dccf"/><ellipse cx="257" cy="94.3" rx="5.9" ry=".9" fill="#8db65a"/><ellipse cx="256.4" cy="94.2" rx="3.2" ry=".45" fill="#b4d283"/>
  <path d="M266.1 100v-3.4c0-1.5.8-2.6 1.7-2.6s1.7 1.1 1.7 2.6v3.4z" fill="#e6d2a2"/><path d="M267 96.4v3.4M267.8 95.6v4.2M268.6 96.4v3.4" stroke="#cdb57f" stroke-width=".3"/><rect x="266.6" y="99.3" width="2.4" height=".7" fill="#b8955e"/>
</g>
${pt(176, 64.8, 70)}${pt(233, 65, -60, 'rs-sk-pt2')}${pt(240.5, 65.2, 15)}
<rect x="152" y="7.6" width="106" height="1.6" rx=".8" fill="#c99e74"/><circle cx="152" cy="8.4" r="1.6" fill="#b98c62"/><circle cx="258" cy="8.4" r="1.6" fill="#b98c62"/>
<g class="rs-sk-cl"><path d="M154 9.2h15.6v63.6c-1.6.9-3.2.9-4.8 0-1.4.8-3 .8-4.4 0-1.4.8-3 .8-4.4 0-.8.6-1.4.7-2 .5z" fill="#fff" opacity=".62"/><path d="M157.6 9.6v63M161.6 9.6v63.2M165.4 9.6v63" stroke="#f1dfe2" stroke-width=".8"/></g>
<g class="rs-sk-cr"><path d="M240.4 9.2H256v63.1c-.6.2-1.2.1-2-.5-1.4.8-3 .8-4.4 0-1.4.8-3 .8-4.4 0-1.6.9-3.2.9-4.8 0z" fill="#fff" opacity=".62"/><path d="M244.6 9.6v63M248.4 9.6v63.2M252.4 9.6v63" stroke="#f1dfe2" stroke-width=".8"/></g>
<g class="rs-sk-z">${pt(170, 156, 30, 'rs-sk-pt', 1.3)}${pt(212, 160, -50, 'rs-sk-pt2', 1.3)}${pt(236, 170, 90, 'rs-sk-pt', 1.3)}${pt(186, 175, 10, 'rs-sk-pt', 1.3)}${pt(150, 168, -80, 'rs-sk-pt2', 1.3)}${pt(258, 158, 40, 'rs-sk-pt', 1.3)}${pt(124, 161, 60, 'rs-sk-pt', 1.3)}${pt(204, 151, 120, 'rs-sk-pt', 1.3)}${pt(282, 172, -20, 'rs-sk-pt2', 1.3)}</g>
<g class="rs-sk-f">
${fall(212, 46, true, 'a', 14, 0, 3.2)}${fall(226, 52, false, 'a', 16, -6, 2.8)}${fall(198, 40, true, 'b', 15, -10.5, 3.8)}
${fall(232, 34, false, 'b', 17, -3, 3.4)}${fall(190, 56, true, 'a', 18, -13, 4)}${fall(218, 30, false, 'a', 19, -8.5, 3)}
</g>
<path class="rs-sk-tint" d="M0 0H400V230H0ZM171 15V63H239V15Z" fill-rule="evenodd"/>`,
    glow: `
<defs>
  <clipPath id="rs-sakura-panes"><path d="M171 15h32.8v22.8H171zM206.2 15H239v22.8h-32.8zM171 40.2h32.8V63H171zM206.2 40.2H239V63h-32.8z"/></clipPath>
  <radialGradient id="rs-sakura-lg"><stop offset="0" stop-color="#ffd27e" stop-opacity=".7"/><stop offset="1" stop-color="#ffb05a" stop-opacity="0"/></radialGradient>
</defs>
<g class="rs-sk-kn" clip-path="url(#rs-sakura-panes)">
  <g class="rs-sk-halo">${LANTERNS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="url(#rs-sakura-lg)"/>`).join('')}</g>
  ${lantern(true)}
  <g stroke="#ffd27e" stroke-width=".6" stroke-linecap="round" opacity=".55">${LANTERNS.map(([x]) => `<path d="M${x - 1.4} 55.6h2.8M${x - 1} 57.6h2M${x - .6} 59.6h1.2"/>`).join('')}</g>
</g>`,
  };
}
