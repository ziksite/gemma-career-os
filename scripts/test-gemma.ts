/**
 * Smoke test integrasi Gemma.
 *   npm run gemma:test
 *
 * Menguji 4 hal yang dipakai Gemma Career OS:
 *   1. Auth + koneksi ke Vertex AI
 *   2. Chat biasa (dengan thinking)
 *   3. Streaming
 *   4. Structured JSON output (basis semua agent)
 */

import { chat, chatJSON, chatStream, getAuthSource, getConfig } from '../src/lib/gemma/index';

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const fail = (m: string) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const head = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  head('Konfigurasi');
  const cfg = getConfig();
  console.log(`  project : ${cfg.projectId}`);
  console.log(`  region  : ${cfg.region}`);
  console.log(`  model   : ${cfg.model}`);
  console.log(`  url     : ${cfg.url}`);

  // ── 1. Chat dasar ──────────────────────────────────────────────────────────
  head('1. Chat (non-streaming)');
  const res = await chat([{ role: 'user', content: 'Summer travel plan to Paris' }], {
    maxTokens: 512,
  });
  ok(`auth via: ${getAuthSource()}`);
  ok(`respons ${res.latencyMs} ms, finish_reason=${res.finishReason}`);
  if (res.usage) {
    ok(`token: prompt=${res.usage.promptTokens} completion=${res.usage.completionTokens}`);
  }
  if (res.thinking) ok(`thinking terdeteksi (${res.thinking.length} char)`);
  console.log(`\n  ${res.text.slice(0, 300).replace(/\n/g, '\n  ')}...\n`);

  // ── 2. Streaming ───────────────────────────────────────────────────────────
  head('2. Streaming');
  process.stdout.write('  ');
  let chunks = 0;
  for await (const piece of chatStream(
    [{ role: 'user', content: 'Sebutkan 3 skill wajib Product Manager. Singkat saja.' }],
    { maxTokens: 300, enableThinking: false },
  )) {
    process.stdout.write(piece.replace(/\n/g, '\n  '));
    chunks++;
  }
  console.log();
  ok(`${chunks} chunk diterima`);

  // ── 3. Structured output ───────────────────────────────────────────────────
  head('3. Structured JSON (pola agent Gemma Career OS)');
  interface AtsResult {
    ats_score: number;
    missing_keywords: string[];
    recommendation: string;
  }
  const { data } = await chatJSON<AtsResult>(
    [
      {
        role: 'user',
        content: [
          'Job Description: Product Manager, butuh SQL, A/B testing, roadmap ownership, stakeholder management.',
          'Kandidat: 3 tahun QA Engineer, kuasai manual testing, Jira, dasar SQL.',
          '',
          'Keluarkan JSON dengan field: ats_score (0-100), missing_keywords (array string), recommendation (string 1 kalimat).',
        ].join('\n'),
      },
    ],
    { system: 'Kamu ATS Specialist di Gemma Career OS.', maxTokens: 800 },
  );
  ok(`ats_score = ${data.ats_score}`);
  ok(`missing_keywords = ${JSON.stringify(data.missing_keywords)}`);
  ok(`recommendation = ${data.recommendation}`);

  head('Semua tes lulus. Gemma siap dipakai.');
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
