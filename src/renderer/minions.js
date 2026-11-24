'use strict';
/*
 * 하수인: the little worker characters of sub-agents, drawn the same in the sidebar (under the agent that launched
 * them) and in the room of 진행도 (src/minsuterm-progress/scripts/page.html; the progress server hands it this file and
 * minions.css). A sub-agent's look comes from its seed, the id of the call that launched it, so the same sub-agent
 * is the same minion in both places.
 */
const MINION_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#9775fa', '#f783ac', '#e599f7', '#66d9e8', '#a9e34b', '#ff8787', '#ffc078'];
// Bold, simple silhouettes that still read at 20 px: shape + colour + big eyes, nothing more.
const MINION_BODIES = [
  { d: '<circle cx="10" cy="10.5" r="7.5"/>', ey: 10 }, // 동글이
  { d: '<rect x="3" y="5" width="14" height="12.5" rx="3.5"/><rect x="9" y="1.6" width="2" height="4" rx="1"/>', ey: 11 }, // 로봇
  { d: '<path d="M3 18.5V10a7 7 0 0 1 14 0v8.5l-2.4-1.8-2.3 1.8L10 16.7l-2.3 1.8-2.3-1.8z"/>', ey: 10 }, // 유령
  { d: '<path d="M3.2 7.6 3 1.8l4.6 3.1h4.8L17 1.8l-.2 5.8A7.4 7.4 0 1 1 3.2 7.6z"/>', ey: 11.2 }, // 고양이
  { d: '<rect x="4.6" y=".8" width="3.4" height="8.4" rx="1.7"/><rect x="12" y=".8" width="3.4" height="8.4" rx="1.7"/><circle cx="10" cy="12.4" r="6.6"/>', ey: 12 }, // 토끼
  { d: '<path d="M10 1.6c2.8 3.9 7.4 7.5 7.4 11a7.4 7.4 0 0 1-14.8 0c0-3.5 4.6-7.1 7.4-11z"/>', ey: 12.6 }, // 물방울
  { d: '<circle cx="4.6" cy="5" r="2.8"/><circle cx="15.4" cy="5" r="2.8"/><circle cx="10" cy="11" r="7"/>', ey: 10.6 }, // 곰
  { d: '<circle cx="7.3" cy="6.4" r="3.2"/><circle cx="12.7" cy="6.4" r="3.2"/><ellipse cx="10" cy="12.8" rx="8" ry="5.6"/>', ey: 6.4 }, // 개구리
  { d: '<path d="M3 11a7 7 0 0 1 14 0v3.6c0 1-.9 1.2-1.4.5-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5 1.3-1.9 1.3-2.4 0-.5.7-1.4.5-1.4-.5z"/>', ey: 10 }, // 문어
  { d: '<path d="M10 1.4l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L10 13.8l-5 2.8 1.2-5.6L2 7.2l5.6-.6z" stroke-linejoin="round"/>', ey: 9.4 }, // 별
  { d: '<path d="M5 6.4h10l2.2 11H2.8z"/><path d="M5 6.4c0-2.6 2.2-3.4 5-3.4s5 .8 5 3.4" opacity=".55"/>', ey: 11.4 }, // 푸딩
];
function minionHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** A tiny worker character: one of 6 shapes × 14 colours × 3 eye styles, picked from the sub-agent's id. */
function minionSvg(seed, work = '') {
  let h = minionHash(String(seed));
  const pick = (n) => { const v = h % n; h = Math.floor(h / n) ^ (h << 7); h >>>= 0; return v; };
  const body = MINION_BODIES[pick(MINION_BODIES.length)];
  const c = MINION_COLORS[pick(MINION_COLORS.length)];
  const ink = '#1a1d26';
  const ey = body.ey;
  const kind = pick(3);
  let eyes;
  if (kind === 0) eyes = `<circle cx="7.3" cy="${ey}" r="1.7"/><circle cx="12.7" cy="${ey}" r="1.7"/>`; // big dots
  else if (kind === 1) eyes = `<path d="M5.7 ${ey + 0.8}q1.6-2.4 3.2 0M11.1 ${ey + 0.8}q1.6-2.4 3.2 0" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/>`; // happy ^^
  else eyes = `<circle cx="10" cy="${ey}" r="3.3" fill="#fff"/><circle cx="10.6" cy="${ey}" r="1.8"/>`; // one big eye
  // welding: a dark visor with a glint instead of eyes
  const face = work === 'weld'
    ? `<rect x="3.6" y="${ey - 2.4}" width="12.8" height="4.8" rx="1.6" fill="#2a3140"/><rect x="5" y="${ey - 1.2}" width="10" height="2.2" rx="1" fill="#5ff0ff" class="mn-visor"/>`
    : `<g fill="${ink}" class="mn-eyes">${eyes}</g>`;
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><g fill="${c}">${body.d}</g>${face}</svg>`;
}
// what a minion is doing (one per sub-agent): a little prop, and the effect of the work
const MINION_WORK = ['magnify', 'weld', 'hammer', 'laptop', 'papers', 'gear', 'dig', 'paint', 'saw', 'broom', 'flask', 'drill', 'water', 'book', 'radio'];
const MINION_PROPS = {
  magnify: '<svg class="mn-prop" viewBox="0 0 12 12"><circle cx="5" cy="5" r="3.2" fill="rgba(170,225,255,.45)" stroke="#d6dde9" stroke-width="1.5"/><path d="M7.4 7.4 10.8 10.8" stroke="#b07a4a" stroke-width="2" stroke-linecap="round"/><path d="M3.6 3.8a1.8 1.8 0 0 1 1.6-1" stroke="#fff" stroke-width=".8" fill="none" stroke-linecap="round"/></svg>',
  weld: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="5" y="2" width="2.6" height="7" rx="1" fill="#8d96a8" transform="rotate(35 6 6)"/><rect x="2.4" y="8.2" width="2.2" height="1.6" rx=".5" fill="#c9d1de" transform="rotate(35 6 6)"/><circle class="mn-flame" cx="2.2" cy="10" r="1.6" fill="#bff6ff"/></svg>',
  hammer: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="5.3" y="3.6" width="1.5" height="7.6" rx=".6" fill="#b07a4a"/><rect x="2" y="1.2" width="8" height="3.4" rx="1" fill="#9aa3b5"/></svg>',
  laptop: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1.5" y="2.5" width="9" height="6" rx=".8" fill="#5b6478"/><rect x="2.4" y="3.3" width="7.2" height="4.4" rx=".4" fill="#38e1ff" class="mn-screen"/><path d="M.5 9.2h11l-1 1.6h-9z" fill="#8d96a8"/></svg>',
  papers: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="2" y="4" width="7" height="7" rx=".6" fill="#f1f3f7"/><path d="M3.4 6h4.2M3.4 7.6h4.2M3.4 9.2h2.8" stroke="#9aa3b5" stroke-width=".8"/></svg>',
  gear: '<svg class="mn-prop" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.7" fill="none" stroke="#9aa3b5" stroke-width="2.6" stroke-dasharray="1.7 1.2"/><circle cx="6" cy="6" r="2.2" fill="#9aa3b5"/><circle cx="6" cy="6" r=".9" fill="#1a1d26"/></svg>',
  dig: '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M9.6 1.2 5.4 6.6" stroke="#b07a4a" stroke-width="1.5" stroke-linecap="round"/><path d="M4.2 5.4 7 7.6 4.6 10.8c-.8.9-2.6-.4-2.1-1.6z" fill="#aab3c3"/></svg>',
  paint: '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="8" height="3.4" rx="1.6" fill="var(--paint)"/><path d="M9.5 3.2h1.3v3.4H6v4.4" fill="none" stroke="#9aa3b5" stroke-width="1.1"/></svg>',
};
MINION_PROPS.saw = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M1 5.2h8.6v2.6H1z" fill="#c9d1de"/><path d="M1 7.8l.9 1 .9-1 .9 1 .9-1 .9 1 .9-1 .9 1 .9-1 .9 1" fill="none" stroke="#c9d1de" stroke-width=".8"/><rect x="9.2" y="4.2" width="2.4" height="4.6" rx="1" fill="#b07a4a"/></svg>';
MINION_PROPS.broom = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M8.6 .8 6 7" stroke="#b07a4a" stroke-width="1.3" stroke-linecap="round"/><path d="M4.2 6.4 7.6 7.8 6.6 11.4 1.8 9.4z" fill="#e8c56a"/></svg>';
MINION_PROPS.flask = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M4.6 1.2h2.8M5 1.2v3.6L2 10.2c-.4.8.1 1.4.9 1.4h6.2c.8 0 1.3-.6.9-1.4L7 4.8V1.2" fill="#e9f4ff" stroke="#c9d1de" stroke-width=".7"/><path d="M3.2 8.4h5.6l1.1 1.9c.3.6 0 1-.6 1H2.7c-.6 0-.9-.4-.6-1z" fill="#7cf29a"/></svg>';
MINION_PROPS.drill = '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="1" y="3" width="6.4" height="3.6" rx="1.2" fill="#ffb02e"/><rect x="2.4" y="6" width="2.2" height="4.6" rx=".8" fill="#4a5163"/><path d="M7.4 4.8h4" stroke="#c9d1de" stroke-width="1.2" stroke-dasharray="1 .5"/></svg>';
MINION_PROPS.water = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M1.6 4.4h5.6v5.4c0 .7-.5 1.2-1.2 1.2H2.8c-.7 0-1.2-.5-1.2-1.2z" fill="#4dabf7"/><path d="M7.2 6l3.6-2.4" stroke="#4dabf7" stroke-width="1.3" stroke-linecap="round"/><path d="M2.6 4.4a1.8 1.8 0 0 1 3.6 0" fill="none" stroke="#4dabf7" stroke-width=".9"/></svg>';
MINION_PROPS.book = '<svg class="mn-prop" viewBox="0 0 12 12"><path d="M6 3.2C4.4 2.2 2.6 2 1 2.4v7.4c1.6-.4 3.4-.2 5 .8 1.6-1 3.4-1.2 5-.8V2.4c-1.6-.4-3.4-.2-5 .8z" fill="#f1f3f7" stroke="#9775fa" stroke-width=".7"/><path class="mn-page" d="M6 3.2v7.4C7.6 9.6 9.4 9.4 11 9.8V2.4c-1.6-.4-3.4-.2-5 .8z" fill="#e3e6ee"/></svg>';
MINION_PROPS.radio = '<svg class="mn-prop" viewBox="0 0 12 12"><rect x="2" y="4.6" width="5" height="6.8" rx="1" fill="#4a5163"/><rect x="3" y="5.6" width="3" height="1.6" rx=".3" fill="#69db7c"/><path d="M5.6 4.6V1" stroke="#9aa3b5" stroke-width=".9"/></svg>';
const MINION_FX = { weld: 4, hammer: 1, laptop: 3, papers: 3, dig: 3, magnify: 0, gear: 0, paint: 1, saw: 3, broom: 3, flask: 3, drill: 3, water: 3, book: 0, radio: 3 }; // particles per action

/**
 * A sub-agent's minion: its character; while it works, the tool in its hands and the work's effect; a check once
 * done (fresh: it has just finished, the check pops in and the minion cheers).
 */
function minionHtml(seed, { live = false, done = false, fresh = false } = {}) {
  seed = String(seed);
  const w = MINION_WORK[minionHash(seed + ':work') % MINION_WORK.length];
  const paint = MINION_COLORS[minionHash(seed + ':paint') % MINION_COLORS.length];
  const fx = live ? Array.from({ length: MINION_FX[w] || 0 }, (_, i) => `<i class="mfx f${i}"></i>`).join('') : '';
  // the check badge: pops onto the minion with a ring and sparkles, the tick drawing itself in
  const check = done ? `<span class="mn-check${fresh ? ' fresh' : ''}"><i class="ring"></i><i class="sp s0"></i><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.4"/><path d="M3.4 6.3l1.8 1.8 3.6-3.8"/></svg></span>` : '';
  return `<span class="minion mw-${w}${fresh ? ' mn-cheer' : ''}" style="--paint:${paint}">${minionSvg(seed, live ? w : '')}${live ? MINION_PROPS[w] : ''}${fx}${check}</span>`;
}
