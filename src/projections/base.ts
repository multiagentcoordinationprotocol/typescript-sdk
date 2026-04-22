import type { ProtoRegistry } from '../proto-registry';
import type { Envelope } from '../types';

/**
 * Abstract base for in-process mode-state tracking — parity with python-sdk's
 * `macp_sdk.base_projection.BaseProjection`. Maintains a shared transcript,
 * phase string, and commitment payload; subclasses override `applyMode`
 * to handle mode-specific envelopes. `SessionStart` and `Commitment` are
 * handled here so custom modes get the common lifecycle for free.
 */
export abstract class BaseProjection {
  readonly transcript: Envelope[] = [];
  phase: string = '';
  commitment?: Record<string, unknown>;

  protected abstract readonly mode: string;

  get isCommitted(): boolean {
    return this.commitment !== undefined;
  }

  get isPositiveOutcome(): boolean | undefined {
    if (!this.commitment) return undefined;
    const val =
      (this.commitment as Record<string, unknown>).outcomePositive ??
      (this.commitment as Record<string, unknown>).outcome_positive;
    return val !== undefined ? Boolean(val) : true;
  }

  applyEnvelope(envelope: Envelope, protoRegistry: ProtoRegistry): void {
    if (envelope.mode !== this.mode) return;
    this.transcript.push(envelope);

    if (envelope.messageType === 'Commitment') {
      this.commitment = protoRegistry.decodeKnownPayload(
        envelope.mode,
        envelope.messageType,
        envelope.payload,
      ) as Record<string, unknown>;
      this.phase = 'Committed';
      return;
    }

    this.applyMode(envelope, protoRegistry);
  }

  /** Handle a mode-specific (non-Commitment) envelope. */
  protected abstract applyMode(envelope: Envelope, protoRegistry: ProtoRegistry): void;
}
