import type { KeyboardEvent } from 'react';

const NEXT: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Moves the focus to another radio of the same group (the arrow keys, Home, End), wrapping around at
 * the ends; ColorChoice and PictureChoice pick only on a click, Space or Enter.
 */
export function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const circles = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
  );
  const at = circles.indexOf(event.currentTarget);
  let to: number;
  if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = circles.length - 1;
  else {
    const step = NEXT[event.key];
    if (step === undefined) return;
    to = (at + step + circles.length) % circles.length;
  }
  event.preventDefault();
  circles[to]?.focus();
}
