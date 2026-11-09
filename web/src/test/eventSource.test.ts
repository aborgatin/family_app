import { describe, expect, it } from 'vitest';
import { FakeEventSource } from './eventSource';

// A server event sent to a connection the app already closed would silently reach no one; the
// stub says so instead (the M2 retro, #65).

describe('FakeEventSource', () => {
  it('refuses an event on a connection the app closed', () => {
    const sse = new FakeEventSource('/api/sync/events');
    sse.open();
    sse.close();

    expect(() => {
      sse.emit('changed', '{"version":1}');
    }).toThrow(/closed/);
  });

  it('refuses to open a connection the app closed', () => {
    const sse = new FakeEventSource('/api/sync/events');
    sse.close();

    expect(() => {
      sse.open();
    }).toThrow(/closed/);
  });
});
