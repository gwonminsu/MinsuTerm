'use strict';
/*
 * 하네스 보기: what shapes the agents in a folder, read the way Claude Code and Codex read it.
 *
 *  - scan({ project, at }): for the folder `at` (inside the sidebar folder `project`)
 *      claude / codex: the instruction files each agent loads, in order (with @imports, the ones loaded on demand,
 *                      the ones it skips and why, and Codex's project_doc_max_bytes budget)
 *      tree:           the folders under `project` that hold instruction files or agent settings
 *      tools:          skills, MCP servers, hooks and plugins per agent (read only; secrets never leave this module)
 *      checks:         what is worth fixing (too long, cut off, broken import, the two files disagreeing …)
 *  - read / write / history / snapshot: the instruction files only, a snapshot before every write
 *  - watch: tell the page when any of those files changes
 *
 * The rules follow the agents' documentation (2026-11: code.claude.com/docs/en/memory, …/skills, …/mcp, …/hooks,
 * …/settings; learn.chatgpt.com/docs agents-md, config, skills, mcp, hooks). Where the documentation does not say,
 * the result carries `unsure` and the page says so instead of guessing.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const P = require('./harness-parse');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const MAX_READ = 4 * 1024 * 1024; // Claude Code skips an instruction file over 4 MiB
const MAX_WRITE = 1024 * 1024;
const MAX_IMPORT_DEPTH = 4;
const LONG_LINES = 200;
const HISTORY_KEEP = 50;
const MODES = ['claude-md-or-agents-md', 'claude-md-and-agents-md', 'claude-md', 'managed-only'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', '.nuxt',
  '.cache', 'coverage', '.gradle', '.idea', '.vs', '.vscode', 'bin', 'obj', 'Pods', 'DerivedData', '.turbo', '.svelte-kit', 'progress']);
const DOT_DIRS = new Set(['.claude', '.codex', '.agents', '.github']);
const INSTRUCTION_NAMES = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'AGENTS.override.md']);

/* ------------------------------------------------------------------ where things live */
const CFG = {};
function configure(o = {}) {
  const home = o.home || os.homedir();
  Object.assign(CFG, {
    home,
    claudeDir: o.claudeDir || process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
    codexHome: o.codexHome || process.env.CODEX_HOME || path.join(home, '.codex'),
    agentsHome: o.agentsHome || path.join(home, '.agents'),
    managedDir: o.managedDir || (IS_WIN ? 'C:\\Program Files\\ClaudeCode' : IS_MAC ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code'),
    codexAdminDir: o.codexAdminDir || (IS_WIN ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'OpenAI', 'Codex') : '/etc/codex'),
    historyDir: o.historyDir || path.join(os.tmpdir(), 'minsuterm-harness-history'),
    // tests only: the walk up from a folder stops here (a made-up home must not reach the real one above it)
    top: o.top ? path.resolve(o.top) : '',
  });
  // ~/.claude.json moves with CLAUDE_CONFIG_DIR (into that folder)
  CFG.claudeJson = o.claudeJson || (process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(home, '.claude.json'));
  return CFG;
}
configure();

/* ------------------------------------------------------------------ small helpers */
const normP = (p) => { let r = path.resolve(String(p || '')); if (r.length > 3) r = r.replace(/[\\/]+$/, ''); return r; };
const keyP = (p) => (IS_WIN || IS_MAC ? normP(p).toLowerCase() : normP(p));
const same = (a, b) => keyP(a) === keyP(b);
const inside = (child, parent) => { const c = keyP(child); const p = keyP(parent); return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep); };
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const firstLine = (s, n = 140) => { const l = String(s || '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || ''; return l.length > n ? l.slice(0, n - 1) + '…' : l; };
async function statOf(p) { try { return await fsp.stat(p); } catch { return null; } }
async function isFile(p) { const s = await statOf(p); return !!(s && s.isFile()); }
async function isDir(p) { const s = await statOf(p); return !!(s && s.isDirectory()); }
async function listDir(p) { try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; } }
/** A text file: { text, bytes, mtimeMs, bom, crlf } or null; { tooBig } past the limit. */
async function readText(p, max = MAX_READ) {
  const st = await statOf(p);
  if (!st || !st.isFile()) return null;
  if (st.size > max) return { tooBig: true, bytes: st.size, mtimeMs: st.mtimeMs, text: '' };
  let buf;
  try { buf = await fsp.readFile(p); } catch { return null; }
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  // UTF-16 (PowerShell 5.1's `>` writes it) is read as such; bytes that are not UTF-8 are shown as best they can be.
  // Either way enc says so, and such a file is never written (its words would be lost)
  let text;
  let enc = 'utf8';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) { text = buf.subarray(2).toString('utf16le'); enc = 'utf16le'; }
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.subarray(2)); b.swap16?.(); text = b.toString('utf16le'); enc = 'utf16be'; }
  else {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = buf.toString('utf8'); enc = 'other'; }
    text = text.replace(/^\uFEFF/, '');
  }
  return { text, bytes: buf.length, mtimeMs: st.mtimeMs, bom, enc, crlf: /\r\n/.test(text) };
}
/** A JSON error as a place in the file only (the message V8 makes quotes the text around it, which may be a secret). */
function jsonWhere(e, text) {
  const m = /line (\d+) column (\d+)/.exec(e.message) || null;
  if (m) return `JSON ${m[1]}:${m[2]}`;
  const at = /position (\d+)/.exec(e.message);
  if (at) { const before = text.slice(0, Number(at[1])); return `JSON ${before.split('\n').length}:${before.length - before.lastIndexOf('\n')}`; }
  return 'JSON';
}
async function readJson(p) {
  const r = await readText(p, 32 * 1024 * 1024);
  if (!r || r.tooBig) return r ? { error: '너무 커요' } : null;
  try { return { data: JSON.parse(r.text) }; } catch (e) { return { error: jsonWhere(e, r.text) }; }
}
async function readToml(p) {
  const r = await readText(p, 4 * 1024 * 1024);
  if (!r || r.tooBig) return r ? { error: '너무 커요' } : null;
  try { return { data: P.toml(r.text) }; } catch (e) { return { error: e.message.slice(0, 120) }; }
}
/** The folders from the filesystem root down to dir. */
function chainTo(dir) {
  const out = [];
  let d = normP(dir);
  const top = CFG.top && inside(d, CFG.top) ? keyP(CFG.top) : '';
  for (;;) { out.unshift(d); if (top && keyP(d) === top) break; const up = path.dirname(d); if (up === d) break; d = up; }
  return out;
}
/** The nearest folder at or above dir holding one of the markers (a .git folder or file by default). */
async function rootBy(dir, markers = ['.git']) {
  if (!markers.length) return normP(dir);
  for (const d of chainTo(dir).reverse()) {
    for (const m of markers) if (await statOf(path.join(d, m))) return d;
  }
  return null;
}
const lineCount = (t) => (t ? t.split(/\r?\n/).length - (/\r?\n$/.test(t) ? 1 : 0) : 0);

/* ------------------------------------------------------------------ secrets */
const SECRET_RES = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, /\bgh[pousr]_[A-Za-z0-9]{20,}/g, /\bgithub_pat_[A-Za-z0-9_]{20,}/g, /\bxox[abpr]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g, /\bAIza[0-9A-Za-z_-]{30,}/g, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/g,
];
// (quotes and backticks built with fromCharCode: one inside a regex literal trips the i18n extractor)
const QUOTES = String.fromCharCode(34, 39, 96);
const FENCE3 = String.fromCharCode(96).repeat(3);
const SECRET_ASSIGN = new RegExp('(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret|auth)[A-Za-z0-9_]*)\\s*[:=]\\s*[' + QUOTES + ']?([^\\s' + QUOTES + ']{8,})', 'gi');
/** Lines of an instruction file that look like they hold a secret (the values themselves are never returned). */
function secretLines(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((l, k) => {
    if (SECRET_RES.some((re) => { re.lastIndex = 0; return re.test(l); })) { out.push(k + 1); return; }
    SECRET_ASSIGN.lastIndex = 0;
    const m = SECRET_ASSIGN.exec(l);
    if (m && !/^[<{$%]|^(x+|\*+|\.+|your|example|changeme|placeholder)/i.test(m[2]) && /[0-9]/.test(m[2]) && /[A-Za-z]/.test(m[2])) out.push(k + 1);
  });
  return out;
}
/** A command line as it may be shown: token-like parts masked, the middle cut when long. */
function maskCommand(cmd, max = 96) {
  let s = String(cmd || '').replace(/\s+/g, ' ').trim();
  for (const re of SECRET_RES) s = s.replace(re, '••••');
  s = s.replace(SECRET_ASSIGN, (m0, k) => `${k}=••••`);
  s = s.replace(/(--?(?:token|key|secret|password|api[-_]?key|auth)[=\s]+)\S+/gi, '$1••••');
  s = s.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ••••');
  s = s.replace(/\b(https?:\/\/[^\s/?#'"]+)[/?#][^\s'"]*/gi, '$1/••••'); // (a webhook's secret is in its path)
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, '••••').replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '••••');
  if (s.length > max) s = s.slice(0, Math.ceil(max * 0.6)) + ' … ' + s.slice(-Math.floor(max * 0.35));
  return s;
}
const hostOf = (u) => { try { return new URL(String(u)).host; } catch { return ''; } };

/* ------------------------------------------------------------------ one instruction file */
/** Paths never opened: network ones (on Windows opening one signs in to that server) and agents' credentials. */
const CREDENTIALS = new Set(['.credentials.json', 'auth.json', 'credentials.json']);
function offLimits(p) {
  const s = String(p || '');
  if (/^(\\\\|\/\/)/.test(s)) return true; // \\server\share, //server/share, \\?\ and \\.\ device paths
  if (CREDENTIALS.has(path.basename(s).toLowerCase())) return true;
  return false;
}
async function fileFacts(p) {
  if (offLimits(p)) return null;
  const r = await readText(p);
  if (!r) return null;
  if (r.tooBig) return { path: p, bytes: r.bytes, lines: 0, tokens: 0, tooBig: true, mtimeMs: r.mtimeMs, text: '' };
  const visible = P.stripComments(r.text);
  return {
    path: p, name: path.basename(p), bytes: r.bytes, lines: lineCount(r.text), tokens: P.tokens(visible),
    visibleBytes: Buffer.byteLength(visible), mtimeMs: r.mtimeMs, hash: sha(r.text), text: r.text,
  };
}
const pub = (f) => { const o = { ...f }; delete o.text; return o; };

/* ------------------------------------------------------------------ settings (Claude) */
/** The settings layers that apply in `at`, with only the keys this view needs. */
async function claudeSettings(at, gitRoot) {
  const layers = [];
  const add = async (scope, p) => {
    const j = await readJson(p);
    if (!j) return;
    layers.push({ scope, path: p, error: j.error || '', data: j.data && typeof j.data === 'object' ? j.data : {} });
  };
  await add('managed', path.join(CFG.managedDir, 'managed-settings.json'));
  for (const e of (await listDir(path.join(CFG.managedDir, 'managed-settings.d'))).filter((x) => x.isFile() && x.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    await add('managed', path.join(CFG.managedDir, 'managed-settings.d', e.name));
  }
  await add('user', path.join(CFG.claudeDir, 'settings.json'));
  await add('project', path.join(at, '.claude', 'settings.json'));
  const localAt = IS_WIN ? at : gitRoot || at; // the docs: next to settings.json on Windows, at the repository root elsewhere
  await add('local', path.join(localAt, '.claude', 'settings.local.json'));
  // precedence for single values: managed > local > project > user
  const rank = { managed: 4, local: 3, project: 2, user: 1 };
  const ordered = layers.slice().sort((a, b) => rank[a.scope] - rank[b.scope]); // low → high, later wins
  const merged = { claudeMdExcludes: [], enabledPlugins: {}, pluginFrom: {}, skillOverrides: {}, enabledMcpjsonServers: [], disabledMcpjsonServers: [] };
  for (const l of ordered) {
    const d = l.data;
    for (const [k, v] of Object.entries(d)) if (typeof v === 'string' && MODES.includes(v) && /instruction/i.test(k)) merged.mode = v;
    if (Array.isArray(d.claudeMdExcludes)) merged.claudeMdExcludes.push(...d.claudeMdExcludes.filter((x) => typeof x === 'string'));
    if (d.enabledPlugins && typeof d.enabledPlugins === 'object') { Object.assign(merged.enabledPlugins, d.enabledPlugins); for (const k of Object.keys(d.enabledPlugins)) merged.pluginFrom[k] = l.scope; }
    if (d.skillOverrides && typeof d.skillOverrides === 'object') Object.assign(merged.skillOverrides, d.skillOverrides);
    if (Array.isArray(d.enabledMcpjsonServers)) merged.enabledMcpjsonServers.push(...d.enabledMcpjsonServers);
    if (Array.isArray(d.disabledMcpjsonServers)) merged.disabledMcpjsonServers.push(...d.disabledMcpjsonServers);
    if (typeof d.enableAllProjectMcpServers === 'boolean') merged.enableAllProjectMcpServers = d.enableAllProjectMcpServers;
    if (typeof d.disableAllHooks === 'boolean') merged.disableAllHooks = d.disableAllHooks;
  }
  merged.allowManagedHooksOnly = layers.some((l) => l.scope === 'managed' && l.data.allowManagedHooksOnly === true);
  return { layers, merged };
}

/* ------------------------------------------------------------------ Claude Code's instruction files */
async function rulesIn(dir) { // .claude/rules/**/*.md
  const out = [];
  const walk = async (d, depth) => {
    if (depth > 6) return;
    for (const e of await listDir(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  };
  await walk(dir, 0);
  return out.sort();
}
function rulePaths(text) {
  try {
    const v = P.frontmatter(text).data.paths;
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean);
  } catch { /* unreadable YAML: the rule loads as if it had no paths */ }
  return [];
}

async function scanClaude(at, ctx) {
  const { settings, tree } = ctx;
  const mode = settings.merged.mode || 'claude-md-or-agents-md';
  const excludes = settings.merged.claudeMdExcludes.map((g) => { try { return P.globRe(g, { nocase: IS_WIN || IS_MAC }); } catch { return null; } }).filter(Boolean);
  const layers = [];
  const seen = new Map(); // keyP(path) -> layer
  let n = 0;
  const push = (facts, o) => {
    const l = { id: 'c' + (++n), agent: 'claude', ...pub(facts), ...o };
    layers.push(l);
    if (l.state !== 'ignored') seen.set(keyP(facts.path), l);
    return l;
  };
  const excluded = (p) => excludes.some((re) => re.test(normP(p).replace(/\\/g, '/')));
  const userFile = path.join(CFG.claudeDir, 'CLAUDE.md');

  const managed = await fileFacts(path.join(CFG.managedDir, 'CLAUDE.md'));
  if (managed) push(managed, { scope: 'managed', folder: CFG.managedDir, state: 'loaded', readonly: true });
  const onlyManaged = mode === 'managed-only';
  const base = { folder: '', state: 'loaded' };
  const gated = (o) => (onlyManaged ? { ...o, state: 'ignored', why: 'Claude Code 설정이 관리 정책 파일만 읽게 되어 있어요' } : o);

  const user = await fileFacts(userFile);
  if (user) push(user, gated({ ...base, scope: 'user', folder: CFG.claudeDir }));
  for (const r of await rulesIn(path.join(CFG.claudeDir, 'rules'))) {
    const f = await fileFacts(r);
    if (!f) continue;
    const paths = rulePaths(f.text);
    push(f, gated({ scope: 'userRule', folder: CFG.claudeDir, paths, state: paths.length ? 'lazy' : 'loaded', why: paths.length ? '이 경로의 파일을 다룰 때만 읽어요' : '' }));
  }

  const dirs = chainTo(at);
  const claudeIn = async (d) => {
    const out = [];
    for (const rel of ['CLAUDE.md', path.join('.claude', 'CLAUDE.md'), 'CLAUDE.local.md']) {
      const p = path.join(d, rel);
      if (!same(p, userFile) && await isFile(p)) out.push(p);
    }
    return out;
  };
  let hasClaudeFamily = false;
  const perDir = [];
  for (const d of dirs) { const c = await claudeIn(d); perDir.push(c); if (c.length) hasClaudeFamily = true; }

  const agentsLater = [];
  for (let k = 0; k < dirs.length; k++) {
    const d = dirs[k];
    const scopeOf = (p) => (path.basename(p) === 'CLAUDE.local.md' ? 'local' : same(d, at) ? 'cwd' : 'ancestor');
    for (const p of perDir[k]) {
      const f = await fileFacts(p);
      if (!f) continue;
      if (excluded(p)) push(f, { scope: scopeOf(p), folder: d, state: 'ignored', why: 'claudeMdExcludes 설정으로 빠져요' });
      else push(f, gated({ scope: scopeOf(p), folder: d, state: 'loaded' }));
    }
    for (const rel of ['AGENTS.md', path.join('.claude', 'AGENTS.md')]) {
      const p = path.join(d, rel);
      if (!await isFile(p)) continue;
      agentsLater.push({ p, d, k });
    }
  }
  // the project's rules (the folder the session starts in); a parent folder's rules are not documented either way
  for (const d of dirs) {
    if (same(path.join(d, '.claude'), CFG.claudeDir)) continue;
    const own = same(d, at);
    for (const r of await rulesIn(path.join(d, '.claude', 'rules'))) {
      const f = await fileFacts(r);
      if (!f) continue;
      const paths = rulePaths(f.text);
      const o = { scope: 'rule', folder: d, paths, state: paths.length ? 'lazy' : 'loaded', why: paths.length ? '이 경로의 파일을 다룰 때만 읽어요' : '' };
      if (!own) Object.assign(o, { unsure: true, unsureWhy: '상위 폴더의 .claude/rules를 읽는지는 공식 문서에 없어요' });
      push(f, excluded(r) ? { ...o, state: 'ignored', why: 'claudeMdExcludes 설정으로 빠져요' } : gated(o));
    }
  }

  // @imports of everything loaded so far (depth-first, at most four hops)
  const broken = [];
  const follow = async (parent, depth) => {
    if (!parent.text && parent.text !== '') return;
    for (const im of P.imports(parent.text)) {
      const p = im.path.startsWith('~') ? path.join(CFG.home, im.path.slice(1)) : path.resolve(path.dirname(parent.path), im.path);
      if (offLimits(p)) { broken.push({ from: parent.path, line: im.line, target: im.path, blocked: true }); continue; }
      const userScope = inside(parent.path, CFG.claudeDir);
      const external = !userScope && !inside(p, at) && !inside(p, ctx.project);
      if (seen.has(keyP(p))) { const t = seen.get(keyP(p)); (parent.links = parent.links || []).push(t.id); continue; }
      const f = await fileFacts(p);
      if (!f) { if (P.looksLikeFile(im.path)) broken.push({ from: parent.path, line: im.line, target: im.path }); continue; }
      if (depth > MAX_IMPORT_DEPTH) { broken.push({ from: parent.path, line: im.line, target: im.path, deep: true }); continue; }
      const l = push(f, {
        scope: 'import', folder: path.dirname(p), via: parent.id, depth, line: im.line,
        state: parent.state === 'ignored' ? 'ignored' : parent.state, why: parent.state === 'ignored' ? parent.why : '',
        external, externalWhy: external ? '프로젝트 밖의 파일이라 Claude Code가 처음 한 번 승인을 물어요' : '',
      });
      l.text = f.text;
      await follow(l, depth + 1);
      delete l.text;
    }
  };
  for (const l of layers.slice()) {
    if (l.state === 'ignored') continue;
    const f = await readText(l.path);
    if (!f || f.tooBig) continue;
    l.text = f.text;
    await follow(l, 1);
    delete l.text;
  }

  // AGENTS.md: read natively since Claude Code 2.1.277, depending on the "Project instructions" setting
  for (const { p, d } of agentsLater) {
    const f = await fileFacts(p);
    if (!f) continue;
    const scope = same(d, at) ? 'cwd' : 'ancestor';
    const viaImport = seen.get(keyP(p));
    if (viaImport) continue; // already loaded through an @import (and-mode skips it too)
    if (mode === 'claude-md' || onlyManaged) push(f, { scope, folder: d, state: 'ignored', why: 'Claude Code 설정이 CLAUDE.md만 읽게 되어 있어요' });
    else if (mode === 'claude-md-or-agents-md' && hasClaudeFamily) push(f, { scope, folder: d, state: 'ignored', why: 'CLAUDE.md가 있으면 AGENTS.md는 읽지 않아요 (기본 설정)' });
    else if (excluded(p)) push(f, { scope, folder: d, state: 'ignored', why: 'claudeMdExcludes 설정으로 빠져요' });
    else push(f, { scope, folder: d, state: 'loaded', agentsMd: true });
  }
  for (const l of layers.filter((x) => x.agentsMd && x.state === 'loaded')) { // their imports too
    const f = await readText(l.path);
    if (!f || f.tooBig) continue;
    l.text = f.text;
    await follow(l, 1);
    delete l.text;
  }

  // below the folder: loaded the first time Claude works on a file there
  for (const t of tree.folders) {
    if (same(t.path, at) || !inside(t.path, at)) continue;
    const files = [];
    for (const rel of ['CLAUDE.md', path.join('.claude', 'CLAUDE.md'), 'CLAUDE.local.md']) if (t.has[rel.replace(/\\/g, '/')]) files.push(path.join(t.path, rel));
    for (const p of files) {
      const f = await fileFacts(p);
      if (f) push(f, excluded(p) ? { scope: 'sub', folder: t.path, state: 'ignored', why: 'claudeMdExcludes 설정으로 빠져요' } : gated({ scope: 'sub', folder: t.path, state: 'lazy', why: '이 폴더의 파일을 다룰 때 읽어요' }));
    }
    if (!files.length && t.has['AGENTS.md'] && !['claude-md', 'managed-only'].includes(mode)) {
      const f = await fileFacts(path.join(t.path, 'AGENTS.md'));
      if (f) push(f, { scope: 'sub', folder: t.path, state: 'lazy', why: '이 폴더의 파일을 읽을 때 읽어요 (그 폴더에 CLAUDE.md가 없어서)', agentsMd: true });
    }
    for (const r of t.rules || []) {
      const f = await fileFacts(r);
      if (f) push(f, { scope: 'sub', folder: t.path, state: 'lazy', paths: rulePaths(f.text), why: '이 폴더의 파일을 다룰 때 읽어요' });
    }
  }

  const atStart = layers.filter((l) => l.state === 'loaded');
  return {
    mode, modeSet: !!settings.merged.mode, layers, broken,
    total: { bytes: atStart.reduce((s, l) => s + (l.visibleBytes ?? l.bytes), 0), tokens: atStart.reduce((s, l) => s + (l.tokens || 0), 0), files: atStart.length },
  };
}

/* ------------------------------------------------------------------ Codex's instruction files */
async function codexConfig() {
  const r = await readToml(path.join(CFG.codexHome, 'config.toml'));
  const d = (r && r.data) || {};
  return {
    path: path.join(CFG.codexHome, 'config.toml'), error: (r && r.error) || '', data: d,
    maxBytes: Number.isFinite(d.project_doc_max_bytes) ? d.project_doc_max_bytes : 32768,
    fallbacks: Array.isArray(d.project_doc_fallback_filenames) ? d.project_doc_fallback_filenames.filter((x) => typeof x === 'string' && !/[\\/]/.test(x)) : [],
    markers: Array.isArray(d.project_root_markers) ? d.project_root_markers.filter((x) => typeof x === 'string') : ['.git'],
    hooksOff: d.features && (d.features.hooks === false || d.features.codex_hooks === false),
  };
}
function codexTrust(cfg, dirs) {
  const projects = cfg.data.projects && typeof cfg.data.projects === 'object' ? cfg.data.projects : {};
  const want = dirs.map(keyP);
  let best = null;
  for (const [k, v] of Object.entries(projects)) {
    const kk = keyP(k.replace(/^\\\\\?\\/, ''));
    const at = want.indexOf(kk);
    if (at >= 0 && v && typeof v.trust_level === 'string' && (!best || at > best.at)) best = { at, level: v.trust_level, path: k };
  }
  return best ? best.level : null;
}

async function scanCodex(at, ctx) {
  const cfg = ctx.codexCfg;
  const layers = [];
  let n = 0;
  const push = (facts, o) => { const l = { id: 'x' + (++n), agent: 'codex', ...pub(facts), ...o }; layers.push(l); return l; };

  // global: the first non-empty of AGENTS.override.md, AGENTS.md
  const gOver = await fileFacts(path.join(CFG.codexHome, 'AGENTS.override.md'));
  const gMain = await fileFacts(path.join(CFG.codexHome, 'AGENTS.md'));
  let global = null;
  if (gOver && gOver.text.trim()) {
    global = push(gOver, { scope: 'global', folder: CFG.codexHome, state: 'loaded' });
    if (gMain) push(gMain, { scope: 'global', folder: CFG.codexHome, state: 'ignored', why: 'AGENTS.override.md가 있어서 안 읽어요' });
  } else {
    if (gOver) push(gOver, { scope: 'global', folder: CFG.codexHome, state: 'ignored', why: '비어 있어서 건너뛰어요' });
    if (gMain && gMain.text.trim()) global = push(gMain, { scope: 'global', folder: CFG.codexHome, state: 'loaded' });
    else if (gMain) push(gMain, { scope: 'global', folder: CFG.codexHome, state: 'ignored', why: '비어 있어서 건너뛰어요' });
  }

  const root = await rootBy(at, cfg.markers);
  const dirs = root ? chainTo(at).filter((d) => inside(d, root)) : [normP(at)];
  const trust = codexTrust(cfg, chainTo(at));
  const untrusted = trust === 'untrusted';
  const names = ['AGENTS.override.md', 'AGENTS.md', ...cfg.fallbacks];
  let used = 0;
  let over = false;
  for (const d of dirs) {
    const here = [];
    for (const nm of names) { const p = path.join(d, nm); if (await isFile(p)) here.push(p); }
    if (!here.length) continue;
    const scope = same(d, at) ? 'cwd' : 'chain';
    const f0 = await fileFacts(here[0]);
    const rest = here.slice(1);
    if (!f0) continue;
    if (untrusted) {
      push(f0, { scope, folder: d, state: 'ignored', why: 'Codex가 이 프로젝트를 신뢰하지 않아 프로젝트 지침을 읽지 않아요' });
      continue;
    }
    if (!f0.text.trim()) { // the first file that exists decides the folder; an empty one gives nothing
      push(f0, { scope, folder: d, state: 'ignored', why: '비어 있어서 건너뛰어요', blocks: rest.map((p) => path.basename(p)) });
      for (const p of rest) { const f = await fileFacts(p); if (f) push(f, { scope, folder: d, state: 'ignored', why: `빈 ${path.basename(here[0])}가 가려요`, unsure: true, unsureWhy: 'Codex 소스 기준이에요 (문서에는 없음)' }); }
      continue;
    }
    const l = push(f0, { scope, folder: d, state: 'loaded', fallback: cfg.fallbacks.includes(path.basename(here[0])) });
    if (over) { l.state = 'skipped'; l.why = `${Math.round(cfg.maxBytes / 1024)} KiB 한도를 넘어 빠져요`; }
    else if (used + f0.bytes > cfg.maxBytes) {
      l.state = 'cut'; l.keptBytes = Math.max(0, cfg.maxBytes - used); l.cutBytes = f0.bytes - l.keptBytes;
      l.why = `${Math.round(cfg.maxBytes / 1024)} KiB 한도를 넘어 끝이 잘려요`;
      over = true;
    }
    used += f0.bytes;
    for (const p of rest) { const f = await fileFacts(p); if (f) push(f, { scope, folder: d, state: 'ignored', why: `${path.basename(here[0])}가 있어서 안 읽어요` }); }
  }
  // above the project root: Codex never looks there
  if (root) {
    for (const d of chainTo(root).slice(0, -1)) {
      for (const nm of ['AGENTS.override.md', 'AGENTS.md']) {
        const p = path.join(d, nm);
        if (same(p, path.join(CFG.codexHome, nm))) continue;
        const f = await fileFacts(p);
        if (f) push(f, { scope: 'above', folder: d, state: 'ignored', why: `Codex는 프로젝트 루트(${path.basename(root)}) 위 폴더는 읽지 않아요` });
      }
    }
  }
  // below: only when Codex starts in that folder
  for (const t of ctx.tree.folders) {
    if (same(t.path, at) || !inside(t.path, at)) continue;
    for (const nm of ['AGENTS.override.md', 'AGENTS.md']) {
      if (!t.has[nm]) continue;
      const f = await fileFacts(path.join(t.path, nm));
      if (f) push(f, { scope: 'sub', folder: t.path, state: 'other', why: '그 폴더에서 Codex를 시작할 때만 읽어요' });
      break;
    }
  }
  const projectBytes = layers.filter((l) => ['loaded', 'cut'].includes(l.state) && l.scope !== 'global').reduce((s, l) => s + l.bytes, 0);
  return {
    root, rootMarkers: cfg.markers, trust, maxBytes: cfg.maxBytes, fallbacks: cfg.fallbacks, configError: cfg.error,
    layers, global: global ? global.id : null,
    total: {
      projectBytes, cutBytes: Math.max(0, projectBytes - cfg.maxBytes),
      bytes: Math.min(projectBytes, cfg.maxBytes) + (global ? global.bytes : 0),
      tokens: layers.filter((l) => l.state === 'loaded').reduce((s, l) => s + (l.tokens || 0), 0)
        + layers.filter((l) => l.state === 'cut').reduce((s, l) => s + Math.round((l.tokens || 0) * (l.keptBytes / Math.max(1, l.bytes))), 0),
      files: layers.filter((l) => ['loaded', 'cut'].includes(l.state)).length,
    },
  };
}

/* ------------------------------------------------------------------ the folders under the project */
async function scanTree(project) {
  const folders = [];
  const started = Date.now();
  let visited = 0;
  let truncated = false;
  const queue = [{ d: normP(project), depth: 0 }];
  while (queue.length) {
    const { d, depth } = queue.shift();
    if (++visited > 4000 || Date.now() - started > 2500) { truncated = true; break; }
    const ents = await listDir(d);
    const has = {};
    const rules = [];
    let skills = 0;
    for (const e of ents) {
      if (e.isFile() && (INSTRUCTION_NAMES.has(e.name) || e.name === '.mcp.json')) has[e.name] = true;
      else if (e.isDirectory() && e.name === '.claude') {
        for (const c of await listDir(path.join(d, '.claude'))) {
          if (c.isFile() && ['CLAUDE.md', 'AGENTS.md', 'settings.json', 'settings.local.json'].includes(c.name)) has['.claude/' + c.name] = true;
          if (c.isDirectory() && c.name === 'rules') { const r = await rulesIn(path.join(d, '.claude', 'rules')); rules.push(...r); }
          if (c.isDirectory() && c.name === 'skills') skills += (await listDir(path.join(d, '.claude', 'skills'))).filter((x) => x.isDirectory()).length;
        }
      } else if (e.isDirectory() && e.name === '.codex') {
        for (const c of await listDir(path.join(d, '.codex'))) if (c.isFile() && ['config.toml', 'hooks.json'].includes(c.name)) has['.codex/' + c.name] = true;
      } else if (e.isDirectory() && e.name === '.agents') {
        skills += (await listDir(path.join(d, '.agents', 'skills'))).filter((x) => x.isDirectory()).length;
      } else if (e.isDirectory() && e.name === '.git') has['.git'] = true;
      else if (e.isFile() && e.name === '.git') has['.git'] = true;
    }
    if (Object.keys(has).some((k) => k !== '.git') || rules.length || skills || depth === 0) {
      folders.push({ path: d, rel: path.relative(project, d).split(path.sep).join('/'), depth, has, rules, skills, git: !!has['.git'] });
    } else if (has['.git']) folders.push({ path: d, rel: path.relative(project, d).split(path.sep).join('/'), depth, has, rules, skills, git: true });
    if (depth >= 8) continue;
    for (const e of ents) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || (e.name.startsWith('.') && !DOT_DIRS.has(e.name)) || DOT_DIRS.has(e.name)) continue;
      queue.push({ d: path.join(d, e.name), depth: depth + 1 });
    }
  }
  return { folders, truncated };
}

/* ------------------------------------------------------------------ skills */
async function skillsIn(dir, scope, extra = {}) {
  const out = [];
  for (const e of await listDir(dir)) {
    if (!e.isDirectory() || e.name === '.trash') continue;
    const sd = path.join(dir, e.name);
    const file = path.join(sd, 'SKILL.md');
    const r = await readText(file, 512 * 1024);
    if (!r) {
      if (e.name === 'synced' || e.name === '.system') out.push(...await skillsIn(sd, e.name === '.system' ? 'system' : scope, { ...extra, synced: e.name === 'synced' }));
      continue;
    }
    let fm = {};
    let fmError = '';
    try { fm = P.frontmatter(r.text).data; } catch (err) { fmError = err.message; }
    const body = (() => { try { return P.frontmatter(r.text).body; } catch { return r.text; } })();
    const model = fm['disable-model-invocation'] !== true;
    const user = fm['user-invocable'] !== false;
    out.push({
      kind: 'skill', name: String(fm.name || e.name), desc: firstLine(fm.description || body), scope, path: file, dir: sd,
      who: model && user ? 'both' : user ? 'user' : model ? 'model' : 'none',
      paths: Array.isArray(fm.paths) ? fm.paths.map(String) : typeof fm.paths === 'string' ? fm.paths.split(',').map((x) => x.trim()).filter(Boolean) : [],
      ours: await isFile(path.join(sd, '.minsuterm.json')), fmError, ...extra,
    });
  }
  return out;
}
async function commandsIn(dir, scope, extra = {}) {
  const out = [];
  for (const e of await listDir(dir)) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const r = await readText(path.join(dir, e.name), 256 * 1024);
    if (!r) continue;
    let fm = {};
    try { fm = P.frontmatter(r.text).data; } catch { /* still a command */ }
    out.push({ kind: 'command', name: e.name.replace(/\.md$/, ''), desc: firstLine(fm.description || r.text.replace(/^---[\s\S]*?---/, '')), scope, path: path.join(dir, e.name), who: 'user', paths: [], ...extra });
  }
  return out;
}

/* ------------------------------------------------------------------ plugins */
async function pluginsIn(cacheDir, enabledOf) {
  const out = [];
  for (const mk of await listDir(cacheDir)) {
    if (!mk.isDirectory()) continue;
    for (const pl of await listDir(path.join(cacheDir, mk.name))) {
      if (!pl.isDirectory()) continue;
      const base = path.join(cacheDir, mk.name, pl.name);
      const vers = [];
      for (const v of await listDir(base)) if (v.isDirectory()) { const st = await statOf(path.join(base, v.name)); vers.push({ v: v.name, t: st ? st.mtimeMs : 0 }); }
      if (!vers.length) continue;
      vers.sort((a, b) => b.t - a.t);
      const root = path.join(base, vers[0].v);
      const manifest = (await readJson(path.join(root, '.claude-plugin', 'plugin.json'))) || (await readJson(path.join(root, 'plugin.json'))) || {};
      const m = manifest.data || {};
      const id = `${pl.name}@${mk.name}`;
      const en = enabledOf(id, m);
      out.push({ id, name: String(m.name || pl.name), marketplace: mk.name, version: vers[0].v, root, desc: firstLine(m.description || ''), enabled: en, manifest: m });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ MCP servers */
function mcpEntries(obj, scope, extra = {}) {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const [name, s] of Object.entries(obj)) {
    if (!s || typeof s !== 'object') continue;
    const url = s.url || s.serverUrl || '';
    const type = String(s.type || s.transport || (url ? 'http' : 'stdio'));
    out.push({
      name, scope, type: /http|sse|ws/i.test(type) ? type.toLowerCase() : 'stdio',
      what: url ? hostOf(url) : path.basename(String(s.command || '')).replace(/\.(exe|cmd|bat)$/i, ''),
      enabled: s.enabled !== false && s.disabled !== true, ...extra,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ hooks */
function hookEntries(hooks, scope, source, extra = {}) {
  const out = [];
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return out;
  for (const [event, groups] of Object.entries(hooks)) {
    if (event === 'state' || !Array.isArray(groups)) continue;
    for (const g of groups) {
      if (!g || typeof g !== 'object') continue;
      const list = Array.isArray(g.hooks) ? g.hooks : [g];
      for (const h of list) {
        if (!h || typeof h !== 'object') continue;
        const type = String(h.type || 'command');
        const what = type === 'command' ? maskCommand(h.command || (Array.isArray(h.args) ? h.args.join(' ') : ''))
          : type === 'http' ? hostOf(h.url) : type === 'mcp_tool' ? [h.server, h.tool].filter(Boolean).join(' · ') : '';
        out.push({ event, matcher: typeof g.matcher === 'string' ? g.matcher : '', type, what, scope, source, ...extra });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ tools per agent */
async function claudeTools(at, ctx) {
  const { settings, gitRoot, tree } = ctx;
  const m = settings.merged;
  // skills: managed > personal > project; nested ones when Claude works there; plugins carry their own name
  const skills = [];
  skills.push(...await skillsIn(path.join(CFG.managedDir, '.claude', 'skills'), 'managed'));
  skills.push(...await skillsIn(path.join(CFG.claudeDir, 'skills'), 'user'));
  skills.push(...await commandsIn(path.join(CFG.claudeDir, 'commands'), 'user'));
  const up = gitRoot ? chainTo(at).filter((d) => inside(d, gitRoot)).reverse() : [normP(at)];
  for (const d of up) {
    if (same(path.join(d, '.claude'), CFG.claudeDir)) continue;
    skills.push(...await skillsIn(path.join(d, '.claude', 'skills'), 'project', same(d, at) ? {} : { folder: d }));
    skills.push(...await commandsIn(path.join(d, '.claude', 'commands'), 'project', same(d, at) ? {} : { folder: d }));
  }
  for (const t of tree.folders) {
    if (same(t.path, at) || !inside(t.path, at) || !t.skills) continue;
    skills.push(...(await skillsIn(path.join(t.path, '.claude', 'skills'), 'sub', { folder: t.path, lazy: true })));
  }
  const plugins = await pluginsIn(path.join(process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR || path.join(CFG.claudeDir, 'plugins'), 'cache'),
    (id, man) => (id in m.enabledPlugins ? m.enabledPlugins[id] === true : man.defaultEnabled === true));
  for (const pl of plugins) pl.where = m.pluginFrom[pl.id] || 'user'; // (on by its own default: everywhere)
  for (const pl of plugins) {
    const extra = { plugin: pl.id, pluginOn: pl.enabled, pluginWhere: pl.where };
    for (const s of await skillsIn(path.join(pl.root, 'skills'), 'plugin', extra)) skills.push({ ...s, name: `${pl.name}:${s.name}` });
    for (const c of await commandsIn(path.join(pl.root, 'commands'), 'plugin', extra)) skills.push({ ...c, name: `${pl.name}:${c.name}` });
  }
  const rank = { managed: 4, user: 3, project: 2, sub: 1, plugin: 0 };
  for (const s of skills) {
    s.state = s.scope === 'plugin' && !s.pluginOn ? 'off' : s.lazy ? 'lazy' : 'on';
    const ov = s.scope !== 'plugin' ? m.skillOverrides[s.name] : undefined;
    if (ov === 'off') s.state = 'off';
    else if (ov === 'name-only' || ov === 'user-invocable-only') s.override = ov;
    if (s.scope !== 'plugin' && s.scope !== 'sub') {
      const better = skills.find((o) => o !== s && o.name === s.name && o.scope !== 'plugin' && o.scope !== 'sub'
        && (rank[o.scope] > rank[s.scope] || (rank[o.scope] === rank[s.scope] && o.kind === 'skill' && s.kind === 'command')));
      if (better) { s.state = 'shadowed'; s.by = better.scope; }
    }
  }

  // MCP servers
  const mcp = [];
  const cj = await readJson(CFG.claudeJson);
  const cjd = (cj && cj.data) || {};
  const projKey = cjd.projects && typeof cjd.projects === 'object'
    ? Object.keys(cjd.projects).find((k) => same(k, at)) || (gitRoot && Object.keys(cjd.projects).find((k) => same(k, gitRoot))) : null;
  const projEntry = projKey ? cjd.projects[projKey] || {} : {};
  const managedMcp = await readJson(path.join(CFG.managedDir, 'managed-mcp.json'));
  if (managedMcp && managedMcp.data) mcp.push(...mcpEntries(managedMcp.data.mcpServers || managedMcp.data, 'managed'));
  mcp.push(...mcpEntries(projEntry.mcpServers, 'local'));
  let mcpJson = null;
  for (const d of (gitRoot ? chainTo(at).filter((x) => inside(x, gitRoot)).reverse() : [normP(at)])) {
    const j = await readJson(path.join(d, '.mcp.json'));
    if (j) { mcpJson = { path: path.join(d, '.mcp.json'), error: j.error || '', data: j.data, here: same(d, at) }; break; }
  }
  if (mcpJson && mcpJson.data) {
    for (const e of mcpEntries(mcpJson.data.mcpServers, 'project', mcpJson.here ? {} : { unsure: true, unsureWhy: 'git 루트의 .mcp.json을 읽는지는 공식 문서에 없어요' })) {
      const rejected = m.disabledMcpjsonServers.includes(e.name);
      const approved = m.enableAllProjectMcpServers === true || m.enabledMcpjsonServers.includes(e.name);
      e.approval = rejected ? 'rejected' : approved ? 'approved' : 'pending';
      mcp.push(e);
    }
  }
  mcp.push(...mcpEntries(cjd.mcpServers, 'user'));
  for (const pl of plugins) {
    const pj = await readJson(path.join(pl.root, '.mcp.json'));
    const obj = (pj && pj.data && (pj.data.mcpServers || pj.data)) || pl.manifest.mcpServers;
    mcp.push(...mcpEntries(obj, 'plugin', { plugin: pl.id, pluginOn: pl.enabled, pluginWhere: pl.where }));
  }
  const disabled = Array.isArray(projEntry.disabledMcpServers) ? projEntry.disabledMcpServers : [];
  const mrank = { managed: 5, local: 4, project: 3, user: 2, plugin: 1 };
  for (const e of mcp) {
    e.state = !e.enabled || disabled.includes(e.name) ? 'off' : e.scope === 'plugin' && !e.pluginOn ? 'off'
      : e.approval === 'rejected' ? 'rejected' : e.approval === 'pending' ? 'pending' : 'on';
    if (e.scope !== 'plugin') {
      const better = mcp.find((o) => o !== e && o.name === e.name && o.scope !== 'plugin' && mrank[o.scope] > mrank[e.scope]);
      if (better) { e.state = 'shadowed'; e.by = better.scope; }
    }
    if (managedMcp && managedMcp.data && e.scope !== 'managed') { e.state = 'off'; e.why = '관리 정책(managed-mcp.json)이 정한 서버만 써요'; }
  }

  // hooks
  const hooks = [];
  for (const l of settings.layers) hooks.push(...hookEntries(l.data.hooks, l.scope, l.path));
  for (const pl of plugins) {
    const hj = await readJson(path.join(pl.root, 'hooks', 'hooks.json'));
    if (hj && hj.data) hooks.push(...hookEntries(hj.data.hooks || hj.data, 'plugin', path.join(pl.root, 'hooks', 'hooks.json'), { plugin: pl.id, pluginOn: pl.enabled, pluginWhere: pl.where }));
  }
  for (const h of hooks) {
    h.state = h.scope === 'plugin' && !h.pluginOn ? 'off' : (m.disableAllHooks && h.scope !== 'managed') || (m.allowManagedHooksOnly && h.scope !== 'managed') ? 'off' : 'on';
  }
  return {
    skills, mcp, hooks,
    plugins: plugins.map(({ manifest, ...p }) => p),
    flags: { disableAllHooks: !!m.disableAllHooks, allowManagedHooksOnly: !!m.allowManagedHooksOnly, mcpJson: mcpJson ? { path: mcpJson.path, error: mcpJson.error } : null, claudeJsonError: cj && cj.error ? cj.error : '' },
    settingsFiles: settings.layers.map((l) => ({ scope: l.scope, path: l.path, error: l.error })),
  };
}

async function codexTools(at, ctx) {
  const cfg = ctx.codexCfg;
  const root = ctx.codex.root;
  const trusted = ctx.codex.trust === 'trusted';
  const chain = root ? chainTo(at).filter((d) => inside(d, root)) : [normP(at)];
  // project config files (trusted projects only)
  const projCfgs = [];
  for (const d of chain) {
    const r = await readToml(path.join(d, '.codex', 'config.toml'));
    if (r) projCfgs.push({ path: path.join(d, '.codex', 'config.toml'), error: r.error || '', data: r.data || {}, used: trusted });
  }
  const used = [{ scope: 'user', path: cfg.path, data: cfg.data, error: cfg.error }, ...projCfgs.filter((c) => c.used).map((c) => ({ ...c, scope: 'project' }))];

  // skills
  const skills = [];
  for (const d of chain.slice().reverse()) skills.push(...await skillsIn(path.join(d, '.agents', 'skills'), 'project', same(d, at) ? {} : { folder: d }));
  if (trusted) for (const d of chain.slice().reverse()) skills.push(...await skillsIn(path.join(d, '.codex', 'skills'), 'project', { folder: d, unsure: true, unsureWhy: 'Codex 소스 기준이에요 (문서에는 없음)' }));
  skills.push(...await skillsIn(CFG.agentsHome && path.join(CFG.agentsHome, 'skills'), 'user'));
  for (const s of await skillsIn(path.join(CFG.codexHome, 'skills'), 'user', { legacy: true })) skills.push(s);
  skills.push(...await skillsIn(path.join(CFG.codexAdminDir, 'skills'), 'admin'));
  const sc = [];
  for (const c of used) if (c.data.skills && Array.isArray(c.data.skills.config)) sc.push(...c.data.skills.config);
  for (const s of skills) {
    let on = true;
    for (const c of sc) if (c && ((c.path && same(c.path, s.path)) || (c.name && c.name === s.name)) && typeof c.enabled === 'boolean') on = c.enabled;
    s.state = on ? 'on' : 'off';
  }

  // MCP servers
  const mcp = [];
  for (const c of used) {
    const obj = c.data.mcp_servers;
    if (obj && typeof obj === 'object') mcp.push(...mcpEntries(obj, c.scope, { source: c.path }));
  }
  for (const pc of projCfgs.filter((c) => !c.used)) {
    if (pc.data.mcp_servers) mcp.push(...mcpEntries(pc.data.mcp_servers, 'project', { source: pc.path }).map((e) => ({ ...e, enabled: false, why: '신뢰하지 않은 프로젝트라 읽지 않아요' })));
  }
  for (const e of mcp) e.state = e.enabled ? 'on' : 'off';

  // hooks
  const hooks = [];
  const hookFile = async (p, scope, ok = true) => {
    const j = await readJson(p);
    if (j && j.data) hooks.push(...hookEntries(j.data.hooks || j.data, scope, p, ok ? {} : { why: '신뢰하지 않은 프로젝트라 읽지 않아요', off: true }));
  };
  await hookFile(path.join(CFG.codexAdminDir, 'hooks.json'), 'admin');
  await hookFile(path.join(CFG.codexHome, 'hooks.json'), 'user');
  for (const d of chain) await hookFile(path.join(d, '.codex', 'hooks.json'), 'project', trusted);
  for (const c of used) if (c.data.hooks) hooks.push(...hookEntries(c.data.hooks, c.scope, c.path));
  for (const h of hooks) h.state = h.off || cfg.hooksOff ? 'off' : 'on';

  const plugins = await pluginsIn(path.join(CFG.codexHome, 'plugins', 'cache'), (id) => {
    const p = cfg.data.plugins && cfg.data.plugins[id];
    if (p && typeof p.enabled === 'boolean') return p.enabled;
    const d = cfg.data.plugins && cfg.data.plugins._default;
    return d && typeof d.enabled === 'boolean' ? d.enabled : true;
  });
  return {
    skills, mcp, hooks, plugins: plugins.map(({ manifest, ...p }) => p),
    flags: { hooksOff: !!cfg.hooksOff, trust: ctx.codex.trust, configError: cfg.error },
    settingsFiles: [{ scope: 'user', path: cfg.path, error: cfg.error }, ...projCfgs.map((c) => ({ scope: 'project', path: c.path, error: c.error, unused: !c.used }))],
  };
}

/* ------------------------------------------------------------------ checks */
function normalizeBody(t) { return P.stripComments(t).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n'); }

async function checks(at, res) {
  const out = [];
  const add = (level, code, text, o = {}) => out.push({ level, code, text, ...o });
  const cl = res.claude.layers;
  const cx = res.codex.layers;
  const all = [...cl, ...cx];
  const uniq = new Map(); // one entry per file, preferring a layer some agent actually reads
  const reads = (l) => !['ignored', 'other'].includes(l.state);
  for (const l of all) { const k = keyP(l.path); if (!uniq.has(k) || (!reads(uniq.get(k)) && reads(l))) uniq.set(k, l); }
  const label = (p) => {
    if (inside(p, res.project)) return path.relative(res.project, p).split(path.sep).join('/') || path.basename(p);
    if (inside(p, CFG.home)) return '~/' + path.relative(CFG.home, p).split(path.sep).join('/');
    return path.basename(path.dirname(p)) + '/' + path.basename(p);
  };

  // length (only what an agent reads)
  for (const l of uniq.values()) {
    if (!reads(l)) continue;
    if (l.tooBig) add('error', 'too-big', `${label(l.path)}이(가) 4 MiB를 넘어 Claude Code가 읽지 않아요`, { file: l.path });
    else if (l.lines > LONG_LINES && /\.md$/i.test(l.name)) add('warn', 'long', `${label(l.path)}이(가) ${l.lines}줄이에요. 200줄 이하가 권장이에요`, { file: l.path, data: { rel: label(l.path), lines: l.lines, bytes: l.bytes } });
  }
  // Codex budget
  const cut = cx.find((l) => l.state === 'cut');
  if (cut) add('error', 'codex-cut', `Codex가 ${label(cut.path)}의 끝 ${(cut.cutBytes / 1024).toFixed(1)} KB를 잘라요 (프로젝트 지침 합계 ${(res.codex.total.projectBytes / 1024).toFixed(1)} / ${Math.round(res.codex.maxBytes / 1024)} KiB)`,
    { file: cut.path, data: { rel: label(cut.path), total: res.codex.total.projectBytes, max: res.codex.maxBytes, cut: cut.cutBytes } });
  for (const l of cx.filter((x) => x.state === 'skipped')) add('error', 'codex-skip', `Codex 한도를 넘어 ${label(l.path)}을(를) 아예 읽지 않아요`, { file: l.path });
  // imports
  for (const b of res.claude.broken) {
    add('warn', b.deep ? 'import-deep' : 'import-broken', b.deep ? `@${b.target}: 가져오기가 4단계를 넘어 읽히지 않아요` : `@${b.target}: 가져올 파일이 없어요`, { file: b.from, line: b.line, data: { rel: label(b.from), target: b.target, line: b.line } });
  }
  for (const l of cl.filter((x) => x.external && x.state !== 'ignored')) add('info', 'import-external', `${label(l.path)}은(는) 프로젝트 밖 파일이라 Claude Code가 처음 한 번 승인을 물어요`, { file: l.path });
  // CLAUDE.md and AGENTS.md in the same folder
  const folders = new Set(all.map((l) => keyP(l.folder || path.dirname(l.path))));
  for (const fk of folders) {
    const claudeMd = all.find((l) => keyP(path.dirname(l.path)) === fk && l.name === 'CLAUDE.md');
    const agentsMd = all.find((l) => keyP(path.dirname(l.path)) === fk && l.name === 'AGENTS.md');
    if (!claudeMd || !agentsMd) continue;
    const [a, b] = await Promise.all([readText(claudeMd.path), readText(agentsMd.path)]);
    if (!a || !b) continue;
    const linked = P.imports(a.text).some((im) => same(path.resolve(path.dirname(claudeMd.path), im.path), agentsMd.path));
    if (linked) continue;
    const sameText = normalizeBody(a.text) === normalizeBody(b.text);
    add(sameText ? 'info' : 'warn', sameText ? 'pair-copy' : 'pair-diverge',
      sameText ? `${path.basename(path.dirname(claudeMd.path))}의 AGENTS.md가 CLAUDE.md의 사본이에요. 하나로 묶으면 한 파일만 고치면 돼요`
        : `${path.basename(path.dirname(claudeMd.path))}의 CLAUDE.md와 AGENTS.md가 달라서 두 에이전트가 다른 지침을 봐요`,
      { file: claudeMd.path, pair: { claude: claudeMd.path, agents: agentsMd.path }, fix: 'unify', data: { dir: label(path.dirname(claudeMd.path)) || path.basename(path.dirname(claudeMd.path)) } });
  }
  // AGENTS.md above the Codex project root (read by Claude, not by Codex)
  for (const l of cx.filter((x) => x.scope === 'above')) {
    const claudeReads = cl.some((c) => c.state === 'loaded' && keyP(path.dirname(c.path)) === keyP(path.dirname(l.path)));
    add('info', 'codex-above-root', claudeReads
      ? `Codex는 프로젝트 루트(${path.basename(res.codex.root)}) 위의 ${label(l.path)}을(를) 읽지 않아요. Claude Code는 그 폴더의 지침을 읽어요`
      : `Codex는 프로젝트 루트(${path.basename(res.codex.root)}) 위의 ${label(l.path)}을(를) 읽지 않아요`, { file: l.path });
  }
  if (res.codex.trust === 'untrusted' && cx.some((l) => ['chain', 'cwd'].includes(l.scope))) add('warn', 'codex-untrusted', 'Codex가 이 프로젝트를 신뢰하지 않아 프로젝트 지침과 설정을 읽지 않아요');
  for (const l of cx.filter((x) => x.blocks && x.blocks.length)) add('warn', 'override-empty', `빈 ${label(l.path)}이(가) 같은 폴더의 ${l.blocks.join(', ')}을(를) 가려요`, { file: l.path, data: { rel: label(l.path) } });
  // the same line in two files one agent reads
  for (const [agent, layers] of [['Claude Code', cl], ['Codex', cx]]) {
    const live = layers.filter((l) => ['loaded', 'cut', 'lazy'].includes(l.state));
    const where = new Map();
    for (const l of live) {
      const r = await readText(l.path);
      if (!r) continue;
      for (const line of new Set(normalizeBody(r.text).split('\n'))) {
        if (line.length < 24 || line.startsWith('#') || /^[-*]\s*$/.test(line) || line.startsWith(FENCE3)) continue;
        if (!where.has(line)) where.set(line, new Set());
        where.get(line).add(l.path);
      }
    }
    let shown = 0;
    const pairs = new Map();
    for (const [line, files] of where) {
      if (files.size < 2) continue;
      const k = [...files].sort().join('|');
      if (!pairs.has(k)) pairs.set(k, { files: [...files], lines: [] });
      pairs.get(k).lines.push(line);
    }
    for (const p of pairs.values()) {
      if (shown++ >= 4) break;
      const names = p.files.map(label);
      add('info', 'dup', `${agent}가 읽는 ${names.join(', ')}에 같은 줄이 ${p.lines.length}개 있어요`, { file: p.files[0], sample: p.lines[0].slice(0, 80), data: { files: names, n: p.lines.length, paths: p.files, lines: p.lines.slice(0, 40) } });
    }
  }
  // secrets
  for (const l of uniq.values()) {
    const r = await readText(l.path);
    if (!r) continue;
    const lines = secretLines(r.text);
    if (lines.length) add('warn', 'secret', `${label(l.path)} ${lines.slice(0, 3).join(', ')}번째 줄에 비밀 정보로 보이는 값이 있어요`, { file: l.path, line: lines[0], data: { rel: label(l.path), lines: lines.slice(0, 5) } });
  }
  // CLAUDE.local.md that git would commit
  for (const l of cl.filter((x) => x.name === 'CLAUDE.local.md' && x.state !== 'ignored')) {
    const root = await rootBy(path.dirname(l.path));
    if (!root) continue;
    let ignored = false;
    for (const d of chainTo(path.dirname(l.path)).filter((x) => inside(x, root))) {
      const g = await readText(path.join(d, '.gitignore'));
      if (g && g.text.split(/\r?\n/).some((x) => /^\/?(\*\*\/)?CLAUDE\.local\.md$|^\*\.local\.md$/.test(x.trim()))) ignored = true;
    }
    const ex = await readText(path.join(root, '.git', 'info', 'exclude'));
    if (ex && /CLAUDE\.local\.md/.test(ex.text)) ignored = true;
    if (!ignored) add('info', 'local-commit', 'CLAUDE.local.md가 .gitignore에 없어요. 실수로 커밋될 수 있어요', { file: l.path, data: { rel: label(l.path) } });
  }
  // name clashes among tools
  // (whole sentences per kind: the app's translator fills a slot with its value as it is, so a Korean word in one stays Korean)
  const clash = (list, say) => {
    const names = new Map();
    for (const s of list) { if (!names.has(s.name)) names.set(s.name, []); names.get(s.name).push(s); }
    for (const [name, xs] of names) if (xs.length > 1 && xs.some((x) => x.state === 'shadowed')) add('info', 'clash', say(name));
  };
  clash(res.tools.claude.skills, (name) => `Claude Code 스킬 '${name}'이(가) 여러 곳에 있어요. 한 곳 것만 쓰여요`);
  clash(res.tools.claude.mcp, (name) => `Claude Code MCP 서버 '${name}'이(가) 여러 곳에 있어요. 한 곳 것만 쓰여요`);
  return out;
}

/* ------------------------------------------------------------------ scan */
async function scan({ project, at, light = false }) {
  project = normP(project);
  at = normP(at || project);
  if (!inside(at, project)) throw new Error('폴더가 프로젝트 밖이에요');
  const tree = await scanTree(project);
  const gitRoot = await rootBy(at);
  const settings = await claudeSettings(at, gitRoot);
  const codexCfg = await codexConfig();
  const ctx = { project, tree, gitRoot, settings, codexCfg };
  const claude = await scanClaude(at, ctx);
  const codex = await scanCodex(at, ctx);
  ctx.codex = codex;
  // a file both agents read
  const cKeys = new Set(claude.layers.filter((l) => l.state !== 'ignored').map((l) => keyP(l.path)));
  const xKeys = new Set(codex.layers.filter((l) => ['loaded', 'cut'].includes(l.state)).map((l) => keyP(l.path)));
  for (const l of [...claude.layers, ...codex.layers]) if (cKeys.has(keyP(l.path)) && xKeys.has(keyP(l.path))) l.shared = true;
  const res = {
    project, at, gitRoot, name: path.basename(project), home: CFG.home,
    places: { claudeDir: CFG.claudeDir, codexHome: CFG.codexHome, managedDir: CFG.managedDir },
    claude, codex, tree,
    tools: { claude: await claudeTools(at, ctx), codex: await codexTools(at, ctx) },
    scannedAt: Date.now(),
  };
  res.checks = await checks(at, res);
  // ghost cards: the usual files that are not there yet
  const ghosts = [];
  const want = (p, agent, label, where) => ghosts.push({ path: p, agent, label, where });
  const root = gitRoot && inside(gitRoot, project) ? gitRoot : project;
  if (!await isFile(path.join(root, 'CLAUDE.md')) && !await isFile(path.join(root, '.claude', 'CLAUDE.md'))) want(path.join(root, 'CLAUDE.md'), 'claude', '프로젝트 CLAUDE.md 만들기', 'root');
  if (!await isFile(path.join(root, 'AGENTS.md'))) want(path.join(root, 'AGENTS.md'), 'codex', '프로젝트 AGENTS.md 만들기', 'root');
  if (!same(at, root) && !await isFile(path.join(at, 'CLAUDE.md'))) want(path.join(at, 'CLAUDE.md'), 'claude', '이 폴더에 CLAUDE.md 만들기', 'here');
  if (!await isFile(path.join(CFG.claudeDir, 'CLAUDE.md'))) want(path.join(CFG.claudeDir, 'CLAUDE.md'), 'claude', '모든 폴더에 적용되는 CLAUDE.md 만들기', 'global');
  if (!await isFile(path.join(CFG.codexHome, 'AGENTS.md')) && !await isFile(path.join(CFG.codexHome, 'AGENTS.override.md'))) want(path.join(CFG.codexHome, 'AGENTS.md'), 'codex', '모든 폴더에 적용되는 AGENTS.md 만들기', 'global');
  res.ghosts = ghosts;
  remember(res);
  if (!light) rememberCandidates(res); // (a light look, the sidebar's: the open panel's watch list stays)
  return res;
}

/* ------------------------------------------------------------------ reading and writing the instruction files */
/** May the app write this file? Instruction files inside a project the user added, or the user-wide ones. */
function writable(file, projects, dirs = CFG) {
  const p = normP(file);
  if (offLimits(p)) return false;
  const base = path.basename(p);
  if (inside(p, dirs.managedDir)) return false;
  const userWide = same(p, path.join(dirs.claudeDir, 'CLAUDE.md')) || (inside(p, path.join(dirs.claudeDir, 'rules')) && /\.md$/i.test(base))
    || same(p, path.join(dirs.codexHome, 'AGENTS.md')) || same(p, path.join(dirs.codexHome, 'AGENTS.override.md'));
  if (userWide) return 'global';
  const inProject = (projects || []).some((root) => root && inside(p, root));
  if (!inProject) return false;
  if (INSTRUCTION_NAMES.has(base)) return 'project';
  const parent = path.basename(path.dirname(p));
  if (parent === '.claude' && ['CLAUDE.md', 'AGENTS.md'].includes(base)) return 'project';
  const segs = p.split(path.sep);
  const at = segs.lastIndexOf('.claude');
  if (/\.md$/i.test(base) && at >= 0 && segs[at + 1] === 'rules') return 'project';
  return false;
}
/** The files a scan showed (instruction files, imports, skills): the only ones the page may open besides writable ones. */
const listed = new Set();
function remember(res) {
  if (listed.size > 20000) listed.clear();
  for (const l of [...res.claude.layers, ...res.codex.layers]) listed.add(keyP(l.path));
  for (const a of ['claude', 'codex']) for (const s of res.tools[a].skills) listed.add(keyP(s.path));
}
function readable(file, projects) {
  if (!/\.md$/i.test(String(file))) return false;
  return !!writable(file, projects) || listed.has(keyP(file));
}

async function read(file) {
  const r = await readText(file);
  if (!r) return { exists: false, text: '', hash: sha('') };
  if (r.tooBig) return { exists: true, tooBig: true, bytes: r.bytes };
  return { exists: true, text: r.text, hash: sha(r.text), mtimeMs: r.mtimeMs, bytes: r.bytes, crlf: r.crlf, bom: r.bom, enc: r.enc };
}

/* history: <historyDir>/<sha(file)>/ index.json + <time>-<kind>.md */
const histDir = (file) => path.join(CFG.historyDir, sha(keyP(file)).slice(0, 16));
async function histList(file) {
  const dir = histDir(file);
  const ents = (await listDir(dir)).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name).sort().reverse();
  const out = [];
  for (const n of ents) {
    const m = /^(\d{8}-\d{6}-\d{3})-(\w+)-([0-9a-f]{8})\.md$/.exec(n);
    if (!m) continue;
    const st = await statOf(path.join(dir, n));
    out.push({ id: n, at: m[1], kind: m[2], hash8: m[3], bytes: st ? st.size : 0 });
  }
  return out;
}
const stampNow = () => { const d = new Date(); const p = (x, n = 2) => String(x).padStart(n, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`; };
async function histAdd(file, text, kind) {
  const dir = histDir(file);
  const h8 = sha(text).slice(0, 8);
  const list = await histList(file);
  if (list[0] && list[0].hash8 === h8) return list[0].id; // the same as the newest: nothing new
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'file.json'), JSON.stringify({ path: normP(file) }));
  const id = `${stampNow()}-${kind}-${h8}.md`;
  await fsp.writeFile(path.join(dir, id), text);
  for (const old of list.slice(HISTORY_KEEP - 1)) await fsp.rm(path.join(dir, old.id), { force: true });
  return id;
}
async function history(file) { return histList(file); }
async function snapshot(file, id) {
  if (!/^[\w-]+\.md$/.test(id)) throw new Error('잘못된 기록');
  return (await readText(path.join(histDir(file), id)) || { text: '' }).text;
}

/**
 * Write an instruction file the user saved. `base` is the hash of the text the editor started from: when the file
 * changed meanwhile (an agent edited it), nothing is written and the current text comes back to compare.
 * The text on disk before the write goes into the history first; the file keeps its line endings and BOM.
 */
async function write(file, text, { base, projects, create } = {}) {
  const kind = writable(file, projects);
  if (!kind) throw new Error('이 파일은 하네스 보기에서 고칠 수 없어요');
  text = String(text);
  if (Buffer.byteLength(text) > MAX_WRITE) throw new Error('1 MB가 넘어요');
  const cur = await readText(file);
  if (cur && cur.tooBig) throw new Error('너무 큰 파일이에요');
  if (cur && cur.enc !== 'utf8') throw new Error('UTF-8이 아닌 파일이라 하네스 보기에서 고칠 수 없어요');
  if (cur && (base === undefined || base === null || sha(cur.text) !== base)) return { conflict: true, text: cur.text, hash: sha(cur.text) };
  if (!cur && !create) return { conflict: true, text: '', hash: sha(''), gone: true };
  // where it really lands: through a linked file or folder (for a new file, its nearest existing folder)
  const real = await realTarget(file);
  if (!same(real, file)) {
    const realDirs = { managedDir: await realOr(CFG.managedDir), claudeDir: await realOr(CFG.claudeDir), codexHome: await realOr(CFG.codexHome) };
    const realProjects = await Promise.all((projects || []).map(realOr));
    if (!writable(real, realProjects, realDirs) && !writable(real, projects)) throw new Error('링크가 가리키는 곳은 고칠 수 없어요');
  }
  if (cur) await histAdd(file, cur.text, 'before');
  let out = text.replace(/\r\n/g, '\n');
  if (cur && cur.crlf) {
    const ends = new Map(); // a line's words -> the endings it had, in order
    let crlf = 0;
    let lf = 0;
    const was = cur.text.split('\n');
    was.slice(0, -1).forEach((l) => {
      const cr = l.endsWith('\r');
      if (cr) crlf++; else lf++;
      const key = cr ? l.slice(0, -1) : l;
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push(cr ? '\r\n' : '\n');
    });
    const usual = crlf >= lf ? '\r\n' : '\n';
    const ls = out.split('\n');
    out = ls.map((l, k) => (k === ls.length - 1 ? l : l + ((ends.get(l) || []).shift() || usual))).join('');
  }
  const buf = Buffer.concat([cur && cur.bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(out, 'utf8')]);
  await fsp.mkdir(path.dirname(real), { recursive: true });
  const tmp = `${real}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.mt-tmp`;
  await fsp.writeFile(tmp, buf); // (a full disk stops here: the file itself is untouched)
  try {
    const st = cur ? await statOf(real) : null;
    if (st && !IS_WIN) await fsp.chmod(tmp, st.mode & 0o7777).catch(() => {});
    await fsp.rename(tmp, real);
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
    await fsp.writeFile(real, buf); // (Windows: another program holds the file open, so it cannot be replaced, only written)
  }
  await histAdd(file, text.replace(/\r\n/g, '\n'), 'saved');
  const now = await readText(file);
  return { ok: true, hash: sha(now.text), mtimeMs: now.mtimeMs, kind };
}

/** A path through its links (or as it is, when it cannot be resolved). */
async function realOr(p) { if (!p) return p; try { return await fsp.realpath(p); } catch { return p; } }
/** Where writing this path really lands: through a linked file, or for a file not made yet, its nearest existing folder. */
async function realTarget(file) {
  try { return await fsp.realpath(file); } catch { /* not there yet */ }
  let dir = path.dirname(file);
  const rest = [path.basename(file)];
  for (let k = 0; k < 40; k++) {
    try { return path.join(await fsp.realpath(dir), ...rest); } catch { /* up one */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    rest.unshift(path.basename(dir));
    dir = up;
  }
  return path.resolve(file);
}
/** What each agent is given at the start in `at`, in reading order: Claude's files with their comments out and their
 *  imports put in where they stand (four hops at most), Codex's files as they are (the last one cut at its limit). Each
 *  piece says the file it comes from and how many imports deep it is. */
async function combined({ project, at }) {
  const res = await scan({ project, at });
  const claude = [];
  const seen = new Set();
  const expand = async (file, depth) => {
    if (seen.has(keyP(file)) || depth > MAX_IMPORT_DEPTH || offLimits(file)) return;
    seen.add(keyP(file));
    const r = await readText(file);
    if (!r || r.tooBig) return;
    const lines = r.text.replace(/\r\n/g, '\n').split('\n');
    let from = 0;
    const flush = (to) => { const t = P.stripComments(lines.slice(from, to).join('\n')).trim(); if (t) claude.push({ path: file, depth, text: t }); };
    // the line with an import stays as it is (its words are read too); the files it brings follow it
    const byLine = new Map();
    for (const im of P.imports(r.text)) { if (!byLine.has(im.line)) byLine.set(im.line, []); byLine.get(im.line).push(im); }
    for (const [ln, ims] of [...byLine].sort((a, b) => a[0] - b[0])) {
      if (ln - 1 < from) continue;
      flush(ln);
      from = ln;
      for (const im of ims) {
        const p = im.path.startsWith('~') ? path.join(CFG.home, im.path.slice(1)) : path.resolve(path.dirname(file), im.path);
        if (!/\.md$/i.test(p)) { // (any other file: Claude gets it too, but its text is not shown here, as nowhere in the panel)
          if (!seen.has(keyP(p)) && !offLimits(p) && await isFile(p)) { seen.add(keyP(p)); claude.push({ path: p, depth: depth + 1, text: '', hidden: true }); }
          continue;
        }
        await expand(p, depth + 1);
      }
    }
    flush(lines.length);
  };
  for (const l of res.claude.layers.filter((x) => x.state === 'loaded' && !x.via)) await expand(l.path, 0);
  const codex = [];
  for (const l of res.codex.layers.filter((x) => ['loaded', 'cut'].includes(x.state))) {
    const r = await readText(l.path);
    if (!r || r.tooBig) continue;
    let t = r.text;
    if (l.state === 'cut' && l.cutBytes) { // (cut on the file's own bytes, as Codex does; a character split in two is dropped)
      const b = Buffer.from(t);
      t = b.subarray(0, Math.max(0, b.length - l.cutBytes)).toString('utf8').replace(/\uFFFD$/, '');
    }
    t = t.replace(/\r\n/g, '\n');
    if (t.trim()) codex.push({ path: l.path, depth: 0, text: t.trim(), cut: l.state === 'cut' ? l.cutBytes || 0 : 0 });
  }
  const size = (segs) => segs.reduce((s, x) => s + Buffer.byteLength(x.text) + 1, 0);
  return { claude, codex, claudeBytes: size(claude), codexBytes: size(codex), codexMax: res.codex.maxBytes, lazy: res.claude.layers.filter((x) => x.state === 'lazy').length };
}

/** Record a change made outside the app (seen by the watcher) in the history of a file that has one. */
async function noteOutside(file) {
  if (!(await isDir(histDir(file)))) return;
  const r = await readText(file);
  if (r && !r.tooBig) await histAdd(file, r.text.replace(/\r\n/g, '\n'), 'outside');
}

/* ------------------------------------------------------------------ watching
 * Polling, not fs.watch: native watchers (recursive on Windows, plus the folders above) made the app crash about half
 * the times it quit (0xC0000409, 2026-11-26). Every 1.5 s, while a page watches, the files the last scan listed (and
 * the places one may appear) are stat-ed and compared; nothing stays open, so nothing can break at exit. */
const NAMES_HERE = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'AGENTS.override.md', path.join('.claude', 'CLAUDE.md'), '.mcp.json',
  path.join('.claude', 'settings.json'), path.join('.claude', 'settings.local.json'), path.join('.codex', 'config.toml'), path.join('.codex', 'hooks.json')];
const candidates = new Map(); // keyP(project) -> the paths to compare
function rememberCandidates(res) {
  const out = new Set();
  const add = (p) => { if (p && out.size < 800) out.add(normP(p)); };
  for (const l of [...res.claude.layers, ...res.codex.layers]) add(l.path);
  for (const d of chainTo(res.at)) for (const n of NAMES_HERE) add(path.join(d, n));
  for (const t of res.tree.folders) for (const n of NAMES_HERE.slice(0, 5)) add(path.join(t.path, n));
  for (const a of ['claude', 'codex']) { for (const s of res.tools[a].skills) add(s.path); for (const f of res.tools[a].settingsFiles) add(f.path); }
  for (const p of [path.join(CFG.claudeDir, 'CLAUDE.md'), path.join(CFG.codexHome, 'AGENTS.md'), path.join(CFG.codexHome, 'AGENTS.override.md'), path.join(CFG.codexHome, 'hooks.json')]) add(p);
  candidates.set(keyP(res.project), out);
}
const watchers = new Map(); // keyP(project) -> { subs, timer, seen: Map(path -> signature), busy }
function watch(project, cb) {
  const key = keyP(project);
  let e = watchers.get(key);
  if (!e) {
    e = { subs: new Set(), timer: null, seen: new Map(), busy: false };
    const tick = async () => {
      if (e.busy) return;
      e.busy = true;
      try {
        const changed = [];
        for (const p of candidates.get(key) || []) {
          const st = await statOf(p);
          const sig = st ? `${st.mtimeMs}|${st.size}` : '-';
          const old = e.seen.get(p);
          if (old !== undefined && old !== sig) changed.push(p);
          e.seen.set(p, sig);
        }
        if (changed.length) {
          for (const p of changed) noteOutside(p).catch(() => {});
          for (const s of e.subs) { try { s(changed); } catch { /* a page gone */ } }
        }
      } finally { e.busy = false; }
    };
    e.timer = setInterval(tick, 1500);
    tick();
    watchers.set(key, e);
  }
  e.subs.add(cb);
  return () => {
    e.subs.delete(cb);
    if (!e.subs.size) { clearInterval(e.timer); watchers.delete(key); }
  };
}

/** Every watch stopped (the app is quitting). */
function closeAll() {
  for (const e of watchers.values()) clearInterval(e.timer);
  watchers.clear();
}

/* ------------------------------------------------------------------ what a Codex session actually read */
/** The AGENTS.md text Codex put at the start of a session (its first user message), or null. */
async function codexLoaded(file) {
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(512 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    for (const line of buf.slice(0, bytesRead).toString('utf8').split('\n').slice(0, 80)) {
      if (!line.startsWith('{')) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const pl = o.payload || {};
      if (o.type === 'response_item' && pl.type === 'message' && pl.role === 'user' && Array.isArray(pl.content)) {
        const t = pl.content.map((c) => c.text || '').join('');
        const m = /^#\s*AGENTS\.md instructions for (.+?)\r?\n([\s\S]*)$/i.exec(t.trim());
        if (m) return { dir: m[1].trim(), text: m[2].replace(/^\s*<INSTRUCTIONS>\s*/i, '').replace(/\s*<\/INSTRUCTIONS>\s*$/i, '') };
      }
    }
  } catch { /* unreadable */ } finally { if (fh) await fh.close().catch(() => {}); }
  return null;
}

module.exports = { configure, scan, combined, read, write, writable, readable, history, snapshot, watch, closeAll, codexLoaded, maskCommand, secretLines, _: { chainTo, rootBy, normalizeBody } };
