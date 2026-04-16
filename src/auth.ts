import * as grpc from '@grpc/grpc-js';
import { MacpIdentityMismatchError } from './errors';

export interface AuthConfig {
  bearerToken?: string;
  agentId?: string;
  senderHint?: string;
  /**
   * The authenticated sender this credential represents. When present, the SDK
   * refuses to emit an envelope whose `sender` differs from this value
   * (RFC-MACP-0004 §4). Leave undefined for legacy/dev flows that want to
   * retain the pre-0.2 permissive behavior.
   */
  expectedSender?: string;
}

/**
 * Optional second argument to {@link Auth.bearer}. Accepts either a bare
 * `senderHint` string (legacy) or a structured object that can also declare
 * the authenticated identity via `expectedSender`.
 */
export type BearerAuthOptions =
  | string
  | {
      expectedSender?: string;
      senderHint?: string;
    };

export const Auth = {
  /**
   * Dev-mode agent identity. Uses the `x-macp-agent-id` header — only accepted
   * by runtimes started with `MACP_ALLOW_DEV_SENDER_HEADER=1`. Not for
   * production. Does not set {@link AuthConfig.expectedSender}; dev flows stay
   * permissive so tests can reuse a single credential across senders.
   */
  devAgent(agentId: string): AuthConfig {
    return { agentId, senderHint: agentId };
  },
  /**
   * Production bearer-token credential. Pass `{ expectedSender }` to have the
   * SDK refuse to emit envelopes whose `sender` differs from the authenticated
   * identity (RFC-MACP-0004 §4).
   *
   * ```ts
   * Auth.bearer('tok')                               // legacy; no identity guard
   * Auth.bearer('tok', 'alice')                      // legacy; alice is senderHint only
   * Auth.bearer('tok', { expectedSender: 'alice' })  // strict; SDK enforces sender=='alice'
   * ```
   */
  bearer(token: string, options?: BearerAuthOptions): AuthConfig {
    if (options === undefined) return { bearerToken: token };
    if (typeof options === 'string') return { bearerToken: token, senderHint: options };
    const { expectedSender, senderHint } = options;
    return {
      bearerToken: token,
      expectedSender,
      senderHint: senderHint ?? expectedSender,
    };
  },
};

export function validateAuth(auth: AuthConfig): void {
  if (!auth.bearerToken && !auth.agentId) {
    throw new Error('either bearerToken or agentId is required');
  }
  if (auth.bearerToken && auth.agentId) {
    throw new Error('choose either bearerToken or agentId, not both');
  }
}

export function authSender(auth?: AuthConfig): string | undefined {
  if (!auth) return undefined;
  return auth.expectedSender ?? auth.senderHint ?? auth.agentId;
}

/**
 * Throw {@link MacpIdentityMismatchError} when a caller-supplied `sender`
 * conflicts with `auth.expectedSender`. Silent when either is undefined, so
 * dev credentials and legacy bearer usage retain pre-0.2 behavior.
 */
export function assertSenderMatchesIdentity(auth: AuthConfig | undefined, sender: string | undefined): void {
  if (!auth?.expectedSender) return;
  if (sender === undefined) return;
  if (sender !== auth.expectedSender) {
    throw new MacpIdentityMismatchError(auth.expectedSender, sender);
  }
}

export function metadataFromAuth(auth: AuthConfig): grpc.Metadata {
  validateAuth(auth);
  const metadata = new grpc.Metadata();
  if (auth.bearerToken) metadata.set('authorization', `Bearer ${auth.bearerToken}`);
  if (auth.agentId) metadata.set('x-macp-agent-id', auth.agentId);
  return metadata;
}
