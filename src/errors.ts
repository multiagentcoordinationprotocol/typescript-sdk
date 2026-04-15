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
  /** Optional gRPC trailing metadata for extracting additional error details. */
  readonly grpcMetadata?: Array<{ key: string; value: string | Buffer }>;

  constructor(ack: Ack, grpcMetadata?: Array<{ key: string; value: string | Buffer }>) {
    super(`${ack.error?.code ?? 'UNKNOWN'}: ${ack.error?.message ?? 'runtime returned nack'}`);
    this.name = 'MacpAckError';
    this.ack = ack;
    this.grpcMetadata = grpcMetadata;
  }

  /** Extract structured denial reasons from the ACK error details and/or gRPC trailing metadata. */
  get reasons(): string[] {
    // First try: parse from ack.error.details (matches Python _parse_ack_reasons)
    const fromDetails = this._parseAckReasons();
    if (fromDetails.length > 0) return fromDetails;

    // Second try: parse from gRPC trailing metadata (matches Python _parse_grpc_metadata_reasons)
    return this._parseGrpcMetadataReasons();
  }

  private _parseAckReasons(): string[] {
    if (!this.ack.error?.details) return [];
    try {
      const details = this.ack.error.details;
      const raw = Buffer.isBuffer(details) ? details.toString('utf-8') : String(details);
      const parsed = JSON.parse(raw);
      const reasons = parsed.reasons;
      return Array.isArray(reasons) ? reasons : [];
    } catch {
      return [];
    }
  }

  private _parseGrpcMetadataReasons(): string[] {
    if (!this.grpcMetadata) return [];
    try {
      for (const item of this.grpcMetadata) {
        if (item.key === 'macp-error-details-bin') {
          const data = Buffer.isBuffer(item.value)
            ? item.value.toString('utf-8')
            : typeof item.value === 'string'
              ? item.value
              : Buffer.from(item.value).toString('utf-8');
          const parsed = JSON.parse(data);
          const reasons = parsed.reasons;
          return Array.isArray(reasons) ? reasons : [];
        }
      }
    } catch {
      // Intentionally swallowed — matches Python's bare except
    }
    return [];
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
