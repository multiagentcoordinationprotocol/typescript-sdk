import { describe, it, expect } from 'vitest';
import { Auth, validateAuth, authSender, metadataFromAuth } from '../../src/auth';

describe('Auth', () => {
  describe('Auth.devAgent', () => {
    it('creates config with agentId and senderHint', () => {
      const config = Auth.devAgent('alice');
      expect(config.agentId).toBe('alice');
      expect(config.senderHint).toBe('alice');
      expect(config.bearerToken).toBeUndefined();
    });
  });

  describe('Auth.bearer', () => {
    it('creates config with bearerToken', () => {
      const config = Auth.bearer('tok123');
      expect(config.bearerToken).toBe('tok123');
      expect(config.agentId).toBeUndefined();
    });

    it('accepts senderHint', () => {
      const config = Auth.bearer('tok123', 'alice');
      expect(config.senderHint).toBe('alice');
    });
  });

  describe('validateAuth', () => {
    it('throws when neither token nor agentId', () => {
      expect(() => validateAuth({})).toThrow('either bearerToken or agentId is required');
    });

    it('throws when both token and agentId', () => {
      expect(() => validateAuth({ bearerToken: 'tok', agentId: 'id' })).toThrow('choose either');
    });

    it('passes for valid bearer', () => {
      expect(() => validateAuth({ bearerToken: 'tok' })).not.toThrow();
    });

    it('passes for valid agentId', () => {
      expect(() => validateAuth({ agentId: 'id' })).not.toThrow();
    });
  });

  describe('authSender', () => {
    it('returns senderHint when set', () => {
      expect(authSender({ senderHint: 'alice', bearerToken: 'tok' })).toBe('alice');
    });

    it('falls back to agentId', () => {
      expect(authSender({ agentId: 'bob' })).toBe('bob');
    });

    it('returns undefined when no auth', () => {
      expect(authSender(undefined)).toBeUndefined();
    });
  });

  describe('metadataFromAuth', () => {
    it('sets authorization header for bearer', () => {
      const metadata = metadataFromAuth({ bearerToken: 'tok123' });
      expect(metadata.get('authorization')).toEqual(['Bearer tok123']);
    });

    it('sets x-macp-agent-id header for dev agent', () => {
      const metadata = metadataFromAuth({ agentId: 'alice' });
      expect(metadata.get('x-macp-agent-id')).toEqual(['alice']);
    });
  });
});
