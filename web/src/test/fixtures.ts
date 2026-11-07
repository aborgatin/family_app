import { http, HttpResponse } from 'msw';

/** A Member as the API returns it (spec #5, API contract). */
export const anna = {
  id: '6f1c2c1e-0000-4000-8000-000000000001',
  email: 'anna@example.com',
  displayName: 'Анна',
  grammaticalGender: 'FEMININE',
  version: 1,
  updatedAt: '2026-11-07T10:00:00Z',
};

/** The second Member. */
export const boris: typeof anna = {
  id: '6f1c2c1e-0000-4000-8000-000000000002',
  email: 'boris@example.com',
  displayName: 'Борис',
  grammaticalGender: 'MASCULINE',
  version: 2,
  updatedAt: '2026-11-07T10:05:00Z',
};

/** `GET /api/members` answering with the given Members. */
export function membersHandler(members: (typeof anna)[]) {
  return http.get('/api/members', () => HttpResponse.json(members));
}

/** `GET /api/auth/session` answering with the given state; counts how often it was asked. */
export function sessionHandler(body: { bootstrapRequired: boolean; member: typeof anna | null }) {
  const calls = { count: 0 };
  const handler = http.get('/api/auth/session', () => {
    calls.count += 1;
    return HttpResponse.json(body);
  });
  return { handler, calls };
}
