import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

describe('App', () => {
  it('shows the Russian empty state on the home screen', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);

    renderApp('/');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
  });
});
