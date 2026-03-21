import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      richColors
      theme="system"
      {...props}
    />
  );
}

export { Toaster };
