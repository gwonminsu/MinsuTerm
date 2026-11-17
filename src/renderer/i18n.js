'use strict';
/*
 * MinsuTerm i18n — Korean is the source language; translations live in i18n-data.js
 * (generated from src/i18n/*.json by scripts/i18n-build.js).
 *
 * The UI is built from Korean strings all over app.js, so instead of threading a t() through every
 * template, the page itself is translated: every text node and title / placeholder / aria-label is
 * looked up as it appears or changes (a MutationObserver), and the Korean original is kept so the
 * language can be switched live, back and forth. Numbers are matched as "#" ("탭 3개" → "3 tabs"),
 * and a key's "#" also stands for a name ("#가 작업 중입니다" ← "Claude가 작업 중입니다").
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

  // keys with "#" as patterns: "#" = any value (a name, a path, a count)
  let wild = null;
  const cache = new Map();
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
  function wildList() {
    if (wild) return wild;
    wild = Object.keys(dict)
      .filter((k) => k.includes('#') && k.replace(/#/g, '').trim().length >= 2 && HANGUL.test(k))
      .sort((a, b) => b.replace(/#/g, '').length - a.replace(/#/g, '').length)
      .map((k) => ({ k, re: new RegExp('^' + k.split('#').map(escRe).join('(.+?)') + '$') }));
    return wild;
  }

  function lookup(s) {
    if (!dict || !s || !HANGUL.test(s)) return null;
    const { key, vals } = keyOf(s);
    const hit = dict[key];
    if (hit != null && (hit.match(/#/g) || []).length === vals.length) return fill(hit, vals);
    const n = norm(s);
    if (cache.has(n)) return cache.get(n);
    let out = null;
    for (const w of wildList()) {
      const m = w.re.exec(n);
      // a long Korean value in a slot means the pattern matched the wrong sentence
      if (m && !m.slice(1).some((v) => HANGUL.test(v) && v.length > 12)) { out = fill(dict[w.k], m.slice(1)); break; }
    }
    if (cache.size > 3000) cache.clear();
    cache.set(n, out);
    return out;
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
        const tw = words.map((w) => (w.length >= 2 ? lookup(w) : null)); // a lone syllable (나, 를) is a particle, never a word
        if (tw.some((x) => x != null)) hit = words.map((w, i) => tw[i] ?? w).join(' ');
      }
      return hit == null ? run : hit + run.slice(t.length);
    });
  }

  /** Text that lives in CSS content: receipt header, breaking-news tag, achievement label, ink seal, "me" stamp. */
  const CSS_WORDS = {
    ko: { receipt: '— 작업 완료 —', breaking: '속보', achievement: '업적 달성', seal: '완', me: '나' },
    en: { receipt: '— TASK COMPLETE —', breaking: 'BREAKING', achievement: 'ACHIEVEMENT', seal: 'OK', me: 'ME' },
    ja: { receipt: '— 作業完了 —', breaking: '速報', achievement: '実績解除', seal: '完', me: '私' },
    zh: { receipt: '— 任务完成 —', breaking: '快讯', achievement: '成就达成', seal: '完', me: '我' },
  };

  /** Sentences with inline markup (<b>claude</b>, <kbd>codex</kbd>): whole per language, so word order stays natural. */
  const HTML_STRINGS = {
    sbEmpty: {
      en: 'Run <b>claude</b> or <b>codex</b> in a terminal<br>and its folder and agents show up here.',
      ja: 'ターミナルで <b>claude</b> か <b>codex</b> を実行すると<br>そのフォルダとエージェントがここに表示されます。',
      zh: '在终端中运行 <b>claude</b> 或 <b>codex</b><br>其文件夹和代理会显示在这里。',
    },
    folderEmpty: {
      en: 'Run <b>claude</b> / <b>codex</b> in this folder and it shows up here',
      ja: 'このフォルダで <b>claude</b> / <b>codex</b> を実行するとここに表示されます',
      zh: '在此文件夹中运行 <b>claude</b> / <b>codex</b> 即会显示在这里',
    },
    statusHint: {
      en: 'Run <kbd>claude</kbd> or <kbd>codex</kbd> to switch to agent mode',
      ja: '<kbd>claude</kbd> または <kbd>codex</kbd> を実行するとエージェントモードに切り替わります',
      zh: '运行 <kbd>claude</kbd> 或 <kbd>codex</kbd> 即切换到代理模式',
    },
    welcomeHint: {
      en: 'Run <kbd>claude</kbd> or <kbd>codex</kbd> in the terminal to switch to agent mode.',
      ja: 'ターミナルで <kbd>claude</kbd> か <kbd>codex</kbd> を実行するとエージェントモードになります。',
      zh: '在终端中运行 <kbd>claude</kbd> 或 <kbd>codex</kbd> 即切换到代理模式。',
    },
  };

  // ---- the page ----
  const ORIG = new WeakMap(); // text node → { src: Korean original, out: what we wrote }
  const HTML_ORIG = new WeakMap(); // [data-i18n-html] element → its Korean markup
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
  function doHtml(el) {
    if (!HTML_ORIG.has(el)) HTML_ORIG.set(el, el.innerHTML);
    const id = el.getAttribute('data-i18n-html');
    const html = lang === 'ko' ? HTML_ORIG.get(el) : ((HTML_STRINGS[id] || {})[lang] || HTML_ORIG.get(el));
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      const host = root.parentElement;
      if (!skipped(host) && !(host && host.closest('[data-i18n-html]'))) doText(root);
      return;
    }
    if (root.nodeType !== 1 || skipped(root)) return;
    if (root.hasAttribute('data-i18n-html')) { doHtml(root); return; }
    if (root.closest('[data-i18n-html]')) return; // inside a whole-sentence block: handled by its owner
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.matches(SKIP)) return NodeFilter.FILTER_REJECT;
        if (n.hasAttribute('data-i18n-html')) { doHtml(n); return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      },
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
    wild = null;
    cache.clear();
    const root = document.documentElement;
    root.lang = lang === 'zh' ? 'zh-CN' : lang;
    for (const [k, v] of Object.entries(CSS_WORDS[lang] || CSS_WORDS.ko)) root.style.setProperty(`--i18n-${k}`, JSON.stringify(v));
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
