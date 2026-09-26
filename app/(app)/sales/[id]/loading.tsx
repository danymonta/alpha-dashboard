import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6" aria-busy="true">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <span className="sr-only">Caricamento della vendita</span>
    </div>
  )
}
