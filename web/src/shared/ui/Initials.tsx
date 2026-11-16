interface InitialsProps {
  /** The person's name; the circle shows its first letter. */
  name: string;
}

/**
 * A grey circle with a name's initial, before a Member's name in a row. Decorative. (Not a Child
 * avatar: that is a drawing a Child is shown with, `ChildAvatar`.)
 */
export function Initials({ name }: InitialsProps) {
  return (
    <span
      aria-hidden="true"
      className={
        'flex size-8 items-center justify-center rounded-full bg-secondary-label ' +
        'text-subhead font-semibold text-cell uppercase pointer-fine:size-7'
      }
    >
      {Array.from(name.trim())[0] ?? ''}
    </span>
  );
}
