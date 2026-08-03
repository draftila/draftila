<p align="center">
  <img src="apps/web/src/assets/logo.svg" width="120" alt="Draftila" />
</p>

<h1 align="center">Draftila</h1>

<p align="center">Self-hosted, open-source collaborative design tool.</p>

## Installation

With Node.js 20.17 or newer installed, run:

```bash
npx draftila start
```

The first run opens a terminal setup for the binding address, port, and initial administrator.
The CLI downloads the production runtime for your operating system and runs it directly on your
computer. Docker and a source checkout are not required. Projects and uploaded files are stored in
Draftila's user data directory with SQLite.

Useful commands:

```bash
npx draftila stop
npx draftila restart
npx draftila status
npx draftila config
npx draftila uninstall
```

`uninstall` preserves projects and files. Use `npx draftila uninstall --purge` only when you
intend to permanently delete all local Draftila data.

For server deployments, create a `docker-compose.yml`:

```yaml
services:
  draftila:
    image: draftila/draftila:latest
    ports:
      - '3001:3001'
    environment:
      BETTER_AUTH_SECRET: 'change-me-to-a-random-secret'
      BETTER_AUTH_URL: 'http://localhost:3001'
      FRONTEND_URL: 'http://localhost:3001'
      ADMIN_EMAIL: 'admin@example.com'
      ADMIN_PASSWORD: 'change-me'
      STORAGE_DRIVER: 'local'
      STORAGE_PATH: './storage'
    volumes:
      - draftila_data:/app/data
      - draftila_storage:/app/data/storage
    restart: unless-stopped

volumes:
  draftila_data:
  draftila_storage:
```

Run it:

```bash
docker compose up -d
```

Open [http://localhost:3001](http://localhost:3001) to get started.

> Generate a secret with: `openssl rand -base64 32`

To create additional admin accounts on a running container:

```bash
printf '%s' 'your-password' | docker exec -i <container> \
  bun run --filter @draftila/api db:create-admin -- \
  --email admin@example.com --password-stdin \
  --name "Admin Name"
```

See the [full installation guide](https://draftila.com/docs/getting-started/installation) for configuration options.

## AI Disclaimer

AI generated and Human verified

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
