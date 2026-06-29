import { Skeleton } from "@/components/ui/skeleton";

// Fallback instantâneo da listagem (Suspense de rota): o shell fica e isto aparece na hora ao navegar.
export default function Loading() {
  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <div className="flex gap-6">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="hidden w-72 shrink-0 lg:block">
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
