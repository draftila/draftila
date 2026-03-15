import { useCallback, useState } from 'react';
import { ChevronDown, Download, Minus, MoreHorizontal, Plus } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import { exportAndDownloadPng, exportAndDownloadSvg } from '@draftila/engine/export';
import type { PropertySectionProps } from '../types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ExportFormat = 'PNG' | 'SVG' | 'JPG';
type ExportScale = '0.5x' | '1x' | '2x' | '3x' | '4x';

const SCALE_VALUES: Record<ExportScale, number> = {
  '0.5x': 0.5,
  '1x': 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
};

interface ExportConfig {
  scale: ExportScale;
  format: ExportFormat;
}

export function ExportSection({ shape, shapeScope }: PropertySectionProps) {
  const [exports, setExports] = useState<ExportConfig[]>([]);

  const addExport = useCallback(() => {
    setExports((prev) => [...prev, { scale: '1x', format: 'PNG' }]);
  }, []);

  const removeExport = useCallback((index: number) => {
    setExports((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateExport = useCallback((index: number, patch: Partial<ExportConfig>) => {
    setExports((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }, []);

  const handleExport = useCallback(
    async (config: ExportConfig) => {
      const filename = shape.name || shape.type;
      const scale = SCALE_VALUES[config.scale];
      const exportShapes = shapeScope.length > 0 ? shapeScope : [shape];

      if (config.format === 'PNG' || config.format === 'JPG') {
        await exportAndDownloadPng(exportShapes, `${filename}.png`, scale);
      } else if (config.format === 'SVG') {
        await exportAndDownloadSvg(exportShapes, `${filename}.svg`);
      }
    },
    [shape, shapeScope],
  );

  const handleExportAll = useCallback(async () => {
    for (const config of exports) {
      await handleExport(config);
    }
  }, [exports, handleExport]);

  return (
    <section>
      <div
        className={
          exports.length > 0
            ? 'mb-2 flex items-center justify-between'
            : 'flex items-center justify-between'
        }
      >
        <button
          onClick={addExport}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Export
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={addExport}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {exports.map((config, index) => (
          <ExportRow
            key={index}
            config={config}
            onUpdate={(patch) => updateExport(index, patch)}
            onRemove={() => removeExport(index)}
            onExport={() => handleExport(config)}
          />
        ))}
      </div>
      {exports.length > 0 && (
        <button
          onClick={handleExportAll}
          className="bg-muted hover:bg-muted/80 mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-colors"
        >
          <Download className="h-3 w-3" />
          Export {shape.name || shape.type}
        </button>
      )}
    </section>
  );
}

function ExportRow({
  config,
  onUpdate,
  onRemove,
  onExport,
}: {
  config: ExportConfig;
  onUpdate: (patch: Partial<ExportConfig>) => void;
  onRemove: () => void;
  onExport: () => void;
}) {
  const [scaleOpen, setScaleOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={scaleOpen} onOpenChange={setScaleOpen}>
        <PopoverTrigger asChild>
          <button className="border-input flex h-6 w-14 items-center justify-between rounded-md border px-1.5 text-[11px]">
            <span>{config.scale}</span>
            <ChevronDown className="text-muted-foreground h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-24 p-1">
          {(Object.keys(SCALE_VALUES) as ExportScale[]).map((scale) => (
            <button
              key={scale}
              onClick={() => {
                onUpdate({ scale });
                setScaleOpen(false);
              }}
              className={`flex w-full items-center rounded px-2 py-1 text-[11px] ${
                config.scale === scale ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
              }`}
            >
              {scale}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover open={formatOpen} onOpenChange={setFormatOpen}>
        <PopoverTrigger asChild>
          <button className="border-input flex h-6 min-w-0 flex-1 items-center justify-between rounded-md border px-1.5 text-[11px]">
            <span>{config.format}</span>
            <ChevronDown className="text-muted-foreground h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-24 p-1">
          {(['PNG', 'SVG', 'JPG'] as ExportFormat[]).map((format) => (
            <button
              key={format}
              onClick={() => {
                onUpdate({ format });
                setFormatOpen(false);
              }}
              className={`flex w-full items-center rounded px-2 py-1 text-[11px] ${
                config.format === format ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
              }`}
            >
              {format}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <button
        onClick={onExport}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
