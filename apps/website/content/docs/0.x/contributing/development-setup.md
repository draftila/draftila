---
title: Development Setup
description: Set up your local development environment for Draftila.
---

# Development Setup

This guide walks you through setting up Draftila locally for development.

## Prerequisites

- [Bun](https://bun.sh/) v1.1.38 or later
- [Node.js](https://nodejs.org/) v18+ (for some tooling)
- Git

## Clone and Install

```bash
git clone https://github.com/draftila/draftila.git
cd draftila
bun install
```

## Project Structure

Draftila is a TypeScript monorepo managed with [Turborepo](https://turbo.build/) and Bun workspaces:

```
apps/
  api/         Hono + Bun backend (PostgreSQL/SQLite, Drizzle ORM, better-auth)
  web/         React 19 + Vite frontend (Tailwind v4, shadcn/ui, Zustand, TanStack Query)
  website/     Next.js documentation site

packages/
  shared/      Zod schemas and TypeScript types shared between API and frontend
  engine/      Core rendering engine (canvas, scene graph, tools, hit-testing)
  eslint-config/
  typescript-config/
```

## Database Setup

Draftila supports both SQLite and PostgreSQL. For local development, SQLite is the easiest option.

### SQLite (Recommended for Development)

Create `apps/api/.env` from the example:

```bash
cp apps/api/.env.example apps/api/.env
```

Then update it to use SQLite:

```env
DB_DRIVER=sqlite
DATABASE_URL=file:./draftila.sqlite

BETTER_AUTH_SECRET=dev-secret-at-least-32-chars-long-for-draftila
BETTER_AUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
STORAGE_DRIVER=local
STORAGE_PATH=./storage
PORT=3001
```

### PostgreSQL

If you prefer PostgreSQL, make sure it's running locally and update your `.env`:

```env
DB_DRIVER=postgresql
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/draftila
```

### Run Migrations and Seed

```bash
bun run api:db:migrate
bun run api:db:seed
```

The seed creates a test admin user:

- Email: `test@draftila.com`
- Password: `password`

## Running the Dev Servers

Start all services (API + Web) in parallel:

```bash
bun run dev
```

Or start them individually:

```bash
bun run api:dev    # API at http://localhost:3001 (also opens Prisma Studio)
```

In a separate terminal:

```bash
cd apps/web && bun run dev    # Frontend at http://localhost:5173
```

The Vite dev server automatically proxies `/api` and `/storage` requests to the API at `localhost:3001`.

## Useful Commands

### Database

| Command                   | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `bun run api:db:generate` | Regenerate Prisma clients (both PostgreSQL and SQLite) |
| `bun run api:db:migrate`  | Push schema changes to the database                    |
| `bun run api:db:studio`   | Open Prisma Studio GUI                                 |
| `bun run api:db:seed`     | Create test user (dev/test only)                       |
| `bun run api:db:reset`    | Delete all data (dev/test only)                        |
| `bun run api:db:refresh`  | Reset + migrate + seed in one command                  |

### Quality Checks

| Command                 | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `bun run checks`        | Run all checks (formatting, typecheck, lint, tests + coverage) |
| `bun run checks --fix`  | Same but auto-fix formatting and lint issues                   |
| `bun run api:test`      | Run API tests                                                  |
| `bun run api:typecheck` | Typecheck the API                                              |
| `bun run format`        | Format all files with Prettier                                 |

### Other

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `bun run api:routes:list` | List all registered API routes              |
| `bun run build`           | Build all packages                          |
| `bun run clean`           | Remove all build artifacts and node_modules |

## Running Checks

Before submitting a PR, run the full check suite:

```bash
bun run checks
```

This runs:

1. Prettier formatting check
2. TypeScript type checking (API + Web)
3. ESLint
4. Engine tests
5. API tests with 100% line coverage enforcement

Use `--fix` to auto-fix formatting and lint issues:

```bash
bun run checks --fix
```
