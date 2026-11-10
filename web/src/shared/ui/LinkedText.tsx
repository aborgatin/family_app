import type { MouseEvent } from 'react';

interface LinkedTextProps {
  /** Plain text; its http(s) addresses become links. */
  text: string;
}

/**
 * Plain text whose http(s) addresses are links in `accent` that open in a new tab (an Item's
 * Description). A click on a link doesn't reach what is around it, so text that starts editing
 * when tapped still lets its links be followed.
 */
export function LinkedText({ text }: LinkedTextProps) {
  return linkParts(text).map((part, n) =>
    part.link ? (
      <a
        key={n}
        href={part.text}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
        }}
        className="text-accent underline"
      >
        {part.text}
      </a>
    ) : (
      part.text
    ),
  );
}

/** An http(s) address, up to a space; punctuation at its end belongs to the sentence. */
const LINK = /https?:\/\/\S+?(?=[.,;:!?)»"']*(?:\s|$))/g;

/** The text cut into plain parts and links, in order. */
function linkParts(text: string): { text: string; link: boolean }[] {
  const parts: { text: string; link: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), link: false });
    parts.push({ text: match[0], link: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), link: false });
  return parts;
}
