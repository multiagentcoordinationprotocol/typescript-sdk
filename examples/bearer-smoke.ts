/**
 * Production-pattern smoke: Bearer token + expectedSender identity guard.
 *
 * Run against a runtime with MACP_AUTH_TOKENS_JSON configured, then:
 *   MACP_RUNTIME_ADDRESS=localhost:50051 \
 *   MACP_TEST_BEARER_ALICE=alice-token \
 *   MACP_TEST_BEARER_BOB=bob-token \
 *   npx tsx examples/bearer-smoke.ts
 *
 * Uses `Auth.bearer(token, { expectedSender })` — the SDK rejects any
 * envelope whose caller-supplied `sender` conflicts with the identity bound
 * on the credential (RFC-MACP-0004 §4, surfaced as
 * MacpIdentityMismatchError before the RPC leaves the process).
 */
import {
  Auth,
  DecisionSession,
  MacpClient,
  MacpIdentityMismatchError,
  newSessionId,
} from '../src';

const RUNTIME_ADDRESS = process.env.MACP_RUNTIME_ADDRESS ?? '127.0.0.1:50051';
const ALICE_TOKEN = process.env.MACP_TEST_BEARER_ALICE;
const BOB_TOKEN = process.env.MACP_TEST_BEARER_BOB;

async function main(): Promise<void> {
  if (!ALICE_TOKEN || !BOB_TOKEN) {
    console.error(
      'Missing MACP_TEST_BEARER_ALICE / MACP_TEST_BEARER_BOB env vars.',
      'See tests/integration/README.md for the runtime setup.',
    );
    process.exitCode = 1;
    return;
  }

  const sessionId = newSessionId();

  // Each agent owns its own MacpClient with its own credentials. Never share
  // one bearer token across agents — the SDK's identity guard relies on a 1:1
  // binding between a credential and `expectedSender`.
  const alice = new MacpClient({
    address: RUNTIME_ADDRESS,
    secure: false,
    allowInsecure: true,
    auth: Auth.bearer(ALICE_TOKEN, { expectedSender: 'alice' }),
  });
  const bob = new MacpClient({
    address: RUNTIME_ADDRESS,
    secure: false,
    allowInsecure: true,
    auth: Auth.bearer(BOB_TOKEN, { expectedSender: 'bob' }),
  });

  try {
    await alice.initialize();
    await bob.initialize();

    // Initiator opens the session at the pre-allocated sessionId.
    const initiator = new DecisionSession(alice, { sessionId });
    await initiator.start({
      intent: 'bearer smoke',
      participants: ['alice', 'bob'],
      ttlMs: 30_000,
    });
    await initiator.propose({ proposalId: 'p1', option: 'ship', rationale: 'all green' });

    // Non-initiator attaches to the same sessionId and contributes.
    const subscriber = new DecisionSession(bob, { sessionId });
    await subscriber.evaluate({ proposalId: 'p1', recommendation: 'APPROVE', confidence: 0.9 });
    await subscriber.vote({ proposalId: 'p1', vote: 'approve', reason: 'lgtm' });

    // Identity guard demo — forging a `sender` on a bearer-bound credential throws
    // client-side before the envelope hits the wire.
    try {
      await initiator.propose({ proposalId: 'p2', option: 'x', sender: 'mallory' });
    } catch (err) {
      if (err instanceof MacpIdentityMismatchError) {
        console.log('[expected] MacpIdentityMismatchError:', err.expectedSender, '!=', err.actualSender);
      } else {
        throw err;
      }
    }

    await initiator.commit({
      action: 'shipped',
      authorityScope: 'release',
      reason: 'unanimous',
    });
    console.log('sessionId', sessionId, 'committed:', initiator.projection.isCommitted);
  } finally {
    alice.close();
    bob.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
