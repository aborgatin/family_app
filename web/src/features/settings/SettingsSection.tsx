import { useId, type ReactNode } from 'react';

interface SettingsSectionProps {
  /** Already translated heading; also names the section for screen readers. */
  title: string;
  children: ReactNode;
}

/** One section of the Settings screen: a landmark region named by its heading. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}
