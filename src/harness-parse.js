'use strict';
/*
 * 하네스 보기: the small readers it needs (no dependencies). Each is a subset made for the files an agent setup holds:
 *  - toml(): Codex config.toml (tables, array tables, dotted keys, strings, numbers, booleans, arrays, inline tables)
 *  - frontmatter(): the YAML block on top of SKILL.md and rule files (scalars, lists, quoted strings, folded text)
 *  - imports(): the @path references in CLAUDE.md files, outside code spans and fenced blocks
 *  - globRe(): the glob patterns of claudeMdExcludes and rule `paths`
 *  - tokens(): a rough token count (labelled 약 on screen)
 * A reader that cannot make sense of its input throws; callers show "읽지 못함" instead of guessing.
 */

/* ---------------------------------------------------------------- TOML */
/** Keys that would reach Object.prototype through obj[key]: never set from a file. */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function toml(src) {
  const text = String(src).replace(/^﻿/, '');
  const root = {};
  let cur = root;
  let i = 0;
  const n = text.length;
  const fail = (msg) => { const line = text.slice(0, i).split('\n').length; throw new Error(`TOML ${line}: ${msg}`); };
  const ws = () => { while (i < n && (text[i] === ' ' || text[i] === '\t')) i++; };
  const wsnl = () => {
    for (;;) {
      while (i < n && /[ \t\r\n]/.test(text[i])) i++;
      if (text[i] === '#') { while (i < n && text[i] !== '\n') i++; continue; }
      break;
    }
  };
  const eol = () => {
    ws();
    if (text[i] === '#') while (i < n && text[i] !== '\n') i++;
    if (text[i] === '\r') i++;
    if (i < n && text[i] !== '\n') fail('줄 끝이 아님');
    i++;
  };
  function basicString() { // after the opening quote
    let s = '';
    while (i < n) {
      const c = text[i++];
      if (c === '"') return s;
      if (c === '\n') fail('문자열이 닫히지 않음');
      if (c === '\\') {
        const e = text[i++];
        const map = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
        if (e in map) s += map[e];
        else if (e === 'u' || e === 'U') { const len = e === 'u' ? 4 : 8; s += String.fromCodePoint(parseInt(text.slice(i, i + len), 16)); i += len; } else fail('알 수 없는 이스케이프');
      } else s += c;
    }
    return fail('문자열이 닫히지 않음');
  }
  function multiString(q) { // after the opening triple quote
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    let s = '';
    while (i < n) {
      if (text.startsWith(q + q + q, i)) {
        i += 3;
        while (text[i] === q) { s += q; i++; } // up to two quotes may close against the delimiter
        return s;
      }
      const c = text[i++];
      if (q === '"' && c === '\\') {
        if (/[ \t]*\r?\n/.test(text.slice(i, i + 3)) || text[i] === '\n' || text[i] === '\r') { while (i < n && /[ \t\r\n]/.test(text[i])) i++; continue; }
        const e = text[i++];
        const map = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
        if (e in map) s += map[e];
        else if (e === 'u' || e === 'U') { const len = e === 'u' ? 4 : 8; s += String.fromCodePoint(parseInt(text.slice(i, i + len), 16)); i += len; } else fail('알 수 없는 이스케이프');
      } else s += c;
    }
    return fail('여러 줄 문자열이 닫히지 않음');
  }
  function key() {
    ws();
    const c = text[i];
    if (c === '"') { i++; return basicString(); }
    if (c === "'") { const j = text.indexOf("'", i + 1); if (j < 0) fail('키가 닫히지 않음'); const k = text.slice(i + 1, j); i = j + 1; return k; }
    const m = /^[A-Za-z0-9_-]+/.exec(text.slice(i, i + 200));
    if (!m) fail('키가 아님');
    i += m[0].length;
    return m[0];
  }
  function keyPath() {
    const parts = [key()];
    for (;;) { ws(); if (text[i] !== '.') break; i++; parts.push(key()); }
    if (parts.some((k) => BAD_KEYS.has(k))) fail('쓸 수 없는 키'); // (__proto__ and the like would reach every object)
    return parts;
  }
  function value() {
    ws();
    const c = text[i];
    if (text.startsWith('"""', i)) { i += 3; return multiString('"'); }
    if (text.startsWith("'''", i)) { i += 3; return multiString("'"); }
    if (c === '"') { i++; return basicString(); }
    if (c === "'") { const j = text.indexOf("'", i + 1); const nl = text.indexOf('\n', i + 1); if (j < 0 || (nl >= 0 && nl < j)) fail('문자열이 닫히지 않음'); const s = text.slice(i + 1, j); i = j + 1; return s; }
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        wsnl();
        if (text[i] === ']') { i++; return arr; }
        arr.push(value());
        wsnl();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return arr; }
        fail('배열이 닫히지 않음');
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        const kp = keyPath();
        ws();
        if (text[i] !== '=') fail('= 가 없음');
        i++;
        setPath(obj, kp, value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail('인라인 표가 닫히지 않음');
      }
    }
    const m = /^[^\s,\]}#]+/.exec(text.slice(i, i + 200));
    if (!m) fail('값이 없음');
    const raw = m[0];
    i += raw.length;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = raw.replace(/_/g, '');
    if (/^[+-]?(\d+|0x[0-9a-f]+|0o[0-7]+|0b[01]+)$/i.test(num)) return Number(num.replace(/^([+-]?)0o/i, '$10o'));
    if (/^[+-]?(\d+(\.\d+)?([eE][+-]?\d+)?|inf|nan)$/.test(num)) return Number(num);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) { // a date-time may contain one space
      const m2 = /^ \d{2}:\d{2}[^\s,\]}#]*/.exec(text.slice(i));
      if (m2) i += m2[0].length;
      return raw + (m2 ? m2[0] : '');
    }
    return fail('알 수 없는 값'); // (the value itself is never in a message: it may be a secret)
  }
  function setPath(obj, kp, v) {
    let o = obj;
    for (let k = 0; k < kp.length - 1; k++) {
      if (!Object.prototype.hasOwnProperty.call(o, kp[k])) o[kp[k]] = {};
      o = o[kp[k]];
      if (typeof o !== 'object' || o === null || Array.isArray(o)) fail('키가 겹침');
    }
    o[kp[kp.length - 1]] = v;
  }
  function table(kp, isArray) {
    let o = root;
    for (let k = 0; k < kp.length; k++) {
      const last = k === kp.length - 1;
      if (last && isArray) {
        if (!Object.prototype.hasOwnProperty.call(o, kp[k])) o[kp[k]] = [];
        if (!Array.isArray(o[kp[k]])) fail('배열 표가 아님');
        const t = {};
        o[kp[k]].push(t);
        return t;
      }
      if (!Object.prototype.hasOwnProperty.call(o, kp[k])) o[kp[k]] = {};
      o = o[kp[k]];
      if (Array.isArray(o)) o = o[o.length - 1];
      if (typeof o !== 'object' || o === null) fail('키가 겹침');
    }
    return o;
  }
  while (i < n) {
    wsnl();
    if (i >= n) break;
    if (text[i] === '[') {
      const isArray = text[i + 1] === '[';
      i += isArray ? 2 : 1;
      const kp = keyPath();
      ws();
      if (isArray ? !text.startsWith(']]', i) : text[i] !== ']') fail('표 이름이 닫히지 않음');
      i += isArray ? 2 : 1;
      cur = table(kp, isArray);
      eol();
      continue;
    }
    const kp = keyPath();
    ws();
    if (text[i] !== '=') fail('= 가 없음');
    i++;
    setPath(cur, kp, value());
    eol();
  }
  return root;
}

/* ---------------------------------------------------------------- YAML front matter (subset) */
/** { data, body, bodyLine } — data is {} when there is no front matter. Throws only on a block it cannot read. */
function frontmatter(src) {
  const text = String(src).replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text, bodyLine: 1 };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  const scalar = (v) => {
    v = v.trim();
    if (!v) return '';
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) return v.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
    if (v[0] === '[' && v.endsWith(']')) return v.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
    if (/^(true|yes|on)$/i.test(v)) return true;
    if (/^(false|no|off)$/i.test(v)) return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v.replace(/\s+#.*$/, '');
  };
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) { if (/^\s/.test(line)) continue; throw new Error(`front matter ${k + 2}`); } // nested blocks (hooks:) are skipped
    const name = kv[1];
    const rest = kv[2];
    if (BAD_KEYS.has(name)) continue; // (never set on the object: it would reach its prototype)
    if (/^[>|][+-]?\s*$/.test(rest)) { // folded / literal block
      const out = [];
      while (k + 1 < lines.length && (/^\s+\S/.test(lines[k + 1]) || !lines[k + 1].trim())) out.push(lines[++k].trim());
      data[name] = rest[0] === '>' ? out.join(' ').replace(/\s+/g, ' ').trim() : out.join('\n').trim();
    } else if (rest.trim() === '') { // a list, or a nested block
      const list = [];
      let nested = false;
      while (k + 1 < lines.length && (/^\s+/.test(lines[k + 1]) || !lines[k + 1].trim() || /^-\s/.test(lines[k + 1]))) {
        const l = lines[++k];
        const it = /^\s*-\s+(.*)$/.exec(l);
        if (it) list.push(scalar(it[1]));
        else if (l.trim()) nested = true;
      }
      data[name] = list.length ? list : nested ? { nested: true } : '';
    } else data[name] = scalar(rest);
  }
  const bodyLine = text.slice(0, m[0].length).split('\n').length;
  return { data, body: text.slice(m[0].length), bodyLine };
}

/* ---------------------------------------------------------------- @imports */
/**
 * The @path references Claude Code follows in a CLAUDE.md: outside inline code spans and fenced code blocks, not inside
 * quotes, the path ending at whitespace (a backslash escapes a space). Returns [{ raw, path, line, col }]; the caller
 * resolves them (relative to the importing file, ~ = home) and decides which ones look like files.
 */
function imports(src) {
  const text = String(src).replace(/^﻿/, '');
  const out = [];
  const lines = text.split(/\r?\n/);
  let fence = '';
  let inComment = false;
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = ''; continue; }
    if (f) { fence = f[1]; continue; }
    // block-level HTML comments are stripped before Claude sees the file: imports inside them do nothing
    if (inComment) { const e = line.indexOf('-->'); if (e < 0) continue; line = ' '.repeat(e + 3) + line.slice(e + 3); inComment = false; }
    line = line.replace(/<!--[\s\S]*?-->/g, (s) => ' '.repeat(s.length));
    const open = line.indexOf('<!--');
    if (open >= 0) { line = line.slice(0, open); inComment = true; }
    // blank out inline code spans
    line = line.replace(/(`+)([\s\S]*?)\1/g, (s) => ' '.repeat(s.length));
    const re = /(^|[\s(\[])@((?:\\ |[^\s"'`<>()[\]])+)/g;
    let m;
    while ((m = re.exec(line))) {
      const before = line.slice(0, m.index + m[1].length);
      if ((before.match(/"/g) || []).length % 2 === 1) continue; // inside "quotes"
      let p = m[2].replace(/\\ /g, ' ');
      p = p.replace(/[.,;:!?]+$/, '');
      if (!p) continue;
      out.push({ raw: '@' + m[2], path: p, line: li + 1, col: m.index + m[1].length + 1 });
    }
  }
  return out;
}
/** Does an @reference look like a file (so that a missing one is worth a warning), rather than a mention (@claude)? */
const looksLikeFile = (p) => /[\\/]/.test(p) || /\.[A-Za-z0-9]{1,8}$/.test(p) || p.startsWith('~');

/** Text with block HTML comments removed (what Claude Code actually receives). */
function stripComments(src) {
  let fence = '';
  const out = [];
  let inComment = false;
  for (const raw of String(src).split(/\r?\n/)) {
    let line = raw;
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (!inComment && fence) { if (f && f[1][0] === fence[0]) fence = ''; out.push(line); continue; }
    if (!inComment && f) { fence = f[1]; out.push(line); continue; }
    if (inComment) { const e = line.indexOf('-->'); if (e < 0) continue; line = line.slice(e + 3); inComment = false; if (!line.trim()) continue; }
    line = line.replace(/<!--[\s\S]*?-->/g, '');
    const open = line.indexOf('<!--');
    if (open >= 0) { line = line.slice(0, open); inComment = true; if (!line.trim()) continue; }
    if (!line.trim() && raw.trim()) continue; // a line that held only a comment
    out.push(line);
  }
  return out.join('\n');
}

/* ---------------------------------------------------------------- globs */
/** A glob → RegExp over forward-slash paths: **, *, ?, {a,b}, [abc]. */
function globRe(glob, { nocase = false } = {}) {
  let g = String(glob).trim().replace(/\\/g, '/');
  let re = '';
  let depth = 0;
  for (let k = 0; k < g.length; k++) {
    const c = g[k];
    if (c === '*') {
      if (g[k + 1] === '*') {
        const slashAfter = g[k + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        k += slashAfter ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; depth++; }
    else if (c === '}' && depth) { re += ')'; depth--; }
    else if (c === ',' && depth) re += '|';
    else if (c === '[') { const j = g.indexOf(']', k + 1); if (j < 0) re += '\\['; else { re += '[' + g.slice(k + 1, j).replace(/\\/g, '\\\\') + ']'; k = j; } }
    else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', nocase ? 'i' : '');
}

/* ---------------------------------------------------------------- size */
/** A rough token count: about 3.7 ASCII characters per token, a little under one token per Hangul / CJK character. */
function tokens(text) {
  let a = 0;
  let w = 0;
  for (const ch of String(text)) { if (ch.codePointAt(0) < 128) a++; else w++; }
  return Math.round(a / 3.7 + w * 0.85);
}

/** Headings of a markdown file, for the editor's outline: [{ level, text, line, end }] (end = last line of its section). */
function sections(src) {
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let fence = '';
  lines.forEach((l, k) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && f[1][0] === fence[0]) fence = ''; return; }
    if (f) { fence = f[1]; return; }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) out.push({ level: h[1].length, text: h[2], line: k + 1 });
  });
  out.forEach((s, k) => {
    let end = lines.length;
    for (let j = k + 1; j < out.length; j++) if (out[j].level <= s.level) { end = out[j].line - 1; break; }
    s.end = end;
  });
  return out;
}

module.exports = { toml, frontmatter, imports, looksLikeFile, stripComments, globRe, tokens, sections };
