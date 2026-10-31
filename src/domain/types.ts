/** Shared, serializable contracts. No provider-specific keys belong in these models. */
export interface Drama {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  coverUrl?: string;
  tags: string[];
  episodeCount?: number;
  subtitle?: string;
}

export interface Episode {
  id: string;
  dramaId: string;
  sourceId: string;
  title: string;
  index: number;
}

export interface DramaDetail extends Drama {
  episodes: Episode[];
}

export interface Page<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

export interface BrowseQuery {
  category?: string;
  cursor?: string;
}

export interface PlaybackSource {
  url: string;
  headers?: Record<string, string>;
  mimeType?: string;
  /** Only true for a source explicitly permitting local export. */
  downloadable?: boolean;
  qualities?: { label: string; url: string }[];
}

export interface ContentProvider {
  id: string;
  name: string;
  categories: { id: string; label: string }[];
  discover(query?: BrowseQuery): Promise<Page<Drama>>;
  search(query: string, cursor?: string): Promise<Page<Drama>>;
  detail(dramaId: string): Promise<DramaDetail>;
  resolve(episode: Episode): Promise<PlaybackSource>;
  suggestions?(query: string): Promise<string[]>;
  /** Release in-flight media and local playback memory when the player closes. */
  cancelPlayback?(): void | Promise<void>;
}

export type ProviderErrorCode =
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'PROTECTED'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INVALID_SOURCE'
  | 'UNSUPPORTED';

export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface WatchProgress {
  key: string;
  drama: Drama;
  episode: Episode;
  seconds: number;
  duration: number;
  updatedAt: number;
}

export interface AppPreferences {
  playbackSpeed: number;
  autoPlayNext: boolean;
  theme: 'dark' | 'light' | 'system';
}

export interface UserCatalogEpisode {
  id: string;
  title: string;
  url: string;
  downloadable?: boolean;
  mimeType?: string;
}

export interface UserCatalogDrama {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  tags?: string[];
  episodes: UserCatalogEpisode[];
}

export interface UserCatalog {
  version: 1;
  id: string;
  name: string;
  attribution?: string;
  dramas: UserCatalogDrama[];
}

export interface DownloadRecord {
  id: string;
  drama: Drama;
  episode: Episode;
  state: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number;
  localUri?: string;
  error?: string;
  updatedAt: number;
}
