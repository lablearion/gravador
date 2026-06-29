import { getActor, getCurrentProfile } from "@/lib/session";
import { listMyWorkspaces } from "@/lib/workspaces";
import { isModerator } from "@/lib/rbac";
import { NavGuardProvider } from "@/components/nav-guard";
import AppShell, { type ShellWorkspace } from "./AppShell";

// Layout do grupo (app): envolve as telas "dentro do app" (Gravar/Gravações/Workspace/Áreas&Tags)
// com o shell de navegação (DEC-017). As telas pré-app (login, onboarding, aceitar-convite) ficam
// FORA deste grupo e não recebem o shell.
//
// Tolerância de estado (não regride os guards das páginas — APR-007): o shell só aparece quando o
// ator está "ok" (logado + workspace ativo). Nos demais estados (unauthenticated/no-profile/
// no-workspace/unavailable) faz passthrough — cada página já trata seu próprio guard/redirect.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (actor.status !== "ok") return <>{children}</>;

  const [prof, ws] = await Promise.all([
    getCurrentProfile(),
    listMyWorkspaces(actor.data.profileId),
  ]);

  // Se o perfil/workspaces falharem aqui, ainda renderiza o conteúdo sem shell (a página decide).
  const profileName = prof.status === "ok" ? prof.data.nome : null;
  const profileEmail = prof.status === "ok" ? prof.data.email : "";
  // Avatar: foto do Google servida do Drive (se houver); senão o componente cai na inicial+cor.
  const avatarUrl =
    prof.status === "ok" && prof.data.avatarDriveId ? `/api/avatar/${prof.data.id}` : null;
  const workspaces: ShellWorkspace[] = ws.status === "ok" ? ws.workspaces : [];

  return (
    <NavGuardProvider>
      <AppShell
        profileName={profileName}
        profileEmail={profileEmail}
        avatarUrl={avatarUrl}
        workspaces={workspaces}
        activeWorkspaceId={actor.data.workspaceId}
        isModerator={isModerator(actor.data)}
      >
        {children}
      </AppShell>
    </NavGuardProvider>
  );
}
