import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { AppPreferences, ContentProvider, DramaDetail, Episode, PlaybackSource, WatchProgress } from '../domain/types';
import { ProviderError } from '../domain/types';
import { Busy, Button, Chip, EmptyState, IconButton } from './components';
import { formatTime, type Colors } from './theme';

interface Props {
  detail: DramaDetail;
  initialEpisode: string;
  provider: ContentProvider;
  resume?: WatchProgress;
  preferences: AppPreferences;
  colors: Colors;
  offline?: { episodeId: string; uri: string };
  onClose(): void;
  onProgress(episode: Episode, seconds: number, duration: number): void;
  onPreferences(patch: Partial<AppPreferences>): void;
  onDownload(episode: Episode): void;
}

export function Player(props: Props) {
  const { detail, colors, provider } = props;
  const initial = Math.max(0, detail.episodes.findIndex(ep => ep.id === props.initialEpisode));
  const [index, setIndex] = useState(initial);
  const [prepared, setPrepared] = useState<{ key: string; value: PlaybackSource }>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [minimal, setMinimal] = useState(false);
  const episode = detail.episodes[index];
  const episodeKey = episode ? JSON.stringify([episode.sourceId, episode.dramaId, episode.id]) : '';
  const source = prepared?.key === episodeKey ? prepared.value : undefined;
  const { width, height } = useWindowDimensions();
  const wide = width >= 850 && width > height;

  useEffect(() => () => { void provider.cancelPlayback?.(); }, [provider]);

  useEffect(() => {
    let alive = true;
    setPrepared(undefined);
    setError('');
    if (!episode) return;
    const read = props.offline?.episodeId === episode.id
      ? Promise.resolve({ url: props.offline.uri, mimeType: 'video/mp4' } as PlaybackSource)
      : provider.resolve(episode);
    void read.then(value => { if (alive) setPrepared({ key: episodeKey, value }); }).catch(reason => {
      if (alive) setError(reason instanceof ProviderError ? reason.message : '播放地址暂时无法取得。请检查网络后重试。');
    });
    return () => { alive = false; };
  }, [provider, episodeKey, props.offline, retry]);

  if (!episode) return null;

  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton name="chevron-back" label="关闭播放器" onPress={props.onClose} colors={colors} />
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{detail.title}</Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>{episode.title} · {props.offline?.episodeId === episode.id ? '本地缓存' : provider.name}</Text></View>
        <IconButton name={minimal ? 'expand-outline' : 'scan-outline'} label={minimal ? '显示选集与播放设置' : '清屏观看'} onPress={() => setMinimal(!minimal)} colors={colors} />
      </View>
      <View style={[styles.body, wide && styles.wideBody]}>
        <View style={[styles.videoColumn, wide && { flex: 1 }]}>
          {error ? <EmptyState title="这一集暂时无法播放" body={error} colors={colors} icon="alert-circle-outline">
            <Button label="重试" icon="refresh-outline" onPress={() => setRetry(x => x + 1)} colors={colors} />
            <Button label="返回选剧" onPress={props.onClose} colors={colors} />
          </EmptyState> : source ? <VideoBody key={`${episode.id}/${retry}/${source.url}`}
            source={source} episode={episode} colors={colors} minimal={minimal}
            speed={props.preferences.playbackSpeed}
            initialTime={props.resume?.episode.id === episode.id ? props.resume.seconds : 0}
            onProgress={props.onProgress}
            onEnd={() => { if (props.preferences.autoPlayNext && index + 1 < detail.episodes.length) setIndex(index + 1); }} />
            : <Busy colors={colors} label="正在取得播放地址" />}
        </View>
        {!minimal && <ScrollView style={[styles.controls, wide && styles.wideControls]} contentContainerStyle={{ padding: 18, gap: 20 }}>
          <View style={styles.row}>
            <Button small label="上一集" icon="play-skip-back-outline" onPress={() => setIndex(index - 1)} disabled={index === 0} colors={colors} />
            <Text style={{ color: colors.muted, textAlign: 'center', flex: 1 }}>{index + 1} / {detail.episodes.length}</Text>
            <Button small label="下一集" icon="play-skip-forward-outline" onPress={() => setIndex(index + 1)} disabled={index + 1 === detail.episodes.length} colors={colors} />
          </View>
          <View><Text style={[styles.label, { color: colors.muted }]}>播放倍速</Text>
            <View style={styles.wrap}>{[0.75, 1, 1.25, 1.5, 2, 3].map(speed => <Chip key={speed} label={`${speed}×`} selected={props.preferences.playbackSpeed === speed} onPress={() => props.onPreferences({ playbackSpeed: speed })} colors={colors} />)}</View></View>
          <View style={styles.wrap}>
            <Chip label={`自动连播${props.preferences.autoPlayNext ? '：开' : '：关'}`} selected={props.preferences.autoPlayNext} onPress={() => props.onPreferences({ autoPlayNext: !props.preferences.autoPlayNext })} colors={colors} />
            <Button small label="缓存本集" icon="download-outline" onPress={() => props.onDownload(episode)} colors={colors} />
          </View>
          <View><Text style={[styles.label, { color: colors.muted }]}>选集</Text>
            <View style={styles.wrap}>{detail.episodes.map((ep, i) => <Chip key={ep.id} label={`${ep.index}`} selected={i === index} onPress={() => setIndex(i)} colors={colors} />)}</View></View>
        </ScrollView>}
      </View>
    </SafeAreaView>;
}

function VideoBody({ source, episode, initialTime, speed, onProgress, onEnd, colors, minimal }: {
  source: PlaybackSource; episode: Episode; initialTime: number; speed: number;
  onProgress(episode: Episode, seconds: number, duration: number): void; onEnd(): void; colors: Colors; minimal: boolean;
}) {
  useKeepAwake();
  const [playerError, setPlayerError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [quality, setQuality] = useState(source.url);
  const seekRef = useRef(initialTime);
  const pendingSeek = useRef<number | undefined>(undefined);
  const startedRef = useRef(false);
  const lastValid = useRef<{ seconds: number; duration: number } | undefined>(undefined);
  const lastPersist = useRef(0);
  const callbacks = useRef({ onProgress, onEnd });
  callbacks.current = { onProgress, onEnd };
  const input = useMemo(() => ({ uri: quality, headers: source.headers,
    contentType: (source.mimeType?.includes('mpegurl') || /\.m3u8(?:\?|$)/i.test(quality)) ? 'hls' as const : 'progressive' as const }), [quality, source.headers, source.mimeType]);
  const player = useVideoPlayer(input, video => {
    video.loop = false;
    video.timeUpdateEventInterval = 1;
    video.playbackRate = speed;
  });

  useEffect(() => { player.playbackRate = speed; }, [player, speed]);

  useEffect(() => {
    const save = () => {
      // Keep a JS snapshot: a released player or failed quality switch must not
      // erase the previous resume position or be read during effect teardown.
      const value = lastValid.current;
      if (value) callbacks.current.onProgress(episode, value.seconds, value.duration);
    };
    const status = player.addListener('statusChange', event => {
      setLoading(event.status === 'loading' || event.status === 'idle');
      setPlayerError(event.status === 'error');
      // Expo's web implementation reports readyToPlay but does not emit the
      // native sourceLoad event. Both paths must initialize the same session.
      if (event.status === 'readyToPlay') onLoaded();
    });
    const playState = player.addListener('playingChange', event => setPlaying(event.isPlaying));
    function onLoaded() {
      if (startedRef.current) return;
      const duration = player.duration;
      const target = seekRef.current > 0 && seekRef.current < Math.max(0, duration - 1) ? seekRef.current : 0;
      if (target > 0) { player.currentTime = target; pendingSeek.current = target; }
      seekRef.current = 0;
      startedRef.current = true;
      if (duration > 0) lastValid.current = { seconds: target, duration };
      setTime(target);
      setLoading(false);
      player.play();
    };
    const loaded = player.addListener('sourceLoad', onLoaded);
    const tick = player.addListener('timeUpdate', event => {
      if (!startedRef.current || player.duration <= 0 || !Number.isFinite(event.currentTime)) return;
      if (pendingSeek.current !== undefined && Math.abs(event.currentTime - pendingSeek.current) > 2) return;
      pendingSeek.current = undefined;
      setTime(event.currentTime);
      lastValid.current = { seconds: event.currentTime, duration: player.duration };
      if (Date.now() - lastPersist.current >= 5000) { lastPersist.current = Date.now(); save(); }
    });
    const ended = player.addListener('playToEnd', () => { save(); callbacks.current.onEnd(); });
    const appState = AppState.addEventListener('change', state => { if (state !== 'active') save(); });
    if (player.status === 'readyToPlay') onLoaded();
    return () => { save(); status.remove(); playState.remove(); loaded.remove(); tick.remove(); ended.remove(); appState.remove(); };
  }, [player, episode.id]);

  return <View style={styles.videoContainer}>
    <VideoView player={player} style={styles.video} nativeControls contentFit="contain" playsInline
      fullscreenOptions={{ enable: true }} allowsPictureInPicture startsPictureInPictureAutomatically
      onFullscreenEnter={() => { if (Platform.OS !== 'web') void ScreenOrientation.unlockAsync().catch(() => {}); }}
      onFullscreenExit={() => { if (Platform.OS !== 'web') void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); }} />
    {loading && <View pointerEvents="none" style={styles.loading}><Busy colors={colors} label="正在缓冲" /></View>}
    {playerError && <View style={styles.playerError}><Text style={{ color: '#FFFFFF', textAlign: 'center' }}>视频未能加载。可返回上一页重试，或换一集。</Text></View>}
    {!minimal && <View style={[styles.row, { backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 10 }]}>
      <Button label="后退 10 秒" icon="play-back-outline" colors={colors} small onPress={() => { player.currentTime = Math.max(0, player.currentTime - 10); }} />
      <Button label={playing ? '暂停' : '播放'} icon={playing ? 'pause' : 'play'} colors={colors} variant="primary" small onPress={() => { if (player.playing) player.pause(); else player.play(); }} />
      <Button label="前进 10 秒" icon="play-forward-outline" colors={colors} small onPress={() => { player.currentTime = Math.min(player.duration, player.currentTime + 10); }} />
    </View>}
    {!minimal && <View style={[styles.videoFoot, { backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>{formatTime(time)} / {formatTime(player.duration)}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>拖动进度条可快进</Text>
    </View>}
    {!minimal && !!source.qualities?.length && <View style={[styles.wrap, { padding: 12 }]}>
      {source.qualities.map(item => <Chip key={item.url} label={item.label} selected={quality === item.url} colors={colors} onPress={() => {
        if (quality === item.url) return;
        seekRef.current = lastValid.current?.seconds ?? 0;
        startedRef.current = false;
        pendingSeek.current = undefined;
        setLoading(true); setPlayerError(false);
        setQuality(item.url);
      }} />)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' }, body: { flex: 1 }, wideBody: { flexDirection: 'row' },
  videoColumn: { flex: 1, minHeight: 210, justifyContent: 'center', backgroundColor: '#000000' },
  videoContainer: { flex: 1 }, video: { flex: 1, minHeight: 200, width: '100%' },
  videoFoot: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  loading: { position: 'absolute', top: '40%', alignSelf: 'center', backgroundColor: '#151519E8', borderRadius: 16 },
  playerError: { position: 'absolute', top: '35%', left: 24, right: 24, backgroundColor: '#151519F0', borderRadius: 16, padding: 24 },
  controls: { maxHeight: '44%' }, wideControls: { width: 330, maxHeight: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13, marginBottom: 10, fontWeight: '600' },
});
