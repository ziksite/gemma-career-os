/**
 * Tanya cepat ke Gemma dari terminal (streaming).
 *   npm run gemma:ask -- "Bagaimana cara pindah dari QA ke Product Manager?"
 */

import { chatStream } from '../src/lib/gemma/index';

const prompt = process.argv.slice(2).join(' ').trim();

if (!prompt) {
  console.error('Pakai: npm run gemma:ask -- "pertanyaanmu"');
  process.exit(1);
}

for await (const piece of chatStream([{ role: 'user', content: prompt }])) {
  process.stdout.write(piece);
}
console.log();
