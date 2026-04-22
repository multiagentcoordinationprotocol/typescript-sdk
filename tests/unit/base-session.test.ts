import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../src/auth';
import { BaseSession } from '../../src/base-session';
import { MacpClient } from '../../src/client';
import { BaseProjection } from '../../src/projections/base';
import type { ProtoRegistry } from '../../src/proto-registry';
import type { Envelope } from '../../src/types';

const EXT_MODE = 'ext.smoke.v1';

class SmokeProjection extends BaseProjection {
  protected readonly mode = EXT_MODE;
  readonly events: string[] = [];

  protected applyMode(envelope: Envelope, _registry: ProtoRegistry): void {
    this.events.push(envelope.messageType);
  }
}

class SmokeSession extends BaseSession<SmokeProjection> {
  protected readonly mode = EXT_MODE;

  protected createProjection(): SmokeProjection {
    return new SmokeProjection();
  }
}

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

describe('BaseSession / BaseProjection extension point', () => {
  it('fills defaults and wires the subclass projection', () => {
    const session = new SmokeSession(makeClient());
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.modeVersion).toBe('1.0.0');
    expect(session.policyVersion).toBe('policy.default');
    expect(session.projection).toBeInstanceOf(SmokeProjection);
    expect(session.projection.isCommitted).toBe(false);
  });

  it('start() calls client.send with a SessionStart envelope in the custom mode', async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({ ok: true, messageId: 'm1', sessionId: 'sid' });
    const session = new SmokeSession(client, { sessionId: '550e8400-e29b-41d4-a716-446655440000' });

    const ack = await session.start({
      intent: 'test',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
    });

    expect(ack.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledOnce();
    const [envelope] = sendSpy.mock.calls[0];
    expect((envelope as Envelope).mode).toBe(EXT_MODE);
    expect((envelope as Envelope).messageType).toBe('SessionStart');
    expect((envelope as Envelope).sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('commit() does not feed the projection when the runtime NACKs', async () => {
    const client = makeClient();
    vi.spyOn(client, 'send').mockResolvedValue({
      ok: false,
      error: { code: 'POLICY_DENIED', message: 'no' },
    });
    const session = new SmokeSession(client);
    const ack = await session.commit({ action: 'done', authorityScope: 'session', reason: 'smoke' });
    expect(ack.ok).toBe(false);
    expect(session.projection.isCommitted).toBe(false);
  });

  it('senderFor() enforces the auth.expectedSender guard', () => {
    const client = makeClient();
    const session = new SmokeSession(client);
    // Accessing the protected method via subclass in a one-off
    const leak = session as unknown as { senderFor: (s: string | undefined) => string };
    expect(() => leak.senderFor('mallory')).toThrow(/does not match/);
  });

  it('BaseProjection ignores envelopes from other modes (transcript untouched)', () => {
    const registry = new (class {
      decodeKnownPayload() {
        return {};
      }
    })() as unknown as ProtoRegistry;
    const projection = new SmokeProjection();
    projection.applyEnvelope(
      {
        macpVersion: '1.0',
        mode: 'macp.mode.decision.v1', // not EXT_MODE
        messageType: 'Proposal',
        messageId: 'm',
        sessionId: 's',
        sender: 'alice',
        timestampUnixMs: '1',
        payload: Buffer.alloc(0),
      },
      registry,
    );
    expect(projection.transcript).toHaveLength(0);
    expect(projection.events).toHaveLength(0);
  });
});
