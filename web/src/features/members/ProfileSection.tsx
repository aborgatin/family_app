import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member } from '@/features/auth';
import {
  InputRow,
  SaveFailure,
  Section,
  SegmentedRow,
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
  const gender = useAutoSaveChoice({ saved: member.grammaticalGender, save: saveGender });

  const genders = [
    { value: 'MASCULINE', label: t('grammaticalGender.masculine') },
    { value: 'FEMININE', label: t('grammaticalGender.feminine') },
  ] as const;

  return (
    <Section
      title={t('members.profile.title')}
      footer={<SaveFailure failures={[name.failure, gender.failure]} />}
    >
      <InputRow label={t('members.profile.displayName')} autoComplete="name" {...name.input} />
      <SegmentedRow label={t('grammaticalGender.label')} options={genders} {...gender.control} />
    </Section>
  );
}
