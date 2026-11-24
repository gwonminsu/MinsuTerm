#!/usr/bin/env node
// 진행 보고(minsuterm-progress) 페이지에서 온 일을 지켜본다
// 사용: 프로젝트 폴더에서 Claude Code의 Monitor로 node "<스킬 폴더>/scripts/watch-inbox.mjs"
//   스킬 폴더는 MinsuTerm이 설치한 ~/.claude/skills/minsuterm-progress다. Node가 없으면 MinsuTerm의 대체 실행 파일을 쓴다.
// 페이지는 MinsuTerm의 진행도 보기가 띄우고, 페이지에서 누른 것은 <루트>/progress/inbox.jsonl에 쌓인다.
// 시작할 때 이미 있던 줄은 건너뛰고, 새 줄을 1초마다 "<이름> [id] <at> <text>"로 한 줄씩 찍는다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.PROGRESS_ROOT ?? process.cwd());
const FILE = path.join(ROOT, 'progress', 'inbox.jsonl');
const NAMES = { ack: '했어요', request: '요청', bump: '먼저 해 주세요', sleep: '자러 가기', wake: '자러 가기 취소', unrequest: '요청 취소', answer: '확인 답변', unanswer: '답변 취소' };

const sizeOf = () => {
  try {
    return fs.statSync(FILE).size;
  } catch {
    return 0;
  }
};

let offset = sizeOf();
let rest = Buffer.alloc(0); // 아직 줄바꿈이 오지 않은 조각

function print(line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    console.log(`알 수 없는 줄: ${line}`);
    return;
  }
  const text = String(e.text ?? '').replace(/\s*\r?\n\s*/g, ' / '); // 알림 한 줄에 담는다
  console.log(`${NAMES[e.type] ?? e.type} [${e.id ?? '-'}] ${e.at ?? ''} ${text}`);
}

function tick() {
  const size = sizeOf();
  if (size < offset) {
    // 파일이 비워졌거나 새로 만들어졌다
    offset = 0;
    rest = Buffer.alloc(0);
  }
  if (size === offset) return;
  const buf = Buffer.alloc(size - offset);
  const fd = fs.openSync(FILE, 'r');
  try {
    fs.readSync(fd, buf, 0, buf.length, offset);
  } finally {
    fs.closeSync(fd);
  }
  offset = size;
  let chunk = Buffer.concat([rest, buf]);
  let nl;
  while ((nl = chunk.indexOf(0x0a)) >= 0) {
    const line = chunk.subarray(0, nl).toString('utf8').trim();
    chunk = chunk.subarray(nl + 1);
    if (line) print(line);
  }
  rest = Buffer.from(chunk);
}

console.error(`minsuterm-progress inbox 감시 시작: ${FILE}`);
setInterval(() => {
  try {
    tick();
  } catch (e) {
    console.error(`읽기 오류: ${e.message}`);
  }
}, 1000);
