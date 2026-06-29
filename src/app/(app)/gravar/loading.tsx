import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-col items-center gap-6 p-4 pt-10 lg:p-8">
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-12 w-40" />
      <Skeleton className="h-14 w-full max-w-md" />
      <Skeleton className="size-28 rounded-full" />
      <Skeleton className="h-9 w-full max-w-md" />
    </main>
  );
}
