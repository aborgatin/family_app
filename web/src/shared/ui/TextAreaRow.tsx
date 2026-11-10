import { useRef, useState } from 'react';
import { FIELD_FOCUS } from './fieldFocus';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
import { LinkedText } from './LinkedText';
import { Spinner } from './Spinner';

interface TextAreaRowProps {
  /** Already translated; the field's accessible name, and what it shows while empty. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Auto-save (`useAutoSaveText()`): called when the field is left. */
  onCommit?: () => void;
  /** Esc: put the saved value back. */
  onRevert?: () => void;
  /** Shows the spinner at the top right of the row while saving. */
  busy?: boolean;
}

/**
 * A large multi-line text field as a row of a `GroupedSection` (an Item's «Описание» on the Item
 * screen): plain text, several paragraphs, at least five lines tall and growing with its text.
 * While it isn't being edited its text is shown with its line breaks and its http(s) addresses as
 * links; a tap beside them (or Tab) starts editing the whole text. Enter starts a new line, leaving
 * the field saves, Esc puts the saved text back.
 */
export function TextAreaRow({
  label,
  name,
  value,
  onChange,
  onCommit,
  onRevert,
  busy = false,
}: TextAreaRowProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const { describedBy, invalid } = useSectionRow(name);
  // Read, not edited: the text with its links, over the field.
  const reading = !editing && value.trim() !== '';

  return (
    // The text and the field share one grid cell: the text gives the row its height (so the field
    // grows with what is typed, with nothing measured), and the field fills it.
    <div className={`${ROW_FRAME} grid py-2.5 pointer-fine:py-1.5`}>
      <p
        onClick={() => {
          const element = field.current;
          if (element === null) return;
          element.focus();
          element.setSelectionRange(element.value.length, element.value.length);
        }}
        className={`${CELL} cursor-text ${reading ? '' : 'invisible'}`}
      >
        {reading ? <LinkedText text={value} /> : value}
        {/* Keeps the line a final line break opens, as the field shows it. */}
        <br />
      </p>
      <textarea
        ref={field}
        name={name}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onFocus={() => {
          setEditing(true);
        }}
        onBlur={() => {
          setEditing(false);
          onCommit?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onRevert !== undefined) {
            event.preventDefault();
            onRevert();
          }
        }}
        className={
          `${CELL} block size-full resize-none overflow-hidden rounded-md bg-transparent ` +
          `placeholder:text-secondary-label ${FIELD_FOCUS} pointer-fine:focus-visible:outline-offset-4 ` +
          // Read: the field stays for the keyboard and assistive technology, out of sight and
          // out of the pointer's way; it shows as soon as it has the focus.
          (reading ? 'pointer-events-none opacity-0' : '')
        }
      />
      {busy && (
        <span className="absolute top-2.5 right-4">
          <Spinner />
        </span>
      )}
    </div>
  );
}

/**
 * The text and the field in the same place, wrapped the same way; room for five lines of `body`
 * text.
 */
const CELL =
  'col-start-1 row-start-1 min-h-[6.875rem] min-w-0 wrap-anywhere whitespace-pre-wrap ' +
  'text-body text-label';
