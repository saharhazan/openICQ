/** Server configuration from environment variables, validated at startup. */
import { resolve } from 'node:path';
import { UIN_MAX, UIN_MIN } from '@openicq/protocol';
import { z } from 'zod';
import { MEMORY_DATABASE } from './infrastructure/sqlite/database.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5190',
  'http://localhost:5190',
].join(',');

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function isOrigin(value: string): boolean {
  return URL.canParse(value) && new URL(value).origin === value;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5190),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  DATABASE_PATH: z.string().trim().min(1).default('./data/icq.db'),
  UIN_START: z.coerce.number().int().min(UIN_MIN).max(UIN_MAX).default(100000),
  ALLOWED_ORIGINS: z
    .string()
    .default(DEFAULT_ALLOWED_ORIGINS)
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter((origin) => origin !== ''))
    .pipe(
      z
        .array(z.string().refine(isOrigin, 'Each origin must look like http://host:port, without a path'))
        .min(1, 'At least one origin is required'),
    ),
  COOKIE_SECURE: z.stringbool().default(false),
  CLIENT_DIST_DIR: z.string().trim().min(1).default('../client/dist'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface Config {
  readonly port: number;
  readonly host: string;
  /** Absolute path, or `:memory:`. */
  readonly databasePath: string;
  readonly uinStart: number;
  readonly allowedOrigins: readonly string[];
  readonly cookieSecure: boolean;
  /** Absolute path of the client build. */
  readonly clientDistDir: string;
  readonly logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parses the environment. Throws `ConfigError` naming every invalid variable. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>, cwd = process.cwd()): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  const values = parsed.data;
  return {
    port: values.PORT,
    host: values.HOST,
    databasePath: values.DATABASE_PATH === MEMORY_DATABASE ? MEMORY_DATABASE : resolve(cwd, values.DATABASE_PATH),
    uinStart: values.UIN_START,
    allowedOrigins: values.ALLOWED_ORIGINS,
    cookieSecure: values.COOKIE_SECURE,
    clientDistDir: resolve(cwd, values.CLIENT_DIST_DIR),
    logLevel: values.LOG_LEVEL,
  };
}
