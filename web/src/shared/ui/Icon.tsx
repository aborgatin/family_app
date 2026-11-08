import {
  Check,
  ChevronLeft,
  CircleX,
  ChevronRight,
  GlobeOff,
  House,
  LoaderCircle,
  Minus,
  Settings,
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
  home: House,
  minus: Minus,
  offline: GlobeOff,
  settings: Settings,
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
}

/** A line icon in the current text colour. */
export function Icon({ name, size = 22, label }: IconProps) {
  const Glyph = ICONS[name];
  return label === undefined ? (
    <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" className="shrink-0" />
  ) : (
    <Glyph size={size} strokeWidth={2} role="img" aria-label={label} className="shrink-0" />
  );
}
