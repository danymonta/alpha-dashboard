import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <Skeleton className="mx-auto h-20 w-32" />
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </main>
  )
}
