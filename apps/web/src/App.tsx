import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AuthGuard, GuestGuard } from '@/components/auth-guard';
import { AdminGuard } from '@/components/admin-guard';
import { queryClient } from './lib/query-client';
import { DashboardLayout } from './layouts/dashboard-layout';
import { AdminLayout } from './layouts/admin-layout';
import { EditorLayout } from './layouts/editor-layout';
import { DraftsPage } from './pages/drafts/index';
import { ProjectsPage } from './pages/projects/index';
import { ProjectSettingsPage } from './pages/projects/settings';
import { EditorPage } from './pages/editor/index';
import { AdminUsersPage } from './pages/admin/index';
import { LoginPage } from './pages/auth/login';
import { NotFoundPage } from './pages/not-found';

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
                <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
              </Route>
              <Route element={<EditorLayout />}>
                <Route path="/drafts/:draftId" element={<EditorPage />} />
              </Route>
              <Route element={<AdminGuard />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
