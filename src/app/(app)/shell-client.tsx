"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Mic, LogOut, ChevronsUpDown, Plus, Check, Mail, Sun, Moon, Monitor } from "lucide-react";
import Avatar from "@/components/Avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { InstallMenuItem } from "@/components/pwa";
import type { ShellWorkspace } from "./AppShell";
import { switchWorkspaceAction, signOutAction } from "./actions";

// Ilhas client do shell (folhas — o AppShell continua Server Component).
// Lógica preservada: troca de workspace e Sair são as MESMAS server actions; só muda o visual.

function roleLabel(role?: string) {
  if (!role) return "";
  return role === "owner" ? "Dono" : role === "admin" ? "Admin" : "Colaborador";
}

// Seletor de workspace (estilo Slack): pill com workspace ativo → popover com a lista, criar e aceitar.
export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  className,
}: {
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  className?: string;
}) {
  const active =
    workspaces.find((w) => w.workspaceId === activeWorkspaceId) ?? workspaces[0] ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="ws-selector"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40",
            className,
          )}
        >
          <Avatar name={active?.name ?? null} email={active?.name ?? "?"} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">
              {active?.name ?? "Sem workspace"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {roleLabel(active?.role)}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Workspaces</div>
        <div className="max-h-64 overflow-auto">
          {workspaces.map((w) => (
            <form key={w.workspaceId} action={switchWorkspaceAction}>
              <input type="hidden" name="workspaceId" value={w.workspaceId} />
              <button
                type="submit"
                data-testid="ws-trocar"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <Avatar name={w.name} email={w.name} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleLabel(w.role)}
                  </span>
                </span>
                {w.workspaceId === active?.workspaceId && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            </form>
          ))}
        </div>
        <div className="mt-1 border-t border-border pt-1">
          <a
            href="/workspace"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
          >
            <Plus className="size-4 text-muted-foreground" /> Criar ou trocar workspace
          </a>
          <a
            href="/aceitar-convite"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
          >
            <Mail className="size-4 text-muted-foreground" /> Aceitar convite
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Alternar tema (claro/escuro/sistema), persistido pelo next-themes. Guarda de `mounted` evita
// mismatch de hidratação (o tema só é conhecido no cliente).
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : undefined;
  const options = [
    { value: "light", label: "Claro", Icon: Sun },
    { value: "dark", label: "Escuro", Icon: Moon },
    { value: "system", label: "Sistema", Icon: Monitor },
  ] as const;
  return (
    <div className="px-1 py-1">
      <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Tema</div>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={current === value}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors",
              current === value
                ? "bg-card font-medium text-foreground shadow-[var(--shadow-xs)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Avatar com menu (tema + Sair). Mantém a server action signOutAction.
// `showDetails` (sidebar desktop): o trigger envolve a LINHA TODA (avatar + nome + e-mail) — clicar em
// qualquer ponto abre o menu (feedback do dono). Sem `showDetails` (topbar mobile): só o avatar.
export function UserMenu({
  profileName,
  profileEmail,
  avatarUrl,
  showDetails = false,
}: {
  profileName: string | null;
  profileEmail: string;
  avatarUrl: string | null;
  showDetails?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {showDetails ? (
          <button
            type="button"
            data-testid="perfil"
            aria-label="Menu do usuário"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar name={profileName} email={profileEmail} avatarUrl={avatarUrl} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{profileName ?? profileEmail}</span>
              {profileName && (
                <span className="block truncate text-xs text-muted-foreground">{profileEmail}</span>
              )}
            </span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="perfil"
            aria-label="Menu do usuário"
            className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar name={profileName} email={profileEmail} avatarUrl={avatarUrl} size={32} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{profileName ?? profileEmail}</span>
          {profileName && (
            <span className="block truncate text-xs text-muted-foreground">{profileEmail}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeToggle />
        <DropdownMenuSeparator />
        <InstallMenuItem />
        <form action={signOutAction}>
          <button
            type="submit"
            data-testid="nav-sair"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
          >
            <LogOut className="size-4" /> Sair
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SECTION_TITLES: Array<[string, string]> = [
  ["/gravar", "Gravar"],
  ["/recordings", "Gravações"],
  ["/workspace", "Workspace"],
  ["/areas-tags", "Áreas & Tags"],
];

// Título da seção atual (topbar desktop), derivado da rota.
export function CurrentSectionTitle() {
  const pathname = usePathname();
  const match = SECTION_TITLES.find(
    ([href]) => pathname === href || pathname.startsWith(href + "/"),
  );
  return <span className="text-lg font-semibold tracking-tight">{match?.[1] ?? "Gravador"}</span>;
}

// Logo da marca (quadrado gradiente índigo + microfone).
export function BrandMark({ withText = true }: { withText?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.34_0.16_288)] text-primary-foreground shadow-[var(--shadow-primary)]">
        <Mic className="size-5" />
      </span>
      {withText && <span className="text-lg font-semibold tracking-tight">Gravador</span>}
    </span>
  );
}
