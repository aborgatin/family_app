import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { ROW_LAYOUT, RowInside, TAPPABLE } from './ListRow';

interface FileRowProps {
  /** Already translated, e.g. «Файл»: the row's title and the field's name. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /** The file types the picker offers (the input's `accept`), e.g. `application/pdf,image/*`. */
  accept: string;
  /** Already translated: the chosen file's name, or what to do while there is none («Выбрать»). */
  value: string;
  /** A file was chosen (`undefined`: the choice was cancelled). */
  onChange: (file: File | undefined) => void;
  /**
   * The file the field already holds: the row opens it (`to`, `label` naming the link, e.g.
   * «Открыть «Анализ»»), and a paperclip at its right end, named `replaceLabel`, picks another.
   */
  open?: { to: string; state?: unknown; label: string; replaceLabel: string };
}

/**
 * A file field as a row of a GroupedSection: the label at the left, the chosen file's name (or
 * «Выбрать») at the right; a tap anywhere opens the system's picker (Files, Photos or the camera on
 * the iPhone). With `open`, a tap on the row opens the file it holds and the paperclip picks another.
 * Hints and errors about it show in the group footer and are its description.
 */
export function FileRow({ label, name, accept, value, onChange, open }: FileRowProps) {
  const id = useId();
  const { describedBy, invalid } = useSectionRow(name);
  const title = <span className={invalid ? 'text-destructive' : ''}>{label}</span>;
  const input = (
    <input
      id={id}
      name={name}
      type="file"
      accept={accept}
      aria-label={open?.replaceLabel ?? label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="sr-only"
      onChange={(event) => {
        onChange(event.target.files?.[0]);
      }}
    />
  );
  if (open !== undefined) {
    // Two controls side by side in one cell, as `ListRow`'s accessory: the link, then the picker.
    return (
      <div className={`${ROW_FRAME} flex items-stretch`}>
        <RouterLink
          to={open.to}
          state={open.state}
          aria-label={open.label}
          className={`${ROW_LAYOUT} ${TAPPABLE} -ml-4 min-w-0 flex-1 pl-4 text-body no-underline`}
        >
          <RowInside title={title} value={value} />
        </RouterLink>
        <label
          htmlFor={id}
          className={`${TAPPABLE} -mr-4 flex min-w-11 shrink-0 items-center justify-center px-3 pointer-fine:min-w-9 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent`}
        >
          <Icon name="paperclip" size={20} secondary />
          {input}
        </label>
      </div>
    );
  }
  return (
    <label
      htmlFor={id}
      className={`${ROW_FRAME} ${ROW_LAYOUT} ${TAPPABLE} has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent`}
    >
      <RowInside title={title} value={value} />
      {input}
    </label>
  );
}
