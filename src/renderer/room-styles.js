'use strict';
/*
 * 방 스타일: the look of 진행도's room, picked in 꾸미기 → 진행도 (settings.roomStyle). The room itself is drawn in
 * src/minsuterm-progress/scripts/page.html, where each style is a set of colours and drawings over the same furniture
 * (:root[data-room="<id>"] #room); this file only lists the styles and draws the small sketch the picker shows.
 */
const ROOM_STYLES = [
  ['default', '아늑한 방', '지금의 방'],
  ['space', '우주 정거장', '고요한 궤도 위 선실'],
  ['hanok', '한옥 방', '창호지로 빛이 번지는 사랑방'],
  ['neon', '네온 도시 원룸', '비 오는 밤 도시의 작은 방'],
  ['sea', '해저 기지', '물빛이 일렁이는 바닷속 연구실'],
  ['attic', '다락방', '비스듬한 지붕 아래 아늑한 다락'],
  ['library', '오래된 서재', '초록 스탠드가 있는 책의 방'],
  ['sakura', '벚꽃 정원 방', '꽃잎이 들어오는 봄날의 방'],
  ['arcade', '80년대 게임방', '브라운관과 오락기의 방'],
  ['train', '야간열차 침대칸', '창밖 풍경이 흘러가는 기차 안'],
  ['lighthouse', '등대 꼭대기', '바다를 내려다보는 둥근 방'],
  ['cloud', '구름 위 하늘 방', '구름 위에 떠 있는 방'],
];

// the sketch's colours: wall, floor, rug, window frame, window view, wood, armchair, lamp, bed; round: a porthole window
const ROOM_SKETCH = {
  default: { wall: '#2a2f3a', floor: '#3a3229', rug: '#5e4440', frame: '#cfd6e2', view: '#6189b8', wood: '#8c6745', arm: '#4f7f74', lamp: '#ffcd6b', bed: '#5b77c9' },
  space: { wall: '#3a424f', floor: '#2b3039', rug: '#33475e', frame: '#a9b1bd', view: '#10204a', wood: '#8a93a0', arm: '#4f6a8f', lamp: '#e8f4ff', bed: '#3a6bb5', round: true },
  hanok: { wall: '#ede2c6', floor: '#c99a62', rug: '#d8c78e', frame: '#6e4527', view: '#f5ecd2', wood: '#7a4e2d', arm: '#4a65a0', lamp: '#ffd98a', bed: '#b84a3a' },
  neon: { wall: '#2c2342', floor: '#1d1730', rug: '#3a2d55', frame: '#4a4458', view: '#1a1430', wood: '#3a3050', arm: '#5a3478', lamp: '#ff4fd8', bed: '#6a4aa8' },
  sea: { wall: '#1d5560', floor: '#1b4652', rug: '#2a6a73', frame: '#3d7f88', view: '#2fb5c5', wood: '#8fb5bb', arm: '#d9a441', lamp: '#5ff0e0', bed: '#e07a4a', round: true },
  attic: { wall: '#d8b48a', floor: '#8a5a3a', rug: '#b05a3a', frame: '#6e4a2d', view: '#a8d5ff', wood: '#7a5236', arm: '#a8604a', lamp: '#f0d9a0', bed: '#7e5a9c' },
  library: { wall: '#1f3a30', floor: '#3a2a20', rug: '#8a2a2a', frame: '#3a2418', view: '#b8d4b0', wood: '#5a3422', arm: '#8a2a2e', lamp: '#2e9a5e', bed: '#2f5a42' },
  sakura: { wall: '#f7e7ea', floor: '#e8d2b0', rug: '#f2d0d6', frame: '#d9b38c', view: '#f6a5bd', wood: '#c08a5c', arm: '#a8cdb2', lamp: '#f5d79a', bed: '#e8879e' },
  arcade: { wall: '#8a76d8', floor: '#3a3060', rug: '#2a2040', frame: '#f0eef8', view: '#ff7aa8', wood: '#2a2440', arm: '#ff6fb0', lamp: '#ffd43b', bed: '#2fc0a0' },
  train: { wall: '#7a2e30', floor: '#1f2a4a', rug: '#2a3658', frame: '#c9a46a', view: '#8fc86a', wood: '#6a3a22', arm: '#3f7a62', lamp: '#f5c66a', bed: '#2a4a7a' },
  lighthouse: { wall: '#e6eaee', floor: '#9aa4ae', rug: '#2a4f8a', frame: '#1f4a3a', view: '#2a6fa8', wood: '#9a6238', arm: '#2f5a8a', lamp: '#fff2a8', bed: '#c8382f' },
  cloud: { wall: '#b8d8f5', floor: '#eef4ff', rug: '#d9cfff', frame: '#ffffff', view: '#9fd0ff', wood: '#a78bdb', arm: '#f5a0c0', lamp: '#fff4c8', bed: '#f5c542', round: true },
};

/** 꾸미기 → 진행도 → 방 스타일: a small sketch of the room in that style (the furniture where the room has it). */
function previewRoomStyle(kind, el) {
  const c = ROOM_SKETCH[kind] || ROOM_SKETCH.default;
  el.innerHTML = `<svg class="pv-room" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="110" fill="${c.wall}"/><rect y="110" width="400" height="90" fill="${c.floor}"/>
    <ellipse cx="200" cy="150" rx="160" ry="15" fill="${c.rug}"/>
    ${c.round ? `<circle cx="205" cy="38" r="29" fill="${c.frame}"/><circle cx="205" cy="38" r="24" fill="${c.view}"/>` : `<rect x="168" y="10" width="74" height="54" rx="3" fill="${c.frame}"/><rect x="171" y="13" width="68" height="48" fill="${c.view}"/>`}
    <rect x="28" y="84" width="124" height="6" rx="1.5" fill="${c.wood}"/><rect x="74" y="66" width="32" height="18" rx="1.5" fill="#3a4150"/>
    <rect x="181" y="70" width="50" height="30" rx="10" fill="${c.arm}"/>
    <circle cx="285" cy="62" r="26" fill="${c.lamp}" opacity=".25"/><path d="M276 55h18l-3.5-12h-11z" fill="${c.lamp}"/><rect x="284" y="54" width="3" height="70" fill="#8a92a5"/>
    <rect x="300" y="88" width="96" height="30" rx="4" fill="${c.bed}"/></svg>`;
  return () => {};
}
