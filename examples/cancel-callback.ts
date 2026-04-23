// Demonstrates the cancel-callback HTTP server (RFC-MACP-0001 §7.2 Option A).
//
// The server lets an external orchestrator POST `{runId, reason}` to shut down
// a long-running agent. Runnable standalone — no MACP runtime required.
//
// For the wiring into a real Participant, see docs/api/cancel-callback.md
// and the `Participant.attachCancelCallbackServer()` / bootstrap
// `cancel_callback` paths.
//
// Run: npx tsx examples/cancel-callback.ts

import { startCancelCallbackServer } from '../src/agent/cancel-callback';

async function main(): Promise<void> {
  let stopped = false;

  const server = await startCancelCallbackServer({
    host: '127.0.0.1',
    port: 0, // ephemeral
    path: '/cancel',
    onCancel: (runId, reason) => {
      console.log(`[cancel-callback] runId=${runId} reason=${reason}`);
      stopped = true;
      // In a real agent, call `participant.stop()` here.
    },
  });

  const url = `http://${server.host}:${server.port}${server.path}`;
  console.log(`[cancel-callback] listening on ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: 'demo-run', reason: 'example shutdown' }),
  });
  const body = (await res.json()) as { ok: boolean };

  await server.close();

  if (!res.ok || !body.ok || !stopped) {
    console.error(`[cancel-callback] FAIL (status=${res.status}, stopped=${stopped})`);
    process.exit(1);
  }

  console.log('[cancel-callback] PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
