'use strict';
/*
 * 진행도 보기: the progress page for a folder, hosted by MinsuTerm itself.
 *
 * The record is the one the progress skills keep: <folder>/progress/data.json (and inbox.jsonl for what the page
 * sends back). MinsuTerm ships its own fork of that skill, minsuterm-progress (and minsuterm-dreaming for 자러 가기),
 * and installs them into ~/.claude/skills when the user asks (구축하기). The page is served from this process on
 * 127.0.0.1 (a port the OS picks), with the same API as the skill's server.mjs, so no Node and no separate server are
 * needed: /data /events /crew /projects and the POSTs (/ack /request /bump /sleep /wake), plus MinsuTerm's own
 * /unrequest (보낸 요청 지우기) and /leave (방에서 내쫓기).
 * A skill folder MinsuTerm did not install (the owner's own progress / dreaming) is never written to.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const HOST = '127.0.0.1';
const HOME = os.homedir();
const REGISTRY = path.join(HOME, '.claude', 'progress', 'projects.json');
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const SKILLS_DIR = path.join(HOME, '.claude', 'skills');
const BUNDLED = { 'minsuterm-progress': path.join(__dirname, 'minsuterm-progress'), 'minsuterm-dreaming': path.join(__dirname, 'minsuterm-dreaming') };
const PAGE = path.join(BUNDLED['minsuterm-progress'], 'scripts', 'page.html');
const MARKER = '.minsuterm.json';
const JSON_TYPE = 'application/json; charset=utf-8';
const IS_WIN = process.platform === 'win32';

/* ---------- the record (the same rules as the skill's cli / server) ---------- */
const stamp = (d = new Date()) => d.toLocaleString('sv-SE').slice(0, 16);
const progressDir = (root) => path.join(root, 'progress');
const dataFile = (root) => path.join(root, 'progress', 'data.json');
const inboxFile = (root) => path.join(root, 'progress', 'inbox.jsonl');
const norm = (p) => { const r = path.resolve(p); return IS_WIN ? r.toLowerCase() : r; };
const sameRoot = (a, b) => norm(a) === norm(b);
const keyOf = (root) => crypto.createHash('sha1').update(norm(root)).digest('hex').slice(0, 10);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ensureData(root) {
  fs.mkdirSync(progressDir(root), { recursive: true });
  const init = { project: path.basename(root) || root, batch: '', nextId: 1, items: [], log: [], notices: [], requests: [], updated: stamp() };
  try { fs.writeFileSync(dataFile(root), JSON.stringify(init, null, 2) + '\n', { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  excludeFromGit(root);
  register(root);
}

/** In a Git repository, progress/ goes into .git/info/exclude once (.gitignore is left alone). */
function excludeFromGit(root) {
  try {
    let top = root;
    for (;;) {
      if (fs.existsSync(path.join(top, '.git'))) break;
      const up = path.dirname(top);
      if (up === top) return;
      top = up;
    }
    let gitDir = path.join(top, '.git');
    if (fs.statSync(gitDir).isFile()) { // a worktree / submodule: .git points to the real place
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, 'utf8'));
      if (!m) return;
      gitDir = path.resolve(top, m[1].trim());
      const common = path.join(gitDir, 'commondir');
      if (fs.existsSync(common)) gitDir = path.resolve(gitDir, fs.readFileSync(common, 'utf8').trim());
    }
    const rel = path.relative(top, root).split(path.sep).join('/');
    const line = `/${rel ? rel + '/' : ''}progress/`;
    const exclude = path.join(gitDir, 'info', 'exclude');
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (cur.split(/\r?\n/).some((l) => l.trim() === line)) return;
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, (cur && !cur.endsWith('\n') ? '\n' : '') + line + '\n');
  } catch { /* the record still works without it */ }
}

function readRegistry() {
  try { const j = JSON.parse(fs.readFileSync(REGISTRY, 'utf8').replace(/^﻿/, '')); return Array.isArray(j.projects) ? j : { projects: [] }; } catch { return { projects: [] }; }
}
function writeRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
}
function register(root) {
  try {
    const reg = readRegistry();
    if (reg.projects.some((p) => sameRoot(p.root, root))) return;
    reg.projects.push({ root: path.resolve(root), added: stamp() });
    writeRegistry(reg);
  } catch { /* the page can still open this folder by key */ }
}

function readData(root) {
  let last;
  for (let i = 0; i < 5; i++) {
    try { return JSON.parse(fs.readFileSync(dataFile(root), 'utf8').replace(/^﻿/, '')); } catch (e) {
      if (e.code === 'ENOENT') throw e;
      last = e; // another process may be writing it
      pause(40);
    }
  }
  throw last;
}
function writeData(root, d) {
  const file = dataFile(root);
  const text = JSON.stringify(d, null, 2) + '\n';
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    fs.writeFileSync(file, text);
  }
}

/* ---------- which folder a request is about: ?p=<key> (folders MinsuTerm opened, then the shared registry) ---------- */
const opened = new Map(); // key -> root
function projectFor(url) {
  const key = url.searchParams.get('p');
  if (!key) throw new HttpError(400, '프로젝트를 고르지 않았어요');
  let root = opened.get(key);
  if (!root) { const hit = readRegistry().projects.find((p) => keyOf(p.root) === key); if (hit) root = path.resolve(hit.root); }
  if (!root) throw new HttpError(400, '모르는 프로젝트예요');
  if (!fs.existsSync(dataFile(root))) throw new HttpError(400, '그 프로젝트에는 진행 기록이 없어요');
  return { key, root };
}

function listProjects() {
  const reg = readRegistry();
  const out = [];
  const seen = new Set();
  for (const p of reg.projects) {
    const k = keyOf(p.root);
    if (seen.has(k)) continue;
    seen.add(k);
    let d;
    try { d = readData(p.root); } catch { continue; }
    const items = Array.isArray(d.items) ? d.items : [];
    out.push({ key: k, root: path.resolve(p.root), name: d.project || path.basename(p.root), updated: d.updated || '', remaining: items.filter((i) => i.group !== 'hold').length, done: doneCount(d), asleep: Boolean(d.asleepAt) });
  }
  out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || a.name.localeCompare(b.name));
  return out;
}
const doneCount = (d) => (Array.isArray(d?.log) ? d.log : []).reduce((n, day) => n + (Array.isArray(day.items) ? day.items.length : 0), 0);

/* ---------- rename / delete a record, the trash (the page opened in a browser: 브라우저로 열기) ---------- */
const TRASH = path.join(HOME, '.claude', 'progress', 'trash');
function renameProject(proj, body) {
  const name = String(body.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, '이름이 비어 있어요');
  const d = readData(proj.root);
  d.project = name;
  writeData(proj.root, d);
}
function moveFile(src, dst) {
  try { fs.renameSync(src, dst); } catch { fs.copyFileSync(src, dst); fs.rmSync(src, { force: true }); } // another drive: copy, then remove
}
/** Not deleted: moved to ~/.claude/progress/trash/<name>-<time>/ (data.json, inbox.jsonl and where it came from). */
function trashProject(proj) {
  let name = path.basename(proj.root);
  try { name = readData(proj.root).project || name; } catch { /* still moved */ }
  const safe = String(name).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
  const ts = stamp(new Date()).replace(/[-:]/g, '').replace(' ', '-') + String(new Date().getSeconds()).padStart(2, '0');
  const dest = path.join(TRASH, `${safe}-${ts}`);
  fs.mkdirSync(dest, { recursive: true });
  const hub = hubs.get(proj.key); // tell the pages showing it, and let go of the folder
  if (hub) {
    for (const c of hub.clients) c.write('event: gone\ndata: 1\n\n');
    hub.watcher?.close();
    hub.watcher = null;
  }
  const dir = progressDir(proj.root);
  for (const f of fs.readdirSync(dir)) {
    if (f === 'data.json' || f === 'inbox.jsonl') moveFile(path.join(dir, f), path.join(dest, f));
    else if (/^data\.json\.\d+\.tmp$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
  fs.writeFileSync(path.join(dest, 'from.txt'), `${proj.root}\n`);
  try { fs.rmdirSync(dir); } catch { /* other files stay, and so does the folder */ }
  const reg = readRegistry();
  writeRegistry({ ...reg, projects: reg.projects.filter((p) => !sameRoot(p.root, proj.root)) });
  opened.delete(proj.key);
  return dest;
}
/* only the record copies inside ~/.claude/progress/trash are ever removed: never memory, sessions or project files */
function trashDir(id) {
  const name = String(id ?? '');
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new HttpError(400, '휴지통 항목 이름이 잘못됐어요');
  const dir = path.join(TRASH, name);
  if (path.dirname(dir) !== TRASH || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new HttpError(400, '휴지통에 그 항목이 없어요');
  return dir;
}
function trashEntries() {
  let names = [];
  try { names = fs.readdirSync(TRASH, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  const out = [];
  for (const id of names) {
    const dir = path.join(TRASH, id);
    let root = '';
    let when = 0;
    try { root = fs.readFileSync(path.join(dir, 'from.txt'), 'utf8').trim(); when = fs.statSync(path.join(dir, 'from.txt')).mtimeMs; } catch { when = fs.statSync(dir).mtimeMs; }
    let d = null;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8').replace(/^﻿/, '')); } catch { /* only its name shows */ }
    const items = Array.isArray(d?.items) ? d.items : [];
    out.push({ id, root, name: d?.project || (root ? path.basename(root) : id), deletedAt: stamp(new Date(when)), remaining: items.filter((i) => i.group !== 'hold').length, done: doneCount(d) });
  }
  out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return out;
}
function restoreTrash(id) {
  const dir = trashDir(id);
  let root = '';
  try { root = fs.readFileSync(path.join(dir, 'from.txt'), 'utf8').trim(); } catch { /* refused below */ }
  if (!root) throw new HttpError(400, '원래 프로젝트 위치를 알 수 없어요');
  if (!fs.existsSync(root)) throw new HttpError(400, `원래 프로젝트 폴더가 없어요: ${root}`);
  if (fs.existsSync(dataFile(root))) throw new HttpError(400, '그 프로젝트에 이미 새 진행 기록이 있어요. 새 기록을 먼저 지운 뒤 되살려 주세요');
  fs.mkdirSync(progressDir(root), { recursive: true });
  for (const f of ['data.json', 'inbox.jsonl']) if (fs.existsSync(path.join(dir, f))) moveFile(path.join(dir, f), path.join(progressDir(root), f));
  fs.rmSync(dir, { recursive: true, force: true });
  excludeFromGit(root);
  register(root);
  return { root };
}
function purgeTrash(body) {
  if (body.confirm !== true) throw new HttpError(400, '영구 삭제하려면 confirm: true가 필요해요');
  const dirs = body.all === true ? trashEntries().map((e) => path.join(TRASH, e.id)) : [trashDir(body.id)];
  for (const dir of dirs) {
    if (path.dirname(dir) !== TRASH) continue; // never outside the trash
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { removed: dirs.length };
}

/* ---------- live updates (server-sent events) ---------- */
const hubs = new Map(); // key -> { clients, watcher, timer }
function subscribe(proj, req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  let hub = hubs.get(proj.key);
  if (!hub) {
    hub = { clients: new Set(), watcher: null, timer: null };
    try {
      hub.watcher = fs.watch(progressDir(proj.root), (_event, name) => {
        if (name && String(name) !== 'data.json') return;
        clearTimeout(hub.timer);
        hub.timer = setTimeout(() => { for (const c of hub.clients) c.write(`event: change\ndata: ${Date.now()}\n\n`); }, 150);
      });
      hub.watcher.on('error', () => {});
    } catch { /* no live updates for this folder */ }
    hubs.set(proj.key, hub);
  }
  hub.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    hub.clients.delete(res);
    if (hub.clients.size) return;
    clearTimeout(hub.timer);
    hub.watcher?.close();
    hubs.delete(proj.key);
  });
}

/* ---------- recent sessions and their sub-agents: times, titles and descriptions only, never conversation text ---------- */
const titleCache = new Map();
function sessionTitle(file, st) {
  const hit = titleCache.get(file);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit;
  let custom = '';
  let ai = '';
  try {
    const len = Math.min(st.size, 512 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, buf, 0, len, st.size - len); } finally { fs.closeSync(fd); }
    for (const m of buf.toString('utf8').matchAll(/"(customTitle|aiTitle)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      let v;
      try { v = JSON.parse(`"${m[2]}"`); } catch { continue; }
      if (m[1] === 'customTitle') custom = v; else ai = v;
    }
  } catch { /* an untitled session */ }
  // named: a name someone gave it (/rename, 이름 바꾸기), not one Claude made up
  const out = { size: st.size, mtimeMs: st.mtimeMs, title: custom || ai, named: Boolean(custom) };
  titleCache.set(file, out);
  return out;
}
function subagents(dir, nowMs) {
  let names;
  try { names = fs.readdirSync(dir).filter((n) => /^agent-.+\.meta\.json$/.test(n)); } catch { return []; }
  const list = [];
  for (const n of names) {
    const meta = path.join(dir, n);
    const log = path.join(dir, n.replace(/\.meta\.json$/, '.jsonl'));
    let st;
    try { st = fs.statSync(log); } catch { try { st = fs.statSync(meta); } catch { continue; } }
    const ago = (nowMs - st.mtimeMs) / 1000;
    if (ago > 30 * 60) continue;
    let m;
    try { m = JSON.parse(fs.readFileSync(meta, 'utf8')); } catch { continue; }
    const finished = Boolean(m.finished);
    if (finished && ago > 15 * 60) continue;
    list.push({ id: n.slice(6, -10), type: m.agentType ?? 'general-purpose', description: String(m.description ?? ''), finished, ago: Math.max(0, Math.round(ago)), at: stamp(new Date(st.mtimeMs)) });
  }
  list.sort((a, b) => b.ago - a.ago);
  return list;
}
function crew(proj) {
  const fold = (s) => (IS_WIN ? s.toLowerCase() : s);
  const want = fold(proj.root.replace(/[^A-Za-z0-9]/g, '-'));
  const nowMs = Date.now();
  const out = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (fold(d.name) === want || fold(d.name).startsWith(want + '-')))
      .map((d) => path.join(PROJECTS_DIR, d.name));
  } catch { return out; }
  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { continue; }
    for (const name of files) {
      const file = path.join(dir, name);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      const ago = (nowMs - st.mtimeMs) / 1000;
      if (ago > 6 * 3600) continue;
      const id = name.slice(0, -'.jsonl'.length);
      const t = sessionTitle(file, st);
      out.push({ id, title: t.title, named: t.named, ago: Math.max(0, Math.round(ago)), agents: subagents(path.join(dir, id, 'subagents'), nowMs) });
    }
  }
  out.sort((a, b) => a.ago - b.ago);
  return out;
}

/* ---------- what the page sends back ---------- */
const posts = {
  '/ack'(d, body) {
    const n = d.notices.find((x) => String(x.id) === String(body.id));
    if (!n) throw new HttpError(400, '그 공지를 찾지 못했어요');
    n.ackedAt = stamp();
    return { type: 'ack', id: n.id, text: n.text };
  },
  '/request'(d, body) {
    const text = String(body.text ?? '').trim().slice(0, 2000);
    if (!text) throw new HttpError(400, '요청 내용이 비어 있어요');
    const id = d.requests.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    d.requests.push({ id, text, at: stamp(), status: 'new' });
    return { type: 'request', id, text };
  },
  '/bump'(d, body) {
    const i = d.items.findIndex((x) => x.id === Number(body.id));
    if (i < 0) throw new HttpError(400, '그 항목을 찾지 못했어요');
    const [item] = d.items.splice(i, 1);
    item.bumpedAt = stamp();
    d.items.unshift(item);
    return { type: 'bump', id: item.id, text: item.title };
  },
  '/sleep'(d, body) {
    const want = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    const ids = [...new Set(want)].filter((id) => d.items.some((x) => x.id === id));
    const titles = {};
    for (const id of ids) titles[id] = d.items.find((x) => x.id === id).title;
    d.sleep = { at: stamp(), ids, titles };
    return { type: 'sleep', id: ids.length ? ids.join(',') : '-', text: ids.length ? ids.map((id) => `#${id} ${titles[id]}`).join(', ') : '마칠 일 없이 바로' };
  },
  '/wake'(d) {
    delete d.sleep;
    return { type: 'wake', id: '-', text: '자러 가기를 취소함' };
  },
  /* a sent request taken off the list: one still waiting is called off (the agent is told), a handled one only goes */
  '/unrequest'(d, body) {
    const i = d.requests.findIndex((r) => String(r.id) === String(body.id));
    if (i < 0) throw new HttpError(400, '그 요청을 찾지 못했어요');
    const [r] = d.requests.splice(i, 1);
    return r.status === 'new' ? { type: 'unrequest', id: r.id, text: r.text } : null;
  },
  /*
   * 방에서 내쫓기, once MinsuTerm ended that session: the main agent leaves (leftAt, until the progress skill is used
   * again), or another session's character leaves the room (away: until its conversation changes again).
   * Nothing goes to the inbox: the session it was for has ended.
   */
  '/leave'(d, body) {
    if (body.main === true) {
      delete d.asleepAt;
      delete d.sleep;
      delete d.restAt;
      d.leftAt = stamp();
    }
    const sid = String(body.sid ?? '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
      const away = d.away && typeof d.away === 'object' && !Array.isArray(d.away) ? d.away : {};
      const cut = Date.now() - 6 * 3600 * 1000; // the room shows sessions of the last 6 hours only
      d.away = Object.fromEntries(Object.entries(away).filter(([, t]) => Number(t) > cut));
      d.away[sid.toLowerCase()] = Date.now();
    }
    return null;
  },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new HttpError(400, '보낸 내용이 너무 커요')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      const t = Buffer.concat(chunks).toString('utf8');
      if (!t.trim()) return resolve({});
      try { const v = JSON.parse(t); resolve(v && typeof v === 'object' ? v : {}); } catch { reject(new HttpError(400, 'JSON 형식이 아니에요')); }
    });
    req.on('error', reject);
  });
}

/* ---------- HTTP ---------- */
function send(res, code, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

let server = null;
let serverPort = 0;
let starting = null;
const localHosts = () => [`127.0.0.1:${serverPort}`, `localhost:${serverPort}`];

async function handle(req, res) {
  try {
    const host = String(req.headers.host ?? '').toLowerCase();
    if (!localHosts().includes(host)) return send(res, 403, '허용하지 않는 주소예요'); // no other site can reach this server
    const url = new URL(req.url, `http://${HOST}:${serverPort}`);
    if (req.method === 'GET') {
      switch (url.pathname) {
        case '/': return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8'); // read every time: an updated page shows on reload
        case '/data': return send(res, 200, JSON.stringify(readData(projectFor(url).root)), JSON_TYPE);
        case '/projects': return send(res, 200, JSON.stringify(listProjects()), JSON_TYPE);
        case '/trash': return send(res, 200, JSON.stringify(trashEntries()), JSON_TYPE);
        case '/events': return subscribe(projectFor(url), req, res);
        case '/crew': return send(res, 200, JSON.stringify(crew(projectFor(url))), JSON_TYPE);
        case '/favicon.ico': return send(res, 204);
        default: return send(res, 404, '없는 경로예요');
      }
    }
    const manage = url.pathname === '/rename' || url.pathname === '/delete';
    const trashOp = url.pathname === '/trash/restore' || url.pathname === '/trash/purge';
    if (req.method === 'POST' && (manage || trashOp || Object.hasOwn(posts, url.pathname))) {
      const origin = req.headers.origin;
      if (origin && !localHosts().map((h) => `http://${h}`).includes(origin.toLowerCase())) return send(res, 403, '다른 사이트에서 보낸 요청은 받지 않아요');
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) throw new HttpError(400, 'Content-Type은 application/json이어야 해요');
      if (trashOp) {
        const body = await readBody(req);
        return send(res, 200, JSON.stringify(url.pathname === '/trash/restore' ? restoreTrash(body.id) : purgeTrash(body)), JSON_TYPE);
      }
      if (manage) {
        if (!url.searchParams.get('p')) throw new HttpError(400, '어느 프로젝트인지 p로 알려 주세요');
        const proj = projectFor(url);
        const body = await readBody(req);
        if (url.pathname === '/rename') { renameProject(proj, body); return send(res, 204); }
        if (body.confirm !== true) throw new HttpError(400, '지우려면 confirm: true가 필요해요');
        return send(res, 200, JSON.stringify({ trash: trashProject(proj) }), JSON_TYPE);
      }
      const proj = projectFor(url);
      const body = await readBody(req);
      const d = readData(proj.root);
      for (const k of ['items', 'notices', 'requests']) if (!Array.isArray(d[k])) d[k] = [];
      const entry = posts[url.pathname](d, body);
      writeData(proj.root, d);
      if (entry) fs.appendFileSync(inboxFile(proj.root), JSON.stringify({ ...entry, at: stamp() }) + '\n');
      return send(res, 204);
    }
    return send(res, 404, '없는 경로예요');
  } catch (e) {
    if (res.headersSent) return res.end();
    send(res, e instanceof HttpError ? e.status : 400, e instanceof HttpError ? e.message : `처리하지 못했어요: ${e.message}`);
  }
}

/*
 * A steady port (the page keeps what the user folded / opened in localStorage, which is per origin), clear of the
 * progress skill's own 4321–4420; when all are taken, any port the OS gives.
 */
const PORTS = [4471, 4472, 4473, 4474, 4475, 4476, 4477, 4478, 4479, 4480, 0];
function listenOn(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => { handle(req, res); });
    s.once('error', reject);
    s.listen(port, HOST, () => resolve(s));
  });
}
function startServer() {
  if (server && serverPort) return Promise.resolve(serverPort);
  if (starting) return starting;
  starting = (async () => {
    let last;
    for (const port of PORTS) {
      try {
        const s = await listenOn(port);
        server = s;
        serverPort = s.address().port;
        return serverPort;
      } catch (e) { last = e; if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') break; }
    }
    throw last || new Error('빈 포트를 찾지 못했어요');
  })().finally(() => { starting = null; });
  return starting;
}

function stopServer() {
  for (const hub of hubs.values()) { clearTimeout(hub.timer); try { hub.watcher?.close(); } catch { /* ignore */ } for (const c of hub.clients) try { c.end(); } catch { /* ignore */ } }
  hubs.clear();
  if (server) { try { server.close(); server.closeAllConnections?.(); } catch { /* ignore */ } }
  server = null;
  serverPort = 0;
}

/* ---------- the skills: installed into ~/.claude/skills on request, refreshed only where MinsuTerm put them ---------- */
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p));
  }
  return out;
}
const bundleCache = new Map();
function bundle(name) {
  if (bundleCache.has(name)) return bundleCache.get(name);
  const dir = BUNDLED[name];
  let files = [];
  try { files = walk(dir).sort(); } catch { files = []; }
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(f.split(path.sep).join('/')); h.update(fs.readFileSync(path.join(dir, f))); }
  const b = { dir, files, hash: h.digest('hex').slice(0, 16) };
  bundleCache.set(name, b);
  return b;
}

let nodeCheck = null;
/** Is a real Node on PATH (18+)? Otherwise the skills run their scripts with MinsuTerm itself as Node. */
function hasNode() {
  if (nodeCheck) return nodeCheck;
  nodeCheck = new Promise((resolve) => {
    execFile(IS_WIN ? 'node.exe' : 'node', ['--version'], { timeout: 4000, windowsHide: true }, (err, out) => {
      const m = !err && /^v(\d+)\./.exec(String(out).trim());
      resolve(!!m && Number(m[1]) >= 18);
    });
  });
  return nodeCheck;
}

function readMarker(target) {
  try { return JSON.parse(fs.readFileSync(path.join(target, MARKER), 'utf8')); } catch { return null; }
}

function skillState(name) {
  const target = path.join(SKILLS_DIR, name);
  const exists = fs.existsSync(path.join(target, 'SKILL.md'));
  const marker = exists ? readMarker(target) : null;
  const b = bundle(name);
  return {
    name,
    target,
    installed: exists,
    ours: !!marker, // installed by MinsuTerm (only those are ever rewritten)
    current: !!marker && marker.hash === b.hash && marker.exec === process.execPath,
    bundled: b.files.length > 0,
  };
}

/** Write one skill: the bundled files, SKILL.md filled in for this machine, the Node wrapper when needed, the marker. */
function installSkill(name, useNode) {
  const b = bundle(name);
  if (!b.files.length) throw new Error(`${name}: 앱에 스킬 파일이 없어요`);
  const target = path.join(SKILLS_DIR, name);
  const st = skillState(name);
  if (st.installed && !st.ours) return { name, skipped: 'own' }; // someone's own skill of that name: never touched
  const slash = (p) => p.split(path.sep).join('/');
  // Node for the skill's scripts: the real one, or MinsuTerm itself run as Node through a wrapper. Two wrappers on
  // Windows: a sh one for Git Bash ({{NODE}}: a .cmd there goes through cmd /c, which cuts spaces and &), a .cmd for
  // PowerShell ({{NODE_PS}}: it can't run the sh one, and the GUI executable called directly would not be waited for)
  let nodeCmd = 'node';
  let nodePs = 'node';
  if (!useNode) {
    const bin = path.join(target, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const sh = path.join(bin, 'mtnode');
    fs.writeFileSync(sh, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${slash(process.execPath)}" "$@"\n`);
    try { fs.chmodSync(sh, 0o755); } catch { /* Windows: Git Bash runs it by its shebang */ }
    nodeCmd = `"${slash(sh)}"`;
    nodePs = nodeCmd;
    if (IS_WIN) {
      fs.writeFileSync(path.join(bin, 'mtnode.cmd'), `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
      nodePs = `"${slash(path.join(bin, 'mtnode.cmd'))}"`;
    }
  }
  for (const f of b.files) {
    const out = path.join(target, f);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let buf = fs.readFileSync(path.join(b.dir, f));
    if (/\.md$/i.test(f)) buf = Buffer.from(buf.toString('utf8').split('{{NODE_PS}}').join(nodePs).split('{{NODE}}').join(nodeCmd).split('{{SKILL}}').join(slash(target)));
    fs.writeFileSync(out, buf);
    if (/\.(mjs|sh)$/.test(f) && !IS_WIN) try { fs.chmodSync(out, 0o755); } catch { /* ignore */ }
  }
  fs.writeFileSync(path.join(target, MARKER), JSON.stringify({ by: 'MinsuTerm', hash: b.hash, exec: process.execPath, node: useNode ? 'node' : 'mtnode', installedAt: stamp() }, null, 2) + '\n');
  return { name, installed: true, node: useNode ? 'node' : 'mtnode' };
}

const SKILLS = ['minsuterm-progress', 'minsuterm-dreaming'];

async function status() {
  const node = await hasNode();
  const skills = SKILLS.map(skillState);
  const own = (n) => fs.existsSync(path.join(SKILLS_DIR, n, 'SKILL.md'));
  return {
    node,
    skills,
    ready: skills[0].installed, // the progress skill is what the page needs; dreaming only adds the memory tidy to 자러 가기
    ownProgress: own('progress'),
    ownDreaming: own('dreaming'),
    skillsDir: SKILLS_DIR,
  };
}

async function setup() {
  const node = await hasNode();
  const done = SKILLS.map((n) => installSkill(n, node));
  return { done, status: await status() };
}

/** On app start: bring the copies MinsuTerm installed up to this version (or to this executable's path). */
async function refreshInstalled() {
  const node = await hasNode();
  for (const n of SKILLS) {
    const st = skillState(n);
    if (st.ours && !st.current) try { installSkill(n, node); } catch { /* next start tries again */ }
  }
}

/** Open a folder's page: make sure its record exists, start the server, return the page address. */
async function open(folder) {
  const root = path.resolve(folder);
  ensureData(root);
  const key = keyOf(root);
  opened.set(key, root);
  const port = await startServer();
  let d = {};
  try { d = readData(root); } catch { /* shown empty */ }
  const empty = !(Array.isArray(d.items) && d.items.length) && !(Array.isArray(d.log) && d.log.length) && !(Array.isArray(d.notices) && d.notices.length);
  return { url: `http://${HOST}:${port}/`, origin: `http://${HOST}:${port}`, key, empty, name: d.project || path.basename(root) };
}

/** A small summary for the panel's hint line (no conversation text). */
function summary(folder) {
  try {
    const d = readData(path.resolve(folder));
    const items = Array.isArray(d.items) ? d.items : [];
    return {
      exists: true,
      remaining: items.filter((i) => i.group !== 'hold').length,
      done: doneCount(d),
      waiting: items.filter((i) => i.wait).length + (Array.isArray(d.notices) ? d.notices.filter((n) => !n.ackedAt).length : 0),
      updated: d.updated || '',
      asleep: Boolean(d.asleepAt),
    };
  } catch { return { exists: false, remaining: 0, done: 0, waiting: 0, updated: '', asleep: false }; }
}

module.exports = { status, setup, refreshInstalled, open, summary, stopServer, origin: () => (serverPort ? `http://${HOST}:${serverPort}` : '') };
