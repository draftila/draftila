import { useNavigate } from 'react-router-dom';
import { LayoutGrid, File, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PanelHeaderProps {
  draftName: string;
  projectName: string | undefined;
  leftPanelOpen: boolean;
  onTogglePanel: () => void;
}

export function PanelHeader({
  draftName,
  projectName,
  leftPanelOpen,
  onTogglePanel,
}: PanelHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-12 items-center gap-1.5 border-b px-2">
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
