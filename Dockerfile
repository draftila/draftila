FROM oven/bun:1.1.38 AS builder

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts
RUN cd apps/api && bunx prisma generate --schema prisma/postgresql/schema.prisma && bunx prisma generate --schema prisma/sqlite/schema.prisma

RUN bun run --filter @draftila/web build
RUN bun run --filter @draftila/api build

FROM oven/bun:1.1.38 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_DRIVER=sqlite
ENV DATABASE_URL=file:/app/data/draftila.sqlite
ENV WEB_DIST_DIR=../web/dist
ENV STORAGE_DRIVER=local
ENV STORAGE_PATH=/app/data/storage

COPY --from=builder /app /app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh
RUN mkdir -p /app/data /app/data/storage

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
