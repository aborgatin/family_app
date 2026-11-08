import type { ReactNode } from 'react';
import { controlClasses, type ControlSize, type ControlVariant } from './controlStyles';
import { Icon, type IconName } from './Icon';

/** Text (optionally after an icon), or an icon alone with a translated `label` as its name. */
export type ControlContent =
  | { children: ReactNode; icon?: IconName; label?: never }
  | { icon: IconName; label: string; children?: never };

type ButtonProps = ControlContent & {
  /** `plain` (accent text, the default), `destructive` (red text), `primary` (filled, full width). */
  variant?: ControlVariant;
  /** `small`: footnote-sized, for a section footer. */
  size?: ControlSize;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
};

/** Does something. Use `Link` instead when it only goes to another screen. */
export function Button({
  variant = 'plain',
  size = 'regular',
  type = 'button',
  disabled,
  onClick,
  ...content
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={content.label}
      className={controlClasses(variant, size)}
    >
      <ControlInside {...content} />
    </button>
  );
}

/** What Button and Link show: the icon, then the text. */
export function ControlInside({ icon, children }: ControlContent) {
  return (
    <>
      {icon !== undefined && <Icon name={icon} />}
      {children}
    </>
  );
}
