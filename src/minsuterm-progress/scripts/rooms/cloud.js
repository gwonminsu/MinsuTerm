'use strict';
// 방 스타일: 구름 위 하늘 방 — 구름 위에 떠 있는 몽글몽글한 방 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 둥근 창 아래로 구름 바다가 흐르고 열기구가 떠 있다. 방 안의 빛도 창밖을 따라간다: 낮엔 맑은 하늘빛,
// 해질녘엔 구름 바다와 벽이 금빛 분홍으로 물들고 열기구 버너가 켜진다. 밤엔 오로라와 별, 벽엔 야광 별이 빛나고
// 구름 스탠드가 따뜻하게 켜진다.
(() => {
  const R = '#room[data-room="cloud"]';
  const n = (v) => +v.toFixed(2);
  const NT = (sel) => `${R}.sky-night ${sel}, ${R}.night ${sel}`;
  // 바닥이 평평한 뭉게구름 (원 네 개와 밑판)
  const puff = (x, y, s, cls, extra = '') => `<g class="${cls}"${extra}><rect x="${n(x - 6 * s)}" y="${n(y - 3 * s)}" width="${n(14.5 * s)}" height="${n(3 * s)}" rx="${n(1.4 * s)}"/>`
    + [[-6, -3, 3], [-1, -5, 4.6], [5, -3.6, 3.6], [8.5, -2, 2]].map(([dx, dy, r]) => `<circle cx="${n(x + dx * s)}" cy="${n(y + dy * s)}" r="${n(r * s)}"/>`).join('') + '</g>';
  const star5 = (cx, cy, r) => 'M' + Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.45 : r;
    return `${n(cx + rr * Math.cos(a))} ${n(cy + rr * Math.sin(a))}`;
  }).join('L') + 'Z';

  // 창밖 구름 바다: 세 겹, 겹마다 주기만큼 흘러가며 이어진다
  const LAYERS = [[46, 4.2, [2.2, 3, 2.6, 3.4], 'cl-far'], [51, 5.6, [3.6, 4.6, 3.2, 5, 4], 'cl-mid'], [57.5, 7.6, [5, 6.4, 4.6, 7, 5.6], 'cl-near']];
  const sea = LAYERS.map(([y, dx, rs, cls], k) => {
    const P = n(dx * rs.length);
    let c = '';
    for (let x = 172 - P, i = 0; x < 240 + P; x += dx, i++) { const r = rs[i % rs.length]; c += `<circle cx="${n(x)}" cy="${n(y - r * 0.35)}" r="${r}"/>`; }
    return `<g class="${cls}"><g class="cl-drift" style="--p:-${P}px;animation-duration:${44 + k * 12}s">${c}<rect x="${n(172 - P)}" y="${y - 1}" width="${n(70 + 2 * P)}" height="${n(66 - y)}"/></g></g>`;
  }).join('');

  // 열기구: 봉투, 가운데 폭, 바구니
  const balloon = (glow) => `<path class="${glow ? 'cl-env-n' : 'cl-env'}" d="M0-7C4.6-7 6.4-3.6 6.4-1.2 6.4 2 3.4 4.4 1.6 6.4H-1.6C-3.4 4.4-6.4 2-6.4-1.2-6.4-3.6-4.6-7 0-7Z"/>`
    + (glow ? '' : `<path class="cl-gore" d="M0-7C1.8-7 2.6-3 2.6-1 2.6 2 1.6 4.4.9 6.4H-.9C-1.6 4.4-2.6 2-2.6-1-2.6-3-1.8-7 0-7Z"/><path d="M-4.4-5.2C-5.4-2 -4 2.4-1.6 6.4M4.4-5.2C5.4-2 4 2.4 1.6 6.4" stroke="#d9544a" stroke-width=".4" fill="none"/><ellipse cx="-3" cy="-3" rx="1.6" ry="2.6" fill="#fff" opacity=".28"/>`)
    + `<path d="M-1.6 6.4L-1.3 8.4M1.6 6.4L1.3 8.4" stroke="#8a5a3a" stroke-width=".35"/><rect x="-1.6" y="8.3" width="3.2" height="2.4" rx=".5" fill="#a0673f"/>`;

  // 오로라: 물결치는 밑선에서 위로 뻗는 빛살
  const aurora = (base, amp, hi, ph) => {
    let d = '';
    for (let x = 181; x < 230; x += 0.9) {
      const t = x - 180, y0 = base + amp * Math.sin(t / 6 + ph) + 1.2 * Math.sin(t / 2.4 + ph), h = hi + 0.6 * hi * Math.sin(t / 4.3 + 1 + ph) + 0.3 * hi * Math.sin(t / 1.7);
      d += `M${n(x)} ${n(y0)}V${n(y0 - h)}`;
    }
    return d;
  };
  // 벽의 야광 별 (밤)
  const WSTARS = [[132, 24, 1.6], [150, 50, 1.2], [252, 20, 1.4], [266, 52, 1.1], [318, 28, 1.7], [372, 42, 1.2], [118, 62, 1], [340, 60, 1.1]];

  const css = `
${R}[viewBox] { --wall: #b6d5f2; --wall-line: #a6c6ea; --floor: #e8eefb; --floor-line: #d4ddf3;
  --wood: #c6b5fb; --wood-dark: #9d8ae0; --metal: #a9b1d6; --frame: #ffffff; --sky: #8fd0ff;
  --sheet: #ffffff; --pillow: #ffffff; --blanket: #ffd97a; --blanket-dark: #f0bd4f;
  --screen: #2a2f5a; --laptop: #d9def0; --mug: #8fdcc0; --lamp: #ffe6a8; --shade: #ffffff;
  --rug: #dccfff; --rug-line: #ffffff; --arm: #f6b9cf; --arm-dark: #ea9fbc; --cushion: #ffd97a; }
${R}.sky-dusk[viewBox] { --wall: #f4d0d2; --wall-line: #e8b7c6; --floor: #fff0e6; --sky: #f6a5a5; --lamp: #ffc98a; }
${R}.sky-night[viewBox], ${R}.night[viewBox] { --wall: #6d7cba; --floor: #a7b0dc; --sky: #0e1640; --lamp: #ffd98f; }
${R} .frame, ${R} .sky, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star, ${R} .floor-line, ${R} .rug, ${R} .rug-line, ${R} .base,
${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .shade, ${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4,
${R} rect.wood[y="44"], ${R} .pot, ${R} .leaf, ${R} .mug, ${R} .mug-handle, ${R} .steam { display: none; }
${R} .cl-dusk { display: none; } ${R}.sky-dusk .cl-dusk { display: inline; } ${R}.sky-dusk .cl-noon { display: none; }
/* 흰 뭉게구름 장식: 낮 흰빛 → 해질녘 복숭아빛 → 밤 달빛 푸른빛 */
${R} .cl-white { fill: #fff; } ${R}.sky-dusk .cl-white { fill: #fff3ee; } ${NT('.cl-white')} { fill: #dfe4fb; }
${R} .cl-shade { fill: #dfe6fb; } ${R}.sky-dusk .cl-shade { fill: #f7d3d6; } ${NT('.cl-shade')} { fill: #aeb8e2; }
${R} .cl-soft { fill: #fff; opacity: .55; } ${R}.sky-dusk .cl-soft { fill: #fff4e8; opacity: .5; } ${NT('.cl-soft')} { display: none; }
${R} .cl-floor-hi { fill: #f4f7ff; } ${R}.sky-dusk .cl-floor-hi { fill: #fff8f4; } ${NT('.cl-floor-hi')} { fill: #b9c1e6; }
${R} .cl-ripple { fill: none; stroke: #ccd6f0; stroke-width: 1.1; stroke-linecap: round; } ${R}.sky-dusk .cl-ripple { stroke: #f6d6d3; } ${NT('.cl-ripple')} { stroke: #8f99cc; }
${R} .cl-rug { fill: #dccfff; } ${R}.sky-dusk .cl-rug { fill: #f8c6d6; } ${NT('.cl-rug')} { fill: #a99fe0; }
/* 창 */
${R} .cl-sky { fill: url(#rs-cloud-sky); } ${R}.sky-dusk .cl-sky { fill: url(#rs-cloud-sky-dusk); } ${NT('.cl-sky')} { fill: url(#rs-cloud-sky-night); }
${R} .cl-far { fill: #e8f3ff; } ${R} .cl-mid { fill: #f7fbff; } ${R} .cl-near { fill: #fff; }
${R}.sky-dusk .cl-far { fill: #f7b9a6; } ${R}.sky-dusk .cl-mid { fill: #ffcdb0; } ${R}.sky-dusk .cl-near { fill: #ffe0bd; }
${NT('.cl-far')} { fill: #2c3a72; } ${NT('.cl-mid')} { fill: #3c4a86; } ${NT('.cl-near')} { fill: #52609c; }
${R} .cl-drift { animation: rs-cloud-drift 50s linear infinite; }
${R} .cl-env { fill: #ff7a6b; } ${R} .cl-gore { fill: #fff1d6; } ${R}.sky-dusk .cl-env { fill: #d9606a; } ${R}.sky-dusk .cl-gore { fill: #f6c8a8; }
${R} .cl-env-n { fill: url(#rs-cloud-lit); }
${R} .cl-balloon { animation: rs-cloud-bob 7s ease-in-out infinite alternate; }
${R} .cl-frame { fill: #fff; } ${R}.sky-dusk .cl-frame { fill: #fff6f2; } ${NT('.cl-frame')} { fill: #e3e7fa; }
${R} .cl-aurora { animation: rs-cloud-aurora 9s ease-in-out infinite alternate; transform-origin: 205px 40px; }
${R} .cl-aurora + .cl-aurora { animation-duration: 12s; animation-delay: -4s; }
${R} .cl-tw { animation: rs-cloud-tw 3s ease-in-out infinite; } ${R} .cl-tw:nth-child(2n) { animation-delay: -1.4s; } ${R} .cl-tw:nth-child(3n) { animation-delay: -2.2s; }
${R} .cl-mobile { transform-origin: 94px 9px; animation: rs-cloud-swing 6s ease-in-out infinite alternate; }
${R} .cl-rain { animation: rs-cloud-rain 1.1s linear infinite; } ${R} .cl-rain:nth-child(2) { animation-delay: -.4s; } ${R} .cl-rain:nth-child(3) { animation-delay: -.75s; }
${R} .cl-float { animation: rs-cloud-float 4s ease-in-out infinite alternate; }
${R} .cl-fshadow { transform-origin: 39.7px 94.8px; animation: rs-cloud-shadow 4s ease-in-out infinite alternate; }
${R} .cl-steam { fill: none; stroke: #fff; stroke-width: .9; stroke-linecap: round; opacity: 0; animation: rs-cloud-steam 3s ease-in-out infinite; }
${R} .cl-steam + .cl-steam { animation-delay: 1.4s; }
${R} .cl-wisp { opacity: .6; animation: rs-cloud-wisp 70s linear infinite; }
${R} .cl-lampc { fill: #fffdf7; } ${R}.sky-dusk .cl-lampc { fill: #fff1d8; } ${NT('.cl-lampc')} { fill: #fff2cc; }
${R} .cl-dim { display: none; fill: #161c52; }
${R}.sky-dusk .cl-dim { display: inline; fill: #ff8a6a; opacity: .06; }
${R}.sky-night .cl-dim { display: inline; opacity: .3; } ${R}.night .cl-dim { display: inline; opacity: .12; }
@keyframes rs-cloud-drift { to { transform: translateX(var(--p)); } }
@keyframes rs-cloud-bob { from { transform: translate(-1px, 1.2px); } to { transform: translate(1.4px, -1.4px); } }
@keyframes rs-cloud-aurora { from { transform: translateX(-1.5px) scaleY(.94); opacity: .75; } to { transform: translateX(1.5px) scaleY(1.05); opacity: 1; } }
@keyframes rs-cloud-tw { 50% { opacity: .3; } }
@keyframes rs-cloud-swing { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
@keyframes rs-cloud-rain { from { transform: translateY(-1.5px); opacity: 0; } 30% { opacity: 1; } to { transform: translateY(3.5px); opacity: 0; } }
@keyframes rs-cloud-float { from { transform: translateY(.6px); } to { transform: translateY(-1.2px); } }
@keyframes rs-cloud-shadow { from { transform: scale(1); opacity: 1; } to { transform: scale(.82); opacity: .7; } }
@keyframes rs-cloud-steam { 0% { opacity: 0; transform: translateY(1.5px); } 40% { opacity: .75; } 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes rs-cloud-wisp { from { transform: translateX(0); } to { transform: translateX(-460px); } }
`;

  const wall = `
<!-- 천장의 구름 몰딩 -->
${['cl-shade', 'cl-white'].map((c, k) => `<g class="${c}">${Array.from({ length: 23 }, (_, i) => `<circle cx="${i * 18 - 2}" cy="${n((i % 2 ? 1 : 2.4) + (k ? 0 : 1.3))}" r="${i % 2 ? 7.4 : 8.6}"/>`).join('')}</g>`).join('')}
<defs><radialGradient id="rs-cloud-sunset" cx="205" cy="40" r="120" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffc46b" stop-opacity=".5"/><stop offset=".5" stop-color="#ffb36b" stop-opacity=".18"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient></defs>
<rect class="cl-dusk" x="60" y="0" width="290" height="120" fill="url(#rs-cloud-sunset)"/>
<!-- 벽에 그린 구름 -->
${puff(136, 40, 1.15, 'cl-soft')}${puff(324, 30, 1.3, 'cl-soft')}${puff(251, 60, .8, 'cl-soft')}
<!-- 구름 선반과 날씨 병 (책 선반 자리) -->
<g class="cl-shade"><circle cx="20" cy="47.6" r="3.4"/><circle cx="27" cy="48.6" r="3.8"/><circle cx="35" cy="48" r="4.2"/><circle cx="43.6" cy="48.8" r="3.6"/><circle cx="51.4" cy="48" r="3.9"/><circle cx="59" cy="47.4" r="3.4"/></g>
<g class="cl-white"><rect x="15" y="43.6" width="50" height="3.6" rx="1.8"/><circle cx="20" cy="46.6" r="3.2"/><circle cx="27" cy="47.4" r="3.6"/><circle cx="35" cy="46.8" r="4"/><circle cx="43.6" cy="47.6" r="3.4"/><circle cx="51.4" cy="46.8" r="3.7"/><circle cx="59" cy="46.4" r="3.2"/></g>
<rect x="16.6" y="31.6" width="8.8" height="12.2" rx="1.8" fill="#eef7ff" fill-opacity=".55" stroke="#8fb1de" stroke-opacity=".9" stroke-width=".45"/>
${puff(20.6, 36.4, .36, 'cl-white')}
<g stroke="#6fa8e8" stroke-width=".55" stroke-linecap="round"><path class="cl-rain" d="M18.8 38v1.2"/><path class="cl-rain" d="M20.8 38.4v1.2"/><path class="cl-rain" d="M22.6 37.8v1.2"/></g>
<rect x="17.2" y="30" width="7.6" height="2" rx=".6" fill="#e2bf91"/>
<rect x="27.4" y="30.6" width="8.6" height="13.2" rx="1.8" fill="#eef7ff" fill-opacity=".55" stroke="#8fb1de" stroke-opacity=".9" stroke-width=".45"/>
<g fill="none" stroke-width=".8"><path d="M28.8 42a2.9 2.9 0 0 1 5.8 0" stroke="#ff8a8a"/><path d="M29.6 42a2.1 2.1 0 0 1 4.2 0" stroke="#ffd36b"/><path d="M30.4 42a1.3 1.3 0 0 1 2.6 0" stroke="#7fd49a"/></g>
${puff(29, 42.6, .2, 'cl-white')}${puff(34.4, 42.6, .2, 'cl-white')}
<rect x="28" y="29" width="7.4" height="2" rx=".6" fill="#e2bf91"/>
<rect x="38" y="33.4" width="7.4" height="10.4" rx="1.6" fill="#eef7ff" fill-opacity=".55" stroke="#8fb1de" stroke-opacity=".9" stroke-width=".45"/>
<path d="${star5(41.7, 38.6, 2.4)}" fill="#ffd36b"/>
<rect x="38.5" y="31.8" width="6.4" height="2" rx=".6" fill="#e2bf91"/>
<path d="M49 43.4L62.6 37.6L55.6 43.4Z" fill="#fff" stroke="#9fb4de" stroke-width=".4" stroke-linejoin="round"/><path d="M55.6 43.4L62.6 37.6L54.4 41.6Z" fill="#d3ddf6" stroke="#9fb4de" stroke-width=".4" stroke-linejoin="round"/>
<!-- 무지개 모빌 (액자 자리) -->
<g class="cl-mobile">
  <path d="M94 9V19M82 21V27M106 21V29M94 21V33" stroke="#9aa6cf" stroke-width=".35"/>
  <path d="M81.6 20.4Q94 18 106.4 20.4" stroke="#c6a27a" stroke-width="1" fill="none" stroke-linecap="round"/>
  <g fill="none" stroke-width="1.1"><path d="M77 33.4a5 5 0 0 1 10 0" stroke="#ff8a8a"/><path d="M78.2 33.4a3.8 3.8 0 0 1 7.6 0" stroke="#ffc66b"/><path d="M79.4 33.4a2.6 2.6 0 0 1 5.2 0" stroke="#86d6a0"/><path d="M80.6 33.4a1.4 1.4 0 0 1 2.8 0" stroke="#86b4ff"/></g>
  ${puff(106.4, 34.6, .5, 'cl-white')}
  <path d="${star5(94, 36.6, 3.4)}" fill="#ffd36b"/>
</g>
`;

  const view = `
<defs>
  <clipPath id="rs-cloud-glass"><circle cx="205" cy="38" r="23"/></clipPath>
  <linearGradient id="rs-cloud-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#d4efff"/></linearGradient>
  <linearGradient id="rs-cloud-sky-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f6fc4"/><stop offset=".5" stop-color="#f29fae"/><stop offset="1" stop-color="#ffd08f"/></linearGradient>
  <linearGradient id="rs-cloud-sky-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080d2c"/><stop offset="1" stop-color="#1d2a5c"/></linearGradient>
  <radialGradient id="rs-cloud-sunhalo"><stop offset=".3" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-cloud-duskhalo"><stop offset=".3" stop-color="#ffe2a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffb07a" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-cloud-lit" cy=".75"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ff8a4a"/></radialGradient>
  <linearGradient id="rs-cloud-auray2" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="31"><stop offset="0" stop-color="#ff8ad8" stop-opacity="0"/><stop offset=".6" stop-color="#d49cff" stop-opacity=".45"/><stop offset="1" stop-color="#ffa8e6" stop-opacity=".75"/></linearGradient>
  <filter id="rs-cloud-ablur" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation=".55 .25"/></filter>
  <linearGradient id="rs-cloud-auray" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="38"><stop offset="0" stop-color="#c79cff" stop-opacity="0"/><stop offset=".45" stop-color="#b88cff" stop-opacity=".35"/><stop offset=".8" stop-color="#5ff2a8" stop-opacity=".8"/><stop offset="1" stop-color="#e0ffef"/></linearGradient>
  <mask id="rs-cloud-moon"><circle cx="219" cy="24" r="3.8" fill="#fff"/><circle cx="221.2" cy="22.6" r="3.2" fill="#000"/></mask>
</defs>
<circle class="cl-frame" cx="205" cy="38" r="28.4"/>
<circle cx="205" cy="38" r="28.4" fill="none" stroke="#a9bce6" stroke-width=".6" opacity=".7"/>
<g clip-path="url(#rs-cloud-glass)">
  <rect class="cl-sky" x="180" y="14" width="50" height="50"/>
  <g class="day cl-noon"><circle cx="220" cy="24" r="9" fill="url(#rs-cloud-sunhalo)"/><circle cx="220" cy="24" r="3.6" fill="#fff6c4"/>
    <path d="M186.4 30.6l1.2.8 1.2-.8M191 27.4l1 .7 1-.7" stroke="#55688f" stroke-width=".45" fill="none" stroke-linecap="round"/></g>
  <g class="cl-dusk"><circle cx="216" cy="43.6" r="12" fill="url(#rs-cloud-duskhalo)"/><circle cx="216" cy="43.6" r="4.4" fill="#ffe2a0"/></g>
  <g class="nite">
    <g fill="#fff">${[[188, 20, .5], [197, 18, .4], [210, 17.6, .45], [226, 30, .4], [184, 28, .35], [203, 26, .3], [214, 33, .35], [192, 34, .3], [228, 20, .35]].map(([x, y, r], i) => `<circle class="${i % 2 ? '' : 'cl-tw'}" cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    <g filter="url(#rs-cloud-ablur)"><path class="cl-aurora" stroke="url(#rs-cloud-auray2)" stroke-width="1.2" opacity=".38" d="${aurora(27, 2.4, 7, 2)}"/>
    <path class="cl-aurora" stroke="url(#rs-cloud-auray)" stroke-width="1.2" opacity=".7" d="${aurora(34, 3.4, 10, 0)}"/></g>
    <circle cx="219" cy="24" r="3.8" fill="#fff6d5" mask="url(#rs-cloud-moon)"/>
  </g>
  ${sea}
  <g class="day"><g transform="translate(195 29)"><g class="cl-balloon">${balloon(false)}<g class="cl-dusk"><circle cy="7.2" r="2.6" fill="#ffb24a" opacity=".45"/><ellipse cy="7.1" rx=".7" ry="1.1" fill="#ffe08a"/></g></g></g></g>
  <g class="nite"><g transform="translate(220 38.6) scale(.42)"><g class="cl-balloon"><circle r="10" fill="#ffb05a" opacity=".22"/>${balloon(true)}</g></g></g>
  <circle cx="205" cy="38" r="23" fill="none" stroke="#7d8fd0" stroke-width="2.4" opacity=".22"/>
  <path d="M188 28a19 19 0 0 1 10-10" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".25"/>
</g>
<circle cx="205" cy="38" r="23.3" fill="none" stroke="#c9d3f2" stroke-width=".9"/>
<g class="cl-shade" transform="translate(0 .8)">${puff(205, 71.6, 1.1, '')}</g>
${puff(205, 70.8, 1.1, 'cl-white')}
`;

  const floor = `
<!-- 구름 바닥: 벽과 만나는 곳이 몽글하게 솟고, 표면엔 구름 물결 -->
<g class="cl-floor-hi">${Array.from({ length: 30 }, (_, i) => `<circle cx="${i * 14 - 4}" cy="${i % 3 === 1 ? 121.4 : 122.6}" r="${i % 3 === 1 ? 6.4 : 5.4}"/>`).join('')}<rect x="0" y="121" width="400" height="6"/></g>
<path class="cl-ripple" d="${[[136, 8, 5], [134, 150, 4], [138, 286, 6], [152, 40, 3], [190, 20, 6], [187, 170, 5], [193, 300, 5], [208, 92, 4], [214, 236, 6], [222, 4, 3], [224, 352, 3]].map(([y, x, k]) => `M${x} ${y}` + 'a7 3.2 0 0 1 14 0'.repeat(k)).join('')}"/>
<g class="cl-wisp">${puff(330, 190, 1.4, 'cl-soft')}${puff(470, 214, 1.1, 'cl-soft')}${puff(560, 176, 1.2, 'cl-soft')}${puff(790, 190, 1.4, 'cl-soft')}</g>
<!-- 구름 깔개 -->
<g class="cl-rug">${Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return `<ellipse cx="${n(200 + 160 * Math.cos(a))}" cy="${n(166 + 15.6 * Math.sin(a))}" rx="7.4" ry="3.4"/>`; }).join('')}<ellipse cx="200" cy="166" rx="160" ry="15.6"/></g>
<ellipse cx="200" cy="166" rx="148" ry="11.2" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>
`;

  const props = `
<!-- 떠 있는 구름 화분 (책상 화분 자리) -->
<ellipse class="cl-fshadow" cx="39.7" cy="94.8" rx="4.6" ry=".8" fill="#5a5f9a" opacity=".18"/>
<g class="cl-float">
  <path d="M39.7 85V80.6" stroke="#5bb27a" stroke-width="1"/><path d="M39.7 83.4c-2-.2-3-1.4-3.2-2.6 1.8 0 3 .8 3.2 2.6zM39.7 82.4c1.8-.4 2.8-1.6 2.8-2.8-1.6.2-2.6 1.2-2.8 2.8z" fill="#6cc48a"/>
  <g class="cl-shade" transform="translate(0 .7)">${puff(39.4, 79.6, .78, '')}</g>${puff(39.4, 79, .78, 'cl-white')}
  <path d="M35 85H44.4L43.3 91.6H36.1Z" fill="#ffb3c7"/><rect x="34.4" y="84.4" width="10.6" height="2" rx=".8" fill="#ff9db9"/>
</g>
<!-- 탁자 위 마시멜로 구름 코코아 -->
<g class="table-mug">
  <path class="cl-steam" d="M253.6 86.4q-1.6-2 0-4t0-4"/><path class="cl-steam" d="M257.6 86.4q-1.6-2 0-4t0-4"/>
  <path d="M260 93.2q3.6 0 3.6 3t-3.6 3" stroke="#7fcfb2" stroke-width="1.5" fill="none"/>
  <rect x="251" y="90.5" width="9" height="9.5" rx="1.8" fill="#8fdcc0"/><path d="M252 91.4V98.6" stroke="#c4f0df" stroke-width=".8" stroke-linecap="round"/>
  <ellipse cx="255.5" cy="90.8" rx="4.2" ry=".9" fill="#7a4a32"/>
  <g class="cl-white"><circle cx="253.6" cy="89.6" r="1.9"/><circle cx="256" cy="88.6" r="2.4"/><circle cx="258.2" cy="89.8" r="1.6"/><rect x="252" y="89.4" width="7.4" height="1.6" rx=".8"/></g>
</g>
<path class="cl-dim" fill-rule="evenodd" d="M0 0H400V230H0ZM205 15a23 23 0 1 0 .01 0Z"/>
`;

  const glow = `
<defs><radialGradient id="rs-cloud-lamp"><stop offset="0" stop-color="#fff3c4" stop-opacity=".55"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient></defs>
<g class="nite">
  <g fill="#f3ffb8">${WSTARS.map(([x, y, r]) => `<path class="cl-tw" d="${star5(x, y, r)}"/>`).join('')}</g>
  <path d="${star5(41.7, 38.6, 2.4)}" fill="#ffe27a"/><circle cx="41.7" cy="38.6" r="5" fill="url(#rs-cloud-lamp)"/>
  <circle cx="285" cy="54" r="16" fill="url(#rs-cloud-lamp)"/>
</g>
<!-- 구름 스탠드 -->
<g class="cl-shade" transform="translate(0 .8)">${puff(284.4, 61, 1.05, '')}</g>
${puff(284.4, 60.4, 1.05, 'cl-lampc')}
`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['cloud'] = { css, wall, view, floor, props, glow };
})();
