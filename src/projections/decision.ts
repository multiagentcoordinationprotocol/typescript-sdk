import { MODE_DECISION } from '../constants';
import type { Envelope } from '../types';
import type { ProtoRegistry } from '../proto-registry';

export interface DecisionProposalRecord {
  proposalId: string;
  option: string;
  rationale?: string;
  sender: string;
}

export interface DecisionEvaluationRecord {
  proposalId: string;
  recommendation: string;
  confidence: number;
  reason?: string;
  sender: string;
}

export interface DecisionObjectionRecord {
  proposalId: string;
  reason: string;
  severity: string;
  sender: string;
}

export interface DecisionVoteRecord {
  proposalId: string;
  vote: string;
  reason?: string;
  sender: string;
}

export class DecisionProjection {
  readonly proposals = new Map<string, DecisionProposalRecord>();
  readonly evaluations: DecisionEvaluationRecord[] = [];
  readonly objections: DecisionObjectionRecord[] = [];
  readonly votes = new Map<string, Map<string, DecisionVoteRecord>>();
  readonly transcript: Envelope[] = [];
  phase: 'Proposal' | 'Evaluation' | 'Voting' | 'Committed' = 'Proposal';
  commitment?: Record<string, unknown>;

  applyEnvelope(envelope: Envelope, protoRegistry: ProtoRegistry): void {
    if (envelope.mode !== MODE_DECISION) return;
    this.transcript.push(envelope);
    const payload = protoRegistry.decodeKnownPayload(envelope.mode, envelope.messageType, envelope.payload);
    switch (envelope.messageType) {
      case 'Proposal': {
        const record = payload as { proposalId: string; option: string; rationale?: string };
        this.proposals.set(record.proposalId, {
          proposalId: record.proposalId,
          option: record.option,
          rationale: record.rationale,
          sender: envelope.sender,
        });
        this.phase = 'Evaluation';
        break;
      }
      case 'Evaluation': {
        const record = payload as { proposalId: string; recommendation: string; confidence: number; reason?: string };
        this.evaluations.push({ ...record, sender: envelope.sender });
        break;
      }
      case 'Objection': {
        const record = payload as { proposalId: string; reason: string; severity?: string };
        this.objections.push({ ...record, severity: record.severity ?? 'medium', sender: envelope.sender });
        break;
      }
      case 'Vote': {
        const record = payload as { proposalId: string; vote: string; reason?: string };
        const bySender = this.votes.get(record.proposalId) ?? new Map<string, DecisionVoteRecord>();
        bySender.set(envelope.sender, { ...record, sender: envelope.sender });
        this.votes.set(record.proposalId, bySender);
        this.phase = 'Voting';
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

  voteTotals(): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const [proposalId, senderVotes] of this.votes.entries()) {
      totals[proposalId] = [...senderVotes.values()].filter((item) => isPositiveVote(item.vote)).length;
    }
    return totals;
  }

  majorityWinner(): string | undefined {
    const entries = Object.entries(this.voteTotals());
    if (!entries.length) return undefined;
    return entries.sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  hasBlockingObjection(proposalId: string): boolean {
    const blocking = new Set(['high', 'critical', 'block']);
    return this.objections.some((item) => item.proposalId === proposalId && blocking.has(item.severity.toLowerCase()));
  }
}

function isPositiveVote(vote: string): boolean {
  return new Set(['approve', 'approved', 'yes', 'accept', 'accepted']).has(vote.trim().toLowerCase());
}
