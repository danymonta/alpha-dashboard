'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, FolderOpen, FolderSearch, Info, LoaderCircle, Pencil, Plus, RotateCw, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { salvaCartellaDrive, togliCartellaDrive } from '@/app/actions/cartella-drive'
import { Elimina } from '@/components/form/elimina'
import { useLingua } from '@/components/i18n/lingua-provider'
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
import {
  ErroreDrive,
  apriPicker,
  caricaGoogle,
  chiediToken,
  googlePronto,
  type TokenDrive,
} from '@/lib/google/drive-browser'
import { cartellaScelta, type ConfigPicker } from '@/lib/google/picker'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import { DRIVE, ERRORI_DRIVE_TESTI } from '@/lib/i18n/testi/clienti-fogli'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { cn } from '@/lib/utils'
import { cartellaDriveSchema, type CartellaDriveInput, type ChiCartella } from '@/lib/validation/cartella'

/**
 * The client's Google Drive folder (Dany, 04/10/2026): open it, add or change
 * the link, take it away. The folder on Drive is never touched. On the client
 * sheet for the admin and, since 05/10/2026, on the client's project for the
 * admin and the project's coach (Dany: «la deve poter modificare ed editare il
 * fitness coach»); the same card, actions and schema, RLS decides.
 * With the Google Picker configured, "Scegli da Drive" picks the folder from
 * Drive itself: Google's sign-in gives a token with the drive.file scope, kept
 * in this page's memory only, and the folder's URL, rebuilt from its id, is
 * saved by the same action and schema as a typed link.
 */
export function CartellaDrive({
  clientId,
  cliente,
  url,
  chi,
  picker = null,
  nonCaricata = false,
  variante = 'scheda',
  className,
}: {
  clientId: string
  cliente: string
  url: string | null
  /** Who looks: the admin, or the coach of the client's project (the words of the sheet change). */
  chi: ChiCartella
  /** The Picker's public configuration; null: no button, the typed link only. */
  picker?: ConfigPicker | null
  /** The link could not be read: say so and offer to retry, never "no folder". */
  nonCaricata?: boolean
  /** "cella": the short form for a table cell of the client list (21/10/2026): "Apri" and a pencil, or "Aggiungi". */
  variante?: 'scheda' | 'cella'
  className?: string
}) {
  const router = useRouter()
  const lingua = useLingua()
  const d = DRIVE[lingua]
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inDrive, setInDrive] = useState(false)
  // Google's access token: this page's memory only, never sent to the server
  const token = useRef<TokenDrive | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CartellaDriveInput>({
    resolver: zodResolver(cartellaDriveSchema),
    defaultValues: { client_id: clientId, url: url ?? '' },
  })

  // Google's libraries load while the sheet is open, so the tap opens the popup at once
  useEffect(() => {
    if (aperto && picker) caricaGoogle().catch(() => undefined)
  }, [aperto, picker])

  async function scegliDaDrive() {
    if (!picker || inDrive) return
    setErrore(null)
    setAvviso(null)
    setInDrive(true)
    try {
      if (!googlePronto()) {
        // still loading: asking for the token now would open Google's window
        // after the tap, and the browser would block it as a popup
        await caricaGoogle()
        setAvviso(ERRORI_DRIVE_TESTI[lingua].pronto)
        return
      }
      if (!token.current || token.current.scadeAlle - Date.now() < 60_000) {
        token.current = await chiediToken(picker)
      }
      // the Picker is a window of its own over the page: the sheet steps aside
      setAperto(false)
      const scelta = await apriPicker(picker, token.current.valore)
      if (scelta.azione === 'annullata') {
        setAvviso(ERRORI_DRIVE_TESTI[lingua].nessuna)
        setAperto(true)
        return
      }
      const cartella = cartellaScelta(scelta.documento)
      if (!cartella.ok) {
        setErrore(cartella.errore)
        setAperto(true)
        return
      }
      setValue('url', cartella.url)
      const esito = await salvaCartellaDrive({ client_id: clientId, url: cartella.url })
      if (!esito.ok) {
        setErrore(esito.errore)
        setAperto(true)
        return
      }
      toast.success(url ? d.linkAggiornato : d.cartellaCollegata)
    } catch (e) {
      setErrore(e instanceof ErroreDrive ? e.message : 'Connessione assente. Riprova.')
      setAperto(true)
    } finally {
      setInDrive(false)
    }
  }

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    setAvviso(null)
    let esito
    try {
      esito = await salvaCartellaDrive(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(url ? d.linkAggiornato : d.cartellaCollegata)
    setAperto(false)
  })

  if (nonCaricata) {
    return (
      <div
        data-testid="cartella-drive"
        className={cn('flex min-h-11 items-center gap-3 rounded-xl bg-card py-1.5 pr-1.5 pl-3', className)}
      >
        <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
        <div role="alert" className="min-w-0 flex-1 py-1">
          <span className="block text-sm font-medium">{d.cartellaDrive}</span>
          <span className="block text-xs text-muted-foreground">{d.nonCaricato}</span>
        </div>
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => router.refresh()}>
          <RotateCw className="size-4" aria-hidden="true" />
          {d.riprova}
        </Button>
      </div>
    )
  }

  const cella = variante === 'cella'
  const parole = CLIENTI[lingua]

  return (
    <div
      data-testid="cartella-drive"
      className={cn(
        cella ? 'inline-flex items-center gap-1' : 'flex min-h-11 items-center gap-3 rounded-xl bg-card py-1.5 pr-1.5 pl-3',
        className,
      )}
    >
      {cella ? null : <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {url && cella ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {parole.apri}
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">{parole.cartellaDi(cliente)}</span>
        </a>
      ) : cella ? null : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 rounded-md py-1 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="block text-sm font-medium">{parole.cartellaDrive}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {parole.apriInDrive}
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">{parole.nuovaScheda}</span>
          </span>
        </a>
      ) : (
        <div className="min-w-0 flex-1 py-1">
          <span className="block text-sm font-medium">{parole.cartellaDrive}</span>
          <span className="block text-xs text-muted-foreground">{parole.nessunaCartella}</span>
        </div>
      )}

      <Sheet
        open={aperto}
        onOpenChange={(v) => {
          setAperto(v)
          setErrore(null)
          setAvviso(null)
          // always on the saved link
          reset({ client_id: clientId, url: url ?? '' })
        }}
      >
        {url ? (
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground"
                aria-label={cella ? d.modificaCartellaDi(cliente) : d.modificaCartella}
              />
            }
          >
            <Pencil className="size-4" aria-hidden="true" />
          </SheetTrigger>
        ) : (
          <SheetTrigger
            render={
              <Button
                type="button"
                variant={cella ? 'ghost' : 'outline'}
                className={cn('h-11 shrink-0', cella && 'px-2 text-muted-foreground hover:text-foreground')}
                aria-label={cella ? d.aggiungiCartellaDi(cliente) : undefined}
              />
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {d.aggiungi}
          </SheetTrigger>
        )}
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{d.cartellaDrive}</SheetTitle>
            <SheetDescription>{chi === 'admin' ? d.descrizioneAdmin(cliente) : d.descrizioneCoach(cliente)}</SheetDescription>
          </SheetHeader>
          <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
            <input type="hidden" {...register('client_id')} />
            {picker ? (
              <div className="space-y-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={inDrive || isSubmitting}
                  onClick={() => void scegliDaDrive()}
                >
                  {inDrive ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FolderSearch className="size-4" aria-hidden="true" />
                  )}
                  {d.scegliDaDrive}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {d.scegliCartella}
                  {chi === 'coach' ? d.nonLaTrovi : null}
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="cd-url">{d.linkCartella}</Label>
              <Input
                id="cd-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://drive.google.com/drive/folders/…"
                className="h-11"
                aria-invalid={errors.url ? true : undefined}
                aria-describedby={errors.url ? 'cd-url-errore' : 'cd-url-aiuto'}
                {...register('url')}
              />
              <ErroreCampo id="cd-url-errore" messaggio={traduciErrore(errors.url?.message, lingua)} />
              <p id="cd-url-aiuto" className="text-xs text-muted-foreground">
                {picker ? d.oppure : null}
                {d.suDriveCartella}
                {/* without the Picker the coach still learns who shares the folder with him */}
                {!picker && chi === 'coach' ? d.nonLaTroviSuDrive : null}
              </p>
            </div>
            {avviso ? (
              <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {traduciErrore(avviso, lingua)}
              </p>
            ) : null}
            {errore ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {traduciErrore(errore, lingua)}
              </p>
            ) : null}
            {/* never held by the Drive flow: the pasted link always saves */}
            <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {d.salva}
            </Button>
            {url ? (
              <div className="border-t border-border pt-4">
                <Elimina
                  etichetta={d.togli}
                  cosa={d.cosaCartella(cliente)}
                  fatto={d.tolto}
                  conseguenze={[d.restaCartella]}
                  azione={async () => {
                    const esito = await togliCartellaDrive({ client_id: clientId })
                    if (esito.ok) setAperto(false)
                    return tradotto(esito, lingua)
                  }}
                />
              </div>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
