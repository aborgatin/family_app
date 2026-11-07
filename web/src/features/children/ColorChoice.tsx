import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CHILD_COLORS } from '@/shared/palette';
import { ColorSwatch, useChildColorName } from './ColorSwatch';

interface ColorChoiceProps {
  /** A palette code; `undefined` until the Member picks one. */
  value: string | undefined;
  onChange: (code: string) => void;
  /** Already translated error message. */
  error?: string | undefined;
}

/** The required choice of a Child's color from the fixed Child color palette. */
export function ColorChoice({ value, onChange, error }: ColorChoiceProps) {
  const { t } = useTranslation();
  const colorName = useChildColorName();
  const name = useId();
  const errorId = `${name}-error`;

  return (
    <fieldset
      className="field"
      aria-invalid={error !== undefined}
      aria-describedby={error === undefined ? undefined : errorId}
    >
      <legend>{t('children.form.color')}</legend>
      {CHILD_COLORS.map((color) => (
        <label key={color.code}>
          <input
            type="radio"
            name={name}
            value={color.code}
            checked={value === color.code}
            onChange={() => {
              onChange(color.code);
            }}
          />
          <ColorSwatch code={color.code} /> {colorName(color.code)}
        </label>
      ))}
      {error !== undefined && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
