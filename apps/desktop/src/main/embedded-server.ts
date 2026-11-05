/** "Host a server on this computer": the regular openICQ server, running inside the desktop app. */
import { join } from 'node:path';
import { composeApp, loadConfig } from '@openicq/server/embedded';
import { networkUrlsFor } from './connection-choice.ts';
import { hostedOrigins, lanAddresses } from './network.ts';

export interface EmbeddedServerOptions {
  readonly port: number;
  readonly shareOnNetwork: boolean;
  /** Where the database lives (the app's user data folder). */
  readonly dataDir: string;
  /** The built web client the server hands out. */
  readonly clientDir: string;
}

export interface EmbeddedServer {
  /** What this computer loads. */
  readonly localUrl: string;
  /** What other computers on the network can use (empty when sharing is off). */
  readonly networkUrls: readonly string[];
  close(): Promise<void>;
}

export class PortInUseError extends Error {
  readonly port: number;
  constructor(port: number, options?: ErrorOptions) {
    super(`Port ${port} is already in use. Another openICQ server (or another program) is running on it.`, options);
    this.name = 'PortInUseError';
    this.port = port;
  }
}

export async function startEmbeddedServer(options: EmbeddedServerOptions): Promise<EmbeddedServer> {
  const lan = options.shareOnNetwork ? lanAddresses() : [];
  const host = options.shareOnNetwork ? '0.0.0.0' : '127.0.0.1';
  const config = loadConfig(
    {
      PORT: String(options.port),
      HOST: host,
      DATABASE_PATH: join(options.dataDir, 'openicq.db'),
      ALLOWED_ORIGINS: hostedOrigins(options.port, lan).join(','),
      CLIENT_DIST_DIR: options.clientDir,
      LOG_LEVEL: 'warn',
    },
    options.dataDir,
  );
  const app = await composeApp(config);
  try {
    await app.listen({ port: options.port, host });
  } catch (error) {
    await app.close();
    if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') throw new PortInUseError(options.port, { cause: error });
    throw error;
  }
  return {
    localUrl: `http://127.0.0.1:${options.port}`,
    networkUrls: networkUrlsFor({ mode: 'host', port: options.port, shareOnNetwork: options.shareOnNetwork }, lan),
    close: () => app.close(),
  };
}
