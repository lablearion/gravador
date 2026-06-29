import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </main>
  );
}
