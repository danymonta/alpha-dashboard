'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, FileSearch, FileText, Info, LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { salvaContrattoVendita, togliContrattoVendita } from '@/app/actions/contratto-vendita'
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
import { fileScelto, type ConfigPicker } from '@/lib/google/picker'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import { DRIVE, ERRORI_DRIVE_TESTI } from '@/lib/i18n/testi/clienti-fogli'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { cn } from '@/lib/utils'
import { salvaContrattoSchema, type SalvaContrattoInput } from '@/lib/validation/contratto'

/**
 * The link to the signed contract of a sale on Google Drive (Dany, 21/10/2026):
 * open it, add or change the link, take it away. The file on Drive is never
 * touched. One contract per sale: every path and every renewal has its own.
 * Admin only, wherever it is shown (the sale page, the client's path history,
 * the client list): the closer, the setter and the coach never see it.
 * With the Google Picker configured, "Scegli da Drive" picks the file from
 * Drive itself, like the client's folder but on files: same scope (drive.file),
 * same libraries, same errors; the file's URL is rebuilt from its id.
 *
 * `variante`: "scheda" is a row of its own (sale page, path history); "cella"
 * is the short form for a table cell: "Apri" and a pencil, or "Aggiungi".
 */
export function ContrattoVendita({
  saleId,
  cliente,
  percorso,
  url,
  picker = null,
  variante = 'scheda',
  className,
}: {
  saleId: string
  /** Whose contract it is, as it reads in the sheet and the buttons. */
  cliente: string
  /** Which path ("Primo percorso", "Rinnovo 1"); empty where the page already says it. */
  percorso?: string
  url: string | null
  /** The Picker's public configuration; null: no button, the typed link only. */
  picker?: ConfigPicker | null
  variante?: 'scheda' | 'cella'
  className?: string
}) {
  const lingua = useLingua()
  const parole = CLIENTI[lingua]
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
  } = useForm<SalvaContrattoInput>({
    resolver: zodResolver(salvaContrattoSchema),
    defaultValues: { sale_id: saleId, url: url ?? '' },
  })

  const nome = percorso ? `${cliente} (${percorso})` : cliente

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
      const scelta = await apriPicker(picker, token.current.valore, 'file')
      if (scelta.azione === 'annullata') {
        setAvviso(ERRORI_DRIVE_TESTI[lingua].nessun_file)
        setAperto(true)
        return
      }
      const file = fileScelto(scelta.documento)
      if (!file.ok) {
        setErrore(file.errore)
        setAperto(true)
        return
      }
      setValue('url', file.url)
      const esito = await salvaContrattoVendita({ sale_id: saleId, url: file.url })
      if (!esito.ok) {
        setErrore(esito.errore)
        setAperto(true)
        return
      }
      toast.success(url ? d.linkAggiornato : d.contrattoCollegato)
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
      esito = await salvaContrattoVendita(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(url ? d.linkAggiornato : d.contrattoCollegato)
    setAperto(false)
  })

  const cella = variante === 'cella'

  const apri = url ? (
    cella ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {parole.apri}
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{parole.contrattoDi(nome)}</span>
      </a>
    ) : (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 rounded-md py-1 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="block text-sm font-medium">{parole.contratto}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {parole.apriInDrive}
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">{parole.nuovaScheda}</span>
        </span>
      </a>
    )
  ) : cella ? null : (
    <div className="min-w-0 flex-1 py-1">
      <span className="block text-sm font-medium">{parole.contratto}</span>
      <span className="block text-xs text-muted-foreground">{parole.nessunLink}</span>
    </div>
  )

  return (
    <div
      data-testid="contratto-vendita"
      className={cn(
        cella ? 'inline-flex items-center gap-1' : 'flex min-h-11 items-center gap-3 rounded-xl bg-card py-1.5 pr-1.5 pl-3',
        className,
      )}
    >
      {cella ? null : <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {apri}

      <Sheet
        open={aperto}
        onOpenChange={(v) => {
          setAperto(v)
          setErrore(null)
          setAvviso(null)
          // always on the saved link
          reset({ sale_id: saleId, url: url ?? '' })
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
                aria-label={d.modificaContrattoDi(nome)}
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
                aria-label={d.aggiungiContrattoDi(nome)}
              />
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {cella ? d.aggiungi : d.aggiungiLink}
          </SheetTrigger>
        )}
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{d.contratto}</SheetTitle>
            <SheetDescription>{d.descrizioneContratto(nome)}</SheetDescription>
          </SheetHeader>
          <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
            <input type="hidden" {...register('sale_id')} />
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
                    <FileSearch className="size-4" aria-hidden="true" />
                  )}
                  {d.scegliDaDrive}
                </Button>
                <p className="text-xs text-muted-foreground">{d.scegliFile}</p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`ct-url-${saleId}`}>{d.linkContratto}</Label>
              <Input
                id={`ct-url-${saleId}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://drive.google.com/file/d/…"
                className="h-11"
                aria-invalid={errors.url ? true : undefined}
                aria-describedby={errors.url ? `ct-url-errore-${saleId}` : `ct-url-aiuto-${saleId}`}
                {...register('url')}
              />
              <ErroreCampo id={`ct-url-errore-${saleId}`} messaggio={traduciErrore(errors.url?.message, lingua)} />
              <p id={`ct-url-aiuto-${saleId}`} className="text-xs text-muted-foreground">
                {picker ? d.oppure : null}
                {d.suDriveFile}
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
                  cosa={d.cosaContratto(nome)}
                  fatto={d.tolto}
                  conseguenze={[d.restaFile]}
                  azione={async () => {
                    const esito = await togliContrattoVendita({ sale_id: saleId })
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
