import { describe, it, expect } from 'vitest';
import {
  buildDecisionPolicy,
  buildQuorumPolicy,
  buildProposalPolicy,
  buildTaskPolicy,
  buildHandoffPolicy,
} from '../../src/policy';

describe('policy builders', () => {
  describe('buildDecisionPolicy', () => {
    it('builds a descriptor with correct mode and schema_version', () => {
      const descriptor = buildDecisionPolicy('policy.test', 'Test policy', {});
      expect(descriptor.policy_id).toBe('policy.test');
      expect(descriptor.mode).toBe('macp.mode.decision.v1');
      expect(descriptor.description).toBe('Test policy');
      expect(descriptor.schema_version).toBe(1);
    });

    it('includes default voting rules', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.voting.algorithm).toBe('none');
      expect(rules.voting.threshold).toBe(0);
    });

    it('includes custom voting rules', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {
        voting: {
          algorithm: 'majority',
          threshold: 0.6,
          quorum: { type: 'count', value: 3 },
          weights: { 'agent-a': 2, 'agent-b': 1 },
        },
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.voting.algorithm).toBe('majority');
      expect(rules.voting.threshold).toBe(0.6);
      expect(rules.voting.quorum).toEqual({ type: 'count', value: 3 });
      expect(rules.voting.weights).toEqual({ 'agent-a': 2, 'agent-b': 1 });
    });

    it('includes objection handling rules', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {
        objectionHandling: { blockSeverityVetoes: false, vetoThreshold: 2 },
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.objection_handling.block_severity_vetoes).toBe(false);
      expect(rules.objection_handling.veto_threshold).toBe(2);
    });

    it('includes evaluation rules', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {
        evaluation: { minimumConfidence: 0.8, requiredBeforeVoting: true },
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.evaluation.minimum_confidence).toBe(0.8);
      expect(rules.evaluation.required_before_voting).toBe(true);
    });

    it('includes commitment rules', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {
        commitment: {
          authority: 'designated_role',
          designatedRoles: ['admin'],
          requireVoteQuorum: true,
        },
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.commitment.authority).toBe('designated_role');
      expect(rules.commitment.designated_roles).toEqual(['admin']);
      expect(rules.commitment.require_vote_quorum).toBe(true);
    });

    it('uses default objection handling values', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.objection_handling.block_severity_vetoes).toBe(true);
      expect(rules.objection_handling.veto_threshold).toBe(1);
    });

    it('uses default commitment values', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.commitment.authority).toBe('initiator_only');
      expect(rules.commitment.designated_roles).toEqual([]);
      expect(rules.commitment.require_vote_quorum).toBe(false);
    });
  });

  describe('buildQuorumPolicy', () => {
    it('builds with correct mode', () => {
      const descriptor = buildQuorumPolicy('q1', 'Quorum policy', {});
      expect(descriptor.mode).toBe('macp.mode.quorum.v1');
      expect(descriptor.schema_version).toBe(1);
    });

    it('includes custom rules', () => {
      const descriptor = buildQuorumPolicy('q1', 'desc', {
        requiredApprovals: 3,
        quorum: { type: 'percentage', value: 75 },
        allowAbstain: false,
        timeoutMs: 30000,
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.required_approvals).toBe(3);
      expect(rules.quorum).toEqual({ type: 'percentage', value: 75 });
      expect(rules.allow_abstain).toBe(false);
      expect(rules.timeout_ms).toBe(30000);
    });

    it('uses default values', () => {
      const descriptor = buildQuorumPolicy('q1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.required_approvals).toBe(1);
      expect(rules.allow_abstain).toBe(true);
      expect(rules.timeout_ms).toBe(0);
    });
  });

  describe('buildProposalPolicy', () => {
    it('builds with correct mode', () => {
      const descriptor = buildProposalPolicy('pr1', 'Proposal policy', {});
      expect(descriptor.mode).toBe('macp.mode.proposal.v1');
    });

    it('includes custom rules', () => {
      const descriptor = buildProposalPolicy('pr1', 'desc', {
        maxCounterProposals: 5,
        requireRationale: true,
        timeoutMs: 60000,
        allowWithdraw: false,
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.max_counter_proposals).toBe(5);
      expect(rules.require_rationale).toBe(true);
      expect(rules.timeout_ms).toBe(60000);
      expect(rules.allow_withdraw).toBe(false);
    });

    it('uses default values', () => {
      const descriptor = buildProposalPolicy('pr1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.max_counter_proposals).toBe(3);
      expect(rules.require_rationale).toBe(false);
      expect(rules.allow_withdraw).toBe(true);
    });
  });

  describe('buildTaskPolicy', () => {
    it('builds with correct mode', () => {
      const descriptor = buildTaskPolicy('t1', 'Task policy', {});
      expect(descriptor.mode).toBe('macp.mode.task.v1');
    });

    it('includes custom rules', () => {
      const descriptor = buildTaskPolicy('t1', 'desc', {
        maxRetries: 3,
        timeoutMs: 120000,
        requireAcceptance: false,
        allowReassignment: true,
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.max_retries).toBe(3);
      expect(rules.timeout_ms).toBe(120000);
      expect(rules.require_acceptance).toBe(false);
      expect(rules.allow_reassignment).toBe(true);
    });

    it('uses default values', () => {
      const descriptor = buildTaskPolicy('t1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.max_retries).toBe(0);
      expect(rules.require_acceptance).toBe(true);
      expect(rules.allow_reassignment).toBe(false);
    });
  });

  describe('buildHandoffPolicy', () => {
    it('builds with correct mode', () => {
      const descriptor = buildHandoffPolicy('h1', 'Handoff policy', {});
      expect(descriptor.mode).toBe('macp.mode.handoff.v1');
    });

    it('includes custom rules', () => {
      const descriptor = buildHandoffPolicy('h1', 'desc', {
        requireContext: true,
        allowDecline: false,
        timeoutMs: 15000,
        maxDeclines: 1,
      });
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.require_context).toBe(true);
      expect(rules.allow_decline).toBe(false);
      expect(rules.timeout_ms).toBe(15000);
      expect(rules.max_declines).toBe(1);
    });

    it('uses default values', () => {
      const descriptor = buildHandoffPolicy('h1', 'desc', {});
      const rules = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(rules.require_context).toBe(false);
      expect(rules.allow_decline).toBe(true);
      expect(rules.timeout_ms).toBe(0);
      expect(rules.max_declines).toBe(3);
    });
  });

  describe('PolicyDescriptor shape', () => {
    it('rules field is a Buffer', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {});
      expect(Buffer.isBuffer(descriptor.rules)).toBe(true);
    });

    it('rules can be parsed as JSON', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', { voting: { algorithm: 'unanimous' } });
      const parsed = JSON.parse(Buffer.from(descriptor.rules).toString('utf8'));
      expect(parsed.voting.algorithm).toBe('unanimous');
    });

    it('registered_at is undefined by default', () => {
      const descriptor = buildDecisionPolicy('p1', 'desc', {});
      expect(descriptor.registered_at).toBeUndefined();
    });
  });
});
