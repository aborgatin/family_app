import { useState } from 'react';
import { ActionSheet } from './ActionSheet';
import { ListRow } from './ListRow';

interface ConfirmRowProps {
  /** Already translated, e.g. «Удалить ребёнка», «Выйти». */
  title: string;
  /** The action sheet: the question, an optional explanation, and the red action's label. */
  confirm: { title: string; message?: string; action: string };
  /** Runs only after the action sheet's red action. */
  onConfirm: () => void;
  /** Shows the spinner while it runs. */
  busy?: boolean;
  disabled?: boolean;
}

/**
 * A red row of a `GroupedSection` that does something that can't be undone («Удалить ребёнка»,
 * «Выйти»): a tap opens the `ActionSheet`, and only its red action runs `onConfirm`.
 */
export function ConfirmRow({ title, confirm, onConfirm, busy, disabled }: ConfirmRowProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <ListRow
        destructive
        title={title}
        busy={busy}
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      />
      <ActionSheet
        open={asking}
        onOpenChange={setAsking}
        title={confirm.title}
        message={confirm.message}
        actions={[{ label: confirm.action, destructive: true, onSelect: onConfirm }]}
      />
    </>
  );
}
