import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { getSectionsForMultiSelection } from './right-panel/section-registry';

interface RightPanelMultiSelectProps {
  ydoc: Y.Doc;
  selectedShapes: Shape[];
  shapeScope: Shape[];
  onAlign: (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => void;
  onDistribute: (direction: 'horizontal' | 'vertical') => void;
  onBatchUpdate: (props: Partial<Shape>) => void;
}

export function RightPanelMultiSelect({
  ydoc,
  selectedShapes,
  shapeScope,
  onAlign,
  onDistribute,
  onBatchUpdate,
}: RightPanelMultiSelectProps) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of selectedShapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  const bw = Math.round(maxX - minX);
  const bh = Math.round(maxY - minY);

  return (
    <div>
      <div className="border-b px-3 py-3">
        <p className="text-muted-foreground text-[11px] uppercase tracking-wide">Selection</p>
        <p className="text-xs font-medium">{selectedShapes.length} objects selected</p>
        <p className="text-muted-foreground mt-1 text-[10px]">
          {bw} x {bh}
        </p>
      </div>
      <div className="border-b px-3 py-3">
        <p className="text-muted-foreground mb-2 text-[11px] font-medium">Align</p>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('left')}
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('center-h')}
              >
                <AlignCenterVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('right')}
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Right</TooltipContent>
          </Tooltip>
          <div className="bg-border mx-1 h-4 w-px" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('top')}
              >
                <AlignStartHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Top</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('center-v')}
              >
                <AlignCenterHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Middle</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAlign('bottom')}
              >
                <AlignEndHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Align Bottom</TooltipContent>
          </Tooltip>
        </div>
        {selectedShapes.length >= 3 && (
          <>
            <p className="text-muted-foreground mb-2 mt-3 text-[11px] font-medium">Distribute</p>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDistribute('horizontal')}
                  >
                    <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Distribute Horizontally</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDistribute('vertical')}
                  >
                    <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Distribute Vertically</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
      {getSectionsForMultiSelection(selectedShapes.map((s) => s.type)).map((Section, index) => (
        <div key={Section.name || index} className="border-b px-3 py-3">
          <Section
            ydoc={ydoc}
            shape={selectedShapes[0]!}
            shapeScope={shapeScope}
            onUpdate={onBatchUpdate}
          />
        </div>
      ))}
    </div>
  );
}
