import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

describe('App', () => {
  it('shows the Russian empty state on the home screen', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);

    renderApp('/');

    expect(await screen.findByText('Списков пока нет')).toBeInTheDocument();
  });

  it('shows the offline indicator while the server is unreachable, and «Повторить» still works', async () => {
    server.use(http.get('/api/auth/session', () => HttpResponse.error()));
    const user = userEvent.setup();

    renderApp('/');

    expect(await screen.findByRole('button', { name: 'Нет связи с сервером' })).toBeInTheDocument();
    // The globe shows as the request fails, «Повторить» a render later, once AuthGuard has the error.
    const retry = await screen.findByRole('button', { name: 'Повторить' });
    expect(retry).toBeEnabled();

    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    await user.click(retry);

    expect(await screen.findByText('Списков пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Нет связи с сервером' })).toBeNull();
  });
});
