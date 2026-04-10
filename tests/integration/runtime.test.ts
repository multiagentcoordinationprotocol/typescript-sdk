/**
 * Integration tests against a live MACP runtime.
 *
 * Prerequisites:
 *   docker run -d --name macp-runtime-test -p 50051:50051 \
 *     -e MACP_BIND_ADDR=0.0.0.0:50051 -e MACP_ALLOW_INSECURE=1 \
 *     -e MACP_ALLOW_DEV_SENDER_HEADER=1 -e MACP_MEMORY_ONLY=1 macp-runtime
 *
 * Run:
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  Auth,
  MacpClient,
  DecisionSession,
  ProposalSession,
  TaskSession,
  HandoffSession,
  QuorumSession,
  buildDecisionPolicy,
} from '../../src/index';

const RUNTIME_ADDRESS = process.env.MACP_RUNTIME_ADDRESS ?? 'localhost:50051';

let client: MacpClient;
const agentAlice = Auth.devAgent('alice');
const agentBob = Auth.devAgent('bob');

beforeAll(() => {
  client = new MacpClient({ address: RUNTIME_ADDRESS, auth: agentAlice });
});

afterAll(() => {
  client.close();
});

// ── Client basics ────────────────────────────────────────────────────

describe('MacpClient', () => {
  it('initialize handshake', async () => {
    const result = await client.initialize(5000);
    expect(result.selectedProtocolVersion).toBe('1.0');
    expect(result.runtimeInfo).toBeDefined();
  });

  it('listModes returns built-in modes', async () => {
    const { modes } = await client.listModes(5000);
    const names = modes.map((m) => m.mode);
    expect(names).toContain('macp.mode.decision.v1');
    expect(names).toContain('macp.mode.proposal.v1');
    expect(names).toContain('macp.mode.task.v1');
    expect(names).toContain('macp.mode.handoff.v1');
    expect(names).toContain('macp.mode.quorum.v1');
  });

  it('listRoots', async () => {
    const { roots } = await client.listRoots(5000);
    expect(Array.isArray(roots)).toBe(true);
  });
});

// ── Decision mode ────────────────────────────────────────────────────

describe('Decision mode — happy path', () => {
  let session: DecisionSession;

  it('starts a session', async () => {
    session = new DecisionSession(client, { auth: agentAlice });
    const ack = await session.start({
      intent: 'Choose a framework',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });

  it('proposes an option', async () => {
    const ack = await session.propose({
      proposalId: 'p1',
      option: 'React',
      rationale: 'Popular and well-supported',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });

  it('evaluates the proposal', async () => {
    const ack = await session.evaluate({
      proposalId: 'p1',
      recommendation: 'APPROVE',
      confidence: 0.9,
      analysis: 'Solid choice',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('votes on the proposal', async () => {
    const ack = await session.vote({
      proposalId: 'p1',
      vote: 'approve',
      reason: 'I agree',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('commits the decision', async () => {
    const ack = await session.commit({
      action: 'Use React',
      authorityScope: 'team',
      reason: 'Unanimous approval',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });

  it('retrieves session metadata', async () => {
    const { metadata } = await session.metadata();
    expect(metadata.sessionId).toBe(session.sessionId);
    expect(metadata.mode).toBe('macp.mode.decision.v1');
  });
});

// ── Proposal mode ────────────────────────────────────────────────────

describe('Proposal mode — happy path', () => {
  let session: ProposalSession;

  it('starts and proposes', async () => {
    session = new ProposalSession(client, { auth: agentAlice });
    const startAck = await session.start({
      intent: 'API design',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });
    expect(startAck.ok).toBe(true);

    const propAck = await session.propose({
      proposalId: 'pp1',
      title: 'REST endpoints',
      description: 'Standard REST API',
      sender: 'alice',
    });
    expect(propAck.ok).toBe(true);
  });

  it('both parties accept the proposal', async () => {
    const ackBob = await session.accept({
      proposalId: 'pp1',
      reason: 'Looks good',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ackBob.ok).toBe(true);

    const ackAlice = await session.accept({
      proposalId: 'pp1',
      reason: 'Agreed',
      sender: 'alice',
    });
    expect(ackAlice.ok).toBe(true);
  });

  it('commits', async () => {
    const ack = await session.commit({
      action: 'Implement REST API',
      authorityScope: 'team',
      reason: 'Accepted by all',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Proposal mode — reject path ──────────────────────────────────────

describe('Proposal mode — reject path', () => {
  it('rejects and withdraws', async () => {
    const session = new ProposalSession(client, { auth: agentAlice });
    await session.start({
      intent: 'DB choice',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.propose({
      proposalId: 'rp1',
      title: 'Use MongoDB',
      description: 'NoSQL approach',
      sender: 'alice',
    });

    const rejectAck = await session.reject({
      proposalId: 'rp1',
      reason: 'Need relational',
      sender: 'bob',
      auth: agentBob,
    });
    expect(rejectAck.ok).toBe(true);

    const withdrawAck = await session.withdraw({
      proposalId: 'rp1',
      reason: 'Withdrawing per feedback',
      sender: 'alice',
    });
    expect(withdrawAck.ok).toBe(true);
  });
});

// ── Task mode ────────────────────────────────────────────────────────

describe('Task mode — happy path', () => {
  let session: TaskSession;

  it('starts and requests a task', async () => {
    session = new TaskSession(client, { auth: agentAlice });
    const startAck = await session.start({
      intent: 'Code review',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });
    expect(startAck.ok).toBe(true);

    const reqAck = await session.request({
      taskId: 't1',
      title: 'Review PR #42',
      instructions: 'Check for security issues',
      assignee: 'bob',
      sender: 'alice',
    });
    expect(reqAck.ok).toBe(true);
  });

  it('accepts the task', async () => {
    const ack = await session.acceptTask({
      taskId: 't1',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('updates progress', async () => {
    const ack = await session.update({
      taskId: 't1',
      status: 'in_progress',
      message: 'Reviewing files',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('completes the task', async () => {
    const ack = await session.complete({
      taskId: 't1',
      output: Buffer.from('No issues found'),
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('commits', async () => {
    const ack = await session.commit({
      action: 'Task completed',
      authorityScope: 'team',
      reason: 'Review finished',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Task mode — reject path ─────────────────────────────────────────

describe('Task mode — reject path', () => {
  it('rejects a task', async () => {
    const session = new TaskSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Urgent fix',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.request({
      taskId: 'tr1',
      title: 'Fix prod bug',
      instructions: 'Investigate crash',
      assignee: 'bob',
      sender: 'alice',
    });

    const ack = await session.rejectTask({
      taskId: 'tr1',
      reason: 'Not my area',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Task mode — fail path ────────────────────────────────────────────

describe('Task mode — fail path', () => {
  it('fails a task after accepting', async () => {
    const session = new TaskSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Deploy',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.request({
      taskId: 'tf1',
      title: 'Deploy v2',
      instructions: 'Deploy to staging',
      assignee: 'bob',
      sender: 'alice',
    });

    await session.acceptTask({ taskId: 'tf1', sender: 'bob', auth: agentBob });

    const ack = await session.fail({
      taskId: 'tf1',
      reason: 'Staging down',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Handoff mode ─────────────────────────────────────────────────────

describe('Handoff mode — happy path', () => {
  let session: HandoffSession;

  it('starts and offers handoff', async () => {
    session = new HandoffSession(client, { auth: agentAlice });
    const startAck = await session.start({
      intent: 'Transfer ownership',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });
    expect(startAck.ok).toBe(true);

    const offerAck = await session.offer({
      handoffId: 'h1',
      targetParticipant: 'bob',
      scope: 'frontend module',
      sender: 'alice',
    });
    expect(offerAck.ok).toBe(true);
  });

  it('adds context', async () => {
    const ack = await session.addContext({
      handoffId: 'h1',
      data: Buffer.from(JSON.stringify({ docs: 'wiki/frontend' })),
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });

  it('accepts the handoff', async () => {
    const ack = await session.acceptHandoff({
      handoffId: 'h1',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('commits', async () => {
    const ack = await session.commit({
      action: 'Handoff accepted',
      authorityScope: 'team',
      reason: 'Smooth transition',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Handoff mode — decline path ──────────────────────────────────────

describe('Handoff mode — decline path', () => {
  it('declines a handoff', async () => {
    const session = new HandoffSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Transfer DB ownership',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.offer({
      handoffId: 'hd1',
      targetParticipant: 'bob',
      scope: 'database module',
      sender: 'alice',
    });

    const ack = await session.decline({
      handoffId: 'hd1',
      reason: 'Too busy',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Quorum mode ──────────────────────────────────────────────────────

describe('Quorum mode — happy path', () => {
  let session: QuorumSession;

  it('starts and requests approval', async () => {
    session = new QuorumSession(client, { auth: agentAlice });
    const startAck = await session.start({
      intent: 'Approve release',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });
    expect(startAck.ok).toBe(true);

    const reqAck = await session.requestApproval({
      requestId: 'q1',
      action: 'Release v2.0',
      summary: 'Cut the release',
      requiredApprovals: 1,
      sender: 'alice',
    });
    expect(reqAck.ok).toBe(true);
  });

  it('approves', async () => {
    const ack = await session.approve({
      requestId: 'q1',
      reason: 'Tests pass',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('commits', async () => {
    const ack = await session.commit({
      action: 'Release approved',
      authorityScope: 'team',
      reason: 'Quorum reached',
      sender: 'alice',
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Quorum mode — reject/abstain ─────────────────────────────────────

describe('Quorum mode — reject and abstain', () => {
  it('rejects an approval request', async () => {
    const session = new QuorumSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Approve hotfix',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.requestApproval({
      requestId: 'qr1',
      action: 'Hotfix deploy',
      summary: 'Emergency patch',
      requiredApprovals: 1,
      sender: 'alice',
    });

    const ack = await session.reject({
      requestId: 'qr1',
      reason: 'Not ready',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });

  it('abstains from an approval request', async () => {
    const session = new QuorumSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Approve budget',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    await session.requestApproval({
      requestId: 'qa1',
      action: 'Budget increase',
      summary: 'Need more resources',
      requiredApprovals: 1,
      sender: 'alice',
    });

    const ack = await session.abstain({
      requestId: 'qa1',
      reason: 'Not my call',
      sender: 'bob',
      auth: agentBob,
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Session cancellation ─────────────────────────────────────────────

describe('Session cancellation', () => {
  it('cancels an active session', async () => {
    const session = new DecisionSession(client, { auth: agentAlice });
    await session.start({
      intent: 'Temp session',
      participants: ['alice'],
      ttlMs: 30_000,
      sender: 'alice',
    });

    const ack = await session.cancel('No longer needed');
    expect(ack.ok).toBe(true);
  });
});

// ── Streaming ────────────────────────────────────────────────────────

describe('Streaming', () => {
  it('opens a stream and receives messages', async () => {
    const session = new DecisionSession(client, { auth: agentAlice });

    // Open stream first
    const stream = session.openStream();
    const received: unknown[] = [];

    // Start consuming in background
    const consumer = (async () => {
      for await (const envelope of stream.responses()) {
        received.push(envelope);
        // We only need to observe the SessionStart echo
        break;
      }
    })();

    // Send SessionStart through the stream
    const startPayload = client.protoRegistry.encodeKnownPayload('macp.mode.decision.v1', 'SessionStart', {
      intent: 'Stream test',
      participants: ['alice'],
      modeVersion: '1.0.0',
      configurationVersion: 'config.default',
      policyVersion: 'policy.default',
      ttlMs: 30_000,
      context: Buffer.alloc(0),
      roots: [],
    });
    const envelope = {
      macpVersion: '1.0',
      mode: 'macp.mode.decision.v1',
      messageType: 'SessionStart',
      messageId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      sender: 'alice',
      timestampUnixMs: String(Date.now()),
      payload: startPayload,
    };
    await stream.send(envelope);

    // Wait with timeout
    const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('stream timeout')), 5000));
    await Promise.race([consumer, timeout]);

    stream.close();
    expect(received.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Policy registration ──────────────────────────────────────────────

describe('Policy lifecycle', () => {
  const policyId = `test-policy-${Date.now()}`;

  it('registers a policy', async () => {
    const descriptor = buildDecisionPolicy(policyId, 'Integration test policy', {
      voting: { algorithm: 'majority', threshold: 0.5 },
    });
    const result = await client.registerPolicy(descriptor, { auth: agentAlice });
    expect(result.ok).toBe(true);
  });

  it('retrieves the policy', async () => {
    const descriptor = await client.getPolicy(policyId, { auth: agentAlice });
    expect(descriptor.policyId).toBe(policyId);
    expect(descriptor.mode).toBe('macp.mode.decision.v1');
  });

  it('lists policies', async () => {
    const policies = await client.listPolicies('macp.mode.decision.v1', { auth: agentAlice });
    const ids = policies.map((p: any) => p.policyId);
    expect(ids).toContain(policyId);
  });

  it('unregisters the policy', async () => {
    const result = await client.unregisterPolicy(policyId, { auth: agentAlice });
    expect(result.ok).toBe(true);
  });
});

// ── Signals ──────────────────────────────────────────────────────────

describe('Signals', () => {
  it('sends a signal', async () => {
    const ack = await client.sendSignal({
      signalType: 'heartbeat',
      sender: 'alice',
      auth: agentAlice,
    });
    expect(ack.ok).toBe(true);
  });

  it('sends a progress notification', async () => {
    const ack = await client.sendProgress({
      progressToken: 'tok-1',
      progress: 50,
      total: 100,
      message: 'Half done',
      sender: 'alice',
      auth: agentAlice,
    });
    expect(ack.ok).toBe(true);
  });
});

// ── Extension mode registration ──────────────────────────────────────

describe('Extension mode registration', () => {
  it('registers and unregisters an ext mode', async () => {
    const reg = await client.registerExtMode(
      {
        mode: 'ext.test_mode.v1',
        modeVersion: '1.0.0',
        description: 'Test extension mode',
        messageTypes: ['SessionStart', 'Contribute', 'Commitment'],
        terminalMessageTypes: ['Commitment'],
      },
      { auth: agentAlice },
    );
    expect(reg.ok).toBe(true);

    const { modes } = await client.listExtModes();
    const names = modes.map((m) => m.mode);
    expect(names).toContain('ext.test_mode.v1');

    const unreg = await client.unregisterExtMode('ext.test_mode.v1', { auth: agentAlice });
    expect(unreg.ok).toBe(true);
  });
});
