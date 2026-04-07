import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { authSender, type AuthConfig, metadataFromAuth } from './auth';
import { buildEnvelope } from './envelope';
import { MacpAckError, MacpSdkError, MacpTransportError } from './errors';
import { ProtoRegistry } from './proto-registry';
import { validateSignalType } from './validation';
import type {
  Ack,
  AgentManifest,
  Envelope,
  InitializeResult,
  ModeDescriptor,
  PolicyDescriptor,
  SessionMetadata,
  Root,
} from './types';

interface MacpClientOptions {
  address: string;
  secure?: boolean;
  auth?: AuthConfig;
  rootCertificates?: Buffer;
  defaultDeadlineMs?: number;
  clientName?: string;
  clientVersion?: string;
  protoDir?: string;
}

class AsyncQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(value: T) => void> = [];

  push(item: T): void {
    const resolve = this.resolvers.shift();
    if (resolve) resolve(item);
    else this.items.push(item);
  }

  shift(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return Promise.resolve(item);
    return new Promise<T>((resolve) => this.resolvers.push(resolve));
  }
}

const STREAM_END = Symbol('stream-end');

type StreamItem = Envelope | Error | typeof STREAM_END;

export type InlineErrorCallback = (error: { code?: string; message?: string }) => void;

export class MacpStream {
  private readonly queue = new AsyncQueue<StreamItem>();
  private closed = false;
  private readonly inlineErrorCallbacks: InlineErrorCallback[] = [];

  constructor(private readonly call: grpc.ClientDuplexStream<any, any>) {
    call.on('data', (chunk: any) => {
      // Support both old format (chunk.envelope) and new oneof format (chunk.response.envelope)
      const envelope = chunk?.response?.envelope ?? chunk?.envelope;
      if (envelope) {
        this.queue.push(envelope);
      } else if (chunk?.response?.error) {
        // Inline application-level error — stream stays open
        for (const cb of this.inlineErrorCallbacks) cb(chunk.response.error);
      }
    });
    call.on('error', (error: grpc.ServiceError) => {
      this.queue.push(new MacpTransportError(error.details || error.message));
    });
    call.on('end', () => {
      this.queue.push(STREAM_END);
    });
  }

  onInlineError(callback: InlineErrorCallback): void {
    this.inlineErrorCallbacks.push(callback);
  }

  send(envelope: Envelope): Promise<void> {
    if (this.closed) return Promise.reject(new MacpSdkError('stream is already closed'));
    return new Promise<void>((resolve, reject) => {
      this.call.write({ envelope }, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async *responses(): AsyncGenerator<Envelope, void, void> {
    while (true) {
      const item = await this.queue.shift();
      if (item === STREAM_END) return;
      if (item instanceof Error) throw item;
      yield item;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.call.end();
  }
}

export class MacpClient {
  readonly auth?: AuthConfig;
  readonly protoRegistry: ProtoRegistry;
  private readonly client: any;
  private readonly secure: boolean;
  private readonly defaultDeadlineMs?: number;
  private readonly clientName: string;
  private readonly clientVersion: string;

  constructor(options: MacpClientOptions) {
    this.auth = options.auth;
    this.secure = options.secure ?? false;
    this.defaultDeadlineMs = options.defaultDeadlineMs;
    this.clientName = options.clientName ?? 'macp-sdk-typescript';
    this.clientVersion = options.clientVersion ?? '0.1.0';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { protoDir: defaultProtoDir } = require('@macp/proto');
    const protoDir = options.protoDir ?? defaultProtoDir;
    this.protoRegistry = new ProtoRegistry(protoDir);
    const packageDefinition = protoLoader.loadSync(
      [
        path.join(protoDir, 'macp/v1/core.proto'),
        path.join(protoDir, 'macp/v1/envelope.proto'),
        path.join(protoDir, 'macp/v1/policy.proto'),
      ],
      {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [protoDir],
      },
    );
    const descriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const credentials = this.secure
      ? grpc.credentials.createSsl(options.rootCertificates)
      : grpc.credentials.createInsecure();
    this.client = new descriptor.macp.v1.MACPRuntimeService(options.address, credentials);
  }

  private requireAuth(auth?: AuthConfig): AuthConfig {
    const selected = auth ?? this.auth;
    if (!selected) throw new MacpSdkError('this operation requires auth; pass auth= or configure client.auth');
    return selected;
  }

  private metadata(auth?: AuthConfig): grpc.Metadata | undefined {
    const selected = auth ?? this.auth;
    if (!selected) return undefined;
    return metadataFromAuth(selected);
  }

  private deadline(deadlineMs?: number): Date | undefined {
    const resolved = deadlineMs ?? this.defaultDeadlineMs;
    return resolved ? new Date(Date.now() + resolved) : undefined;
  }

  private unary<TRequest, TResponse>(
    method: string,
    request: TRequest,
    auth?: AuthConfig,
    deadlineMs?: number,
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      const callback = (error: grpc.ServiceError | null, response: TResponse) => {
        if (error) reject(new MacpTransportError(error.details || error.message));
        else resolve(response);
      };
      const deadline = this.deadline(deadlineMs);
      const metadata = this.metadata(auth);
      if (metadata && deadline) this.client[method](request, metadata, { deadline }, callback);
      else if (metadata) this.client[method](request, metadata, callback);
      else if (deadline) this.client[method](request, { deadline }, callback);
      else this.client[method](request, callback);
    });
  }

  async initialize(deadlineMs?: number): Promise<InitializeResult> {
    return this.unary(
      'Initialize',
      {
        supportedProtocolVersions: ['1.0'],
        clientInfo: {
          name: this.clientName,
          title: this.clientName,
          version: this.clientVersion,
          description: 'TypeScript SDK for the MACP runtime',
          websiteUrl: '',
        },
        capabilities: {
          sessions: { stream: true },
          cancellation: { cancelSession: true },
          progress: { progress: true },
          manifest: { getManifest: true },
          modeRegistry: { listModes: true, listChanged: true },
          roots: { listRoots: true, listChanged: true },
          policyRegistry: { registerPolicy: true, listPolicies: true, listChanged: true },
          experimental: { features: {} },
        },
      },
      undefined,
      deadlineMs,
    ) as Promise<InitializeResult>;
  }

  async send(
    envelope: Envelope,
    options?: { auth?: AuthConfig; deadlineMs?: number; raiseOnNack?: boolean },
  ): Promise<Ack> {
    const auth = this.requireAuth(options?.auth);
    const response = await this.unary<{ envelope: Envelope }, { ack: Ack }>(
      'Send',
      { envelope },
      auth,
      options?.deadlineMs,
    );
    const ack = response.ack;
    // Duplicate acks are success — the message was already accepted
    if (ack?.duplicate) return ack;
    if (options?.raiseOnNack !== false && !ack?.ok) throw new MacpAckError(ack ?? {});
    return ack;
  }

  async getSession(
    sessionId: string,
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ metadata: SessionMetadata }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('GetSession', { sessionId }, auth, options?.deadlineMs) as Promise<{ metadata: SessionMetadata }>;
  }

  async cancelSession(
    sessionId: string,
    reason: string,
    options?: { auth?: AuthConfig; deadlineMs?: number; raiseOnNack?: boolean },
  ): Promise<Ack> {
    const auth = this.requireAuth(options?.auth);
    const response = await this.unary<{ sessionId: string; reason: string }, { ack: Ack }>(
      'CancelSession',
      { sessionId, reason },
      auth,
      options?.deadlineMs,
    );
    const ack = response.ack;
    if (options?.raiseOnNack !== false && !ack?.ok) throw new MacpAckError(ack ?? {});
    return ack;
  }

  async getManifest(agentId = '', deadlineMs?: number): Promise<{ manifest: AgentManifest }> {
    return this.unary('GetManifest', { agentId }, undefined, deadlineMs) as Promise<{ manifest: AgentManifest }>;
  }

  async listModes(deadlineMs?: number): Promise<{ modes: ModeDescriptor[] }> {
    return this.unary('ListModes', {}, undefined, deadlineMs) as Promise<{ modes: ModeDescriptor[] }>;
  }

  async listExtModes(deadlineMs?: number): Promise<{ modes: ModeDescriptor[] }> {
    return this.unary('ListExtModes', {}, undefined, deadlineMs) as Promise<{ modes: ModeDescriptor[] }>;
  }

  async listRoots(deadlineMs?: number): Promise<{ roots: Root[] }> {
    return this.unary('ListRoots', {}, undefined, deadlineMs) as Promise<{ roots: Root[] }>;
  }

  async registerExtMode(
    descriptor: ModeDescriptor,
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('RegisterExtMode', { descriptor }, auth, options?.deadlineMs) as Promise<{
      ok: boolean;
      error?: string;
    }>;
  }

  async unregisterExtMode(
    mode: string,
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('UnregisterExtMode', { mode }, auth, options?.deadlineMs) as Promise<{
      ok: boolean;
      error?: string;
    }>;
  }

  async promoteMode(
    mode: string,
    promotedModeName = '',
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ ok: boolean; error?: string; mode?: string }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('PromoteMode', { mode, promotedModeName }, auth, options?.deadlineMs) as Promise<{
      ok: boolean;
      error?: string;
      mode?: string;
    }>;
  }

  async registerPolicy(
    descriptor: PolicyDescriptor,
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('RegisterPolicy', { descriptor }, auth, options?.deadlineMs) as Promise<{
      ok: boolean;
      error?: string;
    }>;
  }

  async unregisterPolicy(
    policyId: string,
    options?: { auth?: AuthConfig; deadlineMs?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const auth = this.requireAuth(options?.auth);
    return this.unary('UnregisterPolicy', { policyId }, auth, options?.deadlineMs) as Promise<{
      ok: boolean;
      error?: string;
    }>;
  }

  async getPolicy(policyId: string, options?: { auth?: AuthConfig; deadlineMs?: number }): Promise<PolicyDescriptor> {
    const auth = this.requireAuth(options?.auth);
    const res = await this.unary<{ policyId: string }, { descriptor: PolicyDescriptor }>(
      'GetPolicy',
      { policyId },
      auth,
      options?.deadlineMs,
    );
    return res.descriptor;
  }

  async listPolicies(mode?: string, options?: { auth?: AuthConfig; deadlineMs?: number }): Promise<PolicyDescriptor[]> {
    const auth = this.requireAuth(options?.auth);
    const res = await this.unary<{ mode: string }, { descriptors?: PolicyDescriptor[] }>(
      'ListPolicies',
      { mode: mode || '' },
      auth,
      options?.deadlineMs,
    );
    return res.descriptors || [];
  }

  /** @internal Used by PolicyWatcher */
  _watchPolicies(auth?: AuthConfig): grpc.ClientReadableStream<any> {
    const metadata = this.metadata(auth);
    return metadata ? (this.client as any).WatchPolicies({}, metadata) : (this.client as any).WatchPolicies({});
  }

  openStream(options?: { auth?: AuthConfig }): MacpStream {
    const auth = this.requireAuth(options?.auth);
    const metadata = this.metadata(auth) as grpc.Metadata;
    const call = (this.client as any).StreamSession(metadata);
    return new MacpStream(call);
  }

  /** @internal Used by ModeRegistryWatcher */
  _watchModeRegistry(auth?: AuthConfig): grpc.ClientReadableStream<any> {
    const metadata = this.metadata(auth);
    return metadata ? (this.client as any).WatchModeRegistry({}, metadata) : (this.client as any).WatchModeRegistry({});
  }

  /** @internal Used by RootsWatcher */
  _watchRoots(auth?: AuthConfig): grpc.ClientReadableStream<any> {
    const metadata = this.metadata(auth);
    return metadata ? (this.client as any).WatchRoots({}, metadata) : (this.client as any).WatchRoots({});
  }

  /** @internal Used by SignalWatcher */
  _watchSignals(auth?: AuthConfig): grpc.ClientReadableStream<any> {
    const metadata = this.metadata(auth);
    return metadata ? (this.client as any).WatchSignals({}, metadata) : (this.client as any).WatchSignals({});
  }

  async sendSignal(options: {
    signalType: string;
    data?: Buffer;
    confidence?: number;
    correlationSessionId?: string;
    sender?: string;
    auth?: AuthConfig;
    deadlineMs?: number;
  }): Promise<Ack> {
    validateSignalType(options.signalType, options.data);
    const auth = this.requireAuth(options.auth);
    const payload = this.protoRegistry.encodeKnownPayload('', 'Signal', {
      signalType: options.signalType,
      data: options.data ?? Buffer.alloc(0),
      confidence: options.confidence ?? 0,
      correlationSessionId: options.correlationSessionId ?? '',
    });
    const envelope = buildEnvelope({
      mode: '',
      messageType: 'Signal',
      sessionId: '',
      sender: options.sender ?? this.senderHint(auth) ?? '',
      payload,
    });
    return this.send(envelope, { auth, deadlineMs: options.deadlineMs });
  }

  async sendProgress(options: {
    sessionId?: string;
    mode?: string;
    progressToken: string;
    progress: number;
    total: number;
    message?: string;
    targetMessageId?: string;
    sender?: string;
    auth?: AuthConfig;
    deadlineMs?: number;
  }): Promise<Ack> {
    const auth = this.requireAuth(options.auth);
    const payload = this.protoRegistry.encodeKnownPayload('', 'Progress', {
      progressToken: options.progressToken,
      progress: options.progress,
      total: options.total,
      message: options.message ?? '',
      targetMessageId: options.targetMessageId ?? '',
    });
    const envelope = buildEnvelope({
      mode: options.mode ?? '',
      messageType: 'Progress',
      sessionId: options.sessionId ?? '',
      sender: options.sender ?? this.senderHint(auth) ?? '',
      payload,
    });
    return this.send(envelope, { auth, deadlineMs: options.deadlineMs });
  }

  senderHint(auth?: AuthConfig): string | undefined {
    return authSender(auth ?? this.auth);
  }

  close(): void {
    if (typeof this.client.close === 'function') this.client.close();
  }
}
