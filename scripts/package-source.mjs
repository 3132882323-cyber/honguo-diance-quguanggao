import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? resolve(projectRoot, '..', 'honguo-diance-quguanggao-source.tar.gz'));
const outputRelativeToProject = relative(projectRoot, output);
if (!outputRelativeToProject || (!outputRelativeToProject.startsWith('..') && !isAbsolute(outputRelativeToProject))) {
  throw new Error('The source archive must be written outside the project directory.');
}

const required = ['App.tsx', 'app.json', 'index.ts', 'package.json', 'pnpm-lock.yaml', 'LICENSE'];
for (const path of required) {
  if (!existsSync(resolve(projectRoot, path))) throw new Error(`Cannot package source: ${path} is missing.`);
}

const candidates = [
  '.github', '.gitattributes', '.gitignore', 'App.tsx', 'LICENSE', 'README.md',
  'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'app.json',
  'babel.config.js', 'metro.config.js', 'index.ts', 'package.json',
  'pnpm-lock.yaml', 'tsconfig.json', 'assets', 'docs', 'modules', 'src',
  'tests', 'third_party', 'extensions', 'scripts',
];
const entries = candidates.filter((path) => existsSync(resolve(projectRoot, path)));
mkdirSync(dirname(output), { recursive: true });

const excludes = [
  '**/node_modules', '**/node_modules/**', '**/.git', '**/.git/**',
  '**/.env', '**/.env.*', '**/.expo', '**/*.log',
  'modules/hongguo-source/build',
  'modules/hongguo-source/android/libs',
  'modules/hongguo-source/android/src/main/jniLibs',
  'modules/hongguo-source/ios/HongguoCore.xcframework',
];
const args = [
  '-czf', output,
  ...excludes.map((pattern) => `--exclude=${pattern}`),
  '-C', projectRoot,
  ...entries,
];
const result = spawnSync('tar', args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(output);
