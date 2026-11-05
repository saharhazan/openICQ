/** Composition root: reads the configuration, starts the server and shuts it down cleanly. */
import type { FastifyInstance } from 'fastify';
import { composeApp } from './composition.ts';
import { loadConfig } from './config.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function installShutdown(app: FastifyInstance): void {
  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      app.log.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    app.close().then(
      () => app.log.info('shutdown complete'),
      (error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exitCode = 1;
      },
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await composeApp(config);
  installShutdown(app);
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  // The logger may not exist yet (bad configuration), so this goes straight to stderr.
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`ICQ server failed to start: ${detail}\n`);
  process.exit(1);
});
