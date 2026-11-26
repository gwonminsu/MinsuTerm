'use strict';
/* global S, h, esc, icon, hydrateIcons, openMenu, openModal, closeOverlay, confirmDialog, toast, basename, prettyPath,
   shortMiddlePath, samePath, isInside, activeTab, renderProjects, closeProgress, tabLabel, relTime, AGENTS */

/*
 * 하네스 보기: what shapes the agents in a sidebar folder, over the terminal area (as 진행도 보기 is).
 * Left, a narrow guide with three tabs:
 *   지침  a subway map: Claude Code's line and Codex's line run down through the instruction files each loads, folder by
 *         folder (전역 → the folders above → this one → below, when needed); a file both read is a transfer station,
 *         one an agent passes without stopping is a station it skips (and says why)
 *   도구  skills, MCP servers, hooks and plugins (read only)
 *   점검  what is worth fixing, each with a jump to the line (and 하나로 묶기 for CLAUDE.md beside AGENTS.md)
 * Right, the editor, always open: outline, text (a highlight layer under a textarea), preview or history.
 * The folder looked at (the sidebar folder or one below it) is picked from the path in the bar.
 * Loaded before app.js: everything here runs later, from a click. Top-level names start with hx / HX (one global scope).
 */

const HX = { open: false, project: '', name: '', at: '', data: null, tab: 'map', toolsAgent: 'claude', seq: 0, drawer: null, watchOff: null, rescanTimer: null, navW: 0 };
const HX_ONLY = new URLSearchParams(location.search).get('harness') || '';
const HX_NAV_KEY = 'mt-harness-nav-w';
const HX_FOLD_KEY = 'mt-harness-nav-folded'; // the map folded to a rail (more room for the editor)
const HX_VIEW_KEY = 'mt-harness-view'; // the editor's view the user picked last: 블록 (default) or 원문
// markdown patterns with a backtick, built from a char code: a backtick inside a regex literal trips the i18n extractor
const HX_BT = String.fromCharCode(96);
const HX_FENCE_RE = new RegExp('^\\s{0,3}(' + HX_BT + '{3,}|~{3,})(.*)$');
const HX_CODE_RE = new RegExp(HX_BT + '([^' + HX_BT + ']+)' + HX_BT, 'g');
const HX_CODE_HL_RE = new RegExp('(' + HX_BT + '+)([^' + HX_BT + ']+?)\\1', 'g');
const HX_PARA_STOP_RE = new RegExp('^(#{1,6}\\s|\\s*([-*+]|\\d+\\.)\\s|\\s*>|\\s{0,3}(' + HX_BT + '{3,}|~{3,}))');

/* ------------------------------------------------------------------ small things */
const hxRel = (p) => {
  if (!p) return '';
  if (HX.project && isInside(p, HX.project)) return p.slice(HX.project.length).replace(/^[\\/]+/, '').split('\\').join('/') || basename(p);
  return prettyPath(p).split('\\').join('/');
};
const hxShort = (p, max = 46) => shortMiddlePath(prettyPath(p), max);
const hxKB = (b) => (b >= 1024 * 100 ? `${Math.round(b / 1024)} KB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
const hxTok = (t) => (t >= 1000 ? `약 ${(t / 1000).toFixed(1)}k 토큰` : `약 ${t} 토큰`);
const hxAgentDot = (a) => `<i class="hx-dot ${a}"></i>`;
// an error from main, in the app language first (it goes into a sentence slot, which the translator leaves as it is)
const hxErr = (err) => { const m = String((err && err.message) || err).replace(/^Error invoking remote method [^:]+: (Error: )?/, ''); return window.tr ? window.tr(m) : m; };
const hxDir = (p) => String(p).replace(/[\\/][^\\/]*$/, '');
const HX_SCOPE = {
  managed: '관리 정책', user: '사용자', userRule: '사용자 규칙', ancestor: '상위 폴더', cwd: '이 폴더', local: '로컬', rule: '규칙',
  import: '가져옴', sub: '하위 폴더', global: '전역', chain: '프로젝트', above: '루트 위',
};
const HX_STATE = { loaded: '읽음', lazy: '필요할 때', ignored: '안 읽음', cut: '끝 잘림', skipped: '빠짐', other: '그 폴더에서만' };

/* ------------------------------------------------------------------ the panel */
let HV = null;
function hxBuild() {
  if (HV) return HV;
  const v = h('section', 'hx-view');
  v.id = 'harness-view';
  v.hidden = true;
  v.setAttribute('aria-label', '하네스');
  v.innerHTML = `
    <header class="hx-bar">
      <span class="hx-mark">${icon('harness')}</span>
      <div class="hx-titles">
        <span class="hx-label">하네스</span>
        <span class="hx-title no-i18n"></span>
        <button class="hx-at" data-act="folders" title="다른 폴더 기준으로 보기"></button>
      </div>
      <span class="hx-spacer"></span>
      <span class="hx-sessions"></span>
      <button class="icon-btn" data-act="reload" title="다시 읽기">${icon('refresh')}</button>
      <button class="icon-btn" data-act="window" title="새 창에서 보기">${icon('openExternal')}</button>
      <button class="btn small primary hx-close" data-act="close" title="하네스 닫기 (Esc)"><span class="hx-close-x">${icon('x')}</span><span class="hx-close-label">닫기</span><kbd class="pg-kbd">Esc</kbd></button>
    </header>
    <div class="hx-main">
      <div class="hx-nav">
        <nav class="hx-tabs" role="tablist">
          <button data-tab="map" role="tab">지침</button>
          <button data-tab="tools" role="tab">도구</button>
          <button data-tab="checks" role="tab">점검<b class="hx-count no-i18n" hidden></b></button>
          <span class="hx-spacer"></span>
          <button class="hx-navfold" data-act="fold" title="지도 접기 · 편집기를 넓게">${icon('chevronLeft')}<span class="t">접기</span></button>
        </nav>
        <div class="hx-rail">
          <button class="hx-railbtn" data-act="unfold" title="지도 펼치기">${icon('chevronRight')}</button>
          <i class="hx-railsep"></i>
          <button class="hx-railtab" data-act="unfold" data-to="map" title="지침">${icon('book')}</button>
          <button class="hx-railtab" data-act="unfold" data-to="tools" title="도구">${icon('box')}</button>
          <button class="hx-railtab" data-act="unfold" data-to="checks" title="점검">${icon('check')}<b class="hx-railcount no-i18n" hidden></b></button>
        </div>
        <div class="hx-body">
          <div class="hx-state hx-loading"><div class="pg-sk pg-sk-a"></div><div class="pg-sk pg-sk-b"></div><div class="pg-sk pg-sk-c"></div></div>
          <div class="hx-state hx-error" hidden><span class="hx-error-text"></span><button class="btn small" data-act="reload">${icon('refresh')}다시 시도</button></div>
          <div class="hx-pane" data-pane="map" hidden></div>
          <div class="hx-pane" data-pane="tools" hidden></div>
          <div class="hx-pane" data-pane="checks" hidden></div>
        </div>
      </div>
      <div class="hx-split" title="끌어서 너비 바꾸기"></div>
      <section class="hx-ed"></section>
    </div>`;
  (document.getElementById('stage') || document.body).append(v);
  HV = { view: v, nav: v.querySelector('.hx-nav'), body: v.querySelector('.hx-body'), ed: v.querySelector('.hx-ed'), title: v.querySelector('.hx-title'), at: v.querySelector('.hx-at'),
    count: v.querySelector('.hx-count'), sessions: v.querySelector('.hx-sessions'), loading: v.querySelector('.hx-loading'), error: v.querySelector('.hx-error') };
  v.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab && tab.closest('.hx-tabs')) { hxTab(tab.dataset.tab); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') closeHarness();
    else if (act === 'reload') hxScan();
    else if (act === 'window') openHarnessWindow(HX.project, HX.name);
    else if (act === 'folders') hxFolders(e.target.closest('[data-act]'));
    else if (act === 'fold' || act === 'unfold') { // the map folds to a thin rail: the editor takes the width
      hxFold(act === 'fold');
      const to = e.target.closest('[data-to]')?.dataset.to;
      if (to) hxTab(to);
    }
  });
  hxFold(localStorage.getItem(HX_FOLD_KEY) === '1', true);
  // the guide's width: dragged at the split, kept for next time
  HX.navW = Math.max(340, Math.min(640, Number(localStorage.getItem(HX_NAV_KEY)) || 420));
  v.style.setProperty('--hx-nav', HX.navW + 'px');
  if (HX_ONLY) v.querySelector('[data-act="window"]')?.setAttribute('hidden', '');
  const split = v.querySelector('.hx-split');
  split.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = HX.navW;
    v.classList.add('resizing');
    const move = (ev) => { HX.navW = Math.max(340, Math.min(Math.min(720, v.clientWidth - 420), w0 + ev.clientX - x0)); v.style.setProperty('--hx-nav', HX.navW + 'px'); };
    const up = () => {
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      v.classList.remove('resizing');
      localStorage.setItem(HX_NAV_KEY, String(HX.navW));
      if (HX.data) hxRenderPane('map');
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  });
  hxEmptyEditor();
  return HV;
}

function hxFold(folded, quiet) {
  if (!HV) return;
  const v = HV.view;
  const calm = quiet || v.hidden || !v.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm) { // (opening the page as it was left: no movement)
    v.classList.add('hx-still');
    v.classList.toggle('nav-folded', folded);
    void v.offsetWidth;
    requestAnimationFrame(() => v.classList.remove('hx-still'));
  } else if (v.classList.contains('nav-folded') !== folded) {
    const from = hxFoldSpot(v, !folded);
    v.classList.toggle('nav-folded', folded);
    hxFoldFly(v, from, hxFoldSpot(v, folded), folded);
  }
  localStorage.setItem(HX_FOLD_KEY, folded ? '1' : '0');
  if (!folded && !quiet && HX.data) hxRenderPane('map'); // the map is drawn for the width it gets back
}
/** Where the fold button sits once the move is over (folded: on the rail; open: at the end of the tab row). Measured
 *  from the map column, whose left edge does not move, so the slide and fade under way do not count. */
function hxFoldSpot(v, folded) {
  const b = v.querySelector(folded ? '.hx-railbtn' : '.hx-navfold');
  const nav = v.querySelector('.hx-nav');
  let x = 0;
  let y = 0;
  for (let e = b; e && e !== nav; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  const r = nav.getBoundingClientRect();
  return { left: r.left + x, top: r.top + y, width: b.offsetWidth, height: b.offsetHeight };
}
/** The fold button travels between its two places: the word folds away (or out), the arrow turns round, and it
 *  settles from the pressed look into the plain one. The real buttons wait hidden until it lands. */
function hxFoldFly(v, from, to, folding) {
  document.querySelector('.hx-foldfly')?.remove();
  const word = v.querySelector('.hx-navfold .t')?.textContent || '';
  const fly = h('div', 'hx-foldfly', `${icon('chevronLeft')}<span class="t">${esc(word)}</span>`);
  hydrateIcons(fly);
  document.body.append(fly);
  const t = fly.querySelector('.t');
  const ar = fly.querySelector('svg');
  const tw = t.scrollWidth;
  v.classList.add('hx-flying');
  const D = 400;
  const ease = 'cubic-bezier(.32, .72, 0, 1)';
  const open = { padding: '0 9px 0 5px', gap: '2px' };
  const shut = { padding: '0px 0px 0px 0px', gap: '0px' };
  const at = (r, s) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', ...s });
  const pressed = { color: 'var(--violet)', borderColor: 'color-mix(in srgb, var(--violet) 65%, transparent)', backgroundColor: 'color-mix(in srgb, var(--violet) 12%, var(--surface))' };
  const plain = { color: 'var(--text-2)', borderColor: 'var(--border-strong)', backgroundColor: 'var(--surface)' };
  const moves = [
    fly.animate([at(from, folding ? open : shut), at(to, folding ? shut : open)], { duration: D, easing: ease, fill: 'forwards' }),
    fly.animate([{ transform: 'scale(1)', boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }, { transform: 'scale(1.08)', boxShadow: '0 8px 20px rgba(0, 0, 0, .28)', offset: 0.45 }, { transform: 'scale(1)', boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }], { duration: D, easing: 'ease-in-out' }),
    fly.animate([pressed, plain], { duration: D, easing: 'ease-in', fill: 'forwards' }),
    // the word: folding, it goes first; unfolding, it comes once the button is nearly there
    t.animate(folding ? [{ maxWidth: tw + 'px', opacity: 1 }, { maxWidth: '0px', opacity: 0 }] : [{ maxWidth: '0px', opacity: 0 }, { maxWidth: tw + 'px', opacity: 1 }],
      { duration: D * 0.55, delay: folding ? 0 : D * 0.4, easing: ease, fill: 'both' }),
    // the arrow turns round (‹ becomes ›), with a little overshoot
    ar.animate(folding ? [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }] : [{ transform: 'rotate(180deg)' }, { transform: 'rotate(0deg)' }],
      { duration: D * 0.9, delay: D * 0.08, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'both' }),
  ];
  Promise.all(moves.map((m) => m.finished)).catch(() => {}).then(() => {
    fly.remove();
    if (!document.querySelector('.hx-foldfly')) v.classList.remove('hx-flying');
  });
}

function hxShowState(which) {
  HV.loading.hidden = which !== 'loading';
  HV.error.hidden = which !== 'error';
  for (const p of HV.body.querySelectorAll('.hx-pane')) p.hidden = which !== 'data' || p.dataset.pane !== HX.tab;
}

/** Open 하네스 보기 for a sidebar folder (only folders the user added). */
async function openHarness(dir, name, { at, tab, file } = {}) {
  if (!dir) return;
  hxBuild();
  if (S.progress && S.progress.open && !HX_ONLY) closeProgress({ focus: false });
  const again = HX.open && samePath(HX.project, dir);
  if (!again) {
    if (HX.drawer && HX.drawer.cardCommit) HX.drawer.cardCommit();
    if (HX.drawer && HX.drawer.dirty && HX.open) {
      const ok = await confirmDialog('저장하지 않은 내용', '편집 중인 내용을 저장하지 않고 다른 폴더를 열까요?', '열기');
      if (!ok) return;
    }
    HX.data = null;
    HX.find = '';
    HX.findOn = null;
    hxEmptyEditor();
    if (HX.open) hxUnwatch();
  }
  Object.assign(HX, { open: true, project: dir, name: name || basename(dir), at: at || (again ? HX.at : dir) });
  localStorage.setItem(HX_USED_KEY, '1');
  if (tab) HX.tab = tab;
  else if (!again) HX.tab = 'map'; // (another folder starts on its map: what it reads, or the first station to make)
  HV.title.textContent = HX.name;
  HV.title.title = dir;
  HV.view.classList.remove('closing');
  HV.view.hidden = false;
  document.activeElement?.blur?.();
  HV.view.querySelector('.hx-close').focus({ preventScroll: true });
  hxTabs();
  renderProjects();
  if (!HX.watchOff) hxWatch();
  await hxScan();
  if (file) hxOpenFile(file);
  if (HX.open && HX.data) hxTour();
}
const harnessOpenFor = (dir) => HX.open && samePath(HX.project, dir);

async function closeHarness({ focus = true } = {}) {
  if (!HX_ONLY && !HX.open) return true;
  hxdSlashClose();
  hxdBarHide();
  hxdLangClose();
  if (HX.drawer && HX.drawer.cardCommit) HX.drawer.cardCommit(); // (a card being written: its words count as an edit)
  if (HX.drawer && HX.drawer.dirty) {
    const ok = await confirmDialog('저장하지 않은 내용', '편집 중인 내용을 저장하지 않고 닫을까요?', '닫기');
    if (!ok) return false;
    HX.drawer.dirty = false;
  }
  hxTourEnd();
  if (HX_ONLY) { HX.leaving = true; window.close(); return true; }
  if (!HX.open) return true;
  HX.open = false;
  HX.seq++;
  hxUnwatch();
  HV.view.classList.add('closing');
  setTimeout(() => { if (HX.open) return; HV.view.hidden = true; HV.view.classList.remove('closing'); hxEmptyEditor(); }, 140);
  renderProjects();
  const t = activeTab();
  if (focus && t && t.term) requestAnimationFrame(() => t.term.focus());
  return true;
}

/* ------------------------------------------------------------------ the first time: three bubbles (map, rules, 점검) */
const HX_TOUR_KEY = 'mt-harness-tour';
let HX_TOUR = null;
const HX_TOUR_STEPS = [
  { at: () => HV.body.querySelector('[data-pane="map"]'), side: 'right', title: '이 지도가 에이전트가 읽는 순서예요', text: '역을 누르면 오른쪽에서 고쳐요. 위에서 모든 지침 파일을 찾을 수도 있어요' },
  { at: () => HV.ed.querySelector('.hxb, .hx-code') || HV.ed, side: 'inside', title: '규칙은 문서처럼 바로 고쳐요', text: '바뀐 줄은 왼쪽에 색으로 보여요. Ctrl+S로 저장하고, 저장하기 전 내용은 기록에 남아요' },
  { at: () => HV.view.querySelector('.hx-tabs [data-tab="checks"]'), side: 'below', title: '점검에서 고칠 곳을 찾아요', text: '항목마다 부탁하기를 누르면 고쳐 달라는 부탁을 에이전트 탭에 넣어 드려요' },
];
/** Shown once: after it is gone (finished, skipped or the panel closed), never again. */
function hxTour() {
  if (HX_TOUR || localStorage.getItem(HX_TOUR_KEY) === '1' || HV.view.classList.contains('nav-folded')) return;
  const el = h('div', 'hx-tour');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '하네스 안내');
  document.body.append(el);
  const key = (e) => {
    if (e.key !== 'Escape' || !HX_TOUR || e.isComposing || S.overlay) return; // (a window open: this Esc is its)
    const ae = document.activeElement;
    if (ae && !HX_TOUR.el.contains(ae) && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return; // (a box being written takes its own Esc)
    e.preventDefault();
    e.stopPropagation();
    hxTourEnd();
  };
  const place = () => hxTourPlace();
  window.addEventListener('keydown', key, true);
  window.addEventListener('resize', place);
  HX_TOUR = { el, k: 0, off: () => { window.removeEventListener('keydown', key, true); window.removeEventListener('resize', place); } };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-tour="skip"]')) { hxTourEnd(); return; }
    if (e.target.closest('[data-tour="next"]')) { if (HX_TOUR.k >= HX_TOUR_STEPS.length - 1) hxTourEnd(); else { HX_TOUR.k++; hxTourShow(); } }
  });
  hxTourShow();
}
function hxTourShow() {
  const t = HX_TOUR;
  const st = HX_TOUR_STEPS[t.k];
  const last = t.k === HX_TOUR_STEPS.length - 1;
  t.el.className = `hx-tour ${st.side}`;
  t.el.innerHTML = `<span class="hx-tour-n no-i18n">${t.k + 1} / ${HX_TOUR_STEPS.length}</span><b>${st.title}</b><span>${st.text}</span>
    <div class="hx-tour-acts">${last ? '' : '<button type="button" class="hx-tour-skip" data-tour="skip">건너뛰기</button>'}<button type="button" class="btn small primary" data-tour="next">${last ? '시작하기' : '다음'}</button></div>`;
  hxTourPlace();
  t.el.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}
function hxTourPlace() {
  const t = HX_TOUR;
  if (!t) return;
  document.querySelector('.hx-tour-on')?.classList.remove('hx-tour-on');
  const st = HX_TOUR_STEPS[t.k];
  const target = st.at();
  if (!target || !target.getClientRects().length) { t.el.style.left = '50%'; t.el.style.top = '30%'; return; }
  target.classList.add('hx-tour-on');
  const r = target.getBoundingClientRect();
  const w = t.el.offsetWidth;
  const hgt = t.el.offsetHeight;
  let x;
  let y;
  if (st.side === 'right') { x = r.right + 14; y = r.top + 36; }
  else if (st.side === 'below') { x = r.left + r.width / 2 - 28; y = r.bottom + 12; }
  else { x = r.left + 40; y = r.top + 46; }
  x = Math.max(10, Math.min(innerWidth - w - 10, x));
  y = Math.max(10, Math.min(innerHeight - hgt - 10, y));
  t.el.style.left = `${x}px`;
  t.el.style.top = `${y}px`;
  t.el.style.setProperty('--ax', `${Math.max(14, Math.min(w - 20, r.left + r.width / 2 - x))}px`);
}
function hxTourEnd() {
  if (!HX_TOUR) return;
  localStorage.setItem(HX_TOUR_KEY, '1');
  HX_TOUR.off();
  HX_TOUR.el.remove();
  HX_TOUR = null;
  document.querySelector('.hx-tour-on')?.classList.remove('hx-tour-on');
  if (HV && !HV.view.hidden) HV.view.querySelector('.hx-close')?.focus({ preventScroll: true });
}

/** Where to open 하네스 for a folder: here (over the terminal) or in a window of its own. */
function hxOpenChoice(dir, name) {
  const body = h('div', 'hx-choice');
  body.innerHTML = `
    <p class="hx-choice-dir no-i18n" title="${esc(dir)}">${icon('folder')}<b>${esc(name || basename(dir))}</b><span>${esc(shortMiddlePath(prettyPath(dir), 48))}</span></p>
    <div class="hx-choice-opts">
      <button type="button" class="hx-choice-opt" data-how="here">${icon('harness')}<b>이 화면에서 열기</b><span>터미널 영역 위에 열려요</span></button>
      <button type="button" class="hx-choice-opt" data-how="window">${icon('openExternal')}<b>새 창으로 열기</b><span>따로 띄워 두고 터미널과 함께 봐요</span></button>
    </div>`;
  hydrateIcons(body);
  openModal({ title: '하네스 열기', body, width: 480 });
  const opts = [...body.querySelectorAll('.hx-choice-opt')];
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-how]');
    if (!b) return;
    closeOverlay();
    if (b.dataset.how === 'window') openHarnessWindow(dir, name); else openHarness(dir, name);
  });
  body.addEventListener('keydown', (e) => { // ←→ / ↑↓ between the two, Enter opens
    if (!/^Arrow/.test(e.key)) return;
    e.preventDefault();
    const at = opts.indexOf(document.activeElement);
    opts[(at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
  });
  opts[0].focus();
}
async function openHarnessWindow(dir, name) {
  if (!dir) return;
  try { await window.mt.harness.window(dir, name || basename(dir)); } catch (err) { toast(`하네스 창을 열지 못했어요: ${hxErr(err)}`, { icon: 'info' }); }
}

function hxTab(tab) {
  HX.tab = tab;
  hxTabs();
  if (HX.data) hxShowState('data');
}
function hxTabs() {
  for (const b of HV.view.querySelectorAll('.hx-tabs [data-tab]')) { b.classList.toggle('on', b.dataset.tab === HX.tab); b.setAttribute('aria-selected', b.dataset.tab === HX.tab); }
  for (const b of HV.view.querySelectorAll('.hx-railtab[data-to]')) b.classList.toggle('on', b.dataset.to === HX.tab);
}

/** The folders under the sidebar folder that hold instruction files: pick one to see the map from there. */
function hxFolders(anchor) {
  const d = HX.data;
  if (!d) return;
  const tag = (f) => {
    const has = f.has || {};
    return [has['CLAUDE.md'] || has['.claude/CLAUDE.md'] ? 'C' : '', has['AGENTS.md'] || has['AGENTS.override.md'] ? 'A' : '', has['CLAUDE.local.md'] ? 'L' : '',
      f.rules && f.rules.length ? 'R' : '', f.skills ? 'S' : '', has['.mcp.json'] ? 'M' : '', f.git ? 'git' : ''].filter(Boolean).join(' ');
  };
  const items = d.tree.folders.map((f) => ({
    icon: samePath(f.path, d.at) ? 'check' : 'folder',
    text: f.depth ? `${'  '.repeat(Math.min(6, f.depth - 1))}${f.rel}` : HX.name,
    hint: tag(f),
    cls: 'hx-mi no-i18n',
    run: () => hxSetAt(f.path),
  }));
  const r = anchor.getBoundingClientRect();
  openMenu([{ label: '어느 폴더에서 시작한 에이전트 기준으로 볼까요' }, ...items, ...(d.tree.truncated ? [{ label: '폴더가 많아 일부만 살펴봤어요' }] : [])], r.left, r.bottom + 4);
}
function hxSetAt(dir) {
  HX.at = dir;
  hxScan();
}

async function hxScan({ quiet } = {}) {
  if (!HX.open) return;
  const seq = ++HX.seq;
  if (!quiet || !HX.data) hxShowState('loading');
  let d;
  try { d = await window.mt.harness.scan(HX.project, HX.at); } catch (err) {
    if (seq !== HX.seq) return;
    HV.error.querySelector('.hx-error-text').textContent = `하네스를 읽지 못했어요: ${hxErr(err)}`;
    hxShowState('error');
    return;
  }
  if (seq !== HX.seq || !HX.open) return;
  HX.data = d;
  hxRenderAll();
  hxShowState('data');
  if (samePath(d.at, HX.project)) hxIssues(HX.project, d); // (a look from a folder below counts that folder's)
  // the editor: keep the open file, else open the file that matters most here
  if (!HX.drawer) {
    const pick = d.claude.layers.find((l) => l.state === 'loaded' && l.scope === 'cwd')
      || d.codex.layers.find((l) => ['loaded', 'cut'].includes(l.state) && l.scope === 'cwd')
      || d.claude.layers.find((l) => l.state === 'loaded' && !['user', 'userRule', 'managed'].includes(l.scope))
      || d.codex.layers.find((l) => ['loaded', 'cut'].includes(l.state) && l.scope !== 'global');
    if (pick) hxOpenFile(pick.path, { quiet: true });
  } else if (HX.drawer.el) { HX.drawer.facts = hxFacts(HX.drawer.file); hxEdChips(HX.drawer); hxPaint(HX.drawer); }
}

/** Every pane from HX.data (scroll positions kept: a rescan after a save must not jump). */
function hxRenderAll() {
  const d = HX.data;
  HV.at.innerHTML = samePath(d.at, d.project)
    ? `<span class="hx-path no-i18n">${esc(hxShort(d.project))}</span>${icon('chevronDown')}`
    : `<span class="hx-path no-i18n">${esc(HX.name)} › <b>${esc(hxRel(d.at))}</b></span>${icon('chevronDown')}`;
  HV.at.title = `${d.at}\n다른 폴더 기준으로 보기`;
  const bad = d.checks.filter((c) => c.level !== 'info').length;
  HV.count.hidden = !d.checks.length;
  HV.count.textContent = String(bad || d.checks.length);
  HV.count.classList.toggle('warn', bad > 0);
  const rc = HV.view.querySelector('.hx-railcount'); // the same count on the folded rail
  rc.hidden = HV.count.hidden;
  rc.textContent = HV.count.textContent;
  rc.classList.toggle('warn', bad > 0);
  hxSessions();
  for (const k of ['map', 'tools', 'checks']) hxRenderPane(k);
  hydrateIcons(HV.view);
}
function hxRenderPane(k) {
  const pane = HV.body.querySelector(`[data-pane="${k}"]`);
  if (k === 'map') { // (words being typed in the search box, or a match picked: drawn when the focus leaves them)
    const ae = document.activeElement;
    if (ae && pane.contains(ae) && ae.closest('.hx-find, .hx-found')) { HX.mapStale = true; return; }
    HX.mapStale = false;
  }
  const top = pane.scrollTop;
  pane.replaceChildren({ map: hxRenderMap, tools: hxRenderTools, checks: hxRenderChecks }[k](HX.data));
  pane.scrollTop = top;
}

/* ------------------------------------------------------------------ running sessions in this folder */
function hxSessions() {
  const tabs = S.tabs.filter((t) => t.agent && t.alive && t.cwd && isInside(t.cwd, HX.project));
  HV.sessions.innerHTML = tabs.slice(0, 3).map((t) => `<span class="hx-sess no-i18n ${t.agent}" data-tab-id="${esc(t.id)}" title="${esc(tabLabel(t))}">${icon(AGENTS[t.agent].icon)}<span class="no-i18n">${esc(tabLabel(t).slice(0, 16))}</span><i class="hx-sess-flag" hidden></i></span>`).join('')
    + (tabs.length > 3 ? `<span class="hx-more no-i18n">+${tabs.length - 3}</span>` : '');
  // a Codex session read its AGENTS.md when it started: say so when the files changed since
  for (const t of tabs.filter((x) => x.agent === 'codex' && x.sessionId)) {
    window.mt.harness.codexLoaded(t.sessionId).then((got) => {
      if (!got || !HX.data) return null;
      const chain = HX.data.codex.layers.filter((l) => ['loaded', 'cut'].includes(l.state));
      return Promise.all(chain.map((l) => window.mt.harness.read(l.path).catch(() => null))).then((files) => {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const all = norm(got.text);
        const changed = files.some((f) => f && f.text && !all.includes(norm(f.text).slice(0, 400)));
        const el = HV.sessions.querySelector(`[data-tab-id="${CSS.escape(t.id)}"]`);
        if (!el) return;
        el.querySelector('.hx-sess-flag').hidden = !changed;
        el.title = changed ? `${tabLabel(t)} · 세션을 시작한 뒤 지침이 바뀌었어요. 새 세션부터 반영돼요` : tabLabel(t);
      });
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ 지침: the subway map */
/** Claude's files in load order, each import right after the file that brings it. */
function hxClaudeOrder(layers) {
  const out = [];
  const add = (l) => { out.push(l); for (const k of layers.filter((x) => x.via === l.id)) add(k); };
  for (const l of layers.filter((x) => !x.via)) add(l);
  return out;
}
function hxRenderMap(d) {
  const wrap = h('div', 'hx-map');
  const W = Math.max(300, (HX.navW || 420) - 26);
  const L = Math.round(W * 0.42);
  const R = Math.round(W * 0.58);
  const M = Math.round((L + R) / 2);
  const ROW = 46;
  const HEAD = 30;
  const key = (p) => String(p).toLowerCase();
  const cOrder = hxClaudeOrder(d.claude.layers);
  const byId = new Map(cOrder.map((l) => [l.id, l]));
  const topOf = (l) => { let x = l; while (x.via && byId.get(x.via)) x = byId.get(x.via); return x; };
  const levelOf = (l) => {
    if (['managed', 'user', 'userRule', 'global'].includes(l.scope)) return 'global';
    if (l.scope === 'sub') return 'sub';
    if (l.via) return levelOf(topOf(l));
    return key(l.folder || hxDir(l.path));
  };
  // the levels, top to bottom: 전역, the folders from the top down to this one, then below (when needed)
  const levels = new Map();
  const level = (k) => { if (!levels.has(k)) levels.set(k, { key: k, rows: [], cl: [], cx: [] }); return levels.get(k); };
  level('global');
  for (const l of cOrder) level(levelOf(l)).cl.push(l);
  for (const l of d.codex.layers) level(levelOf(l)).cx.push(l);
  const folderKeys = [...levels.keys()].filter((k) => k !== 'global' && k !== 'sub').sort((a, b) => a.length - b.length);
  const ordered = [levels.get('global'), ...folderKeys.map((k) => levels.get(k)), ...(levels.has('sub') ? [levels.get('sub')] : [])].filter((x) => x.cl.length || x.cx.length || x.key === key(d.at));
  if (!ordered.some((x) => x.key === key(d.at))) ordered.push(level(key(d.at)));
  // rows: Claude's stations on the left in order; a file both read in the middle (a transfer); Codex's on the right.
  // 전역 and 하위 폴더 stay folded (one bundle station per side holding two or more files) until opened: they are
  // the same for every folder and push this folder's own files down
  const cxShared = new Set();
  const selKey = HX.drawer ? key(HX.drawer.file) : '';
  HX.unfold = HX.unfold || new Set();
  for (const lv of ordered) {
    const foldable = (lv.key === 'global' || lv.key === 'sub') && !lv.cl.some((c) => c.shared) && (lv.cl.length > 1 || lv.cx.length > 1);
    lv.foldable = foldable;
    lv.folded = foldable && !HX.unfold.has(lv.key) && ![...lv.cl, ...lv.cx].some((l) => key(l.path) === selKey);
    if (lv.folded) {
      const side = (list, a) => (list.length > 1 ? { bundle: list, agent: a } : list[0]);
      lv.rows.push({ left: lv.cl.length ? side(lv.cl, 'cl') : undefined, right: lv.cx.length ? side(lv.cx, 'cx') : undefined });
      continue;
    }
    for (const c of lv.cl) {
      const twin = c.shared ? lv.cx.find((x) => key(x.path) === key(c.path)) : null;
      if (twin) { lv.rows.push({ center: c, twin }); cxShared.add(twin); } else lv.rows.push({ left: c });
    }
    let from = 0;
    for (const x of lv.cx) {
      if (cxShared.has(x)) { from = lv.rows.findIndex((r) => r.twin === x) + 1; continue; }
      let r = lv.rows.findIndex((row, i) => i >= from && !row.right && !row.center);
      if (r < 0) { lv.rows.push({}); r = lv.rows.length - 1; }
      lv.rows[r].right = x;
      from = r + 1;
    }
  }
  const levelOfRow0 = (r) => { for (const lv of ordered) if (lv.rows.includes(r)) return lv.key; return ''; };
  // y for every row
  let y = 34;
  const rows = [];
  const bands = [];
  for (const lv of ordered) {
    bands.push({ lv, y });
    y += HEAD;
    if (!lv.rows.length) { lv.rows.push({ empty: true }); }
    for (const r of lv.rows) { r.y = y + ROW / 2; rows.push(r); y += ROW; }
    y += 4;
  }
  const H = y + 8;
  // nothing of the project's own yet (only the global files, if any): this folder's empty row is the first station to make,
  // a dashed transfer (AGENTS.md alone is read by both agents) the lines reach in dashes, with a bubble under the map
  const rootGhost = (a) => (d.ghosts || []).find((g) => g.where === 'root' && g.agent === a);
  const first = rootGhost('codex') && rootGhost('claude') && key(hxDir(rootGhost('codex').path)) === key(d.at) && !ordered.some((lv) => lv.key !== 'global' && (lv.cl.length || lv.cx.length)) ? rows.find((r) => r.empty && levelOfRow0(r) === key(d.at)) : null;
  const firstBoth = !['claude-md', 'managed-only'].includes(d.claude.mode); // (set so, Claude Code leaves AGENTS.md alone)
  const sel = HX.drawer ? key(HX.drawer.file) : '';
  // the lines: straight down, bending into the middle at a transfer
  const line = (side) => {
    const pts = [];
    for (const r of rows) {
      if (r.center) pts.push([side === 'cl' ? M - 7 : M + 7, r.y]);
      else pts.push([side === 'cl' ? L : R, r.y]);
    }
    // the line runs to the last station the agent stops at (a file it skips below that stands on its own)
    const reads = (l) => l && (l.bundle ? l.bundle.some((b) => !['ignored', 'skipped', 'other'].includes(b.state)) : !['ignored', 'skipped', 'other'].includes(l.state));
    const lastIdx = (() => { for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; if (r.center || reads(side === 'cl' ? r.left : r.right)) return i; } return 0; })();
    const p = pts.slice(0, lastIdx + 1);
    if (!p.length) return '';
    let s = `M${p[0][0] === M - 7 || p[0][0] === M + 7 ? (side === 'cl' ? L : R) : p[0][0]} 22`;
    let prev = [side === 'cl' ? L : R, 22];
    for (const q of p) {
      if (q[0] === prev[0]) s += ` L${q[0]} ${q[1]}`;
      else { const my = (prev[1] + q[1]) / 2; s += ` C${prev[0]} ${my} ${q[0]} ${my} ${q[0]} ${q[1]}`; }
      prev = q;
    }
    return s;
  };
  const col = (a) => (a === 'cl' ? 'var(--hx-cl)' : 'var(--hx-cx)');
  const station = (l, x, yy, a) => {
    if (l.bundle) { // a folded level: a stack of stations
      const lazy = l.bundle.every((b) => b.state === 'lazy');
      return `<circle cx="${x}" cy="${yy + 4}" r="6.5" class="hx-st under${lazy ? ' lazy' : ''}" style="stroke:${col(a)}"/><circle cx="${x}" cy="${yy}" r="6.5" class="hx-st${lazy ? ' lazy' : ''}" style="stroke:${col(a)}"/>`;
    }
    const on = key(l.path) === sel;
    const st = l.state;
    const ring = on ? `<circle cx="${x}" cy="${yy}" r="12" class="hx-sel"/>` : '';
    if (st === 'lazy') return `${ring}<circle cx="${x}" cy="${yy}" r="6" class="hx-st lazy" style="stroke:${col(a)}"/>`;
    if (['ignored', 'skipped', 'other'].includes(st)) return `${ring}<circle cx="${x}" cy="${yy}" r="5" class="hx-st skip"/><path d="M${x - 3.2} ${yy - 3.2}l6.4 6.4" class="hx-st-x"/>`;
    if (st === 'cut') return `${ring}<circle cx="${x}" cy="${yy}" r="6.5" class="hx-st cut"/><rect x="${x - 4}" y="${yy + 10}" width="8" height="16" rx="2" fill="url(#hx-hatch)"/>`;
    return `${ring}<circle cx="${x}" cy="${yy}" r="6.5" class="hx-st" style="stroke:${col(a)}"/>`;
  };
  let svg = `<svg class="hx-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><pattern id="hx-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="5" fill="var(--red)"/></pattern></defs>`;
  for (const b of bands) svg += `<line x1="0" x2="${W}" y1="${b.y + 6}" y2="${b.y + 6}" class="hx-band"/>`;
  svg += `<path d="${line('cl')}" class="hx-line cl"/><path d="${line('cx')}" class="hx-line cx"/>`;
  if (first) {
    const k = rows.indexOf(first);
    const py = k > 0 ? rows[k - 1].y : 22;
    const my = (py + first.y) / 2;
    if (firstBoth) {
      svg += `<path d="M${L} ${py} C${L} ${my} ${M - 7} ${my} ${M - 7} ${first.y}" class="hx-line cl ghost"/><path d="M${R} ${py} C${R} ${my} ${M + 7} ${my} ${M + 7} ${first.y}" class="hx-line cx ghost"/>`;
      svg += `<rect x="${M - 17}" y="${first.y - 10}" width="34" height="20" rx="10" class="hx-st xfer ghost"/><path d="M${M - 4} ${first.y}h8M${M} ${first.y - 4}v8" class="hx-st-plus"/>`;
    } else {
      svg += `<path d="M${R} ${py} L${R} ${first.y}" class="hx-line cx ghost"/><circle cx="${R}" cy="${first.y}" r="9" class="hx-st xfer ghost"/><path d="M${R - 4} ${first.y}h8M${R} ${first.y - 4}v8" class="hx-st-plus"/>`;
    }
  }
  for (const r of rows) {
    if (r.left) svg += station(r.left, L, r.y, 'cl');
    if (r.right) svg += station(r.right, R, r.y, 'cx');
    if (r.center) {
      const on = key(r.center.path) === sel;
      svg += `${on ? `<rect x="${M - 23}" y="${r.y - 15}" width="46" height="30" rx="15" class="hx-sel"/>` : ''}<rect x="${M - 17}" y="${r.y - 10}" width="34" height="20" rx="10" class="hx-st xfer"/>`;
    }
  }
  svg += '</svg>';
  // labels: HTML over the drawing (buttons, ellipsis, the app's fonts)
  // (each sentence in an element of its own: the translator matches whole text nodes)
  const where = (l) => (l.scope === 'sub' ? `<span class="no-i18n">${esc(hxRel(l.folder || hxDir(l.path)))}</span> · ` : '');
  const meta = (l) => {
    if (['ignored', 'skipped', 'other'].includes(l.state)) return `${where(l)}<span>${esc(l.why || HX_STATE[l.state])}</span>`;
    if (l.state === 'lazy') {
      const p = l.scope === 'sub' ? hxRel(l.folder || hxDir(l.path)) : l.paths && l.paths[0];
      return `필요할 때${p ? ` · <span class="no-i18n">${esc(p)}</span>` : ''}`;
    }
    if (l.state === 'cut') return `<span class="hx-red">끝 ${hxKB(l.cutBytes)} 잘림</span> · ${hxKB(l.bytes)}`;
    return `${l.via ? '@가져옴' : HX_SCOPE[l.scope] || ''} · ${hxKB(l.bytes)}${l.lines > 200 ? ` · <span class="hx-amber">${l.lines}줄</span>` : ''}`;
  };
  const label = (l, side, yy, extra = '', lv = null) => {
    if (l.bundle) {
      const pos = side === 'l' ? `right:${W - L + 15}px;width:${L - 18}px` : `left:${R + 15}px;width:${W - R - 18}px`;
      const n = l.bundle.length;
      const bytes = l.bundle.filter((b) => b.state === 'loaded').reduce((s, b) => s + b.bytes, 0);
      const names = l.bundle.map((b) => b.name).join(', ');
      const what = lv && lv.key === 'sub' ? `필요할 때 읽는 파일 ${n}개` : `파일 ${n}개`;
      return `<button class="hx-lab ${side} bundle" data-unfold="${lv ? lv.key : ''}" style="top:${yy - 17}px;${pos}" title="${esc(names)}"><b>${what}</b><span>${bytes ? `${hxKB(bytes)} · ` : ''}눌러서 펼치기</span></button>`;
    }
    const on = key(l.path) === sel;
    const cls = `hx-lab ${side}${on ? ' on' : ''}${['ignored', 'skipped', 'other'].includes(l.state) ? ' off' : ''}`;
    const pos = side === 'l' ? `right:${W - L + 15}px;width:${L - 18}px` : `left:${R + 15}px;width:${W - R - 18}px`;
    const T = (s) => (s && window.tr ? window.tr(s) : s || ''); // a path and sentences in one tooltip: each sentence in the app language first
    const title = `${l.path}${l.why ? '\n' + T(l.why) : ''}${l.unsure ? '\n' + T(l.unsureWhy) : ''}`;
    return `<button class="${cls}" data-file="${esc(l.path)}" style="top:${yy - 17}px;${pos}" title="${esc(title)}"><b>${side === 'r' ? extra : ''}<span class="no-i18n">${esc(l.name)}</span>${side === 'l' ? extra : ''}</b><span>${meta(l)}</span></button>`;
  };
  let labels = '';
  const levelOfRow = new Map();
  for (const lv of ordered) for (const r of lv.rows) levelOfRow.set(r, lv);
  for (const r of rows) {
    const lv = levelOfRow.get(r);
    if (r.left) labels += label(r.left, 'l', r.y, r.left.unsure ? '<i class="hx-q" title="확실하지 않음">?</i>' : '', lv);
    if (r.right) labels += label(r.right, 'r', r.y, '', lv);
    if (r.center) labels += label(r.center, 'r', r.y, '<i class="hx-xfer">공용</i>');
    if (r.empty && r !== first) labels += `<span class="hx-lab-empty" style="top:${r.y - 9}px">${lv && lv.key === 'global' ? '모든 폴더에 적용되는 지침 파일이 없어요' : '이 폴더에는 지침 파일이 없어요'}</span>`;
  }
  const fold = (lv) => (lv.foldable && !lv.folded ? `<button class="hx-fold" data-unfold="${lv.key}" title="접기">${icon('chevronDown')}</button>` : '');
  const bandName = (lv) => {
    if (lv.key === 'global') return `<b>전역</b><span>모든 폴더</span>${fold(lv)}`;
    if (lv.key === 'sub') return `<b>하위 폴더</b><span>그 폴더 파일을 다룰 때</span>${fold(lv)}`;
    const p = (lv.cl[0] || lv.cx[0] || {}).folder || d.at;
    const tags = [];
    if (key(p) === key(d.at)) tags.push('<i class="here">이 폴더</i>');
    if (d.gitRoot && key(p) === key(d.gitRoot)) tags.push('<i>git 루트</i>');
    if (d.codex.root && key(p) === key(d.codex.root) && (!d.gitRoot || key(p) !== key(d.gitRoot))) tags.push('<i>Codex 루트</i>');
    return `<b class="no-i18n">${esc(basename(p))}</b>${tags.join('')}`;
  };
  for (const b of bands) labels += `<div class="hx-bandlab" style="top:${b.y - 6}px;max-width:${L - 14}px">${bandName(b.lv)}</div>`;
  // the line names, with the legend behind a small ? (shown on hover)
  const heads = `<div class="hx-linehead" style="right:${W - L - 10}px">${hxAgentDot('claude')}Claude Code</div><div class="hx-linehead" style="left:${R - 10}px">Codex${hxAgentDot('codex')}</div>
    <span class="hx-legend-wrap"><button class="hx-help" aria-label="보는 법">?</button><div class="hx-legend"><span><i class="lg on"></i>시작할 때 읽음</span><span><i class="lg lazy"></i>필요할 때 읽음</span><span><i class="lg skip"></i>안 읽음 (이름 아래에 이유)</span><span><i class="lg xfer"></i>두 에이전트가 같이 읽음</span><span><i class="lg stack"></i>여러 파일 (눌러서 펼치기)</span></div></span>`;
  const c = d.claude;
  const x = d.codex;
  // below the map: the two totals, then one line only when something here works differently
  const note = x.trust === 'untrusted' ? '<p class="hx-note warn">Codex가 이 프로젝트를 신뢰하지 않아 프로젝트 지침을 읽지 않아요</p>'
    : !x.root ? '<p class="hx-note">git 저장소가 아니라서 Codex는 이 폴더의 지침만 읽어요</p>' : '';
  const foot = `${first ? `<div class="hx-first" style="--x:${firstBoth ? M : R}px"><b>여기에 첫 역을 만들어요</b><span>${firstBoth ? '두 에이전트가 같이 읽는 AGENTS.md를 추천해요' : '지금 설정에서 Claude Code는 AGENTS.md를 읽지 않아요. 다른 방법에서 CLAUDE.md도 만들 수 있어요'}</span><div class="hx-first-acts"><button class="btn small primary" data-first="make">${icon('plus')}만들기</button><button class="btn small" data-first="other">다른 방법${icon('chevronDown')}</button></div></div>` : ''}<div class="hx-foot">
    <div class="hx-sum">${hxAgentDot('claude')}<span>Claude Code가 시작할 때</span><b class="no-i18n">${hxKB(c.total.bytes)}</b><small>${hxTok(c.total.tokens)}</small></div>
    <div class="hx-sum">${hxAgentDot('codex')}<span>Codex 프로젝트 지침</span><b class="no-i18n${x.total.cutBytes ? ' hx-red' : ''}">${hxKB(x.total.projectBytes)} / ${Math.round(x.maxBytes / 1024)} KiB</b></div>
    <div class="hx-budget${x.total.cutBytes ? ' over' : ''}"><i style="width:${Math.min(100, (x.total.projectBytes / x.maxBytes) * 100)}%"></i></div>
    ${note}
    <button class="btn small hx-merged" data-merged>${icon('book')}에이전트가 받는 글 전체 보기</button>
    ${(d.ghosts || []).filter((g) => isInside(g.path, HX.project) && !(first && g.where === 'root')).map((g) => `<button class="hx-ghost" data-ghost="${esc(g.path)}">${icon('plus')}<span>${esc(g.label)}</span></button>`).join('')}
  </div>`;
  wrap.innerHTML = `<label class="hx-find">${icon('search')}<input type="search" placeholder="모든 지침 파일에서 찾기" spellcheck="false" value="${esc(HX.find || '')}"><kbd class="pg-kbd" hidden>Esc</kbd></label><div class="hx-found" hidden></div><div class="hx-mapbody"><div class="hx-subway" style="width:${W}px;height:${H}px">${svg}${heads}${labels}</div>${foot}</div>`;
  hxFindWire(wrap, d);
  wrap.addEventListener('click', (e) => {
    const u = e.target.closest('[data-unfold]');
    if (u) {
      const k = u.dataset.unfold;
      if (HX.unfold.has(k)) HX.unfold.delete(k); else HX.unfold.add(k);
      hxRenderPane('map');
      hydrateIcons(HV.view);
      return;
    }
    const f = e.target.closest('[data-file]');
    if (f) { hxOpenFile(f.dataset.file); return; }
    const g = e.target.closest('[data-ghost]');
    if (g) { hxCreate(g.dataset.ghost, g); return; }
    if (e.target.closest('[data-merged]')) { hxCombined(); return; }
    const fb = e.target.closest('[data-first]');
    if (!fb) return;
    if (fb.dataset.first === 'make') { hxCreate(rootGhost('codex').path, fb); return; }
    const r = fb.getBoundingClientRect();
    openMenu([
      { label: '다른 방법' },
      { icon: 'edit', text: 'CLAUDE.md 만들기', hint: 'Claude Code만 읽어요', run: () => hxCreate(rootGhost('claude').path, fb) },
      { icon: 'arrowRight', text: '에이전트에게 초안 부탁', hint: 'AGENTS.md', run: () => hxAskDraft(rootGhost('codex').path) },
    ], r.left, r.bottom + 4);
  });
  return wrap;
}

/** 규칙 검색: every instruction file on the map (each read once per look), the lines with the words; one opens there. */
function hxFindWire(wrap, d) {
  const input = wrap.querySelector('.hx-find input');
  const out = wrap.querySelector('.hx-found');
  const body = wrap.querySelector('.hx-mapbody');
  const kbd = wrap.querySelector('.hx-find kbd');
  let t = 0;
  const files = () => { // (the latest look's files: the map may be drawn from an older one while the box is in use)
    const dd = HX.data || d;
    if (HX.findFor !== dd.scannedAt) {
      HX.findFor = dd.scannedAt;
      const seen = new Map();
      for (const l of [...dd.claude.layers, ...dd.codex.layers]) if (l.path && !seen.has(l.path.toLowerCase())) seen.set(l.path.toLowerCase(), l.path);
      HX.findFiles = Promise.all([...seen.values()].map((p) => window.mt.harness.read(p).then((r) => ({ path: p, lines: String((r && r.text) || '').split(/\r?\n/) })).catch(() => null)));
    }
    return HX.findFiles;
  };
  const run = async () => {
    const q = input.value.trim();
    HX.find = input.value;
    kbd.hidden = !q;
    if (!q) { out.hidden = true; out.innerHTML = ''; body.hidden = false; return; }
    const mine = ++t;
    const all = (await files()).filter(Boolean);
    if (mine !== t) return;
    const ql = q.toLowerCase();
    const hits = [];
    for (const f of all) {
      const rows = [];
      f.lines.forEach((line, i) => { if (rows.length < 30 && line.toLowerCase().includes(ql)) rows.push({ n: i + 1, line }); });
      if (rows.length) hits.push({ f, rows });
    }
    const mark = (line) => {
      const at = line.toLowerCase().indexOf(ql);
      const from = Math.max(0, at - 30);
      const cut = (from ? '…' : '') + line.slice(from, at);
      return `${esc(cut)}<mark>${esc(line.slice(at, at + q.length))}</mark>${esc(line.slice(at + q.length, at + q.length + 120))}`;
    };
    const n = hits.reduce((k, x) => k + x.rows.length, 0);
    out.innerHTML = hits.length
      ? `<div class="hx-found-n">${n}곳 · 파일 ${hits.length}개</div>${hits.map((x) => `<div class="hx-found-f"><b class="no-i18n" title="${esc(x.f.path)}">${esc(hxRel(x.f.path))}</b>${x.rows.map((r) => `<button class="hx-found-r no-i18n" data-file="${esc(x.f.path)}" data-line="${r.n}"><i>${r.n}</i><span>${mark(r.line.trim() ? r.line : ' ')}</span></button>`).join('')}</div>`).join('')}`
      : '<div class="hx-found-none">찾는 말이 있는 지침이 없어요</div>';
    if (HX.findOn) out.querySelector(`.hx-found-r[data-file="${CSS.escape(HX.findOn.file)}"][data-line="${HX.findOn.line}"]`)?.classList.add('on');
    out.hidden = false;
    body.hidden = true;
  };
  input.addEventListener('input', () => { HX.find = input.value; clearTimeout(HX.findT); HX.findT = setTimeout(run, 120); });
  wrap.addEventListener('focusout', (e) => { // the map held back while the box was in use: drawn now
    if (!HX.mapStale) return;
    const to = e.relatedTarget;
    if (to && wrap.contains(to) && to.closest('.hx-find, .hx-found')) return;
    setTimeout(() => { if (HX.mapStale && HX.open && HX.data) { hxRenderPane('map'); hydrateIcons(HV.view); } }, 0);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value && !e.isComposing) { e.preventDefault(); e.stopPropagation(); input.value = ''; run(); }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); clearTimeout(HX.findT); run().then(() => { if (input.value.trim()) out.querySelector('.hx-found-r')?.click(); }); } // (the matches for what is typed now)
    if (e.key === 'ArrowDown') { e.preventDefault(); out.querySelector('.hx-found-r')?.focus(); }
  });
  out.addEventListener('keydown', (e) => {
    const rs = [...out.querySelectorAll('.hx-found-r')];
    const k = rs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const j = k + (e.key === 'ArrowDown' ? 1 : -1); if (j < 0) input.focus(); else rs[Math.min(rs.length - 1, j)]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.focus(); }
  });
  out.addEventListener('click', (e) => {
    const r = e.target.closest('.hx-found-r');
    if (!r) return;
    e.stopPropagation();
    for (const x of out.querySelectorAll('.hx-found-r.on')) x.classList.remove('on');
    r.classList.add('on');
    HX.findOn = { file: r.dataset.file, line: r.dataset.line };
    hxOpenFile(r.dataset.file, { line: Number(r.dataset.line) || 0 });
  });
  if (input.value.trim()) run();
}
/** What each agent is given when it starts here, as one text in reading order: Claude's files with their imports put in
 *  where they stand and the comments out, Codex's files up to its limit. Each piece says the file it comes from. */
async function hxCombined() {
  let got;
  const proj = HX.project;
  const at = HX.at;
  try { got = await window.mt.harness.combined(proj, at); } catch (err) { toast(`합본을 만들지 못했어요: ${hxErr(err)}`, { icon: 'info' }); return; }
  if (!HX.open || !samePath(HX.project, proj) || !samePath(HX.at || proj, at || proj)) return; // (closed or another folder meanwhile)
  let agent = 'claude';
  const body = h('div', 'hx-cb');
  const whole = () => got[agent].filter((p) => !p.hidden).map((p) => p.text).join('\n\n');
  const draw = () => {
    const segs = got[agent];
    const bytes = agent === 'claude' ? got.claudeBytes : got.codexBytes;
    const note = agent === 'claude'
      ? (got.lazy ? `<p class="hx-hint">주석은 빼고, 가져온 파일은 그 자리에 넣었어요 · 필요할 때 읽는 파일 ${got.lazy}개는 빠져 있어요</p>` : '<p class="hx-hint">주석은 빼고, 가져온 파일은 그 자리에 넣었어요</p>')
      : `<p class="hx-hint">전역 AGENTS.md 다음에 루트부터 이 폴더까지의 파일이 붙어요 · 프로젝트 지침은 ${Math.round((got.codexMax || 32768) / 1024)} KiB에서 잘려요</p>`;
    body.innerHTML = `<div class="hx-seg hx-agentseg">${['claude', 'codex'].map((a) => `<button data-cb="${a}" class="${a === agent ? 'on' : ''}">${hxAgentDot(a)}${a === 'claude' ? 'Claude Code' : 'Codex'}</button>`).join('')}</div>
      <div class="hx-cb-sum">${hxAgentDot(agent)}<span>${agent === 'claude' ? 'Claude Code가 시작할 때 받는 글' : 'Codex가 시작할 때 받는 글'}</span><b class="no-i18n">${hxKB(bytes)}</b></div>
      ${note}
      <div class="hx-cb-list">${segs.length ? segs.map((p) => `<div class="hx-cb-part${p.depth ? ' deep' : ''}" style="--dp:${p.depth}">
          <button class="hx-cb-src" data-file="${esc(p.path)}" title="${esc(p.path)}">${p.depth ? '<i class="hx-xfer">@가져옴</i>' : ''}<span class="no-i18n">${esc(hxRel(p.path))}</span></button>
          ${p.hidden ? '<div class="hx-cb-hidden">에이전트는 이 파일의 내용도 받지만, 지침 파일이 아니라서 여기서는 보여 주지 않아요</div>' : `<pre class="no-i18n">${esc(p.text)}</pre>`}${p.cut ? `<div class="hx-cb-cut">여기서 잘려요 · <span class="no-i18n">${hxKB(p.cut)}</span> 빠짐</div>` : ''}</div>`).join('') : '<div class="hx-hint">읽는 지침이 없어요</div>'}</div>`;
    hydrateIcons(body);
  };
  draw();
  const copy = h('button', 'btn small', `${icon('copy')}전체 복사`);
  const close = h('button', 'btn small primary', '닫기');
  const right = h('div', 'foot-right');
  right.append(copy, close);
  openModal({ title: '에이전트가 받는 글', body, foot: [right], width: 760 });
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-cb]');
    if (a) { agent = a.dataset.cb; draw(); return; }
    const f = e.target.closest('[data-file]');
    if (f) { closeOverlay(); hxOpenFile(f.dataset.file); }
  });
  copy.addEventListener('click', () => { window.mt.clipWrite(whole()); toast('복사했어요', { icon: 'copy', ms: 2000 }); });
  close.addEventListener('click', () => closeOverlay());
}

/* ------------------------------------------------------------------ 도구 */
const HX_TOOL_STATE = { on: '켜짐', off: '꺼짐', lazy: '필요할 때', shadowed: '가려짐', pending: '승인 대기', rejected: '거절됨' };
const HX_TOOL_SCOPE = { managed: '관리 정책', user: '전역', project: '프로젝트', local: '로컬', plugin: '플러그인', sub: '하위 폴더', system: '시스템', admin: '관리자', synced: '동기화' };
// where a tool applies: this folder only, every folder (global), or a plugin's
const HX_TOOL_GLOBAL = new Set(['user', 'managed', 'admin', 'system', 'synced']);
const HX_TOOL_PARTS = [['here', 'folder', '이 폴더에만'], ['global', 'globe', '전역 · 모든 폴더']];
/** this folder or every folder: a plugin's tools go where the plugin was turned on */
const hxToolPart = (it) => (HX_TOOL_GLOBAL.has(it.scope === 'plugin' ? it.pluginWhere || 'user' : it.scope) ? 'global' : 'here');
function hxRenderTools(d) {
  const el = h('div', 'hx-tools');
  const t = d.tools[HX.toolsAgent];
  const agent = HX.toolsAgent;
  const pname = (id) => (t.plugins.find((p) => p.id === id) || {}).name || String(id || '').split('@')[0];
  // the chip under a row: the plugin it comes from, or its place when the heading does not already say it
  const where = (it, named) => (it.scope === 'plugin' ? (named ? '' : `<span class="hx-chip pl no-i18n" title="${esc(it.plugin || '')}">${icon('box')}${esc(pname(it.plugin))}</span>`)
    : it.scope === 'user' || it.scope === 'project' ? '' : `<span class="hx-chip">${HX_TOOL_SCOPE[it.scope] || esc(it.scope)}</span>`);
  const row = (name, sub, chip, state, extra = '', attrs = '', sw = '') => `<div class="hx-tool s-${state}"${attrs}>
      <div class="hx-tool-top"><span class="hx-tn no-i18n">${esc(name)}</span>${extra}<span class="hx-spacer"></span>${state !== 'on' && state !== 'off' ? `<span class="hx-st-t ${state}">${HX_TOOL_STATE[state] || ''}</span>` : ''}<button class="hx-sw${hxToolOn(state) ? ' on' : ''}" data-sw="${sw}" role="switch" aria-checked="${hxToolOn(state)}" title="${hxToolOn(state) ? '켜짐 · 누르면 끄기를 부탁해요' : '꺼짐 · 누르면 켜기를 부탁해요'}"><i></i></button></div>
      <div class="hx-tool-sub">${chip}<span class="no-i18n">${esc(sub || '')}</span></div></div>`;
  const group = (title, n, hint, rows) => `<section class="hx-grp"><h4>${title}<span class="hx-n no-i18n">${n}</span></h4>${hint ? `<p class="hx-hint">${hint}</p>` : ''}${rows.join('') || '<div class="hx-empty">없음</div>'}</section>`;
  const parted = (items, rowOf) => HX_TOOL_PARTS.flatMap(([k, ic, label]) => {
    const xs = items.filter((it) => hxToolPart(it) === k);
    return xs.length ? [`<div class="hx-box ${k}"><div class="hx-boxl">${icon(ic)}<span>${label}</span></div>${xs.map(rowOf).join('')}</div>`] : [];
  });
  const flags = [];
  if (agent === 'claude' && t.flags.disableAllHooks) flags.push('설정에서 훅을 모두 꺼 두었어요 (disableAllHooks)');
  if (agent === 'claude' && t.flags.allowManagedHooksOnly) flags.push('관리 정책의 훅만 돌아요');
  if (agent === 'codex' && t.flags.hooksOff) flags.push('Codex 설정에서 훅을 꺼 두었어요');
  if (agent === 'codex' && t.flags.trust === 'untrusted') flags.push('Codex가 이 프로젝트를 신뢰하지 않아 프로젝트 설정을 읽지 않아요');
  for (const f of t.settingsFiles.filter((x) => x.error)) flags.push(`읽지 못한 설정 파일이 있어요: ${hxShort(f.path, 40)}`);
  const skills = parted(t.skills, (s) => row(s.name, s.desc, where(s, true), s.state,
    `${s.who === 'user' ? '<span class="hx-chip">사용자만 부름</span>' : s.who === 'model' ? '<span class="hx-chip">모델만 부름</span>' : ''}${s.ours ? '<span class="hx-chip sh">MinsuTerm</span>' : ''}${s.kind === 'command' ? '<span class="hx-chip">명령</span>' : ''}${(s.paths || []).slice(0, 1).map((p) => `<span class="hx-chip pt no-i18n">${esc(p)}</span>`).join('')}`,
    ` data-file="${esc(s.path)}" role="button" tabindex="0" title="${esc(s.path)}"`, `skill:${t.skills.indexOf(s)}`));
  const mcp = parted(t.mcp, (m) => row(m.name, m.what ? `${m.type === 'stdio' ? '' : m.type + ' · '}${m.what}` : m.type, where(m), m.state, m.unsure ? `<span class="hx-chip lz" title="${esc(m.unsureWhy || '')}">확실하지 않음</span>` : '', '', `mcp:${t.mcp.indexOf(m)}`));
  const hooks = parted(t.hooks, (x) => row(x.event + (x.matcher ? ` · ${x.matcher}` : ''), x.what, where(x), x.state, x.type !== 'command' ? `<span class="hx-chip">${esc(x.type)}</span>` : '', '', `hook:${t.hooks.indexOf(x)}`));
  const plugins = parted(t.plugins.map((p) => ({ ...p, scope: 'plugin', pluginWhere: p.where })), (p) => row(p.name, p.desc || p.id, p.where === 'local' ? `<span class="hx-chip">${HX_TOOL_SCOPE.local}</span>` : '', p.enabled ? 'on' : 'off', `<span class="hx-chip no-i18n">${esc(p.version)}</span>`, '', `plugin:${t.plugins.findIndex((x) => x.id === p.id)}`));
  const n = (a) => { const x = d.tools[a]; return x.skills.length + x.mcp.length + x.hooks.length; };
  el.innerHTML = `
    <div class="hx-seg hx-agentseg"><button data-agent="claude" class="${agent === 'claude' ? 'on' : ''}">${hxAgentDot('claude')}Claude Code<small class="no-i18n">${n('claude')}</small></button><button data-agent="codex" class="${agent === 'codex' ? 'on' : ''}">${hxAgentDot('codex')}Codex<small class="no-i18n">${n('codex')}</small></button></div>
    ${flags.map((f) => `<div class="hx-flag">${esc(f)}</div>`).join('')}
    ${group('스킬', t.skills.length, '누르면 내용을 볼 수 있어요. 스위치를 누르면 켜고 끄기를 에이전트에게 부탁해요', skills)}
    ${group('MCP 서버', t.mcp.length, '연결 정보와 키는 보여 주지 않아요. 스위치를 누르면 켜고 끄기를 에이전트에게 부탁해요', mcp)}
    ${group('훅', t.hooks.length, '명령 속 키 모양 값은 가려요. 스위치를 누르면 켜고 끄기를 에이전트에게 부탁해요', hooks)}
    ${t.plugins.length ? group('플러그인', t.plugins.length, '', plugins) : ''}`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('.hx-agentseg [data-agent]'); // (the app itself carries a data-agent too: only these buttons)
    if (a) { HX.toolsAgent = a.dataset.agent; hxRenderPane('tools'); hydrateIcons(HV.view); return; }
    const sw = e.target.closest('[data-sw]');
    if (sw) {
      const [k, i] = sw.dataset.sw.split(':');
      const it = ({ skill: t.skills, mcp: t.mcp, hook: t.hooks, plugin: t.plugins }[k] || [])[Number(i)];
      if (it) hxAskToggle(agent, k, k === 'plugin' ? { ...it, scope: 'plugin', pluginWhere: it.where, plugin: it.id, state: it.enabled ? 'on' : 'off' } : it);
      return;
    }
    const r = e.target.closest('[data-file]');
    if (r) hxOpenFile(r.dataset.file, { readonly: true });
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('[data-sw]')) { const r = e.target.closest('[data-file]'); if (r) hxOpenFile(r.dataset.file, { readonly: true }); } });
  return el;
}

/* ------------------------------------------------------------------ a tool's switch: a guide, and what to type */
// MinsuTerm never writes skill, MCP, hook or plugin settings. The switch shows the state; pressing it opens a short
// guide that puts the one thing needed into an agent tab's input (never sent: the user presses Enter there) and says
// what to do next: the agent's own menu where it has one (Claude Code: /skills, /mcp, /plugin), else a request
const HX_KIND = { skill: '스킬', mcp: 'MCP 서버', hook: '훅', plugin: '플러그인' };
const hxTr = (s) => (window.tr ? window.tr(s) : s);
const hxToolOn = (state) => state === 'on' || state === 'lazy';
const hxToolMenu = (agent, kind) => (agent === 'claude' ? { skill: '/skills', mcp: '/mcp', plugin: '/plugin' }[kind] || '' : '');
function hxToolTitle(kind, it) { return kind === 'hook' ? `${it.event}${it.matcher ? ` · ${it.matcher}` : ''}` : kind === 'plugin' ? it.id || it.name : it.name; }
/** The request for a change the agent's menus do not make (in the app's language: fixed phrases, names as they are). */
function hxAskText({ agent, kind, it, on, global }) {
  const where = it.scope === 'plugin' ? `${hxTr('플러그인')} ${(it.plugin || '').split('@')[0]}` : hxTr(HX_TOOL_SCOPE[it.scope] || it.scope);
  const file = it.path || it.source ? prettyPath(it.path || it.source) : ''; // (the home folder as ~, as everywhere on screen)
  return [
    hxTr(on ? '다음 항목을 켜 주세요.' : '다음 항목을 꺼 주세요.'),
    `- ${hxTr('종류')}: ${hxTr(HX_KIND[kind])} (${agent === 'claude' ? 'Claude Code' : 'Codex'})`,
    `- ${hxTr('이름')}: ${hxToolTitle(kind, it)}${kind === 'hook' && it.what ? ` (${it.what})` : ''}`,
    `- ${hxTr('어디에 있는지')}: ${where}${file ? ` · ${file}` : ''}`,
    `- ${hxTr('작업 폴더')}: ${prettyPath(HX.at || HX.project)}`,
    ...(global ? [hxTr('전역 항목이에요. 이 폴더에서만 바꿀지, 모든 폴더에서 바꿀지 먼저 물어봐 주세요.')] : []),
    hxTr('알맞은 설정 파일을 고치고, 무엇을 바꿨는지 알려 주세요.'),
  ].join('\n');
}
/** A guide window: what it is about (head), numbered steps with the one thing to type (a command or a request), and
 *  where it goes: a dropdown of a new tab per agent on top, then this folder's tabs (agents, then shells where the
 *  agent is started first), then other folders'. Nothing is ever sent: the user presses Enter in the tab.
 *  { title, head, why, steps, what, cmd, agents: ['claude'] or ['claude', 'codex'], localOnly } */
function hxGuide({ title, head = '', why, steps, what, cmd = false, agents, localOnly = false, onPut = null }) {
  const AN = { claude: 'Claude Code', codex: 'Codex' };
  const here = (t) => !!t.cwd && isInside(t.cwd, HX.project);
  const near = (a, b) => Number(here(b)) - Number(here(a)) || Number(b.id === S.activeId) - Number(a.id === S.activeId) || Number(samePath(b.cwd, HX.at)) - Number(samePath(a.cwd, HX.at));
  const tabs = HX_ONLY ? [] : S.tabs.filter((t) => agents.includes(t.agent) && t.alive).sort(near).slice(0, 6);
  const shells = HX_ONLY ? [] : S.tabs.filter((t) => !t.agent && t.alive && t.status === 'shell').sort(near).slice(0, 4);
  const mk = (kind, t, agent) => ({ id: kind === 'new' ? `new:${agent}` : kind === 'shell' ? `shell:${t.id}:${agent}` : `tab:${t.id}`, kind, t, agent: agent || t.agent });
  const inShells = (list) => list.flatMap((t) => agents.map((a) => mk('shell', t, a)));
  const hereAgents = tabs.filter(here).sort((a, b) => Number(b.id === S.activeId) - Number(a.id === S.activeId)).map((t) => mk('tab', t));
  const hereShells = inShells(shells.filter(here).sort((a, b) => Number(b.id === S.activeId) - Number(a.id === S.activeId)));
  const places = [...agents.map((a) => mk('new', null, a)), ...hereAgents, ...hereShells, ...tabs.filter((t) => !here(t)).map((t) => mk('tab', t)), ...inShells(shells.filter((t) => !here(t)))];
  const byId = new Map(places.map((p) => [p.id, p]));
  // first choice: a tab of this folder (the one in view, if it is one), else a new tab here
  let target = HX_ONLY ? null : hereAgents[0] || hereShells[0] || places[0];
  const place = (p) => {
    if (!p) return '';
    if (p.kind === 'new') return `${icon('plus')}<span class="hx-ask-pn">${p.agent === 'claude' ? '새 Claude Code 탭 열기' : '새 Codex 탭 열기'}</span>`;
    const t = p.t;
    return `${p.kind === 'tab' ? icon(AGENTS[p.agent].icon) : icon('terminal')}<span class="hx-ask-pn no-i18n">${esc(tabLabel(t))}</span>${p.kind === 'shell' ? `<b class="hx-ask-start">${p.agent === 'claude' ? '여기서 Claude Code 시작' : '여기서 Codex 시작'}</b>` : ''}${here(t) ? '' : `<span class="hx-chip wn" title="${localOnly ? esc(hxTr('이 폴더 전용 항목이라 거기서는 안 보일 수 있어요')) : ''}">다른 폴더</span>`}${t.status === 'working' ? '<em>일하는 중</em>' : ''}<small class="no-i18n">${esc(shortMiddlePath(prettyPath(t.cwd || ''), 30))}</small>`;
  };
  const body = h('div', 'hx-ask');
  body.innerHTML = `${head}
    ${why ? `<p class="hx-ask-why">${why}</p>` : ''}
    <ol class="hx-ask-steps">${steps.map((s, k) => `<li><i>${k + 1}</i><div>${s.startsWith('<') ? s : `<span>${s}</span>`}${k === 0 ? `<pre class="hx-ask-what no-i18n${cmd ? ' cmd' : ''}">${esc(what)}</pre>` : ''}</div></li>`).join('')}</ol>
    ${HX_ONLY ? '<p class="hx-hint">이 창에서는 탭에 바로 넣을 수 없어요. 복사해서 붙여 넣어 주세요</p>' : `<div class="hx-ask-row"><span class="hx-ask-l">넣을 곳</span><button type="button" class="hx-ask-dd"><span class="hx-ask-cur">${place(target)}</span>${icon('chevronDown')}</button></div>`}`;
  hydrateIcons(body);
  const copy = h('button', 'btn small', `${icon('copy')}복사`);
  const put = h('button', 'btn small primary', `${icon('arrowRight')}<span>탭에 넣기</span>`);
  const label = h('span', 'composer-target');
  const sync = () => {
    put.querySelector('span').textContent = hxTr(!target ? '탭에 넣기' : target.kind === 'new' ? '새 탭 열고 넣기' : target.kind === 'shell' ? '시작하고 넣기' : '탭에 넣기');
    const a = target ? target.agent : agents[0];
    label.className = `composer-target ${a}`;
    label.innerHTML = `${icon(AGENTS[a].icon)}${AN[a]}`;
    hydrateIcons(label);
  };
  sync();
  openModal({ title, body, foot: [label, h('span', 'hx-spacer'), copy, ...(HX_ONLY ? [] : [put])], width: 560 });
  // the place list: under its button, over the window; ↑↓ Enter, Esc closes it (not the window), a press elsewhere too
  const dd = body.querySelector('.hx-ask-dd');
  let pop = null;
  let offOutside = null;
  const closePop = () => {
    if (!pop) return false;
    pop.remove();
    pop = null;
    offOutside?.();
    dd.classList.remove('open');
    if (S.overlay) { S.overlay.nodes = S.overlay.nodes.filter((n) => n.isConnected); S.overlay.escHook = null; }
    dd.focus({ preventScroll: true });
    return true;
  };
  const choose = (id) => {
    target = byId.get(id) || target;
    body.querySelector('.hx-ask-cur').innerHTML = place(target);
    hydrateIcons(body.querySelector('.hx-ask-cur'));
    sync();
    closePop();
  };
  dd?.addEventListener('click', () => {
    if (closePop()) return;
    pop = h('div', 'hx-ask-pop');
    pop.innerHTML = places.map((p) => `<button type="button" class="hx-ask-opt${p === target ? ' sel' : ''}" data-to="${esc(p.id)}">${place(p)}${p === target ? icon('check', 'hx-ask-ck') : ''}</button>`).join('');
    hydrateIcons(pop);
    overlayRoot.appendChild(pop);
    S.overlay.nodes.push(pop);
    S.overlay.escHook = () => closePop();
    dd.classList.add('open');
    const r = dd.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    pop.style.width = `${r.width}px`;
    const below = innerHeight - r.bottom > pop.offsetHeight + 12;
    pop.style.top = below ? `${r.bottom + 4}px` : `${Math.max(8, r.top - pop.offsetHeight - 4)}px`;
    pop.addEventListener('click', (e) => { const o = e.target.closest('[data-to]'); if (o) choose(o.dataset.to); });
    pop.addEventListener('keydown', (e) => {
      const opts = [...pop.querySelectorAll('.hx-ask-opt')];
      const at = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); opts[(at + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length].focus(); }
      if ((e.key === 'Enter' || e.key === ' ') && at >= 0) { e.preventDefault(); e.stopPropagation(); choose(opts[at].dataset.to); }
    });
    const outside = (e) => { if (pop && !pop.contains(e.target) && !dd.contains(e.target)) closePop(); };
    window.addEventListener('pointerdown', outside, true);
    offOutside = () => window.removeEventListener('pointerdown', outside, true);
    (pop.querySelector('.sel') || pop.querySelector('.hx-ask-opt')).focus();
  });
  dd?.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !pop) { e.preventDefault(); dd.click(); } });
  if (S.overlay) { const prev = S.overlay.cleanup; S.overlay.cleanup = () => { prev?.(); offOutside?.(); pop?.remove(); pop = null; }; }
  copy.addEventListener('click', () => { window.mt.clipWrite(what); toast('복사했어요', { icon: 'copy', ms: 2000 }); });
  put.addEventListener('click', async () => {
    const p = target;
    if (!p) return;
    const cwd = HX.at || HX.project;
    if (p.kind === 'new') {
      closeOverlay();
      onPut?.();
      if (!(await closeHarness({ focus: false }))) return;
      hxIntoTab(newAgent(p.agent, { cwd }), what, true);
      return;
    }
    const t = S.tabs.find((x) => x.id === p.t.id);
    if (!t || !t.alive) { toast('그 탭이 닫혔어요', { icon: 'info' }); return; }
    if (p.kind === 'shell') { // a shell: the agent is started there (as if typed), and gets the text once it is up
      // only at an empty prompt: not while a program runs there, not after a half-typed command
      if (t.agent || t.status !== 'shell' || !/[>$#%]$/.test(typedLine(t).trimEnd())) { toast('그 탭은 지금 명령을 받을 수 없어요. 쓰던 명령이나 돌고 있는 프로그램이 있어요', { icon: 'info' }); return; }
      closeOverlay();
      onPut?.();
      if (!(await closeHarness({ focus: false }))) return;
      if (!t.alive || t.agent || t.status !== 'shell') { toast('그 탭의 상태가 바뀌었어요. 다시 눌러 주세요', { icon: 'info' }); return; }
      activate(t.id);
      const extra = p.agent === 'claude' ? String(S.settings.claudeArgs || '').trim() : '';
      const line = [p.agent, /^[\w\s=.:/@-]+$/.test(extra) ? extra : ''].filter(Boolean).join(' ');
      window.mt.pty.write(t.id, line);
      setTimeout(() => window.mt.pty.write(t.id, '\r'), 60);
      t.typedCmd = { line, at: Date.now() }; // (where it runs: followTypedCd)
      window.mt.agent.probe([500, 1500, 3000, 5000]);
      hxIntoTab(t, what, true);
      return;
    }
    if (t.agent !== p.agent) { toast('그 탭은 이제 에이전트가 실행 중이 아니에요', { icon: 'info' }); return; }
    if (t.awaitChoice) { toast('그 탭이 선택을 기다리고 있어요. 선택한 뒤에 다시 눌러 주세요', { icon: 'info' }); return; }
    if (t.status !== 'starting' && promptText(t)) { toast('그 탭의 입력창에 쓰던 글이 있어요. 비우고 다시 눌러 주세요', { icon: 'info' }); return; }
    closeOverlay();
    onPut?.();
    if (!(await closeHarness({ focus: false }))) return; // the tab is where it goes on
    if (!t.alive || t.agent !== p.agent) { toast('그 탭은 이제 에이전트가 실행 중이 아니에요', { icon: 'info' }); return; }
    activate(t.id);
    hxIntoTab(t, what, t.status === 'starting'); // (an agent still starting is waited for)
  });
}
/** A tool's switch: how to turn it the other way (the agent's own menu where there is one, else a request). */
function hxAskToggle(agent, kind, it) {
  const on = !hxToolOn(it.state); // what is wanted: the other state
  const global = hxToolPart(it) === 'global';
  const menu = hxToolMenu(agent, kind);
  const name = esc(hxToolTitle(kind, it));
  const head = `<div class="hx-ask-it">
      <span class="hx-sw${hxToolOn(it.state) ? ' on' : ''}"><i></i></span><span class="hx-sw-to">${icon('arrowRight')}</span><span class="hx-sw${on ? ' on' : ''}"><i></i></span>
      <b class="no-i18n">${name}</b>
      <span class="hx-chip">${HX_KIND[kind]}</span>
      <span class="hx-chip ${global ? 'gl' : 'hr'}">${icon(global ? 'globe' : 'folder')}${global ? '전역 · 모든 폴더' : '이 폴더에만'}</span>
    </div>`;
  const steps = menu
    ? ['이 명령을 Claude Code 탭의 입력창에 넣어 드려요', 'Enter를 누르면 메뉴가 열려요', `<span>목록에서 이 항목을 찾아 켜거나 끄세요</span>&nbsp;<b class="no-i18n">${name}</b>`]
    : [agent === 'claude' ? '이 부탁을 Claude Code 탭의 입력창에 넣어 드려요' : '이 부탁을 Codex 탭의 입력창에 넣어 드려요', '확인하고 Enter를 누르면 에이전트가 알맞은 설정 파일을 고쳐요', '바뀌면 도구 목록에 바로 보여요'];
  hxGuide({ title: on ? '켜는 방법' : '끄는 방법', head, why: 'MinsuTerm은 설정 파일을 직접 바꾸지 않아요. 필요한 것만 탭에 넣어 드릴게요.', steps, what: menu || hxAskText({ agent, kind, it, on, global }), cmd: !!menu, agents: [agent], localOnly: !global });
}
/** A check's 부탁하기: a request to fix it, for Claude Code or Codex. */
function hxAskCheck(c) {
  const LV = { error: '문제', warn: '주의', info: '참고' };
  const rel = (p) => prettyPath(p); // (the whole path, the home folder as ~: the tab it goes to may work in another folder)
  const what = [
    hxTr('하네스 점검에서 나온 문제를 고쳐 주세요.'),
    `- ${hxTr('문제')}: ${hxTr(c.text)}`,
    ...(c.file ? [`- ${hxTr('고칠 파일')}: ${rel(c.file)}${c.line ? `:${c.line}` : ''}`] : []),
    `- ${hxTr('작업 폴더')}: ${prettyPath(HX.at || HX.project)}`,
    hxTr('고치기 전에 어떻게 고칠지 먼저 짧게 알려 주세요.'),
  ].join('\n');
  hxGuide({
    title: '에이전트에게 부탁',
    head: `<div class="hx-ask-it hx-ask-chk ${c.level}"><span class="hx-lv">${LV[c.level]}</span><span>${esc(c.text)}</span></div>`,
    why: '고치는 일은 에이전트에게 맡겨요. 부탁 문장을 탭의 입력창에 넣어 드릴게요.',
    steps: ['이 부탁을 에이전트 탭의 입력창에 넣어 드려요', '확인하고 Enter를 누르면 에이전트가 고쳐요', '고쳐지면 점검 목록에서 사라져요'],
    what, agents: ['claude', 'codex'],
  });
}
/** A folder without instructions: the agent writes the first ones (/init: Claude Code makes CLAUDE.md, Codex AGENTS.md). */
/** A CLAUDE.md or AGENTS.md of a folder here (not the global ones: a folder tells nothing about those). */
const hxDraftable = (file) => !!file && !!HX.project && isInside(file, HX.project) && /(^|[\\/])(CLAUDE|AGENTS)\.md$/i.test(file);
/** A new or empty instruction file: an agent looks the folder over and writes its draft there (MinsuTerm only hands
 *  over the request, as 부탁하기 does). */
function hxAskDraft(file) {
  const d = HX.data;
  const dir = hxDir(file).replace(/[\\/]\.claude$/i, ''); // (.claude/CLAUDE.md is its folder's)
  const name = basename(file);
  const isClaude = /CLAUDE\.md$/i.test(name);
  const folder = d && d.tree ? d.tree.folders.find((f) => samePath(f.path, dir)) : null;
  const has = (n) => !!(folder && folder.has && folder.has[n]);
  const sub = !samePath(dir, HX.project);
  // what goes in follows the official guidance: Claude Code's memory and best-practices pages for CLAUDE.md (only what
  // the code does not tell, no layout, short and checkable, under 200 lines; @AGENTS.md on top when one is beside it),
  // agents.md and the Codex guide for AGENTS.md (a README for agents, concise, within Codex's limit)
  const B = (s) => `- ${hxTr(s)}`;
  const what = (isClaude ? [
    hxTr('이 폴더를 살펴보고 CLAUDE.md 초안을 써 주세요. Claude Code 공식 문서의 CLAUDE.md 작성 지침을 따라 주세요.'),
    `- ${hxTr('쓸 파일')}: ${prettyPath(file)}`,
    `- ${hxTr('살펴볼 폴더')}: ${prettyPath(dir)}`,
    B('먼저 README, 패키지와 빌드 설정, 테스트와 CI 설정을 살펴보세요.'),
    B('코드만 읽어서는 알 수 없는 것만 쓰세요: 정확한 빌드, 테스트, 타입 검사, 린트 명령(테스트 하나만 돌리는 법 포함), 코드에 드러나지 않는 규칙과 결정, 헷갈리기 쉬운 곳(따라 하면 안 되는 옛 방식, 안 쓰는 것처럼 보여도 쓰이는 폴더).'),
    B('폴더 구조나 아키텍처 설명은 넣지 마세요. 에이전트는 코드를 직접 읽어요.'),
    B('"명령", "규칙", "주의할 점" 같은 제목 아래 짧은 목록으로, 200줄 이하로 써 주세요.'),
    B('확인할 수 있게 구체적으로 써 주세요. 예: "코드를 깔끔하게" 대신 "들여쓰기는 2칸".'),
    B('여러 단계로 된 절차는 스킬로, 특정 폴더에만 맞는 규칙은 .claude/rules의 paths 규칙으로 두자고 제안만 해 주세요. 개인 취향은 CLAUDE.local.md에 둘 것이고, 비밀 정보는 넣지 마세요.'),
    ...(has('AGENTS.md') ? [B('같은 폴더에 AGENTS.md가 있어요. 맨 위에 @AGENTS.md를 두고, 그 아래 "Claude Code" 제목에 Claude Code에만 필요한 것만 더해 주세요. AGENTS.md와 겹치는 내용은 쓰지 마세요.')] : []),
  ] : [
    hxTr('이 폴더를 살펴보고 AGENTS.md 초안을 써 주세요. AGENTS.md는 에이전트를 위한 README예요(agents.md 관례).'),
    `- ${hxTr('쓸 파일')}: ${prettyPath(file)}`,
    `- ${hxTr('살펴볼 폴더')}: ${prettyPath(dir)}`,
    B('먼저 README, 패키지와 빌드 설정, 테스트와 CI 설정을 살펴보세요.'),
    B('담을 것: 프로젝트 소개 한두 줄, 설치와 실행, 빌드, 테스트 명령, 코드 스타일과 규칙, 테스트 방법, 보안상 주의할 점, 커밋과 PR 규칙.'),
    B('README에 이미 있는 설명은 되풀이하지 말고, 에이전트가 일하는 데 필요한 것만 짧은 목록으로 써 주세요. 포맷과 린트처럼 CI가 검사하는 것은 길게 쓰지 마세요.'),
    B('확인할 수 있게 구체적으로 써 주세요. 예: "코드를 깔끔하게" 대신 "들여쓰기는 2칸".'),
    `- ${hxTr(`짧게 써 주세요. Codex는 프로젝트 지침을 합쳐 ${Math.round(((d && d.codex.maxBytes) || 32768) / 1024)} KiB까지만 읽고, Claude Code는 200줄 이하를 권해요. 비밀 정보는 넣지 마세요.`)}`,
    ...(has('CLAUDE.md') ? [B('같은 폴더에 CLAUDE.md가 있어요. Claude Code도 이 파일을 읽게 하려면 CLAUDE.md 맨 위에 @AGENTS.md가 있어야 해요. 그렇게 할지 저에게 물어봐 주세요.')] : []),
  ]).concat([
    ...(sub ? [B('이 하위 폴더에만 해당하는 내용만 쓰고, 위 폴더의 지침과 겹치지 않게 해 주세요.')] : []),
    B('코드와 설정에서 확인한 것만 쓰고, 모르는 것은 추측하지 말고 저에게 물어봐 주세요.'),
    hxTr('다 쓰면 무엇을 담았고 무엇을 뺐는지 짧게 알려 주세요.'),
  ]).join('\n');
  hxGuide({
    title: '에이전트에게 초안 부탁',
    head: `<div class="hx-ask-it"><b class="no-i18n">${esc(name)}</b><span class="hx-chip sh">초안</span><small class="hx-ask-path no-i18n" title="${esc(file)}">${esc(hxShort(file, 44))}</small></div>`,
    why: '에이전트가 이 폴더의 코드와 설정을 살펴보고 공식 작성 지침에 맞춰 초안을 써요. 부탁 문장을 탭의 입력창에 넣어 드릴게요.',
    steps: ['이 부탁을 에이전트 탭의 입력창에 넣어 드려요', '확인하고 Enter를 누르면 에이전트가 폴더를 살펴보고 초안을 써요', '다 쓰면 지도에 나오고, 규칙 보기에서 다듬을 수 있어요'],
    what, agents: isClaude ? ['claude', 'codex'] : ['codex', 'claude'],
    // the same file open as a new one not saved yet gives way (the agent writes it; nothing to ask about on closing)
    onPut: () => { if (HX.drawer && samePath(HX.drawer.file, file) && HX.drawer.create) hxEmptyEditor(); },
  });
}
/** Into an agent tab's input, never sent (the user presses Enter there). A new tab is waited for: the agent up and
 *  asking nothing (a new folder's trust question stays the user's). */
const HX_CTRL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
function hxIntoTab(t, v, fresh) {
  const ESC = String.fromCharCode(27);
  v = String(v).replace(HX_CTRL, ''); // (keeps tabs and new lines)
  const go = () => {
    window.mt.pty.write(t.id, v.includes('\n') ? `${ESC}[200~${v}${ESC}[201~` : v); // (several lines: one prompt, as the composer sends it)
    t.term.focus();
    toast('입력창에 넣었어요. 확인하고 Enter를 누르세요', { icon: 'check', ms: 4000 });
  };
  if (!fresh) { go(); return; }
  const t0 = Date.now();
  const tick = () => {
    if (!t || t.closed || t.status === 'exited') return; // (gone; while it starts it is not alive yet: wait)
    if (t.alive && t.agent && t.status === 'ready' && !t.awaitChoice) {
      setTimeout(() => { if (!t.alive || t.awaitChoice) setTimeout(tick, 400); else go(); }, 1500); // (its input box is drawn a moment after it starts)
      return;
    }
    if (Date.now() - t0 > 45000) { window.mt.clipWrite(v); toast('새 탭이 오래 걸려 복사해 두었어요. 그 탭에 붙여 넣어 주세요', { icon: 'info', ms: 6000 }); return; }
    setTimeout(tick, 300);
  };
  tick();
}

/* ------------------------------------------------------------------ 점검 */
function hxRenderChecks(d) {
  const el = h('div', 'hx-checks');
  if (!d.checks.length) { el.innerHTML = `<div class="hx-allgood">${icon('check')}<b>고칠 것이 없어요</b><span>지침 길이, 가져오기, 두 에이전트의 지침이 모두 괜찮아요</span></div>`; return el; }
  const order = { error: 0, warn: 1, info: 2 };
  const LV = { error: '문제', warn: '주의', info: '참고' };
  const sorted = d.checks.slice().sort((a, b) => order[a.level] - order[b.level]);
  el.innerHTML = sorted.map((c, i) => `
    <div class="hx-chk ${c.level}">
      <span class="hx-lv">${LV[c.level]}</span>
      <div class="hx-chk-text"><span>${esc(c.text)}</span>
        ${c.file ? `<button class="hx-chk-file no-i18n" data-file="${esc(c.file)}" data-line="${c.line || 0}">${esc(hxRel(c.file))}${c.line ? `:${c.line}` : ''}</button>` : ''}
        ${c.sample ? `<span class="hx-sample no-i18n">${esc(c.sample)}</span>` : ''}
        ${c.fix === 'unify' || !HX_ONLY ? `<div class="hx-chk-acts">${c.fix === 'unify' ? `<button class="btn small hx-fix" data-unify="${i}">${icon('link')}하나로 묶기</button>` : ''}${HX_ONLY ? '' : `<button class="btn small hx-ask-btn" data-ask="${i}" title="고쳐 달라는 부탁을 에이전트 탭에 넣어요">${icon('arrowRight')}부탁하기</button>`}</div>` : ''}</div>
    </div>`).join('');
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-file]');
    if (f) { hxOpenFile(f.dataset.file, { line: Number(f.dataset.line) || 0 }); return; }
    const u = e.target.closest('[data-unify]');
    if (u) hxUnify(sorted[Number(u.dataset.unify)].pair);
    const k = e.target.closest('[data-ask]');
    if (k) hxAskCheck(sorted[Number(k.dataset.ask)]);
  });
  return el;
}

/* ------------------------------------------------------------------ the sidebar's dot (folders whose last look found warnings) */
const HX_ISSUES = new Map(); // folder path (lowercase) -> warning count
function hxIssues(project, d) {
  const n = d.checks.filter((c) => c.level !== 'info').length;
  const k = String(project).toLowerCase();
  if ((HX_ISSUES.get(k) || 0) === n) return;
  HX_ISSUES.set(k, n);
  renderProjects();
}
const harnessIssues = (dir) => HX_ISSUES.get(String(dir).toLowerCase()) || 0;
// once 하네스 has been opened on this computer, the main window looks at every folder a while after it starts, one at a
// time and slowly, so the folder buttons show their warnings before anything is opened (read when the app starts: a
// first run never does it)
const HX_USED_KEY = 'mt-harness-used';
const HX_USED = localStorage.getItem(HX_USED_KEY) === '1';
async function hxLookAll(force) {
  if ((!HX_USED && !force) || SOLO) return;
  for (const p of S.projects.filter((x) => !x.temp)) {
    if (HX.open && samePath(HX.project, p.path)) continue; // (open: its own look counts)
    try { hxIssues(p.path, await window.mt.harness.scan(p.path, p.path, { light: true })); } catch { /* a folder gone or unreadable: no dot */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
window.addEventListener('load', () => setTimeout(hxLookAll, 8000));

/* ------------------------------------------------------------------ watching: changes made outside (an agent editing CLAUDE.md) */
function hxWatch() {
  hxUnwatch();
  const project = HX.project;
  window.mt.harness.watch(project).catch(() => {});
  const off = window.mt.harness.onChanged((m) => {
    if (!HX.open || !m || !samePath(m.project, project)) return;
    const dr = HX.drawer;
    if (dr && m.paths.some((p) => samePath(p, dr.file))) hxOutside(dr);
    clearTimeout(HX.rescanTimer);
    HX.rescanTimer = setTimeout(() => hxScan({ quiet: true }), 400);
  });
  HX.watchOff = () => { off(); window.mt.harness.unwatch(project); };
}
function hxUnwatch() {
  clearTimeout(HX.rescanTimer); // a rescan the old folder asked for must not land on the next one
  if (HX.watchOff) { HX.watchOff(); HX.watchOff = null; }
}

/* ------------------------------------------------------------------ the editor (right) */
function hxEmptyEditor() {
  HX.drawer = null;
  if (!HV) return;
  HV.ed.innerHTML = `<div class="hx-ed-empty">${icon('harness')}<b>왼쪽 지도에서 파일을 고르세요</b><span>역을 누르면 여기서 고칠 수 있어요. 저장하기 전 내용은 기록에 남아요</span></div>`;
  if (HX.data) hxRenderPane('map');
}

/** Facts the map knows about a file (which agents read it, how), for the editor's header. */
function hxFacts(file) {
  const d = HX.data;
  if (!d) return [];
  return [...d.claude.layers, ...d.codex.layers].filter((l) => samePath(l.path, file));
}

async function hxOpenFile(file, { line = 0, readonly = false, text: given, create = false, quiet = false } = {}) {
  if (HX.drawer && samePath(HX.drawer.file, file) && !create) { if (line) hxGoLine(HX.drawer, line); return; }
  if (HX.drawer && HX.drawer.cardCommit) HX.drawer.cardCommit(); // (a card being written counts as an edit)
  if (HX.drawer && HX.drawer.dirty) {
    const ok = await confirmDialog('저장하지 않은 내용', '편집 중인 내용을 저장하지 않고 다른 파일을 열까요?', '열기');
    if (!ok) return;
  }
  let r;
  try { r = create ? { exists: false, text: given || '', hash: null } : await window.mt.harness.read(file); } catch (err) {
    if (!quiet) toast(`파일을 열지 못했어요: ${hxErr(err)}`, { icon: 'info' });
    return;
  }
  if (r.tooBig) { toast('너무 큰 파일이라 열 수 없어요', { icon: 'info' }); return; }
  const facts = hxFacts(file);
  const foreign = !create && r.enc && r.enc !== 'utf8'; // (UTF-16 or other bytes: shown, never written, the words would be lost)
  if (foreign && !quiet) toast('UTF-8이 아닌 파일이라 읽기만 할 수 있어요', { icon: 'info', ms: 4000 });
  const ro = readonly || foreign || facts.some((l) => l.readonly) || /[\\/]SKILL\.md$/i.test(file) || (!facts.length && !create);
  // the editor works on \n text; a CRLF file keeps its line endings when written (main)
  const text0 = String(create ? given || '' : r.text || '').replace(/\r\n/g, '\n');
  const view = localStorage.getItem(HX_VIEW_KEY) === 'raw' ? 'raw' : 'blocks';
  const dr = { file, base: r.hash, saved: create ? '' : text0, text: text0, dirty: create, readonly: ro, create, view, side: 'none', facts }; // (no preview beside the raw text: the 규칙 view is the page as it reads)
  HX.drawer = dr;
  hxEditor(dr, quiet);
  if (HX.data) hxRenderPane('map');
  if (line) requestAnimationFrame(() => hxGoLine(dr, line));
}

const HX_GLOBAL_RE = new RegExp('[\\\\/](\\.claude[\\\\/]CLAUDE\\.md|\\.codex[\\\\/]AGENTS(\\.override)?\\.md)$', 'i');
function hxEdChips(dr) {
  const chips = [];
  for (const l of dr.facts) chips.push(`<span class="hx-chip ag">${hxAgentDot(l.agent)}${l.agent === 'claude' ? 'Claude' : 'Codex'} · ${HX_STATE[l.state] || ''}</span>`);
  if (dr.global) chips.push('<span class="hx-chip wn">모든 폴더에 적용</span>');
  if (dr.readonly) chips.push('<span class="hx-chip">읽기 전용</span>');
  if (dr.create) chips.push('<span class="hx-chip sh">새 파일</span>');
  dr.el.chips.innerHTML = chips.join('');
}

function hxEditor(dr, quiet) {
  const el = HV.ed;
  hxdSlashClose();
  hxdBarHide();
  hxdLangClose();
  dr.global = HX_GLOBAL_RE.test(dr.file) && !isInside(dr.file, HX.project);
  el.innerHTML = `
    <div class="hx-dhead">
      <div class="hx-dtitle"><b class="no-i18n">${esc(basename(dr.file))}</b><button type="button" class="hx-dirty" data-act="unsaved" hidden title="저장한 내용과 비교해 보기">저장 안 함</button><span class="hx-dchips"></span></div>
      <div class="hx-dtools">
        <span class="hx-dpath no-i18n" title="${esc(dr.file)}">${esc(hxShort(dr.file, 70))}</span>
        <span class="hx-spacer"></span>
        <div class="hx-seg hx-viewseg" title="규칙: 문서처럼 바로 쓰기 · 원문: 마크다운 그대로"><button data-view="blocks">${icon('list')}규칙</button><button data-view="raw">${icon('code')}원문</button></div>
        <button class="icon-btn hx-undo" data-dact="undo" title="되돌리기 (Ctrl+Z) · 다시 하기는 Ctrl+Y">${icon('undo')}</button>
        <button class="hx-tog" data-side="history" title="저장 기록과 되돌리기">${icon('history')}기록</button>
        ${dr.readonly ? '' : `<button class="btn small primary hx-save" data-dact="save" title="저장 (Ctrl+S)">${icon('check')}저장</button>`}
      </div>
      <div class="hx-banner" hidden></div>
    </div>
    <div class="hx-dbody">
      <nav class="hx-outline"></nav>
      <div class="hxb" tabindex="-1"></div>
      <div class="hx-code">
        <div class="hx-edit">
          <pre class="hx-hl no-i18n" aria-hidden="true"></pre>
          <textarea class="hx-ta no-i18n" spellcheck="false" ${dr.readonly ? 'readonly' : ''}></textarea>
        </div>
      </div>
      <div class="hx-side"></div>
    </div>`;
  // the text and its highlight grow together inside one scroller (.hx-code): wrapped lines keep their numbers
  const ta = el.querySelector('.hx-ta');
  ta.value = dr.text;
  dr.el = { root: el, ta, hl: el.querySelector('.hx-hl'), code: el.querySelector('.hx-code'), outline: el.querySelector('.hx-outline'), side: el.querySelector('.hx-side'),
    blocks: el.querySelector('.hxb'), banner: el.querySelector('.hx-banner'), dirty: el.querySelector('.hx-dirty'), chips: el.querySelector('.hx-dchips') };
  hxEdChips(dr);
  hxdWire(dr);
  ta.addEventListener('scroll', () => { ta.scrollTop = 0; ta.scrollLeft = 0; });
  ta.addEventListener('input', () => {
    dr.text = ta.value;
    hxDirty(dr);
    hxPaint(dr);
    if (dr.side === 'preview') { clearTimeout(dr.pv); dr.pv = setTimeout(() => { if (dr.side === 'preview' && HX.drawer === dr) dr.el.side.firstElementChild.innerHTML = hxMarkdown(dr.text); }, 250); }
  });
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation(); // what is typed here never reaches the app shortcuts or the terminal
    if (modKey(e) && e.key.toLowerCase() === 's') { e.preventDefault(); hxSave(dr); return; }
    if (hxRawKeys(e, dr)) { e.preventDefault(); return; } // lists carry on, Tab indents the selected lines
    if (e.key === 'Tab' && !e.isComposing && !dr.readonly) { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); ta.blur(); HV.view.querySelector('.hx-close').focus({ preventScroll: true }); }
  });
  el.onclick = (e) => {
    if (e.target.closest('[data-act="unsaved"]')) { if (dr.cardCommit) dr.cardCommit(); hxUnsaved(dr); return; }
    const v = e.target.closest('[data-view]');
    if (v) {
      if (v.dataset.view === 'raw' && dr.view !== 'raw') dr.rawFrom = dr.text;
      else if (v.dataset.view !== 'raw' && dr.view === 'raw' && dr.rawFrom != null) {
        if (dr.rawFrom !== dr.text) { dr.undo = dr.undo || []; dr.undo.push({ text: dr.rawFrom, focus: null }); dr.redo = []; }
        dr.rawFrom = null;
      }
      dr.view = v.dataset.view; localStorage.setItem(HX_VIEW_KEY, dr.view); hxdSlashClose(); hxdBarHide(); hxdLangClose(); hxSide(dr); if (dr.view === 'raw' && !dr.readonly) ta.focus({ preventScroll: true }); return; }
    const sd = e.target.closest('[data-side]');
    if (sd) { dr.side = dr.side === sd.dataset.side ? 'none' : sd.dataset.side; hxSide(dr); return; }
    const a = e.target.closest('[data-dact]')?.dataset.dact;
    if (a === 'undo' || a === 'redo') { hxbUndo(dr, a === 'redo'); return; }
    if (a === 'save') hxSave(dr);
    else if (a === 'reload') hxReload(dr);
    else if (a === 'compare') hxCompare(dr);
    else if (a === 'keep') { dr.el.banner.hidden = true; }
    const o = e.target.closest('[data-goline]');
    if (o) hxGoLine(dr, Number(o.dataset.goline));
  };
  hxPaint(dr);
  hxSide(dr);
  hxDirty(dr);
  hydrateIcons(el);
  if (!dr.readonly && !quiet) ta.focus({ preventScroll: true });
}

function hxDirty(dr) {
  dr.dirty = dr.create || dr.text !== dr.saved;
  if (dr.el) dr.el.dirty.hidden = !dr.dirty;
}

/** The highlight layer, the line numbers and the outline, from the text. */
function hxPaint(dr) {
  const text = dr.text;
  const lines = text.split('\n');
  const broken = new Set();
  if (HX.data) for (const b of HX.data.claude.broken) if (samePath(b.from, dr.file)) broken.add(b.line);
  let fence = '';
  let inComment = false;
  const out = [];
  const inline = (s) => esc(s)
    .replace(HX_CODE_HL_RE, '<span class="k-code">$&</span>')
    .replace(/(^|\s)(@[^\s&<>()]+)/g, '$1<span class="k-imp">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<span class="k-b">$&</span>');
  lines.forEach((l, i) => {
    let cls = '';
    let body;
    const f = HX_FENCE_RE.exec(l);
    if (fence) { body = esc(l); cls = 'k-fence'; if (f && f[1][0] === fence[0]) fence = ''; }
    else if (f) { fence = f[1]; body = esc(l); cls = 'k-fence'; }
    else if (inComment || l.trim().startsWith('<!--')) { body = esc(l); cls = 'k-com'; inComment = !l.includes('-->'); }
    else if (/^#{1,6}\s/.test(l)) { body = esc(l); cls = 'k-h k-h' + Math.min(3, l.match(/^#+/)[0].length); }
    else {
      body = inline(l).replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="k-li">$2</span>$3');
      if (/^\s*&gt;/.test(body)) cls = 'k-q';
    }
    if (broken.has(i + 1)) cls += ' k-broken';
    out.push(`<span class="ln ${cls}" data-n="${i + 1}">${body || ' '}</span>`);
  });
  dr.el.hl.innerHTML = out.join('');
  if (dr.outlineDrag) return; // a heading is being dragged: its rows stay as they are until it is dropped
  const secs = hxSections(text);
  const total = Math.max(1, text.length);
  dr.el.outline.innerHTML = `<div class="hx-otitle">목차</div>${secs.length ? secs.map((s, k) => `<button class="hx-orow no-i18n l${Math.min(3, s.level)}${dr.readonly ? '' : ' sortable'}" data-goline="${s.line}" data-sec="${k}" title="${esc(s.text)}">
      <span class="no-i18n">${esc(s.text)}</span><i style="width:${Math.max(3, Math.round((s.chars / total) * 100))}%"></i></button>`).join('') : '<p class="hx-hint">제목(#)이 없어요</p>'}
    ${secs.length > 1 && !dr.readonly ? '<p class="hx-hint hx-ohint">끌어서 구역 순서를 바꿔요</p>' : ''}
    <div class="hx-ofoot no-i18n">${lines.length} · ${hxKB(new Blob([text]).size)}</div>`;
  hxOutlineDrag(dr);
  if (dr.view === 'blocks' && dr.line0) hxdSpy(dr); // the section in view stays lit
}

function hxSections(text) { // the titles as the file model reads them (not in code, memos or front matter)
  const bs = hxbParse(text);
  const lines = text.split('\n');
  const out = [];
  let ln = 1;
  bs.forEach((b) => { if (b.type === 'heading') out.push({ level: b.level, text: b.text, line: ln }); ln += b.lines.length; });
  out.forEach((s, k) => {
    let end = lines.length;
    for (let j = k + 1; j < out.length; j++) if (out[j].level <= s.level) { end = out[j].line - 1; break; }
    s.end = end;
    s.chars = lines.slice(s.line - 1, end).join('\n').length;
  });
  return out;
}

/** Drag a heading in the outline to move its whole section (sub-sections with it) before another of the same level. */
function hxOutlineDrag(dr) {
  if (dr.readonly) return;
  const box = dr.el.outline;
  box.onpointerdown = (e) => {
    const row = e.target.closest('.hx-orow');
    if (!row || e.button !== 0) return;
    if (dr.cardCommit) dr.cardCommit(); // a code or memo card being written goes in first
    const secs = hxSections(dr.text);
    const from = Number(row.dataset.sec);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moving = false;
    let to = -1;
    const rows = [...box.querySelectorAll('.hx-orow')];
    dr.outlineDrag = true;
    const move = (ev) => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!moving) { moving = true; row.classList.add('dragging'); box.classList.add('sorting'); }
      rows.forEach((r) => r.classList.remove('drop', 'drop-after'));
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hx-orow');
      to = over && box.contains(over) ? Number(over.dataset.sec) : -1;
      if (to < 0 || to === from || secs[to].level !== secs[from].level) { to = -1; return; }
      over.classList.add(to > from ? 'drop-after' : 'drop');
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      rows.forEach((r) => r.classList.remove('drop', 'drop-after', 'dragging'));
      box.classList.remove('sorting');
      dr.outlineDrag = false;
      if (!moving) return; // a plain click: the row's click goes to its line
      // the click that ends a drag is not a jump to the line; dropped elsewhere, there is no click: stop waiting for one
      const eat = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      box.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => box.removeEventListener('click', eat, { capture: true }), 0);
      if (to >= 0) hxSetText(dr, hxMoveSection(dr.text, secs[from], secs[to]));
      else hxPaint(dr);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
}
/** The text with section a moved: before section b when b is above it, after b when b is below. Only the seams get
 *  a blank line added or a doubled one taken out: nothing else in the file changes. */
function hxMoveSection(text, a, b) {
  const rest = text.split('\n');
  const block = rest.slice(a.line - 1, a.end);
  while (block.length > 1 && !block[block.length - 1].trim()) block.pop(); // its trailing blank lines stay where they were
  rest.splice(a.line - 1, block.length);
  const cut = a.line - 1;
  let removed = block.length;
  if (cut > 0 && cut < rest.length && !rest[cut - 1].trim() && !rest[cut].trim()) { rest.splice(cut, 1); removed++; }
  let ins = b.line < a.line ? b.line - 1 : b.end - removed;
  if (ins >= rest.length && rest[rest.length - 1] === '') ins = rest.length - 1; // before the final newline
  const put = block.slice();
  if (ins > 0 && rest[ins - 1].trim()) put.unshift('');
  if (ins < rest.length && rest[ins].trim()) put.push('');
  rest.splice(ins, 0, ...put);
  return rest.join('\n').replace(/\n*$/, text.match(/\n*$/)[0]); // (the file ends as it did)
}

const hxLF = (s) => String(s || '').replace(/\r\n/g, '\n');
/** Replace the editor text as one undoable step (the raw view's own undo, and the block view's). */
function hxSetText(dr, text) {
  text = hxLF(text);
  if (dr.view === 'blocks') { hxbApply(dr, hxbParse(text), { renumber: false }); return; } // (as written: no numbers counted again)
  const ta = dr.el.ta;
  const ro = ta.readOnly;
  ta.readOnly = false;
  ta.focus({ preventScroll: true });
  ta.select();
  if (!document.execCommand('insertText', false, text) || ta.value !== text) ta.value = text;
  ta.readOnly = ro;
  dr.text = ta.value;
  hxDirty(dr);
  hxPaint(dr);
  if (dr.side === 'preview') hxSide(dr);
}

function hxGoLine(dr, line) {
  if (!dr || !dr.el) return;
  if (dr.view === 'blocks') { // the rule holding that line (a title goes to the top)
    let ln = 1;
    let idx = -1;
    (dr.blocks || []).forEach((b, i) => { if (idx < 0 && line >= ln && line < ln + b.lines.length) idx = i; ln += b.lines.length; });
    while (idx >= 0 && dr.blocks[idx] && dr.blocks[idx].type === 'blank') idx++;
    const el = idx >= 0 ? dr.el.blocks.querySelector(`.hxd-r[data-b="${idx}"]`) : null;
    if (!el) return;
    el.scrollIntoView({ block: el.classList.contains('hxd-h') ? 'start' : 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    return;
  }
  const lines = dr.text.split('\n');
  const at = lines.slice(0, Math.max(0, line - 1)).join('\n').length + (line > 1 ? 1 : 0);
  const ta = dr.el.ta;
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(at, at + (lines[line - 1] || '').length);
  const row = dr.el.hl.querySelectorAll('.ln')[line - 1];
  if (!row) return;
  dr.el.code.scrollTop = Math.max(0, row.offsetTop - 60);
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

/* the view (blocks or raw text) and the side (preview, history or nothing) */
function hxSide(dr) {
  const root = dr.el.root;
  const blocks = dr.view === 'blocks';
  if (dr.side === 'preview') dr.side = 'none';
  for (const b of root.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === dr.view);
  for (const b of root.querySelectorAll('[data-side]')) b.classList.toggle('on', b.dataset.side === dr.side);
  for (const b of root.querySelectorAll('.hx-undo')) b.hidden = !blocks || dr.readonly;
  const body = root.querySelector('.hx-dbody');
  body.classList.toggle('no-side', dr.side === 'none');
  body.classList.toggle('blocks', blocks);
  if (blocks) hxdRender(dr);
  const side = dr.el.side;
  if (dr.side === 'preview') side.innerHTML = `<div class="hx-md no-i18n">${hxMarkdown(dr.text)}</div>`;
  else if (dr.side === 'history') hxHistory(dr);
  else side.replaceChildren();
}

async function hxHistory(dr) {
  const side = dr.el.side;
  side.innerHTML = '<div class="hx-hist"><div class="hx-otitle">저장 기록</div></div>';
  let list = [];
  try { list = await window.mt.harness.history(dr.file); } catch { list = []; }
  if (dr !== HX.drawer || dr.side !== 'history') return;
  const KIND = { before: '저장하기 전', saved: '하네스에서 저장', outside: '밖에서 바뀜' };
  const when = (at) => { const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(at); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
  side.innerHTML = `<div class="hx-hist"><div class="hx-otitle">저장 기록</div>
    ${list.length ? '' : '<p class="hx-hint">하네스에서 저장하면 저장하기 전 내용이 여기 남아요</p>'}
    <div class="hx-hlist">${list.map((x) => { const t = when(x.at); return `<button class="hx-hrow k-${esc(x.kind)}" data-snap="${esc(x.id)}"><b>${KIND[x.kind] || esc(x.kind)}</b><span class="no-i18n">${t ? relTime(t.getTime()) : ''}</span><small class="no-i18n">${t ? t.toLocaleString() : ''} · ${hxKB(x.bytes)}</small></button>`; }).join('')}</div>
    <div class="hx-snapview"></div></div>`;
  side.querySelectorAll('[data-snap]').forEach((b) => b.addEventListener('click', async () => {
    side.querySelectorAll('.hx-hrow.on').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const text = await window.mt.harness.snapshot(dr.file, b.dataset.snap).catch(() => null);
    if (text == null || dr !== HX.drawer) return;
    const view = side.querySelector('.hx-snapview');
    view.innerHTML = `<div class="hx-snaphead"><span>지금 편집 중인 내용과 비교</span>${dr.readonly ? '' : '<button class="btn small" data-restore>이 내용으로 되돌리기</button>'}</div>${hxDiffHTML(text, dr.text)}`;
    view.querySelector('[data-restore]')?.addEventListener('click', () => { hxSetText(dr, text); toast('되돌린 내용을 편집기에 넣었어요. 저장하면 반영돼요', { icon: 'history' }); });
  }));
}

async function hxSave(dr) {
  if (dr.cardCommit && !dr.readonly) dr.cardCommit(); // (a card being written: its words go in first, so they count)
  if (dr.readonly || dr.saving || (!dr.dirty && !dr.create)) return;
  if (dr.global && !HX.globalOk) {
    const ok = await confirmDialog('모든 폴더에 적용되는 파일', '이 파일은 모든 프로젝트의 에이전트가 읽어요. 저장할까요?', '저장');
    if (!ok) return;
    HX.globalOk = true;
  }
  if (dr.cardCommit) dr.cardCommit();
  if (dr.create && dr.text && !dr.text.endsWith('\n')) { // a new file ends with a newline
    const had = dr.blocks && dr.blocksFor === dr.text;
    dr.text += '\n';
    dr.el.ta.value = dr.text;
    if (had) { dr.blocks.push({ type: 'blank', lines: [''] }); dr.blocksFor = dr.text; }
  }
  const sent = dr.text; // (typing goes on while it is written: only this text is the saved one)
  dr.saving = true;
  let r;
  try { r = await window.mt.harness.write(dr.file, sent, { base: dr.base, create: dr.create }); } catch (err) {
    dr.saving = false;
    toast(`저장하지 못했어요: ${hxErr(err)}`, { icon: 'info' });
    return;
  }
  dr.saving = false;
  if (r.conflict) {
    dr.disk = r;
    if (r.gone) { dr.create = true; hxBanner(dr, '파일이 지워졌어요. 저장하면 새로 만들어요', true); } else hxBanner(dr, '열어 둔 사이에 밖에서 바뀌었어요. 비교해 보고 고르세요', true);
    return;
  }
  dr.base = r.hash;
  dr.saved = sent;
  dr.create = false;
  hxDirty(dr);
  hxEdChips(dr);
  if (dr.view === 'blocks' && dr.el.blocks) hxdChangedPaint(dr); // saved: the green, yellow and red marks start again from here
  dr.el.banner.hidden = true;
  toast('저장했어요. 저장하기 전 내용은 기록에 남아요', { icon: 'check', ms: 2500 });
  if (dr.side === 'history') hxHistory(dr);
  hxScan({ quiet: true });
}

function hxBanner(dr, text, conflict) {
  const b = dr.el.banner;
  b.hidden = false;
  b.className = 'hx-banner' + (conflict ? ' conflict' : '');
  b.innerHTML = `<span>${esc(text)}</span><span class="hx-spacer"></span><button class="btn small" data-dact="compare">비교</button><button class="btn small" data-dact="reload">다시 불러오기</button><button class="btn small" data-dact="keep">내 것 유지</button>`;
}
async function hxOutside(dr) {
  let r;
  try { r = await window.mt.harness.read(dr.file); } catch { return; }
  if (dr !== HX.drawer || r.hash === dr.base) return;
  if (dr.cardCommit) dr.cardCommit();
  if (!dr.dirty) {
    const t = hxLF(r.text);
    Object.assign(dr, { base: r.hash, saved: t, text: t, undo: [], redo: [] }); // (undo would bring back the text from before it)
    dr.el.ta.value = t;
    hxPaint(dr);
    hxDirty(dr);
    hxSide(dr); // the blocks or the preview follow the new text
    toast('밖에서 바뀐 내용을 불러왔어요', { icon: 'refresh', ms: 2200 });
    return;
  }
  dr.disk = r;
  hxBanner(dr, '편집하는 사이에 밖에서 바뀌었어요. 에이전트가 고쳤을 수 있어요', false);
}
async function hxReload(dr) {
  const r = await window.mt.harness.read(dr.file).catch(() => null);
  if (!r || dr !== HX.drawer) return;
  dr.base = r.hash;
  dr.saved = hxLF(r.text);
  dr.create = !r.exists;
  hxSetText(dr, dr.saved);
  dr.undo = [];
  dr.redo = [];
  dr.el.banner.hidden = true;
}
/** 저장 안 함: what changed since the last save, as - / + lines (the same view as the outside-change compare). */
function hxUnsaved(dr) {
  const ops = hxDiff(dr.saved, dr.text) || [];
  let n = 0;
  ops.forEach((o, i) => { if (o[0] !== '=' && (i === 0 || ops[i - 1][0] === '=')) n++; });
  const body = h('div', 'hx-cmp');
  body.innerHTML = `<p class="hx-hint">${dr.create ? '새 파일이에요. 저장하면 이 내용으로 만들어져요' : '- 는 저장한 내용에만, + 는 지금 편집 중인 내용에만 있는 줄이에요'}</p>${hxDiffHTML(dr.create ? '' : dr.saved, dr.text)}`;
  const close = h('button', 'btn small', '닫기');
  const save = h('button', 'btn small primary', `${icon('check')}저장`);
  const right = h('div', 'foot-right');
  right.append(close, ...(dr.readonly ? [] : [save]));
  openModal({ title: n && !dr.create ? `저장하지 않은 변경 · ${n}곳` : '저장하지 않은 변경', body, foot: [right], width: 760 });
  close.addEventListener('click', () => closeOverlay());
  save.addEventListener('click', () => { closeOverlay(); hxSave(dr); });
}
async function hxCompare(dr) {
  const r = dr.disk || await window.mt.harness.read(dr.file).catch(() => null);
  if (!r) return;
  const body = h('div', 'hx-cmp');
  body.innerHTML = `<p class="hx-hint">- 는 지금 파일에만, + 는 편집 중인 내용에만 있는 줄이에요</p>${hxDiffHTML(r.text || '', dr.text)}`;
  const keep = h('button', 'btn small', '내 것으로 덮어쓰기');
  const take = h('button', 'btn small primary', '파일 내용 불러오기');
  const right = h('div', 'foot-right');
  right.append(keep, take);
  openModal({ title: `${esc(basename(dr.file))} 비교`, body, foot: [right], width: 860 });
  keep.addEventListener('click', () => { closeOverlay(); dr.base = r.hash; dr.el.banner.hidden = true; hxSave(dr); });
  take.addEventListener('click', () => { closeOverlay(); dr.base = r.hash; dr.saved = hxLF(r.text); hxSetText(dr, dr.saved); dr.el.banner.hidden = true; });
}

/* ------------------------------------------------------------------ new files and 하나로 묶기 */
const HX_TEMPLATES = {
  claude: (name) => `# ${name}\n\n## 개요\n\n- 이 프로젝트가 하는 일:\n\n## 명령\n\n- 빌드:\n- 테스트:\n\n## 코드 스타일\n\n- \n\n## 하지 말 것\n\n- \n`,
  importAgents: () => '@AGENTS.md\n\n## Claude Code 전용\n\n- \n',
  agents: (name) => `# ${name}\n\n## 개요\n\n- \n\n## 명령\n\n- 빌드:\n- 테스트:\n\n## 규칙\n\n- \n`,
};
function hxCreate(file, anchor) {
  const isClaude = /CLAUDE\.md$/i.test(file);
  const dirName = basename(hxDir(file));
  const items = isClaude ? [
    { icon: 'edit', text: '기본 구조로 시작', run: () => hxOpenFile(file, { create: true, text: HX_TEMPLATES.claude(dirName) }) },
    { icon: 'link', text: 'AGENTS.md를 가져오는 CLAUDE.md', hint: '@AGENTS.md', run: () => hxOpenFile(file, { create: true, text: HX_TEMPLATES.importAgents() }) },
    { icon: 'plus', text: '빈 파일', run: () => hxOpenFile(file, { create: true, text: '' }) },
  ] : [
    { icon: 'edit', text: '기본 구조로 시작', run: () => hxOpenFile(file, { create: true, text: HX_TEMPLATES.agents(dirName) }) },
    { icon: 'plus', text: '빈 파일', run: () => hxOpenFile(file, { create: true, text: '' }) },
  ];
  if (hxDraftable(file)) items.unshift({ icon: 'arrowRight', text: '에이전트에게 초안 부탁', hint: '폴더를 살펴보고 써요', run: () => hxAskDraft(file) });
  const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, bottom: innerHeight / 2 };
  openMenu([{ label: `${basename(file)} 만들기 · ${hxShort(file, 40)}` }, ...items], r.left, r.bottom + 4);
}

/** CLAUDE.md beside AGENTS.md: AGENTS.md stays the one source, CLAUDE.md becomes @AGENTS.md plus what only Claude needs. */
function hxUnifyText(claudeText, agentsText) {
  const norm = (s) => s.trim().replace(/\s+/g, ' ');
  const inAgents = new Set(agentsText.split(/\r?\n/).map(norm).filter(Boolean));
  const keep = claudeText.split(/\r?\n/).filter((l) => !norm(l) || !inAgents.has(norm(l)));
  const out = [];
  for (let i = 0; i < keep.length; i++) {
    const l = keep[i];
    if (/^#{1,6}\s/.test(l)) { // a heading left with nothing under it goes too
      let j = i + 1;
      while (j < keep.length && !keep[j].trim()) j++;
      if (j >= keep.length || (/^#{1,6}\s/.test(keep[j]) && keep[j].match(/^#+/)[0].length <= l.match(/^#+/)[0].length)) continue;
    }
    if (!l.trim() && (!out.length || !out[out.length - 1].trim())) continue;
    out.push(l);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const rest = out.join('\n').trim().replace(/^@AGENTS\.md\s*/i, '');
  return { text: `@AGENTS.md\n${rest ? `\n${/^#/.test(rest) ? '' : '## Claude Code 전용\n\n'}${rest}\n` : ''}`, rest };
}
async function hxUnify(pair) {
  if (!pair) return;
  let c;
  let a;
  try { [c, a] = await Promise.all([window.mt.harness.read(pair.claude), window.mt.harness.read(pair.agents)]); } catch { return; }
  const { text: next, rest } = hxUnifyText(c.text, a.text);
  const body = h('div', 'hx-cmp');
  body.innerHTML = `<p class="hx-hint">AGENTS.md를 원본으로 두고 CLAUDE.md가 그것을 가져오게(@AGENTS.md) 바꿔요. AGENTS.md는 그대로라 Codex는 달라지는 게 없어요.</p>
    <p class="hx-hint">${rest ? 'CLAUDE.md에만 있던 줄은 그대로 남아요.' : 'CLAUDE.md에만 있던 줄은 없어요.'} 저장하기 전 내용은 기록에 남아요.</p>
    <div class="hx-cmp-file no-i18n">${esc(hxRel(pair.claude))}</div>${hxDiffHTML(c.text, next)}`;
  const cancel = h('button', 'btn small', '취소');
  const ok = h('button', 'btn small primary', '하나로 묶기');
  const right = h('div', 'foot-right');
  right.append(cancel, ok);
  openModal({ title: '하나로 묶기', body, foot: [right], width: 860 });
  cancel.addEventListener('click', () => closeOverlay());
  ok.addEventListener('click', async () => {
    closeOverlay();
    try {
      const r = await window.mt.harness.write(pair.claude, next, { base: c.hash });
      if (r.conflict) { toast('그사이 CLAUDE.md가 바뀌어서 묶지 않았어요. 다시 해 주세요', { icon: 'info' }); return; }
      toast('하나로 묶었어요. 이제 AGENTS.md만 고치면 돼요', { icon: 'check' });
      if (HX.drawer && samePath(HX.drawer.file, pair.claude) && !HX.drawer.dirty) { HX.drawer = null; hxOpenFile(pair.claude, { quiet: true }); }
      hxScan({ quiet: true });
    } catch (err) { toast(`묶지 못했어요: ${hxErr(err)}`, { icon: 'info' }); }
  });
}

/* ------------------------------------------------------------------ markdown preview (what instruction files use) */
function hxMarkdown(src) {
  const lines = String(src).replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let i = 0;
  const inline = (s) => esc(s)
    .replace(HX_CODE_RE, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a title="$2">$1</a>')
    .replace(/(^|\s)(@[^\s&<>()]+)/g, '$1<span class="imp">$2</span>');
  while (i < lines.length) {
    const l = lines[i];
    const f = HX_FENCE_RE.exec(l);
    if (f) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(f[1])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const hd = /^(#{1,6})\s+(.*)$/.exec(l);
    if (hd) { out.push(`<h${hd[1].length}>${inline(hd[2])}</h${hd[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((x) => inline(x.trim()));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s/.test(l)) {
      const items = [];
      while (i < lines.length && (/^\s*([-*+]|\d+\.)\s/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m) items.push({ d: Math.floor(m[1].replace(/\t/g, '  ').length / 2), ol: /\d/.test(m[2]), t: m[3] });
        else items[items.length - 1].t += ' ' + lines[i].trim();
        i++;
      }
      let html = '';
      const stack = [];
      for (const it of items) {
        while (stack.length > it.d + 1) html += `</li></${stack.pop()}>`;
        if (stack.length < it.d + 1) { const tag = it.ol ? 'ol' : 'ul'; html += `<${tag}><li>`; stack.push(tag); } else html += '</li><li>';
        html += inline(it.t);
      }
      while (stack.length) html += `</li></${stack.pop()}>`;
      out.push(html);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !HX_PARA_STOP_RE.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ line diff (Myers), shown as one column */
function hxDiff(a, b) {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const v = new Map([[1, 0]]);
  const trace = [];
  let done = false;
  for (let d = 0; d <= n + m && !done; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? v.get(k + 1) ?? 0 : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) { done = true; break; }
    }
    if (d > 3000) return null; // too different: shown as replaced
  }
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && (vv.get(k - 1) ?? -1) < (vv.get(k + 1) ?? -1)) ? k + 1 : k - 1;
    const px = vv.get(prevK) ?? 0;
    const py = px - prevK;
    while (x > px && y > py) { ops.push(['=', A[x - 1]]); x--; y--; }
    if (d > 0) { if (x === px) ops.push(['+', B[y - 1]]); else ops.push(['-', A[x - 1]]); }
    x = px;
    y = py;
  }
  return ops.reverse();
}
function hxDiffHTML(a, b) {
  const sa = String(a).replace(/\r\n/g, '\n');
  const sb = String(b).replace(/\r\n/g, '\n');
  const ops = hxDiff(sa, sb) || [...sa.split('\n').map((l) => ['-', l]), ...sb.split('\n').map((l) => ['+', l])];
  if (!ops.some((o) => o[0] !== '=')) return '<div class="hx-diff same">차이가 없어요</div>';
  const show = ops.map(() => false);
  ops.forEach((o, i) => { if (o[0] !== '=') for (let k = Math.max(0, i - 3); k <= Math.min(ops.length - 1, i + 3); k++) show[k] = true; });
  let html = '';
  let gap = false;
  ops.forEach((o, i) => {
    if (!show[i]) { if (!gap) { html += '<div class="d-gap">⋯</div>'; gap = true; } return; }
    gap = false;
    html += `<div class="d-${o[0] === '+' ? 'add' : o[0] === '-' ? 'del' : 'eq'}"><i>${o[0] === '=' ? ' ' : o[0]}</i>${esc(o[1]) || ' '}</div>`;
  });
  return `<div class="hx-diff no-i18n">${html}</div>`;
}

/* ------------------------------------------------------------------ keys */
window.addEventListener('keydown', (e) => { // Esc closes the panel, unless a dialog is open or the editor has the focus
  if (e.key !== 'Escape' || HX_ONLY || !HX.open || S.overlay || e.isComposing) return;
  if (HX.drawer && HX.drawer.pick) return; // picked rules: this Esc lets them go (the page's own key)
  if (HXD_LANG || HXD_SLASH) return; // (the language list or the / list open: this Esc closes it)
  if (HX_TOUR) return; // (the first-time guide open: this Esc ends it)
  const ae = document.activeElement;
  if (ae && ((ae.closest('.hx-find') && ae.value) || ae.closest('.hx-found'))) return; // (words in the search box: this Esc empties it) // (a rule or a box being written takes its own Esc: the first one ends the editing)
  if (HV && ae && (HV.ed.contains(ae) || ae.closest('.hxd-langmenu, .hxd-bar')) && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
  e.preventDefault();
  e.stopPropagation();
  closeHarness();
}, true);
window.addEventListener('keydown', (e) => { // Ctrl+S anywhere in the panel saves the open file
  if (!HX.open || S.overlay || !modKey(e) || e.shiftKey || e.key.toLowerCase() !== 's' || !HX.drawer) return; // (Ctrl+Shift+S: strike in a rule)
  if (!HV.view.contains(document.activeElement) && document.activeElement !== document.body) return;
  e.preventDefault();
  e.stopPropagation();
  hxSave(HX.drawer);
}, true);
window.addEventListener('keydown', (e) => {
  const dr = HX.drawer;
  if (!HX.open || S.overlay || !dr || dr.view !== 'blocks' || !modKey(e) || e.altKey || e.isComposing) return;
  const k = e.key.toLowerCase();
  if (k !== 'z' && k !== 'y') return;
  const a = document.activeElement;
  if (a && a !== document.body && (!HV.view.contains(a) || a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return; // (those undo on their own)
  if (dr.el.blocks.contains(a)) return; // (the page's own keys)
  e.preventDefault();
  e.stopPropagation();
  hxbUndo(dr, k === 'y' || e.shiftKey);
}, true);
window.addEventListener('beforeunload', (e) => {
  if (HX_ONLY && HX.drawer && HX.drawer.cardCommit) HX.drawer.cardCommit();
  if (!HX_ONLY || HX.leaving || !HX.drawer || !HX.drawer.dirty) return;
  e.preventDefault();
  e.returnValue = '';
  setTimeout(() => closeHarness(), 0); // (the question, then the window closes when the answer is yes)
});
