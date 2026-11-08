import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CenteredPage, EmptyState, Link } from '@/shared/ui';
import { LOGIN_PATH } from './AuthGuard';
import type { LinkState } from './useLinkCheck';

interface LinkScreenProps {
  /** Already translated. */
  title: string;
  /** Already translated; shown only once the link works. */
  intro: string;
  link: LinkState;
  retry: () => void;
  /** Already translated text of the way out from a broken link. */
  toLogin: string;
  /** The form, shown once the link works. */
  children: ReactNode;
}

/**
 * A screen opened from a one-time link (Invite, password reset). While the link is checked, and
 * when it is broken or couldn't be checked, the same centred layout shows a message instead of
 * the form: «Проверяем ссылку…», the reason with «Ко входу», or the failure with «Повторить».
 */
export function LinkScreen({ title, intro, link, retry, toLogin, children }: LinkScreenProps) {
  const { t } = useTranslation();
  switch (link.status) {
    case 'checking':
      return (
        <CenteredPage title={title}>
          <EmptyState role="status">{t('common.checkingLink')}</EmptyState>
        </CenteredPage>
      );
    case 'broken':
      return (
        <CenteredPage title={title}>
          <EmptyState role="alert" action={<Link to={LOGIN_PATH}>{toLogin}</Link>}>
            {t(link.message)}
          </EmptyState>
        </CenteredPage>
      );
    case 'unreachable':
      return (
        <CenteredPage title={title}>
          <EmptyState role="alert" action={<Button onClick={retry}>{t('common.retry')}</Button>}>
            {t(link.message)}
          </EmptyState>
        </CenteredPage>
      );
    case 'working':
      return (
        <CenteredPage title={title} intro={intro}>
          {children}
        </CenteredPage>
      );
  }
}
