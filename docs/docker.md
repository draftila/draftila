# Docker deployment guide

## What is included

- One Docker image that serves both API and frontend from a single process.
- One default `docker-compose.yml` service (`app`) using SQLite.
- Optional PostgreSQL support by adding a PostgreSQL service and changing env vars.
- Manual GitHub Actions workflow to push images to Docker Hub by branch or version tag.

## Local run with SQLite (default)

1. Set a strong auth secret:

```bash
export BETTER_AUTH_SECRET='replace-with-a-long-random-secret'
```

1. Build and run:

```bash
docker compose up -d --build
```

1. Open:

```text
http://localhost:3001
```

SQLite data is persisted in the `draftila_data` Docker volume.

## Optional PostgreSQL setup

Default compose has one service by design. If you want PostgreSQL, add a database service and change the app env values.

Example override file (`docker-compose.postgres.yml`):

```yaml
services:
  app:
    environment:
      DB_DRIVER: postgresql
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/draftila

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: draftila
    volumes:
      - draftila_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  draftila_pg_data:
```

Run with both compose files:

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d --build
```

## GitHub Actions Docker publish

Workflow file: `.github/workflows/docker-publish.yml`

It runs manually from the Actions tab with three inputs:

- `target`: branch name or version tag value.
- `target_type`: `branch` or `version`.
- `mark_latest`: if true, also pushes `latest`.

Tag behavior:

- Branch example: `target=main`, `target_type=branch` pushes `draftila/draftila:main`.
- Branch with latest: same as above plus `draftila/draftila:latest` when `mark_latest=true`.
- Version example: `target=v1.2.0`, `target_type=version` checks out `refs/tags/v1.2.0` and pushes `draftila/draftila:v1.2.0`.

## GitHub secrets required

In GitHub repository settings, add these Actions secrets:

- `DOCKERHUB_USERNAME`: your Docker Hub username.
- `DOCKERHUB_TOKEN`: Docker Hub access token with read/write permissions.

Recommended Docker Hub setup:

1. Create repository: `draftila/draftila`.
2. Create a Docker Hub access token from Account Settings -> Personal access tokens.
3. Store the token in `DOCKERHUB_TOKEN`.

## Notes

- The container runs DB migration (`prisma db push`) on start.
- Frontend is served by API from `apps/web/dist` in production.
- For production behind reverse proxy, set `BETTER_AUTH_URL`, `FRONTEND_URL`, and `TRUSTED_PROXY_IPS` to match your environment.
