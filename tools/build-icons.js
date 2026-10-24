#!/usr/bin/env node
/* Draws a small nursing illustration for every case: public/img/cases/C01.svg ... (original line drawings on
   the unit's colour). Run after build-content.js. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const OUT = path.join(ROOT, 'public', 'img', 'cases'); fs.mkdirSync(OUT, { recursive: true });
const UNIT = { 1: ['#0E7C86', '#07474E'], 2: ['#1565A8', '#0B3C6B'], 3: ['#C62839', '#7A1420'], 4: ['#2E7D32', '#1B4D1E'], 5: ['#6A3D8F', '#3E2157'], 6: ['#B26A00', '#6B3F00'] };

/* icons on a 24 x 24 grid, drawn with white strokes */
const I = {
  heartHands: '<path d="M12 9.5c-1.2-2.4-5-2-5 .8 0 2.4 5 5.2 5 5.2s5-2.8 5-5.2c0-2.8-3.8-3.2-5-.8z"/><path d="M2 14l4 4h7M22 14l-4 4"/><path d="M13 18h2.5a2 2 0 0 0 0-4H12"/>',
  speech: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  crescent: '<path d="M16 4a8 8 0 1 0 4 12.5A7 7 0 0 1 16 4z"/><path d="M18 6.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  translate: '<path d="M3 5h10v7H7l-4 3z"/><path d="M11 14h3l4 3v-3h3V8h-6"/><path d="M6 8h4M8 7v1c0 1.5-1 2.5-2 3"/>',
  calm: '<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><circle cx="12" cy="5" r="1.5"/>',
  spine: '<rect x="9" y="2.5" width="6" height="3" rx="1"/><rect x="8.5" y="7" width="7" height="3" rx="1"/><rect x="8.5" y="11.5" width="7" height="3" rx="1"/><rect x="9" y="16" width="6" height="3" rx="1"/><path d="M12 19v2.5"/>',
  thermometer: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 8v8"/><path d="M17 6h3M17 9h2"/>',
  heartDrop: '<path d="M12 20s-7-4.2-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.8 12 20 12 20z"/><path d="M12 11.5c-.9 1.3-1.5 2.1-1.5 2.8a1.5 1.5 0 0 0 3 0c0-.7-.6-1.5-1.5-2.8z"/>',
  drop: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2.5 2.5 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/><path d="M14 9l2 1-1 3 2 1"/>',
  kidney: '<path d="M8 4c-3 0-5 3-5 7s2 9 5 9 3-3 3-5-1-3-1-5 2-3 2-4-1-2-4-2z"/><path d="M14 12h2l1-3 2 6 1-3h2"/>',
  bloodDrops: '<path d="M8 4s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8z"/><path d="M17 9s-3 3.5-3 6a3 3 0 0 0 6 0c0-2.5-3-6-3-6z"/>',
  gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.2"/><path d="M6 20h12"/>',
  lungs: '<path d="M12 4v7"/><path d="M12 9c-1 1-2 1-3 1-3 0-5 4-5 7 0 2 1 3 3 3s4-1 4-4v-6"/><path d="M12 9c1 1 2 1 3 1 3 0 5 4 5 7 0 2-1 3-3 3s-4-1-4-4v-6"/>',
  bloodBag: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M12 16v5M9 21h6"/><path d="M12 6.5s-2.5 3-2.5 4.5a2.5 2.5 0 0 0 5 0c0-1.5-2.5-4.5-2.5-4.5z"/>',
  syringe: '<path d="M14 4l6 6M17 7l-9 9-3-3 9-9"/><path d="M5 13l-2 2M8 16l-2 2M3 21l3-3"/><path d="M10 10l2 2"/>',
  meter: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><rect x="8.5" y="6" width="7" height="5" rx="1"/><path d="M10 15h4M12 13v4"/>',
  inhaler: '<path d="M9 3h6v8l-2 2H9z"/><path d="M9 13H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h8v-7"/><path d="M17 15h2M17 18h3M17 12l2-1"/>',
  clot: '<path d="M12 4v7"/><path d="M12 9c-1 1-2 1-3 1-3 0-5 4-5 7 0 2 1 3 3 3s4-1 4-4v-6"/><path d="M12 9c1 1 2 1 3 1 3 0 5 4 5 7 0 2-1 3-3 3s-4-1-4-4v-6"/><circle cx="16.5" cy="15" r="1.6"/>',
  people: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 20a5 5 0 0 1 10 0M13.5 20a4 4 0 0 1 7.5-2"/>',
  checklist: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8 11l1.5 1.5L12 10M8 16l1.5 1.5L12 15M14 11.5h2M14 16.5h2"/>',
  stoma: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
  pills: '<rect x="3" y="9" width="10" height="6" rx="3"/><path d="M8 9v6"/><circle cx="17" cy="8" r="3.5"/><path d="M14.5 10.5l5-5"/><circle cx="16.5" cy="17" r="3"/>',
  baby: '<circle cx="12" cy="8" r="4"/><path d="M10.5 7.5h0M13.5 7.5h0"/><path d="M6 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M19 3l1 1M21 6h1M17 2v1"/>',
  lifebuoy: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M9.5 9.5L6.5 6.5M14.5 9.5l3-3M9.5 14.5l-3 3M14.5 14.5l3 3"/>',
  balance: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-2.5 6h5zM19 7l-2.5 6h5z"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12 13.5c-.8-1.6-3.2-1.3-3.2.5 0 1.6 3.2 3.4 3.2 3.4s3.2-1.8 3.2-3.4c0-1.8-2.4-2.1-3.2-.5z"/>',
  candle: '<rect x="9" y="11" width="6" height="10" rx="1"/><path d="M12 11V9"/><path d="M12 3.5c-1.2 1.6-2 2.6-2 3.6a2 2 0 0 0 4 0c0-1-.8-2-2-3.6z"/><path d="M6 21h12"/>',
  shieldHeart: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 10.5c-.9-1.8-3.6-1.5-3.6.6 0 1.8 3.6 3.8 3.6 3.8s3.6-2 3.6-3.8c0-2.1-2.7-2.4-3.6-.6z"/>',
  coinPill: '<circle cx="8.5" cy="12" r="5.5"/><path d="M8.5 9v6M10 10H7.8a1 1 0 0 0 0 2h1.4a1 1 0 0 1 0 2H7"/><rect x="14.5" y="6" width="5" height="12" rx="2.5"/><path d="M14.5 12h5"/>',
  phoneAlert: '<rect x="6" y="2.5" width="9" height="19" rx="2"/><path d="M9.5 18.5h2"/><path d="M19 7v5M19 15v.5"/>',
  team: '<circle cx="12" cy="6" r="2.5"/><circle cx="5.5" cy="10" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M8 19a4 4 0 0 1 8 0M2 19a3.5 3.5 0 0 1 6-2.5M22 19a3.5 3.5 0 0 0-6-2.5"/>',
  hands: '<path d="M7 21v-5l-3-4 1.5-1.5L8 13V5.5a1.2 1.2 0 0 1 2.4 0V11"/><path d="M10.4 10V4.5a1.2 1.2 0 0 1 2.4 0V11M12.8 10.5V5.5a1.2 1.2 0 0 1 2.4 0V12"/><path d="M15.2 11V8a1.2 1.2 0 0 1 2.4 0v6c0 3-1.5 5-4 7"/><path d="M19 3.5c-.6.8-1 1.3-1 1.8a1 1 0 0 0 2 0c0-.5-.4-1-1-1.8z"/>',
};
const ICON = { C01: 'heartHands', C02: 'speech', C03: 'crescent', C04: 'translate', C05: 'calm', C06: 'spine', C07: 'thermometer', C08: 'heartDrop', C09: 'drop', C10: 'brain', C11: 'kidney',
  C12: 'bloodDrops', C13: 'gauge', C14: 'lungs', C15: 'bloodBag', C16: 'syringe', C17: 'meter', C18: 'inhaler', C19: 'clot', C20: 'people', C21: 'checklist', C22: 'stoma', C23: 'pills',
  C24: 'baby', C25: 'lifebuoy', C26: 'balance', C27: 'house', C28: 'candle', C29: 'shieldHeart', C30: 'coinPill', C31: 'phoneAlert', C32: 'team', C33: 'hands' };

for (const c of cases) {
  const unit = +(/Unit (\d)/.exec(c.group) || [0, 1])[1]; const [c1, c2] = UNIT[unit] || UNIT[1];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${c.title.replace(/[&<>"]/g, '')}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="120" height="120" rx="22" fill="url(#g)"/>
<circle cx="96" cy="22" r="34" fill="#fff" opacity=".07"/><circle cx="18" cy="108" r="26" fill="#fff" opacity=".06"/>
<g transform="translate(30 16) scale(2.5)" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I[ICON[c.id] || 'checklist']}</g>
<text x="60" y="107" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#fff" letter-spacing="1">CASE ${c.num}</text>
</svg>
`;
  fs.writeFileSync(path.join(OUT, c.id + '.svg'), svg);
}
console.log(cases.length, 'case illustrations written to public/img/cases');
