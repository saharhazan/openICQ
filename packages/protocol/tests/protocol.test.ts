import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  REACTIONS,
  REQUEST_TYPES,
  clientFrameSchema,
  isRequestType,
  loginBodySchema,
  messageSchema,
  nicknameSchema,
  profileUpdateSchema,
  registerBodySchema,
  requestPayloadSchemas,
  requestResultSchemas,
  serverEventSchema,
  singleLine,
  multiLine,
} from '../src/index.ts';

describe('nicknames (ICQ New rules)', () => {
  it('accepts 5 to 30 characters of a-z, 0-9, dot and underscore, starting with a letter, in lower case', () => {
    expect(nicknameSchema.parse('  Alice.Smith_1 ')).toBe('alice.smith_1');
    for (const bad of ['abcd', 'a'.repeat(31), '1alice', '_alice', 'alice-smith', 'alice smith', 'alicé1']) {
      expect(nicknameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('text fields', () => {
  it('single-line text is trimmed and refuses control characters; multi-line keeps newlines', () => {
    expect(singleLine(10).parse('  Bob ')).toBe('Bob');
    expect(singleLine(10).safeParse('a\nb').success).toBe(false);
    expect(multiLine(20).parse('line 1\nline 2\t!')).toBe('line 1\nline 2\t!');
    expect(multiLine(20).safeParse('bell\u0007').success).toBe(false);
  });

  it('a message may be up to 10,000 characters and must not be empty when edited', () => {
    const send = requestPayloadSchemas['message.send'];
    expect(send.safeParse({ chatId: 1, clientId: 'c1', text: 'x'.repeat(LIMITS.messageText) }).success).toBe(true);
    expect(send.safeParse({ chatId: 1, clientId: 'c1', text: 'x'.repeat(LIMITS.messageText + 1) }).success).toBe(false);
    expect(requestPayloadSchemas['message.edit'].safeParse({ messageId: 1, text: '' }).success).toBe(false);
  });
});

describe('auth bodies', () => {
  it('signs up with a first name and a password; nickname and email are optional', () => {
    expect(registerBodySchema.parse({ firstName: 'Alice', password: 'secret123' })).toEqual({
      firstName: 'Alice',
      lastName: '',
      nickname: null,
      email: '',
      password: 'secret123',
    });
    expect(registerBodySchema.safeParse({ firstName: '', password: 'secret123' }).success).toBe(false);
    expect(registerBodySchema.safeParse({ firstName: 'A', password: 'short' }).success).toBe(false);
    expect(registerBodySchema.parse({ firstName: 'A', password: 'secret123', email: 'A@Example.COM' }).email).toBe('a@example.com');
  });

  it('signs in with an ICQ# or an email, keeping the session by default', () => {
    expect(loginBodySchema.parse({ login: ' 100000 ', password: 'x' })).toEqual({ login: '100000', password: 'x', keepSignedIn: true });
  });
});

describe('requests', () => {
  it('has a result schema for every request type', () => {
    expect(Object.keys(requestResultSchemas).sort()).toEqual([...REQUEST_TYPES].sort());
    expect(isRequestType('message.send')).toBe(true);
    expect(isRequestType('toString')).toBe(false);
  });

  it('applies defaults', () => {
    expect(requestPayloadSchemas['chat.history'].parse({ chatId: 3 })).toEqual({ chatId: 3, limit: LIMITS.historyPageDefault });
    expect(requestPayloadSchemas['message.send'].parse({ chatId: 3, clientId: 'c', text: 'hi' }).attachmentFileIds).toEqual([]);
    expect(requestPayloadSchemas['group.create'].parse({ name: 'Friends' })).toEqual({
      name: 'Friends',
      about: '',
      avatarFileId: null,
      memberUins: [],
      joinWithApproval: false,
      public: false,
    });
  });

  it('closes one session or all the others, nothing in between', () => {
    const close = requestPayloadSchemas['sessions.close'];
    expect(close.safeParse({ sessionId: 4 }).success).toBe(true);
    expect(close.safeParse({ others: true }).success).toBe(true);
    expect(close.safeParse({}).success).toBe(false);
    expect(close.safeParse({ sessionId: 4, others: true }).success).toBe(false);
  });

  it('profile updates are partial and strict', () => {
    expect(profileUpdateSchema.parse({ about: 'Hi' })).toEqual({ about: 'Hi' });
    expect(profileUpdateSchema.safeParse({ uin: 1 }).success).toBe(false);
    expect(profileUpdateSchema.parse({ nickname: null })).toEqual({ nickname: null });
  });

  it('only the six ICQ New reactions exist', () => {
    expect(REACTIONS).toEqual(['like', 'super', 'funny', 'oops', 'sad', 'scandalous']);
    expect(requestPayloadSchemas['message.react'].safeParse({ messageId: 1, reaction: 'heart' }).success).toBe(false);
    expect(requestPayloadSchemas['message.react'].safeParse({ messageId: 1, reaction: null }).success).toBe(true);
  });
});

describe('wire', () => {
  const message = {
    id: 7,
    chatId: 2,
    sender: 100000,
    clientId: null,
    text: 'Hello',
    event: null,
    replyTo: null,
    forwardedFrom: null,
    attachments: [],
    reactions: [{ reaction: 'like', count: 2, mine: true }],
    editedAt: null,
    deleted: false,
    sentAt: '2026-11-05T10:00:00.000Z',
  };

  it('parses a message and a typing event', () => {
    expect(messageSchema.parse(message)).toEqual(message);
    expect(serverEventSchema.parse({ type: 'typing', chatId: 2, uin: 100001 })).toEqual({ type: 'typing', chatId: 2, uin: 100001 });
    expect(serverEventSchema.safeParse({ type: 'kicked' }).success).toBe(false);
  });

  it('frames carry an id, a type and any payload', () => {
    expect(clientFrameSchema.parse({ id: '1', type: 'ping', payload: {} })).toEqual({ id: '1', type: 'ping', payload: {} });
    expect(clientFrameSchema.safeParse({ id: '', type: 'ping', payload: {} }).success).toBe(false);
  });
});
