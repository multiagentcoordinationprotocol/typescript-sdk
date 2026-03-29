import { Auth, MacpClient, ProposalSession } from '../src';

async function main(): Promise<void> {
  const client = new MacpClient({
    address: '127.0.0.1:50051',
    secure: false,
    auth: Auth.devAgent('coordinator'),
  });

  const init = await client.initialize();
  console.log('initialize', init.selectedProtocolVersion, init.runtimeInfo?.name);

  const session = new ProposalSession(client);
  await session.start({
    intent: 'choose a tech stack',
    participants: ['alice', 'bob'],
    ttlMs: 60_000,
  });

  await session.propose({ proposalId: 'p1', title: 'Use React', summary: 'mature ecosystem' });

  await session.counterPropose({
    proposalId: 'p2',
    supersedesProposalId: 'p1',
    title: 'Use Svelte',
    summary: 'lighter bundle',
    sender: 'alice',
    auth: Auth.devAgent('alice'),
  });

  await session.accept({
    proposalId: 'p2',
    reason: 'svelte is good',
    sender: 'bob',
    auth: Auth.devAgent('bob'),
  });

  console.log('active proposals', session.projection.activeProposals().length);
  console.log('p2 accepted?', session.projection.isAccepted('p2'));

  await session.commit({
    action: 'proposal.accepted',
    authorityScope: 'tech-lead',
    reason: 'team agreed on Svelte',
  });

  const metadata = await session.metadata();
  console.log('state', metadata.metadata.state, 'mode', metadata.metadata.mode);
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
