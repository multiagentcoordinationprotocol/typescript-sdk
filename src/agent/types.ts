import type { Envelope } from '../types';

export interface IncomingMessage {
  messageType: string;
  sender: string;
  payload: Record<string, unknown>;
  proposalId?: string;
  raw: Envelope;
  seq?: number;
}

export interface SessionInfo {
  sessionId: string;
  mode: string;
  participants: string[];
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
}

export interface SessionActions {
  evaluate?(input: { proposalId: string; recommendation: string; confidence: number; reason?: string }): Promise<void>;
  vote?(input: { proposalId: string; vote: string; reason?: string }): Promise<void>;
  raiseObjection?(input: { proposalId: string; reason: string; severity?: string }): Promise<void>;
  propose?(input: { proposalId: string; option: string; rationale?: string; supportingData?: Buffer }): Promise<void>;
  commit?(input: {
    action: string;
    authorityScope: string;
    reason: string;
    commitmentId?: string;
    outcomePositive?: boolean;
  }): Promise<void>;
  send?(messageType: string, payload: Record<string, unknown>): Promise<void>;
}

export interface HandlerContext {
  participant: ParticipantLike;
  projection: ProjectionLike;
  actions: SessionActions;
  session: SessionInfo;
  log: (msg: string, details?: Record<string, unknown>) => void;
}

export interface ParticipantLike {
  readonly participantId: string;
  readonly sessionId: string;
  readonly mode: string;
}

export interface ProjectionLike {
  readonly phase: string;
  readonly transcript: Envelope[];
}

export type MessageHandler = (event: IncomingMessage, ctx: HandlerContext) => void | Promise<void>;
export type TerminalHandler = (result: TerminalResult) => void | Promise<void>;
export type PhaseChangeHandler = (newPhase: string, ctx: HandlerContext) => void | Promise<void>;

export interface TerminalResult {
  state: string;
  commitment?: Record<string, unknown>;
}
