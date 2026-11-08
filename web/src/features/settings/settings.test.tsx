import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  childrenHandler,
  invitesHandler,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

describe('Settings', () => {
  beforeEach(() => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    server.use(childFieldsHandler([]), childrenHandler([]));
    server.use(membersHandler([anna, boris]), invitesHandler([]));
  });

  it('opens from the home screen', async () => {
    const user = userEvent.setup();

    const app = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Настройки' }));

    expect(await screen.findByRole('heading', { name: 'Настройки', level: 1 })).toBeInTheDocument();
    expect(app.location()).toBe('/settings');
  });

  it('is one page of grouped sections, in order', async () => {
    renderApp('/settings');

    await screen.findByRole('region', { name: 'Взрослые' });
    const names = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(names).toEqual([
      'Взрослые',
      'Приглашения',
      'Ваш профиль',
      'Дети',
      'Поля профиля',
      'Оформление',
    ]);
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('leads back to the home screen', async () => {
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await user.click(await screen.findByRole('link', { name: 'Семья' }));

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });
});

describe('Оформление', () => {
  beforeEach(() => {
    localStorage.clear();
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    server.use(childFieldsHandler([]), childrenHandler([]));
    server.use(membersHandler([anna, boris]), invitesHandler([]));
  });
  afterEach(() => {
    localStorage.clear();
  });

  async function themeChoice() {
    const section = await screen.findByRole('region', { name: 'Оформление' });
    return within(section).getByRole('radiogroup', { name: 'Тема' });
  }

  /** The `storage` events the theme script in index.html listens to. */
  function storageEvents() {
    const keys: (string | null)[] = [];
    const listener = (event: StorageEvent) => {
      keys.push(event.key);
    };
    window.addEventListener('storage', listener);
    const stop = () => {
      window.removeEventListener('storage', listener);
    };
    return { keys, stop };
  }

  it('starts at «Авто» on a device without a choice', async () => {
    renderApp('/settings');

    const choice = await themeChoice();
    expect(within(choice).getByRole('radio', { name: 'Авто' })).toBeChecked();
    expect(within(choice).getByRole('radio', { name: 'Светлая' })).not.toBeChecked();
    expect(within(choice).getByRole('radio', { name: 'Тёмная' })).not.toBeChecked();
  });

  it('starts at the choice stored on this device', async () => {
    localStorage.setItem('theme', 'light');

    renderApp('/settings');

    expect(within(await themeChoice()).getByRole('radio', { name: 'Светлая' })).toBeChecked();
  });

  it('stores «Тёмная» on this device and applies it at once', async () => {
    const events = storageEvents();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(within(await themeChoice()).getByRole('radio', { name: 'Тёмная' }));
    events.stop();

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(events.keys).toEqual(['theme']);
    expect(within(await themeChoice()).getByRole('radio', { name: 'Тёмная' })).toBeChecked();
  });

  it('forgets the choice for «Авто», so the system theme applies again', async () => {
    localStorage.setItem('theme', 'dark');
    const events = storageEvents();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(within(await themeChoice()).getByRole('radio', { name: 'Авто' }));
    events.stop();

    expect(localStorage.getItem('theme')).toBeNull();
    expect(events.keys).toEqual(['theme']);
  });
});
