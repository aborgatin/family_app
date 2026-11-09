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

/** A Child field as the API returns it: the Default «Вес». */
export const weight = {
  id: '7a2d3d2f-0000-4000-8000-000000000001',
  name: 'Вес',
  valueType: 'TEXT',
  position: 1,
  version: 3,
  updatedAt: '2026-11-07T09:00:00Z',
};

/** The Default «Рост». */
export const height: typeof weight = {
  id: '7a2d3d2f-0000-4000-8000-000000000002',
  name: 'Рост',
  valueType: 'TEXT',
  position: 2,
  version: 4,
  updatedAt: '2026-11-07T09:00:00Z',
};

/** `GET /api/child-fields` answering with the given Child fields. */
export function childFieldsHandler(fields: (typeof weight)[]) {
  return http.get('/api/child-fields', () => HttpResponse.json(fields));
}

/** An active Invite as `GET /api/invites` returns it (no `url`). */
export interface InviteFixture {
  id: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

/** `GET /api/invites` answering with the given active Invites. */
export function invitesHandler(invites: InviteFixture[]) {
  return http.get('/api/invites', () => HttpResponse.json(invites));
}

/**
 * A Child as the sync pull returns its fields (`syncServer.seed('child', [masha])`).
 */
export const masha = {
  id: '0c3e4a52-0000-4000-8000-000000000011',
  name: 'Маша',
  color: 'coral',
  birthday: '2019-04-12' as string | null,
};

/** A second Child, without a birthday. */
export const petya: typeof masha = {
  id: '0c3e4a52-0000-4000-8000-000000000012',
  name: 'Петя',
  color: 'blue',
  birthday: null,
};

/** `GET /api/auth/session` answering with the given state; counts how often it was asked. */
export function sessionHandler(body: { bootstrapRequired: boolean; member: typeof anna | null }) {
  const calls = { count: 0 };
  const handler = http.get('/api/auth/session', () => {
    calls.count += 1;
    return HttpResponse.json(body);
  });
  return { handler, calls };
}
