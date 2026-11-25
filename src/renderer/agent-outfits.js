'use strict';
/*
 * 에이전트 캐릭터: what the room's Claude and Codex wear (꾸미기 → 진행도 → 에이전트 캐릭터, settings.agentOutfit) and the
 * mark that tells other sessions apart (settings.agentMark). One source for both windows: the app draws the picker
 * previews from it, and the progress server serves it to 진행도 (/agent-outfits.js), which dresses the characters in
 * the room. Motion lives in agent-outfits.css.
 *
 * Everything is drawn in a character's own coordinates (its body centred on 0,0, as page.html draws it), placed by
 * anchors that differ between the two: a hat's base and scale, the eyes, the neck, the ears, the whole body, the back.
 * Parts with class ao-hat come off while the character sleeps (it wears its nightcap then).
 */
const AGENT_OUTFITS = [
  // [id, name, the room it comes from (the picker shows it as a hashtag), what it is (for the ones from no room)]
  ['none', '없음', '', '기본 모습'],
  ['space-helmet', '우주 헬멧', 'space', ''],
  ['space-antenna', '안테나 머리띠', 'space', ''],
  ['space-headset', '교신 헤드셋', 'space', ''],
  ['hanok-gat', '갓', 'hanok', ''],
  ['hanok-bokgeon', '복건', 'hanok', ''],
  ['hanok-jobawi', '조바위', 'hanok', ''],
  ['neon-visor', 'LED 바이저', 'neon', ''],
  ['neon-phones', '네온 헤드폰', 'neon', ''],
  ['neon-cat', '네온 고양이 귀', 'neon', ''],
  ['sea-goggles', '물안경과 스노클', 'sea', ''],
  ['sea-jelly', '해파리 모자', 'sea', ''],
  ['sea-star', '불가사리 핀', 'sea', ''],
  ['attic-beanie', '니트 비니', 'attic', ''],
  ['attic-scarf', '빨간 목도리', 'attic', ''],
  ['attic-muffs', '털 귀마개', 'attic', ''],
  ['library-glasses', '동그란 안경과 나비넥타이', 'library', ''],
  ['library-cap', '학사모', 'library', ''],
  ['library-monocle', '외알 안경', 'library', ''],
  ['sakura-pin', '벚꽃 머리핀', 'sakura', ''],
  ['sakura-crown', '꽃 화관', 'sakura', ''],
  ['sakura-straw', '밀짚모자', 'sakura', ''],
  ['arcade-cap', '거꾸로 쓴 캡', 'arcade', ''],
  ['arcade-shades', '땀밴드와 셔터 안경', 'arcade', ''],
  ['arcade-crown', '8비트 왕관', 'arcade', ''],
  ['train-conductor', '차장 모자', 'train', ''],
  ['train-fedora', '중절모', 'train', ''],
  ['train-beret', '여행 베레모', 'train', ''],
  ['lighthouse-rainhat', '노란 방수모', 'lighthouse', ''],
  ['lighthouse-captain', '선장 모자', 'lighthouse', ''],
  ['lighthouse-sailor', '세일러 칼라', 'lighthouse', ''],
  ['cloud-band', '구름 머리띠', 'cloud', ''],
  ['cloud-halo', '천사 링', 'cloud', ''],
  ['cloud-wings', '작은 날개', 'cloud', ''],
  ['headphones', '헤드폰', '', '흰 귀덮개 헤드폰'],
  ['bow', '큰 리본', '', '머리 위 분홍 리본'],
  ['crown', '왕관', '', '보석 박힌 금관'],
  ['wizard', '마법사 모자', '', '별이 박힌 보라 고깔'],
  ['santa', '산타 모자', '', '털방울 달린 빨간 모자'],
  ['party', '생일 고깔', '', '줄무늬 고깔과 털방울'],
  ['sunglasses', '선글라스', '', '까만 선글라스'],
  ['sprout', '새싹', '', '머리에서 돋은 새싹'],
  ['starpin', '별 머리핀', '', '반짝이는 노란 별 핀'],
];

const AGENT_MARKS = [
  ['none', '없음', '이름표로만 구별'],
  ['ribbon', '색 리본', '세션마다 리본 색이 달라요'],
  ['badge', '번호 배지', '몸에 작은 번호 배지'],
  ['pin', '모양 머리핀', '별, 하트, 달, 꽃, 번개 중 하나'],
  ['flag', '작은 깃발', '머리 위에 색 깃발 하나'],
];
const AGENT_MARK_COLORS = ['#ff6fa0', '#5fb3ff', '#7fd35a', '#ffb03b', '#b58cff', '#3fd0c9'];

const AGENT_OUTFIT_DRAW = (() => {
  // where things sit on each character. hy/hs: hat base and scale; ex/ey/er: eye centres and lens size; ny/ns: neck;
  // sx/sy/top/ss: ears, the band over the head and their scale; R: a bubble around the body; wx/wy/ws: wings;
  // mx/my: the mouth (a headset's microphone); chin: from the hat base down to the chin, in hat units
  const A = {
    claude: { hy: -6.6, hs: 1.22, ex: 3.06, ey: -1.3, er: 2.3, ny: 6.4, ns: 1, sx: 8.4, sy: -1.2, top: -9.6, ss: 1, R: 24.5, wx: 6, wy: 0, ws: 1, mx: -2.2, my: 3.8, chin: 12.6 },
    codex: { hy: -16.6, hs: 1.25, ex: 4.4, ey: -9, er: 3, ny: 13.5, ns: 1.3, sx: 17.2, sy: -6.5, top: -19.8, ss: 1.25, R: 23, wx: 13, wy: 2, ws: 1.15, mx: -9.6, my: 2.2, chin: 24 },
  };
  const hat = (a, s) => `<g transform="translate(0 ${a.hy}) scale(${a.hs})">${s}</g>`;
  const neck = (a, s) => `<g transform="translate(0 ${a.ny}) scale(${a.ns})">${s}</g>`;
  const f2 = (n) => Number(n.toFixed(2));
  const flower = (x, y, r, c = '#ffb7cf', m = '#e8608a') => {
    let p = '';
    for (let i = 0; i < 5; i++) {
      const t = ((i * 72 - 90) * Math.PI) / 180;
      p += `<circle cx="${f2(x + Math.cos(t) * r * 0.55)}" cy="${f2(y + Math.sin(t) * r * 0.55)}" r="${f2(r * 0.5)}" fill="${c}"/>`;
    }
    return `${p}<circle cx="${x}" cy="${y}" r="${f2(r * 0.3)}" fill="${m}"/>`;
  };
  const star = (x, y, r, fill, rot = 0) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const t = ((i * 36 - 90 + rot) * Math.PI) / 180, rr = i % 2 ? r * 0.45 : r;
      d += `${i ? 'L' : 'M'}${f2(x + Math.cos(t) * rr)} ${f2(y + Math.sin(t) * rr)}`;
    }
    return `<path d="${d}Z" fill="${fill}" stroke-linejoin="round"/>`;
  };
  const band = (a, color, w = 1.6) => `<path d="M${-a.sx} ${a.sy - 1}C${-a.sx} ${f2(a.top - 5 * a.ss)} ${a.sx} ${f2(a.top - 5 * a.ss)} ${a.sx} ${a.sy - 1}" stroke="${color}" stroke-width="${f2(w * a.ss)}" fill="none" stroke-linecap="round"/>`;
  const cups = (a, fn) => fn(-a.sx) + fn(a.sx);
  const lenses = (a, fn) => fn(-a.ex) + fn(a.ex);
  const cupRect = (a, x, w, h, fill) => `<rect x="${f2(x - (w / 2) * a.ss)}" y="${f2(a.sy - (h / 2) * a.ss)}" width="${f2(w * a.ss)}" height="${f2(h * a.ss)}" rx="${f2(2.1 * a.ss)}" fill="${fill}"/>`;

  // id → (anchors) => { front, back }
  const D = {
    'space-helmet': (a) => ({ front: `<g class="ao-hat"><circle r="${a.R}" fill="url(#ao-bubble)" stroke="#dfe9f5" stroke-width="1.5"/><path d="M${f2(-a.R * 0.66)} ${f2(-a.R * 0.42)}A${f2(a.R * 0.8)} ${f2(a.R * 0.8)} 0 0 1 ${f2(-a.R * 0.14)} ${f2(-a.R * 0.8)}" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".85"/><rect x="${f2(-a.R * 0.6)}" y="${f2(a.R * 0.82)}" width="${f2(a.R * 1.2)}" height="3.6" rx="1.8" fill="#c9d3e0"/><circle cx="${f2(a.R * 0.38)}" cy="${f2(a.R * 0.82 + 1.8)}" r=".9" fill="#6ff" class="ao-blink"/></g>` }),
    'space-antenna': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-8.4 3Q0-5.6 8.4 3" stroke="#9aa6b8" stroke-width="1.8" fill="none"/><path d="M-3.6-1.6L-6.6-11.5M3.6-1.6L6.6-11.5" stroke="#9aa6b8" stroke-width="1.1"/><circle cx="-6.8" cy="-12.3" r="1.9" fill="#5ff0ff" class="ao-blink"/><circle cx="6.8" cy="-12.3" r="1.9" fill="#ff7ad9"/></g>') }),
    'space-headset': (a) => ({ front: `<g class="ao-hat">${band(a, '#2b3442', 1.5)}${cups(a, (x) => cupRect(a, x, 4.6, 6.8, '#3a4556'))}<circle cx="${-a.sx}" cy="${a.sy}" r="${a.ss}" fill="#5ff0ff"/><path d="M${-a.sx} ${f2(a.sy + 3 * a.ss)}Q${-a.sx + 1} ${a.my + 2} ${a.mx} ${a.my}" stroke="#2b3442" stroke-width="${f2(0.9 * a.ss)}" fill="none"/><circle cx="${a.mx}" cy="${a.my}" r="${f2(1.2 * a.ss)}" fill="#2b3442"/></g>` }),
    'hanok-gat': (a) => ({ front: hat(a, `<g class="ao-hat"><path d="M-4.6-.4L-4.2-10.6Q0-12.1 4.2-10.6L4.6-.4Z" fill="#1d1d22" opacity=".9"/><ellipse cx="0" cy="0" rx="14.5" ry="2.4" fill="#1d1d22" opacity=".72"/><path d="M-8.6.8Q-8.8 ${f2((a.chin * 0.6) / a.hs)} -3.2 ${f2(a.chin / a.hs)}M8.6.8Q8.8 ${f2((a.chin * 0.6) / a.hs)} 3.2 ${f2(a.chin / a.hs)}" stroke="#e8b04a" stroke-width=".8" stroke-dasharray="1.1 .9" fill="none"/></g>`) }),
    'hanok-bokgeon': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M7.4-1C12-.2 13.2 5 15.2 8.4L13.4 9C12 5.6 10.2 2 6.8.4Z" fill="#1a2448"/><path d="M-8.6.6C-9-6-6-11.2 0-11.6C6-11.2 9-6 8.6.6Z" fill="#24305a"/><path d="M0-11.6V-1" stroke="#1a2448" stroke-width=".8"/><rect x="-9" y="-2" width="18" height="2.6" rx="1.2" fill="#1a2448"/></g>') }),
    'hanok-jobawi': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-9.6 1C-10-6-5-10.2 0-10.2C5-10.2 10-6 9.6 1L6.6 1C7-4 4-6.6 0-6.6C-4-6.6-7-4-6.6 1Z" fill="#1c1a22"/><path d="M-7.4-4.8Q0-10.6 7.4-4.8" stroke="#f1ead8" stroke-width=".7" stroke-dasharray=".8 1" fill="none"/><circle cx="0" cy="-8.4" r="1.6" fill="#d9483b"/><circle cx="0" cy="-8.4" r=".7" fill="#5fb89a"/><path d="M9.2-1.6Q10.4 3 10 8M9.8-1.4Q11.6 3 11.6 7.6" stroke="#d9483b" stroke-width=".9" fill="none"/><path d="M8.8-1.4Q9.6 3 8.6 7" stroke="#3b6ad9" stroke-width=".8" fill="none"/></g>') }),
    'neon-visor': (a) => ({ front: `<g class="ao-hat ao-neonc"><rect x="${f2(-a.ex - a.er - 1.6)}" y="${f2(a.ey - a.er * 0.85)}" width="${f2(2 * (a.ex + a.er + 1.6))}" height="${f2(a.er * 1.7)}" rx="${f2(a.er * 0.85)}" fill="url(#ao-visor)" opacity=".92"/><path d="M${f2(-a.ex - a.er)} ${f2(a.ey - a.er * 0.3)}H${f2(a.ex + a.er)}" stroke="#fff" stroke-width=".5" opacity=".8"/></g>` }),
    'neon-phones': (a) => ({ front: `<g class="ao-hat">${band(a, '#2a2140', 2.2)}<g class="ao-neon">${band(a, '#ff4fd8', 0.6)}</g><g class="ao-neonc">${cups(a, (x) => `<circle cx="${x}" cy="${a.sy}" r="${f2(3.6 * a.ss)}" fill="#2a2140" stroke="#5ff0ff" stroke-width="${f2(0.9 * a.ss)}"/>`)}</g></g>` }),
    'neon-cat': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-8.4 2.6Q0-5 8.4 2.6" stroke="#3a3050" stroke-width="1.5" fill="none"/><g class="ao-neon"><path d="M-7.6-.6L-6.4-10.6L-1.6-3.6Z" fill="rgba(255,79,216,.25)" stroke="#ff4fd8" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.6-.6L6.4-10.6L1.6-3.6Z" fill="rgba(255,79,216,.25)" stroke="#ff4fd8" stroke-width="1.2" stroke-linejoin="round"/></g></g>') }),
    'sea-goggles': (a) => ({ front: `<g class="ao-hat"><path d="M${-a.sx} ${a.ey}H${a.sx}" stroke="#ff8a3d" stroke-width="${f2(1.1 * a.ss)}"/>${lenses(a, (x) => `<rect x="${f2(x - a.er - 0.5)}" y="${f2(a.ey - a.er)}" width="${f2(2 * a.er + 1)}" height="${f2(2 * a.er)}" rx="${f2(a.er * 0.8)}" fill="rgba(160,230,255,.42)" stroke="#ff8a3d" stroke-width="${f2(0.9 * a.ss)}"/>`)}<path d="M${a.sx - 1} ${a.ey + 1}Q${f2(a.sx + 2.6 * a.ss)} ${a.ey - 2} ${f2(a.sx + 2 * a.ss)} ${f2(a.top - 6 * a.ss)}" stroke="#ffd43b" stroke-width="${f2(1.8 * a.ss)}" fill="none" stroke-linecap="round"/><rect x="${f2(a.sx + 0.6 * a.ss)}" y="${f2(a.top - 8.4 * a.ss)}" width="${f2(2.8 * a.ss)}" height="${f2(2.4 * a.ss)}" rx=".8" fill="#ff8a3d"/></g>` }),
    'sea-jelly': (a) => ({ front: hat(a, '<g class="ao-hat"><g class="ao-tent"><path d="M-8 .4q-1.2 3 0 6t0 6M-6 .6q-1.2 3 0 6t0 5M6 .6q1.2 3 0 6t0 5M8 .4q1.2 3 0 6t0 6" stroke="#ffb3e3" stroke-width=".8" fill="none" opacity=".85"/></g><path d="M-8.8 .4C-8.8-8-4.2-11.8 0-11.8C4.2-11.8 8.8-8 8.8.4Q6.6 1.8 4.4.4Q2.2 1.8 0 .4Q-2.2 1.8-4.4.4Q-6.6 1.8-8.8.4Z" fill="rgba(255,130,205,.7)" stroke="#ffc4ec" stroke-width=".6"/><circle cx="-3" cy="-6.4" r="1.2" fill="#fff" opacity=".55"/><circle cx="2.6" cy="-8" r=".8" fill="#fff" opacity=".45"/></g>') }),
    'sea-star': (a) => ({ front: hat(a, `<g class="ao-hat">${star(5.6, -2.6, 4.6, '#ff8a5c', 12)}<circle cx="5.6" cy="-2.6" r=".7" fill="#ffd0b8"/><circle cx="1.2" cy="-1" r="1.2" fill="#f4f1ea" stroke="#d9d2c0" stroke-width=".3"/></g>`) }),
    'attic-beanie': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-8.6 0C-9-8-5-12 0-12C5-12 9-8 8.6 0Z" fill="#d9a441"/><path d="M-5.6-2V-9.4M-2.8-2V-11M0-2V-11.6M2.8-2V-11M5.6-2V-9.4" stroke="rgba(0,0,0,.14)" stroke-width=".6"/><rect x="-9.4" y="-3.4" width="18.8" height="4.4" rx="1.8" fill="#c48f2f"/><path d="M-7-3V.6M-4.2-3V.6M-1.4-3V.6M1.4-3V.6M4.2-3V.6M7-3V.6" stroke="rgba(0,0,0,.14)" stroke-width=".6"/><circle cx="0" cy="-13" r="3" fill="#f3e3c0"/></g>') }),
    'attic-scarf': (a) => ({ front: neck(a, '<path d="M-8.4-2.4Q0 1.6 8.4-2.4L8.8 1Q0 5.2-8.8 1Z" fill="#c8382f"/><path d="M2.6 1.2L5.6 1L6.8 9.4L3.6 9.8Z" fill="#b02e26"/><path d="M3 4.4L6 4.2M3.3 6.6L6.3 6.4" stroke="#f3e3c0" stroke-width=".7"/><path d="M3.8 9.8v1.4M4.8 9.7v1.4M5.8 9.6v1.4" stroke="#b02e26" stroke-width=".5"/>') }),
    'attic-muffs': (a) => ({ front: `<g class="ao-hat">${band(a, '#e8a0b8', 1.3)}${cups(a, (x) => `<circle cx="${x}" cy="${a.sy}" r="${f2(3.6 * a.ss)}" fill="#ffd1e0" stroke="#fff" stroke-width="${f2(0.8 * a.ss)}" stroke-dasharray=".6 .9"/>`)}</g>` }),
    'library-glasses': (a) => ({ front: `<g class="ao-hat">${lenses(a, (x) => `<circle cx="${x}" cy="${a.ey}" r="${f2(a.er + 0.4)}" fill="rgba(255,255,255,.12)" stroke="#3a2a20" stroke-width="${f2(0.8 * a.ss)}"/>`)}<path d="M${f2(-a.ex + a.er + 0.4)} ${a.ey}Q0 ${f2(a.ey - 1.2)} ${f2(a.ex - a.er - 0.4)} ${a.ey}" stroke="#3a2a20" stroke-width="${f2(0.7 * a.ss)}" fill="none"/></g>${neck(a, '<path d="M0 0L-5-3V3ZM0 0L5-3V3Z" fill="#8a2a2e"/><circle r="1.3" fill="#6e1f22"/>')}` }),
    'library-cap': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-6.6 0V-5Q0-6.4 6.6-5V0Q0-1.4-6.6 0Z" fill="#222228"/><path d="M0-10.6L11.4-7L0-3.4L-11.4-7Z" fill="#2c2c33"/><circle cx="0" cy="-7" r=".9" fill="#e9c46a"/><path d="M0-7L8.6-7.6L9.4-1.4" stroke="#e9c46a" stroke-width=".7" fill="none"/><rect x="8.5" y="-1.8" width="1.8" height="3" rx=".5" fill="#e9c46a"/></g>') }),
    'library-monocle': (a) => ({ front: `<g class="ao-hat"><circle cx="${a.ex}" cy="${a.ey}" r="${f2(a.er + 0.8)}" fill="rgba(255,255,255,.14)" stroke="#c9a46a" stroke-width="${f2(0.9 * a.ss)}"/><path d="M${f2(a.ex + a.er * 0.5)} ${f2(a.ey + a.er + 0.7)}Q${f2(a.ex + a.er + 3)} ${f2(a.ey + a.er + 7)} ${f2(a.ex - 1)} ${a.ny + 2}" stroke="#c9a46a" stroke-width=".55" stroke-dasharray=".8 .5" fill="none"/></g>` }),
    'sakura-pin': (a) => ({ front: hat(a, `<g class="ao-hat"><path d="M9.6-.6Q11.4-2.4 10.6-4.6Q8.6-3.6 9.6-.6Z" fill="#7cbf6a"/>${flower(6, -3.4, 2.8)}${flower(8.6, -0.6, 2.3, '#ffd2e0')}${flower(3.4, -0.8, 2.1, '#ffc4d6')}</g>`) }),
    'sakura-crown': (a) => ({ front: hat(a, `<g class="ao-hat"><path d="M-9 1.4Q0-7.4 9 1.4" stroke="#5a9a4a" stroke-width="1.2" fill="none"/><path d="M-6.6-3.2q-2.4-1.6-2.6.6q1.6 1 2.6-.6M6.8-3.2q2.4-1.6 2.6.6q-1.6 1-2.6-.6" fill="#6cb85a"/>${flower(-8, -0.4, 2.2, '#ffffff', '#f2c94c')}${flower(-4.6, -3.6, 2.3)}${flower(0, -5.2, 2.5, '#ffd2e0')}${flower(4.6, -3.6, 2.3)}${flower(8, -0.4, 2.2, '#ffffff', '#f2c94c')}</g>`) }),
    'sakura-straw': (a) => ({ front: hat(a, `<g class="ao-hat"><ellipse cx="0" cy="0" rx="13.4" ry="2.9" fill="#e6c178"/><path d="M-6.6-.4C-6.6-8.4 6.6-8.4 6.6-.4Z" fill="#ecca85"/><path d="M-5.6-5.4Q0-7.4 5.6-5.4M-10-.4Q0 2 10-.4" stroke="rgba(150,110,40,.25)" stroke-width=".5" fill="none"/><path d="M-6.6-3.2Q0-4.4 6.6-3.2L6.6-1.2Q0-2.4-6.6-1.2Z" fill="#f39ab5"/>${flower(5, -2.4, 2.4)}</g>`) }),
    'arcade-cap': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M4.6-6.6Q11-8.6 13.8-4.4Q10.4-3.6 7-2.6Z" fill="#2fc0a0"/><path d="M-8.6 0C-8.6-8-4.2-10.8 0-10.8C4.2-10.8 8.6-8 8.6 0Z" fill="#ff5ab4"/><path d="M0-10.8V0M-4.6-9.6Q-3-4-4.4 0M4.6-9.6Q3-4 4.4 0" stroke="rgba(0,0,0,.15)" stroke-width=".55" fill="none"/><circle cx="0" cy="-10.8" r="1" fill="#2fc0a0"/><rect x="-3.4" y="-2" width="6.8" height="2" rx=".8" fill="#ffd43b"/></g>') }),
    'arcade-shades': (a) => ({ front: hat(a, '<g class="ao-hat"><rect x="-9.2" y="-2.6" width="18.4" height="3.6" rx="1.5" fill="#fff"/><rect x="-9.2" y="-1.4" width="18.4" height="1.2" fill="#ff3b5c"/></g>') + `<g class="ao-hat">${lenses(a, (x) => `<rect x="${f2(x - a.er - 0.4)}" y="${f2(a.ey - a.er * 0.9)}" width="${f2(2 * a.er + 0.8)}" height="${f2(a.er * 1.8)}" rx="${f2(a.er * 0.4)}" fill="none" stroke="#ffd43b" stroke-width="${f2(0.7 * a.ss)}"/><path d="M${f2(x - a.er)} ${f2(a.ey - a.er * 0.3)}H${f2(x + a.er)}M${f2(x - a.er)} ${f2(a.ey + a.er * 0.3)}H${f2(x + a.er)}" stroke="#ffd43b" stroke-width="${f2(0.55 * a.ss)}"/>`)}</g>` }),
    'arcade-crown': (a) => ({ front: hat(a, '<g class="ao-hat" shape-rendering="crispEdges"><path d="M-7 0V-6H-5V-4H-3V-8H-1V-6H1V-8H3V-4H5V-6H7V0Z" fill="#ffd43b"/><rect x="-7" y="-1.4" width="14" height="1.4" fill="#e0a000"/><rect x="-1" y="-4" width="2" height="2" fill="#ff3b5c"/><rect x="-5.6" y="-3.2" width="1.4" height="1.4" fill="#5ff0ff"/><rect x="4.2" y="-3.2" width="1.4" height="1.4" fill="#5ff0ff"/></g>') }),
    'train-conductor': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-9.6-6Q0-10.8 9.6-6L7.6-2L-7.6-2Z" fill="#22305a"/><rect x="-7.8" y="-2.8" width="15.6" height="3" fill="#1a2448"/><path d="M-7.8-1.3H7.8" stroke="#e9c46a" stroke-width=".55"/><path d="M-7.6 0Q0 3.4 7.6 0L7-.7Q0 2-7-.7Z" fill="#111"/><circle cx="0" cy="-4.7" r="1.3" fill="#e9c46a"/><path d="M-1.2-4.8Q-3-5.8-3.6-4.4M1.2-4.8Q3-5.8 3.6-4.4" stroke="#e9c46a" stroke-width=".6" fill="none"/></g>') }),
    'train-fedora': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-12.4 0Q-12.4-2.2-8-2.2H8Q12.4-2.2 12.4 0Q0 1.8-12.4 0Z" fill="#5e4230"/><path d="M-7-2.2L-6.4-9Q0-11.8 6.4-9L7-2.2Z" fill="#6a4a32"/><path d="M-3-10.3Q0-8.4 3-10.3" stroke="#4a3424" stroke-width=".7" fill="none"/><rect x="-7" y="-4.2" width="14" height="2" fill="#2a1d14"/><path d="M5.4-4Q9-9.6 10.4-11.4Q9.4-7 6.4-3.6Z" fill="#c8382f"/></g>') }),
    'train-beret': (a) => ({ front: hat(a, '<g class="ao-hat" transform="rotate(-8)"><path d="M-9.2-.8C-11.4-7-3-11.2 3-10.2C9.2-9.2 11.2-5 9.2-.8Q0 1.2-9.2-.8Z" fill="#c8382f"/><path d="M-8.6-1.2Q0 .6 8.6-1.2" stroke="#a52a22" stroke-width=".8" fill="none"/><path d="M1.6-10.4L1.9-12.4" stroke="#a52a22" stroke-width="1.1" stroke-linecap="round"/></g>') }),
    'lighthouse-rainhat': (a) => ({ front: hat(a, `<g class="ao-hat"><path d="M-7.6-1C-7.6-9.4 7.6-9.4 7.6-1Z" fill="#f5c542"/><path d="M-12.2 1.6Q-10-1.6-7.6-1H7.6Q11.2-1.6 13.8 2.8Q0 3.2-12.2 1.6Z" fill="#e9b52f"/><path d="M0-7.4V-1M-4.6-6.2Q-2.6-3-3.4-1M4.6-6.2Q2.6-3 3.4-1" stroke="rgba(120,80,0,.25)" stroke-width=".5" fill="none"/><path d="M-6.6 1.6Q-6 ${f2((a.chin * 0.7) / a.hs)} -1.4 ${f2(a.chin / a.hs)}" stroke="#b78a1e" stroke-width=".6" fill="none"/></g>`) }),
    'lighthouse-captain': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-10.2-6.4Q0-11.2 10.2-6.4L7.8-2L-7.8-2Z" fill="#f4f6f8" stroke="#c9cfd6" stroke-width=".5"/><rect x="-7.8" y="-2.8" width="15.6" height="2.8" fill="#1d2330"/><path d="M-7.6 0Q0 3.2 7.6 0L7-.6Q0 2-7-.6Z" fill="#111"/><path d="M-7-.4H7" stroke="#e9c46a" stroke-width=".5"/><path d="M0-7.4V-4M-1.4-4.8Q0-3.4 1.4-4.8M-1-6.8H1" stroke="#e9c46a" stroke-width=".6" fill="none" stroke-linecap="round"/></g>') }),
    'lighthouse-sailor': (a) => ({ front: neck(a, '<path d="M-8.6-2.6L0 3.4L8.6-2.6L8.6 .6L0 6.6L-8.6 .6Z" fill="#2a4f8a"/><path d="M-7.6-.6L0 4.8L7.6-.6" stroke="#fff" stroke-width=".55" fill="none"/><path d="M-1.6 4.8H1.6L2.6 9L0 8L-2.6 9Z" fill="#c8382f"/>') }),
    'cloud-band': (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-8.6 1.2Q0-6.2 8.6 1.2" stroke="#a9c9f0" stroke-width="1.2" fill="none"/><g class="ao-float"><path d="M-5.4-7A5.4 5.4 0 0 1 5.4-7" stroke="#ff9a9a" stroke-width=".9" fill="none"/><path d="M-4.4-7A4.4 4.4 0 0 1 4.4-7" stroke="#ffe08a" stroke-width=".9" fill="none"/><path d="M-3.4-7A3.4 3.4 0 0 1 3.4-7" stroke="#9fd8a8" stroke-width=".9" fill="none"/><g fill="#fff"><circle cx="-3.2" cy="-5.4" r="2.8"/><circle cx="0" cy="-7.2" r="3.4"/><circle cx="3.4" cy="-5.4" r="2.8"/><rect x="-3.2" y="-5.4" width="6.6" height="2.8"/></g></g></g>') }),
    'cloud-halo': (a) => ({ front: hat(a, '<g class="ao-hat ao-float"><ellipse cx="0" cy="-9.4" rx="7" ry="2" stroke="#ffd86b" stroke-width="1.6" fill="none" class="ao-halo"/></g>') }),
    'cloud-wings': (a) => ({ back: `<g transform="translate(${-a.wx} ${a.wy}) scale(${a.ws})"><path class="ao-flapL" d="M0 0C-6-6-13-5-14-1C-12-1-11 1-12.5 2.5C-10 2.5-9 4-10 6C-6 6-2 4 0 2Z" fill="#fff" stroke="#d9e6f5" stroke-width=".6"/></g><g transform="translate(${a.wx} ${a.wy}) scale(${a.ws})"><path class="ao-flapR" d="M0 0C6-6 13-5 14-1C12-1 11 1 12.5 2.5C10 2.5 9 4 10 6C6 6 2 4 0 2Z" fill="#fff" stroke="#d9e6f5" stroke-width=".6"/></g>` }),
    headphones: (a) => ({ front: `<g class="ao-hat">${band(a, '#3a4150', 2)}${cups(a, (x) => cupRect(a, x, 4.8, 7.2, '#e8ebf0'))}</g>` }),
    bow: (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M4-4.6C-.4-9.4-2-1.6 4-4.6ZM4-4.6C8.4-9.4 10-1.6 4-4.6Z" fill="#ff6fa0"/><path d="M3.4-4L2-.6M4.6-4L6.2-.8" stroke="#ff6fa0" stroke-width="1.2" stroke-linecap="round"/><circle cx="4" cy="-4.6" r="1.4" fill="#e84f86"/></g>') }),
    crown: (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-6.6 0L-7.6-8L-3.6-4.6L0-10.2L3.6-4.6L7.6-8L6.6 0Z" fill="#ffd43b" stroke="#e0a800" stroke-width=".5" stroke-linejoin="round"/><rect x="-6.6" y="-1.8" width="13.2" height="1.8" fill="#e0a800"/><circle cx="0" cy="-10.2" r=".9" fill="#ff3b5c"/><circle cx="-7.6" cy="-8" r=".8" fill="#5f9bff"/><circle cx="7.6" cy="-8" r=".8" fill="#5f9bff"/></g>') }),
    wizard: (a) => ({ front: hat(a, `<g class="ao-hat"><ellipse cx="0" cy="0" rx="11" ry="2.3" fill="#4b3290"/><path d="M-6.6-.8Q-2-10 2-16.6Q4.2-19.4 6.4-16.4Q4.4-9 6.6-.8Z" fill="#6a4ac8"/><rect x="-6.6" y="-2.6" width="13.2" height="1.9" fill="#ffd43b"/>${star(0, -8, 1.6, '#ffe58a')}${star(3.4, -13.2, 1.1, '#ffe58a')}</g>`) }),
    santa: (a) => ({ front: hat(a, '<g class="ao-hat"><path d="M-8-1C-7-12 4-18 13-12.4C9.6-11 8.6-6.6 8-1Z" fill="#d93a3a"/><rect x="-9" y="-2.8" width="18" height="4" rx="2" fill="#fff"/><circle cx="13" cy="-12.4" r="2.8" fill="#fff"/></g>') }),
    party: (a) => ({ front: hat(a, '<g class="ao-hat" transform="rotate(12)"><path d="M-5.2 0L0-13L5.2 0Z" fill="#5fb3ff"/><path d="M-3.8-3.6L3.2-1.2M-2.4-7.2L2-5.6M-1.2-10.4L.9-9.6" stroke="#ffd43b" stroke-width="1.2"/><circle cx="0" cy="-13.4" r="1.8" fill="#ff6fa0"/></g>') }),
    sunglasses: (a) => ({ front: `<g class="ao-hat">${lenses(a, (x) => `<rect x="${f2(x - a.er - 0.6)}" y="${f2(a.ey - a.er * 0.9)}" width="${f2(2 * a.er + 1.2)}" height="${f2(a.er * 1.8)}" rx="${f2(a.er * 0.7)}" fill="#1d2330"/><path d="M${f2(x - a.er * 0.5)} ${f2(a.ey - a.er * 0.4)}l${f2(a.er * 0.5)} ${f2(-a.er * 0.3)}" stroke="#fff" stroke-width=".5" opacity=".7"/>`)}<path d="M${f2(-a.ex + a.er)} ${f2(a.ey - 0.4)}H${f2(a.ex - a.er)}" stroke="#1d2330" stroke-width="${f2(0.8 * a.ss)}"/></g>` }),
    sprout: (a) => ({ front: hat(a, '<g class="ao-hat"><g class="ao-sway"><path d="M0-.6V-7" stroke="#4fa83a" stroke-width="1.1" stroke-linecap="round"/><path d="M0-6C-4-9.4-7.2-7.4-7.2-5.2C-4.2-4.2-1.6-5 0-6Z" fill="#6cc24a"/><path d="M0-6.4C3.4-11 7.8-9.6 8.4-7C5.6-5.4 2-5.2 0-6.4Z" fill="#7fd35a"/></g></g>') }),
    starpin: (a) => ({ front: hat(a, `<g class="ao-hat">${star(6, -3, 3.4, '#ffd43b', 10)}<path d="M10.4-7.6v2M9.4-6.6h2" stroke="#fff" stroke-width=".5" class="ao-blink"/></g>`) }),
  };

  // the marks for other sessions: kind, colour, a number (for the badge) and a shape pick (for the pin)
  const M = {
    ribbon: (a, c) => hat(a, `<g transform="translate(5 -4.4) scale(1.7) translate(-5 4.4)"><path d="M5-4.4C1.6-8 .4-2 5-4.4ZM5-4.4C8.4-8 9.6-2 5-4.4Z" fill="${c}"/><circle cx="5" cy="-4.4" r="1.1" fill="${c}" stroke="rgba(0,0,0,.2)" stroke-width=".4"/></g>`),
    badge: (a, c, n) => `<g transform="translate(${f2(a.ex + 3.4 * a.ss)} ${a.ny - 1}) scale(${a.ss})"><circle r="3.2" fill="${c}" stroke="#fff" stroke-width=".7"/><text y=".3" text-anchor="middle" dominant-baseline="central" font-size="4.4" font-weight="800" fill="#fff" font-family="system-ui, sans-serif">${n}</text></g>`,
    pin: (a, c, n, shape) => hat(a, [
      star(5.6, -3, 3, c, 8),
      `<path d="M5.6-.6C1.6-3.4 2.6-6.6 4.4-6.4C5-6.4 5.4-6 5.6-5.4C5.8-6 6.2-6.4 6.8-6.4C8.6-6.6 9.6-3.4 5.6-.6Z" fill="${c}"/>`,
      `<path d="M6.6-6.8A3.6 3.6 0 1 0 8.6-.8A3 3 0 1 1 6.6-6.8Z" fill="${c}"/>`,
      flower(5.6, -3.2, 3, c, '#fff'),
      `<path d="M6.6-7.4L3.8-3H5.8L4.6.8L8.2-4.2H6.2L7.6-7.4Z" fill="${c}"/>`,
    ][shape % 5]),
    flag: (a, c) => hat(a, `<path d="M4.4-1.4V-12" stroke="#8a92a5" stroke-width=".7"/><path d="M4.6-12L10.2-10.2L4.6-8.4Z" fill="${c}"/>`),
  };
  return { A, D, M };
})();

/** What a character wears: { front, back } SVG for that outfit on 'claude' or 'codex' (empty for none or unknown). */
function agentOutfitParts(id, skin) {
  const draw = AGENT_OUTFIT_DRAW.D[id];
  if (!draw) return { front: '', back: '' };
  const parts = draw(AGENT_OUTFIT_DRAW.A[skin === 'codex' ? 'codex' : 'claude']);
  return { front: parts.front || '', back: parts.back || '' };
}

/** A session's mark: colour and shape come from its id (the same session keeps them); n is the badge's number. */
function agentMarkSvg(kind, skin, seed, n) {
  const draw = AGENT_OUTFIT_DRAW.M[kind];
  if (!draw) return '';
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return draw(AGENT_OUTFIT_DRAW.A[skin === 'codex' ? 'codex' : 'claude'], AGENT_MARK_COLORS[h % AGENT_MARK_COLORS.length], n || 2, (h >>> 3) % 5);
}

/** The gradients the outfits use (once per document; the room's own defs are separate). */
function agentOutfitDefs() {
  if (document.getElementById('ao-defs')) return;
  const box = document.createElement('div');
  box.innerHTML = `<svg id="ao-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="ao-visor" x1="0" x2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset="1" stop-color="#5ff0ff"/></linearGradient>
    <radialGradient id="ao-bubble" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".6" stop-color="#bfe6ff" stop-opacity=".1"/><stop offset="1" stop-color="#9fd0ff" stop-opacity=".28"/></radialGradient>
    <path id="ao-clogo" fill="#d97757" d="M-14.8 8.34L-5.74 3.25L-5.59 2.81L-5.74 2.57L-6.19 2.57L-7.7 2.47L-12.88 2.33L-17.37 2.15L-21.72 1.91L-22.81 1.68L-23.84 0.33L-23.74 -0.35L-22.81 -0.97L-21.5 -0.85L-18.58 -0.65L-14.21 -0.35L-11.04 -0.16L-6.34 0.33L-5.59 0.33L-5.49 0.02L-5.74 -0.16L-5.94 -0.35L-10.46 -3.42L-15.36 -6.66L-17.93 -8.52L-19.32 -9.47L-20.01 -10.35L-20.32 -12.29L-19.06 -13.68L-17.37 -13.56L-16.94 -13.44L-15.22 -12.13L-11.56 -9.29L-6.78 -5.77L-6.08 -5.19L-5.8 -5.39L-5.77 -5.53L-6.08 -6.05L-8.68 -10.75L-11.46 -15.53L-12.69 -17.51L-13.02 -18.7L-13.06 -18.88L-13.1 -19.06L-13.13 -19.23L-13.16 -19.4L-13.18 -19.57L-13.2 -19.74L-13.21 -19.92L-13.22 -20.1L-11.78 -22.05L-10.99 -22.31L-9.08 -22.05L-8.27 -21.35L-7.08 -18.63L-5.16 -14.35L-2.17 -8.53L-1.3 -6.81L-0.83 -5.21L-0.66 -4.72L-0.35 -4.72L-0.35 -5L-0.11 -8.28L0.34 -12.3L0.79 -17.48L0.94 -18.94L1.66 -20.69L3.1 -21.63L4.22 -21.09L5.14 -19.78L5.01 -18.92L4.46 -15.37L3.39 -9.79L2.69 -6.06L3.1 -6.06L3.56 -6.53L5.45 -9.04L8.62 -13L10.02 -14.57L11.66 -16.31L12.71 -17.14L14.69 -17.14L16.15 -14.97L15.49 -12.73L13.45 -10.14L11.76 -7.95L9.34 -4.69L7.82 -2.07L7.96 -1.86L8.32 -1.9L13.8 -3.07L16.76 -3.6L20.3 -4.21L21.89 -3.46L22.07 -2.7L21.44 -1.15L17.66 -0.22L13.23 0.67L6.63 2.23L6.55 2.29L6.64 2.4L9.62 2.68L10.89 2.75L14 2.75L19.8 3.19L21.31 4.19L22.22 5.41L22.07 6.35L19.74 7.53L16.59 6.79L9.24 5.04L6.72 4.41L6.37 4.41L6.37 4.62L8.47 6.67L12.32 10.15L17.14 14.62L17.38 15.73L16.76 16.61L16.11 16.51L11.88 13.33L10.24 11.9L6.55 8.78L6.3 8.78L6.3 9.11L7.15 10.36L11.66 17.12L11.89 19.2L11.56 19.87L10.4 20.28L9.11 20.05L6.48 16.35L3.76 12.19L1.57 8.46L1.3 8.61L0.01 22.54L-0.6 23.25L-2 23.79L-3.17 22.9L-3.78 21.47L-3.17 18.64L-2.42 14.94L-1.81 12L-1.26 8.35L-0.94 7.14L-0.96 7.06L-1.23 7.09L-3.98 10.87L-8.17 16.53L-11.48 20.07L-12.27 20.38L-13.65 19.67L-13.52 18.4L-12.75 17.27L-8.17 11.44L-5.4 7.83L-3.62 5.74L-3.63 5.44L-3.74 5.44L-15.91 13.34L-18.08 13.62L-19.01 12.75L-18.9 11.31L-18.45 10.85L-14.79 8.33Z"/>
    <linearGradient id="ao-cxgrad" gradientUnits="userSpaceOnUse" x1="12" x2="12" y1="1" y2="23"><stop stop-color="#B1A7FF"/><stop offset=".5" stop-color="#7A9DFF"/><stop offset="1" stop-color="#3941FF"/></linearGradient>
    <path id="ao-cxcloud" fill="url(#ao-cxgrad)" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457z"/>
  </defs></svg>`;
  document.body.appendChild(box.firstElementChild);
}

/**
 * A still picture of Claude and Codex wearing an outfit (for the picker), or wearing marks (kind 'mark:<id>').
 * The room's own characters are drawn by page.html; this is the same art without its motion: the whole Claude logo
 * under the round body, and Codex's cloud (the Codex mark from LobeHub Icons, MIT).
 */
function agentOutfitPreviewSvg(id) {
  agentOutfitDefs();
  const claude = (x, wear) => `<g transform="translate(${x} 0)">${wear.back}<use href="#ao-clogo"/><circle r="8.6" fill="#d97757"/><g transform="scale(.9)"><circle cx="-5.6" cy="2.4" r="1.6" fill="#f3a487" opacity=".8"/><circle cx="5.6" cy="2.4" r="1.6" fill="#f3a487" opacity=".8"/><ellipse cx="-3.4" cy="-1.4" rx="1.45" ry="2" fill="#2b1a12"/><ellipse cx="3.4" cy="-1.4" rx="1.45" ry="2" fill="#2b1a12"/><path d="M-2.2 3.3Q0 5.1 2.2 3.3" fill="none" stroke="#2b1a12" stroke-width="1.3" stroke-linecap="round"/></g>${wear.front}</g>`;
  const codex = (x, wear) => `<g transform="translate(${x} 0)">${wear.back}<use href="#ao-cxcloud" transform="scale(1.62) translate(-12 -12)"/><circle cx="-10.5" cy="-4.5" r="1.8" fill="#ffc6ec" opacity=".55"/><circle cx="10.5" cy="-4.5" r="1.8" fill="#ffc6ec" opacity=".55"/><ellipse cx="-4.4" cy="-9" rx="1.9" ry="2.5" fill="#1e2470"/><ellipse cx="4.4" cy="-9" rx="1.9" ry="2.5" fill="#1e2470"/><path d="M-8.4-2.4L-4.8 1.6L-8.4 5.6M-1.2 5.6H6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${wear.front}</g>`;
  if (id.startsWith('mark:')) {
    const kind = id.slice(5);
    const m = (skin, seed, n) => ({ front: agentMarkSvg(kind, skin, seed, n), back: '' });
    return `<svg class="pv-agent" viewBox="-56 -33 112 59" aria-hidden="true">${claude(-27, m('claude', 'sa', 2))}${codex(27, m('codex', 'sb', 3))}</svg>`;
  }
  return `<svg class="pv-agent" viewBox="-56 -33 112 59" aria-hidden="true">${claude(-27, agentOutfitParts(id, 'claude'))}${codex(27, agentOutfitParts(id, 'codex'))}</svg>`;
}
