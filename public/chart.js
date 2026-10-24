'use strict';
/* BedsideLab chart workstation: the window students open from an activity. An EHR laid out like a hospital
   system: a patient storyboard on the left, chart activities, and a work area. The Activity tab holds the
   case's clinical judgment items; answers are saved to the assignment and scored on the server. */
S.ch = { act: 'summary', charts: {}, ans: null, ansFor: null, dirty: false, saving: false, prac: null, showKey: false, note: 0, labView: 'flow', speaking: null };

const CH_ACTS = [['summary', 'Summary', '☰'], ['handoff', 'Handoff report', '🔊'], ['notes', 'Notes', '✎'], ['assess', 'Assessment', '✚'], ['vitals', 'Vital signs', '♥'],
  ['labs', 'Results', '⚗'], ['mar', 'MAR', '℞'], ['orders', 'Orders', '☑'], ['history', 'History', '▤'], ['io', 'Intake & output', '◫'], ['scales', 'Scales & imaging', '◔'],
  ['docs', 'Documents', '▦'], ['activity', 'Activity', '✓'], ['reference', 'Reference', '📖']];
const CH_HINT = { summary: 'The patient at a glance: reason for care, alerts, latest vital signs and abnormal results.', handoff: 'The report you receive at the start of your shift. Read it, or click Listen to hear it.',
  notes: 'Provider and nursing notes, newest first.', assess: 'Nursing assessment flowsheet by time.', vitals: 'Vital signs by time. Values outside the usual adult range are flagged.',
  labs: 'Laboratory results by panel. H = high, L = low, C = critical.', mar: 'Medication administration record: scheduled, PRN and given doses.', orders: 'Active and recent provider orders.',
  history: 'Problems, medical, surgical, family and social history, home medications and allergies.', io: 'Fluid intake and output by period.', scales: 'Assessment scales and imaging reports.',
  docs: 'Other documents attached to the chart.', activity: 'The clinical judgment items for this case. Your answers are saved to your assignment.', reference: '' };

/* ---------- chart data ---------- */
function chartOf(id) {
  const c = S.ch.charts[id];
  if (c === undefined) { S.ch.charts[id] = null; api('GET', '/api/patients/' + encodeURIComponent(id)).then(r => { S.ch.charts[id] = r; scheduleRender(); }).catch(e => { S.ch.charts[id] = { error: e.message }; scheduleRender(); }); }
  return S.ch.charts[id];
}
const fmtC = (c) => { const n = +c; return Number.isFinite(n) ? `${n.toFixed(1)} °C <span class="ew-unit">(${(n * 9 / 5 + 32).toFixed(1)} °F)</span>` : esc(c ?? ''); };
const initials = (n) => String(n || '?').split(/\s+/).map(w => w[0]).filter(c => /[A-Za-z]/.test(c)).slice(0, 2).join('').toUpperCase() || '?';
const chTime = (t) => esc(String(t || '').replace('T', ' '));
const nl = (t) => esc(t).replace(/\n/g, '<br>');
/* simple adult flags (pediatric and obstetric charts carry their own flag field when needed) */
function vFlag(k, v, ch) {
  if (v == null || v === '') return '';
  const ag = ch?.age; const n = parseFloat(ag); const kid = ag != null && ((typeof ag === 'string' && /day|wk|week|mo|month/i.test(ag)) || (Number.isFinite(n) && n < 13)); if (kid) return '';
  if (k === 'hr') return +v > 100 ? 'H' : +v < 60 ? 'L' : '';
  if (k === 'rr') return +v > 20 ? 'H' : +v < 12 ? 'L' : '';
  if (k === 'spo2') return +v < 92 ? 'L' : '';
  if (k === 'temp') return +v >= 38 ? 'H' : +v < 36 ? 'L' : '';
  if (k === 'bp') { const [s, d] = String(v).split('/').map(Number); return s >= 160 || d >= 100 ? 'H' : s < 90 ? 'L' : ''; }
  if (k === 'pain') return +v >= 7 ? 'H' : '';
  return '';
}
const flagCls = (f) => f === 'H' || f === 'C' || f === 'HH' ? 'ew-hi' : f === 'L' || f === 'LL' ? 'ew-lo' : '';

/* ---------- context (which activity the window is for) ---------- */
function chContext() {
  let aid = S.ehrAid;
  if (!aid && role() === 'student') { const m = Object.entries(S.assignments).filter(([, x]) => x.patient === S.ehrOnly && (x.items || []).length); if (m.length === 1) aid = m[0][0]; }
  const a = aid && S.assignments[aid]; return a && a.patient === S.ehrOnly ? { aid, a: { id: aid, ...a } } : null;
}
function chMode() { const c = chContext(); if (role() === 'student' && c) { const g = grade(S.me.id, c.aid); return g && !(S.program && !passed(g)) ? 'graded' : 'save'; } return 'practice'; }
function chPracticeList() { const src = role() === 'student' ? S.assignments : S.library; return Object.entries(src).filter(([, x]) => x.patient === S.ehrOnly && (x.items || []).length).map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.title).localeCompare(b.title)); }
function chActivity() { const c = chContext(); if (c) return c.a; const list = chPracticeList(); if (!list.length) return null; if (!list.some(x => x.id === S.ch.prac)) S.ch.prac = list[0].id; return list.find(x => x.id === S.ch.prac); }
function chAns() {
  const a = chActivity(); const key = S.ehrOnly + '|' + (a?.id || '');
  if (S.ch.ansFor !== key) {
    const c = chContext(); const saved = c && S.answers?.[S.me.id]?.[c.aid];
    S.ch.ans = { answers: Object.fromEntries(Object.entries(saved?.answers || {}).map(([n, x]) => [n, x.value])), comments: saved?.comments || '', savedAt: saved?.savedAt || null, auto: saved?.auto || null, reveal: saved?.reveal || null, byName: saved?.byName, by: saved?.by, local: {} };
    S.ch.ansFor = key; S.ch.dirty = false; S.ch.local = {};
  }
  return S.ch.ans;
}
/* the full item (with key and rationale) when this user may see it: staff always, students when revealed */
function chKeyOf(a, it) {
  if (['admin', 'faculty'].includes(role())) { const src = S.assignments[a.id] || S.library[a.id]; return (src?.items || []).find(x => x.n === it.n) || null; }
  const r = chAns().reveal?.[it.n]; if (!r) return null;
  const k = { ...it, key: r.key, rationale: r.rationale, model: r.model }; if (r.blanks) k.blanks = it.blanks.map((b, i) => ({ ...b, key: r.blanks[i] })); return k;
}

/* ---------- storyboard ---------- */
function chStory(id, ch) {
  const m = S.patients[id] || {}; const mode = chMode(); const a = chActivity(); const ans = chAns();
  const n = a ? (a.items || []).filter(it => ans.answers[it.n] !== undefined && ans.answers[it.n] !== '').length : 0;
  const al = (ch.allergies || []); const v = (ch.vitals || [])[ch.vitals?.length - 1];
  return `<aside class="ew-story" aria-label="Patient storyboard">
    <div class="ew-sb-id"><span class="ew-photo">${esc(initials(ch.name))}</span><div><b class="ew-sb-name">${esc(ch.name)}</b><span>${esc([ch.age != null ? ch.age + (/mo|day|wk/.test(String(ch.age)) ? '' : ' y') : '', ch.sex].filter(Boolean).join(' · '))}</span><span>MRN ${esc(ch.mrn || id)}</span>${ch.dob ? `<span>DOB ${esc(ch.dob)}</span>` : ''}</div></div>
    <div class="ew-sb-alert ${al.length ? 'on' : ''}"><b>Allergies:</b> ${al.length ? al.map(x => esc(x.agent) + (x.reaction ? ` <span class="small">(${esc(x.reaction)})</span>` : '')).join(', ') : 'No known allergies'}</div>
    ${ch.code ? `<div class="ew-sb-alert ${/dnr|dni|comfort|limited/i.test(ch.code) ? 'on' : ''}"><b>Code status:</b> ${esc(ch.code)}</div>` : ''}
    ${ch.isolation && !/^standard/i.test(ch.isolation) ? `<div class="ew-sb-alert on"><b>Isolation:</b> ${esc(ch.isolation)}</div>` : ''}
    ${(ch.alerts || []).map(x => `<div class="ew-sb-alert on">${esc(x)}</div>`).join('')}
    <div class="ew-sb-grp"><h4>Encounter</h4>
      ${[['Setting', ch.setting], ['Location', ch.unit], ['Admitted', ch.admitted], ['Provider', ch.attending], ['Reason', ch.reason]].filter(x => x[1]).map(([k, x]) => `<div class="ew-sb-row"><span>${k}</span><b title="${esc(x)}">${esc(String(x).length > 80 ? String(x).slice(0, 78).replace(/\s+\S*$/, '') + '…' : x)}</b></div>`).join('')}</div>
    <div class="ew-sb-grp"><h4>Patient</h4>
      ${[['Language', ch.language + (ch.interpreter ? ' · interpreter' : '')], ['Height', ch.height], ['Weight', ch.weight], ['Religion', ch.religion], ['Insurance', ch.insurance]].filter(x => x[1] && !/^undefined/.test(x[1])).map(([k, x]) => `<div class="ew-sb-row"><span>${k}</span><b>${esc(x)}</b></div>`).join('')}</div>
    ${v ? `<div class="ew-sb-grp"><h4>Latest vitals <span class="ch-sbt">${chTime(v.time)}</span></h4>${[['T', v.temp != null ? (+v.temp).toFixed(1) + ' °C' : ''], ['HR', v.hr], ['RR', v.rr], ['BP', v.bp], ['SpO₂', v.spo2 != null ? v.spo2 + '%' + (v.o2 ? ' ' + v.o2 : '') : ''], ['Pain', v.pain]].filter(x => x[1] != null && x[1] !== '').map(([k, x]) => `<div class="ew-sb-row"><span>${k}</span><b>${esc(x)}</b></div>`).join('')}</div>` : ''}
    <div class="ew-sb-grp"><h4>Activity</h4><p class="ew-sb-p">${!a ? 'No activity uses this chart.' : mode === 'practice' ? 'Practice mode (answers are not saved)' : mode === 'graded' ? 'Graded: read-only' : n ? `${n} of ${(a.items || []).length} items answered` : 'Not started'}</p>${a ? '<button class="ew-btn sm" data-act="ew-act" data-v="activity">Open Activity</button>' : ''}</div></aside>`;
}

/* ---------- chart activities ---------- */
const kv = (pairs) => `<dl class="ew-kv wide">${pairs.filter(p => p[1] != null && p[1] !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
const card = (title, body, right = '') => `<section class="ew-card wide"><header><span>${esc(title)}</span><span>${right}</span></header>${body}</section>`;
const grid = (head, rows, cls = '') => `<div class="ew-grid-wrap"><table class="ew-grid ${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="ew-none">None recorded.</td></tr>`}</tbody></table></div>`;

function chSummary(ch) {
  const v = (ch.vitals || [])[ch.vitals?.length - 1];
  const abn = (ch.labs || []).flatMap(p => (p.results || []).filter(r => r.flag).map(r => ({ ...r, time: p.time, panel: p.panel })));
  const active = (ch.orders || []).filter(o => !/discontinued|completed/i.test(o.status || ''));
  const due = (ch.mar || []).flatMap(m => (m.given || []).filter(g => /due|overdue/i.test(g.status)).map(g => ({ ...g, med: m.med, dose: m.dose, route: m.route })));
  return `<div class="ew-sum">
    ${card('Reason for care', `<div class="ch-p">${nl(ch.reason || '')}</div>${ch.summary ? `<div class="ch-p">${nl(ch.summary)}</div>` : ''}`, esc(ch.setting || ''))}
    ${card('Active problems', grid(['Problem', 'Since', 'Status'], (ch.problems || []).map(p => `<tr><td>${esc(p.problem)}</td><td>${esc(p.onset || '')}</td><td>${esc(p.status || '')}</td></tr>`)))}
    ${v ? card('Latest vital signs', kv([['Time', chTime(v.time)], ['Temperature', v.temp != null ? fmtC(v.temp) : ''], ['Heart rate', v.hr != null ? `<span class="${flagCls(vFlag('hr', v.hr, ch))}">${esc(v.hr)} /min</span>` : ''], ['Respirations', v.rr != null ? `<span class="${flagCls(vFlag('rr', v.rr, ch))}">${esc(v.rr)} /min</span>` : ''],
      ['Blood pressure', v.bp ? `<span class="${flagCls(vFlag('bp', v.bp, ch))}">${esc(v.bp)} mm Hg</span>` : ''], ['SpO₂', v.spo2 != null ? `<span class="${flagCls(vFlag('spo2', v.spo2, ch))}">${esc(v.spo2)}%</span> ${esc(v.o2 || '')}` : ''], ['Pain', v.pain != null ? esc(v.pain) + (/^\d+$/.test(String(v.pain)) ? ' / 10' : '') : ''], ...(v.other ? [['Other', esc(v.other)]] : [])])) : ''}
    ${card('Abnormal results', grid(['Test', 'Result', 'Range', 'Collected'], abn.slice(-14).map(r => `<tr><td>${esc(r.test)}</td><td class="${flagCls(r.flag)}">${esc(r.value)} ${esc(r.unit || '')} ${r.flag ? `(${esc(r.flag)})` : ''}</td><td class="ew-ref">${esc(r.range || '')}</td><td>${chTime(r.time)}</td></tr>`)), abn.length ? abn.length + ' flagged' : '')}
    ${card('Active orders', grid(['Order', 'Ordered'], active.slice(0, 12).map(o => `<tr><td>${esc(o.order)}</td><td>${chTime(o.time)}</td></tr>`)), active.length ? `<button class="ew-link" data-act="ew-act" data-v="orders" style="color:#fff">All ${active.length}</button>` : '')}
    ${due.length ? card('Medications due', grid(['Medication', 'Due'], due.map(g => `<tr><td>${esc(g.med)} ${esc(g.dose || '')} ${esc(g.route || '')}</td><td>${chTime(g.time)}</td></tr>`))) : ''}
  </div>`;
}
function chHandoff(ch) {
  const list = ch.narratives || []; if (!list.length) return '<p class="ew-none pad">No handoff report in this chart.</p>';
  const can = 'speechSynthesis' in window;
  return list.map((n, i) => `<section class="ew-card wide ch-hand"><header><span>${esc(n.title || 'Handoff report')}</span><span>${esc([n.speaker, n.time].filter(Boolean).join(' · '))}</span></header>
    <div class="ch-hand-bar">${can ? `<button class="ew-btn sm ${S.ch.speaking === i ? 'primary' : ''}" data-act="ch-speak" data-v="${i}">${S.ch.speaking === i ? '■ Stop' : '🔊 Listen'}</button><span class="ew-hint">Read aloud by your browser's voice.</span>` : '<span class="ew-hint">Your browser cannot read text aloud; read the report below.</span>'}</div>
    <div class="ch-narr">${String(n.text || '').split(/\n\n+/).map(p => `<p>${nl(p)}</p>`).join('')}</div></section>`).join('');
}
function chNotes(ch) {
  const notes = [...(ch.notes || [])].map((x, i) => ({ ...x, i })).sort((a, b) => timeKey(b.time).localeCompare(timeKey(a.time)));
  if (!notes.length) return '<p class="ew-none pad">No notes.</p>';
  const cur = notes.find(x => x.i === S.ch.note) || notes[0];
  return `<div class="ew-notes"><div class="ew-nlist">${notes.map(x => `<button data-act="ch-note" data-v="${x.i}" aria-current="${x === cur}"><b>${esc(x.type || 'Note')}</b><span>${chTime(x.time)}</span><span>${esc(x.author || '')}${x.role ? ', ' + esc(x.role) : ''}</span></button>`).join('')}</div>
    <div class="ew-nview"><article class="ew-doc"><header><div><h3>${esc(cur.type || 'Note')}</h3><p>${esc(cur.author || '')}${cur.role ? ', ' + esc(cur.role) : ''} · ${chTime(cur.time)}</p></div><div class="ew-doc-meta"><span class="ew-stamp ok">Signed</span></div></header><div class="ch-note">${String(cur.text || '').split(/\n\n+/).map(p => `<p>${nl(p)}</p>`).join('')}</div></article></div></div>`;
}
function chAssess(ch) {
  const a = ch.assessment || []; if (!a.length) return '<p class="ew-none pad">No nursing assessment documented.</p>';
  return a.map(x => card(`Nursing assessment · ${String(x.time || '').replace('T', ' ')}`, grid(['System', 'Findings'], (x.entries || []).map(e => `<tr><th scope="row" style="width:170px">${esc(e.system)}</th><td>${nl(e.finding)}</td></tr>`), 'ew-flow'), esc(x.by || ''))).join('');
}
function spark(vals) {
  const p = vals.map(Number).filter(Number.isFinite); if (p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), w = 90, h = 22, sx = w / (p.length - 1), sy = hi === lo ? 0 : (h - 4) / (hi - lo);
  return `<svg class="ch-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${p.map((v, i) => `${(i * sx).toFixed(1)},${(h - 2 - (v - lo) * sy).toFixed(1)}`).join(' ')}"/></svg>`;
}
function chVitals(ch) {
  const v = ch.vitals || []; if (!v.length) return '<p class="ew-none pad">No vital signs recorded.</p>';
  const rows = [['temp', 'Temperature °C', x => x.temp != null ? fmtC(x.temp) : ''], ['hr', 'Heart rate /min', x => x.hr], ['rr', 'Respirations /min', x => x.rr], ['bp', 'Blood pressure mm Hg', x => x.bp], ['map', 'MAP mm Hg', x => { if (!x.bp) return ''; const [s, d] = String(x.bp).split('/').map(Number); return s && d ? Math.round((s + 2 * d) / 3) : ''; }],
    ['spo2', 'SpO₂ %', x => x.spo2], ['o2', 'Oxygen', x => x.o2], ['pain', 'Pain (0-10)', x => x.pain], ['other', 'Other', x => x.other]].filter(([k, , f]) => v.some(x => { const y = f(x); return y != null && y !== ''; }));
  const trend = { temp: v.map(x => x.temp), hr: v.map(x => x.hr), rr: v.map(x => x.rr), bp: v.map(x => String(x.bp || '').split('/')[0]), spo2: v.map(x => x.spo2) };
  return `<div class="ew-grid-wrap"><table class="ew-grid ew-flow"><thead><tr><th>Parameter</th><th>Trend</th>${v.map(x => `<th class="num">${chTime(x.time)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(([k, l, f]) => `<tr><th scope="row">${esc(l)}</th><td>${trend[k] ? spark(trend[k]) : ''}</td>${v.map(x => { const y = f(x); const fl = vFlag(k, k === 'temp' ? x.temp : y, ch); return `<td class="num ${flagCls(fl)}">${k === 'temp' ? (x.temp != null ? (+x.temp).toFixed(1) : '') : esc(y ?? '')}${fl ? ' ' + fl : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>${v.some(x => x.by || x.note) ? `<h3 class="ew-h3">Comments</h3>${grid(['Time', 'Comment'], v.filter(x => x.note).map(x => `<tr><td class="num">${chTime(x.time)}</td><td>${esc(x.note)}</td></tr>`))}` : ''}`;
}
function chLabs(ch) {
  const L = ch.labs || []; if (!L.length) return '<p class="ew-none pad">No results.</p>';
  const panels = [...new Set(L.map(p => p.panel))];
  return panels.map(pn => { const sets = L.filter(p => p.panel === pn).sort((a, b) => timeKey(a.time).localeCompare(timeKey(b.time))); const tests = [...new Set(sets.flatMap(p => (p.results || []).map(r => r.test)))];
    const info = (t) => sets.flatMap(p => p.results || []).find(r => r.test === t) || {};
    return card(pn, `<div class="ew-grid-wrap" style="border:0"><table class="ew-grid ew-flow"><thead><tr><th>Test</th>${sets.map(p => `<th class="num">${chTime(p.time)}</th>`).join('')}<th>Reference range</th></tr></thead><tbody>
      ${tests.map(t => `<tr><th scope="row">${esc(t)} <span class="ew-unit">${esc(info(t).unit || '')}</span></th>${sets.map(p => { const r = (p.results || []).find(x => x.test === t); return `<td class="num ${r ? flagCls(r.flag) : ''}">${r ? esc(r.value) + (r.flag ? ' ' + esc(r.flag) : '') : ''}</td>`; }).join('')}<td class="ew-ref">${esc(info(t).range || '')}</td></tr>`).join('')}
      </tbody></table></div>${sets.some(p => p.comment) ? `<p class="ew-hint pad">${sets.filter(p => p.comment).map(p => chTime(p.time) + ': ' + esc(p.comment)).join('<br>')}</p>` : ''}`, `${sets.length} collection${sets.length > 1 ? 's' : ''}`); }).join('');
}
function chMar(ch) {
  const M = ch.mar || []; if (!M.length) return '<p class="ew-none pad">No medications on the MAR.</p>';
  const st = (s) => /given/i.test(s) ? 'green' : /held|refused|missed/i.test(s) ? 'red' : /due|overdue/i.test(s) ? 'amber' : '';
  return grid(['Medication', 'Dose · route', 'Frequency', 'Indication', 'Administration'], M.map(m => `<tr><td><b>${esc(m.med)}</b>${m.note ? `<div class="ew-hint">${esc(m.note)}</div>` : ''}</td><td>${esc([m.dose, m.route].filter(Boolean).join(' · '))}</td><td>${esc(m.freq || '')}</td><td>${esc(m.indication || '')}</td>
    <td>${(m.given || []).map(g => `<div class="ch-dose"><span class="num">${chTime(g.time)}</span> <span class="ew-tag ${st(g.status)}">${esc(g.status)}</span>${g.by ? ` <span class="ew-hint">${esc(g.by)}</span>` : ''}${g.note ? ` <span class="ew-hint">· ${esc(g.note)}</span>` : ''}</div>`).join('') || '<span class="ew-hint">Not given this encounter</span>'}</td></tr>`));
}
function chOrders(ch) {
  const O = [...(ch.orders || [])].sort((a, b) => timeKey(b.time).localeCompare(timeKey(a.time)));
  return grid(['Ordered', 'Order', 'Provider', 'Status'], O.map(o => `<tr><td class="num">${chTime(o.time)}</td><td>${esc(o.order)}</td><td>${esc(o.by || '')}</td><td><span class="ew-tag ${/new|stat/i.test(o.status || '') ? 'amber' : /discontinued/i.test(o.status || '') ? 'red' : /completed/i.test(o.status || '') ? '' : 'green'}">${esc(o.status || 'Active')}</span></td></tr>`));
}
function chHistory(ch) {
  const h = ch.history || {}; const list = (a) => (a || []).length ? `<ul class="ch-ul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="ew-none">None recorded.</p>';
  return `<div class="ew-sum">
    ${card('Medical history', list(h.medical))}${card('Surgical history', list(h.surgical))}
    ${h.obstetric ? card('Obstetric history', `<div class="ch-p">${nl(h.obstetric)}</div>`) : ''}${h.developmental ? card('Growth and development', `<div class="ch-p">${nl(h.developmental)}</div>`) : ''}
    ${card('Family history', list(h.family))}${card('Social history', list(h.social))}
    ${(ch.contacts || []).length ? card('Contacts and support', grid(['Name', 'Relationship', 'Notes'], ch.contacts.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.relation || '')}</td><td>${esc(c.note || c.phone || '')}</td></tr>`))) : ''}
    ${card('Allergies', grid(['Agent', 'Reaction', 'Severity'], (ch.allergies || []).map(a => `<tr><td>${esc(a.agent)}</td><td>${esc(a.reaction || '')}</td><td>${esc(a.severity || '')}</td></tr>`)))}
    ${(h.immunizations || []).length ? card('Immunizations', list(h.immunizations)) : ''}
  </div>
  ${card('Home medications', grid(['Medication', 'Dose · route', 'Frequency', 'Indication', 'Notes'], (ch.homeMeds || []).map(m => `<tr><td><b>${esc(m.med)}</b></td><td>${esc([m.dose, m.route].filter(Boolean).join(' · '))}</td><td>${esc(m.freq || '')}</td><td>${esc(m.indication || '')}</td><td>${esc(m.note || '')}</td></tr>`)))}`;
}
function chIO(ch) {
  const R = ch.io || []; if (!R.length) return '<p class="ew-none pad">No intake and output recorded.</p>';
  const n = (x) => +x || 0; const tot = R.reduce((a, r) => ({ i: a.i + n(r.oral) + n(r.iv) + n(r.tube) + n(r.blood), o: a.o + n(r.urine) + n(r.drain) + n(r.emesis) + n(r.stool) }), { i: 0, o: 0 });
  const cols = [['oral', 'Oral'], ['iv', 'IV'], ['tube', 'Tube feed'], ['blood', 'Blood'], ['urine', 'Urine'], ['drain', 'Drain'], ['emesis', 'Emesis'], ['stool', 'Stool']].filter(([k]) => R.some(r => r[k] != null && r[k] !== ''));
  return grid(['Period', ...cols.map(c => c[1] + ' mL'), 'Intake', 'Output', 'Balance', 'Notes'], R.map(r => { const i = n(r.oral) + n(r.iv) + n(r.tube) + n(r.blood), o = n(r.urine) + n(r.drain) + n(r.emesis) + n(r.stool);
    return `<tr><td>${esc(r.period)}</td>${cols.map(([k]) => `<td class="num">${esc(r[k] ?? '')}</td>`).join('')}<td class="num"><b>${i}</b></td><td class="num"><b>${o}</b></td><td class="num">${i - o > 0 ? '+' : ''}${i - o}</td><td>${esc(r.note || '')}</td></tr>`; }), 'ew-flow')
    + `<p class="ew-hint" style="margin-top:6px">Total for the periods shown: intake ${tot.i} mL, output ${tot.o} mL, balance ${tot.i - tot.o > 0 ? '+' : ''}${tot.i - tot.o} mL.</p>`;
}
function chScales(ch) {
  return `${(ch.scales || []).length ? card('Assessment scales', grid(['Time', 'Tool', 'Score', 'Details'], ch.scales.map(s => `<tr><td class="num">${chTime(s.time)}</td><td><b>${esc(s.tool)}</b></td><td class="num">${esc(s.score)}</td><td>${nl(s.detail || '')}</td></tr>`))) : ''}
    ${(ch.imaging || []).length ? card('Imaging and diagnostics', grid(['Time', 'Study', 'Result'], ch.imaging.map(s => `<tr><td class="num">${chTime(s.time)}</td><td><b>${esc(s.study)}</b></td><td>${nl(s.result || '')}</td></tr>`))) : ''}
    ${!(ch.scales || []).length && !(ch.imaging || []).length ? '<p class="ew-none pad">No scales or imaging.</p>' : ''}`;
}
function chDocs(ch) {
  const D = ch.documents || [], T = ch.tables || [];
  if (!D.length && !T.length) return '<p class="ew-none pad">No other documents.</p>';
  return T.map(t => card(t.title, grid(t.columns.map(esc), t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`)) + (t.note ? `<p class="ew-hint pad">${esc(t.note)}</p>` : ''))).join('')
    + D.map(d => card(d.title, `<div class="ch-note">${String(d.text || '').split(/\n\n+/).map(p => `<p>${nl(p)}</p>`).join('')}</div>`, esc(d.type || ''))).join('');
}

/* ---------- items (the Activity tab) ---------- */
const ITEM_HELP = { mcq: 'Choose one answer.', sata: 'Select all that apply.', rank: 'Put the options in order: the first is the highest priority. Use the arrows, then save.', matrix: 'Choose one column for each row.',
  cloze: 'Choose the option that best completes each blank.', highlight: 'Click each finding that applies. Click again to remove it.', bowtie: 'Complete the bow-tie: the condition in the middle, two actions on the left and two parameters to monitor on the right.', text: 'Write your answer in your own words.' };
function itemInput(it, v, ro) {
  const n = it.n, dis = ro ? 'disabled' : '';
  switch (it.type) {
    case 'mcq': return `<div class="it-opts">${it.options.map((o, i) => `<label class="it-opt"><input type="radio" name="it-${n}" data-it="${n}" data-k="mcq" value="${i}" ${v === i ? 'checked' : ''} ${dis}><span class="it-l">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span></label>`).join('')}</div>`;
    case 'sata': return `<div class="it-opts">${it.options.map((o, i) => `<label class="it-opt"><input type="checkbox" data-it="${n}" data-k="sata" value="${i}" ${(v || []).includes(i) ? 'checked' : ''} ${dis}><span class="it-l">${i + 1}</span><span>${esc(o)}</span></label>`).join('')}</div>`;
    case 'rank': { const ord = Array.isArray(v) ? v : (S.ch.local[n] || it.options.map((_, i) => i));
      return `<ol class="it-rank">${ord.map((oi, pos) => `<li><span class="it-l">${pos + 1}</span><span class="it-rt">${esc(it.options[oi])}</span>${ro ? '' : `<span class="it-mv"><button class="ew-ico" data-act="it-mv" data-v="${n}" data-p="${pos}" data-d="-1" aria-label="Move up" ${pos ? '' : 'disabled'}>▲</button><button class="ew-ico" data-act="it-mv" data-v="${n}" data-p="${pos}" data-d="1" aria-label="Move down" ${pos < ord.length - 1 ? '' : 'disabled'}>▼</button></span>`}</li>`).join('')}</ol>
        ${ro ? '' : Array.isArray(v) ? '<p class="ew-hint">Order recorded. Move an option to change it.</p>' : `<button class="ew-btn sm" data-act="it-keep" data-v="${n}">Use this order</button> <span class="ew-hint">Not answered until you move an option or choose “Use this order”.</span>`}`; }
    case 'matrix': return `<div class="ew-grid-wrap"><table class="ew-grid it-matrix"><thead><tr><th></th>${it.cols.map(c => `<th class="it-c">${esc(c)}</th>`).join('')}</tr></thead><tbody>${it.rows.map((r, ri) => `<tr><th scope="row">${esc(r)}</th>${it.cols.map((c, ci) => `<td class="it-c"><input type="radio" name="it-${n}-${ri}" data-it="${n}" data-k="matrix" data-r="${ri}" value="${ci}" aria-label="${esc(r)}: ${esc(c)}" ${v?.[ri] === ci ? 'checked' : ''} ${dis}></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'cloze': return `<div class="it-cloze">${nl(it.text).replace(/\{(\d+)\}/g, (m, bi) => { const b = it.blanks[+bi]; if (!b) return m; return `<select data-it="${n}" data-k="cloze" data-b="${bi}" ${dis} aria-label="Blank ${+bi + 1}"><option value="">Select…</option>${b.options.map((o, oi) => `<option value="${oi}" ${v?.[+bi] === oi ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; })}</div>`;
    case 'highlight': return `<div class="it-hl">${it.options.map((o, i) => `<button type="button" class="it-hlx" data-act="it-hl" data-v="${n}" data-i="${i}" aria-pressed="${(v || []).includes(i)}" ${dis}>${esc(o)}</button>`).join('')}</div>`;
    case 'bowtie': { const b = v || { c: null, a: [], m: [] }; const pa = it.pick?.a || 2, pm = it.pick?.m || 2;
      const slot = (txt, ph) => `<div class="bt-slot ${txt ? 'on' : ''}">${txt ? esc(txt) : `<span>${ph}</span>`}</div>`;
      const opts = (k, arr, chosen, type) => `<div class="bt-list"><h4>${k === 'a' ? `Actions to take <span>choose ${pa}</span>` : k === 'c' ? 'Condition most likely <span>choose 1</span>' : `Parameters to monitor <span>choose ${pm}</span>`}</h4>${arr.map((o, i) => `<label class="it-opt"><input type="${type}" ${type === 'radio' ? `name="it-${n}-c"` : ''} data-it="${n}" data-k="bowtie" data-b="${k}" value="${i}" ${chosen(i) ? 'checked' : ''} ${dis}><span>${esc(o)}</span></label>`).join('')}</div>`;
      return `<div class="bt"><div class="bt-side">${Array.from({ length: pa }, (_, i) => slot(it.actions[b.a?.[i]], 'Action to take')).join('')}</div><div class="bt-mid">${slot(it.conditions[b.c], 'Condition most likely experiencing')}</div><div class="bt-side">${Array.from({ length: pm }, (_, i) => slot(it.monitors[b.m?.[i]], 'Parameter to monitor')).join('')}</div></div>
        <div class="bt-lists">${opts('a', it.actions, i => (b.a || []).includes(i), 'checkbox')}${opts('c', it.conditions, i => b.c === i, 'radio')}${opts('m', it.monitors, i => (b.m || []).includes(i), 'checkbox')}</div>`; }
    case 'text': return `<textarea id="it-text-${n}" class="ew-in it-text" data-it="${n}" data-k="text" rows="${it.rows || 6}" ${dis} placeholder="Write your answer here">${esc(v || '')}</textarea>`;
  }
  return '';
}
/* the correct answer, in words */
function keyText(it) {
  switch (it.type) {
    case 'mcq': return `${String.fromCharCode(65 + it.key)}. ${esc(it.options[it.key])}`;
    case 'sata': case 'highlight': return `<ul class="ch-ul">${it.key.map(i => `<li>${esc(it.options[i])}</li>`).join('')}</ul>`;
    case 'rank': return `<ol class="ch-ul">${it.key.map(i => `<li>${esc(it.options[i])}</li>`).join('')}</ol>`;
    case 'matrix': return `<ul class="ch-ul">${it.rows.map((r, i) => `<li>${esc(r)}: <b>${esc(it.cols[it.key[i]])}</b></li>`).join('')}</ul>`;
    case 'cloze': return nl(it.text).replace(/\{(\d+)\}/g, (m, i) => `<b class="it-kb">${esc(it.blanks[+i]?.options[it.blanks[+i].key] ?? '')}</b>`);
    case 'bowtie': return `<ul class="ch-ul"><li>Condition: <b>${esc(it.conditions[it.key.c])}</b></li><li>Actions: <b>${it.key.a.map(i => esc(it.actions[i])).join('; ')}</b></li><li>Monitor: <b>${it.key.m.map(i => esc(it.monitors[i])).join('; ')}</b></li></ul>`;
    case 'text': return it.model ? nl(it.model) : '';
  }
  return '';
}
/* what the student answered, in words (grading page) */
function valueText(it, v) {
  if (v === undefined || v === null || v === '') return '<span class="muted">No answer</span>';
  const mark = (ok) => ok ? '<span class="ok-t">✓</span>' : '<span class="flag-H">✗</span>';
  switch (it.type) {
    case 'mcq': return `${String.fromCharCode(65 + v)}. ${esc(it.options[v])} ${it.key != null ? mark(v === it.key) : ''}`;
    case 'sata': case 'highlight': return `<ul class="ch-ul">${v.map(i => `<li>${esc(it.options[i])} ${it.key ? mark(it.key.includes(i)) : ''}</li>`).join('')}</ul>`;
    case 'rank': return `<ol class="ch-ul">${v.map((i, p) => `<li>${esc(it.options[i])} ${it.key ? mark(it.key[p] === i) : ''}</li>`).join('')}</ol>`;
    case 'matrix': return `<ul class="ch-ul">${it.rows.map((r, i) => `<li>${esc(r)}: <b>${v[i] == null ? '—' : esc(it.cols[v[i]])}</b> ${it.key && v[i] != null ? mark(v[i] === it.key[i]) : ''}</li>`).join('')}</ul>`;
    case 'cloze': return nl(it.text).replace(/\{(\d+)\}/g, (m, i) => { const x = v[+i]; const b = it.blanks[+i]; return `<b class="it-kb">${x == null ? '—' : esc(b.options[x])}</b>${b.key != null && x != null ? mark(x === b.key) : ''}`; });
    case 'bowtie': return `<ul class="ch-ul"><li>Condition: <b>${v.c == null ? '—' : esc(it.conditions[v.c])}</b> ${it.key && v.c != null ? mark(v.c === it.key.c) : ''}</li><li>Actions: ${(v.a || []).map(i => `<b>${esc(it.actions[i])}</b> ${it.key ? mark(it.key.a.includes(i)) : ''}`).join('; ') || '—'}</li><li>Monitor: ${(v.m || []).map(i => `<b>${esc(it.monitors[i])}</b> ${it.key ? mark(it.key.m.includes(i)) : ''}`).join('; ') || '—'}</li></ul>`;
    case 'text': return `<div class="answer">${nl(v)}</div>`;
  }
  return '';
}
const resTag = (r) => !r ? '' : r.manual ? (r.empty ? '<span class="ew-tag">No answer</span>' : '<span class="ew-tag">Graded by faculty</span>') : `<span class="ew-tag ${r.ok ? 'green' : r.partial ? 'amber' : 'red'}">${r.empty ? 'No answer' : r.ok ? '✓ ' + esc(r.msg) : esc(r.msg)}</span>`;

function chActivityHTML() {
  const a = chActivity(); const mode = chMode(); const ro = mode === 'graded'; const ans = chAns(); const c = chContext(); const staff = ['admin', 'faculty'].includes(role());
  if (!a) return `<p class="ew-none pad">${role() === 'student' ? 'None of your assignments uses this chart. Open the chart from your assignment page.' : 'No library activity uses this patient chart.'}</p>`;
  const prac = mode === 'practice' && chPracticeList().length > 1 ? `<label class="wb-prac">Activity: <select id="ch-prac" data-act="ch-prac">${chPracticeList().map(x => `<option value="${esc(x.id)}" ${x.id === a.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>` : '';
  const status = mode === 'practice' ? '<span class="ew-tag">Practice mode: answers are not saved. Open the chart from your assignment to save.</span>' : ro ? '<span class="ew-tag">Graded: read-only</span>' : S.ch.saving ? '<span class="ew-tag">Saving…</span>' : S.ch.dirty ? '<span class="ew-tag amber">Unsaved changes</span>' : ans.savedAt ? `<span class="ew-tag green">Saved ${esc(fmtWhen(ans.savedAt))}${ans.byName && ans.by !== S.me.id ? ' by ' + esc(ans.byName) : ''}</span>` : '<span class="ew-tag">Not saved yet</span>';
  const auto = ans.auto || {}; const items = a.items || [];
  const tot = items.reduce((o, it) => { const r = auto[it.n]; if (r && !r.manual) { o.got += r.score || 0; o.max += r.max || 0; } return o; }, { got: 0, max: 0 });
  return `<div class="wb-ans">
    <div class="ew-cod-head"><div><b>${esc(a.title)}</b><span>${items.length} items · ${esc((a.cjmm || []).join(' · ') || 'Clinical judgment')}</span>${c?.a.teamwork && S.me.team ? `<span>Group activity: shared with ${esc(S.me.team)} (${esc((S.team || []).map(x => x.name).join(', '))})</span>` : ''}</div>
      <div class="ew-cod-act">${status}${staff ? `<button class="ew-btn sm" data-act="ch-key">${S.ch.showKey ? 'Hide answers' : 'Show answers'}</button>` : ''}${mode === 'save' ? `<button class="ew-btn primary" data-act="ch-save" ${S.ch.saving ? 'disabled' : ''}>Save answers</button>` : ''}</div></div>${prac}
    ${ans.auto && tot.max ? `<p class="ch-score">Auto-scored items: <b>${tot.got} of ${tot.max} points</b>. Open responses are graded by your instructor.</p>` : ''}
    ${a.scenario ? `<div class="ch-scen">${nl(a.scenario)}</div>` : ''}
    ${items.map(it => { const v = ans.answers[it.n]; const r = auto[it.n]; const k = (staff && S.ch.showKey) || (!staff && (ans.reveal)) ? chKeyOf(a, it) : null;
      return `<section class="wb-q it" id="it-${it.n}"><div class="wb-qh"><span class="wb-qn">${it.n}</span><div class="it-stem"><p>${nl(it.q)}</p><span class="ew-hint">${esc(ITEM_HELP[it.type] || '')}${it.type === 'text' && it.points ? ` · ${it.points} points` : ''}${it.cjmm ? ` · <i>${esc(it.cjmm)}</i>` : ''}</span></div>${r ? resTag(r) : ''}</div>
        ${itemInput(it, v, ro || (staff && S.ch.showKey))}
        ${k ? `<div class="it-key"><b>${it.type === 'text' ? 'Model answer' : 'Correct answer'}</b><div>${keyText(k)}</div>${k.rationale ? `<b>Rationale</b><div>${nl(k.rationale)}</div>` : ''}</div>` : ''}</section>`; }).join('')}
    <h3 class="ew-h3">Comments for your instructor</h3>
    <textarea class="ew-in" id="ch-comments" rows="3" data-chf="comments" ${ro || mode === 'practice' ? 'disabled' : ''} placeholder="Questions about the case, or assumptions you made">${esc(ans.comments || '')}</textarea>
    <p class="ew-hint">${mode === 'save' ? 'Answers save automatically a few seconds after you stop working. Objective items are scored against the key for your instructor; open responses are graded by your instructor.' : ''}${c?.a.showCheck ? ' Your instructor lets you see your score and the rationale for each item after you save.' : ''}</p></div>`;
}

/* ---------- clinical judgment reference (also on its own page) ---------- */
function clinicalReferenceHTML() {
  const sec = (t, body) => `<section class="ref-sec"><h2>${esc(t)}</h2>${body}</section>`;
  const box = (t, body) => `<div class="ref-ex"><b>${esc(t)}</b>${body}</div>`;
  const ul = (a) => `<ul>${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const tb = (h, rows) => `<table class="ref-tb"><thead><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<div class="ref">
  ${sec('The clinical judgment model (NCSBN CJMM)', box('Six steps', ul(['<b>Recognize cues</b>: what matters most in the data? Which findings are relevant, unexpected or abnormal?', '<b>Analyze cues</b>: how do the cues connect? Which conditions are consistent with them?', '<b>Prioritize hypotheses</b>: which problem is most urgent or most likely? Rank by urgency, risk and likelihood.', '<b>Generate solutions</b>: what outcomes are you aiming for, and which interventions reach them? Which actions to avoid?', '<b>Take action</b>: which actions will you do first, delegate, teach or document?', '<b>Evaluate outcomes</b>: did the patient improve, stay the same or decline? What is the next step?'])) + box('Item types you will meet', ul(['Multiple choice, select all that apply (+/- scoring: a wrong choice cancels a right one)', 'Prioritize (rank), matrix, drop-down (cloze), highlight the findings', 'Bow-tie: the condition, two actions and two parameters to monitor', 'Open responses: what you would say, do, teach or report'])))}
  ${sec('Setting priorities', box('Frameworks', ul(['<b>ABCs</b>: airway, breathing, circulation (then disability and exposure in emergencies)', '<b>Maslow</b>: physiological needs, then safety, love and belonging, esteem, self-actualization', '<b>Acute before chronic</b>, <b>actual before potential</b>, <b>unstable before stable</b>, unexpected before expected findings', '<b>Safety</b>: least restrictive, fall and injury prevention, infection control, the right patient and medication', 'A new finding that is expected for the condition (for example, mild incisional pain) is less urgent than an unexpected one (for example, new confusion).'])) + box('Escalation: SBAR', ul(['<b>S</b>ituation: who you are, the patient, the problem now', '<b>B</b>ackground: diagnosis, relevant history, recent treatment', '<b>A</b>ssessment: the data (vital signs, findings, trends) and what you think is happening', '<b>R</b>ecommendation: what you need (come and see the patient, an order, a transfer), and read back the orders'])))}
  ${sec('Therapeutic communication', box('Helpful techniques', ul(['Offering self and active listening ("I will stay with you for a while.")', 'Open-ended questions ("Tell me about…", "What is worrying you most?")', 'Restating and reflecting ("You feel that…")', 'Clarifying, focusing, summarizing, giving information', 'Silence, presence and appropriate touch, at eye level, without hurrying'])) + box('Blocks to avoid', ul(['False reassurance ("Everything will be fine.")', 'Clichés and minimizing ("At least…", "Everything happens for a reason.")', 'Giving advice or approval/disapproval ("You should…")', 'Changing the subject, asking "why", defending, belittling feelings', '"I know exactly how you feel."'])))}
  ${sec('Adult reference ranges (typical)', tb(['Measure', 'Typical adult range'], [['Temperature', '36.1–37.9 °C (97–100.2 °F); fever ≥ 38.0 °C (100.4 °F)'], ['Heart rate', '60–100 /min'], ['Respiratory rate', '12–20 /min'], ['Blood pressure', 'Systolic 90–119 and diastolic < 80 mm Hg (normal); MAP ≥ 65 mm Hg for organ perfusion'], ['SpO₂', '95–100% (88–92% target in some chronic lung disease)'], ['Urine output', '≥ 0.5 mL/kg/h (about 30 mL/h)'], ['Sodium', '135–145 mEq/L'], ['Potassium', '3.5–5.0 mEq/L'], ['Glucose (fasting)', '70–99 mg/dL'], ['BUN / creatinine', '7–20 mg/dL / 0.6–1.2 mg/dL'], ['Hemoglobin', '12–16 g/dL (F), 14–18 g/dL (M)'], ['WBC', '4,500–11,000 /mm³'], ['Platelets', '150,000–400,000 /mm³'], ['INR', '0.8–1.1 (2–3 on warfarin for most indications)'], ['Lactate', '< 2 mmol/L'], ['Arterial pH / PaCO₂ / HCO₃⁻', '7.35–7.45 / 35–45 mm Hg / 22–26 mEq/L']]) + '<p class="small muted">Laboratories differ: use the reference range printed with each result in the chart.</p>')}
  ${sec('Pediatric vital signs (approximate, awake)', tb(['Age', 'Heart rate /min', 'Respirations /min', 'Systolic BP mm Hg'], [['Newborn', '100–160', '30–60', '60–90'], ['Infant (1–12 months)', '100–160', '30–53', '72–104'], ['Toddler (1–2 years)', '98–140', '22–37', '86–106'], ['Preschool (3–5 years)', '80–120', '20–28', '89–112'], ['School age (6–11 years)', '75–118', '18–25', '97–115'], ['Adolescent (12–17 years)', '60–100', '12–20', '110–131']]))}
  ${sec('Handy rules', box('Calculations and rules', ul(['MAP = (systolic + 2 × diastolic) ÷ 3', 'Hypoglycemia, conscious and able to swallow: 15 g fast-acting carbohydrate, recheck in 15 minutes, repeat until ≥ 70 mg/dL, then a snack or meal', 'Fluid balance = total intake − total output', 'Rule of nines and Parkland formula for burns: 4 mL × kg × %TBSA in 24 h (half in the first 8 h)', 'Pediatric maintenance fluids (Holliday-Segar): 100 mL/kg for the first 10 kg, 50 mL/kg for the next 10 kg, 20 mL/kg for each kg above 20 kg, per day'])) + box('Medication safety', ul(['Rights of administration: patient, drug, dose, route, time, documentation, reason, response, and the patient\'s right to refuse', 'Hold and report: for example, digoxin with apical pulse < 60 /min (adult), a beta blocker with symptomatic bradycardia or hypotension, opioids with sedation or slow breathing', 'High-alert medications: insulin, anticoagulants, opioids, concentrated electrolytes, magnesium sulfate: independent double check where policy requires'])))}
  </div>`;
}

/* ---------- workstation shell ---------- */
function chartHTML(id) {
  const ch = chartOf(id);
  if (!ch) return '<div class="panel empty">Loading chart…</div>';
  if (ch.error) return `<div class="panel empty"><b>Chart not available</b><span>${esc(ch.error)}</span></div>`;
  const has = { summary: 1, activity: 1, reference: 1, handoff: (ch.narratives || []).length, notes: (ch.notes || []).length, assess: (ch.assessment || []).length, vitals: (ch.vitals || []).length, labs: (ch.labs || []).length, mar: (ch.mar || []).length, orders: (ch.orders || []).length,
    history: 1, io: (ch.io || []).length, scales: (ch.scales || []).length + (ch.imaging || []).length, docs: (ch.documents || []).length + (ch.tables || []).length };
  const acts = CH_ACTS.filter(([k]) => has[k]);
  if (!acts.some(([k]) => k === S.ch.act)) S.ch.act = 'summary';
  const act = S.ch.act; const title = acts.find(a => a[0] === act)[1];
  const body = { summary: chSummary, handoff: chHandoff, notes: chNotes, assess: chAssess, vitals: chVitals, labs: chLabs, mar: chMar, orders: chOrders, history: chHistory, io: chIO, scales: chScales, docs: chDocs, activity: () => chActivityHTML(), reference: () => clinicalReferenceHTML() }[act](ch);
  const mode = chMode(); const ctx = chContext();
  return `<div class="ew ch">
    <header class="ew-bar"><div class="ew-brand"><span class="ew-logo">${MARK_SVG}</span><b>${esc(S.site.siteName || 'BedsideLab')} EHR</b><span class="ew-env">TRAINING</span></div>
      <nav class="ew-tools" aria-label="Toolbar">${[['summary', 'Summary'], ['handoff', 'Handoff'], ['notes', 'Notes'], ['labs', 'Results'], ['mar', 'MAR'], ['activity', 'Activity'], ['reference', 'Reference']].filter(([k]) => has[k]).map(([k, l]) => `<button data-act="ew-act" data-v="${k}" class="${act === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="ew-right"><button class="ew-btn sm" id="tour-help" data-act="tour">? Help</button><span class="ew-user">${esc(S.me.name)}</span></div></header>
    <div class="ew-ptabs"><span class="ew-ptab on">${esc(ch.name)}<small>${esc(ch.mrn || id)} · ${esc(ch.unit || ch.setting || '')}</small></span>${ctx ? `<span class="ew-ctx">Assignment: <b>${esc(ctx.a.title)}</b></span>` : ''}</div>
    <div class="ew-body">${chStory(id, ch)}
      <nav class="ew-acts" aria-label="Chart activities">${acts.map(([k, l, ic]) => `<button data-act="ew-act" data-v="${k}" aria-current="${act === k}"><span aria-hidden="true">${ic}</span>${l}</button>`).join('')}</nav>
      <main class="ew-main"><div class="ew-acthead"><h2>${esc(title)}</h2><span class="ew-hint">${esc(CH_HINT[act] || '')}</span></div>
        <div class="ew-content ${act === 'notes' ? 'ch-notes-wrap' : ''} ${act === 'reference' ? 'wb-refwrap' : ''}">${body}</div></main></div>
    <footer class="ew-status"><span>${esc(S.me.name)} · ${esc(ROLE_LABEL[role()] || '')}</span><span>${esc(ch.facility || 'BedsideLab Teaching Hospital')}</span><span>Fictional patient for education only</span><span>${mode === 'save' ? 'Answers are saved to your assignment' : mode === 'graded' ? 'Assignment graded' : 'Practice mode'}</span></footer></div>`;
}

/* ---------- events ---------- */
async function chSave(quiet) {
  const c = chContext(); if (!c || chMode() !== 'save') return;
  S.ch.saving = true; render();
  try { const ans = S.ch.ans; const r = await api('PUT', '/api/answers/' + encodeURIComponent(c.aid), { answers: Object.fromEntries(Object.entries(ans.answers).filter(([, v]) => v !== undefined).map(([n, value]) => [n, { value }])), comments: ans.comments || '' });
    (S.answers ||= {})[S.me.id] = { ...(S.answers[S.me.id] || {}), [c.aid]: r.answer }; ans.savedAt = r.answer.savedAt; ans.auto = r.answer.auto || null; ans.reveal = r.answer.reveal || null; S.ch.dirty = false; if (!quiet) toast('Answers saved to your assignment');
  } catch (err) { toast(err.message); }
  S.ch.saving = false; render();
}
let chTimer = null;
function chTouched() { S.ch.dirty = true; clearTimeout(chTimer); if (chMode() === 'save') chTimer = setTimeout(() => { if (!typing()) chSave(true); else chTouched(); }, 3000); }
function chItem(n) { return (chActivity()?.items || []).find(x => String(x.n) === String(n)); }
function chSpeak(i) {
  const ch = S.ch.charts[S.ehrOnly]; const n = ch?.narratives?.[i]; if (!n || !('speechSynthesis' in window)) return;
  if (S.ch.speaking === i) { speechSynthesis.cancel(); S.ch.speaking = null; render(); return; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(n.text); u.rate = 0.98; u.lang = 'en-US';
  u.onend = u.onerror = () => { if (S.ch.speaking === i) { S.ch.speaking = null; render(); } };
  S.ch.speaking = i; speechSynthesis.speak(u); render();
}
document.addEventListener('click', e => {
  if (!S.ehrOnly) return;
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, v = el.dataset.v;
  if (a === 'ew-act') { S.ch.act = v; render(); document.querySelector('.ew-content')?.scrollTo?.(0, 0); }
  else if (a === 'ch-note') { S.ch.note = +v; render(); }
  else if (a === 'ch-speak') chSpeak(+v);
  else if (a === 'ch-save') { clearTimeout(chTimer); chSave(false); }
  else if (a === 'ch-key') { S.ch.showKey = !S.ch.showKey; render(); }
  else if (a === 'it-hl') { const it = chItem(v); if (!it || el.disabled) return; const ans = chAns(); const cur = new Set(ans.answers[v] || []); const i = +el.dataset.i; cur.has(i) ? cur.delete(i) : cur.add(i); ans.answers[v] = cur.size ? [...cur].sort((x, y) => x - y) : undefined; chTouched(); render(); }
  else if (a === 'it-mv') { const it = chItem(v); if (!it) return; const ans = chAns(); const ord = [...(Array.isArray(ans.answers[v]) ? ans.answers[v] : (S.ch.local[v] || it.options.map((_, i) => i)))]; const p = +el.dataset.p, q2 = p + +el.dataset.d; if (q2 < 0 || q2 >= ord.length) return; [ord[p], ord[q2]] = [ord[q2], ord[p]]; ans.answers[v] = ord; chTouched(); render(); }
  else if (a === 'it-keep') { const it = chItem(v); if (!it) return; chAns().answers[v] = S.ch.local[v] || it.options.map((_, i) => i); chTouched(); render(); }
});
document.addEventListener('change', e => {
  const el = e.target; if (!S.ehrOnly) return;
  if (el.dataset.act === 'ch-prac') { S.ch.prac = el.value; S.ch.ansFor = null; render(); return; }
  const n = el.dataset.it; if (!n || el.dataset.k === 'text') return; const it = chItem(n); if (!it) return; const ans = chAns(); const k = el.dataset.k;
  if (k === 'mcq') ans.answers[n] = +el.value;
  else if (k === 'sata') { const s = new Set(ans.answers[n] || []); el.checked ? s.add(+el.value) : s.delete(+el.value); ans.answers[n] = s.size ? [...s].sort((x, y) => x - y) : undefined; }
  else if (k === 'matrix') { const m = Array.isArray(ans.answers[n]) ? [...ans.answers[n]] : it.rows.map(() => null); m[+el.dataset.r] = +el.value; ans.answers[n] = m; }
  else if (k === 'cloze') { const m = Array.isArray(ans.answers[n]) ? [...ans.answers[n]] : it.blanks.map(() => null); m[+el.dataset.b] = el.value === '' ? null : +el.value; ans.answers[n] = m.some(x => x != null) ? m : undefined; }
  else if (k === 'bowtie') { const b = ans.answers[n] ? { c: ans.answers[n].c ?? null, a: [...(ans.answers[n].a || [])], m: [...(ans.answers[n].m || [])] } : { c: null, a: [], m: [] }; const part = el.dataset.b, i = +el.value;
    if (part === 'c') b.c = i; else { const lim = part === 'a' ? (it.pick?.a || 2) : (it.pick?.m || 2); const s = b[part].filter(x => x !== i); if (el.checked) { s.push(i); if (s.length > lim) { s.shift(); toast(`Choose ${lim}: the earliest choice was replaced.`); } } b[part] = s; }
    ans.answers[n] = b; }
  chTouched(); render();
});
document.addEventListener('input', e => {
  const el = e.target; if (!S.ehrOnly) return;
  if (el.dataset.chf === 'comments') { chAns().comments = el.value; chTouched(); return; }
  if (el.dataset.k === 'text' && el.dataset.it) { chAns().answers[el.dataset.it] = el.value.trim() ? el.value : undefined; chTouched(); }
});
window.addEventListener('beforeunload', e => { if (S.ehrOnly && S.ch.dirty && chMode() === 'save') { e.preventDefault(); e.returnValue = ''; } });
