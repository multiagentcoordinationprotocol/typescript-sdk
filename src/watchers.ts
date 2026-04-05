import type * as grpc from '@grpc/grpc-js';
import type { AuthConfig } from './auth';
import type { MacpClient } from './client';
import type { Envelope, RegistryChanged, RootsChanged } from './types';

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
    const stream = (
      this.client as unknown as { _watchModeRegistry(auth?: AuthConfig): grpc.ClientReadableStream<RegistryChanged> }
    )._watchModeRegistry(this.auth);
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
    const stream = (
      this.client as unknown as { _watchRoots(auth?: AuthConfig): grpc.ClientReadableStream<RootsChanged> }
    )._watchRoots(this.auth);
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
    const stream = (
      this.client as unknown as { _watchSignals(auth?: AuthConfig): grpc.ClientReadableStream<{ envelope?: Envelope }> }
    )._watchSignals(this.auth);
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
