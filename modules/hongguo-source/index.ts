import { requireOptionalNativeModule } from 'expo';
import { decodeEnvelope, HongguoNativeError, type HongguoBridge, type HongguoMethod } from './types';

interface NativeModule {
  defaultProfilePath(): string;
  createClient(profilePath: string): string;
  call(id: number, method: string, argsJson: string): Promise<string>;
  releaseClient(id: number): void;
  cancelPlayback(id: number): void;
}

const native = requireOptionalNativeModule<NativeModule>('HongguoSource');
let clientId: number | undefined;

function getClient(): { module: NativeModule; id: number } {
  if (!native) {
    throw new HongguoNativeError(
      'NATIVE_UNAVAILABLE',
      '此运行环境没有红果原生模块。请安装本项目从源码构建的 Android/iOS 应用；Expo Go 无法加载该模块。',
    );
  }
  if (clientId === undefined) {
    const result = decodeEnvelope(native.createClient(native.defaultProfilePath())) as { id?: unknown };
    if (!result || typeof result.id !== 'number') {
      throw new HongguoNativeError('INVALID_RESPONSE', '无法创建红果数据连接。');
    }
    clientId = result.id;
  }
  return { module: native, id: clientId };
}

export const hongguoBridge: HongguoBridge = {
  cancelPlayback() { if (native && clientId !== undefined) native.cancelPlayback(clientId); },
  async invoke(method: HongguoMethod, args: unknown[] = []) {
    const { module, id } = getClient();
    return decodeEnvelope(await module.call(id, method, JSON.stringify(args)));
  },
};

/** Releases only in-memory work; the persistent guest identity remains intact. */
export function releaseHongguoClient(): void {
  if (native && clientId !== undefined) native.releaseClient(clientId);
  clientId = undefined;
}

export { HongguoNativeError } from './types';
export type { HongguoBridge } from './types';
