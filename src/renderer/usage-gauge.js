'use strict';
/*
 * 사용량 게이지: the floating button at the bottom right of an agent tab that opens upward into context, 5-hour
 * limit, weekly limit (small rings, only the ones known) and model and effort (꾸미기 → 에이전트 화면).
 * The app gives the numbers (app.js); this file only draws them, in the style picked (settings.usageStyle).
 * The owner approved the look in a mockup of these styles (2026-11-25); each has a dark and a light version
 * (usage-gauge.css, by the app theme).
 *
 * Moods by percentage: calm < 50 <= mid < 80 <= warn < 95 <= hot. Each ring wrapper and the button carry
 * data-lv; the root carries the highest one. CSS does the rest.
 */
const USAGE_STYLES = [
  ['glass', '글래스', '반투명 유리판, 얇고 매끈한 링'],
  ['neon', '네온 튜브', '빛나는 분홍·하늘색 관'],
  ['gauge', '계기판', '눈금 40칸이 차오르는 금속 계기'],
  ['lcd', '레트로 LCD', '액정 화면에 12칸 마디'],
  ['paper', '종이 카드', '종이에 잉크로 그린 링, 명조 글씨'],
  ['pixel', '8비트', '네모 픽셀이 한 칸씩, 계단식으로 열림'],
  ['aurora', '오로라', '청록에서 보라로 흐르는 그라데이션 링'],
  ['chrono', '크로노그래프', '시계 보조 다이얼과 바늘'],
  ['blue', '블루프린트', '모눈 도면에 가는 선과 치수'],
  ['candy', '파스텔 캔디', '말랑한 파스텔 판, 굵고 둥근 링'],
  ['holo', '홀로그램', '무지갯빛 테두리가 천천히 돌아감'],
  ['brutal', '브루탈', '굵은 테두리와 노란 박스'],
  ['mono', '터미널', '초록 터미널 글씨, 점 12개 링'],
  ['orbit', '행성 궤도', '궤도를 도는 작은 행성이 진행 위치'],
  ['ink', '수묵', '먹과 붓으로 그은 링과 낙관'],
];
const USAGE_RINGS = [
  ['ctx', '컨텍스트', '컨텍스트가 찬 정도'],
  ['h5', '5시간 한도', '5시간 사용 한도'],
  ['wk', '주간 한도', '주간 사용 한도'],
  ['max', '가장 높은 것', '셋 중 가장 많이 찬 것'],
  ['none', '링 없음', '아이콘만, 80%를 넘으면 알려요'],
];

/* the ring each style draws: kind and its options */
const UG_KIND = {
  glass: ['arc', { w: 3 }],
  neon: ['arc', { w: 2.5, grad: true }],
  gauge: ['seg', { n: 40, w: 4, ptr: true }],
  lcd: ['seg', { n: 12, w: 4.5, tip: true, glo: true }],
  paper: ['arc', { w: 3 }],
  pixel: ['pixel', {}],
  aurora: ['conic', {}],
  chrono: ['dial', {}],
  blue: ['arc', { w: 1.5 }],
  candy: ['arc', { w: 5, grad: true }],
  holo: ['conic', {}],
  brutal: ['arc', { w: 5, square: true }],
  mono: ['dots', { n: 12 }],
  orbit: ['orbit', {}],
  ink: ['arc', { w: 3.2, brush: true }],
};
const UG_KEYS = ['ctx', 'h5', 'wk'];
const UG_NAME = { ctx: '컨텍스트', h5: '5시간 한도', wk: '주간 한도' };
const UG_TITLE = '사용량'; // the button tooltip, kept as its own literal so the phrase extractor sees it
const UG_ICON = '<svg class="ug-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 11a5.5 5.5 0 0 1 11 0"/><path d="M8 11l2.6-3.2"/></svg>';
let ugSeq = 0; // svg ids (gradients, brush filters) are unique per drawing

const ugEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || '&quot;');
const ugMood = (p) => (p == null ? 'calm' : p >= 95 ? 'hot' : p >= 80 ? 'warn' : p >= 50 ? 'mid' : 'calm');
const ugF = (n) => Math.round(n * 100) / 100;

/**
 * A ring of the style's kind, s px square, filled p (0-100; null = no numbers yet: a dim empty ring).
 * uid names its svg ids (stable per gauge and item, so an unchanged gauge draws the same markup); none = a fresh one.
 * Lit parts sit in one <g class="ug-on"> and the track in <g class="ug-off"> so a mood animates one element.
 */
function ugRing(style, p, s, uid) {
  const id0 = uid || `n${++ugSeq}`;
  const [kind, o] = UG_KIND[style] || UG_KIND.glass;
  const has = p != null;
  const q = has ? Math.max(0, Math.min(100, p)) / 100 : 0;
  const cls = `ug-ring k-${kind}${has ? '' : ' ug-empty'}`;
  const c = s / 2;
  const k = s >= 38 ? 1.05 : s >= 30 ? 0.9 : s / 38; // stroke scale by size
  if (kind === 'conic') return `<span class="${cls} ug-cring" style="--p:${ugF(q * 100)};--w:${ugF(s >= 38 ? 3.2 : s >= 30 ? 3 : Math.max(2, s / 11))}px"></span>`;
  const r = c - (s >= 30 ? 3 : (3 * s) / 34);
  const pt = (a, rr) => `${ugF(c + rr * Math.cos(a))} ${ugF(c + rr * Math.sin(a))}`;
  let off = '';
  let on = '';
  let defs = '';
  let onAttr = '';
  let after = '';
  let fill = false;
  if (kind === 'arc') {
    const w = ugF(o.w * k);
    const C = 2 * Math.PI * r;
    off = `<circle cx="${c}" cy="${c}" r="${ugF(r)}" stroke-width="${w}"/>`;
    if (q > 0.004) on = `<circle cx="${c}" cy="${c}" r="${ugF(r)}" stroke-width="${w}" stroke-linecap="${o.square ? 'butt' : 'round'}" stroke-dasharray="${ugF(C * q)} ${ugF(C)}" transform="rotate(-90 ${c} ${c})"/>`;
    if (o.grad) {
      const id = `ugg${id0}`;
      defs = `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" class="ug-s1"/><stop offset="1" class="ug-s2"/></linearGradient></defs>`;
      onAttr = ` style="stroke:url(#${id})"`;
    }
    if (o.brush) {
      const id = `ugb${id0}`;
      defs = `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="${([...id0].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 7) + 1}"/><feDisplacementMap in="SourceGraphic" scale="${ugF(2.6 * Math.min(1, s / 34))}"/></filter></defs>`;
      onAttr = ` filter="url(#${id})"`;
    }
  } else if (kind === 'seg') {
    const n = o.n;
    const lit = Math.round(n * q);
    const w = ugF(o.w * (s >= 38 ? 1 : 0.85) * Math.min(1, s / 34));
    const gap = (360 / n) * 0.18;
    let glo = '';
    for (let i = 0; i < n; i++) {
      const a0 = (((i / n) * 360 - 90 + gap) * Math.PI) / 180;
      const a1 = ((((i + 1) / n) * 360 - 90 - gap) * Math.PI) / 180;
      const tip = o.tip && i === lit - 1 ? ' class="ug-tip"' : '';
      const d = `<path${tip} d="M${pt(a0, r)}A${ugF(r)} ${ugF(r)} 0 0 1 ${pt(a1, r)}" stroke-width="${w}"/>`;
      if (i < lit) { on += d; if (o.glo) glo += d.replace(`stroke-width="${w}"`, `stroke-width="${ugF(w + 3)}"`); } else off += d;
    }
    if (glo) defs = `<g class="ug-glo">${glo}</g>`; // a soft halo under the lit segments (backlit LCD)
    if (o.ptr && has) { // a small pointer just inside the ticks, at the fill end (trembles when it runs high)
      const a = ((q * 360 - 90) * Math.PI) / 180;
      const r0 = r - w / 2 - 0.7;
      const r1 = r0 - 2.8 * Math.min(1, s / 34);
      const sp = 0.16;
      after = `<g class="ug-nd" style="transform-origin:${c}px ${c}px"><path d="M${pt(a, r0)}L${pt(a - sp, r1)}L${pt(a + sp, r1)}Z"/></g>`;
    }
  } else if (kind === 'dots') {
    fill = true;
    const n = o.n;
    const lit = Math.round(n * q);
    const dr = ugF(s >= 38 ? 2 : s >= 30 ? 1.8 : Math.max(1, s / 19));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      const [x, y] = pt(a, r).split(' ');
      const d = `<circle${i === lit - 1 ? ' class="ug-tip"' : ''} cx="${x}" cy="${y}" r="${dr}"/>`;
      if (i < lit) on += d; else off += d;
    }
  } else if (kind === 'pixel') {
    fill = true;
    const g = 7;
    const cell = s / g;
    const cells = [];
    for (let x = 3; x < g; x++) cells.push([x, 0]);
    for (let y = 1; y < g; y++) cells.push([g - 1, y]);
    for (let x = g - 2; x >= 0; x--) cells.push([x, g - 1]);
    for (let y = g - 2; y >= 0; y--) cells.push([0, y]);
    for (let x = 1; x < 3; x++) cells.push([x, 0]);
    const lit = Math.round(cells.length * q);
    const pad = Math.max(0.6, cell * 0.12);
    cells.forEach(([x, y], i) => {
      const d = `<rect${i === lit - 1 ? ' class="ug-tip"' : ''} x="${ugF(x * cell + pad)}" y="${ugF(y * cell + pad)}" width="${ugF(cell - pad * 2)}" height="${ugF(cell - pad * 2)}"/>`;
      if (i < lit) on += d; else off += d;
    });
    return `<svg class="${cls} k-fill" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" aria-hidden="true"><g class="ug-off">${off}</g>${has ? `<g class="ug-on">${on}</g>` : ''}</svg>`;
  } else if (kind === 'dial') {
    const rr = r + 1.5;
    const C = 2 * Math.PI * rr;
    const arc = C * 0.75;
    const sw = ugF(Math.max(1, 1.6 * k));
    off = `<circle cx="${c}" cy="${c}" r="${ugF(rr)}" stroke-width="1" stroke-dasharray="${ugF(arc)} ${ugF(C)}" transform="rotate(135 ${c} ${c})"/>`;
    for (let i = 0; i <= 10; i++) {
      const a = ((-225 + i * 27) * Math.PI) / 180;
      off += `<line x1="${pt(a, r).split(' ')[0]}" y1="${pt(a, r).split(' ')[1]}" x2="${pt(a, r - (i % 5 ? 1.8 : 3) * Math.min(1, s / 34)).split(' ')[0]}" y2="${pt(a, r - (i % 5 ? 1.8 : 3) * Math.min(1, s / 34)).split(' ')[1]}" stroke-width="1"/>`;
    }
    if (q > 0.004) on = `<circle cx="${c}" cy="${c}" r="${ugF(rr)}" stroke-width="${sw}" stroke-dasharray="${ugF(arc * q)} ${ugF(C)}" transform="rotate(135 ${c} ${c})"/>`;
    if (has) {
      const a = ((-225 + 270 * q) * Math.PI) / 180;
      const [x2, y2] = pt(a, r - 4 * Math.min(1, s / 34)).split(' ');
      after = `<g class="ug-nd" style="transform-origin:${c}px ${c}px"><line x1="${c}" y1="${c}" x2="${x2}" y2="${y2}" stroke-width="${ugF(Math.max(1, 1.4 * k))}" stroke-linecap="round"/></g><circle class="ug-hub" cx="${c}" cy="${c}" r="${ugF(Math.max(1, 1.6 * k))}"/>`;
    }
  } else if (kind === 'orbit') {
    const C = 2 * Math.PI * r;
    const a = ((-90 + 360 * q) * Math.PI) / 180;
    const [x, y] = pt(a, r).split(' ');
    const pr = ugF(s >= 38 ? 3.2 : s >= 30 ? 2.8 : Math.max(1.6, s / 12));
    off = `<circle cx="${c}" cy="${c}" r="${ugF(r)}" stroke-width="1"/>`;
    if (q > 0.004) on = `<circle class="ug-trail" cx="${c}" cy="${c}" r="${ugF(r)}" stroke-width="${ugF(Math.max(1, 1.4 * k))}" stroke-dasharray="${ugF(C * q)} ${ugF(C)}" transform="rotate(-90 ${c} ${c})"/>`;
    if (has) after = `<circle class="ug-halo" cx="${x}" cy="${y}" r="${pr}"/><circle class="ug-pl" cx="${x}" cy="${y}" r="${pr}"/>`;
  }
  return `<svg class="${cls}${fill ? ' k-fill' : ''}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${defs}<g class="ug-off">${off}</g>${has ? `<g class="ug-on"${onAttr}>${on}</g>` : ''}${after}</svg>`;
}

/** Percentages of the three items, rounded (null = not known). */
function ugPcts(d) {
  const pc = {};
  for (const k of UG_KEYS) {
    const v = d && d[k];
    const n = v && v.pct != null ? Number(v.pct) : NaN;
    pc[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  }
  return pc;
}
/** Which item the collapsed button shows: ring choice, max picks the fullest, an unknown item falls back to ctx. */
function ugPick(pc, ring) {
  const known = UG_KEYS.filter((k) => pc[k] != null);
  let rk = ring || 'ctx';
  if (rk === 'max') rk = known.length ? known.reduce((m, k) => (pc[k] > pc[m] ? k : m)) : 'ctx';
  if (rk !== 'none' && (!UG_KEYS.includes(rk) || pc[rk] == null)) rk = 'ctx';
  return rk;
}
/** The collapsed button: inner html, its mood and the label under it. */
function ugButton(style, pc, rk, s, uid) {
  const known = UG_KEYS.filter((k) => pc[k] != null);
  const top = known.length ? Math.max(...known.map((k) => pc[k])) : null;
  if (rk === 'none') {
    const m = ugMood(top);
    const hi = m === 'warn' || m === 'hot';
    return { html: UG_ICON + (hi ? '<i class="ug-dot"></i>' : ''), lv: hi ? m : 'calm', label: '' }; // a dot once anything runs high
  }
  const p = pc[rk];
  const html = ugRing(style, p, s, uid) + (p == null ? UG_ICON : `<span class="ug-val">${p}</span>`);
  return { html, lv: p == null ? 'calm' : ugMood(p), label: UG_NAME[rk] };
}

/**
 * Draws the gauge into root (a <div class="ug"> in the tab's terminal box). The app toggles .open on root; this keeps
 * it and the button element as they are, and only rewrites what changed, so opening never re-renders.
 */
function usageGaugeRender(root, d, opts = {}) {
  d = d || {};
  const style = UG_KIND[opts.style] ? opts.style : 'glass';
  const pc = ugPcts(d);
  const known = UG_KEYS.filter((k) => pc[k] != null);
  const top = known.length ? Math.max(...known.map((k) => pc[k])) : null;
  const rk = ugPick(pc, opts.ring);
  const uid = root._ugId || (root._ugId = String(++ugSeq));
  const btn = ugButton(style, pc, rk, 40, `${uid}b`);

  const rows = UG_KEYS.filter((k) => k === 'ctx' || pc[k] != null).map((k, i) => {
    const p = pc[k];
    const sub = p == null ? '기록을 기다리는 중' : ugEsc(d[k].text);
    return `<div class="ug-row" style="--i:${i}"><span class="ug-rw" data-lv="${p == null ? 'empty' : ugMood(p)}">${ugRing(style, p, 34, `${uid}${k}`)}<span class="ug-pc">${p == null ? '–' : p}</span></span>`
      + `<span class="ug-tx"><b>${UG_NAME[k]}</b><span>${sub}</span></span></div>`;
  });
  let i = rows.length;
  const model = String(d.model || '');
  const effort = String(d.effort || '');
  const modelBox = model || effort
    ? `<div class="ug-model" style="--i:${i++}">${model ? `<b>${ugEsc(model)}</b>` : ''}${effort ? `<span>effort ${ugEsc(effort)}</span>` : ''}</div>`
    : '';
  const extra = d.extra ? `<div class="ug-extra" style="--i:${i++}">${d.extra}</div>` : '';
  const head = `<div class="ug-head"><span>${d.agent === 'codex' ? 'Codex 사용량' : 'Claude 사용량'}</span><i class="ug-orn"></i></div>`;
  const panelHtml = head + rows.join('') + modelBox + extra;

  root.classList.add('ug');
  root.dataset.style = style;
  root.dataset.lv = ugMood(top);
  let st = root._ug;
  if (!st || st.panel.parentNode !== root) {
    root.innerHTML = `<div class="ug-panel"></div><div class="ug-foot"><button class="ug-btn" type="button" title="${UG_TITLE}" aria-label="${UG_TITLE}"></button><span class="ug-lbl"></span></div>`;
    st = root._ug = { panel: root.querySelector('.ug-panel'), foot: root.querySelector('.ug-foot'), btn: root.querySelector('.ug-btn'), lbl: root.querySelector('.ug-lbl'), ph: null, bh: null, lb: null };
  }
  const changed = st.ph !== panelHtml || st.bh !== btn.html;
  // animations keep their phase across redraws: every one is delayed by the same wall clock
  if (changed) root.style.setProperty('--ug-t', `${-((Date.now() % 1e7) / 1000).toFixed(3)}s`);
  if (st.ph !== panelHtml) { st.panel.innerHTML = panelHtml; st.ph = panelHtml; }
  if (st.bh !== btn.html) { st.btn.innerHTML = btn.html; st.bh = btn.html; }
  if (st.btn.dataset.lv !== btn.lv) st.btn.dataset.lv = btn.lv;
  if (st.lb !== btn.label) { st.lbl.textContent = btn.label; st.lb = btn.label; st.foot.classList.toggle('lb', !!btn.label); }
}

/* sample numbers for the 꾸미기 pickers */
const UG_SAMPLE = { ctx: 42, h5: 63, wk: 28 };
const ugSmall = (el) => !!(el && el.classList && el.classList.contains('pk-pv'));

/** 꾸미기 picker: a style, still (button box 64x28: two rings on its panel; list item 120x36: panel and button). */
function previewUsageStyle(kind, el) {
  const style = UG_KIND[kind] ? kind : 'glass';
  const ring = (p, s) => `<span class="ug-rw" data-lv="${ugMood(p)}">${ugRing(style, p, s)}${s >= 22 ? `<span class="ug-pc">${p}</span>` : ''}</span>`;
  const small = ugSmall(el);
  const inner = small
    ? `<div class="ug-panel">${ring(42, 20)}${ring(86, 20)}</div>`
    : `<div class="ug-panel">${ring(42, 24)}${ring(86, 24)}</div><div class="ug-foot"><span class="ug-btn">${ugRing(style, 63, 28)}<span class="ug-val">63</span></span></div>`;
  el.innerHTML = `<div class="ug ug-pv still${small ? ' sm' : ''}" data-style="${style}" data-lv="calm">${inner}</div>`;
  return () => {};
}

/** 꾸미기 picker: a ring choice, as the collapsed button in the current style (and its label, in the list). */
function previewUsageRing(kind, el) {
  // eslint-disable-next-line no-undef
  const cur = (typeof S !== 'undefined' && S && S.settings && S.settings.usageStyle) || (window.S && window.S.settings && window.S.settings.usageStyle) || 'glass';
  const style = UG_KIND[cur] ? cur : 'glass';
  const small = ugSmall(el);
  const pc = { ...UG_SAMPLE };
  const rk = ugPick(pc, kind);
  const btn = ugButton(style, pc, rk, small ? 24 : 30);
  const lbl = !small && btn.label ? `<span class="ug-lbl">${btn.label}</span>` : '';
  el.innerHTML = `<div class="ug ug-pv ug-pvr still${small ? ' sm' : ''}" data-style="${style}" data-lv="calm">${lbl}<div class="ug-foot"><span class="ug-btn" data-lv="${btn.lv}">${btn.html}</span></div></div>`;
  return () => {};
}
