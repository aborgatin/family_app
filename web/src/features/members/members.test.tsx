import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, membersHandler, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function membersSection() {
  return screen.findByRole('region', { name: 'Взрослые' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Members list', () => {
  it('shows every Member with display name and email', async () => {
    server.use(membersHandler([anna, boris]));

    renderApp('/settings');

    const list = await within(await membersSection()).findByRole('list', { name: 'Взрослые' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Анна (вы)');
    expect(items[0]).toHaveTextContent('anna@example.com');
    expect(items[1]).toHaveTextContent('Борис');
    expect(items[1]).not.toHaveTextContent('(вы)');
    expect(items[1]).toHaveTextContent('boris@example.com');
  });

  it('says so when the Members cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/members', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([anna, boris]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await membersSection();
    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    expect(await within(section).findByText('boris@example.com')).toBeInTheDocument();
  });
});
