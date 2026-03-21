import logoSvg from '@/assets/logo.svg';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoSvg} alt="Draftila" className="h-12 w-12" />
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
