import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </main>
  );
}
