# Wingbeat

Wingbeat is a local-first birding field log for planning watch outings, recording species
sightings, and reviewing what you have seen. A Preact single-page app talks to a typed Elysia HTTP
API, and the whole thing runs on your machine with no external services.

## Features

- **Plan watch outings** — create an outing with a title, location, date, habitat, and notes.
- **Record species sightings** — log a species against an outing with a count, a confidence level
  (`certain`, `probable`, `possible`), and an optional note.
- **Track outing status** — move an outing from `planned` to `in-progress` to `completed`.
- **Dashboard and activity** — review totals, distinct species, per-species tallies, and a
  reverse-chronological activity feed.
- **Deterministic sample data** — the in-memory store is seeded with the same outings and sightings
  on every boot, so tests, screenshots, and demos are reproducible.

## Stack

| Layer    | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| Frontend | Preact 10 + Vite 7 + TypeScript                                   |
| Backend  | Elysia 1 + `@elysiajs/node` + TypeScript                          |
| Storage  | Deterministic in-memory store (no database, no external services) |
| Tooling  | ESLint 10 (flat config), Prettier 3, Vitest 5                     |

## How data works

Everything lives in process memory. The store is seeded deterministically when the server starts,
so the app always opens on the same sample field log. **All changes are lost when the server
restarts** — Wingbeat has no persistence layer, no database, and no external integrations.

## Requirements

- Node.js 22.12 or newer (Node 22 LTS or 24 LTS recommended)
- npm 10 or newer

## Production setup

Three commands build and run Wingbeat from a fresh checkout:

```bash
npm ci
npm run build
npm start
```

Then open <http://localhost:4173>.

`npm start` runs the compiled production server from `dist/server/server.js` (built from
`src/server/server.ts`). It serves the built client from `dist/client` and the JSON API under
`/api`. Set `PORT` to listen on a different port (the default is `4173`):

```bash
PORT=8080 npm start
```

Check that the API is up with the health smoke endpoint:

```bash
curl http://localhost:4173/api/health
# {"status":"ok","service":"wingbeat"}
```

## Development

For a hot-reloading frontend:

```bash
npm run dev
```

Vite serves the client at <http://localhost:5173> and proxies `/api` requests to the local API at
<http://localhost:4173>, the default port of `npm start`. Start the API in a second terminal:

```bash
npm run build:server && npm start
```

## API overview

The API is JSON over HTTP. Failures return an `{ "error": "..." }` payload with a `400` (invalid or
missing fields) or `404` (unknown id) status.

| Method   | Route                        | Purpose                                                                      |
| -------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `GET`    | `/api/health`                | Liveness probe: `{ "status": "ok", "service": "wingbeat" }`.                 |
| `GET`    | `/api/dashboard`             | Aggregate stats, species tallies, and recent activity.                       |
| `GET`    | `/api/outings?status=&q=`    | List outings, optionally filtered by status or search text.                  |
| `POST`   | `/api/outings`               | Create an outing (`title`, `location`, `date`, `habitat`, optional `notes`). |
| `GET`    | `/api/outings/:id`           | Fetch one outing with its sightings.                                         |
| `PATCH`  | `/api/outings/:id`           | Update an outing's `status` and/or `notes`.                                  |
| `POST`   | `/api/outings/:id/sightings` | Log a sighting (`species`, `count`, `confidence`, optional `note`).          |
| `DELETE` | `/api/sightings/:id`         | Remove a sighting.                                                           |
| `GET`    | `/api/activity`              | Reverse-chronological activity feed.                                         |

Outing statuses are `planned`, `in-progress`, and `completed`; sighting confidence values are
`certain`, `probable`, and `possible`. Because storage is in memory, every request sees the same
deterministic state for the lifetime of the process.

## Quality commands

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run lint`      | ESLint over the repository, then `prettier --check .`.              |
| `npm run typecheck` | Type-checks the client project and the Node server project.         |
| `npm test`          | Runs the Vitest suite once.                                         |
| `npm run build`     | Builds the client to `dist/client` and the server to `dist/server`. |
| `npm start`         | Runs the built server on port `4173`.                               |
| `npm run format`    | Rewrites files with Prettier.                                       |

## Project layout

```text
index.html            Vite entry document; loads /src/client/main.tsx
src/client/           Preact app, API helpers, and styles
src/server/server.ts  Production entry: Elysia + Node adapter -> dist/server/server.js
src/server.ts         Source-only re-export surface over src/server; not the production entry
src/server/           Routes, store, and domain types
dist/client/          Built frontend assets (generated by npm run build)
dist/server/          Compiled Node server output (generated by npm run build)
```

## License

[MIT](LICENSE)
