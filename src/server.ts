/**
 * Wingbeat API entry surface.
 *
 * `tsconfig.server.json` roots the server build at `src/server`, so the compiled
 * entrypoint that `node dist/server/server.js` runs is `src/server/server.ts`.
 * This module exposes the same API surface for source-level consumers.
 */
export { createApp } from './server/app.js';
export { createStore } from './server/store.js';
export * from './server/types.js';
