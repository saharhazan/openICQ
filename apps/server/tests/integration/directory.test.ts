import { DEFAULT_PREFERENCES } from '../../src/domain/defaults.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestServer } from './harness.ts';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

describe('search.users', () => {
  it('finds by exact UIN, by email (case-insensitive) and by details', async () => {
    const alice = await server.createUser('Alice', { firstName: 'Alice', lastName: 'Liddell', email: 'Alice@Example.com' });
    const bob = await server.createUser('Bobcat', { firstName: 'Robert', lastName: 'Smith', email: 'bob@example.com' });
    const { client } = await server.connect(alice);

    const byUin = await client.request('search.users', { by: 'uin', uin: bob.uin });
    expect(byUin.results).toEqual([
      { uin: bob.uin, nickname: 'Bobcat', firstName: 'Robert', lastName: 'Smith', email: 'bob@example.com', authRequired: false, online: null },
    ]);
    expect((await client.request('search.users', { by: 'uin', uin: 999999 })).results).toEqual([]);

    const byEmail = await client.request('search.users', { by: 'email', email: 'alice@EXAMPLE.com' });
    expect(byEmail.results.map((result) => result.uin)).toEqual([alice.uin]);

    const byNick = await client.request('search.users', { by: 'details', nickname: 'CAT' });
    expect(byNick.results.map((result) => result.uin)).toEqual([bob.uin]);
    const anded = await client.request('search.users', { by: 'details', firstName: 'rob', lastName: 'lid' });
    expect(anded.results).toEqual([]);
    const both = await client.request('search.users', { by: 'details', lastName: 'i' });
    expect(both.results.map((result) => result.uin)).toEqual([alice.uin, bob.uin]);
  });

  it('treats LIKE wildcards in the query as plain characters', async () => {
    const alice = await server.createUser('Alice');
    await server.createUser('100%_real');
    const { client } = await server.connect(alice);
    expect((await client.request('search.users', { by: 'details', nickname: '%' })).results.map((r) => r.nickname)).toEqual([
      '100%_real',
    ]);
    expect((await client.request('search.users', { by: 'details', nickname: '_' })).results.map((r) => r.nickname)).toEqual([
      '100%_real',
    ]);
    expect((await client.request('search.users', { by: 'details', nickname: 'A_ice' })).results).toEqual([]);
  });

  it('respects hidden email in email search, profiles and results, except for the owner', async () => {
    const alice = await server.createUser('Alice', { email: 'alice@example.com' });
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    await aliceClient.request('settings.update', { hideEmail: true });

    const { client: bobClient } = await server.connect(bob);
    expect((await bobClient.request('search.users', { by: 'email', email: 'alice@example.com' })).results).toEqual([]);
    expect((await bobClient.request('profile.get', { uin: alice.uin })).profile.email).toBe('');
    expect((await bobClient.request('search.users', { by: 'uin', uin: alice.uin })).results[0]?.email).toBe('');
    expect((await aliceClient.request('profile.get', { uin: alice.uin })).profile.email).toBe('alice@example.com');
  });

  it('reports online only for web-aware users, and never for invisible ones', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const find = async () => (await aliceClient.request('search.users', { by: 'uin', uin: bob.uin })).results[0]?.online;

    expect(await find()).toBeNull();
    const { client: bobClient } = await server.connect(bob);
    await bobClient.request('settings.update', { webAware: true });
    expect(await find()).toBe(true);
    // Ignoring wins over Web Aware: an ignored user must not learn the status from the directory.
    await bobClient.request('ignore.add', { uin: alice.uin });
    expect(await find()).toBe(false);
    await bobClient.request('ignore.remove', { uin: alice.uin });
    expect(await find()).toBe(true);
    await bobClient.request('status.set', { status: 'invisible' });
    expect(await find()).toBe(false);
    bobClient.close();
    await bobClient.closed;
    expect(await find()).toBe(false);
  });
});

describe('profiles and settings', () => {
  it('profile.update edits own details; profile.get of unknown users is not_found', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    const { profile } = await client.request('profile.update', {
      firstName: 'Alice',
      city: 'Tel Aviv',
      age: 25,
      gender: 'female',
      homepage: 'https://example.com',
    });
    expect(profile).toMatchObject({ nickname: 'Alice', firstName: 'Alice', city: 'Tel Aviv', age: 25, gender: 'female' });
    expect((await client.request('profile.get', { uin: alice.uin })).profile).toEqual(profile);
    expect(await client.requestError('profile.get', { uin: 999999 })).toMatchObject({ code: 'not_found' });
    expect(await client.requestError('profile.update', { homepage: 'javascript:alert(1)' })).toMatchObject({
      code: 'bad_request',
    });
  });

  it('settings.update merges preferences and away messages key by key', async () => {
    const alice = await server.createUser('Alice');
    const { client, snapshot } = await server.connect(alice);
    const { settings } = await client.request('settings.update', {
      authRequired: true,
      preferences: { soundsEnabled: false },
      awayMessages: { dnd: 'Leave me alone.' },
    });
    expect(settings).toEqual({
      ...snapshot.settings,
      authRequired: true,
      preferences: { ...DEFAULT_PREFERENCES, soundsEnabled: false },
      awayMessages: { ...snapshot.settings.awayMessages, dnd: 'Leave me alone.' },
    });
    expect((await client.request('session.start', { status: 'online' })).settings).toEqual(settings);
    expect((await client.request('profile.get', { uin: alice.uin })).profile.authRequired).toBe(true);
  });
});
