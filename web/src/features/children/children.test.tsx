import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  childrenHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Children list', () => {
  it('shows every Child with name, color and birthday, in the server’s order', async () => {
    server.use(childrenHandler([masha, petya]));

    renderApp('/settings');

    const section = await childrenSection();
    const list = await within(section).findByRole('list', { name: 'Дети' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Маша');
    expect(items[0]).toHaveTextContent('Коралловый');
    expect(items[0]).toHaveTextContent('12 апреля 2019');
    expect(items[1]).toHaveTextContent('Петя');
    expect(items[1]).toHaveTextContent('Синий');
  });

  it('says when there are no Children yet', async () => {
    server.use(childrenHandler([]));

    renderApp('/settings');

    expect(await within(await childrenSection()).findByText('Детей пока нет')).toBeInTheDocument();
  });

  it('says so when the Children cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/children', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([masha]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    expect(await within(section).findByText('Маша')).toBeInTheDocument();
  });
});
