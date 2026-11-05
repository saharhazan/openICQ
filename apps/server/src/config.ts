/** Server configuration from environment variables, validated at startup. */
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { LIMITS, UIN_MAX, UIN_MIN } from '@openicq/protocol';
import { z } from 'zod';
import { MEMORY_DATABASE } from './infrastructure/sqlite/database.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5190',
  'http://localhost:5190',
].join(',');

/** Largest accepted MAX_FILE_BYTES: 4 GiB. */
const MAX_FILE_BYTES_CEILING = 4 * 1024 * 1024 * 1024;
/** Default MAX_USER_STORAGE_BYTES: 2 GiB of files per user. */
const DEFAULT_USER_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;
const FILES_FOLDER = 'files';
/** A throwaway database keeps its uploads in the system temp folder. */
const MEMORY_FILES_FOLDER = 'openicq-files';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function isOrigin(value: string): boolean {
  return URL.canParse(value) && new URL(value).origin === value;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5190),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  DATABASE_PATH: z.string().trim().min(1).default('./data/openicq.db'),
  /** Defaults to a `files` folder next to the database (the system temp folder for :memory:). */
  FILES_DIR: z.string().trim().min(1).optional(),
  MAX_FILE_BYTES: z.coerce.number().int().min(1).max(MAX_FILE_BYTES_CEILING).default(LIMITS.fileMaxBytes),
  MAX_USER_STORAGE_BYTES: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_USER_STORAGE_BYTES),
  /** 0 means no cap. */
  MAX_TOTAL_STORAGE_BYTES: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
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
  /** Absolute path of the uploaded files directory. */
  readonly filesDir: string;
  /** Largest accepted upload in bytes. */
  readonly maxFileBytes: number;
  /** Bytes of files one user may keep stored. */
  readonly maxUserStorageBytes: number;
  /** Bytes of files all users may keep stored together; 0 means no cap. */
  readonly maxTotalStorageBytes: number;
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
  const databasePath = values.DATABASE_PATH === MEMORY_DATABASE ? MEMORY_DATABASE : resolve(cwd, values.DATABASE_PATH);
  const defaultFilesDir =
    databasePath === MEMORY_DATABASE ? join(tmpdir(), MEMORY_FILES_FOLDER) : join(dirname(databasePath), FILES_FOLDER);
  return {
    port: values.PORT,
    host: values.HOST,
    databasePath,
    uinStart: values.UIN_START,
    allowedOrigins: values.ALLOWED_ORIGINS,
    cookieSecure: values.COOKIE_SECURE,
    clientDistDir: resolve(cwd, values.CLIENT_DIST_DIR),
    filesDir: values.FILES_DIR === undefined ? defaultFilesDir : resolve(cwd, values.FILES_DIR),
    maxFileBytes: values.MAX_FILE_BYTES,
    maxUserStorageBytes: values.MAX_USER_STORAGE_BYTES,
    maxTotalStorageBytes: values.MAX_TOTAL_STORAGE_BYTES,
    logLevel: values.LOG_LEVEL,
  };
}
