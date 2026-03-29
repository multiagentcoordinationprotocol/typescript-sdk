import { describe, it, expect, beforeEach } from 'vitest';
import { QuorumProjection } from '../../../src/projections/quorum';
import { ProtoRegistry } from '../../../src/proto-registry';
import { buildEnvelope } from '../../../src/envelope';
import { MODE_QUORUM } from '../../../src/constants';

const registry = new ProtoRegistry();

function makeEnvelope(messageType: string, payload: Record<string, unknown>, sender = 'coordinator') {
  return buildEnvelope({
    mode: MODE_QUORUM,
    messageType,
    sessionId: 'test-session',
    sender,
    payload: registry.encodeKnownPayload(MODE_QUORUM, messageType, payload),
  });
}

describe('QuorumProjection', () => {
  let projection: QuorumProjection;

  beforeEach(() => {
    projection = new QuorumProjection();
  });

  it('tracks approval requests', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', {
        requestId: 'r1',
        action: 'deploy',
        summary: 'deploy v2',
        requiredApprovals: 2,
      }),
      registry,
    );
    expect(projection.requests.size).toBe(1);
    expect(projection.threshold('r1')).toBe(2);
    expect(projection.phase).toBe('Voting');
  });

  it('tracks approvals', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 2 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1', reason: 'ok' }, 'alice'), registry);
    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1', reason: 'fine' }, 'bob'), registry);

    expect(projection.approvalCount('r1')).toBe(2);
    expect(projection.hasQuorum('r1')).toBe(true);
  });

  it('tracks rejections', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 2 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Reject', { requestId: 'r1', reason: 'no' }, 'alice'), registry);

    expect(projection.rejectionCount('r1')).toBe(1);
    expect(projection.hasQuorum('r1')).toBe(false);
  });

  it('tracks abstentions', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 1 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Abstain', { requestId: 'r1' }, 'alice'), registry);

    expect(projection.abstentionCount('r1')).toBe(1);
  });

  it('remainingVotesNeeded computes correctly', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 3 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1' }, 'alice'), registry);

    expect(projection.remainingVotesNeeded('r1')).toBe(2);

    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1' }, 'bob'), registry);
    expect(projection.remainingVotesNeeded('r1')).toBe(1);

    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1' }, 'carol'), registry);
    expect(projection.remainingVotesNeeded('r1')).toBe(0);
    expect(projection.hasQuorum('r1')).toBe(true);
  });

  it('votedSenders tracks who voted', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 2 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1' }, 'alice'), registry);
    projection.applyEnvelope(makeEnvelope('Reject', { requestId: 'r1' }, 'bob'), registry);

    expect(projection.votedSenders('r1').sort()).toEqual(['alice', 'bob']);
  });

  it('same sender voting again overwrites previous vote', () => {
    projection.applyEnvelope(
      makeEnvelope('ApprovalRequest', { requestId: 'r1', action: 'x', summary: 'y', requiredApprovals: 1 }),
      registry,
    );
    projection.applyEnvelope(makeEnvelope('Reject', { requestId: 'r1' }, 'alice'), registry);
    projection.applyEnvelope(makeEnvelope('Approve', { requestId: 'r1' }, 'alice'), registry);

    expect(projection.rejectionCount('r1')).toBe(0);
    expect(projection.approvalCount('r1')).toBe(1);
    expect(projection.hasQuorum('r1')).toBe(true);
  });

  it('commitment transitions to Committed', () => {
    projection.applyEnvelope(
      makeEnvelope('Commitment', {
        commitmentId: 'c1',
        action: 'quorum.approved',
        authorityScope: 'team',
        reason: 'threshold reached',
        modeVersion: '1.0.0',
        configurationVersion: 'config.default',
      }),
      registry,
    );
    expect(projection.phase).toBe('Committed');
  });

  it('returns 0 for unknown request', () => {
    expect(projection.approvalCount('nope')).toBe(0);
    expect(projection.rejectionCount('nope')).toBe(0);
    expect(projection.abstentionCount('nope')).toBe(0);
    expect(projection.threshold('nope')).toBe(0);
    expect(projection.remainingVotesNeeded('nope')).toBe(0);
    expect(projection.votedSenders('nope')).toEqual([]);
    expect(projection.hasQuorum('nope')).toBe(false);
  });
});
