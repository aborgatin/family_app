import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DateRow,
  GroupedSection,
  InputRow,
  useAutoSaveText,
  useReportFailure,
  useRowFailures,
  type ReportFailure,
} from '@/shared/ui';
import type { ChildField } from './childFieldTypes';
import { useChildFields } from './useChildFields';
import { useChildFieldValues } from './useChildFieldValues';

interface ChildProfileSectionProps {
  /** The Child whose profile this is. */
  childId: string;
  /** Rows shown before the Child fields (the birthday). */
  children?: ReactNode;
}

/**
 * «Профиль» on the Child page: the Child profile. After the rows passed in, a row per Child field
 * in the Settings order with this Child's value, edited in place and saved by itself (text on blur
 * or Enter, a date with the date picker); with no Child fields the footer says to add them in
 * Settings. Data only through `useChildFields()` and `useChildFieldValues()`.
 */
export function ChildProfileSection({ childId, children }: ChildProfileSectionProps) {
  const { t } = useTranslation();
  const { load } = useChildFields();
  const { values, save } = useChildFieldValues(childId);
  const { messages, report } = useRowFailures();
  // Rows wait for both: a value arriving after its row would look like the other Member's change.
  const fields = load.status === 'ready' && values !== undefined ? load.value : undefined;

  return (
    <GroupedSection
      header={t('childFields.profile')}
      messages={[...messages, fields?.length === 0 && { text: t('childFields.profileEmpty') }]}
    >
      {children}
      {fields?.map((field) => (
        <ValueRow
          key={field.id}
          field={field}
          value={values?.get(field.id) ?? ''}
          save={save}
          report={report}
        />
      ))}
    </GroupedSection>
  );
}

interface ValueRowProps {
  field: ChildField;
  /** The latest value; `''` for none. */
  value: string;
  save: (field: ChildField, value: string) => Promise<string>;
  report: ReportFailure;
}

/** A Child field with the Child's value, labelled by the field's name, by its Value type. */
function ValueRow({ field, value, save, report }: ValueRowProps) {
  const saveValue = useCallback((typed: string) => save(field, typed), [save, field]);
  const { input, failure } = useAutoSaveText({ name: field.id, saved: value, save: saveValue });
  useReportFailure(report, field.id, failure);

  return field.valueType === 'DATE' ? (
    <DateRow label={field.name} {...input} />
  ) : (
    <InputRow label={field.name} autoComplete="off" {...input} />
  );
}
