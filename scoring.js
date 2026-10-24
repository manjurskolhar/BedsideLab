/*
 * BedsideLab item scoring (Next Generation NCLEX-style item types).
 * Used by the server to check saved answers and by the build tools to verify every key.
 *
 *   mcq        one best answer                      1 point
 *   sata       select all that apply                +/- scoring: +1 each correct choice, -1 each wrong choice, never below 0
 *   rank       put options in priority order        1 point for each option in its correct position
 *   matrix     one column per row                   1 point per row
 *   cloze      drop-down choices inside a sentence  1 point per blank
 *   highlight  select the relevant findings         +/- scoring, like sata
 *   bowtie     condition + actions + parameters     1 point per correct pick
 *   text       open response                        graded by faculty (points set on the item)
 */
'use strict';
const TYPES = ['mcq', 'sata', 'rank', 'matrix', 'cloze', 'highlight', 'bowtie', 'text'];
const TYPE_LABEL = { mcq: 'Multiple choice', sata: 'Select all that apply', rank: 'Prioritize (put in order)', matrix: 'Matrix', cloze: 'Drop-down (cloze)', highlight: 'Highlight the findings', bowtie: 'Bow-tie', text: 'Open response' };

const int = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d+$/.test(v) ? +v : null));
const ints = (v) => (Array.isArray(v) ? [...new Set(v.map(int).filter(x => x !== null))] : []);

/* the most points an item can earn */
function maxPoints(it) {
  switch (it.type) {
    case 'mcq': return 1;
    case 'sata': case 'highlight': return (it.key || []).length || 1;
    case 'rank': return (it.options || []).length;
    case 'matrix': return (it.rows || []).length;
    case 'cloze': return (it.blanks || []).length;
    case 'bowtie': return 1 + (it.key?.a || []).length + (it.key?.m || []).length;
    case 'text': return Math.max(0, +it.points || 0);
    default: return 0;
  }
}

/* keep only well-formed values for an item (what the server stores) */
function cleanValue(it, v) {
  if (v === undefined || v === null || v === '') return undefined;
  switch (it.type) {
    case 'mcq': { const x = int(v); return x !== null && x < (it.options || []).length ? x : undefined; }
    case 'sata': case 'highlight': { const n = (it.options || []).length; const a = ints(v).filter(x => x < n).sort((a, b) => a - b); return a.length ? a : undefined; }
    case 'rank': { const n = (it.options || []).length; const a = ints(v).filter(x => x < n); return a.length === n ? a : undefined; }
    case 'matrix': { const r = (it.rows || []).length, c = (it.cols || []).length; if (!Array.isArray(v)) return undefined; const a = Array.from({ length: r }, (_, i) => { const x = int(v[i]); return x !== null && x < c ? x : null; }); return a.some(x => x !== null) ? a : undefined; }
    case 'cloze': { const b = it.blanks || []; if (!Array.isArray(v)) return undefined; const a = b.map((bl, i) => { const x = int(v[i]); return x !== null && x < bl.options.length ? x : null; }); return a.some(x => x !== null) ? a : undefined; }
    case 'bowtie': { if (!v || typeof v !== 'object') return undefined; const pa = it.pick?.a || (it.key?.a || []).length || 2, pm = it.pick?.m || (it.key?.m || []).length || 2;
      const c = int(v.c); const o = { c: c !== null && c < (it.conditions || []).length ? c : null, a: ints(v.a).filter(x => x < (it.actions || []).length).slice(0, pa), m: ints(v.m).filter(x => x < (it.monitors || []).length).slice(0, pm) };
      return o.c !== null || o.a.length || o.m.length ? o : undefined; }
    case 'text': { const s = String(v).slice(0, 8000); return s.trim() ? s : undefined; }
    default: return undefined;
  }
}

/* score one saved value against the key */
function scoreItem(it, v) {
  const max = maxPoints(it);
  if (it.type === 'text') return { manual: true, max, score: null, empty: v === undefined, msg: v === undefined ? 'No answer' : 'Open response: graded by faculty' };
  if (v === undefined) return { score: 0, max, ok: false, empty: true, msg: 'No answer' };
  let score = 0;
  switch (it.type) {
    case 'mcq': score = v === it.key ? 1 : 0; break;
    case 'sata': case 'highlight': { const key = new Set(it.key || []); const right = v.filter(x => key.has(x)).length, wrong = v.length - right; score = Math.max(0, right - wrong); break; }
    case 'rank': score = v.filter((x, i) => x === it.key[i]).length; break;
    case 'matrix': score = (it.key || []).filter((k, i) => v[i] === k).length; break;
    case 'cloze': score = (it.blanks || []).filter((b, i) => v[i] === b.key).length; break;
    case 'bowtie': { const k = it.key || {}; score = (v.c === k.c ? 1 : 0) + (v.a || []).filter(x => (k.a || []).includes(x)).length + (v.m || []).filter(x => (k.m || []).includes(x)).length; break; }
  }
  return { score, max, ok: score === max, partial: score > 0 && score < max, msg: `${score} of ${max} point${max === 1 ? '' : 's'}` };
}

function scoreAll(items, answers) {
  const out = {};
  for (const it of items || []) out[it.n] = scoreItem(it, answers?.[it.n]?.value);
  return out;
}

/* totals: auto-scored points earned / possible, and open-response points still to grade */
function totals(items, auto) {
  let got = 0, autoMax = 0, manualMax = 0, manualN = 0;
  for (const it of items || []) { const r = auto?.[it.n]; const m = maxPoints(it);
    if (it.type === 'text') { manualMax += m; manualN++; } else { autoMax += m; got += r?.score || 0; } }
  return { got, autoMax, manualMax, manualN, max: autoMax + manualMax };
}

/* what students may see of an item: never the key, rationale or model answer */
function publicItem(it) {
  const c = JSON.parse(JSON.stringify(it)); delete c.key; delete c.rationale; delete c.model; delete c.rubric;
  if (c.blanks) c.blanks = c.blanks.map(b => ({ options: b.options }));
  return c;
}

/* cloze authoring markup: "The client has [[hypovolemia|*sepsis|anxiety]]." (* marks the right choice) */
function parseCloze(text) {
  const blanks = []; const out = String(text || '').replace(/\[\[([^\]]+)\]\]/g, (m, body) => {
    const opts = body.split('|').map(s => s.trim()).filter(Boolean); let key = opts.findIndex(o => o.startsWith('*'));
    const options = opts.map(o => o.replace(/^\*/, '').trim()); if (key < 0) key = 0;
    blanks.push({ options, key }); return '{' + (blanks.length - 1) + '}';
  });
  return { text: out, blanks };
}
function clozeMarkup(it) {
  return String(it.text || '').replace(/\{(\d+)\}/g, (m, i) => { const b = (it.blanks || [])[+i]; return b ? '[[' + b.options.map((o, j) => (j === b.key ? '*' : '') + o).join(' | ') + ']]' : m; });
}

/* deterministic shuffle (so the order students see never reveals a rank key) */
function seededOrder(n, seedText) {
  let h = 2166136261; for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  if (n > 1 && idx.every((x, i) => x === i)) idx.push(idx.shift());
  return idx;
}
/* rank items are authored in the correct order; this stores them shuffled with the key */
function shuffleRank(it) {
  const correct = it.options; const order = seededOrder(correct.length, it.q + correct.join('|'));
  const options = order.map(i => correct[i]); const key = correct.map((_, ci) => order.indexOf(ci));
  return { ...it, options, key };
}

/* basic validation of an item definition (faculty builder and build tools) */
function checkItem(it) {
  const e = [];
  if (!TYPES.includes(it.type)) e.push('unknown type ' + it.type);
  if (!String(it.q || '').trim()) e.push('no question text');
  const n = (it.options || []).length;
  if (['mcq', 'sata', 'rank', 'highlight'].includes(it.type) && n < 2) e.push('needs at least 2 options');
  if (it.type === 'mcq' && !(Number.isInteger(it.key) && it.key < n)) e.push('key must be one option');
  if (['sata', 'highlight'].includes(it.type) && !(Array.isArray(it.key) && it.key.length && it.key.every(k => Number.isInteger(k) && k < n))) e.push('key must list the correct options');
  if (it.type === 'rank' && !(Array.isArray(it.key) && it.key.length === n && new Set(it.key).size === n)) e.push('rank key must order every option');
  if (it.type === 'matrix' && !((it.rows || []).length && (it.cols || []).length >= 2 && (it.key || []).length === it.rows.length && it.key.every(k => Number.isInteger(k) && k < it.cols.length))) e.push('matrix needs rows, 2+ columns and a key column for every row');
  if (it.type === 'cloze' && !((it.blanks || []).length && it.blanks.every(b => b.options.length >= 2 && b.key < b.options.length))) e.push('cloze needs blanks with 2+ choices');
  if (it.type === 'bowtie') { const k = it.key || {}; if (!((it.conditions || []).length >= 2 && (it.actions || []).length >= 3 && (it.monitors || []).length >= 3 && Number.isInteger(k.c) && (k.a || []).length && (k.m || []).length)) e.push('bow-tie needs conditions, actions, parameters and a key'); }
  return e;
}

module.exports = { TYPES, TYPE_LABEL, maxPoints, cleanValue, scoreItem, scoreAll, totals, publicItem, parseCloze, clozeMarkup, seededOrder, shuffleRank, checkItem };
