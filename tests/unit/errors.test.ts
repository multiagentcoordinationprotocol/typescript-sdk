import { describe, it, expect } from 'vitest';
import { MacpSdkError, MacpTransportError, MacpAckError } from '../../src/errors';

describe('Error classes', () => {
  it('MacpSdkError is base class', () => {
    const err = new MacpSdkError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MacpSdkError');
    expect(err.message).toBe('test');
  });

  it('MacpTransportError extends MacpSdkError', () => {
    const err = new MacpTransportError('transport fail');
    expect(err).toBeInstanceOf(MacpSdkError);
    expect(err.name).toBe('MacpTransportError');
  });

  it('MacpAckError formats message from ack', () => {
    const err = new MacpAckError({
      ok: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'no such session' },
    });
    expect(err).toBeInstanceOf(MacpSdkError);
    expect(err.name).toBe('MacpAckError');
    expect(err.message).toContain('SESSION_NOT_FOUND');
    expect(err.message).toContain('no such session');
    expect(err.ack.ok).toBe(false);
  });

  it('MacpAckError handles missing error fields', () => {
    const err = new MacpAckError({ ok: false });
    expect(err.message).toContain('UNKNOWN');
    expect(err.message).toContain('runtime returned nack');
  });
});
