import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <Skeleton className="h-5 w-28" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
