import { ProviderError, type ContentProvider, type Drama, type DramaDetail, type Episode, type Page, type PlaybackSource } from '../domain/types';
import type { HongguoBridge, HongguoMethod } from '../../modules/hongguo-source/types';

const SOURCE = 'hongguo';
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProviderError('UNAVAILABLE', '红果返回的数据格式已变化，请更新应用后重试。');
  }
  return value as RecordValue;
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? value : undefined;
  } catch { return undefined; }
}

function dramaFrom(value: unknown): Drama {
  const item = record(value);
  const id = text(item.id);
  const title = text(item.title);
  if (!id || !title) throw new ProviderError('UNAVAILABLE', '红果片库响应缺少剧集信息，请稍后重试。');
  const tags = [text(item.category), ...list(item.rows).flatMap((row) => {
    const data = record(row);
    return [3, 9, 40].includes(number(data.kind) ?? -1) ? [text(data.text)] : [];
  })].filter(Boolean);
  return {
    id, sourceId: SOURCE, title, description: text(item.description),
    coverUrl: mediaUrl(item.cover_url),
    tags: [...new Set(tags)],
    episodeCount: number(item.episode_count),
    subtitle: text(item.right_text) || undefined,
  };
}

function pageFrom(value: unknown): Page<Drama> {
  const page = record(value);
  if (!Array.isArray(page.items)) throw new ProviderError('UNAVAILABLE', '红果片库没有返回列表，请稍后重试。');
  const items = page.items.map(dramaFrom);
  return { items, cursor: text(page.cursor) || undefined, hasMore: page.has_more === true };
}

function providerError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const details = error && typeof error === 'object' ? error as RecordValue : {};
  const wait = number(details.retryAfterMs);
  switch (details.code) {
    case 'DRM_PROTECTED': return new ProviderError('PROTECTED', '该集使用受保护的视频格式，当前播放器尚不支持。可在官方客户端观看。');
    case 'UNSUPPORTED_MEDIA': return new ProviderError('UNSUPPORTED', '该集的加密或媒体布局暂不受支持，可在官方客户端观看。');
    case 'MEDIA_TOO_LARGE': return new ProviderError('UNSUPPORTED', '该集超过 64 MiB 的内存播放上限，暂时无法在本应用准备播放。');
    case 'AUTHENTICATION_REQUIRED': return new ProviderError('AUTH_REQUIRED', '该内容需要红果服务授权，当前匿名连接无法访问。');
    case 'RATE_LIMITED': return new ProviderError('RATE_LIMITED', wait && wait > 0 ? `红果服务限制了请求频率，请至少等待 ${Math.ceil(wait / 1000)} 秒后重试。` : '红果服务限制了请求频率，请稍后再试。');
    case 'CHALLENGE_REQUIRED': return new ProviderError('AUTH_REQUIRED', '红果要求安全验证，当前匿名连接无法完成。');
    case 'DEVICE_REJECTED': return new ProviderError('UNAVAILABLE', '红果拒绝了当前匿名连接，暂时无法读取片库。');
    case 'ANONYMOUS_LIMITED': return new ProviderError('UNAVAILABLE', '红果暂未返回可用内容，可能是匿名访问限制或结果为空。请稍后重试。');
    case 'CONTENT_UNAVAILABLE': return new ProviderError('NOT_FOUND', '该内容已下架、不可用或当前连接无权访问。');
    case 'TRANSPORT': case 'CANCELLED': return new ProviderError('NETWORK', '连接红果服务失败，请检查网络后重试。');
    case 'SIGNATURE_REJECTED': case 'SIGNER_UNAVAILABLE': case 'PARAM_INVALID': return new ProviderError('UNAVAILABLE', '红果服务接口已变化，请更新应用后重试。');
    case 'NATIVE_UNAVAILABLE': return new ProviderError('UNAVAILABLE', text(details.message) || '请安装包含红果原生模块的 Android/iOS 应用。');
    case 'INVALID_OPTIONS': return new ProviderError('INVALID_SOURCE', '红果请求参数无效。');
    default: return new ProviderError('UNAVAILABLE', '红果数据连接暂不可用，请稍后重试。');
  }
}

/** A native source-built provider. The optional bridge keeps contract tests offline. */
export function createHongguoProvider(bridge?: HongguoBridge): ContentProvider {
  let bridgePromise: Promise<HongguoBridge> | undefined;
  const nativeBridge = (): Promise<HongguoBridge> => {
    if (bridge) return Promise.resolve(bridge);
    bridgePromise ??= import('../../modules/hongguo-source').then((module) => module.hongguoBridge);
    return bridgePromise;
  };
  async function invoke(method: HongguoMethod, args: unknown[] = []): Promise<unknown> {
    try { return await (await nativeBridge()).invoke(method, args); }
    catch (error) { throw providerError(error); }
  }

  return {
    id: SOURCE,
    name: '红果片库',
    cancelPlayback() {
      if (bridge) return bridge.cancelPlayback?.();
      if (bridgePromise) return bridgePromise.then((native) => native.cancelPlayback?.());
    },
    categories: [
      { id: 'recommend', label: '推荐' }, { id: '找剧', label: '找剧' },
      { id: 'live', label: '真人剧' }, { id: 'motion', label: '漫剧' },
    ],
    async discover(query = {}) {
      return pageFrom(await invoke('discover', [{ channel: query.category ?? 'recommend', cursor: query.cursor ?? '' }]));
    },
    async search(query, cursor) {
      const keyword = query.trim();
      if (!keyword) return { items: [], hasMore: false };
      return pageFrom(await invoke('search', [keyword, { cursor: cursor ?? '', pageSize: 20 }]));
    },
    async detail(dramaId): Promise<DramaDetail> {
      const data = record(await invoke('detail', [dramaId]));
      const drama = dramaFrom(data.series);
      if (!Array.isArray(data.episodes)) throw new ProviderError('UNAVAILABLE', '红果没有返回分集列表，请稍后重试。');
      const episodes: Episode[] = data.episodes.map((value, index) => {
        const item = record(value);
        const id = text(item.id);
        if (!id) throw new ProviderError('UNAVAILABLE', '红果分集数据不完整，请稍后重试。');
        const episodeNumber = number(item.number) ?? index + 1;
        return { id, dramaId: drama.id, sourceId: SOURCE, index: episodeNumber, title: text(item.title) || `第${episodeNumber}集` };
      });
      return { ...drama, episodes, episodeCount: drama.episodeCount ?? episodes.length };
    },
    async resolve(episode): Promise<PlaybackSource> {
      if (episode.sourceId !== SOURCE) throw new ProviderError('INVALID_SOURCE', '该分集不属于红果片库。');
      const playback = record(await invoke('resolve', [episode.id]));
      const streams = list(playback.streams).map(record);
      if (playback.protected === true || streams.some((stream) => stream.protected === true || !!text(stream.encryption))) {
        throw providerError({ code: 'DRM_PROTECTED' });
      }
      const expiresAt = number(playback.expires_at);
      if (expiresAt && expiresAt * 1000 <= Date.now()) throw new ProviderError('UNAVAILABLE', '红果返回的播放地址已过期，请稍后重新打开此集。');
      // expo-video accepts a complete media URL. Separate DASH video/audio needs a
      // manifest or a native muxer; do not return a silent video-only stream.
      if (text(playback.audio_url) || streams.some((stream) => stream.dash === true)) {
        throw new ProviderError('UNSUPPORTED', '该视频使用分离的音视频轨道，当前播放器尚不支持。');
      }
      const usable = streams.flatMap<RecordValue & { url: string }>((stream) => {
        const url = mediaUrl(stream.url);
        return url ? [{ ...stream, url }] : [];
      }).sort((a, b) => (number(b.height) ?? 0) - (number(a.height) ?? 0) || (number(b.bitrate) ?? 0) - (number(a.bitrate) ?? 0));
      if (!usable.length) throw new ProviderError('NOT_FOUND', '红果没有返回可直接播放的媒体地址。');
      const selected = usable[0];
      return {
        url: selected.url,
        mimeType: selected.hls === true ? 'application/x-mpegURL' : 'video/mp4',
        downloadable: false,
        qualities: usable.map((stream, index) => ({ label: text(stream.definition) || text(stream.quality) || `清晰度 ${index + 1}`, url: stream.url })),
      };
    },
    async suggestions(query) {
      const keyword = query.trim();
      if (!keyword) return [];
      const items = await invoke('suggest', [keyword]);
      if (!Array.isArray(items)) return [];
      return [...new Set(items.map((item) => { const data = record(item); return text(data.keyword) || text(data.text); }).filter(Boolean))];
    },
  };
}
