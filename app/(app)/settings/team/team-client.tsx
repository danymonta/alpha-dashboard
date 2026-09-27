'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert, UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivo, cambiaLivelloPm, cambiaRuolo, invita, revocaInvito } from '@/app/(app)/settings/team/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { ETICHETTA_LIVELLO_PM, ETICHETTA_RUOLO, type AppRole, type LivelloPm } from '@/lib/auth/roles'
import { LIVELLI_PM, RUOLI, invitoSchema, type InvitoInput } from '@/lib/validation/team'

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

type Conferma =
  | { tipo: 'admin'; precedente: AppRole }
  | { tipo: 'admin_pm'; precedente: LivelloPm }
  | { tipo: 'disattiva' }

/**
 * Role, projects level and active switch of one member. Your own row is
 * read-only (DB guard too). Making someone admin (of the app or of the
 * projects) and deactivating ask first; other changes apply at once with an
 * undo in the toast; reactivating needs no confirmation. The app admin is
 * always projects admin, so their level is locked.
 */
export function ControlliMembro({
  profileId,
  nome,
  ruolo,
  livelloPm,
  attivo,
  sonoIo,
}: {
  profileId: string
  nome: string
  ruolo: AppRole
  livelloPm: LivelloPm
  attivo: boolean
  sonoIo: boolean
}) {
  const [inCorso, avvia] = useTransition()
  // the select shows the chosen role while the dialog is open, and goes back on cancel
  const [valore, setValore] = useState<AppRole>(ruolo)
  const [livello, setLivello] = useState<LivelloPm>(livelloPm)
  // kept after closing, so the dialog text does not change while it fades out
  const [conferma, setConferma] = useState<Conferma>({ tipo: 'disattiva' })
  const [chiedi, setChiedi] = useState(false)

  function apriConferma(c: Conferma) {
    setConferma(c)
    setChiedi(true)
  }

  function applicaRuolo(nuovo: AppRole, precedente: AppRole, annullabile: boolean) {
    setValore(nuovo)
    avvia(async () => {
      const esito = await cambiaRuolo({ profile_id: profileId, ruolo: nuovo })
      if (!esito.ok) {
        setValore(precedente)
        toast.error(esito.errore)
        return
      }
      toast.success(
        `${nome}: ora ${ETICHETTA_RUOLO[nuovo].toLowerCase()}`,
        annullabile
          ? { action: { label: 'Annulla', onClick: () => applicaRuolo(precedente, nuovo, false) } }
          : undefined,
      )
    })
  }

  function applicaLivello(nuovo: LivelloPm, precedente: LivelloPm, annullabile: boolean) {
    setLivello(nuovo)
    avvia(async () => {
      const esito = await cambiaLivelloPm({ profile_id: profileId, livello_pm: nuovo })
      if (!esito.ok) {
        setLivello(precedente)
        toast.error(esito.errore)
        return
      }
      toast.success(
        `${nome}: nei progetti ora ${ETICHETTA_LIVELLO_PM[nuovo].toLowerCase()}`,
        annullabile
          ? { action: { label: 'Annulla', onClick: () => applicaLivello(precedente, nuovo, false) } }
          : undefined,
      )
    })
  }

  function applicaAttivo(v: boolean) {
    avvia(async () => {
      const esito = await cambiaAttivo({ profile_id: profileId, attivo: v })
      if (esito.ok) toast.success(v ? `${nome} riattivato` : `${nome} disattivato: al prossimo accesso non entra più`)
      else toast.error(esito.errore ?? 'Operazione non riuscita.')
    })
  }

  function annulla() {
    if (conferma.tipo === 'admin') setValore(conferma.precedente)
    if (conferma.tipo === 'admin_pm') setLivello(conferma.precedente)
    setChiedi(false)
  }

  function confermaAzione() {
    if (conferma.tipo === 'admin') applicaRuolo('admin', conferma.precedente, false)
    else if (conferma.tipo === 'admin_pm') applicaLivello('admin', conferma.precedente, false)
    else applicaAttivo(false)
    setChiedi(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor={`ruolo-${profileId}`}>Ruolo di {nome}</label>
      <select
        id={`ruolo-${profileId}`}
        value={valore}
        disabled={sonoIo || inCorso}
        className={selectClassi}
        onChange={(e) => {
          const nuovo = e.currentTarget.value as AppRole
          if (nuovo === valore) return
          if (nuovo === 'admin') {
            setValore(nuovo)
            apriConferma({ tipo: 'admin', precedente: valore })
          } else {
            applicaRuolo(nuovo, valore, true)
          }
        }}
      >
        {RUOLI.map((r) => (
          <option key={r} value={r}>{ETICHETTA_RUOLO[r]}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`livello-pm-${profileId}`}>Livello progetti di {nome}</label>
      <select
        id={`livello-pm-${profileId}`}
        // the app admin is projects admin whatever livello_pm says
        value={valore === 'admin' ? 'admin' : livello}
        disabled={sonoIo || valore === 'admin' || inCorso}
        title={valore === 'admin' ? 'L’admin dell’app è sempre admin dei progetti' : undefined}
        className={selectClassi}
        onChange={(e) => {
          const nuovo = e.currentTarget.value as LivelloPm
          if (nuovo === livello) return
          if (nuovo === 'admin') {
            setLivello(nuovo)
            apriConferma({ tipo: 'admin_pm', precedente: livello })
          } else {
            applicaLivello(nuovo, livello, true)
          }
        }}
      >
        {LIVELLI_PM.map((l) => (
          <option key={l} value={l}>Progetti: {ETICHETTA_LIVELLO_PM[l]}</option>
        ))}
      </select>
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={attivo}
          disabled={sonoIo || inCorso}
          aria-label={`${nome} attivo`}
          onCheckedChange={(v) => (v ? applicaAttivo(true) : apriConferma({ tipo: 'disattiva' }))}
        />
        {attivo ? 'Attivo' : 'Disattivato'}
      </label>
      {inCorso ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}

      <Dialog open={chiedi} onOpenChange={(aperto) => { if (!aperto) annulla() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {conferma.tipo === 'disattiva'
                ? `Disattivare ${nome}?`
                : conferma.tipo === 'admin_pm'
                  ? `Rendere ${nome} admin dei progetti?`
                  : `Rendere ${nome} admin?`}
            </DialogTitle>
            <DialogDescription>
              {conferma.tipo === 'disattiva'
                ? 'Al prossimo accesso non entra più e non vede nessun dato. Puoi riattivarlo quando vuoi.'
                : conferma.tipo === 'admin_pm'
                  ? 'Vedrà e gestirà tutti i progetti, i reparti e i modelli. I dati economici restano solo tuoi.'
                  : 'Vedrà incassi, costi, margine e compensi di tutti.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={annulla}>
              Annulla
            </Button>
            <Button
              type="button"
              variant={conferma.tipo === 'disattiva' ? 'destructive' : 'default'}
              className="h-11"
              onClick={confermaAzione}
            >
              {conferma.tipo === 'disattiva' ? 'Disattiva' : conferma.tipo === 'admin_pm' ? 'Rendi admin dei progetti' : 'Rendi admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
