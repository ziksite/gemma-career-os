# Gemma Career OS

**Your AI career partner, powered by Gemma 4.**

Build with Gemma: Gemma Hacking Jakarta! Extended Series 26
Hackathon Writeup — Aug 1, 2026

---

## Project Name

Gemma Career OS

## Team Members

- [Nama] — [Kaggle username]
- [Nama] — [Kaggle username]

> **[ISI SENDIRI]** Ganti dengan nama dan username Kaggle kedua anggota tim.

## Problem Statement

Looking for a job in Indonesia means running five disconnected tools at once: job boards
(LinkedIn, Jobstreet, Glints, Kalibrr), a resume builder, an ATS checker, a cover letter
generator, and an interview simulator. None of them share context, so the job seeker carries
the integration burden — remembering what was tried, copying data between tabs, and deciding
what to do next.

The result is blind applying. A hundred applications, three replies, and no idea which part
failed: missing keywords, irrelevant experience, or a target that was never realistic to begin
with. Existing tools answer questions. Nobody tells a candidate *"don't apply to this one yet,
here is what to fix first."*

## Proposed Solution

- **Main Idea: Gemma Career OS** — a multi-agent career partner powered by Google's open-weights
  Gemma 4 26B on Vertex AI Model Garden. The user states a goal, not a sequence of commands, and
  an 8-agent swarm works backward from it.
- **Intended Users:** Indonesian job seekers, particularly career switchers (QA → Product Manager,
  Engineer → Data, and similar) who need an honest read on how far the gap really is.
- **Core User Experience:** Paste a CV, state a career goal → the swarm runs live on screen →
  a single dashboard returns a Career Health score, a 5-day Career Mission, ranked jobs with
  pass-probability, ATS gap analysis, a rewritten CV, a learning roadmap, and interview questions.
- **Expected Outcome / Benefit:** The candidate learns *why* they are being rejected and what to
  do this week. The system is built to say "not yet" — a job scoring 45% returns `improve_first`
  with the exact gap, not encouragement to apply anyway.

## Gemma Integration

Gemma is the judgement engine, not a formatting layer. Every decision that requires reasoning is
a Gemma call. Deployed on Vertex AI Model Garden (MaaS) across 8 specialized agent nodes:

- `resume_specialist` — parses raw CV text into a structured profile with evidence-backed skill
  levels, then rewrites bullets for a target role.
- `career_strategist` — turns a free-text goal ("gaji 20 juta") into a structured target, then
  builds milestones, daily missions, and named risks.
- `career_twin` — maintains the user's digital career profile.
- `job_hunter` — scores each posting by probability of passing screening, returns
  `apply_now` / `improve_first` / `skip` plus the projected score after closing the gap.
- `ats_specialist` — keyword match, hard blockers, and an ATS score constrained so that any hard
  blocker caps the score at 55.
- `skill_mentor` — a learning roadmap ordered by impact-per-hour, where every step must produce a
  portfolio artifact, not a course certificate.
- `interview_coach` — questions targeted at the candidate's weakest point, plus what the
  interviewer is listening for.
- `career_health` — explains the score in plain language and names one biggest blocker.

**What is deliberately NOT Gemma.** Career Health aggregation is computed in code with fixed
weights, and Career Twin state merging is a pure function. If an LLM summed the score, a user's
number would drift between sessions without them doing anything; if an LLM merged the profile, it
could silently drop or invent history. Rules such as *"a skill level may only go up"* are enforced
by code. Gemma explains the number; code owns the invariant.

**Prompting and output handling.** Every agent returns JSON validated by a Zod schema at runtime —
never `as Type`. Three real failure modes surfaced only after running against live Vertex AI, and
each is handled:

| Failure observed | Handling | Measured result |
|---|---|---|
| `enable_thinking` consumed ~1,900 chars before answering, truncating JSON | Disabled for structured output | Single call **32.5s → 10.5s** |
| Model returned right content, wrong shape (`id: 1`, `reasons: "one sentence"`, `week: "Minggu 4"`) | Schemas coerce shape instead of rejecting | Repairs **5/10 → 0/10 agents**; pipeline **174s → 112s** |
| Unescaped double quotes inside JSON strings, non-deterministic | Deterministic `repairJsonText`, then a Gemma re-ask only if still broken | Recovered without failing the run |

## Agentic Development Workflow

### Antigravity Use

> **[ISI SENDIRI — 9 poin ada di sini]** Tulis apa yang benar-benar kamu kerjakan di Antigravity:
> file/komponen apa yang dibuat atau di-refactor, prompt atau workflow apa yang dipakai, dan apa
> yang berubah karenanya. Juri menilai bukti konkret, bukan pernyataan umum. Jangan mengarang —
> pengungkapan alat yang dipakai adalah syarat kelayakan.

### Skills and MCP Integration

> **[ISI SENDIRI]** Sebutkan skill atau MCP server yang dipakai selama pengembangan, dan untuk apa.

### Development Impact

Development was driven by evidence from live runs rather than assumptions, and this changed the
product twice:

- The first full pipeline run showed 5 of 10 agents hitting a repair path. The initial hypothesis
  (enum casing) was **wrong**. Adding a `repairReason` field to the agent trace showed the real
  cause was type shape, which led to the schema-coercion fix and a 36% latency drop.
- A failure that never appeared in CLI runs appeared through the browser: malformed JSON syntax
  from unescaped quotes. Because it depends on which sentence the model happens to produce, no
  prompt change could reliably fix it — it needed a deterministic repair layer.

Reliability is locked in by 23 offline tests that run without touching the network, covering
output parsing, schema tolerance, Career Health determinism, and full orchestrator wiring against
a stubbed Gemma backend.

## Google Cloud Architecture

- **Client:** Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS v4.
  Two-column layout — results on the left, a live agent swarm panel and reasoning log on the right.
- **AI Backend:** Vertex AI Model Garden running
  `publishers/google/models/gemma-4-26b-a4b-it-maas` in region `global`, called through the
  OpenAI-compatible Chat Completions surface.
- **Auth:** Google Cloud IAM with a layered token provider — explicit access token, service account
  / Application Default Credentials, or the gcloud CLI — cached and auto-refreshed.
- **Data Flow:** CV + goal → Next.js route handler → orchestrator → 10 Gemma calls (2 stages run in
  parallel) → Zod-validated JSON → deterministic Career Health scoring → Server-Sent Events stream →
  live dashboard. Agent traces are isolated per request via `AsyncLocalStorage` so concurrent users
  never overwrite each other's logs.

**Designed but not built** (listed as design, not as a claim): Cloud Run for hosting,
Cloud SQL (PostgreSQL) for Career Twin persistence, Cloud Storage for uploaded CV files,
Cloud Tasks for proactive background scoring of new postings, and Vertex AI Embeddings + pgvector
for semantic CV↔job pre-matching.

## Functionality

**Working Features:** live 8-agent swarm visualizer with timestamped reasoning log, CV parsing to a
structured profile, deterministic Career Health score with per-component breakdown, 5-day Career
Mission with checkable tasks, job ranking with pass-probability and verdict, ATS keyword and hard
blocker analysis, before/after CV rewrite, impact-ordered learning roadmap, and targeted interview
questions.

**Main User Flow:** state career goal → paste CV → run analysis → watch 8 agents complete in ~100
seconds → read the tabbed dashboard (Summary, Career Mission, Jobs, CV & ATS, Skills, Interview).

**Known Limitations:**

1. **Job listings are not live.** Postings come from a bundled sample set. The scoring is real, the
   list is not. This is stated inside the app itself with a "coming soon: realtime" banner rather
   than hidden. Next: direct integration with LinkedIn, Jobstreet, Glints, and Kalibrr.
2. **PDF upload is UI-only.** Shown as a labeled "soon" upload area; users paste CV text for now.
3. **No persistence.** Results live in browser state, so the Career Twin does not yet grow across
   sessions.
4. **No authentication.** One user per browser session.
5. **`matchScore` is not calibrated.** It is Gemma's judgement, useful for comparing postings
   against each other, not a probability derived from real hiring outcomes.
6. **~100 seconds per full run.** Down from 174s, still slow. Next step is progressive rendering as
   each agent finishes.

## Project Links

- **Public repository:** https://github.com/ziksite/gemma-career-os
- **Deployed application — optional:** Not deployed
- **Public YouTube demo:** [ISI URL]

> **[ISI SENDIRI]** Demo wajib publik, maksimal 3 menit, dan menampilkan alur pengguna utama.

## Instructions to Run

```bash
npm install

cp .env.example .env
# Isi GOOGLE_CLOUD_PROJECT, lalu salah satu kredensial:
#   GOOGLE_ACCESS_TOKEN=...            (hasil `gcloud auth print-access-token`)
#   GOOGLE_APPLICATION_CREDENTIALS=... (path service account JSON)

npm run gemma:test   # verifies connection, streaming, and structured output
npm run dev          # http://localhost:3000

npm test             # 23 offline tests, no network required
npm run demo         # same pipeline in the terminal, useful for debugging
```

## Disclosures

- **Model:** Gemma 4 26B (`gemma-4-26b-a4b-it-maas`) via Vertex AI Model Garden.
- **External APIs:** none beyond Vertex AI.
- **Datasets:** none. `data/sample-cv.txt` and `data/sample-jobs.json` are synthetic examples
  written for this project.
- **AI development tools:** [ISI SENDIRI — sebutkan semua alat AI yang dipakai selama pengembangan]
