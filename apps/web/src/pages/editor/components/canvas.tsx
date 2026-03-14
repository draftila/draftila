import { BottomToolbar } from './bottom-toolbar';

export function Canvas() {
  return (
    <div className="bg-muted/30 relative flex-1 overflow-hidden">
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <BottomToolbar />
      </div>
    </div>
  );
}
