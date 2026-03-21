import type { ReactFormExtendedApi } from '@tanstack/react-form';
import { Button } from '@/components/ui/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReactFormApi = ReactFormExtendedApi<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

interface SubmitButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'type' | 'disabled' | 'form'
> {
  form: AnyReactFormApi;
  label: string;
  submittingLabel: string;
}

export function SubmitButton({ form, label, submittingLabel, ...props }: SubmitButtonProps) {
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting} {...props}>
          {isSubmitting ? submittingLabel : label}
        </Button>
      )}
    </form.Subscribe>
  );
}
