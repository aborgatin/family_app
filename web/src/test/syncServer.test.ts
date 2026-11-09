import { describe, expect, it } from 'vitest';
import { syncServer } from './syncServer';

// Test helpers fail loudly instead of silently doing nothing (the M2 retro, #65): an empty
// `seed` once left a List on the server and made a test pass or fail by timing.

describe('syncServer', () => {
  it('refuses to seed no rows, and points at how to remove one', () => {
    expect(() => {
      syncServer.seed('list', []);
    }).toThrow(/change\(table, id, 'deleted'\)/);
  });

  it('refuses to change a row it never had', () => {
    expect(() => {
      syncServer.change('list', 'no-such-id', { name: 'Аптека' });
    }).toThrow(/seed/);
  });
});
