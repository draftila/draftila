---
title: Introduction
description: Learn what Draftila is and how it works.
---

# Introduction

Draftila is a free, open-source, and self-hosted design tool. It's a lightweight alternative to Figma that you can run on your own server.

## Features

- **Real-time collaboration** — Work together with your team in real-time using CRDTs
- **Vector shapes** — Rectangles, ellipses, polygons, stars, lines, and freeform paths
- **Pen tool** — Draw precise vector paths with Bezier curves
- **Text editing** — Rich text with fonts, styles, alignment, and auto-sizing
- **Frames & auto-layout** — Flex-like layout system for responsive designs
- **Components** — Create reusable design elements with linked instances
- **Boolean operations** — Union, subtract, intersect, and exclude shapes
- **Images** — Import and manipulate images with drag-drop, clipboard paste, and fill options
- **Export** — Export as SVG or PNG with configurable resolution
- **Constraints** — Pin elements for responsive behavior
- **Pages** — Organize designs across multiple pages
- **Comments** — Threaded discussions pinned to the canvas
- **Figma clipboard** — Paste elements from Figma directly into Draftila
- **MCP integration** — Let AI agents design in Draftila via the Model Context Protocol
- **Self-hosted** — Full control over your data, deploy anywhere
- **Open source** — MIT licensed, contribute and customize freely

## Architecture

Draftila is built as a TypeScript monorepo using Turborepo and Bun:

- **API** — Hono + Bun backend with PostgreSQL/SQLite and Prisma ORM
- **Web** — React 19 + Vite frontend with Tailwind, Zustand, and TanStack Query
- **Engine** — Core rendering engine (canvas, scene graph, tools, hit-testing)
- **Shared** — Common Zod schemas and TypeScript types

## Getting Started

To deploy Draftila on your own server, follow the [Installation](/docs/getting-started/installation) guide.

To learn how to use the editor, start with [Editor Basics](/docs/user-guide/editor-basics).
