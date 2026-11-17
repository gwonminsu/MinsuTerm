'use strict';
/*
 * MinsuTerm i18n — Korean is the source language; translations live in i18n-data.js
 * (generated from src/i18n/*.json by scripts/i18n-build.js).
 *
 * The UI is built from Korean strings all over app.js, so instead of threading a t() through every
 * template, the page itself is translated: every text node and title / placeholder / aria-label is
 * looked up as it appears or changes (a MutationObserver), and the Korean original is kept so the
 * language can be switched live, back and forth. Numbers are matched as "#" ("탭 3개" → "3 tabs").
 * Terminal output, inputs and user-made names are never touched.
 */
(function () {
  const HANGUL = /[가-힣ㄱ-ㆎ]/;
  const DATA = window.I18N_DATA || {};
  let lang = 'ko';
  let dict = null;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  /** "탭 3개 · 12초" → key "탭 #개 · #초", values ["3", "12"] */
  const keyOf = (s) => { const vals = []; const key = norm(s).replace(/\d+(\.\d+)?/g, (m) => { vals.push(m); return '#'; }); return { key, vals }; };
  const fill = (tpl, vals) => { let i = 0; return tpl.replace(/#/g, () => (i < vals.length ? vals[i++] : '#')); };

  function lookup(s) {
    if (!dict || !s || !HANGUL.test(s)) return null;
    const { key, vals } = keyOf(s);
    const hit = dict[key];
    return hit != null && (hit.match(/#/g) || []).length === vals.length ? fill(hit, vals) : null;
  }

  /** Translate a piece of UI text (keeps its surrounding whitespace). */
  function tr(s) {
    if (lang === 'ko' || !dict || s == null) return s;
    const str = String(s);
    if (!HANGUL.test(str)) return str;
    const lead = str.match(/^\s*/)[0];
    const tail = str.match(/\s*$/)[0];
    const core = str.slice(lead.length, str.length - tail.length);
    let out = lookup(core);
    if (out == null) { // pieces joined with " · " / " — " / " | "
      const parts = core.split(/( · | — | \| )/);
      if (parts.length > 1) out = parts.map((p, i) => (i % 2 ? p : (lookup(p) ?? runs(p)))).join('');
      else out = runs(core);
    }
    return lead + out + tail;
  }
  /** Last resort: translate each Korean run that is a known phrase. */
  function runs(s) {
    return s.replace(/[가-힣ㄱ-ㆎ0-9][가-힣ㄱ-ㆎ0-9 .,!?~…%()'"\-/]*/g, (run) => {
      const t = run.trimEnd();
      let hit = lookup(t);
      if (hit == null && t.includes(' ')) { // glued from known words ("효과 없음")
        const words = t.split(' ');
        const tw = words.map((w) => lookup(w));
        if (tw.some((x) => x != null)) hit = words.map((w, i) => tw[i] ?? w).join(' ');
      }
      return hit == null ? run : hit + run.slice(t.length);
    });
  }

  // ---- the page ----
  const ORIG = new WeakMap(); // text node → { src: Korean original, out: what we wrote }
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  const SKIP = '.xterm, .no-i18n, [contenteditable="true"], script, style, .tab-rename'; // inputs have no text nodes, but their placeholders get translated
  const skipped = (el) => !!(el && el.closest && el.closest(SKIP));

  function doText(node) {
    const rec = ORIG.get(node);
    const cur = node.nodeValue;
    let src = cur;
    if (rec && cur === rec.out) src = rec.src; // our own write: keep the original
    if (!HANGUL.test(src) && !rec) return;
    const out = lang === 'ko' ? src : tr(src);
    ORIG.set(node, { src, out });
    if (out !== cur) node.nodeValue = out;
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      const store = `data-i18n-${a}`;
      let src = el.getAttribute(store);
      if (src == null || v !== el.getAttribute(`${store}-out`)) src = v; // new value from the app
      if (!HANGUL.test(src)) continue;
      const out = lang === 'ko' ? src : tr(src);
      el.setAttribute(store, src); el.setAttribute(`${store}-out`, out);
      if (out !== v) el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentElement)) doText(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }

  let pending = new Set();
  let queued = false;
  const flush = () => { queued = false; const list = pending; pending = new Set(); for (const n of list) if (n.isConnected) walk(n); };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => pending.add(n));
      else if (m.type === 'characterData') pending.add(m.target);
      else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) pending.add(m.target);
    }
    if (!queued) { queued = true; queueMicrotask(flush); } // before the next paint: no flash of Korean
  });

  function resolve(pref) {
    if (pref && pref !== 'auto') return pref;
    const nav = (navigator.language || 'ko').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : nav.startsWith('ja') ? 'ja' : nav.startsWith('zh') ? 'zh' : 'en';
  }
  function setLang(pref) {
    lang = resolve(pref);
    dict = lang === 'ko' ? null : (DATA[lang] || null);
    if (lang !== 'ko' && !dict) lang = 'ko';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    walk(document.body);
    return lang;
  }

  window.I18N = {
    tr,
    setLang,
    get lang() { return lang; },
    start(pref) {
      setLang(pref);
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    },
  };
  window.tr = tr;
})();
