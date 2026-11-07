import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChildFieldsSettings } from '@/features/child-fields';
import { ChildrenSettings } from '@/features/children';
import { MembersSettings } from '@/features/members';
import { SettingsSection } from './SettingsSection';

/**
 * The Settings screen (`/settings`), «Настройки». Only the shell lives here; each section's
 * content comes from its own feature (`members`, `children`, `child-fields`).
 */
export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <main>
      <Link to="/">{t('settings.backHome')}</Link>
      <h1>{t('settings.title')}</h1>
      <SettingsSection title={t('settings.members')}>
        <MembersSettings />
      </SettingsSection>
      <SettingsSection title={t('settings.children')}>
        <ChildrenSettings />
      </SettingsSection>
      <SettingsSection title={t('settings.childFields')}>
        <ChildFieldsSettings />
      </SettingsSection>
    </main>
  );
}
