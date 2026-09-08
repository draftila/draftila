---
title: Projects & Drafts
description: Organize your work with projects, drafts, and team members.
---

# Projects & Drafts

Draftila organizes your work into projects and drafts.

## Projects

A project is a collection of drafts. Each project can have:

- A custom name
- An optional logo
- Multiple team members with different roles

### Creating a Project

Click the **New** button on the projects page to create a new project. Give it a name and optionally upload a logo.

### Project Settings

From the project settings page you can:

- Rename the project
- Upload or change the project logo
- Delete the project (owner only)

## Drafts

Drafts are design files that live inside projects. Each draft contains pages, layers, and all your design content.

### Creating a Draft

Create a new draft from the project view. Each draft starts with one blank page.

### Managing Drafts

- **Rename** — Change the draft name via context menu
- **Delete** — Remove a draft via context menu

### Draft Thumbnails

Draftila saves a preview when you leave a synced draft with design content. Thumbnails and
project logos are stored on the server and keep a stable file address when refreshed. If an
image is unavailable, the grid and list views show a placeholder. Opening a draft and returning
to the draft list generates its preview again.

For self-hosted installations, keep the configured `STORAGE_PATH` directory on persistent
storage alongside your database. Both are needed to preserve uploaded images across restarts
and deployments.

## Team Members

Projects support multiple team members with role-based access.

### Roles

| Role   | Can edit | Can manage members | Can delete project |
| ------ | -------- | ------------------ | ------------------ |
| Owner  | Yes      | Yes                | Yes                |
| Admin  | Yes      | Yes                | No                 |
| Editor | Yes      | No                 | No                 |
| Viewer | No       | No                 | No                 |

### Inviting Members

Project owners and admins can invite new members and assign them a role. Members see and can access all drafts within the project according to their role.
