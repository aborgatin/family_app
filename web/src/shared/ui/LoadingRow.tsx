import { useTranslation } from 'react-i18next';
import { ListRow } from './ListRow';

/** «Загрузка…» as the only row of a `GroupedSection` while its list loads; announced (`status`). */
export function LoadingRow() {
  const { t } = useTranslation();
  return <ListRow title={<span role="status">{t('common.loading')}</span>} />;
}
