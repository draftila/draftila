import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      richColors
      theme="system"
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
        } as React.CSSProperties
      }
      toastOptions={{
        className:
          'rounded-[var(--radius-lg)]! border-border! bg-popover! text-popover-foreground! shadow-md!',
      }}
      {...props}
    />
  );
}

export { Toaster };
