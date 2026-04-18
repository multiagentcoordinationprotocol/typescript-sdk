import type { AuthConfig } from '../auth';
import type { MacpClient } from '../client';
import { MODE_DECISION, MODE_HANDOFF, MODE_PROPOSAL, MODE_QUORUM, MODE_TASK } from '../constants';
import { DecisionSession } from '../decision';
import { HandoffSession } from '../handoff';
import { DecisionProjection } from '../projections/decision';
import { ProposalSession } from '../proposal';
import { QuorumSession } from '../quorum';
import { TaskSession } from '../task';
import { Dispatcher } from './dispatcher';
import { GrpcTransportAdapter, type TransportAdapter } from './transports';
import type {
  HandlerContext,
  MessageHandler,
  PhaseChangeHandler,
  ProjectionLike,
  SessionActions,
  SessionInfo,
  TerminalHandler,
  TerminalResult,
} from './types';

export interface InitiatorConfig {
  sessionStart: {
    intent: string;
    participants: string[];
    ttlMs: number;
    context?: Record<string, unknown>;
    roots?: Array<{ uri: string; name?: string }>;
  };
  kickoff?: {
    messageType: string;
    payload: Record<string, unknown>;
  };
}

export interface ParticipantConfig {
  participantId: string;
  sessionId: string;
  mode: string;
  client: MacpClient;
  auth?: AuthConfig;
  participants?: string[];
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  transport?: TransportAdapter;
  initiator?: InitiatorConfig;
}

type ModeSession = DecisionSession | ProposalSession | TaskSession | HandoffSession | QuorumSession;

export class Participant {
  readonly participantId: string;
  readonly sessionId: string;
  readonly mode: string;
  readonly client: MacpClient;
  readonly auth?: AuthConfig;
  readonly projection: ProjectionLike;
  readonly actions: SessionActions;

  private readonly dispatcher: Dispatcher;
  private readonly session: ModeSession | null;
  private readonly transport: TransportAdapter;
  private readonly initiatorConfig?: InitiatorConfig;
  private running = false;
  private lastPhase: string;

  constructor(config: ParticipantConfig) {
    this.participantId = config.participantId;
    this.sessionId = config.sessionId;
    this.mode = config.mode;
    this.client = config.client;
    this.auth = config.auth;
    this.dispatcher = new Dispatcher();

    const sessionOpts = {
      sessionId: config.sessionId,
      modeVersion: config.modeVersion,
      configurationVersion: config.configurationVersion,
      policyVersion: config.policyVersion,
      auth: config.auth,
    };

    const { session, projection } = this.createModeSession(config.mode, config.client, sessionOpts);
    this.session = session;
    this.projection = projection;
    this.lastPhase = projection.phase;
    this.actions = this.buildActions();
    this.transport = config.transport ?? new GrpcTransportAdapter(config.client, config.sessionId, config.auth);
    this.initiatorConfig = config.initiator;
  }

  private createModeSession(
    mode: string,
    client: MacpClient,
    opts: {
      sessionId: string;
      modeVersion?: string;
      configurationVersion?: string;
      policyVersion?: string;
      auth?: AuthConfig;
    },
  ): { session: ModeSession | null; projection: ProjectionLike } {
    switch (mode) {
      case MODE_DECISION: {
        const s = new DecisionSession(client, opts);
        return { session: s, projection: s.projection };
      }
      case MODE_PROPOSAL: {
        const s = new ProposalSession(client, opts);
        return { session: s, projection: s.projection };
      }
      case MODE_TASK: {
        const s = new TaskSession(client, opts);
        return { session: s, projection: s.projection };
      }
      case MODE_HANDOFF: {
        const s = new HandoffSession(client, opts);
        return { session: s, projection: s.projection };
      }
      case MODE_QUORUM: {
        const s = new QuorumSession(client, opts);
        return { session: s, projection: s.projection };
      }
      default: {
        const fallback = new DecisionProjection();
        return { session: null, projection: fallback };
      }
    }
  }

  private buildActions(): SessionActions {
    const participantId = this.participantId;
    const actions: SessionActions = {};

    if (this.session instanceof DecisionSession) {
      const ds = this.session;
      actions.evaluate = async (input) => {
        await ds.evaluate({ ...input, sender: participantId });
      };
      actions.vote = async (input) => {
        await ds.vote({ ...input, sender: participantId });
      };
      actions.raiseObjection = async (input) => {
        await ds.raiseObjection({ ...input, sender: participantId });
      };
      actions.propose = async (input) => {
        await ds.propose({ ...input, sender: participantId });
      };
      actions.commit = async (input) => {
        await ds.commit({ ...input, sender: participantId });
      };
    }

    if (this.session instanceof ProposalSession) {
      const ps = this.session;
      actions.propose = async (input) => {
        await ps.propose({
          proposalId: input.proposalId,
          title: input.option,
          summary: input.rationale,
          sender: participantId,
        });
      };
      actions.commit = async (input) => {
        await ps.commit({ ...input, sender: participantId });
      };
    }

    if (this.session instanceof TaskSession) {
      const ts = this.session;
      actions.commit = async (input) => {
        await ts.commit({ ...input, sender: participantId });
      };
    }

    if (this.session instanceof HandoffSession) {
      const hs = this.session;
      actions.commit = async (input) => {
        await hs.commit({ ...input, sender: participantId });
      };
    }

    if (this.session instanceof QuorumSession) {
      const qs = this.session;
      actions.commit = async (input) => {
        await qs.commit({ ...input, sender: participantId });
      };
    }

    const mode = this.mode;
    const sessionId = this.sessionId;
    const client = this.client;
    const auth = this.auth;
    actions.send = async (messageType: string, payload: Record<string, unknown>) => {
      const { buildEnvelope } = await import('../envelope.js');
      const envelope = buildEnvelope({
        mode,
        messageType,
        sessionId,
        sender: participantId,
        payload: client.protoRegistry.encodeKnownPayload(mode, messageType, payload),
      });
      await client.send(envelope, { auth });
    };

    return actions;
  }

  on(messageType: string, handler: MessageHandler): Participant {
    this.dispatcher.on(messageType, handler);
    return this;
  }

  onPhaseChange(phase: string, handler: PhaseChangeHandler): Participant {
    this.dispatcher.onPhaseChange(phase, handler);
    return this;
  }

  onTerminal(handler: TerminalHandler): Participant {
    this.dispatcher.onTerminal(handler);
    return this;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.initiatorConfig && this.session) {
      await this.emitInitiatorEnvelopes();
    }

    const sessionInfo: SessionInfo = {
      sessionId: this.sessionId,
      mode: this.mode,
      participants: [],
      policyVersion: undefined,
    };

    try {
      for await (const message of this.transport.start()) {
        if (!this.running) break;

        const ctx: HandlerContext = {
          participant: this,
          projection: this.projection,
          actions: this.actions,
          session: sessionInfo,
          log: (msg: string, details?: Record<string, unknown>) => {
            // eslint-disable-next-line no-console
            console.log(`[${this.participantId}] ${msg}`, details ?? '');
          },
        };

        // Apply envelope to projection if we have a mode session
        if (this.session && message.raw) {
          const applyMethod = (this.session as { projection: { applyEnvelope: (...args: unknown[]) => void } })
            .projection.applyEnvelope;
          if (typeof applyMethod === 'function') {
            applyMethod.call(
              (this.session as { projection: ProjectionLike }).projection,
              message.raw,
              this.client.protoRegistry,
            );
          }
        }

        // Dispatch message
        await this.dispatcher.dispatch(message, ctx);

        // Check for phase change
        const currentPhase = this.projection.phase;
        if (currentPhase !== this.lastPhase) {
          this.lastPhase = currentPhase;
          await this.dispatcher.dispatchPhaseChange(currentPhase, ctx);

          // Check for terminal state
          if (
            currentPhase === 'Committed' ||
            currentPhase === 'Accepted' ||
            currentPhase === 'Declined' ||
            currentPhase === 'Cancelled' ||
            currentPhase === 'TerminalRejected'
          ) {
            const terminalResult: TerminalResult = {
              state: currentPhase,
              commitment: (this.projection as { commitment?: Record<string, unknown> }).commitment,
            };
            await this.dispatcher.dispatchTerminal(terminalResult);
            break;
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.transport.stop();
  }

  private async emitInitiatorEnvelopes(): Promise<void> {
    if (!this.initiatorConfig || !this.session) return;
    const ss = this.initiatorConfig.sessionStart;

    if ('start' in this.session && typeof this.session.start === 'function') {
      await this.session.start({
        intent: ss.intent,
        participants: ss.participants,
        ttlMs: ss.ttlMs,
        roots: ss.roots,
      });
    }

    const kickoff = this.initiatorConfig.kickoff;
    if (!kickoff) return;

    if (kickoff.messageType === 'Proposal' && this.session instanceof DecisionSession) {
      const payload = kickoff.payload;
      await this.session.propose({
        proposalId: String(payload.proposalId ?? payload.proposal_id ?? `${this.sessionId}-kickoff`),
        option: String(payload.option ?? 'decide'),
        rationale: payload.rationale !== undefined ? String(payload.rationale) : undefined,
      });
    }
  }
}
