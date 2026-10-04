'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, FolderOpen, FolderSearch, Info, LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { salvaCartellaDrive, togliCartellaDrive } from '@/app/(app)/clients/actions'
import { Elimina } from '@/components/form/elimina'
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
import { ERRORI_DRIVE, cartellaScelta, type ConfigPicker } from '@/lib/google/picker'
import { cartellaDriveSchema, type CartellaDriveInput } from '@/lib/validation/cartella'

/**
 * The client's Google Drive folder (Dany, 04/10/2026), admin only: open it,
 * add or change the link, take it away. The folder on Drive is never touched.
 * With the Google Picker configured, "Scegli da Drive" picks the folder from
 * Drive itself: Google's sign-in gives a token with the drive.file scope, kept
 * in this page's memory only, and the folder's URL, rebuilt from its id, is
 * saved by the same action and schema as a typed link.
 */
export function CartellaDrive({
  clientId,
  cliente,
  url,
  picker = null,
}: {
  clientId: string
  cliente: string
  url: string | null
  /** The Picker's public configuration; null: no button, the typed link only. */
  picker?: ConfigPicker | null
}) {
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
        setAvviso(ERRORI_DRIVE.pronto)
        return
      }
      if (!token.current || token.current.scadeAlle - Date.now() < 60_000) {
        token.current = await chiediToken(picker)
      }
      // the Picker is a window of its own over the page: the sheet steps aside
      setAperto(false)
      const scelta = await apriPicker(picker, token.current.valore)
      if (scelta.azione === 'annullata') {
        setAvviso(ERRORI_DRIVE.nessuna)
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
      toast.success(url ? 'Link aggiornato' : 'Cartella collegata')
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
    toast.success(url ? 'Link aggiornato' : 'Cartella collegata')
    setAperto(false)
  })

  return (
    <div data-testid="cartella-drive" className="flex min-h-11 items-center gap-3 rounded-xl bg-card py-1.5 pr-1.5 pl-3">
      <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 rounded-md py-1 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="block text-sm font-medium">Cartella Drive</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Apri in Google Drive
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">(si apre in una nuova scheda)</span>
          </span>
        </a>
      ) : (
        <div className="min-w-0 flex-1 py-1">
          <span className="block text-sm font-medium">Cartella Drive</span>
          <span className="block text-xs text-muted-foreground">Nessuna cartella collegata</span>
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
                aria-label="Modifica il link della cartella Drive"
              />
            }
          >
            <Pencil className="size-4" aria-hidden="true" />
          </SheetTrigger>
        ) : (
          <SheetTrigger render={<Button type="button" variant="outline" className="h-11 shrink-0" />}>
            <Plus className="size-4" aria-hidden="true" />
            Aggiungi
          </SheetTrigger>
        )}
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Cartella Drive</SheetTitle>
            <SheetDescription>
              Il link alla cartella di {cliente} su Google Drive. Lo vedi solo tu: closer, setter e coach no.
            </SheetDescription>
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
                  Scegli da Drive
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ti colleghi con Google e scegli la cartella: l’app vede solo le cartelle che scegli tu.
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="cd-url">Link della cartella</Label>
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
              <ErroreCampo id="cd-url-errore" messaggio={errors.url?.message} />
              <p id="cd-url-aiuto" className="text-xs text-muted-foreground">
                {picker ? 'Oppure incolla il link. ' : null}Su Drive: tasto destro sulla cartella › Condividi › Copia link.
              </p>
            </div>
            {avviso ? (
              <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {avviso}
              </p>
            ) : null}
            {errore ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {errore}
              </p>
            ) : null}
            {/* never held by the Drive flow: the pasted link always saves */}
            <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              Salva
            </Button>
            {url ? (
              <div className="border-t border-border pt-4">
                <Elimina
                  etichetta="Togli il link"
                  cosa={`il link alla cartella Drive di ${cliente}`}
                  fatto="Link tolto"
                  conseguenze={['La cartella su Google Drive resta com’è: si toglie solo il link dalla scheda.']}
                  azione={async () => {
                    const esito = await togliCartellaDrive({ client_id: clientId })
                    if (esito.ok) setAperto(false)
                    return esito
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
