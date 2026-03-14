# AGENTS.md

## Project

Draftila — real-time collaborative design tool. TypeScript monorepo (Turborepo + Bun).

## Architecture

```
apps/api     Hono + Bun, PostgreSQL, Drizzle ORM, better-auth
apps/web     React 19, Vite, Tailwind v4, shadcn/ui, Zustand, TanStack Query
packages/    shared (Zod schemas + types), eslint-config, typescript-config
```

## Commands

| Task        | Command                   |
| ----------- | ------------------------- |
| Install     | `bun install`             |
| Dev (all)   | `bun run dev`             |
| Dev (API)   | `bun run api:dev`         |
| Build       | `bun run build`           |
| Lint        | `bun run lint`            |
| Format      | `bun run format`          |
| Test        | `bun run api:test`        |
| DB migrate  | `bun run api:db:migrate`  |
| DB generate | `bun run api:db:generate` |
| DB refresh  | `bun run api:db:refresh`  |
| Pre-commit  | `bun run pre-commit`      |

## Rules

### General

- **Never run dev servers.** Do not run `bun run dev`, `bun run api:dev`, or any long-running process. The user always has dev servers running in their own terminal.
- No code comments. Code must be self-documenting through clear naming and structure.
- No `any`. Use strict TypeScript. The codebase has `strict: true` and `noUncheckedIndexedAccess: true`.
- Prefix unused variables with `_`.
- Use the existing Prettier config (single quotes, semicolons, trailing commas, 100 print width).
- Run `bun run pre-commit` after every task. It must pass before considering work complete.

### API (`apps/api`)

- **100% test coverage.** Every route, service function, and utility must have tests. No exceptions.
- Tests live in `apps/api/tests/`, mirroring `src/` structure. File naming: `*.test.ts`.
- Integration tests use `app.request()` — no server startup needed.
- Use test helpers from `tests/helpers.ts` (`cleanDatabase`, `createTestUser`, `getAuthHeaders`).
- Call `cleanDatabase()` in `beforeEach` for test isolation.
- Module pattern: `src/modules/{name}/{name}.routes.ts` + `{name}.service.ts`. No controller layer.
- Routes handle HTTP concerns (parsing, validation, responses). Services handle business logic and DB access.
- Validate request bodies with Zod schemas from `@draftila/shared`. Return 400 with flattened errors on failure.
- Use `requireAuth` middleware for protected routes. User/session are on the Hono context.
- IDs use the custom `nanoid()` from `src/common/lib/utils.ts`.
- Schema changes require running `bun run api:db:generate` then `bun run api:db:migrate`.

### Frontend (`apps/web`)

- Use shadcn/ui components from `src/components/ui/`. Do not install alternative UI libraries.
- State: Zustand for client state, TanStack Query for server state. No prop drilling.
- Use the `@/*` path alias for imports.
- Route guards via `AuthGuard` / `GuestGuard` components.
- Auth via `better-auth` React client (`src/lib/auth-client.ts`).

### Shared (`packages/shared`)

- All data shapes shared between API and frontend must be Zod schemas here.
- Export both the Zod schema and the inferred TypeScript type.
- WebSocket event types live here.

## Adding a New API Module

1. Create `src/modules/{name}/{name}.routes.ts` and `{name}.service.ts`.
2. Add Zod schemas and types to `packages/shared`.
3. Add DB schema to `src/db/schema/`, re-export from `src/db/schema/index.ts`.
4. Generate and run migration.
5. Mount routes in `src/app.ts`.
6. Write tests in `tests/modules/{name}.test.ts` covering all routes and service functions.
7. Verify 100% coverage with `bun run api:test`.
