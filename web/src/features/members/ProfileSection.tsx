import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member } from '@/features/auth';
import {
  autoSaveMessages,
  GroupedSection,
  InputRow,
  SegmentedControl,
  useAutoSaveChoice,
  useAutoSaveText,
  type GrammaticalGender,
} from '@/shared/ui';
import { updateProfile } from './membersApi';

interface ProfileSectionProps {
  member: Member;
  onSaved: (member: Member) => void;
}

/**
 * «Ваш профиль»: the logged-in Member's display name (auto-saved on blur or Enter) and «Пол»
 * (saved on tap). Each change sends only its own field. Online-only (S4 exception).
 */
export function ProfileSection({ member, onSaved }: ProfileSectionProps) {
  const { t } = useTranslation();

  const saveName = useCallback(
    async (displayName: string) => {
      const updated = await updateProfile({ displayName });
      onSaved(updated);
      return updated.displayName;
    },
    [onSaved],
  );
  const validateName = useCallback(
    (displayName: string) => (displayName.trim() === '' ? t('errors.field.required') : undefined),
    [t],
  );
  const name = useAutoSaveText({
    name: 'displayName',
    saved: member.displayName,
    save: saveName,
    validate: validateName,
  });

  const saveGender = useCallback(
    async (grammaticalGender: GrammaticalGender) => {
      const updated = await updateProfile({ grammaticalGender });
      onSaved(updated);
      return updated.grammaticalGender;
    },
    [onSaved],
  );
  const gender = useAutoSaveChoice({
    name: 'grammaticalGender',
    saved: member.grammaticalGender,
    save: saveGender,
  });

  const genders = [
    { value: 'MASCULINE', label: t('grammaticalGender.masculine') },
    { value: 'FEMININE', label: t('grammaticalGender.feminine') },
  ] as const;

  return (
    <GroupedSection
      header={t('members.profile.title')}
      messages={autoSaveMessages([name.failure, gender.failure])}
    >
      <InputRow label={t('members.profile.displayName')} autoComplete="name" {...name.input} />
      <SegmentedControl
        label={t('grammaticalGender.label')}
        options={genders}
        {...gender.control}
      />
    </GroupedSection>
  );
}
