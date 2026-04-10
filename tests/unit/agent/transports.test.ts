import { describe, it, expect, vi } from 'vitest';
import { GrpcTransportAdapter, HttpTransportAdapter, type HttpPollingConfig } from '../../../src/agent/transports';
import type { Envelope } from '../../../src/types';
import { MODE_DECISION } from '../../../src/constants';

function makeEnvelope(overrides?: Partial<Envelope>): Envelope {
  return {
    macpVersion: '1.0',
    mode: MODE_DECISION,
    messageType: 'Proposal',
    messageId: 'msg-1',
    sessionId: 'session-1',
    sender: 'agent-a',
    timestampUnixMs: String(Date.now()),
    payload: Buffer.from(JSON.stringify({ proposalId: 'p1', option: 'deploy' })),
    ...overrides,
  };
}

describe('GrpcTransportAdapter', () => {
  it('yields messages from the stream filtered by sessionId', async () => {
    const envelope1 = makeEnvelope({ sessionId: 'session-1' });
    const envelope2 = makeEnvelope({ sessionId: 'session-2', messageId: 'msg-2' });
    const envelope3 = makeEnvelope({ sessionId: 'session-1', messageId: 'msg-3', messageType: 'Vote' });

    const mockStream = {
      responses: async function* () {
        yield envelope1;
        yield envelope2;
        yield envelope3;
      },
      close: vi.fn(),
    };

    const mockClient = {
      openStream: vi.fn().mockReturnValue(mockStream),
      protoRegistry: {
        decodeKnownPayload: vi.fn((mode: string, mt: string, payload: Buffer) => {
          try {
            return JSON.parse(payload.toString('utf8'));
          } catch {
            return {};
          }
        }),
      },
    } as any;

    const adapter = new GrpcTransportAdapter(mockClient, 'session-1');
    const messages = [];
    for await (const msg of adapter.start()) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].messageType).toBe('Proposal');
    expect(messages[0].sender).toBe('agent-a');
    expect(messages[0].seq).toBe(0);
    expect(messages[1].messageType).toBe('Vote');
    expect(messages[1].seq).toBe(1);
  });

  it('decodes payload using protoRegistry', async () => {
    const envelope = makeEnvelope();
    const decoded = { proposalId: 'p1', option: 'deploy' };

    const mockStream = {
      responses: async function* () {
        yield envelope;
      },
      close: vi.fn(),
    };

    const decodeKnown = vi.fn().mockReturnValue(decoded);
    const mockClient = {
      openStream: vi.fn().mockReturnValue(mockStream),
      protoRegistry: { decodeKnownPayload: decodeKnown },
    } as any;

    const adapter = new GrpcTransportAdapter(mockClient, 'session-1');
    const messages = [];
    for await (const msg of adapter.start()) {
      messages.push(msg);
    }

    expect(decodeKnown).toHaveBeenCalledWith(MODE_DECISION, 'Proposal', envelope.payload);
    expect(messages[0].payload).toEqual(decoded);
    expect(messages[0].proposalId).toBe('p1');
  });

  it('extracts proposalId from decoded payload', async () => {
    const envelope = makeEnvelope();
    const mockStream = {
      responses: async function* () {
        yield envelope;
      },
      close: vi.fn(),
    };

    const mockClient = {
      openStream: vi.fn().mockReturnValue(mockStream),
      protoRegistry: {
        decodeKnownPayload: vi.fn().mockReturnValue({ proposalId: 'p1' }),
      },
    } as any;

    const adapter = new GrpcTransportAdapter(mockClient, 'session-1');
    const messages = [];
    for await (const msg of adapter.start()) {
      messages.push(msg);
    }

    expect(messages[0].proposalId).toBe('p1');
  });

  it('preserves raw envelope on incoming message', async () => {
    const envelope = makeEnvelope();
    const mockStream = {
      responses: async function* () {
        yield envelope;
      },
      close: vi.fn(),
    };

    const mockClient = {
      openStream: vi.fn().mockReturnValue(mockStream),
      protoRegistry: { decodeKnownPayload: vi.fn().mockReturnValue({}) },
    } as any;

    const adapter = new GrpcTransportAdapter(mockClient, 'session-1');
    const messages = [];
    for await (const msg of adapter.start()) {
      messages.push(msg);
    }

    expect(messages[0].raw).toBe(envelope);
  });

  it('stop closes the stream', async () => {
    const mockStream = {
      responses: async function* (): AsyncGenerator<Envelope> {
        // no-op, empty stream
      },
      close: vi.fn(),
    };

    const mockClient = {
      openStream: vi.fn().mockReturnValue(mockStream),
      protoRegistry: { decodeKnownPayload: vi.fn().mockReturnValue({}) },
    } as any;

    const adapter = new GrpcTransportAdapter(mockClient, 'session-1');
    // Consume the stream
    for await (const _ of adapter.start()) {
      // empty
    }
    await adapter.stop();
    expect(mockStream.close).toHaveBeenCalled();
  });
});

describe('HttpTransportAdapter', () => {
  it('yields messages from HTTP polling', async () => {
    const events = [
      {
        envelope: makeEnvelope({ messageType: 'Proposal' }),
        seq: 0,
      },
      {
        envelope: makeEnvelope({ messageType: 'Vote', messageId: 'msg-2' }),
        seq: 1,
      },
    ];

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({ events }),
        };
      }
      // Second call: return empty to let the adapter stop
      return {
        ok: true,
        json: async () => ({ events: [] }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const config: HttpPollingConfig = {
      baseUrl: 'http://localhost:3000',
      sessionId: 'session-1',
      participantId: 'agent-1',
      pollIntervalMs: 10,
      authToken: 'test-token',
    };

    const adapter = new HttpTransportAdapter(config);
    const messages = [];

    for await (const msg of adapter.start()) {
      messages.push(msg);
      if (messages.length >= 2) {
        await adapter.stop();
        break;
      }
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].messageType).toBe('Proposal');
    expect(messages[1].messageType).toBe('Vote');

    // Verify auth header was sent
    expect(mockFetch).toHaveBeenCalled();
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toContain('http://localhost:3000/sessions/session-1/events');
    expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-token');

    vi.unstubAllGlobals();
  });

  it('handles failed HTTP responses gracefully', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        json: async () => ({
          events: [{ envelope: makeEnvelope(), seq: 0 }],
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const config: HttpPollingConfig = {
      baseUrl: 'http://localhost:3000',
      sessionId: 'session-1',
      participantId: 'agent-1',
      pollIntervalMs: 10,
    };

    const adapter = new HttpTransportAdapter(config);
    const messages = [];

    for await (const msg of adapter.start()) {
      messages.push(msg);
      if (messages.length >= 1) {
        await adapter.stop();
        break;
      }
    }

    // Should have recovered from the error and yielded a message
    expect(messages).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('handles fetch exceptions gracefully', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error');
      }
      return {
        ok: true,
        json: async () => ({
          events: [{ envelope: makeEnvelope(), seq: 0 }],
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const config: HttpPollingConfig = {
      baseUrl: 'http://localhost:3000',
      sessionId: 'session-1',
      participantId: 'agent-1',
      pollIntervalMs: 10,
    };

    const adapter = new HttpTransportAdapter(config);
    const messages = [];

    for await (const msg of adapter.start()) {
      messages.push(msg);
      if (messages.length >= 1) {
        await adapter.stop();
        break;
      }
    }

    expect(messages).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('tracks lastSeq for incremental polling', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            events: [{ envelope: makeEnvelope(), seq: 5 }],
          }),
        };
      }
      // Second call: return another event so the loop yields and we can break
      return {
        ok: true,
        json: async () => ({
          events: [{ envelope: makeEnvelope({ messageId: 'msg-2' }), seq: 6 }],
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const config: HttpPollingConfig = {
      baseUrl: 'http://localhost:3000',
      sessionId: 'session-1',
      participantId: 'agent-1',
      pollIntervalMs: 10,
    };

    const adapter = new HttpTransportAdapter(config);
    const messages = [];

    for await (const msg of adapter.start()) {
      messages.push(msg);
      if (messages.length >= 2) {
        await adapter.stop();
        break;
      }
    }

    // Second fetch call should include after=5 (the seq from the first batch)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockFetch.mock.calls[1][0]).toContain('after=5');

    vi.unstubAllGlobals();
  });

  it('does not send auth header when no authToken', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        events: [{ envelope: makeEnvelope(), seq: 0 }],
      }),
    }));

    vi.stubGlobal('fetch', mockFetch);

    const config: HttpPollingConfig = {
      baseUrl: 'http://localhost:3000',
      sessionId: 'session-1',
      participantId: 'agent-1',
      pollIntervalMs: 10,
    };

    const adapter = new HttpTransportAdapter(config);
    for await (const msg of adapter.start()) {
      await adapter.stop();
      break;
    }

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers['Authorization']).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
