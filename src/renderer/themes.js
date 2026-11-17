'use strict';

/*
 * Terminal colour themes. Each theme brings its own background (bg) — the terminal, and the sidebar / tabs /
 * panels around it are tinted from it — plus the text palette.
 * ansi = [black, red, green, yellow, blue, magenta, cyan, white, bright × 8]
 * light: true → offered in light mode; the rest in dark mode. Every colour is checked for contrast on its bg.
 */
window.THEMES = {
  /* ------------------------------ dark ------------------------------ */
  minsu: {
    name: 'MinsuTerm', desc: '보랏빛 기본', bg: '#10131a', fg: '#e2e6ee', cursor: '#c9b8ff',
    ansi: ['#4a5163', '#ff6b7a', '#5ee08f', '#ffcb6b', '#7fa8ff', '#c99bff', '#5fd8e6', '#c8ced9',
      '#6b7385', '#ff8f9b', '#86f0b0', '#ffdc8f', '#a3c1ff', '#dbb8ff', '#8ee9f2', '#f5f7fa'],
  },
  synthwave: {
    name: 'Synthwave 84', desc: '보라 밤하늘의 네온', bg: '#262035', fg: '#f4eefc', cursor: '#ff7edb',
    ansi: ['#6d5c8a', '#fe4450', '#72f1b8', '#fede5d', '#2ee2fa', '#ff7edb', '#03edf9', '#e8e0f5',
      '#8c7aab', '#ff6b74', '#97ffd0', '#fff08a', '#6ff0ff', '#ffa3e6', '#7cf6ff', '#ffffff'],
  },
  matrix: {
    name: '매트릭스', desc: '검은 화면의 초록 인광', bg: '#030b05', fg: '#4dff88', cursor: '#7dffa8',
    ansi: ['#2f6a43', '#ff5f56', '#3dff7a', '#c8ff4d', '#36d8a0', '#7affc2', '#2df0d0', '#a8ffc6',
      '#3f8c5a', '#ff857e', '#8cffb0', '#e2ff8c', '#6ff0c0', '#b0ffdc', '#79ffe8', '#e6fff0'],
  },
  amber: {
    name: '앰버 CRT', desc: '옛 모니터의 호박색 글씨', bg: '#140c02', fg: '#ffb43b', cursor: '#ffcc66',
    ansi: ['#7a5418', '#ff6a3d', '#d9c24a', '#ffcf4d', '#e09a3a', '#ff9466', '#f2c47a', '#ffd9a0',
      '#9a6c24', '#ff8c66', '#ecd975', '#ffe08a', '#f0b260', '#ffb08a', '#ffd9a0', '#fff0d6'],
  },
  cyberpunk: {
    name: '사이버펑크', desc: '노랑·시안·핫핑크', bg: '#0b0f1e', fg: '#e8f6ff', cursor: '#fcee0c',
    ansi: ['#3f4a72', '#ff2a6d', '#05ffa1', '#fcee0c', '#01c8ff', '#ff3ee6', '#00f0ff', '#d1e8ff',
      '#5a6699', '#ff5c8f', '#5cffc4', '#fff65c', '#5cdcff', '#ff7cef', '#5cf6ff', '#ffffff'],
  },
  onedark: {
    name: '용암', desc: '숯 위로 흐르는 용암', bg: '#1a0f0c', fg: '#ffdcc6', cursor: '#ff7a3d',
    ansi: ['#7a5245', '#ff4d3d', '#cfd64a', '#ffb52e', '#7fa8d8', '#ff6f9f', '#ffc98a', '#f0cdb8',
      '#946556', '#ff7466', '#dfe57a', '#ffca5c', '#a2c0e6', '#ff93b8', '#ffdcab', '#fff0e6'],
  },
  catppuccin: {
    name: '오로라', desc: '밤하늘에 일렁이는 극광', bg: '#0b1424', fg: '#d8f5ec', cursor: '#5effc0',
    ansi: ['#45607c', '#ff6b8e', '#5effa8', '#d4ff7a', '#5ab8ff', '#b98cff', '#4ff0e0', '#c4e0e8',
      '#5c7894', '#ff93ad', '#8fffc4', '#e2ffa3', '#8acdff', '#cfb0ff', '#85f5ea', '#f0fffa'],
  },
  ocean: {
    name: '심해', desc: '깊은 바다의 청록', bg: '#0a1b26', fg: '#cfe8f3', cursor: '#5fe1e6',
    ansi: ['#3d5a6c', '#ff7a85', '#4fe0b0', '#f4d37a', '#4fb3ff', '#a99cff', '#3fe3e6', '#b8d4e0',
      '#5a7a8e', '#ff9aa3', '#82f0cb', '#ffe49e', '#82c9ff', '#c4bbff', '#7ef0f2', '#ecf8fc'],
  },
  coffee: {
    name: '에스프레소', desc: '진한 커피와 크림', bg: '#1d1510', fg: '#ecdcc6', cursor: '#d9a066',
    ansi: ['#6b5444', '#e8735a', '#a8c070', '#e6b45c', '#8fb0c8', '#d0909c', '#88c0a8', '#d8c4a8',
      '#8a6f5c', '#f08f78', '#bed48a', '#f0c87c', '#a8c6da', '#dfa8b2', '#a0d2bc', '#fff4e4'],
  },
  github: {
    name: '흑백 영화', desc: '은막의 무채색', bg: '#151515', fg: '#e6e6e6', cursor: '#ffffff',
    ansi: ['#6a6a6a', '#e09090', '#a8d0a8', '#ddd2a0', '#a8b8d8', '#c8a8d0', '#a8d0d0', '#c8c8c8',
      '#888888', '#f0b0b0', '#c4e4c4', '#ece4c0', '#c4d0ea', '#dcc4e2', '#c4e4e4', '#f5f5f5'],
  },
  dracula: {
    name: 'Dracula', desc: '드라큘라의 보라 회색', bg: '#282a36', fg: '#f8f8f2', cursor: '#f8f8f2',
    ansi: ['#6272a4', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#7b8bc0', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  },
  tokyo: {
    name: 'Tokyo Night', desc: '도쿄의 남색 밤', bg: '#1a1b26', fg: '#c0caf5', cursor: '#c0caf5',
    ansi: ['#4e5579', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#565f89', '#ff899d', '#9fe044', '#faba4a', '#8db0ff', '#c7a9ff', '#a4daff', '#c0caf5'],
  },
  nord: {
    name: 'Nord', desc: '북극의 차분한 청회색', bg: '#2e3440', fg: '#d8dee9', cursor: '#d8dee9',
    ansi: ['#616e88', '#d0737c', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#727f99', '#de8a92', '#b2cc9b', '#f2d59c', '#94b4d4', '#c39dbc', '#8fbcbb', '#eceff4'],
  },
  gruvbox: {
    name: 'Gruvbox', desc: '따뜻한 레트로 갈색', bg: '#282828', fg: '#ebdbb2', cursor: '#ebdbb2',
    ansi: ['#7c6f64', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#d5c4a1',
      '#928374', '#ff6a57', '#cdd03a', '#ffd25a', '#9cbcb0', '#e39caf', '#a2d590', '#fbf1c7'],
  },
  solarized: {
    name: 'Solarized Dark', desc: '바다빛 청록 배경', bg: '#002b36', fg: '#a3b1b1', cursor: '#93a1a1',
    ansi: ['#5a7a82', '#ef4b47', '#97ad00', '#cc9c00', '#3a9ae3', '#e34a92', '#33b5ab', '#eee8d5',
      '#6f878f', '#e8662e', '#a8bf1a', '#ddb21a', '#5aaee8', '#8b8fe0', '#4cc6bc', '#fdf6e3'],
  },
  rosepine: {
    name: 'Rosé Pine', desc: '장밋빛과 소나무', bg: '#191724', fg: '#e0def4', cursor: '#e0def4',
    ansi: ['#6e6a86', '#eb6f92', '#3e8fb0', '#f6c177', '#9ccfd8', '#c4a7e7', '#ebbcba', '#e0def4',
      '#908caa', '#f083a2', '#4fa4c6', '#f9cf93', '#b3dce3', '#d2b9ef', '#f2cdcb', '#ffffff'],
  },
  kanagawa: {
    name: 'Kanagawa', desc: '먹빛 바탕의 수묵화', bg: '#1f1f28', fg: '#dcd7ba', cursor: '#c8c093',
    ansi: ['#727169', '#e46876', '#98bb6c', '#e6c384', '#7e9cd8', '#957fb8', '#7aa89f', '#c8c093',
      '#8a8980', '#ff5d62', '#a9cc7d', '#f0d095', '#7fb4ca', '#a99ccc', '#8fc0b5', '#dcd7ba'],
  },
  everforest: {
    name: 'Everforest', desc: '숲속의 이끼색', bg: '#2d353b', fg: '#d3c6aa', cursor: '#d3c6aa',
    ansi: ['#7a8478', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d3c6aa',
      '#859289', '#f08d8f', '#b6cf8e', '#e6c98e', '#8ecac2', '#e2a9c3', '#93cfa1', '#e8dcc0'],
  },
  midnight: {
    name: '고대비', desc: '새까만 바탕, 또렷한 원색', bg: '#000000', fg: '#ffffff', cursor: '#ffffff',
    ansi: ['#808080', '#ff5c5c', '#4dff88', '#ffe14d', '#5cb3ff', '#e080ff', '#4de8ff', '#e6e6e6',
      '#a6a6a6', '#ff8585', '#85ffad', '#fff085', '#8cc8ff', '#eeb0ff', '#8cf0ff', '#ffffff'],
  },

  /* ------------------------------ light ----------------------------- */
  minsuLight: {
    name: 'MinsuTerm 라이트', desc: '깔끔한 기본', light: true, bg: '#fafbfc', fg: '#1f2430', cursor: '#6c4bf5',
    ansi: ['#1f2430', '#d1293f', '#16834a', '#9a6200', '#2a5fd0', '#9435c2', '#0c7f8c', '#5d6577',
      '#6b7385', '#e2475e', '#1d9a58', '#b07200', '#3f74e8', '#a94bd6', '#12929f', '#3d4452'],
  },
  paper: {
    name: '종이', desc: '누런 종이에 먹물', light: true, bg: '#f3ead6', fg: '#2e261c', cursor: '#7a4a1e',
    ansi: ['#2e261c', '#b02a1e', '#4d6b14', '#8a5a00', '#2b5797', '#8a3f78', '#1f6e6a', '#5e5444',
      '#6e6352', '#c8402e', '#5d7d1e', '#9c6a00', '#3a69ad', '#9c4f8a', '#2a807a', '#3e3528'],
  },
  sakura: {
    name: '벚꽃', desc: '연분홍 봄날', light: true, bg: '#fff1f4', fg: '#4a2735', cursor: '#e0558a',
    ansi: ['#4a2735', '#d1294f', '#2f8a4e', '#a35c00', '#3a64c8', '#c03b8f', '#1d8290', '#7a5a68',
      '#8c6b79', '#e0446a', '#3a9d5c', '#b56d00', '#4d78dc', '#d04fa2', '#2a96a4', '#5c3b49'],
  },
  mint: {
    name: '민트', desc: '시원한 민트 초코', light: true, bg: '#ecf8f3', fg: '#1d3a32', cursor: '#109c7a',
    ansi: ['#1d3a32', '#c93a45', '#0f7f55', '#8a6500', '#246bb5', '#8f47b0', '#08807a', '#4f6b62',
      '#62807a', '#d9505b', '#139466', '#9c7300', '#357ec9', '#a259c2', '#0c938c', '#2f4c44'],
  },
  latte: {
    name: '라벤더', desc: '연보랏빛 라벤더 밭', light: true, bg: '#f3effa', fg: '#33284a', cursor: '#7c4dff',
    ansi: ['#33284a', '#c8285a', '#3d8a5a', '#9a6a14', '#5a4fd0', '#9b34c9', '#2f7f9a', '#6d6385',
      '#7d7397', '#d63d6e', '#3f8f5c', '#a26f14', '#6a60e0', '#aa48d8', '#2f86a2', '#4a405f'],
  },
  tokyoDay: {
    name: '하늘', desc: '구름 한 점 없는 하늘', light: true, bg: '#eaf4fc', fg: '#17344f', cursor: '#1e88e5',
    ansi: ['#17344f', '#d6304f', '#1f8a5e', '#946500', '#1565c0', '#8e44ad', '#00798c', '#4e6a82',
      '#647c92', '#e0405f', '#1f8f60', '#9c6a00', '#1e72cc', '#9a50b8', '#00808f', '#2d4a63'],
  },
  githubLight: {
    name: '신문', desc: '갱지 위의 검은 잉크와 붉은 제목', light: true, bg: '#f5f2ea', fg: '#151515', cursor: '#c4161c',
    ansi: ['#151515', '#c4161c', '#3f6b2e', '#7a5c14', '#1f3f6e', '#7a2e5a', '#2e5a5a', '#555555',
      '#6e6e6e', '#d42a2a', '#4a7a38', '#86661a', '#2c4f84', '#8a3a68', '#386a6a', '#333333'],
  },
  oneLight: {
    name: '레몬', desc: '상큼한 레몬 에이드', light: true, bg: '#fff5b8', fg: '#3a3418', cursor: '#e0a800',
    ansi: ['#3a3418', '#d23c1e', '#4f8a10', '#9a6a00', '#2a6fb0', '#b04090', '#1c8a7a', '#6e6644',
      '#7f7650', '#d84a2a', '#558f12', '#9f6e00', '#3478b8', '#b8489a', '#1d8e7e', '#4e4828'],
  },
  dawn: {
    name: 'Rosé Pine Dawn', desc: '새벽의 장밋빛', light: true, bg: '#faf4ed', fg: '#575279', cursor: '#9893a5',
    ansi: ['#575279', '#b4637a', '#286983', '#a86a12', '#3f7f8a', '#865f9e', '#b9625e', '#797593',
      '#8d88a0', '#ba6880', '#327a96', '#b07015', '#4a8a95', '#9473ab', '#c46d69', '#575279'],
  },
  solarizedLight: {
    name: 'Solarized Light', desc: '햇살 비친 크림색', light: true, bg: '#fdf6e3', fg: '#4f6369', cursor: '#586e75',
    ansi: ['#073642', '#dc322f', '#667600', '#946f00', '#2183c8', '#d33682', '#1d837b', '#586e75',
      '#657b83', '#cb4b16', '#708100', '#9f7700', '#3486c8', '#6c71c4', '#25938b', '#073642'],
  },
  gruvboxLight: {
    name: 'Gruvbox Light', desc: '바랜 양피지', light: true, bg: '#efe0b4', fg: '#3c3836', cursor: '#3c3836',
    ansi: ['#3c3836', '#c0211b', '#70690c', '#a06610', '#076678', '#8f3f71', '#3c7050', '#6e6359',
      '#857766', '#9d0006', '#77730f', '#8f5c0c', '#3e7a7d', '#a2577a', '#58875a', '#504945'],
  },
  everforestLight: {
    name: 'Everforest Light', desc: '햇살 드는 이끼 숲', light: true, bg: '#edf2dc', fg: '#45543a', cursor: '#6f8500',
    ansi: ['#5c6a72', '#e14f4c', '#6f8500', '#a87a00', '#2f86b5', '#c955a7', '#2a8462', '#748372',
      '#829181', '#d8403e', '#6a8000', '#9a7000', '#3a90bf', '#b84f98', '#2f9670', '#4a575e'],
  },
};

/* Accent presets: [accent, gradient start, gradient mid, gradient end] */
window.ACCENTS = {
  violet: { name: '바이올렛', c: ['#8f73ff', '#7c5cff', '#c266e8', '#ff8a5b'] },
  blue: { name: '블루', c: ['#5b8cff', '#4f7cff', '#6aa8ff', '#5fd4e0'] },
  teal: { name: '틸', c: ['#2fc6b0', '#1fb5a0', '#3fd1b5', '#8be38f'] },
  pink: { name: '핑크', c: ['#f472b6', '#e8579f', '#f472b6', '#ffa07a'] },
  coral: { name: '코랄', c: ['#ff8a5b', '#e8664a', '#ff8a5b', '#ffc15e'] },
  mono: { name: '모노', c: ['#a3aab8', '#6b7280', '#a3aab8', '#e5e7eb'] },
};
