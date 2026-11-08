import { useTranslation } from 'react-i18next';
import { LogoutSection } from '@/features/auth';
import { ChildFieldsSettings } from '@/features/child-fields';
import { ChildrenSettings } from '@/features/children';
import { MembersSettings } from '@/features/members';
import { Page, Section } from '@/shared/ui';
import { AppearanceSection } from './AppearanceSection';

/**
 * The Settings screen (`/settings`), «Настройки»: one page of grouped sections. Only the page
 * lives here; each section's content comes from its own feature.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('settings.title')} back={{ to: '/', title: t('app.name') }}>
      <MembersSettings />
      {/* Children and Child fields keep their M1 content until their own tickets (spec #35). */}
      <Section title={t('settings.children')} rows={false}>
        <ChildrenSettings />
      </Section>
      <Section title={t('settings.childFields')} rows={false}>
        <ChildFieldsSettings />
      </Section>
      <AppearanceSection />
      <LogoutSection />
    </Page>
  );
}
