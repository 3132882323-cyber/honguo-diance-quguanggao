import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { AppPreferences, Drama, Episode } from '../domain/types';
import { LibraryStore, type DuplicatePolicy, type RestoreMode } from './library';

export const libraryStore = new LibraryStore(AsyncStorage);

export function useLibrary(store: LibraryStore = libraryStore) {
  const [view, setView] = useState(() => ({ state: store.getState(), ready: store.ready, error: store.error }));
  useEffect(() => {
    const update = () => setView({ state: store.getState(), ready: store.ready, error: store.error });
    const unsubscribe = store.subscribe(update);
    update();
    void store.hydrate().catch(() => { /* The error is exposed through the subscribed view. */ });
    return unsubscribe;
  }, [store]);
  return {
    ...view, hydrated: view.ready, store,
    clearError: store.clearError,
    toggleFavorite: (drama: Drama) => store.toggleFavorite(drama),
    recordProgress: (drama: Drama, episode: Episode, seconds: number, duration: number) => store.recordProgress(drama, episode, seconds, duration),
    removeHistory: (key: string) => store.removeHistory(key),
    clearHistory: () => store.clearHistory(),
    setPreferences: (patch: Partial<AppPreferences>) => store.setPreferences(patch),
    importCatalog: (json: string, policy: DuplicatePolicy = 'replace') => store.importCatalog(json, policy),
    removeCatalog: (id: string) => store.removeCatalog(id),
    exportCatalog: (id: string) => store.exportCatalog(id),
    exportBackup: () => store.exportBackup(),
    restoreBackup: (json: string, mode: RestoreMode = 'replace') => store.restoreBackup(json, mode),
  };
}
