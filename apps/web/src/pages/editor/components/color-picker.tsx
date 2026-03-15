import { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ColorPickerProps {
  color: string | null;
  onChange: (color: string | null) => void;
  label?: string;
}

const PRESET_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#B7B7B7',
  '#CCCCCC',
  '#D9D9D9',
  '#EFEFEF',
  '#F3F3F3',
  '#FFFFFF',
  '#980000',
  '#FF0000',
  '#FF9900',
  '#FFFF00',
  '#00FF00',
  '#00FFFF',
  '#4A86E8',
  '#0000FF',
  '#9900FF',
  '#FF00FF',
  '#E6B8AF',
  '#F4CCCC',
  '#FCE5CD',
  '#FFF2CC',
  '#D9EAD3',
  '#D0E0E3',
  '#C9DAF8',
  '#CFE2F3',
  '#D9D2E9',
  '#EAD1DC',
];

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(color ?? '');

  const handleHexChange = useCallback(
    (value: string) => {
      setHexInput(value);
      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        onChange(value);
      }
    },
    [onChange],
  );

  const handlePresetClick = useCallback(
    (presetColor: string) => {
      setHexInput(presetColor);
      onChange(presetColor);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-muted-foreground w-10 text-[11px]">{label}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="h-6 w-6 shrink-0 rounded border"
            style={{ backgroundColor: color ?? 'transparent' }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" side="left" align="start">
          <div className="grid grid-cols-10 gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className="h-5 w-5 rounded-sm border transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                onClick={() => handlePresetClick(c)}
              />
            ))}
          </div>
          <div className="mt-2">
            <Input
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="#000000"
              className="h-7 font-mono text-xs"
            />
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={color ?? ''}
        onChange={(e) => handleHexChange(e.target.value)}
        placeholder="None"
        className="h-6 flex-1 font-mono text-[11px]"
      />
    </div>
  );
}
