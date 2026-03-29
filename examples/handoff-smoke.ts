import { Auth, MacpClient, HandoffSession } from '../src';

async function main(): Promise<void> {
  const client = new MacpClient({
    address: '127.0.0.1:50051',
    secure: false,
    auth: Auth.devAgent('coordinator'),
  });

  const init = await client.initialize();
  console.log('initialize', init.selectedProtocolVersion, init.runtimeInfo?.name);

  const session = new HandoffSession(client);
  await session.start({
    intent: 'transfer frontend ownership',
    participants: ['bob'],
    ttlMs: 60_000,
  });

  await session.offer({
    handoffId: 'h1',
    targetParticipant: 'bob',
    scope: 'frontend',
    reason: 'moving to backend team',
  });

  await session.sendContext({
    handoffId: 'h1',
    contentType: 'application/json',
    context: Buffer.from(JSON.stringify({ repo: 'acme/web', docs: 'wiki/frontend' })),
  });

  await session.acceptHandoff({
    handoffId: 'h1',
    acceptedBy: 'bob',
    reason: 'happy to take over',
    sender: 'bob',
    auth: Auth.devAgent('bob'),
  });

  console.log('accepted?', session.projection.isAccepted('h1'));
  console.log('pending', session.projection.pendingHandoffs().length);

  await session.commit({
    action: 'handoff.accepted',
    authorityScope: 'team',
    reason: 'bob now owns frontend',
  });

  const metadata = await session.metadata();
  console.log('state', metadata.metadata.state);
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
