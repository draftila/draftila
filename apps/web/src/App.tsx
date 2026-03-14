import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthGuard, GuestGuard } from '@/components/auth-guard';
import { queryClient } from './lib/query-client';
import { DashboardLayout } from './layouts/dashboard-layout';
import { DraftsPage } from './pages/drafts';
import { ProjectsPage } from './pages/projects';
import { LoginPage } from './pages/login';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestGuard />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            <Route element={<AuthGuard />}>
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DraftsPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
