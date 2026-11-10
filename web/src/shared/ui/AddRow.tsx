import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { FIELD_FOCUS } from './fieldFocus';
import { ROW_FRAME, ROW_SEPARATOR } from './GroupedSection';
import { ROW_LAYOUT } from './ListRow';
import { SuggestionRows } from './SuggestionRows';

interface AddRowProps {
  /** Already translated; the placeholder, and the field's accessible name («Новый товар»). */
  label: string;
  /** Adds an entry with the typed text, trimmed; never called with a blank one. */
  onAdd: (text: string) => void;
  /** Takes the focus when it appears with this set (e.g. a new Category's field once named). */
  focus?: boolean;
  /**
   * The names to suggest for the text typed so far (as typed, never blank), shown under the
   * field while it has the focus (`SuggestionRows`); tapping one adds it with `onAdd`.
   */
  suggest?: (typed: string) => readonly string[];
  /**
   * With it, each suggestion has a × that calls this with its name; the typed text and the focus
   * stay, so the other suggestions update in place.
   */
  onRemoveSuggestion?: (name: string) => void;
}

/**
 * The last row of a list that adds an entry by typing, as on paper: an empty text field showing
 * `label`. Enter adds the text and empties the field, keeping the focus for the next entry;
 * leaving the field with text in it adds it too; Esc empties it. With `suggest`, the suggested
 * names show under the field while it is focused; picking one adds it instead of the typed text.
 */
export function AddRow({ label, onAdd, focus = false, suggest, onRemoveSuggestion }: AddRowProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  function add() {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onAdd(trimmed);
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setText('');
    }
  }

  // The field and its suggestions are one place: moving between them (Tab to a suggestion) is
  // not leaving it.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocused(false);
    add();
  }

  const names = focused && suggest !== undefined && text.trim() !== '' ? suggest(text) : [];

  return (
    <div
      className={`relative col-span-full grid grid-cols-subgrid ${ROW_SEPARATOR}`}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={onBlur}
    >
      <div className={`${ROW_FRAME} ${ROW_LAYOUT}`}>
        <input
          ref={field}
          type="text"
          aria-label={label}
          placeholder={label}
          autoComplete="off"
          enterKeyHint="enter"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={onKeyDown}
          className={
            '-mx-1 my-1 block w-[calc(100%+0.5rem)] min-w-0 self-stretch rounded-md bg-transparent ' +
            'px-1 text-body text-label placeholder:text-secondary-label ' +
            FIELD_FOCUS
          }
        />
      </div>
      <SuggestionRows
        names={names}
        onPick={(name) => {
          onAdd(name);
          setText('');
          field.current?.focus();
        }}
        {...(onRemoveSuggestion !== undefined && {
          onRemove: (name: string) => {
            onRemoveSuggestion(name);
            field.current?.focus();
          },
        })}
      />
    </div>
  );
}
