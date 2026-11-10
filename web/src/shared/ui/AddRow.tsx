import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_FOCUS } from './fieldFocus';
import { Icon } from './Icon';
import { ROW_FRAME, ROW_SEPARATOR } from './GroupedSection';
import { ROW_LAYOUT } from './ListRow';
import { SuggestionRows } from './SuggestionRows';

interface AddRowProps {
  /** Already translated; the placeholder, and the field's accessible name («Новый товар»). */
  label: string;
  /**
   * Adds an entry with the typed text, trimmed; never called with a blank one. With
   * `descriptionLabel`, the trimmed text of the «Описание» line comes too (none when blank).
   */
  onAdd: (text: string, description?: string) => void;
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
  /**
   * Already translated; with it, the entry can be given a description while added: the line's
   * placeholder and accessible name («Описание»).
   */
  descriptionLabel?: string;
}

/**
 * The last row of a list that adds an entry by typing, as on paper: an empty text field showing
 * `label`. Enter adds the text and empties the field, keeping the focus for the next entry;
 * leaving the field with text in it adds it too; Esc empties it. With `suggest`, the suggested
 * names show under the field while it is focused; picking one adds it instead of the typed text.
 * With `descriptionLabel`, an icon button at the end of a field with text (or ↓ in it) opens a grey
 * one-line «Описание» field under it and focuses it: ↑ goes back, Enter in either adds both, Esc
 * closes it; suggestions hide while it has the focus.
 */
export function AddRow({
  label,
  onAdd,
  focus = false,
  suggest,
  onRemoveSuggestion,
  descriptionLabel,
}: AddRowProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // The «Описание» line: `undefined` while closed.
  const [description, setDescription] = useState<string>();
  const [inDescription, setInDescription] = useState(false);
  // Bumped to move the focus to the line, once it is there.
  const [descriptionFocus, setDescriptionFocus] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const descriptionField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  useLayoutEffect(() => {
    if (descriptionFocus > 0) descriptionField.current?.focus();
  }, [descriptionFocus]);

  function clear() {
    setText('');
    setDescription(undefined);
  }

  function add() {
    const trimmed = text.trim();
    if (trimmed === '') return;
    const described = description?.trim() ?? '';
    onAdd(trimmed, described === '' ? undefined : described);
    clear();
  }

  function openDescription() {
    setDescription((open) => open ?? '');
    setDescriptionFocus((times) => times + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clear();
    } else if (event.key === 'ArrowDown' && descriptionLabel !== undefined && text.trim() !== '') {
      event.preventDefault();
      openDescription();
    }
  }

  function onDescriptionKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
      field.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDescription(undefined);
      field.current?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      field.current?.focus();
    }
  }

  // The field, its «Описание» line and its suggestions are one place: moving between them (Tab to
  // a suggestion) is not leaving it.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocused(false);
    add();
  }

  const names =
    focused && !inDescription && suggest !== undefined && text.trim() !== '' ? suggest(text) : [];

  return (
    <div
      className={`relative col-span-full grid grid-cols-subgrid ${ROW_SEPARATOR}`}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={onBlur}
    >
      <div className={`${ROW_FRAME} ${ROW_LAYOUT}`}>
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
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
              '-mx-1 my-1 block w-[calc(100%+0.5rem)] min-w-0 flex-1 rounded-md bg-transparent ' +
              'px-1 text-body text-label placeholder:text-secondary-label ' +
              // With the «Описание» line open, the two sit as an Item's title and Description do.
              (description === undefined ? 'pointer-coarse:min-h-9 ' : 'pointer-coarse:min-h-8 ') +
              'pointer-fine:min-h-7 ' +
              FIELD_FOCUS
            }
          />
          {descriptionLabel !== undefined && description !== undefined && (
            <input
              ref={descriptionField}
              type="text"
              aria-label={descriptionLabel}
              placeholder={descriptionLabel}
              autoComplete="off"
              enterKeyHint="enter"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              onKeyDown={onDescriptionKeyDown}
              onFocus={() => {
                setInDescription(true);
              }}
              onBlur={() => {
                setInDescription(false);
              }}
              className={
                '-mx-1 -mt-1 mb-2 block w-[calc(100%+0.5rem)] min-w-0 rounded-md bg-transparent ' +
                'px-1 text-subhead text-secondary-label placeholder:text-tertiary-label ' +
                FIELD_FOCUS
              }
            />
          )}
        </div>
        {descriptionLabel !== undefined && description === undefined && text !== '' && (
          <button
            type="button"
            aria-label={t('ui.addDescription')}
            // Out of the Tab order: Tab goes on to the suggestions; a keyboard opens the line with ↓.
            tabIndex={-1}
            onMouseDown={(event) => {
              // Pressing it with the mouse doesn't take the focus from the field first.
              event.preventDefault();
            }}
            onClick={openDescription}
            className={DESCRIBE}
          >
            <Icon name="description" size={20} />
          </button>
        )}
      </div>
      <SuggestionRows
        names={names}
        onPick={(name) => {
          onAdd(name);
          clear();
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

/** The Description button at the end of the field: a 44px (36px with a mouse) target, quiet. */
const DESCRIBE =
  '-mr-3 flex shrink-0 cursor-pointer items-center justify-center self-start rounded-full ' +
  'text-tertiary-label pointer-coarse:size-11 pointer-fine:-mr-2.5 pointer-fine:size-9 ' +
  'hover:text-secondary-label focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
  'focus-visible:outline-accent';
