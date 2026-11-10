/**
 * A text field's focus sign: on touch the caret is the focus, as on iOS; with a keyboard and a
 * fine pointer the field gets the accent outline every focused control has.
 */
export const FIELD_FOCUS =
  'outline-none pointer-fine:focus-visible:outline-2 pointer-fine:focus-visible:outline-solid ' +
  'pointer-fine:focus-visible:outline-accent';
