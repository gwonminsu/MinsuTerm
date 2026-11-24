#!/usr/bin/env node
// Read-only integrity check for a Claude Code auto memory directory.
//
// Usage:
//     node check_memory.mjs <memory_dir>
//
// Node port of the dreaming skill's check_memory.py: same checks, messages,
// severities, output format and exit codes. It runs on plain Node 18+ and on
// Electron started as Node (ELECTRON_RUN_AS_NODE=1), with built-in modules only.
//
// This script never writes, moves or deletes anything.
// Exit code: 0 = no errors, 1 = errors found, 2 = bad arguments / missing dir.
//
// Where JavaScript and Python differ, the helpers below reproduce Python's
// behaviour: its Unicode \s, \w and IGNORECASE, str.splitlines(), str.strip(),
// code point sorting, text-mode reading (BOM kept, universal newlines), and the
// os.path functions the original uses (Windows path rules included).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DOC = `Read-only integrity check for a Claude Code auto memory directory.

Usage:
    node check_memory.mjs <memory_dir>

This script never writes, moves or deletes anything.
Exit code: 0 = no errors, 1 = errors found, 2 = bad arguments / missing dir.
`;

const INDEX_NAME = 'MEMORY.md';
const INDEX_MAX_LINES = 200;
const INDEX_WARN_LINES = 150;
const INDEX_MAX_BYTES = 25 * 1024;

const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Python compatibility
// ---------------------------------------------------------------------------

// Python's re \s for str patterns (= str.isspace()). JS \s differs: it adds
// U+FEFF and lacks \x1c-\x1f and \x85.
const PY_WS = String.raw`\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`;
// Python's re \w for str patterns: letters, numbers and "_" in any script.
// JS \w is ASCII only, so a Korean letter would count as a word boundary there.
const PY_WORD = String.raw`\p{L}\p{N}_`;
// Characters Python's re.IGNORECASE accepts for each ASCII letter used below.
const CI = {
  a: 'aA', c: 'cC', d: 'dD', e: 'eE', i: 'iI\u0130\u0131', k: 'kK\u212a', n: 'nN',
  o: 'oO', p: 'pP', r: 'rR', s: 'sS\u017f', t: 'tT', w: 'wW', y: 'yY',
};
const ci = (word) => [...word].map((ch) => `[${CI[ch]}]`).join('');

const PY_WS_EDGES = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, 'gu');
const pyStrip = (s) => s.replace(PY_WS_EDGES, '');
const stripQuotes = (s) => s.replace(/^['"]+|['"]+$/g, '');

// str.splitlines(): no trailing empty item, and these are all line breaks.
function pySplitlines(s) {
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c || c === 0x1c || c === 0x1d
        || c === 0x1e || c === 0x85 || c === 0x2028 || c === 0x2029) {
      out.push(s.slice(start, i));
      if (c === 0x0d && s.charCodeAt(i + 1) === 0x0a) i++;
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

// Python compares strings by code point; JS sort() compares UTF-16 units.
function pyCompare(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(j);
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

// open(path, encoding="utf-8", errors="replace").read(): invalid bytes become
// U+FFFD, a BOM is kept as U+FEFF, and \r\n or \r become \n.
const DECODER = new TextDecoder('utf-8', { ignoreBOM: true });
function read(p) {
  return DECODER.decode(fs.readFileSync(p)).replace(/\r\n?/g, '\n');
}

// --- os.path ---------------------------------------------------------------

function isFileAt(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function isDirAt(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// Windows resolves a path the way GetFullPathNameW does before opening it.
// Node opens files through \\?\ paths, which skips that step, so redo it:
// "." and ".." segments, a single trailing "." on inner segments, and trailing
// dots and spaces on the last segment.
function winFullPath(...parts) {
  const full = path.win32.resolve(...parts);
  const { root } = path.win32.parse(full);
  if (full.length <= root.length) return full;
  const segs = full.slice(root.length).split('\\');
  const last = segs.length - 1;
  for (let k = 0; k < last; k++) {
    if (/[^.]\.$/.test(segs[k])) segs[k] = segs[k].slice(0, -1);
  }
  segs[last] = segs[last].replace(/[. ]+$/, '');
  return root + segs.join('\\');
}

function ntSplitdrive(p) {
  if (p.length >= 2) {
    const normp = p.replace(/\//g, '\\');
    if (normp.slice(0, 2) === '\\\\') {
      const start = normp.slice(0, 8).toUpperCase() === '\\\\?\\UNC\\' ? 8 : 2;
      const index = normp.indexOf('\\', start);
      if (index === -1) return [p, ''];
      const index2 = normp.indexOf('\\', index + 1);
      if (index2 === -1) return [p, ''];
      return [p.slice(0, index2), p.slice(index2)];
    }
    if (normp[1] === ':') return [p.slice(0, 2), p.slice(2)];
  }
  return ['', p];
}

function ntNormpath(p) {
  let [prefix, rest] = ntSplitdrive(p.replace(/\//g, '\\'));
  if (rest.startsWith('\\')) {
    prefix += '\\';
    rest = rest.replace(/^\\+/, '');
  }
  const comps = rest.split('\\');
  // Like CPython's C normpath, keep a "." right after a bare drive ("C:.").
  const bareDrive = prefix !== '' && !prefix.endsWith('\\');
  let i = 0;
  while (i < comps.length) {
    if (!comps[i] || (comps[i] === '.' && !(i === 0 && bareDrive))) {
      comps.splice(i, 1);
    } else if (comps[i] === '..') {
      if (i > 0 && comps[i - 1] !== '..') {
        comps.splice(i - 1, 2);
        i -= 1;
      } else if (i === 0 && prefix.endsWith('\\')) {
        comps.splice(i, 1);
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  if (!prefix && !comps.length) comps.push('.');
  return prefix + comps.join('\\');
}

function posixNormpath(p) {
  if (p === '') return '.';
  let initial = p.startsWith('/') ? 1 : 0;
  if (initial && p.startsWith('//') && !p.startsWith('///')) initial = 2;
  const out = [];
  for (const comp of p.split('/')) {
    if (comp === '' || comp === '.') continue;
    if (comp !== '..' || (!initial && !out.length) || (out.length && out[out.length - 1] === '..')) {
      out.push(comp);
    } else if (out.length) {
      out.pop();
    }
  }
  const joined = '/'.repeat(initial) + out.join('/');
  return joined || '.';
}

function posixJoin(a, b) {
  if (b.startsWith('/')) return b;
  if (!a || a.endsWith('/')) return a + b;
  return `${a}/${b}`;
}

const normpath = (p) => (IS_WIN ? ntNormpath(p) : posixNormpath(p));

function expanduser(p) {
  if (!p.startsWith('~')) return p;
  const isSep = (ch) => ch === '/' || (IS_WIN && ch === '\\');
  let i = 1;
  while (i < p.length && !isSep(p[i])) i++;
  const env = process.env;
  if (IS_WIN) {
    let home;
    if (env.USERPROFILE !== undefined) home = env.USERPROFILE;
    else if (env.HOMEPATH === undefined) return p;
    else home = path.win32.join(env.HOMEDRIVE || '', env.HOMEPATH);
    if (i !== 1) {
      const target = p.slice(1, i);
      const current = env.USERNAME;
      if (target !== current) {
        if (current !== path.win32.basename(home)) return p;
        home = path.win32.join(path.win32.dirname(home), target);
      }
    }
    return home + p.slice(i);
  }
  let home;
  if (i === 1) {
    if (env.HOME !== undefined) home = env.HOME;
    else {
      try { home = os.userInfo().homedir; } catch { return p; }
    }
  } else {
    // Python asks the password database for any user; Node can only answer
    // for the current one, so other users' "~name" stays unexpanded.
    let info;
    try { info = os.userInfo(); } catch { return p; }
    if (p.slice(1, i) !== info.username) return p;
    home = info.homedir;
  }
  home = home.replace(/\/+$/, '');
  return home + p.slice(i) || '/';
}

function abspath(p) {
  if (IS_WIN) {
    const n = ntNormpath(p);
    return n.startsWith('\\\\?\\') ? n : winFullPath(n);
  }
  return posixNormpath(p.startsWith('/') ? p : posixJoin(process.cwd(), p));
}

// os.path.isfile(os.path.join(root, target))
function linkedFileExists(root, target) {
  if (!IS_WIN) return isFileAt(posixJoin(root, target));
  if (/[\\/]$/.test(target)) return false;
  const full = winFullPath(root, target);
  return !full.endsWith('\\') && isFileAt(full);
}

// os.walk(root) with dot-directories pruned; returns sorted relative paths of
// *.md files using "/" separators. Unreadable directories are skipped, and
// symlinked directories are listed but not entered, as os.walk does.
function listMarkdown(root) {
  const found = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        isDir = isDirAt(path.join(dir, e.name));
        if (isDir) continue;
      }
      if (isDir) {
        if (!e.name.startsWith('.')) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else if (e.name.toLowerCase().endsWith('.md')) {
        found.push((rel ? `${rel}/${e.name}` : e.name).replace(/\\/g, '/'));
      }
    }
  };
  walk(root, '');
  return found.sort(pyCompare);
}

// ---------------------------------------------------------------------------
// Checks (same order and wording as check_memory.py)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_\-]{20,}/, 'API key (sk-...)'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],
  [/xox[abprs]-[A-Za-z0-9\-]{10,}/, 'Slack token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  // (?i)\b(password|passwd|api[_-]?key|secret|access[_-]?token)\b\s*[:=]\s*['"]?[^\s'"]{6,}
  [new RegExp(
    `(?<![${PY_WORD}])(?:${ci('password')}|${ci('passwd')}|${ci('api')}[_-]?${ci('key')}`
    + `|${ci('secret')}|${ci('access')}[_-]?${ci('token')})(?![${PY_WORD}])`
    + `[${PY_WS}]*[:=][${PY_WS}]*['"]?[^${PY_WS}'"]{6,}`, 'u'), 'credential assignment'],
];
const MD_LINK_RE = new RegExp(String.raw`\[([^\]]*)\]\(([^)${PY_WS}]+)\)`, 'gu');
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const FM_RE = /^---\r?\n(.*?)\r?\n---\r?\n?/s;
const FM_KEY_RE = new RegExp(String.raw`^[${PY_WS}]*([A-Za-z_][${PY_WORD}-]*)[${PY_WS}]*:[${PY_WS}]*(.*)$`, 'u');

// A flat map of the keys found in the frontmatter, or null if there is none.
// Nested keys such as metadata.type are picked up by name; the first one wins.
function parseFrontmatter(text) {
  const m = FM_RE.exec(text);
  if (!m) return null;
  const fields = new Map();
  for (const line of pySplitlines(m[1])) {
    const km = FM_KEY_RE.exec(line);
    if (km && !fields.has(km[1])) fields.set(km[1], stripQuotes(pyStrip(km[2])));
  }
  return fields;
}

function pushTo(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function main(argv) {
  const out = [];
  if (argv.length !== 1) {
    out.push(DOC);
    return [2, out];
  }
  const root = abspath(expanduser(argv[0]));
  if (!isDirAt(root)) {
    out.push(`[ERROR] memory directory not found: ${root}`);
    return [2, out];
  }

  const errors = [];
  const warnings = [];
  const infos = [];

  const mdFiles = listMarkdown(root);
  const memoryFiles = mdFiles.filter((f) => f !== INDEX_NAME);

  // --- index checks ---
  const indexPath = path.join(root, INDEX_NAME);
  const indexed = new Set();
  if (!isFileAt(indexPath)) {
    if (memoryFiles.length) {
      errors.push(`${INDEX_NAME} is missing but ${memoryFiles.length} memory file(s) exist`);
    } else {
      infos.push(`empty memory directory (no ${INDEX_NAME}, no memory files)`);
    }
  } else {
    const indexText = read(indexPath);
    const nLines = pySplitlines(indexText).length;
    const nBytes = Buffer.byteLength(indexText, 'utf8');
    if (nLines > INDEX_MAX_LINES || nBytes > INDEX_MAX_BYTES) {
      errors.push(`${INDEX_NAME} is ${nLines} lines / ${nBytes} bytes; only the first `
        + `${INDEX_MAX_LINES} lines or ${INDEX_MAX_BYTES} bytes load at session start`);
    } else if (nLines > INDEX_WARN_LINES) {
      warnings.push(`${INDEX_NAME} has ${nLines} lines (consolidate before it reaches ${INDEX_MAX_LINES})`);
    }
    infos.push(`${INDEX_NAME}: ${nLines} lines, ${nBytes} bytes`);
    for (const m of indexText.matchAll(MD_LINK_RE)) {
      const target = m[2];
      if (/^[a-z]+:\/\//.test(target) || target.startsWith('#')) continue;
      const targetClean = target.split('#')[0].replace(/\\/g, '/');
      indexed.add(normpath(targetClean).replace(/\\/g, '/'));
      if (!linkedFileExists(root, targetClean)) {
        errors.push(`${INDEX_NAME} links to a missing file: ${target}`);
      }
    }
  }

  for (const f of memoryFiles) {
    if (!indexed.has(f)) warnings.push(`not listed in ${INDEX_NAME}: ${f}`);
  }

  // --- per-file checks ---
  const names = new Map();
  const descriptions = new Map();
  const wikiTargets = [];
  for (const f of mdFiles) {
    const text = read(path.join(root, f));
    pySplitlines(text).forEach((line, idx) => {
      for (const [pattern, label] of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          errors.push(`possible secret (${label}) in ${f}:${idx + 1} (value not shown)`);
        }
      }
    });
    if (f === INDEX_NAME) continue;
    const fm = parseFrontmatter(text);
    if (fm === null) {
      warnings.push(`no frontmatter: ${f}`);
      continue;
    }
    const name = fm.get('name');
    if (!name) warnings.push(`frontmatter has no 'name': ${f}`);
    else pushTo(names, name, f);
    const desc = fm.get('description');
    if (!desc) warnings.push(`frontmatter has no 'description': ${f}`);
    else pushTo(descriptions, desc.toLowerCase(), f);
    if (!fm.get('type')) warnings.push(`frontmatter has no 'type' (metadata.type): ${f}`);
    for (const m of text.matchAll(WIKI_LINK_RE)) wikiTargets.push([f, pyStrip(m[1])]);
  }

  for (const [name, files] of names) {
    if (files.length > 1) errors.push(`duplicate memory name '${name}': ${files.join(', ')}`);
  }
  for (const files of descriptions.values()) {
    if (files.length > 1) warnings.push(`identical description (possible duplicate): ${files.join(', ')}`);
  }
  const unresolved = [...new Set(wikiTargets.map(([, t]) => t).filter((t) => !names.has(t)))].sort(pyCompare);
  if (unresolved.length) {
    infos.push('[[links]] without a memory yet (allowed, may be worth writing later): '
      + unresolved.join(', '));
  }

  // --- report ---
  out.push(`Memory directory: ${root}`);
  out.push(`Files: ${memoryFiles.length} memory file(s) + ${isFileAt(indexPath) ? '1 index' : 'no index'}`);
  for (const [label, items] of [['ERROR', errors], ['WARN', warnings], ['INFO', infos]]) {
    for (const item of items) out.push(`[${label}] ${item}`);
  }
  out.push(`Result: ${errors.length ? 'FAIL' : 'PASS'} (${errors.length} error(s), ${warnings.length} warning(s))`);
  return [errors.length ? 1 : 0, out];
}

const [code, lines] = main(process.argv.slice(2));
// Python's print() ends lines with os.linesep on Windows (\r\n); do the same.
process.stdout.write(lines.map((l) => `${l}\n`).join('').replace(/\n/g, os.EOL));
// Let stdout drain before exiting instead of calling process.exit().
process.exitCode = code;
