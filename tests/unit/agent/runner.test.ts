import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fromBootstrap, type BootstrapPayload } from '../../../src/agent/runner';
import { MODE_DECISION, MODE_TASK } from '../../../src/constants';

function validPayload(overrides?: Partial<BootstrapPayload>): BootstrapPayload {
  return {
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    participant_id: 'agent-1',
    mode: MODE_DECISION,
    runtime_address: 'localhost:50051',
    ...overrides,
  };
}

function writeTempBootstrap(payload: BootstrapPayload): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macp-runner-test-'));
  const filePath = path.join(dir, 'bootstrap.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  return filePath;
}

describe('fromBootstrap', () => {
  const originalEnv = process.env.MACP_BOOTSTRAP_FILE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MACP_BOOTSTRAP_FILE = originalEnv;
    } else {
      delete process.env.MACP_BOOTSTRAP_FILE;
    }
  });

  describe('valid bootstrap', () => {
    it('creates a Participant from a valid bootstrap file', () => {
      const filePath = writeTempBootstrap(validPayload());
      const participant = fromBootstrap(filePath);

      expect(participant.participantId).toBe('agent-1');
      expect(participant.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(participant.mode).toBe(MODE_DECISION);
    });

    it('supports all optional fields', () => {
      const filePath = writeTempBootstrap(
        validPayload({
          mode: MODE_TASK,
          mode_version: '2.0.0',
          configuration_version: 'config.v2',
          policy_version: 'policy.strict',
        }),
      );
      const participant = fromBootstrap(filePath);

      expect(participant.mode).toBe(MODE_TASK);
    });

    it('uses bearer auth when auth_token is provided', () => {
      const filePath = writeTempBootstrap(
        validPayload({
          auth_token: 'secret-token',
        }),
      );
      const participant = fromBootstrap(filePath);

      expect(participant.auth).toBeDefined();
      expect(participant.auth!.bearerToken).toBe('secret-token');
      expect(participant.auth!.senderHint).toBe('agent-1');
    });

    it('uses dev agent auth when no auth_token', () => {
      const filePath = writeTempBootstrap(validPayload());
      const participant = fromBootstrap(filePath);

      expect(participant.auth).toBeDefined();
      expect(participant.auth!.agentId).toBe('agent-1');
    });

    it('uses agent_id for dev auth when provided', () => {
      const filePath = writeTempBootstrap(
        validPayload({
          agent_id: 'custom-agent-id',
        }),
      );
      const participant = fromBootstrap(filePath);

      expect(participant.auth).toBeDefined();
      expect(participant.auth!.agentId).toBe('custom-agent-id');
    });
  });

  describe('MACP_BOOTSTRAP_FILE env var', () => {
    it('reads from env var when no path argument', () => {
      const filePath = writeTempBootstrap(validPayload({ participant_id: 'env-agent' }));
      process.env.MACP_BOOTSTRAP_FILE = filePath;

      const participant = fromBootstrap();
      expect(participant.participantId).toBe('env-agent');
    });

    it('throws when no path and no env var', () => {
      delete process.env.MACP_BOOTSTRAP_FILE;

      expect(() => fromBootstrap()).toThrow('No bootstrap path provided');
    });
  });

  describe('missing required fields', () => {
    it('throws when session_id is missing', () => {
      const payload = validPayload();
      delete (payload as any).session_id;
      payload.session_id = '';
      const filePath = writeTempBootstrap(payload);

      expect(() => fromBootstrap(filePath)).toThrow('session_id');
    });

    it('throws when participant_id is missing', () => {
      const payload = validPayload();
      delete (payload as any).participant_id;
      payload.participant_id = '';
      const filePath = writeTempBootstrap(payload);

      expect(() => fromBootstrap(filePath)).toThrow('participant_id');
    });

    it('throws when mode is missing', () => {
      const payload = validPayload();
      delete (payload as any).mode;
      payload.mode = '';
      const filePath = writeTempBootstrap(payload);

      expect(() => fromBootstrap(filePath)).toThrow('mode');
    });

    it('throws when runtime_address is missing', () => {
      const payload = validPayload();
      delete (payload as any).runtime_address;
      payload.runtime_address = '';
      const filePath = writeTempBootstrap(payload);

      expect(() => fromBootstrap(filePath)).toThrow('runtime_address');
    });
  });

  describe('error handling', () => {
    it('throws when bootstrap file does not exist', () => {
      expect(() => fromBootstrap('/nonexistent/path/bootstrap.json')).toThrow('not found');
    });

    it('throws when bootstrap file contains invalid JSON', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macp-runner-test-'));
      const filePath = path.join(dir, 'bad.json');
      fs.writeFileSync(filePath, 'not json');

      expect(() => fromBootstrap(filePath)).toThrow();
    });
  });
});
