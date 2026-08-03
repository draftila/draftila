# Docker deployment guide

## What is included

- One Docker image that serves both API and frontend from a single process.
- One default `docker-compose.yml` service (`app`) using SQLite.
- Optional PostgreSQL support by adding a PostgreSQL service and changing env vars.
- Manual GitHub Actions workflow to push images to Docker Hub by branch or version tag.
- A version-matched npm CLI that manages the image for local installations.

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

## GitHub Actions releases

Application releases and CLI publishing use separate manually triggered workflows.

### Application release

Workflow file: `.github/workflows/release.yml`

It runs manually from the Actions tab with three inputs:

- `version`: GitHub release and Docker image version.
- `prerelease`: marks the GitHub release as a pre-release.
- `latest`: publishes the Docker `latest` tag.

The workflow builds amd64 and arm64 images and publishes their multi-architecture manifest.

### CLI publish

Workflow file: `.github/workflows/publish-cli.yml`

It publishes the version currently declared in `apps/cli/package.json` without creating a Git tag,
GitHub release, root version bump, or Docker image. Select either the `latest` or `next` npm
distribution tag when starting the workflow.

The matching `draftila/draftila:<CLI version>` Docker image must already exist. The workflow verifies
the image, checks that the npm version has not already been published, and runs the CLI typecheck,
tests, build, and package verification before publishing.

## GitHub secrets required

In GitHub repository settings, add these Actions secrets:

- `DOCKERHUB_USERNAME`: your Docker Hub username.
- `DOCKERHUB_TOKEN`: Docker Hub access token with read/write permissions.
- `NPM_TOKEN`: granular npm access token with write access to the `draftila` package and
  **Bypass 2FA** enabled for CI publishing.

Recommended Docker Hub setup:

1. Create repository: `draftila/draftila`.
2. Create a Docker Hub access token from Account Settings -> Personal access tokens.
3. Store the token in `DOCKERHUB_TOKEN`.

## Notes

- The container runs DB migration (`prisma db push`) on start.
- Frontend is served by API from `apps/web/dist` in production.
- For production behind reverse proxy, set `BETTER_AUTH_URL`, `FRONTEND_URL`, and `TRUSTED_PROXY_IPS` to match your environment.
