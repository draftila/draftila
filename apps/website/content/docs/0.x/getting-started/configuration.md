---
title: Configuration
description: Configure database, authentication, storage, and more.
---

# Configuration

Draftila is configured through environment variables. Below is a complete reference.

## Database

Draftila supports **SQLite** (default) and **PostgreSQL**.

### SQLite (Default)

No configuration needed — SQLite is the default. The database file is created automatically.

```env
DB_DRIVER=sqlite
DATABASE_URL=file:/app/data/draftila.sqlite
```

### PostgreSQL

To use PostgreSQL, set the driver and connection string:

```env
DB_DRIVER=postgresql
DATABASE_URL=postgresql://user:password@host:5432/draftila
```

### Migrations

Database migrations run automatically on container startup. To skip them (e.g., if you run migrations separately):

```env
SKIP_DB_MIGRATE=1
```

## Authentication

Authentication is handled by [better-auth](https://www.better-auth.com/).

| Variable             | Description                                                    | Required |
| -------------------- | -------------------------------------------------------------- | -------- |
| `BETTER_AUTH_SECRET` | Secret key for signing tokens. Minimum 32 characters.          | Yes      |
| `BETTER_AUTH_URL`    | The URL where the API is accessible (used for auth callbacks). | Yes      |

```env
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3001
```

:::danger
Never reuse `BETTER_AUTH_SECRET` across environments. Changing it will invalidate all existing sessions.
:::

## Frontend

| Variable       | Description                                              | Default                 |
| -------------- | -------------------------------------------------------- | ----------------------- |
| `FRONTEND_URL` | The URL where the frontend is accessible. Used for CORS. | `http://localhost:3001` |

In Docker, the frontend is bundled with the API and served from the same origin, so this typically matches `BETTER_AUTH_URL`.

For local development with the Vite dev server:

```env
FRONTEND_URL=http://localhost:5173
```

## Storage

Uploaded files are stored on the local filesystem.

| Variable         | Description                                          | Default             |
| ---------------- | ---------------------------------------------------- | ------------------- |
| `STORAGE_DRIVER` | Storage driver. Currently only `local` is supported. | `local`             |
| `STORAGE_PATH`   | Directory for uploaded files.                        | `/app/data/storage` |

## Server

| Variable | Description                         | Default |
| -------- | ----------------------------------- | ------- |
| `PORT`   | The port the API server listens on. | `3001`  |

## Rate Limiting

| Variable            | Description                                                                                  | Default |
| ------------------- | -------------------------------------------------------------------------------------------- | ------- |
| `TRUSTED_PROXY_IPS` | Comma-separated IPs to trust for `X-Forwarded-For` headers. Set to `*` to trust all proxies. | Unset   |

When Draftila runs behind a reverse proxy, set this so rate limiting uses the real client IP instead of the proxy IP.

```env
TRUSTED_PROXY_IPS=127.0.0.1
```

When not behind a proxy, leave this unset — Bun's TCP socket IP is used directly.

## Admin Creation

Set these to automatically create an admin user on container startup:

| Variable         | Description                            | Required                 |
| ---------------- | -------------------------------------- | ------------------------ |
| `ADMIN_EMAIL`    | Admin email address.                   | No                       |
| `ADMIN_PASSWORD` | Admin password (minimum 8 characters). | No                       |
| `ADMIN_NAME`     | Admin display name.                    | No (defaults to "Admin") |

If the admin account already exists, these are ignored on subsequent starts.

## Full Example

```env
# Database (SQLite - default)
DB_DRIVER=sqlite
DATABASE_URL=file:/app/data/draftila.sqlite

# Database (PostgreSQL - alternative)
# DB_DRIVER=postgresql
# DATABASE_URL=postgresql://draftila:secret@db:5432/draftila

# Auth
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3001

# Frontend
FRONTEND_URL=http://localhost:3001

# Storage
STORAGE_DRIVER=local
STORAGE_PATH=/app/data/storage

# Server
PORT=3001

# Proxy (if behind nginx/caddy)
# TRUSTED_PROXY_IPS=127.0.0.1

# Admin (created on first start)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-please
ADMIN_NAME=Admin
```
