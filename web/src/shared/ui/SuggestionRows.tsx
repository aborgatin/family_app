import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { ROW_SEPARATOR } from './GroupedSection';
import { ROW_LAYOUT, TAPPABLE } from './ListRow';

interface SuggestionRowsProps {
  /** The names to suggest, top to bottom (already chosen and limited by the caller). */
  names: readonly string[];
  /** A name was tapped. */
  onPick: (name: string) => void;
  /** With it, each row ends with a × that removes its name (no confirmation). */
  onRemove?: (name: string) => void;
}

/** The × at the end of a row: a 44px (36px with a mouse) target, a quiet icon until hovered. */
const REMOVE =
  'mr-1 flex shrink-0 cursor-pointer items-center justify-center rounded-full ' +
  'text-tertiary-label pointer-coarse:size-11 pointer-fine:size-9 hover:text-secondary-label ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

/** Pressing with the mouse doesn't take the focus from the field being typed in. */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

/**
 * Plain rows right under the field being typed in (`AddRow`), one per suggested name; tapping one
 * picks it; a hairline above them, as above any row after the field. A group named «Подсказки»; Tab reaches the rows after the field. Pressing a row with
 * the mouse doesn't take the focus from the field, so the field neither adds its half-typed text
 * nor closes the suggestions before the click lands. With `onRemove`, a × at the end of each row
 * («Удалить подсказку „Малоко“») removes the name instead.
 */
export function SuggestionRows({ names, onPick, onRemove }: SuggestionRowsProps) {
  const { t } = useTranslation();
  if (names.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('ui.suggestions')}
      className={`relative col-span-full grid grid-cols-subgrid ${ROW_SEPARATOR}`}
    >
      {names.map((name) => (
        <div key={name} className={`relative col-span-full flex items-center ${ROW_SEPARATOR}`}>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => {
              onPick(name);
            }}
            className={
              `${ROW_LAYOUT} ${TAPPABLE} min-w-0 flex-1 self-stretch px-4 text-left ` +
              'pointer-coarse:min-h-11 pointer-fine:min-h-9'
            }
          >
            <span className="min-w-0 flex-1 truncate py-2.5 pointer-fine:py-1.5">{name}</span>
          </button>
          {onRemove !== undefined && (
            <button
              type="button"
              aria-label={t('ui.removeSuggestion', { name })}
              onMouseDown={keepFocus}
              onClick={() => {
                onRemove(name);
              }}
              className={REMOVE}
            >
              <Icon name="clear" size={18} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
