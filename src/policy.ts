import type { PolicyDescriptor } from './types';

// ── Shared commitment rules (used by all modes) ───────────────────

export interface CommitmentRulesInput {
  authority?: 'initiator_only' | 'any_participant' | 'designated_role';
  designatedRoles?: string[];
}

function serializeCommitment(commitment?: CommitmentRulesInput): Record<string, unknown> {
  return {
    authority: commitment?.authority ?? 'initiator_only',
    designated_roles: commitment?.designatedRoles ?? [],
  };
}

// ── Decision policy rule types ──────────────────────────────────────

export interface DecisionVotingRules {
  algorithm?: 'none' | 'majority' | 'supermajority' | 'unanimous' | 'weighted' | 'plurality';
  threshold?: number;
  quorum?: { type: 'count' | 'percentage'; value: number };
  weights?: Record<string, number>;
}

export interface DecisionObjectionHandling {
  criticalSeverityVetoes?: boolean;
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

// ── Quorum policy rule types (RFC-MACP-0012 §4.2) ─────────────────

export interface QuorumPolicyRulesInput {
  threshold?: { type: 'n_of_m' | 'percentage' | 'weighted'; value: number };
  abstention?: {
    countsTowardQuorum?: boolean;
    interpretation?: 'neutral' | 'implicit_reject' | 'ignored';
  };
  commitment?: CommitmentRulesInput;
}

// ── Proposal policy rule types (RFC-MACP-0012 §4.3) ───────────────

export interface ProposalPolicyRulesInput {
  acceptance?: { criterion?: 'all_parties' | 'counterparty' | 'initiator' };
  counterProposal?: { maxRounds?: number };
  rejection?: { terminalOnAnyReject?: boolean };
  commitment?: CommitmentRulesInput;
}

// ── Task policy rule types (RFC-MACP-0012 §4.4) ───────────────────

export interface TaskPolicyRulesInput {
  assignment?: { allowReassignmentOnReject?: boolean };
  completion?: { requireOutput?: boolean };
  commitment?: CommitmentRulesInput;
}

// ── Handoff policy rule types (RFC-MACP-0012 §4.5) ────────────────

export interface HandoffPolicyRulesInput {
  acceptance?: { implicitAcceptTimeoutMs?: number };
  commitment?: CommitmentRulesInput;
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
      threshold: rules.voting?.threshold ?? 0.5,
      quorum: rules.voting?.quorum ? { type: rules.voting.quorum.type, value: rules.voting.quorum.value } : undefined,
      weights: rules.voting?.weights ?? undefined,
    },
    objection_handling: {
      critical_severity_vetoes: rules.objectionHandling?.criticalSeverityVetoes ?? false,
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
    policyId,
    mode: 'macp.mode.decision.v1',
    description,
    rules: JSON.stringify(rulesJson),
    schemaVersion: 1,
  };
}

export function buildQuorumPolicy(
  policyId: string,
  description: string,
  rules: QuorumPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    threshold: {
      type: rules.threshold?.type ?? 'n_of_m',
      value: rules.threshold?.value ?? 0,
    },
    abstention: {
      counts_toward_quorum: rules.abstention?.countsTowardQuorum ?? false,
      interpretation: rules.abstention?.interpretation ?? 'neutral',
    },
    commitment: serializeCommitment(rules.commitment),
  };
  return {
    policyId,
    mode: 'macp.mode.quorum.v1',
    description,
    rules: JSON.stringify(rulesJson),
    schemaVersion: 1,
  };
}

export function buildProposalPolicy(
  policyId: string,
  description: string,
  rules: ProposalPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    acceptance: {
      criterion: rules.acceptance?.criterion ?? 'all_parties',
    },
    counter_proposal: {
      max_rounds: rules.counterProposal?.maxRounds ?? 0,
    },
    rejection: {
      terminal_on_any_reject: rules.rejection?.terminalOnAnyReject ?? false,
    },
    commitment: serializeCommitment(rules.commitment),
  };
  return {
    policyId,
    mode: 'macp.mode.proposal.v1',
    description,
    rules: JSON.stringify(rulesJson),
    schemaVersion: 1,
  };
}

export function buildTaskPolicy(policyId: string, description: string, rules: TaskPolicyRulesInput): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    assignment: {
      allow_reassignment_on_reject: rules.assignment?.allowReassignmentOnReject ?? false,
    },
    completion: {
      require_output: rules.completion?.requireOutput ?? false,
    },
    commitment: serializeCommitment(rules.commitment),
  };
  return {
    policyId,
    mode: 'macp.mode.task.v1',
    description,
    rules: JSON.stringify(rulesJson),
    schemaVersion: 1,
  };
}

export function buildHandoffPolicy(
  policyId: string,
  description: string,
  rules: HandoffPolicyRulesInput,
): PolicyDescriptor {
  const rulesJson: Record<string, unknown> = {
    acceptance: {
      implicit_accept_timeout_ms: rules.acceptance?.implicitAcceptTimeoutMs ?? 0,
    },
    commitment: serializeCommitment(rules.commitment),
  };
  return {
    policyId,
    mode: 'macp.mode.handoff.v1',
    description,
    rules: JSON.stringify(rulesJson),
    schemaVersion: 1,
  };
}
