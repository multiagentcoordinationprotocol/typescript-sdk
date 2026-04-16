import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../src/auth';
import { MacpClient } from '../../src/client';
import { DecisionSession } from '../../src/decision';
import { HandoffSession } from '../../src/handoff';
import { ProposalSession } from '../../src/proposal';
import { QuorumSession } from '../../src/quorum';
import { TaskSession } from '../../src/task';
import { MacpIdentityMismatchError, MacpSdkError } from '../../src/errors';

/**
 * Build a real MacpClient without any wire activity. Constructor binds a gRPC
 * channel lazily so we can instantiate safely; every test that emits envelopes
 * stubs `client.send` so nothing leaves the process.
 */
function makeClient(): MacpClient {
  return new MacpClient({
    address: '127.0.0.1:50051',
    secure: false,
    allowInsecure: true,
    auth: Auth.bearer('alice-token', { expectedSender: 'alice' }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MacpClient constructor — TLS guard', () => {
  it('defaults to secure: true and accepts no further flags', () => {
    // No throw on construction; actual TLS handshake is lazy.
    expect(() => new MacpClient({ address: '127.0.0.1:50051' })).not.toThrow();
  });

  it('throws when secure: false is passed without allowInsecure', () => {
    expect(
      () =>
        new MacpClient({
          address: '127.0.0.1:50051',
          secure: false,
        }),
    ).toThrow(MacpSdkError);

    expect(
      () =>
        new MacpClient({
          address: '127.0.0.1:50051',
          secure: false,
        }),
    ).toThrow(/allowInsecure/);
  });

  it('throws when secure: false is paired with allowInsecure: false', () => {
    expect(
      () =>
        new MacpClient({
          address: '127.0.0.1:50051',
          secure: false,
          allowInsecure: false,
        }),
    ).toThrow(MacpSdkError);
  });

  it('allows secure: false when allowInsecure: true', () => {
    expect(
      () =>
        new MacpClient({
          address: '127.0.0.1:50051',
          secure: false,
          allowInsecure: true,
        }),
    ).not.toThrow();
  });

  it('ignores allowInsecure when secure: true (TLS wins)', () => {
    expect(
      () =>
        new MacpClient({
          address: '127.0.0.1:50051',
          secure: true,
          allowInsecure: true,
        }),
    ).not.toThrow();
  });
});

// ── Identity guard on mode helpers ──────────────────────────────────
//
// TS-2: every mode helper must refuse to emit an envelope whose `sender`
// disagrees with auth.expectedSender. Covered here once per mode — the
// `senderFor` helper is shared so this exercises all action methods.

describe('Identity guard — mode helpers', () => {
  it('DecisionSession.propose throws when sender conflicts with expectedSender', async () => {
    const client = makeClient();
    const session = new DecisionSession(client);
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(session.propose({ proposalId: 'p1', option: 'x', sender: 'mallory' })).rejects.toBeInstanceOf(
      MacpIdentityMismatchError,
    );
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('DecisionSession allows sender equal to expectedSender', async () => {
    const client = makeClient();
    const session = new DecisionSession(client);
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    const ack = await session.propose({ proposalId: 'p1', option: 'x', sender: 'alice' });
    expect(ack.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('DecisionSession auto-fills sender from expectedSender when caller omits it', async () => {
    const client = makeClient();
    const session = new DecisionSession(client);
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await session.propose({ proposalId: 'p1', option: 'x' });
    const envelope = sendSpy.mock.calls[0][0];
    expect(envelope.sender).toBe('alice');
  });

  it('ProposalSession.propose enforces the guard', async () => {
    const client = makeClient();
    const session = new ProposalSession(client);
    vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(session.propose({ proposalId: 'p1', title: 't', sender: 'mallory' })).rejects.toBeInstanceOf(
      MacpIdentityMismatchError,
    );
  });

  it('TaskSession.request enforces the guard', async () => {
    const client = makeClient();
    const session = new TaskSession(client);
    vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(
      session.request({
        taskId: 't1',
        title: 'Review',
        instructions: 'something',
        assignee: 'bob',
        sender: 'mallory',
      }),
    ).rejects.toBeInstanceOf(MacpIdentityMismatchError);
  });

  it('HandoffSession.offer enforces the guard', async () => {
    const client = makeClient();
    const session = new HandoffSession(client);
    vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(
      session.offer({ handoffId: 'h1', targetParticipant: 'bob', sender: 'mallory' }),
    ).rejects.toBeInstanceOf(MacpIdentityMismatchError);
  });

  it('QuorumSession.requestApproval enforces the guard', async () => {
    const client = makeClient();
    const session = new QuorumSession(client);
    vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(
      session.requestApproval({
        requestId: 'r1',
        action: 'deploy',
        summary: 'ship it',
        requiredApprovals: 1,
        sender: 'mallory',
      }),
    ).rejects.toBeInstanceOf(MacpIdentityMismatchError);
  });

  it('guard is silent for legacy Auth.bearer(token, senderHintString)', async () => {
    const client = new MacpClient({
      address: '127.0.0.1:50051',
      secure: false,
      allowInsecure: true,
      auth: Auth.bearer('token', 'alice'),
    });
    const session = new DecisionSession(client);
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    const ack = await session.propose({ proposalId: 'p1', option: 'x', sender: 'anyone' });
    expect(ack.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('guard is silent for Auth.devAgent', async () => {
    const client = new MacpClient({
      address: '127.0.0.1:50051',
      secure: false,
      allowInsecure: true,
      auth: Auth.devAgent('alice'),
    });
    const session = new DecisionSession(client);
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    const ack = await session.propose({ proposalId: 'p1', option: 'x', sender: 'bob' });
    expect(ack.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

// ── client.sendSignal / sendProgress ────────────────────────────────

describe('client.sendSignal / sendProgress identity guard', () => {
  it('client.sendSignal throws when sender conflicts with expectedSender', async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(client.sendSignal({ signalType: 'heartbeat', sender: 'mallory' })).rejects.toBeInstanceOf(
      MacpIdentityMismatchError,
    );
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('client.sendProgress throws when sender conflicts with expectedSender', async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true });

    await expect(
      client.sendProgress({
        progressToken: 'tok',
        progress: 1,
        total: 2,
        sender: 'mallory',
      }),
    ).rejects.toBeInstanceOf(MacpIdentityMismatchError);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

// ── newSessionId export ─────────────────────────────────────────────
//
// TS-3: `newSessionId` must be reachable from the top-level entry point so
// callers can pre-allocate sessionIds before handing them to an initiator.

describe('newSessionId public export', () => {
  it('is re-exported from the top-level index', async () => {
    const mod = await import('../../src/index');
    expect(typeof mod.newSessionId).toBe('function');
    const id = mod.newSessionId();
    // UUID v4 shape — matches runtime validator in runtime/src/session.rs.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns distinct ids across calls', async () => {
    const mod = await import('../../src/index');
    const a = mod.newSessionId();
    const b = mod.newSessionId();
    expect(a).not.toBe(b);
  });
});
