import { Button } from '@/components/ui/button';

export function HomePage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold">Draftila</h1>
      <p className="text-muted-foreground">Design tool — coming soon.</p>
      <div className="flex gap-3">
        <Button>Get Started</Button>
        <Button variant="outline">Learn More</Button>
      </div>
    </div>
  );
}
