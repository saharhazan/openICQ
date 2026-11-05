/** Health check, the client build (with SPA fallback) and JSON 404s. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_PATHS, WS_PATH } from '@openicq/protocol';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../domain/ports.ts';
import { sendError } from './errors.ts';

export function registerHealthRoute(app: FastifyInstance, healthCheck: () => void, clock: Clock): void {
  app.get(API_PATHS.health, async (_request, reply) => {
    healthCheck();
    return reply.send({ status: 'ok', serverTime: clock.now().toISOString() });
  });
}

/** Serves the client build when it exists; unknown non-API GETs fall back to index.html. */
export async function registerClientAssets(app: FastifyInstance, distDir: string): Promise<void> {
  const hasBuild = existsSync(join(distDir, 'index.html'));
  if (hasBuild) {
    await app.register(fastifyStatic, { root: distDir });
    app.log.info({ distDir }, 'serving client build');
  } else {
    app.log.warn({ distDir }, 'client build not found, serving the API only');
  }

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const isPageRequest =
      (request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && path !== WS_PATH;
    if (hasBuild && isPageRequest) return reply.sendFile('index.html');
    return sendError(reply, 'not_found', 'Not found.');
  });
}
