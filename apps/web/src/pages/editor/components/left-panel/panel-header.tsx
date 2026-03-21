import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type * as Y from 'yjs';
import { LayoutGrid, File, PanelLeft, Upload, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { addShape } from '@draftila/engine/scene-graph';
import {
  initializeDefaultAdapters,
  importSvgFile,
  interchangeToShapeData,
} from '@draftila/engine/interchange';
import { useEditorStore } from '@/stores/editor-store';

function ViewMenuItems() {
  const rulersVisible = useEditorStore((s) => s.rulersVisible);

  return (
    <DropdownMenuCheckboxItem
      checked={rulersVisible}
      onCheckedChange={(checked) => {
        useEditorStore.getState().setRulersVisible(checked);
        useEditorStore.getState().setGuidesVisible(checked);
      }}
    >
      Rulers & Guides
      <span className="text-muted-foreground ml-auto pl-4 text-[11px]">{'\u21E7R'}</span>
    </DropdownMenuCheckboxItem>
  );
}

interface PanelHeaderProps {
  draftName: string;
  projectName: string | undefined;
  leftPanelOpen: boolean;
  onTogglePanel: () => void;
  ydoc: Y.Doc;
}

export function PanelHeader({
  draftName,
  projectName,
  leftPanelOpen,
  onTogglePanel,
  ydoc,
}: PanelHeaderProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      initializeDefaultAdapters();
      const newIds: string[] = [];

      for (const file of files) {
        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
          const doc = await importSvgFile(file);
          const shapeData = interchangeToShapeData(doc);
          const indexToId = new Map<number, string>();

          for (let i = 0; i < shapeData.length; i++) {
            const item = shapeData[i]!;
            const parentId =
              item.parentIndex !== null ? (indexToId.get(item.parentIndex) ?? null) : null;

            const id = addShape(ydoc, item.type, {
              ...item.props,
              x: ((item.props['x'] as number) ?? 0) + 100,
              y: ((item.props['y'] as number) ?? 0) + 100,
              parentId,
            });
            indexToId.set(i, id);

            if (item.parentIndex === null) {
              newIds.push(id);
            }
          }
        }
      }

      if (newIds.length > 0) {
        useEditorStore.getState().setSelectedIds(newIds);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [ydoc],
  );

  return (
    <div className="flex h-12 items-center gap-1.5 border-b px-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        className="hidden"
        onChange={handleImportFile}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => navigate('/')}>
            <File className="mr-2 h-4 w-4" />
            Drafts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Import SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ViewMenuItems />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{draftName}</p>
        {projectName && (
          <p className="text-muted-foreground truncate text-[10px] leading-tight">{projectName}</p>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onTogglePanel}>
            <PanelLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {leftPanelOpen ? 'Collapse panel' : 'Expand panel'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
