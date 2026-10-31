import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const roots = ['src', 'tests', 'modules'];
const files = [];

async function findTests(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'third_party') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await findTests(path);
    else if (entry.isFile() && /\.test\.[cm]?tsx?$/.test(entry.name)) files.push(path);
  }
}

for (const root of roots) await findTests(root);
files.sort();
if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
const result = spawnSync(process.execPath, [tsxCli, '--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
