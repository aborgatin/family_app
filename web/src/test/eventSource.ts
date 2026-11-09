/*
 * A controllable `EventSource` for tests (jsdom has none). `setup.ts` installs it as the global
 * `EventSource` before every test and forgets every instance after it. A test drives the
 * connection the app opened:
 *
 *   const sse = FakeEventSource.latest();   // the newest connection
 *   sse.open();                              // fires `open`
 *   sse.emit('changed', '{"version":42}');   // fires a named event (MessageEvent with data)
 *   sse.fail();                              // fires `error` (the browser would reconnect)
 *   expect(sse.closed).toBe(true);           // after the app called close()
 */
export class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  /** Every connection opened during the current test, oldest first. */
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  readyState = FakeEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string | URL, init?: EventSourceInit) {
    super();
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  /** The newest connection; fails the test if the app opened none. */
  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (latest === undefined) throw new Error('The app opened no EventSource');
    return latest;
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  get closed(): boolean {
    return this.readyState === FakeEventSource.CLOSED;
  }

  open() {
    this.refuseIfClosed('open');
    this.readyState = FakeEventSource.OPEN;
    const event = new Event('open');
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  /** A server event: `message` (also calls `onmessage`) or a named one such as `changed`. */
  emit(type: string, data: string) {
    this.refuseIfClosed(`emit '${type}' on`);
    const event = new MessageEvent(type, { data });
    if (type === 'message') this.onmessage?.(event);
    this.dispatchEvent(event);
  }

  fail() {
    const event = new Event('error');
    this.onerror?.(event);
    this.dispatchEvent(event);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Fails the test instead of sending into a connection no one listens on any more. */
  private refuseIfClosed(what: string) {
    if (this.closed) {
      throw new Error(`Can't ${what} an EventSource the app closed; use FakeEventSource.latest()`);
    }
  }
}
