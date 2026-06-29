import NavLink from "@/components/NavLink";
import { Mic, List, Users, Tag } from "lucide-react";
import { WorkspaceSwitcher, UserMenu, CurrentSectionTitle, BrandMark } from "./shell-client";
import { InstallTopbarButton, InstallPopup, InstallSuccessPopup } from "@/components/pwa";

// Shell de navegação (DEC-017) — redesign Claude Design.
// Mobile: topbar (workspace + avatar) + tab bar inferior com FAB Gravar central.
// Desktop (lg+): sidebar (marca, workspace switcher, Gravar, nav, usuário) + topbar (título + Gravar).
// O shell é Server Component; a interatividade (switcher, menu, active link) está em ilhas client.
export interface ShellWorkspace {
  workspaceId: string;
  name: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  testid: string;
  Icon: typeof List;
}

export default function AppShell({
  profileName,
  profileEmail,
  avatarUrl,
  workspaces,
  activeWorkspaceId,
  isModerator,
  children,
}: {
  profileName: string | null;
  profileEmail: string;
  avatarUrl: string | null;
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  isModerator: boolean;
  children: React.ReactNode;
}) {
  const navItems: NavItem[] = [
    { href: "/recordings", label: "Gravações", testid: "nav-gravacoes", Icon: List },
    { href: "/workspace", label: "Workspace", testid: "nav-workspace", Icon: Users },
    ...(isModerator
      ? [{ href: "/areas-tags", label: "Áreas & Tags", testid: "nav-areas-tags", Icon: Tag } as NavItem]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ===== Sidebar (desktop/tablet ≥ lg) ===== */}
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="px-1 pt-1">
          <BrandMark />
        </div>

        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />

        {/* Gravar — ação primária em destaque */}
        <NavLink
          href="/gravar"
          data-testid="nav-gravar"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-colors hover:bg-primary/90"
          activeClassName="ring-2 ring-ring ring-offset-2 ring-offset-sidebar"
        >
          <Mic className="size-4" /> Gravar
        </NavLink>

        <nav className="flex flex-col gap-1" data-testid="nav-top">
          {navItems.map(({ href, label, testid, Icon }) => (
            <NavLink
              key={href}
              href={href}
              data-testid={testid}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
              activeClassName="!bg-sidebar-accent !text-sidebar-accent-foreground"
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-sidebar-border pt-3">
          <UserMenu
            profileName={profileName}
            profileEmail={profileEmail}
            avatarUrl={avatarUrl}
            showDetails
          />
        </div>
      </aside>

      {/* ===== Coluna principal ===== */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Topbar mobile */}
        <header
          className="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur lg:hidden"
          data-testid="app-header"
        >
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            className="max-w-[60%]"
          />
          <div className="flex items-center gap-2">
            <InstallTopbarButton />
            <UserMenu profileName={profileName} profileEmail={profileEmail} avatarUrl={avatarUrl} />
          </div>
        </header>

        {/* Topbar desktop */}
        <header className="hidden items-center justify-between gap-3 border-b border-border px-6 py-3 lg:flex">
          <CurrentSectionTitle />
          <NavLink
            href="/gravar"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-colors hover:bg-primary/90"
          >
            <Mic className="size-4" /> Gravar
          </NavLink>
        </header>

        <main className="flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      {/* ===== Tab bar inferior (mobile) com FAB Gravar central ===== */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
        data-testid="nav-bottom"
      >
        <div className="flex flex-1 justify-around">
          <TabItem href="/recordings" label="Gravações" testid="nav-gravacoes-m" Icon={List} />
          <TabItem href="/workspace" label="Workspace" testid="nav-workspace-m" Icon={Users} />
        </div>

        {/* FAB Gravar central elevado */}
        <NavLink
          href="/gravar"
          data-testid="nav-gravar-m"
          className="relative -top-5 mx-1 flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-primary)] transition-transform active:scale-95"
          activeClassName="ring-4 ring-ring/40"
        >
          <Mic className="size-6" />
        </NavLink>

        <div className="flex flex-1 justify-around">
          {isModerator ? (
            <TabItem href="/areas-tags" label="Áreas" testid="nav-areas-tags-m" Icon={Tag} />
          ) : (
            <span aria-hidden className="flex-1" />
          )}
        </div>
      </nav>

      {/* Popup full-screen de instalação do PWA (Fase B) — só no celular, enquanto não instalado */}
      <InstallPopup />
      {/* Confirmação pós-instalação (mostra a cara do ícone + instrução) */}
      <InstallSuccessPopup />
    </div>
  );
}

function TabItem({
  href,
  label,
  testid,
  Icon,
}: {
  href: string;
  label: string;
  testid: string;
  Icon: typeof List;
}) {
  return (
    <NavLink
      href={href}
      data-testid={testid}
      className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors"
      activeClassName="!text-primary"
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  );
}
