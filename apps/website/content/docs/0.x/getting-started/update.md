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

```bash
docker compose exec db pg_dump -U draftila draftila > backup.sql
```

## Version Pinning

Instead of using `latest`, you can pin to a specific version:

```yaml
services:
  draftila:
    image: ghcr.io/draftila/draftila:0.3.1
```

## Changelog

Check the [GitHub Releases](https://github.com/draftila/draftila/releases) page for the full changelog of each version.
