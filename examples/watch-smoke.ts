import { Auth, MacpClient, ModeRegistryWatcher } from '../src';

async function main(): Promise<void> {
  const client = new MacpClient({
    address: '127.0.0.1:50051',
    secure: false,
    auth: Auth.devAgent('coordinator'),
  });

  await client.initialize();

  const watcher = new ModeRegistryWatcher(client, { auth: Auth.devAgent('coordinator') });

  // Use AbortController to stop after 10 seconds
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10_000);

  console.log('watching mode registry for 10 seconds...');
  try {
    for await (const change of watcher.changes(controller.signal)) {
      console.log('registry changed at', change.observedAtUnixMs);
    }
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 1) {
      console.log('watch cancelled');
    } else {
      throw error;
    }
  }

  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
