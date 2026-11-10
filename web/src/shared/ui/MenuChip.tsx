import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Icon } from './Icon';

/** One choice in a `MenuChip`'s menu. */
export interface MenuChipChoice {
  /** Already translated. */
  label: string;
  /** The current choice: ticked. */
  checked: boolean;
  /** Grey, for a choice that stands for "none" (e.g. «Без категории»). */
  muted?: boolean;
  onSelect: () => void;
}

export interface MenuChipProps {
  /** Already translated; shown on the chip (the current choice). */
  label: string;
  /** Already translated; the chip's accessible name (e.g. «Категория: Еда»). */
  accessibleLabel: string;
  /** The menu's choices, in order. */
  choices: readonly MenuChipChoice[];
  /** Tells whether the menu is open (a row keeps its editing state while it is). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A small grey pill that opens a menu of choices, the current one ticked (Radix DropdownMenu).
 * Tap, click, Enter or Space opens it; arrows move, Enter picks, Esc closes and the focus goes back
 * to the chip. E.g. an Item's Category under the Item being edited.
 */
export function MenuChip({ label, accessibleLabel, choices, onOpenChange }: MenuChipProps) {
  return (
    <DropdownMenu.Root modal={false} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        aria-label={accessibleLabel}
        className={
          'mt-1.5 inline-flex max-w-full cursor-pointer items-center gap-0.5 rounded-full bg-fill ' +
          'py-0.5 pr-1.5 pl-2.5 text-footnote text-label outline-none select-none ' +
          'pointer-coarse:min-h-7 focus-visible:outline-2 focus-visible:outline-accent'
        }
      >
        <span className="truncate">{label}</span>
        <span className="text-secondary-label">
          <Icon name="expand" size={14} />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 rounded-lg border border-separator bg-cell p-1 text-body shadow-xl"
        >
          <DropdownMenu.RadioGroup
            value={String(choices.findIndex(({ checked }) => checked))}
            onValueChange={(value) => {
              choices[Number(value)]?.onSelect();
            }}
          >
            {choices.map((choice, n) => (
              <DropdownMenu.RadioItem
                key={n}
                value={String(n)}
                className={
                  'flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-3 pl-2 outline-none ' +
                  'select-none pointer-coarse:min-h-11 data-highlighted:bg-accent ' +
                  'data-highlighted:text-on-accent ' +
                  (choice.muted === true ? 'text-secondary-label' : 'text-label')
                }
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Icon name="check" size={16} />
                  </DropdownMenu.ItemIndicator>
                </span>
                {choice.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
