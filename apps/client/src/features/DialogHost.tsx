/** Renders the one open dialog of the store. */
import { useApp } from '../app/AppContext';
import { ConfirmDialog } from '../ui/Dialog';
import { AddContactDialog } from './contacts/AddContactDialog';
import { DeleteMessagesDialog } from './conversation/DeleteMessagesDialog';
import { ForwardDialog } from './conversation/ForwardDialog';
import { ImageViewer } from './conversation/ImageViewer';
import { SendFilesDialog } from './conversation/SendFilesDialog';
import { AddMembersDialog } from './groups/AddMembersDialog';
import { CreateGroupDialog } from './groups/CreateGroupDialog';
import { JoinDialog } from './groups/JoinDialog';

export function DialogHost() {
  const dialog = useApp((s) => s.dialog);
  const close = useApp((s) => s.closeDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'confirm':
      return <ConfirmDialog {...dialog.spec} onClose={close} />;
    case 'addContact':
      return <AddContactDialog onClose={close} />;
    case 'createGroup':
      return <CreateGroupDialog onClose={close} />;
    case 'addMembers':
      return <AddMembersDialog chatId={dialog.chatId} onClose={close} />;
    case 'forward':
      return <ForwardDialog fromChatId={dialog.fromChatId} messageIds={dialog.messageIds} onClose={close} />;
    case 'deleteMessages':
      return <DeleteMessagesDialog chatId={dialog.chatId} messageIds={dialog.messageIds} onClose={close} />;
    case 'image':
      return <ImageViewer fileId={dialog.fileId} name={dialog.name} onClose={close} />;
    case 'sendFiles':
      return <SendFilesDialog chatId={dialog.chatId} files={dialog.files} onClose={close} />;
    case 'join':
      return <JoinDialog token={dialog.token} onClose={close} />;
  }
}
