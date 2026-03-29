import { type ReactNode, useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface InspectSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function InspectSection({ title, children, defaultOpen = true }: InspectSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b px-3 py-2">
      <button
        className="flex w-full items-center gap-1 py-0.5"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChevronRight
          size={12}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-muted-foreground text-[11px] font-medium">{title}</span>
      </button>
      {open && <div className="mt-1 flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
