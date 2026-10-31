import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import type { DownloadRecord, Drama, Episode, PlaybackSource } from '../domain/types';
import { ProviderError } from '../domain/types';

interface Port {
  records(): DownloadRecord[];
  save(record: DownloadRecord): Promise<void>;
  remove(id: string): Promise<void>;
  resolve(episode: Episode): Promise<PlaybackSource>;
  report(message: string): void;
}

export function downloadId(ep: Episode) { return JSON.stringify([ep.sourceId, ep.dramaId, ep.id]); }

// These names are internal storage identifiers, not security hashes.
function fileName(id: string) {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < id.length; i++) {
    a = Math.imul(a ^ id.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ id.charCodeAt(id.length - 1 - i), 0x01000193);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}.mp4`;
}

export class Downloads {
  private queue: string[] = [];
  private active = new Map<string, { generation: number; resumable?: FS.DownloadResumable }>();
  private generations = new Map<string, number>();
  private remembered = new Map<string, { task: FS.DownloadResumable; started: boolean; update: (progress: number) => void }>();
  constructor(private port: Port) {}

  async recover() {
    for (const record of this.port.records()) {
      if (record.state === 'downloading' || record.state === 'queued') {
        await this.port.save({ ...record, state: 'paused', error: '应用已重新启动；继续时会重新取得地址并下载。', updatedAt: Date.now() });
      }
    }
  }

  async enqueue(drama: Drama, episode: Episode) {
    if (Platform.OS === 'web') throw new ProviderError('UNSUPPORTED', '离线缓存请在 Android 或 iOS 设备版中使用。网页可直接在线播放公开样片。');
    const id = downloadId(episode);
    const old = this.port.records().find(item => item.id === id);
    if (old?.state === 'completed' || old?.state === 'queued' || old?.state === 'downloading') return;
    await this.port.save({ id, drama, episode, state: 'queued', progress: old?.progress ?? 0, updatedAt: Date.now() });
    if (!this.queue.includes(id)) this.queue.push(id);
    this.pump();
  }

  async pause(id: string) {
    this.queue = this.queue.filter(value => value !== id);
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    const active = this.active.get(id);
    if (active?.resumable) await active.resumable.pauseAsync();
    const record = this.port.records().find(item => item.id === id);
    if (record && record.state !== 'completed') await this.port.save({ ...record, state: 'paused', updatedAt: Date.now() });
  }

  async remove(id: string) {
    await this.pause(id);
    // Never delete a path supplied by an imported backup.
    const base = FS.documentDirectory;
    if (base && Platform.OS !== 'web') await FS.deleteAsync(`${base}offline/${fileName(id)}`, { idempotent: true });
    this.remembered.delete(id);
    await this.port.remove(id);
  }

  async localUri(record: DownloadRecord): Promise<string | undefined> {
    if (Platform.OS === 'web' || !FS.documentDirectory || record.state !== 'completed') return undefined;
    const uri = `${FS.documentDirectory}offline/${fileName(record.id)}`;
    const info = await FS.getInfoAsync(uri);
    return info.exists && !info.isDirectory && info.size > 0 ? uri : undefined;
  }

  private pump() {
    while (this.active.size < 2 && this.queue.length) {
      // A paused native request may still be unwinding. Keep its queued retry
      // until the old generation settles, instead of dropping that intent.
      const index = this.queue.findIndex(value => !this.active.has(value));
      if (index < 0) return;
      const [id] = this.queue.splice(index, 1);
      const record = this.port.records().find(item => item.id === id);
      if (!record || record.state !== 'queued') continue;
      const generation = (this.generations.get(id) ?? 0) + 1;
      this.generations.set(id, generation);
      this.active.set(id, { generation });
      void this.run(record, generation).finally(() => {
        this.active.delete(id);
        this.pump();
      });
    }
  }

  private async run(record: DownloadRecord, generation: number) {
    const id = record.id;
    const current = () => this.generations.get(id) === generation;
    try {
      if (!FS.documentDirectory) throw new Error('本地文件目录不可用');
      const folder = `${FS.documentDirectory}offline/`;
      const target = `${folder}${fileName(id)}`;
      await FS.makeDirectoryAsync(folder, { intermediates: true });
      let cached = this.remembered.get(id);
      const progress = (fraction: number) => {
        if (!current()) return;
        const latest = this.port.records().find(item => item.id === id);
        if (latest) void this.port.save({ ...latest, state: 'downloading', progress: Math.min(0.99, fraction), updatedAt: Date.now() }).catch(() => this.port.report('缓存进度未能保存，请检查设备存储空间。'));
      };
      if (!cached) {
        const source = await this.port.resolve(record.episode);
        if (!current()) return;
        if (!source.downloadable) throw new ProviderError('UNSUPPORTED', '这个来源未允许导出缓存。可使用明确授权下载的公开样片或自己的片单。');
        if (!source.url.startsWith('https://') || /\.m3u8(?:\?|$)/i.test(source.url)
          || (source.mimeType !== 'video/mp4' && !/\.mp4(?:\?|$)/i.test(source.url))) {
          throw new ProviderError('UNSUPPORTED', '当前缓存器支持 HTTPS MP4 文件；HLS 播放列表不会被误存成视频。');
        }
        await FS.deleteAsync(target, { idempotent: true });
        if (!current()) return;
        let lastUpdate = 0;
        const entry = { task: undefined as unknown as FS.DownloadResumable, started: false, update: progress };
        entry.task = FS.createDownloadResumable(source.url, target, { headers: source.headers, sessionType: FS.FileSystemSessionType.FOREGROUND }, event => {
          const now = Date.now();
          if (now - lastUpdate < 800 || event.totalBytesExpectedToWrite <= 0) return;
          lastUpdate = now;
          entry.update(event.totalBytesWritten / event.totalBytesExpectedToWrite);
        });
        cached = entry;
        this.remembered.set(id, entry);
      }
      cached.update = progress;
      const run = this.active.get(id);
      if (!run || !current()) return;
      run.resumable = cached.task;
      await this.port.save({ ...record, state: 'downloading', error: undefined, updatedAt: Date.now() });
      if (!current()) return;
      const resume = cached.started;
      cached.started = true;
      const result = await (resume ? cached.task.resumeAsync() : cached.task.downloadAsync());
      if (!current()) return;
      if (!result || result.status < 200 || result.status >= 300) throw new Error('下载请求失败');
      const info = await FS.getInfoAsync(target);
      if (!current() || !this.port.records().some(item => item.id === id)) return;
      if (!info.exists || info.isDirectory || info.size === 0) throw new Error('下载文件为空');
      const contentType = result.mimeType ?? result.headers['content-type'] ?? result.headers['Content-Type'] ?? '';
      if (!contentType.toLowerCase().includes('video/mp4') && !contentType.toLowerCase().includes('application/octet-stream')) {
        await FS.deleteAsync(target, { idempotent: true });
        if (!current()) return;
        throw new Error('服务器没有返回 MP4 视频');
      }
      if (!current() || !this.port.records().some(item => item.id === id)) return;
      await this.port.save({ ...record, state: 'completed', progress: 1, localUri: target, error: undefined, updatedAt: Date.now() });
      this.remembered.delete(id);
    } catch (error) {
      if (!current()) return;
      this.remembered.delete(id);
      const message = error instanceof ProviderError ? error.message : '缓存失败，请检查网络和剩余空间后重试。';
      await this.port.save({ ...record, state: 'failed', error: message, updatedAt: Date.now() }).catch(() => this.port.report('缓存状态未能保存。'));
    }
  }
}
