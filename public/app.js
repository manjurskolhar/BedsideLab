'use strict';
const TODAY = new Date().toISOString().slice(0,10);
const FILE_EXT = ['docx','pdf','xlsx','pptx','txt','csv','zip','png','jpg','jpeg'];
const MAX_FILE = 20*1024*1024;

/* ---------- state ---------- */
const S = {
  auth:'loading', // loading | setup | login | ready
  me:{id:'', name:'', role:'student', section:''},
  faculty:{}, students:{}, patients:{}, assignments:{}, library:{}, work:{}, grades:{},
  route:{name:null, p:{}}, form:null, upload:null,
  chartTab:'overview', ehrOnly:null,
  acct:{q:'', section:'', mine:false, results:null, created:null},
  lib:{cat:'All', q:'', tag:'', level:'', readyOnly:false}, sel:new Set(), busy:false,
};

/* ---------- utils ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const fmtDate = d => { if(!d) return '—'; if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; return new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); };
const fmtWhen = t => t ? new Date(t).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const fmtSize = n => n>=1048576? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
const age = dob => { const b=new Date(dob+'T00:00:00'), n=new Date(); if(isNaN(b)) return '?'; let a=n.getFullYear()-b.getFullYear(); if(n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const lines = t => String(t||'').split('\n').map(s=>s.trim()).filter(Boolean);
function getPath(o,p){ return p.split('.').reduce((a,k)=> a==null? a : a[k], o); }
function setPath(o,p,v){ const ks=p.split('.'); let c=o; ks.slice(0,-1).forEach((k,i)=>{ if(c[k]==null) c[k] = /^\d+$/.test(ks[i+1])? [] : {}; c=c[k]; }); c[ks[ks.length-1]] = v; }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,4200); }
const palette=['#1D5C8F','#2C7A4B','#9A5800','#7A3E9D','#B42318','#0F6E78','#5B6B2A'];
function colorFor(id){ let h=0; for(const c of String(id)) h=(h*31+c.charCodeAt(0))>>>0; return palette[h%palette.length]; }
function person(id){ return S.students[id] || S.faculty[id] || S.guests?.[id] || null; }
function name(id){ if(id===S.me.id) return S.me.name || 'You'; return person(id)?.name || 'Former user'; }
function avatar(id){ const n=name(id); const ini=n.split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'?'; return `<span class="avatar" style="background:${colorFor(id)}">${esc(ini)}</span>`; }
function tbl(head, rows, cls=''){ return `<div class="tbl-wrap"><table class="${cls}"><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${head.length}" class="muted">No entries</td></tr>`}</tbody></table></div>`; }
const ext = n => (String(n).split('.').pop()||'').toLowerCase();
const isLate = (a, t) => a.due && t && new Date(t) > new Date(a.due+'T23:59:59');

/* ---------- server calls ---------- */
async function api(method, url, body, raw){
  const opt={method, headers:{'X-BedsideLab':'1'}, credentials:'same-origin'};
  if(raw){ opt.body=raw.body; Object.assign(opt.headers, raw.headers); }
  else if(body!==undefined){ opt.body=JSON.stringify(body); opt.headers['Content-Type']='application/json'; }
  let res; try{ res=await fetch(url, opt); }catch(e){ throw new Error('Cannot reach the server. Check your connection.'); }
  const data = await res.json().catch(()=>({}));
  if(!res.ok){ const err=new Error(data.error||('Request failed ('+res.status+')')); err.status=res.status; if(res.status===401 && S.auth==='ready'){ S.auth='login'; render(); } throw err; }
  return data;
}
async function refresh(){
  const d=await api('GET','/api/bootstrap');
  S.me=d.me; S.faculty=d.faculty; S.students=d.students; S.patients=d.patients||{}; S.assignments=d.assignments; S.library=d.library; S.work=d.work; S.grades=d.grades; S.guests=d.guests||{}; S.org=d.org||null; S.orgs=d.orgs||[]; S.answers=d.answers||{}; S.team=d.team||[]; S.joincodes=d.joincodes||{};
  S.program=d.program||null; S.learner=d.learner||null; S.learners=d.learners||{};
}
async function write(fn, okMsg){
  try{ await fn(); await refresh(); if(okMsg) toast(okMsg); return true; }
  catch(e){ toast(e.message); return false; }
}

/* ---------- documents ---------- */
// base: 'files' (activity), 'keyfiles' (answer key), 'work/..' (student submission), 'grades/<sid>/f' (marked copy)
async function putFile(base, file, onProgress){
  if(!FILE_EXT.includes(ext(file.name))) throw new Error('Use a .docx, .pdf, .xlsx, .pptx or image file.');
  if(file.size>MAX_FILE) throw new Error('That file is larger than 20 MB.');
  let kind='activity', extra='';
  if(base==='keyfiles') kind='key'; else if(base.startsWith('work/')) kind='submission'; else if(base.startsWith('grades/')){ kind='marked'; extra='&student='+encodeURIComponent(base.split('/')[1]); }
  else if(base==='receipt') kind='receipt'; else if(base.startsWith('cert/')){ kind='certificate'; extra='&student='+encodeURIComponent(base.split('/')[1]); }
  onProgress?.(0.3);
  const meta=await api('POST', `/api/files?kind=${kind}${extra}`, undefined, {body:file, headers:{'X-File-Name':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'}});
  onProgress?.(1);
  return meta;
}
const fileHref = f => `/api/files/${encodeURIComponent(f.fid)}`;
const fileRow = (f, extra='') => `<div class="file"><div class="row" style="gap:10px;min-width:0"><span class="doc-ico">${esc(ext(f.name).toUpperCase())}</span><div style="min-width:0"><div class="fname">${esc(f.name)}</div><div class="small muted">${fmtSize(f.size||0)}${f.at?' · '+fmtWhen(f.at):''}</div></div></div><div class="row">${extra}<a class="btn sm" href="${fileHref(f)}" download>Download</a></div></div>`;

/* ---------- chart link (opens the activity's patient chart in a new tab) ---------- */
const ptOf = a => (a?.patient && S.patients[a.patient]) ? a.patient : null;
function wbHref(a){ const c=ptOf(a); return c? `/chart/${encodeURIComponent(c)}${a.id && S.assignments[a.id] && S.me.role==='student'? '?a='+encodeURIComponent(a.id) : ''}` : ''; }
function wbLabel(a){ const c=ptOf(a); if(!c) return ''; const p=S.patients[c]; return `${p.name}${p.age!=null?', '+p.age+(/mo|day|wk/.test(String(p.age))?'':' y'):''}`; }
const nChecks = a => (a?.items||[]).length;

/* ---------- themes (chosen by the admin for the whole site) ---------- */
const THEMES={
  navy:{label:'Clinical Navy', note:'Navy header, blue menu', t:{'bg':'#EEF2F5','surface':'#FFFFFF','sunken':'#E3E9EE','ink':'#14222A','muted':'#586972','line':'#D3DCE3','accent':'#1565A8',
    'topbar-bg':'#0B2F4E','topbar-ink':'#FFFFFF','rail-bg':'#123A5C','rail-ink':'#DCE7F1','rail-active-bg':'#FFFFFF','rail-active-ink':'#0B2F4E','band-bg':'#DCE6EE','band-ink':'#14222A','sec-head-bg':'#3B4A57','sec-head-ink':'#FFFFFF','ehrnav-bg':'#2B3640','ehrnav-ink':'#E4EAEF','stripe':'#1565A8'}},
  charcoal:{label:'EHR Classic', note:'Charcoal menu, red accents', t:{'bg':'#F4F4F4','surface':'#FFFFFF','sunken':'#ECECEC','ink':'#222222','muted':'#666666','line':'#D9D9D9','accent':'#C62839',
    'topbar-bg':'#FFFFFF','topbar-ink':'#222222','rail-bg':'#333333','rail-ink':'#F2F2F2','rail-active-bg':'#4A4A4A','rail-active-ink':'#FFFFFF','band-bg':'#E6E6E6','band-ink':'#222222','sec-head-bg':'#555555','sec-head-ink':'#FFFFFF','ehrnav-bg':'#333333','ehrnav-ink':'#F2F2F2','stripe':'#E8573F'}},
  teal:{label:'Care Teal', note:'Teal header, light menu', t:{'bg':'#EEF5F5','surface':'#FFFFFF','sunken':'#E1ECEC','ink':'#12262A','muted':'#55696C','line':'#CFDDDE','accent':'#00798C',
    'topbar-bg':'#005F6B','topbar-ink':'#FFFFFF','rail-bg':'#E2EFF0','rail-ink':'#12363C','rail-active-bg':'#00798C','rail-active-ink':'#FFFFFF','band-bg':'#D6EAEC','band-ink':'#12262A','sec-head-bg':'#2F5D63','sec-head-ink':'#FFFFFF','ehrnav-bg':'#E2EFF0','ehrnav-ink':'#12363C','stripe':'#2BB3C0'}},
  green:{label:'Evergreen', note:'Green header, forest menu', t:{'bg':'#F0F4EF','surface':'#FFFFFF','sunken':'#E4EBE3','ink':'#18241A','muted':'#5A6A5C','line':'#D2DDD1','accent':'#2E7D32',
    'topbar-bg':'#1E4D2B','topbar-ink':'#FFFFFF','rail-bg':'#24573A','rail-ink':'#E2EEE5','rail-active-bg':'#FFFFFF','rail-active-ink':'#1E4D2B','band-bg':'#DDE9DD','band-ink':'#18241A','sec-head-bg':'#3D5A44','sec-head-ink':'#FFFFFF','ehrnav-bg':'#2C3B30','ehrnav-ink':'#E2EEE5','stripe':'#6DBE45'}},
  plum:{label:'Plum Clinic', note:'Plum header, soft menu', t:{'bg':'#F4F1F6','surface':'#FFFFFF','sunken':'#EAE4EE','ink':'#231A2A','muted':'#665C6E','line':'#DCD3E2','accent':'#6A3D8F',
    'topbar-bg':'#4A2C5E','topbar-ink':'#FFFFFF','rail-bg':'#EDE5F2','rail-ink':'#3A2549','rail-active-bg':'#6A3D8F','rail-active-ink':'#FFFFFF','band-bg':'#E8DFEE','band-ink':'#231A2A','sec-head-bg':'#4F3D5C','sec-head-ink':'#FFFFFF','ehrnav-bg':'#EDE5F2','ehrnav-ink':'#3A2549','stripe':'#B57EDC'}},
  night:{label:'Night Shift', note:'Dark mode for low light', dark:true, t:{'bg':'#0F151B','surface':'#17212A','sunken':'#1E2A34','ink':'#E3EAEF','muted':'#94A5B0','line':'#2A3843','accent':'#6AB0EA',
    'topbar-bg':'#090E13','topbar-ink':'#E3EAEF','rail-bg':'#111A22','rail-ink':'#C9D5DE','rail-active-bg':'#1F3B55','rail-active-ink':'#FFFFFF','band-bg':'#1E2A34','band-ink':'#E3EAEF','sec-head-bg':'#26333E','sec-head-ink':'#E3EAEF','ehrnav-bg':'#111A22','ehrnav-ink':'#C9D5DE','stripe':'#3B82C4',
    'ok':'#6CC892','ok-soft':'#173326','warn':'#E9AE5B','warn-soft':'#382A14','bad':'#F2877A','bad-soft':'#3D1D1A'}},
};
const DEFAULT_SITE={theme:'teal', custom:{}, siteName:'BedsideLab', institution:'Nursing clinical judgment practicum', logo:'', showName:true, logoTile:true, topbarHeight:60, stripeWidth:3};
S.site={...DEFAULT_SITE};
function hexRgb(h){ const m=/^#?([0-9a-f]{6})$/i.exec(h||''); if(!m) return null; const n=parseInt(m[1],16); return [n>>16&255,n>>8&255,n&255]; }
function lum(h){ const c=hexRgb(h); if(!c) return 1; const [r,g,b]=c.map(v=>{ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r+0.7152*g+0.0722*b; }
function mix(h, w, t){ const a=hexRgb(h), b=hexRgb(w); if(!a||!b) return h; return '#'+a.map((v,i)=>Math.round(v*(1-t)+b[i]*t).toString(16).padStart(2,'0')).join(''); }
const inkOn = bg => lum(bg)>0.45? '#14222A' : '#FFFFFF';
const LIGHT_STATUS={'ok':'#2C7A4B','ok-soft':'#E1F1E7','warn':'#9A5800','warn-soft':'#FBEEDB','bad':'#B42318','bad-soft':'#FBE4E1'};
function themeTokens(site){
  const base=THEMES[site.theme]||THEMES.navy; const t={...LIGHT_STATUS, ...base.t}; const c=site.custom||{};
  if(hexRgb(c.accent)){ t.accent=c.accent; t.stripe=c.accent; }
  if(hexRgb(c.topbar)){ t['topbar-bg']=c.topbar; t['topbar-ink']=inkOn(c.topbar); }
  if(hexRgb(c.rail)){ t['rail-bg']=c.rail; t['rail-ink']=inkOn(c.rail)==='#FFFFFF'? '#EEF2F5':'#1B2A33';
    if(lum(c.rail)>0.45){ t['rail-active-bg']=t.accent; t['rail-active-ink']=inkOn(t.accent); } else { t['rail-active-bg']='#FFFFFF'; t['rail-active-ink']=c.rail; } }
  if(hexRgb(c.ehrnav)){ t['ehrnav-bg']=c.ehrnav; t['ehrnav-ink']=inkOn(c.ehrnav)==='#FFFFFF'? '#EEF2F5':'#1B2A33'; }
  t['accent-ink']=inkOn(t.accent);
  t['accent-soft']= base.dark? mix(t.accent,'#000000',0.7) : mix(t.accent,'#FFFFFF',0.86);
  return {t, dark:!!base.dark};
}
function applyTheme(site){
  const {t,dark}=themeTokens(site); const r=document.documentElement;
  for(const [k,v] of Object.entries(t)) r.style.setProperty('--'+k, v);
  r.style.colorScheme = dark? 'dark' : 'light';
  const meta=document.querySelector('meta[name=theme-color]'); if(meta) meta.content=t['topbar-bg'];
  r.style.setProperty('--topbar-h', (+site.topbarHeight||60)+'px'); r.style.setProperty('--stripe-w', (site.stripeWidth??3)+'px');
  const ico=document.querySelector('link[rel=icon]'); if(ico){ ico.href=site.logo||'/favicon.svg'; ico.type=site.logo? site.logo.slice(5,site.logo.indexOf(';')) : 'image/svg+xml'; }
  document.title = (site.siteName||'BedsideLab')+' · Nursing Clinical Judgment Practicum';
}
async function loadSite(slug){ try{ const s=await api('GET','/api/settings'+(slug?'?org='+encodeURIComponent(slug):'')); S.site={...DEFAULT_SITE, ...s, custom:{...(s.custom||{})}}; }catch(_){ } applyTheme(S.site); }

/* ---------- dates ---------- */
/* chronological key for MM/DD/YYYY [HH:MM] or YYYY-MM-DD dates; unknown formats sort last */
function timeKey(v){ const s=String(v||''); let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); if(m) return m[3]+m[1]+m[2]+(m[4]||'00').padStart(2,'0')+(m[5]||'00');
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if(m) return m[1]+m[2]+m[3]+(m[4]||'00')+(m[5]||'00'); return '~'+s; }

/* ---------- roles ---------- */
function role(){ return S.me.role; }
function realRole(){ return S.me.role; }
function mySection(){ return S.me.section || ''; }
function students(){ return Object.values(S.students).filter(u=>u.role==='student'); }
function facultyList(){ return Object.values(S.faculty).filter(u=>u.role==='faculty'); }
function joinPanel(){
  const codes=Object.entries(S.joincodes||{}).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  const st=j=> !j.active? '<span class="pill">Off</span>' : j.expiresAt && j.expiresAt<=Date.now()? '<span class="pill bad">Expired</span>' : j.maxUses && j.uses>=j.maxUses? '<span class="pill warn">Full</span>' : '<span class="pill ok">Open</span>';
  return `<section class="panel panel-pad stack"><div><h2>Class codes: let students create their own accounts</h2>
    <p class="small muted">Create a code for a class and share the link or the code. Students open <span class="mono">${esc(location.host)}/join</span>, enter the code and choose their own password. They are placed in the section you choose and count toward your plan's student limit. Turn a code off when the class has joined.</p></div>
    <form class="row" data-form="new-joincode" style="align-items:flex-end">
      <label class="field"><span>Section</span><input type="text" id="jc-sec" name="section" list="sec-list" placeholder="e.g. NURS-310 A" style="width:170px"></label>
      <label class="field"><span>Label (optional)</span><input type="text" id="jc-label" name="label" placeholder="e.g. Fall 2026 clinical judgment" style="width:200px"></label>
      <label class="field"><span>Code works for</span><select id="jc-days" name="days">${[[7,'7 days'],[14,'14 days'],[30,'30 days'],[90,'90 days'],[0,'No end date']].map(([v,l])=>`<option value="${v}" ${v===14?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Maximum students</span><input type="number" id="jc-max" name="maxUses" min="0" placeholder="No limit" style="width:120px"></label>
      <button class="btn primary" type="submit">Create class code</button></form>
    ${codes.length? tbl(['Code','Section','Label','Joined','Status','Ends',''], codes.map(([c,j])=>`<tr class="${S.acct.newCode===c?'hl':''}"><td><b class="mono join-code">${esc(c)}</b></td><td>${esc(j.section||'—')}</td><td>${esc(j.label||'')}</td><td class="num">${j.uses||0}${j.maxUses?' / '+j.maxUses:''}</td><td>${st(j)}</td><td class="small">${j.expiresAt? fmtWhen(j.expiresAt) : 'No end date'}</td>
      <td><div class="row" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" data-act="copy-join" data-v="${esc(c)}">Copy link</button><button class="btn sm" data-act="join-print" data-v="${esc(c)}">Print</button>${j.active?`<button class="btn sm" data-act="join-off" data-v="${esc(c)}">Turn off</button>`:`<button class="btn sm" data-act="join-on" data-v="${esc(c)}" ${j.expiresAt&&j.expiresAt<=Date.now()?'data-exp="1"':''}>Turn on</button>`}<button class="btn sm danger" data-act="join-del" data-v="${esc(c)}">Delete</button></div></td></tr>`))
      : '<p class="hint">No class codes yet.</p>'}
    ${S.acct.printCode && S.joincodes?.[S.acct.printCode]? `<div class="join-print"><h1>Join ${esc(S.org?.name||'')} on ${esc(S.site.siteName||'BedsideLab')}</h1><p>1. Go to <b>${esc(location.host)}/join</b></p><p>2. Enter the class code</p><div class="join-big">${esc(S.acct.printCode)}</div><p>3. Enter your name, college email and a password you choose.</p><p class="small">Section: ${esc(S.joincodes[S.acct.printCode].section||'—')}</p></div>`:''}
  </section>`;
}
async function joinCheck(code){
  S.join=S.join||{}; S.join.code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(.{4})(.{4})$/,'$1-$2'); S.join.info=null; S.join.err='';
  if(!S.join.code){ S.join.err='Enter the class code from your faculty.'; render(); return; }
  try{ S.join.info=await api('GET','/api/join/'+encodeURIComponent(S.join.code)); if(!S.join.info.ok) S.join.err=S.join.info.why; }catch(e){ S.join.err=e.message; }
  render(); setTimeout(()=>document.getElementById(S.join.info?.ok?'jn-name':'jn-code')?.focus(),0);
}
function teams(){ return [...new Set(students().map(s=>s.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); }
function sections(){ return [...new Set(students().map(s=>s.section).filter(Boolean))].sort(); }
function targetStudents(a){ return students().filter(s=> s.active && (a.target==='all' || s.section===a.target)); }
function sub(sid, aid){ return S.work[sid]?.[aid]; }
function grade(sid, aid){ return S.grades[sid]?.[aid]; }
function myAssignments(){ return Object.entries(S.assignments).map(([id,a])=>({id,...a})).sort((x,y)=>(x.due||'').localeCompare(y.due||'')); }
function allAssignments(){ return Object.entries(S.assignments).map(([id,a])=>({id,...a})).sort((x,y)=>(y.createdAt||0)-(x.createdAt||0)); }
function studentStatus(sid, a){
  const s=sub(sid,a.id), g=grade(sid,a.id);
  if(g && S.program) return passed(g)? {k:'graded', label:`Passed ${pct(g)}%`, cls:'ok'} : {k:'resubmit', label:`Not passed (${pct(g)}%): resubmit`, cls:'bad'};
  if(g) return {k:'graded', label:`Graded ${g.score}/${a.points||100}`, cls:'ok'};
  if(s?.status==='submitted') return {k:'submitted', label: isLate(a,s.submittedAt)?'Submitted late':'Submitted', cls: isLate(a,s.submittedAt)?'warn':'info'};
  if(a.due && a.due < TODAY) return {k:'overdue', label:'Missing', cls:'bad'};
  return {k:'new', label:'Not submitted', cls:''};
}

/* ---------- data layer ---------- */
const API = {
  saveAssignment:(id,a)=>write(()=>api('PUT','/api/assignments/'+encodeURIComponent(id),a)),
  deleteAssignment:(id)=>write(()=>api('DELETE','/api/assignments/'+encodeURIComponent(id))),
  saveTemplate:(id,t)=>write(()=>api('PUT','/api/library/'+encodeURIComponent(id),t)),
  deleteTemplate:(id)=>write(()=>api('DELETE','/api/library/'+encodeURIComponent(id))),
  saveDataset:(id,p)=>write(()=>api('PUT','/api/patients/'+encodeURIComponent(id),p)),
  deleteDataset:(id)=>write(()=>api('DELETE','/api/patients/'+encodeURIComponent(id))),
  saveWork:(aid,s)=>write(()=>api('PUT','/api/work/'+encodeURIComponent(aid),{fileId:s.file.fid, note:s.note})),
  saveGrade:(sid,aid,g)=>write(()=>api('PUT',`/api/grades/${encodeURIComponent(aid)}/${encodeURIComponent(sid)}`,{score:g.score, feedback:g.feedback, fileId:g.file?.fid, applyTeam:!!g.applyTeam})),
};

/* ---------- render scheduling ---------- */
let pending=false;
function typing(){ const a=document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !['checkbox','radio','file'].includes(a.type) && document.getElementById('main').contains(a); }
function scheduleRender(){ if(typing() || S.busy){ pending=true; return; } render(); }
document.addEventListener('focusout', e=>{ const rr=e.target?.dataset?.rerender!=null; setTimeout(()=>{ if(typing()) return; if(rr || pending){ pending=false; render(); } }, 0); });

/* ---------- navigation ---------- */
function navFor(r){
  const n=[];
  if(r==='owner') return [['colleges','Colleges',(S.orgs||[]).length],['appearance','Platform appearance'],['account','My account']];
  if(r==='admin') n.push(['overview','Overview'],['people','Faculty',facultyList().length]);
  if((r==='admin'||r==='faculty') && S.program) n.push(['registrations','Registrations',students().filter(u=>u.access==='pending' && S.learners?.[u.id]?.receipt).length],['certificates','Certificates',students().filter(u=>u.access==='approved' && progressOf(u.id).eligible && !S.learners?.[u.id]?.certificate).length]);
  if(r==='admin' && S.program) n.push(['program','Program settings']);
  if(r==='admin'||r==='faculty') n.push(['students','Students',students().length],['library','Activity library',Object.keys(S.library).length],['assignments','Assigned work',Object.keys(S.assignments).length],['cases','Patient charts',Object.keys(S.patients).length],['reference','Clinical reference']);
  if(r==='student' && S.program){ if(S.me.access==='pending'||S.me.access==='rejected') n.push(['registration','Registration & payment']);
    else n.push(['my','My activities',myAssignments().length],['progress','Progress & certificate'],['reference','Clinical reference'],['registration','Registration & payment']); }
  else if(r==='student') n.push(['my','My assignments',myAssignments().length],['grades','My grades'],['reference','Clinical reference']);
  if(r==='guest') n.push(['library','Activity library',Object.keys(S.library).length],['cases','Patient charts',Object.keys(S.patients).length],['reference','Clinical reference']);
  if(r==='admin') n.push(['guests','Guests',Object.keys(S.guests||{}).length],['appearance','Appearance']);
  n.push(['account','My account']);
  return n;
}
function go(name, p={}){ S.route={name, p}; S.form=null; S.upload=null; S.chartTab='overview'; if(name==='people'||name==='students'||name==='guests') S.acct.created=null; render(); window.scrollTo(0,0); if(S.auth==='ready') refresh().then(()=>scheduleRender()).catch(()=>{}); }
function isSection(k){
  const n=S.route.name;
  if(n==='builder') return k===(S.form?.kind==='template'?'library':'assignments');
  const map={library:['library','assign'], assignments:['assignments','review','grade'], cases:['cases','case-edit'], my:['my','work'], grades:['grades'], overview:['overview'], people:['people'], students:['students'], account:['account'], appearance:['appearance'], guests:['guests'], colleges:['colleges','college'], reference:['reference']};
  return (map[k]||[k]).includes(n);
}
const MARK_SVG='<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><path d="M4 23V10M4 18h24v5M28 18v-2.5a4 4 0 0 0-4-4h-9V18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="14" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M17 8h5M19.5 5.5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function brandSrc(){ return (S.route.name==='appearance' && S.form && S.form.theme!==undefined)? S.form : S.site; }
function brandHTML(sub){ const src=brandSrc(); const n=src.siteName||'BedsideLab';
  const mark= src.logo? `<span class="brand-logo ${src.logoTile===false?'':'tile'}"><img src="${esc(src.logo)}" alt="${esc(n)} logo"></span>` : `<span class="brand-mark">${MARK_SVG}</span>`;
  const text= src.showName===false && src.logo? '' : `<div class="brand-text"><b>${esc(n)}</b>${(sub??src.institution)?`<span>${esc(sub??src.institution)}</span>`:''}</div>`;
  return `<div class="brand">${mark}${text}</div>`; }
function whoHTML(withSignOut=true){ return `<div class="who">${avatar(S.me.id)}<div class="who-text"><b>${esc(S.me.name)}</b><span>${esc(ROLE_LABEL[role()]||'')}</span></div>${withSignOut?'<button class="btn sm signout" data-act="logout">Sign out</button>':''}</div>`; }
const ROLE_LABEL={owner:'Owner',admin:'Admin',faculty:'Faculty',student:'Student',guest:'Guest'};
const isGuest=()=>S.me.role==='guest';
const fmtEnd=t=>new Date(t).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
function daysLeft(t){ const ms=t-Date.now(); if(ms<=0) return 'ended'; const d=Math.floor(ms/864e5), h=Math.floor(ms%864e5/36e5); return d? `${d} day${d>1?'s':''}${h?` ${h} h`:''} left` : `${Math.max(1,h)} hour${h>1?'s':''} left`; }
function guestStatus(g){ if(!g.active) return '<span class="pill bad">Deactivated</span>'; if(g.expiresAt && g.expiresAt<=Date.now()) return '<span class="pill bad">Expired</span>'; return g.mustChange? '<span class="pill warn">Not signed in yet</span>' : '<span class="pill ok">Active</span>'; }
function renderTop(){
  const top=document.getElementById('top'), rail=document.getElementById('rail'), shell=document.querySelector('.shell');
  document.getElementById('banner').innerHTML='';
  if(S.auth==='login' || S.auth==='setup'){ top.innerHTML=''; top.hidden=true; rail.hidden=true; shell.classList.add('solo'); return; }
  top.hidden=false;
  if(S.auth!=='ready' || S.me.mustChange){
    top.innerHTML=`${brandHTML()}${S.auth==='ready'?'<button class="btn sm" data-act="logout">Sign out</button>':''}`;
    rail.hidden=true; shell.classList.add('solo'); return;
  }
  top.hidden=false;
  if(S.refOnly){
    top.innerHTML=`${brandHTML('Clinical judgment reference')}${whoHTML(false)}`; top.classList.add('ehr-top');
    rail.hidden=true; shell.classList.add('solo'); return;
  }
  if(S.ehrOnly){
    top.innerHTML=''; top.hidden=true;
    rail.hidden=true; shell.classList.add('solo'); return;
  }
  rail.hidden=false; shell.classList.remove('solo');
  const r=role();
  if(r==='guest' && S.me.expiresAt) document.getElementById('banner').innerHTML=`<div class="guest-banner"><b>Guest preview</b> · read-only access to the activity library and the patient charts · ends ${esc(fmtEnd(S.me.expiresAt))} (${esc(daysLeft(S.me.expiresAt))})</div>`;
  const og=S.org; if(og){ const bn=document.getElementById('banner');
    if(og.readOnly) bn.insertAdjacentHTML('beforeend',`<div class="org-banner bad"><b>Subscription ended ${esc(fmtDay(og.expiresAt))}.</b> BedsideLab is read-only for ${esc(og.name)}: you can sign in and view, but nothing can be added or changed until the subscription is renewed.${r==='admin'?' Contact your BedsideLab provider to renew.':' Contact your college administrator.'}</div>`);
    else if(r==='admin' && og.expiresAt && og.expiresAt-Date.now()<30*864e5) bn.insertAdjacentHTML('beforeend',`<div class="org-banner warn"><b>Subscription ends ${esc(fmtDay(og.expiresAt))}</b> (in ${Math.max(1,Math.ceil((og.expiresAt-Date.now())/864e5))} days). Contact your BedsideLab provider to renew so your faculty and students can keep working.</div>`); }
  top.innerHTML=`${brandHTML()}${whoHTML()}`;
  rail.innerHTML=`<div class="label">${ROLE_LABEL[r]}</div>`+navFor(r).map(([k,l,c])=>`<button data-act="go" data-v="${k}" aria-current="${isSection(k)?'page':'false'}"><span>${esc(l)}</span>${c!=null?`<span class="count">${c}</span>`:''}</button>`).join('');
}
/* ---- guided tour of the chart window ---- */
const TOUR=[
  ['.ew-story','Patient storyboard','Who the patient is, allergies, code status, where they are and their latest vital signs. Always check allergies and code status first.'],
  ['.ew-acts','Chart','Each part of the record: the handoff report, notes, nursing assessment, vital signs, results, medications (MAR), orders and history. Read the chart the way you would at the start of a shift.'],
  ['.ew-acts [data-v="handoff"]','Handoff report','The report you receive from the nurse going off shift. Click Listen to hear it, like a recorded handoff.'],
  ['.ew-acts [data-v="activity"]','Activity','The clinical judgment items for this case. Your answers are saved to your assignment; objective items are scored against the key.'],
  ['.ew-acts [data-v="reference"]','Reference','The clinical judgment model, priority frameworks, therapeutic communication and reference ranges.'],
  ['#tour-help','Help','Open this tour again at any time.']];
function startTour(){ if(S.ch) S.ch.act='summary'; S.tour=0; render(); }
function endTour(){ S.tour=null; document.getElementById('tour')?.remove(); try{ localStorage.setItem('bl_tour_v1','1'); }catch(_){} }
function drawTour(){
  document.getElementById('tour')?.remove(); if(S.tour==null) return;
  let i=S.tour, el=null; while(i<TOUR.length && !(el=document.querySelector(TOUR[i][0]))) i++;
  if(!el){ endTour(); return; } S.tour=i; const [,title,text]=TOUR[i];
  window.scrollTo(0,0); if(el.getBoundingClientRect().top>innerHeight-140) el.scrollIntoView({block:'center'});
  const r=el.getBoundingClientRect(), pad=6, vw=innerWidth, vh=innerHeight;
  const top=Math.max(8,r.top-pad), h=Math.min(r.height+pad*2, vh-top-8);
  const card={w:Math.min(340,vw-24)}; let cy=top+h+12; if(cy+190>vh) cy=Math.max(12,top-200); let cx=Math.min(Math.max(12,r.left), vw-card.w-12);
  if(r.height>vh*0.5 && r.width<vw*0.4){ cx=Math.min(r.right+14, vw-card.w-12); cy=Math.max(12,Math.min(r.top+20, vh-220)); }
  const d=document.createElement('div'); d.id='tour'; d.setAttribute('role','dialog'); d.setAttribute('aria-label','Chart tour');
  d.innerHTML=`<div class="tour-spot" style="top:${top}px;left:${Math.max(4,r.left-pad)}px;width:${Math.min(r.width+pad*2,vw-8)}px;height:${h}px"></div>
    <div class="tour-card" style="top:${cy}px;left:${cx}px;width:${card.w}px"><span class="small muted">${i+1} of ${TOUR.length}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="row" style="justify-content:space-between"><button class="btn sm" data-act="tour-end">Skip tour</button><div class="row">${i?'<button class="btn sm" data-act="tour-prev">Back</button>':''}<button class="btn sm primary" data-act="tour-next">${i===TOUR.length-1?'Done':'Next'}</button></div></div></div>`;
  document.body.appendChild(d); d.querySelector('[data-act="tour-next"]').focus();
}
addEventListener('resize',()=>{ if(S.tour!=null) drawTour(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && S.tour!=null) endTour(); });
function render(){
  renderTop();
  const m=document.getElementById('main');
  if(S.auth==='loading'){ m.innerHTML='<div class="empty">Loading…</div>'; return; }
  m.classList.toggle('lp-window', S.auth==='login' || S.auth==='setup');
  if(S.auth==='setup'){ m.innerHTML=VIEWS.setup(); return; }
  if(S.auth==='login' && S.joinOnly){ m.innerHTML=VIEWS.join(); return; }
  if(S.auth==='login' && S.registerOnly){ m.innerHTML=VIEWS.register(); return; }
  if(S.auth==='login'){ m.innerHTML= S.orgSlug? (S.site.orgFound===false? VIEWS.collegeMissing() : VIEWS.collegeLogin()) : VIEWS.landing(); return; }
  if(S.me.mustChange){ m.innerHTML=VIEWS.forcePw(); return; }
  m.classList.toggle('ehr-window', !!S.ehrOnly); m.classList.toggle('ew-window', !!S.ehrOnly);
  if(S.refOnly){ m.innerHTML=`<section class="panel panel-pad" style="max-width:1100px;margin:0 auto">${clinicalReferenceHTML()}</section>`; return; }
  if(S.ehrOnly){ const p=S.patients[S.ehrOnly]; const ae=document.activeElement; const keep=ae?.id, pos=ae?.selectionStart, pend=ae?.selectionEnd, sc=document.querySelector('.ew-content')?.scrollTop, ssc=document.querySelector('.ew-story')?.scrollTop, tsc=ae?.tagName==='TEXTAREA'? ae.scrollTop : null;
    m.innerHTML = p? chartHTML(S.ehrOnly) : `<div class="panel empty"><b>Patient chart not found</b><span>The link may be out of date. Ask your faculty for the current assignment.</span></div>`;
    if(sc) { const c=document.querySelector('.ew-content'); if(c) c.scrollTop=sc; } if(ssc){ const c=document.querySelector('.ew-story'); if(c) c.scrollTop=ssc; }
    if(keep && /^(it-text-|ch-comments)/.test(keep)){ const n=document.getElementById(keep); if(n){ n.focus(); try{ n.setSelectionRange(pos,pend??pos); }catch(_){} if(tsc!=null) n.scrollTop=tsc; } }
    if(p && S.tour===undefined){ let seen=false; try{ seen=!!localStorage.getItem('bl_tour_v1'); }catch(_){ seen=true; } S.tour=seen? null : 0; }
    if(S.tour!=null) requestAnimationFrame(drawTour); return; }
  if(!S.route.name || !navFor(role()).some(([k])=>isSection(k))) S.route={name:navFor(role())[0][0], p:{}};
  const v=VIEWS[S.route.name]; m.innerHTML = v? v(S.route.p) : '';
}
const VIEWS={};
VIEWS.reference=()=>`<div class="page-head"><div><span class="label">Reference</span><h1>Clinical judgment reference</h1><p class="muted">The clinical judgment model used in every case, frameworks for setting priorities, SBAR, therapeutic communication, typical reference ranges and handy rules. The same reference is one click away in every patient chart.</p></div><a class="btn" href="/reference" target="_blank" rel="noopener">Open in new tab ↗</a></div>
  <section class="panel panel-pad">${clinicalReferenceHTML()}</section>`;

/* ================= sign in ================= */
const authCard=(title, sub, body)=>`<section class="auth panel panel-pad stack"><div class="stack" style="gap:4px"><h1>${title}</h1><p class="muted">${sub}</p></div>${body}</section>`;
VIEWS.login=()=>(S.orgSlug && S.site.orgFound===false? `<div class="panel empty" style="max-width:520px;margin:24px auto"><b>College not found</b><span>The address /c/${esc(S.orgSlug)} does not match a college on BedsideLab. Check the link your college sent you, or sign in below.</span></div>` : '')+authCard(S.site.orgName? `Sign in to ${esc(S.site.orgName)}` : 'Sign in','Use the email and password your college gave you.',`
  <form class="stack" data-form="login">
    <label class="field"><span>Email</span><input type="text" id="li-email" name="email" autocomplete="username" inputmode="email" required></label>
    <label class="field"><span>Password</span><input type="password" id="li-pw" name="password" autocomplete="current-password" required></label>
    <div class="row"><button class="btn primary" type="submit">Sign in</button></div>
    <p class="hint">Forgot your password? Ask your faculty (students) or the admin (faculty) to reset it.</p>
  </form>`);
VIEWS.setup=()=>authCard('Set up BedsideLab','Create the owner account. You will add colleges, each with its own admin, after signing in.',`
  <form class="stack" data-form="setup">
    <label class="field"><span>Your name</span><input type="text" id="su-name" name="name" required></label>
    <label class="field"><span>Email</span><input type="text" id="su-email" name="email" autocomplete="username" inputmode="email" required></label>
    <label class="field"><span>Password (at least 8 characters)</span><input type="password" id="su-pw" name="password" autocomplete="new-password" required></label>
    <div class="row"><button class="btn primary" type="submit">Create owner account</button></div>
  </form>`);
const pwForm=(btn)=>`<form class="stack" data-form="password">
    <label class="field"><span>Current password</span><input type="password" id="pw-cur" name="current" autocomplete="current-password" required></label>
    <label class="field"><span>New password (at least 8 characters)</span><input type="password" id="pw-new" name="next" autocomplete="new-password" required></label>
    <label class="field"><span>Repeat new password</span><input type="password" id="pw-rep" name="repeat" autocomplete="new-password" required></label>
    <div class="row"><button class="btn primary" type="submit">${btn}</button></div></form>`;
VIEWS.forcePw=()=>authCard(`Welcome, ${esc(S.me.name)}`,'You signed in with a temporary password. Choose your own password to continue.', pwForm('Save password and continue'));
VIEWS.account=()=>`
  <div class="page-head"><div><span class="label">${ROLE_LABEL[role()]}</span><h1>My account</h1></div></div>
  <section class="panel panel-pad stack" style="max-width:640px"><dl class="kv" style="padding:0"><dt>Name</dt><dd>${esc(S.me.name)}</dd><dt>Email</dt><dd>${esc(S.me.email)}</dd><dt>Role</dt><dd>${ROLE_LABEL[role()]}</dd>${role()==='student'?`<dt>Section</dt><dd>${esc(S.me.section||'Not assigned')}</dd>`:''}${S.me.expiresAt?`<dt>Organization</dt><dd>${esc(S.me.section||'—')}</dd><dt>Access ends</dt><dd>${esc(fmtEnd(S.me.expiresAt))} (${esc(daysLeft(S.me.expiresAt))})</dd>`:''}</dl></section>
  <section class="panel panel-pad stack" style="max-width:640px"><h2>Change password</h2>${pwForm('Change password')}</section>`;

/* ================= accounts ================= */
function credsBox(){
  const c=S.acct.created; if(!c || !c.length) return '';
  const ok=c.filter(r=>r.ok!==false), bad=c.filter(r=>r.ok===false);
  return `<section class="panel panel-pad stack creds"><div class="row" style="justify-content:space-between"><h2>Sign-in details to share</h2><div class="row"><button class="btn sm" data-act="dl-creds">Download as CSV</button><button class="btn sm" data-act="close-creds">Done</button></div></div>
    <p class="hint">These temporary passwords are shown only now. Each person will be asked to choose their own password at first sign-in. Share them privately.</p>
    ${ok.length? (ok.some(r=>r.user.expiresAt)
      ? tbl(['Name','Email','Organization','Access ends','Temporary password'], ok.map(r=>`<tr><td>${esc(r.user.name)}</td><td>${esc(r.user.email)}</td><td>${esc(r.user.section||'—')}</td><td>${r.user.expiresAt?esc(fmtEnd(r.user.expiresAt)):'—'}</td><td class="mono"><b>${esc(r.tempPassword)}</b></td></tr>`))
      : tbl(['Name','Email','Section','Temporary password'], ok.map(r=>`<tr><td>${esc(r.user.name)}</td><td>${esc(r.user.email)}</td><td>${esc(r.user.section||'—')}</td><td class="mono"><b>${esc(r.tempPassword)}</b></td></tr>`))):''}
    ${bad.length? `<p class="flag-H small">${bad.length} not created:</p>`+tbl(['Name','Email','Problem'], bad.map(r=>`<tr><td>${esc(r.name||'')}</td><td>${esc(r.email||'')}</td><td>${esc(r.error)}</td></tr>`)):''}
  </section>`;
}
const signInUrl=(slug=S.org?.slug)=>location.origin+(slug? '/c/'+slug : '/');
VIEWS.people=()=>{
  const fac=facultyList().sort((a,b)=>a.name.localeCompare(b.name));
  return `
  <div class="page-head"><div><span class="label">Admin</span><h1>Faculty</h1><p class="muted">Only the admin can create faculty accounts. Faculty then create their own students' accounts.</p></div><button class="btn" data-act="go" data-v="students">View students</button></div>
  ${credsBox()}
  <section class="panel panel-pad stack"><h2>Add a faculty member</h2>
    <form class="grid2" data-form="add-faculty" style="align-items:end">
      <label class="field"><span>Full name</span><input type="text" id="af-name" name="name" required></label>
      <label class="field"><span>Email (used to sign in)</span><input type="text" id="af-email" name="email" inputmode="email" required></label>
      <div><button class="btn primary" type="submit">Create faculty account</button></div>
    </form>
    <p class="hint">BedsideLab creates a temporary password for you to share. Sign-in address: <span class="mono">${esc(signInUrl())}</span></p></section>
  <section class="panel"><div class="panel-pad" style="padding-bottom:6px"><h2>Faculty <span class="count">${fac.length}</span></h2></div>
    ${fac.length? tbl(['Name','Email','Status','Students created',''], fac.map(f=>`<tr><td><div class="person">${avatar(f.id)}<span>${esc(f.name)}</span></div></td><td>${esc(f.email)}</td>
      <td>${f.active? (f.mustChange?'<span class="pill warn">Not signed in yet</span>':'<span class="pill ok">Active</span>') : '<span class="pill bad">Deactivated</span>'}</td>
      <td class="num">${students().filter(s=>s.createdBy===f.id).length}</td>
      <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="reset-pw" data-v="${esc(f.id)}">Reset password</button><button class="btn sm" data-act="toggle-active" data-v="${esc(f.id)}">${f.active?'Deactivate':'Reactivate'}</button><button class="btn sm danger" data-act="rm-user" data-v="${esc(f.id)}">Delete</button></div></td></tr>`))
      : `<div class="empty">No faculty yet. Use the form above to create the first faculty account.</div>`}</section>`;
};
VIEWS.students=()=>{
  const isAdmin=role()==='admin'; const mine=S.acct.mine && !isAdmin; const q=S.acct.q.toLowerCase();
  const all=students().filter(s=>(!mine || s.createdBy===S.me.id || S.joincodes?.[String(s.createdBy||'').slice(5)]?.createdBy===S.me.id) && (!q || (s.name+' '+s.email+' '+s.section).toLowerCase().includes(q))).sort((a,b)=>((a.section||'~')+a.name).localeCompare((b.section||'~')+b.name));
  return `
  <div class="page-head"><div><span class="label">${ROLE_LABEL[role()]}</span><h1>Students</h1><p class="muted">Create student accounts and place them in sections. Assignments go to all students or to one section.${S.org&&S.org.maxStudents? ` <b>${S.org.students} of ${S.org.maxStudents}</b> active students used on your plan.`:''}</p></div></div>
  ${credsBox()}
  <div class="grid2" style="align-items:start">
  <section class="panel panel-pad stack"><h2>Add one student</h2>
    <form class="stack" data-form="add-student">
      <label class="field"><span>Full name</span><input type="text" id="as-name" name="name" required></label>
      <label class="field"><span>Email (used to sign in)</span><input type="text" id="as-email" name="email" inputmode="email" required></label>
      <div class="grid2"><label class="field"><span>Section</span><input type="text" id="as-sec" name="section" placeholder="e.g. NURS-310 A" list="sec-list" value="${esc(S.acct.section)}"></label>
      <label class="field"><span>Team (for group activities, optional)</span><input type="text" id="as-team" name="team" placeholder="e.g. Team 1" list="team-list"></label></div>
      <div><button class="btn primary" type="submit">Create student account</button></div>
    </form></section>
  <section class="panel panel-pad stack"><h2>Import a class list</h2>
    <p class="small muted">Upload a CSV file saved from Excel with the columns <b>Name, Email, Section, Team</b> (Team is optional; header row optional), or paste the rows below.</p>
    <label class="btn sm" style="align-self:flex-start"><input type="file" id="imp-file" data-act="import-file" accept=".csv,text/csv" hidden>Choose CSV file</label>
    <form class="stack" data-form="import">
      <label class="field"><span>Or paste rows (Name, Email, Section, Team)</span><textarea id="imp-text" name="rows" rows="5" placeholder="Sara Ahmed, sara.ahmed@university.edu, NURS-310 A, Team 1"></textarea></label>
      <div><button class="btn primary" type="submit">Create accounts</button></div>
    </form></section>
  </div>
  <datalist id="sec-list">${sections().map(s=>`<option value="${esc(s)}">`).join('')}</datalist><datalist id="team-list">${teams().map(t=>`<option value="${esc(t)}">`).join('')}</datalist>
  ${joinPanel()}
  <section class="panel panel-pad stack"><h2>Teams for group activities</h2>
    <p class="small muted">Group activities (any activity marked Group activity, such as a team SBAR simulation) are done in teams: one member submits for the whole team and the grade can be given to every member. Type a team name next to each student in the roster, or make teams automatically.</p>
    <div class="row" style="align-items:flex-end"><label class="field"><span>Section</span><select id="mt-sec"><option value="">All students</option>${sections().map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
      <label class="field"><span>Students per team</span><select id="mt-size">${[2,3,4,5,6].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select></label>
      <button class="btn" data-act="make-teams">Make teams</button><button class="btn" data-act="clear-teams">Clear teams</button></div>
    ${teams().length? `<div class="row small">${teams().map(t=>{ const m=students().filter(x=>x.team===t); return `<span class="pill info">${esc(t)}: ${m.length}</span>`; }).join('')}</div>`:''}</section>
  <section class="panel"><div class="panel-pad row" style="padding-bottom:6px;justify-content:space-between"><h2>Roster <span class="count">${all.length}</span></h2>
      <div class="row">${isAdmin?'':`<label class="row small" style="gap:6px"><input type="checkbox" id="stu-mine" data-act="stu-mine" ${mine?'checked':''}> Only students I created</label>`}
      <input type="search" id="stu-q" data-act="stu-q" placeholder="Search name, email, section" value="${esc(S.acct.q)}" style="max-width:240px"></div></div>
    ${all.length? tbl(['Student','Email','Section','Team','Status','Created by','Submitted',''], all.map(p=>`<tr><td><div class="person">${avatar(p.id)}<span>${esc(p.name)}</span></div></td><td class="small">${esc(p.email)}</td>
      <td><input type="text" id="sec-${esc(p.id)}" data-act="set-sec" data-v="${esc(p.id)}" value="${esc(p.section||'')}" placeholder="Unassigned" style="width:130px" list="sec-list"></td>
      <td><input type="text" id="team-${esc(p.id)}" data-act="set-team" data-v="${esc(p.id)}" value="${esc(p.team||'')}" placeholder="No team" style="width:100px" list="team-list"></td>
      <td>${p.active? (p.mustChange?'<span class="pill warn">Not signed in yet</span>':'<span class="pill ok">Active</span>') : '<span class="pill bad">Deactivated</span>'}</td>
      <td class="small">${p.createdBy===S.me.id?'You':/^join:/.test(p.createdBy||'')?`Signed up with code <span class="mono">${esc(p.createdBy.slice(5))}</span>`:esc(name(p.createdBy))}</td>
      <td class="num">${Object.values(S.work[p.id]||{}).filter(s=>s.status==='submitted').length}</td>
      <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="reset-pw" data-v="${esc(p.id)}">Reset password</button><button class="btn sm" data-act="toggle-active" data-v="${esc(p.id)}">${p.active?'Deactivate':'Reactivate'}</button><button class="btn sm danger" data-act="rm-user" data-v="${esc(p.id)}">Delete</button></div></td></tr>`))
      : `<div class="empty">No students match. Create accounts above or import a class list.</div>`}</section>`;
};
VIEWS.guests=()=>{
  const gs=Object.values(S.guests||{}).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return `
  <div class="page-head"><div><span class="label">Admin</span><h1>Guest accounts</h1><p class="muted">Give a client or visitor time-limited, read-only access to preview BedsideLab. Guests see the activity library and the patient charts (in practice mode) and can download activity documents. They cannot see students, submissions, grades or answer keys, and cannot change anything.</p></div></div>
  ${credsBox()}
  <section class="panel panel-pad stack"><h2>Add a guest</h2>
    <form class="grid2" data-form="add-guest" style="align-items:end">
      <label class="field"><span>Full name</span><input type="text" id="ag-name" name="name" required></label>
      <label class="field"><span>Email (used to sign in)</span><input type="text" id="ag-email" name="email" inputmode="email" required></label>
      <label class="field"><span>Organization (optional)</span><input type="text" id="ag-org" name="section" placeholder="e.g. Riverside College"></label>
      <label class="field"><span>Access lasts</span><select id="ag-days" name="days">${[1,3,7,14,30].map(d=>`<option value="${d}" ${d===7?'selected':''}>${d} day${d>1?'s':''}</option>`).join('')}</select></label>
      <div><button class="btn primary" type="submit">Create guest account</button></div>
    </form>
    <p class="hint">Access ends automatically at the same time of day after the chosen number of days, even if the guest is signed in. Sign-in address: <span class="mono">${esc(signInUrl())}</span></p></section>
  <section class="panel"><div class="panel-pad" style="padding-bottom:6px"><h2>Guests <span class="count">${gs.length}</span></h2></div>
    ${gs.length? tbl(['Name','Email','Organization','Status','Access ends',''], gs.map(g=>{ const live=g.active && g.expiresAt>Date.now();
      return `<tr><td><div class="person">${avatar(g.id)}<span>${esc(g.name)}</span></div></td><td class="small">${esc(g.email)}</td><td>${esc(g.section||'—')}</td><td>${guestStatus(g)}</td>
      <td class="small">${g.expiresAt? esc(fmtEnd(g.expiresAt))+`<div class="muted">${esc(daysLeft(g.expiresAt))}</div>`:'—'}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm" data-act="extend-guest" data-v="${esc(g.id)}">${live?'Extend 7 days':'Renew 7 days'}</button>${live?`<button class="btn sm" data-act="end-guest" data-v="${esc(g.id)}">End now</button>`:''}<button class="btn sm" data-act="reset-pw" data-v="${esc(g.id)}">Reset password</button><button class="btn sm danger" data-act="rm-user" data-v="${esc(g.id)}">Delete</button></div></td></tr>`; }))
      : `<div class="empty">No guests yet. Use the form above to give a client 7 days of access.</div>`}</section>`;
};
function parseCsv(text){
  const rows=[]; for(const line of String(text).split(/\r?\n/)){ if(!line.trim()) continue;
    const cells=[]; let cur='', inq=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(inq){ if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else inq=false; } else cur+=ch; } else if(ch==='"') inq=true; else if(ch===','||ch==='\t'||ch===';'){ cells.push(cur.trim()); cur=''; } else cur+=ch; }
    cells.push(cur.trim()); rows.push(cells); }
  if(rows.length && /name/i.test(rows[0][0]||'') && /mail/i.test(rows[0][1]||'')) rows.shift();
  return rows.filter(r=>r.length>=2).map(r=>({name:r[0], email:r[1], section:r[2]||S.acct.section||'', team:r[3]||''}));
}
async function importRows(rows){
  if(!rows.length) return toast('No rows found. Use: Name, Email, Section.');
  try{ const r=await api('POST','/api/users/import',{rows}); S.acct.created=r.results; await refresh(); toast(`${r.results.filter(x=>x.ok).length} of ${rows.length} accounts created`); render(); window.scrollTo(0,0); }
  catch(e){ toast(e.message); }
}
function downloadCreds(){
  const rows=(S.acct.created||[]).filter(r=>r.ok!==false);
  const csv=['Name,Email,Section or organization,Temporary password,Sign-in address,Access ends', ...rows.map(r=>[r.user.name,r.user.email,r.user.section||'',r.tempPassword,signInUrl(),r.user.expiresAt?fmtEnd(r.user.expiresAt):''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='bedsidelab-sign-in-details.csv'; document.body.appendChild(a); a.click(); a.remove();
}


/* ================= owner console ================= */
const dayMs=864e5;
const fmtDay=t=>t? new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'No end date';
const isoDay=t=>{ if(!t) return ''; const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function orgState(o){
  if(o.status!=='active') return {k:'paused',label:'Paused',cls:'bad'};
  if(o.expiresAt && o.expiresAt<=Date.now()) return {k:'expired',label:'Ended: read-only',cls:'bad'};
  if(o.expiresAt && o.expiresAt-Date.now()<30*dayMs) return {k:'soon',label:`Ends in ${Math.max(1,Math.ceil((o.expiresAt-Date.now())/dayMs))} days`,cls:'warn'};
  return {k:'ok',label:'Active',cls:'ok'};
}
function orgLogo(o){ return o.logo? `<img class="org-logo" src="${esc(o.logo)}" alt="">` : `<span class="org-logo ph">${esc(o.name.split(/\s+/).map(w=>w[0]).filter(c=>/[A-Za-z]/.test(c)).slice(0,2).join('').toUpperCase()||'C')}</span>`; }
function ownerCreds(){
  const c=S.ocreds; if(!c) return '';
  return `<section class="panel panel-pad stack creds"><div class="row" style="justify-content:space-between"><h2>Sign-in details for ${esc(c.org)}</h2><button class="btn sm" data-act="close-ocreds">Done</button></div>
    <p class="hint">Send these to the college admin privately. The temporary password is shown only now; they choose their own at first sign-in.</p>
    ${tbl(['College sign-in address','Admin','Email','Temporary password'],[`<tr><td class="mono">${esc(signInUrl(c.slug))}</td><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td class="mono"><b>${esc(c.temp)}</b></td></tr>`])}</section>`;
}
VIEWS.colleges=()=>{
  const os=S.orgs||[]; const f=S.form&&S.form.newOrg? S.form : (S.form={newOrg:true,name:'',slug:'',adminName:'',adminEmail:'',maxStudents:'',expiresOn:''});
  const act=os.filter(o=>orgState(o).k!=='paused'), soon=os.filter(o=>['soon','expired'].includes(orgState(o).k));
  if(S.ostat===undefined){ S.ostat=null; api('GET','/api/owner/content-status').then(r=>{ S.ostat=r; scheduleRender(); }).catch(()=>{}); }
  return `
  <div class="page-head"><div><h1>Colleges</h1><p class="muted">Every college has its own address, admin, students, patient charts, look and plan. You see each college's numbers, not its students' work.</p></div></div>
  ${ownerCreds()}
  <div class="stats">
    <div class="panel stat"><span class="label">Colleges</span><b>${os.length}</b><span class="small muted">${act.length} active</span></div>
    <div class="panel stat"><span class="label">Active students</span><b>${os.reduce((a,o)=>a+o.students,0)}</b><span class="small muted">across all colleges</span></div>
    <div class="panel stat"><span class="label">Need renewal</span><b>${soon.length}</b><span class="small muted">ending within 30 days or ended</span></div>
    <div class="panel stat"><span class="label">Submissions</span><b>${os.reduce((a,o)=>a+o.submissions,0)}</b><span class="small muted">all time</span></div>
  </div>
  ${S.ostat&&S.ostat.differing? `<section class="panel panel-pad row" style="justify-content:space-between"><div><h2>Built-in content update available</h2><p class="small muted">${S.ostat.differing} built-in patient charts or activities differ from the latest version across your colleges. Updating replaces them with the latest version; colleges' own work is not changed.</p></div><button class="btn primary" data-act="owner-refresh">Update all colleges</button></section>`:''}
  <section class="panel">${os.length? tbl(['College','Status','Students','End date','Faculty','Last sign-in',''], os.map(o=>{ const st=orgState(o);
      return `<tr><td><div class="person">${orgLogo(o)}<div><b>${esc(o.name)}</b><div class="small muted mono">/c/${esc(o.slug)}${o.program?' <span class="pill info">Online program</span>':''}</div></div></div></td>
        <td><span class="pill ${st.cls}">${esc(st.label)}</span></td><td class="num">${o.students}${o.maxStudents?` / ${o.maxStudents}`:' <span class="muted small">(no limit)</span>'}</td>
        <td class="num">${esc(fmtDay(o.expiresAt))}</td><td class="num">${o.faculty}</td><td class="num">${o.lastSignIn? esc(fmtDay(o.lastSignIn)) : '<span class="muted">Never</span>'}</td>
        <td><button class="btn sm" data-act="open-college" data-v="${esc(o.id)}">Manage</button></td></tr>`; }))
    : `<div class="empty"><b>No colleges yet</b><span>Add your first college below. Its admin receives a sign-in link and a temporary password.</span></div>`}</section>
  <section class="panel panel-pad stack"><h2>Add a college</h2>
    <form class="grid2" data-form="add-org" style="align-items:end">
      <label class="field"><span>College name</span><input type="text" id="no-name" data-bind="name" data-act="org-name" value="${esc(f.name)}" required></label>
      <label class="field"><span>Web address</span><div class="addr"><span class="mono small muted">${esc(location.host)}/c/</span><input type="text" id="no-slug" data-bind="slug" value="${esc(f.slug)}" placeholder="kfu" required></div></label>
      <label class="field"><span>College admin's name</span><input type="text" id="no-an" data-bind="adminName" value="${esc(f.adminName)}" required></label>
      <label class="field"><span>College admin's email</span><input type="text" id="no-ae" data-bind="adminEmail" inputmode="email" value="${esc(f.adminEmail)}" required></label>
      <label class="field"><span>Student limit (leave empty for no limit)</span><input type="number" id="no-max" min="0" data-bind="maxStudents" value="${esc(f.maxStudents)}" placeholder="e.g. 300"></label>
      <label class="field"><span>Subscription end date (leave empty for no end date)</span><input type="date" id="no-exp" data-bind="expiresOn" value="${esc(f.expiresOn)}"></label>
      <label class="row small" style="gap:8px"><input type="checkbox" id="no-prog" data-bind="program" ${f.program?'checked':''}> Run an online certificate program (independent learners register and pay at /register)</label>
      <div><button class="btn primary" type="submit">Create college</button></div>
    </form>
    <p class="hint">BedsideLab copies all built-in patient charts and activities into the new college. The admin can then change the college's logo and colours, and add faculty and students.</p></section>`;
};
VIEWS.college=({id})=>{
  const o=(S.orgs||[]).find(x=>x.id===id); if(!o) return `<div class="empty">College not found.</div>`;
  const f=S.form&&S.form.orgId===id? S.form : (S.form={orgId:id,name:o.name,slug:o.slug,maxStudents:o.maxStudents||'',expiresOn:isoDay(o.expiresAt),contact:o.contact,notes:o.notes,newAdmin:'',newAdminEmail:''});
  const st=orgState(o);
  return `
  <div class="page-head"><div><button class="btn sm" data-act="go" data-v="colleges">← Colleges</button><div class="person" style="margin-top:10px">${orgLogo(o)}<h1>${esc(o.name)}</h1></div>
    <div class="meta"><span class="pill ${st.cls}">${esc(st.label)}</span><span class="mono">${esc(signInUrl(o.slug))}</span></div></div>
    <div class="row"><a class="btn" href="/c/${esc(o.slug)}" target="_blank" rel="noopener">Open sign-in page ↗</a></div></div>
  ${ownerCreds()}
  <div class="stats">
    <div class="panel stat"><span class="label">Students</span><b>${o.students}</b><span class="small muted">${o.maxStudents? `of ${o.maxStudents} allowed` : 'no limit'}${o.studentsTotal>o.students?` · ${o.studentsTotal-o.students} deactivated`:''}</span></div>
    <div class="panel stat"><span class="label">Faculty</span><b>${o.faculty}</b><span class="small muted">${o.guests} guest${o.guests===1?'':'s'}</span></div>
    <div class="panel stat"><span class="label">Assignments</span><b>${o.assignments}</b><span class="small muted">${o.submissions} submissions</span></div>
    <div class="panel stat"><span class="label">Subscription</span><b style="font-size:1.1rem">${esc(fmtDay(o.expiresAt))}</b><span class="small muted">${esc(st.label)}</span></div>
  </div>
  <section class="panel panel-pad stack"><div class="row" style="justify-content:space-between"><h2>Plan and details</h2>
      <div class="row"><button class="btn sm" data-act="org-extend" data-v="1">+1 month</button><button class="btn sm" data-act="org-extend" data-v="12">+12 months</button></div></div>
    <div class="grid2">
      <label class="field"><span>College name</span><input type="text" id="oe-name" data-bind="name" value="${esc(f.name)}"></label>
      <label class="field"><span>Web address</span><div class="addr"><span class="mono small muted">${esc(location.host)}/c/</span><input type="text" id="oe-slug" data-bind="slug" value="${esc(f.slug)}"></div></label>
      <label class="field"><span>Student limit (empty = no limit)</span><input type="number" id="oe-max" min="0" data-bind="maxStudents" value="${esc(f.maxStudents)}"></label>
      <label class="field"><span>Subscription end date (empty = no end date)</span><input type="date" id="oe-exp" data-bind="expiresOn" value="${esc(f.expiresOn)}"></label>
      <label class="field"><span>Billing contact</span><input type="text" id="oe-contact" data-bind="contact" value="${esc(f.contact)}" placeholder="Name, email or phone"></label>
      <label class="field"><span>Notes (only you see these)</span><input type="text" id="oe-notes" data-bind="notes" value="${esc(f.notes)}" placeholder="Invoice number, agreement, …"></label>
    </div>
    <div class="row"><button class="btn primary" data-act="org-save">Save changes</button></div>
    <p class="hint">When the end date passes, everyone at the college can still sign in and view, but nothing can be added or changed until you extend it. Changing the web address changes the college's sign-in link.</p></section>
  <section class="panel"><div class="panel-pad" style="padding-bottom:6px"><h2>College admins</h2></div>
    ${tbl(['Name','Email','Status',''], o.admins.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.email)}</td><td>${a.mustChange?'<span class="pill warn">Not signed in yet</span>':'<span class="pill ok">Active</span>'}</td><td><button class="btn sm" data-act="org-reset-admin" data-v="${esc(a.id)}">Reset password</button></td></tr>`))}
    <form class="grid2 panel-pad" data-form="add-org-admin" style="align-items:end">
      <label class="field"><span>Add another admin: name</span><input type="text" id="oa-n" data-bind="newAdmin" value="${esc(f.newAdmin)}" required></label>
      <label class="field"><span>Email</span><input type="text" id="oa-e" data-bind="newAdminEmail" inputmode="email" value="${esc(f.newAdminEmail)}" required></label>
      <div><button class="btn" type="submit">Add admin</button></div></form></section>
  <section class="panel panel-pad stack danger-zone"><h2>Pause or delete</h2>
    <div class="row" style="justify-content:space-between"><p class="small" style="max-width:70ch">${o.status==='active'? 'Pausing signs everyone at this college out and stops sign-in until you resume. Nothing is deleted.' : 'This college is paused. Resume to let its people sign in again.'}</p>
      <button class="btn ${o.status==='active'?'danger':'primary'}" data-act="org-pause">${o.status==='active'?'Pause college':'Resume college'}</button></div>
    ${o.status!=='active'? `<div class="row" style="justify-content:space-between;align-items:flex-end"><label class="field" style="max-width:360px"><span>To delete this college and all its data permanently, type <b class="mono">${esc(o.slug)}</b></span><input type="text" id="oe-del" data-bind="confirm" value="${esc(f.confirm||'')}"></label>
      <button class="btn danger" data-act="org-delete">Delete college permanently</button></div>`:''}</section>`;
};

/* ================= appearance (admin) ================= */
function themeCard(key){
  const th=THEMES[key]; const t=themeTokens({theme:key, custom:{}}).t; const on=(S.form?.theme||S.site.theme)===key;
  return `<button class="theme-card" data-act="theme-pick" data-v="${key}" aria-pressed="${on}">
    <div class="mini" style="background:${t.bg}"><div class="t" style="background:${t['topbar-bg']};border-bottom:3px solid ${t.stripe}"></div><div style="background:${t['rail-bg']}"></div>
      <div class="c"><i style="background:${t['sec-head-bg']};width:90%"></i><i style="background:${t.surface};border:1px solid ${t.line};height:14px"></i><i style="background:${t.accent};width:45%"></i></div></div>
    <span class="nm"><span>${esc(th.label)}</span>${on?'<span class="pill info">Selected</span>':''}</span>
    <span class="small muted" style="padding:0 10px 10px">${esc(th.note)}</span></button>`;
}
const APPEAR_KEYS=['theme','custom','siteName','institution','logo','showName','logoTile','topbarHeight','stripeWidth'];
function openAppearance(){ S.form={...Object.fromEntries(APPEAR_KEYS.map(k=>[k,S.site[k]])), custom:{...(S.site.custom||{})}}; }
VIEWS.appearance=()=>{
  if(!S.form || S.form.theme===undefined) openAppearance();
  const f=S.form; const cur=themeTokens(f).t; const c=f.custom||{};
  const sw=(k,label,val)=>`<label class="swatch"><input type="color" id="tc-${k}" data-act="theme-color" data-k="${k}" value="${esc(c[k]||val)}"><span><b class="small">${label}</b><br><span class="small muted mono">${esc(c[k]||val)}</span>${c[k]?` · <button class="btn sm" style="padding:0 6px" data-act="theme-color-reset" data-k="${k}">reset</button>`:''}</span></label>`;
  const pick=o=>JSON.stringify(APPEAR_KEYS.map(k=>k==='custom'?(o.custom||{}):o[k]));
  const dirty=pick(f)!==pick(S.site);
  return `
  <div class="page-head"><div><span class="label">Admin</span><h1>${role()==='owner'?'Platform appearance':'Appearance'}</h1><p class="muted">${role()==='owner'? 'The look of your owner console and the general sign-in page. Each college chooses its own look under its admin\'s Appearance page.' : 'Choose how BedsideLab looks for everyone at your college. Changes preview immediately; click Save to apply them.'}</p></div>
    <div class="row">${dirty?'<button class="btn" data-act="theme-cancel">Discard changes</button>':''}<button class="btn primary" data-act="theme-save" ${dirty?'':'disabled'}>Save for everyone</button></div></div>
  <section class="panel panel-pad stack"><h2>Theme</h2><div class="themes">${Object.keys(THEMES).map(themeCard).join('')}</div></section>
  <section class="panel panel-pad stack"><h2>Fine-tune colors</h2><p class="hint">Optional. Start from a theme, then match your institution's colors. Text colors adjust automatically for readability.</p>
    <div class="swatches">${sw('topbar','Top bar',cur['topbar-bg'])}${sw('rail','Side menu',cur['rail-bg'])}${sw('accent','Buttons and highlights',cur.accent)}${sw('ehrnav','Secondary menus',cur['ehrnav-bg'])}</div></section>
  <section class="panel panel-pad stack"><h2>Logo and top bar</h2>
    <div class="logo-row"><div class="logo-prev ${f.logo&&f.logoTile!==false?'tile':''}" style="background:var(--topbar-bg)">${f.logo?`<img src="${esc(f.logo)}" alt="Current logo">`:`<span class="brand-mark">${MARK_SVG}</span>`}</div>
      <div class="stack" style="gap:8px"><div class="row"><label class="btn sm"><input type="file" id="ap-logo" data-act="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>${f.logo?'Replace logo':'Upload logo'}</label>${f.logo?'<button class="btn sm" data-act="logo-remove">Remove logo</button>':''}</div>
        <p class="hint">PNG, JPG, WebP or SVG. A wide logo with a transparent background works best; large images are resized automatically.</p>
        ${f.logo?`<label class="row small" style="gap:6px"><input type="checkbox" id="ap-tile" data-act="theme-bool" data-k="logoTile" ${f.logoTile!==false?'checked':''}> Show the logo on a white background (use for dark logos)</label>
        <label class="row small" style="gap:6px"><input type="checkbox" id="ap-showname" data-act="theme-bool" data-k="showName" ${f.showName!==false?'checked':''}> Show the site name next to the logo</label>`:''}</div></div>
    <div class="grid2">
      <label class="field"><span>Top bar height <b class="small" id="v-topbarHeight">${+f.topbarHeight||60} px</b></span><input type="range" id="ap-h" min="48" max="96" step="2" data-act="theme-num" data-k="topbarHeight" value="${+f.topbarHeight||60}"><span class="hint">48 px is compact; 60 px is standard; 80 px and above suits a tall logo.</span></label>
      <label class="field"><span>Accent line under the top bar <b class="small" id="v-stripeWidth">${f.stripeWidth??3} px</b></span><input type="range" id="ap-s" min="0" max="8" step="1" data-act="theme-num" data-k="stripeWidth" value="${f.stripeWidth??3}"><span class="hint">Set to 0 to remove the line.</span></label></div></section>
  <section class="panel panel-pad stack" style="max-width:760px"><h2>Name shown in the top bar</h2>
    <div class="grid2"><label class="field"><span>Site name</span><input type="text" id="ap-name" data-act="theme-text" data-k="siteName" maxlength="40" value="${esc(f.siteName||'')}"></label>
      <label class="field"><span>Institution or program</span><input type="text" id="ap-inst" data-act="theme-text" data-k="institution" maxlength="90" value="${esc(f.institution||'')}" placeholder="e.g. King Faisal University · College of Nursing"></label></div></section>
  <section class="panel"><div class="panel-pad" style="padding-bottom:0"><h2>Preview</h2><p class="hint">Buttons, highlights and tables as everyone will see them. The patient chart keeps its own EHR layout.</p></div>
    <div class="panel-pad stack"><div class="row"><button class="btn primary" type="button">Open patient chart</button><button class="btn" type="button">Save answers</button><span class="pill ok">Correct</span><span class="pill warn">2 to grade</span><span class="pill info">Open</span></div>
    ${tbl(['Unit','Activities','Items'],[['Unit 1 · Communication and noticing',5,38],['Unit 2 · Analyzing and prioritizing',6,48],['Unit 3 · Taking action',8,62]].map(r=>`<tr>${r.map(v=>`<td class="num">${esc(v)}</td>`).join('')}</tr>`))}</div></section>`;
};

/* ================= Admin ================= */
function contentPanel(){
  const c=S.cstat;
  if(c===undefined){ S.cstat=null; api('GET','/api/admin/content-status').then(r=>{ S.cstat=r; scheduleRender(); }).catch(()=>{ S.cstat={error:true}; scheduleRender(); }); }
  const n=c&&!c.error? c.patients+c.library+c.files : 0;
  return `<section class="panel panel-pad stack"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Built-in content</h2>
    <p class="small muted" style="max-width:70ch">The patient charts, library activities and documents that come with BedsideLab. After installing an update, use this to bring them up to the latest version. Your accounts, assignments, submissions, grades and any charts or activities you created are not changed.</p></div>
    ${!c? '<span class="small muted">Checking…</span>' : c.error? '<span class="small muted">Could not check.</span>' : n? `<button class="btn primary" data-act="refresh-content">Update built-in content</button>` : '<span class="pill ok">Up to date</span>'}</div>
    ${c&&!c.error&&n? `<p class="small">${[c.patients&&`${c.patients} patient chart${c.patients>1?'s':''}`, c.library&&`${c.library} library activit${c.library>1?'ies':'y'}`, c.files&&`${c.files} document${c.files>1?'s':''}`].filter(Boolean).join(', ')} differ from the latest version. <span class="muted">If you edited a built-in chart or activity yourself, updating replaces your edit with the latest version.</span></p>`:''}</section>`;
}
VIEWS.overview=()=>{
  const st=students(), fac=facultyList(), asg=allAssignments();
  let toGrade=0, submitted=0; const recent=[];
  for(const [sid,subs] of Object.entries(S.work)) for(const [aid,s] of Object.entries(subs)){ if(s.status==='submitted'){ submitted++; if(!grade(sid,aid)) toGrade++; if(S.assignments[aid]) recent.push({sid,aid,s}); } }
  recent.sort((a,b)=>b.s.submittedAt-a.s.submittedAt);
  return `
  <div class="page-head"><div><span class="label">Program overview</span><h1>${esc(S.org?.name||'Nursing Clinical Judgment Practicum')}</h1><p class="muted">Every student, assignment and submission in one place. Sign-in address for your college: <span class="mono">${esc(signInUrl())}</span></p></div>
    <div class="row"><button class="btn" data-act="go" data-v="people">Manage people</button><button class="btn primary" data-act="go" data-v="library">Assign from library</button></div></div>
  <div class="stats">
    <div class="panel stat"><span class="label">Students</span><b>${st.length}</b><span class="small muted">${sections().length} section${sections().length===1?'':'s'}</span></div>
    <div class="panel stat"><span class="label">Faculty</span><b>${fac.length}</b><span class="small muted">plus you as admin</span></div>
    <div class="panel stat"><span class="label">Library activities</span><b>${Object.keys(S.library).length}</b><span class="small muted">${asg.length} assigned</span></div>
    <div class="panel stat"><span class="label">Awaiting grading</span><b>${toGrade}</b><span class="small muted">of ${submitted} submitted</span></div>
  </div>
  <section class="panel"><div class="panel-pad" style="padding-bottom:6px"><h2>Completion by assignment</h2></div>
    ${asg.length? tbl(['Assignment','Section','Due','Submitted','Graded',''], asg.map(a=>{ const ts=targetStudents(a); const n=ts.length; const sb=ts.filter(s=>sub(s.id,a.id)?.status==='submitted'||grade(s.id,a.id)).length; const gr=ts.filter(s=>grade(s.id,a.id)).length;
      return `<tr><td>${esc(a.title)}</td><td>${a.target==='all'?'All':esc(a.target)}</td><td class="num">${fmtDate(a.due)}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar" style="width:90px"><i style="width:${n?sb/n*100:0}%"></i></div><span class="mono small">${sb}/${n}</span></div></td><td class="num">${gr}/${n}</td><td><button class="btn sm" data-act="review" data-v="${a.id}">Review</button></td></tr>`; })) : `<div class="empty">Nothing assigned yet. Pick an activity from the library to assign it.</div>`}</section>
  <section class="panel"><div class="panel-pad" style="padding-bottom:6px"><h2>Recent submissions</h2></div>
    ${recent.length? tbl(['Student','Assignment','Submitted','Status',''], recent.slice(0,8).map(({sid,aid,s})=>{ const a={id:aid,...S.assignments[aid]}; const st=studentStatus(sid,a);
      return `<tr><td><div class="person">${avatar(sid)}${esc(name(sid))}</div></td><td>${esc(a.title)}</td><td class="num">${fmtWhen(s.submittedAt)}</td><td><span class="pill ${st.cls}">${esc(st.label)}</span></td><td><button class="btn sm" data-act="grade" data-v="${aid}" data-s="${sid}">${st.k==='graded'?'Open':'Grade'}</button></td></tr>`; })) : `<div class="empty">Submissions will appear here as students upload their completed documents.</div>`}</section>
  ${role()==='admin'? contentPanel() : ''}`;
};
/* ================= Library ================= */
/* card picture: the lab's own image, or a generated tile for activities without one */
function labImg(a, cls='card-img'){ if(a.image) return `<img class="${cls}" src="${esc(a.image)}" alt="" loading="lazy" width="120" height="120">`; const n=/^Case (\d+)/.exec(a.title||''); return `<div class="${cls} gen" style="--c:${colorFor(a.group||a.title||'x')}" aria-hidden="true"><b>${esc(n? 'CASE '+n[1] : 'RN')}</b></div>`; }
function libList(){ return Object.entries(S.library).map(([id,t])=>({id,...t})).sort((a,b)=>(a.order??9999)-(b.order??9999) || (a.title||'').localeCompare(b.title||'')); }
function wbBtn(a, cls='btn sm'){ const h=wbHref(a); return h? `<a class="${cls}" href="${esc(h)}" target="_blank" rel="noopener">Open patient chart ↗</a>` : ''; }
const ready = t => (t.docs||[]).length>0 && !!ptOf(t);
function libFiltered(){
  const q=S.lib.q.toLowerCase();
  return libList().filter(t=>(S.lib.cat==='All'||(t.group||'Other')===S.lib.cat) && (!S.lib.tag || (t.tags||[]).includes(S.lib.tag)) && (!S.lib.level || t.level===S.lib.level) && (!S.lib.readyOnly || ready(t)) && (!q || (t.title+' '+(t.description||'')+' '+(t.tags||[]).join(' ')+' '+(t.cjmm||[]).join(' ')).toLowerCase().includes(q)));
}
VIEWS.library=()=>{
  const all=libList(); const groups=['All',...new Set(all.map(t=>t.group||'Other'))];
  const tags=[...new Set(all.flatMap(t=>t.tags||[]))].sort();
  const list=libFiltered(); const sel=S.sel; const nReady=all.filter(ready).length;
  return `
  <div class="page-head"><div><span class="label">${isGuest()?'Guest preview':'Faculty'}</span><h1>Activity library</h1><p class="muted">${isGuest()?'Each case-based activity comes with a patient chart (EHR) with a handoff report, a Word activity document for students and clinical judgment items. Open a chart to see what students work with.':'Case-based activities built on multi-faceted patient charts. Students sort competing needs by urgency and make simple to complex clinical judgments, just like in practice. Tick the activities you want, then assign them: each student gets the patient chart, the clinical judgment items (scored automatically, with open responses for you to grade) and the Word activity document.'}</p></div>
    ${isGuest()?'':'<button class="btn" data-act="new-tpl">New activity</button>'}</div>
  <div class="stack" style="gap:10px">
    <div class="row" style="justify-content:space-between">
      <div class="chips" role="group" aria-label="Group">${groups.map(c=>`<button class="chip" data-act="lib-cat" data-v="${esc(c)}" aria-pressed="${S.lib.cat===c}">${esc(c)} <span class="count">${c==='All'?all.length:all.filter(t=>(t.group||'Other')===c).length}</span></button>`).join('')}</div>
      <input type="search" id="lib-q" data-act="lib-q" placeholder="Search title, topic or tag" value="${esc(S.lib.q)}" style="max-width:280px" autocomplete="off">
    </div>
    <div class="row small"><span class="muted">Level</span><select id="lib-level" data-act="lib-level" style="width:auto"><option value="">Any</option>${[...new Set(all.map(t=>t.level).filter(Boolean))].sort().map(t=>`<option ${S.lib.level===t?'selected':''}>${esc(t)}</option>`).join('')}</select><span class="muted">Tag</span><select id="lib-tag" data-act="lib-tag" style="width:auto"><option value="">Any</option>${tags.map(t=>`<option ${S.lib.tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
      ${isGuest()?'':`<label class="row small" style="gap:6px"><input type="checkbox" id="lib-ready" data-act="lib-ready" ${S.lib.readyOnly?'checked':''}> Ready to assign only <span class="count">${nReady}</span></label>`}
      <span class="muted">· ${list.length} shown</span>
      ${isGuest()?'':`${list.length? `<button class="btn sm" data-act="sel-all">Select all shown</button>`:''}${sel.size? `<button class="btn sm" data-act="sel-none">Clear selection</button>`:''}`}</div>
  </div>
  ${list.length? `<div class="lib">${list.map(t=>{ const on=sel.has(t.id); const used=Object.values(S.assignments).filter(a=>a.templateId===t.id).length; const ok=ready(t);
    return `<article class="card box ${on?'on':''}">${labImg(t)}
      ${isGuest()?'':`<label class="pick"><input type="checkbox" id="pick-${t.id}" data-act="pick" data-v="${t.id}" ${on?'checked':''}> <span>${on?'Selected':'Select'}</span></label>`}
      <div class="row">${t.group?`<span class="pill info">${esc(t.group.replace(/ · .*/,''))}</span>`:''}${t.level?`<span class="pill ${/Evaluate/.test(t.level)?'warn':''}">${esc(t.level)}</span>`:''}${t.teamwork?'<span class="pill warn">Group activity</span>':''}${isGuest()?'':ok?'':`<span class="pill warn">${[!(t.docs||[]).length&&'document',!ptOf(t)&&'patient chart'].filter(Boolean).join(' + ').replace(/^./,c=>'Needs '+c)}</span>`}${used&&!isGuest()?`<span class="pill">Assigned ${used}×</span>`:''}</div>
      <h3>${esc(t.title)}</h3>
      ${t.description?`<p class="small muted clamp">${esc(t.description)}</p>`:''}
      ${(t.tags||[]).length?`<div class="tags">${t.tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
      <div class="meta"><span>${ptOf(t)? '🩺 '+esc(wbLabel(t))+(S.patients[ptOf(t)].setting?' · '+esc(S.patients[ptOf(t)].setting):'') : 'No patient chart yet'}</span>${nChecks(t)?`<span>✓ ${nChecks(t)} items</span>`:''}${(t.cjmm||[]).length?`<span>${esc(t.cjmm.join(' · '))}</span>`:''}</div>
      <div class="foot">${isGuest()? ((t.docs||[]).length?`<a class="btn sm" href="/api/files/${esc(t.docs[0].fid)}" download>Download document</a>`:'') : `<button class="btn sm" data-act="edit-tpl" data-v="${t.id}">${ready(t)?'Edit activity':'Set up'}</button>`}${wbBtn(t)}</div></article>`; }).join('')}</div>`
  : `<div class="panel empty"><b>No activities match</b><span>Clear a filter, or create a new activity.</span></div>`}
  ${sel.size && !isGuest()? `<div class="selbar"><span><b>${sel.size}</b> selected${[...sel].some(id=>S.library[id]&&!ready(S.library[id]))?' · some need a document or link':''}</span><button class="btn primary" data-act="assign-sel">Assign selected</button></div>`:''}`;
};
function openAssign(tids){ S.form={tids, due:'', target:'all'}; S.route={name:'assign',p:{}}; render(); window.scrollTo(0,0); }
VIEWS.assign=()=>{
  const f=S.form; const items=f.tids.map(id=>({id,...S.library[id]})).filter(t=>t.title);
  const okN=items.filter(ready).length;
  return `
  <div class="page-head"><div><button class="btn sm" data-act="go" data-v="library">← Library</button><span class="label" style="margin-top:8px">Assign to students</span><h1>${items.length===1? esc(items[0].title) : `${items.length} activities`}</h1></div></div>
  <section class="panel panel-pad stack" style="max-width:860px">
    <div class="grid2">
      <label class="field"><span>Assign to</span><select id="as-target" data-bind="target"><option value="all">All students</option>${sections().map(s=>`<option value="${esc(s)}" ${f.target===s?'selected':''}>Section ${esc(s)}</option>`).join('')}</select></label>
      <label class="field"><span>Due date</span><input type="date" id="as-due" data-bind="due" value="${esc(f.due)}"></label>
    </div>
    <div class="stack" style="gap:6px"><span class="label">Each student will receive</span>
      ${tbl(['Activity','Patient chart','Items','Document',''], items.map(t=>`<tr><td><b>${esc(t.title)}</b></td>
        <td>${wbHref(t)? `<a href="${esc(wbHref(t))}" target="_blank" rel="noopener">${esc(wbLabel(t))}</a>` : '<span class="flag-H">Missing</span>'}</td>
        <td class="num">${nChecks(t)||'—'}</td>
        <td>${(t.docs||[]).length? esc(t.docs.map(d=>d.name).join(', ')) : '<span class="flag-H">Missing</span>'}</td>
        <td>${ready(t)? '<span class="pill ok">Ready</span>' : `<button class="btn sm" data-act="edit-tpl" data-v="${t.id}">Fix</button>`}</td></tr>`))}
      <label class="row small" style="gap:6px"><input type="checkbox" id="as-show" data-bind="showCheck" ${f.showCheck?'checked':''}> Practice mode: students see their score, the correct answers and the rationales after they save (leave off for graded work: they see them once you grade)</label>
      ${okN<items.length? `<p class="hint">${items.length-okN} activit${items.length-okN===1?'y is':'ies are'} missing a document or patient chart and will be skipped. Use Fix to add it.</p>`:''}
    </div>
    <div class="row"><button class="btn" data-act="go" data-v="library">Cancel</button><button class="btn primary" data-act="do-assign" ${okN?'':'disabled'}>Assign ${okN} activit${okN===1?'y':'ies'}</button></div>
  </section>`;
};
async function doAssign(){
  const f=S.form; if(!f.due && !S.program) return toast('Choose a due date.');
  const items=f.tids.map(id=>({id,...S.library[id]})).filter(t=>t.title && ready(t));
  if(!items.length) return toast('None of the selected activities has both a document and a patient chart yet.');
  let n=0;
  for(const t of items){
    const a={teamwork:!!t.teamwork, title:t.title, category:t.group||'', description:t.description||'', instructions:t.instructions||'', scenario:t.scenario||'', cjmm:t.cjmm||[], level:t.level||'', docs:t.docs, keyDocs:t.keyDocs||[], patient:t.patient, ...(t.image?{image:t.image}:{}), items:t.items||[], showCheck:!!f.showCheck, points:t.points||100, due:f.due, target:f.target||'all', templateId:t.id, createdAt:Date.now(), createdBy:S.me.id};
    if(await API.saveAssignment('a'+uid(), a)) n++; else break;
  }
  if(n){ toast(`Assigned ${n} activit${n===1?'y':'ies'}. Students can see ${n===1?'it':'them'} now.`); S.sel.clear(); go('assignments'); }
}

/* ================= Assigned work ================= */
VIEWS.assignments=()=>{
  const asg=allAssignments();
  return `
  <div class="page-head"><div><span class="label">Coursework</span><h1>Assigned work</h1><p class="muted">Activities currently assigned to students.</p></div>
    <div class="row"><button class="btn" data-act="new-asg">One-off assignment</button><button class="btn primary" data-act="go" data-v="library">Assign from library</button></div></div>
  <section class="panel">${asg.length? asg.map(a=>{
    const n=targetStudents(a).length;
    const subs=Object.keys(S.work).filter(sid=>sub(sid,a.id)?.status==='submitted').length;
    const toGrade=Object.keys(S.work).filter(sid=>sub(sid,a.id)?.status==='submitted' && !grade(sid,a.id)).length;
    return `<div class="asg">${labImg(a,'asg-img')}<div class="stack" style="gap:6px;min-width:0;flex:1">
      <div class="row">${a.due&&a.due<TODAY?'<span class="pill">Closed</span>':'<span class="pill info">Open</span>'}${toGrade?`<span class="pill warn">${toGrade} to grade</span>`:''}</div>
      <h3>${esc(a.title)}</h3>
      <div class="meta"><span>Due ${fmtDate(a.due)}</span><span>${a.target==='all'?'All students':'Section '+esc(a.target)}</span><span>Patient: ${esc(wbLabel(a)||'none')}</span>${nChecks(a)?`<span>${nChecks(a)} items</span>`:''}<span>${a.points||100} pts</span><span>${subs}${n?'/'+n:''} submitted</span></div>
    </div><div class="row"><button class="btn" data-act="edit-asg" data-v="${a.id}">Edit</button><button class="btn primary" data-act="review" data-v="${a.id}">Submissions</button></div></div>`; }).join('')
  : `<div class="empty"><b>Nothing assigned yet</b><span>Pick an activity from the library and assign it to a section.</span><button class="btn primary" data-act="go" data-v="library">Open library</button></div>`}</section>`;
};

/* ---------- builder ---------- */
const TYPE_LABEL={mcq:'Multiple choice', sata:'Select all that apply', rank:'Prioritize (put in order)', matrix:'Matrix', cloze:'Drop-down (cloze)', highlight:'Highlight the findings', bowtie:'Bow-tie', text:'Open response'};
const CJMM=['Recognize cues','Analyze cues','Prioritize hypotheses','Generate solutions','Take action','Evaluate outcomes'];
/* deterministic shuffle for rank items (the same function as the server's scoring.js) */
function seededOrder(n, seedText){ let h=2166136261; for(const ch of String(seedText)){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; }
  const idx=Array.from({length:n},(_,i)=>i); for(let i=n-1;i>0;i--){ h=Math.imul(h^(h>>>13),1274126177)>>>0; const j=h%(i+1); [idx[i],idx[j]]=[idx[j],idx[i]]; }
  if(n>1 && idx.every((x,i)=>x===i)) idx.push(idx.shift()); return idx; }
const nums = t => String(t||'').split(/[\s,;]+/).filter(Boolean).map(x=>parseInt(x,10)-1).filter(x=>x>=0);
const linesOf = t => String(t||'').split('\n').map(x=>x.trim()).filter(Boolean);
/* stored item -> editor fields (numbers are 1-based for faculty) */
function itemToEd(it){
  const e={type:it.type, q:it.q||'', cjmm:it.cjmm||'', rationale:it.rationale||''};
  if(['mcq','sata','highlight'].includes(it.type)){ e.options=(it.options||[]).join('\n'); e.key=Array.isArray(it.key)? it.key.map(k=>k+1).join(', ') : it.key!=null? String(it.key+1) : ''; }
  if(it.type==='rank') e.options=(it.key||[]).map(i=>it.options[i]).join('\n');
  if(it.type==='matrix'){ e.rows=(it.rows||[]).join('\n'); e.cols=(it.cols||[]).join('\n'); e.key=(it.key||[]).map(k=>k+1).join(', '); }
  if(it.type==='cloze') e.text=String(it.text||'').replace(/\{(\d+)\}/g,(m,i)=>{ const b=(it.blanks||[])[+i]; return b? '[['+b.options.map((o,j)=>(j===b.key?'*':'')+o).join(' | ')+']]' : m; });
  if(it.type==='bowtie'){ e.conditions=(it.conditions||[]).join('\n'); e.actions=(it.actions||[]).join('\n'); e.monitors=(it.monitors||[]).join('\n'); e.keyC=it.key? String(it.key.c+1):''; e.keyA=(it.key?.a||[]).map(k=>k+1).join(', '); e.keyM=(it.key?.m||[]).map(k=>k+1).join(', '); }
  if(it.type==='text'){ e.model=it.model||''; e.points=it.points??4; e.rows=it.rows??''; }
  return e;
}
/* editor fields -> stored item */
function edToItem(e, n){
  const it={n, type:e.type, q:String(e.q||'').trim(), ...(e.cjmm?{cjmm:e.cjmm}:{}), ...(String(e.rationale||'').trim()?{rationale:String(e.rationale).trim()}:{})};
  if(['mcq','sata','highlight'].includes(e.type)){ it.options=linesOf(e.options); const k=nums(e.key); it.key= e.type==='mcq'? (k[0]??null) : [...new Set(k)].sort((a,b)=>a-b); }
  if(e.type==='rank'){ const correct=linesOf(e.options); const order=seededOrder(correct.length, it.q+correct.join('|')); it.options=order.map(i=>correct[i]); it.key=correct.map((_,ci)=>order.indexOf(ci)); }
  if(e.type==='matrix'){ it.rows=linesOf(e.rows); it.cols=linesOf(e.cols); it.key=nums(e.key); }
  if(e.type==='cloze'){ const blanks=[]; it.text=String(e.text||'').replace(/\[\[([^\]]+)\]\]/g,(m,body)=>{ const opts=body.split('|').map(x=>x.trim()).filter(Boolean); let key=opts.findIndex(o=>o.startsWith('*')); if(key<0) key=0; blanks.push({options:opts.map(o=>o.replace(/^\*/,'').trim()), key}); return '{'+(blanks.length-1)+'}'; }); it.blanks=blanks; }
  if(e.type==='bowtie'){ it.conditions=linesOf(e.conditions); it.actions=linesOf(e.actions); it.monitors=linesOf(e.monitors); const a=nums(e.keyA), m=nums(e.keyM); it.key={c:nums(e.keyC)[0]??null, a, m}; it.pick={a:a.length||2, m:m.length||2}; }
  if(e.type==='text'){ it.model=String(e.model||'').trim(); it.points=Math.max(0,+e.points||0); if(+e.rows) it.rows=+e.rows; }
  return it;
}
function openBuilder(kind, id){
  const src = id? clone(kind==='template'? S.library[id] : S.assignments[id]) : null;
  const base = src || {title:'', group:'My activities', tags:[], description:'', level:'Apply/Analyze', instructions:'', scenario:'', cjmm:[], docs:[], keyDocs:[], patient:'', items:[], points:100, due:'', target:'all'};
  S.form={kind, id:id||null, ...base, docs:base.docs||[], keyDocs:base.keyDocs||[], items:(base.items||[]).map(itemToEd), patient:base.patient||'', cjmmText:(base.cjmm||[]).join(', ')};
  S.testRes=null; S.route={name:'builder', p:{}}; render(); window.scrollTo(0,0);
}
function itemEdHTML(e, i, total){
  const r=(S.testRes||{})[i]; const f=(k,label,rows,ph='',mono=false)=>`<label class="field"><span>${label}</span><textarea id="it-${k}-${i}" data-bind="items.${i}.${k}" rows="${rows}" placeholder="${esc(ph)}" ${mono?'class="mono"':''}>${esc(e[k]??'')}</textarea></label>`;
  const inp=(k,label,ph='',w='')=>`<label class="field" ${w?`style="max-width:${w}"`:''}><span>${label}</span><input type="text" id="it-${k}-${i}" data-bind="items.${i}.${k}" value="${esc(e[k]??'')}" placeholder="${esc(ph)}"></label>`;
  let body='';
  if(['mcq','sata','highlight'].includes(e.type)) body=f('options', e.type==='highlight'?'Findings to choose from (one per line, as they appear in the chart)':'Options (one per line)',5)+inp('key', e.type==='mcq'?'Correct option number':'Correct option numbers (for example 1, 3, 4)', e.type==='mcq'?'2':'1, 3, 4','320px');
  if(e.type==='rank') body=f('options','Options in the CORRECT order, highest priority first (students see them shuffled)',5);
  if(e.type==='matrix') body=`<div class="grid2">${f('rows','Rows (one per line)',5)}${f('cols','Columns (one per line, for example Indicated / Not indicated)',3)}</div>`+inp('key','Correct column number for each row, in row order','1, 2, 1, 2','360px');
  if(e.type==='cloze') body=f('text','Sentence with drop-downs: [[choice | *correct choice | choice]]',4,'The client is most likely experiencing [[anxiety | *hypoglycemia | a stroke]], so the nurse first [[*checks the glucose | calls the provider]].');
  if(e.type==='bowtie') body=`<div class="grid2">${f('conditions','Possible conditions (one per line)',4)}${inp('keyC','Correct condition number','2','200px')}</div><div class="grid2">${f('actions','Actions (one per line)',5)}${f('monitors','Parameters to monitor (one per line)',5)}</div><div class="grid2">${inp('keyA','Correct action numbers (usually 2)','1, 4','260px')}${inp('keyM','Correct parameter numbers (usually 2)','2, 3','260px')}</div>`;
  if(e.type==='text') body=f('model','Model answer (faculty only; shown to students after grading or in practice mode)',4)+`<div class="row">${inp('points','Points','4','120px')}${inp('rows','Answer box lines','6','140px')}</div>`;
  return `<div class="builder-task check-ed"><div class="row" style="justify-content:space-between"><b>Item ${i+1} · ${esc(TYPE_LABEL[e.type]||e.type)}</b><div class="row" style="gap:6px"><button class="btn sm" data-act="mv-check" data-v="${i}" data-d="-1" ${i?'':'disabled'}>▲</button><button class="btn sm" data-act="mv-check" data-v="${i}" data-d="1" ${i<total-1?'':'disabled'}>▼</button><button class="btn sm danger" data-act="rm-check" data-v="${i}">Remove</button></div></div>
    <div class="row" style="align-items:flex-end"><label class="field"><span>Item type</span><select id="it-type-${i}" data-bind="items.${i}.type" data-rerender>${Object.entries(TYPE_LABEL).map(([k,l])=>`<option value="${k}" ${e.type===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Clinical judgment step</span><select id="it-cj-${i}" data-bind="items.${i}.cjmm"><option value="">—</option>${CJMM.map(c=>`<option ${e.cjmm===c?'selected':''}>${c}</option>`).join('')}</select></label></div>
    ${f('q','Question shown to students',2)}${body}
    ${f('rationale', e.type==='text'? 'Grading guidance (faculty only)' : 'Rationale (faculty only; shown to students after grading or in practice mode)',2)}
    ${r? `<p class="small">${r.errors.length? `<span class="pill bad">Fix</span> ${esc(r.errors.join('; '))}` : `<span class="pill ok">Ready</span> worth ${r.max} point${r.max===1?'':'s'}`}</p>`:''}</div>`;
}
function checksEditorHTML(f){
  return `${f.items.map((e,i)=>itemEdHTML(e,i,f.items.length)).join('')}
    <div class="row"><select id="add-type" aria-label="Type of item to add">${Object.entries(TYPE_LABEL).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select><button class="btn sm" data-act="add-check">+ Add item</button>${f.items.length?`<button class="btn sm" data-act="test-checks">Check items</button>`:''}</div>`;
}
VIEWS.builder=()=>{
  const f=S.form; const isT=f.kind==='template'; const pts=Object.entries(S.patients); const up=S.upload;
  const uploader=(slot,label,hint)=>`<label class="btn sm" style="align-self:flex-start"><input type="file" id="up-${slot}" data-act="upload" data-slot="${slot}" accept=".docx,.pdf,.xlsx,.pptx,.png,.jpg,.jpeg" hidden>${label}</label>${up?.slot===slot?`<span class="small muted">Uploading ${esc(up.name)}… ${Math.round(up.p*100)}%</span>`:''}<span class="hint">${hint}</span>`;
  return `
  <div class="page-head"><div><button class="btn sm" data-act="go" data-v="${isT?'library':'assignments'}">← ${isT?'Library':'Assigned work'}</button><span class="label" style="margin-top:8px">${isT?(f.id?'Edit library activity':'New library activity'):(f.id?'Edit assignment':'One-off assignment')}</span><h1>${esc(f.title)||'Untitled activity'}</h1></div>
    <div class="row">${f.id?'<button class="btn danger" data-act="del-built">Delete</button>':''}${!isT?'<button class="btn" data-act="save-as-tpl">Save copy to library</button>':''}<button class="btn primary" data-act="save-built">${isT?'Save to library':(f.id?'Save changes':'Assign to students')}</button></div></div>
  <section class="panel panel-pad stack">
    <label class="field"><span>Title</span><input type="text" id="b-title" data-bind="title" value="${esc(f.title)}" placeholder="e.g. Case 34: Sickle Cell Crisis: Pain and Hydration Priorities"></label>
    <div class="grid2">
      ${isT? `<label class="field"><span>Unit or group</span><input type="text" id="b-grp" data-bind="group" value="${esc(f.group||'')}" list="grp-list"><datalist id="grp-list">${[...new Set(['My activities',...Object.values(S.library).map(t=>t.group).filter(Boolean)])].map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field"><span>Tags (comma separated)</span><input type="text" id="b-tags" data-bind="tagsText" value="${esc(f.tagsText??(f.tags||[]).join(', '))}" placeholder="Inpatient, Cardiovascular, Older adult"></label>
        <label class="field"><span>Level</span><select id="b-level" data-bind="level">${['Apply/Analyze','Evaluate/Create'].map(l=>`<option ${f.level===l?'selected':''}>${l}</option>`).join('')}</select></label>`
      : `<label class="field"><span>Due date</span><input type="date" id="b-due" data-bind="due" value="${esc(f.due)}"></label>
        <label class="field"><span>Assign to</span><select id="b-target" data-bind="target"><option value="all">All students</option>${sections().map(s=>`<option value="${esc(s)}" ${f.target===s?'selected':''}>Section ${esc(s)}</option>`).join('')}</select></label>`}
      <label class="field"><span>Clinical judgment steps practiced (comma separated)</span><input type="text" id="b-cj" data-bind="cjmmText" value="${esc(f.cjmmText||'')}" placeholder="Recognize cues, Prioritize hypotheses, Take action"></label>
      <label class="field"><span>Points</span><input type="number" min="1" id="b-pts" data-bind="points" value="${esc(f.points)}"></label>
      <label class="row small" style="gap:6px;align-self:end"><input type="checkbox" id="b-team" data-bind="teamwork" ${f.teamwork?'checked':''}> Group activity: students work in teams (set on the Students page); one member submits for the team</label>
    </div>
    ${isT?`<label class="field"><span>Description shown on the library card</span><textarea id="b-desc" data-bind="description" rows="3">${esc(f.description||'')}</textarea></label>`:`<label class="row small" style="gap:6px"><input type="checkbox" id="b-show" data-bind="showCheck" ${f.showCheck?'checked':''}> Practice mode: students see their score, the answers and the rationales after saving</label>`}
    <label class="field"><span>Case scenario shown above the items (optional)</span><textarea id="b-scen" data-bind="scenario" rows="3" placeholder="You are the nurse caring for… at the start of the day shift.">${esc(f.scenario||'')}</textarea></label>
    <label class="field"><span>Short instructions shown on the assignment page (optional)</span><textarea id="b-ins" data-bind="instructions" rows="2" placeholder="Review the chart and the handoff report, answer the items in the Activity tab, then upload the completed document.">${esc(f.instructions)}</textarea></label>
  </section>
  <section class="panel panel-pad stack"><h2>1 · Patient chart</h2><p class="muted small">The electronic health record students review for this activity. It opens in a new tab with the handoff report, notes, assessment, vital signs, results, MAR and orders.</p>
    <div class="row" style="align-items:flex-end"><label class="field" style="flex:1;min-width:220px"><span>Patient</span><select id="b-pt" data-bind="patient" data-rerender><option value="">Choose a patient chart…</option>${pts.sort((a,b)=>String(a[1].name).localeCompare(b[1].name)).map(([id,x])=>`<option value="${esc(id)}" ${id===f.patient?'selected':''}>${esc(x.name)} · ${esc(x.reason||x.setting||id)}</option>`).join('')}</select></label>
      ${f.patient&&S.patients[f.patient]?`<a class="btn" href="${esc('/chart/'+f.patient)}" target="_blank" rel="noopener">Open chart ↗</a>`:''}<button class="btn" data-act="new-ds">New patient chart</button></div>
  </section>
  <section class="panel panel-pad stack"><h2>2 · Clinical judgment items <span class="count">${f.items.length}</span></h2><p class="muted small">Students answer these in the chart's Activity tab. Objective items (multiple choice, select all, prioritize, matrix, drop-down, highlight, bow-tie) are scored against your key: select-all and highlight items use +/- scoring. Open responses are graded by you. Students never see the key or rationales unless you allow practice mode or have graded the work.</p>
    ${checksEditorHTML(f)}</section>
  <section class="panel panel-pad stack"><h2>3 · Activity document</h2><p class="muted small">The Word file students download, complete and upload back.</p>
    <div class="files">${f.docs.map((d,i)=>fileRow(d,`<button class="btn sm danger" data-act="rm-doc-file" data-slot="docs" data-v="${i}">Remove</button>`)).join('')}</div>
    ${uploader('docs','+ Upload document','Word (.docx) recommended. PDF, Excel, PowerPoint and images also work. Up to 20 MB.')}
  </section>
  <section class="panel panel-pad stack"><h2>4 · Answer key <span class="pill">Faculty only</span></h2><p class="muted small">Optional. Students never see this file.</p>
    <div class="files">${f.keyDocs.map((d,i)=>fileRow(d,`<button class="btn sm danger" data-act="rm-doc-file" data-slot="keyDocs" data-v="${i}">Remove</button>`)).join('')}</div>
    ${uploader('keyDocs','+ Upload answer key','Visible to faculty and admin when grading.')}
  </section>`;
};
const cleanChecks = f => f.items.filter(e=>String(e.q||'').trim()).map((e,i)=>edToItem(e,i+1));
async function saveBuilt(asTemplate){
  const f=S.form;
  if(!f.title.trim()) return toast('Add a title before saving.');
  if(S.upload) return toast('Wait for the upload to finish.');
  if(!f.docs.length) return toast('Upload the activity document students will complete.');
  const patient=f.patient && S.patients[f.patient]? f.patient : '';
  const items=cleanChecks(f);
  const cjmm=String(f.cjmmText||'').split(',').map(x=>x.trim()).filter(Boolean);
  const common={title:f.title.trim(), instructions:f.instructions||'', scenario:f.scenario||'', cjmm, level:f.level||'', docs:f.docs, keyDocs:f.keyDocs, patient, items, ...(f.image?{image:f.image}:{}), points:+f.points||100, teamwork:!!f.teamwork};
  if(f.kind==='template' || asTemplate){
    const prev= f.kind==='template' && f.id? S.library[f.id] : null;
    const tags=(f.tagsText!=null? f.tagsText.split(',') : (f.tags||[])).map(x=>String(x).trim()).filter(Boolean);
    const t={...common, title:common.title+(asTemplate?' (copy)':''), group:f.group||prev?.group||'Other', description:f.description||'', tags, order:prev?.order, updatedAt:Date.now(), createdBy: prev?.createdBy||S.me.id};
    if(await API.saveTemplate((f.kind==='template' && f.id) || ('L'+uid()), t)){ toast(asTemplate?'Saved a copy to the library':'Saved to the library'); go('library'); }
    return;
  }
  if(!f.due && !S.program) return toast('Choose a due date.');
  if(!patient) return toast('Choose the patient chart students will review.');
  const prev=f.id? S.assignments[f.id] : null;
  const a={...common, showCheck:!!f.showCheck, category:prev?.category||'', due:f.due, target:f.target||'all', createdAt: prev?.createdAt||Date.now(), createdBy: prev?.createdBy||S.me.id};
  if(prev?.templateId) a.templateId=prev.templateId;
  if(await API.saveAssignment(f.id||('a'+uid()), a)){ toast(f.id?'Assignment saved':'Assigned to students'); go('assignments'); }
}

/* ---------- review & grade ---------- */
VIEWS.review=({aid})=>{
  const a={id:aid,...S.assignments[aid]}; if(!S.assignments[aid]) return `<div class="empty">This assignment was deleted.</div>`;
  const ids=new Set([...targetStudents(a).map(s=>s.id), ...Object.keys(S.work).filter(sid=>sub(sid,aid))]);
  const order={submitted:0,overdue:1,new:2,graded:3};
  const rows=[...ids].map(sid=>({sid, st:studentStatus(sid,a), s:sub(sid,aid), g:grade(sid,aid)})).sort((x,y)=> a.teamwork? ((S.students[x.sid]?.team||'~').localeCompare(S.students[y.sid]?.team||'~',undefined,{numeric:true}) || order[x.st.k]-order[y.st.k]) : order[x.st.k]-order[y.st.k]);
  return `
  <div class="page-head"><div><button class="btn sm" data-act="go" data-v="assignments">← Assigned work</button><h1 style="margin-top:8px">${esc(a.title)}</h1>
    <div class="meta"><span>Due ${fmtDate(a.due)}</span><span>${a.target==='all'?'All students':'Section '+esc(a.target)}</span><span>${a.points||100} points</span></div></div>
    <div class="row">${wbBtn(a,'btn')}<button class="btn" data-act="edit-asg" data-v="${aid}">Edit assignment</button></div></div>
  ${(a.docs||[]).length||(a.keyDocs||[]).length? `<section class="panel panel-pad stack"><div class="grid2">
    <div class="stack" style="gap:6px"><span class="label">Activity document</span><div class="files">${(a.docs||[]).map(d=>fileRow(d)).join('')}</div></div>
    <div class="stack" style="gap:6px"><span class="label">Answer key</span><div class="files">${(a.keyDocs||[]).map(d=>fileRow(d)).join('')||'<p class="hint">None uploaded.</p>'}</div></div></div></section>`:''}
  <section class="panel">${rows.length? tbl(['Student','Section',...(a.teamwork?['Team']:[]),'Status','Submitted','Answers','Document','Grade',''], rows.map(r=>`<tr><td><div class="person">${avatar(r.sid)}${esc(name(r.sid))}</div></td><td>${esc(S.students[r.sid]?.section||'—')}</td>${a.teamwork?`<td>${esc(S.students[r.sid]?.team||'No team')}${r.s?.byName?`<div class="small muted">submitted by ${esc(r.s.byName)}</div>`:''}</td>`:''}
      <td><span class="pill ${r.st.cls}">${esc(r.st.label)}</span></td><td class="num">${fmtWhen(r.s?.submittedAt)}</td><td class="num">${ansSummary(S.answers?.[r.sid]?.[aid], a)}</td>
      <td>${r.s?.file? `<button class="btn sm" data-act="dl" data-f='${esc(JSON.stringify(r.s.file))}'>Download</button>`:'<span class="muted">—</span>'}</td>
      <td class="num">${r.g? r.g.score+'/'+(a.points||100):'—'}</td>
      <td>${r.s?.file||S.answers?.[r.sid]?.[aid]? `<button class="btn sm ${r.g?'':'primary'}" data-act="grade" data-v="${aid}" data-s="${esc(r.sid)}">${r.g?'Open':'Grade'}</button>`:''}</td></tr>`)) : `<div class="empty">No students are assigned yet. Add students on the People page.</div>`}</section>`;
};
function openGrade(aid, sid){ const g=grade(sid,aid); S.form={aid, sid, score:g?.score??'', feedback:g?.feedback||'', file:g?.file||null}; S.route={name:'grade', p:{aid, sid}}; render(); window.scrollTo(0,0); }
VIEWS.grade=({aid,sid})=>{
  const a={id:aid,...S.assignments[aid]}, s=sub(sid,aid), g=grade(sid,aid), f=S.form, up=S.upload;
  return `
  <div class="page-head"><div><button class="btn sm" data-act="review" data-v="${aid}">← Submissions</button>
    <div class="person" style="margin-top:10px">${avatar(sid)}<h1>${esc(name(sid))}</h1></div>
    <div class="meta"><span>${esc(a.title)}</span><span>Submitted ${fmtWhen(s?.submittedAt)}</span>${isLate(a,s?.submittedAt)?'<span class="flag-H">Late</span>':''}${g?`<span>Graded ${fmtWhen(g.gradedAt)}</span>`:''}</div></div>${wbBtn(a,'btn')}</div>
  <div class="grid2" style="align-items:start">
    <section class="panel panel-pad stack"><h2>Student's document</h2>
      <div class="files">${s?.file? fileRow(s.file) : '<p class="muted">No document submitted.</p>'}</div>
      ${s?.note?`<div><span class="label">Note from student</span><p class="answer" style="margin-top:6px">${esc(s.note)}</p></div>`:''}
      ${(a.keyDocs||[]).length?`<div class="stack" style="gap:6px"><span class="label">Answer key</span><div class="files">${a.keyDocs.map(d=>fileRow(d)).join('')}</div></div>`:''}
    </section>
    <section class="panel panel-pad stack"><h2>Grade</h2>
      ${a.teamwork && S.students[sid]?.team? `<label class="row small" style="gap:6px"><input type="checkbox" id="g-team" data-bind="applyTeam" ${f.applyTeam!==false?'checked':''}> Give this grade and feedback to all of ${esc(S.students[sid].team)}: ${esc(students().filter(x=>x.team===S.students[sid].team && x.active).map(x=>x.name).join(', '))}</label>`:''}
      <label class="field"><span>Score (out of ${a.points||100})</span><input type="number" min="0" max="${a.points||100}" step="0.5" id="g-score" data-bind="score" value="${esc(f.score)}" style="max-width:140px"></label>
      <label class="field"><span>Feedback to student</span><textarea id="g-fb" data-bind="feedback" rows="6" placeholder="What they did well, what to review">${esc(f.feedback)}</textarea></label>
      <div class="field"><span>Marked copy for the student (optional)</span>
        <div class="files">${f.file? fileRow(f.file,`<button class="btn sm danger" data-act="rm-graded-file">Remove</button>`):''}</div>
        ${f.file?'':`<label class="btn sm" style="align-self:flex-start"><input type="file" id="up-graded" data-act="upload" data-slot="graded" accept=".docx,.pdf" hidden>+ Upload marked copy</label>`}${up?.slot==='graded'?`<span class="small muted">Uploading ${esc(up.name)}… ${Math.round(up.p*100)}%</span>`:''}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="save-grade">${g?'Update grade':'Return grade to student'}</button></div>
    </section>
  </div>
  <section class="panel panel-pad stack"><div class="row" style="justify-content:space-between"><h2>Answers saved in the chart</h2><div class="row">${S.answers?.[sid]?.[aid]?`<button class="btn sm" data-act="recheck" data-v="${aid}" data-s="${esc(sid)}">Score again</button>`:''}${wbHref(a)?`<a class="btn sm" href="${esc(wbHref(a))}" target="_blank" rel="noopener">Open the patient chart ↗</a>`:''}</div></div>${answersReviewHTML(S.answers?.[sid]?.[aid], a)}</section>`;
};
function itemMax(it){ switch(it.type){ case 'mcq': return 1; case 'sata': case 'highlight': return (it.key||[]).length||1; case 'rank': return (it.options||[]).length; case 'matrix': return (it.rows||[]).length; case 'cloze': return (it.blanks||[]).length; case 'bowtie': return 1+(it.key?.a||[]).length+(it.key?.m||[]).length; case 'text': return +it.points||0; } return 0; }
function ansTotals(ans, a){ const items=a.items||[]; let got=0, autoMax=0, manualMax=0; for(const it of items){ const m=itemMax(it); if(it.type==='text') manualMax+=m; else { autoMax+=m; got+=ans?.auto?.[it.n]?.score||0; } } return {got, autoMax, manualMax, max:autoMax+manualMax}; }
function ansSummary(ans, a){ if(!ans) return '—'; const n=Object.keys(ans.answers||{}).length, t=nChecks(a); const T=ansTotals(ans,a);
  return `${n}/${t} answered${ans.auto&&T.autoMax?` · <span class="${T.got===T.autoMax?'ok-t':''}">${T.got}/${T.autoMax} pts</span>`:''}`; }
function answersReviewHTML(ans, a){
  const items=a.items||[]; if(!items.length) return '<p class="muted">This assignment has no clinical judgment items.</p>';
  if(!ans) return '<p class="muted">The student has not saved answers in the chart.</p>';
  const auto=ans.auto||{}; const T=ansTotals(ans,a); const pts=+a.points||100;
  const sug=T.max? Math.round(T.got/T.max*pts*10)/10 : 0, rest=T.max? Math.round(T.manualMax/T.max*pts*10)/10 : 0;
  return `<p class="small">Auto-scored items: <b>${T.got} of ${T.autoMax} points</b>${T.manualMax?` · open responses: <b>${T.manualMax} points</b> to grade`:''}. Suggested score so far: <b>${sug} / ${pts}</b>${T.manualMax?`, plus up to ${rest} for the open responses`:''} <span class="muted">(adjust as you see fit; the document is graded separately)</span></p>
    ${items.map(it=>{ const x=ans.answers?.[it.n]; const r=auto[it.n];
      return `<div class="ans-rev"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div><b>${it.n}.</b> ${esc(it.q)} <span class="small muted">· ${esc(TYPE_LABEL[it.type]||it.type)}${it.cjmm?' · '+esc(it.cjmm):''}</span></div>${r? (r.manual? `<span class="pill ${r.empty?'':'warn'}">${r.empty?'No answer':'To grade · '+itemMax(it)+' pts'}</span>` : `<span class="pill ${r.ok?'ok':r.partial?'warn':'bad'}">${r.empty?'No answer':esc(r.msg)}</span>`):'<span class="pill">Not scored</span>'}</div>
        <div class="ans-grid"><div><span class="label">Student</span>${valueText(it, x?.value)}</div><div><span class="label">${it.type==='text'?'Model answer':'Key'}</span>${keyText(it)||'<span class="muted">—</span>'}</div></div>
        ${it.rationale? `<details class="small"><summary>Rationale</summary><p>${esc(it.rationale)}</p></details>`:''}</div>`; }).join('')}
    ${ans.comments?`<p class="answer" style="margin-top:8px"><b>Student comments:</b> ${esc(ans.comments)}</p>`:''}<p class="hint">Saved ${fmtWhen(ans.savedAt)}${ans.byName?' by '+esc(ans.byName):''} · scored ${fmtWhen(ans.autoAt)}. Select-all and highlight items use +/- scoring: each wrong choice cancels a right one.</p>`;
}
async function saveGrade(){
  const f=S.form, a=S.assignments[f.aid]; const max=a.points||100;
  if(f.score==='' || isNaN(+f.score)) return toast('Enter a score.');
  if(S.upload) return toast('Wait for the upload to finish.');
  const g={score:Math.min(Math.max(+f.score,0),max), max, feedback:f.feedback||'', gradedAt:Date.now(), gradedBy:S.me.id, applyTeam:!!(a.teamwork && S.students[f.sid]?.team && f.applyTeam!==false)}; if(f.file) g.file=f.file;
  if(await API.saveGrade(f.sid, f.aid, g)){ toast('Grade returned to '+name(f.sid)); go('review',{aid:f.aid}); }
}

/* ================= Patient charts ================= */
const ageTxt = p => p.age!=null? p.age+(/mo|day|wk/.test(String(p.age))?'':' y') : '';
VIEWS.cases=()=>{
  const pts=Object.entries(S.patients); const q=(S.ptq||'').toLowerCase();
  const list=pts.filter(([id,p])=>!q || [p.name,p.mrn,p.reason,p.setting,p.unit].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name)));
  return `
  <div class="page-head"><div><span class="label">${isGuest()?'Guest preview':'Faculty'}</span><h1>Patient charts</h1><p class="muted">${isGuest()?'Fictional patients with full electronic health records. Students open the chart for their activity, review the handoff report and the record, and answer the clinical judgment items.':'The electronic health records students review. Each activity uses one chart: demographics, allergies, handoff report, notes, nursing assessment, vital signs, results, MAR, orders and history. All patients are fictional.'}</p></div>
    ${isGuest()?'':'<button class="btn primary" data-act="new-ds">New patient chart</button>'}</div>
  <div class="row"><input type="search" id="pt-q" data-act="pt-q" placeholder="Search name, MRN, reason or unit" value="${esc(S.ptq||'')}" style="max-width:320px" autocomplete="off"><span class="small muted">${list.length} chart${list.length===1?'':'s'}</span></div>
  <section class="panel">${list.length? tbl(['Patient','Age · sex','Setting','Reason for care','Used by','Chart',''], list.map(([id,p])=>{ const used=Object.values(S.library).filter(t=>t.patient===id).length;
      return `<tr><td><div class="person"><span class="avatar" style="background:${colorFor(id)}">${esc(String(p.name||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join(''))}</span><div><b>${esc(p.name)}</b><div class="small muted mono">${esc(p.mrn||id)}</div></div></div></td><td class="num">${esc([ageTxt(p),p.sex].filter(Boolean).join(' · '))}</td><td>${esc(p.setting||'')}<div class="small muted">${esc(p.unit||'')}</div></td><td class="small">${esc(p.reason||'')}</td><td class="num">${used? used+' activit'+(used>1?'ies':'y'):'—'}</td>
      <td><a class="btn sm" href="${esc('/chart/'+id)}" target="_blank" rel="noopener">Open ↗</a></td>
      <td>${isGuest()?'':`<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="edit-ds" data-v="${esc(id)}">Edit</button><button class="btn sm" data-act="dup-ds" data-v="${esc(id)}">Duplicate</button></div>`}${p.custom?'<div class="small muted">Edited by your college</div>':''}</td></tr>`; })) : `<div class="empty"><b>No patient charts match</b>${isGuest()?'':'<button class="btn primary" data-act="new-ds">New patient chart</button>'}</div>`}</section>`;
};
const CHART_TEMPLATE={name:'First Last', mrn:'BL-000000', dob:'1970-01-01', age:56, sex:'Female', code:'Full code', isolation:'Standard precautions', allergies:[{agent:'Penicillin', reaction:'Hives', severity:'Moderate'}],
  height:'165 cm', weight:'70 kg', language:'English', religion:'', insurance:'', setting:'Inpatient', unit:'Medical-Surgical · Room 000', admitted:'2026-10-20 08:00', attending:'Dr. Name, MD', reason:'Reason for admission',
  narratives:[{title:'Handoff report', speaker:'Night shift RN', time:'07:00', text:'What the off-going nurse tells you at the start of the shift.'}],
  problems:[{problem:'Problem', onset:'2026-10-20', status:'Active'}], history:{medical:['Hypertension'], surgical:[], family:[], social:['Lives with spouse']},
  homeMeds:[{med:'Lisinopril', dose:'10 mg', route:'PO', freq:'Daily', indication:'Hypertension'}],
  vitals:[{time:'2026-10-21 04:00', temp:37.0, hr:88, rr:18, bp:'128/76', spo2:97, o2:'Room air', pain:2}],
  labs:[{panel:'Basic metabolic panel', time:'2026-10-21 05:00', results:[{test:'Potassium', value:'4.1', unit:'mEq/L', range:'3.5-5.0', flag:''}]}],
  mar:[{med:'Acetaminophen', dose:'650 mg', route:'PO', freq:'Every 6 h PRN pain', given:[{time:'2026-10-21 02:00', status:'Given', by:'RN'}]}],
  orders:[{time:'2026-10-20 08:30', order:'Vital signs every 4 hours', by:'Dr. Name', status:'Active'}],
  notes:[{time:'2026-10-20 09:00', author:'Dr. Name', role:'MD', type:'History and physical', text:'Note text.'}],
  assessment:[{time:'2026-10-21 07:30', by:'RN', entries:[{system:'Neurological', finding:'Alert and oriented x4.'}]}],
  io:[], scales:[], imaging:[], documents:[], tables:[]};
async function openDsEditor(id, dup){
  let d=clone(CHART_TEMPLATE);
  if(id){ try{ d=await api('GET','/api/patients/'+encodeURIComponent(id)); delete d.custom; delete d.updatedAt; }catch(e){ return toast(e.message); } }
  if(dup){ d.name=d.name+' (copy)'; }
  S.form={dsid:dup?null:(id||null), json:JSON.stringify(d,null,2), err:''}; S.route={name:'case-edit', p:{}}; render(); window.scrollTo(0,0);
}
VIEWS['case-edit']=()=>{ const f=S.form; let name='Untitled patient'; try{ name=JSON.parse(f.json).name||name; }catch(_){ }
  return `<div class="page-head"><div><button class="btn sm" data-act="go" data-v="cases">← Patient charts</button><span class="label" style="margin-top:8px">${f.dsid?'Edit patient chart':'New patient chart'}</span><h1>${esc(name)}</h1><p class="muted">A chart is a JSON document. Keep the field names; add or remove entries in each list. Use fictional patients only.</p></div>
    <div class="row">${f.dsid?`<a class="btn" href="/chart/${esc(f.dsid)}" target="_blank" rel="noopener">Open chart ↗</a><button class="btn danger" data-act="del-ds">Delete</button>`:''}<button class="btn primary" data-act="save-ds">Save chart</button></div></div>
  ${f.err?`<section class="panel panel-pad"><p class="flag-H">${esc(f.err)}</p></section>`:''}
  <div class="grid2" style="align-items:start;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
  <section class="panel panel-pad stack"><h2>Chart (JSON)</h2>${f.dsid&&S.patients[f.dsid]&&!S.patients[f.dsid].custom?'<p class="hint">This is a built-in chart: saving makes it your college\'s own copy. The built-in activities that use it, and their answer keys, depend on its data.</p>':''}
    <textarea id="d-json" class="mono sql-in" data-bind="json" rows="34" spellcheck="false">${esc(f.json)}</textarea></section>
  <section class="panel panel-pad stack"><h2>Fields</h2><dl class="kv small" style="padding:0">
    <dt>name, mrn, dob, age, sex</dt><dd>Identity. Age may be text for infants ("3 days").</dd>
    <dt>allergies, code, isolation, alerts</dt><dd>Shown on the storyboard. alerts is a list of short warnings.</dd>
    <dt>setting, unit, admitted, attending, reason</dt><dd>The encounter.</dd>
    <dt>narratives</dt><dd>Handoff reports: title, speaker, time, text (students can listen).</dd>
    <dt>vitals</dt><dd>time, temp (°C), hr, rr, bp, spo2, o2, pain, other, note.</dd>
    <dt>labs</dt><dd>Panels: panel, time, results [test, value, unit, range, flag H/L/C].</dd>
    <dt>mar</dt><dd>med, dose, route, freq, indication, given [time, status Given/Due/Held/Refused, by, note].</dd>
    <dt>orders, notes, assessment</dt><dd>Orders (time, order, by, status), notes (time, author, role, type, text), assessment (time, by, entries [system, finding]).</dd>
    <dt>problems, history, homeMeds, contacts</dt><dd>history has medical, surgical, family, social lists and optional obstetric, developmental, immunizations.</dd>
    <dt>io, scales, imaging, documents, tables</dt><dd>Intake and output periods, scales (time, tool, score, detail), imaging (time, study, result), documents (title, type, text), tables (title, columns, rows).</dd></dl></section></div>`; };
async function saveDs(){
  const f=S.form; let d; try{ d=JSON.parse(f.json); }catch(e){ f.err='The chart is not valid JSON: '+e.message; render(); return; }
  if(!d || typeof d!=='object' || Array.isArray(d)) { f.err='The chart must be a JSON object { ... }.'; render(); return; }
  const id=f.dsid||('P'+uid()); f.err='';
  if(await API.saveDataset(id, d)){ delete S.ch.charts[id]; toast('Patient chart saved'); go('cases'); }
}

/* ================= Student ================= */
VIEWS.my=()=>{
  const list=myAssignments(); const me=S.me.id;
  const done=a=>['submitted','graded'].includes(studentStatus(me,a).k);
  const pg=!!S.program;
  const card=a=>{ const st=studentStatus(me,a); if(a.teamwork) a={...a, category:(a.category? a.category+' · ':'')+'Group activity'};
    return `<div class="asg">${labImg(a,'asg-img')}<div class="stack" style="gap:6px;min-width:0;flex:1"><div class="row"><span class="pill ${st.cls}">${esc(st.label)}</span>${a.category?`<span class="pill">${esc(a.category)}</span>`:''}</div><h3>${esc(a.title)}</h3>
      <div class="meta">${a.due?`<span>Due ${fmtDate(a.due)}</span>`:''}<span>${a.points||100} pts</span></div></div><button class="btn ${done(a)?'':'primary'}" data-act="work" data-v="${a.id}">${done(a)?'View':'Open'}</button></div>`; };
  const open=list.filter(a=>!done(a)), fin=list.filter(done);
  return `
  <div class="page-head"><div><span class="label">${pg?esc(S.program.title):'Student'}${!pg&&mySection()? ' · Section '+esc(mySection()):''}</span><h1>${pg?'My activities':'My assignments'}</h1><p class="muted">Open each case's patient chart, review the handoff report and the record, answer the clinical judgment items in the Activity tab, then upload your completed document.${pg?` Each activity needs ${passMark()}% or more to pass; you can resubmit an activity you do not pass.`:''}</p></div></div>
  <section class="stack"><h2>To do <span class="count">${open.length}</span></h2><div class="panel">${open.length? open.map(card).join('') : `<div class="empty">You're all caught up. New assignments from your faculty will appear here.</div>`}</div></section>
  <section class="stack"><h2>Submitted <span class="count">${fin.length}</span></h2><div class="panel">${fin.length? fin.map(card).join('') : `<div class="empty">Nothing submitted yet.</div>`}</div></section>`;
};
VIEWS.work=({aid})=>{
  const a={id:aid,...S.assignments[aid]}; if(!S.assignments[aid]) return `<div class="empty">This assignment is no longer available.</div>`;
  const s=sub(S.me.id,aid), g=grade(S.me.id,aid), st=studentStatus(S.me.id,a), up=S.upload, f=S.form||{};
  const canSubmit=!g || (!!S.program && !passed(g));
  return `
  <div class="page-head"><div><button class="btn sm" data-act="go" data-v="my">← ${S.program?'My activities':'My assignments'}</button><h1 style="margin-top:8px">${esc(a.title)}</h1>
    <div class="meta">${a.due?`<span>Due ${fmtDate(a.due)}</span>`:''}<span>${a.points||100} points</span><span class="pill ${st.cls}">${esc(st.label)}</span></div></div></div>
  <div class="work-intro">${labImg(a,'work-img')}<div>${a.description?`<p class="scenario muted">${esc(a.description)}</p>`:''}${a.instructions?`<p class="scenario">${esc(a.instructions)}</p>`:''}</div></div>
  ${a.teamwork? `<div class="panel panel-pad team-box"><b>Group activity.</b> ${S.me.team? `You are in <b>${esc(S.me.team)}</b>: ${esc((S.team||[]).map(x=>x.name).join(', '))}. Work together on the document and in the patient chart. <b>One member uploads and submits for the whole team</b>; the submission and the answers saved in the chart are shared with every member.${s?.byName?` Last submitted by ${esc(s.byName)}.`:''}` : 'You have not been placed in a team yet. Ask your faculty to add you to a team. Until then, you can submit on your own.'}</div>`:''}
  <ol class="steps">
    <li class="panel panel-pad stack"><div class="step-h"><span class="step-n">1</span><div><h2>Review the patient chart and answer the items</h2><p class="small muted">The chart opens in a new tab. Start with the <b>handoff report</b> (you can listen to it), then review the notes, assessment, vital signs, results and MAR. Answer each clinical judgment item in the <b>Activity</b> tab: answers are saved to this assignment. Keep this page open so you can come back and upload.</p></div></div>
      <div>${wbHref(a)? `<a class="btn primary" href="${esc(wbHref(a))}" target="_blank" rel="noopener">Open patient chart ↗</a> <span class="small muted">${esc(wbLabel(a))}</span>` : '<p class="hint">Your faculty has not linked a patient chart to this assignment yet.</p>'}</div>
      ${(()=>{ const an=S.answers?.[S.me.id]?.[aid]; const n=Object.keys(an?.answers||{}).length, t=nChecks(a); const T=an?.auto? ansTotals(an,a) : null;
        return t? `<p class="small ${an?'':'muted'}">${an? `<span class="pill ok">Answers saved</span> ${n} of ${t} items answered · ${fmtWhen(an.savedAt)}${T&&T.autoMax?` · <b>${T.got} of ${T.autoMax} auto-scored points</b>`:''}` : `No answers saved yet (${t} items).`}</p>` : ''; })()}</li>
    <li class="panel panel-pad stack"><div class="step-h"><span class="step-n">2</span><div><h2>Complete the activity document</h2><p class="small muted">Download the Word document. It has the case summary, the items and space for your reasoning and reflection.</p></div></div>
      <div class="files">${(a.docs||[]).map(d=>fileRow(d)).join('')||'<p class="hint">Your faculty has not attached a document yet.</p>'}</div></li>
    <li class="panel panel-pad stack"><div class="step-h"><span class="step-n">3</span><div><h2>Upload your completed document</h2><p class="small muted">Save the document with your answers, then upload it here. ${g&&canSubmit?`<b>Your last attempt scored ${pct(g)}% (pass mark ${passMark()}%).</b> Read the feedback below, review the case again, then submit again.`:canSubmit?'You can replace it until it is graded.':''}</p></div></div>
      ${s?.file? `<div class="stack" style="gap:6px"><span class="label">Submitted ${fmtWhen(s.submittedAt)}${isLate(a,s.submittedAt)?' · late':''}</span><div class="files">${fileRow(s.file)}</div></div>`:''}
      ${canSubmit? `${f.pending? `<div class="files">${fileRow(f.pending,`<button class="btn sm danger" data-act="clear-pending">Remove</button>`)}</div>`:''}
        ${up? `<span class="small muted">Uploading ${esc(up.name)}… ${Math.round(up.p*100)}%</span>` : (f.pending? '' : `<label class="btn" style="align-self:flex-start"><input type="file" id="up-sub" data-act="upload" data-slot="sub" accept=".docx,.pdf" hidden>${s?.file?'Choose a replacement file':'Choose your completed file'}</label>`)}
        <label class="field"><span>Note to faculty (optional)</span><input type="text" id="w-note" data-bind="note" value="${esc(f.note??s?.note??'')}"></label>
        <div class="row"><button class="btn primary" data-act="submit-file" ${f.pending?'':'disabled'}>${s?.file?'Replace submission':'Submit'}</button></div>` : ''}
    </li>
  </ol>
  ${g? `<section class="panel panel-pad stack"><div class="row" style="justify-content:space-between"><div><span class="label">Grade</span><div class="mono" style="font-size:2rem;font-weight:600">${g.score} <span class="muted" style="font-size:1rem">/ ${a.points||100}</span></div></div><span class="pill ok">Graded ${fmtWhen(g.gradedAt)}</span></div>
    ${g.feedback?`<div><span class="label">Feedback</span><p class="answer" style="margin-top:6px">${esc(g.feedback)}</p></div>`:''}
    ${g.file?`<div class="stack" style="gap:6px"><span class="label">Marked copy from faculty</span><div class="files">${fileRow(g.file)}</div></div>`:''}</section>`:''}`;
};
async function submitFile(){
  const f=S.form, a=S.assignments[S.route.p.aid]; if(!f?.pending) return;
  const prev=sub(S.me.id,S.route.p.aid);
  const s={status:'submitted', file:f.pending, note:(f.note??prev?.note??'').trim(), submittedAt:Date.now(), history:[...(prev?.history||[]), ...(prev?.file?[{file:prev.file, at:prev.submittedAt}]:[])].slice(-5)};
  if(await API.saveWork(S.route.p.aid, s)){ toast(isLate(a,s.submittedAt)?'Submitted (after the due date).':'Submitted. Your faculty can now grade it.'); S.form={}; render(); }
}
VIEWS.grades=()=>{
  const me=S.me.id; const list=myAssignments().filter(a=>grade(me,a.id));
  const got=list.reduce((s,a)=>s+grade(me,a.id).score,0), max=list.reduce((s,a)=>s+(a.points||100),0);
  return `
  <div class="page-head"><div><span class="label">Student</span><h1>My grades</h1></div></div>
  <div class="stats"><div class="panel stat"><span class="label">Overall</span><b>${max? Math.round(got/max*100)+'%':'—'}</b><span class="small muted mono">${got} / ${max} pts</span></div>
    <div class="panel stat"><span class="label">Graded</span><b>${list.length}</b><span class="small muted">of ${myAssignments().length} assignments</span></div></div>
  <section class="panel">${list.length? tbl(['Assignment','Score','%','Graded',''], list.map(a=>{ const g=grade(me,a.id); return `<tr><td>${esc(a.title)}</td><td class="num">${g.score}/${a.points||100}</td><td class="num">${Math.round(g.score/(a.points||100)*100)}%</td><td class="num">${fmtWhen(g.gradedAt)}</td><td><button class="btn sm" data-act="work" data-v="${a.id}">Feedback</button></td></tr>`; })) : `<div class="empty">No grades yet.</div>`}</section>`;
};


/* ================= events ================= */
document.addEventListener('click', async e=>{
  const el=e.target.closest('[data-act]'); if(!el || el.tagName==='INPUT' || el.tagName==='SELECT') return;
  const v=el.dataset.v, act=el.dataset.act;
  const confirmTwice=label=>{ if(el.dataset.confirm) return true; el.dataset.confirm='1'; el.textContent=label; return false; };
  switch(act){
    case 'go': if(S.route.name==='appearance') applyTheme(S.site); go(v); break;
    case 'logout': { const slug=S.org?.slug; try{ await api('POST','/api/logout',{}); }catch(_){} location.href= slug? '/c/'+encodeURIComponent(slug) : '/'; break; }
    case 'lib-cat': S.lib.cat=v; render(); break;
    case 'new-tpl': openBuilder('template', null); break;
    case 'edit-tpl': openBuilder('template', v); break;
    case 'dup-tpl': { const t=clone(S.library[v]); t.title+=' (copy)'; t.updatedAt=Date.now(); const id='L'+uid(); if(await API.saveTemplate(id,t)){ toast('Duplicated'); openBuilder('template', id); } break; }
    case 'assign-tpl': openAssign([v]); break;
    case 'assign-sel': openAssign([...S.sel].filter(id=>S.library[id])); break;
    case 'sel-all': libFiltered().forEach(t=>S.sel.add(t.id)); render(); break;
    case 'sel-none': S.sel.clear(); render(); break;
    case 'do-assign': doAssign(); break;
    case 'new-asg': openBuilder('assignment', null); break;
    case 'edit-asg': openBuilder('assignment', v); break;
    case 'rm-doc-file': S.form[el.dataset.slot].splice(+v,1); render(); break;
    case 'save-built': saveBuilt(false); break;
    case 'save-as-tpl': saveBuilt(true); break;
    case 'del-built': if(!confirmTwice('Click again to delete')) return;
      if(S.form.kind==='template'){ if(await API.deleteTemplate(S.form.id)){ toast('Removed from library'); go('library'); } } else { if(await API.deleteAssignment(S.form.id)){ toast('Assignment deleted'); go('assignments'); } } break;
    case 'review': go('review',{aid:v}); break;
    case 'grade': openGrade(v, el.dataset.s); break;
    case 'save-grade': saveGrade(); break;
    case 'rm-graded-file': S.form.file=null; render(); break;
    case 'new-ds': openDsEditor(null); break;
    case 'edit-ds': openDsEditor(v); break;
    case 'dup-ds': openDsEditor(v, true); break;
    case 'save-ds': saveDs(); break;
    case 'del-ds': { const id=S.form.dsid; if([...Object.values(S.assignments),...Object.values(S.library)].some(a=>a.patient===id)) return toast('An activity uses this patient chart. Change that activity first.');
      if(!confirmTwice('Click again to delete')) return; if(await API.deleteDataset(id)){ toast('Patient chart deleted'); go('cases'); } break; }
    case 'add-check': { const t=document.getElementById('add-type')?.value||'mcq'; S.form.items.push(itemToEd({type:t, q:'', options:[], key:t==='mcq'?0:[], points:4})); S.testRes=null; render(); setTimeout(()=>document.getElementById('it-q-'+(S.form.items.length-1))?.focus(),0); break; }
    case 'rm-check': if(!confirmTwice('Click again to remove')) return; S.form.items.splice(+v,1); S.testRes=null; render(); break;
    case 'mv-check': { const L=S.form.items, i=+v, j=i+ +el.dataset.d; if(j>=0&&j<L.length){ [L[i],L[j]]=[L[j],L[i]]; S.testRes=null; render(); } break; }
    case 'test-checks': { const f=S.form; el.disabled=true;
      try{ const r=await api('POST','/api/items/check',{items:f.items.map((e,i)=>edToItem(e,i+1))}); S.testRes=Object.fromEntries(r.results.map(x=>[x.n,x])); const bad=r.results.filter(x=>x.errors.length).length; toast(bad? `${bad} item${bad>1?'s need':' needs'} fixing` : 'All items are ready'); }catch(err){ toast(err.message); } render(); break; }
    case 'recheck': try{ const r=await api('POST',`/api/answers/${encodeURIComponent(v)}/${encodeURIComponent(el.dataset.s)}/recheck`,{}); ((S.answers||={})[el.dataset.s]||={})[v]=r.answer; toast('Answers scored again'); render(); }catch(err){ toast(err.message); } break;
    case 'work': S.route={name:'work',p:{aid:v}}; S.form={}; S.upload=null; render(); window.scrollTo(0,0); break;
    case 'clear-pending': S.form.pending=null; render(); break;
    case 'submit-file': submitFile(); break;
    case 'theme-pick': S.form.theme=v; S.form.custom={}; applyTheme(S.form); render(); break;
    case 'theme-color-reset': delete S.form.custom[el.dataset.k]; applyTheme(S.form); render(); break;
    case 'theme-cancel': openAppearance(); applyTheme(S.site); render(); break;
    case 'tour': startTour(); break;
    case 'open-college': S.ocreds=null; go('college',{id:v}); break;
    case 'close-ocreds': S.ocreds=null; render(); break;
    case 'org-extend': { const id=S.route.p.id; if(await write(()=>api('PATCH','/api/owner/orgs/'+id,{extendMonths:+v}))){ S.form=null; toast(`Subscription extended by ${v} month${+v>1?'s':''}`); render(); } break; }
    case 'org-save': { const f=S.form, id=S.route.p.id; if(await write(()=>api('PATCH','/api/owner/orgs/'+id,{name:f.name,slug:f.slug,maxStudents:f.maxStudents===''?0:+f.maxStudents,expiresOn:f.expiresOn||null,contact:f.contact,notes:f.notes}))){ S.form=null; toast('College saved'); render(); } break; }
    case 'org-pause': { const o=S.orgs.find(x=>x.id===S.route.p.id); if(o.status==='active' && !confirmTwice('Click again to pause')) return;
      if(await write(()=>api('PATCH','/api/owner/orgs/'+o.id,{status:o.status==='active'?'suspended':'active'}))){ S.form=null; toast(o.status==='active'?'College paused':'College resumed'); render(); } break; }
    case 'org-delete': { const id=S.route.p.id; if(!confirmTwice('Click again to delete permanently')) return;
      try{ await api('DELETE','/api/owner/orgs/'+id,{confirm:S.form.confirm||''}); await refresh(); toast('College deleted'); go('colleges'); }catch(err){ toast(err.message); } break; }
    case 'org-reset-admin': { if(!confirmTwice('Click again to reset')) return; try{ const r=await api('POST',`/api/owner/users/${encodeURIComponent(v)}/reset-password`,{}); const o=S.orgs.find(x=>x.id===S.route.p.id);
      S.ocreds={org:o.name,slug:o.slug,name:r.user.name,email:r.user.email,temp:r.tempPassword}; await refresh(); render(); window.scrollTo(0,0); }catch(err){ toast(err.message); } break; }
    case 'owner-refresh': { if(!confirmTwice('Click again to update all colleges')) return; el.disabled=true; try{ const r=await api('POST','/api/owner/refresh-all',{}); S.ostat=undefined; await refresh(); toast(`Updated ${r.patients} patient charts and ${r.library} activities across ${r.colleges} colleges`); render(); }catch(err){ toast(err.message); } break; }
    case 'tour-next': if(S.tour>=TOUR.length-1) endTour(); else { S.tour++; drawTour(); } break;
    case 'tour-prev': S.tour=Math.max(0,S.tour-1); drawTour(); break;
    case 'tour-end': endTour(); break;
    case 'refresh-content': { if(!confirmTwice('Click again to update')) return; el.disabled=true;
      try{ const r=await api('POST','/api/admin/refresh-content',{}); S.cstat=undefined; await refresh(); toast(`Updated ${r.patients} patient charts, ${r.library} activities and ${r.files} documents`); render(); }catch(err){ toast(err.message); el.disabled=false; } break; }
    case 'logo-remove': S.form.logo=''; applyTheme(S.form); render(); break;
    case 'theme-save': try{ const saved=await api('PUT','/api/settings',Object.fromEntries(APPEAR_KEYS.map(k=>[k,S.form[k]]))); S.site={...DEFAULT_SITE,...saved}; applyTheme(S.site); toast('Appearance saved for everyone'); render(); }catch(err){ toast(err.message); } break;
    case 'dl-creds': downloadCreds(); break;
    case 'copy-join': { const link=location.origin+'/join/'+v; try{ await navigator.clipboard.writeText(link); toast('Link copied: '+link); }catch(_){ toast(link); } break; }
    case 'join-off': if(await write(()=>api('PATCH','/api/joincodes/'+encodeURIComponent(v),{active:false}))) { toast('Code turned off'); render(); } break;
    case 'join-on': if(await write(()=>api('PATCH','/api/joincodes/'+encodeURIComponent(v),{active:true, extendDays: el.dataset.exp? 14 : undefined}))) { toast('Code turned on'); render(); } break;
    case 'join-del': if(!confirmTwice('Click again to delete')) return; if(await write(()=>api('DELETE','/api/joincodes/'+encodeURIComponent(v)))) { toast('Code deleted'); render(); } break;
    case 'join-print': S.acct.printCode=v; render(); setTimeout(()=>window.print(),200); break;
    case 'make-teams': { const sec=document.getElementById('mt-sec').value, size=+document.getElementById('mt-size').value||3;
      const list=students().filter(x=>x.active && (!sec || x.section===sec)).sort((a,b)=>a.name.localeCompare(b.name)); if(!list.length) return toast('No active students to place in teams.');
      if(!confirmTwice(`Click again to make ${Math.ceil(list.length/size)} teams`)) return;
      const n=Math.max(1,Math.round(list.length/size)); const pre=sec? sec+' Team ' : 'Team ';
      try{ for(let i=0;i<list.length;i++) await api('PATCH','/api/users/'+encodeURIComponent(list[i].id),{team:pre+(i%n+1)}); await refresh(); toast(`${list.length} students placed in ${n} teams`); render(); }catch(err){ toast(err.message); } break; }
    case 'clear-teams': { const sec=document.getElementById('mt-sec').value; const list=students().filter(x=>x.team && (!sec || x.section===sec)); if(!list.length) return toast('No teams to clear.');
      if(!confirmTwice('Click again to clear teams')) return; try{ for(const x of list) await api('PATCH','/api/users/'+encodeURIComponent(x.id),{team:''}); await refresh(); toast('Teams cleared'); render(); }catch(err){ toast(err.message); } break; }
    case 'extend-guest': if(await write(()=>api('PATCH','/api/users/'+encodeURIComponent(v),{extendDays:7, active:true}))) { toast('Guest access extended by 7 days'); render(); } break;
    case 'end-guest': if(!confirmTwice('Click again to end access')) return; if(await write(()=>api('PATCH','/api/users/'+encodeURIComponent(v),{endNow:true}))) { toast('Guest access ended'); render(); } break;
    case 'close-creds': S.acct.created=null; render(); break;
    case 'reset-pw': { if(!confirmTwice('Click again to reset')) return;
      try{ const r=await api('POST',`/api/users/${encodeURIComponent(v)}/reset-password`,{}); S.acct.created=[{ok:true,user:r.user,tempPassword:r.tempPassword}]; await refresh(); render(); window.scrollTo(0,0); toast('New temporary password created'); }catch(err){ toast(err.message); } break; }
    case 'toggle-active': { const u=person(v); if(!u) return; if(u.active && !confirmTwice('Click again to deactivate')) return;
      if(await write(()=>api('PATCH','/api/users/'+encodeURIComponent(v),{active:!u.active}))) { toast(u.active?'Account deactivated':'Account reactivated'); render(); } break; }
    case 'rm-user': { if(!confirmTwice('Click again to delete')) return;
      if(await write(()=>api('DELETE','/api/users/'+encodeURIComponent(v)))) { toast('Account deleted'); render(); } break; }
  }
});
document.addEventListener('submit', async e=>{
  const f=e.target.closest('form[data-form]'); if(!f) return; e.preventDefault();
  const d=Object.fromEntries(new FormData(f).entries()); const btn=f.querySelector('button[type=submit]'); if(btn) btn.disabled=true;
  try{
    switch(f.dataset.form){
      case 'login': { const r=await api('POST','/api/login',{email:d.email,password:d.password}); await start(); break; }
      case 'setup': await api('POST','/api/setup',d); await start(); toast('Owner account created'); break;
      case 'password':
        if(d.next!==d.repeat){ toast('The new passwords do not match.'); break; }
        await api('POST','/api/password',{current:d.current,next:d.next}); await refresh(); toast('Password changed'); render(); break;
      case 'add-faculty': { const r=await api('POST','/api/users',{name:d.name,email:d.email,role:'faculty'}); S.acct.created=[{ok:true,...r}]; await refresh(); render(); window.scrollTo(0,0); toast('Faculty account created'); break; }
      case 'add-org': { const f=S.form; const r=await api('POST','/api/owner/orgs',{name:f.name,slug:f.slug,adminName:f.adminName,adminEmail:f.adminEmail,maxStudents:f.maxStudents===''?0:+f.maxStudents,expiresOn:f.expiresOn||null,program:!!f.program});
        S.ocreds={org:r.org.name,slug:r.org.slug,name:r.user.name,email:r.user.email,temp:r.tempPassword}; S.form=null; await refresh(); render(); window.scrollTo(0,0); toast('College created'); break; }
      case 'add-org-admin': { const f=S.form, o=S.orgs.find(x=>x.id===S.route.p.id); const r=await api('POST',`/api/owner/orgs/${o.id}/admins`,{name:f.newAdmin,email:f.newAdminEmail});
        S.ocreds={org:o.name,slug:o.slug,name:r.user.name,email:r.user.email,temp:r.tempPassword}; S.form=null; await refresh(); render(); window.scrollTo(0,0); toast('Admin added'); break; }
      case 'add-guest': { const r=await api('POST','/api/users',{name:d.name,email:d.email,section:d.section,days:+d.days||7,role:'guest'}); S.acct.created=[{ok:true,...r}]; await refresh(); render(); window.scrollTo(0,0); toast('Guest account created'); break; }
      case 'add-student': { S.acct.section=d.section||''; const r=await api('POST','/api/users',{name:d.name,email:d.email,section:d.section,team:d.team,role:'student'}); S.acct.created=[...(S.acct.created||[]),{ok:true,...r}]; await refresh(); render(); window.scrollTo(0,0); toast('Student account created'); break; }
      case 'import': await importRows(parseCsv(d.rows)); break;
      case 'join': { if(d.password!==d.repeat){ toast('The two passwords do not match.'); break; }
        const r=await api('POST','/api/join',{code:d.code,name:d.name,email:d.email,password:d.password}); S.joinOnly=false; history.replaceState(null,'','/c/'+encodeURIComponent(r.slug)); S.orgSlug=r.slug; await start(); toast('Welcome! Your account is ready.'); break; }
      case 'join-code': await joinCheck(d.code); break;
      case 'register': { if(d.password!==d.repeat){ toast('The two passwords do not match.'); break; }
        const r=await api('POST','/api/register',{name:d.name,email:d.email,phone:d.phone,country:d.country,password:d.password,agree:!!d.agree}); S.registerOnly=false; history.replaceState(null,'','/c/'+encodeURIComponent(r.slug)); S.orgSlug=r.slug; await start(); S.route={name:'registration',p:{}}; render(); toast('Account created. Next: pay the fee and upload your receipt.'); break; }
      case 'new-joincode': { const r=await api('POST','/api/joincodes',{section:d.section, days:+d.days||0, maxUses:+d.maxUses||0, label:d.label}); await refresh(); S.acct.newCode=r.code; render(); toast('Class code '+r.code+' created'); break; }
    }
  }catch(err){ toast(err.message); }
  if(btn && document.body.contains(btn)) btn.disabled=false;
});
document.addEventListener('input', e=>{
  const el=e.target;
  if(el.dataset.bind && el.type!=='radio'){ if(!S.form) S.form={}; setPath(S.form, el.dataset.bind, el.type==='checkbox'? el.checked : el.value); }
  const refocus=(id,fn)=>{ clearTimeout(S._t); S._t=setTimeout(()=>{ const pos=el.selectionStart; fn(); render(); const n=document.getElementById(id); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} } }, 250); };
  if(el.dataset.act==='theme-color'){ S.form.custom={...S.form.custom,[el.dataset.k]:el.value}; applyTheme(S.form); const sp=el.parentElement.querySelector('.mono'); if(sp) sp.textContent=el.value; }
  if(el.dataset.act==='theme-text'){ S.form[el.dataset.k]=el.value; applyTheme(S.form); const tb=document.querySelector('.top .brand'); if(tb) tb.outerHTML=brandHTML(); }
  if(el.dataset.act==='theme-num'){ S.form[el.dataset.k]=+el.value; applyTheme(S.form); const lab=document.getElementById('v-'+el.dataset.k); if(lab) lab.textContent=el.value+' px'; }
  if(el.dataset.act==='org-name' && S.form && S.form.newOrg && !S.form.slugTouched){ S.form.slug=el.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40); const sl=document.getElementById('no-slug'); if(sl) sl.value=S.form.slug; }
  if(el.id==='no-slug' && S.form) S.form.slugTouched=true;
  if(el.dataset.act==='chart-q'){ S.chartQ=el.value; if(el.value.trim()) S.chartTab='search'; else if(S.chartTab==='search') S.chartTab='overview'; refocus('chart-q',()=>{}); }
  if(el.dataset.act==='lib-q'){ S.lib.q=el.value; refocus('lib-q',()=>{}); }
  if(el.dataset.act==='pt-q'){ S.ptq=el.value; refocus('pt-q',()=>{}); }
  if(el.dataset.act==='stu-q'){ S.acct.q=el.value; refocus('stu-q',()=>{}); }
});
document.addEventListener('change', async e=>{
  const el=e.target;
  if(el.dataset.bind && el.type==='radio'){ setPath(S.form, el.dataset.bind, el.value); render(); }
  if(el.dataset.bind && el.type==='checkbox'){ setPath(S.form, el.dataset.bind, el.checked); }
  if(el.dataset.act==='pick'){ el.checked? S.sel.add(el.dataset.v) : S.sel.delete(el.dataset.v); render(); return; }
  if(el.dataset.act==='lib-tag'){ S.lib.tag=el.value; render(); return; }
  if(el.dataset.act==='lib-level'){ S.lib.level=el.value; render(); return; }
  if(el.dataset.act==='lib-ready'){ S.lib.readyOnly=el.checked; render(); return; }
  if(el.dataset.act==='stu-mine'){ S.acct.mine=el.checked; render(); return; }
  if(el.dataset.act==='theme-color'){ render(); return; }
  if(el.dataset.act==='theme-num'){ render(); return; }
  if(el.dataset.act==='theme-bool'){ S.form[el.dataset.k]=el.checked; applyTheme(S.form); render(); return; }
  if(el.dataset.act==='logo-file' && el.files?.[0]){ const file=el.files[0]; el.value='';
    try{ S.form.logo=await logoDataUrl(file); applyTheme(S.form); render(); toast('Logo ready. Click Save for everyone to apply it.'); }catch(err){ toast(err.message); } return; }
  if(el.dataset.act==='set-team'){ if(await write(()=>api('PATCH','/api/users/'+encodeURIComponent(el.dataset.v),{team:el.value.trim()}))) toast('Team updated'); scheduleRender(); }
  if(el.dataset.act==='set-sec'){ if(await write(()=>api('PATCH','/api/users/'+encodeURIComponent(el.dataset.v),{section:el.value.trim()}))) toast('Section updated'); scheduleRender(); }
  if(el.dataset.act==='import-file' && el.files?.[0]){ const text=await el.files[0].text(); el.value=''; await importRows(parseCsv(text)); }
  if(el.dataset.act==='upload' && el.files?.[0]){
    const file=el.files[0], slot=el.dataset.slot;
    if(slot==='sub' && !['docx','pdf'].includes(ext(file.name))) return toast('Upload your completed document as .docx or .pdf.');
    if((slot==='receipt'||slot.startsWith('cert-')) && !['pdf','png','jpg','jpeg'].includes(ext(file.name))) return toast('Upload a PDF, PNG or JPG file.');
    if(!S.form) S.form={};
    const base= slot==='receipt'? 'receipt' : slot.startsWith('cert-')? 'cert/'+slot.slice(5) : slot==='sub'? `work/${S.me.id}/f` : slot==='graded'? `grades/${S.form.sid}/f` : slot==='keyDocs'? 'keyfiles' : 'files';
    const form=S.form; S.upload={slot, name:file.name, p:0}; S.busy=true; render();
    try{
      const meta=await putFile(base, file, p=>{ S.upload.p=p; render(); });
      if(slot==='receipt') form.receipt=meta; else if(slot.startsWith('cert-')){ ((S.certForm||={})[slot.slice(5)]||={}).file=meta; }
      else if(slot==='sub') form.pending=meta; else if(slot==='graded') form.file=meta; else form[slot].push(meta);
      toast('Uploaded '+file.name);
    }catch(err){ toast('Upload failed: '+err.message); }
    S.upload=null; S.busy=false; render();
  }
});
window.addEventListener('popstate', ()=>{ readPath(); render(); });
function focusCell(path,r,c){ const n=document.querySelector(`input[data-grid="${path}"][data-r="${r}"][data-c="${c}"]`); if(n){ n.focus(); n.select(); } }
/* paste a block of cells copied from Excel / Sheets into the grid */
document.addEventListener('paste', e=>{
  const el=e.target; if(!el.matches?.('input[data-grid]')) return;
  const text=(e.clipboardData||window.clipboardData).getData('text'); if(!/[\t\n]/.test(text)) return;
  e.preventDefault();
  const block=text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(l=>l.split('\t'));
  const path=el.dataset.grid, r0=+el.dataset.r, c0=+el.dataset.c, rows=getPath(S.form,path);
  const width=rows[0]?.length || el.closest('tr').querySelectorAll('input[data-grid]').length;
  block.forEach((cells,i)=>{ const r=r0+i; while(rows.length<=r) rows.push(Array(width).fill('')); cells.forEach((v,j)=>{ if(c0+j<width) rows[r][c0+j]=v.trim(); }); });
  render(); focusCell(path, r0+block.length-1, c0); toast(`Pasted ${block.length} row${block.length>1?'s':''}`);
});
/* Enter moves down a row (adding one at the end) */
document.addEventListener('keydown', e=>{
  const el=e.target; if(e.key!=='Enter' || !el.matches?.('input[data-grid]')) return;
  e.preventDefault(); const path=el.dataset.grid, r=+el.dataset.r, c=+el.dataset.c, rows=getPath(S.form,path);
  if(r===rows.length-1){ if(!rows[r].some(v=>String(v).trim())) return; rows.push(Array(rows[r].length).fill('')); render(); }
  focusCell(path, r+1, c);
});
async function logoDataUrl(file){
  const ok=['image/png','image/jpeg','image/webp','image/svg+xml']; if(!ok.includes(file.type)) throw new Error('Choose a PNG, JPG, WebP or SVG image.');
  const asData=f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
  if(file.type==='image/svg+xml'){ if(file.size>300*1024) throw new Error('The SVG is larger than 300 KB.'); return asData(file); }
  const src=await asData(file); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('That image could not be opened.')); i.src=src; });
  const k=Math.min(1, 480/img.naturalWidth, 192/img.naturalHeight); const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.naturalWidth*k)); c.height=Math.max(1,Math.round(img.naturalHeight*k));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  const out=c.toDataURL('image/png'); if(out.length>420000) throw new Error('The logo is too detailed. Try a simpler or smaller image.'); return out;
}
function readPath(){ const m=/^\/chart\/([^/]+)\/?$/.exec(location.pathname); S.ehrOnly=m? decodeURIComponent(m[1]) : null;
  S.refOnly=/^\/reference\/?$/.test(location.pathname);
  S.ehrAid=new URLSearchParams(location.search).get('a')||null;
  const jm=/^\/join(?:\/([^/]*))?\/?$/.exec(location.pathname); S.joinOnly=!!jm; if(jm){ S.join=S.join||{}; if(jm[1] && !S.join.code) S.join.code=decodeURIComponent(jm[1]).toUpperCase(); } S.registerOnly=/^\/register\/?$/.test(location.pathname); const c=/^\/c\/[^/]+\/?$/.exec(location.pathname)? /^\/c\/([^/]+)\/?$/.exec(location.pathname) : null; S.orgSlug=c? decodeURIComponent(c[1]).toLowerCase() : null; }

/* ================= boot ================= */
async function start(){
  readPath();
  try{ await refresh(); S.auth='ready'; await loadSite(); if(S.registerOnly){ S.registerOnly=false; history.replaceState(null,'', S.org?.slug? '/c/'+encodeURIComponent(S.org.slug) : '/'); } if(S.joinOnly){ S.joinOnly=false; history.replaceState(null,'', S.org?.slug? '/c/'+encodeURIComponent(S.org.slug) : '/'); } }
  catch(e){ await loadSite(S.orgSlug);
    if(e.status===401){ try{ const s=await api('GET','/api/setup-status'); S.auth=s.needsSetup?'setup':'login'; }catch(_){ S.auth='login'; } }
    else { S.auth='login'; toast(e.message); }
  }
  render();
}
start();
setInterval(async()=>{ if(S.auth!=='ready'||S.me.mustChange||document.hidden) return; try{ await refresh(); scheduleRender(); }catch(_){} }, 60000);
