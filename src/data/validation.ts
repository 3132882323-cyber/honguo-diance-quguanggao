import type {
  AppPreferences, DownloadRecord, Drama, Episode, UserCatalog, WatchProgress,
} from '../domain/types';

export const MAX_JSON_CHARS = 2 * 1024 * 1024;
const MAX_TIME_SECONDS = 7 * 24 * 60 * 60;

export class DataValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'DataValidationError'; }
}

export function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DataValidationError(`${field} 必须是对象`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new DataValidationError(`${field} 对象无效`);
  if (['__proto__', 'constructor', 'prototype'].some(key => Object.prototype.hasOwnProperty.call(value, key))) {
    throw new DataValidationError(`${field} 包含不支持的字段`);
  }
  return value as Record<string, unknown>;
}

export function textValue(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new DataValidationError(`${field} 必须是 1–${max} 字符的文本`);
  }
  return value.trim();
}

export function idValue(value: unknown, field: string): string {
  const id = textValue(value, field, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) throw new DataValidationError(`${field} 只能包含字母、数字、点、下划线、冒号和短横线`);
  return id;
}

export function optionalText(value: unknown, field: string, max = 1000): string | undefined {
  if (value === undefined || value === '') return undefined;
  return textValue(value, field, max);
}

export function arrayValue(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new DataValidationError(`${field} 必须是最多 ${max} 项的数组`);
  return value;
}

export function finiteValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new DataValidationError(`${field} 必须在 ${min}–${max} 范围内`);
  }
  return value;
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new DataValidationError(`${field} 必须是布尔值`);
  return value;
}

/** Remote catalog media never permits file:, credentials, scripts or hidden whitespace. */
export function httpsUrl(value: unknown, field = '媒体地址'): string {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value) || !/^https:\/\//i.test(value)) {
    throw new DataValidationError(`${field} 必须是有效 HTTPS 地址`);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('Invalid URL');
    return url.href;
  } catch { throw new DataValidationError(`${field} 必须是无内嵌凭据的 HTTPS 地址`); }
}

export function localDownloadUri(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('file:///') || /[\u0000-\u001f\u007f\\]/.test(value)) {
    throw new DataValidationError('离线文件必须是本机 file:/// 地址');
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || url.hostname || url.search || url.hash || url.username || url.password) throw new Error('Invalid local URI');
    return url.href;
  } catch { throw new DataValidationError('离线文件地址无效'); }
}

export function parseJson(input: string): unknown {
  if (typeof input !== 'string' || input.length > MAX_JSON_CHARS) throw new DataValidationError('JSON 超出 2 MiB 文本上限');
  try { return JSON.parse(input); } catch { throw new DataValidationError('JSON 格式无效，请检查文件内容'); }
}

function tagsValue(value: unknown): string[] {
  if (value === undefined) return [];
  return [...new Set(arrayValue(value, 'tags', 30).map(tag => textValue(tag, '标签', 80)))];
}

export function validateCatalog(input: unknown): UserCatalog {
  const source = typeof input === 'string' ? parseJson(input) : input;
  const catalog = objectValue(source, '目录');
  if (catalog.version !== 1) throw new DataValidationError('仅支持 version: 1 的媒体目录');
  const dramas = arrayValue(catalog.dramas, 'dramas', 1000);
  const dramaIds = new Set<string>();
  let totalEpisodes = 0;
  const result: UserCatalog = {
    version: 1,
    id: idValue(catalog.id, '目录 id'),
    name: textValue(catalog.name, '目录名称'),
    dramas: dramas.map((inputDrama, dramaIndex) => {
      const item = objectValue(inputDrama, `dramas[${dramaIndex}]`);
      const id = idValue(item.id, '剧目 id');
      if (dramaIds.has(id)) throw new DataValidationError(`目录内剧目 id 重复：${id}`);
      dramaIds.add(id);
      const episodes = arrayValue(item.episodes, 'episodes', 1000);
      totalEpisodes += episodes.length;
      if (episodes.length === 0 || totalEpisodes > 10000) throw new DataValidationError('每部剧目至少一集，目录总集数最多 10000');
      const episodeIds = new Set<string>();
      return {
        id, title: textValue(item.title, '剧目标题'),
        ...(item.description !== undefined && item.description !== '' ? { description: textValue(item.description, '简介', 20000) } : {}),
        ...(item.coverUrl !== undefined ? { coverUrl: httpsUrl(item.coverUrl, '封面地址') } : {}),
        tags: tagsValue(item.tags),
        episodes: episodes.map(inputEpisode => {
          const episode = objectValue(inputEpisode, '分集');
          const episodeId = idValue(episode.id, '分集 id');
          if (episodeIds.has(episodeId)) throw new DataValidationError(`同一剧目分集 id 重复：${episodeId}`);
          episodeIds.add(episodeId);
          const mimeType = optionalText(episode.mimeType, '媒体 MIME 类型', 100);
          if (mimeType && !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType)) throw new DataValidationError('媒体 MIME 类型格式无效');
          return {
            id: episodeId, title: textValue(episode.title, '分集标题'),
            url: httpsUrl(episode.url),
            ...(episode.downloadable !== undefined ? { downloadable: booleanValue(episode.downloadable, 'downloadable') } : {}),
            ...(mimeType ? { mimeType } : {}),
          };
        }),
      };
    }),
  };
  if (catalog.attribution !== undefined && catalog.attribution !== '') result.attribution = textValue(catalog.attribution, '来源署名', 10000);
  return result;
}

export function validateDrama(input: unknown): Drama {
  const item = objectValue(input, '剧目信息');
  const result: Drama = {
    id: idValue(item.id, '剧目 id'), sourceId: idValue(item.sourceId, '来源 id'),
    title: textValue(item.title, '剧目标题'),
    description: item.description === '' ? '' : textValue(item.description, '简介', 20000),
    tags: tagsValue(item.tags),
  };
  if (item.coverUrl !== undefined) result.coverUrl = httpsUrl(item.coverUrl, '封面地址');
  if (item.subtitle !== undefined) result.subtitle = textValue(item.subtitle, '副标题', 1000);
  if (item.episodeCount !== undefined) {
    const count = finiteValue(item.episodeCount, '集数', 0, 100000);
    if (!Number.isInteger(count)) throw new DataValidationError('集数必须是整数');
    result.episodeCount = count;
  }
  return result;
}

export function validateEpisode(input: unknown): Episode {
  const item = objectValue(input, '分集信息');
  const index = finiteValue(item.index, '分集序号', 0, 100000);
  if (!Number.isInteger(index)) throw new DataValidationError('分集序号必须是整数');
  return { id: idValue(item.id, '分集 id'), dramaId: idValue(item.dramaId, '剧目 id'), sourceId: idValue(item.sourceId, '来源 id'), title: textValue(item.title, '分集标题'), index };
}

export function validatePreferences(input: unknown): AppPreferences {
  const value = objectValue(input, '播放偏好');
  if (!['dark', 'light', 'system'].includes(String(value.theme))) throw new DataValidationError('主题设置无效');
  return { playbackSpeed: finiteValue(value.playbackSpeed, '播放倍速', 0.25, 4), autoPlayNext: booleanValue(value.autoPlayNext, 'autoPlayNext'), theme: value.theme as AppPreferences['theme'] };
}

export const dramaKey = (drama: Pick<Drama, 'sourceId' | 'id'>): string => JSON.stringify([drama.sourceId, drama.id]);

export function validateProgress(input: unknown): WatchProgress {
  const value = objectValue(input, '播放进度');
  const drama = validateDrama(value.drama);
  const episode = validateEpisode(value.episode);
  if (drama.id !== episode.dramaId || drama.sourceId !== episode.sourceId) throw new DataValidationError('分集与剧目来源不匹配');
  const duration = finiteValue(value.duration, '视频时长', 0, MAX_TIME_SECONDS);
  const seconds = finiteValue(value.seconds, '播放位置', 0, MAX_TIME_SECONDS);
  const key = dramaKey(drama);
  if (value.key !== undefined && value.key !== key) throw new DataValidationError('播放进度标识不匹配');
  return { key, drama, episode, seconds: duration > 0 ? Math.min(seconds, duration) : seconds, duration, updatedAt: finiteValue(value.updatedAt, '更新时间', 0, Number.MAX_SAFE_INTEGER) };
}

export function validateDownload(input: unknown): DownloadRecord {
  const value = objectValue(input, '下载记录');
  const drama = validateDrama(value.drama);
  const episode = validateEpisode(value.episode);
  if (drama.id !== episode.dramaId || drama.sourceId !== episode.sourceId) throw new DataValidationError('下载分集与剧目不匹配');
  if (!['queued', 'downloading', 'paused', 'completed', 'failed'].includes(String(value.state))) throw new DataValidationError('下载状态无效');
  const result: DownloadRecord = {
    id: textValue(value.id, '下载 id', 512), drama, episode,
    state: value.state as DownloadRecord['state'], progress: finiteValue(value.progress, '下载进度', 0, 1),
    updatedAt: finiteValue(value.updatedAt, '更新时间', 0, Number.MAX_SAFE_INTEGER),
  };
  if (value.localUri !== undefined) result.localUri = localDownloadUri(value.localUri);
  if (result.state === 'completed' && !result.localUri) throw new DataValidationError('已完成下载缺少本机文件地址');
  if (value.error !== undefined) result.error = textValue(value.error, '下载错误', 2000);
  return result;
}
