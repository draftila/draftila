import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NumberInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-muted-foreground w-5 text-[11px]">{label}</Label>
      <Input
        type="number"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        className="h-6 flex-1 font-mono text-[11px]"
      />
    </div>
  );
}
