import { MODE_PROPOSAL } from '../constants';
import type { Envelope } from '../types';
import type { ProtoRegistry } from '../proto-registry';

export interface ProposalRecord {
  proposalId: string;
  title: string;
  summary?: string;
  tags?: string[];
  sender: string;
  supersedes?: string;
  status: 'open' | 'accepted' | 'rejected' | 'withdrawn';
}

export interface ProposalAcceptRecord {
  proposalId: string;
  reason?: string;
  sender: string;
}

export interface ProposalRejectRecord {
  proposalId: string;
  terminal: boolean;
  reason?: string;
  sender: string;
}

export class ProposalProjection {
  readonly proposals = new Map<string, ProposalRecord>();
  readonly accepts: ProposalAcceptRecord[] = [];
  readonly rejections: ProposalRejectRecord[] = [];
  readonly transcript: Envelope[] = [];
  phase: 'Proposing' | 'Negotiating' | 'Committed' = 'Proposing';
  commitment?: Record<string, unknown>;

  applyEnvelope(envelope: Envelope, protoRegistry: ProtoRegistry): void {
    if (envelope.mode !== MODE_PROPOSAL) return;
    this.transcript.push(envelope);
    const payload = protoRegistry.decodeKnownPayload(envelope.mode, envelope.messageType, envelope.payload);
    switch (envelope.messageType) {
      case 'Proposal': {
        const record = payload as { proposalId: string; title: string; summary?: string; tags?: string[] };
        this.proposals.set(record.proposalId, {
          proposalId: record.proposalId,
          title: record.title,
          summary: record.summary,
          tags: record.tags,
          sender: envelope.sender,
          status: 'open',
        });
        this.phase = 'Negotiating';
        break;
      }
      case 'CounterProposal': {
        const record = payload as {
          proposalId: string;
          supersedesProposalId: string;
          title: string;
          summary?: string;
        };
        this.proposals.set(record.proposalId, {
          proposalId: record.proposalId,
          title: record.title,
          summary: record.summary,
          sender: envelope.sender,
          supersedes: record.supersedesProposalId,
          status: 'open',
        });
        break;
      }
      case 'Accept': {
        const record = payload as { proposalId: string; reason?: string };
        this.accepts.push({ ...record, sender: envelope.sender });
        break;
      }
      case 'Reject': {
        const record = payload as { proposalId: string; terminal?: boolean; reason?: string };
        const terminal = record.terminal ?? false;
        this.rejections.push({
          proposalId: record.proposalId,
          terminal,
          reason: record.reason,
          sender: envelope.sender,
        });
        if (terminal) {
          const proposal = this.proposals.get(record.proposalId);
          if (proposal) proposal.status = 'rejected';
        }
        break;
      }
      case 'Withdraw': {
        const record = payload as { proposalId: string };
        const proposal = this.proposals.get(record.proposalId);
        if (proposal) proposal.status = 'withdrawn';
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

  activeProposals(): ProposalRecord[] {
    return [...this.proposals.values()].filter((p) => p.status === 'open');
  }

  latestProposal(): ProposalRecord | undefined {
    const all = [...this.proposals.values()];
    return all[all.length - 1];
  }

  isAccepted(proposalId: string): boolean {
    return this.accepts.some((a) => a.proposalId === proposalId);
  }

  isTerminallyRejected(proposalId: string): boolean {
    return this.rejections.some((r) => r.proposalId === proposalId && r.terminal);
  }
}
