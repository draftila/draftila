---
title: Version History
description: Save, preview, and restore named versions and auto-saves of your drafts.
---

# Version History

Draftila automatically saves snapshots of your work and lets you create named versions you can preview and restore at any time.

## Auto-Saves

Every time the last collaborator disconnects from a draft, an auto-save snapshot is created. Up to 50 auto-saves are kept per draft — older ones are pruned automatically.

## Saving a Named Version

You can save a named version at any point to bookmark a specific state of your design:

1. Press `Cmd/Ctrl` + `Alt` + `S`, or
2. Open the Version History panel and click **Save Version**

Give it a descriptive name (e.g. "Final header layout") and click **Save**.

## Opening Version History

- Click the **clock icon** in the toolbar, or
- Open the **hamburger menu** → **Version History**

The panel shows all versions grouped by day, with the most recent first. Use the **Show auto-saves** checkbox to toggle visibility of unnamed auto-save snapshots.

## Previewing a Version

Click any version entry to preview it. The canvas switches to a read-only view of that snapshot. A banner appears at the top with options to:

- **Restore** — replace the current draft state with this version
- **Back to current** — return to the live draft

While previewing, collaboration features (cursors, selections) are hidden.

## Restoring a Version

When you click **Restore**, the current state is saved as an auto-save (so you never lose work), then the draft is replaced with the selected version. All connected collaborators will automatically sync to the restored state.

## Renaming and Managing Versions

Right-click any version entry to:

- **Rename** a named version
- **Remove Name** to demote it back to an auto-save
- **Name This Version** to promote an auto-save to a named version
