import { useCallback, useState } from 'react';
import { Check, ChevronDown, Download, Minus, MoreHorizontal, Plus } from 'lucide-react';
import {
  exportAndDownloadJpg,
  exportAndDownloadPng,
  exportAndDownloadSvg,
} from '@draftila/engine/export';
import type { PropertySectionProps } from '../types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ExportFormat = 'PNG' | 'SVG' | 'JPG';
type ExportScale = '0.5x' | '1x' | '2x' | '3x' | '4x';
type ExportQuality = 'Low' | 'Medium' | 'High';

const SCALE_VALUES: Record<ExportScale, number> = {
  '0.5x': 0.5,
  '1x': 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
};

const QUALITY_VALUES: Record<ExportQuality, number> = {
  Low: 0.5,
  Medium: 0.75,
  High: 1,
};

interface ExportConfig {
  scale: ExportScale;
  format: ExportFormat;
  suffix: string;
  quality: ExportQuality;
}

function createDefaultConfig(): ExportConfig {
  return { scale: '1x', format: 'PNG', suffix: '', quality: 'High' };
}

function hasQualitySetting(format: ExportFormat): boolean {
  return format === 'PNG' || format === 'JPG';
}

function hasScaleSetting(format: ExportFormat): boolean {
  return format === 'PNG' || format === 'JPG';
}

export function ExportSection({ shape, shapeScope }: PropertySectionProps) {
  const [exports, setExports] = useState<ExportConfig[]>([]);
  const hasExportableShapes = shapeScope.length > 0;

  const addExport = useCallback(() => {
    setExports((prev) => [...prev, createDefaultConfig()]);
  }, []);

  const removeExport = useCallback((index: number) => {
    setExports((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateExport = useCallback((index: number, patch: Partial<ExportConfig>) => {
    setExports((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }, []);

  const handleExport = useCallback(
    async (config: ExportConfig) => {
      const baseName = shape.name || shape.type;
      const suffix = config.suffix ? `-${config.suffix}` : '';
      const scale = SCALE_VALUES[config.scale];
      const exportShapes = shapeScope;

      if (exportShapes.length === 0) {
        return;
      }

      if (config.format === 'PNG') {
        await exportAndDownloadPng(exportShapes, `${baseName}${suffix}.png`, scale);
      } else if (config.format === 'JPG') {
        const quality = QUALITY_VALUES[config.quality];
        await exportAndDownloadJpg(exportShapes, `${baseName}${suffix}.jpg`, scale, quality);
      } else if (config.format === 'SVG') {
        await exportAndDownloadSvg(exportShapes, `${baseName}${suffix}.svg`);
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
          disabled={!hasExportableShapes}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Export
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={addExport}
            disabled={!hasExportableShapes}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
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
          disabled={!hasExportableShapes}
          className="bg-muted hover:bg-muted/80 mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {hasScaleSetting(config.format) ? (
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
                    config.scale === scale
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="w-14" />
        )}

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
                  config.format === format
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/50'
                }`}
              >
                {format}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-56 p-0">
            <ExportSettings config={config} onUpdate={onUpdate} onExport={onExport} />
          </PopoverContent>
        </Popover>

        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ExportSettings({
  config,
  onUpdate,
  onExport,
}: {
  config: ExportConfig;
  onUpdate: (patch: Partial<ExportConfig>) => void;
  onExport: () => void;
}) {
  const [qualityOpen, setQualityOpen] = useState(false);

  return (
    <div className="space-y-px">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-[11px] font-medium">Export Settings</span>
        <button
          onClick={onExport}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
        >
          Export
        </button>
      </div>

      <SettingsRow label="Suffix">
        <input
          type="text"
          value={config.suffix}
          onChange={(e) => onUpdate({ suffix: e.target.value })}
          placeholder="None"
          className="border-input bg-muted/50 h-6 w-[110px] rounded-md border px-1.5 text-right text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
        />
      </SettingsRow>

      {hasQualitySetting(config.format) && (
        <SettingsRow label="Quality">
          <Popover open={qualityOpen} onOpenChange={setQualityOpen}>
            <PopoverTrigger asChild>
              <button className="border-input bg-muted/50 flex h-6 w-[110px] items-center justify-between rounded-md border px-1.5 text-[11px]">
                <span>{config.quality}</span>
                <ChevronDown className="text-muted-foreground h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-28 p-1">
              {(Object.keys(QUALITY_VALUES) as ExportQuality[]).map((quality) => (
                <button
                  key={quality}
                  onClick={() => {
                    onUpdate({ quality });
                    setQualityOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-[11px] ${
                    config.quality === quality
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <span>{quality}</span>
                  {config.quality === quality && <Check className="h-3 w-3" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </SettingsRow>
      )}
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hover:bg-muted/30 flex items-center justify-between px-3 py-1.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {children}
    </div>
  );
}
