import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
  return <Sonner className="toaster group" position="bottom-right" richColors {...props} />;
}

export { Toaster };
