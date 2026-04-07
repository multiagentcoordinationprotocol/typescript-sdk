import { describe, it, expect } from 'vitest';
import {
  validateSessionId,
  validateVote,
  validateRecommendation,
  validateConfidence,
  validateSeverity,
  validateParticipantCount,
  validateSignalType,
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
});
