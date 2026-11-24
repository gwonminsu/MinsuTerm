'use strict';
/*
 * 진행 바 스타일: the bar in 진행도's summary card, picked in 꾸미기 → 진행도 (settings.progressBar). Drawn the same in
 * the settings preview (app.js) and in the page itself (src/minsuterm-progress/scripts/page.html; the progress server
 * hands it this file and progress-bars.css). The owner picked these from three rounds of mockups (2026-11-25).
 *
 * progressBarHtml(style, { done, total, next }) → HTML for the bar's slot.
 *   next: a line about what is under way or comes next (the ring shows it beside itself)
 */
const PROGRESS_BARS = [
  ['plain', '기본', '초록 막대'],
  ['sheen', '빛이 흐르는 막대', '채워진 부분을 빛이 훑고, 끝점이 숨 쉬듯 빛나요'],
  ['ruler', '눈금자', '할 일마다 눈금, 바늘이 지금 위치를 가리켜요'],
  ['neon', '네온관', '네온관처럼 빛나고 가끔 깜빡여요'],
  ['aurora', '오로라', '보라·하늘·초록빛이 천천히 흘러요'],
  ['led', 'LED 전광판', 'LED 점이 세 줄로 켜지고 맨 앞이 깜빡여요'],
  ['pixel', '8비트 픽셀', '픽셀이 채우고 끝은 점묘로 흐려져요'],
  ['ecg', '심전도', '끝낸 만큼 맥박 선이 그려지고 박동이 지나가요'],
  ['ring', '고리', '고리가 차오르고 옆에 지금 할 일'],
  ['vu', 'VU 미터', '초록·노랑·빨강 칸이 켜지고 맨 끝 칸이 들썩여요'],
  ['gauge', '아날로그 게이지', '계기판 바늘이 끝낸 만큼 넘어가요'],
  ['eq', '이퀄라이저', '끝낸 만큼 막대들이 음악에 맞춰 춤춰요'],
  ['glitch', '글리치', '가끔 빨강·하늘색으로 어긋나며 지지직거려요'],
  ['pcb', '회로 기판', '끝낸 만큼 회로 선로에 불이 들어와요'],
  ['sonar', '소나 펄스', '막대 끝에서 동그란 파동이 퍼져요'],
  ['seg', '7세그먼트', '전자시계 숫자 조각 같은 칸이 켜져요'],
  ['tape', '줄자', '노란 줄자가 끝낸 만큼 당겨져 나와요'],
];

function progressBarHtml(style, { done = 0, total = 0, next = '' } = {}) {
  const t = Math.max(0, total);
  const d = Math.max(0, Math.min(done, t));
  const p = t ? d / t : 0;
  const pct = `${(p * 100).toFixed(2)}%`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  switch (style) {
    case 'sheen':
      return `<div class="pb pb-sheen"><i style="width:${pct}">${d ? '<s></s>' : ''}</i>${d > 0 && d < t ? `<b style="left:${pct}"></b>` : ''}</div>`;
    case 'ruler': {
      const ticks = Array.from({ length: t + 1 }, (_, i) => `<i class="${i <= d ? 'on' : ''}" style="left:${((i / (t || 1)) * 100).toFixed(2)}%"></i>`).join('');
      return `<div class="pb pb-ruler"><span class="tr"></span><span class="fl" style="width:${pct}"></span>${t <= 60 ? ticks : ''}<b style="left:${pct}"></b></div>`;
    }
    case 'neon':
      return `<div class="pb pb-neon">${d ? `<i style="width:calc(${pct} - 2px)"></i>` : ''}</div>`;
    case 'aurora':
      return `<div class="pb pb-aurora"><i style="width:${pct}"></i></div>`;
    case 'led': {
      const cols = 36, on = Math.round(p * cols);
      return `<div class="pb pb-led">${Array.from({ length: cols * 3 }, (_, k) => { const c = Math.floor(k / 3); return `<i class="${c === on - 1 && d < t ? 'edge' : c < on ? 'on' : ''}"></i>`; }).join('')}</div>`;
    }
    case 'pixel': {
      const n = 30, on = Math.round(p * n);
      return `<div class="pb pb-pixel">${Array.from({ length: n }, (_, k) => `<i class="${k < on - 2 ? 'on' : k === on - 2 ? 'd1' : k === on - 1 ? 'd2' : ''}"></i>`).join('')}</div>`;
    }
    case 'ecg': {
      const x = p * 400, beats = Math.min(t, 24), s = 400 / (beats || 1), shown = Math.round(p * beats);
      let path = 'M0 15';
      for (let k = 0; k < shown; k++) { const a = k * s; path += ` L${a + s * 0.35} 15 L${a + s * 0.45} 4 L${a + s * 0.55} 26 L${a + s * 0.62} 12 L${a + s} 15`; }
      return `<div class="pb pb-ecg"><svg viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden="true"><line class="rest" x1="${x}" y1="15" x2="400" y2="15"/>${shown ? `<path class="trace" d="${path}"/><path class="blip" d="${path}"/>` : ''}</svg></div>`;
    }
    case 'ring': {
      const c = 2 * Math.PI * 18;
      return `<div class="pb pb-ring"><svg viewBox="0 0 46 46" aria-hidden="true"><circle class="bg" cx="23" cy="23" r="18"/><circle class="fg" cx="23" cy="23" r="18" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}"/></svg><span>${t && d >= t ? '모두 끝냈어요' : esc(next)}</span></div>`;
    }
    case 'vu': {
      const n = 28, on = Math.round(p * n);
      return `<div class="pb pb-vu">${Array.from({ length: n }, (_, k) => `<i class="${k < on ? (k < n * 0.65 ? 'g' : k < n * 0.85 ? 'y' : 'r') : ''}${k === on - 1 && d < t ? ' peak' : ''}"></i>`).join('')}</div>`;
    }
    case 'gauge': {
      const a = -90 + p * 180, rad = (deg) => (deg * Math.PI) / 180;
      const ticks = Array.from({ length: 11 }, (_, i) => { const r = rad(-90 + i * 18); return `<line class="${i > 8 ? 'hot' : ''}" x1="${(39 + Math.sin(r) * 30).toFixed(1)}" y1="${(40 - Math.cos(r) * 30).toFixed(1)}" x2="${(39 + Math.sin(r) * 35).toFixed(1)}" y2="${(40 - Math.cos(r) * 35).toFixed(1)}" stroke-width="${i % 5 === 0 ? 2 : 1}"/>`; }).join('');
      const end = `${(39 + Math.sin(rad(a)) * 35).toFixed(2)} ${(40 - Math.cos(rad(a)) * 35).toFixed(2)}`;
      return `<div class="pb pb-gauge"><svg viewBox="0 0 78 44" aria-hidden="true"><path class="arc" d="M4 40 A35 35 0 0 1 74 40"/>${d ? `<path class="arc on" d="M4 40 A35 35 0 0 1 ${end}"/>` : ''}${ticks}<g class="needle" style="transform:rotate(${a.toFixed(1)}deg)"><line x1="39" y1="40" x2="39" y2="12"/></g><circle class="hub" cx="39" cy="40" r="3.5"/></svg><span>${t && d >= t ? '모두 끝냈어요' : `${t - d}개 남음`}</span></div>`;
    }
    case 'eq': {
      const n = 30, on = Math.round(p * n);
      return `<div class="pb pb-eq">${Array.from({ length: n }, (_, k) => `<i class="${k < on ? 'on' : ''}" style="--s:${(0.35 + ((k * 37) % 9) / 14).toFixed(2)}s;animation-delay:-${((k * 13) % 7) / 10}s"></i>`).join('')}</div>`;
    }
    case 'glitch':
      return `<div class="pb pb-glitch"><i style="width:${pct}"></i></div>`;
    case 'pcb': { // one stretch of trace per task (at most 16), a round pad at each end: traces stretch, pads stay round
      const n = Math.min(t, 16), lit = Math.round(p * n);
      const seg = (i) => `<i class="${i < lit ? 'lit' : ''}"><svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d="M0 16 H30 L45 ${i % 2 ? 6 : 26} H70 L85 16 H100"/></svg><b></b></i>`;
      return `<div class="pb pb-pcb"><s></s>${Array.from({ length: n || 1 }, (_, i) => seg(n ? i : 99)).join('')}</div>`;
    }
    case 'sonar':
      return `<div class="pb pb-sonar"><i style="width:${pct}"></i>${d > 0 && d < t ? `<s style="left:${pct}"></s><s style="left:${pct};animation-delay:.9s"></s>` : ''}</div>`;
    case 'seg': {
      const n = 24, on = Math.round(p * n);
      return `<div class="pb pb-seg">${Array.from({ length: n }, (_, k) => `<i class="${k < on ? 'on' : ''}"></i>`).join('')}</div>`;
    }
    case 'tape': { // the case stays its size; the tape pulls out across the rest, numbered at the tasks done
      const every = Math.max(1, Math.ceil(t / 12));
      let nums = '';
      for (let i = every; i <= d; i += every) nums += `<em style="left:${((i / d) * 100).toFixed(2)}%">${i}</em>`;
      return `<div class="pb pb-tape"><svg class="case" viewBox="0 0 48 28" aria-hidden="true"><rect width="48" height="28" rx="7"/><circle class="hole" cx="24" cy="14" r="7"/><circle cx="24" cy="14" r="2.4"/></svg><span class="run">${d ? `<span class="band" style="width:${pct}">${nums}<b></b></span>` : ''}</span></div>`;
    }
    default:
      return `<div class="pb pb-plain"><i style="width:${pct}"></i></div>`;
  }
}
