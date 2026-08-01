/**
 * Demo mode agentic: Gemma yang memutuskan agent mana yang dipanggil.
 *
 *   npm run route -- "CV saya sudah bagus belum untuk posisi PM?"
 *   npm run route -- "Latihan interview dong"
 *   npm run route -- "Carikan lowongan remote"
 */

import { route } from '../src/lib/agents/index';

const message = process.argv.slice(2).join(' ').trim();

if (!message) {
  console.error('Pakai: npm run route -- "permintaanmu"');
  process.exit(1);
}

const decision = await route(message);

console.log(`\nPermintaan : "${message}"`);
console.log(`Agent      : ${decision.agents.join(' → ')}`);
console.log(`Alasan     : ${decision.reasoning}`);
if (decision.directReply) console.log(`Jawaban    : ${decision.directReply}`);
console.log();
