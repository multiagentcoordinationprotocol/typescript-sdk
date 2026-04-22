// Example: an agent Participant that uses function strategies to act on
// projection + session state in a policy-aware way. The policyVersion on the
// session is passed into the strategy so it can tighten its rules under a
// stricter policy.
//
// Requires a running MACP Rust runtime on localhost:50051:
//   docker run -d --name macp-runtime-test -p 50051:50051 \
//     -e MACP_BIND_ADDR=0.0.0.0:50051 -e MACP_ALLOW_INSECURE=1 \
//     -e MACP_ALLOW_DEV_SENDER_HEADER=1 -e MACP_MEMORY_ONLY=1 macp-runtime
//
// Run: npx tsx examples/agent-policy-aware.ts

import {
  Auth,
  MODE_DECISION,
  MacpClient,
  agent,
} from '../src';

async function main(): Promise<void> {
  const client = new MacpClient({
    address: '127.0.0.1:50051',
    secure: false,
    allowInsecure: true,
    auth: Auth.devAgent('voter-bob'),
  });

  try {
    await client.initialize();

    // Participant built bare — subscribes to an existing decision session
    const sessionId = process.argv[2];
    if (!sessionId) {
      console.error('Usage: npx tsx examples/agent-policy-aware.ts <session-id>');
      process.exit(2);
    }

    const participant = new agent.Participant({
      participantId: 'voter-bob',
      sessionId,
      mode: MODE_DECISION,
      client,
      auth: Auth.devAgent('voter-bob'),
    });

    // Policy-aware evaluation: stricter policy ⇒ higher required confidence.
    const evaluator = agent.functionEvaluator(async (proposal, ctx) => {
      const strict = ctx.policyVersion?.includes('strict');
      const baseConfidence = strict ? 0.95 : 0.85;
      const option = (proposal.option as string) ?? 'unknown';
      if (option === 'deploy-canary') {
        return {
          recommendation: 'APPROVE',
          confidence: baseConfidence,
          reason: `Canary deployment is low risk (policy=${ctx.policyVersion})`,
        };
      }
      return {
        recommendation: 'REVIEW',
        confidence: baseConfidence * 0.7,
        reason: `Non-canary deployment needs review (policy=${ctx.policyVersion})`,
      };
    });

    // functionVoter wraps a predicate + decide pair without a class.
    const voter = agent.functionVoter(
      (projection) => projection.proposals.size > 0,
      async (projection) => {
        if (projection.proposals.size === 0) {
          return { vote: 'ABSTAIN', reason: 'no proposals yet' };
        }
        return { vote: 'APPROVE', reason: 'proposal looks good' };
      },
    );

    participant
      .on('Proposal', agent.evaluationHandler(evaluator))
      .on('Evaluation', agent.votingHandler(voter))
      .onTerminal((result) => {
        console.log('[agent-policy-aware] terminal:', result.state, result.commitment);
      });

    await participant.run();
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
