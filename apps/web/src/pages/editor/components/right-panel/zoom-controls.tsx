import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getZoomPercentage } from '@draftila/engine/camera';
import { useEditorStore } from '@/stores/editor-store';

export function ZoomControls() {
  const zoom = useEditorStore((s) => s.camera.zoom);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);

  return (
    <div className="flex w-full items-center justify-between border-b px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCamera({ ...camera, zoom: Math.max(0.02, camera.zoom / 1.25) })}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <button
        className="text-muted-foreground hover:text-foreground min-w-[44px] px-1 text-center font-mono text-[11px] transition-colors"
        onClick={() => setCamera({ ...camera, zoom: 1 })}
      >
        {getZoomPercentage(zoom)}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCamera({ ...camera, zoom: Math.min(64, camera.zoom * 1.25) })}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
