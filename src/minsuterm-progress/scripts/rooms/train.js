'use strict';
// 방 스타일: 야간열차 침대칸 — 덜컹이는 기차 안, 창밖 풍경이 흘러감 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
{
  const R = '#room[data-room="train"]';
  const K = `${R}.sky-dusk`, N = `${R}.sky-night`, Z = `${R}.night`;
  const X0 = 160; // 창 안쪽 왼쪽 끝(풍경 타일의 0)
  // 풍경 한 겹: 타일을 이어 붙여 왼쪽으로 끝없이 흐르게 한다(기차는 오른쪽으로 달린다)
  const layer = (cls, w, n, inner) => `<g class="${cls}">${Array.from({ length: n }, (_, i) => `<g transform="translate(${X0 + i * w} 0)">${inner}</g>`).join('')}</g>`;
  // 고사리 잎: 휜 잎줄기와 양쪽으로 갈라지는 작은 잎
  const frond = (x0, y0, cx, cy, x1, y1, n, w) => {
    let d = `M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`;
    for (let i = 1; i < n; i++) {
      const t = i / n, u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy), L = Math.hypot(dx, dy);
      const len = w * (1 - t * 0.65);
      for (const g of [1, -1]) d += `M${px.toFixed(1)} ${py.toFixed(1)}l${((-dy / L * g * 0.85 + dx / L * 0.5) * len).toFixed(1)} ${((dx / L * g * 0.85 + dy / L * 0.5) * len).toFixed(1)}`;
    }
    return d;
  };
  const FAR = '<path class="rs-tr-far" d="M0 42C9 41 15 34 24 35S37 41 46 39 57 32 66 33 80 41 90 42V66H0Z"/><path class="rs-tr-far2" d="M0 45.5C11 45 18 40.5 28 41.5S47 45.5 60 43.5 79 41 90 45.5V66H0Z"/>' +
    '<g class="rs-tr-n rs-tr-lt"><circle cx="21" cy="43.6" r=".35"/><circle cx="52.5" cy="44.6" r=".3"/><circle cx="74" cy="43" r=".35"/><circle cx="76" cy="43.4" r=".25"/></g>';
  const house = (x, y, w, h) => `<rect class="rs-tr-house" x="${x}" y="${y}" width="${w}" height="${h}"/><path class="rs-tr-roof" d="M${x - 0.6} ${y + 0.2}L${x + w / 2} ${y - 2.6}L${x + w + 0.6} ${y + 0.2}Z"/><rect class="rs-tr-win" x="${x + w / 2 - 0.5}" y="${y + 1}" width="1" height="1.1"/>`;
  const MID = '<path class="rs-tr-hill" d="M0 48C14 46.6 26 43 40 45.5S66 50.5 90 48V66H0Z"/>' +
    '<path class="rs-tr-f2" d="M0 51.6C10 50.8 20 50.6 31 51.4L34 57.4C22 57 10 57.6 0 58.6Z"/><path class="rs-tr-f1" d="M33.6 51.6C44 51 54 51.8 64 52.8L66.4 58C56 57.4 46 57.6 36 57.8Z"/><path class="rs-tr-f2" d="M66.2 50.8C74 50 82 49.6 90 50.4V56C82 55.8 75 56.2 68.4 56.4Z"/>' +
    '<path class="rs-tr-furrow" d="M1 53.8C11 53 21 52.8 31.6 53.4M1 55.9C12 55.1 22 54.9 32.6 55.5M68 52.6C75 52 83 51.7 90 52.1M68.6 54.4C76 53.9 83 53.7 90 54"/>' +
    '<path class="rs-tr-hedge" d="M0 58.6C10 57.6 22 57 34 57.4M31 51.4L34 57.4M33.6 51.6L36 57.8M36 57.8C46 57.6 56 57.4 66.4 58M64 52.8L66.4 58M66.2 50.8L68.4 56.4M68.4 56.4C75 56.2 82 55.8 90 56"/>' +
    '<g class="rs-tr-house"><ellipse cx="44" cy="55" rx=".9" ry=".55"/><ellipse cx="48.6" cy="54.2" rx=".9" ry=".55"/><ellipse cx="55.4" cy="55.6" rx=".9" ry=".55"/></g>' +
    '<g class="rs-tr-tree"><circle cx="12" cy="43.4" r="2.6"/><rect x="11.6" y="45" width=".8" height="2.6"/><ellipse cx="31" cy="42.8" rx="1.2" ry="3.4"/><circle cx="46.5" cy="46" r="2"/><ellipse cx="84.4" cy="44.4" rx="1.1" ry="3.2"/><ellipse cx="87.2" cy="45" rx="1" ry="2.8"/></g>' +
    house(53.6, 45.4, 5, 5.4) + house(60.6, 46.2, 4, 4.6) + house(74.4, 46.8, 4.4, 4.2) +
    '<rect class="rs-tr-house" x="65.8" y="45.4" width="5" height="5.4"/><path class="rs-tr-roof" d="M65.3 45.6L68.3 43.4 71.3 45.6Z"/><rect class="rs-tr-house" x="70.4" y="42.2" width="2.4" height="8.6"/><path class="rs-tr-roof" d="M70.2 42.4L71.6 38 73 42.4Z"/><rect class="rs-tr-win" x="67.6" y="46.6" width="1" height="1.6"/><rect class="rs-tr-win" x="71.1" y="43.6" width="1" height="1.2"/>';
  const NEAR = '<path class="rs-tr-shadow" d="M19.4 59.2h1.3L31 66h-2.8z"/><rect class="rs-tr-pole" x="19.4" y="13" width="1.3" height="47"/><rect class="rs-tr-pole" x="16.4" y="15.6" width="7.3" height=".9"/>' +
    '<g class="rs-tr-ins"><circle cx="17.2" cy="15.2" r=".45"/><circle cx="22.9" cy="15.2" r=".45"/></g><path class="rs-tr-wire" d="M17.2 15.4Q62.2 21.4 107.2 15.4M22.9 15.4Q67.9 21.4 112.9 15.4"/>' +
    '<path class="rs-tr-ground" d="M0 59C16 58.4 30 58.8 44 58.4S76 58.6 90 59V66H0Z"/><path class="rs-tr-streak" d="M3 61.6h8M19 63.4h10M33 60.8h7M12 65h9M48 62.2h9M62 64.6h8M74 60.6h10"/>';
  const SIG = '<rect class="rs-tr-pole" x="39.4" y="31" width="1.2" height="29"/><rect x="37.9" y="24.6" width="4.2" height="8" rx="1.4" fill="#1b1d22"/><circle cx="40" cy="26.9" r=".95" fill="#5a2222"/><circle class="rs-tr-go" cx="40" cy="30.3" r=".95"/><circle class="rs-tr-n" cx="40" cy="30.3" r="3" fill="url(#rs-train-sg)"/>';
  const CLOUDS = '<g fill="#fff" opacity=".85"><path d="M8 20a2.6 2.6 0 0 1 2.6-2.4 3.6 3.6 0 0 1 6.8.6 2.2 2.2 0 0 1 .5 4.2H8.9A1.5 1.5 0 0 1 8 20z"/><path d="M52 17.6a1.8 1.8 0 0 1 1.9-1.6 2.5 2.5 0 0 1 4.7.4 1.5 1.5 0 0 1 .3 2.9h-6.2a1.1 1.1 0 0 1-.7-1.7z" opacity=".8"/></g>';
  // 창으로 든 빛(가운데 가로대 그림자 포함)과, 그 위를 지나가는 전봇대 그림자
  const PATCH_D = 'M160 122L250 122 244.8 139.9 154.8 139.9ZM154.6 140.5L244.6 140.5 243 146 153 146Z';
  const PATCH_K = 'M160 122L250 122 229.2 150.3 139.2 150.3ZM138.4 151.3L228.4 151.3 222 160 132 160Z';
  const bands = (k) => `<g class="rs-tr-sweep">${[0, 1, 2].map((i) => `<path d="M${170 + i * 90} 122h3l${-k} 38h-3z"/>`).join('')}</g>`;
  // 천장에서 늘어진 커튼 한 쪽(왼쪽; 오른쪽은 거울상): 묶은 커튼과, 잘 때 반쯤 친 커튼
  const CUR_OPEN = '<path d="M145 8H163.6C163 24 158.6 42 153.4 52C156 58 158.4 66 159.6 74H145Z" fill="#4f1f27"/>' +
    '<path d="M149.6 9C149.6 25 149.2 40 148.8 51.6M154.2 9C154 26 152.2 42 150.8 51.8M158.8 9C158.2 26 155.6 42 152.4 52M149 54C149.4 62 149.6 68 150 74M152.6 54C153.8 61 154.8 68 155.6 74" stroke="#3b151c" stroke-width=".9" fill="none"/>' +
    '<path d="M151.9 9C151.8 26 151 42 149.8 51.8M151 54.4C151.8 62 152.4 68 152.8 74" stroke="#6a2c35" stroke-width=".8" fill="none"/>' +
    '<path d="M159.6 74H145" stroke="#c9a25e" stroke-width="1.1" stroke-dasharray=".5 .7"/>' +
    '<path d="M144.6 51C149 50 153 50.3 155.2 52.5 152.8 53.8 148.4 53.6 144.6 52.8Z" fill="#c9a25e"/>' +
    '<g class="rs-tr-tassel"><path d="M154.6 53v3.4" stroke="#c9a25e" stroke-width=".5"/><path d="M154.6 56.2c1 0 1.5.8 1.5 2v2.6h-3v-2.6c0-1.2.5-2 1.5-2z" fill="#d8b46a"/><path d="M153.3 60.8v1.4M154.1 60.8v1.6M154.9 60.8v1.6M155.7 60.8v1.4" stroke="#c9a25e" stroke-width=".35"/></g>';
  const CUR_HALF = '<path d="M145 8H189C188.2 30 188.4 52 189.2 74H145Z" fill="#4f1f27"/>' +
    '<path d="M151 9v65M157.6 9v65M164.2 9v65M170.8 9v65M177.4 9v65M184 9.4c-.4 22-.2 44 .4 64.6" stroke="#3b151c" stroke-width=".9"/><path d="M154.2 9v65M167.4 9v65M180.6 9v65" stroke="#6a2c35" stroke-width=".8"/>' +
    '<path d="M189.2 74H145" stroke="#c9a25e" stroke-width="1.1" stroke-dasharray=".5 .7"/>';
  // 커튼 위 덮개(펠멧)의 물결 아래단: dir -1은 오른쪽에서 왼쪽으로, 1은 왼쪽에서 오른쪽으로
  const SCAL = (dir) => Array.from({ length: 16 }, (_, i) => `c${dir * 3.9} 0 ${dir * 3.9} ${i % 2 ? -2.4 : 2.4} ${dir * 7.8} ${i % 2 ? -2.4 : 2.4}`).join('');
  const both = (s) => `<g>${s}</g><g transform="translate(410 0) scale(-1 1)">${s}</g>`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['train'] = {
    css: `
${R} {
  --wall: #6b2f35; --wall-line: #3e2219; --floor: #283048; --floor-line: #283048;
  --wood: #8a5434; --wood-dark: #693b24; --metal: #c9a25e; --frame: #c9a25e; --sky: #7fb8e6;
  --sheet: #efe5d3; --pillow: #f6efe3; --blanket: #2f4a6b; --blanket-dark: #4e6788;
  --screen: #101520; --laptop: #8b8378; --mug: #c9a25e; --lamp: #ffd28a; --shade: #e7c08a;
  --rs-tr-far: #a3bfd3; --rs-tr-far2: #8badc4; --rs-tr-hill: #7db46c; --rs-tr-f1: #a8d077; --rs-tr-f2: #dccf7c; --rs-tr-hedge: #5d9452;
  --rs-tr-tree: #4f8f57; --rs-tr-house: #f1e6d0; --rs-tr-roof: #c45b45; --rs-tr-win: #6d7f8f; --rs-tr-ground: #6aa35c; --rs-tr-streak: #8cc07c; --rs-tr-pole: #5b4636;
}
${R}[viewBox][role] { --arm: #3f6b5e; --arm-dark: #335a4f; --cushion: #c9a25e; }
${K} {
  --rs-tr-far: #a87c9c; --rs-tr-far2: #8f6789; --rs-tr-hill: #8f7549; --rs-tr-f1: #c49650; --rs-tr-f2: #ddb05c; --rs-tr-hedge: #6a5636;
  --rs-tr-tree: #5a5038; --rs-tr-house: #e6c39f; --rs-tr-roof: #9e4a3c; --rs-tr-win: #ffc96e; --rs-tr-ground: #77653f; --rs-tr-streak: #9a8556; --rs-tr-pole: #3a2a28;
}
${N}, ${Z} {
  --rs-tr-far: #1f2848; --rs-tr-far2: #19203b; --rs-tr-hill: #18242d; --rs-tr-f1: #1d2b31; --rs-tr-f2: #222d30; --rs-tr-hedge: #121b21;
  --rs-tr-tree: #111c22; --rs-tr-house: #252b3a; --rs-tr-roof: #1d2230; --rs-tr-win: #ffd36b; --rs-tr-ground: #141e25; --rs-tr-streak: #1e2a32; --rs-tr-pole: #0d1117;
}
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} rect.wood[x="14"][y="44"], ${R} .pot, ${R} .leaf, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2,
${R} .frame, ${R} .win-bar, ${R} .sky, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star, ${R} .floor-line, ${R} .rug, ${R} .rug-line,
${R} .table-mug > .mug, ${R} .table-mug > .mug-handle, ${R} .table-mug > .steam { display: none; }
${R} .rs-tr-k, ${R} .rs-tr-n, ${R} .rs-tr-z, ${R} .rs-tr-on { display: none; }
${K} .rs-tr-k, ${N} .rs-tr-n, ${Z} .rs-tr-n, ${Z} .rs-tr-z, ${K} .rs-tr-on, ${N}:not(.night) .rs-tr-on { display: inline; }
${K} .rs-tr-d, ${N} .rs-tr-d, ${Z} .rs-tr-d, ${Z} .rs-tr-open { display: none; }
${R} .rs-tr-far { fill: var(--rs-tr-far); } ${R} .rs-tr-far2 { fill: var(--rs-tr-far2); } ${R} .rs-tr-hill { fill: var(--rs-tr-hill); }
${R} .rs-tr-furrow { stroke: var(--rs-tr-hedge); stroke-width: .35; fill: none; opacity: .45; } ${R} .rs-tr-f1 { fill: var(--rs-tr-f1); } ${R} .rs-tr-f2 { fill: var(--rs-tr-f2); } ${R} .rs-tr-hedge { stroke: var(--rs-tr-hedge); stroke-width: .7; fill: none; }
${R} .rs-tr-tree { fill: var(--rs-tr-tree); } ${R} .rs-tr-house { fill: var(--rs-tr-house); } ${R} .rs-tr-roof { fill: var(--rs-tr-roof); } ${R} .rs-tr-win { fill: var(--rs-tr-win); }
${R} .rs-tr-ground { fill: var(--rs-tr-ground); } ${R} .rs-tr-streak { stroke: var(--rs-tr-streak); stroke-width: .6; stroke-linecap: round; }
${R} .rs-tr-pole { fill: var(--rs-tr-pole); } ${R} .rs-tr-wire { stroke: var(--rs-tr-pole); stroke-width: .3; fill: none; } ${R} .rs-tr-ins { fill: #d9dde2; }
${N} .rs-tr-ins, ${Z} .rs-tr-ins { fill: #3a4250; }
${R} .rs-tr-lt { fill: #ffd36b; } ${R} .rs-tr-go { fill: #3fcf7a; }
${R} .rs-tr-shadow { fill: #2a1a14; opacity: 0; } ${K} .rs-tr-shadow { opacity: .28; }
${R} .rs-tr-lp { fill: #ffeec8; opacity: .17; mix-blend-mode: screen; filter: blur(.9px); } ${K} .rs-tr-lp { fill: #ff9a4a; opacity: .26; }
${R} .rs-tr-sweep { fill: #000; opacity: .3; animation: rs-train-sweep 3s linear infinite; }
${K} .rs-tr-curt { filter: brightness(.93); } ${N} .rs-tr-curt, ${Z} .rs-tr-curt { filter: brightness(.7); }
${R} .rs-tr-tint { fill: #fff; mix-blend-mode: multiply; pointer-events: none; }
${K} .rs-tr-tint { fill: url(#rs-train-tk); } ${N} .rs-tr-tint, ${Z} .rs-tr-tint { fill: url(#rs-train-tn); }
${R} .rs-tr-move { animation: rs-train-bob 1.15s ease-in-out infinite; }
${R} .rs-tr-l1 { animation: rs-train-far 70s linear infinite; }
${R} .rs-tr-l2 { animation: rs-train-mid 20s linear infinite; }
${R} .rs-tr-l3 { animation: rs-train-near 3s linear infinite; }
${R} .rs-tr-l4 { animation: rs-train-sig 6s linear infinite; }
${R} .rs-tr-l0 { animation: rs-train-far 150s linear infinite; }
${R} .rs-tr-rattle { animation: rs-train-rattle 1.15s linear infinite; }
${R} .rs-tr-tassel { transform-origin: 154.6px 53px; animation: rs-train-tassel 2.3s ease-in-out infinite; }
${R} .rs-tr-steam { stroke: #d8c8b0; stroke-width: 1; fill: none; stroke-linecap: round; opacity: 0; animation: rs-train-steam 3s ease-in-out infinite; }
${R} .rs-tr-s2 { animation-delay: 1.4s; }
${Z} .rs-tr-l3 { animation-duration: 4.4s; } ${Z} .rs-tr-l4 { animation-duration: 8.8s; }
${Z} #blanketOver .blanket { fill: #1d2c52; } ${Z} #blanketOver .fold { stroke: #2c3c6a; } ${Z} #blanketOver .wood { fill: #4e312b; } ${Z} #blanketOver .wood-dark { fill: #3a2322; }
@keyframes rs-train-far { to { transform: translateX(-90px); } }
@keyframes rs-train-mid { to { transform: translateX(-90px); } }
@keyframes rs-train-near { to { transform: translateX(-90px); } }
@keyframes rs-train-sig { to { transform: translateX(-180px); } }
@keyframes rs-train-sweep { to { transform: translateX(-90px); } }
@keyframes rs-train-bob { 0%, 12%, 50%, 62%, 100% { transform: translateY(0); } 5% { transform: translateY(.45px); } 55% { transform: translateY(.35px); } }
@keyframes rs-train-rattle { 0%, 12%, 50%, 60%, 100% { transform: translate(0, 0); } 4% { transform: translate(.22px, -.12px); } 8% { transform: translate(-.18px, 0); } 54% { transform: translate(.18px, -.1px); } }
@keyframes rs-train-tassel { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes rs-train-steam { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: .5; } 100% { opacity: 0; transform: translateY(-4px); } }
`,
    wall: `
<defs><pattern id="rs-train-vel" width="5" height="10" patternUnits="userSpaceOnUse"><rect width="2.4" height="10" fill="#743540"/></pattern></defs>
<rect x="0" y="4" width="400" height="78" fill="url(#rs-train-vel)" opacity=".55"/>
<rect x="0" y="0" width="400" height="3.4" fill="#4a281c"/><rect x="0" y="3.4" width="400" height=".9" fill="#c9a25e"/>
<rect x="0" y="82" width="400" height="34" fill="#5c3220"/>
<path d="M6 87h40v24H6zM56 87h40v24H56zM106 87h40v24h-40zM156 87h40v24h-40zM206 87h40v24h-40zM256 87h40v24h-40zM306 87h40v24h-40zM356 87h40v24h-40z" fill="#66391f" stroke="#4a2818" stroke-width=".8"/>
<rect x="0" y="81.2" width="400" height="1.6" fill="#c9a25e"/><rect x="0" y="81.2" width="400" height=".5" fill="#e6c98a"/>
<rect x="117.6" y="17.6" width="30.8" height="22.8" rx="1" fill="#b8924f"/><rect x="119.4" y="19.4" width="27.2" height="19.2" fill="#ebdcb8"/>
<path d="M119.4 25c6 1.6 9.6 7 27.2 9.6" stroke="#9cbbd0" stroke-width="1" fill="none"/>
<path d="M122.4 35L127.4 30.6 133 31.6 138 25.8 144 23.4" stroke="#b23a32" stroke-width=".8" fill="none" stroke-linejoin="round"/>
<g fill="#fff" stroke="#3a2a22" stroke-width=".35"><circle cx="122.4" cy="35" r=".75"/><circle cx="127.4" cy="30.6" r=".75"/><circle cx="133" cy="31.6" r=".75"/><circle cx="138" cy="25.8" r=".75"/><circle cx="144" cy="23.4" r=".75"/></g>
<path d="M123.6 33.4h3.6M128.6 29h3M134.2 33.2h3.4M131.4 24.4h4.4M140 27.2h4" stroke="#8a7a66" stroke-width=".45"/>
<rect x="120.6" y="20.6" width="7" height="2.4" fill="none" stroke="#8a7a66" stroke-width=".3"/>
<rect x="17" y="33" width="1.4" height="12.4" fill="#a8843f"/><rect x="105.6" y="33" width="1.4" height="12.4" fill="#a8843f"/>
<circle cx="17.7" cy="45" r="1.3" fill="#c9a25e"/><circle cx="106.3" cy="45" r="1.3" fill="#c9a25e"/>
<rect x="14" y="33.2" width="96" height=".9" fill="#a8843f"/>
<rect x="20" y="21" width="32" height="14.4" rx="1.4" fill="#8a5a32"/><rect x="20" y="24.2" width="32" height=".7" fill="#6e4524"/>
<path d="M32.4 21c0-2.4 1.2-3.3 3.6-3.3s3.6.9 3.6 3.3" stroke="#5e3a1e" stroke-width="1.2" fill="none"/>
<rect x="26.2" y="21" width="2.2" height="14.4" fill="#5e3a1e"/><rect x="43.6" y="21" width="2.2" height="14.4" fill="#5e3a1e"/>
<rect x="25.8" y="26.4" width="3" height="1.8" fill="none" stroke="#d8b46a" stroke-width=".45"/><rect x="43.2" y="26.4" width="3" height="1.8" fill="none" stroke="#d8b46a" stroke-width=".45"/>
<path d="M20 23.4V22.4a1.4 1.4 0 0 1 1.4-1.4h1M52 23.4V22.4a1.4 1.4 0 0 0-1.4-1.4h-1" stroke="#d8b46a" stroke-width=".8" fill="none"/>
<circle cx="35" cy="30" r="2.3" fill="#ecd9a8"/><circle cx="35" cy="30" r="1.6" fill="none" stroke="#b23a32" stroke-width=".45"/>
<rect x="38.6" y="27.6" width="3.8" height="2.6" fill="#bcd8e2" transform="rotate(-8 40.5 28.9)"/>
<rect x="55.4" y="22.6" width="19.2" height="12.8" rx=".8" fill="#e6d8b8"/>
<path d="M58.4 25.6v9.8M62.2 25.6v9.8M66 25.6v9.8M69.8 25.6v9.8M73.6 25.6v9.8" stroke="#7fa6a0" stroke-width="1.4"/>
<rect x="54.8" y="22.2" width="20.4" height="3.4" rx=".8" fill="#c9b48b"/><path d="M65 22.2v3.4" stroke="#a8843f" stroke-width=".8"/>
<path d="M86.4 24.8c0-4 2.2-5.6 4.8-5.6s4.8 1.6 4.8 5.6M90 24.8c0-3.4 1.8-4.8 4-4.8s4 1.4 4 4.8" stroke="#3e2a1e" stroke-width=".9" fill="none"/>
<path d="M79 35.4c-.6-4.4.4-8.4 3-10.6h20c2.6 2.2 3.6 6.2 3 10.6z" fill="#6b3b5a"/>
<path d="M80.4 29.2h24M80 32.4h25" stroke="#c9a25e" stroke-width=".5" stroke-dasharray="1.4 1.4" opacity=".8"/>
<rect x="81.6" y="24" width="21.2" height="1.4" rx=".6" fill="#c9a25e"/>
<rect x="14" y="35.2" width="96" height="1.7" rx=".8" fill="#c9a25e"/><rect x="14" y="35.3" width="96" height=".5" fill="#ecd08f"/>
<path d="M14 37v3.4M110 37v3.4" stroke="#a8843f" stroke-width=".7"/>
<path d="M14 40.4h96" stroke="#a8843f" stroke-width=".9"/>
<path d="${Array.from({ length: 24 }, (_, i) => `M${14 + i * 4} 37l4 3.4M${18 + i * 4} 37l-4 3.4`).join('')}" stroke="#a8843f" stroke-width=".35" opacity=".75"/>
<path d="M338.6 51.4c0-4.4 1.4-7 4.4-8" stroke="#a8843f" stroke-width="1" fill="none"/><ellipse cx="338.4" cy="52.4" rx="1.4" ry="2.2" fill="#c9a25e"/>
<rect x="341.6" y="40.6" width="3" height="1.6" rx=".5" fill="#c9a25e"/><path d="M341 42h4.2l2.6 6.4c-2.8.9-7.2.9-10 0z" fill="#e9d8b6"/>`,
    view: `
<defs>
  <clipPath id="rs-train-glass"><rect x="160" y="12" width="90" height="54" rx="7"/></clipPath>
  <linearGradient id="rs-train-sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78b2e2"/><stop offset="1" stop-color="#d7edf8"/></linearGradient>
  <linearGradient id="rs-train-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f4580"/><stop offset=".5" stop-color="#d9786a"/><stop offset="1" stop-color="#ffc27a"/></linearGradient>
  <linearGradient id="rs-train-sn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset="1" stop-color="#26325f"/></linearGradient>
  <radialGradient id="rs-train-sg"><stop offset="0" stop-color="#5dffa0" stop-opacity=".7"/><stop offset="1" stop-color="#5dffa0" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-train-sun"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".9"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
</defs>
<rect x="153" y="5" width="104" height="68" rx="11" fill="#4f2a1b"/><rect x="155.4" y="7.4" width="99.2" height="63.2" rx="9.4" fill="#6a3a24"/>
<g clip-path="url(#rs-train-glass)">
  <rect class="rs-tr-d" x="158" y="10" width="94" height="58" fill="url(#rs-train-sd)"/>
  <rect class="rs-tr-k" x="158" y="10" width="94" height="58" fill="url(#rs-train-sk)"/>
  <rect class="rs-tr-n" x="158" y="10" width="94" height="58" fill="url(#rs-train-sn)"/>
  <g class="rs-tr-n" fill="#fff"><circle cx="168" cy="16" r=".4"/><circle cx="183" cy="20.4" r=".35"/><circle cx="197" cy="15" r=".45"/><circle cx="214" cy="19.6" r=".3"/><circle cx="172" cy="29" r=".3"/><circle cx="204" cy="30" r=".35"/><circle cx="246" cy="31" r=".3"/></g>
  <g class="rs-tr-n"><circle cx="235" cy="18" r="7" fill="url(#rs-train-sun)" opacity=".35"/><circle cx="235" cy="18" r="3.6" fill="#fbf0cf"/><circle cx="236.6" cy="16.8" r="3.2" fill="#152049"/></g>
  <g class="rs-tr-k"><circle cx="214" cy="41" r="14" fill="url(#rs-train-sun)"/><circle cx="214" cy="41" r="5" fill="#ffd27e"/></g>
  <circle class="rs-tr-d" cx="238" cy="17.5" r="4" fill="#fff3c4"/>
  <g class="rs-tr-move">
    <g class="rs-tr-d">${layer('rs-tr-l0', 90, 2, CLOUDS)}</g>
    ${layer('rs-tr-l1', 90, 2, FAR)}
    ${layer('rs-tr-l2', 90, 2, MID)}
    ${layer('rs-tr-l4', 180, 2, SIG)}
    ${layer('rs-tr-l3', 90, 2, NEAR)}
  </g>
  <path d="M169 66L190 12h6.5L175.5 66zM181 66L202 12h2.4L183.4 66z" fill="#fff" opacity=".06"/>
</g>
<rect x="160" y="12" width="90" height="54" rx="7" fill="none" stroke="#c9a25e" stroke-width="1.8"/>
<rect x="160.9" y="24.2" width="88.2" height="1.6" fill="#c9a25e"/><rect x="198" y="25.2" width="14" height="2" rx="1" fill="#a8843f"/>
<rect x="193" y="68.6" width="24" height="3" rx=".6" fill="#c9a25e"/><path d="M195.4 69.7h19.2M197 70.9h16" stroke="#7a5c2e" stroke-width=".35"/>`,
    floor: `
<defs><pattern id="rs-train-cp" width="10" height="7" patternUnits="userSpaceOnUse"><path d="M5 1.1l2.1 2.4L5 5.9 2.9 3.5z" fill="#313b58"/><circle cx="5" cy="3.5" r=".45" fill="#8a7448"/><circle cx="0" cy="0" r=".4" fill="#3b4566"/><circle cx="10" cy="0" r=".4" fill="#3b4566"/><circle cx="0" cy="7" r=".4" fill="#3b4566"/><circle cx="10" cy="7" r=".4" fill="#3b4566"/></pattern>
  <clipPath id="rs-train-pd"><path d="${PATCH_D}"/></clipPath><clipPath id="rs-train-pk"><path d="${PATCH_K}"/></clipPath></defs>
<rect x="0" y="125" width="400" height="105" fill="url(#rs-train-cp)"/>
<rect x="0" y="120" width="400" height="5" fill="#5a2630"/><path d="M0 121h400M0 124.2h400" stroke="#9a7c45" stroke-width=".5"/>
<linearGradient id="rs-train-fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient><rect x="0" y="125" width="400" height="105" fill="url(#rs-train-fd)"/>
<g class="rs-tr-d"><path class="rs-tr-lp" d="${PATCH_D}"/><g clip-path="url(#rs-train-pd)">${bands(7)}</g></g>
<g class="rs-tr-k"><path class="rs-tr-lp" d="${PATCH_K}"/><g clip-path="url(#rs-train-pk)">${bands(18)}</g></g>`,
    props: `
<defs>
  <radialGradient id="rs-train-tk" gradientUnits="userSpaceOnUse" cx="205" cy="40" r="240"><stop offset="0" stop-color="#fff2e2"/><stop offset=".5" stop-color="#f4d6bd"/><stop offset="1" stop-color="#ddb299"/></radialGradient>
  <radialGradient id="rs-train-tn" gradientUnits="userSpaceOnUse" cx="310" cy="58" r="260"><stop offset="0" stop-color="#fff0da"/><stop offset=".2" stop-color="#ecdcc9"/><stop offset=".55" stop-color="#b7afc4"/><stop offset="1" stop-color="#8d88a6"/></radialGradient>
</defs>
<path d="M276.2 61h17.6" stroke="#c9a25e" stroke-width="1.4" stroke-dasharray=".5 .6"/>
<rect x="32.4" y="89" width="15.2" height="1.2" rx=".5" fill="#a8843f"/><circle cx="32.6" cy="89.6" r="1.1" fill="#c9a25e"/><circle cx="47.4" cy="89.6" r="1.1" fill="#c9a25e"/>
<path d="${frond(39.2, 87, 32, 78, 27, 80.6, 9, 2.6)}${frond(39.6, 86.8, 37.6, 77, 34.6, 72.4, 9, 2.4)}${frond(40.4, 86.8, 43.6, 77, 47.2, 73.4, 9, 2.4)}" stroke="#4f8d4d" stroke-width=".75" fill="none" stroke-linecap="round"/>
<path d="${frond(40.8, 87.2, 48.6, 80, 50.6, 82.6, 8, 2.2)}${frond(39, 87.4, 31, 84.4, 28.6, 88.4, 7, 2)}${frond(40, 86.8, 40.8, 80.4, 41.4, 76.6, 7, 2)}" stroke="#68a862" stroke-width=".75" fill="none" stroke-linecap="round"/>
<path d="M35.6 87.6h8.8l-.7 6.4c0 .3-.3.5-.6.5h-6.2c-.3 0-.6-.2-.6-.5z" fill="#c9a25e"/><path d="M40.6 87.6h3.8l-.7 6.4c0 .3-.3.5-.6.5h-2.5z" fill="#a8843f"/>
<rect x="35" y="86.8" width="10" height="1.4" rx=".6" fill="#d8b46a"/><rect x="35.4" y="89.3" width="9.2" height="1" fill="#8c6c32"/>
<g class="table-mug"><g class="rs-tr-rattle">
  <path class="rs-tr-steam" d="M254.6 81.4q-1.6-2.4 0-4.8t0-4.8"/><path class="rs-tr-steam rs-tr-s2" d="M258.2 81.4q-1.6-2.4 0-4.8t0-4.8"/>
  <path d="M258.8 92.4l2.9-11" stroke="#c7c9cc" stroke-width=".7" stroke-linecap="round"/><ellipse cx="261.8" cy="80.8" rx=".7" ry="1" fill="#c7c9cc"/>
  <rect x="252.3" y="83.4" width="8.4" height="8" fill="#f4efe4" opacity=".35"/><rect x="252.7" y="85.2" width="7.6" height="6.2" fill="#b4601f" opacity=".92"/>
  <ellipse cx="256.5" cy="85.2" rx="3.8" ry=".5" fill="#cf7a32"/><path d="M253.6 85.4a1.5 1.5 0 0 1 3 0z" fill="#f2d45a"/><path d="M253.9 85.4a1.2 1.2 0 0 1 2.4 0" stroke="#fff6c8" stroke-width=".3" fill="none"/>
  <path d="M252.3 83.4h8.4" stroke="#fff" stroke-width=".4" opacity=".6"/><path d="M253.1 84.2v6.6" stroke="#fff" stroke-width=".45" opacity=".45"/>
  <path d="M251.4 90.2h10.2l-.6 7.6h-9z" fill="#b9b6ab"/><path d="M256.5 90.2h5.1l-.6 7.6h-4.5z" fill="#a19e93"/>
  <path d="M252.8 95.8v-2.2a1 1 0 0 1 2 0v2.2zM255.8 95.8v-2.2a1 1 0 0 1 2 0v2.2zM258.7 95.8v-2.2a1 1 0 0 1 2 0v2.2z" fill="#8a4a1c"/>
  <rect x="251.3" y="90" width="10.4" height=".9" fill="#d3d0c6"/>
  <path d="M261.5 91.4c2.6 0 3.5 1 3.5 2.9s-.9 2.9-3.5 2.9" stroke="#b9b6ab" stroke-width="1.1" fill="none"/>
  <rect x="250.6" y="97.6" width="11.8" height="1.2" rx=".4" fill="#a19e93"/><rect x="251.8" y="98.8" width="9.4" height="1.2" fill="#8f8c82"/>
</g></g>
<path class="rs-tr-tint" d="M0 0H400V230H0ZM160 19V59a7 7 0 0 0 7 7H243a7 7 0 0 0 7-7V19a7 7 0 0 0-7-7H167a7 7 0 0 0-7 7Z" fill-rule="evenodd"/>
<g class="rs-tr-curt">
<g class="rs-tr-open">${both(CUR_OPEN)}</g>
<g class="rs-tr-z">${both(CUR_HALF)}</g>
<path d="M143 3.8H267V10${SCAL(-1)}z" fill="#5a2129"/>
<path d="M143 4.6h124" stroke="#c9a25e" stroke-width=".8"/>
<path d="M143 10.8${SCAL(1)}" stroke="#c9a25e" stroke-width="1.1" stroke-dasharray=".5 .7" fill="none"/>
</g>`,
    glow: `
<defs>
  <radialGradient id="rs-train-lg"><stop offset="0" stop-color="#ffd890" stop-opacity=".55"/><stop offset="1" stop-color="#ffc66a" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-train-bl"><stop offset="0" stop-color="#7fa6ff" stop-opacity=".32"/><stop offset="1" stop-color="#5c7cff" stop-opacity="0"/></radialGradient>
</defs>
<g class="rs-tr-on"><circle cx="343" cy="50" r="22" fill="url(#rs-train-lg)"/><path d="M341 42h4.2l2.6 6.4c-2.8.9-7.2.9-10 0z" fill="#fff1cc"/><ellipse cx="343" cy="48.6" rx="4.6" ry=".9" fill="#fffbe8"/></g>
<g class="rs-tr-z"><ellipse cx="205" cy="40" rx="150" ry="70" fill="url(#rs-train-bl)"/><path d="M199.6 0h10.8c0 2.2-2.4 3.4-5.4 3.4S199.6 2.2 199.6 0z" fill="#8fb2ff"/><path d="M201.6 1.2h6.8" stroke="#d6e3ff" stroke-width=".6"/></g>`,
  };
}
