/**
 * Runs the server inside another Node process: the openICQ desktop app hosts
 * one on the user's computer ("Host a server on this computer").
 * The same composition root and configuration rules as `main.ts` apply.
 */
export { composeApp } from './composition.ts';
export { loadConfig, type Config } from './config.ts';
