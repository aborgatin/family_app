import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  anna,
  childFieldsHandler,
  invitesHandler,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

describe('Home', () => {
  it('shows the large title «Семья» and the empty state', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);

    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Семья' })).toBeInTheDocument();
    expect(screen.getByText('Здесь пока пусто')).toBeInTheDocument();
  });

  it('opens Settings with the gear button in the nav bar', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    server.use(membersHandler([anna]), childFieldsHandler([]), invitesHandler([]));
    const user = userEvent.setup();

    const app = renderApp('/');
    const navBar = await screen.findByRole('banner');
    await user.click(within(navBar).getByRole('link', { name: 'Настройки' }));

    expect(app.location()).toBe('/settings');
  });
});
