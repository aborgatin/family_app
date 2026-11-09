import { setupServer } from 'msw/node';
import { syncServer } from './syncServer';

/**
 * MSW server shared by all tests. It always answers the sync API with the fake `syncServer`
 * (empty unless a test seeds it); tests add the other handlers they need with `server.use(...)`.
 */
export const server = setupServer(...syncServer.handlers);
