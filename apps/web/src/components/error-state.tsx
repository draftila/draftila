import { AlertCircle } from 'lucide-react';
import { ApiError } from '@/lib/api-client';

interface ErrorStateProps {
  error: Error | null;
}

function getErrorMessage(error: Error | null): string {
  if (!error) return 'An unexpected error occurred.';
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You do not have permission to access this page.';
    if (error.status === 404) return 'The requested resource was not found.';
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <AlertCircle className="text-muted-foreground h-10 w-10" />
      <p className="text-muted-foreground text-sm">{getErrorMessage(error)}</p>
    </div>
  );
}
