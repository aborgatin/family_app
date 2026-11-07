import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/renderApp';

describe('App', () => {
  it('shows the Russian empty state on the home screen', async () => {
    renderApp('/');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
  });
});
