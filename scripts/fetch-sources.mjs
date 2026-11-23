import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const sources = new URL('../dist/sources/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', sources), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function fetchPDF(name, url, expected) {
  const target = new URL(name, sources);
  const existing = await readFile(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (existing && sha256(existing) === expected) return;
  const bytes = execFileSync('curl', [
    '--proto', '=https', '--proto-redir', '=https', '--fail', '--silent', '--show-error', '--location',
    '--retry', '3', '--max-time', '45', url,
  ], { maxBuffer: 25 * 1024 * 1024 });
  if (sha256(bytes) !== expected) throw new Error(`IPA PDF checksum mismatch: ${name}`);
  const temporary = new URL(name + '.tmp', sources);
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

for (const [year, files] of Object.entries(provenance)) {
  await fetchPDF(`${year}-questions.pdf`, files.questionUrl, files.sha256);
  await fetchPDF(`${year}-answers.pdf`, files.answerUrl, files.answerSha256);
}
console.log('Verified 14 IPA PDFs by SHA-256.');
