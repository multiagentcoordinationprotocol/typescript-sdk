import { describe, it, expect } from 'vitest';
import {
  validateSessionId,
  validateVote,
  validateRecommendation,
  validateConfidence,
  validateSeverity,
  validateParticipantCount,
  validateSignalType,
  validateTtlMs,
  validateParticipants,
  validateRequiredField,
  validateSessionStart,
} from '../../src/validation';
import { MacpSessionError } from '../../src/errors';

describe('validation', () => {
  describe('validateSessionId', () => {
    it('accepts UUID v4', () => {
      expect(() => validateSessionId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('accepts base64url (22+ chars)', () => {
      expect(() => validateSessionId('abcdefghij1234567890_-')).not.toThrow();
      expect(() => validateSessionId('abcdefghij1234567890_-extra')).not.toThrow();
    });

    it('rejects short strings', () => {
      expect(() => validateSessionId('short')).toThrow(MacpSessionError);
    });

    it('rejects invalid UUID format', () => {
      expect(() => validateSessionId('not-a-uuid-at-all-xx')).toThrow(MacpSessionError);
    });

    it('rejects empty string', () => {
      expect(() => validateSessionId('')).toThrow(MacpSessionError);
    });
  });

  describe('validateVote', () => {
    it('accepts valid votes and normalizes to uppercase', () => {
      expect(validateVote('approve')).toBe('APPROVE');
      expect(validateVote('REJECT')).toBe('REJECT');
      expect(validateVote('Abstain')).toBe('ABSTAIN');
    });

    it('rejects invalid vote values', () => {
      expect(() => validateVote('yes')).toThrow(MacpSessionError);
      expect(() => validateVote('maybe')).toThrow(MacpSessionError);
    });
  });

  describe('validateRecommendation', () => {
    it('accepts valid recommendations and normalizes', () => {
      expect(validateRecommendation('approve')).toBe('APPROVE');
      expect(validateRecommendation('REVIEW')).toBe('REVIEW');
      expect(validateRecommendation('block')).toBe('BLOCK');
      expect(validateRecommendation('Reject')).toBe('REJECT');
    });

    it('rejects invalid recommendations', () => {
      expect(() => validateRecommendation('accept')).toThrow(MacpSessionError);
      expect(() => validateRecommendation('deny')).toThrow(MacpSessionError);
    });
  });

  describe('validateConfidence', () => {
    it('accepts values in [0.0, 1.0]', () => {
      expect(() => validateConfidence(0)).not.toThrow();
      expect(() => validateConfidence(0.5)).not.toThrow();
      expect(() => validateConfidence(1.0)).not.toThrow();
    });

    it('rejects values outside range', () => {
      expect(() => validateConfidence(-0.1)).toThrow(MacpSessionError);
      expect(() => validateConfidence(1.1)).toThrow(MacpSessionError);
    });
  });

  describe('validateSeverity', () => {
    it('accepts valid severities and normalizes to lowercase', () => {
      expect(validateSeverity('Critical')).toBe('critical');
      expect(validateSeverity('HIGH')).toBe('high');
      expect(validateSeverity('medium')).toBe('medium');
      expect(validateSeverity('Low')).toBe('low');
    });

    it('rejects invalid severities', () => {
      expect(() => validateSeverity('block')).toThrow(MacpSessionError);
      expect(() => validateSeverity('urgent')).toThrow(MacpSessionError);
    });
  });

  describe('validateParticipantCount', () => {
    it('accepts counts up to 1000', () => {
      expect(() => validateParticipantCount(1)).not.toThrow();
      expect(() => validateParticipantCount(1000)).not.toThrow();
    });

    it('rejects counts over 1000', () => {
      expect(() => validateParticipantCount(1001)).toThrow(MacpSessionError);
    });
  });

  describe('validateSignalType', () => {
    it('allows empty signalType when no data', () => {
      expect(() => validateSignalType('', undefined)).not.toThrow();
      expect(() => validateSignalType('', Buffer.alloc(0))).not.toThrow();
    });

    it('allows non-empty signalType with data', () => {
      expect(() => validateSignalType('heartbeat', Buffer.from('data'))).not.toThrow();
    });

    it('rejects empty signalType when data is present', () => {
      expect(() => validateSignalType('', Buffer.from('data'))).toThrow(MacpSessionError);
      expect(() => validateSignalType('  ', Buffer.from('data'))).toThrow(MacpSessionError);
    });
  });

  describe('validateTtlMs', () => {
    it('accepts valid TTL values', () => {
      expect(() => validateTtlMs(1)).not.toThrow();
      expect(() => validateTtlMs(60_000)).not.toThrow();
      expect(() => validateTtlMs(86_400_000)).not.toThrow();
    });

    it('rejects zero', () => {
      expect(() => validateTtlMs(0)).toThrow(MacpSessionError);
    });

    it('rejects negative values', () => {
      expect(() => validateTtlMs(-1)).toThrow(MacpSessionError);
    });

    it('rejects values exceeding 24 hours', () => {
      expect(() => validateTtlMs(86_400_001)).toThrow(MacpSessionError);
    });

    it('rejects non-finite values', () => {
      expect(() => validateTtlMs(Infinity)).toThrow(MacpSessionError);
      expect(() => validateTtlMs(NaN)).toThrow(MacpSessionError);
    });
  });

  describe('validateParticipants', () => {
    it('accepts non-empty unique lists', () => {
      expect(() => validateParticipants(['agent://a'])).not.toThrow();
      expect(() => validateParticipants(['agent://a', 'agent://b'])).not.toThrow();
    });

    it('rejects empty list', () => {
      expect(() => validateParticipants([])).toThrow(MacpSessionError);
    });

    it('rejects duplicate participants', () => {
      expect(() => validateParticipants(['agent://a', 'agent://a'])).toThrow(MacpSessionError);
    });
  });

  describe('validateRequiredField', () => {
    it('accepts non-empty strings', () => {
      expect(() => validateRequiredField('field', 'value')).not.toThrow();
    });

    it('rejects empty strings', () => {
      expect(() => validateRequiredField('field', '')).toThrow(MacpSessionError);
    });

    it('rejects whitespace-only strings', () => {
      expect(() => validateRequiredField('field', '   ')).toThrow(MacpSessionError);
    });
  });

  describe('validateSessionStart', () => {
    const validInput = {
      intent: 'test intent',
      participants: ['agent://a', 'agent://b'],
      ttlMs: 60_000,
      modeVersion: '1.0.0',
      configurationVersion: 'config.default',
    };

    it('accepts valid input', () => {
      expect(() => validateSessionStart(validInput)).not.toThrow();
    });

    it('rejects empty intent', () => {
      expect(() => validateSessionStart({ ...validInput, intent: '' })).toThrow(MacpSessionError);
    });

    it('rejects empty participants', () => {
      expect(() => validateSessionStart({ ...validInput, participants: [] })).toThrow(MacpSessionError);
    });

    it('rejects invalid TTL', () => {
      expect(() => validateSessionStart({ ...validInput, ttlMs: 0 })).toThrow(MacpSessionError);
    });

    it('rejects empty modeVersion', () => {
      expect(() => validateSessionStart({ ...validInput, modeVersion: '' })).toThrow(MacpSessionError);
    });

    it('rejects empty configurationVersion', () => {
      expect(() => validateSessionStart({ ...validInput, configurationVersion: '' })).toThrow(MacpSessionError);
    });
  });
});
