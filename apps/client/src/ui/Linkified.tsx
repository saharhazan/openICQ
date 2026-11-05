import { Fragment } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export interface TextPart {
  text: string;
  href: string | null;
}

/** Splits text into plain parts and http/https links. Nothing else becomes a link. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index;
    let url = match[0];
    const trailing = TRAILING_PUNCTUATION.exec(url);
    if (trailing) url = url.slice(0, url.length - trailing[0].length);
    if (index > last) parts.push({ text: text.slice(last, index), href: null });
    const parsed = URL.canParse(url) ? new URL(url) : null;
    const href = parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
    parts.push({ text: url, href });
    last = index + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });
  return parts;
}

/** Renders message text with safe links; React escapes everything else. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
