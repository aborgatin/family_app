import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  invitesHandler,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

describe('Settings', () => {
  beforeEach(() => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    server.use(childFieldsHandler([]));
    server.use(membersHandler([anna, boris]), invitesHandler([]));
  });

  it('opens from the home screen', async () => {
    const user = userEvent.setup();

    const app = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Настройки' }));

    expect(await screen.findByRole('heading', { name: 'Настройки', level: 1 })).toBeInTheDocument();
    expect(app.location()).toBe('/settings');
  });

  it('has sections for Members, Children and Child fields', async () => {
    renderApp('/settings');

    expect(await screen.findByRole('region', { name: 'Взрослые' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Дети' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Поля профиля' })).toBeInTheDocument();
  });

  it('leads back to the home screen', async () => {
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await user.click(await screen.findByRole('link', { name: 'На главную' }));

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });
});
