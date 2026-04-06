import type { PolicyDescriptor } from './types';

// ── Decision policy rule types ──────────────────────────────────────

export interface DecisionVotingRules {
  algorithm?: 'none' | 'majority' | 'supermajority' | 'unanimous' | 'weighted' | 'plurality';
  threshold?: number;
  quorum?: { type: 'count' | 'percentage'; value: number };
  weights?: Record<string, number>;
}

export interface DecisionObjectionHandling {
  blockSeverityVetoes?: boolean;
  vetoThreshold?: number;
}

export interface DecisionEvaluationRules {
  minimumConfidence?: number;
  requiredBeforeVoting?: boolean;
}

export interface DecisionCommitmentRules {
  authority?: 'initiator_only' | 'any_participant' | 'designated_role';
  designatedRoles?: string[];
  requireVoteQuorum?: boolean;
}

export interface DecisionPolicyRulesInput {
  voting?: DecisionVotingRules;
  objectionHandling?: DecisionObjectionHandling;
  evaluation?: DecisionEvaluationRules;
  commitment?: DecisionCommitmentRules;
}

// ── Quorum policy rule types ────────────────────────────────────────

export interface QuorumPolicyRulesInput {
  requiredApprovals?: number;
  quorum?: { type: 'count' | 'percentage'; value: number };
  allowAbstain?: boolean;
  timeoutMs?: number;
}

// ── Proposal policy rule types ──────────────────────────────────────

export interface ProposalPolicyRulesInput {
  maxCounterProposals?: number;
  requireRationale?: boolean;
  timeoutMs?: number;
  allowWithdraw?: boolean;
}

// ── Task policy rule types ──────────────────────────────────────────

export interface TaskPolicyRulesInput {
  maxRetries?: number;
  timeoutMs?: number;
  requireAcceptance?: boolean;
  allowReassignment?: boolean;
}

// ── Handoff policy rule types ───────────────────────────────────────

export interface HandoffPolicyRulesInput {
  requireContext?: boolean;
  allowDecline?: boolean;
  timeoutMs?: number;
  maxDeclines?: number;
}

// ── Builder helpers ─────────────────────────────────────────────────

export function buildDecisionPolicy(
  policyId: string,
  description: string,
  rules: DecisionPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    voting: {
      algorithm: rules.voting?.algorithm ?? 'none',
      threshold: rules.voting?.threshold ?? 0,
      quorum: rules.voting?.quorum ? { type: rules.voting.quorum.type, value: rules.voting.quorum.value } : undefined,
      weights: rules.voting?.weights ?? undefined,
    },
    objection_handling: {
      block_severity_vetoes: rules.objectionHandling?.blockSeverityVetoes ?? true,
      veto_threshold: rules.objectionHandling?.vetoThreshold ?? 1,
    },
    evaluation: {
      minimum_confidence: rules.evaluation?.minimumConfidence ?? 0,
      required_before_voting: rules.evaluation?.requiredBeforeVoting ?? false,
    },
    commitment: {
      authority: rules.commitment?.authority ?? 'initiator_only',
      designated_roles: rules.commitment?.designatedRoles ?? [],
      require_vote_quorum: rules.commitment?.requireVoteQuorum ?? false,
    },
  };
  return {
    policy_id: policyId,
    mode: 'macp.mode.decision.v1',
    description,
    rules: Buffer.from(JSON.stringify(rulesJson)),
    schema_version: 1,
  };
}

export function buildQuorumPolicy(
  policyId: string,
  description: string,
  rules: QuorumPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    required_approvals: rules.requiredApprovals ?? 1,
    quorum: rules.quorum ? { type: rules.quorum.type, value: rules.quorum.value } : undefined,
    allow_abstain: rules.allowAbstain ?? true,
    timeout_ms: rules.timeoutMs ?? 0,
  };
  return {
    policy_id: policyId,
    mode: 'macp.mode.quorum.v1',
    description,
    rules: Buffer.from(JSON.stringify(rulesJson)),
    schema_version: 1,
  };
}

export function buildProposalPolicy(
  policyId: string,
  description: string,
  rules: ProposalPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    max_counter_proposals: rules.maxCounterProposals ?? 3,
    require_rationale: rules.requireRationale ?? false,
    timeout_ms: rules.timeoutMs ?? 0,
    allow_withdraw: rules.allowWithdraw ?? true,
  };
  return {
    policy_id: policyId,
    mode: 'macp.mode.proposal.v1',
    description,
    rules: Buffer.from(JSON.stringify(rulesJson)),
    schema_version: 1,
  };
}

export function buildTaskPolicy(policyId: string, description: string, rules: TaskPolicyRulesInput): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    max_retries: rules.maxRetries ?? 0,
    timeout_ms: rules.timeoutMs ?? 0,
    require_acceptance: rules.requireAcceptance ?? true,
    allow_reassignment: rules.allowReassignment ?? false,
  };
  return {
    policy_id: policyId,
    mode: 'macp.mode.task.v1',
    description,
    rules: Buffer.from(JSON.stringify(rulesJson)),
    schema_version: 1,
  };
}

export function buildHandoffPolicy(
  policyId: string,
  description: string,
  rules: HandoffPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    require_context: rules.requireContext ?? false,
    allow_decline: rules.allowDecline ?? true,
    timeout_ms: rules.timeoutMs ?? 0,
    max_declines: rules.maxDeclines ?? 3,
  };
  return {
    policy_id: policyId,
    mode: 'macp.mode.handoff.v1',
    description,
    rules: Buffer.from(JSON.stringify(rulesJson)),
    schema_version: 1,
  };
}
