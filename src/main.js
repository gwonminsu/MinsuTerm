'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, clipboard, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const pty = require('@lydell/node-pty');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

app.setAppUserModelId('com.minsu.minsuterm');
/** The application menu (macOS only; built when the app is ready and again when the language changes). */
function buildMenu() {
  if (!IS_MAC) { Menu.setApplicationMenu(null); return; }
  // macOS needs an application menu: it owns ⌘C / ⌘V / ⌘Q / ⌘W / ⌘M and the window menu
  // copy / paste / select-all go to the renderer: a terminal's selection isn't a DOM selection
  const edit = (cmd) => () => { if (win && !win.isDestroyed()) win.webContents.send('menu:edit', cmd); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: T('편집'),
      submenu: [
        { role: 'undo', label: T('실행 취소') }, { role: 'redo', label: T('다시 실행') }, { type: 'separator' },
        { role: 'cut', label: T('잘라내기') },
        { label: T('복사'), accelerator: 'Cmd+C', click: edit('copy') },
        { label: T('붙여넣기'), accelerator: 'Cmd+V', click: edit('paste') },
        { label: T('모두 선택'), accelerator: 'Cmd+A', click: edit('selectAll') },
      ],
    },
    { label: T('보기'), submenu: [{ role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

// Test harness (development only): MT_TEST=<dir> uses an isolated profile and writes screenshots there.
const TEST_DIR = process.env.MT_TEST || '';
if (TEST_DIR) app.setPath('userData', path.join(TEST_DIR, 'profile'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const ICON = path.join(__dirname, 'assets', 'icon.png');
const STORE_FILE = path.join(app.getPath('userData'), 'minsuterm.json');
const HOME = os.homedir();

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_STORE = {
  projects: [],
  tasks: [], // agent work items: { id, agent, path, text, status, start, end, sessionId }
  layout: { tabs: [], active: 0 },
  window: { width: 1280, height: 820, maximized: false },
  settings: {
    fontSize: 14,
    fontFamily: IS_MAC
      ? "'SF Mono', Menlo, 'D2Coding', 'Apple SD Gothic Neo', monospace"
      : "'Cascadia Mono', 'Cascadia Code', 'D2Coding', Consolas, 'Malgun Gothic', monospace",
    lineHeight: 1.15,
    restoreSessions: true,
    notifications: true,
    confirmClose: true,
    defaultShell: IS_MAC ? 'zsh' : 'cmd',
    claudeArgs: '',
    codexArgs: '',
    sidebarVisible: true,
    sidebarWidth: 252,
    cursorBlink: true,
    // appearance
    lang: 'auto', // auto | ko | en | ja | zh
    theme: 'minsu',
    appearance: 'dark', // dark | light | system (follows Windows / macOS)
    themeLight: 'minsuLight', // terminal text colours used in light mode
    accent: 'violet',
    bgEffect: 'none', // none | acrylic | mica
    bgOpacity: 0.82,
    cursorStyle: 'bar', // bar-thin | bar | bar-thick | block | underline
    cursorColor: 'theme', // theme | accent | white
    letterSpacing: 0,
    uiZoom: 1,
    typingFx: 'none', // none | glow | ripple | particles
    typingFxIntensity: 1, // 0.3 .. 2
    bgAnim: 'none', // none | stars | aurora | rain | snow | grid | network
    bgAnimLevel: 0.6,
    celebrate: true,
    crt: false,
    bgImage: false, // a copy lives in the profile folder
    bgImageDim: 0.55,
    bgImageBlur: 0,
    workGlow: true,
    workGlowStyle: 'orbit',
    choiceBubble: 'classic', // 선택 대기 말풍선 style
    promptStyle: 'default', // default | none | subtle | accent | accentText
    hideDarkBg: true,
    celebrateStyle: 'party',
    // 작업 완료 텍스트: one of these phrases appears over the screen when a task finishes
    doneText: false,
    doneTexts: ['수고했어요! 🎉', '완료! 멋져요 ✨', '오늘도 한 건 해냈다', '굿잡 👍', '다음 거 가자!'],
    doneTextStyle: 'pop',
    doneTextFont: 'ui',
    doneTextSize: 48,
    doneTextPos: 'center',
    doneTextTime: 3,
    typingSound: 'none', // none | mech | type | bubble | soft
    typingVolume: 0.4,
  },
};

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      ...DEFAULT_STORE,
      ...raw,
      settings: { ...DEFAULT_STORE.settings, ...(raw.settings || {}) },
      layout: { ...DEFAULT_STORE.layout, ...(raw.layout || {}) },
      window: { ...DEFAULT_STORE.window, ...(raw.window || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STORE));
  }
}

let store = loadStore();

/* i18n for the few strings the main process shows itself (menus, dialogs). Korean is the source. */
const I18N = {};
for (const l of ['en', 'ja', 'zh']) { try { I18N[l] = require(path.join(__dirname, 'i18n', `${l}.json`)); } catch { /* not built */ } }
function uiLang() {
  const pref = store.settings?.lang || 'auto';
  if (pref !== 'auto') return pref;
  const loc = (app.getLocale() || 'ko').toLowerCase();
  return loc.startsWith('ko') ? 'ko' : loc.startsWith('ja') ? 'ja' : loc.startsWith('zh') ? 'zh' : 'en';
}
function T(s) {
  const d = I18N[uiLang()];
  if (!d) return s;
  const vals = [];
  const key = String(s).replace(/\s+/g, ' ').trim().replace(/\d+(\.\d+)?/g, (m) => { vals.push(m); return '#'; });
  const hit = d[key];
  if (hit == null) return s;
  let i = 0;
  return hit.replace(/#/g, () => (i < vals.length ? vals[i++] : '#'));
}
nativeTheme.themeSource = ['light', 'dark', 'system'].includes(store.settings?.appearance) ? store.settings.appearance : 'dark';
let saveTimer = null;

function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStoreNow, 250);
}

function saveStoreNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error('store save failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function detectShells() {
  if (!IS_WIN) {
    const list = [
      { id: 'zsh', name: 'zsh', type: 'zsh', file: '/bin/zsh' },
      { id: 'bash', name: 'bash', type: 'bash', file: '/bin/bash' },
      { id: 'fish', name: 'fish', type: 'fish', file: ['/opt/homebrew/bin/fish', '/usr/local/bin/fish', '/usr/bin/fish'].find(exists) || '' },
    ].filter((s) => s.file && exists(s.file));
    // the user's login shell first
    const login = process.env.SHELL && list.find((s) => s.file === process.env.SHELL);
    return login ? [login, ...list.filter((s) => s !== login)] : list;
  }
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const shells = [
    { id: 'cmd', name: '명령 프롬프트', type: 'cmd', file: path.join(sys, 'System32', 'cmd.exe') },
    { id: 'powershell', name: 'PowerShell', type: 'ps', file: path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') },
  ];
  const pwsh = path.join(pf, 'PowerShell', '7', 'pwsh.exe');
  if (exists(pwsh)) shells.push({ id: 'pwsh', name: 'PowerShell 7', type: 'ps', file: pwsh });
  const gitBash = [path.join(pf, 'Git', 'bin', 'bash.exe'), path.join(process.env['ProgramFiles(x86)'] || '', 'Git', 'bin', 'bash.exe')].find(exists);
  if (gitBash) shells.push({ id: 'gitbash', name: 'Git Bash', type: 'bash', file: gitBash });
  const wsl = path.join(sys, 'System32', 'wsl.exe');
  if (exists(wsl)) shells.push({ id: 'wsl', name: 'WSL', type: 'wsl', file: wsl });
  return shells;
}

const SHELLS = detectShells();

/* ------------------------------------------------------------------ */
/* Agent launch commands                                               */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ARGS_RE = /^[\w\s.\-=:,/@[\]"']*$/;

/** spec: { type: 'claude'|'codex', mode: 'new'|'continue'|'pick'|'resume', sessionId, permissionMode } */
function agentCommand(a) {
  if (!a || (a.type !== 'claude' && a.type !== 'codex')) return '';
  const parts = [];
  const id = UUID_RE.test(String(a.sessionId || '')) ? a.sessionId : '';
  if (a.type === 'claude') {
    parts.push('claude');
    if (a.mode === 'continue') parts.push('--continue');
    else if (a.mode === 'pick') parts.push('--resume');
    else if (a.mode === 'resume' && id) parts.push('--resume', id);
    else if (id) parts.push('--session-id', id);
    if (a.permissionMode && /^[a-zA-Z]+$/.test(a.permissionMode)) parts.push('--permission-mode', a.permissionMode);
    const extra = (store.settings.claudeArgs || '').trim();
    if (extra && SAFE_ARGS_RE.test(extra)) parts.push(extra);
  } else {
    parts.push('codex');
    if (a.mode === 'continue') parts.push('resume', '--last');
    else if (a.mode === 'pick') parts.push('resume');
    else if (a.mode === 'resume' && id) parts.push('resume', id);
    const extra = (store.settings.codexArgs || '').trim();
    if (extra && SAFE_ARGS_RE.test(extra)) parts.push(extra);
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* PTY management                                                      */
/* ------------------------------------------------------------------ */

const ptys = new Map(); // id -> { p, pid, agent }
const outBuffers = new Map();
let flushTimer = null;
let win = null;
let runningCount = 0;
let forceClose = false;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function flushOutput() {
  flushTimer = null;
  for (const [id, data] of outBuffers) send('pty:data', id, data);
  outBuffers.clear();
}

function resolveCwd(cwd) {
  if (cwd && exists(cwd)) return cwd;
  return HOME;
}

// Emits OSC 9;9 (current directory) from each shell prompt so the UI always knows the real cwd.
const PS_PROMPT_HOOK = "$global:__mtPrompt = $function:prompt; function global:prompt { $e = [char]27; $loc = $executionContext.SessionState.Path.CurrentLocation.ProviderPath; \"$e]9;9;$loc$e\\\" + (& $global:__mtPrompt) }";

/*
 * macOS / Linux shells: load the user's own startup files untouched, then add a tiny hook that
 * reports the current directory (OSC 9;9) at every prompt. zsh via a wrapper ZDOTDIR, bash via --rcfile.
 */
const OSC_CWD_SH = 'printf "\\033]9;9;%s\\033\\\\" "$PWD"';
function shellIntegrationDir() {
  const dir = path.join(app.getPath('userData'), 'shell');
  const zdir = path.join(dir, 'zsh');
  try {
    fs.mkdirSync(zdir, { recursive: true });
    const src = (f) => `[ -f "\${MT_USER_ZDOTDIR:-$HOME}/${f}" ] && ZDOTDIR="\${MT_USER_ZDOTDIR:-$HOME}" . "\${MT_USER_ZDOTDIR:-$HOME}/${f}"\n`;
    fs.writeFileSync(path.join(zdir, '.zshenv'), src('.zshenv'));
    fs.writeFileSync(path.join(zdir, '.zprofile'), src('.zprofile'));
    fs.writeFileSync(path.join(zdir, '.zshrc'),
      `${src('.zshrc')}__mt_cwd() { ${OSC_CWD_SH}; }\nautoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __mt_cwd || precmd_functions+=(__mt_cwd)\n`);
    fs.writeFileSync(path.join(zdir, '.zlogin'), `${src('.zlogin')}ZDOTDIR="\${MT_USER_ZDOTDIR:-$HOME}"\n`);
    fs.writeFileSync(path.join(dir, 'bashrc'),
      `if [ -f ~/.bash_profile ]; then . ~/.bash_profile; elif [ -f ~/.profile ]; then . ~/.profile; fi\n[ -f ~/.bashrc ] && . ~/.bashrc\n__mt_cwd() { ${OSC_CWD_SH}; }\nPROMPT_COMMAND="__mt_cwd\${PROMPT_COMMAND:+; $PROMPT_COMMAND}"\n`);
  } catch { /* integration is optional */ }
  return dir;
}

/** spec: { id, shellId, cwd, agent, cols, rows } */
function spawnPty(spec) {
  const sh = SHELLS.find((s) => s.id === spec.shellId) || SHELLS.find((s) => s.id === store.settings.defaultShell) || SHELLS[0];
  const cwd = resolveCwd(spec.cwd);
  const initCmd = agentCommand(spec.agent);
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'MinsuTerm',
    MINSUTERM: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  // never leak an outer agent session into the user's shells
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k.startsWith('CODEX_') || k.startsWith('MT_TEST')) delete env[k];
  }

  let args = [];
  let writeLater = '';
  if (!IS_WIN) {
    env.LANG = env.LANG || 'ko_KR.UTF-8'; // apps launched from Finder get no locale: keep Korean text intact
    const integ = shellIntegrationDir();
    if (sh.type === 'zsh') {
      if (process.env.ZDOTDIR) env.MT_USER_ZDOTDIR = process.env.ZDOTDIR;
      env.ZDOTDIR = path.join(integ, 'zsh');
      args = ['-l'];
    } else if (sh.type === 'bash') {
      args = ['--rcfile', path.join(integ, 'bashrc'), '-i'];
    } else if (sh.type === 'fish') {
      args = ['-l', '-C', `function __mt_cwd --on-event fish_prompt; printf "\\e]9;9;%s\\e\\\\" "$PWD"; end`];
    } else {
      args = ['-l'];
    }
    writeLater = initCmd;
  } else if (sh.type === 'cmd') {
    env.PROMPT = '$E]9;9;$P$E\\' + (process.env.PROMPT || '$P$G');
    args = initCmd ? ['/K', initCmd] : [];
  } else if (sh.type === 'ps') {
    args = ['-NoLogo', '-NoExit', '-Command', initCmd ? `${PS_PROMPT_HOOK}; ${initCmd}` : PS_PROMPT_HOOK];
  } else if (sh.type === 'bash') {
    env.PROMPT_COMMAND = 'printf "\\e]9;9;%s\\e\\\\" "$(cygpath -w "$PWD")"';
    args = ['--login', '-i'];
    writeLater = initCmd;
  } else {
    writeLater = initCmd;
  }

  const p = pty.spawn(sh.file, args, {
    name: 'xterm-256color',
    cols: Math.max(2, spec.cols | 0 || 80),
    rows: Math.max(2, spec.rows | 0 || 24),
    cwd,
    env,
    ...(IS_WIN ? { useConpty: true } : {}),
  });

  const rec = { p, pid: p.pid, agent: null };
  ptys.set(spec.id, rec);
  p.onData((data) => {
    outBuffers.set(spec.id, (outBuffers.get(spec.id) || '') + data);
    if (!flushTimer) flushTimer = setTimeout(flushOutput, 6);
  });
  p.onExit(({ exitCode }) => {
    flushOutput();
    ptys.delete(spec.id);
    send('pty:exit', spec.id, exitCode);
  });
  if (writeLater) setTimeout(() => { try { p.write(writeLater + '\r'); } catch { /* ignore */ } }, 700);
  if (initCmd) scheduleProbe(900, 2200, 4000);

  return { pid: p.pid, cwd, shellId: sh.id };
}

function killAll() {
  for (const { p } of ptys.values()) {
    try { p.kill(); } catch { /* ignore */ }
  }
  ptys.clear();
}

/* ------------------------------------------------------------------ */
/* Agent detection: watch each shell's process tree for claude / codex */
/* ------------------------------------------------------------------ */

const PROBE_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'while ($true) {',
  '  $line = [Console]::In.ReadLine()',
  '  if ($null -eq $line) { break }',
  '  foreach ($p in (Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine)) {',
  '    $c = ""',
  '    if ($p.Name -eq "node.exe" -or $p.Name -eq "bun.exe") { $c = [string]$p.CommandLine; $c = $c -replace "[\\r\\n\\t]", " " }',
  '    [Console]::Out.WriteLine("$($p.ProcessId)`t$($p.ParentProcessId)`t$($p.Name)`t$c")',
  '  }',
  '  [Console]::Out.WriteLine("<<END>>")',
  '  [Console]::Out.Flush()',
  '}',
].join('\n');

let probe = null;
let probeBuf = '';
let probeBusy = false;
let probeTimer = null;

function startProbe() {
  if (probe) return;
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const encoded = Buffer.from(PROBE_SCRIPT, 'utf16le').toString('base64');
  probe = spawn(path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  probe.stdout.setEncoding('utf8');
  probe.stdout.on('data', (d) => {
    probeBuf += d;
    const end = probeBuf.indexOf('<<END>>');
    if (end >= 0) {
      const snap = probeBuf.slice(0, end);
      probeBuf = probeBuf.slice(end + 7);
      probeBusy = false;
      analyze(snap);
    }
  });
  probe.on('exit', () => { probe = null; probeBusy = false; probeBuf = ''; });
}

function classify(name, cmdline) {
  const n = name.toLowerCase().replace(/\.exe$/, ''); // Windows: claude.exe · macOS: claude
  if (n === 'claude') return 'claude';
  if (n === 'codex') return 'codex';
  // macOS native installs run a versioned binary (…/claude/versions/2.0.14): look at the command name too
  const argv0 = path.basename(String(cmdline || '').trim().split(/\s+/)[0] || '').toLowerCase();
  if (argv0 === 'claude') return 'claude';
  if (argv0 === 'codex') return 'codex';
  if (n === 'node' || n === 'bun') {
    const c = cmdline.toLowerCase();
    if (/@anthropic-ai[\\/]claude-code|claude-code[\\/]cli/.test(c)) return 'claude';
    if (/@openai[\\/]codex|[\\/]codex\.js/.test(c)) return 'codex';
  }
  return null;
}

function analyze(snap) {
  const children = new Map();
  const info = new Map();
  for (const line of snap.split(/\r?\n/)) {
    if (!line) continue;
    const [pid, ppid, name, cmd = ''] = line.split('\t');
    const id = Number(pid);
    const pp = Number(ppid);
    if (!id) continue;
    info.set(id, { name: name || '', cmd });
    if (!children.has(pp)) children.set(pp, []);
    children.get(pp).push(id);
  }
  for (const [tabId, rec] of ptys) {
    let found = null;
    const root = rec.p.pid || rec.pid; // ConPTY assigns the pid asynchronously
    if (!root) continue;
    const stack = [...(children.get(root) || [])];
    const seen = new Set();
    while (stack.length && !found) {
      const id = stack.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const it = info.get(id);
      if (it) found = classify(it.name, it.cmd);
      if (!found) stack.push(...(children.get(id) || []));
    }
    if (found !== rec.agent) {
      rec.agent = found;
      send('pty:agent', tabId, found);
    }
  }
}

/** macOS / Linux: one `ps` snapshot, in the same "pid ppid name cmd" shape the analyser reads. */
function runPsProbe() {
  if (probeBusy) return;
  probeBusy = true;
  execFile('/bin/ps', ['-axo', 'pid=,ppid=,ucomm=,args='], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    probeBusy = false;
    if (err) return;
    const rows = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
      if (m) rows.push(`${m[1]}\t${m[2]}\t${m[3]}\t${m[4].replace(/\t/g, ' ')}`);
    }
    analyze(rows.join('\n'));
  });
}

function runProbe() {
  if (!ptys.size) return;
  if (!IS_WIN) return runPsProbe();
  startProbe();
  if (!probe || probeBusy) return;
  probeBusy = true;
  try { probe.stdin.write('x\n'); } catch { probeBusy = false; }
}

/**
 * Process-tree queries cost ~200 ms of WMI time, so they only run on demand:
 * a burst after `claude` / `codex` is entered, a check when a shell prompt
 * reappears in an agent tab, and a slow safety net for anything missed.
 */
const probeTimers = new Set();
function scheduleProbe(...delays) {
  for (const ms of delays.flat()) {
    const t = setTimeout(() => { probeTimers.delete(t); runProbe(); }, ms);
    probeTimers.add(t);
  }
}
void probeTimer;

setInterval(runProbe, 10000);

/* ------------------------------------------------------------------ */
/* Session history: Claude (~/.claude/projects) and Codex (~/.codex)   */
/* ------------------------------------------------------------------ */

const CLAUDE_PROJECTS = path.join(HOME, '.claude', 'projects');
const CODEX_HOME = path.join(HOME, '.codex');
const parseCache = new Map(); // file -> { mtimeMs, info }

const normPath = (p) => {
  let r = path.resolve(String(p || ''));
  if (r.length > 3) r = r.replace(/[\\/]+$/, '');
  return r;
};
const samePath = (a, b) => normPath(a).toLowerCase() === normPath(b).toLowerCase();

function claudeDirFor(cwd) {
  return path.join(CLAUDE_PROJECTS, normPath(cwd).replace(/[^A-Za-z0-9]/g, '-'));
}

function readHead(file, size, max) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, max);
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, 0);
    let tail = '';
    if (size > max * 2) {
      const tb = Buffer.alloc(max);
      const tn = fs.readSync(fd, tb, 0, max, size - max);
      tail = '\n' + tb.toString('utf8', 0, tn);
    } else if (size > max) {
      const rest = Buffer.alloc(size - max);
      const rn = fs.readSync(fd, rest, 0, size - max, max);
      tail = rest.toString('utf8', 0, rn);
    }
    return buf.toString('utf8', 0, n) + tail;
  } finally {
    fs.closeSync(fd);
  }
}

function cleanText(text) {
  return String(text || '').replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cached(file, stat, parse) {
  const c = parseCache.get(file);
  if (c && c.mtimeMs === stat.mtimeMs) return c.info;
  let info = null;
  try { info = parse(file, stat); } catch { info = null; }
  parseCache.set(file, { mtimeMs: stat.mtimeMs, info });
  return info;
}

/* Claude */

function parseClaude(file, stat) {
  const text = readHead(file, stat.size, 512 * 1024);
  let customTitle = '';
  let aiTitle = '';
  let lastPrompt = '';
  let firstPrompt = '';
  let messages = 0;
  let branch = '';
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'custom-title' && o.customTitle) customTitle = o.customTitle;
    else if (o.type === 'ai-title' && o.aiTitle) aiTitle = o.aiTitle;
    else if (o.type === 'last-prompt' && o.lastPrompt) lastPrompt = o.lastPrompt;
    else if (o.type === 'assistant') messages++;
    else if (o.type === 'user' && !o.isMeta && !o.isSidechain) {
      messages++;
      if (o.gitBranch) branch = o.gitBranch;
      if (!firstPrompt && o.message && typeof o.message.content === 'string') {
        const t = cleanText(o.message.content);
        if (t && !t.startsWith('/') && !t.startsWith('Caveat:')) firstPrompt = t;
      }
    }
  }
  const title = customTitle || aiTitle || firstPrompt || cleanText(lastPrompt);
  if (!messages) return null; // metadata only (e.g. opened and closed without a prompt): claude --resume rejects it
  return {
    agent: 'claude',
    id: path.basename(file, '.jsonl'),
    title: (title || '(제목 없음)').slice(0, 140),
    lastPrompt: cleanText(lastPrompt).slice(0, 200),
    branch,
    mtime: stat.mtimeMs,
  };
}

function claudeFiles(cwd) {
  const dir = claudeDirFor(cwd);
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { return []; }
  const out = [];
  for (const n of names) {
    const file = path.join(dir, n);
    try { out.push({ file, stat: fs.statSync(file), id: n.slice(0, -6) }); } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

/* Codex */

function codexFiles(maxDays = 120) {
  const root = path.join(CODEX_HOME, 'sessions');
  const out = [];
  const cutoff = Date.now() - maxDays * 86400000;
  const walk = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= cutoff) out.push({ file: full, stat });
        } catch { /* ignore */ }
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

let codexIndex = { mtimeMs: 0, map: new Map() };
function codexTitles() {
  const file = path.join(CODEX_HOME, 'session_index.jsonl');
  try {
    const st = fs.statSync(file);
    if (st.mtimeMs === codexIndex.mtimeMs) return codexIndex.map;
    const map = new Map();
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try { const o = JSON.parse(line); if (o.id && o.thread_name) map.set(o.id, o.thread_name); } catch { /* ignore */ }
    }
    codexIndex = { mtimeMs: st.mtimeMs, map };
    return map;
  } catch {
    return codexIndex.map;
  }
}

function parseCodex(file, stat) {
  const text = readHead(file, stat.size, 256 * 1024);
  let id = '';
  let cwd = '';
  let firstPrompt = '';
  let branch = '';
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    if (id && firstPrompt) break;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const pl = o.payload || {};
    if (o.type === 'session_meta') {
      id = pl.id || pl.session_id || id;
      cwd = pl.cwd || cwd;
      if (pl.git && pl.git.branch) branch = pl.git.branch;
    } else if (!firstPrompt && o.type === 'event_msg' && pl.type === 'user_message' && pl.message) {
      firstPrompt = cleanText(pl.message);
    } else if (!firstPrompt && o.type === 'response_item' && pl.type === 'message' && pl.role === 'user' && Array.isArray(pl.content)) {
      const t = cleanText(pl.content.map((c) => c.text || '').join(' '));
      if (t && !t.startsWith('<') && !/^#\s*AGENTS\.md/i.test(t)) firstPrompt = t;
    }
  }
  if (!id) {
    const m = path.basename(file).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
    if (m) id = m[1];
  }
  if (!id) return null;
  return { agent: 'codex', id, cwd, firstPrompt: firstPrompt.slice(0, 200), branch, mtime: stat.mtimeMs };
}

function codexSessionsFor(cwd, limit) {
  const titles = codexTitles();
  const out = [];
  let scanned = 0;
  for (const { file, stat } of codexFiles()) {
    if (out.length >= limit || scanned > 600) break;
    scanned++;
    const info = cached(file, stat, parseCodex);
    if (!info || !samePath(info.cwd, cwd)) continue;
    out.push({
      agent: 'codex',
      id: info.id,
      title: (titles.get(info.id) || info.firstPrompt || '(제목 없음)').slice(0, 140),
      lastPrompt: info.firstPrompt,
      branch: info.branch,
      mtime: stat.mtimeMs,
    });
  }
  return out;
}

function listSessions(cwd, limit = 40) {
  const claude = [];
  for (const { file, stat } of claudeFiles(cwd)) {
    if (claude.length >= limit) break;
    const info = cached(file, stat, parseClaude);
    if (info) claude.push(info);
  }
  const codex = codexSessionsFor(cwd, limit);
  return [...claude, ...codex].sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

/** Session ids in cwd written since a timestamp, newest first (follows --continue, /resume, /clear). */
function recentSessions(agent, cwd, sinceMs) {
  if (agent === 'claude') {
    return claudeFiles(cwd).filter((x) => x.stat.mtimeMs >= sinceMs).map((x) => x.id);
  }
  if (agent === 'codex') {
    const out = [];
    for (const { file, stat } of codexFiles(3)) {
      if (stat.mtimeMs < sinceMs) break;
      const info = cached(file, stat, parseCodex);
      if (info && samePath(info.cwd, cwd)) out.push(info.id);
    }
    return out;
  }
  return [];
}

function hasSession(agent, cwd, id) {
  if (!UUID_RE.test(String(id || ''))) return false;
  if (agent === 'claude') {
    const file = path.join(claudeDirFor(cwd), `${id}.jsonl`);
    if (!exists(file)) return false;
    try { return !!cached(file, fs.statSync(file), parseClaude); } catch { return false; }
  }
  if (agent === 'codex') return codexFiles().some(({ file }) => file.toLowerCase().includes(id.toLowerCase()));
  return false;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:init', () => ({
  store,
  shells: SHELLS.map(({ id, name, type }) => ({ id, name, type })),
  home: HOME,
  version: app.getVersion(),
}));

ipcMain.handle('pty:create', (_e, spec) => {
  try {
    return { ok: true, ...spawnPty(spec) };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
ipcMain.on('pty:write', (_e, id, data) => { const r = ptys.get(id); if (r) r.p.write(data); });
ipcMain.on('pty:resize', (_e, id, cols, rows) => {
  const r = ptys.get(id);
  if (r && cols > 1 && rows > 1) { try { r.p.resize(cols, rows); } catch { /* ignore */ } }
});
ipcMain.on('pty:kill', (_e, id) => {
  const r = ptys.get(id);
  if (r) { try { r.p.kill(); } catch { /* ignore */ } ptys.delete(id); }
});
ipcMain.on('agent:probe', (_e, delays) => {
  const list = Array.isArray(delays) ? delays.filter((d) => Number.isFinite(d) && d >= 0 && d < 20000).slice(0, 5) : [450];
  scheduleProbe(list.length ? list : [450]);
});

ipcMain.handle('agent:sessions', (_e, cwd, limit) => listSessions(cwd, limit));
ipcMain.handle('agent:recent', (_e, agent, cwd, sinceMs) => recentSessions(agent, cwd, sinceMs));
ipcMain.handle('agent:has', (_e, agent, cwd, id) => hasSession(agent, cwd, id));

/** The most recent prompt the user sent in a session (used to title a finished task). */
function lastPrompt(agent, cwd, id) {
  if (!UUID_RE.test(String(id || ''))) return '';
  let file = '';
  if (agent === 'claude') file = path.join(claudeDirFor(cwd), `${id}.jsonl`);
  else if (agent === 'codex') file = (codexFiles(30).find(({ file: f }) => path.basename(f).toLowerCase().includes(id.toLowerCase())) || {}).file || '';
  if (!file || !exists(file)) return '';
  try {
    const size = fs.statSync(file).size;
    const CH = 384 * 1024;
    const fd = fs.openSync(file, 'r');
    const len = Math.min(size, CH);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      if (!line || line[0] !== '{') continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (agent === 'claude' && o.type === 'user' && !o.isMeta && !o.isSidechain && o.message && typeof o.message.content === 'string') {
        const t = cleanText(o.message.content);
        if (t && !t.startsWith('Caveat:')) return t.slice(0, 300);
      }
      if (agent === 'codex' && o.type === 'event_msg' && o.payload && o.payload.type === 'user_message' && o.payload.message) {
        return cleanText(o.payload.message).slice(0, 300);
      }
    }
  } catch { /* ignore */ }
  return '';
}
ipcMain.handle('agent:lastPrompt', (_e, agent, cwd, id) => lastPrompt(agent, cwd, id));

/**
 * Has the agent finished its current turn? Read from the transcript tail, so it works even when the
 * agent keeps redrawing its UI after finishing. → 'done' | 'working' | 'unknown'
 */
function turnState(agent, cwd, id) {
  if (!UUID_RE.test(String(id || ''))) return 'unknown';
  let file = '';
  if (agent === 'claude') file = path.join(claudeDirFor(cwd), `${id}.jsonl`);
  else if (agent === 'codex') file = (codexFiles(30).find(({ file: f }) => path.basename(f).toLowerCase().includes(id.toLowerCase())) || {}).file || '';
  if (!file || !exists(file)) return 'unknown';
  try {
    const size = fs.statSync(file).size;
    const len = Math.min(size, 256 * 1024);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      if (!line || line[0] !== '{') continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (agent === 'claude') {
        if (o.isSidechain) continue;
        if (o.type === 'system' && o.subtype === 'turn_duration') return 'done';
        if (o.type === 'assistant') return o.message && o.message.stop_reason === 'end_turn' ? 'done' : 'working';
        if (o.type === 'user') return 'working'; // a prompt or tool result waiting for the model
      } else if (o.type === 'event_msg' && o.payload) {
        if (o.payload.type === 'task_complete' || o.payload.type === 'turn_aborted') return 'done';
        if (o.payload.type === 'task_started') return 'working';
      }
    }
  } catch { /* ignore */ }
  return 'unknown';
}
/**
 * Sub-agents the agent launched in the current turn, read from its transcript (newest 1 MB).
 *  Claude: an Agent / Task tool call (subagent_type + a short description). It ends with its tool result —
 *          unless it was launched in the background (isAsync), then with a <task-notification> naming it.
 *  Codex:  SubAgentActivity items (kind started / completed) with an agent_path like "/root/list_files".
 * → [{ id, kind, name, status: 'running' | 'done' | 'failed', start }]
 */
function subagents(agent, cwd, id, since = 0) {
  if (!UUID_RE.test(String(id || ''))) return [];
  let file = '';
  if (agent === 'claude') file = path.join(claudeDirFor(cwd), `${id}.jsonl`);
  else if (agent === 'codex') file = (codexFiles(30).find(({ file: f }) => path.basename(f).toLowerCase().includes(String(id).toLowerCase())) || {}).file || '';
  if (!file || !exists(file)) return [];
  const map = new Map();
  try {
    const size = fs.statSync(file).size;
    const len = Math.min(size, 1024 * 1024);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line || line[0] !== '{') continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(o.timestamp || '') || 0;
      if (agent === 'claude') {
        if (o.isSidechain) continue;
        // a background sub-agent finishing: <task-notification> … <tool-use-id>X</tool-use-id> … <status>S</status>,
        // recorded as a queued message (queue-operation) and/or a user message — read it from any entry
        if (line.includes('task-notification')) {
          const re = /<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]*?<status>([^<]+)<\/status>/g;
          let m;
          while ((m = re.exec(line))) if (map.has(m[1])) map.get(m[1]).status = m[2] === 'completed' ? 'done' : 'failed';
        }
        const content = o.message && o.message.content;
        if (o.type === 'assistant' && Array.isArray(content)) {
          if (ts && ts < since) continue;
          for (const p of content) {
            if (p.type === 'tool_use' && (p.name === 'Agent' || p.name === 'Task')) {
              const inp = p.input || {};
              map.set(p.id, { id: p.id, kind: inp.subagent_type || 'agent', name: String(inp.description || '').slice(0, 60), status: 'running', start: ts });
            }
          }
        } else if (o.type === 'user') {
          const parts = Array.isArray(content) ? content : [{ type: 'text', text: typeof content === 'string' ? content : '' }];
          for (const p of parts) {
            if (p.type === 'tool_result' && map.has(p.tool_use_id)) {
              const r = o.toolUseResult || {};
              if (!r.isAsync) map.get(p.tool_use_id).status = p.is_error ? 'failed' : 'done';
            }
            const txt = p.type === 'text' ? String(p.text || '') : '';
            if (txt.includes('<task-notification>')) {
              const tid = (/<tool-use-id>([^<]+)<\/tool-use-id>/.exec(txt) || [])[1];
              const st = (/<status>([^<]+)<\/status>/.exec(txt) || [])[1] || 'completed';
              if (tid && map.has(tid)) map.get(tid).status = st === 'completed' ? 'done' : 'failed';
            }
          }
        }
      } else if (o.type === 'event_msg' && o.payload && o.payload.type === 'item_completed') {
        const it = o.payload.item || {};
        if (it.type !== 'SubAgentActivity' || !it.agent_thread_id) continue;
        const key = it.agent_thread_id;
        if (it.kind === 'started') {
          if (ts && ts < since) continue;
          const nm = String(it.agent_path || '').split('/').filter(Boolean).pop() || 'agent';
          map.set(key, { id: key, kind: nm.replace(/[_-]+/g, ' '), name: '', status: 'running', start: ts });
        } else if (map.has(key)) {
          map.get(key).status = it.kind === 'completed' ? 'done' : 'failed';
        }
      }
    }
  } catch { /* ignore */ }
  return [...map.values()].slice(-12);
}
ipcMain.handle('agent:subagents', (_e, agent, cwd, id, since) => subagents(agent, cwd, id, since));

ipcMain.handle('agent:turn', (_e, agent, cwd, id) => {
  const state = turnState(agent, cwd, id);
  let mtime = 0;
  try {
    const f = agent === 'claude' ? path.join(claudeDirFor(cwd), `${id}.jsonl`) : (codexFiles(30).find(({ file }) => path.basename(file).toLowerCase().includes(String(id).toLowerCase())) || {}).file;
    if (f) mtime = fs.statSync(f).mtimeMs;
  } catch { /* ignore */ }
  return { state, mtime };
});

/** Move a conversation's transcript to the Recycle Bin (recoverable). */
/* ------------------------------------------------------------------ */
/* MinsuTerm trash: deleted conversations wait here to be restored or   */
/* permanently deleted (never the Windows Recycle Bin)                  */
/* ------------------------------------------------------------------ */

const TRASH_DIR = path.join(app.getPath('userData'), 'trash');
const TRASH_INDEX = path.join(TRASH_DIR, 'index.json');

function readTrash() {
  try { return JSON.parse(fs.readFileSync(TRASH_INDEX, 'utf8')); } catch { return []; }
}
function writeTrash(list) {
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  fs.writeFileSync(TRASH_INDEX, JSON.stringify(list, null, 2), 'utf8');
}
function movePath(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); } catch {
    fs.cpSync(from, to, { recursive: true }); // different drive: copy, then remove
    fs.rmSync(from, { recursive: true, force: true });
  }
}

function sessionFiles(agent, cwd, id) {
  const targets = [];
  if (agent === 'claude') {
    const dir = claudeDirFor(cwd);
    const file = path.join(dir, `${id}.jsonl`);
    if (exists(file)) targets.push(file);
    const sub = path.join(dir, id); // per-session side data (subagents, tool results)
    if (exists(sub)) targets.push(sub);
  } else if (agent === 'codex') {
    for (const { file } of codexFiles(3650)) {
      if (path.basename(file).toLowerCase().includes(id.toLowerCase())) targets.push(file);
    }
  }
  return targets;
}

ipcMain.handle('trash:list', () => readTrash().sort((a, b) => b.deletedAt - a.deletedAt));

ipcMain.handle('trash:restore', (_e, entryId) => {
  const list = readTrash();
  const entry = list.find((x) => x.id === entryId);
  if (!entry) return { ok: false, error: '항목이 없습니다' };
  try {
    for (const f of entry.files) {
      if (exists(f.from)) return { ok: false, error: `같은 이름의 파일이 이미 있습니다: ${path.basename(f.from)}` };
    }
    for (const f of entry.files) if (exists(f.to)) movePath(f.to, f.from);
    fs.rmSync(path.join(TRASH_DIR, entry.id), { recursive: true, force: true });
    writeTrash(list.filter((x) => x !== entry));
    return { ok: true, entry };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('trash:purge', (_e, entryId) => {
  const list = readTrash();
  const gone = entryId === '*' ? list : list.filter((x) => x.id === entryId);
  for (const entry of gone) fs.rmSync(path.join(TRASH_DIR, entry.id), { recursive: true, force: true });
  writeTrash(entryId === '*' ? [] : list.filter((x) => x.id !== entryId));
  return { ok: true, count: gone.length };
});

ipcMain.handle('agent:delete', async (_e, agent, cwd, id, title) => {
  if (!UUID_RE.test(String(id || ''))) return { ok: false, error: '잘못된 세션 ID' };
  const files = sessionFiles(agent, cwd, id);
  if (!files.length) return { ok: false, error: '대화 파일을 찾지 못했습니다' };
  const entryId = `${Date.now()}-${id.slice(0, 8)}`;
  const moved = [];
  try {
    for (const from of files) {
      const to = path.join(TRASH_DIR, entryId, path.basename(from));
      movePath(from, to);
      parseCache.delete(from);
      moved.push({ from, to });
    }
    const list = readTrash();
    list.push({ id: entryId, agent, cwd, sessionId: id, title: String(title || '').slice(0, 200), deletedAt: Date.now(), files: moved });
    writeTrash(list);
    return { ok: true, count: moved.length };
  } catch (err) {
    for (const m of moved) { try { movePath(m.to, m.from); } catch { /* ignore */ } } // roll back
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.on('store:projects', (_e, projects) => { store.projects = projects; saveStore(); });
ipcMain.on('store:layout', (_e, layout) => { store.layout = layout; saveStore(); });
ipcMain.on('store:tasks', (_e, tasks) => { store.tasks = Array.isArray(tasks) ? tasks.slice(-400) : []; saveStore(); });
ipcMain.on('store:settings', (_e, settings) => { store.settings = { ...store.settings, ...settings }; saveStore(); });
ipcMain.on('app:running', (_e, n) => { runningCount = n | 0; });

let fontCache = null;
/**
 * Villager voices for the 마을 주민 typing sound, read from the user's own Minecraft: Java Edition install
 * (assets/indexes/*.json map sound names to hashed files in assets/objects). Nothing is bundled with MinsuTerm;
 * without Minecraft installed this returns null and the theme uses its synthesized voice.
 */
ipcMain.handle('sounds:minecraft', () => {
  try {
    const roots = IS_MAC ? [path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')]
      : IS_WIN ? [path.join(process.env.APPDATA || '', '.minecraft')] : [path.join(os.homedir(), '.minecraft')];
    for (const root of roots) {
      const idxDir = path.join(root, 'assets', 'indexes');
      if (!fs.existsSync(idxDir)) continue;
      const indexes = fs.readdirSync(idxDir).filter((f) => f.endsWith('.json'))
        .map((f) => path.join(idxDir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      for (const idx of indexes) {
        const objects = JSON.parse(fs.readFileSync(idx, 'utf8')).objects || {};
        const out = {};
        for (const [key, v] of Object.entries(objects)) {
          const m = /^minecraft\/sounds\/mob\/villager\/(idle\d|haggle\d|yes\d|no\d|death)\.ogg$/.exec(key);
          if (!m || !v.hash) continue;
          const file = path.join(root, 'assets', 'objects', v.hash.slice(0, 2), v.hash);
          if (fs.existsSync(file)) out[m[1]] = fs.readFileSync(file).toString('base64');
        }
        if (out.idle1 && out.yes1 && out.no1) return out;
      }
    }
  } catch { /* no Minecraft */ }
  return null;
});

ipcMain.handle('fonts:list', () => {
  if (fontCache) return fontCache;
  fontCache = new Promise((resolve) => {
    const done = (out) => {
      const names = [...new Set(String(out).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('.')))];
      names.sort((a, b) => a.localeCompare(b, 'ko'));
      resolve(names);
    };
    if (IS_MAC) { // AppKit knows every installed family
      const jxa = 'ObjC.import("AppKit"); $.NSFontManager.sharedFontManager.availableFontFamilies.js.map(function (f) { return f.js; }).join("\\n")';
      execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxa], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => done(err ? '' : stdout));
      return;
    }
    if (!IS_WIN) { execFile('fc-list', [':', 'family'], (err, stdout) => done(err ? '' : stdout.split('\n').map((l) => l.split(',')[0]).join('\n'))); return; }
    const sys = process.env.SystemRoot || 'C:\\Windows';
    const script = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }';
    const ps = spawn(path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (d) => { out += d; });
    ps.on('close', () => {
      const names = [...new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
      names.sort((a, b) => a.localeCompare(b, 'ko'));
      resolve(names);
    });
    ps.on('error', () => resolve([]));
  });
  return fontCache;
});

/** Window-level appearance: Windows 11 backdrop material, title-bar overlay colors, UI zoom. */
function applyWindowAppearance({ material = 'none', opacity = 1, chrome = '#0d0f14', zoom = 1, dark = true } = {}) {
  if (!win || win.isDestroyed()) return;
  if (IS_MAC) { // macOS: vibrancy instead of Windows backdrop materials; traffic lights instead of an overlay
    try { win.setOpacity(Math.max(0.5, Math.min(1, Number(opacity) || 1))); } catch { /* ignore */ }
    const blur = ['acrylic', 'mica'].includes(material);
    try {
      win.setBackgroundColor(blur ? '#00000000' : chrome);
      win.setVibrancy(blur ? (material === 'mica' ? 'sidebar' : 'under-window') : null);
    } catch { /* ignore */ }
    win.webContents.setZoomFactor(Math.max(0.8, Math.min(1.3, Number(zoom) || 1)));
    return;
  }
  // "창 투명": whole-window opacity — always visible, works everywhere, keeps resizing and window controls
  try { win.setOpacity(Math.max(0.5, Math.min(1, Number(opacity) || 1))); } catch { /* ignore */ }
  const m = ['acrylic', 'mica'].includes(material) ? material : 'none';
  try {
    win.setBackgroundColor(m === 'none' ? chrome : '#00000000');
    if (typeof win.setBackgroundMaterial === 'function') win.setBackgroundMaterial(m);
  } catch { /* older Windows: ignore */ }
  try { win.setTitleBarOverlay({ color: m === 'none' ? chrome : '#00000000', symbolColor: dark ? '#9aa3b5' : '#4a5160', height: 40 }); } catch { /* ignore */ }
  const z = Math.max(0.8, Math.min(1.3, Number(zoom) || 1));
  win.webContents.setZoomFactor(z);
}
ipcMain.on('win:appearance', (_e, a) => applyWindowAppearance(a));
ipcMain.on('app:lang', (_e, l) => { store.settings.lang = l; if (typeof buildMenu === 'function') buildMenu(); });
// 라이트 / 다크 / 시스템: the window frame, materials and the page's prefers-color-scheme all follow this
ipcMain.handle('theme:set', (_e, source) => {
  nativeTheme.themeSource = ['light', 'dark', 'system'].includes(source) ? source : 'dark';
  return nativeTheme.shouldUseDarkColors;
});
nativeTheme.on('updated', () => { if (win && !win.isDestroyed()) win.webContents.send('theme:updated', nativeTheme.shouldUseDarkColors); });

/* Background image: copied into the profile so the original can move or be deleted. */
const BG_IMAGE_BASE = path.join(app.getPath('userData'), 'background');
const IMG_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
function bgImageFile() {
  for (const ext of Object.keys(IMG_TYPES)) if (exists(BG_IMAGE_BASE + ext)) return BG_IMAGE_BASE + ext;
  return '';
}
function bgImageData() {
  const f = bgImageFile();
  if (!f) return '';
  return `data:${IMG_TYPES[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(f).toString('base64')}`;
}
ipcMain.handle('bg:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: T('배경 이미지 선택'), properties: ['openFile'], filters: [{ name: T('이미지'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
  if (r.canceled || !r.filePaths[0]) return '';
  const src = r.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  if (!IMG_TYPES[ext]) return '';
  if (fs.statSync(src).size > 25 * 1024 * 1024) return 'too-big';
  const old = bgImageFile();
  if (old) fs.rmSync(old, { force: true });
  fs.copyFileSync(src, BG_IMAGE_BASE + ext);
  return bgImageData();
});
ipcMain.handle('bg:get', () => { try { return bgImageData(); } catch { return ''; } });
ipcMain.handle('bg:clear', () => { const f = bgImageFile(); if (f) fs.rmSync(f, { force: true }); return true; });

ipcMain.on('win:title', (_e, title) => { if (win && typeof title === 'string') win.setTitle(title.slice(0, 200)); });

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: T('프로젝트 폴더 선택') });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('clip:read', () => ({ text: clipboard.readText(), hasImage: !clipboard.readImage().isEmpty() }));
ipcMain.on('clip:write', (_e, text) => clipboard.writeText(String(text)));

ipcMain.on('open:external', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.on('open:folder', (_e, dir) => { if (dir && exists(dir)) shell.openPath(dir); });
ipcMain.on('open:userdata', () => shell.openPath(app.getPath('userData')));
ipcMain.on('win:devtools', () => { if (win) win.webContents.toggleDevTools(); });

ipcMain.on('notify', (_e, { title, body, tabId }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: false });
  n.on('click', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    send('focus-tab', tabId);
  });
  n.show();
});
ipcMain.on('attention', () => {
  if (!win || win.isFocused()) return;
  if (IS_MAC) app.dock?.bounce('informational'); // the Dock icon hops once
  else win.flashFrame(true);
});

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  const w = store.window;
  win = new BrowserWindow({
    width: w.width,
    height: w.height,
    x: w.x,
    y: w.y,
    minWidth: 640,
    minHeight: 400,
    show: true, // appear immediately (dark background, no flash) instead of waiting for first paint
    // a backdrop material only shows through if the window itself starts transparent
    backgroundColor: ['acrylic', 'mica'].includes(store.settings.bgEffect) ? '#00000000' : '#0d0f14',
    ...(IS_WIN && ['acrylic', 'mica'].includes(store.settings.bgEffect) ? { backgroundMaterial: store.settings.bgEffect } : {}),
    ...(IS_MAC && ['acrylic', 'mica'].includes(store.settings.bgEffect) ? { vibrancy: store.settings.bgEffect === 'mica' ? 'sidebar' : 'under-window', visualEffectState: 'active' } : {}),
    icon: ICON,
    title: 'MinsuTerm',
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } } // native traffic lights inside our tab bar
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0d0f14', symbolColor: '#9aa3b5', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (w.maximized) win.maximize();
  win.once('ready-to-show', () => { if (!win.isVisible()) win.show(); });
  // never leave an invisible window behind if the first paint is slow or stalls
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 3000);
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer gone', details);
    if (win && !win.isDestroyed()) win.reload();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const rememberBounds = () => {
    if (!win || win.isDestroyed()) return;
    store.window.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized()) Object.assign(store.window, win.getBounds());
    saveStore();
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);
  win.on('focus', () => { win.flashFrame(false); send('win:focus', true); });
  win.on('blur', () => send('win:focus', false));

  win.on('close', (e) => {
    if (forceClose || !store.settings.confirmClose || runningCount === 0) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: [T('종료'), T('취소')],
      defaultId: 1,
      cancelId: 1,
      title: 'MinsuTerm',
      message: T(`실행 중인 에이전트 세션 ${runningCount}개가 있습니다. 종료할까요?`),
      detail: store.settings.restoreSessions
        ? T('다음 실행 시 탭 구성이 복원되고 Claude / Codex 대화가 그대로 이어집니다.')
        : T('모든 세션이 종료됩니다.'),
      noLink: true,
    });
    if (choice === 1) e.preventDefault();
    else forceClose = true;
  });

  win.on('closed', () => { killAll(); win = null; });
}

app.on('second-instance', () => {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  if (TEST_DIR) runTestScript();
});

async function runTestScript() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => fs.writeFileSync(path.join(TEST_DIR, `${name}.png`), (await win.capturePage()).toPNG());
  const state = () => js('JSON.stringify(S.tabs.map(t => ({ agent: t.agent, status: t.status, cwd: t.cwd, sessionId: t.sessionId, label: tabLabel(t) })))');
  const log = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log.push(`CONSOLE(${level}) ${message}`); });
  if (process.env.MT_TEST_ONTOP) { win.setAlwaysOnTop(true); win.focus(); }
  try {
    win.setBounds({ width: 1280, height: 800 });
    await wait(4000);
    await shot('1-shell');
    log.push('shell: ' + await state());
    const steps = (process.env.MT_TEST_STEPS || '').split('|').filter(Boolean);
    for (const step of steps) {
      if (step.startsWith('keys:')) { // real key presses, typed at a human pace ("\n" = Enter)
        win.webContents.focus();
        for (const ch of step.slice(5).replace(/\\n/g, '\n')) {
          const keyCode = ch === '\n' ? 'Return' : ch === ' ' ? 'Space' : ch;
          const modifiers = /[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(ch) ? ['shift'] : [];
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
          if (ch !== '\n') win.webContents.sendInputEvent({ type: 'char', keyCode: ch, modifiers });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
          await wait(35 + Math.random() * 45);
        }
        log.push(`${step.slice(0, 20)}: typed`);
        continue;
      }
      await js(step === 'tabs'
        ? 'newShell(); newShell(); true'
        : step === 'drag' ? 'moveActive(-2); true'
        : step === 'palette' ? 'openCommandPalette(); true'
        : step === 'close-overlay' ? 'closeOverlay(); true'
        : step === 'sidebar-project' ? `addProject(${JSON.stringify(process.env.MT_TEST_PROJECT || HOME)}); true`
        : step.startsWith('run:') ? `runInTab(activeTab(), ${JSON.stringify(step.slice(4))}); true`
        : step.startsWith('type:') ? `window.mt.pty.write(activeTab().id, ${JSON.stringify(step.slice(5))}); true`
        : step.startsWith('wait:') ? 'true'
        : step.startsWith('js:') ? `(() => { ${step.slice(3)}; return true; })()`
        : 'true');
      await wait(step.startsWith('wait:') ? Number(step.slice(5)) : 1500);
      const name = step.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
      await shot(`step-${log.length}-${name}`);
      log.push(`${step}: ` + await state());
    }
  } catch (err) {
    log.push('ERROR ' + (err && err.stack ? err.stack : err));
  }
  fs.writeFileSync(path.join(TEST_DIR, 'log.txt'), log.join('\n'));
  forceClose = true;
  app.quit();
}

app.on('before-quit', () => { saveStoreNow(); });
app.on('window-all-closed', () => {
  killAll();
  if (probe) { try { probe.kill(); } catch { /* ignore */ } }
  saveStoreNow();
  app.quit();
});
