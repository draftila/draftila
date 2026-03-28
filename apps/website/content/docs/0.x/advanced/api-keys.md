---
title: API Keys
description: Generate and manage API keys for programmatic access to Draftila.
---

# API Keys

API keys let you access Draftila programmatically — for example, to connect AI agents via the MCP integration.

## Generating a Key

1. Go to **Settings** > **API Keys** in the Draftila dashboard
2. Click **Create API Key**
3. Give the key a descriptive name (e.g., "Claude MCP")
4. Copy the key immediately — it is only shown once

:::warning
Store your API key securely. If you lose it, you'll need to create a new one.
:::

## Using an API Key

Include the API key in the `Authorization` header of your requests:

```bash
Authorization: Bearer <your-api-key>
```

## Managing Keys

The API Keys page shows all your active keys with:

- Name
- Creation date
- Last used date

You can delete (revoke) a key at any time. Revoked keys immediately stop working.

## Best Practices

- Create one key per integration so you can revoke them independently
- Use descriptive names so you know which key is used where
- Rotate keys periodically by creating a new one and deleting the old one
