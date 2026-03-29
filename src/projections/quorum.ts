import { MODE_QUORUM } from '../constants';
import type { Envelope } from '../types';
import type { ProtoRegistry } from '../proto-registry';

export interface ApprovalRequestRecord {
  requestId: string;
  action: string;
  summary: string;
  requiredApprovals: number;
  sender: string;
}

export interface BallotRecord {
  requestId: string;
  vote: 'approve' | 'reject' | 'abstain';
  reason?: string;
  sender: string;
}

export class QuorumProjection {
  readonly requests = new Map<string, ApprovalRequestRecord>();
  readonly ballots = new Map<string, Map<string, BallotRecord>>();
  readonly transcript: Envelope[] = [];
  phase: 'Requesting' | 'Voting' | 'Committed' = 'Requesting';
  commitment?: Record<string, unknown>;

  applyEnvelope(envelope: Envelope, protoRegistry: ProtoRegistry): void {
    if (envelope.mode !== MODE_QUORUM) return;
    this.transcript.push(envelope);
    const payload = protoRegistry.decodeKnownPayload(envelope.mode, envelope.messageType, envelope.payload);
    switch (envelope.messageType) {
      case 'ApprovalRequest': {
        const record = payload as {
          requestId: string;
          action: string;
          summary: string;
          requiredApprovals: number;
        };
        this.requests.set(record.requestId, { ...record, sender: envelope.sender });
        this.phase = 'Voting';
        break;
      }
      case 'Approve': {
        const record = payload as { requestId: string; reason?: string };
        this.setBallot(record.requestId, envelope.sender, 'approve', record.reason);
        break;
      }
      case 'Reject': {
        const record = payload as { requestId: string; reason?: string };
        this.setBallot(record.requestId, envelope.sender, 'reject', record.reason);
        break;
      }
      case 'Abstain': {
        const record = payload as { requestId: string; reason?: string };
        this.setBallot(record.requestId, envelope.sender, 'abstain', record.reason);
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

  private setBallot(requestId: string, sender: string, vote: BallotRecord['vote'], reason?: string): void {
    const senderMap = this.ballots.get(requestId) ?? new Map<string, BallotRecord>();
    senderMap.set(sender, { requestId, vote, reason, sender });
    this.ballots.set(requestId, senderMap);
  }

  approvalCount(requestId: string): number {
    return this.countVotes(requestId, 'approve');
  }

  rejectionCount(requestId: string): number {
    return this.countVotes(requestId, 'reject');
  }

  abstentionCount(requestId: string): number {
    return this.countVotes(requestId, 'abstain');
  }

  hasQuorum(requestId: string): boolean {
    const req = this.requests.get(requestId);
    if (!req) return false;
    return this.approvalCount(requestId) >= req.requiredApprovals;
  }

  threshold(requestId: string): number {
    return this.requests.get(requestId)?.requiredApprovals ?? 0;
  }

  votedSenders(requestId: string): string[] {
    const senderMap = this.ballots.get(requestId);
    return senderMap ? [...senderMap.keys()] : [];
  }

  remainingVotesNeeded(requestId: string): number {
    const req = this.requests.get(requestId);
    if (!req) return 0;
    return Math.max(0, req.requiredApprovals - this.approvalCount(requestId));
  }

  private countVotes(requestId: string, vote: BallotRecord['vote']): number {
    const senderMap = this.ballots.get(requestId);
    if (!senderMap) return 0;
    return [...senderMap.values()].filter((b) => b.vote === vote).length;
  }
}
