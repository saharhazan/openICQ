import { useApp } from '../../app/AppContext';
import { userName } from '../../state/selectors';
import { S } from '../../strings';

const NO_TYPING: readonly number[] = [];

/** "Anna is typing" / "Anna, Ben are typing" for a typing row. */
export function typingText(names: string[]): string {
  if (names.length === 0) return '';
  return `${names.join(', ')} ${names.length === 1 ? S.history.isTyping : S.history.areTyping}`;
}

/** The 32 px row above the input (TypingWidget.cpp): six dot frames in 1000 ms, then the text in typing_text. */
export function TypingRow({ chatId }: { chatId: number }) {
  const typing = useApp((s) => s.data.typing[chatId] ?? NO_TYPING);
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const names = typing.map((uin) => userName({ users, me }, uin).split(' ')[0] ?? '');
  return (
    <div className="typing-row" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="typing-text">{typingText(names)}</span>
        </>
      )}
    </div>
  );
}
