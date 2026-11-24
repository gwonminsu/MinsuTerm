#!/usr/bin/env node
// 진행 보고(minsuterm-progress) 기록 도구
// 사용: 프로젝트 폴더에서 node "<스킬 폴더>/scripts/cli.mjs" <명령> ...
//   스킬 폴더는 MinsuTerm이 설치한 ~/.claude/skills/minsuterm-progress다.
//   Node가 없으면 MinsuTerm이 만든 대체 실행 파일(ELECTRON_RUN_AS_NODE=1로 MinsuTerm을 Node처럼 돌린다)을 node 대신 쓴다.
// 데이터는 <루트>/progress/data.json에 있다. 루트는 PROGRESS_ROOT가 있으면 그것, 없으면 지금 폴더다.
// 기록 형식과 위치는 progress 스킬과 같다. 페이지는 MinsuTerm의 진행도 보기가 띄운다.
// Node 18 이상의 내장 모듈만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(process.env.PROGRESS_ROOT ?? process.cwd());
const REGISTRY = path.join(os.homedir(), '.claude', 'progress', 'projects.json');
const GROUPS = { now: '지금 하는 것', next: '다음에 할 것', agent: '다른 에이전트가 하는 것', hold: '보류' };
const HASHES = /^[0-9a-f]{6,}(,[0-9a-f]{6,})*$/;

const USAGE = `사용법: node cli.mjs <명령> ...
  show                                 지금 상태 보기 (파일은 고치지 않음)
  batch "<이름>"                        작업 묶음 이름 바꾸기
  add <칸> "<제목>" ["<설명>"]           항목 더하기 (칸: now, next, agent, hold)
  move <번호> <칸>                      다른 칸으로 옮기기
  wait <번호> [on|off]                  '확인 필요' 표시 켜기·끄기
  detail <번호> "<설명>"                 설명 바꾸기
  note <번호> "<내용>"                   진행 메모 남기기
  done <번호> [해시,해시] ["<설명>"]       끝내고 오늘 기록에 쌓기
  log "<제목>" [해시,해시] ["<설명>"]      칸에 없던 일을 오늘 기록에 쌓기
  drop <번호>                           항목 지우기
  req <요청번호> [added|drop]            페이지 요청을 할 일에 넣음으로 표시 / 지우기
  notice add <id> "<내용>"               사용자가 해 줘야 할 일 알리기
  notice rm <id>                        공지 지우기
  sleep now                             잠들기
  sleep done                            수면 마침`;

// ---------- 공통 (MinsuTerm의 진행 서버 src/progress.js와 같은 규칙) ----------
const stamp = (d = new Date()) => d.toLocaleString('sv-SE').slice(0, 16);
const dataFile = (root) => path.join(root, 'progress', 'data.json');
const norm = (p) => {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 이 cli를 부른 메인 에이전트. PROGRESS_AGENT가 있으면 그것, 없으면 환경 변수로 짐작한다
function detectAgent() {
  const v = String(process.env.PROGRESS_AGENT ?? '').trim().toLowerCase();
  if (v === 'claude' || v === 'codex') return v;
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_SESSION_ID) return 'claude';
  if (Object.keys(process.env).some((k) => k.toUpperCase().startsWith('CODEX_'))) return 'codex';
  return null;
}

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

// data.json이 없으면 처음 내용으로 만든다
function ensureData(root) {
  fs.mkdirSync(path.join(root, 'progress'), { recursive: true });
  const init = {
    project: path.basename(root) || root,
    batch: '',
    nextId: 1,
    items: [],
    log: [],
    notices: [],
    requests: [],
    updated: stamp(),
  };
  try {
    fs.writeFileSync(dataFile(root), JSON.stringify(init, null, 2) + '\n', { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  excludeFromGit(root);
  register(root);
}

// Git 저장소면 progress/를 .git/info/exclude에 한 번만 넣는다 (.gitignore는 건드리지 않는다)
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
    if (fs.statSync(gitDir).isFile()) {
      // 워크트리·서브모듈: .git 파일이 실제 위치를 가리킨다
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
  } catch {
    // Git 설정을 못 고쳐도 진행 보고는 계속한다
  }
}

// 진행 서버가 프로젝트 키(?p=)로 찾을 수 있게 프로젝트 목록에 적는다 (progress 스킬과 같은 목록)
function register(root) {
  try {
    let reg = { projects: [] };
    try {
      const j = JSON.parse(fs.readFileSync(REGISTRY, 'utf8').replace(/^﻿/, ''));
      if (Array.isArray(j.projects)) reg = j;
    } catch { /* 목록이 없으면 새로 만든다 */ }
    if (reg.projects.some((p) => norm(p.root) === norm(root))) return;
    reg.projects.push({ root: path.resolve(root), added: stamp() });
    fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
    fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  } catch {
    // 목록을 못 고쳐도 이 프로젝트의 진행 보고는 된다
  }
}

function readData(root) {
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(fs.readFileSync(dataFile(root), 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      if (e.code === 'ENOENT') throw e;
      last = e; // 서버가 쓰는 중일 수 있다
      pause(40);
    }
  }
  throw last;
}

function writeData(root, d) {
  const file = dataFile(root);
  const text = JSON.stringify(d, null, 2) + '\n';
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* 무시 */ }
    fs.writeFileSync(file, text);
  }
}

// ---------- 시작 ----------
const [cmd, ...args] = process.argv.slice(2);
if (!cmd || ['help', '-h', '--help'].includes(cmd)) {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}

const NAMES = ['show', 'batch', 'add', 'move', 'wait', 'detail', 'note', 'done', 'log', 'drop', 'req', 'notice', 'sleep'];
if (!NAMES.includes(cmd)) fail(`모르는 명령이에요: ${cmd}\n\n${USAGE}`);

ensureData(ROOT);
let d;
try {
  d = readData(ROOT);
} catch (e) {
  fail(`data.json을 읽지 못했어요: ${e.message}`);
}
for (const k of ['items', 'log', 'notices', 'requests']) if (!Array.isArray(d[k])) d[k] = [];
d.project ||= path.basename(ROOT) || ROOT;
d.batch ??= '';
d.nextId = Math.max(Number(d.nextId) || 1, ...d.items.map((i) => (Number(i.id) || 0) + 1));

// ---------- 도우미 ----------
const today = () => stamp().slice(0, 10);

function findItem(arg) {
  const id = Number(String(arg ?? '').replace(/^#/, ''));
  if (!Number.isInteger(id) || id < 1) fail(`항목 번호가 잘못됐어요: ${arg ?? '(없음)'}`);
  const item = d.items.find((i) => i.id === id);
  if (!item) fail(`#${id} 항목이 없어요`);
  return item;
}

function needGroup(g) {
  if (!Object.hasOwn(GROUPS, g ?? '')) fail(`칸 이름이 잘못됐어요: ${g ?? '(없음)'} (now, next, agent, hold 중 하나)`);
  return g;
}

function needText(t, what) {
  if (t === undefined || !String(t).trim()) fail(`${what}이(가) 비어 있어요`);
  return String(t).trim();
}

// [해시,해시] ["<설명>"] 자리를 읽는다
function commitsAndDetail(rest) {
  const [a, b, ...more] = rest;
  if (more.length) fail('인자가 너무 많아요. 제목과 설명은 따옴표로 묶어 주세요');
  if (a !== undefined && HASHES.test(a)) return { commits: a.split(','), detail: b };
  if (a === '') return { detail: b };
  if (b !== undefined) {
    fail(`"${a}"는 커밋 해시 형식이 아니에요 (소문자 16진수 6자 이상, 여러 개면 쉼표로 잇기). 커밋이 없으면 설명만 주세요`);
  }
  return { detail: a };
}

function pushLog(entry) {
  const date = today();
  let day = d.log.find((x) => x.date === date);
  if (!day) {
    day = { date, items: [] };
    d.log.push(day);
    d.log.sort((x, y) => String(y.date).localeCompare(String(x.date))); // 최신 날짜가 앞
  }
  if (!Array.isArray(day.items)) day.items = [];
  day.items.unshift(entry); // 한 날짜 안에서도 최신이 앞
}

function logEntry(title, { commits, detail }, fallback) {
  const entry = { title };
  const text = String(detail ?? '').trim() || fallback;
  if (text) entry.detail = text;
  if (commits?.length) entry.commits = commits;
  entry.batch = d.batch;
  return entry;
}

function show() {
  const out = [];
  out.push(`${d.project} · 작업 묶음: ${d.batch || '(이름 없음)'} · 갱신 ${d.updated ?? '-'}`);
  if (d.asleepAt) out.push(`상태: ${d.asleepAt}에 잠듦 (무엇이든 고치면 깸)`);
  if (d.restAt) out.push(`상태: ${d.restAt}에 수면을 마침`);
  if (d.leftAt) out.push(`상태: ${d.leftAt}에 방에서 나감 (무엇이든 고치면 돌아옴)`);
  for (const [g, label] of Object.entries(GROUPS)) {
    const list = d.items.filter((i) => i.group === g);
    out.push('', `[${label}] ${list.length}개`);
    for (const i of list) {
      const tags = [i.wait && '확인 필요', i.bumpedAt && `${i.bumpedAt}에 먼저 해 달라고 함`].filter(Boolean);
      out.push(`  #${i.id} ${i.title}${tags.length ? ` (${tags.join(', ')})` : ''}`);
      if (i.detail) out.push(`      ${i.detail}`);
      const last = Array.isArray(i.notes) ? i.notes.at(-1) : null;
      if (last) out.push(`      마지막 메모 ${last.at} ${last.text} (메모 ${i.notes.length}개)`);
    }
  }
  const fresh = d.requests.filter((r) => r.status === 'new');
  out.push('', `[처리하지 않은 요청] ${fresh.length}개`);
  for (const r of fresh) out.push(`  요청 ${r.id} (${r.at}) ${String(r.text).replace(/\s*\r?\n\s*/g, ' / ')}`);
  if (d.sleep) {
    const ids = Array.isArray(d.sleep.ids) ? d.sleep.ids : [];
    out.push('', `[자러 가기 계획] ${d.sleep.at}에 부탁함`);
    if (!ids.length) out.push('  마칠 일 없이 바로 정리하고 잠들기');
    for (const id of ids) {
      const left = d.items.some((i) => i.id === id);
      out.push(`  ${left ? '남음' : '끝냄'} #${id} ${d.sleep.titles?.[id] ?? ''}`);
    }
  }
  out.push('', `[공지] ${d.notices.length}개`);
  for (const n of d.notices) {
    const acked = n.ackedAt ? ` → 사용자가 ${n.ackedAt}에 '했어요'를 누름. 직접 확인한 뒤 notice rm` : '';
    out.push(`  [${n.id}] ${n.text} (${n.since}부터)${acked}`);
  }
  const day = d.log.find((x) => x.date === today());
  out.push('', `오늘 끝낸 일: ${day?.items?.length ?? 0}개`);
  console.log(out.join('\n'));
}

// ---------- 명령 ----------
const COMMANDS = {
  batch() {
    d.batch = needText(args[0], '작업 묶음 이름');
    return `작업 묶음: ${d.batch}`;
  },
  add() {
    const group = needGroup(args[0]);
    const title = needText(args[1], '제목');
    if (args.length > 3) fail('인자가 너무 많아요. 제목과 설명은 따옴표로 묶어 주세요');
    const item = { id: d.nextId++, group, title };
    const detail = String(args[2] ?? '').trim();
    if (detail) item.detail = detail;
    d.items.push(item);
    return `#${item.id} ${item.title}`;
  },
  move() {
    const item = findItem(args[0]);
    const group = needGroup(args[1]);
    if (item.group !== group) delete item.bumpedAt; // 칸을 옮기면 '먼저' 표시는 끝난다
    item.group = group;
    return `#${item.id} → ${GROUPS[group]}`;
  },
  wait() {
    const item = findItem(args[0]);
    const mode = args[1] ?? 'on';
    if (mode === 'on') item.wait = true;
    else if (mode === 'off') delete item.wait;
    else fail(`on 또는 off만 쓸 수 있어요: ${mode}`);
    return `#${item.id} 확인 필요 ${mode === 'on' ? '켬' : '끔'}`;
  },
  detail() {
    const item = findItem(args[0]);
    if (args[1] === undefined) fail('설명이 없어요');
    const text = String(args[1]).trim();
    if (text) item.detail = text;
    else delete item.detail;
    return `#${item.id} 설명을 바꿨어요`;
  },
  note() {
    const item = findItem(args[0]);
    const text = needText(args[1], '메모');
    if (!Array.isArray(item.notes)) item.notes = [];
    item.notes.push({ at: stamp().slice(11, 16), text });
    return `#${item.id} 메모 ${item.notes.length}개`;
  },
  done() {
    const item = findItem(args[0]);
    const parsed = commitsAndDetail(args.slice(1));
    d.items = d.items.filter((i) => i !== item);
    pushLog(logEntry(item.title, parsed, item.detail));
    return `#${item.id} 끝냄: ${item.title}`;
  },
  log() {
    const title = needText(args[0], '제목');
    pushLog(logEntry(title, commitsAndDetail(args.slice(1))));
    return `오늘 기록에 쌓음: ${title}`;
  },
  drop() {
    const item = findItem(args[0]);
    d.items = d.items.filter((i) => i !== item);
    return `#${item.id} 지움: ${item.title}`;
  },
  req() {
    const id = Number(String(args[0] ?? '').replace(/^#/, ''));
    const r = d.requests.find((x) => Number(x.id) === id);
    if (!r) fail(`요청 ${args[0] ?? '(없음)'}이(가) 없어요`);
    const mode = args[1] ?? 'added';
    if (mode === 'added') r.status = 'added';
    else if (mode === 'drop') d.requests = d.requests.filter((x) => x !== r);
    else fail(`added 또는 drop만 쓸 수 있어요: ${mode}`);
    return `요청 ${r.id} ${mode === 'added' ? '할 일에 넣음' : '지움'}`;
  },
  notice() {
    const sub = args[0];
    if (sub === 'add') {
      const id = needText(args[1], '공지 id');
      const text = needText(args[2], '공지 내용');
      const old = d.notices.find((n) => String(n.id) === id);
      if (old) {
        old.text = text;
        old.since = stamp();
        delete old.ackedAt; // 고쳐서 다시 알린다
      } else d.notices.push({ id, text, since: stamp() });
      return `공지 [${id}] ${old ? '바꿈' : '더함'}`;
    }
    if (sub === 'rm') {
      const id = needText(args[1], '공지 id');
      if (!d.notices.some((n) => String(n.id) === id)) fail(`공지 [${id}]이(가) 없어요`);
      d.notices = d.notices.filter((n) => String(n.id) !== id);
      return `공지 [${id}] 지움`;
    }
    fail('notice add <id> "<내용>" 또는 notice rm <id>로 써 주세요');
  },
  sleep() {
    if (args[0] === 'now') {
      delete d.sleep;
      d.asleepAt = stamp();
      return `${d.asleepAt}에 잠듦`;
    }
    if (args[0] === 'done') {
      d.restAt = stamp();
      return `${d.restAt}에 수면을 마침`;
    }
    fail('sleep now 또는 sleep done으로 써 주세요');
  },
};

if (cmd === 'show') {
  show();
  process.exit(0);
}
const message = COMMANDS[cmd]();

// 고치는 명령의 끝에 공통으로 할 일
if (!(cmd === 'sleep' && args[0] === 'now')) delete d.asleepAt; // 무엇이든 고치면 깬다
if (!(cmd === 'sleep' && args[0] === 'done')) delete d.restAt;
delete d.leftAt; // 방에서 내쫓겼어도 진행 보고를 다시 하면 방으로 돌아온다
const session = process.env.CLAUDE_CODE_SESSION_ID || process.env.PROGRESS_SESSION_ID;
if (session) d.owner = session;
const agent = detectAgent();
if (agent) d.agent = agent; // 페이지가 메인 에이전트 캐릭터(Claude·Codex)를 고른다
d.updated = stamp();
writeData(ROOT, d);
console.log(message);
