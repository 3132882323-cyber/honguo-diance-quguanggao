import test from 'node:test';
import assert from 'node:assert/strict';
import { createHongguoProvider } from './hongguo';
import { ProviderError } from '../domain/types';
import { decodeEnvelope, HongguoNativeError, type HongguoBridge, type HongguoMethod } from '../../modules/hongguo-source/types';

const episode = { id: '7675424396831378456', dramaId: '7675400266065136665', sourceId: 'hongguo', title: '第1集', index: 1 };
const title = { id: episode.dramaId, title: '接口测试剧', description: '合成元数据', episode_count: 2, cover_url: 'https://example.invalid/cover.jpg' };

function fake(result: unknown): { bridge: HongguoBridge; calls: { method: HongguoMethod; args: unknown[] }[] } {
  const calls: { method: HongguoMethod; args: unknown[] }[] = [];
  return { calls, bridge: { async invoke(method, args = []) { calls.push({ method, args }); return result; } } };
}

test('Hongguo forwards opaque cursors and retains 64-bit IDs as strings', async () => {
  const source = fake({ items: [title], has_more: true, cursor: 'opaque-next-cursor' });
  const provider = createHongguoProvider(source.bridge);
  const page = await provider.discover({ category: 'motion', cursor: 'opaque-previous' });
  assert.equal(page.items[0].id, episode.dramaId);
  assert.equal(page.items[0].sourceId, 'hongguo');
  assert.equal(page.cursor, 'opaque-next-cursor');
  assert.deepEqual(source.calls[0], { method: 'discover', args: [{ channel: 'motion', cursor: 'opaque-previous' }] });
  await provider.search(' 测试 ', '20');
  assert.deepEqual(source.calls[1], { method: 'search', args: ['测试', { cursor: '20', pageSize: 20 }] });
});

test('Hongguo details map the same response into drama and episodes', async () => {
  const source = fake({ series: { ...title, rows: [{ kind: 3, text: '都市' }] }, episodes: [{ id: episode.id, number: 1 }] });
  const detail = await createHongguoProvider(source.bridge).detail(episode.dramaId);
  assert.deepEqual(detail.tags, ['都市']);
  assert.deepEqual(detail.episodes[0], episode);
  assert.equal(source.calls.length, 1);
});

test('Hongguo resolve never hands encrypted streams to the player', async () => {
  const source = fake({ protected: false, streams: [{ url: 'https://example.invalid/protected.mp4', protected: true, encryption: 'cenc-aes-ctr' }] });
  await assert.rejects(createHongguoProvider(source.bridge).resolve(episode), (error: unknown) => error instanceof ProviderError && error.code === 'PROTECTED');
  assert.deepEqual(source.calls, [{ method: 'resolve', args: [episode.id] }]);
});

test('Hongguo resolve exposes clear media qualities but disables export', async () => {
  const source = fake({ protected: false, streams: [
    { url: 'https://example.invalid/low.mp4', height: 640, definition: '360p', codec: 'h264', protected: false },
    { url: 'https://example.invalid/high.m3u8', height: 1920, definition: '1080p', hls: true, protected: false },
  ] });
  const playback = await createHongguoProvider(source.bridge).resolve(episode);
  assert.equal(playback.url, 'https://example.invalid/high.m3u8');
  assert.equal(playback.mimeType, 'application/x-mpegURL');
  assert.equal(playback.downloadable, false);
  assert.equal(playback.qualities?.length, 2);
});

test('Hongguo rejects expired, non-HTTP and split-track playback', async () => {
  for (const result of [
    { protected: false, expires_at: 1, streams: [{ url: 'https://example.invalid/old.mp4' }] },
    { protected: false, streams: [{ url: 'file:///private/data.mp4' }] },
    { protected: false, audio_url: 'https://example.invalid/audio.mp4', streams: [{ url: 'https://example.invalid/video.mp4', dash: true }] },
  ]) {
    await assert.rejects(createHongguoProvider(fake(result).bridge).resolve(episode), ProviderError);
  }
});

test('Hongguo preserves actionable service errors without automatic retries or resets', async () => {
  let calls = 0;
  const bridge: HongguoBridge = { async invoke() { calls++; throw new HongguoNativeError('RATE_LIMITED', 'not shown', 5500); } };
  await assert.rejects(createHongguoProvider(bridge).search('测试'), (error: unknown) => error instanceof ProviderError && error.code === 'RATE_LIMITED' && error.message.includes('6 秒'));
  assert.equal(calls, 1);
  const unavailable: HongguoBridge = { async invoke() { throw new HongguoNativeError('NATIVE_UNAVAILABLE', '请安装原生版本'); } };
  await assert.rejects(createHongguoProvider(unavailable).discover(), (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE' && error.message === '请安装原生版本');
});

test('native envelope retains typed protected errors and rejects malformed responses', () => {
  assert.throws(() => decodeEnvelope('{"error":{"code":"DRM_PROTECTED","message":"protected"}}'), (error: unknown) => error instanceof HongguoNativeError && error.code === 'DRM_PROTECTED');
  for (const malformed of ['not-json', 'null', '{}']) assert.throws(() => decodeEnvelope(malformed), HongguoNativeError);
});

test('Hongguo accepts the prepared loopback model and forwards playback cancellation', async () => {
  let cancelled = 0;
  const bridge: HongguoBridge = {
    async invoke() { return { protected: false, streams: [{ url: 'http://127.0.0.1:49152/media/test-session.mp4', protected: false }] }; },
    cancelPlayback() { cancelled++; },
  };
  const provider = createHongguoProvider(bridge);
  const source = await provider.resolve(episode);
  assert.equal(source.url, 'http://127.0.0.1:49152/media/test-session.mp4');
  await provider.cancelPlayback?.();
  assert.equal(cancelled, 1);
});
