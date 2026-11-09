import { useState, type KeyboardEvent } from 'react';
import { ROW_FRAME } from './GroupedSection';
import { ROW_LAYOUT } from './ListRow';

interface AddRowProps {
  /** Already translated; the placeholder, and the field's accessible name («Новый товар»). */
  label: string;
  /** Adds an entry with the typed text, trimmed; never called with a blank one. */
  onAdd: (text: string) => void;
}

/**
 * The last row of a list that adds an entry by typing, as on paper: an empty text field showing
 * `label`. Enter adds the text and empties the field, keeping the focus for the next entry;
 * leaving the field with text in it adds it too; Esc empties it.
 */
export function AddRow({ label, onAdd }: AddRowProps) {
  const [text, setText] = useState('');

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

  return (
    <div className={`${ROW_FRAME} ${ROW_LAYOUT}`}>
      <input
        type="text"
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        enterKeyHint="enter"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={add}
        onKeyDown={onKeyDown}
        className={
          '-mx-1 my-1 block w-[calc(100%+0.5rem)] min-w-0 self-stretch rounded-md bg-transparent ' +
          'px-1 text-body text-label outline-none placeholder:text-secondary-label ' +
          'pointer-fine:focus-visible:outline-2 pointer-fine:focus-visible:outline-solid ' +
          'pointer-fine:focus-visible:outline-accent'
        }
      />
    </div>
  );
}
