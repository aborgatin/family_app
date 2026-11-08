import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GrammaticalGenderRow, type GrammaticalGender, type Member } from '@/features/auth';
import {
  autoSaveMessages,
  GroupedSection,
  InputRow,
  ListRow,
  useAutoSaveChoice,
  useAutoSaveText,
} from '@/shared/ui';
import { updateProfile } from './membersApi';
import { PASSWORD_PATH, usePasswordJustChanged } from './PasswordPage';

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
  const name = useAutoSaveText({
    name: 'displayName',
    saved: member.displayName,
    save: saveName,
    required: true,
  });

  const saveGrammaticalGender = useCallback(
    async (grammaticalGender: GrammaticalGender) => {
      const updated = await updateProfile({ grammaticalGender });
      onSaved(updated);
      return updated.grammaticalGender;
    },
    [onSaved],
  );
  const grammaticalGender = useAutoSaveChoice({
    name: 'grammaticalGender',
    saved: member.grammaticalGender,
    save: saveGrammaticalGender,
  });

  const passwordChanged = usePasswordJustChanged();

  return (
    <GroupedSection
      header={t('members.profile.title')}
      messages={[
        ...autoSaveMessages([name.failure, grammaticalGender.failure]),
        passwordChanged && { text: t('members.password.changed'), announce: true },
      ]}
    >
      <InputRow label={t('members.profile.displayName')} autoComplete="name" {...name.input} />
      <GrammaticalGenderRow {...grammaticalGender.control} />
      <ListRow title={t('members.password.title')} to={PASSWORD_PATH} />
    </GroupedSection>
  );
}
