'use strict';

/* global Terminal, FitAddon, WebglAddon, WebLinksAddon, SearchAddon, Unicode11Addon, icon, hydrateIcons */

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function basename(p) {
  const s = String(p || '').replace(/[\\/]+$/, '');
  const parts = s.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return /^[A-Za-z]:$/.test(last) ? `${last}\\` : (last || p);
}

function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return '방금';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  if (d < 172800) return '어제';
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}일 전`;
  const dt = new Date(ms);
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
}

const normP = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
const samePath = (a, b) => normP(a) === normP(b);

/* platform: macOS uses ⌘ for app shortcuts (Ctrl stays with the terminal: Ctrl+C = interrupt) */
const IS_MAC = window.mt.platform === 'darwin';
const IS_WIN = window.mt.platform === 'win32';
/** The app-shortcut modifier: ⌘ on macOS, Ctrl elsewhere. */
const modKey = (e) => (IS_MAC ? e.metaKey : e.ctrlKey);
if (IS_MAC) {
  document.body.classList.add('mac');
  // shortcut hints are written for Windows: show them the macOS way (Ctrl → ⌘, Shift → ⇧, Alt → ⌥)
  const macKeys = (s) => s.replace(/Ctrl\+Shift\+/g, '⌘⇧').replace(/Ctrl\+Alt\+/g, '⌘⌥').replace(/Ctrl\+/g, '⌘').replace(/Alt\+Shift\+/g, '⌥⇧').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥');
  const fix = (root) => {
    if (root.nodeType !== 1) return;
    const els = [root, ...root.querySelectorAll('[title], kbd')];
    for (const el of els) {
      if (el.title && /Ctrl|Shift\+|Alt\+/.test(el.title)) el.title = macKeys(el.title);
      if (el.tagName === 'KBD') {
        const k = el.textContent;
        if (k === 'Ctrl') el.textContent = '⌘';
        else if (k === 'Shift') el.textContent = '⇧';
        else if (k === 'Alt') el.textContent = '⌥';
      }
    }
  };
  fix(document.body);
  new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(fix); })
    .observe(document.body, { childList: true, subtree: true });
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const AGENTS = {
  claude: {
    name: 'Claude',
    icon: 'claude',
    newline: '\x1b\r', // Shift+Enter → newline in prompt
    imagePaste: '\x1bv', // Alt+V pastes clipboard image on Windows
    quick: [
      ['command', '/compact', '대화 압축'],
      ['refresh', '/clear', '새 대화'],
      ['sparkle', '/model', '모델 변경'],
      ['history', '/resume', '대화 전환'],
      ['list', '/context', '컨텍스트 사용량'],
      ['info', '/status', '상태'],
    ],
  },
  codex: {
    name: 'Codex',
    icon: 'codex',
    newline: '\x1b\r', // Alt+Enter → newline in the Codex composer (tested on codex-cli 0.169: Ctrl+J / CSI-u are ignored)
    imagePaste: '\x16',
    quick: [
      ['command', '/compact', '대화 압축'],
      ['refresh', '/new', '새 대화'],
      ['sparkle', '/model', '모델 변경'],
      ['history', '/resume', '대화 전환'],
      ['list', '/diff', '변경 사항 보기'],
      ['info', '/status', '상태'],
    ],
  },
};

const THEME = {
  background: '#10131a',
  foreground: '#dfe3ea',
  cursor: '#c9b8ff',
  cursorAccent: '#10131a',
  selectionBackground: 'rgba(143, 115, 255, 0.35)',
  selectionInactiveBackground: 'rgba(143, 115, 255, 0.18)',
  scrollbarSliderBackground: 'rgba(255, 255, 255, 0.08)',
  scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.16)',
  scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.22)',
  black: '#1c202a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#f5c06b',
  blue: '#7aa2f7',
  magenta: '#c792ea',
  cyan: '#5fd4e0',
  white: '#c8ced9',
  brightBlack: '#5c6375',
  brightRed: '#ff9b9b',
  brightGreen: '#86efac',
  brightYellow: '#fcd58a',
  brightBlue: '#9fbcff',
  brightMagenta: '#dcb0ff',
  brightCyan: '#8fe6ef',
  brightWhite: '#f3f5f9',
};

const STATUS_TEXT = {
  starting: '시작 중',
  shell: '셸',
  ready: '입력 대기',
  working: '실행 중',
  done: '완료',
  attention: '확인 필요',
  exited: '종료됨',
};

const PERM_LABEL = { plan: '계획 모드', acceptEdits: '편집 자동 수락' };

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const S = {
  settings: {},
  projects: [],
  shells: [],
  home: '',
  version: '',
  tabs: [],
  activeId: null,
  winFocused: true,
  expanded: new Set(),
  groups: [], // split panes: [{ ids: [tabId...], dir: 'row' | 'col' | 'grid' }]
  zoom: null, // tab id temporarily shown alone inside its split
  grid: null, // project path shown as a grid
  sessionCache: new Map(),
  loadingHistory: new Set(),
  tasks: [], // agent work items, newest last
  secOpen: new Set(), // sidebar sections opened by the user (closed by default)
  secClosed: new Set(), // sidebar sections closed by the user (open by default)
  collapsed: new Set(), // folded folders
  openFolder: null, // accordion: id of the open folder box (null = follow the active tab)
  folderTab: {}, // folder id → selected tab inside its box
  overlay: null,
};

const tabsEl = $('#tabs');
const termsEl = $('#terminals');

const activeTab = () => S.tabs.find((t) => t.id === S.activeId) || null;
const tabById = (id) => S.tabs.find((t) => t.id === id) || null;
const projectFor = (cwd) => S.projects.find((p) => samePath(p.path, cwd)) || null;
const agentTabs = () => S.tabs.filter((t) => t.agent);

function cleanOscTitle(t) {
  const s = String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (!s || /^(claude( code)?|codex)$/i.test(s) || /[\\/]|\.exe\b|^(관리자|administrator)/i.test(s)) return '';
  return s;
}

function shellName(id) {
  const s = S.shells.find((x) => x.id === id);
  return s ? s.name : '셸';
}

function tabPlace(t) {
  const proj = projectFor(t.cwd);
  return proj ? proj.name : basename(t.cwd);
}

function tabLabel(t) {
  if (t.customTitle) return t.customTitle;
  if (t.agent) return cleanOscTitle(t.oscTitle) || tabPlace(t) || AGENTS[t.agent].name;
  return tabPlace(t) || shellName(t.shellId);
}

function tabIconName(t) {
  return t.agent ? AGENTS[t.agent].icon : 'terminal';
}

function prettyPath(p) {
  if (!p) return '';
  if (S.home && p.toLowerCase().startsWith(S.home.toLowerCase())) return '~' + p.slice(S.home.length);
  return p;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

let layoutTimer = null;
function saveLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    const tabs = S.tabs.map((t) => ({
      shellId: t.shellId,
      cwd: t.cwd,
      customTitle: t.customTitle || '',
      agent: t.agent || (t.launch && t.launch.type) || '',
      sessionId: t.sessionId || (t.launch && t.launch.sessionId) || '',
      permissionMode: t.permissionMode || '',
      workingSince: t.agent && t.status === 'working' ? t.workStart : 0,
    }));
    const active = Math.max(0, S.tabs.findIndex((t) => t.id === S.activeId));
    const groups = S.groups.map((g) => ({ dir: g.dir, idx: g.ids.map((id) => S.tabs.findIndex((t) => t.id === id)).filter((i) => i >= 0) }));
    window.mt.store.layout({ tabs, active, groups });
  }, 200);
  window.mt.setRunning(agentTabs().length);
}

function saveProjects() { window.mt.store.projects(S.projects); }
function saveSettings(patch) {
  Object.assign(S.settings, patch);
  window.mt.store.settings(patch);
}

/* ------------------------------------------------------------------ */
/* Terminal tabs                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Appearance: theme → app chrome + xterm colors, accent, translucency */
/* ------------------------------------------------------------------ */

const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixRgb = (c, t, k) => c.map((v, i) => Math.round(v + (t[i] - v) * k));
const rgbCss = (c, a = 1) => (a < 1 ? `rgba(${c.join(', ')}, ${a})` : `rgb(${c.join(', ')})`);
const rgbHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/* 라이트 / 다크 / 시스템. S.dark is what's in effect now (the main process resolves "system"). */
S.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isLight = () => S.dark === false;
window.mt.onThemeUpdated?.((dark) => { if (S.dark !== dark) { S.dark = dark; applySettings(); redrawAgents(); } }); // the OS switched (system mode)
function setAppearanceMode(mode) {
  saveSettings({ appearance: mode });
  return window.mt.setTheme(mode).then((dark) => { const changed = S.dark !== dark; S.dark = dark; applySettings(); if (changed) redrawAgents(); });
}
/** A one-column wiggle makes Claude / Codex repaint their whole screen (with the new colour rules applied). */
function redrawAgents() {
  for (const t of S.tabs) {
    if (!t.agent || !t.alive) continue;
    const { cols, rows } = t.term;
    window.mt.pty.resize(t.id, Math.max(10, cols - 1), rows);
    setTimeout(() => window.mt.pty.resize(t.id, t.term.cols, t.term.rows), 150);
  }
}

function currentTheme() {
  const T = window.THEMES;
  if (isLight()) { const th = T[S.settings.themeLight]; return th && th.light ? th : T.minsuLight; }
  const th = T[S.settings.theme];
  return th && !th.light ? th : T.minsu;
}
/** Background alpha for the blur materials (acrylic / mica). "opacity" mode fades the whole window instead. */
function bgAlpha() { return ['acrylic', 'mica'].includes(S.settings.bgEffect) ? Math.max(0.3, Math.min(1, Number(S.settings.bgOpacity) || 0.82)) : 1; }
function needsClearTerminal() { return bgAlpha() < 1 || (S.settings.bgAnim && S.settings.bgAnim !== 'none') || !!S.settings.bgImage; }
function windowOpacity() { return S.settings.bgEffect === 'opacity' ? Math.max(0.5, Math.min(1, Number(S.settings.bgOpacity) || 0.9)) : 1; }

function xtermTheme() {
  const th = currentTheme();
  const acc = (window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c[0];
  const ar = hexRgb(acc);
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const t = {
    // background is the app's (themes recolor text only); when translucent the stage paints it, so the
    // terminal itself stays clear — otherwise the two layers stack into a visible darker box
    background: needsClearTerminal() ? 'rgba(0, 0, 0, 0)' : rgbCss(BASE_STAGE),
    foreground: th.fg,
    cursor: cursorPreset().custom ? 'rgba(0, 0, 0, 0)' : S.settings.cursorColor === 'accent' ? acc : S.settings.cursorColor === 'white' ? (isLight() ? '#1f2430' : '#ffffff') : th.cursor,
    cursorAccent: rgbHex(BASE_STAGE),
    selectionBackground: rgbCss(ar, 0.35),
    selectionInactiveBackground: rgbCss(ar, 0.18),
  };
  names.forEach((n, i) => {
    t[n] = th.ansi[i];
    t['bright' + n[0].toUpperCase() + n.slice(1)] = th.ansi[i + 8];
  });
  return t;
}

// the terminal stage and the window chrome — dark: #10131a / #0d0f14 · light: #fafbfc / #eef0f4
let BASE_STAGE = [16, 19, 26];
let BASE_CHROME = [13, 15, 20];
function setBaseColors() {
  // each theme brings its own background; the window chrome is a shade of it
  BASE_STAGE = hexRgb(currentTheme().bg || (isLight() ? '#fafbfc' : '#10131a'));
  BASE_CHROME = isLight() ? mixRgb(BASE_STAGE, [0, 0, 0], 0.045) : mixRgb(BASE_STAGE, [0, 0, 0], 0.2);
}
/** Sidebar / tab / panel colours tinted from the theme background (the two default themes keep the CSS values). */
function themeSurfaces() {
  const b = BASE_STAGE;
  const W = [255, 255, 255];
  const K = [0, 0, 0];
  if (isLight()) {
    return { '--surface': mixRgb(b, W, 0.65), '--surface-2': mixRgb(b, K, 0.025), '--surface-3': mixRgb(b, K, 0.07),
      '--border': mixRgb(b, K, 0.1), '--border-strong': mixRgb(b, K, 0.17) };
  }
  return { '--surface': mixRgb(b, W, 0.035), '--surface-2': mixRgb(b, W, 0.07), '--surface-3': mixRgb(b, W, 0.11),
    '--border': mixRgb(b, W, 0.09), '--border-strong': mixRgb(b, W, 0.15) };
}

/*
 * On a scaled display (125 %, 150 % …) a 10 px margin or a 1.5 px border falls between screen pixels and
 * each side rounds differently — the working border looked thicker top/left than bottom/right. Snap the
 * pane's edges, the border's gap and its thickness to whole device pixels.
 */
function snapPaneGeometry() {
  const stageEl = $('#stage');
  if (!stageEl) return;
  const d = window.devicePixelRatio || 1;
  const snap = (v) => Math.round(v * d) / d;
  const r = stageEl.getBoundingClientRect();
  const root = document.documentElement.style;
  root.setProperty('--pane-t', `${snap(r.top + 10) - r.top}px`);
  root.setProperty('--pane-l', `${snap(r.left + 10) - r.left}px`);
  root.setProperty('--pane-r', `${r.right - snap(r.right - 10)}px`);
  root.setProperty('--pane-b', `${r.bottom - snap(r.bottom - 10)}px`);
  root.setProperty('--ring-gap', `${snap(4)}px`);
  root.setProperty('--ring-w', `${Math.max(1, Math.round(2 * d)) / d}px`);
}
window.addEventListener('resize', () => snapPaneGeometry());

function applyAppearance() {
  snapPaneGeometry();
  const st = S.settings;
  setBaseColors();
  document.documentElement.dataset.theme = isLight() ? 'light' : 'dark';
  const a = bgAlpha();
  const root = document.documentElement.style;
  root.setProperty('--stage', rgbCss(BASE_STAGE, a));
  root.setProperty('--bg', rgbCss(BASE_CHROME, a));
  root.setProperty('--stage-solid', rgbCss(BASE_STAGE));
  const plain = ['minsu', 'minsuLight'].includes(Object.keys(window.THEMES).find((k) => window.THEMES[k] === currentTheme()));
  for (const [k, v] of Object.entries(themeSurfaces())) {
    if (plain) root.removeProperty(k); else root.setProperty(k, rgbCss(v));
  }
  const acc = (window.ACCENTS[st.accent] || window.ACCENTS.violet).c;
  root.setProperty('--violet', acc[0]);
  root.setProperty('--violet-soft', rgbCss(hexRgb(acc[0]), 0.16));
  root.setProperty('--grad', `linear-gradient(135deg, ${acc[1]} 0%, ${acc[2]} 55%, ${acc[3]} 100%)`);
  document.body.classList.toggle('translucent', a < 1);
  if (document.body.classList.contains('relay-room')) { document.body.classList.remove('relay-room'); requestAnimationFrame(() => S.tabs.forEach(fitTab)); }

  const theme = xtermTheme();
  for (const t of S.tabs) {
    t.term.options.allowTransparency = needsClearTerminal();
    t.term.options.cursorBlink = st.cursorBlink && !cursorPreset().custom;
    t.term.options.cursorInactiveStyle = cursorPreset().custom ? 'none' : 'outline';
    t.term.options.theme = theme;
    t.term.options.cursorStyle = cursorPreset().style;
    t.term.options.cursorWidth = cursorPreset().width;
    t.term.options.letterSpacing = Number(st.letterSpacing) || 0;
    // light mode on a solid background: xterm darkens any text that would be too faint to read
    t.term.options.minimumContrastRatio = isLight() && !needsClearTerminal() ? 4.5 : 1;
  }
  document.body.classList.toggle('crt', !!st.crt);
  updateBgAnim();
  updateAmbient();
  updateBgImage();
  scheduleCursor();
  S.tabs.forEach(updateTabEl);
  S.tabs.forEach(schedulePromptBoxes);
  S.tabs.forEach(syncRenderer);
  window.mt.appearance({ material: st.bgEffect || 'none', opacity: windowOpacity(), chrome: rgbHex(BASE_CHROME), zoom: st.uiZoom || 1, dark: !isLight() });
}

/* ------------------------------------------------------------------ */
/* Decorations: typing effects · custom cursors · animated backgrounds  */
/* · task-complete celebration. One effect engine, reused by previews.  */
/* ------------------------------------------------------------------ */

/*
 * Sound words the effects draw on canvas: real onomatopoeia per language, not a translation
 * (canvas text never passes through the page translator).
 */
const FX_WORDS = {
  keys: { ko: ['톡', '탁', '딱', '팍', '콕', '틱', '똑', '착'], en: ['tap', 'tik', 'tok', 'pak', 'klik', 'tick', 'plink', 'tak'], ja: ['トン', 'タッ', 'カッ', 'パッ', 'コツ', 'チッ', 'ポン', 'タン'], zh: ['咚', '嗒', '啪', '叭', '嘀', '滴', '叮', '哒'] },
  '쾅!': { en: 'BOOM!', ja: 'ドーン!', zh: '轰!' },
  '펑!': { en: 'POP!', ja: 'パン!', zh: '砰!' },
  '짠!': { en: 'TA-DA!', ja: 'ジャーン!', zh: '铛铛!' },
  '짝짝짝!': { en: 'CLAP CLAP!', ja: 'パチパチ!', zh: '啪啪啪!' },
};
const fxLang = () => (window.I18N && window.I18N.lang) || 'ko';
const fxWord = (w) => (fxLang() === 'ko' ? w : (FX_WORDS[w] && FX_WORDS[w][fxLang()]) || w);
const fxKeyWords = () => FX_WORDS.keys[fxLang()] || FX_WORDS.keys.ko;

const FX_KINDS = [
  ['none', '없음', '효과 없이 깔끔하게'],
  ['glow', '글로우', '커서 주변이 은은하게 빛남'],
  ['ripple', '물결', '동그란 파동이 퍼짐'],
  ['shockwave', '충격파', '이중 링과 섬광, Enter는 크게'],
  ['particles', '파티클', '작은 입자가 흩어짐'],
  ['spark', '스파크', '빛줄기가 사방으로'],
  ['stars', '별빛', '반짝이는 별이 퍼짐'],
  ['pixel', '픽셀', '레트로 사각 픽셀'],
  ['ember', '불꽃', '불씨가 위로 피어오름'],
  ['bubbles', '버블', '방울이 떠오르다 사라짐'],
  ['hearts', '하트', '하트가 둥실 떠오름'],
  ['matrix', '매트릭스', '초록 글자가 흘러내림'],
  ['lightning', '번개', '짧은 전기 불꽃'],
  ['confetti', '컨페티', '테마 색 종이가 터짐'],
  ['petals', '벚꽃잎', '꽃잎이 흩날리며 내려앉음'],
  ['butterfly', '나비', '날개를 팔랑이며 날아가는 나비'],
  ['notes', '음표', '♪ ♫ 음표가 리듬 타며 떠오름'],
  ['firework', '미니 폭죽', '슝 올라가서 팡 터짐'],
  ['ink', '먹물', '붓끝 먹물이 번지고 방울이 튐'],
  ['snowflake', '눈송이', '육각 눈송이가 빙글 내려앉음'],
  ['letters', '글자 파편', '방금 입력한 글자가 톡톡 튀어나옴 (한글은 자음·모음)'],
  ['slash', '검기', '촥 하고 빛의 칼날이 지나감'],
  ['emojipop', '이모지 팝', '😀🔥✨ 이모지가 톡 튀어나와 둥실'],
  ['ono', '의성어', '"톡! 탁! 딱!" 만화 글자가 튀어나옴 · Enter는 "쾅!"'],
  ['popcorn', '팝콘', '팝콘 알갱이가 팡 튀어 올랐다 떨어짐'],
  ['paint', '물감 튀김', '알록달록 물감이 철퍽 튀김'],
  ['coins', '코인', '금화가 빙글빙글 돌며 튀어나옴'],
  ['gblock', '글리치 블록', 'RGB로 찢어진 조각이 지지직 (멋있는)'],
  ['laser', '레이저', '네 방향으로 레이저 빔이 쭉 뻗어나감 (멋있는)'],
  ['bloom', '꽃 피기', '커서에서 꽃 한 송이가 활짝 피어남 (이쁜)'],
  ['glitter', '반짝이 가루', '파스텔 반짝이 가루가 살랑살랑 내려앉음 (이쁜)'],
  ['dice', '주사위', '주사위가 데굴데굴 굴러 숫자가 나옴 (재미있는)'],
  ['balloonpop', '풍선 펑', '작은 풍선이 부풀다가 "펑!" (재미있는)'],
  ['raindrop', '빗방울', '위에서 빗방울이 똑 떨어져 물결이 퍼짐'],
  ['meteors', '별똥별', '작은 별똥별이 사선으로 쏟아져 반짝'],
  ['magiccircle', '마법진', '커서 아래 빛나는 마법진이 돌며 피어남'],
];

const BG_KINDS = [
  ['none', '없음', '배경 애니메이션 없음'],
  ['stars', '별밤', '천천히 흐르는 별들'],
  ['aurora', '오로라', '강조 색 빛이 일렁임'],
  ['rain', '비', '사선으로 내리는 빗줄기'],
  ['thunder', '뇌우', '비 내리는 밤, 가끔 구름 속에서 번개가 번쩍'],
  ['snow', '눈', '흩날리는 눈송이'],
  ['grid', '신스웨이브', '네온 원근 그리드'],
  ['network', '입자 네트워크', '떠다니는 점과 연결선'],
  ['fireflies', '반딧불', '따뜻한 빛이 둥실 떠다니며 깜빡임'],
  ['sakura', '벚꽃', '분홍 꽃잎이 흩날리며 떨어짐'],
  ['bokeh', '보케', '흐릿한 빛망울이 천천히 떠다님'],
  ['waves', '물결', '아래쪽에서 잔잔하게 일렁이는 파도'],
  ['shooting', '별똥별', '밤하늘에 가끔 별똥별이 지나감'],
  ['sunset', '노을', '천천히 물드는 노을빛과 첫 별'],
  ['blackhole', '블랙홀', '빛이 소용돌이치며 사건의 지평선으로 빨려 들어감'],
  ['warp', '워프 드라이브', '별빛이 길게 늘어지며 우주를 질주'],
  ['jellyfish', '해파리', '빛나는 해파리가 촉수를 흔들며 유영'],
  ['lanterns', '풍등', '따뜻한 등불이 일렁이며 밤하늘로 떠오름'],
  ['campfire', '캠프파이어', '타닥타닥 타는 모닥불과 하늘로 튀어 오르는 불씨'],
  ['constellation', '별자리', '별들이 하나씩 이어져 별자리를 그렸다 사라짐'],
  ['lavalamp', '라바 램프', '말랑한 빛 덩어리가 천천히 오르내림'],
  ['dna', 'DNA 나선', '이중 나선이 천천히 회전'],
  ['pond', '빗방울 연못', '수면 위로 빗방울 동심원이 퍼짐'],
  ['code', '코드 비', '희미한 코드 글자가 줄기처럼 흘러내림'],
  ['circuit', '회로 기판', '회로선을 따라 빛 신호가 달려감'],
  ['tunnel', '시공간 터널', '빛의 고리가 끝없이 다가오는 터널'],
  ['deepsea', '심해', '위에서 비치는 빛줄기와 떠오르는 기포, 반짝이는 플랑크톤'],
  ['nightfire', '밤하늘 불꽃', '먼 하늘에 가끔 불꽃놀이가 피어남'],
  ['aquarium', '수족관', '꼬리 흔드는 물고기들이 헤엄치고 기포가 보글'],
  ['life', '생명 게임', '세포가 스스로 태어나고 죽으며 무늬를 만듦'],
  ['bounce', '튕기는 로고', 'M 로고가 벽에 튕길 때마다 색이 바뀜 · 모서리에 맞으면 반짝!'],
  ['pong', '혼자 하는 탁구', '양쪽 라켓이 알아서 공을 주고받음'],
  ['balloonsky', '풍선 하늘', '알록달록 풍선이 줄을 늘어뜨리고 둥실 떠오름'],
];

/* ---------- effect engine ---------- */

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.35, y - s * 0.95, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.35, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
}
function starPath(ctx, x, y, s, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.32 : s;
    const a = rot + (i * Math.PI) / 4;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function createFx(canvas) {
  const fx = { canvas, ctx: canvas.getContext('2d'), parts: [], raf: 0, dpr: 1, w: 0, h: 0 };
  fx.size = (w, h) => {
    fx.dpr = window.devicePixelRatio || 1;
    fx.w = w; fx.h = h;
    canvas.width = Math.max(1, Math.round(w * fx.dpr));
    canvas.height = Math.max(1, Math.round(h * fx.dpr));
  };
  fx.burst = (kind, x, y, o) => { addBurst(fx, kind, x, y, o); if (!fx.raf) fx.raf = requestAnimationFrame(fx.loop); };
  fx.loop = (now) => {
    if (now - (fx.last || 0) < 15) { fx.raf = requestAnimationFrame(fx.loop); return; } // ~60 fps on high-refresh screens
    fx.last = now;
    drawFx(fx);
    fx.raf = fx.parts.length ? requestAnimationFrame(fx.loop) : 0;
    if (!fx.raf) fx.ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  fx.stop = () => { cancelAnimationFrame(fx.raf); fx.raf = 0; fx.parts = []; };
  fx.kick = () => { if (!fx.raf) fx.raf = requestAnimationFrame(fx.loop); };
  return fx;
}

/** What a key looks like as a flying glyph: the character itself, or a symbol for keys that aren't one. */
const KEY_GLYPHS = { '\x7f': '←', '\b': '←', Backspace: '←', Delete: '⌦', '\r': '↵', '\n': '↵', Enter: '↵', '\t': '⇥', Tab: '⇥', ' ': '␣', '\x1b': 'esc', Escape: 'esc' };
function typedGlyphs(text) {
  if (text == null || text === '') return [];
  if (KEY_GLYPHS[text]) return [KEY_GLYPHS[text]];
  return [...String(text)].map((c) => KEY_GLYPHS[c] ?? c).filter((c) => c.length > 1 || c.charCodeAt(0) >= 32);
}

/** o: { enter, k (intensity), cw, ch (cell size), text (what was typed) } */
function addBurst(fx, kind, x, y, o) {
  const enter = !!o.enter;
  const k = Math.max(0.3, Math.min(2, Number(o.k) || 1));
  const sz = 0.65 + 0.35 * k;
  const cw = o.cw || 8;
  const ch = o.ch || 16;
  const cols = fxColors();
  const pick = () => cols[(Math.random() * cols.length) | 0];
  const alpha = Math.min(1, 0.45 + 0.55 * k);
  const n = (base, big) => Math.max(1, Math.round((enter ? big : base) * k));
  const P = fx.parts;
  const rnd = (a, b) => a + Math.random() * (b - a);

  switch (kind) {
    case 'glow':
      P.push({ t: 'glow', x, y, r: ch * (enter ? 3.2 : 1.7) * sz, a: alpha, life: 1, decay: enter ? 0.035 : 0.06, c: cols[0] });
      break;
    case 'ripple':
      P.push({ t: 'ring', x, y, r: 2, grow: (enter ? 2.6 : 1.1) * sz, w: 1.6, a: alpha, life: 1, decay: enter ? 0.028 : 0.055, c: pick() });
      break;
    case 'shockwave':
      P.push({ t: 'flash', x, y, r: ch * (enter ? 1.6 : 0.9) * sz, a: alpha, life: 1, decay: 0.12, c: cols[0] });
      P.push({ t: 'ring', x, y, r: 1, grow: (enter ? 4.2 : 1.8) * sz, w: enter ? 3 : 2, a: alpha, life: 1, decay: enter ? 0.04 : 0.07, c: cols[0] });
      P.push({ t: 'ring', x, y, r: 1, grow: (enter ? 2.6 : 1.1) * sz, w: 1.2, a: alpha * 0.8, life: 1, decay: enter ? 0.03 : 0.06, c: cols[2] });
      break;
    case 'particles':
      for (let i = 0, m = n(6, 22); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = (enter ? 1.6 : 0.8) + Math.random() * (enter ? 3.2 : 1.8);
        P.push({ t: 'p', x, y, vx: Math.cos(ang) * sp * sz, vy: Math.sin(ang) * sp * sz - 0.8, s: rnd(1.2, 3) * sz, a: 1, life: 1, decay: rnd(0.022, 0.052), c: pick() });
      }
      break;
    case 'spark':
      for (let i = 0, m = Math.max(3, n(6, 14)); i < m; i++) {
        const ang = (i / m) * Math.PI * 2 + Math.random() * 0.5;
        P.push({ t: 'line', x, y, ang, d: ch * 0.35, len: 0, max: (enter ? ch * 2.2 : ch * 1.1) * sz * rnd(0.6, 1.2), a: 1, life: 1, decay: enter ? 0.045 : 0.07, c: pick() });
      }
      break;
    case 'stars':
      for (let i = 0, m = n(3, 12); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = rnd(0.4, enter ? 2.6 : 1.3) * sz;
        P.push({ t: 'star', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.3, s: rnd(2.5, 5) * sz, rot: Math.random() * 3, vr: rnd(-0.08, 0.08), ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.015, 0.03), c: pick() });
      }
      break;
    case 'pixel':
      for (let i = 0, m = n(7, 20); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = rnd(0.8, enter ? 3.8 : 2.6) * sz;
        P.push({ t: 'px', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1, s: Math.round(rnd(2, 4) * sz), a: 1, life: 1, decay: rnd(0.025, 0.055), c: pick() });
      }
      break;
    case 'ember': {
      const warm = [[255, 168, 76], [255, 104, 56], [255, 214, 102]];
      for (let i = 0, m = n(6, 16); i < m; i++) {
        P.push({ t: 'ember', x: x + rnd(-0.5, 0.5) * cw, y, vx: rnd(-0.3, 0.3), vy: -rnd(0.6, enter ? 2.8 : 1.9) * sz, s: rnd(1, 2.8) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.018, 0.038), c: warm[(Math.random() * 3) | 0] });
      }
      break;
    }
    case 'bubbles':
      for (let i = 0, m = n(2, 9); i < m; i++) {
        P.push({ t: 'bubble', x: x + rnd(-0.6, 0.6) * cw, y, vy: -rnd(0.5, enter ? 1.9 : 1.2) * sz, r: rnd(2, enter ? 7 : 4.5) * sz, ph: Math.random() * 6, a: alpha, life: 1, decay: rnd(0.012, 0.024), c: pick() });
      }
      break;
    case 'hearts':
      for (let i = 0, m = n(1, 6); i < m; i++) {
        P.push({ t: 'heart', x: x + rnd(-0.6, 0.6) * cw, y, vy: -rnd(0.6, enter ? 1.8 : 1.2) * sz, s: rnd(5, enter ? 11 : 8) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.014, 0.026), c: i % 2 ? [255, 120, 170] : pick() });
      }
      break;
    case 'matrix': {
      const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789';
      for (let i = 0, m = n(2, 10); i < m; i++) {
        P.push({ t: 'glyph', x: x + Math.round(rnd(-1.5, 1.5)) * cw, y: y - ch * 0.4, vy: rnd(0.9, 2.2) * sz, g: glyphs[(Math.random() * glyphs.length) | 0], s: ch * 0.75 * sz, a: 1, life: 1, decay: rnd(0.016, 0.03), c: [74, 222, 128] });
      }
      break;
    }
    case 'lightning':
      for (let i = 0, m = Math.max(1, n(1, 4)); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const len = (enter ? ch * 3.4 : ch * 1.7) * sz;
        const pts = [[x, y]];
        const segs = 6;
        for (let j = 1; j <= segs; j++) {
          const d = (len * j) / segs;
          const jitter = (Math.random() - 0.5) * ch * 0.7;
          pts.push([x + Math.cos(ang) * d - Math.sin(ang) * jitter, y + Math.sin(ang) * d + Math.cos(ang) * jitter]);
        }
        P.push({ t: 'bolt', pts, a: 1, life: 1, decay: enter ? 0.07 : 0.11, c: i % 2 ? [255, 255, 255] : cols[0] });
      }
      break;
    case 'petals': { // cherry-blossom petals burst, then drift down
      const pinks = [[255, 183, 206], [255, 214, 228], [255, 160, 190]];
      for (let i = 0, m = n(5, 18); i < m; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = rnd(1, enter ? 3.6 : 2.2) * sz;
        P.push({ t: 'petal', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, s: rnd(3, 5.5) * sz, rot: Math.random() * 6, vr: rnd(-0.12, 0.12), ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.008, 0.014), c: pinks[(Math.random() * 3) | 0] });
      }
      break;
    }
    case 'butterfly':
      for (let i = 0, m = Math.max(1, n(1, 4)); i < m; i++) {
        const ang = -Math.PI / 2 + rnd(-1.1, 1.1);
        const sp = rnd(0.7, enter ? 1.8 : 1.2) * sz;
        P.push({ t: 'fly', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, s: rnd(4, enter ? 8 : 6) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.011, 0.018), c: pick() });
      }
      break;
    case 'notes': {
      const glyphs = ['♪', '♫', '♬', '♩'];
      for (let i = 0, m = Math.max(1, n(1, 5)); i < m; i++) {
        P.push({ t: 'note', x: x + rnd(-0.5, 0.5) * cw, y, vx: rnd(-0.6, 0.6), vy: -rnd(0.7, enter ? 1.8 : 1.3) * sz, g: glyphs[(Math.random() * 4) | 0], s: ch * rnd(0.8, enter ? 1.4 : 1.05) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.016, 0.026), c: pick() });
      }
      break;
    }
    case 'firework': // a rocket that bursts where it stops
      P.push({ t: 'rocket', x, y, vy: -(enter ? 4.2 : 2.8) * sz, k, sz, enter, a: 1, life: 1, decay: enter ? 0.06 : 0.075, c: pick(), cols });
      break;
    case 'ink':
      P.push({ t: 'blot', x, y, r: 1, max: ch * (enter ? 1.6 : 0.8) * sz, a: alpha, life: 1, decay: enter ? 0.018 : 0.03, c: cols[0], seed: Math.random() * 6 });
      for (let i = 0, m = n(2, 7); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = rnd(1, enter ? 3.4 : 2.2) * sz;
        P.push({ t: 'drop', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, s: rnd(1, 2.4) * sz, a: alpha, life: 1, decay: rnd(0.03, 0.05), c: cols[0] });
      }
      break;
    case 'snowflake':
      for (let i = 0, m = Math.max(1, n(2, 7)); i < m; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = rnd(0.5, enter ? 2.2 : 1.3) * sz;
        P.push({ t: 'flake', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.5, s: rnd(3, enter ? 7 : 5) * sz, rot: Math.random() * 6, vr: rnd(-0.06, 0.06), ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.012, 0.02), c: [220, 236, 255] });
      }
      break;
    case 'letters': { // the character you just typed flies out of the cursor
      const chars = typedGlyphs(o.text);
      const single = chars.length <= 1;
      const list = single ? Array.from({ length: n(3, 8) }, () => chars[0] || '•') : chars.slice(0, 12);
      list.forEach((g, i) => {
        const ang = -Math.PI / 2 + rnd(-1.2, 1.2);
        const sp = rnd(1.6, enter ? 4.4 : 3) * sz;
        const big = single && i === 0; // one copy pops bigger
        P.push({ t: 'letter', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (big ? 0.8 : 0), g, s: ch * (big ? 1.15 : rnd(0.55, 0.85)) * sz, rot: 0, vr: rnd(-0.25, 0.25), a: 1, life: 1, decay: rnd(0.02, 0.032), c: pick() });
      });
      break;
    }
    case 'slash': {
      const ang = rnd(-0.9, -0.4) + (Math.random() < 0.5 ? 0 : Math.PI);
      P.push({ t: 'slash', x, y, ang, len: ch * (enter ? 4.5 : 2.4) * sz, a: 1, life: 1, decay: enter ? 0.06 : 0.09, c: cols[0] });
      if (enter) P.push({ t: 'slash', x, y, ang: ang + 1.4, len: ch * 4 * sz, a: 1, life: 1.15, decay: 0.06, c: cols[2] });
      break;
    }
    case 'emojipop': {
      const EM = ['😀', '😆', '🔥', '✨', '💥', '🎉', '👍', '💯', '🚀', '⭐', '💖', '🍀', '😎', '🤩', '⚡'];
      for (let i = 0, m = Math.max(1, n(1, 4)); i < m; i++) {
        P.push({ t: 'emo', g: EM[(Math.random() * EM.length) | 0], x: x + rnd(-0.4, 0.4) * cw, y, vx: rnd(-0.6, 0.6), vy: -rnd(1, enter ? 2.6 : 1.8) * sz, s: ch * (enter ? 1.5 : 1.05) * sz, age: 0, a: 1, life: 1, decay: rnd(0.018, 0.026), c: [255, 255, 255] });
      }
      break;
    }
    case 'ono': { // 의성어: a comic sound word for every key
      const WORDS = fxKeyWords();
      const COLS = [[255, 214, 61], [255, 107, 129], [96, 220, 255], [140, 255, 140], [200, 150, 255]];
      P.push({ t: 'ono', g: enter ? fxWord('쾅!') : WORDS[(Math.random() * WORDS.length) | 0], x: x + rnd(-0.3, 0.3) * cw, y: y - ch * 0.4, vy: -0.5, s: ch * (enter ? 1.9 : 1.1) * sz, rot: rnd(-0.35, 0.35), age: 0, a: 1, life: 1, decay: enter ? 0.018 : 0.03, c: enter ? [255, 82, 82] : COLS[(Math.random() * COLS.length) | 0] });
      break;
    }
    case 'popcorn':
      for (let i = 0, m = n(2, 7); i < m; i++) {
        P.push({ t: 'corn', x, y, y0: y + ch * 0.8, vx: rnd(-1.6, 1.6) * sz, vy: -rnd(2.4, enter ? 4.6 : 3.6) * sz, s: rnd(2.2, 3.4) * sz, rot: Math.random() * 6, vr: rnd(-0.2, 0.2), bounce: 0, a: 1, life: 1, decay: rnd(0.016, 0.024), c: [255, 246, 220] });
      }
      break;
    case 'paint': { // a splash of a random paint colour (or several on Enter)
      const PAINT = [[255, 82, 82], [255, 193, 7], [33, 150, 243], [76, 175, 80], [171, 71, 188], [255, 112, 67]];
      for (let k = 0, kk = enter ? 3 : 1; k < kk; k++) {
        const c = PAINT[(Math.random() * PAINT.length) | 0];
        const ox = x + (enter ? rnd(-1.5, 1.5) * ch : 0); const oy = y + (enter ? rnd(-1, 1) * ch : 0);
        P.push({ t: 'blot', x: ox, y: oy, r: 1, max: ch * (enter ? 1.1 : 0.6) * sz, a: 0.85, life: 1, decay: 0.025, c, seed: Math.random() * 6 });
        for (let i = 0, m = n(3, 6); i < m; i++) { const ang = Math.random() * Math.PI * 2; const sp = rnd(1.4, 3.2) * sz; P.push({ t: 'drop', x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, s: rnd(1, 2.4) * sz, a: 0.9, life: 1, decay: rnd(0.025, 0.04), c }); }
      }
      break;
    }
    case 'coins':
      for (let i = 0, m = Math.max(1, n(1, 5)); i < m; i++) {
        P.push({ t: 'coin', x, y, vx: rnd(-1.2, 1.2) * sz, vy: -rnd(3, enter ? 5 : 4) * sz, r: ch * 0.38 * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.018, 0.024), c: [255, 205, 60] });
      }
      break;
    case 'gblock': // torn RGB strips flickering around the cursor
      for (let i = 0, m = n(3, 7); i < m; i++) {
        P.push({ t: 'gblk', x: x + rnd(-1.5, 1.5) * cw, y: y + rnd(-0.6, 0.6) * ch, w: rnd(1, enter ? 7 : 4) * cw * 0.6 * sz, h: rnd(0.12, 0.35) * ch * sz, a: 1, life: 1, decay: rnd(0.07, 0.12), c: [[0, 229, 255], [255, 46, 136], [255, 255, 255]][i % 3] });
      }
      break;
    case 'laser': // four beams shooting out from the cursor
      for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        P.push({ t: 'laser', x, y, ang, len: 0, max: ch * (enter ? 6 : 3) * sz, a: 1, life: 1, decay: enter ? 0.06 : 0.09, c: cols[0] });
      }
      break;
    case 'bloom': // a flower opening, petal by petal
      P.push({ t: 'bloom', x, y, r: ch * (enter ? 1.2 : 0.65) * sz, rot: Math.random() * 6, age: 0, a: 1, life: 1, decay: enter ? 0.02 : 0.035, c: [[255, 170, 205], [255, 205, 120], [190, 160, 255], [140, 210, 255]][(Math.random() * 4) | 0] });
      break;
    case 'glitter': // pastel glitter drifting down, twinkling
      for (let i = 0, m = n(5, 16); i < m; i++) {
        P.push({ t: 'glit', x: x + rnd(-0.8, 0.8) * cw, y: y - rnd(0, 0.5) * ch, vx: rnd(-0.6, 0.6), vy: rnd(-1.2, 0.2) * sz, s: rnd(1.2, 2.6) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.012, 0.022), c: [[255, 190, 230], [190, 220, 255], [255, 245, 180], [210, 190, 255]][(Math.random() * 4) | 0] });
      }
      break;
    case 'dice': // a die tossed out, tumbling, landing on a face
      P.push({ t: 'dice', x, y, y0: y + ch * 0.6, vx: rnd(-1.5, 1.5) * sz, vy: -rnd(3, enter ? 5 : 4) * sz, s: ch * (enter ? 1 : 0.65) * sz, rot: 0, vr: rnd(0.2, 0.35) * (Math.random() < 0.5 ? -1 : 1), face: 1 + ((Math.random() * 6) | 0), landed: false, a: 1, life: 1, decay: 0.016, c: [255, 255, 255] });
      break;
    case 'balloonpop': // a little balloon inflates… and POPS
      P.push({ t: 'bpop', x, y: y - ch * 0.4, r: 1, max: ch * (enter ? 0.9 : 0.55) * sz, age: 0, a: 1, life: 1, decay: 0.012, c: [[255, 107, 129], [99, 202, 255], [255, 196, 87], [96, 220, 160], [176, 132, 255]][(Math.random() * 5) | 0], enter });
      break;
    case 'raindrop': // a drop falls onto the cursor, then rings spread on the "water"
      P.push({ t: 'rdrop', x, y: y - ch * 3, ty: y + ch * 0.3, vy: 0, s: Math.max(1.5, ch * 0.12) * sz, a: 1, life: 1, decay: 0.01, c: [170, 220, 255], enter, landed: false });
      break;
    case 'meteors': // a few tiny meteors streak in diagonally and spark where they land
      for (let i = 0, m = Math.max(1, n(1, 4)); i < m; i++) {
        const dx = rnd(-0.5, 0.5) * cw * 2;
        P.push({ t: 'meteor', x: x + dx + ch * 2.4, y: y - ch * 2.4, tx: x + dx, ty: y, k: 0, sp: rnd(0.09, 0.14), s: sz, a: 1, life: 1, decay: 0.012, c: pick(), sparked: false, at: i * 4 });
      }
      break;
    case 'magiccircle': // a glowing rune circle unfolds under the cursor and turns
      P.push({ t: 'magic', x, y: y + ch * 0.2, r: ch * (enter ? 2.2 : 1.2) * sz, age: 0, a: 1, life: 1, decay: enter ? 0.018 : 0.03, c: cols[0] });
      break;
    case 'balloons': {
      const pal = [[255, 107, 129], [255, 196, 87], [99, 202, 255], [176, 132, 255], [96, 220, 160]];
      for (let i = 0, m = n(3, 8); i < m; i++) {
        P.push({ t: 'balloon', x: x + rnd(-1, 1) * 40 * sz, y: y + rnd(0, 30) * sz, vx: rnd(-0.3, 0.3), vy: -rnd(0.8, 1.6) * sz, r: rnd(7, 11) * sz, ph: Math.random() * 6, a: 1, life: 1, decay: rnd(0.006, 0.01), c: pal[(Math.random() * pal.length) | 0] });
      }
      break;
    }
    case 'confetti': {
      const pal = currentTheme().ansi.slice(9, 15).map(hexRgb);
      for (let i = 0, m = n(8, 26); i < m; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = rnd(1.5, enter ? 5 : 3.5) * sz;
        P.push({ t: 'conf', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: rnd(3, 6) * sz, hh: rnd(1.6, 3.2) * sz, rot: Math.random() * 6, vr: rnd(-0.2, 0.2), a: 1, life: 1, decay: rnd(0.014, 0.026), c: pal[(Math.random() * pal.length) | 0] });
      }
      break;
    }
    default:
      break;
  }
}

function drawFx(fx) {
  const { ctx, canvas, dpr } = fx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  fx.parts = fx.parts.filter((p) => (p.life -= p.decay) > 0);
  for (const p of fx.parts) {
    const [r, g, b] = p.c;
    const A = (m) => `rgba(${r},${g},${b},${Math.max(0, m)})`;
    switch (p.t) {
      case 'glow':
      case 'flash': {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        grd.addColorStop(0, A((p.t === 'flash' ? 0.6 : 0.38) * p.a * p.life));
        grd.addColorStop(1, A(0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'ring':
        p.r += p.grow * (1 + (1 - p.life) * 2);
        ctx.strokeStyle = A(0.7 * p.a * p.life);
        ctx.lineWidth = (p.w || 1.6) * (0.4 + p.life * 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'line': {
        p.len += (p.max - p.len) * 0.35;
        const x1 = p.x + Math.cos(p.ang) * (p.d + p.len * (1 - p.life));
        const y1 = p.y + Math.sin(p.ang) * (p.d + p.len * (1 - p.life));
        const x2 = p.x + Math.cos(p.ang) * (p.d + p.len);
        const y2 = p.y + Math.sin(p.ang) * (p.d + p.len);
        ctx.strokeStyle = A(p.life); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        break;
      }
      case 'star':
        p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97; p.rot += p.vr; p.ph += 0.3;
        ctx.fillStyle = A(p.life * (0.55 + 0.45 * Math.sin(p.ph)));
        starPath(ctx, p.x, p.y, p.s * (0.6 + p.life * 0.4), p.rot); ctx.fill();
        break;
      case 'px':
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.96;
        ctx.fillStyle = A(p.life);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
        break;
      case 'ember': {
        p.ph += 0.15; p.x += p.vx + Math.sin(p.ph) * 0.35; p.y += p.vy; p.vy *= 0.985;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 3);
        grd.addColorStop(0, A(p.life)); grd.addColorStop(1, A(0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bubble':
        p.ph += 0.12; p.x += Math.sin(p.ph) * 0.4; p.y += p.vy;
        ctx.strokeStyle = A(0.8 * p.a * p.life); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.15 - p.life * 0.15), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = A(0.5 * p.a * p.life);
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.6, p.r * 0.22), 0, Math.PI * 2); ctx.fill();
        break;
      case 'heart':
        p.ph += 0.1; p.x += Math.sin(p.ph) * 0.45; p.y += p.vy;
        ctx.fillStyle = A(p.life);
        heartPath(ctx, p.x, p.y, p.s * (0.7 + (1 - p.life) * 0.4)); ctx.fill();
        break;
      case 'glyph':
        p.y += p.vy;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `${Math.round(p.s)}px 'Cascadia Mono', Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = A(p.life);
        ctx.shadowColor = A(0.8 * p.life); ctx.shadowBlur = 6;
        ctx.fillText(p.g, p.x, p.y);
        ctx.restore();
        break;
      case 'bolt': {
        const flicker = Math.random() > 0.25 ? 1 : 0.3;
        ctx.save();
        ctx.strokeStyle = A(p.life * flicker); ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        ctx.shadowColor = A(p.life); ctx.shadowBlur = 8;
        ctx.beginPath();
        p.pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'petal':
        p.ph += 0.06; p.rot += p.vr;
        p.x += p.vx + Math.sin(p.ph) * 0.5; p.y += p.vy; p.vy = Math.min(p.vy + 0.05, 1.1); p.vx *= 0.97;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.ph)));
        ctx.fillStyle = A(Math.min(1, p.life * 1.4) * 0.9);
        ctx.beginPath();
        ctx.moveTo(0, -p.s);
        ctx.bezierCurveTo(p.s * 0.9, -p.s * 0.6, p.s * 0.7, p.s * 0.7, 0, p.s);
        ctx.bezierCurveTo(-p.s * 0.7, p.s * 0.7, -p.s * 0.9, -p.s * 0.6, 0, -p.s);
        ctx.fill();
        ctx.restore();
        break;
      case 'balloon': {
        p.ph += 0.05; p.x += p.vx + Math.sin(p.ph) * 0.4; p.y += p.vy;
        const al = Math.min(1, p.life * 1.6);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(220,220,230,${0.5 * al})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + p.r * 1.15); ctx.quadraticCurveTo(p.x + Math.sin(p.ph) * 4, p.y + p.r * 2, p.x, p.y + p.r * 2.8); ctx.stroke();
        ctx.fillStyle = A(0.85 * al);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.85, p.r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.45 * al})`;
        ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.4, p.r * 0.18, p.r * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'emo': { // pops in big, settles, floats up
        p.age += 1; p.x += p.vx; p.y += p.vy; p.vy *= 0.96;
        const pop = p.age < 6 ? 0.4 + p.age * 0.15 : 1.3 - Math.min(0.3, (p.age - 6) * 0.05);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = `${Math.round(p.s * pop)}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; // colour emoji: never tinted by a previous fill
        ctx.fillText(p.g, p.x, p.y);
        ctx.restore();
        break;
      }
      case 'ono': { // comic lettering: thick outline, a pop and a wobble
        p.age += 1; p.y += p.vy; p.vy *= 0.92;
        const pop = p.age < 5 ? 0.3 + p.age * 0.2 : 1.2 - Math.min(0.2, (p.age - 5) * 0.04);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, p.life * 2.2);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.sin(p.age * 0.5) * 0.04); ctx.scale(pop, pop);
        ctx.font = `900 ${Math.round(p.s)}px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, p.s * 0.16); ctx.strokeStyle = '#1a1a1a';
        ctx.strokeText(p.g, 0, 0);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(p.g, 0, 0);
        ctx.restore();
        break;
      }
      case 'corn': { // a puffy kernel: pops up, falls, bounces once
        p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.98; p.rot += p.vr;
        if (p.y > p.y0 && p.bounce < 1) { p.y = p.y0; p.vy *= -0.45; p.bounce++; }
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const al = Math.min(1, p.life * 2);
        ctx.fillStyle = `rgba(255,246,220,${al})`;
        for (const [dx, dy, rr] of [[-0.6, 0, 1], [0.6, -0.2, 0.9], [0, -0.7, 0.85], [0.1, 0.5, 0.8]]) { ctx.beginPath(); ctx.arc(dx * p.s, dy * p.s, rr * p.s, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `rgba(255,190,60,${al})`;
        ctx.beginPath(); ctx.arc(0.2 * p.s, 0.5 * p.s, 0.35 * p.s, 0, Math.PI * 2); ctx.fill(); // the husk
        ctx.restore();
        break;
      }
      case 'coin': { // a spinning gold coin (its width follows the spin)
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.ph += 0.35;
        const wv = Math.abs(Math.cos(p.ph));
        const al = Math.min(1, p.life * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(200,140,20,${al})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.8, p.r * wv), p.r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,215,80,${al})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.5, p.r * wv * 0.78), p.r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
        if (wv > 0.5) { ctx.fillStyle = `rgba(255,250,210,${al * 0.8})`; ctx.fillRect(p.x - p.r * wv * 0.12, p.y - p.r * 0.45, p.r * wv * 0.24, p.r * 0.9); }
        ctx.restore();
        break;
      }
      case 'rdrop': // a falling drop; on landing → rings
        if (!p.landed) {
          p.vy += 0.6; p.y += p.vy;
          if (p.y >= p.ty) {
            p.landed = true; p.life = 0;
            for (let i = 0; i < (p.enter ? 3 : 2); i++) fx.parts.push({ t: 'ring', x: p.x, y: p.ty, r: 1, grow: (p.enter ? 1.6 : 1) * (1 - i * 0.3), w: 1.4, a: 0.9, life: 1 + i * 0.25, decay: 0.04, c: p.c });
            for (let i = 0; i < 4; i++) fx.parts.push({ t: 'p', x: p.x, y: p.ty, vx: (Math.random() - 0.5) * 2, vy: -1.5 - Math.random() * 1.5, s: 1, a: 1, life: 0.7, decay: 0.05, c: p.c });
            break;
          }
          ctx.fillStyle = A(0.9);
          ctx.beginPath(); ctx.moveTo(p.x, p.y - p.s * 2.4); ctx.quadraticCurveTo(p.x + p.s, p.y, p.x, p.y + p.s); ctx.quadraticCurveTo(p.x - p.s, p.y, p.x, p.y - p.s * 2.4); ctx.fill();
        }
        break;
      case 'meteor': { // streak toward the target, leaving a fading tail; sparks on arrival
        if (p.at > 0) { p.at -= 1; p.life += p.decay; break; }
        p.k = Math.min(1, p.k + p.sp);
        const hx = p.x + (p.tx - p.x) * p.k; const hy = p.y + (p.ty - p.y) * p.k;
        const tx = p.x + (p.tx - p.x) * Math.max(0, p.k - 0.35); const ty = p.y + (p.ty - p.y) * Math.max(0, p.k - 0.35);
        const grd = ctx.createLinearGradient(tx, ty, hx, hy); grd.addColorStop(0, A(0)); grd.addColorStop(1, A(p.life));
        ctx.strokeStyle = grd; ctx.lineWidth = 2 * p.s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${p.life})`; ctx.beginPath(); ctx.arc(hx, hy, 1.6 * p.s, 0, Math.PI * 2); ctx.fill();
        if (p.k >= 1 && !p.sparked) { p.sparked = true; p.life = 0.25; fx.burst('stars', hx, hy, { k: 0.8, cw: 6, ch: 12 }); }
        break;
      }
      case 'magic': { // two counter-rotating rings, runes between them, a star at the heart
        p.age += 1;
        const open = Math.min(1, p.age / 8); const R = p.r * open; const al = Math.min(1, p.life * 2);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.45); // seen in perspective, lying on the floor
        ctx.strokeStyle = A(0.85 * al); ctx.lineWidth = 1.4; ctx.shadowColor = A(al); ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.rotate(p.age * 0.06);
        ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i * 4 * Math.PI) / 6 - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72); } ctx.stroke(); // a hexagram
        ctx.restore();
        ctx.save(); ctx.rotate(-p.age * 0.04);
        ctx.fillStyle = A(0.9 * al); ctx.font = `${Math.max(6, Math.round(R * 0.22))}px 'Segoe UI Symbol', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾ';
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.save(); ctx.translate(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); ctx.rotate(a + Math.PI / 2); ctx.fillText(RUNES[i], 0, 0); ctx.restore(); }
        ctx.restore();
        ctx.restore();
        break;
      }
      case 'gblk': // a glitch strip: jumps sideways every frame
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = A(0.7 * p.life);
        ctx.fillRect(p.x + (Math.random() - 0.5) * 6, p.y, p.w * (0.6 + Math.random() * 0.6), p.h);
        ctx.restore();
        break;
      case 'laser': { // a beam that shoots out, a white-hot core in a coloured glow
        p.len += (p.max - p.len) * 0.45;
        const x2 = p.x + Math.cos(p.ang) * p.len; const y2 = p.y + Math.sin(p.ang) * p.len;
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = A(0.5 * p.life); ctx.lineWidth = 4; ctx.shadowColor = A(p.life); ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${p.life})`; ctx.lineWidth = 1.2; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'bloom': { // five petals growing out, a golden centre
        p.age += 1;
        const open = Math.min(1, p.age / 10);
        const al = Math.min(1, p.life * 2.2);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.age * 0.01);
        ctx.fillStyle = A(0.9);
        for (let i = 0; i < 5; i++) {
          ctx.save(); ctx.rotate((i / 5) * Math.PI * 2);
          ctx.beginPath(); ctx.ellipse(0, -p.r * 0.55 * open, p.r * 0.32 * open, p.r * 0.55 * open, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(255,225,120,0.95)'; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.22 * open, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'glit': // a twinkling glitter flake drifting down
        p.ph += 0.35; p.x += p.vx + Math.sin(p.ph * 0.3) * 0.3; p.y += p.vy; p.vy = Math.min(p.vy + 0.04, 0.9); p.vx *= 0.97;
        ctx.fillStyle = A(p.life * (0.5 + 0.5 * Math.abs(Math.sin(p.ph))));
        starPath(ctx, p.x, p.y, p.s * (0.8 + 0.4 * Math.abs(Math.sin(p.ph))), p.ph * 0.2); ctx.fill();
        break;
      case 'dice': { // tumbling through the air, settling flat with its face up
        if (!p.landed) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.rot += p.vr;
          if (Math.random() < 0.3) p.face = 1 + ((Math.random() * 6) | 0);
          if (p.y >= p.y0 && p.vy > 0) { p.y = p.y0; p.vy *= -0.35; p.vr *= 0.4; if (Math.abs(p.vy) < 1) { p.landed = true; p.rot = 0; } }
        }
        const s = p.s; const al = Math.min(1, p.life * 2.5);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = '#fbfbfb'; ctx.strokeStyle = '#c9c9d2'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.2); ctx.fill(); ctx.stroke();
        const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
        ctx.fillStyle = p.face === 1 ? '#d7263d' : '#222';
        for (const [dx, dy] of PIPS[p.face]) { ctx.beginPath(); ctx.arc(dx * s * 0.26, dy * s * 0.26, s * (p.face === 1 ? 0.13 : 0.085), 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        break;
      }
      case 'bpop': { // inflate, wobble, POP into bits + a tiny "펑!"
        p.age += 1;
        if (p.r < p.max) p.r += (p.max - p.r) * 0.25 + 0.2;
        if (p.age === (p.enter ? 26 : 18)) {
          p.life = 0;
          for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; fx.parts.push({ t: 'p', x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, s: 1.4, a: 1, life: 0.8, decay: 0.05, c: p.c }); }
          fx.parts.push({ t: 'ono', g: fxWord('펑!'), x: p.x, y: p.y, vy: -0.6, s: p.max * 1.4, rot: (Math.random() - 0.5) * 0.4, age: 0, a: 1, life: 1, decay: 0.05, c: [255, 240, 120] });
          break;
        }
        const wob = 1 + Math.sin(p.age * 0.9) * 0.04;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = A(0.9);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.86 * wob, p.r / wob, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.15, p.r * 0.25, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(220,220,230,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + p.r); ctx.lineTo(p.x, p.y + p.r * 1.8); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'slots': { // three reels: spin, stop one by one on 7, then the payout
        p.age += 1;
        const S2 = p.s; const rw = 34 * S2; const rh = 46 * S2; const gap = 8 * S2;
        const W = rw * 3 + gap * 4; const H = rh + gap * 2;
        const SYM = ['🍒', '🔔', '⭐', '💎', '🍋', '7'];
        const al = Math.min(1, p.life * 3);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.translate(p.x, p.y);
        const bounce = p.age < 10 ? 1 - (1 - p.age / 10) ** 3 : 1;
        ctx.scale(bounce, bounce);
        ctx.fillStyle = '#2a1458'; ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 3 * S2;
        ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 10 * S2); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const rx = -W / 2 + gap + i * (rw + gap);
          const stopAt = 40 + i * 16;
          ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(rx, -rh / 2, rw, rh, 5 * S2); ctx.fill();
          ctx.save(); ctx.beginPath(); ctx.rect(rx, -rh / 2, rw, rh); ctx.clip();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (p.age < stopAt) { // spinning: symbols streak past
            const off = (p.age * 9 * S2) % rh;
            for (let k = -1; k <= 1; k++) {
              const sym = SYM[(Math.floor(p.age / 2) + i * 2 + k + 6) % SYM.length];
              ctx.font = `700 ${Math.round(26 * S2)}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
              ctx.fillStyle = '#c1121f'; ctx.globalAlpha = al * 0.75;
              ctx.fillText(sym, rx + rw / 2, k * rh + off);
            }
            ctx.globalAlpha = al;
          } else { // stopped on a bold red 7, with a little settle
            const settle = Math.max(0, 6 - (p.age - stopAt)) * 1.5 * S2;
            ctx.font = `900 ${Math.round(32 * S2)}px 'Segoe UI', 'Arial Black', sans-serif`; ctx.fillStyle = '#d7263d';
            ctx.fillText('7', rx + rw / 2, settle);
          }
          ctx.restore();
        }
        ctx.restore();
        if (p.age > 74 && !p.paid) { // JACKPOT
          p.paid = true;
          fx.parts.push({ t: 'flash', x: p.x, y: p.y, r: 120 * S2, a: 1, life: 1, decay: 0.06, c: [255, 230, 120] });
          fx.parts.push({ t: 'ono', g: 'JACKPOT!', x: p.x, y: p.y - H, vy: -0.5, s: 28 * S2, rot: -0.08, age: 0, a: 1, life: 1, decay: 0.012, c: [255, 207, 74] });
          for (let i = 0; i < 40; i++) fx.parts.push({ t: 'coin', x: p.x + (Math.random() - 0.5) * W * 0.6, y: p.y, vx: (Math.random() - 0.5) * 7 * S2, vy: -(4 + Math.random() * 5) * S2, r: 6 * S2, ph: Math.random() * 6, a: 1, life: 1, decay: 0.012 + Math.random() * 0.006, c: [255, 205, 60] });
        }
        break;
      }
      case 'domino': { // N tiles; each tips over (around its bottom-right corner) as the one before hits it
        p.age += 1;
        const N = 12; const tw = 7 * p.s; const th = 38 * p.s; const step = p.w / N;
        const al = Math.min(1, p.life * 3);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        for (let i = 0; i < N; i++) {
          const bx = p.x - p.w / 2 + i * step;
          const start = 14 + i * 5;
          const k = Math.max(0, Math.min(1, (p.age - start) / 9));
          const ang = (k * k) * 1.18; // falls faster as it goes (≈ 68°, resting on the next one)
          ctx.save(); ctx.translate(bx + tw, p.y); ctx.rotate(ang);
          ctx.fillStyle = '#f4f1ea'; ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(-tw, -th, tw, th, 2 * p.s); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#1b1b1f';
          for (const dy of [0.25, 0.75]) { ctx.beginPath(); ctx.arc(-tw / 2, -th * dy, 1.3 * p.s, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
        ctx.restore();
        const end = 14 + (N - 1) * 5 + 9;
        if (p.age > end && !p.fired) { // the last tile lands: fireworks
          p.fired = true;
          const ex = p.x + p.w / 2;
          for (let i = 0; i < 3; i++) setTimeout(() => fx.burst('spark', ex - i * 40 * p.s, p.y - 50 * p.s - i * 25 * p.s, { enter: true, k: 1.8 * p.s, cw: 8, ch: 16 }), i * 140);
          fx.burst('confetti', ex, p.y - 10, { enter: true, k: 1.6 * p.s, cw: 8, ch: 16 });
        }
        break;
      }
      case 'lantern': { // 풍등: a paper lantern drifting up, swaying, its flame flickering
        p.ph += 0.045; p.x += Math.sin(p.ph) * 0.35; p.y += p.vy;
        const k = Math.min(1, p.life * 2.2) * p.a;
        const S = p.s;
        ctx.save(); ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.ph) * 0.08);
        const halo = ctx.createRadialGradient(0, S * 0.3, 0, 0, S * 0.3, S * 3.2);
        halo.addColorStop(0, `rgba(255,170,80,${0.35 * k})`); halo.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, S * 0.3, S * 3.2, 0, Math.PI * 2); ctx.fill();
        const body = ctx.createLinearGradient(0, -S, 0, S);
        body.addColorStop(0, `rgba(255,214,140,${0.95 * k})`); body.addColorStop(1, `rgba(255,120,50,${0.95 * k})`);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(-S * 0.62, -S * 0.72); ctx.quadraticCurveTo(0, -S * 1.08, S * 0.62, -S * 0.72);
        ctx.lineTo(S * 0.46, S * 0.74); ctx.quadraticCurveTo(0, S * 0.86, -S * 0.46, S * 0.74); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(180,80,30,${0.35 * k})`; ctx.lineWidth = 0.8;
        for (const xx of [-0.22, 0.22]) { ctx.beginPath(); ctx.moveTo(xx * S, -S * 0.9); ctx.lineTo(xx * S * 0.8, S * 0.78); ctx.stroke(); }
        const fl = 0.75 + Math.random() * 0.35;
        ctx.fillStyle = `rgba(255,250,200,${k})`; ctx.beginPath(); ctx.ellipse(0, S * 0.62, S * 0.12 * fl, S * 0.2 * fl, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'dragon': { // 용의 춤: a long dragon weaving across, scales shimmering, pearls of light behind it
        p.age += 1;
        const u = p.age / 200;
        const hx = p.x0 + u * p.w;
        const hy = p.y0 + Math.sin(p.age * 0.075) * 32 * p.sc + Math.sin(p.age * 0.031) * 18 * p.sc;
        p.trail.unshift([hx, hy]); if (p.trail.length > 64) p.trail.pop();
        const k = Math.min(1, p.life * 2.5);
        const n = Math.min(26, Math.floor(p.trail.length / 2.4));
        ctx.save(); ctx.globalCompositeOperation = 'source-over';
        for (let i = n - 1; i >= 0; i--) { // body: tail first, so the head is drawn on top
          const [bx, by] = p.trail[Math.min(p.trail.length - 1, Math.round(i * 2.4))];
          const r = p.sc * (9.5 - i * 0.26);
          const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 0, bx, by, r);
          g.addColorStop(0, `rgba(255,120,90,${k})`); g.addColorStop(1, `rgba(190,20,40,${k})`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
          if (i % 2 === 0) { ctx.fillStyle = `rgba(255,210,80,${0.9 * k})`; ctx.beginPath(); ctx.arc(bx, by - r * 0.75, r * 0.32, 0, Math.PI * 2); ctx.fill(); } // golden spines
        }
        if (p.trail.length > 3) { // head
          const [ax, ay] = p.trail[3];
          const ang = Math.atan2(hy - ay, hx - ax);
          const R0 = 12 * p.sc;
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
          ctx.fillStyle = `rgba(220,30,50,${k})`; ctx.beginPath(); ctx.ellipse(R0 * 0.3, 0, R0 * 1.15, R0 * 0.78, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255,210,80,${k})`; ctx.lineWidth = 1.6 * p.sc; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-R0 * 0.2, -R0 * 0.6); ctx.lineTo(-R0 * 0.9, -R0 * 1.3); ctx.moveTo(-R0 * 0.1, R0 * 0.6); ctx.lineTo(-R0 * 0.8, R0 * 1.3); ctx.stroke(); // horns
          ctx.lineWidth = 1 * p.sc; const wh = Math.sin(p.age * 0.2) * R0 * 0.3;
          ctx.beginPath(); ctx.moveTo(R0 * 1.3, -R0 * 0.2); ctx.quadraticCurveTo(R0 * 2, -R0 * 0.6 + wh, R0 * 2.6, -R0 * 0.2 + wh); ctx.moveTo(R0 * 1.3, R0 * 0.2); ctx.quadraticCurveTo(R0 * 2, R0 * 0.6 - wh, R0 * 2.6, R0 * 0.2 - wh); ctx.stroke(); // whiskers
          ctx.fillStyle = `rgba(255,240,150,${k})`; ctx.beginPath(); ctx.arc(R0 * 0.75, -R0 * 0.28, R0 * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(20,10,10,${k})`; ctx.beginPath(); ctx.arc(R0 * 0.8, -R0 * 0.28, R0 * 0.09, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        if (p.age % 5 === 0) fx.parts.push({ t: 'star', x: hx, y: hy, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, s: 2 + Math.random() * 2.5, rot: 0, vr: 0.1, ph: Math.random() * 6, a: 1, life: 1, decay: 0.02, c: [255, 215, 90] });
        break;
      }
      case 'cake': { // 생일 케이크: rises in, candles flicker, blown out (smoke), confetti
        p.age += 1;
        const sc = p.sc;
        const rise = Math.min(1, p.age / 24);
        const fade = p.age > 150 ? Math.max(0, 1 - (p.age - 150) / 25) : 1;
        const ease = 1 - (1 - rise) ** 3;
        const cx = p.x;
        const by = p.y + (1 - ease) * 40 * sc;
        ctx.save(); ctx.globalAlpha = fade * rise; ctx.globalCompositeOperation = 'source-over';
        const tier = (y, w, h, top, base) => {
          ctx.fillStyle = base; ctx.fillRect(cx - w / 2, y - h, w, h);
          ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(cx - w / 2, y - h);
          for (let i = 0; i <= 8; i++) { const xx = cx - w / 2 + (w / 8) * i; ctx.lineTo(xx, y - h + (i % 2 ? 7 : 3) * sc); }
          ctx.lineTo(cx + w / 2, y - h - 3 * sc); ctx.lineTo(cx - w / 2, y - h - 3 * sc); ctx.closePath(); ctx.fill();
        };
        ctx.fillStyle = 'rgba(240,240,250,0.9)'; ctx.beginPath(); ctx.ellipse(cx, by + 2 * sc, 52 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill(); // plate
        tier(by, 92 * sc, 28 * sc, '#fff4f8', '#f48fb1');
        tier(by - 28 * sc, 62 * sc, 22 * sc, '#ffffff', '#ce93d8');
        for (const [i, dx] of [[0, -16], [1, 0], [2, 16]]) { // candles
          const x0 = cx + dx * sc, y0 = by - 53 * sc;
          ctx.fillStyle = ['#90caf9', '#fff59d', '#a5d6a7'][i]; ctx.fillRect(x0 - 2.2 * sc, y0 - 16 * sc, 4.4 * sc, 16 * sc);
          if (p.age < 95) { // the flame
            const f = 0.8 + Math.random() * 0.35;
            const g = ctx.createRadialGradient(x0, y0 - 21 * sc, 0, x0, y0 - 21 * sc, 12 * sc);
            g.addColorStop(0, 'rgba(255,220,120,0.6)'); g.addColorStop(1, 'rgba(255,160,60,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x0, y0 - 21 * sc, 12 * sc, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.ellipse(x0, y0 - 21 * sc, 2.6 * sc * f, 5.4 * sc * f, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x0, y0 - 19.5 * sc, 1.1 * sc, 2.2 * sc, 0, 0, Math.PI * 2); ctx.fill();
          } else if (p.age < 150) { // smoke curling up
            const t = (p.age - 95) / 55;
            for (let j = 0; j < 4; j++) {
              const tt = Math.max(0, t - j * 0.12);
              ctx.fillStyle = `rgba(200,200,210,${0.4 * (1 - tt)})`;
              ctx.beginPath(); ctx.arc(x0 + Math.sin(tt * 9 + j) * 4 * sc, y0 - 20 * sc - tt * 46 * sc, (2 + tt * 6) * sc, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
        ctx.restore();
        if (p.age === 96) { // puff! then confetti
          const C = [[255, 99, 132], [255, 206, 86], [75, 192, 192], [153, 102, 255], [255, 159, 64]];
          for (let i = 0; i < 70; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; const sp = (3 + Math.random() * 5) * sc;
            fx.parts.push({ t: 'conf', x: cx, y: by - 60 * sc, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 4 * sc, hh: 7 * sc, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, a: 1, life: 1, decay: 0.011, c: C[i % C.length] });
          }
        }
        break;
      }
      case 'whale': { // 고래 점프: leaps from the waves in an arc and splashes back in
        p.age += 1;
        const sc = p.sc;
        const u = Math.min(1, p.age / 150);
        const base = p.y + 34 * sc;
        const fade = p.age > 172 ? Math.max(0, 1 - (p.age - 172) / 18) : 1;
        ctx.save(); ctx.globalAlpha = fade; ctx.globalCompositeOperation = 'source-over';
        for (let wv = 0; wv < 3; wv++) { // the sea
          ctx.strokeStyle = `rgba(120,190,255,${0.55 - wv * 0.15})`; ctx.lineWidth = 2 * sc;
          ctx.beginPath();
          for (let i = 0; i <= 40; i++) { const xx = p.x - 150 * sc + i * 7.5 * sc; const yy = base + wv * 6 * sc + Math.sin(i * 0.6 + p.age * 0.12 + wv) * 2.5 * sc; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
          ctx.stroke();
        }
        if (p.age <= 150) {
          const wx = p.x - 110 * sc + u * 220 * sc;
          const wy = base - Math.sin(u * Math.PI) * 105 * sc;
          const ang = Math.atan2(-Math.cos(u * Math.PI) * 105 * Math.PI, 220);
          ctx.save(); ctx.translate(wx, wy); ctx.rotate(-ang * 0.9);
          const L = 46 * sc;
          ctx.fillStyle = '#3d6fb0';
          ctx.beginPath(); ctx.moveTo(L * 0.6, 0); ctx.quadraticCurveTo(L * 0.55, -L * 0.36, 0, -L * 0.34); ctx.quadraticCurveTo(-L * 0.55, -L * 0.3, -L * 0.75, -L * 0.04);
          ctx.lineTo(-L * 1.05, -L * 0.28); ctx.quadraticCurveTo(-L * 0.98, 0, -L * 1.05, L * 0.26); ctx.lineTo(-L * 0.75, L * 0.06);
          ctx.quadraticCurveTo(-L * 0.4, L * 0.32, 0, L * 0.3); ctx.quadraticCurveTo(L * 0.55, L * 0.3, L * 0.6, 0); ctx.fill(); // body + fluke
          ctx.fillStyle = '#cfe3ff'; ctx.beginPath(); ctx.moveTo(L * 0.55, L * 0.06); ctx.quadraticCurveTo(L * 0.2, L * 0.3, -L * 0.45, L * 0.16); ctx.quadraticCurveTo(0, L * 0.12, L * 0.55, L * 0.06); ctx.fill(); // belly
          ctx.fillStyle = '#10223d'; ctx.beginPath(); ctx.arc(L * 0.36, -L * 0.06, 1.8 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        if (p.age === 8 || p.age === 144) { // splash at take-off and landing
          const sx = p.age === 8 ? p.x - 100 * sc : p.x + 100 * sc;
          for (let i = 0; i < 26; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; const sp = (2 + Math.random() * 4.5) * sc;
            fx.parts.push({ t: 'spl', x: sx, y: base, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: (1.5 + Math.random() * 2.5) * sc, a: 1, life: 1, decay: 0.022, c: [150, 210, 255] });
          }
        }
        break;
      }
      case 'spl': // a drop of water thrown up, falling back
        p.x += p.vx; p.y += p.vy; p.vy += 0.18;
        ctx.fillStyle = A(0.85 * p.life); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        break;
      case 'swarm': { // 반딧불 군무: fireflies drift in, form a heart, twinkle, scatter
        p.age += 1;
        const gather = Math.min(1, p.age / 70);
        const scatter = p.age > 125 ? (p.age - 125) / 40 : 0;
        for (const f of p.flies) {
          f.ph += 0.12;
          const e = 1 - (1 - gather) ** 3;
          let fx_ = f.sx + (f.tx - f.sx) * e + Math.sin(f.ph * 0.7) * 2;
          let fy_ = f.sy + (f.ty - f.sy) * e + Math.cos(f.ph * 0.6) * 2;
          if (scatter) { fx_ += f.dx * scatter * 120; fy_ += f.dy * scatter * 120; }
          const tw = 0.55 + 0.45 * Math.sin(f.ph * 1.6 + f.o);
          const al = Math.min(1, p.life * 2) * tw * (scatter ? Math.max(0, 1 - scatter) : 1);
          const g = ctx.createRadialGradient(fx_, fy_, 0, fx_, fy_, 10 * p.sc);
          g.addColorStop(0, `rgba(250,255,190,${Math.min(1, al * 1.4)})`); g.addColorStop(0.3, `rgba(200,255,100,${0.75 * al})`); g.addColorStop(1, 'rgba(160,255,60,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx_, fy_, 10 * p.sc, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'portal': { // opens, swirls, sprays stars, snaps shut
        p.age += 1;
        const open = p.age < 22 ? p.age / 22 : p.age < 105 ? 1 : Math.max(0, 1 - (p.age - 105) / 14);
        const R = p.R * (open < 1 && p.age >= 105 ? open : 1 - (1 - open) ** 3);
        if (R < 1) break;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.scale(1, 0.62);
        for (let k = 0; k < 5; k++) { // swirling rings
          const rr = R * (1 - k * 0.16);
          const c = [[160, 110, 255], [90, 200, 255], [255, 110, 220]][k % 3];
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.75 - k * 0.1})`; ctx.lineWidth = (5 - k * 0.6) * (p.R / 62);
          const a0 = p.age * (0.09 + k * 0.03) * (k % 2 ? -1 : 1);
          ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + Math.PI * 1.5); ctx.stroke();
        }
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
        core.addColorStop(0, 'rgba(255,255,255,0.85)'); core.addColorStop(0.4, 'rgba(150,110,255,0.45)'); core.addColorStop(1, 'rgba(40,10,80,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (p.age > 22 && p.age < 105 && p.age % 2 === 0) { // stars thrown out of it
          const a = Math.random() * Math.PI * 2; const sp = 2 + Math.random() * 3.5;
          fx.parts.push({ t: 'star', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, s: 2 + Math.random() * 3, rot: 0, vr: 0.12, ph: Math.random() * 6, a: 1, life: 1, decay: 0.018, c: [[200, 170, 255], [140, 220, 255], [255, 170, 230]][(Math.random() * 3) | 0] });
        }
        if (p.age === 120) fx.parts.push({ t: 'flash', x: p.x, y: p.y, r: 70, a: 1, life: 1, decay: 0.12, c: [220, 200, 255] }); // snap!
        break;
      }
      case 'emofall': // an emoji falling, tumbling a little
        p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, p.life * 2.5);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.font = `${Math.round(p.s)}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.fillText(p.g, 0, 0);
        ctx.restore();
        break;
      case 'gift': { // drop (bounce) → rattle → the lid flies off, confetti + stars burst out, "짠!"
        p.age += 1;
        const s = p.s; const al = Math.min(1, p.life * 3);
        let gy = p.y; let wob = 0; let lidY = 0; let lidR = 0;
        if (p.age < 16) { const k = p.age / 16; gy = p.y - (1 - k) * 160 + Math.abs(Math.sin(k * Math.PI * 1.5)) * -18 * (1 - k); }
        else if (p.age < 46) wob = Math.sin(p.age * 1.3) * 0.12 * ((p.age - 16) / 30);
        else { const k = Math.min(1, (p.age - 46) / 14); lidY = -k * s * 1.6; lidR = k * -0.9; }
        if (p.age === 46 && !p.opened) {
          p.opened = true;
          fx.burst('confetti', p.x, gy - s * 0.5, { enter: true, k: 2, cw: 8, ch: 16 });
          fx.burst('stars', p.x, gy - s * 0.6, { enter: true, k: 1.8, cw: 8, ch: 16 });
          fx.parts.push({ t: 'flash', x: p.x, y: gy - s * 0.5, r: s * 2, a: 1, life: 1, decay: 0.08, c: [255, 240, 200] });
          fx.parts.push({ t: 'ono', g: fxWord('짠!'), x: p.x, y: gy - s * 1.6, vy: -0.6, s: s * 0.7, rot: -0.1, age: 0, a: 1, life: 1, decay: 0.014, c: [255, 214, 61] });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.translate(p.x, gy); ctx.rotate(wob);
        const box = `rgb(${r},${g},${b})`; const ribbon = '#ffd166';
        ctx.fillStyle = box; ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.75, s, s * 0.75, s * 0.06); ctx.fill(); // box
        ctx.fillStyle = ribbon; ctx.fillRect(-s * 0.08, -s * 0.75, s * 0.16, s * 0.75); // ribbon down the box
        ctx.save(); ctx.translate(0, -s * 0.75 + lidY); ctx.rotate(lidR);
        ctx.fillStyle = box; ctx.beginPath(); ctx.roundRect(-s * 0.56, -s * 0.2, s * 1.12, s * 0.2, s * 0.05); ctx.fill(); // lid
        ctx.fillStyle = ribbon; ctx.fillRect(-s * 0.08, -s * 0.2, s * 0.16, s * 0.2);
        ctx.beginPath(); ctx.ellipse(-s * 0.16, -s * 0.28, s * 0.16, s * 0.1, -0.5, 0, Math.PI * 2); ctx.ellipse(s * 0.16, -s * 0.28, s * 0.16, s * 0.1, 0.5, 0, Math.PI * 2); ctx.fill(); // bow
        ctx.restore();
        ctx.restore();
        break;
      }
      case 'soap': { // a soap bubble: thin rainbow rim, a highlight; pops into droplets at the end
        p.ph += 0.05; p.y += p.vy; p.x += Math.sin(p.ph) * 0.6;
        if (p.life < 0.12 && !p.popped) {
          p.popped = true; p.life = 0;
          for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; fx.parts.push({ t: 'p', x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, s: 1.2, a: 1, life: 0.8, decay: 0.05, c: [200, 230, 255] }); }
          break;
        }
        const grd = ctx.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
        const al = Math.min(1, p.life * 3) * 0.75;
        grd.addColorStop(0, `rgba(255,120,200,${al})`); grd.addColorStop(0.35, `rgba(120,200,255,${al})`); grd.addColorStop(0.7, `rgba(150,255,170,${al})`); grd.addColorStop(1, `rgba(255,230,120,${al})`);
        ctx.strokeStyle = grd; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${al * 0.12})`; ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${al * 0.8})`;
        ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.4, p.y - p.r * 0.45, p.r * 0.14, p.r * 0.24, -0.6, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'ufo': { // descend → hover with a tractor beam (sparkles rise into it) → zip off
        p.age += 1;
        let ux = p.x; let uy = p.ty;
        if (p.age < 30) uy = p.ty - 160 + (p.age / 30) * 160;
        else if (p.age > 150) { ux = p.x + (p.age - 150) ** 2 * 0.5; uy = p.ty - (p.age - 150) * 3; }
        uy += Math.sin(p.age * 0.12) * 3;
        const al = Math.min(1, p.life * 3);
        if (p.age > 35 && p.age < 150) { // the beam, and things floating up in it
          const bw = p.s * 1.6;
          const grd = ctx.createLinearGradient(0, uy, 0, uy + p.s * 5);
          grd.addColorStop(0, `rgba(170,255,200,${0.35 * al})`); grd.addColorStop(1, 'rgba(170,255,200,0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.moveTo(ux - p.s * 0.5, uy + 4); ctx.lineTo(ux + p.s * 0.5, uy + 4); ctx.lineTo(ux + bw, uy + p.s * 5); ctx.lineTo(ux - bw, uy + p.s * 5); ctx.closePath(); ctx.fill();
          if (p.age % 3 === 0) fx.parts.push({ t: 'star', x: ux + (Math.random() - 0.5) * bw * 1.5, y: uy + p.s * 4.5, vx: 0, vy: -2.2, s: 2.5, rot: 0, vr: 0.1, ph: Math.random() * 6, a: 1, life: 0.7, decay: 0.02, c: p.c });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
        ctx.fillStyle = 'rgba(190,230,255,0.75)'; ctx.beginPath(); ctx.ellipse(ux, uy - p.s * 0.22, p.s * 0.42, p.s * 0.38, 0, Math.PI, 0); ctx.fill(); // dome
        ctx.fillStyle = '#9aa3b5'; ctx.beginPath(); ctx.ellipse(ux, uy, p.s, p.s * 0.28, 0, 0, Math.PI * 2); ctx.fill(); // saucer
        ctx.fillStyle = '#6b7385'; ctx.beginPath(); ctx.ellipse(ux, uy + p.s * 0.08, p.s * 0.8, p.s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = -2; i <= 2; i++) { ctx.fillStyle = (Math.floor(p.age / 6) + i) % 2 ? '#ffe066' : '#ff6b81'; ctx.beginPath(); ctx.arc(ux + i * p.s * 0.36, uy + p.s * 0.02, p.s * 0.06, 0, Math.PI * 2); ctx.fill(); } // blinking lights
        ctx.restore();
        break;
      }
      case 'pxs': // a pixel of a word, floating up as one
        p.y -= 0.45;
        ctx.fillStyle = A(Math.min(1, p.life * 2));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
        break;
      case 'swirl': { // spiralling into a centre, faster as it closes in
        p.r *= 0.965; p.ang += 0.05 + 6 / Math.max(8, p.r);
        p.x = p.cx + Math.cos(p.ang) * p.r; p.y = p.cy + Math.sin(p.ang) * p.r * 0.6;
        ctx.fillStyle = A(Math.min(1, p.life * 2));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'plane': { // a paper plane banking along a gentle arc, trailing dots
        p.ph += 0.06; p.x += p.vx; p.y += p.vy + Math.sin(p.ph) * 1.2; p.vy += 0.02; p.trail += 1;
        if (p.trail % 3 === 0) fx.parts.push({ t: 'p', x: p.x, y: p.y, vx: 0, vy: 0, s: 1.1, a: 1, life: 0.6, decay: 0.02, c: p.c });
        const dir = Math.atan2(p.vy + Math.cos(p.ph) * 1.2 * 0.06, p.vx);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(dir);
        ctx.fillStyle = `rgba(245,247,255,${Math.min(1, p.life * 2)})`;
        ctx.beginPath(); ctx.moveTo(p.s, 0); ctx.lineTo(-p.s, -p.s * 0.6); ctx.lineTo(-p.s * 0.5, 0); ctx.lineTo(-p.s, p.s * 0.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = A(Math.min(1, p.life * 2)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.s, 0); ctx.lineTo(-p.s * 0.5, 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'curtain': { // aurora: many thin rays of light, each its own height, swaying and shimmering
        p.ph += 0.035; p.grow = Math.min(1, p.grow + 0.025);
        const al = Math.min(1, p.life * 1.5) * 0.32;
        const N = 46;
        const cw = p.w / N;
        for (let i = 0; i < N; i++) {
          const sway = Math.sin(p.ph + i * 0.22) * 14 + Math.sin(p.ph * 0.6 + i * 0.07) * 10; // the curtain folds
          const xx = p.x - p.w / 2 + i * cw + sway;
          const hh = p.h * p.grow * (0.55 + 0.45 * Math.sin(p.ph * 0.8 + i * 0.45) ** 2);
          const shimmer = 0.55 + 0.45 * Math.sin(p.ph * 3 + i * 1.7);
          const edge = Math.sin((i / (N - 1)) * Math.PI); // soft at both ends
          const grd = ctx.createLinearGradient(0, p.y, 0, p.y + hh);
          grd.addColorStop(0, A(0));
          grd.addColorStop(0.55, A(al * shimmer * edge * 0.6));
          grd.addColorStop(0.92, A(al * shimmer * edge));
          grd.addColorStop(1, A(0));
          ctx.fillStyle = grd;
          ctx.fillRect(xx, p.y, cw + 0.8, hh);
        }
        break;
      }
      case 'emoji': { // drops, bounces once, then floats up and fades
        if (p.bounce < 2) { p.vy += 1.2; p.y += p.vy; if (p.y >= p.ty) { p.y = p.ty; p.vy *= -0.45; p.bounce++; } }
        else p.y -= 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = `${Math.round(p.s)}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = A(0.9); ctx.shadowBlur = 24;
        ctx.fillText(p.g, p.x, p.y);
        ctx.restore();
        break;
      }
      case 'beam': { // a pillar of light growing upward
        p.h = Math.min(p.h + 14, 420);
        const grd = ctx.createLinearGradient(0, p.y, 0, p.y - p.h);
        grd.addColorStop(0, A(0.55 * p.life)); grd.addColorStop(1, A(0));
        ctx.fillStyle = grd;
        ctx.fillRect(p.x - p.w / 2 * p.life, p.y - p.h, p.w * p.life, p.h);
        break;
      }
      case 'dust': { // 별가루: home in on its spot in the phrase, twinkle there, then drift up and away
        p.age += 1;
        const leaving = p.life < 0.18;
        if (!leaving) { p.x += (p.tx - p.x) * 0.075; p.y += (p.ty - p.y) * 0.075; }
        else { p.y -= 0.6; p.x += Math.sin(p.ph) * 0.4; }
        p.ph += 0.2;
        const tw = 0.65 + 0.35 * Math.sin(p.ph);
        ctx.fillStyle = A(Math.min(1, p.life * 5) * tw);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'fly': { // butterfly: two wing pairs flapping
        p.ph += 0.55; p.x += p.vx + Math.sin(p.ph * 0.25) * 0.6; p.y += p.vy; p.vy -= 0.004;
        const flap = Math.abs(Math.sin(p.ph));
        const dir = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(dir);
        ctx.fillStyle = A(Math.min(1, p.life * 1.5) * 0.85);
        for (const sgn of [-1, 1]) {
          ctx.save(); ctx.scale(sgn * (0.25 + 0.75 * flap), 1);
          ctx.beginPath(); ctx.ellipse(p.s * 0.55, -p.s * 0.3, p.s * 0.55, p.s * 0.42, -0.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(p.s * 0.4, p.s * 0.35, p.s * 0.35, p.s * 0.28, 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = `rgba(255,255,255,${0.7 * p.life})`;
        ctx.fillRect(-0.6, -p.s * 0.5, 1.2, p.s);
        ctx.restore();
        break;
      }
      case 'note':
        p.ph += 0.12; p.x += p.vx * 0.3 + Math.sin(p.ph) * 0.6; p.y += p.vy;
        ctx.save();
        ctx.font = `700 ${Math.round(p.s)}px 'Segoe UI Symbol', 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.ph) * 0.25); // sways to the beat
        ctx.fillStyle = A(p.life);
        ctx.shadowColor = A(0.8 * p.life); ctx.shadowBlur = 6;
        ctx.fillText(p.g, 0, 0);
        ctx.restore();
        break;
      case 'rocket':
        p.y += p.vy; p.vy *= 0.92;
        ctx.fillStyle = A(p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = A(0.5 * p.life); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.vy * 4); ctx.stroke();
        if (p.life - p.decay <= 0 || Math.abs(p.vy) < 0.35) { // burst
          p.life = 0;
          for (let i = 0, m = Math.round((p.enter ? 26 : 12) * p.k); i < m; i++) {
            const ang = (i / m) * Math.PI * 2;
            const sp = (p.enter ? 2.6 : 1.6) * p.sz * (0.8 + Math.random() * 0.4);
            fx.parts.push({ t: 'p', x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, s: 1.4 * p.sz, a: 1, life: 1, decay: 0.03 + Math.random() * 0.02, c: p.cols[i % p.cols.length] });
          }
        }
        break;
      case 'blot': { // ink spreading with a wobbly edge
        p.r += (p.max - p.r) * 0.18;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = A(0.55 * p.a * p.life);
        ctx.beginPath();
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const rr = p.r * (0.82 + 0.18 * Math.sin(a * 5 + p.seed) * Math.cos(a * 3 - p.seed));
          ctx[i ? 'lineTo' : 'moveTo'](p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
        }
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'drop':
        p.x += p.vx; p.y += p.vy; p.vx *= 0.88; p.vy *= 0.88;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = A(0.7 * p.a * p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      case 'flake':
        p.ph += 0.05; p.x += p.vx + Math.sin(p.ph) * 0.3; p.y += p.vy; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.03; p.rot += p.vr;
        ctx.strokeStyle = A(p.life); ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { // six arms with little branches
          const a = p.rot + (i / 6) * Math.PI * 2;
          const ex = p.x + Math.cos(a) * p.s, ey = p.y + Math.sin(a) * p.s;
          ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey);
          const mx = p.x + Math.cos(a) * p.s * 0.6, my = p.y + Math.sin(a) * p.s * 0.6;
          for (const d of [-0.6, 0.6]) { ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + d) * p.s * 0.3, my + Math.sin(a + d) * p.s * 0.3); }
        }
        ctx.stroke();
        break;
      case 'letter':
        p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.vx *= 0.98; p.rot += p.vr;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `700 ${Math.round(p.s)}px 'Cascadia Mono', Consolas, Menlo, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Segoe UI Symbol', monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = A(Math.min(1, p.life * 1.5));
        ctx.fillText(p.g, 0, 0);
        ctx.restore();
        break;
      case 'slash': { // a crescent blade of light
        const prog = Math.max(0.02, Math.min(1, (1 - p.life) * 3.2)); // life can start above 1 (a delayed second blade)
        const L = p.len;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.ang);
        const grd = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
        grd.addColorStop(0, A(0)); grd.addColorStop(Math.max(0.01, prog * 0.85), A(p.life)); grd.addColorStop(Math.min(1, prog), 'rgba(255,255,255,' + p.life + ')'); grd.addColorStop(1, A(0));
        ctx.fillStyle = grd;
        ctx.shadowColor = A(p.life); ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-L / 2, 0);
        ctx.quadraticCurveTo(0, -L * 0.22, L / 2, 0);
        ctx.quadraticCurveTo(0, -L * 0.1, -L / 2, 0);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'conf':
        p.x += p.vx; p.y += p.vy; p.vy += 0.11; p.vx *= 0.98; p.rot += p.vr;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = A(Math.min(1, p.life * 1.5));
        ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh * Math.abs(Math.cos(p.rot * 1.7)) + 0.6);
        ctx.restore();
        break;
      default: // 'p'
        p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.97;
        ctx.fillStyle = A(p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.5 + p.life / 2), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function fxColors() {
  const a = (window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c;
  return [a[0], a[2], a[3]].map(hexRgb);
}

/* ---------- stage layers ---------- */

let FX = null;
function stageFx() {
  if (FX) return FX;
  const stageEl = $('#stage');
  const canvas = h('canvas', 'fx-layer');
  stageEl.appendChild(canvas);
  FX = createFx(canvas);
  const size = () => FX.size(stageEl.clientWidth, stageEl.clientHeight);
  new ResizeObserver(size).observe(stageEl);
  size();
  return FX;
}

/** A particle layer above everything (even the settings window): for previews tried from settings. */
let FRONT_FX = null;
function frontFx() {
  if (FRONT_FX) return FRONT_FX;
  const canvas = h('canvas', 'fx-layer fx-front');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10001;pointer-events:none';
  document.body.appendChild(canvas);
  FRONT_FX = createFx(canvas);
  const size = () => FRONT_FX.size(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', size);
  size();
  return FRONT_FX;
}

/*
 * Where the user is typing. Agents (Claude / Codex) redraw their whole screen constantly, and mid-redraw
 * — or for good, when they hide it and draw their own — the terminal's real cursor sits wherever the last
 * cell was written, often the bottom-right corner. So the caret is only taken once output has settled,
 * and for an agent with a hidden cursor it's the highlighted (inverse) cell it draws in its input box.
 */
function findDrawnCaret(tab) {
  const t = tab.term;
  const b = t.buffer.active;
  const cell = b.getNullCell();
  for (let y = t.rows - 1; y >= Math.max(0, t.rows - 30); y--) {
    const line = b.getLine(b.viewportY + y);
    if (!line) continue;
    for (let x = 0; x < t.cols; x++) {
      if (line.getCell(x, cell) && cell.isInverse()) return { x, y };
    }
  }
  return null;
}
function settleCaret(tab) {
  const t = tab.term;
  const b = t.buffer.active;
  if (b.viewportY !== b.baseY) return;
  let hidden = false;
  try { hidden = !!t._core.coreService.isCursorHidden; } catch { /* ignore */ }
  if (!hidden) tab.caret = { x: b.cursorX, y: b.cursorY };
  else if (tab.agent) { const c = findDrawnCaret(tab); if (c) tab.caret = c; }
}
function stableCaret(tab) {
  const b = tab.term.buffer.active;
  return tab.caret || { x: b.cursorX, y: b.cursorY };
}
function cursorGeometry(tab) {
  const screen = tab.host.querySelector('.xterm-screen');
  if (!screen || !tab.term.cols) return null;
  const r = screen.getBoundingClientRect();
  const sr = $('#stage').getBoundingClientRect();
  const c = stableCaret(tab);
  const cw = r.width / tab.term.cols;
  const ch = r.height / tab.term.rows;
  return { cw, ch, left: r.left - sr.left + c.x * cw, top: r.top - sr.top + c.y * ch };
}

/*
 * Korean typing: the IME only hands over a syllable once it's complete (가 → 각 → 간…).
 * For 글자 파편 we want each 자음 / 모음 the moment its key is pressed, so read the physical key
 * through the 두벌식 layout instead, and skip the finished syllable when it arrives.
 */
const DUBEOL = {
  KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ',
  KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ',
  KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ',
};
const DUBEOL_SHIFT = { KeyQ: 'ㅃ', KeyW: 'ㅉ', KeyE: 'ㄸ', KeyR: 'ㄲ', KeyT: 'ㅆ', KeyO: 'ㅒ', KeyP: 'ㅖ' };
/** The 자모 a key press types while the Korean IME is composing (null if it isn't a Korean key). */
function jamoFor(e) {
  if (!(e.key === 'Process' || e.isComposing) || e.ctrlKey || e.metaKey || e.altKey) return null;
  return (e.shiftKey && DUBEOL_SHIFT[e.code]) || DUBEOL[e.code] || null;
}
let lastJamoFx = 0;
const HANGUL_RE = /^[가-힣ㄱ-ㆎ]+$/;

function spawnFx(tab, data, jamo = false) {
  const kind = S.settings.typingFx;
  if (!kind || kind === 'none' || tab.id !== S.activeId) return;
  if (/^\x1b./.test(data) && data !== '\x1b') return; // arrows, function keys, mouse reports
  // the finished syllable after 자모 were already thrown one by one: don't throw it again
  if (!jamo && kind === 'letters' && HANGUL_RE.test(data) && performance.now() - lastJamoFx < 1500) return;
  if (jamo) lastJamoFx = performance.now();
  setTimeout(() => {
    const geo = cursorGeometry(tab);
    if (!geo) return;
    // while composing, the character being built is drawn at the cursor: burst from just after it
    const comp = tab.host.querySelector('.composition-view.active');
    if (comp && comp.textContent) geo.left += comp.getBoundingClientRect().width - geo.cw;
    stageFx().burst(kind, geo.left + geo.cw / 2, geo.top + geo.ch / 2, { enter: data === '\r', k: S.settings.typingFxIntensity, cw: geo.cw, ch: geo.ch, text: data });
  }, 60);
}

const CELEB_KINDS = [
  ['party', '컨페티 파티', '컨페티와 별이 팡 터짐'],
  ['fireworks', '불꽃놀이', '여러 곳에서 연달아 터지는 폭죽'],
  ['hearts', '하트', '하트가 둥실둥실 떠오름'],
  ['stars', '별 소나기', '반짝이는 별이 쏟아짐'],
  ['bubbles', '버블', '방울이 몽글몽글 떠오름'],
  ['sparkle', '스파클', '빛줄기와 섬광, 충격파'],
  ['rocket', '로켓 발사', '불꽃 꼬리를 달고 솟아올라 펑'],
  ['meteor', '유성', '별똥별이 사선으로 가로지름'],
  ['ripples', '파동', '색이 다른 파동이 겹겹이 퍼짐'],
  ['storm', '번개 폭풍', '여기저기 번개가 번쩍'],
  ['matrix', '매트릭스 비', '초록 글자가 화면 위에서 쏟아짐'],
  ['heart', '하트 폭발', '별들이 커다란 하트를 그렸다가 흩어짐'],
  ['galaxy', '은하수', '별이 나선을 그리며 소용돌이침'],
  ['text', '글자 불꽃', '"완료!" 글자가 빛 입자로 떠올랐다 흩어짐'],
  ['blossom', '벚꽃 폭죽', '벚꽃잎이 팡 터져 흩날림'],
  ['rainbow', '무지개', '일곱 빛깔 아치가 그려짐'],
  ['balloons', '풍선', '알록달록 풍선이 둥실 떠오름'],
  ['supernova', '초신성', '눈부신 섬광 뒤로 충격파와 별 조각이 퍼져나감'],
  ['blackhole', '블랙홀', '빛이 소용돌이치며 빨려 들어갔다가 펑 터져나옴'],
  ['planes', '종이비행기', '종이비행기 편대가 점선을 그리며 날아감'],
  ['curtain', '오로라 커튼', '빛의 커튼이 화면 위에서 일렁이며 내려옴'],
  ['trophy', '트로피', '트로피가 쿵 떨어지고 반짝이가 흩날림'],
  ['levelup', '레벨 업!', '게임처럼 LEVEL UP 글자와 빛 기둥이 솟음'],
  ['cannons', '컨페티 대포', '양쪽 아래에서 색종이 대포가 펑펑'],
  ['thunder', '천둥 강림', '하늘에서 번개가 내리꽂히며 번쩍'],
  ['emojirain', '이모지 비', '🎉🥳✨💯 이모지가 비처럼 쏟아짐'],
  ['gift', '선물 상자', '선물 상자가 떨어져 들썩이다 뚜껑이 펑! 열림'],
  ['soap', '비눗방울', '무지갯빛 비눗방울이 둥실 떠오르다 톡 터짐'],
  ['ufo', 'UFO', 'UFO가 내려와 빛으로 반짝이를 빨아올림'],
  ['applause', '박수 갈채', '👏 "짝짝짝!" 박수가 사방에서 터짐'],
  ['jackpot', '잭팟 777', '슬롯머신 릴이 7·7·7로 멈추고 금화가 와르르'],
  ['dominoes', '도미노', '도미노가 촤라락 쓰러지고 마지막에 펑!'],
  ['lanterns', '풍등 날리기', '따뜻한 풍등들이 흔들리며 밤하늘로 떠오름'],
  ['dragon', '용의 춤', '붉은 용이 금빛 비늘을 반짝이며 화면을 휘감고 지나감'],
  ['cake', '생일 케이크', '촛불 켜진 케이크가 쑥 올라오고, 후— 불면 연기와 함께 폭죽'],
  ['whale', '고래 점프', '파도 속에서 고래가 크게 뛰어올랐다 첨벙'],
  ['fireflies', '반딧불 군무', '반딧불이들이 모여 반짝이는 하트를 만들었다 흩어짐'],
  ['portal', '차원문', '소용돌이 차원문이 열려 별을 쏟아내고 닫힘'],
];

/** Particles placed directly (shapes / text), rather than bursting from one point. */
function placeParts(fx, pts, scale, opt = {}) {
  for (const [px, py, c] of pts) {
    fx.parts.push({
      t: opt.t || 'p', x: px, y: py,
      vx: (Math.random() - 0.5) * (opt.spread ?? 0.4), vy: (Math.random() - 0.5) * (opt.spread ?? 0.4) - (opt.rise || 0),
      s: (opt.size || 1.6) * Math.max(0.5, scale), rot: Math.random() * 6, vr: 0.05, ph: Math.random() * 6,
      a: 1, life: 1, decay: opt.decay || 0.012, c,
    });
  }
  fx.kick();
}

/** Plays one celebration on an effect engine. scale shrinks it for previews. */
function runCelebration(fx, kind, x, y, w, scale = 1) {
  const B = (k, xx, yy, kk = 1.6) => fx.burst(k, xx, yy, { enter: true, k: kk * scale, cw: 8 * scale, ch: 16 * scale });
  const later = (ms, f) => setTimeout(f, ms);
  switch (kind) {
    case 'fireworks':
      for (let i = 0; i < 5; i++) {
        later(i * 220, () => {
          const xx = x + (Math.random() - 0.5) * w * 0.6;
          const yy = y + (Math.random() - 0.4) * 40 * scale;
          B('shockwave', xx, yy, 1.1);
          B('particles', xx, yy, 1.8);
        });
      }
      break;
    case 'hearts':
      B('hearts', x, y + 20 * scale, 2);
      later(200, () => B('hearts', x - 30 * scale, y + 20 * scale, 1.5));
      later(400, () => B('hearts', x + 30 * scale, y + 20 * scale, 1.5));
      break;
    case 'stars':
      B('stars', x, y, 2);
      later(180, () => B('stars', x - 20 * scale, y + 10 * scale, 1.8));
      later(360, () => B('stars', x + 20 * scale, y + 10 * scale, 1.8));
      break;
    case 'bubbles':
      B('bubbles', x, y + 30 * scale, 2);
      later(200, () => B('bubbles', x - 25 * scale, y + 30 * scale, 1.6));
      later(400, () => B('bubbles', x + 25 * scale, y + 30 * scale, 1.6));
      break;
    case 'sparkle':
      B('glow', x, y, 2);
      B('spark', x, y, 2);
      later(120, () => B('shockwave', x, y, 1.5));
      break;
    case 'rocket': { // embers rise from below, then a burst at the top
      const y0 = y + 90 * scale;
      for (let i = 0; i < 7; i++) later(i * 60, () => B('ember', x, y0 - i * 14 * scale, 1.2));
      later(460, () => { B('shockwave', x, y - 10 * scale, 1.4); B('particles', x, y - 10 * scale, 2); B('stars', x, y - 10 * scale, 1.4); });
      break;
    }
    case 'meteor': { // a shooting star crossing diagonally
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        later(i * 35, () => {
          const xx = x - w * 0.35 + (w * 0.7 * i) / steps;
          const yy = y - 30 * scale + (60 * scale * i) / steps;
          B('glow', xx, yy, 0.9);
          if (i % 2) B('stars', xx, yy, 0.7);
        });
      }
      later(steps * 35, () => B('spark', x + w * 0.35, y + 30 * scale, 1.6));
      break;
    }
    case 'ripples':
      for (let i = 0; i < 4; i++) later(i * 160, () => B(i % 2 ? 'ripple' : 'shockwave', x, y, 1.2 + i * 0.2));
      break;
    case 'storm':
      for (let i = 0; i < 6; i++) {
        later(i * 140 + Math.random() * 80, () => {
          const xx = x + (Math.random() - 0.5) * w * 0.7;
          const yy = y + (Math.random() - 0.5) * 50 * scale;
          B('lightning', xx, yy, 1.6);
          if (i % 2 === 0) B('glow', xx, yy, 1.4);
        });
      }
      break;
    case 'matrix':
      for (let i = 0; i < 10; i++) later(i * 70, () => B('matrix', x + (Math.random() - 0.5) * w * 0.8, y - 20 * scale, 1.6));
      break;
    case 'heart': { // the classic heart curve, traced in stars
      const pts = [];
      const hs = 3.2 * scale;
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const hx = 16 * Math.sin(a) ** 3;
        const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        pts.push([x + hx * hs, y + hy * hs, i % 3 ? [255, 95, 143] : [255, 190, 210]]);
      }
      placeParts(fx, pts, scale, { t: 'star', size: 2.4, spread: 0.25, decay: 0.012 });
      later(500, () => B('particles', x, y, 1.6));
      break;
    }
    case 'galaxy': { // spiral arms of stars
      const cols = fxColors();
      for (let i = 0; i < 42; i++) {
        later(i * 18, () => {
          const arm = i % 2 ? Math.PI : 0;
          const a = i * 0.32 + arm;
          const r = (6 + i * 1.6) * scale;
          placeParts(fx, [[x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, cols[i % 3]]], scale, { t: 'star', size: 2, spread: 0.3, decay: 0.014 });
        });
      }
      break;
    }
    case 'text': { // "완료!" drawn in light particles
      const cv = document.createElement('canvas');
      const fs = Math.round(56 * scale);
      cv.width = fs * 4; cv.height = fs * 1.4;
      const c2 = cv.getContext('2d');
      c2.font = `800 ${fs}px 'Malgun Gothic', 'Segoe UI', sans-serif`;
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillStyle = '#fff';
      c2.fillText(tr('완료!'), cv.width / 2, cv.height / 2);
      const data = c2.getImageData(0, 0, cv.width, cv.height).data;
      const step = Math.max(2, Math.round(3 * scale));
      const cols = fxColors();
      const pts = [];
      for (let yy = 0; yy < cv.height; yy += step) {
        for (let xx = 0; xx < cv.width; xx += step) {
          if (data[(yy * cv.width + xx) * 4 + 3] > 128) pts.push([x - cv.width / 2 + xx, y - cv.height / 2 + yy, cols[Math.floor((xx / cv.width) * 3) % 3]]);
        }
      }
      placeParts(fx, pts, scale, { size: 1.3, spread: 0.18, decay: 0.009 });
      break;
    }
    case 'blossom':
      B('petals', x, y, 1.8);
      later(200, () => B('petals', x - 30 * scale, y + 10 * scale, 1.4));
      later(380, () => B('petals', x + 30 * scale, y + 10 * scale, 1.4));
      break;
    case 'rainbow': { // seven bands drawn left → right
      const bands = [[255, 95, 109], [255, 165, 80], [255, 220, 90], [96, 220, 140], [80, 180, 255], [110, 120, 255], [190, 120, 255]];
      const R = 70 * scale;
      for (let s = 0; s <= 24; s++) {
        later(s * 22, () => {
          const a = Math.PI + (s / 24) * Math.PI;
          const pts = bands.map((c, b) => {
            const r = R - b * 5 * scale;
            return [x + Math.cos(a) * r, y + 40 * scale + Math.sin(a) * r, c];
          });
          placeParts(fx, pts, scale, { size: 2.2, spread: 0.05, decay: 0.01 });
        });
      }
      break;
    }
    case 'balloons':
      B('balloons', x, y + 50 * scale, 1.6);
      later(250, () => B('balloons', x - 40 * scale, y + 60 * scale, 1.2));
      break;
    case 'supernova': { // a white-out flash, then shells of shockwave and star debris
      const cols = fxColors();
      fx.parts.push({ t: 'flash', x, y, r: 160 * scale, a: 1, life: 1, decay: 0.035, c: [255, 255, 255] });
      [0, 120, 260].forEach((ms, i) => later(ms, () => {
        fx.parts.push({ t: 'ring', x, y, r: 4, grow: (6 - i * 1.5) * scale, w: 4 - i, a: 1, life: 1, decay: 0.022, c: cols[i % 3] });
      }));
      later(60, () => { for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2; const sp = (2 + Math.random() * 6) * scale; fx.parts.push({ t: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: (2 + Math.random() * 3) * scale, rot: 0, vr: 0.1, ph: Math.random() * 6, a: 1, life: 1, decay: 0.012 + Math.random() * 0.01, c: cols[i % 3] }); } });
      fx.kick();
      break;
    }
    case 'blackhole': { // light spirals in… and is spat back out
      const cols = fxColors();
      for (let i = 0; i < 90; i++) {
        fx.parts.push({ t: 'swirl', cx: x, cy: y, r: (60 + Math.random() * 140) * scale, ang: Math.random() * Math.PI * 2, x, y, s: (1 + Math.random() * 1.8) * scale, a: 1, life: 1, decay: 1 / 60, c: cols[i % 3] });
      }
      later(950, () => { fx.parts.push({ t: 'flash', x, y, r: 90 * scale, a: 1, life: 1, decay: 0.06, c: [255, 255, 255] }); B('particles', x, y, 2); B('shockwave', x, y, 2); });
      fx.kick();
      break;
    }
    case 'planes': { // a flight of paper planes swooping across, leaving dotted trails
      for (let i = 0; i < 5; i++) {
        later(i * 140, () => {
          const fromLeft = i % 2 === 0;
          fx.parts.push({ t: 'plane', x: x + (fromLeft ? -1 : 1) * w * 0.55, y: y + (40 + i * 18 - 40) * scale, vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 2) * scale, vy: -1.2 * scale, ph: Math.random() * 6, s: 9 * scale, a: 1, life: 1, decay: 0.009, c: fxColors()[i % 3], trail: 0 });
        });
      }
      fx.kick();
      break;
    }
    case 'curtain': // aurora curtains unrolling from the top of the pane
      for (let i = 0; i < 3; i++) fx.parts.push({ t: 'curtain', x: x + (i - 1) * w * 0.28, y: y - 110 * scale, w: w * 0.32, h: 200 * scale, ph: i * 2, a: 1, life: 1, decay: 0.008, c: fxColors()[i], grow: 0 });
      fx.kick();
      break;
    case 'trophy': // the trophy slams down, sparkles fly
      fx.parts.push({ t: 'emoji', g: '🏆', x, y: y - 140 * scale, ty: y, vy: 0, s: 64 * scale, a: 1, life: 1, decay: 0.009, c: [255, 215, 90], bounce: 0 });
      later(320, () => { B('stars', x, y + 20 * scale, 2); B('confetti', x, y, 1.6); });
      fx.kick();
      break;
    case 'levelup': { // a beam of light shoots up, LEVEL UP! rises through it in pixels
      fx.parts.push({ t: 'beam', x, y: y + 60 * scale, w: 70 * scale, h: 0, a: 1, life: 1, decay: 0.014, c: fxColors()[0] });
      later(150, () => {
        const cv = document.createElement('canvas');
        const fs = Math.round(34 * scale);
        cv.width = fs * 7; cv.height = Math.round(fs * 1.3);
        const c2 = cv.getContext('2d');
        c2.font = `900 ${fs}px 'Cascadia Mono', Consolas, Menlo, monospace`;
        c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#fff';
        c2.fillText('LEVEL UP!', cv.width / 2, cv.height / 2);
        const d = c2.getImageData(0, 0, cv.width, cv.height).data;
        const st = Math.max(2, Math.round(3 * scale));
        const pts = [];
        for (let yy = 0; yy < cv.height; yy += st) for (let xx = 0; xx < cv.width; xx += st) if (d[(yy * cv.width + xx) * 4 + 3] > 128) pts.push([x - cv.width / 2 + xx, y - cv.height / 2 + yy, yy < cv.height / 2 ? [255, 236, 120] : [255, 170, 60]]);
        placeParts(fx, pts, scale, { t: 'pxs', size: st * 0.9, spread: 0.02, decay: 0.011 });
      });
      later(200, () => B('pixel', x, y, 2));
      fx.kick();
      break;
    }
    case 'cannons': { // two confetti cannons fire from the bottom corners, twice
      const pal = currentTheme().ansi.slice(9, 15).map(hexRgb);
      const fire = (side) => {
        const ox = x + side * w * 0.45;
        const oy = y + 170 * scale;
        for (let i = 0; i < 45; i++) {
          const a = -Math.PI / 2 - side * (0.35 + Math.random() * 0.45);
          const sp = (5 + Math.random() * 6) * scale;
          fx.parts.push({ t: 'conf', x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: (3 + Math.random() * 4) * scale, hh: (1.6 + Math.random() * 2) * scale, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, a: 1, life: 1, decay: 0.008 + Math.random() * 0.008, c: pal[(Math.random() * pal.length) | 0] });
        }
        fx.parts.push({ t: 'flash', x: ox, y: oy, r: 40 * scale, a: 1, life: 1, decay: 0.1, c: [255, 240, 200] });
      };
      fire(-1); fire(1);
      later(380, () => { fire(-1); fire(1); });
      fx.kick();
      break;
    }
    case 'emojirain': { // party emoji pouring down across the pane
      const EM = ['🎉', '🥳', '✨', '💯', '🔥', '🎊', '👍', '⭐', '💖', '🚀'];
      for (let i = 0; i < 34; i++) {
        later(i * 45, () => fx.parts.push({ t: 'emofall', g: EM[(Math.random() * EM.length) | 0], x: x + (Math.random() - 0.5) * w * 0.9, y: y - 160 * scale - Math.random() * 40, vy: (2 + Math.random() * 2.5) * scale, rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 0.08, s: (18 + Math.random() * 16) * scale, a: 1, life: 1, decay: 0.009, c: [255, 255, 255] }));
      }
      fx.kick();
      break;
    }
    case 'goodjob': // (retired) → the gift box
    case 'gift': // a gift box drops in, rattles, and its lid pops off in a burst
      fx.parts.push({ t: 'gift', x, y: y + 40 * scale, s: 48 * scale, age: 0, a: 1, life: 1, decay: 0.0062, c: fxColors()[0], opened: false });
      fx.kick();
      break;
    case 'soap': // iridescent soap bubbles drifting up, then popping
      for (let i = 0; i < 9; i++) {
        later(i * 110, () => fx.parts.push({ t: 'soap', x: x + (Math.random() - 0.5) * w * 0.6, y: y + (60 + Math.random() * 60) * scale, vy: -(0.8 + Math.random() * 0.8) * scale, r: (14 + Math.random() * 18) * scale, ph: Math.random() * 6, a: 1, life: 1, decay: 0.006 + Math.random() * 0.004, c: [255, 255, 255] }));
      }
      fx.kick();
      break;
    case 'ufo': // a saucer descends, hovers, beams the sparkles up, and zips away
      fx.parts.push({ t: 'ufo', x, y: y - 40 * scale, ty: y - 40 * scale, s: 34 * scale, age: 0, a: 1, life: 1, decay: 0.0045, c: fxColors()[0] });
      fx.kick();
      break;
    case 'applause': { // 👏 popping up everywhere, with comic "짝짝짝!" lettering
      for (let i = 0; i < 12; i++) {
        later(i * 90, () => fx.parts.push({ t: 'emo', g: '👏', x: x + (Math.random() - 0.5) * w * 0.8, y: y + (Math.random() - 0.3) * 120 * scale, vx: 0, vy: -0.6, s: (26 + Math.random() * 16) * scale, age: 0, a: 1, life: 1, decay: 0.012, c: [255, 255, 255] }));
      }
      [0, 300, 600].forEach((ms, i) => later(ms, () => fx.parts.push({ t: 'ono', g: fxWord('짝짝짝!'), x: x + (i - 1) * w * 0.22, y: y - 30 * scale + i * 25 * scale, vy: -0.4, s: 30 * scale, rot: (i - 1) * 0.15, age: 0, a: 1, life: 1, decay: 0.012, c: [255, 214, 61] })));
      fx.kick();
      break;
    }
    case 'jackpot': // a slot machine: three reels spin, stop on 7-7-7 one after another, coins pour out
      fx.parts.push({ t: 'slots', x, y, s: 1.15 * scale, age: 0, a: 1, life: 1, decay: 0.0055, c: [255, 215, 80], paid: false });
      fx.kick();
      break;
    case 'dominoes': // a row of tiles toppling one into the next; the last one sets off fireworks
      fx.parts.push({ t: 'domino', x, y: y + 50 * scale, w: Math.min(w * 0.8, 520 * scale), s: scale, age: 0, a: 1, life: 1, decay: 0.0055, c: fxColors()[0], fired: false });
      fx.kick();
      break;
    case 'lanterns': // 풍등 날리기
      for (let i = 0; i < 8; i++) {
        later(i * 160, () => { fx.parts.push({ t: 'lantern', x: x + (Math.random() - 0.5) * w * 0.7, y: y + (30 + Math.random() * 30) * scale, vy: -(0.55 + Math.random() * 0.5) * scale, ph: Math.random() * 6, s: (10 + Math.random() * 6) * scale, a: 1, life: 1, decay: 0.0042 + Math.random() * 0.0015, c: [255, 170, 80] }); fx.kick(); });
      }
      break;
    case 'dragon': // 용의 춤
      fx.parts.push({ t: 'dragon', x0: x - w * 0.55, y0: y - 6 * scale, w: w * 1.1, sc: scale, age: 0, trail: [], a: 1, life: 1, decay: 0.0048, c: [220, 30, 50] });
      fx.kick();
      break;
    case 'cake': // 생일 케이크
      fx.parts.push({ t: 'cake', x, y: y + 30 * scale, sc: scale, age: 0, a: 1, life: 1, decay: 0.0057, c: [255, 255, 255] });
      fx.kick();
      break;
    case 'whale': // 고래 점프
      fx.parts.push({ t: 'whale', x, y, sc: scale, age: 0, a: 1, life: 1, decay: 0.0052, c: [60, 110, 176] });
      fx.kick();
      break;
    case 'fireflies': { // 반딧불 군무: they gather into a heart
      const flies = [];
      const n = 44;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const hx = 16 * Math.sin(t) ** 3;
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const a = Math.random() * Math.PI * 2;
        flies.push({ sx: x + (Math.random() - 0.5) * w * 0.9, sy: y + (Math.random() - 0.5) * 160 * scale, tx: x + hx * 4.2 * scale, ty: y + hy * 4.2 * scale, ph: Math.random() * 6, o: Math.random() * 6, dx: Math.cos(a), dy: Math.sin(a) });
      }
      fx.parts.push({ t: 'swarm', flies, sc: scale, age: 0, a: 1, life: 1, decay: 0.006, c: [200, 255, 100] });
      fx.kick();
      break;
    }
    case 'portal': // a swirling portal tears open, sprays stars, and snaps shut
      fx.parts.push({ t: 'portal', x, y: y + 20 * scale, R: 62 * scale, age: 0, a: 1, life: 1, decay: 0.0065, c: fxColors()[0] });
      fx.kick();
      break;
    case 'thunder': // bolts from the sky strike the pane, with a white flash
      for (let k = 0; k < 3; k++) {
        later(k * 160, () => {
          const tx = x + (Math.random() - 0.5) * w * 0.5;
          const pts = [[tx + (Math.random() - 0.5) * 60, y - 260 * scale]];
          const segs = 10;
          for (let j = 1; j <= segs; j++) pts.push([tx + (Math.random() - 0.5) * 40 * scale, y - 260 * scale + (j / segs) * 280 * scale]);
          fx.parts.push({ t: 'bolt', pts, a: 1, life: 1, decay: 0.05, c: [235, 240, 255] });
          fx.parts.push({ t: 'flash', x: tx, y: y + 20 * scale, r: 120 * scale, a: 1, life: 1, decay: 0.07, c: [200, 210, 255] });
          B('spark', tx, y + 20 * scale, 1.8);
        });
      }
      fx.kick();
      break;
    default: // party
      B('confetti', x, y, 1.6);
      later(120, () => B('stars', x, y, 1.4));
  }
}

/** A finished agent task gets a small celebration over its pane. */
/* ---------- 작업 완료 텍스트 ---------- */

const DONE_TEXT_MAX = 30; // characters per phrase
const DONE_TEXT_STYLES = [
  ['pop', '팡! 튀어오르기', '톡 커졌다가 제자리로'],
  ['type', '타자 치기', '한 글자씩 타이핑되며 나타남'],
  ['neon', '네온사인', '지직 깜빡이며 켜지는 네온'],
  ['stamp', '도장 쾅', '크게 떨어져 쾅 찍힘'],
  ['wave', '물결', '글자가 하나씩 통통 튀어오름'],
  ['slide', '스르륵', '아래에서 부드럽게 떠오름'],
  ['rainbow', '무지개', '무지갯빛이 흐르는 글자'],
  ['zoom', '줌 아웃', '화면 가득 크게 왔다가 작아짐'],
  ['decode', '해독', '암호 같은 기호가 휘리릭 돌다 한 글자씩 풀림'],
  ['glitch', '글리치', 'RGB로 찢어지며 지직거리는 화면'],
  ['stardust', '별가루', '흩어진 빛 입자가 모여 글자가 됨'],
  ['flip', '플립 보드', '공항 전광판처럼 한 칸씩 촤라락 넘어감'],
  ['handwrite', '손글씨', '펜으로 쓰듯 왼쪽부터 그려짐'],
  ['jelly', '젤리 낙하', '글자가 하나씩 떨어져 말랑하게 튕김'],
  ['matrix', '매트릭스', '초록 글자가 위에서 쏟아져 내려와 박힘'],
  ['shatter', '산산조각', '나타났다가 글자들이 사방으로 부서져 날아감'],
  ['comic', '만화 효과음', '노란 폭발 말풍선에 "쾅!" 하고 튀어나옴'],
  ['tape', '테이프 메모', '메모지가 철썩 붙고 양쪽에 테이프'],
  ['banner', '리본 현수막', '리본 현수막이 스르륵 펼쳐짐'],
  ['arcade', '아케이드', '오락실 STAGE CLEAR처럼 픽셀 글자가 깜빡'],
  ['receipt', '영수증', '영수증이 지지직 한 줄씩 인쇄되어 나옴'],
  ['karaoke', '노래방 자막', '하얀 가사가 왼쪽부터 노래하듯 물들어감'],
  ['news', '뉴스 속보', 'TV 하단 자막처럼 빨간 "속보"와 함께 쓱'],
  ['achieve', '업적 달성', '게임처럼 트로피 알림이 아래에서 쏙 올라옴'],
  ['slot', '슬롯머신', '글자 릴이 촤라락 돌다가 하나씩 멈춤'],
  ['sticker', '스티커', '두꺼운 흰 테두리 스티커가 착 붙고 반짝'],
  ['plane', '비행기 현수막', '비행기가 현수막을 끌고 날아왔다 날아감'],
  ['fortune', '포춘쿠키', '포춘쿠키가 바삭 깨지며 쪽지가 쏙 나옴'],
  ['magnets', '냉장고 자석', '알록달록 자석 글자가 하나씩 착착 붙음'],
  ['balloons', '풍선 글자', '글자마다 알록달록 풍선이 되어 둥실 떠오름'],
  ['chalk', '칠판', '나무 테 칠판이 내려오고 분필로 한 글자씩 씀'],
  ['ink', '먹물 붓글씨', '한지 위에 먹물이 번지며 붓글씨가 맺히고 낙관 쾅'],
  ['bulbs', '전광판', '전구가 둘레를 따라 달리고 글자가 하나씩 켜짐'],
  ['clapper', '영화 슬레이트', '딱! 슬레이트가 닫히며 TAKE 1'],
];
const DONE_TEXT_FONTS = [
  ['ui', '기본 (UI 글꼴)', "'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"],
  ['term', '터미널 글꼴', null],
  ['round', '둥근 고딕', "'NanumSquareRound', 'Nanum Square Round', 'Malgun Gothic', sans-serif"],
  ['serif', '명조', "'Nanum Myeongjo', 'Batang', 'Times New Roman', serif"],
  ['pen', '손글씨', "'Nanum Pen Script', 'Nanum Brush Script', 'Gaegu', 'Segoe Print', cursive"],
  ['impact', '굵고 강하게', "'Black Han Sans', 'Impact', 'Malgun Gothic', sans-serif"],
];
function doneTextFont(id) {
  const f = DONE_TEXT_FONTS.find((x) => x[0] === id);
  if (f) return f[2] || S.settings.fontFamily;
  return id ? fontStack(id) : DONE_TEXT_FONTS[0][2]; // an installed font, chosen by name
}

let lastDoneText = '';
/** Puts a "task done" phrase over a pane. box: {x, y, w, h} in #stage coordinates. */
function showDoneText(box, text, front = false) {
  const st = S.settings;
  const list = (st.doneTexts || []).map((s) => String(s).trim()).filter(Boolean);
  if (!text) {
    if (!list.length) return;
    const pool = list.length > 1 ? list.filter((s) => s !== lastDoneText) : list;
    text = pool[(Math.random() * pool.length) | 0];
  }
  lastDoneText = text;
  text = tr(text).slice(0, DONE_TEXT_MAX); // the default phrases in the chosen language (the letters are split up below, so translate first)
  const style = st.doneTextStyle || 'pop';
  const secs = Math.max(1, Math.min(10, Number(st.doneTextTime) || 3));
  const el = h('div', `done-text dt-${style} dt-${st.doneTextPos || 'center'}`);
  const size = Math.max(16, Math.min(Number(st.doneTextSize) || 48, box.w / Math.max(4, [...text].length) * 1.6)); // fits the pane
  if (style === 'stardust') { stardustText(box, text, size, secs, front); return; }
  el.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;--dt-size:${size}px;--dt-font:${doneTextFont(st.doneTextFont)};--dt-time:${secs}s`;
  const inner = h('span', 'dt-inner');
  const glyphs = [...text];
  glyphs.forEach((ch, i) => { // per-letter spans: type / wave / flip / shatter animate each one
    const s = h('span', ch === ' ' ? 'dt-ch sp' : 'dt-ch');
    s.textContent = ch;
    s.style.setProperty('--i', i);
    // where this letter flies when it shatters
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 6}em`);
    s.style.setProperty('--dy', `${(Math.random() - 0.3) * 5}em`);
    s.style.setProperty('--dr', `${(Math.random() - 0.5) * 720}deg`);
    inner.appendChild(s);
  });
  inner.style.setProperty('--n', glyphs.length);
  inner.dataset.text = text; // glitch draws the shifted copies from this
  el.appendChild(inner);
  if (front) { // tried from the settings window: show it above the window, in screen coordinates
    const sr = $('#stage').getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = `${box.x + sr.left}px`;
    el.style.top = `${box.y + sr.top}px`;
    el.style.zIndex = '10000';
    document.body.appendChild(el);
  } else {
    $('#stage').appendChild(el);
  }
  // The display time is the user's: a long phrase whose letters come in one by one is sped up so that the last
  // letter is in (with a moment left to read it) before that time is over. Looping motions keep their pace.
  const showMs = secs * 1000;
  const fitBy = showMs - Math.min(1200, showMs * 0.35);
  const entrances = el.getAnimations({ subtree: true }).filter((an) => Number.isFinite(an.effect?.getComputedTiming().endTime));
  let entrance = 0;
  for (const an of entrances) entrance = Math.max(entrance, an.effect.getComputedTiming().endTime);
  const decodeMs = 220 + glyphs.length * 60 + 100;
  if (style === 'decode') entrance = Math.max(entrance, decodeMs);
  const speed = entrance > fitBy ? entrance / fitBy : 1;
  if (speed > 1) for (const an of entrances) an.playbackRate = speed;
  if (style === 'decode') decodeIn(inner, glyphs, speed);
  setTimeout(() => el.classList.add('out'), showMs);
  setTimeout(() => el.remove(), showMs + (style === 'shatter' ? 1100 : 600));
}

/** 해독: each letter flickers through terminal glyphs, then locks in, left to right. */
function decodeIn(inner, glyphs, speed = 1) {
  const NOISE = '█▓▒░01<>/\\{}[]#$%&*+=?0123456789ABCDEF';
  const spans = [...inner.children];
  const start = performance.now();
  const tick = () => {
    const t = performance.now() - start;
    let busy = false;
    spans.forEach((s, i) => {
      if (t * speed > 220 + i * 60) { if (s.textContent !== glyphs[i]) { s.textContent = glyphs[i]; s.classList.remove('scr'); } return; }
      busy = true;
      if (glyphs[i] !== ' ') { s.textContent = NOISE[(Math.random() * NOISE.length) | 0]; s.classList.add('scr'); }
    });
    if (busy && inner.isConnected) setTimeout(tick, 50);
  };
  tick();
}

/** 별가루: light particles fly in from everywhere and settle into the phrase, twinkle, then drift away. */
function stardustText(box, text, size, secs, front) {
  const cv = document.createElement('canvas');
  const c2 = cv.getContext('2d');
  c2.font = `800 ${size}px ${doneTextFont(S.settings.doneTextFont)}`;
  const w = Math.min(box.w - 20, Math.ceil(c2.measureText(text).width) + 10);
  cv.width = Math.max(10, w); cv.height = Math.ceil(size * 1.4);
  c2.font = `800 ${size}px ${doneTextFont(S.settings.doneTextFont)}`;
  c2.textBaseline = 'middle'; c2.textAlign = 'center';
  c2.fillStyle = '#fff';
  c2.fillText(text, cv.width / 2, cv.height / 2, cv.width);
  const data = c2.getImageData(0, 0, cv.width, cv.height).data;
  const pos = S.settings.doneTextPos || 'center';
  let ox = 0; let oy = 0;
  if (front) { const sr = $('#stage').getBoundingClientRect(); ox = sr.left; oy = sr.top; } // window coordinates
  const cx = box.x + ox + box.w / 2;
  const cy = oy + box.y + (pos === 'top' ? box.h * 0.09 + cv.height / 2 : pos === 'bottom' ? box.h * 0.89 - cv.height / 2 : box.h / 2);
  const step = Math.max(2, Math.round(size / 16));
  const cols = fxColors();
  const fx = front ? frontFx() : stageFx();
  const frames = secs * 60;
  for (let y = 0; y < cv.height; y += step) {
    for (let x = 0; x < cv.width; x += step) {
      if (data[(y * cv.width + x) * 4 + 3] < 140) continue;
      const tx = cx - cv.width / 2 + x;
      const ty = cy - cv.height / 2 + y;
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(box.w, box.h) * (0.4 + Math.random() * 0.4);
      fx.parts.push({ t: 'dust', x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, tx, ty, s: Math.max(1, step * 0.55), ph: Math.random() * 6, a: 1, life: 1, decay: 1 / frames, age: 0, c: cols[Math.floor((x / cv.width) * 3) % 3] });
    }
  }
  fx.kick();
}

function celebrate(tab) {
  if ((!S.settings.celebrate && !S.settings.doneText) || !tab.host) return;
  // finished in a tab that isn't on screen: keep it for when that tab is opened
  const onScreen = tab.host.classList.contains('active') || tab.host.classList.contains('tiled');
  if (!onScreen) { tab.pendingCelebrate = true; return; }
  tab.pendingCelebrate = false;
  const r = tab.host.getBoundingClientRect();
  const sr = $('#stage').getBoundingClientRect();
  if (!r.width) return;
  const x = r.left - sr.left + r.width / 2;
  const y = r.top - sr.top + Math.min(140, r.height * 0.38);
  if (S.settings.celebrate) runCelebration(stageFx(), S.settings.celebrateStyle || 'party', x, y, r.width, 1.25);
  if (S.settings.doneText) showDoneText({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
}

/* ---------- custom cursors ---------- */

const CURSOR_KINDS = [
  ['bar-thin', '얇은 막대', '1px 세로 막대'],
  ['bar', '막대', '기본 세로 막대'],
  ['bar-thick', '굵은 막대', '3px 세로 막대'],
  ['block', '블록', '글자 칸 전체'],
  ['underline', '밑줄', '글자 아래 줄'],
  ['outline', '외곽선 블록', '속이 빈 네모'],
  ['neon', '네온', '빛나는 강조 색 막대'],
  ['gradient', '그라디언트', '강조 그라디언트 블록'],
  ['glide', '글라이드', '부드럽게 미끄러지며 이동'],
  ['comet', '혜성', '움직일 때 빛 꼬리'],
  ['pulse', '펄스', '숨쉬듯 밝아졌다 어두워짐'],
  ['rainbow', '무지개', '색이 계속 바뀌는 막대'],
  ['ghost', '잔상', '움직일 때 뒤로 잔상이 남음'],
  ['crosshair', '십자선', '커서 위치에 가로·세로 가이드 선'],
  ['spotlight', '스포트라이트', '커서 주변만 은은하게 밝게'],
  ['jelly', '젤리', '움직일 때 말랑하게 출렁이는 블록'],
  ['flame', '불꽃', '일렁이는 불꽃 막대'],
  ['glitch', '글리치', 'RGB로 갈라지며 지직거림'],
  ['orbit', '위성', '막대 주위를 작은 점이 공전'],
  ['heart', '하트', '두근두근 뛰는 하트'],
  ['pixel', '픽셀', '체크무늬 8비트 블록'],
  ['ibeam', 'I-빔', '위아래 세리프가 있는 텍스트 커서'],
  ['saber', '광선검', '하얀 심지에 웅웅 떨리는 빛의 칼날'],
  ['candle', '촛불', '작은 초 위에서 일렁이는 불꽃'],
  ['equalizer', '이퀄라이저', '음악에 맞춰 춤추는 막대 세 개'],
  ['hologram', '홀로그램', '주사선이 흐르며 지직거리는 투명 블록'],
  ['cat', '고양이', '뾰족 귀 고양이 얼굴 · 눈을 깜빡이고 움직이면 폴짝'],
  ['gem', '보석', '빙글 도는 다이아몬드에 반짝 빛'],
  ['wand', '마법봉', '끝에 별이 반짝이는 요술 지팡이'],
  ['hourglass', '모래시계', '모래가 흐르다 뒤집히는 모래시계'],
  ['eye', '눈알', '두리번거리다 깜빡이는 눈'],
  ['planet', '행성', '고리가 기울어진 작은 행성'],
  ['rocket', '로켓', '불꽃을 뿜으며 대기 중인 로켓'],
  ['drip', '용암 방울', '막대 끝에서 뜨거운 방울이 똑똑'],
  ['firefly', '반딧불 커서', '반딧불이 막대 주위를 8자로 맴돎'],
  ['plasma', '플라즈마', '막대를 감싸고 전기 아크가 지직지직 (멋있는)'],
  ['meteor', '운석', '불꽃 꼬리를 단 운석 머리 (멋있는)'],
  ['sakura', '벚꽃', '천천히 도는 다섯 잎 벚꽃 (이쁜)'],
  ['moon', '초승달', '초승달 옆에 작은 별이 반짝 (이쁜)'],
  ['chick', '병아리', '🐥 병아리가 뒤뚱뒤뚱 (재미있는)'],
  ['slime', '슬라임', '눈 달린 초록 슬라임이 말랑말랑 통통 (재미있는)'],
  ['ecg', '심전도', '막대 옆에서 심박 그래프가 삐-삑 뛰어감'],
  ['clock', '미니 시계', '작은 시계 바늘이 째깍째깍 돌아감'],
  ['bubble', '비눗방울', '무지갯빛 비눗방울이 몽글몽글 흔들림'],
];
// cursors that already animate on their own: no extra blink
const SELF_ANIMATED_CURSORS = ['pulse', 'rainbow', 'flame', 'glitch', 'orbit', 'heart', 'spotlight', 'crosshair', 'saber', 'candle', 'equalizer', 'hologram', 'gem', 'wand', 'hourglass', 'cat', 'eye', 'planet', 'rocket', 'drip', 'firefly', 'plasma', 'meteor', 'sakura', 'moon', 'chick', 'slime', 'ecg', 'clock', 'bubble'];
const NATIVE_CURSORS = { 'bar-thin': ['bar', 1], bar: ['bar', 2], 'bar-thick': ['bar', 3], block: ['block', 1], underline: ['underline', 1] };
const cursorPreset = () => {
  const n = NATIVE_CURSORS[S.settings.cursorStyle];
  return n ? { style: n[0], width: n[1], custom: false } : { style: 'bar', width: 1, custom: true };
};

let cursorEl = null;
let cursorRaf = 0;
let cursorLast = '';
let cursorMoveTimer = null;
function scheduleCursor() {
  if (!cursorRaf) cursorRaf = requestAnimationFrame(() => { cursorRaf = 0; updateCursor(); });
}
function updateCursor() {
  if (!cursorEl) { cursorEl = h('div', 'mt-cursor'); cursorEl.hidden = true; $('#stage').appendChild(cursorEl); }
  const kind = S.settings.cursorStyle;
  const t = activeTab();
  if (NATIVE_CURSORS[kind] || !t || !t.alive || S.overlay) { cursorEl.hidden = true; return; }
  let hidden = false;
  try { hidden = !!t.term._core.coreService.isCursorHidden; } catch { /* ignore */ }
  const b = t.term.buffer.active;
  if (hidden || b.viewportY !== b.baseY) { cursorEl.hidden = true; return; } // app hides it / scrolled back
  const geo = cursorGeometry(t);
  if (!geo) { cursorEl.hidden = true; return; }
  // Korean / CJK input: the character being composed is drawn at the cursor but not committed yet,
  // so the buffer cursor hasn't advanced. Put our cursor after the composing text.
  const comp = t.host.querySelector('.composition-view.active');
  if (comp && comp.textContent) geo.left += comp.getBoundingClientRect().width;
  const focused = !!(document.activeElement && t.host.contains(document.activeElement)) && S.winFocused;
  const blink = S.settings.cursorBlink && !SELF_ANIMATED_CURSORS.includes(kind);
  cursorEl.className = `mt-cursor kind-${kind}${focused ? '' : ' blurred'}${blink ? ' blink' : ''}`;
  cursorEl.hidden = false;
  cursorEl.style.width = `${geo.cw}px`;
  cursorEl.style.height = `${geo.ch}px`;
  const pos = `translate(${geo.left.toFixed(1)}px, ${geo.top.toFixed(1)}px)`;
  if (pos !== cursorLast) {
    cursorLast = pos;
    cursorEl.style.transform = pos;
    cursorEl.classList.add('moving');
    clearTimeout(cursorMoveTimer);
    cursorMoveTimer = setTimeout(() => cursorEl.classList.remove('moving'), 260);
  }
}

/* ---------- animated backgrounds ---------- */

function createBg(canvas) {
  const bg = { canvas, ctx: canvas.getContext('2d'), kind: 'none', raf: 0, w: 0, h: 0, dpr: 1, items: [], t: 0, last: 0 };
  bg.size = (w, h) => {
    bg.dpr = window.devicePixelRatio || 1;
    bg.w = w; bg.h = h;
    canvas.width = Math.max(1, Math.round(w * bg.dpr));
    canvas.height = Math.max(1, Math.round(h * bg.dpr));
    bg.seed();
  };
  bg.seed = () => {
    const { w, h } = bg;
    const R = Math.random;
    const area = Math.max(1, (w * h) / 40000);
    const sc = Math.max(0.22, Math.min(1, h / 420)); // big shapes shrink in small areas (picker previews)
    bg.sc = sc;
    const k = bg.kind;
    if (k === 'stars') bg.items = Array.from({ length: Math.round(40 * area) }, () => ({ x: R() * w, y: R() * h, z: R(), ph: R() * 6 }));
    else if (k === 'thunder') {
      bg.items = Array.from({ length: Math.round(32 * area) }, () => ({ x: R() * w, y: R() * h, v: 6 + R() * 6, l: 12 + R() * 16, a: 0.5 + R() * 0.5 }));
      bg.storm = { next: 90 + R() * 150, flash: -999, bolt: null };
    } else if (k === 'rain') bg.items = Array.from({ length: Math.round(22 * area) }, () => ({ x: R() * w, y: R() * h, v: 4 + R() * 5, l: 8 + R() * 14 }));
    else if (k === 'snow') bg.items = Array.from({ length: Math.round(24 * area) }, () => ({ x: R() * w, y: R() * h, v: 0.3 + R() * 0.8, r: 0.8 + R() * 2.2, ph: R() * 6 }));
    else if (k === 'network') bg.items = Array.from({ length: Math.min(70, Math.round(14 * area)) }, () => ({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.35, vy: (R() - 0.5) * 0.35 }));
    else if (k === 'fireflies') bg.items = Array.from({ length: Math.round(9 * area) + 6 }, () => ({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.3, vy: (R() - 0.5) * 0.3, ph: R() * 6, sp: 0.02 + R() * 0.03, r: 1.2 + R() * 1.6 }));
    else if (k === 'sakura') bg.items = Array.from({ length: Math.round(8 * area) + 6 }, () => ({ x: R() * w, y: R() * h, v: 0.35 + R() * 0.6, s: 3 + R() * 4, rot: R() * 6, vr: (R() - 0.5) * 0.04, ph: R() * 6, tint: R() }));
    else if (k === 'bokeh') bg.items = Array.from({ length: Math.round(3 * area) + 6 }, () => ({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.12, vy: -0.05 - R() * 0.12, r: 18 + R() * 46, c: (R() * 3) | 0, a: 0.05 + R() * 0.09, ph: R() * 6 }));
    else if (k === 'shooting') { bg.items = Array.from({ length: Math.round(30 * area) }, () => ({ x: R() * w, y: R() * h * 0.85, z: R(), ph: R() * 6 })); bg.meteors = []; }
    else if (k === 'sunset') bg.items = Array.from({ length: Math.round(20 * area) }, () => ({ x: R() * w, y: R() * h * 0.45, z: R(), ph: R() * 6 }));
    else if (k === 'blackhole') bg.items = Array.from({ length: Math.min(260, Math.round(60 * area) + 80) }, () => ({ r: 0.1 + R() * 0.9, a: R() * Math.PI * 2, z: R(), c: (R() * 3) | 0 }));
    else if (k === 'warp') bg.items = Array.from({ length: 160 }, () => ({ x: (R() - 0.5) * 2, y: (R() - 0.5) * 2, z: R(), pz: 0 }));
    else if (k === 'jellyfish') bg.items = Array.from({ length: Math.min(9, Math.round(0.25 * area) + 4) }, () => ({ x: R() * w, y: R() * h, s: (16 + R() * 26) * sc, ph: R() * 6, v: 0.15 + R() * 0.25, c: (R() * 3) | 0 }));
    else if (k === 'campfire') { bg.items = []; campfireVideo(); }
    else if (k === 'constellation') { bg.items = Array.from({ length: Math.round(30 * area) }, () => ({ x: R() * w, y: R() * h, z: R(), ph: R() * 6 })); bg.cons = []; }
    else if (k === 'lavalamp') bg.items = Array.from({ length: 7 }, (_, i) => ({ x: (0.15 + R() * 0.7) * w, y: R() * h, r: (50 + R() * 70) * sc, vy: (R() < 0.5 ? -1 : 1) * (0.15 + R() * 0.25) * Math.max(0.4, sc), ph: R() * 6, c: i % 3 }));
    else if (k === 'pond') { bg.items = []; bg.lilies = Array.from({ length: 3 }, () => ({ x: R() * w, y: R() * h, r: (14 + R() * 12) * sc, rot: R() * 6 })); }
    else if (k === 'code') { const fs = Math.max(8, 14 * sc); bg.fs = fs; bg.items = Array.from({ length: Math.ceil(w / (fs * 1.6)) }, (_, i) => ({ x: i * fs * 1.6 + R() * fs * 0.4, y: R() * h, v: (0.6 + R() * 1.6) * sc + 0.3, len: 6 + ((R() * 14) | 0), chars: [], t: 0 })); }
    else if (k === 'circuit') {
      const g = Math.max(14, 36 * sc); bg.g = g;
      bg.items = []; // traces: random orthogonal paths on a grid
      for (let n = 0; n < Math.round(10 * area) + 6; n++) {
        let x = Math.round((R() * w) / g) * g; let y = Math.round((R() * h) / g) * g;
        const pts = [[x, y]];
        for (let s = 0; s < 3 + ((R() * 4) | 0); s++) { if (R() < 0.5) x += (R() < 0.5 ? -1 : 1) * g * (1 + ((R() * 3) | 0)); else y += (R() < 0.5 ? -1 : 1) * g * (1 + ((R() * 3) | 0)); pts.push([x, y]); }
        bg.items.push({ pts, p: R(), v: 0.004 + R() * 0.008 });
      }
    }
    else if (k === 'tunnel') bg.items = Array.from({ length: 14 }, (_, i) => ({ z: i / 14, rot: R() * 6 }));
    else if (k === 'deepsea') bg.items = Array.from({ length: Math.round(10 * area) + 10 }, () => ({ x: R() * w, y: R() * h, r: (1 + R() * 3) * Math.max(0.5, sc), v: (0.2 + R() * 0.6) * Math.max(0.4, sc), ph: R() * 6, glow: R() < 0.35 }));
    else if (k === 'aquarium') {
      bg.items = Array.from({ length: Math.min(12, Math.round(1.2 * area) + 4) }, () => { const dir = R() < 0.5 ? -1 : 1; return { x: R() * w, y: h * (0.1 + R() * 0.8), dir, v: (0.3 + R() * 0.6) * Math.max(0.5, sc), s: (8 + R() * 10) * sc, ph: R() * 6, c: (R() * 4) | 0 }; });
      bg.bubbles = [];
    }
    else if (k === 'life') {
      const cs = Math.max(6, Math.round(13 * sc)); bg.cs = cs; bg.gw = Math.ceil(w / cs); bg.gh = Math.ceil(h / cs);
      bg.grid = new Uint8Array(bg.gw * bg.gh).map(() => (R() < 0.22 ? 1 : 0)); bg.age = new Float32Array(bg.gw * bg.gh); bg.gen = 0;
    }
    else if (k === 'bounce') { bg.items = [{ x: R() * w * 0.6, y: R() * h * 0.6, vx: 1.1 * Math.max(0.5, sc), vy: 0.8 * Math.max(0.5, sc), c: 0, flash: 0 }]; }
    else if (k === 'pong') { bg.items = [{ x: w / 2, y: h / 2, vx: 3.2 * Math.max(0.4, sc), vy: 1.7 * Math.max(0.4, sc), l: h / 2, r: h / 2, sl: 0, sr: 0 }]; }
    else if (k === 'balloonsky') bg.items = Array.from({ length: Math.round(2.6 * area) + 6 }, () => { const z = 0.25 + R() * 0.75; return { z, x: R() * w, y: R() * h * 1.1, v: (0.18 + z * 0.55) * Math.max(0.4, sc), r: (4 + z * 10) * sc, ph: R() * 6, c: (R() * BALLOON_COLS.length) | 0 }; }).sort((a, b) => a.z - b.z);
    else if (k === 'nightfire') { bg.items = Array.from({ length: Math.round(20 * area) }, () => ({ x: R() * w, y: R() * h, z: R(), ph: R() * 6 })); bg.sparks = []; }
    else bg.items = [];
  };
  bg.set = (kind) => {
    bg.kind = kind || 'none';
    // 뇌우 draws its own light-mode colours (a lightning flash must stay a flash, not get inverted into a dark flicker)
    bg.canvas.classList.toggle('bg-own-light', bg.kind === 'thunder' || bg.kind === 'balloonsky' || bg.kind === 'campfire');
    bg.seed();
    cancelAnimationFrame(bg.raf);
    bg.raf = 0;
    bg.ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg.kind !== 'none') bg.raf = requestAnimationFrame(bg.frame);
  };
  bg.frame = (now) => {
    bg.raf = requestAnimationFrame(bg.frame);
    if (document.hidden || now - bg.last < 33) return; // ~30 fps, paused when hidden
    bg.last = now;
    bg.t += 1;
    drawBg(bg);
  };
  bg.stop = () => { cancelAnimationFrame(bg.raf); bg.raf = 0; };
  return bg;
}

function drawBg(bg) {
  const { ctx, w, h, dpr, t } = bg;
  const [a0, a1, a2] = fxColors();
  const A = (c, m) => `rgba(${c[0]},${c[1]},${c[2]},${m})`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  switch (bg.kind) {
    case 'stars':
      for (const s of bg.items) {
        s.x -= 0.08 + s.z * 0.35;
        if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h; }
        s.ph += 0.03 + s.z * 0.04;
        ctx.fillStyle = `rgba(230,235,255,${(0.25 + s.z * 0.6) * (0.6 + 0.4 * Math.sin(s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.5 + s.z * 1.3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'aurora': {
      const blobs = [[a0, 0.18, 0.3, 0.0011], [a1, 0.22, 0.55, 0.0008], [a2, 0.16, 0.75, 0.0013]];
      ctx.globalCompositeOperation = 'lighter';
      blobs.forEach(([c, al, fy, sp], i) => {
        const x = w * (0.5 + 0.38 * Math.sin(t * sp * 16 + i * 2.1));
        const y = h * (fy + 0.08 * Math.cos(t * sp * 11 + i));
        const r = Math.max(w, h) * (0.45 + 0.08 * Math.sin(t * sp * 9 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, A(c, al)); g.addColorStop(1, A(c, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'thunder': { // 뇌우: rain under a heavy sky; now and then the clouds light up and a bolt forks down
      const L = isLight();
      const sc = bg.sc || 1;
      const st = bg.storm;
      // the cloud band over the top
      const cl = ctx.createLinearGradient(0, 0, 0, h * 0.45);
      cl.addColorStop(0, L ? 'rgba(110,120,140,0.20)' : 'rgba(8,12,26,0.55)'); cl.addColorStop(1, L ? 'rgba(110,120,140,0)' : 'rgba(8,12,26,0)');
      ctx.fillStyle = cl; ctx.fillRect(0, 0, w, h * 0.45);
      // lightning timing: a double flicker, then the light dies away
      if (t >= st.next) {
        if (bg.canvas.classList.contains('bg-layer')) ambThunder(); // the real background only, not a preview
        st.flash = t; st.next = t + 240 + Math.random() * 420;
        const R2 = Math.random;
        const make = (x, y, len, depth) => {
          const pts = [[x, y]];
          const stepY = 16 * sc;
          while (y < len) { x += (R2() - 0.5) * 30 * sc; y += stepY * (0.7 + R2() * 0.8); pts.push([x, y]); }
          const out = [{ pts, wgt: depth ? 0.45 : 1 }];
          if (!depth) for (let i = 0; i < 3; i++) { const p = pts[2 + ((R2() * (pts.length - 3)) | 0)]; if (p) out.push(...make(p[0], p[1], p[1] + (len - p[1]) * (0.3 + R2() * 0.4), 1)); }
          return out;
        };
        st.bolt = make(w * (0.12 + R2() * 0.76), 0, h * (0.45 + R2() * 0.35), 0);
      }
      const age = t - st.flash;
      const f = age < 0 ? 0 : age < 4 ? 1 : age < 8 ? 0.22 : age < 13 ? 0.85 : age < 70 ? 0.85 * (1 - (age - 13) / 57) : 0;
      if (f > 0) { // the sky lights up from the clouds down
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, L ? `rgba(120,130,220,${0.2 * f})` : `rgba(190,205,255,${0.3 * f})`);
        sky.addColorStop(0.55, L ? `rgba(150,160,230,${0.06 * f})` : `rgba(160,180,240,${0.08 * f})`);
        sky.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      }
      if (st.bolt && age >= 0 && age < 22) { // the bolt itself
        const ba = age < 14 ? (age % 7 < 4 ? 1 : 0.4) : 1 - (age - 14) / 8;
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = L ? 'rgba(110,120,255,0.9)' : 'rgba(170,200,255,0.95)'; ctx.shadowBlur = 14 * sc;
        for (const br of st.bolt) {
          ctx.strokeStyle = L ? `rgba(60,70,190,${ba * br.wgt})` : `rgba(235,242,255,${ba * br.wgt})`;
          ctx.lineWidth = Math.max(0.8, 2.4 * sc * br.wgt);
          ctx.beginPath(); br.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
        ctx.restore();
      }
      // rain (a touch brighter while the sky is lit)
      ctx.lineWidth = 1;
      ctx.strokeStyle = L ? `rgba(70,90,130,${0.32 + f * 0.15})` : `rgba(170,190,235,${0.3 + f * 0.25})`;
      ctx.beginPath();
      for (const d of bg.items) {
        d.y += d.v; d.x -= d.v * 0.3;
        if (d.y > h + 30) { d.y = -30; d.x = Math.random() * (w + 80); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.3, d.y - d.l);
      }
      ctx.stroke();
      break;
    }
    case 'rain':
      ctx.strokeStyle = A(a0, 0.35); ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of bg.items) {
        d.y += d.v; d.x -= d.v * 0.25;
        if (d.y > h + 20) { d.y = -20; d.x = Math.random() * (w + 60); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.25, d.y - d.l);
      }
      ctx.stroke();
      break;
    case 'snow':
      ctx.fillStyle = 'rgba(235,240,255,0.55)';
      for (const f of bg.items) {
        f.ph += 0.02; f.y += f.v; f.x += Math.sin(f.ph) * 0.4;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'grid': {
      const hz = h * 0.55;
      const g = ctx.createLinearGradient(0, hz - 60, 0, hz + 10);
      g.addColorStop(0, A(a2, 0)); g.addColorStop(1, A(a2, 0.25));
      ctx.fillStyle = g; ctx.fillRect(0, hz - 60, w, 70);
      ctx.strokeStyle = A(a0, 0.45); ctx.lineWidth = 1;
      ctx.beginPath();
      const off = (t * 0.6) % 24;
      for (let i = 0; i < 18; i++) {
        const z = (i * 24 + off) / (18 * 24);
        const y = hz + (h - hz) * z * z;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      for (let i = -12; i <= 12; i++) { ctx.moveTo(w / 2 + i * 14, hz); ctx.lineTo(w / 2 + i * (w / 7), h); }
      ctx.stroke();
      break;
    }
    case 'network': {
      const pts = bg.items;
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x; const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120) {
            ctx.strokeStyle = A(a0, 0.28 * (1 - Math.sqrt(d2) / 120));
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = A(a1, 0.6);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'fireflies':
      ctx.globalCompositeOperation = 'lighter';
      for (const f of bg.items) {
        f.ph += f.sp;
        f.vx += (Math.random() - 0.5) * 0.02; f.vy += (Math.random() - 0.5) * 0.02;
        f.vx *= 0.98; f.vy *= 0.98;
        f.x = (f.x + f.vx + w) % w; f.y = (f.y + f.vy + h) % h;
        const glow = Math.max(0, Math.sin(f.ph)) ** 2;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 7);
        g.addColorStop(0, `rgba(255, 236, 140, ${0.75 * glow})`);
        g.addColorStop(0.25, `rgba(210, 255, 120, ${0.25 * glow})`);
        g.addColorStop(1, 'rgba(210, 255, 120, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'sakura':
      for (const p of bg.items) {
        p.ph += 0.02; p.rot += p.vr;
        p.y += p.v; p.x += Math.sin(p.ph) * 0.6 + 0.25;
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
        if (p.x > w + 10) p.x = -10;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.ph * 1.7)));
        ctx.fillStyle = p.tint > 0.5 ? 'rgba(255, 183, 206, 0.75)' : 'rgba(255, 214, 228, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, -p.s);
        ctx.bezierCurveTo(p.s * 0.9, -p.s * 0.6, p.s * 0.7, p.s * 0.7, 0, p.s);
        ctx.bezierCurveTo(-p.s * 0.7, p.s * 0.7, -p.s * 0.9, -p.s * 0.6, 0, -p.s);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'bokeh': {
      const cols = [a0, a1, a2];
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bg.items) {
        b.ph += 0.01;
        b.x += b.vx; b.y += b.vy;
        if (b.y < -b.r) { b.y = h + b.r; b.x = Math.random() * w; }
        const al = b.a * (0.7 + 0.3 * Math.sin(b.ph));
        const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
        g.addColorStop(0, A(cols[b.c], al));
        g.addColorStop(0.8, A(cols[b.c], al * 0.6));
        g.addColorStop(1, A(cols[b.c], 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'waves': {
      const layers = [[a0, 0.16, 0.78, 18, 0.008, 0.012], [a1, 0.13, 0.84, 14, 0.011, -0.016], [a2, 0.1, 0.9, 10, 0.015, 0.02]];
      for (const [c, al, base, amp, freq, speed] of layers) {
        ctx.fillStyle = A(c, al);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * base + Math.sin(x * freq + t * speed) * amp + Math.sin(x * freq * 2.3 + t * speed * 1.7) * amp * 0.35);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'shooting':
      for (const s of bg.items) {
        s.ph += 0.02 + s.z * 0.03;
        ctx.fillStyle = `rgba(230,235,255,${(0.2 + s.z * 0.5) * (0.6 + 0.4 * Math.sin(s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.5 + s.z * 1.1, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.random() < 0.012) bg.meteors.push({ x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.35, life: 1 });
      bg.meteors = bg.meteors.filter((m) => (m.life -= 0.025) > 0);
      for (const m of bg.meteors) {
        const len = 90;
        m.x -= 7; m.y += 3.2;
        const g = ctx.createLinearGradient(m.x, m.y, m.x + len, m.y - len * 0.45);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * m.life})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + len, m.y - len * 0.45); ctx.stroke();
      }
      break;
    case 'sunset': {
      const k = (Math.sin(t * 0.004) + 1) / 2; // slow drift between dusk tones
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(${Math.round(40 + 30 * k)}, ${Math.round(30 + 10 * k)}, ${Math.round(90 - 20 * k)}, 0.35)`);
      g.addColorStop(0.55, `rgba(${Math.round(180 + 40 * k)}, ${Math.round(80 + 30 * k)}, ${Math.round(110 - 30 * k)}, 0.28)`);
      g.addColorStop(1, `rgba(255, ${Math.round(150 + 40 * k)}, 90, 0.32)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const sun = ctx.createRadialGradient(w * 0.7, h * 0.95, 0, w * 0.7, h * 0.95, h * 0.5);
      sun.addColorStop(0, 'rgba(255, 190, 120, 0.35)');
      sun.addColorStop(1, 'rgba(255, 190, 120, 0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
      for (const s of bg.items) {
        s.ph += 0.02;
        ctx.fillStyle = `rgba(255,245,230,${(0.15 + s.z * 0.45) * (0.5 + 0.5 * Math.sin(s.ph)) * (1 - s.y / (h * 0.45))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.5 + s.z, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'blackhole': {
      const cx = w * 0.72, cy = h * 0.42, R0 = Math.min(w, h) * 0.5, ev = R0 * 0.09;
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(cx, cy, ev, cx, cy, R0 * 0.6);
      glow.addColorStop(0, A(a1, 0.22)); glow.addColorStop(0.3, A(a0, 0.08)); glow.addColorStop(1, A(a0, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      for (const p of bg.items) {
        const r = ev + p.r * R0;
        p.a += 0.004 + 0.035 / (p.r * 8 + 0.4); // faster near the centre
        p.r -= 0.0009 + 0.002 * (1 - p.r);
        if (p.r < 0.02) { p.r = 0.85 + Math.random() * 0.15; p.a = Math.random() * Math.PI * 2; }
        const x = cx + Math.cos(p.a) * r, y = cy + Math.sin(p.a) * r * 0.32; // tilted disk
        const front = Math.sin(p.a) > 0;
        const c = [a0, a1, a2][p.c];
        ctx.fillStyle = A(c, (0.15 + 0.5 * (1 - p.r)) * (front ? 1 : 0.5));
        ctx.beginPath(); ctx.arc(x, y, 0.6 + (1 - p.r) * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // light mode inverts this canvas: a pale, half-clear core turns into a soft dark one that text still reads over
      ctx.fillStyle = isLight() ? 'rgba(197,192,180,0.38)' : 'rgba(0,0,0,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, ev, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = A(a2, 0.35 + 0.1 * Math.sin(t * 0.05)); ctx.lineWidth = 1.5; // photon ring
      ctx.beginPath(); ctx.arc(cx, cy, ev * 1.12, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'warp': {
      const cx = w / 2, cy = h / 2, F = Math.max(w, h) * 0.5;
      ctx.lineCap = 'round';
      for (const s of bg.items) {
        s.pz = s.z;
        s.z -= 0.006 + 0.004 * (0.5 + 0.5 * Math.sin(t * 0.01)); // the speed surges and eases
        if (s.z <= 0.02) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; s.pz = 1; continue; }
        const x1 = cx + (s.x / s.pz) * F * 0.25, y1 = cy + (s.y / s.pz) * F * 0.25;
        const x2 = cx + (s.x / s.z) * F * 0.25, y2 = cy + (s.y / s.z) * F * 0.25;
        const al = Math.min(1, (1 - s.z) * 1.3) * 0.6;
        ctx.strokeStyle = s.x > 0 ? A(a2, al) : `rgba(220,230,255,${al})`;
        ctx.lineWidth = 0.4 + (1 - s.z) * 1.6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      break;
    }
    case 'jellyfish':
      ctx.globalCompositeOperation = 'lighter';
      for (const j of bg.items) {
        j.ph += 0.035;
        const pulse = Math.sin(j.ph);
        j.y -= j.v * (1.2 + Math.max(0, pulse)); // pushes on each contraction
        j.x += Math.sin(j.ph * 0.3) * 0.15;
        if (j.y < -j.s * 4) { j.y = h + j.s * 2; j.x = Math.random() * w; }
        const c = [a0, a1, a2][j.c];
        const bw = j.s * (1 + 0.12 * pulse), bh = j.s * (0.75 - 0.1 * pulse);
        const g = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, bw * 1.8);
        g.addColorStop(0, A(c, 0.12)); g.addColorStop(1, A(c, 0));
        ctx.fillStyle = g; ctx.fillRect(j.x - bw * 2, j.y - bw * 2, bw * 4, bw * 4);
        ctx.fillStyle = A(c, 0.16); ctx.strokeStyle = A(c, 0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(j.x, j.y, bw, bh, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let k = 0; k < 5; k++) { // tentacles
          const tx = j.x - bw * 0.7 + (k / 4) * bw * 1.4;
          ctx.strokeStyle = A(c, 0.22);
          ctx.beginPath(); ctx.moveTo(tx, j.y);
          for (let s = 1; s <= 8; s++) ctx.lineTo(tx + Math.sin(j.ph * 1.3 - s * 0.6 + k) * s * 0.9, j.y + s * j.s * 0.28);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'lanterns':
      ctx.globalCompositeOperation = 'lighter';
      for (const l of bg.items) {
        l.y -= l.v; l.sw += 0.012; l.ph += 0.15 + Math.random() * 0.1;
        const x = l.x + Math.sin(l.sw) * 8;
        if (l.y < -40) { l.y = h + 30; l.x = Math.random() * w; }
        const fl = 0.85 + 0.15 * Math.sin(l.ph); // candle flicker
        const fade = Math.max(0, Math.min(1, l.y / (h * 0.25)));
        const g = ctx.createRadialGradient(x, l.y, 0, x, l.y, l.s * 4);
        g.addColorStop(0, `rgba(255,170,80,${0.22 * fl * fade})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - l.s * 4, l.y - l.s * 4, l.s * 8, l.s * 8);
        ctx.fillStyle = `rgba(255,${Math.round(180 + 40 * fl)},120,${0.55 * fade})`;
        ctx.beginPath(); // a paper lantern, wider at the top
        ctx.moveTo(x - l.s * 0.7, l.y - l.s); ctx.lineTo(x + l.s * 0.7, l.y - l.s);
        ctx.lineTo(x + l.s * 0.5, l.y + l.s * 0.9); ctx.lineTo(x - l.s * 0.5, l.y + l.s * 0.9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,250,220,${0.5 * fl * fade})`;
        ctx.beginPath(); ctx.arc(x, l.y + l.s * 0.6, l.s * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'constellation': {
      for (const s of bg.items) {
        s.ph += 0.02;
        ctx.fillStyle = `rgba(230,235,255,${(0.2 + s.z * 0.5) * (0.6 + 0.4 * Math.sin(s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.5 + s.z * 1.1, 0, Math.PI * 2); ctx.fill();
      }
      if (bg.cons.length < 2 && t % 90 === 0 && bg.items.length > 6) { // a new figure: a walk through nearby stars
        const pick = [bg.items[(Math.random() * bg.items.length) | 0]];
        for (let i = 0; i < 5; i++) {
          const last = pick[pick.length - 1];
          const next = bg.items.filter((s) => !pick.includes(s)).sort((p, q) => Math.hypot(p.x - last.x, p.y - last.y) - Math.hypot(q.x - last.x, q.y - last.y))[(Math.random() * 2) | 0];
          if (!next || Math.hypot(next.x - last.x, next.y - last.y) > Math.min(w, h) * 0.35) break;
          pick.push(next);
        }
        if (pick.length > 2) bg.cons.push({ pts: pick, age: 0 });
      }
      for (const c of bg.cons) {
        c.age += 1;
        const draw = Math.min(c.pts.length - 1, c.age / 25); // segments drawn one by one
        const al = c.age < 300 ? 0.45 : Math.max(0, 0.45 - (c.age - 300) / 120);
        ctx.strokeStyle = A(a1, al); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c.pts[0].x, c.pts[0].y);
        for (let i = 1; i <= Math.ceil(draw); i++) {
          const f = Math.min(1, draw - (i - 1));
          const p = c.pts[i - 1], q = c.pts[i];
          ctx.lineTo(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f);
        }
        ctx.stroke();
        for (let i = 0; i <= Math.floor(draw); i++) {
          const p = c.pts[i];
          ctx.fillStyle = A(a2, Math.min(1, al * 1.6));
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      bg.cons = bg.cons.filter((c) => c.age < 420);
      break;
    }
    case 'lavalamp':
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bg.items) {
        b.ph += 0.01;
        b.y += b.vy;
        if (b.y < -b.r) b.vy = Math.abs(b.vy); // warm up / cool down
        if (b.y > h + b.r) b.vy = -Math.abs(b.vy);
        const x = b.x + Math.sin(b.ph) * 30;
        const r = b.r * (1 + 0.15 * Math.sin(b.ph * 1.7));
        const c = [a0, a1, a2][b.c];
        const g = ctx.createRadialGradient(x, b.y, 0, x, b.y, r);
        g.addColorStop(0, A(c, 0.26)); g.addColorStop(0.55, A(c, 0.14)); g.addColorStop(1, A(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, b.y, r, r * (1.1 + 0.15 * Math.sin(b.ph * 2.3)), 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'dna': {
      const small = w < 400; // previews: centre it and pack the rungs closer
      const cx = small ? w / 2 : w * 0.86, amp = small ? Math.min(14, h * 0.35) : Math.min(70, w * 0.06), step = small ? 6 : 14;
      for (let y = -step; y < h + step; y += step) {
        const ph = y * 0.035 + t * 0.03;
        const x1 = cx + Math.sin(ph) * amp, x2 = cx + Math.sin(ph + Math.PI) * amp;
        const d1 = (Math.cos(ph) + 1) / 2, d2 = 1 - d1; // depth: the strand in front is brighter
        ctx.strokeStyle = `rgba(200,210,255,${0.06 + 0.08 * Math.min(d1, d2)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.fillStyle = A(a0, 0.15 + 0.4 * d1);
        ctx.beginPath(); ctx.arc(x1, y, 1.5 + d1 * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = A(a2, 0.15 + 0.4 * d2);
        ctx.beginPath(); ctx.arc(x2, y, 1.5 + d2 * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'pond': {
      if (Math.random() < 0.06) bg.items.push({ x: Math.random() * w, y: Math.random() * h, r: 0, life: 1 });
      for (const l of bg.lilies) { // lily pads drifting
        l.rot += 0.001; l.x += 0.05;
        if (l.x > w + 40) l.x = -40;
        ctx.fillStyle = 'rgba(80,160,110,0.13)';
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.arc(l.x, l.y, l.r, l.rot + 0.3, l.rot + Math.PI * 2 - 0.3); ctx.closePath(); ctx.fill();
      }
      for (const d of bg.items) {
        d.r += 0.7 * (bg.sc || 1); d.life -= 0.009;
        for (let k = 0; k < 3; k++) {
          const r = d.r - k * 9 * (bg.sc || 1);
          if (r <= 0) continue;
          ctx.strokeStyle = A(k === 0 ? a2 : a1, Math.max(0, d.life * (0.32 - k * 0.09)));
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(d.x, d.y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      bg.items = bg.items.filter((d) => d.life > 0);
      break;
    }
    case 'code': { // columns of faint glyphs falling, the head brightest
      const GL = '01アイウエオカキクケコサシスセソ{}[]<>/=+*#$%&;:ABCDEF';
      ctx.font = `${Math.round(bg.fs)}px 'Cascadia Mono', Consolas, Menlo, monospace`;
      ctx.textAlign = 'center';
      for (const c of bg.items) {
        c.y += c.v;
        if (c.y - c.len * bg.fs > h) { c.y = -Math.random() * h * 0.3; c.len = 6 + ((Math.random() * 14) | 0); }
        for (let i = 0; i < c.len; i++) {
          if (!c.chars[i] || Math.random() < 0.02) c.chars[i] = GL[(Math.random() * GL.length) | 0];
          const yy = c.y - i * bg.fs;
          if (yy < -bg.fs || yy > h + bg.fs) continue;
          const al = i === 0 ? 0.55 : 0.28 * (1 - i / c.len);
          ctx.fillStyle = i === 0 ? `rgba(220,255,230,${al})` : A(a0, al);
          ctx.fillText(c.chars[i], c.x, yy);
        }
      }
      break;
    }
    case 'circuit': { // copper traces with signal pulses racing along them
      for (const tr of bg.items) {
        ctx.strokeStyle = 'rgba(140,160,200,0.10)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); tr.pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke();
        ctx.fillStyle = 'rgba(160,180,220,0.18)';
        for (const [x, y] of [tr.pts[0], tr.pts[tr.pts.length - 1]]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } // pads
        tr.p += tr.v; if (tr.p > 1) tr.p = 0;
        // where along the polyline is the pulse?
        let total = 0; const segs = [];
        for (let i = 1; i < tr.pts.length; i++) { const d = Math.hypot(tr.pts[i][0] - tr.pts[i - 1][0], tr.pts[i][1] - tr.pts[i - 1][1]); segs.push(d); total += d; }
        let at = tr.p * total;
        for (let i = 0; i < segs.length; i++) {
          if (at <= segs[i]) {
            const f = segs[i] ? at / segs[i] : 0;
            const px = tr.pts[i][0] + (tr.pts[i + 1][0] - tr.pts[i][0]) * f;
            const py = tr.pts[i][1] + (tr.pts[i + 1][1] - tr.pts[i][1]) * f;
            const g = ctx.createRadialGradient(px, py, 0, px, py, 9);
            g.addColorStop(0, A(a2, 0.7)); g.addColorStop(1, A(a2, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
            break;
          }
          at -= segs[i];
        }
      }
      break;
    }
    case 'tunnel': { // rings rushing toward you, twisting
      const cx = w / 2, cy = h / 2, R0 = Math.hypot(w, h) * 0.6;
      ctx.lineWidth = 1.5;
      for (const r of bg.items) {
        r.z += 0.004; if (r.z > 1) { r.z -= 1; r.rot = Math.random() * 6; }
        const s = r.z ** 2.2 * R0;
        const al = Math.min(1, r.z * 1.6) * (1 - r.z) * 0.6;
        const c = [a0, a1, a2][Math.floor(r.z * 3) % 3];
        ctx.strokeStyle = A(c, al);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(r.rot + r.z * 2 + t * 0.002);
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s, Math.sin(a) * s * 0.7); }
        ctx.stroke(); ctx.restore();
      }
      break;
    }
    case 'deepsea': { // god rays from the surface, bubbles rising, plankton glowing
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x0 = w * (0.1 + i * 0.2) + Math.sin(t * 0.008 + i) * w * 0.05;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(120,200,255,0.07)'); g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x0 - w * 0.03, 0); ctx.lineTo(x0 + w * 0.03, 0); ctx.lineTo(x0 + w * 0.12, h); ctx.lineTo(x0 - w * 0.02, h); ctx.closePath(); ctx.fill();
      }
      for (const b of bg.items) {
        b.ph += 0.03;
        if (b.glow) { // plankton: drifting, pulsing blue-green
          b.x += Math.sin(b.ph) * 0.2; b.y += Math.cos(b.ph * 0.7) * 0.15;
          const al = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(b.ph * 2));
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4);
          g.addColorStop(0, `rgba(80,255,220,${al})`); g.addColorStop(1, 'rgba(80,255,220,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2); ctx.fill();
        } else { // bubbles
          b.y -= b.v; b.x += Math.sin(b.ph) * 0.3;
          if (b.y < -10) { b.y = h + 10; b.x = Math.random() * w; }
          ctx.strokeStyle = 'rgba(180,225,255,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'nightfire': { // a quiet starry sky; now and then a firework blooms far away
      for (const s of bg.items) {
        s.ph += 0.02;
        ctx.fillStyle = `rgba(230,235,255,${(0.15 + s.z * 0.4) * (0.6 + 0.4 * Math.sin(s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.5 + s.z, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.random() < 0.012) {
        const fx0 = w * (0.15 + Math.random() * 0.7); const fy0 = h * (0.15 + Math.random() * 0.35);
        const c = [a0, a1, a2, [255, 220, 120]][(Math.random() * 4) | 0];
        const n = 36; const sz = Math.max(0.4, bg.sc || 1);
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const sp = (1.2 + Math.random() * 0.6) * sz; bg.sparks.push({ x: fx0, y: fy0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c }); }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of bg.sparks) {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.02; p.life -= 0.012;
        ctx.fillStyle = A(p.c, Math.max(0, p.life) * 0.7);
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      bg.sparks = bg.sparks.filter((p) => p.life > 0);
      break;
    }
    case 'aquarium': { // fish wiggling their tails across, bubbles rising
      const FISH = [[255, 160, 80], [120, 200, 255], [255, 220, 100], a1];
      for (const f of bg.items) {
        f.ph += 0.18; f.x += f.v * f.dir; f.y += Math.sin(f.ph * 0.2) * 0.25;
        if (f.x < -40) f.x = w + 40; if (f.x > w + 40) f.x = -40;
        const c = FISH[f.c];
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir, 1);
        ctx.fillStyle = A(c, 0.32);
        ctx.beginPath(); ctx.ellipse(0, 0, f.s, f.s * 0.5, 0, 0, Math.PI * 2); ctx.fill(); // body
        const wag = Math.sin(f.ph) * f.s * 0.3;
        ctx.beginPath(); ctx.moveTo(-f.s * 0.85, 0); ctx.lineTo(-f.s * 1.6, -f.s * 0.5 + wag); ctx.lineTo(-f.s * 1.6, f.s * 0.5 + wag); ctx.closePath(); ctx.fill(); // tail
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(f.s * 0.5, -f.s * 0.12, f.s * 0.11, 0, Math.PI * 2); ctx.fill(); // eye
        ctx.restore();
        if (Math.random() < 0.006) bg.bubbles.push({ x: f.x + f.dir * f.s, y: f.y, r: 1 + Math.random() * 2 });
      }
      ctx.strokeStyle = 'rgba(190,230,255,0.3)'; ctx.lineWidth = 1;
      for (const b of bg.bubbles) { b.y -= 0.6; b.x += Math.sin(b.y * 0.05) * 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
      bg.bubbles = bg.bubbles.filter((b) => b.y > -5);
      break;
    }
    case 'life': { // Conway's Game of Life, a generation every few frames; reseeded if it dies down
      const { gw, gh, cs } = bg;
      if (t % 7 === 0) {
        const nx = new Uint8Array(gw * gh); let alive = 0;
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          let nb = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (dx || dy) nb += bg.grid[((y + dy + gh) % gh) * gw + ((x + dx + gw) % gw)]; }
          const i = y * gw + x; const v = bg.grid[i] ? (nb === 2 || nb === 3 ? 1 : 0) : (nb === 3 ? 1 : 0);
          nx[i] = v; alive += v;
        }
        bg.grid = nx; bg.gen++;
        if (alive < gw * gh * 0.04 || bg.gen > 600) { bg.grid = bg.grid.map(() => (Math.random() < 0.22 ? 1 : 0)); bg.gen = 0; }
      }
      for (let i = 0; i < gw * gh; i++) {
        bg.age[i] = bg.grid[i] ? Math.min(1, bg.age[i] + 0.2) : bg.age[i] * 0.85; // cells fade in and out
        if (bg.age[i] < 0.03) continue;
        ctx.fillStyle = A(bg.grid[i] ? a0 : a2, 0.12 * bg.age[i]); // quiet enough to read text over
        ctx.fillRect((i % gw) * cs + 1, Math.floor(i / gw) * cs + 1, cs - 2, cs - 2);
      }
      break;
    }
    case 'bounce': { // the M logo drifting and bouncing — a new colour on every wall, a flash on a corner hit
      const b = bg.items[0];
      const fs = Math.max(18, 54 * (bg.sc || 1)); const lw = fs * 1.05; const lh = fs * 0.95;
      b.x += b.vx; b.y += b.vy;
      let hitX = false; let hitY = false;
      if (b.x < 0 || b.x + lw > w) { b.vx *= -1; b.x = Math.max(0, Math.min(w - lw, b.x)); hitX = true; }
      if (b.y < 0 || b.y + lh > h) { b.vy *= -1; b.y = Math.max(0, Math.min(h - lh, b.y)); hitY = true; }
      if (hitX || hitY) b.c = (b.c + 1) % 5;
      if (hitX && hitY) b.flash = 1; // the corner!
      const COLS = [a0, a1, a2, [96, 220, 160], [255, 214, 90]];
      ctx.font = `900 ${Math.round(fs)}px 'Segoe UI', 'Pretendard', sans-serif`; ctx.textBaseline = 'top';
      ctx.fillStyle = A(COLS[b.c], 0.4 + b.flash * 0.5);
      ctx.fillText('M', b.x, b.y);
      if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.08})`; ctx.fillRect(0, 0, w, h); b.flash *= 0.92; if (b.flash < 0.02) b.flash = 0; }
      break;
    }
    case 'pong': { // two paddles rallying on their own (each one a little slow to react)
      const p = bg.items[0];
      const ph = Math.max(20, h * 0.16); const pw = Math.max(3, w * 0.008); const m = Math.max(8, w * 0.03);
      p.x += p.vx; p.y += p.vy;
      if (p.y < 4 || p.y > h - 4) p.vy *= -1;
      p.l += (p.y - p.l) * 0.06; p.r += (p.y - p.r) * 0.06;
      if (p.x < m + pw && Math.abs(p.y - p.l) < ph / 2) { p.vx = Math.abs(p.vx); p.vy += (p.y - p.l) * 0.03; }
      if (p.x > w - m - pw && Math.abs(p.y - p.r) < ph / 2) { p.vx = -Math.abs(p.vx); p.vy += (p.y - p.r) * 0.03; }
      if (p.x < 0 || p.x > w) { if (p.x < 0) p.sr++; else p.sl++; p.x = w / 2; p.y = h / 2; p.vy = (Math.random() - 0.5) * 3; } // a point!
      p.vy = Math.max(-4, Math.min(4, p.vy));
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = A(a0, 0.35); ctx.fillRect(m - pw, p.l - ph / 2, pw, ph);
      ctx.fillStyle = A(a2, 0.35); ctx.fillRect(w - m, p.r - ph / 2, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(p.x - pw / 2, p.y - pw / 2, pw, pw);
      ctx.font = `700 ${Math.round(Math.max(12, h * 0.07))}px 'Cascadia Mono', Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillText(`${p.sl}   ${p.sr}`, w / 2, h * 0.05);
      ctx.textAlign = 'start';
      break;
    }
    case 'campfire': { // 캠프파이어: footage of a fire by the tents (CC0), painted into soft flat colours, looped without a seam
      const v = campfireVideo();
      if (v.readyState >= 2 && v.videoWidth) {
        const k = Math.max(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * k, dh = v.videoHeight * k;
        if (isLight()) ctx.filter = 'saturate(0.7) brightness(1.25)'; // light mode: a paler painting under dark text
        ctx.drawImage(v, (w - dw) * 0.4, h - dh, dw, dh); // keep the fire (left of centre, low) in view
        ctx.filter = 'none';
      }
      if (isLight()) { ctx.fillStyle = 'rgba(250,248,245,0.58)'; ctx.fillRect(0, 0, w, h); } // light mode: a strong light wash so dark text reads
      break;
    }
    case 'balloonsky': { // latex balloons drifting up on curly strings, near ones big and crisp, far ones small and hazy
      const L = isLight();
      const spr = bg.balloonSprites || (bg.balloonSprites = BALLOON_COLS.map((c) => balloonSprite(c)));
      const str = L ? 'rgba(80,84,104,' : 'rgba(225,228,240,';
      for (const b of bg.items) {
        b.ph += 0.012 + b.z * 0.01;
        b.y -= b.v;
        const sway = Math.sin(b.ph) * (4 + b.z * 6);
        const x = b.x + sway;
        if (b.y < -b.r * 5) { b.y = h + b.r * 2; b.x = Math.random() * w; }
        const tilt = Math.cos(b.ph) * 0.09; // leans with the drift
        const a = 0.16 + b.z * 0.3; // soft: terminal text stays readable over even the nearest balloon
        // string: from the knot, trailing behind the sway in two soft curves
        const kx = x + Math.sin(tilt) * b.r * 1.15, ky = b.y + Math.cos(tilt) * b.r * 1.15;
        const len = b.r * 3.4, lag = -Math.cos(b.ph) * b.r * 0.45;
        ctx.strokeStyle = str + (0.08 + b.z * 0.14) + ')';
        ctx.lineWidth = Math.max(0.5, 0.4 + b.z * 0.5);
        ctx.beginPath(); ctx.moveTo(kx, ky);
        ctx.bezierCurveTo(kx + lag, ky + len * 0.3, kx - lag * 0.8, ky + len * 0.62, kx + lag * 0.5, ky + len);
        ctx.stroke();
        // the balloon (pre-rendered sprite per colour, scaled)
        const im = spr[b.c];
        const scl = b.r / BALLOON_R;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x, b.y); ctx.rotate(tilt); ctx.scale(scl, scl);
        ctx.drawImage(im, -im.width / 2, -im.height * BALLOON_CY);
        ctx.restore();
      }
      break;
    }
    default:
      break;
  }
}

/* 캠프파이어: one looping, muted video shared by the background and its picker previews */
let CAMPFIRE_VIDEO = null;
function campfireVideo() {
  if (!CAMPFIRE_VIDEO) {
    const v = document.createElement('video');
    v.src = 'ambient/campfire.webm';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    CAMPFIRE_VIDEO = v;
  }
  if (CAMPFIRE_VIDEO.paused) CAMPFIRE_VIDEO.play().catch(() => {});
  return CAMPFIRE_VIDEO;
}

/* 풍선 하늘: one detailed latex balloon per colour, drawn once and reused at every size */
const BALLOON_R = 40; // sprite radius (px)
const BALLOON_CY = 0.42; // balloon centre as a fraction of the sprite height
const BALLOON_COLS = [[244, 67, 98], [255, 176, 46], [41, 168, 255], [150, 104, 255], [38, 196, 134], [255, 112, 180], [255, 222, 64]];
function balloonSprite(col) {
  const r = BALLOON_R;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(r * 2.3); cv.height = Math.ceil(r * 2.6);
  const c = cv.getContext('2d');
  const cx = cv.width / 2, cy = cv.height * BALLOON_CY;
  const mix = (k, t) => col.map((v) => Math.round(v + (k - v) * t));
  const rgb = (a) => 'rgb(' + a.join(',') + ')';
  const top = cy - r, bot = cy + r * 1.12;
  const shape = () => {
    c.beginPath();
    c.moveTo(cx, top);
    c.bezierCurveTo(cx + r * 1.08, top, cx + r * 1.02, cy + r * 0.62, cx + r * 0.1, bot);
    c.lineTo(cx - r * 0.1, bot);
    c.bezierCurveTo(cx - r * 1.02, cy + r * 0.62, cx - r * 1.08, top, cx, top);
    c.closePath();
  };
  // body: lit from the upper left, deep colour at the rim
  shape();
  const g = c.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy + r * 0.1, r * 1.35);
  g.addColorStop(0, rgb(mix(255, 0.55)));
  g.addColorStop(0.32, rgb(mix(255, 0.12)));
  g.addColorStop(0.7, rgb(col));
  g.addColorStop(1, rgb(mix(0, 0.45)));
  c.fillStyle = g; c.fill();
  // rim light on the lower right: light passing through thin latex
  c.save(); shape(); c.clip();
  const rim = c.createRadialGradient(cx + r * 0.55, cy + r * 0.6, r * 0.05, cx + r * 0.55, cy + r * 0.6, r * 0.8);
  rim.addColorStop(0, 'rgba(' + mix(255, 0.4).join(',') + ',0.55)'); rim.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = rim; c.fillRect(0, 0, cv.width, cv.height);
  c.restore();
  // gloss: a soft window reflection + a sharp glint
  c.save();
  c.translate(cx - r * 0.36, cy - r * 0.4); c.rotate(-0.55);
  const gl = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
  gl.addColorStop(0, 'rgba(255,255,255,0.85)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.scale(0.55, 1); c.fillStyle = gl; c.beginPath(); c.arc(0, 0, r * 0.42, 0, Math.PI * 2); c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath(); c.ellipse(cx - r * 0.5, cy - r * 0.18, r * 0.05, r * 0.09, -0.4, 0, Math.PI * 2); c.fill();
  // edge: a faint darker outline keeps the shape crisp on any background
  shape(); c.strokeStyle = 'rgba(' + mix(0, 0.55).join(',') + ',0.45)'; c.lineWidth = 1.2; c.stroke();
  // knot: a little tied triangle
  c.fillStyle = rgb(mix(0, 0.25));
  c.beginPath();
  c.moveTo(cx - r * 0.1, bot - 1); c.lineTo(cx + r * 0.1, bot - 1);
  c.lineTo(cx + r * 0.13, bot + r * 0.14); c.quadraticCurveTo(cx, bot + r * 0.09, cx - r * 0.13, bot + r * 0.14);
  c.closePath(); c.fill();
  return cv;
}

/*
 * 배경 음악: a quiet ambience loop that fits the background (CC0 field recordings from Freesound, cut into
 * 40 s loops whose end is crossfaded into their start, so they repeat without a seam). Changing the
 * background crossfades to its sound; 뇌우 adds a distant thunder roll after each flash.
 */
const BG_AMBIENT = {
  stars: 'night', shooting: 'night', constellation: 'woods', lanterns: 'woods', aurora: 'wind', sunset: 'evening',
  rain: 'rain', thunder: 'rain', snow: 'winter', pond: 'drops', waves: 'ocean',
  grid: 'space', warp: 'space', tunnel: 'space', blackhole: 'void',
  network: 'hum', circuit: 'hum', code: 'hum', dna: 'hum', lavalamp: 'room', life: 'room',
  fireflies: 'summer', sakura: 'spring', balloonsky: 'park', bokeh: 'city',
  jellyfish: 'underwater', deepsea: 'deepsea', aquarium: 'bubbles',
  nightfire: 'fireworks', campfire: 'campfire', bounce: 'vinyl', pong: 'vinyl',
};
const AMB = { ctx: null, master: null, cur: '', voice: null, buffers: new Map(), want: '' };
const ambVolume = () => Math.max(0, Math.min(1, Number(S.settings.bgMusicVolume ?? 0.25)));
function ambContext() {
  if (!AMB.ctx) {
    AMB.ctx = new AudioContext();
    AMB.master = AMB.ctx.createGain();
    AMB.master.gain.value = 0;
    AMB.master.connect(AMB.ctx.destination);
    const wake = () => { if (AMB.ctx.state === 'suspended') AMB.ctx.resume(); };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
  }
  if (AMB.ctx.state === 'suspended') AMB.ctx.resume().catch(() => {});
  return AMB.ctx;
}
function ambBuffer(name) {
  if (!AMB.buffers.has(name)) {
    AMB.buffers.set(name, fetch('ambient/' + name + '.ogg').then((r) => r.arrayBuffer()).then((b) => ambContext().decodeAudioData(b)).catch(() => { AMB.buffers.delete(name); return null; }));
  }
  return AMB.buffers.get(name);
}
/** Volume slider look: 0 % reads as off (dimmed track, crossed-out speaker). */
function syncVolumeRange(range, v) {
  if (!range) return;
  const off = !(v > 0);
  range.classList.toggle('muted', off);
  const b = range.querySelector('.vol-mute');
  if (b) { b.innerHTML = icon(off ? 'volumeX' : 'volume'); b.title = off ? '음소거 해제' : '음소거'; }
}
async function updateAmbient() {
  const kind = S.settings.bgAnim || 'none';
  const vol = ambVolume();
  const want = vol > 0 && kind !== 'none' ? BG_AMBIENT[kind] || '' : '';
  AMB.want = want;
  if (!want && !AMB.ctx) return;
  const ctx = ambContext();
  AMB.master.gain.setTargetAtTime(vol, ctx.currentTime, 0.25);
  if (want === AMB.cur) return;
  // fade the old sound out
  const old = AMB.voice;
  if (old) {
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => { try { old.src.stop(); } catch { /* already stopped */ } old.gain.disconnect(); }, 2500);
  }
  AMB.voice = null;
  AMB.cur = want;
  if (!want) return;
  const buf = await ambBuffer(want);
  if (!buf || AMB.want !== want || AMB.cur !== want || AMB.voice) return; // changed again while loading
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(AMB.master);
  src.start(ctx.currentTime, Math.random() * buf.duration); // not always from the same second
  gain.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  AMB.voice = { src, gain };
}
/** 뇌우: a distant roll a moment after the flash (light travels faster than sound). */
async function ambThunder() {
  if (AMB.cur !== 'rain' || S.settings.bgAnim !== 'thunder' || !AMB.ctx) return;
  const buf = await ambBuffer('thunder' + (1 + Math.floor(Math.random() * 3)));
  if (!buf) return;
  const ctx = AMB.ctx;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.85 + Math.random() * 0.25;
  src.connect(gain).connect(AMB.master);
  src.start(ctx.currentTime + 0.4 + Math.random() * 1.4);
  src.onended = () => gain.disconnect();
}

let BG = null;
function updateBgAnim() {
  const kind = S.settings.bgAnim || 'none';
  const stageEl = $('#stage');
  if (!BG) {
    if (kind === 'none') return;
    const canvas = h('canvas', 'bg-layer');
    stageEl.insertBefore(canvas, stageEl.firstChild);
    BG = createBg(canvas);
    new ResizeObserver(() => BG.size(stageEl.clientWidth, stageEl.clientHeight)).observe(stageEl);
    BG.size(stageEl.clientWidth, stageEl.clientHeight);
  }
  BG.canvas.style.opacity = String(Math.max(0.15, Math.min(1, Number(S.settings.bgAnimLevel) || 0.6)));
  if (BG.kind !== kind) BG.set(kind);
}

/* ---------- typing sounds (synthesised, no audio files) ---------- */

const SOUND_KINDS = [
  ['none', '없음', '소리 없이 조용하게'],
  ['blue', '기계식 · 청축', '찰칵하는 경쾌한 두 번 클릭'],
  ['red', '기계식 · 저소음', '낮고 부드러운 도각 소리'],
  ['typewriter', '타자기', '금속 활자가 종이를 치는 소리 · Enter는 종'],
  ['wood', '나무 블록', '똑똑 맑은 목탁 소리'],
  ['bubble', '보글', '방울이 톡 올라오는 소리'],
  ['drop', '물방울', '똑 떨어지는 물방울'],
  ['soft', '톡', '아주 작고 부드러운 톡'],
  ['piano', '피아노 음계', '칠 때마다 다른 음 · 연주하듯'],
  ['retro', '8비트', '레트로 게임 효과음 · Enter는 화음'],
  ['laser', '레이저', '슝 하는 SF 효과음'],
  ['marimba', '마림바', '나무 건반 · Enter는 화음'],
  ['kalimba', '칼림바', '금속 건반을 튕기는 소리 · Enter는 아르페지오'],
  ['glass', '유리잔', '맑게 울리는 유리 소리'],
  ['coin', '동전', '띠링 · 게임 코인 소리'],
  ['pop', '뽁', '뽁뽁이 터지는 소리'],
  ['spring', '띠용', '스프링처럼 출렁이는 소리'],
  ['buckling', '버클링 스프링', '빈티지 IBM 키보드의 철컥이는 스프링'],
  ['bamboo', '대나무', '속이 빈 대나무를 두드리는 맑은 울림'],
  ['stone', '조약돌', '조약돌 두 개가 탁 부딪히는 소리'],
  ['holy', '천상의 울림', '대성당 파이프 오르간 · Space=깊은 페달음 · Enter=천사의 합창과 종소리'],
  ['gayageum', '가야금', '평조 명주실 뜯는 소리와 농현 · ⌫는 퇴성, ⇧⏎는 추성, Enter는 가락'],
  ['musicbox', '오르골', '태엽 오르골의 작은 금속 빗 · Enter는 짧은 멜로디'],
  ['morse', '모스 전신기', '놋쇠 키가 딸깍, 무전 삑 · Space는 길게 · Enter는 ·−· '],
  ['clock', '태엽 시계', '칠 때마다 틱·톡 번갈아 · Enter는 뻐꾸기'],
  ['scifi', '홀로그램 콘솔', '계산하는 로봇처럼 재잘대는 데이터음 + 지직 켜지는 홀로그램'],
  ['fight', '격투 게임', '글자=잽 · Space=발차기 · ⌫=가드 · ⇧⏎=회피 · Enter=K.O.!'],
  ['sword', '검술', '글자=휘익 휘두르기 · Space=베어 가르기 · ⌫=납도 · ⇧⏎=발도(스르릉) · Enter=칼날 부딪힘'],
  ['drums', '드럼', '치는 대로 비트가 됨(탐·스네어·하이햇) · Space=킥 · ⌫=스틱 · ⇧⏎=플램 · Enter=필인+심벌'],
  ['choir', '합창단', '칠 때마다 아·오·우·에 합창 · Space=베이스 · Enter="아—멘"'],
  ['gross', '더러운 소리', '글자=뿡·뽀옹 (매번 다름) · Space=끄으억 트림 · ⌫=후루룩 · ⇧⏎=철퍽 · Enter=대폭발'],
  ['horror', '공포', '거꾸로 차오르는 피아노 · Space=심장 박동 · ⌫=쇠 긁는 소리 · ⇧⏎=귓가의 속삭임 · Enter=비명 현악'],
  ['gun', '총', '글자=탕! · Space=장전 (탄창 탁 + 슬라이드 철컥) · ⌫=탄피 떨어짐 · ⇧⏎=노리쇠 철컥 · Enter=샷건+펌프'],
  ['edm', 'EDM', '치는 대로 신스 아르페지오 · Space=킥 · ⌫=워블 베이스 · ⇧⏎=라이저 · Enter=드롭!'],
  ['horse', '말 달리기', '글자=다그닥 말발굽 · Space=이럇! · ⌫=푸르륵 · ⇧⏎=워워~ · Enter=질주하다 히히히힝'],
  ['scream', '비명', '글자=꺅! · Space=으아악 · ⌫=헉(숨 들이킴) · ⇧⏎=히익! · Enter=복도에 울리는 긴 비명'],
  ['meow', '냥냥이', '칠 때마다 "야옹" · Space=그르릉 · ⌫=하악 · ⇧⏎="므릅?" · Enter=당당한 야~옹'],
  ['whale', '고래의 노래', '깊은 바다에 울리는 고래 울음 · Space=낮은 울음 · ⌫=딸깍 초음파 · Enter=소나 핑'],
  ['bottle', '유리병 피리', '병 입구에 입김을 부는 맑고 텅 빈 소리 · 오음계 멜로디'],
  ['pluck', '신스 플럭', '전자 현을 튕기는 소리'],
  ['bloop', '물속 블룹', '물속에서 울리는 둥근 블룹'],
  ['pingpong', '탁구 랠리', '실제 탁구 녹음 · 글자=좌우로 오가는 똑딱 랠리 · Space=서브 전 공 튀기기 · ⌫=네트 · ⇧⏎=서브 · Enter=스매시! 공이 튀며 굴러감'],
  ['frog', '개구리 연못', '실제 개구리 녹음 · 글자=개굴 · Space=황소개구리 구워억 · ⌫=퐁당 · ⇧⏎=귀뚜라미 · Enter=연못 전체가 개굴개굴'],
  ['duck', '삑삑이 오리', '글자=삑! · Space=꾸욱 쥐어짜기 · ⌫=바람 빠지는 소리 · ⇧⏎=삑삑 · Enter=삑삑이 팡파르'],
  ['kitchen', '주방', '실제 녹음 · 글자=칼질 탁탁 · Space=기름 지글지글 · ⌫=냄비 뚜껑 · ⇧⏎=보글보글 · Enter=전자레인지 띵'],
  ['farm', '농장 아침', '실제 녹음 · 글자=병아리 삐약 · Space=소 음매 · ⌫=거위 꽥 · ⇧⏎=양 매애 · Enter=닭 꼬끼오'],
  ['orch', '오케스트라 튜닝', '실제 녹음 · 글자=바이올린 피치카토 선율 · Space=첼로 · ⌫=스피카토 · ⇧⏎=튜닝 음 · Enter=오케스트라 한 방'],
  ['merchant', '마을 주민', '마인크래프트 주민 목소리 (PC에 설치된 마인크래프트 Java에서 불러옴, 없으면 비슷한 합성음) · 글자=흠 · Space=흥정 · ⌫=으응(아니) · ⇧⏎=흠!(좋아) · Enter=주민이 죽는 소리'],
];
const SOUND_ALIASES = { mech: 'blue', type: 'typewriter', chime: 'holy', rap: 'blue' }; // settings saved by earlier versions
let audioCtx = null;
let lastSound = 0;

/** A long stone-hall reverb (generated impulse response), shared by every sound that wants it. */
function cathedral(ctx) {
  if (cathedral.node && cathedral.ctx === ctx) return cathedral.node;
  const len = Math.round(ctx.sampleRate * 4.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const early = t < 0.08 && Math.random() < 0.004 ? 2 : 0; // a few early reflections off the walls
      d[i] = ((Math.random() * 2 - 1) + early) * Math.exp(-t * 1.6) * (t < 0.02 ? t / 0.02 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const tone = ctx.createBiquadFilter(); // stone eats the highs
  tone.type = 'lowpass'; tone.frequency.value = 3800;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  conv.connect(tone); tone.connect(wet); wet.connect(ctx.destination);
  cathedral.node = conv; cathedral.ctx = ctx;
  return conv;
}

/** A plucked string (Karplus–Strong), rendered once per pitch: the real physics of a plucked silk string. */
function pluckedString(ctx, freq, { secs = 1.6, damp = 0.996, bright = 0.5 } = {}) {
  const key = `${Math.round(freq)}:${damp}:${bright}`;
  pluckedString.cache = pluckedString.cache || new Map();
  if (pluckedString.cache.has(key)) return pluckedString.cache.get(key);
  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.round(sr / freq));
  const buf = ctx.createBuffer(1, Math.round(sr * secs), sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { // the pluck: a soft-edged burst (a finger, not a pick)
    const r = Math.random() * 2 - 1;
    prev = prev + (r - prev) * bright;
    ring[i] = prev;
  }
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % n];
    ring[idx] = (a + b) * 0.5 * damp; // the string loses its highs first, then its body
    out[i] = a;
    idx = (idx + 1) % n;
  }
  if (pluckedString.cache.size > 40) pluckedString.cache.clear();
  pluckedString.cache.set(key, buf);
  return buf;
}

/*
 * Real recordings for typing sounds (samples.js — CC0 clips, base64 MP3), decoded per theme on first use.
 * Each clip is tidied on decode: leading / trailing silence cut, volume normalised, edges faded.
 */
const sampleCache = { ctx: null, bufs: {}, pending: {} };
function tidySample(ctx, buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const sr = buf.sampleRate;
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  const amp = (i) => { let m = 0; for (const d of data) m = Math.max(m, Math.abs(d[i])); return m; };
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, amp(i));
  if (peak < 1e-4) return buf;
  let a = 0; while (a < n && amp(a) < peak * 0.06) a++;
  let b = n - 1; while (b > a && amp(b) < peak * 0.025) b--;
  a = Math.max(0, a - Math.round(sr * 0.004));
  b = Math.min(n - 1, b + Math.round(sr * 0.02));
  const len = b - a + 1;
  const out = ctx.createBuffer(ch, len, sr);
  const gain = 0.9 / peak;
  const fin = Math.round(sr * 0.003);
  const fout = Math.round(sr * 0.012);
  for (let c = 0; c < ch; c++) {
    const src = data[c];
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[a + i] * gain * Math.min(1, i / fin, (len - 1 - i) / fout);
  }
  return out;
}
// 마을 주민: the villager voices come from the user's own Minecraft install, if there is one
window.mt.minecraftSounds?.().then((m) => { if (m && window.SAMPLES) window.SAMPLES.merchant = m; }).catch(() => {});

function sampleSet(ctx, theme) {
  if (sampleCache.ctx !== ctx) { sampleCache.ctx = ctx; sampleCache.bufs = {}; sampleCache.pending = {}; }
  const src = window.SAMPLES && window.SAMPLES[theme];
  if (!src) return null;
  const bufs = sampleCache.bufs[theme] || (sampleCache.bufs[theme] = {});
  if (!sampleCache.pending[theme]) {
    sampleCache.pending[theme] = Promise.all(Object.entries(src).map(async ([name, b64]) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      try { bufs[name] = tidySample(ctx, await ctx.decodeAudioData(bytes.buffer)); } catch { /* skip a bad clip */ }
    }));
  }
  return bufs;
}

/** A piano-ish note played backwards: it swells out of nothing and cuts off — the classic horror sound. */
function reverseNoteBuffer(ctx, f, secs = 1.1) {
  const sr = ctx.sampleRate;
  const n = Math.round(sr * secs);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const v = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.01 * t) + 0.25 * Math.sin(2 * Math.PI * f * 3.03 * t) + 0.12 * Math.sin(2 * Math.PI * f * 4.2 * t)) * Math.exp(-t * 3.2);
    d[n - 1 - i] = v * 0.45;
  }
  return buf;
}

function noiseBuffer(ctx) {
  if (noiseBuffer.buf) return noiseBuffer.buf;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuffer.buf = buf;
  return buf;
}

/*
 * Typing sounds follow the physical key press (keydown), not the terminal's echo:
 * every key is heard even while typing fast or composing Korean (IME) characters.
 */
const SILENT_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu', 'OS', 'HangulMode', 'HanjaMode']);
window.addEventListener('keydown', (e) => {
  const kind = S.settings.typingSound;
  if (!kind || kind === 'none' || S.overlay || SILENT_KEYS.has(e.key)) return;
  const t = activeTab();
  if (!t || !t.alive || !document.activeElement || !t.host.contains(document.activeElement)) return;
  if ((e.ctrlKey || e.metaKey) && e.key !== 'Enter') return; // shortcuts are not typing
  let key = 'key';
  if (e.key === 'Enter') key = e.shiftKey ? 'newline' : 'enter';
  else if (e.key === ' ' || e.code === 'Space') key = 'space';
  else if (e.key === 'Backspace' || e.key === 'Delete') key = 'back';
  // held keys repeat quickly: keep them, but at most ~16 per second
  playKeySound(kind, key, !e.repeat);
}, true);

// 글자 파편 + Korean: throw each 자음 / 모음 as its key is pressed (see jamoFor)
window.addEventListener('keydown', (e) => {
  if (S.settings.typingFx !== 'letters' || S.overlay) return;
  const t = activeTab();
  if (!t || !t.alive || !document.activeElement || !t.host.contains(document.activeElement)) return;
  const jamo = jamoFor(e);
  if (jamo) spawnFx(t, jamo, true);
}, true);

/** Which kind of key a chunk of input is, for the sound. */
function keyKind(d) {
  if (d === '\r') return 'enter';
  if (d === ' ') return 'space';
  if (d === '\x7f' || d === '\b') return 'back';
  return 'key';
}

/**
 * kind: sound theme. key: 'key' | 'space' | 'newline' (Shift+Enter) | 'enter' (submit) | 'back'
 * (true / false are accepted for 'enter' / 'key'.)
 * Keyboard themes stay percussive (no melody); instrument themes speak in their own voice.
 */
const KEYBOARD_SOUNDS = new Set(['blue', 'red', 'typewriter', 'wood', 'pop', 'bamboo', 'stone', 'buckling']);
// themes that play a musical note (the rest have a fixed voice and are moved by pitch)
const NOTE_SOUNDS = new Set(['piano', 'marimba', 'kalimba', 'retro', 'pluck', 'holy', 'gayageum', 'musicbox', 'choir', 'bottle']);

function playKeySound(kind, key = 'key', force = false) {
  kind = SOUND_ALIASES[kind] || kind;
  if (!kind || kind === 'none') return;
  if (key === true) key = 'enter';
  if (!key) key = 'key';
  const now = performance.now();
  if (!force && now - lastSound < 60) return; // only throttles auto-repeat (held keys)
  lastSound = now;
  try {
    audioCtx = audioCtx || new AudioContext({ latencyHint: 'interactive' });
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume(); // the audio engine can doze off after a quiet while
    const t0 = ctx.currentTime + 0.005;
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, Number(S.settings.typingVolume ?? 0.4))) * (key === 'enter' ? 1.2 : 1);
    master.connect(ctx.destination);
    const out = master;
    const jitter = key === 'key' ? 0.94 + Math.random() * 0.12 : 1; // role sounds stay in tune

    // one hit of the theme. o: { pitch, stretch, big, at, note, gain }
    const hit = (o = {}) => {
      const out = ctx.createGain(); // eslint-disable-line no-shadow
      out.gain.value = o.gain ?? 1;
      out.connect(master);
      const pitch = (o.pitch || 1) * jitter;
      const stretch = o.stretch || 1;
      const big = !!o.big;
      const T = t0 + (o.at || 0);
      const noise = (freq, q, peak, len, at = 0, type = 'bandpass') => {
        len *= stretch;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq * pitch; f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T + at);
        g.gain.exponentialRampToValueAtTime(peak, T + at + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, T + at + len);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(T + at); src.stop(T + at + len + 0.02);
      };
      const tone = (type, f0, f1, peak, len, at = 0) => {
        len *= stretch;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f0 * pitch, T + at);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), T + at + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T + at);
        g.gain.exponentialRampToValueAtTime(peak, T + at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, T + at + len);
        osc.connect(g); g.connect(out);
        osc.start(T + at); osc.stop(T + at + len + 0.02);
      };
      const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
      const note = o.note || PENTA[(Math.random() * PENTA.length) | 0];
      // modal synthesis: a tiny "tap" rings a set of narrow resonances (how real wood / stone / metal sound)
      const modal = (modes, decay, peak = 1, at = 0) => {
        decay *= stretch;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        const tap = ctx.createGain();
        tap.gain.setValueAtTime(1, T + at);
        tap.gain.exponentialRampToValueAtTime(0.0001, T + at + 0.004);
        src.connect(tap);
        for (const [f, q, g] of modes) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = f * pitch; bp.Q.value = q;
          const env = ctx.createGain();
          env.gain.setValueAtTime(g * peak, T + at);
          env.gain.exponentialRampToValueAtTime(0.0001, T + at + decay);
          tap.connect(bp); bp.connect(env); env.connect(out);
        }
        src.start(T + at); src.stop(T + at + 0.01);
      };

      switch (kind) {
        case 'blue': // 청축: click (switch) + clack (bottom out)
          noise(5200, 1.4, 0.9, 0.01);
          noise(2600, 1.1, big ? 0.9 : 0.7, big ? 0.05 : 0.03, 0.016);
          if (big) noise(900, 0.8, 0.6, 0.06, 0.02, 'lowpass');
          break;
        case 'red': // 저소음: muted, deep thock
          noise(700, 0.7, 0.9, big ? 0.08 : 0.045, 0, 'lowpass');
          tone('sine', big ? 100 : 150, 70, big ? 0.6 : 0.5, big ? 0.08 : 0.045);
          break;
        case 'typewriter': // 타자기: type bar strikes the platen
          noise(2600, 2, 1, 0.014, 0, 'highpass');
          noise(320, 0.9, 0.7, 0.05, 0.003, 'lowpass');
          noise(1400, 6, 0.25, 0.03, 0.006);
          break;
        case 'wood': { // 나무 블록 (목탁): a hollow wooden "똑"
          const f = 860 * pitch;
          const len = (big ? 0.15 : 0.1) * stretch;
          // the knock: the pitch drops a touch in the first few ms as the wood gives (that's the "tok")
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f * 1.14, T); o.frequency.exponentialRampToValueAtTime(f, T + 0.007);
          g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.8, T + 0.0012); g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          o.connect(g); g.connect(out); o.start(T); o.stop(T + len + 0.02);
          // wood's partials are out of tune with each other and die fast — no bell-like ring
          tone('sine', f * 2.29, f * 2.27, 0.2, 0.03);
          tone('sine', f * 3.87, f * 3.85, 0.08, 0.016);
          // the hollow body: a short, low, round thump underneath
          tone('triangle', f * 0.5, f * 0.47, 0.32, 0.035);
          // the mallet: a blunt, dull contact — low-passed, not a hiss
          noise(1600, 0.8, 0.6, 0.005, 0, 'lowpass');
          break;
        }
        case 'bamboo': { // 대나무: a hollow tube struck — the air inside rings "통"
          // tubes of different lengths, like a bamboo chime: each key knocks a different one
          const TUBES = [392, 440, 523, 587, 659];
          const f = (o.tube || TUBES[(Math.random() * TUBES.length) | 0]) * pitch * (big ? 0.75 : 1);
          const len = (big ? 0.38 : 0.24) * stretch;
          // the shell: a slight pitch drop as the wall flexes, then its tone
          const sh = ctx.createOscillator(); const sg = ctx.createGain();
          sh.type = 'sine';
          sh.frequency.setValueAtTime(f * 1.06, T); sh.frequency.exponentialRampToValueAtTime(f, T + 0.012);
          sg.gain.setValueAtTime(0.0001, T); sg.gain.exponentialRampToValueAtTime(0.55, T + 0.003); sg.gain.exponentialRampToValueAtTime(0.0001, T + len);
          sh.connect(sg); sg.connect(out); sh.start(T); sh.stop(T + len + 0.02);
          // a closed tube rings only on odd harmonics — that's the hollow, "empty" colour
          tone('sine', f * 3, f * 2.98, 0.16, len * 0.35);
          tone('sine', f * 5.02, f * 5, 0.05, len * 0.18);
          // the air column: a puff of breath ringing at the tube's pitch ("통")
          const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 14;
          const ag = ctx.createGain();
          ag.gain.setValueAtTime(0.0001, T); ag.gain.exponentialRampToValueAtTime(2.2, T + 0.004); ag.gain.exponentialRampToValueAtTime(0.0001, T + len * 0.8);
          src.connect(bp); bp.connect(ag); ag.connect(out); src.start(T); src.stop(T + len);
          // the stick on the node: dull and woody
          noise(1400, 0.8, 0.4, 0.005, 0, 'lowpass');
          break;
        }
        case 'stone': // 조약돌: two pebbles clacking
          modal([[2300, 14, 7], [3900, 12, 4], [6100, 10, 2]], 0.035);
          if (big) modal([[1900, 14, 6], [3300, 12, 3]], 0.05, 1, 0.045);
          break;
        case 'buckling': // 버클링 스프링: vintage IBM Model M — spring buckles, then the key bottoms out
          modal([[3100, 30, 3.5], [4700, 24, 1.5]], 0.05);
          noise(1800, 1.2, 0.8, 0.012);
          noise(600, 0.8, 0.6, big ? 0.06 : 0.04, 0.012, 'lowpass');
          break;
        case 'holy': { // 천상의 울림: a cathedral pipe organ — a principal chorus of stops, each pipe's soft chiff, a 4-second stone hall
          const f = (note / 2) * pitch;
          const len = (big ? 2.4 : 0.55) * stretch;
          const hall = cathedral(ctx);
          const send = ctx.createGain(); send.gain.value = master.gain.value * (o.gain ?? 1) * 1.8; send.connect(hall);
          // echoes rolling back from the far walls of the nave: each repeat softer and darker, all of them into the hall
          const echo = ctx.createDelay(2); echo.delayTime.value = 0.42;
          const efb = ctx.createGain(); efb.gain.value = 0.55;
          const edark = ctx.createBiquadFilter(); edark.type = 'lowpass'; edark.frequency.value = 2400;
          const ewet = ctx.createGain(); ewet.gain.value = 0.6;
          echo.connect(edark); edark.connect(efb); efb.connect(echo); edark.connect(ewet); ewet.connect(out); ewet.connect(send);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, T);
          g.gain.exponentialRampToValueAtTime(1, T + (big ? 0.09 : 0.04)); // pipes speak softly, not struck
          g.gain.setValueAtTime(1, T + Math.max(0.05, len - 0.18));
          g.gain.exponentialRampToValueAtTime(0.0001, T + len); // the key lifts; the hall keeps ringing
          g.connect(out); g.connect(send); g.connect(echo);
          // stops: 16' · 8' · 4' · 2 2/3' · 2' · mixture (1 3/5' · 1')
          const STOPS = [[0.5, 0.2], [1, 0.32], [2, 0.2], [3, 0.09], [4, 0.09], [5, 0.035], [8, 0.03]];
          for (const [m, lvl] of STOPS) {
            const fr = f * m;
            if (fr > 9000) continue;
            const op = ctx.createOscillator(); op.type = 'sine'; op.frequency.value = fr; op.detune.value = (Math.random() - 0.5) * 6; // pipes never perfectly in tune
            const og = ctx.createGain(); og.gain.value = lvl * (o.gain ?? 1) * 0.42;
            op.connect(og); og.connect(g); op.start(T); op.stop(T + len + 0.05);
          }
          noise(f * 4, 3, 0.05 * (o.gain ?? 1), 0.05, 0); // chiff: the breath as each pipe starts to speak
          break;
        }
        case 'pluck': { // 신스 플럭: sawtooth through a closing low-pass
          const osc = ctx.createOscillator();
          const lp = ctx.createBiquadFilter();
          const g = ctx.createGain();
          const len = (big ? 0.5 : 0.25) * stretch;
          osc.type = 'sawtooth'; osc.frequency.value = (note / 2) * pitch;
          lp.type = 'lowpass'; lp.Q.value = 6;
          lp.frequency.setValueAtTime(4200, T); lp.frequency.exponentialRampToValueAtTime(300, T + len);
          g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.22, T + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          osc.connect(lp); lp.connect(g); g.connect(out);
          osc.start(T); osc.stop(T + len + 0.02);
          break;
        }
        case 'bloop': { // 물속 블룹: resonant low-pass sweep
          const osc = ctx.createOscillator();
          const lp = ctx.createBiquadFilter();
          const g = ctx.createGain();
          const len = (big ? 0.22 : 0.12) * stretch;
          osc.type = 'triangle'; osc.frequency.setValueAtTime(180 * pitch, T); osc.frequency.exponentialRampToValueAtTime(420 * pitch, T + len);
          lp.type = 'lowpass'; lp.Q.value = 14;
          lp.frequency.setValueAtTime(300, T); lp.frequency.exponentialRampToValueAtTime(1600, T + len * 0.6);
          g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.5, T + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          osc.connect(lp); lp.connect(g); g.connect(out);
          osc.start(T); osc.stop(T + len + 0.02);
          break;
        }
        case 'pop': // 뽁: bubble wrap
          noise(1800, 0.7, 1, 0.012);
          tone('sine', 240, 140, 0.35, 0.03, 0.004);
          break;
        case 'bubble': // 보글
          tone('sine', 300, 720, 0.45, 0.06);
          tone('sine', 420, 980, 0.3, 0.05, 0.05);
          break;
        case 'drop': // 물방울: rising plip
          tone('sine', 620, 1700, 0.55, 0.045);
          tone('sine', 1700, 1500, 0.15, 0.06, 0.04);
          break;
        case 'soft': // 톡
          tone('sine', 880, 700, 0.35, 0.025);
          break;
        case 'retro': // 8비트
          tone('square', note * 1.4, note * 1.4, 0.1, 0.04);
          break;
        case 'piano': // 피아노: hammer + string
          noise(3000, 1, 0.12, 0.01);
          tone('triangle', note, note, 0.32, 0.4);
          tone('sine', note * 2, note * 2, 0.1, 0.22);
          tone('sine', note * 3, note * 3, 0.04, 0.1);
          break;
        case 'laser': // 레이저
          tone('sawtooth', 1700, 220, 0.14, 0.07);
          break;
        case 'marimba': // 마림바
          tone('sine', note / 1.5, note / 1.5, 0.5, 0.25);
          tone('sine', (note / 1.5) * 4, (note / 1.5) * 4, 0.12, 0.05);
          break;
        case 'kalimba': // 칼림바
          tone('triangle', note, note, 0.35, 0.45);
          tone('sine', note * 5.4, note * 5.4, 0.06, 0.07);
          break;
        case 'glass': // 유리잔
          tone('sine', 2093, 2093, 0.18, 0.4);
          tone('sine', 2093 * 2.76, 2093 * 2.76, 0.05, 0.2);
          break;
        case 'coin': // 동전
          tone('square', 988, 988, 0.1, 0.05);
          tone('square', 1319, 1319, 0.1, 0.12, 0.05);
          break;
        case 'choir': { // 합창단: a small ensemble singing a vowel (each key a different one), in a hall
          const VOWELS = { a: [[800, 1], [1150, 0.55], [2900, 0.2]], o: [[450, 1], [800, 0.5], [2830, 0.12]], u: [[325, 1], [700, 0.35], [2530, 0.08]], e: [[400, 1], [1700, 0.45], [2600, 0.25]] };
          const vk = o.vowel || 'aoue'[(Math.random() * 4) | 0];
          const len = (big ? 1.5 : 0.5) * stretch;
          const hall = cathedral(ctx);
          const send = ctx.createGain(); send.gain.value = master.gain.value * (o.gain ?? 1) * 0.35; send.connect(hall);
          const f = (o.low ? note / 4 : note / 2) * pitch;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, T);
          g.gain.exponentialRampToValueAtTime(0.24, T + (big ? 0.1 : 0.035)); // a clear entrance, then held
          g.gain.setValueAtTime(0.24, T + len * 0.55);
          g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          g.connect(out); g.connect(send);
          const mouth = VOWELS[vk].map(([fq, lvl]) => {
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * (o.low ? 0.85 : 1); bp.Q.value = 5;
            const lg = ctx.createGain(); lg.gain.value = lvl * 9; // narrow vowel filters pass little energy: make it up here
            bp.connect(lg); lg.connect(g);
            return bp;
          });
          for (let v = 0; v < 6; v++) { // six singers, never exactly together
            const os = ctx.createOscillator(); const vib = ctx.createOscillator(); const vd = ctx.createGain();
            os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = (Math.random() - 0.5) * 22;
            vib.frequency.value = 4.6 + Math.random() * 1.4; vd.gain.value = f * 0.007;
            vib.connect(vd); vd.connect(os.frequency);
            const vg = ctx.createGain(); vg.gain.value = 1 / 6;
            os.connect(vg);
            mouth.forEach((bp) => vg.connect(bp));
            const st = T + Math.random() * 0.02;
            os.start(st); vib.start(st); os.stop(T + len + 0.05); vib.stop(T + len + 0.05);
          }
          break;
        }
        case 'gayageum': { // 가야금: a real plucked silk string on a paulownia body, then 농현 (the left hand presses and shakes it)
          // 평조 (Eb pentatonic): 황·태·중·임·남 — the mode of most 가야금 산조 / 민요
          const PYEONGJO = [311.13, 349.23, 415.3, 466.16, 523.25, 622.25];
          const f = (o.note ? o.note * (311.13 / 523.25) : PYEONGJO[(Math.random() * PYEONGJO.length) | 0]) * pitch;
          const len = (big ? 2.2 : 1.1) * stretch;
          const src = ctx.createBufferSource();
          src.buffer = pluckedString(ctx, f, { secs: 2.4, damp: 0.9965, bright: 0.35 }); // silk: soft, warm attack
          // 농현: the string rings plain for a moment, then the left hand starts a slow, deep vibrato
          const shake = ctx.createOscillator();
          const depth = ctx.createGain();
          shake.frequency.value = o.shake || 4.2;
          const vib = o.vib ?? (big ? 0.045 : 0.028); // ±½–¾ semitone: the 농현 you can hear
          depth.gain.setValueAtTime(0, T);
          depth.gain.setValueAtTime(0, T + 0.16);
          depth.gain.linearRampToValueAtTime(vib, T + 0.45);
          shake.connect(depth); depth.connect(src.playbackRate);
          src.playbackRate.setValueAtTime(1, T);
          if (o.bend) src.playbackRate.linearRampToValueAtTime(o.bend, T + 0.35); // 추성(up) · 퇴성(down)
          // the hollow paulownia body
          const body1 = ctx.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 230; body1.Q.value = 1.2; body1.gain.value = 6;
          const body2 = ctx.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 1100; body2.Q.value = 1.5; body2.gain.value = 4;
          const silk = ctx.createBiquadFilter(); silk.type = 'lowpass'; silk.frequency.value = 3600;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.55, T);
          g.gain.setValueAtTime(0.55, T + len * 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          src.connect(body1); body1.connect(body2); body2.connect(silk); silk.connect(g); g.connect(out);
          src.start(T); shake.start(T); src.stop(T + len + 0.02); shake.stop(T + len + 0.02);
          noise(1800, 1.5, 0.12, 0.012); // the finger leaving the silk
          break;
        }
        case 'bottle': { // 유리병 피리: breath across a bottle's mouth — a soft, hollow, airy tone
          const f = note * pitch;
          const len = (big ? 0.9 : 0.4) * stretch;
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vd = ctx.createGain(); vd.gain.value = f * 0.006;
          vib.connect(vd); vd.connect(o.frequency);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.36, T + 0.04); // breath builds, no strike
          g.gain.setValueAtTime(0.36, T + len * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          o.connect(g); g.connect(out);
          o.start(T); vib.start(T); o.stop(T + len + 0.02); vib.stop(T + len + 0.02);
          noise(f, 9, 0.35, len * 0.7, 0); // the air, tuned to the bottle
          noise(f * 2, 4, 0.12, 0.05, 0); // the lip's first puff
          break;
        }
        case 'musicbox': // 오르골: a tiny steel comb tine + the mechanism's tick
          tone('sine', note * 2, note * 2, 0.26, big ? 1.2 : 0.6);
          tone('sine', note * 2 * 3.01, note * 2 * 3.01, 0.05, 0.12);
          tone('sine', note * 2 * 5.8, note * 2 * 5.8, 0.02, 0.05);
          noise(6500, 3, 0.08, 0.006);
          break;
        case 'morse': // 모스 전신기: the brass key clacks and the radio beeps (dit / dah)
          noise(2800, 1.2, 0.45, 0.008);
          tone('sine', 720, 720, 0.22, big ? 0.2 : 0.07, 0.004);
          noise(900, 1, 0.25, 0.012, (big ? 0.2 : 0.07) * stretch, 'lowpass'); // key released
          break;
        case 'clock': { // 태엽 시계: tick… tock… alternating, like an escapement
          playKeySound.tock = !playKeySound.tock;
          const f = playKeySound.tock ? 1900 : 2800; // tock is lower than tick
          tone('triangle', f, f * 0.98, 0.55, big ? 0.09 : 0.055);
          tone('sine', f * 1.72, f * 1.7, 0.2, 0.03);
          noise(f * 1.4, 2.2, 0.55, 0.006);
          break;
        }
        case 'scifi': { // 홀로그램 콘솔: the console "talks" — a burst of data chirps, a ring-modulated shimmer, a holo zap
          // 1) data chatter: 3–4 tiny random tones, like a droid computing
          const chirps = big ? 6 : 3 + ((Math.random() * 2) | 0);
          for (let i = 0; i < chirps; i++) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const at = T + i * 0.021;
            osc.type = i % 2 ? 'square' : 'sine';
            const fq = (1300 + Math.random() * 2300) * pitch;
            osc.frequency.setValueAtTime(fq, at);
            osc.frequency.exponentialRampToValueAtTime(fq * (Math.random() < 0.5 ? 1.5 : 0.7), at + 0.017);
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(i % 2 ? 0.07 : 0.17, at + 0.002);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.018);
            osc.connect(g); g.connect(out);
            osc.start(at); osc.stop(at + 0.03);
          }
          // 2) the hologram flickering on: ring-modulated (metallic, unearthly) sweep
          const len = (big ? 0.35 : 0.11) * stretch;
          const car = ctx.createOscillator();
          const ringMod = ctx.createOscillator();
          const ringGain = ctx.createGain();
          const g = ctx.createGain();
          car.type = 'sine';
          car.frequency.setValueAtTime(2600 * pitch, T + 0.02);
          car.frequency.exponentialRampToValueAtTime(900 * pitch, T + 0.02 + len);
          ringMod.type = 'square'; ringMod.frequency.value = 73; // amplitude × square = ring modulation
          ringGain.gain.value = 0;
          ringMod.connect(ringGain.gain);
          g.gain.setValueAtTime(0.0001, T + 0.02);
          g.gain.exponentialRampToValueAtTime(0.09, T + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, T + 0.02 + len);
          car.connect(ringGain); ringGain.connect(g); g.connect(out);
          car.start(T + 0.02); ringMod.start(T + 0.02); car.stop(T + 0.05 + len); ringMod.stop(T + 0.05 + len);
          break;
        }
        case 'spring': { // 띠용
          const osc = ctx.createOscillator();
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          const g = ctx.createGain();
          const len = 0.2 * stretch;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300 * pitch, T);
          osc.frequency.exponentialRampToValueAtTime(520 * pitch, T + len);
          lfo.frequency.value = 26; depth.gain.value = 40;
          lfo.connect(depth); depth.connect(osc.frequency);
          g.gain.setValueAtTime(0.0001, T);
          g.gain.exponentialRampToValueAtTime(0.35, T + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, T + len);
          osc.connect(g); g.connect(out);
          osc.start(T); lfo.start(T); osc.stop(T + len + 0.02); lfo.stop(T + len + 0.02);
          break;
        }
        default:
          break;
      }
    };

    /*
     * Every key has one job, and sounds like it in every theme:
     *   key       light, the theme's basic hit
     *   space     the same voice, low and wide (a breath between words)
     *   back      quick, light, falling  (taking something back)
     *   newline   rising two-step        (carrying on to the next line)
     *   enter     the biggest, resolved  (done — sent)
     * Keyboards do it with physical parts (stabilisers, line feed, the big key);
     * the other themes do it with musical intervals.
     */
    const keyboard = KEYBOARD_SOUNDS.has(kind);
    const tonal = NOTE_SOUNDS.has(kind);
    const C5 = 523.25;
    const step = (ratio, at = 0, stretch = 1, gain = 1, big = false) =>
      (tonal ? hit({ note: C5 * ratio, at, stretch, gain, big }) : hit({ pitch: ratio, at, stretch, gain, big }));
    const sweep = (f0, f1, at, len, peak, q = 4) => { // filtered-noise slide
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t0 + at);
      f.frequency.exponentialRampToValueAtTime(f1, t0 + at + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + len * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(t0 + at); src.stop(t0 + at + len + 0.02);
    };
    const thump = (f0, f1, len, peak, at = 0) => { // low body of a big key
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0 + at);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + at + len);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g); g.connect(out);
      o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    };

    // building blocks for the percussion themes below
    const nz = (type, freq, q, peak, len, at = 0, dest = out) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0 + at); src.stop(t0 + at + len + 0.02);
    };
    const osc = (type, f0, f1, peak, len, at = 0, dest = out) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0 + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + at + len * 0.6);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g); g.connect(dest);
      o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    };

    if (kind === 'drums') {
      // 드럼 (acoustic kit): typing plays a groove around the kit (toms · ghost snares · hi-hats);
      // space = the bass drum, ⌫ = sticks clicked together, ⇧⏎ = a snare flam, ⏎ = a tom fill into kick + crash.
      // Everything is noise + skins (no oscillator "beeps"), and a small room glues the kit together.
      const room = ctx.createDelay(0.2); const rfb = ctx.createGain(); const rlp = ctx.createBiquadFilter();
      room.delayTime.value = 0.023; rfb.gain.value = 0.32; rlp.type = 'lowpass'; rlp.frequency.value = 3500;
      room.connect(rlp); rlp.connect(rfb); rfb.connect(room);
      const wet = ctx.createGain(); wet.gain.value = 0.35; rlp.connect(wet); wet.connect(out);
      const kit = ctx.createGain(); kit.gain.value = 1; kit.connect(out); kit.connect(room);
      const hat = (at = 0, peak = 0.3, open = false) => { // stick on brass: bright noise, a "chick"
        nz('highpass', 7500, 0.7, peak, open ? 0.42 : 0.06, at, kit);
        nz('bandpass', 10500, 1.4, peak * 0.6, open ? 0.3 : 0.04, at, kit);
        nz('bandpass', 4200, 2, peak * 0.25, 0.012, at, kit); // the stick tip
      };
      const kick = (at = 0, peak = 1) => { // a felt beater on a big skin: a short boom, a papery attack, no long sine tail
        osc('sine', 110, 52, peak, 0.26, at, kit);
        osc('triangle', 75, 48, peak * 0.4, 0.2, at, kit);
        nz('lowpass', 600, 0.8, 0.45 * peak, 0.04, at, kit); // the skin slap
        nz('bandpass', 2600, 1.2, 0.18 * peak, 0.008, at, kit); // the beater
      };
      const snare = (at = 0, peak = 0.65) => { // skin + the snare wires rattling underneath
        osc('triangle', 195, 178, peak * 0.55, 0.08, at, kit);
        osc('sine', 330, 300, peak * 0.25, 0.05, at, kit);
        nz('bandpass', 3000, 0.6, peak, 0.22, at, kit); // wires
        nz('highpass', 6500, 0.6, peak * 0.4, 0.12, at, kit);
      };
      const tom = (f, at = 0, peak = 0.7) => { // a tuned skin: a gentle pitch drop and a resonant ring
        osc('sine', f * 1.15, f, peak, 0.42, at, kit);
        osc('sine', f * 1.6, f * 1.5, peak * 0.2, 0.15, at, kit);
        nz('lowpass', f * 6, 0.8, peak * 0.35, 0.035, at, kit); // the stick on the skin
      };
      const crash = (at) => { nz('highpass', 4000, 0.5, 0.42, 1.9, at, kit); nz('bandpass', 6500, 0.7, 0.3, 1.5, at, kit); nz('bandpass', 9500, 1, 0.2, 1.2, at, kit); };
      if (key === 'key') {
        // a two-bar groove that advances one step per keystroke — typing turns into a beat
        const GROOVE = ['hatTom1', 'hat', 'ghost', 'hat', 'tom2', 'hat', 'ghost', 'hatOpen', 'tom1', 'hat', 'ghost', 'tom3', 'hat', 'ghost', 'tom2', 'hat'];
        playKeySound.beat = ((playKeySound.beat ?? -1) + 1) % GROOVE.length;
        const v = 0.8 + Math.random() * 0.3; // human velocity
        switch (GROOVE[playKeySound.beat]) {
          case 'hatTom1': hat(0, 0.24 * v); tom(196, 0, 0.6 * v); break;
          case 'tom1': tom(196, 0, 0.75 * v); break;
          case 'tom2': tom(147, 0, 0.75 * v); break;
          case 'tom3': tom(110, 0, 0.8 * v); break;
          case 'ghost': snare(0, 0.3 * v); break; // a soft snare tap
          case 'hatOpen': hat(0, 0.28 * v, true); break;
          default: hat(0, 0.3 * v);
        }
      } else if (key === 'space') {
        kick(0, 1.1); hat(0, 0.16);
      } else if (key === 'back') { // two wooden sticks clicked together
        nz('bandpass', 2300, 6, 0.9, 0.03, 0, kit); nz('bandpass', 3600, 5, 0.5, 0.02, 0, kit);
      } else if (key === 'newline') { // flam: a grace note just before the main snare hit
        snare(0, 0.35); snare(0.028, 0.8);
      } else { // fill: toms rolling down, then kick + snare + crash together
        tom(220, 0); tom(196, 0.07); tom(147, 0.14); tom(110, 0.21);
        kick(0.3, 1.1); snare(0.3, 0.6); crash(0.3);
      }
      return;
    }

    // play a generated buffer through a filter chain
    const playBuf = (buf, at, gain, chain = [], dest = out, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = gain;
      let node = src;
      for (const f of chain) { node.connect(f); node = f; }
      node.connect(g); g.connect(dest);
      src.start(t0 + at);
      return src;
    };
    const filt = (type, freq, q = 0.7, gain = 0) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gain; return f; };

    /*
     * Real recordings (CC0, samples.js). Once a theme's clips are decoded they take over;
     * until then (the first key or two) the synthesized version below plays instead.
     */
    const SB = sampleSet(ctx, kind);
    if (SB && Object.keys(SB).length) {
      const any = (names) => { const have = names.filter((n) => SB[n]); return have[(Math.random() * have.length) | 0]; };
      const hall = (kind === 'choir' || kind === 'holy') ? cathedral(ctx) : null;
      const sp = (name, at = 0, { rate = 1, gain = 1, dur = 0, dest = out, offset = 0, wet = 0 } = {}) => {
        const b = SB[name]; if (!b) return false;
        const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
        const g = ctx.createGain(); g.gain.value = gain;
        if (dur) { g.gain.setValueAtTime(gain, t0 + at + Math.max(0, dur - 0.03)); g.gain.linearRampToValueAtTime(0.0001, t0 + at + dur); }
        src.connect(g); g.connect(dest);
        if (wet && hall) { const s = ctx.createGain(); s.gain.value = master.gain.value * wet; g.connect(s); s.connect(hall); }
        src.start(t0 + at, offset, dur ? dur + 0.02 : undefined);
        return true;
      };
      const r = () => 0.95 + Math.random() * 0.1; // never exactly the same twice
      const PENTA = [1, 1.125, 1.26, 1.5, 1.68, 2];
      let done = false;
      switch (kind) {
        case 'meow': // the cutest kitten mews, nudged a little higher
          if (key === 'key') done = sp(any(['m1', 'm2', 'm3', 'm4']), 0, { rate: 1.04 + Math.random() * 0.12, gain: 0.6 });
          else if (key === 'space') done = sp('purr', 0, { gain: 0.7, dur: 0.9 });
          else if (key === 'back') done = sp(any(['m2', 'm3']), 0, { rate: 1.25, gain: 0.45 }); // a tiny, shy mew
          else if (key === 'newline') done = sp('prr', 0, { rate: 1.08, gain: 0.6 });
          else done = sp('long', 0, { rate: 1.06, gain: 0.65 });
          break;
        case 'frog': { // real frogs: little ribbits on letters, a bullfrog on space, the whole pond on Enter
          const rib = () => ['r1', 'r2', 'r3'][(Math.random() * 3) | 0];
          if (key === 'key') done = sp(rib(), 0, { rate: 0.94 + Math.random() * 0.14, gain: 0.6, dur: 0.45 });
          else if (key === 'space') done = sp('croak', 0, { rate: 0.78, gain: 0.65, dur: 0.9 }); // a big, deep croak
          else if (key === 'enter') {
            done = sp('croak', 0, { gain: 0.6, dur: 1.4 });
            for (let i = 0; i < 5; i++) sp(rib(), 0.15 + Math.random() * 1.0, { rate: 0.85 + Math.random() * 0.35, gain: 0.35 + Math.random() * 0.2, dur: 0.45 });
            sp('croak2', 0.7, { gain: 0.45, dur: 0.9 });
          }
          break; // ⌫ (퐁당) and ⇧⏎ (cricket) use the synthesized versions
        }
        case 'pingpong': { // real table tennis: paddle hits and table bounces, left and right
          const side = (v) => { const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(out); return p; };
          if (key === 'key') {
            playKeySound.pp = !playKeySound.pp; // the ball crosses the table every key: 탁 (paddle) ↔ 똑 (table)
            const d = side(playKeySound.pp ? -0.6 : 0.6);
            done = playKeySound.pp ? sp(Math.random() < 0.5 ? 'hit' : 'hit2', 0, { rate: 0.96 + Math.random() * 0.08, gain: 0.6, dur: 0.25, dest: d })
              : sp('table', 0, { rate: 0.97 + Math.random() * 0.06, gain: 0.6, dur: 0.25, dest: d });
          } else if (key === 'space') { // bouncing the ball before a serve: 똑 · 똑 · 똑
            done = sp('table', 0, { gain: 0.6, dur: 0.2 }); sp('table', 0.17, { gain: 0.5, dur: 0.2 }); sp('table', 0.32, { gain: 0.42, dur: 0.2 });
          }
          else if (key === 'newline') { const d = side(-0.5); done = sp('hit', 0, { gain: 0.6, dur: 0.25, dest: d }); sp('table', 0.22, { gain: 0.55, dur: 0.25, dest: side(0.5) }); }
          else if (key === 'enter') { // SMASH — then the ball bounces away
            done = sp('hit2', 0, { rate: 0.92, gain: 0.8, dur: 0.3, dest: side(-0.4) });
            let at = 0.2, gap = 0.24, g = 0.6; // the ball bouncing away: 똑 똑 똑똑똑…
            for (let i = 0; i < 8; i++) { sp('table', at, { rate: 1 + i * 0.02, gain: g, dur: 0.2, dest: side(Math.min(0.9, 0.5 + i * 0.05)) }); at += gap; gap *= 0.74; g *= 0.8; }
          }
          break; // ⌫ (the net) stays synthesized
        }
        case 'kitchen': // 주방 (real recordings): chopping, sizzling, a pot lid, boiling water, the microwave
          if (key === 'key') done = sp(any(['chop1', 'chop2', 'chop3']), 0, { rate: 0.95 + Math.random() * 0.12, gain: 0.7, dur: 0.32 });
          else if (key === 'space') done = sp('sizzle', 0, { offset: 0.15, gain: 0.55, dur: 0.75 });
          else if (key === 'back') done = sp('lid', 0, { gain: 0.6, dur: 0.6 });
          else if (key === 'newline') done = sp('boil', 0, { offset: 0.4, gain: 0.6, dur: 0.85 });
          else done = sp('ding', 0, { gain: 0.6, dur: 1.6 });
          break;
        case 'farm': // 농장 아침 (real recordings): chicks, a cow, a goose, a sheep — and the rooster
          if (key === 'key') {
            done = Math.random() < 0.75 ? sp('chick', 0, { rate: 0.9 + Math.random() * 0.3, gain: 1.1 })
              : sp('chicks', 0, { offset: Math.random() * 1.2, gain: 0.8, dur: 0.3 });
          } else if (key === 'space') done = sp('cow', 0, { gain: 0.55, dur: 1.2 });
          else if (key === 'back') done = sp('goose', 0, { gain: 0.55, dur: 0.6 });
          else if (key === 'newline') done = sp('sheep', 0, { gain: 0.6, dur: 0.8 });
          else done = sp('rooster', 0, { gain: 0.55, dur: 2.3 });
          break;
        case 'orch': { // 오케스트라 튜닝 (real recordings): violin pizzicato melody, cello, spiccato, a tuning note, the full hit
          const P = [0.75, 0.84, 1, 1.12, 1.26, 1.5];
          if (key === 'key') done = sp('pizz', 0, { rate: P[(Math.random() * P.length) | 0], gain: 0.6, dur: 0.7 });
          else if (key === 'space') done = sp('cello', 0, { offset: 0.05, gain: 0.6, dur: 1.1 });
          else if (key === 'back') done = sp('spic', 0, { rate: 1.12, gain: 1.4, dur: 0.35 });
          else if (key === 'newline') done = sp('tune', 0, { offset: 0.1, gain: 0.5, dur: 0.9 });
          else done = sp('hit', 0, { gain: 0.6, dur: 1.7 });
          break;
        }
        case 'merchant': { // 마을 주민 (Minecraft villager voices, from the local install): 흠~ · 흐음? · 으응 · 흠! · 흐음~흠!
          const pick = (base) => { const n = [1, 2, 3].filter((i) => SB[base + i]); return base + n[(Math.random() * n.length) | 0]; };
          if (key === 'key') done = sp(pick('idle'), 0, { rate: 0.98 + Math.random() * 0.1, gain: 0.55, dur: 0.5 });
          else if (key === 'space') done = sp(pick('haggle'), 0, { gain: 0.6, dur: 0.8 });
          else if (key === 'back') done = sp(pick('no'), 0, { gain: 0.6, dur: 0.7 });
          else if (key === 'newline') done = sp(pick('yes'), 0, { gain: 0.6, dur: 0.7 });
          else done = SB.death ? sp('death', 0, { gain: 0.65 }) : sp(pick('no'), 0, { rate: 0.8, gain: 0.6 }); // 제출: the villager dies
          break;
        }
        case 'horse': // real horses only
          if (key === 'key') {
            // a real gallop, a slice at a time: consecutive keys walk through the recording → 다그닥 다그닥
            const g = SB.gallop;
            if (g) {
              playKeySound.gal = ((playKeySound.gal ?? 0) + 0.3) % Math.max(0.3, g.duration - 0.35);
              done = sp('gallop', 0, { gain: 0.85, offset: playKeySound.gal, dur: 0.3 });
            }
          } else if (key === 'space') done = sp('neigh', 0, { gain: 0.65, dur: 0.85 });
          else if (key === 'back') done = sp('snort', 0, { gain: 0.7, dur: 0.6 });
          else if (key === 'newline') done = sp('snort', 0, { rate: 1.15, gain: 0.6, dur: 0.45 });
          else { done = sp('gallop', 0, { gain: 0.85, dur: 0.9 }); sp('neigh', 0.6, { gain: 0.7 }); }
          break;
        case 'scream': // quieter: a scream is loud by nature
          if (key === 'key') done = sp(any(['w1', 'w2', 'm1', 'm2', 'cartoon']), 0, { rate: r(), gain: 0.28, dur: 0.6 });
          else if (key === 'space') done = sp('man', 0, { gain: 0.3, dur: 1.0 });
          else if (key === 'back') done = sp(any(['gasp1', 'gasp2']), 0, { gain: 0.4 });
          else if (key === 'newline') done = sp('cartoon', 0, { rate: 1.15, gain: 0.28 });
          else done = sp('long', 0, { gain: 0.32 });
          break;
        case 'gun': { // clean and dry: noise-gated shots, crisp game-style handling sounds
          const clean = filt('highpass', 80); const air = filt('lowpass', 12000); clean.connect(air); air.connect(out);
          if (key === 'key') done = sp(any(['shot1', 'shot2', 'shot3']), 0, { rate: r(), gain: 0.42, dur: 0.35, dest: clean });
          else if (key === 'space') { // 장전: the magazine goes in, then the slide is racked — 탁, 철컥
            done = sp('load', 0, { gain: 0.85, dest: clean }) || sp('mag', 0, { gain: 0.8, dur: 0.4, dest: clean });
            sp('ready', 0.42, { gain: 0.8, dest: clean });
          }
          else if (key === 'back') done = sp('casing', 0, { gain: 0.7, dest: clean });
          else if (key === 'newline') done = sp('ready2', 0, { gain: 0.75, dest: clean }); // a short click-clack
          else { done = sp('shotgun', 0, { gain: 0.7, dur: 0.6, dest: clean }); sp('pump', 0.5, { gain: 0.8, dest: clean }); }
          break;
        }
        case 'gross':
          if (key === 'key') done = sp(any(['f1', 'f2', 'f3', 'f4', 'f5']), 0, { rate: r(), gain: 0.7, dur: 0.6 });
          else if (key === 'space') done = sp('burp', 0, { gain: 0.38 }); // a burp is long and loud: keep it level with the toots
          else if (key === 'back') done = sp('slurp', 0, { gain: 0.7 });
          else if (key === 'newline') done = sp('squish', 0, { gain: 0.75 });
          else done = sp('flong', 0, { gain: 0.75 });
          break;
        case 'choir': { // a clean, pitched choir note (C5) singing a pentatonic melody, in a hall
          const note = SB.c5 ? 'c5' : 'aah';
          if (key === 'key') done = sp(note, 0, { rate: PENTA[(Math.random() * PENTA.length) | 0] * 0.75, gain: 0.55, dur: 0.65, wet: 0.35 });
          else if (key === 'space') done = sp(note, 0, { rate: 0.5, gain: 0.6, dur: 0.9, wet: 0.4 });
          else if (key === 'back') { done = sp(note, 0, { rate: 0.94, gain: 0.45, dur: 0.2, wet: 0.3 }); sp(note, 0.12, { rate: 0.75, gain: 0.45, dur: 0.3, wet: 0.3 }); }
          else if (key === 'newline') { done = sp(note, 0, { rate: 0.75, gain: 0.45, dur: 0.22, wet: 0.3 }); sp(note, 0.15, { rate: 1.125, gain: 0.5, dur: 0.4, wet: 0.3 }); }
          else {
            // harmony: the voices join one by one — C4 · E4 · G4 · C5 — and hold the chord together in the hall
            [[0.5, 0], [0.63, 0.09], [0.75, 0.18], [1, 0.27]].forEach(([rt, at]) => sp(note, at, { rate: rt, gain: 0.3, dur: 1.6 - at, wet: 0.45 }));
            done = true;
          }
          break;
        }
        case 'holy': // keys stay on the organ (synth below); submitting brings the angels: a heavenly choir and a bell
          if (key === 'enter') { done = sp('angel', 0, { gain: 0.6, wet: 0.55 }); sp('bell', 0.1, { gain: 0.3, wet: 0.7 }); }
          break;
        default:
      }
      if (done) return;
    }

    const panTo = (v) => { const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(out); return p; };

    if (kind === 'pingpong') {
      // 탁구 랠리: letters = the ball flying across the table — paddle "딱" or table "똑", left and right in turn;
      // space = bouncing the ball before a serve; back = into the net; newline = a serve;
      // enter = a SMASH, then the ball bounces away across the floor, faster and softer
      const paddle = (at, peak, dest) => { // hollow wooden blade with rubber: a short dry "딱"
        osc('sine', 1350, 1150, peak, 0.035, at, dest);
        osc('triangle', 2600, 2400, peak * 0.35, 0.02, at, dest);
        nz('bandpass', 3200, 1.2, peak * 0.6, 0.012, at, dest);
      };
      const table = (at, peak, dest) => { // a celluloid ball on a hard table: higher, glassy "똑"
        osc('sine', 2300, 2100, peak, 0.03, at, dest);
        osc('sine', 4100, 3900, peak * 0.3, 0.015, at, dest);
        nz('highpass', 5000, 0.7, peak * 0.3, 0.006, at, dest);
      };
      if (key === 'key') {
        playKeySound.pp = !playKeySound.pp; // the ball goes to the other side each key
        const side = playKeySound.pp ? -0.65 : 0.65;
        if (playKeySound.pp) paddle(0, 0.5, panTo(side)); else table(0, 0.42, panTo(side));
      } else if (key === 'space') {
        const d = panTo(0); [0, 0.16, 0.3].forEach((at, i) => table(at, 0.42 - i * 0.06, d));
      } else if (key === 'back') { // into the net: a soft dull thud, the net rattling
        nz('lowpass', 900, 1, 0.45, 0.06, 0); osc('sine', 420, 300, 0.25, 0.06, 0);
        nz('bandpass', 2400, 4, 0.12, 0.12, 0.01);
      } else if (key === 'newline') { // the toss, a swish, the serve
        nz('bandpass', 1800, 1.5, 0.08, 0.12, 0); paddle(0.13, 0.55, panTo(-0.5)); table(0.3, 0.4, panTo(0.5));
      } else {
        const L = panTo(-0.4); paddle(0, 0.65, L); nz('bandpass', 2000, 0.8, 0.55, 0.03, 0, L); osc('sine', 180, 90, 0.4, 0.06, 0, L);
        table(0.14, 0.7, panTo(0.5));
        let at = 0.42, gap = 0.26, pk = 0.42;
        for (let i = 0; i < 9; i++) { table(at, pk, panTo(Math.min(0.95, 0.5 + i * 0.05))); at += gap; gap *= 0.72; pk *= 0.82; }
      }
      return;
    }

    if (kind === 'frog') {
      // 개구리 연못: letters = little frogs "개굴", space = a bullfrog "구워억", back = 퐁당 (a frog jumps in),
      // newline = a cricket, enter = the whole pond starts singing
      const croak = (at, f, rate, len, peak, { bp = 1100, q = 2, dest = out } = {}) => {
        // a frog call: a buzzy voice chopped into rapid pulses by the vocal sac
        const T0 = t0 + at;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.9, T0); o.frequency.exponentialRampToValueAtTime(f * 1.1, T0 + len * 0.4);
        o.frequency.exponentialRampToValueAtTime(f * 0.85, T0 + len);
        const chop = ctx.createGain(); chop.gain.value = 0;
        const p = ctx.createOscillator(); p.type = 'square'; p.frequency.value = rate;
        const pd = ctx.createGain(); pd.gain.value = 0.5; p.connect(pd); pd.connect(chop.gain);
        const base = ctx.createConstantSource(); base.offset.value = 0.5; base.connect(chop.gain);
        const f1 = filt('bandpass', bp, q); const f2 = filt('lowpass', bp * 2.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.012);
        g.gain.setValueAtTime(peak, T0 + len * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        o.connect(chop); chop.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest);
        o.start(T0); p.start(T0); base.start(T0); o.stop(T0 + len + 0.02); p.stop(T0 + len + 0.02); base.stop(T0 + len + 0.02);
      };
      const ribbit = (at, peak, dest) => { // 개-굴: two pulsed syllables, the second a little lower
        const f = 420 + Math.random() * 180;
        croak(at, f, 32, 0.07, peak, { dest }); croak(at + 0.1, f * 0.85, 26, 0.11, peak * 0.9, { dest });
      };
      const plop = (at, peak) => { // 퐁당: a bubble snapping shut (rising pitch) + a splash
        osc('sine', 260, 1300, peak, 0.09, at);
        nz('lowpass', 1600, 0.8, peak * 0.4, 0.18, at + 0.01);
        osc('sine', 700, 1500, peak * 0.4, 0.05, at + 0.12);
      };
      if (key === 'key') ribbit(0, 0.8, panTo((Math.random() - 0.5) * 1.2));
      else if (key === 'space') croak(0, 95, 55, 0.45, 0.75, { bp: 380, q: 1.2 });
      else if (key === 'back') plop(0, 0.6);
      else if (key === 'newline') { // 귀뚤귀뚤: a cricket's high, pure trills
        for (const at of [0, 0.2]) for (let i = 0; i < 3; i++) osc('sine', 4600, 4500, 0.4, 0.025, at + i * 0.035);
      } else {
        for (let i = 0; i < 7; i++) ribbit(Math.random() * 1.1, 0.35 + Math.random() * 0.15, panTo((Math.random() - 0.5) * 1.6));
        croak(0.25, 90, 55, 0.5, 0.7, { bp: 380, q: 1.2 }); croak(0.95, 85, 50, 0.45, 0.6, { bp: 360, q: 1.2 });
        plop(1.35, 0.5);
      }
      return;
    }

    if (kind === 'duck') {
      // 삑삑이 오리 (a squeaky rubber duck): letters = 삑!, space = a long squeeze, back = the air wheezing back in,
      // newline = 삑삑, enter = a squeaky little fanfare
      const squeak = (at, f, len, peak, { rise = 1.12, fall = 0.95 } = {}) => {
        // A rubber toy's squeaker: a small metal reed whistling — a bright, nearly pure tone with a hollow
        // rubber body around it, a quick pitch bend from the squeeze, and an uneven, rubbery wobble.
        const T0 = t0 + at;
        const body = ctx.createGain(); body.gain.value = 0;
        const wob = ctx.createBufferSource(); wob.buffer = noiseBuffer(ctx); wob.loop = true; // uneven air pressure
        const wl = filt('lowpass', 45); const wd = ctx.createGain(); wd.gain.value = 0.35; wob.connect(wl); wl.connect(wd); wd.connect(body.gain);
        const base = ctx.createConstantSource(); base.offset.value = 0.8; base.connect(body.gain);
        const parts = [['square', 1, 0.5], ['triangle', 2.0, 0.6], ['sine', 3.01, 0.25]];
        const oscs = parts.map(([type, m, lvl]) => {
          const o = ctx.createOscillator(); o.type = type;
          o.frequency.setValueAtTime(f * m * 0.82, T0);
          o.frequency.exponentialRampToValueAtTime(f * m * rise, T0 + Math.min(0.035, len * 0.3));
          o.frequency.exponentialRampToValueAtTime(f * m * fall, T0 + len);
          const lg = ctx.createGain(); lg.gain.value = lvl; o.connect(lg); lg.connect(body);
          return o;
        });
        const vib = ctx.createOscillator(); vib.frequency.value = 22; const vd = ctx.createGain(); vd.gain.value = f * 0.02; vib.connect(vd);
        oscs.forEach((o) => vd.connect(o.frequency));
        const hp = filt('highpass', 900, 0.7);
        const shape = filt('peaking', 2600, 1.2); shape.gain.value = 8; // the hollow rubber body
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.008);
        g.gain.setValueAtTime(peak * 0.85, T0 + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        body.connect(hp); hp.connect(shape); shape.connect(g); g.connect(out);
        [...oscs, vib, wob, base].forEach((n) => { n.start(T0); n.stop(T0 + len + 0.02); });
        nz('bandpass', 3800, 1.5, peak * 0.25, 0.025, at); // the puff of air as the squeaker starts
      };
      const release = (at, peak) => squeak(at, 1250, 0.13, peak, { rise: 1.02, fall: 0.8 }); // the duck sucking air back in: lower, softer
      if (key === 'key') squeak(0, 1550 + Math.random() * 350, 0.085, 0.4);
      else if (key === 'space') { squeak(0, 1500, 0.26, 0.4, { rise: 1.05, fall: 1.18 }); release(0.32, 0.28); } // a full squeeze… and let go
      else if (key === 'back') release(0, 0.32);
      else if (key === 'newline') { squeak(0, 1600, 0.07, 0.4); squeak(0.11, 1800, 0.08, 0.4); }
      else { // 빰 빠빠 빰 빰 — (쉼) — 삑 삑!
        const N = [[0, 1568, 0.15], [0.21, 1175, 0.08], [0.31, 1175, 0.08], [0.42, 1319, 0.15], [0.63, 1175, 0.15], [0.98, 1480, 0.12], [1.15, 1568, 0.2]];
        N.forEach(([at, f, len]) => squeak(at, f, len, 0.4, { rise: 1.03, fall: 0.99 }));
        release(1.42, 0.25);
      }
      return;
    }

    if (kind === 'merchant') {
      // 투덜 상인: a grumpy village trader who only talks through his nose — 흠? 흐음. 흠흠! 하아~
      // letters = short nasal "흠" with a random contour, space = a suspicious "흐으음?", back = a let-down "흐응…",
      // newline = an agreeing "흠흠", enter = a delighted "하아~!" (deal!)
      const hum = (at, f, len, peak, contour, open = false) => {
        const T0 = t0 + at;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * contour[0], T0);
        o.frequency.linearRampToValueAtTime(f * contour[1], T0 + len * 0.45);
        o.frequency.linearRampToValueAtTime(f * contour[2], T0 + len);
        const v = ctx.createOscillator(); v.frequency.value = 5.5; const vd = ctx.createGain(); vd.gain.value = f * 0.015; v.connect(vd); vd.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.03);
        g.gain.setValueAtTime(peak, T0 + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        // a closed-mouth nasal "mm" (a strong low resonance + a thin nasal ring), or an open "ah"
        const F = open ? [[750, 5, 1], [1200, 6, 0.6], [2600, 8, 0.2]] : [[260, 4, 1.2], [1050, 9, 0.25], [2200, 10, 0.08]];
        for (const [fq, q, lvl] of F) { const b = filt('bandpass', fq, q); const lg = ctx.createGain(); lg.gain.value = lvl * 3; o.connect(b); b.connect(lg); lg.connect(g); }
        g.connect(out);
        o.start(T0); v.start(T0); o.stop(T0 + len + 0.02); v.stop(T0 + len + 0.02);
      };
      const C = [[1, 1.25, 0.95], [1.2, 0.9, 0.85], [0.95, 1.1, 1.3], [1.1, 1.0, 0.8]];
      if (key === 'key') hum(0, 125 + Math.random() * 30, 0.17, 0.5, C[(Math.random() * C.length) | 0]);
      else if (key === 'space') hum(0, 120, 0.45, 0.5, [0.95, 1.0, 1.45]);
      else if (key === 'back') hum(0, 135, 0.4, 0.45, [1.15, 1.0, 0.7]);
      else if (key === 'newline') { hum(0, 130, 0.12, 0.5, [1.1, 1, 0.9]); hum(0.16, 130, 0.14, 0.5, [1.1, 1, 0.85]); }
      else { hum(0, 125, 0.18, 0.45, [1, 1.2, 1.1]); hum(0.22, 150, 0.6, 0.5, [1.1, 1.5, 1.0], true); }
      return;
    }

    // a held tone with an envelope (beeps, hums, whines, bells)
    const tone = (type, f0, f1, peak, len, at = 0, atk = 0.004) => {
      const T0 = t0 + at;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, T0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), T0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + atk);
      g.gain.setValueAtTime(peak, T0 + Math.max(atk, len * 0.8)); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
      o.connect(g); g.connect(out); o.start(T0); o.stop(T0 + len + 0.02);
    };

    if (kind === 'horse') {
      // 말 달리기: letters = hooves (다-그-닥: consecutive keys fall into a gallop), space = "이럇!",
      // ⌫ = 푸르륵 (a snort through fluttering lips), ⇧⏎ = "워워~", ⏎ = a gallop ending in a 히히히힝 whinny
      const hoof = (at, f, peak) => { // a hoof on packed earth: a hollow knock + the thud of weight + a little grit
        osc('sine', f * 1.25, f, peak, 0.05, at);
        osc('sine', f * 2.6, f * 2.5, peak * 0.3, 0.025, at);
        osc('sine', 110, 60, peak * 0.7, 0.07, at);
        nz('lowpass', 2200, 0.8, peak * 0.35, 0.02, at);
      };
      const whinny = (at, len, peak) => { // a neigh: a high voice trilling fast, sliding down
        const T0 = t0 + at;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(1100, T0); o.frequency.exponentialRampToValueAtTime(1350, T0 + len * 0.15);
        o.frequency.exponentialRampToValueAtTime(520, T0 + len);
        const tr = ctx.createOscillator(); tr.frequency.setValueAtTime(14, T0); tr.frequency.linearRampToValueAtTime(9, T0 + len);
        const td = ctx.createGain(); td.gain.value = 140; tr.connect(td); td.connect(o.frequency); // the "히히히" trill
        const am = ctx.createGain(); am.gain.value = 0.6; const ad = ctx.createGain(); ad.gain.value = 0.4; tr.connect(ad); ad.connect(am.gain);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.05);
        g.gain.setValueAtTime(peak, T0 + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        for (const [fq, lvl] of [[900, 1], [1700, 0.6], [3000, 0.25]]) { const bp = filt('bandpass', fq, 3); const lg = ctx.createGain(); lg.gain.value = lvl * 4; o.connect(bp); bp.connect(lg); lg.connect(am); }
        am.connect(g); g.connect(out);
        o.start(T0); tr.start(T0); o.stop(T0 + len + 0.02); tr.stop(T0 + len + 0.02);
      };
      if (key === 'key') {
        // 다-그-닥 · 다-그-닥: three hooves then a gap — each key is the next hoof in the pattern
        playKeySound.hoof = ((playKeySound.hoof ?? -1) + 1) % 3;
        const H = [[520, 0.55], [430, 0.45], [600, 0.7]][playKeySound.hoof];
        hoof(0, H[0] * (0.95 + Math.random() * 0.1), H[1]);
      } else if (key === 'space') {
        hoof(0, 600, 0.7); hoof(0.09, 520, 0.6); // a strong double stomp
      } else if (key === 'back') { // 푸르륵: air blown out through loose, flapping lips
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
        const lp = filt('lowpass', 900, 1.5);
        const flap = ctx.createGain(); flap.gain.value = 0.5;
        const l = ctx.createOscillator(); l.type = 'square'; l.frequency.setValueAtTime(34, t0); l.frequency.linearRampToValueAtTime(22, t0 + 0.4);
        const ld = ctx.createGain(); ld.gain.value = 0.5; l.connect(ld); ld.connect(flap.gain);
        const lips = ctx.createOscillator(); lips.type = 'sawtooth'; lips.frequency.value = 68; const lg = ctx.createGain(); lg.gain.value = 0.25; lips.connect(lg); lg.connect(lp);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1.2, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        src.connect(lp); lp.connect(flap); flap.connect(g); g.connect(out);
        src.start(t0); l.start(t0); lips.start(t0); src.stop(t0 + 0.47); l.stop(t0 + 0.47); lips.stop(t0 + 0.47);
      } else if (key === 'newline') {
        hoof(0, 430, 0.45); hoof(0.16, 400, 0.35); // slowing down
      } else { // a burst of gallop, then the whinny
        [[0, 520], [0.07, 430], [0.13, 600], [0.32, 520], [0.39, 430], [0.45, 600]].forEach(([at, f]) => hoof(at, f, 0.55));
        whinny(0.55, 0.9, 0.35);
      }
      return;
    }

    if (kind === 'scream') {
      // 비명: what makes a scream — a very high pitch, chaotic rough vocal folds (jitter + subharmonics),
      // a wide-open "아" mouth, breath, and a bit of distortion from sheer force.
      // letters = short "꺅!" shrieks, space = a low "으아악" yell, ⌫ = a sharp gasp, ⇧⏎ = a startled "히익!",
      // ⏎ = a long horror-film scream echoing down a hallway
      if (!playKeySound.crunch) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 512) - 1) * 6); playKeySound.crunch = c; }
      const hall = cathedral(ctx);
      const scream = (at, len, f0, peak, { low = false, wet = 0.25, vowel = 'a' } = {}) => {
        const T0 = t0 + at;
        const send = ctx.createGain(); send.gain.value = master.gain.value * wet; send.connect(hall);
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 0.82, T0);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.08, T0 + len * 0.15); // the pitch shoots up
        o.frequency.setValueAtTime(f0 * 1.08, T0 + len * 0.6);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.78, T0 + len); // and cracks down as breath runs out
        // jitter: the voice can't hold a steady pitch
        const jit = ctx.createOscillator(); jit.type = 'square'; jit.frequency.value = 23 + Math.random() * 20;
        const jd = ctx.createGain(); jd.gain.value = f0 * 0.045; jit.connect(jd); jd.connect(o.frequency);
        const wob = ctx.createOscillator(); wob.frequency.value = 6.5; const wd = ctx.createGain(); wd.gain.value = f0 * 0.03; wob.connect(wd); wd.connect(o.frequency);
        // roughness: subharmonic amplitude flutter (the "rasp" of a real scream)
        const rough = ctx.createGain(); rough.gain.value = 0.6;
        const sub = ctx.createOscillator(); sub.frequency.value = f0 / 2; const sd = ctx.createGain(); sd.gain.value = 0.4;
        sub.connect(sd); sd.connect(rough.gain);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + Math.min(0.03, len * 0.15));
        g.gain.setValueAtTime(peak, T0 + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        const F = vowel === 'i' ? [[350, 1], [2600, 0.8], [3400, 0.4]] : low ? [[650, 1], [1100, 0.7], [2500, 0.3]] : [[1000, 1], [1550, 0.8], [3000, 0.45]];
        const dist = ctx.createWaveShaper(); dist.curve = playKeySound.crunch;
        const dg = ctx.createGain(); dg.gain.value = 0.9;
        o.connect(rough);
        for (const [fq, lvl] of F) { const bp = filt('bandpass', fq, 3.5); const lg = ctx.createGain(); lg.gain.value = lvl * 6; rough.connect(bp); bp.connect(lg); lg.connect(dist); }
        dist.connect(dg); dg.connect(g);
        g.connect(out); g.connect(send);
        nz('bandpass', low ? 1200 : 2400, 1, peak * 0.5, len * 0.8, at, send); // breath
        for (const n of [o, jit, wob, sub]) { n.start(T0); n.stop(T0 + len + 0.03); }
      };
      const r = Math.random();
      if (key === 'key') scream(0, 0.14 + r * 0.1, 1050 + r * 450, 0.42); // 꺅!
      else if (key === 'space') scream(0, 0.45, 260, 0.5, { low: true }); // 으아악
      else if (key === 'back') { // a gasp: a sharp breath in
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
        const bp = filt('bandpass', 900, 2); bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.18);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.8, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        src.connect(bp); bp.connect(g); g.connect(out); src.start(t0); src.stop(t0 + 0.22);
      } else if (key === 'newline') scream(0, 0.2, 1500, 0.4, { vowel: 'i' }); // 히익!
      else scream(0, 1.4, 1150, 0.5, { wet: 0.7 }); // 꺄아아아악!
      return;
    }

    if (kind === 'meow') {
      // 냥냥이: a cat's voice. Cats have a short vocal tract, so their formants sit much higher than ours,
      // and a meow is a mouth opening and closing: "m" (closed) → "ee" → "aa" (open) → "ow" (closing).
      // space = purring, ⌫ = a hiss, ⇧⏎ = a questioning "mrrp?", ⏎ = a long, proud MEOW
      const meow = (at, len, f, peak) => {
        const T0 = t0 + at;
        const src = ctx.createGain(); src.gain.value = 1;
        for (const det of [0, 9]) { // two slightly different voices: a rough, animal edge
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
          o.frequency.setValueAtTime(f * 0.85, T0);
          o.frequency.exponentialRampToValueAtTime(f * 1.25, T0 + len * 0.38);
          o.frequency.exponentialRampToValueAtTime(f * 0.7, T0 + len);
          const vib = ctx.createOscillator(); vib.frequency.value = 7; const vd = ctx.createGain(); vd.gain.value = f * 0.02;
          vib.connect(vd); vd.connect(o.frequency);
          const og = ctx.createGain(); og.gain.value = 0.5;
          o.connect(og); og.connect(src);
          o.start(T0); vib.start(T0); o.stop(T0 + len + 0.02); vib.stop(T0 + len + 0.02);
        }
        // the lips: closed ("m") at first, opening wide, then closing again
        const lips = filt('lowpass', 700, 1.2);
        lips.frequency.setValueAtTime(700, T0); lips.frequency.exponentialRampToValueAtTime(5200, T0 + len * 0.3); lips.frequency.exponentialRampToValueAtTime(1800, T0 + len);
        src.connect(lips);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak * 0.4, T0 + len * 0.08); // the nasal "m"
        g.gain.exponentialRampToValueAtTime(peak, T0 + len * 0.3);
        g.gain.setValueAtTime(peak, T0 + len * 0.62); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        // cat formants: F1 ~1000–1500, F2 ~2400–3200 (much higher than a person's)
        for (const [f1, f2, f3, lvl, q] of [[900, 1500, 950, 1, 5], [2800, 2500, 1700, 0.7, 6], [4300, 4000, 3600, 0.25, 7]]) {
          const bp = filt('bandpass', f1, q);
          bp.frequency.setValueAtTime(f1, T0); bp.frequency.linearRampToValueAtTime(f2, T0 + len * 0.4); bp.frequency.linearRampToValueAtTime(f3, T0 + len);
          const lg = ctx.createGain(); lg.gain.value = lvl * 4;
          lips.connect(bp); bp.connect(lg); lg.connect(g);
        }
        const body = ctx.createGain(); body.gain.value = 0.25; lips.connect(body); body.connect(g); // keep some of the raw voice
        g.connect(out);
      };
      const r = Math.random();
      if (key === 'key') meow(0, 0.17 + r * 0.07, 760 + r * 280, 0.4); // a short "mew" — every one a little different
      else if (key === 'space') { // purr: a low, fluttering rumble on every breath
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
        const lp = filt('lowpass', 380, 1.5); const am = ctx.createGain(); am.gain.value = 0.5;
        const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 26; const ld = ctx.createGain(); ld.gain.value = 0.5;
        lfo.connect(ld); ld.connect(am.gain);
        const tone2 = ctx.createOscillator(); tone2.type = 'sawtooth'; tone2.frequency.value = 52; const tg = ctx.createGain(); tg.gain.value = 0.15;
        tone2.connect(tg); tg.connect(lp);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1.4, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        src.connect(lp); lp.connect(am); am.connect(g); g.connect(out);
        src.start(t0); lfo.start(t0); tone2.start(t0); src.stop(t0 + 0.55); lfo.stop(t0 + 0.55); tone2.stop(t0 + 0.55);
      } else if (key === 'back') { // hiss: a sharp "khhh"
        nz('highpass', 2800, 0.7, 0.55, 0.28); nz('bandpass', 5200, 2, 0.3, 0.2);
      } else if (key === 'newline') { // "mrrp?": a rolled trill rising like a question
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t0); o.frequency.exponentialRampToValueAtTime(820, t0 + 0.16);
        const trill = ctx.createGain(); trill.gain.value = 0.5;
        const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = 32; const ld = ctx.createGain(); ld.gain.value = 0.5;
        l.connect(ld); ld.connect(trill.gain);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.8, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(filt('lowpass', 2200, 1)).connect(trill); trill.connect(g); g.connect(out);
        o.start(t0); l.start(t0); o.stop(t0 + 0.2); l.stop(t0 + 0.2);
      } else meow(0, 0.55, 640, 0.48); // MEOW~
      return;
    }

    if (kind === 'whale') {
      // 고래의 노래: long sliding calls in a deep, echoing sea
      const hall = cathedral(ctx);
      const send = ctx.createGain(); send.gain.value = master.gain.value * 1.2; send.connect(hall);
      const sea = ctx.createGain(); sea.gain.value = 1; sea.connect(out); sea.connect(send);
      const call = (at, len, f0, f1, peak) => {
        for (const [type, m, lvl] of [['sine', 1, 1], ['triangle', 2, 0.25]]) {
          const o = ctx.createOscillator(); o.type = type;
          o.frequency.setValueAtTime(f0 * m, t0 + at); o.frequency.exponentialRampToValueAtTime(f1 * m, t0 + at + len);
          const vib = ctx.createOscillator(); vib.frequency.value = 5; const vd = ctx.createGain(); vd.gain.value = f0 * m * 0.015;
          vib.connect(vd); vd.connect(o.frequency);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak * lvl, t0 + at + len * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
          o.connect(g); g.connect(sea);
          o.start(t0 + at); vib.start(t0 + at); o.stop(t0 + at + len + 0.02); vib.stop(t0 + at + len + 0.02);
        }
      };
      const r = Math.random();
      if (key === 'key') { const f = 320 + r * 520; call(0, 0.3 + r * 0.15, f, f * (r < 0.5 ? 1.5 : 0.65), 0.22); }
      else if (key === 'space') call(0, 0.8, 95, 62, 0.5); // a deep moan
      else if (key === 'back') [0, 0.05, 0.09, 0.12, 0.14].forEach((at) => nz('bandpass', 3500, 4, 1.2, 0.008, at, sea)); // echolocation clicks
      else if (key === 'newline') call(0, 0.45, 260, 720, 0.25);
      else { osc('sine', 1250, 1240, 0.4, 1.2, 0, sea); call(0.25, 0.7, 180, 420, 0.3); call(0.75, 0.6, 420, 220, 0.25); } // ping… and the song
      return;
    }

    if (kind === 'gross') {
      // 더러운 소리, the clean way: cartoon-crisp body noises — clear pitch, no hissy mush.
      // letters = little "뿡 / 뽀옹" toots (each one different), space = a croaky "끄-억" burp,
      // ⌫ = slurping a straw, ⇧⏎ = a wet "철퍽", ⏎ = a long trumpeting grand finale
      const toot = (at, len, f, peak, rate) => { // a whoopee-cushion buzz: a tuned reed fluttering open and shut
        const T0 = t0 + at;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.08, T0); o.frequency.exponentialRampToValueAtTime(f * 0.78, T0 + len);
        const flap = ctx.createGain(); flap.gain.value = 0.5;
        const l = ctx.createOscillator(); l.type = 'square'; l.frequency.setValueAtTime(rate, T0); l.frequency.linearRampToValueAtTime(rate * 0.75, T0 + len);
        const ld = ctx.createGain(); ld.gain.value = 0.5;
        l.connect(ld); ld.connect(flap.gain);
        const lp = filt('lowpass', 1100, 2.5);
        const body = filt('peaking', 260, 1.5, 9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.012);
        g.gain.setValueAtTime(peak, T0 + len * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        o.connect(body); body.connect(lp); lp.connect(flap); flap.connect(g); g.connect(out);
        o.start(T0); l.start(T0); o.stop(T0 + len + 0.02); l.stop(T0 + len + 0.02);
      };
      const burp = (at, len, f) => { // a croaky "uuurp": a low voice through an "uh" mouth, rattling, closing at the end
        const T0 = t0 + at;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, T0); o.frequency.linearRampToValueAtTime(f * 1.15, T0 + len * 0.4); o.frequency.linearRampToValueAtTime(f * 0.8, T0 + len);
        const rattle = ctx.createGain(); rattle.gain.value = 0.6;
        const l = ctx.createOscillator(); l.type = 'triangle'; l.frequency.value = 34; const ld = ctx.createGain(); ld.gain.value = 0.4;
        l.connect(ld); ld.connect(rattle.gain);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(0.55, T0 + 0.05);
        g.gain.setValueAtTime(0.55, T0 + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
        for (const [a, b, lvl] of [[620, 420, 1], [1150, 800, 0.55]]) { // "uh" closing to "rp"
          const bp = filt('bandpass', a, 4.5);
          bp.frequency.setValueAtTime(a, T0); bp.frequency.linearRampToValueAtTime(b, T0 + len);
          const lg = ctx.createGain(); lg.gain.value = lvl * 3.5;
          o.connect(bp); bp.connect(lg); lg.connect(rattle);
        }
        rattle.connect(g); g.connect(out);
        o.start(T0); l.start(T0); o.stop(T0 + len + 0.02); l.stop(T0 + len + 0.02);
      };
      const r = Math.random();
      if (key === 'key') toot(0, 0.08 + r * 0.1, 95 + r * 75, 0.55, 26 + r * 18);
      else if (key === 'space') burp(0, 0.42, 95);
      else if (key === 'back') { // a straw: bubbly gurgle, then the slurp
        for (let i = 0; i < 5; i++) osc('sine', 350 + i * 90, 900 + i * 120, 0.22, 0.035, i * 0.04);
        sweep(2000, 800, 0.03, 0.18, 0.35, 6);
      } else if (key === 'newline') { // 철퍽: a wet plop
        osc('sine', 160, 620, 0.5, 0.07);
        osc('sine', 300, 120, 0.3, 0.06, 0.06);
        nz('lowpass', 1100, 1.5, 0.35, 0.04);
      } else { // the grand finale: long, wobbling, trailing off — then a tiny squeak
        toot(0, 0.9, 120, 0.6, 22);
        toot(1.0, 0.12, 230, 0.45, 40);
      }
      return;
    }

    if (kind === 'horror') {
      // 공포: letters = notes played backwards (they swell out of nothing and stop dead) in a dark hall,
      // space = a heartbeat over a sub rumble, ⌫ = metal scraping, ⇧⏎ = a whisper right behind you,
      // ⏎ = the shower-scene violins: shrieking stabs, again and again, over a crash
      const hall = cathedral(ctx);
      const send = ctx.createGain(); send.gain.value = master.gain.value * 1.1; send.connect(hall);
      const both = ctx.createGain(); both.gain.value = 1; both.connect(out); both.connect(send);
      const SCALE = [110, 116.54, 130.81, 146.83, 155.56, 174.61, 196, 207.65]; // minor with ♭2 and ♭5
      if (key === 'key') {
        const f = SCALE[(Math.random() * SCALE.length) | 0] * (Math.random() < 0.35 ? 2 : 1);
        playBuf(reverseNoteBuffer(ctx, f, 0.7), 0, 0.9, [filt('lowpass', 2600)], both);
        if (Math.random() < 0.25) playBuf(reverseNoteBuffer(ctx, f * 1.414, 0.7), 0, 0.4, [], both); // a tritone ghost
      } else if (key === 'space') {
        osc('sine', 75, 45, 1, 0.16); nz('lowpass', 120, 0.7, 0.6, 0.12);
        osc('sine', 66, 42, 0.8, 0.14, 0.2); nz('lowpass', 110, 0.7, 0.45, 0.1, 0.2);
      } else if (key === 'back') { // a blade dragged along metal
        const o = ctx.createOscillator(); const vib = ctx.createOscillator(); const vd = ctx.createGain(); const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(2900, t0); o.frequency.linearRampToValueAtTime(2300, t0 + 0.4);
        vib.frequency.value = 23; vd.gain.value = 140; vib.connect(vd); vd.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(filt('bandpass', 2600, 6)).connect(g); g.connect(both);
        o.start(t0); vib.start(t0); o.stop(t0 + 0.5); vib.stop(t0 + 0.5);
      } else if (key === 'newline') { // a breathy whisper "hhhaaa", close to the ear
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(2.2, t0 + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        for (const [fq, q] of [[650, 7], [1100, 8], [2500, 9]]) { const bp = filt('bandpass', fq, q); src.connect(bp); bp.connect(g); }
        g.connect(both);
        src.start(t0); src.stop(t0 + 0.65);
      } else {
        osc('sine', 55, 28, 1, 1.3); nz('lowpass', 180, 0.7, 0.8, 0.5); // the floor drops
        for (let s = 0; s < 6; s++) { // stab, stab, stab
          for (const f of [1318.5, 1396.9, 1480]) {
            const o = ctx.createOscillator(); const g = ctx.createGain(); const at = t0 + 0.05 + s * 0.13;
            o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.04, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.03);
            g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.07, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
            o.connect(g); g.connect(both); o.start(at); o.stop(at + 0.14);
          }
        }
      }
      return;
    }

    if (kind === 'gun') {
      // 총: letters = pistol shots, space = racking the slide (철컥), ⌫ = a spent casing bouncing on the floor,
      // ⇧⏎ = slapping a fresh magazine in, ⏎ = a shotgun blast and its pump
      if (!playKeySound.crunch) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 512) - 1) * 6); playKeySound.crunch = c; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 10; comp.attack.value = 0.001; comp.release.value = 0.15;
      const mk = ctx.createGain(); mk.gain.value = 1.6; comp.connect(mk); mk.connect(out);
      const dist = ctx.createWaveShaper(); dist.curve = playKeySound.crunch; const dg = ctx.createGain(); dg.gain.value = 0.8; dist.connect(dg); dg.connect(comp);
      const room = ctx.createDelay(0.5); const fb = ctx.createGain(); const rlp = filt('lowpass', 1800);
      room.delayTime.value = 0.09; fb.gain.value = 0.35; room.connect(rlp); rlp.connect(fb); fb.connect(room); rlp.connect(comp);
      const shot = (at, heavy) => {
        nz('highpass', 200, 0.5, 1, heavy ? 0.05 : 0.025, at, dist); // the muzzle crack
        nz('lowpass', heavy ? 700 : 1200, 0.8, 1, heavy ? 0.35 : 0.16, at, dist); // the blast
        osc('sine', heavy ? 110 : 160, 38, 1, heavy ? 0.4 : 0.18, at, dist); // the boom in your chest
        nz('bandpass', 1500, 0.8, heavy ? 0.5 : 0.35, heavy ? 0.4 : 0.22, at + 0.01, room); // off the walls
      };
      const clack = (at, f, peak, len = 0.025) => { // metal on metal
        nz('bandpass', f, 3, peak, len, at, comp);
        osc('triangle', f * 0.9, f * 0.85, peak * 0.4, len * 1.4, at, comp);
      };
      if (key === 'key') shot(0, false);
      else if (key === 'space') { clack(0, 2600, 0.8); clack(0.02, 1400, 0.5, 0.04); clack(0.14, 3200, 0.9); clack(0.155, 1800, 0.6, 0.05); } // 철-컥
      else if (key === 'back') [0, 0.1, 0.17, 0.22, 0.255].forEach((at, i) => osc('sine', 4300 - i * 60, 4250 - i * 60, 0.35 / (i + 1), 0.07, at, comp)); // ting… ting.ting
      else if (key === 'newline') { clack(0, 1100, 0.9, 0.04); osc('sine', 260, 120, 0.6, 0.08, 0, comp); clack(0.03, 2900, 0.6); } // mag in
      else { shot(0, true); clack(0.45, 1300, 0.8, 0.05); clack(0.6, 2200, 0.9, 0.04); } // BOOM … chk-chk
      return;
    }

    if (kind === 'edm') {
      // EDM: typing plays an arpeggio over a 4-chord loop (Am · F · C · G) on a bright supersaw pluck,
      // through a dotted-eighth echo and a big room — so fast typing turns into a track.
      // space = kick + sub, ⌫ = a wobble-bass "wub", ⇧⏎ = a build-up riser, ⏎ = THE DROP
      const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
      const ROOTS = [55, 43.65, 65.41, 49];
      playKeySound.edm = playKeySound.edm ?? -1;
      // the FX bus: echo (dotted 1/8 at 128 bpm ≈ 0.35 s) and a hall
      const fx = ctx.createGain(); fx.gain.value = 1;
      const echo = ctx.createDelay(1); echo.delayTime.value = 0.35;
      const efb = ctx.createGain(); efb.gain.value = 0.38;
      const elp = filt('lowpass', 3500);
      fx.connect(echo); echo.connect(elp); elp.connect(efb); efb.connect(echo);
      const ewet = ctx.createGain(); ewet.gain.value = 0.42; elp.connect(ewet); ewet.connect(out);
      const hall = cathedral(ctx); const hs = ctx.createGain(); hs.gain.value = master.gain.value * 0.35; fx.connect(hs); hs.connect(hall);
      // a pump: sustained sounds duck and swell back like a side-chained mix
      const pump = (g, at, peak, len) => {
        const T0 = t0 + at;
        g.gain.setValueAtTime(0.0001, T0); g.gain.exponentialRampToValueAtTime(peak, T0 + 0.006);
        for (let k = 0.23; k < len; k += 0.235) { g.gain.setValueAtTime(peak * 0.25, T0 + k); g.gain.linearRampToValueAtTime(peak, T0 + k + 0.17); }
        g.gain.exponentialRampToValueAtTime(0.0001, T0 + len);
      };
      const supersaw = (freqs, at, len, peak, c0, c1, pumped = false) => {
        const lp = filt('lowpass', c0, 5);
        lp.frequency.setValueAtTime(c0, t0 + at); lp.frequency.exponentialRampToValueAtTime(c1, t0 + at + len);
        const g = ctx.createGain();
        if (pumped) pump(g, at, peak, len);
        else { g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len); }
        lp.connect(g); g.connect(out); g.connect(fx);
        for (const f of freqs) {
          for (const det of [-22, -11, -4, 4, 11, 22]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
            const og = ctx.createGain(); og.gain.value = 1 / (6 * freqs.length);
            o.connect(og); og.connect(lp); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
          }
        }
      };
      const kick = (at = 0, peak = 1) => { osc('sine', 180, 44, peak, 0.34, at); osc('sine', 58, 42, peak * 0.6, 0.3, at + 0.02); nz('highpass', 4500, 0.7, 0.35 * peak, 0.006, at); };
      const clap = (at) => { [0, 0.01, 0.022].forEach((d) => nz('bandpass', 1500, 1.4, 0.55, 0.035, at + d)); nz('bandpass', 1300, 1, 0.3, 0.18, at + 0.03, fx); };
      if (key === 'key') {
        playKeySound.edm = (playKeySound.edm + 1) % 16;
        const step = playKeySound.edm;
        const chord = CHORDS[Math.floor(step / 4)];
        const ARP = [0, 2, 1, 2];
        const f = chord[ARP[step % 4]] * (step % 8 < 4 ? 2 : 4); // the arp climbs an octave every other bar
        supersaw([f], 0, 0.2, 0.42, 7500, 600);
        if (step % 4 === 0) { // each new chord: the bass moves and a soft hat ticks
          osc('sawtooth', ROOTS[Math.floor(step / 4)] * 2, ROOTS[Math.floor(step / 4)] * 2, 0.16, 0.25);
          nz('highpass', 8000, 0.7, 0.12, 0.03);
        }
      } else if (key === 'space') {
        kick(0, 1.15);
      } else if (key === 'back') { // wub: a fat bass through a wobbling filter
        const root = ROOTS[Math.max(0, Math.floor(Math.max(0, playKeySound.edm) / 4))];
        const lp = filt('lowpass', 300, 10);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 8; const ld = ctx.createGain(); ld.gain.value = 1100;
        lfo.connect(ld); ld.connect(lp.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
        for (const det of [-12, 12]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * 2; o.detune.value = det; o.connect(lp); o.start(t0); o.stop(t0 + 0.34); }
        lp.connect(g); g.connect(out); lfo.start(t0); lfo.stop(t0 + 0.34);
      } else if (key === 'newline') { // build-up: noise sweeping up, a climbing saw, a snare roll speeding up
        sweep(300, 10000, 0, 0.5, 0.9, 1.4);
        osc('sawtooth', 200, 1600, 0.12, 0.5);
        [0, 0.12, 0.22, 0.3, 0.36, 0.41, 0.45].forEach((at, i) => nz('bandpass', 1800, 1, 0.12 + i * 0.05, 0.04, at));
      } else { // THE DROP
        const step = Math.max(0, playKeySound.edm);
        const ci = Math.floor(step / 4);
        const chord = CHORDS[ci];
        kick(0, 1.25); clap(0.235); kick(0.47, 1.1); clap(0.705);
        supersaw(chord.map((f) => f * 2).concat(chord.map((f) => f * 4)), 0, 1.3, 0.55, 600, 9000, true); // the filter rips open
        for (const det of [-18, 18]) { // reese bass: two detuned saws growling against each other
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = ROOTS[ci]; o.detune.value = det;
          const lp = filt('lowpass', 420, 2); const g = ctx.createGain(); pump(g, 0, 0.32, 1.2);
          o.connect(lp); lp.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1.25);
        }
        nz('highpass', 4500, 0.5, 0.45, 1.6, 0, fx); // crash
        sweep(9000, 300, 0, 0.6, 0.5, 1.2); // impact sweep down
      }
      return;
    }

    if (kind === 'sword') {
      // 검술: letters = quick swish, space = heavy slash, ⌫ = blade slides back into the sheath,
      // ⇧⏎ = drawing the sword (shiiing), ⏎ = a full slash that clashes and rings
      const swish = (at, len, f0, f1, peak, q = 3) => { // the blade cutting air: a fast, narrow, pitched whoosh
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx); src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t0 + at); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(peak, t0 + at + len * 0.55); // swells as the blade passes closest
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t0 + at); src.stop(t0 + at + len + 0.02);
      };
      const ring = (at, peak, dec) => { // steel: inharmonic partials that ring for a while
        for (const [fq, lvl, d] of [[2350, 1, 1], [3810, 0.6, 0.8], [5230, 0.4, 0.6], [6920, 0.25, 0.4]]) osc('sine', fq, fq * 0.995, peak * lvl, dec * d, at);
      };
      const scrape = (at, len, f0, f1, peak) => { // metal sliding on metal
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx); src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 18;
        f.frequency.setValueAtTime(f0, t0 + at); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.02);
        g.gain.setValueAtTime(peak, t0 + at + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t0 + at); src.stop(t0 + at + len + 0.02);
      };
      /*
       * A real sword swing: the blade passes the ear — air pitch rises as it approaches and falls as it leaves
       * (Doppler), with a thin whistle off the edge. That up-then-down "휘익" is what makes it a swing.
       */
      const swing = (at, len, lo, hi, peak, whistle) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx); src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 6;
        f.frequency.setValueAtTime(lo, t0 + at);
        f.frequency.exponentialRampToValueAtTime(hi, t0 + at + len * 0.45); // approaching
        f.frequency.exponentialRampToValueAtTime(lo * 0.8, t0 + at + len); // passing away
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(peak, t0 + at + len * 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t0 + at); src.stop(t0 + at + len + 0.02);
        if (whistle) { // the edge sings
          const o = ctx.createOscillator(); const wg = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(hi * 0.9, t0 + at); o.frequency.exponentialRampToValueAtTime(hi * 1.15, t0 + at + len * 0.45); o.frequency.exponentialRampToValueAtTime(hi * 0.7, t0 + at + len);
          wg.gain.setValueAtTime(0.0001, t0 + at); wg.gain.exponentialRampToValueAtTime(whistle, t0 + at + len * 0.45); wg.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
          o.connect(wg); wg.connect(out); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
        }
      };
      const j = 0.88 + Math.random() * 0.24; // no two swings alike
      if (key === 'key') swing(0, 0.13 * (0.9 + Math.random() * 0.25), 700 * j, 3400 * j, 1.6, 0.06); // 휘익 — a quick light swing
      else if (key === 'space') { // a heavy two-handed cut: slower, lower, and it bites into something
        swing(0, 0.22, 380, 1800, 1.6, 0.04);
        nz('lowpass', 900, 0.8, 0.6, 0.07, 0.12); nz('bandpass', 2600, 2, 0.3, 0.04, 0.12);
      }
      else if (key === 'back') scrape(0, 0.22, 5200, 2600, 1.2); // sheathed
      else if (key === 'newline') { scrape(0, 0.32, 2400, 6200, 1.3); ring(0.3, 0.09, 0.9); } // shiiing — drawn
      else { // a big slash that meets another blade: CLANG, and the steel rings out
        swish(0, 0.15, 500, 3000, 0.6, 2.5);
        nz('highpass', 3000, 0.7, 0.8, 0.03, 0.14); // the impact
        nz('bandpass', 1800, 1.5, 0.6, 0.06, 0.14);
        ring(0.14, 0.12, 1.6);
        osc('sine', 1180, 1170, 0.08, 1.2, 0.14); // the lower body of the blade
      }
      return;
    }

    if (kind === 'fight') {
      // 격투: letters = jab, space = kick, ⌫ = guard (block spark), ⇧⏎ = dodge (whoosh), ⏎ = K.O. finisher
      if (!playKeySound.crunch) { // soft-clipping distortion: the crunch of a game hit
        const c = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; c[i] = Math.tanh(x * 6); }
        playKeySound.crunch = c;
      }
      // everything goes through a hard compressor: the hit is loud and *dense*, like a game mix
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 2; comp.ratio.value = 12; comp.attack.value = 0.001; comp.release.value = 0.12;
      const makeup = ctx.createGain();
      makeup.gain.value = 2.3;
      comp.connect(makeup); makeup.connect(out);
      const dist = ctx.createWaveShaper();
      dist.curve = playKeySound.crunch;
      dist.oversample = '2x';
      const post = ctx.createGain();
      post.gain.value = 0.85;
      dist.connect(post); post.connect(comp);
      const punch = (at = 0, heavy = false) => {
        // 1) 파열음: a full-band burst — the "팍!" — very short, very loud, then clipped
        nz('highpass', 300, 0.5, 1, heavy ? 0.018 : 0.011, at, dist);
        nz('bandpass', heavy ? 2200 : 3000, 0.6, 1, heavy ? 0.035 : 0.022, at + 0.002, dist);
        // 2) the "pop": a pitch that collapses in 25 ms — what makes a hit feel like it connects
        osc('sine', heavy ? 900 : 1300, heavy ? 110 : 180, heavy ? 1 : 0.85, 0.03, at, dist);
        // 3) the body: a low thump under it
        osc('sine', heavy ? 120 : 170, heavy ? 36 : 55, 1, heavy ? 0.36 : 0.14, at + 0.004, dist);
        if (heavy) nz('lowpass', 260, 0.7, 0.9, 0.22, at + 0.004, comp); // a heavy one shakes the floor
        // 4) the slap of skin: a bright crack on top, outside the distortion so it stays crisp
        nz('highpass', 4500, 0.7, 0.7, heavy ? 0.025 : 0.015, at, comp);
        // 5) more 파열음: a second crack right behind the first (the "팍-팍" of a game hit),
        //    a wide-band snap kept clean, and a short smack that rings off the arena
        nz('bandpass', heavy ? 1300 : 1800, 0.5, 1, heavy ? 0.05 : 0.03, at + 0.006, dist);
        nz('highpass', 1200, 0.6, 0.9, 0.008, at + 0.006, comp);
        nz('bandpass', 2600, 0.7, 0.5, 0.025, at + (heavy ? 0.045 : 0.03), dist);
        if (heavy) nz('highpass', 300, 0.5, 0.8, 0.02, at + 0.07, dist); // the follow-through
      };
      const whoosh = (at = 0, len = 0.14, peak = 0.4) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx); src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 2.5;
        f.frequency.setValueAtTime(350, t0 + at); f.frequency.exponentialRampToValueAtTime(2600, t0 + at + len * 0.7);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak, t0 + at + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t0 + at); src.stop(t0 + at + len + 0.02);
      };
      if (key === 'key') punch(0, false);
      else if (key === 'space') { whoosh(0, 0.08, 0.25); punch(0.06, true); } // a kick swings, then lands
      else if (key === 'back') { // guard: the hit is blocked — a metallic spark, no body
        osc('triangle', 2150, 2050, 0.3, 0.13); osc('triangle', 3230, 3100, 0.16, 0.09);
        nz('highpass', 6000, 0.8, 0.3, 0.03);
      } else if (key === 'newline') whoosh(0, 0.16, 1); // dodged: only air
      else { // K.O.: wind-up, a huge hit, a slow-motion boom that echoes
        whoosh(0, 0.12, 0.35);
        punch(0.1, true); punch(0.1, true);
        osc('sine', 70, 32, 0.9, 0.9, 0.1, dist);
        const echo = ctx.createDelay(1); const fb = ctx.createGain(); const lp = ctx.createBiquadFilter();
        echo.delayTime.value = 0.16; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 1400;
        post.connect(echo); echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(comp);
      }
      return;
    }

    if (key === 'key') {
      hit();
    } else if (kind === 'morse' && (key === 'space' || key === 'enter')) {
      if (key === 'space') hit({ big: true }); // a dah
      else { hit(); hit({ big: true, at: 0.12 }); hit({ at: 0.38 }); } // ·−·  ("R": received)
    } else if (kind === 'clock' && key === 'enter') {
      hit({ big: true });
      const coo = (f, at, len) => { // the cuckoo: a soft hooted pair, falling a third
        const o = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 1.04, t0 + at); o.frequency.exponentialRampToValueAtTime(f, t0 + at + 0.04);
        lp.type = 'lowpass'; lp.frequency.value = 1400;
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(lp); lp.connect(g); g.connect(out);
        o.start(t0 + at); o.stop(t0 + at + len + 0.02);
      };
      coo(784, 0.1, 0.2); coo(659, 0.32, 0.3);
    } else if (kind === 'musicbox' && key === 'enter') {
      [[1.5, 0], [1.26, 0.13], [1.5, 0.26], [2, 0.39, true]].forEach(([r, at, big]) => step(r, at, big ? 1.6 : 0.9, 1, !!big));
    } else if (kind === 'gayageum' && key !== 'key') {
      // 가야금 phrases in 평조 (C5·r maps onto Eb4·r): each key a gesture a player would make
      if (key === 'space') hit({ note: C5 * 0.5, stretch: 1.2 }); // the low 황 string
      else if (key === 'back') hit({ note: C5 * 1.125, bend: 0.94, stretch: 0.6, gain: 0.7, vib: 0.01 }); // 퇴성: the note sinks
      else if (key === 'newline') hit({ note: C5, bend: 1.06, vib: 0.02 }); // 추성: the note is pushed up
      else { // a short descending 가락 that ends on a long, deeply shaken 황
        [[1.5, 0], [1.333, 0.16], [1.125, 0.3]].forEach(([r, at]) => hit({ note: C5 * r, at, stretch: 0.55, vib: 0.012 }));
        hit({ note: C5, at: 0.46, big: true, vib: 0.06, shake: 3.6, stretch: 1.3 });
      }
    } else if (kind === 'choir' && key !== 'key') {
      if (key === 'space') hit({ note: C5 * 0.75, low: true, vowel: 'o', stretch: 1.4 }); // the basses: "오—"
      else if (key === 'back') { hit({ note: C5 * 1.26, vowel: 'e', stretch: 0.5, gain: 0.7 }); hit({ note: C5, vowel: 'u', stretch: 0.6, at: 0.07, gain: 0.6 }); } // falls back
      else if (key === 'newline') { hit({ note: C5, vowel: 'a', stretch: 0.6 }); hit({ note: C5 * 1.5, vowel: 'a', stretch: 0.8, at: 0.09 }); } // rises
      else { // "아—멘": the plagal cadence, F major then C major, the whole choir
        // the voice sings note/2: F3 · A3 · C4 ("아—") then C4 · E4 · G4 · C5 ("—멘")
        [349.23, 440, 523.25].forEach((n) => hit({ note: n, vowel: 'a', big: true, stretch: 0.55, gain: 0.7 }));
        [523.25, 659.25, 783.99, 1046.5].forEach((n) => hit({ note: n, vowel: 'e', big: true, at: 0.42, gain: 0.7 }));
      }
    } else if (kind === 'holy' && key === 'enter') {
      // "아—멘" on full organ: F major, then C major, over a deep pedal C — the cathedral rings on
      [174.61, 220, 261.63, 349.23].forEach((fq) => hit({ note: fq * 2, big: true, stretch: 0.42, gain: 0.55 }));
      [261.63, 329.63, 392, 523.25].forEach((fq) => hit({ note: fq * 2, at: 0.95, big: true, stretch: 0.75, gain: 0.55 }));
      hit({ note: 130.81 * 2, big: true, stretch: 1.2, gain: 0.6 });
    } else if (!keyboard) {
      if (key === 'space') {
        step(0.5, 0, 1.5, 0.9); // the root, an octave down
      } else if (key === 'back') {
        step(1.26, 0, 0.65, 0.9); step(1, 0.05, 0.65, 0.8); // E → C: quick, falling
      } else if (key === 'newline') {
        step(1, 0, 0.7, 0.8); step(1.5, 0.075, 0.9, 0.9); // C → G, open and going on
      } else if (key === 'enter') {
        step(1, 0, 0.8); step(1.26, 0.06, 0.8); step(1.5, 0.12, 0.9); step(2, 0.18, 1.8, 1.1, true); // C-E-G-C, resolved
      }
    } else if (key === 'space') {
      // the space bar: same switch, lower and wider, a soft thud and its stabiliser rattle
      hit({ pitch: 0.6, stretch: 1.7 });
      thump(120, 60, 0.12, 0.6);
      [0.03, 0.048].forEach((at, i) => sweep(i ? 2600 : 2100, i ? 2500 : 2000, at, 0.012, 0.3, 3));
    } else if (key === 'back') {
      // backspace: a lighter, higher double-tap that falls away
      hit({ pitch: 1.3, stretch: 0.55, gain: 0.8 });
      hit({ pitch: 1.05, stretch: 0.5, at: 0.045, gain: 0.5 });
    } else if (key === 'newline') {
      if (kind === 'typewriter') { // the line-feed lever: ratchet clicks
        hit({ pitch: 1 });
        [0.05, 0.075, 0.1].forEach((at) => sweep(3200, 3000, at, 0.01, 0.35, 6));
        sweep(500, 1600, 0.04, 0.09, 0.25, 2);
      } else { // a key, then the line rolls up
        hit({ pitch: 1 });
        sweep(800, 3800, 0.03, 0.11, 0.35);
      }
    } else if (key === 'enter') {
      if (kind === 'typewriter') { // carriage-return bell + zip
        hit({ big: true });
        hit({ pitch: 0.8, at: 0.05 });
        const bell = (f, peak, len) => {
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t0 + 0.08); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.083); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08 + len);
          osc.connect(g); g.connect(out); osc.start(t0 + 0.08); osc.stop(t0 + 0.1 + len);
        };
        bell(1760, 0.35, 0.9); bell(2640, 0.12, 0.6);
      } else { // the big key: deeper hit, a firm bottom-out
        hit({ big: true, pitch: 0.8, stretch: 1.5 });
        thump(95, 48, 0.14, 0.55, 0.008);
      }
    }
  } catch (e) { console.warn('typing sound:', e && e.message); } // audio unavailable
}

/* ---------- background image ---------- */

let bgImgEl = null;
async function updateBgImage() {
  const stageEl = $('#stage');
  if (!S.settings.bgImage) { if (bgImgEl) bgImgEl.hidden = true; return; }
  if (!bgImgEl) {
    bgImgEl = h('div', 'bgimg-layer');
    stageEl.insertBefore(bgImgEl, stageEl.firstChild);
  }
  if (!bgImgEl.dataset.loaded) {
    const data = await window.mt.bgImage.get();
    if (!data) { saveSettings({ bgImage: false }); bgImgEl.hidden = true; return; }
    bgImgEl.style.backgroundImage = `url("${data}")`;
    bgImgEl.dataset.loaded = '1';
  }
  bgImgEl.hidden = false;
  bgImgEl.style.setProperty('--dim', String(Math.max(0, Math.min(0.95, Number(S.settings.bgImageDim ?? 0.55)))));
  bgImgEl.style.setProperty('--blur', `${Math.max(0, Math.min(30, Number(S.settings.bgImageBlur) || 0))}px`);
}

/* ---------- dropdown pickers with live previews ---------- */

function previewFx(kind, el) {
  if (kind === 'none') { el.innerHTML = '<span class="pv-none">—</span>'; return () => {}; }
  const canvas = h('canvas', 'pv-canvas');
  el.appendChild(canvas);
  const W = el.clientWidth || 120;
  const H = el.clientHeight || 36;
  const fx = createFx(canvas);
  fx.size(W, H);
  let x = 12;
  const timer = setInterval(() => {
    x += 9;
    const enter = x > W - 18;
    fx.burst(kind, enter ? W / 2 : x, H / 2 + 2, { enter, k: S.settings.typingFxIntensity, cw: 7, ch: 13 });
    if (enter) x = 12;
  }, 170);
  return () => { clearInterval(timer); fx.stop(); };
}

function previewCelebrate(kind, el) {
  const canvas = h('canvas', 'pv-canvas');
  el.appendChild(canvas);
  const W = el.clientWidth || 120;
  const H = el.clientHeight || 36;
  const fx = createFx(canvas);
  fx.size(W, H);
  const go = () => runCelebration(fx, kind, W / 2, H * 0.6, W, 0.62);
  go();
  const timer = setInterval(go, 1100);
  return () => { clearInterval(timer); fx.stop(); };
}

const WG_KINDS = [
  ['orbit', '궤도', '빛이 테두리를 따라 돎'],
  ['comet', '혜성', '짧고 밝은 빛이 빠르게 돎'],
  ['rainbow', '무지개', '무지개 테두리가 회전'],
  ['pulse', '맥박', '테두리 전체가 숨쉬듯 깜빡임'],
  ['neon', '네온', '은은하게 번지는 네온 빛'],
  ['dashed', '행진 점선', '점선이 테두리를 따라 행진'],
  ['scan', '스캔', '빛줄기가 위아래로 지나감'],
  ['twin', '쌍둥이 궤도', '두 빛이 서로 마주 보며 돎'],
  ['liquid', '흐르는 물감', '색이 테두리를 따라 흘러감'],
  ['heartbeat', '심장박동', '두근-두근 두 번씩 뜀'],
  ['hud', 'HUD 모서리', '네 모서리 브래킷이 조준하듯 숨쉼'],
  ['electric', '전류', '지직거리며 튀는 전기 테두리'],
  ['aurora', '오로라', '여러 색 빛이 바깥으로 번짐'],
  ['siri', 'Siri 글로우', '파스텔 무지개 링과 바깥으로 퍼지는 부드러운 빛'],
  ['candy', '사탕 줄무늬', '사탕 막대처럼 줄무늬가 흘러감'],
  ['shimmer', '윤슬', '물결 위 햇빛처럼 하얀 반짝임이 스쳐감'],
  ['twinkle', '반짝이', '모서리와 테두리에서 별이 반짝'],
  ['neonsign', '네온사인', '가끔 지직 깜빡이는 핑크 네온 간판'],
  ['pastel', '파스텔 숨결', '파스텔 색이 천천히 흐르며 숨쉼'],
  ['prism', '프리즘', '하얀 테두리에 빨강·파랑 빛이 갈라져 일렁임'],
  ['beads', '흐르는 구슬', '빛나는 구슬이 테두리를 따라 굴러감'],
  ['ocean', '바다', '파랑·청록 물결이 흘러감'],
  ['sunrise', '일출', '따뜻한 해돋이 빛이 흘러감'],
  ['milkyway', '은하수', '보랏빛 테두리에 작은 별들이 흐름'],
  ['lava', '용암', '붉은 용암이 이글거리며 흐름'],
  ['digirain', '디지털 비', '초록 코드 줄기가 테두리를 타고 흘러내림'],
  ['firering', '불꽃 고리', '테두리 전체가 일렁이는 불길'],
  ['snake', '픽셀 뱀', '8비트 뱀이 테두리를 따라 꿈틀꿈틀 돌아감'],
  ['glacier', '빙하', '차가운 얼음빛에 서리가 반짝'],
  ['vaporwave', '베이퍼웨이브', '분홍·하늘색 레트로 그라데이션이 흐름'],
  ['train', '기차 여행', '🚂 테두리 철길을 따라 기차가 칙칙폭폭'],
  ['ants', '개미 행렬', '🐜 개미들이 줄지어 테두리를 행진'],
  ['tape', '공사 중', '🚧 노랑·검정 안전 테이프가 흐르고 경고등이 깜빡'],
  ['fuse', '도화선', '🧨 불꽃이 타닥타닥 도화선을 타고 돎'],
  ['vine', '꽃 덩굴', '🌸 덩굴 테두리에 꽃이 차례로 피고 짐'],
  ['relay', '계주 이어달리기', '🏃 육상 트랙을 따라 네 명이 바통을 이어 달림'],
  ['santa', '산타 배달', '🎅 눈 쌓인 길을 썰매로 돌며 집마다 선물을 던져 넣음'],
  ['chase', '냠냠 추격전', '😋 노란 먹보가 점을 먹으며 돌고 꼬마 유령들이 뒤쫓음'],
];
/**
 * An ant seen from above, heading right: six legs in the ant's tripod gait (front & back on one side with the
 * middle leg of the other side step together, then the other three), antennae twitching as it goes.
 */
function antSvg() {
  const body = '#c0532e';
  const leg = (cls, x, y, x2, y2) => `<g class="${cls}" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y}L${(x + x2) / 2 + (x2 > x ? 0.6 : -0.6)} ${(y + y2) / 2}L${x2} ${y2}"/></g>`;
  return '<svg class="ant" viewBox="0 0 22 14" fill="none" stroke="#5a2412" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round">'
    + leg('ta', 12, 7, 15.5, 1.6) + leg('tb', 12, 7, 15.5, 12.4) + leg('tb', 11, 7, 11, 1.2) + leg('ta', 11, 7, 11, 12.8) + leg('ta', 10, 7, 6.8, 1.8) + leg('tb', 10, 7, 6.8, 12.2)
    + '<g class="an"><path d="M17.6 6.2Q19.6 3.6 21.2 3.4M17.6 7.8Q19.6 10.4 21.2 10.6"/></g>'
    + `<ellipse cx="5.2" cy="7" rx="3.9" ry="2.8" fill="${body}" stroke="none"/><ellipse cx="11.2" cy="7" rx="2.5" ry="1.7" fill="${body}" stroke="none"/>`
    + `<circle cx="16" cy="7" r="2.1" fill="${body}" stroke="none"/><ellipse cx="4.2" cy="6" rx="1.3" ry=".7" fill="#e8885f" stroke="none"/></svg>`;
}
/** 산타 배달: Santa in his sleigh, pulled by a red-nosed reindeer (side view, heading right). */
function santaSvg() {
  return '<svg class="sleigh" viewBox="0 0 54 22" fill="none" stroke-linecap="round" stroke-linejoin="round">'
    // reindeer
    + '<g class="rd"><g class="rd-l1"><path d="M38 14.5 37 20M44 14.5 45.4 20" stroke="#6b4423" stroke-width="1.5"/></g>'
    + '<g class="rd-l2"><path d="M39.5 14.5 40.6 20M42.6 14.5 41.6 20" stroke="#5a3a1e" stroke-width="1.5"/></g>'
    + '<ellipse cx="41" cy="12.4" rx="5.4" ry="3.2" fill="#8b5a2b"/><path d="M45.6 11 47.6 6.8" stroke="#8b5a2b" stroke-width="2.4"/>'
    + '<ellipse cx="48.8" cy="6.2" rx="2.6" ry="1.9" fill="#8b5a2b"/>'
    + '<path d="M47.4 4.6 46.4 1.4 45 .9M46.6 2.6 47.8 1M49 4.4 49.6 1.2 51 .6" stroke="#c9a46b" stroke-width=".9"/>'
    + '<circle class="rd-nose" cx="51.3" cy="6.6" r="1.25" fill="#ff3b3b"/><circle cx="49.2" cy="5.6" r=".45" fill="#1b1b1b"/></g>'
    // reins
    + '<path d="M28 9.8Q34 7.4 38.6 10.6" stroke="#c9a46b" stroke-width=".7"/>'
    // sleigh + Santa
    + '<path d="M6 21H27q3 0 3.4-2.6" stroke="#f2c14e" stroke-width="1.2"/>'
    + '<path d="M7 11.4h19.4q1.6 0 1.4 1.8l-.9 5.4H9.4Q7 18.6 6.4 15.8z" fill="#d6283b"/><path d="M7.4 12.6h19.2" stroke="#f2c14e" stroke-width=".8"/>'
    + '<path d="M9 18.6 8 21M24.6 18.6 25.4 21" stroke="#f2c14e" stroke-width=".9"/>'
    + '<ellipse cx="11.2" cy="9.6" rx="3.2" ry="2.8" fill="#8a5a32"/>' // the sack
    + '<path d="M15.6 11.6q.2-5.6 3.6-5.6t3.6 5.6z" fill="#d6283b"/>' // Santa's coat
    + '<circle cx="19.2" cy="4.2" r="2.2" fill="#ffd8b0"/><path d="M17.2 4.6q2 3.6 4 0" fill="#fff"/>' // face + beard
    + '<path d="M16.8 3.4Q18 .2 21.6 2.6l-.4.9z" fill="#d6283b"/><circle cx="21.8" cy="2.8" r=".8" fill="#fff"/><path d="M16.8 3.4h4.6" stroke="#fff" stroke-width=".9"/>'
    + '</svg>';
}
const HOUSE_COLORS = [['#e8d5b7', '#a33a2b'], ['#bcd9f2', '#33507a'], ['#f5c6a5', '#8a4b2d'], ['#d7e8c8', '#456b3a'], ['#f2e1a8', '#8f3f3f'], ['#e3cff0', '#5b3f7a'], ['#ffd6d6', '#2f6f6a'], ['#d9e2ec', '#7a4a1e']];
/** A little house with snow on the roof, a lit window and a chimney. */
function houseSvg(i) {
  const [wall, roof] = HOUSE_COLORS[i % HOUSE_COLORS.length];
  return '<svg class="house" viewBox="0 0 24 24">'
    + `<rect x="15.6" y="3.4" width="3" height="6" fill="${roof}"/><rect x="15.2" y="2.4" width="3.8" height="1.6" rx=".8" fill="#fff"/>`
    + `<path d="M1.6 12.4 12 3.6l10.4 8.8z" fill="${roof}"/><path d="M1.2 12.6 12 3.4 22.8 12.6q-2.2.4-3.4-1.2-1.6 1.4-3-.4-1.8 1.4-3.6-.2-1.6 1.4-3.4.2-1.6 1.2-3.2-.2-1.4 1.6-3 .8z" fill="#fff"/>`
    + `<rect x="3.6" y="12" width="16.8" height="10.4" fill="${wall}"/><rect x="5.8" y="14.6" width="4.6" height="4" rx=".4" fill="#ffd866"/>`
    + '<path d="M8.1 14.6v4M5.8 16.6h4.6" stroke="rgba(0,0,0,.25)" stroke-width=".5"/><rect x="13.4" y="15.4" width="4.4" height="7" rx="2.2" fill="#6b4423"/>'
    + '<rect x="2.8" y="21.8" width="18.4" height="1.6" rx=".8" fill="#fff"/></svg>';
}
/** 냠냠 추격전 cast: the chomper, and the little ghosts chasing it. */
function chomperSvg() {
  const body = '#ffd43b';
  const eye = '<circle cx="9.4" cy="5.8" r="1.3" fill="#10241c"/><circle cx="9.8" cy="5.4" r=".45" fill="#fff"/>';
  return '<svg class="ch" viewBox="0 0 20 20">'
    + `<g class="cf"><path d="M10 10 19.4 5.6A9.6 9.6 0 1 0 19.4 14.4Z" fill="${body}"/>${eye}</g>`
    + `<g class="cf"><path d="M10 10 19.6 8.6A9.6 9.6 0 1 0 19.6 11.4Z" fill="${body}"/>${eye}</g></svg>`;
}
function critterSvg(color) {
  return `<svg class="cr" viewBox="0 0 20 20"><path d="M2.4 18.6V9.6a7.6 7.6 0 0 1 15.2 0v9l-2.5-2-2.5 2-2.6-2-2.6 2-2.5-2z" fill="${color}"/>`
    + '<ellipse cx="7.2" cy="9" rx="2.5" ry="2.9" fill="#fff"/><ellipse cx="13" cy="9" rx="2.5" ry="2.9" fill="#fff"/>'
    + '<circle class="cr-p" cx="8.3" cy="9.4" r="1.25" fill="#1a1d26"/><circle class="cr-p" cx="14.1" cy="9.4" r="1.25" fill="#1a1d26"/>'
    + '<path d="M8.8 13.6q1.2.9 2.4 0" stroke="#1a1d26" stroke-width=".9" fill="none" stroke-linecap="round"/></svg>';
}
/*
 * A runner drawn the way animators do it: an 8-frame run cycle (contact → down → passing → toe-off →
 * kick → recovery → knee drive → reach), legs half a cycle apart, arms swinging against the legs, the body
 * rising in the flight phase. Joint positions are relative to the hip / shoulder; the far limbs are darker.
 */
const RUN_LEG = [[2.8, 3.4, 2.6, 8.6], [1.6, 4.2, 0.6, 8.8], [-0.6, 4.4, -1.6, 9], [-2.4, 3.8, -4.6, 7.6], [-2.8, 3, -6.2, 4.4], [-0.6, 2.8, -3.6, 3.6], [2.2, 2, 0.8, 5.6], [3.4, 2.6, 4.4, 6.6]];
const RUN_ARM = [[-2.2, 3, -1.2, 5.6], [-1.6, 3.4, 0.2, 5.6], [-0.4, 3.6, 1.8, 5], [1, 3.4, 3.4, 3.6], [1.8, 3, 4.2, 2], [1, 3.4, 3.2, 3.8], [-0.6, 3.6, 1.4, 5.2], [-1.8, 3.2, -0.6, 5.8]];
const RUN_BOB = [0.6, 0.9, 0.4, -0.2, -0.7, -0.5, 0, 0.3];
function runnerSvg(color) {
  const f = (n) => n.toFixed(1);
  const seg = (x0, y0, p) => `M${f(x0)} ${f(y0)}L${f(x0 + p[0])} ${f(y0 + p[1])}L${f(x0 + p[2])} ${f(y0 + p[3])}`;
  let frames = '';
  for (let i = 0; i < 8; i++) {
    const dy = RUN_BOB[i];
    const hx = 9.6, hy = 13 + dy, sx = 11.2, sy = 7.6 + dy;
    const far = seg(hx, hy, RUN_LEG[(i + 4) % 8]) + seg(sx, sy, RUN_ARM[(i + 4) % 8]);
    const near = seg(hx, hy, RUN_LEG[i]) + seg(sx, sy, RUN_ARM[i]);
    const bx = sx + RUN_ARM[i][2], by = sy + RUN_ARM[i][3];
    frames += `<g class="rf" style="animation-delay:calc(var(--cyc, .56s) * ${(-i / 8).toFixed(3)})">`
      + `<path d="${far}" stroke="${rgbHex(mixRgb(hexRgb(color), [0, 0, 0], 0.38))}"/>`
      + `<path d="M${sx} ${f(sy)}L${hx} ${f(hy)}"/><circle cx="12.5" cy="${f(4.1 + dy)}" r="2.6" fill="${color}" stroke="none"/>`
      + `<path d="${near}"/><path class="bt" d="M${f(bx - 1.6)} ${f(by + 1)}L${f(bx + 1.8)} ${f(by - 1.2)}" stroke="#ffe066" stroke-width="2.2"/></g>`;
  }
  // ready stance: knees soft, leaning a little forward, waiting for the baton
  const dark = rgbHex(mixRgb(hexRgb(color), [0, 0, 0], 0.38));
  const idle = `<g class="ri"><path d="M9.6 13.4L8.4 18.2L7.4 22.6M11.6 8L10.4 11.6L11.2 14.4" stroke="${dark}"/>`
    + `<path d="M11.4 8L9.6 13.4"/><circle cx="12.8" cy="4.6" r="2.6" fill="${color}" stroke="none"/>`
    + `<path d="M9.6 13.4L11.6 18L12.4 22.6M11.4 8.2L13 11.6L14.2 13.6"/></g>`;
  return `<svg class="rn" viewBox="0 0 20 24" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><g class="rr">${frames}</g>${idle}</svg>`;
}
const WG_RUNNERS = {
  train: () => ['🚂', '🚃', '🚃', '🚃'].map((e, i) => `<em style="--k:${i}">${e}</em>`).join('') + [0, 1, 2].map((p) => `<em class="wr-smoke" style="--p:${p}">☁️</em>`).join(''),
  ants: () => Array.from({ length: 9 }, (_, i) => `<em class="wr-ant" style="--k:${i}">${antSvg()}</em>`).join(''),
  tape: () => '<b class="wr-c c0">⚠️</b><b class="wr-c c1">⚠️</b><b class="wr-c c2">🚧</b><b class="wr-c c3">🚧</b>',
  fuse: () => '<em class="wr-spark" style="--k:0">✨</em><em class="wr-ember" style="--k:1"></em><em class="wr-ember" style="--k:2"></em><em class="wr-ember" style="--k:3"></em>',
  relay: () => ['#ff5d5d', '#4dabf7', '#51cf66', '#fcc419'].map((c, k) => `<em class="wr-runner e${k}" style="--k:${k}">${runnerSvg(c)}</em>`).join(''),
  chase: () => Array.from({ length: 44 }, (_, i) => `<em class="wr-dot" style="--d:${(i * 100 / 44).toFixed(2)}"></em>`).join('')
    + `<em class="wr-chomp">${chomperSvg()}</em>`
    + ['#ff6b9a', '#4dd4ff', '#ffa94d'].map((c, k) => `<em class="wr-critter" style="--k:${k + 1}">${critterSvg(c)}</em>`).join(''),
  santa: () => '<em class="wr-santa">' + santaSvg() + '</em>' + Array.from({ length: 8 }, (_, i) => `<b class="wr-house" data-i="${i}">${houseSvg(i)}</b>`).join(''),
  vine: () => ['🌸', '🌼', '🌷', '🌸', '🌺', '🌼', '🌷', '🌸'].map((e, i) => `<b class="wr-f" style="--k:${i};--d:${(i * 12.5 + 4).toFixed(1)}%">${e}</b>`).join('')
    + ['🍃', '🍃', '🍃', '🍃'].map((e, i) => `<b class="wr-leaf" style="--d:${(i * 25 + 15).toFixed(1)}%">${e}</b>`).join(''),
};
/** Keep the runner layer of a pane (or a preview) in step with its frame style. */
function syncRunners(el, style, on) {
  let layer = el.querySelector(':scope > .wg-run');
  const make = on && WG_RUNNERS[style];
  if (!make) { layer?.remove(); return; }
  if (layer && layer.dataset.style === style) return;
  if (!layer) { layer = document.createElement('div'); layer.className = 'wg-run'; el.appendChild(layer); }
  layer.dataset.style = style;
  layer.innerHTML = make();
  const fit = style === 'relay' ? relayGeometry : style === 'santa' ? santaGeometry : RUN_CFG[style] ? runnerGeometry : null;
  if (style === 'santa') startSantaRound(layer);
  if (fit) {
    fit(layer);
    // the pane resized (window, split, sidebar…): re-measure the track instead of letting it fall apart
    let last = '';
    let raf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(raf); // a drag-resize fires many times: re-measure once per frame
      raf = requestAnimationFrame(() => { const k = layer.clientWidth + 'x' + layer.clientHeight; if (k !== last && layer.clientWidth && layer.clientHeight) { last = k; fit(layer); } });
    }).observe(layer);
  }
}
/*
 * 계주: each runner runs one edge (top → right → bottom → left) in a quarter of the lap. To keep the feet from
 * sliding, the lap time follows the pane's size and each runner's stride rate follows its edge's length.
 */
/*
 * Frames whose actors travel the border keep a real speed (px/s) and real gaps (px) between them, whatever the
 * pane's size: a train stays coupled, ants stay in file. On a resize the track is re-measured and everyone carries
 * on from the same point of the lap (no jump, no restart).
 *   speed: px per second · gap: px between consecutive actors (sign = ahead / behind) · vars: which CSS vars to set
 */
const RUN_CFG = {
  train: { speed: 70, gap: 24, dur: '--dur', gapVar: '--gap' }, // cars trail behind the engine
  ants: { speed: 30, gap: -32, dur: '--dur', gapVar: '--gap' },
  fuse: { speed: 95, gap: 6, dur: '--dur', gapVar: '--gap' },
  chase: { speed: 80, gap: 30, dur: '--T', gapVar: '--cgap' },
};
function runnerGeometry(layer) {
  const cfg = RUN_CFG[layer.dataset.style];
  const W = layer.clientWidth;
  const H = layer.clientHeight;
  if (!cfg || !W || !H) return;
  const small = !!layer.closest('.pv-pane'); // settings previews run slower and closer
  const speed = cfg.speed * (small ? 0.35 : 1);
  const gap = cfg.gap * (small ? 0.35 : 1);
  const P = 2 * (W + H);
  const dur = P / speed;
  const MOVE = new Set(['wgRun', 'chDot']);
  const moving = () => layer.getAnimations({ subtree: true }).filter((an) => MOVE.has(an.animationName));
  const oldDur = parseFloat(layer.style.getPropertyValue(cfg.dur)) || 0;
  let phase = null;
  if (oldDur) { const ref = moving()[0]; if (ref && ref.currentTime != null) phase = (ref.currentTime / 1000 % oldDur) / oldDur; }
  layer.style.setProperty(cfg.dur, `${dur.toFixed(3)}s`);
  layer.style.setProperty(cfg.gapVar, `${(gap / speed).toFixed(3)}s`);
  if (phase != null) { getComputedStyle(layer).getPropertyValue(cfg.dur); for (const an of moving()) an.currentTime = phase * dur * 1000; }
}

/*
 * 산타 배달: the sleigh drives the road (the border) at a steady speed; six houses stand just inside the road.
 * Whenever the sleigh comes up to a house, Santa throws a present — it arcs in, the house bounces.
 * On a resize the houses are re-placed along the new road and the sleigh carries on from the same point.
 */
function roadPoint(W, H, f, inset) { // a point on the road (a rectangle inset from the layer), going clockwise from top-left
  const w = W - 2 * inset, h = H - 2 * inset, P = 2 * (w + h);
  let d = ((f % 1) + 1) % 1 * P;
  if (d < w) return { x: inset + d, y: inset, edge: 0 };
  d -= w; if (d < h) return { x: W - inset, y: inset + d, edge: 1 };
  d -= h; if (d < w) return { x: W - inset - d, y: H - inset, edge: 2 };
  d -= w; return { x: inset, y: H - inset - d, edge: 3 };
}
function santaGeometry(layer) {
  const W = layer.clientWidth;
  const H = layer.clientHeight;
  if (!W || !H) return;
  const small = !!layer.closest('.pv-pane');
  const speed = small ? 40 : 140;
  const P = 2 * (W + H);
  const T = P / speed;
  const sleigh = layer.querySelector('.wr-santa');
  const anim = () => sleigh && sleigh.getAnimations().find((an) => an.animationName === 'wgRun');
  const oldT = parseFloat(layer.style.getPropertyValue('--T')) || 0;
  let phase = null;
  if (oldT) { const an = anim(); if (an && an.currentTime != null) phase = (an.currentTime / 1000 % oldT) / oldT; }
  layer.style.setProperty('--T', `${T.toFixed(3)}s`);
  if (phase != null) { getComputedStyle(layer).getPropertyValue('--T'); const an = anim(); if (an) an.currentTime = phase * T * 1000; }
  // houses: just inside the road, always upright
  const road = small ? 2 : 4;
  layer.querySelectorAll('.wr-house').forEach((hs) => {
    // two houses on every side of the road, at a third and two thirds of that side
    const i = +hs.dataset.i;
    const rw = W - 2 * road, rh = H - 2 * road, RP = 2 * (rw + rh);
    const sideStart = [0, rw, rw + rh, 2 * rw + rh][i >> 1];
    const sideLen = [rw, rh, rw, rh][i >> 1];
    const f = (sideStart + sideLen * (i % 2 ? 0.68 : 0.32)) / RP;
    const p = roadPoint(W, H, f, road);
    const sz = hs.offsetWidth || 24;
    // ON the road, its outer side flush with the road's outer edge: never past the screen's edge
    const m = small ? 0.5 : 1;
    let x = p.x - sz / 2, y = p.y - sz / 2;
    if (p.edge === 0) y = m; else if (p.edge === 2) y = H - sz - m; else if (p.edge === 1) x = W - sz - m; else x = m;
    x = Math.max(m, Math.min(W - sz - m, x)); y = Math.max(m, Math.min(H - sz - m, y));
    hs.style.left = `${x.toFixed(1)}px`; hs.style.top = `${y.toFixed(1)}px`;
    hs.dataset.f = f;
  });
}
function startSantaRound(layer) {
  if (layer.santaTimer) return;
  let prev = -1;
  const thrown = new Set();
  layer.santaTimer = setInterval(() => {
    if (!layer.isConnected) { clearInterval(layer.santaTimer); return; }
    const sleigh = layer.querySelector('.wr-santa');
    const an = sleigh && sleigh.getAnimations().find((a) => a.animationName === 'wgRun');
    const T = parseFloat(layer.style.getPropertyValue('--T'));
    if (!an || an.currentTime == null || !T) return;
    const f = (an.currentTime / 1000 % T) / T;
    if (prev >= 0 && f < prev) thrown.clear(); // a new lap: everyone gets a present again
    for (const hs of layer.querySelectorAll('.wr-house')) {
      const at = parseFloat(hs.dataset.f) - 0.025; // throw a little before passing the house
      if (!thrown.has(hs) && prev >= 0 && prev < at && f >= at) { thrown.add(hs); throwGift(layer, sleigh, hs); }
    }
    prev = f;
  }, 60);
}
function throwGift(layer, sleigh, house) {
  const L = layer.getBoundingClientRect();
  const a = sleigh.getBoundingClientRect();
  const b = house.getBoundingClientRect();
  const x0 = a.left + a.width * 0.35 - L.left, y0 = a.top + a.height / 2 - L.top;
  const x1 = b.left + b.width / 2 - L.left, y1 = b.top + b.height * 0.55 - L.top;
  // tossed: up in an arc, then down onto the house
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - Math.min(36, Math.max(18, Math.abs(x1 - x0) * 0.4));
  const g = document.createElement('i');
  g.className = 'wr-gift';
  g.textContent = '🎁';
  layer.appendChild(g);
  const sz = parseFloat(getComputedStyle(g).fontSize) || 14;
  const at = (x, y, r, sc) => ({ transform: `translate(${(x - sz / 2).toFixed(1)}px, ${(y - sz / 2).toFixed(1)}px) rotate(${r}deg) scale(${sc})` });
  g.animate([at(x0, y0, 0, 0.6), at(mx, my, 200, 1.15), at(x1, y1, 400, 0.7)], { duration: 650, easing: 'cubic-bezier(.35,.1,.6,1)' }).onfinish = () => {
    g.remove();
    house.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.25,.8)' }, { transform: 'scale(.9,1.18) translateY(-12%)' }, { transform: 'scale(1.06,.96)' }, { transform: 'scale(1,1)' }],
      { duration: 520, easing: 'ease-out' });
    const sp = document.createElement('i');
    sp.className = 'wr-gift wr-twinkle';
    sp.textContent = '✨';
    layer.appendChild(sp);
    // one transform for position AND size (a separate scale would scale the offset too and fling it across the pane)
    const pos = `translate(${(x1 - sz / 2).toFixed(1)}px, ${(y1 - sz).toFixed(1)}px)`;
    sp.style.transform = pos;
    sp.animate([{ opacity: 1, transform: `${pos} scale(.4)` }, { opacity: 1, transform: `${pos} scale(1.3)`, offset: 0.4 }, { opacity: 0, transform: `${pos} scale(1)` }], { duration: 600 }).onfinish = () => sp.remove();
  };
}

function relayGeometry(layer) {
  /*
   * 계주: four runners, one edge each (top → right → bottom → left); the next one starts when the baton
   * arrives, the one who handed it over walks back to their own corner and waits. Everything is measured from
   * the pane's current size, so a resize just re-measures the track (positions are fractions of it).
   */
  /*
   * Resizes come from everywhere — the window (drag, maximize, snap, fullscreen), the sidebar (toggle or drag),
   * splitting / unsplitting / the project grid / zooming a pane, the zoom bar, UI zoom, moving to a monitor with
   * another scale, a pane hidden and shown again. The ResizeObserver on this layer catches them all; here we
   * re-measure and keep the race where it was: the baton stays with the same runner at the same point of their
   * leg (only the track under them got longer or shorter). A hidden pane (0×0) is simply skipped until it's back.
   */
  const W = layer.clientWidth;
  const H = layer.clientHeight;
  if (!W || !H) return;
  layer.querySelector(':scope > style')?.remove();
  const RACE = new Set(['wgLeg5', 'wgRunVis', 'wgIdleVis', 'wgBaton']);
  const race = () => layer.getAnimations({ subtree: true }).filter((an) => RACE.has(an.animationName));
  const oldT = parseFloat(layer.style.getPropertyValue('--T')) || 0;
  let phase = null; // where the race is, as a fraction of a lap
  if (oldT) { const ref = race()[0]; if (ref && ref.currentTime != null) phase = (ref.currentTime / 1000 % oldT) / oldT; }
  const runners = layer.querySelectorAll('.wr-runner');
  const size = parseFloat(getComputedStyle(runners[0]).width) || 28;
  const P = 2 * (W + H);
  const stride = size * 1.25; // ground covered per running cycle
  const speed = stride / 0.38; // px per second (a brisk pace)
  const T = P / speed; // one lap of the baton
  layer.style.setProperty('--T', `${T.toFixed(2)}s`);
  const edges = [W, H, W, H];
  let at = 0;
  runners.forEach((r, k) => {
    r.style.animation = ''; // the stylesheet's relay timing (wgLeg5 & co.)
    r.querySelectorAll('.rr, .bt, .ri').forEach((el) => { el.style.animation = ''; });
    const len = edges[k];
    r.style.setProperty('--s', `${((at / P) * 100).toFixed(3)}%`);
    r.style.setProperty('--e', `${(((at + len) / P) * 100).toFixed(3)}%`);
    r.style.setProperty('--cyc', `${(stride / (len / (T / 4))).toFixed(3)}s`); // stride rate matched to this edge's speed
    at += len;
  });
  if (phase != null) { // continue the same race on the re-measured track (no jump, no restart)
    getComputedStyle(layer).getPropertyValue('--T'); // apply the new timing first
    for (const an of race()) an.currentTime = phase * T * 1000;
  }
}
window.addEventListener('resize', () => document.querySelectorAll('.wg-run[data-style="relay"]').forEach(relayGeometry));
function previewGlow(kind, el) {
  el.innerHTML = `<span class="pv-pane" data-wg="${kind}"><i></i><i></i><i></i></span>`;
  syncRunners(el.querySelector('.pv-pane'), kind, true);
  return () => {};
}

function previewSound(kind, el) {
  kind = SOUND_ALIASES[kind] || kind;
  if (kind === 'none') { el.innerHTML = '<span class="pv-none">—</span>'; return () => {}; }
  el.innerHTML = `<button type="button" class="pv-play" title="들어보기">${icon('play')}<span>들어보기</span><i></i><i></i><i></i></button>`;
  const btn = el.querySelector('.pv-play');
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // play only — don't select / open
    btn.classList.add('playing');
    // a natural little phrase: "hello world" ⇧⏎ "ok" ⏎ — typing rhythm with human-like timing
    const seq = [];
    let at = 0;
    const type = (n) => { for (let i = 0; i < n; i++) { seq.push([at, 'key']); at += 105 + Math.random() * 45; } };
    type(5); // hello
    seq.push([at, 'space']); at += 150;
    type(5); // worle — a typo…
    at += 180;
    seq.push([at, 'back']); at += 170; // …erased
    type(1); // d
    at += 260;
    seq.push([at, 'newline']); at += 380; // Shift+Enter, then a breath
    type(2); // ok
    at += 300;
    seq.push([at, 'enter']); // submit
    seq.forEach(([ms, k]) => setTimeout(() => playKeySound(kind, k, true), ms));
    clearTimeout(btn.playTimer);
    btn.playTimer = setTimeout(() => btn.classList.remove('playing'), at + 400);
  });
  return () => {};
}

function previewCursor(kind, el) {
  el.innerHTML = `<span class="pv-term"><span class="pv-text">hello</span><span class="pv-cur-wrap"><span class="pv-cur mt-cursor kind-${kind}${NATIVE_CURSORS[kind] ? ' native' : ''}"></span></span></span>`;
  return () => {};
}

function previewBg(kind, el) {
  if (kind === 'none') { el.innerHTML = '<span class="pv-none">—</span>'; return () => {}; }
  const canvas = h('canvas', 'pv-canvas bg-pv');
  el.appendChild(canvas);
  const bg = createBg(canvas);
  bg.size(el.clientWidth || 120, el.clientHeight || 36);
  bg.set(kind);
  return () => bg.stop();
}

/**
 * Dropdown with an animated example in every row.
 * opts: { key, items: [[value, label, desc]], preview(kind, el) → cleanup, onPick(value) }
 */
function setupPicker(root, opts) {
  const btn = root.querySelector('.pk-btn');
  const label = () => (opts.items.find((i) => i[0] === S.settings[opts.key]) || opts.items[0]);
  let pop = null;
  let cleanups = [];
  let btnClean = () => {};

  const drawButton = () => {
    btnClean();
    const [v, name] = label();
    btn.querySelector('.pk-name').textContent = name;
    const pv = btn.querySelector('.pk-pv');
    pv.innerHTML = '';
    btnClean = opts.preview(v, pv);
  };
  const close = () => {
    if (!pop) return false;
    cleanups.forEach((f) => f());
    cleanups = [];
    pop.remove();
    pop = null;
    btn.classList.remove('open');
    if (S.overlay) { // may already be gone when the whole settings window closes
      S.overlay.nodes = S.overlay.nodes.filter((n) => n.isConnected);
      S.overlay.escHook = null;
    }
    return true;
  };
  btn.addEventListener('click', () => {
    if (pop) return close();
    pop = h('div', 'pk-pop');
    pop.dataset.for = opts.key;
    pop.innerHTML = opts.items.map(([v, name, desc]) => `
      <button type="button" class="pk-item${S.settings[opts.key] === v ? ' sel' : ''}" data-v="${v}">
        <span class="pk-item-pv"></span>
        <span class="pk-item-text"><b>${esc(name)}</b><span>${esc(desc)}</span></span>
        ${S.settings[opts.key] === v ? icon('arrowRight', 'pk-check') : ''}
      </button>`).join('');
    overlayRoot.appendChild(pop);
    S.overlay.nodes.push(pop);
    S.overlay.escHook = () => close();
    btn.classList.add('open');
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.right - 330, innerWidth - 338))}px`;
    const below = innerHeight - r.bottom > 380;
    pop.style.top = below ? `${r.bottom + 4}px` : '';
    pop.style.bottom = below ? '' : `${innerHeight - r.top + 4}px`;
    pop.querySelectorAll('.pk-item').forEach((it) => {
      cleanups.push(opts.preview(it.dataset.v, it.querySelector('.pk-item-pv')));
      it.addEventListener('click', () => {
        saveSettings({ [opts.key]: it.dataset.v });
        opts.onPick?.(it.dataset.v);
        close();
        drawButton();
      });
    });
    pop.querySelector('.pk-item.sel')?.scrollIntoView({ block: 'nearest' });
    // while the list is open the page behind it stays put: the list floats at a fixed spot, so scrolling the
    // settings underneath would leave it hanging over the wrong row. Only the list itself scrolls.
    const holdScroll = (e) => { if (pop && !pop.contains(e.target)) e.preventDefault(); };
    window.addEventListener('wheel', holdScroll, { capture: true, passive: false });
    cleanups.push(() => window.removeEventListener('wheel', holdScroll, { capture: true }));
  });
  root.closest('.modal').addEventListener('pointerdown', (e) => { if (pop && !root.contains(e.target)) close(); });
  const prevCleanup = S.overlay.cleanup;
  S.overlay.cleanup = () => { prevCleanup?.(); close(); btnClean(); };
  drawButton();
}

/**
 * GPU (WebGL) rendering is fastest, but with a transparent terminal background it leaves stale glyphs
 * behind (ghost text). Whenever the background must be see-through, use the DOM renderer instead.
 */
function syncRenderer(tab) {
  const wantGpu = !needsClearTerminal();
  if (wantGpu && !tab.webgl) {
    try {
      const webgl = new WebglAddon.WebglAddon();
      webgl.onContextLoss(() => { webgl.dispose(); if (tab.webgl === webgl) tab.webgl = null; });
      tab.term.loadAddon(webgl);
      tab.webgl = webgl;
    } catch { tab.webgl = null; /* DOM renderer fallback */ }
  } else if (!wantGpu && tab.webgl) {
    try { tab.webgl.dispose(); } catch { /* ignore */ }
    tab.webgl = null;
    tab.term.refresh(0, tab.term.rows - 1);
  }
}

function termOptions() {
  const st = S.settings;
  return {
    fontFamily: st.fontFamily,
    fontSize: st.fontSize,
    lineHeight: st.lineHeight,
    cursorBlink: st.cursorBlink && !cursorPreset().custom,
    cursorStyle: cursorPreset().style,
    cursorWidth: cursorPreset().width,
    letterSpacing: Number(st.letterSpacing) || 0,
    allowTransparency: needsClearTerminal(), // transparent rendering is slower: only when an effect needs it
    cursorInactiveStyle: cursorPreset().custom ? 'none' : 'outline',
    scrollback: 20000,
    allowProposedApi: true,
    drawBoldTextInBrightColors: false,
    fontWeightBold: '600',
    minimumContrastRatio: 1,
    smoothScrollDuration: 0,
    rightClickSelectsWord: false,
    windowsPty: { backend: 'conpty', buildNumber: 22621 },
    theme: xtermTheme(),
  };
}

/**
 * opts: { shellId, cwd, launch: { type, mode, sessionId, permissionMode }, customTitle, background, index }
 */
function createTab(opts = {}) {
  const launch = opts.launch || null;
  if (launch && launch.type === 'claude' && (launch.mode || 'new') === 'new' && !launch.sessionId) launch.sessionId = uuid();

  const tab = {
    id: uuid(),
    shellId: opts.shellId || S.settings.defaultShell,
    cwd: opts.cwd || currentCwd(),
    launch,
    agent: null,
    sessionId: '',
    permissionMode: launch ? launch.permissionMode || '' : '',
    customTitle: opts.customTitle || '',
    oscTitle: '',
    status: 'starting',
    alive: false,
    lastOut: 0,
    lastIn: 0,
    lastResize: 0,
    workStart: 0,
    agentSince: 0,
  };

  const proj = projectFor(tab.cwd);
  if (proj) { proj.lastUsed = Date.now(); saveProjects(); }

  // host = tile: header (visible in grid view) + terminal body
  tab.host = h('div', 'term-host');
  tab.host.innerHTML = `
    <div class="tile-head">
      <span class="tile-ico"><span class="ico-slot"></span><span class="dot"></span></span>
      <span class="tile-title"></span>
      <span class="tile-status"></span>
      <button class="icon-btn" data-a="solo" title="이 탭만 크게 보기">${icon('maximize')}</button>
      <button class="icon-btn" data-a="close" title="종료">${icon('x')}</button>
    </div>
    <div class="term-body"></div>`;
  tab.host.querySelector('.tile-head').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') return closeTab(tab.id);
    if (a === 'solo') {
      if (S.grid) { S.grid = null; return activate(tab.id); }
      activate(tab.id);
      return toggleZoom();
    }
    activate(tab.id);
  });
  tab.host.addEventListener('pointerdown', () => { if (tab.host.classList.contains('tiled') && S.activeId !== tab.id) activate(tab.id); }, true);
  tab.host.querySelector('.tile-head').addEventListener('pointerdown', (e) => onPaneHeadPointerDown(e, tab));
  termsEl.appendChild(tab.host);
  const term = new Terminal(termOptions());
  tab.term = term;
  tab.fit = new FitAddon.FitAddon();
  tab.search = new SearchAddon.SearchAddon();
  term.loadAddon(tab.fit);
  term.loadAddon(tab.search);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((_e, uri) => window.mt.openExternal(uri)));
  term.loadAddon(new Unicode11Addon.Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.open(tab.host.querySelector('.term-body'));
  term.onWriteParsed(() => {
    // typing moves the cursor along the caret's row: follow that at once; jumps elsewhere wait to settle
    const b = term.buffer.active;
    let hidden = false;
    try { hidden = !!term._core.coreService.isCursorHidden; } catch { /* ignore */ }
    if (!hidden && tab.caret && b.cursorY === tab.caret.y && b.cursorX < term.cols - 1 && b.viewportY === b.baseY) tab.caret = { x: b.cursorX, y: b.cursorY };
    clearTimeout(tab.caretTimer);
    tab.caretTimer = setTimeout(() => { settleCaret(tab); if (tab.id === S.activeId) scheduleCursor(); }, 24);
  });
  // xterm puts its hidden input field and the IME composition box at the raw cursor; move them to the caret
  try {
    const core = term._core;
    const placeAt = (el, c) => {
      const cell = core._renderService.dimensions.css.cell;
      el.style.left = `${c.x * cell.width}px`;
      el.style.top = `${c.y * cell.height}px`;
    };
    const sync = core._syncTextArea.bind(core);
    core._syncTextArea = () => { sync(); if (tab.caret && core.textarea && !core._compositionHelper.isComposing) placeAt(core.textarea, tab.caret); };
    const ch = core._compositionHelper;
    const upd = ch.updateCompositionElements.bind(ch);
    ch.updateCompositionElements = (d) => {
      upd(d);
      if (!tab.caret || !ch._isComposing) return;
      placeAt(ch._compositionView, tab.caret);
      placeAt(ch._textarea, tab.caret);
    };
  } catch { /* xterm internals changed: keep its defaults */ }
  syncRenderer(tab);

  // OSC 9;9;<cwd> from our prompt hooks; other OSC 9 / 777 payloads are agent notifications.
  const oscColor = (c) => `rgb:${c.map((v) => v.toString(16).padStart(2, '0').repeat(2)).join('/')}`;
  term.parser.registerOscHandler(11, (data) => {
    if (data !== '?' || !tab.alive) return false;
    window.mt.pty.write(tab.id, `\x1b]11;${oscColor(BASE_STAGE)}\x1b\\`);
    return true;
  });
  term.parser.registerOscHandler(10, (data) => {
    if (data !== '?' || !tab.alive) return false;
    window.mt.pty.write(tab.id, `\x1b]10;${oscColor(hexRgb(currentTheme().fg))}\x1b\\`);
    return true;
  });
  term.parser.registerOscHandler(9, (data) => {
    if (data.startsWith('9;')) {
      setCwd(tab, data.slice(2).replace(/^"|"$/g, ''));
      // the shell drew its prompt again: an agent in this tab has probably exited
      if (tab.agent) window.mt.agent.probe([150, 1200]);
    }
    else if (data && !/^\d+;/.test(data)) onAgentNotify(tab, data);
    return true;
  });
  term.parser.registerOscHandler(777, (data) => {
    const m = data.match(/^notify;([^;]*);?(.*)$/);
    if (m) onAgentNotify(tab, m[2] || m[1]);
    return true;
  });
  term.parser.registerOscHandler(7, (data) => {
    try {
      const u = new URL(data);
      let p = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      setCwd(tab, IS_WIN ? p.replace(/\//g, '\\') : p);
    } catch { /* ignore */ }
    return true;
  });

  term.onData((d) => {
    if (!tab.alive) {
      if (d === '\r' && tab.status === 'exited') restartTab(tab);
      return;
    }
    // a syllable we had to send ourselves on Shift+Enter (see sendNewline): any late copy of it is dropped
    if (tab.swallow && d === tab.swallow) return;
    // the IME's committed syllable arriving (it may come a moment after compositionend)
    const committed = tab.compFinal && d.includes(tab.compFinal);
    if (committed) tab.compFinal = null;
    window.mt.pty.write(tab.id, d);
    // Shift+Enter was pressed while that syllable was still on its way: the newline goes right after it
    if (committed && tab.nlPending) { const nl = tab.nlPending; tab.nlPending = null; clearTimeout(tab.nlTimer); window.mt.pty.write(tab.id, nl); }
    // xterm also emits automatic replies here (focus in/out, cursor & device reports, mouse reports):
    // they are not the user typing and must not change the agent's state
    if (isTerminalReport(d)) return;
    tab.lastIn = Date.now();
    spawnFx(tab, d);
    tab.statusBeforeInput = tab.status;
    // typing again after a finished turn / a question → back to "입력 대기" (until Enter starts work)
    if (tab.agent && (tab.status === 'done' || tab.status === 'attention')) setStatus(tab, 'ready');
    if (tab.unseen) { tab.unseen = false; updateTabEl(tab); }
    if (tab.agent && d === '\x1b' && tab.status === 'working') tab.interrupted = true; // Esc stops the agent
    if (d.includes('\r') && !d.startsWith('\x1b[200~')) {
      if (tab.agent) onAgentEnter(tab);
      if (tab.agent) { tab.armed = true; tab.armedAt = Date.now(); } // a prompt / answer was submitted → next output burst is real work
      else if (/\b(claude|codex)\b/i.test(currentLine(tab))) window.mt.agent.probe([500, 1500, 3000]);
    }
  });
  term.onTitleChange((t) => {
    // agents animate a spinner in the title many times per second: only redraw when the label changes
    const before = tabLabel(tab);
    tab.oscTitle = t;
    if (tabLabel(tab) === before) return;
    updateTabEl(tab);
    renderSessions();
    if (tab.id === S.activeId) renderStatus();
  });
  term.onBell(() => { if (tab.agent) onAgentNotify(tab, ''); });
  term.onRender(() => { if (tab.id === S.activeId) scheduleCursor(); if (BOXED_PROMPTS.has(S.settings.promptStyle) || tab.host.querySelector('.pbox')) schedulePromptBoxes(tab); });
  term.onCursorMove(() => { if (tab.id === S.activeId) scheduleCursor(); });
  term.onScroll(() => { if (tab.id === S.activeId) scheduleCursor(); schedulePromptBoxes(tab); });
  term.textarea?.addEventListener('focus', scheduleCursor);
  term.textarea?.addEventListener('blur', scheduleCursor);
  term.textarea?.addEventListener('compositionstart', () => { tab.composing = true; tab.compText = ''; tab.compFinal = null; });
  term.textarea?.addEventListener('compositionupdate', (e) => { tab.compText = e.data || ''; });
  term.textarea?.addEventListener('compositionend', (e) => {
    tab.composing = false;
    // xterm sends the committed text a tick later; until then it is "on its way" (see sendNewline / onData)
    tab.compFinal = e.data || null;
    clearTimeout(tab.compFinalTimer);
    tab.compFinalTimer = setTimeout(() => { tab.compFinal = null; }, 300);
  });
  for (const ev of ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'keyup']) {
    term.textarea?.addEventListener(ev, () => { if (tab.id === S.activeId) { scheduleCursor(); setTimeout(scheduleCursor, 30); } });
  }
  term.onResize(({ cols, rows }) => { tab.lastResize = Date.now(); if (tab.alive) window.mt.pty.resize(tab.id, cols, rows); });
  tab.search.onDidChangeResults?.(({ resultIndex, resultCount }) => {
    if (tab.id !== S.activeId) return;
    $('#search-count').textContent = resultCount ? `${resultIndex + 1}/${resultCount}` : '결과 없음';
  });

  tab.el = buildTabEl(tab);
  const idx = opts.index != null ? Math.min(opts.index, S.tabs.length) : S.tabs.length;
  S.tabs.splice(idx, 0, tab);
  if (idx >= tabsEl.children.length) tabsEl.appendChild(tab.el);
  else tabsEl.insertBefore(tab.el, tabsEl.children[idx]);
  tab.el.classList.add('entering');
  setTimeout(() => tab.el.classList.remove('entering'), 250);

  if (!opts.background || !S.activeId) activate(tab.id);
  else updateTabEl(tab);

  requestAnimationFrame(() => startPty(tab));
  renderSessions();
  renderProjects();
  updateEmpty();
  saveLayout();
  return tab;
}

async function startPty(tab, { withLaunch = true } = {}) {
  try { tab.fit.fit(); } catch { /* ignore */ }
  const res = await window.mt.pty.create({
    id: tab.id,
    shellId: tab.shellId,
    cwd: tab.cwd,
    agent: withLaunch ? tab.launch : null,
    cols: tab.term.cols,
    rows: tab.term.rows,
  });
  if (!res.ok) {
    tab.term.write(`\x1b[31m${tr('셸을 시작하지 못했습니다:')} ${res.error}\x1b[0m\r\n`);
    setStatus(tab, 'exited');
    return;
  }
  tab.alive = true;
  tab.shellId = res.shellId || tab.shellId;
  if (res.cwd) tab.cwd = res.cwd;
  if (!tab.launch) setStatus(tab, 'shell');
  saveLayout();
}

function restartTab(tab) {
  tab.term.reset();
  tab.launch = null;
  setStatus(tab, 'starting');
  startPty(tab, { withLaunch: false });
}

function buildTabEl(tab) {
  const el = h('div', 'tab');
  el.setAttribute('role', 'tab');
  el.innerHTML = `
    <span class="tab-icon"><span class="ico-slot"></span><span class="dot"></span></span>
    <span class="tab-title"></span>
    <button class="tab-close" title="닫기 (Ctrl+Shift+W)">${icon('x')}</button>`;
  el.addEventListener('pointerdown', (e) => onTabPointerDown(e, tab));
  el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
  el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  el.addEventListener('dblclick', (e) => { if (!e.target.closest('.tab-close')) startRename(tab); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); activate(tab.id); openTabMenu(tab, e.clientX, e.clientY); });
  el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
  return el;
}

function updateTabEl(tab) {
  const el = tab.el;
  if (!el) return;
  el.classList.toggle('active', tab.id === S.activeId);
  el.classList.toggle('unseen', !!tab.unseen);
  el.classList.toggle('agent-claude', tab.agent === 'claude');
  el.classList.toggle('agent-codex', tab.agent === 'codex');
  for (const s of Object.keys(STATUS_TEXT)) el.classList.toggle(`st-${s}`, tab.status === s);
  const slot = el.querySelector('.ico-slot');
  const iname = tabIconName(tab);
  if (slot && slot.dataset.name !== iname) { slot.innerHTML = icon(iname); slot.dataset.name = iname; }
  const title = el.querySelector('.tab-title');
  if (title) title.textContent = tabLabel(tab);
  el.title = `${tabLabel(tab)}\n${tab.cwd}\n${tab.agent ? `${AGENTS[tab.agent].name} · ` : ''}${STATUS_TEXT[tab.status] || ''}`;

  // grid tile header mirrors the tab
  const host = tab.host;
  if (host) {
    host.classList.toggle('agent-claude', tab.agent === 'claude');
    host.classList.toggle('agent-codex', tab.agent === 'codex');
    for (const s of Object.keys(STATUS_TEXT)) host.classList.toggle(`st-${s}`, tab.status === s);
    host.classList.toggle('busy', !!S.settings.workGlow && !!tab.agent && tab.status === 'working');
    host.dataset.wg = S.settings.workGlowStyle || 'orbit';
    syncRunners(host, host.dataset.wg, host.classList.contains('busy'));
    const hs = host.querySelector('.tile-head .ico-slot');
    if (hs && hs.dataset.name !== iname) { hs.innerHTML = icon(iname); hs.dataset.name = iname; }
    host.querySelector('.tile-title').textContent = tabLabel(tab);
    host.querySelector('.tile-status').innerHTML = statusHtml(tab);
  }
}

function statusHtml(t) {
  if (!t.agent) return t.status === 'exited' ? STATUS_TEXT.exited : esc(shellName(t.shellId));
  if (t.status === 'working') return `${STATUS_TEXT.working} · <span class="elapsed" data-since="${t.workStart}">${elapsed(t.workStart)}</span>`;
  if (t.status === 'done' && t.lastDuration) return `${STATUS_TEXT.done} · ${elapsedText(t.lastDuration)}`;
  return STATUS_TEXT[t.status] || '';
}

function elapsed(since) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

// live elapsed counters (sidebar, tiles, status bar)
setInterval(() => {
  document.querySelectorAll('.elapsed[data-since]').forEach((el) => { el.textContent = elapsed(Number(el.dataset.since)); });
}, 1000);

function activate(id) {
  const tab = tabById(id);
  if (!tab) return;
  if (S.grid && !samePath(tab.cwd, S.grid)) S.grid = null;
  if (S.zoom && S.zoom !== id) S.zoom = null;
  S.activeId = id;
  for (const t of S.tabs) updateTabEl(t);
  if (tab.unseen) { tab.unseen = false; updateTabEl(tab); }
  applyLayout();
  if (tab.pendingCelebrate) setTimeout(() => celebrate(tab), 250); // its task finished while you were elsewhere
  requestAnimationFrame(() => {
    if (!S.overlay) tab.term.focus();
    tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  closeSearch(false);
  renderProjects();
  renderStatus();
  saveLayout();
}

/* --- single view / project grid view ------------------------------- */

function gridTiles() {
  if (!S.grid) return [];
  const tiles = S.tabs.filter((t) => samePath(t.cwd, S.grid));
  // agents first, keep tab order otherwise
  return [...tiles.filter((t) => t.agent), ...tiles.filter((t) => !t.agent)];
}

const groupOf = (tab) => (tab ? S.groups.find((g) => g.ids.includes(tab.id)) || null : null);

/** What the stage shows right now: a project grid, a split group, or a single tab. */
function currentView() {
  if (S.grid) {
    const tiles = gridTiles();
    if (tiles.length >= 2) return { kind: 'project', tiles, dir: 'grid' };
    S.grid = null;
  }
  const t = activeTab();
  const g = groupOf(t);
  if (g && S.zoom !== t.id) {
    const tiles = g.ids.map(tabById).filter(Boolean);
    if (tiles.length >= 2) return { kind: 'split', tiles, dir: g.dir };
  }
  return { kind: 'single', tiles: [] };
}

function applyLayout() {
  const view = currentView();
  const tiles = view.tiles;
  const grid = view.kind === 'project';
  termsEl.classList.toggle('grid', view.kind !== 'single');
  termsEl.classList.toggle('split', view.kind === 'split');
  if (view.kind !== 'single') {
    const n = tiles.length;
    let cols;
    if (view.dir === 'row') cols = n;
    else if (view.dir === 'col') cols = 1;
    else cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    termsEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    termsEl.style.gridTemplateRows = `repeat(${Math.ceil(n / cols)}, minmax(0, 1fr))`;
  } else {
    termsEl.style.gridTemplateColumns = '';
    termsEl.style.gridTemplateRows = '';
  }
  for (const t of S.tabs) {
    const i = tiles.indexOf(t);
    t.host.classList.toggle('tiled', i >= 0);
    t.host.classList.toggle('active', t.id === S.activeId);
    t.host.style.order = i >= 0 ? String(i) : '';
    t.host.style.gridColumn = '';
  }
  // no empty cells: the last tile stretches over the leftover columns
  if (view.kind !== 'single' && tiles.length) {
    const cols = (termsEl.style.gridTemplateColumns.match(/repeat\((\d+)/) || [0, 1])[1] | 0;
    const rem = tiles.length % cols;
    if (cols > 1 && rem) tiles[tiles.length - 1].host.style.gridColumn = `span ${cols - rem + 1}`;
  }
  for (const t of S.tabs) {
    const i = tiles.indexOf(t);
    t.el.classList.toggle('in-view', i >= 0 && t.id !== S.activeId);
    t.el.classList.toggle('in-split', !!groupOf(t));
    const solo = t.host.querySelector('[data-a="solo"]');
    if (solo) solo.title = view.kind === 'split' ? '이 패널만 크게 (Ctrl+Shift+Z)' : '이 탭만 보기';
  }
  renderSessions(); // the 현재 탭 section mirrors the layout
  const zoomed = S.zoom && S.zoom === S.activeId && groupOf(activeTab());
  $('#zoombar').hidden = !zoomed;
  const bar = $('#gridbar');
  bar.hidden = !grid;
  if (grid) {
    const p = projectFor(S.grid);
    const agents = tiles.filter((t) => t.agent).length;
    bar.querySelector('.gb-title').textContent = p ? p.name : basename(S.grid);
    bar.querySelector('.gb-sub').textContent = `탭 ${tiles.length}개 · 에이전트 ${agents}개`;
  }
  requestAnimationFrame(() => { (tiles.length ? tiles : [activeTab()]).forEach(fitTab); scheduleCursor(); });
}

/* --- split panes ----------------------------------------------------- */

function splitPane(dir) {
  const t = activeTab();
  if (!t) return;
  S.grid = null;
  S.zoom = null;
  let g = groupOf(t);
  if (!g) { g = { ids: [t.id], dir }; S.groups.push(g); }
  else if (g.dir !== dir) g.dir = 'grid';
  if (g.ids.length >= 6) return toast('한 화면에 최대 6개까지 나눌 수 있어요', { icon: 'info' });
  const lastIdx = Math.max(...g.ids.map((id) => S.tabs.findIndex((x) => x.id === id)));
  const nt = createTab({ shellId: t.shellId, cwd: t.cwd, index: lastIdx + 1, background: true });
  g.ids.splice(g.ids.indexOf(t.id) + 1, 0, nt.id);
  activate(nt.id);
}

function unsplit(tab) {
  const g = groupOf(tab || activeTab());
  if (!g) return;
  S.groups = S.groups.filter((x) => x !== g);
  S.zoom = null;
  applyLayout();
  saveLayout();
}

function toggleZoom() {
  const t = activeTab();
  if (!t || !groupOf(t)) return;
  S.zoom = S.zoom === t.id ? null : t.id;
  applyLayout();
}

/** Move focus to the neighbouring pane in a direction (dx, dy ∈ -1..1). */
function focusPane(dx, dy) {
  const view = currentView();
  const cur = activeTab();
  if (view.kind === 'single' || !cur) return;
  const r0 = cur.host.getBoundingClientRect();
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best = null;
  let bestScore = Infinity;
  for (const t of view.tiles) {
    if (t === cur) continue;
    const r = t.host.getBoundingClientRect();
    const vx = r.left + r.width / 2 - c0.x;
    const vy = r.top + r.height / 2 - c0.y;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const score = along + Math.abs(vx * dy) + Math.abs(vy * dx) * 2;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  if (best) activate(best.id);
}

function toggleGrid(projPath) {
  const target = projPath || activeTab()?.cwd;
  if (!target) return;
  if (S.grid && samePath(S.grid, target)) { S.grid = null; applyLayout(); renderProjects(); return; }
  const tiles = S.tabs.filter((t) => samePath(t.cwd, target));
  if (tiles.length < 2) {
    toast('이 폴더에 열린 탭이 2개 이상일 때 함께 볼 수 있어요', { icon: 'info' });
    if (tiles[0]) activate(tiles[0].id);
    return;
  }
  S.grid = target;
  const cur = activeTab();
  if (cur && samePath(cur.cwd, target)) applyLayout();
  else activate((tiles.find((t) => t.agent) || tiles[0]).id);
  renderProjects();
}

function fitTab(tab) {
  if (!tab) return;
  try { tab.fit.fit(); } catch { /* ignore */ }
}

async function closeTab(id, { confirmWorking = true } = {}) {
  const tab = tabById(id);
  if (!tab) return;
  if (confirmWorking && tab.agent && tab.status === 'working') {
    const ok = await confirmDialog(`${AGENTS[tab.agent].name}가 작업 중입니다`, `'${tabLabel(tab)}' 탭을 닫으면 진행 중인 작업이 중단됩니다.`, '닫기');
    if (!ok) return;
  }
  const idx = S.tabs.indexOf(tab);
  syncTask(tab, 'exited');
  window.mt.pty.kill(tab.id);
  tab.alive = false;
  try { tab.term.dispose(); } catch { /* ignore */ }
  tab.host.remove();
  tab.el.remove();
  S.tabs.splice(idx, 1);
  // leave its split group; a group of one is no longer a split
  let sibling = null;
  const g = S.groups.find((x) => x.ids.includes(id));
  if (g) {
    const gi = g.ids.indexOf(id);
    g.ids.splice(gi, 1);
    sibling = tabById(g.ids[Math.min(gi, g.ids.length - 1)]);
    if (g.ids.length < 2) S.groups = S.groups.filter((x) => x !== g);
  }
  if (S.zoom === id) S.zoom = null;
  if (S.activeId === id) {
    S.activeId = null;
    const next = sibling || (S.grid && gridTiles()[0]) || S.tabs[idx] || S.tabs[idx - 1];
    if (next) activate(next.id);
  } else {
    applyLayout();
  }
  renderProjects();
  renderStatus();
  updateEmpty();
  saveLayout();
}

function moveTab(from, to) {
  if (from === to || to < 0 || to >= S.tabs.length) return;
  const [t] = S.tabs.splice(from, 1);
  S.tabs.splice(to, 0, t);
  for (const x of S.tabs) tabsEl.appendChild(x.el);
  renderSessions();
  saveLayout();
}

function moveActive(delta) {
  const i = S.tabs.findIndex((t) => t.id === S.activeId);
  if (i < 0) return;
  const to = Math.max(0, Math.min(S.tabs.length - 1, i + delta));
  if (to === i) return;
  const el = S.tabs[i].el;
  const before = el.getBoundingClientRect().left;
  moveTab(i, to);
  flip(el, before);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function flip(el, beforeLeft) {
  const dx = beforeLeft - el.getBoundingClientRect().left;
  if (!dx) return;
  el.style.transition = 'none';
  el.style.transform = `translateX(${dx}px)`;
  el.getBoundingClientRect();
  el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
  el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; }, 220);
}

/* --- drag a tab onto a pane to split ------------------------------- */

const SIDE_LABEL = { left: '왼쪽에 분할', right: '오른쪽에 분할', top: '위에 분할', bottom: '아래에 분할' };
const splitDrop = {
  el: null,
  chip: null,
  target: null,
  /** The pane under the pointer and the edge it's nearest to; highlight the half the tab would take. */
  update(tab, x, y) {
    const panes = currentView().tiles.length ? currentView().tiles : [activeTab()].filter(Boolean);
    let pane = null;
    for (const t of panes) {
      const r = t.host.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { pane = t; break; }
    }
    if (!this.chip) {
      this.chip = h('div', 'split-chip');
      document.body.appendChild(this.chip);
    }
    this.chip.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
    const alone = pane === tab && panes.length < 2;
    if (!pane || pane === tab) {
      this.target = null;
      this.chip.textContent = alone ? '다른 탭을 연 화면 위에 놓으세요' : tabLabel(tab);
      if (this.el) this.el.hidden = true;
      return;
    }
    const r = pane.host.getBoundingClientRect();
    const d = { left: (x - r.left) / r.width, right: (r.right - x) / r.width, top: (y - r.top) / r.height, bottom: (r.bottom - y) / r.height };
    const side = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
    this.target = { pane, side };
    if (!this.el) { this.el = h('div', 'split-drop'); document.body.appendChild(this.el); }
    const half = { left: [r.left, r.top, r.width / 2, r.height], right: [r.left + r.width / 2, r.top, r.width / 2, r.height], top: [r.left, r.top, r.width, r.height / 2], bottom: [r.left, r.top + r.height / 2, r.width, r.height / 2] }[side];
    Object.assign(this.el.style, { left: `${half[0]}px`, top: `${half[1]}px`, width: `${half[2]}px`, height: `${half[3]}px` });
    this.el.hidden = false;
    this.el.innerHTML = `<span>${icon(side === 'left' || side === 'right' ? 'splitRight' : 'splitDown')}${SIDE_LABEL[side]}</span>`;
    this.chip.textContent = tabLabel(tab);
  },
  clear() {
    this.el?.remove(); this.chip?.remove();
    this.el = null; this.chip = null; this.target = null;
  },
};

/**
 * Drag a split pane by its header: onto another pane's edge to move it there, or up onto the tab bar
 * to take it out of the split and make it a tab of its own again.
 */
function onPaneHeadPointerDown(e, tab) {
  if (e.button !== 0 || e.target.closest('button')) return;
  if (!tab.host.classList.contains('tiled')) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let dragging = false;
  let toBar = false;
  const bar = $('#tabs-wrap');
  const onMove = (ev) => {
    if (!dragging) {
      if (Math.abs(ev.clientX - sx) < 6 && Math.abs(ev.clientY - sy) < 6) return;
      dragging = true;
      document.body.classList.add('grabbing');
      tab.host.classList.add('pane-dragging');
    }
    const br = $('#titlebar').getBoundingClientRect();
    toBar = ev.clientY <= br.bottom + 6;
    bar.classList.toggle('tab-drop', toBar);
    if (toBar) {
      splitDrop.update(tab, -1, -1); // no pane target
      if (splitDrop.chip) splitDrop.chip.textContent = '탭으로 되돌리기';
      splitDrop.chip?.style.setProperty('transform', `translate(${ev.clientX + 14}px, ${ev.clientY + 12}px)`);
    } else {
      splitDrop.update(tab, ev.clientX, ev.clientY);
    }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (!dragging) return;
    document.body.classList.remove('grabbing');
    tab.host.classList.remove('pane-dragging');
    bar.classList.remove('tab-drop');
    const drop = splitDrop.target;
    splitDrop.clear();
    if (toBar) detachPane(tab);
    else if (drop) splitInto(tab, drop.pane, drop.side);
    tab.term.focus();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** Take a pane out of its split: it becomes a tab of its own; the rest of the split stays on screen. */
function detachPane(tab) {
  const g = groupOf(tab);
  if (!g) {
    if (S.grid) { S.grid = null; activate(tab.id); }
    return;
  }
  const i = g.ids.indexOf(tab.id);
  g.ids = g.ids.filter((id) => id !== tab.id);
  const stay = g.ids[Math.max(0, i - 1)];
  if (g.ids.length < 2) S.groups = S.groups.filter((x) => x !== g);
  S.zoom = null;
  if (stay) activate(stay);
  applyLayout();
  saveLayout();
  toast(`'${tabLabel(tab)}' 탭을 분할에서 뺐어요`, { icon: 'info' });
}

/** Put `tab` next to `pane` on the given side, joining (or starting) the pane's split group. */
function splitInto(tab, pane, side) {
  if (!tab || !pane) return;
  const dir = side === 'left' || side === 'right' ? 'row' : 'col';
  // leave the group it was in (a group of one isn't a split any more)
  const old = groupOf(tab);
  if (old) {
    old.ids = old.ids.filter((id) => id !== tab.id);
    if (old.ids.length < 2) S.groups = S.groups.filter((g) => g !== old);
  }
  if (tab === pane) return activate(tab.id);
  let g = groupOf(pane);
  if (!g) { g = { ids: [pane.id], dir }; S.groups.push(g); }
  else if (g.ids.length >= 6) { applyLayout(); return toast('한 화면에 최대 6개까지 나눌 수 있어요', { icon: 'info' }); }
  else if (g.ids.length >= 2 && g.dir !== dir) g.dir = 'grid';
  else if (g.ids.length < 2) g.dir = dir;
  const pi = g.ids.indexOf(pane.id);
  if (g.dir === 'grid' && (side === 'top' || side === 'bottom')) {
    // a grid fills row by row: "below" a pane is one row further on, same column
    const n = g.ids.length + 1;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    if (side === 'bottom') g.ids.splice(Math.min(pi + cols, g.ids.length), 0, tab.id);
    else { g.ids.splice(pi, 1, tab.id); g.ids.splice(Math.min(pi + cols, g.ids.length), 0, pane.id); }
  } else {
    g.ids.splice(pi + (side === 'right' || side === 'bottom' ? 1 : 0), 0, tab.id);
  }
  S.grid = null;
  S.zoom = null;
  activate(tab.id);
  applyLayout();
  saveLayout();
}

/* --- drag & drop reordering ---------------------------------------- */

function onTabPointerDown(e, tab) {
  if (e.button !== 0) return;
  if (e.target.closest('.tab-close') || e.target.closest('.tab-rename')) return;

  const el = tab.el;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let out = false; // dragged down out of the tab bar: dropping onto a pane splits it
  let els;
  let rects;
  let from;
  let target;

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) < 5 && Math.abs(ev.clientY - startY) < 5) return;
      dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      els = [...tabsEl.children];
      rects = els.map((x) => x.getBoundingClientRect());
      from = els.indexOf(el);
      target = from;
      tabsEl.classList.add('tabs-dragging');
      el.classList.add('dragging');
      document.body.classList.add('grabbing');
    }
    const barBottom = tabsEl.getBoundingClientRect().bottom;
    if (ev.clientY > barBottom + 16) {
      if (!out) { out = true; els.forEach((x) => { x.style.transform = ''; }); el.classList.add('drag-out'); }
      splitDrop.update(tab, ev.clientX, ev.clientY);
      return;
    }
    if (out) { out = false; el.classList.remove('drag-out'); splitDrop.clear(); }
    const r = rects[from];
    const minDx = rects[0].left - r.left;
    const maxDx = rects[rects.length - 1].right - r.right;
    const cdx = Math.max(minDx - 8, Math.min(maxDx + 8, dx));
    el.style.transform = `translateX(${cdx}px)`;

    const center = r.left + r.width / 2 + cdx;
    target = from;
    for (let i = 0; i < rects.length; i++) {
      if (i === from) continue;
      const mid = rects[i].left + rects[i].width / 2;
      if (i < from && center < mid) target = Math.min(target, i);
      if (i > from && center > mid) target = Math.max(target, i);
    }
    const gap = rects.length > 1 ? Math.max(0, rects[1].left - rects[0].right) : 4;
    const shift = r.width + gap;
    els.forEach((x, i) => {
      if (i === from) return;
      let s = 0;
      if (from < target && i > from && i <= target) s = -shift;
      else if (target < from && i >= target && i < from) s = shift;
      x.style.transform = s ? `translateX(${s}px)` : '';
    });
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (!dragging) { if (tab.id !== S.activeId) activate(tab.id); return; }
    if (out) {
      tabsEl.classList.remove('tabs-dragging');
      document.body.classList.remove('grabbing');
      el.classList.remove('dragging', 'drag-out');
      const drop = splitDrop.target;
      splitDrop.clear();
      if (drop) splitInto(tab, drop.pane, drop.side);
      else if (tab.id !== S.activeId) activate(tab.id);
      tab.term.focus();
      return;
    }
    if (tab.id !== S.activeId) activate(tab.id);
    const visualLeft = el.getBoundingClientRect().left;
    tabsEl.classList.remove('tabs-dragging');
    document.body.classList.remove('grabbing');
    els.forEach((x) => { x.style.transform = ''; });
    el.classList.remove('dragging');
    if (target !== from) moveTab(from, target);
    flip(el, visualLeft);
    tab.term.focus();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

tabsEl.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabsEl.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });

/* --- rename -------------------------------------------------------- */

function startRename(tab) {
  const titleEl = tab.el.querySelector('.tab-title');
  if (!titleEl) return;
  const input = h('input', 'tab-rename');
  input.value = tab.customTitle || tabLabel(tab);
  input.spellcheck = false;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) tab.customTitle = input.value.trim();
    input.replaceWith(h('span', 'tab-title'));
    updateTabEl(tab);
    renderSessions();
    saveLayout();
    if (tab.id === S.activeId) tab.term.focus();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/* ------------------------------------------------------------------ */
/* Output routing, agent detection & activity                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Output colour filter: rewrites SGR background colours before drawing */
/*  · dark, colourless cell backgrounds vanish over images / animations */
/*  · grey "prompt box" backgrounds follow the 내 프롬프트 style          */
/* ------------------------------------------------------------------ */

const XTERM256 = (() => {
  const t = [[0, 0, 0], [205, 49, 49], [13, 188, 121], [229, 229, 16], [36, 114, 200], [188, 63, 188], [17, 168, 205], [229, 229, 229],
    [102, 102, 102], [241, 76, 76], [35, 209, 139], [245, 245, 67], [59, 142, 234], [214, 112, 214], [41, 184, 219], [255, 255, 255]];
  const v = [0, 95, 135, 175, 215, 255];
  for (let i = 0; i < 216; i++) t.push([v[Math.floor(i / 36)], v[Math.floor(i / 6) % 6], v[i % 6]]);
  for (let i = 0; i < 24; i++) { const g = 8 + i * 10; t.push([g, g, g]); }
  return t;
})();

const PROMPT_STYLES = [
  ['default', '기본 회색 박스', '에이전트가 그리는 그대로'],
  ['none', '배경 없음', '박스 없이 글자만 깔끔하게'],
  ['subtle', '은은한 박스', '배경과 거의 같은 아주 옅은 박스'],
  ['accent', '강조 색 박스', '강조 색이 살짝 섞인 박스'],
  ['accentText', '강조 글자', '박스 없이 글자를 강조 색으로'],
  ['card', '카드', '은은한 바탕 + 테두리 + 왼쪽 막대'],
  ['bar', '왼쪽 막대', '인용문처럼 왼쪽에 굵은 막대'],
  ['neon', '네온 테두리', '강조 색으로 빛나는 테두리'],
  ['gradient', '그라디언트 테두리', '보라→코랄로 흐르는 테두리'],
  ['badge', "'나' 배지", '왼쪽에 "나" 말풍선이 붙음'],
  ['bubble', '말풍선', '꼬리가 달린 둥근 채팅 말풍선'],
  ['marker', '형광펜', '글자 아래에 형광펜으로 그은 듯'],
  ['bracket', '대괄호', '양옆을 [ ] 로 감쌈'],
  ['glass', '유리 카드', '빛이 비치는 반투명 유리 느낌'],
  ['dot', '빛나는 점', '왼쪽에 은은하게 빛나는 점'],
  ['terminal', '미니 창', '신호등 버튼이 달린 작은 창 안에'],
  ['flow', '무지개 흐름', '테두리를 따라 무지갯빛이 흘러감'],
  ['sticky', '포스트잇', '노란 메모지에 접힌 모서리'],
  ['quote', '인용구', '큼직한 따옴표로 감싼 인용'],
  ['scan', '스캔 빛', '빛줄기가 왼쪽에서 오른쪽으로 쓸고 지나감'],
  ['ticket', '티켓', '양옆이 파인 점선 입장권'],
  ['wave', '물결 밑줄', '아래에서 일렁이는 물결 선'],
  ['pill', '캡슐', '양끝이 둥근 알약 모양에 빛나는 테두리'],
  ['notebook', '공책', '줄 공책 위에 빨간 여백선'],
  ['cyber', '사이버 프레임', '모서리가 잘린 네온 프레임과 코너 표시'],
  ['floating', '떠있는 카드', '그림자를 드리우며 살짝 떠 있는 카드'],
  ['spot', '스포트라이트', '위에서 은은한 조명이 비춤'],
  ['ribbon', '리본', '왼쪽에 리본 책갈피, 아래로 은은한 밑줄'],
  ['stamp', '도장', '오른쪽 끝에 빨간 "나" 도장이 쾅'],
  ['sparkle', '별가루', '모서리에서 작은 별이 반짝반짝'],
  ['washi', '마스킹 테이프', '다이어리처럼 양쪽 위에 무늬 테이프'],
  ['chat', '내 메시지', '메신저의 내가 보낸 말풍선'],
];
// styles drawn as real shapes over the terminal (the cells only carry a hidden marker colour)
const OVERLAY_PROMPTS = new Set(['card', 'bar', 'neon', 'gradient', 'badge', 'bubble', 'marker', 'bracket', 'glass', 'dot', 'terminal', 'flow', 'sticky', 'quote', 'scan', 'ticket', 'wave', 'pill', 'notebook', 'cyber', 'floating', 'spot', 'ribbon', 'stamp', 'sparkle', 'washi', 'chat']);
const PROMPT_TINT = { sticky: [255, 214, 102] }; // styles with their own colour instead of the accent

// Only styles whose look IS a filled surface keep a fill; frames/lines/marks show the decoration alone,
// so the prompt text never sits on a leftover background
const PROMPT_AMOUNT = { card: 0.13, bubble: 0.12, glass: 0.08, sticky: 0.17, floating: 0.08, chat: 0.12 };
/** The same tint as a translucent fill — for prompts found by their text (they have no cell colour to carry it). */
function promptTintCss(style) {
  const [r, g, b] = PROMPT_TINT[style] || hexRgb((window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c[0]);
  return `rgba(${r},${g},${b},${Math.min(0.3, (PROMPT_AMOUNT[style] ?? 0) * 1.3).toFixed(3)})`;
}

/** Unique fill colour that marks prompt cells for an overlay style (also the box's tint). */
function promptMarker(style) {
  const acc = PROMPT_TINT[style] || hexRgb((window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c[0]);
  // practically invisible: it only marks which cells are the prompt — the visible tint is drawn on the box
  // itself (promptTintCss), so Codex (whose background spans the full width + padding rows) looks like Claude
  const tint = mixRgb(BASE_STAGE, acc, 0.015);
  void style;
  tint[2] = tint[2] % 2 ? tint[2] : tint[2] + 1; // odd blue channel: practically never used by real output
  tint[0] = tint[0] % 2 ? tint[0] - 1 : tint[0]; // even red channel
  return tint;
}

function bgRole(rgb) {
  const mx = Math.max(...rgb);
  const mn = Math.min(...rgb);
  if (mx - mn > 16) return 'color'; // diff green / red etc.: keep
  if (mx < 46) return 'dark';
  if (mx <= 110) return 'gray'; // prompt box
  return 'light';
}

function promptReplacement(style) {
  const acc = hexRgb((window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c[0]);
  switch (style) {
    case 'none': return '49';
    case 'subtle': return `48;2;${mixRgb(BASE_STAGE, isLight() ? [0, 0, 0] : [255, 255, 255], 0.06).join(';')}`;
    case 'accent': return `48;2;${mixRgb(BASE_STAGE, acc, 0.24).join(';')}`;
    case 'accentText': return `49;38;2;${acc.join(';')}`;
    default:
      if (OVERLAY_PROMPTS.has(style)) return `48;2;${promptMarker(style).join(';')}`;
      return isLight() ? `48;2;${mixRgb(BASE_STAGE, [0, 0, 0], 0.07).join(';')}` : null; // the gray box, made light
  }
}

/* ---------- prompt boxes drawn over the terminal ---------- */

const promptCell = { cell: null };
// styles that can also be drawn as a box when the prompt has no background of its own
const BOXED_PROMPTS = new Set([...OVERLAY_PROMPTS, 'subtle', 'accent']);

/**
 * Newer Claude Code (v2.x) draws your prompt without a background: "❯ text" with indented
 * continuation lines. Find those by their text instead — skipping the live input box at the bottom
 * (between the last two ──── rules) and menus ("❯ 1. Yes" etc. aren't preceded by a blank line).
 */
function textPromptBoxes(tab) {
  const buf = tab.term.buffer.active;
  const rows = tab.term.rows;
  const cols = tab.term.cols;
  const cell = promptCell.cell || (promptCell.cell = buf.getNullCell());
  const lineAt = (y) => buf.getLine(buf.viewportY + y);
  const text = (y) => (lineAt(y)?.translateToString(true) || '');
  const lastCol = (y) => { // in cells: Korean and other wide characters take two
    const line = lineAt(y);
    if (!line) return -1;
    for (let x = cols - 1; x >= 0; x--) { const c = line.getCell(x, cell); const ch = c && c.getChars(); if (ch && ch !== ' ') return x + (c.getWidth() === 2 ? 1 : 0); }
    return -1;
  };
  let inputTop = rows;
  let rules = 0;
  for (let y = rows - 1; y >= 0; y--) {
    if (/^\s*─{8,}/.test(text(y))) { rules++; if (rules === 2) { inputTop = y; break; } }
  }
  if (rules < 2) inputTop = rows;
  const boxes = [];
  for (let y = 0; y < inputTop; y++) {
    const s = text(y);
    const m = s.match(/^(\s*)[❯>›] \S/); // Claude "❯", Codex "›"
    if (!m) continue;
    if (y > 0 && text(y - 1).trim()) continue; // a prompt starts after a blank line; menu items don't
    const x0 = m[1].length;
    let y1 = y;
    let x1 = lastCol(y);
    while (y1 + 1 < inputTop) {
      const n = text(y1 + 1);
      if (!n.trim() || !n.startsWith(' '.repeat(x0 + 2)) || /^\s*[●⎿✻✶✳✢·*]/.test(n)) break;
      y1++;
      x1 = Math.max(x1, lastCol(y1));
    }
    if (x1 > x0) boxes.push({ y0: y, y1, x0, x1, text: true });
    y = y1;
  }
  // Codex has no ──── rules around its composer: the composer is simply the last "›" line on screen
  if (tab.agent === 'codex' && rules < 2) boxes.pop();
  return boxes;
}

function findPromptBoxes(tab) {
  const style = S.settings.promptStyle;
  if (!BOXED_PROMPTS.has(style)) return [];
  if (!OVERLAY_PROMPTS.has(style)) return tab.agent ? textPromptBoxes(tab) : [];
  const [r, g, b] = promptMarker(style);
  const want = (r << 16) | (g << 8) | b;
  const buf = tab.term.buffer.active;
  const rows = tab.term.rows;
  const cols = tab.term.cols;
  const cell = promptCell.cell || (promptCell.cell = buf.getNullCell());
  const spans = [];
  for (let y = 0; y < rows; y++) {
    const line = buf.getLine(buf.viewportY + y);
    if (!line) continue;
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < cols; x++) {
      const c = line.getCell(x, cell);
      if (c && c.isBgRGB() && c.getBgColor() === want) { if (x0 < 0) x0 = x; x1 = x; }
    }
    if (x0 >= 0) spans.push({ y, x0, x1 });
  }
  // merge consecutive rows into one box per prompt
  const boxes = [];
  for (const s of spans) {
    const last = boxes[boxes.length - 1];
    if (last && s.y === last.y1 + 1) { last.y1 = s.y; last.x0 = Math.min(last.x0, s.x0); last.x1 = Math.max(last.x1, s.x1); }
    else boxes.push({ y0: s.y, y1: s.y, x0: s.x0, x1: s.x1 });
  }
  if (!boxes.length && tab.agent) return textPromptBoxes(tab); // no background to find: go by the text
  // Codex paints its prompt background with an empty row above and below and across the full width:
  // shrink each box to the rows / columns that actually hold text, so every agent gets the same snug box
  const content = (y, x0, x1) => {
    const line = buf.getLine(buf.viewportY + y);
    if (!line) return null;
    let a = -1; let b = -1;
    for (let x = x0; x <= x1; x++) { const c = line.getCell(x, cell); const ch = c && c.getChars(); if (ch && ch.trim()) { if (a < 0) a = x; b = x + (c.getWidth() === 2 ? 1 : 0); } }
    return a < 0 ? null : [a, b];
  };
  return boxes.map((bx) => {
    let { y0, y1 } = bx;
    while (y0 < y1 && !content(y0, bx.x0, bx.x1)) y0++;
    while (y1 > y0 && !content(y1, bx.x0, bx.x1)) y1--;
    let x0 = Infinity; let x1 = -1;
    for (let y = y0; y <= y1; y++) { const c = content(y, bx.x0, bx.x1); if (c) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[1]); } }
    return x1 < 0 ? bx : { y0, y1, x0, x1 };
  });
}

function drawPromptBoxes(tab) {
  let layer = tab.host.querySelector('.pbox-layer');
  const boxes = tab.alive ? findPromptBoxes(tab) : [];
  if (!boxes.length) { if (layer) layer.innerHTML = ''; return; }
  const screen = tab.host.querySelector('.xterm-screen');
  if (!screen) return;
  if (!layer) { layer = h('div', 'pbox-layer'); tab.host.querySelector('.term-body').appendChild(layer); }
  const sr = screen.getBoundingClientRect();
  const br = layer.parentElement.getBoundingClientRect();
  const cw = sr.width / tab.term.cols;
  const ch = sr.height / tab.term.rows;
  const style = S.settings.promptStyle;
  layer.className = `pbox-layer ps-${style}`;
  let html = '';
  for (const bx of boxes) {
    const left = sr.left - br.left + bx.x0 * cw;
    const top = sr.top - br.top + bx.y0 * ch;
    const w = (bx.x1 - bx.x0 + 1) * cw;
    const hh = (bx.y1 - bx.y0 + 1) * ch;
    const fill = OVERLAY_PROMPTS.has(style) ? `;background:${promptTintCss(style)};border-radius:3px` : '';
    html += `<div class="pbox" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px${fill}">${style === 'badge' ? '<span class="pbox-badge">나</span>' : ''}</div>`;
  }
  if (layer.dataset.sig !== html) { layer.innerHTML = html; layer.dataset.sig = html; }
}

function schedulePromptBoxes(tab) {
  if (tab.pboxRaf) return;
  tab.pboxRaf = requestAnimationFrame(() => { tab.pboxRaf = 0; drawPromptBoxes(tab); });
}

const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
function rewriteSgr(params, dropDark, promptRepl, codex = false, light = false) {
  if (params.includes(':')) return null;
  if (!/(^|;)(4[0-8]|10[0-7])(;|$)/.test(params) && !(light && /(^|;)38(;|$)/.test(params))) return null;
  const p = params.split(';');
  const out = [];
  const decide = (rgb) => {
    const role = bgRole(rgb);
    // Codex only paints a background behind your prompt block, in a subtle tint of the terminal's own
    // background (darker than Claude's gray box): any neutral non-black background in a Codex tab is the prompt
    if (codex && promptRepl && role !== 'color' && Math.max(...rgb) >= 20 && Math.max(...rgb) <= 110) return promptRepl;
    if (role === 'dark' && dropDark) return '49';
    if (role === 'gray' && promptRepl) return promptRepl;
    // light mode: a dark coloured background (diff lines etc., made for a dark terminal) becomes a pale tint
    if (light && role === 'color' && luma(rgb) < 0.4) return `48;2;${mixRgb(rgb, [250, 251, 252], 0.78).join(";")}`;
    return null;
  };
  // light mode: text an agent coloured near-white for a dark terminal would vanish — use the normal text colour
  const fgFix = (rgb) => (light && luma(rgb) > 0.72 ? '39' : null);
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (v === '38' && p[i + 1] === '2' && i + 4 < p.length) {
      const rgb = p.slice(i + 2, i + 5).map(Number);
      out.push(fgFix(rgb) ?? `38;2;${rgb.join(';')}`);
      i += 4;
    } else if (v === '38' && p[i + 1] === '5' && i + 2 < p.length) {
      const n = Number(p[i + 2]);
      out.push((n >= 16 && fgFix(XTERM256[n] || [0, 0, 0])) || `38;5;${n}`); // 0–15 follow the (light) palette already
      i += 2;
    } else if (v === '48' && p[i + 1] === '2' && i + 4 < p.length) {
      const rgb = p.slice(i + 2, i + 5).map(Number);
      out.push(decide(rgb) ?? `48;2;${rgb.join(';')}`);
      i += 4;
    } else if (v === '48' && p[i + 1] === '5' && i + 2 < p.length) {
      const n = Number(p[i + 2]);
      out.push((n === 8 && promptRepl) ? promptRepl : (decide(XTERM256[n] || [0, 0, 0]) ?? `48;5;${n}`));
      i += 2;
    } else if (v === '100' && promptRepl) {
      out.push(promptRepl); // bright black: Claude's ANSI-theme prompt box
    } else if (/^(4[0-7]|10[0-7])$/.test(v)) {
      const idx = v.length === 3 ? 8 + Number(v) - 100 : Number(v) - 40;
      out.push(decide(hexRgb(currentTheme().ansi[idx])) ?? v);
    } else {
      out.push(v);
    }
  }
  return `\x1b[${out.join(';')}m`;
}

function filterOutput(tab, data) {
  const dropDark = isLight() || (needsClearTerminal() && S.settings.hideDarkBg !== false);
  const promptRepl = promptReplacement(S.settings.promptStyle || 'default');
  if (tab.pendingEsc) { data = tab.pendingEsc + data; tab.pendingEsc = ''; }
  if (!dropDark && !promptRepl) return data;
  // an escape sequence split across chunks: hold the tail for the next chunk
  const tail = data.match(/\x1b(\[[0-9;:]*)?$/);
  if (tail) {
    tab.pendingEsc = tail[0];
    data = data.slice(0, -tail[0].length);
    clearTimeout(tab.pendingTimer);
    tab.pendingTimer = setTimeout(() => { if (tab.pendingEsc) { tab.term.write(tab.pendingEsc); tab.pendingEsc = ''; } }, 40);
  }
  const codex = tab.agent === 'codex';
  return data.replace(/\x1b\[([0-9;:]*)m/g, (all, params) => rewriteSgr(params, dropDark, promptRepl, codex, isLight()) || all);
}

function previewPrompt(kind, el) {
  const repl = promptReplacement(kind);
  const acc = (window.ACCENTS[S.settings.accent] || window.ACCENTS.violet).c[0];
  const fg = currentTheme().fg; // light or dark text, like the real terminal
  let style = `background:${isLight() ? rgbCss(mixRgb(BASE_STAGE, [0, 0, 0], 0.07)) : '#373737'};color:${fg}`;
  if (kind === 'none') style = `background:transparent;color:${fg}`;
  else if (repl && repl.startsWith('48;2;')) style = `background:rgb(${repl.slice(5).split(';').join(',')});color:${fg}`;
  else if (kind === 'accentText') style = `background:transparent;color:${acc}`;
  if (OVERLAY_PROMPTS.has(kind)) {
    el.innerHTML = `<span class="pv-pbox ps-${kind}"><span class="pv-prompt" style="background:${promptTintCss(kind)};color:${fg}">❯ 버그 고쳐줘</span>${kind === 'badge' ? '<span class="pbox-badge">나</span>' : ''}</span>`;
    return () => {};
  }
  el.innerHTML = `<span class="pv-prompt" style="${style}">❯ 버그 고쳐줘</span>`;
  return () => {};
}

/*
 * Agents redraw a frame as "hide cursor … draw … show cursor". In a long conversation one frame is big and
 * reaches us in several chunks; drawing a chunk that ends with the cursor still hidden shows a half-drawn
 * frame with the cursor gone, so the cursor flickers. Hold such a chunk until the frame closes (the cursor
 * is shown again) — at most 40 ms, so an app that keeps the cursor hidden is never held up for long.
 */
function writeFramed(tab, data) {
  const buf = (tab.frameHeld || '') + data;
  const open = buf.lastIndexOf('\x1b[?25l') > buf.lastIndexOf('\x1b[?25h');
  if (open && buf.length < 1_000_000) {
    tab.frameHeld = buf;
    if (!tab.frameTimer) tab.frameTimer = setTimeout(() => flushFrame(tab), 40);
    return;
  }
  clearTimeout(tab.frameTimer);
  tab.frameTimer = 0;
  tab.frameHeld = '';
  tab.term.write(buf);
}
function flushFrame(tab) {
  tab.frameTimer = 0;
  const buf = tab.frameHeld || '';
  tab.frameHeld = '';
  if (buf) tab.term.write(buf);
}

window.mt.pty.onData((id, data) => {
  const tab = tabById(id);
  if (!tab) return;
  data = filterOutput(tab, data);
  writeFramed(tab, data);
  const now = Date.now();
  tab.lastOut = now;
  if (tab.status === 'starting' && !tab.launch) setStatus(tab, 'shell');
  if (!tab.agent || !tab.armed) return;
  if (now - tab.lastIn < 150 || now - tab.lastResize < 700) return;
  if (data.length < 4) return;
  if (tab.status !== 'working') {
    tab.workStart = now;
    setStatus(tab, 'working');
  }
});

window.mt.pty.onExit((id, code) => {
  const tab = tabById(id);
  if (!tab) return;
  tab.alive = false;
  if (tab.agent) setAgent(tab, null);
  setStatus(tab, 'exited');
  tab.term.write(`\r\n\x1b[38;2;92;99;117m─── ${tr(`셸이 종료되었습니다 (코드 ${code}) · Enter: 다시 시작 · Ctrl+Shift+W: 닫기`)} ───\x1b[0m\r\n`);
  saveLayout();
});

window.mt.pty.onAgent((id, agent) => {
  const tab = tabById(id);
  if (tab) setAgent(tab, agent);
});

function setAgent(tab, agent) {
  if (tab.agent === agent) return;
  const prev = tab.agent;
  tab.agent = agent;
  tab.oscTitle = '';
  if (agent) {
    tab.agentSince = Date.now();
    tab.workStart = Date.now();
    if (tab.launch && tab.launch.type === agent) {
      tab.sessionId = tab.launch.sessionId || '';
      tab.permissionMode = tab.launch.permissionMode || '';
    } else {
      tab.sessionId = '';
      tab.permissionMode = '';
    }
    tab.launch = null;
    tab.armed = false;
    setStatus(tab, 'ready');
    tab.el.classList.add('agent-pop');
    setTimeout(() => tab.el.classList.remove('agent-pop'), 500);
  } else {
    if (prev) { S.sessionCache.delete(normP(tab.cwd)); syncTask(tab, 'shell'); tab.taskId = ''; }
    tab.sessionId = '';
    tab.permissionMode = '';
    if (tab.alive) setStatus(tab, 'shell');
  }
  updateTabEl(tab);
  renderSessions();
  renderProjects();
  if (tab.id === S.activeId) renderStatus();
  saveLayout();
}

function setCwd(tab, cwd) {
  if (!cwd || samePath(cwd, tab.cwd)) return;
  tab.cwd = cwd;
  updateTabEl(tab);
  if (S.grid) applyLayout();
  renderProjects();
  if (tab.id === S.activeId) renderStatus();
  saveLayout();
}

/**
 * Agents ring the bell / send an OSC 9 notification when a turn ends or when they need an answer.
 * While working, that is the end of the turn: finish it (or flag it if it is a question).
 */
function onAgentNotify(tab, text) {
  if (!tab.agent) return;
  const msg = cleanOscTitle(text) || text || '';
  const asks = /permission|approv|allow|confirm|권한|허용|승인|확인/i.test(msg);
  if ((tab.status === 'working' || (tab.status === 'attention' && !tab.awaitChoice)) && !asks) {
    finishWork(tab, Math.max(Date.now(), tab.lastOut) - tab.workStart);
    return;
  }
  if (asks || tab.status === 'working') {
    tab.armed = false; // the agent is waiting: trailing redraws must not flip it back to 실행 중
    if (tab.id === S.activeId && S.winFocused) { setStatus(tab, 'attention'); return; }
    setAttention(tab, msg || '확인이 필요합니다');
  }
}

/*
 * Claude and Codex both show "esc to interrupt" under their spinner for as long as a turn runs.
 * Seeing it means the agent IS working, whatever started it — a prompt sent before MinsuTerm was
 * restarted, a resumed session picking its turn back up, or input we didn't catch. 입력 대기 → 진행 중.
 */
// Claude: '✻ Manifesting… (9s · ↓ 92 tokens)'  ·  Codex: '• Working (9s • esc to interrupt)' — a running timer in
// parentheses. When the turn ends both switch to 'Worked for 5s' (no parentheses).
const WORKING_BANNER = /esc to interrupt|…\s*\((?:\d+h\s*)?(?:\d+m\s*)?\d+s\b/i; // (a tool line like "ping … (5s · 7 lines)" stays after the turn: not matched)
function screenSaysWorking(tab) {
  const t = tab.term;
  const b = t.buffer.active;
  for (let y = t.rows - 1; y >= Math.max(0, t.rows - 14); y--) {
    const line = b.getLine(b.baseY + y); // the live screen, even if the user scrolled back
    if (line && WORKING_BANNER.test(line.translateToString(true))) return true;
  }
  return false;
}
/*
 * The agent stopped to ask: a choice (Claude: "Enter to select · ↑/↓ to navigate · Esc to cancel"),
 * a permission ("Do you want to proceed?"), a Codex approval ("Press enter to confirm") …
 */
const BUBBLE_STYLES = [
  ['classic', '기본 주황', '주황 말풍선이 살짝 숨쉬듯'],
  ['pastel', '파스텔 구름', '몽글몽글 떠다니는 파스텔 말풍선'],
  ['neon', '네온 사인', '어둠 속 핑크 네온이 지직'],
  ['comic', '만화 말풍선', '굵은 선의 만화 컷, 들썩들썩'],
  ['thought', '생각 구름', '💭 동글동글 생각 방울'],
  ['hand', '손 흔들기', '🙋 여기요! 손을 흔듦'],
  ['bell', '종 울림', '🔔 딸랑딸랑 흔들리는 종'],
  ['typing', '채팅 입력 중', '메신저처럼 점 세 개가 통통'],
  ['glitch', '글리치', '빨강·파랑으로 갈라지며 지직'],
  ['rainbow', '무지개 테두리', '무지개 테두리가 빙글'],
  ['pixel', '8비트 픽셀', '레트로 게임 대화창과 깜빡 커서'],
  ['jelly', '젤리', '말랑말랑 출렁이는 젤리'],
  ['siren', '경광등', '🚨 빨강·파랑이 번갈아 번쩍'],
  ['sticky', '포스트잇', '노란 메모가 팔랑팔랑'],
  ['heart', '두근두근', '💗 심장처럼 두근거림'],
  ['chalk', '칠판', '초록 칠판에 분필로 쓴 글씨'],
  ['gold', '황금', '👑 금빛 명판 위로 광택이 스윽'],
  ['ghost', '유령', '👻 둥실 떠서 스르르 나타났다 사라짐'],
  ['space', '우주 통신', '🛸 반짝이는 별밤 속 교신'],
  ['gum', '풍선껌', '🍬 부풀었다가 퐁! 터짐'],
];
/** The "waiting for your choice" bubble, in the style picked in 꾸미기 (or a given one, for previews). */
function choiceBubbleHtml(style = S.settings.choiceBubble || 'classic') {
  const dots = '<i>.</i><i>.</i><i>.</i>';
  const pre = { thought: '<b class="cb-ico">💭</b>', hand: '<b class="cb-ico">🙋</b>', bell: '<b class="cb-ico">🔔</b>', siren: '<b class="cb-ico">🚨</b>', heart: '<b class="cb-ico">💗</b>', gold: '<b class="cb-ico">👑</b>', ghost: '<b class="cb-ico">👻</b>', space: '<b class="cb-ico">🛸</b>' }[style] || '';
  const body = style === 'typing' ? '선택 기다리는 중 <span class="cb-typing"><u></u><u></u><u></u></span>'
    : style === 'pixel' ? '선택지를 기다리는 중<span class="cb-caret">▌</span>'
    : style === 'glitch' ? '<span class="cb-gl" data-t="선택지를 기다리는 중...">선택지를 기다리는 중...</span>'
    : `선택지를 기다리는 중${dots}`;
  return `<span class="choice-bubble cb-${style}">${pre}${body}</span>`;
}
function previewBubble(kind, el) { el.innerHTML = choiceBubbleHtml(kind); return () => {}; }

const CHOICE_PROMPT = /Enter to select|↑\/↓ to navigate|Do you want to (proceed|make this edit|create|allow|run)|Would you like to (run|make|apply|proceed|allow)|Press enter to confirm|Allow (this )?command\?/i;
function screenSaysChoice(tab) {
  const t = tab.term;
  const b = t.buffer.active;
  for (let y = t.rows - 1; y >= Math.max(0, t.rows - 26); y--) {
    const line = b.getLine(b.baseY + y);
    if (line && CHOICE_PROMPT.test(line.translateToString(true))) return true;
  }
  return false;
}
/** 진행 중 → 선택지를 기다리는 중: flag the task, and tell the user wherever they are. */
function awaitChoice(tab) {
  if (tab.awaitChoice) return;
  tab.awaitChoice = true;
  tab.armed = false;
  setStatus(tab, 'attention');
  if (tab.id !== S.activeId || !S.winFocused) { tab.unseen = true; updateTabEl(tab); }
  const name = AGENTS[tab.agent] ? AGENTS[tab.agent].name : 'MinsuTerm';
  if (S.settings.notifications !== false) {
    window.mt.notify({ title: `${name} · ${tr('선택이 필요해요')}`, body: `${tabLabel(tab)} — ${tr('선택지를 기다리는 중…')}`, tabId: tab.id });
    if (!S.winFocused) window.mt.attention();
  }
  renderSessions();
  renderProjects();
  if (tab.id === S.activeId) renderStatus();
}
setInterval(() => {
  for (const tab of S.tabs) {
    if (!tab.agent || !tab.alive) continue;
    const asking = screenSaysChoice(tab);
    if (asking && (tab.status === 'working' || tab.status === 'attention')) awaitChoice(tab);
    else if (!asking && tab.awaitChoice) { // answered: back to work
      tab.awaitChoice = false;
      tab.armed = true;
      tab.armedAt = Date.now();
      setStatus(tab, 'working');
      updateTabEl(tab);
      renderSessions();
      renderProjects();
      if (tab.id === S.activeId) renderStatus();
    }
  }
}, 600);

setInterval(() => {
  const now = Date.now();
  for (const tab of S.tabs) {
    if (!tab.agent || !tab.alive || tab.status === 'working' || (tab.status === 'attention' && tab.awaitChoice)) continue;
    if (now - tab.lastOut > 4000) continue; // a working agent animates its spinner constantly
    const b = tab.term.buffer.active;
    if (now < (tab.bannerHold || 0) || !screenSaysWorking(tab)) { tab.bannerSeen = 0; continue; }
    if ((tab.bannerSeen = (tab.bannerSeen || 0) + 1) < 2) continue; // seen twice in a row, not a stale frame
    tab.bannerSeen = 0;
    tab.armed = true;
    tab.armedAt = tab.armedAt || now;
    tab.workStart = tab.restoredWorkSince || now;
    tab.restoredWorkSince = 0;
    setStatus(tab, 'working');
    updateTabEl(tab);
    renderSessions();
    renderProjects();
    if (tab.id === S.activeId) renderStatus();
  }
}, 700);

// 실행 중 → 완료: when the transcript records the end of the turn, or (fallback) when output goes quiet
setInterval(() => {
  const now = Date.now();
  for (const tab of S.tabs) {
    if (tab.status !== 'working') continue;
    if (now - tab.lastOut < 1600) { checkTurn(tab, now); continue; }
    finishWork(tab, tab.lastOut - tab.workStart);
  }
}, 400);

/** The agent's working timer is on screen and still ticking (a frozen, stale line doesn't count). */
function stillWorking(tab) {
  return !!tab.agent && Date.now() - tab.lastOut < 5000 && screenSaysWorking(tab);
}

function finishWork(tab, duration) {
  if (stillWorking(tab)) return; // output paused, a bell, or the transcript looked finished — but it isn't
  if (tab.agent && screenSaysChoice(tab)) { awaitChoice(tab); return; } // quiet because it waits for an answer
  // sub-agents launched in the background keep working after the agent's own turn ends: not done until they are
  if (tab.agent && tab.sessionId && Date.now() - (tab.subPolledAt || 0) > 2000) { pollSubagents(tab).then((c) => { if (c) renderProjects(); }); return; }
  if (hasRunningSubs(tab)) return;
  tab.armed = false;
  tab.bannerHold = Date.now() + 3000; // the spinner line may linger a moment after the turn ends
  tab.lastDuration = duration;
  if (duration < 800) { setStatus(tab, 'ready'); return; } // just an echo / redraw
  setStatus(tab, 'done');
  if (duration > 1000) celebrate(tab);
  if (tab.id !== S.activeId || !S.winFocused) {
    tab.unseen = true;
    updateTabEl(tab);
    if (duration > 2500) notifyTab(tab, `완료 (${elapsedText(duration)})`);
  }
  if (duration > 1200) trackSession(tab, tab.workStart - 1500);
}

/**
 * Agents may keep redrawing (status lines, timers) after they finish, so output never goes quiet.
 * The transcript is authoritative: once it records the end of this turn, the task is done.
 */
async function checkTurn(tab, now) {
  if (!tab.agent || tab.turnBusy || now - tab.workStart < 2500 || now - (tab.turnAt || 0) < 1500) return;
  tab.turnBusy = true;
  tab.turnAt = now;
  try {
    if (!tab.sessionId) await trackSession(tab, tab.workStart - 1500); // user-typed agent: find its session
    if (!tab.sessionId || tab.status !== 'working') return;
    const { state, mtime } = await window.mt.agent.turn(tab.agent, tab.cwd, tab.sessionId);
    // compare with the moment the prompt was sent (output may only start later)
    if (state === 'done' && mtime >= (tab.armedAt || tab.workStart) && tab.status === 'working') {
      finishWork(tab, Math.max(tab.lastOut, mtime) - tab.workStart);
    }
  } catch { /* ignore */ } finally {
    tab.turnBusy = false;
  }
}

function elapsedText(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

function setStatus(tab, status) {
  if (tab.status === status) return;
  tab.status = status;
  if (tab.agent || status === 'exited' || status === 'shell') syncTask(tab, status);
  updateTabEl(tab);
  renderSessions();
  if (tab.id === S.activeId) renderStatus();
}

/** Agent asked something / sent a notification: mark it and tell the user. */
function setAttention(tab, what) {
  tab.armed = false;
  setStatus(tab, 'attention');
  if (tab.id !== S.activeId || !S.winFocused) { tab.unseen = true; updateTabEl(tab); }
  notifyTab(tab, what);
}

function notifyTab(tab, what) {
  if (!S.settings.notifications) return;
  const name = tab.agent ? AGENTS[tab.agent].name : 'MinsuTerm';
  const text = `${tabLabel(tab)} — ${what}`;
  if (!S.winFocused) {
    window.mt.notify({ title: `${name} · MinsuTerm`, body: tr(text), tabId: tab.id });
    window.mt.attention();
  } else {
    toast(text, { icon: tab.agent ? AGENTS[tab.agent].icon : 'bell', onClick: () => activate(tab.id) });
  }
}

/** Follow which session an agent tab is on (covers --continue, /resume, /clear, /new). */
async function trackSession(tab, since) {
  if (!tab.agent) return;
  try {
    const agent = tab.agent;
    const ids = await window.mt.agent.recent(agent, tab.cwd, since);
    if (tab.agent !== agent || !ids.length) return;
    const claimed = new Set(S.tabs.filter((t) => t !== tab && t.agent === agent && t.sessionId).map((t) => t.sessionId));
    const mine = ids.filter((x) => !claimed.has(x));
    if (!mine.length || (tab.sessionId && mine.includes(tab.sessionId))) return;
    tab.sessionId = mine[0];
    S.sessionCache.delete(normP(tab.cwd));
    saveLayout();
    if (tab.id === S.activeId) renderStatus();
    renderProjects();
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function sortedProjects() {
  return [...S.projects].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

async function sessionsFor(projPath, force) {
  const key = normP(projPath);
  const c = S.sessionCache.get(key);
  if (c && !force && Date.now() - c.at < 15000) return c.list;
  const list = await window.mt.agent.sessions(projPath, 40);
  S.sessionCache.set(key, { at: Date.now(), list });
  return list;
}

/* ------------------------------------------------------------------ */
/* 현재 탭: the tab(s) on screen right now — one card per pane          */
/* ------------------------------------------------------------------ */

/** Tiny map of the layout with this pane's cell highlighted. */
function paneMapSvg(view, index) {
  const n = view.tiles.length;
  if (n < 2) return '';
  let cols;
  if (view.dir === 'row') cols = n;
  else if (view.dir === 'col') cols = 1;
  else cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const W = 22;
  const H = 16;
  const g = 1.6;
  const cw = (W - g * (cols - 1)) / cols;
  const ch = (H - g * (rows - 1)) / rows;
  let cells = '';
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    let span = 1;
    const rem = n % cols;
    if (i === n - 1 && cols > 1 && rem) span = cols - rem + 1; // last tile stretches, as on screen
    const w = cw * span + g * (span - 1);
    cells += `<rect x="${(c * (cw + g)).toFixed(2)}" y="${(r * (ch + g)).toFixed(2)}" width="${w.toFixed(2)}" height="${ch.toFixed(2)}" rx="1.6" class="${i === index ? 'on' : ''}"/>`;
  }
  return `<svg class="pane-map" viewBox="0 0 ${W} ${H}" aria-hidden="true">${cells}</svg>`;
}

function currentCardHtml(t, view, index) {
  const agent = t.agent;
  // status first (never truncated), folder after it (ellipsized if tight); the icon already says which agent
  const status = agent || t.status === 'exited'
    ? `<span class="cc-status st-${t.status}"><i></i>${statusHtml(t)}</span>`
    : `<span class="cc-status shell">${esc(shellName(t.shellId))}</span>`;
  const sub = `<span class="cc-place">${esc(tabPlace(t))}</span>`;
  return `
    <div class="cur-card${agent ? ' ' + agent : ' shell'} st-${t.status}${t.id === S.activeId ? ' focused' : ''}${t.unseen ? ' unseen' : ''}" data-cur="${t.id}" title="${esc(t.cwd)}">
      <span class="cc-ico">${icon(tabIconName(t))}</span>
      <span class="cc-text">
        <span class="cc-title">${esc(tabLabel(t))}</span>
        <span class="cc-sub">${status}${sub}</span>
      </span>
      <span class="cc-side">
        ${paneMapSvg(view, index)}
        <button class="cc-end" data-a="end" title="${agent ? '세션 종료' : '탭 닫기'}">${icon(agent ? 'stop' : 'x')}</button>
      </span>
    </div>`;
}

function renderCurrent() {
  const root = $('#current');
  if (!root) return;
  const view = currentView();
  const tabs = view.tiles.length ? view.tiles : (activeTab() ? [activeTab()] : []);
  const label = view.kind === 'split' ? `분할 ${tabs.length}` : view.kind === 'project' ? `폴더 보기 ${tabs.length}` : '';
  $('#current-kind').textContent = label;
  $('#current-kind').hidden = !label;
  const html = tabs.length
    ? tabs.map((t, i) => currentCardHtml(t, view, view.tiles.length ? i : 0)).join('')
    : '<div class="child-note slim">열린 탭이 없습니다</div>';
  if (root.dataset.sig !== html) { root.innerHTML = html; root.dataset.sig = html; }
}

(function currentEvents() {
  const root = $('#current');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-cur]');
    if (!card) return;
    if (e.target.closest('[data-a="end"]')) return closeTab(card.dataset.cur);
    activate(card.dataset.cur);
  });
  root.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('[data-cur]');
    const t = card && tabById(card.dataset.cur);
    if (!t) return;
    e.preventDefault();
    activate(t.id);
    openTabMenu(t, e.clientX, e.clientY);
  });
})();

/* ------------------------------------------------------------------ */
/* Sidebar per folder: 세션 (live + 지난 대화) · 진행 중 작업 · 완료     */
/* ------------------------------------------------------------------ */

const isInside = (cwd, root) => { const c = normP(cwd); const r = normP(root); return c === r || c.startsWith(r + '\\') || c.startsWith(r + '/'); };

/** Project that owns a folder (deepest match, so nested projects win). */
function ownerProject(cwd) {
  let best = null;
  for (const p of S.projects) if (isInside(cwd, p.path) && (!best || p.path.length > best.path.length)) best = p;
  return best;
}

function renderAgents() { /* agents live under their folder */ }

const RUNNING_TASK = new Set(['pending', 'working', 'attention']);

function sectionToggle(kind, key, label, count, openByDefault) {
  const id = `${kind}:${key}`;
  const open = openByDefault ? !S.secClosed.has(id) : S.secOpen.has(id);
  return {
    open,
    html: `<button class="sec-toggle${open ? ' open' : ''}" data-sec="${esc(id)}" data-default="${openByDefault ? 'open' : 'closed'}">
      <span class="chev">${icon('chevronRight')}</span>${label}${count != null ? ` <span class="hc">${count}</span>` : ''}</button>`,
  };
}

function sessionRowHtml(t) {
  return `
    <div class="item child run st-${t.status}${t.id === S.activeId ? ' active' : ''}${t.unseen ? ' unseen' : ''} agent-${t.agent}" data-t="${t.id}" title="${esc(AGENTS[t.agent].name)} · ${esc(t.cwd)}">
      <span class="child-ico">${icon(t.agent)}<i class="dot"></i></span>
      <span class="item-text">
        <span class="item-name">${esc(tabLabel(t))}</span>
        ${t.awaitChoice ? `<span class="item-sub has-bubble">${choiceBubbleHtml()}</span>` : `<span class="item-sub">${esc(AGENTS[t.agent].name)} · ${statusHtml(t)}</span>`}
      </span>
      <span class="item-actions"><button class="icon-btn danger" data-a="end" title="세션 종료">${icon('stop')}</button></span>
    </div>`;
}

/* ---------- 하수인: little worker characters for an agent's sub-agents ---------- */

const MINION_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#9775fa', '#f783ac', '#e599f7', '#66d9e8', '#a9e34b', '#ff8787', '#ffc078'];
// Bold, simple silhouettes that still read at 20 px: shape + colour + big eyes, nothing more.
const MINION_BODIES = [
  { d: '<circle cx="10" cy="10.5" r="7.5"/>', ey: 10 }, // 동글이
  { d: '<rect x="3" y="5" width="14" height="12.5" rx="3.5"/><rect x="9" y="1.6" width="2" height="4" rx="1"/>', ey: 11 }, // 로봇
  { d: '<path d="M3 18.5V10a7 7 0 0 1 14 0v8.5l-2.4-1.8-2.3 1.8L10 16.7l-2.3 1.8-2.3-1.8z"/>', ey: 10 }, // 유령
  { d: '<path d="M3.2 7.6 3 1.8l4.6 3.1h4.8L17 1.8l-.2 5.8A7.4 7.4 0 1 1 3.2 7.6z"/>', ey: 11.2 }, // 고양이
  { d: '<rect x="4.6" y=".8" width="3.4" height="8.4" rx="1.7"/><rect x="12" y=".8" width="3.4" height="8.4" rx="1.7"/><circle cx="10" cy="12.4" r="6.6"/>', ey: 12 }, // 토끼
  { d: '<path d="M10 1.6c2.8 3.9 7.4 7.5 7.4 11a7.4 7.4 0 0 1-14.8 0c0-3.5 4.6-7.1 7.4-11z"/>', ey: 12.6 }, // 물방울
  { d: '<circle cx="4.6" cy="5" r="2.8"/><circle cx="15.4" cy="5" r="2.8"/><circle cx="10" cy="11" r="7"/>', ey: 10.6 }, // 곰
  { d: '<circle cx="7.3" cy="6.4" r="3.2"/><circle cx="12.7" cy="6.4" r="3.2"/><ellipse cx="10" cy="12.8" rx="8" ry="5.6"/>', ey: 6.4 }, // 개구리
  { d: '<path d="M3 11a7 7 0 0 1 14 0v3.6c0 1-.9 1.2-1.4.5-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5.7-1.4.5-1.4-.5z"/>', ey: 10 }, // 문어
  { d: '<path d="M10 1.4l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L10 13.8l-5 2.8 1.2-5.6L2 7.2l5.6-.6z" stroke-linejoin="round"/>', ey: 9.4 }, // 별
  { d: '<path d="M5 6.4h10l2.2 11H2.8z"/><path d="M5 6.4c0-2.6 2.2-3.4 5-3.4s5 .8 5 3.4" opacity=".55"/>', ey: 11.4 }, // 푸딩
];
function minionHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** A tiny worker character: one of 6 shapes × 14 colours × 3 eye styles, picked from the sub-agent's id. */
function minionSvg(seed, work = '') {
  let h = minionHash(String(seed));
  const pick = (n) => { const v = h % n; h = Math.floor(h / n) ^ (h << 7); h >>>= 0; return v; };
  const body = MINION_BODIES[pick(MINION_BODIES.length)];
  const c = MINION_COLORS[pick(MINION_COLORS.length)];
  const ink = '#1a1d26';
  const ey = body.ey;
  const kind = pick(3);
  let eyes;
  if (kind === 0) eyes = `<circle cx="7.3" cy="${ey}" r="1.7"/><circle cx="12.7" cy="${ey}" r="1.7"/>`; // big dots
  else if (kind === 1) eyes = `<path d="M5.7 ${ey + 0.8}q1.6-2.4 3.2 0M11.1 ${ey + 0.8}q1.6-2.4 3.2 0" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/>`; // happy ^^
  else eyes = `<circle cx="10" cy="${ey}" r="3.3" fill="#fff"/><circle cx="10.6" cy="${ey}" r="1.8"/>`; // one big eye
  // welding: a dark visor with a glint instead of eyes
  const face = work === 'weld'
    ? `<rect x="3.6" y="${ey - 2.4}" width="12.8" height="4.8" rx="1.6" fill="#2a3140"/><rect x="5" y="${ey - 1.2}" width="10" height="2.2" rx="1" fill="#5ff0ff" class="mn-visor"/>`
    : `<g fill="${ink}" class="mn-eyes">${eyes}</g>`;
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><g fill="${c}">${body.d}</g>${face}</svg>`;
}
// what a minion is doing (one per sub-agent): a little prop, and the effect of the work
const MINION_WORK = ['magnify', 'weld', 'hammer', 'laptop', 'papers', 'gear', 'dig', 'paint', 'saw', 'broom', 'flask', 'drill', 'water', 'book', 'radio'];
const MINION_PROPS = {
  magnify: '<svg class="mn-prop" viewBox="0 0 12 12"><circle cx="5" cy="5" r="3.2" fill="rgba(170,225,255,.45)" stroke="#d6dde9" stroke-width="1.5"/><path d="M7.4 7.4 10.8 10.8" stroke="#b07a4a" stroke-width="2" stroke-linecap="round"/><path d="M3.6 3.8a1.8 1.8 0 0 1 1.6-1" stroke="#fff" stroke-width=".8" fill="none" stroke-linecap="round"/></svg>',
  weld: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="5" y="2" width="2.6" height="7" rx="1" fill="#8d96a8" transform="rotate(35 6 6)"/><rect x="2.4" y="8.2" width="2.2" height="1.6" rx=".5" fill="#c9d1de" transform="rotate(35 6 6)"/><circle class="mn-flame" cx="2.2" cy="10" r="1.6" fill="#bff6ff"/></svg>',
  hammer: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="5.3" y="3.6" width="1.5" height="7.6" rx=".6" fill="#b07a4a"/><rect x="2" y="1.2" width="8" height="3.4" rx="1" fill="#9aa3b5"/></svg>',
  laptop: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1.5" y="2.5" width="9" height="6" rx=".8" fill="#5b6478"/><rect x="2.4" y="3.3" width="7.2" height="4.4" rx=".4" fill="#38e1ff" class="mn-screen"/><path d="M.5 9.2h11l-1 1.6h-9z" fill="#8d96a8"/></svg>',
  papers: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="2" y="4" width="7" height="7" rx=".6" fill="#f1f3f7"/><path d="M3.4 6h4.2M3.4 7.6h4.2M3.4 9.2h2.8" stroke="#9aa3b5" stroke-width=".8"/></svg>',
  gear: '<svg class="mn-prop" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.7" fill="none" stroke="#9aa3b5" stroke-width="2.6" stroke-dasharray="1.7 1.2"/><circle cx="6" cy="6" r="2.2" fill="#9aa3b5"/><circle cx="6" cy="6" r=".9" fill="#1a1d26"/></svg>',
  dig: '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M9.6 1.2 5.4 6.6" stroke="#b07a4a" stroke-width="1.5" stroke-linecap="round"/><path d="M4.2 5.4 7 7.6 4.6 10.8c-.8.9-2.6-.4-2.1-1.6z" fill="#aab3c3"/></svg>',
  paint: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="8" height="3.4" rx="1.6" fill="var(--paint)"/><path d="M9.5 3.2h1.3v3.4H6v4.4" fill="none" stroke="#9aa3b5" stroke-width="1.1"/></svg>',
};
MINION_PROPS.saw = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M1 5.2h8.6v2.6H1z" fill="#c9d1de"/><path d="M1 7.8l.9 1 .9-1 .9 1 .9-1 .9 1 .9-1 .9 1 .9-1 .9 1" fill="none" stroke="#c9d1de" stroke-width=".8"/><rect x="9.2" y="4.2" width="2.4" height="4.6" rx="1" fill="#b07a4a"/></svg>';
MINION_PROPS.broom = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M8.6 .8 6 7" stroke="#b07a4a" stroke-width="1.3" stroke-linecap="round"/><path d="M4.2 6.4 7.6 7.8 6.6 11.4 1.8 9.4z" fill="#e8c56a"/></svg>';
MINION_PROPS.flask = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M4.6 1.2h2.8M5 1.2v3.6L2 10.2c-.4.8.1 1.4.9 1.4h6.2c.8 0 1.3-.6.9-1.4L7 4.8V1.2" fill="#e9f4ff" stroke="#c9d1de" stroke-width=".7"/><path d="M3.2 8.4h5.6l1.1 1.9c.3.6 0 1-.6 1H2.7c-.6 0-.9-.4-.6-1z" fill="#7cf29a"/></svg>';
MINION_PROPS.drill = '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1" y="3" width="6.4" height="3.6" rx="1.2" fill="#ffb02e"/><rect x="2.4" y="6" width="2.2" height="4.6" rx=".8" fill="#4a5163"/><path d="M7.4 4.8h4" stroke="#c9d1de" stroke-width="1.2" stroke-dasharray="1 .5"/></svg>';
MINION_PROPS.water = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M1.6 4.4h5.6v5.4c0 .7-.5 1.2-1.2 1.2H2.8c-.7 0-1.2-.5-1.2-1.2z" fill="#4dabf7"/><path d="M7.2 6l3.6-2.4" stroke="#4dabf7" stroke-width="1.3" stroke-linecap="round"/><path d="M2.6 4.4a1.8 1.8 0 0 1 3.6 0" fill="none" stroke="#4dabf7" stroke-width=".9"/></svg>';
MINION_PROPS.book = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M6 3.2C4.4 2.2 2.6 2 1 2.4v7.4c1.6-.4 3.4-.2 5 .8 1.6-1 3.4-1.2 5-.8V2.4c-1.6-.4-3.4-.2-5 .8z" fill="#f1f3f7" stroke="#9775fa" stroke-width=".7"/><path class="mn-page" d="M6 3.2v7.4C7.6 9.6 9.4 9.4 11 9.8V2.4c-1.6-.4-3.4-.2-5 .8z" fill="#e3e6ee"/></svg>';
MINION_PROPS.radio = '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="2" y="4.6" width="5" height="6.8" rx="1" fill="#4a5163"/><rect x="3" y="5.6" width="3" height="1.6" rx=".3" fill="#69db7c"/><path d="M5.6 4.6V1" stroke="#9aa3b5" stroke-width=".9"/></svg>';
const MINION_FX = { weld: 4, hammer: 1, laptop: 3, papers: 3, dig: 3, magnify: 0, gear: 0, paint: 1, saw: 3, broom: 3, flask: 3, drill: 3, water: 3, book: 0, radio: 3 }; // particles per action

const SUBAGENT_KIND = { 'general-purpose': '범용', explore: '탐색', plan: '계획', 'statusline-setup': '설정', 'claude-code-guide': '안내', 'code-reviewer': '리뷰', 'test-runner': '테스트' };
const subagentKind = (k) => SUBAGENT_KIND[String(k).toLowerCase()] || k;

/** Rows for the sub-agents an agent's running task launched, hung under the task. */
function subagentRowsHtml(tab) {
  const list = (tab && tab.subagents) || [];
  const now = Date.now();
  // the check badge: pops onto the minion with a ring and sparkles, the tick drawing itself in
  const badge = (a) => {
    if (a.status !== 'done') return '';
    const fresh = !!(tab.subCheer && tab.subCheer.has(a.id));
    return `<span class="mn-check${fresh ? ' fresh' : ''}"><i class="ring"></i><i class="sp s0"></i><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.4"/><path d="M3.4 6.3l1.8 1.8 3.6-3.8"/></svg></span>`;
  };
  const rows = list.map((a) => `
    <div class="item child subagent sa-${a.status}" title="${esc(a.kind)}${a.name ? ' · ' + esc(a.name) : ''}">
      ${(() => {
        const w = MINION_WORK[minionHash(a.id + ':work') % MINION_WORK.length];
        const live = a.status === 'running';
        const paint = MINION_COLORS[minionHash(a.id + ':paint') % MINION_COLORS.length];
        const fx = live ? Array.from({ length: MINION_FX[w] || 0 }, (_, i) => `<i class="mfx f${i}"></i>`).join('') : '';
        const fresh = a.status === 'done' && !!(tab.subCheer && tab.subCheer.has(a.id));
        return `<span class="minion mw-${w}${fresh ? ' mn-cheer' : ''}" style="--paint:${paint}">${minionSvg(a.id, live ? w : '')}${live ? MINION_PROPS[w] : ''}${fx}${badge(a)}</span>`;
      })()}
      <span class="sa-text"><b>${esc(subagentKind(a.kind))}</b>${a.name ? `<span class="sa-sum">(${esc(a.name)})</span>` : ''}</span>
      <span class="sa-state">${a.status === 'running' ? '<i></i><i></i><i></i>' : a.status === 'failed' ? icon('x') : ''}</span>
    </div>`).join('');
  if (tab && tab.subCheer && tab.subCheer.size) { for (const id of tab.subCheer) tab.subCheered.add(id); tab.subCheer.clear(); }
  return rows;
}

const hasRunningSubs = (tab) => !!(tab.subagents && tab.subagents.some((a) => a.status === 'running'));
/** Take a fresh sub-agent list; returns true if anything changed. */
function applySubagents(tab, list) {
  const key = JSON.stringify(list.map((a) => [a.id, a.status, a.name]));
  if (key === tab.subKey) return false;
  // the finish animation is earned once: seen running, then seen done — never replayed
  tab.subRan = tab.subRan || new Set();
  tab.subCheer = tab.subCheer || new Set(); // waiting to play
  tab.subCheered = tab.subCheered || new Set(); // already played
  for (const a of list) {
    if (a.status === 'running') tab.subRan.add(a.id);
    else if (a.status === 'done' && tab.subRan.has(a.id) && !tab.subCheered.has(a.id)) tab.subCheer.add(a.id);
  }
  tab.subKey = key;
  tab.subagents = list;
  return true;
}
async function pollSubagents(tab) {
  tab.subPolledAt = Date.now();
  try {
    return applySubagents(tab, await window.mt.agent.subagents(tab.agent, tab.cwd, tab.sessionId, (tab.workStart || Date.now()) - 3000));
  } catch { return false; }
}
// poll a working agent's transcript for its sub-agents (and keep polling while any is still running)
setInterval(async () => {
  let changed = false;
  for (const tab of S.tabs) {
    const live = tab.agent && tab.sessionId && (tab.status === 'working' || tab.status === 'attention' || hasRunningSubs(tab));
    if (!live) {
      if (tab.subagents && tab.subagents.length) { tab.subagents = []; tab.subKey = ''; changed = true; }
      continue;
    }
    if (await pollSubagents(tab)) changed = true;
  }
  if (changed) renderProjects();
}, 1500);

function taskRowHtml(k) {
  const live = RUNNING_TASK.has(k.status);
  const time = live
    ? (k.status === 'working' ? ` · <span class="elapsed" data-since="${k.start}">${elapsed(k.start)}</span>` : '')
    : `${k.end && k.start ? ' · ' + elapsedText(k.end - k.start) : ''} · ${relTime(k.end || k.start)}`;
  return `
    <div class="item child task st-${k.status === 'pending' ? 'working' : k.status} agent-${k.agent}" data-task="${k.id}" title="${esc(k.text)}">
      <span class="child-ico">${icon(AGENTS[k.agent]?.icon || 'terminal')}${live ? '<i class="dot"></i>' : ''}</span>
      <span class="item-text">
        <span class="item-name">${esc(k.text)}</span>
        <span class="item-sub">${live && tabById(k.tabId) && tabById(k.tabId).awaitChoice
          ? choiceBubbleHtml()
          : `<span class="tk ${k.status}">${TASK_TEXT[k.status]}</span>${time}`}</span>
      </span>
      <span class="item-actions"><button class="icon-btn go-prompt" data-a="goto" title="이 작업의 프롬프트로 이동" hidden>${icon('arrowUp')}</button>${k.status === 'attention' ? `<button class="icon-btn" data-a="unflag" title="확인 필요 해제">${icon('check')}</button>` : ''}${live ? '' : `<button class="icon-btn danger" data-a="forget" title="목록에서 지우기">${icon('x')}</button>`}</span>
    </div>${live ? subagentRowsHtml(tabById(k.tabId)) : ''}`;
}

function renderProjects() {
  renderCurrent();
  const root = $('#projects');
  const agents = agentTabs();

  // folders with running agents that aren't projects yet
  const temp = [];
  for (const t of agents) {
    if (ownerProject(t.cwd) || temp.some((x) => samePath(x.path, t.cwd))) continue;
    temp.push({ id: 'tmp:' + normP(t.cwd), name: basename(t.cwd), path: t.cwd, temp: true });
  }
  const groups = [...temp, ...sortedProjects()];

  let html;
  if (!groups.length) {
    html = `<div class="sb-empty"><span data-i18n-html="sbEmpty">터미널에서 <b>claude</b> 나 <b>codex</b> 를 실행하면<br>그 폴더와 에이전트가 여기에 나타나요.</span><br><br><button data-action="add-project">+ 프로젝트 폴더 추가</button></div>`;
  } else {
    html = groups.map((p) => folderHtml(p, agents)).join('');
  }
  if (root.dataset.sig !== html) {
    const scroll = root.scrollTop;
    root.innerHTML = html;
    root.dataset.sig = html;
    root.scrollTop = scroll;
  }
}

function historyHtml(p) {
  const cached = S.sessionCache.get(normP(p.path));
  if (!cached || Date.now() - cached.at > 15000) {
    if (!S.loadingHistory.has(p.path)) {
      S.loadingHistory.add(p.path);
      sessionsFor(p.path, true).finally(() => { S.loadingHistory.delete(p.path); renderSessions(); });
    }
    if (!cached) return `<div class="children"><div class="child-note slim">불러오는 중…</div></div>`;
  }
  const list = cached.list.filter((x) => !S.tabs.some((t) => t.sessionId === x.id));
  if (!list.length) return `<div class="children"><div class="child-note slim">지난 대화가 없습니다</div></div>`;
  const rows = list.slice(0, 8).map((s) => `
      <div class="past-row agent-${s.agent}" data-s="${s.id}" data-agent="${s.agent}" data-cwd="${esc(p.path)}"
           title="${esc(AGENTS[s.agent].name)} · ${esc(s.title)}${s.branch ? ' · ' + esc(s.branch) : ''}${s.lastPrompt ? '\n마지막 프롬프트: ' + esc(s.lastPrompt) : ''}">
        <span class="pr-dot"></span>
        <span class="pr-ico">${icon(AGENTS[s.agent].icon)}</span>
        <span class="pr-title">${esc(s.title)}</span>
        <span class="pr-time">${relTime(s.mtime)}</span>
        <span class="pr-actions">
          <button class="icon-btn go" data-a="resume" title="이 대화 이어서">${icon('play')}</button>
          <button class="icon-btn danger" data-a="delete" title="휴지통으로">${icon('trash')}</button>
        </span>
      </div>`).join('');
  const more = `<button class="past-more" data-more="${p.id}">${icon('search')}${list.length > 8 ? `모든 대화 보기 · ${list.length}개` : '대화 검색'}</button>`;
  return `<div class="past-list">${rows}</div>${more}`;
}

const PROJECT_ICONS = ['folder', 'code', 'rocket', 'star', 'heart', 'flame', 'bolt', 'globe', 'gamepad', 'music', 'book', 'box', 'leaf', 'coffee', 'camera', 'palette'];
const PROJECT_COLORS = ['#a594ff', '#ff8a5b', '#2fc6b0', '#5b8cff', '#f472b6', '#f5c06b', '#4ade80', '#a3aab8'];

function projectIconHtml(p) {
  const name = p.temp ? 'folderOpen' : (p.icon && window.ICONS[p.icon] ? p.icon : 'folder');
  const color = p.temp ? '' : (p.color || '');
  return `<span class="fb-ico${p.temp ? ' temp' : ''}"${color ? ` style="--pc:${color}"` : ''}>${icon(name)}</span>`;
}

/** One folder = one box. Click the head to open it (one at a time); inside, tabs instead of nested toggles. */
function folderHtml(p, agents) {
  const inFolder = (cwd) => (p.temp ? samePath(cwd, p.path) : ownerProject(cwd) === p);
  const sessions = agents.filter((t) => inFolder(t.cwd));
  const openTabs = S.tabs.filter((t) => inFolder(t.cwd));
  const gridOn = S.grid && samePath(S.grid, p.path);

  const cached = !p.temp && S.sessionCache.get(normP(p.path));
  if (!p.temp && !cached && !S.loadingHistory.has(p.path)) {
    S.loadingHistory.add(p.path);
    sessionsFor(p.path).finally(() => { S.loadingHistory.delete(p.path); renderSessions(); });
  }
  const past = cached ? cached.list.filter((x) => !S.tabs.some((t) => t.sessionId === x.id)) : null;

  const tasks = S.tasks.filter((k) => inFolder(k.path));
  // a task whose agent stopped to ask the user steps over to 입력 대기 (with its bubble) until answered
  const asking = (k) => { const tb = tabById(k.tabId); return !!(tb && tb.awaitChoice); };
  const running = tasks.filter((k) => RUNNING_TASK.has(k.status) && !asking(k)).reverse();
  const finished = tasks.filter((k) => !RUNNING_TASK.has(k.status)).reverse();
  const runningTabs = new Set(running.map((k) => k.tabId));
  const waiting = sessions.filter((t) => t.status !== 'working'); // incl. one waiting for a choice (shows the bubble)
  const workingNoTask = sessions.filter((t) => t.status === 'working' && !runningTabs.has(t.id));
  const runCount = running.length + workingNoTask.length;

  // which box is open: the user's choice, else the folder of the tab in front
  const active = activeTab();
  const open = S.openFolder != null ? S.openFolder === p.id : !!(active && inFolder(active.cwd));

  // quiet status: ONE filled dot in the colour of the most important state, plus how many sessions (hover for details)
  const RANK = { attention: 4, working: 3, done: 2, ready: 1 };
  const top = sessions.reduce((best, t) => ((RANK[t.status] || 0) > (RANK[best] || 0) ? t.status : best), 'ready');
  const tip = sessions.map((t) => `${tabLabel(t)} · ${STATUS_TEXT[t.status] || ''}`).join('\n');
  const badges = sessions.length
    ? `<span class="fb-stat st-${top}" title="${esc(tip)}"><i></i>${sessions.length > 1 ? `<b>${sessions.length}</b>` : ''}</span>`
    : '';

  const actions = p.temp
    ? `<button class="icon-btn" data-a="add" title="프로젝트로 추가">${icon('folderPlus')}</button>`
    : `${openTabs.length >= 2 ? `<button class="icon-btn${gridOn ? ' on' : ''}" data-a="grid" title="이 폴더의 탭을 한 화면에 보기 (Ctrl+Shift+G)">${icon('grid')}</button>` : ''}
       <button class="icon-btn" data-a="shell" title="이 폴더에서 터미널 열기">${icon('terminal')}</button>
       <button class="icon-btn" data-a="more" title="더보기">${icon('more')}</button>`;

  let body = '';
  if (open) {
    // inside the box: the familiar toggles — 지난 대화 on top, then 입력 대기 / 진행 중 / 완료
    let inner = '';
    if (!p.temp) {
      const id = `hist:${p.id}`;
      const histOpen = S.secOpen.has(id);
      inner += `
        <div class="past-block${histOpen ? ' open' : ''}">
          <button class="past-head" data-sec="${esc(id)}" data-default="closed">
            <span class="ph-ico">${icon('history')}</span>
            <span class="ph-label">지난 대화</span>
            ${past ? `<span class="ph-count">${past.length}</span>` : ''}
            <span class="ph-chev">${icon('chevronDown')}</span>
          </button>
          ${histOpen ? historyHtml(p) : ''}
        </div>`;
    }
    const wait = sectionToggle('wait', p.id, '입력 대기', waiting.length, true);
    inner += wait.html;
    if (wait.open) {
      inner += `<div class="children">${waiting.length
        ? waiting.map(sessionRowHtml).join('')
        : `<div class="child-note slim">${sessions.length ? '모든 세션이 작업 중입니다' : '<span data-i18n-html="folderEmpty">이 폴더에서 <b>claude</b> / <b>codex</b> 를 실행하면 여기에 나타납니다</span>'}</div>`}</div>`;
    }
    const run = sectionToggle('run', p.id, '진행 중', runCount, true);
    inner += run.html;
    if (run.open) {
      inner += `<div class="children">${runCount
        ? running.map(taskRowHtml).join('') + workingNoTask.map(sessionRowHtml).join('')
        : '<div class="child-note slim">진행 중인 작업이 없습니다</div>'}</div>`;
    }
    const done = sectionToggle('done', p.id, '완료', finished.length, false);
    inner += done.html;
    if (done.open) {
      inner += `<div class="children">${finished.length
        ? finished.slice(0, 20).map(taskRowHtml).join('') + (finished.length > 20 ? `<div class="child-note slim">최근 20개 (전체 ${finished.length}개)</div>` : '')
        : '<div class="child-note slim">완료된 작업이 없습니다</div>'}</div>`;
    }
    body = `<div class="fbox-body classic">${inner}</div>`;
  }

  return `
    <div class="fbox${open ? ' open' : ''}${p.temp ? ' temp' : ''}${gridOn ? ' grid-on' : ''}">
      <div class="fbox-head" data-p="${esc(p.id)}" data-path="${esc(p.path)}" title="${esc(p.path)}">
        ${projectIconHtml(p)}
        <span class="fb-text">
          <span class="fb-name">${esc(p.name)}</span>
          <span class="fb-path">${p.temp ? '프로젝트 아님 · ' : ''}${esc(prettyPath(p.path))}</span>
        </span>
        <span class="fb-badges">${badges}</span>
        <span class="fb-actions">${actions}</span>
        <span class="fb-chev">${icon('chevronDown')}</span>
      </div>
      ${body}
    </div>`;
}

/** Pick a project's icon and color from suggestions. */
function openProjectIconPicker(p) {
  const body = h('div', 'icon-picker');
  const draw = () => {
    const col = p.color || PROJECT_COLORS[0];
    body.innerHTML = `
      <div class="ip-preview">${projectIconHtml({ ...p, color: col })}<b>${esc(p.name)}</b></div>
      <div class="ip-label">아이콘</div>
      <div class="ip-grid">${PROJECT_ICONS.map((n) => `<button type="button" class="ip-icon${(p.icon || 'folder') === n ? ' on' : ''}" data-icon-pick="${n}" style="--pc:${col}">${icon(n)}</button>`).join('')}</div>
      <div class="ip-label">색</div>
      <div class="ip-colors">${PROJECT_COLORS.map((c) => `<button type="button" class="ip-color${col === c ? ' on' : ''}" data-color-pick="${c}" style="background:${c}"></button>`).join('')}</div>`;
  };
  draw();
  body.addEventListener('click', (e) => {
    const ic = e.target.closest('[data-icon-pick]');
    const co = e.target.closest('[data-color-pick]');
    if (ic) p.icon = ic.dataset.iconPick;
    else if (co) p.color = co.dataset.colorPick;
    else return;
    saveProjects();
    draw();
    renderProjects();
  });
  const done = h('button', 'btn small primary', '완료');
  const wrap = h('div', 'foot-right');
  wrap.append(done);
  openModal({ title: '프로젝트 아이콘', body, foot: [wrap], width: 400 });
  done.addEventListener('click', () => closeOverlay());
}

/* One delegated handler: clicks keep working even while the list re-renders. */
(function sidebarEvents() {
  const projects = $('#projects');
  const projectOf = (el) => S.projects.find((p) => p.id === el.dataset.p);
  const sessionOf = (row) => {
    const list = S.sessionCache.get(normP(row.dataset.cwd))?.list || [];
    return list.find((s) => s.id === row.dataset.s) || { id: row.dataset.s, agent: row.dataset.agent, title: '' };
  };
  projects.addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-task]');
    if (!row || row === projects.hoverTask) return;
    projects.hoverTask = row;
    const task = taskById(row.dataset.task);
    const btn = row.querySelector('[data-a="goto"]');
    if (btn && task) canJumpToTask(task).then((ok) => { if (btn.isConnected) btn.hidden = !ok; });
  });
  projects.addEventListener('mouseleave', () => { projects.hoverTask = null; });
  projects.addEventListener('click', (e) => {
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      const id = sec.dataset.sec;
      const set = sec.dataset.default === 'open' ? S.secClosed : S.secOpen;
      if (set.has(id)) set.delete(id); else set.add(id);
      return renderProjects();
    }
    const card = e.target.closest('[data-t]');
    if (card) {
      if (e.target.closest('[data-a="end"]')) return closeTab(card.dataset.t);
      return activate(card.dataset.t);
    }
    const taskRow = e.target.closest('[data-task]');
    if (taskRow) {
      const task = taskById(taskRow.dataset.task);
      if (!task) return;
      if (e.target.closest('[data-a="forget"]')) { S.tasks = S.tasks.filter((k) => k !== task); saveTasks(); return renderProjects(); }
      if (e.target.closest('[data-a="goto"]')) return gotoTaskPrompt(task);
      if (e.target.closest('[data-a="unflag"]')) return unflagTask(task);
      return openTask(task);
    }
    const more = e.target.closest('[data-more]');
    if (more) { const p = S.projects.find((x) => x.id === more.dataset.more); if (p) openSessionPicker(p.path); return; }
    const row = e.target.closest('[data-s]');
    if (row) {
      const s = sessionOf(row);
      if (e.target.closest('[data-a="delete"]')) return deleteSession(s, row.dataset.cwd);
      return resumeSession(row.dataset.agent, row.dataset.cwd, s.id);
    }
    const head = e.target.closest('[data-p]');
    if (!head) return;
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'add') return addProject(head.dataset.path);
    const p = projectOf(head);
    if (a === 'grid' && p) return toggleGrid(p.path);
    if (a === 'shell' && p) return newShell(null, p.path);
    if (a === 'more' && p) { const r = e.target.closest('button').getBoundingClientRect(); return openProjectMenu(p, r.left, r.bottom + 4); }
    // accordion: open this box, close the others (click again to close)
    const isOpen = head.parentElement.classList.contains('open');
    S.openFolder = isOpen ? '' : head.dataset.p;
    renderProjects();
  });
  projects.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('[data-t]');
    const t = card && tabById(card.dataset.t);
    if (t) { e.preventDefault(); activate(t.id); return openTabMenu(t, e.clientX, e.clientY); }
    const head = e.target.closest('[data-p]');
    const p = head && projectOf(head);
    if (!p) return;
    e.preventDefault();
    openProjectMenu(p, e.clientX, e.clientY);
  });
})();

/* ------------------------------------------------------------------ */
/* Trash window: restore or permanently delete conversations           */
/* ------------------------------------------------------------------ */

async function openTrash() {
  const body = h('div', 'trash');
  const empty = h('button', 'btn small danger', `${icon('trash')}휴지통 비우기`);
  const note = h('span', 'muted-sm', '복원하면 원래 폴더의 지난 대화로 돌아갑니다');
  openModal({ title: '휴지통', body, foot: [note, empty], width: 600 });
  const modalOverlay = S.overlay;

  const render = async () => {
    const list = await window.mt.agent.trashList();
    if (S.overlay !== modalOverlay) return;
    empty.disabled = !list.length;
    if (!list.length) {
      body.innerHTML = `<div class="trash-empty">${icon('trash')}<b>휴지통이 비어 있습니다</b><span>지난 대화에서 삭제한 대화가 여기에 모입니다.</span></div>`;
      return;
    }
    body.innerHTML = list.map((x) => `
      <div class="trash-row" data-id="${esc(x.id)}">
        <span class="child-ico agent-${x.agent}">${icon(AGENTS[x.agent]?.icon || 'terminal')}</span>
        <span class="item-text">
          <span class="item-name">${esc(x.title || '(제목 없음)')}</span>
          <span class="item-sub">${esc(AGENTS[x.agent]?.name || x.agent)} · ${esc(prettyPath(x.cwd))} · ${relTime(x.deletedAt)} 삭제</span>
        </span>
        <button class="btn small" data-a="restore">${icon('refresh')}복원</button>
        <button class="btn small danger" data-a="purge">영구 삭제</button>
      </div>`).join('');
  };

  body.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!row || !a) return;
    const id = row.dataset.id;
    if (a === 'restore') {
      const res = await window.mt.agent.trashRestore(id);
      if (res.ok) {
        S.sessionCache.delete(normP(res.entry.cwd));
        toast('대화를 복원했습니다', { icon: 'refresh' });
        renderProjects();
      } else toast(`복원하지 못했습니다: ${res.error}`, { icon: 'info', ms: 5000 });
      render();
    } else if (a === 'purge') {
      if (row.dataset.confirm !== '1') { // second click confirms, no extra dialog over the modal
        row.dataset.confirm = '1';
        e.target.closest('button').innerHTML = '정말 삭제?';
        setTimeout(() => { if (row.isConnected) { row.dataset.confirm = ''; render(); } }, 3000);
        return;
      }
      await window.mt.agent.trashPurge(id);
      toast('영구 삭제했습니다', { icon: 'trash' });
      render();
    }
  });

  empty.addEventListener('click', async () => {
    if (empty.dataset.confirm !== '1') {
      empty.dataset.confirm = '1';
      empty.innerHTML = `${icon('trash')}정말 모두 영구 삭제?`;
      setTimeout(() => { if (empty.isConnected) { empty.dataset.confirm = ''; empty.innerHTML = `${icon('trash')}휴지통 비우기`; } }, 3000);
      return;
    }
    const res = await window.mt.agent.trashPurge('*');
    toast(`${res.count}개를 영구 삭제했습니다`, { icon: 'trash' });
    empty.dataset.confirm = '';
    empty.innerHTML = `${icon('trash')}휴지통 비우기`;
    render();
  });

  render();
}

async function deleteSession(s, cwd) {
  const openTab = S.tabs.find((t) => t.sessionId === s.id);
  const A = AGENTS[s.agent];
  const ok = await confirmDialog(
    openTab ? '세션 종료 후 삭제' : '대화 삭제',
    `${A.name} 대화 '${s.title}'을(를) ${openTab ? '종료하고 ' : ''}휴지통으로 옮길까요?\n휴지통에서 복원하거나 영구 삭제할 수 있습니다.`,
    openTab ? '종료 후 삭제' : '삭제',
  );
  if (!ok) return;
  if (openTab) await closeTab(openTab.id, { confirmWorking: false });
  const res = await window.mt.agent.remove(s.agent, cwd, s.id, s.title);
  S.sessionCache.delete(normP(cwd));
  renderProjects();
  if (res.ok) toast('휴지통으로 옮겼습니다 · 클릭하면 휴지통 열기', { icon: 'trash', ms: 6000, onClick: openTrash });
  else toast(`삭제하지 못했습니다: ${res.error}`, { icon: 'info', ms: 5000 });
}

function toggleProject(p) {
  if (S.expanded.has(p.id)) S.expanded.delete(p.id);
  else S.expanded.add(p.id);
  renderProjects();
}

// Coalesce frequent updates (status, titles) into one sidebar refresh per frame.
let projRaf = 0;
function renderSessions() {
  if (!projRaf) projRaf = requestAnimationFrame(() => { projRaf = 0; renderProjects(); });
}

function renderStatus() {
  const t = activeTab();
  const kind = $('#st-kind');
  const cwd = $('#st-cwd');
  const st = $('#st-status');
  $('#st-composer').hidden = !(t && t.agent);
  $('#st-session').hidden = !(t && t.agent && t.sessionId);
  document.getElementById('app').dataset.agent = t && t.agent ? t.agent : '';
  window.mt.setTitle(t ? `${tabLabel(t)} — MinsuTerm` : 'MinsuTerm');
  if (!t) { kind.innerHTML = ''; cwd.textContent = ''; st.innerHTML = ''; return; }
  kind.className = `st-item st-kind${t.agent ? ' ' + t.agent : ''}`;
  kind.innerHTML = t.agent
    ? `${icon(AGENTS[t.agent].icon)}${AGENTS[t.agent].name}${t.permissionMode ? ` <span class="perm">${esc(PERM_LABEL[t.permissionMode] || t.permissionMode)}</span>` : ''}`
    : `${icon('terminal')}${esc(shellName(t.shellId))}`;
  cwd.textContent = t.cwd;
  cwd.title = t.cwd;
  if (t.agent && t.sessionId) {
    $('#st-session').textContent = `세션 ${t.sessionId.slice(0, 8)}`;
    $('#st-session').title = `세션 ID: ${t.sessionId}\n클릭하면 재개 명령을 복사합니다`;
  }
  st.innerHTML = t.agent || t.status === 'exited'
    ? `<span class="st-pill ${t.status}"></span>${statusHtml(t)}`
    : `<span class="st-hint" data-i18n-html="statusHint"><kbd>claude</kbd> 또는 <kbd>codex</kbd> 를 실행하면 에이전트 모드로 전환됩니다</span>`;
}

function updateEmpty() {
  const empty = $('#empty');
  empty.hidden = S.tabs.length > 0;
  if (empty.hidden) return;
  const rec = $('#empty-recent');
  rec.innerHTML = '';
  const list = sortedProjects().slice(0, 4);
  if (!list.length) return;
  rec.appendChild(h('div', 'label', '최근 프로젝트'));
  for (const p of list) {
    const it = h('div', 'item');
    it.innerHTML = `
      <span class="item-ico proj">${icon('folder')}</span>
      <span class="item-text"><span class="item-name">${esc(p.name)}</span><span class="item-sub">${esc(prettyPath(p.path))}</span></span>
      <span class="item-actions" style="display:flex"><span class="icon-btn">${icon('terminal')}</span></span>`;
    it.addEventListener('click', () => newShell(null, p.path));
    rec.appendChild(it);
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function currentCwd() {
  const t = activeTab();
  if (t) return t.cwd;
  const p = sortedProjects()[0];
  return p ? p.path : S.home;
}

function newShell(shellId, cwd) {
  return createTab({ shellId: shellId || S.settings.defaultShell, cwd: cwd || currentCwd() });
}

function newAgent(type, { cwd, mode = 'new', sessionId = '', permissionMode = '' } = {}) {
  return createTab({ cwd: cwd || currentCwd(), launch: { type, mode, sessionId, permissionMode } });
}

function resumeSession(agent, cwd, sessionId) {
  const open = S.tabs.find((t) => t.sessionId === sessionId);
  if (open) return activate(open.id);
  return newAgent(agent, { cwd, mode: 'resume', sessionId });
}

async function addProject(dir) {
  const folder = dir || await window.mt.pickFolder();
  if (!folder) return null;
  let p = projectFor(folder);
  if (!p) {
    p = { id: uuid(), name: basename(folder), path: folder, lastUsed: Date.now() };
    S.projects.push(p);
    saveProjects();
    toast(`프로젝트 '${p.name}'을(를) 추가했습니다`, { icon: 'folderPlus' });
  }
  renderProjects(); // history stays collapsed until the project row is clicked
  updateEmpty();
  return p;
}

async function removeProject(p) {
  const ok = await confirmDialog('프로젝트 제거', `'${p.name}'을(를) 목록에서 제거할까요?\n폴더와 대화 기록은 삭제되지 않습니다.`, '제거');
  if (!ok) return;
  S.projects = S.projects.filter((x) => x.id !== p.id);
  saveProjects();
  renderProjects();
  renderSessions();
  updateEmpty();
}

function renameProject(p) {
  promptDialog('프로젝트 이름', p.name, (name) => {
    if (!name) return;
    p.name = name;
    saveProjects();
    renderProjects();
    renderSessions();
    S.tabs.forEach(updateTabEl);
  });
}

function sendSlash(cmd) {
  const t = activeTab();
  if (!t || !t.agent) return toast('Claude 또는 Codex 실행 중인 탭에서 사용할 수 있어요', { icon: 'info' });
  window.mt.pty.write(t.id, cmd);
  t.armed = true;
  setTimeout(() => window.mt.pty.write(t.id, '\r'), 60);
  t.term.focus();
}

async function smartPaste(tab) {
  const { text, hasImage } = await window.mt.clipRead();
  if (text) tab.term.paste(text);
  else if (hasImage && tab.agent && tab.alive) window.mt.pty.write(tab.id, AGENTS[tab.agent].imagePaste);
}

function copySelection(tab) {
  const sel = tab.term.getSelection();
  if (!sel) return false;
  window.mt.clipWrite(sel);
  tab.term.clearSelection();
  toast('복사했습니다', { icon: 'copy', ms: 1200 });
  return true;
}

function resumeCommand(t) {
  return t.agent === 'codex' ? `codex resume ${t.sessionId}` : `claude --resume ${t.sessionId}`;
}

function copySessionId(t) {
  window.mt.clipWrite(resumeCommand(t));
  toast(`복사했습니다: ${resumeCommand(t)}`, { icon: 'copy', ms: 2000 });
}

function setFontSize(size) {
  saveSettings({ fontSize: Math.max(8, Math.min(32, Math.round(size))) });
  applySettings();
}

function applySettings() {
  for (const t of S.tabs) {
    t.term.options.fontFamily = S.settings.fontFamily;
    t.term.options.fontSize = S.settings.fontSize;
    t.term.options.lineHeight = S.settings.lineHeight;
  }
  applyAppearance();
  for (const t of S.tabs) fitTab(t);
  renderStatus();
}

function setSidebarWidth(w, save) {
  const v = Math.round(Math.max(190, Math.min(480, Number(w) || 252)));
  document.getElementById('app').style.setProperty('--sidebar-w', `${v}px`);
  if (save) saveSettings({ sidebarWidth: v });
  return v;
}

(function sidebarResizer() {
  const handle = document.getElementById('sb-resizer');
  if (!handle) return;
  let raf = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const left = document.getElementById('sidebar').getBoundingClientRect().left;
    let w = 0;
    const move = (ev) => {
      w = setSidebarWidth(ev.clientX - left);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; (currentView().tiles.length ? currentView().tiles : [activeTab()]).forEach(fitTab); });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      if (w) setSidebarWidth(w, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => { setSidebarWidth(252, true); (currentView().tiles.length ? currentView().tiles : [activeTab()]).forEach(fitTab); });
})();

function toggleSidebar(force) {
  const app = document.getElementById('app');
  const show = force != null ? force : app.classList.contains('no-sidebar');
  app.classList.toggle('no-sidebar', !show);
  saveSettings({ sidebarVisible: show });
  setTimeout(() => fitTab(activeTab()), 220);
}

/* --- search -------------------------------------------------------- */

function openSearch() {
  const t = activeTab();
  if (!t) return;
  $('#searchbar').hidden = false;
  const input = $('#search-input');
  const sel = t.term.getSelection();
  if (sel && !sel.includes('\n')) input.value = sel;
  input.focus();
  input.select();
  if (input.value) doSearch(true);
}

function doSearch(forward) {
  const t = activeTab();
  const q = $('#search-input').value;
  if (!t) return;
  if (!q) { t.search.clearDecorations(); $('#search-count').textContent = ''; return; }
  const opts = {
    decorations: {
      matchBackground: '#3b2f6b',
      matchBorder: '#8f73ff',
      matchOverviewRuler: '#8f73ff',
      activeMatchBackground: '#ff8a5b',
      activeMatchBorder: '#ffb08f',
      activeMatchColorOverviewRuler: '#ff8a5b',
    },
  };
  const found = forward ? t.search.findNext(q, opts) : t.search.findPrevious(q, opts);
  if (!found) $('#search-count').textContent = '결과 없음';
}

function closeSearch(refocus = true) {
  const bar = $('#searchbar');
  if (bar.hidden) return;
  bar.hidden = true;
  S.tabs.forEach((t) => { try { t.search.clearDecorations(); } catch { /* ignore */ } });
  if (refocus) activeTab()?.term.focus();
}

$('#search-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doSearch(!e.shiftKey); }
  if (e.key === 'Escape') closeSearch();
});
$('#search-input').addEventListener('input', () => doSearch(true));
$('#search-next').addEventListener('click', () => doSearch(true));
$('#search-prev').addEventListener('click', () => doSearch(false));
$('#search-close').addEventListener('click', () => closeSearch());

/* ------------------------------------------------------------------ */
/* Overlays: menu / palette / modal / toast                            */
/* ------------------------------------------------------------------ */

const overlayRoot = $('#overlay-root');

function closeOverlay() {
  if (!S.overlay) return;
  const o = S.overlay;
  S.overlay = null;
  o.cleanup?.();
  o.nodes.forEach((n) => n.remove());
  activeTab()?.term.focus();
}

function openMenu(items, x, y) {
  closeOverlay();
  const scrim = h('div');
  scrim.style.cssText = 'position:fixed;inset:0;z-index:99';
  const menu = h('div', 'menu');
  for (const it of items) {
    if (it === '-') { menu.appendChild(h('div', 'menu-sep')); continue; }
    if (it.label && !it.run) { menu.appendChild(h('div', 'menu-label', esc(it.label))); continue; }
    const b = h('button', 'menu-item' + (it.danger ? ' danger' : '') + (it.cls ? ' ' + it.cls : ''), `${it.icon ? icon(it.icon) : '<span style="width:15px"></span>'}<span>${esc(it.text)}</span>${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}`);
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { closeOverlay(); it.run(); });
    menu.appendChild(b);
  }
  scrim.addEventListener('pointerdown', () => closeOverlay());
  scrim.addEventListener('contextmenu', (e) => { e.preventDefault(); closeOverlay(); });
  overlayRoot.append(scrim, menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); } };
  window.addEventListener('keydown', onKey, true);
  S.overlay = { nodes: [scrim, menu], cleanup: () => window.removeEventListener('keydown', onKey, true) };
}

function agentQuickItems(t) {
  if (!t || !t.agent) return [];
  const A = AGENTS[t.agent];
  return [
    { icon: 'edit', text: '프롬프트 작성기', hint: 'Ctrl+Shift+E', run: openComposer },
    { icon: 'x', text: '작업 중단 (Esc)', run: () => { if (t.alive) window.mt.pty.write(t.id, '\x1b'); } },
    ...A.quick.map(([ic, cmd, desc]) => ({ icon: ic, text: `${cmd} — ${desc}`, run: () => sendSlash(cmd) })),
  ];
}

function splitItems(tab) {
  const g = groupOf(tab);
  const items = [
    { icon: 'splitRight', text: '오른쪽으로 분할', hint: 'Alt+Shift+=', run: () => { activate(tab.id); splitPane('row'); } },
    { icon: 'splitDown', text: '아래로 분할', hint: 'Alt+Shift+-', run: () => { activate(tab.id); splitPane('col'); } },
  ];
  if (g) {
    items.push(
      { icon: 'maximize', text: S.zoom === tab.id ? '분할 화면으로 돌아가기' : '이 패널만 크게', hint: 'Ctrl+Shift+Z', run: () => { activate(tab.id); toggleZoom(); } },
      { icon: 'x', text: '분할 해제', run: () => unsplit(tab) },
    );
  }
  return items;
}

function openTabMenu(tab, x, y) {
  const i = S.tabs.indexOf(tab);
  const items = [
    { icon: 'edit', text: '이름 변경', hint: 'F2', run: () => startRename(tab) },
    { icon: 'copy', text: '같은 폴더에 새 탭', run: () => createTab({ shellId: tab.shellId, cwd: tab.cwd, index: i + 1 }) },
    { icon: 'folderOpen', text: '탐색기에서 폴더 열기', run: () => window.mt.openFolder(tab.cwd) },
  ];
  if (!projectFor(tab.cwd)) items.push({ icon: 'folderPlus', text: '이 폴더를 프로젝트로 추가', run: () => addProject(tab.cwd) });
  if (tab.agent) {
    items.push('-', { label: AGENTS[tab.agent].name }, ...agentQuickItems(tab));
    if (tab.sessionId) items.push({ icon: 'copy', text: '재개 명령 복사', run: () => copySessionId(tab) });
  }
  if (!tab.alive) items.push('-', { icon: 'refresh', text: '셸 다시 시작', run: () => restartTab(tab) });
  items.push('-', ...splitItems(tab));
  items.push(
    '-',
    { icon: 'arrowLeft', text: '왼쪽으로 이동', hint: 'Ctrl+Shift+PgUp', disabled: i === 0, run: () => moveActive(-1) },
    { icon: 'arrowRight', text: '오른쪽으로 이동', hint: 'Ctrl+Shift+PgDn', disabled: i === S.tabs.length - 1, run: () => moveActive(1) },
    '-',
    { icon: 'x', text: '다른 탭 모두 닫기', disabled: S.tabs.length < 2, run: () => S.tabs.filter((t) => t !== tab).forEach((t) => closeTab(t.id, { confirmWorking: false })) },
    { icon: 'x', text: '탭 닫기', hint: 'Ctrl+Shift+W', danger: true, run: () => closeTab(tab.id) },
  );
  openMenu(items, x, y);
}

function runInTab(tab, cmd) {
  window.mt.pty.write(tab.id, cmd + '\r');
  window.mt.agent.probe([500, 1500, 3000]);
  tab.term.focus();
}

/* ------------------------------------------------------------------ */
/* Agent work items: one per prompt — 실행 중 → 완료 / 중단 / 확인 필요   */
/* ------------------------------------------------------------------ */

const taskById = (id) => S.tasks.find((k) => k.id === id) || null;
let taskSaveTimer = null;
function saveTasks() {
  clearTimeout(taskSaveTimer);
  taskSaveTimer = setTimeout(() => {
    const keep = S.tasks.filter((k) => k.status !== 'pending').slice(-400)
      .map(({ id, agent, path, text, status, start, end, sessionId }) => ({ id, agent, path, text, status, start, end, sessionId }));
    window.mt.store.tasks(keep);
  }, 400);
}

/** What the user typed into the agent's prompt box (read from the screen at Enter). */
function promptText(tab) {
  let t = currentLine(tab).replace(/[│┃╭╮╰╯─━┌┐└┘]+/g, ' ').trim();
  t = t.replace(/^[>❯›»]\s*/, '').trim();
  if (!t || t.length < 2) return '';
  if (/^Try "/.test(t) || /^\d+[.)]\s/.test(t)) return ''; // placeholder / menu choice
  return t.slice(0, 200);
}

function onAgentEnter(tab) {
  const before = tab.statusBeforeInput;
  // answering a question / menu while a task runs: part of the current task, not a new one
  if (before === 'working' || before === 'attention') return;
  const text = promptText(tab);
  if (!text) return;
  const task = { id: uuid(), tabId: tab.id, agent: tab.agent, path: tab.cwd, text, status: 'pending', start: Date.now(), end: 0, sessionId: tab.sessionId || '' };
  S.tasks.push(task);
  tab.taskId = task.id;
  tab.interrupted = false;
  renderSessions();
}

/** Keep the tab's current task in step with the agent's status. */
function syncTask(tab, status) {
  const task = tab.taskId && taskById(tab.taskId);
  if (!task || task.status === 'done' || task.status === 'stopped') return;
  if (status === 'working') { task.status = 'working'; task.start = tab.workStart || task.start; }
  else if (status === 'attention') task.status = 'attention';
  else if (status === 'done' || status === 'exited' || status === 'shell') {
    task.status = status === 'done' && !tab.interrupted ? 'done' : 'stopped';
    task.end = Date.now();
    task.sessionId = tab.sessionId || task.sessionId;
    refineTask(tab, task);
    saveTasks();
  } else if (status === 'ready' && task.status === 'pending') {
    S.tasks = S.tasks.filter((k) => k !== task); // Enter that never started any work
    tab.taskId = '';
  }
}

/** Replace the screen-scraped title with the prompt recorded in the session transcript. */
async function refineTask(tab, task) {
  await new Promise((r) => setTimeout(r, 1500)); // let trackSession find the session first
  const sid = tab.sessionId || task.sessionId;
  if (!sid) return;
  task.sessionId = sid;
  const real = await window.mt.agent.lastPrompt(task.agent, tab.cwd, sid);
  if (real) task.text = real.slice(0, 200);
  saveTasks();
  renderSessions();
}

/*
 * Jump to the prompt that started a task.
 * - Normal screen (shells, Codex): the prompt line is in xterm's scrollback; scroll to it.
 * - Claude Code draws full-screen (alternate screen): there is no scrollback, Claude scrolls its own
 *   transcript with the mouse wheel. Wheel it up until the prompt shows, then mark it.
 * Offered only while it can work: the tab is open, it's the same conversation (/clear starts a new one),
 * and nothing was compacted since (a compact drops the earlier transcript from the screen).
 */
const promptNeedle = (task) => String(task.text || '').replace(/\s+/g, '').slice(0, 24);
const flatText = (t) => t.replace(/\s+/g, '');

/** Row of the prompt within the rows now on screen, or -1. */
function visiblePromptRow(tab, needle) {
  const buf = tab.term.buffer.active;
  const top = buf.viewportY;
  const lim = tab.term.rows - (buf.type === 'alternate' ? 3 : 0); // leave Claude's own input box out
  for (let r = 0; r < lim; r++) {
    const l = buf.getLine(top + r);
    if (!l) continue;
    let t = l.translateToString(true);
    const n = buf.getLine(top + r + 1);
    if (n && n.isWrapped) t += n.translateToString(true);
    if (flatText(t).includes(needle)) return r;
  }
  return -1;
}

/** Normal screen: the scrollback line of the prompt (searched from the bottom), or null. */
function findTaskPrompt(task) {
  const tab = task.tabId && tabById(task.tabId);
  if (!tab || !tab.alive || !tab.term) return null;
  const buf = tab.term.buffer.active;
  if (buf.type !== 'normal') return null;
  const needle = promptNeedle(task);
  if (needle.length < 4) return null;
  const bottom = buf.baseY + buf.cursorY;
  const lineText = (i) => { const l = buf.getLine(i); return l ? l.translateToString(true) : ''; };
  for (let i = buf.length - 1; i >= 0; i--) {
    if (task.status !== 'done' && task.status !== 'stopped' && i >= bottom - 1) continue; // the live input line
    let joined = lineText(i);
    for (let j = 1; j <= 3 && i + j < buf.length && buf.getLine(i + j) && buf.getLine(i + j).isWrapped; j++) joined += lineText(i + j);
    if (flatText(joined).includes(needle)) return { tab, line: i };
  }
  return null;
}

/** Can the jump button be offered for this task? */
async function canJumpToTask(task) {
  const tab = task.tabId && tabById(task.tabId);
  if (!tab || !tab.alive || !tab.term || promptNeedle(task).length < 4) return false;
  const buf = tab.term.buffer.active;
  if (buf.type === 'normal') return !!findTaskPrompt(task);
  if (visiblePromptRow(tab, promptNeedle(task)) >= 0) return true;
  if (tab.agent !== 'claude' || tab.term.modes.mouseTrackingMode === 'none') return false;
  if (task.sessionId && tab.sessionId && task.sessionId !== tab.sessionId) return false; // /clear → another conversation
  const sid = tab.sessionId || task.sessionId;
  if (!sid) return false;
  try { return !(await window.mt.agent.compactedSince(tab.agent, tab.cwd, sid, task.start)); } catch { return false; }
}

function markPromptRow(tab, row) {
  const screen = tab.host.querySelector('.xterm-screen');
  if (!screen) return;
  const rowH = screen.clientHeight / tab.term.rows;
  const mark = document.createElement('div');
  mark.className = 'prompt-jump-mark';
  mark.style.top = row * rowH + 'px';
  mark.style.height = rowH + 'px';
  screen.appendChild(mark);
  setTimeout(() => mark.remove(), 1800);
}

async function gotoTaskPrompt(task) {
  const tab = task.tabId && tabById(task.tabId);
  const fail = () => { toast('프롬프트가 더 이상 화면 기록에 없습니다'); renderProjects(); };
  if (!tab || !tab.alive) return fail();
  activate(tab.id);
  const needle = promptNeedle(task);
  const buf = tab.term.buffer.active;
  if (buf.type === 'normal') {
    const hit = findTaskPrompt(task);
    if (!hit) return fail();
    tab.term.scrollToLine(Math.max(0, hit.line - 2));
    return requestAnimationFrame(() => markPromptRow(tab, hit.line - tab.term.buffer.active.viewportY));
  }
  // full-screen agent: wheel its transcript up (then back down) until the prompt is on screen
  if (tab.term.modes.mouseTrackingMode === 'none') return fail();
  const col = Math.max(1, Math.floor(tab.term.cols / 2)), row = Math.max(1, Math.floor(tab.term.rows / 3));
  const wheel = (up) => window.mt.pty.write(tab.id, '\x1b[<' + (up ? 64 : 65) + ';' + col + ';' + row + 'M');
  const settle = () => new Promise((r) => setTimeout(r, 70));
  let found = visiblePromptRow(tab, needle);
  for (let i = 0; found < 0 && i < 160; i++) { wheel(true); wheel(true); await settle(); found = visiblePromptRow(tab, needle); }
  for (let i = 0; found < 0 && i < 320; i++) { wheel(false); wheel(false); await settle(); found = visiblePromptRow(tab, needle); }
  if (found < 0) return fail();
  // bring it a little below the top so the answer under it shows too
  if (found < 2) { wheel(false); await settle(); found = Math.max(0, visiblePromptRow(tab, needle)); }
  markPromptRow(tab, found);
}

/** "확인 필요" that never cleared: look at the screen again and put the task where it really is. */
function unflagTask(task) {
  const tab = task.tabId && tabById(task.tabId);
  tab && (tab.awaitChoice = false);
  if (tab && tab.taskId === task.id && tab.status === 'attention') {
    if (screenSaysWorking(tab)) { tab.armed = true; tab.armedAt = Date.now(); setStatus(tab, 'working'); }
    else finishWork(tab, Math.max(Date.now(), tab.lastOut) - (tab.workStart || task.start));
    if (tab.status === 'attention') setStatus(tab, 'ready'); // finishWork may decline (it still looks busy)
    if (task.status === 'attention' && tab.status !== 'working') { task.status = 'done'; task.end = task.end || Date.now(); saveTasks(); }
  } else if (task.status === 'attention') {
    task.status = 'done';
    task.end = task.end || Date.now();
    saveTasks();
  }
  renderSessions();
  renderProjects();
}

function openTask(task) {
  const tab = (task.tabId && tabById(task.tabId)) || (task.sessionId && S.tabs.find((t) => t.sessionId === task.sessionId));
  if (tab) return activate(tab.id);
  if (task.sessionId) return resumeSession(task.agent, task.path, task.sessionId);
  newShell(null, task.path);
}

const TASK_TEXT = { pending: '대기', working: '실행 중', attention: '확인 필요', done: '완료', stopped: '중단' };

/** Escape sequences xterm sends on its own (not keystrokes). */
function isTerminalReport(d) {
  return /^\x1b\[[IO]$/.test(d) // focus in / out
    || /^\x1b\[\??[\d;]*[Rcn]$/.test(d) // cursor position, device attributes, status reports
    || /^\x1b\[>[\d;]*c$/.test(d) // secondary device attributes
    || /^\x1b\[<\d+;\d+;\d+[Mm]$/.test(d) // SGR mouse report
    || /^\x1b\[M[\s\S]{3}$/.test(d) // legacy mouse report
    || /^\x1b\][\s\S]*(\x07|\x1b\\)$/.test(d) // OSC replies (colors etc.)
    || /^\x1bP[\s\S]*\x1b\\$/.test(d); // DCS replies
}

/** Text of the line the cursor is on (the command being entered). */
function currentLine(tab) {
  try {
    const b = tab.term.buffer.active;
    return b.getLine(b.baseY + b.cursorY)?.translateToString(true) || '';
  } catch { return ''; }
}

function openProjectMenu(p, x, y) {
  openMenu([
    { label: p.name },
    { icon: 'palette', text: '아이콘 변경…', run: () => openProjectIconPicker(p) },
    { icon: 'terminal', text: '터미널 열기', run: () => newShell(null, p.path) },
    { icon: 'history', text: 'Claude 마지막 대화 이어서', cls: 'claude', run: () => newAgent('claude', { cwd: p.path, mode: 'continue' }) },
    { icon: 'history', text: 'Codex 마지막 대화 이어서', cls: 'codex', run: () => newAgent('codex', { cwd: p.path, mode: 'continue' }) },
    '-',
    { icon: 'list', text: '대화 기록 검색…', hint: 'Ctrl+Shift+O', run: () => openSessionPicker(p.path) },
    { icon: 'trash', text: '지난 작업 목록 비우기', run: () => { S.tasks = S.tasks.filter((k) => ownerProject(k.path) !== p || !['done', 'stopped'].includes(k.status)); saveTasks(); renderProjects(); } },
    { icon: 'folderOpen', text: '탐색기에서 열기', run: () => window.mt.openFolder(p.path) },
    { icon: 'edit', text: '이름 변경', run: () => renameProject(p) },
    { icon: 'trash', text: '목록에서 제거', danger: true, run: () => removeProject(p) },
  ], x, y);
}

function openNewMenu(x, y) {
  openMenu([
    { label: '터미널' },
    ...S.shells.map((s) => ({ icon: 'terminal', text: s.name, hint: s.id === S.settings.defaultShell ? 'Ctrl+Shift+T' : '', run: () => newShell(s.id) })),
    '-',
    { icon: 'splitRight', text: '오른쪽으로 분할', hint: 'Alt+Shift+=', run: () => splitPane('row') },
    { icon: 'splitDown', text: '아래로 분할', hint: 'Alt+Shift+-', run: () => splitPane('col') },
    '-',
    { icon: 'list', text: '대화 기록에서 열기…', hint: 'Ctrl+Shift+O', run: () => openHistory() },
  ], x, y);
}

/* --- palette ------------------------------------------------------- */

function openPalette({ placeholder, items, emptyText }) {
  closeOverlay();
  const scrim = h('div', 'scrim');
  const box = h('div', 'palette');
  box.innerHTML = `<div class="palette-input">${icon('search')}<input type="text" spellcheck="false" placeholder="${esc(placeholder || '명령 검색')}"></div><div class="palette-list"></div>`;
  overlayRoot.append(scrim, box);
  const input = box.querySelector('input');
  const listEl = box.querySelector('.palette-list');
  let shown = [];
  let sel = 0;

  const render = () => {
    const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    shown = items.filter((it) => {
      const hay = `${it.text} ${it.sub || ''} ${it.keywords || ''} ${it.group || ''}`.toLowerCase();
      return q.every((w) => hay.includes(w));
    });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    listEl.innerHTML = '';
    if (!shown.length) { listEl.innerHTML = `<div class="palette-empty">${esc(emptyText || '일치하는 항목이 없습니다')}</div>`; return; }
    shown.forEach((it, i) => {
      if (it.group && (i === 0 || shown[i - 1].group !== it.group)) listEl.appendChild(h('div', 'menu-label', esc(it.group)));
      const b = h('button', 'menu-item' + (i === sel ? ' focus' : '') + (it.cls ? ' ' + it.cls : ''), `${icon(it.icon || 'chevronRight')}<span class="txt">${esc(it.text)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}`);
      b.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
      b.addEventListener('click', () => choose(i));
      b.dataset.i = i;
      listEl.appendChild(b);
    });
  };
  const mark = () => {
    listEl.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('focus', +b.dataset.i === sel));
    listEl.querySelector('.menu-item.focus')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const it = shown[i];
    if (!it) return;
    closeOverlay();
    it.run();
  };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); }
  });
  scrim.addEventListener('pointerdown', () => closeOverlay());
  S.overlay = { nodes: [scrim, box] };
  render();
  input.focus();
}

function openCommandPalette() {
  const t = activeTab();
  const items = [
    { group: '새로 만들기', icon: 'terminal', text: '새 터미널', hint: 'Ctrl+Shift+T', run: () => newShell() },
    { group: '새로 만들기', icon: 'history', text: 'Claude 마지막 대화 이어서', keywords: 'continue', cls: 'claude', run: () => pickProject({ agent: 'claude', mode: 'continue' }) },
    { group: '새로 만들기', icon: 'history', text: 'Codex 마지막 대화 이어서', keywords: 'resume last', cls: 'codex', run: () => pickProject({ agent: 'codex', mode: 'continue' }) },
    { group: '새로 만들기', icon: 'list', text: '대화 기록에서 열기', hint: 'Ctrl+Shift+O', keywords: 'resume history 재개', run: () => openHistory() },
  ];
  if (t && t.agent) {
    for (const q of agentQuickItems(t)) items.push({ group: `현재 ${AGENTS[t.agent].name} 세션`, ...q });
    if (t.sessionId) items.push({ group: `현재 ${AGENTS[t.agent].name} 세션`, icon: 'copy', text: '재개 명령 복사', run: () => copySessionId(t) });
  }
  for (const p of sortedProjects()) {
    items.push({ group: '프로젝트', icon: 'folder', text: p.name, sub: prettyPath(p.path), keywords: 'project', run: () => newShell(null, p.path) });
  }
  items.push(
    ...S.shells.map((s) => ({ group: '셸', icon: 'terminal', text: `${s.name} 열기`, run: () => newShell(s.id) })),
    { group: '탭', icon: 'edit', text: '탭 이름 변경', hint: 'F2', run: () => t && startRename(t) },
    { group: '탭', icon: 'x', text: '탭 닫기', hint: 'Ctrl+Shift+W', run: () => t && closeTab(t.id) },
    { group: '탭', icon: 'arrowLeft', text: '탭을 왼쪽으로 이동', hint: 'Ctrl+Shift+PgUp', run: () => moveActive(-1) },
    { group: '탭', icon: 'arrowRight', text: '탭을 오른쪽으로 이동', hint: 'Ctrl+Shift+PgDn', run: () => moveActive(1) },
    { group: '분할', icon: 'splitRight', text: '오른쪽으로 분할', hint: 'Alt+Shift+=', keywords: 'split pane', run: () => splitPane('row') },
    { group: '분할', icon: 'splitDown', text: '아래로 분할', hint: 'Alt+Shift+-', keywords: 'split pane', run: () => splitPane('col') },
    { group: '분할', icon: 'maximize', text: '현재 패널만 크게 / 되돌리기', hint: 'Ctrl+Shift+Z', keywords: 'zoom', run: toggleZoom },
    { group: '분할', icon: 'x', text: '분할 해제', keywords: 'unsplit', run: () => unsplit() },
    { group: '분할', icon: 'grid', text: '이 폴더의 탭 한 화면에 보기', hint: 'Ctrl+Shift+G', keywords: 'grid project', run: () => toggleGrid() },
    { group: '탭', icon: 'search', text: '터미널에서 찾기', hint: 'Ctrl+Shift+F', run: openSearch },
    { group: '탭', icon: 'refresh', text: '화면 지우기', run: () => t && t.term.clear() },
    { group: '보기', icon: 'sidebar', text: '사이드바 표시/숨기기', hint: 'Ctrl+Shift+B', run: () => toggleSidebar() },
    { group: '보기', icon: 'plus', text: '글꼴 크게', hint: 'Ctrl+=', run: () => setFontSize(S.settings.fontSize + 1) },
    { group: '보기', icon: 'x', text: '글꼴 작게', hint: 'Ctrl+-', run: () => setFontSize(S.settings.fontSize - 1) },
    { group: '보기', icon: 'type', text: '글꼴 크기 초기화', hint: 'Ctrl+0', run: () => setFontSize(14) },
    { group: '앱', icon: 'folderPlus', text: '프로젝트 추가', run: () => addProject() },
    { group: '앱', icon: 'settings', text: '설정', hint: 'Ctrl+,', run: openSettings },
    { group: '앱', icon: 'folderOpen', text: '설정 폴더 열기', run: () => window.mt.openUserData() },
    { group: '앱', icon: 'trash', text: '휴지통 (삭제한 대화 복원 · 영구 삭제)', keywords: 'trash restore delete', run: openTrash },
  );
  openPalette({ placeholder: '명령, 프로젝트 검색…', items });
}

/** Ask where to start an agent: current folder, projects, home, browse. */
function pickProject({ agent, mode = 'new', permissionMode = '', then } = {}) {
  const go = (cwd) => (then ? then(cwd) : newAgent(agent, { cwd, mode, permissionMode }));
  const A = agent ? AGENTS[agent] : null;
  const items = [];
  const seen = new Set();
  const add = (it, p) => { if (seen.has(normP(p))) return; seen.add(normP(p)); items.push(it); };
  const cur = activeTab()?.cwd;
  if (cur) {
    const pj = projectFor(cur);
    add({ icon: 'folderOpen', text: pj ? pj.name : basename(cur), sub: `현재 탭 · ${prettyPath(cur)}`, run: () => go(cur) }, cur);
  }
  for (const p of sortedProjects()) add({ icon: 'folder', text: p.name, sub: prettyPath(p.path), run: () => go(p.path) }, p.path);
  add({ icon: 'folder', text: '홈 폴더', sub: prettyPath(S.home), run: () => go(S.home) }, S.home);
  items.push({ icon: 'folderPlus', text: '다른 폴더 선택…', sub: '선택한 폴더는 프로젝트로 추가됩니다', run: async () => { const p = await addProject(); if (p) go(p.path); } });
  const verb = mode === 'continue' ? '이어갈' : '시작할';
  openPalette({ placeholder: A ? `${A.name}를 ${verb} 폴더` : '폴더 선택', items });
}

function openHistory() {
  const t = activeTab();
  if (t) openSessionPicker(t.cwd);
  else pickProject({ then: (cwd) => openSessionPicker(cwd) });
}

async function openSessionPicker(cwd) {
  const list = await sessionsFor(cwd, true);
  const items = list.map((s) => {
    const open = S.tabs.find((t) => t.sessionId === s.id);
    return {
      icon: AGENTS[s.agent].icon,
      cls: s.agent,
      text: s.title,
      sub: `${AGENTS[s.agent].name} · ${relTime(s.mtime)}${s.branch ? ' · ' + s.branch : ''}${open ? ' · 열려 있음' : ''}`,
      keywords: `${s.lastPrompt} ${s.id} ${s.agent}`,
      run: () => resumeSession(s.agent, cwd, s.id),
    };
  });
  openPalette({ placeholder: `${basename(cwd)} — 대화 검색 (제목, 프롬프트, claude/codex)`, items, emptyText: '대화 기록이 없습니다' });
}

/* --- modal helpers -------------------------------------------------- */

function openModal({ title, body, foot, width }) {
  closeOverlay();
  const scrim = h('div', 'scrim');
  const m = h('div', 'modal');
  if (width) m.style.width = `min(${width}px, calc(100vw - 40px))`;
  m.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close>${icon('x')}</button></div><div class="modal-body"></div><div class="modal-foot"></div>`;
  m.querySelector('.modal-body').append(body);
  if (foot) m.querySelector('.modal-foot').append(...foot);
  else m.querySelector('.modal-foot').remove();
  overlayRoot.append(scrim, m);
  m.querySelector('[data-close]').addEventListener('click', () => closeOverlay());
  scrim.addEventListener('pointerdown', () => closeOverlay());
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    if (S.overlay?.escHook?.()) return; // e.g. close an open dropdown first
    closeOverlay();
  };
  window.addEventListener('keydown', onKey, true);
  S.overlay = { nodes: [scrim, m], cleanup: () => window.removeEventListener('keydown', onKey, true) };
  return m;
}

function confirmDialog(title, message, okText = '확인') {
  return new Promise((resolve) => {
    let result = false;
    const body = h('p', '', esc(message).replace(/\n/g, '<br>'));
    body.style.cssText = 'margin:0 0 6px;color:var(--text-2);line-height:1.6';
    const cancel = h('button', 'btn small', '취소');
    const ok = h('button', 'btn small primary', esc(okText));
    const right = h('div', 'foot-right');
    right.append(cancel, ok);
    openModal({ title: esc(title), body, foot: [right], width: 420 });
    const prev = S.overlay.cleanup;
    S.overlay.cleanup = () => { prev?.(); resolve(result); };
    cancel.addEventListener('click', () => closeOverlay());
    ok.addEventListener('click', () => { result = true; closeOverlay(); });
    ok.focus();
  });
}

function promptDialog(title, value, cb) {
  const body = h('div');
  const input = h('input', 'text-input');
  input.type = 'text';
  input.value = value || '';
  body.append(input);
  const ok = h('button', 'btn small primary', '저장');
  const wrap = h('div', 'foot-right');
  wrap.append(ok);
  openModal({ title: esc(title), body, foot: [wrap], width: 420 });
  const submit = () => { const v = input.value.trim(); closeOverlay(); cb(v); };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) submit(); if (e.key === 'Escape') closeOverlay(); });
  input.focus();
  input.select();
}

/* --- composer (multi-line prompt editor, Korean IME friendly) ------- */

const drafts = new Map();

/**
 * Input decorations of the terminal, applied to the composer textarea:
 * cursor style / colour, typing effect at the caret, typing sounds.
 */
function composerDeco(field, ta) {
  const st = S.settings;
  // where the caret is, measured with a mirror of the textarea's text
  const mirror = h('div', 'composer-mirror');
  field.appendChild(mirror);
  const caretXY = () => {
    const cs = getComputedStyle(ta);
    for (const p of ['font', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'tabSize', 'wordBreak', 'overflowWrap']) mirror.style[p] = cs[p];
    mirror.style.width = `${ta.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)}px`;
    mirror.textContent = ta.value.slice(0, ta.selectionEnd);
    const mark = document.createElement('span');
    mark.textContent = '​';
    mirror.appendChild(mark);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    return { x: ta.offsetLeft + mark.offsetLeft - ta.scrollLeft, y: ta.offsetTop + mark.offsetTop - ta.scrollTop, lh, ch: parseFloat(cs.fontSize) * 0.6 };
  };

  // cursor
  const kind = st.cursorStyle || 'bar';
  const native = NATIVE_CURSORS[kind];
  const th = currentTheme();
  const acc = (window.ACCENTS[st.accent] || window.ACCENTS.violet).c[0];
  const color = st.cursorColor === 'accent' ? acc : st.cursorColor === 'white' ? (isLight() ? '#1f2430' : '#ffffff') : th.cursor;
  ta.style.caretColor = color;
  let cur = null;
  if (!native || kind === 'bar-thick' || native[0] !== 'bar') { // thin / normal bars stay the native caret
    ta.style.caretColor = 'transparent';
    cur = h('div', `mt-cursor kind-${kind}`);
    if (native) cur.style.setProperty('--cc', color); // block / underline follow 커서 색 like in the terminal
    field.appendChild(cur);
  }
  let last = '';
  let moveTimer = null;
  const place = () => {
    if (!cur) return;
    const p = caretXY();
    const focused = document.activeElement === ta && ta.selectionStart === ta.selectionEnd;
    const outside = p.y < ta.offsetTop - 2 || p.y + p.lh > ta.offsetTop + ta.offsetHeight + 2;
    cur.hidden = !focused || outside;
    const blink = st.cursorBlink && !SELF_ANIMATED_CURSORS.includes(kind);
    cur.className = `mt-cursor kind-${kind}${blink ? ' blink' : ''}${cur.classList.contains('moving') ? ' moving' : ''}`;
    cur.style.width = `${p.ch}px`;
    cur.style.height = `${p.lh}px`;
    const pos = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    if (pos !== last) {
      last = pos;
      cur.style.transform = pos;
      cur.classList.add('moving');
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => cur.classList.remove('moving'), 260);
    }
  };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  for (const ev of ['input', 'click', 'keyup', 'select', 'scroll', 'focus', 'blur', 'compositionupdate']) ta.addEventListener(ev, schedule);
  document.addEventListener('selectionchange', schedule);
  const ro = new ResizeObserver(schedule);
  ro.observe(ta);
  setTimeout(schedule, 30);

  // typing effect at the caret
  let fx = null;
  const fxKind = st.typingFx;
  if (fxKind && fxKind !== 'none') {
    const canvas = h('canvas', 'composer-fx');
    field.appendChild(canvas);
    fx = createFx(canvas);
    const size = () => fx.size(canvas.clientWidth, canvas.clientHeight);
    new ResizeObserver(size).observe(canvas);
    size();
  }
  const PAD = 0; // the fx canvas covers the field exactly (see .composer-fx)
  const burst = (enter, text) => {
    if (!fx) return;
    requestAnimationFrame(() => {
      const p = caretXY();
      // Korean (IME) keys arrive as "Process": use the character now just before the caret
      const shown = text ?? (ta.value[ta.selectionEnd - 1] || '');
      fx.burst(fxKind, p.x + PAD + (enter ? 0 : p.ch / 2), p.y + PAD + p.lh / 2, { enter, k: st.typingFxIntensity, cw: p.ch, ch: p.lh, text: shown });
    });
  };

  return {
    key(e) {
      if (SILENT_KEYS.has(e.key) || e.key === 'Escape') return;
      if ((e.ctrlKey || e.metaKey) && e.key !== 'Enter') return; // shortcuts are not typing
      if (/^(Arrow|Page|Home|End|Tab|F\d)/.test(e.key)) return;
      let k = 'key';
      if (e.key === 'Enter') k = modKey(e) ? 'enter' : 'newline';
      else if (e.key === ' ' || e.code === 'Space') k = 'space';
      else if (e.key === 'Backspace' || e.key === 'Delete') k = 'back';
      const snd = st.typingSound;
      if (snd && snd !== 'none') playKeySound(snd, k, !e.repeat);
      if (k !== 'enter') burst(k === 'newline', e.key.length === 1 ? e.key : KEY_GLYPHS[e.key] ? e.key : jamoFor(e)); // Korean: the 자모 itself
    },
    stop() {
      fx?.stop();
      ro.disconnect();
      document.removeEventListener('selectionchange', schedule);
    },
  };
}

function openComposer() {
  const t = activeTab();
  if (!t || !t.agent) return toast('Claude 또는 Codex 실행 중인 탭에서 사용할 수 있어요', { icon: 'info' });
  const A = AGENTS[t.agent];
  const body = h('div', 'composer');
  body.innerHTML = `<div class="composer-field"><textarea spellcheck="false" placeholder="${A.name}에게 보낼 내용을 편하게 작성하세요.\n여러 줄, 한글 입력, 긴 프롬프트 모두 문제없습니다.\n파일을 끌어다 놓으면 경로가 들어갑니다."></textarea></div>
    <div class="composer-hint"><span><kbd>Ctrl</kbd><kbd>Enter</kbd> 보내기</span><span><kbd>Esc</kbd> 닫기 (초안은 보관)</span></div>`;
  const ta = body.querySelector('textarea');
  ta.value = drafts.get(t.id) || '';
  const deco = composerDeco(body.querySelector('.composer-field'), ta);
  const send = h('button', 'btn small primary', `${icon('arrowRight')}보내기`);
  const insert = h('button', 'btn small', '입력창에 넣기');
  insert.title = '전송하지 않고 입력창에만 넣기';
  const right = h('div', 'foot-right');
  right.append(insert, send);
  const label = h('span', `composer-target ${t.agent}`, `${icon(A.icon)}${esc(tabLabel(t))}`);
  openModal({ title: '프롬프트 작성', body, foot: [label, right], width: 720 });
  const prev = S.overlay.cleanup;
  S.overlay.cleanup = () => { prev?.(); deco.stop(); drafts.set(t.id, ta.value); };

  const deliver = (submit) => {
    const text = ta.value.replace(/\s+$/, '');
    if (!text) return;
    ta.value = '';
    closeOverlay();
    drafts.delete(t.id);
    activate(t.id);
    window.mt.pty.write(t.id, `\x1b[200~${text}\x1b[201~`); // bracketed paste keeps it one prompt
    if (submit) { t.armed = true; setTimeout(() => window.mt.pty.write(t.id, '\r'), 150); }
  };
  send.addEventListener('click', () => deliver(true));
  insert.addEventListener('click', () => deliver(false));
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    deco.key(e);
    if (e.isComposing) return;
    if (e.key === 'Enter' && modKey(e)) { e.preventDefault(); deliver(true); }
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); }
  });
  ta.addEventListener('dragover', (e) => e.preventDefault());
  ta.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const paths = droppedPaths(e);
    if (paths.length) ta.setRangeText(paths.join(' ') + ' ', ta.selectionStart, ta.selectionEnd, 'end');
  });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* --- settings ------------------------------------------------------- */

/* --- font picker ------------------------------------------------------ */

const primaryFont = (ff) => { const m = String(ff || '').match(/^\s*['"]?([^'",]+)['"]?/); return m ? m[1].trim() : ''; };
const fontStack = (name) => `'${name.replace(/'/g, '')}', 'D2Coding', 'Cascadia Mono', Consolas, Menlo, 'Malgun Gothic', 'Apple SD Gothic Neo', monospace`;
let fontListP = null;

function loadFonts() {
  if (!fontListP) {
    fontListP = window.mt.fonts().then((names) => {
      const ctx = document.createElement('canvas').getContext('2d');
      const width = (n, s) => { ctx.font = `16px "${n}", serif`; return ctx.measureText(s).width; };
      const mono = [];
      const other = [];
      for (const n of names) {
        if (n.startsWith('@')) continue; // vertical-writing variants
        (Math.abs(width(n, 'iiiiiiiiii') - width(n, 'MMMMMMMMMM')) < 0.5 ? mono : other).push(n);
      }
      return { mono, other };
    });
  }
  return fontListP;
}

function previewFont(ff) {
  for (const t of S.tabs) t.term.options.fontFamily = ff;
  (currentView().tiles.length ? currentView().tiles : [activeTab()]).forEach(fitTab);
}

function setupFontPicker(root) {
  const btn = root.querySelector('.fp-btn');
  const nameEl = root.querySelector('.fp-name');
  const showCurrent = () => {
    const name = primaryFont(S.settings.fontFamily);
    nameEl.textContent = name || '(기본)';
    nameEl.style.fontFamily = S.settings.fontFamily;
  };
  showCurrent();
  let pop = null;
  let items = [];
  let focus = -1;

  const close = (commit) => {
    if (!pop) return false;
    if (!commit) previewFont(S.settings.fontFamily);
    pop.remove();
    pop = null;
    btn.classList.remove('open');
    S.overlay.nodes = S.overlay.nodes.filter((n) => n.isConnected);
    S.overlay.escHook = null;
    return true;
  };
  const choose = (name) => {
    saveSettings({ fontFamily: fontStack(name) });
    applySettings();
    showCurrent();
    close(true);
  };

  btn.addEventListener('click', async () => {
    if (pop) return close(false);
    pop = h('div', 'fp-pop', `<input type="text" placeholder="글꼴 검색" spellcheck="false"><div class="fp-list"><div class="fp-loading">글꼴 목록을 불러오는 중…</div></div>`);
    overlayRoot.appendChild(pop);
    S.overlay.nodes.push(pop);
    S.overlay.escHook = () => close(false);
    btn.classList.add('open');
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, r.right - 320)}px`;
    const below = innerHeight - r.bottom > 360;
    pop.style.top = below ? `${r.bottom + 4}px` : '';
    pop.style.bottom = below ? '' : `${innerHeight - r.top + 4}px`;
    const input = pop.querySelector('input');
    const list = pop.querySelector('.fp-list');
    input.focus();
    const { mono, other } = await loadFonts();
    if (!pop) return;
    const cur = primaryFont(S.settings.fontFamily).toLowerCase();
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const f = (arr) => arr.filter((n) => !q || n.toLowerCase().includes(q));
      list.innerHTML = '';
      items = [];
      for (const [label, arr] of [['고정폭 글꼴 (터미널 추천)', f(mono)], ['기타 글꼴', f(other)]]) {
        if (!arr.length) continue;
        list.appendChild(h('div', 'fp-group', label));
        for (const n of arr) {
          const b = h('button', 'fp-item' + (n.toLowerCase() === cur ? ' sel' : ''));
          b.type = 'button';
          b.innerHTML = `<span class="fp-label"></span><span class="fp-sample">가나 Ab 0O</span>`;
          b.querySelector('.fp-label').textContent = n;
          b.querySelector('.fp-label').style.fontFamily = `"${n}"`;
          b.querySelector('.fp-sample').style.fontFamily = `"${n}"`;
          b.addEventListener('mouseenter', () => previewFont(fontStack(n)));
          b.addEventListener('click', () => choose(n));
          list.appendChild(b);
          items.push({ n, b });
        }
      }
      if (!items.length) list.innerHTML = '<div class="fp-loading">일치하는 글꼴이 없습니다</div>';
      focus = -1;
    };
    render();
    list.querySelector('.fp-item.sel')?.scrollIntoView({ block: 'center' });
    list.addEventListener('mouseleave', () => previewFont(S.settings.fontFamily));
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing) return;
      const move = (d) => {
        if (!items.length) return;
        focus = Math.max(0, Math.min(items.length - 1, focus + d));
        items.forEach((it, i) => it.b.classList.toggle('focus', i === focus));
        items[focus].b.scrollIntoView({ block: 'nearest' });
        previewFont(fontStack(items[focus].n));
      };
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && items[Math.max(0, focus)]) { e.preventDefault(); choose(items[Math.max(0, focus)].n); }
      else if (e.key === 'Escape') { e.preventDefault(); close(false); }
    });
  });
  // clicking elsewhere in the modal closes the list
  root.closest('.modal').addEventListener('pointerdown', (e) => {
    if (pop && !root.contains(e.target)) close(false);
  });
}

/** 작업 완료 텍스트: phrase list editor, style picker, font list, try-it button. */
function setupDoneTextSettings(body) {
  const listEl = body.querySelector('.dt-list');
  const MAX_ITEMS = 20;
  const save = () => {
    const texts = [...listEl.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
    saveSettings({ doneTexts: texts });
  };
  const row = (value = '') => {
    const r = h('div', 'dt-row');
    r.innerHTML = `<input type="text" maxlength="${DONE_TEXT_MAX}" spellcheck="false" placeholder="예: 수고했어요!"><span class="dt-count"></span><button type="button" class="icon-btn" title="삭제" data-icon="x"></button>`;
    window.hydrateIcons(r);
    const input = r.querySelector('input');
    const count = r.querySelector('.dt-count');
    input.value = value;
    const upd = () => { count.textContent = `${[...input.value].length}/${DONE_TEXT_MAX}`; };
    upd();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addBtn.click(); }
    });
    input.addEventListener('input', () => { upd(); save(); });
    r.querySelector('button').addEventListener('click', () => { r.remove(); save(); addBtn.disabled = false; });
    return r;
  };
  const addBtn = h('button', 'btn small dt-add', `${icon('plus')}문구 추가`);
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    if (listEl.querySelectorAll('.dt-row').length >= MAX_ITEMS) return;
    const r = row();
    listEl.insertBefore(r, addBtn);
    r.querySelector('input').focus();
    addBtn.disabled = listEl.querySelectorAll('.dt-row').length >= MAX_ITEMS;
  });
  for (const t of S.settings.doneTexts || []) listEl.appendChild(row(t));
  listEl.appendChild(addBtn);

  setupPicker(body.querySelector('[data-picker="doneTextStyle"]'), { key: 'doneTextStyle', items: DONE_TEXT_STYLES, preview: previewDoneText, onPick: () => applySettings() });

  // fonts: presets, then whatever is installed
  const sel = body.querySelector('.dt-font');
  const cur = S.settings.doneTextFont || 'ui';
  sel.innerHTML = DONE_TEXT_FONTS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
  sel.value = cur;
  window.mt.fonts().then((fonts) => {
    if (!Array.isArray(fonts) || !fonts.length) return;
    const g = document.createElement('optgroup');
    g.label = '설치된 글꼴';
    for (const f of fonts) { const name = typeof f === 'string' ? f : f.name; if (!name) continue; const o = document.createElement('option'); o.value = name; o.textContent = name; g.appendChild(o); }
    sel.appendChild(g);
    sel.value = cur;
  }).catch(() => {});
  sel.addEventListener('change', () => { saveSettings({ doneTextFont: sel.value }); });

  body.querySelector('.dt-try').addEventListener('click', () => {
    const t = activeTab();
    const host = t?.host;
    const sr = $('#stage').getBoundingClientRect();
    const r = host && host.getBoundingClientRect().width ? host.getBoundingClientRect() : sr;
    showDoneText({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }, null, true);
    // in front of the settings window: the front layer uses window coordinates
    if (S.settings.celebrate) runCelebration(frontFx(), S.settings.celebrateStyle || 'party', r.left + r.width / 2, r.top + Math.min(140, r.height * 0.38), r.width, 1.25);
  });
}

function previewDoneText(kind, el) {
  const make = () => {
    el.innerHTML = '';
    const w = h('span', `done-text dt-${kind} dt-center dt-pv`);
    w.style.cssText = `--dt-size:13px;--dt-font:${doneTextFont(S.settings.doneTextFont)};--dt-time:2s`;
    const inner = h('span', 'dt-inner');
    const glyphs = [...'완료!'];
    glyphs.forEach((ch, i) => {
      const s = h('span', ch === ' ' ? 'dt-ch sp' : 'dt-ch'); s.textContent = ch; s.style.setProperty('--i', i);
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 3}em`); s.style.setProperty('--dy', `${(Math.random() - 0.3) * 2}em`); s.style.setProperty('--dr', `${(Math.random() - 0.5) * 540}deg`);
      inner.appendChild(s);
    });
    inner.style.setProperty('--n', 3);
    inner.dataset.text = '완료!';
    w.appendChild(inner);
    el.appendChild(w);
    if (kind === 'decode') decodeIn(inner, glyphs);
    if (kind === 'shatter') setTimeout(() => w.classList.add('out'), 1100);
  };
  make();
  const timer = setInterval(make, 2200); // replay the entrance
  return () => clearInterval(timer);
}

function openSettings() {
  const st = S.settings;
  const body = h('div');
  const sw = (key) => `<label class="switch"><input type="checkbox" data-k="${key}" ${st[key] ? 'checked' : ''}><i></i></label>`;
  const chips = (key, opts) => `<div class="seg chips" data-seg="${key}">${opts.map(([v, label]) => `<button type="button" data-val="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, label]) => `<button type="button" data-val="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  // 꾸미기: collapsible cards (header shows a summary), and "세부" toggles for each option's details
  const pk = (key) => `<div class="picker" data-picker="${key}"><button class="pk-btn" type="button"><span class="pk-pv"></span><span class="pk-name"></span>${icon('chevronDown')}</button></div>`;
  const decoSec = (id, ic, title, inner) => `<section class="deco-sec" data-sec="${id}"><button type="button" class="ds-head"><span class="ds-ico">${icon(ic)}</span><span class="ds-title"><b>${title}</b><span class="ds-sum"></span></span>${icon('chevronDown', 'ds-chev')}</button><div class="ds-body">${inner}</div></section>`;
  const subBtn = (key) => `<button type="button" class="sub-toggle" data-subfor="${key}" title="세부 설정 펼치기 / 접기">세부${icon('chevronDown')}</button>`;
  const subBox = (key, inner) => `<div class="sub-opts" data-sub="${key}" hidden>${inner}</div>`;
  const themeCards = () => Object.entries(window.THEMES).filter(([, th]) => !!th.light === isLight()).map(([id, th]) => `
    <button type="button" class="theme-card${currentTheme() === th ? ' on' : ''}" data-theme="${id}" style="color:${th.fg};background:${th.bg}" title="${esc(th.desc || '')}">
      <span class="tc-line"><span style="color:${th.ansi[2]}">❯</span> claude <span style="color:${th.ansi[4]}">~/app</span></span>
      <span class="tc-line tc-diff"><span style="color:${th.ansi[2]}">+ fix</span> <span style="color:${th.ansi[1]}">- bug</span> <span style="color:${th.ansi[3]}">warn</span> <span style="color:${th.ansi[5]}">fn</span></span>
      <span class="tc-dots">${[1, 2, 3, 4, 5, 6].map((i) => `<i style="background:${th.ansi[i]}"></i>`).join('')}</span>
      <span class="tc-name">${esc(th.name)}<small>${esc(th.desc || '')}</small></span>
    </button>`).join('');
  const accents = Object.entries(window.ACCENTS).map(([id, a]) => `<button type="button" class="swatch${st.accent === id ? ' on' : ''}" data-accent="${id}" title="${esc(a.name)}" style="background:linear-gradient(135deg, ${a.c[1]}, ${a.c[3]})"></button>`).join('');
  const tabsHtml = [['look', '모양'], ['deco', '꾸미기'], ['term', '터미널'], ['agent', '에이전트']]
    .map(([id, label]) => `<button type="button" data-tab="${id}">${label}</button>`).join('');
  body.innerHTML = `
    <div class="set-tabs">${tabsHtml}</div>
    <div class="set-panel" data-panel="look">
    <div class="field"><div class="field-label"><b>언어 · Language</b><span>앱 화면과 꾸미기 항목에 쓰는 언어</span></div><span class="lang-seg">${seg('lang', [['auto', '자동'], ['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh', '中文']])}</span></div>
    <div class="field"><div class="field-label"><b>화면 테마</b><span>시스템: Windows/macOS 설정을 따라 자동으로 바뀝니다</span></div>${seg('appearance', [['system', '시스템'], ['light', '라이트'], ['dark', '다크']])}</div>
    <div class="field-label sub-head"><b>터미널 색 테마</b><span class="tc-mode">${isLight() ? '라이트' : '다크'} 모드용 · 터미널 배경과 글자 색, 창 색조까지 함께 바뀝니다</span></div>
    <div class="theme-grid">${themeCards()}</div>
    <div class="field"><div class="field-label"><b>강조 색</b><span>버튼, 선택 영역, 활성 탭 표시</span></div><div class="swatches">${accents}</div></div>
    <div class="field"><div class="field-label"><b>창 투명 효과</b><span>창 투명: 뒤가 그대로 비침 · 아크릴/미카: 흐릿하게 비침(Windows 11)</span></div>${seg('bgEffect', [['none', '없음'], ['opacity', '창 투명'], ['acrylic', '아크릴'], ['mica', '미카']])}</div>
    <div class="field${st.bgEffect === 'none' ? ' disabled' : ''}" data-dep="bgEffect"><div class="field-label"><b>투명도</b><span>높을수록 뒤가 더 비쳐 보입니다</span></div>
      <div class="range"><input type="range" min="0" max="0.5" step="0.02" data-k="transparency" value="${(1 - st.bgOpacity).toFixed(2)}"><span class="range-val">${Math.round((1 - st.bgOpacity) * 100)}%</span></div></div>
    <div class="field"><div class="field-label"><b>UI 크기</b><span>탭, 사이드바, 메뉴 크기</span></div>${seg('uiZoom', [['0.9', '작게'], ['1', '보통'], ['1.1', '크게']])}</div>

    </div>
    <div class="set-panel" data-panel="deco">
    ${decoSec('cursor', 'edit', '커서', `
      <div class="field"><div class="field-label"><b>커서 모양</b><span>움직이는 커서는 에이전트 화면에서 자동으로 숨겨집니다</span></div>${pk('cursorStyle')}</div>
      <div class="field"><div class="field-label"><b>커서 색</b><span>기본 커서(막대·블록·밑줄)에 적용</span></div>${seg('cursorColor', [['theme', '테마'], ['accent', '강조 색'], ['white', '흰색']])}</div>`)}
    ${decoSec('typing', 'type', '타이핑', `
      <div class="field"><div class="field-label"><b>입력 효과</b><span>키를 칠 때 커서에서 나타남</span></div><div class="ctl-row">${pk('typingFx')}${subBtn('typingFx')}</div></div>
      ${subBox('typingFx', `
        <div class="field" data-dep="typingFx"><div class="field-label"><b>효과 강도</b><span>크기 · 밝기 · 개수</span></div>
          <div class="range"><input type="range" min="0.3" max="2" step="0.1" data-k="typingFxIntensity" value="${st.typingFxIntensity ?? 1}"><span class="range-val">${Math.round((st.typingFxIntensity ?? 1) * 100)}%</span></div></div>`)}
      <div class="field"><div class="field-label"><b>타이핑 소리</b><span>목록의 ▶ 로 미리 들어볼 수 있어요</span></div><div class="ctl-row">${pk('typingSound')}${subBtn('typingSound')}</div></div>
      ${subBox('typingSound', `
        <div class="field" data-dep="typingSound"><div class="field-label"><b>소리 크기</b></div>
          <div class="range"><input type="range" min="0.05" max="1" step="0.05" data-k="typingVolume" value="${st.typingVolume ?? 0.4}"><span class="range-val">${Math.round((st.typingVolume ?? 0.4) * 100)}%</span></div></div>`)}`)}
    ${decoSec('bg', 'palette', '배경 · 분위기', `
      <div class="field"><div class="field-label"><b>배경 애니메이션</b><span>터미널 뒤에서 은은하게 움직임</span></div><div class="ctl-row">${pk('bgAnim')}${subBtn('bgAnim')}</div></div>
      ${subBox('bgAnim', `
        <div class="field" data-dep="bgAnim"><div class="field-label"><b>배경 밝기</b></div>
          <div class="range"><input type="range" min="0.15" max="1" step="0.05" data-k="bgAnimLevel" value="${st.bgAnimLevel ?? 0.6}"><span class="range-val">${Math.round((st.bgAnimLevel ?? 0.6) * 100)}%</span></div></div>
        <div class="field" data-dep="bgAnim"><div class="field-label"><b>배경 음악</b><span>배경에 어울리는 잔잔한 소리 · 0%면 꺼짐</span></div>
          <div class="range vol-range${(st.bgMusicVolume ?? 0.25) > 0 ? '' : ' muted'}"><button type="button" class="icon-btn vol-mute" data-mute="bgMusicVolume" title="음소거">${icon((st.bgMusicVolume ?? 0.25) > 0 ? 'volume' : 'volumeX')}</button><input type="range" min="0" max="1" step="0.05" data-k="bgMusicVolume" value="${st.bgMusicVolume ?? 0.25}"><span class="range-val">${Math.round((st.bgMusicVolume ?? 0.25) * 100)}%</span></div></div>`)}
      <div class="field"><div class="field-label"><b>배경 이미지</b><span>원하는 그림을 터미널 뒤에 깔기</span></div>
        <div class="ctl-row"><div class="img-pick"><span class="img-thumb"></span><button type="button" class="btn small" data-img="pick">${icon('folderOpen')}선택</button><button type="button" class="btn small" data-img="clear" ${st.bgImage ? '' : 'disabled'}>제거</button></div>${subBtn('bgImage')}</div></div>
      ${subBox('bgImage', `
        <div class="field" data-dep="bgImage"><div class="field-label"><b>이미지 어둡게</b><span>글자가 잘 보이도록</span></div>
          <div class="range"><input type="range" min="0" max="0.95" step="0.05" data-k="bgImageDim" value="${st.bgImageDim ?? 0.55}"><span class="range-val">${Math.round((st.bgImageDim ?? 0.55) * 100)}%</span></div></div>
        <div class="field" data-dep="bgImage2"><div class="field-label"><b>이미지 흐림</b></div>
          <div class="range"><input type="range" min="0" max="30" step="1" data-k="bgImageBlur" value="${st.bgImageBlur || 0}"><span class="range-val">${st.bgImageBlur || 0}px</span></div></div>`)}
      <div class="field"><div class="field-label"><b>검은 배경 칸 숨기기</b><span>배경·투명 효과를 쓸 때 글자 뒤 검은 칸을 투명하게 (색 배경은 유지)</span></div>${sw('hideDarkBg')}</div>
      <div class="field"><div class="field-label"><b>CRT 모드</b><span>옛날 브라운관처럼 주사선과 은은한 글자 번짐</span></div>${sw('crt')}</div>`)}
    ${decoSec('agent', 'sparkle', '에이전트 화면', `
      <div class="field"><div class="field-label"><b>내 프롬프트 표시</b><span>Claude 화면에서 내가 보낸 프롬프트</span></div>${pk('promptStyle')}</div>
      <div class="field"><div class="field-label"><b>선택 대기 말풍선</b><span>에이전트가 선택지를 물어볼 때 사이드바에 뜨는 말풍선</span></div>${pk('choiceBubble')}</div>
      <div class="field"><div class="field-label"><b>작업 중 테두리</b><span>에이전트가 일하는 동안 테두리가 빛납니다</span></div><div class="ctl-row">${sw('workGlow')}${subBtn('workGlow')}</div></div>
      ${subBox('workGlow', `
        <div class="field" data-dep="workGlow"><div class="field-label"><b>테두리 스타일</b></div>${pk('workGlowStyle')}</div>`)}`)}
    ${decoSec('done', 'star', '작업 완료', `
      <div class="field"><div class="field-label"><b>축하 효과</b><span>작업을 마치면 그 화면 위로 효과가 터집니다</span></div><div class="ctl-row">${sw('celebrate')}${subBtn('celebrate')}</div></div>
      ${subBox('celebrate', `
        <div class="field" data-dep="celebrate"><div class="field-label"><b>축하 스타일</b></div>${pk('celebrateStyle')}</div>`)}
      <div class="field"><div class="field-label"><b>완료 텍스트</b><span>작업을 마치면 문구 하나가 화면에 떠오릅니다</span></div><div class="ctl-row">${sw('doneText')}${subBtn('doneText')}</div></div>
      ${subBox('doneText', `
        <div class="dt-opts">
          <div class="field dt-texts"><div class="field-label"><b>문구</b><span>최대 ${DONE_TEXT_MAX}자 · 매번 무작위로 하나</span></div>
            <div class="dt-list"></div></div>
          <div class="field"><div class="field-label"><b>띄우는 방식</b></div>${pk('doneTextStyle')}</div>
          <div class="field"><div class="field-label"><b>글꼴</b><span>설치된 글꼴도 고를 수 있어요</span></div><select class="dt-font"></select></div>
          <div class="field"><div class="field-label"><b>크기</b><span>화면이 좁으면 알아서 줄어듭니다</span></div>
            <div class="range"><input type="range" min="20" max="120" step="2" data-k="doneTextSize" value="${st.doneTextSize ?? 48}"><span class="range-val">${st.doneTextSize ?? 48}px</span></div></div>
          <div class="field"><div class="field-label"><b>위치</b></div>${seg('doneTextPos', [['top', '위'], ['center', '가운데'], ['bottom', '아래']])}</div>
          <div class="field"><div class="field-label"><b>표시 시간</b></div>
            <div class="range"><input type="range" min="1" max="8" step="0.5" data-k="doneTextTime" value="${st.doneTextTime ?? 3}"><span class="range-val">${st.doneTextTime ?? 3}초</span></div></div>
          <div class="field"><div class="field-label"><b>미리 보기</b><span>지금 화면에 한 번 띄워 봅니다</span></div><button type="button" class="btn small dt-try">${icon('play')}띄워 보기</button></div>
        </div>`)}`)}
    </div>
    <div class="set-panel" data-panel="term">
    <div class="field-group">글꼴</div>
    <div class="field"><div class="field-label"><b>글꼴</b><span>설치된 글꼴 · 마우스를 올리면 바로 미리보기</span></div>
      <div class="font-picker"><button class="fp-btn" type="button"><span class="fp-name"></span>${icon('chevronDown')}</button></div></div>
    <div class="field"><div class="field-label"><b>글꼴 크기</b><span>Ctrl+= / Ctrl+- 로도 조절</span></div><input type="number" min="8" max="32" data-k="fontSize" value="${st.fontSize}"></div>
    <div class="field"><div class="field-label"><b>줄 간격</b></div><input type="number" min="1" max="2" step="0.05" data-k="lineHeight" value="${st.lineHeight}"></div>
    <div class="field"><div class="field-label"><b>자간</b></div><input type="number" min="-2" max="6" step="0.5" data-k="letterSpacing" value="${st.letterSpacing}"></div>

    <div class="field-group">동작</div>
    <div class="field"><div class="field-label"><b>기본 셸</b><span>새 탭(Ctrl+Shift+T)에 사용</span></div>
      <select data-k="defaultShell">${S.shells.map((s) => `<option value="${s.id}" ${s.id === st.defaultShell ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="field"><div class="field-label"><b>커서 깜빡임</b></div>${sw('cursorBlink')}</div>
    </div>
    <div class="set-panel" data-panel="agent">
    <div class="field"><div class="field-label"><b>Claude 추가 인자</b><span>이어서 열기 · 세션 복원 때 붙일 옵션 (예: --model opus)</span></div><input type="text" data-k="claudeArgs" value="${esc(st.claudeArgs)}" placeholder="(없음)"></div>
    <div class="field"><div class="field-label"><b>Codex 추가 인자</b><span>예: --model gpt-5-codex</span></div><input type="text" data-k="codexArgs" value="${esc(st.codexArgs)}" placeholder="(없음)"></div>
    <div class="field"><div class="field-label"><b>세션 복원</b><span>다시 열 때 탭과 Claude / Codex 대화를 그대로 이어갑니다</span></div>${sw('restoreSessions')}</div>
    <div class="field"><div class="field-label"><b>완료 알림</b><span>다른 탭의 에이전트가 응답을 마치거나 확인이 필요하면 알려줍니다</span></div>${sw('notifications')}</div>
    <div class="field"><div class="field-label"><b>종료 확인</b><span>에이전트 세션이 실행 중이면 종료 전에 묻기</span></div>${sw('confirmClose')}</div>
    </div>`;
  const ver = h('span', 'muted-sm', `MinsuTerm ${esc(S.version)}`);
  const done = h('button', 'btn small primary', '완료');
  done.addEventListener('click', () => closeOverlay());
  const modal = openModal({ title: '설정', body, foot: [ver, done], width: 620 });
  modal.classList.add('settings');
  const showTab = (id) => {
    S.settingsTab = id;
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    body.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== id; });
  };
  body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab(S.settingsTab || 'look');

  /* 꾸미기 cards and "세부" groups (open state is kept while the app runs) */
  const deco = S.decoUi || (S.decoUi = { open: new Set(), sub: new Set() });
  const cur = (k) => S.settings[k];
  const nameOf = (list, v) => tr((list.find((i) => i[0] === v) || list[0])[1]);
  const subEnabled = {
    typingFx: () => (cur('typingFx') || 'none') !== 'none',
    typingSound: () => (SOUND_ALIASES[cur('typingSound')] || cur('typingSound') || 'none') !== 'none',
    bgAnim: () => (cur('bgAnim') || 'none') !== 'none',
    bgImage: () => !!cur('bgImage'),
    workGlow: () => !!cur('workGlow'),
    celebrate: () => !!cur('celebrate'),
    doneText: () => !!cur('doneText'),
  };
  const summaries = {
    cursor: () => `${nameOf(CURSOR_KINDS, cur('cursorStyle'))} · ${{ theme: '테마 색', accent: '강조 색', white: '흰색' }[cur('cursorColor')] || '테마 색'}`,
    typing: () => `${tr('효과')} ${nameOf(FX_KINDS, cur('typingFx') || 'none')} · ${tr('소리')} ${nameOf(SOUND_KINDS, SOUND_ALIASES[cur('typingSound')] || cur('typingSound') || 'none')}`,
    bg: () => [nameOf(BG_KINDS, cur('bgAnim') || 'none'), cur('bgImage') ? '이미지' : '', cur('crt') ? 'CRT' : ''].filter(Boolean).join(' · '),
    agent: () => `${nameOf(PROMPT_STYLES, cur('promptStyle') || 'default')} · ${tr('테두리')} ${cur('workGlow') ? nameOf(WG_KINDS, cur('workGlowStyle')) : tr('끔')} · ${tr('말풍선')} ${nameOf(BUBBLE_STYLES, cur('choiceBubble') || 'classic')}`,
    done: () => `${cur('celebrate') ? nameOf(CELEB_KINDS, cur('celebrateStyle') || 'party') : '축하 끔'} · ${cur('doneText') ? `${tr('텍스트')} ${nameOf(DONE_TEXT_STYLES, cur('doneTextStyle') || 'pop')}` : '텍스트 끔'}`,
  };
  const wasOn = {};
  const refreshDeco = () => {
    for (const [k, fn] of Object.entries(subEnabled)) {
      const on = !!fn();
      if (on && wasOn[k] === false) deco.sub.add(k); // just switched on: show its details right away
      wasOn[k] = on;
      const open = on && deco.sub.has(k);
      const btn = body.querySelector(`[data-subfor="${k}"]`);
      const box = body.querySelector(`[data-sub="${k}"]`);
      if (btn) { btn.disabled = !on; btn.classList.toggle('open', open); }
      if (box) box.hidden = !open;
    }
    body.querySelectorAll('[data-sec]').forEach((sec) => {
      const id = sec.dataset.sec;
      sec.classList.toggle('open', deco.open.has(id));
      const sum = sec.querySelector('.ds-sum');
      if (sum && summaries[id]) sum.textContent = summaries[id]();
    });
  };
  body.addEventListener('click', (e) => {
    const head = e.target.closest('.ds-head');
    if (head) {
      const id = head.parentElement.dataset.sec;
      const opening = !deco.open.has(id);
      if (opening) deco.open.add(id); else deco.open.delete(id);
      refreshDeco();
      if (opening) requestAnimationFrame(() => head.parentElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      return;
    }
    const sb = e.target.closest('[data-subfor]');
    if (sb) {
      const k = sb.dataset.subfor;
      const opening = !deco.sub.has(k);
      if (opening) deco.sub.add(k); else deco.sub.delete(k);
      refreshDeco();
      if (opening) requestAnimationFrame(() => body.querySelector(`[data-sub="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  });
  // any change anywhere (pickers live outside the modal) → refresh the summaries
  const later = () => setTimeout(refreshDeco, 0);
  document.addEventListener('click', later, true);
  body.addEventListener('input', later);
  body.addEventListener('change', later);
  const prevCleanup = S.overlay.cleanup;
  S.overlay.cleanup = () => { prevCleanup?.(); document.removeEventListener('click', later, true); };
  refreshDeco();
  setupFontPicker(body.querySelector('.font-picker'));
  const depToggle = (key, v) => body.querySelector(`[data-dep="${key}"]`)?.classList.toggle('disabled', !v || v === 'none');
  // background image: pick / clear + thumbnail
  const imgBox = body.querySelector('.img-pick');
  const showThumb = async () => {
    const th = imgBox.querySelector('.img-thumb');
    const data = S.settings.bgImage ? await window.mt.bgImage.get() : '';
    th.style.backgroundImage = data ? `url("${data}")` : '';
    th.classList.toggle('no-img', !data); // not "empty": that class is the empty-stage overlay
    imgBox.querySelector('[data-img="clear"]').disabled = !data;
    body.querySelector('[data-dep="bgImage"]').classList.toggle('disabled', !data);
    body.querySelector('[data-dep="bgImage2"]').classList.toggle('disabled', !data);
    refreshDeco();
  };
  imgBox.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-img]')?.dataset.img;
    if (a === 'pick') {
      const data = await window.mt.bgImage.pick();
      if (data === 'too-big') return toast('25MB 이하 이미지를 골라주세요', { icon: 'info' });
      if (!data) return;
      if (bgImgEl) delete bgImgEl.dataset.loaded;
      saveSettings({ bgImage: true });
    } else if (a === 'clear') {
      await window.mt.bgImage.clear();
      if (bgImgEl) delete bgImgEl.dataset.loaded;
      saveSettings({ bgImage: false });
    } else return;
    applySettings();
    showThumb();
  });
  showThumb();
  setupPicker(body.querySelector('[data-picker="cursorStyle"]'), { key: 'cursorStyle', items: CURSOR_KINDS, preview: previewCursor, onPick: () => applySettings() });
  setupPicker(body.querySelector('[data-picker="typingFx"]'), { key: 'typingFx', items: FX_KINDS, preview: previewFx, onPick: (v) => { depToggle('typingFx', v); applySettings(); } });
  setupPicker(body.querySelector('[data-picker="bgAnim"]'), { key: 'bgAnim', items: BG_KINDS, preview: previewBg, onPick: (v) => { depToggle('bgAnim', v); applySettings(); } });
  setupPicker(body.querySelector('[data-picker="promptStyle"]'), { key: 'promptStyle', items: PROMPT_STYLES, preview: previewPrompt, onPick: () => applySettings() });
  setupPicker(body.querySelector('[data-picker="choiceBubble"]'), { key: 'choiceBubble', items: BUBBLE_STYLES, preview: previewBubble, onPick: () => { renderSessions(); renderProjects(); } });
  setupPicker(body.querySelector('[data-picker="workGlowStyle"]'), { key: 'workGlowStyle', items: WG_KINDS, preview: previewGlow, onPick: () => applySettings() });
  setupPicker(body.querySelector('[data-picker="celebrateStyle"]'), { key: 'celebrateStyle', items: CELEB_KINDS, preview: previewCelebrate, onPick: () => applySettings() });
  setupDoneTextSettings(body);
  if (SOUND_ALIASES[S.settings.typingSound]) S.settings.typingSound = SOUND_ALIASES[S.settings.typingSound];
  setupPicker(body.querySelector('[data-picker="typingSound"]'), {
    key: 'typingSound', items: SOUND_KINDS, preview: previewSound,
    onPick: (v) => { depToggle('typingSound', v); playKeySound(v, false, true); applySettings(); },
  });
  body.querySelectorAll('[data-mute]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.mute;
      const input = btn.parentElement.querySelector('input[type=range]');
      const cur = Number(S.settings[k] ?? input.value) || 0;
      // mute → 0 (remember the level); unmute → back to it
      const next = cur > 0 ? 0 : (Number(S.settings[k + 'Prev']) || 0.25);
      saveSettings(cur > 0 ? { [k]: 0, [k + 'Prev']: cur } : { [k]: next });
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  body.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('keydown', (e) => e.stopPropagation());
    const commit = () => {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.type === 'range') v = Number.isFinite(Number(v)) && v !== '' ? Number(v) : S.settings[k];
      if (k === 'fontSize') v = Math.max(8, Math.min(32, v));
      if (k === 'transparency') {
        el.parentElement.querySelector('.range-val').textContent = `${Math.round(v * 100)}%`;
        saveSettings({ bgOpacity: Math.round((1 - v) * 100) / 100 });
        applySettings();
        return;
      }
      if (k === 'bgAnimLevel' || k === 'bgImageDim' || k === 'typingVolume' || k === 'bgMusicVolume') el.parentElement.querySelector('.range-val').textContent = `${Math.round(v * 100)}%`;
      if (k === 'bgMusicVolume') { S.settings.bgMusicVolume = v; updateAmbient(); syncVolumeRange(el.parentElement, v); }
      if (k === 'bgImageBlur') el.parentElement.querySelector('.range-val').textContent = `${v}px`;
      if (k === 'typingVolume') { S.settings.typingVolume = v; playKeySound(S.settings.typingSound, false, true); }
      if (k === 'workGlow' || k === 'celebrate') body.querySelector(`[data-dep="${k}"]`)?.classList.toggle('disabled', !v);
      if (k === 'doneTextSize') el.parentElement.querySelector('.range-val').textContent = `${v}px`;
      if (k === 'doneTextTime') el.parentElement.querySelector('.range-val').textContent = `${v}초`;
      if (k === 'typingFxIntensity') {
        el.parentElement.querySelector('.range-val').textContent = `${Math.round(v * 100)}%`;
        const t = activeTab();
        if (t) { S.settings.typingFxIntensity = v; spawnFx(t, 'x'); } // live preview at the cursor
      }
      saveSettings({ [k]: v });
      applySettings();
    };
    el.addEventListener(el.type === 'range' ? 'input' : 'change', commit);
  });
  // segmented controls
  body.querySelectorAll('[data-seg]').forEach((segEl) => {
    segEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      const key = segEl.dataset.seg;
      const v = key === 'uiZoom' ? Number(b.dataset.val) : b.dataset.val;
      segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (key === 'appearance') { setAppearanceMode(v).then(refreshThemeCards); return; }
      if (key === 'lang') { saveSettings({ lang: v }); window.I18N?.setLang(v); window.mt.setLang?.(v); renderSessions(); renderProjects(); return; }
      saveSettings({ [key]: v });
      if (key === 'bgEffect') body.querySelector('[data-dep="bgEffect"]').classList.toggle('disabled', v === 'none');
      if (key === 'typingSound') {
        body.querySelector('[data-dep="typingSound"]').classList.toggle('disabled', v === 'none');
        S.settings.typingSound = v;
        playKeySound(v, 'key', true);
        setTimeout(() => playKeySound(v, 'space', true), 160);
        setTimeout(() => playKeySound(v, 'enter', true), 360);
      }
      if (key === 'typingFx') {
        body.querySelector('[data-dep="typingFx"]').classList.toggle('disabled', v === 'none');
        S.settings.typingFx = v;
        const t = activeTab();
        if (t && v !== 'none') spawnFx(t, '\r'); // preview
      }
      applySettings();
    });
  });
  const wireThemeCards = () => body.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    body.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x === b));
    saveSettings(window.THEMES[b.dataset.theme]?.light ? { themeLight: b.dataset.theme } : { theme: b.dataset.theme });
    applySettings();
  }));
  wireThemeCards();
  // after switching light ↔ dark, show that mode's palettes
  const refreshThemeCards = () => {
    const grid = body.querySelector('.theme-grid');
    if (grid) { grid.innerHTML = themeCards(); wireThemeCards(); }
    const lab = body.querySelector('.tc-mode');
    if (lab) lab.textContent = `${isLight() ? '라이트' : '다크'} 모드용 · 터미널 배경과 글자 색, 창 색조까지 함께 바뀝니다`;
  };
  body.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => {
    body.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('on', x === b));
    saveSettings({ accent: b.dataset.accent });
    applySettings();
  }));
}

/* --- toast ---------------------------------------------------------- */

function toast(text, { icon: ic = 'info', ms = 3500, onClick } = {}) {
  const root = $('#toast-root');
  const el = h('div', 'toast', `${icon(ic)}<span>${esc(text)}</span>`);
  root.appendChild(el);
  while (root.children.length > 4) root.firstChild.remove();
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  el.addEventListener('click', () => { kill(); onClick?.(); });
  setTimeout(kill, ms);
}

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

// macOS Edit menu: ⌘C / ⌘V / ⌘A act on a text box if one has focus, otherwise on the terminal
window.mt.onMenuEdit?.((cmd) => {
  const el = document.activeElement;
  const textBox = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.closest('.xterm');
  if (textBox) { document.execCommand(cmd); return; }
  const t = activeTab();
  if (!t) return;
  if (cmd === 'copy') { if (t.term.hasSelection()) copySelection(t); }
  else if (cmd === 'paste') smartPaste(t);
  else if (cmd === 'selectAll') t.term.selectAll();
});

window.addEventListener('keydown', (e) => {
  if (S.overlay) return;
  const t = activeTab();
  // app shortcuts: Ctrl on Windows, ⌘ on macOS (where Ctrl keeps its terminal meaning)
  const c = modKey(e) && !e.altKey && !(IS_MAC ? e.ctrlKey : e.metaKey);
  const cs = c && e.shiftKey;
  const code = e.code;
  const inTerm = !!(document.activeElement && document.activeElement.closest('.xterm'));
  let handled = true;

  if (cs && code === 'KeyT') newShell();
  else if (cs && code === 'KeyW') { if (t) closeTab(t.id); }
  else if (cs && code === 'KeyD') splitPane('row');
  else if (e.altKey && e.shiftKey && !e.ctrlKey && (code === 'Equal' || code === 'NumpadAdd')) splitPane('row');
  else if (e.altKey && e.shiftKey && !e.ctrlKey && (code === 'Minus' || code === 'NumpadSubtract')) splitPane('col');
  else if (cs && code === 'KeyZ') toggleZoom();
  else if (cs && code === 'KeyG') toggleGrid();
  else if (modKey(e) && e.altKey && !e.shiftKey && code === 'ArrowLeft') focusPane(-1, 0);
  else if (modKey(e) && e.altKey && !e.shiftKey && code === 'ArrowRight') focusPane(1, 0);
  else if (modKey(e) && e.altKey && !e.shiftKey && code === 'ArrowUp') focusPane(0, -1);
  else if (modKey(e) && e.altKey && !e.shiftKey && code === 'ArrowDown') focusPane(0, 1);
  else if (cs && code === 'KeyP') openCommandPalette();
  else if (cs && code === 'KeyB') toggleSidebar();
  else if (cs && code === 'KeyF') openSearch();
  else if (cs && code === 'KeyE') openComposer();
  else if (cs && code === 'KeyO') openHistory();
  else if (cs && code === 'KeyC') { if (t) copySelection(t); }
  else if (cs && code === 'KeyV') { if (t) smartPaste(t); }
  else if (cs && code === 'PageUp') moveActive(-1);
  else if (cs && code === 'PageDown') moveActive(1);
  else if (cs && code === 'KeyI') window.mt.devtools();
  else if (c && code === 'Tab') cycle(e.shiftKey ? -1 : 1);
  else if (c && !e.shiftKey && /^Digit[1-9]$/.test(code)) {
    const n = Number(code.slice(5));
    const target = n === 9 ? S.tabs[S.tabs.length - 1] : S.tabs[n - 1];
    if (target) activate(target.id);
  }
  else if (c && !e.shiftKey && (code === 'Equal' || code === 'NumpadAdd')) setFontSize(S.settings.fontSize + 1);
  else if (c && !e.shiftKey && (code === 'Minus' || code === 'NumpadSubtract')) setFontSize(S.settings.fontSize - 1);
  else if (c && !e.shiftKey && (code === 'Digit0' || code === 'Numpad0')) setFontSize(14);
  else if (c && !e.shiftKey && code === 'Comma') openSettings();
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && code === 'F2') { if (t) startRename(t); }
  else if (inTerm && t && c && !e.shiftKey && code === 'KeyC' && t.term.hasSelection()) copySelection(t);
  else if (inTerm && t && c && !e.shiftKey && code === 'KeyV') smartPaste(t);
  else if (inTerm && t && t.agent && t.alive && e.shiftKey && !e.ctrlKey && !e.altKey && code === 'Enter') {
    sendNewline(t);
  }
  else handled = false;

  if (handled) { e.preventDefault(); e.stopPropagation(); }
}, true);

/**
 * Shift+Enter → newline inside the agent's prompt. If a Korean (IME) character is still being composed,
 * the IME commits it only after this key — so wait for that commit, otherwise the last character
 * would land on the new line.
 */
function sendNewline(t) {
  const nl = AGENTS[t.agent].newline;
  // Nothing being typed in Korean: the newline goes straight out.
  if (!t.composing && !t.compFinal) { window.mt.pty.write(t.id, nl); return; }
  // A syllable is still composing, or was just committed and is on its way through xterm. The newline must
  // follow that syllable exactly once — never before it (it would jump to the next line) and never with a
  // second copy. So wait for it: term.onData sends the newline the moment the syllable is written.
  clearTimeout(t.nlTimer);
  t.nlPending = nl;
  t.nlTimer = setTimeout(() => {
    if (!t.nlPending) return;
    t.nlPending = null;
    if (t.composing && t.compText) {
      // the IME is holding on to it (it never saw this Shift+Enter): send it ourselves, drop any later copy,
      // and end the composition by moving focus away and back
      const comp = t.compText;
      window.mt.pty.write(t.id, comp + nl);
      t.swallow = comp;
      clearTimeout(t.swallowTimer);
      t.swallowTimer = setTimeout(() => { t.swallow = null; }, 800);
      t.composing = false;
      const ta = t.term.textarea;
      if (ta) {
        ta.blur();
        setTimeout(() => { ta.value = ''; if (S.activeId === t.id && !S.overlay) t.term.focus(); }, 0);
      }
    } else {
      window.mt.pty.write(t.id, nl);
    }
  }, 120);
}

function cycle(delta) {
  if (!S.tabs.length) return;
  const i = S.tabs.findIndex((t) => t.id === S.activeId);
  activate(S.tabs[(i + delta + S.tabs.length) % S.tabs.length].id);
}

/* ------------------------------------------------------------------ */
/* Mouse in terminal: right-click copy/paste, file drop               */
/* ------------------------------------------------------------------ */

// Right button belongs to our menu only: never forward it to the terminal app
// (agents enable mouse reporting, which would type escape codes into the prompt).
for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick']) {
  termsEl.addEventListener(type, (e) => {
    if (e.button === 2) {
      e.stopPropagation();
      if (type === 'mousedown') e.preventDefault();
    }
  }, true);
}

termsEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const host = e.target.closest('.term-host');
  const t = S.tabs.find((x) => x.host === host) || activeTab();
  if (!t) return;
  if (t.id !== S.activeId) activate(t.id);
  if (t.term.hasSelection()) { copySelection(t); return; }
  const items = [
    { icon: 'copy', text: '붙여넣기', hint: 'Ctrl+V', run: () => smartPaste(t) },
    { icon: 'type', text: '모두 선택', run: () => t.term.selectAll() },
    { icon: 'search', text: '찾기', hint: 'Ctrl+Shift+F', run: openSearch },
    { icon: 'refresh', text: '화면 지우기', run: () => t.term.clear() },
    '-',
    ...splitItems(t),
  ];
  if (t.agent) items.push('-', ...agentQuickItems(t));
  openMenu(items, e.clientX, e.clientY);
});

function droppedPaths(e) {
  const out = [];
  for (const f of e.dataTransfer?.files || []) {
    const p = window.mt.filePath(f);
    if (p) out.push(/\s/.test(p) ? `"${p}"` : p);
  }
  return out;
}

const stage = $('#stage');
let dropHint = null;
stage.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types?.includes('Files') || !activeTab()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  if (!dropHint) {
    const t = activeTab();
    dropHint = h('div', 'drop-hint', `<div>${icon('arrowDown')}<b>파일을 놓아 경로 넣기</b><span>${t.agent ? `${AGENTS[t.agent].name}가 파일과 이미지를 읽을 수 있어요` : '현재 셸에 경로를 입력합니다'}</span></div>`);
    stage.appendChild(dropHint);
  }
});
stage.addEventListener('dragleave', (e) => {
  if (dropHint && !stage.contains(e.relatedTarget)) { dropHint.remove(); dropHint = null; }
});
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  if (dropHint) { dropHint.remove(); dropHint = null; }
  const t = activeTab();
  const paths = droppedPaths(e);
  if (t && paths.length) { t.term.paste(paths.join(' ') + ' '); t.term.focus(); }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (!a) return;
  if (a === 'new-claude') pickProject({ agent: 'claude' });
  else if (a === 'new-codex') pickProject({ agent: 'codex' });
  else if (a === 'new-shell') newShell();
  else if (a === 'add-project') addProject();
  else if (a === 'palette') openCommandPalette();
  else if (a === 'settings') openSettings();
  else if (a === 'history') openHistory();
  else if (a === 'recycle') openTrash();
});

$('#btn-sidebar').addEventListener('click', () => toggleSidebar());
$('#btn-new').addEventListener('click', () => newShell());
$('#btn-new-menu').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); openNewMenu(r.left, r.bottom + 6); });
$('#btn-add-project').addEventListener('click', () => addProject());
$('#st-palette').addEventListener('click', () => openCommandPalette());
$('#st-composer').addEventListener('click', () => openComposer());
$('#st-session').addEventListener('click', () => { const t = activeTab(); if (t?.sessionId) copySessionId(t); });

new ResizeObserver(() => (S.grid ? gridTiles() : [activeTab()]).forEach(fitTab)).observe(termsEl);
$('#zoombar-exit').addEventListener('click', () => toggleZoom());
$('#gridbar-exit').addEventListener('click', () => { S.grid = null; applyLayout(); renderProjects(); activeTab()?.term.focus(); });

window.mt.onWinFocus((f) => {
  S.winFocused = f;
  if (f) {
    const t = activeTab();
    if (t && t.unseen) { t.unseen = false; updateTabEl(t); renderSessions(); }
    if (t && !S.overlay) t.term.focus();
  }
});
window.mt.onFocusTab((id) => activate(id));

setInterval(() => { if (S.expanded.size) { S.sessionCache.clear(); renderProjects(); } }, 60000);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

(async function boot() {
  hydrateIcons();
  const init = await window.mt.init();
  S.settings = init.store.settings;
  window.I18N?.start(S.settings.lang || 'auto'); // 한국어 · English · 日本語 · 中文
  S.projects = init.store.projects || [];
  S.tasks = (init.store.tasks || []).map((k) => (k.status === 'working' || k.status === 'attention' ? { ...k, status: 'stopped', end: k.end || k.start } : k));
  S.shells = init.shells;
  S.home = init.home;
  S.version = init.version;
  if (!S.shells.find((s) => s.id === S.settings.defaultShell)) S.settings.defaultShell = S.shells[0]?.id || 'cmd';
  $('#version').textContent = `v${init.version}`;
  if (!S.settings.sidebarVisible) document.getElementById('app').classList.add('no-sidebar');
  applyAppearance();
  if (S.settings.sidebarWidth) setSidebarWidth(S.settings.sidebarWidth);

  renderProjects();
  renderSessions();
  renderStatus();
  updateEmpty();

  await document.fonts.ready.catch(() => {});

  const layout = init.store.layout;
  if (S.settings.restoreSessions && layout?.tabs?.length) {
    for (const lt of layout.tabs) {
      let launch = null;
      if (lt.agent === 'claude' || lt.agent === 'codex') {
        const ok = lt.sessionId && await window.mt.agent.has(lt.agent, lt.cwd, lt.sessionId);
        launch = { type: lt.agent, mode: ok ? 'resume' : 'continue', sessionId: ok ? lt.sessionId : '', permissionMode: lt.permissionMode };
      }
      const nt = createTab({ shellId: lt.shellId, cwd: lt.cwd, customTitle: lt.customTitle, launch, background: true });
      if (nt && lt.workingSince) nt.restoredWorkSince = lt.workingSince; // keeps the elapsed time if it's still working
    }
    for (const g of layout.groups || []) {
      const ids = (g.idx || []).map((i) => S.tabs[i] && S.tabs[i].id).filter(Boolean);
      if (ids.length >= 2) S.groups.push({ dir: g.dir || 'row', ids });
    }
    const target = S.tabs[Math.min(layout.active || 0, S.tabs.length - 1)];
    if (target) activate(target.id);
  }
  if (!S.tabs.length) newShell(S.settings.defaultShell, S.home);
})();
