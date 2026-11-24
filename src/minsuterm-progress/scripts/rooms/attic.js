'use strict';
// 방 스타일: 다락방 — 비스듬한 지붕 아래 아늑한 다락 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮엔 지붕창 너머 나뭇가지에 참새가 앉고, 해질녘엔 전구 줄이 하나씩 켜지며, 밤엔 비가 지붕창을 두드린다.
// 잘 때는 전구를 끄고, 비가 그친 창으로 달빛이 든다.
(() => {
  const R = '#room[data-room="attic"]';
  const f = (n) => +n.toFixed(2);
  const stops = (st) => st.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op == null ? '' : ` stop-opacity="${op}"`}/>`).join('');
  const lg = (id, st, a = 'x2="0" y2="1"') => `<linearGradient id="rs-attic-${id}" ${a}>${stops(st)}</linearGradient>`;
  const rg = (id, a, st) => `<radialGradient id="rs-attic-${id}" ${a}>${stops(st)}</radialGradient>`;

  // 지붕창: 바깥 틀(벽에 뚫린 집 모양 구멍)과 안쪽 창. 그 사이가 창의 깊이(양옆 벽, 위 천장, 창턱)다
  const WIN = 'M175 63V32L205 17L235 32V63Z';
  const SASH = 'M175 63V32L205 17L235 32V63ZM175 32H235M205 17V63M175 46H235';

  // 전구 줄: 두 가닥이 처지며 걸린다 (2차 베지어). 전구는 줄 위의 t 자리에 매달린다
  const qb = (p, t) => [0, 1].map((k) => (1 - t) * (1 - t) * p[0][k] + 2 * t * (1 - t) * p[1][k] + t * t * p[2][k]);
  const WIRES = [[[36, 53.2], [125, 92], [163, 30]], [[247, 30], [305, 70], [362, 52.3]]];
  const BULBS = [...[.12, .27, .42, .57, .72, .87].map((t) => qb(WIRES[0], t)), ...[.12, .5, .64, .78, .92].map((t) => qb(WIRES[1], t))];

  // 비탈 천장: 경사(왼쪽 0,70 → 150,0)를 x축으로 돌려 그린다. 서까래는 경사와 나란한 띠
  const slope = (t) => `<g transform="${t} rotate(-25.02)">
      <rect x="-20" y="-80" width="210" height="80" class="at-ceil"/>
      <path class="at-plank" d="${Array.from({ length: 22 }, (_, i) => `M-20 ${-3.4 * (i + 1)}H190`).join('')}"/>
      ${[17, 41, 65].map((d) => `<rect x="-20" y="${-d}" width="210" height="2.6" fill="#000" opacity=".16"/><rect x="-20" y="${-d - 6.4}" width="210" height="6.4" class="at-rafter"/><rect x="-20" y="${-d - 6.4}" width="210" height=".8" fill="#fff" opacity=".12"/>`).join('')}
      <rect x="-20" y="-3.2" width="210" height="3.4" class="at-fascia"/>
    </g>`;
  const SLOPES = ['translate(0 70)', 'translate(400 70) scale(-1 1)'];

  const defs = `<defs>
    ${lg('ao', [[0, '#3a2412', .28], [1, '#3a2412', 0]])}
    ${lg('sky', [[0, '#8ec3ea'], [1, '#d8ecf6']])}${lg('sky-k', [[0, '#8f78a8'], [.5, '#e98f6a'], [1, '#f6c78a']])}${lg('sky-n', [[0, '#252d40'], [1, '#3d4760']])}${lg('sky-a', [[0, '#141b2e'], [1, '#2a3550']])}
    ${rg('halo', '', [[0, '#ffd88a', .75], [.35, '#ffc867', .28], [1, '#ffc867', 0]])}
    ${rg('moonlit', 'cx=".5" cy=".3" r=".7"', [[0, '#e8eefc', .5], [1, '#e8eefc', 0]])}
    ${lg('glass', [[0, '#fff', 0], [.5, '#fff', .16], [1, '#fff', 0]], 'x1="0" y1="0" x2="1" y2="1"')}
    <clipPath id="rs-attic-cl"><path d="M0 0H150L0 70ZM250 0H400V70Z"/></clipPath>
    <clipPath id="rs-attic-win"><path d="${WIN}"/></clipPath>
    <mask id="rs-attic-mk"><path d="${WIN}" fill="#fff"/><path d="${SASH}" stroke="#000" stroke-width="2.2" fill="none"/></mask>
    <filter id="rs-attic-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".5"/></filter>
  </defs>`;

  // 벽: 세로 널판(판마다 톤이 조금 다르다), 비탈 천장과 서까래, 처마 그늘, 전구 줄, 상자와 라디오가 있는 선반
  const BOARDS = Array.from({ length: 24 }, (_, i) => i * 17 + 4);
  const shelf = `<path d="M68 57.4v4.4h3.4M126 57.4v4.4h-3.4" stroke="#3b3631" stroke-width="1" fill="none"/>
    <rect x="66.4" y="49.4" width="13.6" height="5.8" rx="1" fill="#4f6f8f"/><rect x="66" y="48.8" width="14.4" height="1.6" rx=".6" fill="#c9a24a"/><rect x="66.4" y="53.8" width="13.6" height=".9" fill="#c9a24a"/><ellipse cx="73.2" cy="51.9" rx="3.2" ry="1.3" fill="#e9dcb8" opacity=".75"/>
    <rect x="82" y="48.6" width="18.4" height="6.6" fill="#b98d5e"/><rect x="82" y="48.6" width="18.4" height="1.2" fill="#a37a4e"/><rect x="85.6" y="51" width="6.4" height="2.8" fill="#efe6d2"/><path d="M86.6 52h4.4M86.6 53h3" stroke="#8a7a66" stroke-width=".35"/>
    <rect x="84" y="44" width="14.6" height="4.6" fill="#d9c49f"/><rect x="83.6" y="44" width="15.4" height="1.4" fill="#cbb48a"/><path d="M91.2 44v4.6" stroke="#b8453a" stroke-width=".7"/>
    <g transform="translate(-6.4 0)"><path d="M110.4 55.2V46.2Q110.4 41.6 121.2 41.6Q132 41.6 132 46.2V55.2Z" fill="#8a5a34"/><path d="M111.4 46.4Q111.6 42.6 121.2 42.6" stroke="#fff" stroke-width=".5" opacity=".18" fill="none"/>
    <path d="M112.8 53.8V47.8Q112.8 44.4 117.2 44.4Q121.6 44.4 121.6 47.8V53.8Z" fill="#dcc79e"/><path d="M114.6 45.4V53.8M116.4 44.6V53.8M118.2 44.6V53.8M120 45.4V53.8" stroke="#9a6b42" stroke-width=".55"/>
    <circle cx="126.8" cy="47.8" r="2.7" fill="#efe3c0"/><path d="M126.8 47.8L128.4 46" stroke="#c0392b" stroke-width=".45"/><circle cx="124.8" cy="52.6" r="1" fill="#3a2a1e"/><circle cx="128.8" cy="52.6" r="1" fill="#3a2a1e"/></g>
    <rect x="62" y="55.2" width="68" height="2.4" rx=".5" fill="#7a5232"/><rect x="62" y="55.2" width="68" height=".5" fill="#fff" opacity=".15"/>`;
  const wall = `${defs}
    <g class="at-boards" stroke-width=".6">${BOARDS.map((x, i) => (i % 3 === 1 ? `<rect x="${x}" y="0" width="17" height="116" fill="#000" opacity=".035" stroke="none"/>` : '') + `<path d="M${x} 0V116"/>`).join('')}</g>
    <g clip-path="url(#rs-attic-cl)">${SLOPES.map(slope).join('')}</g>
    ${SLOPES.map((t) => `<rect transform="${t} rotate(-25.02)" x="-20" y="0" width="200" height="6" fill="url(#rs-attic-ao)"/>`).join('')}
    ${shelf}
    <g fill="none" stroke="#2f2a26" stroke-width=".45">${WIRES.map(([a, b, c]) => `<path d="M${a}Q${b} ${c}"/>`).join('')}</g>
    <g class="at-bulbs">${BULBS.map(([x, y]) => `<rect x="${f(x - .8)}" y="${f(y - .2)}" width="1.6" height="2" rx=".3" fill="#2f2a26"/><path class="at-bulb" d="M${f(x)} ${f(y + 1.6)}c1.5 0 1.9 1.3 1.9 2.4 0 1.4-1 2.5-1.9 2.5s-1.9-1.1-1.9-2.5c0-1.1.4-2.4 1.9-2.4z"/><path class="at-fil" d="M${f(x - .35)} ${f(y + 1.8)}v1.9h.7v-1.9"/>`).join('')}</g>`;

  // 창밖: 하늘, 이웃집 지붕과 굴뚝(밤엔 불 켜진 창), 낮엔 나뭇가지와 참새, 밤엔 비, 잘 때는 비 갠 하늘의 달
  const LEAVES = [[228, 23, -20], [224, 27.6, 30], [219.6, 24.6, -40], [214, 30.2, 10], [231, 29, 60], [209.6, 34.4, -30], [220.4, 33.2, 50], [233.4, 21, -60], [226, 32.6, -10], [205.4, 31.6, 20]];
  const DROPS = [[180, 40, .9], [187, 52, .7], [193, 36, .6], [199, 58, 1], [210, 44, .8], [216, 54, .6], [223, 39, .9], [229, 50, .7], [184, 59, .6], [196, 27, .7], [214, 24, .6], [231, 58, .8], [178, 48, .5], [221, 60, .6]];
  const rain = Array.from({ length: 24 }, (_, i) => { const x = 172 + ((i * 37) % 70), y = (i * 23) % 60; return `M${x} ${y}l-1.4 5`; }).join('');
  const view = `
    <path d="M165 66V26L205 6L245 26V66Z" class="at-dorm"/>
    <path d="M165 26L205 6V17L175 32Z" class="at-soffit"/><path d="M245 26L205 6V17L235 32Z" class="at-soffit2"/>
    <path d="M165 26L175 32V63L165 66Z" class="at-cheek"/><path d="M245 26L235 32V63L245 66Z" class="at-cheek2"/>
    <g clip-path="url(#rs-attic-win)">
      <rect x="174" y="16" width="62" height="48" class="at-sky"/>
      <g class="day"><path class="at-dcloud" d="M180 30a3 3 0 0 1 5.6-1.4 3.6 3.6 0 0 1 6.6 1 2.4 2.4 0 0 1 .4 4.6h-12.2a2.2 2.2 0 0 1-.4-4.2z"/></g>
      <g class="at-moon"><circle cx="222" cy="29" r="4.4" fill="#f3ecd0"/><path d="M211 33a3.6 3.6 0 0 1 6.4-1.6 4 4 0 0 1 7.6 1.2 2.8 2.8 0 0 1 .2 5.4h-14a2.4 2.4 0 0 1-.2-5z" fill="#3a4560" opacity=".92"/></g>
      <g class="nite at-cloud"><path d="M174 30a5 5 0 0 1 9-2.4 6 6 0 0 1 11 1.6 4 4 0 0 1 .6 7.8H174Z"/><path d="M206 25a4.4 4.4 0 0 1 8-2 5.4 5.4 0 0 1 10 1.4 3.6 3.6 0 0 1 .4 7H206Z"/></g>
      <path class="at-roof1" d="M174 64V55L188.4 47.6L202.8 55V64Z"/><rect class="at-brick" x="191.4" y="45" width="3.6" height="5.6"/><rect class="at-brick" x="190.8" y="44.4" width="4.8" height="1.2"/>
      <path class="at-roof2" d="M199 64V56.4L220 50L238 56.4V64Z"/><path class="at-roof2b" d="M199 56.4L220 50L238 56.4" fill="none" stroke-width=".8"/>
      <rect class="at-lit-w" x="215.6" y="57.2" width="3.4" height="3.4"/><rect class="at-lit-w2" x="181.4" y="57.6" width="3" height="3"/>
      <g class="day at-branch">
        <path d="M238 20C232 22 226 25.6 220 28.2C214 30.8 208 32.8 202 35.2" stroke="#5a4130" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M226 25.2L231 30.6M216 29.8L213 35.4M222 27.4L226.6 22" stroke="#5a4130" stroke-width=".7" fill="none" stroke-linecap="round"/>
        ${LEAVES.map(([x, y, r]) => `<path d="M${x} ${y}c1.3-1.6 3.4-1.6 4.4 0-1 1.6-3.1 1.6-4.4 0z" transform="rotate(${r} ${x} ${y})" class="at-leaf"/>`).join('')}
        <g class="at-bird"><g transform="translate(213.2 30.4)">
          <path d="M-2.6 .2L-5.4 1.6L-5 .4Z" fill="#6a4c34"/>
          <ellipse rx="2.7" ry="1.75" fill="#8d6a48"/><ellipse cx=".5" cy=".7" rx="1.8" ry=".95" fill="#e8d8bc"/>
          <path d="M-1.6 -.8q1.4-.9 2.8 0" stroke="#5e4330" stroke-width=".7" fill="none"/>
          <circle cx="2.4" cy="-1.5" r="1.35" fill="#8d6a48"/><circle cx="2.9" cy="-1.7" r=".32" fill="#1b1410"/><path d="M3.6 -1.4L4.6 -1.1L3.6 -.8Z" fill="#3b2a1a"/>
          <path d="M-.2 1.6v1.4M.8 1.6v1.4" stroke="#4a3626" stroke-width=".3"/></g></g>
      </g>
      <g class="at-rain"><g class="at-rain1" stroke="#b9c8dc" stroke-width=".4" opacity=".7"><path d="${rain}"/><path d="${rain}" transform="translate(16.8 -60)"/></g></g>
      <g class="nite at-drops">${DROPS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfdbea" opacity=".55"/><circle cx="${f(x - r * .35)}" cy="${f(y - r * .35)}" r="${f(r * .32)}" fill="#fff" opacity=".8"/>`).join('')}
        <g class="at-trickle"><path d="M203 30v9" stroke="#d6e2f0" stroke-width=".35" opacity=".5"/><circle cx="203" cy="39.4" r=".75" fill="#dfe8f4" opacity=".8"/></g></g>
      <rect x="174" y="16" width="62" height="48" fill="url(#rs-attic-glass)"/>
    </g>
    <path d="${SASH}" class="at-sash"/>
    <path d="M165 66L175 63H235L245 66Z" class="at-sill"/>
    <path d="M165 66V26L205 6L245 26V66" class="at-casing"/>`;

  // 바닥: 오래된 널마루(판마다 톤, 장선 자리의 못, )와 땋은 타원 러그
  const SEAMS = [126, 133, 141, 150.5, 161, 173, 186.5, 201.5, 218];
  const ROWS = [120, ...SEAMS, 230];
  const JOINT = [[96, 300], [40, 230], [150, 352], [70, 268], [198, 380], [24, 120, 316], [176, 330], [60, 246], [110, 290, 392], [200]];
  const BRAID = ['#8b4a36', '#a9703f', '#bf9858', '#6d7466', '#8b4a36', '#5f6f80', '#a9703f', '#8b4a36'];
  const floor = `
    ${ROWS.slice(0, -1).map((y, i) => (i % 2 ? `<rect x="0" y="${y}" width="400" height="${f(ROWS[i + 1] - y)}" fill="#000" opacity=".05"/>` : '')).join('')}
    <g stroke="var(--floor-line)" fill="none">${SEAMS.map((y, i) => `<path d="M0 ${y}H400" stroke-width="${f(.7 + i * .09)}"/>`).join('')}
      <path stroke-width=".8" d="${JOINT.map((xs, i) => xs.map((x) => `M${x} ${ROWS[i]}V${ROWS[i + 1]}`).join('')).join('')}"/></g>
    <g class="at-nail">${ROWS.slice(0, -1).map((y, i) => [36, 116, 196, 276, 356].map((x) => `<circle cx="${x + (i % 3) - 1}" cy="${f((y + ROWS[i + 1]) / 2)}" r="${f(.42 + i * .05)}"/>`).join('')).join('')}</g>
    <g transform="translate(200 166) scale(1 .3)">
      <ellipse rx="165" ry="56.7" fill="#000" opacity=".12" transform="translate(0 6)"/>
      ${BRAID.map((c, k) => `<ellipse rx="${f(161 - k * 6.6)}" ry="${f(52.7 - k * 6.6)}" fill="none" stroke="${c}" stroke-width="6.8"/><ellipse rx="${f(161 - k * 6.6)}" ry="${f(52.7 - k * 6.6)}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="5" stroke-dasharray="1.6 2.6"/>`).join('')}
      <ellipse rx="108" ry="2.4" fill="#8b4a36"/>
    </g>`;

  // 소품: 책상 위 싹 틔운 유리병, 바닥의 상자 더미, 탁자 위 이 빠진 법랑 컵, 스탠드 갓의 주름, 창으로 든 빛
  const jar = `<path d="M39.2 90.2C39 86 38.4 83 36.6 80.4M40 90.2C40.4 85.4 41.6 82.2 43.6 79.4M39.6 90.2V77" stroke="#6f9a4c" stroke-width=".6" fill="none"/>
    <g fill="#8cc063"><ellipse cx="35.4" cy="79.8" rx="1.6" ry=".9" transform="rotate(30 35.4 79.8)"/><ellipse cx="37.6" cy="79.6" rx="1.4" ry=".8" transform="rotate(-30 37.6 79.6)"/><ellipse cx="42.8" cy="78.8" rx="1.5" ry=".85" transform="rotate(-25 42.8 78.8)"/><ellipse cx="44.8" cy="79.4" rx="1.3" ry=".75" transform="rotate(25 44.8 79.4)"/><ellipse cx="38.5" cy="76.4" rx="1.4" ry=".8" transform="rotate(25 38.5 76.4)"/><ellipse cx="40.7" cy="76.4" rx="1.4" ry=".8" transform="rotate(-25 40.7 76.4)"/></g>
    <rect x="35.2" y="89.6" width="9.6" height="4.6" rx="1" fill="#6b4a32"/><rect x="35.2" y="88.6" width="9.6" height="1.4" fill="#a98a5e"/><path d="M38 90.4l-.8 2.4M41.4 90.4l.6 2.6" stroke="#e9dcc0" stroke-width=".3" opacity=".7"/>
    <rect x="35" y="83.4" width="10" height="11" rx="1.2" fill="#d9eef0" opacity=".28" stroke="#b6d0d4" stroke-width=".45"/><rect x="34.6" y="82.6" width="10.8" height="1.6" rx=".6" fill="#c9dfe2" opacity=".8"/>
    <path d="M36.4 85v7.4" stroke="#fff" stroke-width=".6" opacity=".55"/>`;
  const boxes = `<rect x="1" y="118" width="26.4" height="19.4" fill="#b88a58"/><rect x="1" y="118" width="26.4" height="2" fill="#a87b4a"/><rect x="12.4" y="118" width="3.4" height="19.4" fill="#d6bd8a" opacity=".85"/>
    <rect x="4" y="125.6" width="6.2" height="4.4" fill="#efe6d2"/><path d="M5 127h4.2M5 128.6h3" stroke="#8a7a66" stroke-width=".35"/><path d="M20.4 125.4l1.2-1.6 1.2 1.6M20.4 129l1.2-1.6 1.2 1.6" stroke="#b8453a" stroke-width=".45" fill="none"/>
    <rect x="3.4" y="103.4" width="21.6" height="14.6" fill="#5e3f26"/>${[104, 109, 113.6].map((y) => `<rect x="3.4" y="${y}" width="21.6" height="3.6" fill="#a77a4e"/>`).join('')}<rect x="3.4" y="103.4" width="2" height="14.6" fill="#8a6038"/><rect x="23" y="103.4" width="2" height="14.6" fill="#8a6038"/>
    <rect x="7" y="96" width="14" height="7.4" fill="#6f9a95"/><rect x="7" y="99" width="14" height="1.4" fill="#e9dcc0"/><ellipse cx="14" cy="96" rx="7.4" ry="1.3" fill="#82aca6"/>`;
  const cup = `<g class="table-mug">
    <path class="steam s1" d="M254 88q-1.6-1.8 0-3.6t0-3.6"/><path class="steam s2" d="M257.4 88q-1.6-1.8 0-3.6t0-3.6"/>
    <path d="M261.2 92.6q3.4 0 3.4 3.1t-3.4 3.1" stroke="#2c3a5a" stroke-width="2" fill="none"/><path d="M261.2 92.6q3.4 0 3.4 3.1t-3.4 3.1" stroke="#f1eee6" stroke-width="1" fill="none"/>
    <path d="M250.6 90.4H261.6V98.6Q261.6 100 260.2 100H252Q250.6 100 250.6 98.6Z" fill="#f1eee6"/><rect x="250.4" y="89.8" width="11.4" height="1.3" rx=".6" fill="#2c3a5a"/>
    <path d="M250.6 98.8H261.6" stroke="#2c3a5a" stroke-width=".8"/><path d="M252.2 91.6v6.4" stroke="#fff" stroke-width=".8" opacity=".6"/>
    <path d="M257.4 91.1l.9.9 1-.6-.3 1.2.8.4-1.4.3-.5-.9z" fill="#26304a"/><path d="M253.8 96.2l1 .2.3.9-.8.5-.9-.4z" fill="#26304a"/><ellipse cx="255.9" cy="90.4" rx="3.6" ry=".42" fill="#6b4a32"/>
  </g>`;
  // 창(175..235 × 17..63)을 바닥으로 비춘 빛. 창 아래쪽이 벽 쪽(먼 쪽)에 닿고, 해가 낮을수록 길고 비스듬하다
  const lp = (cls, m) => `<g class="at-lp ${cls}" transform="matrix(${m})"><path d="${WIN}" mask="url(#rs-attic-mk)"/></g>`;
  const props = `
    ${jar}${boxes}${cup}
    <path d="M281.4 48.6L280 60.6M285.2 48.4V60.8M289 48.6L290.4 60.6" stroke="#b08e5e" stroke-width=".4" opacity=".55"/>
    <g filter="url(#rs-attic-soft)">${lp('at-lp-d', '1 0 -.3043 -.4565 23.17 157.76')}${lp('at-lp-k', '1 0 -.9565 -.7826 67.26 185.3')}${lp('at-lp-a', '1 0 .1304 -.3913 -13.22 152.65')}</g>
    <rect class="at-dim" x="0" y="0" width="400" height="230"/>`;

  // 빛: 전구(해질녘에 하나씩 켜지고 밤엔 환하다), 라디오 다이얼, 비 갠 밤의 달빛
  const glow = `
    <g class="at-lights">${BULBS.map(([x, y], i) => `<g class="at-on" style="--i:${i}"><circle cx="${f(x)}" cy="${f(y + 4.2)}" r="8" fill="url(#rs-attic-halo)"/><path d="M${f(x)} ${f(y + 1.6)}c1.5 0 1.9 1.3 1.9 2.4 0 1.4-1 2.5-1.9 2.5s-1.9-1.1-1.9-2.5c0-1.1.4-2.4 1.9-2.4z" fill="#ffe7a8"/><circle cx="${f(x)}" cy="${f(y + 4.2)}" r=".9" fill="#fffbe8"/></g>`).join('')}</g>
    <g class="at-dial" transform="translate(-6.4 0)"><circle cx="126.8" cy="47.8" r="5" fill="url(#rs-attic-halo)"/><circle cx="126.8" cy="47.8" r="2.7" fill="#ffd98c" opacity=".85"/><path d="M126.8 47.8L128.4 46" stroke="#c0392b" stroke-width=".45"/></g>
    <path class="at-moonwin" d="${WIN}" fill="url(#rs-attic-moonlit)"/>`;

  const N = (sel) => `${R}.sky-night ${sel}, ${R}.night ${sel}`;
  const css = `
  ${R}[id] { --wall: #c9a57d; --wall-line: #6e4a2d; --floor: #8f6646; --floor-line: #6a4529; --wood: #a37650; --wood-dark: #6e4a2d; --metal: #4a3c30; --frame: #6e4a2d;
    --sheet: #efe6d6; --pillow: #f5efe3; --blanket: #7e5a8c; --blanket-dark: #654674; --lamp: #ffcf7a; --shade: #ead2a4; --rug: #9c4f36; --rug-line: #c79a40;
    --arm: #a4664a; --arm-dark: #8a5239; --cushion: #c79a40; }
  ${R}[id].sky-dusk { --wall: #d3a877; --floor: #976644; }
  ${R}[id].sky-night, ${R}[id].night { --wall: #b0906d; --floor: #80593c; --floor-line: #5e3d24; }
  ${R} .floor-line, ${R} .rug, ${R} .rug-line, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
  ${R} .sky, ${R} rect.frame[y="12"], ${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} .pot, ${R} .leaf, ${R} rect.wood[x="14"][y="44"], ${R} #scene > .table-mug { display: none; }
  ${R} .at-boards { stroke: #aa835b; } ${R}.sky-dusk .at-boards { stroke: #b58757; } ${N('.at-boards')} { stroke: #94734f; }
  ${R} .at-nail { fill: #3b2616; opacity: .45; }
  ${R} .at-ceil { fill: #8e6747; } ${R} .at-plank { stroke: #7a5638; stroke-width: .45; opacity: .7; } ${R} .at-rafter { fill: #6e4a2d; } ${R} .at-fascia { fill: #5a3b22; }
  ${R}.sky-dusk .at-ceil { fill: #956643; } ${N('.at-ceil')} { fill: #725237; }
  ${R} .at-dorm { fill: #b08a62; } ${R} .at-soffit { fill: #7f5c3d; } ${R} .at-soffit2 { fill: #8c6748; } ${R} .at-cheek { fill: #94704d; } ${R} .at-cheek2 { fill: #ad8862; } ${R} .at-sill { fill: #d8b78f; }
  ${R} .at-casing { fill: none; stroke: #6e4a2d; stroke-width: 2.4; stroke-linejoin: round; } ${R} .at-sash { fill: none; stroke: #efe6d4; stroke-width: 2; stroke-linejoin: round; }
  ${N('.at-sash')} { stroke: #b9b0a0; } ${N('.at-sill')} { fill: #a88a68; }
  ${R} .at-sky { fill: url(#rs-attic-sky); } ${R}.sky-dusk .at-sky { fill: url(#rs-attic-sky-k); } ${R}.sky-night .at-sky { fill: url(#rs-attic-sky-n); } ${R}.night .at-sky { fill: url(#rs-attic-sky-a); }
  ${R} .at-roof1 { fill: #6c7888; } ${R} .at-roof2 { fill: #b46c4c; } ${R} .at-roof2b { stroke: #8e5038; } ${R} .at-brick { fill: #9a5a44; }
  ${R}.sky-dusk .at-roof1 { fill: #4e4a5c; } ${R}.sky-dusk .at-roof2 { fill: #7c4a44; } ${R}.sky-dusk .at-brick { fill: #5e3a36; }
  ${N('.at-roof1')} { fill: #262c38; } ${N('.at-roof2')} { fill: #33282b; } ${N('.at-roof2b')} { stroke: #241c1e; } ${N('.at-brick')} { fill: #2c2224; }
  ${R} .at-lit-w, ${R} .at-lit-w2 { fill: #3e4654; } ${R}.sky-dusk .at-lit-w { fill: #ffcf7a; } ${N('.at-lit-w')} { fill: #ffcf7a; } ${R}.sky-night .at-lit-w2 { fill: #ffd98f; }
  ${R} .at-leaf { fill: #6aa055; } ${R}.sky-dusk .at-leaf { fill: #5d5a3a; } ${R}.sky-dusk .at-branch path { stroke: #3e2c24; } ${R}.sky-dusk .at-bird { display: none; }
  ${R} .at-bird { transform-origin: 213px 31px; animation: rs-attic-hop 6s ease-in-out infinite; }
  ${R} .at-dcloud { fill: #fff; opacity: .85; } ${R}.sky-dusk .at-dcloud { fill: #f7c2a6; } ${R} .at-cloud { fill: #4a5470; opacity: .9; } ${R}.night .at-cloud { display: none; }
  ${R} .at-moon, ${R} .at-rain { display: none; } ${R}.night .at-moon { display: inline; } ${R}.sky-night .at-rain { display: inline; }
  ${R} .at-rain1 { animation: rs-attic-rain 1.3s linear infinite; }
  ${R} .at-trickle { animation: rs-attic-trickle 7s ease-in infinite; } ${R}.night .at-trickle { display: none; }
  ${R} .at-bulb { fill: #fbf3df; fill-opacity: .55; stroke: #cbb894; stroke-width: .3; } ${R} .at-fil { stroke: #8a6a4a; stroke-width: .25; fill: none; }
  ${R} .at-lights, ${R} .at-dial, ${R} .at-moonwin, ${R} .at-dim { display: none; }
  ${R}.sky-dusk .at-lights, ${R}.sky-night .at-lights, ${R}.sky-night .at-dial, ${R}.night .at-moonwin, ${R}.sky-night .at-dim { display: inline; }
  ${R}.sky-dusk .at-on { animation: rs-attic-on .5s calc(.15s + var(--i) * .22s) ease-out both; }
  ${R}.sky-dusk .at-on circle:first-child { opacity: .7; }
  ${R}.sky-night .at-on:nth-child(4) { animation: rs-attic-flicker 5s steps(1) infinite; }
  ${R} .at-dim { fill: #171c2c; opacity: .26; } ${R} .at-moonwin { opacity: .55; }
  ${R} .at-lp path { fill: #fff6dc; } ${R} .at-lp-d { opacity: .3; } ${R} .at-lp-k { opacity: .42; } ${R} .at-lp-k path { fill: #ffad5a; } ${R} .at-lp-a { opacity: .2; } ${R} .at-lp-a path { fill: #dfe8ff; }
  ${R} .at-lp-k, ${R} .at-lp-a, ${R}.sky-dusk .at-lp-d, ${N('.at-lp-d')} { display: none; }
  ${R}.sky-dusk .at-lp-k, ${R}.night .at-lp-a { display: inline; }
  ${R} #lampGlow { opacity: .2; } ${R}.sky-dusk #lampGlow { opacity: .7; } ${R}.sky-night #lampGlow { opacity: 1; } ${R}.night #lampGlow { opacity: 0; }
  @keyframes rs-attic-on { 0% { opacity: 0; } 40% { opacity: .9; } 55% { opacity: .3; } 100% { opacity: 1; } }
  @keyframes rs-attic-flicker { 0%, 100% { opacity: 1; } 62% { opacity: .35; } 64% { opacity: 1; } 66% { opacity: .5; } 68% { opacity: 1; } }
  @keyframes rs-attic-rain { from { transform: translate(0, 0); } to { transform: translate(-16.8px, 60px); } }
  @keyframes rs-attic-trickle { 0%, 20% { transform: translateY(0); opacity: 0; } 30% { opacity: 1; } 90% { transform: translateY(16px); opacity: .9; } 100% { transform: translateY(18px); opacity: 0; } }
  @keyframes rs-attic-hop { 0%, 70%, 100% { transform: rotate(0); } 74% { transform: rotate(-8deg); } 78% { transform: rotate(0); } 84% { transform: translateY(-.8px); } 88% { transform: translateY(0); } }`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['attic'] = { css, wall, view, floor, props, glow };
})();
