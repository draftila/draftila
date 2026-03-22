---
title: Contributing
description: How to contribute to Draftila.
---

# Contributing

Thanks for your interest in contributing to Draftila.

## Before You Open a Pull Request

- Discuss significant changes in an issue first.
- Keep pull requests focused and small.
- Follow the existing project architecture and coding standards.

## Code Style

Draftila enforces a consistent code style:

- **No code comments** — code must be self-documenting through clear naming and structure.
- **Strict TypeScript** — `strict: true` and `noUncheckedIndexedAccess: true`. No `any`.
- **Prettier** — single quotes, semicolons, trailing commas, 100 character print width.
- **Unused variables** — prefix with `_`.

Run `bun run checks --fix` before submitting. All checks must pass.

## API Conventions

- **Module pattern**: `src/modules/{name}/{name}.routes.ts` + `{name}.service.ts`. No controller layer.
- **Routes** handle HTTP concerns (parsing, validation, responses).
- **Services** handle business logic and database access.
- **Validation** — use Zod schemas from `@draftila/shared`. Return 400 with flattened errors on failure.
- **Auth** — use `requireAuth` middleware for protected routes.
- **IDs** — use `nanoid()` from `src/common/lib/utils.ts`.

## Testing

- Tests live in `apps/api/tests/`, mirroring the `src/` structure.
- Integration tests use `app.request()` — no server startup needed.
- Use helpers from `tests/helpers.ts` (`cleanDatabase`, `createTestUser`, `getAuthHeaders`).
- Call `cleanDatabase()` in `beforeEach` for test isolation.
- **100% line coverage** is enforced on all API source files.

## Frontend Conventions

- Use shadcn/ui components from `src/components/ui/`.
- **State**: Zustand for client state, TanStack Query for server state. No prop drilling.
- Use the `@/*` path alias for imports.
- Auth via `better-auth` React client.
- Forms use shadcn Form components with Zod validation.

## Shared Package

All data shapes shared between API and frontend must be Zod schemas in `packages/shared`. Export both the Zod schema and the inferred TypeScript type.

## Contribution Terms

To keep Draftila sustainably open source and preserve future licensing flexibility, opening a pull request is treated as acceptance of the contributor agreement.

### What Submitting a Pull Request Confirms

- You have the right to submit your contribution.
- You grant the project maintainer the rights needed to use, redistribute, and relicense your contribution under Apache-2.0 and other future license terms.
- You understand your contribution remains available under this repository's open source license for the community.

### Rights Granted

You retain ownership of your contribution. You grant the maintainer a perpetual, worldwide, non-exclusive, irrevocable, royalty-free license to use, reproduce, modify, distribute, sublicense, and relicense your contribution.

### Patent License

To the extent your contribution includes patentable subject matter, you grant a perpetual, worldwide, non-exclusive, royalty-free patent license for claims you can license and that are necessarily infringed by using, modifying, or distributing your contribution.
