import { useCallback, useEffect, useState } from 'react';
import type { Member } from '@/features/auth';
import { ApiError, asApiError } from '@/shared/api';
import { fetchMembers } from './membersApi';

export type MembersLoad =
  | { status: 'loading' }
  | { status: 'failed'; error: ApiError }
  | { status: 'ready'; members: Member[] };

/**
 * The Family's Members, loaded from the server each time Settings opens (online-only, S4
 * exception). `replaced` puts a changed Member into the list without asking the server again.
 */
export function useMembers() {
  const [load, setLoad] = useState<MembersLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchMembers().then(
      (members) => {
        if (current) setLoad({ status: 'ready', members });
      },
      (error: unknown) => {
        if (current) {
          setLoad({
            status: 'failed',
            error: asApiError(error),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const replaced = useCallback((member: Member) => {
    setLoad((previous) =>
      previous.status === 'ready'
        ? {
            status: 'ready',
            members: previous.members.map((m) => (m.id === member.id ? member : m)),
          }
        : previous,
    );
  }, []);

  return { load, retry, replaced };
}
