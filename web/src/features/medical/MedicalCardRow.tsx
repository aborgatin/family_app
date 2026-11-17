import { useTranslation } from 'react-i18next';
import { GroupedSection, ListRow } from '@/shared/ui';
import { cardPath, MY_CARD_PATH } from './medicalPaths';

/**
 * «Медкарта»: a row opening a Medical card, the Member's own (on Home) or, with `childId`, the
 * Child's (on the Child page).
 */
export function MedicalCardRow({ childId }: { childId?: string }) {
  const { t } = useTranslation();
  return (
    <GroupedSection label={t('medical.title')}>
      <ListRow
        title={t('medical.title')}
        to={childId === undefined ? MY_CARD_PATH : cardPath({ childId })}
      />
    </GroupedSection>
  );
}
