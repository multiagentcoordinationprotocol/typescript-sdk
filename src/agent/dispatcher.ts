import type {
  HandlerContext,
  IncomingMessage,
  MessageHandler,
  PhaseChangeHandler,
  TerminalHandler,
  TerminalResult,
} from './types';

export class Dispatcher {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private wildcardHandlers: MessageHandler[] = [];
  private phaseHandlers: Map<string, PhaseChangeHandler[]> = new Map();
  private wildcardPhaseHandlers: PhaseChangeHandler[] = [];
  private terminalHandler?: TerminalHandler;

  on(messageType: string, handler: MessageHandler): void {
    if (messageType === '*') {
      this.wildcardHandlers.push(handler);
      return;
    }
    const existing = this.handlers.get(messageType) ?? [];
    existing.push(handler);
    this.handlers.set(messageType, existing);
  }

  onPhaseChange(phase: string, handler: PhaseChangeHandler): void {
    if (phase === '*') {
      this.wildcardPhaseHandlers.push(handler);
      return;
    }
    const existing = this.phaseHandlers.get(phase) ?? [];
    existing.push(handler);
    this.phaseHandlers.set(phase, existing);
  }

  onTerminal(handler: TerminalHandler): void {
    this.terminalHandler = handler;
  }

  async dispatch(message: IncomingMessage, ctx: HandlerContext): Promise<void> {
    const specific = this.handlers.get(message.messageType) ?? [];
    for (const handler of specific) {
      await handler(message, ctx);
    }
    for (const handler of this.wildcardHandlers) {
      await handler(message, ctx);
    }
  }

  async dispatchPhaseChange(newPhase: string, ctx: HandlerContext): Promise<void> {
    const specific = this.phaseHandlers.get(newPhase) ?? [];
    for (const handler of specific) {
      await handler(newPhase, ctx);
    }
    for (const handler of this.wildcardPhaseHandlers) {
      await handler(newPhase, ctx);
    }
  }

  async dispatchTerminal(result: TerminalResult): Promise<void> {
    if (this.terminalHandler) {
      await this.terminalHandler(result);
    }
  }

  hasHandlersFor(messageType: string): boolean {
    return (this.handlers.get(messageType)?.length ?? 0) > 0 || this.wildcardHandlers.length > 0;
  }

  hasTerminalHandler(): boolean {
    return this.terminalHandler !== undefined;
  }
}
