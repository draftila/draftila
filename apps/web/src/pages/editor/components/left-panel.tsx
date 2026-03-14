export function LeftPanel() {
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r">
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium">Layers</span>
      </div>
      <div className="flex-1 overflow-auto" />
    </div>
  );
}
