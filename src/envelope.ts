import { randomUUID } from 'node:crypto';
import { DEFAULT_CONFIGURATION_VERSION, DEFAULT_MODE_VERSION, DEFAULT_POLICY_VERSION, MACP_VERSION } from './constants';
import type { CommitmentPayload, Envelope, Root, SessionStartPayload } from './types';

export function newSessionId(): string {
  return randomUUID();
}

export function newMessageId(): string {
  return randomUUID();
}

export function newCommitmentId(): string {
  return randomUUID();
}

export function nowUnixMs(): number {
  return Date.now();
}

export function encodeContext(context?: Buffer | string | Record<string, unknown>): Buffer {
  if (!context) return Buffer.alloc(0);
  if (Buffer.isBuffer(context)) return context;
  if (typeof context === 'string') return Buffer.from(context, 'utf8');
  return Buffer.from(JSON.stringify(context), 'utf8');
}

export function buildSessionStartPayload(input: {
  intent: string;
  participants: string[];
  ttlMs: number;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  context?: Buffer | string | Record<string, unknown>;
  roots?: Root[];
}): SessionStartPayload {
  return {
    intent: input.intent,
    participants: input.participants,
    modeVersion: input.modeVersion ?? DEFAULT_MODE_VERSION,
    configurationVersion: input.configurationVersion ?? DEFAULT_CONFIGURATION_VERSION,
    policyVersion: input.policyVersion ?? DEFAULT_POLICY_VERSION,
    ttlMs: input.ttlMs,
    context: encodeContext(input.context),
    roots: input.roots ?? [],
  };
}

const NEGATIVE_SUFFIXES = ['rejected', 'failed', 'declined'];

export function inferOutcomePositive(action: string): boolean {
  const lower = action.toLowerCase();
  if (NEGATIVE_SUFFIXES.some((s) => lower.endsWith(s))) return false;
  return true;
}

export function buildCommitmentPayload(input: {
  action: string;
  authorityScope: string;
  reason: string;
  commitmentId?: string;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  outcomePositive?: boolean;
}): CommitmentPayload {
  return {
    commitmentId: input.commitmentId ?? newCommitmentId(),
    action: input.action,
    authorityScope: input.authorityScope,
    reason: input.reason,
    modeVersion: input.modeVersion ?? DEFAULT_MODE_VERSION,
    configurationVersion: input.configurationVersion ?? DEFAULT_CONFIGURATION_VERSION,
    policyVersion: input.policyVersion ?? DEFAULT_POLICY_VERSION,
    outcomePositive: input.outcomePositive ?? inferOutcomePositive(input.action),
  };
}

export function buildRoot(uri: string, name = ''): Root {
  return { uri, name };
}

export function buildEnvelope(input: {
  mode: string;
  messageType: string;
  sessionId: string;
  payload: Buffer;
  sender?: string;
  messageId?: string;
  macpVersion?: string;
  timestampUnixMs?: string | number;
}): Envelope {
  const ts = input.timestampUnixMs ?? nowUnixMs();
  return {
    macpVersion: input.macpVersion ?? MACP_VERSION,
    mode: input.mode,
    messageType: input.messageType,
    messageId: input.messageId ?? newMessageId(),
    sessionId: input.sessionId,
    sender: input.sender ?? '',
    timestampUnixMs: String(ts),
    payload: input.payload,
  };
}
