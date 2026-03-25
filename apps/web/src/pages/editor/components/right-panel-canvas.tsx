import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';

import { ColorPicker } from './color-picker';
import { ExportSection } from './right-panel/sections/export-section';
import { PreviewSection } from './right-panel/sections/preview-section';

interface RightPanelCanvasProps {
  ydoc: Y.Doc;
  pageBgColor: string;
  canvasShape: Shape;
  shapeScope: Shape[];
  onPageBgColorChange: (color: string) => void;
}

export function RightPanelCanvas({
  ydoc,
  pageBgColor,
  canvasShape,
  shapeScope,
  onPageBgColorChange,
}: RightPanelCanvasProps) {
  return (
    <div>
      <div className="border-b px-3 py-3">
        <p className="text-muted-foreground mb-2 text-[11px] font-medium">Page</p>
        <div className="flex items-center gap-1.5">
          <ColorPicker
            color={pageBgColor}
            opacity={1}
            onChange={onPageBgColorChange}
            onOpacityChange={() => {}}
          >
            <button className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5">
              <div className="border-border relative h-5 w-5 shrink-0 overflow-hidden rounded border">
                <div className="absolute inset-0" style={{ backgroundColor: pageBgColor }} />
              </div>
              <span className="truncate font-mono text-[11px] leading-snug">
                {pageBgColor.replace('#', '').toUpperCase()}
              </span>
            </button>
          </ColorPicker>
        </div>
      </div>
      <div className="border-b px-3 py-3">
        <ExportSection
          ydoc={ydoc}
          shape={canvasShape}
          shapeScope={shapeScope}
          onUpdate={() => {}}
        />
      </div>
      <div className="border-b px-3 py-3">
        <PreviewSection
          ydoc={ydoc}
          shape={canvasShape}
          shapeScope={shapeScope}
          onUpdate={() => {}}
        />
      </div>
      {shapeScope.length === 0 && (
        <div className="text-muted-foreground px-3 py-3 text-xs">Canvas is empty</div>
      )}
    </div>
  );
}
