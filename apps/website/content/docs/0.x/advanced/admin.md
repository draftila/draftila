---
title: Admin Panel
description: Manage users and system settings from the admin panel.
---

# Admin Panel

The admin panel is available to users with the **admin** role. Access it from the sidebar navigation.

## User Management

The admin panel provides a complete user management interface.

### Viewing Users

The users table shows all registered users with:

- Name
- Email
- Role (admin or user)
- Created date

Use the search bar to filter users by name or email.

### Creating Users

Click **Create User** to add a new user:

- **Name** — Display name
- **Email** — Must be unique
- **Password** — Minimum 8 characters
- **Role** — Admin or User

### Editing Users

Click a user to edit their details:

- Update name or email
- Change their role

### Resetting Passwords

Admins can reset any user's password from the user detail view.

### Deleting Users

Remove a user account from the system. This action cannot be undone.

## Initial Admin Setup

The first admin user is created automatically when you set the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. See the [Installation](/docs/getting-started/installation) guide for details.

You can also create admin users from the command line:

```bash
docker exec <container> bun run --filter @draftila/api db:create-admin -- \
  --email admin@example.com \
  --password your-password \
  --name "Admin Name"
```
