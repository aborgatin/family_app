interface SwatchProps {
  /** A CSS colour, e.g. a Child color's `hex` from `@/shared/palette`. */
  color: string;
}

/**
 * A small dot in a colour, as `leading` of a row (a Child's colour). Decorative: whatever it marks
 * is named in text.
 */
export function Swatch({ color }: SwatchProps) {
  return (
    <span
      aria-hidden="true"
      className="block size-3.5 rounded-full inset-ring inset-ring-swatch-edge"
      style={{ backgroundColor: color }}
    />
  );
}
