"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getCurrentProfile } from "@/lib/session";
import { setActiveWorkspace } from "@/lib/workspaces";

// Trocar o workspace ativo pelo seletor do shell. Após trocar, volta para "/" para a landing
// por device re-decidir a tela inicial (mobile→Gravar, desktop→Gravações).
export async function switchWorkspaceAction(fd: FormData) {
  const p = await getCurrentProfile();
  if (p.status !== "ok") redirect("/");
  const target = String(fd.get("workspaceId") ?? "");
  if (target && target !== p.data.lastWorkspaceId) {
    await setActiveWorkspace(p.data.id, target);
  }
  redirect("/");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
