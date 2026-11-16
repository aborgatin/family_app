import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey, type FieldMessages } from '@/shared/api';
import { InputRow, SuggestionRows } from '@/shared/ui';
import { EventSheet, type EventTarget } from './EventSheet';
import type { Medicine } from './medicalTypes';
import { NO_TEMPERATURE, TemperatureRow } from './TemperatureRow';
import type { DoseDetails, IllnessChoice, MedicineChoice } from './useMedicalCard';
import { medicineKey, medicineNamed } from './useMedicines';

type Field = 'medicine' | 'amount';
const FIELDS: readonly Field[] = ['medicine', 'amount'];

interface DoseSheetProps extends EventTarget {
  /** The Family's Medicines (deleted ones left out), in order. */
  medicines: readonly Medicine[];
  /** The amount to prefill for a Medicine: the person's latest dose of it; none the first time. */
  lastAmountOf: (medicineId: string) => string | undefined;
  save: (target: IllnessChoice, details: DoseDetails) => Promise<unknown>;
}

/**
 * «Приём лекарства»: a Medicine dose, saved only with «Готово». «Лекарство» is a picker with
 * search: the Medicines whose name has the typed text, then «+ <text>» to add it to the list; the
 * name of one typed in any letter case picks it. «Количество» is free text, required, prefilled
 * with the person's latest amount of that Medicine («как в прошлый раз») until the Member types
 * their own. «Температура» is optional (the wheel shows «—»). The rest is `EventSheet`'s.
 */
export function DoseSheet({ medicines, lastAmountOf, save, ...target }: DoseSheetProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  // «+ <text>» was tapped: the typed name is a new Medicine, so the picker closes.
  const [addingTyped, setAddingTyped] = useState(false);
  // What the Member typed in «Количество»; `undefined` while it shows the prefilled amount.
  const [ownAmount, setOwnAmount] = useState<string>();
  const [temperature, setTemperature] = useState(NO_TEMPERATURE);

  const picked = medicineNamed(medicines, typed);
  const prefilled = picked === undefined ? undefined : lastAmountOf(picked.id);
  const amount = ownAmount ?? prefilled ?? '';
  const name = typed.trim();
  const addLabel = t('medical.addMedicine', { name });
  const choices =
    picked !== undefined || addingTyped
      ? []
      : [
          ...medicines
            .filter((medicine) => medicineKey(medicine.name).includes(medicineKey(typed)))
            .map((medicine) => medicine.name),
          ...(name === '' ? [] : [addLabel]),
        ];

  function check(): FieldMessages<Field> {
    return {
      ...(name === '' && { medicine: fieldMessageKey('required') }),
      ...(amount.trim() === '' && { amount: fieldMessageKey('required') }),
    };
  }

  const medicine: MedicineChoice =
    picked === undefined ? { newMedicineName: name } : { medicineId: picked.id };

  return (
    <EventSheet
      {...target}
      title={t('medical.dose')}
      fields={FIELDS}
      check={check}
      hints={{
        ...(prefilled !== undefined && amount === prefilled && { amount: t('medical.asLastTime') }),
      }}
      save={(choice, timing) =>
        save(choice, {
          medicine,
          amount: amount.trim(),
          temperature: temperature === NO_TEMPERATURE ? null : Number(temperature),
          ...timing,
        })
      }
    >
      <InputRow
        label={t('medical.medicine')}
        name="medicine"
        value={typed}
        onChange={(value) => {
          setTyped(value);
          setAddingTyped(false);
        }}
      />
      <SuggestionRows
        names={choices}
        onPick={(choice) => {
          if (choice === addLabel) {
            setAddingTyped(true);
          } else {
            setTyped(choice);
          }
        }}
      />
      <InputRow
        label={t('medical.amount')}
        name="amount"
        placeholder={t('medical.amountPlaceholder')}
        value={amount}
        onChange={setOwnAmount}
      />
      <TemperatureRow optional value={temperature} onChange={setTemperature} />
    </EventSheet>
  );
}
