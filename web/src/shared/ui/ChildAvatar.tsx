import type { CSSProperties, ReactNode } from 'react';
import type { ChildAvatarCode } from '@/shared/palette';

interface ChildAvatarProps {
  /** The Child's name: its first letter shows when there is no Child avatar. */
  name: string;
  /** A CSS colour (a Child color's `hex`); `undefined` draws in `secondary-label`. */
  color: string | undefined;
  /** The Child avatar to draw; `undefined` shows the initial. */
  avatar: ChildAvatarCode | undefined;
  /** `card` 46px (Home), `row` 32px (a Settings row), `fill` as big as its parent (the picker). */
  size: 'card' | 'row' | 'fill';
}

const SIZES = {
  card: 'size-11.5 text-title3',
  row: 'size-8 text-subhead pointer-fine:size-7',
  fill: 'size-full text-title3',
} as const;

/**
 * A Child's round avatar circle (ticket #124): their Child avatar drawn in their Child color on a soft
 * tint of it (`child-tint`), or without one the initial in `label`. Decorative: the name is always
 * next to it or names the control it is in.
 */
export function ChildAvatar({ name, color, avatar, size }: ChildAvatarProps) {
  const style = { '--child-color': color ?? 'var(--color-secondary-label)' } as CSSProperties;
  const frame = `flex shrink-0 overflow-hidden rounded-full bg-child-tint ${SIZES[size]}`;
  if (avatar === undefined) {
    return (
      <span
        aria-hidden="true"
        style={style}
        data-initial={Array.from(name.trim())[0]?.toUpperCase() ?? ''}
        className={`${frame} items-center justify-center font-semibold text-label before:content-[attr(data-initial)]`}
      />
    );
  }
  return (
    <span aria-hidden="true" style={style} className={frame}>
      <svg data-avatar={avatar} viewBox="10 4 80 80" className="size-full fill-child">
        {DRAWINGS[avatar]}
      </svg>
    </span>
  );
}

// The drawings: flat shapes, hair and clothes in the Child color, the face a light tint of it
// (`child-face`), so they stay readable at 32px. Drawn on a 100×100 grid.

const FACE = 'fill-child-face';

function Body() {
  return (
    <>
      <rect x="44" y="54" width="12" height="17" rx="4" className={FACE} />
      <path d="M14 100 C14 80 30 69 50 69 C70 69 86 80 86 100 Z" />
    </>
  );
}

function Face() {
  return <circle cx="50" cy="42" r="17" className={FACE} />;
}

/** Hair over the forehead, for the loose styles. */
const BANGS =
  'M33 41 C32 26 41 21 50 21 C59 21 68 26 67 41 C61 34 53 31 46 33 C41 34 36 37 33 41 Z';
/** Hair pulled back, for the tied styles. */
const CAP = 'M33 40 C33 25 42 21 50 21 C58 21 67 25 67 40 C62 33 56 31 50 31 C44 31 38 33 33 40 Z';

const DRAWINGS: Record<ChildAvatarCode, ReactNode> = {
  long: (
    <>
      <path d="M31 46 C27 22 40 17 50 17 C60 17 73 22 69 46 L74 84 L26 84 Z" />
      <Body />
      <Face />
      <path d={BANGS} />
    </>
  ),
  short: (
    <>
      <path d="M29 50 C26 23 40 18 50 18 C60 18 74 23 71 50 C71 57 67 59 63 59 L37 59 C33 59 29 57 29 50 Z" />
      <Body />
      <Face />
      <path d={BANGS} />
    </>
  ),
  ponytail: (
    <>
      <path d="M60 25 C78 18 90 32 85 50 C83 60 78 65 72 67 C77 55 76 42 64 33 Z" />
      <Body />
      <Face />
      <path d={CAP} />
      <circle cx="64" cy="28" r="4.5" className={FACE} />
    </>
  ),
  'top-knot': (
    <>
      <path d="M50 22 C45 13 39 8 29 9 C38 2 47 5 50 13 C53 5 62 2 71 9 C61 8 55 13 50 22 Z" />
      <Body />
      <Face />
      <path d={CAP} />
      <rect x="45" y="17" width="10" height="5" rx="2.5" className={FACE} />
    </>
  ),
  boy: (
    <>
      <Body />
      <circle cx="33" cy="44" r="4.5" className={FACE} />
      <circle cx="67" cy="44" r="4.5" className={FACE} />
      <Face />
      <path d="M32 40 C30 24 40 19 50 19 C58 19 64 21 67 27 C69 31 69 36 68 40 C63 33 57 30 50 30 C44 30 37 34 32 40 Z" />
      <path d="M43 23 C46 14 54 12 59 17 C54 17 51 19 50 22 Z" />
    </>
  ),
};
