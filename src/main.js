'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, clipboard, nativeTheme, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { StringDecoder } = require('string_decoder');
const { spawn, execFile } = require('child_process');
const pty = require('@lydell/node-pty');
const progress = require('./progress'); // 진행도 보기: the progress page, hosted here, and the skills it installs

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

// Test harness (development only, ignored by a packaged build): MT_TEST=<dir> uses an isolated profile and writes
// screenshots there.
const TEST_DIR = app.isPackaged ? '' : (process.env.MT_TEST || '');
if (TEST_DIR) {
  app.setPath('userData', path.join(TEST_DIR, 'profile'));
  // Several test runs may overlap on screen: keep every window rendering even when it is covered.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

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
    bgMusicVolume: 0.25, // 배경 음악
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

/** Moves a file whose contents make no sense out of the way, as <name>.bad-<time>. → false if it could not be moved */
function setAside(file) {
  try { fs.renameSync(file, `${file}.bad-${Date.now()}`); return true; } catch { return false; }
}

let storeUnreadable = false; // the store file is there but could not be read: nothing is saved over it

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
  } catch (err) {
    // Only a missing file is a first run. Starting from the defaults after any other failure would let the first save
    // wipe the user's projects, task history, settings and layout: a damaged file is set aside before the defaults
    // take its place, and one that could not be read at all (locked, no permission) is left alone for this run.
    if (!err || err.code !== 'ENOENT') {
      console.error('store load failed', err);
      if ((err && err.code) || !setAside(STORE_FILE)) storeUnreadable = true;
    }
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
  if (storeUnreadable) return; // see loadStore
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

/**
 * A folder we may start a shell in, or open? A tab's folder is whatever a program printed (OSC 9;9 / OSC 7), so it is
 * not trusted: a file there would be run by shell.openPath, and on Windows merely looking at \\host\share logs on to
 * that host with the user's credentials. A network path therefore only counts inside a project the user added.
 */
function isFolder(p) {
  if (typeof p !== 'string' || !p) return false;
  if (IS_WIN && /^[\\/]{2}/.test(p)) {
    const at = normPath(p).toLowerCase();
    const wsl = /^\\\\wsl(\$|\.localhost)\\/.test(at); // WSL's own share is served by this machine: no network logon
    const known = wsl || (Array.isArray(store.projects) ? store.projects : []).some((x) => {
      const root = x && typeof x.path === 'string' && /^[\\/]{2}/.test(x.path) ? normPath(x.path).toLowerCase() : '';
      return root && (at === root || at.startsWith(root + '\\'));
    });
    if (!known) return false;
  }
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function resolveCwd(cwd) {
  if (isFolder(cwd)) return cwd;
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
    // .zshenv is where people point ZDOTDIR somewhere else (~/.config/zsh). An assignment in front of "." is undone
    // when the file ends, so here ZDOTDIR is set and put back by hand, and a new value goes on in MT_USER_ZDOTDIR:
    // the other startup files are then read from that folder.
    fs.writeFileSync(path.join(zdir, '.zshenv'), [
      '__mt_zdotdir="$ZDOTDIR"',
      'ZDOTDIR="${MT_USER_ZDOTDIR:-$HOME}"',
      '[ -f "$ZDOTDIR/.zshenv" ] && . "$ZDOTDIR/.zshenv"',
      '[ "${ZDOTDIR-}" != "${MT_USER_ZDOTDIR:-$HOME}" ] && MT_USER_ZDOTDIR="${ZDOTDIR-}"',
      'ZDOTDIR="$__mt_zdotdir"; unset __mt_zdotdir',
      ''].join('\n'));
    fs.writeFileSync(path.join(zdir, '.zprofile'), src('.zprofile'));
    // macOS /etc/zshrc has just set HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history, with our folder as ZDOTDIR: back to the
    // user's own history file (their .zshrc, read next, may still choose another)
    fs.writeFileSync(path.join(zdir, '.zshrc'),
      `[[ "\${HISTFILE-}" == "$ZDOTDIR"/* ]] && HISTFILE="\${MT_USER_ZDOTDIR:-$HOME}/.zsh_history"\n${src('.zshrc')}__mt_cwd() { ${OSC_CWD_SH}; }\nautoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __mt_cwd || precmd_functions+=(__mt_cwd)\n`);
    fs.writeFileSync(path.join(zdir, '.zlogin'), `${src('.zlogin')}ZDOTDIR="\${MT_USER_ZDOTDIR:-$HOME}"\n`);
    // bash: what a login shell reads, /etc/profile first (on macOS it builds PATH from /etc/paths and /etc/paths.d)
    fs.writeFileSync(path.join(dir, 'bashrc'),
      `[ -f /etc/profile ] && . /etc/profile\nif [ -f ~/.bash_profile ]; then . ~/.bash_profile; elif [ -f ~/.profile ]; then . ~/.profile; fi\n[ -f ~/.bashrc ] && . ~/.bashrc\n__mt_cwd() { ${OSC_CWD_SH}; }\nPROMPT_COMMAND="__mt_cwd\${PROMPT_COMMAND:+; $PROMPT_COMMAND}"\n`);
  } catch { /* integration is optional */ }
  return dir;
}

/**
 * LANG for a shell that was given none (an app started from Finder has no locale, and without one non-ASCII text
 * breaks): the system's own locale in UTF-8, "en-US" → en_US.UTF-8. macOS only knows the language / region pairs
 * under /usr/share/locale (English in Korea, en_KR, is not one) and an unknown name would drop every tool to the
 * C locale: then, and when the system does not say, en_US.UTF-8.
 */
function systemLang() {
  const m = /^([a-z]{2,3})(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/.exec(app.getSystemLocale() || '');
  const lang = m ? `${m[1]}_${m[2].toUpperCase()}.UTF-8` : '';
  return lang && (!IS_MAC || exists(`/usr/share/locale/${lang}`)) ? lang : 'en_US.UTF-8';
}

/**
 * Was MinsuTerm itself started from inside an agent session (run from Claude Code or Codex, as during development)?
 * Only then is every CLAUDE_CODE_* / CODEX_* variable part of that session. For everyone else those are the user's own
 * settings (CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_GIT_BASH_PATH, CODEX_HOME …), which the agents in the tabs need.
 */
const INSIDE_AGENT = ['CLAUDECODE', 'CODEX_THREAD_ID', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_MANAGED_PACKAGE_ROOT'].some((k) => process.env[k]);
/** What points at one particular session even then (an editor's terminal sets the last two for its own claude). */
const SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'];

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
    const session = INSIDE_AGENT ? k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k.startsWith('CODEX_') : SESSION_MARKERS.includes(k);
    if (session || k.startsWith('MT_TEST')) delete env[k];
  }

  let args = [];
  let writeLater = '';
  if (!IS_WIN) {
    env.LANG = env.LANG || systemLang(); // apps launched from Finder get no locale: keep non-ASCII text intact
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
    // node-pty quotes an argument list itself and writes an inner quote as \", which cmd hands on as it is
    // ("be brief" would arrive as "be and brief"): a command with quotes goes to cmd as the raw command line.
    args = !initCmd ? [] : initCmd.includes('"') ? `/K ${initCmd}` : ['/K', initCmd];
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
    // Windows: node-pty frees a pty only in kill(). A shell that ended by itself (one we killed is no longer in the
    // map) would keep its output worker thread and its console host until the app quits: release both. Not with
    // kill(): that looks the console's processes up by the shell's pid, which Windows may have given away by now.
    if (IS_WIN && ptys.get(spec.id) === rec) {
      try { p._agent._conoutSocketWorker.dispose(); p._agent._inSocket.destroy(); } catch { /* node-pty changed inside */ }
    }
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
  // the command line of node / bun (which script it runs) and of the agents themselves (the session they resume)
  '    if ($p.Name -eq "node.exe" -or $p.Name -eq "bun.exe" -or $p.Name -eq "claude.exe" -or $p.Name -eq "codex.exe") { $c = [string]$p.CommandLine; $c = $c -replace "[\\r\\n\\t]", " " }',
  '    [Console]::Out.WriteLine("$($p.ProcessId)`t$($p.ParentProcessId)`t$($p.Name)`t$c")',
  '  }',
  '  [Console]::Out.WriteLine("<<END>>")',
  '  [Console]::Out.Flush()',
  '}',
].join('\n');

let probe = null;
let probeBuf = '';
let probeBusy = false;
let probeTimer = null; // gives up on a query that gets no answer
let probeFails = 0; // failures in a row
let probeAfter = 0; // no new probe before this time
const PROBE_TIMEOUT = 15000; // a query takes ~200 ms; the first one also has to start PowerShell

/**
 * The probe gave no answer, died or could not be started: drop it. The next one starts after a pause that grows while
 * it keeps failing (PowerShell blocked by a policy, WMI out of order) instead of with every query.
 */
function probeFailed(ps) {
  if (ps && probe !== ps) return; // an earlier one, dropped already
  clearTimeout(probeTimer);
  probe = null;
  probeBusy = false;
  probeBuf = '';
  probeFails++;
  probeAfter = Date.now() + Math.min(300000, 1000 * 2 ** probeFails); // 2 s, 4 s, 8 s … 5 min
  try { ps.kill(); } catch { /* never started, or gone */ }
}

function startProbe() {
  if (probe || Date.now() < probeAfter) return;
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const encoded = Buffer.from(PROBE_SCRIPT, 'utf16le').toString('base64');
  let ps = null;
  try {
    ps = probe = spawn(path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    // without these listeners a PowerShell that is blocked, or that dies while it is written to, is an uncaught
    // error (Electron shows a dialog for it)
    ps.on('error', () => probeFailed(ps));
    ps.on('exit', () => probeFailed(ps));
    ps.stdin.on('error', () => {});
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (d) => {
      if (probe !== ps) return;
      probeBuf += d;
      const end = probeBuf.indexOf('<<END>>');
      if (end >= 0) {
        const snap = probeBuf.slice(0, end);
        probeBuf = probeBuf.slice(end + 7);
        probeBusy = false;
        probeFails = 0;
        clearTimeout(probeTimer);
        analyze(snap);
      }
    });
  } catch { probeFailed(ps); }
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

/**
 * The session an agent was started on, from its command line (`claude --resume <id>`, `--session-id <id>`): a
 * session typed by hand is known at once, not guessed later from the transcripts that changed lately in its folder,
 * which picked another session working in the same folder. A forked resume starts a new session: not this id.
 */
function sessionArg(cmd) {
  const c = String(cmd || '');
  if (/--fork-session/.test(c)) return '';
  const m = /(?:^|\s)(?:--resume|-r|--session-id)(?:\s+|=)"?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(c);
  return m ? m[1].toLowerCase() : '';
}

/** `claude attach <id|name>` → { id, exe }: the short id (or name) it names, and the claude binary that ran it. */
function attachArg(cmd) {
  const m = /^\s*"?([^"]*?claude(?:\.exe)?)"?\s+attach\s+"?([A-Za-z0-9_.-]{4,64})"?\s*$/i.exec(String(cmd || ''));
  return m ? { id: m[2].toLowerCase(), exe: m[1] } : null;
}
const attachIds = new Map(); // short id → full session id of a background Claude session
const attachAsked = new Map(); // short id → when it was last asked (a failed answer is not asked again at once)
function resolveAttach({ id, exe }, done) {
  if (Date.now() - (attachAsked.get(id) || 0) < 15000) return;
  attachAsked.set(id, Date.now());
  const bin = exe && /[\\/]/.test(exe) && exists(exe) ? exe : 'claude';
  execFile(bin, ['agents', '--json'], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024, shell: bin === 'claude' && IS_WIN }, (err, out) => {
    if (err) return;
    try {
      const j = JSON.parse(String(out)), list = Array.isArray(j) ? j : j.sessions || j.agents || [];
      for (const s of list) {
        const sid = String(s.sessionId || '');
        if (!UUID_RE.test(sid)) continue;
        if (String(s.id || '').toLowerCase() === id || sid.startsWith(id) || String(s.name || '').toLowerCase() === id) { attachIds.set(id, sid); break; }
      }
      if (attachIds.has(id)) done();
    } catch { /* not JSON: an older Claude */ }
  });
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
    // a snapshot without the tab's own shell is not a whole one (a failed query comes back empty): it must not
    // take the tab's agent, and with it the session id, away
    if (!root || !info.has(root)) continue;
    const stack = [...(children.get(root) || [])];
    const seen = new Set();
    let sid = '', short = null;
    while (stack.length && !found) {
      const id = stack.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const it = info.get(id);
      if (it) found = classify(it.name, it.cmd);
      if (found) { sid = sessionArg(it.cmd); if (!sid && found === 'claude') short = attachArg(it.cmd); }
      if (!found) stack.push(...(children.get(id) || []));
    }
    // `claude attach <short id>`: the command line names the background session only by its short id — ask Claude
    // for the full one (once; answered a moment later, when the tab is told again)
    if (short) {
      const full = attachIds.get(short.id);
      if (full) sid = full;
      else resolveAttach(short, () => { if (rec.agent === 'claude' && attachIds.get(short.id) && rec.sid !== attachIds.get(short.id)) { rec.sid = attachIds.get(short.id); send('pty:agent', tabId, 'claude', rec.sid); } });
    }
    if (found !== rec.agent || (found && sid && sid !== rec.sid)) {
      rec.agent = found;
      rec.sid = found ? sid : '';
      send('pty:agent', tabId, found, rec.sid);
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
  const ps = probe;
  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => probeFailed(ps), PROBE_TIMEOUT); // a hung WMI call would end agent detection for good
  try { ps.stdin.write('x\n'); } catch { probeFailed(ps); }
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

// the folders the agents in the tabs use: theirs can be moved with CLAUDE_CONFIG_DIR / CODEX_HOME (the latter does not
// reach the tabs when MinsuTerm runs inside an agent session, see spawnPty)
const CLAUDE_PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const CODEX_HOME = (!INSIDE_AGENT && process.env.CODEX_HOME) || path.join(HOME, '.codex');
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
/**
 * A Claude session's transcript: in the folder for the tab's directory, or else wherever it is under the projects
 * folder (`cd /d C:\ && claude --resume <id>` on one line: the tab's directory still says where the shell was).
 */
const claudeFound = new Map(); // id → transcript found elsewhere, or the time it was looked for in vain
function claudeFile(cwd, id) {
  const f = path.join(claudeDirFor(cwd), `${id}.jsonl`);
  if (exists(f)) return f;
  const hit = claudeFound.get(id);
  if (typeof hit === 'string' && exists(hit)) return hit;
  if (typeof hit === 'number' && Date.now() - hit < 10000) return f; // looked a moment ago: not there
  try {
    for (const d of fs.readdirSync(CLAUDE_PROJECTS)) {
      const g = path.join(CLAUDE_PROJECTS, d, `${id}.jsonl`);
      if (exists(g)) { claudeFound.set(id, g); return g; }
    }
  } catch { /* ignore */ }
  claudeFound.set(id, Date.now());
  if (claudeFound.size > 100) claudeFound.delete(claudeFound.keys().next().value);
  return f;
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

/**
 * Text without its <tag>…</tag> blocks, whitespace squeezed. One pass, with exactly the result of
 * replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' '): that pattern reads on to the end of the text from every "<…>" that has
 * no closing tag after it, which held the main thread for seconds on a pasted stack trace.
 */
function cleanText(text) {
  const s = String(text || '');
  let out = '';
  let from = 0; // start of what is not copied yet
  let pos = 0;
  for (;;) {
    const lt = s.indexOf('<', pos);
    const gt = lt < 0 ? -1 : s.indexOf('>', lt + 1);
    if (gt < 0) break; // no "<…>" left
    if (gt === lt + 1) { pos = gt; continue; } // "<>" opens nothing
    let end = 0; // where the first closing tag after it ends
    for (let c = s.indexOf('</', gt + 1); c >= 0; c = s.indexOf('</', c + 2)) {
      const h = s.indexOf('>', c + 2);
      if (h === c + 2) continue; // "</>" closes nothing
      end = h + 1; // stays 0 when no ">" follows
      break;
    }
    if (!end) break; // no closing tag left for this "<…>", so none for a later one either
    out += s.slice(from, lt) + ' ';
    from = pos = end;
  }
  return (out + s.slice(from)).replace(/\s+/g, ' ').trim();
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

/**
 * A user entry the user did not type: a background task or sub-agent reporting back (<task-notification>, recorded as
 * a user message with an origin other than "human"). Its tags stripped, what is left ("</task-notification>") would
 * pass for a prompt and become a title.
 */
const notTyped = (o) => !!(o.origin && o.origin.kind && o.origin.kind !== 'human')
  || (typeof (o.message && o.message.content) === 'string' && /^\s*<task-notification>/.test(o.message.content));

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
      if (!firstPrompt && o.message && typeof o.message.content === 'string' && !notTyped(o)) {
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

/**
 * The transcript of one Codex session. Finding it is a walk of the whole sessions tree, and a working tab asks several
 * times a second: where it was found is remembered (only that file is looked at again), and so is, for a few seconds,
 * that it was not found.
 */
const codexFileCache = new Map(); // session id → { file, at }
function codexFile(id) {
  const key = String(id).toLowerCase();
  const c = codexFileCache.get(key);
  if (c && (c.file ? exists(c.file) : Date.now() - c.at < 5000)) return c.file;
  const hit = codexFiles(30).find(({ file }) => path.basename(file).toLowerCase().includes(key));
  if (codexFileCache.size > 200) codexFileCache.clear();
  codexFileCache.set(key, { file: hit ? hit.file : '', at: Date.now() });
  return hit ? hit.file : '';
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

/**
 * The folder an agent typed with a change of folder on the same line runs in: `cd /d X && claude`, `cd X; codex`,
 * `pushd X & claude`. The shell reports its folder with its next prompt, which comes only once the agent has exited:
 * until then the tab still has the folder it was in, and the sidebar filed the agent, its tasks and its sessions there.
 * `line` is what was typed (with the prompt in front of it). → that folder, or '' (no change of folder, or one this
 * does not follow: a folder that is not there, a wildcard, `cd -`).
 */
const AGENT_CMD = /(?:&&|&|;)\s*(?:call\s+|&\s*)?"?(?:[^\s"&;|]*[\\/])?(?:claude|codex)(?:\.exe|\.cmd|\.ps1)?"?(?=\s|$)/i;
const CD_CMD = /^(?:cd|chdir|pushd|sl|set-location)(?:\s+(\/d))?(?:\s+-(?:literal)?path)?\s+(.+?)\s*$/i;
function cdTarget(cwd, line, shell) {
  const s = String(line || '').slice(-4000);
  const m = AGENT_CMD.exec(s); // the agent, started as a command of its own after others
  if (!m || !isFolder(cwd)) return '';
  const cmds = s.slice(0, m.index).split(/\s*(?:&&|&|;)\s*/);
  // the first command comes after the prompt ("C:\x>cd /d D:\y", "PS C:\x> cd y", "~/x $ cd y")
  const first = /(?:^|[\s>$#%\u276f\u203a])((?:cd|chdir|pushd|sl|set-location)\s.*)$/i.exec(cmds[0]);
  cmds[0] = first ? first[1] : '';
  let dir = cwd, moved = false;
  for (const c of cmds) {
    const cd = CD_CMD.exec(c.trim());
    if (!cd) continue; // another command (set X=1): not a change of folder
    let t = cd[2].replace(/^(["'])(.*)\1$/, '$2');
    if (!t || t === '-' || /[*?<>|`]/.test(t)) return '';
    t = t.replace(/%(\w+)%/g, (all, v) => process.env[v] ?? all)
      .replace(/\$env:(\w+)/gi, (all, v) => process.env[v] ?? all)
      .replace(/\$\{?(\w+)\}?/g, (all, v) => (v === 'HOME' ? HOME : process.env[v] ?? all));
    if (t === '~' || /^~[\\/]/.test(t)) t = HOME + t.slice(1);
    if (IS_WIN && /^\/[a-z](?:\/|$)/i.test(t)) t = `${t[1].toUpperCase()}:\\${t.slice(3)}`; // Git Bash: /c/Users → C:\Users
    // cmd: "cd D:\x" without /d sets that drive's folder but stays on the current drive
    if (IS_WIN && shell === 'cmd' && !cd[1] && /^[a-z]:/i.test(t) && t[0].toLowerCase() !== dir[0].toLowerCase()) continue;
    const next = path.resolve(dir, t);
    if (!isFolder(next)) return '';
    dir = next;
    moved = true;
  }
  return moved ? normPath(dir) : '';
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:init', () => {
  // A page that is starting has no pty yet: one that is alive belongs to a page that crashed or was reloaded. Its
  // shell and agent would run on unseen, next to the ones this page starts when it restores the layout.
  killAll();
  outBuffers.clear();
  return {
    store,
    shells: SHELLS.map(({ id, name, type }) => ({ id, name, type })),
    home: HOME,
    version: app.getVersion(),
  };
});

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
/*
 * Flow control: while it is in view, the window pauses a pty whose output it is behind on drawing, and resumes it
 * once it has caught up (the program printing just waits, as on any slow terminal). Not on Windows before 11 24H2 (build
 * 26100): closing a pseudoconsole there waits until its output has been read, and a paused pty is not being
 * read — closing such a tab would hang the app. There the output simply keeps coming, as it always did.
 */
const CAN_PAUSE_PTY = !IS_WIN || (parseInt(os.release().split('.')[2], 10) || 0) >= 26100;
ipcMain.on('pty:pause', (_e, id) => { const r = ptys.get(id); if (r && CAN_PAUSE_PTY) { try { r.p.pause(); } catch { /* ignore */ } } });
ipcMain.on('pty:resume', (_e, id) => { const r = ptys.get(id); if (r) { try { r.p.resume(); } catch { /* ignore */ } } });
ipcMain.on('agent:probe', (_e, delays) => {
  const list = Array.isArray(delays) ? delays.filter((d) => Number.isFinite(d) && d >= 0 && d < 20000).slice(0, 5) : [450];
  scheduleProbe(list.length ? list : [450]);
});

ipcMain.handle('agent:sessions', (_e, cwd, limit) => listSessions(cwd, limit));
ipcMain.handle('agent:recent', (_e, agent, cwd, sinceMs) => recentSessions(agent, cwd, sinceMs));
ipcMain.handle('agent:has', (_e, agent, cwd, id) => hasSession(agent, cwd, id));
ipcMain.handle('agent:cdTarget', (_e, cwd, line, shell) => cdTarget(cwd, line, shell));

/** The most recent prompt the user sent in a session (used to title a finished task). */
function lastPrompt(agent, cwd, id) {
  if (!UUID_RE.test(String(id || ''))) return '';
  let file = '';
  if (agent === 'claude') file = claudeFile(cwd, id);
  else if (agent === 'codex') file = codexFile(id);
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
      if (agent === 'claude' && o.type === 'user' && !o.isMeta && !o.isSidechain && o.message && typeof o.message.content === 'string' && !notTyped(o)) {
        const t = cleanText(o.message.content);
        if (t && !t.startsWith('Caveat:') && !t.startsWith('/')) return { text: t.slice(0, 300), ts: Date.parse(o.timestamp || '') || 0 }; // with its time: the caller checks it belongs to the task
      }
      if (agent === 'codex' && o.type === 'event_msg' && o.payload && o.payload.type === 'user_message' && o.payload.message) {
        const t = cleanText(o.payload.message);
        if (t && !t.startsWith('/')) return { text: t.slice(0, 300), ts: Date.parse(o.timestamp || '') || 0 };
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
  if (agent === 'claude') file = claudeFile(cwd, id);
  else if (agent === 'codex') file = codexFile(id);
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
        if (o.type === 'user') { // a prompt or tool result waiting for the model — unless it is the note of an Esc
          const m = o.message && o.message.content, txt = typeof m === 'string' ? m : Array.isArray(m) ? m.map((q) => (q && typeof q.text === 'string' ? q.text : '')).join(' ') : '';
          return /^\s*\[Request interrupted by user/.test(txt) ? 'done' : 'working';
        }
      } else if (o.type === 'event_msg' && o.payload) {
        if (o.payload.type === 'task_complete' || o.payload.type === 'turn_aborted') return 'done';
        if (o.payload.type === 'task_started') return 'working';
      }
    }
  } catch { /* ignore */ }
  return 'unknown';
}
/**
 * Sub-agents the agent launched, read from its transcript.
 *  Claude: an Agent / Task tool call (subagent_type + a short description). It ends with its tool result —
 *          unless it was launched in the background (isAsync), then with a <task-notification> naming it.
 *  Codex:  SubAgentActivity items (kind started / completed) with an agent_path like "/root/list_files"; and its
 *          background terminals (codexShellLine).
 * → [{ id, kind, name, status: 'running' | 'done' | 'failed', start }]: those launched or finished since `since`,
 *   and every one still running (a background sub-agent outlives the turn that launched it).
 *
 * The place in each transcript is kept between calls and only what was appended is read. A long session writes
 * megabytes between two polls (screenshots, tool output), so re-reading a fixed-size tail would lose sub-agents
 * that are still running.
 */
const SUB_TAIL = 16 * 1024 * 1024; // how far back the first look at a transcript goes
const SUB_LOST = 30 * 60 * 1000;   // a background sub-agent whose own transcript has been still this long is gone
const SHELL_LOST = 6 * 3600 * 1000; // a background command running this long without an end is taken to be gone
const SUB_NEVER = 10 * 60 * 1000; // a background sub-agent whose own transcript never appeared in this long runs elsewhere (or not at all)
const subCache = new Map();        // session id → { file, pos, carry, dec, map, skip, live }

function subagentLine(agent, c, line) {
  if (!line || line[0] !== '{') return;
  const map = c.map;
  if (agent !== 'claude') {
    if (!line.includes('SubAgentActivity')) { codexShellLine(c, line); return; }
    let o;
    try { o = JSON.parse(line); } catch { return; }
    if (o.type !== 'event_msg' || !o.payload || o.payload.type !== 'item_completed') return;
    const it = o.payload.item || {};
    if (it.type !== 'SubAgentActivity' || !it.agent_thread_id) return;
    const key = it.agent_thread_id;
    if (it.kind === 'started') {
      const nm = String(it.agent_path || '').split('/').filter(Boolean).pop() || 'agent';
      map.set(key, { id: key, kind: nm.replace(/[_-]+/g, ' '), name: '', status: 'running', start: Date.parse(o.timestamp || '') || 0, end: 0 });
    } else if (map.has(key)) {
      const x = map.get(key);
      x.status = it.kind === 'completed' ? 'done' : 'failed'; x.end = c.live ? Date.now() : 0;
    }
    return;
  }
  // a background sub-agent finishing: <task-notification> … <tool-use-id>X</tool-use-id> … <status>S</status>,
  // recorded as a queued message and / or a user message — read it from any entry
  if (map.size && line.includes('task-notification')) {
    const seen = new Set();
    const end = (id, st) => { const x = map.get(id); if (!x || x.status !== 'running') return; x.status = st === 'completed' ? 'done' : 'failed'; x.end = c.live ? Date.now() : 0; };
    const re = /<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]{0,4000}?<status>([^<]+)<\/status>/g;
    let m;
    while ((m = re.exec(line))) { seen.add(m[1]); end(m[1], m[2]); }
    const re2 = /<tool-use-id>([^<]+)<\/tool-use-id>/g;
    while ((m = re2.exec(line))) if (!seen.has(m[1])) end(m[1], 'completed');
  }
  // The main agent answering again means every foreground call of its earlier message is over. One still marked
  // running lost its result (the app or the tab was closed in the middle of it): forget it, or it would hold the
  // tab in "working" for good.
  if (map.size && line.includes('"type":"assistant"') && !line.includes('"isSidechain":true')) {
    const m = /"id":"(msg_[A-Za-z0-9_-]+)"/.exec(line);
    if (m) for (const x of map.values()) if (x.status === 'running' && !x.bg && x.msg && x.msg !== m[1]) map.delete(x.id);
  }
  // only two kinds of entry matter: a launch, and the result of a launch we know (lines can be megabytes long). A
  // launch is a sub-agent, a message that may set a finished sub-agent to work again, or a command left running in
  // the background: each goes on after the agent's own turn ends, which must not count as done before they are.
  const launch = line.includes('"tool_use"') && (line.includes('"Agent"') || line.includes('"Task"') || line.includes('"SendMessage"') || /"run_in_background":\s*true/.test(line));
  let result = false;
  if (!launch && map.size && line.includes('"tool_use_id"')) {
    const re = /"tool_use_id":\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(line))) if (map.has(m[1])) { result = true; break; }
  }
  if (!launch && !result) return;
  let o;
  try { o = JSON.parse(line); } catch { return; }
  if (o.isSidechain) return;
  const content = o.message && o.message.content;
  if (!Array.isArray(content)) return;
  if (o.type === 'assistant') {
    const start = Date.parse(o.timestamp || '') || 0, msg = String((o.message && o.message.id) || '');
    for (const q of content) {
      if (q.type !== 'tool_use') continue;
      const inp = q.input || {};
      if (q.name === 'Agent' || q.name === 'Task') {
        map.set(q.id, { id: q.id, kind: inp.subagent_type || 'agent', name: String(inp.description || '').slice(0, 60), status: 'running', start, end: 0, msg });
      } else if (q.name === 'SendMessage' && inp.to) {
        // to a sub-agent that had finished, it starts another run (its result says so); the run shows as that agent
        const to = String(inp.to), was = [...map.values()].reverse().find((x) => x.agentId && (x.agentId === to || x.agentId.startsWith(to)));
        map.set(q.id, { id: q.id, kind: was ? was.kind : 'agent', name: was ? was.name : '', status: 'running', start, end: 0, msg, resume: to });
      } else if (inp.run_in_background === true) { // a shell command left running in the background
        map.set(q.id, { id: q.id, kind: 'shell', name: String(inp.description || inp.command || '').replace(/\s+/g, ' ').slice(0, 60), status: 'running', start, end: 0, msg, bg: true, shell: true, cmd: String(inp.command || '') });
      }
    }
  } else if (o.type === 'user') {
    for (const q of content) {
      if (q.type !== 'tool_result' || !map.has(q.tool_use_id)) continue;
      const x = map.get(q.tool_use_id), r = o.toolUseResult || {};
      if (x.resume) { // a message: only one that woke a finished sub-agent starts a run of its own
        const id = r.resumedAgentId || r.revivedAgentId;
        if (id && !q.is_error) { x.bg = true; x.agentId = String(id); } else map.delete(x.id);
        continue;
      }
      if (x.shell) { if (q.is_error || !r.backgroundTaskId) { x.status = 'failed'; x.end = c.live ? Date.now() : 0; } else x.taskId = String(r.backgroundTaskId); continue; } // started: it goes on
      if (r.isAsync) { x.bg = true; x.agentId = String(r.agentId || ''); } // launched in the background: it goes on
      else { x.status = q.is_error ? 'failed' : 'done'; x.end = c.live ? Date.now() : 0; }
    }
  }
}

/*
 * Codex's background terminals. A command still running when exec_command stops waiting for it (10 s by default)
 * goes on as a "background terminal": the call's output carries a session id (the model may poll it with write_stdin,
 * or leave it running past the end of its turn). The transcript has no entry for the start — only that output — and
 * writes the end as a CommandExecution item with the same process_id once the command exits, however much later.
 * Recorded as kind 'shell' with id / task `cx-<process id>`.
 */
const CX_OUT = 256 * 1024; // how much of a background command's output read from the transcript is kept for its viewer

/** The `cmd` of each exec_command call in a code-mode script: `exec_command({ cmd: "…" })` or `exec_command("…")`. */
function codexScriptCmds(src) {
  const out = [], re = /exec_command\s*\(\s*(?:\{[^()]*?\bcmd["']?\s*:\s*)?("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
  let m;
  while ((m = re.exec(String(src || '')))) {
    const lit = m[1];
    let s = lit.slice(1, -1);
    try { s = JSON.parse(lit[0] === '"' ? lit : `"${s.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`); } catch { /* keep it as written */ }
    out.push(s);
  }
  return out;
}
/** The text items of a tool output (a string, or a list of { text }). */
function codexTexts(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(codexTexts);
  if (v && typeof v === 'object') return typeof v.text === 'string' ? [v.text] : codexTexts(v.content);
  return [];
}
/**
 * Commands a tool output reports still running: [{ pid, out }]. Code mode prints the exec_command / write_stdin result
 * as JSON (`"session_id":N`, no exit_code); the plain exec_command tool says "Process running with session ID N".
 */
function codexRunning(texts) {
  const found = [];
  for (const t of texts) {
    if (t[0] === '{' && t.includes('"session_id"')) {
      try {
        const r = JSON.parse(t);
        if (r && /^\d+$/.test(String(r.session_id)) && r.exit_code == null) found.push({ pid: String(r.session_id), out: typeof r.output === 'string' ? r.output : '' });
        continue;
      } catch { /* not a result */ }
    }
    const m = /Process running with session ID (\d+)/.exec(t);
    if (m) { const i = t.indexOf('\nOutput:\n'); found.push({ pid: m[1], out: i >= 0 ? t.slice(i + 9) : '' }); }
  }
  return found;
}
/** Output of a background command read from the transcript: kept for its viewer, and written there while no live feed does. */
function codexShellOut(x, text, final) {
  if (!text) return;
  let add = text;
  if (final) { // the whole output once it is over: what was seen of it already is its start
    if (x.outCut || !text.startsWith(x.out)) return;
    add = text.slice(x.out.length);
  }
  if (!add) return;
  if (x.out.length + add.length <= CX_OUT) x.out += add; else x.outCut = true;
  if (x.file && !x.live) { try { fs.appendFileSync(x.file, add); } catch { /* gone */ } }
}
function codexShellLine(c, line) {
  const call = line.includes('"type":"custom_tool_call') || line.includes('"type":"function_call');
  if (!call && !line.includes('"type":"CommandExecution"')) return;
  const map = c.map;
  if (!call) { // a command ended (any command: most end before exec_command stops waiting, and were never background ones)
    const m = /"process_id":"(\d+)"/.exec(line);
    if (!m) return;
    const x = map.get(`cx-${m[1]}`);
    if (!x || x.status !== 'running') { // its output (with the session id) may still come: then it must not start a row
      const ended = c.cxEnded || (c.cxEnded = new Set());
      ended.add(m[1]);
      if (ended.size > 400) ended.delete(ended.values().next().value);
      return;
    }
    let it = {};
    try { const o = JSON.parse(line); it = (o.payload && o.payload.item) || {}; } catch { /* that it ended is enough */ }
    x.status = it.status === 'completed' && !it.exit_code ? 'done' : 'failed'; // a stopped one: failed, exit code -1
    x.end = c.live ? Date.now() : 0;
    if (typeof it.aggregated_output === 'string') codexShellOut(x, it.aggregated_output, true);
    return;
  }
  // only a call that runs or polls a command, and the output of one we know, are read (outputs with screenshots are megabytes)
  const calls = c.cxCalls || (c.cxCalls = new Map()); // call id → { cmds, start }: calls whose output may name a running command
  if (line.includes('_call_output"')) { const m = /"call_id":"([^"]+)"/.exec(line); if (!m || !calls.has(m[1])) return; }
  else if (!line.includes('exec_command') && !line.includes('write_stdin') && !line.includes('"name":"wait"')) return;
  let o;
  try { o = JSON.parse(line); } catch { return; }
  const p = o.payload || {};
  if (o.type !== 'response_item' || !p.call_id) return;
  if (p.type === 'custom_tool_call' || p.type === 'function_call') {
    let cmds = null;
    if (p.name === 'exec') { if (/exec_command|write_stdin/.test(String(p.input || ''))) cmds = codexScriptCmds(p.input); } // code mode: a script
    else if (p.name === 'exec_command' || p.name === 'write_stdin' || p.name === 'wait') {
      let a = {};
      try { a = JSON.parse(p.arguments || '{}') || {}; } catch { /* ignore */ }
      if (p.name === 'exec_command') cmds = [String(a.cmd || '')];
      else if (p.name === 'write_stdin') cmds = [];
      else cmds = (c.cxCells && c.cxCells.get(String(a.cell_id))) || null; // the rest of a script that went on running
    }
    if (!cmds) return;
    calls.set(p.call_id, { cmds, start: Date.parse(o.timestamp || '') || 0 });
    if (calls.size > 64) calls.delete(calls.keys().next().value);
    return;
  }
  if (p.type !== 'custom_tool_call_output' && p.type !== 'function_call_output') return;
  const k = calls.get(p.call_id);
  if (!k) return;
  calls.delete(p.call_id);
  const texts = codexTexts(p.output).filter(Boolean);
  for (const t of texts) { // a script that was still running when exec returned: what it prints later comes with `wait`
    const cell = /^Script running with cell ID (\S+)/m.exec(t);
    if (cell) { const cells = c.cxCells || (c.cxCells = new Map()); cells.set(cell[1], k.cmds); if (cells.size > 32) cells.delete(cells.keys().next().value); }
  }
  const found = codexRunning(texts), fresh = found.filter((f) => !map.has(`cx-${f.pid}`));
  for (const f of found) {
    const id = `cx-${f.pid}`;
    let x = map.get(id);
    if (!x) {
      if (!k.cmds.length || (c.cxEnded && c.cxEnded.has(f.pid))) continue; // a poll of one never seen starting, or one already over
      // which call it was: certain with one; with several, taken in order (the daemon's own list corrects it, codexNames)
      const cmd = fresh.length === k.cmds.length ? k.cmds[fresh.indexOf(f)] : '';
      x = { id, kind: 'shell', name: cmd.replace(/\s+/g, ' ').trim().slice(0, 60), status: 'running', start: k.start || Date.parse(o.timestamp || '') || 0, end: 0, bg: true, shell: true, cmd, taskId: id, out: '' };
      map.set(id, x);
    }
    if (x.status === 'running') codexShellOut(x, f.out, false);
  }
}

function subagents(agent, cwd, id, since = 0) {
  if (!UUID_RE.test(String(id || ''))) return [];
  let file = '';
  if (agent === 'claude') file = claudeFile(cwd, id);
  else if (agent === 'codex') file = codexFile(id); // (remembered: a background command keeps this polled for hours)
  if (!file || !exists(file)) return [];
  let c = subCache.get(id);
  try {
    const stt = fs.statSync(file), size = stt.size;
    if (!c || c.file !== file || size < c.pos) { // first look (or the file was replaced): start from the tail
      c = { file, pos: Math.max(0, size - SUB_TAIL), carry: '', dec: new StringDecoder('utf8'), map: new Map(), skip: size > SUB_TAIL, live: false };
      subCache.delete(id); subCache.set(id, c);
      if (subCache.size > 24) subCache.delete(subCache.keys().next().value);
    }
    if (size > c.pos) {
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(Math.min(4 * 1024 * 1024, size - c.pos));
        while (c.pos < size) {
          const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - c.pos), c.pos);
          if (n <= 0) break;
          c.pos += n;
          const lines = (c.carry + c.dec.write(buf.subarray(0, n))).split('\n');
          c.carry = lines.pop(); // an entry still being written: finish it next time
          if (c.skip && lines.length) { lines.shift(); c.skip = false; } // a tail starts in the middle of an entry
          for (const line of lines) subagentLine(agent, c, line);
        }
      } finally { fs.closeSync(fd); }
    }
    c.live = true; // from here on, whatever finishes finishes now
    c.mtime = stt.mtimeMs;
  } catch { /* ignore */ }
  if (!c) return [];
  const now = Date.now(), out = [];
  const latest = new Map(); // a sub-agent set to work again shows once, as its latest run
  for (const x of c.map.values()) if (x.agentId) latest.set(x.agentId, x.id);
  for (const x of c.map.values()) {
    if (x.agentId && latest.get(x.agentId) !== x.id) continue;
    if (x.status === 'running' && x.bg && x.agentId) { // still writing its own transcript?
      try {
        if (now - fs.statSync(path.join(path.dirname(file), id, 'subagents', `agent-${x.agentId}.jsonl`)).mtimeMs > SUB_LOST) { c.map.delete(x.id); continue; }
      } catch { // not there (yet) — and never, for a copied session: its sub-agents ran under the session it was copied from
        if (c.live && now - (x.start || now) > SUB_NEVER) { c.map.delete(x.id); continue; }
      }
    }
    if (x.status === 'running' && agent !== 'claude' && !x.shell && now - (c.mtime || now) > SUB_LOST) { c.map.delete(x.id); continue; } // Codex: no end was ever written (a background command runs on with the transcript still)
    if (x.status === 'running' && x.shell && now - (x.start || now) > SHELL_LOST) { c.map.delete(x.id); continue; } // its end never came (the agent was closed)
    if (x.status !== 'running' && x.start < since && x.end < since) { if (now - Math.max(x.start, x.end) > 3600000) c.map.delete(x.id); continue; }
    out.push({ id: x.id, look: x.agentId ? `ag:${x.agentId}` : x.id, kind: x.kind, name: x.name, status: x.status, start: x.start, ...(x.shell ? { task: x.taskId || '', cmd: x.cmd || '' } : {}) });
  }
  if (agent === 'codex') codexNames(id, c);
  // at most 12, but never one still running (a long list of finished ones must not push a live one off)
  const live = out.filter((x) => x.status === 'running'), past = out.filter((x) => x.status !== 'running');
  return [...past.slice(-Math.max(0, 12 - live.length)), ...live].sort((a, b) => a.start - b.start);
}

/**
 * A background command's output file: Claude writes it to <temp>/claude/<project>/<session>/tasks/<task>.output while
 * the command runs. Codex keeps it in memory only: MinsuTerm writes one (codexBgOutput).
 */
function bgOutputFile(sid, task) {
  if (!UUID_RE.test(String(sid || '')) || !/^[A-Za-z0-9_-]{3,64}$/.test(String(task || ''))) return '';
  if (/^cx-\d+$/.test(task)) return codexBgOutput(sid, task);
  const root = path.join(os.tmpdir(), 'claude');
  try {
    for (const d of fs.readdirSync(root)) {
      const f = path.join(root, d, sid, 'tasks', `${task}.output`);
      if (exists(f)) return f;
    }
  } catch { /* ignore */ }
  return '';
}
ipcMain.handle('agent:bgOutput', (_e, sid, task) => bgOutputFile(sid, task));
// the PowerShell script that follows a background command's output, as a file (UTF-8 with a BOM, which Windows
// PowerShell needs to read non-ASCII text right): the viewer tab then runs one short line instead of a page of base64
ipcMain.handle('agent:bgScript', (_e, task, script) => {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(String(task || '')) || typeof script !== 'string' || script.length > 20000) return '';
  try {
    const dir = path.join(os.tmpdir(), 'minsuterm');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `bg-${task}.ps1`);
    fs.writeFileSync(f, '﻿' + script, 'utf8');
    return f;
  } catch { return ''; }
});

/**
 * Stop a background command an agent left running. Claude runs it as `bash -c "… eval '<command>' …"` (zsh / sh on
 * macOS) under its own process: find that shell — under the tab's process tree, or under the Claude process
 * that names the session on its command line (a background session the tab is attached to) — by the exact
 * command, and end its whole tree. Nothing else is touched: no match, nothing stopped. Codex: codexBgStop.
 */
async function bgStop(tabId, sid, command, task) {
  const cx = /^cx-(\d{1,12})$/.exec(String(task || ''));
  if (cx) return codexBgStop(tabId, sid, cx[1], String(command || ''));
  const cmd = String(command || '');
  if (!cmd || cmd.length > 20000) return false;
  const Q = String.fromCharCode(39); // a single quote, escaped the shell's way inside one: '\''
  const needle = `eval ${Q}${cmd.split(Q).join(Q + '\\' + Q + Q)}${Q}`;
  const rows = await processRows();
  if (!rows.length) return false;
  const kids = new Map(), byId = new Map();
  for (const r of rows) { byId.set(r.pid, r); if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
  const roots = [];
  const rec = ptys.get(tabId);
  const tabRoot = rec && (rec.p.pid || rec.pid);
  if (tabRoot) roots.push(tabRoot);
  if (UUID_RE.test(String(sid || ''))) for (const r of rows) if (/claude/i.test(r.name) && r.cmd.includes(sid)) roots.push(r.pid);
  const seen = new Set(), stack = [...roots];
  let hit = 0;
  while (stack.length && !hit) {
    const id = stack.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const r = byId.get(id);
    if (r && id !== tabRoot && /(?:^|[\\/])(?:bash|zsh|sh)(?:\.exe)?$/i.test(r.name.replace(/\s.*$/, '')) && r.cmd.includes(needle)) { hit = id; break; }
    stack.push(...(kids.get(id) || []));
  }
  if (!hit) return false;
  await endTree(hit, kids);
  return true;
}
/** End a process and everything under it (kids: pid → [child pids]). */
async function endTree(hit, kids) {
  if (IS_WIN) {
    await new Promise((res) => execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(hit), '/T', '/F'], { windowsHide: true }, () => res()));
  } else {
    const all = [], st = [hit];
    while (st.length) { const id = st.pop(); all.push(id); st.push(...(kids.get(id) || [])); }
    for (const id of all.reverse()) { try { process.kill(id, 'SIGTERM'); } catch { /* gone */ } }
  }
}

/*
 * Codex's terminal UI runs its sessions in a local app-server daemon shared by every `codex` started from a terminal
 * (~/.codex/packages/app-server-daemon), and its background terminals run there too — under the daemon's command
 * runner, not under the tab. The daemon lists them per session (process id, item id, the exact command), ends one,
 * and streams their output to a client that joins the session. `codex app-server proxy` pipes stdio to the daemon's
 * control socket, which speaks JSON-RPC over WebSocket.
 */
const CX_SOCK = path.join(CODEX_HOME, 'app-server-control', 'app-server-control.sock');
/** → a connection { request(method, params) → result | null, close(), onNote(method, params), onClose, closed } or null (no daemon). */
function codexDaemon() {
  const exe = path.join(CODEX_HOME, 'packages', 'app-server-daemon', 'current', 'bin', IS_WIN ? 'codex.exe' : 'codex');
  if (!exists(exe)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let p;
    try { p = spawn(exe, ['app-server', 'proxy', '--sock', CX_SOCK], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch { resolve(null); return; }
    const crypto = require('crypto');
    const waits = new Map();
    let raw = Buffer.alloc(0), frag = [], open = false, ready = false, seq = 0;
    const frame = (op, data) => { // client frames are masked
      const mask = crypto.randomBytes(4), n = data.length;
      const head = n < 126 ? Buffer.from([0x80 | op, 0x80 | n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
      if (n >= 126) { head[0] = 0x80 | op; head[1] = 0x80 | (n < 65536 ? 126 : 127); if (n < 65536) head.writeUInt16BE(n, 2); else head.writeBigUInt64BE(BigInt(n), 2); }
      const body = Buffer.from(data);
      for (let i = 0; i < n; i++) body[i] ^= mask[i & 3];
      return Buffer.concat([head, mask, body]);
    };
    const send = (o) => { if (!d.closed) try { p.stdin.write(frame(1, Buffer.from(JSON.stringify(o), 'utf8'))); } catch { /* gone */ } };
    const d = {
      closed: false, onNote: null, onClose: null,
      request(method, params, ms = 8000) {
        if (d.closed) return Promise.resolve(null);
        const id = ++seq;
        return new Promise((res) => {
          const t = setTimeout(() => { waits.delete(id); res(null); }, ms);
          waits.set(id, (r) => { clearTimeout(t); waits.delete(id); res(r); });
          send({ id, method, params });
        });
      },
      close() { if (!d.closed) { d.closed = true; try { p.kill(); } catch { /* gone */ } } },
    };
    const gone = () => {
      if (d.gone) return;
      d.gone = true; d.closed = true;
      for (const w of [...waits.values()]) w(null);
      if (!ready) resolve(null);
      if (d.onClose) d.onClose();
    };
    p.on('error', gone);
    p.on('exit', gone);
    p.stdin.on('error', () => {});
    const timer = setTimeout(() => { if (!ready) d.close(); }, 6000);
    const message = (text) => {
      let o;
      try { o = JSON.parse(text); } catch { return; }
      if (o.id != null && !o.method) { const w = waits.get(o.id); if (w) w(o.error ? null : (o.result || {})); }
      else if (o.method && o.id == null && d.onNote) d.onNote(o.method, o.params || {});
      // a request from the daemon (an approval…) is left to Codex's own UI, which answers it
    };
    p.stdout.on('data', (chunk) => {
      raw = Buffer.concat([raw, chunk]);
      if (!open) {
        const i = raw.indexOf('\r\n\r\n');
        if (i < 0) return;
        if (!/^HTTP\/1\.1 101/.test(raw.subarray(0, 12).toString())) { d.close(); return; }
        raw = raw.subarray(i + 4); open = true;
        d.request('initialize', { clientInfo: { name: 'minsuterm', title: 'MinsuTerm', version: app.getVersion() }, capabilities: { experimentalApi: true, requestAttestation: false } }).then((r) => {
          clearTimeout(timer);
          if (!r) { d.close(); resolve(null); return; }
          send({ method: 'initialized' });
          ready = true; resolve(d);
        });
      }
      while (raw.length >= 2) {
        const fin = raw[0] & 0x80, op = raw[0] & 15;
        let len = raw[1] & 127, off = 2;
        if (len === 126) { if (raw.length < 4) return; len = raw.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (raw.length < 10) return; len = Number(raw.readBigUInt64BE(2)); off = 10; }
        if (raw[1] & 0x80) off += 4; // (a server does not mask; skip a key if one came)
        if (raw.length < off + len) return;
        const body = raw.subarray(off, off + len);
        raw = raw.subarray(off + len);
        if (op === 8) { d.close(); return; }
        if (op === 9) { try { p.stdin.write(frame(10, body)); } catch { /* gone */ } continue; }
        if (op === 1 || op === 2 || op === 0) {
          frag.push(Buffer.from(body));
          if (fin) { const all = Buffer.concat(frag); frag = []; message(all.toString('utf8')); }
        }
      }
    });
    p.stdin.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}

/**
 * The exact command (and item id) of each background command the transcript knows only from a tool output: from the
 * daemon's list for the session, asked once a new one shows (a few times at most, a few seconds apart). A session
 * the daemon does not run (Codex inside the tab) is asked again only a minute later.
 */
function codexNames(sid, c) {
  const want = [...c.map.values()].filter((x) => x.shell && x.status === 'running' && !x.named && (x.asked || 0) < 5);
  const now = Date.now();
  if (!want.length || c.cxAsking || now - (c.cxAskedAt || 0) < (c.cxNoDaemon ? 60000 : 4000)) return;
  c.cxAsking = true; c.cxAskedAt = now;
  for (const x of want) x.asked = (x.asked || 0) + 1;
  codexDaemon().then(async (d) => {
    const r = d ? await d.request('thread/backgroundTerminals/list', { threadId: sid }) : null;
    if (d) d.close();
    c.cxNoDaemon = !r;
    for (const t of (r && Array.isArray(r.data) ? r.data : [])) {
      const x = c.map.get(`cx-${t.processId}`);
      if (!x || !x.shell || typeof t.command !== 'string' || !t.command) continue;
      x.cmd = t.command; x.name = t.command.replace(/\s+/g, ' ').trim().slice(0, 60); x.itemId = String(t.itemId || ''); x.named = true;
    }
  }).catch(() => {}).finally(() => { c.cxAsking = false; });
}

/**
 * A Codex background command's output, for its viewer tab: what the transcript holds of it, then everything it prints
 * from here on, fed from the daemon (codexFollow) — or, when the daemon does not run the session, what the transcript
 * gets later (the agent's polls, the whole output once it ends).
 */
function codexBgOutput(sid, task) {
  const c = subCache.get(sid), x = c && c.map.get(task);
  if (!x || !x.shell) return '';
  if (!x.file || !exists(x.file)) {
    try {
      const dir = path.join(os.tmpdir(), 'minsuterm');
      fs.mkdirSync(dir, { recursive: true });
      for (const n of fs.readdirSync(dir)) { // the ones of earlier days go
        if (!/^cx-.+\.output$/.test(n)) continue;
        const f = path.join(dir, n);
        try { if (Date.now() - fs.statSync(f).mtimeMs > 86400000) fs.unlinkSync(f); } catch { /* in use */ }
      }
      const f = path.join(dir, `cx-${sid}-${task.slice(3)}.output`);
      fs.writeFileSync(f, x.out || '');
      x.file = f; x.live = false;
    } catch { return ''; }
  }
  codexFollow(sid, x);
  return x.file;
}
/**
 * Feed a background command's output into its file as it prints: join the session in the daemon (it then streams every
 * command's output deltas), keep this command's (by its item id), until it ends — or the session closes, or 64 MB.
 */
async function codexFollow(sid, x) {
  if (x.follow || x.status !== 'running' || !x.file) return;
  x.follow = true;
  const d = await codexDaemon();
  if (!d) { x.follow = false; return; }
  const pid = x.id.slice(3), early = []; // deltas that came before this command's item was known
  let item = x.itemId || '', wrote = 0, known = false;
  const write = (s) => {
    try { fs.appendFileSync(x.file, s); } catch { d.close(); return; }
    wrote += s.length;
    if (wrote > 64 * 1024 * 1024) d.close();
  };
  const watch = setInterval(() => { if (x.status !== 'running') d.close(); }, 3000); // the transcript says it ended
  d.onClose = () => { clearInterval(watch); x.follow = false; }; // (x.live stays: the transcript's copy of the output must not follow what the feed wrote)
  d.onNote = (m, q) => {
    if (q.threadId !== sid) return;
    if (m === 'item/commandExecution/outputDelta' && typeof q.delta === 'string') {
      if (known) { if (q.itemId === item) write(q.delta); } else if (early.length < 5000) early.push(q);
    } else if (m === 'item/commandExecution/terminalInteraction' && !item && String(q.processId) === pid) item = String(q.itemId || '');
    else if (m === 'item/completed' && item && q.item && q.item.id === item) d.close();
    else if (m === 'thread/closed') d.close();
  };
  if (!(await d.request('thread/resume', { threadId: sid, excludeTurns: true }))) { d.close(); return; } // not a session the daemon runs
  for (let i = 0; i < 8 && !item && !d.closed; i++) { // which item is this command's: the daemon's list says
    const r = await d.request('thread/backgroundTerminals/list', { threadId: sid });
    const t = r && Array.isArray(r.data) && r.data.find((q) => String(q.processId) === pid);
    if (t && t.itemId) item = String(t.itemId);
    else await new Promise((res) => setTimeout(res, 1500));
  }
  if (!item || d.closed) { d.close(); return; }
  x.live = true; // from here on the feed writes the file, not the transcript
  for (const q of early.splice(0)) if (q.itemId === item) write(q.delta);
  known = true;
}

/**
 * Stop a Codex background command: the daemon running the session ends it by the session and Codex's process id —
 * exactly that command. When the daemon does not run the session (Codex runs it inside the tab), its own shell for
 * exactly that command under the tab is ended: PowerShell `-Command "try { [Console]::OutputEncoding=… } catch {}
 * <command>"` on Windows, `<shell> -lc <command>` elsewhere — only if exactly one such process is found.
 */
async function codexBgStop(tabId, sid, pid, cmd) {
  if (UUID_RE.test(String(sid || ''))) {
    const d = await codexDaemon();
    const r = d ? await d.request('thread/backgroundTerminals/terminate', { threadId: sid, processId: pid }) : null;
    if (d) d.close();
    if (r) return r.terminated === true; // the daemon runs this session: it ended it, or has no such command running
  }
  const one = (s) => String(s).replace(/\s+/g, ' ').trim();
  const want = one(cmd);
  if (!want || cmd.length > 20000) return false;
  const rec = ptys.get(tabId), root = rec && (rec.p.pid || rec.pid);
  const rows = root ? await processRows() : [];
  if (!rows.length) return false;
  const tails = IS_WIN ? [` -Command "try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {} ${want}"`] : [` -lc ${want}`, ` -c ${want}`];
  const shellRe = IS_WIN ? /^(?:powershell|pwsh)\.exe$/i : /(?:^|\/)(?:bash|zsh|sh)$/;
  const kids = new Map(), byId = new Map();
  for (const r of rows) { byId.set(r.pid, r); if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
  const hits = [], seen = new Set(), stack = [...(kids.get(root) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const r = byId.get(id);
    if (r && shellRe.test(r.name) && tails.some((t) => one(r.cmd).endsWith(one(t)))) hits.push(id);
    stack.push(...(kids.get(id) || []));
  }
  if (hits.length !== 1) return false; // none — or the same command twice: which one is not known
  await endTree(hits[0], kids);
  return true;
}
/** Every process: [{ pid, ppid, name, cmd }] (Windows: one WMI query; elsewhere ps). */
function processRows() {
  return new Promise((res) => {
    if (IS_WIN) {
      const ps = 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$(([string]$_.CommandLine) -replace "[\\r\\n\\t]", " ")" }';
      execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${ps}`],
        { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, out) => res(err ? [] : parseRows(out)));
    } else {
      execFile('/bin/ps', ['-axo', 'pid=,ppid=,ucomm=,args='], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
        if (err) return res([]);
        res(String(out).split('\n').map((l) => l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], name: m[3], cmd: m[4] })));
      });
    }
  });
}
function parseRows(out) {
  return String(out).split(/\r?\n/).map((l) => l.split('\t')).filter((a) => a.length >= 3 && +a[0]).map((a) => ({ pid: +a[0], ppid: +a[1], name: a[2] || '', cmd: a.slice(3).join('\t') }));
}
ipcMain.handle('agent:bgStop', (_e, tabId, sid, command, task) => bgStop(tabId, sid, command, task));
ipcMain.handle('agent:subagents', (_e, agent, cwd, id, since) => subagents(agent, cwd, id, since));

/** Was a Claude conversation compacted at or after `since`? (its earlier screen history is gone then) */
const compactCache = new Map(); // file → { pos, carry, dec, times }: the place in the transcript is kept, like subagents() does
ipcMain.handle('agent:compactedSince', (_e, agent, cwd, id, since) => {
  if (agent !== 'claude' || !UUID_RE.test(String(id || ''))) return false;
  const file = claudeFile(cwd, id);
  try {
    const size = fs.statSync(file).size;
    let rec = compactCache.get(file);
    if (!rec || size < rec.pos) { // first look (or the file was replaced): from the start
      rec = { pos: 0, carry: '', dec: new StringDecoder('utf8'), times: [] };
      compactCache.set(file, rec);
      if (compactCache.size > 50) compactCache.delete(compactCache.keys().next().value);
    }
    if (size > rec.pos) { // only what was appended: this is asked on mouse-over, and a transcript can be 100 MB
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(Math.min(4 * 1024 * 1024, size - rec.pos));
        while (rec.pos < size) {
          const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - rec.pos), rec.pos);
          if (n <= 0) break;
          rec.pos += n;
          const lines = (rec.carry + rec.dec.write(buf.subarray(0, n))).split('\n');
          rec.carry = lines.pop(); // an entry still being written: finished next time
          for (const line of lines) {
            if (!line.includes('compact_boundary')) continue;
            try { const o = JSON.parse(line); if (o.subtype === 'compact_boundary') rec.times.push(Date.parse(o.timestamp || '') || 0); } catch { /* not an entry */ }
          }
        }
      } finally { fs.closeSync(fd); }
    }
    return rec.times.some((t) => t >= since - 2000);
  } catch { return false; }
});

ipcMain.handle('agent:turn', (_e, agent, cwd, id) => {
  const state = turnState(agent, cwd, id);
  let mtime = 0;
  try {
    const f = agent === 'claude' ? claudeFile(cwd, id) : codexFile(id);
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
  try {
    const list = JSON.parse(fs.readFileSync(TRASH_INDEX, 'utf8'));
    if (Array.isArray(list)) return list;
  } catch (err) {
    if (err && err.code) return []; // no index yet, or it cannot be read right now
  }
  setAside(TRASH_INDEX); // a damaged index is kept instead of being written over by the next change
  return [];
}
function writeTrash(list) {
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  const tmp = TRASH_INDEX + '.tmp'; // written whole, then swapped in (like the store): a crash cannot cut the index short
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, TRASH_INDEX);
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
ipcMain.on('open:folder', (_e, dir) => { if (isFolder(dir)) shell.openPath(dir); });

/* 진행도 보기 (src/progress.js): the bundled skills' state, 구축하기 (install them), a folder's page */
ipcMain.handle('progress:status', () => progress.status());
ipcMain.handle('progress:setup', () => progress.setup());
ipcMain.handle('progress:open', (_e, dir) => {
  if (!isFolder(dir) || !fs.existsSync(dir)) throw new Error('폴더를 찾지 못했어요');
  return progress.open(dir);
});
ipcMain.handle('progress:summary', (_e, dirs) => (Array.isArray(dirs) ? dirs.slice(0, 60) : [dirs]).map((d) => (isFolder(d) ? progress.summary(d) : null)));
ipcMain.on('open:userdata', () => shell.openPath(app.getPath('userData')));

/*
 * 성능 기록: what the app is busy with, recorded where it is slow (a long-running window, a long session) rather than
 * guessed at in a fresh one. CPU profiles of the window (renderer) and of the main process over `ms`, the CPU each of
 * MinsuTerm's processes used meanwhile, and the window's own snapshot of its state → <userData>/diagnostics/<time>/,
 * plus summary.txt: the functions that took the most time, readable without any tool.
 */
let diagBusy = false;
ipcMain.handle('diag:record', async (_e, ms, snapshot) => {
  if (diagBusy || !win) return { ok: false, error: 'busy' };
  diagBusy = true;
  const dur = Math.max(5000, Math.min(120000, Number(ms) || 30000));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(app.getPath('userData'), 'diagnostics', stamp);
  const dbg = win.webContents.debugger;
  const inspector = require('inspector'), ses = new inspector.Session();
  const post = (m, p = {}) => new Promise((res, rej) => ses.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  let attached = false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    try { dbg.attach('1.3'); attached = true; } catch { /* DevTools open: it holds the debugger */ }
    if (attached) { await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 500 }); await dbg.sendCommand('Profiler.start'); }
    ses.connect(); await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 }); await post('Profiler.start');
    const m0 = app.getAppMetrics();
    let lag = 0, last = Date.now(); const lagT = setInterval(() => { const n = Date.now(); lag = Math.max(lag, n - last - 50); last = n; }, 50);
    await new Promise((r) => setTimeout(r, dur));
    clearInterval(lagT);
    const m1 = app.getAppMetrics();
    const out = { renderer: null, main: null };
    if (attached) { out.renderer = (await dbg.sendCommand('Profiler.stop')).profile; fs.writeFileSync(path.join(dir, 'renderer.cpuprofile'), JSON.stringify(out.renderer)); }
    out.main = (await post('Profiler.stop')).profile; fs.writeFileSync(path.join(dir, 'main.cpuprofile'), JSON.stringify(out.main));
    const procs = m1.map((p) => ({ pid: p.pid, type: p.type, name: p.name || '', cpuPercent: +(p.cpu && p.cpu.percentCPUUsage || 0).toFixed(1), memoryMB: Math.round(((p.memory && p.memory.workingSetSize) || 0) / 1024) }));
    const info = { app: app.getVersion(), electron: process.versions.electron, platform: process.platform, durationMs: dur, mainLoopMaxLagMs: lag, processesAtStart: m0.length, processes: procs, window: snapshot || null };
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(info, null, 1));
    fs.writeFileSync(path.join(dir, 'summary.txt'), [`MinsuTerm ${info.app} · ${dur / 1000}s`, '', 'processes (CPU % of one core, memory MB):', ...procs.map((p) => `  ${p.type.padEnd(10)} ${String(p.cpuPercent).padStart(6)}%  ${String(p.memoryMB).padStart(6)} MB  ${p.name}`), '',
      ...(out.renderer ? ['window (renderer): most time by function', ...topSelf(out.renderer, 40), ''] : ['window (renderer): not recorded (DevTools open?)', '']),
      'main process: most time by function', ...topSelf(out.main, 20), ''].join('\n'));
    return { ok: true, dir };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    try { ses.disconnect(); } catch { /* ignore */ }
    if (attached) { try { dbg.detach(); } catch { /* ignore */ } }
    diagBusy = false;
  }
});
/** The functions a CPU profile spent the most self time in: "  12.3%  name  file:line". */
function topSelf(profile, n) {
  if (!profile || !profile.nodes || !profile.samples) return ['  (no samples)'];
  const byId = new Map(profile.nodes.map((x) => [x.id, x])), self = new Map();
  const dt = profile.timeDeltas || [];
  let total = 0;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id); if (!node) return;
    const t = Math.max(0, dt[i] || 0); total += t;
    const f = node.callFrame || {}, key = `${f.functionName || '(anonymous)'}  ${String(f.url || '').split(/[\\/]/).pop()}:${(f.lineNumber || 0) + 1}`;
    self.set(key, (self.get(key) || 0) + t);
  });
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `  ${((100 * t) / Math.max(1, total)).toFixed(1).padStart(5)}%  ${k}`);
}
ipcMain.on('win:devtools', () => { if (win) win.webContents.toggleDevTools(); });

// A Notification nothing refers to is garbage-collected, and a later click on it then no longer focuses the tab:
// each one is kept until it closes ('close' is not reported in every case, so only the latest few are kept).
const notifications = new Set();
ipcMain.on('notify', (_e, { title, body, tabId }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: false });
  notifications.add(n);
  if (notifications.size > 20) notifications.delete(notifications.values().next().value);
  n.on('close', () => notifications.delete(n));
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
  // the saved position counts only while a display still shows part of it (a monitor may have been unplugged since)
  const shown = Number.isFinite(w.x) && Number.isFinite(w.y) && screen.getAllDisplays().some(({ workArea: a }) => (
    w.x < a.x + a.width && w.x + w.width > a.x && w.y < a.y + a.height && w.y + w.height > a.y));
  win = new BrowserWindow({
    width: w.width,
    height: w.height,
    x: shown ? w.x : undefined, // no position: centred
    y: shown ? w.y : undefined,
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
  // A page that dies is loaded again (app:init then reaps its ptys) — unless it keeps dying: one that crashes while
  // it starts would be reloaded for ever.
  let crashes = [];
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer gone', details);
    if (!win || win.isDestroyed()) return;
    const now = Date.now();
    crashes = crashes.filter((t) => now - t < 60000).concat(now);
    if (crashes.length < 3) { win.reload(); return; }
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'MinsuTerm',
      message: T('화면이 계속 멈춰서 다시 불러오지 않았습니다. MinsuTerm을 종료한 뒤 다시 실행해 주세요.'),
      detail: `${details.reason} (${details.exitCode})`,
      noLink: true,
    }).catch(() => {});
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
  progress.refreshInstalled().catch(() => {}); // the skills MinsuTerm installed follow the app's version
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
      if (step.startsWith('drag:')) { // real mouse drag: "drag:<from selector> >> <to selector or x,y> [@ dx,dy]"
        const [fromSel, rest] = step.slice(5).split('>>').map((x) => x.trim());
        const [toSel, off] = rest.split('@').map((x) => x.trim());
        const pt = async (sel) => (/^\d+,\d+$/.test(sel) ? sel.split(',').map(Number)
          : js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`));
        const [x1, y1] = await pt(fromSel);
        let [x2, y2] = await pt(toSel);
        if (off) { const [dx, dy] = off.split(',').map(Number); x2 += dx; y2 += dy; }
        const wc = win.webContents;
        wc.sendInputEvent({ type: 'mouseMove', x: x1, y: y1 });
        wc.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 30; i++) {
          const k = i / 30, ease = k * k * (3 - 2 * k);
          wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x1 + (x2 - x1) * ease), y: Math.round(y1 + (y2 - y1) * ease), button: 'left', modifiers: ['leftButtonDown'] });
          await wait(22);
        }
        await wait(350);
        wc.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 });
        log.push(`drag ${x1},${y1} -> ${x2},${y2}`);
        continue;
      }
      if (step.startsWith('hold:')) { // "hold:<char>*<n>": a key held down — one press, the OS's repeat delay, then auto-repeats
        const [ch, nS] = step.slice(5).split('*');
        const keyCode = ch === '\\b' ? 'Backspace' : ch, n = Number(nS) || 30, typed = ch !== '\\b';
        win.webContents.focus();
        for (let i = 0; i < n; i++) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode, isAutoRepeat: i > 0 });
          if (typed) win.webContents.sendInputEvent({ type: 'char', keyCode: ch, isAutoRepeat: i > 0 });
          await wait(i === 0 ? 500 : 33);
          if (step.endsWith('*shots') && i > 0 && i % 8 === 0) await shot(`hold-${String(i).padStart(2, '0')}`); // what it looks like while held
        }
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
        log.push(`hold ${ch} x${n}`);
        continue;
      }
      if (step === 'rec:start' || step === 'rec:stop') { // record what the window paints (other windows on top do not matter): rec/<n>_<ms>.jpg, ~30 fps
        if (step === 'rec:stop') { win.webContents.endFrameSubscription(); log.push('rec stop'); continue; }
        const dir = path.join(TEST_DIR, 'rec'); fs.mkdirSync(dir, { recursive: true });
        let last = 0, n = 0; const t0 = Date.now();
        win.webContents.beginFrameSubscription(false, (image) => {
          const now = Date.now(); if (now - last < 32) return; last = now;
          fs.writeFile(path.join(dir, `${String(n++).padStart(5, '0')}_${now - t0}.jpg`), image.toJPEG(95), () => {});
        });
        log.push('rec start');
        continue;
      }
      if (step.startsWith('size:')) { // "size:<w>x<h>": resize the window (a maximised screen behaves differently from the default 1280 x 800)
        const [w, h2] = step.slice(5).split('x').map(Number);
        win.setBounds({ x: 0, y: 0, width: w, height: h2 });
        await wait(800);
        continue;
      }
      if (step.startsWith('prof:')) { // "prof:<ms>|<keys>": CPU profiles of the renderer and of main while typing <keys>
        const [msS, keysS = ''] = step.slice(5).split('>>');
        const ms = Number(msS) || 5000, dbg = win.webContents.debugger;
        const inspector = require('inspector'), ses = new inspector.Session(); ses.connect();
        const post = (m, p = {}) => new Promise((res, rej) => ses.post(m, p, (e, r) => (e ? rej(e) : res(r))));
        try { dbg.attach('1.3'); } catch { /* already */ }
        await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 }); await dbg.sendCommand('Profiler.start');
        await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 200 }); await post('Profiler.start');
        let lag = 0, last = Date.now(); const lagT = setInterval(() => { const n = Date.now(); lag = Math.max(lag, n - last - 20); last = n; }, 20);
        const t0 = Date.now();
        win.webContents.focus();
        for (const ch of keysS.replace(/\\n/g, '\n')) {
          const keyCode = ch === '\n' ? 'Return' : ch === ' ' ? 'Space' : ch;
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
          if (ch !== '\n') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
          await wait(90);
        }
        await wait(Math.max(0, ms - (Date.now() - t0)));
        clearInterval(lagT);
        const r = await dbg.sendCommand('Profiler.stop'); fs.writeFileSync(path.join(TEST_DIR, 'renderer.cpuprofile'), JSON.stringify(r.profile));
        const m = await post('Profiler.stop'); fs.writeFileSync(path.join(TEST_DIR, 'main.cpuprofile'), JSON.stringify(m.profile));
        ses.disconnect(); try { dbg.detach(); } catch { /* ignore */ }
        log.push(`prof: main event-loop lag max ${lag} ms`);
        continue;
      }
      if (step.startsWith('keys:')) { // real key presses, typed at a human pace ("\n" = Enter)
        win.webContents.focus();
        for (const ch of step.slice(5).replace(/\\n/g, '\n').replace(/\\b/g, '\b')) {
          const keyCode = ch === '\n' ? 'Return' : ch === '\b' ? 'Backspace' : ch === ' ' ? 'Space' : ch;
          const modifiers = /[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(ch) ? ['shift'] : [];
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
          if (ch !== '\n' && ch !== '\b') win.webContents.sendInputEvent({ type: 'char', keyCode: ch, modifiers });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
          await wait(ch === '\b' ? 33 : 35 + Math.random() * 45); // a held Backspace repeats about 30 times a second
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

app.on('before-quit', () => { saveStoreNow(); progress.stopServer(); });
app.on('window-all-closed', () => {
  killAll();
  if (probe) { try { probe.kill(); } catch { /* ignore */ } }
  saveStoreNow();
  app.quit();
});
