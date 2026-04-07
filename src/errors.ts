import type { Ack } from './types';

export class MacpSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MacpSdkError';
  }
}

export class MacpTransportError extends MacpSdkError {
  constructor(message: string) {
    super(message);
    this.name = 'MacpTransportError';
  }
}

export class MacpAckError extends MacpSdkError {
  readonly ack: Ack;

  constructor(ack: Ack) {
    super(`${ack.error?.code ?? 'UNKNOWN'}: ${ack.error?.message ?? 'runtime returned nack'}`);
    this.name = 'MacpAckError';
    this.ack = ack;
  }

  get reasons(): string[] {
    if (!this.ack.error?.details) return [];
    try {
      const raw =
        Buffer.isBuffer(this.ack.error.details)
          ? this.ack.error.details.toString('utf-8')
          : String(this.ack.error.details);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.reasons) ? parsed.reasons : [];
    } catch {
      return [];
    }
  }
}

export class MacpSessionError extends MacpSdkError {
  constructor(message: string) {
    super(message);
    this.name = 'MacpSessionError';
  }
}

export class MacpTimeoutError extends MacpTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'MacpTimeoutError';
  }
}

export class MacpRetryError extends MacpTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'MacpRetryError';
  }
}
