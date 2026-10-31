import test from 'node:test';
import assert from 'node:assert/strict';
import type { Drama, Episode, DownloadRecord } from '../src/domain/types';
import { createCatalogProvider } from '../src/data/catalog';
import { BACKUP_SCHEMA, dramaKey, emptyLibrary, LibraryStore, type StorageAdapter } from '../src/data/library';
import { sampleCatalog } from '../src/data/sample';
import { httpsUrl, localDownloadUri, MAX_JSON_CHARS, validateCatalog } from '../src/data/validation';

class MemoryStorage implements StorageAdapter {
  value: string | null = null;
  writes: string[] = [];
  failNext = false;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) {
    await new Promise<void>(resolve => setTimeout(resolve, 1));
    if (this.failNext) { this.failNext = false; throw new Error('disk unavailable'); }
    this.value = value; this.writes.push(value);
  }
}

const drama: Drama = { id: 'show', sourceId: 'catalog:owned', title: '自有片', description: '', tags: ['测试'] };
const episode: Episode = { id: 'ep1', dramaId: drama.id, sourceId: drama.sourceId, title: '第一集', index: 1 };
const userCatalog = () => ({ ...structuredClone(sampleCatalog), id: 'owned', name: '我的目录' });
const download = (state: DownloadRecord['state'], localUri?: string): DownloadRecord => ({ id: 'download-1', drama, episode, state, progress: 0.4, updatedAt: 123, ...(localUri ? { localUri } : {}) });
const backup = (data: unknown) => JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, exportedAt: Date.now(), data });

test('catalog importer rejects executable/local media and embedded credentials', () => {
  for (const url of ['http://example.test/movie.mp4', 'javascript:alert(1)', 'file:///private/movie.mp4', 'data:video/mp4,secret', 'https://user:password@example.test/movie.mp4', 'https://example.test\\@evil.test/a', 'https://example.test/a\n']) {
    assert.throws(() => httpsUrl(url), url);
    const catalog = structuredClone(userCatalog());
    catalog.dramas[0].episodes[0].url = url;
    assert.throws(() => validateCatalog(catalog), url);
  }
  assert.equal(httpsUrl('https://example.test/video.mp4?signature=abc'), 'https://example.test/video.mp4?signature=abc');
});

test('catalog schema rejects duplicates, unsupported versions and hostile object keys', () => {
  const catalog = userCatalog();
  assert.throws(() => validateCatalog({ ...catalog, version: 2 }));
  assert.throws(() => validateCatalog({ ...catalog, dramas: [catalog.dramas[0], catalog.dramas[0]] }));
  const duplicateEpisode = structuredClone(catalog);
  duplicateEpisode.dramas[0].episodes.push(duplicateEpisode.dramas[0].episodes[0]);
  assert.throws(() => validateCatalog(duplicateEpisode));
  assert.throws(() => validateCatalog(JSON.parse('{"version":1,"id":"owned","name":"x","dramas":[],"__proto__":{}}')));
  assert.throws(() => validateCatalog('x'.repeat(MAX_JSON_CHARS + 1)));
  assert.throws(() => validateCatalog('{'));
});

test('catalog provider resolves only exact source/drama/episode and copies imported data', async () => {
  const input = userCatalog();
  const provider = createCatalogProvider(input);
  const detail = await provider.detail('sintel-trailer');
  const source = await provider.resolve(detail.episodes[0]);
  assert.equal(source.url, 'https://media.w3.org/2010/05/sintel/trailer.mp4');
  assert.equal(source.downloadable, true);
  await assert.rejects(provider.resolve({ ...detail.episodes[0], sourceId: 'hongguo' }), /当前目录/);
  await assert.rejects(provider.resolve({ ...detail.episodes[0], id: 'missing' }), /没有这个分集/);
  input.dramas[1].episodes[0].url = 'https://example.test/replaced.mp4';
  assert.equal((await provider.resolve(detail.episodes[0])).url, source.url);
  assert.equal((await provider.search('Ｓｉｎｔｅｌ')).items.length, 1);
  await assert.rejects(provider.discover({ cursor: '-1' }), /游标/);
});

test('catalog provider paginates without dropping or duplicating results', async () => {
  const catalog = userCatalog();
  catalog.dramas = Array.from({ length: 61 }, (_, index) => ({ ...catalog.dramas[0], id: `film-${index}` }));
  const provider = createCatalogProvider(catalog);
  const first = await provider.discover();
  const second = await provider.discover({ cursor: first.cursor });
  const third = await provider.discover({ cursor: second.cursor });
  assert.equal(first.items.length, 30); assert.equal(second.items.length, 30); assert.equal(third.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size, 61);
  assert.equal(third.hasMore, false);
});

test('state dispatch is immediate and ordered writes preserve unflushed progress', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  const first = store.recordProgress(drama, episode, 15, 100);
  assert.equal(store.getState().history[0].seconds, 15);
  const second = store.recordProgress(drama, episode, 42, 100);
  const third = store.setPreferences({ playbackSpeed: 1.5 });
  await Promise.all([first, second, third]);
  const persisted = JSON.parse(storage.value!);
  assert.equal(persisted.history.length, 1); assert.equal(persisted.history[0].seconds, 42); assert.equal(persisted.preferences.playbackSpeed, 1.5);
  const restarted = new LibraryStore(storage); await restarted.hydrate();
  assert.equal(restarted.getState().history[0].seconds, 42);
  assert.ok(Object.isFrozen(store.getState().history[0].drama.tags));
});

test('failed writes retain current progress and flush retries the latest state', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  storage.failNext = true;
  await assert.rejects(store.recordProgress(drama, episode, 8, 100), /disk unavailable/);
  assert.equal(store.getState().history[0].seconds, 8); assert.match(store.error!, /仍在内存/);
  await store.flush(); assert.equal(store.error, null); assert.equal(JSON.parse(storage.value!).history[0].seconds, 8);
});

test('favorite identity is source scoped and cannot collide on separators', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  const a = { ...drama, sourceId: 'a:b', id: 'c' }; const b = { ...drama, sourceId: 'a', id: 'b:c' };
  assert.notEqual(dramaKey(a), dramaKey(b));
  await store.toggleFavorite(a); await store.toggleFavorite(b); assert.equal(store.getState().favorites.length, 2);
  await store.toggleFavorite(a); assert.equal(store.getState().favorites[0].sourceId, b.sourceId);
});

test('progress clamps seeks to duration, rejects mismatched episodes and supports history deletion', async () => {
  const store = new LibraryStore(new MemoryStorage()); await store.hydrate();
  await store.recordProgress(drama, episode, 120, 100); assert.equal(store.getState().history[0].seconds, 100);
  await assert.rejects(store.recordProgress(drama, { ...episode, dramaId: 'other' }, 1, 100));
  await assert.rejects(store.recordProgress(drama, episode, NaN, 100));
  await store.removeHistory(dramaKey(drama)); assert.equal(store.getState().history.length, 0);
  await store.recordProgress(drama, episode, 0, 100); await store.clearHistory(); assert.equal(store.getState().history.length, 0);
});

test('catalog duplicate policy is explicit and reserved sample id cannot be hijacked', async () => {
  const store = new LibraryStore(new MemoryStorage()); await store.hydrate();
  await store.importCatalog(JSON.stringify(userCatalog()));
  const updated = { ...userCatalog(), name: '修改后' };
  await store.importCatalog(JSON.stringify(updated), 'keep'); assert.equal(store.getState().catalogs[0].name, '我的目录');
  await assert.rejects(store.importCatalog(JSON.stringify(updated), 'reject'));
  await store.importCatalog(JSON.stringify(updated), 'replace'); assert.equal(store.getState().catalogs[0].name, '修改后');
  assert.equal(JSON.parse(store.exportCatalog('owned')).name, '修改后');
  await assert.rejects(store.importCatalog(JSON.stringify(sampleCatalog)));
  await store.removeCatalog('owned'); assert.equal(store.getState().catalogs.length, 0);
});

test('invalid imports and restore validation never mutate existing state or schedule writes', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  await store.toggleFavorite(drama);
  await store.recordProgress(drama, episode, 23, 100);
  const before = store.getState(); const writes = storage.writes.length;
  const badCatalog = userCatalog(); badCatalog.dramas[0].episodes[0].url = 'javascript:alert(1)';
  await assert.rejects(store.importCatalog(JSON.stringify(badCatalog)));
  assert.equal(store.getState(), before); assert.equal(storage.writes.length, writes);
  const invalidBackup = { ...emptyLibrary(), history: [{ key: dramaKey(drama), drama, episode, seconds: -5, duration: 100, updatedAt: Date.now() }] };
  await assert.rejects(store.restoreBackup(backup(invalidBackup), 'merge'));
  assert.equal(store.getState(), before); assert.equal(storage.writes.length, writes);
  assert.equal(store.getState().history[0].seconds, 23);
});

test('corrupt storage remains untouched until an explicit valid restore', async () => {
  const storage = new MemoryStorage(); storage.value = '{broken';
  const store = new LibraryStore(storage); await assert.rejects(store.hydrate());
  assert.equal(store.ready, true); await assert.rejects(store.toggleFavorite(drama)); assert.equal(storage.value, '{broken');
  await assert.rejects(store.restoreBackup('{"version":999}')); assert.equal(storage.value, '{broken');
  await store.restoreBackup(backup(emptyLibrary())); assert.equal(store.error, null); assert.equal(JSON.parse(storage.value).version, 1);
});

test('backup restore merges the newest history and never trusts portable local file paths', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  await store.recordProgress(drama, episode, 35, 100);
  await store.upsertDownload(download('completed', 'file:///private/app/downloads/sample.mp4'));
  const exported = JSON.parse(store.exportBackup());
  assert.equal(exported.schema, BACKUP_SCHEMA); assert.equal(exported.data.downloads[0].localUri, undefined); assert.equal(exported.data.downloads[0].state, 'paused');
  const old = structuredClone(emptyLibrary());
  old.history.push({ key: dramaKey(drama), drama, episode, seconds: 3, duration: 100, updatedAt: 1 });
  await store.restoreBackup(backup(old), 'merge'); assert.equal(store.getState().history[0].seconds, 35);
  await store.restoreBackup(JSON.stringify(exported));
  assert.equal(store.getState().downloads[0].localUri, undefined); assert.equal(store.getState().downloads[0].state, 'paused');
});

test('download records recover interrupted jobs and reject remote/off-device local URIs', async () => {
  const storage = new MemoryStorage(); const store = new LibraryStore(storage); await store.hydrate();
  await store.upsertDownload(download('downloading'));
  const recovered = new LibraryStore(storage); await recovered.hydrate();
  assert.equal(recovered.getState().downloads[0].state, 'paused');
  for (const value of ['https://example.test/secret.mp4', 'file://remote-server/file.mp4', 'file:///a.mp4?token=private']) assert.throws(() => localDownloadUri(value));
  await assert.rejects(store.upsertDownload(download('completed')));
  await assert.rejects(store.setPreferences({ playbackSpeed: Infinity }));
  await assert.rejects(store.setPreferences({ theme: 'sepia' as 'dark' }));
  await recovered.removeDownload('download-1'); assert.equal(recovered.getState().downloads.length, 0);
});
