'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert, UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivo, cambiaRuolo, invita, revocaInvito } from '@/app/(app)/settings/team/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { RUOLI, invitoSchema, type InvitoInput } from '@/lib/validation/team'

const selectClassi =
  'h-11 rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm'

export function InvitaMembro({ urlLogin }: { urlLogin: string }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitoInput>({
    resolver: zodResolver(invitoSchema),
    defaultValues: { email: '', ruolo: 'setter' },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await invita(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(`Invito pronto per ${valori.email}`, {
      description: 'Digli di entrare con Google usando proprio questa email.',
    })
    setAperto(false)
    reset()
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger render={<Button type="button" className="h-11" />}>
        <UserPlus className="size-4" aria-hidden="true" />
        Invita
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invita nel team</SheetTitle>
          <SheetDescription>
            Non parte nessuna email: la persona entra da {urlLogin} con Google, usando l’indirizzo che scrivi qui.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="i-email">Email Google</Label>
            <Input id="i-email" type="email" inputMode="email" autoCapitalize="none" className="h-11" {...register('email')} />
            <ErroreCampo id="i-email-errore" messaggio={errors.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-ruolo">Ruolo</Label>
            <select id="i-ruolo" className={`${selectClassi} w-full`} {...register('ruolo')}>
              {RUOLI.map((r) => (
                <option key={r} value={r}>{ETICHETTA_RUOLO[r]}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Oggi l’app ha aree per admin, setter e closer. Gli altri ruoli entrano ma non vedono dati.
            </p>
          </div>
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Crea l’invito
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Role and active switch of one member. Your own row is read-only (DB guard too). */
export function ControlliMembro({
  profileId,
  nome,
  ruolo,
  attivo,
  sonoIo,
}: {
  profileId: string
  nome: string
  ruolo: AppRole
  attivo: boolean
  sonoIo: boolean
}) {
  const [inCorso, avvia] = useTransition()

  function esegui(azione: () => Promise<{ ok: boolean; errore?: string }>, successo: string) {
    avvia(async () => {
      const esito = await azione()
      if (esito.ok) toast.success(successo)
      else toast.error(esito.errore ?? 'Operazione non riuscita.')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor={`ruolo-${profileId}`}>Ruolo di {nome}</label>
      <select
        id={`ruolo-${profileId}`}
        defaultValue={ruolo}
        disabled={sonoIo || inCorso}
        className={selectClassi}
        onChange={(e) => {
          const nuovo = e.currentTarget.value as AppRole
          esegui(() => cambiaRuolo({ profile_id: profileId, ruolo: nuovo }), `${nome}: ora ${ETICHETTA_RUOLO[nuovo].toLowerCase()}`)
        }}
      >
        {RUOLI.map((r) => (
          <option key={r} value={r}>{ETICHETTA_RUOLO[r]}</option>
        ))}
      </select>
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={attivo}
          disabled={sonoIo || inCorso}
          aria-label={`${nome} attivo`}
          onCheckedChange={(v) =>
            esegui(
              () => cambiaAttivo({ profile_id: profileId, attivo: v }),
              v ? `${nome} riattivato` : `${nome} disattivato: al prossimo accesso non entra più`,
            )
          }
        />
        {attivo ? 'Attivo' : 'Disattivato'}
      </label>
      {inCorso ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
    </div>
  )
}

export function RevocaInvito({ email }: { email: string }) {
  const [inCorso, avvia] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={inCorso}
      aria-label={`Revoca l’invito a ${email}`}
      onClick={() =>
        avvia(async () => {
          const esito = await revocaInvito({ email })
          if (esito.ok) toast.success(`Invito a ${email} revocato`)
          else toast.error(esito.errore)
        })
      }
    >
      Revoca
    </Button>
  )
}
