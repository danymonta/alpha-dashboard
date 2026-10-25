'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'

import { accediConPassword, type StatoLogin } from '@/app/login/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCESSO, traduciAccesso } from '@/lib/i18n/testi/accesso'

const STATO_INIZIALE: StatoLogin = {}

/**
 * Rendered only when ENABLE_DEV_LOGIN=true outside production. da: where to go
 * afterwards, as the Google button (checked again on the server).
 */
export function DevLoginForm({ da = '/' }: { da?: string }) {
  // da rides as a bound argument, not as a field: the page's only input[name="da"] stays the Google form's
  const [stato, azione, pending] = useActionState(accediConPassword.bind(null, da), STATO_INIZIALE)
  const lingua = useLingua()

  return (
    <form action={azione} className="space-y-3" data-testid="dev-login">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="admin@alpha.test"
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11"
          required
        />
      </div>

      {stato.errore ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-status-critical"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {traduciAccesso(stato.errore, lingua)}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="outline"
        className="h-11 w-full"
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {ACCESSO[lingua].entra}
      </Button>
    </form>
  )
}
