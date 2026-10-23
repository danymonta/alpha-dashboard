import { Skeleton } from '@/components/ui/skeleton'
import { CaricamentoSr } from '@/components/stati/caricamento-sr'

/** The consent card's shape while Supabase answers: never a full-screen spinner. */
export default function Loading() {
  return (
    <main className="flex min-h-dvh justify-center px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md space-y-6" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="space-y-5 rounded-xl bg-card p-5">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <CaricamentoSr />
      </div>
    </main>
  )
}
