'use client'

import { ImageUp, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { fotoGoogle, salvaProfilo } from '@/app/(app)/account/actions'
import { FotoProfilo } from '@/components/profilo/foto-profilo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

const LATO = 256

/** Square crop from the centre, 256 px, WebP where the browser can (Safari: JPEG). */
async function preparaFoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const lato = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = LATO
  canvas.height = LATO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, (bitmap.width - lato) / 2, (bitmap.height - lato) / 2, lato, lato, 0, 0, LATO, LATO)
  bitmap.close()
  const webp = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85))
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88))
  if (!jpeg) throw new Error('toBlob')
  return jpeg
}

export function ProfiloForm({ id, nome: nomeIniziale, foto: fotoIniziale }: { id: string; nome: string; foto: string | null }) {
  const [nome, setNome] = useState(nomeIniziale)
  const [foto, setFoto] = useState(fotoIniziale)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const file = useRef<HTMLInputElement>(null)

  function salva(nuova: { nome?: string; foto?: string | null }, messaggio: string, dopo?: () => Promise<void>) {
    setErrore(null)
    avvia(async () => {
      const esito = await salvaProfilo({ nome: nuova.nome ?? nome, foto_url: nuova.foto === undefined ? foto : nuova.foto })
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      if (nuova.foto !== undefined) setFoto(nuova.foto)
      toast.success(messaggio)
      await dopo?.()
    })
  }

  /** Only the current photo stays in the person's folder. */
  async function pulisciCartella(tenere: string | null) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('avatari').list(id)
    const vecchie = (data ?? []).map((f) => `${id}/${f.name}`).filter((percorso) => !tenere?.endsWith(percorso))
    if (vecchie.length > 0) await supabase.storage.from('avatari').remove(vecchie)
  }

  async function carica(scelto: File) {
    setErrore(null)
    if (!scelto.type.startsWith('image/')) return setErrore('Scegli un’immagine (JPG, PNG o WebP).')
    if (scelto.size > 15 * 1024 * 1024) return setErrore('Immagine troppo grande: al massimo 15 MB.')
    avvia(async () => {
      try {
        const blob = await preparaFoto(scelto)
        const estensione = blob.type === 'image/webp' ? 'webp' : 'jpg'
        const percorso = `${id}/${crypto.randomUUID()}.${estensione}`
        const supabase = createClient()
        const { error } = await supabase.storage.from('avatari').upload(percorso, blob, { contentType: blob.type })
        if (error) {
          setErrore('Foto non caricata. Riprova.')
          return
        }
        const url = supabase.storage.from('avatari').getPublicUrl(percorso).data.publicUrl
        salva({ foto: url }, 'Foto aggiornata', () => pulisciCartella(url))
      } catch {
        setErrore('Non riesco a leggere questa immagine. Provane un’altra.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-4">
        <FotoProfilo nome={nome} foto={foto} className="size-20 text-lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            aria-label="Scegli una foto"
            onChange={(e) => {
              const scelto = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (scelto) void carica(scelto)
            }}
          />
          <Button type="button" className="h-11" disabled={inCorso} onClick={() => file.current?.click()}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ImageUp className="size-4" aria-hidden="true" />}
            Carica una foto
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={inCorso}
            onClick={() =>
              avvia(async () => {
                const google = await fotoGoogle()
                if (!google) {
                  setErrore('Il tuo account Google non ha una foto.')
                  return
                }
                salva({ foto: google }, 'Ora usi la foto di Google', () => pulisciCartella(null))
              })
            }
          >
            Usa la foto di Google
          </Button>
          {foto ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 text-muted-foreground"
              disabled={inCorso}
              onClick={() => salva({ foto: null }, 'Foto tolta', () => pulisciCartella(null))}
            >
              Togli la foto
            </Button>
          ) : null}
        </div>
      </section>

      <form
        className="max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          salva({ nome }, 'Nome aggiornato')
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="profilo-nome">Nome visibile al team</Label>
          <Input id="profilo-nome" className="h-11" value={nome} maxLength={80} onChange={(e) => setNome(e.currentTarget.value)} />
        </div>
        <Button type="submit" variant="outline" className="h-11" disabled={inCorso || nome.trim() === nomeIniziale}>
          Salva il nome
        </Button>
      </form>

      {errore ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
    </div>
  )
}
