import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { childColor } from '@/shared/palette';

/** A small dot in a Child's color. Decorative: the color's name is always shown next to it. */
export function ColorSwatch({ code }: { code: string }) {
  const color = childColor(code);
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '1em',
        height: '1em',
        borderRadius: '50%',
        verticalAlign: 'middle',
        background: color?.hex ?? 'transparent',
        border: '1px solid rgb(0 0 0 / 0.2)',
      }}
    />
  );
}

/** The Russian name of a palette color; a code this build does not know reads «Другой цвет». */
export function useChildColorName() {
  const { t } = useTranslation();
  return useCallback(
    (code: string) => {
      const color = childColor(code);
      return color === undefined ? t('children.unknownColor') : t(`childColors.${color.code}`);
    },
    [t],
  );
}
