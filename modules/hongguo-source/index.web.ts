import { HongguoNativeError, type HongguoBridge } from './types';

export const hongguoBridge: HongguoBridge = {
  async invoke() {
    throw new HongguoNativeError(
      'NATIVE_UNAVAILABLE',
      '红果片库需要本项目的 Android/iOS 原生应用。网页版可切换到演示片库，或导入有权播放的个人片库。',
    );
  },
};

export function releaseHongguoClient(): void {}
export { HongguoNativeError } from './types';
export type { HongguoBridge } from './types';
