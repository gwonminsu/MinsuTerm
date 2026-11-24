'use strict';
// 방 스타일: 등대 꼭대기 — 바다를 내려다보는 둥근 등대 방 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
{
  const R = '#room[data-room="lighthouse"]';
  const K = `${R}.sky-dusk`, N = `${R}.sky-night`, Z = `${R}.night`;
  const f = (v) => +v.toFixed(1);
  // 둥근 벽: 가운데가 가장 멀어 철판 이음매가 가장자리로 갈수록 촘촘해진다. 가로 이음매는 가운데가 처진 곡선
  const SEAMS = [15, 30, 45, 60].flatMap((a) => [200 - 215 * Math.sin((a * Math.PI) / 180), 200 + 215 * Math.sin((a * Math.PI) / 180)]).map(f);
  const ceil = (x) => 3 + 16 * (x / 400) * (1 - x / 400);
  const seamV = SEAMS.map((x) => `M${x} ${f(ceil(x))}V116`).join('');
  const rivV = SEAMS.map((x) => `M${f(x - 1.7)} ${f(ceil(x) + 3)}V114M${f(x + 1.7)} ${f(ceil(x) + 3)}V114`).join('');
  const hcurve = (dy) => `M0 ${44 + dy}Q200 ${56 + dy} 400 ${44 + dy}`;
  // 창으로 든 빛(창살 그림자 포함)
  const PATCH_D = 'M171 122L203.8 122 201 133.4 168.2 133.4ZM206.2 122L239 122 236.2 133.4 203.3 133.4ZM167.8 134.6L200.7 134.6 197.8 146 165 146ZM203 134.6L235.8 134.6 233 146 200.2 146Z';
  const PATCH_K = 'M171 122L203.8 122 191.5 140.1 158.7 140.1ZM206.2 122L239 122 226.7 140.1 193.8 140.1ZM157.3 141.9L190.2 141.9 177.8 160 145 160ZM192.5 141.9L225.3 141.9 213 160 180.2 160Z';
  // 물결 한 줄(흰 물마루): y, 크기, 간격, 줄 번호. 길이와 간격은 줄마다 조금씩 어긋난다
  const fr = (v) => v - Math.floor(v);
  const waves = (y, k, gap, r) => {
    let d = '';
    for (let i = 0; i * gap < 80; i++) {
      const x = 164 + (i + 0.7 * fr(i * 0.618 + r * 0.37)) * gap, len = (1.4 + 2.2 * fr(i * 0.41 + r * 0.73)) * k;
      d += `M${f(x)} ${f(y + 0.6 * k * fr(i * 0.29 + r))}q${f(len / 2)} ${f(-0.45 * k)} ${f(len)} 0`;
    }
    return d;
  };
  const ROWS = [[35.6, 0.5, 6, 0], [37.4, 0.6, 7, 1], [41.6, 0.8, 8, 2], [44.6, 1, 9, 3], [48.6, 1.2, 10, 4], [53.4, 1.45, 12, 5], [58.8, 1.7, 13, 6]];
  // 다육이 잎(끝이 뾰족한 잎): 밑동, 길이, 각도, 너비
  const leaf = (x, y, len, deg, w, cls) => {
    const a = (deg * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux;
    const tx = x + ux * len, ty = y + uy * len, mx = x + ux * len * 0.45, my = y + uy * len * 0.45;
    return `<path class="${cls}" d="M${f(x)} ${f(y)}Q${f(mx + nx * w)} ${f(my + ny * w)} ${f(tx)} ${f(ty)}Q${f(mx - nx * w)} ${f(my - ny * w)} ${f(x)} ${f(y)}Z"/>`;
  };
  const gull = (cls, x, y, k) => `<g class="${cls}"><g transform="translate(${x} ${y}) scale(${k})"><path class="rs-lh-wing" d="M-3 .2Q-1.6-1.4 0 0Q1.6-1.4 3 .2"/></g></g>`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['lighthouse'] = {
    css: `
${R} {
  --wall: #e8edf0; --wall-line: #c3cdd3; --floor: #8e99a3; --floor-line: #7a8690;
  --wood: #a87a4e; --wood-dark: #855a32; --metal: #b9975a; --frame: #2f4f4a; --sky: #8cc8ef;
  --sheet: #f4f6f7; --pillow: #ffffff; --blanket: #c8453c; --blanket-dark: #a63630;
  --screen: #10161f; --laptop: #a3acb5; --mug: #f4f4f0; --lamp: #ffd98a; --shade: #2f5a50;
  --rs-lh-sea: #3f82b8; --rs-lh-sea2: #2f6ea6; --rs-lh-crest: #d9ecf7; --rs-lh-rock: #5d6670; --rs-lh-rock2: #48515b;
}
${R}[viewBox][role] { --rug: #2f4f7a; --rug-line: #e6ebef; --arm: #35567d; --arm-dark: #2b4767; --cushion: #d9d2c0; }
${K} { --rs-lh-sea: #c98a58; --rs-lh-sea2: #b07e58; --rs-lh-crest: #ffe2a6; --rs-lh-rock: #4a3c44; --rs-lh-rock2: #3a2f38; }
${N}, ${Z} { --rs-lh-sea: #142443; --rs-lh-sea2: #101e3a; --rs-lh-crest: #3c557e; --rs-lh-rock: #1a222e; --rs-lh-rock2: #121822; }
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} rect.wood[x="14"][y="44"], ${R} .pot, ${R} .leaf, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2,
${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
${R} .table-mug > .mug, ${R} .table-mug > .mug-handle, ${R} .table-mug > .steam { display: none; }
${R} .win-bar { stroke-width: 3; }
${R} .rs-lh-k, ${R} .rs-lh-n, ${R} .rs-lh-kn, ${R} .rs-lh-on { display: none; }
${K} .rs-lh-k, ${K} .rs-lh-kn, ${N} .rs-lh-n, ${N} .rs-lh-kn, ${Z} .rs-lh-n, ${Z} .rs-lh-kn, ${K} .rs-lh-on, ${N}:not(.night) .rs-lh-on { display: inline; }
${K} .rs-lh-d, ${N} .rs-lh-d, ${Z} .rs-lh-d, ${N} .rs-lh-dk, ${Z} .rs-lh-dk { display: none; }
${R} .rs-lh-sea { fill: var(--rs-lh-sea); } ${R} .rs-lh-sea2 { fill: var(--rs-lh-sea2); }
${R} .rs-lh-crest { stroke: var(--rs-lh-crest); fill: none; stroke-linecap: round; }
${R} .rs-lh-foam { fill: #f2f9fc; } ${N} .rs-lh-foam, ${Z} .rs-lh-foam { fill: #6f86a8; } ${K} .rs-lh-foam { fill: #fde6c4; }
${R} .rs-lh-rock { fill: var(--rs-lh-rock); } ${R} .rs-lh-rock2 { fill: var(--rs-lh-rock2); }
${R} .rs-lh-wing { stroke: #fff; stroke-width: .7; fill: none; stroke-linecap: round; stroke-linejoin: round; transform-box: fill-box; transform-origin: center; animation: rs-lighthouse-flap 1.6s ease-in-out infinite; }
${K} .rs-lh-wing { stroke: #4a3346; }
${R} .rs-lh-g1 { animation: rs-lighthouse-glide 26s linear infinite; } ${R} .rs-lh-g2 { animation: rs-lighthouse-glide 34s linear -14s infinite; }
${R} .rs-lh-r1 { animation: rs-lighthouse-roll 5s ease-in-out infinite; } ${R} .rs-lh-r2 { animation: rs-lighthouse-roll 6.5s ease-in-out -2s infinite reverse; }
${R} .rs-lh-surf { animation: rs-lighthouse-surf 4.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
${R} .rs-lh-glit { animation: rs-lighthouse-glit 2.2s ease-in-out infinite; } ${R} .rs-lh-glit2 { animation-delay: -1.1s; }
${R} .rs-lh-ship { animation: rs-lighthouse-ship 120s linear -52s infinite; }
${R} .rs-lh-lp { fill: #fffbe8; opacity: .34; filter: blur(.6px); } ${K} .rs-lh-lp { fill: #ffbe6a; opacity: .4; }
${R} .rs-lh-tint { fill: #fff; mix-blend-mode: multiply; pointer-events: none; }
${K} .rs-lh-tint { fill: url(#rs-lighthouse-tk); } ${N} .rs-lh-tint, ${Z} .rs-lh-tint { fill: url(#rs-lighthouse-tn); }
${R} .rs-lh-beam { transform-origin: 205px 4px; animation: rs-lighthouse-sweep 9s linear infinite; }
${R} .rs-lh-wash { animation: rs-lighthouse-wash 9s linear infinite; }
${K} .rs-lh-beams { opacity: .45; } ${K} .rs-lh-wash { display: none; }
${R} .rs-lh-steam { stroke: #b9c2c8; stroke-width: 1; fill: none; stroke-linecap: round; opacity: 0; animation: rs-lighthouse-steam 3s ease-in-out infinite; }
${R} .rs-lh-st2 { animation-delay: 1.4s; }
${R} .rs-lh-s0 { fill: #73a58e; } ${R} .rs-lh-s1 { fill: #8fbfa6; } ${R} .rs-lh-s2 { fill: #b0d6c0; }
${R} .rs-lh-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: rs-lighthouse-flame 2.4s ease-in-out infinite; }
${Z} #blanketOver .blanket { fill: #66272e; } ${Z} #blanketOver .fold { stroke: #551e25; } ${Z} #blanketOver .wood { fill: #574439; } ${Z} #blanketOver .wood-dark { fill: #43332c; }
@keyframes rs-lighthouse-flap { 0%, 60%, 100% { transform: scaleY(1); } 75% { transform: scaleY(-.5); } }
@keyframes rs-lighthouse-glide { 0% { transform: translate(-30px, 2px); } 50% { transform: translate(40px, -2px); } 100% { transform: translate(110px, 1px); } }
@keyframes rs-lighthouse-roll { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2.4px); } }
@keyframes rs-lighthouse-surf { 0%, 100% { transform: scaleY(.55); opacity: .55; } 45% { transform: scaleY(1.15); opacity: 1; } }
@keyframes rs-lighthouse-glit { 0%, 100% { opacity: .9; } 50% { opacity: .35; } }
@keyframes rs-lighthouse-ship { from { transform: translateX(-40px); } to { transform: translateX(80px); } }
@keyframes rs-lighthouse-sweep { 0% { transform: rotate(78deg); opacity: 0; } 5% { opacity: 1; } 33% { opacity: 1; } 38%, 100% { transform: rotate(-78deg); opacity: 0; } }
@keyframes rs-lighthouse-wash { 0% { transform: translateX(-80px); opacity: 0; } 6% { opacity: 1; } 32% { opacity: 1; } 38%, 100% { transform: translateX(500px); opacity: 0; } }
@keyframes rs-lighthouse-steam { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: .55; } 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes rs-lighthouse-flame { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(.92, 1.08); } }
`,
    wall: `
<defs><linearGradient id="rs-lighthouse-cv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c4458" stop-opacity=".2"/><stop offset=".3" stop-color="#2c4458" stop-opacity="0"/><stop offset=".7" stop-color="#2c4458" stop-opacity="0"/><stop offset="1" stop-color="#2c4458" stop-opacity=".2"/></linearGradient></defs>
<path d="${seamV}" stroke="#cfd7dc" stroke-width=".8"/><path d="${SEAMS.map((x) => `M${f(x + 0.7)} ${f(ceil(x))}V116`).join('')}" stroke="#f7f9fa" stroke-width=".6"/>
<path d="${rivV}" stroke="#bcc6cc" stroke-width="1.15" stroke-linecap="round" stroke-dasharray="0 5"/>
<path d="${hcurve(0)}" stroke="#cfd7dc" stroke-width=".8" fill="none"/><path d="${hcurve(0.7)}" stroke="#f7f9fa" stroke-width=".6" fill="none"/>
<path d="${hcurve(-1.8)}M0 ${45.8}Q200 57.8 400 45.8" stroke="#bcc6cc" stroke-width="1.15" stroke-linecap="round" stroke-dasharray="0 5" fill="none"/>
<rect x="0" y="0" width="400" height="120" fill="url(#rs-lighthouse-cv)"/>
<path d="M0 0H400V3Q200 11 0 3Z" fill="#3b4952"/><path d="M0 3Q200 11 400 3" stroke="#b9975a" stroke-width="1" fill="none"/>
<rect x="12" y="44" width="58" height="2.6" rx=".8" fill="#a87a4e"/><rect x="12" y="45.9" width="58" height=".7" fill="#855a32"/>
<path d="M18 46.6h3.4c-2 .6-3 2.2-3.4 4.6zM64 46.6h-3.4c2 .6 3 2.2 3.4 4.6z" fill="#855a32"/>
<path d="M16.6 44h17l-1.2-1.6h-14.6z" fill="#7a5130"/>
<path d="M18 36.4h13.4a3 3 0 0 1 3 3v.6a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3v-.6a3 3 0 0 1 3-3z" fill="#d9ecf0" opacity=".75"/>
<path d="M34.2 38.4h2.6v3.2h-2.6z" fill="#cfe4e9" opacity=".8"/><rect x="36.8" y="38.2" width="1.8" height="3.6" rx=".5" fill="#b58a5c"/>
<path d="M16.4 41.6c3-.9 6-1 9-.4 2.4.5 5 .4 7.6-.2v1.4H16.2z" fill="#3f7fb0"/>
<path d="M20.4 40.8h9l-1 1.2h-7z" fill="#6b4226"/><path d="M23.4 40.8v-4.2M26.6 40.8v-3.6" stroke="#6b4226" stroke-width=".4"/>
<path d="M23.2 37l-2.4 3.2h2.4zM23.8 36.8v3.4h2.4zM26.8 37.4l2 2.8h-2z" fill="#fbf6ea"/><path d="M23.4 36.6l1.2-.5-1.2-.3z" fill="#c8453c"/>
<path d="M18.6 37.2h11.6" stroke="#fff" stroke-width=".55" opacity=".8" stroke-linecap="round"/>
<path d="M48.4 33.6L43 42.4M48.4 33.6l5.4 8.8M43 42.4a8 8 0 0 0 10.8 0" stroke="#b9975a" stroke-width=".9" fill="none" stroke-linejoin="round"/>
<path d="M48.4 33.6l2.4 9.4" stroke="#8e6f38" stroke-width=".7"/><rect x="44.4" y="36.6" width="6.6" height="1.5" rx=".5" fill="#8e6f38"/><circle cx="48.4" cy="33.6" r=".9" fill="#d8b46a"/><rect x="46.6" y="39" width="1.6" height="1.8" fill="#bfe0ea"/>
<rect x="55.4" y="40.2" width="13" height="3.8" rx=".6" fill="#2f5a50"/><rect x="56" y="40.8" width="12.2" height="2.6" fill="#efe8d6"/><rect x="55.4" y="40.2" width="13" height="1" rx=".4" fill="#2f5a50"/>
<rect x="57" y="35.6" width="10.4" height="4.6" rx=".5" fill="#7a3b2e"/><rect x="57.6" y="36.4" width="9.2" height="3.4" fill="#f2ecdc"/><path d="M62.2 36.4v3.4" stroke="#7a3b2e" stroke-width=".5"/><path d="M58.4 37.4h3M58.4 38.6h2.4M63 37.4h3M63 38.6h2.2" stroke="#9aa3ab" stroke-width=".3"/>
<ellipse cx="95.2" cy="39.6" rx="12" ry="12" fill="#2c4458" opacity=".12"/>
<circle cx="94" cy="26" r="1.1" fill="#3b4952"/>
<circle cx="94" cy="38" r="8.85" fill="none" stroke="#f7f7f4" stroke-width="5.4"/>
<circle cx="94" cy="38" r="8.85" fill="none" stroke="#d2423a" stroke-width="5.4" stroke-dasharray="6.95 6.95" transform="rotate(22.5 94 38)"/>
<circle cx="94" cy="38" r="6.3" fill="none" stroke="#2c4458" stroke-width=".5" opacity=".25"/><path d="M87 32.4a9.6 9.6 0 0 1 10.4-3.6" stroke="#fff" stroke-width=".8" fill="none" opacity=".6"/>
<path d="M102.2 29.8q4.4 4 3.6 8.2M105.8 38q.8 4.4-3.6 8.2M85.8 46.2q-4.4-4-3.6-8.2M82.2 38q-.8-4.4 3.6-8.2" stroke="#d9c9a3" stroke-width=".8" fill="none"/>
<g fill="#cdbb92"><rect x="101.4" y="28.6" width="1.6" height="2.6" rx=".4" transform="rotate(45 102.2 29.9)"/><rect x="101.4" y="44.8" width="1.6" height="2.6" rx=".4" transform="rotate(-45 102.2 46.1)"/><rect x="85" y="44.8" width="1.6" height="2.6" rx=".4" transform="rotate(45 85.8 46.1)"/><rect x="85" y="28.6" width="1.6" height="2.6" rx=".4" transform="rotate(-45 85.8 29.9)"/></g>
<circle cx="139" cy="31" r="6.4" fill="#b9975a"/><circle cx="139" cy="31" r="5.2" fill="#f7f4ea"/>
<circle cx="139" cy="31" r="4.3" fill="none" stroke="#3b4952" stroke-width=".9" stroke-dasharray=".35 1.9"/><path d="M139 31v-3.2M139 31l2.2 1.2" stroke="#2a333a" stroke-width=".6" stroke-linecap="round"/><circle cx="139" cy="31" r=".5" fill="#2a333a"/>
<path d="M330 30.6v3.6h3.4" stroke="#3b4952" stroke-width="1" fill="none"/><rect x="328.8" y="29.6" width="2.4" height="2.4" rx=".5" fill="#3b4952"/>
<path d="M329.8 34.2c-4 0-5 3.2-5 5.6M329.8 34.2c4 0 5 3.2 5 5.6" stroke="#58616a" stroke-width=".5" fill="none"/>
<path d="M326.6 38.6h6.4l-.8 1.6h-4.8z" fill="#b8342d"/><ellipse cx="329.8" cy="44.6" rx="3.4" ry="4.4" fill="#f2e6c8" opacity=".85"/>
<path d="M326.4 41.2v6.8M333.2 41.2v6.8" stroke="#b8342d" stroke-width=".7"/><rect x="325.8" y="48.4" width="8" height="3.2" rx="1" fill="#c8453c"/><rect x="327" y="51.6" width="5.6" height=".8" fill="#9e2f29"/>`,
    view: `
<defs>
  <clipPath id="rs-lighthouse-win"><rect x="171" y="15" width="68" height="48" rx="1.5"/></clipPath>
  <linearGradient id="rs-lighthouse-sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#83c2ec"/><stop offset="1" stop-color="#e2f2fa"/></linearGradient>
  <linearGradient id="rs-lighthouse-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c5a96"/><stop offset=".55" stop-color="#ee9a76"/><stop offset="1" stop-color="#ffd590"/></linearGradient>
  <linearGradient id="rs-lighthouse-sn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset="1" stop-color="#1d2b55"/></linearGradient>
  <linearGradient id="rs-lighthouse-hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="rs-lighthouse-sg"><stop offset="0" stop-color="#ffe8a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#rs-lighthouse-win)">
  <rect class="rs-lh-d" x="171" y="15" width="68" height="19" fill="url(#rs-lighthouse-sd)"/>
  <rect class="rs-lh-k" x="171" y="15" width="68" height="19" fill="url(#rs-lighthouse-sk)"/>
  <rect class="rs-lh-n" x="171" y="15" width="68" height="19" fill="url(#rs-lighthouse-sn)"/>
  <g class="rs-lh-d" fill="#fff" opacity=".9"><path d="M176 22.6a2.4 2.4 0 0 1 2.4-2.2 3.2 3.2 0 0 1 6 .6 2 2 0 0 1 .5 3.9h-8.1a1.4 1.4 0 0 1-.8-2.3z"/><path d="M222 19.4a1.7 1.7 0 0 1 1.8-1.5 2.3 2.3 0 0 1 4.3.4 1.4 1.4 0 0 1 .3 2.8h-5.8a1 1 0 0 1-.6-1.7z" opacity=".8"/></g>
  <g class="rs-lh-n" fill="#fff"><circle cx="178" cy="19" r=".4"/><circle cx="190" cy="24" r=".35"/><circle cx="199" cy="17.6" r=".45"/><circle cx="214" cy="22" r=".35"/><circle cx="226" cy="17" r=".4"/><circle cx="235" cy="26" r=".3"/><circle cx="183" cy="29" r=".3"/></g>
  <g class="rs-lh-k"><circle cx="222" cy="33.6" r="13" fill="url(#rs-lighthouse-sg)"/><circle cx="222" cy="33.6" r="4.6" fill="#ffd27a"/></g>
  <rect x="171" y="33.6" width="68" height="29.4" class="rs-lh-sea2"/>
  <rect x="171" y="33.6" width="68" height="20" fill="url(#rs-lighthouse-hz)"/>
  <path d="M171 33.6h68" stroke="#fff" stroke-width=".5" opacity=".35"/>
  <g class="rs-lh-k"><path class="rs-lh-glit" d="M219.6 35.4h4.8M218.4 37.4h7.2M217 40h10" stroke="#ffe3a0" stroke-width=".7" stroke-linecap="round"/><path class="rs-lh-glit rs-lh-glit2" d="M215.6 43.4h12.8M214 47.6h16M212.6 52.6h19" stroke="#ffd58a" stroke-width=".8" stroke-linecap="round" stroke-dasharray="3 1.6"/></g>
  <g class="rs-lh-ship">
    <g class="rs-lh-dk"><path d="M186 33.6h9l-1-1.4h-7.4z" fill="#3b4952"/><rect x="188.6" y="30.8" width="3.4" height="1.4" fill="#e9eef1"/><rect x="189.6" y="29.6" width="1" height="1.2" fill="#c8453c"/></g>
    <g class="rs-lh-n"><circle cx="188" cy="31.8" r=".45" fill="#fffbe0"/><circle cx="192.6" cy="30.6" r=".45" fill="#fffbe0"/><circle cx="190.6" cy="33" r=".4" fill="#ff5a4a"/></g>
  </g>
  <g class="rs-lh-n"><circle cx="232" cy="33.2" r=".4" fill="#fffbe0"/><circle cx="233.2" cy="33.4" r=".35" fill="#5dff9a"/><circle cx="176.4" cy="33.3" r=".3" fill="#fffbe0" opacity=".8"/></g>
  <path class="rs-lh-crest rs-lh-r1" stroke-width=".4" d="${ROWS.slice(0, 4).map((r) => waves(...r)).join('')}"/>
  <path class="rs-lh-crest rs-lh-r2" stroke-width=".6" d="${ROWS.slice(4).map((r) => waves(...r)).join('')}"/>
  <path class="rs-lh-rock2" d="M171 55.2l3.4-2.4 3.2.6 2.8 2.6 2.4.4 3.6 3.4 1.8 3.2H171z"/>
  <path class="rs-lh-rock" d="M171 57.6l2.6-1.6 3 .8 2 2.2 2.6.6 2.2 3.4H171z"/><path d="M174.4 52.8l3.2.6 2.8 2.6" stroke="#fff" stroke-width=".4" fill="none" opacity=".25"/>
  <path class="rs-lh-crest" stroke-width=".55" d="M182.4 57.6q1.4-.6 2.6.4M185.6 60.2q1.2-.5 2.2.6M187.8 62.4q1-.4 1.8.4M172.4 54.4q1-.8 2.2-.3"/>
  <g class="rs-lh-surf"><path class="rs-lh-foam" d="M181 55.6c.6-1.6 1.8-2.4 2.8-1.6.8-1.4 2.4-1.2 2.8.4.9-.2 1.6.6 1.4 1.6-.2 1-1 1.6-2 1.4l-3.4-.2c-1 .2-1.8-.6-1.6-1.6z"/><circle class="rs-lh-foam" cx="183.2" cy="52.4" r=".5"/><circle class="rs-lh-foam" cx="186.4" cy="52" r=".4"/><circle class="rs-lh-foam" cx="188.6" cy="53.6" r=".45"/><circle class="rs-lh-foam" cx="180.8" cy="53.8" r=".35"/></g>
  ${gull('rs-lh-g1 rs-lh-dk', 176, 22, 1)}${gull('rs-lh-g2 rs-lh-dk', 168, 27, 0.75)}
</g>
<rect x="169.5" y="13.5" width="71" height="51" rx="2.4" fill="none" stroke="#5d7f77" stroke-width=".95" stroke-linecap="round" stroke-dasharray="0 4.4"/>`,
    floor: `
<path d="M0 142H400M0 172H400M0 202H400" stroke="#a3adb6" stroke-width=".5" transform="translate(0 1)"/>
<path d="M0 144.4H400M0 174.4H400M0 204.4H400M0 139.6H400M0 169.6H400M0 199.6H400M62.4 122V140M57.6 122V140M172.4 144V170M167.6 144V170M302.4 122V140M297.6 122V140M92.4 174V200M87.6 174V200M242.4 174V200M237.6 174V200M342.4 204V230M337.6 204V230M152.4 204V230M147.6 204V230" stroke="#6d7881" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="0 6"/>
<g class="rs-lh-d"><path class="rs-lh-lp" d="${PATCH_D}"/></g><g class="rs-lh-k"><path class="rs-lh-lp" d="${PATCH_K}"/></g>`,
    props: `
<defs>
  <clipPath id="rs-lighthouse-rug"><ellipse cx="200" cy="166" rx="165" ry="17"/></clipPath>
  <radialGradient id="rs-lighthouse-tk" gradientUnits="userSpaceOnUse" cx="205" cy="45" r="240"><stop offset="0" stop-color="#fff4e0"/><stop offset=".5" stop-color="#f7dfbf"/><stop offset="1" stop-color="#e0bf9e"/></radialGradient>
  <radialGradient id="rs-lighthouse-tn" gradientUnits="userSpaceOnUse" cx="290" cy="62" r="260"><stop offset="0" stop-color="#fff2dc"/><stop offset=".18" stop-color="#e6e0dc"/><stop offset=".55" stop-color="#a9b4ca"/><stop offset="1" stop-color="#7d8aa8"/></radialGradient>
</defs>
<g class="rs-lh-k" clip-path="url(#rs-lighthouse-rug)"><path class="rs-lh-lp" d="${PATCH_K}"/></g>
<ellipse cx="200" cy="166" rx="34" ry="5.6" fill="none" stroke="#5a7db0" stroke-width=".8"/><ellipse cx="200" cy="166" rx="30" ry="4.6" fill="none" stroke="#5a7db0" stroke-width=".4" stroke-dasharray=".6 1.4"/>
<path d="M200 157.6l3.4 7.4 24 1-24 1-3.4 7.4-3.4-7.4-24-1 24-1z" fill="#3d6191"/><path d="M200 157.6l3.4 7.4h-6.8z" fill="#e6ebef" opacity=".85"/><path d="M200 162.4l1.6 2.6 9 1-9 1-1.6 2.6-1.6-2.6-9-1 9-1z" fill="#c9a25e" opacity=".75"/>
<path d="M231.6 60.4l4.6 4.6M236.4 59l.2 6M240.6 60.4l-3.4 4.6" stroke="#3b4952" stroke-width=".8" stroke-linecap="round"/>
<g transform="rotate(-17 236 57.6)"><rect x="217" y="55.6" width="12" height="4" rx=".6" fill="#b9975a"/><rect x="228.6" y="56" width="10.4" height="3.2" rx=".5" fill="#c9a865"/><rect x="238.6" y="56.4" width="7.6" height="2.4" rx=".4" fill="#b9975a"/>
  <rect x="216.4" y="55.2" width="1.6" height="4.8" rx=".4" fill="#8e6f38"/><rect x="228.2" y="55.8" width="1" height="3.6" fill="#8e6f38"/><rect x="238.3" y="56.2" width=".8" height="2.8" fill="#8e6f38"/><path d="M218.6 56.4h10" stroke="#f0d9a0" stroke-width=".5"/></g>
<circle cx="236.2" cy="59.4" r="1.2" fill="#3b4952"/>
<path d="M33.6 88.4c1.2-.9 2.4-1 3.4-.2 1-.9 2.2-.9 3 0 .9-.9 2.1-.9 3 0 1-.8 2.2-.7 3.4.2l-2.6 5.4c-.3.5-.8.8-1.4.8h-4.8c-.6 0-1.1-.3-1.4-.8z" fill="#f2d7c2"/>
<path d="M36.4 88.4l2.3 6M39.8 88l.4 6.4M43.2 88.4l-1.6 6M34.8 89.6l3 4.8M45 89.6l-2.6 4.6" stroke="#d6b294" stroke-width=".45"/>
<path d="M37 93.6h6.4l-.6 1h-5.2z" fill="#e3bfa4"/>
${leaf(40, 88.2, 7.6, -46, 1.9, 'rs-lh-s0')}${leaf(40, 88.2, 7.6, 46, 1.9, 'rs-lh-s0')}${leaf(40, 88.2, 8.4, -18, 2, 'rs-lh-s0')}${leaf(40, 88.2, 8.4, 18, 2, 'rs-lh-s0')}
${leaf(40, 88.4, 7, -70, 1.8, 'rs-lh-s1')}${leaf(40, 88.4, 7, 70, 1.8, 'rs-lh-s1')}${leaf(40, 88.4, 7.4, 0, 2, 'rs-lh-s1')}${leaf(40, 88.6, 5.6, -36, 1.7, 'rs-lh-s2')}${leaf(40, 88.6, 5.6, 36, 1.7, 'rs-lh-s2')}${leaf(40, 88.8, 3.6, 0, 1.4, 'rs-lh-s2')}
<g class="table-mug">
  <path class="rs-lh-steam" d="M254.6 87.4q-1.6-2.4 0-4.8t0-4.8"/><path class="rs-lh-steam rs-lh-st2" d="M258.2 87.4q-1.6-2.4 0-4.8t0-4.8"/>
  <path d="M260.2 92.4c3 0 4 1.2 4 3s-1 3-4 3" stroke="#e9ecee" stroke-width="1.3" fill="none"/><path d="M260.2 92.4c3 0 4 1.2 4 3s-1 3-4 3" stroke="#23466e" stroke-width=".35" fill="none" transform="translate(0 -.55)"/>
  <rect x="251.2" y="90.4" width="9.6" height="9.6" rx="1" fill="#eef0ee"/><path d="M257.4 90.4h2.4a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1h-2.4z" fill="#d9dedf"/>
  <ellipse cx="256" cy="90.6" rx="4.8" ry=".9" fill="#6b3f26"/><rect x="251.2" y="89.8" width="9.6" height="1" rx=".5" fill="#23466e"/><rect x="251.2" y="99.2" width="9.6" height=".8" rx=".4" fill="#23466e"/>
  <rect x="253.6" y="89.2" width="2" height="1.4" rx=".5" fill="#fffaf2"/><circle cx="253.2" cy="96.4" r=".35" fill="#3b4952"/><circle cx="259.6" cy="93.6" r=".3" fill="#3b4952"/>
</g>
<path class="rs-lh-tint" d="M0 0H400V230H0ZM171 15V63H239V15Z" fill-rule="evenodd"/>`,
    glow: `
<defs>
  <clipPath id="rs-lighthouse-panes"><path d="M171 15h32.5v22.5H171zM206.5 15H239v22.5h-32.5zM171 40.5h32.5V63H171zM206.5 40.5H239V63h-32.5z"/></clipPath>
  <linearGradient id="rs-lighthouse-bm" gradientUnits="userSpaceOnUse" x1="205" y1="4" x2="205" y2="64"><stop offset="0" stop-color="#fff6cf" stop-opacity=".75"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-lighthouse-ws" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff4d4" stop-opacity="0"/><stop offset=".5" stop-color="#fff4d4" stop-opacity=".2"/><stop offset="1" stop-color="#fff4d4" stop-opacity="0"/></linearGradient>
  <radialGradient id="rs-lighthouse-lg"><stop offset="0" stop-color="#ffd27a" stop-opacity=".6"/><stop offset="1" stop-color="#ffb35a" stop-opacity="0"/></radialGradient>
</defs>
<g class="rs-lh-kn rs-lh-beams">
  <g clip-path="url(#rs-lighthouse-panes)"><g class="rs-lh-beam"><path d="M205 4L190 66H220Z" fill="url(#rs-lighthouse-bm)"/><path d="M205 4L198 66H212Z" fill="url(#rs-lighthouse-bm)"/></g></g>
  <g class="rs-lh-wash"><rect x="-70" y="0" width="140" height="230" fill="url(#rs-lighthouse-ws)"/></g>
</g>
<g class="rs-lh-on"><circle cx="329.8" cy="45" r="17" fill="url(#rs-lighthouse-lg)"/><ellipse cx="329.8" cy="44.6" rx="3.2" ry="4.2" fill="#ffe9b0" opacity=".9"/><path class="rs-lh-flame" d="M329.8 42.4c.9 1.2 1.3 2.2 1.3 3.1a1.3 1.3 0 0 1-2.6 0c0-.9.4-1.9 1.3-3.1z" fill="#ffb340"/></g>`,
  };
}
