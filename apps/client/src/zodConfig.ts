/**
 * The server sends a strict CSP without 'unsafe-eval'. zod 4 probes `new Function`
 * to decide whether it may JIT-compile validators, and the browser reports that
 * probe as a CSP violation. Running jitless skips the probe; validation is unchanged.
 * Must be imported before any schema is used.
 */
import { config } from 'zod';

config({ jitless: true });
