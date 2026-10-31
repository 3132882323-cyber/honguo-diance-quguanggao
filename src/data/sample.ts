import type { UserCatalog } from '../domain/types';

/** Open film trailers, not Hongguo content. Original ending/attribution is preserved remotely. */
export const sampleCatalog: UserCatalog = {
  version: 1,
  id: 'open-film-samples',
  name: '开放影片示例',
  attribution: 'Big Buck Bunny © 2008 Blender Foundation / www.bigbuckbunny.org；Sintel © Blender Foundation / www.sintel.org。CC BY 3.0：https://creativecommons.org/licenses/by/3.0/。预告片由 W3C 托管，应用未修改媒体。许可依据：https://peach.blender.org/about/；https://durian.blender.org/sharing/。示例不是红果片源。',
  dramas: [
    {
      id: 'big-buck-bunny-trailer', title: 'Big Buck Bunny · 开放预告片',
      description: 'Blender Foundation 开放动画预告片，用于体验播放、收藏、续播和离线下载。CC BY 3.0，© 2008 Blender Foundation / www.bigbuckbunny.org。视频来自 W3C；不是红果短剧。',
      tags: ['开放影片', '动画', 'CC BY 3.0'],
      episodes: [{ id: 'trailer', title: '官方预告片', url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', mimeType: 'video/mp4', downloadable: true }],
    },
    {
      id: 'sintel-trailer', title: 'Sintel · 开放预告片',
      description: 'Blender Foundation 开放电影预告片。CC BY 3.0，© Blender Foundation / www.sintel.org。视频来自 W3C；不是红果短剧。',
      tags: ['开放影片', '奇幻', 'CC BY 3.0'],
      episodes: [{ id: 'trailer', title: '官方预告片', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', mimeType: 'video/mp4', downloadable: true }],
    },
  ],
};
