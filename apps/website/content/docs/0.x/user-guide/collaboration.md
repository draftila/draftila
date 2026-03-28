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
| Viewer | Read-only access                                              |

See [Projects & Drafts](/docs/user-guide/projects) for details on managing access.
