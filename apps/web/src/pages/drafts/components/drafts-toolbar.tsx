import { useRef } from 'react';
import type { SortOrder, Project } from '@draftila/shared';
import { sanitizeFilename } from '@draftila/shared';
import { ChevronDownIcon, DownloadIcon, LayoutGridIcon, ListIcon, UploadIcon } from 'lucide-react';
import { downloadBlob } from '@draftila/engine';
import { toast } from 'sonner';
import { useExportAllDrafts, useImportDraft } from '@/api/drafts';
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

interface DraftsToolbarProps {
  projects: Project[];
}

export function DraftsToolbar({ projects }: DraftsToolbarProps) {
  const selectedProjectId = useDashboardStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);
  const viewMode = useDashboardStore((s) => s.viewMode);
  const setViewMode = useDashboardStore((s) => s.setViewMode);
  const sortOrder = useDashboardStore((s) => s.sortOrder);
  const setSortOrder = useDashboardStore((s) => s.setSortOrder);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectLabel = selectedProjectId ? (selectedProject?.name ?? 'Project') : 'All projects';
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? 'Last edited';

  const importDraft = useImportDraft(selectedProjectId ?? '');
  const exportAllDrafts = useExportAllDrafts(selectedProjectId ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    importDraft.mutate(file, {
      onSuccess: (draft) => {
        toast.success(`Imported "${draft.name}"`);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to import draft');
      },
    });
  }

  function handleExportAll() {
    exportAllDrafts.mutate(undefined, {
      onSuccess: async (result) => {
        if (result.type === 'zip') {
          await downloadBlob(result.blob, 'drafts.draftila.zip');
        } else if (result.type === 'empty') {
          toast.info('No drafts to export');
          return;
        } else {
          const json = JSON.stringify(result.data, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const name = sanitizeFilename(result.data.draft.name);
          await downloadBlob(blob, `${name}.draftila.json`);
        }
        toast.success('Drafts exported');
      },
      onError: () => {
        toast.error('Failed to export drafts');
      },
    });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-auto">
            {projectLabel}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={selectedProjectId ?? 'all'}
            onValueChange={(value) => setSelectedProjectId(value === 'all' ? null : value)}
          >
            <DropdownMenuRadioItem value="all">All projects</DropdownMenuRadioItem>
            {projects.map((project) => (
              <DropdownMenuRadioItem key={project.id} value={project.id}>
                {project.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <div className="ml-auto flex items-center gap-2">
        {selectedProjectId && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.draftila.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
              disabled={importDraft.isPending}
            >
              <UploadIcon />
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAll}
              disabled={exportAllDrafts.isPending}
            >
              <DownloadIcon />
              Export All
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
