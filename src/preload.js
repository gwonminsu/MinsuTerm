'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, fn) => {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('mt', {
  platform: process.platform, // 'win32' | 'darwin' | 'linux'
  // Windows build number (19045 = Windows 10 22H2, 26100 = Windows 11 24H2 …); 0 elsewhere, or if it cannot be read
  osBuild: process.platform === 'win32' ? parseInt(String(process.getSystemVersion ? process.getSystemVersion() : '').split('.')[2], 10) || 0 : 0,
  init: () => ipcRenderer.invoke('app:init'),
  onMenuEdit: (fn) => on('menu:edit', fn), // macOS Edit menu (⌘C / ⌘V / ⌘A) → the focused terminal

  pty: {
    create: (spec) => ipcRenderer.invoke('pty:create', spec),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    pause: (id) => ipcRenderer.send('pty:pause', id), // flow control: hold the pty's output back …
    resume: (id) => ipcRenderer.send('pty:resume', id), // … and let it go on
    onData: (fn) => on('pty:data', fn),
    onExit: (fn) => on('pty:exit', fn),
    onAgent: (fn) => on('pty:agent', fn),
    claim: (id, cols, rows) => ipcRenderer.invoke('pty:claim', id, cols, rows), // a window a tab was dragged into takes its pty
  },
  // a tab dragged out of the window: a window of its own (solo), which asks what it is to show
  tab: {
    detach: (payload) => ipcRenderer.invoke('tab:detach', payload),
    report: (list) => ipcRenderer.send('tabs:report', list), // this window's tabs, for the others to know
    onRemote: (fn) => on('tabs:remote', fn), // the other windows' tabs
    focus: (tabId) => ipcRenderer.send('win:focusTab', tabId), // go to a tab in whichever window holds it
    onAdopt: (fn) => on('tab:adopt', fn), // a tab another window let go over this one: it joins these tabs
  },
  solo: { init: () => ipcRenderer.invoke('solo:init') },

  agent: {
    probe: (delays) => ipcRenderer.send('agent:probe', delays),
    sessions: (cwd, limit) => ipcRenderer.invoke('agent:sessions', cwd, limit),
    recent: (agent, cwd, sinceMs) => ipcRenderer.invoke('agent:recent', agent, cwd, sinceMs),
    has: (agent, cwd, id) => ipcRenderer.invoke('agent:has', agent, cwd, id),
    cdTarget: (cwd, line, shell) => ipcRenderer.invoke('agent:cdTarget', cwd, line, shell), // `cd X && claude`: X
    remove: (agent, cwd, id, title) => ipcRenderer.invoke('agent:delete', agent, cwd, id, title),
    trashList: () => ipcRenderer.invoke('trash:list'),
    trashRestore: (id) => ipcRenderer.invoke('trash:restore', id),
    trashPurge: (id) => ipcRenderer.invoke('trash:purge', id),
    lastPrompt: (agent, cwd, id) => ipcRenderer.invoke('agent:lastPrompt', agent, cwd, id),
    turn: (agent, cwd, id) => ipcRenderer.invoke('agent:turn', agent, cwd, id),
    usage: (agent, cwd, id) => ipcRenderer.invoke('usage:get', agent, cwd, id), // 사용량 게이지
    usageLinkState: () => ipcRenderer.invoke('usage:linkState'),
    usageLink: () => ipcRenderer.invoke('usage:link'),
    usageUnlink: () => ipcRenderer.invoke('usage:unlink'),
    subagents: (agent, cwd, id, since) => ipcRenderer.invoke('agent:subagents', agent, cwd, id, since),
    compactedSince: (agent, cwd, id, since) => ipcRenderer.invoke('agent:compactedSince', agent, cwd, id, since),
    bgOutput: (sid, task) => ipcRenderer.invoke('agent:bgOutput', sid, task),
    bgScript: (task, script) => ipcRenderer.invoke('agent:bgScript', task, script),
    bgStop: (tabId, sid, command, task) => ipcRenderer.invoke('agent:bgStop', tabId, sid, command, task),
    end: (tabId) => ipcRenderer.invoke('agent:end', tabId), // the tab's agent process, when its exit command did not end it
    rename: (cwd, id, name) => ipcRenderer.invoke('agent:rename', cwd, id, name), // a Claude conversation not open in a tab
  },

  store: {
    projects: (p) => ipcRenderer.send('store:projects', p),
    layout: (l) => ipcRenderer.send('store:layout', l),
    tasks: (t) => ipcRenderer.send('store:tasks', t),
    settings: (s) => ipcRenderer.send('store:settings', s),
    // what another window saved (one app, many windows)
    onSettings: (fn) => on('settings:changed', fn),
    onProjects: (fn) => on('projects:changed', fn),
    onTasks: (fn) => on('tasks:changed', fn),
  },

  fonts: () => ipcRenderer.invoke('fonts:list'),
  minecraftSounds: () => ipcRenderer.invoke('sounds:minecraft'),
  setLang: (lang) => ipcRenderer.send('app:lang', lang),
  setTitle: (t) => ipcRenderer.send('win:title', t),
  appearance: (a) => ipcRenderer.send('win:appearance', a),
  setTheme: (source) => ipcRenderer.invoke('theme:set', source),
  onThemeUpdated: (cb) => ipcRenderer.on('theme:updated', (_e, dark) => cb(dark)),
  bgImage: {
    pick: () => ipcRenderer.invoke('bg:pick'),
    get: () => ipcRenderer.invoke('bg:get'),
    clear: () => ipcRenderer.invoke('bg:clear'),
  },
  filePath: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  clipRead: () => ipcRenderer.invoke('clip:read'),
  clipWrite: (t) => ipcRenderer.send('clip:write', t),
  openExternal: (u) => ipcRenderer.send('open:external', u),
  openFolder: (d) => ipcRenderer.send('open:folder', d),
  progress: {
    status: () => ipcRenderer.invoke('progress:status'),
    setup: () => ipcRenderer.invoke('progress:setup'),
    open: (dir) => ipcRenderer.invoke('progress:open', dir),
    window: (dir, title) => ipcRenderer.invoke('progress:window', dir, title), // 진행도 in a window of its own
    room: (d) => ipcRenderer.invoke('progress:room', d), // (that window) its page's room request, answered by the main window
    summary: (dir) => ipcRenderer.invoke('progress:summary', dir),
  },
  openUserData: () => ipcRenderer.send('open:userdata'),
  diagRecord: (ms, snapshot) => ipcRenderer.invoke('diag:record', ms, snapshot),
  devtools: () => ipcRenderer.send('win:devtools'),
  notify: (n) => ipcRenderer.send('notify', n),
  attention: () => ipcRenderer.send('attention'),
  setRunning: (n) => ipcRenderer.send('app:running', n),

  onFocusTab: (fn) => on('focus-tab', fn),
  onWinFocus: (fn) => on('win:focus', fn),
});
