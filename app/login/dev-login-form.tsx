'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'

import { accediConPassword, type StatoLogin } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STATO_INIZIALE: StatoLogin = {}

/** Rendered only when ENABLE_DEV_LOGIN=true outside production. */
export function DevLoginForm() {
  const [stato, azione, pending] = useActionState(accediConPassword, STATO_INIZIALE)

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
          {stato.errore}
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
        Entra
      </Button>
    </form>
  )
}
