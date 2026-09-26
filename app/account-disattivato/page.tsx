import { CircleSlash } from 'lucide-react'

import { esci } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'

export default function AccountDisattivatoPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <CircleSlash
          className="mx-auto size-8 text-status-warning"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h1 className="font-heading text-xl font-semibold">Account disattivato</h1>
          <p className="text-sm text-muted-foreground">
            Il tuo accesso ad Alpha Economics è stato sospeso. Contatta
            l’amministratore per riattivarlo.
          </p>
        </div>
        <form action={esci}>
          <Button type="submit" variant="outline" className="h-11 w-full">
            Torna al login
          </Button>
        </form>
      </div>
    </main>
  )
}
