import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogCapture, PASSWORD, TestServer } from './harness.ts';

const WRONG_PASSWORD = 'not-the-password-123';
const NEW_PASSWORD = 'brand-new-secret-456';

let server: TestServer;
let logs: LogCapture;

beforeEach(async () => {
  logs = new LogCapture();
  server = await TestServer.start({ logLevel: 'warn' }, { logStream: logs });
});

afterEach(async () => {
  await server.stop();
});

/** No log line may ever carry a password, whatever its field. */
function expectNoPasswords(...passwords: string[]): void {
  for (const password of passwords) expect(logs.raw.join('')).not.toContain(password);
}

describe('security logging', () => {
  it('warns about failed sign-ins with the login, never the password', async () => {
    const alice = await server.createUser('Alice', { email: 'alice@example.com' });
    expect((await server.loginResponse(String(alice.uin), WRONG_PASSWORD)).statusCode).toBe(401);
    expect((await server.loginResponse('nobody@example.com', WRONG_PASSWORD)).statusCode).toBe(401);
    const failed = logs.withMessage('sign-in failed');
    expect(failed.map((entry) => entry.login)).toEqual([String(alice.uin), 'nobody@example.com']);
    expect(failed.every((entry) => entry.level === 40)).toBe(true);
    expectNoPasswords(WRONG_PASSWORD, PASSWORD);
  });

  it('warns about password changes and remote session closes', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phone = await server.connect(await server.login(alice.uin));
    await laptop.client.requestError('password.change', { oldPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });
    expect(logs.withMessage('password change refused')).toEqual([expect.objectContaining({ uin: alice.uin, code: 'forbidden' })]);

    await laptop.client.request('password.change', { oldPassword: PASSWORD, newPassword: NEW_PASSWORD });
    await phone.client.closed;
    const [changed] = logs.withMessage('password changed');
    expect(changed).toMatchObject({ level: 40, uin: alice.uin });
    expect(changed?.closedSessionIds).toHaveLength(1);

    await server.connect(await server.login(alice.uin, NEW_PASSWORD));
    await laptop.client.request('sessions.close', { others: true });
    expect(logs.withMessage('sessions closed remotely')).toEqual([expect.objectContaining({ level: 40, uin: alice.uin })]);
    expectNoPasswords(WRONG_PASSWORD, PASSWORD, NEW_PASSWORD);
  });
});
