import { authSender, type AuthConfig } from './auth';
import type { MacpClient } from './client';
import { DEFAULT_CONFIGURATION_VERSION, DEFAULT_MODE_VERSION, DEFAULT_POLICY_VERSION, MODE_TASK } from './constants';
import { buildCommitmentPayload, buildEnvelope, buildSessionStartPayload, newSessionId } from './envelope';
import { TaskProjection } from './projections/task';
import { validateParticipantCount, validateSessionId } from './validation';
import type {
  Ack,
  Envelope,
  SessionMetadata,
  TaskAcceptPayload,
  TaskCompletePayload,
  TaskFailPayload,
  TaskRejectPayload,
  TaskRequestPayload,
  TaskUpdatePayload,
} from './types';

interface TaskSessionOptions {
  sessionId?: string;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  auth?: AuthConfig;
}

export class TaskSession {
  readonly client: MacpClient;
  readonly sessionId: string;
  readonly modeVersion: string;
  readonly configurationVersion: string;
  readonly policyVersion: string;
  readonly auth?: AuthConfig;
  readonly projection = new TaskProjection();

  constructor(client: MacpClient, options: TaskSessionOptions = {}) {
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
    validateParticipantCount(input.participants.length);
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
      mode: MODE_TASK,
      messageType: 'SessionStart',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'SessionStart',
        payload as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, this.auth);
  }

  async request(input: TaskRequestPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskRequest',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskRequest',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async acceptTask(input: TaskAcceptPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskAccept',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskAccept',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async rejectTask(input: TaskRejectPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskReject',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskReject',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async update(input: TaskUpdatePayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskUpdate',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskUpdate',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async complete(input: TaskCompletePayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskComplete',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskComplete',
        input as unknown as Record<string, unknown>,
      ),
    });
    return this.sendAndTrack(envelope, input.auth);
  }

  async fail(input: TaskFailPayload & { sender?: string; auth?: AuthConfig }): Promise<Ack> {
    const envelope = buildEnvelope({
      mode: MODE_TASK,
      messageType: 'TaskFail',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
        'TaskFail',
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
      mode: MODE_TASK,
      messageType: 'Commitment',
      sessionId: this.sessionId,
      sender: this.senderFor(input.sender, input.auth),
      payload: this.client.protoRegistry.encodeKnownPayload(
        MODE_TASK,
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
