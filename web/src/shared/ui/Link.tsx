import { Link as RouterLink } from 'react-router';
import { ControlInside, type ControlContent } from './Button';
import { controlClasses, type ControlVariant } from './controlStyles';

type LinkProps = ControlContent & {
  /** An in-app path. */
  to: string;
  /** Looks like the Button of the same variant; defaults to `plain` (accent text). */
  variant?: ControlVariant;
};

/** Goes to another screen of the app. Use `Button` for anything that does something. */
export function Link({ to, variant = 'plain', ...content }: LinkProps) {
  return (
    <RouterLink to={to} aria-label={content.label} className={controlClasses(variant)}>
      <ControlInside {...content} />
    </RouterLink>
  );
}
