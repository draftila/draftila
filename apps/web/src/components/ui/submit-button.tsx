import type { AnyFormApi } from '@tanstack/react-form';
import { Button } from '@/components/ui/button';

interface SubmitButtonProps extends Omit<React.ComponentProps<typeof Button>, 'type' | 'disabled'> {
  form: AnyFormApi;
  label: string;
  submittingLabel: string;
}

export function SubmitButton({ form, label, submittingLabel, ...props }: SubmitButtonProps) {
  return (
    <form.Subscribe selector={(state: { isSubmitting: boolean }) => state.isSubmitting}>
      {(isSubmitting: boolean) => (
        <Button type="submit" disabled={isSubmitting} {...props}>
          {isSubmitting ? submittingLabel : label}
        </Button>
      )}
    </form.Subscribe>
  );
}
