/**
 * Class lists shared by Button and Link, so a link styled as a button and a button look the same.
 * Touch (`pointer-coarse`) gets 44px targets; a fine pointer gets tighter ones. Tailwind applies
 * `hover:` only where the device can hover.
 */
const BASE =
  'inline-flex items-center justify-center gap-1 select-none cursor-pointer no-underline ' +
  'rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 ' +
  'transition-opacity duration-150';

const TEXT_TARGET =
  'text-body px-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 ' +
  'pointer-fine:min-h-7 pointer-fine:min-w-7 hover:opacity-70 active:opacity-50';

/** `plain`: accent text. `destructive`: red text. `primary`: filled, full width. */
export type ControlVariant = 'plain' | 'destructive' | 'primary';

const VARIANTS: Record<ControlVariant, string> = {
  plain: `text-accent ${TEXT_TARGET}`,
  destructive: `text-destructive ${TEXT_TARGET}`,
  primary:
    'w-full rounded-xl bg-accent-fill text-on-accent text-body font-semibold px-4 ' +
    'pointer-coarse:min-h-[3.125rem] pointer-fine:min-h-9 hover:opacity-85 active:opacity-70',
};

/**
 * `regular`, or `small`: footnote-sized text inside a section footer (e.g. «Повторить»). A small
 * control keeps its 44px touch target but doesn't push the lines around it apart.
 */
export type ControlSize = 'regular' | 'small';

const SMALL =
  'text-footnote! font-semibold px-1! pointer-coarse:-my-3 pointer-fine:min-h-0! pointer-fine:-my-0.5';

export function controlClasses(variant: ControlVariant, size: ControlSize = 'regular'): string {
  return `${BASE} ${VARIANTS[variant]}${size === 'small' ? ` ${SMALL}` : ''}`;
}
