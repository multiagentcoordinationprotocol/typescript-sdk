import { MODE_HANDOFF } from '../constants';
import type { Envelope } from '../types';
import type { ProtoRegistry } from '../proto-registry';

export interface HandoffRecord {
  handoffId: string;
  targetParticipant: string;
  scope: string;
  reason?: string;
  sender: string;
  status: 'offered' | 'context_sent' | 'accepted' | 'declined';
  contextContentType?: string;
  acceptedBy?: string;
  declinedBy?: string;
}

export class HandoffProjection {
  readonly handoffs = new Map<string, HandoffRecord>();
  readonly transcript: Envelope[] = [];
  phase: 'Offering' | 'ContextSharing' | 'Resolved' | 'Committed' = 'Offering';
  commitment?: Record<string, unknown>;

  applyEnvelope(envelope: Envelope, protoRegistry: ProtoRegistry): void {
    if (envelope.mode !== MODE_HANDOFF) return;
    this.transcript.push(envelope);
    const payload = protoRegistry.decodeKnownPayload(envelope.mode, envelope.messageType, envelope.payload);
    switch (envelope.messageType) {
      case 'HandoffOffer': {
        const record = payload as { handoffId: string; targetParticipant: string; scope: string; reason?: string };
        this.handoffs.set(record.handoffId, {
          handoffId: record.handoffId,
          targetParticipant: record.targetParticipant,
          scope: record.scope,
          reason: record.reason,
          sender: envelope.sender,
          status: 'offered',
        });
        break;
      }
      case 'HandoffContext': {
        const record = payload as { handoffId: string; contentType: string };
        const handoff = this.handoffs.get(record.handoffId);
        if (handoff) {
          // Per RFC-MACP-0010 §2.1: context after accept is permitted as supplementary docs.
          // Only update status if not already accepted/declined.
          if (handoff.status === 'offered') {
            handoff.status = 'context_sent';
          }
          handoff.contextContentType = record.contentType;
        }
        if (this.phase === 'Offering') this.phase = 'ContextSharing';
        break;
      }
      case 'HandoffAccept': {
        const record = payload as { handoffId: string; acceptedBy: string };
        const handoff = this.handoffs.get(record.handoffId);
        if (handoff) {
          handoff.status = 'accepted';
          handoff.acceptedBy = record.acceptedBy;
        }
        this.phase = 'Resolved';
        break;
      }
      case 'HandoffDecline': {
        const record = payload as { handoffId: string; declinedBy: string };
        const handoff = this.handoffs.get(record.handoffId);
        if (handoff) {
          handoff.status = 'declined';
          handoff.declinedBy = record.declinedBy;
        }
        this.phase = 'Resolved';
        break;
      }
      case 'Commitment': {
        this.commitment = payload;
        this.phase = 'Committed';
        break;
      }
      default:
        break;
    }
  }

  getHandoff(handoffId: string): HandoffRecord | undefined {
    return this.handoffs.get(handoffId);
  }

  isAccepted(handoffId: string): boolean {
    return this.handoffs.get(handoffId)?.status === 'accepted';
  }

  isDeclined(handoffId: string): boolean {
    return this.handoffs.get(handoffId)?.status === 'declined';
  }

  pendingHandoffs(): HandoffRecord[] {
    return [...this.handoffs.values()].filter((h) => h.status === 'offered' || h.status === 'context_sent');
  }

  hasAcceptedOffer(handoffId?: string): boolean {
    if (handoffId) return this.handoffs.get(handoffId)?.status === 'accepted';
    return [...this.handoffs.values()].some((h) => h.status === 'accepted');
  }
}
