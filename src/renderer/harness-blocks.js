'use strict';
/* global HX, hxDirty, hxPaint, hxdRender, hxdWhere */

/*
 * 하네스 보기 · the file model under the 규칙 view (harness-doc.js): an instruction file as blocks — titles, list items,
 * plain text, code, tables, quotes, imports, memos (HTML comments the agent never sees), front matter, rules (---) and
 * blank lines.
 *  - every block keeps its exact source lines: the text is the blocks joined, so a block left alone is written back
 *    unchanged (the file never gets reformatted)
 *  - what is written under a list item, indented past its marker (a nested item, a paragraph, code), belongs to it:
 *    it moves and nests with it
 * Loaded before app.js; names start with hxb.
 */

/* ------------------------------------------------------------------ parse / join */
const HXB_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])(\s+)(.*)$/;
// (HX_BT: harness.js; a fence at any indent: code written under a list item)
const HXB_FENCE = new RegExp('^\\s*(' + HX_BT + '{3,}|~{3,})\\s*([\\w+-]*)');
const HXB_HEAD = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/; // (closing #s only after a space: "## Use C#" keeps its #)
const HXB_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const hxbIndent = (s) => s.replace(/\t/g, '  ').length;

/** Markdown → blocks [{ type, lines, … }]; joining every block's lines with \n gives the text back exactly. */
function hxbParse(text) {
  const lines = String(text).split('\n');
  const blocks = [];
  let i = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    const j = lines.findIndex((l, k) => k > 0 && k < 80 && /^---\s*$/.test(l));
    if (j > 0) { blocks.push({ type: 'front', lines: lines.slice(0, j + 1) }); i = j + 1; }
  }
  const special = (l) => !l.trim() || HXB_FENCE.test(l) || HXB_HEAD.test(l) || HXB_ITEM.test(l) || l.trim().startsWith('<!--') || /^\s*\|/.test(l) || /^\s*>/.test(l) || /^\s*@\S+\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { blocks.push({ type: 'blank', lines: [l] }); i++; continue; }
    const f = HXB_FENCE.exec(l);
    if (f) {
      const mark = f[1][0].repeat(f[1].length);
      let j = i + 1;
      while (j < lines.length && !(lines[j].trim().startsWith(mark) && !lines[j].trim().replace(f[1][0] === '~' ? /^~+/ : new RegExp('^' + HX_BT + '+'), '').trim())) j++;
      blocks.push({ type: 'code', lang: f[2] || '', lines: lines.slice(i, Math.min(j + 1, lines.length)) });
      i = j + 1;
      continue;
    }
    const close = l.indexOf('-->');
    if (l.trim().startsWith('<!--') && !(close >= 0 && l.slice(close + 3).trim())) {
      let j = i;
      while (j < lines.length && !lines[j].includes('-->')) j++;
      blocks.push({ type: 'comment', lines: lines.slice(i, Math.min(j + 1, lines.length)) });
      i = j + 1;
      continue;
    }
    const hd = HXB_HEAD.exec(l);
    if (hd) { blocks.push({ type: 'heading', level: hd[1].length, text: hd[2], lines: [l] }); i++; continue; }
    // --- on a line of its own after a blank line (or at the top): a rule across the page, not a list item
    if (HXB_HR.test(l) && (i === 0 || !lines[i - 1].trim())) { blocks.push({ type: 'hr', lines: [l] }); i++; continue; }
    const it = HXB_ITEM.exec(l);
    if (it) {
      const ind = hxbIndent(it[1]);
      const own = [l];
      let j = i + 1;
      // a line indented past the marker carries on the same rule
      while (j < lines.length && lines[j].trim() && !HXB_ITEM.test(lines[j]) && hxbIndent(lines[j].match(/^\s*/)[0]) > ind && !HXB_FENCE.test(lines[j])) own.push(lines[j++]);
      blocks.push({ type: 'item', indent: ind, marker: it[2], gap: it[3], lines: own });
      i = j;
      continue;
    }
    if (/^\s*@\S+\s*$/.test(l)) { blocks.push({ type: 'import', lines: [l] }); i++; continue; }
    if (/^\s*\|/.test(l)) { let j = i; while (j < lines.length && /^\s*\|/.test(lines[j])) j++; blocks.push({ type: 'table', lines: lines.slice(i, j) }); i = j; continue; }
    if (/^\s*>/.test(l)) { let j = i; while (j < lines.length && /^\s*>/.test(lines[j])) j++; blocks.push({ type: 'quote', lines: lines.slice(i, j) }); i = j; continue; }
    let j = i + 1;
    while (j < lines.length && !special(lines[j])) j++;
    blocks.push({ type: 'para', lines: lines.slice(i, j) });
    i = j;
  }
  return blocks;
}
const hxbJoin = (blocks) => blocks.map((b) => b.lines.join('\n')).join('\n');

/** A line with `pad` columns of indentation taken off its front (a tab counts as two). */
const hxbDedent = (l, pad) => { let col = 0; let k = 0; while (k < l.length && col < pad && (l[k] === ' ' || l[k] === '\t')) { col += l[k] === '\t' ? 2 : 1; k++; } return l.slice(k); };
/** Paths compared the way the file system does here (either slash, any case). */
const hxbSame = (a, b) => String(a).split('/').join('\\').toLowerCase() === String(b).split('/').join('\\').toLowerCase();
/** How far a block is indented: a list item by its marker, anything else by its first line. */
// (a paragraph made in the 규칙 view keeps its indent in `lead` too: an empty one has no line to hold it)
const hxbLead = (b) => (b.type === 'item' ? b.indent : b.type === 'blank' || b.type === 'heading' || b.type === 'front' ? 0 : b.lead != null ? b.lead : hxbIndent((b.lines[0] || '').match(/^\s*/)[0]));
/** A rule's own words (marker and continuation indent taken off), and the lines that write them back. */
function hxbItemText(b) {
  const pad = b.indent + b.marker.length + b.gap.length;
  const first = b.lines[0].replace(HXB_ITEM, '$4');
  return [first, ...b.lines.slice(1).map((l) => (hxbIndent(l.match(/^\s*/)[0]) >= pad ? hxbDedent(l, pad) : l.trim()))].join('\n');
}
function hxbItemLines(b, text, from = b) {
  const padN = b.indent + b.marker.length + b.gap.length;
  const pad = ' '.repeat(padN);
  const parts = String(text).split('\n');
  const old = (from && from.lines) || [];
  const oldPad = from && from.marker != null ? from.indent + from.marker.length + from.gap.length : padN;
  const d = padN - oldPad;
  const lead0 = (old[0] || '').match(/^\s*/)[0];
  const head = from && from.indent === b.indent && hxbIndent(lead0) === b.indent ? lead0 : ' '.repeat(b.indent);
  return [`${head}${b.marker}${b.gap}${parts[0]}`, ...parts.slice(1).map((p, k) => {
    if (!p.trim()) return '';
    const o = old[k + 1];
    if (o != null && o.trim()) {
      const was = hxbIndent(o.match(/^\s*/)[0]) >= oldPad ? hxbDedent(o, oldPad) : o.trim();
      if (was === p) return d > 0 ? ' '.repeat(d) + o : d < 0 ? hxbDedent(o, -d) : o;
    }
    return pad + p; // (a line written here: past the marker, its own deeper indent kept)
  })];
}
/** The blocks a list item carries with it: itself and what is indented past it (blank lines between); others carry nothing. */
function hxbSubtree(blocks, i) {
  const b = blocks[i];
  if (!b || b.type !== 'item') return i + 1;
  const inside = (x) => !!x && x.type !== 'blank' && x.type !== 'heading' && x.type !== 'front' && hxbLead(x) > b.indent;
  let j = i + 1;
  while (j < blocks.length) {
    if (inside(blocks[j])) { j++; continue; }
    if (blocks[j].type === 'blank') { let k = j; while (k < blocks.length && blocks[k].type === 'blank') k++; if (inside(blocks[k])) { j = k; continue; } }
    break;
  }
  return j;
}
/** Where a section ends: the next heading of the same or a higher level. */
function hxbSectionEnd(blocks, i) {
  let j = i + 1;
  while (j < blocks.length && !(blocks[j].type === 'heading' && blocks[j].level <= blocks[i].level)) j++;
  return j;
}
/** Shift a run of blocks sideways by d columns: the indent is added or taken off in front (tabs inside stay tabs). */
function hxbShift(run, d) {
  const move = (l) => (!l.trim() || !d ? l : d > 0 ? ' '.repeat(d) + l : hxbDedent(l, -d));
  return run.map((b) => {
    if (b.type === 'blank' || b.type === 'heading' || b.type === 'front') return b;
    const lines = b.lines.map(move);
    if (b.type === 'item') return { ...b, indent: hxbIndent(lines[0].match(/^\s*/)[0]), lines };
    return { ...b, lines, ...(b.type === 'para' ? { lead: Math.max(0, hxbLead(b) + d) } : {}) };
  });
}
/** The numbered lists: for each, the indexes of its items (nested rules and other markers end a list at their level). */
function hxbRuns(blocks) {
  const runs = [];
  const open = new Map(); // indent -> the numbered run open at that indent
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'blank') continue;
    if (b.type !== 'item') {
      const lead = hxbLead(b);
      if (b.type === 'heading' || b.type === 'front' || !lead) open.clear(); else for (const k of [...open.keys()]) if (k >= lead) open.delete(k);
      continue;
    }
    for (const k of [...open.keys()]) if (k > b.indent) open.delete(k);
    if (!/^\d/.test(b.marker)) { open.delete(b.indent); continue; }
    let run = open.get(b.indent);
    if (!run) { run = []; runs.push(run); open.set(b.indent, run); }
    run.push(i);
  }
  return runs;
}
/** Numbered rules counted again, only in the lists a change touched (before: the blocks as they were).
 *  A list written 1. 1. 1. stays that way; a list keeps the number it started at; when a marker gets wider
 *  (9. -> 10.) what is nested under it moves along, so it stays nested. */
function hxbRenumber(blocks, before) {
  const old = new Map((before || []).map((b, k) => [b, k]));
  const was = new Map(); // a block as it was -> the number its list started at, and whether that list was all one number
  if (before) hxbRuns(before).forEach((run, id) => {
    const ns = run.map((i) => parseInt(before[i].marker, 10));
    for (const i of run) was.set(before[i], { id, size: run.length, start: ns[0], lazy: ns.length > 1 && ns.every((x) => x === ns[0]) });
  });
  for (const run of hxbRuns(blocks)) {
    const kept = (n) => old.has(blocks[run[n]]);
    const from0 = run.map((i) => was.get(blocks[i])).filter(Boolean);
    const moved = run.some((i, n) => !kept(n) || (n > 0 && kept(n - 1) && old.get(blocks[i]) - old.get(blocks[run[n - 1]]) !== i - run[n - 1]))
      || from0.some((x) => x.id !== from0[0].id) || (from0.length && from0.length !== from0[0].size); // (an item taken out, or two lists met)
    if (before && !moved) continue; // a list nobody touched stays exactly as written
    const from = run.map((i) => was.get(blocks[i])).find(Boolean);
    const start = from ? from.start : parseInt(blocks[run[0]].marker, 10) || 1;
    run.forEach((i, n) => {
      const b = blocks[i];
      const mk = (from && from.lazy ? start : start + n) + b.marker.slice(-1);
      if (mk === b.marker) return;
      const nb = { ...b, marker: mk };
      nb.lines = hxbItemLines(nb, hxbItemText(b), b);
      const end = hxbSubtree(blocks, i);
      blocks[i] = nb;
      const d = mk.length - b.marker.length;
      if (d) {
        const was0 = blocks.slice(i + 1, end);
        const moved = hxbShift(was0, d);
        moved.forEach((x, k) => { if (old.has(was0[k])) old.set(x, old.get(was0[k])); if (was.has(was0[k])) was.set(x, was.get(was0[k])); });
        blocks.splice(i + 1, end - i - 1, ...moved);
      }
    });
  }
  return blocks;
}

/* ------------------------------------------------------------------ changes (each one undoable) */
/** The blocks become the text (numbers counted again) and the 규칙 view is drawn; focus: { b, off } or { b, card }. */
function hxbApply(dr, blocks, { focus = null, renumber = true, quiet = false } = {}) {
  if (dr.cardCommit && !quiet) { // a card still open: its words go in first, also into the rules this change was made from
    const was = dr.blocks;
    const w = dr.cardCommit;
    dr.cardCommit = null;
    w();
    if (dr.blocks !== was) dr.blocks.forEach((x, n) => { if (x !== was[n]) { const at = blocks.indexOf(was[n]); if (at >= 0) blocks[at] = x; } });
  }
  const bs = renumber ? hxbRenumber(blocks, dr.blocksFor === dr.text ? dr.blocks : null) : blocks;
  const next = hxbJoin(bs);
  if (next !== dr.text) {
    dr.undo = dr.undo || [];
    dr.undo.push({ text: dr.text, focus: hxdWhere(dr) });
    if (dr.undo.length > 300) dr.undo.shift();
    dr.redo = [];
    dr.text = next;
    dr.el.ta.value = next;
    hxDirty(dr);
    hxPaint(dr);
  }
  dr.blocks = bs;
  dr.blocksFor = dr.text;
  dr.typing = null;
  if (!quiet) hxdRender(dr, focus);
}
function hxbUndo(dr, redo) {
  const from = redo ? dr.redo : dr.undo;
  if (!from || !from.length) return;
  (redo ? (dr.undo = dr.undo || []) : (dr.redo = dr.redo || [])).push({ text: dr.text, focus: hxdWhere(dr) });
  const st = from.pop();
  const s = typeof st === 'string' ? { text: st, focus: null } : st;
  dr.text = s.text;
  dr.el.ta.value = dr.text;
  dr.blocks = hxbParse(dr.text);
  dr.blocksFor = dr.text;
  dr.typing = null;
  hxDirty(dr);
  hxPaint(dr);
  if (dr.view === 'blocks') {
    hxdRender(dr, s.focus);
    if (!dr.el.blocks.contains(document.activeElement)) dr.el.blocks.focus({ preventScroll: true }); // (keys go on working: Ctrl+Z again)
  }
}

/* ------------------------------------------------------------------ the raw text: lists carry on, Tab indents lines */
function hxRawKeys(e, dr) {
  const ta = dr.el.ta;
  if (dr.readonly || e.isComposing) return false;
  const v = ta.value;
  const s = ta.selectionStart;
  const en = ta.selectionEnd;
  const lineStart = v.lastIndexOf('\n', s - 1) + 1;
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && s === en) {
    const line = v.slice(lineStart, s);
    const after = v.slice(s).split('\n')[0];
    if (/^(\s*)([-*+]|\d{1,3}[.)])\s*$/.test(line) && !after.trim()) { // Enter on an empty rule: the list ends here
      ta.setSelectionRange(lineStart, s);
      document.execCommand('insertText', false, '');
      return true;
    }
    const g = /^(\s*)([-*+]|\d{1,3}[.)])(\s+)/.exec(line);
    if (!g) return false;
    const mk = /^\d/.test(g[2]) ? (parseInt(g[2], 10) + 1) + g[2].slice(-1) : g[2];
    document.execCommand('insertText', false, `\n${g[1]}${mk}${g[3]}`);
    return true;
  }
  if (e.key === 'Tab' && s !== en && v.slice(s, en).includes('\n')) {
    const from = lineStart;
    const to = en;
    const block = v.slice(from, to);
    const out = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^(?=.)/gm, '  ');
    ta.setSelectionRange(from, to);
    document.execCommand('insertText', false, out);
    ta.setSelectionRange(from, from + out.length);
    return true;
  }
  if (e.key === 'Tab' && e.shiftKey && s === en) {
    const line = v.slice(lineStart);
    const cut = /^( {1,2}|\t)/.exec(line);
    if (cut) { ta.setSelectionRange(lineStart, lineStart + cut[0].length); document.execCommand('insertText', false, ''); ta.setSelectionRange(s - cut[0].length, s - cut[0].length); }
    return true;
  }
  return false;
}
