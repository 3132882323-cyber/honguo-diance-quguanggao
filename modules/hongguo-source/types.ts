export type HongguoMethod = 'discover' | 'search' | 'detail' | 'suggest' | 'resolve';

export interface HongguoBridge {
  invoke(method: HongguoMethod, args?: unknown[]): Promise<unknown>;
  cancelPlayback?(): void | Promise<void>;
}

export class HongguoNativeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'HongguoNativeError';
  }
}

export function decodeEnvelope(json: string): unknown {
  let envelope: { result?: unknown; error?: { code?: string; message?: string; retryAfterMs?: number } };
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new HongguoNativeError('INVALID_RESPONSE', '原生数据模块返回了无效响应。');
  }
  if (!envelope || typeof envelope !== 'object') {
    throw new HongguoNativeError('INVALID_RESPONSE', '原生数据模块返回了无效响应。');
  }
  if (envelope.error) {
    throw new HongguoNativeError(
      envelope.error.code ?? 'UNKNOWN',
      envelope.error.message ?? '红果数据请求失败。',
      envelope.error.retryAfterMs,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'result')) {
    throw new HongguoNativeError('INVALID_RESPONSE', '原生数据模块响应缺少结果。');
  }
  return envelope.result;
}
