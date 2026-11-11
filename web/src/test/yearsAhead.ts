/*
 * `TEST_YEARS_AHEAD=1 npm test` (`npm run test:next-year`) runs the suite with the device clock a
 * year ahead, so a test whose fixtures only work before some real date fails now rather than when
 * that date passes (the M4 retro, #94: two tests broke once the real date passed their fixtures).
 * Only the real clock moves: a test that fixes the time with `vi.useFakeTimers({ now })` keeps it.
 * Imported first by setup.ts.
 */

const years = Number(process.env.TEST_YEARS_AHEAD ?? 0);

if (years) {
  const RealDate = Date;
  const ahead = new RealDate();
  ahead.setFullYear(ahead.getFullYear() + years);
  const offset = ahead.getTime() - RealDate.now();

  class DateAhead extends RealDate {
    constructor(...args: [] | ConstructorParameters<DateConstructor>) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }

    static override now(): number {
      return RealDate.now() + offset;
    }
  }

  // Called without `new`, Date() is now as a string; a class can't be called, so a Proxy answers.
  globalThis.Date = new Proxy(DateAhead, {
    apply: () => new DateAhead().toString(),
  }) as DateConstructor;
}
