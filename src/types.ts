export interface Root {
  uri: string;
  name?: string;
}

export interface Envelope {
  macpVersion: string;
  mode: string;
  messageType: string;
  messageId: string;
  sessionId: string;
  sender: string;
  timestampUnixMs: string;
  payload: Buffer;
}

export interface MacpErrorShape {
  code: string;
  message: string;
  sessionId?: string;
  messageId?: string;
  details?: Buffer;
}

export interface Ack {
  ok?: boolean;
  duplicate?: boolean;
  messageId?: string;
  sessionId?: string;
  acceptedAtUnixMs?: string;
  sessionState?: string;
  error?: MacpErrorShape;
}

export interface ParticipantActivity {
  participantId: string;
  lastMessageAtUnixMs: string;
  messageCount: number;
}

export interface SessionMetadata {
  sessionId?: string;
  mode?: string;
  state?: string;
  startedAtUnixMs?: string;
  expiresAtUnixMs?: string;
  modeVersion?: string;
  configurationVersion?: string;
  policyVersion?: string;
  participants?: string[];
  participantActivity?: ParticipantActivity[];
}

export interface ModeDescriptor {
  mode: string;
  modeVersion: string;
  title?: string;
  description?: string;
  determinismClass?: string;
  participantModel?: string;
  messageTypes?: string[];
  terminalMessageTypes?: string[];
  schemaUris?: Record<string, string>;
}

export interface TransportEndpoint {
  transport: string;
  uri: string;
  contentTypes?: string[];
  metadata?: Record<string, string>;
}

export interface AgentManifest {
  agentId?: string;
  title?: string;
  description?: string;
  supportedModes?: string[];
  inputContentTypes?: string[];
  outputContentTypes?: string[];
  metadata?: Record<string, string>;
  transportEndpoints?: TransportEndpoint[];
}

export interface InitializeResult {
  selectedProtocolVersion: string;
  runtimeInfo?: {
    name?: string;
    title?: string;
    version?: string;
    description?: string;
    websiteUrl?: string;
  };
  supportedModes?: string[];
  instructions?: string;
  capabilities?: Record<string, unknown>;
}

export interface SessionStartPayload {
  intent: string;
  participants: string[];
  modeVersion: string;
  configurationVersion: string;
  policyVersion?: string;
  ttlMs: number;
  context?: Buffer;
  roots?: Root[];
}

export interface CommitmentPayload {
  commitmentId: string;
  action: string;
  authorityScope: string;
  reason: string;
  modeVersion: string;
  policyVersion?: string;
  configurationVersion: string;
  outcomePositive?: boolean;
}

export interface SignalPayload {
  signalType: string;
  data?: Buffer;
  confidence?: number;
  correlationSessionId?: string;
}

export interface ProgressPayload {
  progressToken: string;
  progress: number;
  total: number;
  message?: string;
  targetMessageId?: string;
}

export interface DecisionProposalPayload {
  proposalId: string;
  option: string;
  rationale?: string;
  supportingData?: Buffer;
}

export interface DecisionEvaluationPayload {
  proposalId: string;
  recommendation: string;
  confidence: number;
  reason?: string;
}

export interface DecisionObjectionPayload {
  proposalId: string;
  reason: string;
  severity?: string;
}

export interface DecisionVotePayload {
  proposalId: string;
  vote: string;
  reason?: string;
}

export interface ProposalModeProposalPayload {
  proposalId: string;
  title: string;
  summary?: string;
  details?: Buffer;
  tags?: string[];
}

export interface CounterProposalPayload {
  proposalId: string;
  supersedesProposalId: string;
  title: string;
  summary?: string;
  details?: Buffer;
}

export interface AcceptPayload {
  proposalId: string;
  reason?: string;
}

export interface RejectPayload {
  proposalId: string;
  terminal?: boolean;
  reason?: string;
}

export interface WithdrawPayload {
  proposalId: string;
  reason?: string;
}

export interface TaskRequestPayload {
  taskId: string;
  title: string;
  instructions: string;
  requestedAssignee?: string;
  input?: Buffer;
  deadlineUnixMs?: number;
}

export interface TaskAcceptPayload {
  taskId: string;
  assignee: string;
  reason?: string;
}

export interface TaskRejectPayload {
  taskId: string;
  assignee: string;
  reason?: string;
}

export interface TaskUpdatePayload {
  taskId: string;
  status: string;
  progress: number;
  message?: string;
  partialOutput?: Buffer;
}

export interface TaskCompletePayload {
  taskId: string;
  assignee: string;
  output?: Buffer;
  summary?: string;
}

export interface TaskFailPayload {
  taskId: string;
  assignee: string;
  errorCode?: string;
  reason?: string;
  retryable?: boolean;
}

export interface HandoffOfferPayload {
  handoffId: string;
  targetParticipant: string;
  scope: string;
  reason?: string;
}

export interface HandoffContextPayload {
  handoffId: string;
  contentType: string;
  context?: Buffer;
}

export interface HandoffAcceptPayload {
  handoffId: string;
  acceptedBy: string;
  reason?: string;
}

export interface HandoffDeclinePayload {
  handoffId: string;
  declinedBy: string;
  reason?: string;
}

export interface ApprovalRequestPayload {
  requestId: string;
  action: string;
  summary: string;
  details?: Buffer;
  requiredApprovals: number;
}

export interface ApprovePayload {
  requestId: string;
  reason?: string;
}

export interface QuorumRejectPayload {
  requestId: string;
  reason?: string;
}

export interface AbstainPayload {
  requestId: string;
  reason?: string;
}

export interface PolicyDescriptor {
  policy_id: string;
  mode: string;
  description: string;
  rules: Buffer | Uint8Array;
  schema_version: number;
  registered_at_unix_ms?: number;
}

export interface RegistryChanged {
  registry: string;
  observedAtUnixMs: string;
}

export interface RootsChanged {
  observedAtUnixMs: string;
}
