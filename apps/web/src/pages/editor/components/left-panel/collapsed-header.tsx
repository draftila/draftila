import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Home, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CollapsedHeaderProps {
  draftName: string;
  projectName: string | undefined;
  onExpand: () => void;
}

export function CollapsedHeader({ draftName, projectName, onExpand }: CollapsedHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="absolute left-3 top-3 z-10">
      <div className="bg-background flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => navigate('/')}>
              <Home className="mr-2 h-4 w-4" />
              Back to Dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="truncate text-sm font-medium">{draftName}</span>
        {projectName && <span className="text-muted-foreground text-[10px]">{projectName}</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onExpand}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand panel</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
