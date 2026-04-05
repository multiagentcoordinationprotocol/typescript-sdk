import { authSender, type AuthConfig } from './auth';
import type { MacpClient } from './client';
import { DEFAULT_CONFIGURATION_VERSION, DEFAULT_MODE_VERSION, DEFAULT_POLICY_VERSION, MODE_QUORUM } from './constants';
import { buildCommitmentPayload, buildEnvelope, buildSessionStartPayload, newSessionId } from './envelope';
import { QuorumProjection } from './projections/quorum';
import type {
  AbstainPayload,
  Ack,
  ApprovalRequestPayload,
  ApprovePayload,
  Envelope,
  QuorumRejectPayload,
  SessionMetadata,
} from './types';

interface QuorumSessionOptions {
  sessionId?: string;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  auth?: AuthConfig;
}

export class QuorumSession {
  readonly client: MacpClient;
  readonly sessionId: string;
  readonly modeVersion: string;
  readonly configurationVersion: string;
  readonly policyVersion: string;
  readonly auth?: AuthConfig;
  readonly projection = new QuorumProjection();

  constructor(client: MacpClient, options: QuorumSessionOptions = {}) {
    this.client = client;
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
      mode: MODE_QUORUM,
      messageType: 'SessionStart',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
        'SessionStart',
        payload as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, this.auth);
  }

  async requestApproval(input: ApprovalRequestPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_QUORUM,
      messageType: 'ApprovalRequest',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
        'ApprovalRequest',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async approve(input: ApprovePayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_QUORUM,
      messageType: 'Approve',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
        'Approve',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async reject(input: QuorumRejectPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_QUORUM,
      messageType: 'Reject',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
        'Reject',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async abstain(input: AbstainPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_QUORUM,
      messageType: 'Abstain',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
        'Abstain',
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
    sender?: string;
    auth?: AuthConfig;
  }): Promise<Ack> {
    const payload = buildCommitmentPayload({
      action: input.action,
      authorityScope: input.authorityScope,
      reason: input.reason,
      commitmentId: input.commitmentId,
      modeVersion: this.modeVersion,
      configurationVersion: this.configurationVersion,
      policyVersion: this.policyVersion,
    });
    const envelope = buildEnvelope({
      mode: MODE_QUORUM,
      messageType: 'Commitment',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_QUORUM,
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
