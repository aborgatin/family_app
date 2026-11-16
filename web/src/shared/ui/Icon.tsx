import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleX,
  ChevronRight,
  GlobeOff,
  House,
  LoaderCircle,
  Lock,
  Menu,
  Minus,
  Settings,
  TextAlignStart,
  // eslint-disable-next-line no-restricted-syntax -- lucide's own icon name
  Users as People,
  type LucideIcon,
} from 'lucide-react';

/**
 * The app's icons, by name. Features use only these names; `lucide-react` is imported nowhere
 * else (ADR-0008: SF Symbols may not be used on the web). A new icon is added here first.
 */
const ICONS = {
  back: ChevronLeft,
  check: Check,
  chevron: ChevronRight,
  clear: CircleX,
  description: TextAlignStart,
  expand: ChevronDown,
  home: House,
  minus: Minus,
  private: Lock,
  offline: GlobeOff,
  reorder: Menu,
  settings: Settings,
  shared: People,
  spinner: LoaderCircle,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Pixel size of the square; defaults to 22, the nav bar icon size. */
  size?: number;
  /**
   * Already translated name for an icon that means something on its own. Without it the icon is
   * decoration (`aria-hidden`) and whatever contains it carries the name.
   */
  label?: string;
  /** In the secondary text colour instead of the current one (a List's Visibility on Home). */
  secondary?: boolean;
}

/** A line icon in the current text colour. */
export function Icon({ name, size = 22, label, secondary = false }: IconProps) {
  const Glyph = ICONS[name];
  const className = secondary ? 'shrink-0 text-secondary-label' : 'shrink-0';
  return label === undefined ? (
    <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" className={className} />
  ) : (
    <Glyph size={size} strokeWidth={2} role="img" aria-label={label} className={className} />
  );
}
