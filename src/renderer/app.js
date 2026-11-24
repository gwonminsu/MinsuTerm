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
/** The tab showing a conversation — also one still starting up (its agent is only detected about a second after launch). */
const tabOfSession = (id) => (id && S.tabs.find((t) => t.sessionId === id || (t.launch && t.launch.sessionId === id))) || null;

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
  redrawAgents.at = performance.now();
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
    t.term.options.letterSpacing = clampLetterSpacing(st.letterSpacing);
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
  ['glow', '글로우', '커서 주변이 은은하게 빛남 · Enter는 줄을 훑는 빛'],
  ['ripple', '물결', '동그란 파동이 퍼짐 · Enter는 물방울 파문'],
  ['shockwave', '충격파', '이중 링과 섬광 · Enter는 줄을 따라 폭발'],
  ['particles', '파티클', '작은 입자가 흩어짐 · Enter는 모였다 터지는 고리'],
  ['spark', '스파크', '빛줄기가 사방으로 · Enter는 손 불꽃놀이'],
  ['stars', '별빛', '반짝이는 별이 퍼짐 · Enter는 별똥별'],
  ['pixel', '픽셀', '레트로 사각 픽셀 · Enter는 8비트 아이콘'],
  ['ember', '불꽃', '불씨가 위로 피어오름 · Enter는 솟구치는 모닥불'],
  ['bubbles', '버블', '방울이 떠오르다 사라짐 · Enter는 큰 비눗방울'],
  ['hearts', '하트', '하트가 둥실 떠오름 · Enter는 두근두근 하트'],
  ['matrix', '매트릭스', '초록 글자가 흘러내림 · Enter는 녹색 코드 비'],
  ['lightning', '번개', '짧은 전기 불꽃 · Enter는 내리꽂는 번개'],
  ['confetti', '컨페티', '테마 색 종이가 터짐 · Enter는 파티 폭죽'],
  ['petals', '벚꽃잎', '꽃잎이 흩날리며 내려앉음 · Enter는 꽃잎 회오리'],
  ['butterfly', '나비', '날개를 팔랑이며 날아가는 나비 · Enter는 나비 떼'],
  ['notes', '음표', '♪ ♫ 음표가 리듬 타며 떠오름 · Enter는 오선지와 화음'],
  ['firework', '미니 폭죽', '슝 올라가서 팡 터짐 · Enter는 국화 불꽃'],
  ['ink', '먹물', '붓끝 먹물이 번지고 방울이 튐 · Enter는 붓으로 그린 원'],
  ['snowflake', '눈송이', '육각 눈송이가 빙글 내려앉음 · Enter는 얼음 결정'],
  ['letters', '글자 파편', '방금 입력한 글자가 톡톡 튀어나옴 (한글은 자음·모음) · Enter는 글자가 와르르'],
  ['slash', '검기', '촥 하고 빛의 칼날이 지나감 · Enter는 십자 베기'],
  ['emojipop', '이모지 팝', '😀🔥✨ 이모지가 톡 튀어나와 둥실 · Enter는 이모지 분수'],
  ['ono', '의성어', '"톡! 탁! 딱!" 만화 글자가 튀어나옴 · Enter는 "쾅!" 폭발 말풍선'],
  ['popcorn', '팝콘', '팝콘 알갱이가 팡 튀어 올랐다 떨어짐 · Enter는 팝콘 한 무더기'],
  ['paint', '물감 튀김', '알록달록 물감이 철퍽 튀김 · Enter는 삼색 물감 폭탄'],
  ['coins', '코인', '금화가 빙글빙글 돌며 튀어나옴 · Enter는 코인 잭팟'],
  ['gblock', '글리치 블록', 'RGB로 찢어진 조각이 지지직 (멋있는) · Enter는 찢기는 줄'],
  ['laser', '레이저', '네 방향으로 레이저 빔이 쭉 뻗어나감 (멋있는) · Enter는 회전 레이저 스캔'],
  ['bloom', '꽃 피기', '커서에서 꽃 한 송이가 활짝 피어남 (이쁜) · Enter는 작은 꽃다발'],
  ['glitter', '반짝이 가루', '파스텔 반짝이 가루가 살랑살랑 내려앉음 (이쁜) · Enter는 반짝이 폭탄'],
  ['dice', '주사위', '주사위가 데굴데굴 굴러 숫자가 나옴 (재미있는) · Enter는 더블 식스'],
  ['balloonpop', '풍선 펑', '작은 풍선이 부풀다가 "펑!" (재미있는) · Enter는 풍선 다발'],
  ['raindrop', '빗방울', '위에서 빗방울이 똑 떨어져 물결이 퍼짐 · Enter는 소나기와 물결'],
  ['meteors', '별똥별', '작은 별똥별이 사선으로 쏟아져 반짝 · Enter는 불덩이 운석'],
  ['ghost', '유령', '차가운 숨결과 서리가 번짐 · Enter는 영혼을 빨아들이는 망령'],
  ['movable', '금속활자', '청동 활자가 탁 찍혀 한지에 먹 글자를 남김 · Enter는 붉은 낙관'],
  ['holy', '천상의 빛', '금빛 빛줄기가 퍼지고 깃털이 내려앉음 · Enter는 빛기둥과 날개'],
  ['hellfire', '지옥불', '검붉은 불길이 솟고 불씨가 흩날림 · Enter는 불타는 마법진'],
  ['blood', '핏자국', '피가 튀어 흘러내림 · Enter는 할퀸 자국'],
  ['magiccircle', '마법진', '커서 아래 빛나는 마법진이 돌며 피어남 · Enter는 3단 마법진'],
];

/* Scene backgrounds (src/renderer/scenes/): drawn in ink and haze over the theme's own background. */
const SCENE_BGS = ['haunted', 'heaven', 'castle', 'hell', 'cyberpunk', 'korea', 'steampunk', 'analog', 'backrooms'];
const BG_KINDS = [
  ['none', '없음', '배경 애니메이션 없음'],
  ['stars', '별밤', '천천히 흐르는 별들'],
  ['aurora', '오로라', '강조 색 빛이 일렁임'],
  ['rain', '비', '사선으로 내리는 빗줄기'],
  ['thunder', '뇌우', '비 내리는 밤, 가끔 구름 속에서 번개가 번쩍'],
  ['snow', '눈', '흩날리는 눈송이'],
  ['autumn', '가을 단풍길', '붉은 단풍 터널 너머 노을빛, 흩날리는 낙엽이 길에 내려앉음'],
  ['grid', '신스웨이브', '네온 원근 그리드'],
  ['network', '입자 네트워크', '깊이 있는 점 구름과 연결선, 신호가 노드를 타고 퍼짐'],
  ['fireflies', '반딧불', '따뜻한 빛이 둥실 떠다니며 깜빡임'],
  ['mushroom', '빛나는 버섯 숲', '스스로 빛나는 버섯과 떠다니는 포자, 이끼 덮인 숲'],
  ['sakura', '벚꽃', '분홍 꽃잎이 흩날리며 떨어짐'],
  ['bamboo', '대나무 숲', '안개 속에 흔들리는 대나무, 사이로 내려오는 햇살과 날리는 댓잎'],
  ['bokeh', '보케', '흐릿한 빛망울이 천천히 떠다님'],
  ['waves', '물결', '아래쪽에서 잔잔하게 일렁이는 파도'],
  ['shooting', '별똥별', '은하수 아래 숲 너머로 별똥별이 흐름 · 가끔 불덩이 유성과 유성우'],
  ['sunset', '노을', '바다 위의 하루 · 해가 지며 구름이 물들고, 별이 뜬 밤과 새벽을 지나 다시 노을'],
  ['planewindow', '구름 위 비행기 창밖', '해질녘 구름바다가 흘러가고 날개 끝 불빛이 깜빡임'],
  ['blackhole', '블랙홀', '뜨거운 원반이 돌고 그 뒷면이 휘어 그림자 위를 감쌈 · 가끔 무언가 빨려 들어가 번쩍임'],
  ['warp', '워프 드라이브', '별빛이 길게 늘어지며 우주를 질주'],
  ['jellyfish', '해파리', '빛나는 해파리가 촉수를 흔들며 유영'],
  ['lanterns', '풍등', '따뜻한 등불이 일렁이며 밤하늘로 떠오름'],
  ['campfire', '캠프파이어', '타닥타닥 타는 모닥불과 하늘로 튀어 오르는 불씨'],
  ['haunted', '으스스한 숲', '안개 낀 죽은 숲, 어둠 속에서 붉은 눈이 깜빡인다'],
  ['heaven', '천상', '쏟아지는 빛 아래 천사들이 보좌하는 하늘'],
  ['castle', '마왕성', '핏빛 달 아래 번개 치는 마왕의 성과 박쥐 떼'],
  ['ruins', '고대 신전 유적', '덩굴 덮인 돌기둥과 천장 틈으로 드는 빛줄기, 반짝이는 먼지'],
  ['hell', '지옥', '끓어오르는 용암과 타오르는 불씨, 자욱한 연기'],
  ['cyberpunk', '사이버펑크', '비 내리는 네온 도시와 날아다니는 차들'],
  ['arcade', '레트로 오락실', '어두운 오락실, 오락기 화면 불빛과 가끔 깜빡이는 네온 간판'],
  ['korea', '한국의 밤', '보름달 아래 수묵 산수, 소나무와 처마, 날아가는 학'],
  ['cheonma', '천마', '허공에 뜬 천마의 이기어검에 구파일방 영웅들이 밀려남'],
  ['steampunk', '스팀펑크', '맞물려 도는 황동 톱니와 시계탑, 증기 속을 떠가는 비행선'],
  ['analog', '아날로그 호러', '낡은 비디오테이프 화면, 잡음 사이로 무언가가 스쳐 지나간다'],
  ['backrooms', '백룸', '끝없이 이어지는 누런 방과 웅웅거리는 형광등'],
  ['constellation', '별자리', '실제 별자리의 별이 밝아지고 선이 이어지며 이름이 떠올랐다 사라짐'],
  ['lavalamp', '라바 램프', '말랑한 빛 덩어리가 천천히 오르내림'],
  ['dna', 'DNA 나선', '이중 나선이 천천히 회전, 가끔 한 구간이 풀렸다 닫힘'],
  ['pond', '빗방울 연못', '수면 위로 빗방울 동심원이 퍼짐'],
  ['code', '코드 비', '여러 깊이의 코드 줄기가 흘러내림, 가끔 멈추거나 깨짐'],
  ['circuit', '회로 기판', '회로선을 따라 빛 신호가 달려감'],
  ['tunnel', '시공간 터널', '휘어지며 소용돌이치는 빛의 터널, 끝의 빛을 향해 이따금 속도가 붙음'],
  ['deepsea', '심해', '희미한 빛줄기와 바다눈 사이로 스스로 빛나는 심해 생물들이 떠다님'],
  ['nightfire', '밤하늘 불꽃', '강 건너 마을 위로 불꽃놀이가 연이어 피어나 물에 비침'],
  ['aquarium', '수족관', '꼬리 흔드는 물고기들이 헤엄치고 기포가 보글'],
  ['life', '생명 게임', '빛나는 세포가 태어나고 스러지며, 글라이더가 꼬리를 끌고 지나감'],
  ['bounce', '튕기는 로고', '앱 로고가 벽에 부딪힐 때마다 찌그러지며 색이 바뀜 · 모서리에 맞으면 반짝!'],
  ['pong', '혼자 하는 탁구', '탁구대에서 두 라켓이 알아서 랠리 · 가끔 스매시, 공을 놓치면 심판 휘슬'],
  ['balloonsky', '풍선 하늘', '알록달록 풍선이 줄을 늘어뜨리고 둥실 떠오름'],
  ['skywhale', '하늘 고래', '새벽 구름 바다를 천천히 유영하는 거대한 고래 · 가끔 새끼와 함께'],
  ['domino', '도미노', '탁자 위 끝없는 도미노 코스 · 곡선·갈림길·계단·나선·다리를 따라 촤라락 쓰러지며 그림이 드러나고 종이 울림'],
  ['spiderweb', '거미줄', '새벽 숲, 바람에 띄운 첫 실부터 거미가 거미줄을 짓고 이슬이 맺힘 · 걸린 벌레는 감아 먹고, 찢기면 그 자리에서 고침'],
  ['worker', '작업하는 일꾼', '미니어처 공방 · 에이전트가 일하면 등불 아래 뚝딱뚝딱, 기다리면 꾸벅꾸벅, 끝나면 완성품을 선반에'],
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
    fx.raf = 0;
    if (now - (fx.last || 0) < 15) { fx.raf = requestAnimationFrame(fx.loop); return; } // ~60 fps on high-refresh screens
    fx.last = now;
    try { drawFx(fx); } catch (e) { console.error(e); fx.parts = []; } // one bad particle must not stop the effects for good
    fx.raf = fx.parts.length ? requestAnimationFrame(fx.loop) : 0;
    if (!fx.raf) fx.ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  fx.stop = () => { cancelAnimationFrame(fx.raf); fx.raf = 0; fx.parts = []; };
  fx.kick = () => { if (!fx.raf) fx.raf = requestAnimationFrame(fx.loop); };
  return fx;
}

/** Run fn whenever the display scale changes (the window moved to a screen with another scale). */
function onDprChange(fn) {
  const arm = () => window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => { fn(); arm(); }, { once: true });
  arm();
}

/** What a key looks like as a flying glyph: the character itself, or a symbol for keys that aren't one. */
const KEY_GLYPHS = { '\x7f': '←', '\b': '←', Backspace: '←', Delete: '⌦', '\r': '↵', '\n': '↵', Enter: '↵', '\t': '⇥', Tab: '⇥', ' ': '␣', '\x1b': 'esc', Escape: 'esc' };
function typedGlyphs(text) {
  if (text == null || text === '') return [];
  if (KEY_GLYPHS[text]) return [KEY_GLYPHS[text]];
  return [...String(text).slice(0, 64)].map((c) => KEY_GLYPHS[c] ?? c).filter((c) => c.length > 1 || c.charCodeAt(0) >= 32);
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

  const sub = o.submit && window.FX_SUBMIT && window.FX_SUBMIT[kind]; // a real submit (not a celebration's burst): the effect's own flourish (fx/submit-*.js)
  if (sub) { try { sub({ fx, P: fx.parts, x, y, o, k, sz, cw, ch, cols, pick, alpha, rnd, L: isLight() }); } catch (e) { console.error(e); } return; }
  const ext = window.FX_EXT && window.FX_EXT[kind]; // effects kept in their own module (fx/effects.js)
  if (ext) { ext.burst({ fx, P, x, y, o, enter, k, sz, cw, ch, cols, pick, alpha, n, rnd }); return; }
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
    if (p.draw) { p.draw(ctx, p, fx); continue; } // a particle that paints itself (fx/effects.js)
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
  onDprChange(size);
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
  onDprChange(size);
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
  // Other highlighted cells sit below the input box too (an agent's task list, a selected menu item): the caret is
  // the one inside the box — between the two horizontal rules — or on the prompt row; else the lowest one.
  const t = tab.term;
  const b = t.buffer.active;
  const cell = b.getNullCell();
  let lowest = null, prompt = null;
  const rules = [];
  for (let y = t.rows - 1; y >= Math.max(0, t.rows - 30); y--) {
    const line = b.getLine(b.viewportY + y);
    if (!line) continue;
    const text = line.translateToString(true);
    if ((text.match(/[─━]/g) || []).length >= 20) { rules.push(y); continue; }
    let inv = null;
    for (let x = 0; x < t.cols; x++) if (line.getCell(x, cell) && cell.isInverse()) { inv = { x, y }; break; }
    if (!inv) continue;
    if (rules.length === 1) return inv; // past the box's lower rule, not yet its upper one: inside the box (rows are scanned upward)
    if (!prompt && /^\s*[❯›>]/.test(text)) prompt = inv;
    if (!lowest) lowest = inv;
  }
  return prompt || lowest;
}
/** The cell just past the last non-blank one on screen row y (0 for a blank row). */
function rowEnd(tab, y) {
  const b = tab.term.buffer.active, line = b.getLine(b.viewportY + y), cell = b.getNullCell();
  if (!line) return 0;
  for (let x = tab.term.cols - 1; x >= 0; x--) {
    if (!line.getCell(x, cell)) continue;
    const ch = cell.getChars();
    if (ch && ch !== ' ') return x + Math.max(1, cell.getWidth());
  }
  return 0;
}
/** Where the text of row y starts, past a prompt mark (❯ › >) and the indent: a wrapped input goes on from here. */
function rowStart(tab, y) {
  const b = tab.term.buffer.active, line = b.getLine(b.viewportY + y);
  const m = line ? /^\s*(?:[❯›>]\s+)?/.exec(line.translateToString(false)) : null;
  return m && m[0].length <= 8 ? m[0].length : 2;
}
function setCaret(tab, c) { tab.caret = c; tab.caretAt = performance.now(); }
function settleCaret(tab) {
  const t = tab.term;
  const b = t.buffer.active;
  if (b.viewportY !== b.baseY) return;
  let hidden = false;
  try { hidden = !!t._core.coreService.isCursorHidden; } catch { /* ignore */ }
  if (!hidden) {
    setCaret(tab, { x: b.cursorX, y: b.cursorY }); tab.curShownAt = performance.now();
    tab.caretAtEnd = b.cursorX >= rowEnd(tab, b.cursorY); // typing at the end of the input (not editing in the middle of it)
  } else if (tab.agent && !(performance.now() - (tab.curShownAt || 0) < CURSOR_REDRAW_MS)) {
    const c = findDrawnCaret(tab);
    if (c) setCaret(tab, c);
    else if (tab.caret && tab.caretAtEnd) {
      // Claude Code (a long session, a background one attached) keeps its cursor hidden for as long as keys keep
      // coming: held down, the caret stayed where the key went down and the effects lost their place. Typing at the
      // end of the input, the caret is the end of the text on its row (the box grows upward as the input wraps, so
      // the row stays put).
      const n = rowEnd(tab, tab.caret.y);
      if (n >= 1 && n <= t.cols - 1 && n !== tab.caret.x) setCaret(tab, { x: n, y: tab.caret.y });
    }
  }
  // (an agent that showed its cursor a moment ago is only redrawing: the caret stays where it was)
}
function stableCaret(tab) {
  const b = tab.term.buffer.active;
  return tab.caret || { x: b.cursorX, y: b.cursorY };
}
/*
 * Does the lead over typed text the agent has not echoed yet (tab.ahead, see onData) still hold at caret c? Not once
 * the caret went back left — Claude Code wraps long input onto a new line with the caret's row staying put (the box
 * grows upward), a redraw, a deletion — nor when the lead would run past the last column: the cursor flew off the
 * right edge whenever a long prompt wrapped.
 */
function aheadHolds(ah, c, cols) {
  return !!ah && ah.y === c.y && c.x >= ah.base && c.x >= (ah.seen || 0) && c.x < ah.base + ah.cells && ah.base + ah.cells <= cols - 1;
}
/** Cells the caret is ahead of the echo right now (0 if no lead holds). */
function aheadCells(tab) {
  const ah = tab.ahead, c = stableCaret(tab);
  return ah && performance.now() - ah.t <= 700 && aheadHolds(ah, c, tab.term.cols) ? ah.base + ah.cells - c.x : 0;
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
  // Where the text lands: the cursor cell now, before the echo moves it. Keys typed faster than the echo comes
  // back would all see the same cell, so the next cell is predicted from the previous key.
  let pre = null, line = null;
  if (!jamo && !/[\x00-\x1f\x7f]/.test(data)) {
    if (tab.agent) settleCaret(tab); // where the agent has drawn its caret right now (a busy agent never lets it settle)
    const g0 = cursorGeometry(tab);
    if (g0) {
      const now = performance.now(), pr = tab.fxPred, c0 = stableCaret(tab);
      const cells = [...data].reduce((n, c) => n + (/[\u1100-\u115f\u2e80-\u303e\u3041-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(c) ? 2 : 1), 0);
      const edge = g0.left + (tab.term.cols - 1 - c0.x) * g0.cw; // the last column
      let left = g0.left;
      // keys arrive faster than the echo (a held key, a slow session): carry on from the previous key's cell; if the
      // box moved a row meanwhile, the column still holds. Not when the caret has moved since and is far behind that
      // cell: a long prompt wrapped onto a new line, the caret went back to its start. (A caret that has not moved
      // since says nothing: falling back to it sent the effects of a held key back to where it went down, again and
      // again.) A cell past the last column goes on at the start of the next line, which takes the same row.
      if (pr && !pr.del && now - pr.t < 1500 && pr.left > left && !((tab.caretAt || 0) > pr.t && pr.left - left >= 24 * g0.cw)) {
        left = pr.left;
        if (left + (cells - 1) * g0.cw > edge + 0.5) left = g0.left + (rowStart(tab, c0.y) - c0.x) * g0.cw;
      }
      pre = { left, top: g0.top, cells };
      tab.fxPred = { left: left + cells * g0.cw, top: g0.top, t: now };
    }
  } else if (/^[]+$/.test(data)) {
    // Backspace: the cell before the caret goes. Held down, the keys come faster than an agent redraws (a long
    // session redraws slowly), so each one steps a cell left of the previous one instead of waiting for the screen.
    if (tab.agent) settleCaret(tab);
    const g0 = cursorGeometry(tab), c0 = stableCaret(tab);
    if (g0) {
      const now = performance.now(), pr = tab.fxPred, b = tab.term.buffer.active, line = b.getLine(b.viewportY + c0.y);
      // (not when the caret has moved since and is far ahead of that cell: deleting back across a wrapped line brought
      // the previous line onto the caret's row, its end far to the right; nor into the prompt mark before the text)
      let col = pr && pr.del && now - pr.t < 1500 && pr.col < c0.x && !((tab.caretAt || 0) > pr.t && c0.x - pr.col >= 24) ? pr.col : c0.x;
      const start = tab.agent ? Math.min(c0.x, rowStart(tab, c0.y)) : 0;
      if (col <= start && c0.x > col) col = c0.x;
      for (let i = 0; i < data.length && col > start; i++) {
        col--;
        const cell = line && line.getCell(col);
        if (cell && cell.getWidth() === 0 && col > 0) col--; // the second half of a wide character
      }
      const cell = line && line.getCell(col), w = cell && cell.getWidth() === 2 ? 2 : 1;
      const left = g0.left - (c0.x - col) * g0.cw;
      pre = { left, top: g0.top, w };
      tab.fxPred = { del: true, col, left, top: g0.top, t: now };
    }
  } else if (data === '\r') {
    // Enter: the submit flourish plays on what was submitted, the text on the caret's row up to the caret
    const g0 = cursorGeometry(tab), c0 = stableCaret(tab);
    if (g0) {
      const b = tab.term.buffer.active, row = b.getLine(b.viewportY + c0.y), full = row ? row.translateToString(false, 0, c0.x) : '';
      let start = full.search(/\S/);
      if (start < 0) start = c0.x;
      const lead = /^(?:[❯›>$#%]\s+|PS [^>]*>\s?|[A-Za-z]:\\[^>]*>)/.exec(full.slice(start)); // an agent's or a shell's prompt mark is not what was sent
      if (lead) start += lead[0].length;
      const text = full.slice(start).trimEnd();
      pre = { left: g0.left, top: g0.top };
      line = { text, left: g0.left - (c0.x - start) * g0.cw, top: g0.top, cols: Math.max(0, c0.x - start) };
    }
    tab.fxPred = null;
  } else tab.fxPred = null;
  setTimeout(() => {
    const geo = cursorGeometry(tab);
    if (!geo) return;
    // the caret is ahead of text not echoed yet (a Korean syllable committed a moment ago in a slow session): the
    // composing one is drawn there (placeAt), so its 자모 burst from there too, not from the last echoed character
    if (!pre) geo.left += aheadCells(tab) * geo.cw;
    // while composing, the character being built is drawn at the cursor: burst from just after it
    const comp = tab.host.querySelector('.composition-view.active');
    if (comp && comp.textContent) geo.left += comp.getBoundingClientRect().width - geo.cw;
    let bx = geo.left + geo.cw / 2, by = geo.top + geo.ch / 2;
    if (pre && data !== '\r') { bx = pre.left + ((pre.w ? 0 : pre.cells) + 0.5) * geo.cw; by = pre.top + geo.ch / 2; } // the noted cell, not a cursor still catching up
    stageFx().burst(kind, bx, by, { enter: data === '\r', submit: data === '\r', k: S.settings.typingFxIntensity, cw: geo.cw, ch: geo.ch, text: data, pre, line });
  }, kind === 'movable' || pre ? 0 : 60); // the type comes down as the character appears
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
  const later = (ms, f) => setTimeout(() => { f(); fx.kick(); }, ms); // what arrives late wakes the loop itself
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
  const el = h('div', `done-text no-i18n dt-${style} dt-${st.doneTextPos || 'center'}`); // no-i18n: already translated above, the page translator must not redo it letter by letter
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
  const onScreen = (tab.host.classList.contains('active') || tab.host.classList.contains('tiled')) && !document.hidden;
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

document.addEventListener('visibilitychange', () => { // back from minimised / covered: what finished meanwhile celebrates now
  if (document.hidden) return;
  for (const tab of S.tabs) if (tab.pendingCelebrate && tab.host && (tab.host.classList.contains('active') || tab.host.classList.contains('tiled'))) setTimeout(() => celebrate(tab), 250);
});

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
  ['comet', '혜성', '빛나는 머리 뒤로 꼬리가 흐름 · 지나온 쪽으로 길게 늘어남'],
  ['pulse', '펄스', '숨쉬듯 밝아졌다 어두워짐'],
  ['rainbow', '무지개', '색이 계속 바뀌는 막대'],
  ['ghost', '잔상', '지나간 자리마다 빛의 잔상이 남아 번지며 사라짐'],
  ['crosshair', '십자선', '커서 위치에 가로·세로 가이드 선'],
  ['spotlight', '스포트라이트', '커서 주변만 은은하게 밝게'],
  ['jelly', '젤리', '움직일 때 말랑하게 출렁이는 블록'],
  ['flame', '불꽃', '파란 불씨 위로 날름대는 불꽃 · 가끔 사그라들었다 확 타오름'],
  ['glitch', '글리치', 'RGB 조각으로 찢어지며 지직 · 가끔 줄 전체가 어긋남'],
  ['orbit', '위성', '기울어진 궤도로 막대를 도는 인공위성 · 타자 치면 신호가 퍼짐'],
  ['heart', '하트', '두근두근 뛰는 하트 · 박동마다 물결이 퍼짐'],
  ['pixel', '픽셀', '체크무늬 8비트 블록'],
  ['ibeam', 'I-빔', '위아래 세리프가 있는 텍스트 커서'],
  ['saber', '광선검', '웅웅 울리는 빛의 칼날 · 타자 치면 번쩍 타오름'],
  ['candle', '촛불', '작은 초 위에서 일렁이는 불꽃 · 주변 줄을 따뜻하게 비춤'],
  ['brush', '붓', '먹을 머금은 대나무 붓'],
  ['halo', '후광', '금빛 고리와 작은 날개를 단 빛기둥 · 화면 위에서 빛이 내려옴'],
  ['hellfire', '지옥불', '검붉은 불길에 휩싸인 막대'],
  ['blood', '핏방울', '흘러내린 피가 방울져 뚝 떨어짐'],
  ['lighthouse', '등대', '파도 위 등대 · 도는 불빛이 터미널을 가로질러 훑고 지나감'],
  ['radar', '레이더', '커서를 중심으로 레이더 화면이 펼쳐져 빛줄기가 돌고 신호가 깜빡'],
  ['compass', '나침반', '파르르 떨며 북쪽을 가리키는 바늘 · 타자 치면 휙 돌았다 흔들리며 멈춤'],
  ['tornado', '회오리', '먹구름에서 내려온 회오리 · 돌풍이 커서 주위를 휘감아 돎'],
  ['jellyfish', '해파리', '갓을 오므렸다 펴며 둥실 떠오르는 빛나는 해파리'],
  ['equalizer', '이퀄라이저', '음악에 맞춰 춤추는 막대 세 개'],
  ['hologram', '홀로그램', '작은 영사기가 띄운 반투명 블록 · 주사선이 흐르고 가끔 지직 흔들림'],
  ['cat', '고양이', '치즈 고양이 얼굴 · 눈을 깜빡이고 귀를 쫑긋, 타자 치면 폴짝'],
  ['gem', '보석', '천천히 돌며 면마다 빛을 받는 보석 · 타자 치면 통 튀어 돌며 반짝'],
  ['wand', '마법봉', '별이 반짝이는 요술 지팡이 · 타자 치면 반짝이가 흩날림'],
  ['hourglass', '모래시계', '모래가 사르르 흘러내리면 통 뒤집히는 모래시계 · 타자 치면 흔들흔들'],
  ['eye', '눈알', '흘끔거리다 가늘게 뜨고 깜빡이는 눈 · 타자 치면 눈을 크게 뜨고 글자를 봄'],
  ['planet', '행성', '폭풍이 도는 고리 행성 · 작은 달이 커서 둘레를 공전, 타자 치면 기우뚱'],
  ['rocket', '로켓', '발사대에서 불꽃을 깜빡이며 대기 · 타자 치면 떠올라 불을 뿜음'],
  ['drip', '용암 방울', '굳은 껍질 속 용암이 방울져 아랫줄로 뚝 · 떨어진 자리에서 식어 검게 굳음'],
  ['firefly', '반딧불 커서', '반딧불이 막대 주위를 8자로 맴돎 · 주변에 반딧불이 깜빡이며 떠다님'],
  ['plasma', '플라즈마', '전극 사이 보랏빛 플라즈마 · 불규칙하게 아크가 튀고 가끔 옆 칸까지 뻗음'],
  ['meteor', '운석', '불길에 휩싸여 구르는 운석 · 타자 치면 불똥이 튐 (멋있는)'],
  ['sakura', '벚꽃', '천천히 도는 다섯 잎 벚꽃 · 꽃잎이 흩날림 (이쁜)'],
  ['moon', '초승달', '초승달 옆에 작은 별이 반짝 · 은은한 달무리 (이쁜)'],
  ['chick', '병아리', '뒤뚱뒤뚱 걷다 콕콕 쪼는 병아리 · 타자 치면 폴짝 날갯짓 (재미있는)'],
  ['slime', '슬라임', '눈 달린 초록 슬라임이 말랑말랑 통통 · 타자 치면 납작 (재미있는)'],
  ['ecg', '심전도', '심박 모니터의 펜 · 그래프가 줄을 따라 흘러감'],
  ['clock', '미니 시계', '지금 시각을 가리키는 자명종 · 초침이 째깍, 타자 치면 따르릉'],
  ['bubble', '비눗방울', '무지갯빛 비눗방울이 몽글몽글 흔들림 · 작은 방울이 피어올라 톡 터짐'],
];
// cursors that already animate on their own: no extra blink
const SELF_ANIMATED_CURSORS = ['comet', 'brush', 'halo', 'hellfire', 'blood', 'lighthouse', 'radar', 'compass', 'tornado', 'jellyfish', 'pulse', 'rainbow', 'flame', 'glitch', 'orbit', 'heart', 'spotlight', 'crosshair', 'saber', 'candle', 'equalizer', 'hologram', 'gem', 'wand', 'hourglass', 'cat', 'eye', 'planet', 'rocket', 'drip', 'firefly', 'plasma', 'meteor', 'sakura', 'moon', 'chick', 'slime', 'ecg', 'clock', 'bubble', 'ghost'];
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
/*
 * Nobody watches an idle screen. After 30 s without a key, the mouse or terminal output, animated cursors hold
 * still (body.idle, see cursors.css): a running CSS animation makes the compositor draw every refresh, which on a
 * 144 Hz display is a quarter of a CPU core in the GPU process for a cursor.
 */
let lastActive = Date.now();
const wakeUp = () => { lastActive = Date.now(); if (document.body.classList.contains('idle')) document.body.classList.remove('idle'); };
for (const ev of ['keydown', 'mousemove', 'mousedown', 'wheel']) window.addEventListener(ev, wakeUp, { capture: true, passive: true });
setInterval(() => {
  const out = S.tabs.reduce((m, t) => Math.max(m, t.lastOut || 0), 0);
  document.body.classList.toggle('idle', Date.now() - Math.max(lastActive, out) > 30000);
}, 5000);

/** Cursors drawn as inline SVG (fx/cursor-art.js) get their markup once per kind. */
function cursorArt(el, kind) {
  if (el.dataset.art === kind) return;
  el.dataset.art = kind;
  el.innerHTML = (window.CURSOR_ART && window.CURSOR_ART[kind]) || '';
}
const CURSOR_REDRAW_MS = 400; // longer than any redraw, short enough that a cursor an app really hides goes at once
let cursorHideTimer = 0, cursorAheadTimer = 0;
/*
 * How far the pane reaches round the caret, for cursors that spread out over the terminal (fx/cursor-wide.css):
 * --pl / --pr / --pt / --pb are px from the caret cell's top left corner to the pane's left, right, top and bottom
 * edge. The stage clips a pane shown alone; in a split view the cursor is clipped to its own pane (inside the tile's
 * border and round corners), so 십자선's lines or a pool of light never spill over the neighbours.
 */
let cursorPane = '';
function paneReach(t, geo) {
  const sr = $('#stage').getBoundingClientRect();
  const tiled = t.host.classList.contains('tiled');
  const r = tiled ? t.host.getBoundingClientRect() : sr;
  const b = tiled ? 1 : 0;
  const x = sr.left + geo.left, y = sr.top + geo.top;
  const top = tiled ? t.host.querySelector('.term-body').getBoundingClientRect().top : r.top + b; // below the tile's title bar
  const d = [x - r.left - b, r.right - b - x, y - top, r.bottom - b - y].map((v) => +v.toFixed(1));
  const key = d.join(' ') + (tiled ? ' tiled' : '');
  if (key === cursorPane) return;
  cursorPane = key;
  const [pl, pr, pt, pb] = d, s = cursorEl.style;
  s.setProperty('--pl', `${pl}px`);
  s.setProperty('--pr', `${pr}px`);
  s.setProperty('--pt', `${pt}px`);
  s.setProperty('--pb', `${pb}px`);
  s.clipPath = tiled ? `inset(${(r.top + b - y).toFixed(1)}px ${(geo.cw - pr).toFixed(1)}px ${(geo.ch - pb).toFixed(1)}px ${-pl}px round 9px)` : '';
}
function updateCursor() {
  composerHint();
  if (!cursorEl) { cursorEl = h('div', 'mt-cursor off'); $('#stage').appendChild(cursorEl); }
  // hidden = invisible and held still, not display:none: shown again, the cursor's animations go on where they were
  const off = () => { cursorEl.classList.add('off'); };
  const kind = S.settings.cursorStyle;
  const t = activeTab();
  if (NATIVE_CURSORS[kind] || !t || !t.alive || S.overlay) { off(); return; }
  let hidden = false;
  try { hidden = !!t.term._core.coreService.isCursorHidden; } catch { /* ignore */ }
  if (hidden && t.agent) hidden = false; // Claude Code / Codex always have an input caret (settleCaret finds the one they draw)
  if (hidden) {
    // Claude Code (like most full-screen apps) hides the cursor while it redraws and shows it again at the input.
    // In a long session a redraw can take tens of ms and comes many times a second (spinner, agent timers): copying
    // every one of those moments made the cursor flicker. Only a cursor kept hidden longer than a redraw is hidden.
    const since = performance.now() - (t.curShownAt || 0);
    if (since < CURSOR_REDRAW_MS) { hidden = false; clearTimeout(cursorHideTimer); cursorHideTimer = setTimeout(scheduleCursor, CURSOR_REDRAW_MS - since + 20); }
  }
  const b = t.term.buffer.active;
  if (hidden || b.viewportY !== b.baseY) { off(); return; } // app hides it / scrolled back
  const geo = cursorGeometry(t);
  if (!geo) { off(); return; }
  // Typed text the agent has not echoed yet (a long session can take 100–200 ms): the cursor stays ahead of it
  // instead of falling back onto the last character and jumping forward again on every key or syllable.
  const ah = t.ahead, c0 = stableCaret(t);
  if (ah && (performance.now() - ah.t > 700 || !aheadHolds(ah, c0, t.term.cols))) t.ahead = null;
  else if (ah) { ah.seen = c0.x; geo.left += (ah.base + ah.cells - c0.x) * geo.cw; clearTimeout(cursorAheadTimer); cursorAheadTimer = setTimeout(scheduleCursor, 720); }
  // Korean / CJK input: the character being composed is drawn at the cursor but not committed yet,
  // so the buffer cursor hasn't advanced. Put our cursor after the composing text.
  const comp = t.host.querySelector('.composition-view.active');
  if (comp && comp.textContent) geo.left += comp.getBoundingClientRect().width;
  const focused = !!(document.activeElement && t.host.contains(document.activeElement)) && S.winFocused;
  const blink = S.settings.cursorBlink && !SELF_ANIMATED_CURSORS.includes(kind);
  cursorEl.className = `mt-cursor kind-${kind}${focused ? '' : ' blurred'}${blink ? ' blink' : ''}${cursorEl.classList.contains('moving') ? ' moving' : ''}`;
  cursorArt(cursorEl, kind);
  cursorEl.style.width = `${geo.cw}px`;
  cursorEl.style.height = `${geo.ch}px`;
  paneReach(t, geo);
  const pos = `translate(${geo.left.toFixed(1)}px, ${geo.top.toFixed(1)}px)`;
  if (pos !== cursorLast) {
    cursorLast = pos;
    cursorEl.style.transform = pos;
    for (const f of window.CURSOR_MOVE || []) f(cursorEl, geo.left, geo.top); // cursors that react to each move (잔상's afterimages)
    cursorEl.classList.add('moving');
    clearTimeout(cursorMoveTimer);
    cursorMoveTimer = setTimeout(() => cursorEl.classList.remove('moving'), 260);
  }
}

/*
 * 프롬프트 작성기, found where people type: while the agent waits for input, a faint "Ctrl+Shift+E 작성기" at the right
 * end of its input row (it steps aside once the typed text comes close), and the status bar button lights up the
 * first time a prompt grows a second line (once per session, a small bubble says what it is for).
 */
const COMPOSER_KEY = IS_MAC ? '⌘⇧E' : 'Ctrl+Shift+E';
$('#st-composer .stc-key').textContent = IS_MAC ? '⌘⇧E' : 'Ctrl⇧E';
let composerHintEl = null;
function composerHint() {
  if (!composerHintEl) {
    composerHintEl = h('button', 'composer-cue', `<span class="ch-key no-i18n">${COMPOSER_KEY}</span><span>작성기</span>`);
    composerHintEl.title = '프롬프트 작성기 열기';
    composerHintEl.addEventListener('mousedown', (e) => e.preventDefault()); // keep the terminal's focus
    composerHintEl.addEventListener('click', () => openComposer());
    $('#stage').appendChild(composerHintEl);
  }
  const t = activeTab();
  const hide = () => composerHintEl.classList.remove('show');
  if (!t || !t.agent || !t.alive || S.overlay || (S.progress && S.progress.open) || !['ready', 'done'].includes(t.status)) return hide();
  const b = t.term.buffer.active;
  if (b.viewportY !== b.baseY) return hide();
  const screen = t.host.querySelector('.xterm-screen');
  const geo = cursorGeometry(t);
  if (!screen || !geo) return hide();
  const c = stableCaret(t);
  const room = t.term.cols - c.x; // cells left of the typed text on the input row
  if (room < 30 || c.y >= t.term.rows) return hide();
  const sr = $('#stage').getBoundingClientRect();
  const r = screen.getBoundingClientRect();
  const s = composerHintEl.style;
  s.height = `${geo.ch}px`;
  s.fontSize = `${Math.max(10, Math.min(12, geo.ch * 0.62)).toFixed(1)}px`;
  s.transform = `translate(${(r.right - sr.left - 10).toFixed(1)}px, ${geo.top.toFixed(1)}px) translateX(-100%)`;
  composerHintEl.classList.add('show');
}
let composerNudged = false;
function nudgeComposer() {
  const btn = $('#st-composer');
  btn.classList.remove('nudge');
  void btn.offsetWidth; // restart the glow
  btn.classList.add('nudge');
  if (composerNudged) return;
  composerNudged = true;
  const tip = h('div', 'composer-tip', `<b>긴 프롬프트는 작성기에서 편하게</b><span class="no-i18n">${COMPOSER_KEY}</span>`);
  document.body.appendChild(tip);
  const r = btn.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8))}px`;
  tip.style.top = `${r.top - tip.offsetHeight - 10}px`;
  tip.addEventListener('click', () => { tip.remove(); openComposer(); });
  setTimeout(() => tip.classList.add('out'), 4200);
  setTimeout(() => tip.remove(), 4600);
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
      bg.storm = { next: bg.t + 90 + R() * 150, flash: -999, bolt: null }; // counted from now: a resize reseeds, and must not strike
    } else if (k === 'rain') bg.items = Array.from({ length: Math.round(22 * area) }, () => ({ x: R() * w, y: R() * h, v: 4 + R() * 5, l: 8 + R() * 14 }));
    else if (k === 'fireflies') bg.items = Array.from({ length: Math.round(9 * area) + 6 }, () => ({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.3, vy: (R() - 0.5) * 0.3, ph: R() * 6, sp: 0.02 + R() * 0.03, r: 1.2 + R() * 1.6 }));
    else if (k === 'bokeh') bg.items = Array.from({ length: Math.round(3 * area) + 6 }, () => ({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.12, vy: -0.05 - R() * 0.12, r: 18 + R() * 46, c: (R() * 3) | 0, a: 0.05 + R() * 0.09, ph: R() * 6 }));
    else if (k === 'warp') bg.items = Array.from({ length: 160 }, () => ({ x: (R() - 0.5) * 2, y: (R() - 0.5) * 2, z: R(), pz: 0 }));
    else if (k === 'campfire') { bg.items = []; campfireVideo(); }
    else if (SCENE_BGS.includes(k)) { bg.items = []; bg.eyes = []; bg.ghost = null; bg.flick = 0; bg.scene = null; bg.st = null; bg.petals = []; }
    else if (k === 'lanterns') bg.items = Array.from({ length: Math.min(26, Math.round(0.6 * area) + 10) }, () => { const z = 0.25 + R() * 0.75; return { z, x: R() * w, y: R() * h * 1.1, v: (0.1 + z * 0.32) * Math.max(0.5, sc), s: (5 + z * 13) * sc, ph: R() * 6, sw: R() * 6 }; }).sort((a, b) => a.z - b.z);
    else if (k === 'lavalamp') bg.items = Array.from({ length: 7 }, (_, i) => ({ x: (0.15 + R() * 0.7) * w, y: R() * h, r: (50 + R() * 70) * sc, vy: (R() < 0.5 ? -1 : 1) * (0.15 + R() * 0.25) * Math.max(0.4, sc), ph: R() * 6, c: i % 3 }));
    else if (k === 'balloonsky') bg.items = Array.from({ length: Math.round(2.6 * area) + 6 }, () => { const z = 0.25 + R() * 0.75; return { z, x: R() * w, y: R() * h * 1.1, v: (0.18 + z * 0.55) * Math.max(0.4, sc), r: (4 + z * 10) * sc, ph: R() * 6, c: (R() * BALLOON_COLS.length) | 0 }; }).sort((a, b) => a.z - b.z);
    else bg.items = [];
  };
  bg.set = (kind) => {
    bg.kind = kind || 'none';
    // 뇌우 draws its own light-mode colours (a lightning flash must stay a flash, not get inverted into a dark flicker)
    bg.canvas.classList.toggle('bg-own-light', ['thunder', 'balloonsky', 'campfire', 'lanterns', ...SCENE_BGS].includes(bg.kind) || !!(window.BG_OWN_LIGHT && window.BG_OWN_LIGHT.has(bg.kind)));
    bg.seed();
    cancelAnimationFrame(bg.raf);
    bg.raf = 0;
    if (bg.ctx.reset) bg.ctx.reset(); else bg.ctx.clearRect(0, 0, canvas.width, canvas.height); // nothing carries over from the previous background
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
  const ext = window.BG_EXT && window.BG_EXT[bg.kind]; // a background kept in its own module (scenes/)
  if (ext) { ext(bg, ctx, w, h, t); return; }
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
    case 'lanterns': { // 풍등: paper sky lanterns lit from inside, swaying up into the night, near ones big and bright
      const L = isLight();
      const spr = lanternSprite();
      for (const l of bg.items) {
        l.y -= l.v; l.sw += 0.008 + l.z * 0.006; l.ph += 0.12 + Math.random() * 0.08;
        if (l.y < -l.s * 4) { l.y = h + l.s * 3; l.x = Math.random() * w; }
        const x = l.x + Math.sin(l.sw) * (4 + l.z * 8);
        const tilt = Math.cos(l.sw) * 0.07;
        const fl = 0.86 + 0.1 * Math.sin(l.ph) + 0.04 * Math.sin(l.ph * 2.7); // candle flicker
        const fade = Math.max(0, Math.min(1, (l.y + l.s * 3) / (h * 0.3))); // dims as it drifts away at the top
        const a = fade * (0.35 + l.z * 0.65);
        // the warm halo
        ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
        const r = l.s * (3.2 + l.z * 1.6);
        const g = ctx.createRadialGradient(x, l.y + l.s * 0.3, 0, x, l.y + l.s * 0.3, r);
        g.addColorStop(0, 'rgba(255,170,80,' + (L ? 0.22 : 0.3) * fl * a + ')');
        g.addColorStop(0.4, 'rgba(255,130,50,' + (L ? 0.08 : 0.1) * fl * a + ')');
        g.addColorStop(1, 'rgba(255,110,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, l.y + l.s * 0.3 - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
        // the lantern
        const lw = l.s * 1.6, lh = lw * 1.3;
        ctx.save();
        ctx.translate(x, l.y); ctx.rotate(tilt);
        ctx.globalAlpha = a * (0.85 + 0.15 * fl);
        ctx.drawImage(spr, -lw / 2, -lh / 2, lw, lh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
    case 'campfire': { // 캠프파이어: footage of a fire by the tents (CC0), painted into soft flat tones and cut out — only the fire, its light and the camp's shapes are drawn, the theme's background stays
      const v = campfireVideo();
      if (!(v.readyState >= 2 && v.videoWidth)) break;
      const k = Math.max(w / v.videoWidth, h / v.videoHeight);
      const dw = v.videoWidth * k, dh = v.videoHeight * k, dx = (w - dw) * 0.4, dy = h - dh; // keep the fire (left of centre, low) in view
      ctx.drawImage(v, dx, dy, dw, dh);
      // sparks leaping up from the fire
      const L = isLight(), fx = dx + dw * 0.3, fy = dy + dh * 0.57;
      if (bg.items.length < Math.max(3, Math.min(24, Math.round(dh / 30))) && Math.random() < 0.3) {
        bg.items.push({ x: fx + (Math.random() - 0.5) * dh * 0.2, y: fy + (Math.random() - 0.3) * dh * 0.12, vx: (Math.random() - 0.35) * dh * 0.0014, vy: -(0.0022 + Math.random() * 0.004) * dh, life: 1, d: 0.006 + Math.random() * 0.012, r: dh * (0.0015 + Math.random() * 0.002), ph: Math.random() * 6 });
      }
      ctx.globalCompositeOperation = L ? 'source-over' : 'lighter';
      for (const sp of bg.items) {
        sp.ph += 0.2; sp.x += sp.vx + Math.sin(sp.ph) * dh * 0.0004; sp.y += sp.vy; sp.vy *= 0.992; sp.life -= sp.d;
        const al = Math.max(0, sp.life) * (0.6 + 0.4 * Math.sin(sp.ph * 2.3));
        ctx.fillStyle = L ? `rgba(226,96,24,${al * 0.9})` : `rgba(255,${Math.round(150 + 70 * sp.life)},${Math.round(60 + 60 * sp.life)},${al})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(0.5, sp.r * (0.6 + 0.4 * sp.life)), 0, Math.PI * 2); ctx.fill();
      }
      bg.items = bg.items.filter((sp) => sp.life > 0);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'haunted': drawHaunted(bg, ctx, w, h, t); break;
    case 'heaven': drawHeaven(bg, ctx, w, h, t); break;
    case 'castle': drawCastle(bg, ctx, w, h, t); break;
    case 'hell': drawHell(bg, ctx, w, h, t); break;
    case 'cyberpunk': drawCyber(bg, ctx, w, h, t); break;
    case 'korea': drawKorea(bg, ctx, w, h, t); break;
    case 'steampunk': drawSteampunk(bg, ctx, w, h, t); break;
    case 'analog': drawAnalog(bg, ctx, w, h, t); break;
    case 'backrooms': drawBackrooms(bg, ctx, w, h, t); break;
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

/* 풍등: one paper lantern, lit from the flame at its open bottom, drawn once and reused */
let LANTERN_SPRITE = null;
function lanternSprite() {
  if (LANTERN_SPRITE) return LANTERN_SPRITE;
  const W = 72, H = 94;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const top = 6, bot = H - 14, tw = W * 0.86, bw = W * 0.62;
  const body = () => {
    x.beginPath();
    x.moveTo(W / 2 - tw / 2, top + 6);
    x.quadraticCurveTo(W / 2, top - 4, W / 2 + tw / 2, top + 6); // a gently domed top
    x.bezierCurveTo(W / 2 + tw / 2 + 2, top + (bot - top) * 0.45, W / 2 + bw / 2 + 3, bot - 10, W / 2 + bw / 2, bot);
    x.lineTo(W / 2 - bw / 2, bot);
    x.bezierCurveTo(W / 2 - bw / 2 - 3, bot - 10, W / 2 - tw / 2 - 2, top + (bot - top) * 0.45, W / 2 - tw / 2, top + 6);
    x.closePath();
  };
  // paper glowing from the flame below: brightest low and in the middle, deeper orange at the edges
  body();
  const g = x.createRadialGradient(W / 2, bot - 6, 2, W / 2, bot - 18, H * 0.85);
  g.addColorStop(0, '#fff6d6'); g.addColorStop(0.28, '#ffd27a'); g.addColorStop(0.62, '#f59a3c'); g.addColorStop(1, '#c2541f');
  x.fillStyle = g; x.fill();
  // seams of the paper panels
  x.save(); body(); x.clip();
  x.strokeStyle = 'rgba(150,60,15,0.32)'; x.lineWidth = 1.2;
  for (const k of [-0.6, -0.2, 0.2, 0.6]) {
    x.beginPath(); x.moveTo(W / 2 + k * tw / 2, top); x.quadraticCurveTo(W / 2 + k * tw / 2 * 1.04, (top + bot) / 2, W / 2 + k * bw / 2, bot); x.stroke();
  }
  // a softer sheen on one side, a darker top band
  const sh = x.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(120,40,10,0.28)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.75, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(120,40,10,0.32)');
  x.fillStyle = sh; x.fillRect(0, 0, W, H);
  const tb = x.createLinearGradient(0, top, 0, top + 16);
  tb.addColorStop(0, 'rgba(110,40,15,0.45)'); tb.addColorStop(1, 'rgba(110,40,15,0)');
  x.fillStyle = tb; x.fillRect(0, 0, W, top + 16);
  x.restore();
  // the rim at the bottom and the flame inside it
  x.fillStyle = '#7a3412';
  x.beginPath(); x.ellipse(W / 2, bot, bw / 2, 3.2, 0, 0, Math.PI * 2); x.fill();
  const fg = x.createRadialGradient(W / 2, bot + 1, 0, W / 2, bot + 1, 9);
  fg.addColorStop(0, 'rgba(255,255,235,1)'); fg.addColorStop(0.4, 'rgba(255,210,110,0.9)'); fg.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = fg; x.beginPath(); x.ellipse(W / 2, bot + 1, 9, 6, 0, 0, Math.PI * 2); x.fill();
  LANTERN_SPRITE = c;
  return c;
}

/* 캠프파이어: one looping, muted video (VP9 with an alpha channel) shared by the background and its picker previews.
   It plays only while something is drawing it: a watchdog pauses it a moment after the last draw (the dropdown
   closed, another background picked, the window hidden), and a file that fails to load is tried again now and
   then, never on every frame. */
let CAMPFIRE_VIDEO = null;
function campfireVideo() {
  let v = CAMPFIRE_VIDEO;
  const now = performance.now();
  if (!v) {
    v = CAMPFIRE_VIDEO = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.cfRetry = 0; // no play() before this time
    v.cfWatch = 0; // the watchdog's timer while it is playing
    v.addEventListener('error', () => { v.cfRetry = performance.now() + 15000; });
    v.src = 'ambient/campfire.webm';
  }
  v.cfUsed = now;
  if (v.paused && now >= v.cfRetry && !document.hidden) {
    v.cfRetry = now + 1000;
    if (v.error) v.load();
    v.play().catch(() => {});
  }
  if (!v.cfWatch) {
    v.cfWatch = setInterval(() => {
      if (!document.hidden && performance.now() - v.cfUsed < 1200) return;
      v.pause(); clearInterval(v.cfWatch); v.cfWatch = 0;
    }, 400);
  }
  return v;
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
// every background has its own loop (ambient/<background>.ogg); 뇌우 plays the rain and adds thunder on top
const BG_AMBIENT = new Proxy({}, { get: (_t, k) => (k === 'thunder' ? 'rain' : k === 'none' ? '' : k) });
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
  const keep = (name) => name === want || (want === 'rain' && S.settings.bgAnim === 'thunder' && name.startsWith('thunder'));
  for (const name of [...AMB.buffers.keys()]) if (!keep(name)) AMB.buffers.delete(name); // a decoded loop is about 15 MB: keep only what is playing
  if (!want) return;
  const buf = await ambBuffer(want);
  if (!buf) { if (AMB.cur === want) AMB.cur = ''; return; } // could not load: try again next time
  if (AMB.want !== want || AMB.cur !== want || AMB.voice) return; // changed again while loading
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
/**
 * Little sounds that follow what a background does: the logo bonking a wall, a pong rally, a shooting star.
 * Synthesised on the spot, at the background-music volume, kept soft.
 */
function ambSfx(kind) {
  if (!AMB.ctx || !(ambVolume() > 0) || AMB.ctx.state !== 'running') return;
  const ctx = AMB.ctx;
  const t0 = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  out.connect(AMB.master);
  const tone = (type, f0, f1, dur, peak, at = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0 + at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g).connect(out);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.02);
  };
  if (kind === 'boing') { // a soft rubbery bonk, pitch falling
    const f = 420 + Math.random() * 160;
    tone('sine', f, f * 0.5, 0.22, 0.22);
    tone('triangle', f * 2, f, 0.12, 0.05);
  } else if (kind === 'corner') { // the corner! a little two-note chime
    tone('sine', 1047, 1047, 0.5, 0.16);
    tone('sine', 1568, 1568, 0.7, 0.14, 0.09);
    tone('triangle', 2093, 2093, 0.4, 0.04, 0.09);
  } else if (kind === 'paddle') { // retro pong blip
    tone('square', 494, 494, 0.07, 0.07);
  } else if (kind === 'wall') {
    tone('square', 247, 247, 0.06, 0.05);
  } else if (kind === 'meteor') { // a soft whoosh and a high glint
    const len = 0.9;
    let buf = ambSfx.whoosh;
    if (!buf || buf.sampleRate !== ctx.sampleRate) { // the same swell of noise every time: made once
      buf = ambSfx.whoosh = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length);
    }
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(2400, t0);
    bp.frequency.exponentialRampToValueAtTime(700, t0 + len);
    const g = ctx.createGain();
    g.gain.value = 0.09;
    n.connect(bp).connect(g).connect(out);
    n.start(t0);
    tone('sine', 2637, 2637, 0.6, 0.05, 0.05);
  }
  setTimeout(() => out.disconnect(), 2000);
}

/** 뇌우: a distant roll a moment after the flash (light travels faster than sound). */
async function ambThunder() {
  if (AMB.cur !== 'rain' || S.settings.bgAnim !== 'thunder' || !AMB.ctx) return;
  const nowMs = performance.now();
  if (nowMs - (AMB.thunderAt || 0) < 3000) return; // never a pile of rolls on top of each other
  AMB.thunderAt = nowMs;
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
const LIGHT_LEVEL_FLOOR = { backrooms: 0.9 }; // see updateBgAnim: scenes that must stay dark on a light page
function updateBgAnim() {
  const kind = S.settings.bgAnim || 'none';
  const stageEl = $('#stage');
  if (!BG) {
    if (kind === 'none') return;
    const canvas = h('canvas', 'bg-layer');
    stageEl.insertBefore(canvas, stageEl.firstChild);
    BG = createBg(canvas);
    new ResizeObserver(() => BG.size(stageEl.clientWidth, stageEl.clientHeight)).observe(stageEl);
    onDprChange(() => BG.size(stageEl.clientWidth, stageEl.clientHeight));
    BG.size(stageEl.clientWidth, stageEl.clientHeight);
  }
  // a scene whose horror lives in its dark: on a light page the background's strength (a faint 60% by default) washed
  // its dark rooms into grey — there the strength has a floor, so the dark stays dark
  const level = Math.max(0.15, Math.min(1, Number(S.settings.bgAnimLevel) || 0.6));
  BG.canvas.style.opacity = String(isLight() && LIGHT_LEVEL_FLOOR[kind] ? Math.max(level, LIGHT_LEVEL_FLOOR[kind]) : level);
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
  ['choir', '합창단', '글자=할렐루야 선율 (레·라·시·라) · Space=맑은 아 화음 · Enter=할렐루야 합창 (헨델 메시아)'],
  ['gross', '더러운 소리', '글자=뿡·뽀옹 (매번 다름) · Space=끄으억 트림 · ⌫=후루룩 · ⇧⏎=철퍽 · Enter=대폭발'],
  ['horror', '공포', '거꾸로 차오르는 피아노 · Space=심장 박동 · ⌫=쇠 긁는 소리 · ⇧⏎=귓가의 속삭임 · Enter=비명 현악'],
  ['gun', '총', '글자=탕! · Space=장전 (탄창 탁 + 슬라이드 철컥) · ⌫=탄피 떨어짐 · ⇧⏎=노리쇠 철컥 · Enter=샷건+펌프'],
  ['edm', 'EDM', '치는 대로 멜로딕 테크노 아르페지오 · 계속 치면 비트가 깔림 · Space=킥 · ⌫=테이프 스톱 · ⇧⏎=빌드업 · Enter=드롭!'],
  ['horse', '말 달리기', '글자=다그닥 말발굽 · Space=이럇! · ⌫=푸르륵 · ⇧⏎=워워~ · Enter=질주하다 히히히힝'],
  ['scream', '비명', '글자=꺅! · Space=으아악 · ⌫=헉(숨 들이킴) · ⇧⏎=히익! · Enter=복도에 울리는 긴 비명'],
  ['meow', '냥냥이', '칠 때마다 "야옹" · Space=그르릉 · ⌫=하악 · ⇧⏎="므릅?" · Enter=당당한 야~옹'],
  ['whale', '고래의 노래', '깊은 바다에 울리는 고래 울음 · Space=낮은 울음 · ⌫=딸깍 초음파 · Enter=소나 핑'],
  ['bottle', '유리병 피리', '병 입구에 입김을 부는 맑고 텅 빈 소리 · 오음계 멜로디'],
  ['pluck', '신스 플럭', '전자 현을 튕기는 소리'],
  ['bloop', '물속 블룹', '물속에서 울리는 둥근 블룹'],
  ['pingpong', '탁구 랠리', '글자=좌우로 오가는 똑딱 랠리 · Space=서브 전 공 튀기기 · ⌫=네트 · ⇧⏎=서브 · Enter=스매시! 공이 튀며 굴러감'],
  ['frog', '개구리 연못', '글자=개굴 · Space=청개구리 개굴개굴 · ⌫=퐁당 · ⇧⏎=귀뚜라미 · Enter=연못 전체가 개굴개굴'],
  ['duck', '삑삑이 오리', '글자=삑! · Space=꾸욱 쥐어짜기 · ⌫=바람 빠지는 소리 · ⇧⏎=삑삑 · Enter=삑삑이 팡파르'],
  ['kitchen', '주방', '글자=칼질 탁탁 · Space=기름 지글지글 · ⌫=냄비 뚜껑 · ⇧⏎=보글보글 · Enter=오븐 타이머 띵~'],
  ['farm', '농장 아침', '실제 녹음 · 글자=병아리 삐약 · Space=소 음매 · ⌫=거위 꽥 · ⇧⏎=양 매애 · Enter=닭 꼬끼오'],
  ['orch', '오케스트라 튜닝', '실제 녹음 · 글자=바이올린 피치카토 선율 · Space=첼로 · ⌫=스피카토 · ⇧⏎=튜닝 음 · Enter=오케스트라 한 방'],
  ['merchant', '마을 주민', '마인크래프트 주민 목소리 (PC에 설치된 마인크래프트 Java에서 불러옴, 없으면 비슷한 합성음) · 글자=흠 · Space=흥정 · ⌫=으응(아니) · ⇧⏎=흠!(좋아) · Enter=주민이 죽는 소리'],
];
/* Typing sounds made for MinsuTerm with Stable Audio 3 (samples-gen.js): until a theme's clips are decoded, a soft tick plays. */
SOUND_KINDS.push(
  ['slots', '슬롯머신', '글자=릴 딸깍 · Space=레버 당기기 · ⌫=칩 짤그락 · ⇧⏎=주사위 · Enter=잭팟!'],
  ['cartoon', '만화 효과음', '글자=뾱·띠용·뽁 (매번 다름) · Space=슬라이드 휘슬 · ⌫=빵빵 경적 · ⇧⏎=스프링 보잉 · Enter=와장창'],
  ['wizard', '마법 주문', '글자=반짝이는 마법 종 · Space=망토 휘익 · ⌫=주문 실패 퓨슉 · ⇧⏎=룬 웅웅 · Enter=주문 시전'],
  ['steamworks', '스팀펑크 공방', '글자=톱니 딸깍 · Space=증기 칙 · ⌫=래칫 드르륵 · ⇧⏎=밸브 끼익 · Enter=증기 기적 뿌우'],
  ['pirate', '해적선', '글자=갑판 삐걱 · Space=파도 철썩 · ⌫=앵무새 꽥 · ⇧⏎=닻 사슬 철컥 · Enter=대포 쾅 + 배 종'],
  ['dialup', '다이얼업 해커', '글자=데이터 삐리릭 · Space=모뎀 접속음 · ⌫=에러 부저 · ⇧⏎=접근 거부 삑삑 · Enter=접속 성공'],
  ['vending', '자판기', '글자=동전 짤랑 · Space=버튼 삑 · ⌫=동전 반환 와르르 · ⇧⏎=캔 덜컹 · Enter=캔 따는 소리 칙 쏴'],
  ['alien', '외계인 통신', '글자=외계 생명체 꾸륵 삐약 (매번 다름) · Space=UFO 웅웅 · ⌫=거꾸로 감기는 신호 · ⇧⏎=견인 광선 · Enter=모선 도착'],
  ['camera', '빈티지 카메라', '글자=셔터 찰칵 · Space=필름 감기 · ⌫=되감기 크랭크 · ⇧⏎=플래시 충전 위잉 · Enter=플래시 펑 + 즉석 사진'],
  ['paper', '종이 공작', '글자=종이 접기 사각 · Space=가위 싹둑 · ⌫=테이프 쭉 · ⇧⏎=책장 넘기기 · Enter=종이비행기 휘익'],
  ['basketball', '농구 코트', '글자=드리블 텅텅 · Space=그물 슉 · ⌫=림 맞고 텅 · ⇧⏎=호루라기 · Enter=버저비터 + 함성'],
  ['car', '자동차 실내', '글자=방향지시등 똑딱 · Space=안전벨트 찰칵 · ⌫=와이퍼 스윽 · ⇧⏎=경적 빵 · Enter=시동 부릉'],
);
const GEN_SOUNDS = new Set(['slots', 'cartoon', 'wizard', 'steamworks', 'pirate', 'holy', 'drums', 'choir', 'gun', 'meow', 'pingpong', 'frog', 'kitchen', 'dialup', 'vending', 'alien', 'camera', 'paper', 'basketball', 'car']);
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
/** Take a feedback loop apart once its tail has died away (a cycle of nodes keeps rendering until collected). */
function dropNodes(ms, ...nodes) {
  setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } } }, ms);
}

function reverseNoteBuffer(ctx, f, secs = 1.1) {
  const cache = reverseNoteBuffer.cache || (reverseNoteBuffer.cache = new Map()), key = `${Math.round(f * 10)}|${secs}|${ctx.sampleRate}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.size > 64) cache.clear();
  const sr = ctx.sampleRate;
  const n = Math.round(sr * secs);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const v = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.01 * t) + 0.25 * Math.sin(2 * Math.PI * f * 3.03 * t) + 0.12 * Math.sin(2 * Math.PI * f * 4.2 * t)) * Math.exp(-t * 3.2);
    d[n - 1 - i] = v * 0.45;
  }
  cache.set(key, buf);
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
    if (kind === 'edm' && window.EDM_SOUND) { window.EDM_SOUND.play(ctx, ctx.destination, key, { volume: Math.max(0, Math.min(1, Number(S.settings.typingVolume ?? 0.4))) }); return; } // EDM: its own engine, groove and mix (fx/edm-sound.js)
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
          dropNodes(12000 * stretch, efb, echo, edark, ewet, send);
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

    if (kind === 'drums' && !(window.SAMPLES && window.SAMPLES.drums)) { // the clips in samples-gen.js take over once they are there
      // 드럼 (acoustic kit): typing plays a groove around the kit (toms · ghost snares · hi-hats);
      // space = the bass drum, ⌫ = sticks clicked together, ⇧⏎ = a snare flam, ⏎ = a tom fill into kick + crash.
      // Everything is noise + skins (no oscillator "beeps"), and a small room glues the kit together.
      const room = ctx.createDelay(0.2); const rfb = ctx.createGain(); const rlp = ctx.createBiquadFilter();
      room.delayTime.value = 0.023; rfb.gain.value = 0.32; rlp.type = 'lowpass'; rlp.frequency.value = 3500;
      room.connect(rlp); rlp.connect(rfb); rfb.connect(room);
      const wet = ctx.createGain(); wet.gain.value = 0.35; rlp.connect(wet); wet.connect(out);
      dropNodes(6000, rfb, room, rlp, wet);
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
    if (GEN_SOUNDS.has(kind) && !(SB && Object.keys(SB).length)) { master.disconnect(); return playKeySound('soft', key, true); } // still decoding: a soft tick meanwhile
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
        case 'slots': case 'cartoon': case 'wizard': case 'steamworks': case 'pirate': // made for MinsuTerm (samples-gen.js) …
        case 'holy': case 'drums': case 'choir': case 'gun': case 'meow': case 'pingpong': case 'frog': case 'kitchen': case 'dialup': case 'vending': case 'alien': case 'camera': case 'paper': case 'basketball': case 'car': { // … and these, remade the same way
          const keys = ['k1', 'k2', 'k3', 'k4'].filter((n) => SB[n]);
          const loud = { slots: 0.62, cartoon: 0.55, wizard: 0.5, steamworks: 0.6, pirate: 0.6, holy: 0.5, choir: 0.5, gun: 0.62, drums: 0.8, meow: 0.6, pingpong: 0.62, frog: 0.6, duck: 0.6, kitchen: 0.6, dialup: 0.5, vending: 0.6, alien: 0.55, camera: 0.6, paper: 0.62, basketball: 0.6, car: 0.6 }[kind] ?? 0.6;
          const lv = (n) => loud * ((window.SAMPLE_GAINS && window.SAMPLE_GAINS[kind] && window.SAMPLE_GAINS[kind][n]) ?? 1); // each clip at about the same loudness
          if (key === 'key') {
            const n = any(keys);
            // chimes, organ and choir play a pentatonic tune; the others vary a little so no two keys sound the same;
            // the table-tennis ball crosses the table, left and right in turn
            const tune = { wizard: 0.8, holy: 0.75 }[kind];
            let dest = out;
            if (kind === 'pingpong') { playKeySound.pp = !playKeySound.pp; dest = ctx.createStereoPanner(); dest.pan.value = playKeySound.pp ? -0.6 : 0.6; dest.connect(out); }
            let rate = tune ? PENTA[(Math.random() * PENTA.length) | 0] * tune : r();
            if (kind === 'choir') { // each key the next note of the Hallelujah (레 라 시 라), sung as a soft chord
              const P = [1.335, 1, 1.122, 1];
              playKeySound.chs = ((playKeySound.chs ?? -1) + 1) % P.length;
              rate = P[playKeySound.chs];
            }
            done = sp(n, 0, { rate, gain: lv(n), dest });
          } else if (key === 'space') done = sp('space', 0, { gain: lv('space') * 0.9 });
          else if (key === 'back') done = sp('back', 0, { rate: r(), gain: lv('back') * 0.85 });
          else if (key === 'newline') done = sp('newline', 0, { gain: lv('newline') * 0.9 });
          else done = sp('enter', 0, { gain: lv('enter') });
          break;
        }
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
        case 'gross':
          if (key === 'key') done = sp(any(['f1', 'f2', 'f3', 'f4', 'f5']), 0, { rate: r(), gain: 0.7, dur: 0.6 });
          else if (key === 'space') done = sp('burp', 0, { gain: 0.38 }); // a burp is long and loud: keep it level with the toots
          else if (key === 'back') done = sp('slurp', 0, { gain: 0.7 });
          else if (key === 'newline') done = sp('squish', 0, { gain: 0.75 });
          else done = sp('flong', 0, { gain: 0.75 });
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
      if (key === 'key') {
        const f = 1480 + Math.random() * 460;
        squeak(0, f, 0.07 + Math.random() * 0.035, 0.4, { rise: 1.08 + Math.random() * 0.08, fall: 0.92 + Math.random() * 0.06 });
        nz('bandpass', 850, 1.1, 0.06, 0.035, 0); // the rubber squished
        if (Math.random() < 0.5) release(0.11 + Math.random() * 0.04, 0.12); // …and letting go
      }
      else if (key === 'space') { squeak(0, 1500, 0.26, 0.4, { rise: 1.05, fall: 1.18 }); release(0.32, 0.28); } // a full squeeze… and let go
      else if (key === 'back') release(0, 0.32);
      else if (key === 'newline') { squeak(0, 1600, 0.07, 0.4); squeak(0.11, 1800, 0.08, 0.4); }
      else { // 빰 빠빠 빰 빰 — (쉼) — 삑 삑!
        const N = [[0, 1568, 0.15], [0.21, 1175, 0.08], [0.31, 1175, 0.08], [0.42, 1319, 0.15], [0.63, 1175, 0.15], [0.98, 1480, 0.12], [1.15, 1568, 0.2]];
        N.forEach(([at, f, len]) => squeak(at, f, len, 0.4, { rise: 1.03, fall: 0.99 }));
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
      dropNodes(6000, fb, room, rlp);
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
        dropNodes(8000, fb, echo, lp);
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
    if (!S.settings.bgImage) { bgImgEl.hidden = true; return; } // switched off while it was loading
    bgImgEl.style.backgroundImage = `url("${data}")`;
    bgImgEl.dataset.loaded = '1';
  }
  bgImgEl.hidden = false;
  bgImgEl.style.setProperty('--dim', String(Math.max(0, Math.min(0.95, Number(S.settings.bgImageDim ?? 0.55)))));
  bgImgEl.style.setProperty('--blur', `${Math.max(0, Math.min(30, Number(S.settings.bgImageBlur) || 0))}px`);
}

/* ---------- dropdown pickers with previews ---------- */

/*
 * Previews hold still until they are pointed at. A list of forty live previews (and the one on every picker button,
 * even on a hidden settings tab) kept a slow laptop busy and made the settings window lag. Now each preview shows a
 * still frame that tells it apart, and moves only while the pointer is on its row or button, or the keyboard is on
 * it; with "reduce motion" it never moves. CSS animations inside a resting preview are held by .pv-rest (ui.css)
 * and parked on the moment PV_REST_MS after their start; what a preview drives itself (a canvas, a timer) it hands
 * over as el.pvShow() (on screen: draw the still), el.pvPlay() and el.pvRest().
 */
const PV_REST_MS = 1200;
const pvReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let pvSeen = null;
/** Park the CSS animations of a resting preview on its still frame; drop what a script animated in it. */
function pvPark(el) {
  if (el.classList.contains('pv-live')) return;
  for (const a of el.getAnimations({ subtree: true })) {
    if (a instanceof CSSAnimation) { if (Math.abs((a.currentTime || 0) - PV_REST_MS) > 1) a.currentTime = PV_REST_MS; }
    else if (!(a instanceof CSSTransition)) a.cancel();
  }
}
/** A preview came on screen (a list opened, a tab or section shown): its still. Hidden, it had no animations to park. */
function pvWake(el) {
  if (el.classList.contains('pv-live')) return;
  el.pvShow?.();
  pvPark(el);
}
/*
 * A still is drawn for the look and the settings of its moment. When they change with the window open (typing effect
 * strength, theme, accent, light / dark from the app or the OS), the stills on screen are drawn again once the
 * change settles; the others catch up when they come on screen (pvWake). Nothing runs while nothing changes.
 */
const pvInView = new Set();
let pvRefreshT = 0;
function pvRefreshSoon() {
  if (!pvInView.size) return;
  clearTimeout(pvRefreshT);
  pvRefreshT = setTimeout(() => {
    pvRefreshT = 0;
    for (const el of pvInView) if (el.isConnected) pvWake(el); else pvInView.delete(el);
  }, 250);
}
/** A preview was just built in el: hold it still (or let it move if it is pointed at right now). */
function pvReady(el) {
  const live = el.classList.contains('pv-live');
  el.classList.toggle('pv-rest', !live);
  if (live) el.pvPlay?.(); else pvPark(el);
  if (!pvSeen) {
    pvSeen = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) { pvInView.delete(e.target); continue; }
        pvInView.add(e.target);
        pvWake(e.target);
      }
    });
    // theme, accent and light / dark all end up on the root element (applyAppearance)
    new MutationObserver(pvRefreshSoon).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  }
  pvSeen.unobserve(el); // observed afresh it is reported at once: a preview rebuilt in a box already on screen gets its still
  pvSeen.observe(el);
}
function pvForget(el) {
  pvSeen?.unobserve(el);
  pvInView.delete(el);
}
function pvLive(el, on) {
  on = !!on && !pvReduced.matches;
  if (el.classList.contains('pv-live') === on) return;
  el.classList.toggle('pv-live', on);
  el.classList.toggle('pv-rest', !on);
  if (on) el.pvPlay?.();
  else { el.pvRest?.(); pvPark(el); }
}
/** The preview el moves while target (its row or button) is pointed at, or has the keyboard's focus. */
function pvHover(target, el) {
  const upd = () => pvLive(el, target.pvPointed || target.matches(':focus-visible, :has(:focus-visible)'));
  target.addEventListener('pointerenter', () => { target.pvPointed = true; upd(); });
  target.addEventListener('pointerleave', () => { target.pvPointed = false; upd(); });
  target.addEventListener('focusin', upd);
  target.addEventListener('focusout', () => queueMicrotask(upd));
}

/*
 * Stills of canvas previews, kept for the session: a list opened again shows them at once. Rendering one runs the
 * scene or effect for a moment in one go, so they are made a few per frame, in the order they come on screen.
 */
const pvStills = new Map();
const pvJobs = [];
let pvPump = 0;
function pvDrain() {
  pvPump = 0;
  const t0 = performance.now();
  while (pvJobs.length && performance.now() - t0 < 12) { try { pvJobs.shift()(); } catch (e) { console.error(e); } }
  if (pvJobs.length) pvPump = requestAnimationFrame(pvDrain);
}
const pvLook = () => `${isLight() ? 'L' : 'D'}|${S.settings.theme}|${S.settings.themeLight}|${S.settings.accent}|${window.devicePixelRatio || 1}`;
function pvPaint(canvas, img) {
  if (canvas.width !== img.width || canvas.height !== img.height) { canvas.width = img.width; canvas.height = img.height; }
  canvas.className = img.pvClass;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.clearRect(0, 0, img.width, img.height);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
/**
 * Show the still of the canvas preview in el: from the cache, or rendered by render() into the canvas (false: nothing
 * to show yet, not kept; 'more': not done, go on in a later frame). key names what is drawn; size and look (theme,
 * accent, light / dark) are added here.
 */
function pvStill(el, canvas, key, render) {
  const k = `${key}|${el.clientWidth}x${el.clientHeight}|${pvLook()}`;
  if (canvas.pvShown === k || canvas.pvQueued === k) return;
  const hit = pvStills.get(k);
  if (hit) { pvPaint(canvas, hit); canvas.pvShown = k; return; }
  canvas.pvQueued = k;
  const job = () => {
    canvas.pvQueued = '';
    if (!canvas.isConnected || el.classList.contains('pv-live')) return;
    const again = pvStills.get(k);
    if (again) { pvPaint(canvas, again); canvas.pvShown = k; return; }
    const r = render();
    if (r === false) return;
    if (r === 'more') { canvas.pvQueued = k; pvJobs.push(job); return; }
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    c.pvClass = canvas.className;
    if (pvStills.size > 300) pvStills.delete(pvStills.keys().next().value);
    pvStills.set(k, c);
    canvas.pvShown = k;
  };
  pvJobs.push(job);
  if (!pvPump) pvPump = requestAnimationFrame(pvDrain);
}
let pvInkCv = null;
/** How much is drawn on a canvas (its summed alpha, sampled): picks the frame of an effect that shows the most of it. */
function pvInk(canvas) {
  const w = canvas.width, h = canvas.height;
  if (!pvInkCv) pvInkCv = document.createElement('canvas');
  if (pvInkCv.width !== w || pvInkCv.height !== h) { pvInkCv.width = w; pvInkCv.height = h; }
  const c = pvInkCv.getContext('2d', { willReadFrequently: true }); // read here, so the preview's own canvas stays on the GPU
  c.clearRect(0, 0, w, h);
  c.drawImage(canvas, 0, 0);
  const d = c.getImageData(0, 0, w, h).data;
  let s = 0;
  for (let i = 3; i < d.length; i += 12) s += d[i];
  return s;
}
/**
 * Run an effect engine through a number of frames at once, for a still: what start() schedules with setTimeout lands
 * on its frame (16.7 ms apart, like the live loop) and nothing is left running. The canvas keeps the frame, from
 * pick = [first, step] on, that shows the most (a spark or a bolt is gone again in a few frames).
 */
function pvRunFx(fx, frames, start, pick) {
  const realTimeout = window.setTimeout;
  const { burst, kick } = fx;
  const due = [];
  let now = 0, best = -1, snap = null;
  fx.burst = (k, x, y, o) => addBurst(fx, k, x, y, o);
  fx.kick = () => {};
  window.setTimeout = (f, ms) => { due.push([now + (Number(ms) || 0), f]); return 0; };
  try {
    start();
    for (let i = 0; i <= frames; i++) {
      now = i * 16.7;
      due.sort((a, b) => a[0] - b[0]);
      while (due.length && due[0][0] <= now) due.shift()[1]();
      try { drawFx(fx); } catch (e) { console.error(e); fx.parts = []; }
      if (pick && i >= pick[0] && (i - pick[0]) % pick[1] === 0) {
        const ink = pvInk(fx.canvas);
        if (ink > best) {
          best = ink;
          snap = snap || document.createElement('canvas');
          snap.width = fx.canvas.width; snap.height = fx.canvas.height;
          snap.getContext('2d').drawImage(fx.canvas, 0, 0);
          snap.pvClass = fx.canvas.className;
          snap.at = i;
        }
      }
    }
    if (snap && snap.at !== frames) pvPaint(fx.canvas, snap);
  } finally {
    window.setTimeout = realTimeout;
    fx.burst = burst; fx.kick = kick;
  }
}
/** An effect engine for a canvas preview, made when first needed (then the box has its real size). */
function pvFxEngine(el, canvas) {
  const eng = { fx: null, W: 0, H: 0 };
  eng.get = () => {
    if (!eng.fx) { eng.W = el.clientWidth || 120; eng.H = el.clientHeight || 36; eng.fx = createFx(canvas); eng.fx.size(eng.W, eng.H); }
    return eng.fx;
  };
  // stopped for good: bursts still due from its timers (a celebration's later ones) must not wake it over the still
  eng.drop = () => { if (!eng.fx) return; eng.fx.stop(); eng.fx.burst = eng.fx.kick = () => {}; eng.fx = null; };
  return eng;
}

function previewFx(kind, el) {
  if (kind === 'none') { el.innerHTML = '<span class="pv-none">—</span>'; return () => {}; }
  const canvas = h('canvas', 'pv-canvas');
  el.appendChild(canvas);
  const eng = pvFxEngine(el, canvas);
  const opt = (enter) => ({ enter, submit: enter, k: S.settings.typingFxIntensity, cw: 7, ch: 13 });
  let timer = 0;
  // the still: a few keys typed along the line, around the last one
  const still = () => {
    const fx = eng.get();
    fx.stop();
    pvRunFx(fx, 42, () => [0.3, 0.43, 0.56, 0.69].forEach((f, i) => setTimeout(() => fx.burst(kind, eng.W * f, eng.H / 2 + 2, opt(false)), i * 170)), [22, 2]);
  };
  el.pvShow = () => pvStill(el, canvas, `fx|${kind}|${S.settings.typingFxIntensity}`, still);
  el.pvPlay = () => {
    const fx = eng.get();
    let x = 12;
    clearInterval(timer);
    timer = setInterval(() => {
      x += 9;
      const enter = x > eng.W - 18;
      fx.burst(kind, enter ? eng.W / 2 : x, eng.H / 2 + 2, opt(enter));
      if (enter) x = 12;
    }, 170);
  };
  el.pvRest = () => { clearInterval(timer); timer = 0; eng.drop(); canvas.pvShown = ''; el.pvShow(); };
  return () => { clearInterval(timer); eng.drop(); };
}

function previewCelebrate(kind, el) {
  const canvas = h('canvas', 'pv-canvas');
  el.appendChild(canvas);
  const eng = pvFxEngine(el, canvas);
  const go = () => runCelebration(eng.get(), kind, eng.W / 2, eng.H * 0.6, eng.W, 0.62);
  let timer = 0;
  el.pvShow = () => pvStill(el, canvas, `celebrate|${kind}`, () => { eng.get().stop(); pvRunFx(eng.get(), 60, go, [6, 3]); });
  el.pvPlay = () => { clearInterval(timer); go(); timer = setInterval(go, 1100); };
  el.pvRest = () => { clearInterval(timer); timer = 0; eng.drop(); canvas.pvShown = ''; el.pvShow(); };
  return () => { clearInterval(timer); eng.drop(); };
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
  ['zipper', '지퍼', '🤐 살짝 벌어진 지퍼를 손잡이가 돌며 맞물려 닫고 반대쪽 손잡이가 다시 엶'],
  ['conveyor', '컨베이어 벨트', '📦 롤러 위로 도는 벨트가 상자들을 실어 나름'],
  ['gears', '톱니 체인', '⚙️ 네 모서리 톱니바퀴에 롤러 체인이 맞물려 감겨 돌아감'],
  ['domino', '도미노', '🁢 도미노가 줄줄이 쓰러지고 뒤따르는 기계가 하나씩 다시 세움'],
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
  ...(window.WG_MORE ? window.WG_MORE.runners : {}), // 지퍼 · 컨베이어 벨트 · 톱니 체인 · 도미노 (fx/wg-more.js)
};
/** Keep the runner layer of a pane (or a preview) in step with its frame style. */
function syncRunners(el, style, on) {
  let layer = el.querySelector(':scope > .wg-run');
  const make = on && WG_RUNNERS[style];
  if (!make) { if (layer) { stopRunners(layer); layer.remove(); } return; }
  if (layer && layer.dataset.style === style) return;
  if (layer) stopRunners(layer); // another style takes the layer over: the old one's observer and timer must not go on
  else { layer = document.createElement('div'); layer.className = 'wg-run'; el.appendChild(layer); }
  layer.dataset.style = style;
  layer.innerHTML = make();
  const fit = window.WG_MORE?.fit[style] || (style === 'relay' ? relayGeometry : style === 'santa' ? santaGeometry : RUN_CFG[style] ? runnerGeometry : null);
  if (style === 'santa') startSantaRound(layer);
  if (fit) {
    fit(layer);
    // the pane resized (window, split, sidebar…): re-measure the track instead of letting it fall apart
    let last = '';
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (layer.runFit !== ro || !layer.isConnected) { ro.disconnect(); return; } // replaced, or gone with its tab / preview
      cancelAnimationFrame(raf); // a drag-resize fires many times: re-measure once per frame
      raf = requestAnimationFrame(() => { const k = layer.clientWidth + 'x' + layer.clientHeight; if (layer.runFit === ro && k !== last && layer.clientWidth && layer.clientHeight) { last = k; fit(layer); } });
    });
    ro.observe(layer);
    layer.runFit = ro;
  }
}
/** A runner layer is going away or changing style: stop watching its size, stop its santa round. */
function stopRunners(layer) {
  layer.runFit?.disconnect();
  layer.runFit = null;
  clearInterval(layer.santaTimer);
  layer.santaTimer = 0;
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
  const pane = el.querySelector('.pv-pane');
  syncRunners(pane, kind, true);
  const layer = pane.querySelector(':scope > .wg-run');
  if (layer && layer.santaTimer) { // 산타 배달 throws its presents from a timer: it runs only while the preview moves
    const hold = () => {
      clearInterval(layer.santaTimer);
      layer.santaTimer = 0;
      for (const g of layer.querySelectorAll('.wr-gift')) { g.getAnimations().forEach((a) => a.cancel()); g.remove(); } // cancelled: no landing, no bounce
    };
    hold();
    el.pvPlay = () => startSantaRound(layer);
    el.pvRest = hold;
  }
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
    const play = () => seq.forEach(([ms, k]) => setTimeout(() => playKeySound(kind, k, true), ms));
    if (window.SAMPLES && window.SAMPLES[kind]) { // decode the clips first, or the phrase would begin with stand-in ticks
      try { audioCtx = audioCtx || new AudioContext({ latencyHint: 'interactive' }); sampleSet(audioCtx, kind); (sampleCache.pending[kind] || Promise.resolve()).then(play, play); } catch { play(); }
    } else play();
    clearTimeout(btn.playTimer);
    btn.playTimer = setTimeout(() => btn.classList.remove('playing'), at + 400);
  });
  return () => {};
}

function previewCursor(kind, el) {
  el.innerHTML = `<span class="pv-term"><span class="pv-text">hello</span><span class="pv-cur-wrap"><span class="pv-cur mt-cursor kind-${kind}${NATIVE_CURSORS[kind] ? ' native' : ''}">${(window.CURSOR_ART && window.CURSOR_ART[kind]) || ''}</span></span></span>`;
  return () => {};
}

const PV_BG_WARM = 45; // a background's still: how it looks after 1.5 s (its frames are counted at 30 fps)
/* backgrounds known by something that 1.5 s may not show yet: bring it on, then run so many frames more */
const PV_BG_STILL = {
  thunder: (bg) => { bg.storm.next = bg.t + 1; return 15; }, // a bolt, the clouds lit
};
/* a background kept in its own module (scenes/) can bring its own: window.BG_PV_STILL[kind] */
const pvStillHook = (kind) => (window.BG_PV_STILL && window.BG_PV_STILL[kind]) || PV_BG_STILL[kind];
function previewBg(kind, el) {
  if (kind === 'none') { el.innerHTML = '<span class="pv-none">—</span>'; return () => {}; }
  const canvas = h('canvas', 'pv-canvas bg-pv');
  el.appendChild(canvas);
  let bg = null;
  const make = () => {
    if (bg) return;
    bg = createBg(canvas);
    bg.size(el.clientWidth || 120, el.clientHeight || 36);
    bg.set(kind);
    bg.stop(); // set() starts the loop: only a preview that is pointed at runs it
    bg.warmLeft = PV_BG_WARM;
    bg.tweaked = !pvStillHook(kind);
  };
  // run the scene toward its still, ~8 ms at a time: some build their scenery over many frames (a few ms each)
  const still = () => {
    make();
    const t0 = performance.now();
    while (bg.warmLeft > 0) {
      bg.t += 1;
      drawBg(bg);
      if (--bg.warmLeft === 0 && !bg.tweaked) { bg.tweaked = true; bg.warmLeft = pvStillHook(kind)(bg); }
      if (performance.now() - t0 > 8) break;
    }
    if (bg.warmLeft > 0) return 'more';
    if (kind === 'campfire' && !(CAMPFIRE_VIDEO && CAMPFIRE_VIDEO.readyState >= 2)) { // the footage is still loading
      bg.warmLeft = 1;
      CAMPFIRE_VIDEO?.addEventListener('loadeddata', () => { canvas.pvShown = ''; if (!el.classList.contains('pv-live')) el.pvShow(); }, { once: true });
      return false;
    }
  };
  el.pvShow = () => pvStill(el, canvas, `bg|${kind}`, still);
  el.pvPlay = () => { make(); if (!bg.raf) bg.raf = requestAnimationFrame(bg.frame); };
  el.pvRest = () => { bg?.stop(); canvas.pvShown = ''; el.pvShow(); };
  return () => bg?.stop();
}

/**
 * Dropdown with an animated example in every row (still until pointed at: see pvLive).
 * opts: { key, items: [[value, label, desc]], preview(kind, el) → cleanup, onPick(value) }
 */
function setupPicker(root, opts) {
  const btn = root.querySelector('.pk-btn');
  const label = () => (opts.items.find((i) => i[0] === S.settings[opts.key]) || opts.items[0]);
  let pop = null;
  let cleanups = [];
  let btnClean = () => {};
  const mount = (v, pv) => {
    pv.pvShow = pv.pvPlay = pv.pvRest = null; // a box keeps its element when it shows another style
    const clean = opts.preview(v, pv);
    pvReady(pv);
    return () => { clean(); pvForget(pv); };
  };

  const drawButton = () => {
    btnClean();
    const [v, name] = label();
    btn.querySelector('.pk-name').textContent = name;
    const pv = btn.querySelector('.pk-pv');
    pv.innerHTML = '';
    btnClean = mount(v, pv);
  };
  pvHover(btn, btn.querySelector('.pk-pv'));
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
      const pv = it.querySelector('.pk-item-pv');
      cleanups.push(mount(it.dataset.v, pv));
      pvHover(it, pv);
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
  const modal = root.closest('.modal');
  modal.addEventListener('pointerdown', (e) => { if (pop && !root.contains(e.target)) close(); });
  if (!modal.pvHooked) { // a setting with no look of its own (the typing effect's strength) still changes the stills
    modal.pvHooked = true;
    modal.addEventListener('input', pvRefreshSoon);
    modal.addEventListener('change', pvRefreshSoon);
  }
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

/** xterm throws on a line height below 1, and a typed value can be anything: keep it inside what the setting offers (1 – 2). */
const clampLineHeight = (v) => Math.max(1, Math.min(2, Number(v) || 1.15));
/** The same for letter spacing (-2 – 6): far below zero no cell width is left, and the terminal drops to 2 columns. */
const clampLetterSpacing = (v) => Math.max(-2, Math.min(6, Number(v) || 0));

/**
 * The font the terminal draws with: the chosen one, with the bundled Nerd Font icons put in front of it for the icon
 * code points only (its @font-face has a unicode-range: Private Use Area). Prompt themes print folder, git,
 * language and OS icons there; without it most fonts show empty boxes, and some (D2Coding) their own unrelated glyphs.
 * A Nerd Font the user picked keeps its own icons: then ours only fills in behind it.
 */
const NERD_FONT = "'MT Nerd Symbols'";
function termFont(ff) {
  ff = String(ff || 'monospace');
  if (ff.includes(NERD_FONT)) return ff;
  if (/nerd font|\bnfm?\b/i.test(primaryFont(ff))) return ff.replace(/,\s*monospace\s*$/, '') + `, ${NERD_FONT}, monospace`;
  return `${NERD_FONT}, ${ff}`;
}
// The icons are drawn into the GPU glyph atlas the first time they appear: if that happened before the font file had
// loaded, they would stay boxes. Load it at once, and redraw the terminals when it is in.
try {
  document.fonts.load(`14px ${NERD_FONT}`, String.fromCodePoint(0xf07c)).then(() => {
    for (const t of S.tabs) { try { t.term.clearTextureAtlas(); t.term.refresh(0, t.term.rows - 1); } catch { /* ignore */ } }
  }, () => {});
} catch { /* no font loading API */ }

function termOptions() {
  const st = S.settings;
  return {
    fontFamily: termFont(st.fontFamily),
    fontSize: st.fontSize,
    lineHeight: clampLineHeight(st.lineHeight),
    cursorBlink: st.cursorBlink && !cursorPreset().custom,
    cursorStyle: cursorPreset().style,
    cursorWidth: cursorPreset().width,
    letterSpacing: clampLetterSpacing(st.letterSpacing),
    allowTransparency: needsClearTerminal(), // transparent rendering is slower: only when an effect needs it
    cursorInactiveStyle: cursorPreset().custom ? 'none' : 'outline',
    scrollback: 20000,
    allowProposedApi: true,
    drawBoldTextInBrightColors: false,
    fontWeightBold: '600',
    minimumContrastRatio: 1,
    smoothScrollDuration: 0,
    rightClickSelectsWord: false,
    // ConPTY reflows wrapped lines on a resize only from build 21376 on: xterm has to know the real build to do the same
    // as the pty (22621 if it cannot be read: what was assumed before). No Windows pty on macOS / Linux.
    ...(IS_WIN ? { windowsPty: { backend: 'conpty', buildNumber: window.mt.osBuild || 22621 } } : {}),
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
      <span class="tile-title no-i18n"></span>
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
  // Cursor shape requests (DECSCUSR, CSI Ps SP q). Shells send "back to the default" (Ps 0) all the time — Clink on every
  // key — and xterm takes that as a block, overriding the shape picked in the settings. With one of our drawn cursors,
  // xterm's own cursor is meant to be invisible, but the GPU renderer paints its transparent block black: a black cell
  // behind the cursor. So: our cursor ignores shape requests; the default means the user's choice; a real shape (an
  // editor's insert-mode bar) still applies to the plain cursors.
  term.parser.registerCsiHandler({ intermediates: ' ', final: 'q' }, (params) => {
    const pre = cursorPreset();
    if (pre.custom) return true;
    const ps = Number(params && params.length ? params[0] : 0) || 0;
    if (ps !== 0) return false;
    term.options.cursorStyle = pre.style; term.options.cursorWidth = pre.width; term.options.cursorBlink = !!S.settings.cursorBlink;
    return true;
  });
  term.onWriteParsed(() => {
    // typing moves the cursor along the caret's row: follow that at once; jumps elsewhere wait to settle
    const b = term.buffer.active;
    let hidden = false;
    try { hidden = !!term._core.coreService.isCursorHidden; } catch { /* ignore */ }
    if (!hidden) tab.curShownAt = performance.now(); // see updateCursor: a redraw hides the cursor for a moment
    if (!hidden && tab.caret && b.cursorY === tab.caret.y && b.cursorX < term.cols - 1 && b.viewportY === b.baseY) { setCaret(tab, { x: b.cursorX, y: b.cursorY }); tab.caretAtEnd = b.cursorX >= rowEnd(tab, b.cursorY); }
    // While the user types (or holds a key) an agent keeps redrawing and the output never pauses for 24 ms:
    // then the caret is read at least every 60 ms anyway, or it would stay where the typing began.
    const now = performance.now();
    if (!tab.caretSince) tab.caretSince = now;
    else if (now - tab.caretSince > 60 && Date.now() - (tab.lastIn || 0) < 400) {
      settleCaret(tab); tab.caretSince = now;
      if (tab.id === S.activeId) scheduleCursor();
    }
    clearTimeout(tab.caretTimer);
    tab.caretTimer = setTimeout(() => { settleCaret(tab); tab.caretSince = 0; if (tab.id === S.activeId) scheduleCursor(); }, 24);
  });
  // xterm puts its hidden input field and the IME composition box at the raw cursor; move them to the caret
  try {
    const core = term._core;
    const placeAt = (el, c) => {
      const cell = core._renderService.dimensions.css.cell;
      const ah = tab.ahead; if (aheadHolds(ah, c, term.cols)) c = { x: ah.base + ah.cells, y: c.y }; // ahead of the echo, like the cursor
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
    if (tab.agent && !d.startsWith('\x1b[200~') && !/[\x00-\x1f\x7f]/.test(d)) {
      // (a lead that no longer holds (the caret went back left as a long prompt wrapped) starts again from the caret)
      const c = stableCaret(tab), now = performance.now(), ah = tab.ahead;
      const prev = ah && now - ah.t < 700 && ah.y === c.y && c.x >= ah.base && c.x >= (ah.seen || 0) ? ah : null;
      const cells = [...d].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\u303e\u3041-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1), 0);
      tab.ahead = prev ? { ...prev, cells: prev.cells + cells, t: now, seen: c.x } : { y: c.y, base: c.x, cells, t: now, seen: c.x };
      if (tab.id === S.activeId) scheduleCursor();
    } else tab.ahead = null;
    spawnFx(tab, d);
    tab.statusBeforeInput = tab.status;
    // typing again after a finished turn / a question → back to "입력 대기" (until Enter starts work)
    if (tab.agent && (tab.status === 'done' || tab.status === 'attention')) setStatus(tab, 'ready');
    if (tab.unseen) { tab.unseen = false; updateTabEl(tab); }
    // Esc (or Ctrl+C, which Claude and Codex take the same way) stops the agent, or turns down what it asked (the line
    // above has already taken 'attention' back to 'ready'): the task ends as 중단, not 완료
    if (tab.agent && (d === '\x1b' || d === '\x03') && (tab.status === 'working' || tab.awaitChoice || tab.statusBeforeInput === 'attention')) { tab.interrupted = true; tab.interruptedAt = Date.now(); }
    if (d.includes('\r') && !d.startsWith('\x1b[200~')) {
      if (tab.agent) onAgentEnter(tab);
      if (tab.agent) { tab.armed = true; tab.armedAt = Date.now(); } // a prompt / answer was submitted → next output burst is real work
      else if (/\b(claude|codex)\b/i.test(typedLine(tab))) {
        window.mt.agent.probe([500, 1500, 3000]);
        tab.typedCmd = { line: typedLine(tab), at: Date.now() }; // `cd X && claude`: where it runs (followTypedCd)
      }
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

  // on the next frame, when the pane has its size — or a moment later if the window is hidden and draws no frames
  let started = false;
  const start = () => { if (!started) { started = true; startPty(tab); } };
  requestAnimationFrame(start);
  setTimeout(start, 500);
  renderSessions();
  renderProjects();
  updateEmpty();
  saveLayout();
  return tab;
}

async function startPty(tab, { withLaunch = true } = {}) {
  if (tab.closed) return; // closed before its first frame: nothing to start
  try { tab.fit.fit(); } catch { /* ignore */ }
  const { cols, rows } = tab.term;
  const res = await window.mt.pty.create({
    id: tab.id,
    shellId: tab.shellId,
    cwd: tab.cwd,
    agent: withLaunch ? tab.launch : null,
    cols,
    rows,
  });
  if (tab.closed) { if (res.ok) window.mt.pty.kill(tab.id); return; } // closed while it was starting: leave no pty behind
  if (!res.ok) {
    tab.term.write(`\x1b[31m${tr('셸을 시작하지 못했습니다:')} ${res.error}\x1b[0m\r\n`);
    setStatus(tab, 'exited');
    return;
  }
  tab.alive = true;
  // resized while the pty was being created (onResize only reaches a live pty): bring it up to date
  if (tab.term.cols !== cols || tab.term.rows !== rows) window.mt.pty.resize(tab.id, tab.term.cols, tab.term.rows);
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
  // (a split shows as one item, this tab's element standing for it: the menu, rename and close act on the split)
  el.addEventListener('pointerdown', (e) => onTabPointerDown(e, tab));
  el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTabItem(tab); } });
  el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  el.addEventListener('dblclick', (e) => { if (!e.target.closest('.tab-close')) startRename(itemFocus(tab)); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); const f = itemFocus(tab); activate(f.id); openTabMenu(f, e.clientX, e.clientY); });
  el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTabItem(tab); });
  return el;
}

/* --- the tab bar shows a split as ONE item ------------------------- */
// The split's first tab (in tab order) stands for it; the others' elements are hidden. Clicking it brings back the
// pane last used, its X closes the whole split, dragging moves the split as a block.
const groupMembers = (g) => S.tabs.filter((t) => g.ids.includes(t.id));
const groupLead = (g) => groupMembers(g)[0] || null;
const groupFocus = (g) => (g.ids.includes(g.last) && tabById(g.last)) || groupLead(g);
/** The tab a tab-bar item brings to the front: the tab itself, or its split's last used pane. */
const itemFocus = (tab) => { const g = groupOf(tab); return g ? groupFocus(g) || tab : tab; };
/** The tab bar's items in order, each once: { lead, tabs, g }. */
function barItems() {
  const out = [], seen = new Set();
  for (const t of S.tabs) {
    const g = groupOf(t);
    if (g && seen.has(g)) continue;
    if (g) seen.add(g);
    out.push({ lead: t, tabs: g ? groupMembers(g) : [t], g });
  }
  return out;
}
/** Keep a split's tabs next to each other, in the split's order, where its first one is. */
function packGroup(g) {
  const ms = g.ids.map(tabById).filter(Boolean);
  if (ms.length < 2) return;
  const at = ms.map((t) => S.tabs.indexOf(t));
  const first = Math.min(...at);
  if (at.every((v, i) => v === first + i)) return;
  for (const t of ms) S.tabs.splice(S.tabs.indexOf(t), 1);
  S.tabs.splice(first, 0, ...ms);
  for (const x of S.tabs) tabsEl.appendChild(x.el);
}
/** Move a tab-bar item (a tab, or a split as a block) before or after another one. */
function moveItem(fromTab, toTab, after) {
  const block = (t) => { const g = groupOf(t); return g ? groupMembers(g) : [t]; };
  const moving = block(fromTab), anchor = block(toTab);
  if (moving.includes(toTab)) return;
  for (const t of moving) S.tabs.splice(S.tabs.indexOf(t), 1);
  const at = after ? S.tabs.indexOf(anchor[anchor.length - 1]) + 1 : S.tabs.indexOf(anchor[0]);
  S.tabs.splice(at, 0, ...moving);
  for (const x of S.tabs) tabsEl.appendChild(x.el);
  renderSessions();
  saveLayout();
}
/** Close a tab-bar item: a tab, or every pane of a split (asked first). */
async function closeTabItem(tab) {
  const g = groupOf(tab);
  if (!g) return closeTab(tab.id);
  const ms = groupMembers(g);
  const ok = await confirmDialog(`분할된 창 ${ms.length}개를 모두 닫을까요?`, ms.map((t) => `· ${tabLabel(t)}`).join('\n'), '모두 닫기');
  if (!ok) return;
  for (const t of ms) await closeTab(t.id);
}
/** Paint a split's tab-bar item: its panes' names, the split's shape, the most pressing state among them. */
function paintGroupTab(el, g) {
  const ms = groupMembers(g), f = groupFocus(g) || ms[0];
  const RANK = { attention: 5, working: 4, done: 3, ready: 2, shell: 1 };
  const top = ms.reduce((a, t) => ((RANK[t.status] || 0) > (RANK[a.status] || 0) ? t : a), ms[0]);
  el.classList.add('group-tab');
  el.classList.toggle('active', ms.some((t) => t.id === S.activeId));
  el.classList.toggle('unseen', ms.some((t) => t.unseen));
  el.classList.toggle('agent-claude', top.agent === 'claude');
  el.classList.toggle('agent-codex', top.agent === 'codex');
  for (const s of Object.keys(STATUS_TEXT)) el.classList.toggle(`st-${s}`, top.status === s);
  const slot = el.querySelector('.ico-slot');
  const iname = g.dir === 'row' ? 'splitRight' : g.dir === 'col' ? 'splitDown' : 'grid';
  if (slot && slot.dataset.name !== iname) { slot.innerHTML = icon(iname); slot.dataset.name = iname; }
  const title = el.querySelector('.tab-title');
  if (title) {
    title.classList.add('no-i18n');
    title.innerHTML = ms.map((t) => `<span class="gt-pane${t === f ? ' focus' : ''}">${esc(tabLabel(t))}</span>`).join('<span class="gt-sep">│</span>');
    el.style.setProperty('--panes', String(ms.length));
  }
  el.title = ms.map((t) => `${tabLabel(t)} · ${t.agent ? `${AGENTS[t.agent].name} · ` : ''}${STATUS_TEXT[t.status] || ''}`).join('\n');
}

function updateTabEl(tab) {
  const el = tab.el;
  if (!el) return;
  const g = groupOf(tab), lead = g && groupLead(g);
  el.classList.toggle('grp-hidden', !!g && lead !== tab);
  if (g) {
    if (lead && lead.el) paintGroupTab(lead.el, g); // this tab's item is its split's
    updateTileHead(tab);
    return;
  }
  el.classList.remove('group-tab');
  el.classList.toggle('active', tab.id === S.activeId);
  el.classList.toggle('unseen', !!tab.unseen);
  el.classList.toggle('agent-claude', tab.agent === 'claude');
  el.classList.toggle('agent-codex', tab.agent === 'codex');
  for (const s of Object.keys(STATUS_TEXT)) el.classList.toggle(`st-${s}`, tab.status === s);
  const slot = el.querySelector('.ico-slot');
  const iname = tabIconName(tab);
  if (slot && slot.dataset.name !== iname) { slot.innerHTML = icon(iname); slot.dataset.name = iname; }
  const title = el.querySelector('.tab-title');
  if (title) { title.classList.add('no-i18n'); title.textContent = tabLabel(tab); } // a user-made name is never translated (set here: a rename re-creates the span)
  el.title = `${tabLabel(tab)}\n${tab.cwd}\n${tab.agent ? `${AGENTS[tab.agent].name} · ` : ''}${STATUS_TEXT[tab.status] || ''}`;
  updateTileHead(tab);
}

/** A pane's header (in a split or a project grid) and its working glow mirror the tab. */
function updateTileHead(tab) {
  const host = tab.host;
  const iname = tabIconName(tab);
  if (host) {
    host.classList.toggle('agent-claude', tab.agent === 'claude');
    host.classList.toggle('agent-codex', tab.agent === 'codex');
    for (const s of Object.keys(STATUS_TEXT)) host.classList.toggle(`st-${s}`, tab.status === s);
    host.classList.toggle('busy', !!S.settings.workGlow && !!tab.agent && tab.status === 'working');
    host.dataset.wg = S.settings.workGlow ? S.settings.workGlowStyle || 'orbit' : ''; // empty when off: a wide frame's room (glow-b.css) goes too
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
  const g = groupOf(tab);
  if (g) g.last = id; // the pane its tab-bar item brings back
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
    // the tab in front has to be one of them: after `cd` in the focused tile it no longer is, and would be hidden
    if (tiles.length >= 2 && tiles.includes(activeTab())) return { kind: 'project', tiles, dir: 'grid' };
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
  for (const g of S.groups) packGroup(g); // a split is one block in the tab order (and one item in the bar)
  for (const t of S.tabs) {
    const i = tiles.indexOf(t);
    t.el.classList.toggle('in-view', i >= 0 && t.id !== S.activeId);
    t.el.classList.toggle('in-split', !!groupOf(t));
    // a tab that joined or left a split: its own item hides or comes back, the split's item is repainted
    if (t.el.classList.contains('grp-hidden') !== !!(groupOf(t) && groupLead(groupOf(t)) !== t) || groupOf(t) || t.el.classList.contains('group-tab')) updateTabEl(t);
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
  let g = groupOf(t);
  // full already: say so before anything is changed (the zoom, the split's direction)
  if (g && g.ids.length >= 6) return toast('한 화면에 최대 6개까지 나눌 수 있어요', { icon: 'info' });
  S.grid = null;
  S.zoom = null;
  if (!g) { g = { ids: [t.id], dir }; S.groups.push(g); }
  else if (g.dir !== dir) g.dir = 'grid';
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
  if (tab.closed) return; // already closed while the question was up
  tab.closed = true; // whatever is still on its way for this tab (its pty starting, a transcript check) stops here
  const idx = S.tabs.indexOf(tab);
  syncTask(tab, 'exited');
  if (tab.agent) S.sessionCache.delete(normP(tab.cwd)); // its conversation is a past one now (a new one may not be listed yet)
  window.mt.pty.kill(tab.id);
  tab.alive = false;
  try { tab.term.dispose(); } catch { /* ignore */ }
  syncRunners(tab.host, '', false); // a working pane's runner layer: its size observer goes with it
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
  // the button that closed it (a tab's X, a sidebar row's stop button) is gone, and the focus went with it
  if (!S.overlay && document.activeElement === document.body) activeTab()?.term.focus();
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
  // by tab-bar item: a split moves as one, and a tab steps over a split, not into it
  const items = barItems();
  const i = items.findIndex((it) => it.tabs.some((t) => t.id === S.activeId));
  if (i < 0) return;
  const to = Math.max(0, Math.min(items.length - 1, i + delta));
  if (to === i) return;
  const el = items[i].lead.el;
  const before = el.getBoundingClientRect().left;
  moveItem(items[i].lead, items[to].lead, to > i);
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
  const old = groupOf(tab);
  // the pane's split is full (moving a pane inside its own split is fine): say so before anything is changed
  const full = groupOf(pane);
  if (tab !== pane && full && full !== old && full.ids.length >= 6) return toast('한 화면에 최대 6개까지 나눌 수 있어요', { icon: 'info' });
  // leave the group it was in (a group of one isn't a split any more)
  if (old) {
    old.ids = old.ids.filter((id) => id !== tab.id);
    if (old.ids.length < 2) S.groups = S.groups.filter((g) => g !== old);
  }
  if (tab === pane) return activate(tab.id);
  let g = groupOf(pane);
  if (!g) { g = { ids: [pane.id], dir }; S.groups.push(g); }
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
      els = [...tabsEl.children].filter((x) => !x.classList.contains('grp-hidden')); // the bar's items (a split is one)
      rects = els.map((x) => x.getBoundingClientRect());
      from = els.indexOf(el);
      target = from;
      tabsEl.classList.add('tabs-dragging');
      el.classList.add('dragging');
      document.body.classList.add('grabbing');
    }
    const barBottom = tabsEl.getBoundingClientRect().bottom;
    if (ev.clientY > barBottom + 16 && !groupOf(tab)) { // (a split's item only moves along the bar)
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
    if (!dragging) { // a plain click (on the tab already in front it took the focus off the terminal: hand it back)
      const g = groupOf(tab), f = itemFocus(tab); // a split's item: its last used pane, unless one of its panes is in front
      if (g ? !g.ids.includes(S.activeId) : tab.id !== S.activeId) activate(f.id);
      else if (!S.overlay) activeTab()?.term.focus();
      return;
    }
    if (out) {
      tabsEl.classList.remove('tabs-dragging');
      document.body.classList.remove('grabbing');
      el.classList.remove('dragging', 'drag-out');
      const drop = splitDrop.target;
      splitDrop.clear();
      if (drop) splitInto(tab, drop.pane, drop.side);
      else if (tab.id !== S.activeId) activate(tab.id);
      activeTab()?.term.focus(); // the dragged tab, unless its split was refused
      return;
    }
    const g = groupOf(tab);
    if (g ? !g.ids.includes(S.activeId) : tab.id !== S.activeId) activate(itemFocus(tab).id);
    const visualLeft = el.getBoundingClientRect().left;
    tabsEl.classList.remove('tabs-dragging');
    document.body.classList.remove('grabbing');
    els.forEach((x) => { x.style.transform = ''; });
    el.classList.remove('dragging');
    if (target !== from) { const to = S.tabs.find((x) => x.el === els[target]); if (to) moveItem(tab, to, target > from); }
    flip(el, visualLeft);
    activeTab()?.term.focus();
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
  const initial = input.value.trim();
  input.spellcheck = false;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    // only a name that was really changed is kept: an untouched label goes on following the agent's title and the folder
    if (commit && input.value.trim() !== initial) tab.customTitle = input.value.trim();
    input.replaceWith(h('span', 'tab-title'));
    updateTabEl(tab);
    renderSessions();
    saveLayout();
    if (tab.id === S.activeId) tab.term.focus();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    // prevented: finish() moves the focus to the terminal, which would otherwise receive this very Enter as a keypress
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
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
  ['manuscript', '원고지', '칸마다 한 자씩 또박또박'],
  ['approval', '결재 서류', '담당·팀장·사장 도장이 쾅'],
  ['receipt', '영수증', '보낸 시각이 찍힌 감열지 영수증'],
  ['queue', '대기번호표', '은행 번호표처럼 대기번호 017'],
  ['chalk', '칠판', '분필 가루 묻은 나무 테 칠판'],
];
// styles drawn as real shapes over the terminal (the cells only carry a hidden marker colour)
const OVERLAY_PROMPTS = new Set(['card', 'bar', 'neon', 'gradient', 'badge', 'bubble', 'marker', 'bracket', 'glass', 'dot', 'terminal', 'flow', 'sticky', 'quote', 'scan', 'ticket', 'wave', 'pill', 'notebook', 'cyber', 'floating', 'spot', 'ribbon', 'stamp', 'sparkle', 'washi', 'chat', 'manuscript', 'approval', 'receipt', 'queue', 'chalk']);
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
  if (!boxes.length) { if (layer) { layer.innerHTML = ''; layer.dataset.sig = ''; } return; } // sig too: the same boxes may come back
  const screen = tab.host.querySelector('.xterm-screen');
  if (!screen) return;
  if (!layer) { layer = h('div', 'pbox-layer'); tab.host.querySelector('.term-body').appendChild(layer); }
  const sr = screen.getBoundingClientRect();
  const br = layer.parentElement.getBoundingClientRect();
  const cw = sr.width / tab.term.cols;
  const ch = sr.height / tab.term.rows;
  const style = S.settings.promptStyle;
  const deco = DECO_PROMPTS.has(style);
  layer.className = `pbox-layer ps-${style}${deco ? ' pl-own' : ''}`;
  const geo = boxes.map((bx) => ({
    left: sr.left - br.left + bx.x0 * cw,
    top: sr.top - br.top + bx.y0 * ch,
    w: (bx.x1 - bx.x0 + 1) * cw,
    hh: (bx.y1 - bx.y0 + 1) * ch,
  }));
  const inner = deco ? promptDeco(tab, style, boxes, geo, { cw, ch, right: sr.right - br.left }) : null;
  let html = '';
  boxes.forEach((bx, i) => {
    const { left, top, w, hh } = geo[i];
    const fill = OVERLAY_PROMPTS.has(style) && !deco ? `;background:${promptTintCss(style)};border-radius:3px` : '';
    html += `<div class="pbox" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px${fill}">${inner ? inner[i] : style === 'badge' ? '<span class="pbox-badge">나</span>' : ''}</div>`;
  });
  if (layer.dataset.sig !== html) { layer.innerHTML = html; layer.dataset.sig = html; }
}

/* ---------- 원고지 · 결재 서류 · 영수증 · 대기번호표 · 칠판 ----------
 * These read more than the box's place: its characters (원고지 squares), which prompt the agent is on (결재 seals),
 * when it was sent (영수증) and where it stands among the tab's prompts (대기번호). Their layer is no stacking context
 * of its own (.pl-own), so a surface laid under the letters blends with the terminal (칠판: lighten) and the letters
 * keep their colour. All of it is worked out only when the boxes are redrawn: nothing here runs per frame. */
const DECO_PROMPTS = new Set(['manuscript', 'approval', 'receipt', 'queue', 'chalk']);
const PROMPT_HEAD = /^\s*[❯>›»] /; // the agent's mark in front of a prompt: the box starts on screen, not above it

/** The prompt's text as on screen, flattened (no spaces), without the agent's "❯ " / "> " / "› " in front. */
function boxFlat(tab, bx) {
  const buf = tab.term.buffer.active;
  let s = '';
  for (let y = bx.y0; y <= bx.y1; y++) s += buf.getLine(buf.viewportY + y)?.translateToString(true, bx.x0, bx.x1 + 1) || '';
  return s.replace(/^\s*[❯>›»]/, '').replace(/\s+/g, '');
}

/** Same seed, same numbers: a prompt's chalk dust and barcode stay put when it is redrawn. */
function seededRandom(text) {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 대기번호: each prompt's place among the tab's prompts, in order. A prompt seen before keeps its number; a new one goes
 * in after the prompt above it on screen (or before a known one below it) — normally at the end. Only when nothing on
 * screen is known yet (scrolled back into older prompts) does the line it was last seen on decide.
 * items: [{ key, line }] top to bottom (key '' = no number: its start is above the screen).
 */
function queueNumbers(tab, items) {
  const buf = tab.term.buffer.active;
  const list = tab.qList || (tab.qList = seedQueue(tab));
  const atBottom = buf.viewportY >= buf.baseY;
  const find = (key, from) => { for (let j = from; j < list.length; j++) if (list[j].key === key) return j; return -1; };
  let prev = -1;
  return items.map((it, i) => {
    if (!it.key) return 0;
    let at = find(it.key, prev + 1);
    if (at < 0) {
      let next = -1;
      for (let k = i + 1; k < items.length && next < 0; k++) if (items[k].key) next = find(items[k].key, prev + 1);
      if (next >= 0) at = next;
      else if (prev >= 0) at = prev + 1;
      else if (atBottom) at = list.length;
      else { at = list.findIndex((e) => e.line > it.line); if (at < 0) at = list.length; }
      list.splice(at, 0, { key: it.key, line: it.line });
    }
    list[at].line = it.line;
    prev = at;
    return at + 1;
  });
}

/** The first time a tab numbers its prompts: the ones already up in its scrollback come first (read by their text,
 *  as textPromptBoxes does), so a style picked in the middle of a conversation still counts from its start. */
function seedQueue(tab) {
  const buf = tab.term.buffer.active;
  const text = (i) => buf.getLine(i)?.translateToString(true) || '';
  const list = [];
  for (let i = 0; i < buf.viewportY; i++) {
    const s = text(i);
    const m = /^(\s*)[❯>›] \S/.exec(s);
    if (!m || (i > 0 && text(i - 1).trim())) continue;
    let flat = s;
    for (let j = i + 1; j <= i + 3 && j < buf.length; j++) { const n = text(j); if (!n.trim() || !n.startsWith(' '.repeat(m[1].length + 2))) break; flat += n; }
    flat = flat.replace(/^\s*[❯>›»]/, '').replace(/\s+/g, '');
    if (flat) list.push({ key: flat.slice(0, 32), line: i });
  }
  return list;
}

/** 영수증: when the prompt was sent — from the task it started (kept across restarts), or 0 when unknown. */
function promptSentAt(tab, flat) {
  const cache = tab.pSent || (tab.pSent = new Map());
  const k = flat.slice(0, 48);
  if (cache.has(k)) return cache.get(k);
  let at = 0;
  for (let i = S.tasks.length - 1; i >= 0 && !at; i--) {
    const t = S.tasks[i];
    if (t.agent !== tab.agent) continue;
    if (t.tabId !== tab.id && !(t.sessionId && t.sessionId === tab.sessionId) && normP(t.path) !== normP(tab.cwd)) continue;
    const n = promptNeedle(t);
    if (n.length >= 4 ? flat.includes(n) : n && flat === n) at = t.sent || t.start || 0;
  }
  if (cache.size > 600) cache.clear();
  cache.set(k, at);
  return at;
}

/**
 * 결재 서류: the prompt the agent is on, and how far it got — 1 담당 (sent), 2 팀장 (being worked on), 3 사장 (done).
 * The seal just added stamps in once (anim: ms since its stamp, negative while still to come; null: no stamping).
 * Every other prompt is fully signed.
 */
const STAMP_MS = 520;
function approvalNow(tab, boxes, flats) {
  const task = tab.agent && tab.taskId && taskById(tab.taskId);
  if (!task) return null;
  const stage = task.status === 'pending' ? 1 : task.status === 'working' || task.status === 'attention' ? 2 : 3;
  let st = tab.apState;
  // a prompt just sent starts at 담당 alone (its 팀장 stamps in even when the work began before it was first drawn)
  if (!st || st.id !== task.id) st = tab.apState = { id: task.id, stage: Date.now() - (task.sent || 0) < 3000 ? 1 : stage, at: 0 };
  // the agent picks a prompt up a moment after it was sent: 팀장 waits a little so the seals still come one by one
  if (stage !== st.stage) { st.at = stage < st.stage ? 0 : stage === 2 ? Math.max(Date.now(), (task.sent || 0) + 650) : Date.now(); st.stage = stage; }
  const since = st.at ? Date.now() - st.at : Infinity; // < 0: its stamp is still to come
  if (stage === 3 && since > STAMP_MS) return null;
  const needle = promptNeedle(task);
  const hit = (f) => (needle.length >= 4 ? f.includes(needle) : !!needle && f === needle);
  const buf = tab.term.buffer.active;
  // the newest prompt is the last one on screen: when that is not it, it scrolled away (or was never drawn)
  let i = boxes.length - 1;
  if (buf.viewportY < buf.baseY) while (i >= 0 && !hit(flats[i])) i--;
  if (i < 0 || !hit(flats[i])) return null;
  return { i, stage, anim: since < STAMP_MS ? since : null };
}

/** 원고지 squares along a row: a wide (Korean) character fills a square, two narrow ones share one (as letters and digits
 *  are written on real manuscript paper), a narrow one just before a wide one gets half a square. → column cuts */
function msCuts(wide, n) {
  const cuts = [0];
  for (let x = 0; x < n;) {
    x += wide(x) || (x + 1 < n && !wide(x + 1)) ? 2 : 1;
    cuts.push(Math.min(x, n));
  }
  return cuts;
}
/** The sheet: rows of squares with the gap between rows, lines on whole pixels (ox / oy: where the box sits). */
function msSvg(rows, n, cw, ch, ox, oy) {
  const d = window.devicePixelRatio || 1;
  const X = (c) => ((Math.round((ox + c * cw) * d) + 0.5) / d - ox).toFixed(2);
  const Y = (v) => ((Math.round((oy + v) * d) + 0.5) / d - oy).toFixed(2);
  const sq = Math.min(ch - 3, Math.round(cw * 2)); // as near a square as the row allows
  const g = (ch - sq) / 2;
  let grid = '';
  rows.forEach((wide, r) => {
    const t = Y(r * ch + g);
    const b = Y(r * ch + g + sq);
    grid += `M${X(0)} ${t}H${X(n)}M${X(0)} ${b}H${X(n)}`;
    for (const c of msCuts(wide, n).slice(1, -1)) grid += `M${X(c)} ${t}V${b}`;
  });
  const frame = `M${X(0)} ${Y(-g)}H${X(n)}V${Y(rows.length * ch + g)}H${X(0)}Z`;
  return `<svg class="ms-sheet" width="1" height="1"><path class="ms-grid" d="${grid}"/><path class="ms-frame" d="${frame}"/></svg>`;
}

/** 결재란: 담당 · 팀장 · 사장, a seal in each box that has signed. */
function approvalBox(stage, anim, x, y) {
  const seal = (k, name) => {
    if (k >= stage) return '';
    const a = k === stage - 1 && anim != null ? ` style="animation-delay:${-Math.round(anim)}ms"` : '';
    return `<i class="ap-seal${a ? ' ap-new' : ''}"${a}>${name}</i>`;
  };
  return `<span class="ap-box" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><span class="ap-l">결재</span>`
    + '<span class="ap-h">담당</span><span class="ap-h">팀장</span><span class="ap-h">사장</span>'
    + `<span class="ap-c">${seal(0, '나')}</span><span class="ap-c">${seal(1, '김')}</span><span class="ap-c">${seal(2, '박')}</span></span>`;
}
const AP_W = 80; // the 결재란's size (prompt.css)
const AP_H = 32;
/** The sheet around the prompt (w × hh) and its 결재란 (at x, y). */
function approvalDoc(w, hh, x, y) {
  const l = Math.min(-7, x - 5);
  const t = Math.min(-4, y - 4);
  const r = Math.max(w + 7, x + AP_W + 5);
  const b = Math.max(hh + 4, y + AP_H + 4);
  return `<i class="ap-doc" style="left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;width:${(r - l).toFixed(1)}px;height:${(b - t).toFixed(1)}px"></i>`;
}

/** Chalk dust and the swipes of an eraser, different on every board (seeded by its prompt). */
function chalkDust(seed) {
  const r = seededRandom(seed || 'board');
  const out = [];
  for (let k = 0; k < 2; k++) { // eraser swipes: broad, flat smears
    out.push(`radial-gradient(${(70 + r() * 60).toFixed(0)}px ${(9 + r() * 6).toFixed(0)}px at ${(10 + r() * 80).toFixed(0)}% ${(25 + r() * 50).toFixed(0)}%, rgb(var(--dust) / ${(0.07 + r() * 0.04).toFixed(3)}), transparent)`);
  }
  for (let k = 0; k < 4; k++) { // small clouds of dust
    out.push(`radial-gradient(${(14 + r() * 24).toFixed(0)}px ${(5 + r() * 6).toFixed(0)}px at ${(r() * 100).toFixed(0)}% ${(10 + r() * 80).toFixed(0)}%, rgb(var(--dust) / ${(0.08 + r() * 0.07).toFixed(3)}), transparent)`);
  }
  out.push('linear-gradient(180deg, transparent 55%, rgb(var(--dust) / .07))'); // settled along the bottom edge
  return out.join(',');
}

/** 칠판: board, frame (and, on a whiteboard, the tray and a marker). The green stays green on every theme: lighten can
 *  only lift each channel above the theme's own background, so the green channel is lifted further. */
function chalkBoard(seed) {
  const [r, g, b] = BASE_STAGE;
  const board = `rgb(${Math.max(r, 33)},${Math.max(g + 30, 56)},${Math.max(b, 44)})`;
  return `<i class="ck-board" style="--board:${board};background-image:${chalkDust(seed)}"></i><i class="ck-frame"></i><i class="ck-tray"></i><i class="ck-chalk"></i>`;
}

/** A short barcode under the receipt (its own pattern for every prompt). */
function barcode(seed) {
  const r = seededRandom(seed || 'receipt');
  const stops = [];
  for (let x = 0; x < 38;) {
    const bar = r() < 0.35 ? 2 : 1;
    const gap = r() < 0.4 ? 2 : 1;
    stops.push(`currentColor ${x}px ${x + bar}px`, `transparent ${x + bar}px ${x + bar + gap}px`);
    x += bar + gap;
  }
  return `linear-gradient(90deg,${stops.join(',')})`;
}

const RC_MIN_W = 104; // 영수증: wide enough for its head (number and time) over a short prompt
const clockHM = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** The inside of each box for the styles above (geo: each box's place, g: cell size, right edge of the screen). */
function promptDeco(tab, style, boxes, geo, g) {
  const { cw, ch } = g;
  const buf = tab.term.buffer.active;
  const cell = promptCell.cell || (promptCell.cell = buf.getNullCell());
  if (style === 'manuscript') {
    return boxes.map((bx, i) => {
      // a sheet, not a frame round the words: every prompt's squares run on to where long prompts wrap
      const n = Math.max(bx.x1 + 1, tab.term.cols - 1) - bx.x0;
      const rows = [];
      for (let y = bx.y0; y <= bx.y1; y++) {
        const line = buf.getLine(buf.viewportY + y);
        rows.push((x) => { const c = line && line.getCell(bx.x0 + x, cell); return !!c && c.getWidth() === 2; });
      }
      return msSvg(rows, n, cw, ch, geo[i].left, geo[i].top);
    });
  }
  const flats = boxes.map((bx) => boxFlat(tab, bx));
  const whole = boxes.map((bx) => PROMPT_HEAD.test(buf.getLine(buf.viewportY + bx.y0)?.translateToString(true, bx.x0) || ''));
  // a prompt cut by the bottom edge before 32 characters would pass for another one: no number for it until it shows
  const keys = flats.map((f, i) => (whole[i] && f && (f.length >= 32 || boxes[i].y1 < tab.term.rows - 1) ? f.slice(0, 32) : ''));
  if (style === 'chalk') return keys.map((k, i) => chalkBoard(k || flats[i]));
  if (style === 'approval') {
    const ap = approvalNow(tab, boxes, flats);
    return boxes.map((bx, i) => {
      const { left, w, hh } = geo[i];
      const stage = ap && ap.i === i ? ap.stage : 3;
      const anim = ap && ap.i === i ? ap.anim : null;
      // the 결재란 sits right of the text when there is room; else in the free end of the last row; else under it
      const line = buf.getLine(buf.viewportY + bx.y1);
      let end = bx.x0;
      if (line) for (let x = bx.x1; x >= bx.x0; x--) { const c = line.getCell(x, cell); if (c && c.getChars().trim()) { end = x + (c.getWidth() === 2 ? 2 : 1); break; } }
      let x; let y;
      if (left + w + 12 + AP_W + 8 <= g.right) { x = w + 12; y = (hh - AP_H) / 2; }
      else if ((end - bx.x0) * cw + 14 + AP_W <= w) { x = w - AP_W; y = hh - ch - 1; }
      else { x = w - AP_W; y = hh + 4; }
      return approvalDoc(w, hh, x, y) + approvalBox(stage, anim, x, y);
    });
  }
  const nums = queueNumbers(tab, keys.map((key, i) => ({ key, line: buf.viewportY + boxes[i].y0 })));
  if (style === 'queue') {
    return nums.map((no, i) => (no ? `<span class="qn-ticket" style="top:${(-ch + 1).toFixed(1)}px"><b>대기번호</b><em>${String(no).padStart(3, '0')}</em></span>` : ''));
  }
  // receipt
  return boxes.map((bx, i) => {
    const at = keys[i] ? promptSentAt(tab, flats[i]) : 0;
    const head = keys[i] ? `<span class="rc-head"><span>No.${String(nums[i]).padStart(4, '0')}</span><span>${at ? clockHM(at) : ''}</span></span>` : '';
    return `<span class="rc-paper" style="right:${-Math.max(9, RC_MIN_W - 9 - geo[i].w).toFixed(1)}px">${head}<i class="rc-bar" style="background-image:${barcode(keys[i] || flats[i])}"></i></span><i class="rc-cut"></i>`;
  });
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
    // through writeFramed: written straight to xterm it would overtake a frame that is still being held
    tab.pendingTimer = setTimeout(() => { if (tab.pendingEsc) { const tail = tab.pendingEsc; tab.pendingEsc = ''; writeFramed(tab, tail); } }, 40);
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
  if (DECO_PROMPTS.has(kind)) return decoPreview(kind, el, fg);
  if (OVERLAY_PROMPTS.has(kind)) {
    el.innerHTML = `<span class="pv-pbox ps-${kind}"><span class="pv-prompt" style="background:${promptTintCss(kind)};color:${fg}">❯ 버그 고쳐줘</span>${kind === 'badge' ? '<span class="pbox-badge">나</span>' : ''}</span>`;
    return () => {};
  }
  el.innerHTML = `<span class="pv-prompt" style="${style}">❯ 버그 고쳐줘</span>`;
  return () => {};
}

/**
 * 원고지 · 결재 서류 · 영수증 · 대기번호표 · 칠판 at their real size: the prompt in the terminal's own font and cell size,
 * a wide character over two cells as xterm draws it, with the very shapes the live boxes get (the picker button shows
 * the part that tells them apart).
 */
function decoPreview(kind, el, fg) {
  const small = el.classList.contains('pk-pv');
  const t = activeTab();
  const scr = t && t.host.querySelector('.xterm-screen');
  const r = scr && scr.getBoundingClientRect();
  const fs = S.settings.fontSize || 14;
  const cw = r && r.width ? r.width / t.term.cols : fs * 0.6;
  const ch = r && r.height ? r.height / t.term.rows : Math.round(fs * clampLineHeight(S.settings.lineHeight));
  const text = kind === 'chalk' || kind === 'receipt' || kind === 'manuscript' ? '❯ 고쳐줘' : '❯ 버그 고쳐줘';
  const isWide = (c) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/.test(c);
  const wideAt = []; // column → a wide character starts there
  let cols = 0;
  const cells = [...text].map((c) => {
    const n = isWide(c) ? 2 : 1;
    wideAt[cols] = n === 2;
    cols += n;
    return `<span style="width:${(n * cw).toFixed(2)}px">${c === ' ' ? '&nbsp;' : c}</span>`;
  }).join('');
  const w = cols * cw;
  const seed = `preview-${kind}`;
  let inner = '';
  let ext = [-2, w + 2, -2, ch + 2]; // how far the shapes reach around the prompt: left, right, top, bottom
  let focus = ''; // what stays in view when they do not fit: 'right' (결재란) / 'top' (영수증 head)
  if (kind === 'manuscript') { // the sheet runs on past the words, empty squares to the edge
    const n = small ? cols + 4 : Math.max(cols + (cols % 2), Math.floor(((el.clientWidth || 118) - 4) / cw));
    inner = msSvg([(x) => !!wideAt[x]], n, cw, ch, 0, 0);
    ext = [-1, n * cw + 1, -3, ch + 3];
  }
  else if (kind === 'chalk') { inner = chalkBoard(seed); ext = isLight() ? [-12, w + 12, -6, ch + 10] : [-9, w + 9, -6, ch + 6]; }
  else if (kind === 'queue') { inner = `<span class="qn-ticket" style="top:${(-ch + 1).toFixed(1)}px"><b>대기번호</b><em>017</em></span>`; ext = [-6, Math.max(w, 72), -ch + 1, ch]; focus = 'top'; }
  else if (kind === 'receipt') {
    const pr = Math.max(9, RC_MIN_W - 9 - w);
    inner = `<span class="rc-paper" style="right:${-pr}px"><span class="rc-head"><span>No.0017</span><span>${clockHM(Date.now())}</span></span><i class="rc-bar" style="background-image:${barcode(seed)}"></i></span><i class="rc-cut"></i>`;
    ext = [-9, w + pr, -14, ch + 12];
    focus = 'top';
  } else if (kind === 'approval') {
    const y = (ch - AP_H) / 2;
    inner = approvalDoc(w, ch, w + 12, y) + approvalBox(3, null, w + 12, y);
    ext = small ? [w + 11, w + 13 + AP_W, y - 1, y + AP_H + 1] : [-7, w + 12 + AP_W + 5, y - 4, y + AP_H + 4]; // the button: the 결재란 alone
    focus = 'right';
  }
  // real size in the list (cropped to the telling part); the small button fits the whole of it
  const bw = el.clientWidth || (small ? 64 : 118);
  const bh = el.clientHeight || (small ? 28 : 34);
  const [L, R, T, B] = ext;
  const z = small ? Math.min(1, (bw - 4) / (R - L), (bh - 3) / (B - T)) : 1;
  const x = R - L <= (bw - 2) / z ? (bw - (R - L) * z) / 2 - L * z : focus === 'right' ? bw - 3 - R * z : (bw - w * z) / 2;
  const y = B - T <= (bh - 1) / z ? (bh - (B - T) * z) / 2 - T * z : focus === 'top' ? 2 - T * z : (bh - ch * z) / 2;
  el.innerHTML = `<span class="pv-deco ps-${kind}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(2)}px;height:${ch.toFixed(2)}px;line-height:${ch.toFixed(2)}px;font-size:${fs}px;color:${fg}${z < 1 ? `;transform:scale(${z.toFixed(3)})` : ''}"><span class="pbox" style="left:0;top:0;width:${w.toFixed(2)}px;height:${ch.toFixed(2)}px">${inner}</span><span class="pv-cells">${cells}</span></span>`;
  el.firstChild.style.fontFamily = termFont(S.settings.fontFamily);
  return () => {};
}

/*
 * Agents redraw a frame as "hide cursor … draw … show cursor". In a long conversation one frame is big and
 * reaches us in several chunks; drawing a chunk that ends with the cursor still hidden shows a half-drawn
 * frame with the cursor gone, so the cursor flickers. Hold such a chunk until the frame closes (the cursor
 * is shown again) — at most 40 ms, so an app that keeps the cursor hidden is never held up for long.
 */
/*
 * Everything a pty prints reaches xterm through here. xterm parses in slices between frames; output that comes
 * faster piles up inside it, and past 50 MB of backlog xterm throws: that chunk is lost, and the throw used to
 * break the output handler. So count what is waiting to be parsed and hold the pty back above a high mark, until
 * xterm is down to a low mark again — a matter of milliseconds while the window is in view.
 * Never while the window is hidden (minimised, covered): Chromium throttles its timers, and once xterm is behind
 * there it parses about one slice a minute — a pty held back that long is an agent or a build standing still.
 * So nothing is held back then, as before (what xterm refuses is dropped), and whatever was held is let go.
 */
const FLOW_HIGH = 1_000_000; // characters handed to xterm and not parsed yet
const FLOW_LOW = 250_000;
function termWrite(tab, data) {
  const n = data.length;
  tab.backlog = (tab.backlog || 0) + n;
  try {
    tab.term.write(data, () => {
      tab.backlog -= n;
      if (tab.flowPaused && tab.backlog < FLOW_LOW) { tab.flowPaused = false; window.mt.pty.resume(tab.id); }
    });
  } catch { tab.backlog -= n; } // xterm refused it (its backlog limit): the chunk is lost, the handler carries on
  if (!tab.flowPaused && tab.alive && !document.hidden && tab.backlog > FLOW_HIGH) { tab.flowPaused = true; window.mt.pty.pause(tab.id); }
}
document.addEventListener('visibilitychange', () => { // hidden now: let go of every pty that is being held back
  if (!document.hidden) return;
  for (const t of S.tabs) if (t.flowPaused) { t.flowPaused = false; window.mt.pty.resume(t.id); }
});

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
  termWrite(tab, buf);
}
function flushFrame(tab) {
  tab.frameTimer = 0;
  const buf = tab.frameHeld || '';
  tab.frameHeld = '';
  if (buf) termWrite(tab, buf);
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
    // a new turn starts its clock — not the same turn going on after a choice prompt was answered (awaitChoice is
    // still set then): its short remainder would pass for an echo, and the turn would end without a 완료
    if (!tab.awaitChoice) tab.workStart = now;
    setStatus(tab, 'working');
  }
});

window.mt.pty.onExit((id, code) => {
  const tab = tabById(id);
  if (!tab) return;
  tab.alive = false;
  tab.flowPaused = false; // that pty is gone: a restart begins unpaused
  if (tab.agent) setAgent(tab, null);
  setStatus(tab, 'exited');
  flushFrame(tab); // what is still held of the last frame belongs above the banner
  tab.term.write(`\r\n\x1b[38;2;92;99;117m─── ${tr(`셸이 종료되었습니다 (코드 ${code}) · Enter: 다시 시작 · Ctrl+Shift+W: 닫기`)} ───\x1b[0m\r\n`);
  saveLayout();
});

window.mt.pty.onAgent((id, agent, sid) => {
  const tab = tabById(id);
  if (!tab) return;
  setAgent(tab, agent);
  // started on a session named on its command line (claude --resume <id>, typed by hand): that one, at once — its
  // sub-agents and background commands are read from it
  if (agent && sid && tab.sessionId !== sid) {
    tab.sessionId = sid;
    S.sessionCache.delete(normP(tab.cwd));
    saveLayout();
    if (tab.id === S.activeId) renderStatus();
    renderProjects();
  }
});

function setAgent(tab, agent) {
  if (tab.agent === agent) return;
  const prev = tab.agent;
  tab.agent = agent;
  schedulePromptBoxes(tab); // prompts drawn without a background are found by their text, which needs the agent known
  tab.oscTitle = '';
  if (agent) {
    tab.agentSince = Date.now();
    tab.workStart = Date.now();
    const launch = tab.launch && tab.launch.type === agent ? tab.launch : null;
    if (launch) {
      tab.sessionId = launch.sessionId || '';
      tab.permissionMode = launch.permissionMode || '';
    } else {
      tab.sessionId = '';
      tab.permissionMode = '';
    }
    tab.launch = null;
    tab.armed = false;
    // where it runs and on which conversation, when that is not known yet
    const typed = tab.typedCmd;
    tab.typedCmd = null;
    if (!launch && typed && Date.now() - typed.at < 60000) {
      const cont = /\b(?:claude\S*\s(?:.*\s)?(?:--continue|-c)(?=\s|$)|codex\S*\s+resume\s+--last\b)/i.test(typed.line);
      followTypedCd(tab, agent, typed.line).then(() => { if (cont && !tab.sessionId) guessContinued(tab, agent); });
    }
    if (launch && launch.mode === 'continue' && !tab.sessionId) guessContinued(tab, agent);
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
  // Already flagged — unless the tab is back at 실행 중: the earlier question was answered, and this is the next
  // one, on screen before the poll below saw a screen without a prompt. (Not while output is still arriving:
  // right after the answer the old prompt can still be on screen for a moment.)
  if (tab.awaitChoice && (tab.status !== 'working' || Date.now() - tab.lastOut < 400)) return;
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
    quietEnd(tab, now);
  }
}, 400);

/*
 * Output went quiet. A long session can be quiet in the middle of a turn (a long tool call, a slow model, an attached
 * background session that only sends what changed): when the transcript is known and says the turn goes on, it is
 * not over — that ended long tasks half way. Without a transcript, or when it says done, or when the agent stopped
 * to ask, finish as before.
 */
async function quietEnd(tab, now) {
  if (tab.agent && tab.sessionId && !screenSaysChoice(tab)) {
    if (tab.quietBusy || now - (tab.quietAt || 0) < 1500) return;
    tab.quietBusy = true;
    tab.quietAt = now;
    let state = 'unknown';
    try { ({ state } = await window.mt.agent.turn(tab.agent, tab.cwd, tab.sessionId)); } catch { /* ignore */ } finally { tab.quietBusy = false; }
    if (state === 'working' || tab.status !== 'working') return;
  }
  finishWork(tab, tab.lastOut - tab.workStart);
}

/** The agent's working timer is on screen and still ticking (a frozen, stale line doesn't count). */
function stillWorking(tab) {
  return !!tab.agent && Date.now() - tab.lastOut < 5000 && screenSaysWorking(tab);
}

/**
 * Did this turn end because the user stopped it with Esc? Yes if an Esc was noted (tab.interrupted, with its time in
 * tab.interruptedAt) and the agent's last output (tab.lastOut) came less than 5 s after that key. An Esc long before
 * the end did not stop the turn, and a flag left over from an earlier turn does not count either.
 */
const stoppedByEsc = (tab) => !!tab.interrupted && tab.lastOut - (tab.interruptedAt || 0) < 5000;

function finishWork(tab, duration, polled = false) {
  if (tab.closed) return; // its tab was closed while a check was still on its way
  if (stillWorking(tab)) return; // output paused, a bell, or the transcript looked finished — but it isn't
  if (tab.agent && screenSaysChoice(tab)) { awaitChoice(tab); return; } // quiet because it waits for an answer
  // sub-agents launched in the background keep working after the agent's own turn ends: not done until they are
  if (!polled && tab.agent && tab.sessionId && Date.now() - (tab.subPolledAt || 0) > 2000) {
    // ask, then come straight back: in a hidden window the next tick may be a minute away, and would only ask again
    const { status, workStart } = tab;
    pollSubagents(tab).then((c) => {
      if (c) renderProjects();
      if (tab.status === status && tab.workStart === workStart) finishWork(tab, duration, true); // still that turn, not ended meanwhile
    });
    return;
  }
  if (hasRunningSubs(tab)) return;
  tab.armed = false;
  tab.bannerHold = Date.now() + 3000; // the spinner line may linger a moment after the turn ends
  tab.lastDuration = duration;
  if (duration < 800) { setStatus(tab, 'ready'); return; } // just an echo / redraw
  setStatus(tab, 'done');
  const stopped = stoppedByEsc(tab); // stopped, not completed: nothing to celebrate or announce
  if (duration > 1000 && !stopped) celebrate(tab);
  if (tab.id !== S.activeId || !S.winFocused) {
    tab.unseen = true;
    updateTabEl(tab);
    if (duration > 2500 && !stopped) notifyTab(tab, `완료 (${elapsedText(duration)})`);
  }
  // the session (found only now for an agent typed by hand) is read once more: background commands the turn left
  // running show under the session from here on (the poller keeps them up to date while any runs). Also after a short
  // turn when the session is not known yet: checkTurn looks only from 2.5 s on, and a session left unknown stays in
  // 지난 대화 as if it were closed (resuming it there opened it twice).
  if (duration > 1200 || !tab.sessionId) trackSession(tab, tab.workStart - 1500).then(() => (tab.sessionId ? pollSubagents(tab) : false)).then((c) => { if (c) renderProjects(); });
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
    if (tab.closed || !tab.sessionId || tab.status !== 'working') return;
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
  // stopped to ask before its session was found (checkTurn looks only while it works): find it now, or 지난 대화
  // lists the conversation as a closed one for as long as the question waits
  if (status === 'attention' && tab.agent && !tab.sessionId) trackSession(tab, (tab.workStart || Date.now()) - 1500);
  updateTabEl(tab);
  renderSessions();
  if (tab.id === S.activeId) renderStatus();
  if (S.settings.promptStyle === 'approval') schedulePromptBoxes(tab); // 팀장 / 사장 sign as the turn starts and ends (the screen may be quiet then)
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
    // still on its own conversation (also when another tab has it open as well: `claude --resume` of one already open)
    if (tab.sessionId && ids.includes(tab.sessionId)) return;
    const claimed = new Set(S.tabs.filter((t) => t !== tab && t.agent === agent && t.sessionId).map((t) => t.sessionId));
    const mine = ids.filter((x) => !claimed.has(x));
    if (!mine.length) return;
    tab.sessionId = mine[0];
    S.sessionCache.delete(normP(tab.cwd));
    saveLayout();
    if (tab.id === S.activeId) renderStatus();
    renderProjects();
  } catch { /* ignore */ }
}

/**
 * `claude --continue` / `codex resume --last` go on with the folder's latest conversation, but which one that is used
 * to show only after the first turn (trackSession): until then 지난 대화 offered it as a closed one, and resuming it
 * there opened it a second time. Take the latest one at once; a wrong guess is put right by trackSession after a turn.
 */
async function guessContinued(tab, agent) {
  let list = [];
  try { list = await window.mt.agent.sessions(tab.cwd, 40); } catch { /* ignore */ }
  const s = list.find((x) => x.agent === agent);
  if (!s || tab.sessionId || tab.agent !== agent || tab.closed) return;
  tab.sessionId = s.id;
  saveLayout();
  if (tab.id === S.activeId) renderStatus();
  renderProjects();
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
  const sub = `<span class="cc-place no-i18n">${esc(tabPlace(t))}</span>`;
  return `
    <div class="cur-card${agent ? ' ' + agent : ' shell'} st-${t.status}${t.id === S.activeId ? ' focused' : ''}${t.unseen ? ' unseen' : ''}" data-cur="${t.id}" title="${esc(t.cwd)}">
      <span class="cc-ico">${icon(tabIconName(t))}</span>
      <span class="cc-text">
        <span class="cc-title no-i18n">${esc(tabLabel(t))}</span>
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

/** A session's row; its sub-agents and background commands under it unless its task in 진행 중 shows them (`subs` false). */
function sessionRowHtml(t, subs = true) {
  return `
    <div class="item child run st-${t.status}${t.id === S.activeId ? ' active' : ''}${t.unseen ? ' unseen' : ''} agent-${t.agent}" data-t="${t.id}" title="${esc(AGENTS[t.agent].name)} · ${esc(t.cwd)}">
      <span class="child-ico">${icon(t.agent)}<i class="dot"></i></span>
      <span class="item-text">
        <span class="item-name no-i18n">${esc(tabLabel(t))}</span>
        ${t.awaitChoice ? `<span class="item-sub has-bubble">${choiceBubbleHtml()}</span>` : `<span class="item-sub">${esc(AGENTS[t.agent].name)} · ${statusHtml(t)}</span>`}
      </span>
      <span class="item-actions"><button class="icon-btn danger" data-a="end" title="세션 종료">${icon('stop')}</button></span>
    </div>${!subs ? '' : (t.status === 'working' || hasRunningSubs(t) ? subagentRowsHtml(t) : '') + bgRowsHtml(t)}`;
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

const SUBAGENT_KIND = { 'general-purpose': '범용', claude: '범용', shell: '명령', fork: '분신', explore: '탐색', plan: '계획', 'statusline-setup': '설정', 'claude-code-guide': '안내', 'code-reviewer': '리뷰', 'test-runner': '테스트' };
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
        const w = MINION_WORK[minionHash((a.look || a.id) + ':work') % MINION_WORK.length];
        const live = a.status === 'running';
        const paint = MINION_COLORS[minionHash((a.look || a.id) + ':paint') % MINION_COLORS.length];
        const fx = live ? Array.from({ length: MINION_FX[w] || 0 }, (_, i) => `<i class="mfx f${i}"></i>`).join('') : '';
        const fresh = a.status === 'done' && !!(tab.subCheer && tab.subCheer.has(a.id));
        return `<span class="minion mw-${w}${fresh ? ' mn-cheer' : ''}" style="--paint:${paint}">${minionSvg(a.look || a.id, live ? w : '')}${live ? MINION_PROPS[w] : ''}${fx}${badge(a)}</span>`;
      })()}
      <span class="sa-text"><b>${esc(subagentKind(a.kind))}</b>${a.name ? `<span class="sa-sum no-i18n">(${esc(a.name)})</span>` : ''}</span>
      <span class="sa-state">${a.status === 'running' ? '<i></i><i></i><i></i>' : a.status === 'failed' ? icon('x') : ''}</span>
    </div>`).join('');
  if (tab && tab.subCheer && tab.subCheer.size) { for (const id of tab.subCheer) tab.subCheered.add(id); tab.subCheer.clear(); }
  return rows;
}

// sub-agents hold their task in 진행 중; background commands don't (the agent's turn ends, they go on beside it)
const hasRunningSubs = (tab) => !!(tab.subagents && tab.subagents.some((a) => a.status === 'running'));
const runningBg = (tab) => (tab.bgTasks || []).filter((a) => a.status === 'running' && !(tab.bgStopped && tab.bgStopped.has(a.id)));
const hasRunningBg = (tab) => runningBg(tab).length > 0;

/**
 * 백그라운드 작업: commands the agent left running in the background, listed under the agent's row wherever it is
 * (its task in 진행 중, or the session in 입력 대기 once its turn is over) for as long as they run. Clicking one opens
 * its output in a tab of its own; hovering shows a stop button.
 */
function bgRowsHtml(tab) {
  return runningBg(tab).map((a) => `
    <div class="item child subagent bgtask" data-bg="${tab.id}" data-bgid="${esc(a.id)}" title="${esc(a.name)}${a.cmd && a.cmd !== a.name ? '\n' + esc(a.cmd.slice(0, 300)) : ''}">
      <span class="bg-ico">${icon('terminal')}</span>
      <span class="sa-text"><b>백그라운드 작업</b>${a.name ? `<span class="sa-sum no-i18n">(${esc(a.name)})</span>` : ''}</span>
      <span class="bg-time elapsed" data-since="${a.start}">${elapsed(a.start)}</span>
      <span class="item-actions"><button class="icon-btn danger" data-a="bgstop" title="작업 종료">${icon('stop')}</button></span>
    </div>`).join('');
}
/** Show a background command's output as it grows, in a tab of its own (one per command). */
async function openBgTask(tab, a) {
  const open = S.tabs.find((t) => t.bgView === a.id && t.alive);
  if (open) return activate(open.id);
  const file = a.task ? await window.mt.agent.bgOutput(tab.sessionId, a.task) : '';
  if (!file) { toast('이 작업의 출력 파일을 찾지 못했습니다', { icon: 'info' }); return; }
  const view = createTab({ cwd: tab.cwd, customTitle: `백그라운드 · ${a.name || a.task}` });
  view.bgView = a.id;
  const Q = String.fromCharCode(39); // a single quote (kept out of literals: the phrase extractor reads them as strings)
  let cmd = `tail -n 300 -f ${Q}${file.split(Q).join(Q + '\\' + Q + Q)}${Q}`;
  if (IS_WIN) { // a short line: the script is a file (or, failing that, the whole of it encoded on the line)
    const ps1 = a.task ? await window.mt.agent.bgScript(a.task, bgFollowScript(file)) : '';
    cmd = ps1 ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"` : `powershell -NoProfile -EncodedCommand ${psEncoded(bgFollowScript(file))}`;
  }
  const t0 = Date.now(), go = () => { // the shell starts a moment after its tab
    if (view.closed) return;
    if ((view.alive && view.status !== 'starting') || Date.now() - t0 > 6000) runInTab(view, cmd);
    else setTimeout(go, 150);
  };
  go();
}
/*
 * Windows: follow the output file in PowerShell. Its bytes are whatever the command printed: UTF-8 from most tools,
 * the console's code page (CP949 on a Korean Windows) from Windows' own (ping, dir…) — read as UTF-8 they came out
 * as ◆◆◆. So the first 64 KB decide: valid UTF-8 → UTF-8, else the system's ANSI code page; a decoder carries a
 * character split between two reads over.
 */
function bgFollowScript(file) {
  const Q = String.fromCharCode(39), p = Q + file.split(Q).join(Q + Q) + Q;
  return [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    `$p = ${p}`,
    '$fs = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)',
    '$len = $fs.Length; $pos = [Math]::Max(0, $len - 65536); $probe = New-Object byte[] ([Math]::Min(65536, $len))',
    '$fs.Seek(0, 0) | Out-Null; $n0 = $fs.Read($probe, 0, $probe.Length)',
    '$enc = [Text.Encoding]::Default',
    'try { (New-Object Text.UTF8Encoding($false, $true)).GetString($probe, 0, $n0) | Out-Null; $enc = New-Object Text.UTF8Encoding($false, $false) } catch { }',
    '$dec = $enc.GetDecoder(); $buf = New-Object byte[] 65536; $chars = New-Object char[] 131072',
    'while ($true) {',
    '  $fs.Seek($pos, 0) | Out-Null',
    '  while (($n = $fs.Read($buf, 0, $buf.Length)) -gt 0) { $pos += $n; $c = $dec.GetChars($buf, 0, $n, $chars, 0); [Console]::Out.Write($chars, 0, $c) }',
    '  Start-Sleep -Milliseconds 300',
    '}',
  ].join('\n');
}
/** A PowerShell script as -EncodedCommand takes it: base64 of its UTF-16LE text (no quoting to get wrong). */
function psEncoded(script) {
  let bin = '';
  for (let i = 0; i < script.length; i++) { const c = script.charCodeAt(i); bin += String.fromCharCode(c & 255, c >> 8); }
  return btoa(bin);
}
/** End a background command: its row goes at once; it comes back if the command could not be found. */
async function stopBgTask(tab, a) {
  tab.bgStopped = tab.bgStopped || new Set();
  tab.bgStopped.add(a.id);
  renderProjects();
  let ok = false;
  try { ok = await window.mt.agent.bgStop(tab.id, tab.sessionId, a.cmd || '', a.task || ''); } catch { /* ignore */ }
  if (ok) { toast(`백그라운드 작업을 종료했습니다: ${a.name || a.task}`, { icon: 'stop' }); return; }
  tab.bgStopped.delete(a.id);
  renderProjects();
  toast('이 작업을 찾지 못해 종료하지 못했습니다', { icon: 'info' });
}
/** Take a fresh sub-agent list; returns true if anything changed. */
function applySubagents(tab, list) {
  const key = JSON.stringify(list.map((a) => [a.id, a.status, a.name]));
  if (key === tab.subKey) return false;
  tab.bgTasks = list.filter((a) => a.kind === 'shell');
  list = list.filter((a) => a.kind !== 'shell');
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
    const live = tab.agent && tab.sessionId && (tab.status === 'working' || tab.status === 'attention' || hasRunningSubs(tab) || hasRunningBg(tab));
    if (!live) {
      if ((tab.subagents && tab.subagents.length) || (tab.bgTasks && tab.bgTasks.length)) { tab.subagents = []; tab.bgTasks = []; tab.subKey = ''; changed = true; }
      continue;
    }
    if (await pollSubagents(tab)) changed = true;
  }
  if (changed) renderProjects();
}, 1500);

function taskRowHtml(k) {
  const live = RUNNING_TASK.has(k.status);
  const tb = tabById(k.tabId);
  // sub-agents and background commands hang under the task while it runs; once the turn is over, under the
  // session in 입력 대기 (sessionRowHtml), never under a task in 완료
  const showSubs = live && !!tb;
  const time = live
    ? (k.status === 'working' ? ` · <span class="elapsed" data-since="${k.start}">${elapsed(k.start)}</span>` : '')
    : `${k.start && k.end > k.start ? ' · ' + elapsedText(k.end - k.start) : ''} · ${relTime(k.end || k.start)}`; // (one cut off by a restart has no known end: no "1초")
  return `
    <div class="item child task st-${k.status === 'pending' ? 'working' : k.status} agent-${k.agent}" data-task="${k.id}" title="${esc(k.text)}">
      <span class="child-ico">${icon(AGENTS[k.agent]?.icon || 'terminal')}${live ? '<i class="dot"></i>' : ''}</span>
      <span class="item-text">
        <span class="item-name no-i18n">${esc(k.text)}</span>
        <span class="item-sub">${live && tabById(k.tabId) && tabById(k.tabId).awaitChoice
          ? choiceBubbleHtml()
          : `<span class="tk ${k.status}">${TASK_TEXT[k.status]}</span>${time}`}</span>
      </span>
      <span class="item-actions"><button class="icon-btn go-prompt" data-a="goto" title="이 작업의 프롬프트로 이동"${JUMP_OK.get(k.id) ? '' : ' hidden'}>${icon('arrowUp')}</button>${k.status === 'attention' ? `<button class="icon-btn" data-a="unflag" title="확인 필요 해제">${icon('check')}</button>` : ''}${live ? '' : `<button class="icon-btn danger" data-a="forget" title="목록에서 지우기">${icon('x')}</button>`}</span>
    </div>${showSubs ? subagentRowsHtml(tb) + bgRowsHtml(tb) : ''}`;
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
  // the box the user opened is gone (its agent exited, its project was removed): follow the tab in front again,
  // rather than keep every box closed ('' — closed by the user — stays as it is)
  if (S.openFolder && !groups.some((g) => g.id === S.openFolder)) S.openFolder = null;
  // which project owns a folder is worked out once per render: every folder box asks it for every tab and task
  const owners = new Map();
  const ownerOf = (cwd) => { let o = owners.get(cwd); if (o === undefined) { o = ownerProject(cwd); owners.set(cwd, o); } return o; };

  let html;
  if (!groups.length) {
    html = `<div class="sb-empty"><span data-i18n-html="sbEmpty">터미널에서 <b>claude</b> 나 <b>codex</b> 를 실행하면<br>그 폴더와 에이전트가 여기에 나타나요.</span><br><br><button data-action="add-project">+ 프로젝트 폴더 추가</button></div>`;
  } else {
    html = groups.map((p) => folderHtml(p, agents, ownerOf)).join('');
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
  const list = cached.list.filter((x) => !tabOfSession(x.id));
  if (!list.length) return `<div class="children"><div class="child-note slim">지난 대화가 없습니다</div></div>`;
  const rows = list.slice(0, 8).map((s) => `
      <div class="past-row agent-${s.agent}" data-s="${s.id}" data-agent="${s.agent}" data-cwd="${esc(p.path)}"
           title="${esc(AGENTS[s.agent].name)} · ${esc(s.title)}${s.branch ? ' · ' + esc(s.branch) : ''}${s.lastPrompt ? '\n마지막 프롬프트: ' + esc(s.lastPrompt) : ''}">
        <span class="pr-dot"></span>
        <span class="pr-ico">${icon(AGENTS[s.agent].icon)}</span>
        <span class="pr-title${s.title === '(제목 없음)' ? '' : ' no-i18n'}">${esc(s.title)}</span>
        <span class="pr-time">${relTime(s.mtime)}</span>
        <span class="pr-actions">
          <button class="icon-btn go" data-a="resume" title="이 대화 이어서">${icon('play')}</button>
          <button class="icon-btn danger" data-a="delete" title="휴지통으로">${icon('trash')}</button>
        </span>
      </div>`).join('');
  // (the sidebar reads the 40 newest: at that many there may be more, which the full list shows)
  const more = `<button class="past-more" data-more="${p.id}">${icon('search')}${list.length > 8 ? `모든 대화 보기 · ${list.length}${cached.list.length >= 40 ? '+' : ''}개` : '대화 검색'}</button>`;
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
function folderHtml(p, agents, ownerOf = ownerProject) {
  const inFolder = (cwd) => (p.temp ? samePath(cwd, p.path) : ownerOf(cwd) === p);
  const sessions = agents.filter((t) => inFolder(t.cwd));
  const openTabs = S.tabs.filter((t) => inFolder(t.cwd));
  const gridOn = S.grid && samePath(S.grid, p.path);

  // which box is open: the user's choice, else the folder of the tab in front
  const active = activeTab();
  const open = S.openFolder != null ? S.openFolder === p.id : !!(active && inFolder(active.cwd));

  // past conversations: read for the open box only (a closed one shows none of it, and each read walks the agents'
  // session folders), and read again once it is old — its count shows even while 지난 대화 is folded
  const cached = !p.temp && S.sessionCache.get(normP(p.path));
  if (!p.temp && open && (!cached || Date.now() - cached.at > 15000) && !S.loadingHistory.has(p.path)) {
    S.loadingHistory.add(p.path);
    sessionsFor(p.path, true).finally(() => { S.loadingHistory.delete(p.path); renderSessions(); });
  }

  // the lists inside a box are built for the open one only (a closed box shows just its head)
  const past = open && cached ? cached.list.filter((x) => !tabOfSession(x.id)) : null;
  const tasks = open ? S.tasks.filter((k) => inFolder(k.path)) : [];
  // a task whose agent stopped to ask the user steps over to 입력 대기 (with its bubble) until answered
  const asking = (k) => { const tb = tabById(k.tabId); return !!(tb && tb.awaitChoice); };
  const running = tasks.filter((k) => RUNNING_TASK.has(k.status) && !asking(k)).reverse();
  const finished = tasks.filter((k) => !RUNNING_TASK.has(k.status)).reverse();
  const runningTabs = new Set(running.map((k) => k.tabId));
  const waiting = sessions.filter((t) => t.status !== 'working'); // incl. one waiting for a choice (shows the bubble)
  const workingNoTask = sessions.filter((t) => t.status === 'working' && !runningTabs.has(t.id));
  const runCount = running.length + workingNoTask.length;

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
            ${past ? `<span class="ph-count">${past.length}${cached.list.length >= 40 ? '+' : ''}</span>` : ''}
            <span class="ph-chev">${icon('chevronDown')}</span>
          </button>
          ${histOpen ? historyHtml(p) : ''}
        </div>`;
    }
    const wait = sectionToggle('wait', p.id, '입력 대기', waiting.length, true);
    inner += wait.html;
    if (wait.open) {
      inner += `<div class="children">${waiting.length
        ? waiting.map((t) => sessionRowHtml(t, !runningTabs.has(t.id))).join('') // its task in 진행 중 shows them
        : `<div class="child-note slim">${sessions.length ? '모든 세션이 작업 중입니다' : '<span data-i18n-html="folderEmpty">이 폴더에서 <b>claude</b> / <b>codex</b> 를 실행하면 여기에 나타납니다</span>'}</div>`}</div>`;
    }
    const run = sectionToggle('run', p.id, '진행 중', runCount, true);
    inner += run.html;
    if (run.open) {
      inner += `<div class="children">${runCount
        ? running.map(taskRowHtml).join('') + workingNoTask.map((t) => sessionRowHtml(t)).join('')
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
          <span class="fb-name no-i18n">${esc(p.name)}</span>
          <span class="fb-path">${p.temp ? '프로젝트 아님 · ' : ''}<span class="no-i18n">${esc(prettyPath(p.path))}</span></span>
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
    if (task) canJumpToTask(task).then((ok) => {
      JUMP_OK.set(task.id, ok); // remembered: the sidebar re-renders often, and a re-render must not hide it again
      const cur = projects.querySelector('[data-task="' + task.id + '"] [data-a="goto"]') || btn;
      if (cur) cur.hidden = !ok;
    });
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
    const bgRow = e.target.closest('[data-bgid]');
    if (bgRow) {
      const tb = tabById(bgRow.dataset.bg), a = tb && (tb.bgTasks || []).find((x) => x.id === bgRow.dataset.bgid);
      if (!tb || !a) return;
      if (e.target.closest('[data-a="bgstop"]')) return stopBgTask(tb, a);
      return openBgTask(tb, a);
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
          <span class="item-name${x.title && x.title !== '(제목 없음)' ? ' no-i18n' : ''}">${esc(x.title || '(제목 없음)')}</span>
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
  const openTab = tabOfSession(s.id);
  const A = AGENTS[s.agent];
  // two whole sentences rather than one with an optional word: each is a phrase the translations can match
  const ask = openTab
    ? `${A.name} 대화 '${s.title}'을(를) 종료하고 휴지통으로 옮길까요?`
    : `${A.name} 대화 '${s.title}'을(를) 휴지통으로 옮길까요?`;
  const ok = await confirmDialog(
    openTab ? '세션 종료 후 삭제' : '대화 삭제',
    `${ask}\n휴지통에서 복원하거나 영구 삭제할 수 있습니다.`,
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
  if (typeof syncTitleActions === 'function' && S.progress) syncTitleActions();
  if (typeof composerHint === 'function') requestAnimationFrame(composerHint); // the input hint follows the status (shown only while the agent waits)
  const kind = $('#st-kind');
  const cwd = $('#st-cwd');
  const st = $('#st-status');
  const stc = $('#st-composer'); // always there, so it can be found; quiet outside a Claude / Codex tab
  stc.classList.toggle('idle', !(t && t.agent));
  stc.title = t && t.agent ? '프롬프트 작성기 (Ctrl+Shift+E)' : '프롬프트 작성기 · Claude 또는 Codex 탭에서 쓸 수 있어요';
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
      <span class="item-text"><span class="item-name no-i18n">${esc(p.name)}</span><span class="item-sub no-i18n">${esc(prettyPath(p.path))}</span></span>
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
  const open = tabOfSession(sessionId);
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
    // its agents had a temporary box ("프로젝트로 추가" on it): that box stays open, its sections as they were
    if (S.openFolder && S.openFolder.startsWith('tmp:') && isInside(S.openFolder.slice(4), folder)) S.openFolder = p.id;
    const tmp = 'tmp:' + normP(folder);
    for (const set of [S.secOpen, S.secClosed]) for (const k of [...set]) if (k.endsWith(':' + tmp)) { set.delete(k); set.add(k.slice(0, -tmp.length) + p.id); }
  }
  renderProjects(); // history stays collapsed until the project row is clicked
  updateEmpty();
  return p;
}

async function removeProject(p) {
  const ok = await confirmDialog('프로젝트 제거', `'${p.name}'을(를) 목록에서 제거할까요?\n폴더와 대화 기록은 삭제되지 않습니다.`, '제거');
  if (!ok) return;
  S.projects = S.projects.filter((x) => x.id !== p.id);
  if (S.openFolder === p.id) S.openFolder = null; // its box is gone: follow the tab in front again (else none stays open)
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
  if (!t || !t.agent || !t.alive) return toast('Claude 또는 Codex 실행 중인 탭에서 사용할 수 있어요', { icon: 'info' });
  if (t.awaitChoice) return toast('선택이 필요해요', { icon: 'info' }); // its Enter would pick the highlighted answer
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
    t.term.options.fontFamily = termFont(S.settings.fontFamily);
    t.term.options.fontSize = S.settings.fontSize;
    t.term.options.lineHeight = clampLineHeight(S.settings.lineHeight);
  }
  applyAppearance();
  for (const t of S.tabs) fitTab(t);
  renderStatus();
  promptLookCheck();
  if (S.progress && S.progress.open) postProgressTheme(); // the open progress page follows theme / accent / light-dark
}

/*
 * Prompt colours are rewritten as output arrives (filterOutput), so prompts already on screen keep the look of the
 * settings they were drawn with. When that look changes (내 프롬프트 표시, colour theme, accent, light / dark), ask the
 * agents to repaint, as a light / dark switch already does. Debounced: a picker can change it several times a second.
 */
let promptLook = '';
let promptLookTimer = 0;
function promptLookCheck() {
  const look = `${promptReplacement(S.settings.promptStyle || 'default')}|${isLight()}|${rgbCss(BASE_STAGE)}`;
  if (look === promptLook) return;
  const first = !promptLook;
  promptLook = look;
  if (first) return;
  clearTimeout(promptLookTimer);
  promptLookTimer = setTimeout(() => { if (performance.now() - (redrawAgents.at || 0) > 600) redrawAgents(); }, 350);
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
  setTimeout(() => { const tiles = currentView().tiles; (tiles.length ? tiles : [activeTab()]).forEach(fitTab); }, 220);
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
  // stopPropagation: focus is still in the terminal (a right-click doesn't move it), which would send this Esc to the agent
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOverlay(); } };
  window.addEventListener('keydown', onKey, true);
  S.overlay = { nodes: [scrim, menu], cleanup: () => window.removeEventListener('keydown', onKey, true) };
}

function agentQuickItems(t) {
  if (!t || !t.agent) return [];
  const A = AGENTS[t.agent];
  return [
    { icon: 'edit', text: '프롬프트 작성기', hint: 'Ctrl+Shift+E', run: openComposer },
    // like a typed Esc (see term.onData): the task ends as 중단, and finishWork does not celebrate it
    { icon: 'x', text: '작업 중단 (Esc)', run: () => { if (!t.alive) return; if (t.status === 'working' || t.status === 'attention' || t.awaitChoice) { t.interrupted = true; t.interruptedAt = Date.now(); } window.mt.pty.write(t.id, '\x1b'); } },
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
    { icon: 'x', text: '다른 탭 모두 닫기', disabled: S.tabs.length < 2, run: async () => { for (const t of S.tabs.filter((x) => x !== tab)) await closeTab(t.id); } }, // one by one: a working agent asks first, as when closed alone
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
const MAX_TASKS = 400; // kept in memory and on disk
let taskSaveTimer = null;
function saveTasks() {
  clearTimeout(taskSaveTimer);
  taskSaveTimer = setTimeout(() => {
    const keep = S.tasks.filter((k) => k.status !== 'pending').slice(-MAX_TASKS)
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

/** A prompt is being submitted: typed in the terminal (read from the screen), or `sent` by the app itself (the composer). */
function onAgentEnter(tab, sent) {
  const before = sent == null ? tab.statusBeforeInput : tab.status;
  const old = tab.taskId && taskById(tab.taskId);
  // answering a question / menu while a task runs: part of the current task, not a new one
  // (a typed answer: its first key already put the tab back to 입력 대기, but the task still waits on the choice on screen)
  if (before === 'working' || before === 'attention' || (tab.awaitChoice && old && old.status === 'attention')) return;
  const text = sent == null ? promptText(tab) : String(sent).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return;
  // the tab's previous task never ended (its question was dropped, its Enter started nothing): it must not stay in 진행 중
  if (old && RUNNING_TASK.has(old.status)) {
    if (old.status === 'pending') S.tasks = S.tasks.filter((k) => k !== old);
    else { old.status = old.status === 'attention' && !tab.interrupted ? 'done' : 'stopped'; old.end = Date.now(); saveTasks(); } // (Esc at its question: stopped)
  }
  if (/^\/(?:exit|quit)$/i.test(text)) { tab.taskId = ''; renderSessions(); return; } // ends the agent: no work, no task
  const task = { id: uuid(), tabId: tab.id, agent: tab.agent, path: tab.cwd, text, status: 'pending', start: Date.now(), end: 0, sessionId: tab.sessionId || '', sent: Date.now() };
  S.tasks.push(task);
  if (S.tasks.length > MAX_TASKS) { const i = S.tasks.findIndex((k) => !RUNNING_TASK.has(k.status)); if (i >= 0) S.tasks.splice(i, 1); } // the oldest finished one goes
  tab.taskId = task.id;
  tab.interrupted = false;
  // an Enter that starts no work at all (a local command, a menu) is not a task: don't leave it at 대기
  setTimeout(() => {
    if (task.status !== 'pending') return;
    S.tasks = S.tasks.filter((k) => k !== task);
    if (tab.taskId === task.id) tab.taskId = '';
    renderSessions();
  }, 15000);
  renderSessions();
}

/** Keep the tab's current task in step with the agent's status. */
function syncTask(tab, status) {
  const task = tab.taskId && taskById(tab.taskId);
  if (!task || task.status === 'done' || task.status === 'stopped') return;
  if (status === 'working') {
    if (task.status !== 'working') saveTasks(); // on disk from the moment it runs: one still running at quit comes back as 중단
    task.status = 'working';
    task.start = tab.workStart || task.start;
  } else if (status === 'attention') {
    task.status = 'attention';
    task.asked = true; // it got as far as a question: real work, however short the rest turns out to be
  } else if (status === 'shell' && /^\/?(?:exit|quit)$/i.test(String(task.text).trim())) {
    // the command that ended the agent ("/exit"): no work of its own, not a task cut short (it showed as 중단)
    S.tasks = S.tasks.filter((k) => k !== task);
    tab.taskId = '';
    saveTasks();
  } else if (status === 'done' || status === 'exited' || status === 'shell' || (status === 'ready' && task.status === 'working' && task.asked)) {
    task.status = (status === 'done' || status === 'ready') && !stoppedByEsc(tab) ? 'done' : 'stopped'; // the same rule finishWork celebrates by
    task.end = Date.now();
    task.sessionId = tab.sessionId || task.sessionId;
    refineTask(tab, task);
    saveTasks();
  } else if (status === 'ready' && (task.status === 'pending' || task.status === 'working')) {
    // Enter that never started any work — or only a redraw that looked like work (under 800 ms, see finishWork)
    S.tasks = S.tasks.filter((k) => k !== task);
    tab.taskId = '';
    saveTasks();
  }
}

/** Replace the screen-scraped title with the prompt recorded in the session transcript. */
async function refineTask(tab, task) {
  await new Promise((r) => setTimeout(r, 1500)); // let trackSession find the session first
  const sid = tab.sessionId || task.sessionId;
  if (!sid) return;
  task.sessionId = sid;
  const real = await window.mt.agent.lastPrompt(task.agent, tab.cwd, sid);
  // a plain string, or { text, ts } once the main process also sends when that prompt was recorded
  const text = real && typeof real === 'object' ? real.text : real;
  const ts = real && typeof real === 'object' ? Number(real.ts) || 0 : 0;
  // The transcript's last prompt is this task's own only if it was sent when the task began: not before (the
  // previous task's prompt: "/exit" must not be renamed after it) and not long after (an answer, a follow-up).
  const mine = !String(task.text).startsWith('/') && (!ts || !task.sent || (ts >= task.sent - 1000 && ts <= task.sent + 30000));
  if (text && !String(text).startsWith('/') && mine) task.text = String(text).slice(0, 200);
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
/** The open tab a task belongs to: its own tab, or (after a restart) the tab now showing its conversation. */
const taskTab = (task) => (task.tabId && tabById(task.tabId)) || (task.sessionId && S.tabs.find((t) => t.alive && t.sessionId === task.sessionId)) || null;
/** taskId → can its prompt be jumped to (checked on hover, kept so re-renders show the button at once) */
const JUMP_OK = new Map();
const promptNeedle = (task) => String(task.text || '').replace(/\s+/g, '').slice(0, 24);
const flatText = (t) => t.replace(/\s+/g, '');

/** Row of the prompt within the rows now on screen, or -1. */
function visiblePromptRow(tab, needle) {
  const buf = tab.term.buffer.active;
  const top = buf.viewportY;
  const lim = tab.term.rows - (buf.type === 'alternate' ? 3 : 0); // leave Claude's own input box out
  const rows = [];
  for (let r = 0; r < lim; r++) { const l = buf.getLine(top + r); rows.push(l ? flatText(l.translateToString(true)) : ''); }
  for (let r = 0; r < lim; r++) {
    // the prompt starts on this row; a long or several-line one runs on over the rows below (wrapped by the
    // terminal, or drawn that way by the agent: "❯ first line" + indented lines)
    const at = rows[r] ? (rows[r] + (rows[r + 1] || '') + (rows[r + 2] || '')).indexOf(needle) : -1;
    if (at >= 0 && at < rows[r].length) return r;
  }
  return -1;
}

/** Normal screen: the scrollback line of the prompt (searched from the bottom), or null. */
function findTaskPrompt(task) {
  const tab = taskTab(task);
  if (!tab || !tab.alive || !tab.term) return null;
  const buf = tab.term.buffer.active;
  if (buf.type !== 'normal') return null;
  const needle = promptNeedle(task);
  if (needle.length < 4) return null;
  const bottom = buf.baseY + buf.cursorY;
  const lineText = (i) => { const l = buf.getLine(i); return l ? flatText(l.translateToString(true)) : ''; };
  let below = ['', '']; // the two lines under the current one: a long or several-line prompt runs on over them
  for (let i = buf.length - 1; i >= 0; i--) {
    const head = lineText(i);
    const at = head ? (head + below[0] + below[1]).indexOf(needle) : -1;
    below = [head, below[0]];
    if (at < 0 || at >= head.length) continue; // the prompt has to start on this line
    if (task.status !== 'done' && task.status !== 'stopped' && i >= bottom - 1) continue; // the live input line
    return { tab, line: i };
  }
  return null;
}

/** Can the jump button be offered for this task? */
async function canJumpToTask(task) {
  const tab = taskTab(task);
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

let jumpRun = 0; // the prompt search in progress (starting another one ends it)
async function gotoTaskPrompt(task) {
  const tab = taskTab(task);
  const fail = () => { JUMP_OK.set(task.id, false); toast('프롬프트가 더 이상 화면 기록에 없습니다'); renderProjects(); };
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
  // The wheel reports go to whatever runs in the tab, so the search ends at once when that is no longer the agent's
  // transcript in front of the user: the agent exited (the reports would be typed into the shell), another tab came
  // to the front, the user typed, or another search started.
  const run = ++jumpRun;
  const typedAt = tab.lastIn;
  const live = () => run === jumpRun && tab.alive && !!tab.agent && S.activeId === tab.id && tab.lastIn === typedAt
    && tab.term.buffer.active.type === 'alternate' && tab.term.modes.mouseTrackingMode !== 'none';
  // the transcript rows (not the agent's spinner and input box at the bottom, which change by themselves)
  const frame = () => { const b = tab.term.buffer.active; let s = ''; for (let r = 0; r < Math.max(3, tab.term.rows - 8); r++) s += `${b.getLine(b.viewportY + r)?.translateToString(true) || ''}\n`; return s; };
  let found = visiblePromptRow(tab, needle);
  for (const up of [true, false]) { // up to the top, then back down to the bottom
    let seen = frame();
    for (let i = 0, still = 0; found < 0 && i < (up ? 160 : 320) && still < 6; i++) { // 6 steps without a change: that end is reached
      if (!live()) return;
      wheel(up); wheel(up);
      await settle();
      if (!live()) return;
      found = visiblePromptRow(tab, needle);
      const now = frame();
      still = now === seen ? still + 1 : 0;
      seen = now;
    }
  }
  if (found < 0) return fail();
  // bring it a little below the top so the answer under it shows too
  if (found < 2) { wheel(false); await settle(); if (!live()) return; found = Math.max(0, visiblePromptRow(tab, needle)); }
  markPromptRow(tab, found);
}

/** "확인 필요" that never cleared: look at the screen again and put the task where it really is. */
function unflagTask(task) {
  const tab = taskTab(task);
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

async function openTask(task) {
  const tab = (task.tabId && tabById(task.tabId)) || tabOfSession(task.sessionId);
  if (tab) return activate(tab.id);
  if (task.sessionId) {
    // its conversation may have gone to the trash since: resuming it would only fail, in a new tab
    let ok = true;
    try { ok = await window.mt.agent.has(task.agent, task.path, task.sessionId); } catch { /* try anyway */ }
    if (ok) return resumeSession(task.agent, task.path, task.sessionId);
    toast('대화 파일을 찾지 못했습니다', { icon: 'info' });
  }
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

/** The command line the cursor is on, with the rows it wrapped from (a long `cd /d … && claude` takes several). */
function typedLine(tab) {
  try {
    const b = tab.term.buffer.active;
    let y = b.baseY + b.cursorY;
    let s = b.getLine(y)?.translateToString(true) || '';
    for (let n = 0; n < 20 && y > 0 && b.getLine(y)?.isWrapped; n++) s = (b.getLine(--y)?.translateToString(false) || '') + s;
    return s;
  } catch { return ''; }
}

/**
 * An agent typed after a change of folder on the same line (`cd /d X && claude`) runs in X, but the shell says so
 * only with its next prompt, once the agent has exited: move the tab there now, or the sidebar would file the agent,
 * its tasks and its sessions under the folder the tab was in before.
 */
async function followTypedCd(tab, agent, line) {
  const sh = S.shells.find((s) => s.id === tab.shellId);
  let dir = '';
  try { dir = await window.mt.agent.cdTarget(tab.cwd, line, sh ? sh.type : ''); } catch { /* ignore */ }
  if (!dir || tab.closed || tab.agent !== agent || samePath(dir, tab.cwd)) return;
  setCwd(tab, dir);
  if (tab.sessionId) S.sessionCache.delete(normP(dir)); // a session named on its command line: not a past one there
}

function openProjectMenu(p, x, y) {
  openMenu([
    { label: p.name },
    { icon: 'palette', text: '아이콘 변경…', run: () => openProjectIconPicker(p) },
    { icon: 'terminal', text: '터미널 열기', run: () => newShell(null, p.path) },
    { icon: 'progress', text: '진행도 보기', run: () => openProgress(p.path, p.name) },
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

/* ------------------------------------------------------------------ */
/* 진행도 보기: a folder's progress page (minsuterm-progress) over the  */
/* terminal area. The page is served by the main process (progress.js) */
/* and themed with MinsuTerm's colours through postMessage.            */
/* ------------------------------------------------------------------ */

S.progress = { open: false, path: '', name: '', origin: '', key: '', skipSetup: false, poll: 0, seq: 0 };
const PG = {
  view: $('#progress-view'),
  frame: $('#progress-view .pg-frame'),
  chip: $('#progress-view .pg-chip'),
  hint: $('#progress-view .pg-hint'),
  setup: $('#progress-view .pg-setup'),
  loading: $('#progress-view .pg-loading'),
  error: $('#progress-view .pg-error'),
};

function pgChip(state, text) {
  PG.chip.dataset.state = state;
  PG.chip.querySelector('.pg-chip-text').textContent = text;
}
function pgShow(which) { // one body state at a time: setup / loading / error / frame
  for (const k of ['setup', 'loading', 'error']) PG[k].hidden = which !== k;
  PG.frame.hidden = which !== 'frame';
}

/** MinsuTerm's look, for the page: its own variables take these (vars), its palette follows dark, its text the fonts. */
function progressTheme() {
  // resolved colours (rgb()), not var(...): the page accepts plain colours only
  const probe = progressTheme.probe || (progressTheme.probe = document.body.appendChild(Object.assign(document.createElement('i'), { hidden: true })));
  const col = (expr, fb) => { probe.style.color = ''; probe.style.color = expr; const c = getComputedStyle(probe).color; return c && c !== 'rgba(0, 0, 0, 0)' ? c : fb; };
  const accent = col('var(--violet)', '#8f73ff');
  // the page takes letters, digits, spaces, quotes, commas, dots, dashes (quotes built with fromCharCode: a quote inside a regex trips the i18n extractor)
  const fontOk = new RegExp('[^\\w\\s,.\\-' + String.fromCharCode(39, 34) + ']', 'g');
  const font = (getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim() || 'system-ui, sans-serif').replace(fontOk, '');
  return {
    type: 'minsuterm-theme',
    dark: !isLight(),
    font,
    mono: "'Cascadia Mono', Consolas, monospace",
    vars: {
      bg: col('var(--stage-solid)', isLight() ? '#fafbfc' : '#10131a'),
      card: col('var(--surface)', isLight() ? '#ffffff' : '#161922'),
      text: col('var(--text)', isLight() ? '#1f2430' : '#e7eaf0'),
      muted: col('var(--muted)', '#8a92a5'),
      faint: col('var(--dim)', '#626a7d'),
      line: col('var(--border)', isLight() ? '#e2e6ed' : '#232733'),
      hover: col('var(--surface-2)', isLight() ? '#f4f6f9' : '#1c202a'),
      accent,
      accentSoft: col(`color-mix(in srgb, var(--violet) ${isLight() ? 12 : 18}%, var(--surface))`, isLight() ? '#ece8ff' : '#241f3f'),
      onAccent: '#ffffff',
    },
  };
}
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function postProgressTheme() {
  if (!S.progress.open || !S.progress.origin || PG.frame.hidden) return;
  try { PG.frame.contentWindow.postMessage(progressTheme(), S.progress.origin); } catch { /* not loaded yet: the hash carried the theme */ }
}

async function openProgress(dir, name) {
  if (!dir) return;
  const seq = ++S.progress.seq;
  Object.assign(S.progress, { open: true, path: dir, name: name || String(dir).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || dir });
  PG.view.querySelector('.pg-title').textContent = S.progress.name;
  PG.view.querySelector('.pg-path').textContent = dir;
  PG.view.querySelector('.pg-path').title = dir;
  PG.view.classList.remove('closing');
  PG.view.hidden = false;
  PG.hint.hidden = true;
  document.activeElement?.blur?.();
  $('#pg-close').focus({ preventScroll: true });
  renderProjects();
  syncTitleActions();
  pgChip('loading', '준비 중');
  pgShow('loading');
  let st;
  try { st = await window.mt.progress.status(); } catch (err) { return progressError(seq, err); }
  if (seq !== S.progress.seq) return;
  if (!st.ready && !S.progress.skipSetup) return showProgressSetup(st, seq);
  loadProgressPage(seq);
}

async function loadProgressPage(seq) {
  pgChip('loading', '준비 중');
  pgShow('loading');
  let r;
  try { r = await window.mt.progress.open(S.progress.path); } catch (err) { return progressError(seq, err); }
  if (seq !== S.progress.seq || !S.progress.open) return;
  S.progress.origin = r.origin;
  S.progress.key = r.key;
  const theme = progressTheme();
  PG.frame.classList.add('fading');
  PG.frame.onload = () => {
    if (seq !== S.progress.seq) return;
    postProgressTheme();
    PG.frame.classList.remove('fading');
  };
  PG.frame.src = `${r.url}#p=${r.key}&embed=1&theme=${b64url(JSON.stringify(theme))}`;
  pgShow('frame');
  progressHint(r.empty);
}

/* the page reports its state ({ready, ok, live, empty}, never the record itself): the chip and the empty hint follow it */
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!S.progress.open || e.source !== PG.frame.contentWindow || e.origin !== S.progress.origin || !d || d.type !== 'minsuterm-progress') return;
  if (!d.ready) return pgChip('loading', '준비 중');
  if (!d.ok) pgChip('error', '기록 없음');
  else if (d.live) pgChip('live', '실시간');
  else pgChip('loading', '다시 연결 중');
  progressHint(!!d.ok && !!d.empty);
});

/*
 * 방에서 내쫓기: the page's room asks which tab holds the main agent's session (for its warning), then asks to end it.
 * The tab is looked up again here each time from the record's session id; the page never names a tab itself.
 */
function roomTab(owner, agent, guess) {
  const live = S.tabs.filter((t) => t.alive && !t.closed && t.agent);
  const own = owner && live.find((t) => t.sessionId === owner);
  if (own || !guess) return own || null;
  // the main agent, its session id not known yet: the folder's one tab of that agent whose session is not known either
  const same = live.filter((t) => !t.sessionId && (!agent || t.agent === agent) && samePath(t.cwd, S.progress.path));
  return same.length === 1 ? same[0] : null;
}

/** Rename a room character's session: its own /rename while it is open and idle, its transcript when it is not open. */
async function renameRoomSession(owner, agent, guess, raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) return { ok: false, error: '이름이 비어 있어요' };
  const t = roomTab(owner, agent, guess);
  if (t) {
    const A = AGENTS[t.agent].name;
    if (roomTabBusy(t) || t.kicking) return { ok: false, error: `${A}가 일하는 중이라 지금은 바꿀 수 없어요. 일이 끝난 뒤에 다시 해 주세요` };
    if (promptText(t)) return { ok: false, error: `'${tabLabel(t)}' 탭 입력창에 쓰던 글이 있어서 바꾸지 않았어요` };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (t.agent === 'codex') { // Codex asks for the name in a box of its own
      window.mt.pty.write(t.id, '/rename');
      await wait(250);
      window.mt.pty.write(t.id, '\r');
      await wait(700);
      window.mt.pty.write(t.id, name);
    } else window.mt.pty.write(t.id, `/rename ${name}`);
    await wait(250);
    window.mt.pty.write(t.id, '\r');
    return { ok: true, how: 'command', name };
  }
  if (agent === 'codex') return { ok: false, error: 'Codex 세션은 탭에 열려 있을 때만 이름을 바꿀 수 있어요' };
  let ok = false;
  try { ok = await window.mt.agent.rename(S.progress.path, owner, name); } catch { /* reported below */ }
  if (!ok) return { ok: false, error: '그 세션의 대화 기록을 찾지 못했어요' };
  S.sessionCache.delete(normP(S.progress.path)); // the sidebar's list of its conversations shows the new name
  renderProjects();
  return { ok: true, how: 'file', name };
}

/** A turn running or a question waiting, by its status or by what its screen shows right now. */
const roomTabBusy = (t) => t.status === 'working' || t.status === 'attention' || !!t.awaitChoice || screenSaysWorking(t);

/** End the agent in a tab the way a person would (its exit command), its process only if that did not work. */
async function endAgentSession(tab) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gone = () => tab.closed || !tab.alive || !tab.agent;
  const quit = tab.agent === 'codex' ? '/quit' : '/exit';
  // a turn running or a question on screen: Esc stops it first, so the command is not queued behind it
  if (roomTabBusy(tab)) { window.mt.pty.write(tab.id, '\x1b'); await wait(900); }
  if (gone()) return 'exit';
  if (promptText(tab)) { window.mt.pty.write(tab.id, '\x03'); await wait(300); } // a draft in the input box: cleared, not sent
  window.mt.pty.write(tab.id, quit);
  await wait(250);
  window.mt.pty.write(tab.id, '\r');
  window.mt.agent.probe([700, 1500, 2500, 4000, 6000]);
  for (let i = 0; i < 32 && !gone(); i++) await wait(250);
  if (gone()) return 'exit';
  let ended = false;
  try { ended = await window.mt.agent.end(tab.id); } catch { /* reported below */ }
  for (let i = 0; ended && i < 20 && !gone(); i++) await wait(250);
  return gone() ? 'killed' : '';
}

window.addEventListener('message', async (e) => {
  const d = e.data;
  if (!S.progress.open || e.source !== PG.frame.contentWindow || e.origin !== S.progress.origin || !d || d.type !== 'minsuterm-room') return;
  const reply = (msg) => { try { PG.frame.contentWindow.postMessage({ type: 'minsuterm-room', req: d.req, ...msg }, S.progress.origin); } catch { /* the page went away */ } };
  const owner = typeof d.owner === 'string' ? d.owner.toLowerCase() : '';
  const agent = d.agent === 'codex' ? 'codex' : d.agent === 'claude' ? 'claude' : '';
  const guess = d.main === true; // only the main agent may be found by its folder when its session id is not known
  if (d.op === 'rename') return reply({ op: 'renamed', ...(await renameRoomSession(owner, agent, guess, d.name)) });
  const t = roomTab(owner, agent, guess);
  if (d.op === 'kickInfo') {
    if (!t) return reply({ op: 'kickInfo', found: false });
    const working = roomTabBusy(t);
    return reply({
      op: 'kickInfo', found: true, label: tabLabel(t), agent: t.agent, sure: !!owner && t.sessionId === owner,
      working, draft: !working && !!promptText(t), // while it works the cursor's line is its spinner, not a draft
      subs: hasRunningSubs(t), bg: hasRunningBg(t),
    });
  }
  if (d.op !== 'kick') return;
  if (!t) return reply({ op: 'kicked', ok: true, how: 'none' });
  if (t.kicking) return;
  t.kicking = true;
  const name = AGENTS[t.agent].name;
  const label = tabLabel(t);
  let how = '';
  try { how = await endAgentSession(t); } finally { t.kicking = false; }
  reply({ op: 'kicked', ok: !!how, how });
  if (how) toast(`'${label}' 탭의 ${name} 세션을 끝냈어요`, { icon: 'stop' });
  else toast(`'${label}' 탭의 ${name} 세션을 끝내지 못했어요. 탭에서 직접 ${name === 'Codex' ? '/quit' : '/exit'} 해 주세요`, { icon: 'info', ms: 6000 });
});

/** While the record is still empty: say so, and offer to start the skill in the folder's Claude tab. */
function progressHint(empty) {
  clearInterval(S.progress.poll);
  // the page explains an empty record itself; this line only offers the one thing the page can't do: start it in a tab
  const claudeTab = empty && S.tabs.find((t) => t.agent === 'claude' && t.alive && samePath(t.cwd, S.progress.path));
  PG.hint.hidden = !claudeTab;
  if (!claudeTab) return;
  const ask = $('#pg-ask');
  ask.hidden = false;
  ask.onclick = () => {
    const t = S.tabs.find((x) => x.agent === 'claude' && x.alive && samePath(x.cwd, S.progress.path));
    if (!t) return;
    window.mt.pty.write(t.id, '/minsuterm-progress'); // typed, not sent: the user presses Enter
    closeProgress();
    activate(t.id);
    toast('Claude 입력창에 /minsuterm-progress 를 넣었어요 · Enter로 시작', { icon: 'progress' });
  };
}

function progressError(seq, err) {
  if (seq !== S.progress.seq) return;
  pgChip('error', '오류');
  PG.error.querySelector('.pg-error-text').textContent = `진행도를 열지 못했어요. ${String(err?.message || err || '').split(': ').slice(-1)[0]}`;
  pgShow('error');
}

/** First use on this computer: what 구축하기 sets up, then the page. */
function showProgressSetup(st, seq) {
  pgChip('setup', '구축 필요');
  const dirOf = (n) => (st.skills.find((s) => s.name === n) || {}).target || '';
  const step = (id, title, sub) => `<li data-step="${id}"><span class="pg-step-dot"><i></i>${icon('check')}</span><div><div class="pg-step-title">${title}</div><div class="pg-step-sub">${sub}</div></div></li>`;
  PG.setup.innerHTML = `<div class="pg-card">
    <h2>이 컴퓨터에 진행 보고 환경을 구축할까요?</h2>
    <p>에이전트가 할 일과 진행 상황을 이 폴더의 진행 기록에 적고, 여기서 실시간으로 볼 수 있게 됩니다. 한 번만 하면 모든 폴더에서 쓸 수 있어요.</p>
    <ul class="pg-steps">
      ${step('progress', '진행 보고 스킬 설치', `<code class="no-i18n">${esc(dirOf('minsuterm-progress'))}</code>`)}
      ${step('dreaming', '수면 스킬 설치', `자러 가기를 누르면 일을 마치고 기억을 정리한 뒤 잡니다 · <code class="no-i18n">${esc(dirOf('minsuterm-dreaming'))}</code>`)}
      ${step('record', '이 폴더의 진행 기록 준비', `<code class="no-i18n">${esc(S.progress.path)}</code> 안의 progress 폴더 (git에는 올라가지 않아요)`)}
      ${step('node', st.node ? '이 컴퓨터의 Node 사용' : 'Node를 MinsuTerm이 대신 실행', st.node ? '스킬의 도구를 설치된 Node로 실행합니다' : 'Node가 없어도 MinsuTerm이 스킬의 도구를 실행합니다')}
    </ul>
    <div class="pg-card-actions">
      <span class="pg-card-note">${st.ownProgress ? '쓰고 계신 progress 스킬은 그대로 두고, 같은 기록을 함께 씁니다' : ''}</span>
      <span class="pg-card-btns"><button class="btn small" data-pg="view">지금은 보기만</button>
      <button class="btn small primary" data-pg="build">${icon('progress')}구축하기</button></span>
    </div>
  </div>`;
  pgShow('setup');
  PG.setup.onclick = async (e) => {
    const b = e.target.closest('[data-pg]');
    if (!b) return;
    if (b.dataset.pg === 'view') { S.progress.skipSetup = true; return loadProgressPage(seq); }
    b.disabled = true;
    const items = [...PG.setup.querySelectorAll('.pg-steps li')];
    items.forEach((li) => li.classList.add('doing'));
    let res;
    try { res = await window.mt.progress.setup(); } catch (err) { items.forEach((li) => li.classList.remove('doing')); b.disabled = false; return progressError(seq, err); }
    if (seq !== S.progress.seq) return;
    for (const li of items) {
      li.classList.remove('doing');
      const d = (res.done || []).find((x) => x.name === `minsuterm-${li.dataset.step}`);
      li.classList.add(d && d.skipped ? 'skip' : 'done');
    }
    toast('진행 보고 환경을 구축했어요', { icon: 'progress' });
    setTimeout(() => { if (seq === S.progress.seq && S.progress.open) loadProgressPage(seq); }, 650);
  };
}

function closeProgress() {
  if (!S.progress.open) return;
  S.progress.open = false;
  S.progress.seq++;
  clearInterval(S.progress.poll);
  PG.view.classList.add('closing');
  setTimeout(() => {
    if (S.progress.open) return;
    PG.view.hidden = true;
    PG.view.classList.remove('closing');
    PG.frame.removeAttribute('src'); // the page's live connection closes with it
    PG.frame.hidden = true;
  }, 140);
  renderProjects();
  syncTitleActions();
  const t = activeTab();
  if (t && t.term) requestAnimationFrame(() => t.term.focus());
}

/* ---------- the title bar's 진행도: pick one of the folders, then its page ---------- */

/** The registered folders (프로젝트), the active tab's one marked; nothing else is offered. */
function progressFolders() {
  const t = activeTab();
  const own = t && t.cwd ? ownerProject(t.cwd) : null;
  return sortedProjects().map((p) => ({ path: p.path, name: p.name, project: p, here: !!own && own.id === p.id }));
}

async function openProgressPicker(anchor, fromKeyboard = !anchor) {
  const folders = progressFolders();
  let sums = [];
  try { sums = await window.mt.progress.summary(folders.map((f) => f.path)); } catch { sums = []; }
  folders.forEach((f, i) => { f.sum = sums[i] || null; });
  // the active tab's folder first, then folders that have a record (most recently updated), then the rest
  const here = folders.filter((f) => f.here);
  // then what waits for the user, then folders with a record (most recently updated), then the rest
  const rest = folders.filter((f) => !f.here).sort((a, b) => (b.sum?.waiting || 0) - (a.sum?.waiting || 0) || (b.sum?.exists ? 1 : 0) - (a.sum?.exists ? 1 : 0) || String(b.sum?.updated || '').localeCompare(String(a.sum?.updated || '')));
  const r = (anchor || $('#sb-progress')).getBoundingClientRect();
  closeOverlay();
  const scrim = h('div');
  scrim.style.cssText = 'position:fixed;inset:0;z-index:99';
  const menu = h('div', 'menu pg-menu');
  const label = (txt) => menu.appendChild(h('div', 'menu-label', esc(txt)));
  const row = (f) => {
    const s = f.sum;
    const stat = !s || !s.exists
      ? '<span class="pgm-stat none">기록 없음</span>'
      : `<span class="pgm-stat">${s.waiting ? `<span class="w">확인 ${s.waiting}</span> · ` : ''}<span>남은 ${s.remaining}</span> · <span>끝낸 ${s.done}</span></span>`;
    const ic = f.project ? projectIconHtml(f.project) : icon('folder');
    const on = S.progress.open && samePath(S.progress.path, f.path);
    const b = h('button', 'menu-item' + (on ? ' on' : ''), `${ic}<span class="pgm-text"><span class="pgm-name"><span class="no-i18n">${esc(f.name)}</span>${f.here ? '<span class="pgm-here">지금 탭</span>' : ''}</span><span class="pgm-path no-i18n">${esc(prettyPath(f.path))}</span></span>${stat}`);
    b.addEventListener('click', () => { closeOverlay(); openProgress(f.path, f.name); });
    menu.appendChild(b);
  };
  if (S.progress.open) {
    const c = h('button', 'menu-item', `${icon('x')}<span>진행도 닫기</span><span class="hint">Esc</span>`);
    c.addEventListener('click', () => { closeOverlay(); closeProgress(); });
    menu.appendChild(c);
    menu.appendChild(h('div', 'menu-sep'));
  }
  if (folders.length) { label('등록된 폴더'); here.forEach(row); rest.forEach(row); }
  else { // nothing registered yet: say so, and offer the one way to register a folder
    menu.appendChild(h('div', 'menu-label', esc('아직 등록된 폴더가 없어요')));
    const add = h('button', 'menu-item', `${icon('folderPlus')}<span>프로젝트 폴더 추가…</span>`);
    add.addEventListener('click', async () => { closeOverlay(); const p = await addProject(); if (p) openProgress(p.path, p.name); });
    menu.appendChild(add);
  }
  // which folders these are, and how another one gets here
  menu.appendChild(h('div', 'pgm-hint', `${icon('info')}<span>추가한 프로젝트 폴더만 보여요</span>`));
  scrim.addEventListener('pointerdown', () => closeOverlay());
  overlayRoot.append(scrim, menu);
  const mr = menu.getBoundingClientRect();
  const sideOpen = !!$('#sb-progress').offsetParent; // a hidden sidebar: open the list from the top left instead
  menu.style.left = `${Math.max(6, Math.min(sideOpen ? r.left : 12, innerWidth - mr.width - 6))}px`;
  menu.style.top = `${Math.min(sideOpen ? r.bottom + 6 : 52, innerHeight - mr.height - 6)}px`;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOverlay(); } };
  window.addEventListener('keydown', onKey, true);
  S.overlay = { nodes: [scrim, menu], cleanup: () => window.removeEventListener('keydown', onKey, true) };
  if (fromKeyboard) menu.querySelector('.menu-item')?.focus(); // from the keyboard: the list takes the arrows / Enter at once
  refreshProgressBadge(true);
}

/** The 진행도 button in the 폴더 header: lit while the view is open, a badge with what waits for the user. */
function syncTitleActions() {
  $('#sb-progress').classList.toggle('on', !!S.progress.open);
}
let progressBadgeAt = 0;
/** Every half minute (and on demand): how many items across the folders wait for the user (확인 필요, unanswered notices). */
async function refreshProgressBadge(force) {
  if (!force && Date.now() - progressBadgeAt < 30000) return;
  progressBadgeAt = Date.now();
  const folders = progressFolders();
  let sums = [];
  try { sums = await window.mt.progress.summary(folders.map((f) => f.path)); } catch { return; }
  const waiting = sums.reduce((n, s) => n + (s && s.exists ? s.waiting : 0), 0);
  const b = $('#sb-progress .sbp-badge');
  b.hidden = !waiting;
  b.textContent = waiting > 99 ? '99+' : String(waiting);
  $('#sb-progress').title = waiting ? `진행도 보기 · 확인이 필요한 일 ${waiting}개 (Ctrl+Shift+J)` : '진행도 보기 (Ctrl+Shift+J)';
}
setInterval(() => { if (!document.hidden) refreshProgressBadge(); }, 30000);
setTimeout(() => refreshProgressBadge(true), 4000);

$('#sb-progress').addEventListener('click', (e) => { e.stopPropagation(); openProgressPicker(e.currentTarget); });
$('#pg-close').addEventListener('click', closeProgress);
$('#pg-reload').addEventListener('click', () => { if (S.progress.open) loadProgressPage(S.progress.seq); });
$('#pg-retry').addEventListener('click', () => { if (S.progress.open) openProgress(S.progress.path, S.progress.name); });
$('#pg-browser').addEventListener('click', () => { if (S.progress.origin && S.progress.key) window.mt.openExternal(`${S.progress.origin}/#p=${S.progress.key}`); });
window.addEventListener('keydown', (e) => { // Esc closes it, unless a dialog is open or the page itself has the focus
  if (e.key !== 'Escape' || !S.progress.open || S.overlay || document.activeElement === PG.frame) return;
  e.preventDefault();
  e.stopPropagation();
  closeProgress();
}, true);

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

/**
 * 성능 기록: CPU profiles of this window and of the main process for `ms`, saved with a snapshot of what the window
 * holds (tabs and their scrollback, DOM size, effects, background, memory) — to find what a long-running window is
 * busy with where it happens.
 */
async function recordPerformance(ms) {
  const snap = () => {
    const mem = performance.memory || {};
    return {
      at: new Date().toISOString(),
      tabs: S.tabs.map((t) => { const b = t.term && t.term.buffer.active; return { agent: t.agent || '', status: t.status, cols: t.term ? t.term.cols : 0, rows: t.term ? t.term.rows : 0, lines: b ? b.length : 0, backlog: t.backlog || 0, subagents: (t.subagents || []).length, bg: (t.bgTasks || []).length, visible: !!(t.host && t.host.offsetParent) }; }),
      groups: S.groups.length, grid: !!S.grid, domNodes: document.getElementsByTagName('*').length,
      fxParticles: FX && FX.parts ? FX.parts.length : 0,
      background: S.settings.bgAnim, bgLevel: S.settings.bgAnimLevel, cursor: S.settings.cursorStyle, typingFx: S.settings.typingFx, workGlow: S.settings.workGlow ? S.settings.workGlowStyle : '',
      theme: S.settings.theme, dark: S.dark, dpr: window.devicePixelRatio, size: [innerWidth, innerHeight], hidden: document.hidden, focused: S.winFocused,
      heapMB: mem.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    };
  };
  toast(`성능 기록 중… ${Math.round(ms / 1000)}초 동안 평소처럼 쓰세요`, { icon: 'bolt', ms: Math.min(ms, 6000) });
  const before = snap();
  let res;
  try { res = await window.mt.diagRecord(ms, { before, after: null }); } catch (e) { res = { ok: false, error: String(e) }; }
  if (res && res.ok) toast('성능 기록을 저장했습니다 · 클릭하면 폴더 열기', { icon: 'bolt', ms: 10000, onClick: () => window.mt.openFolder(res.dir) });
  else toast(res && res.error === 'busy' ? '이미 기록 중입니다' : '성능 기록에 실패했습니다', { icon: 'info' });
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
    { group: '앱', icon: 'progress', text: '진행도 보기', hint: 'Ctrl+Shift+J', keywords: 'progress todo board', run: () => openProgressPicker() },
    { group: '앱', icon: 'settings', text: '설정', hint: 'Ctrl+,', run: openSettings },
    { group: '앱', icon: 'folderOpen', text: '설정 폴더 열기', run: () => window.mt.openUserData() },
    { group: '앱', icon: 'bolt', text: '성능 기록 (30초)', sub: '느릴 때 실행: 무엇이 CPU를 쓰는지 파일로 저장', keywords: 'performance profile cpu diagnostics lag', run: () => recordPerformance(30000) },
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
  // all of them ("모든 대화 보기"), not only the 40 newest the sidebar keeps: a busy folder has more
  let list = [];
  try { list = await window.mt.agent.sessions(cwd, 300); } catch { list = await sessionsFor(cwd, true); }
  const items = list.map((s) => {
    const open = tabOfSession(s.id);
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
  // the window takes the focus (callers may then focus a field of their own): otherwise it stays in the terminal
  // behind the scrim, and whatever is typed goes to the shell / agent
  m.tabIndex = -1;
  m.style.outline = 'none';
  m.focus();
  m.querySelector('[data-close]').addEventListener('click', () => closeOverlay());
  scrim.addEventListener('pointerdown', () => closeOverlay());
  const onKey = (e) => {
    if (e.key === 'Tab') { // Tab goes round inside the window (and its open dropdown), never out to the page behind
      const stops = (S.overlay ? S.overlay.nodes : [m]).flatMap((n) => [...n.querySelectorAll('button, input, select, textarea, [tabindex]')])
        .filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent);
      const at = document.activeElement;
      if (!stops.includes(at) || at === stops[e.shiftKey ? 0 : stops.length - 1]) { e.preventDefault(); (stops[e.shiftKey ? stops.length - 1 : 0] || m).focus(); }
      return;
    }
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
  // preventDefault: submit() hands focus back to the terminal, and the keypress of this Enter would follow it there
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } if (e.key === 'Escape') closeOverlay(); });
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
  const mirror = h('div', 'composer-mirror no-i18n'); // a copy of what is being typed: translating it would move the measured caret
  field.appendChild(mirror);
  let advFont = '', adv = 0;
  /*
   * The cell before character i (the caret by default): x, y its top left corner in px from the field's top left
   * corner (the textarea's border box, which the fx canvas covers), lh the line's height, ch one character's width.
   * The mark is as tall as a line and sits at the top of its line box, so y is where the line starts, not where its
   * glyphs do; offsets are read on screen (sub-pixel, and with the textarea's border, which offsetLeft / offsetTop
   * leave out) and taken back out of the modal's opening zoom.
   */
  const caretXY = (i = ta.selectionEnd) => {
    const cs = getComputedStyle(ta);
    for (const p of ['font', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'tabSize', 'wordBreak', 'overflowWrap']) mirror.style[p] = cs[p];
    mirror.style.width = `${ta.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)}px`;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    mirror.textContent = ta.value.slice(0, i);
    const mark = document.createElement('span');
    mark.style.cssText = `display:inline-block;vertical-align:top;width:0;height:${lh}px`;
    mirror.appendChild(mark);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (font !== advFont) { // a character's advance is the cell, as in the terminal (Cascadia Mono: 0.586em, not 0.6)
      const c = document.createElement('canvas').getContext('2d');
      c.font = font;
      adv = c.measureText('M'.repeat(20)).width / 20 + (parseFloat(cs.letterSpacing) || 0);
      advFont = font;
    }
    const mr = mirror.getBoundingClientRect(), kr = mark.getBoundingClientRect(), z = mr.width / mirror.offsetWidth || 1;
    return { x: ta.offsetLeft + (kr.left - mr.left) / z - ta.scrollLeft, y: ta.offsetTop + (kr.top - mr.top) / z - ta.scrollTop, lh, ch: adv || parseFloat(cs.fontSize) * 0.6 };
  };

  /*
   * The cursor: every kind drawn as in the terminal (the native caret has neither the 커서 style's width nor 깜빡임), in
   * a box over the textarea inside its border. The box clips it: what a cursor spreads round the caret (레이더's
   * screen, 십자선's lines, 등대's beam, 후광's pillar of light …) stays in the composer, as the terminal's stays in its
   * pane, and --pl / --pr / --pt / --pb tell it how far the box reaches (paneReach).
   */
  const kind = st.cursorStyle || 'bar';
  const native = NATIVE_CURSORS[kind];
  const th = currentTheme();
  const acc = (window.ACCENTS[st.accent] || window.ACCENTS.violet).c[0];
  const color = st.cursorColor === 'accent' ? acc : st.cursorColor === 'white' ? (isLight() ? '#1f2430' : '#ffffff') : th.cursor;
  ta.style.caretColor = 'transparent';
  const box = h('div', 'composer-curbox');
  const cur = h('div', `mt-cursor kind-${kind}`);
  cursorArt(cur, kind);
  if (native) cur.style.setProperty('--cc', color); // bars / block / underline follow 커서 색 like in the terminal
  box.appendChild(cur);
  field.appendChild(box);
  for (const f of window.CURSOR_INIT || []) f(cur); // cursors that watch their own moves (혜성's tail, 운석's sparks: fx/cursor-up-c.js)
  let last = '', boxGeo = '', reach = '';
  let moveTimer = null;
  const place = () => {
    const p = caretXY();
    const bx = ta.offsetLeft + ta.clientLeft, by = ta.offsetTop + ta.clientTop, W = ta.clientWidth, H = ta.clientHeight;
    const geo = `${bx} ${by} ${W} ${H}`;
    if (geo !== boxGeo) { boxGeo = geo; Object.assign(box.style, { left: `${bx}px`, top: `${by}px`, width: `${W}px`, height: `${H}px` }); }
    const dpr = window.devicePixelRatio || 1;
    const x = Math.round((p.x - bx) * dpr) / dpr, y = Math.round((p.y - by) * dpr) / dpr; // on whole device pixels: a 1 px bar stays sharp
    // like the terminal's: dimmed and held still while the textarea or the window has no focus; out of sight (its
    // animations held where they are, not restarted) during a selection, or while its line is scrolled away
    const focused = document.activeElement === ta && document.hasFocus();
    const off = ta.selectionStart !== ta.selectionEnd || y + p.lh <= 0 || y >= H;
    const blink = st.cursorBlink && !SELF_ANIMATED_CURSORS.includes(kind);
    cur.className = `mt-cursor kind-${kind}${off ? ' off' : ''}${focused ? '' : ' blurred'}${blink ? ' blink' : ''}${cur.classList.contains('moving') ? ' moving' : ''}`;
    cur.style.width = `${p.ch}px`;
    cur.style.height = `${p.lh}px`;
    const r = [x, W - x, y, H - y].map((v) => `${+v.toFixed(1)}px`);
    if (r.join(' ') !== reach) { reach = r.join(' '); ['--pl', '--pr', '--pt', '--pb'].forEach((k, j) => cur.style.setProperty(k, r[j])); }
    const pos = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (pos !== last) {
      last = pos;
      cur.style.transform = pos;
      for (const f of window.CURSOR_MOVE || []) f(cur, x, y);
      cur.classList.add('moving');
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => cur.classList.remove('moving'), 260);
    }
  };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  for (const ev of ['input', 'click', 'keyup', 'select', 'scroll', 'focus', 'blur', 'compositionupdate']) ta.addEventListener(ev, schedule);
  document.addEventListener('selectionchange', schedule);
  window.addEventListener('focus', schedule); // the window's focus: dimmed like the terminal's cursor
  window.addEventListener('blur', schedule);
  const ro = new ResizeObserver(schedule);
  ro.observe(ta);
  setTimeout(schedule, 30);

  // typing effect at the caret (the canvas covers the field: the same px as caretXY's)
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
  /*
   * Enter starts a new line; its flourish plays where it was pressed, at the end of the row (read before the newline
   * goes in), as the terminal's plays on the line it sends. A wrapped line's row starts at its first character on the
   * caret's row. The row's text goes along only when it is all half-width: those cells are the composer's own, but a
   * Korean syllable is narrower here than the terminal's two cells, and copies of it would drift off the line.
   */
  const enterAt = () => {
    const p = caretXY(), v = ta.value, end = ta.selectionEnd;
    let a = v.lastIndexOf('\n', end - 1) + 1, b = end;
    while (a < b) { const m = (a + b) >> 1; if (caretXY(m + 1).y < p.y - 1) a = m + 1; else b = m; } // the first character after which the caret would be on this row
    const left = ta.offsetLeft + ta.clientLeft + parseFloat(getComputedStyle(ta).paddingLeft) - ta.scrollLeft;
    const row = v.slice(a, end);
    return { x: p.x + p.ch / 2, y: p.y + p.lh / 2, cw: p.ch, ch: p.lh, pre: { left: p.x, top: p.y }, line: { text: /^[\x20-\x7e]*$/.test(row) ? row : '', left, top: p.y, cols: Math.max(0, (p.x - left) / p.ch) } };
  };
  const burst = (enter, text) => {
    if (!fx) return;
    const at = enter ? enterAt() : null;
    requestAnimationFrame(() => {
      if (at) { fx.burst(fxKind, at.x, at.y, { enter, k: st.typingFxIntensity, cw: at.cw, ch: at.ch, text, pre: at.pre, line: at.line }); return; }
      const p = caretXY(); // the key has gone in: the caret is just after what was typed
      // Korean (IME) keys arrive as "Process": use the character now just before the caret
      const shown = text ?? (ta.value[ta.selectionEnd - 1] || '');
      fx.burst(fxKind, p.x + p.ch / 2, p.y + p.lh / 2, { enter, k: st.typingFxIntensity, cw: p.ch, ch: p.lh, text: shown });
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
      window.removeEventListener('focus', schedule);
      window.removeEventListener('blur', schedule);
      clearTimeout(moveTimer);
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
  const label = h('span', `composer-target no-i18n ${t.agent}`, `${icon(A.icon)}${esc(tabLabel(t))}`);
  openModal({ title: '프롬프트 작성', body, foot: [label, right], width: 720 });
  const prev = S.overlay.cleanup;
  S.overlay.cleanup = () => { prev?.(); deco.stop(); drafts.set(t.id, ta.value); };

  const deliver = (submit) => {
    const text = ta.value.replace(/\s+$/, '');
    if (!text) return;
    // the tab may have changed while this window was open: with the agent gone the text would run in the shell,
    // and while it asks something the Enter would pick the highlighted answer (the text stays here)
    if (!t.agent || !t.alive) return toast('Claude 또는 Codex 실행 중인 탭에서 사용할 수 있어요', { icon: 'info' });
    if (t.awaitChoice) return toast('선택이 필요해요', { icon: 'info' });
    ta.value = '';
    closeOverlay();
    drafts.delete(t.id);
    activate(t.id);
    window.mt.pty.write(t.id, `\x1b[200~${text}\x1b[201~`); // bracketed paste keeps it one prompt
    if (submit) { onAgentEnter(t, text); t.armed = true; setTimeout(() => window.mt.pty.write(t.id, '\r'), 150); } // a task row, as for a typed prompt
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
  for (const t of S.tabs) t.term.options.fontFamily = termFont(ff);
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
  // the whole window closed with the list open (a click outside it): a font previewed with the arrow keys goes back
  const prevCleanup = S.overlay.cleanup;
  S.overlay.cleanup = () => { prevCleanup?.(); if (pop) { pop = null; previewFont(S.settings.fontFamily); } };
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
  const make = (still) => {
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
    if (still) return; // the phrase as it stands once it is in (pvPark): not scrambled, not shattered
    if (kind === 'decode') decodeIn(inner, glyphs);
    if (kind === 'shatter') setTimeout(() => w.classList.add('out'), 1100);
  };
  make(true);
  let timer = 0;
  el.pvPlay = () => { clearInterval(timer); make(); timer = setInterval(make, 2200); }; // replay the entrance
  el.pvRest = () => { clearInterval(timer); timer = 0; make(true); };
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
      if (k === 'letterSpacing') v = Math.max(-2, Math.min(6, v)); // far below zero there is no cell width left (the terminal drops to 2 columns)
      if (k === 'lineHeight') v = clampLineHeight(v);
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
  else if (cs && code === 'KeyJ') openProgressPicker();
  else if (cs && code === 'KeyO') openHistory();
  else if (cs && code === 'KeyC') { if (t) copySelection(t); }
  else if (cs && code === 'KeyV') { if (t) smartPaste(t); }
  else if (cs && code === 'PageUp') moveActive(-1);
  else if (cs && code === 'PageDown') moveActive(1);
  else if (cs && code === 'KeyI') window.mt.devtools();
  else if (c && code === 'Tab') cycle(e.shiftKey ? -1 : 1);
  else if (c && !e.shiftKey && /^Digit[1-9]$/.test(code)) {
    const n = Number(code.slice(5));
    const items = barItems(); // the n-th item in the tab bar (a split counts once)
    const it = n === 9 ? items[items.length - 1] : items[n - 1];
    if (it) activate(itemFocus(it.lead).id);
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
  nudgeComposer(); // a second line in the agent's input: the moment the composer helps most
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
  // Ctrl+Tab goes from tab-bar item to item (a split is one; moving between its panes is Ctrl+Alt+arrows)
  const items = barItems();
  if (!items.length) return;
  const i = items.findIndex((it) => it.tabs.some((t) => t.id === S.activeId));
  const it = items[(i + delta + items.length) % items.length];
  activate(itemFocus(it.lead).id);
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

/** Paths of the dropped files, quoted for where they go: `tab` is the shell tab they are pasted into (none: an agent's prompt). */
function droppedPaths(e, tab) {
  const sh = tab && !tab.agent ? (S.shells.find((s) => s.id === tab.shellId) || {}).type : '';
  const quote = (p) => {
    if (!sh) return /\s/.test(p) ? `"${p}"` : p; // a prompt takes the path as text
    if (!/[\s;&|<>()^!%$`'"{}*?#~,=[\]]/.test(p)) return p; // nothing a shell would read as syntax
    if (sh === 'cmd' || !/[$`"!]/.test(p)) return `"${p}"`;
    return `'${p.replace(/'/g, sh === 'ps' ? "''" : "'\\''")}'`; // $( ) ` ! still work inside "…": PowerShell and POSIX shells need '…'
  };
  const out = [];
  for (const f of e.dataTransfer?.files || []) {
    const p = window.mt.filePath(f);
    if (p) out.push(quote(p));
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
  const paths = droppedPaths(e, t);
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

// every pane on screen follows the stage: a split has several, like a folder grid
new ResizeObserver(() => { const tiles = currentView().tiles; (tiles.length ? tiles : [activeTab()]).forEach(fitTab); }).observe(termsEl);
$('#zoombar-exit').addEventListener('click', () => { toggleZoom(); activeTab()?.term.focus(); });
$('#gridbar-exit').addEventListener('click', () => { S.grid = null; applyLayout(); renderProjects(); activeTab()?.term.focus(); });

setTimeout(() => { if (!document.hasFocus()) S.winFocused = false; }, 2000); // opened behind another window: no focus event ever said so
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
    // Which conversation each agent tab comes back to: its own, if the transcript is still there. A tab without one
    // continues the folder's latest conversation — but only one tab per folder may, and none where another restored
    // tab resumes its own: `claude --continue` / `codex resume --last` would put two tabs on one conversation.
    // The others start a new one.
    const isAgent = (lt) => lt.agent === 'claude' || lt.agent === 'codex';
    const place = (lt) => `${lt.agent} ${normP(lt.cwd)}`;
    const found = [];
    for (const lt of layout.tabs) found.push(!!(isAgent(lt) && lt.sessionId && await window.mt.agent.has(lt.agent, lt.cwd, lt.sessionId)));
    const taken = new Set(layout.tabs.filter((lt, i) => found[i]).map(place));
    for (const [i, lt] of layout.tabs.entries()) {
      let launch = null;
      if (isAgent(lt)) {
        const ok = found[i];
        const mode = ok ? 'resume' : taken.has(place(lt)) ? 'new' : 'continue';
        taken.add(place(lt));
        launch = { type: lt.agent, mode, sessionId: ok ? lt.sessionId : '', permissionMode: lt.permissionMode };
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
