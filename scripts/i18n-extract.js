'use strict';
/**
 * Collects every user-facing Korean phrase in the app (string literals and template-literal text, not comments)
 * → scripts/i18n-phrases.json. Keys are normalised the way the runtime translator looks them up:
 * numbers → "#", template placeholders → "#", whitespace collapsed.
 *   node scripts/i18n-extract.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['src/renderer/app.js', 'src/main.js', 'src/renderer/index.html', 'src/renderer/icons.js', 'src/renderer/themes.js', 'src/renderer/progress-bars.js', 'src/renderer/room-styles.js'];
const HANGUL = /[가-힣ㄱ-ㆎ]/;

/** String literal / template text pieces of a JS source (comments skipped). */
function jsStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const readTemplate = () => { // at the char after the opening backtick
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; out.push(text); return; }
      if (c === '$' && src[i + 1] === '{') {
        text += '\u0001'; // placeholder marker
        i += 2;
        let depth = 1;
        while (i < n && depth) { // skip the expression (it may hold strings / templates of its own)
          const d = src[i];
          if (d === '{') { depth++; i++; } else if (d === '}') { depth--; i++; } else if (d === '`') { i++; readTemplate(); } else if (d === "'" || d === '"') readQuoted(d); else i++;
        }
        continue;
      }
      text += c; i++;
    }
  };
  const readQuoted = (q) => { // at the opening quote
    i++;
    let text = '';
    while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { text += src.slice(i, i + 2); i += 2; } else { text += src[i]; i++; } }
    i++;
    out.push(text);
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') { readQuoted(c); continue; }
    if (c === '`') { i++; readTemplate(); continue; }
    i++;
  }
  return out;
}

const norm = (s) => s.replace(/\u0001/g, '#').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
const phrases = new Set();
function addText(t) {
  // split off HTML tags; each remaining text piece is a candidate
  for (const piece of t.replace(/\\n/g, '\n').split(/<[^>]*>|\n/)) {
    if (!HANGUL.test(piece)) continue;
    const full = norm(piece.replace(/&nbsp;/g, ' '));
    if (full && HANGUL.test(full)) phrases.add(full);
    for (const seg of full.split(/ · | — | \| /)) { const s2 = seg.trim(); if (HANGUL.test(s2)) phrases.add(s2); }
  }
}
/** Line-level fallback (the lexer above can lose sync on regex literals): quoted runs and template text, per line. */
function lineFallback(src) {
  for (const line of src.split('\n')) {
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/\s.*$/, '');
    if (!HANGUL.test(code)) continue;
    for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
      const v = m[1] ?? m[2];
      if (HANGUL.test(v)) addText(v.replace(/\$\{[^}]*\}/g, '\u0001'));
    }
    for (const m of code.matchAll(/(?:^|[>`}])([^<>`{}'"]*[가-힣][^<>`{}'"]*)(?=[<`$]|$)/g)) {
      // not text: a run from the start of a line that is plainly code (a regex with Hangul in it, a declaration), or a
      // piece of a nested template cut at its braces (its parentheses don't pair up: "…(코드" / ") · Enter…") — the
      // lexer above already has the whole phrase
      if (m.index === 0 && /^\s*(?:const|let|var|if|else|return|function|for|while|switch|case)\b/.test(m[1])) continue;
      if ((m[1].match(/\(/g) || []).length !== (m[1].match(/\)/g) || []).length) continue;
      addText(m[1]);
    }
  }
}
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f.endsWith('.html')) {
    const body = src.replace(/<!--[\s\S]*?-->/g, '');
    for (const m of body.matchAll(/>([^<]+)</g)) addText(m[1]);
    for (const m of body.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)) addText(m[1]);
  } else {
    for (const s of jsStrings(src)) if (HANGUL.test(s)) addText(s);
    lineFallback(src);
  }
}
const list = [...phrases].sort();
fs.writeFileSync(path.join(__dirname, 'i18n-phrases.json'), JSON.stringify(list, null, 1));
console.log('phrases', list.length, 'chars', list.join('').length);
