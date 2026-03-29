import * as grpc from '@grpc/grpc-js';

export interface AuthConfig {
  bearerToken?: string;
  agentId?: string;
  senderHint?: string;
}

export const Auth = {
  devAgent(agentId: string): AuthConfig {
    return { agentId, senderHint: agentId };
  },
  bearer(token: string, senderHint?: string): AuthConfig {
    return { bearerToken: token, senderHint };
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
  return auth.senderHint ?? auth.agentId;
}

export function metadataFromAuth(auth: AuthConfig): grpc.Metadata {
  validateAuth(auth);
  const metadata = new grpc.Metadata();
  if (auth.bearerToken) metadata.set('authorization', `Bearer ${auth.bearerToken}`);
  if (auth.agentId) metadata.set('x-macp-agent-id', auth.agentId);
  return metadata;
}
