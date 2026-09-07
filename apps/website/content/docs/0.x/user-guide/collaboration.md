---
title: Collaboration
description: Work together with your team in real-time.
---

# Collaboration

Draftila supports real-time collaboration powered by CRDTs (Yjs). Multiple users can edit the same draft simultaneously.

## Live Cursors

When others are editing the same draft, you see their cursors in real-time, labeled with their name and assigned a unique color. Up to 10 distinct colors are assigned automatically.

You can also see what tool each collaborator is currently using.

## Live Selection

Selected shapes are highlighted for all users — you can see exactly what your teammates are working on.

## Comments

Use the comment tool (`C`) to create discussion threads pinned to specific locations on the canvas.

- Click on the canvas to place a comment
- Write your message and submit
- Other users can reply to create a thread
- Mark comments as resolved when they're addressed
- Toggle comment visibility with `Shift` + `C`

Comments update in real-time for all collaborators.

## Sharing and Permissions

Drafts are shared through project membership. Each member is assigned a role:

| Role   | Capabilities                                                  |
| ------ | ------------------------------------------------------------- |
| Owner  | Full access, manage members, transfer ownership, delete draft |
| Admin  | Full access, manage members                                   |
| Editor | Edit draft content                                            |
| Viewer | View, inspect, export, and comment without editing the design |

Viewers can select shapes, navigate pages, pan and zoom, inspect properties, copy or export designs, and preview version history. Design tools, property editing, imports, and version creation or restoration are unavailable. These restrictions are enforced by the API, MCP, and collaborative document server, not only by the interface.

Comments remain available to viewers. Project members can create and reply to threads, move comment pins, and resolve threads. Only the author can edit or delete their own comments. Comment changes are applied by the server and shared with collaborators without granting permission to edit design content. Snapshot previews do not allow comment changes.

Changing a member's role closes their existing draft connections. The editor rechecks access and reconnects with the new permissions. Removing a member blocks further updates and stops document broadcasts to their connections; already downloaded content cannot be revoked.

See [Projects & Drafts](/docs/user-guide/projects) for details on managing access.
