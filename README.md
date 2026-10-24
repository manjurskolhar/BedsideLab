# BedsideLab — Nursing Clinical Judgment Practicum

A website where nursing students practise clinical judgment on realistic, fictional patients. Each case-based activity uses a multi-faceted, holistic patient chart in a training EHR, and asks students to evaluate and organize competing needs by urgency and make simple to complex clinical judgments about their patient's care, just like in practice.

One installation serves **many colleges**, each with its own address, look, people, patient charts and subscription plan (the same platform design as SQLLab).

- **Owner** (you, the provider) creates colleges, sets each college's student limit and subscription end date, and can pause or renew them. The owner sees each college's numbers but never its students or their work.
- **College admin** sets the college's logo and colours and creates faculty and guest accounts.
- **Faculty** create student accounts (one at a time, by importing a class list, or with class codes), assign activities from the library, write their own items and patient charts, review the auto-scored answers and grade.
- **Students** sign in, open the activity's patient chart, review it like a nurse at the start of a shift, answer the clinical judgment items (saved to the assignment and scored automatically), and upload their completed Word document.

**The patient chart (training EHR).** Each activity opens a chart laid out like a hospital EHR: a **storyboard** on the left (name, age, MRN, allergies, code status, alerts, encounter, latest vital signs), chart sections for the **Handoff report** (with a **Listen** button that reads it aloud), **Notes**, nursing **Assessment** flowsheets, **Vital signs** with trend lines and abnormal flags, **Results**, **MAR**, **Orders**, **History** (problems, history, home medications, contacts, allergies), **Intake & output**, **Scales & imaging** and **Documents**, plus the **Activity** tab with the items and a **Clinical reference**.

**Clinical judgment items (Next Generation NCLEX style).** Multiple choice, select all that apply, prioritize (put in order), matrix, drop-down (cloze), highlight the findings, bow-tie, and open responses. Each item is tagged with the step of the NCSBN Clinical Judgment Measurement Model it practises (recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes).

**Scoring.** Objective items are scored on the server when students save: select-all and highlight items use **+/- scoring** (each wrong choice cancels a right one, never below zero), prioritize items earn 1 point per option in the correct position, matrix and drop-down items 1 point per row or blank, and bow-ties 1 point per correct pick. Open responses are graded by faculty with the model answers. Faculty see every answer beside the key and rationale, with a suggested score. Students see their scores, the correct answers and rationales only once the work is graded, or immediately when faculty assign in **practice mode**. Students never receive keys, rationales or model answers before then.

## What is included

- **33 case-based activities in six units**, each with a patient chart, items with rationales, a student Word activity document (case, patient snapshot, a "recognize cues" worksheet, every item with space for reasoning, reflection) and a faculty answer key. **228 items** in all. Each activity is marked **Apply/Analyze** or **Evaluate/Create**.

| Unit | Cases |
|---|---|
| **1 · Communication and noticing cues** | 1 Perinatal Loss: Therapeutic Communication After a Stillbirth · 2 Hard News: Responding to a New Lung Cancer Diagnosis · 3 Faith, Fasting and Diabetes: Culturally Responsive Teaching Before Ramadan · 4 Lost in Translation: Discharge Teaching with an Interpreter · 5 Calm in the Storm: De-escalation in Alcohol Withdrawal |
| **2 · Analyzing cues and prioritizing** | 6 Spinal Cord Injury: Prioritizing Care for an Adolescent with Tetraplegia · 7 The Quiet Slide: Recognizing Early Sepsis After Surgery · 8 Breathless at Night: Acute Decompensated Heart Failure · 9 Fruity Breath: Diabetic Ketoacidosis in a Teenager · 10 Time Is Brain: Acute Ischemic Stroke in the Emergency Department · 11 A Dangerous Combination: Acute Kidney Injury and Hyperkalemia |
| **3 · Taking action in acute situations** | 12 The First Hour: Postpartum Hemorrhage · 13 Preeclampsia with Severe Features: Magnesium Sulfate Safety · 14 Too Quiet at 03:00: Opioid-Induced Respiratory Depression · 15 Fifteen Minutes In: Acute Transfusion Reaction · 16 Minutes Matter: Anaphylaxis to an IV Antibiotic · 17 Shaky and Confused: Hypoglycemia in a Hospitalized Older Adult · 18 Every Breath Counts: Asthma Exacerbation in a School-Age Child · 19 Sudden Breathlessness: Pulmonary Embolism After Hip Replacement |
| **4 · Patient-centered care and teaching** | 20 Shared Decision-Making in Hypertension and Kidney Disease, Part 1: Understanding the Person (QSEN patient-centered care) · 21 Part 2: Building the Plan Together · 22 A New Ileostomy: Teaching Self-Care Before Discharge · 23 Too Many Pills: Polypharmacy and Falls in an Older Adult · 24 Yellow on Day 3: Newborn Jaundice and Breastfeeding Support |
| **5 · Mental health, safety and ethics** | 25 Asking the Hard Question: Suicide Risk After an Intentional Overdose · 26 Narrow Margin: Lithium Toxicity in Bipolar Disorder · 27 Person-Centered Dementia Care: Agitation Without Restraints · 28 Honoring Her Wishes: Goals of Care at the End of Life · 29 Behind Closed Doors: Recognizing Intimate Partner Violence in Pregnancy |
| **6 · Transitions, teams and systems** | 30 Can He Afford to Recover? Medication Costs After a Heart Attack · 31 Speaking Up: Early Warning Scores, SBAR and the Chain of Command · 32 Five Patients, One Shift: Delegation and Prioritization · 33 Breaking the Chain: Clostridioides difficile and Infection Prevention |

- **32 fictional patients** across the lifespan (a 3-day-old newborn to an 86-year-old) in inpatient, emergency and outpatient settings, with diverse names, languages, religions and family situations.
- **Clinical reference**: the clinical judgment model, priority frameworks (ABCs, Maslow, acute vs chronic), SBAR, therapeutic communication techniques and blocks, adult and pediatric reference ranges, and handy rules (MAP, rule of 15, Parkland, maintenance fluids, medication safety).
- **A small illustration for every case**, coloured by unit, on library cards, assignment pages and the Word documents.
- **Guides** in `guides/`: Student quick guide, Faculty and admin quick guide, Owner guide and Online program guide (Word).
- Everything from the platform: class codes, teams and group activities, guest accounts, the online certificate program with paid registration and certificates, appearance themes and logos, read-only expiry, and built-in content updates.

## 1. Requirements

- **Node.js 22.16 or newer** (uses the built-in SQLite engine for the site database). Check with `node -v`.
- No other software, no `npm install`.

## 2. Run it

```bash
cd bedsidelab
node server.js
```

On Windows you can double-click **start-bedsidelab.bat**. Open **http://localhost:8080**. The first visit shows **Set up BedsideLab**: create the **owner** account, then add a college under **Colleges**.

Change the port with `PORT=3000 node server.js`.

**Try it with demo accounts:** run `node server.js --demo` once (it creates "Demo College" at `/c/demo`, with Cases 1 and 7 already assigned, and an online academy at `/c/online`), then `node server.js`:

| Role | Email | Password |
|---|---|---|
| Owner | owner@bedsidelab.local | Owner@2026 |
| Admin | admin@bedsidelab.local | Admin@2026 |
| Faculty | faculty@bedsidelab.local | Faculty@2026 |
| Student | student@bedsidelab.local | Student@2026 |
| Online program admin (`/c/online`) | program@bedsidelab.local | Program@2026 |
| Online learner, awaiting payment (`/c/online`) | learner@bedsidelab.local | Learner@2026 |

Change these passwords (My account) or remove the accounts before real use. Running `--demo` again resets them.

## 3. Using it

**Assign:** Activity library → filter by unit, level or tag → tick activities → **Assign selected** → choose section and due date, and optionally **practice mode**.

**Students:** My assignments → open an activity → **Open patient chart** → start with the **Handoff report** → review the chart → answer in **Activity** (saves automatically) → download, complete and upload the Word document.

**Grade:** Assigned work → Submissions → Grade. Each item shows the student's answer beside the key and rationale (or model answer for open responses). The suggested score covers the auto-scored items; add the points you award for the open responses.

**Write your own:** **New activity** or **Edit activity** opens the builder: unit, level, clinical judgment steps, scenario, patient chart and items. Select-all and highlight keys are option numbers (`1, 3, 4`); prioritize items are entered in the correct order (students see them shuffled); drop-downs use `[[choice | *correct choice | choice]]`; bow-ties list conditions, actions and parameters with the correct numbers. **Check items** validates everything before saving.

**Patient charts:** Patient charts → Open, Edit (JSON), Duplicate or **New patient chart** (starts from a template that shows every section). Editing a built-in chart makes your college's own copy.

Colleges, plans, people, class codes, teams, guests, appearance and the online certificate program work exactly as in SQLLab; see the guides in `guides/`.

## 4. Production

Run behind HTTPS (for example nginx proxying to port 8080) with `COOKIE_SECURE=1`, as a service (systemd) or with Docker:

```bash
docker build -t bedsidelab .
docker run -d -p 8080:8080 -v bedsidelab-data:/app/data --name bedsidelab bedsidelab
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port the server listens on |
| `COOKIE_SECURE` | off | Set to `1` when served over HTTPS |
| `BEDSIDELAB_DATA` | `./data` | Folder for the database and uploads |

**Updating:** stop the server, replace the program files, keep the `data` folder, start again. If the admin Overview (or the owner's Colleges page) says built-in content differs, click **Update built-in content**.

**Backups:** everything lives in `data/` (`data/bedsidelab.db` and `data/files/`). Back it up daily.

## 5. Rebuilding the content (optional)

The cases are written in `tools/cases/unit1.js` … `unit6.js` (patient charts, items, rationales, model answers). Then:

```bash
sh tools/build-all.sh
```

| Step | What it does |
|---|---|
| `tools/build-content.js` | Converts the authored cases to `tools/cases.json`, validates every item and confirms each key scores full marks (the build fails otherwise). |
| `tools/build-icons.js`, `build-icon-png.py` | Draw the case illustrations (SVG, and PNG for the Word documents; needs Python Playwright). |
| `tools/build-docs.js` | Builds the 66 Word documents (student activity + answer key per case). Needs the `docx` npm package. |
| `tools/build-seed.js` | Writes `seed/seed.json`. |
| `tools/build-guides.js` | Builds the four Word guides. |

## 6. Security notes

- Passwords are salted scrypt hashes; sessions are HttpOnly cookies that expire after 7 days; sign-in is rate limited.
- Every request is limited to the user's own college. Students and guests never receive item keys, rationales, model answers or answer-key documents; rationales are revealed only after grading or in practice mode.
- Uploads are limited to 20 MB and to document and image types.

## 7. Before using the content with students

All patients, records, prices and organizations are fictional. Clinical content was written to reflect common nursing education standards and widely used guidelines (for example the NCSBN Clinical Judgment Measurement Model, Surviving Sepsis, AAP 2022 hyperbilirubinemia, AHA/ASA stroke, IDF-DAR Ramadan guidance, Beers Criteria, TeamSTEPPS, NEWS2), but practice, doses and thresholds vary and change. **Review each case, key and rationale against current guidelines and your local policies before grading**, and adapt as needed with the activity builder.
