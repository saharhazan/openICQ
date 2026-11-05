import type { ReactNode } from 'react';
import type { WindowState } from '../state/windows';
import { AddUserWizard } from './add-user/AddUserWizard';
import { AuthRequestDialog } from './add-user/AuthRequestDialog';
import { AwayMessageDialog } from './away/AwayMessageDialog';
import { ReadAwayDialog } from './away/ReadAwayDialog';
import { ConfirmDialog } from './confirm/ConfirmDialog';
import { ContactListWindow } from './contact-list/ContactListWindow';
import { HistoryWindow } from './history/HistoryWindow';
import { LoginWindow } from './login/LoginWindow';
import { AutoResponseDialog } from './message/AutoResponseDialog';
import { MessageDialog } from './message/MessageDialog';
import { NoticeWindow } from './notices/NoticeWindow';
import { PreferencesWindow } from './preferences/PreferencesWindow';
import { SecurityWindow } from './preferences/SecurityWindow';
import { RegistrationWizard } from './registration/RegistrationWizard';
import { AboutDialog, ConfirmShutDownDialog, ErrorDialog, KickedDialog } from './system/SystemDialogs';
import { UserDetailsWindow } from './user-details/UserDetailsWindow';

/** Maps one window of the store to its ICQ component. */
export function renderWindow(win: WindowState): ReactNode {
  const { id, spec } = win;
  switch (spec.kind) {
    case 'login':
      return <LoginWindow windowId={id} />;
    case 'register':
      return <RegistrationWizard windowId={id} />;
    case 'contactList':
      return <ContactListWindow windowId={id} />;
    case 'message':
      return <MessageDialog windowId={id} uin={spec.uin} />;
    case 'history':
      return <HistoryWindow windowId={id} uin={spec.uin} />;
    case 'userDetails':
      return <UserDetailsWindow windowId={id} uin={spec.uin} />;
    case 'readAway':
      return <ReadAwayDialog windowId={id} uin={spec.uin} />;
    case 'autoResponse':
      return <AutoResponseDialog windowId={id} uin={spec.uin} status={spec.status} text={spec.text} />;
    case 'awayMessage':
      return <AwayMessageDialog windowId={id} status={spec.status} />;
    case 'addUser':
      return <AddUserWizard windowId={id} />;
    case 'authRequest':
      return <AuthRequestDialog windowId={id} uin={spec.uin} nickname={spec.nickname} mode={spec.mode} authRequired={spec.authRequired} />;
    case 'notice':
      return <NoticeWindow windowId={id} noticeId={spec.noticeId} />;
    case 'preferences':
      return <PreferencesWindow windowId={id} />;
    case 'security':
      return <SecurityWindow windowId={id} tab={spec.tab} />;
    case 'confirm':
      return <ConfirmDialog windowId={id} action={spec.action} uin={spec.uin} />;
    case 'kicked':
      return <KickedDialog windowId={id} />;
    case 'about':
      return <AboutDialog windowId={id} />;
    case 'confirmShutDown':
      return <ConfirmShutDownDialog windowId={id} />;
    case 'error':
      return <ErrorDialog windowId={id} errorId={spec.errorId} />;
  }
}
