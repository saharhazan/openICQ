/**
 * The input (input_widget): Attach, the 18-radius input bubble with
 * "Message", Emoji and stickers, Send. Reply and Edit panels sit above it.
 * Enter sends by default ("Send message by"); drafts are kept per chat.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import { LIMITS, type Chat, type Message } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { replyPreviewOf } from '../../app/ChatCommands';
import { isSendKey } from '../../app/devicePrefs';
import { userName } from '../../state/selectors';
import { composerOf } from '../../state/store';
import { S } from '../../strings';
import { useMenu } from '../../ui/Menu';
import { EmojiPicker } from './EmojiPicker';
import { canEdit } from './messageMenu';

const MAX_INPUT_HEIGHT = 140;

function ReplyPanel({ title, text, onCancel }: { title: string; text: string; onCancel: () => void }) {
  return (
    <div className="input-panel">
      <div className="input-panel-text">
        <span className="input-panel-title">{title}</span>
        <span className="input-panel-quote">{text}</span>
      </div>
      <button type="button" className="icon-button" aria-label={S.input.cancel} onClick={onCancel}>
        <X size={18} />
      </button>
    </div>
  );
}

export function Composer({ chat }: { chat: Chat }) {
  const { store, chats } = useServices();
  const draft = useApp((s) => s.drafts[chat.id] ?? '');
  const composer = useApp((s) => composerOf(s, chat.id));
  const sendKey = useApp((s) => s.prefs.sendKey);
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const [editText, setEditText] = useState<{ id: number; text: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachButton = useRef<HTMLButtonElement>(null);
  const attach = useMenu();
  const editing = composer.editing;
  const text = editing ? (editText?.id === editing.id ? editText.text : editing.text) : draft;

  useEffect(() => {
    input.current?.focus();
  }, [chat.id, editing, composer.replyTo]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_INPUT_HEIGHT, el.scrollHeight)}px`;
  }, [text]);

  const setText = (value: string) => {
    if (editing) setEditText({ id: editing.id, text: value });
    else {
      store.getState().setDraft(chat.id, value);
      if (value.trim() !== '') chats.typing(chat.id);
    }
  };

  const cancel = () => {
    setEditText(null);
    store.getState().setComposer(chat.id, { editing: null, replyTo: null });
  };

  const submit = () => {
    const value = text.trim();
    if (editing) {
      if (value === '' || value === editing.text) {
        cancel();
        return;
      }
      const id = editing.id;
      cancel();
      void chats.edit(id, value);
      return;
    }
    if (value === '') return;
    const reply = composer.replyTo ? replyPreviewOf(composer.replyTo) : null;
    const state = store.getState();
    state.setDraft(chat.id, '');
    state.setComposer(chat.id, { replyTo: null });
    state.patch({ newPlate: null });
    void chats.send(chat.id, value, [], reply);
  };

  const lastOwn = (): Message | undefined => {
    const messages = store.getState().data.histories[chat.id]?.messages ?? [];
    return [...messages].reverse().find((m) => me !== null && canEdit(m, me.uin));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter that confirms an input method candidate is not a send.
    if (event.nativeEvent.isComposing) return;
    if (isSendKey(sendKey, event)) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && (editing || composer.replyTo)) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === 'ArrowUp' && text === '' && !editing) {
      const last = lastOwn();
      if (last) {
        event.preventDefault();
        store.getState().setComposer(chat.id, { editing: last, replyTo: null });
      }
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    store.getState().openDialog({ kind: 'sendFiles', chatId: chat.id, files });
  };

  const insertEmoji = (emoji: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const onFiles = (picker: HTMLInputElement) => {
    const files = [...(picker.files ?? [])];
    // Cleared so that picking the same file again fires a change.
    picker.value = '';
    if (files.length > 0) store.getState().openDialog({ kind: 'sendFiles', chatId: chat.id, files });
  };

  const openAttach = () => {
    if (!attachButton.current) return;
    attach.openBelow(attachButton.current, S.input.attach, [
      { label: S.input.photoOrVideo, onSelect: () => photoInput.current?.click() },
      { label: S.input.file, onSelect: () => fileInput.current?.click() },
    ]);
  };

  const reply = composer.replyTo;
  return (
    <div className="composer">
      {editing && <ReplyPanel title={S.input.editMessage} text={editing.text} onCancel={cancel} />}
      {!editing && reply && (
        <ReplyPanel
          title={userName({ users, me }, reply.sender)}
          text={reply.text || (reply.attachments.length > 0 ? S.recents.file : '')}
          onCancel={() => store.getState().setComposer(chat.id, { replyTo: null })}
        />
      )}
      <div className="composer-row">
        <button ref={attachButton} type="button" className="icon-button composer-side" aria-label={S.input.attach} title={S.input.attach} onClick={openAttach}>
          <Paperclip size={22} />
        </button>
        <div className="input-bubble">
          <textarea
            ref={input}
            className="composer-input"
            aria-label={S.input.placeholder}
            placeholder={S.input.placeholder}
            rows={1}
            maxLength={LIMITS.messageText}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={S.input.emoji}
            title={S.input.emoji}
            aria-expanded={emojiOpen}
            data-emoji-toggle
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smile size={22} />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        </div>
        <button
          type="button"
          className="icon-button composer-side composer-send"
          aria-label={editing ? S.input.edit : S.input.send}
          title={editing ? S.input.edit : S.input.send}
          disabled={text.trim() === ''}
          onClick={submit}
        >
          <SendHorizontal size={22} />
        </button>
      </div>
      <input ref={photoInput} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => onFiles(event.currentTarget)} />
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => onFiles(event.currentTarget)} />
      {attach.menu}
    </div>
  );
}
