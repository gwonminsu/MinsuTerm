'use strict';
// 방 스타일: 해저 기지 — 푸른 물빛이 일렁이는 바닷속 연구실 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮엔 햇빛 기둥이 내려오는 맑은 물에 물고기 떼와 바다거북이 지나가고, 바닥에 물결 빛이 일렁인다.
// 해질녘엔 물이 깊은 남색으로 가라앉고 수면의 노을빛이 희미하게 내려온다. 밤엔 연구실 불이 낮춰지고
// 해파리와 플랑크톤의 생물 발광이 창과 방을 물들인다.
(() => {
  const R = '#room[data-room="sea"]';
  const n = (v) => +v.toFixed(2);
  const NT = (sel) => `${R}.sky-night ${sel}, ${R}.night ${sel}`;
  const n1 = (v) => +v.toFixed(1);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const smooth = (pts, q = n) => {
    let d = `M${q(pts[0][0])} ${q(pts[0][1])}`;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      d += `C${q(p1[0] + (p2[0] - p0[0]) / 6)} ${q(p1[1] + (p2[1] - p0[1]) / 6)} ${q(p2[0] - (p3[0] - p1[0]) / 6)} ${q(p2[1] - (p3[1] - p1[1]) / 6)} ${q(p2[0])} ${q(p2[1])}`;
    }
    return d + 'Z';
  };

  // 물결 빛(코스틱): 밝은 판에서 둥근 육각 칸을 도려내 칸 사이에 빛 그물이 남게 한다. 이음매 없이 반복되는 무늬
  const caustic = (sx, f) => {
    const r = sx / Math.sqrt(3), sy = 1.5 * r * f, W = n(sx * 4), H = n(sy * 2);
    let d = `M0 0H${W}V${H}H0Z`;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * sx + (rnd() - 0.5) * 0.16 * sx, cy = (j + 0.5) * sy + (rnd() - 0.5) * 0.16 * sy;
      const vs = Array.from({ length: 6 }, (_, k) => {
        const a = ((90 + 60 * k + (rnd() - 0.5) * 14) * Math.PI) / 180, rr = r * 0.9 * (0.86 + rnd() * 0.24);
        return [cx + rr * Math.cos(a), cy + rr * f * Math.sin(a)];
      });
      const xs = vs.map((v) => v[0]), ys = vs.map((v) => v[1]);
      for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
        if (Math.min(...xs) + dx >= W || Math.max(...xs) + dx <= 0 || Math.min(...ys) + dy >= H || Math.max(...ys) + dy <= 0) continue;
        d += smooth(vs.map(([x, y]) => [x + dx, y + dy]), n1);
      }
    }
    return { W, H, d };
  };
  const CA = caustic(11, 0.42), CB = caustic(15, 0.42);

  // 해초 띠: 밑동에서 위로 S자로 휘며 넓어졌다 끝이 가늘어진다
  const kelp = (x0, y0, L, W, ph, cls) => {
    const left = [], right = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, y = y0 - L * t, x = x0 + 2.2 * Math.sin(t * Math.PI * 1.5 + ph) * t;
      const w = 0.35 + W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.75);
      left.push([x - w, y]); right.unshift([x + w, y]);
    }
    return `<path class="${cls}" style="transform-origin:${x0}px ${y0}px;animation-delay:${n1(-ph * 2)}s" d="${smooth(left.concat(right), n1)}"/>`;
  };

  // 창: 양끝이 둥근 관측창 (중심 191·219, y 40)
  const stad = (r) => `M191 ${40 - r}H219A${r} ${r} 0 0 1 219 ${40 + r}H191A${r} ${r} 0 0 1 191 ${40 - r}Z`;
  const bolts = [];
  for (let a = 90; a <= 270; a += 30) bolts.push([191 + 25.2 * Math.cos((a * Math.PI) / 180), 40 + 25.2 * Math.sin((a * Math.PI) / 180)]);
  for (let a = -90; a <= 90; a += 30) bolts.push([219 + 25.2 * Math.cos((a * Math.PI) / 180), 40 + 25.2 * Math.sin((a * Math.PI) / 180)]);
  bolts.push([205, 14.8], [205, 65.2]);
  const boltSvg = (list, r) => list.map(([x, y]) => `<circle class="sea-bolt" cx="${n(x)}" cy="${n(y)}" r="${r}"/>`).join('');

  // 압력계 눈금
  let ticks = '';
  for (let i = 0; i <= 8; i++) {
    const a = ((135 + i * 33.75) * Math.PI) / 180;
    ticks += `M${n(88 + 5.4 * Math.cos(a))} ${n(34 + 5.4 * Math.sin(a))}L${n(88 + (i % 2 ? 6.1 : 6.6) * Math.cos(a))} ${n(34 + (i % 2 ? 6.1 : 6.6) * Math.sin(a))}`;
  }
  // 벽의 늑골(선체 프레임)
  const rib = (x) => `<rect class="sea-rib" x="${x}" y="11.5" width="6" height="104.5"/><path class="sea-rib" d="M${x} 11.5h-5q5 0 5 5zM${x + 6} 11.5h5q-5 0-5 5z"/>`
    + `<path d="M${x + .6} 16V116" stroke="#3a808b" stroke-width=".8"/><path d="M${x + 5.4} 16V116" stroke="#164653" stroke-width=".8"/>`
    + Array.from({ length: 11 }, (_, i) => `<circle cx="${x + 3}" cy="${20 + i * 9}" r=".55"/>`).join('');
  const lampAt = (x, y) => `<circle cx="${x}" cy="${y}" r="11" class="sea-halo"/><ellipse cx="${x}" cy="${y}" rx="3.7" ry="4.9" fill="#123d47"/><ellipse class="sea-bulb" cx="${x}" cy="${y}" rx="2.6" ry="3.7"/>`
    + `<path d="M${x} ${y - 3.7}V${y + 3.7}M${x - 2.6} ${y}H${x + 2.6}" stroke="#123d47" stroke-width=".6"/>`;
  // 플랑크톤
  const plankton = Array.from({ length: 16 }, (_, i) => `<circle class="${i % 3 ? '' : 'sea-tw'}" cx="${n(171 + rnd() * 68)}" cy="${n(20 + rnd() * 38)}" r="${n(0.25 + rnd() * 0.35)}"/>`).join('');
  const star = (cx, cy, r, sq = 0.55) => smooth(Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.42 : r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a) * sq];
  }));
  const fish = (x, y, d) => `<g transform="translate(${x} ${y})"><g class="sea-bob" style="animation-delay:${d}s"><path class="sea-fish" d="M0 0C1.6-1.9 4.6-2 6.4 0 4.6 2 1.6 1.9 0 0ZM.5 0L-1.8-1.6V1.6Z"/><path class="sea-fin" d="M2.4-1.2V1.2"/><circle cx="5" cy="-.35" r=".32" fill="#13323a"/></g></g>`;
  const jelly = (x, y, s, c, d) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="sea-jelly" style="animation-delay:${d}s">`
    + `<circle r="9" cy="-1" fill="url(#rs-sea-halo-${c})"/>`
    + `<path class="sea-tent-${c}" d="M-2.6 .8q-1 3 0 5.5t0 5M-.8 1q.9 3 0 6t0 5M1 1q-.9 3 0 6t0 4.5M2.7 .8q1 3 0 5t0 5"/>`
    + `<path fill="url(#rs-sea-bell-${c})" d="M-4.2 0C-4.2-3.4-2-5 0-5S4.2-3.4 4.2 0C3.2.8 2.4.3 1.4.8.4 1.3-.4 1.3-1.4.8-2.4.3-3.2.8-4.2 0Z"/></g></g>`;

  const css = `
${R}[viewBox] { --wall: #1c5260; --wall-line: #123b45; --floor: #174652; --floor-line: #0f343d;
  --wood: #a9ced0; --wood-dark: #6e9da2; --metal: #86aeb3; --frame: #3f8792; --sky: #0d5e78;
  --sheet: #dce9ea; --pillow: #f0f6f6; --blanket: #e27a4e; --blanket-dark: #c25f37;
  --screen: #072028; --laptop: #b8cfd2; --mug: #f0b43c; --lamp: #6ff3e4; --shade: #6ff3e4;
  --rug: #2b6b75; --rug-line: #9fe0d6; --arm: #d3a043; --arm-dark: #b38630; --cushion: #e27a4e; }
${R}.sky-night[viewBox], ${R}.night[viewBox] { --lamp: #3fd6e6; }
${R} .frame, ${R} .sky, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .shade,
${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} rect.wood[y="44"], ${R} .pot, ${R} .leaf, ${R} .mug, ${R} .mug-handle, ${R} .steam { display: none; }
${R} .sea-steam { fill: none; stroke: #e6f6f6; stroke-width: .9; stroke-linecap: round; opacity: 0; animation: rs-sea-steam 3s ease-in-out infinite; }
${R} .sea-steam + .sea-steam { animation-delay: 1.4s; }
${R} .sea-rise2 { animation: rs-sea-rise2 2.6s linear infinite; }
${R} .sea-clown { animation: rs-sea-clown 7s ease-in-out infinite alternate; }
${R} .sea-rib { fill: #246673; } ${R} .sea-ribs circle { fill: #3e8792; }
${R} .sea-bolt { fill: #a9cfd2; stroke: #18434c; stroke-width: .35; }
${R} .sea-dusk { display: none; } ${R}.sky-dusk .sea-dusk { display: inline; } ${R}.sky-dusk .sea-noon { display: none; }
/* 물빛: 낮 맑은 청록 → 해질녘 깊은 남색(수면의 노을) → 밤 거의 검은 바다 */
${R} .sea-water { fill: url(#rs-sea-water); } ${R}.sky-dusk .sea-water { fill: url(#rs-sea-water-dusk); }
${NT('.sea-water')} { fill: url(#rs-sea-water-night); }
${[['sand', 'fill', '#d9c899', '#6f7393', '#102036'], ['ripple', 'stroke', '#bfae80', '#5c607f', '#0b182b'], ['rock', 'fill', '#5b8790', '#3b5276', '#0b1a2e'],
  ['coral', 'stroke', '#ff8a78', '#b06a86', '#1b2c48'], ['starfish', 'fill', '#f08a3c', '#a8607a', '#1b2c48'], ['kelp', 'fill', '#2e9b6b', '#276473', '#0a2532'],
  ['kelp2', 'fill', '#5cb8a0', '#3d6690', '#08192b']].map(([c, p, a, b, d]) => `${R} .sea-${c} { ${p}: ${a}; } ${R}.sky-dusk .sea-${c} { ${p}: ${b}; } ${NT('.sea-' + c)} { ${p}: ${d}; }`).join(' ')}
${R} .sea-kelp2 { opacity: .7; }
${R} .sea-fish { fill: #ffc24a; } ${R} .sea-fin { stroke: #e7962e; stroke-width: .5; } ${R}.sky-dusk .sea-fish { fill: #a9bfdc; } ${R}.sky-dusk .sea-fin { stroke: #7d93b8; }
${R} .sea-bubble { fill: #e9ffff; fill-opacity: .18; stroke: #e9ffff; stroke-opacity: .75; stroke-width: .35; }
${R} .sea-kelp, ${R} .sea-kelp2 { animation: rs-sea-sway 6s ease-in-out infinite alternate; }
${R} .sea-bob { animation: rs-sea-bob 2.6s ease-in-out infinite alternate; }
${R} .sea-school { animation: rs-sea-swim 26s linear infinite; animation-delay: -12s; }
${R} .sea-turtle { animation: rs-sea-glide 48s linear infinite; animation-delay: -20s; }
${R} .sea-ray { animation: rs-sea-ray 7s ease-in-out infinite alternate; } ${R} .sea-ray:nth-child(2) { animation-delay: -3s; } ${R} .sea-ray:nth-child(3) { animation-delay: -5s; }
${R} .sea-rise { animation: rs-sea-rise 6s linear infinite; }
${R} .sea-jelly { animation: rs-sea-jelly 5.5s ease-in-out infinite alternate; }
${R} .sea-tw { animation: rs-sea-tw 2.8s ease-in-out infinite; }
${R} .sea-needle { transform-origin: 88px 34px; animation: rs-sea-needle 4.5s ease-in-out infinite alternate; }
${R} .sea-tent-p { fill: none; stroke: #ff9be0; stroke-width: .5; opacity: .8; } ${R} .sea-tent-c { fill: none; stroke: #9ff8ff; stroke-width: .5; opacity: .8; }
/* 바닥의 물결 빛 */
${R} .sea-ca { opacity: .2; animation: rs-sea-ca 16s linear infinite; } ${R} .sea-cb { opacity: .15; animation: rs-sea-cb 21s linear infinite; }
${R}.sky-dusk .sea-caustic { opacity: .4; } ${NT('.sea-caustic')} { display: none; }
/* 연구실 조명: 낮엔 환하고, 밤엔 낮춰진다 */
${R} .sea-bulb { fill: #effffc; } ${R} .sea-halo { fill: url(#rs-sea-lamphalo); }
${R}.sky-dusk .sea-bulb { fill: #ffe4b8; } ${R}.sky-dusk .sea-halo { fill: url(#rs-sea-lamphalo-dusk); }
${R}.sky-dusk .sea-dim { display: inline; opacity: .1; fill: #1a1f5a; }
${NT('.sea-bulb')} { fill: #4c8d96; } ${NT('.sea-halo')} { display: none; }
${R} .sea-dome { fill: #c8fff7; } ${NT('.sea-dome')} { fill: #7fe9f0; }
${R} .sea-dim { display: none; fill: #031a33; }
${R}.sky-night .sea-dim { display: inline; opacity: .22; } ${R}.night .sea-dim { display: inline; opacity: .08; }
@keyframes rs-sea-steam { 0% { opacity: 0; transform: translateY(1.5px); } 40% { opacity: .55; } 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes rs-sea-rise2 { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-11px); opacity: .2; } }
@keyframes rs-sea-clown { from { transform: translateX(-2.5px); } to { transform: translateX(2.5px); } }
@keyframes rs-sea-sway { from { transform: rotate(-4deg); } to { transform: rotate(4deg); } }
@keyframes rs-sea-bob { to { transform: translateY(.9px); } }
@keyframes rs-sea-swim { from { transform: translateX(0); } to { transform: translateX(125px); } }
@keyframes rs-sea-glide { from { transform: translateX(0); } to { transform: translateX(-110px); } }
@keyframes rs-sea-ray { from { opacity: .55; } to { opacity: 1; } }
@keyframes rs-sea-rise { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 50% { transform: translate(1.2px, -20px); } 85% { opacity: .8; } 100% { transform: translate(-.6px, -42px); opacity: 0; } }
@keyframes rs-sea-jelly { from { transform: translateY(1.5px) scale(1, .96); } to { transform: translateY(-2px) scale(1, 1.03); } }
@keyframes rs-sea-tw { 50% { opacity: .2; } }
@keyframes rs-sea-needle { from { transform: rotate(-6deg); } to { transform: rotate(5deg); } }
@keyframes rs-sea-ca { to { transform: translateX(${CA.W}px); } }
@keyframes rs-sea-cb { to { transform: translateX(-${CB.W}px); } }
`;

  const wall = `
<defs>
  <linearGradient id="rs-sea-pipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa1aa"/><stop offset=".45" stop-color="#2f7682"/><stop offset="1" stop-color="#18505b"/></linearGradient>
  <linearGradient id="rs-sea-pipev" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5aa1aa"/><stop offset=".45" stop-color="#2f7682"/><stop offset="1" stop-color="#18505b"/></linearGradient>
  <linearGradient id="rs-sea-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2cf7c"/><stop offset=".6" stop-color="#c3913f"/><stop offset="1" stop-color="#8a6326"/></linearGradient>
  <radialGradient id="rs-sea-lamphalo"><stop offset="0" stop-color="#d9fffa" stop-opacity=".35"/><stop offset="1" stop-color="#d9fffa" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-sea-lamphalo-dusk"><stop offset="0" stop-color="#ffc98a" stop-opacity=".4"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient>
  <linearGradient id="rs-sea-tank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fdcd8" stop-opacity=".55"/><stop offset="1" stop-color="#2f9fb0" stop-opacity=".75"/></linearGradient>
  <clipPath id="rs-sea-port"><circle cx="346" cy="40" r="7"/></clipPath>
</defs>
<rect x="0" y="0" width="400" height="3.6" fill="#123b45"/>
<path d="M0 60H400M0 92H400" stroke="#174855" stroke-width="1"/><path d="M0 61H400M0 93H400" stroke="#2a6a76" stroke-width=".5"/>
<g class="sea-ribs">${rib(66)}${rib(150)}${rib(296)}</g>
<rect x="0" y="3.8" width="400" height="4.8" fill="url(#rs-sea-pipe)"/>
${[40, 120, 200, 280, 360].map((x) => `<rect x="${x}" y="3" width="2.6" height="6.4" rx=".6" fill="#2a6a74"/>`).join('')}
<rect x="0" y="9.4" width="400" height="1.7" fill="#b9783f"/><path d="M0 9.8H400" stroke="#e3a86a" stroke-width=".45"/>
<!-- 표본 선반 (책 선반 자리): 불가사리와 산호 표본병, 가리비, 유리 부표 -->
<rect x="14" y="44" width="52" height="3" rx="1" fill="#3f8792"/><path d="M14.6 44.5H65.4" stroke="#7fc0c8" stroke-width=".4"/>
<path d="M19 47h3l-3 4zM61 47h-3l3 4z" fill="#2a6a74"/>
<rect x="15.6" y="31" width="9.6" height="13" rx="1.6" fill="#bff3ee" fill-opacity=".22" stroke="#d6fbf6" stroke-opacity=".6" stroke-width=".4"/>
<rect x="16.2" y="33.6" width="8.4" height="9.9" rx="1.2" fill="#6fd0c8" opacity=".35"/>
<path fill="#f08a3c" d="${star(20.4, 38.6, 3.1, 1)}"/><circle cx="20.4" cy="38.6" r=".5" fill="#ffc07a"/>
<rect x="15.9" y="29.4" width="9" height="2.1" rx=".6" fill="url(#rs-sea-brass)"/>
<rect x="27.4" y="29" width="8.2" height="15" rx="1.6" fill="#bff3ee" fill-opacity=".22" stroke="#d6fbf6" stroke-opacity=".6" stroke-width=".4"/>
<rect x="28" y="31.6" width="7" height="11.9" rx="1.2" fill="#6fd0c8" opacity=".35"/>
<path d="M31.5 43V37.2M31.5 39.8L29.4 37.4M31.5 38.6L33.6 36.4M29.4 37.4L29 35.2M33.6 36.4L33.9 34.2M31.5 37.2L31.2 34.6" stroke="#ff7f8a" stroke-width=".9" stroke-linecap="round" fill="none"/>
<rect x="27.7" y="27.4" width="7.6" height="2.1" rx=".6" fill="url(#rs-sea-brass)"/>
<path d="M44 44L39.2 38.6A6.4 6.4 0 0 1 48.8 38.6Z" fill="#f4cba8"/><path d="M44 44L40.6 37.4M44 44L42.6 36.6M44 44L44 36.3M44 44L45.4 36.6M44 44L47.4 37.4" stroke="#d99e78" stroke-width=".45"/>
<path d="M42.6 44.2h2.8l-.4-1.4h-2z" fill="#d99e78"/>
<circle cx="57.6" cy="39.4" r="4.3" fill="#5fbfae" fill-opacity=".6"/><path d="M53.3 39.4C55 38.4 60.2 38.4 61.9 39.4M57.6 35.1C56.4 37 56.4 41.8 57.6 43.7M57.6 35.1C58.8 37 58.8 41.8 57.6 43.7" stroke="#a8835a" stroke-width=".5" fill="none"/>
<path d="M56.2 35.4q1.4-2 2.8 0" stroke="#a8835a" stroke-width=".55" fill="none"/><path d="M55.4 37.4a2.6 2.6 0 0 1 1.6-1.2" stroke="#fff" stroke-width=".6" fill="none" opacity=".6"/>
<!-- 압력계와 수심 표시 (액자 자리) -->
<rect x="77" y="22.5" width="44" height="23" rx="2" fill="#164550" stroke="#2c6d78" stroke-width=".5"/>
<circle cx="88" cy="34" r="8.4" fill="url(#rs-sea-brass)"/><circle cx="88" cy="34" r="6.9" fill="#f2ecd9"/>
<path d="${ticks}" stroke="#3a3a36" stroke-width=".45"/>
<path d="M${n(88 + 6.3 * Math.cos(-0.32))} ${n(34 + 6.3 * Math.sin(-0.32))}A6.3 6.3 0 0 1 ${n(88 + 6.3 * Math.cos(Math.PI / 4))} ${n(34 + 6.3 * Math.sin(Math.PI / 4))}" fill="none" stroke="#d6453a" stroke-width=".9"/>
<g class="sea-needle"><path d="M88 34L85.2 29.2" stroke="#1d2326" stroke-width=".6" stroke-linecap="round"/></g><circle cx="88" cy="34" r=".9" fill="#2a2f33"/>
<rect x="99.5" y="28" width="18.5" height="12" rx="1" fill="#06262a"/>
<text x="101.4" y="35.4" font-family="ui-monospace, Consolas, monospace" font-size="5.2" font-weight="700" fill="#62f2c8">-42m</text>
<rect x="101.4" y="37.2" width="9" height=".8" rx=".4" fill="#2fa88a"/><rect x="110.8" y="37.2" width="5.4" height=".8" rx=".4" fill="#1b5b52"/>
<!-- 밸브 -->
<rect x="261" y="8" width="4.2" height="108" fill="url(#rs-sea-pipev)"/>
<rect x="260.2" y="14" width="5.8" height="2" rx=".5" fill="#2a6a74"/><rect x="260.2" y="98" width="5.8" height="2" rx=".5" fill="#2a6a74"/>
<rect x="259.4" y="36" width="7.4" height="8" rx="1.2" fill="#2a6a74"/>
<circle cx="263.1" cy="40" r="5.6" fill="none" stroke="#d24a3b" stroke-width="1.5"/>
<path d="M263.1 34.4V45.6M258.2 37.2L268 42.8M258.2 42.8L268 37.2" stroke="#b73b2f" stroke-width=".8"/><circle cx="263.1" cy="40" r="1.3" fill="#8f2c23"/>
<!-- 벽등 -->
${lampAt(69, 24)}${lampAt(299, 24)}
<!-- 침대 위 작은 현창 -->
<circle cx="346" cy="40" r="10.6" fill="#3f8792"/><circle cx="346" cy="40" r="10.6" fill="none" stroke="#123d47" stroke-width=".6"/>
<circle class="sea-water" cx="346" cy="40" r="7"/>
<g clip-path="url(#rs-sea-port)"><path class="sea-kelp" style="transform-origin:341px 48px" d="M340 48C339 44 342 41 340.6 37 340 35 341 33.5 342 33 342.2 35 341.6 37 342.6 40 343.6 43 342.4 46 342 48Z"/>
  <circle class="sea-bubble sea-rise" cx="349" cy="46" r=".8" style="animation-duration:5s"/><circle class="sea-bubble sea-rise" cx="350.5" cy="47" r=".55" style="animation-duration:5s;animation-delay:-2.4s"/></g>
<circle cx="346" cy="40" r="7.2" fill="none" stroke="#0d2a31" stroke-width=".9"/>
<path d="M341.6 35.8a6 6 0 0 1 4-2.4" stroke="#fff" stroke-width=".8" fill="none" opacity=".25" stroke-linecap="round"/>
${boltSvg([0, 60, 120, 180, 240, 300].map((a) => [346 + 8.9 * Math.cos(((a + 30) * Math.PI) / 180), 40 + 8.9 * Math.sin(((a + 30) * Math.PI) / 180)]), 0.75)}
`;

  const view = `
<defs>
  <clipPath id="rs-sea-glass"><path d="${stad(22)}"/></clipPath>
${[['', '#5fd0d9', '#1894ae', '#0a6582'], ['-dusk', '#8a7fb0', '#27508c', '#132d5c'], ['-night', '#0c2448', '#071735', '#030b1f']].map(([k, a, b, c]) =>
  `<linearGradient id="rs-sea-water${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`).join('')}
  <linearGradient id="rs-sea-ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-sea-ray2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc79a" stop-opacity=".3"/><stop offset="1" stop-color="#ffc79a" stop-opacity="0"/></linearGradient>
  <linearGradient id="rs-sea-frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fa7b1"/><stop offset=".5" stop-color="#357d88"/><stop offset="1" stop-color="#1f5b66"/></linearGradient>
  <radialGradient id="rs-sea-bell-p" cy=".7"><stop offset="0" stop-color="#ffe6f7"/><stop offset=".6" stop-color="#ff9fe0" stop-opacity=".85"/><stop offset="1" stop-color="#ff6fd0" stop-opacity=".6"/></radialGradient>
  <radialGradient id="rs-sea-bell-c" cy=".7"><stop offset="0" stop-color="#e9fffd"/><stop offset=".6" stop-color="#9ff8ff" stop-opacity=".85"/><stop offset="1" stop-color="#5fe6ff" stop-opacity=".6"/></radialGradient>
  <radialGradient id="rs-sea-halo-p"><stop offset="0" stop-color="#ff7ad6" stop-opacity=".45"/><stop offset="1" stop-color="#ff7ad6" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-sea-halo-c"><stop offset="0" stop-color="#5ff0ff" stop-opacity=".45"/><stop offset="1" stop-color="#5ff0ff" stop-opacity="0"/></radialGradient>
</defs>
<path d="${stad(28)}" fill="url(#rs-sea-frame)"/>
<path d="${stad(27.4)}" fill="none" stroke="#7fc0c8" stroke-width=".5" opacity=".7"/>
<g clip-path="url(#rs-sea-glass)">
  <rect class="sea-water" x="169" y="18" width="72" height="44"/>
  <g class="day sea-noon"><path class="sea-ray" fill="url(#rs-sea-ray)" d="M177 18H185L199 62H189Z"/><path class="sea-ray" fill="url(#rs-sea-ray)" d="M197 18H202L213 62H206Z"/><path class="sea-ray" fill="url(#rs-sea-ray)" d="M213 18H221L234 62H224Z"/></g>
  <g class="sea-dusk"><path class="sea-ray" fill="url(#rs-sea-ray2)" d="M186 18H192L204 62H196Z"/><path class="sea-ray" fill="url(#rs-sea-ray2)" d="M210 18H214L224 62H218Z"/></g>
  <g class="day" transform="translate(248 27)"><g class="sea-turtle" opacity=".85">
    <path fill="#7d9c6c" d="M-2 -2.2Q-.6 -5.4 3.4 -5.6 1.4 -3.8 .6 -2.2ZM-2 2.2Q-.6 5.4 3.4 5.6 1.4 3.8 .6 2.2ZM3.4 -1.6L5.8 -2.6 5.4 -.8ZM3.4 1.6L5.8 2.6 5.4 .8Z"/>
    <circle cx="-5.2" cy="-.2" r="1.35" fill="#7d9c6c"/><ellipse rx="4.4" ry="2.9" fill="#5b7a4c"/>
    <path d="M-2.2 0H2.4M-.9 -2.5L-.2 -.8M1.4 -2.4L.8 -.8M-.9 2.5L-.2 .8M1.4 2.4L.8 .8" stroke="#46613a" stroke-width=".45"/></g></g>
  ${kelp(176, 64, 30, 1.5, 0.4, 'sea-kelp2')}${kelp(184, 64, 22, 1.2, 1.7, 'sea-kelp2')}${kelp(229, 64, 26, 1.4, 2.6, 'sea-kelp2')}
  <path class="sea-sand" d="M168 54.6C177 52.6 186 53.4 194 55.2S212 56.8 221 54.8 236 52.4 242 53.6V63H168Z"/>
  <path class="sea-ripple" fill="none" stroke-width=".5" d="M176 58.6q3-1 6 0t6 0M197 60q3-1 6 0t6 0M222 58q3-1 6 0"/>
  <path class="sea-rock" d="M178 63c-1.2-4.6 2-7.6 6-7.4 4.2.2 6.8 3.4 6.2 7.4z"/><path class="sea-rock" d="M223 63c.4-3.8 3.4-5.8 6.6-5.4 3 .4 5 2.6 5 5.4z"/>
  <path class="sea-coral" fill="none" stroke-width=".9" stroke-linecap="round" d="M214 57V50.5M214 53.6L211.4 50.8M214 52.2L216.4 49.6M211.9 51.3L211 49.2M216 50L216.6 47.8M214 50.5L213.4 48.4"/>
  <path class="sea-starfish" d="${star(201, 59.3, 1.9)}"/>
  ${kelp(171, 64, 34, 1.9, 0.9, 'sea-kelp')}${kelp(180.5, 64, 21, 1.6, 2.2, 'sea-kelp')}${kelp(238, 64, 28, 1.8, 3.1, 'sea-kelp')}${kelp(233, 64, 17, 1.4, 4.4, 'sea-kelp')}
  <g class="day" transform="translate(146 0)"><g class="sea-school">${fish(0, 38, 0)}${fish(-6, 34.6, -.7)}${fish(-7, 41.2, -1.3)}${fish(-12.5, 37.4, -.4)}${fish(-14, 43, -1.9)}${fish(-19, 39.8, -1)}</g></g>
  <g>${[[231, 60, 1.1, 0], [233, 61, .7, -1.6], [230.4, 61, .55, -3.1], [232.4, 61, .9, -4.4], [190, 62, .6, -2.2]].map(([x, y, r, d]) => `<circle class="sea-bubble sea-rise" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${d}s"/>`).join('')}</g>
  <path d="${stad(22)}" fill="none" stroke="#021a22" stroke-width="4" opacity=".35"/>
  <path d="M175 30q3-7 10-10" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".12"/>
</g>
<path d="${stad(22.8)}" fill="none" stroke="#0c262d" stroke-width="1.7"/>
${boltSvg(bolts, 1.05)}
`;

  const floor = `
<path d="M0 143H400M0 173H400M0 203H400" stroke="#24606b" stroke-width=".5"/>
<g fill="#2a6c77">${[143, 173, 203].map((y) => Array.from({ length: 20 }, (_, i) => `<circle cx="${10 + i * 20}" cy="${y + 2.4}" r=".55"/>`).join('')).join('')}</g>
`;

  const props = `
<!-- 책상 위 작은 수조 (화분 자리): 해초, 산호, 흰동가리, 기포 -->
<rect x="32.6" y="79" width="16.8" height="15" rx=".8" fill="#9fe6e0" fill-opacity=".28"/>
<rect x="32.6" y="80.4" width="16.8" height="13.6" fill="url(#rs-sea-tank)"/>
<path d="M32.6 80.4H49.4" stroke="#d9fbf7" stroke-width=".5"/>
<path d="M32.6 94V91.6Q37 90.6 41 91.6T49.4 91.4V94Z" fill="#e3d3a3"/>
<path fill="#3aa877" d="M36.2 92C35.4 89 37.4 87 36.4 84.4 36 83 36.8 82 37.6 81.6 37.8 83.2 37.2 84.6 38 86.8 38.8 89 37.6 90.6 37.4 92Z"/>
<path fill="#5cb87a" d="M39 92C38.6 90 39.8 88.6 39.2 87 40.2 87.6 40.6 89.4 40 92Z"/>
<path d="M45.4 92V88.6M45.4 90.2L44 88.4M45.4 89.4L46.8 87.8" stroke="#ff7f8a" stroke-width=".8" stroke-linecap="round" fill="none"/>
<g class="sea-clown"><path fill="#ff8a2a" d="M40 86.2C40.8 85.3 42.4 85.2 43.4 86.2 42.4 87.2 40.8 87.1 40 86.2ZM40.3 86.2L39 85.4V87Z"/><path d="M41.2 85.5V86.9M42.4 85.5V86.9" stroke="#fff" stroke-width=".4"/></g>
<circle class="sea-bubble sea-rise2" cx="47.6" cy="91.6" r=".55"/><circle class="sea-bubble sea-rise2" cx="47.9" cy="91.8" r=".4" style="animation-delay:-1.3s"/>
<rect x="32.2" y="78.4" width="17.6" height="1.2" rx=".5" fill="#2a6670"/><rect x="32.2" y="93.6" width="17.6" height="1.3" rx=".5" fill="#2a6670"/>
<path d="M33.4 81.6V92.4" stroke="#fff" stroke-width=".5" opacity=".35"/>
<!-- 탁자 위 보온병과 김 나는 컵 -->
<g class="table-mug">
  <path class="sea-steam" d="M260.4 93.6q-1.4-2 0-4t0-4"/><path class="sea-steam" d="M262.8 93.6q-1.4-2 0-4t0-4"/>
  <path d="M249.4 89.2h-.9v6.6h.9" stroke="#8fb0b4" stroke-width=".9" fill="none"/>
  <rect x="249.8" y="86.2" width="6.6" height="13.8" rx="1.3" fill="#d9603f"/><rect x="250.4" y="86.8" width="1.2" height="12.6" rx=".6" fill="#ee8a68"/>
  <rect x="249.8" y="87.6" width="6.6" height="1.3" fill="#b8cfd2"/><rect x="249.8" y="97.4" width="6.6" height="1.3" fill="#b8cfd2"/>
  <rect x="250.7" y="84.4" width="4.8" height="2" rx=".6" fill="#4a5b60"/>
  <path d="M258.2 95.2h6.4l-.7 4.8h-5z" fill="#b8cfd2"/><path d="M258.2 95.2h6.4" stroke="#e8f4f5" stroke-width=".5"/>
  <ellipse cx="261.4" cy="95.6" rx="2.9" ry=".5" fill="#6b3e22"/>
</g>
<defs>
  <pattern id="rs-sea-ca" width="${CA.W}" height="${CA.H}" patternUnits="userSpaceOnUse" y="120"><path d="${CA.d}" fill="#c9fff6" fill-rule="evenodd"/></pattern>
  <pattern id="rs-sea-cb" width="${CB.W}" height="${CB.H}" patternUnits="userSpaceOnUse" y="121"><path d="${CB.d}" fill="#c9fff6" fill-rule="evenodd"/></pattern>
  <radialGradient id="rs-sea-cfade" cx=".51" cy=".28" r=".62"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="rs-sea-soft" filterUnits="userSpaceOnUse" x="0" y="118" width="400" height="114"><feGaussianBlur stdDeviation=".4"/></filter>
  <mask id="rs-sea-cmask" maskUnits="userSpaceOnUse" x="0" y="120" width="400" height="110"><rect x="0" y="120" width="400" height="110" fill="url(#rs-sea-cfade)"/></mask>
</defs>
<g class="sea-caustic" mask="url(#rs-sea-cmask)" filter="url(#rs-sea-soft)">
  <g class="sea-ca"><rect x="-70" y="120" width="540" height="110" fill="url(#rs-sea-ca)"/></g>
  <g class="sea-cb"><rect x="-10" y="120" width="540" height="110" fill="url(#rs-sea-cb)"/></g>
</g>
<path class="sea-dim" fill-rule="evenodd" d="M0 0H400V230H0Z${stad(22)}M346 33a7 7 0 1 0 .01 0Z"/>
`;

  const glow = `
<defs>
  <radialGradient id="rs-sea-tankglow"><stop offset="0" stop-color="#5fe6ff" stop-opacity=".22"/><stop offset="1" stop-color="#5fe6ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="rs-sea-bio" cx="205" cy="44" r="90" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#45d8ff" stop-opacity=".16"/><stop offset=".5" stop-color="#7a6bff" stop-opacity=".06"/><stop offset="1" stop-color="#45d8ff" stop-opacity="0"/></radialGradient>
</defs>
<g class="nite">
  <rect x="100" y="0" width="210" height="150" fill="url(#rs-sea-bio)"/>
  <g clip-path="url(#rs-sea-glass)">
    <g fill="#9ff8ff">${plankton}</g>
    ${jelly(183, 31, 1, 'p', 0)}${jelly(228.5, 44, .72, 'c', -2.2)}${jelly(212, 24, .45, 'p', -3.6)}
  </g>
  <rect x="32.6" y="80.4" width="16.8" height="13.6" fill="#5fe6ff" opacity=".16"/><ellipse cx="41" cy="86" rx="16" ry="11" fill="url(#rs-sea-tankglow)"/>
  <g clip-path="url(#rs-sea-port)"><circle cx="344" cy="38" r=".5" fill="#9ff8ff" class="sea-tw"/><circle cx="348.6" cy="42.4" r=".4" fill="#ff9be0" class="sea-tw" style="animation-delay:-1.2s"/></g>
</g>
<!-- 물빛 스탠드: 철망 씌운 둥근 등 -->
<rect x="281.6" y="57.2" width="7.2" height="3.8" rx="1" fill="#2a6670"/>
<path class="sea-dome" d="M278.4 57.6A6.8 9.4 0 0 1 292 57.6Z"/>
<path d="M285.2 48.2V57.6M281.6 57.6C281.6 52.4 283.2 49 285.2 48.2M288.8 57.6C288.8 52.4 287.2 49 285.2 48.2M279.2 53.8H291.2" stroke="#1d5560" stroke-width=".7" fill="none"/>
<circle cx="285.2" cy="47.8" r="1" fill="#2a6670"/>
`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['sea'] = { css, wall, view, floor, props, glow };
})();
