import { LimiteRaggiunto, alfireConfigurata, trascrivi } from '@/lib/alfire/config'
import { getProfilo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Under Vercel's 4.5 MB body limit: about two minutes of compressed speech. */
const DIMENSIONE_MAX = 4 * 1024 * 1024

/** A voice message becomes text; the audio is not kept anywhere. */
export async function POST(req: Request) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return Response.json({ errore: 'Sessione scaduta. Rientra e riprova.' }, { status: 401 })
  }
  if (!alfireConfigurata()) {
    return Response.json({ errore: 'Alfire non è ancora configurata.' }, { status: 503 })
  }

  let audio: File | null = null
  try {
    const dati = await req.formData()
    const voce = dati.get('audio')
    audio = voce instanceof File ? voce : null
  } catch {
    audio = null
  }
  if (!audio || audio.size === 0) return Response.json({ errore: 'Nessun audio ricevuto.' }, { status: 400 })
  if (audio.size > DIMENSIONE_MAX) {
    return Response.json({ errore: 'Messaggio vocale troppo lungo: resta sotto i due minuti.' }, { status: 413 })
  }

  try {
    const testo = await trascrivi(audio, audio.name || 'voce.webm')
    if (!testo) return Response.json({ errore: 'Non ho sentito niente. Riprova più vicino al microfono.' }, { status: 422 })
    return Response.json({ testo })
  } catch (e) {
    if (e instanceof LimiteRaggiunto) {
      return Response.json({ errore: 'Limite gratuito della voce raggiunto. Riprova tra poco o scrivi.' }, { status: 429 })
    }
    return Response.json({ errore: 'Trascrizione non riuscita. Riprova.' }, { status: 502 })
  }
}
