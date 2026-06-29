import Link from "next/link";
import { getActor, getCurrentProfile } from "@/lib/session";
import { resolveEntry, entryPath } from "@/lib/entry";
import { redirect } from "next/navigation";
import Recorder from "./Recorder";
import Indisponivel from "@/components/Indisponivel";

export default async function GravarPage() {
  const actor = await getActor();

  if (actor.status === "unauthenticated") {
    return (
      <main className="p-10">
        <Link href="/" className="underline">
          Entrar
        </Link>
      </main>
    );
  }
  if (actor.status === "unavailable") return <Indisponivel />;
  if (actor.status === "no-profile") {
    return (
      <main className="p-10">
        Perfil não encontrado.{" "}
        <Link href="/" className="underline">
          Voltar
        </Link>
      </main>
    );
  }
  if (actor.status === "no-workspace") {
    const prof = await getCurrentProfile();
    if (prof.status === "ok") {
      const e = await resolveEntry(prof.data.id);
      if (e.status === "ok") {
        const path = entryPath(e.target);
        if (path) redirect(path);
      }
    }
    return (
      <main className="p-10">
        Você ainda não tem um workspace ativo.{" "}
        <Link href="/workspace" className="underline">
          Workspaces
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center gap-4 p-4 lg:p-8">
      <h1 className="self-start text-xl font-semibold tracking-tight lg:hidden">Gravar</h1>
      <Recorder />
    </main>
  );
}
