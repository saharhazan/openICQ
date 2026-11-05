/**
 * "Emoji and stickers" (smiles_menu): RECENTS, then EMOJI by category, with a
 * category bar. System emoji fonts draw them; the data comes from emojibase.
 * Stickers are out of scope.
 */
import { useEffect, useRef, useState } from 'react';
import { Apple, Clock, Flag, Heart, Leaf, Lightbulb, Plane, Smile, Trophy, type LucideIcon } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { S } from '../../strings';
import { EMOJI_CATEGORIES, emojiFromHex, loadEmojiSet, type EmojiCategory, type EmojiSet } from './emojiData';
import './overlays.css';

const CATEGORY_ICONS: Record<EmojiCategory, LucideIcon> = {
  people: Smile,
  nature: Leaf,
  food: Apple,
  activity: Trophy,
  travel: Plane,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

/** openICQ: the original category tabs were icons without text. */
const CATEGORY_LABELS: Record<EmojiCategory, string> = {
  people: 'People',
  nature: 'Nature',
  food: 'Food',
  activity: 'Activity',
  travel: 'Travel',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

const MAX_RECENT = 40;

/** The hexcode of exactly this emoji text (keeps FE0F, unlike some dataset hexcodes). */
export function hexOf(unicode: string): string {
  return [...unicode].map((char) => (char.codePointAt(0) ?? 0).toString(16).toUpperCase()).join('-');
}

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const recent = useApp((s) => s.prefs.recentEmoji);
  const setPrefs = useApp((s) => s.setPrefs);
  const [set, setSet] = useState<EmojiSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadEmojiSet().then(
      (loaded) => {
        if (alive) setSet(loaded);
      },
      (failure: unknown) => {
        if (alive) setError(failure instanceof Error ? failure.message : S.dialogs.errorOccurred);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[data-emoji-toggle]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pick = (unicode: string) => {
    const hex = hexOf(unicode);
    setPrefs({ recentEmoji: [hex, ...recent.filter((h) => h !== hex)].slice(0, MAX_RECENT) });
    onPick(unicode);
  };

  const jump = (category: EmojiCategory | 'recents') => {
    body.current?.querySelector(`[data-category="${category}"]`)?.scrollIntoView({ block: 'start' });
  };

  const button = (unicode: string, label: string, key: string) => (
    <button key={key} type="button" className="emoji-cell" aria-label={label} title={label} onClick={() => pick(unicode)}>
      {unicode}
    </button>
  );

  return (
    <div ref={ref} className="emoji-picker" role="dialog" aria-label={S.input.emoji}>
      <div ref={body} className="emoji-body">
        {recent.length > 0 && (
          <section data-category="recents">
            <h3 className="emoji-caption">{S.input.recentsTab}</h3>
            <div className="emoji-grid">{recent.map((hex) => button(emojiFromHex(hex), hex, `r-${hex}`))}</div>
          </section>
        )}
        <h3 className="emoji-caption">{S.input.emojiTab}</h3>
        {error && <p className="error-text emoji-status">{error}</p>}
        {!set && !error && <p className="emoji-status" aria-busy="true" />}
        {set &&
          EMOJI_CATEGORIES.map((category) => (
            <section key={category} data-category={category} aria-label={CATEGORY_LABELS[category]}>
              <div className="emoji-grid">{set[category].map((entry) => button(entry.unicode, entry.label, entry.hexcode))}</div>
            </section>
          ))}
      </div>
      <div className="emoji-tabs">
        {recent.length > 0 && (
          <button type="button" className="icon-button" aria-label={S.input.recentsTab} onClick={() => jump('recents')}>
            <Clock size={18} />
          </button>
        )}
        {EMOJI_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <button key={category} type="button" className="icon-button" aria-label={CATEGORY_LABELS[category]} onClick={() => jump(category)}>
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
