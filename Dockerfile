FROM oven/bun:1.1.38 AS builder

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

RUN bun run --filter @draftila/web build
RUN bun run --filter @draftila/api build

FROM oven/bun:1.1.38 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_DRIVER=sqlite
ENV DATABASE_URL=file:/app/data/draftila.sqlite
ENV BETTER_AUTH_URL=http://localhost:3001
ENV FRONTEND_URL=http://localhost:3001
ENV WEB_DIST_DIR=../web/dist

COPY --from=builder /app /app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh
RUN mkdir -p /app/data

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
