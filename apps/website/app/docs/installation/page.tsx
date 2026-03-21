import type { Metadata } from 'next';
import { CopyButton } from '@/components/copy-button';

export const metadata: Metadata = {
  title: 'Installation',
  description: 'Self-host Draftila on your own server with Docker in minutes.',
};

const dockerCompose = `services:
  draftila:
    image: draftila/draftila:latest
    ports:
      - '3001:3001'
    environment:
      BETTER_AUTH_SECRET: '\${BETTER_AUTH_SECRET}'
      BETTER_AUTH_URL: 'https://draftila.example.com'
      FRONTEND_URL: 'https://draftila.example.com'
    volumes:
      - draftila_data:/app/data
    restart: unless-stopped

volumes:
  draftila_data:`;

const envVariables: { name: string; required: boolean; default: string; description: string }[] = [
  {
    name: 'BETTER_AUTH_SECRET',
    required: true,
    default: '',
    description:
      'A random secret used for signing auth tokens. Generate with: openssl rand -base64 32',
  },
  {
    name: 'BETTER_AUTH_URL',
    required: false,
    default: 'http://localhost:3001',
    description: 'The public URL of your Draftila instance. Used for auth callbacks.',
  },
  {
    name: 'FRONTEND_URL',
    required: false,
    default: 'http://localhost:3001',
    description: 'The public URL for the frontend. Usually the same as BETTER_AUTH_URL.',
  },
  {
    name: 'PORT',
    required: false,
    default: '3001',
    description: 'The port the server listens on inside the container.',
  },
  {
    name: 'DB_DRIVER',
    required: false,
    default: 'sqlite',
    description: 'Database driver. Use "sqlite" for single-server or "postgres" for production.',
  },
  {
    name: 'DATABASE_URL',
    required: false,
    default: 'file:/app/data/draftila.sqlite',
    description:
      'Database connection string. For PostgreSQL: postgres://user:pass@host:5432/draftila',
  },
  {
    name: 'STORAGE_DRIVER',
    required: false,
    default: 'local',
    description: 'File storage driver. "local" stores files on disk.',
  },
  {
    name: 'STORAGE_PATH',
    required: false,
    default: '/app/data/storage',
    description: 'Path for local file storage inside the container.',
  },
  {
    name: 'TRUSTED_PROXY_IPS',
    required: false,
    default: '',
    description: 'Comma-separated list of trusted reverse proxy IPs for X-Forwarded-For.',
  },
  {
    name: 'SKIP_DB_MIGRATE',
    required: false,
    default: '0',
    description: 'Set to "1" to skip automatic database migrations on startup.',
  },
];

function CodeBlock({ children, id }: { children: string; id: string }) {
  return (
    <div className="group relative">
      <CopyButton text={children} />
      <pre
        id={id}
        className="bg-muted/50 overflow-x-auto rounded-lg border p-4 text-sm leading-relaxed"
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function InstallationPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Installation</h1>
      <p className="text-muted-foreground mt-3 text-lg">
        Self-host Draftila on your own server with Docker in minutes.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Quick Start</h2>
        <p className="text-muted-foreground mt-2">
          The fastest way to get Draftila running. This uses SQLite and local file storage — no
          external dependencies needed.
        </p>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">1. Generate an auth secret:</p>
          <CodeBlock id="secret-cmd">openssl rand -base64 32</CodeBlock>

          <p className="text-sm font-medium">2. Start with a single command:</p>
          <CodeBlock id="quick-start">{`docker run -d \\
  --name draftila \\
  -p 3001:3001 \\
  -e BETTER_AUTH_SECRET="your-generated-secret" \\
  -v draftila_data:/app/data \\
  --restart unless-stopped \\
  draftila/draftila:latest`}</CodeBlock>

          <p className="text-muted-foreground mt-2 text-sm">
            Open{' '}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">http://localhost:3001</code> to
            get started.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Docker Compose</h2>
        <p className="text-muted-foreground mt-2">
          For production, use Docker Compose for easier management and updates.
        </p>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">
            Create a{' '}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">docker-compose.yml</code>:
          </p>
          <CodeBlock id="docker-compose">{dockerCompose}</CodeBlock>

          <p className="text-sm font-medium">Start it:</p>
          <CodeBlock id="compose-up">docker compose up -d</CodeBlock>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">PostgreSQL</h2>
        <p className="text-muted-foreground mt-2">
          For teams or high-availability setups, use PostgreSQL instead of SQLite.
        </p>

        <div className="mt-4">
          <CodeBlock id="postgres-compose">{`services:
  draftila:
    image: draftila/draftila:latest
    ports:
      - '3001:3001'
    environment:
      BETTER_AUTH_SECRET: '\${BETTER_AUTH_SECRET}'
      BETTER_AUTH_URL: 'https://draftila.example.com'
      FRONTEND_URL: 'https://draftila.example.com'
      DB_DRIVER: 'postgres'
      DATABASE_URL: 'postgres://draftila:password@db:5432/draftila'
    volumes:
      - draftila_storage:/app/data/storage
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: draftila
      POSTGRES_PASSWORD: password
      POSTGRES_DB: draftila
    volumes:
      - draftila_db:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U draftila']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  draftila_storage:
  draftila_db:`}</CodeBlock>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Environment Variables</h2>
        <p className="text-muted-foreground mt-2">All available configuration options.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 text-left font-medium">Variable</th>
                <th className="py-3 pr-4 text-left font-medium">Default</th>
                <th className="py-3 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {envVariables.map((v) => (
                <tr key={v.name} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <code className="bg-muted whitespace-nowrap rounded px-1.5 py-0.5 text-xs">
                      {v.name}
                    </code>
                    {v.required && (
                      <span className="ml-1.5 text-xs font-medium text-pink-600 dark:text-pink-400">
                        required
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-3 pr-4 font-mono text-xs">
                    {v.default || '—'}
                  </td>
                  <td className="text-muted-foreground py-3 text-sm">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Reverse Proxy</h2>
        <p className="text-muted-foreground mt-2">
          When running behind a reverse proxy (Nginx, Caddy, Traefik), make sure to:
        </p>
        <ul className="text-muted-foreground mt-3 list-inside list-disc space-y-1.5 text-sm">
          <li>
            Set <code className="bg-muted rounded px-1.5 py-0.5 text-xs">BETTER_AUTH_URL</code> and{' '}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">FRONTEND_URL</code> to your
            public domain
          </li>
          <li>Forward WebSocket connections (needed for real-time collaboration)</li>
          <li>
            Add your proxy IP to{' '}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">TRUSTED_PROXY_IPS</code>
          </li>
        </ul>

        <p className="mt-4 text-sm font-medium">Caddy example:</p>
        <CodeBlock id="caddy">{`draftila.example.com {
  reverse_proxy localhost:3001
}`}</CodeBlock>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Updating</h2>
        <p className="text-muted-foreground mt-2">Pull the latest image and restart:</p>
        <div className="mt-4">
          <CodeBlock id="update">{`docker compose pull
docker compose up -d`}</CodeBlock>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Database migrations run automatically on startup. Set{' '}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">SKIP_DB_MIGRATE=1</code> to
          disable.
        </p>
      </section>
    </div>
  );
}
