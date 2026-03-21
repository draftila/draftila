import Link from 'next/link';

const sections = [
  {
    title: 'Getting Started',
    items: [
      {
        title: 'Introduction',
        description: 'Learn what Draftila is and how it works.',
      },
      {
        title: 'Installation',
        description: 'Self-host Draftila on your own server in minutes.',
      },
      {
        title: 'Configuration',
        description: 'Configure database, storage, and authentication.',
      },
    ],
  },
  {
    title: 'Core Concepts',
    items: [
      {
        title: 'Canvas & Camera',
        description: 'Understanding the infinite canvas and navigation.',
      },
      {
        title: 'Shapes & Objects',
        description: 'Working with vector shapes, text, and images.',
      },
      {
        title: 'Frames & Auto-Layout',
        description: 'Create responsive layouts with auto-layout frames.',
      },
    ],
  },
  {
    title: 'Collaboration',
    items: [
      {
        title: 'Real-Time Editing',
        description: 'How real-time collaboration works with Yjs CRDTs.',
      },
      {
        title: 'Projects & Teams',
        description: 'Organize designs into projects and invite team members.',
      },
    ],
  },
  {
    title: 'Architecture',
    items: [
      {
        title: 'Monorepo Structure',
        description: 'Overview of the Turborepo monorepo architecture.',
      },
      {
        title: 'API (Hono)',
        description: 'The Hono + Bun backend with Drizzle ORM.',
      },
      {
        title: 'Frontend (React)',
        description: 'The React 19 + Vite frontend with Zustand and TanStack Query.',
      },
      {
        title: 'Engine',
        description: 'The core rendering engine — canvas, scene graph, tools, and hit-testing.',
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
      <p className="text-muted-foreground mt-3 text-lg">
        Everything you need to self-host and get started with Draftila.
      </p>

      <div className="mt-12 space-y-12">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {section.items.map((item) => (
                <div
                  key={item.title}
                  className="bg-card hover:border-primary/30 rounded-xl border p-5 transition-colors"
                >
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-muted/50 mt-16 rounded-xl border p-8 text-center">
        <p className="text-muted-foreground">
          Documentation content coming soon. Contribute on{' '}
          <a
            href="https://github.com/draftila/draftila"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </div>
  );
}
