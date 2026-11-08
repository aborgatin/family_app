import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { api } from '@/shared/api';
import { server } from '@/test/server';
import { AppShell, Button, Page } from '.';

const OFFLINE = 'Нет связи с сервером';

/** A request the screens below send on «Загрузить»; each test says how the server answers. */
function answer(response: () => Response) {
  server.use(http.get('/api/thing', response));
}

function LoadButton() {
  return (
    <Button
      onClick={() => {
        api.get('/api/thing').catch(() => undefined);
      }}
    >
      Загрузить
    </Button>
  );
}

/** The shell with a nav-bar screen at `/` and a screen without a nav bar (like login) at `/plain`. */
function renderShell(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          {
            path: '/',
            element: (
              <Page title="Экран">
                <LoadButton />
              </Page>
            ),
          },
          { path: '/plain', element: <LoadButton /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('Offline indicator', () => {
  it('shows in the nav bar after a request fails to reach the server', async () => {
    answer(() => HttpResponse.json({}));
    const user = userEvent.setup();
    renderShell('/');
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(screen.queryByRole('button', { name: OFFLINE })).toBeNull();

    answer(() => HttpResponse.error());
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    const navBar = screen.getByRole('banner');
    expect(await within(navBar).findByRole('button', { name: OFFLINE })).toBeInTheDocument();
  });

  it('hides after the next request reaches the server, even one that fails there', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/');
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();

    answer(() => HttpResponse.json({ code: 'unknown' }, { status: 500 }));
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: OFFLINE })).toBeNull();
    });
  });

  it('shows in the top-right corner on a screen without a nav bar', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/plain');

    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('keeps one indicator, in the nav bar, on a screen with one', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/');

    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    const indicators = await screen.findAllByRole('button', { name: OFFLINE });
    expect(indicators).toHaveLength(1);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: OFFLINE })).toBe(
      indicators[0],
    );
  });

  it('says «Нет связи с сервером» when tapped', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/');
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    await user.click(await screen.findByRole('button', { name: OFFLINE }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(OFFLINE);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('says «Нет связи с сервером» while a mouse hovers it', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/');
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    await user.hover(await screen.findByRole('button', { name: OFFLINE }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(OFFLINE);

    await user.unhover(screen.getByRole('button', { name: OFFLINE }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('announces going offline and coming back through a status message', async () => {
    answer(() => HttpResponse.error());
    const user = userEvent.setup();
    renderShell('/');
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));

    expect(await screen.findByRole('status')).toHaveTextContent(OFFLINE);

    answer(() => HttpResponse.json({}));
    await user.click(screen.getByRole('button', { name: 'Загрузить' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Связь с сервером восстановлена');
    });
  });
});
