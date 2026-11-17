import { useId } from 'react';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
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
}

/**
 * A file field as a row of a GroupedSection: the label at the left, the chosen file's name (or
 * «Выбрать») at the right; a tap anywhere opens the system's picker (Files, Photos or the camera on
 * the iPhone). Hints and errors about it show in the group footer and are its description.
 */
export function FileRow({ label, name, accept, value, onChange }: FileRowProps) {
  const id = useId();
  const { describedBy, invalid } = useSectionRow(name);
  return (
    <label
      htmlFor={id}
      className={`${ROW_FRAME} ${ROW_LAYOUT} ${TAPPABLE} has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent`}
    >
      <RowInside
        title={<span className={invalid ? 'text-destructive' : ''}>{label}</span>}
        value={value}
      />
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="sr-only"
        onChange={(event) => {
          onChange(event.target.files?.[0]);
        }}
      />
    </label>
  );
}
