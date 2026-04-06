import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-muted-foreground text-center">
        <p className="text-lg font-medium">{title}</p>
        <p className="text-sm">{description}</p>
      </div>
      <Button onClick={onAction} disabled={disabled}>
        <PlusIcon />
        {actionLabel}
      </Button>
    </div>
  );
}
