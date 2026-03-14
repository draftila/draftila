import type { SortOrder } from '@draftila/shared';
import { ChevronDownIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'last_edited', label: 'Last edited' },
  { value: 'last_created', label: 'Last created' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

export function ProjectsToolbar() {
  const viewMode = useDashboardStore((s) => s.projectsViewMode);
  const setViewMode = useDashboardStore((s) => s.setProjectsViewMode);
  const sortOrder = useDashboardStore((s) => s.projectsSortOrder);
  const setSortOrder = useDashboardStore((s) => s.setProjectsSortOrder);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? 'Last edited';

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-auto">
            {sortLabel}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuRadioGroup
            value={sortOrder}
            onValueChange={(value) => setSortOrder(value as SortOrder)}
          >
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (value) setViewMode(value as 'grid' | 'list');
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="grid" aria-label="Grid view">
          <LayoutGridIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List view">
          <ListIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
