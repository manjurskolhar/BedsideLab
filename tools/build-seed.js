#!/usr/bin/env node
/* Writes seed/seed.json (built-in patient charts, library activities with their items, and the document list)
   from tools/cases.json and tools/doc-files.json. Run after build-content.js and build-docs.js. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { cases, patients } = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const dfp = path.join(__dirname, 'doc-files.json');
const files = fs.existsSync(dfp) ? JSON.parse(fs.readFileSync(dfp, 'utf8')) : [];
const AT = Date.UTC(2026, 9, 1); // documents dated 1 October 2026
const size = (f) => fs.statSync(path.join(ROOT, 'seed', 'docs', f)).size;

const library = {};
for (const c of cases) {
  const doc = files.find(f => f.id === 'S-' + c.id), key = files.find(f => f.id === 'K-' + c.id);
  library[c.id] = {
    title: c.title, group: c.group, description: c.description, tags: c.tags, level: c.level, cjmm: c.cjmm, order: c.order, scenario: c.scenario,
    instructions: 'Open the patient chart in a new tab. Start with the handoff report, then review the notes, assessment, vital signs, results, MAR and orders. Answer each item in the chart\'s Activity tab (your answers are saved to this assignment). Complete the activity document with your reasoning and reflection, then upload it here.',
    points: 100, ...(c.teamwork ? { teamwork: true } : {}),
    docs: doc ? [{ fid: doc.id, name: doc.name, size: size(doc.file), at: AT }] : [], keyDocs: key ? [{ fid: key.id, name: key.name, size: size(key.file), at: AT }] : [],
    patient: c.patient, ...(fs.existsSync(path.join(ROOT, 'public', 'img', 'cases', c.id + '.svg')) ? { image: '/img/cases/' + c.id + '.svg' } : {}),
    items: c.items, updatedAt: AT,
  };
}
fs.mkdirSync(path.join(ROOT, 'seed'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'seed', 'seed.json'), JSON.stringify({ patients, library, files }, null, 1));
console.log('seed.json:', Object.keys(patients).length, 'patient charts,', Object.keys(library).length, 'activities,', files.length, 'documents');
