import { signIn } from "@/auth";
import { notFound } from "next/navigation";

// Tela de login de desenvolvimento (sem OAuth). Só fora de produção.
export default async function DevLogin({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { email } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-10">
      <h1 className="text-lg font-semibold">Dev login (sem OAuth)</h1>
      <form
        action={async (fd: FormData) => {
          "use server";
          // Redireciona para "/" para passar pela LANDING POR DEVICE (mobile→Gravar, desktop→Gravações),
          // igual ao login do Google. Antes ia direto a /recordings e pulava essa decisão (bug do celular).
          await signIn("dev", {
            email: String(fd.get("email") ?? ""),
            redirectTo: "/",
          });
        }}
        className="flex gap-2"
      >
        <input
          name="email"
          defaultValue={email ?? "lab.learion@gmail.com"}
          className="border px-2 py-1"
        />
        <button
          type="submit"
          className="rounded bg-zinc-800 px-4 py-1 text-white"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
