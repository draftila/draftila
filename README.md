<p align="center">
  <img src="apps/web/src/assets/logo.svg" width="120" alt="Draftila" />
</p>

<h1 align="center">Draftila</h1>

<p align="center">Self-hosted, open-source design tool.</p>

## Installation

Create a `docker-compose.yml`:

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
    volumes:
      - draftila_data:/app/data
    restart: unless-stopped

volumes:
  draftila_data:
```

Run it:

```bash
docker compose up -d
```

Open [http://localhost:3001](http://localhost:3001) to get started.

> Generate a secret with: `openssl rand -base64 32`

See the [full installation guide](https://draftila.com/docs/installation) for configuration options.

## AI Disclaimer

AI generated and Human verified

## License

[Apache-2.0](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CONTRIBUTOR-AGREEMENT.md](CONTRIBUTOR-AGREEMENT.md).
