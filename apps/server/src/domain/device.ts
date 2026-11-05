/** A short device description for "Session List", from the User-Agent header ("Chrome on macOS"). */

const UNKNOWN_DEVICE = 'Unknown device';
const MAX_USER_AGENT = 512;

/** First match wins, so the more specific products come first (Edge and Opera also say Chrome). */
const APPS: readonly (readonly [RegExp, string])[] = [
  [/\bopenICQ\//i, 'openICQ desktop'],
  [/\bElectron\//, 'Desktop app'],
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\b(?:Macintosh|Mac OS X)\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(table: readonly (readonly [RegExp, string])[], userAgent: string): string | null {
  for (const [pattern, name] of table) if (pattern.test(userAgent)) return name;
  return null;
}

export function describeDevice(userAgent: string | undefined): string {
  if (userAgent === undefined) return UNKNOWN_DEVICE;
  const agent = userAgent.slice(0, MAX_USER_AGENT);
  const app = firstMatch(APPS, agent);
  const system = firstMatch(SYSTEMS, agent);
  if (app !== null && system !== null) return `${app} on ${system}`;
  return app ?? system ?? UNKNOWN_DEVICE;
}
