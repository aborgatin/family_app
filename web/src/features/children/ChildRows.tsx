import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { CHILD_AVATARS, CHILD_COLORS } from '@/shared/palette';
import { ColorChoice, DateRow, InputRow, PictureChoice } from '@/shared/ui';
import { ChildPicture } from './ChildPicture';

/** The picker's value for «Без аватара» (the Child's `avatar` is then `null`). */
export const NO_AVATAR = '';

interface ChildRowsProps {
  name: Omit<ComponentProps<typeof InputRow>, 'label'>;
  color: Omit<ComponentProps<typeof ColorChoice<string>>, 'label' | 'options'>;
  /** The value is the avatar's code, or `NO_AVATAR`. */
  avatar: Omit<ComponentProps<typeof PictureChoice<string>>, 'label' | 'options'>;
  /** The name, for the initial «Без аватара» shows (the name being typed in the sheet). */
  childName: string;
  birthday: Omit<ComponentProps<typeof DateRow>, 'label'>;
}

/**
 * A Child's rows, the same on the Child screen (auto-saved) and in the «Новый ребёнок» sheet
 * (saved with «Готово»): Имя, Цвет (the Child color palette, each circle named by
 * `childColors.<code>`), Аватар («Без аватара», then the Avatar set, each named by
 * `childAvatars.<code>` and drawn in the chosen colour), День рождения.
 */
export function ChildRows({ name, color, avatar, childName, birthday }: ChildRowsProps) {
  const { t } = useTranslation();
  const colors = CHILD_COLORS.map((option) => ({
    value: option.code,
    label: t(`childColors.${option.code}`),
    color: option.hex,
  }));
  const drawnIn = color.value ?? '';
  const avatars = [
    { code: NO_AVATAR, label: t('children.noAvatar') },
    ...CHILD_AVATARS.map(({ code }) => ({ code, label: t(`childAvatars.${code}`) })),
  ].map(({ code, label }) => ({
    value: code,
    label,
    picture: <ChildPicture name={childName} color={drawnIn} avatar={code} size="fill" />,
  }));
  return (
    <>
      <InputRow label={t('children.name')} autoComplete="off" {...name} />
      <ColorChoice label={t('children.color')} options={colors} {...color} />
      <PictureChoice label={t('children.avatar')} options={avatars} {...avatar} />
      <DateRow label={t('children.birthday')} {...birthday} />
    </>
  );
}
