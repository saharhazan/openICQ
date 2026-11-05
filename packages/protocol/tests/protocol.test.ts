import { describe, expect, it } from 'vitest';
import {
  REQUEST_TYPES,
  clientFrameSchema,
  hasStatusMessage,
  isAwayStatus,
  isRequestType,
  registerBodySchema,
  requestPayloadSchemas,
  requestResultSchemas,
  serverFrameSchema,
} from '../src/index.ts';

describe('request maps', () => {
  it('every request type has a result schema', () => {
    for (const type of REQUEST_TYPES) {
      expect(requestResultSchemas[type]).toBeDefined();
    }
  });

  it('recognises known request types only', () => {
    expect(isRequestType('message.send')).toBe(true);
    expect(isRequestType('toString')).toBe(false);
    expect(isRequestType('nope')).toBe(false);
  });
});

describe('payload validation', () => {
  it('rejects an empty message', () => {
    expect(requestPayloadSchemas['message.send'].safeParse({ to: 123456, text: '   ' }).success).toBe(false);
  });

  it('accepts multi-line messages but rejects control characters', () => {
    expect(requestPayloadSchemas['message.send'].safeParse({ to: 123456, text: 'hi\nthere' }).success).toBe(true);
    expect(requestPayloadSchemas['message.send'].safeParse({ to: 123456, text: 'bad\u0007bell' }).success).toBe(false);
  });

  it('rejects UINs below the minimum', () => {
    expect(requestPayloadSchemas['profile.get'].safeParse({ uin: 42 }).success).toBe(false);
  });

  it('does not allow offline as a settable status', () => {
    expect(requestPayloadSchemas['status.set'].safeParse({ status: 'offline' }).success).toBe(false);
    expect(requestPayloadSchemas['status.set'].safeParse({ status: 'invisible' }).success).toBe(true);
  });

  it('requires at least one field for a details search', () => {
    expect(requestPayloadSchemas['search.users'].safeParse({ by: 'details' }).success).toBe(false);
    expect(requestPayloadSchemas['search.users'].safeParse({ by: 'details', nickname: 'neo' }).success).toBe(true);
  });

  it('applies defaults to the registration body', () => {
    const parsed = registerBodySchema.parse({ nickname: ' Neo ', password: 'secret1' });
    expect(parsed).toMatchObject({ nickname: 'Neo', email: '', authRequired: false });
  });
});

describe('frames', () => {
  it('parses a client frame', () => {
    expect(clientFrameSchema.safeParse({ id: '1', type: 'ping', payload: {} }).success).toBe(true);
  });

  it('parses an event frame and rejects unknown events', () => {
    expect(serverFrameSchema.safeParse({ kind: 'event', event: { type: 'presence', uin: 123456, status: 'away' } }).success).toBe(true);
    expect(serverFrameSchema.safeParse({ kind: 'event', event: { type: 'bogus' } }).success).toBe(false);
  });
});

describe('limits', () => {
  it('enforces the original 450 character server limit', () => {
    expect(requestPayloadSchemas['message.send'].safeParse({ to: 123456, text: 'x'.repeat(450) }).success).toBe(true);
    expect(requestPayloadSchemas['message.send'].safeParse({ to: 123456, text: 'x'.repeat(451) }).success).toBe(false);
  });

  it('defaults urgent to false', () => {
    expect(requestPayloadSchemas['message.send'].parse({ to: 123456, text: 'hi' }).urgent).toBe(false);
  });
});

describe('statuses', () => {
  it('classifies away-like statuses', () => {
    expect(isAwayStatus('away')).toBe(true);
    expect(isAwayStatus('dnd')).toBe(true);
    expect(isAwayStatus('online')).toBe(false);
    expect(isAwayStatus('invisible')).toBe(false);
    expect(isAwayStatus('ffc')).toBe(false);
  });

  it('Free For Chat carries a status message', () => {
    expect(hasStatusMessage('ffc')).toBe(true);
    expect(hasStatusMessage('away')).toBe(true);
    expect(hasStatusMessage('online')).toBe(false);
  });
});
