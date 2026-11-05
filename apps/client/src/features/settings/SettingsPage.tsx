/** The open settings page in the main area. */
import type { SettingsPage as PageName } from '../../state/store';
import { S } from '../../strings';
import { Page } from '../../ui/Page';
import { MyProfilePage } from '../profile/MyProfilePage';
import { AboutPage, AppearancePage, GeneralPage, NotificationsPage, ShortcutsPage } from './SimplePages';
import { PrivacyPage } from './PrivacyPage';
import './settings.css';

const TITLES: Record<PageName, string> = {
  profile: S.settings.myProfile,
  general: S.settings.general,
  notifications: S.settings.notifications,
  privacy: S.settings.privacy,
  appearance: S.settings.appearance,
  shortcuts: S.settings.shortcuts,
  about: S.settings.about,
};

function Content({ page }: { page: PageName }) {
  switch (page) {
    case 'profile':
      return <MyProfilePage />;
    case 'general':
      return <GeneralPage />;
    case 'notifications':
      return <NotificationsPage />;
    case 'privacy':
      return <PrivacyPage />;
    case 'appearance':
      return <AppearancePage />;
    case 'shortcuts':
      return <ShortcutsPage />;
    case 'about':
      return <AboutPage />;
  }
}

export function SettingsPage({ page }: { page: PageName }) {
  return (
    <Page title={TITLES[page]}>
      <div className="settings-page">
        <Content page={page} />
      </div>
    </Page>
  );
}
