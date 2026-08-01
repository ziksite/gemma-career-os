/** Menyediakan CV contoh agar demo bisa dijalankan tanpa menyiapkan file. */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  const text = await readFile(join(process.cwd(), 'data', 'sample-cv.txt'), 'utf8');
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
