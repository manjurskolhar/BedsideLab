#!/usr/bin/env node
/* Builds the Word activity documents and faculty answer keys (seed/docs) from tools/cases.json.
   Needs the "docx" npm package (NODE_PATH or a local install). */
'use strict';
const fs = require('fs'), path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType,
  Header, Footer, PageNumber, TabStopType, HeadingLevel, LevelFormat, ImageRun, VerticalAlign } = require('docx');

const { cases, patients } = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'seed', 'docs'); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.docx')) fs.unlinkSync(path.join(OUT, f));
const W = 10080, INK = '14222A', MUTED = '586972', TEAL = '0E6E78', LINE = 'BFCBD3', HEAD = 'E1EEF0', SOFT = 'F3F7F8', KEYBG = 'EAF5EC', KEYINK = '1E6232';
const TYPE_LABEL = { mcq: 'Multiple choice: choose one', sata: 'Select all that apply', rank: 'Prioritize: number the options in order (1 = first)', matrix: 'Matrix: tick one column in each row', cloze: 'Drop-down: circle or write the best choice for each blank', highlight: 'Highlight: tick each finding that applies', bowtie: 'Bow-tie', text: 'Open response' };
const fileName = (t) => t.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const BOX = '☐';

const run = (text, o = {}) => new TextRun({ text: String(text), ...o });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [run(children)], ...o });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [run(t)] });
const bullet = (t, ref = 'bullets') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: Array.isArray(t) ? t : [run(t)] });
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const margins = { top: 70, bottom: 70, left: 110, right: 110 };
function cell(children, width, o = {}) {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, borders, margins, verticalAlign: o.v || VerticalAlign.TOP, shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: (Array.isArray(children) ? children : [children]).map(c => typeof c === 'string' ? para([run(c, o.run || {})], o.align ? { alignment: o.align } : {}) : c) });
}
const table = (widths, rows) => new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows });
const headRow = (cols, widths) => new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((c, i) => cell(c, widths[i], { fill: HEAD, run: { bold: true, size: 18, color: INK } })) });
const spacer = () => para('', { spacing: { after: 60 } });
const textBox = (h = 1400, label = '') => table([W], [new TableRow({ height: { value: h, rule: 'atLeast' }, cantSplit: true, children: [cell(label ? [para([run(label, { italics: true, size: 16, color: MUTED })])] : para(''), W)] })]);
const fillCloze = (it, fn) => String(it.text).replace(/\{(\d+)\}/g, (m, i) => fn(it.blanks[+i], +i));

function infoTable() {
  const w = [2621, 2486, 2486, 2487];
  return table(w, [headRow(['Student name', 'Student ID', 'Section', 'Date'], w), new TableRow({ height: { value: 420, rule: 'atLeast' }, children: w.map(x => cell('', x)) })]);
}
function snapshot(c) {
  const p = patients[c.patient] || {}; const w = [2600, 7480];
  const al = (p.allergies || []).map(a => a.agent + (a.reaction ? ` (${a.reaction})` : '')).join(', ') || 'No known allergies';
  const rows = [['Patient', `${p.name}, ${p.age}${/day|mo|wk/.test(String(p.age)) ? '' : ' years'}, ${p.sex}`], ['Setting', [p.setting, p.unit].filter(Boolean).join(' · ')], ['Reason for care', p.reason || ''], ['Allergies', al], ['Code status', p.code || ''], ['Chart in BedsideLab', 'Open the patient chart from your assignment: handoff report, notes, assessment, vital signs, results, MAR, orders and history.']];
  return table(w, rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, w[0], { fill: SOFT, run: { bold: true, size: 18 } }), cell(v, w[1], { run: { size: 19 } })] })));
}

/* ---- an item, as the student sees it on paper ---- */
function itemBlock(it, n) {
  const out = [para([run(`${n}. `, { bold: true, color: TEAL }), run(it.q)], { keepNext: true, spacing: { before: 220, after: 60 } }),
    para([run(TYPE_LABEL[it.type] + (it.cjmm ? ` · ${it.cjmm}` : '') + (it.type === 'text' && it.points ? ` · ${it.points} points` : ''), { italics: true, size: 16, color: MUTED })], { keepNext: true, spacing: { after: 80 } })];
  const opt = (t, mark = BOX) => para([run(mark + '  ', { size: 20 }), run(t, { size: 20 })], { keepLines: true, spacing: { after: 40 }, indent: { left: 360 } });
  switch (it.type) {
    case 'mcq': it.options.forEach((o, i) => out.push(opt(`${String.fromCharCode(65 + i)}. ${o}`, '○'))); break;
    case 'sata': case 'highlight': it.options.forEach(o => out.push(opt(o))); break;
    case 'rank': { const w = [1200, 8880]; out.push(table(w, [headRow(['Order', 'Option'], w), ...it.options.map(o => new TableRow({ cantSplit: true, children: [cell('', w[0]), cell(o, w[1], { run: { size: 19 } })] }))])); break; }
    case 'matrix': { const cw = Math.max(1100, Math.min(1700, Math.floor(4400 / it.cols.length))); const w = [W - cw * it.cols.length, ...it.cols.map(() => cw)];
      out.push(table(w, [headRow(['', ...it.cols], w), ...it.rows.map(r => new TableRow({ cantSplit: true, children: [cell(r, w[0], { run: { size: 18 } }), ...it.cols.map((_, i) => cell(BOX, w[i + 1], { align: AlignmentType.CENTER, v: VerticalAlign.CENTER }))] }))])); break; }
    case 'cloze': out.push(para([run(fillCloze(it, (b, i) => ` [${i + 1}: ${b.options.join(' / ')}] `), { size: 20 })], { spacing: { after: 80 }, indent: { left: 360 } }));
      out.push(para([run('My choices: ' + it.blanks.map((_, i) => `${i + 1} ________`).join('   '), { size: 19, color: MUTED })], { indent: { left: 360 } })); break;
    case 'bowtie': { const w = [3360, 3360, 3360];
      out.push(table(w, [headRow(['Actions to take (choose ' + (it.pick?.a || 2) + ')', 'Condition most likely (choose 1)', 'Parameters to monitor (choose ' + (it.pick?.m || 2) + ')'], w),
        new TableRow({ children: [cell(it.actions.map(o => para([run(BOX + '  ' + o, { size: 18 })], { spacing: { after: 40 } })), w[0]), cell(it.conditions.map(o => para([run('○  ' + o, { size: 18 })], { spacing: { after: 40 } })), w[1], { fill: 'FFF4E5' }), cell(it.monitors.map(o => para([run(BOX + '  ' + o, { size: 18 })], { spacing: { after: 40 } })), w[2])] })])); break; }
    case 'text': out.push(textBox(Math.max(1600, (it.rows || 6) * 260))); return out;
  }
  out.push(spacer()); out.push(textBox(700, 'My reasoning: which cues from the chart support my answer?'));
  return out;
}
/* ---- the key for an item ---- */
function keyText(it) {
  switch (it.type) {
    case 'mcq': return [`${String.fromCharCode(65 + it.key)}. ${it.options[it.key]}`];
    case 'sata': case 'highlight': return it.key.map(i => '✓ ' + it.options[i]);
    case 'rank': return it.key.map((i, p) => `${p + 1}. ${it.options[i]}`);
    case 'matrix': return it.rows.map((r, i) => `${r}: ${it.cols[it.key[i]]}`);
    case 'cloze': return [fillCloze(it, (b) => `[${b.options[b.key]}]`)];
    case 'bowtie': return [`Condition: ${it.conditions[it.key.c]}`, `Actions: ${it.key.a.map(i => it.actions[i]).join('; ')}`, `Monitor: ${it.key.m.map(i => it.monitors[i]).join('; ')}`];
    case 'text': return [it.model];
  }
  return [];
}
const SCORING = { mcq: '1 point.', sata: '+/- scoring: +1 for each correct choice, -1 for each incorrect choice, minimum 0.', highlight: '+/- scoring: +1 for each correct finding, -1 for each incorrect one, minimum 0.', rank: '1 point for each option in its correct position.', matrix: '1 point for each correct row.', cloze: '1 point for each correct blank.', bowtie: '1 point for the condition and 1 for each correct action and parameter.', text: 'Graded by faculty using the guidance below.' };
const maxPts = (it) => ({ mcq: 1, sata: it.key?.length, highlight: it.key?.length, rank: it.options?.length, matrix: it.rows?.length, cloze: it.blanks?.length, bowtie: 1 + (it.key?.a || []).length + (it.key?.m || []).length, text: it.points || 0 })[it.type];
function keyBlock(it, n) {
  const out = [para([run(`${n}. `, { bold: true, color: TEAL }), run(it.q)], { keepNext: true, spacing: { before: 240, after: 60 } }),
    para([run(`${TYPE_LABEL[it.type]} · ${it.cjmm || ''} · ${maxPts(it)} point${maxPts(it) === 1 ? '' : 's'}`, { italics: true, size: 16, color: MUTED })], { keepNext: true, spacing: { after: 60 } })];
  const lines = keyText(it);
  out.push(table([W], [new TableRow({ cantSplit: true, children: [cell([para([run(it.type === 'text' ? 'Model answer' : 'Correct answer', { bold: true, size: 17, color: KEYINK })]), ...lines.map(l => para([run(l, { size: 19 })], { spacing: { after: 40 } }))], W, { fill: KEYBG })] })]));
  if (it.rationale) out.push(para([run(it.type === 'text' ? 'Grading guidance: ' : 'Rationale: ', { bold: true, size: 19 }), run(it.rationale, { size: 19 })], { spacing: { before: 80, after: 40 } }));
  out.push(para([run('Scoring: ' + SCORING[it.type], { size: 16, color: MUTED, italics: true })]));
  return out;
}

function build(c, key) {
  const header = new Header({ children: [para([run('BedsideLab · Nursing Clinical Judgment Practicum', { size: 16, color: MUTED }), run('\t' + (key ? 'FACULTY ANSWER KEY: do not distribute' : c.group), { size: 16, color: key ? 'B42318' : MUTED, bold: key })], { tabStops: [{ type: TabStopType.RIGHT, position: W }] })] });
  const footer = new Footer({ children: [para([run('Fictional patient for education only. Verify clinical content against current guidelines and local policy.', { size: 14, color: MUTED }), run('\tPage ', { size: 14, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), run(' of ', { size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })], { tabStops: [{ type: TabStopType.RIGHT, position: W }] })] });
  const kids = [];
  kids.push(h1(c.title));
  kids.push(para([run(`${c.level} · ${c.group}${c.teamwork ? ' · Group activity' : ''}${key ? ' · Answer key' : ''}`, { color: MUTED, size: 19 })], { spacing: { after: 80 } }));
  kids.push(para([run('Clinical judgment steps: ', { bold: true }), run((c.cjmm || []).join(' · '))], { spacing: { after: 80 } }));
  kids.push(para([run('Tags: ', { bold: true, size: 18 }), run((c.tags || []).join(', '), { size: 18, color: MUTED })], { spacing: { after: 160 } }));
  const imgFile = path.join(__dirname, 'case-png', c.id + '.png');
  if (!key && fs.existsSync(imgFile)) kids.push(new Paragraph({ spacing: { after: 160 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(imgFile), transformation: { width: 72, height: 72 }, altText: { title: c.title, description: 'Illustration for ' + c.title, name: c.id } })] }));
  const items = c.items;
  if (!key) {
    kids.push(infoTable());
    kids.push(h2('Student instructions'));
    ['Open this activity in BedsideLab and click "Open patient chart". Keep the assignment page open in your first tab.',
     'Start with the handoff report (you can click Listen to hear it), then review the chart the way you would at the start of a shift: allergies and code status, notes, nursing assessment, vital signs, results, MAR and orders.',
     'Answer each item in the chart\'s Activity tab and save. Objective items are scored automatically; open responses are graded by your instructor.',
     'Use this document to record your cues, your answers and your reasoning, and to write your open responses and reflection in full.',
     'Save this document with your name in the file name, upload it on the assignment page and click Submit.'].forEach(t => kids.push(bullet(t, 'steps')));
    kids.push(h2('The case'));
    if (c.scenario) kids.push(para(c.scenario, { spacing: { after: 120 } }));
    kids.push(para(c.description, { spacing: { after: 160 } }));
    kids.push(snapshot(c));
    kids.push(h2('Recognize cues: before you answer'));
    kids.push(para([run('List the cues you notice in the chart and handoff, and why each matters. Mark the ones that need action today.', { size: 19, color: MUTED })], { spacing: { after: 80 } }));
    { const w = [3900, 4580, 1600]; kids.push(table(w, [headRow(['Cue (where in the chart)', 'Why it matters', 'Act today?'], w), ...Array.from({ length: 6 }, () => new TableRow({ height: { value: 420, rule: 'atLeast' }, children: w.map(x => cell('', x)) }))])); }
    kids.push(h2('Clinical judgment items'));
    items.forEach((it, i) => kids.push(...itemBlock(it, i + 1)));
    kids.push(h2('Reflection'));
    [`Which cue in this case did you almost miss, and what will help you notice it next time?`, `Choose one action you took in this case. How would you evaluate whether it worked: what would improvement, no change or decline look like?`].forEach((q, i) => {
      kids.push(para([run(`${items.length + i + 1}. `, { bold: true, color: TEAL }), run(q)], { keepNext: true, spacing: { before: 200, after: 100 } })); kids.push(textBox(1300)); });
    kids.push(h2('Submit your work'));
    kids.push(para(c.teamwork ? 'Save this document with your team\'s answers and have one member upload it to the assignment in BedsideLab before the due date. The submission and the answers saved in the chart are shared with every member of the team.' : 'Save this document and upload it to the assignment in BedsideLab before the due date. The answers you saved in the chart\'s Activity tab are submitted with it automatically.'));
    kids.push(h2('Learning objectives'));
    (c.objectives || []).forEach(t => kids.push(bullet(t)));
  } else {
    kids.push(para([run('For faculty use. ', { bold: true }), run('Objective items are scored automatically in BedsideLab when students save their answers: select-all-that-apply and highlight items use +/- scoring (a wrong choice cancels a right one, never below zero), prioritization items earn 1 point for each option in the correct position, matrix and drop-down items earn 1 point per row or blank, and bow-tie items earn 1 point per correct pick. Open responses are graded by faculty with the model answers and guidance below. Review rationales with students after grading; they also appear to students in the chart once the work is graded (or immediately in practice mode).', { size: 19 })], { spacing: { after: 160 } }));
    kids.push(h2('Case at a glance'));
    kids.push(para(c.description, { spacing: { after: 100 } }));
    kids.push(snapshot(c));
    { const pts = items.reduce((a, it) => a + (maxPts(it) || 0), 0); const auto = items.filter(it => it.type !== 'text').reduce((a, it) => a + maxPts(it), 0);
      kids.push(para([run(`${items.length} items · ${auto} auto-scored points and ${pts - auto} open-response points (${pts} total). BedsideLab suggests a score out of the activity's points (default 100) in the same proportion.`, { size: 18, color: MUTED })], { spacing: { before: 100 } })); }
    kids.push(h2('Answers, rationales and scoring'));
    items.forEach((it, i) => kids.push(...keyBlock(it, i + 1)));
    kids.push(h2('Reflection prompts'));
    kids.push(para('The two reflection questions at the end of the student document are open. Look for a specific cue from the chart, an honest account of the student\'s noticing, and concrete, measurable evaluation criteria (improve, no change, decline) linked to the action chosen.', { size: 19 }));
    kids.push(h2('Learning objectives'));
    (c.objectives || []).forEach(t => kids.push(bullet(t)));
  }
  return new Document({
    creator: 'BedsideLab', title: c.title + (key ? ' (answer key)' : ''),
    styles: { default: { document: { run: { font: 'Arial', size: 21, color: INK } } },
      paragraphStyles: [{ id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', bold: true, size: 34, color: INK }, paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', bold: true, size: 25, color: TEAL }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } }] },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080, header: 500, footer: 500 } } }, headers: { default: header }, footers: { default: footer }, children: kids }],
  });
}

(async () => {
  const files = [];
  for (const c of cases) {
    const base = fileName(c.title);
    for (const key of [false, true]) {
      const name = base + (key ? '_ANSWER_KEY' : '') + '.docx';
      fs.writeFileSync(path.join(OUT, name), await Packer.toBuffer(build(c, key)));
      files.push({ id: (key ? 'K-' : 'S-') + c.id, file: name, name, kind: key ? 'key' : 'activity' });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'doc-files.json'), JSON.stringify(files, null, 1));
  console.log(files.length, 'documents written to seed/docs');
})();
