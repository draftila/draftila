import { useNavigate, useLocation } from 'react-router-dom';
import { FileIcon, FolderIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { CreateProjectDialog } from '@/pages/projects/components/create-project-dialog';
import { useDashboardStore } from '@/stores/dashboard-store';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Drafts', icon: FileIcon, path: '/' },
  { label: 'All Projects', icon: FolderIcon, path: '/projects' },
] as const;

function ProjectSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: projectsResponse } = useProjects();
  const selectedProjectId = useDashboardStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);

  const projects = projectsResponse?.data ?? [];
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            aria-label="Switch project"
          >
            <div className="bg-primary text-primary-foreground flex aspect-square size-4 items-center justify-center text-[10px] font-semibold">
              {selectedProject?.name?.charAt(0)?.toUpperCase() ?? 'A'}
            </div>
            <span className="truncate font-semibold">
              {selectedProject?.name ?? 'All Projects'}
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search projects..." />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    data-checked={project.id === selectedProjectId || undefined}
                    onSelect={() => {
                      setSelectedProjectId(project.id);
                      setOpen(false);
                      navigate('/');
                    }}
                  >
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreateDialogOpen(true);
                  }}
                >
                  <PlusIcon />
                  Create Project
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={(project) => {
          setSelectedProjectId(project.id);
          navigate('/');
        }}
      />
    </>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <ProjectSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
