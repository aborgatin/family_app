import { childAvatar, childColor } from '@/shared/palette';
import { ChildAvatar } from '@/shared/ui';

interface ChildAvatarOfProps {
  name: string;
  /** The Child color's code. */
  color: string;
  /** The Child avatar's code; `null`, missing or a code this build doesn't know shows the initial. */
  avatar: string | null | undefined;
  size: 'card' | 'row' | 'fill';
}

/** A Child's `ChildAvatar` from their stored codes (a colour this build doesn't know is grey). */
export function ChildAvatarOf({ name, color, avatar, size }: ChildAvatarOfProps) {
  return (
    <ChildAvatar
      name={name}
      color={childColor(color)?.hex}
      avatar={childAvatar(avatar)}
      size={size}
    />
  );
}
