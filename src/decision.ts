import { authSender, type AuthConfig } from './auth';
import type { MacpClient } from './client';
import {
  DEFAULT_CONFIGURATION_VERSION,
  DEFAULT_MODE_VERSION,
  DEFAULT_POLICY_VERSION,
  MODE_DECISION,
} from './constants';
import { buildCommitmentPayload, buildEnvelope, buildSessionStartPayload, newSessionId } from './envelope';
import { DecisionProjection } from './projections';
import {
  validateConfidence,
  validateRecommendation,
  validateRequiredField,
  validateSessionId,
  validateSessionStart,
  validateSeverity,
  validateVote,
} from './validation';
import type {
  Ack,
  DecisionEvaluationPayload,
  DecisionObjectionPayload,
  DecisionProposalPayload,
  DecisionVotePayload,
  Envelope,
  SessionMetadata,
} from './types';

interface DecisionSessionOptions {
  sessionId?: string;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  auth?: AuthConfig;
}

export class DecisionSession {
  readonly client: MacpClient;
  readonly sessionId: string;
  readonly modeVersion: string;
  readonly configurationVersion: string;
  readonly policyVersion: string;
  readonly auth?: AuthConfig;
  readonly projection = new DecisionProjection();

  constructor(client: MacpClient, options: DecisionSessionOptions = {}) {
    this.client = client;
    if (options.sessionId) validateSessionId(options.sessionId);
    this.sessionId = options.sessionId ?? newSessionId();
    this.modeVersion = options.modeVersion ?? DEFAULT_MODE_VERSION;
    this.configurationVersion = options.configurationVersion ?? DEFAULT_CONFIGURATION_VERSION;
    this.policyVersion = options.policyVersion ?? DEFAULT_POLICY_VERSION;
    this.auth = options.auth;
  }

  private senderFor(sender?: string, auth?: AuthConfig): string {
    return sender ?? authSender(auth ?? this.auth ?? this.client.auth) ?? '';
  }

  private async sendAndTrack(envelope: Envelope, auth?: AuthConfig): Promise<Ack> {
    const ack = await this.client.send(envelope, { auth: auth ?? this.auth });
    if (ack.ok) this.projection.applyEnvelope(envelope, this.client.protoRegistry);
    return ack;
  }

  async start(input: {
    intent: string;
    participants: string[];
    ttlMs: number;
    context?: Buffer | string | Record<string, unknown>;
    roots?: { uri: string; name?: string }[];
    sender?: string;
  }): Promise<Ack> {
    validateSessionStart({
      intent: input.intent,
      participants: input.participants,
      ttlMs: input.ttlMs,
      modeVersion: this.modeVersion,
      configurationVersion: this.configurationVersion,
    });
    const payload = buildSessionStartPayload({
      intent: input.intent,
      participants: input.participants,
      ttlMs: input.ttlMs,
      context: input.context,
      roots: input.roots,
      modeVersion: this.modeVersion,
      configurationVersion: this.configurationVersion,
      policyVersion: this.policyVersion,
    });
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'SessionStart',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'SessionStart',
        payload as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, this.auth);
  }

  async propose(input: DecisionProposalPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    validateRequiredField('proposalId', input.proposalId);
    validateRequiredField('option', input.option);
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'Proposal',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'Proposal',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async evaluate(input: DecisionEvaluationPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    validateRequiredField('proposalId', input.proposalId);
    validateRecommendation(input.recommendation);
    validateConfidence(input.confidence);
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'Evaluation',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'Evaluation',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async raiseObjection(input: DecisionObjectionPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    validateRequiredField('proposalId', input.proposalId);
    if (input.severity) validateSeverity(input.severity);
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'Objection',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'Objection',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async vote(input: DecisionVotePayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    validateRequiredField('proposalId', input.proposalId);
    validateVote(input.vote);
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'Vote',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'Vote',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async commit(input: {
    action: string;
    authorityScope: string;
    reason: string;
    commitmentId?: string;
    outcomePositive?: boolean;
    sender?: string;
    auth?: AuthConfig;
  }): Promise<Ack> {
    const payload = buildCommitmentPayload({
      action: input.action,
      authorityScope: input.authorityScope,
      reason: input.reason,
      commitmentId: input.commitmentId,
      outcomePositive: input.outcomePositive,
      modeVersion: this.modeVersion,
      configurationVersion: this.configurationVersion,
      policyVersion: this.policyVersion,
    });
    const envelope = buildEnvelope({
      mode: MODE_DECISION,
      messageType: 'Commitment',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_DECISION,
        'Commitment',
        payload as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  metadata(auth?: AuthConfig): Promise<{ metadata: SessionMetadata }> {
    return this.client.getSession(this.sessionId, { auth: auth ?? this.auth });
  }
}
