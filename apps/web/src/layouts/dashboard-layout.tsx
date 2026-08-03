import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { CustomFontsLoader } from '@/api/fonts';

export function DashboardLayout() {
  return (
    <SidebarProvider>
      <CustomFontsLoader />
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
