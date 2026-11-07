import { setupServer } from 'msw/node';

/** MSW server shared by all tests. Tests add the handlers they need with `server.use(...)`. */
export const server = setupServer();
