/**
 * General, Notifications, Appearance, Shortcuts and About app
 * (settings/SettingsGeneral.cpp, SettingsNotifications.cpp, SettingsAppearance.cpp,
 * SettingsShortcuts.cpp, SettingsAboutUs.cpp). All values are per device (DevicePrefs).
 */
import { useState } from 'react';
import { Network } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import type { DevicePrefs, FontSize, SendKey, ThemeName } from '../../app/devicePrefs';
import { S } from '../../strings';
import { ActionRow } from '../../ui/Page';
import { RadioList, SwitchRow } from '../../ui/controls';

type BooleanPref = {
  [K in keyof DevicePrefs]: DevicePrefs[K] extends boolean ? K : never;
}[keyof DevicePrefs];

function PrefSwitch({ name, label, disabled }: { name: BooleanPref; label: string; disabled?: boolean }) {
  const value = useApp((s) => s.prefs[name]);
  const setPrefs = useApp((s) => s.setPrefs);
  return <SwitchRow label={label} checked={value} disabled={disabled} onChange={(checked) => setPrefs({ [name]: checked })} />;
}

function Caption({ children }: { children: string }) {
  return <h3 className="section-caption">{children}</h3>;
}

export function GeneralPage() {
  const { bridge } = useServices();
  return (
    <>
      {bridge && (
        <>
          <Caption>{S.settings.application}</Caption>
          <PrefSwitch name="launchAtLogin" label={S.settings.launchAtLogin} />
          <PrefSwitch name="launchMinimized" label={S.settings.launchMinimized} />
        </>
      )}
      <Caption>{S.settings.chat}</Caption>
      {/* Link previews are out of scope for version 1: shown off and locked. */}
      <SwitchRow label={S.settings.previewLinks} checked={false} disabled onChange={() => undefined} />
      {bridge && (
        <ActionRow icon={<Network size={20} />} label={S.settings.connectionSettings} onClick={() => bridge.openConnectionSettings()} />
      )}
    </>
  );
}

export function NotificationsPage() {
  const { bridge, notifier, store } = useServices();
  const showNotifications = useApp((s) => s.prefs.showNotifications);
  const setPrefs = useApp((s) => s.setPrefs);
  const [permission, setPermission] = useState(() => notifier.permission());

  const toggleNotifications = (checked: boolean) => {
    setPrefs({ showNotifications: checked });
    if (!checked || bridge) return;
    notifier
      .requestPermission()
      .then(setPermission)
      .catch((error: unknown) => store.getState().reportError(error));
  };

  const blocked = !bridge && showNotifications && (permission === 'denied' || permission === 'unsupported');
  return (
    <>
      <PrefSwitch name="playSounds" label={S.settings.playSounds} />
      <PrefSwitch name="outgoingSound" label={S.settings.outgoingSound} />
      <SwitchRow
        label={S.settings.showNotifications}
        checked={showNotifications}
        onChange={toggleNotifications}
        hint={blocked ? S.settings.notificationsBlocked : undefined}
      />
      <PrefSwitch name="showInFocus" label={S.settings.showInFocus} disabled={!showNotifications} />
      <PrefSwitch name="hideText" label={S.settings.hideText} />
      <PrefSwitch name="hideSender" label={S.settings.hideSender} />
      {bridge && <PrefSwitch name="animateTaskbar" label={S.settings.animateTaskbar} />}
    </>
  );
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeName; label: string }> = [
  { value: 'green', label: S.settings.green },
  { value: 'dark-green', label: S.settings.darkGreen },
];

const FONT_OPTIONS: ReadonlyArray<{ value: FontSize; label: string }> = [
  { value: 'small', label: S.settings.small },
  { value: 'medium', label: S.settings.medium },
  { value: 'large', label: S.settings.large },
];

export function AppearancePage() {
  const theme = useApp((s) => s.prefs.theme);
  const fontSize = useApp((s) => s.prefs.fontSize);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <>
      <div className="theme-swatches" aria-hidden="true">
        {THEME_OPTIONS.map((option) => (
          <span key={option.value} className={`theme-swatch theme-swatch-${option.value}${theme === option.value ? ' theme-swatch-on' : ''}`} />
        ))}
      </div>
      <RadioList label={S.settings.themes} value={theme} options={THEME_OPTIONS} onChange={(value) => setPrefs({ theme: value })} />
      <RadioList label={S.settings.fontSize} value={fontSize} options={FONT_OPTIONS} onChange={(value) => setPrefs({ fontSize: value })} />
      <Caption>{S.settings.chat}</Caption>
      <PrefSwitch name="compact" label={S.settings.compact} />
    </>
  );
}

const SEND_OPTIONS: ReadonlyArray<{ value: SendKey; label: string }> = [
  { value: 'enter', label: S.settings.enter },
  { value: 'ctrlEnter', label: S.settings.ctrlEnter },
  { value: 'shiftEnter', label: S.settings.shiftEnter },
];

export function ShortcutsPage() {
  const sendKey = useApp((s) => s.prefs.sendKey);
  const setPrefs = useApp((s) => s.setPrefs);
  return <RadioList label={S.settings.sendMessageBy} value={sendKey} options={SEND_OPTIONS} onChange={(value) => setPrefs({ sendKey: value })} />;
}

export function AboutPage() {
  return (
    <div className="about-page">
      <p className="about-name">{S.appName}</p>
      <p>{S.settings.aboutText}</p>
      <p className="about-note">{S.settings.notAffiliated}</p>
      <p className="about-note">{S.settings.license}</p>
    </div>
  );
}
