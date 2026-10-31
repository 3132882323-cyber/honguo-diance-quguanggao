import type { AppPreferences, DownloadRecord, Drama, Episode, UserCatalog, WatchProgress } from '../domain/types';
import {
  arrayValue, DataValidationError, dramaKey, finiteValue, MAX_JSON_CHARS, objectValue, parseJson,
  validateCatalog, validateDownload, validateDrama, validatePreferences, validateProgress,
} from './validation';

export { dramaKey, DataValidationError } from './validation';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface LibraryState {
  version: 1;
  favorites: Drama[];
  history: WatchProgress[];
  preferences: AppPreferences;
  catalogs: UserCatalog[];
  downloads: DownloadRecord[];
}

export type DuplicatePolicy = 'replace' | 'keep' | 'reject';
export type RestoreMode = 'replace' | 'merge';
export const STORAGE_KEY = 'honguo-diance-quguanggao.library.v1';
export const BACKUP_SCHEMA = 'honguo-diance-quguanggao.backup';

export function emptyLibrary(): LibraryState {
  return { version: 1, favorites: [], history: [], preferences: { playbackSpeed: 1, autoPlayNext: true, theme: 'dark' }, catalogs: [], downloads: [] };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(item => { if (item !== null && typeof item === 'object' && !Object.isFrozen(item)) freeze(item); });
  }
  return value;
}

function unique<T>(items: T[], key: (item: T) => string, field: string): T[] {
  const keys = items.map(key);
  if (new Set(keys).size !== keys.length) throw new DataValidationError(`${field} 包含重复标识`);
  return items;
}

export function validateLibrary(input: unknown): LibraryState {
  const value = objectValue(input, '本地资料');
  if (value.version !== 1) throw new DataValidationError('本地资料版本不受支持，请保留原文件');
  const catalogs = arrayValue(value.catalogs, '自备目录', 100).map(validateCatalog);
  if (catalogs.some(catalog => catalog.id === 'open-film-samples')) throw new DataValidationError('open-film-samples 是内置示例的保留标识');
  return {
    version: 1,
    favorites: unique(arrayValue(value.favorites, '收藏', 10000).map(validateDrama), dramaKey, '收藏'),
    history: unique(arrayValue(value.history, '历史', 10000).map(validateProgress), item => item.key, '历史').sort((a, b) => b.updatedAt - a.updatedAt),
    preferences: validatePreferences(value.preferences),
    catalogs: unique(catalogs, catalog => catalog.id, '自备目录'),
    downloads: unique(arrayValue(value.downloads ?? [], '下载记录', 10000).map(validateDownload), download => download.id, '下载记录'),
  };
}

function recoverDownloads(downloads: DownloadRecord[], portable = false): DownloadRecord[] {
  return downloads.map(download => {
    if (portable) {
      const { localUri: _uri, ...metadata } = download;
      return { ...metadata, state: 'paused' as const, progress: 0, error: '备份只包含任务资料；请重新下载媒体' };
    }
    return download.state === 'downloading'
      ? { ...download, state: 'paused' as const, error: '上次下载被中断，请手动继续' }
      : download;
  });
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : '本地资料操作失败';

/**
 * Synchronous validated dispatch followed by ordered async snapshots.
 * A failed write leaves progress in memory. flush() retries the complete latest
 * state; later successful writes contain all earlier changes, never stale deltas.
 */
export class LibraryStore {
  private state: LibraryState = freeze(emptyLibrary());
  private listeners = new Set<() => void>();
  private hydration?: Promise<void>;
  private pending: Promise<void> = Promise.resolve();
  private readBlocked = false;
  private _ready = false;
  private _error: string | null = null;

  constructor(private readonly storage: StorageAdapter, private readonly key = STORAGE_KEY) {}

  get ready(): boolean { return this._ready; }
  get error(): string | null { return this._error; }
  getState = (): LibraryState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(): void { this.listeners.forEach(listener => listener()); }
  clearError = (): void => { this._error = null; this.emit(); };

  hydrate(): Promise<void> {
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      try {
        const saved = await this.storage.getItem(this.key);
        if (saved !== null) {
          const loaded = validateLibrary(parseJson(saved));
          this.state = freeze({ ...loaded, downloads: recoverDownloads(loaded.downloads) });
        }
        this._error = null;
      } catch (error) {
        // Preserve the original storage contents until an explicit restore/reset.
        this.readBlocked = true;
        this._error = `无法读取本地资料：${messageOf(error)}。可导入有效备份或重置本地资料。`;
        throw error;
      } finally { this._ready = true; this.emit(); }
    })();
    return this.hydration;
  }

  private requireWritable(): void {
    if (!this._ready) throw new DataValidationError('本地资料仍在载入，请稍后重试');
    if (this.readBlocked) throw new DataValidationError('原本地资料读取失败，已保留；请先导入备份或明确重置');
  }

  private persist(): Promise<void> {
    const serialized = JSON.stringify(this.state);
    const write = this.pending.then(async () => {
      try { await this.storage.setItem(this.key, serialized); this._error = null; }
      catch (error) { this._error = `保存失败，当前改动仍在内存：${messageOf(error)}`; throw error; }
      finally { this.emit(); }
    });
    // The queue continues after a failed write; callers can still catch this write.
    this.pending = write.catch(() => undefined);
    return write;
  }

  private dispatch(next: LibraryState): Promise<void> {
    this.requireWritable();
    if (JSON.stringify(next).length > MAX_JSON_CHARS) throw new DataValidationError('本地资料超出 2 MiB 文本上限，请先导出并清理旧记录');
    this.state = freeze(next);
    this.emit();
    return this.persist();
  }

  async flush(): Promise<void> { this.requireWritable(); return this.persist(); }

  async toggleFavorite(input: Drama): Promise<void> {
    this.requireWritable();
    const drama = validateDrama(input);
    const key = dramaKey(drama);
    const exists = this.state.favorites.some(item => dramaKey(item) === key);
    return this.dispatch({ ...this.state, favorites: exists ? this.state.favorites.filter(item => dramaKey(item) !== key) : [drama, ...this.state.favorites] });
  }

  async recordProgress(drama: Drama, episode: Episode, seconds: number, duration: number): Promise<void> {
    this.requireWritable();
    const progress = validateProgress({ drama, episode, seconds, duration, updatedAt: Date.now() });
    return this.dispatch({ ...this.state, history: [progress, ...this.state.history.filter(item => item.key !== progress.key)] });
  }

  async removeHistory(key: string): Promise<void> { return this.dispatch({ ...this.state, history: this.state.history.filter(item => item.key !== key) }); }
  async clearHistory(): Promise<void> { return this.dispatch({ ...this.state, history: [] }); }

  async setPreferences(patch: Partial<AppPreferences>): Promise<void> {
    objectValue(patch, '偏好修改');
    const preferences = validatePreferences({ ...this.state.preferences, ...patch });
    return this.dispatch({ ...this.state, preferences });
  }

  async importCatalog(json: string, policy: DuplicatePolicy = 'replace'): Promise<void> {
    this.requireWritable();
    if (!['replace', 'keep', 'reject'].includes(policy)) throw new DataValidationError('目录重复处理选项无效');
    const catalog = validateCatalog(json);
    if (catalog.id === 'open-film-samples') throw new DataValidationError('请为自备目录使用新 id，内置示例标识不可替换');
    const existing = this.state.catalogs.some(item => item.id === catalog.id);
    if (existing && policy === 'reject') throw new DataValidationError('已存在相同 id 的目录；请明确选择替换或保留');
    if (existing && policy === 'keep') return;
    return this.dispatch({ ...this.state, catalogs: [...this.state.catalogs.filter(item => item.id !== catalog.id), catalog] });
  }

  async removeCatalog(id: string): Promise<void> { return this.dispatch({ ...this.state, catalogs: this.state.catalogs.filter(catalog => catalog.id !== id) }); }

  exportCatalog(id: string): string {
    const catalog = this.state.catalogs.find(item => item.id === id);
    if (!catalog) throw new DataValidationError('未找到这个自备目录');
    return JSON.stringify(catalog, null, 2);
  }

  exportBackup(): string {
    return JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, exportedAt: Date.now(), data: { ...this.state, downloads: recoverDownloads(this.state.downloads, true) } }, null, 2);
  }

  async restoreBackup(json: string, mode: RestoreMode = 'replace'): Promise<void> {
    if (!this._ready) throw new DataValidationError('本地资料仍在载入');
    if (mode !== 'replace' && mode !== 'merge') throw new DataValidationError('备份恢复模式无效');
    const backup = objectValue(parseJson(json), '备份');
    if (backup.schema !== BACKUP_SCHEMA || backup.version !== 1) throw new DataValidationError('不是受支持的本应用 v1 备份');
    finiteValue(backup.exportedAt, '备份时间', 0, Number.MAX_SAFE_INTEGER);
    const restored = validateLibrary(backup.data);
    restored.downloads = recoverDownloads(restored.downloads, true);
    let next = restored;
    if (mode === 'merge') {
      const favorites = new Map(this.state.favorites.map(drama => [dramaKey(drama), drama]));
      restored.favorites.forEach(drama => favorites.set(dramaKey(drama), drama));
      const history = new Map(this.state.history.map(progress => [progress.key, progress]));
      restored.history.forEach(progress => { if (!history.has(progress.key) || history.get(progress.key)!.updatedAt < progress.updatedAt) history.set(progress.key, progress); });
      const catalogs = new Map(this.state.catalogs.map(catalog => [catalog.id, catalog]));
      restored.catalogs.forEach(catalog => catalogs.set(catalog.id, catalog));
      const downloads = new Map(this.state.downloads.map(download => [download.id, download]));
      restored.downloads.forEach(download => { if (!downloads.has(download.id)) downloads.set(download.id, download); });
      next = { version: 1, favorites: [...favorites.values()], history: [...history.values()].sort((a, b) => b.updatedAt - a.updatedAt), preferences: restored.preferences, catalogs: [...catalogs.values()], downloads: [...downloads.values()] };
    }
    this.readBlocked = false;
    return this.dispatch(next);
  }

  async upsertDownload(input: DownloadRecord): Promise<void> {
    const record = validateDownload(input);
    return this.dispatch({ ...this.state, downloads: [record, ...this.state.downloads.filter(item => item.id !== record.id)] });
  }

  async removeDownload(id: string): Promise<void> { return this.dispatch({ ...this.state, downloads: this.state.downloads.filter(item => item.id !== id) }); }

  /** Explicit user recovery only; this never runs automatically after corruption. */
  async reset(): Promise<void> {
    if (!this._ready) throw new DataValidationError('本地资料仍在载入');
    this.readBlocked = false;
    return this.dispatch(emptyLibrary());
  }
}
