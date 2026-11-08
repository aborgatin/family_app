import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** «Сохраняем…»: a turning circle at the right of a row while its change is being saved. */
export function Spinner() {
  const { t } = useTranslation();
  return (
    <span className="flex shrink-0 animate-spin text-secondary-label">
      <Icon name="spinner" size={18} label={t('ui.saving')} />
    </span>
  );
}
