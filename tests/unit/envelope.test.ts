import { describe, it, expect } from 'vitest';
import {
  buildEnvelope,
  buildSessionStartPayload,
  buildCommitmentPayload,
  encodeContext,
  newSessionId,
  newMessageId,
  newCommitmentId,
  inferOutcomePositive,
} from '../../src/envelope';
import { MACP_VERSION } from '../../src/constants';

describe('envelope builders', () => {
  describe('buildEnvelope', () => {
    it('sets default macpVersion, messageId, and timestamp', () => {
      const envelope = buildEnvelope({
        mode: 'macp.mode.decision.v1',
        messageType: 'Proposal',
        sessionId: 'sid',
        payload: Buffer.from('test'),
      });
      expect(envelope.macpVersion).toBe(MACP_VERSION);
      expect(envelope.messageId).toBeTruthy();
      expect(envelope.timestampUnixMs).toBeTruthy();
      expect(Number(envelope.timestampUnixMs)).toBeGreaterThan(0);
      expect(envelope.sender).toBe('');
    });

    it('preserves explicit values', () => {
      const envelope = buildEnvelope({
        mode: 'test',
        messageType: 'Msg',
        sessionId: 'sid',
        payload: Buffer.alloc(0),
        sender: 'me',
        messageId: 'custom-id',
        macpVersion: '2.0',
        timestampUnixMs: '12345',
      });
      expect(envelope.macpVersion).toBe('2.0');
      expect(envelope.messageId).toBe('custom-id');
      expect(envelope.sender).toBe('me');
      expect(envelope.timestampUnixMs).toBe('12345');
    });
  });

  describe('buildSessionStartPayload', () => {
    it('builds with required fields and defaults', () => {
      const payload = buildSessionStartPayload({
        intent: 'decide',
        participants: ['a', 'b'],
        ttlMs: 60000,
      });
      expect(payload.intent).toBe('decide');
      expect(payload.participants).toEqual(['a', 'b']);
      expect(payload.ttlMs).toBe(60000);
      expect(payload.modeVersion).toBe('1.0.0');
      expect(payload.configurationVersion).toBe('config.default');
      expect(payload.roots).toEqual([]);
    });

    it('accepts custom versions', () => {
      const payload = buildSessionStartPayload({
        intent: 'x',
        participants: ['a'],
        ttlMs: 1000,
        modeVersion: '2.0.0',
        configurationVersion: 'custom',
        policyVersion: 'policy.v2',
      });
      expect(payload.modeVersion).toBe('2.0.0');
      expect(payload.configurationVersion).toBe('custom');
      expect(payload.policyVersion).toBe('policy.v2');
    });
  });

  describe('buildCommitmentPayload', () => {
    it('builds with auto-generated commitmentId', () => {
      const payload = buildCommitmentPayload({
        action: 'deploy',
        authorityScope: 'ops',
        reason: 'approved',
      });
      expect(payload.commitmentId).toBeTruthy();
      expect(payload.action).toBe('deploy');
      expect(payload.authorityScope).toBe('ops');
      expect(payload.reason).toBe('approved');
    });

    it('preserves explicit commitmentId', () => {
      const payload = buildCommitmentPayload({
        action: 'x',
        authorityScope: 'y',
        reason: 'z',
        commitmentId: 'my-id',
      });
      expect(payload.commitmentId).toBe('my-id');
    });

    it('infers outcomePositive true for positive actions', () => {
      const payload = buildCommitmentPayload({
        action: 'proposal_accepted',
        authorityScope: 'session',
        reason: 'done',
      });
      expect(payload.outcomePositive).toBe(true);
    });

    it('infers outcomePositive false for negative actions', () => {
      for (const action of ['proposal_rejected', 'task_failed', 'handoff_declined']) {
        const payload = buildCommitmentPayload({
          action,
          authorityScope: 'session',
          reason: 'done',
        });
        expect(payload.outcomePositive).toBe(false);
      }
    });

    it('allows explicit outcomePositive override', () => {
      const payload = buildCommitmentPayload({
        action: 'proposal_rejected',
        authorityScope: 'session',
        reason: 'done',
        outcomePositive: true,
      });
      expect(payload.outcomePositive).toBe(true);
    });
  });

  describe('inferOutcomePositive', () => {
    it('returns false for negative suffixes', () => {
      expect(inferOutcomePositive('proposal_rejected')).toBe(false);
      expect(inferOutcomePositive('task_failed')).toBe(false);
      expect(inferOutcomePositive('handoff_declined')).toBe(false);
    });

    it('returns true for positive suffixes', () => {
      expect(inferOutcomePositive('proposal_selected')).toBe(true);
      expect(inferOutcomePositive('proposal_accepted')).toBe(true);
      expect(inferOutcomePositive('task_completed')).toBe(true);
      expect(inferOutcomePositive('request_approved')).toBe(true);
    });

    it('returns true for unknown action suffixes', () => {
      expect(inferOutcomePositive('custom_action')).toBe(true);
      expect(inferOutcomePositive('commit')).toBe(true);
    });
  });

  describe('encodeContext', () => {
    it('returns empty buffer for undefined', () => {
      expect(encodeContext(undefined).length).toBe(0);
    });

    it('passes through Buffer input', () => {
      const buf = Buffer.from('hello');
      expect(encodeContext(buf)).toBe(buf);
    });

    it('encodes string to UTF-8', () => {
      const result = encodeContext('hello');
      expect(result.toString('utf8')).toBe('hello');
    });

    it('encodes object to JSON', () => {
      const result = encodeContext({ key: 'value' });
      expect(JSON.parse(result.toString('utf8'))).toEqual({ key: 'value' });
    });
  });

  describe('ID generators', () => {
    it('newSessionId produces UUID format', () => {
      const id = newSessionId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('newMessageId produces UUID format', () => {
      expect(newMessageId()).toMatch(/^[0-9a-f]{8}-/);
    });

    it('newCommitmentId produces UUID format', () => {
      expect(newCommitmentId()).toMatch(/^[0-9a-f]{8}-/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newSessionId()));
      expect(ids.size).toBe(100);
    });
  });
});
