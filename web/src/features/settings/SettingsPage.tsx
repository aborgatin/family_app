import { useTranslation } from 'react-i18next';
import { LogoutSection } from '@/features/auth';
import { ChildFieldsSettings } from '@/features/child-fields';
import { ChildrenSettings } from '@/features/children';
import { MembersSettings } from '@/features/members';
import { GroupedSection, Page, SectionContent, Sections } from '@/shared/ui';
import { AppearanceSection } from './AppearanceSection';

/**
 * The Settings screen (`/settings`), «Настройки»: one page of grouped sections. Only the page
 * lives here; each section's content comes from its own feature.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('settings.title')} back={{ to: '/', title: t('app.name') }}>
      <Sections>
        <MembersSettings />
        {/* Children and Child fields keep their M1 content until their own tickets (spec #35). */}
        <GroupedSection header={t('settings.children')}>
          <SectionContent>
            <ChildrenSettings />
          </SectionContent>
        </GroupedSection>
        <GroupedSection header={t('settings.childFields')}>
          <SectionContent>
            <ChildFieldsSettings />
          </SectionContent>
        </GroupedSection>
        <AppearanceSection />
        <LogoutSection />
      </Sections>
    </Page>
  );
}
