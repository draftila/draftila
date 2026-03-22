---
title: Introduction
description: Learn what Draftila is and how it works.
---

# Introduction

Draftila is a free, open-source, and self-hosted design tool. It's a lightweight alternative to Figma that you can run on your own server.

## Features

- **Real-time collaboration** — Work together with your team in real-time using CRDTs
- **Self-hosted** — Full control over your data, deploy anywhere
- **Open source** — MIT licensed, contribute and customize freely
- **Lightweight** — Fast and efficient, runs on minimal resources

## Architecture

Draftila is built as a TypeScript monorepo using Turborepo and Bun:

- **API** — Hono + Bun backend with PostgreSQL and Drizzle ORM
- **Web** — React 19 + Vite frontend with Tailwind, Zustand, and TanStack Query
- **Shared** — Common Zod schemas and TypeScript types

## Getting Started

To get started with Draftila, follow the [Installation](/docs/getting-started/installation) guide.
