/** Dates, times and presence lines as ICQ New wrote them (gui.shared/translator_base.cpp, types/lastseen.cpp). */
import { S, fmt } from '../strings';
import type { Presence } from './protocolTypes';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `date` to `now` (0 today, 1 yesterday). */
export function daysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Nov 5" in the current year, "Nov 5, 2025" otherwise (the English date formats of the original). */
export function formatDate(date: Date, now: Date): string {
  const month = MONTHS[date.getMonth()] ?? '';
  return date.getFullYear() === now.getFullYear() ? `${month} ${date.getDate()}` : `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Chat list time: the time today, "yesterday", then the date. */
export function formatListTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = daysBetween(date, now);
  if (days === 0) return formatTime(date);
  if (days === 1) return S.recents.yesterday;
  return formatDate(date, now);
}

/** Date pill: Today, Yesterday, or the date. */
export function formatDatePill(date: Date, now: Date): string {
  const days = daysBetween(date, now);
  if (days === 0) return S.history.today;
  if (days === 1) return S.history.yesterday;
  return formatDate(date, now);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Online", "Seen just now", "Seen 5 minutes ago", "Seen yesterday at 14:05", "Has never been here". */
export function formatPresence(presence: Presence, now: Date): string {
  if (presence.online) return S.presence.online;
  if (presence.lastSeen === null) return S.presence.neverBeenHere;
  const seen = new Date(presence.lastSeen);
  const seconds = Math.max(0, (now.getTime() - seen.getTime()) / 1000);
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    if (minutes <= 0) return S.presence.seen + S.presence.justNow;
    return S.presence.seen + fmt(minutes === 1 ? S.presence.minuteAgo : S.presence.minutesAgo, minutes);
  }
  const days = daysBetween(seen, now);
  const sameYear = seen.getFullYear() === now.getFullYear();
  let text: string;
  if (days === 0) text = S.presence.today;
  else if (days === 1) text = S.presence.yesterday;
  else if (days < 7) text = S.presence.weekdays[seen.getDay()] ?? formatDate(seen, now);
  else text = formatDate(seen, now);
  if (sameYear || days < 7) text += S.presence.at + formatTime(seen);
  return S.presence.seen + text;
}

/** "1.2 MB" style sizes for file cards. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit] ?? 'GB'}`;
}
