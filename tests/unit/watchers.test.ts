import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MacpClient } from '../../src/client';
import { ModeRegistryWatcher, PolicyWatcher, RootsWatcher, SignalWatcher } from '../../src/watchers';

/**
 * Fake gRPC readable stream: an EventEmitter with a .cancel() method.
 * Drives the async-generator-adapter in src/watchers.ts without any network.
 */
class FakeReadableStream extends EventEmitter {
  cancel = vi.fn();
  emitData<T>(value: T): void {
    this.emit('data', value);
  }
  emitError(err: Error): void {
    this.emit('error', err);
  }
  emitEnd(): void {
    this.emit('end');
  }
}

function makeClientWith(method: string, stream: FakeReadableStream): MacpClient {
  const stub = vi.fn().mockReturnValue(stream);
  return { [method]: stub } as unknown as MacpClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModeRegistryWatcher', () => {
  it('yields a RegistryChanged then returns on end', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));

    const iter = watcher.changes();
    const next = iter.next();

    stream.emitData({ observedAtUnixMs: 100 });
    const first = await next;
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ observedAtUnixMs: 100 });

    stream.emitEnd();
    const done = await iter.next();
    expect(done.done).toBe(true);
  });

  it('propagates stream errors through the async generator', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));

    const iter = watcher.changes();
    const next = iter.next();
    stream.emitError(new Error('boom'));
    await expect(next).rejects.toThrow('boom');
  });

  it('cancels the underlying stream when the AbortSignal fires', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));
    const controller = new AbortController();

    const iter = watcher.changes(controller.signal);
    // Prime the consumer so the generator subscribes.
    const pending = iter.next();
    controller.abort();

    expect(stream.cancel).toHaveBeenCalledTimes(1);

    // Clean up the pending promise so vitest doesn't warn about a dangling promise.
    stream.emitEnd();
    await pending;
  });

  it('nextChange returns exactly the first change and then cancels', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));

    const pending = watcher.nextChange();
    stream.emitData({ observedAtUnixMs: 42 });
    const change = await pending;
    expect(change).toEqual({ observedAtUnixMs: 42 });
    // Generator.return() is invoked via nextChange → triggers stream.cancel().
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('nextChange throws if the stream ends before a change arrives', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));

    const pending = watcher.nextChange();
    stream.emitEnd();
    await expect(pending).rejects.toThrow('stream ended before receiving a change');
  });

  it('watch() drives the handler for each change', async () => {
    const stream = new FakeReadableStream();
    const watcher = new ModeRegistryWatcher(makeClientWith('watchModeRegistry', stream));
    const seen: number[] = [];

    const promise = watcher.watch((change) => {
      seen.push(change.observedAtUnixMs);
    });

    stream.emitData({ observedAtUnixMs: 1 });
    stream.emitData({ observedAtUnixMs: 2 });
    stream.emitEnd();
    await promise;

    expect(seen).toEqual([1, 2]);
  });
});

describe('RootsWatcher', () => {
  it('yields a RootsChanged payload then returns on end', async () => {
    const stream = new FakeReadableStream();
    const watcher = new RootsWatcher(makeClientWith('watchRoots', stream));

    const iter = watcher.changes();
    const pending = iter.next();
    stream.emitData({ roots: [{ uri: 'file:///x', name: 'x' }], observedAtUnixMs: 10 });
    const first = await pending;
    expect(first.value).toMatchObject({ observedAtUnixMs: 10 });

    stream.emitEnd();
    const done = await iter.next();
    expect(done.done).toBe(true);
  });

  it('surfaces transport errors', async () => {
    const stream = new FakeReadableStream();
    const watcher = new RootsWatcher(makeClientWith('watchRoots', stream));
    const pending = watcher.nextChange();
    stream.emitError(new Error('roots-transport'));
    await expect(pending).rejects.toThrow('roots-transport');
  });
});

describe('SignalWatcher', () => {
  it('unwraps envelopes from the wire frame', async () => {
    const stream = new FakeReadableStream();
    const watcher = new SignalWatcher(makeClientWith('watchSignals', stream));

    const iter = watcher.signals();
    const pending = iter.next();
    stream.emitData({ envelope: { mode: '', messageType: 'Signal', messageId: 'm1' } });
    const first = await pending;
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ messageType: 'Signal', messageId: 'm1' });
  });

  it('skips frames that carry no envelope', async () => {
    const stream = new FakeReadableStream();
    const watcher = new SignalWatcher(makeClientWith('watchSignals', stream));

    const iter = watcher.signals();
    const pending = iter.next();
    stream.emitData({}); // no envelope — watcher should not yield
    stream.emitData({ envelope: { mode: '', messageType: 'Signal', messageId: 'm2' } });
    const first = await pending;
    expect(first.value).toMatchObject({ messageId: 'm2' });
  });

  it('nextSignal rejects when the stream ends empty', async () => {
    const stream = new FakeReadableStream();
    const watcher = new SignalWatcher(makeClientWith('watchSignals', stream));

    const pending = watcher.nextSignal();
    stream.emitEnd();
    await expect(pending).rejects.toThrow('stream ended before receiving a signal');
  });
});

describe('PolicyWatcher', () => {
  it('yields PolicyChange snapshots', async () => {
    const stream = new FakeReadableStream();
    const watcher = new PolicyWatcher(makeClientWith('watchPolicies', stream));

    const iter = watcher.changes();
    const pending = iter.next();
    stream.emitData({ descriptors: [{ policyId: 'p1' }], observedAtUnixMs: 5 });
    const first = await pending;
    expect(first.value).toMatchObject({ observedAtUnixMs: 5 });
    expect(first.value?.descriptors?.[0]?.policyId).toBe('p1');
  });

  it('wires the abort signal', async () => {
    const stream = new FakeReadableStream();
    const watcher = new PolicyWatcher(makeClientWith('watchPolicies', stream));
    const controller = new AbortController();

    const iter = watcher.changes(controller.signal);
    const pending = iter.next();
    controller.abort();
    expect(stream.cancel).toHaveBeenCalledTimes(1);

    stream.emitEnd();
    await pending;
  });
});
