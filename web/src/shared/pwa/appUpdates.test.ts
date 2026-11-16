import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELOAD_WINDOW_MS, startAppUpdates, type AppUpdateEnvironment } from './appUpdates';

/** A fake page: a document whose visibility the test sets, and a service worker container. */
function fakePage({ controlled = true, visible = true } = {}) {
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = visible ? 'visible' : 'hidden';
  const update = vi.fn(() => Promise.resolve());
  const container = new EventTarget() as EventTarget & {
    controller: object | null;
    getRegistration: () => Promise<{ update: typeof update } | undefined>;
  };
  container.controller = controlled ? {} : null;
  container.getRegistration = vi.fn(() => Promise.resolve({ update }));
  let time = 0;
  const reload = vi.fn();
  const env = {
    document: doc,
    serviceWorker: container,
    reload,
    now: () => time,
  } as unknown as AppUpdateEnvironment;

  return {
    env,
    reload,
    update,
    wait: (ms: number) => {
      time += ms;
    },
    hide: () => {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    show: () => {
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    touch: () => doc.dispatchEvent(new Event('pointerdown')),
    type: () => doc.dispatchEvent(new Event('keydown')),
    newWorker: () => container.dispatchEvent(new Event('controllerchange')),
  };
}

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe('startAppUpdates', () => {
  it('checks for an update each time the app comes back to the foreground', async () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.hide();
    page.show();
    await vi.waitFor(() => {
      expect(page.update).toHaveBeenCalledTimes(1);
    });
    page.hide();
    page.show();
    await vi.waitFor(() => {
      expect(page.update).toHaveBeenCalledTimes(2);
    });
  });

  it('reloads when a new worker takes over right after the app came back', () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.hide();
    page.show();
    page.wait(2_000);
    page.newWorker();

    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when a new worker takes over right after the page loaded', () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.wait(1_000);
    page.newWorker();

    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['touched', 'touch'],
    ['typed in', 'type'],
  ] as const)('waits for the next return when the page was %s', (_, action) => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.hide();
    page.show();
    page[action]();
    page.newWorker();
    expect(page.reload).not.toHaveBeenCalled();

    page.hide();
    expect(page.reload).not.toHaveBeenCalled();
    page.show();
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the next return when the app has been in the foreground for a while', () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.wait(RELOAD_WINDOW_MS + 1);
    page.newWorker();
    expect(page.reload).not.toHaveBeenCalled();

    page.hide();
    page.show();
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the next return when the new worker takes over in the background', () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.hide();
    page.newWorker();
    expect(page.reload).not.toHaveBeenCalled();

    page.show();
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on the first install, when the page had no worker', () => {
    const page = fakePage({ controlled: false });
    stop = startAppUpdates(page.env);

    page.newWorker();
    page.hide();
    page.show();

    expect(page.reload).not.toHaveBeenCalled();
  });

  it('reloads only once', () => {
    const page = fakePage();
    stop = startAppUpdates(page.env);

    page.newWorker();
    page.newWorker();
    page.hide();
    page.show();

    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing where there is no service worker', () => {
    const page = fakePage();
    stop = startAppUpdates({ ...page.env, serviceWorker: undefined });

    page.hide();
    page.show();

    expect(page.update).not.toHaveBeenCalled();
  });

  it('stops watching when stopped', () => {
    const page = fakePage();
    startAppUpdates(page.env)();

    page.newWorker();

    expect(page.reload).not.toHaveBeenCalled();
  });
});
