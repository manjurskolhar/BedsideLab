'use strict';
/* Public pages: the BedsideLab front page (/), each college's sign-in page (/c/slug) and first-time setup.
   Rendered by app.js when nobody is signed in. */
const LP_LOGIN_FORM = (btn = 'Sign in') => `<form class="stack" data-form="login">
    <label class="field"><span>Email</span><input type="text" id="li-email" name="email" autocomplete="username" inputmode="email" required placeholder="you@college.edu"></label>
    <label class="field"><span>Password</span><input type="password" id="li-pw" name="password" autocomplete="current-password" required></label>
    <button class="btn primary lp-wide" type="submit">${btn}</button>
    <p class="hint">First time? Use the temporary password from your faculty (students) or your college admin (faculty). You will choose your own password straight away.</p>
    <p class="hint">Forgot your password? Students ask their faculty; faculty ask the college admin to reset it.</p>
  </form>`;
const lpIcon = (k) => ({
  ehr: '<path d="M4 5h16v14H4z M4 9h16 M9 9v10"/>', book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2 M10 10a2 2 0 0 1 4 0"/>', team: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20c0-3 3-5 6-5s6 2 6 5 M14 15c3 0 8 1 8 5"/>',
  grade: '<path d="M4 4h16v16H4z M8 12l3 3 5-6"/>', lib: '<path d="M4 4h4v16H4z M10 4h4v16h-4z M16 5l4 1-3 14-4-1z"/>', org: '<path d="M3 21h18 M5 21V8l7-4 7 4v13 M9 21v-6h6v6"/>',
  bow: '<path d="M3 6l7 6-7 6z M21 6l-7 6 7 6z M10 10h4v4h-4z"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4"/>' }[k] || '');
const lpSvg = (k) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${lpIcon(k)}</svg>`;
const LP_STEPS = [
  ['Faculty assign', 'Faculty choose case-based activities from the library and assign them to a class, a section or teams, with a due date.'],
  ['Students review the chart', 'Each activity opens a full patient chart in a training EHR: handoff report (read or listen), notes, nursing assessment, vital signs, results, MAR, orders and history.'],
  ['Judge and decide', 'Students sort competing needs by urgency and answer clinical judgment items (prioritize, matrix, bow-tie, highlight, drop-down, select-all and open responses), then submit the Word activity.'],
  ['Faculty grade', 'Objective items are scored automatically; faculty see every answer beside the key and rationale, grade the open responses and return feedback.']];
function lpNav(signIn = true) {
  const n = S.site.siteName || 'BedsideLab';
  return `<header class="lp-nav"><div class="lp-in"><a class="lp-brand" href="/"><span class="brand-mark">${MARK_SVG}</span><b>${esc(n)}</b><span>Nursing Clinical Judgment Practicum</span></a>
    <nav aria-label="Front page"><a href="/#features">Features</a><a href="/#how">How it works</a><a href="/#roles">Who it is for</a><a href="/#library">Activities</a><a href="/join">Join a class</a>${S.pubProgram?.open ? '<a href="/register"><b>Get certified</b></a>' : ''}${signIn ? '<a class="btn primary sm" href="#signin" data-act="lp-signin">Sign in</a>' : ''}</nav></div></header>`;
}
const lpFoot = () => `<footer class="lp-foot"><div class="lp-in"><div><b>${esc(S.site.siteName || 'BedsideLab')}</b><span>Case-based clinical judgment activities for nursing programs.</span></div>
  <div class="small">All patients and records are fictional and for education only. Clinical content follows the NCSBN Clinical Judgment Measurement Model; verify against current guidelines and local policy.</div></div></footer>`;

const lpProgram = () => { const pr = S.pubProgram; if (!pr?.open) return '';
  const st = [['Register online', 'No college needed. Create your own account in a minute.'], ['Pay ' + pr.fee + ' ' + pr.currency, 'Pay the one-time fee and upload your receipt. We confirm it and open your activities.'], ['Work the cases', `${pr.practicals} case-based clinical judgment activities on realistic patient charts. Upload your completed document for each one.`], ['Get your certificate', `Pass every activity with ${pr.passMark}% or more (resubmit any you miss) and download your certificate.`]];
  return `<section class="lp-band lp-program" id="program"><div class="lp-in">
    <div class="lp-head"><span class="lp-eyebrow">Online certificate program · open to everyone</span><h2>${esc(pr.title)}</h2><p>${esc(pr.summary)}</p></div>
    <ol class="lp-steps">${st.map(([t, d], i) => `<li><span class="lp-num">${i + 1}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('')}</ol>
    <div class="row" style="justify-content:center;margin-top:24px"><a class="btn primary lg" href="/register">Register for ${esc(pr.fee + ' ' + pr.currency)}</a><a class="btn lg" href="#signin" data-act="lp-signin">Already registered? Sign in</a></div>
  </div></section>`; };
VIEWS.landing = () => { if (S.pubProgram === undefined) setTimeout(loadPubProgram); return lpLanding(); };
const lpLanding = () => `<div class="lp">${lpNav()}
  <section class="lp-hero"><div class="lp-in lp-hero-grid">
    <div class="lp-hero-text"><span class="lp-eyebrow">For nursing programs</span>
      <h1>Practice clinical judgment on patients who feel real.</h1>
      <p class="lp-lead">${esc(S.site.siteName || 'BedsideLab')} gives every nursing student multi-faceted, holistic patient cases in a training EHR. Students evaluate and organize competing needs by urgency and make simple to complex clinical judgments about their patient's care, just like in practice.</p>
      <div class="row"><a class="btn primary lg" href="#signin" data-act="lp-signin">Sign in</a><a class="btn lg" href="/join">Join a class</a></div>
      <ul class="lp-proof"><li><b>33</b> case-based activities</li><li><b>228</b> clinical judgment items</li><li><b>6</b> units, Apply/Analyze to Evaluate/Create</li></ul></div>
    <figure class="lp-shot lp-shot-hero"><div class="lp-shot-bar"><i></i><i></i><i></i><span>BedsideLab EHR</span></div><img src="/img/ehr_handoff.jpg" alt="The BedsideLab training EHR showing a patient storyboard and the handoff report" width="1280" height="800"></figure>
  </div></section>

  ${lpProgram()}
  <section class="lp-band" id="features"><div class="lp-in">
    <div class="lp-head"><span class="lp-eyebrow">Features</span><h2>Everything a clinical judgment practicum needs, in one place</h2><p>No software to install. Faculty assign, students review the chart and decide, faculty grade.</p></div>
    <div class="lp-feat">${[
      ['ehr', 'A training EHR for every case', 'Storyboard with allergies, code status and alerts; notes, nursing assessment flowsheets, vital sign trends, results, MAR, orders, intake and output, scales, imaging and history: 32 fictional patients from newborn to 86 years.'],
      ['ear', 'Handoff reports you can hear', 'Each case starts with a shift handoff in the off-going nurse\'s words, with a Listen button, so students practise picking out the cues that matter.'],
      ['bow', 'Next Generation item types', 'Prioritize, matrix, bow-tie, highlight, drop-down (cloze), select all that apply, multiple choice and open responses, mapped to the NCSBN clinical judgment model.'],
      ['grade', 'Scored automatically, explained fully', 'Objective items are scored on save with +/- scoring where the NCLEX uses it. Rationales appear for students once graded (or at once in practice mode).'],
      ['lib', '33 activities in six units', 'Communication, prioritization, acute deterioration, patient-centered teaching, mental health and ethics, transitions and teamwork, each with a Word activity and a faculty key.'],
      ['book', 'Clinical reference built in', 'The clinical judgment model, priority frameworks, SBAR, therapeutic communication, adult and pediatric reference ranges and handy rules, one click away in every chart.'],
      ['org', 'For many colleges', 'Each college has its own address, logo, colours, faculty, students and patient charts, with student limits and subscription dates managed by the provider.'],
      ['shield', 'Private and secure', 'Role-based access, hashed passwords, students never see keys before grading, and fictional patients only.'],
    ].map(([i, t, d]) => `<article class="lp-card"><span class="lp-ico">${lpSvg(i)}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}</div>
  </div></section>

  <section class="lp-band alt" id="how"><div class="lp-in">
    <div class="lp-head"><span class="lp-eyebrow">How it works</span><h2>From assignment to grade in four steps</h2></div>
    <ol class="lp-steps">${LP_STEPS.map(([t, d], i) => `<li><span class="lp-num">${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}</ol>
    <div class="lp-gallery">
      <figure class="lp-shot"><div class="lp-shot-bar"><i></i><i></i><i></i><span>Activity</span></div><img src="/img/ehr_activity.jpg" alt="Clinical judgment items in the chart's Activity tab" loading="lazy" width="1280" height="800"><figcaption>Answer prioritize, matrix, bow-tie and other items beside the chart.</figcaption></figure>
      <figure class="lp-shot"><div class="lp-shot-bar"><i></i><i></i><i></i><span>Vital signs</span></div><img src="/img/ehr_vitals.jpg" alt="Vital sign flowsheet with trends" loading="lazy" width="1280" height="800"><figcaption>Spot trends in flowsheets, results and the MAR, the way nurses do.</figcaption></figure>
      <figure class="lp-shot"><div class="lp-shot-bar"><i></i><i></i><i></i><span>Grading</span></div><img src="/img/grade.jpg" alt="The faculty grading page with each answer beside the key" loading="lazy" width="1280" height="800"><figcaption>Grade with every answer, the key and the rationale on one page.</figcaption></figure>
    </div>
  </div></section>

  <section class="lp-band" id="roles"><div class="lp-in">
    <div class="lp-head"><span class="lp-eyebrow">Who it is for</span><h2>One platform, a clear job for each role</h2></div>
    <div class="lp-roles">${[
      ['Students', ['Sign in with the email and temporary password from your faculty, or join with a class code.', 'Open each assignment and its patient chart; start with the handoff report.', 'Answer the clinical judgment items in the Activity tab; your answers save to the assignment.', 'Upload your completed document; see grades, feedback and rationales under My grades.']],
      ['Faculty', ['Add students one at a time, import a class list or share a class code; place them in sections and teams.', 'Assign activities from the library, or write your own items on the built-in patients or your own charts.', 'See auto-scored results at a glance and grade open responses beside the model answers.', 'Turn on practice mode when you want students to see rationales right away.']],
      ['College admins', ['Set your college\'s logo, colours and name.', 'Create faculty accounts and time-limited guest previews.', 'Follow completion across every assignment on the Overview page.', 'Keep built-in content up to date after each release.']],
    ].map(([t, items]) => `<article class="lp-role"><h3>${t}</h3><ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></article>`).join('')}</div>
  </div></section>

  <section class="lp-band alt" id="library"><div class="lp-in lp-split">
    <div><span class="lp-eyebrow">Activity library</span><h2>33 cases across the lifespan</h2>
      <p>From a stillbirth on the postpartum unit and a teenager in diabetic ketoacidosis to sepsis after surgery, an interpreter-supported discharge, lithium toxicity, end-of-life care and delegation on a busy unit. Every activity comes with a patient chart, a student Word document, a faculty answer key with rationales, and auto-scored items. Faculty can edit any activity, write new items or build their own patient charts.</p>
      <table class="lp-table"><tbody>${[['Unit 1 · Communication and noticing cues', 5], ['Unit 2 · Analyzing cues and prioritizing', 6], ['Unit 3 · Taking action in acute situations', 8], ['Unit 4 · Patient-centered care and teaching', 5], ['Unit 5 · Mental health, safety and ethics', 5], ['Unit 6 · Transitions, teams and systems', 4]].map(([g, n]) => `<tr><td>${g}</td><td class="num"><b>${n}</b></td></tr>`).join('')}</tbody></table></div>
    <figure class="lp-shot"><div class="lp-shot-bar"><i></i><i></i><i></i><span>Activity library</span></div><img src="/img/library.jpg" alt="The activity library" loading="lazy" width="1280" height="800"></figure>
  </div></section>

  <section class="lp-band lp-signin-band" id="signin"><div class="lp-in lp-split">
    <div><span class="lp-eyebrow">Sign in</span><h2>Welcome back</h2>
      <p>Sign in with the email address and password your college gave you.</p>
      <a class="btn lg lp-join-btn" href="/join">New student? Create your account with a class code</a>
      <ol class="lp-mini">${[...(S.pubProgram?.open ? [['Independent learner?', 'Register yourself for the online certificate program at <a href="/register">Get certified</a>. No college needed.']] : []), ['New student?', 'Get a class code from your faculty and create your own account at Join a class, or use the temporary password your faculty gave you.'], ['New faculty member?', 'Your college admin creates your account.'], ['New college?', 'Contact your BedsideLab provider to set up your college and its admin account.']].map(([t, d]) => `<li><b>${t}</b> ${d}</li>`).join('')}</ol></div>
    <div class="lp-form panel panel-pad">${LP_LOGIN_FORM()}</div>
  </div></section>
  ${lpFoot()}</div>`;

VIEWS.collegeLogin = () => {
  const s = S.site; const org = s.orgName || 'your college';
  const logo = s.logo ? `<span class="lp-logo"><img src="${esc(s.logo)}" alt="${esc(org)} logo"></span>` : `<span class="lp-logo mark">${MARK_SVG}</span>`;
  return `<div class="lp lp-college">
    <aside class="lp-side"><div class="lp-side-in">
      <a class="lp-side-brand" href="/">${logo}<div><b>${esc(s.siteName || 'BedsideLab')}</b><span>${esc(org)}</span></div></a>
      <h1>Nursing clinical judgment practicum</h1><p class="lp-lead">Review realistic patient charts, sort competing needs by urgency, make clinical judgments and get feedback from your faculty.</p>
      <ol class="lp-steps vertical">${LP_STEPS.map(([t, d], i) => `<li><span class="lp-num">${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
      <p class="lp-side-foot">Fictional patient data for education only. <a href="/">About BedsideLab</a></p></div></aside>
    <main class="lp-main"><div class="lp-main-in">
      <h2>Sign in to ${esc(org)}</h2><p class="muted">Use the email and password your college gave you.</p>
      ${LP_LOGIN_FORM()}
      <a class="btn lp-wide lp-join-alt" href="/join">New student? Create your account with a class code</a>
      <div class="lp-help"><h3>First time here?</h3>
        <dl><dt>Students</dt><dd>Use the class code from your faculty to create your own account, or sign in with the temporary password your faculty gave you. You will then see <b>My assignments</b>.</dd>
        <dt>Faculty</dt><dd>Your college admin creates your account. After signing in you can add students, assign activities and grade.</dd>
        <dt>Admins</dt><dd>Your BedsideLab provider sends your first sign-in details. Set your college's look under <b>Appearance</b> and add faculty.</dd></dl></div>
    </div></main></div>`;
};
VIEWS.collegeMissing = () => `<div class="lp">${lpNav()}<section class="lp-band"><div class="lp-in" style="max-width:640px">
  <div class="panel empty"><b>College not found</b><span>The address /c/${esc(S.orgSlug)} does not match a college on BedsideLab. Check the link your college sent you, or sign in on the front page.</span><a class="btn primary" href="/#signin">Go to sign in</a></div></div></section>${lpFoot()}</div>`;
VIEWS.setup = () => `<div class="lp lp-college"><aside class="lp-side"><div class="lp-side-in"><a class="lp-side-brand" href="/"><span class="lp-logo mark">${MARK_SVG}</span><div><b>BedsideLab</b><span>Nursing Clinical Judgment Practicum</span></div></a>
    <h1>Set up your BedsideLab site</h1><p class="lp-lead">You are the owner of this installation. After creating your account you will:</p>
    <ol class="lp-steps vertical">${[['Add a college', 'Give it a name and a web address, for example /c/kfu, and enter its admin\'s name and email.'], ['Send the admin their sign-in details', 'BedsideLab shows a temporary password once. The admin chooses their own password at first sign-in.'], ['The college sets itself up', 'The admin adds a logo and faculty; faculty add students and assign activities.'], ['Manage plans', 'Set student limits and subscription dates, renew, pause or resume colleges.']].map(([t, d], i) => `<li><span class="lp-num">${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol></div></aside>
  <main class="lp-main"><div class="lp-main-in"><h2>Create the owner account</h2><p class="muted">This account manages colleges and plans. It cannot see students or their work.</p>
    <form class="stack" data-form="setup">
      <label class="field"><span>Your name</span><input type="text" id="su-name" name="name" required></label>
      <label class="field"><span>Email</span><input type="text" id="su-email" name="email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>Password (at least 8 characters)</span><input type="password" id="su-pw" name="password" autocomplete="new-password" required></label>
      <button class="btn primary lp-wide" type="submit">Create owner account</button></form></div></main></div>`;

VIEWS.join = () => {
  const j = S.join || (S.join = {}); const info = j.info;
  if (j.code && !j.checked && !info) { j.checked = true; setTimeout(() => joinCheck(j.code), 0); }
  const steps = [['Get your class code', 'Your faculty gives you a code such as K7QM-4XRA, or a link that already contains it.'], ['Create your account', 'Enter your name, your college email and a password you choose (at least 8 characters).'], ['Open your assignments', 'You are placed in your class automatically. Assignments from your faculty appear under My assignments.'], ['Practice in the EHR', 'Open each assignment\'s patient record, code it in the Coding activity and submit your work.']];
  const ok = info && info.ok;
  return `<div class="lp lp-college">
    <aside class="lp-side"><div class="lp-side-in"><a class="lp-side-brand" href="/"><span class="lp-logo mark">${MARK_SVG}</span><div><b>${esc(S.site.siteName || 'BedsideLab')}</b><span>Nursing Clinical Judgment Practicum</span></div></a>
      <h1>Join your class</h1><p class="lp-lead">Create your student account in two minutes and start practicing clinical judgment on realistic patient cases.</p>
      <ol class="lp-steps vertical">${steps.map(([t, d], i) => `<li><span class="lp-num">${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
      <p class="lp-side-foot">Already have an account? <a href="/#signin">Sign in</a></p></div></aside>
    <main class="lp-main"><div class="lp-main-in">
      ${ok ? `<div class="join-org">${info.logo ? `<img src="${esc(info.logo)}" alt="">` : `<span class="lp-logo mark sm">${MARK_SVG}</span>`}<div><b>${esc(info.college)}</b><span>${info.section ? 'Section ' + esc(info.section) : 'All students'} · Class code <span class="mono">${esc(j.code)}</span></span></div></div>
        <h2>Create your student account</h2>
        <form class="stack" data-form="join"><input type="hidden" name="code" value="${esc(j.code)}">
          <label class="field"><span>Full name (as your college records it)</span><input type="text" id="jn-name" name="name" required autocomplete="name"></label>
          <label class="field"><span>College email</span><input type="text" id="jn-email" name="email" required inputmode="email" autocomplete="email" placeholder="you@college.edu"></label>
          <label class="field"><span>Choose a password (at least 8 characters)</span><input type="password" id="jn-pw" name="password" required autocomplete="new-password" minlength="8"></label>
          <label class="field"><span>Repeat the password</span><input type="password" id="jn-pw2" name="repeat" required autocomplete="new-password" minlength="8"></label>
          <button class="btn primary lp-wide" type="submit">Create my account</button>
          <p class="hint">Your email becomes your username. Your faculty can see your name, email, submissions and grades. All patient records are fictional.</p>
          <button class="btn sm" type="button" data-act="join-reset">Use a different class code</button></form>`
      : `<h2>Enter your class code</h2><p class="muted">Your faculty gives you this code. It is 8 letters and numbers, for example K7QM-4XRA.</p>
        <form class="stack" data-form="join-code"><label class="field"><span>Class code</span><input type="text" id="jn-code" name="code" value="${esc(j.code || '')}" required autocomplete="off" spellcheck="false" class="join-input" placeholder="XXXX-XXXX"></label>
          ${j.err ? `<p class="join-err" role="alert">${esc(j.err)}</p>` : ''}
          <button class="btn primary lp-wide" type="submit">Continue</button></form>
        <div class="lp-help"><h3>No code?</h3><dl><dt>Students</dt><dd>Ask your faculty for your class code or sign-in details.</dd><dt>Faculty</dt><dd>Create class codes on the <b>Students</b> page after you sign in.</dd></dl></div>`}
    </div></main></div>`;
};
document.addEventListener('click', e => {
  if (e.target.closest('[data-act="join-reset"]')) { S.join = { code: '', checked: true }; render(); return; }
  const el = e.target.closest('[data-act="lp-signin"]'); if (!el) return;
  e.preventDefault(); document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => document.getElementById('li-email')?.focus({ preventScroll: true }), 450);
});
