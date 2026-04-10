import * as fs from 'node:fs';
import * as path from 'node:path';
import { Auth } from '../auth';
import { MacpClient } from '../client';
import { DEFAULT_POLICY_VERSION } from '../constants';
import { Participant, type ParticipantConfig } from './participant';

export interface BootstrapPayload {
  session_id: string;
  participant_id: string;
  mode: string;
  mode_version?: string;
  configuration_version?: string;
  policy_version?: string;
  runtime_address?: string;
  runtime_url?: string;
  auth_token?: string;
  agent_id?: string;
  secure?: boolean;
  participants?: string[];
}

export function fromBootstrap(bootstrapPath?: string): Participant {
  const resolvedPath = bootstrapPath ?? process.env.MACP_BOOTSTRAP_FILE;
  if (!resolvedPath) {
    throw new Error(
      'No bootstrap path provided. Either pass a path argument or set the MACP_BOOTSTRAP_FILE environment variable.',
    );
  }

  const absolutePath = path.isAbsolute(resolvedPath) ? resolvedPath : path.resolve(process.cwd(), resolvedPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Bootstrap file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, 'utf8');
  const payload: BootstrapPayload = JSON.parse(raw);

  if (!payload.session_id) throw new Error('Bootstrap payload missing session_id');
  if (!payload.participant_id) throw new Error('Bootstrap payload missing participant_id');
  if (!payload.mode) throw new Error('Bootstrap payload missing mode');

  const runtimeAddress = payload.runtime_address ?? payload.runtime_url ?? '';
  if (!runtimeAddress) throw new Error('Bootstrap payload missing runtime_address / runtime_url');

  const auth = payload.auth_token
    ? Auth.bearer(payload.auth_token, payload.participant_id)
    : Auth.devAgent(payload.agent_id ?? payload.participant_id);

  const client = new MacpClient({
    address: runtimeAddress,
    secure: payload.secure,
    auth,
  });

  const config: ParticipantConfig = {
    participantId: payload.participant_id,
    sessionId: payload.session_id,
    mode: payload.mode,
    client,
    auth,
    participants: payload.participants ?? [],
    modeVersion: payload.mode_version,
    configurationVersion: payload.configuration_version,
    policyVersion: payload.policy_version ?? DEFAULT_POLICY_VERSION,
  };

  return new Participant(config);
}
