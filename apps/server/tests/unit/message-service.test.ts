import type { Message } from '@openicq/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatEvents } from '../../src/application/chat-events.ts';
import { EMPTY_MESSAGE, MessageService, type FileCleanup } from '../../src/application/message-service.ts';
import { MESSAGES } from '../../src/application/support.ts';
import type { ViewBuilder } from '../../src/application/views.ts';
import {
  chat,
  file,
  fixedClock,
  immediateTransactions,
  member,
  message,
  mockBlocks,
  mockChats,
  mockFiles,
  mockMessages,
  strictMock,
} from './mocks.ts';

const ALICE = 100000;
const BOB = 100001;
const ACTOR = { uin: ALICE, connectionId: 'c1' };

describe('MessageService', () => {
  let chats: ReturnType<typeof mockChats>;
  let messages: ReturnType<typeof mockMessages>;
  let files: ReturnType<typeof mockFiles>;
  let blocks: ReturnType<typeof mockBlocks>;
  let events: ReturnType<typeof strictMock<ChatEvents>>;
  let views: ReturnType<typeof strictMock<ViewBuilder>>;
  let fileCleanup: ReturnType<typeof strictMock<FileCleanup>>;
  let service: MessageService;

  beforeEach(() => {
    chats = mockChats();
    messages = mockMessages();
    files = mockFiles();
    blocks = mockBlocks();
    events = strictMock<ChatEvents>('events', ['newMessage', 'messageUpdated', 'toUser', 'chatUpdated']);
    views = strictMock<ViewBuilder>('views', ['message', 'messages']);
    fileCleanup = strictMock<FileCleanup>('fileCleanup', ['removeUnreferenced']);
    service = new MessageService({
      chats,
      messages,
      files,
      blocks,
      // The strict mocks carry every method the service calls; the classes' private fields are irrelevant here.
      views: views as unknown as ViewBuilder,
      events: events as unknown as ChatEvents,
      fileCleanup,
      transactions: immediateTransactions,
      clock: fixedClock(),
    });
    chats.findById.mockReturnValue(chat(1, { pair: [ALICE, BOB] }));
    chats.findMember.mockReturnValue(member(1, ALICE));
    blocks.isBlocking.mockReturnValue(false);
    views.message.mockImplementation((_viewer, record) => ({ id: record.id }) as Message);
  });

  describe('send', () => {
    it('stores the message, shows the chat again and pushes it to everyone but the sending connection', () => {
      messages.create.mockImplementation((input) => ({ ...input, id: 9, editedAt: null, deleted: false }));
      messages.attachFiles.mockReturnValue(undefined);
      chats.touch.mockReturnValue(undefined);
      chats.unhideAll.mockReturnValue(undefined);
      events.newMessage.mockReturnValue(undefined);

      expect(service.send(ACTOR, { chatId: 1, clientId: 'x', text: 'hi', attachmentFileIds: [] })).toEqual({ id: 9 });
      expect(chats.unhideAll).toHaveBeenCalledWith(1);
      expect(events.newMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 9, text: 'hi', clientId: 'x' }), 'c1');
    });

    it('refuses read-only members and blocked direct chats', () => {
      chats.findMember.mockReturnValue(member(1, ALICE, { role: 'readonly' }));
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: 'hi', attachmentFileIds: [] })).toThrow(MESSAGES.writeForbidden);

      chats.findMember.mockReturnValue(member(1, ALICE));
      blocks.isBlocking.mockImplementation((owner, blocked) => owner === BOB && blocked === ALICE);
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: 'hi', attachmentFileIds: [] })).toThrow(MESSAGES.writeForbidden);
      expect(messages.create).not.toHaveBeenCalled();
    });

    it('needs text or a file and only accepts own attachment uploads', () => {
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: ' \n ', attachmentFileIds: [] })).toThrow(EMPTY_MESSAGE);
      files.findById.mockReturnValue(file(5, BOB));
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: '', attachmentFileIds: [5] })).toThrow(MESSAGES.fileNotFound);
      files.findById.mockReturnValue(file(5, ALICE, { purpose: 'avatar' }));
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: '', attachmentFileIds: [5] })).toThrow(MESSAGES.fileNotFound);
    });

    it('replies only within the same chat', () => {
      messages.findById.mockReturnValue(message(3, 2, BOB));
      expect(() => service.send(ACTOR, { chatId: 1, clientId: 'x', text: 'hi', replyToId: 3, attachmentFileIds: [] })).toThrow(
        /same chat/,
      );
    });
  });

  describe('forward', () => {
    it('names the original author and keeps the original order', () => {
      messages.findMany.mockReturnValue([message(4, 1, BOB, { forwardedFrom: 100005 }), message(2, 1, BOB)]);
      messages.hiddenFor.mockReturnValue(new Set());
      messages.attachmentsOf.mockReturnValue(new Map([[2, [file(8, BOB)]]]));
      let next = 20;
      messages.create.mockImplementation((input) => ({ ...input, id: next++, editedAt: null, deleted: false }));
      messages.attachFiles.mockReturnValue(undefined);
      chats.touch.mockReturnValue(undefined);
      chats.unhideAll.mockReturnValue(undefined);
      events.newMessage.mockReturnValue(undefined);
      views.messages.mockImplementation((_viewer, records) => records.map((record) => ({ id: record.id }) as Message));

      service.forward(ACTOR, 1, [4, 2], 1);
      expect(messages.create.mock.calls.map(([input]) => input.forwardedFrom)).toEqual([100005, BOB]);
      expect(messages.attachFiles).toHaveBeenCalledWith(21, [8]);
    });

    it('refuses messages the forwarder cannot see', () => {
      messages.findMany.mockReturnValue([message(4, 1, BOB)]);
      messages.hiddenFor.mockReturnValue(new Set([4]));
      expect(() => service.forward(ACTOR, 1, [4], 1)).toThrow(MESSAGES.messageNotFound);
    });
  });

  describe('delete', () => {
    it('for me hides the messages and tells my other devices', async () => {
      messages.findMany.mockReturnValue([message(4, 1, BOB)]);
      messages.hiddenFor.mockReturnValue(new Set());
      messages.hide.mockReturnValue(undefined);
      events.toUser.mockReturnValue(undefined);
      events.chatUpdated.mockReturnValue(undefined);
      await service.delete(ACTOR, { chatId: 1, messageIds: [4], forAll: false });
      expect(messages.hide).toHaveBeenCalledWith(ALICE, [4]);
      expect(events.toUser).toHaveBeenCalledWith(ALICE, { type: 'messages.removed', chatId: 1, messageIds: [4] }, 'c1');
    });

    it('for all is refused on messages of others in a direct chat and allowed to group admins', async () => {
      messages.findMany.mockReturnValue([message(4, 1, BOB)]);
      messages.hiddenFor.mockReturnValue(new Set());
      await expect(service.delete(ACTOR, { chatId: 1, messageIds: [4], forAll: true })).rejects.toThrow(/own messages/);
      messages.attachmentsOf.mockReturnValue(new Map());
      fileCleanup.removeUnreferenced.mockResolvedValue(undefined);

      chats.findById.mockReturnValue(chat(1, { type: 'group', pair: null }));
      chats.findMember.mockReturnValue(member(1, ALICE, { role: 'admin' }));
      messages.tombstone.mockImplementation((id) => message(id, 1, BOB, { deleted: true, text: '' }));
      events.messageUpdated.mockReturnValue(undefined);
      await service.delete(ACTOR, { chatId: 1, messageIds: [4], forAll: true });
      expect(events.messageUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 4, deleted: true }), 'c1');
    });

    it('for all hands the files of the tombstoned messages to the cleanup, once each, after the events', async () => {
      messages.findMany.mockReturnValue([message(4, 1, ALICE), message(5, 1, ALICE), message(6, 1, ALICE, { deleted: true })]);
      messages.hiddenFor.mockReturnValue(new Set());
      messages.attachmentsOf.mockReturnValue(
        new Map([
          [4, [file(20, ALICE), file(21, ALICE)]],
          [5, [file(21, ALICE)]],
        ]),
      );
      messages.tombstone.mockImplementation((id) => message(id, 1, ALICE, { deleted: true, text: '' }));
      events.messageUpdated.mockReturnValue(undefined);
      fileCleanup.removeUnreferenced.mockResolvedValue(undefined);
      await service.delete(ACTOR, { chatId: 1, messageIds: [4, 5, 6], forAll: true });
      expect(messages.attachmentsOf).toHaveBeenCalledWith([4, 5]);
      expect(messages.tombstone.mock.calls.map(([id]) => id)).toEqual([4, 5]);
      expect(fileCleanup.removeUnreferenced).toHaveBeenCalledWith([20, 21]);
      expect(fileCleanup.removeUnreferenced.mock.invocationCallOrder[0]).toBeGreaterThan(
        events.messageUpdated.mock.invocationCallOrder.at(-1) ?? Infinity,
      );
    });
  });

  describe('edit and react', () => {
    beforeEach(() => {
      // The visibility check looks the message up again; answer with whatever findById returns.
      messages.findMany.mockImplementation((ids) => ids.flatMap((id) => messages.findById(id) ?? []));
      messages.hiddenFor.mockReturnValue(new Set());
    });

    it('edits only own, live, non-service messages', () => {
      messages.findById.mockReturnValue(message(4, 1, BOB));
      expect(() => service.edit(ACTOR, 4, 'x')).toThrow(/own messages/);
      messages.findById.mockReturnValue(message(4, 1, ALICE, { event: { type: 'renamed', target: null, value: 'x' } }));
      expect(() => service.edit(ACTOR, 4, 'x')).toThrow(/service messages/);
    });

    it('lets read-only members react, and takes a reaction back with null', () => {
      chats.findMember.mockReturnValue(member(1, ALICE, { role: 'readonly' }));
      chats.findById.mockReturnValue(chat(1, { type: 'group', pair: null }));
      messages.findById.mockReturnValue(message(4, 1, BOB));
      messages.setReaction.mockReturnValue(undefined);
      messages.removeReaction.mockReturnValue(undefined);
      events.messageUpdated.mockReturnValue(undefined);
      service.react(ACTOR, 4, 'like');
      expect(messages.setReaction).toHaveBeenCalledWith(4, ALICE, 'like', expect.any(String));
      service.react(ACTOR, 4, null);
      expect(messages.removeReaction).toHaveBeenCalledWith(4, ALICE);
      expect(events.messageUpdated).toHaveBeenCalledTimes(2);
    });
  });
});
