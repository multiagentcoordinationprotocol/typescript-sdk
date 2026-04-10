import { describe, it, expect, beforeEach } from 'vitest';
import { ProposalProjection } from '../../../src/projections/proposal';
import { ProtoRegistry } from '../../../src/proto-registry';
import { buildEnvelope } from '../../../src/envelope';
import { MODE_PROPOSAL } from '../../../src/constants';

const registry = new ProtoRegistry();

function makeEnvelope(messageType: string, payload: Record<string, unknown>, sender = 'agent-a') {
  return buildEnvelope({
    mode: MODE_PROPOSAL,
    messageType,
    sessionId: 'test-session',
    sender,
    payload: registry.encodeKnownPayload(MODE_PROPOSAL, messageType, payload),
  });
}

describe('ProposalProjection', () => {
  let projection: ProposalProjection;

  beforeEach(() => {
    projection = new ProposalProjection();
  });

  it('starts in Negotiating phase', () => {
    expect(projection.phase).toBe('Negotiating');
  });

  it('tracks proposals', () => {
    projection.applyEnvelope(
      makeEnvelope('Proposal', { proposalId: 'p1', title: 'Plan A', summary: 'do it', tags: ['urgent'] }),
      registry,
    );
    expect(projection.proposals.size).toBe(1);
    expect(projection.proposals.get('p1')).toMatchObject({
      proposalId: 'p1',
      title: 'Plan A',
      status: 'open',
      sender: 'agent-a',
    });
    expect(projection.phase).toBe('Negotiating');
  });

  it('tracks counter-proposals with supersedes link', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'Plan A' }), registry);
    projection.applyEnvelope(
      makeEnvelope('CounterProposal', { proposalId: 'p2', supersedesProposalId: 'p1', title: 'Plan B' }, 'bob'),
      registry,
    );
    expect(projection.proposals.size).toBe(2);
    expect(projection.proposals.get('p2')?.supersedes).toBe('p1');
    expect(projection.proposals.get('p2')?.sender).toBe('bob');
  });

  it('tracks accepts', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'X' }), registry);
    projection.applyEnvelope(makeEnvelope('Accept', { proposalId: 'p1', reason: 'looks good' }, 'bob'), registry);
    expect(projection.accepts).toHaveLength(1);
    expect(projection.isAccepted('p1')).toBe(true);
    expect(projection.isAccepted('p2')).toBe(false);
  });

  it('tracks terminal rejections and transitions to TerminalRejected phase', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'X' }), registry);
    projection.applyEnvelope(
      makeEnvelope('Reject', { proposalId: 'p1', terminal: true, reason: 'no' }, 'bob'),
      registry,
    );
    expect(projection.isTerminallyRejected('p1')).toBe(true);
    expect(projection.proposals.get('p1')?.status).toBe('rejected');
    expect(projection.phase).toBe('TerminalRejected');
    expect(projection.hasTerminalRejection()).toBe(true);
  });

  it('non-terminal rejections do not change proposal status or phase', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'X' }), registry);
    projection.applyEnvelope(
      makeEnvelope('Reject', { proposalId: 'p1', terminal: false, reason: 'not yet' }, 'bob'),
      registry,
    );
    expect(projection.isTerminallyRejected('p1')).toBe(false);
    expect(projection.proposals.get('p1')?.status).toBe('open');
    expect(projection.phase).toBe('Negotiating');
    expect(projection.hasTerminalRejection()).toBe(false);
  });

  it('tracks withdrawals', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'X' }), registry);
    projection.applyEnvelope(makeEnvelope('Withdraw', { proposalId: 'p1', reason: 'changed mind' }), registry);
    expect(projection.proposals.get('p1')?.status).toBe('withdrawn');
  });

  it('activeProposals returns only open proposals', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'A' }), registry);
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p2', title: 'B' }), registry);
    projection.applyEnvelope(makeEnvelope('Withdraw', { proposalId: 'p1' }), registry);
    expect(projection.activeProposals()).toHaveLength(1);
    expect(projection.activeProposals()[0].proposalId).toBe('p2');
  });

  it('latestProposal returns most recently added', () => {
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p1', title: 'A' }), registry);
    projection.applyEnvelope(makeEnvelope('Proposal', { proposalId: 'p2', title: 'B' }), registry);
    expect(projection.latestProposal()?.proposalId).toBe('p2');
  });

  it('commitment transitions to Committed phase', () => {
    projection.applyEnvelope(
      makeEnvelope('Commitment', {
        commitmentId: 'c1',
        action: 'proposal.accepted',
        authorityScope: 'team',
        reason: 'done',
        modeVersion: '1.0.0',
        configurationVersion: 'config.default',
      }),
      registry,
    );
    expect(projection.phase).toBe('Committed');
    expect(projection.commitment).toBeDefined();
  });
});
