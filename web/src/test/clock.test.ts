import { expect, it } from 'vitest';

// The test device's clock: one time zone everywhere (vite.config.ts), and a year ahead under
// `npm run test:next-year` (yearsAhead.ts).

it('runs every test in Moscow time, ahead of UTC', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-180);
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-180);
});

it('moves the real clock TEST_YEARS_AHEAD years ahead', () => {
  // performance's clock is never moved: it is the real time.
  const real = new Date(performance.timeOrigin + performance.now());
  const years = Number(process.env.TEST_YEARS_AHEAD ?? 0);
  expect(new Date().getFullYear()).toBe(real.getFullYear() + years);
  expect(new Date(Date.now()).getFullYear()).toBe(real.getFullYear() + years);
});
