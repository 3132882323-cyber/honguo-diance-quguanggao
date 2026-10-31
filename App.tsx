import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { ContentProvider, DownloadRecord, Drama, DramaDetail, Episode, Page, WatchProgress } from './src/domain/types';
import { ProviderError } from './src/domain/types';
import { useLibrary } from './src/data/useLibrary';
import { dramaKey } from './src/data/library';
import { createCatalogProvider } from './src/data/catalog';
import { sampleCatalog } from './src/data/sample';
import { createHongguoProvider } from './src/providers/hongguo';
import { Downloads } from './src/services/downloads';
import { Busy, Button, Chip, Cover, DramaCard, EmptyState, Icon, IconButton, type IconName } from './src/ui/components';
import { Player } from './src/ui/Player';
import { formatTime, useColors, type Colors } from './src/ui/theme';

type Tab = 'home' | 'search' | 'library' | 'settings';
type Overlay =
  | { kind: 'detail'; drama: Drama; provider: ContentProvider; detail?: DramaDetail; error?: string }
  | { kind: 'player'; detail: DramaDetail; provider: ContentProvider; initialEpisode: string; offline?: { episodeId: string; uri: string } }
  | { kind: 'sources' }
  | { kind: 'editor'; mode: 'catalog' | 'restore' }
  | { kind: 'about' };

const projectName = 'honguo-diance-quguanggao';
const sampleId = `catalog:${sampleCatalog.id}`;
const tabs: { id: Tab; label: string; icon: IconName; active: IconName }[] = [
  { id: 'home', label: '发现', icon: 'compass-outline', active: 'compass' },
  { id: 'search', label: '搜索', icon: 'search-outline', active: 'search' },
  { id: 'library', label: '片单', icon: 'bookmark-outline', active: 'bookmark' },
  { id: 'settings', label: '设置', icon: 'options-outline', active: 'options' },
];

const friendly = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请稍后重试。';

async function confirmAction(title: string, body: string): Promise<boolean> {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${body}`);
  return new Promise(resolve => Alert.alert(title, body, [
    { text: '取消', style: 'cancel', onPress: () => resolve(false) },
    { text: '确认', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

async function pickJson(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  if (asset.size && asset.size > 2 * 1024 * 1024) throw new Error('目录文件请控制在 2 MB 以内。');
  return Platform.OS === 'web' ? (await fetch(asset.uri)).text() : FS.readAsStringAsync(asset.uri);
}

async function shareJson(name: string, json: string) {
  if (Platform.OS === 'web') {
    const uri = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = uri; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(uri), 30_000);
    return;
  }
  if (!FS.cacheDirectory) throw new Error('导出目录不可用。');
  const uri = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(uri, json);
  if (!await Sharing.isAvailableAsync()) throw new Error('当前设备暂不支持分享文件。');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: '保存片单资料' });
}

export default function App() { return <SafeAreaProvider><HonguoApp /></SafeAreaProvider>; }

function HonguoApp() {
  const library = useLibrary();
  const { state, ready } = library;
  const { colors, isDark } = useColors(state.preferences.theme);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 1160);
  const columns = contentWidth >= 1000 ? 5 : contentWidth >= 700 ? 4 : contentWidth >= 520 ? 3 : 2;
  const cardWidth = (contentWidth - 40 - 14 * (columns - 1)) / columns;
  const [tab, setTab] = useState<Tab>('home');
  const [sourceId, setSourceId] = useState('hongguo');
  const [category, setCategory] = useState('recommend');
  const [overlay, setOverlay] = useState<Overlay>();
  const [notice, setNotice] = useState('');
  const [libraryView, setLibraryView] = useState<'favorites' | 'history' | 'downloads'>('favorites');
  const hongguo = useMemo(() => createHongguoProvider(), []);
  const sample = useMemo(() => createCatalogProvider(sampleCatalog), []);
  const providers = useMemo(() => [hongguo, sample, ...state.catalogs.map(createCatalogProvider)], [hongguo, sample, state.catalogs]);
  const provider = providers.find(item => item.id === sourceId) ?? hongguo;
  const providersRef = useRef(providers); providersRef.current = providers;
  const detailRequest = useRef(0);
  const present = (value: Overlay | undefined) => { detailRequest.current++; setOverlay(value); };
  const downloadsRef = useRef<Downloads | null>(null);
  if (!downloadsRef.current) downloadsRef.current = new Downloads({
    records: () => library.store.getState().downloads,
    save: record => library.store.upsertDownload(record),
    remove: id => library.store.removeDownload(id),
    resolve: episode => {
      const source = providersRef.current.find(item => item.id === episode.sourceId);
      return source ? source.resolve(episode) : Promise.reject(new ProviderError('NOT_FOUND', '这个片源已被移除，请重新导入目录。'));
    },
    report: setNotice,
  });
  const downloads = downloadsRef.current;

  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (ready) void downloads.recover().catch(error => setNotice(friendly(error))); }, [ready, downloads]);
  useEffect(() => { if (!providers.some(item => item.id === sourceId)) setSourceId('hongguo'); }, [providers, sourceId]);

  const act = useCallback((promise: Promise<unknown>, success?: string) => {
    void promise.then(() => { if (success) setNotice(success); }).catch(error => setNotice(friendly(error)));
  }, []);
  const selectSource = (id: string) => {
    detailRequest.current++;
    setSourceId(id);
    const target = providers.find(item => item.id === id);
    setCategory(target?.categories[0]?.id ?? 'recommend');
    setOverlay(undefined);
  };
  const closeOverlay = () => { detailRequest.current++; setOverlay(undefined); };

  const [feed, setFeed] = useState<Page<Drama> & { loading: boolean; error: string }>({ items: [], hasMore: false, loading: false, error: '' });
  const feedRequest = useRef(0);
  const loadFeed = useCallback(async (more = false, cursor?: string) => {
    const request = ++feedRequest.current;
    setFeed(old => ({ ...old, items: more ? old.items : [], loading: true, error: '' }));
    try {
      const page = await provider.discover({ category, cursor: more ? cursor : undefined });
      if (request !== feedRequest.current) return;
      setFeed(old => {
        const combined = more ? [...old.items, ...page.items] : page.items;
        const seen = new Set<string>();
        return { ...page, items: combined.filter(item => { const key = dramaKey(item); if (seen.has(key)) return false; seen.add(key); return true; }),
          hasMore: page.hasMore && !!page.cursor && page.cursor !== cursor, loading: false, error: '' };
      });
    } catch (error) {
      if (request === feedRequest.current) setFeed(old => ({ ...old, loading: false, error: friendly(error) }));
    }
  }, [provider, category]);
  useEffect(() => { if (ready) void loadFeed(); return () => { feedRequest.current++; }; }, [loadFeed, ready]);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [search, setSearch] = useState<Page<Drama> & { loading: boolean; error: string; query: string }>({ items: [], hasMore: false, loading: false, error: '', query: '' });
  const searchRequest = useRef(0);
  useEffect(() => {
    searchRequest.current++;
    setSearch({ items: [], hasMore: false, loading: false, error: '', query: '' }); setSuggestions([]);
  }, [provider]);
  useEffect(() => {
    let alive = true;
    if (!query.trim() || !provider.suggestions || tab !== 'search') { setSuggestions([]); return; }
    const timer = setTimeout(() => { void provider.suggestions!(query.trim()).then(values => { if (alive) setSuggestions([...new Set(values)].slice(0, 8)); }).catch(() => { if (alive) setSuggestions([]); }); }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, provider, tab]);
  const searchFor = async (keyword = query, more = false) => {
    const term = (more ? search.query : keyword).trim();
    if (!term) return;
    setQuery(term); setSuggestions([]);
    const request = ++searchRequest.current;
    const cursor = more ? search.cursor : undefined;
    setSearch(old => ({ ...old, query: term, items: more ? old.items : [], loading: true, error: '' }));
    try {
      const page = await provider.search(term, cursor);
      if (request !== searchRequest.current) return;
      setSearch(old => {
        const seen = new Set<string>();
        const items = (more ? [...old.items, ...page.items] : page.items).filter(item => { const key = dramaKey(item); if (seen.has(key)) return false; seen.add(key); return true; });
        return { ...page, items, query: term, loading: false, error: '', hasMore: page.hasMore && !!page.cursor && page.cursor !== cursor };
      });
    } catch (error) { if (request === searchRequest.current) setSearch(old => ({ ...old, loading: false, error: friendly(error) })); }
  };

  const openDetail = async (drama: Drama) => {
    const source = providers.find(item => item.id === drama.sourceId);
    if (!source) { setNotice('该片源已被移除，请先重新导入片单。'); return; }
    const request = ++detailRequest.current;
    setOverlay({ kind: 'detail', drama, provider: source });
    try {
      const detail = await source.detail(drama.id);
      if (request === detailRequest.current) setOverlay({ kind: 'detail', drama, provider: source, detail });
    } catch (error) { if (request === detailRequest.current) setOverlay({ kind: 'detail', drama, provider: source, error: friendly(error) }); }
  };
  const play = (detail: DramaDetail, episode: Episode, source: ContentProvider, offline?: { episodeId: string; uri: string }) => {
    detailRequest.current++;
    setOverlay({ kind: 'player', detail, provider: source, initialEpisode: episode.id, offline });
  };
  const playDownload = async (record: DownloadRecord) => {
    const request = ++detailRequest.current;
    const uri = await downloads.localUri(record);
    if (request !== detailRequest.current) return;
    if (!uri) { setNotice('本地文件不存在。备份不会包含视频，请重新缓存。'); return; }
    const source = providers.find(item => item.id === record.episode.sourceId) ?? sample;
    play({ ...record.drama, episodes: [record.episode] }, record.episode, source, { episodeId: record.episode.id, uri });
  };
  const enqueue = (drama: Drama, episode: Episode) => act(downloads.enqueue(drama, episode), '已加入缓存队列，可在「片单 → 缓存」查看。');
  const saved = (drama: Drama) => state.favorites.some(item => dramaKey(item) === dramaKey(drama));
  const resume = (drama: Drama) => state.history.find(item => item.key === dramaKey(drama));
  const continueRecord = state.history.find(item => item.drama.sourceId === provider.id);

  const renderCard = ({ item }: { item: Drama }) => <DramaCard drama={item} colors={colors} width={cardWidth} saved={saved(item)} onPress={() => { void openDetail(item); }} />;
  const listProps = { numColumns: columns, columnWrapperStyle: { gap: 14 }, contentContainerStyle: { padding: 20, paddingBottom: 32 }, keyExtractor: dramaKey, renderItem: renderCard };

  return <SafeAreaView style={[styles.app, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={[styles.frame, { maxWidth: 1160 }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.brand}><View style={[styles.brandIcon, { backgroundColor: colors.action }]}><Icon name="play" colors={colors} color={colors.onAction} size={21} /></View>
          <View><Text style={[styles.brandTitle, { color: colors.text }]}>HONGUO</Text><Text style={[styles.brandCaption, { color: colors.muted }]}>你的私人片单</Text></View></View>
        <Pressable onPress={() => present({ kind: 'sources' })} accessibilityRole="button" accessibilityLabel={`当前片源：${provider.name}，点击切换`}
          style={({ pressed }) => [styles.sourceButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <View style={[styles.sourceDot, { backgroundColor: colors.accent }]} /><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, flexShrink: 1 }}>{provider.name}</Text><Icon name="chevron-down" colors={colors} size={14} />
        </Pressable>
      </View>
      {!!library.error && <View style={[styles.alert, { backgroundColor: colors.tint }]}>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text, flex: 1, lineHeight: 21 }}>{library.error}</Text>
        <Button label="重试保存" colors={colors} small onPress={() => act(library.store.flush(), '资料已保存。')} />
      </View>}
      {!!notice && <View style={[styles.alert, { backgroundColor: colors.raised }]}><Text accessibilityLiveRegion="polite" style={{ color: colors.text, flex: 1, lineHeight: 21 }}>{notice}</Text><IconButton name="close" label="关闭提示" onPress={() => setNotice('')} colors={colors} /></View>}
      {!ready ? <Busy colors={colors} label="正在读取你的片单" /> : <View style={styles.scene}>
        {tab === 'home' && <FlatList key={`${tab}-${columns}`} {...listProps} data={feed.items} ListHeaderComponent={<View>
          <View style={styles.sectionIntro}><Text style={[styles.eyebrow, { color: colors.accent }]}>留一点时间，看个好故事</Text><Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>今天，想看什么？</Text><Text style={[styles.description, { color: colors.muted }]}>从片库里发现，收藏到自己的片单。</Text></View>
          {provider.id === sampleId && <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.surface }]}><Icon name="information-circle-outline" colors={colors} color={colors.accent} /><Text style={[styles.infoText, { color: colors.muted }]}>这里是公开授权的 Blender 预告片，用于体验功能，非红果片源。</Text></View>}
          {continueRecord && <Pressable accessibilityRole="button" accessibilityLabel={`继续观看${continueRecord.drama.title}`} onPress={() => { void openDetail(continueRecord.drama); }} style={({ pressed }) => [styles.continueCard, { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="play-circle-outline" colors={colors} color={colors.accent} size={32} /><View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 12, marginBottom: 5 }}>继续观看</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{continueRecord.drama.title}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>第 {continueRecord.episode.index} 集 · {formatTime(continueRecord.seconds)}</Text></View><Icon name="chevron-forward" colors={colors} />
          </Pressable>}
          {!!feed.items[0] && <Pressable accessibilityRole="button" accessibilityLabel={`查看${feed.items[0].title}`} onPress={() => { void openDetail(feed.items[0]); }} style={({ pressed }) => [styles.hero, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
            <View style={{ flex: 1, gap: 12 }}><Text style={[styles.eyebrow, { color: colors.accent }]}>从这里开始</Text><Text numberOfLines={3} style={[styles.heroTitle, { color: colors.text }]}>{feed.items[0].title}</Text><Text numberOfLines={3} style={[styles.description, { color: colors.muted }]}>{feed.items[0].description || feed.items[0].tags.join(' · ') || '打开详情，选择你想看的集数。'}</Text><View style={styles.row}><Icon name="play-circle" colors={colors} color={colors.accent} size={26} /><Text style={{ color: colors.text, fontWeight: '700' }}>选集观看</Text></View></View><View style={{ width: 105 }}><Cover drama={feed.items[0]} colors={colors} /></View>
          </Pressable>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.wrap, { flexWrap: 'nowrap', paddingVertical: 18 }]}>{provider.categories.map(item => <Chip key={item.id} label={item.label} selected={category === item.id} onPress={() => setCategory(item.id)} colors={colors} />)}</ScrollView>
          {!!feed.items.length && <View style={[styles.row, { marginBottom: 18, justifyContent: 'space-between' }]}><Text style={[styles.sectionTitle, { color: colors.text }]}>片库</Text><Text style={{ color: colors.muted, fontSize: 12 }}>已加载 {feed.items.length} 部</Text></View>}
        </View>}
          ListEmptyComponent={feed.loading ? <Busy colors={colors} /> : <EmptyState icon={feed.error ? 'cloud-offline-outline' : 'film-outline'} title={feed.error ? '片库暂时无法连接' : '还没有可显示的作品'} body={feed.error || '可以切换片源，或导入你自己的 JSON 片单。'} colors={colors}>
            <Button label="重试" icon="refresh-outline" colors={colors} onPress={() => { void loadFeed(); }} />
            {provider.id !== sampleId && <Button label="打开公开样片" variant="primary" colors={colors} onPress={() => selectSource(sampleId)} />}
          </EmptyState>}
          ListFooterComponent={feed.items.length ? <View style={{ gap: 12 }}>{feed.error ? <Text style={{ color: colors.danger, lineHeight: 22 }}>{feed.error}</Text> : null}{feed.loading ? <Busy colors={colors} /> : feed.hasMore ? <Button label="加载更多" colors={colors} onPress={() => { void loadFeed(true, feed.cursor); }} /> : <Text style={[styles.endText, { color: colors.muted }]}>已经看到这里了，去搜索找找下一部。</Text>}</View> : undefined} />}

        {tab === 'search' && <FlatList key={`${tab}-${columns}`} {...listProps} data={search.items} keyboardShouldPersistTaps="handled" ListHeaderComponent={<View>
          <View style={styles.sectionIntro}><Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>找一个好故事</Text><Text style={[styles.description, { color: colors.muted }]}>正在搜索：{provider.name}</Text></View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Icon name="search-outline" colors={colors} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => { void searchFor(); }} returnKeyType="search" accessibilityLabel="输入剧名" placeholder="输入剧名或关键词" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} maxLength={100} /><Button small label="搜索" variant="primary" colors={colors} onPress={() => { void searchFor(); }} disabled={!query.trim() || search.loading} /></View>
          {!!suggestions.length && <View style={[styles.wrap, { marginVertical: 18 }]}>{suggestions.map(value => <Chip key={value} label={value} onPress={() => { void searchFor(value); }} colors={colors} />)}</View>}
          {!!search.query && <Text style={[styles.label, { color: colors.muted, marginTop: 24, marginBottom: 18 }]}>“{search.query}” · 已找到 {search.items.length} 部</Text>}
        </View>} ListEmptyComponent={search.loading ? <Busy colors={colors} /> : <EmptyState icon="search-outline" title={search.error ? '搜索暂时不可用' : search.query ? '暂时没有找到' : '记住剧名，就从这里找起'} body={search.error || (search.query ? '试试更短的关键词，或切换其他片源。' : '搜索结果来自当前选择的片源，收藏和历史可以跨片源保留。')} colors={colors}>{search.error && <Button label="重试搜索" colors={colors} onPress={() => { void searchFor(search.query); }} />}</EmptyState>}
          ListFooterComponent={search.items.length ? <View>{search.error ? <Text style={{ color: colors.danger }}>{search.error}</Text> : null}{search.loading ? <Busy colors={colors} /> : search.hasMore ? <Button label="更多搜索结果" onPress={() => { void searchFor(search.query, true); }} colors={colors} /> : null}</View> : undefined} />}

        {tab === 'library' && <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.sectionIntro}><Text style={[styles.eyebrow, { color: colors.accent }]}>故事不散场</Text><Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>我的片单</Text><Text style={[styles.description, { color: colors.muted }]}>喜欢的、看过的，都替你记在本机。</Text></View>
          <View style={[styles.wrap, { marginBottom: 24 }]}><Chip label={`收藏 ${state.favorites.length}`} selected={libraryView === 'favorites'} onPress={() => setLibraryView('favorites')} colors={colors} /><Chip label={`历史 ${state.history.length}`} selected={libraryView === 'history'} onPress={() => setLibraryView('history')} colors={colors} /><Chip label={`缓存 ${state.downloads.length}`} selected={libraryView === 'downloads'} onPress={() => setLibraryView('downloads')} colors={colors} /></View>
          {libraryView === 'favorites' && (state.favorites.length ? <View style={styles.grid}>{state.favorites.map(drama => <DramaCard key={dramaKey(drama)} drama={drama} colors={colors} width={cardWidth} saved onPress={() => { void openDetail(drama); }} />)}</View> : <EmptyState title="把喜欢的故事留在这里" body="打开作品详情，点一下收藏，就能在这份片单里找到它。" icon="bookmark-outline" colors={colors}><Button label="去发现" colors={colors} onPress={() => setTab('home')} /></EmptyState>)}
          {libraryView === 'history' && (state.history.length ? <View style={{ gap: 12 }}><View style={styles.row}><Text style={{ color: colors.muted, flex: 1, fontSize: 12 }}>按最近观看排序</Text><Button label="清空历史" variant="quiet" small colors={colors} onPress={() => { void confirmAction('清空观看历史？', '收藏和缓存会保留。').then(ok => { if (ok) act(library.clearHistory()); }); }} /></View>{state.history.map(record => <View key={record.key} style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`继续观看${record.drama.title}`} style={[styles.row, { flex: 1 }]} onPress={() => { void openDetail(record.drama); }}><View style={{ width: 56 }}><Cover drama={record.drama} colors={colors} /></View><View style={{ flex: 1, gap: 6 }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{record.drama.title}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>第 {record.episode.index} 集 · {formatTime(record.seconds)} / {formatTime(record.duration)}</Text><View style={[styles.progress, { backgroundColor: colors.raised }]}><View style={{ height: 3, width: `${Math.min(100, record.duration ? 100 * record.seconds / record.duration : 0)}%`, backgroundColor: colors.accent }} /></View></View></Pressable><IconButton label={`删除${record.drama.title}的历史`} name="close" colors={colors} onPress={() => act(library.removeHistory(record.key))} />
          </View>)}</View> : <EmptyState title="下一次，从上次的地方继续" body="开始观看后，这里会保存每部作品最近的集数和进度。" icon="time-outline" colors={colors} />)}
          {libraryView === 'downloads' && (state.downloads.length ? <View style={{ gap: 14 }}>{state.downloads.map(record => <DownloadCard key={record.id} record={record} colors={colors} onPlay={() => act(playDownload(record))} onPause={() => act(downloads.pause(record.id))} onResume={() => enqueue(record.drama, record.episode)} onRemove={() => { void confirmAction('删除缓存？', `${record.drama.title} · ${record.episode.title}`).then(ok => { if (ok) act(downloads.remove(record.id)); }); }} />)}</View> : <EmptyState title="留一些故事，离线观看" body="可缓存明确允许下载的 HTTPS MP4 内容。红果受保护片源和 HLS 列表不会被误存成可播放缓存。" icon="download-outline" colors={colors} />)}
        </ScrollView>}

        {tab === 'settings' && <ScrollView contentContainerStyle={[styles.scroll, { gap: 20 }]}>
          <View style={styles.sectionIntro}><Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>按你的习惯来</Text><Text style={[styles.description, { color: colors.muted }]}>不接入广告 SDK，片单由你掌握。</Text></View>
          <SettingsCard title="看片偏好" colors={colors}><View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.text }]}>自动连播</Text><Text style={[styles.settingBody, { color: colors.muted }]}>当前一集播完，继续下一集</Text></View><Switch value={state.preferences.autoPlayNext} onValueChange={value => act(library.setPreferences({ autoPlayNext: value }))} accessibilityLabel="自动连播" trackColor={{ false: colors.border, true: colors.action }} /></View><Text style={[styles.label, { color: colors.muted }]}>默认倍速</Text><View style={styles.wrap}>{[0.75, 1, 1.25, 1.5, 2, 3].map(value => <Chip key={value} label={`${value}×`} selected={state.preferences.playbackSpeed === value} onPress={() => act(library.setPreferences({ playbackSpeed: value }))} colors={colors} />)}</View><Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>外观</Text><View style={styles.wrap}>{([{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }, { value: 'system', label: '跟随系统' }] as const).map(item => <Chip key={item.value} label={item.label} selected={state.preferences.theme === item.value} onPress={() => act(library.setPreferences({ theme: item.value }))} colors={colors} />)}</View></SettingsCard>
          <SettingsCard title="片源与目录" colors={colors}><SettingRow title={provider.name} body="切换红果片库、公开样片或你自己的片单" colors={colors} onPress={() => present({ kind: 'sources' })} /><View style={styles.wrap}><Button label="导入 JSON 片单" icon="add-outline" colors={colors} onPress={() => present({ kind: 'editor', mode: 'catalog' })} /><Button label="导出目录示例" icon="document-text-outline" colors={colors} onPress={() => act(shareJson('catalog-example.json', JSON.stringify({ ...sampleCatalog, id: 'my-open-films', name: '我的开放影片' }, null, 2)))} /></View>{state.catalogs.map(catalog => <View key={catalog.id} style={[styles.importedRow, { borderTopColor: colors.border }]}><View style={{ flex: 1 }}><Text style={{ color: colors.text }}>{catalog.name}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{catalog.dramas.length} 部 · 自备片单</Text></View><IconButton label={`导出${catalog.name}`} name="share-outline" colors={colors} onPress={() => act(shareJson(`catalog-${catalog.id}.json`, library.exportCatalog(catalog.id)))} /><IconButton label={`移除${catalog.name}`} name="trash-outline" colors={colors} onPress={() => { void confirmAction('移除片单？', '作品的收藏与历史会保留，重新导入同一片单即可继续。').then(ok => { if (ok) act(library.removeCatalog(catalog.id)); }); }} /></View>)}</SettingsCard>
          <SettingsCard title="本机资料" colors={colors}><Text style={[styles.description, { color: colors.muted }]}>导出收藏、观看进度、偏好与片单。视频文件不包含在资料备份中。</Text><View style={styles.wrap}><Button label="导出备份" icon="share-outline" colors={colors} onPress={() => act(shareJson(`${projectName}-backup.json`, library.exportBackup()))} /><Button label="恢复备份" icon="cloud-download-outline" colors={colors} onPress={() => present({ kind: 'editor', mode: 'restore' })} /></View></SettingsCard>
          <SettingsCard title="关于这个项目" colors={colors}><SettingRow title="Honguo · 0.1.0" body={projectName} colors={colors} onPress={() => present({ kind: 'about' })} /><Text style={[styles.description, { color: colors.muted }]}>一个非官方的双端客户端。内容是否可用取决于来源服务；本应用没有官方账号授权和付费内容解锁功能。</Text></SettingsCard>
          <Text style={[styles.endText, { color: colors.muted }]}>把注意力，留给故事。</Text>
        </ScrollView>}
      </View>}
      <View style={[styles.tabBar, { backgroundColor: colors.background, borderTopColor: colors.border }]} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => { detailRequest.current++; setTab(item.id); }} style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.55 : 1 }]}><Icon name={tab === item.id ? item.active : item.icon} colors={colors} color={tab === item.id ? colors.accent : colors.muted} size={24} /><Text style={{ color: tab === item.id ? colors.accent : colors.muted, fontSize: 12, fontWeight: tab === item.id ? '700' : '500' }}>{item.label}</Text></Pressable>)}</View>
    </View>

    <Modal visible={!!overlay} animationType="none" presentationStyle="fullScreen" onRequestClose={closeOverlay}>
      {overlay?.kind === 'player' ? <Player {...overlay} colors={colors} preferences={state.preferences} resume={resume(overlay.detail)} onClose={closeOverlay} onProgress={(episode, seconds, duration) => act(library.recordProgress(overlay.detail, episode, seconds, duration))} onPreferences={patch => act(library.setPreferences(patch))} onDownload={episode => enqueue(overlay.detail, episode)} />
        : <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={[styles.modalHeader, { borderBottomColor: colors.border }]}><IconButton name="chevron-back" label="返回" onPress={closeOverlay} colors={colors} /><Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>{overlay?.kind === 'detail' ? '作品详情' : overlay?.kind === 'sources' ? '选择片源' : overlay?.kind === 'about' ? '源码与来源' : overlay?.kind === 'editor' && overlay.mode === 'restore' ? '恢复片单资料' : '导入自备片单'}</Text></View>
          {overlay?.kind === 'detail' && <DetailView key={dramaKey(overlay.drama)} value={overlay} colors={colors} saved={saved(overlay.drama)} resume={resume(overlay.drama)} onFavorite={() => act(library.toggleFavorite(overlay.detail ?? overlay.drama))} onRetry={() => { void openDetail(overlay.drama); }} onPlay={episode => { if (overlay.detail) play(overlay.detail, episode, overlay.provider); }} onDownload={episode => enqueue(overlay.detail ?? overlay.drama, episode)} />}
          {overlay?.kind === 'sources' && <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: 720, alignSelf: 'center', width: '100%', gap: 14 }]}><Text style={[styles.description, { color: colors.muted }]}>每个片源独立加载。切换片源不会清空你的收藏和观看历史。</Text>{providers.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: provider.id === item.id }} onPress={() => selectSource(item.id)} style={({ pressed }) => [styles.sourceCard, { borderColor: provider.id === item.id ? colors.accent : colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.emptySquare, { backgroundColor: colors.tint }]}><Icon name={item.id === 'hongguo' ? 'film-outline' : item.id === sampleId ? 'play-circle-outline' : 'folder-open-outline'} colors={colors} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{item.name}</Text><Text style={[styles.settingBody, { color: colors.muted }]}>{item.id === 'hongguo' ? '匿名接入 · 需完整设备构建 · 受服务限制' : item.id === sampleId ? 'CC BY 3.0 开放预告片 · 非红果内容' : '你导入的 JSON 媒体目录'}</Text></View>{provider.id === item.id && <Icon name="checkmark-circle" colors={colors} color={colors.accent} />}</Pressable>)}<Button label="添加自己的 JSON 片单" colors={colors} icon="add-outline" onPress={() => present({ kind: 'editor', mode: 'catalog' })} /></ScrollView>}
          {overlay?.kind === 'editor' && <JsonEditor mode={overlay.mode} colors={colors} onSubmit={async json => {
            if (overlay.mode === 'catalog') { await library.importCatalog(json, 'replace'); setNotice('片单已导入，可在顶部切换片源。'); }
            else { await library.restoreBackup(json, 'merge'); setNotice('备份已合并恢复。视频文件需要单独重新缓存。'); }
            closeOverlay();
          }} />}
          {overlay?.kind === 'about' && <ScrollView contentContainerStyle={[styles.scroll, { gap: 22, maxWidth: 760, alignSelf: 'center', width: '100%' }]}><Text style={[styles.pageTitle, { color: colors.text }]}>每一部分，都有出处。</Text><Text style={[styles.description, { color: colors.muted }]}>{projectName} 的界面、本机片单和缓存流程为本项目源码。红果接入通过随项目提供源码和构建脚本的 openhongguo 实现；不包含第三方闭源播放核心。</Text><SettingsCard title="许可与来源" colors={colors}><Text style={[styles.description, { color: colors.muted }]}>原创代码采用 Apache-2.0。上游 SDK 保留自己的 Apache-2.0 LICENSE 与 README 中的研究、非商业使用声明；依赖许可与来源记录见随项目交付的 THIRD_PARTY_NOTICES.md、docs/SOURCES.md。</Text><SettingRow title="openhongguo" body="非官方接口 SDK · 上游源码" colors={colors} onPress={() => act(Linking.openURL('https://github.com/beilunyang/openhongguo'))} /><SettingRow title="Blender 开放影片" body="样片原作者与 CC BY 3.0 许可" colors={colors} onPress={() => act(Linking.openURL('https://durian.blender.org/sharing/'))} /></SettingsCard><SettingsCard title="当前能力边界" colors={colors}><Text style={[styles.description, { color: colors.muted }]}>支持红果片库、搜索、选集和普通视频地址；受保护格式、账号授权和服务端限制会返回明确提示。缓存仅适用于来源明确允许下载的 MP4。此版本尚未经过 iPhone 或 Android 真机验收；源码构建不等于已获得商店上架资格。</Text></SettingsCard><Text style={[styles.description, { color: colors.muted }]}>项目未内置官方账号凭据，不收集观看记录。导出的资料与自备片单由你自行保存。个人 GitHub 仓库地址将在发布后补充。</Text><Text style={[styles.description, { color: colors.muted }]}>{sampleCatalog.attribution}</Text></ScrollView>}
        </SafeAreaView>}
    </Modal>
  </SafeAreaView>;
}

function DetailView({ value, colors, saved, resume, onFavorite, onPlay, onDownload, onRetry }: {
  value: Extract<Overlay, { kind: 'detail' }>; colors: Colors; saved: boolean; resume?: WatchProgress;
  onFavorite(): void; onPlay(episode: Episode): void; onDownload(episode: Episode): void; onRetry(): void;
}) {
  const [group, setGroup] = useState(0);
  const detail = value.detail;
  const drama = detail ?? value.drama;
  const episodes = detail?.episodes ?? [];
  const resumeEpisode = episodes.find(item => item.id === resume?.episode.id) ?? episodes[0];
  const groups = Math.ceil(episodes.length / 50);
  return <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: 900, alignSelf: 'center', width: '100%', gap: 24 }]}>
    <View style={[styles.row, { alignItems: 'flex-start', gap: 20 }]}><Cover drama={drama} large colors={colors} /><View style={{ flex: 1, gap: 12 }}><Text style={[styles.detailTitle, { color: colors.text }]}>{drama.title}</Text><Text style={{ color: colors.accent, fontSize: 13 }}>{value.provider.name}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{drama.episodeCount ? `${drama.episodeCount} 集` : '集数以目录为准'}</Text><Button label={saved ? '已收藏' : '加入收藏'} icon={saved ? 'bookmark' : 'bookmark-outline'} colors={colors} onPress={onFavorite} /></View></View>
    <Text style={[styles.description, { color: colors.muted, lineHeight: 25 }]}>{drama.description || '这部作品暂时没有简介。'}</Text>
    {!!drama.tags.length && <View style={styles.wrap}>{drama.tags.map(tag => <View key={tag} style={[styles.tag, { backgroundColor: colors.raised }]}><Text style={{ color: colors.muted, fontSize: 12 }}>{tag}</Text></View>)}</View>}
    {!detail && !value.error ? <Busy colors={colors} label="正在读取选集" /> : value.error ? <EmptyState title="目录暂时不可用" body={value.error} colors={colors}><Button label="重试" onPress={onRetry} colors={colors} /></EmptyState> : <>
      {resumeEpisode && <Button label={resume?.episode.id === resumeEpisode.id ? `继续第 ${resumeEpisode.index} 集 · ${formatTime(resume.seconds)}` : '开始观看'} icon="play" variant="primary" onPress={() => onPlay(resumeEpisode)} colors={colors} />}
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={[styles.sectionTitle, { color: colors.text }]}>选集</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{episodes.length} 集</Text></View>
      {groups > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{Array.from({ length: groups }, (_, i) => <Chip key={i} label={`${i * 50 + 1}–${Math.min((i + 1) * 50, episodes.length)}`} selected={group === i} onPress={() => setGroup(i)} colors={colors} />)}</ScrollView>}
      {!episodes.length && <Text style={{ color: colors.muted }}>来源暂未提供可用分集。</Text>}
      <View style={styles.wrap}>{episodes.slice(group * 50, group * 50 + 50).map(episode => <Chip key={episode.id} label={`${episode.index}`} selected={episode.id === resume?.episode.id} onPress={() => onPlay(episode)} colors={colors} />)}</View>
      {!!episodes.length && <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Icon name="download-outline" colors={colors} color={colors.accent} /><View style={{ flex: 1, gap: 12 }}><Text style={[styles.description, { color: colors.muted }]}>在线播放后可在播放器里缓存本集。仅支持来源允许下载的 MP4。</Text><Button small label="缓存第一集" onPress={() => onDownload(episodes[0])} colors={colors} /></View></View>}
    </>}
  </ScrollView>;
}

function DownloadCard({ record, colors, onPlay, onPause, onResume, onRemove }: { record: DownloadRecord; colors: Colors; onPlay(): void; onPause(): void; onResume(): void; onRemove(): void }) {
  const labels: Record<DownloadRecord['state'], string> = { queued: '等待下载', downloading: '下载中', completed: '已缓存', failed: '下载失败', paused: '已暂停' };
  return <View style={[styles.downloadCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.row}><Icon name={record.state === 'completed' ? 'checkmark-circle-outline' : 'download-outline'} colors={colors} color={colors.accent} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '600', lineHeight: 22 }}>{record.drama.title}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>{record.episode.title} · {labels[record.state]}{record.state === 'downloading' ? ` ${Math.round(record.progress * 100)}%` : ''}</Text></View><IconButton label="删除此缓存" name="trash-outline" onPress={onRemove} colors={colors} /></View><View style={[styles.progress, { backgroundColor: colors.raised }]}><View style={{ height: 3, width: `${Math.min(100, Math.max(0, record.progress * 100))}%`, backgroundColor: colors.accent }} /></View>{record.error && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{record.error}</Text>}<View style={styles.wrap}>{record.state === 'completed' ? <Button label="离线播放" icon="play-outline" variant="primary" colors={colors} onPress={onPlay} /> : record.state === 'queued' || record.state === 'downloading' ? <Button label="暂停" icon="pause-outline" colors={colors} onPress={onPause} /> : <Button label="继续下载" icon="refresh-outline" colors={colors} onPress={onResume} />}</View></View>;
}

function JsonEditor({ mode, colors, onSubmit }: { mode: 'catalog' | 'restore'; colors: Colors; onSubmit(json: string): Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => { setBusy(true); setError(''); try { await onSubmit(value); } catch (reason) { setError(friendly(reason)); } finally { setBusy(false); } };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { gap: 20, maxWidth: 800, alignSelf: 'center', width: '100%' }]}>
    <Text style={[styles.description, { color: colors.muted }]}>{mode === 'catalog' ? '从文件选择或粘贴 JSON 目录。目录标识相同时会替换该目录；其他片单和观看记录保留。媒体链接只接受不含账号密码的 HTTPS 地址。' : '选择本项目导出的备份，将与现有收藏和片单合并。备份不包含已下载的视频文件。'}</Text>
    <View style={styles.wrap}><Button label="选择 JSON 文件" icon="folder-open-outline" colors={colors} onPress={() => { void pickJson().then(text => { if (text !== undefined) setValue(text); }).catch(reason => setError(friendly(reason))); }} />{mode === 'catalog' && <Button label="填入目录示例" icon="document-text-outline" colors={colors} onPress={() => setValue(JSON.stringify({ ...sampleCatalog, id: 'my-open-films', name: '我的开放影片' }, null, 2))} />}</View>
    <Text style={[styles.label, { color: colors.text }]}>JSON 内容</Text>
    <TextInput multiline value={value} onChangeText={setValue} accessibilityLabel="JSON 内容" placeholder="粘贴 JSON…" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={[styles.editor, { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]} maxLength={2 * 1024 * 1024} />
    {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, lineHeight: 23 }}>{error}</Text>}
    <Button label={busy ? '正在处理' : mode === 'catalog' ? '导入片单' : '恢复并合并'} variant="primary" icon={mode === 'catalog' ? 'add-outline' : 'checkmark-outline'} colors={colors} disabled={!value.trim() || busy} onPress={() => { void submit(); }} />
  </ScrollView>;
}

function SettingsCard({ title, colors, children }: { title: string; colors: Colors; children: React.ReactNode }) {
  return <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>{title}</Text>{children}</View>;
}
function SettingRow({ title, body, colors, onPress }: { title: string; body: string; colors: Colors; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${body}`} onPress={onPress} style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.6 : 1 }]}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.settingBody, { color: colors.muted }]}>{body}</Text></View><Icon name="chevron-forward" colors={colors} color={colors.muted} size={18} /></Pressable>;
}

const styles = StyleSheet.create({
  app: { flex: 1 }, frame: { flex: 1, width: '100%', alignSelf: 'center' }, scene: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }, brandIcon: { width: 38, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  brandTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 1.5 }, brandCaption: { fontSize: 10, letterSpacing: 1, marginTop: 4 },
  sourceButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 7, minHeight: 48, borderWidth: 1, borderRadius: 16, maxWidth: 200, flexShrink: 1 }, sourceDot: { width: 6, height: 6, borderRadius: 3 },
  scroll: { padding: 20, paddingBottom: 36 }, sectionIntro: { paddingTop: 12, paddingBottom: 24, gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1 }, pageTitle: { fontSize: 29, fontWeight: '800', lineHeight: 40, letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 23 }, sectionTitle: { fontSize: 18, fontWeight: '700' }, label: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  hero: { borderWidth: 1, borderRadius: 24, padding: 20, flexDirection: 'row', gap: 18, alignItems: 'center', marginTop: 4 }, heroTitle: { fontSize: 23, fontWeight: '800', lineHeight: 32 },
  infoBox: { padding: 16, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 }, infoText: { flex: 1, fontSize: 13, lineHeight: 22 },
  continueCard: { borderRadius: 18, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 18 },
  alert: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, marginHorizontal: 14, marginTop: 10, borderRadius: 14 },
  searchBox: { minHeight: 58, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 5, gap: 8 }, searchInput: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 48 },
  tabBar: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, paddingBottom: 7 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 5 },
  endText: { textAlign: 'center', fontSize: 12, lineHeight: 20, paddingVertical: 20 },
  listCard: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14, borderWidth: 1, borderRadius: 18 }, progress: { height: 3, width: '100%', borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  downloadCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  settingsCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 4 }, settingTitle: { fontSize: 15, fontWeight: '600', lineHeight: 23 }, settingBody: { fontSize: 12, lineHeight: 20, marginTop: 4 },
  importedRow: { borderTopWidth: 1, paddingTop: 16, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14, borderBottomWidth: 1 },
  detailTitle: { fontSize: 24, lineHeight: 33, fontWeight: '800' }, tag: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  sourceCard: { padding: 18, borderWidth: 1, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }, emptySquare: { width: 48, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  editor: { minHeight: 280, borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 13, lineHeight: 21, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'web' ? 'monospace' : 'monospace' },
});
