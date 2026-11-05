/**
 * "Send files" (FilesWidget.cpp): the picked or dropped files with previews,
 * "Add caption", Cancel and Send. More than 10 files go out as several
 * messages; the caption stays with the first one.
 */
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { LIMITS } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { toLocalAttachment } from '../../app/attachments';
import { replyPreviewOf } from '../../app/ChatCommands';
import { formatSize } from '../../state/format';
import { composerOf } from '../../state/store';
import type { LocalAttachment } from '../../state/types';
import { S } from '../../strings';
import { Button, Dialog } from '../../ui/Dialog';
import './overlays.css';

/** Splits files into messages of at most `size` attachments. */
export function batches<T>(items: readonly T[], size: number = LIMITS.attachmentsPerMessage): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/** openICQ: the original showed a size error toast without a fixed string. */
const TOO_LARGE = 'The file is larger than 100 MB and was not added: %1';

export function tooLargeText(name: string): string {
  return TOO_LARGE.replace('%1', name);
}

/** Keeps files within the upload limit and reports each one left out. */
export function acceptFiles(files: readonly File[], onRejected: (name: string) => void): File[] {
  return files.filter((file) => {
    if (file.size <= LIMITS.fileMaxBytes) return true;
    onRejected(file.name);
    return false;
  });
}

export function SendFilesDialog({ chatId, files, onClose }: { chatId: number; files: File[]; onClose: () => void }) {
  const { store, chats } = useServices();
  const reply = useApp((s) => composerOf(s, chatId).replyTo);
  const [caption, setCaption] = useState('');
  const [previews, setPreviews] = useState<LocalAttachment[] | null>(null);
  const accepted = files.filter((file) => file.size <= LIMITS.fileMaxBytes);

  useEffect(() => {
    const kept = acceptFiles(files, (name) => store.getState().toast(tooLargeText(name), 'error'));
    let alive = true;
    const report = (error: Error) => store.getState().reportError(error);
    void Promise.all(kept.map((file) => toLocalAttachment(file, report))).then((list) => {
      if (alive) setPreviews(list);
    });
    return () => {
      alive = false;
    };
  }, [files, store]);

  const send = () => {
    const groups = batches(accepted);
    const replyPreview = reply ? replyPreviewOf(reply) : null;
    store.getState().setComposer(chatId, { replyTo: null });
    onClose();
    const ready = previews && previews.length === accepted.length ? previews : null;
    groups.forEach((group, index) => {
      const start = index * LIMITS.attachmentsPerMessage;
      const options = ready ? { previews: ready.slice(start, start + group.length) } : {};
      void chats.send(chatId, index === 0 ? caption.trim() : '', group, index === 0 ? replyPreview : null, options);
    });
  };

  return (
    <Dialog
      title={S.files.sendFiles}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.files.cancel}
          </Button>
          <Button onClick={send} disabled={accepted.length === 0}>
            {S.files.send}
          </Button>
        </>
      }
    >
      <ul className="send-files">
        {accepted.map((file, index) => {
          const preview = previews?.[index];
          return (
            <li key={`${file.name}-${index}`} className="send-file">
              {preview?.previewUrl ? (
                <img className="send-file-thumb" src={preview.previewUrl} alt="" />
              ) : (
                <span className="file-icon" aria-hidden="true">
                  <FileText size={22} />
                </span>
              )}
              <span className="file-text">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatSize(file.size)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <label className="caption-field">
        <span className="visually-hidden">{S.files.addCaption}</span>
        <textarea
          rows={2}
          placeholder={S.files.addCaption}
          value={caption}
          maxLength={LIMITS.messageText}
          onChange={(event) => setCaption(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (accepted.length > 0) send();
            }
          }}
        />
      </label>
    </Dialog>
  );
}
