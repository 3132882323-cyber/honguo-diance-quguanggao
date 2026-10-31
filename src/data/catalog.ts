import type { ContentProvider, Drama, Episode, Page, UserCatalog } from '../domain/types';
import { ProviderError } from '../domain/types';
import { validateCatalog } from './validation';

const PAGE_SIZE = 30;
const normalize = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase();

function page<T>(items: T[], cursor?: string): Page<T> {
  if (cursor !== undefined && (!/^(0|[1-9]\d*)$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))) {
    throw new ProviderError('INVALID_SOURCE', '目录分页游标无效');
  }
  const offset = Number(cursor || 0);
  const end = Math.min(items.length, offset + PAGE_SIZE);
  return { items: items.slice(offset, end), hasMore: end < items.length, ...(end < items.length ? { cursor: String(end) } : {}) };
}

export function createCatalogProvider(input: UserCatalog): ContentProvider {
  // Take a validated copy so callers cannot later replace media URLs behind the provider.
  const catalog = validateCatalog(input);
  const sourceId = `catalog:${catalog.id}`;
  const dramaMap = new Map(catalog.dramas.map(drama => [drama.id, drama]));
  const cards: Drama[] = catalog.dramas.map(drama => ({
    id: drama.id, sourceId, title: drama.title, description: drama.description || '',
    ...(drama.coverUrl ? { coverUrl: drama.coverUrl } : {}), tags: drama.tags || [],
    episodeCount: drama.episodes.length,
  }));
  const find = (id: string) => {
    const drama = dramaMap.get(id);
    if (!drama) throw new ProviderError('NOT_FOUND', '本地目录中没有这部影片');
    return drama;
  };
  const episodesOf = (dramaId: string): Episode[] => find(dramaId).episodes.map((episode, index) => ({ id: episode.id, dramaId, sourceId, title: episode.title, index: index + 1 }));
  return {
    id: sourceId,
    name: catalog.name,
    categories: [{ id: 'all', label: '全部' }, ...[...new Set(cards.flatMap(drama => drama.tags))].map(tag => ({ id: `tag:${tag}`, label: tag }))],
    async discover(query = {}) {
      const items = !query.category || query.category === 'all' ? cards : cards.filter(drama => drama.tags.includes(query.category!.replace(/^tag:/, '')));
      return page(items.map(drama => ({ ...drama, tags: [...drama.tags] })), query.cursor);
    },
    async search(query, cursor) {
      const keyword = normalize(query);
      const items = cards.filter(drama => normalize(`${drama.title} ${drama.description} ${drama.tags.join(' ')}`).includes(keyword));
      return page(items.map(drama => ({ ...drama, tags: [...drama.tags] })), cursor);
    },
    async detail(dramaId) {
      find(dramaId);
      const drama = cards.find(card => card.id === dramaId)!;
      return { ...drama, tags: [...drama.tags], episodes: episodesOf(dramaId) };
    },
    async resolve(episode) {
      if (episode.sourceId !== sourceId) throw new ProviderError('INVALID_SOURCE', '分集不属于当前目录');
      const item = find(episode.dramaId).episodes.find(candidate => candidate.id === episode.id);
      if (!item) throw new ProviderError('NOT_FOUND', '本地目录中没有这个分集');
      return { url: item.url, ...(item.mimeType ? { mimeType: item.mimeType } : {}), downloadable: item.downloadable === true };
    },
    async suggestions(query) {
      const keyword = normalize(query);
      return cards.filter(drama => normalize(drama.title).includes(keyword)).slice(0, 10).map(drama => drama.title);
    },
  };
}
