---
title: Installation
description: Run Draftila locally with one command or deploy it with Docker Compose.
---

# Installation

Draftila can run entirely on your computer. The command-line setup uses Docker and **SQLite**, so no external database or source checkout is required.

## Requirements

- Node.js 20.17 or newer
- Docker

## Local Quick Start

Run:

```bash
npx draftila start
```

The first start opens a terminal setup. Choose whether Draftila is available only on this computer or to devices on your local network, select a port, and create the first administrator. Passwords are sent directly to the running container and are not saved in the CLI configuration.

Common commands:

```bash
npx draftila start
npx draftila stop
npx draftila restart
npx draftila status
npx draftila config
npx draftila uninstall
```

`npx draftila config` changes the binding address and port and manages administrator accounts while Draftila is running.

## Uninstalling

The normal uninstall removes the container and image while preserving the configuration and `draftila_data` volume:

```bash
npx draftila uninstall
```

To permanently delete all projects, uploaded files, and local configuration:

```bash
npx draftila uninstall --purge
```

The purge command requires a separate destructive confirmation.

## Docker Compose

For a server deployment, create a `.env` file:

Create a `.env` file:

```env
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters
```

:::tip
Generate a secure secret with:

```bash
openssl rand -base64 32
```

:::

Create a `docker-compose.yml` file:

```yaml
services:
  app:
    image: draftila/draftila:latest
    ports:
      - '3001:3001'
    environment:
      BETTER_AUTH_SECRET: '${BETTER_AUTH_SECRET}'
      BETTER_AUTH_URL: 'http://localhost:3001'
      FRONTEND_URL: 'http://localhost:3001'
      ADMIN_EMAIL: 'admin@example.com'
      ADMIN_PASSWORD: 'change-me-please'
    volumes:
      - draftila_data:/app/data
    restart: unless-stopped

volumes:
  draftila_data:
```

Then start the service:

```bash
docker compose up -d
```

That's it. Draftila is now running at `http://localhost:3001` with SQLite, and your admin account is ready to use.

## Docker Compose Admin Setup

The first admin user is created automatically when you set the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. These are checked on every container start — if the admin already exists, it's a no-op.

You can also create admin users manually:

```bash
printf '%s' 'your-password' | docker exec -i <container> \
  bun run --filter @draftila/api db:create-admin -- \
  --email admin@example.com --password-stdin \
  --name "Admin Name"
```

## Using PostgreSQL

By default, Draftila uses SQLite which stores everything in a single file. This is great for small teams and simple deployments.

For larger deployments or when you need concurrent access from multiple instances, switch to PostgreSQL:

```yaml
services:
  app:
    image: draftila/draftila:latest
    ports:
      - '3001:3001'
    environment:
      DB_DRIVER: 'postgresql'
      DATABASE_URL: 'postgresql://draftila:secret@db:5432/draftila'
      BETTER_AUTH_SECRET: '${BETTER_AUTH_SECRET}'
      BETTER_AUTH_URL: 'http://localhost:3001'
      FRONTEND_URL: 'http://localhost:3001'
      ADMIN_EMAIL: 'admin@example.com'
      ADMIN_PASSWORD: 'change-me-please'
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: draftila
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: draftila
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

## Data Persistence

The `draftila_data` volume stores both the SQLite database and uploaded files. Make sure this volume is backed up regularly.

The default paths inside the container:

- SQLite database: `/app/data/draftila.sqlite`
- Uploaded files: `/app/data/storage/`

## Reverse Proxy

For production, put Draftila behind a reverse proxy with SSL. Here's an example with Nginx:

```nginx
server {
    listen 443 ssl;
    server_name draftila.example.com;

    ssl_certificate /etc/ssl/certs/draftila.pem;
    ssl_certificate_key /etc/ssl/private/draftila.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

:::warning
WebSocket support is required for real-time collaboration. Make sure your reverse proxy passes the `Upgrade` and `Connection` headers.
:::

When behind a reverse proxy, set `TRUSTED_PROXY_IPS` so rate limiting uses the real client IP:

```env
TRUSTED_PROXY_IPS=127.0.0.1
```

Set it to `*` to trust all proxies (e.g., when Nginx runs in the same Docker network).
