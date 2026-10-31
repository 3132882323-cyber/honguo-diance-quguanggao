import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { DownloadRecord, Drama, Episode, PlaybackSource } from '../src/domain/types';

/**
 * Load the real service with only its native module imports replaced. No queue
 * logic is copied into the harness, and no React Native runtime is required.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type NativeResult = { status: number; mimeType: string; headers: Record<string, string> };
const goodResult: NativeResult = { status: 200, mimeType: 'video/mp4', headers: {} };
const goodSource: PlaybackSource = { url: 'https://example.test/owned.mp4', mimeType: 'video/mp4', downloadable: true };
const drama: Drama = { id: 'film', sourceId: 'catalog:owned', title: '自有影片', description: '', tags: [] };
const episode = (id = 'ep1'): Episode => ({ id, dramaId: drama.id, sourceId: drama.sourceId, title: id, index: 1 });
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 12; i++) await nextTurn(); }

let harnessSequence = 0;
async function harness(options: {
  resolve?: (episode: Episode) => Promise<PlaybackSource>;
  getInfo?: (uri: string) => Promise<{ exists: boolean; isDirectory: boolean; size: number }>;
  deleteFile?: (uri: string) => Promise<void>;
} = {}) {
  const records = new Map<string, DownloadRecord>();
  const tasks: { result: ReturnType<typeof deferred<NativeResult>>; pauseCalls: number; downloadCalls: number; resumeCalls: number }[] = [];
  const deleted: string[] = [];
  const requested: Episode[] = [];
  const reports: string[] = [];
  const native = {
    documentDirectory: 'file:///test-app/',
    FileSystemSessionType: { FOREGROUND: 0 },
    async makeDirectoryAsync() {},
    async deleteAsync(uri: string) { deleted.push(uri); await options.deleteFile?.(uri); },
    async getInfoAsync(uri: string) { return options.getInfo ? options.getInfo(uri) : { exists: true, isDirectory: false, size: 42 }; },
    createDownloadResumable() {
      const task = { result: deferred<NativeResult>(), pauseCalls: 0, downloadCalls: 0, resumeCalls: 0 };
      tasks.push(task);
      return {
        downloadAsync() { task.downloadCalls++; return task.result.promise; },
        resumeAsync() { task.resumeCalls++; return task.result.promise; },
        async pauseAsync() { task.pauseCalls++; task.result.reject(new Error('paused')); return { resumeData: 'native-resume-data' }; },
      };
    },
  };
  const key = `honguo.download-test.${++harnessSequence}`;
  Object.defineProperty(globalThis, key, { value: native, configurable: true });
  const nativeModule = `const value = globalThis[${JSON.stringify(key)}];\n${Object.keys(native).map(name => `export const ${name} = value.${name};`).join('\n')}`;
  const sourcePath = new URL('../src/services/downloads.ts', import.meta.url);
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ['"]react-native['"]/g, `from ${JSON.stringify(`data:text/javascript,${encodeURIComponent('export const Platform = { OS: "android" };')}`)}`)
    .replace(/from ['"]expo-file-system\/legacy['"]/g, `from ${JSON.stringify(`data:text/javascript,${encodeURIComponent(nativeModule)}`)}`)
    .replace(/from ['"]\.\.\/domain\/types['"]/g, `from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../src/domain/types.ts', import.meta.url))).href)}`);
  const { Downloads, downloadId } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const manager = new Downloads({
    records: () => [...records.values()],
    async save(record: DownloadRecord) { records.set(record.id, record); },
    async remove(id: string) { records.delete(id); },
    async resolve(ep: Episode) { requested.push(ep); return options.resolve ? options.resolve(ep) : goodSource; },
    report(message: string) { reports.push(message); },
  });
  return { manager, records, tasks, deleted, requested, reports, downloadId, cleanup: () => { delete (globalThis as Record<string, unknown>)[key]; } };
}

test('download queue keeps a resume requested while an old resolver is still active', async () => {
  const firstSource = deferred<PlaybackSource>(); let resolves = 0;
  const h = await harness({ resolve: async () => ++resolves === 1 ? firstSource.promise : goodSource });
  try {
    const ep = episode(); const id = h.downloadId(ep);
    await h.manager.enqueue(drama, ep); await settle();
    await h.manager.pause(id);
    await h.manager.enqueue(drama, ep);
    firstSource.resolve(goodSource); await settle();
    assert.equal(h.requested.length, 2, 'a queued resume must run after the previous resolver is cancelled');
    assert.equal(h.tasks.length, 1);
    h.tasks[0].result.resolve(goodResult); await settle();
    assert.equal(h.records.get(id)?.state, 'completed');
  } finally { h.cleanup(); }
});

test('remove while provider resolution is pending never recreates a record or starts native IO', async () => {
  const source = deferred<PlaybackSource>();
  const h = await harness({ resolve: () => source.promise });
  try {
    const ep = episode(); const id = h.downloadId(ep);
    await h.manager.enqueue(drama, ep); await settle();
    await h.manager.remove(id);
    source.resolve(goodSource); await settle();
    assert.equal(h.records.has(id), false); assert.equal(h.tasks.length, 0);
  } finally { h.cleanup(); }
});

test('remove during post-download file validation cannot resurrect completed metadata', async () => {
  const validation = deferred<{ exists: boolean; isDirectory: boolean; size: number }>();
  const h = await harness({ getInfo: () => validation.promise });
  try {
    const ep = episode(); const id = h.downloadId(ep);
    await h.manager.enqueue(drama, ep); await settle();
    h.tasks[0].result.resolve(goodResult); await settle();
    await h.manager.remove(id);
    validation.resolve({ exists: true, isDirectory: false, size: 42 }); await settle();
    assert.equal(h.records.has(id), false, 'stale completion must not recreate a removed record');
  } finally { h.cleanup(); }
});

test('pause during pending target preparation cannot leave a never-started resumable behind', async () => {
  const deletion = deferred<void>(); let first = true;
  const h = await harness({ deleteFile: () => { if (first) { first = false; return deletion.promise; } return Promise.resolve(); } });
  try {
    const ep = episode(); const id = h.downloadId(ep);
    await h.manager.enqueue(drama, ep); await settle();
    await h.manager.pause(id);
    deletion.resolve(); await settle();
    // A cancelled preparation must not install a stale remembered task. A fresh
    // enqueue should resolve current source data and start an actual transfer.
    await h.manager.enqueue(drama, ep); await settle();
    assert.equal(h.requested.length, 2, 'resuming after cancelled preparation must resolve a fresh source');
    const started = h.tasks.filter(task => task.downloadCalls > 0 || task.resumeCalls > 0);
    assert.equal(started.length, 1);
    started[0].result.resolve(goodResult); await settle();
    assert.equal(h.records.get(id)?.state, 'completed');
  } finally { h.cleanup(); }
});

test('bounded queue starts only two transfers and releases a slot on completion', async () => {
  const h = await harness();
  try {
    await Promise.all(['ep1', 'ep2', 'ep3'].map(id => h.manager.enqueue(drama, episode(id)))); await settle();
    assert.equal(h.tasks.length, 2);
    h.tasks[0].result.resolve(goodResult); await settle(); assert.equal(h.tasks.length, 3);
    h.tasks[1].result.resolve(goodResult); h.tasks[2].result.resolve(goodResult); await settle();
    assert.equal([...h.records.values()].filter(record => record.state === 'completed').length, 3);
  } finally { h.cleanup(); }
});
