import { useTranslation } from 'react-i18next';
import { ROW_FRAME, ROW_SEPARATOR } from './GroupedSection';
import { ROW_LAYOUT, TAPPABLE } from './ListRow';

interface SuggestionRowsProps {
  /** The names to suggest, top to bottom (already chosen and limited by the caller). */
  names: readonly string[];
  /** A name was tapped. */
  onPick: (name: string) => void;
}

/**
 * Plain rows right under the field being typed in (`AddRow`), one per suggested name; tapping one
 * picks it; a hairline above them, as above any row after the field. A group named «Подсказки»; Tab reaches the rows after the field. Pressing a row with
 * the mouse doesn't take the focus from the field, so the field neither adds its half-typed text
 * nor closes the suggestions before the click lands.
 */
export function SuggestionRows({ names, onPick }: SuggestionRowsProps) {
  const { t } = useTranslation();
  if (names.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('ui.suggestions')}
      className={`relative col-span-full grid grid-cols-subgrid ${ROW_SEPARATOR}`}
    >
      {names.map((name) => (
        <button
          key={name}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            onPick(name);
          }}
          className={`${ROW_FRAME} ${ROW_LAYOUT} ${TAPPABLE} text-left`}
        >
          <span className="min-w-0 flex-1 truncate py-2.5 pointer-fine:py-1.5">{name}</span>
        </button>
      ))}
    </div>
  );
}
