import type * as grpc from '@grpc/grpc-js';
import type { AuthConfig } from './auth';
import type { MacpClient } from './client';
import { logger } from './logging';
import type { Envelope, PolicyDescriptor, RegistryChanged, RootsChanged, SessionLifecycleEvent } from './types';

function serverStreamToAsyncGenerator<T>(stream: grpc.ClientReadableStream<T>): AsyncGenerator<T, void, void> {
  const queue: Array<{ value: T } | { error: Error } | { done: true }> = [];
  let resolve: ((value: void) => void) | null = null;

  stream.on('data', (data: T) => {
    queue.push({ value: data });
    if (resolve) {
      resolve();
      resolve = null;
    }
  });
  stream.on('error', (error: Error) => {
    queue.push({ error });
    if (resolve) {
      resolve();
      resolve = null;
    }
  });
  stream.on('end', () => {
    queue.push({ done: true });
    if (resolve) {
      resolve();
      resolve = null;
    }
  });

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next(): Promise<IteratorResult<T, void>> {
      while (true) {
        const item = queue.shift();
        if (item) {
          if ('done' in item) return { value: undefined, done: true };
          if ('error' in item) throw item.error;
          return { value: item.value, done: false };
        }
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    },
    async return(): Promise<IteratorResult<T, void>> {
      stream.cancel();
      return { value: undefined, done: true };
    },
    async throw(err: Error): Promise<IteratorResult<T, void>> {
      stream.cancel();
      throw err;
    },
  };
}

export class ModeRegistryWatcher {
  private readonly client: MacpClient;
  private readonly auth?: AuthConfig;

  constructor(client: MacpClient, options?: { auth?: AuthConfig }) {
    this.client = client;
    this.auth = options?.auth;
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<RegistryChanged, void, void> {
    const stream = this.client.watchModeRegistry(this.auth) as grpc.ClientReadableStream<RegistryChanged>;
    if (signal) {
      signal.addEventListener('abort', () => stream.cancel(), { once: true });
    }
    yield* serverStreamToAsyncGenerator(stream);
  }

  async watch(handler: (change: RegistryChanged) => void | Promise<void>): Promise<void> {
    for await (const change of this.changes()) {
      await handler(change);
    }
  }

  async nextChange(): Promise<RegistryChanged> {
    const gen = this.changes();
    const result = await gen.next();
    await gen.return(undefined as never);
    if (result.done) throw new Error('stream ended before receiving a change');
    return result.value;
  }
}

export class RootsWatcher {
  private readonly client: MacpClient;
  private readonly auth?: AuthConfig;

  constructor(client: MacpClient, options?: { auth?: AuthConfig }) {
    this.client = client;
    this.auth = options?.auth;
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<RootsChanged, void, void> {
    const stream = this.client.watchRoots(this.auth) as grpc.ClientReadableStream<RootsChanged>;
    if (signal) {
      signal.addEventListener('abort', () => stream.cancel(), { once: true });
    }
    yield* serverStreamToAsyncGenerator(stream);
  }

  async watch(handler: (change: RootsChanged) => void | Promise<void>): Promise<void> {
    for await (const change of this.changes()) {
      await handler(change);
    }
  }

  async nextChange(): Promise<RootsChanged> {
    const gen = this.changes();
    const result = await gen.next();
    await gen.return(undefined as never);
    if (result.done) throw new Error('stream ended before receiving a change');
    return result.value;
  }
}

export class SignalWatcher {
  private readonly client: MacpClient;
  private readonly auth?: AuthConfig;

  constructor(client: MacpClient, options?: { auth?: AuthConfig }) {
    this.client = client;
    this.auth = options?.auth;
  }

  async *signals(signal?: AbortSignal): AsyncGenerator<Envelope, void, void> {
    const stream = this.client.watchSignals(this.auth) as grpc.ClientReadableStream<{ envelope?: Envelope }>;
    if (signal) {
      signal.addEventListener('abort', () => stream.cancel(), { once: true });
    }
    const gen = serverStreamToAsyncGenerator(stream);
    for await (const response of gen) {
      if (response.envelope) yield response.envelope;
    }
  }

  async watch(handler: (envelope: Envelope) => void | Promise<void>): Promise<void> {
    for await (const envelope of this.signals()) {
      await handler(envelope);
    }
  }

  async nextSignal(): Promise<Envelope> {
    const gen = this.signals();
    const result = await gen.next();
    await gen.return(undefined as never);
    if (result.done) throw new Error('stream ended before receiving a signal');
    return result.value;
  }
}

export interface PolicyChange {
  descriptors: PolicyDescriptor[];
  observedAtUnixMs: number;
}

export class PolicyWatcher {
  private readonly client: MacpClient;
  private readonly auth?: AuthConfig;

  constructor(client: MacpClient, options?: { auth?: AuthConfig }) {
    this.client = client;
    this.auth = options?.auth;
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<PolicyChange, void, void> {
    const stream = this.client.watchPolicies(this.auth) as grpc.ClientReadableStream<PolicyChange>;
    if (signal) {
      signal.addEventListener('abort', () => stream.cancel(), { once: true });
    }
    yield* serverStreamToAsyncGenerator(stream);
  }

  async watch(handler: (change: PolicyChange) => void | Promise<void>): Promise<void> {
    for await (const change of this.changes()) {
      await handler(change);
    }
  }

  async nextChange(): Promise<PolicyChange> {
    const gen = this.changes();
    const result = await gen.next();
    await gen.return(undefined as never);
    if (result.done) throw new Error('stream ended before receiving a policy change');
    return result.value;
  }
}

export class SessionLifecycleWatcher {
  private readonly client: MacpClient;
  private readonly auth?: AuthConfig;
  private deprecatedEventsWarned = false;
  private deprecatedNextEventWarned = false;

  constructor(client: MacpClient, options?: { auth?: AuthConfig }) {
    this.client = client;
    this.auth = options?.auth;
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<SessionLifecycleEvent, void, void> {
    const stream = this.client.watchSessions(this.auth) as grpc.ClientReadableStream<{ event?: SessionLifecycleEvent }>;
    if (signal) {
      signal.addEventListener('abort', () => stream.cancel(), { once: true });
    }
    const gen = serverStreamToAsyncGenerator(stream);
    for await (const response of gen) {
      if (response.event) yield response.event;
    }
  }

  async watch(handler: (event: SessionLifecycleEvent) => void | Promise<void>): Promise<void> {
    for await (const event of this.changes()) {
      await handler(event);
    }
  }

  async nextChange(): Promise<SessionLifecycleEvent> {
    const gen = this.changes();
    const result = await gen.next();
    await gen.return(undefined as never);
    if (result.done) throw new Error('stream ended before receiving a session lifecycle event');
    return result.value;
  }

  /**
   * @deprecated Use {@link changes} — renamed for parity with python-sdk's
   * `SessionLifecycleWatcher.changes()` and the uniform `changes()` name
   * used by all other watchers in both SDKs. Will be removed in 0.5.0.
   */
  async *events(signal?: AbortSignal): AsyncGenerator<SessionLifecycleEvent, void, void> {
    if (!this.deprecatedEventsWarned) {
      this.deprecatedEventsWarned = true;
      logger.warn('[deprecated] SessionLifecycleWatcher.events() — use changes() instead');
    }
    yield* this.changes(signal);
  }

  /**
   * @deprecated Use {@link nextChange}. Will be removed in 0.5.0.
   */
  async nextEvent(): Promise<SessionLifecycleEvent> {
    if (!this.deprecatedNextEventWarned) {
      this.deprecatedNextEventWarned = true;
      logger.warn('[deprecated] SessionLifecycleWatcher.nextEvent() — use nextChange() instead');
    }
    return this.nextChange();
  }
}
