import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startCancelCallbackServer, type CancelCallbackServer } from '../../../src/agent/cancel-callback';

async function post(
  url: string,
  body: Record<string, unknown> | string | undefined,
): Promise<{ status: number; text: string }> {
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  return { status: res.status, text: await res.text() };
}

describe('startCancelCallbackServer', () => {
  let server: CancelCallbackServer | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  it('invokes onCancel with runId and reason', async () => {
    let received: [string, string] | null = null;
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: (runId, reason) => {
        received = [runId, reason];
      },
    });
    const url = `http://${server.host}:${server.port}${server.path}`;
    const res = await post(url, { runId: 'run-7', reason: 'timeout' });
    expect(res.status).toBe(202);
    expect(received).toEqual(['run-7', 'timeout']);
  });

  it('accepts run_id (snake_case) as an alias', async () => {
    let received: [string, string] | null = null;
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: (runId, reason) => {
        received = [runId, reason];
      },
    });
    const url = `http://${server.host}:${server.port}${server.path}`;
    await post(url, { run_id: 'r42', reason: 'user-stop' });
    expect(received).toEqual(['r42', 'user-stop']);
  });

  it('returns 404 on path mismatch', async () => {
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: () => {},
    });
    const url = `http://${server.host}:${server.port}/other`;
    const res = await post(url, {});
    expect(res.status).toBe(404);
  });

  it('returns 500 when the handler throws', async () => {
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: () => {
        throw new Error('kaboom');
      },
    });
    const url = `http://${server.host}:${server.port}${server.path}`;
    const res = await post(url, { runId: 'r', reason: '' });
    expect(res.status).toBe(500);
  });

  it('treats malformed JSON as empty body (empty strings forwarded)', async () => {
    let received: [string, string] | null = null;
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: (runId, reason) => {
        received = [runId, reason];
      },
    });
    const url = `http://${server.host}:${server.port}${server.path}`;
    const res = await post(url, 'not json');
    expect(res.status).toBe(202);
    expect(received).toEqual(['', '']);
  });

  it('normalises a path without a leading slash', async () => {
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: 'cancel',
      onCancel: () => {},
    });
    expect(server.path).toBe('/cancel');
    const res = await post(`http://${server.host}:${server.port}/cancel`, {});
    expect(res.status).toBe(202);
  });

  it('close() is idempotent', async () => {
    server = await startCancelCallbackServer({
      host: '127.0.0.1',
      port: 0,
      path: '/cancel',
      onCancel: () => {},
    });
    await server.close();
    await expect(server.close()).resolves.toBeUndefined();
    server = undefined; // already closed
  });
});
