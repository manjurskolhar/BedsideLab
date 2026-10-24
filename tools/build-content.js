#!/usr/bin/env node
/* Turns the authored cases (tools/cases/unit*.js) into tools/cases.json: items in the stored format
   (keys as option numbers, cloze blanks, shuffled rank options) and patient charts. Checks every item and
   scores a perfect answer for each, so a broken key fails the build. */
'use strict';
const fs = require('fs'), path = require('path');
const SC = require('../scoring.js');
const DIR = path.join(__dirname, 'cases');

const star = (arr) => { const key = []; const options = arr.map((o, i) => { if (String(o).startsWith('*')) { key.push(i); return String(o).slice(1).trim(); } return String(o).trim(); }); return { options, key }; };

function convert(it, n, cid) {
  const base = { n, type: it.type, q: it.q, ...(it.cjmm ? { cjmm: it.cjmm } : {}), ...(it.rationale ? { rationale: it.rationale } : {}) };
  let out;
  switch (it.type) {
    case 'mcq': { const s = star(it.options); if (s.key.length !== 1) throw new Error(`${cid} item ${n}: mcq needs exactly one * option`); out = { ...base, options: s.options, key: s.key[0] }; break; }
    case 'sata': case 'highlight': { const s = star(it.options); if (!s.key.length) throw new Error(`${cid} item ${n}: no * option`); out = { ...base, options: s.options, key: s.key }; break; }
    case 'rank': out = SC.shuffleRank({ ...base, options: it.options.map(String) }); break;
    case 'matrix': { const cols = it.cols; out = { ...base, rows: it.rows.map(r => r[0]), cols, key: it.rows.map(r => { const k = cols.indexOf(r[1]); if (k < 0) throw new Error(`${cid} item ${n}: matrix column "${r[1]}" not found`); return k; }) }; break; }
    case 'cloze': { const p = SC.parseCloze(it.text); out = { ...base, text: p.text, blanks: p.blanks }; break; }
    case 'bowtie': { const c = star(it.conditions), a = star(it.actions), m = star(it.monitors); if (c.key.length !== 1) throw new Error(`${cid} item ${n}: bow-tie needs one condition`);
      out = { ...base, conditions: c.options, actions: a.options, monitors: m.options, key: { c: c.key[0], a: a.key, m: m.key }, pick: { a: a.key.length, m: m.key.length } }; break; }
    case 'text': out = { ...base, model: it.model || '', points: it.points || 4, ...(it.rows ? { rows: it.rows } : {}) }; break;
    default: throw new Error(`${cid} item ${n}: unknown type ${it.type}`);
  }
  const e = SC.checkItem(out); if (e.length) throw new Error(`${cid} item ${n}: ${e.join('; ')}`);
  /* the key must score full marks */
  if (out.type !== 'text') {
    const perfect = { mcq: out.key, sata: out.key, highlight: out.key, rank: out.key, matrix: out.key, cloze: (out.blanks || []).map(b => b.key), bowtie: out.key }[out.type];
    const r = SC.scoreItem(out, SC.cleanValue(out, perfect)); if (!r.ok) throw new Error(`${cid} item ${n}: key does not score full marks (${r.msg})`);
  }
  return out;
}

const files = fs.readdirSync(DIR).filter(f => /^unit\d+\.js$/.test(f)).sort();
const cases = files.flatMap(f => require(path.join(DIR, f)));
const ids = new Set(); const patients = {}; const out = [];
let order = 0;
for (const c of cases) {
  if (ids.has(c.id)) throw new Error('duplicate case id ' + c.id); ids.add(c.id);
  if (c.chart) { if (patients[c.patient]) throw new Error('duplicate patient ' + c.patient); patients[c.patient] = { ...c.chart, facility: c.chart.facility || 'BedsideLab Teaching Hospital' }; }
  const items = c.items.map((it, i) => convert(it, i + 1, c.id));
  const num = +c.id.slice(1);
  out.push({ id: c.id, num, order: ++order, title: `Case ${num}: ${c.title}`, short: c.title, group: c.unit, level: c.level, tags: c.tags, cjmm: c.cjmm, description: c.description, objectives: c.objectives, scenario: c.scenario || '', patient: c.patient, teamwork: !!c.teamwork, items });
}
for (const c of out) if (!patients[c.patient]) throw new Error(`${c.id}: patient ${c.patient} has no chart`);
fs.writeFileSync(path.join(__dirname, 'cases.json'), JSON.stringify({ cases: out, patients }, null, 1));
const nItems = out.reduce((a, c) => a + c.items.length, 0); const byType = {};
for (const c of out) for (const it of c.items) byType[it.type] = (byType[it.type] || 0) + 1;
console.log(`cases.json: ${out.length} cases, ${Object.keys(patients).length} patient charts, ${nItems} items`, byType);
