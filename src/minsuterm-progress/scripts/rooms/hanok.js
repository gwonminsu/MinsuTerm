'use strict';
// 방 스타일: 한옥 방 — 창호지로 빛이 번지는 조용한 사랑방 (MinsuTerm 진행도, 꾸미기 → 진행도 → 방 스타일)
// 낮엔 띠살 미닫이 한 짝을 밀어 두어 마당의 감나무가 보이고, 해질녘엔 창호지가 호박색으로 물들며 좌등을 켜고,
// 밤엔 창을 닫아 달빛과 감나무 그림자가 창호지에 번진다. 잘 때는 등잔을 낮춘다.
(() => {
  const R = '#room[data-room="hanok"]';
  const f = (n) => +n.toFixed(2);

  // 띠살 미닫이 한 짝 (x0, 16)에서 33.5×46: 울거미 안에 세로살 8개, 위·가운데·아래에 가로살 띠
  const SAL_W = 33.5, SAL_T = 1.7;
  function salD(x0) {
    const ix = x0 + SAL_T, iw = SAL_W - 2 * SAL_T, iy = 16 + SAL_T, ih = 46 - 2 * SAL_T;
    let d = '';
    for (let i = 1; i <= 8; i++) { const x = f(ix + (iw * i) / 9); d += `M${x} ${iy}V${f(iy + ih)}`; }
    for (const c of [iy + 3.8, iy + ih / 2, iy + ih - 3.8]) for (let k = -1.5; k <= 1.5; k++) d += `M${ix} ${f(c + k * 2.1)}H${f(ix + iw)}`;
    return d;
  }
  const panel = (x0) => `<path class="hk-sal" d="${salD(x0)}"/><rect class="hk-stile" x="${f(x0 + SAL_T / 2)}" y="${f(16 + SAL_T / 2)}" width="${SAL_W - SAL_T}" height="${46 - SAL_T}"/>`;

  // 감나무 가지 (낮엔 마당에, 밤엔 창호지 위 그림자로). stroke 색은 쓰는 쪽(use)이 준다
  const BR = [
    ['M228 44C225 40 221 38.5 216.5 37C213.5 36 210.5 33.5 208.5 30.5C206.5 27.5 204 26 200 25.5', 1.15],
    ['M221 38.3C220 35 219 32.5 216 29.5L213.6 27.4', .7], ['M213 34.8L211.6 31.8', .5], ['M209.6 32.2L206.4 33.6', .5],
    ['M228.6 43.5C229 39 230.5 35 233.5 31C235 28.5 237 27 241 25.6', 1.05], ['M230.6 36.5C228 33 226.5 29 226 24.5C225 22.5 223 21 220.5 20', .75],
    ['M233 31.5C233.5 27.5 233 24 231.5 20.5', .6], ['M226 27.6L228.8 25.6', .45], ['M235.6 28.6L236.8 31.2', .45], ['M222.6 21.2L221.4 23.4', .4],
  ];
  const GAM = [[209.2, 32.4], [213.6, 36.4], [213.2, 28.8], [219.4, 33.8], [221.2, 24.2], [225.4, 26.6], [228.9, 26.8], [231.7, 22.4], [236.9, 31.9], [238, 26.9], [224.4, 38.4], [206.3, 34.6]];
  const LEAF = [[217, 30.6, -30, '#c8582c'], [227.2, 23.2, 25, '#d68a31'], [234.2, 26.6, -10, '#b9472a'], [211.4, 30.4, 40, '#c9782e'], [230.4, 31.4, 70, '#a8662c'], [223.6, 36.2, -60, '#d0a13a']];

  // 마루 널 이음매(앞으로 올수록 넓다), 널 끝 이음, 결
  const SEAMS = [125, 130.6, 137, 144.4, 152.8, 162.4, 173.2, 185.4, 199, 214];
  const JOINTS = [[88, 120, 125], [262, 120, 125], [36, 125, 130.6], [196, 125, 130.6], [348, 125, 130.6], [130, 130.6, 137], [300, 130.6, 137], [62, 137, 144.4], [236, 137, 144.4],
    [168, 144.4, 152.8], [372, 144.4, 152.8], [24, 152.8, 162.4], [282, 152.8, 162.4], [120, 162.4, 173.2], [338, 162.4, 173.2], [210, 173.2, 185.4], [56, 185.4, 199], [312, 185.4, 199], [150, 199, 214], [380, 199, 214], [236, 214, 230]];
  const GRAIN = [[14, 122.6, 70], [150, 127.8, 90], [292, 133.6, 80], [40, 140.6, 110], [250, 148.4, 100], [96, 157.4, 120], [318, 167.6, 70], [20, 178.8, 90], [180, 191.8, 130], [262, 206, 100], [70, 221, 140]];

  // 그라데이션: [offset, 색, 불투명도?]
  const stops = (st) => st.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op == null ? '' : ` stop-opacity="${op}"`}/>`).join('');
  const lg = (id, st, a = 'x2="0" y2="1"') => `<linearGradient id="rs-hanok-${id}" ${a}>${stops(st)}</linearGradient>`;
  const rg = (id, a, st) => `<radialGradient id="rs-hanok-${id}" ${a}>${stops(st)}</radialGradient>`;
  const U = 'gradientUnits="userSpaceOnUse"';
  const defs = `<defs>
    ${lg('ao', [[0, '#5a3818', .16], [1, '#5a3818', 0]])}${lg('paper', [[0, '#fdf9ee'], [1, '#f1e6cb']])}${lg('paper-k', [[0, '#fbd394'], [1, '#eaa65e']])}
    ${rg('moon', `${U} cx="226" cy="27" r="44"`, [[0, '#f4f5f2'], [.22, '#d9dfe8'], [1, '#97a5bd']])}
    ${lg('warm', [[0, '#ffbe72', .42], [1, '#ffbe72', 0]], `${U} x1="240" x2="196"`)}
    ${lg('sky', [[0, '#9fc8e4'], [1, '#e2eef0']])}${lg('sky-k', [[0, '#a77a9c'], [.45, '#ee9a68'], [1, '#f8cf8c']])}
    ${rg('jar', 'cx=".38" cy=".34" r=".75"', [[0, '#fffdf7'], [.6, '#f1ebdd'], [1, '#d9cfbb']])}
    ${rg('lit', 'cy=".58" r=".62"', [[0, '#fff1c2'], [.55, '#ffcc7a'], [1, '#f0a24c']])}
    ${rg('spread', `${U} cx="285" cy="56" r="120"`, [[0, '#ffb35c', .3], [.5, '#ffb35c', .1], [1, '#ffb35c', 0]])}
    ${rg('veil', `${U} cx="205" cy="39" r="58"`, [[0, '#dfe7f8', .22], [1, '#dfe7f8', 0]])}
    <pattern id="rs-hanok-weave" width="6" height="1.6" patternUnits="userSpaceOnUse"><rect width="6" height="1.6" fill="#dbc58d"/><path d="M0 1.3H6" stroke="#c3a96a" stroke-width=".5"/><path d="M3 0V1.3" stroke="#cdb57b" stroke-width=".35"/></pattern>
    <filter id="rs-hanok-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".45"/></filter>
    <clipPath id="rs-hanok-open"><rect x="205.5" y="16" width="32.5" height="46"/></clipPath>
    <clipPath id="rs-hanok-win"><rect x="172" y="16" width="66" height="46"/></clipPath>
    <clipPath id="rs-hanok-mat"><path d="M64 152H336L350 184H50Z"/></clipPath>
    <mask id="rs-hanok-mo"><rect x="172" y="16" width="66" height="46" fill="#fff"/><g class="hk-mk">${panel(172)}</g></mask>
    <mask id="rs-hanok-ms"><rect x="172" y="16" width="66" height="46" fill="#fff"/><g class="hk-mk">${panel(172)}${panel(204.5)}</g></mask>
    <g id="rs-hanok-br" fill="none" stroke-linecap="round">${BR.map(([d, w]) => `<path d="${d}" stroke-width="${w}"/>`).join('')}</g>
    <g id="rs-hanok-gam"><circle r="1.32"/><circle cx="-.42" cy="-.42" r=".42" fill="#fff" opacity=".35"/></g>
  </defs>`;

  // 벽: 반자 끝, 상인방·중인방·하인방, 기둥, 한지 이음, 선반의 고서와 달항아리, 족자(홍매)
  const POSTS = [[0, 6.5], [143, 7], [318, 7], [394, 6]];
  // 책가도처럼 칸을 나눈 걸이 선반: 고서와 필통, 달항아리, 두루마리, 벼루와 연적
  const books = [[17, 29.1, 21], [17.6, 26.8, 19.8], [17, 24.5, 21], [18.2, 22.2, 18.6]].map(([x, y, w], i) =>
    `<rect x="${x}" y="${y}" width="${w}" height="2.3" fill="#f1e5c6"/><path d="M${x} ${f(y + .25)}H${f(x + w)}M${x} ${f(y + 2.05)}H${f(x + w)}" stroke="${['#b98a43', '#c99c52', '#a97b3c', '#c4964d'][i]}" stroke-width=".5"/>`
    + `<path d="${[0, 1, 2, 3, 4].map((k) => `M${f(x + 1.6 + k * ((w - 3.2) / 4))} ${y}v2.3`).join('')}" stroke="#8d3b2c" stroke-width=".42"/>`).join('');
  const scrolls = [[16.6, 43.2, 22.4, '#efe2c0', '#b4473a'], [18.2, 39.9, 20.6, '#9fb2aa', '#3f5a7d'], [17.2, 36.6, 16.4, '#e6cf9a', '#b4473a']].map(([x, y, w, c, t]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="3.2" rx="1.5" fill="${c}"/><rect x="${x}" y="${f(y + .4)}" width="${w}" height=".7" rx=".35" fill="#fff" opacity=".25"/>`
    + `<rect x="${f(x - 1)}" y="${f(y + .5)}" width="1.6" height="2.2" rx=".5" fill="#4d311c"/><rect x="${f(x + w - .6)}" y="${f(y + .5)}" width="1.6" height="2.2" rx=".5" fill="#4d311c"/>`
    + `<path d="M${f(x + w * .55)} ${y}v3.2" stroke="${t}" stroke-width=".7"/>`).join('');
  const shelf = `<path d="M17 11.2V16.4M63 11.2V16.4" stroke="#5a3a22" stroke-width=".5"/>
    <rect x="14" y="17.6" width="52" height="29" fill="#cdb891"/><rect x="14" y="17.6" width="52" height="1.6" fill="#5a3818" opacity=".12"/><rect x="14" y="33" width="52" height="1.4" fill="#5a3818" opacity=".12"/>
    ${books}
    <rect x="41.4" y="24.6" width="5.2" height="6.8" rx=".5" fill="#ece6d6"/><path d="M41.4 26.2h5.2M41.4 29.6h5.2" stroke="#3f5a8d" stroke-width=".45"/>
    <path d="M42.6 24.6L41.8 19.8M44 24.6V19.4M45.4 24.6L46.4 20.2" stroke="#7a5232" stroke-width=".55"/><path d="M41.8 19.8l-.25-1.4M44 19.4v-1.4M46.4 20.2l.3-1.3" stroke="#2c2622" stroke-width=".8" stroke-linecap="round"/>
    <g transform="translate(58.4 31.4) scale(.76) translate(-53 -44)"><path d="M50.4 33.4H55.6V34.4C59.6 34.9 60.8 37.4 60.8 39.2C60.8 41.4 59.2 43.3 57 44H49C46.8 43.3 45.2 41.4 45.2 39.2C45.2 37.4 46.4 34.9 50.4 34.4Z" fill="url(#rs-hanok-jar)" stroke="#cfc4ae" stroke-width=".5"/></g>
    ${scrolls}
    <rect x="44.6" y="44.2" width="11.6" height="2.4" rx=".6" fill="#3d3a3a"/><rect x="46" y="44.5" width="4.2" height=".8" rx=".4" fill="#1f1d1e"/><rect x="51.8" y="40.2" width="1.5" height="4" rx=".3" fill="#262222"/>
    <path d="M58.8 46.6C58 45.6 58.2 43.2 60.4 42.4C61.4 42 62.6 42.4 63.2 43.4C63.8 44.6 63.4 46 62.6 46.6Z" fill="#9cc0ad"/><circle cx="61" cy="42.2" r=".55" fill="#7fa694"/>
    <g fill="#6a4429"><rect x="12.4" y="16" width="55.2" height="1.8" rx=".5"/><rect x="12.4" y="46.4" width="55.2" height="2.2" rx=".5"/><rect x="13.2" y="31.4" width="53.6" height="1.6"/>
      <rect x="12.6" y="16" width="1.8" height="32.6"/><rect x="65.6" y="16" width="1.8" height="32.6"/><rect x="49.8" y="17.6" width="1.4" height="14"/><rect x="41.6" y="33" width="1.4" height="13.6"/></g>
    <rect x="12.4" y="16" width="55.2" height=".5" fill="#fff" opacity=".12"/>`;
  const wall = `${defs}
    <g class="hk-seams" stroke-width=".55" fill="none">
      <path d="M38 12V66M72 12V66M106 12V66M158 12V66M262 12V66M292 12V66M352 12V66M372 12V66M38 71V111M72 71V111M106 71V111M180 71V111M214 71V111M248 71V111M282 71V111M352 71V111"/>
    </g>
    <rect x="0" y="0" width="400" height="3.4" fill="#8c623d"/>
    <rect class="hk-beam" x="0" y="3.4" width="400" height="7.8"/><rect x="0" y="4.1" width="400" height=".6" fill="#fff" opacity=".1"/>
    <rect x="0" y="11.2" width="400" height="5" fill="url(#rs-hanok-ao)"/>
    <rect class="hk-beam" x="0" y="66.6" width="400" height="4.4"/><rect x="0" y="71" width="400" height="3.4" fill="url(#rs-hanok-ao)"/>
    <rect class="hk-beam" x="0" y="111" width="400" height="9"/><rect x="0" y="111.6" width="400" height=".6" fill="#fff" opacity=".1"/>
    ${POSTS.map(([x, w]) => `<rect class="hk-post" x="${x}" y="3" width="${w}" height="117"/><rect x="${f(x + w - 1.1)}" y="3" width="1.1" height="117" fill="#3d2614" opacity=".28"/><rect x="${f(x + .5)}" y="3" width=".7" height="117" fill="#fff" opacity=".1"/>`).join('')}
    ${shelf}
    <g>
      <path d="M94 12.4L88.4 19M94 12.4L99.6 19" stroke="#6b4a32" stroke-width=".45" fill="none"/><circle cx="94" cy="12.4" r=".8" fill="#4a3020"/>
      <rect x="86.4" y="18.6" width="15.2" height="2" rx=".7" fill="#5a3a22"/>
      <rect x="87.2" y="20.4" width="13.6" height="39.8" fill="#a9b6ae"/><rect x="87.2" y="20.4" width="13.6" height="39.8" fill="none" stroke="#8e9d95" stroke-width=".35"/>
      <rect x="88.9" y="26.2" width="10.2" height="29.6" fill="#f3ead4"/>
      <path d="M90.2 54.6C91.2 50 93.6 47.6 93.2 43.4C92.9 40.4 95.4 37.6 97.4 33.6M93.3 45.6C95 45 96.6 43.4 97.6 41.6M93.2 41.2C92 39.6 91.6 37.8 92 35.6" stroke="#3a2f29" stroke-width=".55" fill="none" stroke-linecap="round"/>
      <g fill="#c4463b">${[[97.4, 33.6], [96.3, 35.4], [97.6, 41.6], [95.6, 43.9], [92, 35.6], [92.7, 38.4], [94.6, 39.2], [91.4, 49]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".62"/>`).join('')}</g>
      <path d="M97.6 27.8v1.4M97.6 30v1.1M97.6 31.9v1.2" stroke="#3a2f29" stroke-width=".45"/><rect x="97" y="33.8" width="1.2" height="1.2" fill="#b8382f" opacity=".85" transform="translate(-.1 16)"/>
      <rect x="85.6" y="59.8" width="16.8" height="2.4" rx=".6" fill="#5a3a22"/><rect x="84.4" y="59.4" width="1.8" height="3.2" rx=".7" fill="#3e2716"/><rect x="101.8" y="59.4" width="1.8" height="3.2" rx=".7" fill="#3e2716"/>
    </g>`;

  // 창: 낮·해질녘엔 오른쪽 짝을 왼쪽으로 밀어 두어 마당이 보이고, 밤엔 두 짝을 닫아 창호지에 달빛이 번진다
  const yard = `<g clip-path="url(#rs-hanok-open)">
      <rect class="hk-csky" x="205" y="16" width="34" height="46"/>
      <circle class="hk-dsun" cx="215" cy="34.4" r="3.4"/>
      <path class="hk-mt1" d="M205 38.6C209 35.6 212 34.2 215.5 35.2C218.5 36.2 220 33.6 224 32.4C228 31.4 232 33.6 239 36.4V48H205Z"/>
      <path class="hk-mt2" d="M205 42C210 40 214 39.3 219 40.6C224 42 229 39.7 239 41.4V48H205Z"/>
      <rect class="hk-dam" x="205" y="47.2" width="34" height="9"/><rect x="205" y="47.2" width="34" height="1.2" fill="#000" opacity=".08"/>
      <path class="hk-giwa" d="M204 47.8L205.8 44.6H238.4L240 47.8Z"/><rect x="205.6" y="43.6" width="33.2" height="1.3" rx=".5" class="hk-giwa2"/>
      <path class="hk-golt" d="${Array.from({ length: 19 }, (_, i) => `M${f(206.3 + i * 1.75)} 44.9V47`).join('')}"/>
      <g class="hk-giwa2">${Array.from({ length: 20 }, (_, i) => `<circle cx="${f(205.4 + i * 1.75)}" cy="47.3" r=".55"/>`).join('')}</g>
      <rect class="hk-yard" x="205" y="56.2" width="34" height="5.8"/><rect x="205" y="56.2" width="34" height="1" fill="#000" opacity=".08"/>
      <g class="hk-tree">
        <path class="hk-trunk" d="M228.2 61.2C228.7 56 228.2 52 227.4 48.5C226.9 46.4 227.3 44.6 228.2 43.2L229.6 43.6C229.2 45.2 229.3 46.8 229.9 48.6C230.9 52 231.2 56 231.2 61.2Z"/>
        <use href="#rs-hanok-br" class="hk-br"/>
        ${LEAF.map(([x, y, r, c]) => `<ellipse cx="${x}" cy="${y}" rx="1.5" ry=".75" transform="rotate(${r} ${x} ${y})" fill="${c}" class="hk-leaf"/>`).join('')}
        <g class="hk-gam">${GAM.map(([x, y]) => `<use href="#rs-hanok-gam" x="${x}" y="${y}"/><path d="M${f(x - .7)} ${f(y - 1.15)}h1.4" stroke="#4d4a24" stroke-width=".5"/>`).join('')}</g>
        <g class="hk-kkachi" transform="translate(216.6 35.1)">
          <path d="M-1.6 .4L-5.6 2.6" stroke="#15191d" stroke-width=".85" stroke-linecap="round"/>
          <ellipse rx="2" ry="1.15" transform="rotate(-14)" fill="#1a1e22"/><circle cx="1.85" cy="-1.15" r=".95" fill="#1a1e22"/>
          <path d="M2.7 -1.3L3.8 -1.05L2.75 -.75Z" fill="#2a2a2a"/>
          <ellipse cx=".35" cy=".45" rx="1.05" ry=".55" fill="#f4f4f0"/><ellipse cx="-.5" cy="-.35" rx=".95" ry=".32" fill="#f4f4f0" transform="rotate(-14 -.5 -.35)"/>
          <path d="M-.1 1.1v1.2M.6 1.1v1.2" stroke="#222" stroke-width=".3"/>
        </g>
      </g>
    </g>`;
  const view = `<g class="day">
      ${yard}
      <rect class="hk-paper" x="172" y="16" width="${SAL_W}" height="46"/>
      ${panel(172)}
      <rect x="205.5" y="16" width="1.4" height="46" fill="#000" opacity=".12"/>
    </g>
    <g class="nite">
      <rect x="172" y="16" width="66" height="46" fill="url(#rs-hanok-moon)"/>
      <g clip-path="url(#rs-hanok-win)" filter="url(#rs-hanok-soft)" opacity=".5">
        <g transform="translate(-9 3) scale(1.04)"><use href="#rs-hanok-br" stroke="#56667f"/><path d="M227.6 66C228 56 227.5 50 228.2 43.2L230 43.6C230 50 231.4 56 231.6 66Z" fill="#56667f"/>
        <g fill="#56667f">${GAM.map(([x, y]) => `<use href="#rs-hanok-gam" x="${x}" y="${y}"/>`).join('')}</g></g>
      </g>
      <rect x="172" y="16" width="66" height="46" fill="url(#rs-hanok-warm)"/>
      ${panel(172)}${panel(204.5)}
    </g>`;

  // 바닥: 긴 마루널(이음·결·윤), 창 쪽 햇빛 자리, 화문석
  const motif = (cx, cy, r, s) => `<g transform="translate(${cx} ${cy}) scale(1 ${s})">
      <circle r="${r}" fill="none" stroke="#b4473a" stroke-width="1.1"/>
      ${Array.from({ length: 8 }, (_, i) => `<ellipse cx="0" cy="${f(-r * .58)}" rx="${f(r * .2)}" ry="${f(r * .34)}" transform="rotate(${i * 45})" fill="#b4473a" opacity=".85"/>`).join('')}
      <circle r="${f(r * .3)}" fill="#3f5a7d"/><circle r="${f(r * .12)}" fill="#d9b04a"/></g>`;
  const floor = `
    <g stroke="var(--floor-line)" fill="none">${SEAMS.map((y, i) => `<path d="M0 ${y}H400" stroke-width="${f(.55 + i * .06)}"/>`).join('')}
      <path stroke-width=".7" d="${JOINTS.map(([x, a, b]) => `M${x} ${a}V${b}`).join('')}"/></g>
    <g class="hk-grain" fill="none" stroke-width=".45" stroke-linecap="round">${GRAIN.map(([x, y, w]) => `<path d="M${x} ${y}q${f(w / 2)} -.6 ${w} 0"/>`).join('')}</g>
    <path d="M64 152H336L350 184H50Z" fill="url(#rs-hanok-weave)"/>
    <g clip-path="url(#rs-hanok-mat)" fill="none">
      <path d="M64 152H336L350 184H50Z" stroke="#a7874b" stroke-width="3.2"/>
      <path d="M70.6 155.2H329.4L340.6 180.8H59.4Z" stroke="#b4473a" stroke-width=".8"/>
      <path d="M73.4 156.8H326.6L336.8 179.2H63.2Z" stroke="#3f5a7d" stroke-width=".55"/>
      ${motif(200, 168, 21, .3)}${motif(98, 168, 7, .3)}${motif(302, 168, 7, .3)}
    </g>
    <path d="M64 152H336L350 184H50Z" fill="none" stroke="#8f733f" stroke-width=".7"/>`;

  // 좌등: 나무 틀에 한지를 바른 등. 안에 등잔이 있다
  const LAMP = 'M279.2 44.6H291.2V61.4H279.2Z';
  const lampFrame = `<rect x="277.3" y="42.6" width="15.8" height="2.2" rx=".6" fill="#4d311c"/><path d="M283.4 42.6q1.8-2.4 3.6 0" stroke="#4d311c" stroke-width=".7" fill="none"/>
      <path d="M285.2 44.6V61.4M279.2 50.4H291.2M279.2 55.8H291.2" stroke="#6a4429" stroke-width=".55"/>
      <rect x="278.2" y="44.4" width="1.2" height="17.2" fill="#5a3a22"/><rect x="291" y="44.4" width="1.2" height="17.2" fill="#5a3a22"/>
      <rect x="277.6" y="61.2" width="15.2" height="2.4" rx=".6" fill="#4d311c"/>`;
  // 창(172..238 × 16..62)으로 든 빛이 마루에 떨어진 자리. 한지를 지난 빛엔 창살 그림자가 지고, 해가 낮을수록 길고 비스듬하다
  const lp = (cls, m, open) => `<g class="hk-lp ${cls}" transform="matrix(${m})"><g mask="url(#rs-hanok-${open ? 'mo' : 'ms'})">`
    + (open ? '<rect class="hk-lp-dim" x="172" y="16" width="33.5" height="46"/><rect class="hk-lp-sun" x="205.5" y="16" width="32.5" height="46"/>'
      : '<rect class="hk-lp-dim" x="172" y="16" width="66" height="46"/>') + '</g></g>';
  // 책상 위 난초(청화백자 분), 탁자 위 다반에 다관과 찻잔
  const nan = `<g class="hk-nan" fill="none" stroke-linecap="round">
      <path d="M38.6 87.4C37.6 82 34.6 78.4 29.6 77.4M39 87.4C38.8 81 40.6 76.6 44.8 73.8M39.4 87.4C41 82.6 44.6 80.4 50 80.8M38.8 87.4C38.2 83 36.6 80.4 33.8 79.4M39.2 87.4C39.8 83.6 39.4 79.4 37.4 75.4" stroke="#3e7a4c" stroke-width=".7"/>
      <path d="M39.6 87C41.2 83.4 43.2 81.2 45.8 79.8" stroke="#8aa86a" stroke-width=".35"/>
      <g fill="#ebe8c4" stroke="none"><ellipse cx="46.2" cy="79.4" rx="1.1" ry=".6" transform="rotate(-30 46.2 79.4)"/><ellipse cx="44.2" cy="80.6" rx="1" ry=".55" transform="rotate(20 44.2 80.6)"/></g></g>
    <path d="M34.6 87.6H43.4L42.6 92.6Q42.3 94.4 40.6 94.4H37.4Q35.7 94.4 35.4 92.6Z" fill="#f3f1ea"/><rect x="34.2" y="86.8" width="9.6" height="1.3" rx=".5" fill="#e3dfd2"/>
    <path d="M34.9 89.2H43.1M35.6 92.7H42.4" stroke="#3f5a8d" stroke-width=".45"/>`;
  const tea = `<g class="table-mug">
      <path class="steam s1" d="M262.6 93.4q-1.4-1.6 0-3.2t0-3.2"/><path class="steam s2" d="M264.4 93.4q-1.4-1.6 0-3.2t0-3.2"/>
      <rect x="246.4" y="98.2" width="23.2" height="1.9" rx=".5" fill="#5a3a22"/><rect x="246.4" y="98.2" width="23.2" height=".5" fill="#fff" opacity=".15"/>
      <path d="M250.2 93.4L247 90.6L246.3 91.1L249.6 96.2Z" fill="#8db3a0"/>
      <path d="M257 92.6Q259.8 93 259.4 95.6Q259 97.2 257 97.4" stroke="#7fa694" stroke-width=".85" fill="none"/>
      <path d="M249.4 95.2C249.4 92.6 251.2 91 253.4 91C255.6 91 257.4 92.6 257.4 95.2C257.4 96.9 256.6 97.8 255.4 98.2H251.4C250.2 97.8 249.4 96.9 249.4 95.2Z" fill="#9cc0ad"/>
      <path d="M250.6 93.4C251.2 92.2 252.2 91.6 253.4 91.6" stroke="#fff" stroke-width=".5" opacity=".45" fill="none"/>
      <path d="M251.3 91.3Q253.4 89.8 255.5 91.3Z" fill="#8db3a0"/><circle cx="253.4" cy="89.7" r=".65" fill="#7fa694"/>
      <path d="M260.6 95.2H266L265.4 97.4Q265 98.2 264 98.2H262.6Q261.6 98.2 261.2 97.4Z" fill="#b8d3c5"/><ellipse cx="263.3" cy="95.2" rx="2.7" ry=".45" fill="#c9a352"/>
    </g>`;
  const props = `
    ${nan}${tea}
    <g filter="url(#rs-hanok-soft)">${lp('hk-lp-d', '1 0 -.3043 -.4348 22.87 155.96', true)}${lp('hk-lp-k', '1 0 -.9565 -.7391 69.3 181.83', true)}${lp('hk-lp-n', '1 0 .1304 -.3696 -10.09 149.91', false)}</g>
    <path d="${LAMP}" fill="#f2e7cd"/><path d="M283.2 57.2h4l-.8 1.2h-2.4zM284.8 58.4h.8v3h-.8z" fill="#6a4429" opacity=".3"/>${lampFrame}
    <ellipse cx="383.6" cy="99.5" rx="1.5" ry="5.4" fill="#b8473a"/><ellipse cx="383.7" cy="99.5" rx=".8" ry="2.9" fill="#3f5a7d"/><ellipse cx="383.7" cy="99.5" rx=".35" ry="1.2" fill="#e2b84f"/>
    <rect class="hk-dim" x="0" y="0" width="400" height="230"/>`;
  const glow = `
    <rect class="hk-spread" x="160" y="0" width="240" height="180" fill="url(#rs-hanok-spread)"/>
    <g class="hk-veil"><circle cx="205" cy="39" r="58" fill="url(#rs-hanok-veil)"/><rect x="172" y="16" width="66" height="46" fill="url(#rs-hanok-moon)" mask="url(#rs-hanok-ms)" opacity=".5"/></g>
    <g class="hk-lit">
      <path d="${LAMP}" fill="url(#rs-hanok-lit)"/>
      <g filter="url(#rs-hanok-soft)"><ellipse class="hk-flame" cx="285.2" cy="54.2" rx="1.5" ry="2.6" fill="#fff6d6"/></g>
      <path d="M283.2 57.2h4l-.8 1.2h-2.4zM284.8 58.4h.8v3h-.8z" fill="#8a4a1c" opacity=".45"/>
      ${lampFrame}
    </g>`;

  // 낮·해질녘 채움색
  const DUSK = { paper: ['url(#rs-hanok-paper)', 'url(#rs-hanok-paper-k)'], csky: ['url(#rs-hanok-sky)', 'url(#rs-hanok-sky-k)'], mt1: ['#b7c6d1', '#b88a9a'], mt2: ['#98aebd', '#8f6c86'],
    dam: ['#dcc8a0', '#b88c70'], giwa: ['#5a6169', '#4d4550'], giwa2: ['#474d56', '#3c3540'], yard: ['#e4d3ad', '#c79b78'], trunk: ['#4b3527', '#3a2722'] };
  const css = `
  ${R}[id] { --wall: #ede1c6; --wall-line: #6a4429; --floor: #cea670; --floor-line: #b4884f; --wood: #9f6e43; --wood-dark: #6a4429; --metal: #5b3b24; --frame: #6a4429; --sky: #4a3020;
    --sheet: #f4eee2; --pillow: #f7f2e8; --blanket: #b54a3c; --blanket-dark: #8f3529; --mug: #8fb6a4; --lamp: #ffbf6b; --shade: #f2e7cd; --rug: #d9c38a; --rug-line: #b89a5a;
    --arm: #4a6290; --arm-dark: #3b5078; --cushion: #c79a52; --laptop: #b9b4aa; }
  ${R}[id].sky-dusk { --wall: #efd2a0; --floor: #cf9e62; --floor-line: #b07c46; }
  ${R}[id].sky-night, ${R}[id].night { --wall: #d9c6a0; --floor: #b08a57; --floor-line: #967142; }
  ${R} .floor-line, ${R} .rug, ${R} .rug-line, ${R} .poster, ${R} .poster-sky, ${R} .hill1, ${R} .hill2, ${R} .win-bar, ${R} .sun, ${R} .cloud, ${R} .moon, ${R} .moon-cut, ${R} .star,
  ${R} .shade, ${R} .sky, ${R} .book1, ${R} .book2, ${R} .book3, ${R} .book4, ${R} .pot, ${R} .leaf, ${R} rect.wood[x="14"][y="44"], ${R} #scene > .table-mug { display: none; }
  ${R} .frame { rx: .6; }
  ${R} .hk-beam, ${R} .hk-post { fill: #8c6139; } ${R} .hk-wood { fill: var(--wood-dark); }
  ${R} .hk-seams { stroke: #d9c8a3; opacity: .55; }
  ${R}.sky-night .hk-seams, ${R}.night .hk-seams { stroke: #c4af87; }
  ${Object.entries(DUSK).map(([k, [d, e]]) => `${R} .hk-${k} { fill: ${d}; } ${R}.sky-dusk .hk-${k} { fill: ${e}; }`).join(' ')}
  ${R} .hk-sal { stroke: #6f4a2c; stroke-width: .62; fill: none; } ${R} .hk-stile { fill: none; stroke: #7c5333; stroke-width: ${SAL_T}; }
  ${R}.sky-night .hk-sal, ${R}.night .hk-sal { stroke: #4b3220; } ${R}.sky-night .hk-stile, ${R}.night .hk-stile { stroke: #573a24; }
  ${R} .hk-dsun { display: none; fill: #ffd27a; } ${R}.sky-dusk .hk-dsun { display: inline; }
  ${R} .hk-golt { stroke: #444a52; stroke-width: .35; }
  ${R} .hk-br { stroke: #4b3527; } ${R}.sky-dusk .hk-br { stroke: #3a2722; }
  ${R} .hk-gam { fill: #ee8a2b; } ${R}.sky-dusk .hk-gam { fill: #f08a2a; } ${R}.sky-dusk .hk-leaf { opacity: .75; } ${R}.sky-dusk .hk-kkachi { display: none; }
  ${R} .hk-tree { transform-origin: 229.6px 61px; animation: rs-hanok-sway 7s ease-in-out infinite alternate; }
  ${R} .hk-grain { stroke: #e2c08c; opacity: .55; } ${R}.sky-night .hk-grain, ${R}.night .hk-grain { stroke: #c49d68; opacity: .4; }
  ${R} .hk-mk .hk-sal, ${R} .hk-mk .hk-stile { stroke: #000; }
  ${R} .hk-lp-k, ${R} .hk-lp-n, ${R}.sky-dusk .hk-lp-d, ${R}.sky-night .hk-lp-d, ${R}.night .hk-lp-d { display: none; }
  ${R}.sky-dusk .hk-lp-k, ${R}.sky-night .hk-lp-n, ${R}.night .hk-lp-n { display: inline; }
  ${R} .hk-lp-dim { fill: #fff8e2; opacity: .3; } ${R} .hk-lp-sun { fill: #fff8e2; opacity: .5; }
  ${R} .hk-lp-k .hk-lp-dim { fill: #ffb35a; opacity: .2; } ${R} .hk-lp-k .hk-lp-sun { fill: #ffb35a; opacity: .5; }
  ${R} .hk-lp-n .hk-lp-dim { fill: #e4ecff; opacity: .16; }
  ${R} #lampGlow { opacity: 0; } ${R}.sky-dusk #lampGlow { opacity: .75; } ${R}.sky-night #lampGlow { opacity: 1; } ${R}.night #lampGlow { opacity: .35; }
  ${R} .hk-lit, ${R} .hk-spread, ${R} .hk-veil, ${R} .hk-dim { display: none; }
  ${R}.sky-dusk .hk-lit, ${R}.sky-night .hk-lit, ${R}.night .hk-lit, ${R}.sky-night .hk-spread, ${R}.night .hk-spread, ${R}.sky-night .hk-veil, ${R}.night .hk-veil, ${R}.sky-night .hk-dim { display: inline; }
  ${R} .hk-dim { fill: #1a2036; opacity: .2; } ${R}.sky-night .hk-veil { opacity: .55; } ${R}.night .hk-lp-n .hk-lp-dim { opacity: .24; }
  ${R}.sky-dusk .hk-spread { display: inline; opacity: .55; } ${R}.night .hk-spread { opacity: .35; } ${R}.night .hk-lit { opacity: .62; } ${R}.night .hk-flame { scale: .7; }
  ${R} .hk-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: rs-hanok-flick 2.4s ease-in-out infinite; }
  ${R}.night .hk-flame { animation-duration: 3.6s; }
  @keyframes rs-hanok-sway { from { transform: rotate(-.7deg); } to { transform: rotate(.7deg); } }
  @keyframes rs-hanok-flick { 0%, 100% { transform: scale(1, 1); opacity: 1; } 30% { transform: scale(.88, 1.1); opacity: .9; } 55% { transform: scale(1.06, .92); } 80% { transform: scale(.95, 1.04); opacity: .95; } }`;

  (window.MT_ROOMS = window.MT_ROOMS || {})['hanok'] = { css, wall, view, floor, props, glow };
})();
