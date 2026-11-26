'use strict';
/* global HX, h, esc, icon, hydrateIcons, openMenu, samePath, hxOpenFile, hxDirty, hxPaint, hxKB, hxDir, hxSave, hxDiff, hxMarkdown, HX_BT,
   HXB_FENCE, hxbParse, hxbJoin, hxbItemText, hxbItemLines, hxbShift, hxbSubtree, hxbApply, hxbUndo, hxbDedent, hxbSame, hxbLead */

/*
 * 하네스 보기 · 규칙: an instruction file written like a Notion page, where every block is a 규칙 (rule).
 *  - a rule has a format: plain text, a list item (bullet, numbered, checklist), a section title, code, a memo (an HTML
 *    comment the agent never sees) or another file brought in (@import); a new rule is plain text
 *  - text rules are typed into in place; bold and code show as they look (no ** or backticks); a rule whose markdown the
 *    page could not draw faithfully shows its markdown as written instead
 *  - - · 1. · [ ] · # · ``` typed at the start of a rule, / on an empty one, the handle or Ctrl+/ pick a format;
 *    a selection shows the format bar (format, bold, code)
 *  - Enter starts the next rule (an empty list item leaves the list), Shift+Enter breaks the line, Tab / Shift+Tab nest,
 *    Backspace at the start lifts a rule out of its format, then joins it to the one above
 *  - the handle (⠿) drags a rule with what is nested under it, or opens its menu; + adds a rule below
 *  - only the rules that change are written again: every other line of the file stays exactly as it was
 * Loaded after harness-blocks.js (the file model); names start with hxd.
 */

const HXD_CHECK = /^\[( |x|X)\]\s+/;
const HXD_ZW = '\u200B'; // a zero-width space: the caret goes on after a mark just made
const HXD_BT3 = HX_BT.repeat(3);
// (plain strings: the i18n extractor does not read attribute values written inside an HTML string)
const HXD_PH = '규칙을 쓰세요 · / 를 치면 형식을 골라요';
const HXD_PH_TITLE = '구역 제목';
const HXD_TIP_ADD = '아래에 규칙 추가';
const HXD_TIP_GRIP = '끌어서 옮기기 · 누르면 형식과 메뉴';
const HXD_TIP_CHECK = '체크';
const HXD_TIP_NEST_ITEM = '바로 위 항목보다 한 단계까지만 들여쓸 수 있어요';
const HXD_TIP_NEST_PARA = '위에 목록 항목이 있어야 들여쓸 수 있어요 · - 로 시작하면 목록이 돼요';
// (placeholders sit on the words, which are never translated: they are translated as they are drawn)
const hxdTr = (s) => esc(window.tr ? window.tr(s) : s);
const HXD_FORMATS = [
  { k: 'para', icon: 'type', text: '평문', mark: '', words: 'text plain p' },
  { k: 'ul', icon: 'list', text: '글머리 목록', mark: '-', words: 'bullet list ul -' },
  { k: 'ol', icon: 'listOrdered', text: '번호 목록', mark: '1.', words: 'number numbered ol 1.' },
  { k: 'task', icon: 'checkSquare', text: '체크 목록', mark: '[ ]', words: 'todo check task [] [ ]' },
  { k: 'h1', icon: 'heading', text: '구역 제목 1', mark: '#', words: 'h1 heading title #' },
  { k: 'h2', icon: 'heading', text: '구역 제목 2', mark: '##', words: 'h2 heading title ##' },
  { k: 'h3', icon: 'heading', text: '구역 제목 3', mark: '###', words: 'h3 heading title ###' },
  { k: 'code', icon: 'code', text: '코드', mark: HXD_BT3, words: 'code fence ' + HXD_BT3 },
  { k: 'memo', icon: 'eyeOff', text: '메모 · 에이전트에게 안 보임', mark: '<!--', words: 'memo comment note <!--' },
  { k: 'import', icon: 'link', text: '다른 파일 가져오기', mark: '@', words: 'import file @' },
  { k: 'hr', icon: 'divider', text: '구분선', mark: '---', words: 'divider hr line rule ---' },
];
// a mark typed at the very start of a rule turns it into that format (as in Notion)
const HXD_AUTO = [[/^[-*+] /, 'ul'], [/^\d{1,3}[.)] /, 'ol'], [/^\[[ xX]?\] /, 'task'], [/^### /, 'h3'], [/^## /, 'h2'], [/^# /, 'h1'], [new RegExp('^(' + HXD_BT3 + '|~~~)'), 'code'], [/^(---|\*\*\*|___)$/, 'hr'], [/^<!--\s?/, 'memo']];
const HXD_CODE_OPEN = new RegExp('^(\\s*)(' + HX_BT + '{3,}|~{3,})\\s*(.*)$');
const HXD_TICKS = new RegExp('^' + HX_BT + '+');

/** The fence a code block needs: longer than any run of its marks that starts a line inside it. */
function hxdFenceFor(body, base = HXD_BT3) {
  const ch = base[0];
  let n = base.length;
  for (const l of String(body).split('\n')) { const t = l.trim(); let k = 0; while (t[k] === ch) k++; if (k >= n) n = k + 1; }
  return ch.repeat(n);
}
/** A memo's words never end it early: a --> inside is written with a space (-- >). */
const hxdMemoSafe = (v) => String(v).split('-->').join('-- >');
/** Pasted markdown never leaves a code block or a memo open (that would swallow everything after it). */
function hxdSealed(add) {
  return add.map((b) => {
    if (b.type === 'code') {
      const lead = hxbLead(b);
      const f = HXD_CODE_OPEN.exec(hxbDedent(b.lines[0], lead));
      const closed = b.lines.length > 1 && HXB_FENCE.test(b.lines[b.lines.length - 1]);
      return closed || !f ? b : { ...b, lines: [...b.lines, ' '.repeat(lead) + f[2]] };
    }
    if (b.type === 'comment' && !b.lines.join('\n').includes('-->')) return { ...b, lines: [...b.lines, ' '.repeat(hxbLead(b)) + '-->'] };
    return b;
  });
}

const HXD_TIP_LINK = 'Ctrl+클릭으로 열기';
const HXD_TIP_LINK_MAC = '⌘+클릭으로 열기';
// format shortcuts as in Notion: [alt, shift, key code, format]
const HXD_KEYFMT = [[true, false, 'Digit0', 'para'], [true, false, 'Digit1', 'h1'], [true, false, 'Digit2', 'h2'], [true, false, 'Digit3', 'h3'], [false, true, 'Digit7', 'ol'], [false, true, 'Digit8', 'ul'], [false, true, 'Digit9', 'task'], [true, false, 'Digit8', 'code']];

/* ------------------------------------------------------------------ a rule's words and format */
const hxdIsText = (b) => !!b && (b.type === 'item' || b.type === 'para' || b.type === 'heading');
/** The words of a text rule as markdown (a list item's own words, a paragraph without its indent). */
function hxdText(b) {
  if (b.type === 'heading') return b.text;
  if (b.type === 'item') return hxbItemText(b);
  const lead = hxbLead(b);
  return b.lines.map((l) => hxbDedent(l, lead)).join('\n');
}
/** Its words without a checklist box. */
function hxdWords(b) { const t = hxdText(b); const c = b.type === 'item' ? HXD_CHECK.exec(t) : null; return c ? t.slice(c[0].length) : t; }
/** The rule with new words: the same block (its lines untouched) when the words did not change. */
const HXD_TEXTY = new Set(['para', 'item', 'heading']);
function hxdSet(b, text) {
  if (text === hxdText(b) || !HXD_TEXTY.has(b.type)) return b;
  if (b.type === 'heading') { const t = text.replace(/\n/g, ' ').trim(); return { ...b, text: t, lines: [`${'#'.repeat(b.level)} ${t}`] }; }
  if (b.type === 'item') return { ...b, lines: hxbItemLines(b, text) };
  const pad = ' '.repeat(hxbLead(b));
  return { ...b, lead: hxbLead(b), lines: text ? text.split('\n').map((p) => (p.trim() ? pad + p : '')) : [''] };
}
function hxdFmt(b) {
  if (b.type === 'heading') return 'h' + Math.min(3, b.level);
  if (b.type === 'item') return HXD_CHECK.test(hxdText(b)) ? 'task' : /^\d/.test(b.marker) ? 'ol' : 'ul';
  return { para: 'para', code: 'code', comment: 'memo', import: 'import' }[b.type] || b.type;
}
/** The words inside a rule that is not text: code without its fences, a memo without <!-- -->, an import's path. */
function hxdBody(b) {
  const lead = hxbLead(b);
  const ls = b.lines.map((l) => hxbDedent(l, lead));
  if (b.type === 'code') { const closed = ls.length > 1 && HXB_FENCE.test(ls[ls.length - 1]); return ls.slice(1, closed ? -1 : undefined).join('\n'); }
  if (b.type === 'comment') return ls.join('\n').replace(/^\s*<!--\s?/, '').replace(/\s?-->\s*$/, '');
  if (b.type === 'import') return ls[0].trim().slice(1);
  if (b.type === 'quote') return ls.map((l) => l.replace(/^\s*>\s?/, '')).join('\n');
  if (b.type === 'hr' || b.type === 'blank') return '';
  return ls.join('\n');
}

/* ------------------------------------------------------------------ inline marks: markdown <-> what is shown */
/** Inline markdown drawn as it looks: code, bold, italic, links, @imports (each mark remembers how it was written). */
function hxdInline(md) {
  let out = '';
  let i = 0;
  const n = md.length;
  while (i < n) {
    const c = md[i];
    if (c === HX_BT) {
      const run = HXD_TICKS.exec(md.slice(i))[0];
      const close = md.indexOf(run, i + run.length);
      if (close > i + run.length - 1 && close > i) { out += `<code data-m="${run.length}">${esc(md.slice(i + run.length, close))}</code>`; i = close + run.length; continue; }
    }
    if ((c === '*' || c === '_') && md[i + 1] === c) {
      const m = c + c;
      const close = md.indexOf(m, i + 2);
      if (close > i + 2 && md[i + 2] !== ' ' && md[close - 1] !== ' ' && (c === '*' || !/\w/.test(md[i - 1] || ''))) { out += `<strong data-m="${m}">${hxdInline(md.slice(i + 2, close))}</strong>`; i = close + 2; continue; }
    }
    if (c === '~' && md[i + 1] === '~') {
      const close = md.indexOf('~~', i + 2);
      if (close > i + 2 && md[i + 2] !== ' ' && md[close - 1] !== ' ') { out += `<s data-m="~~">${hxdInline(md.slice(i + 2, close))}</s>`; i = close + 2; continue; }
    }
    if ((c === '*' || c === '_') && md[i + 1] && md[i + 1] !== ' ' && md[i + 1] !== c && (c === '*' || !/\w/.test(md[i - 1] || ''))) {
      let close = md.indexOf(c, i + 1);
      while (close > 0 && (md[close - 1] === ' ' || md[close + 1] === c || (c === '_' && /\w/.test(md[close + 1] || '')))) close = md.indexOf(c, close + 1);
      if (close > i + 1) { out += `<em data-m="${c}">${hxdInline(md.slice(i + 1, close))}</em>`; i = close + 1; continue; }
    }
    if (c === '[') {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(md.slice(i));
      if (m) { out += `<a data-href="${esc(m[2])}" title="${hxdTr(IS_MAC ? HXD_TIP_LINK_MAC : HXD_TIP_LINK)}">${hxdInline(m[1])}</a>`; i += m[0].length; continue; }
    }
    if (c === '@' && (i === 0 || /\s/.test(md[i - 1]))) {
      const m = /^@[^\s<>()]+/.exec(md.slice(i));
      if (m && m[0].length > 1) { out += `<span class="imp">${esc(m[0])}</span>`; i += m[0].length; continue; }
    }
    out += esc(c);
    i++;
  }
  return out;
}
/** What is shown, written back as markdown. */
const HXD_NB = String.fromCharCode(160);
function hxdMd(node) {
  let s = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { s += n.nodeValue.split(HXD_ZW).join('').split(HXD_NB).join(' '); continue; }
    if (n.nodeType !== 1 || n.classList.contains('hxd-ui')) continue;
    const t = n.tagName;
    if (t === 'BR') { s += '\n'; continue; }
    if (t === 'CODE') {
      const inner = n.textContent.split(HXD_ZW).join('');
      if (!inner) continue;
      const k = Number(n.dataset.m) || (inner.includes(HX_BT) ? 2 : 1);
      s += HX_BT.repeat(k) + inner + HX_BT.repeat(k);
      continue;
    }
    if (t === 'STRONG' || t === 'B') { const inner = hxdMd(n); if (inner) { const m = n.dataset.m || '**'; s += m + inner + m; } continue; }
    if (t === 'S' || t === 'DEL' || t === 'STRIKE') { const inner = hxdMd(n); if (inner) s += '~~' + inner + '~~'; continue; }
    if (t === 'EM' || t === 'I') { const inner = hxdMd(n); if (inner) { const m = n.dataset.m || '*'; s += m + inner + m; } continue; }
    if (t === 'A') { s += `[${hxdMd(n)}](${n.dataset.href || ''})`; continue; }
    if (t === 'DIV' || t === 'P') { if (s && !s.endsWith('\n')) s += '\n'; s += hxdMd(n); continue; }
    s += hxdMd(n);
  }
  return s;
}
/** Plain text of an element (a rule shown as written): text and line breaks. */
function hxdPlain(node) {
  let s = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue.split(HXD_ZW).join('').split(HXD_NB).join(' ');
    else if (n.nodeType === 1 && !n.classList.contains('hxd-ui')) { if (n.tagName === 'BR') s += '\n'; else { if ((n.tagName === 'DIV' || n.tagName === 'P') && s && !s.endsWith('\n')) s += '\n'; s += hxdPlain(n); } }
  }
  return s;
}
const HXD_TPL = document.createElement('template');
// a mark at the end of a line gets a zero-width space after it, so the caret can sit after the mark (typing there is plain)
const hxdHTML = (md) => md.split('\n').map((l) => { const x = hxdInline(l); return /<\/(code|strong|em|s|a)>$/.test(x) ? x + HXD_ZW : x; }).join('<br>');
/** Can these words be shown with their marks and written back exactly? If not, the rule is shown as written. */
function hxdSafe(md) { HXD_TPL.innerHTML = hxdHTML(md); return hxdMd(HXD_TPL.content) === md; }
const hxdRead = (el) => (el.classList.contains('raw') ? hxdPlain(el) : hxdMd(el)).replace(/\n$/, '');

/* ------------------------------------------------------------------ the caret, counted in visible characters */
function hxdLen(node) {
  let n = 0;
  for (const c of node.childNodes) {
    if (c.nodeType === 3) n += c.nodeValue.split(HXD_ZW).join('').length;
    else if (c.nodeType === 1 && !c.classList.contains('hxd-ui')) n += c.tagName === 'BR' ? 1 : hxdLen(c);
  }
  return n;
}
function hxdCaret(el, end) {
  const s = getSelection();
  if (!s.rangeCount) return -1;
  const r = s.getRangeAt(0);
  const node = end ? r.endContainer : r.startContainer;
  if (!el.contains(node)) return -1;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(node, end ? r.endOffset : r.startOffset);
  const d = document.createElement('div');
  d.append(pre.cloneContents());
  return hxdLen(d);
}
/** The DOM point at a visible offset in a rule: [node, offset] (past the end: its end). */
function hxdPoint(el, off) {
  let left = Math.max(0, off);
  if (!left) return [el, 0];
  let at = null;
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (at) return;
      if (c.nodeType === 3) {
        const v = c.nodeValue;
        let k = 0;
        while (k < v.length && left > 0) { if (v[k] !== HXD_ZW) left--; k++; }
        if (left === 0) { at = [c, k]; return; }
      } else if (c.nodeType === 1 && !c.classList.contains('hxd-ui')) {
        if (c.tagName === 'BR') { left--; if (left === 0) { at = [c.parentNode, [...c.parentNode.childNodes].indexOf(c) + 1]; return; } } else walk(c);
      }
    }
  };
  walk(el);
  // at the very end of a mark with the zero-width space after it: the caret goes after that space (outside the mark)
  if (at && at[0].nodeType === 3 && at[1] === at[0].nodeValue.length && at[0].parentNode !== el) {
    let top = at[0].parentNode;
    while (top.parentNode && top.parentNode !== el) top = top.parentNode;
    const nx = top.parentNode === el ? top.nextSibling : null;
    if (nx && nx.nodeType === 3 && nx.nodeValue.startsWith(HXD_ZW)) return [nx, 1];
  }
  return at || [el, el.childNodes.length];
}
function hxdPlace(el, off) { hxdSelect(el, off === 'end' || off == null ? Infinity : off); }
/** Select visible offsets a..b of a rule (b left out: the caret at a). */
function hxdSelect(el, a, b = a) {
  const r = document.createRange();
  r.setStart(...hxdPoint(el, a === Infinity ? hxdLen(el) : a));
  r.setEnd(...hxdPoint(el, b === Infinity ? hxdLen(el) : b));
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
const hxdAtStart = (el) => getSelection().isCollapsed && hxdCaret(el) === 0;
const hxdAtEnd = (el) => getSelection().isCollapsed && hxdCaret(el) === hxdLen(el);
/** The words before and after the selection (what Enter splits). */
function hxdSplit(el) {
  const s = getSelection();
  const ser = el.classList.contains('raw') ? hxdPlain : hxdMd;
  if (!s.rangeCount || !el.contains(s.getRangeAt(0).startContainer)) return [hxdRead(el), ''];
  const r = s.getRangeAt(0);
  const a = document.createRange();
  a.selectNodeContents(el);
  a.setEnd(r.startContainer, r.startOffset);
  const b = document.createRange();
  b.selectNodeContents(el);
  b.setStart(r.endContainer, r.endOffset);
  const part = (rg) => { const d = document.createElement('div'); d.append(rg.cloneContents()); return ser(d).replace(/\n$/, ''); };
  return [part(a), part(b).replace(/^\n/, '')];
}
/** Where the caret is: { b, off } for undo and redraws. */
function hxdWhere(dr) {
  const s = getSelection();
  if (dr && dr.pick) return { pick: [dr.pick.a, dr.pick.b] };
  if (!dr || !dr.el || !s.rangeCount) return null;
  const node = s.getRangeAt(0).startContainer;
  const el = (node.nodeType === 1 ? node : node.parentElement)?.closest('.hxd-t');
  if (!el || !dr.el.blocks.contains(el)) return null;
  return { b: Number(el.closest('[data-b]').dataset.b), off: hxdCaret(el) };
}

/* ------------------------------------------------------------------ shape: how deep each rule sits */
function hxdShape(bs) {
  const depth = new Array(bs.length).fill(0);
  let stack = []; // the list items open above: their indents
  bs.forEach((b, i) => {
    if (b.type === 'blank') return;
    if (b.type === 'heading' || b.type === 'front') { stack = []; return; }
    const lead = hxbLead(b);
    while (stack.length && stack[stack.length - 1] >= lead) stack.pop();
    depth[i] = stack.length;
    if (b.type === 'item') stack.push(lead);
    else if (!lead) stack = [];
  });
  return depth;
}
/** The blank lines markdown needs around a rule: between any two rules except list items of one list. */
const hxdNeedGap = (a, b) => !!a && !!b && a.type !== 'blank' && b.type !== 'blank' && !(a.type === 'item' && b.type === 'item');
function hxdSpace(bs, i, last = i) {
  const next = bs[last + 1];
  if (hxdNeedGap(bs[last], next)) bs.splice(last + 1, 0, { type: 'blank', lines: [''] });
  if (hxdNeedGap(bs[i - 1], bs[i])) { bs.splice(i, 0, { type: 'blank', lines: [''] }); return i + 1; }
  return i;
}
/** Take blocks a..b out; two blank lines meeting where they were become one. */
function hxdCut(bs, a, b) {
  const run = bs.splice(a, b - a);
  if (bs[a - 1] && bs[a] && bs[a - 1].type === 'blank' && bs[a].type === 'blank') bs.splice(a, 1);
  else if (hxdNeedGap(bs[a - 1], bs[a])) bs.splice(a, 0, { type: 'blank', lines: [''] });
  return run;
}

/* ------------------------------------------------------------------ drawing */
function hxdRender(dr, focus) {
  const box = dr.el.blocks;
  dr.cardCommit = null; // (an open card is drawn over: it is gone)
  if (!dr.blocks || dr.blocksFor !== dr.text) { dr.blocks = hxbParse(dr.text); dr.blocksFor = dr.text; }
  const bs = dr.blocks;
  const top = box.scrollTop;
  const depth = hxdShape(bs);
  let ln = 1;
  dr.line0 = bs.map((b) => { const s = ln; ln += b.lines.length; return s; });
  const cx = { changed: hxdChanged(dr), imports: hxdImports(dr) };
  let html = '';
  bs.forEach((b, i) => { if (b.type !== 'blank') html += hxdRow(dr, b, i, depth[i], cx); });
  if (!html) html = `<div class="hxd-empty" data-start>${dr.readonly ? '비어 있어요' : '여기를 눌러 첫 규칙을 쓰세요'}</div>${!dr.readonly && hxDraftable(dr.file) ? `<div class="hxd-draftrow hxd-ui"><button type="button" class="hxd-draftbtn" data-draft>${icon('arrowRight')}<span><b>에이전트에게 초안 부탁</b><small>폴더를 살펴보고 이 파일에 써요</small></span></button></div>` : ''}`;
  box.innerHTML = `<div class="hxd-doc${dr.readonly ? ' ro' : ''}">${html}<div class="hxd-tail" data-tail></div></div>`;
  hydrateIcons(box);
  const draft = box.querySelector('[data-draft]');
  if (draft) { // (its own press: not the page's writing or picking)
    for (const ev of ['pointerdown', 'mousedown']) draft.addEventListener(ev, (e) => e.stopPropagation());
    draft.addEventListener('click', (e) => { e.stopPropagation(); hxAskDraft(dr.file); });
  }
  hxdChangedPaint(dr, cx.changed); // (the red marks where rules were taken out)
  box.scrollTop = top;
  hxdSpy(dr);
  hxdBarHide();
  hxdLangClose();
  hxdSlashClose();
  dr.pick = null;
  if (focus && focus.pick) hxdPickSet(dr, focus.pick[0], focus.pick[1]); // (the picked rules stay picked after a change)
  else if (focus) hxdFocus(dr, focus);
}
function hxdRow(dr, b, i, d, cx) {
  const at = `data-b="${i}"`;
  const chg = cx.changed.add.has(i) ? ' chg' : cx.changed.mod.has(i) ? ' mod' : '';
  const ro = dr.readonly;
  const gut = ro || b.type === 'front' ? '' : `<span class="hxd-gut hxd-ui" contenteditable="false"><button class="hxd-add" data-add="${i}" tabindex="-1" title="${HXD_TIP_ADD}">${icon('plus')}</button><button class="hxd-grip" data-grip="${i}" tabindex="-1" title="${HXD_TIP_GRIP}">${icon('grip')}</button></span>`;
  const editable = (raw) => (ro ? 'false' : raw ? 'plaintext-only' : 'true');
  if (b.type === 'heading') {
    const w = b.text;
    const raw = !hxdSafe(w);
    return `<div class="hxd-r hxd-h l${Math.min(3, b.level)}${chg}" ${at}>${gut}<div class="hxd-t no-i18n${raw ? ' raw' : ''}${w ? '' : ' empty'}" contenteditable="${editable(raw)}" spellcheck="false" placeholder="${hxdTr(HXD_PH_TITLE)}">${raw ? esc(w) : hxdHTML(w)}</div></div>`;
  }
  if (b.type === 'item' || b.type === 'para') {
    const full = hxdText(b);
    const ck = b.type === 'item' ? HXD_CHECK.exec(full) : null;
    const w = ck ? full.slice(ck[0].length) : full;
    const raw = !hxdSafe(w);
    let mk = '';
    if (b.type === 'item') {
      const sym = ck ? `<input type="checkbox" class="hxd-ck" data-ck="${i}"${ck[1].trim() ? ' checked' : ''}${ro ? ' disabled' : ''} title="${HXD_TIP_CHECK}">`
        : /^\d/.test(b.marker) ? `<span class="hxd-num">${esc(b.marker)}</span>` : `<span class="hxd-dot d${Math.min(2, d)}"></span>`;
      mk = `<span class="hxd-mk hxd-ui" contenteditable="false">${sym}</span>`;
    }
    return `<div class="hxd-r ${b.type === 'item' ? 'hxd-li' : 'hxd-p'}${ck && ck[1].trim() ? ' done' : ''}${chg}" ${at} style="--d:${d}">${gut}${mk}<div class="hxd-t no-i18n${raw ? ' raw' : ''}${w ? '' : ' empty'}" contenteditable="${editable(raw)}" spellcheck="false" placeholder="${hxdTr(HXD_PH)}"${ck ? ` data-check="${esc(ck[0])}"` : ''}>${raw ? esc(w) : hxdHTML(w)}</div></div>`;
  }
  return `<div class="hxd-r hxd-x t-${b.type}${chg}" ${at} style="--d:${d}">${gut}${hxdCard(dr, b, i, cx)}</div>`;
}
/** A rule that is not text, drawn as what it is. */
function hxdCard(dr, b, i, cx) {
  const lead = hxbLead(b);
  const ls = b.lines.map((l) => hxbDedent(l, lead));
  if (b.type === 'code') {
    const f = HXD_CODE_OPEN.exec(ls[0]) || [];
    const lang = (f[3] || '').trim();
    const label = lang ? `<span class="no-i18n">${esc(lang)}</span>` : '코드';
    return `<div class="hxd-card hxd-codecard">${dr.readonly ? `<span class="hxd-lang">${label}</span>` : `<button class="hxd-lang hxd-langbtn" data-lang="${i}" tabindex="-1" title="${HXD_TIP_LANGPICK}">${label}${icon('chevronDown')}</button>`}<pre class="no-i18n">${esc(hxdBody(b)) || ' '}</pre></div>`;
  }
  if (b.type === 'comment') return `<div class="hxd-card hxd-memo"><span class="hxd-memo-h">${icon('eyeOff')}메모 · 에이전트에게 안 보여요</span><div class="no-i18n">${esc(hxdBody(b)).replace(/\n/g, '<br>') || ' '}</div></div>`;
  if (b.type === 'import') {
    const p = hxdBody(b);
    const st = cx.imports(b, i, p);
    return `<div class="hxd-card hxd-import${st.bad ? ' bad' : ''}">${icon('link')}<b class="no-i18n">@${esc(p)}</b>
      <span>${st.bad ? '가져올 파일이 없어요' : st.target ? `이 자리에 ${esc(st.target.name)} 내용이 들어가요 · ${hxKB(st.target.bytes)}` : '다른 파일을 이 자리에 가져와요'}</span>
      ${st.target ? `<button class="btn small" data-open="${esc(st.target.path)}">열기</button>` : ''}</div>`;
  }
  if (b.type === 'table') return `<div class="hxd-card hxd-table no-i18n">${hxMarkdown(ls.join('\n'))}</div>`;
  if (b.type === 'quote') return `<div class="hxd-card hxd-quote no-i18n">${ls.map((l) => hxdInline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</div>`;
  if (b.type === 'hr') return '<div class="hxd-card hxd-hr"><i></i></div>';
  if (b.type === 'front') {
    const paths = [];
    const kv = [];
    let inPaths = false;
    for (const l of b.lines.slice(1, -1)) {
      const m = /^([\w-]+)\s*:\s*(.*)$/.exec(l);
      if (m) { inPaths = m[1] === 'paths'; if (m[2].trim()) { if (inPaths) paths.push(...m[2].replace(/^\[|\]$/g, '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)); else kv.push([m[1], m[2].trim()]); } continue; }
      const li = /^\s*-\s+(.*)$/.exec(l);
      if (li && inPaths) paths.push(li[1].trim().replace(/^["']|["']$/g, ''));
    }
    return `<div class="hxd-card hxd-front"><span class="hxd-front-h">머리 정보</span>
      ${paths.length ? `<div class="hxd-paths"><span>이 경로의 파일을 다룰 때만 읽어요</span>${paths.map((x) => `<code class="no-i18n">${esc(x)}</code>`).join('')}</div>` : ''}
      ${kv.map(([k, v]) => `<div class="hxd-kv no-i18n"><b>${esc(k)}</b> ${esc(v)}</div>`).join('')}</div>`;
  }
  return `<div class="hxd-card hxd-other no-i18n">${esc(ls.join('\n'))}</div>`;
}
/** How each @import line of this file fares (the map knows which files came in and which were missing). */
function hxdImports(dr) {
  const facts = dr.facts || [];
  const claude = facts.find((l) => l.agent === 'claude');
  const imported = HX.data && claude ? HX.data.claude.layers.filter((l) => l.via === claude.id) : [];
  const broken = HX.data ? HX.data.claude.broken.filter((x) => samePath(x.from, dr.file)) : [];
  return (b, i, p) => {
    const want = p.startsWith('~') ? (HX.data ? HX.data.home : '') + p.slice(1) : hxDir(dr.file) + '/' + p;
    const target = imported.find((l) => hxbSame(l.path, want) || hxbSame(l.path, want.split('/./').join('/')));
    return { target, bad: broken.some((x) => x.line === dr.line0[i]) };
  };
}
/** The rules whose lines are new since the last save (a green bar marks them). */
/** What changed since the last save, by rule: added (green), changed (yellow), and where rules were taken out
 *  (red, above the row that now follows them; 'end' under the last row) with the lines that went.
 *  A rule emptied of its words is still there: it changed (an empty rule is a line of its own, not a blank). */
function hxdChanged(dr) {
  const out = { add: new Set(), mod: new Set(), del: new Map() };
  if (dr.create || dr.text === dr.saved) return out;
  const bs = dr.blocks || [];
  // an emptied rule's line is not a blank line between rules: compared as its own line, it is never matched with one
  const EMPTY = String.fromCharCode(0) + 'empty rule';
  const now = bs.flatMap((x) => (x.type !== 'blank' && x.lines.every((l) => !l.trim()) ? x.lines.map(() => EMPTY) : x.lines));
  const ops = hxDiff(dr.saved, now.length === dr.text.split('\n').length ? now.join('\n') : dr.text);
  if (!ops) return out;
  const lineOf = []; // a line of the text -> its rule
  bs.forEach((x, i) => x.lines.forEach(() => lineOf.push(i)));
  const counts = (n, l) => !!l.trim() || (bs[lineOf[n]] && bs[lineOf[n]].type !== 'blank'); // (a blank line between rules does not count)
  // each run of changed lines: as many counted lines as went are "changed", the rest "added"; more gone than came: taken out
  const mark = new Map();
  const gone = new Map();
  let ln = 0;
  for (let k = 0; k < ops.length;) {
    if (ops[k][0] === '=') { ln++; k++; continue; }
    const del = [];
    const add = [];
    while (k < ops.length && ops[k][0] !== '=') { (ops[k][0] === '-' ? del : add).push(ops[k][1]); k++; }
    const went = del.filter((l) => l.trim());
    let seen = 0;
    add.forEach((l, n) => { if (!counts(ln + n, l)) return; mark.set(ln + n, seen < went.length ? 'm' : 'a'); seen++; });
    if (went.length > seen) gone.set(ln + add.length, went.slice(seen));
    ln += add.length;
  }
  let s = 0;
  const at0 = bs.map((x) => { const v = s; s += x.lines.length; return v; });
  bs.forEach((x, i) => {
    if (x.type === 'blank') return;
    const ms = x.lines.map((l, j) => mark.get(at0[i] + j) || (l.trim() ? '=' : ''));
    if (ms.includes('m') || (ms.includes('a') && ms.includes('='))) out.mod.add(i); // (lines added to a rule that was there: it changed)
    else if (ms.includes('a')) out.add.add(i);
  });
  for (const [at, lines] of gone) {
    const i = bs.findIndex((x, n) => x.type !== 'blank' && at0[n] + x.lines.length > at);
    if (i >= 0 && at0[i] < at) { out.add.delete(i); out.mod.add(i); continue; } // lines taken out of the middle of a rule: it changed
    const key = i < 0 ? 'end' : i;
    out.del.set(key, [...(out.del.get(key) || []), ...lines]);
  }
  return out;
}
const HXD_TIP_GONE = '지운 줄';
const HXD_TIP_DUP = '다른 지침 파일에도 같은 줄이 있어요';
const HXD_TIP_SECRET = '비밀 정보로 보이는 값이 있어요. 지침 파일에는 넣지 않는 게 좋아요';
/** What 점검 found in this file, by line: the lines another file the same agent reads has too, the lines that look like
 *  a secret (taken from the saved text by number, then matched by what they say, so edits elsewhere do not move them). */
function hxdFlagsOf(dr) {
  const d = typeof HX !== 'undefined' && HX.data;
  const key = `${dr.saved.length}:${d ? d.scannedAt : 0}`;
  if (dr.flagsFor === key) return dr.flags;
  const dup = new Map(); // trimmed line -> the other files
  const secret = new Set(); // the line as it is
  for (const c of (d && d.checks) || []) {
    if (c.code === 'dup' && c.data && c.data.paths && c.data.paths.some((p) => samePath(p, dr.file))) {
      const others = c.data.paths.filter((p) => !samePath(p, dr.file));
      for (const l of c.data.lines || []) dup.set(l, [...new Set([...(dup.get(l) || []), ...others])]);
    }
    if (c.code === 'secret' && samePath(c.file, dr.file) && c.data && hxdLookFresh(dr)) {
      const lines = dr.saved.split('\n');
      for (const n of c.data.lines || []) if (lines[n - 1] && lines[n - 1].trim()) secret.add(lines[n - 1]);
    }
  }
  dr.flagsFor = key;
  dr.flags = { dup, secret };
  return dr.flags;
}
/** The last look read this file as it is saved now (its line numbers fit): not between a save and the next look. */
function hxdLookFresh(dr) {
  const layer = (typeof hxFacts === 'function' ? hxFacts(dr.file) : [])[0];
  const t = dr.saved || '';
  const n = t ? t.split('\n').length - (t.endsWith('\n') ? 1 : 0) : 0;
  return !layer || layer.lines === n;
}
/** A small dot at the end of a rule 점검 has something to say about (hover: what). */
function hxdFlagsPaint(dr) {
  const { dup, secret } = hxdFlagsOf(dr);
  const T = (x) => (window.tr ? window.tr(x) : x);
  for (const row of dr.el.blocks.querySelectorAll('.hxd-r[data-b]')) {
    const b = dr.blocks[Number(row.dataset.b)];
    let mk = [...row.children].find((c) => c.classList.contains('hxd-flag'));
    const ls = b ? b.lines : [];
    const isSecret = ls.some((l) => secret.has(l));
    const others = [...new Set(ls.flatMap((l) => dup.get(l.trim()) || []))];
    if (!isSecret && !others.length) { if (mk) { mk.remove(); row.classList.remove('flagged'); } continue; }
    if (!mk) { mk = h('span', 'hxd-flag hxd-ui no-i18n'); mk.contentEditable = 'false'; row.append(mk); }
    row.classList.add('flagged');
    mk.classList.toggle('secret', isSecret);
    mk.title = [...(isSecret ? [T(HXD_TIP_SECRET)] : []), ...(others.length ? [T(HXD_TIP_DUP), ...others.slice(0, 4).map((p) => hxRel(p))] : [])].join('\n');
  }
}
function hxdChangedPaint(dr, ch = hxdChanged(dr)) {
  const rows = [...dr.el.blocks.querySelectorAll('.hxd-r[data-b]')];
  const last = rows[rows.length - 1];
  for (const row of rows) {
    const i = Number(row.dataset.b);
    row.classList.toggle('chg', ch.add.has(i));
    row.classList.toggle('mod', ch.mod.has(i));
    [[ch.del.get(i), false], [row === last ? ch.del.get('end') : null, true]].forEach(([ls, end]) => {
      let mk = [...row.children].find((c) => c.classList.contains('hxd-delmark') && c.classList.contains('end') === end);
      if (!ls) { if (mk) mk.remove(); return; }
      if (!mk) { mk = h('span', 'hxd-delmark hxd-ui no-i18n' + (end ? ' end' : '')); mk.contentEditable = 'false'; row.prepend(mk); }
      const shown = ls.slice(0, 8).map((l) => (l.length > 90 ? l.slice(0, 89) + '…' : l));
      mk.title = [window.tr ? window.tr(HXD_TIP_GONE) : HXD_TIP_GONE, ...shown, ...(ls.length > 8 ? ['…'] : [])].join('\n');
    });
  }
  hxdFlagsPaint(dr);
}
/** The outline's row for the section at the top of the page lights up. */
function hxdSpy(dr) {
  if (!dr.el || dr.view !== 'blocks' || !dr.line0) return;
  const box = dr.el.blocks;
  const br = box.getBoundingClientRect();
  const heads = [...box.querySelectorAll('.hxd-h')];
  let line = 0;
  for (const hd of heads) { if (hd.getBoundingClientRect().top <= br.top + 28) line = dr.line0[Number(hd.dataset.b)]; else break; }
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) for (const hd of heads) if (hd.getBoundingClientRect().top < br.bottom - 40) line = dr.line0[Number(hd.dataset.b)];
  if (!line && heads[0]) line = dr.line0[Number(heads[0].dataset.b)];
  for (const r of dr.el.outline.querySelectorAll('.hx-orow')) r.classList.toggle('on', Number(r.dataset.goline) === line);
}
function hxdFocus(dr, f) {
  const row = dr.el.blocks.querySelector(`.hxd-r[data-b="${f.b}"]`);
  if (!row) return;
  if (f.card) { hxdEditCard(dr, f.b); return; }
  const el = row.querySelector('.hxd-t');
  if (!el || dr.readonly) return;
  el.focus({ preventScroll: true });
  hxdPlace(el, f.off ?? 'end');
  row.scrollIntoView({ block: 'nearest' });
  if (f.slash) hxdSlashOpen(dr, el, true);
}

/* ------------------------------------------------------------------ typing */
function hxdInput(dr, el, e) {
  const row = el.isConnected && el.closest('[data-b]');
  if (!row) return; // (drawn again since: what it held is in the rules already)
  const i = Number(row.dataset.b);
  const b = dr.blocks[i];
  if (!b || !HXD_TEXTY.has(b.type)) return;
  if (!(e && e.isComposing) && !hxdLen(el) && el.innerHTML) el.innerHTML = ''; // the <br> a browser leaves in an emptied line (never mid-composition)
  el.classList.toggle('empty', !hxdLen(el));
  const composing = !!(e && e.isComposing);
  let w = hxdRead(el);
  if (!composing) {
    const a = hxdAuto(b, w, !!el.dataset.check);
    if (a) { const off = Math.max(0, hxdCaret(el) - a.cut); hxdConvert(dr, i, a.fmt, w.slice(a.cut), { off }); return; }
    if (!el.classList.contains('raw') && hxdInlineAuto(el)) w = hxdRead(el);
    hxdSlashCheck(dr, el, w);
  } else if (HXD_SLASH && HXD_SLASH.el === el) hxdSlashCheck(dr, el, w, true);
  const full = (el.dataset.check || '') + w;
  const nb = hxdSet(b, full);
  if (nb === b) return;
  if (!composing) { const k = hxdHiddenAt(nb); if (k > 0) { hxdSplitHidden(dr, i, nb, k); return; } }
  hxdMark(dr, i, el);
  dr.blocks[i] = nb;
  dr.text = hxbJoin(dr.blocks);
  dr.blocksFor = dr.text;
  dr.el.ta.value = dr.text;
  hxDirty(dr);
  clearTimeout(dr.soon);
  dr.soon = setTimeout(() => {
    if (HX.drawer !== dr || dr.view !== 'blocks') return;
    let ln = 1;
    dr.line0 = dr.blocks.map((x) => { const s = ln; ln += x.lines.length; return s; });
    hxPaint(dr);
    hxdChangedPaint(dr);
    hxdSpy(dr);
  }, 280);
}
/** The line of a text rule (past its first) that would open a code block or a memo, or -1. */
function hxdHiddenAt(nb) {
  if (nb.type !== 'para' && nb.type !== 'item') return -1;
  for (let k = 1; k < nb.lines.length; k++) {
    const l = nb.lines[k];
    if (HXB_FENCE.test(l)) return k;
    if (l.trim().startsWith('<!--') && !nb.lines.slice(k).join('\n').includes('-->')) return k;
  }
  return -1;
}
/** The rule up to that line stays; from it on, the code block or memo it opens (closed), its card open to write in. */
function hxdSplitHidden(dr, i, nb, k) {
  const lead = nb.type === 'item' ? nb.indent + nb.marker.length + nb.gap.length : hxbLead(nb);
  const head = { ...nb, lines: nb.lines.slice(0, k) };
  let add = hxdSealed(hxbParse(nb.lines.slice(k).map((l) => hxbDedent(l, lead)).join('\n')));
  if (lead) add = hxbShift(add, lead);
  const bs = dr.blocks.slice();
  bs.splice(i, 1, head, ...add);
  hxdSpace(bs, i + 1, i + add.length);
  const card = add.find((x) => x.type === 'code' || x.type === 'comment');
  hxbApply(dr, bs, { focus: card ? { b: bs.indexOf(card), card: true } : null });
}
/** Undo while typing: one step per burst of typing in one rule. */
function hxdMark(dr, i, el) {
  const now = Date.now();
  if (dr.typing && dr.typing.i === i && now - dr.typing.t < 1200) { dr.typing.t = now; return; }
  dr.undo = dr.undo || [];
  dr.undo.push({ text: dr.text, focus: { b: i, off: Math.max(0, hxdCaret(el) - 1) } });
  if (dr.undo.length > 300) dr.undo.shift();
  dr.redo = [];
  dr.typing = { i, t: now };
}
function hxdAuto(b, w, checked) {
  if (b.type === 'heading' && !/^#{1,3} /.test(w)) return null;
  const now = hxdFmt(b);
  for (const [re, fmt] of HXD_AUTO) {
    const m = re.exec(w);
    if (!m || fmt === now || (fmt === 'task' && checked)) continue;
    return { fmt, cut: m[0].length };
  }
  return null;
}
/** `code` and **bold** typed out become marks as the closing one is typed (the caret goes on after them). */
function hxdInlineAuto(el) {
  const s = getSelection();
  if (!s.isCollapsed || !s.rangeCount) return false;
  const node = s.anchorNode;
  if (!node || node.nodeType !== 3 || !el.contains(node) || node.parentElement.closest('code')) return false;
  const before = node.nodeValue.slice(0, s.anchorOffset);
  // `code` · **bold** · ~~strike~~ · *italic* (one * not part of **)
  const pats = [[new RegExp(HX_BT + '([^' + HX_BT + ']+)' + HX_BT + '$'), 'code', 1], [/\*\*([^*\s][^*]*?)\*\*$/, 'strong', 2], [/~~([^~\s][^~]*?)~~$/, 's', 2], [/(?:^|[^*\w])\*([^*\s][^*]*?)\*$/, 'em', 1]];
  let m = null;
  let tag = '';
  let k = 0;
  for (const [re, tg, w] of pats) { m = re.exec(before); if (m) { tag = tg; k = w; break; } }
  if (!m || (tag === 'em' && m[1].endsWith(' '))) return false;
  const end = s.anchorOffset;
  node.splitText(end);
  const mid = node.splitText(end - (m[1].length + 2 * k));
  const x = document.createElement(tag);
  x.textContent = m[1];
  mid.replaceWith(x);
  const zw = document.createTextNode(HXD_ZW);
  x.after(zw);
  const r = document.createRange();
  r.setStart(zw, 1);
  r.collapse(true);
  s.removeAllRanges();
  s.addRange(r);
  return true;
}
const HXD_MARKS = { strong: 'strong, b', em: 'em, i', s: 's, del, strike', code: 'code' };
/** A mark on the selection (bold, italic, strike, code), or off when the selection is inside one already. */
function hxdToggle(el, tag) {
  const s = getSelection();
  if (!s.rangeCount || el.classList.contains('raw')) return;
  const r = s.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return;
  const sel = HXD_MARKS[tag];
  const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const inside = anc.closest(sel);
  if (inside && el.contains(inside)) {
    const kids = [...inside.childNodes];
    inside.replaceWith(...kids);
    if (kids.length) { const rr = document.createRange(); rr.setStartBefore(kids[0]); rr.setEndAfter(kids[kids.length - 1]); s.removeAllRanges(); s.addRange(rr); }
  } else {
    if (r.collapsed) return;
    const frag = r.extractContents();
    frag.querySelectorAll(sel).forEach((x) => x.replaceWith(...x.childNodes));
    const w = document.createElement(tag);
    if (tag === 'code') w.textContent = frag.textContent; else w.append(frag);
    r.insertNode(w);
    const rr = document.createRange();
    rr.selectNodeContents(w);
    s.removeAllRanges();
    s.addRange(rr);
  }
  el.normalize();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A link on the selection (or the link it is in, given a new address; an empty address takes the link off). */
function hxdLink(el, range, url) {
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(range);
  const anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const a = anc.closest('a');
  url = String(url || '').trim();
  if (a && el.contains(a)) { if (url) a.dataset.href = url; else a.replaceWith(...a.childNodes); } else {
    if (!url || range.collapsed) return;
    const frag = range.extractContents();
    frag.querySelectorAll('a').forEach((x) => x.replaceWith(...x.childNodes));
    const w = document.createElement('a');
    w.dataset.href = url;
    w.append(frag);
    range.insertNode(w);
    const rr = document.createRange();
    rr.selectNodeContents(w);
    s.removeAllRanges();
    s.addRange(rr);
  }
  el.normalize();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Every mark the selection touches comes off (the words stay, still selected). */
function hxdClear(el) {
  const s = getSelection();
  if (!s.rangeCount || el.classList.contains('raw')) return;
  const r = s.getRangeAt(0);
  if (!el.contains(r.commonAncestorContainer)) return;
  const a = hxdCaret(el);
  const b = hxdCaret(el, true);
  // (a live range collapses as the nodes around it move: the selection is put back from where its words are)
  const marks = [...el.querySelectorAll('strong, b, em, i, s, del, strike, code, a')].filter((m) => r.intersectsNode(m));
  for (const m of marks) if (m.isConnected) m.replaceWith(...m.childNodes);
  el.normalize();
  hxdSelect(el, a, b);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ------------------------------------------------------------------ changing rules (each one undoable) */
/** One rule in a new format, inside bs (changed in place); returns where its words end up (-1: not a format). */
function hxdTurn(bs, i, fmt, words) {
  const b = bs[i];
  const w = words != null ? words : hxdIsText(b) ? hxdWords(b) : hxdBody(b);
  const lead = b.type === 'heading' || b.type === 'front' ? 0 : hxbLead(b);
  const pad = ' '.repeat(lead);
  const was = b.type === 'item' ? b : null;
  const wasCk = was ? HXD_CHECK.exec(hxdText(b)) : null;
  let nb;
  if (fmt === 'hr') { // a divider: put above the words when there are any (they stay a rule of their own)
    const hr = { type: 'hr', lines: ['---'] };
    if (w.trim() && hxdIsText(b)) { bs.splice(i, 0, hr); hxdSpace(bs, bs.indexOf(hr)); return bs.indexOf(b); }
    bs[i] = hr;
    return hxdSpace(bs, i);
  }
  if (fmt === 'para') nb = { type: 'para', lead, lines: w ? w.split('\n').map((p) => (p.trim() ? pad + p : '')) : [''] };
  else if (fmt === 'ul' || fmt === 'ol' || fmt === 'task') {
    const marker = fmt === 'ol' ? (was && /^\d/.test(was.marker) ? was.marker : '1.') : (was && !/^\d/.test(was.marker) ? was.marker : '-');
    nb = { type: 'item', indent: lead, marker, gap: was ? was.gap : ' ', lines: [] };
    nb.lines = hxbItemLines(nb, (fmt === 'task' ? (wasCk ? wasCk[0] : '[ ] ') : '') + w);
  } else if (fmt[0] === 'h') {
    const lv = Number(fmt[1]);
    const t = w.replace(/\n/g, ' ').trim();
    nb = { type: 'heading', level: lv, text: t, lines: [`${'#'.repeat(lv)} ${t}`] };
  } else if (fmt === 'code') { const fc = hxdFenceFor(w); nb = { type: 'code', lang: '', lines: [pad + fc, ...(w ? w.split('\n') : ['']).map((l) => (l ? pad + l : '')), pad + fc] }; } else if (fmt === 'memo') { const m = hxdMemoSafe(w); nb = { type: 'comment', lines: m.includes('\n') ? [pad + '<!--', ...m.split('\n').map((l) => (l ? pad + l : '')), pad + '-->'] : [`${pad}<!-- ${m} -->`] }; }
  else if (fmt === 'import') { const ws = w.trim().split(/\s+/).map((x) => x.replace(/^@/, '')); nb = { type: 'import', lines: ['@' + (ws.find((x) => /[\\/]|\.[A-Za-z0-9]{1,6}$/.test(x)) || ws[0] || '')] }; }
  else return -1;
  bs[i] = nb;
  return hxdSpace(bs, i);
}
const hxdTextFmt = (fmt) => fmt === 'para' || fmt === 'ul' || fmt === 'ol' || fmt === 'task' || fmt[0] === 'h';
function hxdConvert(dr, i, fmt, words, at = {}) {
  const b = dr.blocks[i];
  if (!b || (words == null && fmt === hxdFmt(b))) return;
  const bs = dr.blocks.slice();
  const j = hxdTurn(bs, i, fmt, words);
  if (j < 0) return;
  if (fmt === 'hr' && !hxdIsText(bs[j])) { // (as in Notion) the writing goes on in a new rule under the divider
    bs.splice(j + 1, 0, { type: 'para', lead: 0, lines: [''] });
    const k = hxdSpace(bs, j + 1);
    hxbApply(dr, bs, { focus: { b: k, off: 0 } });
    return;
  }
  hxbApply(dr, bs, { focus: hxdTextFmt(fmt) || fmt === 'hr' ? { b: j, off: at.off ?? 'end' } : { b: j, card: true } });
}
/** Enter: the words after the caret start the next rule (a list goes on; an empty item leaves the list). */
function hxdEnter(dr, el, i) {
  const b = dr.blocks[i];
  const [left, right] = hxdSplit(el);
  const pre = el.dataset.check || '';
  if (b.type === 'item' && !left && !right) { if (b.indent > 0) hxdTab(dr, el, i, -1); else hxdConvert(dr, i, 'para', '', { off: 0 }); return; }
  if (b.type === 'para' && !left && !right && hxbLead(b) > 0) { hxdTab(dr, el, i, -1); return; }
  if (b.type === 'para' && !left && !right) return; // an empty plain rule stays one (no run of empty lines in the file)
  if (!left && right) {
    const bs = dr.blocks.slice();
    let nb;
    if (b.type === 'item') { nb = { type: 'item', indent: b.indent, marker: b.marker, gap: b.gap, lines: [] }; nb.lines = hxbItemLines(nb, pre ? '[ ] ' : ''); } else nb = { type: 'para', lead: b.type === 'para' ? hxbLead(b) : 0, lines: [''] };
    bs.splice(i, 0, nb);
    hxdSpace(bs, i);
    hxbApply(dr, bs, { focus: { b: bs.indexOf(b), off: 0 } });
    return;
  }
  const bs = dr.blocks.slice();
  bs[i] = hxdSet(b, pre + left);
  let nb;
  let at = i + 1;
  if (b.type === 'item') {
    nb = { type: 'item', indent: b.indent, marker: b.marker, gap: b.gap, lines: [] };
    nb.lines = hxbItemLines(nb, (pre ? '[ ] ' : '') + right);
    if (!right) at = hxbSubtree(bs, i); // at the end: after what is nested under it
  } else {
    const lead = b.type === 'para' ? hxbLead(b) : 0;
    const pad = ' '.repeat(lead);
    nb = { type: 'para', lead, lines: right ? right.split('\n').map((p) => (p.trim() ? pad + p : '')) : [''] };
  }
  bs.splice(at, 0, nb);
  const j = hxdSpace(bs, at);
  hxbApply(dr, bs, { focus: { b: j, off: 0 } });
}
/** Where Tab / Shift+Tab takes a rule: the column to indent it to, or null (markdown nests only under a list item). */
function hxdTabTo(bs, i, dir) {
  const b = bs[i];
  if (!b || b.type === 'heading' || b.type === 'front' || b.type === 'blank') return null;
  const lead = hxbLead(b);
  let to = null;
  for (let k = i - 1; k >= 0; k--) {
    const p = bs[k];
    if (p.type === 'blank') continue;
    if (p.type === 'heading' || p.type === 'front') break;
    const pl = hxbLead(p);
    if (dir > 0) {
      if (p.type !== 'item') { if (pl > lead) continue; break; }
      if (pl > lead) continue; // inside the sibling above: look past it
      // a list item goes under the item at its own level; other rules under the item they follow
      if (b.type === 'item' ? pl === lead : true) to = pl + p.marker.length + p.gap.length;
      break;
    } else {
      if (p.type === 'item' && pl < lead) { to = pl; break; }
      if (pl < lead && p.type !== 'item') { to = 0; break; }
    }
  }
  if (dir < 0 && to == null && lead > 0) to = 0;
  if (to == null || to === lead || (dir > 0 && to < lead)) return null;
  return to;
}
/** Tab / Shift+Tab on rules a..end (one rule, or the picked ones): one level in or out, together. */
function hxdIndentRun(dr, a, end, dir, focus) {
  const bs = dr.blocks.slice();
  const to = hxdTabTo(bs, a, dir);
  if (to == null) { // why Tab did nothing
    if (dir > 0 && bs[a] && bs[a].type !== 'heading') toast(bs[a].type === 'item' ? HXD_TIP_NEST_ITEM : HXD_TIP_NEST_PARA, { icon: 'info', ms: 2600 });
    return;
  }
  bs.splice(a, end - a, ...hxbShift(bs.slice(a, end), to - hxbLead(bs[a])));
  const j = hxdSpace(bs, a, end - 1);
  hxbApply(dr, bs, { focus: focus === 'pick' ? { pick: [j, j + (end - a) - 1] } : { b: j, off: focus } });
}
function hxdTab(dr, el, i, dir) {
  if (!dr.blocks[i] || dr.blocks[i].type === 'heading') return;
  hxdIndentRun(dr, i, hxbSubtree(dr.blocks, i), dir, el ? hxdCaret(el) : 'end');
}
/** Backspace at the start: a list item or a title becomes plain text, nested text comes out, then it joins the rule above. */
function hxdBackspace(dr, el, i) {
  const b = dr.blocks[i];
  const w = hxdRead(el);
  if (b.type === 'item' || b.type === 'heading') { hxdConvert(dr, i, 'para', w, { off: 0 }); return; }
  if (b.type === 'para' && hxbLead(b) > 0) { hxdTab(dr, el, i, -1); return; }
  let p = i - 1;
  while (p >= 0 && dr.blocks[p].type === 'blank') p--;
  if (p < 0) return;
  const prev = dr.blocks[p];
  const bs = dr.blocks.slice();
  if (!hxdIsText(prev)) { // code, a memo …: an empty rule after it goes; after a written one the card is picked
    if (w) { hxdPickSet(dr, p); return; }
    hxdCut(bs, i, i + 1);
    let t = p;
    while (t >= 0 && !hxdIsText(bs[t])) t--;
    hxbApply(dr, bs, { focus: t >= 0 ? { b: t, off: 'end' } : null });
    return;
  }
  const pw = hxdWords(prev);
  HXD_TPL.innerHTML = hxdHTML(pw);
  const off = hxdSafe(pw) ? hxdLen(HXD_TPL.content) : pw.length;
  const ck = prev.type === 'item' ? (HXD_CHECK.exec(hxdText(prev)) || [''])[0] : '';
  bs[p] = hxdSet(prev, ck + pw + w);
  bs.splice(p + 1, i - p);
  hxbApply(dr, bs, { focus: { b: p, off } });
}
/** Delete at the end: the text rule below joins this one. */
function hxdDelete(dr, el, i) {
  let n = i + 1;
  while (n < dr.blocks.length && dr.blocks[n].type === 'blank') n++;
  const next = dr.blocks[n];
  if (!next) return;
  if (!hxdIsText(next)) { hxdPickSet(dr, n); return; }
  const b = dr.blocks[i];
  const off = hxdLen(el);
  const bs = dr.blocks.slice();
  bs[i] = hxdSet(b, (el.dataset.check || '') + hxdRead(el) + hxdWords(next));
  bs.splice(i + 1, n - i);
  hxbApply(dr, bs, { focus: { b: i, off } });
}
/** Drop rules from..end (a rule with what is nested under it, or the picked ones) before / after another rule; they take its level.
 *  focus: a caret offset for the first one, 'pick' to keep them picked, or nothing. */
function hxdDrop(dr, from, target, focus, end = hxbSubtree(dr.blocks, from)) {
  const bs = dr.blocks.slice();
  if (target.at >= from && target.at < end) return null;
  if (bs[from].type === 'front' || (bs[target.at].type === 'front' && !target.after)) return null; // (front matter stays first)
  const t = bs[target.at];
  const tl = t.type === 'heading' || t.type === 'front' ? 0 : hxbLead(t);
  let run = hxdCut(bs, from, end);
  while (run.length && run[run.length - 1].type === 'blank') run.pop();
  const ti = bs.indexOf(t); // where the target is once the rules are out (a blank line may have gone with them)
  run = hxbShift(run, tl - hxbLead(run[0]));
  // put before a numbered rule of the same list, it takes that rule's number (the list keeps starting where it did)
  if (!target.after && t.type === 'item' && run[0].type === 'item' && /^\d/.test(t.marker) && /^\d/.test(run[0].marker) && t.indent === run[0].indent) {
    const nb = { ...run[0], marker: t.marker };
    nb.lines = hxbItemLines(nb, hxbItemText(run[0]), run[0]);
    run[0] = nb;
  }
  const at = target.after ? (t.type === 'heading' ? ti + 1 : hxbSubtree(bs, ti)) : ti;
  bs.splice(at, 0, ...run);
  const j = hxdSpace(bs, at, at + run.length - 1);
  const last = bs.indexOf(run[run.length - 1]);
  hxbApply(dr, bs, { focus: focus === 'pick' ? { pick: [j, last] } : focus == null ? null : { b: j, off: focus } });
  return j;
}
/** Alt+Up / Alt+Down: rules a..end past the rule above / below at their level. */
function hxdMoveRun(dr, a, end, dir, focus) {
  const bs = dr.blocks;
  if (bs[a].type === 'front') return;
  const lead = hxbLead(bs[a]);
  if (dir < 0) {
    let p = a - 1;
    while (p >= 0 && (bs[p].type === 'blank' || (bs[p].type !== 'heading' && bs[p].type !== 'front' && hxbLead(bs[p]) > lead))) p--;
    if (p < 0 || bs[p].type === 'front') return;
    hxdDrop(dr, a, { at: p, after: false }, focus, end);
  } else {
    let n = end;
    while (n < bs.length && bs[n].type === 'blank') n++;
    if (n >= bs.length) return;
    hxdDrop(dr, a, { at: n, after: true }, focus, end);
  }
}
const hxdMove = (dr, i, dir, off) => hxdMoveRun(dr, i, hxbSubtree(dr.blocks, i), dir, off);
function hxdDupRun(dr, a, end, focus) {
  if (dr.blocks[a].type === 'front') return;
  const bs = dr.blocks.slice();
  const copy = bs.slice(a, end).map((x) => ({ ...x, lines: x.lines.slice() }));
  while (copy.length && copy[copy.length - 1].type === 'blank') copy.pop();
  bs.splice(end, 0, ...copy);
  const j = hxdSpace(bs, end, end + copy.length - 1);
  const last = bs.indexOf(copy[copy.length - 1]);
  hxbApply(dr, bs, { focus: focus === 'pick' ? { pick: [j, last] } : hxdIsText(copy[0]) ? { b: j, off: 'end' } : null });
}
const hxdDuplicate = (dr, i) => hxdDupRun(dr, i, hxbSubtree(dr.blocks, i));
function hxdRemoveRun(dr, a, end) {
  const bs = dr.blocks.slice();
  hxdCut(bs, a, end);
  let t = Math.min(a, bs.length) - 1;
  while (t >= 0 && !hxdIsText(bs[t])) t--;
  let n = a;
  while (t < 0 && n < bs.length && !hxdIsText(bs[n])) n++;
  hxbApply(dr, bs, { focus: t >= 0 ? { b: t, off: 'end' } : n < bs.length ? { b: n, off: 0 } : null });
}
const hxdRemove = (dr, i) => hxdRemoveRun(dr, i, hxbSubtree(dr.blocks, i));
/** The picked text rules in one format (others stay as they are); they stay picked. */
function hxdTurnRun(dr, a, end, fmt) {
  const bs = dr.blocks.slice();
  const n0 = bs.length;
  for (let k = end - 1; k >= a; k--) if (hxdIsText(bs[k]) && hxdFmt(bs[k]) !== fmt) hxdTurn(bs, k, fmt);
  hxbApply(dr, bs, { focus: { pick: [a, Math.max(a, end - 1 + (bs.length - n0))] } });
}
/** A new plain rule below one (after what is nested under it), at its level; the format list opens on it. */
function hxdAddBelow(dr, i, slash) {
  const bs = dr.blocks.slice();
  const b = bs[i];
  const at = b ? hxbSubtree(bs, i) : bs.length;
  const lead = b && b.type !== 'heading' && b.type !== 'front' ? hxbLead(b) : 0;
  bs.splice(at, 0, { type: 'para', lead, lines: [''] });
  const j = hxdSpace(bs, at);
  hxbApply(dr, bs, { focus: { b: j, off: 0, slash } });
}

/* ------------------------------------------------------------------ several rules picked at once (as Notion's block selection) */
let HXD_PICKING = false; // a pick being dragged out with the mouse
/** The picked rules as a run of blocks [a, end): from the first to the last picked, with what is nested under them. */
function hxdPickRun(dr) {
  const p = dr.pick;
  if (!p || !dr.blocks) return null;
  const a = Math.min(p.a, p.b);
  const b = Math.max(p.a, p.b);
  let end = b + 1;
  for (let k = a; k <= b; k++) end = Math.max(end, hxbSubtree(dr.blocks, k));
  return [a, Math.min(end, dr.blocks.length)];
}
function hxdPickPaint(dr) {
  const r = hxdPickRun(dr);
  for (const row of dr.el.blocks.querySelectorAll('.hxd-r[data-b]')) { const i = Number(row.dataset.b); row.classList.toggle('picked', !!r && i >= r[0] && i < r[1]); }
}
/** Pick rules a..b (the page takes the keys: Delete, Tab, Ctrl+C …), or none. */
function hxdPickSet(dr, a, b) {
  dr.pick = a == null ? null : { a, b: b == null ? a : b };
  hxdPickPaint(dr);
  if (!dr.pick) return;
  const s = getSelection();
  if (s.rangeCount) s.removeAllRanges();
  hxdBarHide();
  hxdSlashClose();
  if (document.activeElement !== dr.el.blocks) dr.el.blocks.focus({ preventScroll: true });
}
const hxdRowIdx = (dr) => [...dr.el.blocks.querySelectorAll('.hxd-r[data-b]')].map((r) => Number(r.dataset.b));
/** The picked rules as markdown (their indent taken off, so they paste anywhere). */
function hxdPickText(dr) {
  const r = hxdPickRun(dr);
  if (!r) return '';
  const run = dr.blocks.slice(r[0], r[1]);
  return hxbJoin(hxbShift(run, -hxbLead(run[0]))).replace(/^\n+|\n+$/g, '') + '\n';
}
/** Markdown pasted as rules after rule i's run (end): parsed, put in, the pasted ones picked. */
function hxdPasteAfter(dr, end, text) {
  const t = String(text || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  if (!t) return;
  const add = hxdSealed(hxbParse(t));
  const bs = dr.blocks.slice();
  bs.splice(end, 0, ...add);
  const j = hxdSpace(bs, end, end + add.length - 1);
  hxbApply(dr, bs, { focus: { pick: [j, bs.indexOf(add[add.length - 1])] } });
}
function hxdPickKey(dr, e) {
  const run = hxdPickRun(dr);
  if (!run) return false;
  const [a, end] = run;
  const k = e.key;
  const ctrl = modKey(e);
  const lk = k.toLowerCase();
  const rows = hxdRowIdx(dr);
  const go = (i) => dr.el.blocks.querySelector(`.hxd-r[data-b="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  if (k === 'Escape') { hxdPickSet(dr, null); return true; }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    const dir = k === 'ArrowUp' ? -1 : 1;
    if (e.altKey || (ctrl && e.shiftKey)) { hxdMoveRun(dr, a, end, dir, 'pick'); return true; }
    const nx = rows[rows.indexOf(dr.pick.b) + dir];
    if (nx == null) return true;
    if (e.shiftKey) hxdPickSet(dr, dr.pick.a, nx);
    else if (dr.pick.a === dr.pick.b && !hxdIsText(dr.blocks[dr.pick.a]) && hxdIsText(dr.blocks[nx])) { hxdPickSet(dr, null); hxdFocus(dr, { b: nx, off: dir < 0 ? 'end' : 0 }); }
    else hxdPickSet(dr, nx);
    go(nx);
    return true;
  }
  if (k === 'Enter') { // back to writing, in the first picked text rule (or a card's editor)
    const first = rows.find((x) => x >= a && x < end && hxdIsText(dr.blocks[x]));
    hxdPickSet(dr, null);
    if (first != null) hxdFocus(dr, { b: first, off: 'end' }); else hxdEditCard(dr, a);
    return true;
  }
  if (k === 'Delete' || k === 'Backspace') { hxdRemoveRun(dr, a, end); return true; }
  if (k === 'Tab') { hxdIndentRun(dr, a, end, e.shiftKey ? -1 : 1, 'pick'); return true; }
  if (ctrl && (lk === 'c' || lk === 'x')) { window.mt.clipWrite(hxdPickText(dr)); if (lk === 'x') hxdRemoveRun(dr, a, end); return true; }
  if (ctrl && lk === 'v') { window.mt.clipRead().then((r) => hxdPasteAfter(dr, end, r && r.text)); return true; }
  if (ctrl && lk === 'd') { hxdDupRun(dr, a, end, 'pick'); return true; }
  if (ctrl && lk === 'a') { hxdPickSet(dr, rows[0], rows[rows.length - 1]); return true; }
  if (ctrl && k === '/') { const r = dr.el.blocks.querySelector(`.hxd-r[data-b="${a}"]`).getBoundingClientRect(); hxdMenu(dr, a, r.left, r.bottom + 4); return true; }
  if (ctrl && (lk === 'z' || lk === 'y')) { hxbUndo(dr, lk === 'y' || e.shiftKey); return true; }
  if (ctrl && lk === 's') { hxSave(dr); return true; }
  return k.length === 1 && !ctrl; // typed letters do nothing while rules are picked
}

/* ------------------------------------------------------------------ the format menu, the / list, the selection bar */
function hxdMenu(dr, i, x, y) {
  const b = dr.blocks[i];
  if (!b || dr.readonly) return;
  const run = hxdPickRun(dr);
  if (run && i >= run[0] && i < run[1] && hxdRowIdx(dr).filter((r) => r >= run[0] && r < run[1]).length > 1) { // several picked: what applies to them all
    const [a, end] = run;
    openMenu([
      { label: '형식' }, ...HXD_FORMATS.filter((f) => hxdTextFmt(f.k)).map((f) => ({ icon: f.icon, text: f.text, hint: f.mark, run: () => hxdTurnRun(dr, a, end, f.k) })), '-',
      { icon: 'arrowUp', text: '위로', hint: 'Alt+↑', run: () => hxdMoveRun(dr, a, end, -1, 'pick') },
      { icon: 'arrowDown', text: '아래로', hint: 'Alt+↓', run: () => hxdMoveRun(dr, a, end, 1, 'pick') },
      { icon: 'arrowRight', text: '들여쓰기', hint: 'Tab', run: () => hxdIndentRun(dr, a, end, 1, 'pick') },
      { icon: 'arrowLeft', text: '내어쓰기', hint: 'Shift+Tab', run: () => hxdIndentRun(dr, a, end, -1, 'pick') },
      { icon: 'copy', text: '복제', hint: 'Ctrl+D', run: () => hxdDupRun(dr, a, end, 'pick') },
      { icon: 'copy', text: '마크다운으로 복사', hint: 'Ctrl+C', run: () => window.mt.clipWrite(hxdPickText(dr)) },
      '-',
      { icon: 'trash', text: '삭제', hint: 'Delete', danger: true, run: () => hxdRemoveRun(dr, a, end) },
    ], x, y);
    return;
  }
  const now = hxdFmt(b);
  const fmts = b.type === 'front' || b.type === 'table' || b.type === 'quote' ? [] : HXD_FORMATS;
  openMenu([
    ...(fmts.length ? [{ label: '형식' }, ...fmts.map((f) => ({ icon: f.icon, text: f.text, hint: f.mark, cls: f.k === now ? 'hxd-on' : '', run: () => hxdConvert(dr, i, f.k) })), '-'] : []),
    ...(b.type === 'front' ? [] : [
      { icon: 'arrowUp', text: '위로', hint: 'Alt+↑', run: () => hxdMove(dr, i, -1, 'end') },
      { icon: 'arrowDown', text: '아래로', hint: 'Alt+↓', run: () => hxdMove(dr, i, 1, 'end') },
      { icon: 'copy', text: '복제', hint: 'Ctrl+D', run: () => hxdDuplicate(dr, i) },
      '-',
    ]),
    { icon: 'trash', text: '삭제', danger: true, run: () => hxdRemove(dr, i) },
  ], x, y);
}
// the / list: on an empty rule, / and a word filter the formats; ↑↓ Enter pick, Esc closes
let HXD_SLASH = null; // { el, dr, i, list, at, typed, box }
function hxdSlashOpen(dr, el, fromAdd) {
  hxdSlashClose();
  const i = Number(el.closest('[data-b]').dataset.b);
  HXD_SLASH = { dr, el, i, at: 0, typed: !fromAdd, q: '' };
  hxdSlashPaint();
}
function hxdSlashCheck(dr, el, w, soft) {
  const m = /^\/([^\s/]{0,20})$/.exec(w);
  if (m) {
    if (!HXD_SLASH || HXD_SLASH.el !== el) hxdSlashOpen(dr, el);
    const was = HXD_SLASH.q;
    HXD_SLASH.q = m[1];
    if ((soft || dr.composing) && !hxdSlashItems().length) HXD_SLASH.q = was; // (a syllable half typed: what was shown stays)
    HXD_SLASH.typed = true;
    HXD_SLASH.at = 0;
    hxdSlashPaint();
    return;
  }
  if (soft) return;
  if (HXD_SLASH && HXD_SLASH.el === el && (HXD_SLASH.typed || w)) hxdSlashClose();
}
function hxdSlashItems() {
  const q = (HXD_SLASH.q || '').toLowerCase();
  const shown = (t) => (window.tr ? window.tr(t) : t).toLowerCase();
  return HXD_FORMATS.filter((f) => !q || shown(f.text).includes(q) || f.text.includes(q) || f.words.split(' ').some((x) => x.startsWith(q)));
}
function hxdSlashPaint() {
  const st = HXD_SLASH;
  if (!st) return;
  const list = hxdSlashItems();
  if (!list.length) { hxdSlashClose(); return; }
  st.at = Math.max(0, Math.min(st.at, list.length - 1));
  if (!st.box) { st.box = h('div', 'hxd-slash'); st.box.addEventListener('mousedown', (e) => e.preventDefault()); st.box.addEventListener('click', (e) => { const it = e.target.closest('[data-f]'); if (it) hxdSlashPick(it.dataset.f); }); document.body.append(st.box); }
  st.box.innerHTML = `<div class="hxd-slash-h">형식</div>${list.map((f, k) => `<div class="hxd-slash-i${k === st.at ? ' on' : ''}" data-f="${f.k}">${icon(f.icon)}<span>${f.text}</span>${f.mark ? `<code class="no-i18n">${esc(f.mark)}</code>` : ''}</div>`).join('')}`;
  hydrateIcons(st.box);
  const r = st.el.getBoundingClientRect();
  const bh = st.box.offsetHeight;
  const top = r.bottom + 6 + bh > innerHeight - 8 ? Math.max(8, r.top - bh - 6) : r.bottom + 6;
  Object.assign(st.box.style, { left: `${Math.min(r.left, innerWidth - st.box.offsetWidth - 8)}px`, top: `${top}px` });
}
function hxdSlashClose() { if (HXD_SLASH && HXD_SLASH.box) HXD_SLASH.box.remove(); HXD_SLASH = null; }
function hxdSlashPick(k) {
  const st = HXD_SLASH;
  if (!st) return;
  hxdSlashClose();
  hxdConvert(st.dr, st.i, k, '', { off: 0 });
}
function hxdSlashKey(e) {
  const st = HXD_SLASH;
  if (!st || e.target !== st.el || e.isComposing || e.key === 'Process') return false; // (Enter while composing: picked once the syllable is in)
  const list = hxdSlashItems();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); st.at = (st.at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; hxdSlashPaint(); return true; }
  if (e.key === 'Enter') { e.preventDefault(); if (list[st.at]) hxdSlashPick(list[st.at].k); return true; }
  if (e.key === 'Tab') { hxdSlashClose(); return false; } // Tab still nests the rule (the list closes)
  if (e.key === 'Escape') { e.preventDefault(); hxdSlashClose(); return true; }
  return false;
}
// the selection bar: a selection inside one text rule shows it above (format, bold, code)
let HXD_BAR = null;
// the marks markdown keeps (no colour or underline: a file would not keep them)
const HXD_BAR_MARKS = [['bold', 'strong', 'bold', '굵게 (Ctrl+B)'], ['italic', 'em', 'italic', '기울임 (Ctrl+I)'], ['strike', 's', 'strike', '취소선 (Ctrl+Shift+S)'], ['code', 'code', 'code', '코드 (Ctrl+E)']];
function hxdBarHide() { if (HXD_BAR && !HXD_BAR.linking) HXD_BAR.hidden = true; }
function hxdBarBuild() {
  HXD_BAR = h('div', 'hxd-bar');
  HXD_BAR.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); }); // the selection stays
  HXD_BAR.addEventListener('click', (e) => {
    const st = HXD_BAR.target;
    const a = e.target.closest('[data-bar]')?.dataset.bar;
    if (!a || !st || !st.el.isConnected) return;
    if (a === 'fmt') { const rr = HXD_BAR.getBoundingClientRect(); HXD_BAR.hidden = true; hxdMenu(st.dr, Number(st.el.closest('[data-b]').dataset.b), rr.left, rr.bottom + 4); return; }
    if (a === 'link') { hxdLinkAsk(); return; }
    if (a === 'clear') hxdClear(st.el);
    const mk = HXD_BAR_MARKS.find((x) => x[0] === a);
    if (mk) hxdToggle(st.el, mk[1]);
    hxdBarUpdate();
  });
  document.body.append(HXD_BAR);
}
/** The link's address asked for in the bar itself (Enter puts it on, Esc goes back, an empty one takes it off). */
function hxdLinkAsk() {
  const st = HXD_BAR && HXD_BAR.target;
  const s = getSelection();
  if (!st || !s.rangeCount) return;
  const range = s.getRangeAt(0).cloneRange();
  const anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const a = anc.closest('a');
  HXD_BAR.linking = true;
  HXD_BAR.innerHTML = `${icon('link')}<input class="hxd-bar-url no-i18n" spellcheck="false" placeholder="https://"><button data-act="ok">${a ? '바꾸기' : '넣기'}</button>${a ? '<button data-act="off">링크 빼기</button>' : ''}`;
  hydrateIcons(HXD_BAR);
  const inp = HXD_BAR.querySelector('input');
  inp.value = a ? a.dataset.href || '' : '';
  const finish = (url) => {
    if (!HXD_BAR.linking) return;
    HXD_BAR.linking = false;
    HXD_BAR.hidden = true;
    st.el.focus({ preventScroll: true });
    if (url == null) { const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(range); } else hxdLink(st.el, range, url);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(inp.value); }
    if (e.key === 'Escape') { e.preventDefault(); finish(null); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (HXD_BAR.linking && !HXD_BAR.contains(document.activeElement)) finish(null); }, 0));
  HXD_BAR.querySelector('[data-act="ok"]').addEventListener('click', () => finish(inp.value));
  HXD_BAR.querySelector('[data-act="off"]')?.addEventListener('click', () => finish(''));
  inp.focus();
  inp.select();
}
function hxdBarUpdate() {
  if (HXD_BAR && HXD_BAR.linking) return;
  const dr = HX.drawer;
  const s = getSelection();
  if (!dr || !dr.el || dr.view !== 'blocks' || dr.readonly || !s.rangeCount || s.isCollapsed) { hxdBarHide(); return; }
  const r = s.getRangeAt(0);
  const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const el = anc && anc.closest('.hxd-t');
  if (!el || !dr.el.blocks.contains(el) || el.classList.contains('raw')) { hxdBarHide(); return; }
  if (!HXD_BAR) hxdBarBuild();
  const i = Number(el.closest('[data-b]').dataset.b);
  const b = dr.blocks[i];
  const f = HXD_FORMATS.find((x) => x.k === hxdFmt(b));
  HXD_BAR.target = { dr, el };
  HXD_BAR.innerHTML = `<button data-bar="fmt" title="형식 바꾸기 (Ctrl+/)">${f ? f.text : '형식'}${icon('chevronDown')}</button><i></i>${HXD_BAR_MARKS.map(([k, tag, ic, tip]) => `<button data-bar="${k}" class="${anc.closest(HXD_MARKS[tag]) ? 'on' : ''}" title="${tip}">${icon(ic)}</button>`).join('')}<button data-bar="link" class="${anc.closest('a') ? 'on' : ''}" title="링크 (Ctrl+K)">${icon('link')}</button><i></i><button data-bar="clear" title="서식 지우기">${icon('clearFormat')}</button>`;
  hydrateIcons(HXD_BAR);
  HXD_BAR.hidden = false;
  const rect = r.getBoundingClientRect();
  const bw = HXD_BAR.offsetWidth;
  const bh = HXD_BAR.offsetHeight;
  const box = dr.el.blocks.getBoundingClientRect();
  let top = rect.top - bh - 8;
  if (top < box.top + 2) top = rect.bottom + 8;
  Object.assign(HXD_BAR.style, { left: `${Math.max(box.left + 6, Math.min(rect.left + rect.width / 2 - bw / 2, innerWidth - bw - 8))}px`, top: `${top}px` });
}
document.addEventListener('selectionchange', () => { if (HX.open || HX_ONLY) requestAnimationFrame(hxdBarUpdate); });

/* ------------------------------------------------------------------ a code block's language, picked from a list */
const HXD_LANGS = ['bash', 'sh', 'powershell', 'cmd', 'ts', 'tsx', 'js', 'jsx', 'json', 'jsonc', 'yaml', 'toml', 'ini', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'php', 'ruby', 'sql', 'graphql', 'html', 'css', 'scss', 'xml', 'markdown', 'diff', 'dockerfile', 'makefile', 'text'];
const HXD_TIP_LANGPICK = '언어 고르기';
const HXD_TIP_LANGFIND = '언어 찾기 · 목록에 없으면 그대로 입력';
let HXD_LANG = null; // { box, dr, off }
function hxdLangClose() {
  if (!HXD_LANG) return;
  const st = HXD_LANG;
  HXD_LANG = null;
  st.box.remove();
  st.off();
  st.dr.el.blocks.classList.remove('locked');
}
/** The language list under a button: type to narrow it (or to name one that is not in it), ↑↓ Enter, Esc.
 *  The page under it does not scroll while it is open. */
function hxdLangMenu(dr, anchor, current, onPick) {
  if (HXD_LANG && HXD_LANG.anchor === anchor) { hxdLangClose(); return; } // (pressed again: it closes)
  hxdLangClose();
  const box = h('div', 'hxd-langmenu');
  box.innerHTML = `<input class="hxd-langq no-i18n" spellcheck="false" placeholder="${hxdTr(HXD_TIP_LANGFIND)}"><div class="hxd-langlist no-i18n"></div>`;
  document.body.append(box);
  const q = box.querySelector('input');
  const list = box.querySelector('.hxd-langlist');
  let at = 0;
  let items = [];
  const paint = () => {
    const v = q.value.trim().toLowerCase();
    items = [{ k: '' }, ...HXD_LANGS.map((k) => ({ k }))].filter((x) => !v || (x.k && x.k.includes(v)));
    if (v && !HXD_LANGS.includes(v) && /^[\w+#.-]+$/.test(v)) items.push({ k: v, custom: true });
    at = Math.max(0, Math.min(at, items.length - 1));
    list.innerHTML = items.map((x, n) => `<div class="hxd-langi${n === at ? ' on' : ''}${x.k === current ? ' now' : ''}" data-n="${n}">${x.k ? esc(x.k) : hxdTr('없음')}${x.k === current ? icon('check') : ''}</div>`).join('');
    hydrateIcons(list);
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (n) => { const x = items[n]; hxdLangClose(); if (x) onPick(x.k); };
  paint();
  const r = anchor.getBoundingClientRect();
  const bh = box.offsetHeight;
  const top = r.bottom + 4 + bh > innerHeight - 8 ? Math.max(8, r.top - bh - 4) : r.bottom + 4;
  Object.assign(box.style, { left: `${Math.max(8, Math.min(r.right - box.offsetWidth, innerWidth - box.offsetWidth - 8))}px`, top: `${top}px` });
  q.addEventListener('input', () => { at = 0; paint(); });
  q.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
    if (e.key === 'Enter') { e.preventDefault(); pick(at); }
    if (e.key === 'Escape') { e.preventDefault(); hxdLangClose(); anchor.focus?.(); }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const it = e.target.closest('[data-n]'); if (it) pick(Number(it.dataset.n)); });
  // the page under it stays where it is (its own list scrolls); a press outside closes it
  dr.el.blocks.classList.add('locked');
  const wheel = (e) => { if (!list.contains(e.target)) e.preventDefault(); };
  const outside = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) hxdLangClose(); }; // (the button itself: its click closes it)
  window.addEventListener('wheel', wheel, { capture: true, passive: false });
  window.addEventListener('pointerdown', outside, true);
  HXD_LANG = { box, dr, anchor, off: () => { window.removeEventListener('wheel', wheel, { capture: true }); window.removeEventListener('pointerdown', outside, true); } };
  q.focus();
}
/** A code block's language changed from its label (only its opening line is written again). */
function hxdSetLang(dr, i, lang) {
  const b = dr.blocks[i];
  if (!b || b.type !== 'code') return;
  const lead = hxbLead(b);
  const f = HXD_CODE_OPEN.exec(hxbDedent(b.lines[0], lead));
  if (!f || (f[3] || '').trim() === lang) return;
  const bs = dr.blocks.slice();
  bs[i] = { ...b, lang, lines: [' '.repeat(lead) + f[2] + lang, ...b.lines.slice(1)] };
  hxbApply(dr, bs);
}

/* ------------------------------------------------------------------ a table, edited as a table */
const HXD_TIP_TABLE = 'Tab 다음 칸 · Enter 아래 칸 · Esc 끝내기';
/** Markdown table lines → { head, aligns, body } (cells as written, a \| kept as it is). */
function hxdTableCells(ls) {
  const split = (l) => {
    const t = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = [];
    let cur = '';
    for (let k = 0; k < t.length; k++) {
      if (t[k] === '\\' && t[k + 1] === '|') { cur += '\\|'; k++; continue; }
      if (t[k] === '|') { out.push(cur.trim()); cur = ''; continue; }
      cur += t[k];
    }
    out.push(cur.trim());
    return out;
  };
  const rows = ls.filter((l) => l.trim()).map(split);
  const sep = rows.length > 1 && rows[1].every((c) => /^:?-+:?$/.test(c));
  const aligns = sep ? rows[1].map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : c.startsWith(':') ? 'l' : '')) : [];
  return { head: sep ? rows[0] : rows[0] || [''], aligns, body: rows.slice(sep ? 2 : 1) };
}
function hxdTableLines(t, pad) {
  const n = Math.max(t.head.length, ...t.body.map((r) => r.length), 1);
  const cell = (c) => String(c || '').replace(/\n/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|');
  const line = (r) => `${pad}| ${Array.from({ length: n }, (_, k) => cell(r[k])).join(' | ')} |`;
  const sep = `${pad}|${Array.from({ length: n }, (_, k) => ({ c: ':---:', r: '---:', l: ':---' }[t.aligns[k]] || '---')).join('|')}|`;
  return [line(t.head), sep, ...t.body.map(line)];
}
function hxdEditTable(dr, i, card, at) {
  const b = dr.blocks[i];
  const lead = hxbLead(b);
  const t = hxdTableCells(b.lines.map((l) => hxbDedent(l, lead)));
  let cur = [-1, 0]; // the cell with the caret: [row (-1: the head), column]
  let point = null; // where it was clicked: the caret goes there in that cell
  if (at && at.cell) {
    const tr = at.cell.closest('tr');
    const rows = [...at.cell.closest('table').querySelectorAll('tr')];
    cur = [rows.indexOf(tr) - 1, [...tr.children].indexOf(at.cell)];
    point = at;
  }
  let changed = false;
  let done = false;
  const width = () => Math.max(t.head.length, ...t.body.map((r) => r.length), 1);
  const get = (r, c) => (r < 0 ? t.head : t.body[r])[c] || '';
  const set = (r, c, v) => { const row = r < 0 ? t.head : t.body[r]; while (row.length <= c) row.push(''); row[c] = v; };
  const place = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); };
  const paint = () => {
    const n = width();
    const cellHTML = (tag, r) => Array.from({ length: n }, (_, c) => `<${tag} contenteditable="plaintext-only" spellcheck="false" data-r="${r}" data-c="${c}">${esc(get(r, c))}</${tag}>`).join('');
    card.innerHTML = `<table class="hxd-tedit no-i18n"><thead><tr>${cellHTML('th', -1)}</tr></thead><tbody>${t.body.map((_, r) => `<tr>${cellHTML('td', r)}</tr>`).join('')}</tbody></table>
      <div class="hxd-ttools"><button data-t="row" tabindex="-1">${icon('plus')}행</button><button data-t="col" tabindex="-1">${icon('plus')}열</button><i></i><button data-t="delrow" tabindex="-1">행 지우기</button><button data-t="delcol" tabindex="-1">열 지우기</button><span class="hxd-chint">${HXD_TIP_TABLE}</span></div>`;
    hydrateIcons(card);
    const el = card.querySelector(`[data-r="${cur[0]}"][data-c="${cur[1]}"]`) || card.querySelector('[data-r]');
    if (el) {
      el.focus({ preventScroll: true });
      const pos = point && document.caretRangeFromPoint ? document.caretRangeFromPoint(point.x, point.y) : null;
      point = null;
      if (pos && el.contains(pos.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); } else place(el);
    }
  };
  const go = (r, c) => {
    const n = width();
    if (c >= n) { c = 0; r++; }
    if (c < 0) { c = n - 1; r--; }
    if (r < -1) { r = -1; c = 0; }
    if (r >= t.body.length) { t.body.push(Array(n).fill('')); changed = true; }
    cur = [r, c];
    paint();
  };
  let rule = b; // the table as last written
  const write = () => {
    const j = dr.blocks.indexOf(rule);
    if (!changed || j < 0) return j;
    const bs = dr.blocks.slice();
    rule = bs[j] = { ...rule, lines: hxdTableLines(t, ' '.repeat(lead)) };
    changed = false;
    hxbApply(dr, bs, { quiet: true });
    return j;
  };
  const commit = (away) => {
    if (done) return;
    done = true;
    if (dr.cardCommit === write) dr.cardCommit = null;
    const j = write();
    hxdRender(dr, !away && j >= 0 ? { pick: [j, j] } : null);
  };
  dr.cardCommit = write;
  card.classList.add('editing');
  card.addEventListener('input', (e) => { const c = e.target.closest('[data-r]'); if (!c) return; set(Number(c.dataset.r), Number(c.dataset.c), c.textContent.replace(/\n/g, ' ')); changed = true; });
  card.addEventListener('focusin', (e) => { const c = e.target.closest('[data-r]'); if (c) cur = [Number(c.dataset.r), Number(c.dataset.c)]; });
  card.addEventListener('focusout', () => { setTimeout(() => { if (!done && document.hasFocus() && !card.contains(document.activeElement)) commit(true); }, 0); });
  card.addEventListener('mousedown', (e) => { if (e.target.closest('.hxd-ttools button')) e.preventDefault(); });
  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-t]')?.dataset.t;
    if (!a) return;
    const n = width();
    const [r, c] = cur;
    if (a === 'row') { t.body.splice(r + 1, 0, Array(n).fill('')); cur = [r + 1, 0]; }
    if (a === 'col') { for (const row of [t.head, ...t.body]) { while (row.length < n) row.push(''); row.splice(c + 1, 0, ''); } t.aligns.splice(c + 1, 0, ''); cur = [r, c + 1]; }
    if (a === 'delrow' && r >= 0) { t.body.splice(r, 1); cur = [Math.min(r, t.body.length - 1), c]; }
    if (a === 'delcol' && n > 1) { for (const row of [t.head, ...t.body]) row.splice(c, 1); t.aligns.splice(c, 1); cur = [r, Math.min(c, n - 2)]; }
    changed = true;
    paint();
  });
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    const k = e.key;
    if (k === 'Escape' || (k === 'Enter' && modKey(e))) { e.preventDefault(); commit(); return; }
    if (k === 'Tab') { e.preventDefault(); go(cur[0], cur[1] + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Enter') { e.preventDefault(); go(cur[0] + (e.shiftKey ? -1 : 1), cur[1]); }
  });
  paint();
}

/* ------------------------------------------------------------------ a rule that is not text, edited as written */
function hxdEditCard(dr, i, at) {
  if (dr.readonly) return;
  const b = dr.blocks[i];
  const row = dr.el.blocks.querySelector(`.hxd-r[data-b="${i}"]`);
  const card = row && row.querySelector('.hxd-card');
  if (!b || !card || card.classList.contains('editing')) return;
  if (b.type === 'table') { hxdEditTable(dr, i, card, at); return; }
  const lead = hxbLead(b);
  const pad = ' '.repeat(lead);
  const ls = b.lines.map((l) => hxbDedent(l, lead));
  let value = ls.join('\n');
  let make = (v) => v.split('\n').map((l) => (l ? pad + l : ''));
  let lang = null;
  if (b.type === 'code') {
    const f = HXD_CODE_OPEN.exec(ls[0]) || ['', '', HXD_BT3, ''];
    const closed = ls.length > 1 && HXB_FENCE.test(ls[ls.length - 1]);
    lang = (f[3] || '').trim();
    value = hxdBody(b);
    make = (v, lg) => { const fc = hxdFenceFor(v, f[2]); return [pad + fc + (lg || ''), ...v.split('\n').map((l) => (l ? pad + l : '')), pad + (closed && fc === f[2] ? ls[ls.length - 1].trim() : fc)]; };
  } else if (b.type === 'comment') {
    value = hxdBody(b);
    const multi = ls.length > 1;
    make = (v) => { v = hxdMemoSafe(v); return multi || v.includes('\n') ? [pad + '<!--', ...v.split('\n').map((l) => (l ? pad + l : '')), pad + '-->'] : [`${pad}<!-- ${v} -->`]; };
  } else if (b.type === 'import') {
    value = hxdBody(b);
    make = (v) => [`${pad}@${v.trim()}`];
  }
  card.classList.add('editing');
  card.innerHTML = `${lang != null ? `<button class="hxd-langin" tabindex="-1" title="${HXD_TIP_LANGPICK}"></button>` : ''}<textarea class="hxd-cta no-i18n" spellcheck="false" rows="1"></textarea>
    <div class="hxd-chint">Esc · Ctrl+Enter 로 끝내요</div>`;
  const ta = card.querySelector('textarea');
  const li = card.querySelector('.hxd-langin');
  ta.value = value;
  const showLang = () => { if (li) { li.innerHTML = `${lang ? `<span class="no-i18n">${esc(lang)}</span>` : esc(hxdTr('언어 없음'))}${icon('chevronDown')}`; hydrateIcons(li); } };
  showLang();
  if (li) {
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => hxdLangMenu(dr, li, lang, (k) => { lang = k; showLang(); ta.focus({ preventScroll: true }); }));
  }
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  grow();
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ta.value.length, ta.value.length);
  let done = false;
  let cur = b; // the rule as last written (a save while it is open writes it, and it stays open)
  const v0 = ta.value;
  const lang0 = lang || '';
  const write = () => {
    const j = dr.blocks.indexOf(cur); // (where its rule is now)
    if (j < 0) return -1;
    if (cur === b && ta.value === v0 && (lang || '') === lang0) return j; // (nothing changed: the lines stay as they are written)
    const lines = make(ta.value, lang || '');
    if (lines.join('\n') === cur.lines.join('\n')) return j;
    if (b.type === 'comment' && ta.value.includes('-->') && !cur.warned) toast('메모 안의 --> 는 -- > 로 적었어요 (메모가 거기서 끝나지 않게)', { icon: 'info', ms: 3200 });
    const bs = dr.blocks.slice();
    cur = bs[j] = { ...cur, lines, warned: ta.value.includes('-->'), ...(b.type === 'code' ? { lang: lang || '' } : {}) };
    hxbApply(dr, bs, { quiet: true });
    return j;
  };
  const commit = (toPara, away) => {
    if (done) return;
    done = true;
    if (dr.cardCommit === write) dr.cardCommit = null;
    if (toPara || (b.type === 'import' && !ta.value.trim())) { const j = dr.blocks.indexOf(cur); if (j >= 0) hxdConvert(dr, j, 'para', '', { off: 0 }); else hxdRender(dr); return; }
    const j = write();
    hxdRender(dr, !away && j >= 0 ? { pick: [j, j] } : null);
  };
  dr.cardCommit = write; // saving, a change from outside, a drag: what is typed here goes in first
  ta.addEventListener('input', grow);
  card.addEventListener('focusout', (e) => {
    if (card.contains(e.relatedTarget) || (HXD_LANG && HXD_LANG.box.contains(e.relatedTarget))) return; // (its language being picked)
    setTimeout(() => { if (!done && document.hasFocus() && !card.contains(document.activeElement) && !(HXD_LANG && HXD_LANG.box.contains(document.activeElement))) commit(false, true); }, 0); // (another window took the focus: the card waits)
  });
  const keys = (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    const k = e.key;
    if (k === 'Escape' || (k === 'Enter' && modKey(e)) || (k === 'Enter' && b.type === 'import')) { e.preventDefault(); commit(); return; }
    if (k === 'Backspace' && e.target === ta && !ta.value && b.type !== 'front') { e.preventDefault(); commit(true); return; }
    if (k === 'Tab' && e.target === ta && b.type === 'code') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  };
  ta.addEventListener('keydown', keys);
}

/* ------------------------------------------------------------------ keys, clicks, the handle */
function hxdKey(dr, el, e) {
  e.stopPropagation(); // what is typed here never reaches the app shortcuts or the terminal
  if (S.overlay) { if (/^(Enter|Tab|Arrow)/.test(e.key)) e.preventDefault(); return; }
  if (hxdSlashKey(e)) return;
  const k = e.key;
  const ctrl = modKey(e);
  const lk = k.toLowerCase();
  const i = Number(el.closest('[data-b]').dataset.b);
  const b = dr.blocks[i];
  if (!b) return;
  if (ctrl && e.shiftKey && lk === 's') { e.preventDefault(); hxdToggle(el, 's'); return; }
  if (ctrl && lk === 's') { e.preventDefault(); hxSave(dr); return; }
  if (ctrl && (lk === 'z' || lk === 'y') && !e.isComposing) { e.preventDefault(); hxbUndo(dr, lk === 'y' || e.shiftKey); return; }
  if (e.isComposing || k === 'Process') { // Enter / Tab pressed while a syllable is being composed: done once it is in
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Tab') { e.preventDefault(); dr.afterIme = { code: e.code, shift: e.shiftKey }; }
    return;
  }
  // (some IMEs send the key again once the syllable is in: it is done once, whichever comes first)
  if (k === 'Enter' || k === 'Tab') { if (dr.afterIme) dr.afterIme = null; else if (Date.now() - (dr.imeDone || 0) < 120) { e.preventDefault(); return; } }
  if (ctrl && lk === 'b') { e.preventDefault(); hxdToggle(el, 'strong'); return; }
  if (ctrl && lk === 'i') { e.preventDefault(); hxdToggle(el, 'em'); return; }
  if (ctrl && lk === 'e') { e.preventDefault(); hxdToggle(el, 'code'); return; }
  if (ctrl && lk === 'k') { e.preventDefault(); hxdBarUpdate(); if (HXD_BAR && !HXD_BAR.hidden) hxdLinkAsk(); return; }
  if (ctrl && k === '/') { e.preventDefault(); const r = el.getBoundingClientRect(); hxdMenu(dr, i, r.left, r.bottom + 4); return; }
  if (ctrl && lk === 'd') { e.preventDefault(); hxdDuplicate(dr, i); return; }
  if (ctrl && k === 'Enter' && el.dataset.check) { // a to-do ticked or unticked
    e.preventDefault();
    const on = /\[[xX]\]/.test(el.dataset.check);
    const bs = dr.blocks.slice();
    bs[i] = hxdSet(b, hxdText(b).replace(HXD_CHECK, (m0) => m0.replace(/\[( |x|X)\]/, on ? '[ ]' : '[x]')));
    hxbApply(dr, bs, { focus: { b: i, off: Math.max(0, hxdCaret(el)) } });
    return;
  }
  const fk = ctrl && HXD_KEYFMT.find(([alt, shift, code]) => e.altKey === alt && e.shiftKey === shift && e.code === code);
  if (fk) { e.preventDefault(); hxdConvert(dr, i, fk[3], undefined, { off: Math.max(0, hxdCaret(el)) }); return; }
  if ((e.altKey || (ctrl && e.shiftKey)) && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); hxdMove(dr, i, k === 'ArrowUp' ? -1 : 1, hxdCaret(el)); return; }
  if (k === 'Enter' && e.shiftKey) { e.preventDefault(); if (b.type !== 'heading') document.execCommand('insertLineBreak'); return; }
  if (k === 'Enter') { e.preventDefault(); hxdEnter(dr, el, i); return; }
  if (k === 'Tab') { e.preventDefault(); hxdTab(dr, el, i, e.shiftKey ? -1 : 1); return; }
  if (k === 'Backspace' && hxdAtStart(el)) { e.preventDefault(); hxdBackspace(dr, el, i); return; }
  if (k === 'Delete' && hxdAtEnd(el)) { e.preventDefault(); hxdDelete(dr, el, i); return; }
  if ((k === 'ArrowUp' || k === 'ArrowDown') && e.shiftKey && !ctrl && !e.altKey && hxdEdge(el, k === 'ArrowUp')) { // the selection grows past the rule: rules get picked
    const rows = hxdRowIdx(dr);
    const nx = rows[rows.indexOf(i) + (k === 'ArrowUp' ? -1 : 1)];
    e.preventDefault();
    hxdPickSet(dr, i, nx == null ? i : nx);
    return;
  }
  if (ctrl && lk === 'a' && (!hxdLen(el) || (hxdCaret(el) === 0 && hxdCaret(el, true) === hxdLen(el)))) { // a second Ctrl+A: every rule
    e.preventDefault();
    const rows = hxdRowIdx(dr);
    hxdPickSet(dr, rows[0], rows[rows.length - 1]);
    return;
  }
  if ((k === 'ArrowUp' || k === 'ArrowDown') && !e.shiftKey && hxdEdge(el, k === 'ArrowUp')) { if (hxdStep(dr, el, k === 'ArrowUp' ? -1 : 1)) e.preventDefault(); return; }
  if (k === 'ArrowLeft' && !e.shiftKey && hxdAtStart(el)) { if (hxdStep(dr, el, -1, 'end')) e.preventDefault(); return; }
  if (k === 'ArrowRight' && !e.shiftKey && hxdAtEnd(el)) { if (hxdStep(dr, el, 1, 'start')) e.preventDefault(); return; }
  if (k === 'Escape') { e.preventDefault(); if (HXD_SLASH) { hxdSlashClose(); return; } hxdPickSet(dr, i); } // (as in Notion) Esc picks the rule; Esc again lets it go
}
/** Is the caret on the first (up) / last (down) line of the rule? */
function hxdEdge(el, up) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  if (!hxdLen(el)) return true;
  const rects = s.getRangeAt(0).getClientRects();
  const rc = rects[0];
  if (!rc) return up ? hxdAtStart(el) : hxdAtEnd(el);
  const er = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
  return up ? rc.top - er.top < lh * 0.7 : er.bottom - rc.bottom < lh * 0.7;
}
/** The caret goes to the text rule above / below (at the same x, or its end / start). */
function hxdStep(dr, el, dir, where) {
  const rows = [...dr.el.blocks.querySelectorAll('.hxd-r[data-b]')];
  const nr = rows[rows.indexOf(el.closest('.hxd-r')) + dir];
  if (!nr || dr.readonly) return false;
  const next = nr.querySelector('.hxd-t');
  if (!next) { hxdPickSet(dr, Number(nr.dataset.b)); nr.scrollIntoView({ block: 'nearest' }); return true; }
  const x = (() => { const s = getSelection(); const rc = s.rangeCount ? s.getRangeAt(0).getClientRects()[0] : null; return rc ? rc.left : el.getBoundingClientRect().left; })();
  next.focus({ preventScroll: true });
  if (where === 'end' || where === 'start') hxdPlace(next, where === 'end' ? 'end' : 0);
  else {
    const nr = next.getBoundingClientRect();
    const y = dir < 0 ? nr.bottom - 6 : nr.top + 6;
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (pos && next.contains(pos.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); } else hxdPlace(next, dir < 0 ? 'end' : 0);
  }
  next.closest('.hxd-r').scrollIntoView({ block: 'nearest' });
  return true;
}
/** Pasted text: one line goes in as plain text; several lines of markdown become rules of their own. */
/** Copied HTML (a web page, a doc) as markdown: titles, lists, to-dos, code, bold, italic, strike, code and links.
 *  null when it has none of them (then the plain text is pasted). */
function hxdFromHTML(html) {
  const body = new DOMParser().parseFromString(String(html).split(HXD_ZW).join(''), 'text/html').body; // (no zero-width marks of ours carried in)
  if (!body || !body.querySelector('b, strong, i, em, s, del, strike, code, a[href], li, h1, h2, h3, h4, h5, h6, pre')) return null;
  const inline = (n) => {
    let s = '';
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { s += c.nodeValue.replace(/\s+/g, ' '); continue; }
      if (c.nodeType !== 1 || /^(SCRIPT|STYLE|META|TITLE)$/.test(c.tagName)) continue;
      const t = c.tagName;
      if (t === 'BR') { s += ' '; continue; }
      if (t === 'CODE') { const v = c.textContent; if (v) s += HX_BT + v + HX_BT; continue; }
      const w = inline(c);
      const href = t === 'A' ? c.getAttribute('href') || '' : '';
      const st = c.getAttribute('style') || '';
      const fw = (/font-weight:\s*(\w+)/.exec(st) || [])[1] || '';
      // (Google Docs wraps everything in <b style="font-weight:normal">: that is not bold)
      const bold = t === 'B' || t === 'STRONG' ? !/^(normal|[1-4]00)$/.test(fw) : /^(bold|[6-9]00)$/.test(fw);
      const around = (m) => w.match(/^\s*/)[0] + m + w.trim() + m + w.match(/\s*$/)[0]; // (spaces stay outside the marks)
      if (!w.trim()) s += w;
      else if (bold) s += around('**');
      else if (t === 'I' || t === 'EM' || /font-style:\s*italic/.test(st)) s += around('*');
      else if (t === 'S' || t === 'DEL' || t === 'STRIKE' || /line-through/.test(st)) s += around('~~');
      else if (/^https?:/i.test(href)) s += w.match(/^\s*/)[0] + '[' + w.trim() + '](' + href + ')' + w.match(/\s*$/)[0];
      else s += w;
    }
    return s.replace(/ +/g, ' ');
  };
  const out = [];
  const gap = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  const list = (ul, pad) => {
    let k = 1;
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      const own = document.createElement('span');
      for (const x of li.childNodes) if (!(x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName))) own.append(x.cloneNode(true));
      const cb = li.querySelector('input[type=checkbox]');
      const mk = ul.tagName === 'OL' ? `${k++}.` : '-';
      out.push(`${pad}${mk} ${cb ? (cb.checked ? '[x] ' : '[ ] ') : ''}${inline(own).trim()}`);
      for (const x of li.children) if (/^(UL|OL)$/.test(x.tagName)) list(x, pad + ' '.repeat(mk.length + 1));
    }
  };
  const BLOCK = /^(H[1-6]|PRE|UL|OL|HR|P|DIV|BLOCKQUOTE|LI|TR|TABLE|SECTION|ARTICLE|BR)$/;
  const walk = (n) => {
    let run = document.createElement('span'); // words and marks side by side: one line
    const flush = () => { const s = inline(run).trim(); if (s) { gap(); out.push(s, ''); } run = document.createElement('span'); };
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 1 && /^(SCRIPT|STYLE|META|LINK|TITLE)$/.test(c.tagName)) continue;
      if (c.nodeType === 3 || (c.nodeType === 1 && !BLOCK.test(c.tagName))) { run.append(c.cloneNode(true)); continue; }
      flush();
      if (c.nodeType !== 1 || c.tagName === 'BR') continue;
      const t = c.tagName;
      if (/^H[1-6]$/.test(t)) { gap(); out.push('#'.repeat(Math.min(3, Number(t[1]))) + ' ' + inline(c).trim(), ''); }
      else if (t === 'PRE') { gap(); const v = c.textContent.replace(/\n$/, ''); const fc = hxdFenceFor(v); out.push(fc, ...v.split('\n'), fc, ''); }
      else if (t === 'UL' || t === 'OL') { gap(); list(c, ''); out.push(''); }
      else if (t === 'HR') { gap(); out.push('---', ''); }
      else if (c.querySelector('p, div, ul, ol, h1, h2, h3, h4, h5, h6, pre, table, hr')) walk(c);
      else { const s = inline(c).trim(); if (s) { gap(); out.push(s, ''); } }
    }
    flush();
  };
  walk(body);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}
function hxdPaste(dr, el, e) {
  e.preventDefault();
  const plain = (e.clipboardData.getData('text/plain') || '').replace(/\r\n/g, '\n');
  const raw = el.classList.contains('raw');
  const html = raw || e.clipboardData.getData('application/x-minsuterm-md') ? '' : e.clipboardData.getData('text/html'); // (copied from a rule: its markdown as it is)
  const md = html ? hxdFromHTML(html) : null;
  const text = md || plain;
  if (!text) return;
  const s = getSelection();
  if (!raw && !s.isCollapsed && /^https?:\/\/\S+$/.test(plain.trim()) && s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) { hxdLink(el, s.getRangeAt(0).cloneRange(), plain.trim()); return; }
  if (raw || (!text.includes('\n') && !md)) { document.execCommand('insertText', false, raw ? plain : text); return; }
  const i = Number(el.closest('[data-b]').dataset.b);
  const b = dr.blocks[i];
  if (!text.includes('\n')) { // one line with marks: into this rule where the caret is
    const [left, right] = hxdSplit(el);
    const bs = dr.blocks.slice();
    bs[i] = hxdSet(b, (el.dataset.check || '') + left + text + right);
    HXD_TPL.innerHTML = hxdHTML(left + text);
    hxbApply(dr, bs, { focus: { b: i, off: hxdLen(HXD_TPL.content) } });
    return;
  }
  const [left, right] = hxdSplit(el);
  const pre = el.dataset.check || '';
  let add = hxdSealed(hxbParse(text.replace(/^\n+|\n+$/g, '')));
  if (b.type === 'item' && add.length && hxbLead(add[0]) === 0) add = hxbShift(add, b.indent);
  const bs = dr.blocks.slice();
  let at = i + 1;
  if (left || b.type !== 'para') bs[i] = hxdSet(b, pre + left); else { bs.splice(i, 1); at = i; }
  bs.splice(at, 0, ...add);
  let last = at + add.length - 1;
  if (right) { bs.splice(last + 1, 0, { ...hxdSet(b, (b.type === 'item' && pre ? '[ ] ' : '') + right) }); last++; } // the words after the caret: a rule like this one, after the pasted ones
  const j = hxdSpace(bs, at, last);
  const endAt = j + (last - at);
  let f = endAt;
  while (f >= j && !hxdIsText(bs[f])) f--;
  hxbApply(dr, bs, { focus: f >= j ? { b: f, off: 'end' } : null });
}

function hxdWire(dr) {
  const box = dr.el.blocks;
  const textOf = (t) => t && t.closest && t.closest('.hxd-t');
  const copy = (e, cut) => {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    const r = s.getRangeAt(0);
    const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const el = textOf(anc);
    if (!el || el.classList.contains('raw')) return;
    let wrap = document.createElement('div');
    wrap.append(r.cloneContents());
    for (let p = anc; p && p !== el; p = p.parentElement) { // inside a mark: the copy keeps it
      if (!/^(STRONG|B|EM|I|S|DEL|CODE|A)$/.test(p.tagName)) continue;
      const m = p.cloneNode(false);
      m.append(...wrap.childNodes);
      wrap = document.createElement('div');
      wrap.append(m);
    }
    e.preventDefault();
    e.clipboardData.setData('text/plain', hxdMd(wrap));
    e.clipboardData.setData('application/x-minsuterm-md', hxdMd(wrap));
    e.clipboardData.setData('text/html', wrap.innerHTML);
    if (cut && !dr.readonly) document.execCommand('delete');
  };
  box.addEventListener('copy', (e) => copy(e, false));
  box.addEventListener('cut', (e) => copy(e, true));
  box.addEventListener('input', (e) => { const el = textOf(e.target); if (el) hxdInput(dr, el, e); });
  box.addEventListener('compositionstart', () => { dr.composing = true; });
  box.addEventListener('compositionend', (e) => {
    dr.composing = false;
    const el = textOf(e.target);
    if (!el) return;
    const c = (e.data || '').slice(-1).charCodeAt(0) || 0;
    const hangul = (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e) || (c >= 0x1100 && c <= 0x11ff);
    setTimeout(() => {
      if (!el.isConnected) { dr.afterIme = null; return; } // (a key after it already drew the rules again)
      hxdInput(dr, el, { isComposing: !!dr.composing }); // (the next syllable already being composed: no marks turned into formats under it)
      const k = dr.afterIme;
      dr.afterIme = null;
      if (!k || !el.isConnected) return;
      if (k.code !== 'Tab' && !hangul) return; // the conversion was confirmed, nothing more
      dr.imeDone = Date.now();
      if (k.code !== 'Tab' && !k.shift && HXD_SLASH && HXD_SLASH.el === el) { const list = hxdSlashItems(); if (list[HXD_SLASH.at]) hxdSlashPick(list[HXD_SLASH.at].k); return; }
      const i = Number(el.closest('[data-b]').dataset.b);
      if (k.code === 'Tab') hxdTab(dr, el, i, k.shift ? -1 : 1);
      else if (k.shift) { if (dr.blocks[i].type !== 'heading') document.execCommand('insertLineBreak'); } else hxdEnter(dr, el, i);
    }, 0);
  });
  box.addEventListener('keydown', (e) => {
    const el = textOf(e.target);
    if (el) { hxdKey(dr, el, e); return; }
    if (e.target.closest('textarea, input')) return;
    if (dr.pick && !dr.readonly && !e.isComposing) { e.stopPropagation(); if (hxdPickKey(dr, e)) e.preventDefault(); return; }
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (modKey(e) && (k === 'z' || k === 'y')) { e.preventDefault(); hxbUndo(dr, k === 'y' || e.shiftKey); }
  });
  box.addEventListener('paste', (e) => { const el = textOf(e.target); if (el && !dr.readonly) hxdPaste(dr, el, e); });
  box.addEventListener('drop', (e) => { if (textOf(e.target)) e.preventDefault(); }); // no rich text dropped into a rule
  box.addEventListener('focusout', (e) => { if (textOf(e.target) && (!HXD_SLASH || HXD_SLASH.el === e.target)) setTimeout(() => { if (HXD_SLASH && document.activeElement !== HXD_SLASH.el) hxdSlashClose(); }, 0); });
  box.addEventListener('scroll', () => { hxdSpy(dr); hxdBarHide(); if (HXD_SLASH) hxdSlashPaint(); });
  box.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { hxOpenFile(o.dataset.open); return; }
    const ln = e.target.closest('.hxd-t a[data-href]');
    if (ln && (modKey(e) || dr.readonly)) { e.preventDefault(); if (/^https?:\/\//i.test(ln.dataset.href)) window.mt.openExternal(ln.dataset.href); return; }
    if (dr.readonly) return;
    const ck = e.target.closest('.hxd-ck');
    if (ck) {
      const i = Number(ck.dataset.ck);
      const b = dr.blocks[i];
      const t = hxdText(b);
      const bs = dr.blocks.slice();
      bs[i] = hxdSet(b, t.replace(HXD_CHECK, (m0) => m0.replace(/\[( |x|X)\]/, ck.checked ? '[x]' : '[ ]')));
      hxbApply(dr, bs);
      if (!dr.el.blocks.contains(document.activeElement)) dr.el.blocks.focus({ preventScroll: true });
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) { hxdAddBelow(dr, Number(add.dataset.add), true); return; }
    if (e.target.closest('[data-start]')) { hxbApply(dr, [{ type: 'para', lines: [''] }], { focus: { b: 0, off: 0 } }); return; }
    if (e.target.closest('[data-tail]')) { // below the last rule: the last plain rule if it is empty, else a new one
      const bs = dr.blocks;
      let k = bs.length - 1;
      while (k >= 0 && bs[k].type === 'blank') k--;
      if (k >= 0 && bs[k].type === 'para' && !hxdText(bs[k]).trim()) hxdFocus(dr, { b: k, off: 0 }); else hxdAddBelow(dr, k, false);
      return;
    }
    const lb = e.target.closest('[data-lang]');
    if (lb) { const li = Number(lb.dataset.lang); const f = HXD_CODE_OPEN.exec(hxbDedent(dr.blocks[li].lines[0], hxbLead(dr.blocks[li]))); hxdLangMenu(dr, lb, f ? (f[3] || '').trim() : '', (k) => hxdSetLang(dr, li, k)); return; }
    const card = e.target.closest('.hxd-card');
    if (card && !card.classList.contains('editing') && !e.target.closest('button, a')) hxdEditCard(dr, Number(card.closest('[data-b]').dataset.b), { x: e.clientX, y: e.clientY, cell: e.target.closest('th, td') });
  });
  // writing in a rule lets the picked ones go; the page itself takes the keys while rules are picked
  box.addEventListener('focusin', (e) => { if (dr.pick && textOf(e.target) && !HXD_PICKING) hxdPickSet(dr, null); });
  // rules picked with the mouse: a drag from one rule's words into another's, a band from the margin, Shift+click
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || dr.readonly || e.target.closest('.hxd-grip, button, a, input, textarea, .hxd-card.editing, .hxd-ck')) return;
    const row = e.target.closest('.hxd-r[data-b]');
    const inText = !!e.target.closest('.hxd-t');
    if (e.shiftKey && row) { // the pick (or the rule being written) grows to this one
      const from = dr.pick ? dr.pick.a : (hxdWhere(dr) || {}).b;
      if (from != null) { e.preventDefault(); hxdPickSet(dr, from, Number(row.dataset.b)); return; }
    }
    if (!inText && dr.pick) hxdPickSet(dr, null);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = row ? Number(row.dataset.b) : null;
    let mode = null;
    let band = null;
    const rowsIn = (y1, y2) => [...box.querySelectorAll('.hxd-r[data-b]')].filter((r) => { const rc = r.getBoundingClientRect(); return rc.bottom > y1 && rc.top < y2; }).map((r) => Number(r.dataset.b));
    const move = (ev) => {
      if (!mode) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (inText) { // the words' own selection until the pointer reaches another rule
          const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hxd-r[data-b]');
          if (!over || Number(over.dataset.b) === start) return;
          mode = 'rules';
        } else if (!row || !e.target.closest('.hxd-card')) mode = 'band'; else return;
        HXD_PICKING = true;
        try { box.setPointerCapture(e.pointerId); } catch { /* the release still comes to the window */ }
        box.classList.add('picking');
      }
      if (mode === 'rules') {
        const doc = box.querySelector('.hxd-doc').getBoundingClientRect();
        const over = document.elementFromPoint(Math.max(doc.left + 64, Math.min(ev.clientX, doc.right - 12)), ev.clientY)?.closest('.hxd-r[data-b]');
        if (over) hxdPickSet(dr, start, Number(over.dataset.b));
      } else {
        if (!band) { band = h('div', 'hxd-band'); document.body.append(band); }
        const y1 = Math.min(y0, ev.clientY);
        const y2 = Math.max(y0, ev.clientY);
        Object.assign(band.style, { left: `${Math.min(x0, ev.clientX)}px`, top: `${y1}px`, width: `${Math.abs(ev.clientX - x0)}px`, height: `${y2 - y1}px` });
        const hit = rowsIn(y1, y2);
        if (hit.length) hxdPickSet(dr, hit[0], hit[hit.length - 1]); else hxdPickSet(dr, null);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (band) band.remove();
      box.classList.remove('picking');
      HXD_PICKING = false;
      if (mode) { // the click that ends the drag (on the page below the rules it would add one) does nothing
        const eat = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        box.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => box.removeEventListener('click', eat, { capture: true }), 0);
        if (dr.pick) dr.el.blocks.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  box.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.hxd-t')) e.preventDefault(); });
  // the handle: pressed and let go, the menu; dragged, the rule (with what is nested under it, or every picked rule) moves
  box.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.hxd-grip');
    if (!grip || e.button !== 0 || dr.readonly) return;
    e.preventDefault();
    if (dr.cardCommit) dr.cardCommit(); // (a card being written: its words are in before anything moves; it gets no focusout here)
    try { grip.setPointerCapture(e.pointerId); } catch { /* the release still comes to the window */ }
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moving = false;
    let target = null;
    const mark = h('div', 'hxd-dropline');
    const one = Number(grip.dataset.grip);
    const run = hxdPickRun(dr);
    const group = !!run && one >= run[0] && one < run[1];
    const from = group ? run[0] : one;
    const end = group ? run[1] : hxbSubtree(dr.blocks, one);
    let last = null;
    let raf = 0;
    // near the top or bottom edge the page scrolls by itself, so a rule can be taken anywhere in a long file
    const edge = () => {
      raf = 0;
      if (!moving || !last) return;
      const bb = box.getBoundingClientRect();
      const y = Math.max(bb.top + 1, Math.min(last.clientY, bb.bottom - 1));
      const d = y < bb.top + 48 ? -(bb.top + 48 - y) / 3 : y > bb.bottom - 48 ? (y - (bb.bottom - 48)) / 3 : 0;
      // only when the rule is taken toward that edge (a rule picked up near the edge does not set the page moving)
      if (!d || (d < 0 ? last.clientY > y0 - 8 : last.clientY < y0 + 8)) return;
      const before = box.scrollTop;
      box.scrollTop += Math.max(-18, Math.min(18, d));
      if (box.scrollTop !== before) aim({ clientX: last.clientX, clientY: y });
      raf = requestAnimationFrame(edge);
    };
    const move = (ev) => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!moving) { moving = true; box.classList.add('sorting'); for (let k = from; k < end; k++) box.querySelector(`.hxd-r[data-b="${k}"]`)?.classList.add('dragging'); }
      last = { clientX: ev.clientX, clientY: ev.clientY };
      const bb = box.getBoundingClientRect();
      aim({ clientX: ev.clientX, clientY: Math.max(bb.top + 1, Math.min(ev.clientY, bb.bottom - 1)) });
      if (!raf) raf = requestAnimationFrame(edge);
    };
    const aim = (ev) => { // the rule under the pointer (the pointer may be over the margin: the page's words are aimed at)
      const doc = box.querySelector('.hxd-doc').getBoundingClientRect();
      const over = document.elementFromPoint(Math.max(doc.left + 64, Math.min(ev.clientX, doc.right - 12)), ev.clientY);
      const r2 = over && over.closest('.hxd-r');
      target = null;
      if (!r2 || !box.contains(r2)) { mark.remove(); return; }
      const ti = Number(r2.dataset.b);
      if (ti >= from && ti < end) { mark.remove(); return; }
      const rc = r2.getBoundingClientRect();
      const after = ev.clientY > rc.top + rc.height / 2;
      target = { at: ti, after };
      const bb = box.getBoundingClientRect();
      Object.assign(mark.style, { top: `${(after ? rc.bottom : rc.top) - bb.top + box.scrollTop - 1}px`, left: `${rc.left - bb.left}px`, width: `${rc.width}px` });
      if (!mark.isConnected) box.append(mark);
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (raf) cancelAnimationFrame(raf);
      mark.remove();
      box.classList.remove('sorting');
      box.querySelectorAll('.hxd-r.dragging').forEach((x) => x.classList.remove('dragging'));
      if (!moving) { const r = grip.getBoundingClientRect(); hxdMenu(dr, one, r.left, r.bottom + 4); return; }
      if (target) hxdDrop(dr, from, target, group ? 'pick' : null, end);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
}
