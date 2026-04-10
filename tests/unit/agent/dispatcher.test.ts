import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Dispatcher } from '../../../src/agent/dispatcher';
import type { HandlerContext, IncomingMessage, TerminalResult } from '../../../src/agent/types';

function makeMessage(messageType: string, overrides?: Partial<IncomingMessage>): IncomingMessage {
  return {
    messageType,
    sender: 'agent-a',
    payload: {},
    raw: {
      macpVersion: '1.0',
      mode: 'macp.mode.decision.v1',
      messageType,
      messageId: 'msg-1',
      sessionId: 'session-1',
      sender: 'agent-a',
      timestampUnixMs: String(Date.now()),
      payload: Buffer.alloc(0),
    },
    seq: 0,
    ...overrides,
  };
}

function makeContext(): HandlerContext {
  return {
    participant: { participantId: 'me', sessionId: 'session-1', mode: 'macp.mode.decision.v1' },
    projection: { phase: 'Proposal', transcript: [] },
    actions: {},
    session: { sessionId: 'session-1', mode: 'macp.mode.decision.v1', participants: ['me', 'agent-a'] },
    log: vi.fn(),
  };
}

describe('Dispatcher', () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
  });

  describe('message dispatch', () => {
    it('dispatches to registered handler for message type', async () => {
      const handler = vi.fn();
      dispatcher.on('Proposal', handler);

      const msg = makeMessage('Proposal');
      await dispatcher.dispatch(msg, makeContext());

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(msg, expect.any(Object));
    });

    it('does not dispatch to unrelated handler', async () => {
      const handler = vi.fn();
      dispatcher.on('Vote', handler);

      await dispatcher.dispatch(makeMessage('Proposal'), makeContext());

      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches to multiple handlers for same type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      dispatcher.on('Proposal', handler1);
      dispatcher.on('Proposal', handler2);

      await dispatcher.dispatch(makeMessage('Proposal'), makeContext());

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('dispatches wildcard handlers for all message types', async () => {
      const handler = vi.fn();
      dispatcher.on('*', handler);

      await dispatcher.dispatch(makeMessage('Proposal'), makeContext());
      await dispatcher.dispatch(makeMessage('Vote'), makeContext());

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('dispatches both specific and wildcard handlers', async () => {
      const specific = vi.fn();
      const wildcard = vi.fn();
      dispatcher.on('Proposal', specific);
      dispatcher.on('*', wildcard);

      await dispatcher.dispatch(makeMessage('Proposal'), makeContext());

      expect(specific).toHaveBeenCalledOnce();
      expect(wildcard).toHaveBeenCalledOnce();
    });

    it('handles async handlers', async () => {
      const results: string[] = [];
      dispatcher.on('Proposal', async () => {
        await new Promise((r) => setTimeout(r, 1));
        results.push('first');
      });
      dispatcher.on('Proposal', async () => {
        results.push('second');
      });

      await dispatcher.dispatch(makeMessage('Proposal'), makeContext());

      expect(results).toEqual(['first', 'second']);
    });
  });

  describe('phase change dispatch', () => {
    it('dispatches to registered phase handler', async () => {
      const handler = vi.fn();
      dispatcher.onPhaseChange('Voting', handler);

      await dispatcher.dispatchPhaseChange('Voting', makeContext());

      expect(handler).toHaveBeenCalledWith('Voting', expect.any(Object));
    });

    it('does not dispatch to unrelated phase handler', async () => {
      const handler = vi.fn();
      dispatcher.onPhaseChange('Committed', handler);

      await dispatcher.dispatchPhaseChange('Voting', makeContext());

      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches wildcard phase handlers', async () => {
      const handler = vi.fn();
      dispatcher.onPhaseChange('*', handler);

      await dispatcher.dispatchPhaseChange('Voting', makeContext());
      await dispatcher.dispatchPhaseChange('Committed', makeContext());

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('terminal dispatch', () => {
    it('dispatches terminal result', async () => {
      const handler = vi.fn();
      dispatcher.onTerminal(handler);

      const result: TerminalResult = { state: 'Committed', commitment: { action: 'deploy' } };
      await dispatcher.dispatchTerminal(result);

      expect(handler).toHaveBeenCalledWith(result);
    });

    it('replaces previous terminal handler', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      dispatcher.onTerminal(handler1);
      dispatcher.onTerminal(handler2);

      await dispatcher.dispatchTerminal({ state: 'Committed' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('does nothing when no terminal handler set', async () => {
      // Should not throw
      await dispatcher.dispatchTerminal({ state: 'Committed' });
    });
  });

  describe('hasHandlersFor', () => {
    it('returns false when no handlers registered', () => {
      expect(dispatcher.hasHandlersFor('Proposal')).toBe(false);
    });

    it('returns true when specific handler registered', () => {
      dispatcher.on('Proposal', vi.fn());
      expect(dispatcher.hasHandlersFor('Proposal')).toBe(true);
    });

    it('returns true when wildcard handler registered', () => {
      dispatcher.on('*', vi.fn());
      expect(dispatcher.hasHandlersFor('AnyType')).toBe(true);
    });
  });

  describe('hasTerminalHandler', () => {
    it('returns false by default', () => {
      expect(dispatcher.hasTerminalHandler()).toBe(false);
    });

    it('returns true after setting terminal handler', () => {
      dispatcher.onTerminal(vi.fn());
      expect(dispatcher.hasTerminalHandler()).toBe(true);
    });
  });
});
