import { useTranslation } from 'react-i18next';
import { LogoutSection } from '@/features/auth';
import { ChildFieldsSettings } from '@/features/child-fields';
import { ChildrenSettings } from '@/features/children';
import { MembersSettings } from '@/features/members';
import { Page, Sections } from '@/shared/ui';
import { AppearanceSection } from './AppearanceSection';

interface SettingsPageProps {
  /** Path of Home, where the screen goes back to. */
  homePath: string;
}

/**
 * The Settings screen (`/settings`), «Настройки»: one page of grouped sections. Only the page
 * lives here; each section's content comes from its own feature.
 */
export function SettingsPage({ homePath }: SettingsPageProps) {
  const { t } = useTranslation();
  return (
    <Page title={t('settings.title')} back={{ to: homePath, title: t('app.name') }}>
      <Sections>
        <MembersSettings />
        <ChildrenSettings />
        <ChildFieldsSettings />
        <AppearanceSection />
        <LogoutSection />
      </Sections>
    </Page>
  );
}
