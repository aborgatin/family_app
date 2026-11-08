interface AvatarProps {
  /** The person's name; the circle shows its first letter. */
  name: string;
}

/** A grey circle with a name's initial, before a person's name in a row. Decorative. */
export function Avatar({ name }: AvatarProps) {
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
