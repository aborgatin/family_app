import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** See GLOSSARY.md "Grammatical gender". */
export type GrammaticalGender = 'MASCULINE' | 'FEMININE';

interface GrammaticalGenderChoiceProps {
  /** `undefined` until the Member picks one: nothing is pre-selected. */
  value: GrammaticalGender | undefined;
  onChange: (value: GrammaticalGender) => void;
  /** Already translated error message. */
  error?: string | undefined;
}

/**
 * The required «Добавил» / «Добавила» choice, used at registration and in the Member's profile. It
 * starts with nothing selected, so the Member always makes the choice themselves.
 */
export function GrammaticalGenderChoice({ value, onChange, error }: GrammaticalGenderChoiceProps) {
  const { t } = useTranslation();
  const name = useId();
  const errorId = `${name}-error`;
  const options = [
    { value: 'MASCULINE', label: t('grammaticalGender.masculine') },
    { value: 'FEMININE', label: t('grammaticalGender.feminine') },
  ] as const;

  return (
    <fieldset
      className="field"
      aria-invalid={error !== undefined}
      aria-describedby={error === undefined ? undefined : errorId}
    >
      <legend>{t('grammaticalGender.question')}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          {option.label}
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
