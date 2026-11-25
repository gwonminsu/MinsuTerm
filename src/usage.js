'use strict';
/*
 * 사용량 게이지 (main process): what an agent tab's gauge shows, and the status line link Claude Code needs for it.
 *
 * Codex writes everything into its session file: token_count events carry the context use and the rate limits
 * (primary = 5 hours, secondary = weekly), turn_context carries the model and the effort.
 * Claude Code hands its numbers (context, 5-hour and weekly limits, model, effort) only to a status line command.
 * With the user's consent MinsuTerm links its own command in front of theirs: it keeps a copy of that input per
 * session (~/.claude/minsuterm/usage/<session>.json) and then runs the user's own status line with the same input,
 * so what they see does not change. Without the link the transcript still gives the context and the model.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const DIR = path.join(CLAUDE_DIR, 'minsuterm');
const USAGE_DIR = path.join(DIR, 'usage');
const BRIDGE = path.join(DIR, 'statusline.mjs');
const PREV = path.join(DIR, 'statusline-prev.json'); // the user's own status line, run after ours and put back on unlink
const BACKUP = path.join(DIR, 'settings-before-link.json'); // settings.json as it was before the first link
const SOURCE = path.join(__dirname, 'usage-statusline.mjs');
const slash = (p) => p.split(path.sep).join('/');

/** The last `bytes` of a file as text, starting at a whole line. */
function tail(file, bytes = 512 * 1024) {
  const size = fs.statSync(file).size;
  const len = Math.min(size, bytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const text = buf.toString('utf8');
    return len < size ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}
/** Lines of JSON from the end backwards, parsed lazily; stop() by returning true from fn. */
function fromEnd(text, fn) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line[0] !== '{') continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (fn(j)) return;
  }
}

/** claude-opus-5-5 → Opus 5.5 (other names stay as they are). */
function prettyModel(id) {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/i.exec(String(id || ''));
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : String(id || '');
}
/** A limit from either agent: used percent and when it resets (ms); a window that already reset reads 0. */
function limit(pct, resetsAtSec) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  const at = Number(resetsAtSec) * 1000;
  if (Number.isFinite(at) && at > 0 && at <= Date.now()) return { pct: 0, resetsAt: 0 };
  return { pct: Math.max(0, pct), resetsAt: Number.isFinite(at) ? at : 0 };
}

/** The copy the status line link keeps for a Claude session, if any. */
function linkedCopy(sessionId) {
  if (!/^[0-9a-zA-Z-]{8,80}$/.test(String(sessionId || ''))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(USAGE_DIR, `${sessionId}.json`), 'utf8')); } catch { return null; }
}

function claudeUsage(file, sessionId) {
  const out = { agent: 'claude', ctx: null, h5: null, wk: null, model: '', effort: '', linked: false };
  const sl = linkedCopy(sessionId);
  if (sl) {
    out.linked = true;
    const cw = sl.context_window || {};
    if (typeof cw.used_percentage === 'number') {
      const size = Number(cw.context_window_size) || 0;
      out.ctx = { pct: cw.used_percentage, used: size ? Math.round((size * cw.used_percentage) / 100) : 0, size };
    }
    const rl = sl.rate_limits || {};
    if (rl.five_hour) out.h5 = limit(rl.five_hour.used_percentage, rl.five_hour.resets_at);
    if (rl.seven_day) out.wk = limit(rl.seven_day.used_percentage, rl.seven_day.resets_at);
    out.model = (sl.model && (sl.model.display_name || prettyModel(sl.model.id))) || '';
    out.effort = (sl.effort && sl.effort.level) || '';
  }
  if ((!out.ctx || !out.model) && file && fs.existsSync(file)) {
    // the transcript: the last answer's prompt size is the context in use
    fromEnd(tail(file), (j) => {
      const m = j.type === 'assistant' && j.message;
      const u = m && m.usage;
      if (!u || j.isSidechain) return false;
      const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      const size = used > 200000 ? 1000000 : 200000; // (the status line link knows the real window)
      if (!out.ctx && used > 0) out.ctx = { pct: (used / size) * 100, used, size };
      if (!out.model && m.model && m.model !== '<synthetic>') out.model = prettyModel(m.model);
      return true;
    });
  }
  return out;
}

function codexUsage(file) {
  const out = { agent: 'codex', ctx: null, h5: null, wk: null, model: '', effort: '', linked: true };
  if (!file || !fs.existsSync(file)) return out;
  let counted = false;
  let turned = false;
  fromEnd(tail(file, 1024 * 1024), (j) => {
    const p = j.payload || {};
    if (!counted && p.type === 'token_count') {
      const info = p.info;
      if (info && info.last_token_usage && info.model_context_window) {
        const used = info.last_token_usage.total_tokens || info.last_token_usage.input_tokens || 0;
        out.ctx = { pct: (used / info.model_context_window) * 100, used, size: info.model_context_window };
      }
      const rl = p.rate_limits;
      if (rl) {
        for (const w of [rl.primary, rl.secondary]) {
          if (!w) continue;
          const v = limit(w.used_percent, w.resets_at);
          if (!v) continue;
          if (w.window_minutes && w.window_minutes <= 6 * 60) out.h5 = out.h5 || v;
          else if (w.window_minutes && w.window_minutes >= 6 * 24 * 60) out.wk = out.wk || v;
        }
      }
      if (info || rl) counted = true;
    }
    if (!turned && j.type === 'turn_context') {
      out.model = p.model || '';
      out.effort = p.effort || p.reasoning_effort || '';
      turned = true;
    }
    return counted && turned;
  });
  return out;
}

/** What the gauge of a tab running `agent` on session `id` shows (null when the session is not known yet). */
function usageFor(agent, cwd, id, files) {
  if (!id) return null;
  try {
    if (agent === 'codex') return codexUsage(files.codexFile(id));
    if (agent === 'claude') return claudeUsage(files.claudeFile(cwd, id), id);
  } catch { /* a file mid-write: next time */ }
  return null;
}

/* ---------------- the status line link (Claude Code) ---------------- */

/** settings.json as an object ({} when there is none), or null when it exists but cannot be read: never written then. */
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) { return e && e.code === 'ENOENT' ? {} : null; }
}
function writeSettings(s) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  const tmp = `${SETTINGS}.minsuterm.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  fs.renameSync(tmp, SETTINGS);
}
const isOurs = (sl) => !!(sl && typeof sl.command === 'string' && sl.command.includes(slash(BRIDGE)));
const bundledHash = () => { try { return crypto.createHash('sha1').update(fs.readFileSync(SOURCE)).digest('hex').slice(0, 12); } catch { return ''; } };

let nodeCheck = null;
/** A real Node on PATH (18+)? Otherwise MinsuTerm itself runs the script as Node, through a small wrapper. */
function hasNode() {
  if (!nodeCheck) {
    nodeCheck = new Promise((resolve) => {
      execFile(IS_WIN ? 'node.exe' : 'node', ['--version'], { timeout: 4000, windowsHide: true }, (err, out) => {
        const m = !err && /^v(\d+)\./.exec(String(out).trim());
        resolve(!!m && Number(m[1]) >= 18);
      });
    });
  }
  return nodeCheck;
}
async function nodeCommand() {
  if (await hasNode()) return 'node';
  const bin = path.join(DIR, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  if (IS_WIN) {
    const cmd = path.join(bin, 'mtnode.cmd');
    fs.writeFileSync(cmd, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
    return `"${slash(cmd)}"`;
  }
  const sh = path.join(bin, 'mtnode');
  fs.writeFileSync(sh, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`);
  fs.chmodSync(sh, 0o755);
  return `"${sh}"`;
}
function writeBridge() {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
  fs.writeFileSync(BRIDGE, fs.readFileSync(SOURCE));
  fs.writeFileSync(`${BRIDGE}.hash`, bundledHash());
}

/** Is the link in? Also whether settings.json can be read, and whether the user has a status line of their own. */
function linkState() {
  const s = readSettings();
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(PREV, 'utf8')).statusLine || null; } catch { /* none */ }
  const linked = !!s && isOurs(s.statusLine);
  return { linked, readable: s !== null, own: linked ? !!prev : !!(s && s.statusLine) };
}

/** Put the link in front of the user's own status line (kept in PREV and run after ours). */
async function link() {
  const s = readSettings();
  if (s === null) throw new Error('~/.claude/settings.json을 읽지 못해서 건드리지 않았어요');
  if (isOurs(s.statusLine)) { writeBridge(); return linkState(); }
  fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(BACKUP) && fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, BACKUP);
  fs.writeFileSync(PREV, `${JSON.stringify({ statusLine: s.statusLine || null, at: new Date().toISOString() }, null, 2)}\n`);
  writeBridge();
  const own = s.statusLine && typeof s.statusLine === 'object' ? s.statusLine : {};
  const keep = {};
  for (const k of ['padding', 'refreshInterval', 'hideVimModeIndicator']) if (own[k] !== undefined) keep[k] = own[k];
  s.statusLine = { type: 'command', command: `${await nodeCommand()} "${slash(BRIDGE)}"`, ...keep };
  writeSettings(s);
  return linkState();
}

/** Take the link out: the user's own status line goes back as it was (or none, if there was none). */
function unlink() {
  const s = readSettings();
  if (s === null) throw new Error('~/.claude/settings.json을 읽지 못해서 건드리지 않았어요');
  if (isOurs(s.statusLine)) {
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(PREV, 'utf8')).statusLine || null; } catch { /* none */ }
    if (prev) s.statusLine = prev;
    else delete s.statusLine;
    writeSettings(s);
  }
  try { fs.rmSync(PREV, { force: true }); } catch { /* ignore */ }
  return linkState();
}

/** On start: a linked bridge gets this version's script; usage copies older than two weeks go. */
function refreshBridge() {
  try {
    if (!linkState().linked) return;
    let have = '';
    try { have = fs.readFileSync(`${BRIDGE}.hash`, 'utf8').trim(); } catch { /* none */ }
    if (have !== bundledHash() || !fs.existsSync(BRIDGE)) writeBridge();
    const old = Date.now() - 14 * 864e5;
    for (const f of fs.readdirSync(USAGE_DIR)) {
      const p = path.join(USAGE_DIR, f);
      try { if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { force: true }); } catch { /* ignore */ }
    }
  } catch { /* never in the way of starting */ }
}

module.exports = { usageFor, linkState, link, unlink, refreshBridge };
