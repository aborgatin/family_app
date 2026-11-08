import * as Popover from '@radix-ui/react-popover';
import { createContext, useContext, useLayoutEffect, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useServerReachable } from '@/shared/api';
import { Icon } from './Icon';

/**
 * The crossed globe, shown while the server can't be reached: after a request fails with
 * `network.unavailable`, until the next request gets an answer. Tapping it, or hovering it with a
 * mouse, shows «Нет связи с сервером». It disables nothing.
 *
 * `Page` puts it in its nav bar's trailing slot; on a screen without a nav bar `AppShell` shows it
 * in the same top-right spot (`OfflineCorner`).
 */
export function OfflineIndicator() {
  const { t } = useTranslation();
  const reachable = useServerReachable();
  const [tapped, setTapped] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (reachable) {
    return null;
  }

  function hover(value: boolean) {
    return (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        setHovered(value);
      }
    };
  }

  return (
    <Popover.Root
      open={tapped || hovered}
      onOpenChange={(open) => {
        // Esc or a tap elsewhere closes it, also when a mouse is still over the globe.
        setTapped(open);
        if (!open) {
          setHovered(false);
        }
      }}
    >
      <Popover.Trigger
        aria-label={t('offline.indicator')}
        onClick={(event) => {
          // A click while hovering keeps the message open instead of toggling it shut.
          event.preventDefault();
          const open = !tapped;
          setTapped(open);
          if (!open) {
            setHovered(false);
          }
        }}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        className={
          'inline-flex cursor-pointer items-center justify-center rounded-lg px-2 ' +
          'text-secondary-label hover:opacity-70 active:opacity-50 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
          'pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-fine:min-h-7 pointer-fine:min-w-7'
        }
      >
        <Icon name="offline" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            // Only a message: focus stays on the globe.
            event.preventDefault();
          }}
          className={
            'z-30 max-w-[calc(100vw-1rem)] rounded-xl border border-separator bg-cell px-3 py-2 ' +
            'text-subhead text-label shadow-lg'
          }
        >
          {t('offline.indicator')}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Counts the mounted nav bars, so the shell knows whether one holds the indicator. */
export const NavBarRegistry = createContext<(() => () => void) | null>(null);

/** Called by `Page`: while it is mounted, the indicator lives in its nav bar. */
export function useRegisterNavBar() {
  const register = useContext(NavBarRegistry);
  useLayoutEffect(() => register?.(), [register]);
}

/**
 * The nav bar's top-right spot for screens without one (auth screens, the start-up error), in the
 * same 640px column, plus the `role="status"` message that announces going offline and back.
 */
export function OfflineCorner({ navBarShown }: { navBarShown: boolean }) {
  const { t } = useTranslation();
  const reachable = useServerReachable();
  const [wasOffline, setWasOffline] = useState(false);
  if (!reachable && !wasOffline) {
    setWasOffline(true);
  }

  const announcement = !reachable
    ? t('offline.indicator')
    : wasOffline
      ? t('offline.restored')
      : '';

  return (
    <>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {!navBarShown && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-20 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex min-h-11 max-w-160 items-center justify-end pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] [&>*]:pointer-events-auto">
            <OfflineIndicator />
          </div>
        </div>
      )}
    </>
  );
}
