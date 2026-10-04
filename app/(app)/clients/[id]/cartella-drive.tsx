'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, FolderOpen, LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
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
import { cartellaDriveSchema, type CartellaDriveInput } from '@/lib/validation/cartella'

/**
 * The client's Google Drive folder (Dany, 04/10/2026), admin only: open it,
 * add or change the link, take it away. The folder on Drive is never touched.
 */
export function CartellaDrive({ clientId, cliente, url }: { clientId: string; cliente: string; url: string | null }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CartellaDriveInput>({
    resolver: zodResolver(cartellaDriveSchema),
    defaultValues: { client_id: clientId, url: url ?? '' },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
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
                Su Drive: tasto destro sulla cartella › Condividi › Copia link.
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
