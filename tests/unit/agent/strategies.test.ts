import { describe, it, expect, vi } from 'vitest';
import {
  evaluationHandler,
  functionEvaluator,
  votingHandler,
  majorityVoter,
  commitmentHandler,
  majorityCommitter,
  type EvaluationStrategy,
  type VotingStrategy,
  type CommitmentStrategy,
} from '../../../src/agent/strategies';
import { DecisionProjection } from '../../../src/projections/decision';
import type { HandlerContext, IncomingMessage, SessionInfo } from '../../../src/agent/types';
import { MODE_DECISION } from '../../../src/constants';

function makeMessage(messageType: string, payload: Record<string, unknown> = {}): IncomingMessage {
  return {
    messageType,
    sender: 'agent-a',
    payload,
    proposalId: (payload.proposalId as string) ?? undefined,
    raw: {
      macpVersion: '1.0',
      mode: MODE_DECISION,
      messageType,
      messageId: 'msg-1',
      sessionId: 'session-1',
      sender: 'agent-a',
      timestampUnixMs: String(Date.now()),
      payload: Buffer.alloc(0),
    },
    seq: 0,
  };
}

function makeContext(overrides?: Partial<HandlerContext>): HandlerContext {
  return {
    participant: { participantId: 'me', sessionId: 'session-1', mode: MODE_DECISION },
    projection: new DecisionProjection(),
    actions: {
      evaluate: vi.fn(),
      vote: vi.fn(),
      commit: vi.fn(),
    },
    session: { sessionId: 'session-1', mode: MODE_DECISION, participants: ['me', 'agent-a'] },
    log: vi.fn(),
    ...overrides,
  };
}

describe('strategies', () => {
  describe('evaluationHandler', () => {
    it('calls strategy.evaluate on Proposal messages', async () => {
      const strategy: EvaluationStrategy = {
        evaluate: vi.fn().mockResolvedValue({
          recommendation: 'approve',
          confidence: 0.95,
          reason: 'Looks good',
        }),
      };

      const handler = evaluationHandler(strategy);
      const msg = makeMessage('Proposal', { proposalId: 'p1', option: 'deploy-v2' });
      const ctx = makeContext();

      await handler(msg, ctx);

      expect(strategy.evaluate).toHaveBeenCalledWith(msg.payload, ctx.session);
      expect(ctx.actions.evaluate).toHaveBeenCalledWith({
        proposalId: 'p1',
        recommendation: 'approve',
        confidence: 0.95,
        reason: 'Looks good',
      });
    });

    it('ignores non-Proposal messages', async () => {
      const strategy: EvaluationStrategy = {
        evaluate: vi.fn(),
      };

      const handler = evaluationHandler(strategy);
      await handler(makeMessage('Vote'), makeContext());

      expect(strategy.evaluate).not.toHaveBeenCalled();
    });

    it('does nothing when evaluate action is missing', async () => {
      const strategy: EvaluationStrategy = {
        evaluate: vi.fn().mockResolvedValue({
          recommendation: 'approve',
          confidence: 0.9,
          reason: 'ok',
        }),
      };

      const handler = evaluationHandler(strategy);
      const ctx = makeContext({ actions: {} });

      // Should not throw
      await handler(makeMessage('Proposal', { proposalId: 'p1' }), ctx);
    });
  });

  describe('functionEvaluator', () => {
    it('creates an EvaluationStrategy from a function', async () => {
      const fn = vi.fn().mockResolvedValue({
        recommendation: 'reject',
        confidence: 0.3,
        reason: 'Too risky',
      });

      const strategy = functionEvaluator(fn);
      const session: SessionInfo = { sessionId: 's1', mode: MODE_DECISION, participants: [] };
      const result = await strategy.evaluate({ proposalId: 'p1' }, session);

      expect(fn).toHaveBeenCalledWith({ proposalId: 'p1' }, session);
      expect(result.recommendation).toBe('reject');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('votingHandler', () => {
    it('calls strategy on Evaluation messages when shouldVote is true', async () => {
      const strategy: VotingStrategy = {
        shouldVote: vi.fn().mockReturnValue(true),
        decideVote: vi.fn().mockResolvedValue({ vote: 'approve', reason: 'Tests pass' }),
      };

      const handler = votingHandler(strategy);
      const msg = makeMessage('Evaluation', { proposalId: 'p1', recommendation: 'approve', confidence: 0.9 });
      const ctx = makeContext();

      await handler(msg, ctx);

      expect(strategy.shouldVote).toHaveBeenCalled();
      expect(strategy.decideVote).toHaveBeenCalled();
      expect(ctx.actions.vote).toHaveBeenCalledWith({
        proposalId: 'p1',
        vote: 'approve',
        reason: 'Tests pass',
      });
    });

    it('does not vote when shouldVote returns false', async () => {
      const strategy: VotingStrategy = {
        shouldVote: vi.fn().mockReturnValue(false),
        decideVote: vi.fn(),
      };

      const handler = votingHandler(strategy);
      const ctx = makeContext();
      await handler(makeMessage('Evaluation', { proposalId: 'p1' }), ctx);

      expect(strategy.decideVote).not.toHaveBeenCalled();
      expect(ctx.actions.vote).not.toHaveBeenCalled();
    });

    it('ignores non-Evaluation messages', async () => {
      const strategy: VotingStrategy = {
        shouldVote: vi.fn(),
        decideVote: vi.fn(),
      };

      const handler = votingHandler(strategy);
      await handler(makeMessage('Proposal'), makeContext());

      expect(strategy.shouldVote).not.toHaveBeenCalled();
    });
  });

  describe('majorityVoter', () => {
    it('shouldVote returns true when evaluations exist', () => {
      const voter = majorityVoter();
      const projection = new DecisionProjection();
      projection.evaluations.push({
        proposalId: 'p1',
        recommendation: 'approve',
        confidence: 0.9,
        sender: 'agent-a',
      });
      expect(voter.shouldVote(projection)).toBe(true);
    });

    it('shouldVote returns false when no evaluations', () => {
      const voter = majorityVoter();
      const projection = new DecisionProjection();
      expect(voter.shouldVote(projection)).toBe(false);
    });

    it('votes approve when majority evaluations are positive', async () => {
      const voter = majorityVoter();
      const projection = new DecisionProjection();
      projection.evaluations.push(
        { proposalId: 'p1', recommendation: 'approve', confidence: 0.9, sender: 'a' },
        { proposalId: 'p1', recommendation: 'approve', confidence: 0.8, sender: 'b' },
        { proposalId: 'p1', recommendation: 'reject', confidence: 0.7, sender: 'c' },
      );

      const result = await voter.decideVote(projection);
      expect(result.vote).toBe('approve');
    });

    it('votes reject when majority evaluations are negative', async () => {
      const voter = majorityVoter();
      const projection = new DecisionProjection();
      projection.evaluations.push(
        { proposalId: 'p1', recommendation: 'reject', confidence: 0.9, sender: 'a' },
        { proposalId: 'p1', recommendation: 'reject', confidence: 0.8, sender: 'b' },
        { proposalId: 'p1', recommendation: 'approve', confidence: 0.7, sender: 'c' },
      );

      const result = await voter.decideVote(projection);
      expect(result.vote).toBe('reject');
    });

    it('respects custom positiveThreshold', async () => {
      const voter = majorityVoter({ positiveThreshold: 0.8 });
      const projection = new DecisionProjection();
      projection.evaluations.push(
        { proposalId: 'p1', recommendation: 'approve', confidence: 0.9, sender: 'a' },
        { proposalId: 'p1', recommendation: 'approve', confidence: 0.8, sender: 'b' },
        { proposalId: 'p1', recommendation: 'reject', confidence: 0.7, sender: 'c' },
      );

      // 2/3 = 0.67, below 0.8 threshold
      const result = await voter.decideVote(projection);
      expect(result.vote).toBe('reject');
    });
  });

  describe('commitmentHandler', () => {
    it('calls strategy on Vote messages when shouldCommit is true', async () => {
      const strategy: CommitmentStrategy = {
        shouldCommit: vi.fn().mockReturnValue(true),
        decideCommitment: vi.fn().mockResolvedValue({
          action: 'deploy',
          authorityScope: 'ops',
          reason: 'Approved by majority',
        }),
      };

      const handler = commitmentHandler(strategy);
      const ctx = makeContext();

      await handler(makeMessage('Vote', { proposalId: 'p1', vote: 'approve' }), ctx);

      expect(strategy.shouldCommit).toHaveBeenCalled();
      expect(ctx.actions.commit).toHaveBeenCalledWith({
        action: 'deploy',
        authorityScope: 'ops',
        reason: 'Approved by majority',
      });
    });

    it('does not commit when shouldCommit returns false', async () => {
      const strategy: CommitmentStrategy = {
        shouldCommit: vi.fn().mockReturnValue(false),
        decideCommitment: vi.fn(),
      };

      const handler = commitmentHandler(strategy);
      const ctx = makeContext();
      await handler(makeMessage('Vote'), ctx);

      expect(strategy.decideCommitment).not.toHaveBeenCalled();
      expect(ctx.actions.commit).not.toHaveBeenCalled();
    });

    it('ignores non-Vote messages', async () => {
      const strategy: CommitmentStrategy = {
        shouldCommit: vi.fn(),
        decideCommitment: vi.fn(),
      };

      const handler = commitmentHandler(strategy);
      await handler(makeMessage('Proposal'), makeContext());

      expect(strategy.shouldCommit).not.toHaveBeenCalled();
    });
  });

  describe('majorityCommitter', () => {
    it('shouldCommit returns true when quorum reached', () => {
      const committer = majorityCommitter({ quorumSize: 2 });
      const projection = new DecisionProjection();
      projection.proposals.set('p1', { proposalId: 'p1', option: 'deploy', sender: 'a' });
      const votes = new Map();
      votes.set('a', { proposalId: 'p1', vote: 'approve', sender: 'a' });
      votes.set('b', { proposalId: 'p1', vote: 'approve', sender: 'b' });
      projection.votes.set('p1', votes);

      expect(committer.shouldCommit(projection)).toBe(true);
    });

    it('shouldCommit returns false when quorum not reached', () => {
      const committer = majorityCommitter({ quorumSize: 3 });
      const projection = new DecisionProjection();
      projection.proposals.set('p1', { proposalId: 'p1', option: 'deploy', sender: 'a' });
      const votes = new Map();
      votes.set('a', { proposalId: 'p1', vote: 'approve', sender: 'a' });
      projection.votes.set('p1', votes);

      expect(committer.shouldCommit(projection)).toBe(false);
    });

    it('shouldCommit returns false when no votes', () => {
      const committer = majorityCommitter();
      const projection = new DecisionProjection();
      expect(committer.shouldCommit(projection)).toBe(false);
    });

    it('decideCommitment uses configured action and scope', async () => {
      const committer = majorityCommitter({ action: 'release', authorityScope: 'engineering' });
      const projection = new DecisionProjection();
      projection.proposals.set('p1', { proposalId: 'p1', option: 'deploy-v2', sender: 'a' });
      const votes = new Map();
      votes.set('a', { proposalId: 'p1', vote: 'approve', sender: 'a' });
      projection.votes.set('p1', votes);

      const result = await committer.decideCommitment(projection);
      expect(result.action).toBe('release');
      expect(result.authorityScope).toBe('engineering');
      expect(result.reason).toContain('deploy-v2');
    });
  });
});
