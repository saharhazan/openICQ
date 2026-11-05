import { Check, CheckCheck, CircleAlert, Clock3 } from 'lucide-react';

export type TickKind = 'pending' | 'failed' | 'sent' | 'delivered';

/**
 * Delivery marks (resources/message_statuses): a clock while sending, one check
 * at the server, two checks at the recipient. 16 x 16 in base_primary.
 * `data-tick` names the state for tests; the icons are decorative.
 */
export function TickIcon({ tick, size = 16 }: { tick: TickKind; size?: number }) {
  const props = { size, strokeWidth: 2, 'aria-hidden': true } as const;
  return (
    <span className={`tick tick-${tick}`} data-tick={tick}>
      {tick === 'pending' && <Clock3 {...props} />}
      {tick === 'failed' && <CircleAlert {...props} />}
      {tick === 'sent' && <Check {...props} />}
      {tick === 'delivered' && <CheckCheck {...props} />}
    </span>
  );
}
