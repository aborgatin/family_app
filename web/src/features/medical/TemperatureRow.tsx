import { useTranslation } from 'react-i18next';
import { SelectRow } from '@/shared/ui';
import { formatTemperature } from './illnessRules';

/** The wheel's values: 34,0 to 43,0 °C in steps of 0,1, as `"38.5"`. */
const TEMPERATURES = Array.from({ length: 91 }, (_, step) => ((340 + step) / 10).toFixed(1));

/** A Temperature's starting value; also where an optional wheel turns to from «—». */
export const DEFAULT_TEMPERATURE = '37.0';

/** An optional wheel's value while it shows «—»: no temperature. */
export const NO_TEMPERATURE = '';

interface TemperatureRowProps {
  /** `"38.5"`, or `NO_TEMPERATURE` on an optional wheel. */
  value: string;
  onChange: (value: string) => void;
  /**
   * The temperature may be left out (a Medicine dose's): the wheel has «—», right before 37,0, so
   * it shows «—» until turned and then goes on from 37,0.
   */
  optional?: boolean;
}

/**
 * «Температура» as a wheel (a native select, `SelectRow`: the iPhone's wheel, the Mac's menu), from
 * 34,0 to 43,0 °C in 0,1 steps.
 */
export function TemperatureRow({ value, onChange, optional = false }: TemperatureRowProps) {
  const { t } = useTranslation();
  const options = TEMPERATURES.flatMap((temperature) => [
    ...(optional && temperature === DEFAULT_TEMPERATURE
      ? [{ value: NO_TEMPERATURE, label: t('medical.noTemperature') }]
      : []),
    { value: temperature, label: formatTemperature(t, Number(temperature)) },
  ]);
  return (
    <SelectRow
      label={t('medical.temperature')}
      name="temperature"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
