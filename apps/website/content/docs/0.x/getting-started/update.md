---
title: Update
description: How to update Draftila to the latest version.
---

# Update

Keeping Draftila up to date ensures you have the latest features and security patches.

## Docker Compose

Pull the latest image and restart:

```bash
docker compose pull
docker compose up -d
```

Migrations will run automatically on startup.

## Backup Before Updating

:::warning
Always back up your database before updating.
:::

### SQLite (Default)

```bash
docker compose cp app:/app/data/draftila.sqlite ./backup.sqlite
```

### PostgreSQL

```bash
docker compose exec db pg_dump -U draftila draftila > backup.sql
```

## Version Pinning

Instead of using `latest`, you can pin to a specific version:

```yaml
services:
  app:
    image: draftila/draftila:0.4.4
```

## Changelog

Check the [GitHub Releases](https://github.com/draftila/draftila/releases) page for the full changelog of each version.
