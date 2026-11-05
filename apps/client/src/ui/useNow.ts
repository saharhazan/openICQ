import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` (times like "yesterday" and "Seen 5 minutes ago" stay right). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
