# AGENTS.md

## Project

Draftila — real-time collaborative design tool. TypeScript monorepo (Turborepo + Bun).

## Architecture

```
apps/api     Hono + Bun, PostgreSQL, Drizzle ORM, better-auth
apps/web     React 19, Vite, Tailwind v4, shadcn/ui, Zustand, TanStack Query
packages/    shared (Zod schemas + types), eslint-config, typescript-config
```

## Rules

### TOP Level

- Security
- Maintainability
- Scalability
- Clean Code
- Clean Architecture
- Best Practices
- No Hacks

### General

- **Never run dev servers.** Do not run `bun run dev`, `bun run api:dev`, or any long-running process. The user always has dev servers running in their own terminal.
- No code comments. Code must be self-documenting through clear naming and structure.
- No `any`. Use strict TypeScript. The codebase has `strict: true` and `noUncheckedIndexedAccess: true`.
- Prefix unused variables with `_`.
- Use the existing Prettier config (single quotes, semicolons, trailing commas, 100 print width).
- Run `bun run checks --fix` after every task. It must pass before considering work complete.
- Follow the existing code style and patterns.
- No direct changes to the Canvas! Changes to canvas must go through Yjs because it is being triggered from both Web and MCP.
- No Hacks! No shortcuts! No symptom patches! Solutions are expected to be proper.
- Always consider other similar cases when solving a problem. For example, if working on live feedback for moving elements on auto-layout, consider resizing as well. and same for other related things.

### API (`apps/api`)

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
- as long as the app version in package.json is 0.0.0, Modify the existing migrations for altering or changing columns instead of creating new migrations

### Frontend (`apps/web`)

- Use shadcn/ui components from `src/components/ui/`. Do not install alternative UI libraries.
- State: Zustand for client state, TanStack Query for server state. No prop drilling.
- Use the `@/*` path alias for imports.
- Route guards via `AuthGuard` / `GuestGuard` components.
- Auth via `better-auth` React client (`src/lib/auth-client.ts`).
- Use shadcn Form components with Zod validation for any forms.

### Shared (`packages/shared`)

- All data shapes shared between API and frontend must be Zod schemas here.
- Export both the Zod schema and the inferred TypeScript type.
- WebSocket event types live here.

### Documentation

The documentation website is in apps/website. If adding a new feature or making a change to existing functionality, update the documentation accordingly.
